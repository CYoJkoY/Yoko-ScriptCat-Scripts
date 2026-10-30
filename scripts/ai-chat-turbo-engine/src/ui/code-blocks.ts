import {
  CHATGPT_CODE_CARD_BOUNDARY_SELECTOR,
  CHATGPT_CODE_CARD_MAX_ANCESTORS,
  CHATGPT_CODE_HEADER_MARKER_SELECTOR,
  CODE_COLLAPSE_HEIGHT,
  CODE_PREVIEW_HEIGHT,
  PLATFORMS,
  STREAMING_IDLE_DELAY,
  type PlatformDefinition,
} from "../config";
import { reportRecoverableError } from "../core/diagnostics";
import { fastCountLines } from "../core/text";
import type { EngineState } from "../state";

export interface CodeEntry {
  bar: HTMLElement;
  anchor: HTMLElement | null;
  langLabel: HTMLElement;
  linesLabel: HTMLElement;
  toggleButton: HTMLButtonElement;
  expanded: boolean;
  lastLength: number;
  lastMutationTime: number;
  streamingTimer: ReturnType<typeof setTimeout> | null;
  isDisplayingStreaming: boolean;
  renderedStaticOnce: boolean;
}

export type ElementFactory = <Tag extends keyof HTMLElementTagNameMap = "div">(
  tag: Tag,
  attrs?: Readonly<Record<string, string | EventListener>>,
  children?: readonly (string | Node)[],
) => HTMLElementTagNameMap[Tag];

export interface CodeBlockDeps {
  currentPlatform: PlatformDefinition;
  state: EngineState;
  el: ElementFactory;
  withSelfMutation: <T>(task: () => T) => T;
  filterOutNested: (elements: readonly Element[]) => Element[];
  isGeminiThoughtElement: (node: Element) => boolean;
  requestUpdate: () => void;
}

export interface CodeBlockUtils {
  normalizeCodeElement(candidate: Element): HTMLElement | null;
  flushCodeBlockScan(): void;
  unmountAllCodeControls(): void;
  observeCodeLayout(): void;
  disconnectCodeLayoutObserver(): void;
  requestCodeScan(): void;
  markCodeBlockDirty(codeElement: HTMLElement): void;
}

