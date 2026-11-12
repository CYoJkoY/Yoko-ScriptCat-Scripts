import {
  CHATGPT_CODE_CARD_BOUNDARY_SELECTOR,
  CHATGPT_CODE_CARD_MAX_ANCESTORS,
  CHATGPT_CODE_HEADER_MARKER_SELECTOR,
  CODE_COLLAPSE_HEIGHT,
  CODE_PREVIEW_HEIGHT,
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
  /** Queue the code blocks of one turn, used when it leaves dehydration. */
  requestCodeScanForTurn(turnElement: Element): void;
  /** Drop controls and observers of one turn, used before dehydration. */
  suspendTurnCodeBlocks(turnElement: Element): void;
  /** Queue code blocks found under mutated subtrees. */
  markCodeSubtreesDirty(roots: Iterable<Element>): void;
  markCodeBlockDirty(codeElement: HTMLElement): void;
  /** True while a scan or dirty batch is waiting to be flushed. */
  isCodeScanPending(): boolean;
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
  const observedCodeBlocks = new Set<HTMLElement>();
  /* Subtrees queued by mutations; expanded in the scan window, never inline. */
  const pendingCodeRoots = new Set<Element>();
  const watchedCodeBlocks = new Set<HTMLElement>();
  /* Blocks that left the viewport observer and may now be measured once. */
  const viewportReadyCodeBlocks = new Set<HTMLElement>();
  let codeScanRequested = true;
  let codeResizeObserver: ResizeObserver | null = null;
  let codeViewportObserver: IntersectionObserver | null = null;
  let barsDirty = false;

  /* Join once: each candidate used to repeat a closest walk per selector. */
  const codeSelectorText = (currentPlatform.codeSelectors || ["pre"]).join(
    ",",
  );
  const userTurnSelectorText = (currentPlatform.userTurnSelectors || []).join(
    ",",
  );

  /* Measure a little ahead of the viewport so bars appear before they are
     needed, without touching the hundreds of blocks far outside it. */
  const CODE_VIEWPORT_MARGIN = "800px 0px";

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

  function isInsideUserTurn(candidate: Element): boolean {
    if (!userTurnSelectorText) return false;
    try {
      return (
        candidate.matches(userTurnSelectorText) ||
        Boolean(candidate.closest(userTurnSelectorText))
      );
    } catch (error: unknown) {
      reportRecoverableError("test code card boundary", error);
      return false;
    }
  }

  function toCodeElement(candidate: Element): HTMLElement | null {
    /* Dehydrated turns stay unrendered; measuring them would force layout. */
    if (candidate.closest(".ai-turbo-dehydrated")) return null;

    const belongsToUserTurn = isInsideUserTurn(candidate);

    if (
      candidate.classList.contains("ai-turbo-chat-folded-target") ||
      belongsToUserTurn ||
      candidate.closest(
        ".ai-turbo-chat-folded-target, .ai-turbo-chat-capsule, user-query, [data-message-author-role='user'], [data-content-search-unit-key$=':user'], [data-user-message-bubble='true'], [data-testid='collapsible-user-message-root'], .font-user-message",
      )
    ) {
      return null;
    }
    const codeElement = normalizeCodeElement(candidate);
    if (!codeElement) return null;
    if (isGeminiThoughtElement(codeElement)) return null;
    return codeElement;
  }

  function collectCodeElements(rootNode: Element): HTMLElement[] {
    const collected: HTMLElement[] = [];

    /* closest() includes the root itself, and one union query walks the
       subtree once even when `pre` is nested inside a Gemini `code-block`. */
    const nearest = rootNode.closest(codeSelectorText);
    if (nearest) {
      const codeElement = toCodeElement(nearest);
      if (codeElement) collected.push(codeElement);
    }
    rootNode.querySelectorAll(codeSelectorText).forEach((candidate) => {
      const codeElement = toCodeElement(candidate);
      if (codeElement) collected.push(codeElement);
    });

    return filterOutNested(collected).filter(
      (element): element is HTMLElement => element instanceof HTMLElement,
    );
  }

  function getCodeBlocks(rootNode: ParentNode = document): HTMLElement[] {
    const collected: HTMLElement[] = [];

    rootNode.querySelectorAll(codeSelectorText).forEach((candidate) => {
      const codeElement = toCodeElement(candidate);
      if (codeElement) collected.push(codeElement);
    });

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
    /* One box read is enough for the 300px threshold. The scroll sizes below
       only cover jsdom and fully hidden elements, where the rect is zero. */
    const rectHeight = Math.round(codeElement.getBoundingClientRect().height);
    if (rectHeight > 0) return rectHeight;

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

  function observeCodeElement(codeElement: HTMLElement): void {
    if (!codeResizeObserver || observedCodeBlocks.has(codeElement)) return;
    observedCodeBlocks.add(codeElement);
    codeResizeObserver.observe(codeElement);
  }

  function unobserveCodeElement(codeElement: HTMLElement): void {
    if (!observedCodeBlocks.delete(codeElement)) return;
    codeResizeObserver?.unobserve(codeElement);
  }

  function supportsViewportObservation(): boolean {
    return "IntersectionObserver" in window;
  }

  /**
   * Fold controls are expensive to build and need a real height. Registering
   * the block keeps loading and switching cheap: only blocks close to the
   * viewport are ever measured, and everything else stays untouched.
   */
  function observeCodeViewport(codeElement: HTMLElement): void {
    if (!codeViewportObserver || watchedCodeBlocks.has(codeElement)) return;
    watchedCodeBlocks.add(codeElement);
    codeViewportObserver.observe(codeElement);
  }

  function unobserveCodeViewport(codeElement: HTMLElement): void {
    viewportReadyCodeBlocks.delete(codeElement);
    if (!watchedCodeBlocks.delete(codeElement)) return;
    codeViewportObserver?.unobserve(codeElement);
  }

  function ensureCodeViewportObserver(): void {
    if (codeViewportObserver || !supportsViewportObservation()) return;

    codeViewportObserver = new IntersectionObserver(
      (entries) => {
        let queued = false;
        for (const viewportEntry of entries) {
          if (!viewportEntry.isIntersecting) continue;
          const target = viewportEntry.target;
          if (!(target instanceof HTMLElement)) continue;
          unobserveCodeViewport(target);
          if (!target.isConnected) continue;
          dirtyCodeBlocks.add(normalizeCodeElement(target) ?? target);
          viewportReadyCodeBlocks.add(target);
          queued = true;
        }
        if (queued) requestUpdate();
      },
      { rootMargin: CODE_VIEWPORT_MARGIN, threshold: 0 },
    );
  }

  function releaseCodeViewportWatchers(): void {
    for (const watched of Array.from(watchedCodeBlocks)) {
      unobserveCodeViewport(watched);
    }
    codeViewportObserver?.disconnect();
    codeViewportObserver = null;
    watchedCodeBlocks.clear();
    viewportReadyCodeBlocks.clear();
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
    dirtyCodeBlocks.delete(codeElement);
    unobserveCodeElement(codeElement);
    unobserveCodeViewport(codeElement);
    barsDirty = true;
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
    if (!currentPlatform.codeCardChrome) return codeElement;
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
      currentPlatform.codeCardChrome &&
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
          currentPlatform.codeCardChrome
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
    observeCodeElement(codeElement);
    barsDirty = true;
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

  /** Expand the mutation-queued subtrees into code elements, once. */
  function expandPendingCodeRoots(): HTMLElement[] {
    if (pendingCodeRoots.size === 0) return [];
    const expanded: HTMLElement[] = [];
    for (const root of pendingCodeRoots) {
      if (!root.isConnected) continue;
      if (root.closest(".ai-turbo-dehydrated")) continue;
      expanded.push(...collectCodeElements(root));
    }
    pendingCodeRoots.clear();
    return expanded;
  }

  function syncCodeBlocks(
    forceScan: boolean,
    dirtyCandidates: ReadonlySet<HTMLElement>,
  ): void {
    /* Mutation callbacks only queue roots; the walk happens here, once per
       scan window, instead of inside a conversation switch burst. */
    const queuedRootCandidates = expandPendingCodeRoots();

    if (!state.collapseCode) {
      for (const [codeElement] of codeState) {
        unmountCodeControls(codeElement);
      }
      state.foldedCodeCount = 0;
      codeScanRequested = false;
      dirtyCodeBlocks.clear();
      queuedRootCandidates.length = 0;
      releaseCodeViewportWatchers();
      sweepOrphanBars();
      return;
    }

    for (const [codeElement] of codeState) {
      if (!codeElement.isConnected) {
        unmountCodeControls(codeElement);
      }
    }

    const rawCandidates = [
      ...(forceScan ? getCodeBlocks() : []),
      ...queuedRootCandidates,
      ...Array.from(dirtyCandidates)
        .map(normalizeCodeElement)
        .filter(
          (elem): elem is HTMLElement =>
            elem instanceof HTMLElement &&
            elem.isConnected &&
            !elem.closest(".ai-turbo-dehydrated"),
        ),
    ];

    const candidates = filterOutNested(rawCandidates).filter(
      (element): element is HTMLElement => element instanceof HTMLElement,
    );

    for (const codeElement of candidates) {
      const entry = codeState.get(codeElement);
      if (entry) {
        if (
          currentPlatform.codeCardChrome &&
          !positionCodeControl(entry, codeElement)
        ) {
          continue;
        }
        updateCodeMeta(entry, codeElement);
      } else if (
        codeViewportObserver &&
        !viewportReadyCodeBlocks.has(codeElement)
      ) {
        observeCodeViewport(codeElement);
      } else {
        viewportReadyCodeBlocks.delete(codeElement);
        mountCodeControls(codeElement);
      }
    }

    if (barsDirty) {
      sweepOrphanBars();
      barsDirty = false;
    }

    state.foldedCodeCount = Array.from(codeState.values()).filter(
      (entry) => !entry.expanded,
    ).length;
    codeScanRequested = false;
    dirtyCodeBlocks.clear();
  }

  function observeCodeLayout(): void {
    ensureCodeViewportObserver();
    if (!("ResizeObserver" in window)) return;
    codeResizeObserver?.disconnect();
    observedCodeBlocks.clear();

    codeResizeObserver = new ResizeObserver((entries) => {
      for (const resizeEntry of entries) {
        const normalized = normalizeCodeElement(resizeEntry.target);
        if (normalized instanceof HTMLElement) {
          dirtyCodeBlocks.add(normalized);
        }
      }
      if (entries.length) requestUpdate();
    });

    /* Reattach only the blocks that already have mounted controls. */
    for (const codeElement of codeState.keys()) {
      observeCodeElement(codeElement);
    }
  }

  function flushCodeBlockScan(): void {
    syncCodeBlocks(codeScanRequested, dirtyCodeBlocks);
  }

  function unmountAllCodeControls(): void {
    for (const codeElement of Array.from(codeState.keys())) {
      unmountCodeControls(codeElement);
    }
    pendingCodeRoots.clear();
    dirtyCodeBlocks.clear();
    releaseCodeViewportWatchers();
  }

  function disconnectCodeLayoutObserver(): void {
    codeResizeObserver?.disconnect();
    codeResizeObserver = null;
    observedCodeBlocks.clear();
    pendingCodeRoots.clear();
    dirtyCodeBlocks.clear();
    releaseCodeViewportWatchers();
  }

  function requestCodeScan(): void {
    codeScanRequested = true;
  }

  function markCodeBlockDirty(codeElement: HTMLElement): void {
    if (codeElement.closest(".ai-turbo-dehydrated")) return;
    dirtyCodeBlocks.add(codeElement);
  }

  /**
   * Queue the blocks of one turn. Used when a turn leaves dehydration, where
   * no mutation record exists to announce the now-visible code.
   */
  function requestCodeScanForTurn(turnElement: Element): void {
    if (!state.collapseCode) return;
    if (turnElement.closest(".ai-turbo-dehydrated")) return;
    let queued = false;
    for (const codeElement of collectCodeElements(turnElement)) {
      dirtyCodeBlocks.add(codeElement);
      queued = true;
    }
    /* A restored turn has no mutation record to wake the scan timer. */
    if (queued) requestUpdate();
  }

  /** Drop controls and observations before a turn is hidden by dehydration. */
  function suspendTurnCodeBlocks(turnElement: Element): void {
    for (const codeElement of Array.from(codeState.keys())) {
      if (
        codeElement === turnElement ||
        turnElement.contains(codeElement)
      ) {
        unmountCodeControls(codeElement);
      }
    }
    for (const codeElement of Array.from(dirtyCodeBlocks)) {
      if (
        codeElement === turnElement ||
        turnElement.contains(codeElement)
      ) {
        dirtyCodeBlocks.delete(codeElement);
      }
    }
    for (const watched of Array.from(watchedCodeBlocks)) {
      if (watched === turnElement || turnElement.contains(watched)) {
        unobserveCodeViewport(watched);
      }
    }
    for (const root of Array.from(pendingCodeRoots)) {
      if (root === turnElement || turnElement.contains(root)) {
        pendingCodeRoots.delete(root);
      }
    }
    state.foldedCodeCount = Array.from(codeState.values()).filter(
      (entry) => !entry.expanded,
    ).length;
  }

  function markCodeSubtreesDirty(roots: Iterable<Element>): void {
    for (const root of roots) {
      if (!root.isConnected) continue;
      if (root.closest(".ai-turbo-dehydrated")) continue;
      pendingCodeRoots.add(root);
    }
  }

  function isCodeScanPending(): boolean {
    return (
      codeScanRequested || dirtyCodeBlocks.size > 0 || pendingCodeRoots.size > 0
    );
  }

  return {
    normalizeCodeElement,
    flushCodeBlockScan,
    unmountAllCodeControls,
    observeCodeLayout,
    disconnectCodeLayoutObserver,
    requestCodeScan,
    requestCodeScanForTurn,
    suspendTurnCodeBlocks,
    markCodeSubtreesDirty,
    markCodeBlockDirty,
    isCodeScanPending,
  };
}
