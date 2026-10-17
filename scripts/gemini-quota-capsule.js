// ==UserScript==
// @name         Gemini Quota Capsule
// @namespace    https://cyojkoy.github.io/Payment/
// @version      0.3.0
// @description  专为 Google Gemini 定制的拟物化可拖拽用量监控胶囊：原生 DOM 构造免疫 CSP Trusted Types，实时刷新倒计时、温控阶梯变色预警，支持横条、圆环、圆盘以及动态晶体崩坏（碎裂脱落/高危震颤）4 种形态自由切换。
// @author       Yoko
// @match        https://gemini.google.com/*
// @match        https://bard.google.com/*
// @run-at       document-start
// @grant        none
// @noframes
// @icon         data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="64" height="64"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%2310b981"/><stop offset="100%" stop-color="%23065f46"/></linearGradient></defs><rect width="48" height="48" rx="12" fill="%2309090b"/><g transform="rotate(-45 24 24)"><rect x="14" y="8" width="20" height="32" rx="10" fill="none" stroke="%23334155" stroke-width="2.5"/><path d="M14 18 C14 12.5 18.5 8 24 8 C29.5 8 34 12.5 34 18 L34 24 L14 24 Z" fill="url(%23g)"/><rect x="14" y="24" width="20" height="16" rx="0 0 10 10" fill="%231e293b"/><line x1="14" y1="24" x2="34" y2="24" stroke="%23f8fafc" stroke-width="1.5" stroke-opacity="0.6"/></g></svg>
// @license      MIT
// ==/UserScript==

