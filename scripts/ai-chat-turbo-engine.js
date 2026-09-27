// ==UserScript==
// @name         AI Chat Turbo Engine
// @namespace    https://local/ai-turbo-engine-v3
// @version      0.2.1
// @description  零回流增量索引 + 安全无感视口脱水 + 事件代理折叠 + 弹窗安全隔离 (AzSkills 精密磨砂设计系统 + 完整矢量图标版)
// @author       Senior Frontend Engineer
// @match        https://chatgpt.com/*
// @match        https://gemini.google.com/*
// @match        https://grok.com/*
// @match        https://x.com/i/grok*
// @match        https://claude.ai/*
// @run-at       document-start
// @grant        none
// @icon         data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="64" height="64"><rect width="24" height="24" rx="6" fill="%2309090b"/><path d="M13 2L3 14h8l-1 8 11-12h-8l1-8z" fill="%2310b981"/></svg>
// @license      MIT
// ==/UserScript==

(function () {
  "use strict";

  // --- 1. 平台特征选择器与提取引擎 ---
  const PLATFORMS = {
    chatgpt: {
      name: "ChatGPT",
      turns:
        'article[data-testid^="conversation-turn-"], div[data-message-author-role]',
      getTurns: () =>
        document.querySelectorAll(
          'article[data-testid^="conversation-turn-"], div[data-message-author-role]',
        ),
      inputContainer:
        'form, div[class*="composer"], div[class*="PromptTextarea"]',
      contentBody: 'div[class*="markdown"], div[data-message-author-role]',
      codeBlocks: "pre",
      styleTurns:
        'article[data-testid^="conversation-turn-"], div[data-message-author-role]',
    },
    gemini: {
      name: "Gemini",
      // 解决 Gemini 父子嵌套重复统计缺陷：优先取顶层 turn 容器，无顶层容器时才并列取 user/model 节点
      getTurns: () => {
        const topContainers = document.querySelectorAll(
          "chat-turn, .chat-turn-container, div[class*='chat-turn-container']",
        );
        if (topContainers.length > 0) return topContainers;
        return document.querySelectorAll(
          "user-query-container, model-response, user-query",
        );
      },
      inputContainer:
        ".input-area-container, rich-textarea, .chat-input-container",
      contentBody: ".message-content, .model-response-text, message-content",
      // 避免 code-block 和内部 pre 重复折叠导致双层遮罩
      codeBlocks: "code-block, pre:not(code-block pre)",
      styleTurns:
        "chat-turn, .chat-turn-container, user-query-container, model-response, user-query",
    },
    grok: {
      name: "Grok",
      getTurns: () =>
        document.querySelectorAll(
          'div[data-testid*="message-container"], div[data-testid*="conversation-turn"], div[class*="message-bubble"]',
        ),
      inputContainer: 'div[class*="composer"], textarea, div[role="textbox"]',
      contentBody: 'div[class*="message-content"], div[dir="auto"]',
      codeBlocks: "pre",
      styleTurns:
        'div[data-testid*="message-container"], div[data-testid*="conversation-turn"], div[class*="message-bubble"]',
    },
    claude: {
      name: "Claude",
      getTurns: () =>
        document.querySelectorAll(
          "div[data-test-render-count], div.font-user-message, div.font-claude-message",
        ),
      inputContainer: 'fieldset, div[contenteditable="true"]',
      contentBody: 'div.grid-cols-1, div[class*="font-claude"]',
      codeBlocks: "pre",
      styleTurns:
        "div[data-test-render-count], div.font-user-message, div.font-claude-message",
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

  // --- 2. 状态中心 ---
  const state = {
    pruneEnabled: true,
    keepTurns: 8,
    collapseCode: true,
    gpuSaver: true,
    indexedTurns: [],
    totalTurns: 0,
    hiddenCount: 0,
    hudOpen: false,
  };

  const indexedSet = new WeakSet();

  // --- 3. 样式注入引擎 ---
  function injectEngineStyles() {
    const styleId = "ai-turbo-extreme-styles";
    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      /* 视口脱水：保障自定义元素以 block 布局排布，规避 content-visibility 导致的高度归零 */
      ${currentPlatform.styleTurns} {
        display: block !important;
        content-visibility: auto !important;
        contain-intrinsic-size: auto 240px !important;
      }
      .ai-turbo-dehydrated {
        content-visibility: hidden !important;
        contain-intrinsic-size: auto 80px !important;
      }
      /* 输入框容器轻量隔离 */
      ${currentPlatform.inputContainer} {
        contain: style !important;
      }
      /* 长代码折叠容器 (纯 CSS 驱动) */
      .ai-turbo-folded-code {
        display: block !important;
        max-height: 96px !important;
        overflow: hidden !important;
        position: relative !important;
        border-bottom: 2px solid #10b981 !important;
      }
      .ai-turbo-folded-code::after {
        content: "⚡ 代码已自动折叠 (点击展开)";
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 32px;
        line-height: 32px;
        background: linear-gradient(180deg, rgba(15,23,42,0.4) 0%, rgba(15,23,42,0.96) 100%);
        color: #34d399;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 11px;
        font-weight: 600;
        text-align: center;
        cursor: pointer;
        z-index: 10;
        pointer-events: auto;
      }
      /* 低开销 GPU 节流模式 */
      body.ai-turbo-low-power,
      body.ai-turbo-low-power pre,
      body.ai-turbo-low-power code {
        text-shadow: none !important;
        box-shadow: none !important;
        animation-duration: 0.001ms !important;
        transition-duration: 0.001ms !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);

    if (state.gpuSaver) {
      if (document.body) {
        document.body.classList.add("ai-turbo-low-power");
      } else {
        document.addEventListener("DOMContentLoaded", () => {
          document.body.classList.add("ai-turbo-low-power");
        });
      }
    }
  }

  injectEngineStyles();

  // --- 4. 增量脱水与调度 ---
  let isScheduling = false;
  let lastScheduleTime = 0;
  const THROTTLE_INTERVAL_MS = 60;

  function scheduleVirtualUpdate() {
    const now = performance.now();
    if (isScheduling) return;

    if (now - lastScheduleTime < THROTTLE_INTERVAL_MS) {
      isScheduling = true;
      setTimeout(
        () => {
          requestAnimationFrame(() => {
            runBatchUpdate();
            isScheduling = false;
            lastScheduleTime = performance.now();
          });
        },
        THROTTLE_INTERVAL_MS - (now - lastScheduleTime),
      );
      return;
    }

    isScheduling = true;
    requestAnimationFrame(() => {
      runBatchUpdate();
      isScheduling = false;
      lastScheduleTime = performance.now();
    });
  }

  function runBatchUpdate() {
    executePruneAndIncrementalIndex();
    if (state.collapseCode) executeCodeCollapseCSS();
    updateHudDashboard();
    ensureHUDMounted();
  }

  function executePruneAndIncrementalIndex() {
    const turns = currentPlatform.getTurns();
    const len = turns.length;
    state.totalTurns = len;

    const cutoff = state.pruneEnabled ? Math.max(0, len - state.keepTurns) : 0;
    state.hiddenCount = cutoff;
    state.indexedTurns = [];

    for (let i = 0; i < len; i++) {
      const turn = turns[i];
      const text = (turn.textContent || "").replace(/\s+/g, " ").slice(0, 800);
      state.indexedTurns.push({ id: i, element: turn, text: text });

      if (i < cutoff) {
        if (!turn.classList.contains("ai-turbo-dehydrated")) {
          turn.classList.add("ai-turbo-dehydrated");
        }
      } else {
        if (turn.classList.contains("ai-turbo-dehydrated")) {
          turn.classList.remove("ai-turbo-dehydrated");
        }
      }
    }
  }

  function executeCodeCollapseCSS() {
    const blocks = document.querySelectorAll(currentPlatform.codeBlocks);
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (indexedSet.has(block)) continue;
      indexedSet.add(block);
      if (block.clientHeight > 300) {
        block.classList.add("ai-turbo-folded-code");
      }
    }
  }

  document.addEventListener(
    "click",
    (e) => {
      const target = e.target;
      if (!target) return;
      const block = target.closest(".ai-turbo-folded-code");
      if (block) {
        block.classList.remove("ai-turbo-folded-code");
        block.setAttribute("data-user-unfolded", "true");
      }
    },
    { capture: true, passive: true },
  );

  // --- 5. 对话提纯导出 ---
  function exportCleanContext(onSuccess) {
    const turns = currentPlatform.getTurns();
    if (!turns.length) return alert("未检测到有效对话内容");

    let markdown = `# 会话上下文提取 [${currentPlatform.name}] - ${new Date().toLocaleString()}\n\n`;
    turns.forEach((turn, idx) => {
      const content = (turn.textContent || "").trim();
      if (content) {
        markdown += `### Turn ${idx + 1}\n\n${content}\n\n---\n\n`;
      }
    });

    navigator.clipboard
      .writeText(markdown)
      .then(() => {
        if (typeof onSuccess === "function") onSuccess(turns.length);
      })
      .catch((err) => {
        console.error(err);
        alert("写入剪贴板失败，请检查浏览器权限。");
      });
  }

  // --- 6. HUD 面板系统 (AzSkills 精密磨砂玻璃 + 完整矢量图标) ---
  let hudRootElement = null;
  let hudStats = null;
  let searchInput = null;
  let searchResultsBox = null;
  let searchDebounceTimer = null;

  const POS_STORAGE_KEY = "ai_turbo_hud_position";
  function getSavedPosition() {
    try {
      const pos = JSON.parse(localStorage.getItem(POS_STORAGE_KEY));
      if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
        const maxX = Math.max(10, window.innerWidth - 60);
        const maxY = Math.max(10, window.innerHeight - 60);
        return {
          x: Math.min(Math.max(10, pos.x), maxX),
          y: Math.min(Math.max(10, pos.y), maxY),
        };
      }
    } catch (_) {}
    return { x: window.innerWidth - 68, y: window.innerHeight - 76 };
  }

  function savePosition(x, y) {
    try {
      localStorage.setItem(POS_STORAGE_KEY, JSON.stringify({ x, y }));
    } catch (_) {}
  }

  function buildHUD() {
    if (document.getElementById("ai-turbo-extreme-hud")) return;

    hudRootElement = document.createElement("div");
    hudRootElement.id = "ai-turbo-extreme-hud";
    const shadow = hudRootElement.attachShadow({ mode: "closed" });

    const styles = `
      :host {
        all: initial;
        position: fixed;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
        -webkit-font-smoothing: antialiased;
        user-select: none;
      }
      *, *::before, *::after {
        box-sizing: border-box;
      }

      /* 悬浮球体 (FAB) */
      .hud-ball {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: radial-gradient(135% 135% at 20% 20%, rgba(30, 41, 59, 0.95) 0%, rgba(9, 9, 11, 0.98) 100%);
        border: 1px solid rgba(255, 255, 255, 0.16);
        box-shadow: 0 8px 24px -2px rgba(0, 0, 0, 0.55),
                    0 0 0 1px rgba(0, 0, 0, 0.4),
                    inset 0 1px 1px rgba(255, 255, 255, 0.25);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: grab;
        transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease, border-color 0.2s ease;
        backdrop-filter: blur(12px);
        position: relative;
      }
      .hud-ball:hover {
        transform: scale(1.06);
        border-color: rgba(52, 211, 153, 0.5);
        box-shadow: 0 12px 28px -2px rgba(16, 185, 129, 0.3),
                    0 0 0 1px rgba(16, 185, 129, 0.4),
                    inset 0 1px 1px rgba(255, 255, 255, 0.35);
      }
      .hud-ball:active {
        cursor: grabbing;
        transform: scale(0.96);
      }
      .hud-ball.active-pulse::after {
        content: '';
        position: absolute;
        inset: -3px;
        border-radius: 50%;
        border: 2px solid rgba(16, 185, 129, 0.5);
        animation: pulse-ring 2.4s cubic-bezier(0.24, 0, 0.38, 1) infinite;
        pointer-events: none;
      }
      @keyframes pulse-ring {
        0% { transform: scale(0.9); opacity: 0.8; }
        60%, 100% { transform: scale(1.35); opacity: 0; }
      }

      .hud-ball svg {
        width: 22px;
        height: 22px;
        filter: drop-shadow(0 0 6px rgba(16, 185, 129, 0.7));
        transition: transform 0.25s ease;
      }
      .hud-ball:hover svg {
        transform: scale(1.12) rotate(-4deg);
      }

      /* 悬浮控制面板 */
      .hud-panel {
        display: none;
        position: absolute;
        bottom: 54px;
        right: 0;
        width: 300px;
        background: rgba(15, 17, 26, 0.88);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 16px;
        padding: 16px;
        box-shadow: 0 20px 40px -8px rgba(0, 0, 0, 0.75),
                    0 0 0 1px rgba(255, 255, 255, 0.05),
                    inset 0 1px 0 rgba(255, 255, 255, 0.15);
        backdrop-filter: blur(20px) saturate(180%);
        color: #f1f5f9;
        font-size: 12px;
        transform-origin: bottom right;
        opacity: 0;
        transform: scale(0.92) translateY(10px);
        transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1),
                    transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .hud-panel.open {
        display: block;
        opacity: 1;
        transform: scale(1) translateY(0);
      }
      .hud-panel.pos-left {
        right: auto;
        left: 0;
        transform-origin: bottom left;
      }
      .hud-panel.pos-top {
        bottom: auto;
        top: 54px;
        transform-origin: top right;
      }
      .hud-panel.pos-top.pos-left {
        transform-origin: top left;
      }

      /* 头部与标题 */
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }
      .brand-title {
        display: flex;
        align-items: center;
        gap: 7px;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: -0.01em;
        background: linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .brand-icon {
        width: 15px;
        height: 15px;
        fill: #10b981;
      }
      .header-actions {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .tag {
        font-size: 9.5px;
        font-family: ui-monospace, Menlo, monospace;
        font-weight: 600;
        background: rgba(16, 185, 129, 0.12);
        color: #34d399;
        padding: 2px 6px;
        border-radius: 9999px;
        border: 1px solid rgba(52, 211, 153, 0.28);
      }
      .close-btn {
        background: transparent;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        padding: 3px;
        border-radius: 5px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.15s, background 0.15s;
      }
      .close-btn:hover {
        color: #f8fafc;
        background: rgba(255, 255, 255, 0.08);
      }

      /* 状态与统计看板 */
      .metrics-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 12px;
      }
      .metric-card {
        background: rgba(255, 255, 255, 0.035);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 10px;
        padding: 8px 10px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .metric-header {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 10.5px;
        color: #94a3b8;
      }
      .metric-header svg {
        width: 13px;
        height: 13px;
        stroke: #94a3b8;
      }
      .metric-card .val {
        font-size: 16px;
        font-weight: 700;
        font-family: ui-monospace, monospace;
        color: #34d399;
        padding-left: 18px;
      }

      /* 控件行与矢量图标 */
      .control-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 7px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      }
      .control-label {
        font-size: 11.5px;
        color: #e2e8f0;
        display: flex;
        align-items: center;
        gap: 7px;
      }
      .control-icon {
        width: 14px;
        height: 14px;
        stroke: #34d399;
        opacity: 0.9;
      }

      /* 现代 Stepper 步进调节器 */
      .stepper {
        display: flex;
        align-items: center;
        background: rgba(0, 0, 0, 0.35);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        overflow: hidden;
      }
      .stepper-btn {
        background: transparent;
        border: none;
        color: #94a3b8;
        padding: 4px 7px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background 0.15s, color 0.15s;
      }
      .stepper-btn svg {
        width: 12px;
        height: 12px;
        stroke: currentColor;
        stroke-width: 2.2;
      }
      .stepper-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #34d399;
      }
      .stepper-btn:active {
        background: rgba(255, 255, 255, 0.18);
      }
      .stepper-val {
        min-width: 28px;
        text-align: center;
        font-family: ui-monospace, monospace;
        font-size: 11.5px;
        font-weight: 600;
        color: #f1f5f9;
      }

      /* 现代微拟物 Switch 开关 */
      .switch {
        position: relative;
        display: inline-block;
        width: 36px;
        height: 20px;
        cursor: pointer;
      }
      .switch input {
        opacity: 0;
        width: 0;
        height: 0;
      }
      .slider {
        position: absolute;
        inset: 0;
        background: rgba(255, 255, 255, 0.14);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 9999px;
        transition: background 0.25s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.25s ease;
      }
      .slider::before {
        position: absolute;
        content: "";
        height: 14px;
        width: 14px;
        left: 2px;
        bottom: 2px;
        background-color: #ffffff;
        border-radius: 50%;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
        transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .switch input:checked + .slider {
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        border-color: #34d399;
      }
      .switch input:checked + .slider::before {
        transform: translateX(16px);
      }

      /* 主要动作按钮 */
      .action-btn {
        width: 100%;
        margin-top: 10px;
        padding: 8px 12px;
        border-radius: 8px;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.03) 100%);
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: #f1f5f9;
        font-size: 11.5px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
      }
      .action-btn svg {
        width: 14px;
        height: 14px;
        stroke: currentColor;
      }
      .action-btn:hover {
        background: linear-gradient(180deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.15) 100%);
        border-color: rgba(52, 211, 153, 0.45);
        color: #34d399;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
      }
      .action-btn:active {
        transform: translateY(0);
      }
      .action-btn.copied {
        background: #065f46;
        border-color: #34d399;
        color: #6ee7b7;
      }

      /* 搜索历史模块 */
      .search-box {
        margin-top: 12px;
        padding-top: 8px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
      }
      .search-input-wrap {
        position: relative;
        display: flex;
        align-items: center;
      }
      .search-icon {
        position: absolute;
        left: 8px;
        width: 14px;
        height: 14px;
        fill: #64748b;
        pointer-events: none;
      }
      .search-input {
        width: 100%;
        background: rgba(0, 0, 0, 0.35);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #f8fafc;
        border-radius: 8px;
        padding: 6px 8px 6px 28px;
        font-size: 11px;
        outline: none;
        transition: border-color 0.2s, box-shadow 0.2s;
      }
      .search-input:focus {
        border-color: rgba(52, 211, 153, 0.6);
        box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
      }
      .search-input::placeholder {
        color: #64748b;
      }
      .results {
        max-height: 120px;
        overflow-y: auto;
        margin-top: 6px;
        padding-right: 2px;
      }
      .results::-webkit-scrollbar {
        width: 4px;
      }
      .results::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.15);
        border-radius: 4px;
      }
      .result-item {
        padding: 5px 8px;
        background: rgba(255, 255, 255, 0.025);
        border: 1px solid rgba(255, 255, 255, 0.04);
        border-radius: 6px;
        margin-bottom: 4px;
        cursor: pointer;
        font-size: 10.5px;
        color: #cbd5e1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        transition: background 0.15s, color 0.15s, transform 0.15s;
      }
      .result-item:hover {
        background: rgba(16, 185, 129, 0.12);
        border-color: rgba(52, 211, 153, 0.3);
        color: #34d399;
        transform: translateX(2px);
      }

      /* 底部热键提示 */
      .hotkey-hint {
        margin-top: 8px;
        font-size: 9.5px;
        color: #64748b;
        text-align: center;
        letter-spacing: 0.02em;
      }
      kbd {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 3px;
        padding: 1px 4px;
        font-family: ui-monospace, monospace;
        color: #94a3b8;
      }

      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: 0.01ms !important;
          transition-duration: 0.01ms !important;
        }
      }
    `;

    shadow.innerHTML = `
      <style>${styles}</style>

      <!-- 悬浮控制面板 -->
      <div class="hud-panel" id="panel">
        <div class="header">
          <div class="brand-title">
            <svg class="brand-icon" viewBox="0 0 24 24"><path d="M13 2L3 14h8l-1 8 11-12h-8l1-8z"/></svg>
            <span>AI Turbo Engine</span>
          </div>
          <div class="header-actions">
            <span class="tag">v0.2.1</span>
            <button class="close-btn" id="btn-close" title="关闭面板 (Esc)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>

        <div class="metrics-grid">
          <div class="metric-card">
            <div class="metric-header">
              <svg fill="none" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <span>检测总轮次</span>
            </div>
            <span class="val" id="total-val">0</span>
          </div>
          <div class="metric-card">
            <div class="metric-header">
              <svg fill="none" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
              <span>视口脱水挂起</span>
            </div>
            <span class="val" id="hidden-val">0</span>
          </div>
        </div>

        <div class="control-row">
          <span class="control-label">
            <svg class="control-icon" fill="none" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            活跃保留轮次
          </span>
          <div class="stepper">
            <button class="stepper-btn" id="step-dec" title="减少">
              <svg viewBox="0 0 24 24" fill="none" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
            <span class="stepper-val" id="keep-val">${state.keepTurns}</span>
            <button class="stepper-btn" id="step-inc" title="增加">
              <svg viewBox="0 0 24 24" fill="none" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
          </div>
        </div>

        <div class="control-row">
          <span class="control-label">
            <svg class="control-icon" fill="none" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            安全视口脱水
          </span>
          <label class="switch">
            <input type="checkbox" id="chk-prune" ${state.pruneEnabled ? "checked" : ""}>
            <span class="slider"></span>
          </label>
        </div>

        <div class="control-row">
          <span class="control-label">
            <svg class="control-icon" fill="none" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
            长代码自动折叠
          </span>
          <label class="switch">
            <input type="checkbox" id="chk-collapse" ${state.collapseCode ? "checked" : ""}>
            <span class="slider"></span>
          </label>
        </div>

        <button class="action-btn" id="btn-fork">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
          <span id="fork-text">提取无损上下文至剪贴板</span>
        </button>

        <div class="search-box">
          <div class="search-input-wrap">
            <svg class="search-icon" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 14z"/></svg>
            <input type="text" class="search-input" id="search-input" placeholder="瞬时检索对话历史...">
          </div>
          <div class="results" id="search-results"></div>
        </div>

        <div class="hotkey-hint">
          快捷键 <kbd>Alt</kbd> + <kbd>T</kbd> 切换展开 / 拖拽可吸附边缘
        </div>
      </div>

      <!-- 悬浮微光球 -->
      <div class="hud-ball active-pulse" id="ball" title="AI Turbo Engine (可拖拽 / 点击展开 / Alt+T)">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <defs>
            <linearGradient id="turbo-bolt-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#34d399"/>
              <stop offset="100%" stop-color="#10b981"/>
            </linearGradient>
          </defs>
          <path fill="url(#turbo-bolt-grad)" d="M13 2L3 14h8l-1 8 11-12h-8l1-8z"/>
        </svg>
      </div>
    `;

    (document.body || document.documentElement).appendChild(hudRootElement);

    const ball = shadow.getElementById("ball");
    const panel = shadow.getElementById("panel");
    const btnClose = shadow.getElementById("btn-close");
    const chkPrune = shadow.getElementById("chk-prune");
    const chkCollapse = shadow.getElementById("chk-collapse");
    const btnFork = shadow.getElementById("btn-fork");
    const forkText = shadow.getElementById("fork-text");
    const stepDec = shadow.getElementById("step-dec");
    const stepInc = shadow.getElementById("step-inc");
    const keepVal = shadow.getElementById("keep-val");
    searchInput = shadow.getElementById("search-input");
    searchResultsBox = shadow.getElementById("search-results");

    hudStats = {
      total: shadow.getElementById("total-val"),
      hidden: shadow.getElementById("hidden-val"),
    };

    let currentPos = getSavedPosition();
    function applyPosition(x, y) {
      hudRootElement.style.left = `${x}px`;
      hudRootElement.style.top = `${y}px`;

      panel.classList.toggle("pos-left", x < 320);
      panel.classList.toggle("pos-top", y < 340);
    }
    applyPosition(currentPos.x, currentPos.y);

    let isDragging = false;
    let dragStartX = 0,
      dragStartY = 0;
    let initialBallX = 0,
      initialBallY = 0;
    let hasMoved = false;

    ball.addEventListener("pointerdown", (e) => {
      isDragging = true;
      hasMoved = false;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      initialBallX = currentPos.x;
      initialBallY = currentPos.y;
      ball.setPointerCapture(e.pointerId);
    });

    ball.addEventListener("pointermove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      if (Math.hypot(dx, dy) > 4) {
        hasMoved = true;
      }
      if (hasMoved) {
        let newX = initialBallX + dx;
        let newY = initialBallY + dy;
        newX = Math.max(8, Math.min(newX, window.innerWidth - 52));
        newY = Math.max(8, Math.min(newY, window.innerHeight - 52));
        currentPos = { x: newX, y: newY };
        applyPosition(newX, newY);
      }
    });

    ball.addEventListener("pointerup", (e) => {
      if (!isDragging) return;
      isDragging = false;
      ball.releasePointerCapture(e.pointerId);
      if (hasMoved) {
        const snapX =
          currentPos.x < window.innerWidth / 2 ? 12 : window.innerWidth - 56;
        currentPos.x = snapX;
        applyPosition(currentPos.x, currentPos.y);
        savePosition(currentPos.x, currentPos.y);
      } else {
        togglePanel();
      }
    });

    function togglePanel(forceState) {
      state.hudOpen =
        typeof forceState === "boolean" ? forceState : !state.hudOpen;
      panel.classList.toggle("open", state.hudOpen);
      if (state.hudOpen) {
        setTimeout(() => searchInput?.focus(), 80);
      }
    }

    btnClose.onclick = () => togglePanel(false);

    chkPrune.onchange = () => {
      state.pruneEnabled = chkPrune.checked;
      ball.classList.toggle("active-pulse", state.pruneEnabled);
      scheduleVirtualUpdate();
    };

    chkCollapse.onchange = () => {
      state.collapseCode = chkCollapse.checked;
      document.querySelectorAll(".ai-turbo-folded-code").forEach((b) => {
        if (!state.collapseCode) b.classList.remove("ai-turbo-folded-code");
      });
      scheduleVirtualUpdate();
    };

    stepDec.onclick = () => {
      if (state.keepTurns > 2) {
        state.keepTurns--;
        keepVal.textContent = state.keepTurns;
        scheduleVirtualUpdate();
      }
    };

    stepInc.onclick = () => {
      if (state.keepTurns < 50) {
        state.keepTurns++;
        keepVal.textContent = state.keepTurns;
        scheduleVirtualUpdate();
      }
    };

    btnFork.onclick = () => {
      exportCleanContext((count) => {
        btnFork.classList.add("copied");
        forkText.textContent = `已复制 ${count} 轮纯净上下文!`;
        setTimeout(() => {
          btnFork.classList.remove("copied");
          forkText.textContent = "提取无损上下文至剪贴板";
        }, 2200);
      });
    };

    searchInput.oninput = () => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        const q = searchInput.value.trim().toLowerCase();
        searchResultsBox.innerHTML = "";
        if (!q) return;

        const matches = state.indexedTurns.filter((t) =>
          t.text.toLowerCase().includes(q),
        );
        matches.slice(0, 10).forEach((m) => {
          const item = document.createElement("div");
          item.className = "result-item";
          item.textContent = `#${m.id + 1}: ${m.text}`;
          item.onclick = () => {
            m.element.classList.remove("ai-turbo-dehydrated");
            m.element.scrollIntoView({ behavior: "smooth", block: "center" });
            m.element.style.outline = "2px solid #10b981";
            setTimeout(() => {
              m.element.style.outline = "";
            }, 2000);
          };
          searchResultsBox.appendChild(item);
        });
      }, 120);
    };

    window.addEventListener("keydown", (e) => {
      if (e.altKey && (e.code === "KeyT" || e.key.toLowerCase() === "t")) {
        e.preventDefault();
        togglePanel();
      } else if (e.key === "Escape" && state.hudOpen) {
        togglePanel(false);
      }
    });

    window.addEventListener("resize", () => {
      const maxX = window.innerWidth - 56;
      const maxY = window.innerHeight - 56;
      if (currentPos.x > maxX || currentPos.y > maxY) {
        currentPos.x = Math.min(currentPos.x, maxX);
        currentPos.y = Math.min(currentPos.y, maxY);
        applyPosition(currentPos.x, currentPos.y);
      }
    });
  }

  function ensureHUDMounted() {
    if (!hudRootElement || !hudRootElement.isConnected) {
      if (document.body) {
        buildHUD();
      }
    }
  }

  function updateHudDashboard() {
    if (!hudStats) return;
    hudStats.total.textContent = state.totalTurns;
    hudStats.hidden.textContent = state.hiddenCount;
  }

  // --- 7. 变更观察器 ---
  function initObserver() {
    const observer = new MutationObserver(() => {
      scheduleVirtualUpdate();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  // --- 8. 入口执行 ---
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", () => {
      buildHUD();
      scheduleVirtualUpdate();
      initObserver();
    });
  } else {
    buildHUD();
    scheduleVirtualUpdate();
    initObserver();
  }
})();
