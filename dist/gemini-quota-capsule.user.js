// ==UserScript==
// @name         Gemini Quota Capsule
// @namespace    https://cyojkoy.github.io/Payment/
// @version      1.0.3
// @description  document-start 拦截 XHR/Fetch batchexecute (wrb.fr) 与官方用量页面，按窗口精确分流 5H / 7D 用量；装饰图标与两段进度独立配置，支持图片、SVG 与组件 CSS。
// @author       Yoko
// @updateURL    https://cdn.jsdelivr.net/gh/CYoJkoY/Yoko-ScriptCat-Scripts@main/dist/gemini-quota-capsule.user.js
// @downloadURL  https://ghfast.top/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/main/dist/gemini-quota-capsule.user.js
// @match        https://gemini.google.com/*
// @match        https://bard.google.com/*
// @run-at       document-start
// @grant        none
// @noframes
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnIiB4MT0iMCIgeTE9IjAiIHgyPSIxIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjMTBiOTgxIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjMDY1ZjQ2Ii8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiByeD0iMTIiIGZpbGw9IiMwOTA5MGIiLz48ZyB0cmFuc2Zvcm09InJvdGF0ZSgtNDUgMjQgMjQpIj48cmVjdCB4PSIxNCIgeT0iOCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjMyIiByeD0iMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzMzNDE1NSIgc3Ryb2tlLXdpZHRoPSIyLjUiLz48cGF0aCBkPSJNMTQgMThDMTQgMTIuNSAxOC41IDggMjQgOHMxMCA0LjUgMTAgMTB2NkgxNHoiIGZpbGw9InVybCgjZykiLz48cGF0aCBkPSJNMTQgMjRoMjB2NkgxNHoiIGZpbGw9IiMxZTI5M2IiLz48bGluZSB4MT0iMTQiIHkxPSIyNCIgeDI9IjM0IiB5Mj0iMjQiIHN0cm9rZT0iI2Y4ZmFmYyIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1vcGFjaXR5PSIuNiIvPjwvZz48L3N2Zz4=
// @license      MIT
// ==/UserScript==

