import { VF_TOKEN_END, VF_TOKEN_START } from "../config";
import type { EngineState } from "../state";
import type { ElementFactory } from "./code-blocks";
import { createUiIcon } from "./icons";
import { showTextPreview } from "./text-preview";

/** One virtual file recovered from a message that was already sent. */
export interface ChatVirtualFile {
  name: string;
  lineCount: number;
  sizeBytes: number;
  content: string;
}

/** Everything one sent message carries: the typed prompt plus its files. */
export interface ChatVirtualFileMessage {
  prompt: string;
  files: ChatVirtualFile[];
}

export interface ChatCapsuleDeps {
  el: ElementFactory;
  withSelfMutation: <T>(task: () => T) => T;
  state: EngineState;
}

export interface ChatCapsuleUtils {
  collapseInChatFileBlocks(turnElement: Element): void;
  /** Repair capsules after a platform re-render and drop orphans. */
  sweep(turns: readonly Element[]): void;
  reset(): void;
}

/** Prompts the engine writes itself when the composer had no text. */
const GENERIC_PROMPTS = new Set([
  "请查阅并分析以下文本内容：",
  "请查阅以下文本：",
]);

const BLOCK_TAGS = new Set([
  "P",
  "DIV",
  "PRE",
  "LI",
  "BLOCKQUOTE",
  "TD",
  "SECTION",
  "ARTICLE",
  "CODE-BLOCK",
]);

function escapePattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Built from the shared token constants so the header format stays in sync. */
function createTokenPattern(): RegExp {
  return new RegExp(
    `${escapePattern(VF_TOKEN_START)}([^|\\r\\n]+)\\|(\\d+)\\|(\\d+)${escapePattern(VF_TOKEN_END)}`,
    "g",
  );
}

/** A fence line that still carries the language the composer wrote. */
const FENCE_WITH_LANG_TAIL = /(?:^|\n)[ \t]*`{3,}[a-z0-9_-]+[ \t]*$/i;
/** A bare fence line, which is how every block is closed. */
const FENCE_TAIL = /(?:^|\n)[ \t]*`{3,}[ \t]*$/i;
/**
 * The opening fence after a host split the message into its own elements.
 * Inline text joined from those blocks loses the newline the composer wrote,
 * so the fence lands directly behind the prompt text.
 */
