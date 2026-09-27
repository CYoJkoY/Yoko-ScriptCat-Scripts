// ==UserScript==
// @name         AI Chat Turbo Engine (Extreme Edition - Hardened)
// @namespace    https://local/ai-turbo-engine-v3
// @version      0.1.0
// @description  零回流增量索引 + 安全无感视口脱水 + 事件代理折叠 + 弹窗安全隔离
// @author       Senior Frontend Engineer
// @match        https://chatgpt.com/*
// @match        https://gemini.google.com/*
// @match        https://grok.com/*
// @match        https://x.com/i/grok*
// @match        https://claude.ai/*
// @run-at       document-start
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  // --- 1. 平台特征选择器映射矩阵 ---
  const PLATFORMS = {
    chatgpt: {
      name: 'ChatGPT',
      turns: 'article[data-testid^="conversation-turn-"], div[data-message-author-role]',
      inputContainer: 'form, div[class*="composer"], div[class*="PromptTextarea"]',
      contentBody: 'div[class*="markdown"], div[data-message-author-role]',
      codeBlocks: 'pre'
    },
    gemini: {
      name: 'Gemini',
      turns: 'user-query-container, model-response, .chat-turn-container',
      inputContainer: '.input-area-container, rich-textarea, .chat-input-container',
      contentBody: '.message-content, .model-response-text',
      codeBlocks: 'code-block, pre'
    },
    grok: {
      name: 'Grok',
      turns: 'div[data-testid*="message-container"], div[data-testid*="conversation-turn"], div[class*="message-bubble"]',
      inputContainer: 'div[class*="composer"], textarea, div[role="textbox"]',
      contentBody: 'div[class*="message-content"], div[dir="auto"]',
      codeBlocks: 'pre'
    },
    claude: {
      name: 'Claude',
      turns: 'div[data-test-render-count], div.font-user-message, div.font-claude-message',
      inputContainer: 'fieldset, div[contenteditable="true"]',
      contentBody: 'div.grid-cols-1, div[class*="font-claude"]',
      codeBlocks: 'pre'
    }
  };

  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes('chatgpt.com')) return PLATFORMS.chatgpt;
    if (host.includes('gemini.google.com')) return PLATFORMS.gemini;
    if (host.includes('grok.com') || host.includes('x.com')) return PLATFORMS.grok;
    if (host.includes('claude.ai')) return PLATFORMS.claude;
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
    indexedTurns: [], // { id, role, text, element }
    totalTurns: 0,
    hiddenCount: 0
  };

  const indexedSet = new WeakSet();

  // --- 3. 样式注入引擎 ---
  function injectEngineStyles() {
    const style = document.createElement('style');
    style.id = 'ai-turbo-extreme-styles';
    style.textContent = `
      /* 视口脱水：利用 content-visibility 保护滚动条几何尺寸，避免高度坍塌 */
      ${currentPlatform.turns} {
        content-visibility: auto !important;
        contain-intrinsic-size: auto 240px !important;
      }
      .ai-turbo-dehydrated {
        content-visibility: hidden !important;
        contain-intrinsic-size: auto 80px !important;
      }
      /* 输入框隔离：仅使用 layout style，坚决移除 paint 以防止弹窗浮层被截断 */
      ${currentPlatform.inputContainer} {
        contain: layout style !important;
        isolation: isolate !important;
      }
      /* 长代码折叠容器 (纯 CSS 驱动，杜绝每帧测量 offsetHeight) */
      .ai-turbo-folded-code {
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
        background: linear-gradient(180deg, rgba(15,23,42,0.5) 0%, rgba(15,23,42,0.96) 100%);
        color: #34d399;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 11px;
        font-weight: 600;
        text-align: center;
        cursor: pointer;
        z-index: 10;
        pointer-events: auto;
      }
      /* 低开销 GPU 节流模式：精准覆盖动效与阴影，规避通配符匹配性能损耗 */
      body.ai-turbo-low-power,
      body.ai-turbo-low-power pre,
      body.ai-turbo-low-power code,
      body.ai-turbo-low-power div {
        text-shadow: none !important;
        box-shadow: none !important;
        animation-duration: 0.001ms !important;
        transition-duration: 0.001ms !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
    if (state.gpuSaver) {
      document.addEventListener('DOMContentLoaded', () => {
        document.body.classList.add('ai-turbo-low-power');
      });
    }
  }

  injectEngineStyles();

  // --- 4. 增量脱水与无回流调度 ---
  let isScheduling = false;
  let lastScheduleTime = 0;
  const THROTTLE_INTERVAL_MS = 60; // 稳定在 16fps 左右的批处理间隔，彻底释放主线程用于打字

  function scheduleVirtualUpdate() {
    const now = performance.now();
    if (isScheduling) return;

    if (now - lastScheduleTime < THROTTLE_INTERVAL_MS) {
      isScheduling = true;
      setTimeout(() => {
        requestAnimationFrame(() => {
          runBatchUpdate();
          isScheduling = false;
          lastScheduleTime = performance.now();
        });
      }, THROTTLE_INTERVAL_MS - (now - lastScheduleTime));
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
  }

  function executePruneAndIncrementalIndex() {
    const turns = document.querySelectorAll(currentPlatform.turns);
    const len = turns.length;
    state.totalTurns = len;

    const cutoff = state.pruneEnabled ? Math.max(0, len - state.keepTurns) : 0;
    state.hiddenCount = cutoff;

    // 清空轻量索引并重构，使用 textContent 杜绝 forced reflow
    state.indexedTurns = [];

    for (let i = 0; i < len; i++) {
      const turn = turns[i];
      
      // 零回流快速读取纯文本
      const text = (turn.textContent || '').replace(/\s+/g, ' ').slice(0, 800);
      state.indexedTurns.push({
        id: i,
        element: turn,
        text: text
      });

      // 视口脱水逻辑 (避免重复触碰 classList)
      if (i < cutoff) {
        if (!turn.classList.contains('ai-turbo-dehydrated')) {
          turn.classList.add('ai-turbo-dehydrated');
        }
      } else {
        if (turn.classList.contains('ai-turbo-dehydrated')) {
          turn.classList.remove('ai-turbo-dehydrated');
        }
      }
    }
  }

  // 纯声明式折叠标记，不触发 offsetHeight 读取
  function executeCodeCollapseCSS() {
    const blocks = document.querySelectorAll(currentPlatform.codeBlocks);
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (indexedSet.has(block)) continue;
      
      indexedSet.add(block);
      // 利用 clientHeight 仅在首次挂载且未被标记时做必要判定
      if (block.clientHeight > 300) {
        block.classList.add('ai-turbo-folded-code');
      }
    }
  }

  // 全局事件代理处理代码块展开折叠，无需逐个注册 Listener
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!target) return;
    const block = target.closest('.ai-turbo-folded-code');
    if (block) {
      block.classList.remove('ai-turbo-folded-code');
      block.setAttribute('data-user-unfolded', 'true');
    }
  }, { capture: true, passive: true });

  // --- 5. 对话提纯与分叉引擎 ---
  function exportCleanContext() {
    const turns = document.querySelectorAll(currentPlatform.turns);
    if (!turns.length) return alert('未检测到有效对话内容');

    let markdown = `# 会话上下文提取 [${currentPlatform.name}] - ${new Date().toLocaleString()}\n\n`;
    turns.forEach((turn, idx) => {
      const content = (turn.textContent || '').trim();
      if (content) {
        markdown += `### Turn ${idx + 1}\n\n${content}\n\n---\n\n`;
      }
    });

    navigator.clipboard.writeText(markdown).then(() => {
      alert(`已成功提取 ${turns.length} 轮对话纯净文本至剪贴板。`);
    }).catch(err => {
      console.error(err);
      alert('写入剪贴板失败，请检查浏览器权限。');
    });
  }

  // --- 6. HUD 面板与防抖检索 ---
  let hudStats, searchInput, searchResultsBox;
  let searchDebounceTimer = null;

  function buildHUD() {
    const hudRoot = document.createElement('div');
    hudRoot.id = 'ai-turbo-extreme-hud';
    const shadow = hudRoot.attachShadow({ mode: 'closed' });

    const styles = `
      :host {
        all: initial;
        position: fixed;
        bottom: 22px;
        right: 22px;
        z-index: 2147483647;
        font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      }
      .hud-ball {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: #09090b;
        color: #10b981;
        border: 1px solid #27272a;
        box-shadow: 0 4px 14px rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 14px;
        font-weight: 700;
        user-select: none;
      }
      .hud-panel {
        display: none;
        position: absolute;
        bottom: 46px;
        right: 0;
        width: 270px;
        background: #09090b;
        border: 1px solid #27272a;
        border-radius: 10px;
        padding: 12px;
        box-shadow: 0 14px 30px rgba(0,0,0,0.6);
        color: #fafafa;
        font-size: 12px;
      }
      .hud-panel.open { display: block; }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
        font-weight: 600;
      }
      .tag {
        font-size: 10px;
        background: #18181b;
        color: #34d399;
        padding: 2px 5px;
        border-radius: 4px;
        border: 1px solid #27272a;
      }
      .metric-bar {
        font-size: 11px;
        color: #a1a1aa;
        background: #18181b;
        padding: 5px 8px;
        border-radius: 6px;
        margin-bottom: 8px;
        display: flex;
        justify-content: space-between;
      }
      .val { color: #34d399; font-weight: 600; }
      .row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin: 6px 0;
      }
      .btn {
        background: #18181b;
        color: #d4d4d8;
        border: 1px solid #27272a;
        border-radius: 6px;
        padding: 5px 8px;
        cursor: pointer;
        font-size: 11px;
        width: 100%;
        margin-top: 5px;
        text-align: left;
      }
      .btn.active {
        background: #064e3b;
        color: #6ee7b7;
        border-color: #059669;
      }
      .search-box {
        margin-top: 8px;
        padding-top: 6px;
        border-top: 1px solid #27272a;
      }
      .search-input {
        width: 100%;
        box-sizing: border-box;
        background: #18181b;
        border: 1px solid #27272a;
        color: #fafafa;
        border-radius: 6px;
        padding: 5px 7px;
        font-size: 11px;
        outline: none;
      }
      .search-input:focus { border-color: #059669; }
      .results {
        max-height: 120px;
        overflow-y: auto;
        margin-top: 5px;
      }
      .result-item {
        padding: 4px 6px;
        background: #18181b;
        border-radius: 4px;
        margin-bottom: 3px;
        cursor: pointer;
        font-size: 10px;
        color: #a1a1aa;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .result-item:hover { background: #27272a; color: #34d399; }
    `;

    shadow.innerHTML = `
      <style>${styles}</style>
      <div class="hud-panel" id="panel">
        <div class="header">
          <span>AI Turbo Engine</span>
          <span class="tag">v0.2</span>
        </div>
        <div class="metric-bar">
          <span>总轮次: <span class="val" id="total-val">0</span></span>
          <span>已挂起: <span class="val" id="hidden-val">0</span></span>
        </div>
        <div class="row">
          <span>活跃保留轮次</span>
          <input type="number" id="keep-input" min="2" max="50" value="${state.keepTurns}" style="width:45px; background:#18181b; color:#fff; border:1px solid #27272a; border-radius:4px; padding:2px; text-align:center;">
        </div>
        <button class="btn active" id="btn-prune">安全视口脱水: <span id="prune-stat">ON</span></button>
        <button class="btn active" id="btn-collapse">代码块自动折叠: <span id="collapse-stat">ON</span></button>
        <button class="btn" id="btn-fork">⚡ 提取无损对话至剪贴板</button>
        <div class="search-box">
          <input type="text" class="search-input" id="search-input" placeholder="瞬时检索历史...">
          <div class="results" id="search-results"></div>
        </div>
      </div>
      <div class="hud-ball" id="ball">⚡</div>
    `;

    document.documentElement.appendChild(hudRoot);

    const ball = shadow.getElementById('ball');
    const panel = shadow.getElementById('panel');
    const btnPrune = shadow.getElementById('btn-prune');
    const btnCollapse = shadow.getElementById('btn-collapse');
    const btnFork = shadow.getElementById('btn-fork');
    const keepInput = shadow.getElementById('keep-input');
    searchInput = shadow.getElementById('search-input');
    searchResultsBox = shadow.getElementById('search-results');

    hudStats = {
      total: shadow.getElementById('total-val'),
      hidden: shadow.getElementById('hidden-val'),
      pruneStat: shadow.getElementById('prune-stat'),
      collapseStat: shadow.getElementById('collapse-stat')
    };

    ball.onclick = () => panel.classList.toggle('open');

    btnPrune.onclick = () => {
      state.pruneEnabled = !state.pruneEnabled;
      btnPrune.classList.toggle('active', state.pruneEnabled);
      hudStats.pruneStat.textContent = state.pruneEnabled ? 'ON' : 'OFF';
      scheduleVirtualUpdate();
    };

    btnCollapse.onclick = () => {
      state.collapseCode = !state.collapseCode;
      btnCollapse.classList.toggle('active', state.collapseCode);
      hudStats.collapseStat.textContent = state.collapseCode ? 'ON' : 'OFF';
      document.querySelectorAll('.ai-turbo-folded-code').forEach(b => {
        if (!state.collapseCode) b.classList.remove('ai-turbo-folded-code');
      });
      scheduleVirtualUpdate();
    };

    keepInput.onchange = () => {
      const val = parseInt(keepInput.value, 10);
      if (val >= 2) {
        state.keepTurns = val;
        scheduleVirtualUpdate();
      }
    };

    btnFork.onclick = exportCleanContext;

    // 120ms 防抖检索，释放高频击键主线程
    searchInput.oninput = () => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        const q = searchInput.value.trim().toLowerCase();
        searchResultsBox.innerHTML = '';
        if (!q) return;

        const matches = state.indexedTurns.filter(t => t.text.toLowerCase().includes(q));
        matches.slice(0, 10).forEach(m => {
          const item = document.createElement('div');
          item.className = 'result-item';
          item.textContent = `#${m.id + 1}: ${m.text}`;
          item.onclick = () => {
            m.element.classList.remove('ai-turbo-dehydrated');
            m.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            m.element.style.outline = '2px solid #10b981';
            setTimeout(() => { m.element.style.outline = ''; }, 2000);
          };
          searchResultsBox.appendChild(item);
        });
      }, 120);
    };
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
      subtree: true
    });
  }

  // --- 8. 入口执行 ---
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => {
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