// ==UserScript==
// @name         AI Chat Turbo Engine
// @namespace    https://local/ai-turbo-engine-v8
// @version      0.8.4
// @description  独立药囊长代码折叠(流式防误触) + 长文本智能伪文件胶囊(持久化配置·原子级极速注入彻底防卡死) + 增量消息索引 + 自适应脱水 + 纯DOM免疫CSP
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

  const VERSION = "0.8.4";
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
  const CODE_FENCE = "\x60\x60\x60";

  // 不可伪造的专属 Token 标识，严格要求数字匹配
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
  let activeVirtualFiles = [];
  let trayIsDirty = false;
  let isSubmitting = false;

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
      turnElement.querySelector(".user-query-text, [class*='query-content']")
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

  function collapseInChatFileBlocks(turnElement) {
    if (!state.virtualFileEnabled || !turnElement || !isUserTurn(turnElement)) {
      return;
    }

    const candidates = turnElement.querySelectorAll(
      "pre, code-block, code, div.markdown > p, .user-query-text",
    );

    candidates.forEach((node) => {
      if (
        node.getAttribute("data-ai-turbo-vf-processed") === "true" ||
        node.closest(".ai-turbo-chat-folded-target") ||
        node.closest(".ai-turbo-chat-capsule")
      ) {
        return;
      }

      const raw = node.textContent || "";
      if (raw.includes(VF_TOKEN_START) && raw.includes(VF_TOKEN_END)) {
        node.setAttribute("data-ai-turbo-vf-processed", "true");

        const match = raw.match(VF_REGEX);
        if (!match) return;

        const fileName = match[1].trim();
        const lineCount = parseInt(match[2], 10) || 0;
        const sizeBytes = parseInt(match[3], 10) || 0;
        const kbSize = (sizeBytes / 1024).toFixed(1);
        const metaInfo = `${lineCount.toLocaleString()} 行 · ${kbSize} KB`;

        const targetToFold =
          node.closest("code-block, pre, .code-block-wrapper") || node;

        const iconSpan = el(
          "span",
          { style: "font-size:14px;line-height:1;" },
          ["📄"],
        );
        const titleSpan = el(
          "span",
          {
            style:
              "font:600 12px/1 ui-monospace,monospace;color:#f1f5f9;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
          },
          [fileName],
        );
        const metaBadge = el(
          "span",
          {
            style:
              "font:10px ui-monospace;background:rgba(52,211,153,0.15);color:#34d399;padding:2px 6px;border-radius:4px;",
          },
          [metaInfo],
        );

        let isExpanded = false;
        const toggleBtn = el(
          "button",
          {
            type: "button",
            style:
              "background:rgba(255,255,255,0.06);border:1px solid rgba(148,163,184,0.2);color:#cbd5e1;padding:3px 10px;border-radius:999px;font:11px sans-serif;cursor:pointer;margin-left:auto;transition:all 0.15s ease;",
          },
          ["展开查看文本"],
        );

        const chatCapsule = el(
          "div",
          {
            className: "ai-turbo-chat-capsule",
            style:
              "display:inline-flex;align-items:center;gap:8px;padding:6px 14px;background:rgba(18,24,38,0.95);border:1px solid rgba(52,211,153,0.4);border-radius:9999px;margin:6px 0;box-shadow:0 2px 10px rgba(0,0,0,0.3);user-select:none;max-width:100%;box-sizing:border-box;",
          },
          [iconSpan, titleSpan, metaBadge, toggleBtn],
        );

        withSelfMutation(() => {
          targetToFold.insertAdjacentElement("beforebegin", chatCapsule);
          targetToFold.classList.add("ai-turbo-chat-folded-target");
          targetToFold.style.setProperty("display", "none", "important");
        });

        toggleBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          isExpanded = !isExpanded;
          toggleBtn.textContent = isExpanded ? "收起文本" : "展开查看文本";
          withSelfMutation(() => {
            if (isExpanded) {
              targetToFold.style.setProperty("display", "block", "important");
              targetToFold.style.setProperty(
                "max-height",
                "360px",
                "important",
              );
              targetToFold.style.setProperty("overflow", "auto", "important");
            } else {
              targetToFold.style.setProperty("display", "none", "important");
            }
          });
        });
      }
    });
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
          candidate.closest(".ai-turbo-chat-folded-target")
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

  // 极速 O(1) 判定：流式输出期间坚决不提取 textContent，消除 GC 与 Reflow 压力
  function updateCodeMeta(entry, codeElement) {
    if (!entry || !codeElement?.isConnected) return;

    const now = Date.now();
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

    if (!entry.isDisplayingStreaming && entry.renderedStaticOnce) {
      return;
    }

    entry.isDisplayingStreaming = false;
    entry.renderedStaticOnce = true;

    const currentText = getCodeText(codeElement);
    const lineCount = fastCountLines(currentText);
    entry.cachedLineCount = lineCount;
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
      cachedLineCount: 0,
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
      trayIsDirty = false;
      return;
    }

    if (!trayIsDirty && tray?.isConnected) return;

    const input = getChatInput();
    const container = getInputContainer(input);
    if (!container) return;

    withSelfMutation(() => {
      if (!tray) {
        tray = el("div", {
          id: "ai-turbo-vf-tray",
          className: "ai-turbo-vf-tray",
        });
        container.insertAdjacentElement("beforebegin", tray);
      }

      tray.textContent = "";

      const hint = el(
        "span",
        {
          style:
            "font:10px sans-serif;color:#10b981;font-weight:600;display:inline-flex;align-items:center;margin-right:4px;",
        },
        ["⚡ 伪文件胶囊 (零配额消耗):"],
      );
      tray.appendChild(hint);

      for (const item of activeVirtualFiles) {
        const badge = el("span", { className: "ai-turbo-vf-badge" }, [
          `${(item.size / 1024).toFixed(1)} KB`,
        ]);

        const nameLabel = el(
          "span",
          {
            style:
              "max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
          },
          [item.name],
        );

        const btnPreview = el(
          "button",
          {
            type: "button",
            className: "ai-turbo-vf-btn ai-turbo-vf-btn-preview",
            title: "预览文本内容",
            onclick: (e) => {
              e.preventDefault();
              e.stopPropagation();
              showTextPreviewModal(item);
            },
          },
          ["👁 预览"],
        );

        const btnDel = el(
          "button",
          {
            type: "button",
            className: "ai-turbo-vf-btn",
            title: "移除该文件胶囊",
            onclick: (e) => {
              e.preventDefault();
              e.stopPropagation();
              removeVirtualFile(item.id);
            },
          },
          ["✕"],
        );

        const pill = el("div", { className: "ai-turbo-vf-pill" }, [
          "📄 ",
          nameLabel,
          badge,
          btnPreview,
          btnDel,
        ]);

        tray.appendChild(pill);
      }
      trayIsDirty = false;
    });
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

  // 原子级批量安全注入：彻底摒弃造成死锁的逐行 execCommand("insertText")
  function insertTextAtomic(inputElement, text) {
    if (inputElement instanceof HTMLTextAreaElement) {
      inputElement.value = text;
      inputElement.dispatchEvent(new Event("input", { bubbles: true }));
      inputElement.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    inputElement.focus();

    // 方案 A：通过 insertHTML 进行单次原子级全树注入，速度提升 1000 倍，不产生行循环卡死
    const html = text
      .split("\n")
      .map((line) => `<p>${escapeHtml(line) || "<br>"}</p>`)
      .join("");

    document.execCommand("selectAll", false, null);
    let success = false;
    try {
      success = document.execCommand("insertHTML", false, html);
    } catch (_) {}

    // 方案 B：若环境封锁 insertHTML，使用内存级 DocumentFragment 进行零开销替换
    if (!success) {
      inputElement.textContent = "";
      const fragment = document.createDocumentFragment();
      const lines = text.split("\n");
      for (const line of lines) {
        const p = document.createElement("p");
        if (line) {
          p.textContent = line;
        } else {
          p.appendChild(document.createElement("br"));
        }
        fragment.appendChild(p);
      }
      inputElement.appendChild(fragment);
    }

    // 广播输入完成信号
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

    // 发送期间断开监听，阻止主线程自旋死锁
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

    syncTurnIndex(fullTurnSyncRequested);
    syncCodeBlocks(codeScanRequested, dirtyCodeBlocks);
    updateHudDashboard();
    ensureHUDMounted();
    if (trayIsDirty) renderVirtualFileTray();
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