const FENCE_AFTER_PROMPT = /`{3,}[a-z0-9_-]+[ \t]*$/i;

function dropFenceLine(text: string, pattern: RegExp): string {
  const next = text.replace(pattern, "");
  return next === text ? text : next.replace(/[ \t]+$/, "");
}

/**
 * Remove the wrapper fences the composer writes around one payload.
 *
 * A message with several files closes one block and opens the next, so a
 * middle block ends with two fences: its own closing fence and the next
 * block's opening fence. Only that wrapper is dropped, so a payload that ends
 * with its own fence keeps it.
 */
function stripWrapper(raw: string, options: { nextBlock: boolean }): string {
  let text = raw.replace(/\r\n?/g, "\n").replace(/\s+$/, "");
  if (options.nextBlock) {
    text = dropFenceLine(text, FENCE_WITH_LANG_TAIL).replace(/\s+$/, "");
  }
  text = dropFenceLine(text, FENCE_TAIL);
  return text.replace(/^\n+/, "").replace(/\s+$/, "");
}

/**
 * Read every virtual file out of one message body.
 *
 * The scan is driven by the token markers instead of markdown fences: a
 * platform may render the fenced block as `<pre>`, as highlighted spans, or as
 * plain text, and the payload itself frequently contains fences.
 */
export function parseChatVirtualFileMessage(
  source: string,
): ChatVirtualFileMessage | null {
  if (!source || !source.includes(VF_TOKEN_START)) return null;

  const pattern = createTokenPattern();
  const headers: RegExpExecArray[] = [];
  let match = pattern.exec(source);
  while (match) {
    if (match[0]) headers.push(match);
    match = pattern.exec(source);
  }
  if (!headers.length) return null;

  const files: ChatVirtualFile[] = [];
  for (let index = 0; index < headers.length; index++) {
    const header = headers[index];
    const next = headers[index + 1];
    const bodyStart = header.index + header[0].length;
    files.push({
      name: (header[1] ?? "").trim() || "pasted_text.txt",
      lineCount: Number.parseInt(header[2] ?? "0", 10) || 0,
      sizeBytes: Number.parseInt(header[3] ?? "0", 10) || 0,
      content: stripWrapper(
        source.slice(bodyStart, next ? next.index : source.length),
        { nextBlock: Boolean(next) },
      ),
    });
  }

  const prompt = dropFenceLine(
    stripWrapper(source.slice(0, headers[0].index), { nextBlock: true }),
    FENCE_AFTER_PROMPT,
  ).trim();
  return {
    prompt: GENERIC_PROMPTS.has(prompt) ? "" : prompt,
    files,
  };
}

function isBlockContainer(element: Element): boolean {
  if (BLOCK_TAGS.has(element.tagName)) return true;
  return (
    element.classList.contains("query-text") ||
    element.classList.contains("user-query-text")
  );
}

/**
 * Innermost block that owns a token, for each token in the turn.
 *
 * The same user message can carry several files, and platforms differ in how
 * much markup they wrap around the fenced block, so each marker is resolved on
 * its own instead of assuming one shared container.
 */
function collectTokenContainers(turn: Element): HTMLElement[] {
  const containers: HTMLElement[] = [];
  const seen = new Set<Element>();
  const walker = document.createTreeWalker(turn, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    const value = node.nodeValue;
    if (value && value.includes(VF_TOKEN_START)) {
      let block: Element | null = node.parentElement;
      while (block && block !== turn && !isBlockContainer(block)) {
        block = block.parentElement;
      }
      const container = block ?? turn;
      if (container instanceof HTMLElement && !seen.has(container)) {
        seen.add(container);
        containers.push(container);
      }
    }
    node = walker.nextNode();
  }

  return containers;
}

/**
 * Serialize-free probe before the full message parse. The parser can only
 * match a token while it sits inside one text node, so walking text nodes
 * with an early exit finds every matchable turn without paying for a whole
 * subtree textContent serialization on turns that carry no token.
 */
function turnContainsVirtualFileToken(turn: Element): boolean {
  const walker = document.createTreeWalker(turn, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeValue?.includes(VF_TOKEN_START)) return true;
    node = walker.nextNode();
  }
  return false;
}

/** True when the turn still shows the prompt outside the hidden block. */
function turnShowsPrompt(
  turn: Element,
  prompt: string,
  hidden: readonly HTMLElement[],
): boolean {
  if (!prompt) return false;

  const probe = prompt.slice(0, 60);
  const walker = document.createTreeWalker(turn, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    const value = node.nodeValue;
    const parent = node.parentElement;
    if (value && parent && value.includes(probe)) {
      const insideHidden = hidden.some((node_) => node_.contains(parent));
      if (!insideHidden) return true;
    }
    node = walker.nextNode();
  }
  return false;
}

export function createChatCapsuleUtils(
  deps: ChatCapsuleDeps,
): ChatCapsuleUtils {
  const { el, withSelfMutation, state } = deps;

  interface CapsuleMount {
    row: HTMLElement;
    prompt: HTMLElement | null;
    hidden: HTMLElement[];
    fileCount: number;
    collapsed: boolean;
    expanded: boolean;
    toggle: HTMLButtonElement;
  }

  let mounts = new WeakMap<Element, CapsuleMount>();
  const trackedTurns = new Set<Element>();

  function detachMount(turn: Element): void {
    const mount = mounts.get(turn);
    trackedTurns.delete(turn);
    mounts.delete(turn);
    if (!mount) return;

    withSelfMutation(() => {
      mount.row.remove();
      if (mount.prompt?.isConnected) mount.prompt.remove();
      for (const node of mount.hidden) {
        if (node.isConnected) restoreContainer(node);
      }
    });
  }

  function restoreContainer(container: HTMLElement): void {
    container.classList.remove("ai-turbo-chat-folded-target");
    container.style.removeProperty("display");
    container.style.removeProperty("contain");
  }

  function isMountHealthy(mount: CapsuleMount): boolean {
    if (!mount.row.isConnected) return false;
    if (mount.expanded) {
      return (
        mount.row.classList.contains("is-expanded") &&
        mount.hidden.every(
          (node) =>
            node.isConnected &&
            node.classList.contains("ai-turbo-chat-folded-target") &&
            node.style.getPropertyValue("display") !== "none",
        )
      );
    }
    for (const node of mount.hidden) {
      if (!node.isConnected) return false;
      if (!node.classList.contains("ai-turbo-chat-folded-target")) {
        return false;
      }
      if (node.style.getPropertyValue("display") !== "none") return false;
    }
    return true;
  }

  /**
   * Switch one sent message between the file cards and its original text.
   * The raw markup is never rewritten: only the inline hiding applied to the
   * token containers is lifted, so switching back restores the exact same
   * message and the host keeps its own listeners.
   */
  function setExpanded(mount: CapsuleMount, expanded: boolean): void {
    if (mount.expanded === expanded) return;

    withSelfMutation(() => {
      mount.expanded = expanded;
      mount.row.classList.toggle("is-expanded", expanded);
      mount.toggle.textContent = expanded ? "收起为文件" : "展开原文";
      mount.toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
      mount.toggle.title = expanded
        ? "把这段消息折叠回虚拟文件"
        : "显示这段消息的原始文本";

      for (const node of mount.hidden) {
        if (!node.isConnected) continue;
        if (expanded) {
          node.style.removeProperty("display");
          node.style.removeProperty("contain");
          continue;
        }
        node.style.setProperty("display", "none", "important");
        node.style.setProperty("contain", "strict", "important");
      }

      if (mount.prompt) {
        if (expanded) mount.prompt.style.setProperty("display", "none", "important");
        else mount.prompt.style.removeProperty("display");
      }
    });
  }

  function syncRowVisibility(
    turn: Element,
    mount: CapsuleMount,
  ): void {
    const collapsed = turn.classList.contains("ai-turbo-dehydrated");
    if (mount.collapsed === collapsed) return;

    /*
     * 折叠用行内样式而不是样式表规则：宿主的脱水占位条会替换整轮内容，
     * 胶囊行必须同步隐藏，但隐藏状态只属于这一条挂载，不能写进全局 CSS。
     */
    withSelfMutation(() => {
      mount.collapsed = collapsed;
      if (collapsed) {
        mount.row.style.setProperty("display", "none", "important");
        return;
      }
      mount.row.style.removeProperty("display");
    });
  }

  function openPreview(
    turn: Element,
    index: number,
    fallback: ChatVirtualFile,
  ): void {
    const parsed = parseChatVirtualFileMessage(turn.textContent ?? "");
    const file = parsed?.files[index] ?? {
      name: fallback.name,
      lineCount: fallback.lineCount,
      sizeBytes: fallback.sizeBytes,
      content: "",
    };

    showTextPreview({
      el,
      name: file.name,
      meta: `${file.lineCount.toLocaleString("zh-CN")} 行 · ${(file.sizeBytes / 1024).toFixed(1)} KB`,
      content: file.content,
      note: file.content
        ? "来自你发送的消息"
        : "正文已不在页面中，重新打开这段对话后再试",
    });
  }

  function createCapsule(
    turn: Element,
    file: ChatVirtualFile,
    index: number,
  ): HTMLButtonElement {
    const metaInfo = `${file.lineCount.toLocaleString("zh-CN")} 行 · ${(file.sizeBytes / 1024).toFixed(1)} KB`;

    const capsule = el(
      "button",
      {
        type: "button",
        className: "ai-turbo-chat-capsule",
        title: `查看 ${file.name}`,
        "aria-label": `查看虚拟文件 ${file.name}，${metaInfo}`,
      },
      [
        el("span", { className: "ai-turbo-chat-capsule-icon" }, [
          createUiIcon("file", 13),
        ]),
        el("span", { className: "ai-turbo-chat-capsule-name" }, [file.name]),
        el("span", { className: "ai-turbo-chat-capsule-meta" }, [metaInfo]),
        el("span", { className: "ai-turbo-chat-capsule-action" }, ["查看"]),
      ],
    );

    capsule.addEventListener("click", (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      openPreview(turn, index, file);
    });

    return capsule;
  }

  function collapseInChatFileBlocks(turnElement: Element): void {
    if (!state.virtualFileEnabled) return;
    if (!(turnElement instanceof Element) || !turnElement.isConnected) return;

    const existing = mounts.get(turnElement);
    if (existing) {
      if (isMountHealthy(existing) && existing.fileCount > 0) {
        syncRowVisibility(turnElement, existing);
        return;
      }
      detachMount(turnElement);
    }

    if (!turnContainsVirtualFileToken(turnElement)) return;
    const parsed = parseChatVirtualFileMessage(turnElement.textContent ?? "");
    if (!parsed) return;
    if (!parsed.files.some((file) => file.content.length > 0)) return;

    const containers = collectTokenContainers(turnElement);
    if (!containers.length) return;

    const mount = withSelfMutation((): CapsuleMount => {
      for (const container of containers) {
        container.classList.add("ai-turbo-chat-folded-target");
        container.style.setProperty("display", "none", "important");
        container.style.setProperty("contain", "strict", "important");
      }

      const wholeTurnHidden = containers.includes(
        turnElement as HTMLElement,
      );
      const inlinePrompt =
        wholeTurnHidden ||
        (Boolean(parsed.prompt) &&
          !turnShowsPrompt(turnElement, parsed.prompt, containers));

      let promptNode: HTMLElement | null = null;
      if (inlinePrompt && !wholeTurnHidden) {
        promptNode = el("div", { className: "ai-turbo-chat-user-prompt" }, [
          parsed.prompt,
        ]);
        containers[0].insertAdjacentElement("beforebegin", promptNode);
      }

      const row = el("div", {
        className: "ai-turbo-chat-file-row",
        role: "group",
        "aria-label": "虚拟文件",
      });
      const stack = el("div", { className: "ai-turbo-chat-file-stack" });

      if (inlinePrompt && wholeTurnHidden) {
        stack.appendChild(
          el("div", { className: "ai-turbo-chat-user-prompt" }, [
            parsed.prompt,
          ]),
        );
      }

      parsed.files.forEach((file, index) => {
        stack.appendChild(createCapsule(turnElement, file, index));
      });

      const toggle = el("button", {
        type: "button",
        className: "ai-turbo-chat-file-toggle",
        title: "显示这段消息的原始文本",
        "aria-expanded": "false",
      });
      toggle.textContent = "展开原文";
      stack.appendChild(toggle);
      toggle.addEventListener("click", (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const mount = mounts.get(turnElement);
        if (mount) setExpanded(mount, !mount.expanded);
      });
      row.appendChild(stack);

      turnElement.insertAdjacentElement("afterend", row);

      return {
        row,
        prompt: promptNode,
        hidden: containers,
        fileCount: parsed.files.length,
        collapsed: false,
        expanded: false,
        toggle,
      };
    });

    mounts.set(turnElement, mount);
    trackedTurns.add(turnElement);
    syncRowVisibility(turnElement, mount);
  }

  function sweep(turns: readonly Element[]): void {
    if (!trackedTurns.size) return;

    const live = new Set(turns);
    for (const turn of Array.from(trackedTurns)) {
      if (!state.virtualFileEnabled) {
        reset();
        return;
      }
      if (!turn.isConnected || !live.has(turn)) {
        detachMount(turn);
        continue;
      }

      const mount = mounts.get(turn);
      if (!mount) {
        trackedTurns.delete(turn);
        continue;
      }

      if (!isMountHealthy(mount)) {
        collapseInChatFileBlocks(turn);
        continue;
      }
      syncRowVisibility(turn, mount);
    }
  }

  function reset(): void {
    for (const turn of Array.from(trackedTurns)) {
      detachMount(turn);
    }
    trackedTurns.clear();
    mounts = new WeakMap<Element, CapsuleMount>();
  }

  return { collapseInChatFileBlocks, sweep, reset };
}
