// ==UserScript==
// @name         Gemini Quota Capsule
// @namespace    https://cyojkoy.github.io/Payment/
// @version      0.8.6
// @description  参照 Voyager usage-observer 架构：document-start 拦截 XHR/Fetch batchexecute (wrb.fr) 与 /usage 官方数据源，按 poolType 精确分流 5H / 7D 真实用量，重置倒计时基于官方重置时刻与当前时间实时计算。
// @author       Yoko
// @updateURL    https://cdn.jsdelivr.net/gh/CYoJkoY/Yoko-ScriptCat-Scripts@main/scripts/gemini-quota-capsule.js
// @downloadURL  https://ghfast.top/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/main/scripts/gemini-quota-capsule.js
// @match        https://gemini.google.com/*
// @match        https://bard.google.com/*
// @run-at       document-start
// @grant        none
// @noframes
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnIiB4MT0iMCIgeTE9IjAiIHgyPSIxIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjMTBiOTgxIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjMDY1ZjQ2Ii8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiByeD0iMTIiIGZpbGw9IiMwOTA5MGIiLz48ZyB0cmFuc2Zvcm09InJvdGF0ZSgtNDUgMjQgMjQpIj48cmVjdCB4PSIxNCIgeT0iOCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjMyIiByeD0iMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzMzNDE1NSIgc3Ryb2tlLXdpZHRoPSIyLjUiLz48cGF0aCBkPSJNMTQgMThDMTQgMTIuNSAxOC41IDggMjQgOHMxMCA0LjUgMTAgMTB2NkgxNHoiIGZpbGw9InVybCgjZykiLz48cGF0aCBkPSJNMTQgMjRoMjB2NkgxNHoiIGZpbGw9IiMxZTI5M2IiLz48bGluZSB4MT0iMTQiIHkxPSIyNCIgeDI9IjM0IiB5Mj0iMjQiIHN0cm9rZT0iI2Y4ZmFmYyIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1vcGFjaXR5PSIuNiIvPjwvZz48L3N2Zz4=
// @license      MIT
// ==/UserScript==