(function () {
  "use strict";

  // =========================================================================
  // 1. 本地配置与跨页面同步键名
  // =========================================================================
  const STORAGE_KEY_CFG = "__gemini_quota_capsule_cfg_v3__";
  const STORAGE_KEY_SHARED_DATA = "__gemini_quota_shared_metrics__";
  const STORAGE_KEY_LOCAL_LOGS = "__gemini_quota_local_timestamps__";

  const TIME_5H_MS = 5 * 60 * 60 * 1000;
  const TIME_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  const DEFAULT_CONFIG = {
    limit5h: 50,
    limitWeekly: 500,
    activeWindow: "5h", // '5h' | 'weekly'
    styleMode: "decay", // 'decay' | 'bar' | 'ring' | 'disk'
    pos: { right: 28, bottom: 85 },
  };

  function loadConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CFG);
      return raw
        ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
        : { ...DEFAULT_CONFIG };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  function saveConfig(cfg) {
    try {
      localStorage.setItem(STORAGE_KEY_CFG, JSON.stringify(cfg));
    } catch (e) {
      console.error("[Gemini Quota] 配置保存失败", e);
    }
  }

  const config = loadConfig();

  // =========================================================================
  // 2. DOM 辅助构建器（严格杜绝 innerHTML，全面免疫 Trusted Types）
  // =========================================================================
  function el(tag, attrs = {}, children = []) {
    const elem = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "style" && typeof v === "string") {
        elem.style.cssText = v;
      } else if (k === "className") {
        elem.className = v;
      } else if (k.startsWith("on") && typeof v === "function") {
        elem.addEventListener(k.slice(2).toLowerCase(), v);
      } else {
        elem.setAttribute(k, v);
      }
    }
    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
      if (child == null) continue;
      if (typeof child === "string" || typeof child === "number") {
        elem.appendChild(document.createTextNode(String(child)));
      } else if (child instanceof Node) {
        elem.appendChild(child);
      }
    }
    return elem;
  }

  function svgEl(tag, attrs = {}, children = []) {
    const elem = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, v] of Object.entries(attrs)) {
      elem.setAttribute(k, v);
    }
    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
      if (child == null) continue;
      if (child instanceof Node) elem.appendChild(child);
    }
    return elem;
  }

  // =========================================================================
  // 3. 数据状态核心与本地滑动窗口保底
  // =========================================================================
  const usageState = {
    isOfficial: false,
    fiveHour: { pct: null, refreshAt: null },
    weekly: { pct: null, refreshAt: null },
    lastSyncTime: 0,
  };

  function getLocalLogs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_LOCAL_LOGS);
      const list = raw ? JSON.parse(raw) : [];
      const now = Date.now();
      const filtered = list.filter(
        (ts) => typeof ts === "number" && now - ts < TIME_WEEK_MS,
      );
      if (filtered.length !== list.length) {
        localStorage.setItem(STORAGE_KEY_LOCAL_LOGS, JSON.stringify(filtered));
      }
      return filtered;
    } catch {
      return [];
    }
  }

  function recordUsage(count = 1) {
    const logs = getLocalLogs();
    const now = Date.now();
    for (let i = 0; i < count; i++) logs.push(now);
    localStorage.setItem(STORAGE_KEY_LOCAL_LOGS, JSON.stringify(logs));
    updateUI();
  }

  function loadSharedOfficialData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SHARED_DATA);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        if (parsed.fiveHour) usageState.fiveHour = parsed.fiveHour;
        if (parsed.weekly) usageState.weekly = parsed.weekly;
        usageState.lastSyncTime = parsed.timestamp || Date.now();
        usageState.isOfficial = true;
      }
    } catch {}
  }

  function calculateLocalStats() {
    const logs = getLocalLogs();
    const now = Date.now();

    const logs5h = logs.filter((ts) => now - ts < TIME_5H_MS);
    const count5h = logs5h.length;
    let refreshAt5h = null;
    if (count5h > 0) {
      refreshAt5h = Math.min(...logs5h) + TIME_5H_MS;
    }

    const countWeekly = logs.length;
    let refreshAtWeekly = null;
    if (countWeekly > 0) {
      refreshAtWeekly = Math.min(...logs) + TIME_WEEK_MS;
    }

    return {
      count5h,
      pct5h: Math.min(
        100,
        Math.round((count5h / Math.max(1, config.limit5h)) * 100),
      ),
      refreshAt5h,
      countWeekly,
      pctWeekly: Math.min(
        100,
        Math.round((countWeekly / Math.max(1, config.limitWeekly)) * 100),
      ),
      refreshAtWeekly,
    };
  }

  function formatCountdown(ms) {
    if (ms <= 0) return "已满血";
    const totalSec = Math.floor(ms / 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    const pad = (n) => String(n).padStart(2, "0");
    if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    return `${pad(minutes)}:${pad(seconds)}`;
  }

  function getProgressColor(ratio) {
    const clamped = Math.max(0, Math.min(1, ratio));
    if (clamped < 0.5) {
      return { hex: "#10b981", glow: "rgba(16, 185, 129, 0.45)" };
    } else if (clamped < 0.75) {
      return { hex: "#f59e0b", glow: "rgba(245, 158, 11, 0.45)" };
    } else if (clamped < 0.9) {
      return { hex: "#f97316", glow: "rgba(249, 115, 22, 0.55)" };
    } else {
      return { hex: "#f43f5e", glow: "rgba(244, 63, 94, 0.75)" };
    }
  }

  // =========================================================================
  // 4. 输入交互与会话请求侦听（自动递增计数）
  // =========================================================================
  let lastPromptTime = 0;
  function onPromptDetected() {
    const now = Date.now();
    if (now - lastPromptTime > 2500) {
      lastPromptTime = now;
      recordUsage(1);
    }
  }

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    try {
      const url =
        typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
      if (
        url.includes("BardChatUi/data/batchexecute") ||
        url.includes("StreamGenerateContent") ||
        url.includes("assistant.vertical.chat")
      ) {
        onPromptDetected();
      }
    } catch {}
    return origFetch.apply(this, args);
  };

  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        const target = e.target;
        if (
          target &&
          (target.getAttribute("contenteditable") === "true" ||
            target.tagName === "TEXTAREA" ||
            target.closest('.input-area, rich-textarea, [role="textbox"]'))
        ) {
          setTimeout(onPromptDetected, 300);
        }
      }
    },
    true,
  );

  // =========================================================================
  // 5. CSS 样式表注入
  // =========================================================================
  const STYLES = `
    #gc-pill-root {
      position: fixed;
      z-index: 9999999;
      user-select: none;
      touch-action: none;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
      font-size: 12px;
      color: #f8fafc;
      line-height: 1.4;
      filter: drop-shadow(0 10px 25px rgba(0, 0, 0, 0.5));
    }
    .gc-pill-container {
      display: flex;
      align-items: center;
      gap: 10px;
      background: linear-gradient(135deg, rgba(24, 24, 27, 0.95) 0%, rgba(9, 9, 11, 0.98) 100%);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 9999px;
      padding: 6px 14px 6px 9px;
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.15), 0 8px 24px rgba(0,0,0,0.5);
      cursor: grab;
      transition: border-color 0.25s, box-shadow 0.25s;
    }
    .gc-pill-container:active { cursor: grabbing; }
    .gc-pill-container:hover { border-color: rgba(255, 255, 255, 0.3); }

    .gc-capsule-head {
      width: 32px;
      height: 32px;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .gc-pill-content {
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-width: 95px;
    }
    .gc-pill-row-top {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 6px;
    }
    .gc-pill-badge {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.5px;
      padding: 1px 5px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.1);
      cursor: pointer;
      transition: background 0.2s;
    }
    .gc-pill-badge:hover { background: rgba(255, 255, 255, 0.2); }
    .gc-pill-counter {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
      font-weight: 700;
      color: #ffffff;
    }
    .gc-pill-timer {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 10.5px;
      color: #94a3b8;
      display: flex;
      align-items: center;
      gap: 3px;
      margin-top: 1px;
    }
    .gc-pill-timer svg { width: 10px; height: 10px; opacity: 0.75; }

    .gc-pill-actions {
      display: flex;
      align-items: center;
      gap: 3px;
      margin-left: 2px;
    }
    .gc-btn-icon {
      background: transparent;
      border: none;
      outline: none;
      color: #94a3b8;
      cursor: pointer;
      padding: 4px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.18s, background 0.18s;
    }
    .gc-btn-icon:hover {
      color: #f8fafc;
      background: rgba(255, 255, 255, 0.1);
    }
    .gc-btn-icon svg { width: 14px; height: 14px; }

    /* 横条式 */
    .gc-track-bar {
      width: 100%;
      height: 3px;
      background: rgba(255, 255, 255, 0.12);
      border-radius: 999px;
      overflow: hidden;
      margin-top: 3px;
    }
    .gc-fill-bar {
      height: 100%;
      border-radius: 999px;
      transition: width 0.35s ease, background-color 0.35s ease;
    }

    /* 圆盘式 */
    .gc-disk-box {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(255,255,255,0.15);
    }
    .gc-disk-core {
      position: absolute;
      width: 10px;
      height: 10px;
      background: #09090b;
      border-radius: 50%;
      border: 1px solid rgba(255,255,255,0.2);
    }

    /* 崩坏碎裂式 */
    .gc-decay-capsule {
      width: 28px;
      height: 28px;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .gc-decay-body {
      width: 26px;
      height: 26px;
      position: relative;
    }
    .gc-decay-shard {
      position: absolute;
      width: 100%;
      height: 100%;
      top: 0;
      left: 0;
      transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease;
    }
    .gc-decay-fissures {
      position: absolute;
      inset: -2px;
      pointer-events: none;
      transition: opacity 0.35s ease;
      background: radial-gradient(circle, transparent 40%, var(--glow-color) 120%);
      mix-blend-mode: screen;
    }
    @keyframes gc-jitter {
      0% { transform: translate(0, 0) rotate(0deg); }
      25% { transform: translate(-1px, 1px) rotate(-1.5deg); }
      50% { transform: translate(1.2px, -1px) rotate(1.5deg); }
      75% { transform: translate(-1px, -0.8px) rotate(-0.8deg); }
      100% { transform: translate(0, 0) rotate(0deg); }
    }
    .gc-state-critical { animation: gc-jitter 0.18s infinite linear; }

    /* 设置面板抽屉 */
    #gc-pill-drawer {
      position: absolute;
      bottom: calc(100% + 10px);
      right: 0;
      width: 220px;
      background: rgba(15, 17, 23, 0.98);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 12px;
      box-shadow: 0 16px 36px rgba(0,0,0,0.7);
      padding: 12px;
      backdrop-filter: blur(20px);
      display: none;
      flex-direction: column;
      gap: 10px;
      z-index: 10000000;
    }
    #gc-pill-drawer.gc-active { display: flex; }
    .gc-drawer-title {
      font-size: 11px;
      font-weight: 700;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      padding-bottom: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .gc-mode-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 6px;
    }
    .gc-choice-btn {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #cbd5e1;
      padding: 6px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 11px;
      text-align: center;
      transition: all 0.2s;
    }
    .gc-choice-btn:hover { background: rgba(255, 255, 255, 0.12); color: #fff; }
    .gc-choice-btn.active {
      background: #2563eb;
      border-color: #3b82f6;
      color: #fff;
      font-weight: 600;
    }
    .gc-drawer-status {
      font-size: 10px;
      color: #94a3b8;
      border-top: 1px solid rgba(255,255,255,0.08);
      padding-top: 6px;
      line-height: 1.5;
    }
    .gc-link-btn {
      color: #38bdf8;
      text-decoration: underline;
      cursor: pointer;
    }
  `;

  function injectStyles() {
    if (document.getElementById("gc-pill-style")) return;
    const style = document.createElement("style");
    style.id = "gc-pill-style";
    style.textContent = STYLES;
    (document.head || document.documentElement).appendChild(style);
  }

  // =========================================================================
  // 6. UI DOM 节点纯原生装配
  // =========================================================================
  let rootEl = null;
  let pillContainerEl = null;
  let drawerEl = null;
  let badgeEl = null;
  let usageTextEl = null;
  let timerTextEl = null;
  let headSlotEl = null;
  let trackBarSlotEl = null;
  let fillBarEl = null;
  let statusTextEl = null;
  const choiceBtns = [];

  function createDOM() {
    if (document.getElementById("gc-pill-root")) {
      rootEl = document.getElementById("gc-pill-root");
      return;
    }

    injectStyles();

    headSlotEl = el("div", {
      className: "gc-capsule-head",
      id: "gc-head-slot",
    });

    badgeEl = el(
      "span",
      {
        className: "gc-pill-badge",
        title: "点击切换 5小时 / 每周",
        onclick: (e) => {
          e.stopPropagation();
          config.activeWindow = config.activeWindow === "5h" ? "weekly" : "5h";
          saveConfig(config);
          updateUI();
        },
      },
      ["5H"],
    );

    usageTextEl = el("span", { className: "gc-pill-counter" }, ["0%"]);

    const rowTop = el("div", { className: "gc-pill-row-top" }, [
      badgeEl,
      usageTextEl,
    ]);

    fillBarEl = el("div", { className: "gc-fill-bar" });
    trackBarSlotEl = el(
      "div",
      { className: "gc-track-bar", style: "display:none;" },
      [fillBarEl],
    );

    const timerSvg = svgEl(
      "svg",
      {
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "2.2",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      },
      [
        svgEl("circle", { cx: "12", cy: "12", r: "10" }),
        svgEl("polyline", { points: "12 6 12 12 16 14" }),
      ],
    );

    timerTextEl = el("span", {}, ["已满血"]);
    const timerWrapper = el("div", { className: "gc-pill-timer" }, [
      timerSvg,
      timerTextEl,
    ]);

    const contentBox = el("div", { className: "gc-pill-content" }, [
      rowTop,
      trackBarSlotEl,
      timerWrapper,
    ]);

    const cycleSvg = svgEl(
      "svg",
      {
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "2",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      },
      [
        svgEl("path", {
          d: "M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2",
        }),
      ],
    );

    const btnCycle = el(
      "button",
      {
        className: "gc-btn-icon",
        title: "轮换形态（横条/圆环/圆盘/崩坏）",
        onclick: (e) => {
          e.stopPropagation();
          const modes = ["bar", "ring", "disk", "decay"];
          const nextIdx = (modes.indexOf(config.styleMode) + 1) % modes.length;
          config.styleMode = modes[nextIdx];
          saveConfig(config);
          updateUI();
        },
      },
      [cycleSvg],
    );

    const gearSvg = svgEl(
      "svg",
      {
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "2",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      },
      [
        svgEl("circle", { cx: "12", cy: "12", r: "3" }),
        svgEl("path", {
          d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z",
        }),
      ],
    );

    const btnSettings = el(
      "button",
      {
        className: "gc-btn-icon",
        title: "展开配置面板",
        onclick: (e) => {
          e.stopPropagation();
          drawerEl.classList.toggle("gc-active");
        },
      },
      [gearSvg],
    );

    const actionsBox = el("div", { className: "gc-pill-actions" }, [
      btnCycle,
      btnSettings,
    ]);

    pillContainerEl = el(
      "div",
      { className: "gc-pill-container", id: "gc-pill-main" },
      [headSlotEl, contentBox, actionsBox],
    );

    // 抽屉面板
    const drawerTitle = el("div", { className: "gc-drawer-title" }, [
      el("span", {}, ["胶囊监控设置"]),
      el("span", { style: "font-size:9px; color:#64748b;" }, ["可全屏拖拽"]),
    ]);

    choiceBtns.length = 0;
    const modeConfigs = [
      { key: "bar", text: "横条式" },
      { key: "ring", text: "圆环式" },
      { key: "disk", text: "圆盘式" },
      { key: "decay", text: "崩坏式" },
    ];
    for (const m of modeConfigs) {
      const btn = el(
        "button",
        {
          className: `gc-choice-btn ${config.styleMode === m.key ? "active" : ""}`,
          onclick: () => {
            config.styleMode = m.key;
            saveConfig(config);
            updateUI();
          },
        },
        [m.text],
      );
      btn.dataset.style = m.key;
      choiceBtns.push(btn);
    }
    const modeGrid = el("div", { className: "gc-mode-grid" }, choiceBtns);

    statusTextEl = el("div", { className: "gc-drawer-status" }, [
      el("span", {}, ["数据模式：本地滑动窗口实时推算"]),
      el("br"),
      el(
        "span",
        {
          className: "gc-link-btn",
          onclick: () =>
            window.open("https://gemini.google.com/usage", "_blank"),
        },
        ["点此在新标签打开官方 /usage 页面"],
      ),
    ]);

    drawerEl = el("div", { id: "gc-pill-drawer" }, [
      drawerTitle,
      modeGrid,
      statusTextEl,
    ]);

    rootEl = el(
      "div",
      {
        id: "gc-pill-root",
        style: `right:${config.pos.right}px; bottom:${config.pos.bottom}px;`,
      },
      [pillContainerEl, drawerEl],
    );

    (document.body || document.documentElement).appendChild(rootEl);

    bindDragEvents();
    updateUI();
  }

  // =========================================================================
  // 7. 拖拽交互绑定
  // =========================================================================
  function bindDragEvents() {
    let isDragging = false;
    let startX = 0,
      startY = 0;
    let initialRight = 0,
      initialBottom = 0;
    let hasMoved = false;

    pillContainerEl.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button") || e.target.closest(".gc-pill-badge"))
        return;
      isDragging = true;
      hasMoved = false;
      startX = e.clientX;
      startY = e.clientY;
      initialRight = config.pos.right;
      initialBottom = config.pos.bottom;
      pillContainerEl.setPointerCapture(e.pointerId);
    });

    pillContainerEl.addEventListener("pointermove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hasMoved = true;

      const newRight = Math.max(
        10,
        Math.min(window.innerWidth - 180, initialRight - dx),
      );
      const newBottom = Math.max(
        10,
        Math.min(window.innerHeight - 60, initialBottom - dy),
      );

      rootEl.style.right = `${newRight}px`;
      rootEl.style.bottom = `${newBottom}px`;
    });

    const endDrag = (e) => {
      if (!isDragging) return;
      isDragging = false;
      try {
        pillContainerEl.releasePointerCapture(e.pointerId);
      } catch {}
      if (hasMoved) {
        config.pos.right = parseInt(rootEl.style.right, 10);
        config.pos.bottom = parseInt(rootEl.style.bottom, 10);
        saveConfig(config);
      }
    };

    pillContainerEl.addEventListener("pointerup", endDrag);
    pillContainerEl.addEventListener("pointercancel", endDrag);

    document.addEventListener("pointerdown", (e) => {
      if (rootEl && !rootEl.contains(e.target)) {
        drawerEl.classList.remove("gc-active");
      }
    });
  }

  // =========================================================================
  // 8. 4 种进度形态渲染引擎（完全通过原生 DOM 构造）
  // =========================================================================
  function renderIndicatorHead(mode, ratio, color) {
    if (!headSlotEl) return;
    headSlotEl.textContent = "";

    if (mode === "bar") {
      trackBarSlotEl.style.display = "block";
      fillBarEl.style.width = `${Math.min(100, Math.round(ratio * 100))}%`;
      fillBarEl.style.backgroundColor = color.hex;
      fillBarEl.style.boxShadow = `0 0 8px ${color.glow}`;

      const miniPill = el("div", {
        style: `width:16px; height:24px; border-radius:999px; background:linear-gradient(180deg, ${color.hex} 50%, rgba(255,255,255,0.15) 50%); border:1px solid rgba(255,255,255,0.25); box-shadow: 0 0 6px ${color.glow};`,
      });
      headSlotEl.appendChild(miniPill);
      return;
    }

    trackBarSlotEl.style.display = "none";

    if (mode === "ring") {
      const radius = 12;
      const circumference = 2 * Math.PI * radius;
      const strokeOffset = circumference - Math.min(1, ratio) * circumference;

      const ringBg = svgEl("circle", {
        cx: "16",
        cy: "16",
        r: String(radius),
        stroke: "rgba(255, 255, 255, 0.12)",
        "stroke-width": "3.2",
        fill: "none",
      });

      const ringVal = svgEl("circle", {
        cx: "16",
        cy: "16",
        r: String(radius),
        "stroke-width": "3.2",
        "stroke-linecap": "round",
        fill: "none",
        stroke: color.hex,
        style: `stroke-dasharray: ${circumference}; stroke-dashoffset: ${strokeOffset}; filter: drop-shadow(0 0 3px ${color.glow}); transition: stroke-dashoffset 0.4s ease, stroke 0.4s ease;`,
      });

      const ringSvg = svgEl(
        "svg",
        {
          viewBox: "0 0 32 32",
          style: "transform: rotate(-90deg); width:32px; height:32px;",
        },
        [ringBg, ringVal],
      );

      headSlotEl.appendChild(ringSvg);
      return;
    }

    if (mode === "disk") {
      const degrees = Math.min(360, Math.round(ratio * 360));
      const diskBox = el(
        "div",
        {
          className: "gc-disk-box",
          style: `background: conic-gradient(${color.hex} 0deg ${degrees}deg, rgba(255,255,255,0.12) ${degrees}deg 360deg); box-shadow: 0 0 8px ${color.glow};`,
        },
        [el("div", { className: "gc-disk-core" })],
      );

      headSlotEl.appendChild(diskBox);
      return;
    }

    if (mode === "decay") {
      const r = Math.min(1.2, ratio);
      const isCritical = r >= 0.88;
      const drift = r * 8.5;
      const rot = r * 30;

      const shardsData = [
        {
          clip: "polygon(0% 0%, 55% 0%, 42% 45%, 0% 50%)",
          dx: -drift * 0.7,
          dy: -drift * 0.7,
          dr: -rot * 0.8,
        },
        {
          clip: "polygon(55% 0%, 100% 0%, 100% 48%, 42% 45%)",
          dx: drift * 0.6,
          dy: -drift * 0.6,
          dr: rot * 0.6,
        },
        {
          clip: "polygon(0% 50%, 42% 45%, 52% 70%, 0% 100%)",
          dx: -drift * 0.9,
          dy: drift * 0.4,
          dr: -rot * 0.9,
        },
        {
          clip: "polygon(42% 45%, 100% 48%, 80% 82%, 52% 70%)",
          dx: drift * 0.4,
          dy: drift * 0.2,
          dr: rot * 0.4,
        },
        {
          clip: "polygon(52% 70%, 80% 82%, 100% 100%, 40% 100%)",
          dx: drift * 0.8,
          dy: drift * 0.9,
          dr: rot * 1.1,
        },
        {
          clip: "polygon(0% 100%, 52% 70%, 40% 100%)",
          dx: -drift * 0.5,
          dy: drift * 0.8,
          dr: -rot * 0.5,
        },
      ];

      const shardNodes = shardsData.map((s, idx) => {
        const opacity = r > 0.95 && (idx === 0 || idx === 4) ? 0.2 : 1;
        const transform = `translate(${s.dx.toFixed(1)}px, ${s.dy.toFixed(1)}px) rotate(${s.dr.toFixed(1)}deg)`;
        return el("div", {
          className: "gc-decay-shard",
          style: `clip-path: ${s.clip}; -webkit-clip-path: ${s.clip}; background: linear-gradient(135deg, ${color.hex} 0%, rgba(20,20,25,0.92) 100%); border: 1px solid rgba(255,255,255,0.25); transform: ${transform}; opacity: ${opacity}; filter: drop-shadow(0 0 ${Math.max(2, r * 6)}px ${color.glow});`,
        });
      });

      const fissures = el("div", {
        className: "gc-decay-fissures",
        style: `opacity: ${Math.min(1, r * 1.3)}; --glow-color: ${color.glow};`,
      });

      const body = el(
        "div",
        {
          className: `gc-decay-body ${isCritical ? "gc-state-critical" : ""}`,
        },
        [...shardNodes, fissures],
      );

      const decayCapsule = el("div", { className: "gc-decay-capsule" }, [body]);
      headSlotEl.appendChild(decayCapsule);
    }
  }

  // =========================================================================
  // 9. 界面响应式更新
  // =========================================================================
  function updateUI() {
    if (!rootEl) return;

    loadSharedOfficialData();
    const localStats = calculateLocalStats();
    const is5h = config.activeWindow === "5h";

    let pct = 0;
    let refreshAt = null;

    if (usageState.isOfficial) {
      const off = is5h ? usageState.fiveHour : usageState.weekly;
      pct =
        off.pct != null
          ? off.pct
          : is5h
            ? localStats.pct5h
            : localStats.pctWeekly;
      refreshAt =
        off.refreshAt ||
        (is5h ? localStats.refreshAt5h : localStats.refreshAtWeekly);
    } else {
      pct = is5h ? localStats.pct5h : localStats.pctWeekly;
      refreshAt = is5h ? localStats.refreshAt5h : localStats.refreshAtWeekly;
    }

    const ratio = pct / 100;
    const color = getProgressColor(ratio);

    badgeEl.textContent = is5h ? "5H" : "7D";
    badgeEl.style.color = color.hex;

    usageTextEl.textContent = `${pct}%`;
    usageTextEl.style.color = "#ffffff";

    if (pct === 0) {
      timerTextEl.textContent = "已满血";
      timerTextEl.style.color = "#10b981";
    } else if (refreshAt) {
      const left = refreshAt - Date.now();
      if (left > 0) {
        timerTextEl.textContent = formatCountdown(left);
        timerTextEl.style.color = color.hex;
      } else {
        timerTextEl.textContent = "已就绪";
        timerTextEl.style.color = "#10b981";
      }
    } else {
      timerTextEl.textContent = "已就绪";
      timerTextEl.style.color = "#94a3b8";
    }

    renderIndicatorHead(config.styleMode, ratio, color);

    for (const btn of choiceBtns) {
      btn.classList.toggle("active", btn.dataset.style === config.styleMode);
    }
  }

  // =========================================================================
  // 10. 官方 /usage 页面探针采集器（打开官方页时自动抓取并共享至 localStorage）
  // =========================================================================
  function runUsagePageCollector() {
    if (!window.location.pathname.startsWith("/usage")) return;

    const scrape = () => {
      try {
        const text = document.body.innerText || "";
        const fiveMatch =
          text.match(/(\d+)\s*%\s*(?:of\s+(?:your\s+)?)?5\s*-?\s*hour/i) ||
          text.match(/(?:5\s*-?\s*hour|five\s*hour)[^%]{0,80}?(\d+)\s*%/i);
        const weekMatch =
          text.match(/(\d+)\s*%\s*(?:of\s+(?:your\s+)?)?week(?:ly)?/i) ||
          text.match(/week(?:ly)?[^%]{0,80}?(\d+)\s*%/i);

        if (fiveMatch || weekMatch) {
          const payload = {
            timestamp: Date.now(),
            fiveHour: {
              pct: fiveMatch ? parseInt(fiveMatch[1], 10) : null,
              refreshAt: Date.now() + 3.5 * 3600 * 1000,
            },
            weekly: {
              pct: weekMatch ? parseInt(weekMatch[1], 10) : null,
              refreshAt: Date.now() + 5 * 24 * 3600 * 1000,
            },
          };
          localStorage.setItem(
            STORAGE_KEY_SHARED_DATA,
            JSON.stringify(payload),
          );
        }
      } catch {}
    };

    setInterval(scrape, 3000);
    setTimeout(scrape, 1500);
  }

  // =========================================================================
  // 11. 自愈保活（防止 SPA 路由切换时胶囊从 DOM 中被剥离）与初始化入口
  // =========================================================================
  function ensureMounted() {
    if (!document.body) return;
    if (!rootEl) {
      createDOM();
      return;
    }
    if (!rootEl.isConnected) {
      document.body.appendChild(rootEl);
    }
  }

  function bootstrap() {
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY_SHARED_DATA) updateUI();
    });

    const init = () => {
      createDOM();
      runUsagePageCollector();
      // 启动自愈心跳与每秒刷新
      setInterval(() => {
        ensureMounted();
        updateUI();
      }, 1000);
    };

    if (document.body) {
      init();
    } else {
      document.addEventListener("DOMContentLoaded", init, { once: true });
    }
  }

  bootstrap();
})();
