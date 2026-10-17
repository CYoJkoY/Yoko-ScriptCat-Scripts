// ==UserScript==
// @name         Gemini Quota Capsule
// @namespace    https://cyojkoy.github.io/Payment/
// @version      0.6.0
// @description  参照 Voyager usage-observer 架构：document-start 拦截 XHR/Fetch batchexecute (wrb.fr) 与 /usage 官方数据源，按 poolType 精确分流 5H / 7D 真实用量，重置倒计时基于官方重置时刻与当前时间实时计算。
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

  const AUTO_SYNC_INTERVAL_MS = 3 * 60 * 1000;

  // 两个官方配额窗口的真实长度（5 小时 / 7 天），用于校验重置时间是否发生“串窗”
  const FIVE_HOUR_MS = 5 * 60 * 60 * 1000;
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const RESET_SLACK_MS = 30 * 60 * 1000; // 允许的时钟/服务端抖动
  const FRESH_MS = 10 * 60 * 1000; // 超过该时长未更新的数据不再受置信度保护

  // 数据置信度：结构化 pools > 官方 /usage 页面 > 标签启发式
  const CONFIDENCE = { heuristic: 1, dom: 2, pools: 3 };

  const DURATION_SENTINELS = new Set([18000, 604800, 86400, 3600, 300, 60, 30, 24, 7, 5]);

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
  // 3. 官方配额状态机与数据解析器
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
      confidence: 0, // 0 = 未知 / 1 = 标签启发式 / 2 = 官方页面 / 3 = 结构化 pools
      updatedAt: 0, // 该指标最后一次被刷新到的时间，用于置信度保护
    },
    weekly: {
      pct: null, // 0 ~ 100
      used: null,
      limit: null,
      resetAt: null, // 真实官方重置时间戳 (ms)
      rawResetText: "",
      confidence: 0,
      updatedAt: 0,
    },
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
   * 把任意来源的时间值归一化成毫秒时间戳。
   * 覆盖 Google Timestamp({seconds,nanos})、[秒, 纳秒] 元组、10/13 位数字串与 ISO 8601 字符串。
   * 只接受落在 [当前时间 - 10 分钟, 当前时间 + 10 天] 内的值，越界一律视为噪声。
   */
  function toEpochMs(value, nowMs = Date.now()) {
    const minMs = nowMs - 10 * 60 * 1000;
    const maxMs = nowMs + 10 * 86400 * 1000;
    const plausible = (ms) =>
      typeof ms === "number" && Number.isFinite(ms) && ms >= minMs && ms <= maxMs;

    if (typeof value === "number" && Number.isFinite(value)) {
      if (plausible(value)) return Math.round(value);
      if (plausible(value * 1000)) return Math.round(value * 1000);
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

    if (value && typeof value === "object") {
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
        "epochMillis",
      ]) {
        if (value[key] === undefined) continue;
        const parsed = toEpochMs(value[key], nowMs);
        if (parsed !== null) return parsed;
      }
    }
    return null;
  }

  /**
   * 从官方重置提示中还原真实重置时间戳（毫秒）。
   * 支持绝对时刻（ISO 8601 / 12 小时制钟点 / 明天 14:00）与相对倒计时（天/时/分/秒/周）。
   */
  function parseOfficialResetTextToTimestamp(text, nowMs = Date.now()) {
    if (!text || typeof text !== "string") return null;
    const clean = text.replace(/\s+/g, " ").trim();
    const minMs = nowMs - 10 * 60 * 1000;
    const maxMs = nowMs + 30 * 86400 * 1000;

    // 1. 绝对日期时间：2026-10-18T09:30:00Z / 2026-10-18 09:30 / 2026/10/18 09:30
    const isoMatch = clean.match(
      /(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?)?/,
    );
    if (isoMatch && isoMatch[4] !== undefined) {
      const year = Number(isoMatch[1]);
      const month = Number(isoMatch[2]);
      const day = Number(isoMatch[3]);
      const hour = Number(isoMatch[4]);
      const minute = Number(isoMatch[5]);
      const second = isoMatch[6] === undefined ? 0 : Number(isoMatch[6]);
      const zone = isoMatch[7];
      const pad = (n) => String(n).padStart(2, "0");
      const absolute = zone
        ? Date.parse(
            `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}${zone === "Z" ? "Z" : zone.replace(/^([+-]\d{2})(\d{2})$/, "$1:$2")}`,
          )
        : new Date(year, month - 1, day, hour, minute, second, 0).getTime();
      if (Number.isFinite(absolute) && absolute >= minMs && absolute <= maxMs) {
        return absolute;
      }
    }

    // 2. 12 小时制 / 中文钟点：Resets at 5:30 PM / 将于明天 14:00 重置 / 3:15 下午重置
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
        const absolute = target.getTime();
        if (absolute >= minMs && absolute <= maxMs) return absolute;
      }
    }

    // 3. 相对倒计时：Resets in 3 hr 12 min / 5 小时后重置 / 1 week 2 days / 3 天 4 小时
    const hasRelativeKeyword =
      /(?:reset(?:s|ting)?\s+in|in\s+\d|后重置|後重置|重置于|剩余|後にリセット|あと)/i.test(
        clean,
      ) ||
      /(?:\d+\s*(?:d|day|days|天|日|h|hr|hrs|hour|hours|小时|小時|時間|m|min|mins|minute|minutes|分钟|分鐘|分|w|week|weeks|周|週)\b)/i.test(
        clean,
      );

    if (hasRelativeKeyword) {
      const weekMatch = clean.match(
        /(\d+(?:\.\d+)?)\s*(?:weeks?|w\b|周|週間|週)/i,
      );
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

      if (weekMatch || dayMatch || hrMatch || minMatch || secMatch) {
        const w = weekMatch ? parseFloat(weekMatch[1]) : 0;
        const d = dayMatch ? parseFloat(dayMatch[1]) : 0;
        const h = hrMatch ? parseFloat(hrMatch[1]) : 0;
        const m = minMatch ? parseFloat(minMatch[1]) : 0;
        const s = secMatch ? parseFloat(secMatch[1]) : 0;
        const totalDays = w * 7 + d;
        const deltaMs = ((totalDays * 24 + h) * 3600 + m * 60 + s) * 1000;
        if (deltaMs > 0 && deltaMs <= 30 * 24 * 3600 * 1000) {
          return Math.round(nowMs + deltaMs);
        }
      }
    }

    return null;
  }

  /**
   * 把单个窗口的解析结果整理成可信状态：百分比取整、重置时间归一化并做“窗口长度”校验。
   * 5 小时窗口一旦拿到的重置时间超过 5.5 小时，就说明抓到了周额度的字段：
   * 该条数据整体作废（返回 null），绝不让 5H 槽位显示 7D 的用量或倒计时。
   */
  function sanitizeMetric(metric, kind, nowMs = Date.now()) {
    if (!metric || typeof metric !== "object") return null;
    const windowMs = kind === "fiveHour" ? FIVE_HOUR_MS : WEEK_MS;

    let pct = null;
    if (typeof metric.pct === "number" && Number.isFinite(metric.pct)) {
      pct = Math.min(100, Math.max(0, Math.round(metric.pct)));
    }
    if (pct === null) return null;

    let resetAt = toEpochMs(metric.resetAt, nowMs);
    let rawResetText =
      typeof metric.rawResetText === "string" ? metric.rawResetText : "";
    if (resetAt === null) {
      rawResetText = "";
    } else {
      const remaining = resetAt - nowMs;
      // 重置时刻超出窗口长度在物理上不可能 → 说明抓到了另一个窗口的字段，整条数据作废
      if (remaining > windowMs + RESET_SLACK_MS) return null;
      if (remaining < 0) {
        resetAt = null;
        rawResetText = "";
      }
    }

    return {
      pct,
      used:
        typeof metric.used === "number" && Number.isFinite(metric.used)
          ? metric.used
          : null,
      limit:
        typeof metric.limit === "number" && Number.isFinite(metric.limit)
          ? metric.limit
          : null,
      resetAt,
      rawResetText,
      confidence:
        typeof metric.confidence === "number"
          ? metric.confidence
          : CONFIDENCE.heuristic,
      updatedAt: 0, // 提交时再写入，缓存恢复的值保持 0 以便被新数据覆盖
    };
  }

  /**
   * 官方的 poolType 枚举 → 内部窗口键
   */
  function poolKindFromLabel(label) {
    if (typeof label !== "string") return null;
    const upper = label.trim().toUpperCase();
    if (!upper) return null;
    if (upper.includes("WEEK") || upper.includes("604800")) return "weekly";
    if (
      upper.includes("FIVE_HOURLY") ||
      upper.includes("FIVE_HOUR") ||
      upper.includes("FIVEHOUR") ||
      upper.includes("5_HOUR") ||
      upper.includes("5H") ||
      upper.includes("18000")
    ) {
      return "fiveHour";
    }
    if (upper.includes("7D") || upper.includes("7_DAY")) return "weekly";
    return null;
  }

  const POOL_KIND_KEY_RE =
    /^(pool_?type|pool_?id|pool_?name|poolType|poolId|bucket|bucket_?type|type|kind|window_?type|quota_?type|limit_?type|id|name)$/i;
  const PCT_KEY_RE = /(percent|pct|ratio|utiliz)/i;
  const USED_KEY_RE = /^(used|used_?count|used_?amount|consumed|count|requests|messages)$/i;
  const LIMIT_KEY_RE = /^(limit|max|maximum|quota|capacity|total|cap)$/i;
  const RESET_KEY_RE = /(refresh|reset|expire|renew)/i;

  function poolKindFromRecord(record) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      return null;
    }
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
    if (value && typeof value === "object") {
      for (const key of ["value", "number", "amount", "count", "used", "percent"]) {
        if (typeof value[key] === "number" && Number.isFinite(value[key])) {
          return value[key];
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

  /**
   * 0~1 视为比率，1 以上视为百分数；统一收敛到 0~100 的整数
   */
  function normalizePctValue(raw) {
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return null;
    if (raw > 0 && raw <= 1) return Math.round(raw * 100);
    return Math.min(100, Math.round(raw));
  }

  function findResetAt(record, nowMs, depth = 0) {
    if (!record || typeof record !== "object" || depth > 2) return null;
    for (const [key, value] of Object.entries(record)) {
      if (!RESET_KEY_RE.test(key)) continue;
      const direct = toEpochMs(value, nowMs);
      if (direct !== null) return direct;
      if (typeof value === "string") {
        const parsed = parseOfficialResetTextToTimestamp(value, nowMs);
        if (parsed !== null) return parsed;
      }
      if (value && typeof value === "object") {
        const nested = findResetAt(value, nowMs, depth + 1);
        if (nested !== null) return nested;
      }
    }
    for (const [key, value] of Object.entries(record)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      if (!/^(gxu|pool|window|quota|limit|usage|refresh|billing)/i.test(key)) continue;
      const nested = findResetAt(value, nowMs, depth + 1);
      if (nested !== null) return nested;
    }
    return null;
  }

  /**
   * 结构化对象：{ poolType: "GXU_FIVE_HOURLY", percentageUsed: 0.12, gxu: { windowRefreshesAt } }
   */
  function readMetricFromRecord(record, kind, nowMs) {
    if (!record || typeof record !== "object" || Array.isArray(record)) return null;

    const scopes = [record];
    for (const [key, value] of Object.entries(record)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      if (/^(gxu|pool|window|quota|limit|usage|bucket)/i.test(key)) scopes.push(value);
    }

    const pctField = findNumericField(scopes, PCT_KEY_RE);
    const usedField = findNumericField(scopes, USED_KEY_RE);
    const limitField = findNumericField(scopes, LIMIT_KEY_RE);

    let pct = pctField ? normalizePctValue(pctField.number) : null;
    const used = usedField ? usedField.number : null;
    const limit = limitField ? limitField.number : null;
    if (pct === null && used !== null && limit !== null && limit > 0) {
      pct = Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
    }
    if (pct === null) return null;

    return { pct, used, limit, resetAt: findResetAt(record, nowMs), rawResetText: "" };
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

  /**
   * 元组形态：["GXU_FIVE_HOURLY", 0.12, 1761000000] / ["5 小时限额", "12%", "..."]
   * 只接受 <= 100 的数值作为百分比，因此 18000 / 604800 这类窗口秒数天然被排除。
   */
  function readMetricFromArrayTuple(node, kind, nowMs) {
    const items = flattenShallow(node);
    const numbers = [];
    let resetAt = null;
    let pct = null;

    for (const item of items) {
      if (typeof item === "number") {
        const timestamp = toEpochMs(item, nowMs);
        if (timestamp !== null) {
          if (!resetAt) resetAt = timestamp;
          continue;
        }
        if (item >= 0 && item <= 100) numbers.push(item);
        continue;
      }
      if (typeof item === "string") {
        const pctMatch = item.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
        if (pctMatch && pct === null) {
          pct = Math.min(100, Math.max(0, Math.round(parseFloat(pctMatch[1]))));
          continue;
        }
        if (!resetAt) {
          const timestamp =
            toEpochMs(item, nowMs) || parseOfficialResetTextToTimestamp(item, nowMs);
          if (timestamp !== null) resetAt = timestamp;
        }
      }
    }

    if (pct === null && numbers.length) {
      const ratio = numbers.find((n) => n > 0 && n <= 1);
      if (ratio !== undefined) {
        pct = Math.round(ratio * 100);
      } else {
        const integer = numbers.find((n) => Number.isInteger(n));
        pct = integer === undefined ? Math.round(numbers[0]) : integer;
      }
    }
    if (pct === null) return null;

    return { pct, used: null, limit: null, resetAt, rawResetText: "" };
  }

  /**
   * 结构化 pools 扫描：按 poolType 精确分池，最高置信度。
   * 同一容器内同时出现两个窗口标签时一律视为父容器，只下钻不取值。
   */
  function collectStructuredPools(rootData, nowMs) {
    const found = { fiveHour: null, weekly: null };
    let hits = 0;

    const record = (kind, candidate) => {
      if (!kind || found[kind]) return;
      const clean = sanitizeMetric(
        { ...candidate, confidence: CONFIDENCE.pools },
        kind,
        nowMs,
      );
      if (!clean) return;
      found[kind] = clean;
      hits += 1;
    };

    function walk(node, depth) {
      if (!node || depth > 20) return;

      if (typeof node === "string") {
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
        const labels = new Set();
        for (const item of flattenShallow(node)) {
          const kind = poolKindFromLabel(item);
          if (kind) labels.add(kind);
        }
        // 同时含两个窗口标签 = 父容器，交给子节点分别处理
        if (labels.size === 1) {
          const kind = [...labels][0];
          const metric = readMetricFromArrayTuple(node, kind, nowMs);
          if (metric) record(kind, metric);
        }
        for (const child of node) walk(child, depth + 1);
        return;
      }

      if (typeof node === "object") {
        const kind = poolKindFromRecord(node);
        if (kind) {
          const metric = readMetricFromRecord(node, kind, nowMs);
          if (metric) record(kind, metric);
        }
        for (const child of Object.values(node)) walk(child, depth + 1);
      }
    }

    walk(rootData, 0);
    return hits > 0 ? found : null;
  }

  /**
   * 标签启发式扫描：父容器（同时含两个窗口标签）只负责下钻，绝不参与取值。
   */
  function collectQuotaByLabels(rootData, nowMs) {
    let found5h = null;
    let found7d = null;

    function walk(node, depth = 0) {
      if (depth > 16 || !node) return;

      if (typeof node === "string") {
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
        const flatStrings = node.filter((x) => typeof x === "string").join(" ");
        const has5hLabel =
          /(?:5\s*-?\s*(?:hour|hr|h|小时|小時|時間)|five\s*-?\s*hour|current\s*session|当前会话|会话|セッション)/i.test(
            flatStrings,
          ) ||
          node.includes(18000) ||
          node.includes("18000");
        const has7dLabel =
          /(?:7\s*-?\s*(?:day|d|天|日)|week(?:ly)?|每周|每週|週間)/i.test(
            flatStrings,
          ) ||
          node.includes(604800) ||
          node.includes("604800");

        // 根因所在：同时命中两个标签的节点是父容器，必须跳过取值，否则 5H 会抓到周额度的数字
        if (has5hLabel !== has7dLabel) {
          const kind = has5hLabel ? "fiveHour" : "weekly";
          const existing = kind === "fiveHour" ? found5h : found7d;
          if (!existing) {
            const metric = readMetricFromArrayTuple(node, kind, nowMs);
            const clean = metric
              ? sanitizeMetric(
                  { ...metric, confidence: CONFIDENCE.heuristic },
                  kind,
                  nowMs,
                )
              : null;
            if (clean) {
              if (kind === "fiveHour") found5h = clean;
              else found7d = clean;
            }
          }
        }

        for (const child of node) walk(child, depth + 1);
        return;
      }

      if (typeof node === "object") {
        const kind = poolKindFromRecord(node);
        if (kind) {
          const existing = kind === "fiveHour" ? found5h : found7d;
          if (!existing) {
            const metric = readMetricFromRecord(node, kind, nowMs);
            const clean = metric
              ? sanitizeMetric(
                  { ...metric, confidence: CONFIDENCE.heuristic },
                  kind,
                  nowMs,
                )
              : null;
            if (clean) {
              if (kind === "fiveHour") found5h = clean;
              else found7d = clean;
            }
          }
        }
        for (const child of Object.values(node)) walk(child, depth + 1);
      }
    }

    walk(rootData, 0);
    if (!found5h && !found7d) return null;
    return { fiveHour: found5h, weekly: found7d };
  }

  /**
   * 递归扫描 Google batchexecute 或 AF_initDataCallback 结构。
   * 结构化 pools 与标签启发式各跑一遍，逐窗口取更高置信度的结果，
   * 因此「服务端只给结构化周额度、5H 仍在元组里」这种混合形态也能补齐。
   */
  function extractQuotaFromWizStructure(rootData, nowMs = Date.now()) {
    if (!rootData || typeof rootData !== "object") return null;

    const structured = collectStructuredPools(rootData, nowMs);
    const labeled = collectQuotaByLabels(rootData, nowMs);
    if (!structured && !labeled) return null;

    return {
      timestamp: nowMs,
      fiveHour: (structured && structured.fiveHour) || (labeled && labeled.fiveHour) || null,
      weekly: (structured && structured.weekly) || (labeled && labeled.weekly) || null,
      strategy: structured ? "pools" : "labels",
    };
  }

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
        // 忽略分片残余
      }
    }
    return results;
  }

  /**
   * 从卡片文本中解析百分比、请求数比率及官方真实重置时间
   */
  function extractMetricFromCardText(cardText, windowType, nowMs) {
    if (!cardText || typeof cardText !== "string") return null;

    let pct = null;
    let used = null;
    let limit = null;

    // 1. 匹配标准百分比
    const pctMatch = cardText.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
    if (pctMatch) {
      pct = Math.min(100, Math.max(0, Math.round(parseFloat(pctMatch[1]))));
    } else {
      // 2. 匹配频次比率（例如 "15 / 50" 或 "15 of 50" 或 "15/50 请求"）
      const ratioMatch = cardText.match(
        /(\d+(?:\.\d+)?)\s*(?:\/|of|共|之)\s*(\d+(?:\.\d+)?)/i,
      );
      if (ratioMatch) {
        const u = parseFloat(ratioMatch[1]);
        const l = parseFloat(ratioMatch[2]);
        if (l > 0) {
          used = u;
          limit = l;
          pct = Math.min(100, Math.max(0, Math.round((u / l) * 100)));
        }
      } else if (
        /(?:已达上限|已用尽|配额耗尽|limit\s*reached|quota\s*exceeded|exhausted)/i.test(
          cardText,
        )
      ) {
        pct = 100;
      }
    }

    if (pct === null) return null;

    // 仅剔除行首的标签头部（例如 "5H: " 或 "当前会话: "），绝不剔除倒计时本身所含的时长单位
    const cleanHeaderPattern =
      windowType === "5h"
        ? /^(?:5\s*-?\s*(?:hour|hr|h|小时|小時|時間)|five\s*-?\s*hour|current\s*session|session|当前会话|会话)[\s:：\-—]*/i
        : /^(?:7\s*-?\s*(?:day|d|天|日)|week(?:ly)?|每周|每週|週間)[\s:：\-—]*/i;

    const lines = cardText
      .split(/[\r\n]+/)
      .map((l) => l.trim())
      .filter(Boolean);

    let resetAt = null;
    let rawResetText = "";

    for (const line of lines) {
      if (
        /(?:reset|重置|刷新|恢复|剩余|後|あと|available|可用|将于|將於)/i.test(
          line,
        )
      ) {
        // 先直接解析完整行（保留 "5小时后重置" 中的数字）
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

    return { pct, used, limit, resetAt, rawResetText };
  }

  /**
   * 从官方 /usage 页面 DOM 或 HTML 中提取配额指标
   */
  function parseUsageDocument(doc, rawHtml = "") {
    const nowMs = Date.now();
    let fiveHour = null;
    let weekly = null;

    // 1. 先检查 HTML 源码内的 AF_initDataCallback
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
          // 继续走 DOM 解析
        }
      }
    }

    if (doc && doc.body) {
      const fiveRegex =
        /(?:5\s*-?\s*(?:hour|hr|h|小时|小時|時間)|five\s*-?\s*hour|current\s*session|session|当前会话|会话(?:配额|限额|用量)?|セッション)/i;
      const weekRegex =
        /(?:7\s*-?\s*(?:day|d|天|日)|week(?:ly)?|每周|每週|週間)/i;
      const strictlyWeekRegex =
        /(?:week(?:ly)?|每周|每週|週間|7\s*-?\s*(?:day|days|天))/i;

      // 2. 扫描独立容器
      const blocks = Array.from(
        doc.querySelectorAll(
          "section, article, [role='region'], [class*='card'], [class*='quota'], [class*='usage'], [class*='limit'], div",
        ),
      );

      for (const node of blocks) {
        const txt = (node.innerText || node.textContent || "").trim();
        if (txt.length < 4 || txt.length > 500) continue;

        const is5h = fiveRegex.test(txt);
        const is7d = weekRegex.test(txt);
        const isStrict7d = strictlyWeekRegex.test(txt);

        // 避免 5H 卡片中因包含日期（如“重置于 7 日”）被 weekRegex 误判
        if (is5h && !isStrict7d && !fiveHour) {
          const m = extractMetricFromCardText(txt, "5h", nowMs);
          if (m) fiveHour = m;
        } else if (is7d && !is5h && !weekly) {
          const m = extractMetricFromCardText(txt, "7d", nowMs);
          if (m) weekly = m;
        }
      }

      // 3. 全文按上下文切片回退提取（前后双向拓展捕获窗口）
      const fullText = doc.body.innerText || doc.body.textContent || "";
      if (!fiveHour) {
        const idx5 = fullText.search(fiveRegex);
        if (idx5 !== -1) {
          fiveHour = extractMetricFromCardText(
            fullText.slice(Math.max(0, idx5 - 120), idx5 + 360),
            "5h",
            nowMs,
          );
        }
      }
      if (!weekly) {
        const idx7 = fullText.search(weekRegex);
        if (idx7 !== -1) {
          weekly = extractMetricFromCardText(
            fullText.slice(Math.max(0, idx7 - 120), idx7 + 360),
            "7d",
            nowMs,
          );
        }
      }
    }

    const tagMetric = (metric, kind) => {
      if (!metric) return null;
      const confidence = Math.max(metric.confidence || 0, CONFIDENCE.dom);
      return sanitizeMetric({ ...metric, confidence }, kind, nowMs);
    };

    fiveHour = tagMetric(fiveHour, "fiveHour");
    weekly = tagMetric(weekly, "weekly");

    if (!fiveHour && !weekly) return null;
    return {
      timestamp: nowMs,
      fiveHour,
      weekly,
      strategy: "dom",
    };
  }

  function commitOfficialQuota(extracted, sourceTag, saveStorage = true) {
    if (!extracted) return false;
    const nowMs = Date.now();

    const applyMetric = (kind, incoming) => {
      const clean = sanitizeMetric(incoming, kind, nowMs);
      if (!clean) return false;

      const prev = quotaState[kind];
      const prevFresh =
        prev.pct !== null && prev.updatedAt > 0 && nowMs - prev.updatedAt < FRESH_MS;

      // 低置信度（标签启发式）不得覆盖仍在新鲜期内的高置信度数据（pools / 官方页面）
      if (prevFresh && clean.confidence < (prev.confidence || 0)) return false;

      // 重置时间只在本次解析可信时才覆盖，避免一次失败解析把倒计时清空
      const resetAt =
        clean.resetAt !== null
          ? clean.resetAt
          : prev.resetAt && prev.resetAt > nowMs
            ? prev.resetAt
            : null;

      quotaState[kind] = {
        ...clean,
        resetAt,
        rawResetText: clean.rawResetText || (resetAt ? prev.rawResetText : ""),
        updatedAt: nowMs,
      };
      return true;
    };

    const ok5h = applyMetric("fiveHour", extracted.fiveHour);
    const ok7d = applyMetric("weekly", extracted.weekly);
    if (!ok5h && !ok7d) return false;

    // 启发式分支最容易把同一个窗口同时写进两个槽位：数值与重置时刻完全一致时保留 7D、丢弃 5H
    if (
      extracted.strategy === "labels" &&
      quotaState.fiveHour.pct !== null &&
      quotaState.weekly.pct !== null &&
      quotaState.fiveHour.pct === quotaState.weekly.pct &&
      quotaState.fiveHour.resetAt !== null &&
      quotaState.fiveHour.resetAt === quotaState.weekly.resetAt
    ) {
      quotaState.fiveHour = {
        pct: null,
        used: null,
        limit: null,
        resetAt: null,
        rawResetText: "",
        confidence: 0,
        updatedAt: 0,
      };
    }

    quotaState.source = sourceTag;
    quotaState.lastSyncTime = extracted.timestamp || nowMs;
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
      const restoreMetric = (metric, kind) => {
        const windowMs = kind === "fiveHour" ? FIVE_HOUR_MS : WEEK_MS;
        const rawResetAt = metric ? toEpochMs(metric.resetAt, now) : null;
        // 历史版本曾把 7D 数据写进 5H：重置时刻超出窗口长度 → 整条 5H 缓存作废
        if (rawResetAt !== null && rawResetAt - now > windowMs + RESET_SLACK_MS) {
          return null;
        }
        const clean = sanitizeMetric(metric, kind, now);
        if (!clean) return null;
        if (clean.resetAt !== null && clean.resetAt <= now) {
          clean.pct = 0;
          clean.resetAt = null;
          clean.rawResetText = "";
        }
        clean.updatedAt = 0; // 缓存仅用于首屏展示，不参与置信度保护
        return clean;
      };

      // 旧版本缓存里没有 confidence 字段，补齐为 0 以便被任意新数据覆盖
      const fiveHourRaw = parsed.fiveHour
        ? { confidence: 0, ...parsed.fiveHour }
        : null;
      const weeklyRaw = parsed.weekly ? { confidence: 0, ...parsed.weekly } : null;

      let fiveHour = restoreMetric(fiveHourRaw, "fiveHour");
      let weekly = restoreMetric(weeklyRaw, "weekly");

      // 两个槽位完全一致 → 串窗期间写入的脏缓存，直接丢弃 5H
      if (
        fiveHour &&
        weekly &&
        fiveHour.pct === weekly.pct &&
        fiveHour.resetAt === weekly.resetAt
      ) {
        fiveHour = null;
      }
      if (!fiveHour && !weekly) return;

      commitOfficialQuota(
        {
          timestamp: parsed.timestamp || 0,
          fiveHour,
          weekly,
          strategy: "cache",
        },
        "cache",
        false,
      );
      quotaState.lastSyncTime = parsed.timestamp || 0;
    } catch {
      // 忽略缓存解析错误
    }
  }

  // =========================================================================
  // 4. 网络观察器（document-start 拦截 XHR + Fetch）
  // =========================================================================
  const RAW_FRAME_LIMIT = 6;
  const RAW_FRAME_MAX_CHARS = 24000;
  const rawFrameRing = [];

  /**
   * 环形缓存最近几帧原始响应，供 __gqc.dump() 回传排查。
   * 仅在命中配额关键字时记录，避免把整段聊天数据留在内存里。
   */
  function rememberRawFrame(url, rpcId, payload) {
    try {
      const text = JSON.stringify(payload);
      if (
        !/GXU_|percentage|percentUsed|usage|quota|18000|604800|windowRefresh/i.test(
          text,
        )
      ) {
        return;
      }
      rawFrameRing.push({
        url,
        rpcId,
        at: new Date().toISOString(),
        size: text.length,
        payload:
          text.length > RAW_FRAME_MAX_CHARS
            ? `${text.slice(0, RAW_FRAME_MAX_CHARS)}…`
            : text,
      });
      while (rawFrameRing.length > RAW_FRAME_LIMIT) rawFrameRing.shift();
    } catch {
      // 无法序列化的载荷直接跳过
    }
  }

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

    if (
      url.includes("StreamGenerateContent") ||
      url.includes("assistant.vertical.chat")
    ) {
      scheduleSyncAfterResponse();
      return;
    }

    if (url.includes("/batchexecute") && responseText) {
      const frames = parseBatchExecuteResponse(responseText);
      for (const frame of frames) {
        rememberRawFrame(url, frame.rpcId, frame.payload);
        const extracted = extractQuotaFromWizStructure(
          frame.payload,
          Date.now(),
        );
        if (extracted) {
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
          // 忽略异常
        }
      });
    }
    return origXhrSend.call(this, body);
  };

  // =========================================================================
  // 5. 主动官方同步器
  // =========================================================================
  let activeSyncPromise = null;
  let probeIframeEl = null;

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
      // 回退到页面解析
    }
    return false;
  }

  function extractViaSameOriginUsageIframe(usageUrl, timeoutMs = 8500) {
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
      let cachedResult = null;
      let debounceTimer = null;

      const done = (res) => {
        if (finished) return;
        finished = true;
        if (debounceTimer) clearTimeout(debounceTimer);
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
          if (!result) return;

          const has5h = result.fiveHour && result.fiveHour.pct !== null;
          const has7d = result.weekly && result.weekly.pct !== null;

          // 当两项指标皆已就绪，立即完成；若仅有一项就绪，设置防抖缓冲防止扼杀 5H 渲染
          if (has5h && has7d) {
            done(result);
            return;
          }

          if (has5h || has7d) {
            cachedResult = result;
            if (!debounceTimer) {
              debounceTimer = setTimeout(() => {
                done(cachedResult);
              }, 1200);
            }
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
          // 走定时轮询
        }
        pollId = setInterval(tryExtract, 300);
      });

      iframe.addEventListener("error", () => done(null));
      document.body.appendChild(iframe);
      setTimeout(() => done(cachedResult || null), timeoutMs);
    });
  }

  async function syncOfficialUsage(isManualClick = false) {
    if (activeSyncPromise) return activeSyncPromise;

    quotaState.isSyncing = true;
    if (isManualClick) {
      quotaState.lastError = "";
    }
    updateUI();

    activeSyncPromise = (async () => {
      try {
        // 0. 当前处于 /usage 页面时直接解析主 DOM
        if (window.location.pathname.endsWith("/usage")) {
          const direct = parseUsageDocument(
            document,
            document.documentElement.innerHTML,
          );
          if (direct && commitOfficialQuota(direct, "usage-page", true)) {
            return true;
          }
        }

        // 1. 优先重放已捕获的 RPC
        const rpcOk = await replayCapturedQuotaRpc();
        if (rpcOk) return true;

        // 2. 检查全局 WIZ_global_data
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

        // 3. GET 同源 /usage 页面 SSR 与内嵌 AF_initDataCallback
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
            if (fromFetch && (fromFetch.fiveHour || fromFetch.weekly)) {
              commitOfficialQuota(fromFetch, "usage-page", true);
              if (fromFetch.fiveHour && fromFetch.weekly) {
                return true;
              }
            }
          }
        } catch {
          // 继续走探针
        }

        // 4. 同源隐藏 Iframe 等待 CSR 异步节点加载
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

  function formatRemainingHuman(ms) {
    if (ms <= 0) return "已到期";
    const totalMin = Math.floor(ms / 60000);
    const days = Math.floor(totalMin / 1440);
    const hours = Math.floor((totalMin % 1440) / 60);
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
    const lines = [`${label} 官方已用: ${metric.pct}%`];
    if (metric.used !== null && metric.limit !== null) {
      lines.push(`频次用量: ${metric.used} / ${metric.limit}`);
    }
    const nowMs = Date.now();
    if (metric.resetAt && metric.resetAt > nowMs) {
      const dt = new Date(metric.resetAt);
      const pad = (n) => String(n).padStart(2, "0");
      lines.push(`官方重置时间: ${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`);
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

  // =========================================================================
  // 7. 样式定义
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
  // 8. UI 装配与渲染更新
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
        // 忽略异常
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
      // 倒计时永远 = 官方重置时刻 − 当前时间，每秒重算
      const remaining = metric.resetAt - now;
      timerNode.textContent = formatCompactCountdown(remaining, isWeekly);
      timerNode.style.color = color.hex;
      timerNode.title = `距官方重置 ${formatRemainingHuman(remaining)}`;
    } else if (metric.rawResetText) {
      // 拿不到官方时间戳时才退化为文案：以抓取时刻为锚点解析，保证倒计时仍在递减
      const anchor = metric.updatedAt > 0 ? metric.updatedAt : now;
      const parsed = parseOfficialResetTextToTimestamp(metric.rawResetText, anchor);
      timerNode.textContent =
        parsed !== null && parsed > now
          ? formatCompactCountdown(parsed - now, isWeekly)
          : metric.rawResetText.slice(0, 10);
      timerNode.style.color = color.hex;
      timerNode.title = metric.rawResetText;
    } else if (pct === 0) {
      timerNode.textContent = "已重置";
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

    const now = Date.now();
    let expired = false;
    for (const kind of ["fiveHour", "weekly"]) {
      const metric = quotaState[kind];
      if (metric.resetAt && metric.resetAt <= now) {
        metric.pct = 0;
        metric.resetAt = null;
        metric.rawResetText = "";
        metric.updatedAt = now;
        expired = true;
      }
    }
    if (
      expired &&
      !quotaState.isSyncing &&
      now - quotaState.lastSyncTime > 30 * 1000
    ) {
      // 窗口刚翻篇，趁早拉一次官方数据；复用响应防抖避免重置瞬间连发
      scheduleSyncAfterResponse();
    }

    const ratio5h = renderMetricUnit(
      quotaState.fiveHour,
      false,
      "5H (会话窗口)",
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

  // =========================================================================
  // 10. 调试出口（控制台可调用，便于回传真实响应核对窗口归属）
  // =========================================================================
  window.__gqc = {
    version: "0.6.0",
    get state() {
      return quotaState;
    },
    get config() {
      return config;
    },
    sync() {
      return syncOfficialUsage(true);
    },
    setDebug(enabled) {
      config.debug = !!enabled;
      saveConfig(config);
    },
    dump() {
      return {
        version: "0.6.0",
        at: new Date().toISOString(),
        href: window.location.href,
        config: { ...config },
        state: {
          source: quotaState.source,
          isSyncing: quotaState.isSyncing,
          lastSyncTime: quotaState.lastSyncTime,
          lastError: quotaState.lastError,
          fiveHour: { ...quotaState.fiveHour },
          weekly: { ...quotaState.weekly },
          capturedRpc: quotaState.capturedQuotaRpc
            ? {
                url: quotaState.capturedQuotaRpc.url,
                rpcId: quotaState.capturedQuotaRpc.rpcId,
              }
            : null,
        },
        frames: rawFrameRing.slice(),
      };
    },
    _test: {
      toEpochMs,
      parseOfficialResetTextToTimestamp,
      sanitizeMetric,
      poolKindFromLabel,
      readMetricFromArrayTuple,
      readMetricFromRecord,
      collectStructuredPools,
      extractQuotaFromWizStructure,
      parseBatchExecuteResponse,
      parseUsageDocument,
      extractMetricFromCardText,
      commitOfficialQuota,
      formatCompactCountdown,
      formatRemainingHuman,
    },
  };

  bootstrap();
})();