(function () {
  "use strict";

  const SCRIPT_VERSION = "0.8.7";
  // =========================================================================
  // 1. 常量与持久化配置
  // =========================================================================
  const STORAGE_KEY_CFG = "__gemini_quota_capsule_cfg_v5__";
  // v6 → v7：v0.8.0 把 WIZ_global_data 里的样式/模板文本当成配额，缓存里留下了
  // 大量「已用 100%」的假数据，必须整段作废，否则升级后首屏依旧是 100%。
  const STORAGE_KEY_OFFICIAL_CACHE = "__gemini_quota_official_cache_v7__";

  const AUTO_SYNC_INTERVAL_MS = 3 * 60 * 1000;

  // 两个官方配额窗口的真实长度（5 小时 / 7 天），用于校验重置时间是否发生“串窗”
  const FIVE_HOUR_MS = 5 * 60 * 60 * 1000;
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const RESET_SLACK_MS = 30 * 60 * 1000; // 允许的时钟/服务端抖动
  const FRESH_MS = 10 * 60 * 1000; // 超过该时长未更新的数据不再受置信度保护

  // 数据置信度：结构化 pools > 官方 /usage 页面 > 标签启发式
  const CONFIDENCE = { heuristic: 1, dom: 2, pools: 3 };

  // 解析拒绝计数：只统计「为什么没采信」，供 __gqc.dump() 回传定位，不含页面正文。
  const parseRejectDiag = {
    cssLike: 0, // 命中内联样式 / 模板 / HTML 片段，整段丢弃
    barePercent: 0, // 结构体里没有方向词的裸百分比（旧版会直接当成「已用」）
    unverifiedFull: 0, // 低置信度且无重置时刻的「已用 100%」
  };

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
  // 语义约定（全链路统一）：pct = 剩余百分比，usedPct = 已用百分比。
  // 官方接口给的通常就是「已用比例」（percentageUsed / "34% used"），
  // 所有数据源都必须在解析阶段换算成剩余，显示层不再做任何方向假设。
  const quotaState = {
    source: "init", // 'init' | 'rpc' | 'usage-page' | 'cache' | 'error'
    isSyncing: false,
    lastSyncTime: 0,
    lastError: "",
    fiveHour: {
      pct: null, // 剩余 0 ~ 100
      usedPct: null, // 已用 0 ~ 100
      used: null, // 频次用量（若官方给出 used/limit 对）
      limit: null,
      resetAt: null, // 真实官方重置时间戳 (ms)
      rawResetText: "",
      confidence: 0, // 0 = 未知 / 1 = 标签启发式 / 2 = 官方页面 / 3 = 结构化 pools
      updatedAt: 0, // 该指标最后一次被刷新到的时间，用于置信度保护
    },
    weekly: {
      pct: null, // 剩余 0 ~ 100
      usedPct: null,
      used: null,
      limit: null,
      resetAt: null, // 真实官方重置时间戳 (ms)
      rawResetText: "",
      confidence: 0,
      updatedAt: 0,
    },
    capturedQuotaRpc: null,
    // /usage 通道体检结果：{ url, status, finalUrl, redirected, ok }
    // 官方若没有该页面，GET 会被 302 到 /app，此时必须停用该通道而不是拿 app 的 blob 当配额。
    usagePageStatus: null,
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
      typeof ms === "number" &&
      Number.isFinite(ms) &&
      ms >= minMs &&
      ms <= maxMs;

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

    // 官方页面的相对文案按抓取时刻锚定；绝对日期/时刻则由浏览器本地时区解析。
    // 这里不能使用固定 5H/7D 周期推导刷新时间。
    // 仅将包含 reset/remaining 等锚点的文本交给相对时长解析。
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

    // 1b. 中文日期：10 月 18 日 20:00 / 2026 年 10 月 18 日
    const cnDateMatch = clean.match(
      /(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*(上午|下午|晚上|凌晨)?\s*(\d{1,2}):(\d{2}))?/,
    );
    if (cnDateMatch) {
      const explicitYear = cnDateMatch[1] ? Number(cnDateMatch[1]) : null;
      const month = Number(cnDateMatch[2]);
      const day = Number(cnDateMatch[3]);
      const half = cnDateMatch[4] || "";
      let hour = cnDateMatch[5] === undefined ? 0 : Number(cnDateMatch[5]);
      const minute = cnDateMatch[6] === undefined ? 0 : Number(cnDateMatch[6]);
      if ((half === "下午" || half === "晚上") && hour < 12) hour += 12;
      if (half === "凌晨" && hour === 12) hour = 0;
      if (
        month >= 1 &&
        month <= 12 &&
        day >= 1 &&
        day <= 31 &&
        hour <= 23 &&
        minute <= 59
      ) {
        const year =
          explicitYear === null ? new Date(nowMs).getFullYear() : explicitYear;
        let absolute = new Date(
          year,
          month - 1,
          day,
          hour,
          minute,
          0,
          0,
        ).getTime();
        // 未写年份且已过期一天以上 → 视为次年的同一时刻
        if (explicitYear === null && absolute < nowMs - 86400 * 1000) {
          absolute = new Date(
            year + 1,
            month - 1,
            day,
            hour,
            minute,
            0,
            0,
          ).getTime();
        }
        if (absolute >= minMs && absolute <= maxMs) return absolute;
        // 中文日期本身是权威信息：解析到过去/过远的日期就直接放弃，
        // 不能落回「钟点」分支把 20:00 解释成今天 20:00。
        return null;
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

    // 3. 相对倒计时：Resets in 3 hr 12 min / 4 小时 53 分钟后重置 / 剩余 2 天 3 小时
    //    必须与「重置 / 剩余」语义邻接才可信任。
    //    旧实现只要文本里出现「5 小时」（窗口标签）就会拼出 now + 5h，
    //    导致 5H 倒计时恒为满窗口、7D 倒计时抓到「5 天」之类的标签数字。
    for (const pattern of RELATIVE_RESET_PATTERNS) {
      const match = clean.match(pattern);
      if (!match) continue;
      const deltaMs = sumTrailingDurations(match[1]);
      if (deltaMs !== null && deltaMs > 0 && deltaMs <= 30 * 24 * 3600 * 1000) {
        return Math.round(nowMs + deltaMs);
      }
    }

    return null;
  }

  // 相对时间必须由「重置 / 刷新 / 剩余」锚点短语引出，单独的时间片段不作数
  const RELATIVE_RESET_PATTERNS = [
    /(?:reset(?:s|ting)?|restor(?:e|es|ing)|renew(?:s|ed|ing)?)\s+(?:in|after)\s+([^.;,，。!?]{1,40})/i,
    /([^.;,，。!?]{1,40}?)\s+(?:until|before)\s+(?:the\s+)?(?:next\s+)?(?:reset|refill|renew)/i,
    /([^.;,，。!?]{1,40}?)\s*(?:后|後)\s*(?:重置|刷新|恢复|恢復|重設|リセット)/,
    /(?:剩余|剩餘|还剩|還剩|尚有|还有|還有)\s*([^.;,，。!?]{1,40})/,
    /あと\s*([^。!?]{1,40})/,
  ];

  const DURATION_TOKEN_RE =
    /(\d+(?:\.\d+)?)\s*(weeks?|w|週間|週|周|days?|d|天|日|hours?|hrs?|hr|h|个?小时|個?小時|時間|minutes?|mins?|min|m|分钟|分鐘|分(?!钟|鐘|析|辨|部)|seconds?|secs?|sec|s|秒)\s*$/i;

  function durationUnitToMs(unit) {
    const u = unit.toLowerCase();
    if (/^(w|weeks?|周|週|週間)$/.test(u)) return 7 * 86400 * 1000;
    if (/^(d|days?|天|日)$/.test(u)) return 86400 * 1000;
    if (/^(h|hr|hrs|hours?|小时|小時|時間)$/.test(u)) return 3600 * 1000;
    if (/^(m|min|mins|minutes?|分钟|分鐘|分)$/.test(u)) return 60 * 1000;
    if (/^(s|sec|secs|seconds?|秒)$/.test(u)) return 1000;
    return null;
  }

  /**
   * 从片段尾部连续剥离时间令牌并求和。
   * 「4 小时 53 分」→ 4h53m；「5 小时限额将于 3 小时」只取紧邻锚点的「3 小时」。
   */
  function sumTrailingDurations(fragment) {
    if (typeof fragment !== "string") return null;
    let rest = fragment
      .trim()
      .replace(/[)）\]】]$/, "")
      .trim();
    let total = 0;
    for (let guard = 0; guard < 4; guard += 1) {
      const match = rest.match(DURATION_TOKEN_RE);
      if (!match) break;
      const unitMs = durationUnitToMs(match[2]);
      if (unitMs === null) break;
      total += parseFloat(match[1]) * unitMs;
      rest = rest.slice(0, match.index).trim();
    }
    return total > 0 ? total : null;
  }

  /**
   * 把单个窗口的解析结果整理成可信状态：百分比取整、重置时间归一化并做“窗口长度”校验。
   * 语义约定：pct = **剩余**百分比，usedPct = 已用百分比，两者互补。
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
    const resetOnly = pct === null && metric.allowResetOnly === true;
    if (pct === null && !resetOnly) return null;

    const usedPct =
      typeof metric.usedPct === "number" && Number.isFinite(metric.usedPct)
        ? Math.min(100, Math.max(0, Math.round(metric.usedPct)))
        : pct === null
          ? null
          : 100 - pct;

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

    // 兜底：低置信度来源声称「已用 100%」却拿不到任何官方重置时刻，几乎只可能是
    // 扫描到了无关的 100% 文本（样式、配置、模板）。真实耗尽一定伴随重置窗口。
    // 这里选择「不显示」而不是显示一个假的 100%：宁可空着，也不能骗人。
    const confidence =
      typeof metric.confidence === "number"
        ? metric.confidence
        : CONFIDENCE.heuristic;
    if (
      !resetOnly &&
      usedPct === 100 &&
      resetAt === null &&
      confidence <= CONFIDENCE.heuristic
    ) {
      parseRejectDiag.unverifiedFull += 1;
      return null;
    }

    return {
      pct,
      usedPct,
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
      confidence,
      allowResetOnly: resetOnly,
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
      upper.includes("HOURLY") ||
      upper.includes("PER_HOUR") ||
      upper.includes("PERHOUR") ||
      upper.includes("18000")
    ) {
      return "fiveHour";
    }
    if (upper.includes("7D") || upper.includes("7_DAY")) return "weekly";
    return null;
  }

  const POOL_KIND_KEY_RE =
    /^(pool_?type|pool_?id|pool_?name|poolType|poolId|bucket|bucket_?type|type|kind|window_?type|quota_?type|limit_?type|id|name)$/i;
  const USED_PCT_KEY_RE =
    /(?:percentage|percent|pct|ratio|fraction|utiliz).*used|used.*(?:percentage|percent|pct|ratio|fraction|utiliz)/i;
  const REMAINING_PCT_KEY_RE =
    /(?:remaining|available|left|unused).*(?:percentage|percent|pct|ratio|fraction)|(?:percentage|percent|pct|ratio|fraction).*(?:remaining|available|left|unused)/i;
  const PCT_KEY_RE = /(percent|pct|ratio|utiliz)/i;
  const USED_KEY_RE =
    /^(used|used_?count|used_?amount|consumed|count|requests|messages)$/i;
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
    if (
      Array.isArray(value) &&
      typeof value[0] === "number" &&
      Number.isFinite(value[0])
    ) {
      return value[0];
    }
    if (value && typeof value === "object") {
      for (const key of [
        "value",
        "number",
        "amount",
        "count",
        "used",
        "percent",
      ]) {
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

  const FRACTION_KEY_RE = /(fraction|ratio|0to1|0_to_1)/i;

  /**
   * 字段名线索：fraction / ratio 类字段是 0~1 比率，其余按 0~100 百分数处理。
   */
  function pctHintFromKey(key) {
    if (typeof key !== "string" || !key) return null;
    return FRACTION_KEY_RE.test(key) ? "fraction" : "percent";
  }

  /**
   * 把来源数值归一成 0~100 的整数。
   * 旧实现用 `raw > 0 && raw <= 1 → raw * 100` 判断，把 `1` 这一个值同时当成
   * 「1%」和「100%」：已用 1% 会被读成 100%，剩余 100% 反而变成 1%。判据必须来自字段名。
   * 无字段名线索时，只把「带小数的 0~1 值」当比率（0.34 → 34%），整数 0/1 保留百分数语义。
   */
  function normalizePctValue(raw, hint = null) {
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0)
      return null;
    if (hint === "fraction") return Math.min(100, Math.round(raw * 100));
    if (hint === "percent") return Math.min(100, Math.round(raw));
    if (raw > 0 && raw < 1 && !Number.isInteger(raw)) {
      return Math.min(100, Math.round(raw * 100));
    }
    return Math.min(100, Math.round(raw));
  }

  const QUOTA_SCOPE_KEY_RE =
    /^(gxu|pool|window|quota|limit|usage|refresh|billing|rate)/i;

  /**
   * 收集记录内所有「重置时刻」候选。
   * 旧实现返回第一个命中的值，父容器一旦把周额度的时间先遍历到，5H 就会显示 7D 的倒计时。
   */
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

  /**
   * 在候选重置时刻中挑出与本窗口长度相符的那一个。
   * - 存在「超出窗口长度」的候选且没有相符候选 → 该记录属于另一个窗口，整体作废
   * - 相符候选多于一个 → 无法确定，放弃倒计时（保留百分比），绝不猜
   */
  function pickResetAt(candidates, kind, nowMs) {
    const windowMs = kind === "fiveHour" ? FIVE_HOUR_MS : WEEK_MS;
    const unique = [...new Set(candidates)].sort((a, b) => a - b);
    if (!unique.length) return { resetAt: null, misbound: false };

    const fitting = unique.filter(
      (ts) => ts > nowMs && ts - nowMs <= windowMs + RESET_SLACK_MS,
    );
    const beyondWindow = unique.filter(
      (ts) => ts - nowMs > windowMs + RESET_SLACK_MS,
    );

    if (!fitting.length) {
      return { resetAt: null, misbound: beyondWindow.length > 0 };
    }
    if (fitting.length > 1) return { resetAt: null, misbound: false };
    return { resetAt: fitting[0], misbound: false };
  }

  function findNumberByKey(scope, regex) {
    if (!scope || typeof scope !== "object") return null;
    for (const [key, value] of Object.entries(scope)) {
      if (!regex.test(key)) continue;
      const number = toFiniteNumber(value);
      if (number !== null) return number;
    }
    return null;
  }

  /**
   * 结构化对象：{ poolType: "GXU_FIVE_HOURLY", percentageUsed: 0.12, gxu: { windowRefreshesAt } }
   * 语义：percentageUsed 是已用比例 → 剩余 = 100 - 已用。
   */
  function readMetricFromRecord(record, kind, nowMs) {
    if (!record || typeof record !== "object" || Array.isArray(record))
      return null;

    const scopes = [record];
    for (const [key, value] of Object.entries(record)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
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
        pctHintFromKey(remainingPctField.key),
      );
      if (pct !== null) usedPct = 100 - pct;
    } else if (usedPctField) {
      const value = normalizePctValue(
        usedPctField.number,
        pctHintFromKey(usedPctField.key),
      );
      if (value !== null) {
        usedPct = value;
        pct = 100 - value;
      }
    } else if (ambiguousPctField) {
      // 裸 percent / pct 字段在官方结构里表示「已用比例」，按已用处理
      const value = normalizePctValue(
        ambiguousPctField.number,
        pctHintFromKey(ambiguousPctField.key),
      );
      if (value !== null) {
        usedPct = value;
        pct = 100 - value;
      }
    }

    let used = null;
    let limit = null;

    if (pct === null) {
      // 只有同一个 scope 内同时拿到 used 与 limit 才能换算，跨 scope 拼接等于造数据
      for (const scope of scopes) {
        const u = findNumberByKey(scope, USED_KEY_RE);
        const l = findNumberByKey(scope, LIMIT_KEY_RE);
        if (u !== null && l !== null && l > 0 && u >= 0 && u <= l) {
          used = u;
          limit = l;
          usedPct = Math.min(100, Math.max(0, Math.round((u / l) * 100)));
          pct = 100 - usedPct;
          break;
        }
      }
    } else {
      used = findNumberByKey(record, USED_KEY_RE);
      limit = findNumberByKey(record, LIMIT_KEY_RE);
    }

    if (pct === null) return null;

    const resetPick = pickResetAt(
      collectResetCandidates(record, nowMs),
      kind,
      nowMs,
    );
    if (resetPick.misbound) return null;

    return {
      pct,
      usedPct,
      used,
      limit,
      resetAt: resetPick.resetAt,
      rawResetText: "",
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

  /**
   * 元组形态：["GXU_FIVE_HOURLY", "12% used", 1761000000]
   * 只从**带百分号的字符串**取百分比，并按上下文判定「已用 / 剩余」；
   * 裸数字一律不参与百分比推断（18000 / 604800 / 计数 / 上限都无法区分），
   * 否则就会像旧版那样把上限或窗口长度当成用量。
   */
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
        // 结构体里的字符串先过「像不像配额文本」这一关：内联样式、模板片段直接丢弃。
        if (!isQuotaTextCandidate(item)) continue;
        if (!pctInfo) {
          // 元组路径不允许裸百分比：没有方向词时无法区分「剩余 / 已用」，
          // 旧版默认按「已用」处理，于是任意 100% 都变成「已用 100%」。
          const info = pctFromTextWithContext(item, { allowBare: false });
          if (info) {
            pctInfo = info;
            continue;
          }
        }
        const timestamp =
          toEpochMs(item, nowMs) ||
          parseOfficialResetTextToTimestamp(item, nowMs);
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
      rawResetText: "",
    };
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
          const kind = strictPoolKindFromLabel(item);
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
          /(?:5\s*-?\s*(?:hour|hr|h|小时|小時|時間)|five\s*-?\s*hour|hourly|per\s*hour|每小时|每小時|current\s*session|当前会话|会话|セッション)/i.test(
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
   * 严格 pool 枚举：只有官方 poolType 形态的字符串（GXU_*）才算「结构化」。
   * 旧版用 poolKindFromLabel 的宽松标签（session / week / 18000 / 604800）当结构化依据，
   * 于是整个 WIZ_global_data / 聊天 batchexecute 帧里任何提到 session、week 的数组
   * 都能产出「配额」，并被标成最高置信度——这是「两个窗口都显示已用 100%」的根源。
   */
  function strictPoolKindFromLabel(label) {
    if (typeof label !== "string") return null;
    const upper = label.trim().toUpperCase();
    if (!/^GXU_[A-Z0-9_]{2,}$/.test(upper)) return null;
    if (/(WEEK|7D|604800)/.test(upper)) return "weekly";
    if (/(FIVE_HOURLY|5H|HOUR|18000)/.test(upper)) return "fiveHour";
    return null;
  }

  /**
   * 递归扫描 Google batchexecute 或 AF_initDataCallback 结构。
   * 结构化 pools 与标签启发式各跑一遍，逐窗口取更高置信度的结果，
   * 因此「服务端只给结构化周额度、5H 仍在元组里」这种混合形态也能补齐。
   *
   * options.useLabels = false 时必须禁用标签启发式：整页 bootstrap blob 与聊天 RPC 帧
   * 里的普通数组（配置、会话、样式文本）会被宽松标签误命中，产出完全无关的百分比。
   */
  function extractQuotaFromWizStructure(
    rootData,
    nowMs = Date.now(),
    options = {},
  ) {
    if (!rootData || typeof rootData !== "object") return null;

    const structured = collectStructuredPools(rootData, nowMs);
    const labeled =
      options.useLabels === false
        ? null
        : collectQuotaByLabels(rootData, nowMs);
    if (!structured && !labeled) return null;

    return {
      timestamp: nowMs,
      fiveHour:
        (structured && structured.fiveHour) ||
        (labeled && labeled.fiveHour) ||
        null,
      weekly:
        (structured && structured.weekly) ||
        (labeled && labeled.weekly) ||
        null,
      strategy: structured ? "pools" : "labels",
    };
  }

  function parseBatchExecuteResponse(rawText) {
    if (!rawText || typeof rawText !== "string") return [];
    const results = [];
    const stripped = rawText.replace(/^\)\]\}'\s*/, "");
    const seen = new Set();
    const visit = (value) => {
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
          try { visit(JSON.parse(trimmed)); } catch { /* plain text */ }
        }
        return;
      }
      if (!Array.isArray(value)) return;
      if (
        value[0] === "wrb.fr" &&
        typeof value[1] === "string" &&
        typeof value[2] === "string"
      ) {
        const key = `${value[1]}\u0000${value[2]}`;
        if (seen.has(key)) return;
        seen.add(key);
        let payload = value[2];
        try { payload = JSON.parse(payload); } catch { /* opaque payload */ }
        results.push({ rpcId: value[1], payload });
        return;
      }
      for (const child of value) visit(child);
    };
    for (const line of stripped.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try { visit(JSON.parse(trimmed)); } catch { /* framing residue */ }
    }
    return results;
  }

  // 内联样式 / 模板片段特征：结构体里的 "width:100%"、"transform:translate(0%,0%)"
  // 与配额毫无关系，必须整段排除，否则 100% 会被读成「已用 100%」。
  const CSS_LIKE_RE =
    /(?:^|[;{]\s*)(?:width|height|min-width|max-width|min-height|max-height|opacity|transform|translate|rotate|scale|stroke|fill|margin|padding|border|font-size|line-height|flex|top|left|right|bottom)\s*:/i;

  /**
   * 结构体（WIZ_global_data / AF_initDataCallback / batchexecute 帧）里的字符串
   * 绝大多数与配额无关，只有「短文本、无标签、无样式声明」的串才值得继续解析。
   */
  function isQuotaTextCandidate(text) {
    if (typeof text !== "string") return false;
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 160) return false;
    if (/[{}<>]/.test(trimmed)) return false;
    if (CSS_LIKE_RE.test(trimmed)) return false;
    return true;
  }

  /**
   * 官方 /usage 页面与 RPC 文本里的百分比是「已用」比例（例如 "34% used"），
   * 胶囊显示的是「剩余」，因此必须做语义判定再换算——旧实现直接把数字当剩余，
   * 于是 100% 已用会被显示成「剩余 100%」。
   *
   * options.allowBare 只在「官方 /usage 页面卡片文本」里为 true：该页面默认口径是
   * "N% used"。结构体 / RPC / 全文切片一律不允许裸百分比——那正是 100% 假数据的来源。
   */
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
      if (
        /(剩余|剩餘|可用|余量|餘量|remaining|available|left)/i.test(fragment)
      ) {
        return "remaining";
      }
      if (/(已用|已使用|使用量|用量|used|consumed|utiliz)/i.test(fragment)) {
        return "used";
      }
      return null;
    };

    while ((match = re.exec(text)) !== null) {
      const value = Math.min(
        100,
        Math.max(0, Math.round(parseFloat(match[1]))),
      );
      // 只在本行内看方向词，且优先看紧邻的前文：
      // 「已用 12%\n剩余 88%」里的 12% 不能被下一行的「剩余」抢走方向。
      const lineStart = text.lastIndexOf("\n", match.index);
      const lineEndIdx = text.indexOf("\n", match.index);
      const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx;
      const before = text.slice(
        Math.max(lineStart + 1, match.index - 12),
        match.index,
      );
      const line = text.slice(lineStart + 1, lineEnd);
      const after = text.slice(
        match.index,
        Math.min(lineEnd, match.index + 12),
      );
      const direction =
        directionOf(before) || directionOf(after) || directionOf(line);

      if (direction === "remaining") {
        if (remainingPct === null) remainingPct = value;
      } else if (direction === "used") {
        if (usedPct === null) usedPct = value;
      } else if (barePct === null) {
        // 先记下来：同段里若存在带方向词的百分比，以方向词为准
        barePct = value;
      }
    }

    if (remainingPct !== null)
      return { pct: remainingPct, usedPct: 100 - remainingPct };
    if (usedPct !== null) return { pct: 100 - usedPct, usedPct };
    if (barePct === null) return null;

    if (!allowBare) {
      parseRejectDiag.barePercent += 1;
      return null;
    }
    return { pct: 100 - barePct, usedPct: barePct };
  }

  /**
   * 从卡片文本中解析剩余百分比、请求数比率及官方真实重置时间
   * options.allowBare：卡片文本默认允许裸百分比（官方页面口径 "N% used"），
   * 全文切片等「位置可能切错」的场景必须传 false。
   */
  function extractMetricFromCardText(
    cardText,
    windowType,
    nowMs,
    options = {},
  ) {
    if (!cardText || typeof cardText !== "string") return null;

    let pctInfo = pctFromTextWithContext(cardText, {
      allowBare: options.allowBare !== false,
    });
    let used = null;
    let limit = null;

    if (!pctInfo) {
      // 2. 频次比率（例如 "15 / 50" 或 "15 of 50" 或 "15/50 请求"）：比率本身也是「已用」
      const ratioMatch = cardText.match(
        /(\d+(?:\.\d+)?)\s*(?:\/|of|共|之)\s*(\d+(?:\.\d+)?)/i,
      );
      if (ratioMatch) {
        const u = parseFloat(ratioMatch[1]);
        const l = parseFloat(ratioMatch[2]);
        if (l > 0 && u >= 0 && u <= l) {
          used = u;
          limit = l;
          const usedPct = Math.min(100, Math.max(0, Math.round((u / l) * 100)));
          pctInfo = { pct: 100 - usedPct, usedPct };
        }
      } else if (
        /(?:已达上限|已用尽|配额耗尽|limit\s*reached|quota\s*exceeded|exhausted)/i.test(
          cardText,
        )
      ) {
        // 明确「已用尽」时剩余为 0，而不是 100
        pctInfo = { pct: 0, usedPct: 100 };
      }
    }

    if (!pctInfo) return null;

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

    return {
      pct: pctInfo.pct,
      usedPct: pctInfo.usedPct,
      used,
      limit,
      resetAt,
      rawResetText,
    };
  }

  /**
   * 解析诊断：只记录计数与结论，不含页面正文，供 __gqc.dump() 回传定位。
   */
  const usageParseDiag = {
    blocks: 0,
    initHit: false,
    domHit: false,
    textHit: false,
  };

  /**
   * 从 start 处的 "[" 开始做括号配对扫描，返回对应 "]" 的下标；不匹配返回 -1。
   * 必须跳过字符串字面量与转义，否则页面里任意一个 "]" 字符都会把结构提前截断。
   */
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

  /**
   * 提取页面内所有 AF_initDataCallback 的 data 数组字面量。
   * 旧实现用惰性正则 `\[[^]*?\]\s*(?:,\s*sideChannel|\}\s*\))` 一次性截取：
   * 只要 data 的多层嵌套数组不是「最后一个 ] 紧跟 sideChannel」，整块就失配。
   * 815KB 的 /usage 页面因此一个块都解析不到，随后又静默回落到依赖错误标签的 DOM 兜底。
   */
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
      if (dataAt === -1 || dataAt - at > 4000) break;
      // data: 后面必须是数组，或 data:function(){return [ ... ]}。
      // 官方页面同时存在 data:null / data:{...} 的回调，直接找下一个 "[" 会切到后面的块。
      const tailStart = dataAt + "data:".length;
      const head = html.slice(tailStart, tailStart + 200);
      const arrLead = head.match(
        /^(?:\s*function\s*\([^)]*\)\s*\{\s*(?:return\s*)?)?\s*\[/,
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

  /**
   * 把 /usage CSR 页面里的进度条/ARIA 指标转换成统一 metric。
   * 该页面可能没有可见百分比文本，真实数值只存在 aria-valuenow/value。
   * 只有能从邻近标签明确归属到 5H/7D 的节点才采信，避免把普通 app 进度条当额度。
   */
  function collectProgressbarMetrics(doc, nowMs = Date.now()) {
    const found = { fiveHour: null, weekly: null };
    if (!doc || typeof doc.querySelectorAll !== "function") return found;

    const fiveLabelRe =
      /(?:5\s*-?\s*(?:hours?|hrs?|h|小时|小時|時間)|five\s*-?\s*hours?|hourly|per\s*hour|current\s*session|当前会话|会话)/i;
    const weekLabelRe =
      /(?:7\s*-?\s*(?:day|d|天|日)|week(?:ly)?|每周|每週|週間)/i;
    const usedRe = /(?:已用|已使用|使用量|用量|used|usage|consumed|utiliz)/i;
    const remainingRe =
      /(?:剩余|剩餘|可用|余量|餘量|remaining|available|left)/i;
    const nodes = [];
    const visit = (root) => {
      if (!root || typeof root.querySelectorAll !== "function") return;
      for (const node of root.querySelectorAll(
        "[role='progressbar'], progress, [aria-valuenow]",
      )) {
        nodes.push(node);
      }
      for (const host of root.querySelectorAll("*")) {
        if (host.shadowRoot) visit(host.shadowRoot);
      }
    };
    visit(doc);

    for (const node of nodes) {
      const rawNow = node.getAttribute("aria-valuenow") ?? node.value;
      const rawMax = node.getAttribute("aria-valuemax") ?? node.max ?? 100;
      const value = Number(rawNow);
      const max = Number(rawMax);
      if (
        !Number.isFinite(value) ||
        !Number.isFinite(max) ||
        max <= 0 ||
        value < 0
      ) {
        continue;
      }

      const valueText = [
        node.getAttribute("aria-valuetext") || "",
        node.getAttribute("aria-label") || "",
        node.innerText || "",
      ].join(" ");
      let container = node;
      for (let level = 0; level < 4 && container.parentElement; level += 1) {
        container = container.parentElement;
        const text = (
          container.innerText ||
          container.textContent ||
          ""
        ).trim();
        if (text.length >= 4 && text.length <= 500) break;
      }
      const cardText = (
        container.innerText ||
        container.textContent ||
        ""
      ).trim();
      const context = `${valueText} ${cardText}`;
      const isFive = fiveLabelRe.test(context);
      const isWeekly = weekLabelRe.test(context);
      if (isFive === isWeekly) continue;

      const kind = isFive ? "fiveHour" : "weekly";
      if (found[kind]) continue;
      const ratio = Math.min(1, Math.max(0, value / max));
      const percentage = Math.round(ratio * 100);
      const direction = remainingRe.test(context)
        ? "remaining"
        : usedRe.test(context)
          ? "used"
          : null;
      // aria-valuenow 只有填充值，没有语义方向；取证中的 spinner 也不能当额度。
      if (
        !direction ||
        /loading|加载|recent conversations|recent conversation/i.test(context)
      ) {
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
      };
    }
    return found;
  }

  /**
   * 从官方 /usage 页面 DOM 或 HTML 中提取配额指标
   *
   * 取值顺序：可见 DOM 卡片 → 全文切片 → HTML 内嵌 AF_initDataCallback。
   * 旧版把 AF_initDataCallback 放最前，并用 `if (!fiveHour)` 挡住 DOM：blob 里一旦
   * 误命中无关数字（样式 100%、会话配置…），页面上真实可见的百分比就永远读不到了。
   */
  function parseUsageDocument(doc, rawHtml = "") {
    const nowMs = Date.now();
    let fiveHour = null;
    let weekly = null;

    if (doc && doc.body) {
      const fiveRegex =
        /(?:5\s*-?\s*(?:hour|hr|h|小时|小時|時間)|five\s*-?\s*hour|hourly|per\s*hour|每小时|每小時|current\s*session|session|当前会话|会话(?:配额|限额|用量)?|セッション)/i;
      const weekRegex =
        /(?:7\s*-?\s*(?:day|d|天|日)|week(?:ly)?|每周|每週|週間)/i;
      const strictlyWeekRegex =
        /(?:week(?:ly)?|每周|每週|週間|7\s*-?\s*(?:day|days|天))/i;
      // 严格 5H 标签：不能只用 \dh，否则会误伤日期与普通数字
      const strictlyFiveRegex =
        /(?:5\s*-?\s*(?:hour|hours|hr|hrs|h|小时|小時)|five\s*-?\s*hour|hourly|per\s*hour|每小时|每小時|current\s*session|当前会话)/i;

      // 2. 扫描独立容器
      const blocks = Array.from(
        doc.querySelectorAll(
          "section, article, [role='region'], [class*='card'], [class*='quota'], [class*='usage'], [class*='limit'], div",
        ),
      );

      // 2. 扫描独立容器：同一窗口会被多级容器同时命中（祖先节点的文本包含卡片文本），
      //    优先取文本最短的那个——它才最贴近卡片本身，最不容易夹带别的数字。
      const candidates = { "5h": [], "7d": [] };
      for (const node of blocks) {
        const txt = (node.innerText || node.textContent || "").trim();
        if (txt.length < 4 || txt.length > 500) continue;

        const is5h = fiveRegex.test(txt);
        const is7d = weekRegex.test(txt);
        const isStrict7d = strictlyWeekRegex.test(txt);

        // 避免 5H 卡片中因包含日期（如“重置于 7 日”）被 weekRegex 误判
        if (is5h && !isStrict7d) {
          candidates["5h"].push(txt);
        } else if (is7d && !is5h) {
          candidates["7d"].push(txt);
        }
      }

      const pickShortest = (kind) => {
        const list = candidates[kind]
          .slice()
          .sort((a, b) => a.length - b.length);
        for (const txt of list.slice(0, 5)) {
          const m = extractMetricFromCardText(txt, kind, nowMs);
          if (m) return m;
        }
        return null;
      };

      fiveHour = pickShortest("5h");
      weekly = pickShortest("7d");

      // /usage 是 CSR 时，额度可能只存在 progressbar/ARIA 属性中，不会出现在文本卡片。
      // 仅在窗口标签与方向词都能从同一节点/邻近卡片确认时补入，避免误采普通进度条。
      const progressMetrics = collectProgressbarMetrics(doc, nowMs);
      if (!fiveHour && progressMetrics.fiveHour)
        fiveHour = progressMetrics.fiveHour;
      if (!weekly && progressMetrics.weekly) weekly = progressMetrics.weekly;

      // 3. 全文按上下文切片回退提取：切片必须在「下一个窗口标签」处截断，
      //    否则 5H 切片会把紧随其后的 7D 卡片的百分比和倒计时一起吃进来。
      const fullText = doc.body.innerText || doc.body.textContent || "";
      const sliceUntilNextLabel = (startIdx, stopRegex, maxLen) => {
        const tail = fullText.slice(startIdx, startIdx + maxLen);
        const stop = tail.search(stopRegex);
        return stop > 0 ? tail.slice(0, stop) : tail;
      };

      if (!fiveHour) {
        const idx5 = fullText.search(fiveRegex);
        if (idx5 !== -1) {
          // 切片起点/终点都是猜的，裸百分比在这里不可信
          fiveHour = extractMetricFromCardText(
            sliceUntilNextLabel(idx5, strictlyWeekRegex, 400),
            "5h",
            nowMs,
            { allowBare: false },
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
            { allowBare: false },
          );
        }
      }
    }

    // 4. 最后才解析 HTML 内嵌的 AF_initDataCallback：这是整页 bootstrap 数据，
    //    只能作为可见 DOM 的兜底，且必须禁用标签启发式（严格 GXU pools 才采信）。
    if (rawHtml && (!fiveHour || !weekly)) {
      const rawBlocks = extractInitDataBlocks(rawHtml);
      usageParseDiag.blocks = rawBlocks.length;
      for (const rawBlock of rawBlocks) {
        try {
          const dataArr = JSON.parse(rawBlock);
          const wizExtracted = extractQuotaFromWizStructure(dataArr, nowMs, {
            useLabels: false,
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
          // 忽略非法块
        }
        if (fiveHour && weekly) break;
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
    // 缓存只用于首屏兜底：不得伪装成「刚刚更新」，否则会挡住后续真实数据
    const fromCache = sourceTag === "cache";

    const applyMetric = (kind, incoming) => {
      const clean = sanitizeMetric(incoming, kind, nowMs);
      if (!clean) return false;

      const prev = quotaState[kind];
      const prevFresh =
        prev.pct !== null &&
        prev.updatedAt > 0 &&
        nowMs - prev.updatedAt < FRESH_MS;

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
        updatedAt: fromCache ? 0 : nowMs,
      };
      return true;
    };

    const ok5h = applyMetric("fiveHour", extracted.fiveHour);
    const ok7d = applyMetric("weekly", extracted.weekly);
    if (!ok5h && !ok7d) return false;

    // 注意：两个窗口的剩余比例相同是完全合法的（例如都没用过），
    // 因此不再像旧版那样「数值相同就丢弃 5H」——串窗由 pickResetAt 的
    // 窗口长度校验负责拦截，不靠数值巧合推断。

    quotaState.source = sourceTag;
    quotaState.lastSyncTime = extracted.timestamp || nowMs;
    // 缓存只是兜底，不能清除「未拿到官方数据」的错误状态
    if (!fromCache) quotaState.lastError = "";

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

      // 实时数据比缓存新时，缓存绝不能回写覆盖（storage 事件会重复触发本函数）
      const hasLiveData =
        quotaState.source !== "cache" &&
        (quotaState.fiveHour.pct !== null || quotaState.weekly.pct !== null);
      if (hasLiveData && quotaState.lastSyncTime >= (parsed.timestamp || 0))
        return;

      const now = Date.now();
      const restoreMetric = (metric, kind) => {
        const windowMs = kind === "fiveHour" ? FIVE_HOUR_MS : WEEK_MS;
        const rawResetAt = metric ? toEpochMs(metric.resetAt, now) : null;
        // 历史版本曾把 7D 数据写进 5H：重置时刻超出窗口长度 → 整条 5H 缓存作废
        if (
          rawResetAt !== null &&
          rawResetAt - now > windowMs + RESET_SLACK_MS
        ) {
          return null;
        }
        const clean = sanitizeMetric(metric, kind, now);
        if (!clean) return null;
        if (clean.resetAt !== null && clean.resetAt <= now) {
          // 缓存里的窗口已经翻篇：旧百分比属于上一个窗口，必须作废而不是显示 0%
          clean.pct = null;
          clean.usedPct = null;
          clean.used = null;
          clean.limit = null;
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
      const weeklyRaw = parsed.weekly
        ? { confidence: 0, ...parsed.weekly }
        : null;

      const fiveHour = restoreMetric(fiveHourRaw, "fiveHour");
      const weekly = restoreMetric(weeklyRaw, "weekly");

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
  const RESPONSE_RING_LIMIT = 8;
  const RESPONSE_MAX_CHARS = 12000;
  const responseRing = [];

  /**
   * 轻量观测计数（只存 rpcId 与数量，不保存响应正文）。
   * 用来区分「拦截根本没生效」和「拦到了但没有配额字段」两种完全不同的故障。
   */
  const obsDiag = {
    batchExecSeen: 0,
    batchFrames: 0,
    quotaHits: 0,
    lastRpcIds: [],
    nonQuotaResponses: 0,
    responseReadFailures: 0,
  };
  /**
   * 端点发现环：记录所有 URL 命中 usage/quota/limit 的请求，用来确认配额到底由哪个接口返回。
   * 只存 URL / 状态码 / 长度，不存正文。
   */
  const NET_RING_LIMIT = 24;
  const netRing = [];
  const NET_INTEREST_RE =
    /(batchexecute|usage|quota|limit|entitle|billing|gxu|tier)/i;
  function safeDiagnosticUrl(url, maxLength = 180) {
    if (typeof url !== "string") return "";
    try {
      const parsed = new URL(url, window.location.href);
      const rpcids = parsed.searchParams.get("rpcids");
      const safeQuery = rpcids ? `?rpcids=${encodeURIComponent(rpcids)}` : "";
      const safe = `${parsed.origin}${parsed.pathname}${safeQuery}`;
      return safe.length > maxLength ? `${safe.slice(0, maxLength)}…` : safe;
    } catch {
      const safe = url.split(/[?#]/, 1)[0];
      return safe.length > maxLength ? `${safe.slice(0, maxLength)}…` : safe;
    }
  }

  function noteNetwork(url, status, len) {
    try {
      const text = typeof url === "string" ? url : "";
      if (!text || !NET_INTEREST_RE.test(text)) return;
      netRing.push({
        at: new Date().toISOString(),
        url: safeDiagnosticUrl(text),
        status,
        len,
      });
      while (netRing.length > NET_RING_LIMIT) netRing.shift();
    } catch {
      // 诊断失败不影响主流程
    }
  }

  function noteDiag(rpcId) {
    obsDiag.batchFrames += 1;
    if (rpcId && !obsDiag.lastRpcIds.includes(rpcId)) {
      obsDiag.lastRpcIds.push(rpcId);
      if (obsDiag.lastRpcIds.length > 12) obsDiag.lastRpcIds.shift();
    }
  }

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
        url: safeDiagnosticUrl(url),
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

  function rememberBatchResponse(url, text, frames) {
    if (typeof text !== "string") return;
    const safeText = text.length <= RESPONSE_MAX_CHARS
      ? text
      : `${text.slice(0, RESPONSE_MAX_CHARS / 2)}…${text.slice(-RESPONSE_MAX_CHARS / 2)}`;
    responseRing.push({
      at: new Date().toISOString(),
      url: safeDiagnosticUrl(url),
      size: text.length,
      frameCount: frames.length,
      rpcIds: frames.map((frame) => frame.rpcId).slice(0, 12),
      text: safeText,
    });
    while (responseRing.length > RESPONSE_RING_LIMIT) responseRing.shift();
  }

  // -------------------------------------------------------------------------
  // 取证环：配额字段名没人验证过，只能从真实响应里找。
  // 这里只保留「关键字附近 ±90/110 字符」的片段（每帧最多 2 条），既不落整个报文，
  // 也不落整段聊天，足够看清字段名与 RPC。
  // -------------------------------------------------------------------------
  const SNIPPET_LIMIT = 12;
  const SNIPPET_RADIUS_BEFORE = 90;
  const SNIPPET_RADIUS_AFTER = 110;
  const snippetRing = [];
  const QUOTA_HINT_RE =
    /(quota|rate.?limit|usage.?limit|remaining|percentUsed|percentage|reset|GXU_|限额|限額|额度|額度|用量|剩余|剩餘|已用|重置)/i;

  function shortenUrl(url) {
    if (typeof url !== "string") return "";
    try {
      const parsed = new URL(url, window.location.href);
      const rpcids = parsed.searchParams.get("rpcids");
      const safeQuery = rpcids ? `?rpcids=${encodeURIComponent(rpcids)}` : "";
      const safe = `${parsed.origin}${parsed.pathname}${safeQuery}`;
      return safe.length > 140 ? `${safe.slice(0, 140)}…` : safe;
    } catch {
      const safe = url.split(/[?#]/, 1)[0];
      return safe.length > 140 ? `${safe.slice(0, 140)}…` : safe;
    }
  }

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
        at: new Date().toISOString(),
        kind,
        rpcId: rpcId || null,
        url: shortenUrl(url),
        size: text.length,
        text: snippet,
      });
      while (snippetRing.length > SNIPPET_LIMIT) snippetRing.shift();
      added += 1;
    }
  }

  /**
   * 进度条取证：官方若用 meter / progressbar 画那两根条，数字会落在 aria-valuenow
   * 或 <progress value> 上，比文本更可靠。这里只读取，不做语义假设。
   */
  function collectProgressbarHints() {
    const out = [];
    try {
      const nodes = document.querySelectorAll(
        "[role='progressbar'], progress, [aria-valuenow]",
      );
      for (const node of Array.from(nodes).slice(0, 10)) {
        const attrNow = node.getAttribute("aria-valuenow");
        const attrMax = node.getAttribute("aria-valuemax");
        let cardText = "";
        try {
          const card = node.closest
            ? node.closest("section, article, li, tr, div")
            : null;
          cardText = card
            ? (card.innerText || card.textContent || "").trim()
            : "";
        } catch {
          cardText = "";
        }
        out.push({
          tag: String(node.tagName || "").toLowerCase(),
          now:
            attrNow !== null
              ? attrNow
              : node.value !== undefined
                ? node.value
                : null,
          max:
            attrMax !== null
              ? attrMax
              : node.max !== undefined
                ? node.max
                : null,
          label: (
            node.getAttribute("aria-valuetext") ||
            node.getAttribute("aria-label") ||
            node.innerText ||
            ""
          )
            .replace(/\s+/g, " ")
            .slice(0, 80),
          card: cardText.replace(/\s+/g, " ").slice(0, 140),
        });
      }
    } catch {
      // 诊断失败不影响主流程
    }
    return out;
  }

  /**
   * 当前页面里与「限额 / 用量」有关的可见文本行，最多 8 行。
   * 用户打开 Gemini 自己的限额弹窗后调用，就能看到官方到底怎么表述这两组数字。
   */
  function collectQuotaDomHints() {
    const hints = [];
    try {
      const body = document.body;
      const text = body ? body.innerText || body.textContent || "" : "";
      const lines = text.split(/\n+/);
      const seen = new Set();
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
      // 诊断失败不影响主流程
    }
    return hints;
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

    // 聊天响应也取样：配额元数据很可能就挂在 StreamGenerateContent 的返回里，
    // 旧版在这里直接 return，等于放弃了最可能的数据源。
    if (
      url.includes("StreamGenerateContent") ||
      url.includes("assistant.vertical.chat")
    ) {
      rememberQuotaSnippets("chat", null, url, responseText);
      scheduleSyncAfterResponse();
      return;
    }

    if (url.includes("/batchexecute") && responseText) {
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
            JSON.stringify(frame.payload),
          );
        } catch {
          // 无法序列化就跳过取样
        }
        const extracted = extractQuotaFromWizStructure(
          frame.payload,
          Date.now(),
          { useLabels: false },
        );
        if (extracted) {
          obsDiag.quotaHits += 1;
          if (reqBody && typeof reqBody === "string") {
            quotaState.capturedQuotaRpc = {
              url,
              body: reqBody,
              rpcId: frame.rpcId,
            };
          }
          commitOfficialQuota(extracted, "rpc", true);
        } else {
          obsDiag.nonQuotaResponses += 1;
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
      noteNetwork(url, response.status, 0);
      if (
        url.includes("/batchexecute") ||
        url.includes("StreamGenerateContent") ||
        url.includes("assistant.vertical.chat")
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
      url.includes("StreamGenerateContent") ||
      url.includes("assistant.vertical.chat")
    ) {
      const reqBody = typeof body === "string" ? body : "";
      this.addEventListener("load", function () {
        try {
          noteNetwork(
            url,
            this.status,
            typeof this.responseText === "string"
              ? this.responseText.length
              : 0,
          );
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
          { useLabels: false },
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

          const has5h =
            result.fiveHour &&
            (result.fiveHour.pct !== null || result.fiveHour.resetAt !== null);
          const has7d =
            result.weekly &&
            (result.weekly.pct !== null || result.weekly.resetAt !== null);

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
          const direct = parseUsageDocument(document, "");
          if (direct && commitOfficialQuota(direct, "usage-page", true)) {
            return true;
          }
        }

        // 1. 优先重放已捕获的 RPC
        const rpcOk = await replayCapturedQuotaRpc();
        if (rpcOk) return true;

        // 2. GET 同源 /usage 页面 SSR 与内嵌 AF_initDataCallback
        const usageUrl = getOfficialUsageUrl();
        let usagePageMissing = false;
        try {
          const resp = await origFetch.call(window, usageUrl, {
            method: "GET",
            credentials: "include",
            cache: "no-store",
          });
          const finalPath = (() => {
            try {
              return new URL(resp.url || usageUrl, window.location.href)
                .pathname;
            } catch {
              return "";
            }
          })();
          // /usage 不存在时会被 302 到 /app；继续解析只会拿 app 的 blob 当配额
          usagePageMissing =
            !!resp.redirected && !/\/usage\/?$/.test(finalPath);
          quotaState.usagePageStatus = {
            url: usageUrl,
            status: resp.status,
            finalUrl: shortenUrl(resp.url || ""),
            redirected: !!resp.redirected,
            missing: usagePageMissing,
          };
          if (resp.ok && !usagePageMissing) {
            const rawHtml = await resp.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(rawHtml, "text/html");
            const fromFetch = parseUsageDocument(doc, rawHtml);
            if (fromFetch && (fromFetch.fiveHour || fromFetch.weekly)) {
              // 即便只拿到一个窗口也要提交：另一个窗口稍后由 iframe / 缓存补齐
              commitOfficialQuota(fromFetch, "usage-page", true);
              if (fromFetch.fiveHour && fromFetch.weekly) {
                return true;
              }
            }
          }
        } catch {
          // 继续走探针
        }

        // 3. 同源隐藏 Iframe 等待 CSR 异步节点加载（/usage 不存在时直接跳过）
        if (!usagePageMissing) {
          const fromIframe = await extractViaSameOriginUsageIframe(usageUrl);
          if (
            fromIframe &&
            commitOfficialQuota(fromIframe, "usage-page", true)
          ) {
            return true;
          }
        }

        quotaState.lastError = usagePageMissing
          ? "本次 /usage 通道不可用（已重定向到其他页面），等待官方 RPC 数据"
          : "暂未从官方响应获取到已验证的配额字段";
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
    const usedPct =
      typeof metric.usedPct === "number" && Number.isFinite(metric.usedPct)
        ? metric.usedPct
        : 100 - metric.pct;
    const lines = [`${label} 已用: ${usedPct}% (剩余 ${metric.pct}%)`];
    if (metric.used !== null && metric.limit !== null) {
      lines.push(`频次用量: ${metric.used} / ${metric.limit}`);
    }
    const nowMs = Date.now();
    if (metric.resetAt && metric.resetAt > nowMs) {
      const dt = new Date(metric.resetAt);
      const pad = (n) => String(n).padStart(2, "0");
      lines.push(
        `官方重置时间: ${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`,
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

    badge5hEl = el("span", { className: "gc-pill-badge" }, ["5小时"]);
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

    badge7dEl = el("span", { className: "gc-pill-badge" }, ["每周"]);
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

  function renderIndicatorHead(mode, usedRatio5h, usedRatio7d) {
    if (!headSlotEl) return;
    headSlotEl.textContent = "";

    const used5h = Math.max(0, Math.min(1, usedRatio5h));
    const used7d = Math.max(0, Math.min(1, usedRatio7d));
    // 入参即「已用」比例：填充量与颜色同向，用得越多条越满
    const dominantRatio = Math.max(used5h, used7d);
    const dominantUsed = dominantRatio;
    const color = getProgressColor(dominantUsed);
    const color5h = getProgressColor(used5h);
    const color7d = getProgressColor(used7d);

    if (mode === "bar") {
      track5hEl.style.display = "inline-block";
      fill5hEl.style.width = `${Math.min(100, Math.round(used5h * 100))}%`;
      fill5hEl.style.backgroundColor = color5h.hex;

      track7dEl.style.display = "inline-block";
      fill7dEl.style.width = `${Math.min(100, Math.round(used7d * 100))}%`;
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
      const r = Math.min(1.2, dominantUsed);
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
    if (!metric) {
      badgeNode.style.color = "#94a3b8";
      usageNode.textContent = "--%";
      timerNode.textContent = quotaState.isSyncing ? "同步中" : "待同步";
      timerNode.style.color = "#64748b";
      groupNode.title = formatTooltip(label, metric);
      return 0;
    }

    if (metric.pct === null) {
      badgeNode.style.color = "#94a3b8";
      usageNode.textContent = "--%";
      if (metric.resetAt && metric.resetAt > Date.now()) {
        const remaining = metric.resetAt - Date.now();
        timerNode.textContent = formatCompactCountdown(remaining, isWeekly);
        timerNode.style.color = "#94a3b8";
        timerNode.title = `距官方重置 ${formatRemainingHuman(remaining)}`;
      } else {
        timerNode.textContent = quotaState.isSyncing ? "同步中" : "待同步";
        timerNode.style.color = "#64748b";
      }
      groupNode.title = formatTooltip(label, metric);
      return 0;
    }

    // 主指标 = 已用百分比（用户语义：百分比越高表示用得越多）。
    // metric.pct 仍是「剩余」，这里只做派生，避免缓存与既有判断逻辑失效。
    const usedPct =
      typeof metric.usedPct === "number" && Number.isFinite(metric.usedPct)
        ? metric.usedPct
        : Math.max(0, Math.min(100, 100 - metric.pct));
    const usedRatio = usedPct / 100;
    const color = getProgressColor(usedRatio);

    badgeNode.style.color = color.hex;
    usageNode.textContent = `${usedPct}%`;

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
      const parsed = parseOfficialResetTextToTimestamp(
        metric.rawResetText,
        anchor,
      );
      timerNode.textContent =
        parsed !== null && parsed > now
          ? formatCompactCountdown(parsed - now, isWeekly)
          : metric.rawResetText.slice(0, 10);
      timerNode.style.color = color.hex;
      timerNode.title = metric.rawResetText;
    } else if (usedPct >= 100) {
      // 已用 100% 表示额度耗尽，不是「已重置」
      timerNode.textContent = "已用尽";
      timerNode.style.color = "#f43f5e";
    } else {
      timerNode.textContent = "官方实时";
      timerNode.style.color = "#94a3b8";
    }

    groupNode.title = formatTooltip(label, metric);
    return usedRatio;
  }

  function updateUI() {
    if (!rootEl) return;

    const now = Date.now();
    let expired = false;
    for (const kind of ["fiveHour", "weekly"]) {
      const metric = quotaState[kind];
      if (metric.resetAt && metric.resetAt <= now) {
        // 窗口已翻篇：旧窗口的百分比与倒计时全部失效。
        // 新窗口用量未知，宁可不显示，也不要沿用旧值或伪造 100%。
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
      "5 小时窗口",
      badge5hEl,
      usage5hTextEl,
      timer5hTextEl,
      group5hEl,
    );

    const ratio7d = renderMetricUnit(
      quotaState.weekly,
      true,
      "每周窗口",
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

      // /usage 是纯前端渲染：500ms 时数字往往还没画出来，补几次重试。
      // 这三个时间点覆盖「首屏骨架 → 数据到达 → 图表动画结束」。
      if (/\/usage\/?$/.test(window.location.pathname)) {
        for (const delay of [1500, 5000, 12000]) {
          setTimeout(() => syncOfficialUsage(false), delay);
        }
      }

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
    setDebug(enabled) {
      config.debug = !!enabled;
      saveConfig(config);
    },
    /**
     * 单条命令自检：直连 /usage，回报状态码、AF_initDataCallback 块数与解析结果。
     * 排查「拿不到 5 小时 / 每周用量」时先跑这个，比翻 DOM 快。
     *
     * 注意：本方法返回 Promise。直接 copy(JSON.stringify(__gqc.probeUsage())) 只会
     * 得到 {}（Promise 无法序列化）。结果已自动 console.log，并在 __gqc.lastProbe 留档，
     * 因此正确用法是直接调用：__gqc.probeUsage()
     */
    async probeUsage() {
      const url = getOfficialUsageUrl();
      const resp = await origFetch.call(window, url, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
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
      const redirectedAway =
        !!resp.redirected && !/\/usage\/?$/.test(finalPath);
      let parsed = null;
      if (rawHtml && !redirectedAway) {
        try {
          const domParser = new DOMParser();
          parsed = parseUsageDocument(
            domParser.parseFromString(rawHtml, "text/html"),
            rawHtml,
          );
        } catch (err) {
          parsed = { error: err instanceof Error ? err.message : "解析失败" };
        }
      }
      const result = {
        version: SCRIPT_VERSION,
        url,
        status: resp.status,
        finalUrl: shortenUrl(finalUrl),
        redirectedAway,
        note: redirectedAway
          ? "本次 /usage 通道不可用（最终地址已离开请求路径）"
          : "",
        len: rawHtml.length,
        blocks: usageParseDiag.blocks,
        initHit: usageParseDiag.initHit,
        blockHits: redirectedAway
          ? []
          : extractInitDataBlocks(rawHtml)
              .filter((block) =>
                /hourly|weekly|quota|percent|usage|limit|gxu/i.test(block),
              )
              .slice(0, 5)
              .map((block) => ({
                size: block.length,
                // 只截取片段用于确认字段名，不含会话内容
                excerpt: block.length > 600 ? `${block.slice(0, 600)}…` : block,
              })),
        fiveHour: parsed ? parsed.fiveHour : null,
        weekly: parsed ? parsed.weekly : null,
      };
      this.lastProbe = result;
      try {
        console.log("[Gemini Quota] probeUsage", JSON.stringify(result));
      } catch {
        // 忽略日志异常
      }
      return result;
    },
    /**
     * 一键取证：把「官方到底把这两组数字放在哪里」一次性问清楚。
     * 用法：打开 Gemini 的限额/用量弹窗，再发一条消息，然后在控制台执行
     *   __gqc.report()
     * 结果会自动 console.log 并存入 __gqc.lastReport（只含关键字附近片段，
     * 每帧最多 2 条、每页最多 8 行，不含整段会话）。
     */
    report() {
      const result = {
        version: SCRIPT_VERSION,
        at: new Date().toISOString(),
        href: shortenUrl(window.location.href),
        path: window.location.pathname,
        state: {
          source: quotaState.source,
          lastError: quotaState.lastError,
          fiveHour: {
            pct: quotaState.fiveHour.pct,
            usedPct: quotaState.fiveHour.usedPct,
            confidence: quotaState.fiveHour.confidence,
          },
          weekly: {
            pct: quotaState.weekly.pct,
            usedPct: quotaState.weekly.usedPct,
            confidence: quotaState.weekly.confidence,
          },
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
          snippets: snippetRing.length,
        },
        endpoints: netRing.slice(),
        snippets: snippetRing.slice(),
      };
      this.lastReport = result;
      try {
        console.log("[Gemini Quota] report", JSON.stringify(result, null, 2));
      } catch {
        // 忽略日志异常
      }
      return result;
    },
    dump() {
      return {
        version: SCRIPT_VERSION,
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
          // 拒绝计数：解释「为什么这次没数字」，避免再去猜官方字段
          rejected: { ...parseRejectDiag },
          usagePage: quotaState.usagePageStatus,
          quotaSnippets: snippetRing.length,
          domHints: collectQuotaDomHints(),
          progressbars: collectProgressbarHints(),
        },
      };
    },
    _test: {
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
      extractInitDataBlocks,
      scanBalancedArray,
      normalizePctValue,
      pctHintFromKey,
      extractMetricFromCardText,
      commitOfficialQuota,
      formatCompactCountdown,
      formatRemainingHuman,
    },
  };

  bootstrap();
})();