export function createCodeBlockUtils(deps: CodeBlockDeps): CodeBlockUtils {
  const {
    currentPlatform,
    state,
    el,
    withSelfMutation,
    filterOutNested,
    isGeminiThoughtElement,
    requestUpdate,
  } = deps;

  const codeState = new Map<HTMLElement, CodeEntry>();
  const dirtyCodeBlocks = new Set<HTMLElement>();
  let codeScanRequested = true;
  let codeResizeObserver: ResizeObserver | null = null;

  function normalizeCodeElement(candidate: Element): HTMLElement | null {
    if (!(candidate instanceof HTMLElement)) return null;
    const geminiBlock = candidate.closest("code-block");
    if (geminiBlock instanceof HTMLElement) return geminiBlock;
    if (candidate.matches("code")) {
      return candidate.parentElement?.matches("pre")
        ? candidate.parentElement
        : candidate;
    }
    return candidate;
  }

  function getCodeBlocks(rootNode: ParentNode = document): HTMLElement[] {
    const collected: HTMLElement[] = [];
    const selectors = currentPlatform.codeSelectors || ["pre"];

    for (const selector of selectors) {
      rootNode.querySelectorAll(selector).forEach((candidate) => {
        const belongsToUserTurn = (
          currentPlatform.userTurnSelectors || []
        ).some((selector) => {
          try {
            return (
              candidate.matches(selector) ||
              Boolean(candidate.closest(selector))
            );
          } catch (error: unknown) {
            reportRecoverableError("test code card boundary", error);
            return false;
          }
        });

        if (
          candidate.classList.contains("ai-turbo-chat-folded-target") ||
          belongsToUserTurn ||
          candidate.closest(
            ".ai-turbo-chat-folded-target, .ai-turbo-chat-capsule, user-query, [data-message-author-role='user'], [data-content-search-unit-key$=':user'], [data-user-message-bubble='true'], [data-testid='collapsible-user-message-root'], .font-user-message",
          )
        ) {
          return;
        }
        const codeElement = normalizeCodeElement(candidate);
        if (!codeElement) return;
        if (isGeminiThoughtElement(codeElement)) return;
        collected.push(codeElement);
      });
    }

    return filterOutNested(collected).filter(
      (element): element is HTMLElement => element instanceof HTMLElement,
    );
  }

  function getCodeText(codeElement: HTMLElement): string {
    const sourceElement =
      codeElement.querySelector("pre code") ||
      codeElement.querySelector("pre") ||
      codeElement.querySelector("code") ||
      codeElement;
    return typeof sourceElement.textContent === "string"
      ? sourceElement.textContent
      : "";
  }

  function getCodeLanguage(codeElement: HTMLElement): string {
    const langElem = codeElement.querySelector(
      'code[class*="language-"], [class*="language-"]',
    );
    if (langElem) {
      const match = String(langElem.className || "").match(
        /language-([a-z0-9+#.-]+)/i,
      );
      if (match) return (match[1] ?? "").toUpperCase();
    }
    const decElem = codeElement.querySelector(
      ".code-block-decoration, [data-testid*='language']",
    );
    const decText = decElem?.textContent?.trim();
    if (decText && decText.length < 24) return decText.toUpperCase();

    const attrLang =
      codeElement.getAttribute("data-language") ||
      codeElement.getAttribute("lang");
    if (attrLang) return attrLang.toUpperCase();

    return "代码";
  }

  function getCodeElementHeight(codeElement: HTMLElement): number {
    const pre = codeElement.querySelector("pre");
    return Math.max(
      codeElement.scrollHeight || 0,
      codeElement.offsetHeight || 0,
      pre?.scrollHeight || 0,
      pre?.offsetHeight || 0,
    );
  }

  function applyFoldStyles(entry: CodeEntry, codeElement: HTMLElement): void {
    withSelfMutation(() => {
      if (entry.expanded) {
        codeElement.classList.remove("ai-turbo-folded");
        codeElement.classList.add("ai-turbo-expanded");
        codeElement.style.removeProperty("max-height");
        codeElement.style.removeProperty("overflow");
      } else {
        codeElement.classList.remove("ai-turbo-expanded");
        codeElement.classList.add("ai-turbo-folded");
        codeElement.style.setProperty("display", "block", "important");
        codeElement.style.setProperty(
          "max-height",
          `${CODE_PREVIEW_HEIGHT}px`,
          "important",
        );
        codeElement.style.setProperty("overflow", "hidden", "important");
      }
    });
  }

  function updateCodeMeta(entry: CodeEntry, codeElement: HTMLElement): void {
    if (!entry || !codeElement?.isConnected) return;

    /* An already rendered, unchanged block has nothing new to show. */
    if (
      entry.renderedStaticOnce &&
      !entry.isDisplayingStreaming &&
      !dirtyCodeBlocks.has(codeElement)
    ) {
      return;
    }

    const currentText = getCodeText(codeElement);
    const currentLen = currentText.length;
    const now = Date.now();

    if (currentLen !== entry.lastLength) {
      entry.lastLength = currentLen;
      entry.lastMutationTime = now;
      entry.renderedStaticOnce = false;
    }

    const isActivelyStreaming =
      entry.lastMutationTime > 0 &&
      now - entry.lastMutationTime < STREAMING_IDLE_DELAY;

    if (isActivelyStreaming) {
      if (!entry.isDisplayingStreaming) {
        entry.isDisplayingStreaming = true;
        entry.langLabel.textContent = getCodeLanguage(codeElement);
        entry.linesLabel.textContent = "";
        entry.linesLabel.appendChild(
          el("span", { className: "ai-turbo-streaming-badge" }, [
            "● 正在输出...",
          ]),
        );
        entry.toggleButton.textContent = entry.expanded
          ? "收起代码"
          : "展开代码";
      }

      if (entry.streamingTimer) clearTimeout(entry.streamingTimer);
      entry.streamingTimer = setTimeout(() => {
        updateCodeMeta(entry, codeElement);
      }, STREAMING_IDLE_DELAY + 50);
      return;
    }

    entry.isDisplayingStreaming = false;
    entry.renderedStaticOnce = true;

    const lineCount = fastCountLines(currentText);
    entry.langLabel.textContent = getCodeLanguage(codeElement);
    entry.linesLabel.textContent = lineCount
      ? `${lineCount.toLocaleString()} 行`
      : "";
    entry.toggleButton.textContent = entry.expanded
      ? "收起代码"
      : `展开 ${lineCount ? `${lineCount.toLocaleString()} 行` : "代码"}`;
    entry.toggleButton.setAttribute("aria-expanded", String(entry.expanded));
  }

  function unmountCodeControls(codeElement: HTMLElement): void {
    const entry = codeState.get(codeElement);
    if (!entry) return;
    if (entry.streamingTimer) clearTimeout(entry.streamingTimer);
    withSelfMutation(() => {
      entry.bar?.remove();
      codeElement.classList.remove(
        "ai-turbo-code-target",
        "ai-turbo-folded",
        "ai-turbo-expanded",
      );
      codeElement.style.removeProperty("max-height");
      codeElement.style.removeProperty("overflow");
      codeElement.style.removeProperty("display");
    });
    codeState.delete(codeElement);
  }

  function isNativeCodeHeaderNode(node: Element): boolean {
    if (!(node instanceof HTMLElement)) return false;

    try {
      if (
        node.matches(CHATGPT_CODE_HEADER_MARKER_SELECTOR) ||
        node.querySelector(CHATGPT_CODE_HEADER_MARKER_SELECTOR)
      ) {
        return true;
      }
    } catch (error: unknown) {
      reportRecoverableError("inspect native code header", error);
      return false;
    }

    const className = typeof node.className === "string" ? node.className : "";
    const markerText = [
      className,
      node.getAttribute("data-testid") || "",
      node.getAttribute("aria-label") || "",
      node.getAttribute("title") || "",
    ].join(" ");

    if (
      /(?:code|language).*(?:header|toolbar|decoration)|(?:header|toolbar).*(?:code|language)/i.test(
        markerText,
      )
    ) {
      return true;
    }

    // Some native headers expose the language name and an icon-only copy
    // button instead of an accessible "Copy code" label.
    if (node.querySelector("button") && !node.querySelector("pre, code")) {
      const headerText = (node.textContent || "").trim();
      if (
        headerText.length > 0 &&
        headerText.length <= 64 &&
        (/^(?:[a-z0-9_+#.-]+)$/i.test(headerText) ||
          /copy|复制|运行代码|code block/i.test(headerText))
      ) {
        return true;
      }
    }

    return false;
  }

  function getChatGPTCodeCardAnchor(codeElement: HTMLElement): HTMLElement | null {
    let branch: Element = codeElement;
    let parent = codeElement.parentElement;
    let classBasedFallback: HTMLElement | null = null;
    let depth = 0;

    while (
      parent instanceof HTMLElement &&
      depth < CHATGPT_CODE_CARD_MAX_ANCESTORS
    ) {
      // Never treat an entire assistant turn or transcript slot as a code
      // card. Only inspect ancestors below that boundary.
      if (parent.matches(CHATGPT_CODE_CARD_BOUNDARY_SELECTOR)) break;

      let precedingSibling = branch.previousElementSibling;
      while (precedingSibling) {
        if (isNativeCodeHeaderNode(precedingSibling)) {
          return parent.contains(codeElement) ? parent : null;
        }
        precedingSibling = precedingSibling.previousElementSibling;
      }

      const className =
        typeof parent.className === "string" ? parent.className : "";
      const cardMarker = [
        className,
        parent.getAttribute("data-testid") || "",
        parent.getAttribute("data-role") || "",
      ].join(" ");

      if (
        /(?:code[-_ ]?(?:block|card|container)|(?:block|card)[-_ ]?code|group\/code)/i.test(
          cardMarker,
        )
      ) {
        classBasedFallback = parent;
      }

      branch = parent;
      parent = parent.parentElement;
      depth++;
    }

    // If header controls cannot be recognized, only use an explicitly named
    // code-card wrapper. Otherwise leave this native code block untouched.
    return classBasedFallback instanceof HTMLElement &&
      classBasedFallback.isConnected &&
      classBasedFallback.contains(codeElement)
      ? classBasedFallback
      : null;
  }

  function getCodeControlAnchor(codeElement: HTMLElement): HTMLElement | null {
    if (currentPlatform !== PLATFORMS.chatgpt) return codeElement;
    return getChatGPTCodeCardAnchor(codeElement);
  }

  function positionCodeControl(entry: CodeEntry, codeElement: HTMLElement): boolean {
    const anchor = getCodeControlAnchor(codeElement);
    if (!(anchor instanceof HTMLElement) || anchor === codeElement) {
      // Fail closed: remove our fold state and reveal the original code if the
      // current ChatGPT DOM no longer exposes a safe outer-card anchor.
      unmountCodeControls(codeElement);
      return false;
    }

    if (
      entry.anchor === anchor &&
      entry.bar.isConnected &&
      entry.bar.nextElementSibling === anchor
    ) {
      return true;
    }

    withSelfMutation(() => {
      entry.bar.remove();
      anchor.insertAdjacentElement("beforebegin", entry.bar);
      entry.anchor = anchor;
    });
    return true;
  }

  function flashCopyState(button: HTMLButtonElement, label: string): void {
    button.textContent = label;
    window.setTimeout(() => {
      if (button.isConnected) button.textContent = "复制";
    }, 1200);
  }

  function copyCodeText(button: HTMLButtonElement, codeElement: HTMLElement): void {
    const text = getCodeText(codeElement);
    if (!navigator.clipboard?.writeText) {
      flashCopyState(button, "不可用");
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => flashCopyState(button, "已复制"),
      () => flashCopyState(button, "复制失败"),
    );
  }

  function mountCodeControls(codeElement: HTMLElement): void {
    if (
      !state.collapseCode ||
      !codeElement.isConnected ||
      codeState.has(codeElement)
    )
      return;
    if (codeElement.parentElement?.closest(".ai-turbo-code-target")) return;

    const measuredH = getCodeElementHeight(codeElement);
    if (measuredH <= CODE_COLLAPSE_HEIGHT) return;

    const anchor = getCodeControlAnchor(codeElement);
    if (
      currentPlatform === PLATFORMS.chatgpt &&
      (!(anchor instanceof HTMLElement) || anchor === codeElement)
    ) {
      return;
    }

    let sibling = codeElement.previousElementSibling;
    while (sibling && sibling.classList.contains("ai-turbo-code-bar")) {
      const toRemove = sibling;
      sibling = sibling.previousElementSibling;
      toRemove.remove();
    }

    const initialText = getCodeText(codeElement);

    const langLabel = el("span", { className: "ai-turbo-code-lang" });
    const linesLabel = el("span", { className: "ai-turbo-code-lines" });
    const metaWrap = el("div", { className: "ai-turbo-code-bar-meta" }, [
      langLabel,
      linesLabel,
    ]);

    const toggleButton = el("button", {
      type: "button",
      className: "ai-turbo-code-toggle",
      "aria-expanded": "false",
    });

    const copyButton = el("button", {
      type: "button",
      className: "ai-turbo-code-copy",
      "aria-label": "复制整段代码",
    });
    copyButton.textContent = "复制";
    copyButton.addEventListener("click", () => {
      copyCodeText(copyButton, codeElement);
    });

    const actionsWrap = el("div", { className: "ai-turbo-code-bar-actions" }, [
      copyButton,
      toggleButton,
    ]);

    const bar = el(
      "div",
      {
        className:
          currentPlatform === PLATFORMS.chatgpt
            ? "ai-turbo-code-bar ai-turbo-code-bar-chatgpt"
            : "ai-turbo-code-bar",
      },
      [metaWrap, actionsWrap],
    );

    const entry = {
      bar,
      anchor,
      langLabel,
      linesLabel,
      toggleButton,
      expanded: false,
      lastLength: initialText.length,
      lastMutationTime: 0,
      streamingTimer: null,
      isDisplayingStreaming: false,
      renderedStaticOnce: false,
    };

    if (!(anchor instanceof HTMLElement)) return;
    codeState.set(codeElement, entry);

    withSelfMutation(() => {
      codeElement.classList.add("ai-turbo-code-target");
      anchor.insertAdjacentElement("beforebegin", bar);
    });

    toggleButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      entry.expanded = !entry.expanded;
      applyFoldStyles(entry, codeElement);
      entry.renderedStaticOnce = false;
      updateCodeMeta(entry, codeElement);

      if (!entry.expanded) {
        bar.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    });

    applyFoldStyles(entry, codeElement);
    updateCodeMeta(entry, codeElement);
  }

  function sweepOrphanBars(): void {
    const activeBars = new Set<Element>(
      Array.from(codeState.values(), (entry) => entry.bar),
    );

    document.querySelectorAll(".ai-turbo-code-bar").forEach((bar) => {
      if (!activeBars.has(bar)) {
        bar.remove();
        return;
      }

      if (bar.classList.contains("ai-turbo-code-bar-chatgpt")) return;

      const next = bar.nextElementSibling;
      const nextEntry = next instanceof HTMLElement ? codeState.get(next) : undefined;
      if (!(next instanceof HTMLElement) || !nextEntry || nextEntry.bar !== bar) {
        bar.remove();
      }
    });
  }

  function syncCodeBlocks(
    forceScan: boolean,
    dirtyCandidates: ReadonlySet<HTMLElement>,
  ): void {
    if (!state.collapseCode) {
      for (const [codeElement] of codeState) {
        unmountCodeControls(codeElement);
      }
      state.foldedCodeCount = 0;
      codeScanRequested = false;
      dirtyCodeBlocks.clear();
      sweepOrphanBars();
      return;
    }

    for (const [codeElement] of codeState) {
      if (!codeElement.isConnected) {
        unmountCodeControls(codeElement);
      }
    }

    const rawCandidates = forceScan
      ? getCodeBlocks()
      : Array.from(dirtyCandidates)
          .map(normalizeCodeElement)
          .filter(
            (elem): elem is HTMLElement =>
              elem instanceof HTMLElement && elem.isConnected,
          );

    const candidates = filterOutNested(rawCandidates).filter(
      (element): element is HTMLElement => element instanceof HTMLElement,
    );

    for (const codeElement of candidates) {
      const entry = codeState.get(codeElement);
      if (entry) {
        if (
          currentPlatform === PLATFORMS.chatgpt &&
          !positionCodeControl(entry, codeElement)
        ) {
          continue;
        }
        updateCodeMeta(entry, codeElement);
      } else {
        mountCodeControls(codeElement);
      }

      if (codeResizeObserver) {
        codeResizeObserver.observe(codeElement);
      }
    }

    sweepOrphanBars();

    state.foldedCodeCount = Array.from(codeState.values()).filter(
      (entry) => !entry.expanded,
    ).length;
    codeScanRequested = false;
    dirtyCodeBlocks.clear();
  }

  function observeCodeLayout(): void {
    if (!("ResizeObserver" in window)) return;
    codeResizeObserver?.disconnect();

    codeResizeObserver = new ResizeObserver((entries) => {
      for (const resizeEntry of entries) {
        const normalized = normalizeCodeElement(resizeEntry.target);
        if (normalized instanceof HTMLElement) {
          dirtyCodeBlocks.add(normalized);
        }
      }
      if (entries.length) requestUpdate();
    });

    getCodeBlocks().forEach((codeElement) => {
      codeResizeObserver?.observe(codeElement);
    });
  }

  function flushCodeBlockScan(): void {
    syncCodeBlocks(codeScanRequested, dirtyCodeBlocks);
  }

  function unmountAllCodeControls(): void {
    for (const codeElement of Array.from(codeState.keys())) {
      unmountCodeControls(codeElement);
    }
  }

  function disconnectCodeLayoutObserver(): void {
    codeResizeObserver?.disconnect();
    codeResizeObserver = null;
  }

  function requestCodeScan(): void {
    codeScanRequested = true;
  }

  function markCodeBlockDirty(codeElement: HTMLElement): void {
    dirtyCodeBlocks.add(codeElement);
  }

  return {
    normalizeCodeElement,
    flushCodeBlockScan,
    unmountAllCodeControls,
    observeCodeLayout,
    disconnectCodeLayoutObserver,
    requestCodeScan,
    markCodeBlockDirty,
  };
}