"use strict";
(() => {
  // scripts/gemini-quota-capsule/src/config.ts
  var SCRIPT_VERSION = "1.0.3";
  var INDICATOR_MODES = [
    { key: "bar", text: "横条" },
    { key: "ring", text: "圆环" },
    { key: "disk", text: "圆盘" },
    { key: "decay", text: "崩坏" },
    { key: "segments", text: "分段" },
    { key: "battery", text: "电池" },
    { key: "columns", text: "双柱" }
  ];
  var PROGRESS_MODE_CHOICES = [...INDICATOR_MODES, { key: "none", text: "隐藏" }];
  var ORNAMENT_MODES = [
    { key: "prism", text: "棱镜" },
    { key: "spark", text: "星芒" },
    { key: "orbit", text: "轨道" },
    { key: "capsule", text: "胶囊" },
    { key: "bolt", text: "闪电" },
    { key: "none", text: "无" }
  ];
  var CUSTOM_ORNAMENT_KINDS = [
    "image",
    "svg"
  ];
  var CSS_TARGETS = [
    { key: "container", text: "胶囊容器" },
    { key: "head", text: "装饰图标" },
    { key: "five-hour", text: "5 小时组" },
    { key: "weekly", text: "每周组" },
    { key: "badge", text: "标签" },
    { key: "counter", text: "百分比" },
    { key: "progress", text: "进度图形" },
    { key: "timer", text: "倒计时" },
    { key: "divider", text: "分隔线" },
    { key: "actions", text: "操作区" },
    { key: "drawer", text: "设置抽屉" }
  ];
  var MAX_IMAGE_BYTES = 256 * 1024;
  var MAX_IMAGE_DATA_URL_CHARS = 420 * 1024;
  var MAX_SVG_CHARS = 20 * 1024;
  var MAX_CSS_CHARS = 8 * 1024;
  var SVG_NS = "http://www.w3.org/2000/svg";
  var STORAGE_KEY_CFG = "__gemini_quota_capsule_cfg_v5__";
  var STORAGE_KEY_OFFICIAL_CACHE = "__gemini_quota_official_cache_v8__";
  var STORAGE_KEY_SYNC_BRIDGE = "__gemini_quota_sync_bridge_v1__";
  var HELPER_SYNC_HASH_KEY = "gqc-usage-sync";
  var AUTO_SYNC_INTERVAL_MS = 3 * 60 * 1e3;
  var AUTO_SYNC_HEARTBEAT_MS = 1e4;
  var USAGE_FRAME_WIDTH_PX = 1280;
  var USAGE_FRAME_HEIGHT_PX = 900;
  var USAGE_FRAME_TIMEOUT_MS = 12e3;
  var USAGE_FRAME_BLANK_GRACE_MS = 1500;
  var USAGE_FRAME_RETRY_COOLDOWN_MS = 10 * 60 * 1e3;
  var USAGE_HELPER_TIMEOUT_MS = 2e4;
  var USAGE_HELPER_WAIT_MS = 3e4;
  var FIVE_HOUR_MS = 5 * 60 * 60 * 1e3;
  var WEEK_MS = 7 * 24 * 60 * 60 * 1e3;
  var RESET_SLACK_MS = 30 * 60 * 1e3;
  var FRESH_MS = 10 * 60 * 1e3;
  var MAX_CACHE_AGE_MS = 10 * 60 * 1e3;
  var CONFIDENCE = { heuristic: 1, dom: 2, pools: 3 };
  var DEFAULT_COMPONENT_CSS = Object.freeze({
    container: "",
    head: "",
    "five-hour": "",
    weekly: "",
    badge: "",
    counter: "",
    progress: "",
    timer: "",
    divider: "",
    actions: "",
    drawer: ""
  });
  var DEFAULT_CONFIG = {
    styleMode: "bar",
    pos: { right: 20, bottom: 78 },
    icon: { kind: "prism", image: "", svg: "" },
    metrics: { fiveHour: "bar", weekly: "bar" },
    css: { ...DEFAULT_COMPONENT_CSS },
    debug: false
  };
  function isProgressMode(value) {
    return PROGRESS_MODE_CHOICES.some((mode) => mode.key === value);
  }
  function isOrnamentPreset(value) {
    return ORNAMENT_MODES.some((mode) => mode.key === value);
  }
  function isCssTargetKey(value) {
    return CSS_TARGETS.some((target) => target.key === value);
  }
  function isSafeCssText(value) {
    if (typeof value !== "string") return false;
    if (value.length > MAX_CSS_CHARS) return false;
    return !/[{}<>]|@import|expression\s*\(|javascript\s*:/i.test(value);
  }
  var METRIC_KINDS = [
    "fiveHour",
    "weekly"
  ];

  // scripts/gemini-quota-capsule/src/core/account.ts
  var observedAccountPrefix = "";
  function noteAccountPrefix(url) {
    if (typeof url !== "string" || !url) return;
    try {
      const parsed = new URL(url, window.location.href);
      if (parsed.origin !== window.location.origin) return;
      const match = parsed.pathname.match(/^(\/u\/\d+)\//);
      if (!match) return;
      if (observedAccountPrefix && observedAccountPrefix !== match[1]) return;
      observedAccountPrefix = match[1];
    } catch {
      return;
    }
  }
  function getAccountPrefix() {
    const match = window.location.pathname.match(/^(\/u\/\d+)\b/);
    if (match) return match[1];
    return observedAccountPrefix;
  }
  function discoverAccountPrefix() {
    const current = getAccountPrefix();
    if (current) return current;
    try {
      const entries = window.performance.getEntriesByType("resource");
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        if (!entry || typeof entry.name !== "string") continue;
        if (!/\/BardChatUi\/|batchexecute/.test(entry.name)) continue;
        noteAccountPrefix(entry.name);
        if (getAccountPrefix()) break;
      }
    } catch {
      return getAccountPrefix();
    }
    return getAccountPrefix();
  }
  function getOfficialUsageUrl() {
    return `${window.location.origin}${getAccountPrefix()}/usage`;
  }
  function isSameUsagePath(finalPath, candidatePath, allowBareRedirect = false) {
    const normalize = (path) => typeof path === "string" ? path.replace(/\/+$/, "") : "";
    const target = normalize(candidatePath);
    if (!target) return false;
    const final = normalize(finalPath);
    if (final === target) return true;
    if (target !== "/usage" || allowBareRedirect !== true) return false;
    return /^\/u\/\d+\/usage$/.test(final);
  }

  // scripts/gemini-quota-capsule/src/core/batch.ts
  function parseBatchExecuteResponse(rawText) {
    if (!rawText || typeof rawText !== "string") return [];
    const results = [];
    const stripped = rawText.replace(/^\)\]\}'\s*/, "");
    const seen = /* @__PURE__ */ new Set();
    const visit = (value) => {
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
          try {
            visit(JSON.parse(trimmed));
          } catch {
          }
        }
        return;
      }
      if (!Array.isArray(value)) return;
      if (value[0] === "wrb.fr" && typeof value[1] === "string" && typeof value[2] === "string") {
        const rpcId = value[1];
        const payloadText = value[2];
        const key = `${rpcId}\0${payloadText}`;
        if (seen.has(key)) return;
        seen.add(key);
        let payload = payloadText;
        try {
          payload = JSON.parse(payloadText);
        } catch {
        }
        results.push({ rpcId, payload });
        return;
      }
      for (const child of value) visit(child);
    };
    for (const line of stripped.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        visit(JSON.parse(trimmed));
      } catch {
      }
    }
    return results;
  }

  // scripts/gemini-quota-capsule/src/core/state.ts
  function emptyMetric() {
    return {
      pct: null,
      usedPct: null,
      used: null,
      limit: null,
      resetAt: null,
      rawResetText: "",
      confidence: 0,
      updatedAt: 0
    };
  }
  var quotaState = {
    source: "init",
    isSyncing: false,
    syncPhase: "",
    lastSyncTime: 0,
    lastError: "",
    fiveHour: emptyMetric(),
    weekly: emptyMetric(),
    capturedQuotaRpc: null,
    usagePageStatus: null
  };
  var parseRejectDiag = {
    cssLike: 0,
    barePercent: 0,
    unverifiedFull: 0
  };
  var usageParseDiag = {
    blocks: 0,
    initHit: false,
    domHit: false,
    textHit: false,
    frameAttempts: 0,
    frameLoads: 0,
    frameBlocked: false,
    frameRedirected: false,
    frameTimeout: false,
    frameTextLength: 0,
    frameParsed: false,
    frameReason: "",
    helperAttempts: 0,
    helperOK: false,
    helperReason: ""
  };
  var uiUpdater = null;
  function setUiUpdater(updater) {
    uiUpdater = updater;
  }
  function requestUiUpdate() {
    if (uiUpdater) uiUpdater();
  }

  // scripts/gemini-quota-capsule/src/core/text.ts
  var CSS_LIKE_RE = /(?:^|[;{]\s*)(?:width|height|min-width|max-width|min-height|max-height|opacity|transform|translate|rotate|scale|stroke|fill|margin|padding|border|font-size|line-height|flex|top|left|right|bottom)\s*:/i;
  function isQuotaTextCandidate(text) {
    if (typeof text !== "string") return false;
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 160) return false;
    if (/[{}<>]/.test(trimmed)) return false;
    if (CSS_LIKE_RE.test(trimmed)) return false;
    return true;
  }
  function pctFromTextWithContext(text, options = {}) {
    if (typeof text !== "string" || !text) return null;
    if (/[{}<>]/.test(text) || CSS_LIKE_RE.test(text)) {
      parseRejectDiag.cssLike += 1;
      return null;
    }
    const allowBare = options.allowBare === true;
    const re = /(\d{1,3}(?:\.\d+)?)\s*%/g;
    let match;
    let usedPct = null;
    let remainingPct = null;
    let barePct = null;
    const directionOf = (fragment) => {
      if (/(剩余|剩餘|可用|余量|餘量|remaining|available|left)/i.test(fragment)) {
        return "remaining";
      }
      if (/(已用|已使用|使用量|用量|used|consumed|utiliz)/i.test(fragment)) {
        return "used";
      }
      return null;
    };
    while ((match = re.exec(text)) !== null) {
      const amount = match[1];
      if (amount === void 0) continue;
      const value = Math.min(100, Math.max(0, Math.round(parseFloat(amount))));
      const lineStart = text.lastIndexOf("\n", match.index);
      const lineEndIdx = text.indexOf("\n", match.index);
      const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx;
      const before = text.slice(Math.max(lineStart + 1, match.index - 12), match.index);
      const line = text.slice(lineStart + 1, lineEnd);
      const after = text.slice(match.index, Math.min(lineEnd, match.index + 12));
      const direction = directionOf(before) || directionOf(after) || directionOf(line);
      if (direction === "remaining") {
        if (remainingPct === null) remainingPct = value;
      } else if (direction === "used") {
        if (usedPct === null) usedPct = value;
      } else if (barePct === null) {
        barePct = value;
      }
    }
    if (remainingPct !== null) return { pct: remainingPct, usedPct: 100 - remainingPct };
    if (usedPct !== null) return { pct: 100 - usedPct, usedPct };
    if (barePct === null) return null;
    if (!allowBare) {
      parseRejectDiag.barePercent += 1;
      return null;
    }
    return { pct: 100 - barePct, usedPct: barePct };
  }

  // scripts/gemini-quota-capsule/src/core/time.ts
  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function toEpochMs(value, nowMs = Date.now()) {
    const minMs = nowMs - 10 * 60 * 1e3;
    const maxMs = nowMs + 10 * 86400 * 1e3;
    const plausible = (ms) => Number.isFinite(ms) && ms >= minMs && ms <= maxMs;
    if (typeof value === "number" && Number.isFinite(value)) {
      if (plausible(value)) return Math.round(value);
      if (plausible(value * 1e3)) return Math.round(value * 1e3);
      return null;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return null;
      if (/^\d{10,13}$/.test(trimmed)) return toEpochMs(Number(trimmed), nowMs);
      if (!/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return null;
      const parsed = Date.parse(trimmed);
      return plausible(parsed) ? parsed : null;
    }
    if (Array.isArray(value)) {
      if (!value.length) return null;
      const head = value[0];
      if (typeof head === "number") return toEpochMs(head, nowMs);
      if (head && typeof head === "object") return toEpochMs(head, nowMs);
      return null;
    }
    if (isRecord(value)) {
      for (const key of [
        "seconds",
        "second",
        "secs",
        "sec",
        "epochSeconds",
        "timestamp",
        "millis",
        "milliseconds",
        "ms",
        "epochMillis"
      ]) {
        if (value[key] === void 0) continue;
        const parsed = toEpochMs(value[key], nowMs);
        if (parsed !== null) return parsed;
      }
    }
    return null;
  }
  var RELATIVE_RESET_PATTERNS = [
    /(?:reset(?:s|ting)?|restor(?:e|es|ing)|renew(?:s|ed|ing)?)\s+(?:in|after)\s+([^.;,，。!?]{1,40})/i,
    /([^.;,，。!?]{1,40}?)\s+(?:until|before)\s+(?:the\s+)?(?:next\s+)?(?:reset|refill|renew)/i,
    /([^.;,，。!?]{1,40}?)\s*(?:后|後)\s*(?:重置|刷新|恢复|恢復|重設|リセット)/,
    /(?:剩余|剩餘|还剩|還剩|尚有|还有|還有)\s*([^.;,，。!?]{1,40})/,
    /あと\s*([^。!?]{1,40})/
  ];
  var DURATION_TOKEN_RE = /(\d+(?:\.\d+)?)\s*(weeks?|w|週間|週|周|days?|d|天|日|hours?|hrs?|hr|h|个?小时|個?小時|時間|minutes?|mins?|min|m|分钟|分鐘|分(?!钟|鐘|析|辨|部)|seconds?|secs?|sec|s|秒)\s*$/i;
  function durationUnitToMs(unit) {
    const normalized = unit.toLowerCase();
    if (/^(w|weeks?|周|週|週間)$/.test(normalized)) return 7 * 86400 * 1e3;
    if (/^(d|days?|天|日)$/.test(normalized)) return 86400 * 1e3;
    if (/^(h|hr|hrs|hours?|小时|小時|時間)$/.test(normalized)) return 3600 * 1e3;
    if (/^(m|min|mins|minutes?|分钟|分鐘|分)$/.test(normalized)) return 60 * 1e3;
    if (/^(s|sec|secs|seconds?|秒)$/.test(normalized)) return 1e3;
    return null;
  }
  function sumTrailingDurations(fragment) {
    if (typeof fragment !== "string") return null;
    let rest = fragment.trim().replace(/[)）\]】]$/, "").trim();
    let total = 0;
    for (let guard = 0; guard < 4; guard += 1) {
      const match = rest.match(DURATION_TOKEN_RE);
      if (!match) break;
      const amountText = match[1];
      const unitText = match[2];
      if (amountText === void 0 || unitText === void 0) break;
      const unitMs = durationUnitToMs(unitText);
      if (unitMs === null) break;
      total += parseFloat(amountText) * unitMs;
      rest = rest.slice(0, match.index).trim();
    }
    return total > 0 ? total : null;
  }
  function parseOfficialResetTextToTimestamp(text, nowMs = Date.now()) {
    if (!text || typeof text !== "string") return null;
    const clean = text.replace(/\s+/g, " ").trim();
    const minMs = nowMs - 10 * 60 * 1e3;
    const maxMs = nowMs + 30 * 86400 * 1e3;
    const isoMatch = clean.match(
      /(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?)?/
    );
    if (isoMatch && isoMatch[4] !== void 0) {
      const year = Number(isoMatch[1]);
      const month = Number(isoMatch[2]);
      const day = Number(isoMatch[3]);
      const hour = Number(isoMatch[4]);
      const minute = Number(isoMatch[5]);
      const second = isoMatch[6] === void 0 ? 0 : Number(isoMatch[6]);
      const zone = isoMatch[7];
      const pad = (n) => String(n).padStart(2, "0");
      const absolute = zone ? Date.parse(
        `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}${zone === "Z" ? "Z" : zone.replace(/^([+-]\d{2})(\d{2})$/, "$1:$2")}`
      ) : new Date(year, month - 1, day, hour, minute, second, 0).getTime();
      if (Number.isFinite(absolute) && absolute >= minMs && absolute <= maxMs) {
        return absolute;
      }
    }
    const cnDateMatch = clean.match(
      /(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*(上午|下午|晚上|凌晨)?\s*(\d{1,2}):(\d{2}))?/
    );
    if (cnDateMatch) {
      const explicitYear = cnDateMatch[1] ? Number(cnDateMatch[1]) : null;
      const month = Number(cnDateMatch[2]);
      const day = Number(cnDateMatch[3]);
      const half = cnDateMatch[4] || "";
      let hour = cnDateMatch[5] === void 0 ? 0 : Number(cnDateMatch[5]);
      const minute = cnDateMatch[6] === void 0 ? 0 : Number(cnDateMatch[6]);
      if ((half === "下午" || half === "晚上") && hour < 12) hour += 12;
      if (half === "凌晨" && hour === 12) hour = 0;
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && hour <= 23 && minute <= 59) {
        const year = explicitYear === null ? new Date(nowMs).getFullYear() : explicitYear;
        let absolute = new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
        if (explicitYear === null && absolute < nowMs - 86400 * 1e3) {
          absolute = new Date(year + 1, month - 1, day, hour, minute, 0, 0).getTime();
        }
        if (absolute >= minMs && absolute <= maxMs) return absolute;
        return null;
      }
    }
    const monthDateMatch = clean.match(
      /\b(?:resets?|refresh(?:es|ing)?|renews?)?\s*(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?\s+(?:at\s*)?(\d{1,2}):(\d{2})\s*(AM|PM)?/i
    );
    if (monthDateMatch) {
      const monthNames = [
        "jan",
        "feb",
        "mar",
        "apr",
        "may",
        "jun",
        "jul",
        "aug",
        "sep",
        "oct",
        "nov",
        "dec"
      ];
      const monthLabel = monthDateMatch[1];
      const month = monthLabel ? monthNames.indexOf(monthLabel.slice(0, 3).toLowerCase()) : -1;
      let hour = Number(monthDateMatch[4]);
      const minute = Number(monthDateMatch[5]);
      const meridiem = (monthDateMatch[6] || "").toUpperCase();
      if (meridiem === "PM" && hour < 12) hour += 12;
      if (meridiem === "AM" && hour === 12) hour = 0;
      const year = monthDateMatch[3] ? Number(monthDateMatch[3]) : new Date(nowMs).getFullYear();
      if (month >= 0 && hour <= 23 && minute <= 59) {
        const dayNumber = Number(monthDateMatch[2]);
        let absolute = new Date(year, month, dayNumber, hour, minute, 0, 0).getTime();
        if (!monthDateMatch[3] && absolute < nowMs - 86400 * 1e3) {
          absolute = new Date(year + 1, month, dayNumber, hour, minute, 0, 0).getTime();
        }
        if (absolute >= minMs && absolute <= maxMs) return absolute;
        return null;
      }
    }
    const clockMatch = clean.match(
      /(?:(tomorrow|明天|明日|today|今天|今日)\s*)?(?:at\s*|于\s*|於\s*)?(上午|下午|早上|晚上|凌晨)?\s*(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i
    );
    if (clockMatch) {
      const dayWord = (clockMatch[1] || "").toLowerCase();
      const cnHalf = clockMatch[2] || "";
      let hr = parseInt(clockMatch[3] ?? "", 10);
      const mn = parseInt(clockMatch[4] ?? "", 10);
      const enHalf = (clockMatch[5] || "").toUpperCase();
      if (hr >= 0 && hr <= 23 && mn >= 0 && mn <= 59) {
        if ((enHalf === "PM" || cnHalf === "下午" || cnHalf === "晚上") && hr < 12) {
          hr += 12;
        } else if ((enHalf === "AM" || cnHalf === "凌晨") && hr === 12) {
          hr = 0;
        }
        const target = new Date(nowMs);
        target.setHours(hr, mn, 0, 0);
        if (dayWord === "tomorrow" || dayWord === "明天" || dayWord === "明日") {
          target.setDate(target.getDate() + 1);
        } else if (target.getTime() <= nowMs) {
          target.setDate(target.getDate() + 1);
        }
        const absolute = target.getTime();
        if (absolute >= minMs && absolute <= maxMs) return absolute;
      }
    }
    for (const pattern of RELATIVE_RESET_PATTERNS) {
      const match = clean.match(pattern);
      if (!match) continue;
      const fragment = match[1];
      if (fragment === void 0) continue;
      const deltaMs = sumTrailingDurations(fragment);
      if (deltaMs !== null && deltaMs > 0 && deltaMs <= 30 * 24 * 3600 * 1e3) {
        return Math.round(nowMs + deltaMs);
      }
    }
    return null;
  }

  // scripts/gemini-quota-capsule/src/core/quota.ts
  function isRecord2(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function sanitizeMetric(metric, kind, nowMs = Date.now()) {
    if (!isRecord2(metric)) return null;
    const windowMs = kind === "fiveHour" ? FIVE_HOUR_MS : WEEK_MS;
    let pct = null;
    if (typeof metric["pct"] === "number" && Number.isFinite(metric["pct"])) {
      pct = Math.min(100, Math.max(0, Math.round(metric["pct"])));
    }
    const resetOnly = pct === null && metric["allowResetOnly"] === true;
    if (pct === null && !resetOnly) return null;
    const usedPct = typeof metric["usedPct"] === "number" && Number.isFinite(metric["usedPct"]) ? Math.min(100, Math.max(0, Math.round(metric["usedPct"]))) : pct === null ? null : 100 - pct;
    let resetAt = toEpochMs(metric["resetAt"], nowMs);
    let rawResetText = typeof metric["rawResetText"] === "string" ? metric["rawResetText"] : "";
    if (resetAt === null) {
      rawResetText = "";
    } else {
      const remaining = resetAt - nowMs;
      if (remaining > windowMs + RESET_SLACK_MS) return null;
      if (remaining < 0) {
        resetAt = null;
        rawResetText = "";
      }
    }
    const confidence = typeof metric["confidence"] === "number" ? metric["confidence"] : CONFIDENCE.heuristic;
    if (!resetOnly && usedPct === 100 && resetAt === null && confidence <= CONFIDENCE.heuristic) {
      parseRejectDiag.unverifiedFull += 1;
      return null;
    }
    return {
      pct,
      usedPct,
      used: typeof metric["used"] === "number" && Number.isFinite(metric["used"]) ? metric["used"] : null,
      limit: typeof metric["limit"] === "number" && Number.isFinite(metric["limit"]) ? metric["limit"] : null,
      resetAt,
      rawResetText,
      confidence,
      allowResetOnly: resetOnly,
      updatedAt: 0
    };
  }
  function poolKindFromLabel(label) {
    if (typeof label !== "string") return null;
    const upper = label.trim().toUpperCase();
    if (!upper) return null;
    if (upper.includes("WEEK") || upper.includes("604800")) return "weekly";
    if (upper.includes("FIVE_HOURLY") || upper.includes("FIVE_HOUR") || upper.includes("FIVEHOUR") || upper.includes("5_HOUR") || upper.includes("5H") || upper.includes("HOURLY") || upper.includes("PER_HOUR") || upper.includes("PERHOUR") || upper.includes("18000")) {
      return "fiveHour";
    }
    if (upper.includes("7D") || upper.includes("7_DAY")) return "weekly";
    return null;
  }
  var POOL_KIND_KEY_RE = /^(pool_?type|pool_?id|pool_?name|poolType|poolId|bucket|bucket_?type|type|kind|window_?type|quota_?type|limit_?type|id|name)$/i;
  var USED_PCT_KEY_RE = /(?:percentage|percent|pct|ratio|fraction|utiliz).*used|used.*(?:percentage|percent|pct|ratio|fraction|utiliz)/i;
  var REMAINING_PCT_KEY_RE = /(?:remaining|available|left|unused).*(?:percentage|percent|pct|ratio|fraction)|(?:percentage|percent|pct|ratio|fraction).*(?:remaining|available|left|unused)/i;
  var PCT_KEY_RE = /(percent|pct|ratio|utiliz)/i;
  var USED_KEY_RE = /^(used|used_?count|used_?amount|consumed|count|requests|messages)$/i;
  var LIMIT_KEY_RE = /^(limit|max|maximum|quota|capacity|total|cap)$/i;
  var RESET_KEY_RE = /(refresh|reset|expire|renew)/i;
  var QUOTA_SCOPE_KEY_RE = /^(gxu|pool|window|quota|limit|usage|refresh|billing|rate)/i;
  var FRACTION_KEY_RE = /(fraction|ratio|0to1|0_to_1)/i;
  function poolKindFromRecord(record) {
    if (!isRecord2(record)) return null;
    for (const [key, value] of Object.entries(record)) {
      if (!POOL_KIND_KEY_RE.test(key)) continue;
      const kind = poolKindFromLabel(typeof value === "string" ? value : "");
      if (kind) return kind;
    }
    return null;
  }
  function toFiniteNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value.trim())) {
      return Number(value.trim());
    }
    if (Array.isArray(value) && typeof value[0] === "number" && Number.isFinite(value[0])) {
      return value[0];
    }
    if (isRecord2(value)) {
      for (const key of ["value", "number", "amount", "count", "used", "percent"]) {
        const candidate = value[key];
        if (typeof candidate === "number" && Number.isFinite(candidate)) {
          return candidate;
        }
      }
    }
    return null;
  }
  function findNumericField(scopes, regex) {
    for (const scope of scopes) {
      for (const [key, value] of Object.entries(scope)) {
        if (!regex.test(key)) continue;
        const number = toFiniteNumber(value);
        if (number !== null) return { key, number };
      }
    }
    return null;
  }
  function pctHintFromKey(key) {
    if (typeof key !== "string" || !key) return null;
    return FRACTION_KEY_RE.test(key) ? "fraction" : "percent";
  }
  function normalizePctValue(raw, hint = null) {
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return null;
    if (hint === "fraction") return Math.min(100, Math.round(raw * 100));
    if (hint === "percent") return Math.min(100, Math.round(raw));
    if (raw > 0 && raw < 1 && !Number.isInteger(raw)) {
      return Math.min(100, Math.round(raw * 100));
    }
    return Math.min(100, Math.round(raw));
  }
  function collectResetCandidates(record, nowMs, depth = 0, out = []) {
    if (!record || typeof record !== "object" || depth > 2) return out;
    for (const [key, value] of Object.entries(record)) {
      if (RESET_KEY_RE.test(key)) {
        const direct = toEpochMs(value, nowMs);
        if (direct !== null) {
          out.push(direct);
          continue;
        }
        if (typeof value === "string") {
          const parsed = parseOfficialResetTextToTimestamp(value, nowMs);
          if (parsed !== null) out.push(parsed);
        }
      }
      if (value && typeof value === "object") {
        collectResetCandidates(value, nowMs, depth + 1, out);
      }
    }
    return out;
  }
  function pickResetAt(candidates, kind, nowMs) {
    const windowMs = kind === "fiveHour" ? FIVE_HOUR_MS : WEEK_MS;
    const unique = [...new Set(candidates)].sort((a, b) => a - b);
    if (!unique.length) return { resetAt: null, misbound: false };
    const fitting = unique.filter(
      (ts) => ts > nowMs && ts - nowMs <= windowMs + RESET_SLACK_MS
    );
    const beyondWindow = unique.filter((ts) => ts - nowMs > windowMs + RESET_SLACK_MS);
    if (!fitting.length) {
      return { resetAt: null, misbound: beyondWindow.length > 0 };
    }
    if (fitting.length > 1) return { resetAt: null, misbound: false };
    return { resetAt: fitting[0] ?? null, misbound: false };
  }
  function findNumberByKey(scope, regex) {
    if (!isRecord2(scope)) return null;
    for (const [key, value] of Object.entries(scope)) {
      if (!regex.test(key)) continue;
      const number = toFiniteNumber(value);
      if (number !== null) return number;
    }
    return null;
  }
  function readMetricFromRecord(record, kind, nowMs) {
    if (!isRecord2(record)) return null;
    const scopes = [record];
    for (const [key, value] of Object.entries(record)) {
      if (!isRecord2(value)) continue;
      if (QUOTA_SCOPE_KEY_RE.test(key)) scopes.push(value);
    }
    const remainingPctField = findNumericField(scopes, REMAINING_PCT_KEY_RE);
    const usedPctField = findNumericField(scopes, USED_PCT_KEY_RE);
    const ambiguousPctField = findNumericField(scopes, PCT_KEY_RE);
    let pct = null;
    let usedPct = null;
    if (remainingPctField) {
      pct = normalizePctValue(
        remainingPctField.number,
        pctHintFromKey(remainingPctField.key)
      );
      if (pct !== null) usedPct = 100 - pct;
    } else if (usedPctField) {
      const value = normalizePctValue(
        usedPctField.number,
        pctHintFromKey(usedPctField.key)
      );
      if (value !== null) {
        usedPct = value;
        pct = 100 - value;
      }
    } else if (ambiguousPctField) {
      const value = normalizePctValue(
        ambiguousPctField.number,
        pctHintFromKey(ambiguousPctField.key)
      );
      if (value !== null) {
        usedPct = value;
        pct = 100 - value;
      }
    }
    let used = null;
    let limit = null;
    if (pct === null) {
      for (const scope of scopes) {
        const usedValue = findNumberByKey(scope, USED_KEY_RE);
        const limitValue = findNumberByKey(scope, LIMIT_KEY_RE);
        if (usedValue !== null && limitValue !== null && limitValue > 0 && usedValue >= 0 && usedValue <= limitValue) {
          used = usedValue;
          limit = limitValue;
          usedPct = Math.min(100, Math.max(0, Math.round(usedValue / limitValue * 100)));
          pct = 100 - usedPct;
          break;
        }
      }
    } else {
      used = findNumberByKey(record, USED_KEY_RE);
      limit = findNumberByKey(record, LIMIT_KEY_RE);
    }
    if (pct === null) return null;
    const resetPick = pickResetAt(collectResetCandidates(record, nowMs), kind, nowMs);
    if (resetPick.misbound) return null;
    return {
      pct,
      usedPct,
      used,
      limit,
      resetAt: resetPick.resetAt,
      rawResetText: ""
    };
  }
  function flattenShallow(node, depth = 0) {
    const out = [];
    for (const item of node) {
      if (Array.isArray(item) && depth < 2) {
        out.push(...flattenShallow(item, depth + 1));
      } else {
        out.push(item);
      }
    }
    return out;
  }
  function readMetricFromArrayTuple(node, kind, nowMs) {
    const items = flattenShallow(node);
    const candidates = [];
    let pctInfo = null;
    for (const item of items) {
      if (typeof item === "number") {
        const timestamp = toEpochMs(item, nowMs);
        if (timestamp !== null) candidates.push(timestamp);
        continue;
      }
      if (typeof item === "string") {
        if (!isQuotaTextCandidate(item)) continue;
        if (!pctInfo) {
          const info = pctFromTextWithContext(item, { allowBare: false });
          if (info) {
            pctInfo = info;
            continue;
          }
        }
        const timestamp = toEpochMs(item, nowMs) || parseOfficialResetTextToTimestamp(item, nowMs);
        if (timestamp !== null) candidates.push(timestamp);
      }
    }
    if (!pctInfo) return null;
    const resetPick = pickResetAt(candidates, kind, nowMs);
    if (resetPick.misbound) return null;
    return {
      pct: pctInfo.pct,
      usedPct: pctInfo.usedPct,
      used: null,
      limit: null,
      resetAt: resetPick.resetAt,
      rawResetText: ""
    };
  }
  function strictPoolKindFromLabel(label) {
    if (typeof label !== "string") return null;
    const upper = label.trim().toUpperCase();
    if (!/^GXU_[A-Z0-9_]{2,}$/.test(upper)) return null;
    if (/(WEEK|7D|604800)/.test(upper)) return "weekly";
    if (/(FIVE_HOURLY|5H|HOUR|18000)/.test(upper)) return "fiveHour";
    return null;
  }
  function collectStructuredPools(rootData, nowMs) {
    const found = { fiveHour: null, weekly: null };
    let hits = 0;
    const record = (kind, candidate) => {
      if (found[kind]) return;
      const clean = sanitizeMetric(
        { ...candidate, confidence: CONFIDENCE.pools },
        kind,
        nowMs
      );
      if (!clean) return;
      found[kind] = clean;
      hits += 1;
    };
    const walk = (node, depth) => {
      if (!node || depth > 20) return;
      if (typeof node === "string") {
        const trimmed = node.trim();
        if (trimmed.startsWith("[") && trimmed.endsWith("]") || trimmed.startsWith("{") && trimmed.endsWith("}")) {
          try {
            walk(JSON.parse(trimmed), depth + 1);
          } catch {
          }
        }
        return;
      }
      if (Array.isArray(node)) {
        const labels = /* @__PURE__ */ new Set();
        for (const item of flattenShallow(node)) {
          const kind = strictPoolKindFromLabel(item);
          if (kind) labels.add(kind);
        }
        if (labels.size === 1) {
          const kind = [...labels][0];
          if (kind) {
            const metric = readMetricFromArrayTuple(node, kind, nowMs);
            if (metric) record(kind, metric);
          }
        }
        for (const child of node) walk(child, depth + 1);
        return;
      }
      if (isRecord2(node)) {
        const kind = poolKindFromRecord(node);
        if (kind) {
          const metric = readMetricFromRecord(node, kind, nowMs);
          if (metric) record(kind, metric);
        }
        for (const child of Object.values(node)) walk(child, depth + 1);
      }
    };
    walk(rootData, 0);
    return hits > 0 ? found : null;
  }
  function collectQuotaByLabels(rootData, nowMs) {
    let found5h = null;
    let found7d = null;
    const walk = (node, depth = 0) => {
      if (depth > 16 || !node) return;
      if (typeof node === "string") {
        const trimmed = node.trim();
        if (trimmed.startsWith("[") && trimmed.endsWith("]") || trimmed.startsWith("{") && trimmed.endsWith("}")) {
          try {
            walk(JSON.parse(trimmed), depth + 1);
          } catch {
          }
        }
        return;
      }
      if (Array.isArray(node)) {
        const flatStrings = node.filter((x) => typeof x === "string").join(" ");
        const has5hLabel = /(?:5\s*-?\s*(?:hour|hr|h|小时|小時|時間)|five\s*-?\s*hour|hourly|per\s*hour|每小时|每小時|current\s*session|当前会话|会话|セッション)/i.test(
          flatStrings
        ) || node.includes(18e3) || node.includes("18000");
        const has7dLabel = /(?:7\s*-?\s*(?:day|d|天|日)|week(?:ly)?|每周|每週|週間)/i.test(flatStrings) || node.includes(604800) || node.includes("604800");
        if (has5hLabel !== has7dLabel) {
          const kind = has5hLabel ? "fiveHour" : "weekly";
          const existing = kind === "fiveHour" ? found5h : found7d;
          if (!existing) {
            const metric = readMetricFromArrayTuple(node, kind, nowMs);
            const clean = metric ? sanitizeMetric(
              { ...metric, confidence: CONFIDENCE.heuristic },
              kind,
              nowMs
            ) : null;
            if (clean) {
              if (kind === "fiveHour") found5h = clean;
              else found7d = clean;
            }
          }
        }
        for (const child of node) walk(child, depth + 1);
        return;
      }
      if (isRecord2(node)) {
        const kind = poolKindFromRecord(node);
        if (kind) {
          const existing = kind === "fiveHour" ? found5h : found7d;
          if (!existing) {
            const metric = readMetricFromRecord(node, kind, nowMs);
            const clean = metric ? sanitizeMetric(
              { ...metric, confidence: CONFIDENCE.heuristic },
              kind,
              nowMs
            ) : null;
            if (clean) {
              if (kind === "fiveHour") found5h = clean;
              else found7d = clean;
            }
          }
        }
        for (const child of Object.values(node)) walk(child, depth + 1);
      }
    };
    walk(rootData, 0);
    if (!found5h && !found7d) return null;
    return { fiveHour: found5h, weekly: found7d };
  }
  function extractQuotaFromWizStructure(rootData, nowMs = Date.now(), options = {}) {
    if (!rootData || typeof rootData !== "object") return null;
    const structured = collectStructuredPools(rootData, nowMs);
    const labeled = options.useLabels === false ? null : collectQuotaByLabels(rootData, nowMs);
    if (!structured && !labeled) return null;
    return {
      timestamp: nowMs,
      fiveHour: structured && structured.fiveHour || labeled && labeled.fiveHour || null,
      weekly: structured && structured.weekly || labeled && labeled.weekly || null,
      strategy: structured ? "pools" : "labels"
    };
  }

  // scripts/gemini-quota-capsule/src/core/cache.ts
  function isRecord3(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function officialCacheKey() {
    return `${STORAGE_KEY_OFFICIAL_CACHE}:${getAccountPrefix() || "default"}`;
  }
  function commitOfficialQuota(extracted, sourceTag, saveStorage = true) {
    if (!extracted) return false;
    const nowMs = Date.now();
    const fromCache = sourceTag === "cache";
    const applyMetric = (kind, incoming) => {
      const clean = sanitizeMetric(incoming, kind, nowMs);
      if (!clean) return false;
      const prev = quotaState[kind];
      const prevFresh = prev.pct !== null && prev.updatedAt > 0 && nowMs - prev.updatedAt < FRESH_MS;
      if (prevFresh && clean.confidence < (prev.confidence || 0)) return false;
      const resetAt = clean.resetAt !== null ? clean.resetAt : prev.resetAt && prev.resetAt > nowMs ? prev.resetAt : null;
      quotaState[kind] = {
        ...clean,
        resetAt,
        rawResetText: clean.rawResetText || (resetAt ? prev.rawResetText : ""),
        updatedAt: fromCache ? 0 : nowMs
      };
      return true;
    };
    const ok5h = applyMetric("fiveHour", extracted.fiveHour);
    const ok7d = applyMetric("weekly", extracted.weekly);
    if (!ok5h && !ok7d) return false;
    quotaState.source = sourceTag;
    quotaState.lastSyncTime = extracted.timestamp || nowMs;
    if (!fromCache) quotaState.lastError = "";
    if (saveStorage) {
      try {
        const payload = {
          timestamp: quotaState.lastSyncTime,
          source: sourceTag,
          fiveHour: quotaState.fiveHour,
          weekly: quotaState.weekly
        };
        localStorage.setItem(officialCacheKey(), JSON.stringify(payload));
      } catch {
      }
    }
    requestUiUpdate();
    return true;
  }
  function restoreCachedOfficialQuota() {
    try {
      const raw = localStorage.getItem(officialCacheKey());
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!isRecord3(parsed)) return;
      const hasLiveData = quotaState.source !== "cache" && (quotaState.fiveHour.pct !== null || quotaState.weekly.pct !== null);
      const parsedTimestamp = Number(parsed["timestamp"] || 0);
      if (hasLiveData && quotaState.lastSyncTime >= parsedTimestamp) return;
      const now = Date.now();
      const cacheAge = now - parsedTimestamp;
      if (!Number.isFinite(cacheAge) || cacheAge < 0 || cacheAge > MAX_CACHE_AGE_MS) {
        return;
      }
      const restoreMetric = (metric, kind) => {
        const windowMs = kind === "fiveHour" ? FIVE_HOUR_MS : WEEK_MS;
        const record = isRecord3(metric) ? metric : null;
        const rawResetAt = record ? toEpochMs(record["resetAt"], now) : null;
        if (rawResetAt !== null && rawResetAt - now > windowMs + RESET_SLACK_MS) {
          return null;
        }
        const clean = sanitizeMetric(metric, kind, now);
        if (!clean) return null;
        if (clean.resetAt !== null && clean.resetAt <= now) {
          clean.pct = null;
          clean.usedPct = null;
          clean.used = null;
          clean.limit = null;
          clean.resetAt = null;
          clean.rawResetText = "";
        }
        clean.updatedAt = 0;
        return clean;
      };
      const fiveHourRecord = parsed["fiveHour"];
      const weeklyRecord = parsed["weekly"];
      const fiveHourRaw = isRecord3(fiveHourRecord) ? { confidence: 0, ...fiveHourRecord } : null;
      const weeklyRaw = isRecord3(weeklyRecord) ? { confidence: 0, ...weeklyRecord } : null;
      const fiveHour = restoreMetric(fiveHourRaw, "fiveHour");
      const weekly = restoreMetric(weeklyRaw, "weekly");
      if (!fiveHour && !weekly) return;
      commitOfficialQuota(
        {
          timestamp: parsedTimestamp,
          fiveHour,
          weekly,
          strategy: "cache"
        },
        "cache",
        false
      );
      quotaState.lastSyncTime = parsedTimestamp;
    } catch {
    }
  }

  // scripts/gemini-quota-capsule/src/core/constants.ts
  var USAGE_RPC_ID = "jSf9Qc";
  var USAGE_RPC_ARGS = "[]";
  var RPC_TIMEOUT_MS = 12e3;

  // scripts/gemini-quota-capsule/src/core/diagnostics.ts
  var RAW_FRAME_LIMIT = 6;
  var RAW_FRAME_MAX_CHARS = 24e3;
  var rawFrameRing = [];
  var RESPONSE_RING_LIMIT = 8;
  var RESPONSE_MAX_CHARS = 12e3;
  var responseRing = [];
  var obsDiag = {
    batchExecSeen: 0,
    batchFrames: 0,
    quotaHits: 0,
    lastRpcIds: [],
    nonQuotaResponses: 0,
    responseReadFailures: 0
  };
  var NET_RING_LIMIT = 24;
  var netRing = [];
  var NET_INTEREST_RE = /(batchexecute|usage|quota|limit|entitle|billing|gxu|tier)/i;
  function safeDiagnosticUrl(url, maxLength = 180) {
    if (typeof url !== "string") return "";
    try {
      const parsed = new URL(url, window.location.href);
      const rpcids = parsed.searchParams.get("rpcids");
      const safeQuery = rpcids ? `?rpcids=${encodeURIComponent(rpcids)}` : "";
      const safe = `${parsed.origin}${parsed.pathname}${safeQuery}`;
      return safe.length > maxLength ? `${safe.slice(0, maxLength)}…` : safe;
    } catch {
      const safe = url.split(/[?#]/, 1)[0] ?? "";
      return safe.length > maxLength ? `${safe.slice(0, maxLength)}…` : safe;
    }
  }
  function shortenUrl(url) {
    if (typeof url !== "string") return "";
    try {
      const parsed = new URL(url, window.location.href);
      const rpcids = parsed.searchParams.get("rpcids");
      const safeQuery = rpcids ? `?rpcids=${encodeURIComponent(rpcids)}` : "";
      const safe = `${parsed.origin}${parsed.pathname}${safeQuery}`;
      return safe.length > 140 ? `${safe.slice(0, 140)}…` : safe;
    } catch {
      const safe = url.split(/[?#]/, 1)[0] ?? "";
      return safe.length > 140 ? `${safe.slice(0, 140)}…` : safe;
    }
  }
  function noteNetwork(url, status, len) {
    try {
      const text = typeof url === "string" ? url : "";
      if (!text || !NET_INTEREST_RE.test(text)) return;
      netRing.push({ at: (/* @__PURE__ */ new Date()).toISOString(), url: safeDiagnosticUrl(text), status, len });
      while (netRing.length > NET_RING_LIMIT) netRing.shift();
    } catch {
    }
  }
  function noteDiag(rpcId) {
    obsDiag.batchFrames += 1;
    if (rpcId && !obsDiag.lastRpcIds.includes(rpcId)) {
      obsDiag.lastRpcIds.push(rpcId);
      if (obsDiag.lastRpcIds.length > 12) obsDiag.lastRpcIds.shift();
    }
  }
  function rememberRawFrame(url, rpcId, payload) {
    try {
      const text = JSON.stringify(payload);
      if (!/GXU_|percentage|percentUsed|usage|quota|18000|604800|windowRefresh/i.test(text)) {
        return;
      }
      rawFrameRing.push({
        url: safeDiagnosticUrl(url),
        rpcId,
        at: (/* @__PURE__ */ new Date()).toISOString(),
        size: text.length,
        payload: text.length > RAW_FRAME_MAX_CHARS ? `${text.slice(0, RAW_FRAME_MAX_CHARS)}…` : text
      });
      while (rawFrameRing.length > RAW_FRAME_LIMIT) rawFrameRing.shift();
    } catch {
    }
  }
  function rememberBatchResponse(url, text, frames) {
    if (typeof text !== "string") return;
    const safeText = text.length <= RESPONSE_MAX_CHARS ? text : `${text.slice(0, RESPONSE_MAX_CHARS / 2)}…${text.slice(-RESPONSE_MAX_CHARS / 2)}`;
    responseRing.push({
      at: (/* @__PURE__ */ new Date()).toISOString(),
      url: safeDiagnosticUrl(url),
      size: text.length,
      frameCount: frames.length,
      rpcIds: frames.map((frame) => frame.rpcId).slice(0, 12),
      text: safeText
    });
    while (responseRing.length > RESPONSE_RING_LIMIT) responseRing.shift();
  }
  var SNIPPET_LIMIT = 12;
  var SNIPPET_RADIUS_BEFORE = 90;
  var SNIPPET_RADIUS_AFTER = 110;
  var snippetRing = [];
  var QUOTA_HINT_RE = /(quota|rate.?limit|usage.?limit|remaining|percentUsed|percentage|reset|GXU_|限额|限額|额度|額度|用量|剩余|剩餘|已用|重置)/i;
  function rememberQuotaSnippets(kind, rpcId, url, text) {
    if (typeof text !== "string" || text.length < 8) return;
    const seen = new Set(snippetRing.map((item) => item.text));
    const re = new RegExp(QUOTA_HINT_RE.source, "gi");
    let match;
    let added = 0;
    while ((match = re.exec(text)) !== null && added < 2) {
      const start = Math.max(0, match.index - SNIPPET_RADIUS_BEFORE);
      const end = Math.min(text.length, match.index + SNIPPET_RADIUS_AFTER);
      const snippet = text.slice(start, end).replace(/\s+/g, " ").trim();
      if (!snippet || seen.has(snippet)) continue;
      seen.add(snippet);
      snippetRing.push({
        at: (/* @__PURE__ */ new Date()).toISOString(),
        kind,
        rpcId: rpcId || null,
        url: shortenUrl(url),
        size: text.length,
        text: snippet
      });
      while (snippetRing.length > SNIPPET_LIMIT) snippetRing.shift();
      added += 1;
    }
  }
  function collectProgressbarHints() {
    const out = [];
    try {
      const nodes = document.querySelectorAll("[role='progressbar'], progress, [aria-valuenow]");
      for (const node of Array.from(nodes).slice(0, 10)) {
        const attrNow = node.getAttribute("aria-valuenow");
        const attrMax = node.getAttribute("aria-valuemax");
        let cardText = "";
        try {
          const card = node.closest("section, article, li, tr, div");
          cardText = card ? (readInnerText(card) || card.textContent || "").trim() : "";
        } catch {
          cardText = "";
        }
        const valueProperty = Reflect.get(node, "value");
        const maxProperty = Reflect.get(node, "max");
        out.push({
          tag: String(node.tagName || "").toLowerCase(),
          now: attrNow !== null ? attrNow : valueProperty !== void 0 ? valueProperty : null,
          max: attrMax !== null ? attrMax : maxProperty !== void 0 ? maxProperty : null,
          label: (node.getAttribute("aria-valuetext") || node.getAttribute("aria-label") || readInnerText(node)).replace(/\s+/g, " ").slice(0, 80),
          card: cardText.replace(/\s+/g, " ").slice(0, 140)
        });
      }
    } catch {
    }
    return out;
  }
  function collectQuotaDomHints() {
    const hints = [];
    try {
      const body = document.body;
      const text = body ? readInnerText(body) || body.textContent || "" : "";
      const lines = text.split(/\n+/);
      const seen = /* @__PURE__ */ new Set();
      for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.length > 160) continue;
        if (!QUOTA_HINT_RE.test(line)) continue;
        if (seen.has(line)) continue;
        seen.add(line);
        hints.push(line);
        if (hints.length >= 8) break;
      }
    } catch {
    }
    return hints;
  }
  function readInnerText(node) {
    const innerText = Reflect.get(node, "innerText");
    return typeof innerText === "string" ? innerText : "";
  }

  // scripts/gemini-quota-capsule/src/core/format.ts
  function formatCompactCountdown(ms, isWeekly = false) {
    if (ms <= 0) return "00:00";
    const totalSec = Math.floor(ms / 1e3);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor(totalSec % 86400 / 3600);
    const minutes = Math.floor(totalSec % 3600 / 60);
    const seconds = totalSec % 60;
    const pad = (n) => String(n).padStart(2, "0");
    if (days > 0) return `${days}d ${pad(hours)}h`;
    if (isWeekly && hours > 0) return `${hours}h ${pad(minutes)}m`;
    if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    return `${pad(minutes)}:${pad(seconds)}`;
  }
  function formatRemainingHuman(ms) {
    if (ms <= 0) return "已到期";
    const totalMin = Math.floor(ms / 6e4);
    const days = Math.floor(totalMin / 1440);
    const hours = Math.floor(totalMin % 1440 / 60);
    const minutes = totalMin % 60;
    if (days > 0) return `${days} 天 ${hours} 小时`;
    if (hours > 0) return `${hours} 小时 ${minutes} 分`;
    if (minutes > 0) return `${minutes} 分`;
    return "不足 1 分";
  }
  function formatTooltip(label, metric) {
    if (!metric || metric.pct === null) {
      return `${label}: 等待从官方同步数据...`;
    }
    const usedPct = typeof metric.usedPct === "number" && Number.isFinite(metric.usedPct) ? metric.usedPct : 100 - metric.pct;
    const lines = [`${label} 已用: ${usedPct}% (剩余 ${metric.pct}%)`];
    if (metric.used !== null && metric.limit !== null) {
      lines.push(`频次用量: ${metric.used} / ${metric.limit}`);
    }
    const nowMs = Date.now();
    if (metric.resetAt && metric.resetAt > nowMs) {
      const dt = new Date(metric.resetAt);
      const pad = (n) => String(n).padStart(2, "0");
      lines.push(
        `官方重置时间: ${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`
      );
      lines.push(`距重置剩余: ${formatRemainingHuman(metric.resetAt - nowMs)}`);
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

  // scripts/gemini-quota-capsule/src/core/orig.ts
  var origFetch = window.fetch;
  var origXhrOpen = XMLHttpRequest.prototype.open;
  var origXhrSend = XMLHttpRequest.prototype.send;

  // scripts/gemini-quota-capsule/src/core/rpc.ts
  var usageSyncDiag = {
    rpcError: "",
    helperError: ""
  };
  function isRecord4(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function readWizGlobalData() {
    const value = Reflect.get(window, "WIZ_global_data");
    return isRecord4(value) ? value : null;
  }
  function parseUsageRpcPayload(payload, nowMs = Date.now()) {
    if (!Array.isArray(payload) || !Array.isArray(payload[1])) return null;
    const result = {
      timestamp: nowMs,
      fiveHour: null,
      weekly: null
    };
    for (const row of payload[1]) {
      if (!Array.isArray(row)) continue;
      const fraction = row[1];
      const period = row[2];
      const resets = row[3];
      const kind = period === 1 ? "fiveHour" : period === 2 ? "weekly" : null;
      if (kind === null) continue;
      if (result[kind] !== null) continue;
      if (typeof fraction !== "number" || !Number.isFinite(fraction) || fraction < 0) {
        continue;
      }
      if (!Array.isArray(resets) || !Array.isArray(resets[0])) continue;
      const seconds = resets[0][0];
      const rawNanos = resets[0].length > 1 ? resets[0][1] : 0;
      if (!Number.isSafeInteger(seconds) || !Number.isInteger(rawNanos) || typeof rawNanos !== "number" || rawNanos < 0 || rawNanos >= 1e9) {
        continue;
      }
      if (typeof seconds !== "number") continue;
      const resetAt = toEpochMs(
        seconds * 1e3 + Math.floor(rawNanos / 1e6),
        nowMs
      );
      if (resetAt === null) continue;
      const usedPct = Math.min(100, Math.max(0, Math.round(fraction * 100)));
      result[kind] = sanitizeMetric(
        { pct: 100 - usedPct, usedPct, resetAt, confidence: CONFIDENCE.pools },
        kind,
        nowMs
      );
    }
    return result.fiveHour !== null || result.weekly !== null ? result : null;
  }
  function buildOfficialUsageRequest() {
    const wiz = readWizGlobalData();
    if (!wiz) return null;
    const token = wiz["SNlM0e"];
    if (typeof token !== "string" || token.length === 0) return null;
    const rpcId = USAGE_RPC_ID;
    const args = USAGE_RPC_ARGS;
    const prefix = discoverAccountPrefix();
    if (!prefix) return null;
    const url = new URL(
      prefix + "/_/BardChatUi/data/batchexecute",
      window.location.origin
    );
    const params = /* @__PURE__ */ new Map([
      ["rpcids", rpcId],
      ["source-path", prefix + "/usage"],
      ["hl", "en"],
      ["_reqid", String(Date.now() % 9e5 + 1e5)],
      ["rt", "c"]
    ]);
    const bl = wiz["cfb2h"];
    if (typeof bl === "string") params.set("bl", bl);
    const fsid = wiz["FdrFJe"];
    if (typeof fsid === "string") params.set("f.sid", fsid);
    for (const [key, value] of params) url.searchParams.set(key, value);
    const body = new URLSearchParams({
      "f.req": JSON.stringify([[[rpcId, args, null, "generic"]]]),
      at: token
    }).toString();
    return { url: url.href, body, prefix, rpcId };
  }
  async function postUsageRpc(url, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
    try {
      const response = await origFetch.call(window, url, {
        method: "POST",
        credentials: "include",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "X-Same-Domain": "1"
        },
        body
      });
      if (!response.ok) {
        throw new Error("官方用量请求失败 (HTTP " + response.status + ")");
      }
      if (response.redirected === true) {
        throw new Error("官方用量请求发生重定向，已忽略响应");
      }
      return parseBatchExecuteResponse(await response.text());
    } finally {
      clearTimeout(timeout);
    }
  }
  async function requestOfficialUsageRpc() {
    const request = buildOfficialUsageRequest();
    if (request === null) {
      usageSyncDiag.rpcError = "官方页面登录参数尚未就绪";
      quotaState.lastError = "官方页面登录参数尚未就绪，将自动重试";
      return false;
    }
    try {
      const frames = await postUsageRpc(request.url, request.body);
      const currentPrefix = getAccountPrefix();
      if (currentPrefix !== request.prefix) {
        throw new Error("账号已变化，已忽略旧账号响应");
      }
      for (const frame of frames) {
        if (frame.rpcId !== request.rpcId) continue;
        const parsed = parseUsageRpcPayload(frame.payload);
        if (parsed !== null && commitOfficialQuota(parsed, "rpc", true)) {
          usageSyncDiag.rpcError = "";
          return true;
        }
      }
      usageSyncDiag.rpcError = "响应未包含可验证的用量字段";
      quotaState.lastError = "官方响应未包含可验证的用量字段，将自动重试";
    } catch (error) {
      usageSyncDiag.rpcError = error instanceof Error ? error.message : "官方用量请求失败";
      quotaState.lastError = usageSyncDiag.rpcError;
    }
    return false;
  }
  async function replayCapturedQuotaRpc() {
    const captured = quotaState.capturedQuotaRpc;
    if (!captured || captured.rpcId !== USAGE_RPC_ID || typeof captured.url !== "string" || typeof captured.body !== "string") {
      return false;
    }
    const prefix = discoverAccountPrefix();
    if (!prefix) return false;
    try {
      const url = new URL(captured.url, window.location.origin);
      if (url.origin !== window.location.origin) return false;
      const pathPrefix = url.pathname.match(/^(\/u\/\d+)\//);
      if (!pathPrefix || pathPrefix[1] !== prefix) return false;
      const body = new URLSearchParams(captured.body);
      const wiz = readWizGlobalData();
      const token = wiz ? wiz["SNlM0e"] : null;
      if (typeof token === "string" && token.length > 0 && body.has("at")) {
        body.set("at", token);
      }
      const response = await origFetch.call(window, url.href, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "X-Same-Domain": "1"
        },
        body: body.toString()
      });
      if (!response.ok || response.redirected === true) return false;
      const frames = parseBatchExecuteResponse(await response.text());
      if (getAccountPrefix() !== prefix) return false;
      for (const frame of frames) {
        if (frame.rpcId !== USAGE_RPC_ID) continue;
        const parsed = parseUsageRpcPayload(frame.payload);
        if (parsed !== null && commitOfficialQuota(parsed, "rpc", true)) {
          usageSyncDiag.rpcError = "";
          return true;
        }
      }
    } catch {
    }
    return false;
  }

  // scripts/gemini-quota-capsule/src/core/runtime.ts
  var syncTrigger = null;
  function setSyncTrigger(trigger) {
    syncTrigger = trigger;
  }
  function triggerOfficialSync(isManualClick) {
    if (!syncTrigger) return Promise.resolve(false);
    return syncTrigger(isManualClick);
  }

  // scripts/gemini-quota-capsule/src/core/network.ts
  var responseCompleteTimer = null;
  function scheduleSyncAfterResponse() {
    if (responseCompleteTimer) clearTimeout(responseCompleteTimer);
    responseCompleteTimer = setTimeout(() => {
      responseCompleteTimer = null;
      void triggerOfficialSync(false);
    }, 1800);
  }
  function inspectNetworkTraffic(url, reqBody, responseText) {
    if (!url) return;
    if (url.includes("StreamGenerateContent") || url.includes("assistant.vertical.chat")) {
      rememberQuotaSnippets("chat", null, url, responseText);
      scheduleSyncAfterResponse();
      return;
    }
    if (!url.includes("/batchexecute") || !responseText) return;
    obsDiag.batchExecSeen += 1;
    const frames = parseBatchExecuteResponse(responseText);
    rememberBatchResponse(url, responseText, frames);
    if (frames.length === 0) obsDiag.responseReadFailures += 1;
    for (const frame of frames) {
      noteDiag(frame.rpcId);
      rememberRawFrame(url, frame.rpcId, frame.payload);
      try {
        rememberQuotaSnippets(
          "rpc",
          frame.rpcId,
          url,
          JSON.stringify(frame.payload)
        );
      } catch {
      }
      const extracted = frame.rpcId === USAGE_RPC_ID ? parseUsageRpcPayload(frame.payload) : extractQuotaFromWizStructure(frame.payload, Date.now(), {
        useLabels: false
      });
      if (!extracted) {
        obsDiag.nonQuotaResponses += 1;
        continue;
      }
      obsDiag.quotaHits += 1;
      if (reqBody) {
        quotaState.capturedQuotaRpc = {
          url,
          body: reqBody,
          rpcId: frame.rpcId
        };
      }
      commitOfficialQuota(extracted, "rpc", true);
    }
  }
  function readFetchUrl(input) {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    if (typeof input === "object" && input !== null) {
      const value = Reflect.get(input, "url");
      if (typeof value === "string") return value;
    }
    return "";
  }
  function installNetworkObserver() {
    window.fetch = async function(input, init) {
      const url = readFetchUrl(input);
      noteAccountPrefix(url);
      const body = init ? init.body : null;
      const reqBody = typeof body === "string" ? body : "";
      const response = await origFetch.call(this, input, init);
      try {
        noteNetwork(url, response.status, 0);
        if (url.includes("/batchexecute") || url.includes("StreamGenerateContent") || url.includes("assistant.vertical.chat")) {
          const cloned = response.clone();
          cloned.text().then((text) => inspectNetworkTraffic(url, reqBody, text)).catch(() => {
          });
        }
      } catch {
      }
      return response;
    };
    const requestUrls = /* @__PURE__ */ new WeakMap();
    XMLHttpRequest.prototype.open = function(method, url, async, username, password) {
      const targetUrl = typeof url === "string" ? url : String(url);
      requestUrls.set(this, targetUrl);
      noteAccountPrefix(targetUrl);
      Reflect.apply(origXhrOpen, this, [method, url, async, username, password]);
    };
    XMLHttpRequest.prototype.send = function(body) {
      const url = requestUrls.get(this) ?? "";
      if (url.includes("/batchexecute") || url.includes("StreamGenerateContent") || url.includes("assistant.vertical.chat")) {
        const reqBody = typeof body === "string" ? body : "";
        this.addEventListener("load", () => {
          try {
            const responseText = this.responseText;
            noteNetwork(
              url,
              this.status,
              typeof responseText === "string" ? responseText.length : 0
            );
            if (typeof responseText === "string" && responseText.length > 0) {
              inspectNetworkTraffic(url, reqBody, responseText);
            }
          } catch {
          }
        });
      }
      Reflect.apply(origXhrSend, this, [body]);
    };
  }

  // scripts/gemini-quota-capsule/src/core/parsing.ts
  function extractMetricFromCardText(cardText, windowType, nowMs, options = {}) {
    if (!cardText || typeof cardText !== "string") return null;
    let pctInfo = pctFromTextWithContext(cardText, {
      allowBare: options.allowBare !== false
    });
    let used = null;
    let limit = null;
    if (!pctInfo) {
      const ratioMatch = cardText.match(/(\d+(?:\.\d+)?)\s*(?:\/|of|共|之)\s*(\d+(?:\.\d+)?)/i);
      if (ratioMatch) {
        const usedText = ratioMatch[1];
        const limitText = ratioMatch[2];
        if (usedText === void 0 || limitText === void 0) return null;
        const usedValue = parseFloat(usedText);
        const limitValue = parseFloat(limitText);
        if (limitValue > 0 && usedValue >= 0 && usedValue <= limitValue) {
          used = usedValue;
          limit = limitValue;
          const usedPct = Math.min(100, Math.max(0, Math.round(usedValue / limitValue * 100)));
          pctInfo = { pct: 100 - usedPct, usedPct };
        }
      } else if (/(?:已达上限|已用尽|配额耗尽|limit\s*reached|quota\s*exceeded|exhausted)/i.test(cardText)) {
        pctInfo = { pct: 0, usedPct: 100 };
      }
    }
    if (!pctInfo) return null;
    const cleanHeaderPattern = windowType === "5h" ? /^(?:5\s*-?\s*(?:hour|hr|h|小时|小時|時間)|five\s*-?\s*hour|current\s*session|session|当前会话|会话)[\s:：\-—]*/i : /^(?:7\s*-?\s*(?:day|d|天|日)|week(?:ly)?|每周|每週|週間)[\s:：\-—]*/i;
    const lines = cardText.split(/[\r\n]+/).map((line) => line.trim()).filter(Boolean);
    let resetAt = null;
    let rawResetText = "";
    for (const line of lines) {
      if (/(?:reset|重置|刷新|恢复|剩余|後|あと|available|可用|将于|將於)/i.test(line)) {
        let ts = parseOfficialResetTextToTimestamp(line, nowMs);
        if (!ts) {
          const strippedLine = line.replace(cleanHeaderPattern, "");
          ts = parseOfficialResetTextToTimestamp(strippedLine, nowMs);
        }
        if (ts) {
          resetAt = ts;
          rawResetText = line;
          break;
        }
      }
    }
    if (!resetAt) {
      resetAt = parseOfficialResetTextToTimestamp(cardText, nowMs);
    }
    return {
      pct: pctInfo.pct,
      usedPct: pctInfo.usedPct,
      used,
      limit,
      resetAt,
      rawResetText
    };
  }
  function parseOfficialUsageText(text, nowMs = Date.now()) {
    if (typeof text !== "string" || !text.trim()) return null;
    const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
    const sections = { fiveHour: [], weekly: [] };
    let current = null;
    for (const line of lines) {
      if (/^current\s+usage$/i.test(line)) {
        current = "fiveHour";
        continue;
      }
      if (/^weekly\s+limit$/i.test(line)) {
        current = "weekly";
        continue;
      }
      if (/^(?:usage\s+limits|pro|your plan|learn more|updated)/i.test(line)) {
        continue;
      }
      if (current) {
        sections[current].push(line);
      }
    }
    const parseSection = (section, windowType) => {
      if (!section.length) return null;
      return extractMetricFromCardText(section.join("\n"), windowType, nowMs, {
        allowBare: false
      });
    };
    const fiveHour = parseSection(sections.fiveHour, "5h");
    const weekly = parseSection(sections.weekly, "7d");
    if (!fiveHour && !weekly) return null;
    return { timestamp: nowMs, fiveHour, weekly, strategy: "usage-text" };
  }
  function scanBalancedArray(text, start) {
    let depth = 0;
    let quote = "";
    let escaped = false;
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i];
      if (quote) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === quote) {
          quote = "";
        }
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        continue;
      }
      if (ch === "[") {
        depth += 1;
      } else if (ch === "]") {
        depth -= 1;
        if (depth === 0) return i;
      }
    }
    return -1;
  }
  function extractInitDataBlocks(html, limit = 40) {
    if (typeof html !== "string" || !html) return [];
    const marker = "AF_initDataCallback(";
    const blocks = [];
    let cursor = 0;
    while (blocks.length < limit) {
      const at = html.indexOf(marker, cursor);
      if (at === -1) break;
      cursor = at + marker.length;
      const dataAt = html.indexOf("data:", cursor);
      if (dataAt === -1 || dataAt - at > 4e3) break;
      const tailStart = dataAt + "data:".length;
      const head = html.slice(tailStart, tailStart + 200);
      const arrLead = head.match(
        /^(?:\s*function\s*\([^)]*\)\s*\{\s*(?:return\s*)?)?\s*\[/
      );
      if (!arrLead) continue;
      const arrStart = tailStart + arrLead[0].length - 1;
      const arrEnd = scanBalancedArray(html, arrStart);
      if (arrEnd === -1) break;
      blocks.push(html.slice(arrStart, arrEnd + 1));
      cursor = arrEnd + 1;
    }
    return blocks;
  }
  function collectProgressbarMetrics(doc, nowMs = Date.now()) {
    const found = { fiveHour: null, weekly: null };
    if (!doc || typeof doc.querySelectorAll !== "function") return found;
    const fiveLabelRe = /(?:5\s*-?\s*(?:hours?|hrs?|h|小时|小時|時間)|five\s*-?\s*hours?|hourly|per\s*hour|current\s*session|当前会话|会话)/i;
    const weekLabelRe = /(?:7\s*-?\s*(?:day|d|天|日)|week(?:ly)?|每周|每週|週間)/i;
    const usedRe = /(?:已用|已使用|使用量|用量|used|usage|consumed|utiliz)/i;
    const remainingRe = /(?:剩余|剩餘|可用|余量|餘量|remaining|available|left)/i;
    const nodes = [];
    const visit = (root) => {
      for (const node of root.querySelectorAll("[role='progressbar'], progress, [aria-valuenow]")) {
        nodes.push(node);
      }
      for (const host of root.querySelectorAll("*")) {
        if (host.shadowRoot) visit(host.shadowRoot);
      }
    };
    visit(doc);
    for (const node of nodes) {
      const rawNow = node.getAttribute("aria-valuenow") ?? readValueProperty(node);
      const rawMax = node.getAttribute("aria-valuemax") ?? readMaxProperty(node) ?? 100;
      const value = Number(rawNow);
      const max = Number(rawMax);
      if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || value < 0) {
        continue;
      }
      const valueText = [
        node.getAttribute("aria-valuetext") || "",
        node.getAttribute("aria-label") || "",
        readInnerText2(node)
      ].join(" ");
      let container = node;
      for (let level = 0; level < 4 && container.parentElement; level += 1) {
        container = container.parentElement;
        const text = readText(container);
        if (text.length >= 4 && text.length <= 500) break;
      }
      const cardText = readText(container);
      const context = `${valueText} ${cardText}`;
      const isFive = fiveLabelRe.test(context);
      const isWeekly = weekLabelRe.test(context);
      if (isFive === isWeekly) continue;
      const kind = isFive ? "fiveHour" : "weekly";
      if (found[kind]) continue;
      const ratio = Math.min(1, Math.max(0, value / max));
      const percentage = Math.round(ratio * 100);
      const direction = remainingRe.test(context) ? "remaining" : usedRe.test(context) ? "used" : null;
      if (!direction || /loading|加载|recent conversations|recent conversation/i.test(context)) {
        continue;
      }
      const usedPct = direction === "used" ? percentage : 100 - percentage;
      const resetAt = parseOfficialResetTextToTimestamp(cardText, nowMs);
      found[kind] = {
        pct: 100 - usedPct,
        usedPct,
        used: null,
        limit: null,
        resetAt,
        rawResetText: resetAt ? cardText : "",
        confidence: CONFIDENCE.dom,
        updatedAt: 0
      };
    }
    return found;
  }
  function readValueProperty(node) {
    const value = Reflect.get(node, "value");
    return typeof value === "number" || typeof value === "string" ? String(value) : null;
  }
  function readMaxProperty(node) {
    const max = Reflect.get(node, "max");
    return typeof max === "number" || typeof max === "string" ? String(max) : null;
  }
  function readInnerText2(node) {
    const innerText = Reflect.get(node, "innerText");
    return typeof innerText === "string" ? innerText : "";
  }
  function readText(node) {
    return (readInnerText2(node) || node.textContent || "").trim();
  }
  function parseHtmlDocument(rawHtml) {
    if (typeof rawHtml !== "string" || !rawHtml) return null;
    let frame = null;
    try {
      frame = document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.setAttribute("tabindex", "-1");
      frame.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;top:-9999px;border:0;";
      const host = document.body || document.documentElement;
      if (!host) return null;
      host.appendChild(frame);
      const frameWindow = frame.contentWindow;
      const parserCtor = frameWindow ? Reflect.get(frameWindow, "DOMParser") : null;
      if (typeof parserCtor !== "function") return null;
      const textFriendly = rawHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ").replace(
        /<\/(?:p|div|h[1-6]|li|tr|td|section|article|main|header|footer|aside|nav)\s*>|<br\s*\/?>/gi,
        (tag) => `${tag}
`
      );
      const parser = new parserCtor();
      return parser.parseFromString(textFriendly, "text/html");
    } catch {
      return null;
    } finally {
      if (frame && frame.parentNode) frame.parentNode.removeChild(frame);
    }
  }
  function parseUsageDocument(doc, rawHtml = "") {
    const nowMs = Date.now();
    let fiveHour = null;
    let weekly = null;
    if (doc && doc.body) {
      const officialText = parseOfficialUsageText(
        doc.body.innerText || doc.body.textContent || "",
        nowMs
      );
      if (officialText) {
        fiveHour = officialText.fiveHour;
        weekly = officialText.weekly;
      }
      const fiveRegex = /(?:5\s*-?\s*(?:hour|hr|h|小时|小時|時間)|five\s*-?\s*hour|hourly|per\s*hour|每小时|每小時|current\s*session|session|当前会话|会话(?:配额|限额|用量)?|セッション)/i;
      const weekRegex = /(?:7\s*-?\s*(?:day|d|天|日)|week(?:ly)?|每周|每週|週間)/i;
      const strictlyWeekRegex = /(?:week(?:ly)?|每周|每週|週間|7\s*-?\s*(?:day|days|天))/i;
      const strictlyFiveRegex = /(?:5\s*-?\s*(?:hour|hours|hr|hrs|h|小时|小時)|five\s*-?\s*hour|hourly|per\s*hour|每小时|每小時|current\s*session|当前会话)/i;
      const blocks = Array.from(
        doc.querySelectorAll(
          "section, article, [role='region'], [class*='card'], [class*='quota'], [class*='usage'], [class*='limit'], div"
        )
      );
      const candidates = { "5h": [], "7d": [] };
      for (const node of blocks) {
        const txt = readText(node);
        if (txt.length < 4 || txt.length > 500) continue;
        const is5h = fiveRegex.test(txt);
        const is7d = weekRegex.test(txt);
        const isStrict7d = strictlyWeekRegex.test(txt);
        if (is5h && !isStrict7d) {
          candidates["5h"].push(txt);
        } else if (is7d && !is5h) {
          candidates["7d"].push(txt);
        }
      }
      const pickShortest = (kind) => {
        const list = candidates[kind].slice().sort((a, b) => a.length - b.length);
        for (const txt of list.slice(0, 5)) {
          const metric = extractMetricFromCardText(txt, kind, nowMs);
          if (metric) return metric;
        }
        return null;
      };
      if (!fiveHour) fiveHour = pickShortest("5h");
      if (!weekly) weekly = pickShortest("7d");
      const progressMetrics = collectProgressbarMetrics(doc, nowMs);
      if (!fiveHour && progressMetrics.fiveHour) fiveHour = progressMetrics.fiveHour;
      if (!weekly && progressMetrics.weekly) weekly = progressMetrics.weekly;
      const fullText = doc.body.innerText || doc.body.textContent || "";
      const sliceUntilNextLabel = (startIdx, stopRegex, maxLen) => {
        const tail = fullText.slice(startIdx, startIdx + maxLen);
        const stop = tail.search(stopRegex);
        return stop > 0 ? tail.slice(0, stop) : tail;
      };
      if (!fiveHour) {
        const idx5 = fullText.search(fiveRegex);
        if (idx5 !== -1) {
          fiveHour = extractMetricFromCardText(
            sliceUntilNextLabel(idx5, strictlyWeekRegex, 400),
            "5h",
            nowMs,
            { allowBare: false }
          );
        }
      }
      if (!weekly) {
        const idx7 = fullText.search(weekRegex);
        if (idx7 !== -1) {
          weekly = extractMetricFromCardText(
            sliceUntilNextLabel(idx7, strictlyFiveRegex, 400),
            "7d",
            nowMs,
            { allowBare: false }
          );
        }
      }
    }
    if (rawHtml && (!fiveHour || !weekly)) {
      const rawBlocks = extractInitDataBlocks(rawHtml);
      usageParseDiag.blocks = rawBlocks.length;
      for (const rawBlock of rawBlocks) {
        try {
          const dataArr = JSON.parse(rawBlock);
          const wizExtracted = extractQuotaFromWizStructure(dataArr, nowMs, {
            useLabels: false
          });
          if (wizExtracted) {
            usageParseDiag.initHit = true;
            if (wizExtracted.fiveHour && !fiveHour) {
              fiveHour = wizExtracted.fiveHour;
            }
            if (wizExtracted.weekly && !weekly) {
              weekly = wizExtracted.weekly;
            }
          }
        } catch {
        }
        if (fiveHour && weekly) break;
      }
    }
    const tagMetric = (metric, kind) => {
      if (!metric) return null;
      const confidence = Math.max(
        typeof metric.confidence === "number" ? metric.confidence : 0,
        CONFIDENCE.dom
      );
      return sanitizeMetric({ ...metric, confidence }, kind, nowMs);
    };
    fiveHour = tagMetric(fiveHour, "fiveHour");
    weekly = tagMetric(weekly, "weekly");
    if (!fiveHour && !weekly) return null;
    return { timestamp: nowMs, fiveHour, weekly, strategy: "dom" };
  }

  // scripts/gemini-quota-capsule/src/core/sync.ts
  var activeSyncPromise = null;
  var probeIframeEl = null;
  var renderedUsageFrameBlockedUntil = 0;
  var pendingUsageHelper = null;
  var nextAutomaticSyncAt = 0;
  var automaticFailureCount = 0;
  var deferredAutomaticSync = null;
  function getPendingUsageHelper() {
    return pendingUsageHelper;
  }
  function getAutomaticFailureCount() {
    return automaticFailureCount;
  }
  function readHelperSyncNonce() {
    try {
      const hash = window.location.hash || "";
      if (!hash.startsWith("#")) return null;
      const params = new URLSearchParams(hash.slice(1));
      const nonce = params.get(HELPER_SYNC_HASH_KEY);
      return typeof nonce === "string" && nonce ? nonce : null;
    } catch {
      return null;
    }
  }
  function buildUsageHelperUrl(nonce, preferredUrl) {
    const base = preferredUrl || getOfficialUsageUrl();
    const url = new URL(base, window.location.origin);
    url.hash = `${HELPER_SYNC_HASH_KEY}=${encodeURIComponent(nonce)}`;
    return url.toString();
  }
  function readSyncBridgePayload(raw) {
    if (typeof raw !== "string" || !raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      if (!("nonce" in parsed)) return null;
      const nonce = parsed.nonce;
      if (typeof nonce !== "string" || !nonce) return null;
      return parsed;
    } catch {
      return null;
    }
  }
  function applyUsageHelperPayload(payload) {
    if (!payload || payload.ok !== true) return false;
    if (!payload.fiveHour && !payload.weekly) return false;
    const committed = commitOfficialQuota(
      {
        timestamp: typeof payload.timestamp === "number" && Number.isFinite(payload.timestamp) ? payload.timestamp : Date.now(),
        fiveHour: payload.fiveHour || null,
        weekly: payload.weekly || null,
        strategy: "usage-text"
      },
      "usage-page",
      false
    );
    if (committed) usageParseDiag.textHit = true;
    return committed;
  }
  function runUsageHelperSync(nonce) {
    const deadline = Date.now() + USAGE_HELPER_TIMEOUT_MS;
    let finished = false;
    let partialResult = null;
    let partialTimer = null;
    let pollId = null;
    const finish = (result, reason) => {
      if (finished) return;
      finished = true;
      if (pollId) clearInterval(pollId);
      if (partialTimer) clearTimeout(partialTimer);
      let payload;
      if (result) {
        result.timestamp = Date.now();
        commitOfficialQuota(result, "usage-page", true);
        payload = {
          nonce,
          ok: true,
          timestamp: result.timestamp,
          fiveHour: result.fiveHour || null,
          weekly: result.weekly || null,
          reason: ""
        };
      } else {
        payload = {
          nonce,
          ok: false,
          timestamp: Date.now(),
          fiveHour: null,
          weekly: null,
          reason: reason || "官方 /usage 页面未返回可解析的用量文本"
        };
      }
      try {
        localStorage.setItem(STORAGE_KEY_SYNC_BRIDGE, JSON.stringify(payload));
      } catch {
      }
      try {
        history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search
        );
      } catch {
      }
      setTimeout(() => {
        try {
          window.close();
        } catch {
        }
      }, 250);
    };
    const attempt = () => {
      if (finished) return;
      if (!document.body) {
        if (Date.now() >= deadline) finish(null, "官方 /usage 页面尚未就绪");
        return;
      }
      const parsed = parseUsageDocument(document, "");
      if (parsed && (parsed.fiveHour || parsed.weekly)) {
        const has5h = parsed.fiveHour && (parsed.fiveHour.pct !== null || parsed.fiveHour.resetAt !== null);
        const has7d = parsed.weekly && (parsed.weekly.pct !== null || parsed.weekly.resetAt !== null);
        if (has5h && has7d) {
          finish(parsed, "");
          return;
        }
        partialResult = parsed;
        if (!partialTimer) {
          partialTimer = setTimeout(() => {
            if (partialResult) finish(partialResult, "");
            else finish(null, "官方 /usage 页面未在限时内给出完整用量");
          }, 1500);
        }
        return;
      }
      if (Date.now() >= deadline) {
        if (partialResult) finish(partialResult, "");
        else finish(null, "官方 /usage 页面未在限时内呈现用量文本");
      }
    };
    document.addEventListener("DOMContentLoaded", attempt, { once: true });
    pollId = setInterval(attempt, 400);
    attempt();
  }
  function reserveUsageHelperWindow() {
    let helperWindow = null;
    try {
      helperWindow = window.open("about:blank", "_blank");
    } catch {
      helperWindow = null;
    }
    if (!helperWindow) return null;
    try {
      helperWindow.blur();
      window.focus();
    } catch {
    }
    return helperWindow;
  }
  function closeUsageHelperWindow(helperWindow) {
    if (!helperWindow) return;
    try {
      if (!helperWindow.closed) helperWindow.close();
    } catch {
    }
  }
  function maybeReserveHelperWindow() {
    if (/\/usage\/?$/.test(window.location.pathname)) return null;
    if (automaticFailureCount <= 0) return null;
    if (Date.now() >= renderedUsageFrameBlockedUntil) return null;
    return reserveUsageHelperWindow();
  }
  function requestUsageHelperSync(preferredUrl, reservedWindow = null) {
    if (pendingUsageHelper && pendingUsageHelper.promise) {
      return pendingUsageHelper.promise;
    }
    const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const helperUrl = buildUsageHelperUrl(nonce, preferredUrl);
    let helperWindow = reservedWindow;
    if (helperWindow) {
      let stillOpen = false;
      try {
        stillOpen = !helperWindow.closed;
      } catch {
        stillOpen = false;
      }
      if (stillOpen) {
        try {
          helperWindow.location.replace(helperUrl);
        } catch {
          closeUsageHelperWindow(helperWindow);
          helperWindow = null;
        }
      } else {
        helperWindow = null;
      }
    }
    if (!helperWindow) {
      try {
        helperWindow = window.open(helperUrl, "_blank");
      } catch {
        helperWindow = null;
      }
    }
    if (!helperWindow) {
      usageParseDiag.helperReason = "浏览器拦截了后台用量页窗口";
      return Promise.resolve({
        ok: false,
        reason: usageParseDiag.helperReason
      });
    }
    usageParseDiag.helperAttempts += 1;
    try {
      helperWindow.blur();
      window.focus();
    } catch {
    }
    const promise = new Promise((resolve) => {
      let settled = false;
      let pollId = null;
      let timer = null;
      let closedCheckScheduled = false;
      const finish = (payload) => {
        if (settled) return;
        settled = true;
        if (pollId) clearInterval(pollId);
        if (timer) clearTimeout(timer);
        if (pendingUsageHelper && pendingUsageHelper.nonce === nonce) {
          pendingUsageHelper = null;
        }
        const ok = payload !== null && payload.ok === true;
        usageParseDiag.helperOK = ok;
        if (payload && typeof payload.reason === "string" && payload.reason) {
          usageParseDiag.helperReason = payload.reason;
        }
        if (!ok) {
          try {
            if (helperWindow && !helperWindow.closed) helperWindow.close();
          } catch {
          }
        }
        resolve(
          payload ? {
            ok,
            reason: typeof payload.reason === "string" ? payload.reason : "",
            timestamp: payload.timestamp,
            fiveHour: payload.fiveHour,
            weekly: payload.weekly
          } : {
            ok: false,
            reason: "后台用量页未返回同步结果"
          }
        );
      };
      const readBridge = () => {
        if (settled) return;
        try {
          const payload = readSyncBridgePayload(
            localStorage.getItem(STORAGE_KEY_SYNC_BRIDGE)
          );
          if (payload && payload.nonce === nonce) finish(payload);
        } catch {
        }
      };
      const helperHandle = {
        nonce,
        finish,
        promise: null,
        window: helperWindow
      };
      pendingUsageHelper = helperHandle;
      pollId = setInterval(() => {
        readBridge();
        if (settled) return;
        let closed = false;
        try {
          closed = helperWindow ? helperWindow.closed : true;
        } catch {
          closed = false;
        }
        if (closed && !closedCheckScheduled) {
          closedCheckScheduled = true;
          setTimeout(() => {
            readBridge();
            if (!settled) {
              finish({
                nonce,
                ok: false,
                reason: "后台用量页已关闭，但没有返回可解析的用量文本"
              });
            }
          }, 500);
        }
      }, 250);
      timer = setTimeout(() => {
        readBridge();
        if (!settled) {
          finish({
            nonce,
            ok: false,
            reason: "后台用量页未在限时内返回用量文本"
          });
        }
      }, USAGE_HELPER_WAIT_MS);
      helperHandle.promise = promise;
    });
    return promise;
  }
  async function probeUsagePage() {
    const origin = window.location.origin;
    const prefix = discoverAccountPrefix();
    const candidates = prefix ? [origin + prefix + "/usage"] : [origin + "/usage"];
    for (const candidateUrl of candidates) {
      let candidatePath = "";
      try {
        candidatePath = new URL(candidateUrl, window.location.href).pathname;
      } catch {
        candidatePath = "";
      }
      if (!candidatePath) continue;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), USAGE_FRAME_TIMEOUT_MS);
      try {
        const response = await origFetch.call(window, candidateUrl, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          signal: controller.signal
        });
        let finalUrl = null;
        try {
          finalUrl = new URL(response.url || candidateUrl, window.location.href);
        } catch {
          finalUrl = null;
        }
        const finalPath = finalUrl ? finalUrl.pathname : "";
        const sameAccount = finalUrl !== null && finalUrl.origin === window.location.origin && isSameUsagePath(finalPath, candidatePath, prefix === "");
        const resolvedPrefixMatch = finalPath.match(/^(\/u\/\d+)(?=\/)/);
        const resolvedPrefix = resolvedPrefixMatch ? resolvedPrefixMatch[1] ?? "" : "";
        quotaState.usagePageStatus = {
          url: shortenUrl(candidateUrl),
          status: response.status,
          finalUrl: shortenUrl(response.url || ""),
          redirected: response.redirected === true,
          missing: response.redirected === true && !/\/usage\/?$/.test(finalPath),
          sameAccount,
          resolvedPrefix,
          // A bare /usage resolves to Google's default account; that attribution
          // is best effort and is not proof of the account shown on this page.
          assumedAccount: sameAccount === true && candidatePath === "/usage" && resolvedPrefix !== ""
        };
        if (!sameAccount) continue;
        noteAccountPrefix(response.url || candidateUrl);
        if (!response.ok) continue;
        const rawHtml = await response.text();
        const doc = parseHtmlDocument(rawHtml);
        if (doc === null) continue;
        const parsed = parseUsageDocument(doc, rawHtml);
        if (parsed === null) continue;
        if (!parsed.fiveHour && !parsed.weekly) continue;
        return { result: parsed, url: candidateUrl };
      } catch {
      } finally {
        clearTimeout(timer);
      }
    }
    return null;
  }
  function readIframeDocument(iframe) {
    try {
      return iframe.contentDocument || iframe.contentWindow && iframe.contentWindow.document || null;
    } catch {
      return null;
    }
  }
  function markUsageFrameUnavailable(reason) {
    usageParseDiag.frameBlocked = true;
    usageParseDiag.frameReason = reason;
    renderedUsageFrameBlockedUntil = Date.now() + USAGE_FRAME_RETRY_COOLDOWN_MS;
  }
  function extractViaSameOriginUsageIframe(usageUrl, timeoutMs = USAGE_FRAME_TIMEOUT_MS) {
    return new Promise((resolve) => {
      if (!document.body) {
        resolve(null);
        return;
      }
      let requestedPath = "";
      try {
        requestedPath = new URL(usageUrl, window.location.href).pathname;
      } catch {
        resolve(null);
        return;
      }
      const allowBareRedirect = requestedPath === "/usage" && getAccountPrefix() === "";
      usageParseDiag.frameAttempts += 1;
      if (probeIframeEl && probeIframeEl.parentNode) {
        probeIframeEl.parentNode.removeChild(probeIframeEl);
      }
      const iframe = document.createElement("iframe");
      iframe.setAttribute("src", usageUrl);
      iframe.setAttribute("aria-hidden", "true");
      iframe.setAttribute("tabindex", "-1");
      iframe.style.cssText = [
        "position:fixed",
        `width:${USAGE_FRAME_WIDTH_PX}px`,
        `height:${USAGE_FRAME_HEIGHT_PX}px`,
        "opacity:0",
        "pointer-events:none",
        "left:-20000px",
        "top:0",
        "border:0",
        "z-index:-1"
      ].join(";");
      probeIframeEl = iframe;
      let finished = false;
      let observer = null;
      let pollId = null;
      let partialTimer = null;
      let blankTimer = null;
      let timeoutId = null;
      let partialResult = null;
      const done = (result, unavailableReason = "") => {
        if (finished) return;
        finished = true;
        if (pollId) clearInterval(pollId);
        if (partialTimer) clearTimeout(partialTimer);
        if (blankTimer) clearTimeout(blankTimer);
        if (timeoutId) clearTimeout(timeoutId);
        if (observer) observer.disconnect();
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        if (probeIframeEl === iframe) probeIframeEl = null;
        if (unavailableReason) markUsageFrameUnavailable(unavailableReason);
        resolve(result);
      };
      const verifyFramePath = (frameDoc) => {
        try {
          const framePath = new URL(frameDoc.URL, window.location.href).pathname;
          if (!isSameUsagePath(framePath, requestedPath, allowBareRedirect)) {
            usageParseDiag.frameRedirected = true;
            done(null, "官方 /usage 页面重定向到了其他账号");
            return false;
          }
          noteAccountPrefix(frameDoc.URL);
          return true;
        } catch {
          usageParseDiag.frameRedirected = true;
          done(null, "官方 /usage 页面地址无法校验");
          return false;
        }
      };
      const tryExtract = () => {
        if (finished) return;
        const frameDoc = readIframeDocument(iframe);
        if (!frameDoc || !frameDoc.body) return;
        if (!frameDoc.URL || frameDoc.URL === "about:blank") return;
        if (!verifyFramePath(frameDoc)) return;
        const text = frameDoc.body.innerText || frameDoc.body.textContent || "";
        usageParseDiag.frameTextLength = Math.max(
          usageParseDiag.frameTextLength,
          text.length
        );
        const parsed = parseUsageDocument(frameDoc, "");
        if (!parsed || !parsed.fiveHour && !parsed.weekly) return;
        usageParseDiag.frameParsed = true;
        const has5h = !!(parsed.fiveHour && (parsed.fiveHour.pct !== null || parsed.fiveHour.resetAt !== null));
        const has7d = !!(parsed.weekly && (parsed.weekly.pct !== null || parsed.weekly.resetAt !== null));
        if (has5h && has7d) {
          done(parsed);
          return;
        }
        partialResult = parsed;
        if (!partialTimer) {
          partialTimer = setTimeout(() => done(partialResult), 1200);
        }
      };
      iframe.addEventListener("load", () => {
        usageParseDiag.frameLoads += 1;
        if (blankTimer) {
          clearTimeout(blankTimer);
          blankTimer = null;
        }
        const frameDoc = readIframeDocument(iframe);
        if (!frameDoc) {
          done(null, "官方 /usage 页面拒绝被同源 iframe 嵌入");
          return;
        }
        if (!frameDoc.URL || frameDoc.URL === "about:blank") {
          blankTimer = setTimeout(() => {
            blankTimer = null;
            const pendingDoc = readIframeDocument(iframe);
            if (!pendingDoc || !pendingDoc.URL || pendingDoc.URL === "about:blank") {
              done(null, "同源 iframe 只拿到了空白文档");
            }
          }, USAGE_FRAME_BLANK_GRACE_MS);
          return;
        }
        if (!verifyFramePath(frameDoc)) return;
        tryExtract();
        try {
          if (frameDoc.body) {
            observer = new MutationObserver(tryExtract);
            observer.observe(frameDoc.body, {
              childList: true,
              subtree: true,
              characterData: true
            });
          }
        } catch {
        }
      });
      iframe.addEventListener("error", () => {
        done(null, "同源 iframe 加载官方 /usage 页面失败");
      });
      document.body.appendChild(iframe);
      pollId = setInterval(tryExtract, 300);
      timeoutId = setTimeout(() => {
        if (partialResult) done(partialResult);
        else {
          usageParseDiag.frameTimeout = true;
          done(null, "官方 /usage 页面未在限时内呈现用量文本");
        }
      }, timeoutMs);
    });
  }
  async function syncOfficialUsage(isManualClick = false) {
    const onUsagePage = /\/usage\/?$/.test(window.location.pathname);
    let manualHelperWindow = null;
    if (activeSyncPromise !== null) {
      if (isManualClick) {
        quotaState.syncPhase = "等待进行中的同步结束";
        requestUiUpdate();
      }
      return activeSyncPromise;
    }
    if (isManualClick) {
      manualHelperWindow = maybeReserveHelperWindow();
    }
    if (!isManualClick && document.visibilityState === "hidden") return false;
    if (!isManualClick && Date.now() < nextAutomaticSyncAt) {
      if (deferredAutomaticSync === null) {
        deferredAutomaticSync = setTimeout(() => {
          deferredAutomaticSync = null;
          void syncOfficialUsage(false);
        }, nextAutomaticSyncAt - Date.now());
      }
      return false;
    }
    if (deferredAutomaticSync !== null) {
      clearTimeout(deferredAutomaticSync);
      deferredAutomaticSync = null;
    }
    quotaState.isSyncing = true;
    quotaState.syncPhase = isManualClick ? "同步官方用量" : "静默同步官方用量";
    quotaState.lastError = "";
    usageSyncDiag.helperError = "";
    requestUiUpdate();
    activeSyncPromise = (async () => {
      let ok = false;
      try {
        if (onUsagePage) {
          ok = commitOfficialQuota(
            parseUsageDocument(document, ""),
            "usage-page",
            true
          );
        }
        if (!ok) ok = await replayCapturedQuotaRpc();
        if (!ok) ok = await requestOfficialUsageRpc();
        if (!ok && !onUsagePage) {
          const probe = await probeUsagePage();
          const probeResult = probe && probe.result;
          if (probeResult && (probeResult.fiveHour || probeResult.weekly) && commitOfficialQuota(probeResult, "usage-page", true)) {
            ok = !!(probeResult.fiveHour && probeResult.weekly);
          }
        }
        const usageUrl = getOfficialUsageUrl();
        if (!ok && Date.now() >= renderedUsageFrameBlockedUntil) {
          const fromIframe = await extractViaSameOriginUsageIframe(usageUrl);
          ok = !!(fromIframe && commitOfficialQuota(fromIframe, "usage-page", true));
        }
        if (!ok && isManualClick && !onUsagePage) {
          quotaState.syncPhase = "后台读取官方 /usage 页面文本";
          requestUiUpdate();
          const helperResult = await requestUsageHelperSync(
            usageUrl,
            manualHelperWindow
          );
          manualHelperWindow = null;
          ok = !!(helperResult && helperResult.ok === true && applyUsageHelperPayload(helperResult));
          if (!ok) {
            usageSyncDiag.helperError = helperResult && typeof helperResult.reason === "string" && helperResult.reason ? helperResult.reason : "后台官方 /usage 页面未返回用量文本";
            quotaState.lastError = usageSyncDiag.helperError;
          }
        }
        return ok;
      } catch (error) {
        quotaState.lastError = error instanceof Error ? error.message : "官方同步失败";
        return false;
      } finally {
        closeUsageHelperWindow(manualHelperWindow);
        automaticFailureCount = ok ? 0 : Math.min(automaticFailureCount + 1, 5);
        nextAutomaticSyncAt = Date.now() + (ok ? AUTO_SYNC_HEARTBEAT_MS : Math.min(
          AUTO_SYNC_INTERVAL_MS,
          AUTO_SYNC_HEARTBEAT_MS * 2 ** automaticFailureCount
        ));
        quotaState.isSyncing = false;
        quotaState.syncPhase = "";
        activeSyncPromise = null;
        requestUiUpdate();
      }
    })();
    return activeSyncPromise;
  }
  setSyncTrigger(syncOfficialUsage);

  // scripts/gemini-quota-capsule/src/storage.ts
  function isRecord5(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function normalizeConfig(parsed) {
    const source = isRecord5(parsed) ? parsed : {};
    const legacyMode = INDICATOR_MODES.some((mode) => mode.key === source["styleMode"]) ? source["styleMode"] : DEFAULT_CONFIG.styleMode;
    const rawIcon = isRecord5(source["icon"]) ? source["icon"] : {};
    const image = typeof rawIcon["image"] === "string" && rawIcon["image"].length <= MAX_IMAGE_DATA_URL_CHARS && /^data:image\/(?:png|jpeg|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/.test(rawIcon["image"]) ? rawIcon["image"] : "";
    const svg = typeof rawIcon["svg"] === "string" && rawIcon["svg"].length <= MAX_SVG_CHARS ? rawIcon["svg"] : "";
    let iconKind = "prism";
    if (isOrnamentPreset(rawIcon["kind"])) {
      iconKind = rawIcon["kind"];
    } else if (rawIcon["kind"] === "image" && image) {
      iconKind = "image";
    } else if (rawIcon["kind"] === "svg" && svg) {
      iconKind = "svg";
    }
    const rawMetrics = isRecord5(source["metrics"]) ? source["metrics"] : {};
    const css = { ...DEFAULT_COMPONENT_CSS };
    const rawCss = isRecord5(source["css"]) ? source["css"] : {};
    for (const target of CSS_TARGETS) {
      const value = rawCss[target.key];
      if (isSafeCssText(value)) {
        css[target.key] = value;
      }
    }
    const rawPos = isRecord5(source["pos"]) ? source["pos"] : {};
    const resolvedStyleMode = isProgressMode(legacyMode) && legacyMode !== "none" ? legacyMode : DEFAULT_CONFIG.styleMode;
    return {
      styleMode: resolvedStyleMode,
      pos: {
        right: typeof rawPos["right"] === "number" ? rawPos["right"] : DEFAULT_CONFIG.pos.right,
        bottom: typeof rawPos["bottom"] === "number" ? rawPos["bottom"] : DEFAULT_CONFIG.pos.bottom
      },
      icon: { kind: iconKind, image, svg },
      metrics: {
        fiveHour: isProgressMode(rawMetrics["fiveHour"]) ? rawMetrics["fiveHour"] : resolvedStyleMode,
        weekly: isProgressMode(rawMetrics["weekly"]) ? rawMetrics["weekly"] : resolvedStyleMode
      },
      css,
      debug: source["debug"] === true
    };
  }
  function readStoredConfig() {
    try {
      return localStorage.getItem(STORAGE_KEY_CFG);
    } catch {
      return null;
    }
  }
  function loadConfig() {
    const raw = readStoredConfig();
    if (!raw) return normalizeConfig(null);
    try {
      return normalizeConfig(JSON.parse(raw));
    } catch {
      return normalizeConfig(null);
    }
  }
  function saveConfig(cfg) {
    try {
      localStorage.setItem(STORAGE_KEY_CFG, JSON.stringify(cfg));
      return true;
    } catch (err) {
      console.warn("[Gemini Quota] 保存配置失败:", err);
      return false;
    }
  }
  var config = loadConfig();

  // scripts/gemini-quota-capsule/src/ui/dom.ts
  function el(tag, attrs = {}, children = []) {
    const elem = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === void 0 || value === null) continue;
      if (key === "style" && typeof value === "string") {
        elem.style.cssText = value;
      } else if (key === "className") {
        elem.className = String(value);
      } else if (key.startsWith("on") && typeof value === "function") {
        elem.addEventListener(key.slice(2).toLowerCase(), value);
      } else {
        elem.setAttribute(key, String(value));
      }
    }
    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
      if (child === null || child === void 0) continue;
      if (typeof child === "string" || typeof child === "number") {
        elem.appendChild(document.createTextNode(String(child)));
      } else if (child instanceof Node) {
        elem.appendChild(child);
      }
    }
    return elem;
  }
  function svgEl(tag, attrs = {}, children = []) {
    const elem = document.createElementNS(
      "http://www.w3.org/2000/svg",
      tag
    );
    for (const [key, value] of Object.entries(attrs)) {
      if (value !== void 0 && value !== null) {
        elem.setAttribute(key, String(value));
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
  function setTextIfChanged(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }
  function setVarIfChanged(node, name, value) {
    if (node && node.style.getPropertyValue(name) !== value) {
      node.style.setProperty(name, value);
    }
  }
  function setTitleIfChanged(node, value) {
    if (node && node.title !== value) node.title = value;
  }
  function setAttrIfChanged(node, name, value) {
    if (node && node.getAttribute(name) !== value) node.setAttribute(name, value);
  }
  function buildCustomCss() {
    const rules = [];
    for (const target of CSS_TARGETS) {
      const declarations = config.css[target.key];
      if (!declarations) continue;
      rules.push(
        `#gc-pill-root [data-gc-part="${target.key}"] {
${declarations}
}`
      );
    }
    return rules.join("\n");
  }
  function applyCustomCss() {
    let styleElement = document.getElementById("gc-pill-custom-style");
    if (!styleElement) {
      const created = document.createElement("style");
      created.id = "gc-pill-custom-style";
      (document.head || document.documentElement).appendChild(created);
      styleElement = created;
    }
    styleElement.textContent = buildCustomCss();
  }

  // scripts/gemini-quota-capsule/src/ui/refs.ts
  var refs = {
    rootEl: null,
    pillContainerEl: null,
    drawerEl: null,
    headSlotEl: null,
    group5hEl: null,
    usage5hTextEl: null,
    progress5hEl: null,
    timer5hTextEl: null,
    group7dEl: null,
    usage7dTextEl: null,
    progress7dEl: null,
    timer7dTextEl: null,
    syncDotEl: null,
    btnRefreshEl: null,
    statusSourceEl: null,
    statusSyncTimeEl: null,
    styleStatusEl: null,
    svgEditorEl: null,
    svgTextareaEl: null,
    cssTextareaEl: null,
    cssTargetSelectEl: null,
    fileInputEl: null,
    imageBtnEl: null,
    svgBtnEl: null
  };
  var ornamentBtns = [];
  var progressBtns = {
    fiveHour: [],
    weekly: []
  };
  var uiState = {
    iconRevision: 0,
    uploadSequence: 0,
    lastOrnamentRender: null,
    customSvgCache: { source: "", node: null },
    progressCache: {
      fiveHour: { key: "" },
      weekly: { key: "" }
    }
  };
  function bumpIconRevision() {
    uiState.iconRevision += 1;
    return uiState.iconRevision;
  }
  function nextUploadSequence() {
    uiState.uploadSequence += 1;
    return uiState.uploadSequence;
  }

  // scripts/gemini-quota-capsule/src/ui/svg.ts
  var SVG_ALLOWED_TAGS = /* @__PURE__ */ new Set([
    "svg",
    "g",
    "path",
    "circle",
    "ellipse",
    "rect",
    "line",
    "polyline",
    "polygon",
    "defs",
    "linearGradient",
    "radialGradient",
    "stop",
    "clipPath",
    "mask"
  ]);
  var SVG_ALLOWED_ATTRS = /* @__PURE__ */ new Set([
    "viewBox",
    "preserveAspectRatio",
    "width",
    "height",
    "x",
    "y",
    "x1",
    "y1",
    "x2",
    "y2",
    "cx",
    "cy",
    "r",
    "rx",
    "ry",
    "d",
    "points",
    "fill",
    "fill-opacity",
    "fill-rule",
    "stroke",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-opacity",
    "stroke-dasharray",
    "stroke-dashoffset",
    "opacity",
    "transform",
    "offset",
    "stop-color",
    "stop-opacity",
    "gradientUnits",
    "gradientTransform",
    "clipPathUnits",
    "clip-path",
    "clip-rule",
    "mask",
    "id",
    "vector-effect"
  ]);
  var svgIdSeq = 0;
  function nextSvgId(prefix = "gc-orn") {
    svgIdSeq += 1;
    return `${prefix}-${svgIdSeq.toString(36)}`;
  }
  function isElement(node) {
    return node.nodeType === Node.ELEMENT_NODE;
  }
  function sanitizeSvg(source) {
    if (typeof source !== "string" || !source.trim()) {
      return { node: null, error: "SVG 内容为空" };
    }
    if (source.length > MAX_SVG_CHARS) {
      return { node: null, error: `SVG 超过 ${MAX_SVG_CHARS / 1024}KB 上限` };
    }
    let parsed;
    try {
      parsed = new DOMParser().parseFromString(source, "image/svg+xml");
    } catch {
      return { node: null, error: "SVG 无法解析" };
    }
    const sourceRoot = parsed.documentElement;
    if (!sourceRoot || sourceRoot.localName !== "svg" || parsed.querySelector("parsererror")) {
      return { node: null, error: "请输入完整的 SVG 根元素" };
    }
    const idMap = /* @__PURE__ */ new Map();
    svgIdSeq += 1;
    const prefix = `gc-user-svg-${svgIdSeq.toString(36)}-`;
    for (const node of [sourceRoot, ...sourceRoot.querySelectorAll("[id]")]) {
      const id = node.getAttribute("id");
      if (id !== null && /^[A-Za-z_][A-Za-z0-9_.:-]{0,63}$/.test(id)) {
        idMap.set(id, `${prefix}${id}`);
      }
    }
    let nodeCount = 0;
    const copyNode = (sourceNode, depth) => {
      if (depth > 12 || nodeCount > 500) return null;
      if (!isElement(sourceNode)) return null;
      const tag = sourceNode.localName;
      if (!SVG_ALLOWED_TAGS.has(tag)) return null;
      nodeCount += 1;
      const target = document.createElementNS(SVG_NS, tag);
      for (const attr of sourceNode.attributes) {
        const name = attr.name;
        if (!SVG_ALLOWED_ATTRS.has(name)) continue;
        let value = attr.value;
        if (value.length > 2048) continue;
        if (name === "id") {
          value = idMap.get(value) || `${prefix}${nodeCount}`;
        } else {
          value = value.replace(
            /url\(\s*['"]?#([A-Za-z_][A-Za-z0-9_.:-]*)['"]?\s*\)/g,
            (match, id) => {
              const mapped = idMap.get(id);
              return mapped === void 0 ? "none" : `url(#${mapped})`;
            }
          );
        }
        const withoutInternalRefs = value.replace(
          /url\(\s*['"]?#[A-Za-z_][A-Za-z0-9_.:-]*['"]?\s*\)/gi,
          ""
        );
        if (/url\s*\(/i.test(withoutInternalRefs)) continue;
        if (/javascript:|data:text\/html/i.test(value)) continue;
        target.setAttribute(name, value);
      }
      for (const child of sourceNode.childNodes) {
        const copied = copyNode(child, depth + 1);
        if (copied) target.appendChild(copied);
      }
      return target;
    };
    const root = copyNode(sourceRoot, 0);
    if (!root) {
      return { node: null, error: "SVG 中没有可显示的图形" };
    }
    const hasGraphic = [...root.querySelectorAll(
      "path,circle,ellipse,rect,line,polyline,polygon"
    )].some((node) => !node.closest("defs,clipPath,mask"));
    if (!hasGraphic) {
      return { node: null, error: "SVG 中没有可显示的图形" };
    }
    if (!root.getAttribute("viewBox")) {
      const width = Number.parseFloat(sourceRoot.getAttribute("width") ?? "");
      const height = Number.parseFloat(sourceRoot.getAttribute("height") ?? "");
      root.setAttribute(
        "viewBox",
        Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? `0 0 ${width} ${height}` : "0 0 16 16"
      );
    }
    root.setAttribute("aria-hidden", "true");
    root.setAttribute("focusable", "false");
    return { node: root, error: "" };
  }

  // scripts/gemini-quota-capsule/src/ui/elements.ts
  function setStyleStatus(message, kind = "") {
    const statusNode = refs.styleStatusEl;
    if (!statusNode) return;
    statusNode.textContent = message;
    statusNode.className = `gc-style-status${kind ? ` ${kind}` : ""}`;
  }
  function cycleOrnamentMode() {
    const modes = ORNAMENT_MODES.map((mode) => mode.key);
    const current = ORNAMENT_MODES.findIndex((mode) => mode.key === config.icon.kind);
    const nextIdx = current < 0 ? 0 : (current + 1) % modes.length;
    const nextKind = modes[nextIdx];
    if (nextKind === void 0) return;
    const previous = config.icon.kind;
    config.icon.kind = nextKind;
    bumpIconRevision();
    if (!saveConfig(config)) {
      config.icon.kind = previous;
      bumpIconRevision();
      setStyleStatus(
        "保存失败：本地存储空间不足，请减小图片或清理站点数据。",
        "error"
      );
      requestUiUpdate();
      return;
    }
    setStyleStatus("已切换装饰图标。", "ok");
    requestUiUpdate();
  }
  function setOrnament(kind, values = {}) {
    const previous = { ...config.icon };
    config.icon.kind = kind;
    if (typeof values.image === "string") config.icon.image = values.image;
    if (typeof values.svg === "string") config.icon.svg = values.svg;
    bumpIconRevision();
    if (!saveConfig(config)) {
      config.icon = previous;
      bumpIconRevision();
      setStyleStatus(
        "保存失败：本地存储空间不足，请改用更小的图片或清理站点数据。",
        "error"
      );
      requestUiUpdate();
      return false;
    }
    requestUiUpdate();
    return true;
  }
  function setProgressMode(metricKey, mode) {
    if (metricKey !== "fiveHour" && metricKey !== "weekly" || !isProgressMode(mode)) {
      return;
    }
    const kind = metricKey;
    const previous = config.metrics[kind];
    const previousLegacyMode = config.styleMode;
    config.metrics[kind] = mode;
    if (kind === "fiveHour") config.styleMode = mode;
    if (!saveConfig(config)) {
      config.metrics[kind] = previous;
      if (kind === "fiveHour") config.styleMode = previousLegacyMode;
      setStyleStatus("保存失败：无法写入本地存储。", "error");
      return;
    }
    setStyleStatus("样式已保存。", "ok");
    requestUiUpdate();
  }
  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("读取文件失败"));
      reader.readAsDataURL(file);
    });
  }
  function validateImageDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
      const picture = new Image();
      const cleanup = () => {
        clearTimeout(timeout);
        picture.onload = null;
        picture.onerror = null;
      };
      const timeout = setTimeout(() => {
        cleanup();
        picture.src = "";
        reject(new Error("图片解码超时"));
      }, 5e3);
      picture.onload = () => {
        cleanup();
        if (picture.naturalWidth > 0 && picture.naturalHeight > 0) resolve();
        else reject(new Error("图片没有有效尺寸"));
      };
      picture.onerror = () => {
        cleanup();
        reject(new Error("图片损坏或浏览器不支持该格式"));
      };
      picture.src = dataUrl;
    });
  }
  async function handleImageFile(file) {
    if (!file) return;
    const sequence = nextUploadSequence();
    const revision = uiState.iconRevision;
    const isCurrent = () => sequence === uiState.uploadSequence && revision === uiState.iconRevision;
    if (file.size > MAX_IMAGE_BYTES) {
      setStyleStatus(`图片超过 ${MAX_IMAGE_BYTES / 1024}KB 上限。`, "error");
      return;
    }
    const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name || "");
    try {
      if (isSvg) {
        const text = await file.text();
        if (!isCurrent()) return;
        const checked = sanitizeSvg(text);
        if (!checked.node) {
          setStyleStatus(checked.error, "error");
          return;
        }
        if (setOrnament("svg", { svg: text })) {
          setStyleStatus("SVG 图标已应用。", "ok");
        }
        return;
      }
      if (!/^image\/(png|jpeg|webp|gif|avif)$/i.test(file.type)) {
        setStyleStatus("仅支持 PNG、JPEG、WebP、GIF、AVIF 或 SVG。", "error");
        return;
      }
      const dataUrl = await readFileAsDataUrl(file);
      if (!isCurrent()) return;
      if (!dataUrl.startsWith("data:image/") || dataUrl.length > MAX_IMAGE_DATA_URL_CHARS) {
        setStyleStatus("图片编码后体积过大，请压缩后重试。", "error");
        return;
      }
      await validateImageDataUrl(dataUrl);
      if (!isCurrent()) return;
      if (setOrnament("image", { image: dataUrl })) {
        setStyleStatus("图片图标已应用。", "ok");
      }
    } catch (error) {
      if (!isCurrent()) return;
      setStyleStatus(
        `读取图片失败：${error instanceof Error && error.message ? error.message : "未知错误"}`,
        "error"
      );
    }
  }
  function applySvgSource(source) {
    const checked = sanitizeSvg(source);
    if (!checked.node) {
      setStyleStatus(checked.error, "error");
      return false;
    }
    if (!setOrnament("svg", { svg: source })) return false;
    setStyleStatus("SVG 图标已应用。", "ok");
    return true;
  }
  function toggleSvgEditor(show) {
    const editorNode = refs.svgEditorEl;
    if (!editorNode) return;
    const open = typeof show === "boolean" ? show : editorNode.hidden;
    editorNode.hidden = !open;
    if (open) {
      const textarea = refs.svgTextareaEl;
      if (!textarea) return;
      textarea.value = config.icon.kind === "svg" ? config.icon.svg : "";
      textarea.focus();
    }
  }
  function refreshCssEditor() {
    const textarea = refs.cssTextareaEl;
    const select = refs.cssTargetSelectEl;
    if (!textarea || !select) return;
    const target = select.value;
    if (!isCssTargetKey(target)) return;
    textarea.value = config.css[target] || "";
  }
  function applyComponentCss() {
    const textarea = refs.cssTextareaEl;
    const select = refs.cssTargetSelectEl;
    if (!textarea || !select) return;
    const target = select.value;
    if (!isCssTargetKey(target)) return;
    const value = textarea.value.trim();
    if (value && !isSafeCssText(value)) {
      setStyleStatus(
        `CSS 不可用：上限 ${MAX_CSS_CHARS / 1024}KB，且不能包含大括号、尖括号、@import、expression() 或 javascript:。`,
        "error"
      );
      return;
    }
    const previous = config.css[target];
    config.css[target] = value;
    if (!saveConfig(config)) {
      config.css[target] = previous;
      textarea.value = previous;
      setStyleStatus("CSS 保存失败：本地存储空间不足。", "error");
      return;
    }
    applyCustomCss();
    setStyleStatus(
      value ? "组件 CSS 已应用。" : "该组件的自定义 CSS 已清空。",
      "ok"
    );
  }
  function clearComponentCss() {
    const textarea = refs.cssTextareaEl;
    const select = refs.cssTargetSelectEl;
    if (!textarea || !select) return;
    const target = select.value;
    if (!isCssTargetKey(target)) return;
    const previous = config.css[target];
    config.css[target] = "";
    if (!saveConfig(config)) {
      config.css[target] = previous;
      textarea.value = previous;
      setStyleStatus("CSS 保存失败：本地存储空间不足。", "error");
      return;
    }
    textarea.value = "";
    applyCustomCss();
    setStyleStatus("该组件的自定义 CSS 已恢复默认。", "ok");
  }
  function syncStyleChoices() {
    for (const button of ornamentBtns) {
      const active = button.dataset["ornament"] === config.icon.kind;
      button.classList.toggle("active", active);
      setAttrIfChanged(button, "aria-pressed", String(active));
    }
    for (const kind of METRIC_KINDS) {
      for (const button of progressBtns[kind]) {
        const active = button.dataset["mode"] === config.metrics[kind];
        button.classList.toggle("active", active);
        setAttrIfChanged(button, "aria-pressed", String(active));
      }
    }
    const imageButton = refs.imageBtnEl;
    if (imageButton) imageButton.classList.toggle("active", config.icon.kind === "image");
    const svgButton = refs.svgBtnEl;
    if (svgButton) svgButton.classList.toggle("active", config.icon.kind === "svg");
  }

  // scripts/gemini-quota-capsule/src/ui/render.ts
  function clampRatio(value) {
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  }
  function createOrnamentSvg(kind, ratio) {
    const common = {
      viewBox: "0 0 16 16",
      class: "gc-ornament-svg",
      "aria-hidden": "true"
    };
    const uid = nextSvgId("gc-orn");
    if (kind === "spark") {
      return svgEl("svg", common, [
        svgEl("path", {
          d: "M8 .9c.42 3.9 2.8 6.28 6.7 6.7-3.9.42-6.28 2.8-6.7 6.7-.42-3.9-2.8-6.28-6.7-6.7C5.2 7.18 7.58 4.8 8 .9Z",
          fill: "currentColor"
        }),
        svgEl("circle", { cx: "8", cy: "8", r: "1.15", fill: "#fff", opacity: ".9" })
      ]);
    }
    if (kind === "orbit") {
      return svgEl("svg", common, [
        svgEl("circle", {
          cx: "8",
          cy: "8",
          r: "5.2",
          fill: "none",
          stroke: "rgba(255,255,255,.2)",
          "stroke-width": ".8"
        }),
        svgEl("ellipse", {
          cx: "8",
          cy: "8",
          rx: "6.5",
          ry: "2.7",
          fill: "none",
          stroke: "currentColor",
          "stroke-width": "1.15",
          transform: "rotate(-32 8 8)"
        }),
        svgEl("ellipse", {
          cx: "8",
          cy: "8",
          rx: "6.2",
          ry: "2.4",
          fill: "none",
          stroke: "currentColor",
          "stroke-width": ".55",
          opacity: ".38",
          transform: "rotate(58 8 8)"
        }),
        svgEl("circle", { cx: "12.1", cy: "4.3", r: "1.35", fill: "currentColor" }),
        svgEl("circle", { cx: "12.1", cy: "4.3", r: ".5", fill: "#fff", opacity: ".75" })
      ]);
    }
    if (kind === "capsule") {
      const fillHeight = Math.max(0.8, 11.6 * ratio);
      const fillTop = 12.6 - fillHeight;
      return svgEl("svg", common, [
        svgEl("defs", {}, [
          svgEl("clipPath", { id: `${uid}-clip` }, [
            svgEl("rect", { x: "4.6", y: "1.4", width: "6.8", height: "13.2", rx: "3.4" })
          ])
        ]),
        svgEl("rect", {
          x: "4.6",
          y: "1.4",
          width: "6.8",
          height: "13.2",
          rx: "3.4",
          fill: "rgba(255,255,255,.07)",
          stroke: "currentColor",
          "stroke-width": "1.15"
        }),
        svgEl("rect", {
          x: "4.6",
          y: String(fillTop.toFixed(2)),
          width: "6.8",
          height: String(fillHeight.toFixed(2)),
          fill: "currentColor",
          "clip-path": `url(#${uid}-clip)`,
          opacity: ".92"
        }),
        svgEl("rect", {
          x: "6.2",
          y: "3.2",
          width: "1.25",
          height: "4.6",
          rx: ".62",
          fill: "#fff",
          opacity: ".38"
        })
      ]);
    }
    if (kind === "bolt") {
      return svgEl("svg", common, [
        svgEl("path", {
          d: "M9.6.9 3.5 8.8h3.4l-.6 6.3 6.2-8.3H9.1l.5-5.9Z",
          fill: "currentColor"
        }),
        svgEl("path", {
          d: "M9.6.9 3.5 8.8h2.2L8.4 4l1.2-3.1Z",
          fill: "#fff",
          opacity: ".28"
        })
      ]);
    }
    if (kind === "none") return null;
    return svgEl("svg", common, [
      svgEl("defs", {}, [
        svgEl("linearGradient", {
          id: `${uid}-fill`,
          x1: "2",
          y1: "1",
          x2: "14",
          y2: "15",
          gradientUnits: "userSpaceOnUse"
        }, [
          svgEl("stop", { offset: "0", "stop-color": "currentColor", "stop-opacity": ".98" }),
          svgEl("stop", { offset: "1", "stop-color": "currentColor", "stop-opacity": ".32" })
        ])
      ]),
      svgEl("path", {
        d: "M8 1.1 13.7 4.4v6.9L8 14.9 2.3 11.3V4.4Z",
        fill: `url(#${uid}-fill)`
      }),
      svgEl("path", {
        d: "M8 1.1v13.8M2.3 4.4l11.4 6.9M13.7 4.4 2.3 11.3",
        fill: "none",
        stroke: "rgba(255,255,255,.5)",
        "stroke-width": ".55",
        "stroke-linejoin": "round"
      }),
      svgEl("path", {
        d: "M8 1.1 13.7 4.4 8 7.8 2.3 4.4Z",
        fill: "#fff",
        "fill-opacity": ".24"
      })
    ]);
  }
  function renderOrnament(usedRatio5h, usedRatio7d) {
    const headSlotEl = refs.headSlotEl;
    if (!headSlotEl) return;
    const used5h = clampRatio(usedRatio5h);
    const used7d = clampRatio(usedRatio7d);
    const dominant = Math.max(used5h, used7d);
    const color = getProgressColor(dominant).hex;
    const kind = config.icon.kind;
    if (headSlotEl.style.getPropertyValue("--gc-accent") !== color) {
      headSlotEl.style.setProperty("--gc-accent", color);
    }
    const key = [
      kind,
      uiState.iconRevision,
      kind === "capsule" ? dominant.toFixed(3) : ""
    ].join("|");
    if (uiState.lastOrnamentRender && uiState.lastOrnamentRender.key === key) return;
    uiState.lastOrnamentRender = { key };
    headSlotEl.textContent = "";
    headSlotEl.dataset["gcOrnament"] = kind;
    if (kind === "none") return;
    if (kind === "image" && config.icon.image) {
      const img = el("img", {
        className: "gc-ornament-image",
        src: config.icon.image,
        alt: "",
        draggable: "false",
        decoding: "async"
      });
      img.addEventListener("error", () => {
        headSlotEl.textContent = "";
        const fallback = createOrnamentSvg("prism", dominant);
        if (fallback) headSlotEl.appendChild(fallback);
      }, { once: true });
      headSlotEl.appendChild(img);
      return;
    }
    if (kind === "svg" && config.icon.svg) {
      if (uiState.customSvgCache.source !== config.icon.svg) {
        const checked = sanitizeSvg(config.icon.svg);
        uiState.customSvgCache = { source: config.icon.svg, node: checked.node };
      }
      const cachedNode = uiState.customSvgCache.node;
      if (cachedNode) {
        const node = cachedNode.cloneNode(true);
        if (node instanceof SVGElement) {
          node.setAttribute("class", "gc-ornament-svg");
          node.setAttribute("aria-hidden", "true");
          headSlotEl.appendChild(node);
          return;
        }
      }
    }
    const preset = createOrnamentSvg(kind, dominant);
    if (preset) headSlotEl.appendChild(preset);
  }
  function createProgressNode(mode, ratio) {
    if (mode === "none") return null;
    if (mode === "bar" || mode === "segments" || mode === "battery") {
      const fill = el("div", { className: "gc-inline-fill" });
      fill.style.width = `${Math.min(100, Math.round(ratio * 100))}%`;
      fill.style.backgroundColor = "var(--gc-progress-color)";
      const track = el("div", { className: "gc-inline-track" }, [fill]);
      if (mode !== "bar") track.dataset["mode"] = mode;
      return track;
    }
    if (mode === "ring") {
      const radius = 5.8;
      const circumference = 2 * Math.PI * radius;
      const offset = circumference - ratio * circumference;
      return svgEl("svg", {
        viewBox: "0 0 16 16",
        style: "transform: rotate(-90deg); width:16px; height:16px;",
        "aria-hidden": "true"
      }, [
        svgEl("circle", {
          cx: "8",
          cy: "8",
          r: String(radius),
          stroke: "rgba(255,255,255,.14)",
          "stroke-width": "2",
          fill: "none"
        }),
        svgEl("circle", {
          cx: "8",
          cy: "8",
          r: String(radius),
          "stroke-width": "2",
          "stroke-linecap": "round",
          fill: "none",
          stroke: "var(--gc-progress-color)",
          style: `stroke-dasharray:${circumference};stroke-dashoffset:${offset};`
        })
      ]);
    }
    if (mode === "disk") {
      const degrees = Math.min(360, Math.round(ratio * 360));
      return el("div", {
        className: "gc-disk-box",
        style: `background:conic-gradient(var(--gc-progress-color) 0deg ${degrees}deg, rgba(255,255,255,.12) ${degrees}deg 360deg);`
      }, [el("div", { className: "gc-disk-core" })]);
    }
    if (mode === "decay") {
      const r = Math.min(1.2, ratio);
      const isCritical = r >= 0.88;
      const drift = r * 4;
      const rot = r * 24;
      const shardsData = [
        { clip: "polygon(0% 0%, 55% 0%, 42% 45%, 0% 50%)", dx: -drift * 0.7, dy: -drift * 0.7, dr: -rot * 0.8 },
        { clip: "polygon(55% 0%, 100% 0%, 100% 48%, 42% 45%)", dx: drift * 0.6, dy: -drift * 0.6, dr: rot * 0.6 },
        { clip: "polygon(0% 50%, 42% 45%, 52% 70%, 0% 100%)", dx: -drift * 0.9, dy: drift * 0.4, dr: -rot * 0.9 },
        { clip: "polygon(42% 45%, 100% 48%, 80% 82%, 52% 70%)", dx: drift * 0.4, dy: drift * 0.2, dr: rot * 0.4 }
      ];
      const shards = shardsData.map((shard) => el("div", {
        className: "gc-decay-shard",
        style: `clip-path:${shard.clip};-webkit-clip-path:${shard.clip};background:var(--gc-progress-color);transform:translate(${shard.dx.toFixed(1)}px, ${shard.dy.toFixed(1)}px) rotate(${shard.dr.toFixed(1)}deg);`
      }));
      const body = el("div", {
        className: `gc-decay-body ${isCritical ? "gc-state-critical" : ""}`
      }, shards);
      return el("div", { className: "gc-decay-capsule" }, [body]);
    }
    if (mode === "columns") {
      const usedHeight = ratio * 14;
      const restHeight = (1 - ratio) * 14;
      return svgEl("svg", {
        viewBox: "0 0 16 16",
        width: "16",
        height: "16",
        "aria-hidden": "true"
      }, [
        svgEl("rect", { x: "2", y: "1", width: "4", height: "14", rx: "1", fill: "rgba(255,255,255,.08)" }),
        svgEl("rect", { x: "9", y: "1", width: "4", height: "14", rx: "1", fill: "rgba(255,255,255,.08)" }),
        svgEl("rect", {
          x: "2",
          y: (15 - usedHeight).toFixed(2),
          width: "4",
          height: usedHeight.toFixed(2),
          rx: "1",
          fill: "var(--gc-progress-color)"
        }),
        svgEl("rect", {
          x: "9",
          y: (15 - restHeight).toFixed(2),
          width: "4",
          height: restHeight.toFixed(2),
          rx: "1",
          fill: "rgba(255,255,255,.32)"
        })
      ]);
    }
    return null;
  }
  function renderProgressSlot(slot, mode, ratio, cache) {
    if (!slot) return;
    const normalized = clampRatio(ratio);
    const color = getProgressColor(normalized).hex;
    const key = `${mode}|${normalized.toFixed(4)}|${color}`;
    setVarIfChanged(slot.parentElement, "--gc-progress-color", color);
    if (cache.key === key) return;
    cache.key = key;
    slot.textContent = "";
    slot.dataset["mode"] = mode;
    const node = createProgressNode(mode, normalized);
    if (node) slot.appendChild(node);
  }
  function setMetricColorVars(groupNode, badgeColor, timerColor) {
    setVarIfChanged(groupNode, "--gc-badge-color", badgeColor);
    setVarIfChanged(groupNode, "--gc-timer-color", timerColor);
  }
  function renderMetricUnit(metric, isWeekly, label, usageNode, timerNode, groupNode) {
    if (!metric) {
      setMetricColorVars(groupNode, "#94a3b8", "#64748b");
      setTextIfChanged(usageNode, "--%");
      setTextIfChanged(timerNode, quotaState.isSyncing ? "同步中" : "待同步");
      setTitleIfChanged(groupNode, formatTooltip(label, metric));
      return 0;
    }
    if (metric.pct === null) {
      setMetricColorVars(groupNode, "#94a3b8", "#64748b");
      setTextIfChanged(usageNode, "--%");
      if (metric.resetAt && metric.resetAt > Date.now()) {
        const remaining = metric.resetAt - Date.now();
        setTextIfChanged(timerNode, formatCompactCountdown(remaining, isWeekly));
        setVarIfChanged(groupNode, "--gc-timer-color", "#94a3b8");
        setTitleIfChanged(timerNode, `距官方重置 ${formatRemainingHuman(remaining)}`);
      } else {
        setTextIfChanged(timerNode, quotaState.isSyncing ? "同步中" : "待同步");
      }
      setTitleIfChanged(groupNode, formatTooltip(label, metric));
      return 0;
    }
    const usedPct = typeof metric.usedPct === "number" && Number.isFinite(metric.usedPct) ? metric.usedPct : Math.max(0, Math.min(100, 100 - metric.pct));
    const usedRatio = usedPct / 100;
    const color = getProgressColor(usedRatio);
    setMetricColorVars(groupNode, color.hex, color.hex);
    setTextIfChanged(usageNode, `${usedPct}%`);
    const now = Date.now();
    if (metric.resetAt && metric.resetAt > now) {
      const remaining = metric.resetAt - now;
      setTextIfChanged(timerNode, formatCompactCountdown(remaining, isWeekly));
      setTitleIfChanged(timerNode, `距官方重置 ${formatRemainingHuman(remaining)}`);
    } else if (metric.rawResetText) {
      const anchor = metric.updatedAt > 0 ? metric.updatedAt : now;
      const parsed = parseOfficialResetTextToTimestamp(
        metric.rawResetText,
        anchor
      );
      setTextIfChanged(
        timerNode,
        parsed !== null && parsed > now ? formatCompactCountdown(parsed - now, isWeekly) : metric.rawResetText.slice(0, 10)
      );
      setTitleIfChanged(timerNode, metric.rawResetText);
    } else if (usedPct >= 100) {
      setTextIfChanged(timerNode, "已用尽");
      setVarIfChanged(groupNode, "--gc-timer-color", "#f43f5e");
    } else {
      setTextIfChanged(timerNode, "官方实时");
      setVarIfChanged(groupNode, "--gc-timer-color", "#94a3b8");
    }
    setTitleIfChanged(groupNode, formatTooltip(label, metric));
    return usedRatio;
  }
  var SOURCE_LABELS = {
    rpc: "官方 batchexecute RPC 实时帧",
    "usage-page": "官方 /usage 页面直连",
    cache: "官方数据本地缓存",
    init: "等待首次同步"
  };
  function sourceLabel(source) {
    if (source === "rpc" || source === "usage-page" || source === "cache" || source === "init") {
      return SOURCE_LABELS[source];
    }
    return "官方直连";
  }
  function updateUI() {
    if (!refs.rootEl) return;
    const now = Date.now();
    let expired = false;
    for (const kind of METRIC_KINDS) {
      const metric = quotaState[kind];
      if (metric.resetAt && metric.resetAt <= now) {
        metric.pct = null;
        metric.usedPct = null;
        metric.used = null;
        metric.limit = null;
        metric.resetAt = null;
        metric.rawResetText = "";
        metric.updatedAt = 0;
        expired = true;
      }
    }
    if (expired && !quotaState.isSyncing && now - quotaState.lastSyncTime > 30 * 1e3) {
      scheduleSyncAfterResponse();
    }
    const ratio5h = renderMetricUnit(
      quotaState.fiveHour,
      false,
      "5 小时窗口",
      refs.usage5hTextEl,
      refs.timer5hTextEl,
      refs.group5hEl
    );
    const ratio7d = renderMetricUnit(
      quotaState.weekly,
      true,
      "每周窗口",
      refs.usage7dTextEl,
      refs.timer7dTextEl,
      refs.group7dEl
    );
    renderOrnament(ratio5h, ratio7d);
    renderProgressSlot(
      refs.progress5hEl,
      config.metrics.fiveHour,
      ratio5h,
      uiState.progressCache.fiveHour
    );
    renderProgressSlot(
      refs.progress7dEl,
      config.metrics.weekly,
      ratio7d,
      uiState.progressCache.weekly
    );
    const btnRefreshEl = refs.btnRefreshEl;
    if (btnRefreshEl && btnRefreshEl.classList.contains("gc-spinning") !== quotaState.isSyncing) {
      btnRefreshEl.classList.toggle("gc-spinning", quotaState.isSyncing);
    }
    const hasOfficialData = quotaState.fiveHour.pct !== null || quotaState.weekly.pct !== null;
    const dotClass = `gc-sync-dot ${quotaState.isSyncing ? "syncing" : hasOfficialData ? "official" : quotaState.lastError ? "error" : ""}`;
    const syncDotEl = refs.syncDotEl;
    if (syncDotEl && syncDotEl.className !== dotClass) syncDotEl.className = dotClass;
    const timeStr = quotaState.lastSyncTime > 0 ? new Date(quotaState.lastSyncTime).toLocaleTimeString() : "未同步";
    setTextIfChanged(
      refs.statusSourceEl,
      quotaState.isSyncing && quotaState.syncPhase ? `状态: ${quotaState.syncPhase}…` : quotaState.lastError ? `状态: ${quotaState.lastError}` : `数据源: ${sourceLabel(quotaState.source)}`
    );
    setTextIfChanged(refs.statusSyncTimeEl, `最后同步: ${timeStr}`);
    syncStyleChoices();
  }

  // scripts/gemini-quota-capsule/src/ui/styles.ts
  var STYLES = `    #gc-pill-root {
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
    @media (max-width: 420px) {
      #gc-pill-root .gc-pill-container { gap: 1px; }
      #gc-pill-root .gc-metric-group { gap: 1px; }
      #gc-pill-root .gc-pill-badge { padding-inline: 1px; }
      #gc-pill-root .gc-pill-counter { font-size: 10px; }
      #gc-pill-root .gc-pill-timer { font-size: 8px; }
    }

    .gc-capsule-head {
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--gc-accent, #10b981);
      width: 16px;
      height: 16px;
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      cursor: pointer;
      transition: color 0.2s ease, transform 0.2s ease;
    }
    .gc-capsule-head:hover { transform: translateY(-0.5px) scale(1.06); }
    .gc-ornament-svg, .gc-ornament-image {
      width: 16px;
      height: 16px;
      display: block;
      object-fit: contain;
      border-radius: 4px;
      pointer-events: none;
    }

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
      color: var(--gc-badge-color, #f8fafc);
      line-height: 1;
    }
    .gc-pill-counter {
      display: inline-block;
      width: 4ch;
      flex-shrink: 0;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      font-weight: 700;
      color: #ffffff;
      font-variant-numeric: tabular-nums;
    }
    .gc-pill-timer {
      display: inline-block;
      width: 8ch;
      flex-shrink: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 9.5px;
      color: var(--gc-timer-color, #94a3b8);
      font-variant-numeric: tabular-nums;
    }

    .gc-progress-slot {
      width: 24px;
      height: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      overflow: visible;
      box-sizing: border-box;
      color: var(--gc-progress-color, #10b981);
    }

    .gc-inline-track {
      width: 24px;
      height: 2.5px;
      background: rgba(255, 255, 255, 0.12);
      border-radius: 999px;
      overflow: hidden;
      display: block;
      box-sizing: border-box;
      flex-shrink: 0;
    }
    .gc-inline-fill {
      height: 100%;
      border-radius: 999px;
      transition: width 0.3s ease, background-color 0.3s ease;
    }
    .gc-inline-track[data-mode="segments"] {
      height: 6px;
      border-radius: 0;
      /* 遮罩将连续进度切成五格，填充比例仍保持精确。 */
      mask-image: repeating-linear-gradient(to right, #000 0 4px, transparent 4px 5px);
      -webkit-mask-image: repeating-linear-gradient(to right, #000 0 4px, transparent 4px 5px);
    }
    .gc-inline-track[data-mode="battery"] {
      height: 9px;
      border: 1px solid #94a3b8;
      border-radius: 2px;
    }
    .gc-inline-track[data-mode="battery"] .gc-inline-fill {
      /* 电池内胆改用小圆角，避免在方形外壳里出现胶囊形的圆头。 */
      border-radius: 1px;
    }
    .gc-capsule-head:focus-visible, .gc-choice-btn:focus-visible, .gc-btn-icon:focus-visible {
      outline: 2px solid #38bdf8;
      outline-offset: 2px;
    }

    .gc-v-divider {
      width: 1px;
      height: 10px;
      background: rgba(255, 255, 255, 0.12);
      flex-shrink: 0;
    }

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
    @media (prefers-reduced-motion: reduce) {
      #gc-pill-root *, #gc-pill-root *::before, #gc-pill-root *::after {
        animation: none !important;
        transition: none !important;
      }
    }

    #gc-pill-drawer {
      position: absolute;
      bottom: calc(100% + 6px);
      right: 0;
      width: 300px;
      max-width: calc(100vw - 24px);
      max-height: min(78vh, 620px);
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
      box-sizing: border-box;
      overflow: hidden;
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
      flex-shrink: 0;
    }
    .gc-drawer-body {
      display: flex;
      flex-direction: column;
      gap: 8px;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding-right: 2px;
    }
    .gc-drawer-body::-webkit-scrollbar { width: 4px; }
    .gc-drawer-body::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.16);
      border-radius: 999px;
    }
    .gc-drawer-section {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .gc-section-label {
      font-size: 9px;
      font-weight: 600;
      color: #94a3b8;
      letter-spacing: 0.2px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .gc-mode-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 4px;
    }
    .gc-ornament-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
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
    .gc-choice-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .gc-custom-row {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }
    .gc-small-btn {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      color: #cbd5e1;
      border-radius: 4px;
      padding: 3px 6px;
      font-size: 9px;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    .gc-small-btn:hover { background: rgba(255,255,255,0.14); color: #fff; }
    .gc-small-btn.active { border-color: #38bdf8; color: #7dd3fc; }
    .gc-editor {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .gc-editor[hidden] { display: none; }
    .gc-textarea, .gc-select {
      width: 100%;
      box-sizing: border-box;
      background: rgba(2, 6, 23, 0.72);
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 5px;
      color: #e2e8f0;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 9.5px;
      line-height: 1.45;
      padding: 5px 6px;
      resize: vertical;
      outline: none;
    }
    .gc-textarea:focus, .gc-select:focus {
      border-color: #38bdf8;
      box-shadow: 0 0 0 1px rgba(56,189,248,0.3);
    }
    .gc-textarea { min-height: 66px; }
    .gc-css-textarea { min-height: 56px; }
    .gc-select { min-height: 26px; resize: none; padding: 3px 6px; }
    .gc-editor-actions {
      display: flex;
      gap: 4px;
      justify-content: flex-end;
    }
    .gc-style-status {
      min-height: 12px;
      font-size: 9px;
      line-height: 1.35;
      color: #64748b;
      overflow-wrap: anywhere;
    }
    .gc-style-status.error { color: #fb7185; }
    .gc-style-status.ok { color: #34d399; }
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
    }  `;
  function injectStyles() {
    if (document.getElementById("gc-pill-style")) return;
    const style = document.createElement("style");
    style.id = "gc-pill-style";
    style.textContent = STYLES;
    (document.head || document.documentElement).appendChild(style);
  }

  // scripts/gemini-quota-capsule/src/ui/panel.ts
  function createDOM() {
    const existing = document.getElementById("gc-pill-root");
    if (existing) {
      refs.rootEl = existing instanceof HTMLDivElement ? existing : null;
      applyCustomCss();
      return;
    }
    injectStyles();
    refs.headSlotEl = el("button", {
      type: "button",
      "aria-label": "切换装饰图标",
      "data-gc-part": "head",
      className: "gc-capsule-head",
      title: "点击轮换装饰图标（棱镜 / 星芒 / 轨道 / 胶囊 / 闪电 / 无）",
      onclick: (e) => {
        e.stopPropagation();
        cycleOrnamentMode();
      }
    });
    const badge5hEl = el("span", { className: "gc-pill-badge", "data-gc-part": "badge" }, ["5小时"]);
    refs.usage5hTextEl = el("span", { className: "gc-pill-counter", "data-gc-part": "counter" }, ["--%"]);
    refs.progress5hEl = el("span", {
      className: "gc-progress-slot",
      "data-gc-part": "progress"
    });
    refs.timer5hTextEl = el("span", { className: "gc-pill-timer", "data-gc-part": "timer" }, ["同步中"]);
    refs.group5hEl = el("div", { className: "gc-metric-group", "data-gc-part": "five-hour" }, [
      badge5hEl,
      refs.usage5hTextEl,
      refs.progress5hEl,
      refs.timer5hTextEl
    ]);
    const badge7dEl = el("span", { className: "gc-pill-badge", "data-gc-part": "badge" }, ["每周"]);
    refs.usage7dTextEl = el("span", { className: "gc-pill-counter", "data-gc-part": "counter" }, ["--%"]);
    refs.progress7dEl = el("span", {
      className: "gc-progress-slot",
      "data-gc-part": "progress"
    });
    refs.timer7dTextEl = el("span", { className: "gc-pill-timer", "data-gc-part": "timer" }, ["同步中"]);
    refs.group7dEl = el("div", { className: "gc-metric-group", "data-gc-part": "weekly" }, [
      badge7dEl,
      refs.usage7dTextEl,
      refs.progress7dEl,
      refs.timer7dTextEl
    ]);
    refs.syncDotEl = el("span", { className: "gc-sync-dot" });
    const refreshSvg = svgEl(
      "svg",
      {
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "2.3",
        "stroke-linecap": "round",
        "stroke-linejoin": "round"
      },
      [
        svgEl("path", {
          d: "M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"
        })
      ]
    );
    refs.btnRefreshEl = el(
      "button",
      {
        className: "gc-btn-icon",
        title: "立即同步官方最新用量与重置时间",
        onclick: (e) => {
          e.stopPropagation();
          void syncOfficialUsage(true);
        }
      },
      [refreshSvg]
    );
    const gearSvg = svgEl(
      "svg",
      {
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "2",
        "stroke-linecap": "round",
        "stroke-linejoin": "round"
      },
      [
        svgEl("circle", { cx: "12", cy: "12", r: "3" }),
        svgEl("path", {
          d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
        })
      ]
    );
    const btnSettings = el(
      "button",
      {
        className: "gc-btn-icon",
        title: "样式与数据源设置",
        onclick: (e) => {
          e.stopPropagation();
          refs.drawerEl?.classList.toggle("gc-active");
        }
      },
      [gearSvg]
    );
    const actionsBox = el("div", { className: "gc-pill-actions", "data-gc-part": "actions" }, [
      refs.syncDotEl,
      refs.btnRefreshEl,
      btnSettings
    ]);
    refs.pillContainerEl = el("div", { className: "gc-pill-container", "data-gc-part": "container" }, [
      refs.headSlotEl,
      refs.group5hEl,
      el("div", { className: "gc-v-divider", "data-gc-part": "divider" }),
      refs.group7dEl,
      el("div", { className: "gc-v-divider", "data-gc-part": "divider" }),
      actionsBox
    ]);
    ornamentBtns.length = 0;
    for (const mode of ORNAMENT_MODES) {
      const btn = el(
        "button",
        {
          className: "gc-choice-btn",
          title: `装饰图标：${mode.text}`,
          onclick: () => {
            if (config.icon.kind === mode.key) return;
            if (setOrnament(mode.key)) {
              setStyleStatus(`已切换为「${mode.text}」装饰。`, "ok");
            }
          }
        },
        [mode.text]
      );
      btn.dataset["ornament"] = mode.key;
      ornamentBtns.push(btn);
    }
    const buildProgressGrid = (metricKey) => {
      const buttons = [];
      for (const mode of PROGRESS_MODE_CHOICES) {
        const btn = el(
          "button",
          {
            className: "gc-choice-btn",
            title: `进度样式：${mode.text}`,
            onclick: () => setProgressMode(metricKey, mode.key)
          },
          [mode.text]
        );
        btn.dataset["mode"] = mode.key;
        buttons.push(btn);
      }
      progressBtns[metricKey] = buttons;
      return el(
        "div",
        { className: "gc-mode-grid", "data-gc-metric": metricKey },
        buttons
      );
    };
    refs.fileInputEl = el("input", {
      type: "file",
      accept: "image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml",
      style: "display:none;"
    });
    const fileInput = refs.fileInputEl;
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = "";
      await handleImageFile(file);
    });
    refs.imageBtnEl = el("button", {
      className: "gc-small-btn",
      "data-gc-action": "image-upload",
      title: `本地图片，最大 ${MAX_IMAGE_BYTES / 1024}KB`,
      onclick: (e) => {
        e.stopPropagation();
        refs.fileInputEl?.click();
      }
    }, ["上传图片"]);
    refs.svgBtnEl = el("button", {
      className: "gc-small-btn",
      "data-gc-action": "svg-editor",
      title: "粘贴 SVG 源码，脚本会按白名单清洗",
      onclick: (e) => {
        e.stopPropagation();
        toggleSvgEditor();
      }
    }, ["输入 SVG"]);
    const clearCustomBtn = el("button", {
      className: "gc-small-btn",
      "data-gc-action": "clear-custom",
      onclick: (e) => {
        e.stopPropagation();
        const previous = { ...config.icon };
        config.icon.image = "";
        config.icon.svg = "";
        if (CUSTOM_ORNAMENT_KINDS.includes(config.icon.kind)) config.icon.kind = "prism";
        bumpIconRevision();
        if (!saveConfig(config)) {
          config.icon = previous;
          bumpIconRevision();
          setStyleStatus("清除失败：无法写入本地存储。", "error");
          updateUI();
          return;
        }
        toggleSvgEditor(false);
        setStyleStatus("已清除上传的图片与 SVG 资源。", "ok");
        updateUI();
      }
    }, ["清除资源"]);
    const svgTextarea = el("textarea", {
      className: "gc-textarea",
      maxlength: String(MAX_SVG_CHARS),
      spellcheck: "false",
      placeholder: '<svg viewBox="0 0 16 16"><path d="..." fill="currentColor"/></svg>'
    });
    refs.svgTextareaEl = svgTextarea;
    refs.svgEditorEl = el("div", { className: "gc-editor", hidden: true }, [
      el("div", { style: "font-size:9px; color:#64748b;" }, [
        `仅保留静态图形与渐变，上限 ${MAX_SVG_CHARS / 1024}KB。`
      ]),
      svgTextarea,
      el("div", { className: "gc-editor-actions" }, [
        el("button", {
          className: "gc-small-btn",
          "data-gc-action": "svg-cancel",
          onclick: () => toggleSvgEditor(false)
        }, ["取消"]),
        el("button", {
          className: "gc-small-btn",
          "data-gc-action": "svg-apply",
          onclick: () => {
            if (applySvgSource(svgTextarea.value)) toggleSvgEditor(false);
          }
        }, ["应用 SVG"])
      ])
    ]);
    refs.cssTargetSelectEl = el("select", { className: "gc-select" }, CSS_TARGETS.map(
      (target) => el("option", { value: target.key }, [target.text])
    ));
    refs.cssTargetSelectEl.addEventListener("change", refreshCssEditor);
    refs.cssTextareaEl = el("textarea", {
      className: "gc-textarea gc-css-textarea",
      maxlength: String(MAX_CSS_CHARS),
      spellcheck: "false",
      placeholder: "background: rgba(56,189,248,.12); border-color: #38bdf8;"
    });
    refs.styleStatusEl = el("div", { className: "gc-style-status" });
    const drawerTitle = el("div", { className: "gc-drawer-title" }, [
      el("span", {}, ["组件样式"]),
      el("span", { style: "font-size:9px; color:#64748b;" }, ["本地即时生效"])
    ]);
    const drawerBody = el("div", { className: "gc-drawer-body" }, [
      refs.styleStatusEl,
      el("div", { className: "gc-drawer-section" }, [
        el("div", { className: "gc-section-label" }, [
          el("span", {}, ["装饰图标"]),
          el("span", { style: "color:#475569;" }, ["点击胶囊头部也可轮换"])
        ]),
        el("div", { className: "gc-ornament-grid" }, ornamentBtns),
        el("div", { className: "gc-custom-row" }, [
          refs.imageBtnEl,
          refs.svgBtnEl,
          clearCustomBtn,
          refs.fileInputEl
        ]),
        refs.svgEditorEl
      ]),
      el("div", { className: "gc-drawer-section" }, [
        el("div", { className: "gc-section-label" }, [el("span", {}, ["5 小时进度"])]),
        buildProgressGrid("fiveHour")
      ]),
      el("div", { className: "gc-drawer-section" }, [
        el("div", { className: "gc-section-label" }, [el("span", {}, ["每周进度"])]),
        buildProgressGrid("weekly")
      ]),
      el("div", { className: "gc-drawer-section" }, [
        el("div", { className: "gc-section-label" }, [
          el("span", {}, ["组件 CSS"]),
          el("span", { style: "color:#475569;" }, ["只填声明"])
        ]),
        refs.cssTargetSelectEl,
        refs.cssTextareaEl,
        el("div", { className: "gc-editor-actions" }, [
          el("button", {
            className: "gc-small-btn",
            "data-gc-action": "css-clear",
            onclick: clearComponentCss
          }, ["恢复默认"]),
          el("button", {
            className: "gc-small-btn",
            "data-gc-action": "css-apply",
            onclick: applyComponentCss
          }, ["应用 CSS"])
        ])
      ])
    ]);
    refs.statusSourceEl = el("div", {}, ["数据源: 正在连接官方接口..."]);
    refs.statusSyncTimeEl = el("div", { style: "color:#64748b;" }, ["上次同步: --"]);
    const openOfficialLink = el(
      "span",
      {
        className: "gc-link-btn",
        onclick: () => window.open(getOfficialUsageUrl(), "_blank")
      },
      ["打开官方 /usage 页面核对"]
    );
    refs.drawerEl = el("div", { id: "gc-pill-drawer", "data-gc-part": "drawer" }, [
      drawerTitle,
      drawerBody,
      el("div", { className: "gc-drawer-status" }, [
        refs.statusSourceEl,
        refs.statusSyncTimeEl,
        openOfficialLink
      ])
    ]);
    const rootEl = el(
      "div",
      {
        id: "gc-pill-root",
        style: `right:${config.pos.right}px; bottom:${config.pos.bottom}px;`
      },
      [refs.pillContainerEl, refs.drawerEl]
    );
    refs.rootEl = rootEl;
    (document.body || document.documentElement).appendChild(rootEl);
    applyCustomCss();
    refreshCssEditor();
    bindDragEvents();
    updateUI();
  }
  function bindDragEvents() {
    const pill = refs.pillContainerEl;
    const root = refs.rootEl;
    const drawer = refs.drawerEl;
    if (!pill || !root || !drawer) return;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialRight = 0;
    let initialBottom = 0;
    let hasMoved = false;
    pill.addEventListener("pointerdown", (e) => {
      const target = e.target;
      if (target instanceof Element) {
        if (target.closest("button") || target.closest(".gc-capsule-head")) {
          return;
        }
      }
      isDragging = true;
      hasMoved = false;
      startX = e.clientX;
      startY = e.clientY;
      initialRight = config.pos.right;
      initialBottom = config.pos.bottom;
      pill.setPointerCapture(e.pointerId);
    });
    pill.addEventListener("pointermove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hasMoved = true;
      const width = pill.offsetWidth || 240;
      const newRight = Math.max(
        6,
        Math.min(window.innerWidth - width - 6, initialRight - dx)
      );
      const newBottom = Math.max(
        6,
        Math.min(window.innerHeight - 30, initialBottom - dy)
      );
      root.style.right = `${newRight}px`;
      root.style.bottom = `${newBottom}px`;
    });
    const endDrag = (e) => {
      if (!isDragging) return;
      isDragging = false;
      try {
        pill.releasePointerCapture(e.pointerId);
      } catch {
      }
      if (hasMoved) {
        config.pos.right = parseInt(root.style.right, 10) || config.pos.right;
        config.pos.bottom = parseInt(root.style.bottom, 10) || config.pos.bottom;
        saveConfig(config);
      }
    };
    pill.addEventListener("pointerup", endDrag);
    pill.addEventListener("pointercancel", endDrag);
    document.addEventListener("pointerdown", (e) => {
      if (!root.contains(e.target instanceof Node ? e.target : null)) {
        drawer.classList.remove("gc-active");
      }
    });
  }
  function ensureMounted() {
    if (!document.body) return;
    const root = refs.rootEl;
    if (!root) {
      createDOM();
      return;
    }
    if (!root.isConnected) {
      document.body.appendChild(root);
    }
  }

  // scripts/gemini-quota-capsule/src/index.ts
  var testApi = {
    parseUsageRpcPayload,
    buildOfficialUsageRequest,
    officialCacheKey,
    collectQuotaDomHints,
    collectProgressbarHints,
    collectProgressbarMetrics,
    rememberQuotaSnippets,
    shortenUrl,
    toEpochMs,
    parseOfficialResetTextToTimestamp,
    pctFromTextWithContext,
    pickResetAt,
    collectResetCandidates,
    sanitizeMetric,
    poolKindFromLabel,
    readMetricFromArrayTuple,
    readMetricFromRecord,
    collectStructuredPools,
    extractQuotaFromWizStructure,
    parseBatchExecuteResponse,
    parseUsageDocument,
    parseHtmlDocument,
    parseOfficialUsageText,
    extractInitDataBlocks,
    scanBalancedArray,
    normalizePctValue,
    pctHintFromKey,
    extractMetricFromCardText,
    commitOfficialQuota,
    buildUsageHelperUrl,
    readHelperSyncNonce,
    readSyncBridgePayload,
    formatCompactCountdown,
    formatRemainingHuman,
    isSameUsagePath,
    getAccountPrefix,
    getOfficialUsageUrl,
    noteAccountPrefix
  };
  function bootstrap() {
    const helperNonce = readHelperSyncNonce();
    if (helperNonce) {
      runUsageHelperSync(helperNonce);
      return;
    }
    restoreCachedOfficialQuota();
    window.addEventListener("storage", (e) => {
      if (e.key === officialCacheKey()) {
        restoreCachedOfficialQuota();
        return;
      }
      if (e.key === STORAGE_KEY_SYNC_BRIDGE && e.newValue) {
        const payload = readSyncBridgePayload(e.newValue);
        const pendingUsageHelper2 = getPendingUsageHelper();
        if (payload && pendingUsageHelper2 && payload.nonce === pendingUsageHelper2.nonce) {
          pendingUsageHelper2.finish(payload);
        }
      }
    });
    const init = () => {
      createDOM();
      setTimeout(() => {
        void syncOfficialUsage(false);
      }, 500);
      if (/\/usage\/?$/.test(window.location.pathname)) {
        for (const delay of [1500, 5e3, 12e3]) {
          setTimeout(() => void syncOfficialUsage(false), delay);
        }
      }
      setInterval(() => {
        if (getAutomaticFailureCount() > 0 || Date.now() - quotaState.lastSyncTime >= AUTO_SYNC_INTERVAL_MS) {
          void syncOfficialUsage(false);
        }
      }, AUTO_SYNC_HEARTBEAT_MS);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && Date.now() - quotaState.lastSyncTime >= AUTO_SYNC_INTERVAL_MS) {
          void syncOfficialUsage(false);
        }
      });
      setInterval(() => {
        ensureMounted();
        updateUI();
      }, 1e3);
    };
    if (document.body) {
      init();
    } else {
      document.addEventListener("DOMContentLoaded", init, { once: true });
    }
  }
  var api = {
    version: SCRIPT_VERSION,
    get state() {
      return quotaState;
    },
    get config() {
      return config;
    },
    sync() {
      return syncOfficialUsage(true);
    },
    /**
     * Debug: request one background usage page sync (opens a background tab).
     * Browsers usually only allow popups inside a user gesture, so calls from
     * the console may be blocked and return ok:false.
     */
    helperSync() {
      return requestUsageHelperSync(getOfficialUsageUrl(), null);
    },
    parseResetText(text, nowMs = Date.now()) {
      return parseOfficialResetTextToTimestamp(text, nowMs);
    },
    setDebug(enabled) {
      config.debug = !!enabled;
      saveConfig(config);
    },
    /**
     * Single-command self check: fetch /usage directly and report the status,
     * AF_initDataCallback block count and parse result.
     *
     * Note: this returns a Promise. copy(JSON.stringify(__gqc.probeUsage()))
     * only yields {} because Promises do not serialize. The result is logged and
     * stored in __gqc.lastProbe, so call it directly: __gqc.probeUsage()
     */
    async probeUsage() {
      const url = getOfficialUsageUrl();
      const resp = await origFetch.call(window, url, {
        method: "GET",
        credentials: "include",
        cache: "no-store"
      });
      const rawHtml = resp.ok ? await resp.text() : "";
      const finalUrl = resp.url || "";
      const finalPath = (() => {
        try {
          return new URL(finalUrl || url, window.location.href).pathname;
        } catch {
          return "";
        }
      })();
      const redirectedAway = !!resp.redirected && !/\/usage\/?$/.test(finalPath);
      let parsed = null;
      if (rawHtml && !redirectedAway) {
        try {
          const parsedDoc = parseHtmlDocument(rawHtml);
          parsed = parsedDoc ? parseUsageDocument(parsedDoc, rawHtml) : { error: "无法创建安全 HTML 文档" };
        } catch (err) {
          parsed = { error: err instanceof Error ? err.message : "解析失败" };
        }
      }
      const parsedQuota = parsed !== null && !("error" in parsed) ? parsed : null;
      const result = {
        version: SCRIPT_VERSION,
        url,
        status: resp.status,
        finalUrl: shortenUrl(finalUrl),
        redirectedAway,
        note: redirectedAway ? "本次 /usage 通道不可用（最终地址已离开请求路径）" : "",
        len: rawHtml.length,
        blocks: usageParseDiag.blocks,
        initHit: usageParseDiag.initHit,
        blockHits: redirectedAway ? [] : extractInitDataBlocks(rawHtml).filter(
          (block) => /hourly|weekly|quota|percent|usage|limit|gxu/i.test(block)
        ).slice(0, 5).map((block) => ({
          size: block.length,
          // Only a short excerpt to confirm field names; no chat content.
          excerpt: block.length > 600 ? `${block.slice(0, 600)}…` : block
        })),
        fiveHour: parsedQuota ? parsedQuota.fiveHour : null,
        weekly: parsedQuota ? parsedQuota.weekly : null
      };
      this.lastProbe = result;
      try {
        console.log("[Gemini Quota] probeUsage", JSON.stringify(result));
      } catch {
      }
      return result;
    },
    /**
     * One-shot evidence capture: answer where the official page keeps the two
     * numbers. Open Gemini's limit/usage popup, send a message, then run
     * __gqc.report() in the console. The result is logged and kept in
     * __gqc.lastReport (keyword neighborhoods only: at most 2 snippets per
     * frame and 8 lines per page, never a whole conversation).
     */
    report() {
      const result = {
        version: SCRIPT_VERSION,
        at: (/* @__PURE__ */ new Date()).toISOString(),
        href: shortenUrl(window.location.href),
        path: window.location.pathname,
        state: {
          source: quotaState.source,
          lastError: quotaState.lastError,
          fiveHour: {
            pct: quotaState.fiveHour.pct,
            usedPct: quotaState.fiveHour.usedPct,
            confidence: quotaState.fiveHour.confidence
          },
          weekly: {
            pct: quotaState.weekly.pct,
            usedPct: quotaState.weekly.usedPct,
            confidence: quotaState.weekly.confidence
          }
        },
        usagePage: quotaState.usagePageStatus,
        domHints: collectQuotaDomHints(),
        progressbars: collectProgressbarHints(),
        captured: {
          batchExecSeen: obsDiag.batchExecSeen,
          batchFrames: obsDiag.batchFrames,
          quotaHits: obsDiag.quotaHits,
          nonQuotaResponses: obsDiag.nonQuotaResponses,
          responseReadFailures: obsDiag.responseReadFailures,
          rpcIds: obsDiag.lastRpcIds.slice(),
          rawFrames: rawFrameRing.length,
          snippets: snippetRing.length
        },
        endpoints: netRing.slice(),
        snippets: snippetRing.slice()
      };
      this.lastReport = result;
      try {
        console.log("[Gemini Quota] report", JSON.stringify(result, null, 2));
      } catch {
      }
      return result;
    },
    dump() {
      return {
        version: SCRIPT_VERSION,
        at: (/* @__PURE__ */ new Date()).toISOString(),
        href: window.location.href,
        // Config images and SVGs can be hundreds of KB; keep only their sizes so
        // the console output is not flooded with asset bodies.
        config: {
          ...config,
          icon: {
            kind: config.icon.kind,
            imageChars: config.icon.image.length,
            svgChars: config.icon.svg.length
          },
          css: { ...config.css }
        },
        state: {
          source: quotaState.source,
          isSyncing: quotaState.isSyncing,
          syncPhase: quotaState.syncPhase,
          lastSyncTime: quotaState.lastSyncTime,
          lastError: quotaState.lastError,
          fiveHour: { ...quotaState.fiveHour },
          weekly: { ...quotaState.weekly },
          capturedRpc: quotaState.capturedQuotaRpc ? {
            url: quotaState.capturedQuotaRpc.url,
            rpcId: quotaState.capturedQuotaRpc.rpcId
          } : null
        },
        frames: rawFrameRing.slice(),
        responses: responseRing.slice(),
        endpoints: netRing.slice(),
        diagnostics: {
          batchExecSeen: obsDiag.batchExecSeen,
          batchFrames: obsDiag.batchFrames,
          quotaHits: obsDiag.quotaHits,
          nonQuotaResponses: obsDiag.nonQuotaResponses,
          responseReadFailures: obsDiag.responseReadFailures,
          lastRpcIds: obsDiag.lastRpcIds.slice(),
          rawFrames: rawFrameRing.length,
          responses: responseRing.length,
          usageBlocks: usageParseDiag.blocks,
          usageInitHit: usageParseDiag.initHit,
          // Official /usage text channel: iframe and background tab progress.
          usageFrameAttempts: usageParseDiag.frameAttempts,
          usageFrameLoads: usageParseDiag.frameLoads,
          usageFrameBlocked: usageParseDiag.frameBlocked,
          usageFrameRedirected: usageParseDiag.frameRedirected,
          usageFrameTimeout: usageParseDiag.frameTimeout,
          usageFrameTextLength: usageParseDiag.frameTextLength,
          usageFrameParsed: usageParseDiag.frameParsed,
          usageFrameReason: usageParseDiag.frameReason,
          usageHelperAttempts: usageParseDiag.helperAttempts,
          usageHelperOK: usageParseDiag.helperOK,
          usageHelperReason: usageParseDiag.helperReason,
          usageRpcId: USAGE_RPC_ID,
          usageRpcError: usageSyncDiag.rpcError,
          usageHelperError: usageSyncDiag.helperError,
          // Rejection counters explain "why no numbers this time" without
          // guessing official field names again.
          rejected: { ...parseRejectDiag },
          usagePage: quotaState.usagePageStatus,
          quotaSnippets: snippetRing.length,
          domHints: collectQuotaDomHints(),
          progressbars: collectProgressbarHints()
        }
      };
    },
    _test: testApi
  };
  installNetworkObserver();
  setUiUpdater(updateUI);
  Reflect.set(window, "__gqc", api);
  bootstrap();
})();
