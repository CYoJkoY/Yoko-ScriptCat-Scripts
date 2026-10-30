import {
  HANDOFF_STORAGE_KEY,
  PLAIN_HANDOFF_END,
  PLAIN_HANDOFF_SECTIONS,
  PLAIN_HANDOFF_START,
  PLAIN_HANDOFF_TOLERANCE,
  type PlatformDefinition,
} from "../config";
import { isEngineDormant } from "./auth";
import type { ComposerUtils } from "./composer";
import { reportRecoverableError } from "./diagnostics";
import type { SendInterceptUtils } from "./send";
import { isObjectRecord } from "../storage/reasoning-memory";
import { isReasoningElement } from "./text";
import type { createTurnUtils } from "./turns";

export interface HandoffPackage {
  kind: "plain" | "yaml";
  text: string;
}

type TurnUtils = ReturnType<typeof createTurnUtils>;

export interface HandoffDeps {
  currentPlatform: PlatformDefinition;
  composer: ComposerUtils;
  sendIntercept: SendInterceptUtils;
  turns: Pick<TurnUtils, "getTurns" | "extractTurnText" | "getTurnRole">;
  isSubmitting: () => boolean;
  setSubmitting: (value: boolean) => void;
}

export interface HandoffUtils {
  attachStatusNode(node: HTMLElement | null): void;
  setHandoffStatus(message: string): void;
  exportCleanContext(onSuccess: (count: number) => void): void;
  startOneClickHandoff(): void;
  resumePendingHandoffPrompt(): void;
  prepareNewConversationFromYaml(): void;
  clearResumeTimer(): void;
}

