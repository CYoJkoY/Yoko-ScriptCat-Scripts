// ==UserScript==
// @name         Gemini Quota Capsule
// @namespace    https://cyojkoy.github.io/Payment/
// @version      0.5.0
// @description  参照 Voyager usage-observer 架构：document-start 拦截 XHR/Fetch batchexecute (wrb.fr) 与 /usage 官方数据源，24px 超薄细长条同屏显示 5H 与 7D 真实用量及官方重置时间。
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
  // 1. 常量与持久化配置
  // =========================================================================
  const STORAGE_KEY_CFG = "__gemini_quota_capsule_cfg_v5__";
  const STORAGE_KEY_OFFICIAL_CACHE = "__gemini_quota_official_cache_v5__";

  const TIME_5H_MS = 5 * 60 * 60 * 1000;
  const TIME_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const AUTO_SYNC_INTERVAL_MS = 3 * 60 * 1000;

  const DEFAULT_CONFIG = {
    styleMode: "bar", // 'bar' | 'ring' | 'disk' | 'decay'
    pos: { right: 20, bottom: 78 },
  };

  function loadConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CFG);
      if (!raw) return { ...DEFAULT_CONFIG };
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        pos: {
          right:
            parsed && parsed.pos && typeof parsed.pos.right === "number"
              ? parsed.pos.right
              : DEFAULT_CONFIG.pos.right,
          bottom:
            parsed && parsed.pos && typeof parsed.pos.bottom === "number"
              ? parsed.pos.bottom
              : DEFAULT_CONFIG.pos.bottom,
        },
      };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  function saveConfig(cfg) {
    try {
      localStorage.setItem(STORAGE_KEY_CFG, JSON.stringify(cfg));
    } catch (err) {
      console.warn("[Gemini Quota] 保存配置失败:", err);
    }
  }

  const config = loadConfig();

  // =========================================================================
  // 2. 纯原生 DOM 构造器（零 innerHTML，完全兼容 CSP Trusted Types）
  // =========================================================================
  function el(tag, attrs = {}, children = []) {
    const elem = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null) continue;
      if (k === "style" && typeof v === "string") {
        elem.style.cssText = v;
      } else if (k === "className") {
        elem.className = String(v);
      } else if (k.startsWith("on") && typeof v === "function") {
        elem.addEventListener(k.slice(2).toLowerCase(), v);
      } else {
        elem.setAttribute(k, String(v));
      }
    }
    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
      if (child === null || child === undefined) continue;
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
      if (v !== undefined && v !== null) {
        elem.setAttribute(k, String(v));
      }
    }
    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
      if (child instanceof Node) {
        elem.appendChild(child);
      }
    }
    return elem;
  }

  // =========================================================================
  // 3. 官方配额状态机与数据解析器（Voyager usage-observer 核心逻辑）
  // =========================================================================
  const quotaState = {
    source: "init", // 'init' | 'rpc' | 'usage-page' | 'cache' | 'error'
    isSyncing: false,
    lastSyncTime: 0,
    lastError: "",
    fiveHour: {
      pct: null, // 0 ~ 100
      used: null,
      limit: null,
      resetAt: null, // 真实官方重置时间戳 (ms)
      rawResetText: "",
    },
    weekly: {
      pct: null, // 0 ~ 100
      used: null,
      limit: null,
      resetAt: null, // 真实官方重置时间戳 (ms)
      rawResetText: "",
    },
    // 保存捕获到的官方配额 batchexecute RPC 请求模板，支持点击刷新时毫秒级重放
    capturedQuotaRpc: null,
  };

  function getAccountPrefix() {
    const match = window.location.pathname.match(/^(\/u\/\d+)\b/);
    return match ? match[1] : "";
  }

  function getOfficialUsageUrl() {
    return `${window.location.origin}${getAccountPrefix()}/usage`;
  }

  /**
   * 从官方自然语言重置提示中还原真实重置时间戳（毫秒）
   * 绝不使用任何硬编码假偏移量
   */
  function parseOfficialResetTextToTimestamp(text, nowMs = Date.now()) {
    if (!text || typeof text !== "string") return null;
    const clean = text.replace(/\s+/g, " ").trim();

    // 1. 相对倒计时格式：例如 "Resets in 3 hr 12 min" / "3 小时 12 分钟后重置" / "4 days 6 hr" / "4 天 6 小时后重置"
    const hasRelativeKeyword =
      /(?:reset(?:s|ting)?\s+in|in\s+\d|后重置|後重置|重置于|剩余|後にリセット|あと)/i.test(
        clean,
      ) ||
      /(?:\d+\s*(?:d|day|days|天|日|h|hr|hrs|hour|hours|小时|小時|時間|m|min|mins|minute|minutes|分钟|分鐘|分)\b)/i.test(
        clean,
      );

    if (hasRelativeKeyword) {
      const dayMatch = clean.match(
        /(\d+(?:\.\d+)?)\s*(?:days?|d\b|天|日(?![期曜]))/i,
      );
      const hrMatch = clean.match(
        /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h\b|个?小时|個?小時|時間)/i,
      );
      const minMatch = clean.match(
        /(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m\b|分钟|分鐘|分(?!钟|鐘|析|辨))/i,
      );
      const secMatch = clean.match(
        /(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s\b|秒)/i,
      );

      if (dayMatch || hrMatch || minMatch || secMatch) {
        const d = dayMatch ? parseFloat(dayMatch[1]) : 0;
        const h = hrMatch ? parseFloat(hrMatch[1]) : 0;
        const m = minMatch ? parseFloat(minMatch[1]) : 0;
        const s = secMatch ? parseFloat(secMatch[1]) : 0;
        const deltaMs = ((d * 24 + h) * 3600 + m * 60 + s) * 1000;
        if (deltaMs > 0 && deltaMs <= 14 * 24 * 3600 * 1000) {
          return Math.round(nowMs + deltaMs);
        }
      }
    }

    // 2. 绝对时刻格式：例如 "Resets at 5:30 PM" / "将于明天 14:00 重置"
    const clockMatch = clean.match(
      /(?:(tomorrow|明天|明日|today|今天|今日)\s*)?(?:at\s*|于\s*|於\s*)?(上午|下午|早上|晚上|凌晨)?\s*(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i,
    );
    if (clockMatch) {
      const dayWord = (clockMatch[1] || "").toLowerCase();
      const cnHalf = clockMatch[2] || "";
      let hr = parseInt(clockMatch[3], 10);
      const mn = parseInt(clockMatch[4], 10);
      const enHalf = (clockMatch[5] || "").toUpperCase();

      if (hr >= 0 && hr <= 23 && mn >= 0 && mn <= 59) {
        if (
          (enHalf === "PM" || cnHalf === "下午" || cnHalf === "晚上") &&
          hr < 12
        ) {
          hr += 12;
        } else if ((enHalf === "AM" || cnHalf === "凌晨") && hr === 12) {
          hr = 0;
        }
        const target = new Date(nowMs);
        target.setHours(hr, mn, 0, 0);
        if (
          dayWord === "tomorrow" ||
          dayWord === "明天" ||
          dayWord === "明日"
        ) {
          target.setDate(target.getDate() + 1);
        } else if (target.getTime() <= nowMs) {
          target.setDate(target.getDate() + 1);
        }
        return target.getTime();
      }
    }

    return null;
  }

  /**
   * 递归扫描 Google batchexecute (wrb.fr) 或 AF_initDataCallback 的嵌套数组结构，
   * 识别包含 5小时 (18000s) / 7天 (604800s) 窗口、百分比或重置时间戳的官方配额元组
   */
  function extractQuotaFromWizStructure(rootData, nowMs = Date.now()) {
    if (!rootData || typeof rootData !== "object") return null;

    let found5h = null;
    let found7d = null;

    const minValidResetSec = Math.floor(nowMs / 1000) - 60;
    const maxValidResetSec = Math.floor(nowMs / 1000) + 10 * 86400;

    function normalizeTimestampToMs(val) {
      if (typeof val === "number" && Number.isFinite(val)) {
        // 秒级时间戳 (例如 1776xxxxxx)
        if (val >= minValidResetSec && val <= maxValidResetSec) {
          return Math.round(val * 1000);
        }
        // 毫秒级时间戳
        if (val >= minValidResetSec * 1000 && val <= maxValidResetSec * 1000) {
          return Math.round(val);
        }
      }
      if (typeof val === "string" && /^\d{10,13}$/.test(val)) {
        return normalizeTimestampToMs(Number(val));
      }
      // Google Protobuf Timestamp tuple: [seconds, nanos]
      if (
        Array.isArray(val) &&
        val.length >= 1 &&
        typeof val[0] === "number" &&
        val[0] >= minValidResetSec &&
        val[0] <= maxValidResetSec &&
        (val.length === 1 || typeof val[1] === "number")
      ) {
        return Math.round(val[0] * 1000);
      }
      return null;
    }

    function walk(node, depth = 0) {
      if (depth > 14 || !node) return;

      if (typeof node === "string") {
        // 若字符串本身是嵌套 JSON 数组，尝试解包
        const trimmed = node.trim();
        if (
          (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
          (trimmed.startsWith("{") && trimmed.endsWith("}"))
        ) {
          try {
            walk(JSON.parse(trimmed), depth + 1);
          } catch {
            // 忽略非合法 JSON
          }
        }
        return;
      }

      if (Array.isArray(node)) {
        // 检查当前数组是否直接表达了一个配额窗口元组
        const flatStrings = node.filter((x) => typeof x === "string").join(" ");
        const has5hLabel =
          /(?:5\s*-?\s*(?:hour|hr|h|小时|小時|時間)|five\s*-?\s*hour|18000)/i.test(
            flatStrings,
          ) || node.includes(18000);
        const has7dLabel =
          /(?:7\s*-?\s*(?:day|d|天|日)|week(?:ly)?|每周|每週|週間|604800)/i.test(
            flatStrings,
          ) || node.includes(604800);

        if (has5hLabel || has7dLabel) {
          let pct = null;
          let resetAt = null;

          for (const item of node) {
            const ts = normalizeTimestampToMs(item);
            if (ts && !resetAt) {
              resetAt = ts;
            } else if (
              typeof item === "number" &&
              item >= 0 &&
              item <= 100 &&
              pct === null &&
              item !== 5 &&
              item !== 7
            ) {
              pct = Math.round(item);
            } else if (typeof item === "string") {
              const mPct = item.match(/(\d{1,3})\s*%/);
              if (mPct && pct === null) {
                pct = Math.min(100, parseInt(mPct[1], 10));
              }
              const parsedTs = parseOfficialResetTextToTimestamp(item, nowMs);
              if (parsedTs && !resetAt) {
                resetAt = parsedTs;
              }
            }
          }

          if (pct !== null) {
            if (has5hLabel && !has7dLabel && !found5h) {
              found5h = { pct, resetAt, rawResetText: "" };
            } else if (has7dLabel && !has5hLabel && !found7d) {
              found7d = { pct, resetAt, rawResetText: "" };
            }
          }
        }

        for (const child of node) {
          walk(child, depth + 1);
        }
        return;
      }

      if (typeof node === "object") {
        for (const val of Object.values(node)) {
          walk(val, depth + 1);
        }
      }
    }

    walk(rootData, 0);
    if (!found5h && !found7d) return null;

    return {
      timestamp: nowMs,
      fiveHour: found5h,
      weekly: found7d,
    };
  }

  /**
   * 解析 Google batchexecute 的 `)]}'` 多帧响应体，提取所有 `wrb.fr` 载荷
   */
  function parseBatchExecuteResponse(rawText) {
    if (!rawText || typeof rawText !== "string") return [];
    const results = [];
    const stripped = rawText.replace(/^\)\]\}'\s*/, "");
    const lines = stripped.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("[")) continue;
      try {
        const parsed = JSON.parse(trimmed);
        if (!Array.isArray(parsed)) continue;
        for (const entry of parsed) {
          if (
            Array.isArray(entry) &&
            entry[0] === "wrb.fr" &&
            typeof entry[1] === "string" &&
            typeof entry[2] === "string"
          ) {
            const rpcId = entry[1];
            try {
              const payload = JSON.parse(entry[2]);
              results.push({ rpcId, payload });
            } catch {
              // 忽略非 JSON 载荷
            }
          }
        }
      } catch {
        // 忽略长度行或分片残余
      }
    }
    return results;
  }

  /**
   * 从单个文本片段（如 /usage 的卡片文本）提取百分比和真实重置时间
   */
  function extractMetricFromCardText(cardText, windowType, nowMs) {
    if (!cardText) return null;
    const pctMatch = cardText.match(/(\d{1,3})\s*%/);
    if (!pctMatch) return null;

    const pct = Math.min(100, Math.max(0, parseInt(pctMatch[1], 10)));
    const stripWindowPattern =
      windowType === "5h"
        ? /(?:5\s*-?\s*(?:hour|hr|h|小时|小時|時間)|five\s*-?\s*hour)/gi
        : /(?:7\s*-?\s*(?:day|d|天|日)|week(?:ly)?|每周|每週|週間)/gi;

    const lines = cardText
      .split(/[\r\n]+/)
      .map((l) => l.trim())
      .filter(Boolean);

    let resetAt = null;
    let rawResetText = "";

    for (const line of lines) {
      if (/(?:reset|重置|刷新|恢复|剩余|後|あと|available|可用)/i.test(line)) {
        const cleanedLine = line.replace(stripWindowPattern, "");
        const ts = parseOfficialResetTextToTimestamp(cleanedLine, nowMs);
        if (ts) {
          resetAt = ts;
          rawResetText = line;
          break;
        }
      }
    }

    if (!resetAt) {
      const cleanedAll = cardText.replace(stripWindowPattern, "");
      resetAt = parseOfficialResetTextToTimestamp(cleanedAll, nowMs);
    }

    return { pct, resetAt, rawResetText };
  }

  /**
   * 从官方 /usage 页面 DOM 或 HTML 中提取 5H 与 7D 数据
   */
  function parseUsageDocument(doc, rawHtml = "") {
    const nowMs = Date.now();
    let fiveHour = null;
    let weekly = null;

    // 1. 先检查 HTML 内的 AF_initDataCallback / WIZ_global_data 脚本块
    if (rawHtml) {
      const initCallbackRegex =
        /AF_initDataCallback\s*\(\s*\{[^]*?data\s*:\s*(\[[^]*?\])\s*(?:,\s*sideChannel|\}\s*\))/g;
      let match;
      while ((match = initCallbackRegex.exec(rawHtml)) !== null) {
        try {
          const dataArr = JSON.parse(match[1]);
          const wizExtracted = extractQuotaFromWizStructure(dataArr, nowMs);
          if (wizExtracted) {
            if (wizExtracted.fiveHour && !fiveHour) {
              fiveHour = wizExtracted.fiveHour;
            }
            if (wizExtracted.weekly && !weekly) {
              weekly = wizExtracted.weekly;
            }
          }
        } catch {
          // 继续尝试 DOM 提取
        }
      }
    }

    if (doc && doc.body) {
      const fiveRegex =
        /(?:5\s*-?\s*(?:hour|hr|h|小时|小時|時間)|five\s*-?\s*hour)/i;
      const weekRegex =
        /(?:7\s*-?\s*(?:day|d|天|日)|week(?:ly)?|每周|每週|週間)/i;

      // 2. 遍历独立卡片容器精准提取
      const blocks = Array.from(
        doc.querySelectorAll(
          "section, article, [role='region'], [class*='card'], [class*='quota'], [class*='usage'], [class*='limit'], div",
        ),
      );

      for (const node of blocks) {
        const txt = (node.innerText || node.textContent || "").trim();
        if (txt.length < 5 || txt.length > 420) continue;

        const is5h = fiveRegex.test(txt);
        const is7d = weekRegex.test(txt);

        if (is5h && !is7d && !fiveHour) {
          const m = extractMetricFromCardText(txt, "5h", nowMs);
          if (m) fiveHour = m;
        } else if (is7d && !is5h && !weekly) {
          const m = extractMetricFromCardText(txt, "7d", nowMs);
          if (m) weekly = m;
        }
      }

      // 3. 若未匹配到独立容器，对全文按关键字切片提取
      const fullText = doc.body.innerText || doc.body.textContent || "";
      if (!fiveHour) {
        const idx5 = fullText.search(fiveRegex);
        if (idx5 !== -1) {
          fiveHour = extractMetricFromCardText(
            fullText.slice(Math.max(0, idx5 - 30), idx5 + 240),
            "5h",
            nowMs,
          );
        }
      }
      if (!weekly) {
        const idx7 = fullText.search(weekRegex);
        if (idx7 !== -1) {
          weekly = extractMetricFromCardText(
            fullText.slice(Math.max(0, idx7 - 30), idx7 + 240),
            "7d",
            nowMs,
          );
        }
      }
    }

    if (!fiveHour && !weekly) return null;
    return {
      timestamp: nowMs,
      fiveHour,
      weekly,
    };
  }

  /**
   * 将提取到的官方配额写入状态并持久化到跨标签页缓存
   */
  function commitOfficialQuota(extracted, sourceTag, saveStorage = true) {
    if (!extracted) return false;
    const has5h =
      extracted.fiveHour && typeof extracted.fiveHour.pct === "number";
    const has7d = extracted.weekly && typeof extracted.weekly.pct === "number";
    if (!has5h && !has7d) return false;

    if (has5h) {
      quotaState.fiveHour = {
        pct: extracted.fiveHour.pct,
        used: extracted.fiveHour.used ?? null,
        limit: extracted.fiveHour.limit ?? null,
        resetAt: extracted.fiveHour.resetAt || null,
        rawResetText: extracted.fiveHour.rawResetText || "",
      };
    }
    if (has7d) {
      quotaState.weekly = {
        pct: extracted.weekly.pct,
        used: extracted.weekly.used ?? null,
        limit: extracted.weekly.limit ?? null,
        resetAt: extracted.weekly.resetAt || null,
        rawResetText: extracted.weekly.rawResetText || "",
      };
    }

    quotaState.source = sourceTag;
    quotaState.lastSyncTime = extracted.timestamp || Date.now();
    quotaState.lastError = "";

    if (saveStorage) {
      try {
        localStorage.setItem(
          STORAGE_KEY_OFFICIAL_CACHE,
          JSON.stringify({
            timestamp: quotaState.lastSyncTime,
            source: sourceTag,
            fiveHour: quotaState.fiveHour,
            weekly: quotaState.weekly,
          }),
        );
      } catch {
        // 忽略存储异常
      }
    }

    updateUI();
    return true;
  }

  function restoreCachedOfficialQuota() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_OFFICIAL_CACHE);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;

      const now = Date.now();
      if (
        parsed.fiveHour &&
        parsed.fiveHour.resetAt &&
        parsed.fiveHour.resetAt <= now
      ) {
        parsed.fiveHour.pct = 0;
        parsed.fiveHour.resetAt = null;
      }
      if (
        parsed.weekly &&
        parsed.weekly.resetAt &&
        parsed.weekly.resetAt <= now
      ) {
        parsed.weekly.pct = 0;
        parsed.weekly.resetAt = null;
      }

      commitOfficialQuota(parsed, "cache", false);
    } catch {
      // 忽略缓存解析错误
    }
  }

  // =========================================================================
  // 4. Voyager 风格的网络观察器（document-start 拦截 XHR + Fetch + 响应完成）
  // =========================================================================
  const origFetch = window.fetch;
  const origXhrOpen = XMLHttpRequest.prototype.open;
  const origXhrSend = XMLHttpRequest.prototype.send;

  let responseCompleteTimer = null;
  function scheduleSyncAfterResponse() {
    if (responseCompleteTimer) clearTimeout(responseCompleteTimer);
    responseCompleteTimer = setTimeout(() => {
      syncOfficialUsage(false);
    }, 1800);
  }

  function inspectNetworkTraffic(url, reqBody, responseText) {
    if (!url || typeof url !== "string") return;

    // 1. 侦听对话流生成完毕（对应 Voyager 的 response-complete-observer.js）
    if (
      url.includes("StreamGenerateContent") ||
      url.includes("assistant.vertical.chat")
    ) {
      scheduleSyncAfterResponse();
      return;
    }

    // 2. 侦听 batchexecute RPC 响应（对应 Voyager 的 usage-observer.js）
    if (url.includes("/batchexecute") && responseText) {
      const frames = parseBatchExecuteResponse(responseText);
      for (const frame of frames) {
        const extracted = extractQuotaFromWizStructure(
          frame.payload,
          Date.now(),
        );
        if (extracted) {
          // 捕获该官方配额 RPC 的请求参数，以便后续点刷新时直接重放该 RPC
          if (reqBody && typeof reqBody === "string") {
            quotaState.capturedQuotaRpc = {
              url,
              body: reqBody,
              rpcId: frame.rpcId,
            };
          }
          commitOfficialQuota(extracted, "rpc", true);
        }
      }
    }
  }

  // 拦截 window.fetch
  window.fetch = async function (...args) {
    const url =
      typeof args[0] === "string"
        ? args[0]
        : (args[0] && typeof args[0].url === "string" && args[0].url) || "";
    const reqInit = args[1] || {};
    const reqBody = typeof reqInit.body === "string" ? reqInit.body : "";

    const response = await origFetch.apply(this, args);

    try {
      if (
        url.includes("/batchexecute") ||
        url.includes("StreamGenerateContent")
      ) {
        const cloned = response.clone();
        cloned
          .text()
          .then((text) => inspectNetworkTraffic(url, reqBody, text))
          .catch(() => {});
      }
    } catch {
      // 忽略克隆异常
    }

    return response;
  };

  // 拦截 XMLHttpRequest（Google Closure / Wiz 的 batchexecute 默认走 XHR）
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__gc_url = typeof url === "string" ? url : String(url || "");
    return origXhrOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const url = this.__gc_url || "";
    if (
      url.includes("/batchexecute") ||
      url.includes("StreamGenerateContent")
    ) {
      const reqBody = typeof body === "string" ? body : "";
      this.addEventListener("load", function () {
        try {
          if (
            typeof this.responseText === "string" &&
            this.responseText.length > 0
          ) {
            inspectNetworkTraffic(url, reqBody, this.responseText);
          }
        } catch {
          // 忽略 responseType 不兼容情况
        }
      });
    }
    return origXhrSend.call(this, body);
  };

  // =========================================================================
  // 5. 主动官方同步器（RPC 重放 + 同源 /usage Fetch + 隐藏 Iframe 实时 Mutation）
  // =========================================================================
  let activeSyncPromise = null;
  let probeIframeEl = null;

  /**
   * 若已捕获官方配额 batchexecute RPC 模板，直接携带最新 WIZ XSRF Token (SNlM0e) 重放
   */
  async function replayCapturedQuotaRpc() {
    const tpl = quotaState.capturedQuotaRpc;
    if (!tpl || !tpl.url || !tpl.body) return false;

    try {
      let bodyToSend = tpl.body;
      const wiz = window.WIZ_global_data;
      if (wiz && typeof wiz.SNlM0e === "string") {
        const params = new URLSearchParams(bodyToSend);
        if (params.has("at")) {
          params.set("at", wiz.SNlM0e);
          bodyToSend = params.toString();
        }
      }

      const resp = await origFetch.call(window, tpl.url, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: bodyToSend,
      });
      if (!resp.ok) return false;
      const text = await resp.text();
      const frames = parseBatchExecuteResponse(text);
      for (const frame of frames) {
        const extracted = extractQuotaFromWizStructure(
          frame.payload,
          Date.now(),
        );
        if (extracted && commitOfficialQuota(extracted, "rpc", true)) {
          return true;
        }
      }
    } catch {
      // 重放失败时回退到 /usage 提取
    }
    return false;
  }

  /**
   * 挂载同源隐藏 Iframe 并通过 MutationObserver 在 /usage 渲染出配额节点的瞬间提取
   */
  function extractViaSameOriginUsageIframe(usageUrl, timeoutMs = 8000) {
    return new Promise((resolve) => {
      if (!document.body) {
        resolve(null);
        return;
      }

      if (probeIframeEl && probeIframeEl.parentNode) {
        probeIframeEl.parentNode.removeChild(probeIframeEl);
      }

      const iframe = el("iframe", {
        src: usageUrl,
        "aria-hidden": "true",
        tabindex: "-1",
        style:
          "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;top:-9999px;border:0;",
      });
      probeIframeEl = iframe;

      let finished = false;
      let observer = null;
      let pollId = null;

      const done = (res) => {
        if (finished) return;
        finished = true;
        if (observer) observer.disconnect();
        if (pollId) clearInterval(pollId);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        if (probeIframeEl === iframe) probeIframeEl = null;
        resolve(res);
      };

      const tryExtract = () => {
        try {
          const iDoc =
            iframe.contentDocument ||
            (iframe.contentWindow && iframe.contentWindow.document);
          if (!iDoc || !iDoc.body) return;
          const result = parseUsageDocument(iDoc, "");
          if (
            result &&
            ((result.fiveHour && result.fiveHour.pct !== null) ||
              (result.weekly && result.weekly.pct !== null))
          ) {
            done(result);
          }
        } catch {
          // 忽略未就绪状态
        }
      };

      iframe.addEventListener("load", () => {
        tryExtract();
        try {
          const iDoc =
            iframe.contentDocument ||
            (iframe.contentWindow && iframe.contentWindow.document);
          if (iDoc && iDoc.body) {
            observer = new MutationObserver(() => tryExtract());
            observer.observe(iDoc.body, {
              childList: true,
              subtree: true,
              characterData: true,
            });
          }
        } catch {
          // 回退到轮询
        }
        pollId = setInterval(tryExtract, 300);
      });

      iframe.addEventListener("error", () => done(null));
      document.body.appendChild(iframe);
      setTimeout(() => done(null), timeoutMs);
    });
  }

  /**
   * 立即同步官方最新 5H 与 7D 用量及重置时间
   */
  async function syncOfficialUsage(isManualClick = false) {
    if (activeSyncPromise) return activeSyncPromise;

    quotaState.isSyncing = true;
    if (isManualClick) {
      quotaState.lastError = "";
    }
    updateUI();

    activeSyncPromise = (async () => {
      try {
        // 0. 若当前就在官方 /usage 页面，直接解析当前 DOM
        if (window.location.pathname.endsWith("/usage")) {
          const direct = parseUsageDocument(
            document,
            document.documentElement.innerHTML,
          );
          if (direct && commitOfficialQuota(direct, "usage-page", true)) {
            return true;
          }
        }

        // 1. 优先尝试重放已捕获的官方 batchexecute 配额 RPC
        const rpcOk = await replayCapturedQuotaRpc();
        if (rpcOk) return true;

        // 2. 检查当前页面全局 WIZ_global_data 是否已内嵌配额结构
        if (window.WIZ_global_data) {
          const fromGlobalWiz = extractQuotaFromWizStructure(
            window.WIZ_global_data,
            Date.now(),
          );
          if (
            fromGlobalWiz &&
            commitOfficialQuota(fromGlobalWiz, "rpc", true)
          ) {
            return true;
          }
        }

        // 3. 请求同源 /usage 页面 HTML，解析内嵌 AF_initDataCallback 与 SSR 节点
        const usageUrl = getOfficialUsageUrl();
        try {
          const resp = await origFetch.call(window, usageUrl, {
            method: "GET",
            credentials: "include",
            cache: "no-store",
          });
          if (resp.ok) {
            const rawHtml = await resp.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(rawHtml, "text/html");
            const fromFetch = parseUsageDocument(doc, rawHtml);
            if (
              fromFetch &&
              fromFetch.fiveHour &&
              fromFetch.weekly &&
              commitOfficialQuota(fromFetch, "usage-page", true)
            ) {
              return true;
            }
          }
        } catch {
          // 继续走 Iframe CSR 探针
        }

        // 4. 通过同源隐藏 Iframe 等待 /usage 客户端渲染完成并提取真实节点（因为脚本含 @noframes，不会递归执行）
        const fromIframe = await extractViaSameOriginUsageIframe(usageUrl);
        if (fromIframe && commitOfficialQuota(fromIframe, "usage-page", true)) {
          return true;
        }

        quotaState.lastError = "暂未从官方接口获取到配额数据";
        return false;
      } catch (err) {
        quotaState.lastError =
          err instanceof Error ? err.message : "官方同步失败";
        return false;
      } finally {
        quotaState.isSyncing = false;
        activeSyncPromise = null;
        updateUI();
      }
    })();

    return activeSyncPromise;
  }

  // =========================================================================
  // 6. 格式化工具与颜色阶梯
  // =========================================================================
  function formatCompactCountdown(ms, isWeekly = false) {
    if (ms <= 0) return "00:00";
    const totalSec = Math.floor(ms / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    const pad = (n) => String(n).padStart(2, "0");

    if (days > 0) return `${days}d ${pad(hours)}h`;
    if (isWeekly && hours > 0) return `${hours}h ${pad(minutes)}m`;
    if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    return `${pad(minutes)}:${pad(seconds)}`;
  }

  function formatTooltip(label, metric) {
    if (!metric || metric.pct === null) {
      return `${label}: 等待从官方同步数据...`;
    }
    const lines = [`${label} 官方已用: ${metric.pct}%`];
    if (metric.resetAt && metric.resetAt > Date.now()) {
      const dt = new Date(metric.resetAt);
      const pad = (n) => String(n).padStart(2, "0");
      lines.push(
        `官方重置时间: ${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`,
      );
    } else if (metric.rawResetText) {
      lines.push(`官方重置状态: ${metric.rawResetText}`);
    }
    return lines.join("\n");
  }

  function getProgressColor(ratio) {
    const clamped = Math.max(0, Math.min(1, ratio));
    if (clamped < 0.5) {
      return { hex: "#10b981", glow: "rgba(16, 185, 129, 0.45)" };
    }
    if (clamped < 0.75) {
      return { hex: "#f59e0b", glow: "rgba(245, 158, 11, 0.45)" };
    }
    if (clamped < 0.9) {
      return { hex: "#f97316", glow: "rgba(249, 115, 22, 0.55)" };
    }
    return { hex: "#f43f5e", glow: "rgba(244, 63, 94, 0.75)" };
  }

  // =========================================================================
  // 7. 超薄细长条样式表（24px 高度，单行水平排布，5H + 7D 同屏）
  // =========================================================================
  const STYLES = `
    #gc-pill-root {
      position: fixed;
      z-index: 9999999;
      user-select: none;
      touch-action: none;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
      font-size: 11px;
      color: #f8fafc;
      line-height: 1;
      filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.45));
    }
    .gc-pill-container {
      display: inline-flex;
      align-items: center;
      height: 24px;
      gap: 6px;
      background: rgba(15, 17, 21, 0.92);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 9999px;
      padding: 0 7px 0 5px;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
      cursor: grab;
      white-space: nowrap;
      transition: border-color 0.2s;
    }
    .gc-pill-container:active { cursor: grabbing; }
    .gc-pill-container:hover { border-color: rgba(255, 255, 255, 0.28); }

    /* 左侧 16x16 微缩形态指示器（点击可切换 4 种视觉形态） */
    .gc-capsule-head {
      width: 16px;
      height: 16px;
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      cursor: pointer;
    }

    /* 单行指标单元：标签 + 百分比 + (内联进度条) + 重置倒计时 */
    .gc-metric-group {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 100%;
    }
    .gc-pill-badge {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.2px;
      padding: 1.5px 3.5px;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.08);
      line-height: 1;
    }
    .gc-pill-counter {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      font-weight: 700;
      color: #ffffff;
      font-variant-numeric: tabular-nums;
    }
    .gc-pill-timer {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 9.5px;
      color: #94a3b8;
      font-variant-numeric: tabular-nums;
    }

    /* 横条模式下的细长内联进度条 */
    .gc-inline-track {
      width: 24px;
      height: 2.5px;
      background: rgba(255, 255, 255, 0.12);
      border-radius: 999px;
      overflow: hidden;
      display: none;
      flex-shrink: 0;
    }
    .gc-inline-fill {
      height: 100%;
      border-radius: 999px;
      transition: width 0.3s ease, background-color 0.3s ease;
    }

    /* 1px 竖向分割线 */
    .gc-v-divider {
      width: 1px;
      height: 10px;
      background: rgba(255, 255, 255, 0.12);
      flex-shrink: 0;
    }

    /* 同步状态指示灯 */
    .gc-sync-dot {
      width: 4.5px;
      height: 4.5px;
      border-radius: 50%;
      flex-shrink: 0;
      background: #64748b;
    }
    .gc-sync-dot.official {
      background: #10b981;
      box-shadow: 0 0 4px rgba(16, 185, 129, 0.75);
    }
    .gc-sync-dot.syncing {
      background: #f59e0b;
      box-shadow: 0 0 5px rgba(245, 158, 11, 0.85);
    }
    .gc-sync-dot.error {
      background: #f43f5e;
    }

    /* 右侧图标按钮 */
    .gc-pill-actions {
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
    .gc-btn-icon {
      background: transparent;
      border: none;
      outline: none;
      color: #94a3b8;
      cursor: pointer;
      width: 16px;
      height: 16px;
      padding: 0;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: color 0.15s, background 0.15s;
    }
    .gc-btn-icon:hover {
      color: #f8fafc;
      background: rgba(255, 255, 255, 0.12);
    }
    .gc-btn-icon svg { width: 11px; height: 11px; }

    @keyframes gc-spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .gc-spinning svg {
      animation: gc-spin 0.75s linear infinite;
      color: #38bdf8;
    }

    /* 圆盘式 (14x14) */
    .gc-disk-box {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(255,255,255,0.2);
    }
    .gc-disk-core {
      position: absolute;
      width: 4.5px;
      height: 4.5px;
      background: #09090b;
      border-radius: 50%;
    }

    /* 晶体崩坏式 (14x14) */
    .gc-decay-capsule {
      width: 14px;
      height: 14px;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .gc-decay-body {
      width: 13px;
      height: 13px;
      position: relative;
    }
    .gc-decay-shard {
      position: absolute;
      width: 100%;
      height: 100%;
      top: 0;
      left: 0;
      transition: transform 0.35s ease, opacity 0.35s ease;
    }
    @keyframes gc-jitter {
      0% { transform: translate(0, 0) rotate(0deg); }
      25% { transform: translate(-0.7px, 0.7px) rotate(-1.5deg); }
      50% { transform: translate(0.7px, -0.7px) rotate(1.5deg); }
      75% { transform: translate(-0.7px, -0.5px) rotate(-0.8deg); }
      100% { transform: translate(0, 0) rotate(0deg); }
    }
    .gc-state-critical { animation: gc-jitter 0.18s infinite linear; }

    /* 设置抽屉 */
    #gc-pill-drawer {
      position: absolute;
      bottom: calc(100% + 6px);
      right: 0;
      width: 230px;
      background: rgba(15, 17, 23, 0.98);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 9px;
      box-shadow: 0 10px 24px rgba(0,0,0,0.65);
      padding: 9px 11px;
      backdrop-filter: blur(18px);
      display: none;
      flex-direction: column;
      gap: 7px;
      z-index: 10000000;
      white-space: normal;
    }
    #gc-pill-drawer.gc-active { display: flex; }
    .gc-drawer-title {
      font-size: 10px;
      font-weight: 700;
      color: #94a3b8;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      padding-bottom: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .gc-mode-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 4px;
    }
    .gc-choice-btn {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #cbd5e1;
      padding: 3.5px 2px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 10px;
      text-align: center;
      transition: all 0.15s;
    }
    .gc-choice-btn:hover { background: rgba(255, 255, 255, 0.12); color: #fff; }
    .gc-choice-btn.active {
      background: #2563eb;
      border-color: #3b82f6;
      color: #fff;
      font-weight: 600;
    }
    .gc-drawer-status {
      font-size: 9.5px;
      color: #94a3b8;
      border-top: 1px solid rgba(255,255,255,0.08);
      padding-top: 5px;
      line-height: 1.45;
      display: flex;
      flex-direction: column;
      gap: 2px;
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
  // 8. UI 节点装配与渲染
  // =========================================================================
  let rootEl = null;
  let pillContainerEl = null;
  let drawerEl = null;
  let headSlotEl = null;

  let group5hEl = null;
  let badge5hEl = null;
  let usage5hTextEl = null;
  let track5hEl = null;
  let fill5hEl = null;
  let timer5hTextEl = null;

  let group7dEl = null;
  let badge7dEl = null;
  let usage7dTextEl = null;
  let track7dEl = null;
  let fill7dEl = null;
  let timer7dTextEl = null;

  let syncDotEl = null;
  let btnRefreshEl = null;
  let statusSourceEl = null;
  let statusSyncTimeEl = null;
  const choiceBtns = [];

  function cycleStyleMode() {
    const modes = ["bar", "ring", "disk", "decay"];
    const nextIdx = (modes.indexOf(config.styleMode) + 1) % modes.length;
    config.styleMode = modes[nextIdx];
    saveConfig(config);
    updateUI();
  }

  function createDOM() {
    const existing = document.getElementById("gc-pill-root");
    if (existing) {
      rootEl = existing;
      return;
    }

    injectStyles();

    headSlotEl = el("div", {
      className: "gc-capsule-head",
      title: "点击切换指示器形态（横条 / 圆环 / 圆盘 / 崩坏）",
      onclick: (e) => {
        e.stopPropagation();
        cycleStyleMode();
      },
    });

    // 5H 单元
    badge5hEl = el("span", { className: "gc-pill-badge" }, ["5H"]);
    usage5hTextEl = el("span", { className: "gc-pill-counter" }, ["--%"]);
    fill5hEl = el("div", { className: "gc-inline-fill" });
    track5hEl = el("div", { className: "gc-inline-track" }, [fill5hEl]);
    timer5hTextEl = el("span", { className: "gc-pill-timer" }, ["同步中"]);
    group5hEl = el("div", { className: "gc-metric-group" }, [
      badge5hEl,
      usage5hTextEl,
      track5hEl,
      timer5hTextEl,
    ]);

    // 7D 单元
    badge7dEl = el("span", { className: "gc-pill-badge" }, ["7D"]);
    usage7dTextEl = el("span", { className: "gc-pill-counter" }, ["--%"]);
    fill7dEl = el("div", { className: "gc-inline-fill" });
    track7dEl = el("div", { className: "gc-inline-track" }, [fill7dEl]);
    timer7dTextEl = el("span", { className: "gc-pill-timer" }, ["同步中"]);
    group7dEl = el("div", { className: "gc-metric-group" }, [
      badge7dEl,
      usage7dTextEl,
      track7dEl,
      timer7dTextEl,
    ]);

    syncDotEl = el("span", { className: "gc-sync-dot" });

    // 刷新图标：立即同步官方当前配额与重置时间
    const refreshSvg = svgEl(
      "svg",
      {
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "2.3",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      },
      [
        svgEl("path", {
          d: "M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2",
        }),
      ],
    );

    btnRefreshEl = el(
      "button",
      {
        className: "gc-btn-icon",
        title: "立即同步官方最新用量与重置时间",
        onclick: (e) => {
          e.stopPropagation();
          syncOfficialUsage(true);
        },
      },
      [refreshSvg],
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
        title: "样式与数据源设置",
        onclick: (e) => {
          e.stopPropagation();
          drawerEl.classList.toggle("gc-active");
        },
      },
      [gearSvg],
    );

    const actionsBox = el("div", { className: "gc-pill-actions" }, [
      syncDotEl,
      btnRefreshEl,
      btnSettings,
    ]);

    pillContainerEl = el("div", { className: "gc-pill-container" }, [
      headSlotEl,
      group5hEl,
      el("div", { className: "gc-v-divider" }),
      group7dEl,
      el("div", { className: "gc-v-divider" }),
      actionsBox,
    ]);

    // 抽屉面板
    const drawerTitle = el("div", { className: "gc-drawer-title" }, [
      el("span", {}, ["指示器形态"]),
      el("span", { style: "font-size:9px; color:#64748b;" }, [
        "Voyager 同源引擎",
      ]),
    ]);

    choiceBtns.length = 0;
    const modes = [
      { key: "bar", text: "横条" },
      { key: "ring", text: "圆环" },
      { key: "disk", text: "圆盘" },
      { key: "decay", text: "崩坏" },
    ];
    for (const m of modes) {
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

    statusSourceEl = el("div", {}, ["数据源: 正在连接官方接口..."]);
    statusSyncTimeEl = el("div", { style: "color:#64748b;" }, ["上次同步: --"]);
    const openOfficialLink = el(
      "span",
      {
        className: "gc-link-btn",
        onclick: () => window.open(getOfficialUsageUrl(), "_blank"),
      },
      ["打开官方 /usage 页面核对"],
    );

    drawerEl = el("div", { id: "gc-pill-drawer" }, [
      drawerTitle,
      el("div", { className: "gc-mode-grid" }, choiceBtns),
      el("div", { className: "gc-drawer-status" }, [
        statusSourceEl,
        statusSyncTimeEl,
        openOfficialLink,
      ]),
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

  function bindDragEvents() {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialRight = 0;
    let initialBottom = 0;
    let hasMoved = false;

    pillContainerEl.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button") || e.target.closest(".gc-capsule-head")) {
        return;
      }
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

      const width = pillContainerEl.offsetWidth || 240;
      const newRight = Math.max(
        6,
        Math.min(window.innerWidth - width - 6, initialRight - dx),
      );
      const newBottom = Math.max(
        6,
        Math.min(window.innerHeight - 30, initialBottom - dy),
      );

      rootEl.style.right = `${newRight}px`;
      rootEl.style.bottom = `${newBottom}px`;
    });

    const endDrag = (e) => {
      if (!isDragging) return;
      isDragging = false;
      try {
        pillContainerEl.releasePointerCapture(e.pointerId);
      } catch {
        // 忽略
      }
      if (hasMoved) {
        config.pos.right = parseInt(rootEl.style.right, 10) || config.pos.right;
        config.pos.bottom =
          parseInt(rootEl.style.bottom, 10) || config.pos.bottom;
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

  function renderIndicatorHead(mode, ratio5h, ratio7d) {
    if (!headSlotEl) return;
    headSlotEl.textContent = "";

    const dominantRatio = Math.max(ratio5h, ratio7d);
    const color = getProgressColor(dominantRatio);
    const color5h = getProgressColor(ratio5h);
    const color7d = getProgressColor(ratio7d);

    if (mode === "bar") {
      track5hEl.style.display = "inline-block";
      fill5hEl.style.width = `${Math.min(100, Math.round(ratio5h * 100))}%`;
      fill5hEl.style.backgroundColor = color5h.hex;

      track7dEl.style.display = "inline-block";
      fill7dEl.style.width = `${Math.min(100, Math.round(ratio7d * 100))}%`;
      fill7dEl.style.backgroundColor = color7d.hex;

      const miniPill = el("div", {
        style: `width:8px; height:13px; border-radius:999px; background:linear-gradient(180deg, ${color.hex} 50%, rgba(255,255,255,0.18) 50%); border:1px solid rgba(255,255,255,0.28);`,
      });
      headSlotEl.appendChild(miniPill);
      return;
    }

    track5hEl.style.display = "none";
    track7dEl.style.display = "none";

    if (mode === "ring") {
      const radius = 5.8;
      const circumference = 2 * Math.PI * radius;
      const strokeOffset =
        circumference - Math.min(1, dominantRatio) * circumference;

      const ringSvg = svgEl(
        "svg",
        {
          viewBox: "0 0 16 16",
          style: "transform: rotate(-90deg); width:16px; height:16px;",
        },
        [
          svgEl("circle", {
            cx: "8",
            cy: "8",
            r: String(radius),
            stroke: "rgba(255, 255, 255, 0.14)",
            "stroke-width": "2",
            fill: "none",
          }),
          svgEl("circle", {
            cx: "8",
            cy: "8",
            r: String(radius),
            "stroke-width": "2",
            "stroke-linecap": "round",
            fill: "none",
            stroke: color.hex,
            style: `stroke-dasharray: ${circumference}; stroke-dashoffset: ${strokeOffset}; transition: stroke-dashoffset 0.35s ease;`,
          }),
        ],
      );
      headSlotEl.appendChild(ringSvg);
      return;
    }

    if (mode === "disk") {
      const degrees = Math.min(360, Math.round(dominantRatio * 360));
      const diskBox = el(
        "div",
        {
          className: "gc-disk-box",
          style: `background: conic-gradient(${color.hex} 0deg ${degrees}deg, rgba(255,255,255,0.12) ${degrees}deg 360deg);`,
        },
        [el("div", { className: "gc-disk-core" })],
      );
      headSlotEl.appendChild(diskBox);
      return;
    }

    if (mode === "decay") {
      const r = Math.min(1.2, dominantRatio);
      const isCritical = r >= 0.88;
      const drift = r * 4;
      const rot = r * 24;

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
      ];

      const shardNodes = shardsData.map((s) => {
        const transform = `translate(${s.dx.toFixed(1)}px, ${s.dy.toFixed(1)}px) rotate(${s.dr.toFixed(1)}deg)`;
        return el("div", {
          className: "gc-decay-shard",
          style: `clip-path: ${s.clip}; -webkit-clip-path: ${s.clip}; background: ${color.hex}; transform: ${transform};`,
        });
      });

      const body = el(
        "div",
        { className: `gc-decay-body ${isCritical ? "gc-state-critical" : ""}` },
        shardNodes,
      );
      headSlotEl.appendChild(
        el("div", { className: "gc-decay-capsule" }, [body]),
      );
    }
  }

  function renderMetricUnit(
    metric,
    isWeekly,
    label,
    badgeNode,
    usageNode,
    timerNode,
    groupNode,
  ) {
    if (!metric || metric.pct === null) {
      badgeNode.style.color = "#94a3b8";
      usageNode.textContent = "--%";
      timerNode.textContent = quotaState.isSyncing ? "同步中" : "待同步";
      timerNode.style.color = "#64748b";
      groupNode.title = formatTooltip(label, metric);
      return 0;
    }

    const pct = metric.pct;
    const ratio = pct / 100;
    const color = getProgressColor(ratio);

    badgeNode.style.color = color.hex;
    usageNode.textContent = `${pct}%`;

    const now = Date.now();
    if (metric.resetAt && metric.resetAt > now) {
      timerNode.textContent = formatCompactCountdown(
        metric.resetAt - now,
        isWeekly,
      );
      timerNode.style.color = color.hex;
    } else if (metric.rawResetText) {
      timerNode.textContent = metric.rawResetText.slice(0, 8);
      timerNode.style.color = color.hex;
    } else if (pct === 0) {
      timerNode.textContent = "已满";
      timerNode.style.color = "#10b981";
    } else {
      timerNode.textContent = "官方实时";
      timerNode.style.color = "#94a3b8";
    }

    groupNode.title = formatTooltip(label, metric);
    return ratio;
  }

  function updateUI() {
    if (!rootEl) return;

    // 自动检查官方重置到期归零
    const now = Date.now();
    if (quotaState.fiveHour.resetAt && quotaState.fiveHour.resetAt <= now) {
      quotaState.fiveHour.pct = 0;
      quotaState.fiveHour.resetAt = null;
    }
    if (quotaState.weekly.resetAt && quotaState.weekly.resetAt <= now) {
      quotaState.weekly.pct = 0;
      quotaState.weekly.resetAt = null;
    }

    const ratio5h = renderMetricUnit(
      quotaState.fiveHour,
      false,
      "5H (5小时窗口)",
      badge5hEl,
      usage5hTextEl,
      timer5hTextEl,
      group5hEl,
    );

    const ratio7d = renderMetricUnit(
      quotaState.weekly,
      true,
      "7D (7天周窗口)",
      badge7dEl,
      usage7dTextEl,
      timer7dTextEl,
      group7dEl,
    );

    renderIndicatorHead(config.styleMode, ratio5h, ratio7d);

    btnRefreshEl.classList.toggle("gc-spinning", quotaState.isSyncing);

    const hasOfficialData =
      quotaState.fiveHour.pct !== null || quotaState.weekly.pct !== null;
    syncDotEl.className = `gc-sync-dot ${
      quotaState.isSyncing
        ? "syncing"
        : hasOfficialData
          ? "official"
          : quotaState.lastError
            ? "error"
            : ""
    }`;

    const timeStr =
      quotaState.lastSyncTime > 0
        ? new Date(quotaState.lastSyncTime).toLocaleTimeString()
        : "未同步";

    const sourceMap = {
      rpc: "官方 batchexecute RPC 实时帧",
      "usage-page": "官方 /usage 页面直连",
      cache: "官方数据本地缓存",
      init: "等待首次同步",
    };

    statusSourceEl.textContent = quotaState.lastError
      ? `状态: ${quotaState.lastError}`
      : `数据源: ${sourceMap[quotaState.source] || "官方直连"}`;
    statusSyncTimeEl.textContent = `最后同步: ${timeStr}`;

    for (const btn of choiceBtns) {
      btn.classList.toggle("active", btn.dataset.style === config.styleMode);
    }
  }

  // =========================================================================
  // 9. 自愈保活与启动引导
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
    restoreCachedOfficialQuota();

    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY_OFFICIAL_CACHE) {
        restoreCachedOfficialQuota();
      }
    });

    const init = () => {
      createDOM();
      setTimeout(() => {
        syncOfficialUsage(false);
      }, 500);

      setInterval(() => {
        syncOfficialUsage(false);
      }, AUTO_SYNC_INTERVAL_MS);

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
