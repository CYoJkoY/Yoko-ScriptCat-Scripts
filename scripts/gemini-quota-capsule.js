// ==UserScript==
// @name         Gemini Quota Capsule
// @namespace    https://cyojkoy.github.io/Payment/
// @version      0.2.0
// @description  专为 Google Gemini 定制的拟物化可拖拽用量监控胶囊：自动读取真实配额（无需手动计数），实时刷新倒计时、温控阶梯变色预警，支持横条、圆环、圆盘以及动态晶体崩坏（碎裂脱落/高危震颤）4 种形态自由切换。
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

  const STORAGE_KEY_CFG = "__gemini_quota_capsule_cfg_v2__";
  const STORAGE_KEY_SIG = "__gemini_usage_signature__";
  const STORAGE_KEY_URL = "__gemini_usage_url__";
  const STORAGE_KEY_TS = "__gemini_usage_ts__";

  const SIG_TTL_MS = 24 * 60 * 60 * 1000; // 缓存的 GraphQL URL 有效期
  const USAGE_PAGE = "https://gemini.google.com/usage";
  const POLL_INTERVAL_MS = 60 * 1000; // 每 60 秒自动拉取一次用量
  const IFRAME_WAIT_MS = 15000; // iframe 兜底解析等待时长

  const DEFAULT_CONFIG = {
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
      console.error("[Gemini Quota] 配置持久化失败", e);
    }
  }

  const usageState = {
    fiveHour: { pct: null, refreshAt: null },
    weekly: { pct: null, refreshAt: null },
    signature: null,
    templateUrl: null,
    lastUpdate: 0,
    fetchFailCount: 0,
  };

  function isUsageQueryUrl(url) {
    return (
      typeof url === "string" &&
      url.includes("executeQuery") &&
      url.includes("query_signature=")
    );
  }

  function captureSignature(url) {
    try {
      const m = url.match(/query_signature=([^&]+)/);
      if (!m) return;
      const sig = decodeURIComponent(m[1]);
      if (sig === usageState.signature && usageState.templateUrl) return;
      usageState.signature = sig;
      usageState.templateUrl = url;
      try {
        localStorage.setItem(STORAGE_KEY_SIG, sig);
        localStorage.setItem(STORAGE_KEY_URL, url);
        localStorage.setItem(STORAGE_KEY_TS, String(Date.now()));
      } catch {}
      fetchUsageViaGraphQL();
    } catch {}
  }

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    let url = "";
    try {
      url =
        typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
    } catch {}
    if (isUsageQueryUrl(url)) captureSignature(url);
    return originalFetch.apply(this, args);
  };

  const originalXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    try {
      if (isUsageQueryUrl(url)) captureSignature(url);
    } catch {}
    return originalXhrOpen.call(this, method, url, ...rest);
  };

  function parseUsageResponse(text) {
    if (!text || typeof text !== "string") return;

    const clean = text.replace(/^\)\]\}'?\s*/, "");
    let data;
    try {
      data = JSON.parse(clean);
    } catch {
      return;
    }
    extractUsage(data);
  }

  function extractUsage(data) {
    if (!data || typeof data !== "object") return;

    let pools =
      data?.data?.viewer?.rpcs?.getUsageInfo?.pools ||
      data?.viewer?.rpcs?.getUsageInfo?.pools;

    if (!Array.isArray(pools)) pools = findPoolsRecursive(data);

    if (!Array.isArray(pools) || pools.length === 0) return;

    let updated = false;
    for (const pool of pools) {
      if (!pool || typeof pool !== "object" || !pool.poolType) continue;

      const raw =
        typeof pool.percentageUsed === "number" ? pool.percentageUsed : null;
      const pct = raw === null ? null : Math.round(raw <= 1 ? raw * 100 : raw);

      const refreshAt =
        pool.gxu && pool.gxu.windowRefreshesAt
          ? Date.parse(pool.gxu.windowRefreshesAt)
          : null;

      if (pool.poolType === "GXU_FIVE_HOURLY") {
        usageState.fiveHour = { pct, refreshAt };
        updated = true;
      } else if (pool.poolType === "GXU_WEEKLY") {
        usageState.weekly = { pct, refreshAt };
        updated = true;
      }
    }

    if (updated) {
      usageState.lastUpdate = Date.now();
      usageState.fetchFailCount = 0;
      updateUI();
    }
  }

  function findPoolsRecursive(obj, depth = 0) {
    if (depth > 6 || !obj || typeof obj !== "object") return null;
    if (Array.isArray(obj)) {
      if (
        obj.length > 0 &&
        obj.every(
          (x) => x && typeof x === "object" && typeof x.poolType === "string",
        )
      ) {
        return obj;
      }
      for (const v of obj) {
        const r = findPoolsRecursive(v, depth + 1);
        if (r) return r;
      }
      return null;
    }
    if ("pools" in obj && Array.isArray(obj.pools)) return obj.pools;
    for (const k of Object.keys(obj)) {
      const r = findPoolsRecursive(obj[k], depth + 1);
      if (r) return r;
    }
    return null;
  }

  async function fetchUsageViaGraphQL() {
    if (!usageState.templateUrl) return;
    try {
      const res = await fetch(usageState.templateUrl, {
        credentials: "include",
        headers: { Accept: "*/*" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const before = JSON.stringify(usageState.fiveHour);
      parseUsageResponse(text);
      const after = JSON.stringify(usageState.fiveHour);
      if (before === after && usageState.fiveHour.pct === null) {
        usageState.fetchFailCount++;
      } else {
        usageState.fetchFailCount = 0;
      }
    } catch (e) {
      usageState.fetchFailCount++;
    }

    if (usageState.fetchFailCount >= 3) {
      usageState.fetchFailCount = 0;
      reloadUsageIframe();
    }
  }

  let usageIframe = null;
  let iframeHookInterval = null;
  let iframeHooked = false;

  function ensureUsageIframe() {
    if (usageIframe && usageIframe.isConnected) return;

    usageIframe = document.createElement("iframe");
    usageIframe.setAttribute("aria-hidden", "true");
    usageIframe.setAttribute("tabindex", "-1");
    usageIframe.style.cssText =
      "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;top:-9999px;border:0;";
    usageIframe.src = USAGE_PAGE;

    (document.body || document.documentElement).appendChild(usageIframe);

    iframeHooked = false;
    if (iframeHookInterval) clearInterval(iframeHookInterval);

    iframeHookInterval = setInterval(() => {
      if (iframeHooked) {
        clearInterval(iframeHookInterval);
        iframeHookInterval = null;
        return;
      }
      try {
        const win = usageIframe.contentWindow;
        if (!win) return;
        if (!win.location || win.location.href === "about:blank") return;
        hookIframeWindow(win);
        iframeHooked = true;
        clearInterval(iframeHookInterval);
        iframeHookInterval = null;
      } catch {}
    }, 100);

    setTimeout(() => {
      if (usageState.fiveHour.pct === null) {
        tryParseUsageDOM();
      }
    }, IFRAME_WAIT_MS);
  }

  function reloadUsageIframe() {
    if (!usageIframe) {
      ensureUsageIframe();
      return;
    }
    iframeHooked = false;
    try {
      usageIframe.src = USAGE_PAGE + "?_=" + Date.now();
    } catch {}
  }

  function hookIframeWindow(win) {
    // fetch hook
    try {
      const origFetch = win.fetch;
      if (origFetch && !origFetch.__gcHooked) {
        const wrapped = async function (...args) {
          let url = "";
          try {
            url =
              typeof args[0] === "string"
                ? args[0]
                : (args[0] && args[0].url) || "";
          } catch {}
          const isUsage = isUsageQueryUrl(url);
          if (isUsage) captureSignature(url);

          const res = await origFetch.apply(this, args);

          if (isUsage) {
            try {
              const clone = res.clone();
              const text = await clone.text();
              parseUsageResponse(text);
            } catch {}
          }
          return res;
        };
        wrapped.__gcHooked = true;
        win.fetch = wrapped;
      }
    } catch {}

    // XHR hook
    try {
      const XHR = win.XMLHttpRequest;
      if (XHR && !XHR.__gcHooked) {
        const origOpen = XHR.prototype.open;
        const origSend = XHR.prototype.send;
        XHR.prototype.open = function (method, url, ...rest) {
          this.__gcUrl = url;
          if (isUsageQueryUrl(url)) captureSignature(url);
          return origOpen.call(this, method, url, ...rest);
        };
        XHR.prototype.send = function (...args) {
          this.addEventListener("load", () => {
            try {
              if (isUsageQueryUrl(this.__gcUrl)) {
                parseUsageResponse(this.responseText);
              }
            } catch {}
          });
          return origSend.apply(this, args);
        };
        XHR.__gcHooked = true;
      }
    } catch {}
  }

  function tryParseUsageDOM() {
    if (!usageIframe) return;
    try {
      const doc = usageIframe.contentDocument;
      if (!doc || !doc.body) return;
      const text = doc.body.innerText || "";

      const fiveMatch =
        text.match(/(\d+)\s*%\s*(?:of\s+(?:your\s+)?)?5\s*-?\s*hour/i) ||
        text.match(/(?:5\s*-?\s*hour|five\s*hour)[^%]{0,80}?(\d+)\s*%/i);
      const weekMatch =
        text.match(/(\d+)\s*%\s*(?:of\s+(?:your\s+)?)?week(?:ly)?/i) ||
        text.match(/week(?:ly)?[^%]{0,80}?(\d+)\s*%/i);

      if (fiveMatch) usageState.fiveHour.pct = parseInt(fiveMatch[1], 10);
      if (weekMatch) usageState.weekly.pct = parseInt(weekMatch[1], 10);

      if (fiveMatch || weekMatch) updateUI();
    } catch (e) {
      console.warn("[Gemini Quota] DOM 兜底解析失败", e);
    }
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

  const STYLES = `
    #gc-pill-root {
      position: fixed;
      z-index: 999999;
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
      background: linear-gradient(135deg, rgba(24, 24, 27, 0.94) 0%, rgba(9, 9, 11, 0.98) 100%);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 9999px;
      padding: 6px 14px 6px 9px;
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.15), 0 8px 24px rgba(0,0,0,0.45);
      cursor: grab;
      transition: border-color 0.25s, box-shadow 0.25s;
    }
    .gc-pill-container:active { cursor: grabbing; }
    .gc-pill-container:hover { border-color: rgba(255, 255, 255, 0.28); }

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
      color: #64748b;
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
      background: rgba(255, 255, 255, 0.08);
    }
    .gc-btn-icon svg { width: 14px; height: 14px; }

    /* 模式 1：横条式 */
    .gc-track-bar {
      width: 100%;
      height: 3px;
      background: rgba(255, 255, 255, 0.12);
      border-radius: 999px;
      overflow: hidden;
      margin-top: 3px;
      position: relative;
    }
    .gc-fill-bar {
      height: 100%;
      border-radius: 999px;
      transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.35s ease;
    }

    /* 模式 2：圆环式 */
    .gc-ring-svg {
      transform: rotate(-90deg);
      width: 32px;
      height: 32px;
    }
    .gc-ring-bg {
      stroke: rgba(255, 255, 255, 0.12);
      stroke-width: 3.2;
      fill: none;
    }
    .gc-ring-val {
      stroke-width: 3.2;
      stroke-linecap: round;
      fill: none;
      transition: stroke-dashoffset 0.4s ease, stroke 0.4s ease;
    }

    /* 模式 3：圆盘式 */
    .gc-disk-box {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.08);
      position: relative;
      box-shadow: inset 0 0 4px rgba(0,0,0,0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .gc-disk-core {
      position: absolute;
      width: 10px;
      height: 10px;
      background: #09090b;
      border-radius: 50%;
      z-index: 2;
      border: 1px solid rgba(255,255,255,0.15);
    }

    /* 模式 4：崩坏式 */
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
      border-radius: 6px;
      overflow: visible;
      transition: transform 0.2s ease;
    }
    .gc-decay-shard {
      position: absolute;
      width: 100%;
      height: 100%;
      top: 0;
      left: 0;
      background-size: cover;
      transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease, filter 0.3s;
    }
    .gc-decay-fissures {
      position: absolute;
      inset: -2px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.35s ease;
      background: radial-gradient(circle, transparent 40%, var(--glow-color) 120%);
      mix-blend-mode: screen;
    }

    @keyframes gc-fracture-jitter {
      0% { transform: translate(0, 0) rotate(0deg); }
      25% { transform: translate(-1px, 1.2px) rotate(-1.5deg); }
      50% { transform: translate(1.4px, -1px) rotate(1.8deg); }
      75% { transform: translate(-1.2px, -0.8px) rotate(-0.8deg); }
      100% { transform: translate(0, 0) rotate(0deg); }
    }
    .gc-state-critical { animation: gc-fracture-jitter 0.18s infinite linear; }

    /* 设置抽屉 */
    #gc-pill-drawer {
      position: absolute;
      bottom: calc(100% + 10px);
      right: 0;
      width: 210px;
      background: rgba(15, 17, 23, 0.97);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 12px;
      box-shadow: 0 16px 36px rgba(0,0,0,0.65);
      padding: 12px;
      backdrop-filter: blur(20px);
      display: none;
      flex-direction: column;
      gap: 10px;
      z-index: 1000000;
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
      color: #64748b;
      border-top: 1px solid rgba(255,255,255,0.08);
      padding-top: 6px;
      line-height: 1.5;
    }
  `;

  let config = loadConfig();
  let rootEl = null;
  let pillContainerEl = null;
  let drawerEl = null;

  function injectStyles() {
    if (document.getElementById("gc-pill-style")) return;
    const style = document.createElement("style");
    style.id = "gc-pill-style";
    style.textContent = STYLES;
    (document.head || document.documentElement).appendChild(style);
  }

  function createDOM() {
    if (document.getElementById("gc-pill-root")) {
      rootEl = document.getElementById("gc-pill-root");
      pillContainerEl = document.getElementById("gc-pill-main");
      drawerEl = document.getElementById("gc-pill-drawer");
      updateUI();
      return;
    }

    injectStyles();

    rootEl = document.createElement("div");
    rootEl.id = "gc-pill-root";
    rootEl.style.right = `${config.pos.right}px`;
    rootEl.style.bottom = `${config.pos.bottom}px`;

    rootEl.innerHTML = `
      <div class="gc-pill-container" id="gc-pill-main">
        <div class="gc-capsule-head" id="gc-head-slot"></div>

        <div class="gc-pill-content">
          <div class="gc-pill-row-top">
            <span class="gc-pill-badge" id="gc-btn-toggle-window" title="点击切换 5小时 / 每周">5H</span>
            <span class="gc-pill-counter" id="gc-text-usage">--%</span>
          </div>
          <div class="gc-track-bar" id="gc-track-bar-slot" style="display:none;">
            <div class="gc-fill-bar" id="gc-fill-bar-core"></div>
          </div>
          <div class="gc-pill-timer" id="gc-timer-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span id="gc-text-timer">初始化</span>
          </div>
        </div>

        <div class="gc-pill-actions">
          <button class="gc-btn-icon" id="gc-btn-style-cycle" title="形态轮换（横条/圆环/圆盘/崩坏）">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
          </button>
          <button class="gc-btn-icon" id="gc-btn-settings" title="形态设置">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>
        </div>
      </div>

      <div id="gc-pill-drawer">
        <div class="gc-drawer-title">
          <span>胶囊形态</span>
          <span style="font-size:9px; color:#64748b;">用量自动同步</span>
        </div>

        <div class="gc-mode-grid">
          <button class="gc-choice-btn" data-style="bar">横条式</button>
          <button class="gc-choice-btn" data-style="ring">圆环式</button>
          <button class="gc-choice-btn" data-style="disk">圆盘式</button>
          <button class="gc-choice-btn" data-style="decay">崩坏式</button>
        </div>

        <div class="gc-drawer-status" id="gc-drawer-status">
          正在初始化同步…
        </div>
      </div>
    `;

    (document.body || document.documentElement).appendChild(rootEl);
    pillContainerEl = document.getElementById("gc-pill-main");
    drawerEl = document.getElementById("gc-pill-drawer");

    bindEvents();
    updateUI();
  }

  function bindEvents() {
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

    // 切换 5h / 7d
    document
      .getElementById("gc-btn-toggle-window")
      .addEventListener("click", (e) => {
        e.stopPropagation();
        config.activeWindow = config.activeWindow === "5h" ? "weekly" : "5h";
        saveConfig(config);
        updateUI();
      });

    // 形态轮换
    const modes = ["bar", "ring", "disk", "decay"];
    document
      .getElementById("gc-btn-style-cycle")
      .addEventListener("click", (e) => {
        e.stopPropagation();
        const nextIdx = (modes.indexOf(config.styleMode) + 1) % modes.length;
        config.styleMode = modes[nextIdx];
        saveConfig(config);
        updateUI();
      });

    // 抽屉开关
    document
      .getElementById("gc-btn-settings")
      .addEventListener("click", (e) => {
        e.stopPropagation();
        drawerEl.classList.toggle("gc-active");
      });

    drawerEl.querySelectorAll(".gc-choice-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        config.styleMode = btn.getAttribute("data-style");
        saveConfig(config);
        updateUI();
      });
    });

    document.addEventListener("pointerdown", (e) => {
      if (!rootEl.contains(e.target)) drawerEl.classList.remove("gc-active");
    });
  }

  function renderIndicatorHead(mode, ratio, color) {
    const headSlot = document.getElementById("gc-head-slot");
    const barSlot = document.getElementById("gc-track-bar-slot");
    const fillBar = document.getElementById("gc-fill-bar-core");

    if (mode === "bar") {
      barSlot.style.display = "block";
      fillBar.style.width = `${Math.min(100, Math.round(ratio * 100))}%`;
      fillBar.style.backgroundColor = color.hex;
      fillBar.style.boxShadow = `0 0 8px ${color.glow}`;

      headSlot.innerHTML = `
        <div style="width:16px; height:24px; border-radius:999px; background:linear-gradient(180deg, ${color.hex} 50%, rgba(255,255,255,0.15) 50%); border:1px solid rgba(255,255,255,0.2); box-shadow: 0 0 6px ${color.glow};"></div>
      `;
      return;
    } else {
      barSlot.style.display = "none";
    }

    if (mode === "ring") {
      const radius = 12;
      const circumference = 2 * Math.PI * radius;
      const strokeOffset = circumference - Math.min(1, ratio) * circumference;
      headSlot.innerHTML = `
        <svg class="gc-ring-svg" viewBox="0 0 32 32">
          <circle class="gc-ring-bg" cx="16" cy="16" r="${radius}"></circle>
          <circle class="gc-ring-val" cx="16" cy="16" r="${radius}"
                  style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${strokeOffset}; stroke: ${color.hex}; filter: drop-shadow(0 0 3px ${color.glow});"></circle>
        </svg>
      `;
      return;
    }

    if (mode === "disk") {
      const degrees = Math.min(360, Math.round(ratio * 360));
      headSlot.innerHTML = `
        <div class="gc-disk-box" style="background: conic-gradient(${color.hex} 0deg ${degrees}deg, rgba(255,255,255,0.12) ${degrees}deg 360deg); box-shadow: 0 0 8px ${color.glow};">
          <div class="gc-disk-core"></div>
        </div>
      `;
      return;
    }

    if (mode === "decay") {
      const r = Math.min(1.2, ratio);
      const isCritical = r >= 0.88;
      const drift = r * 8.5;
      const rot = r * 30;

      const shards = [
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

      const shardElements = shards
        .map((s, idx) => {
          const opacity = r > 0.95 && (idx === 0 || idx === 4) ? 0.2 : 1;
          const transform = `translate(${s.dx.toFixed(1)}px, ${s.dy.toFixed(
            1,
          )}px) rotate(${s.dr.toFixed(1)}deg)`;
          return `
          <div class="gc-decay-shard" style="
            clip-path: ${s.clip};
            -webkit-clip-path: ${s.clip};
            background: linear-gradient(135deg, ${color.hex} 0%, rgba(20,20,25,0.92) 100%);
            border: 1px solid rgba(255,255,255,0.25);
            transform: ${transform};
            opacity: ${opacity};
            filter: drop-shadow(0 0 ${Math.max(2, r * 6)}px ${color.glow});
          "></div>
        `;
        })
        .join("");

      headSlot.innerHTML = `
        <div class="gc-decay-capsule">
          <div class="gc-decay-body ${isCritical ? "gc-state-critical" : ""}">
            ${shardElements}
            <div class="gc-decay-fissures" style="opacity: ${Math.min(
              1,
              r * 1.3,
            )}; --glow-color: ${color.glow};"></div>
          </div>
        </div>
      `;
    }
  }

  function updateUI() {
    if (!rootEl) return;

    const is5h = config.activeWindow === "5h";
    const data = is5h ? usageState.fiveHour : usageState.weekly;
    const pct = data.pct;
    const refreshAt = data.refreshAt;
    const ratio = pct !== null ? pct / 100 : 0;
    const color = getProgressColor(ratio);

    // 徽章
    const badgeEl = document.getElementById("gc-btn-toggle-window");
    if (badgeEl) {
      badgeEl.textContent = is5h ? "5H" : "7D";
      badgeEl.style.color = pct !== null ? color.hex : "#94a3b8";
    }

    // 百分比
    const countEl = document.getElementById("gc-text-usage");
    if (countEl) {
      countEl.textContent = pct !== null ? `${pct}%` : "--%";
      countEl.style.color = pct !== null ? "#ffffff" : "#94a3b8";
    }

    // 倒计时
    const timerEl = document.getElementById("gc-text-timer");
    if (timerEl) {
      if (pct === 0) {
        timerEl.textContent = "已满血";
        timerEl.style.color = "#10b981";
      } else if (refreshAt) {
        const left = refreshAt - Date.now();
        if (left > 0) {
          timerEl.textContent = formatCountdown(left);
          timerEl.style.color = color.hex;
        } else {
          timerEl.textContent = "刷新中";
          timerEl.style.color = "#10b981";
        }
      } else {
        timerEl.textContent = usageState.signature ? "同步中" : "初始化";
        timerEl.style.color = "#64748b";
      }
    }

    renderIndicatorHead(config.styleMode, ratio, color);

    const statusEl = document.getElementById("gc-drawer-status");
    if (statusEl) {
      if (usageState.lastUpdate > 0) {
        const ago = Math.round((Date.now() - usageState.lastUpdate) / 1000);
        statusEl.textContent = `上次同步：${ago}s 前 · 每 60s 自动刷新`;
      } else if (usageState.signature) {
        statusEl.textContent = "正在同步 Gemini 用量…";
      } else {
        statusEl.textContent = "正在捕获接口 signature…";
      }
    }

    if (drawerEl) {
      drawerEl.querySelectorAll(".gc-choice-btn").forEach((btn) => {
        btn.classList.toggle(
          "active",
          btn.getAttribute("data-style") === config.styleMode,
        );
      });
    }
  }

  async function initUsage() {
    try {
      const sig = localStorage.getItem(STORAGE_KEY_SIG);
      const url = localStorage.getItem(STORAGE_KEY_URL);
      const ts = parseInt(localStorage.getItem(STORAGE_KEY_TS) || "0", 10);
      if (sig && url && Date.now() - ts < SIG_TTL_MS) {
        usageState.signature = sig;
        usageState.templateUrl = url;
        await fetchUsageViaGraphQL();
      }
    } catch {}

    ensureUsageIframe();

    setInterval(() => {
      if (usageState.templateUrl) fetchUsageViaGraphQL();
    }, POLL_INTERVAL_MS);
  }

  function bootstrap() {
    injectStyles();

    if (document.body) {
      createDOM();
    } else {
      document.addEventListener("DOMContentLoaded", createDOM, { once: true });
    }

    setInterval(updateUI, 1000);

    const startUsage = () => {
      initUsage();
    };
    if (document.body) {
      startUsage();
    } else {
      document.addEventListener("DOMContentLoaded", startUsage, { once: true });
    }
  }

  bootstrap();
})();