export function createHandoffUtils(deps: HandoffDeps): HandoffUtils {
  const {
    currentPlatform,
    composer,
    sendIntercept,
    setSubmitting,
  } = deps;
  const { getTurns, extractTurnText, getTurnRole } = deps.turns;
  const isSubmitting = deps.isSubmitting;

  let handoffStatusNode: HTMLElement | null = null;
  let handoffResumeTimer: ReturnType<typeof setInterval> | null = null;

  function attachStatusNode(node: HTMLElement | null): void {
    handoffStatusNode = node;
  }

  function exportCleanContext(onSuccess: (count: number) => void): void {
    const turns = getTurns();
    if (!turns.length) {
      window.alert("未检测到有效对话内容");
      return;
    }

    const sections: string[] = [];
    turns.forEach((turnElement, index) => {
      const contentText = extractTurnText(turnElement);
      if (contentText) {
        const role = getTurnRole(turnElement) === "user" ? "用户" : "助手";
        sections.push(`### ${role} · Message ${index + 1}\n\n${contentText}`);
      }
    });

    if (!sections.length) {
      window.alert("当前页面没有可提取的文本");
      return;
    }

    const markdown = [
      `# 会话上下文提取 [${currentPlatform.name}]`,
      "",
      `> 提取时间: ${new Date().toLocaleString()}`,
      "",
      sections.join("\n\n---\n\n"),
      "",
    ].join("\n");

    navigator.clipboard
      .writeText(markdown)
      .then(() => {
        if (typeof onSuccess === "function") onSuccess(sections.length);
      })
      .catch(() => {
        window.alert("写入剪贴板失败，请检查浏览器权限。");
      });
  }

  function buildHandoffGenerationPrompt() {
    return [
      "请对本次对话做一次完整复盘，然后严格按照下面的纯文本格式输出交接包。",
      "严格规则：",
      "1. 不要使用 Markdown 代码块，不要添加任何解释、客套话或标题。",
      "2. 从 [META] 开始，到 [END] 结束；顺序不得调整。",
      "3. 每个字段形如 `字段名: 内容`；内容如有多项，用 | 分隔；没有内容的字段写「无」。",
      "4. 信息必须准确、自包含，不要编造。内容尽量精炼。",
      "",
      "[META]",
      "version: 1.0",
      "generated_at: <当前时间>",
      "source_model: <模型名>",
      "language: zh-CN",
      "",
      "[TASK]",
      "objective: <任务目标，一句话>",
      "success_criteria: <成功标准>",
      "current_status: <当前状态>",
      "",
      "[DECISIONS]",
      "confirmed: <已确认决策>",
      "rejected: <已否决方案>",
      "assumptions: <关键假设>",
      "",
      "[PROGRESS]",
      "done: <已完成事项>",
      "in_progress: <进行中事项>",
      "next_actions: <下一步行动>",
      "",
      "[ROLE]",
      "persona: <角色设定>",
      "tone: <语气风格>",
      "response_format: <回复格式>",
      "boundaries: <边界>",
      "",
      "[CONTEXT]",
      "tools: <工具>",
      "tech_stack: <技术栈>",
      "files: <文件>",
      "data: <数据>",
      "constraints: <约束>",
      "",
      "[OPEN_ISSUES]",
      "questions: <待确认问题>",
      "risks: <风险>",
      "blockers: <阻碍>",
      "",
      "[KEY_ENTITIES]",
      "people: <人物>",
      "projects: <项目>",
      "terms: <术语>",
      "",
      "[HANDOFF_NOTES]",
      "<自由补充信息>",
      "",
      "[END]",
    ].join("\n");
  }

  function buildHandoffRestorePrompt(
    handoffText: unknown,
    kind: "plain" | "yaml" = "plain",
  ): string {
    const intro = [
      "你将接收一份「上下文交接包」，用于恢复此前会话的工作状态。请按以下步骤操作：",
      "",
      "1. 直接读取下面交接包的全部字段（这是纯文本格式，不是代码，无需当作代码解析）。",
      "2. 用简短摘要确认：任务目标 / 当前状态 / 已确认决策 / 已排除方案 / 下一步 / 你的角色。",
      "3. 确认后直接进入该角色，从 [PROGRESS].next_actions 的第一项开始继续工作，不要重新询问已有信息。",
      "4. 若 [OPEN_ISSUES].questions 非空，先按优先级列出并询问先处理哪一个；否则直接执行下一步。",
      "5. 字段值为「无」或空时表示该项无内容，不要追问。",
      "",
    ];
    if (kind === "yaml") {
      intro.push(
        "（注：以下是旧版 YAML 交接包，可直接当作纯文本阅读，无需严格 YAML 解析。）",
      );
      intro.push("");
    }
    intro.push("===== 交接包开始 =====");
    intro.push(String(handoffText || "").trim());
    intro.push("===== 交接包结束 =====");
    return intro.join("\n");
  }

  function getComposerText(inputElement: HTMLElement | null): string {
    if (
      inputElement instanceof HTMLTextAreaElement ||
      inputElement instanceof HTMLInputElement
    ) {
      return inputElement.value || "";
    }
    return inputElement?.innerText || inputElement?.textContent || "";
  }

  function setHandoffStatus(message: string): void {
    if (handoffStatusNode) handoffStatusNode.textContent = message;
  }

  function isHandoffYamlShape(yamlText: unknown): boolean {
    const yaml = String(yamlText || "").trim();
    if (!yaml.startsWith("meta:")) return false;
    const requiredSections = [
      "meta",
      "task",
      "decisions",
      "progress",
      "role",
      "context",
      "open_issues",
      "key_entities",
      "handoff_notes",
    ];
    return requiredSections.every((section) =>
      new RegExp("^" + section + ":\\s*$", "m").test(yaml),
    );
  }

  function isPlainHandoffShape(text: unknown): boolean {
    const t = String(text || "").trim();
    if (!t.includes(PLAIN_HANDOFF_START)) return false;
    if (!t.includes(PLAIN_HANDOFF_END)) return false;
    const hitCount = PLAIN_HANDOFF_SECTIONS.filter((s) => t.includes(s)).length;
    return hitCount >= PLAIN_HANDOFF_SECTIONS.length - PLAIN_HANDOFF_TOLERANCE;
  }

  function normalizePlainHandoff(candidate: unknown): string | null {
    if (!candidate) return null;
    const text = String(candidate)
      .trim()
      .replace(/^```(?:yaml|yml|txt|text|markdown|md|plain)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    return isPlainHandoffShape(text) ? text : null;
  }

  function normalizeHandoffYaml(candidate: unknown): string | null {
    if (!candidate) return null;
    const yaml = String(candidate)
      .trim()
      .replace(/^```(?:yaml|yml)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    return isHandoffYamlShape(yaml) ? yaml : null;
  }

  function extractLatestHandoffText(): HandoffPackage | null {
    const turns = getTurns();
    let latestAssistantTurn = null;

    for (let index = turns.length - 1; index >= 0; index--) {
      if (getTurnRole(turns[index]) === "assistant") {
        latestAssistantTurn = turns[index];
        break;
      }
    }
    if (!latestAssistantTurn) return null;

    // 1) 优先检查代码块（有些平台仍会自动包裹，即使要求不用）
    const codeElements = Array.from(
      latestAssistantTurn.querySelectorAll("pre code, pre, code, code-block"),
    );
    for (const codeElement of codeElements) {
      if (isReasoningElement(codeElement)) continue;
      const codeText = codeElement.textContent || "";
      const plain = normalizePlainHandoff(codeText);
      if (plain) return { kind: "plain", text: plain };
      const yaml = normalizeHandoffYaml(codeText);
      if (yaml) return { kind: "yaml", text: yaml };
    }

    // 2) 完整消息文本（先按 fenced 代码块切，再做整体兜底）
    const fullText = extractTurnText(latestAssistantTurn);

    const fencedMatches = Array.from(
      fullText.matchAll(
        /```(?:yaml|yml|txt|text|markdown|md)?\s*([\s\S]*?)\s*```/gi,
      ),
    );
    for (const match of fencedMatches) {
      const plain = normalizePlainHandoff(match[1]);
      if (plain) return { kind: "plain", text: plain };
      const yaml = normalizeHandoffYaml(match[1]);
      if (yaml) return { kind: "yaml", text: yaml };
    }

    // 3) 整体文本兜底（处理 AI 直接把标记铺在消息里、没有任何代码块的情况）
    const plain = normalizePlainHandoff(fullText);
    if (plain) return { kind: "plain", text: plain };
    const yaml = normalizeHandoffYaml(fullText);
    if (yaml) return { kind: "yaml", text: yaml };

    return null;
  }

  function findNewChatControl(): HTMLElement | null {
    const selectors = [
      'button[data-testid*="new-chat" i]',
      'button[data-testid*="new_chat" i]',
      'button[data-testid*="new-conversation" i]',
      '[role="button"][data-testid*="new-chat" i]',
      'button[aria-label*="new chat" i]',
      'button[aria-label*="new conversation" i]',
      'button[aria-label*="start new chat" i]',
      'a[aria-label*="new chat" i]',
      'button[title*="new chat" i]',
      'button[title*="new conversation" i]',
      'button[aria-label*="新建对话"]',
      'button[aria-label*="新对话"]',
      'button[aria-label*="新建聊天"]',
      'button[title*="新建对话"]',
      'button[title*="新对话"]',
      'a[aria-label*="新对话"]',
    ];

    for (const selector of selectors) {
      let controls: Element[] = [];
      try {
        controls = Array.from(document.querySelectorAll(selector));
      } catch (error: unknown) {
        reportRecoverableError("query new chat control", error);
      }
      const found = controls.find(
        (control): control is HTMLElement =>
          control instanceof HTMLElement &&
          control.isConnected &&
          control.getAttribute("target") !== "_blank" &&
          (control.offsetParent !== null ||
            control.getClientRects().length > 0),
      );
      if (found) return found;
    }

    const exactLabels = new Set([
      "new chat",
      "new conversation",
      "new thread",
      "start new chat",
      "新建对话",
      "新对话",
      "新建聊天",
      "开始新对话",
      "开启新对话",
    ]);
    const labeledControl = Array.from(
      document.querySelectorAll("button, a, [role='button']"),
    ).find((control): control is HTMLElement => {
          if (
            !(control instanceof HTMLElement) ||
            !control.isConnected ||
            control.getAttribute("target") === "_blank" ||
            !(
              control.offsetParent !== null ||
              control.getClientRects().length > 0
            )
          ) {
            return false;
          }
          const label = [
            control.getAttribute("aria-label") || "",
            control.getAttribute("title") || "",
            control.innerText || control.textContent || "",
          ]
            .join(" ")
            .trim()
            .toLowerCase();
          return exactLabels.has(label);
        });
    return labeledControl ?? null;
  }

  function resumePendingHandoffPrompt(): void {
    if (isEngineDormant()) return;
    if (handoffResumeTimer !== null) {
      window.clearInterval(handoffResumeTimer);
    }
    handoffResumeTimer = null;
    let attempts = 0;
    const timer = window.setInterval(() => {
      if (isEngineDormant()) {
        window.clearInterval(timer);
        if (handoffResumeTimer === timer) handoffResumeTimer = null;
        return;
      }
      let pending: unknown = null;
      try {
        pending = JSON.parse(
          sessionStorage.getItem(HANDOFF_STORAGE_KEY) || "null",
        );
      } catch (error: unknown) {
        reportRecoverableError("read pending handoff", error);
      }
      if (!isObjectRecord(pending) || typeof pending["text"] !== "string") {
        window.clearInterval(timer);
        return;
      }
      const pendingText = pending["text"];
      const pendingCreatedAt = pending["createdAt"];
      const pendingSourceUrl = pending["sourceUrl"];
      const pendingSourceTurns = pending["sourceTurns"];
      if (
        typeof pendingText !== "string" ||
        typeof pendingSourceUrl !== "string" ||
        typeof pendingSourceTurns !== "number"
      ) {
        window.clearInterval(timer);
        return;
      }

      const createdAt =
        typeof pendingCreatedAt === "number" ? pendingCreatedAt : 0;
      if (Date.now() - createdAt > 5 * 60 * 1000) {
        sessionStorage.removeItem(HANDOFF_STORAGE_KEY);
        window.clearInterval(timer);
        return;
      }

      const currentTurns = getTurns().length;
      const isNewConversation =
        window.location.href !== pendingSourceUrl ||
        (pendingSourceTurns > 0 && currentTurns === 0);
      attempts++;

      if (isNewConversation) {
        const input = composer.getChatInput();
        if (input) {
          if (getComposerText(input).trim()) {
            navigator.clipboard
              .writeText(pendingText)
              .then(() => {
                setHandoffStatus(
                  "新对话输入框已有草稿，恢复指令已复制到剪贴板。",
                );
                window.alert(
                  "新对话输入框已有未发送内容。为避免覆盖草稿，已将恢复指令复制到剪贴板，请手动粘贴。",
                );
              })
              .catch(() => {
                window.alert(
                  "无法覆盖新对话中的已有草稿。请保留草稿后手动粘贴恢复指令。",
                );
              });
          } else {
            composer.insertTextAtomic(input, pendingText);
            input.focus();
            setHandoffStatus("恢复指令已填入新对话；检查 YAML 后手动发送。");
          }
          sessionStorage.removeItem(HANDOFF_STORAGE_KEY);
          window.clearInterval(timer);
          return;
        }
      }

      if (attempts >= 120) {
        sessionStorage.removeItem(HANDOFF_STORAGE_KEY);
        window.clearInterval(timer);
        navigator.clipboard
          .writeText(pendingText)
          .then(() => {
            setHandoffStatus("未识别到新对话输入框，恢复指令已复制到剪贴板。");
            window.alert(
              "未能可靠识别新对话输入框。完整恢复指令已复制，请手动打开新对话并粘贴。",
            );
          })
          .catch(() => {
            window.alert(
              "未能识别新对话输入框，也无法写入剪贴板。请回到原回答手动复制 YAML。",
            );
          });
      }
    }, 250);
    handoffResumeTimer = timer;
  }

  function copyHandoffFallback(
    text: string,
    statusMessage: string,
    alertMessage: string,
  ): void {
    const done = (ok: boolean): void => {
      setHandoffStatus(
        ok ? statusMessage : `${statusMessage}（写入剪贴板失败，请手动复制）`,
      );
      if (alertMessage) {
        window.alert(
          ok
            ? alertMessage
            : "无法写入剪贴板。请检查浏览器权限，或手动选择对应内容后重试。",
        );
      }
    };
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      navigator.clipboard
        .writeText(text)
        .then(() => done(true))
        .catch(() => done(false));
    } catch (error: unknown) {
      reportRecoverableError("write clipboard", error);
      done(false);
    }
  }

  function startOneClickHandoff(): void {
    if (isEngineDormant()) return;
    if (isSubmitting()) return;

    // 已有现成交接包：直接进入恢复流程
    const existing = extractLatestHandoffText();
    if (existing) {
      proceedOneClickHandoff(existing);
      return;
    }

    const prompt = buildHandoffGenerationPrompt();
    const input = composer.getChatInput();

    if (!input) {
      copyHandoffFallback(
        prompt,
        "未识别输入框，生成指令已复制到剪贴板。",
        "未识别到当前网站的输入框。生成指令已复制，请手动粘贴并发送。",
      );
      return;
    }

    if (getComposerText(input).trim()) {
      copyHandoffFallback(
        prompt,
        "输入框有草稿，生成指令已复制到剪贴板。",
        "当前输入框已有未发送内容。为避免覆盖草稿，生成指令已复制，请先处理现有草稿，再手动粘贴发送。",
      );
      return;
    }

    composer.insertTextAtomic(input, prompt);
    setHandoffStatus("已填入交接指令，正在发送……");
    const baselineTurns = getTurns().length;
    setSubmitting(true);

    sendIntercept.sendWithRetry(input, (sent) => {
      setSubmitting(false);

      if (!sent) {
        copyHandoffFallback(
          prompt,
          "发送未确认，生成指令已复制到剪贴板。",
          "未能确认发送成功。生成指令已复制，请手动粘贴发送。",
        );
        return;
      }

      setHandoffStatus("已发送交接指令；等待 AI 生成交接包……");
      waitForHandoffPackage(baselineTurns, prompt);
    });
  }

  function waitForHandoffPackage(
    baselineTurns: number,
    prompt: string,
  ): void {
    const startedAt = Date.now();
    const TIMEOUT_MS = 180000; // 3 分钟

    const timer = window.setInterval(() => {
      if (isEngineDormant()) {
        window.clearInterval(timer);
        return;
      }
      // 避免在助手消息尚未出现（旧回答仍是最新）时误判为已生成
      if (getTurns().length <= baselineTurns) {
        if (Date.now() - startedAt > TIMEOUT_MS) {
          window.clearInterval(timer);
          copyHandoffFallback(
            prompt,
            "等待交接包超时，生成指令已复制到剪贴板。",
            "等待 AI 生成交接包超时。生成指令已复制，可手动重新执行。",
          );
        }
        return;
      }

      const result = extractLatestHandoffText();
      if (result) {
        window.clearInterval(timer);
        setHandoffStatus("已检测到交接包，正在准备新对话……");
        proceedOneClickHandoff(result);
        return;
      }

      if (Date.now() - startedAt > TIMEOUT_MS) {
        window.clearInterval(timer);
        copyHandoffFallback(
          prompt,
          "等待交接包超时，生成指令已复制到剪贴板。",
          "等待 AI 生成交接包超时。生成指令已复制，可手动重新执行。",
        );
      }
    }, 600);
  }

  function proceedOneClickHandoff(result: HandoffPackage): void {
    if (isEngineDormant()) return;
    const restoreText = buildHandoffRestorePrompt(result.text, result.kind);
    const newChatControl = findNewChatControl();

    if (!newChatControl) {
      copyHandoffFallback(
        restoreText,
        "未识别新对话入口，恢复指令已复制到剪贴板。",
        "未识别到新对话按钮。完整恢复指令已复制，请手动打开新对话并粘贴。",
      );
      return;
    }

    try {
      sessionStorage.setItem(
        HANDOFF_STORAGE_KEY,
        JSON.stringify({
          text: restoreText,
          createdAt: Date.now(),
          sourceUrl: window.location.href,
          sourceTurns: getTurns().length,
        }),
      );
    } catch (error: unknown) {
      console.warn("[AI Turbo] Failed to persist handoff state", error);
      copyHandoffFallback(
        restoreText,
        "无法暂存恢复状态，恢复指令已复制到剪贴板。",
        "无法暂存跨页面恢复状态。完整恢复指令已复制，请手动打开新对话并粘贴。",
      );
      return;
    }

    setHandoffStatus("正在打开新对话并准备填入恢复指令……");
    newChatControl.click();
    resumePendingHandoffPrompt();
  }

  function prepareNewConversationFromYaml() {
    if (isEngineDormant()) return;
    const result = extractLatestHandoffText();
    if (!result) {
      window.alert(
        "未在最近的助手回答中找到可识别的交接包。\n\n" +
          "请等待回答完整结束后重试。\n\n" +
          "若 AI 未按格式输出，可点击「发送 YAML 交接指令」重新生成。",
      );
      setHandoffStatus("尚未检测到完整交接包。");
      return;
    }

    const restoreText = buildHandoffRestorePrompt(result.text, result.kind);
    const newChatControl = findNewChatControl();

    if (!newChatControl) {
      navigator.clipboard
        .writeText(restoreText)
        .then(() => {
          setHandoffStatus("未识别新对话入口；完整恢复指令已复制。");
          window.alert(
            "已提取交接包并复制完整恢复指令。此网站的新对话按钮未能可靠识别，请手动打开新对话并粘贴。",
          );
        })
        .catch(() => {
          window.alert(
            "已找到交接包，但无法识别新对话入口或写入剪贴板。请手动复制交接包后恢复。",
          );
        });
      return;
    }

    try {
      sessionStorage.setItem(
        HANDOFF_STORAGE_KEY,
        JSON.stringify({
          text: restoreText,
          createdAt: Date.now(),
          sourceUrl: window.location.href,
          sourceTurns: getTurns().length,
        }),
      );
    } catch (error: unknown) {
      console.warn("[AI Turbo] Failed to persist handoff state", error);
      navigator.clipboard
        .writeText(restoreText)
        .then(() => {
          window.alert(
            "无法暂存跨页面恢复状态，已复制完整恢复指令，请手动打开新对话并粘贴。",
          );
        })
        .catch(() => {
          window.alert("无法暂存或复制恢复指令，请手动复制交接包。");
        });
      return;
    }

    setHandoffStatus("已识别交接包，正在打开新对话并准备填入恢复指令……");
    newChatControl.click();
    resumePendingHandoffPrompt();
  }
  function clearResumeTimer(): void {
    if (handoffResumeTimer !== null) {
      window.clearInterval(handoffResumeTimer);
    }
    handoffResumeTimer = null;
  }

  return {
    attachStatusNode,
    setHandoffStatus,
    exportCleanContext,
    startOneClickHandoff,
    resumePendingHandoffPrompt,
    prepareNewConversationFromYaml,
    clearResumeTimer,
  };
}
