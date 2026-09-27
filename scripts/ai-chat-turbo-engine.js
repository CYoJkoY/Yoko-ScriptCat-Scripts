// ==UserScript==
// @name         AI Chat Turbo Engine
// @namespace    https://local/ai-turbo-engine-v4
// @version      0.4.0
// @description  增量消息索引 + 真实高度自适应脱水 + 零侵入代码折叠 + 全平台自适应（深度兼容 Gemini 2026/ChatGPT/Claude/Grok）
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

  const VERSION = "0.4.0";
  const HUD_ID = "ai-turbo-extreme-hud";
  const STYLE_ID = "ai-turbo-engine-styles";
  const CODE_WRAPPER_CLASS = "ai-turbo-code-wrapper";
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
      codeSelector: "pre",
      contentSelectors: ["div.markdown", "div.prose", '[class*="markdown"]'],
    },

    gemini: {
      name: "Gemini",
      turnSelectors: [
        "user-query",
        "model-response",
        '[data-test-id="user-query"]',
        '[data-test-id="model-response"]',
        ".user-query",
        ".model-response",
        ".user-query-container",
        ".model-response-container",
      ],
      codeSelector: "code-block, pre:not(code-block pre)",
      contentSelectors: [
        ".query-text",
        ".user-query-text",
        "[class*='query-content']",
        ".model-response-text",
        ".message-content",
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
  const codeState = new WeakMap();

  let hudRootElement = null;
  let hudShadowRoot = null;
  let hudStats = null;
  let searchInput = null;
  let searchResultsBox = null;
  let searchDebounceTimer = null;
  let observer = null;
  let codeResizeObserver = null;

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

  function uniqueDomOrdered(elements) {
    const seen = new Set();
    const unique = [];

    for (const element of elements) {
      if (!(element instanceof Element)) continue;
      if (seen.has(element)) continue;
      seen.add(element);
      unique.push(element);
    }

    unique.sort((first, second) => {
      if (first === second) return 0;
      const relation = first.compareDocumentPosition(second);
      if (relation & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (relation & Node.DOCUMENT_POSITION_PRECEDING) return 1;
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
      if (contentElement) return contentElement;
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
    const firstChanged = turns[0] !== previousTurns[0];
    const lastChanged =
      turns[turns.length - 1] !== previousTurns[previousTurns.length - 1];
    const structuralChange = forceFull || firstChanged || lastChanged;

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

    applyPruneWindow(turns);
    previousTurns = turns;
    dirtyTurns.clear();
    fullTurnSyncRequested = false;
  }

  function applyPruneWindow(turns) {
    const cutoff = state.pruneEnabled
      ? Math.max(0, turns.length - state.keepTurns)
      : 0;

    for (let index = 0; index < turns.length; index++) {
      const turnElement = turns[index];
      const shouldDehydrate = state.pruneEnabled && index < cutoff;

      if (shouldDehydrate) {
        if (!turnElement.classList.contains("ai-turbo-dehydrated")) {
          // 记忆测量高度，避免 Gemini 无限滚动发生塌缩抖动
          const measuredH = turnElement.offsetHeight || 120;
          turnElement.style.setProperty("--turbo-cached-h", `${measuredH}px`);
          turnElement.classList.add("ai-turbo-dehydrated");
        }
      } else {
        if (turnElement.classList.contains("ai-turbo-dehydrated")) {
          turnElement.classList.remove("ai-turbo-dehydrated");
          turnElement.style.removeProperty("--turbo-cached-h");
        }
      }
    }

    state.hiddenCount = cutoff;
  }

  function getCodeBlocks(rootElement = document) {
    const nodes = rootElement.querySelectorAll(currentPlatform.codeSelector);
    const result = [];
    const seen = new Set();

    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (seen.has(node)) continue;
      if (node.matches(".ai-turbo-code-bar, .ai-turbo-code-toggle")) continue;

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
    if (!languageElement) return "代码";
    const classText = String(languageElement.className || "");
    const match = classText.match(/language-([a-z0-9+#.-]+)/i);
    return match ? match[1].toUpperCase() : "代码";
  }

  function getCodeLineCount(codeElement) {
    const codeText = getCodeText(codeElement);
    if (!codeText) return 0;
    return codeText.replace(/\r\n/g, "\n").split("\n").length;
  }

  function updateCodeMeta(entry, codeElement) {
    if (!entry || !codeElement.isConnected) return;
    const lineCount = getCodeLineCount(codeElement);
    const language = getCodeLanguage(codeElement);

    entry.langLabel.textContent = language;
    entry.linesLabel.textContent = lineCount
      ? `${lineCount.toLocaleString()} 行`
      : "";

    entry.toggleButton.textContent = entry.expanded
      ? "收起代码"
      : `展开 ${lineCount ? `${lineCount.toLocaleString()} 行` : "代码"}`;

    codeElement.classList.toggle("ai-turbo-folded", !entry.expanded);
    codeElement.classList.toggle("ai-turbo-expanded", entry.expanded);
  }

  function unmountCodeControls(codeElement) {
    const entry = codeState.get(codeElement);
    if (!entry) return;

    withSelfMutation(() => {
      entry.bottomBar?.remove();
      codeElement.classList.remove(
        "ai-turbo-code-target",
        "ai-turbo-folded",
        "ai-turbo-expanded",
      );
    });

    codeState.delete(codeElement);
  }

  // 非侵入式折叠：不移动任何 DOM 节点，只作为后置兄弟节点插入切换条，彻底避免 Angular 崩溃
  function mountCodeControls(codeElement) {
    if (!state.collapseCode || !codeElement.isConnected) return;
    if (codeState.has(codeElement)) return;

    const measuredHeight = Math.max(
      codeElement.scrollHeight || 0,
      codeElement.getBoundingClientRect().height || 0,
    );

    if (measuredHeight <= CODE_COLLAPSE_HEIGHT) return;

    const bottomBar = document.createElement("div");
    bottomBar.className = "ai-turbo-code-bar";

    const metaLeft = document.createElement("div");
    metaLeft.className = "ai-turbo-code-bar-meta";

    const langLabel = document.createElement("span");
    langLabel.className = "ai-turbo-code-lang";
    metaLeft.appendChild(langLabel);

    const linesLabel = document.createElement("span");
    linesLabel.className = "ai-turbo-code-lines";
    metaLeft.appendChild(linesLabel);

    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "ai-turbo-code-toggle";
    toggleButton.setAttribute("aria-expanded", "false");

    bottomBar.appendChild(metaLeft);
    bottomBar.appendChild(toggleButton);

    withSelfMutation(() => {
      codeElement.classList.add("ai-turbo-code-target", "ai-turbo-folded");
      codeElement.insertAdjacentElement("afterend", bottomBar);
    });

    const entry = {
      bottomBar,
      langLabel,
      linesLabel,
      toggleButton,
      expanded: false,
    };

    codeState.set(codeElement, entry);

    toggleButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      entry.expanded = !entry.expanded;
      toggleButton.setAttribute("aria-expanded", String(entry.expanded));
      updateCodeMeta(entry, codeElement);

      if (!entry.expanded) {
        codeElement.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    });

    updateCodeMeta(entry, codeElement);
  }

  function syncCodeBlocks(forceScan, dirtyCandidates) {
    if (!state.collapseCode) {
      document
        .querySelectorAll(".ai-turbo-code-target")
        .forEach((codeElement) => {
          unmountCodeControls(codeElement);
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

      mountCodeControls(codeElement);
    }

    state.foldedCodeCount = document.querySelectorAll(
      ".ai-turbo-code-target.ai-turbo-folded",
    ).length;

    codeScanRequested = false;
    dirtyCodeBlocks.clear();
  }

  function injectEngineStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const styleElement = document.createElement("style");
    styleElement.id = STYLE_ID;
    styleElement.textContent = `
      /* 视口脱水：自适应记住先前高度，滚动平滑无跳跃 */
      .ai-turbo-dehydrated {
        content-visibility: hidden !important;
        contain: layout paint style !important;
        contain-intrinsic-size: auto 120px var(--turbo-cached-h, 120px) !important;
      }
      .ai-turbo-dehydrated * {
        pointer-events: none !important;
      }

      /* 零侵入代码折叠样式 */
      .ai-turbo-code-target.ai-turbo-folded {
        max-height: ${CODE_PREVIEW_HEIGHT}px !important;
        overflow: hidden !important;
        position: relative !important;
        margin-bottom: 0 !important;
        border-bottom-left-radius: 0 !important;
        border-bottom-right-radius: 0 !important;
      }

      .ai-turbo-code-target.ai-turbo-folded::after {
        content: "" !important;
        position: absolute !important;
        inset: auto 0 0 0 !important;
        height: 80px !important;
        background: linear-gradient(180deg, rgba(13, 18, 28, 0) 0%, rgba(13, 18, 28, 0.95) 100%) !important;
        pointer-events: none !important;
        z-index: 10 !important;
      }

      .ai-turbo-code-bar {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        min-height: 34px !important;
        padding: 5px 12px !important;
        background: rgba(22, 27, 34, 0.96) !important;
        border: 1px solid rgba(148, 163, 184, 0.2) !important;
        border-top: none !important;
        border-bottom-left-radius: 10px !important;
        border-bottom-right-radius: 10px !important;
        box-sizing: border-box !important;
        margin-bottom: 14px !important;
        z-index: 11 !important;
      }

      .ai-turbo-code-bar-meta {
        display: inline-flex !important;
        align-items: center !important;
        gap: 8px !important;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace !important;
        font-size: 11px !important;
      }

      .ai-turbo-code-lang {
        font-weight: 700 !important;
        color: #34d399 !important;
      }

      .ai-turbo-code-lines {
        color: #64748b !important;
      }

      .ai-turbo-code-toggle {
        appearance: none !important;
        background: rgba(255, 255, 255, 0.08) !important;
        border: 1px solid rgba(148, 163, 184, 0.25) !important;
        color: #f1f5f9 !important;
        padding: 4px 12px !important;
        border-radius: 6px !important;
        font: 600 11px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        cursor: pointer !important;
        transition: all 120ms ease !important;
      }

      .ai-turbo-code-toggle:hover {
        background: rgba(52, 211, 153, 0.2) !important;
        color: #34d399 !important;
        border-color: rgba(52, 211, 153, 0.4) !important;
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
    if (!hudRootElement || !hudShadowRoot) return;
    state.hudOpen =
      typeof forceState === "boolean" ? forceState : !state.hudOpen;

    const backdrop = hudShadowRoot.getElementById("backdrop");
    backdrop?.classList.toggle("open", state.hudOpen);

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
        record.element.scrollIntoView({ behavior: "smooth", block: "center" });
        record.element.style.outline = "2px solid rgba(52, 211, 153, 0.85)";
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
    if (hudRootElement?.isConnected) return;

    const mountTarget = document.documentElement || document.body;
    if (!mountTarget) return;

    const existingRoot = document.getElementById(HUD_ID);
    if (existingRoot) existingRoot.remove();

    hudRootElement = document.createElement("div");
    hudRootElement.id = HUD_ID;
    hudRootElement.setAttribute("data-ai-turbo-host", "1");
    hudRootElement.style.cssText = [
      "all: initial !important",
      "position: fixed !important",
      "inset: 0 !important",
      "z-index: 2147483647 !important",
      "pointer-events: none !important",
      "display: block !important",
    ].join(";");

    hudShadowRoot = hudRootElement.attachShadow({ mode: "closed" });

    const styles = `
      * { box-sizing: border-box; }
      button, input { font: inherit; }

      .docked-pill {
        pointer-events: auto;
        position: fixed;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 32px;
        padding: 0 12px;
        border-radius: 999px;
        background: rgba(13, 18, 28, 0.92);
        border: 1px solid rgba(52, 211, 153, 0.4);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        color: #e2e8f0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 11px;
        font-weight: 600;
        cursor: grab;
        user-select: none;
        touch-action: none;
      }
      .docked-pill:active { cursor: grabbing; }
      .docked-pill:hover {
        border-color: rgba(52, 211, 153, 0.8);
        color: #34d399;
      }
      .docked-pill svg { width: 14px; height: 14px; fill: #34d399; pointer-events: none; }

      .modal-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transition: opacity 180ms ease, visibility 180ms ease;
      }
      .modal-backdrop.open {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
      }

      .hud-panel {
        pointer-events: auto;
        width: 380px;
        max-width: 92vw;
        padding: 16px;
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 16px;
        background: rgba(10, 14, 22, 0.98);
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.65);
        color: #e2e8f0;
        transform: scale(0.96);
        transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .modal-backdrop.open .hud-panel { transform: scale(1); }

      .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
      .brand { display: flex; align-items: center; gap: 8px; }
      .brand-title { font-size: 13px; font-weight: 700; color: #f8fafc; }
      .brand-subtitle { font-size: 10px; color: #64748b; margin-top: 1px; }
      .close-btn { background: transparent; border: 0; color: #64748b; cursor: pointer; padding: 4px; border-radius: 6px; }
      .close-btn:hover { color: #f8fafc; background: rgba(255, 255, 255, 0.08); }

      .status-strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 12px; }
      .status-item { padding: 8px; border: 1px solid rgba(148, 163, 184, 0.1); border-radius: 8px; background: rgba(255, 255, 255, 0.02); text-align: center; }
      .status-label { font-size: 9px; color: #64748b; display: block; }
      .status-value { font-size: 14px; font-weight: 700; color: #f1f5f9; margin-top: 2px; }

      .section { padding-top: 10px; border-top: 1px solid rgba(148, 163, 184, 0.1); }
      .section-title { font-size: 10px; font-weight: 700; color: #64748b; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.04em; }
      .control-row { display: flex; align-items: center; justify-content: space-between; min-height: 32px; margin-bottom: 6px; font-size: 11px; }

      .stepper { display: inline-flex; align-items: center; border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 6px; }
      .stepper button { width: 26px; height: 24px; border: 0; background: transparent; color: #94a3b8; cursor: pointer; }
      .stepper button:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
      .stepper span { min-width: 28px; text-align: center; font-size: 11px; font-family: ui-monospace, monospace; }

      .switch { position: relative; width: 34px; height: 20px; }
      .switch input { opacity: 0; width: 0; height: 0; }
      .slider { position: absolute; inset: 0; border-radius: 999px; background: rgba(148, 163, 184, 0.2); cursor: pointer; transition: 150ms; }
      .slider::before { content: ""; position: absolute; width: 14px; height: 14px; left: 3px; top: 3px; border-radius: 50%; background: #fff; transition: 150ms; }
      .switch input:checked + .slider { background: #10b981; }
      .switch input:checked + .slider::before { transform: translateX(14px); }

      .action-btn { width: 100%; height: 32px; margin-top: 10px; border: 1px solid rgba(148, 163, 184, 0.15); border-radius: 8px; background: rgba(255, 255, 255, 0.05); color: #e2e8f0; font-size: 11px; font-weight: 600; cursor: pointer; transition: 140ms ease; }
      .action-btn:hover { background: rgba(52, 211, 153, 0.12); border-color: rgba(52, 211, 153, 0.3); color: #34d399; }
      .action-btn.copied { background: rgba(16, 185, 129, 0.2); color: #6ee7b7; border-color: rgba(52, 211, 153, 0.4); }

      .search-wrap { position: relative; margin-top: 8px; }
      .search-input { width: 100%; height: 32px; padding: 0 10px; border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 8px; background: rgba(0, 0, 0, 0.3); color: #fff; font-size: 11px; outline: none; }
      .search-input:focus { border-color: #34d399; box-shadow: 0 0 0 2px rgba(52, 211, 153, 0.1); }
      .results { max-height: 120px; overflow-y: auto; margin-top: 6px; display: grid; gap: 4px; }
      .result-item, .result-empty { padding: 6px 8px; font-size: 10px; border-radius: 6px; background: rgba(255, 255, 255, 0.03); color: #cbd5e1; border: none; text-align: left; cursor: pointer; }
      .result-item { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
      .result-item:hover { background: rgba(52, 211, 153, 0.1); color: #34d399; }
      .result-empty { text-align: center; color: #64748b; }
      .footer-hint { margin-top: 12px; font-size: 9.5px; color: #475569; text-align: center; }
      kbd { padding: 2px 4px; border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 4px; color: #94a3b8; font-family: ui-monospace, monospace; }
    `;

    hudShadowRoot.innerHTML = `
      <style>${styles}</style>

      <button class="docked-pill" id="pill-trigger" type="button" title="点击呼出 (Alt+T)，可拖拽避开其他按钮">
        <svg viewBox="0 0 24 24"><path d="M13 2L3 14h8l-1 8 11-12h-8l1-8z"/></svg>
        <span>Turbo</span>
      </button>

      <div class="modal-backdrop" id="backdrop">
        <div class="hud-panel" id="panel">
          <div class="header">
            <div class="brand">
              <div>
                <div class="brand-title">AI Turbo Engine</div>
                <div class="brand-subtitle">${currentPlatform.name} · v${VERSION}</div>
              </div>
            </div>
            <button class="close-btn" id="btn-close" type="button" aria-label="关闭">✕</button>
          </div>

          <div class="status-strip">
            <div class="status-item"><span class="status-label">消息总数</span><strong class="status-value" id="total-val">0</strong></div>
            <div class="status-item"><span class="status-label">已脱水</span><strong class="status-value" id="hidden-val">0</strong></div>
            <div class="status-item"><span class="status-label">代码折叠</span><strong class="status-value" id="folded-val">0</strong></div>
          </div>

          <div class="section">
            <div class="section-title">引擎策略</div>
            <div class="control-row">
              <span>活跃保留轮次</span>
              <div class="stepper">
                <button id="step-dec" type="button">−</button>
                <span id="keep-val">${state.keepTurns}</span>
                <button id="step-inc" type="button">+</button>
              </div>
            </div>

            <div class="control-row">
              <span>安全视口脱水</span>
              <label class="switch">
                <input id="chk-prune" type="checkbox" ${state.pruneEnabled ? "checked" : ""}>
                <span class="slider"></span>
              </label>
            </div>

            <div class="control-row">
              <span>长代码自动折叠</span>
              <label class="switch">
                <input id="chk-collapse" type="checkbox" ${state.collapseCode ? "checked" : ""}>
                <span class="slider"></span>
              </label>
            </div>

            <button class="action-btn" id="btn-fork" type="button">
              <span id="fork-text">提取当前上下文</span>
            </button>
          </div>

          <div class="section">
            <div class="section-title">历史检索</div>
            <div class="search-wrap">
              <input id="search-input" class="search-input" type="text" placeholder="检索当前会话内容..." autocomplete="off">
            </div>
            <div class="results" id="search-results"></div>
          </div>

          <div class="footer-hint"><kbd>Alt</kbd> + <kbd>T</kbd> 呼出 / 收起 · <kbd>Esc</kbd> 退出</div>
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

    // 胶囊位置初始化与自由拖拽（智能避开 Voyager 与 Timeline）
    initPillDrag(pill);

    btnClose?.addEventListener("click", () => togglePanel(false));
    backdrop?.addEventListener("click", (event) => {
      if (event.target === backdrop) togglePanel(false);
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
      if (state.keepTurns <= 2) return;
      state.keepTurns--;
      keepVal.textContent = String(state.keepTurns);
      fullTurnSyncRequested = true;
      requestUpdate();
    });

    stepInc?.addEventListener("click", () => {
      if (state.keepTurns >= 50) return;
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
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = window.setTimeout(() => {
        renderSearchResults(searchInput.value.trim());
      }, 100);
    });
  }

  function initPillDrag(pill) {
    if (!pill) return;

    // 默认避让位置（避开右下角常用工具栏）
    let posX = window.innerWidth - 110;
    let posY = window.innerHeight - 80;

    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_POS) || "null");
      if (saved && typeof saved.x === "number" && typeof saved.y === "number") {
        posX = Math.min(window.innerWidth - 80, Math.max(10, saved.x));
        posY = Math.min(window.innerHeight - 50, Math.max(10, saved.y));
      }
    } catch (_) {}

    pill.style.left = `${posX}px`;
    pill.style.top = `${posY}px`;

    let isDragging = false;
    let startX = 0,
      startY = 0;
    let originX = 0,
      originY = 0;

    const onPointerMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      let nextX = originX + dx;
      let nextY = originY + dy;

      nextX = Math.max(
        8,
        Math.min(window.innerWidth - pill.offsetWidth - 8, nextX),
      );
      nextY = Math.max(
        8,
        Math.min(window.innerHeight - pill.offsetHeight - 8, nextY),
      );

      pill.style.left = `${nextX}px`;
      pill.style.top = `${nextY}px`;
    };

    const onPointerUp = (e) => {
      if (!isDragging) return;
      isDragging = false;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);

      const dx = Math.abs(e.clientX - startX);
      const dy = Math.abs(e.clientY - startY);

      if (dx < 4 && dy < 4) {
        togglePanel(true);
      } else {
        try {
          const rect = pill.getBoundingClientRect();
          localStorage.setItem(
            STORAGE_KEY_POS,
            JSON.stringify({ x: rect.left, y: rect.top }),
          );
        } catch (_) {}
      }
    };

    pill.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
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
    for (let index = 0; index < turns.length; index++) {
      const turnElement = turns[index];
      const contentText = extractTurnText(turnElement);
      if (!contentText) continue;
      sections.push(`### Message ${index + 1}\n\n${contentText}`);
    }

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

  function collectMutationTargets(records) {
    const turnSelector = currentPlatform.turnSelectors.join(",");
    let structuralChange = false;

    for (const mutationRecord of records) {
      const mutationTarget = mutationRecord.target;

      if (
        mutationTarget instanceof Element &&
        mutationTarget.closest(`#${HUD_ID}, .ai-turbo-code-bar`)
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

      if (mutationRecord.type === "characterData") continue;
      if (mutationRecord.type !== "childList") continue;

      const changedNodes = [
        ...Array.from(mutationRecord.addedNodes),
        ...Array.from(mutationRecord.removedNodes),
      ];

      for (const changedNode of changedNodes) {
        if (!(changedNode instanceof Element)) continue;

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
    scheduleQueued = false;

    if (selfMutationDepth > 0) {
      requestUpdate();
      return;
    }

    const currentTurnSet = new Set(previousTurns);
    for (const dirtyTurn of dirtyTurns) {
      if (dirtyTurn instanceof Element && currentTurnSet.has(dirtyTurn))
        continue;
      fullTurnSyncRequested = true;
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
    if (!("ResizeObserver" in window)) return;

    codeResizeObserver?.disconnect();
    codeResizeObserver = new ResizeObserver((entries) => {
      let shouldSchedule = false;

      for (const resizeEntry of entries) {
        const codeElement = resizeEntry.target;
        if (!(codeElement instanceof HTMLElement)) continue;

        if (codeElement.classList.contains("ai-turbo-code-target")) {
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

      if (shouldSchedule) requestUpdate();
    });

    for (const codeElement of getCodeBlocks()) {
      codeResizeObserver.observe(codeElement);
    }
  }

  function observeDom() {
    if (!document.body && !document.documentElement) return;

    observer?.disconnect();
    observer = new MutationObserver((mutationRecords) => {
      if (selfMutationDepth > 0) return;
      collectMutationTargets(mutationRecords);
      requestUpdate();
    });

    observer.observe(document.documentElement || document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  function ensureHUDMounted() {
    if (hudRootElement?.isConnected) return;
    const mountTarget = document.documentElement || document.body;
    if (mountTarget) buildHUD();
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
        ensureHUDMounted();
      }, 0);
      return result;
    };

    history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args);
      window.setTimeout(() => {
        fullTurnSyncRequested = true;
        codeScanRequested = true;
        requestUpdate();
        ensureHUDMounted();
      }, 0);
      return result;
    };

    window.addEventListener("popstate", () => {
      fullTurnSyncRequested = true;
      codeScanRequested = true;
      requestUpdate();
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
    requestUpdate();

    window.addEventListener("load", () => {
      ensureHUDMounted();
      requestUpdate();
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
