// ==UserScript==
// @name         AI Chat Turbo Engine
// @namespace    https://local/ai-turbo-engine-v3
// @version      0.3.0
// @description  增量消息索引 + 安全视口脱水 + 独立代码预览折叠 + Gemini 兼容挂载
// @author       Yoko
// @match        https://chatgpt.com/*
// @match        https://gemini.google.com/*
// @match        https://grok.com/*
// @match        https://x.com/i/grok*
// @match        https://claude.ai/*
// @run-at       document-start
// @grant        none
// @noframes
// @icon         data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="64" height="64"><rect width="24" height="24" rx="6" fill="%2309090b"/><path d="M13 2L3 14h8l-1 8 11-12h-8l1-8z" fill="%2310b981"/></svg>
// @license      MIT
// ==/UserScript==

(function () {
  "use strict";

  const VERSION = "0.3.0";
  const HUD_ID = "ai-turbo-extreme-hud";
  const STYLE_ID = "ai-turbo-engine-styles";
  const CODE_SHELL_CLASS = "ai-turbo-code-shell";
  const CODE_COLLAPSE_HEIGHT = 320;
  const CODE_PREVIEW_HEIGHT = 220;
  const TURN_TEXT_LIMIT = 800;
  const SEARCH_LIMIT = 10;

  const PLATFORMS = {
    chatgpt: {
      name: "ChatGPT",
      turnSelectors: [
        '[data-message-author-role="user"]',
        '[data-message-author-role="assistant"]',
        'article[data-testid^="conversation-turn-"]',
      ],
      codeSelector: "pre",
      contentSelectors: ["div.markdown", "div.prose", '[class*="markdown"]'],
    },

    gemini: {
      name: "Gemini",
      turnSelectors: [
        "user-query",
        "model-response",
        '[data-message-author="user"]',
        '[data-message-author="model"]',
        ".user-query",
        ".model-response",
      ],
      codeSelector: "code-block, pre:not(code-block pre)",
      contentSelectors: [
        ".query-text",
        "[class*='query-content']",
        ".model-response-text",
        ".message-content",
        ".markdown",
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
      codeSelector: "pre",
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
      codeSelector: "pre",
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
    if (host.includes("grok.com") || host.includes("x.com")) {
      return PLATFORMS.grok;
    }
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
  const codeState = new WeakMap();

  let hudRootElement = null;
  let hudShadowRoot = null;
  let hudStats = null;
  let searchInput = null;
  let searchResultsBox = null;
  let searchDebounceTimer = null;
  let observer = null;
  let codeResizeObserver = null;

  let scheduleFrameId = 0;
  let scheduleQueued = false;
  let fullTurnSyncRequested = true;
  let codeScanRequested = true;
  let dirtyTurns = new Set();
  let dirtyCodeBlocks = new Set();
  let previousTurns = [];
  let previousCutoff = 0;
  let selfMutationDepth = 0;

  const POS_STORAGE_KEY = "ai_turbo_hud_position";

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

  function uniqueDomOrdered(elements) {
    const seen = new Set();
    const unique = [];

    for (const element of elements) {
      if (!(element instanceof Element)) continue;
      if (seen.has(element)) continue;

      seen.add(element);
      unique.push(element);
    }

    unique.sort((firstElement, secondElement) => {
      if (firstElement === secondElement) return 0;

      const relation = firstElement.compareDocumentPosition(secondElement);

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
      if (candidates.has(parentElement)) return true;
      parentElement = parentElement.parentElement;
    }

    return false;
  }

  function getTurns() {
    const collected = [];

    for (const selector of currentPlatform.turnSelectors) {
      const nodes = document.querySelectorAll(selector);

      for (const node of nodes) {
        collected.push(node);
      }
    }

    const ordered = uniqueDomOrdered(collected);
    const candidateSet = new Set(ordered);

    return ordered.filter((element) => !isNestedTurn(element, candidateSet));
  }

  function findContentElement(turnElement) {
    for (const selector of currentPlatform.contentSelectors) {
      const contentElement = turnElement.querySelector(selector);

      if (contentElement) {
        return contentElement;
      }
    }

    return turnElement;
  }

  function extractTurnText(turnElement) {
    const contentElement = findContentElement(turnElement);

    const visibleText =
      typeof contentElement.innerText === "string"
        ? contentElement.innerText
        : contentElement.textContent || "";

    return normalizeText(visibleText);
  }

  function buildTurnRecord(element, index) {
    return {
      id: index,
      element,
      text: extractTurnText(element),
    };
  }

  function syncTurnIndex(forceFull) {
    const turns = getTurns();

    const previousLength = previousTurns.length;

    const firstChanged = turns[0] !== previousTurns[0];

    const lastChanged =
      turns[turns.length - 1] !== previousTurns[previousTurns.length - 1];

    const identityChanged = firstChanged || lastChanged;

    const structuralChange = forceFull || identityChanged;

    if (structuralChange) {
      turnIndex.clear();

      for (let index = 0; index < turns.length; index++) {
        const turnElement = turns[index];

        turnIndex.set(turnElement, buildTurnRecord(turnElement, index));
      }
    } else {
      for (const turnElement of dirtyTurns) {
        const record = turnIndex.get(turnElement);

        if (!record) {
          fullTurnSyncRequested = true;
          continue;
        }

        record.text = extractTurnText(turnElement);
      }
    }

    state.totalTurns = turns.length;

    state.indexedTurns = turns.map((turnElement, index) => {
      const record = turnIndex.get(turnElement);

      if (record) {
        record.id = index;
        return record;
      }

      const fallbackRecord = buildTurnRecord(turnElement, index);

      turnIndex.set(turnElement, fallbackRecord);

      return fallbackRecord;
    });

    applyPruneWindow(turns, {
      forceFull: structuralChange || previousLength === 0,

      previousLength,
    });

    previousTurns = turns;
    dirtyTurns.clear();
    fullTurnSyncRequested = false;
  }

  function applyPruneWindow(turns, options = {}) {
    const cutoff = state.pruneEnabled
      ? Math.max(0, turns.length - state.keepTurns)
      : 0;

    const forceFull = options.forceFull === true;

    if (forceFull) {
      for (let index = 0; index < turns.length; index++) {
        turns[index].classList.toggle(
          "ai-turbo-dehydrated",
          state.pruneEnabled && index < cutoff,
        );
      }
    } else if (cutoff !== previousCutoff) {
      const startIndex = Math.min(previousCutoff, cutoff);

      const endIndex = Math.max(previousCutoff, cutoff);

      for (let index = startIndex; index < endIndex; index++) {
        const turnElement = turns[index];

        if (!turnElement) continue;

        turnElement.classList.toggle(
          "ai-turbo-dehydrated",
          state.pruneEnabled && index < cutoff,
        );
      }
    }

    state.hiddenCount = cutoff;
    previousCutoff = cutoff;
  }

  function getCodeBlocks(rootElement = document) {
    const nodes = rootElement.querySelectorAll(currentPlatform.codeSelector);

    const result = [];
    const seen = new Set();

    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }

      if (seen.has(node)) continue;

      if (node.closest(`.${CODE_SHELL_CLASS}`)) {
        continue;
      }

      if (
        node.matches("pre") &&
        currentPlatform === PLATFORMS.gemini &&
        node.parentElement?.closest("code-block")
      ) {
        continue;
      }

      seen.add(node);
      result.push(node);
    }

    return result;
  }

  function getCodeText(codeElement) {
    const preElement = codeElement.matches("pre")
      ? codeElement
      : codeElement.querySelector("pre");

    const sourceElement =
      preElement?.querySelector("code") || preElement || codeElement;

    return typeof sourceElement.textContent === "string"
      ? sourceElement.textContent
      : "";
  }

  function getCodeLanguage(codeElement) {
    const languageElement = codeElement.querySelector(
      'code[class*="language-"], [class*="language-"]',
    );

    if (!languageElement) {
      return "代码";
    }

    const classText = String(languageElement.className || "");

    const match = classText.match(/language-([a-z0-9+#.-]+)/i);

    return match ? match[1].toUpperCase() : "代码";
  }

  function getCodeLineCount(codeElement) {
    const codeText = getCodeText(codeElement);

    if (!codeText) return 0;

    return codeText.replace(/\r\n/g, "\n").split("\n").length;
  }

  function updateCodeMeta(codeStateEntry, codeElement) {
    if (!codeStateEntry || !codeElement.isConnected) {
      return;
    }

    const lineCount = getCodeLineCount(codeElement);

    const language = getCodeLanguage(codeElement);

    codeStateEntry.languageLabel.textContent = language;

    codeStateEntry.metaLabel.textContent = lineCount
      ? `${lineCount.toLocaleString()} 行`
      : "代码预览";

    codeStateEntry.toggleButton.textContent = codeStateEntry.expanded
      ? "收起代码"
      : `展开 ${lineCount ? `${lineCount.toLocaleString()} 行` : "代码"}`;

    codeStateEntry.shell.classList.toggle(
      "is-expanded",
      codeStateEntry.expanded,
    );
  }

  function unmountCodeShell(codeElement) {
    const codeStateEntry = codeState.get(codeElement);

    if (!codeStateEntry) {
      return;
    }

    withSelfMutation(() => {
      const shell = codeStateEntry.shell;

      if (shell.parentNode) {
        shell.parentNode.insertBefore(codeElement, shell);

        shell.remove();
      }
    });

    codeState.delete(codeElement);
  }

  function mountCodeShell(codeElement) {
    if (!state.collapseCode) {
      return;
    }

    if (!codeElement.isConnected) {
      return;
    }

    if (codeElement.closest(`.${CODE_SHELL_CLASS}`)) {
      return;
    }

    const measuredHeight = Math.max(
      codeElement.scrollHeight || 0,
      codeElement.getBoundingClientRect().height || 0,
    );

    if (measuredHeight <= CODE_COLLAPSE_HEIGHT) {
      return;
    }

    const shell = document.createElement("div");

    shell.className = CODE_SHELL_CLASS;

    const header = document.createElement("div");

    header.className = "ai-turbo-code-header";

    const headerLeft = document.createElement("div");

    headerLeft.className = "ai-turbo-code-header-left";

    const languageLabel = document.createElement("span");

    languageLabel.className = "ai-turbo-code-language";

    headerLeft.appendChild(languageLabel);

    const metaLabel = document.createElement("span");

    metaLabel.className = "ai-turbo-code-meta";

    headerLeft.appendChild(metaLabel);

    const headerHint = document.createElement("span");

    headerHint.className = "ai-turbo-code-status";

    headerHint.textContent = "自动预览";

    header.appendChild(headerLeft);

    header.appendChild(headerHint);

    const content = document.createElement("div");

    content.className = "ai-turbo-code-content";

    const fade = document.createElement("div");

    fade.className = "ai-turbo-code-fade";

    const footer = document.createElement("div");

    footer.className = "ai-turbo-code-footer";

    const toggleButton = document.createElement("button");

    toggleButton.type = "button";

    toggleButton.className = "ai-turbo-code-toggle";

    toggleButton.setAttribute("aria-expanded", "false");

    footer.appendChild(toggleButton);

    codeElement.parentNode?.insertBefore(shell, codeElement);

    shell.appendChild(header);

    shell.appendChild(content);

    content.appendChild(codeElement);

    content.appendChild(fade);

    shell.appendChild(footer);

    const entry = {
      shell,
      content,
      languageLabel,
      metaLabel,
      toggleButton,
      expanded: false,
    };

    codeState.set(codeElement, entry);

    toggleButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      entry.expanded = !entry.expanded;

      shell.classList.toggle("is-expanded", entry.expanded);

      toggleButton.setAttribute("aria-expanded", String(entry.expanded));

      headerHint.textContent = entry.expanded ? "完整代码" : "自动预览";

      if (!entry.expanded) {
        shell.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
      }

      updateCodeMeta(entry, codeElement);
    });

    updateCodeMeta(entry, codeElement);
  }

  function syncCodeBlocks(forceScan, dirtyCandidates) {
    if (!state.collapseCode) {
      document.querySelectorAll(`.${CODE_SHELL_CLASS}`).forEach((shell) => {
        const sourceElement = shell.querySelector("pre, code-block");

        if (sourceElement) {
          unmountCodeShell(sourceElement);
        }
      });

      state.foldedCodeCount = 0;
      codeScanRequested = false;
      dirtyCodeBlocks.clear();

      return;
    }

    const candidates = forceScan
      ? getCodeBlocks()
      : Array.from(dirtyCandidates).filter(
          (element) => element instanceof HTMLElement && element.isConnected,
        );

    for (const codeElement of candidates) {
      if (codeResizeObserver) {
        codeResizeObserver.observe(codeElement);
      }

      const entry = codeState.get(codeElement);

      if (entry) {
        updateCodeMeta(entry, codeElement);

        continue;
      }

      mountCodeShell(codeElement);
    }

    if (forceScan) {
      document
        .querySelectorAll(
          `.${CODE_SHELL_CLASS} pre,
           .${CODE_SHELL_CLASS} code-block`,
        )
        .forEach((codeElement) => {
          if (codeElement instanceof HTMLElement && codeResizeObserver) {
            codeResizeObserver.observe(codeElement);
          }
        });
    }

    state.foldedCodeCount = document.querySelectorAll(
      `.${CODE_SHELL_CLASS}:not(.is-expanded)`,
    ).length;

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
        content-visibility: hidden !important;
        contain: layout paint style !important;
        contain-intrinsic-size: 1px 120px !important;
      }

      .ai-turbo-dehydrated * {
        pointer-events: none !important;
      }

      .${CODE_SHELL_CLASS} {
        display: block !important;
        width: 100% !important;
        margin: 14px 0 !important;
        border: 1px solid rgba(148, 163, 184, 0.16) !important;
        border-radius: 12px !important;
        background: rgba(15, 23, 42, 0.56) !important;
        overflow: hidden !important;
        isolation: isolate !important;
      }

      .${CODE_SHELL_CLASS} .ai-turbo-code-header,
      .${CODE_SHELL_CLASS} .ai-turbo-code-footer {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        min-height: 34px !important;
        padding: 7px 10px !important;
        background: rgba(15, 23, 42, 0.72) !important;
        border-color: rgba(148, 163, 184, 0.1) !important;
      }

      .${CODE_SHELL_CLASS} .ai-turbo-code-header {
        gap: 12px !important;
        border-bottom: 1px solid rgba(148, 163, 184, 0.1) !important;
      }

      .${CODE_SHELL_CLASS} .ai-turbo-code-footer {
        justify-content: center !important;
        border-top: 1px solid rgba(148, 163, 184, 0.1) !important;
      }

      .${CODE_SHELL_CLASS} .ai-turbo-code-header-left {
        display: inline-flex !important;
        align-items: center !important;
        gap: 8px !important;
        min-width: 0 !important;
      }

      .${CODE_SHELL_CLASS} .ai-turbo-code-language {
        color: #e2e8f0 !important;
        font:
          600 11px/1.2
          ui-monospace,
          SFMono-Regular,
          Menlo,
          monospace !important;
        letter-spacing: 0.02em !important;
      }

      .${CODE_SHELL_CLASS} .ai-turbo-code-meta,
      .${CODE_SHELL_CLASS} .ai-turbo-code-status {
        color: #7c8aa0 !important;
        font:
          500 10px/1.2
          ui-monospace,
          SFMono-Regular,
          Menlo,
          monospace !important;
      }

      .${CODE_SHELL_CLASS} .ai-turbo-code-content {
        position: relative !important;
        overflow: hidden !important;
        max-height: ${CODE_PREVIEW_HEIGHT}px !important;
      }

      .${CODE_SHELL_CLASS}.is-expanded
      .ai-turbo-code-content {
        max-height: none !important;
        overflow: visible !important;
      }

      .${CODE_SHELL_CLASS} .ai-turbo-code-fade {
        position: absolute !important;
        inset: auto 0 0 0 !important;
        height: 72px !important;
        background: linear-gradient(
          180deg,
          rgba(15, 23, 42, 0),
          rgba(15, 23, 42, 0.92)
        ) !important;
        pointer-events: none !important;
        opacity: 1 !important;
        transition:
          opacity 160ms ease !important;
      }

      .${CODE_SHELL_CLASS}.is-expanded
      .ai-turbo-code-fade {
        opacity: 0 !important;
      }

      .${CODE_SHELL_CLASS} .ai-turbo-code-toggle {
        appearance: none !important;
        border: 0 !important;
        background: transparent !important;
        color: #cbd5e1 !important;
        padding: 4px 10px !important;
        border-radius: 7px !important;
        font:
          600 11px/1.2
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          sans-serif !important;
        cursor: pointer !important;
        transition:
          background 140ms ease,
          color 140ms ease !important;
      }

      .${CODE_SHELL_CLASS} .ai-turbo-code-toggle:hover {
        background: rgba(148, 163, 184, 0.12) !important;
        color: #f8fafc !important;
      }

      .${CODE_SHELL_CLASS} .ai-turbo-code-toggle:focus-visible {
        outline:
          2px solid
          rgba(52, 211, 153, 0.72) !important;
        outline-offset: 2px !important;
      }

      .${CODE_SHELL_CLASS} pre,
      .${CODE_SHELL_CLASS} code-block {
        max-width: 100% !important;
        box-sizing: border-box !important;
      }

      @media (prefers-reduced-motion: reduce) {
        .${CODE_SHELL_CLASS}
        .ai-turbo-code-toggle {
          transition: none !important;
        }
      }
    `;

    (document.head || document.documentElement).appendChild(styleElement);
  }

  function getSavedPosition() {
    try {
      const storedPosition = JSON.parse(
        localStorage.getItem(POS_STORAGE_KEY) || "null",
      );

      if (
        storedPosition &&
        typeof storedPosition.x === "number" &&
        typeof storedPosition.y === "number"
      ) {
        const maxX = Math.max(10, window.innerWidth - 52);

        const maxY = Math.max(10, window.innerHeight - 52);

        return {
          x: Math.min(Math.max(10, storedPosition.x), maxX),

          y: Math.min(Math.max(10, storedPosition.y), maxY),
        };
      }
    } catch (_) {}

    return {
      x: Math.max(10, window.innerWidth - 58),

      y: Math.max(10, window.innerHeight - 76),
    };
  }

  function savePosition(x, y) {
    try {
      localStorage.setItem(
        POS_STORAGE_KEY,
        JSON.stringify({
          x,
          y,
        }),
      );
    } catch (_) {}
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

    const panel = hudShadowRoot.getElementById("panel");

    const searchBox = hudShadowRoot.getElementById("search-section");

    panel?.classList.toggle("open", state.hudOpen);

    if (searchBox) {
      searchBox.hidden = !state.hudOpen;
    }

    if (state.hudOpen) {
      window.setTimeout(() => searchInput?.focus(), 80);
    }
  }

  function renderSearchResults(queryText) {
    if (!searchResultsBox) {
      return;
    }

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
        record.element.classList.remove("ai-turbo-dehydrated");

        record.element.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });

        record.element.style.outline = "1px solid rgba(52, 211, 153, 0.7)";

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

    if (!document.body) {
      return;
    }

    const existingRoot = document.getElementById(HUD_ID);

    if (existingRoot) {
      existingRoot.remove();
    }

    hudRootElement = document.createElement("div");

    hudRootElement.id = HUD_ID;

    hudRootElement.setAttribute("data-ai-turbo-host", "1");

    hudRootElement.style.cssText = [
      "position:fixed !important",
      "display:block !important",
      "visibility:visible !important",
      "opacity:1 !important",
      "pointer-events:auto !important",
      "z-index:2147483647 !important",
      "width:42px !important",
      "height:42px !important",
      "margin:0 !important",
      "padding:0 !important",
      "border:0 !important",
      "background:transparent !important",
      "box-shadow:none !important",
      "transform:none !important",
      "inset:auto !important",
      "contain:layout style !important",
    ].join(";");

    hudShadowRoot = hudRootElement.attachShadow({
      mode: "closed",
    });

    const styles = `
      :host {
        all: initial;
        position: fixed;
        width: 42px;
        height: 42px;
        z-index: 2147483647;
        font-family:
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          Roboto,
          "PingFang SC",
          "Microsoft YaHei",
          sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      button,
      input {
        font: inherit;
      }

      .hud-ball {
        position: relative;
        width: 42px;
        height: 42px;
        display: grid;
        place-items: center;
        border: 1px solid
          rgba(255, 255, 255, 0.16);
        border-radius: 13px;
        background:
          rgba(
            13,
            18,
            28,
            0.9
          );
        box-shadow:
          0 8px 24px
            rgba(0, 0, 0, 0.28),
          inset 0 1px 0
            rgba(
              255,
              255,
              255,
              0.08
            );
        backdrop-filter:
          blur(14px)
          saturate(130%);
        -webkit-backdrop-filter:
          blur(14px)
          saturate(130%);
        color: #34d399;
        cursor: grab;
        user-select: none;
      }

      .hud-ball::after {
        content: "";
        position: absolute;
        inset: 7px;
        border-radius: 9px;
        border: 1px solid
          rgba(
            52,
            211,
            153,
            0.12
          );
        pointer-events: none;
      }

      .hud-ball:hover {
        border-color:
          rgba(
            52,
            211,
            153,
            0.42
          );
        box-shadow:
          0 10px 28px
            rgba(0, 0, 0, 0.34),
          0 0 0 1px
            rgba(
              52,
              211,
              153,
              0.08
            );
      }

      .hud-ball:active {
        cursor: grabbing;
      }

      .hud-ball svg {
        width: 20px;
        height: 20px;
        position: relative;
        z-index: 1;
      }

      .hud-panel {
        position: absolute;
        right: 0;
        bottom: 52px;
        width: 342px;
        padding: 12px;
        border: 1px solid
          rgba(
            148,
            163,
            184,
            0.16
          );
        border-radius: 14px;
        background:
          rgba(
            10,
            14,
            22,
            0.96
          );
        box-shadow:
          0 22px 60px
            rgba(
              0,
              0,
              0,
              0.42
            ),
          0 0 0 1px
            rgba(
              255,
              255,
              255,
              0.02
            );
        color: #e2e8f0;
        opacity: 0;
        pointer-events: none;
        transform:
          translateY(7px)
          scale(0.985);
        transform-origin:
          bottom right;
        transition:
          opacity 150ms ease,
          transform
            150ms
            cubic-bezier(
              0.16,
              1,
              0.3,
              1
            );
      }

      .hud-panel.open {
        opacity: 1;
        pointer-events: auto;
        transform:
          translateY(0)
          scale(1);
      }

      .hud-panel.pos-left {
        left: 0;
        right: auto;
        transform-origin:
          bottom left;
      }

      .hud-panel.pos-top {
        top: 52px;
        bottom: auto;
        transform-origin:
          top right;
      }

      .hud-panel.pos-top.pos-left {
        transform-origin:
          top left;
      }

      .header {
        display: flex;
        align-items: center;
        justify-content:
          space-between;
        gap: 10px;
        min-height: 26px;
        margin-bottom: 10px;
      }

      .brand {
        display: flex;
        align-items: center;
        min-width: 0;
        gap: 8px;
      }

      .brand-mark {
        display: grid;
        place-items: center;
        width: 22px;
        height: 22px;
        border-radius: 7px;
        background:
          rgba(
            52,
            211,
            153,
            0.1
          );
        border: 1px solid
          rgba(
            52,
            211,
            153,
            0.16
          );
        color: #34d399;
      }

      .brand-mark svg {
        width: 13px;
        height: 13px;
      }

      .brand-text {
        min-width: 0;
      }

      .brand-title {
        font-size: 12px;
        line-height: 1.2;
        font-weight: 700;
        color: #f8fafc;
      }

      .brand-subtitle {
        margin-top: 2px;
        font-size: 9.5px;
        line-height: 1.2;
        color: #64748b;
      }

      .close-btn {
        appearance: none;
        width: 26px;
        height: 26px;
        padding: 0;
        display: grid;
        place-items: center;
        border: 1px solid transparent;
        border-radius: 7px;
        background: transparent;
        color: #64748b;
        cursor: pointer;
      }

      .close-btn:hover {
        background:
          rgba(
            148,
            163,
            184,
            0.08
          );
        color: #cbd5e1;
      }

      .status-strip {
        display: grid;
        grid-template-columns:
          repeat(
            3,
            1fr
          );
        gap: 6px;
        margin-bottom: 10px;
      }

      .status-item {
        padding: 7px 8px;
        border: 1px solid
          rgba(
            148,
            163,
            184,
            0.1
          );
        border-radius: 9px;
        background:
          rgba(
            148,
            163,
            184,
            0.035
          );
      }

      .status-label {
        font-size: 9px;
        line-height: 1.2;
        color: #64748b;
      }

      .status-value {
        display: block;
        margin-top: 3px;
        font-size: 14px;
        line-height: 1.15;
        font-weight: 700;
        font-variant-numeric:
          tabular-nums;
        color: #f1f5f9;
      }

      .section {
        padding-top: 10px;
        border-top: 1px solid
          rgba(
            148,
            163,
            184,
            0.08
          );
      }

      .section-title {
        margin-bottom: 5px;
        font-size: 9.5px;
        line-height: 1.2;
        font-weight: 700;
        color: #64748b;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .control-row {
        display: flex;
        align-items: center;
        justify-content:
          space-between;
        min-height: 34px;
        gap: 12px;
      }

      .control-label {
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 7px;
        color: #dbe4ee;
        font-size: 11px;
      }

      .control-label svg {
        width: 14px;
        height: 14px;
        color: #7c8aa0;
        flex: 0 0 auto;
      }

      .stepper {
        display: inline-flex;
        align-items: center;
        border: 1px solid
          rgba(
            148,
            163,
            184,
            0.12
          );
        border-radius: 8px;
        overflow: hidden;
        background:
          rgba(
            0,
            0,
            0,
            0.2
          );
      }

      .stepper button {
        width: 28px;
        height: 25px;
        display: grid;
        place-items: center;
        padding: 0;
        border: 0;
        background: transparent;
        color: #94a3b8;
        cursor: pointer;
      }

      .stepper button:hover {
        background:
          rgba(
            148,
            163,
            184,
            0.09
          );
        color: #f8fafc;
      }

      .stepper span {
        min-width: 34px;
        text-align: center;
        color: #f8fafc;
        font:
          600 11px/1.2
          ui-monospace,
          SFMono-Regular,
          Menlo,
          monospace;
      }

      .switch {
        position: relative;
        width: 34px;
        height: 20px;
        flex: 0 0 auto;
      }

      .switch input {
        position: absolute;
        opacity: 0;
        inset: 0;
        margin: 0;
      }

      .slider {
        position: absolute;
        inset: 0;
        border: 1px solid
          rgba(
            148,
            163,
            184,
            0.14
          );
        border-radius: 999px;
        background:
          rgba(
            148,
            163,
            184,
            0.16
          );
        cursor: pointer;
      }

      .slider::before {
        content: "";
        position: absolute;
        width: 14px;
        height: 14px;
        left: 2px;
        top: 2px;
        border-radius: 50%;
        background: #f8fafc;
        box-shadow:
          0 1px 3px
            rgba(
              0,
              0,
              0,
              0.3
            );
        transition:
          transform 150ms ease;
      }

      .switch input:checked
      + .slider {
        background: #059669;
        border-color: #10b981;
      }

      .switch input:checked
      + .slider::before {
        transform:
          translateX(14px);
      }

      .switch
      input:focus-visible
      + .slider {
        outline:
          2px solid
          rgba(
            52,
            211,
            153,
            0.65
          );
        outline-offset: 2px;
      }

      .action-btn {
        width: 100%;
        min-height: 34px;
        margin-top: 8px;
        padding: 7px 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        border: 1px solid
          rgba(
            148,
            163,
            184,
            0.13
          );
        border-radius: 9px;
        background:
          rgba(
            148,
            163,
            184,
            0.055
          );
        color: #e2e8f0;
        font-size: 11px;
        font-weight: 650;
        cursor: pointer;
      }

      .action-btn:hover {
        background:
          rgba(
            52,
            211,
            153,
            0.09
          );
        border-color:
          rgba(
            52,
            211,
            153,
            0.22
          );
        color: #f8fafc;
      }

      .action-btn.copied {
        background:
          rgba(
            5,
            150,
            105,
            0.14
          );
        border-color:
          rgba(
            52,
            211,
            153,
            0.3
          );
        color: #6ee7b7;
      }

      .search-section[hidden] {
        display: none;
      }

      .search-wrap {
        position: relative;
        margin-top: 9px;
      }

      .search-input {
        width: 100%;
        height: 32px;
        padding:
          0 10px 0 28px;
        border: 1px solid
          rgba(
            148,
            163,
            184,
            0.12
          );
        border-radius: 8px;
        outline: none;
        background:
          rgba(
            0,
            0,
            0,
            0.2
          );
        color: #f8fafc;
        font-size: 10.5px;
      }

      .search-input:focus {
        border-color:
          rgba(
            52,
            211,
            153,
            0.38
          );
        box-shadow:
          0 0 0 2px
          rgba(
            52,
            211,
            153,
            0.08
          );
      }

      .search-input::placeholder {
        color: #5f6d80;
      }

      .search-icon {
        position: absolute;
        left: 9px;
        top: 9px;
        width: 14px;
        height: 14px;
        color: #64748b;
        pointer-events: none;
      }

      .results {
        max-height: 126px;
        overflow: auto;
        margin-top: 6px;
        display: grid;
        gap: 4px;
      }

      .result-item,
      .result-empty {
        width: 100%;
        min-height: 28px;
        padding: 6px 8px;
        border-radius: 7px;
        border: 1px solid
          rgba(
            148,
            163,
            184,
            0.08
          );
        background:
          rgba(
            148,
            163,
            184,
            0.025
          );
        color: #cbd5e1;
        font-size: 10px;
        text-align: left;
      }

      .result-item {
        cursor: pointer;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .result-item:hover {
        background:
          rgba(
            52,
            211,
            153,
            0.07
          );
        border-color:
          rgba(
            52,
            211,
            153,
            0.16
          );
        color: #f8fafc;
      }

      .result-empty {
        color: #64748b;
        text-align: center;
      }

      .footer-hint {
        margin-top: 9px;
        color: #4f5d70;
        font-size: 9px;
        line-height: 1.4;
        text-align: center;
      }

      kbd {
        padding: 1px 4px;
        border: 1px solid
          rgba(
            148,
            163,
            184,
            0.13
          );
        border-radius: 4px;
        background:
          rgba(
            148,
            163,
            184,
            0.05
          );
        color: #7c8aa0;
        font:
          600 9px/1.2
          ui-monospace,
          SFMono-Regular,
          Menlo,
          monospace;
      }

      @media (
        prefers-reduced-motion: reduce
      ) {
        .hud-panel,
        .slider::before {
          transition: none !important;
        }
      }
    `;

    hudShadowRoot.innerHTML = `
      <div
        class="hud-panel"
        id="panel"
      >
        <div class="header">
          <div class="brand">
            <div
              class="brand-mark"
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
              >
                <path
                  d="M13 2L3 14h8l-1 8 11-12h-8l1-8z"
                  fill="currentColor"
                />
              </svg>
            </div>

            <div class="brand-text">
              <div class="brand-title">
                AI Turbo Engine
              </div>

              <div class="brand-subtitle">
                ${currentPlatform.name}
                · v${VERSION}
              </div>
            </div>
          </div>

          <button
            class="close-btn"
            id="btn-close"
            type="button"
            title="关闭面板"
            aria-label="关闭面板"
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18"/>
            </svg>
          </button>
        </div>

        <div class="status-strip">
          <div class="status-item">
            <span class="status-label">
              消息
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
              代码
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
            优化策略
          </div>

          <div class="control-row">
            <span class="control-label">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                />

                <path d="M12 7v5l3 2"/>
              </svg>

              活跃保留消息
            </span>

            <div class="stepper">
              <button
                id="step-dec"
                type="button"
                title="减少"
              >
                −
              </button>

              <span id="keep-val">
                ${state.keepTurns}
              </span>

              <button
                id="step-inc"
                type="button"
                title="增加"
              >
                +
              </button>
            </div>
          </div>

          <div class="control-row">
            <span class="control-label">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              >
                <path
                  d="M12 3l7 3v5c0 5-3.2 8.5-7 10-3.8-1.5-7-5-7-10V6l7-3z"
                />
              </svg>

              安全视口脱水
            </span>

            <label class="switch">
              <input
                id="chk-prune"
                type="checkbox"
                ${state.pruneEnabled ? "checked" : ""}
                aria-label="安全视口脱水"
              />

              <span class="slider"></span>
            </label>
          </div>

          <div class="control-row">
            <span class="control-label">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              >
                <path
                  d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"
                />
              </svg>

              长代码自动折叠
            </span>

            <label class="switch">
              <input
                id="chk-collapse"
                type="checkbox"
                ${state.collapseCode ? "checked" : ""}
                aria-label="长代码自动折叠"
              />

              <span class="slider"></span>
            </label>
          </div>

          <button
            class="action-btn"
            id="btn-fork"
            type="button"
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M8 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
              />

              <rect
                x="8"
                y="2"
                width="8"
                height="4"
                rx="1"
              />

              <path
                d="M13 13l8-8M17 5h4v4"
              />
            </svg>

            <span id="fork-text">
              提取当前上下文
            </span>
          </button>
        </div>

        <div
          class="search-section section"
          id="search-section"
          hidden
        >
          <div class="section-title">
            历史检索
          </div>

          <div class="search-wrap">
            <svg
              class="search-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            >
              <circle
                cx="10.5"
                cy="10.5"
                r="6.5"
              />

              <path d="M16 16l4.5 4.5"/>
            </svg>

            <input
              id="search-input"
              class="search-input"
              type="text"
              placeholder="检索当前会话..."
              autocomplete="off"
              spellcheck="false"
            />
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
          展开 / 收起 · 拖拽吸附边缘
        </div>
      </div>

      <button
        class="hud-ball"
        id="ball"
        type="button"
        title="AI Turbo Engine"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M13 2L3 14h8l-1 8 11-12h-8l1-8z"
            fill="currentColor"
          />
        </svg>
      </button>
    `;

    document.body.appendChild(hudRootElement);

    const ball = hudShadowRoot.getElementById("ball");

    const panel = hudShadowRoot.getElementById("panel");

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

    let currentPosition = getSavedPosition();

    let isDragging = false;
    let hasMoved = false;

    let dragStartX = 0;
    let dragStartY = 0;

    let initialX = 0;
    let initialY = 0;

    function applyPosition(x, y) {
      const maxX = Math.max(8, window.innerWidth - 50);

      const maxY = Math.max(8, window.innerHeight - 50);

      const safeX = Math.min(Math.max(8, x), maxX);

      const safeY = Math.min(Math.max(8, y), maxY);

      hudRootElement.style.left = `${safeX}px`;

      hudRootElement.style.top = `${safeY}px`;

      panel?.classList.toggle("pos-left", safeX < 320);

      panel?.classList.toggle("pos-top", safeY < 300);
    }

    applyPosition(currentPosition.x, currentPosition.y);

    ball?.addEventListener("pointerdown", (event) => {
      isDragging = true;
      hasMoved = false;

      dragStartX = event.clientX;

      dragStartY = event.clientY;

      initialX = currentPosition.x;

      initialY = currentPosition.y;

      ball.setPointerCapture(event.pointerId);
    });

    ball?.addEventListener("pointermove", (event) => {
      if (!isDragging) return;

      const deltaX = event.clientX - dragStartX;

      const deltaY = event.clientY - dragStartY;

      if (Math.hypot(deltaX, deltaY) > 4) {
        hasMoved = true;
      }

      if (!hasMoved) return;

      currentPosition = {
        x: initialX + deltaX,

        y: initialY + deltaY,
      };

      applyPosition(currentPosition.x, currentPosition.y);
    });

    ball?.addEventListener("pointerup", (event) => {
      if (!isDragging) {
        return;
      }

      isDragging = false;

      ball.releasePointerCapture(event.pointerId);

      if (hasMoved) {
        const snapX =
          currentPosition.x < window.innerWidth / 2
            ? 10
            : Math.max(10, window.innerWidth - 52);

        currentPosition.x = snapX;

        applyPosition(currentPosition.x, currentPosition.y);

        savePosition(currentPosition.x, currentPosition.y);

        return;
      }

      togglePanel();
    });

    btnClose?.addEventListener("click", () => togglePanel(false));

    chkPrune?.addEventListener("change", () => {
      state.pruneEnabled = chkPrune.checked;

      previousCutoff = -1;
      fullTurnSyncRequested = true;

      requestUpdate("prune-toggle");
    });

    chkCollapse?.addEventListener("change", () => {
      state.collapseCode = chkCollapse.checked;

      codeScanRequested = true;

      requestUpdate("code-toggle");
    });

    stepDec?.addEventListener("click", () => {
      if (state.keepTurns <= 2) {
        return;
      }

      state.keepTurns--;

      keepVal.textContent = String(state.keepTurns);

      previousCutoff = -1;
      fullTurnSyncRequested = true;

      requestUpdate("keep-decrement");
    });

    stepInc?.addEventListener("click", () => {
      if (state.keepTurns >= 50) {
        return;
      }

      state.keepTurns++;

      keepVal.textContent = String(state.keepTurns);

      previousCutoff = -1;
      fullTurnSyncRequested = true;

      requestUpdate("keep-increment");
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
      clearTimeout(searchDebounceTimer);

      searchDebounceTimer = window.setTimeout(() => {
        renderSearchResults(searchInput.value.trim());
      }, 100);
    });

    window.addEventListener("resize", () => {
      currentPosition.x = Math.min(
        currentPosition.x,
        Math.max(8, window.innerWidth - 50),
      );

      currentPosition.y = Math.min(
        currentPosition.y,
        Math.max(8, window.innerHeight - 50),
      );

      applyPosition(currentPosition.x, currentPosition.y);
    });
  }

  function exportCleanContext(onSuccess) {
    const turns = getTurns();

    if (!turns.length) {
      window.alert("未检测到有效对话内容");

      return;
    }

    const sections = [];

    for (let index = 0; index < turns.length; index++) {
      const turnElement = turns[index];

      const contentText = extractTurnText(turnElement);

      if (!contentText) {
        continue;
      }

      sections.push(`### Message ${index + 1}\n\n${contentText}`);
    }

    if (!sections.length) {
      window.alert("当前页面没有可提取的文本");

      return;
    }

    const markdown = [
      `# 会话上下文提取 [${currentPlatform.name}]`,
      "",
      `> ${new Date().toLocaleString()}`,
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
        mutationTarget.closest(`#${HUD_ID}, .${CODE_SHELL_CLASS}`)
      ) {
        continue;
      }

      const possibleTurn =
        mutationTarget instanceof Element
          ? mutationTarget.closest(turnSelector)
          : mutationTarget.parentElement?.closest(turnSelector);

      if (possibleTurn instanceof Element) {
        dirtyTurns.add(possibleTurn);
      }

      const possibleCode =
        mutationTarget instanceof Element
          ? mutationTarget.closest(currentPlatform.codeSelector)
          : mutationTarget.parentElement?.closest(currentPlatform.codeSelector);

      if (possibleCode instanceof HTMLElement) {
        dirtyCodeBlocks.add(possibleCode);
      }

      if (mutationRecord.type === "characterData") {
        continue;
      }

      if (mutationRecord.type !== "childList") {
        continue;
      }

      const changedNodes = [
        ...Array.from(mutationRecord.addedNodes),

        ...Array.from(mutationRecord.removedNodes),
      ];

      for (const changedNode of changedNodes) {
        if (!(changedNode instanceof Element)) {
          continue;
        }

        if (
          changedNode.matches(turnSelector) ||
          changedNode.querySelector(turnSelector)
        ) {
          structuralChange = true;
        }

        const directCodeBlocks = changedNode.matches(
          currentPlatform.codeSelector,
        )
          ? [changedNode]
          : Array.from(
              changedNode.querySelectorAll(currentPlatform.codeSelector),
            );

        for (const codeElement of directCodeBlocks) {
          if (codeElement instanceof HTMLElement) {
            dirtyCodeBlocks.add(codeElement);
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
    scheduleFrameId = 0;
    scheduleQueued = false;

    if (selfMutationDepth > 0) {
      requestUpdate("self-mutation-retry");

      return;
    }

    const currentTurnSet = new Set(previousTurns);

    for (const dirtyTurn of dirtyTurns) {
      if (dirtyTurn instanceof Element && currentTurnSet.has(dirtyTurn)) {
        continue;
      }

      fullTurnSyncRequested = true;
    }

    syncTurnIndex(fullTurnSyncRequested);

    syncCodeBlocks(codeScanRequested, dirtyCodeBlocks);

    updateHudDashboard();
    ensureHUDMounted();
  }

  function requestUpdate() {
    if (scheduleQueued) {
      return;
    }

    scheduleQueued = true;

    scheduleFrameId = window.requestAnimationFrame(runScheduledUpdate);
  }

  function observeCodeLayout() {
    if (!("ResizeObserver" in window)) {
      return;
    }

    codeResizeObserver?.disconnect();

    codeResizeObserver = new ResizeObserver((entries) => {
      let shouldSchedule = false;

      for (const resizeEntry of entries) {
        const codeElement = resizeEntry.target;

        if (!(codeElement instanceof HTMLElement)) {
          continue;
        }

        if (codeElement.closest(`.${CODE_SHELL_CLASS}`)) {
          dirtyCodeBlocks.add(codeElement);

          shouldSchedule = true;

          continue;
        }

        if (
          state.collapseCode &&
          resizeEntry.contentRect.height > CODE_COLLAPSE_HEIGHT
        ) {
          dirtyCodeBlocks.add(codeElement);

          shouldSchedule = true;
        }
      }

      if (shouldSchedule) {
        requestUpdate("code-resize");
      }
    });

    for (const codeElement of getCodeBlocks()) {
      codeResizeObserver.observe(codeElement);
    }
  }

  function observeDom() {
    if (!document.body) {
      return;
    }

    observer?.disconnect();

    observer = new MutationObserver((mutationRecords) => {
      if (selfMutationDepth > 0) {
        return;
      }

      collectMutationTargets(mutationRecords);

      requestUpdate("dom-mutation");
    });

    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  function ensureHUDMounted() {
    if (hudRootElement?.isConnected) {
      return;
    }

    if (document.body) {
      buildHUD();
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

        requestUpdate("push-state");

        ensureHUDMounted();
      }, 0);

      return result;
    };

    history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args);

      window.setTimeout(() => {
        fullTurnSyncRequested = true;

        codeScanRequested = true;

        requestUpdate("replace-state");

        ensureHUDMounted();
      }, 0);

      return result;
    };

    window.addEventListener("popstate", () => {
      fullTurnSyncRequested = true;

      codeScanRequested = true;

      requestUpdate("pop-state");

      ensureHUDMounted();
    });
  }

  function boot() {
    injectEngineStyles();
    buildHUD();
    observeCodeLayout();
    observeDom();
    patchHistoryForSpaNavigation();

    fullTurnSyncRequested = true;

    codeScanRequested = true;

    requestUpdate("boot");

    window.addEventListener("load", () => {
      ensureHUDMounted();
      requestUpdate("load");
    });

    window.setTimeout(() => ensureHUDMounted(), 250);

    window.setTimeout(() => ensureHUDMounted(), 1000);

    window.setTimeout(() => ensureHUDMounted(), 2500);

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
        togglePanel(false);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, {
      once: true,
    });
  } else {
    boot();
  }
})();
