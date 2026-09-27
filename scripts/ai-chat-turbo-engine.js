// ==UserScript==
// @name         AI Chat Turbo Engine
// @namespace    https://local/ai-turbo-engine-v5
// @version      0.5.1
// @description  增量消息索引 + 自适应脱水 + 独立层代码折叠 + Gemini 深度 DOM 兼容
// @author       Yoko
// @match        https://chatgpt.com/*
// @match        https://gemini.google.com/*
// @match        https://grok.com/*
// @match        https://x.com/i/grok*
// @match        https://claude.ai/*
// @run-at       document-start
// @grant        none
// @noframes
// @icon         data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="%2309090b"/><path d="M13 2L3 14h8l-1 8 11-12h-8l1-8z" fill="%2310b981"/></svg>
// @license      MIT
// ==/UserScript==

(function () {
  "use strict";

  const VERSION = "0.5.1";
  const HUD_ID = "ai-turbo-extreme-hud";
  const STYLE_ID = "ai-turbo-engine-styles";
  const CODE_OVERLAY_ROOT_ID = "ai-turbo-code-overlay-root";
  const CODE_COLLAPSE_HEIGHT = 320;
  const CODE_PREVIEW_HEIGHT = 220;
  const TURN_TEXT_LIMIT = 800;
  const SEARCH_LIMIT = 10;
  const STORAGE_KEY_POS = "ai_turbo_pill_pos";

  const PLATFORMS = {
    chatgpt: {
      name: "ChatGPT",
      turnSelectors: [
        '[data-message-author-role="user"]',
        '[data-message-author-role="assistant"]',
        'article[data-testid^="conversation-turn-"]',
      ],
      codeSelectors: ["pre"],
      contentSelectors: ["div.markdown", "div.prose", '[class*="markdown"]'],
    },
    gemini: {
      name: "Gemini",
      turnSelectors: [
        "user-query",
        "model-response",
        '[data-test-id="user-query"]',
        '[data-test-id="model-response"]',
        '[data-message-author="user"]',
        '[data-message-author="model"]',
        ".user-query",
        ".model-response",
        ".user-query-container",
        ".model-response-container",
      ],
      codeSelectors: [
        "code-block",
        ".code-block",
        '[data-test-id="code-content"]',
        "pre",
      ],
      contentSelectors: [
        ".query-text",
        ".query-text-line",
        ".user-query-text",
        '[class*="query-content"]',
        'div[id^="model-response-message-content"]',
        "message-content",
        ".model-response-text",
        ".markdown-main-panel",
        ".markdown",
        ".md-content",
        ".response-content",
      ],
    },
    grok: {
      name: "Grok",
      turnSelectors: [
        'div[data-testid*="message-container"]',
        'div[data-testid*="conversation-turn"]',
        'div[class*="message-bubble"]',
      ],
      codeSelectors: ["pre"],
      contentSelectors: ['div[class*="message-content"]', 'div[dir="auto"]'],
    },
    claude: {
      name: "Claude",
      turnSelectors: [
        "div.font-user-message",
        ".font-claude-response",
        ".font-claude-message",
        "div[data-test-render-count]",
      ],
      codeSelectors: ["pre"],
      contentSelectors: [
        ".standard-markdown",
        ".progressive-markdown",
        ".markdown",
        '[class*="font-claude"]',
      ],
    },
  };

  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes("chatgpt.com")) return PLATFORMS.chatgpt;
    if (host.includes("gemini.google.com")) return PLATFORMS.gemini;
    if (host.includes("grok.com") || host.includes("x.com"))
      return PLATFORMS.grok;
    if (host.includes("claude.ai")) return PLATFORMS.claude;
    return null;
  }

  const currentPlatform = detectPlatform();
  if (!currentPlatform) return;

  const state = {
    pruneEnabled: true,
    keepTurns: 8,
    collapseCode: true,
    hudOpen: false,
    totalTurns: 0,
    hiddenCount: 0,
    foldedCodeCount: 0,
    indexedTurns: [],
  };

  const turnIndex = new Map();
  const codeState = new Map();
  const geminiShadowObservers = new Map();

  let hudRootElement = null;
  let hudShadowRoot = null;
  let hudStats = null;
  let searchInput = null;
  let searchResultsBox = null;
  let searchDebounceTimer = null;
  let observer = null;
  let codeResizeObserver = null;
  let codeOverlayRoot = null;
  let codeOverlayFrameQueued = false;
  let scheduleQueued = false;
  let fullTurnSyncRequested = true;
  let codeScanRequested = true;
  let dirtyTurns = new Set();
  let dirtyCodeBlocks = new Set();
  let previousTurns = [];
  let selfMutationDepth = 0;

  function withSelfMutation(task) {
    selfMutationDepth++;
    try {
      return task();
    } finally {
      selfMutationDepth--;
    }
  }

  function normalizeText(sourceText) {
    return String(sourceText || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, TURN_TEXT_LIMIT);
  }

  function isGeminiThoughtElement(element) {
    if (currentPlatform !== PLATFORMS.gemini || !(element instanceof Element))
      return false;
    return Boolean(
      element.closest(
        "model-thoughts, .thoughts-container, .thoughts-content, [data-test-id*='thought']",
      ),
    );
  }

  function collectGeminiShadowRoots(rootNode, output, visited) {
    if (currentPlatform !== PLATFORMS.gemini) return;
    if (
      !(
        rootNode instanceof Document ||
        rootNode instanceof Element ||
        rootNode instanceof ShadowRoot
      )
    )
      return;

    const hosts = [];
    if (rootNode instanceof Element) hosts.push(rootNode);
    hosts.push(
      ...Array.from(
        rootNode.querySelectorAll(
          "code-block, .code-block, model-response, message-content, [data-test-id='code-content'], [data-test-id='model-response']",
        ),
      ),
    );

    for (const hostElement of hosts) {
      if (!(hostElement instanceof Element)) continue;

      const shadowRoot = hostElement.shadowRoot;
      if (!shadowRoot || visited.has(shadowRoot)) continue;

      visited.add(shadowRoot);
      output.push(shadowRoot);
      collectGeminiShadowRoots(shadowRoot, output, visited);
    }
  }

  function syncGeminiShadowObservers() {
    if (currentPlatform !== PLATFORMS.gemini) return;

    const roots = [];
    collectGeminiShadowRoots(document, roots, new Set());

    const activeRoots = new Set(roots);

    for (const [shadowRoot, shadowObserver] of geminiShadowObservers) {
      if (!activeRoots.has(shadowRoot) || !shadowRoot.host?.isConnected) {
        shadowObserver.disconnect();
        geminiShadowObservers.delete(shadowRoot);
      }
    }

    for (const shadowRoot of roots) {
      if (geminiShadowObservers.has(shadowRoot)) continue;

      const shadowObserver = new MutationObserver(() => {
        if (selfMutationDepth > 0) return;
        codeScanRequested = true;
        requestUpdate();
      });

      shadowObserver.observe(shadowRoot, {
        childList: true,
        characterData: true,
        subtree: true,
      });

      geminiShadowObservers.set(shadowRoot, shadowObserver);
    }
  }

  function queryFirstDeep(rootNode, selectors) {
    if (
      !(
        rootNode instanceof Document ||
        rootNode instanceof Element ||
        rootNode instanceof ShadowRoot
      )
    ) {
      return null;
    }

    for (const selector of selectors) {
      if (
        rootNode instanceof Element &&
        rootNode.matches(selector) &&
        !isGeminiThoughtElement(rootNode)
      ) {
        return rootNode;
      }

      for (const candidate of rootNode.querySelectorAll(selector)) {
        if (!isGeminiThoughtElement(candidate)) {
          return candidate;
        }
      }
    }

    if (currentPlatform !== PLATFORMS.gemini) return null;

    const roots = [];
    collectGeminiShadowRoots(rootNode, roots, new Set());

    for (const shadowRoot of roots) {
      for (const selector of selectors) {
        const candidate = shadowRoot.querySelector(selector);

        if (candidate && !isGeminiThoughtElement(candidate)) {
          return candidate;
        }
      }
    }

    return null;
  }

  function uniqueDomOrdered(elements) {
    const seen = new Set();
    const unique = [];

    for (const element of elements) {
      if (!(element instanceof Element) || seen.has(element)) {
        continue;
      }

      seen.add(element);
      unique.push(element);
    }

    unique.sort((first, second) => {
      if (first === second) return 0;

      const relation = first.compareDocumentPosition(second);

      if (relation & Node.DOCUMENT_POSITION_FOLLOWING) {
        return -1;
      }

      if (relation & Node.DOCUMENT_POSITION_PRECEDING) {
        return 1;
      }

      return 0;
    });

    return unique;
  }

  function isNestedTurn(element, candidates) {
    let parentElement = element.parentElement;

    while (parentElement) {
      if (candidates.has(parentElement)) {
        return true;
      }

      parentElement = parentElement.parentElement;
    }

    return false;
  }

  function getTurns() {
    const collected = [];

    for (const selector of currentPlatform.turnSelectors) {
      document
        .querySelectorAll(selector)
        .forEach((element) => collected.push(element));
    }

    const ordered = uniqueDomOrdered(collected);
    const candidateSet = new Set(ordered);

    return ordered.filter(
      (element) =>
        !isNestedTurn(element, candidateSet) &&
        !isGeminiThoughtElement(element),
    );
  }

  function findContentElement(turnElement) {
    return (
      queryFirstDeep(turnElement, currentPlatform.contentSelectors) ||
      turnElement
    );
  }

  function extractTurnText(turnElement) {
    const contentElement = findContentElement(turnElement);

    const visibleText =
      typeof contentElement.innerText === "string"
        ? contentElement.innerText
        : contentElement.textContent || "";

    return normalizeText(visibleText);
  }

  function syncTurnIndex(forceFull) {
    const turns = getTurns();

    const structuralChange =
      forceFull ||
      turns[0] !== previousTurns[0] ||
      turns[turns.length - 1] !== previousTurns[previousTurns.length - 1];

    if (structuralChange) {
      turnIndex.clear();

      turns.forEach((turnElement, index) => {
        turnIndex.set(turnElement, {
          id: index,
          element: turnElement,
          text: extractTurnText(turnElement),
        });
      });
    } else {
      for (const turnElement of dirtyTurns) {
        const record = turnIndex.get(turnElement);

        if (record) {
          record.text = extractTurnText(turnElement);
        } else {
          fullTurnSyncRequested = true;
        }
      }
    }

    state.totalTurns = turns.length;

    state.indexedTurns = turns.map((turnElement, index) => {
      const record = turnIndex.get(turnElement);

      if (record) {
        record.id = index;
        return record;
      }

      const fallbackRecord = {
        id: index,
        element: turnElement,
        text: extractTurnText(turnElement),
      };

      turnIndex.set(turnElement, fallbackRecord);

      return fallbackRecord;
    });

    const cutoff = state.pruneEnabled
      ? Math.max(0, turns.length - state.keepTurns)
      : 0;

    turns.forEach((turnElement, index) => {
      const shouldDehydrate = state.pruneEnabled && index < cutoff;

      if (
        shouldDehydrate &&
        !turnElement.classList.contains("ai-turbo-dehydrated")
      ) {
        const measuredHeight = turnElement.offsetHeight || 120;

        turnElement.style.setProperty(
          "--turbo-cached-h",
          `${measuredHeight}px`,
        );

        turnElement.classList.add("ai-turbo-dehydrated");
      } else if (
        !shouldDehydrate &&
        turnElement.classList.contains("ai-turbo-dehydrated")
      ) {
        turnElement.classList.remove("ai-turbo-dehydrated");

        turnElement.style.removeProperty("--turbo-cached-h");
      }
    });

    state.hiddenCount = cutoff;
    previousTurns = turns;
    dirtyTurns.clear();
    fullTurnSyncRequested = false;
  }

  function collectMatchesDeep(rootNode, selectors) {
    const result = [];
    const seen = new Set();

    const addMatch = (candidate) => {
      if (!(candidate instanceof HTMLElement) || seen.has(candidate)) {
        return;
      }

      seen.add(candidate);
      result.push(candidate);
    };

    const scan = (currentRoot) => {
      if (
        !(
          currentRoot instanceof Document ||
          currentRoot instanceof Element ||
          currentRoot instanceof ShadowRoot
        )
      ) {
        return;
      }

      for (const selector of selectors) {
        if (currentRoot instanceof Element && currentRoot.matches(selector)) {
          addMatch(currentRoot);
        }

        currentRoot.querySelectorAll(selector).forEach(addMatch);
      }

      if (currentPlatform !== PLATFORMS.gemini) {
        return;
      }

      const roots = [];

      collectGeminiShadowRoots(currentRoot, roots, new Set());

      roots.forEach((shadowRoot) => {
        selectors.forEach((selector) => {
          shadowRoot.querySelectorAll(selector).forEach(addMatch);
        });
      });
    };

    scan(rootNode);

    return result;
  }

  function normalizeCodeElement(candidate) {
    if (!(candidate instanceof HTMLElement)) {
      return null;
    }

    if (candidate.matches("code")) {
      return candidate.parentElement?.matches("pre")
        ? candidate.parentElement
        : candidate;
    }

    if (
      currentPlatform === PLATFORMS.gemini &&
      candidate.matches('[data-test-id="code-content"]')
    ) {
      const parentCode = candidate.closest("pre, code-block, .code-block");

      if (parentCode instanceof HTMLElement) {
        return parentCode;
      }

      const rootNode = candidate.getRootNode();

      if (
        rootNode instanceof ShadowRoot &&
        rootNode.host instanceof HTMLElement
      ) {
        const hostElement = rootNode.host;

        if (hostElement.matches("code-block, .code-block, pre")) {
          return hostElement;
        }
      }
    }

    return candidate;
  }

  function getCodeBlocks(rootNode = document) {
    const candidates = collectMatchesDeep(
      rootNode,
      currentPlatform.codeSelectors || ["pre"],
    );

    const result = [];
    const seen = new Set();

    for (const candidate of candidates) {
      const codeElement = normalizeCodeElement(candidate);

      if (!(codeElement instanceof HTMLElement) || seen.has(codeElement)) {
        continue;
      }

      if (
        currentPlatform === PLATFORMS.gemini &&
        isGeminiThoughtElement(codeElement)
      ) {
        continue;
      }

      if (
        currentPlatform === PLATFORMS.gemini &&
        codeElement.matches("pre") &&
        codeElement.parentElement?.closest("code-block, .code-block")
      ) {
        continue;
      }

      seen.add(codeElement);
      result.push(codeElement);
    }

    return result;
  }

  function getCodeText(codeElement) {
    const sourceElement =
      queryFirstDeep(codeElement, [
        'code[role="text"]',
        "code",
        '[data-test-id="code-content"]',
        "pre",
      ]) || codeElement;

    return typeof sourceElement.textContent === "string"
      ? sourceElement.textContent
      : "";
  }

  function getCodeLanguage(codeElement) {
    const languageElement = queryFirstDeep(codeElement, [
      'code[class*="language-"]',
      '[class*="language-"]',
    ]);

    if (languageElement) {
      const match = String(languageElement.className || "").match(
        /language-([a-z0-9+#.-]+)/i,
      );

      if (match) {
        return match[1].toUpperCase();
      }
    }

    const decorationElement = queryFirstDeep(codeElement, [
      ".code-block-decoration",
      '[data-testid*="language"]',
    ]);

    const decorationText = decorationElement?.textContent?.trim();

    return decorationText ? decorationText.slice(0, 24).toUpperCase() : "代码";
  }

  function getCodeLineCount(codeElement) {
    const codeText = getCodeText(codeElement);

    if (!codeText) return 0;

    return codeText.replace(/\r\n/g, "\n").split("\n").length;
  }

  function getIntrinsicCodeHeight(codeElement) {
    const candidates = [
      codeElement,
      queryFirstDeep(codeElement, ["pre"]),
      queryFirstDeep(codeElement, ['[data-test-id="code-content"]']),
      queryFirstDeep(codeElement, ["code"]),
    ].filter((candidate) => candidate instanceof HTMLElement);

    return candidates.reduce(
      (height, candidate) =>
        Math.max(
          height,
          candidate.scrollHeight || 0,
          candidate.getBoundingClientRect().height || 0,
        ),
      0,
    );
  }

  function ensureCodeOverlayRoot() {
    if (codeOverlayRoot?.isConnected) {
      return codeOverlayRoot;
    }

    codeOverlayRoot = document.createElement("div");

    codeOverlayRoot.id = CODE_OVERLAY_ROOT_ID;

    codeOverlayRoot.setAttribute("data-ai-turbo-overlay", "1");

    codeOverlayRoot.style.cssText =
      "position:fixed!important;inset:0!important;z-index:2147483646!important;pointer-events:none!important;overflow:visible!important;";

    (document.documentElement || document.body)?.appendChild(codeOverlayRoot);

    return codeOverlayRoot;
  }

  function positionCodeOverlay(entry, codeElement) {
    if (
      !entry?.overlay ||
      !codeElement?.isConnected ||
      !codeElement.classList.contains("ai-turbo-folded")
    ) {
      entry?.overlay?.classList.add("hidden");
      return;
    }

    const rect = codeElement.getBoundingClientRect();

    if (
      rect.width < 80 ||
      rect.height < 30 ||
      rect.bottom <= 0 ||
      rect.top >= window.innerHeight
    ) {
      entry.overlay.classList.add("hidden");
      return;
    }

    entry.overlay.classList.remove("hidden");

    entry.overlay.style.left = `${Math.max(8, rect.left)}px`;

    entry.overlay.style.top = `${Math.max(
      8,
      rect.bottom - Math.min(56, rect.height),
    )}px`;

    entry.overlay.style.width = `${Math.max(80, rect.width)}px`;

    entry.overlay.style.height = `${Math.min(56, rect.height)}px`;
  }

  function scheduleCodeOverlayPosition() {
    if (codeOverlayFrameQueued) {
      return;
    }

    codeOverlayFrameQueued = true;

    window.requestAnimationFrame(() => {
      codeOverlayFrameQueued = false;

      for (const [codeElement, entry] of codeState) {
        positionCodeOverlay(entry, codeElement);
      }
    });
  }

  function updateCodeMeta(entry, codeElement) {
    if (!entry || !codeElement?.isConnected) {
      return;
    }

    const lineCount = getCodeLineCount(codeElement);

    entry.langLabel.textContent = getCodeLanguage(codeElement);

    entry.linesLabel.textContent = lineCount
      ? `${lineCount.toLocaleString()} 行`
      : "";

    entry.toggleButton.textContent = entry.expanded
      ? "收起"
      : `展开 ${lineCount ? `${lineCount.toLocaleString()} 行` : "代码"}`;

    entry.toggleButton.setAttribute("aria-expanded", String(entry.expanded));

    codeElement.classList.add("ai-turbo-code-target");

    codeElement.classList.toggle("ai-turbo-folded", !entry.expanded);

    codeElement.classList.toggle("ai-turbo-expanded", entry.expanded);

    if (entry.expanded) {
      entry.overlay.classList.add("hidden");
    }

    positionCodeOverlay(entry, codeElement);
  }

  function unmountCodeControls(codeElement) {
    const entry = codeState.get(codeElement);

    if (!entry) return;

    withSelfMutation(() => {
      entry.overlay?.remove();

      codeElement.classList.remove(
        "ai-turbo-code-target",
        "ai-turbo-folded",
        "ai-turbo-expanded",
      );
    });

    codeState.delete(codeElement);
  }

  function mountCodeControls(codeElement) {
    if (
      !state.collapseCode ||
      !codeElement.isConnected ||
      codeState.has(codeElement)
    ) {
      return;
    }

    if (getIntrinsicCodeHeight(codeElement) <= CODE_COLLAPSE_HEIGHT) {
      return;
    }

    const overlayRoot = ensureCodeOverlayRoot();

    if (!overlayRoot) return;

    const overlay = document.createElement("div");

    overlay.className = "ai-turbo-code-overlay hidden";

    const gradient = document.createElement("div");

    gradient.className = "ai-turbo-code-overlay-gradient";

    const meta = document.createElement("div");

    meta.className = "ai-turbo-code-overlay-meta";

    const langLabel = document.createElement("span");

    langLabel.className = "ai-turbo-code-lang";

    const linesLabel = document.createElement("span");

    linesLabel.className = "ai-turbo-code-lines";

    const toggleButton = document.createElement("button");

    toggleButton.type = "button";

    toggleButton.className = "ai-turbo-code-toggle";

    toggleButton.setAttribute("aria-expanded", "false");

    meta.append(langLabel, linesLabel);

    overlay.append(gradient, meta, toggleButton);

    overlayRoot.appendChild(overlay);

    const entry = {
      overlay,
      langLabel,
      linesLabel,
      toggleButton,
      expanded: false,
    };

    codeState.set(codeElement, entry);

    withSelfMutation(() => {
      codeElement.classList.add("ai-turbo-code-target", "ai-turbo-code-folded");
    });

    toggleButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      entry.expanded = !entry.expanded;

      updateCodeMeta(entry, codeElement);

      if (!entry.expanded) {
        codeElement.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
      }

      scheduleCodeOverlayPosition();
    });

    updateCodeMeta(entry, codeElement);
  }

  function syncCodeBlocks(forceScan, dirtyCandidates) {
    if (!state.collapseCode) {
      for (const [codeElement] of codeState) {
        unmountCodeControls(codeElement);
      }

      state.foldedCodeCount = 0;
      codeScanRequested = false;
      dirtyCodeBlocks.clear();
      return;
    }

    for (const [codeElement] of codeState) {
      if (!codeElement.isConnected) {
        unmountCodeControls(codeElement);
      }
    }

    const candidates = forceScan
      ? getCodeBlocks()
      : Array.from(dirtyCandidates)
          .map(normalizeCodeElement)
          .filter(
            (element) => element instanceof HTMLElement && element.isConnected,
          );

    for (const codeElement of candidates) {
      const entry = codeState.get(codeElement);

      const intrinsicHeight = getIntrinsicCodeHeight(codeElement);

      if (entry) {
        if (!entry.expanded && intrinsicHeight <= CODE_COLLAPSE_HEIGHT) {
          unmountCodeControls(codeElement);
          continue;
        }

        updateCodeMeta(entry, codeElement);
      } else {
        mountCodeControls(codeElement);
      }

      if (codeResizeObserver) {
        codeResizeObserver.observe(codeElement);

        const sourceElement = queryFirstDeep(codeElement, [
          "pre",
          '[data-test-id="code-content"]',
          "code",
        ]);

        if (sourceElement instanceof HTMLElement) {
          codeResizeObserver.observe(sourceElement);
        }
      }
    }

    state.foldedCodeCount = Array.from(codeState.values()).filter(
      (entry) => !entry.expanded,
    ).length;

    scheduleCodeOverlayPosition();

    codeScanRequested = false;
    dirtyCodeBlocks.clear();
  }

  function injectEngineStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const styleElement = document.createElement("style");

    styleElement.id = STYLE_ID;

    styleElement.textContent = `
      .ai-turbo-dehydrated {
        content-visibility:hidden!important;
        contain:layout paint style!important;
        contain-intrinsic-size:auto 120px var(--turbo-cached-h,120px)!important;
      }

      .ai-turbo-dehydrated * {
        pointer-events:none!important;
      }

      .ai-turbo-code-target.ai-turbo-code-folded {
        max-height:${CODE_PREVIEW_HEIGHT}px!important;
        overflow:hidden!important;
      }

      .ai-turbo-code-target.ai-turbo-expanded {
        max-height:none!important;
        overflow:visible!important;
      }

      #${CODE_OVERLAY_ROOT_ID} {
        position:fixed!important;
        inset:0!important;
        pointer-events:none!important;
        overflow:visible!important;
      }

      .ai-turbo-code-overlay {
        position:fixed!important;
        display:flex!important;
        align-items:flex-end!important;
        justify-content:space-between!important;
        gap:8px!important;
        padding:0 10px 8px!important;
        box-sizing:border-box!important;
        pointer-events:none!important;
        overflow:hidden!important;
      }

      .ai-turbo-code-overlay.hidden {
        display:none!important;
      }

      .ai-turbo-code-overlay-gradient {
        position:absolute!important;
        inset:0!important;
        background:linear-gradient(
          180deg,
          rgba(13,18,28,0) 0%,
          rgba(13,18,28,.16) 20%,
          rgba(13,18,28,.94) 100%
        )!important;
        pointer-events:none!important;
      }

      .ai-turbo-code-overlay-meta {
        position:relative!important;
        z-index:1!important;
        display:inline-flex!important;
        align-items:center!important;
        gap:7px!important;
        min-width:0!important;
        max-width:calc(100% - 112px)!important;
        padding:5px 8px!important;
        border-radius:7px!important;
        background:rgba(10,14,22,.78)!important;
        border:1px solid rgba(148,163,184,.14)!important;
        backdrop-filter:blur(8px)!important;
        -webkit-backdrop-filter:blur(8px)!important;
        font:10px/1 ui-monospace,SFMono-Regular,Menlo,monospace!important;
      }

      .ai-turbo-code-lang {
        font-weight:700!important;
        color:#34d399!important;
      }

      .ai-turbo-code-lines {
        color:#94a3b8!important;
        white-space:nowrap!important;
        overflow:hidden!important;
        text-overflow:ellipsis!important;
      }

      .ai-turbo-code-toggle {
        position:relative!important;
        z-index:1!important;
        appearance:none!important;
        min-height:28px!important;
        padding:0 11px!important;
        border:1px solid rgba(148,163,184,.24)!important;
        border-radius:7px!important;
        background:rgba(10,14,22,.9)!important;
        color:#f1f5f9!important;
        font:600 11px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;
        cursor:pointer!important;
        pointer-events:auto!important;
        box-shadow:0 4px 14px rgba(0,0,0,.28)!important;
        backdrop-filter:blur(8px)!important;
        -webkit-backdrop-filter:blur(8px)!important;
      }

      .ai-turbo-code-toggle:hover {
        background:rgba(52,211,153,.15)!important;
        color:#34d399!important;
        border-color:rgba(52,211,153,.38)!important;
      }
    `;

    (document.head || document.documentElement).appendChild(styleElement);
  }

  function updateHudDashboard() {
    if (!hudStats) return;

    hudStats.total.textContent = String(state.totalTurns);

    hudStats.hidden.textContent = String(state.hiddenCount);

    hudStats.folded.textContent = String(state.foldedCodeCount);
  }

  function togglePanel(forceState) {
    if (!hudRootElement || !hudShadowRoot) {
      return;
    }

    state.hudOpen =
      typeof forceState === "boolean" ? forceState : !state.hudOpen;

    hudShadowRoot
      .getElementById("backdrop")
      ?.classList.toggle("open", state.hudOpen);

    if (state.hudOpen) {
      window.setTimeout(() => searchInput?.focus(), 60);
    }
  }

  function renderSearchResults(queryText) {
    if (!searchResultsBox) return;

    searchResultsBox.textContent = "";

    if (!queryText) return;

    const normalizedQuery = queryText.toLowerCase();

    const matches = state.indexedTurns
      .filter((record) => record.text.toLowerCase().includes(normalizedQuery))
      .slice(0, SEARCH_LIMIT);

    if (!matches.length) {
      const emptyElement = document.createElement("div");

      emptyElement.className = "result-empty";

      emptyElement.textContent = "没有匹配的消息";

      searchResultsBox.appendChild(emptyElement);

      return;
    }

    for (const record of matches) {
      const resultButton = document.createElement("button");

      resultButton.type = "button";
      resultButton.className = "result-item";

      resultButton.textContent = `#${record.id + 1}  ${
        record.text || "（无文本）"
      }`;

      resultButton.addEventListener("click", () => {
        togglePanel(false);

        record.element.classList.remove("ai-turbo-dehydrated");

        record.element.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });

        record.element.style.outline = "2px solid rgba(52,211,153,.85)";

        record.element.style.outlineOffset = "4px";

        window.setTimeout(() => {
          record.element.style.outline = "";

          record.element.style.outlineOffset = "";
        }, 1800);
      });

      searchResultsBox.appendChild(resultButton);
    }
  }

  function buildHUD() {
    if (hudRootElement?.isConnected) {
      return;
    }

    const mountTarget = document.documentElement || document.body;

    if (!mountTarget) return;

    document.getElementById(HUD_ID)?.remove();

    hudRootElement = document.createElement("div");

    hudRootElement.id = HUD_ID;

    hudRootElement.style.cssText =
      "all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;display:block!important;";

    hudShadowRoot = hudRootElement.attachShadow({
      mode: "closed",
    });

    hudShadowRoot.innerHTML = `
      <style>
        *{box-sizing:border-box}
        button,input{font:inherit}

        .docked-pill{
          pointer-events:auto;
          position:fixed;
          display:inline-flex;
          align-items:center;
          gap:6px;
          height:32px;
          padding:0 12px;
          border-radius:999px;
          background:rgba(13,18,28,.92);
          border:1px solid rgba(52,211,153,.4);
          backdrop-filter:blur(12px);
          color:#e2e8f0;
          font:600 11px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
          cursor:grab;
          user-select:none;
          touch-action:none
        }

        .docked-pill:hover{
          border-color:rgba(52,211,153,.8);
          color:#34d399
        }

        .docked-pill svg{
          width:14px;
          height:14px;
          fill:#34d399;
          pointer-events:none
        }

        .modal-backdrop{
          position:absolute;
          inset:0;
          background:rgba(0,0,0,.45);
          backdrop-filter:blur(4px);
          display:flex;
          align-items:center;
          justify-content:center;
          opacity:0;
          visibility:hidden;
          pointer-events:none;
          transition:opacity 180ms ease,visibility 180ms ease
        }

        .modal-backdrop.open{
          opacity:1;
          visibility:visible;
          pointer-events:auto
        }

        .hud-panel{
          pointer-events:auto;
          width:380px;
          max-width:92vw;
          padding:16px;
          border:1px solid rgba(148,163,184,.2);
          border-radius:16px;
          background:rgba(10,14,22,.98);
          box-shadow:0 24px 64px rgba(0,0,0,.65);
          color:#e2e8f0;
          font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif
        }

        .header{
          display:flex;
          align-items:center;
          justify-content:space-between;
          margin-bottom:12px
        }

        .brand-title{
          font-size:13px;
          font-weight:700
        }

        .brand-subtitle{
          font-size:10px;
          color:#64748b;
          margin-top:1px
        }

        .close-btn{
          background:transparent;
          border:0;
          color:#64748b;
          cursor:pointer;
          padding:4px
        }

        .close-btn:hover{
          color:#f8fafc
        }

        .status-strip{
          display:grid;
          grid-template-columns:repeat(3,1fr);
          gap:6px;
          margin-bottom:12px
        }

        .status-item{
          padding:8px;
          border:1px solid rgba(148,163,184,.1);
          border-radius:8px;
          background:rgba(255,255,255,.02);
          text-align:center
        }

        .status-label{
          font-size:9px;
          color:#64748b;
          display:block
        }

        .status-value{
          font-size:14px;
          font-weight:700;
          margin-top:2px
        }

        .section{
          padding-top:10px;
          border-top:1px solid rgba(148,163,184,.1)
        }

        .section-title{
          font-size:10px;
          font-weight:700;
          color:#64748b;
          margin-bottom:8px;
          text-transform:uppercase;
          letter-spacing:.04em
        }

        .control-row{
          display:flex;
          align-items:center;
          justify-content:space-between;
          min-height:32px;
          margin-bottom:6px;
          font-size:11px
        }

        .stepper{
          display:inline-flex;
          align-items:center;
          border:1px solid rgba(148,163,184,.2);
          border-radius:6px
        }

        .stepper button{
          width:26px;
          height:24px;
          border:0;
          background:transparent;
          color:#94a3b8;
          cursor:pointer
        }

        .stepper button:hover{
          background:rgba(255,255,255,.08);
          color:#fff
        }

        .stepper span{
          min-width:28px;
          text-align:center;
          font:11px ui-monospace,monospace
        }

        .switch{
          position:relative;
          width:34px;
          height:20px
        }

        .switch input{
          opacity:0;
          width:0;
          height:0
        }

        .slider{
          position:absolute;
          inset:0;
          border-radius:999px;
          background:rgba(148,163,184,.2);
          cursor:pointer
        }

        .slider:before{
          content:"";
          position:absolute;
          width:14px;
          height:14px;
          left:3px;
          top:3px;
          border-radius:50%;
          background:#fff;
          transition:150ms
        }

        .switch input:checked+.slider{
          background:#10b981
        }

        .switch input:checked+.slider:before{
          transform:translateX(14px)
        }

        .action-btn{
          width:100%;
          height:32px;
          margin-top:10px;
          border:1px solid rgba(148,163,184,.15);
          border-radius:8px;
          background:rgba(255,255,255,.05);
          color:#e2e8f0;
          font-size:11px;
          font-weight:600;
          cursor:pointer
        }

        .action-btn.copied{
          background:rgba(16,185,129,.2);
          color:#6ee7b7;
          border-color:rgba(52,211,153,.4)
        }

        .search-wrap{
          margin-top:8px
        }

        .search-input{
          width:100%;
          height:32px;
          padding:0 10px;
          border:1px solid rgba(148,163,184,.2);
          border-radius:8px;
          background:rgba(0,0,0,.3);
          color:#fff;
          font-size:11px;
          outline:none
        }

        .search-input:focus{
          border-color:#34d399
        }

        .results{
          max-height:120px;
          overflow:auto;
          margin-top:6px;
          display:grid;
          gap:4px
        }

        .result-item,
        .result-empty{
          padding:6px 8px;
          font-size:10px;
          border-radius:6px;
          background:rgba(255,255,255,.03);
          color:#cbd5e1;
          border:0;
          text-align:left;
          cursor:pointer
        }

        .result-item{
          overflow:hidden;
          white-space:nowrap;
          text-overflow:ellipsis
        }

        .result-empty{
          text-align:center;
          color:#64748b
        }

        .footer-hint{
          margin-top:12px;
          font-size:9.5px;
          color:#475569;
          text-align:center
        }

        kbd{
          padding:2px 4px;
          border:1px solid rgba(148,163,184,.2);
          border-radius:4px;
          color:#94a3b8;
          font-family:ui-monospace,monospace
        }
      </style>

      <button
        class="docked-pill"
        id="pill-trigger"
        type="button"
        title="点击呼出 (Alt+T)，可拖拽"
      >
        ⚡
        <span>Turbo</span>
      </button>

      <div
        class="modal-backdrop"
        id="backdrop"
      >
        <div class="hud-panel">
          <div class="header">
            <div>
              <div class="brand-title">
                AI Turbo Engine
              </div>
              <div class="brand-subtitle">
                ${currentPlatform.name} · v${VERSION}
              </div>
            </div>

            <button
              class="close-btn"
              id="btn-close"
              type="button"
            >
              ✕
            </button>
          </div>

          <div class="status-strip">
            <div class="status-item">
              <span class="status-label">
                消息总数
              </span>
              <strong
                class="status-value"
                id="total-val"
              >
                0
              </strong>
            </div>

            <div class="status-item">
              <span class="status-label">
                已脱水
              </span>
              <strong
                class="status-value"
                id="hidden-val"
              >
                0
              </strong>
            </div>

            <div class="status-item">
              <span class="status-label">
                代码折叠
              </span>
              <strong
                class="status-value"
                id="folded-val"
              >
                0
              </strong>
            </div>
          </div>

          <div class="section">
            <div class="section-title">
              引擎策略
            </div>

            <div class="control-row">
              <span>
                活跃保留轮次
              </span>

              <div class="stepper">
                <button
                  id="step-dec"
                  type="button"
                >
                  −
                </button>

                <span id="keep-val">
                  ${state.keepTurns}
                </span>

                <button
                  id="step-inc"
                  type="button"
                >
                  +
                </button>
              </div>
            </div>

            <div class="control-row">
              <span>
                安全视口脱水
              </span>

              <label class="switch">
                <input
                  id="chk-prune"
                  type="checkbox"
                  ${state.pruneEnabled ? "checked" : ""}
                >
                <span class="slider"></span>
              </label>
            </div>

            <div class="control-row">
              <span>
                长代码自动折叠
              </span>

              <label class="switch">
                <input
                  id="chk-collapse"
                  type="checkbox"
                  ${state.collapseCode ? "checked" : ""}
                >
                <span class="slider"></span>
              </label>
            </div>

            <button
              class="action-btn"
              id="btn-fork"
              type="button"
            >
              <span id="fork-text">
                提取当前上下文
              </span>
            </button>
          </div>

          <div class="section">
            <div class="section-title">
              历史检索
            </div>

            <div class="search-wrap">
              <input
                id="search-input"
                class="search-input"
                type="text"
                placeholder="检索当前会话内容..."
                autocomplete="off"
              >
            </div>

            <div
              class="results"
              id="search-results"
            ></div>
          </div>

          <div class="footer-hint">
            <kbd>Alt</kbd>
            +
            <kbd>T</kbd>
            呼出 / 收起 ·
            <kbd>Esc</kbd>
            退出
          </div>
        </div>
      </div>
    `;

    mountTarget.appendChild(hudRootElement);

    const backdrop = hudShadowRoot.getElementById("backdrop");

    const pill = hudShadowRoot.getElementById("pill-trigger");

    const btnClose = hudShadowRoot.getElementById("btn-close");

    const chkPrune = hudShadowRoot.getElementById("chk-prune");

    const chkCollapse = hudShadowRoot.getElementById("chk-collapse");

    const btnFork = hudShadowRoot.getElementById("btn-fork");

    const forkText = hudShadowRoot.getElementById("fork-text");

    const stepDec = hudShadowRoot.getElementById("step-dec");

    const stepInc = hudShadowRoot.getElementById("step-inc");

    const keepVal = hudShadowRoot.getElementById("keep-val");

    searchInput = hudShadowRoot.getElementById("search-input");

    searchResultsBox = hudShadowRoot.getElementById("search-results");

    hudStats = {
      total: hudShadowRoot.getElementById("total-val"),
      hidden: hudShadowRoot.getElementById("hidden-val"),
      folded: hudShadowRoot.getElementById("folded-val"),
    };

    initPillDrag(pill);

    btnClose?.addEventListener("click", () => togglePanel(false));

    backdrop?.addEventListener("click", (event) => {
      if (event.target === backdrop) {
        togglePanel(false);
      }
    });

    chkPrune?.addEventListener("change", () => {
      state.pruneEnabled = chkPrune.checked;

      fullTurnSyncRequested = true;
      requestUpdate();
    });

    chkCollapse?.addEventListener("change", () => {
      state.collapseCode = chkCollapse.checked;

      codeScanRequested = true;
      requestUpdate();
    });

    stepDec?.addEventListener("click", () => {
      if (state.keepTurns <= 2) {
        return;
      }

      state.keepTurns--;

      keepVal.textContent = String(state.keepTurns);

      fullTurnSyncRequested = true;
      requestUpdate();
    });

    stepInc?.addEventListener("click", () => {
      if (state.keepTurns >= 50) {
        return;
      }

      state.keepTurns++;

      keepVal.textContent = String(state.keepTurns);

      fullTurnSyncRequested = true;
      requestUpdate();
    });

    btnFork?.addEventListener("click", () => {
      exportCleanContext((count) => {
        btnFork.classList.add("copied");

        forkText.textContent = `已复制 ${count} 条消息`;

        window.setTimeout(() => {
          btnFork.classList.remove("copied");

          forkText.textContent = "提取当前上下文";
        }, 2000);
      });
    });

    searchInput?.addEventListener("input", () => {
      window.clearTimeout(searchDebounceTimer);

      searchDebounceTimer = window.setTimeout(() => {
        renderSearchResults(searchInput.value.trim());
      }, 100);
    });
  }

  function initPillDrag(pill) {
    if (!pill) return;

    let posX = window.innerWidth - 110;

    let posY = window.innerHeight - 80;

    try {
      const savedPosition = JSON.parse(
        localStorage.getItem(STORAGE_KEY_POS) || "null",
      );

      if (
        savedPosition &&
        typeof savedPosition.x === "number" &&
        typeof savedPosition.y === "number"
      ) {
        posX = Math.min(window.innerWidth - 80, Math.max(10, savedPosition.x));

        posY = Math.min(window.innerHeight - 50, Math.max(10, savedPosition.y));
      }
    } catch (_) {}

    pill.style.left = `${posX}px`;

    pill.style.top = `${posY}px`;

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;

    const onPointerMove = (event) => {
      if (!dragging) return;

      const nextX = Math.max(
        8,
        Math.min(
          window.innerWidth - pill.offsetWidth - 8,
          originX + event.clientX - startX,
        ),
      );

      const nextY = Math.max(
        8,
        Math.min(
          window.innerHeight - pill.offsetHeight - 8,
          originY + event.clientY - startY,
        ),
      );

      pill.style.left = `${nextX}px`;

      pill.style.top = `${nextY}px`;
    };

    const onPointerUp = (event) => {
      if (!dragging) return;

      dragging = false;

      window.removeEventListener("pointermove", onPointerMove);

      window.removeEventListener("pointerup", onPointerUp);

      if (
        Math.abs(event.clientX - startX) < 4 &&
        Math.abs(event.clientY - startY) < 4
      ) {
        togglePanel(true);
        return;
      }

      try {
        const rect = pill.getBoundingClientRect();

        localStorage.setItem(
          STORAGE_KEY_POS,
          JSON.stringify({
            x: rect.left,
            y: rect.top,
          }),
        );
      } catch (_) {}
    };

    pill.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }

      dragging = true;

      startX = event.clientX;
      startY = event.clientY;

      const rect = pill.getBoundingClientRect();

      originX = rect.left;
      originY = rect.top;

      window.addEventListener("pointermove", onPointerMove);

      window.addEventListener("pointerup", onPointerUp);
    });
  }

  function exportCleanContext(onSuccess) {
    const turns = getTurns();

    if (!turns.length) {
      window.alert("未检测到有效对话内容");
      return;
    }

    const sections = [];

    turns.forEach((turnElement, index) => {
      const contentText = extractTurnText(turnElement);

      if (contentText) {
        sections.push(`### Message ${index + 1}\n\n${contentText}`);
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
        if (typeof onSuccess === "function") {
          onSuccess(sections.length);
        }
      })
      .catch(() => {
        window.alert("写入剪贴板失败，请检查浏览器权限。");
      });
  }

  function collectMutationTargets(records) {
    const turnSelector = currentPlatform.turnSelectors.join(",");

    let structuralChange = false;

    for (const mutationRecord of records) {
      const mutationTarget = mutationRecord.target;

      if (
        mutationTarget instanceof Element &&
        mutationTarget.closest(`#${HUD_ID}, #${CODE_OVERLAY_ROOT_ID}`)
      ) {
        continue;
      }

      const possibleTurn =
        mutationTarget instanceof Element
          ? mutationTarget.closest(turnSelector)
          : mutationTarget.parentElement?.closest(turnSelector);

      if (
        possibleTurn instanceof Element &&
        !isGeminiThoughtElement(possibleTurn)
      ) {
        dirtyTurns.add(possibleTurn);
      }

      const codeSelectors = currentPlatform.codeSelectors || ["pre"];

      let possibleCode = null;

      if (mutationTarget instanceof Element) {
        for (const selector of codeSelectors) {
          const candidate = mutationTarget.matches(selector)
            ? mutationTarget
            : mutationTarget.closest(selector);

          if (candidate instanceof HTMLElement) {
            possibleCode = normalizeCodeElement(candidate);

            break;
          }
        }
      } else if (mutationTarget.parentElement) {
        for (const selector of codeSelectors) {
          const candidate = mutationTarget.parentElement.closest(selector);

          if (candidate instanceof HTMLElement) {
            possibleCode = normalizeCodeElement(candidate);

            break;
          }
        }
      }

      if (possibleCode instanceof HTMLElement) {
        dirtyCodeBlocks.add(possibleCode);
      }

      if (mutationRecord.type !== "childList") {
        continue;
      }

      for (const changedNode of [
        ...mutationRecord.addedNodes,
        ...mutationRecord.removedNodes,
      ]) {
        if (!(changedNode instanceof Element)) {
          continue;
        }

        if (
          changedNode.matches(turnSelector) ||
          changedNode.querySelector(turnSelector)
        ) {
          structuralChange = true;
        }

        for (const selector of codeSelectors) {
          const codeCandidates = [];

          if (changedNode.matches(selector)) {
            codeCandidates.push(changedNode);
          }

          codeCandidates.push(
            ...Array.from(changedNode.querySelectorAll(selector)),
          );

          for (const codeCandidate of codeCandidates) {
            const codeElement = normalizeCodeElement(codeCandidate);

            if (codeElement instanceof HTMLElement) {
              dirtyCodeBlocks.add(codeElement);
            }
          }
        }
      }
    }

    if (structuralChange) {
      fullTurnSyncRequested = true;
      codeScanRequested = true;
    }
  }

  function runScheduledUpdate() {
    scheduleQueued = false;

    if (selfMutationDepth > 0) {
      requestUpdate();
      return;
    }

    const currentTurnSet = new Set(previousTurns);

    for (const dirtyTurn of dirtyTurns) {
      if (!(dirtyTurn instanceof Element) || !currentTurnSet.has(dirtyTurn)) {
        fullTurnSyncRequested = true;
      }
    }

    if (currentPlatform === PLATFORMS.gemini) {
      syncGeminiShadowObservers();
    }

    syncTurnIndex(fullTurnSyncRequested);

    syncCodeBlocks(codeScanRequested, dirtyCodeBlocks);

    updateHudDashboard();
    ensureHUDMounted();
  }

  function requestUpdate() {
    if (scheduleQueued) return;

    scheduleQueued = true;

    window.requestAnimationFrame(runScheduledUpdate);
  }

  function observeCodeLayout() {
    if (!("ResizeObserver" in window)) {
      return;
    }

    codeResizeObserver?.disconnect();

    codeResizeObserver = new ResizeObserver((entries) => {
      for (const resizeEntry of entries) {
        const normalizedElement = normalizeCodeElement(resizeEntry.target);

        if (normalizedElement instanceof HTMLElement) {
          dirtyCodeBlocks.add(normalizedElement);
        }
      }

      if (entries.length) {
        scheduleCodeOverlayPosition();
        requestUpdate();
      }
    });

    getCodeBlocks().forEach((codeElement) => {
      codeResizeObserver.observe(codeElement);
    });
  }

  function observeDom() {
    const observeRoot = document.documentElement || document.body;

    if (!observeRoot) return;

    observer?.disconnect();

    observer = new MutationObserver((records) => {
      if (selfMutationDepth > 0) {
        return;
      }

      collectMutationTargets(records);

      requestUpdate();
    });

    observer.observe(observeRoot, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  function ensureHUDMounted() {
    if (!hudRootElement?.isConnected) {
      buildHUD();
    }

    if (!codeOverlayRoot?.isConnected) {
      ensureCodeOverlayRoot();
    }
  }

  function patchHistoryForSpaNavigation() {
    const originalPushState = history.pushState;

    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      const result = originalPushState.apply(this, args);

      window.setTimeout(() => {
        fullTurnSyncRequested = true;

        codeScanRequested = true;

        requestUpdate();
      }, 0);

      return result;
    };

    history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args);

      window.setTimeout(() => {
        fullTurnSyncRequested = true;

        codeScanRequested = true;

        requestUpdate();
      }, 0);

      return result;
    };

    window.addEventListener("popstate", () => {
      fullTurnSyncRequested = true;

      codeScanRequested = true;

      requestUpdate();
    });
  }

  function boot() {
    injectEngineStyles();
    buildHUD();
    ensureCodeOverlayRoot();
    observeCodeLayout();
    observeDom();
    patchHistoryForSpaNavigation();

    window.addEventListener("scroll", scheduleCodeOverlayPosition, true);

    window.addEventListener("resize", scheduleCodeOverlayPosition);

    window.addEventListener("load", () => {
      fullTurnSyncRequested = true;
      codeScanRequested = true;
      requestUpdate();
    });

    window.setTimeout(() => {
      fullTurnSyncRequested = true;
      codeScanRequested = true;
      requestUpdate();
    }, 250);

    window.setTimeout(() => {
      fullTurnSyncRequested = true;
      codeScanRequested = true;
      requestUpdate();
    }, 1000);

    window.setTimeout(() => {
      fullTurnSyncRequested = true;
      codeScanRequested = true;
      requestUpdate();
    }, 2500);

    window.addEventListener("keydown", (event) => {
      if (
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        (event.code === "KeyT" || event.key.toLowerCase() === "t")
      ) {
        event.preventDefault();
        togglePanel();
        return;
      }

      if (event.key === "Escape" && state.hudOpen) {
        event.preventDefault();
        togglePanel(false);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
