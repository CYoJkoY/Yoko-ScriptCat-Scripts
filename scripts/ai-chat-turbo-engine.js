// ==UserScript==
// @name         AI Chat Turbo Engine
// @namespace    https://local/ai-turbo-engine-v9
// @version      0.9.0
// @description  独立药囊长代码折叠(流式防卡顿) + 长文本智能伪文件胶囊(DOM安全沙箱·读写分离防死锁) + 增量消息索引 + 自适应脱水 + 纯DOM免疫CSP
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

  const VERSION = "0.9.0";
  const HUD_ID = "ai-turbo-extreme-hud";
  const STYLE_ID = "ai-turbo-engine-styles";
  const CODE_COLLAPSE_HEIGHT = 300;
  const CODE_PREVIEW_HEIGHT = 200;
  const TURN_TEXT_LIMIT = 800;
  const SEARCH_LIMIT = 10;
  const STORAGE_KEY_POS = "ai_turbo_pill_pos";
  const STORAGE_KEY_CONFIG = "ai_turbo_engine_config";
  const VIRTUAL_FILE_THRESHOLD = 1500;
  const STREAMING_IDLE_DELAY = 1500;
  const THROTTLE_INTERVAL = 80; // 突变合并节流周期 (ms)
  const CODE_FENCE = "\x60\x60\x60";

  const VF_TOKEN_START = "[[TURBO_VFILE_START:";
  const VF_TOKEN_END = ":TURBO_VFILE_END]]";
  const VF_REGEX =
    /\[\[TURBO_VFILE_START:([^|\r\n]+)\|(\d+)\|(\d+):TURBO_VFILE_END\]\]/;

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
      inputSelectors: [
        "#prompt-textarea",
        'div[contenteditable="true"]',
        "textarea",
      ],
      sendButtonSelectors: [
        'button[data-testid="send-button"]',
        'button[data-testid="fruitjuice-send-button"]',
        'button[aria-label*="Send"]',
        'button[aria-label*="发送"]',
      ],
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
      codeSelectors: ["code-block", "pre"],
      contentSelectors: [
        ".query-text",
        ".user-query-text",
        "[class*='query-content']",
        ".model-response-text",
        "message-content",
        ".message-content",
        ".markdown",
        ".md-content",
        ".response-content",
      ],
      inputSelectors: [
        "rich-textarea .ql-editor",
        "rich-textarea div[contenteditable='true']",
        ".rich-textarea div[contenteditable='true']",
        "div[contenteditable='true'][role='textbox']",
        "div[contenteditable='true']",
        "textarea",
      ],
      sendButtonSelectors: [
        "button.send-button",
        'button[aria-label*="Send message"]',
        'button[aria-label*="发送消息"]',
        'button[aria-label*="Send"]',
        'button[aria-label*="发送"]',
        'button[aria-label*="提交"]',
        ".send-button-container button",
        "rich-textarea + * button",
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
      inputSelectors: ["textarea", 'div[contenteditable="true"]'],
      sendButtonSelectors: [
        'button[aria-label*="Grok"]',
        'button[type="submit"]',
        'button[aria-label*="Send"]',
        'button[aria-label*="发送"]',
      ],
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
      inputSelectors: [
        "div.ProseMirror[contenteditable='true']",
        'div[contenteditable="true"]',
      ],
      sendButtonSelectors: [
        'button[aria-label*="Send Message"]',
        'button[aria-label*="发送消息"]',
        'button[aria-label*="Send"]',
        'button[aria-label*="发送"]',
        "fieldset button:last-child",
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
    virtualFileEnabled: true,
    hudOpen: false,
    totalTurns: 0,
    hiddenCount: 0,
    foldedCodeCount: 0,
    indexedTurns: [],
  };

  function loadSavedConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.keepTurns === "number" && !isNaN(parsed.keepTurns)) {
          state.keepTurns = Math.max(2, Math.min(50, parsed.keepTurns));
        }
        if (typeof parsed.pruneEnabled === "boolean") {
          state.pruneEnabled = parsed.pruneEnabled;
        }
        if (typeof parsed.collapseCode === "boolean") {
          state.collapseCode = parsed.collapseCode;
        }
        if (typeof parsed.virtualFileEnabled === "boolean") {
          state.virtualFileEnabled = parsed.virtualFileEnabled;
        }
      }
    } catch (_) {}
  }

  function saveCurrentConfig() {
    try {
      const config = {
        keepTurns: state.keepTurns,
        pruneEnabled: state.pruneEnabled,
        collapseCode: state.collapseCode,
        virtualFileEnabled: state.virtualFileEnabled,
      };
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
    } catch (_) {}
  }

  const turnIndex = new Map();
  const codeState = new Map();
  const processedUserTurns = new WeakSet();
  let activeVirtualFiles = [];
  let trayIsDirty = false;
  let isSubmitting = false;

  let hudRootElement = null;
  let hudShadowRoot = null;
  let hudStats = null;
  let searchInput = null;
  let searchResultsBox = null;
  let virtualFileTrayAnchor = null;
  let virtualFileTrayResizeObserver = null;
  let virtualFileTrayPositionFrame = 0;
  let searchDebounceTimer = null;
  let observer = null;
  let codeResizeObserver = null;
  let scheduleTimer = null;
  let lastUpdateTime = 0;
  let fullTurnSyncRequested = true;
  let codeScanRequested = true;
  let dirtyTurns = new Set();
  let dirtyCodeBlocks = new Set();
  let previousTurns = [];
  let selfMutationDepth = 0;

  function el(tag, attrs = {}, children = []) {
    const elem = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "className") {
        elem.className = value;
      } else if (key === "style" && typeof value === "string") {
        elem.style.cssText = value;
      } else if (key.startsWith("on") && typeof value === "function") {
        elem.addEventListener(key.slice(2).toLowerCase(), value);
      } else {
        elem.setAttribute(key, value);
      }
    }
    for (const child of children) {
      if (typeof child === "string") {
        elem.appendChild(document.createTextNode(child));
      } else if (child instanceof Node) {
        elem.appendChild(child);
      }
    }
    return elem;
  }

  function withSelfMutation(task) {
    selfMutationDepth++;
    try {
      return task();
    } finally {
      selfMutationDepth--;
    }
  }

  function fastCountLines(text) {
    if (!text) return 0;
    let count = 1;
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) === 10) count++;
    }
    return count;
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
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

  function isUserTurn(turnElement) {
    if (!(turnElement instanceof Element)) return false;

    if (
      turnElement.matches(
        "user-query, [data-test-id='user-query'], .user-query, .user-query-container",
      ) ||
      turnElement.querySelector(
        ".user-query-text, .query-text, [class*='query-content']",
      )
    ) {
      return true;
    }

    if (
      turnElement.matches('[data-message-author-role="user"]') ||
      turnElement.getAttribute("data-message-author-role") === "user" ||
      turnElement.querySelector('[data-message-author-role="user"]')
    ) {
      return true;
    }

    if (
      turnElement.matches("div.font-user-message") ||
      turnElement.querySelector(".font-user-message")
    ) {
      return true;
    }

    if (
      turnElement.matches('[data-testid*="user"], [class*="user"]') ||
      turnElement.querySelector('[data-testid*="user"]')
    ) {
      return true;
    }

    return false;
  }

  function uniqueDomOrdered(elements) {
    const seen = new Set();
    const unique = [];

    for (const element of elements) {
      if (!(element instanceof Element) || seen.has(element)) continue;
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

  function filterOutNested(elements) {
    const ordered = uniqueDomOrdered(elements);
    const candidateSet = new Set(ordered);

    return ordered.filter((element) => {
      let parent = element.parentElement;
      while (parent) {
        if (candidateSet.has(parent)) return false;
        parent = parent.parentElement;
      }
      return true;
    });
  }

  function getTurns() {
    const collected = [];
    for (const selector of currentPlatform.turnSelectors) {
      document
        .querySelectorAll(selector)
        .forEach((elem) => collected.push(elem));
    }

    const unnested = filterOutNested(collected);
    return unnested.filter((element) => !isGeminiThoughtElement(element));
  }

  function findContentElement(turnElement) {
    for (const selector of currentPlatform.contentSelectors) {
      const match = turnElement.querySelector(selector);
      if (match && !isGeminiThoughtElement(match)) return match;
    }
    return turnElement;
  }

  function extractTurnText(turnElement) {
    const contentElement = findContentElement(turnElement);
    const raw = contentElement.textContent || "";
    return normalizeText(raw.slice(0, 1500));
  }

  // 优化点2：无损沙箱化。完全保留宿主原始 DOM 节点（仅 display:none），插入药囊兄弟节点，100% 免疫框架虚拟 DOM 冲突
  function collapseInChatFileBlocks(turnElement) {
    if (!state.virtualFileEnabled || !turnElement || !isUserTurn(turnElement)) {
      return;
    }
    if (processedUserTurns.has(turnElement)) {
      return;
    }

    const walker = document.createTreeWalker(
      turnElement,
      NodeFilter.SHOW_TEXT,
      null,
      false,
    );

    let targetTextNode = null;
    while (walker.nextNode()) {
      if (
        walker.currentNode.nodeValue &&
        walker.currentNode.nodeValue.includes(VF_TOKEN_START)
      ) {
        targetTextNode = walker.currentNode;
        break;
      }
    }

    if (!targetTextNode) return;

    let containerBlock = targetTextNode.parentElement;
    while (containerBlock && containerBlock !== turnElement) {
      const tag = containerBlock.tagName.toLowerCase();
      if (
        ["p", "div", "pre", "code-block"].includes(tag) ||
        containerBlock.classList.contains("query-text") ||
        containerBlock.classList.contains("user-query-text")
      ) {
        break;
      }
      containerBlock = containerBlock.parentElement;
    }

    if (!containerBlock) containerBlock = targetTextNode.parentElement;

    const rawText = containerBlock.textContent || "";
    const startIndex = rawText.indexOf(VF_TOKEN_START);
    if (startIndex === -1) return;

    const match = rawText.match(VF_REGEX);
    if (!match) return;

    processedUserTurns.add(turnElement);

    const fileName = match[1].trim();
    const lineCount = parseInt(match[2], 10) || 0;
    const sizeBytes = parseInt(match[3], 10) || 0;
    const kbSize = (sizeBytes / 1024).toFixed(1);
    const metaInfo = `${lineCount.toLocaleString()} 行 · ${kbSize} KB`;

    withSelfMutation(() => {
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

      const pill = el(
        "div",
        {
          className: "ai-turbo-chat-capsule",
          style:
            "display:inline-flex;align-items:center;gap:8px;padding:5px 14px;background:rgba(18,24,38,0.95);border:1px solid rgba(52,211,153,0.45);border-radius:9999px;box-shadow:0 2px 10px rgba(0,0,0,0.3);user-select:none;max-width:100%;box-sizing:border-box;margin:6px 0;",
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

      // 将原宿主容器隐藏并赋予隔离沙箱，不删除任何节点
      containerBlock.classList.add("ai-turbo-chat-folded-target");
      containerBlock.style.setProperty("display", "none", "important");
      containerBlock.style.setProperty("contain", "strict", "important");

      toggleBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        isExpanded = !isExpanded;
        toggleBtn.textContent = isExpanded ? "收起文本" : "展开查看文本";
        if (isExpanded) {
          containerBlock.style.setProperty("display", "block", "important");
          containerBlock.style.setProperty("max-height", "320px", "important");
          containerBlock.style.setProperty("overflow", "auto", "important");
        } else {
          containerBlock.style.setProperty("display", "none", "important");
        }
      });

      containerBlock.insertAdjacentElement("beforebegin", pill);
    });
  }

  // 优化点1：彻底重构脱水循环，实行严格的“先全量读取，后全量写入”，消灭 Layout Thrashing
  function syncTurnIndex(forceFull) {
    const turns = getTurns();
    const structuralChange =
      forceFull ||
      turns[0] !== previousTurns[0] ||
      turns[turns.length - 1] !== previousTurns[previousTurns.length - 1];

    if (structuralChange) {
      turnIndex.clear();
      turns.forEach((turnElement, index) => {
        collapseInChatFileBlocks(turnElement);
        turnIndex.set(turnElement, {
          id: index,
          element: turnElement,
          text: extractTurnText(turnElement),
        });
      });
    } else {
      for (const turnElement of dirtyTurns) {
        collapseInChatFileBlocks(turnElement);
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

    // Phase 1: 批量集中读取（无任何 DOM 写入，零强制重排）
    const toDehydrate = [];
    const toHydrate = [];

    turns.forEach((turnElement, index) => {
      const shouldDehydrate = state.pruneEnabled && index < cutoff;
      const isDehydrated = turnElement.classList.contains(
        "ai-turbo-dehydrated",
      );

      if (shouldDehydrate && !isDehydrated) {
        toDehydrate.push({
          elem: turnElement,
          height: turnElement.offsetHeight || 120,
        });
      } else if (!shouldDehydrate && isDehydrated) {
        toHydrate.push(turnElement);
      }
    });

    // Phase 2: 批量集中写入样式
    withSelfMutation(() => {
      for (let i = 0; i < toDehydrate.length; i++) {
        const item = toDehydrate[i];
        item.elem.style.setProperty("--turbo-cached-h", `${item.height}px`);
        item.elem.classList.add("ai-turbo-dehydrated");
      }
      for (let i = 0; i < toHydrate.length; i++) {
        toHydrate[i].classList.remove("ai-turbo-dehydrated");
        toHydrate[i].style.removeProperty("--turbo-cached-h");
      }
    });

    state.hiddenCount = cutoff;
    previousTurns = turns;
    dirtyTurns.clear();
    fullTurnSyncRequested = false;
  }

  function normalizeCodeElement(candidate) {
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

  function getCodeBlocks(rootNode = document) {
    const collected = [];
    const selectors = currentPlatform.codeSelectors || ["pre"];

    for (const selector of selectors) {
      rootNode.querySelectorAll(selector).forEach((candidate) => {
        if (
          candidate.classList.contains("ai-turbo-chat-folded-target") ||
          candidate.closest(
            ".ai-turbo-chat-folded-target, .ai-turbo-chat-capsule, user-query, [data-message-author-role='user'], .font-user-message",
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

    return filterOutNested(collected);
  }

  function getCodeText(codeElement) {
    const sourceElement =
      codeElement.querySelector("pre code") ||
      codeElement.querySelector("pre") ||
      codeElement.querySelector("code") ||
      codeElement;
    return typeof sourceElement.textContent === "string"
      ? sourceElement.textContent
      : "";
  }

  function getCodeLanguage(codeElement) {
    const langElem = codeElement.querySelector(
      'code[class*="language-"], [class*="language-"]',
    );
    if (langElem) {
      const match = String(langElem.className || "").match(
        /language-([a-z0-9+#.-]+)/i,
      );
      if (match) return match[1].toUpperCase();
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

  function getCodeElementHeight(codeElement) {
    const pre = codeElement.querySelector("pre");
    return Math.max(
      codeElement.scrollHeight || 0,
      codeElement.offsetHeight || 0,
      pre?.scrollHeight || 0,
      pre?.offsetHeight || 0,
    );
  }

  function applyFoldStyles(entry, codeElement) {
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

  // 优化点3：彻底修复流式检测与轻量化判定
  function updateCodeMeta(entry, codeElement) {
    if (!entry || !codeElement?.isConnected) return;

    const currentText = getCodeText(codeElement);
    const currentLen = currentText.length;
    const now = Date.now();

    // 只有文本长度真正变长，才认定 AI 在打字
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

    // 静态状态短路跳过，杜绝重复渲染
    if (!entry.isDisplayingStreaming && entry.renderedStaticOnce) {
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

  function unmountCodeControls(codeElement) {
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

  function mountCodeControls(codeElement) {
    if (
      !state.collapseCode ||
      !codeElement.isConnected ||
      codeState.has(codeElement)
    )
      return;
    if (codeElement.parentElement?.closest(".ai-turbo-code-target")) return;

    const measuredH = getCodeElementHeight(codeElement);
    if (measuredH <= CODE_COLLAPSE_HEIGHT) return;

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

    const bar = el("div", { className: "ai-turbo-code-bar" }, [
      metaWrap,
      toggleButton,
    ]);

    const entry = {
      bar,
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

    codeState.set(codeElement, entry);

    withSelfMutation(() => {
      codeElement.classList.add("ai-turbo-code-target");
      codeElement.insertAdjacentElement("beforebegin", bar);
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

  function sweepOrphanBars() {
    document.querySelectorAll(".ai-turbo-code-bar").forEach((bar) => {
      const next = bar.nextElementSibling;
      if (!next || !codeState.has(next) || codeState.get(next).bar !== bar) {
        bar.remove();
      }
    });
  }

  function syncCodeBlocks(forceScan, dirtyCandidates) {
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
          .filter((elem) => elem instanceof HTMLElement && elem.isConnected);

    const candidates = filterOutNested(rawCandidates);

    for (const codeElement of candidates) {
      const entry = codeState.get(codeElement);
      if (entry) {
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

  function getChatInput() {
    for (const sel of currentPlatform.inputSelectors) {
      const elem = document.querySelector(sel);
      if (elem && elem.offsetParent !== null) return elem;
    }
    return (
      document.querySelector(
        "rich-textarea div[contenteditable='true'], textarea, [contenteditable='true']",
      ) || null
    );
  }

  function getInputContainer(input) {
    if (!input) return null;
    return (
      input.closest(
        "rich-textarea, .rich-textarea, .input-area-container, form, [class*='composer'], [class*='input-container'], fieldset",
      ) || input.parentElement
    );
  }

  function createUiIcon(name, size = 14) {
    const paths = {
      file: ["M6 3.5h7.7L18.5 8v12H6z", "M13.5 3.5V8h5"],
      eye: [
        "M2.8 12s3.3-5 9.2-5 9.2 5 9.2 5-3.3 5-9.2 5-9.2-5-9.2-5z",
        "M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
      ],
      close: ["M5 5l14 14", "M19 5L5 19"],
      bolt: ["M13.2 2.5L5 13h6.1l-.8 8.5L19 10.2h-6.2z"],
    };

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");

    for (const pathData of paths[name] || []) {
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );

      path.setAttribute("d", pathData);
      svg.appendChild(path);
    }

    return svg;
  }

  function stopVirtualFileTrayTracking() {
    if (virtualFileTrayResizeObserver) {
      virtualFileTrayResizeObserver.disconnect();
      virtualFileTrayResizeObserver = null;
    }

    virtualFileTrayAnchor = null;

    if (virtualFileTrayPositionFrame) {
      window.cancelAnimationFrame(virtualFileTrayPositionFrame);
      virtualFileTrayPositionFrame = 0;
    }
  }

  function scheduleVirtualFileTrayPosition() {
    if (!activeVirtualFiles.length) return;

    if (virtualFileTrayPositionFrame) return;

    virtualFileTrayPositionFrame = window.requestAnimationFrame(() => {
      virtualFileTrayPositionFrame = 0;
      positionVirtualFileTray();
    });
  }

  function positionVirtualFileTray() {
    const tray = document.getElementById("ai-turbo-vf-tray");

    if (!tray || !tray.isConnected || !activeVirtualFiles.length) {
      return;
    }

    const input = getChatInput();
    const anchor = getInputContainer(input);

    if (!anchor || !anchor.isConnected) {
      tray.classList.remove("is-positioned");
      return;
    }

    if (anchor !== virtualFileTrayAnchor) {
      if (virtualFileTrayResizeObserver) {
        virtualFileTrayResizeObserver.disconnect();
      }

      virtualFileTrayAnchor = anchor;

      if ("ResizeObserver" in window) {
        virtualFileTrayResizeObserver = new ResizeObserver(() => {
          scheduleVirtualFileTrayPosition();
        });

        virtualFileTrayResizeObserver.observe(anchor);
      }
    }

    const rect = anchor.getBoundingClientRect();

    if (!rect.width || !rect.height) {
      tray.classList.remove("is-positioned");
      return;
    }

    const viewportPadding = 12;
    const gap = 8;
    const availableWidth = Math.max(0, window.innerWidth - viewportPadding * 2);

    const trayWidth = Math.min(Math.max(rect.width, 280), availableWidth);

    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      Math.max(
        viewportPadding,
        window.innerWidth - trayWidth - viewportPadding,
      ),
    );

    tray.style.width = `${trayWidth}px`;
    tray.style.left = `${left}px`;

    const trayHeight = tray.getBoundingClientRect().height;

    let top = rect.top - trayHeight - gap;
    let placement = "top";

    if (top < viewportPadding) {
      top = rect.bottom + gap;
      placement = "bottom";
    }

    top = Math.max(
      viewportPadding,
      Math.min(
        top,
        Math.max(
          viewportPadding,
          window.innerHeight - trayHeight - viewportPadding,
        ),
      ),
    );

    tray.style.top = `${top}px`;
    tray.dataset.placement = placement;
    tray.classList.add("is-positioned");
  }

  function removeVirtualFile(id) {
    activeVirtualFiles = activeVirtualFiles.filter((item) => item.id !== id);
    trayIsDirty = true;
    renderVirtualFileTray();
  }

  function showTextPreviewModal(fileItem) {
    document.getElementById("ai-turbo-vf-preview-modal")?.remove();

    const previewBackdrop = el("div", {
      id: "ai-turbo-vf-preview-modal",
      className: "ai-turbo-modal-backdrop",
      onclick: (e) => {
        if (e.target === previewBackdrop) previewBackdrop.remove();
      },
    });

    const titleSpan = el(
      "span",
      {
        style:
          "font:600 13px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#f8fafc;max-width:70%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
      },
      [
        `📄 ${fileItem.name} (${fileItem.lineCount.toLocaleString()} 行 · ${(fileItem.size / 1024).toFixed(1)} KB)`,
      ],
    );

    const closeBtn = el(
      "button",
      {
        type: "button",
        style:
          "background:transparent;border:0;color:#94a3b8;cursor:pointer;font-size:16px;line-height:1;padding:4px;border-radius:4px;",
        onclick: () => previewBackdrop.remove(),
      },
      ["✕"],
    );

    const header = el(
      "div",
      {
        style:
          "flex-shrink:0;display:flex;justify-content:space-between;align-items:center;padding:12px 18px;border-bottom:1px solid rgba(148,163,184,0.15);background:rgba(18,24,38,0.98);",
      },
      [titleSpan, closeBtn],
    );

    const bodyText = el(
      "pre",
      {
        style:
          "flex:1 1 auto;min-height:0;margin:0;padding:16px;overflow-y:auto;overflow-x:auto;background:rgba(5,8,15,0.7);font:12px/1.6 ui-monospace,monospace;color:#cbd5e1;white-space:pre-wrap;word-break:break-all;",
      },
      [
        fileItem.content.slice(0, 8000) +
          (fileItem.content.length > 8000
            ? "\n\n... (预览仅截取前 8,000 字符，发送时将提交完整全部文本)"
            : ""),
      ],
    );

    const footerText = el(
      "span",
      { style: "font:11px sans-serif;color:#64748b;" },
      ["按 Esc 键或点击外部任意区域即可快速关闭"],
    );

    const footerCloseBtn = el(
      "button",
      {
        type: "button",
        style:
          "background:rgba(255,255,255,0.08);border:1px solid rgba(148,163,184,0.25);color:#e2e8f0;padding:4px 14px;border-radius:6px;font:11px sans-serif;cursor:pointer;",
        onclick: () => previewBackdrop.remove(),
      },
      ["关闭"],
    );

    const footer = el(
      "div",
      {
        style:
          "flex-shrink:0;display:flex;justify-content:space-between;align-items:center;padding:10px 18px;border-top:1px solid rgba(148,163,184,0.15);background:rgba(18,24,38,0.98);",
      },
      [footerText, footerCloseBtn],
    );

    const modalBox = el(
      "div",
      {
        style:
          "background:#0d121c;border:1px solid rgba(52,211,153,0.35);box-shadow:0 24px 60px rgba(0,0,0,0.85);border-radius:14px;width:720px;max-width:94vw;max-height:85vh;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;",
      },
      [header, bodyText, footer],
    );

    previewBackdrop.appendChild(modalBox);
    document.body.appendChild(previewBackdrop);
  }

  function renderVirtualFileTray() {
    let tray = document.getElementById("ai-turbo-vf-tray");

    if (!activeVirtualFiles.length) {
      if (tray) {
        withSelfMutation(() => tray.remove());
      }

      stopVirtualFileTrayTracking();
      trayIsDirty = false;
      return;
    }

    const input = getChatInput();
    const container = getInputContainer(input);

    if (!container || !container.isConnected) {
      return;
    }

    withSelfMutation(() => {
      if (!tray) {
        tray = el("div", {
          id: "ai-turbo-vf-tray",
          className: "ai-turbo-vf-tray",
          role: "region",
          "aria-label": "虚拟文件",
        });

        document.body.appendChild(tray);
      }

      tray.textContent = "";

      const header = el(
        "div",
        {
          className: "ai-turbo-vf-header",
        },
        [
          el(
            "div",
            {
              className: "ai-turbo-vf-heading",
            },
            [
              el(
                "span",
                {
                  className: "ai-turbo-vf-heading-icon",
                },
                [createUiIcon("bolt", 13)],
              ),
              el(
                "span",
                {
                  className: "ai-turbo-vf-heading-title",
                },
                ["虚拟文件"],
              ),
              el(
                "span",
                {
                  className: "ai-turbo-vf-heading-count",
                },
                [`${activeVirtualFiles.length}`],
              ),
            ],
          ),

          el(
            "span",
            {
              className: "ai-turbo-vf-heading-hint",
            },
            ["发送时作为上下文附加"],
          ),
        ],
      );

      const fileList = el("div", {
        className: "ai-turbo-vf-list",
      });

      tray.appendChild(header);
      tray.appendChild(fileList);

      for (const item of activeVirtualFiles) {
        const sizeText = `${(item.size / 1024).toFixed(1)} KB`;

        const nameLabel = el(
          "span",
          {
            className: "ai-turbo-vf-name",
            title: item.name,
          },
          [item.name],
        );

        const metaLabel = el(
          "span",
          {
            className: "ai-turbo-vf-meta",
          },
          [`${item.lineCount.toLocaleString()} 行`, " · ", sizeText],
        );

        const btnPreview = el(
          "button",
          {
            type: "button",
            className: "ai-turbo-vf-action ai-turbo-vf-action-preview",
            title: "预览文本内容",
            "aria-label": `预览 ${item.name}`,
          },
          [createUiIcon("eye", 13)],
        );

        btnPreview.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          showTextPreviewModal(item);
        });

        const btnDelete = el(
          "button",
          {
            type: "button",
            className: "ai-turbo-vf-action ai-turbo-vf-action-delete",
            title: "移除该文件",
            "aria-label": `移除 ${item.name}`,
          },
          [createUiIcon("close", 13)],
        );

        btnDelete.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          removeVirtualFile(item.id);
        });

        const fileItem = el(
          "div",
          {
            className: "ai-turbo-vf-pill",
          },
          [
            el(
              "span",
              {
                className: "ai-turbo-vf-file-icon",
              },
              [createUiIcon("file", 14)],
            ),

            el(
              "div",
              {
                className: "ai-turbo-vf-file-copy",
              },
              [nameLabel, metaLabel],
            ),

            el(
              "span",
              {
                className: "ai-turbo-vf-badge",
              },
              ["TEXT"],
            ),

            el(
              "div",
              {
                className: "ai-turbo-vf-actions",
              },
              [btnPreview, btnDelete],
            ),
          ],
        );

        fileList.appendChild(fileItem);
      }

      trayIsDirty = false;
    });

    positionVirtualFileTray();
    window.requestAnimationFrame(positionVirtualFileTray);
  }

  function handlePasteIntercept(event) {
    if (!state.virtualFileEnabled) return;

    const target = event.target;
    if (
      !(target instanceof Element) ||
      !target.closest(
        'rich-textarea, textarea, [contenteditable="true"], [role="textbox"]',
      )
    ) {
      return;
    }

    const clipData = event.clipboardData || window["clipboardData"];
    if (!clipData) return;

    const pastedText = clipData.getData("text/plain");
    if (!pastedText || pastedText.length < VIRTUAL_FILE_THRESHOLD) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    const byteSize = new Blob([pastedText]).size;
    const kbSize = (byteSize / 1024).toFixed(1);
    const lineCount = fastCountLines(pastedText);
    const vfId = `vf_${Date.now()}`;
    const fileName = `pasted_text_${kbSize}kb.txt`;

    activeVirtualFiles.push({
      id: vfId,
      name: fileName,
      size: byteSize,
      charCount: pastedText.length,
      lineCount,
      content: pastedText,
      timestamp: Date.now(),
    });

    trayIsDirty = true;
    renderVirtualFileTray();
  }

  function insertTextAtomic(inputElement, text) {
    if (inputElement instanceof HTMLTextAreaElement) {
      inputElement.value = text;
      inputElement.dispatchEvent(new Event("input", { bubbles: true }));
      inputElement.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    inputElement.focus();

    const singleContainer = `<div style="white-space:pre-wrap;">${escapeHtml(text)}</div>`;

    document.execCommand("selectAll", false, null);
    let success = false;
    try {
      success = document.execCommand("insertHTML", false, singleContainer);
    } catch (_) {}

    if (!success) {
      inputElement.textContent = text;
    }

    inputElement.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        inputType: "insertFromPaste",
      }),
    );
    inputElement.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function fuseAndSubmit(inputElement) {
    if (!activeVirtualFiles.length || !inputElement) return false;

    let userText = "";
    if (inputElement instanceof HTMLTextAreaElement) {
      userText = inputElement.value.trim();
    } else {
      userText = (
        inputElement.innerText ||
        inputElement.textContent ||
        ""
      ).trim();
    }

    const fileBlocks = activeVirtualFiles.map((vf) => {
      return `\n\n${CODE_FENCE}text\n${VF_TOKEN_START}${vf.name}|${vf.lineCount}|${vf.size}${VF_TOKEN_END}\n${vf.content}\n${CODE_FENCE}`;
    });

    const finalPrompt =
      (userText ? userText : "请查阅并分析以下文本内容：") +
      fileBlocks.join("\n");

    activeVirtualFiles = [];
    trayIsDirty = true;
    renderVirtualFileTray();

    observer?.disconnect();
    codeResizeObserver?.disconnect();

    withSelfMutation(() => {
      insertTextAtomic(inputElement, finalPrompt);
    });

    return true;
  }

  function sendWithRetry(inputElement, onComplete) {
    let attempts = 0;
    const maxAttempts = 30;

    const timer = setInterval(() => {
      attempts++;

      let sendBtn = null;
      for (const sel of currentPlatform.sendButtonSelectors || []) {
        const candidates = document.querySelectorAll(sel);
        for (const btn of candidates) {
          if (
            btn instanceof HTMLElement &&
            !btn.hasAttribute("disabled") &&
            btn.getAttribute("aria-disabled") !== "true"
          ) {
            sendBtn = btn;
            break;
          }
        }
        if (sendBtn) break;
      }

      if (sendBtn) {
        clearInterval(timer);
        sendBtn.click();
        cleanupAndResume(onComplete, true);
        return;
      }

      if (attempts >= 8) {
        for (const sel of currentPlatform.sendButtonSelectors || []) {
          const btn = document.querySelector(sel);
          if (btn instanceof HTMLElement) {
            clearInterval(timer);
            btn.removeAttribute("disabled");
            btn.setAttribute("aria-disabled", "false");
            btn.click();
            cleanupAndResume(onComplete, true);
            return;
          }
        }
      }

      if (attempts >= maxAttempts) {
        clearInterval(timer);
        if (inputElement) {
          inputElement.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "Enter",
              code: "Enter",
              keyCode: 13,
              which: 13,
              bubbles: true,
            }),
          );
        }
        cleanupAndResume(onComplete, false);
      }
    }, 50);
  }

  function cleanupAndResume(onComplete, status) {
    window.setTimeout(() => {
      observeDom();
      observeCodeLayout();
      if (onComplete) onComplete(status);
    }, 280);
  }

  function handleSendIntercept(event) {
    if (
      !state.virtualFileEnabled ||
      !activeVirtualFiles.length ||
      isSubmitting
    ) {
      return;
    }

    if (
      event.type === "keydown" &&
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.isComposing
    ) {
      const input = getChatInput();
      if (input && (event.target === input || input.contains(event.target))) {
        event.preventDefault();
        event.stopPropagation();
        isSubmitting = true;
        fuseAndSubmit(input);
        sendWithRetry(input, () => {
          isSubmitting = false;
        });
        return;
      }
    }

    if (event.type === "click") {
      const btn = event.target.closest(
        currentPlatform.sendButtonSelectors.join(","),
      );
      if (btn) {
        event.preventDefault();
        event.stopPropagation();
        const input = getChatInput();
        if (input) {
          isSubmitting = true;
          fuseAndSubmit(input);
          sendWithRetry(input, () => {
            isSubmitting = false;
          });
        }
      }
    }
  }

  function injectEngineStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const styleElement = document.createElement("style");
    styleElement.id = STYLE_ID;
    styleElement.textContent = `
      .ai-turbo-dehydrated {
        content-visibility: hidden !important;
        contain: layout paint style !important;
        contain-intrinsic-size: auto 120px var(--turbo-cached-h, 120px) !important;
      }
      .ai-turbo-dehydrated * {
        pointer-events: none !important;
      }

      .ai-turbo-code-bar {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        min-height: 34px !important;
        padding: 4px 14px 4px 16px !important;
        background: rgba(18, 24, 38, 0.92) !important;
        backdrop-filter: blur(10px) !important;
        -webkit-backdrop-filter: blur(10px) !important;
        border: 1px solid rgba(148, 163, 184, 0.22) !important;
        border-radius: 9999px !important;
        margin-top: 14px !important;
        margin-bottom: 8px !important;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25) !important;
        box-sizing: border-box !important;
        position: relative !important;
        z-index: 10 !important;
        transition: border-color 0.2s ease, box-shadow 0.2s ease !important;
      }

      .ai-turbo-code-bar:hover {
        border-color: rgba(52, 211, 153, 0.45) !important;
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35), 0 0 10px rgba(52, 211, 153, 0.15) !important;
      }

      .ai-turbo-code-bar-meta {
        display: inline-flex !important;
        align-items: center !important;
        gap: 8px !important;
        font: 11px ui-monospace, SFMono-Regular, Menlo, monospace !important;
      }

      .ai-turbo-code-lang {
        font-weight: 700 !important;
        color: #34d399 !important;
      }

      .ai-turbo-code-lines {
        color: #94a3b8 !important;
      }

      @keyframes ai-turbo-pulse {
        0% { opacity: 0.45; transform: scale(0.98); }
        50% { opacity: 1; transform: scale(1.02); }
        100% { opacity: 0.45; transform: scale(0.98); }
      }

      .ai-turbo-streaming-badge {
        display: inline-flex !important;
        align-items: center !important;
        gap: 4px !important;
        color: #34d399 !important;
        font-weight: 700 !important;
        animation: ai-turbo-pulse 1.3s infinite ease-in-out !important;
      }

      .ai-turbo-code-toggle {
        appearance: none !important;
        background: rgba(255, 255, 255, 0.08) !important;
        border: 1px solid rgba(148, 163, 184, 0.25) !important;
        color: #f1f5f9 !important;
        padding: 3px 12px !important;
        border-radius: 9999px !important;
        font: 600 11px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        cursor: pointer !important;
        transition: all 120ms ease !important;
      }

      .ai-turbo-code-toggle:hover {
        background: rgba(52, 211, 153, 0.2) !important;
        color: #34d399 !important;
        border-color: rgba(52, 211, 153, 0.4) !important;
      }

      .ai-turbo-code-target {
        display: block !important;
        margin-top: 0 !important;
        border-radius: 10px !important;
      }

      .ai-turbo-code-target.ai-turbo-folded {
        max-height: ${CODE_PREVIEW_HEIGHT}px !important;
        overflow: hidden !important;
        position: relative !important;
      }

      .ai-turbo-code-target.ai-turbo-folded pre,
      .ai-turbo-code-target.ai-turbo-folded code,
      .ai-turbo-code-target.ai-turbo-folded .code-block-decoration + * {
        max-height: ${CODE_PREVIEW_HEIGHT}px !important;
        overflow: hidden !important;
      }

      .ai-turbo-code-target.ai-turbo-folded::after {
        content: "" !important;
        position: absolute !important;
        inset: auto 0 0 0 !important;
        height: 70px !important;
        background: linear-gradient(180deg, rgba(13, 18, 28, 0) 0%, rgba(13, 18, 28, 0.96) 100%) !important;
        pointer-events: none !important;
        z-index: 5 !important;
      }

      .ai-turbo-code-target.ai-turbo-expanded {
        max-height: none !important;
        overflow: visible !important;
      }

      .ai-turbo-code-target.ai-turbo-expanded pre,
      .ai-turbo-code-target.ai-turbo-expanded code,
      .ai-turbo-code-target.ai-turbo-expanded .code-block-decoration + * {
        max-height: none !important;
        overflow: visible !important;
      }

      .ai-turbo-vf-tray {
        display: flex !important;
        flex-wrap: wrap !important;
        align-items: center !important;
        gap: 8px !important;
        padding: 6px 12px !important;
        margin-bottom: 8px !important;
        background: rgba(13, 18, 28, 0.88) !important;
        border: 1px dashed rgba(52, 211, 153, 0.4) !important;
        border-radius: 12px !important;
        backdrop-filter: blur(8px) !important;
        -webkit-backdrop-filter: blur(8px) !important;
        box-sizing: border-box !important;
        z-index: 50 !important;
      }

      .ai-turbo-vf-pill {
        display: inline-flex !important;
        align-items: center !important;
        gap: 8px !important;
        padding: 4px 12px !important;
        border-radius: 9999px !important;
        background: rgba(22, 27, 34, 0.95) !important;
        border: 1px solid rgba(52, 211, 153, 0.5) !important;
        color: #e2e8f0 !important;
        font: 500 11.5px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", monospace !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25) !important;
        user-select: none !important;
      }

      .ai-turbo-vf-badge {
        background: rgba(52, 211, 153, 0.15) !important;
        color: #34d399 !important;
        padding: 2px 6px !important;
        border-radius: 6px !important;
        font-weight: 700 !important;
        font-size: 10px !important;
      }

      .ai-turbo-vf-btn {
        background: transparent !important;
        border: none !important;
        color: #94a3b8 !important;
        cursor: pointer !important;
        padding: 2px 4px !important;
        border-radius: 4px !important;
        font-size: 11px !important;
        transition: color 0.15s, background 0.15s !important;
      }

      .ai-turbo-vf-btn:hover {
        color: #ef4444 !important;
        background: rgba(239, 68, 68, 0.15) !important;
      }

      .ai-turbo-vf-btn-preview:hover {
        color: #38bdf8 !important;
        background: rgba(56, 189, 248, 0.15) !important;
      }

      .ai-turbo-modal-backdrop {
        position: fixed !important;
        inset: 0 !important;
        background: rgba(0, 0, 0, 0.72) !important;
        backdrop-filter: blur(8px) !important;
        -webkit-backdrop-filter: blur(8px) !important;
        z-index: 2147483646 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 24px !important;
        box-sizing: border-box !important;
      }
    `;

    styleElement.textContent += `
      /* ---------------------------------------------------------
        AI Turbo visual refresh
        AzSkills-inspired: restrained dark surfaces + one accent
        --------------------------------------------------------- */

      .ai-turbo-vf-tray {
        position: fixed !important;
        z-index: 2147483645 !important;

        display: grid !important;
        gap: 7px !important;

        padding: 8px !important;

        box-sizing: border-box !important;

        background: rgba(14, 18, 20, 0.985) !important;

        border: 1px solid rgba(153, 166, 161, 0.19) !important;
        border-left: 2px solid rgba(101, 210, 164, 0.72) !important;

        border-radius: 12px !important;

        box-shadow:
          0 16px 36px rgba(0, 0, 0, 0.28),
          0 4px 10px rgba(0, 0, 0, 0.18) !important;

        color: #e7eeea !important;

        pointer-events: auto !important;

        opacity: 0 !important;
        visibility: hidden !important;

        transform: translateY(3px) !important;
        transition:
          opacity 120ms ease,
          transform 120ms ease,
          visibility 120ms ease !important;
      }

      .ai-turbo-vf-tray.is-positioned {
        opacity: 1 !important;
        visibility: visible !important;
        transform: translateY(0) !important;
      }

      .ai-turbo-vf-header {
        min-width: 0 !important;

        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 12px !important;

        padding: 1px 3px 2px !important;
      }

      .ai-turbo-vf-heading {
        min-width: 0 !important;

        display: inline-flex !important;
        align-items: center !important;
        gap: 6px !important;
      }

      .ai-turbo-vf-heading-icon {
        width: 20px !important;
        height: 20px !important;

        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;

        color: #72d6ab !important;

        border: 1px solid rgba(101, 210, 164, 0.22) !important;
        border-radius: 6px !important;

        background: rgba(101, 210, 164, 0.07) !important;
      }

      .ai-turbo-vf-heading-title {
        font:
          650 11px/1.2
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          sans-serif !important;

        color: #e7eeea !important;
      }

      .ai-turbo-vf-heading-count {
        min-width: 18px !important;
        height: 18px !important;

        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;

        padding: 0 5px !important;

        border-radius: 6px !important;

        background: rgba(101, 210, 164, 0.09) !important;
        color: #72d6ab !important;

        font:
          700 9px/1
          ui-monospace,
          SFMono-Regular,
          Menlo,
          monospace !important;
      }

      .ai-turbo-vf-heading-hint {
        flex: 0 0 auto !important;

        color: #69756f !important;

        font:
          9.5px/1.2
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          sans-serif !important;
      }

      .ai-turbo-vf-list {
        display: flex !important;
        flex-wrap: wrap !important;
        gap: 6px !important;

        min-width: 0 !important;
      }

      .ai-turbo-vf-pill {
        min-width: 0 !important;

        display: inline-flex !important;
        align-items: center !important;

        gap: 7px !important;

        min-height: 34px !important;

        padding: 5px 7px 5px 8px !important;

        border:
          1px solid rgba(153, 166, 161, 0.16) !important;

        border-radius: 9px !important;

        background: rgba(24, 29, 32, 0.96) !important;

        box-sizing: border-box !important;

        transition:
          background 120ms ease,
          border-color 120ms ease !important;
      }

      .ai-turbo-vf-pill:hover {
        background: rgba(29, 35, 38, 0.98) !important;
        border-color: rgba(101, 210, 164, 0.27) !important;
      }

      .ai-turbo-vf-file-icon {
        width: 24px !important;
        height: 24px !important;

        flex: 0 0 24px !important;

        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;

        color: #9eaba5 !important;

        background: rgba(255, 255, 255, 0.035) !important;

        border:
          1px solid rgba(153, 166, 161, 0.13) !important;

        border-radius: 7px !important;
      }

      .ai-turbo-vf-file-copy {
        min-width: 80px !important;
        max-width: 260px !important;

        display: grid !important;
        gap: 2px !important;
      }

      .ai-turbo-vf-name {
        display: block !important;

        overflow: hidden !important;

        text-overflow: ellipsis !important;
        white-space: nowrap !important;

        color: #e8eeeb !important;

        font:
          550 11px/1.25
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          sans-serif !important;
      }

      .ai-turbo-vf-meta {
        display: block !important;

        overflow: hidden !important;

        text-overflow: ellipsis !important;
        white-space: nowrap !important;

        color: #68746f !important;

        font:
          9px/1.2
          ui-monospace,
          SFMono-Regular,
          Menlo,
          monospace !important;
      }

      .ai-turbo-vf-badge {
        flex: 0 0 auto !important;

        display: inline-flex !important;
        align-items: center !important;

        height: 20px !important;

        padding: 0 6px !important;

        border-radius: 5px !important;

        background: rgba(101, 210, 164, 0.08) !important;
        border: 1px solid rgba(101, 210, 164, 0.14) !important;

        color: #72d6ab !important;

        font:
          700 8px/1
          ui-monospace,
          SFMono-Regular,
          Menlo,
          monospace !important;

        letter-spacing: 0.04em !important;
      }

      .ai-turbo-vf-actions {
        display: inline-flex !important;
        align-items: center !important;
        gap: 2px !important;

        margin-left: 2px !important;
      }

      .ai-turbo-vf-action {
        width: 26px !important;
        height: 26px !important;

        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;

        padding: 0 !important;

        border: 0 !important;
        border-radius: 6px !important;

        background: transparent !important;

        color: #77827d !important;

        cursor: pointer !important;

        transition:
          background 120ms ease,
          color 120ms ease !important;
      }

      .ai-turbo-vf-action:hover {
        background: rgba(255, 255, 255, 0.055) !important;
        color: #d8e1dc !important;
      }

      .ai-turbo-vf-action-preview:hover {
        color: #72d6ab !important;
      }

      .ai-turbo-vf-action-delete:hover {
        color: #ef8c8c !important;
        background: rgba(239, 68, 68, 0.08) !important;
      }

      /*
      * Sent-message virtual-file capsule.
      * Keep it recognizable as the product signature,
      * but remove the oversized "magic pill" feeling.
      */
      .ai-turbo-chat-capsule {
        display: inline-flex !important;
        align-items: center !important;
        gap: 8px !important;

        padding: 7px 9px !important;
        margin: 7px 0 10px !important;

        max-width: min(100%, 680px) !important;

        background: #111619 !important;

        border:
          1px solid rgba(153, 166, 161, 0.18) !important;

        border-left:
          2px solid rgba(101, 210, 164, 0.7) !important;

        border-radius: 10px !important;

        box-shadow:
          0 5px 16px rgba(0, 0, 0, 0.16) !important;

        user-select: none !important;
      }

      .ai-turbo-chat-capsule:hover {
        border-color:
          rgba(101, 210, 164, 0.3) !important;
      }

      /*
      * Code toolbar: less pill, more product control.
      */
      .ai-turbo-code-bar {
        min-height: 38px !important;

        padding:
          5px 8px 5px 12px !important;

        margin:
          14px 0 8px !important;

        background: #111619 !important;

        border:
          1px solid rgba(153, 166, 161, 0.16) !important;

        border-radius: 10px !important;

        box-shadow:
          0 5px 16px rgba(0, 0, 0, 0.14) !important;

        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }

      .ai-turbo-code-bar:hover {
        border-color:
          rgba(101, 210, 164, 0.3) !important;

        box-shadow:
          0 6px 18px rgba(0, 0, 0, 0.18) !important;
      }

      .ai-turbo-code-lang {
        color: #72d6ab !important;
      }

      .ai-turbo-code-toggle {
        padding: 5px 9px !important;

        border-radius: 7px !important;

        background:
          rgba(255, 255, 255, 0.035) !important;

        border:
          1px solid rgba(153, 166, 161, 0.14) !important;

        color: #c9d2ce !important;

        font-size: 10.5px !important;
      }

      .ai-turbo-code-toggle:hover {
        background:
          rgba(101, 210, 164, 0.08) !important;

        color: #72d6ab !important;

        border-color:
          rgba(101, 210, 164, 0.28) !important;
      }

      @media (prefers-reduced-motion: reduce) {
        .ai-turbo-vf-tray,
        .ai-turbo-vf-pill,
        .ai-turbo-vf-action,
        .ai-turbo-code-bar,
        .ai-turbo-code-toggle {
          transition: none !important;
        }
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
    ensureHUDMounted();
    if (!hudRootElement || !hudShadowRoot) return;

    state.hudOpen =
      typeof forceState === "boolean" ? forceState : !state.hudOpen;

    const backdrop = hudShadowRoot.querySelector("#backdrop");
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
      searchResultsBox.appendChild(
        el("div", { className: "result-empty" }, ["没有匹配的消息"]),
      );
      return;
    }

    for (const record of matches) {
      const resultButton = el(
        "button",
        {
          type: "button",
          className: "result-item",
          onclick: () => {
            togglePanel(false);
            record.element.classList.remove("ai-turbo-dehydrated");
            record.element.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
            record.element.style.outline = "2px solid rgba(52, 211, 153, 0.85)";
            record.element.style.outlineOffset = "4px";

            window.setTimeout(() => {
              record.element.style.outline = "";
              record.element.style.outlineOffset = "";
            }, 1800);
          },
        },
        [`#${record.id + 1}  ${record.text || "（无文本）"}`],
      );
      searchResultsBox.appendChild(resultButton);
    }
  }

  function buildHUD() {
    if (hudRootElement?.isConnected) return;

    const mountTarget = document.body || document.documentElement;
    if (!mountTarget) return;

    document.getElementById(HUD_ID)?.remove();

    hudRootElement = el("div", {
      id: HUD_ID,
      style:
        "all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;display:block!important;",
    });

    hudShadowRoot = hudRootElement.attachShadow({ mode: "open" });

    const styles = document.createElement("style");
    styles.textContent = `
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
        font: 600 11px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        cursor: grab;
        user-select: none;
        touch-action: none;
      }
      .docked-pill:active { cursor: grabbing; }
      .docked-pill:hover {
        border-color: rgba(52, 211, 153, 0.8);
        color: #34d399;
      }

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
      .search-input:focus { border-color: #34d399; }
      .results { max-height: 120px; overflow-y: auto; margin-top: 6px; display: grid; gap: 4px; }
      .result-item, .result-empty { padding: 6px 8px; font-size: 10px; border-radius: 6px; background: rgba(255, 255, 255, 0.03); color: #cbd5e1; border: none; text-align: left; cursor: pointer; }
      .result-item { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
      .result-item:hover { background: rgba(52, 211, 153, 0.1); color: #34d399; }
      .result-empty { text-align: center; color: #64748b; }
      .footer-hint { margin-top: 12px; font-size: 9.5px; color: #475569; text-align: center; }
      kbd { padding: 2px 4px; border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 4px; color: #94a3b8; font-family: ui-monospace, monospace; }
    `;
    styles.textContent += `
      .docked-pill {
        height: 34px;
        padding: 0 11px;

        background: #0d1113;
        border: 1px solid rgba(153, 166, 161, 0.22);

        box-shadow:
          0 8px 24px rgba(0, 0, 0, 0.24);

        color: #dce5e1;
        font:
          650 11px/1
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          sans-serif;
      }

      .docked-pill:hover {
        color: #72d6ab;
        border-color: rgba(101, 210, 164, 0.45);
      }

      .hud-panel {
        width: 392px;
        max-width: 94vw;

        padding: 18px;

        border:
          1px solid rgba(153, 166, 161, 0.19);

        border-radius: 14px;

        background: #0c1012;

        box-shadow:
          0 26px 70px rgba(0, 0, 0, 0.48);

        color: #e2ebe6;
      }

      .status-item {
        padding: 9px;

        border:
          1px solid rgba(153, 166, 161, 0.11);

        border-radius: 9px;

        background: #101517;
      }

      .status-value {
        color: #e8efeb;
      }

      .section {
        border-top:
          1px solid rgba(153, 166, 161, 0.1);
      }

      .section-title {
        color: #68746f;
      }

      .control-row {
        color: #c9d3ce;
      }

      .stepper {
        border:
          1px solid rgba(153, 166, 161, 0.15);

        border-radius: 8px;

        background: #0f1315;
      }

      .stepper button:hover {
        background:
          rgba(101, 210, 164, 0.07);

        color: #72d6ab;
      }

      .action-btn {
        height: 34px;

        margin-top: 10px;

        border:
          1px solid rgba(153, 166, 161, 0.15);

        border-radius: 8px;

        background: #111719;

        color: #ccd6d1;
      }

      .action-btn:hover {
        background:
          rgba(101, 210, 164, 0.07);

        border-color:
          rgba(101, 210, 164, 0.25);

        color: #72d6ab;
      }

      .search-input {
        height: 34px;

        border:
          1px solid rgba(153, 166, 161, 0.16);

        border-radius: 8px;

        background: #0f1416;

        color: #e6eeea;
      }

      .search-input:focus {
        border-color:
          rgba(101, 210, 164, 0.48);
      }

      .result-item,
      .result-empty {
        border-radius: 7px;

        background: #101517;
      }

      .result-item:hover {
        background:
          rgba(101, 210, 164, 0.07);

        color: #72d6ab;
      }

      @media (prefers-reduced-motion: reduce) {
        .modal-backdrop,
        .hud-panel {
          transition: none !important;
        }
      }
    `;
    hudShadowRoot.appendChild(styles);

    const pill = el(
      "button",
      {
        className: "docked-pill",
        id: "pill-trigger",
        type: "button",
        title: "点击呼出 (Alt+T)，可拖拽避开其他按钮",
      },
      ["⚡ ", el("span", {}, ["Turbo"])],
    );

    const totalVal = el(
      "strong",
      { className: "status-value", id: "total-val" },
      ["0"],
    );
    const hiddenVal = el(
      "strong",
      { className: "status-value", id: "hidden-val" },
      ["0"],
    );
    const foldedVal = el(
      "strong",
      { className: "status-value", id: "folded-val" },
      ["0"],
    );

    const statusStrip = el("div", { className: "status-strip" }, [
      el("div", { className: "status-item" }, [
        el("span", { className: "status-label" }, ["消息总数"]),
        totalVal,
      ]),
      el("div", { className: "status-item" }, [
        el("span", { className: "status-label" }, ["已脱水"]),
        hiddenVal,
      ]),
      el("div", { className: "status-item" }, [
        el("span", { className: "status-label" }, ["代码折叠"]),
        foldedVal,
      ]),
    ]);

    const keepVal = el("span", { id: "keep-val" }, [String(state.keepTurns)]);
    const stepDec = el(
      "button",
      {
        type: "button",
        onclick: () => {
          if (state.keepTurns <= 2) return;
          state.keepTurns--;
          keepVal.textContent = String(state.keepTurns);
          saveCurrentConfig();
          fullTurnSyncRequested = true;
          requestUpdate();
        },
      },
      ["−"],
    );
    const stepInc = el(
      "button",
      {
        type: "button",
        onclick: () => {
          if (state.keepTurns >= 50) return;
          state.keepTurns++;
          keepVal.textContent = String(state.keepTurns);
          saveCurrentConfig();
          fullTurnSyncRequested = true;
          requestUpdate();
        },
      },
      ["+"],
    );

    const chkPrune = el("input", {
      type: "checkbox",
      checked: state.pruneEnabled ? "checked" : "",
      onchange: () => {
        state.pruneEnabled = chkPrune.checked;
        saveCurrentConfig();
        fullTurnSyncRequested = true;
        requestUpdate();
      },
    });

    const chkCollapse = el("input", {
      type: "checkbox",
      checked: state.collapseCode ? "checked" : "",
      onchange: () => {
        state.collapseCode = chkCollapse.checked;
        saveCurrentConfig();
        codeScanRequested = true;
        requestUpdate();
      },
    });

    const chkVirtualFile = el("input", {
      type: "checkbox",
      checked: state.virtualFileEnabled ? "checked" : "",
      onchange: () => {
        state.virtualFileEnabled = chkVirtualFile.checked;
        saveCurrentConfig();
        if (!state.virtualFileEnabled) {
          activeVirtualFiles = [];
          trayIsDirty = true;
          renderVirtualFileTray();
        }
      },
    });

    const forkText = el("span", { id: "fork-text" }, ["提取当前上下文"]);
    const btnFork = el(
      "button",
      {
        className: "action-btn",
        type: "button",
        onclick: () => {
          exportCleanContext((count) => {
            btnFork.classList.add("copied");
            forkText.textContent = `已复制 ${count} 条消息`;
            window.setTimeout(() => {
              btnFork.classList.remove("copied");
              forkText.textContent = "提取当前上下文";
            }, 2000);
          });
        },
      },
      [forkText],
    );

    const strategySection = el("div", { className: "section" }, [
      el("div", { className: "section-title" }, ["引擎策略"]),
      el("div", { className: "control-row" }, [
        el("span", {}, ["活跃保留轮次"]),
        el("div", { className: "stepper" }, [stepDec, keepVal, stepInc]),
      ]),
      el("div", { className: "control-row" }, [
        el("span", {}, ["安全视口脱水"]),
        el("label", { className: "switch" }, [
          chkPrune,
          el("span", { className: "slider" }),
        ]),
      ]),
      el("div", { className: "control-row" }, [
        el("span", {}, ["长代码自动折叠"]),
        el("label", { className: "switch" }, [
          chkCollapse,
          el("span", { className: "slider" }),
        ]),
      ]),
      el("div", { className: "control-row" }, [
        el("span", {}, ["长文本伪文件胶囊"]),
        el("label", { className: "switch" }, [
          chkVirtualFile,
          el("span", { className: "slider" }),
        ]),
      ]),
      btnFork,
    ]);

    searchInput = el("input", {
      className: "search-input",
      type: "text",
      placeholder: "检索当前会话内容...",
      autocomplete: "off",
      oninput: () => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = window.setTimeout(() => {
          renderSearchResults(searchInput.value.trim());
        }, 100);
      },
    });
    searchResultsBox = el("div", { className: "results" });

    const searchSection = el("div", { className: "section" }, [
      el("div", { className: "section-title" }, ["历史检索"]),
      el("div", { className: "search-wrap" }, [searchInput]),
      searchResultsBox,
    ]);

    const btnClose = el(
      "button",
      {
        className: "close-btn",
        type: "button",
        "aria-label": "关闭",
        onclick: () => togglePanel(false),
      },
      ["✕"],
    );

    const panelHeader = el("div", { className: "header" }, [
      el("div", {}, [
        el("div", { className: "brand-title" }, ["AI Turbo Engine"]),
        el("div", { className: "brand-subtitle" }, [
          `${currentPlatform.name} · v${VERSION}`,
        ]),
      ]),
      btnClose,
    ]);

    const footerHint = el("div", { className: "footer-hint" }, [
      el("kbd", {}, ["Alt"]),
      " + ",
      el("kbd", {}, ["T"]),
      " 呼出 / 收起 · ",
      el("kbd", {}, ["Esc"]),
      " 退出",
    ]);

    const panel = el("div", { className: "hud-panel", id: "panel" }, [
      panelHeader,
      statusStrip,
      strategySection,
      searchSection,
      footerHint,
    ]);

    const backdrop = el(
      "div",
      {
        className: "modal-backdrop",
        id: "backdrop",
        onclick: (e) => {
          if (e.target === backdrop) togglePanel(false);
        },
      },
      [panel],
    );

    hudShadowRoot.append(pill, backdrop);
    mountTarget.appendChild(hudRootElement);

    hudStats = {
      total: totalVal,
      hidden: hiddenVal,
      folded: foldedVal,
    };

    initPillDrag(pill);
  }

  function initPillDrag(pill) {
    if (!pill) return;

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

    let dragging = false;
    let startX = 0,
      startY = 0;
    let originX = 0,
      originY = 0;

    const onPointerMove = (e) => {
      if (!dragging) return;
      const nextX = Math.max(
        8,
        Math.min(
          window.innerWidth - pill.offsetWidth - 8,
          originX + e.clientX - startX,
        ),
      );
      const nextY = Math.max(
        8,
        Math.min(
          window.innerHeight - pill.offsetHeight - 8,
          originY + e.clientY - startY,
        ),
      );
      pill.style.left = `${nextX}px`;
      pill.style.top = `${nextY}px`;
    };

    const onPointerUp = (e) => {
      if (!dragging) return;
      dragging = false;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);

      if (
        Math.abs(e.clientX - startX) < 4 &&
        Math.abs(e.clientY - startY) < 4
      ) {
        togglePanel(true);
        return;
      }

      try {
        const rect = pill.getBoundingClientRect();
        localStorage.setItem(
          STORAGE_KEY_POS,
          JSON.stringify({ x: rect.left, y: rect.top }),
        );
      } catch (_) {}
    };

    pill.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      dragging = true;
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
        mutationTarget.closest(
          `#${HUD_ID}, .ai-turbo-code-bar, #ai-turbo-vf-tray, .ai-turbo-chat-capsule, #ai-turbo-vf-preview-modal`,
        )
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
      }

      if (possibleCode instanceof HTMLElement) {
        dirtyCodeBlocks.add(possibleCode);
      }

      if (mutationRecord.type !== "childList") continue;

      for (const changedNode of [
        ...mutationRecord.addedNodes,
        ...mutationRecord.removedNodes,
      ]) {
        if (!(changedNode instanceof Element)) continue;

        if (
          changedNode.matches(turnSelector) ||
          changedNode.querySelector(turnSelector)
        ) {
          structuralChange = true;
        }

        for (const selector of codeSelectors) {
          if (changedNode.matches(selector)) {
            const elNorm = normalizeCodeElement(changedNode);
            if (elNorm instanceof HTMLElement) {
              dirtyCodeBlocks.add(elNorm);
            }
          }
          changedNode.querySelectorAll(selector).forEach((c) => {
            const elNorm = normalizeCodeElement(c);
            if (elNorm instanceof HTMLElement) {
              dirtyCodeBlocks.add(elNorm);
            }
          });
        }
      }
    }

    if (structuralChange) {
      fullTurnSyncRequested = true;
      codeScanRequested = true;
    }
  }

  function runScheduledUpdate() {
    scheduleTimer = null;
    lastUpdateTime = performance.now();

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

    syncTurnIndex(fullTurnSyncRequested);
    syncCodeBlocks(codeScanRequested, dirtyCodeBlocks);
    updateHudDashboard();
    ensureHUDMounted();
    if (trayIsDirty) renderVirtualFileTray();
  }

  // 优化点4：80ms 弹性合并节流，杜绝 60 FPS 无意义轰炸
  function requestUpdate() {
    if (scheduleTimer) return;
    const elapsed = performance.now() - lastUpdateTime;
    if (elapsed >= THROTTLE_INTERVAL) {
      scheduleTimer = window.requestAnimationFrame(runScheduledUpdate);
    } else {
      scheduleTimer = window.setTimeout(() => {
        scheduleTimer = window.requestAnimationFrame(runScheduledUpdate);
      }, THROTTLE_INTERVAL - elapsed);
    }
  }

  function observeCodeLayout() {
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
      codeResizeObserver.observe(codeElement);
    });
  }

  function observeDom() {
    const observeRoot = document.documentElement || document.body;
    if (!observeRoot) return;

    observer?.disconnect();
    observer = new MutationObserver((records) => {
      if (selfMutationDepth > 0) return;
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
    } else if (
      document.body &&
      hudRootElement.parentElement !== document.body
    ) {
      document.body.appendChild(hudRootElement);
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

  function bindGlobalListeners() {
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") {
          const previewModal = document.getElementById(
            "ai-turbo-vf-preview-modal",
          );
          if (previewModal) {
            event.preventDefault();
            event.stopPropagation();
            previewModal.remove();
            return;
          }
          if (state.hudOpen) {
            event.preventDefault();
            event.stopPropagation();
            togglePanel(false);
            return;
          }
        }

        if (
          event.altKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          (event.code === "KeyT" ||
            event.key.toLowerCase() === "t" ||
            event.key === "†")
        ) {
          event.preventDefault();
          event.stopPropagation();
          togglePanel();
        }
      },
      true,
    );

    window.addEventListener("paste", handlePasteIntercept, true);
    window.addEventListener("keydown", handleSendIntercept, true);
    window.addEventListener("click", handleSendIntercept, true);
  }

  function boot() {
    loadSavedConfig();
    injectEngineStyles();
    buildHUD();
    observeCodeLayout();
    observeDom();
    patchHistoryForSpaNavigation();
    bindGlobalListeners();

    window.addEventListener("resize", scheduleVirtualFileTrayPosition, {
      passive: true,
    });

    window.addEventListener("scroll", scheduleVirtualFileTrayPosition, {
      passive: true,
      capture: true,
    });

    window.visualViewport?.addEventListener(
      "resize",
      scheduleVirtualFileTrayPosition,
    );

    window.visualViewport?.addEventListener(
      "scroll",
      scheduleVirtualFileTrayPosition,
    );

    fullTurnSyncRequested = true;
    codeScanRequested = true;
    requestUpdate();

    window.addEventListener("load", () => {
      fullTurnSyncRequested = true;
      codeScanRequested = true;
      ensureHUDMounted();
      requestUpdate();
    });

    [250, 800, 2000].forEach((delay) => {
      window.setTimeout(() => {
        ensureHUDMounted();
        requestUpdate();
      }, delay);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
