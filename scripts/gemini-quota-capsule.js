// ==UserScript==
// @name         Gemini Quota Capsule
// @namespace    https://cyojkoy.github.io/Payment/
// @version      0.4.0
// @description  专为 Google Gemini 定制的超薄细长条用量监控胶囊：原生 DOM 构造免疫 CSP Trusted Types，后台直连官方 /usage 实时同步 5H 与 7D 双维真实用量及重置时间，支持横条、圆环、圆盘、晶体崩坏 4 种形态。
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
  const STORAGE_KEY_CFG = "__gemini_quota_capsule_cfg_v4__";
  const STORAGE_KEY_SHARED_DATA = "__gemini_quota_shared_metrics_v4__";
  const STORAGE_KEY_LOCAL_LOGS = "__gemini_quota_local_timestamps_v4__";

  const TIME_5H_MS = 5 * 60 * 60 * 1000;
  const TIME_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const AUTO_SYNC_INTERVAL_MS = 3 * 60 * 1000; // 每 3 分钟自动静默同步一次官方数据

  const DEFAULT_CONFIG = {
    limit5h: 50,
    limitWeekly: 500,
    styleMode: "decay", // 'decay' | 'bar' | 'ring' | 'disk'
    pos: { right: 24, bottom: 82 },
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
      console.warn("[Gemini Quota] 配置保存失败:", err);
    }
  }

  const config = loadConfig();

  // =========================================================================
  // 2. 纯原生 DOM 构造器（严格零 innerHTML，完全免疫 CSP Trusted Types）
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
  // 3. 官方重置时间与用量解析引擎（杜绝任何硬编码假时间）
  // =========================================================================
  const usageState = {
    isOfficial: false,
    isSyncing: false,
    lastSyncTime: 0,
    lastSyncError: "",
    fiveHour: { pct: null, refreshAt: null, rawResetText: "" },
    weekly: { pct: null, refreshAt: null, rawResetText: "" },
  };

  /**
   * 获取当前账号对应的官方 /usage 路径（兼容 /u/0/, /u/1/ 多账号路由）
   */
  function getOfficialUsageUrl() {
    const pathMatch = window.location.pathname.match(/^(\/u\/\d+)\b/);
    const prefix = pathMatch ? pathMatch[1] : "";
    return `${window.location.origin}${prefix}/usage`;
  }

  /**
   * 从官方描述文本中解析真实的重置时间戳（毫秒）
   * 支持：
   * 1. 相对时长："Resets in 3 hr 24 min" / "3 小时 20 分钟后重置" / "4 days 12 hr" / "4 天 12 小时后重置" / "3 時間 24 分後"
   * 2. 绝对时刻："Resets at 4:30 PM" / "将于 16:30 重置" / "将于明天 09:15 重置" / "Resets Oct 21, 9:00 AM"
   */
  function parseRealResetTimestamp(text, nowMs = Date.now()) {
    if (!text || typeof text !== "string") return null;
    const normalized = text.replace(/\s+/g, " ").trim();

    // A. 解析相对时间（天 / 小时 / 分钟 / 秒）
    const hasRelativeCue =
      /(?:reset(?:s|ting)?\s+in|in\s+\d|后重置|後重置|重置于|剩余|後にリセット|あと)/i.test(
        normalized,
      ) ||
      /(?:\d+\s*(?:d|day|days|天|日|h|hr|hrs|hour|hours|小时|小時|時|時間|m|min|mins|minute|minutes|分钟|分鐘|分)\b)/i.test(
        normalized,
      );

    if (hasRelativeCue) {
      const dayMatch = normalized.match(
        /(\d+(?:\.\d+)?)\s*(?:days?|d\b|天|日(?![期曜]))/i,
      );
      const hourMatch = normalized.match(
        /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h\b|个?小时|個?小時|時間)/i,
      );
      const minMatch = normalized.match(
        /(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m\b|分钟|分鐘|分(?!钟|鐘|析|辨))/i,
      );
      const secMatch = normalized.match(
        /(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s\b|秒)/i,
      );

      if (dayMatch || hourMatch || minMatch || secMatch) {
        const days = dayMatch ? parseFloat(dayMatch[1]) : 0;
        const hours = hourMatch ? parseFloat(hourMatch[1]) : 0;
        const mins = minMatch ? parseFloat(minMatch[1]) : 0;
        const secs = secMatch ? parseFloat(secMatch[1]) : 0;
        const deltaMs = ((days * 24 + hours) * 3600 + mins * 60 + secs) * 1000;
        if (deltaMs > 0 && deltaMs <= 14 * 24 * 3600 * 1000) {
          return Math.round(nowMs + deltaMs);
        }
      }
    }

    // B. 解析绝对时钟时刻（例如 "Resets at 4:30 PM", "将于明天 14:20 重置", "明日 09:00"）
    const clockMatch = normalized.match(
      /(?:(tomorrow|明天|明日|today|今天|今日)\s*)?(?:at\s*|于\s*|於\s*)?(上午|下午|早上|晚上|凌晨)?\s*(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i,
    );
    if (clockMatch) {
      const dayHint = (clockMatch[1] || "").toLowerCase();
      const cnMeridiem = clockMatch[2] || "";
      let hours = parseInt(clockMatch[3], 10);
      const minutes = parseInt(clockMatch[4], 10);
      const enMeridiem = (clockMatch[5] || "").toUpperCase();

      if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
        if (
          (enMeridiem === "PM" ||
            cnMeridiem === "下午" ||
            cnMeridiem === "晚上") &&
          hours < 12
        ) {
          hours += 12;
        } else if (
          (enMeridiem === "AM" || cnMeridiem === "凌晨") &&
          hours === 12
        ) {
          hours = 0;
        }

        const target = new Date(nowMs);
        target.setHours(hours, minutes, 0, 0);

        if (
          dayHint === "tomorrow" ||
          dayHint === "明天" ||
          dayHint === "明日"
        ) {
          target.setDate(target.getDate() + 1);
        } else if (target.getTime() <= nowMs) {
          target.setDate(target.getDate() + 1);
        }
        return target.getTime();
      }
    }

    // C. 解析月日日期（如 "10月21日 09:00"）
    const cnDateMatch = normalized.match(
      /(\d{1,2})\s*月\s*(\d{1,2})\s*日[^\d]{0,10}?(?:(\d{1,2}):(\d{2}))?/,
    );
    if (cnDateMatch) {
      const now = new Date(nowMs);
      const month = parseInt(cnDateMatch[1], 10) - 1;
      const day = parseInt(cnDateMatch[2], 10);
      const hr = cnDateMatch[3] ? parseInt(cnDateMatch[3], 10) : 0;
      const mn = cnDateMatch[4] ? parseInt(cnDateMatch[4], 10) : 0;
      const candidate = new Date(now.getFullYear(), month, day, hr, mn, 0, 0);
      if (candidate.getTime() < nowMs - 24 * 3600 * 1000) {
        candidate.setFullYear(candidate.getFullYear() + 1);
      }
      if (candidate.getTime() > nowMs) {
        return candidate.getTime();
      }
    }

    return null;
  }

  /**
   * 从单个文本块或 DOM 卡片文本中提取百分比和真实重置时间
   */
  function extractMetricFromSegment(segmentText, nowMs) {
    if (!segmentText) return null;
    const pctMatch = segmentText.match(/(\d{1,3})\s*%/);
    if (!pctMatch) return null;

    const pct = Math.min(100, Math.max(0, parseInt(pctMatch[1], 10)));

    // 优先截取包含 reset / 重置 / リセット 的行或子句来解析时间，避免把 "5 hours" / "7 days" 标题本身误判为剩余时间
    const lines = segmentText
      .split(/[\r\n]+/)
      .map((l) => l.trim())
      .filter(Boolean);

    let refreshAt = null;
    let rawResetText = "";

    for (const line of lines) {
      if (/(?:reset|重置|刷新|恢复|剩余|後|あと|available|可用)/i.test(line)) {
        // 剔除标题中的 "5-hour" / "5 小时" / "7-day" / "7 天" 本身再解析
        const cleanedLine = line
          .replace(/(?:5\s*-?\s*(?:hour|hr|h|小时|小時|時間))/gi, "")
          .replace(/(?:7\s*-?\s*(?:day|d|天|日)|weekly|每周|每週)/gi, "");
        const parsedTs = parseRealResetTimestamp(cleanedLine, nowMs);
        if (parsedTs) {
          refreshAt = parsedTs;
          rawResetText = line;
          break;
        }
      }
    }

    // 若按行未匹配到，对剔除掉窗口名后的整段文本做二次扫描
    if (!refreshAt) {
      const strippedSegment = segmentText
        .replace(/(?:5\s*-?\s*(?:hour|hr|h|小时|小時|時間))/gi, "")
        .replace(/(?:7\s*-?\s*(?:day|d|天|日)|weekly|每周|每週)/gi, "");
      refreshAt = parseRealResetTimestamp(strippedSegment, nowMs);
    }

    return { pct, refreshAt, rawResetText };
  }

  /**
   * 从完整的 /usage 文档（真实 DOM 或 HTML 解析文档）中提取 5H 与 7D 官方指标
   */
  function parseOfficialUsageDocument(doc) {
    if (!doc || !doc.body) return null;
    const nowMs = Date.now();
    const fullText = doc.body.innerText || doc.body.textContent || "";
    if (!fullText || fullText.trim().length < 10) return null;

    let fiveHour = null;
    let weekly = null;

    // 1. 先尝试通过 DOM 卡片/容器节点精确分离 5H 卡片和 7D 卡片
    const candidateNodes = Array.from(
      doc.querySelectorAll(
        "section, article, [role='region'], .usage-card, [class*='card'], [class*='quota'], [class*='limit'], [class*='metric'], div",
      ),
    );

    const fiveKeyRegex =
      /(?:5\s*-?\s*(?:hour|hr|h|小时|小時|時間)|five\s*-?\s*hour)/i;
    const weekKeyRegex =
      /(?:7\s*-?\s*(?:day|d|天|日)|week(?:ly)?|每周|每週|週間)/i;

    for (const node of candidateNodes) {
      const t = (node.innerText || node.textContent || "").trim();
      if (t.length < 6 || t.length > 450) continue;

      const has5h = fiveKeyRegex.test(t);
      const has7d = weekKeyRegex.test(t);

      // 仅当该容器独立描述其中一个窗口且含百分比或 progressbar 时提取
      if (has5h && !has7d && !fiveHour) {
        const metric = extractMetricFromSegment(t, nowMs);
        if (metric !== null) {
          fiveHour = metric;
        } else {
          const bar = node.querySelector("[aria-valuenow]");
          if (bar) {
            const val = parseFloat(bar.getAttribute("aria-valuenow") || "");
            if (!Number.isNaN(val)) {
              fiveHour = {
                pct: Math.round(val),
                refreshAt: parseRealResetTimestamp(
                  t.replace(fiveKeyRegex, ""),
                  nowMs,
                ),
                rawResetText: "",
              };
            }
          }
        }
      } else if (has7d && !has5h && !weekly) {
        const metric = extractMetricFromSegment(t, nowMs);
        if (metric !== null) {
          weekly = metric;
        } else {
          const bar = node.querySelector("[aria-valuenow]");
          if (bar) {
            const val = parseFloat(bar.getAttribute("aria-valuenow") || "");
            if (!Number.isNaN(val)) {
              weekly = {
                pct: Math.round(val),
                refreshAt: parseRealResetTimestamp(
                  t.replace(weekKeyRegex, ""),
                  nowMs,
                ),
                rawResetText: "",
              };
            }
          }
        }
      }
    }

    // 2. 如果 DOM 节点未分离出，则按关键字窗口切片全文进行提取
    if (!fiveHour) {
      const idx5 = fullText.search(fiveKeyRegex);
      if (idx5 !== -1) {
        const slice5 = fullText.slice(Math.max(0, idx5 - 40), idx5 + 260);
        fiveHour = extractMetricFromSegment(slice5, nowMs);
      }
    }
    if (!weekly) {
      const idx7 = fullText.search(weekKeyRegex);
      if (idx7 !== -1) {
        const slice7 = fullText.slice(Math.max(0, idx7 - 40), idx7 + 260);
        weekly = extractMetricFromSegment(slice7, nowMs);
      }
    }

    if (!fiveHour && !weekly) return null;

    return {
      timestamp: nowMs,
      fiveHour: fiveHour || { pct: null, refreshAt: null, rawResetText: "" },
      weekly: weekly || { pct: null, refreshAt: null, rawResetText: "" },
    };
  }

  /**
   * 尝试从 HTML 源码内嵌的 AF_initDataCallback / WIZ JSON 数据中提取百分比与重置时间戳
   */
  function parseOfficialUsageFromRawHtml(htmlText) {
    if (!htmlText || typeof htmlText !== "string") return null;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, "text/html");
      const fromDom = parseOfficialUsageDocument(doc);
      if (fromDom) return fromDom;
    } catch {
      // 忽略 DOMParser 异常，继续尝试文本正则
    }

    // 扫描脚本内嵌数据中的时间戳（秒级 17xxxxxxxxx 或毫秒级）与百分比
    const nowMs = Date.now();
    const fiveMatch = htmlText.match(
      /(?:5\s*-?\s*hour|5\s*小时)[^%]{0,120}?(\d{1,3})\s*%/i,
    );
    const weekMatch = htmlText.match(
      /(?:7\s*-?\s*day|weekly|每周|7\s*天)[^%]{0,120}?(\d{1,3})\s*%/i,
    );

    if (!fiveMatch && !weekMatch) return null;

    return {
      timestamp: nowMs,
      fiveHour: {
        pct: fiveMatch ? parseInt(fiveMatch[1], 10) : null,
        refreshAt: fiveMatch
          ? parseRealResetTimestamp(fiveMatch[0], nowMs)
          : null,
        rawResetText: "",
      },
      weekly: {
        pct: weekMatch ? parseInt(weekMatch[1], 10) : null,
        refreshAt: weekMatch
          ? parseRealResetTimestamp(weekMatch[0], nowMs)
          : null,
        rawResetText: "",
      },
    };
  }

  // =========================================================================
  // 4. 后台主动同步机制（Fetch + 同源隐藏 Iframe 实时渲染探针）
  // =========================================================================
  let hiddenProbeIframe = null;
  let syncPromise = null;

  function applyOfficialPayload(payload, persistToStorage = true) {
    if (!payload || typeof payload !== "object") return false;
    const has5h = payload.fiveHour && typeof payload.fiveHour.pct === "number";
    const has7d = payload.weekly && typeof payload.weekly.pct === "number";
    if (!has5h && !has7d) return false;

    if (has5h) {
      usageState.fiveHour = {
        pct: payload.fiveHour.pct,
        refreshAt: payload.fiveHour.refreshAt || null,
        rawResetText: payload.fiveHour.rawResetText || "",
      };
    }
    if (has7d) {
      usageState.weekly = {
        pct: payload.weekly.pct,
        refreshAt: payload.weekly.refreshAt || null,
        rawResetText: payload.weekly.rawResetText || "",
      };
    }

    usageState.lastSyncTime = payload.timestamp || Date.now();
    usageState.isOfficial = true;
    usageState.lastSyncError = "";

    if (persistToStorage) {
      try {
        localStorage.setItem(
          STORAGE_KEY_SHARED_DATA,
          JSON.stringify({
            timestamp: usageState.lastSyncTime,
            fiveHour: usageState.fiveHour,
            weekly: usageState.weekly,
          }),
        );
      } catch {
        // 忽略存储配额异常
      }
    }
    return true;
  }

  function loadSharedOfficialData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SHARED_DATA);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;

      // 校验并清理已过期的官方重置时间
      const now = Date.now();
      if (
        parsed.fiveHour &&
        parsed.fiveHour.refreshAt &&
        parsed.fiveHour.refreshAt <= now
      ) {
        parsed.fiveHour.pct = 0;
        parsed.fiveHour.refreshAt = null;
      }
      if (
        parsed.weekly &&
        parsed.weekly.refreshAt &&
        parsed.weekly.refreshAt <= now
      ) {
        parsed.weekly.pct = 0;
        parsed.weekly.refreshAt = null;
      }
      applyOfficialPayload(parsed, false);
    } catch {
      // 忽略损坏缓存
    }
  }

  /**
   * 通过同源隐藏 Iframe 挂载 /usage，等待 Angular/Wiz 渲染完真实 DOM 后提取
   */
  function probeViaHiddenIframe(usageUrl, timeoutMs = 8500) {
    return new Promise((resolve) => {
      if (!document.body) {
        resolve(null);
        return;
      }

      if (hiddenProbeIframe && hiddenProbeIframe.parentNode) {
        hiddenProbeIframe.parentNode.removeChild(hiddenProbeIframe);
      }

      const iframe = el("iframe", {
        src: usageUrl,
        "aria-hidden": "true",
        tabindex: "-1",
        style:
          "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;top:-9999px;border:0;",
      });
      hiddenProbeIframe = iframe;

      let settled = false;
      let pollTimer = null;

      const cleanup = (result) => {
        if (settled) return;
        settled = true;
        if (pollTimer) clearInterval(pollTimer);
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
        if (hiddenProbeIframe === iframe) {
          hiddenProbeIframe = null;
        }
        resolve(result);
      };

      const checkIframeDom = () => {
        try {
          const iDoc =
            iframe.contentDocument ||
            (iframe.contentWindow && iframe.contentWindow.document);
          if (!iDoc || !iDoc.body) return;
          const extracted = parseOfficialUsageDocument(iDoc);
          if (
            extracted &&
            (extracted.fiveHour.pct !== null || extracted.weekly.pct !== null)
          ) {
            cleanup(extracted);
          }
        } catch {
          // 跨域或未就绪时忽略
        }
      };

      iframe.addEventListener("load", () => {
        checkIframeDom();
        // SPA 水合通常在 load 后 300ms ~ 3500ms 完成
        pollTimer = setInterval(checkIframeDom, 350);
      });

      iframe.addEventListener("error", () => cleanup(null));
      document.body.appendChild(iframe);
      setTimeout(() => cleanup(null), timeoutMs);
    });
  }

  /**
   * 立即与官方 /usage 同步最新用量及重置时间
   */
  async function syncOfficialUsage() {
    if (syncPromise) return syncPromise;

    usageState.isSyncing = true;
    updateUI();

    syncPromise = (async () => {
      const usageUrl = getOfficialUsageUrl();
      try {
        // 如果当前本身就在 /usage 页面，直接读取当前页面 DOM
        if (window.location.pathname.endsWith("/usage")) {
          const directDomResult = parseOfficialUsageDocument(document);
          if (directDomResult && applyOfficialPayload(directDomResult, true)) {
            return true;
          }
        }

        // 第一步：尝试轻量级同源 fetch
        try {
          const resp = await origFetch.call(window, usageUrl, {
            method: "GET",
            credentials: "include",
            cache: "no-store",
          });
          if (resp.ok) {
            const html = await resp.text();
            const parsedFromFetch = parseOfficialUsageFromRawHtml(html);
            if (
              parsedFromFetch &&
              parsedFromFetch.fiveHour.pct !== null &&
              parsedFromFetch.weekly.pct !== null &&
              applyOfficialPayload(parsedFromFetch, true)
            ) {
              return true;
            }
          }
        } catch {
          // Fetch 失败或为纯 CSR 空壳时继续走 Iframe 水合探针
        }

        // 第二步：挂载同源隐藏 Iframe，等待官方前端水合渲染出真实百分比与重置倒计时文本
        const iframeResult = await probeViaHiddenIframe(usageUrl);
        if (iframeResult && applyOfficialPayload(iframeResult, true)) {
          return true;
        }

        usageState.lastSyncError = "官方 /usage 未返回可识别配额卡片";
        return false;
      } catch (err) {
        usageState.lastSyncError =
          err instanceof Error ? err.message : "同步异常";
        return false;
      } finally {
        usageState.isSyncing = false;
        syncPromise = null;
        updateUI();
      }
    })();

    return syncPromise;
  }

  // =========================================================================
  // 5. 本地滑动窗口真实时间戳保底（当账号无 /usage 权限时使用）
  // =========================================================================
  function getLocalLogs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_LOCAL_LOGS);
      const list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) return [];
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

  function recordLocalUsage(count = 1) {
    try {
      const logs = getLocalLogs();
      const now = Date.now();
      for (let i = 0; i < count; i++) logs.push(now);
      localStorage.setItem(STORAGE_KEY_LOCAL_LOGS, JSON.stringify(logs));
    } catch {
      // 忽略存储异常
    }
    updateUI();
  }

  function calculateLocalStats() {
    const logs = getLocalLogs();
    const now = Date.now();

    const logs5h = logs.filter((ts) => now - ts < TIME_5H_MS);
    const count5h = logs5h.length;
    const refreshAt5h = count5h > 0 ? Math.min(...logs5h) + TIME_5H_MS : null;

    const countWeekly = logs.length;
    const refreshAtWeekly =
      countWeekly > 0 ? Math.min(...logs) + TIME_WEEK_MS : null;

    return {
      pct5h: Math.min(
        100,
        Math.round((count5h / Math.max(1, config.limit5h)) * 100),
      ),
      refreshAt5h,
      pctWeekly: Math.min(
        100,
        Math.round((countWeekly / Math.max(1, config.limitWeekly)) * 100),
      ),
      refreshAtWeekly,
    };
  }

  /**
   * 紧凑型倒计时格式化（适配细长条单行布局）
   */
  function formatCompactCountdown(ms, isWeekly = false) {
    if (ms <= 0) return "已满";
    const totalSec = Math.floor(ms / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    const pad = (n) => String(n).padStart(2, "0");

    if (days > 0) {
      return `${days}d ${pad(hours)}h`;
    }
    if (isWeekly && hours >= 10) {
      return `${pad(hours)}h ${pad(minutes)}m`;
    }
    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  }

  function formatExactResetTimeTitle(refreshAt, rawResetText) {
    if (refreshAt && refreshAt > Date.now()) {
      const dt = new Date(refreshAt);
      const pad = (n) => String(n).padStart(2, "0");
      const dateStr = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
      return rawResetText
        ? `预计重置时间: ${dateStr} (${rawResetText})`
        : `预计重置时间: ${dateStr}`;
    }
    if (rawResetText) return `官方重置状态: ${rawResetText}`;
    return "当前额度充裕 / 暂无待重置冷却";
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
  // 6. 会话请求侦听（对话后自动递增本地保底并触发官方后台同步）
  // =========================================================================
  let lastPromptTime = 0;
  let postPromptSyncTimer = null;

  function onPromptDetected() {
    const now = Date.now();
    if (now - lastPromptTime <= 2500) return;
    lastPromptTime = now;
    recordLocalUsage(1);

    // 对话请求发出 4 秒后自动向官方 /usage 静默拉取最新真实数据
    if (postPromptSyncTimer) clearTimeout(postPromptSyncTimer);
    postPromptSyncTimer = setTimeout(() => {
      syncOfficialUsage();
    }, 4000);
  }

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    try {
      const url =
        typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
      if (
        url.includes("StreamGenerateContent") ||
        url.includes("assistant.vertical.chat")
      ) {
        onPromptDetected();
      }
    } catch {
      // 忽略拦截器异常
    }
    return origFetch.apply(this, args);
  };

  // =========================================================================
  // 7. CSS 样式表注入（超薄细长条状单行布局，26px 高度）
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
      filter: drop-shadow(0 6px 16px rgba(0, 0, 0, 0.45));
    }
    .gc-pill-container {
      display: inline-flex;
      align-items: center;
      height: 26px;
      gap: 7px;
      background: linear-gradient(135deg, rgba(20, 20, 24, 0.94) 0%, rgba(9, 9, 11, 0.97) 100%);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 9999px;
      padding: 0 8px 0 6px;
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
      cursor: grab;
      white-space: nowrap;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .gc-pill-container:active { cursor: grabbing; }
    .gc-pill-container:hover { border-color: rgba(255, 255, 255, 0.28); }

    /* 左侧微缩形态指示器（18x18，点击可切换形态） */
    .gc-capsule-head {
      width: 18px;
      height: 18px;
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      cursor: pointer;
    }

    /* 单行双维度指标单元（5H 与 7D 并排） */
    .gc-metric-group {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 100%;
    }
    .gc-pill-badge {
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: 0.3px;
      padding: 2px 4px;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.08);
      line-height: 1;
    }
    .gc-pill-counter {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11.5px;
      font-weight: 700;
      color: #ffffff;
      font-variant-numeric: tabular-nums;
    }
    .gc-pill-timer {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 10px;
      color: #94a3b8;
      font-variant-numeric: tabular-nums;
      opacity: 0.9;
    }

    /* 横条模式下的内联微缩进度槽 */
    .gc-inline-track {
      width: 26px;
      height: 3px;
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

    /* 1px 垂直细分割线 */
    .gc-v-divider {
      width: 1px;
      height: 11px;
      background: rgba(255, 255, 255, 0.12);
      flex-shrink: 0;
    }

    /* 同步状态圆点 */
    .gc-sync-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      flex-shrink: 0;
      background: #64748b;
      transition: background-color 0.25s, box-shadow 0.25s;
    }
    .gc-sync-dot.official {
      background: #10b981;
      box-shadow: 0 0 5px rgba(16, 185, 129, 0.7);
    }
    .gc-sync-dot.syncing {
      background: #f59e0b;
      box-shadow: 0 0 6px rgba(245, 158, 11, 0.8);
    }

    /* 右侧操作按钮区 */
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
      width: 18px;
      height: 18px;
      padding: 0;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: color 0.18s, background 0.18s;
    }
    .gc-btn-icon:hover {
      color: #f8fafc;
      background: rgba(255, 255, 255, 0.12);
    }
    .gc-btn-icon svg { width: 11.5px; height: 11.5px; }

    @keyframes gc-spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .gc-spinning svg {
      animation: gc-spin 0.8s linear infinite;
      color: #38bdf8;
    }

    /* 圆盘式 (16x16) */
    .gc-disk-box {
      width: 15px;
      height: 15px;
      border-radius: 50%;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(255,255,255,0.18);
    }
    .gc-disk-core {
      position: absolute;
      width: 5px;
      height: 5px;
      background: #09090b;
      border-radius: 50%;
      border: 1px solid rgba(255,255,255,0.22);
    }

    /* 崩坏碎裂式 (16x16) */
    .gc-decay-capsule {
      width: 16px;
      height: 16px;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .gc-decay-body {
      width: 14px;
      height: 14px;
      position: relative;
    }
    .gc-decay-shard {
      position: absolute;
      width: 100%;
      height: 100%;
      top: 0;
      left: 0;
      transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.35s ease;
    }
    .gc-decay-fissures {
      position: absolute;
      inset: -1px;
      pointer-events: none;
      transition: opacity 0.3s ease;
      background: radial-gradient(circle, transparent 40%, var(--glow-color) 120%);
      mix-blend-mode: screen;
    }
    @keyframes gc-jitter {
      0% { transform: translate(0, 0) rotate(0deg); }
      25% { transform: translate(-0.8px, 0.8px) rotate(-1.5deg); }
      50% { transform: translate(0.8px, -0.8px) rotate(1.5deg); }
      75% { transform: translate(-0.8px, -0.6px) rotate(-0.8deg); }
      100% { transform: translate(0, 0) rotate(0deg); }
    }
    .gc-state-critical { animation: gc-jitter 0.18s infinite linear; }

    /* 设置抽屉面板 */
    #gc-pill-drawer {
      position: absolute;
      bottom: calc(100% + 8px);
      right: 0;
      width: 236px;
      background: rgba(15, 17, 23, 0.98);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 10px;
      box-shadow: 0 12px 28px rgba(0,0,0,0.65);
      padding: 10px 12px;
      backdrop-filter: blur(20px);
      display: none;
      flex-direction: column;
      gap: 8px;
      z-index: 10000000;
      white-space: normal;
    }
    #gc-pill-drawer.gc-active { display: flex; }
    .gc-drawer-title {
      font-size: 10.5px;
      font-weight: 700;
      color: #94a3b8;
      letter-spacing: 0.4px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      padding-bottom: 5px;
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
      padding: 4px 2px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 10px;
      text-align: center;
      transition: all 0.18s;
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
      line-height: 1.45;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .gc-link-btn {
      color: #38bdf8;
      text-decoration: underline;
      cursor: pointer;
      display: inline-block;
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
  // 8. UI DOM 节点构建（单行细长条：指示器 + 5H + 7D + 刷新同步 + 设置）
  // =========================================================================
  let rootEl = null;
  let pillContainerEl = null;
  let drawerEl = null;
  let headSlotEl = null;

  // 5H 节点
  let group5hEl = null;
  let badge5hEl = null;
  let usage5hTextEl = null;
  let track5hEl = null;
  let fill5hEl = null;
  let timer5hTextEl = null;

  // 7D 节点
  let group7dEl = null;
  let badge7dEl = null;
  let usage7dTextEl = null;
  let track7dEl = null;
  let fill7dEl = null;
  let timer7dTextEl = null;

  // 状态与控制节点
  let syncDotEl = null;
  let btnRefreshEl = null;
  let statusSourceLineEl = null;
  let statusTimeLineEl = null;
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

    // 左侧指示器（点击可快速切换 4 种视觉形态）
    headSlotEl = el("div", {
      className: "gc-capsule-head",
      id: "gc-head-slot",
      title: "点击切换视觉形态（横条 / 圆环 / 圆盘 / 崩坏）",
      onclick: (e) => {
        e.stopPropagation();
        cycleStyleMode();
      },
    });

    // 5H 指标组
    badge5hEl = el("span", { className: "gc-pill-badge" }, ["5H"]);
    usage5hTextEl = el("span", { className: "gc-pill-counter" }, ["0%"]);
    fill5hEl = el("div", { className: "gc-inline-fill" });
    track5hEl = el("div", { className: "gc-inline-track" }, [fill5hEl]);
    timer5hTextEl = el("span", { className: "gc-pill-timer" }, ["已满"]);
    group5hEl = el("div", { className: "gc-metric-group" }, [
      badge5hEl,
      usage5hTextEl,
      track5hEl,
      timer5hTextEl,
    ]);

    // 7D 指标组
    badge7dEl = el("span", { className: "gc-pill-badge" }, ["7D"]);
    usage7dTextEl = el("span", { className: "gc-pill-counter" }, ["0%"]);
    fill7dEl = el("div", { className: "gc-inline-fill" });
    track7dEl = el("div", { className: "gc-inline-track" }, [fill7dEl]);
    timer7dTextEl = el("span", { className: "gc-pill-timer" }, ["已满"]);
    group7dEl = el("div", { className: "gc-metric-group" }, [
      badge7dEl,
      usage7dTextEl,
      track7dEl,
      timer7dTextEl,
    ]);

    // 同步状态小圆点
    syncDotEl = el("span", {
      className: "gc-sync-dot",
      title: "数据同步状态",
    });

    // 立即同步按钮（原刷新符号修正为立即同步官方最新用量与重置时间）
    const refreshSvg = svgEl(
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
        svgEl("path", {
          d: "M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2",
        }),
      ],
    );

    btnRefreshEl = el(
      "button",
      {
        className: "gc-btn-icon",
        title: "立即从官方 /usage 同步最新用量与重置时间",
        onclick: (e) => {
          e.stopPropagation();
          syncOfficialUsage();
        },
      },
      [refreshSvg],
    );

    // 设置按钮
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
      syncDotEl,
      btnRefreshEl,
      btnSettings,
    ]);

    pillContainerEl = el(
      "div",
      { className: "gc-pill-container", id: "gc-pill-main" },
      [
        headSlotEl,
        group5hEl,
        el("div", { className: "gc-v-divider" }),
        group7dEl,
        el("div", { className: "gc-v-divider" }),
        actionsBox,
      ],
    );

    // 抽屉面板
    const drawerTitle = el("div", { className: "gc-drawer-title" }, [
      el("span", {}, ["指示器形态切换"]),
      el("span", { style: "font-size:9px; color:#64748b;" }, ["可拖拽长条"]),
    ]);

    choiceBtns.length = 0;
    const modeConfigs = [
      { key: "bar", text: "横条" },
      { key: "ring", text: "圆环" },
      { key: "disk", text: "圆盘" },
      { key: "decay", text: "崩坏" },
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

    statusSourceLineEl = el("div", {}, ["数据源：等待同步官方 /usage..."]);
    statusTimeLineEl = el("div", { style: "color:#64748b;" }, [
      "上次同步：尚未同步",
    ]);

    const openUsageLink = el(
      "span",
      {
        className: "gc-link-btn",
        onclick: () => window.open(getOfficialUsageUrl(), "_blank"),
      },
      ["在新标签页查看官方 /usage 页面"],
    );

    const drawerStatus = el("div", { className: "gc-drawer-status" }, [
      statusSourceLineEl,
      statusTimeLineEl,
      openUsageLink,
    ]);

    drawerEl = el("div", { id: "gc-pill-drawer" }, [
      drawerTitle,
      modeGrid,
      drawerStatus,
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
  // 9. 全屏拖拽交互
  // =========================================================================
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

      const rectWidth = pillContainerEl.offsetWidth || 260;
      const newRight = Math.max(
        8,
        Math.min(window.innerWidth - rectWidth - 8, initialRight - dx),
      );
      const newBottom = Math.max(
        8,
        Math.min(window.innerHeight - 36, initialBottom - dy),
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
        // 忽略释放异常
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

  // =========================================================================
  // 10. 4 种微缩进度形态渲染引擎（适配 18x18 超薄高度）
  // =========================================================================
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
        style: `width:10px; height:14px; border-radius:999px; background:linear-gradient(180deg, ${color.hex} 50%, rgba(255,255,255,0.18) 50%); border:1px solid rgba(255,255,255,0.28); box-shadow: 0 0 5px ${color.glow};`,
      });
      headSlotEl.appendChild(miniPill);
      return;
    }

    track5hEl.style.display = "none";
    track7dEl.style.display = "none";

    if (mode === "ring") {
      const radius = 6.5;
      const circumference = 2 * Math.PI * radius;
      const strokeOffset =
        circumference - Math.min(1, dominantRatio) * circumference;

      const ringBg = svgEl("circle", {
        cx: "9",
        cy: "9",
        r: String(radius),
        stroke: "rgba(255, 255, 255, 0.14)",
        "stroke-width": "2.2",
        fill: "none",
      });

      const ringVal = svgEl("circle", {
        cx: "9",
        cy: "9",
        r: String(radius),
        "stroke-width": "2.2",
        "stroke-linecap": "round",
        fill: "none",
        stroke: color.hex,
        style: `stroke-dasharray: ${circumference}; stroke-dashoffset: ${strokeOffset}; filter: drop-shadow(0 0 2px ${color.glow}); transition: stroke-dashoffset 0.35s ease, stroke 0.35s ease;`,
      });

      const ringSvg = svgEl(
        "svg",
        {
          viewBox: "0 0 18 18",
          style: "transform: rotate(-90deg); width:18px; height:18px;",
        },
        [ringBg, ringVal],
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
          style: `background: conic-gradient(${color.hex} 0deg ${degrees}deg, rgba(255,255,255,0.12) ${degrees}deg 360deg); box-shadow: 0 0 5px ${color.glow};`,
        },
        [el("div", { className: "gc-disk-core" })],
      );
      headSlotEl.appendChild(diskBox);
      return;
    }

    if (mode === "decay") {
      const r = Math.min(1.2, dominantRatio);
      const isCritical = r >= 0.88;
      const drift = r * 4.5;
      const rot = r * 26;

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
          style: `clip-path: ${s.clip}; -webkit-clip-path: ${s.clip}; background: linear-gradient(135deg, ${color.hex} 0%, rgba(20,20,25,0.92) 100%); border: 1px solid rgba(255,255,255,0.22); transform: ${transform}; opacity: ${opacity};`,
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

      headSlotEl.appendChild(
        el("div", { className: "gc-decay-capsule" }, [body]),
      );
    }
  }

  // =========================================================================
  // 11. 界面响应式更新（同时刷新 5H 与 7D）
  // =========================================================================
  function updateSingleMetricNode(
    pct,
    refreshAt,
    rawResetText,
    isWeekly,
    badgeNode,
    usageNode,
    timerNode,
    groupNode,
  ) {
    const ratio = pct / 100;
    const color = getProgressColor(ratio);

    badgeNode.style.color = color.hex;
    usageNode.textContent = `${pct}%`;

    const now = Date.now();
    if (pct === 0) {
      timerNode.textContent = "已满";
      timerNode.style.color = "#10b981";
    } else if (refreshAt && refreshAt > now) {
      timerNode.textContent = formatCompactCountdown(refreshAt - now, isWeekly);
      timerNode.style.color = color.hex;
    } else if (rawResetText) {
      timerNode.textContent = rawResetText.slice(0, 10);
      timerNode.style.color = color.hex;
    } else {
      timerNode.textContent = "就绪";
      timerNode.style.color = "#94a3b8";
    }

    groupNode.title = formatExactResetTimeTitle(refreshAt, rawResetText);
    return ratio;
  }

  function updateUI() {
    if (!rootEl) return;

    loadSharedOfficialData();
    const localStats = calculateLocalStats();

    // 5H 数据决策（优先采用官方同步数据，缺失字段使用本地真实时间戳兜底）
    const pct5h =
      usageState.isOfficial && usageState.fiveHour.pct !== null
        ? usageState.fiveHour.pct
        : localStats.pct5h;
    const refreshAt5h =
      usageState.isOfficial && usageState.fiveHour.refreshAt
        ? usageState.fiveHour.refreshAt
        : localStats.refreshAt5h;

    // 7D 数据决策
    const pct7d =
      usageState.isOfficial && usageState.weekly.pct !== null
        ? usageState.weekly.pct
        : localStats.pctWeekly;
    const refreshAt7d =
      usageState.isOfficial && usageState.weekly.refreshAt
        ? usageState.weekly.refreshAt
        : localStats.refreshAtWeekly;

    const ratio5h = updateSingleMetricNode(
      pct5h,
      refreshAt5h,
      usageState.fiveHour.rawResetText,
      false,
      badge5hEl,
      usage5hTextEl,
      timer5hTextEl,
      group5hEl,
    );

    const ratio7d = updateSingleMetricNode(
      pct7d,
      refreshAt7d,
      usageState.weekly.rawResetText,
      true,
      badge7dEl,
      usage7dTextEl,
      timer7dTextEl,
      group7dEl,
    );

    renderIndicatorHead(config.styleMode, ratio5h, ratio7d);

    // 刷新按钮旋转状态与同步状态指示灯
    btnRefreshEl.classList.toggle("gc-spinning", usageState.isSyncing);
    syncDotEl.className = `gc-sync-dot ${
      usageState.isSyncing ? "syncing" : usageState.isOfficial ? "official" : ""
    }`;

    const syncTimeStr =
      usageState.lastSyncTime > 0
        ? new Date(usageState.lastSyncTime).toLocaleTimeString()
        : "尚未同步";

    syncDotEl.title = usageState.isSyncing
      ? "正在从官方 /usage 同步..."
      : usageState.isOfficial
        ? `已同步官方数据 (${syncTimeStr})`
        : "当前为本地滑动窗口估算（点击右侧刷新按钮同步官方数据）";

    statusSourceLineEl.textContent = usageState.isOfficial
      ? "数据源：官方 /usage 实时直连"
      : `数据源：本地窗口估算${usageState.lastSyncError ? ` (${usageState.lastSyncError})` : ""}`;
    statusTimeLineEl.textContent = `上次同步：${syncTimeStr}`;

    for (const btn of choiceBtns) {
      btn.classList.toggle("active", btn.dataset.style === config.styleMode);
    }
  }

  // =========================================================================
  // 12. 自愈保活与启动引导
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
      if (e.key === STORAGE_KEY_SHARED_DATA) {
        updateUI();
      }
    });

    const init = () => {
      createDOM();
      // 启动后立即执行首次官方数据同步
      setTimeout(() => {
        syncOfficialUsage();
      }, 600);

      // 定时后台静默同步官方 /usage
      setInterval(() => {
        syncOfficialUsage();
      }, AUTO_SYNC_INTERVAL_MS);

      // 每秒刷新倒计时与 DOM 自愈检查
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
