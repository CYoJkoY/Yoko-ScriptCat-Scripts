import { VF_REGEX, VF_TOKEN_START } from "../config";
import type { EngineState } from "../state";
import type { ElementFactory } from "./code-blocks";

export interface ChatCapsuleDeps {
  el: ElementFactory;
  withSelfMutation: <T>(task: () => T) => T;
  state: EngineState;
  isUserTurn: (turnElement: unknown) => boolean;
}

export interface ChatCapsuleUtils {
  collapseInChatFileBlocks(turnElement: Element): void;
}

export function createChatCapsuleUtils(
  deps: ChatCapsuleDeps,
): ChatCapsuleUtils {
  const { el, withSelfMutation, state } = deps;
  const isUserTurn = deps.isUserTurn;
  const processedUserTurns = new WeakSet<Element>();
  const virtualFileChatRows = new WeakMap<Element, HTMLElement>();
function mountVirtualFileCapsuleOutsideTurn(
  turnElement: unknown,
  pill: HTMLElement | null,
): HTMLElement | null {
  if (!(turnElement instanceof Element) || !pill) {
    return null;
  }

  const parent = turnElement.parentElement;

  if (!parent) {
    return null;
  }

  const previousRow = virtualFileChatRows.get(turnElement);

  if (previousRow?.isConnected) {
    previousRow.remove();
  }

  const row = el(
    "div",
    {
      className: "ai-turbo-chat-file-row",
      role: "group",
      "aria-label": "虚拟文件",
    },
    [pill],
  );

  /*
   * 关键：
   * 不再把 pill 插入 bubble 内部。
   * 而是把它作为 turnElement 的同级节点，
   * 并放在消息气泡之前。
   */
  parent.insertBefore(row, turnElement);

  virtualFileChatRows.set(turnElement, row);

  return row;
}

// 修复问题(2)：保留并醒目呈现用户原本的提问文本，将大文件精准收纳为小胶囊
function collapseInChatFileBlocks(turnElement: Element): void {
  if (!state.virtualFileEnabled || !isUserTurn(turnElement)) {
    return;
  }

  const existingRow = virtualFileChatRows.get(turnElement);

  if (processedUserTurns.has(turnElement) && existingRow?.isConnected) {
    return;
  }

  /*
   * 宿主网站 SPA 重绘后，原来的外置节点可能已经被移除。
   * 这种情况下允许重新挂载。
   */
  if (!existingRow?.isConnected) {
    processedUserTurns.delete(turnElement);
    virtualFileChatRows.delete(turnElement);
  }

  const walker = document.createTreeWalker(turnElement, NodeFilter.SHOW_TEXT);

  let targetTextNode: Text | null = null;
  while (walker.nextNode()) {
    const currentNode = walker.currentNode;
    if (
      currentNode.nodeType === Node.TEXT_NODE &&
      currentNode.nodeValue !== null &&
      currentNode.nodeValue.includes(VF_TOKEN_START)
    ) {
      targetTextNode = currentNode instanceof Text ? currentNode : null;
      break;
    }
  }

  if (!targetTextNode) return;

  const codeBlockElem: Element | null =
    targetTextNode.parentElement?.closest("pre, code-block") ?? null;

  // 智能定位待折叠宿主元素
  let containerBlock: Element | null = codeBlockElem;
  if (!containerBlock) {
    let cur: Element | null = targetTextNode.parentElement;
    while (cur && cur !== turnElement) {
      const tag = cur.tagName.toLowerCase();
      if (
        ["p", "div", "pre", "code-block"].includes(tag) ||
        cur.classList.contains("query-text") ||
        cur.classList.contains("user-query-text")
      ) {
        containerBlock = cur;
        break;
      }
      cur = cur.parentElement;
    }
  }
  if (!containerBlock) {
    containerBlock = targetTextNode.parentElement;
  }
  if (!(containerBlock instanceof HTMLElement)) return;
  const hostBlock: HTMLElement = containerBlock;

  const fullRawText = hostBlock.textContent || "";
  const startIndex = fullRawText.indexOf(VF_TOKEN_START);
  if (startIndex === -1) return;

  const match = fullRawText.match(VF_REGEX);
  if (!match) return;

  const fileName = (match[1] ?? "").trim();
  const lineCount = parseInt(match[2] ?? "0", 10) || 0;
  const sizeBytes = parseInt(match[3] ?? "0", 10) || 0;
  const kbSize = (sizeBytes / 1024).toFixed(1);
  const metaInfo = `${lineCount.toLocaleString()} 行 · ${kbSize} KB`;

  // 提取用户真实提问 Prompt
  let userPrompt = fullRawText.slice(0, startIndex);
  userPrompt = userPrompt.replace(/```[a-z]*\s*$/i, "").trim();
  if (
    userPrompt === "请查阅并分析以下文本内容：" ||
    userPrompt === "请查阅以下文本："
  ) {
    userPrompt = "";
  }

  // 检查是否有前序兄弟节点已经独立呈现了该提问
  let promptAlreadyVisible = false;
  let prev = hostBlock.previousElementSibling;
  while (prev) {
    if (prev.textContent && prev.textContent.trim().length > 0) {
      promptAlreadyVisible = true;
      break;
    }
    prev = prev.previousElementSibling;
  }

  const pill = withSelfMutation(() => {
    let isExpanded = false;
    const toggleBtn = el(
      "button",
      {
        type: "button",
        style:
          "background:rgba(255,255,255,0.08);border:1px solid rgba(148,163,184,0.25);color:#cbd5e1;padding:3px 12px;border-radius:999px;font:11px sans-serif;cursor:pointer;margin-left:auto;transition:all 0.15s ease;",
      },
      ["展开查看文本"],
    );

    const capsule = el(
      "div",
      {
        className: "ai-turbo-chat-capsule",
        style:
          "display:inline-flex;align-items:center;gap:8px;padding:6px 14px;background:rgba(18,24,38,0.95);border:1px solid rgba(52,211,153,0.45);border-radius:9999px;box-shadow:0 2px 10px rgba(0,0,0,0.3);user-select:none;max-width:100%;box-sizing:border-box;margin:6px 0 10px;",
      },
      [
        el("span", { style: "font-size:14px;line-height:1;" }, ["📄"]),
        el(
          "span",
          {
            style:
              "font:600 12px ui-monospace,monospace;color:#f1f5f9;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
          },
          [fileName],
        ),
        el(
          "span",
          {
            style:
              "font:10px ui-monospace;background:rgba(52,211,153,0.15);color:#34d399;padding:2px 6px;border-radius:4px;",
          },
          [metaInfo],
        ),
        toggleBtn,
      ],
    );

    // 将原大文本容器隔离脱水
    hostBlock.classList.add("ai-turbo-chat-folded-target");
    hostBlock.style.setProperty("display", "none", "important");
    hostBlock.style.setProperty("contain", "strict", "important");

    toggleBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      isExpanded = !isExpanded;
      toggleBtn.textContent = isExpanded ? "收起文本" : "展开查看文本";
      if (isExpanded) {
        hostBlock.style.setProperty("display", "block", "important");
        hostBlock.style.setProperty("max-height", "320px", "important");
        hostBlock.style.setProperty("overflow", "auto", "important");
      } else {
        hostBlock.style.setProperty("display", "none", "important");
      }
    });

    // 若原容器内包含用户提问且无前序元素展示，独立保留用户真实提问
    if (!promptAlreadyVisible && userPrompt) {
      const promptElem = el(
        "div",
        {
          className: "ai-turbo-chat-user-prompt",
          style:
            "margin-bottom:8px!important;white-space:pre-wrap!important;word-break:break-word!important;font:inherit!important;color:inherit!important;line-height:1.5!important;",
        },
        [userPrompt],
      );

      hostBlock.insertAdjacentElement("beforebegin", promptElem);
    }

    return capsule;
  });

  const mountedRow = mountVirtualFileCapsuleOutsideTurn(turnElement, pill);

  if (mountedRow) {
    processedUserTurns.add(turnElement);
  }
}
  return { collapseInChatFileBlocks };
}
