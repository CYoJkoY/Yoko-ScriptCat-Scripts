// ==UserScript==
// @name         HeyBox Up
// @namespace    https://cyojkoy.github.io/Payment/
// @version      0.4.38
// @description  补全小黑盒网页收藏：网页收藏列表不显示“插眼”(CY)，本脚本单独拉取 CY 列表，在收藏页（/app/user/favour/content）把 CY 条目补进收藏列表末尾，按帖子去重，结果缓存 10 分钟。社区首页（/app/bbs/home）隐藏右栏热门社区等冗余模块；收藏页、文章管理页与文章详情页隐藏右侧二维码、推广与备案栏。帖子详情页（/app/bbs/link/*）默认进入全屏沉浸阅读：封面完整显示、正文连续滚动，右侧竖排点赞/收藏/评论/CY 发布/分享/行距设置，评论区收进可关闭侧栏，保留原生回复、排序与默认/时间/点赞/作者模式，并按 is_cy 标记屏蔽插眼评论；支持滚轮、方向键、触屏、图片大图与阅读位置记忆，关闭后回到原生双栏。评论预览侧栏同样提供 CY 开关，面板展开后鼠标在卡片上停留即可切换预览，点评论数字始终可用。顶部导航改为首页、社区、收藏、文章四个「SVG + 文本」入口，图标默认播放轻量动效，可在齿轮设置菜单切换为静态；帖子页左右两侧纵轴中心提供 SVG 上一篇/下一篇箭头（快捷键 [ 与 ]），切换走站内路由，不整页刷新；下一篇优先从已发现队列按作者与话题降低关联度选取，队列不足时连续拉取信息流补充，相关推荐仅作兜底。社区页（/app/topic/link/*）提供只在本社区内生效的帖子搜索，支持时间筛选与加载更多。宽屏社区页改为左频道、中信息流、右热度三栏工作台，中间栏居中且宽度可在齿轮设置菜单按屏幕百分比调节（预设或自定义数值），窄屏自动退回双栏或单栏。帖子正文内嵌的游戏、专辑、百科、比赛、模组等卡片，以及“我的文章”创作者页、频道页与用户主页补齐深色适配，用户主页隐藏右栏下载二维码等冗余信息，作者信息浮层同样套用主题；正文按主题校正字色对比，段落间距收窄，正文行距可在齿轮设置或阅读页右侧面板按倍数调节。另提供跟随系统、夜航、纯黑、浅色、纸页、雾青六套主题预设，在导航栏一键切换。需要登录小黑盒：脚本以浏览器内已有登录态请求小黑盒自己的插眼收藏接口（含本地计算的请求签名）；浏览与补全只读，点赞、收藏与 CY 发布仅在用户主动点击时调用站点写接口，不改动站点收藏总数。
// @author       Yoko
// @homepageURL  https://github.com/CYoJkoY/Yoko-ScriptCat-Scripts/blob/main/docs/heybox-up.md
// @supportURL   https://github.com/CYoJkoY/Yoko-ScriptCat-Scripts/issues
// @icon         data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2032%2032'%3E%3Crect%20width='32'%20height='32'%20rx='8'%20fill='%23232b36'/%3E%3Cpath%20d='M9%207.5h14a2.5%202.5%200%200%201%202.5%202.5v12a2.5%202.5%200%200%201-2.5%202.5H9A2.5%202.5%200%200%201%206.5%2022V10A2.5%202.5%200%200%201%209%207.5Z'%20fill='none'%20stroke='%238aa7c4'%20stroke-width='1.6'/%3E%3Cpath%20d='M10.5%2016c1.2-2.1%203.1-3.2%205.5-3.2s4.3%201.1%205.5%203.2c-1.2%202.1-3.1%203.2-5.5%203.2S11.7%2018.1%2010.5%2016Z'%20fill='%23a9c0d8'/%3E%3Ccircle%20cx='16'%20cy='16'%20r='1.7'%20fill='%23232b36'/%3E%3C/svg%3E
// @updateURL    https://cdn.jsdelivr.net/gh/CYoJkoY/Yoko-ScriptCat-Scripts@main/scripts/heybox-up.js
// @downloadURL  https://ghfast.top/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/main/scripts/heybox-up.js
// @match        https://www.xiaoheihe.cn/*
// @match        https://xiaoheihe.cn/*
// @run-at       document-start
// @grant        none
// @noframes
// @license      MIT
// ==/UserScript==

(function () {
  "use strict";

  const CY_API_PATH = "/bbs/app/profile/bbs/comment/list";
  const CY_PAGE_SIZE = 20;
  const CY_MAX_ITEMS = 200;
  const CACHE_TTL_MS = 10 * 60 * 1000;
  const CACHE_KEY_PREFIX = "heybox-up.cy.v1:";
  const LINK_HREF_PREFIX = "/app/bbs/link/";
  const FAVOUR_PATH = "/app/user/favour/content";

  const HIDE_CY_KEY = "heybox-up.hideCy.v1";
  const HIDE_CY_EVENT = "heybox-up:hide-cy";
  const HIDE_CY_STYLE_ID = "heybox-up-cy-style";
  const HIDE_CY_CLASS = "heybox-up-hide-cy";

  function readHideCyPreference() {
    return localStore.read(HIDE_CY_KEY) === "1";
  }

  function ensureHideCyStyle() {
    if (document.getElementById(HIDE_CY_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = HIDE_CY_STYLE_ID;
    style.textContent = "body." + HIDE_CY_CLASS + " [data-heybox-up-cy=\"1\"] { display: none !important; }";
    (document.head || document.documentElement).append(style);
  }

  function applyHideCyPreference(value) {
    ensureHideCyStyle();
    if (document.body) document.body.classList.toggle(HIDE_CY_CLASS, value);
    document.dispatchEvent(new CustomEvent(HIDE_CY_EVENT, { detail: value }));
  }

  function setHideCyPreference(value) {
    localStore.write(HIDE_CY_KEY, value ? "1" : "0");
    applyHideCyPreference(value);
  }

  // 首页评论预览是可选能力：关掉后浮层完全隐藏，也不接管信息流里的评论数字。
  const COMMENT_PREVIEW_KEY = "heybox-up.commentPreview.v1";
  const COMMENT_PREVIEW_EVENT = "heybox-up:comment-preview";

  function readCommentPreviewPreference() {
    return localStore.read(COMMENT_PREVIEW_KEY) !== "0";
  }

  function setCommentPreviewPreference(value) {
    localStore.write(COMMENT_PREVIEW_KEY, value ? "1" : "0");
    document.dispatchEvent(new CustomEvent(COMMENT_PREVIEW_EVENT, { detail: value }));
  }

  // 导航图标默认播放轻量动效，静态版本供不喜欢动画的用户关闭。
  const NAV_MOTION_KEY = "heybox-up.navMotion.v1";
  const NAV_MOTION_EVENT = "heybox-up:nav-motion";

  function readNavMotionPreference() {
    return localStore.read(NAV_MOTION_KEY) !== "0";
  }

  function setNavMotionPreference(value) {
    localStore.write(NAV_MOTION_KEY, value ? "1" : "0");
    document.dispatchEvent(new CustomEvent(NAV_MOTION_EVENT, { detail: value }));
  }

  // 沉浸阅读默认开启；关闭后帖子页回到原有的双栏阅读布局。
  const READER_KEY = "heybox-up.reader.v1";
  const READER_EVENT = "heybox-up:reader";

  function readReaderPreference() {
    return localStore.read(READER_KEY) !== "0";
  }

  function setReaderPreference(value) {
    localStore.write(READER_KEY, value ? "1" : "0");
    document.dispatchEvent(new CustomEvent(READER_EVENT, { detail: value }));
  }

  // 社区工作台的中间栏宽度：按视口百分比记，默认 56%，两侧等宽留白。
  const FEED_WIDTH_KEY = "heybox-up.feedWidth.v1";
  const FEED_WIDTH_DEFAULT = 56;
  const FEED_WIDTH_MIN = 40;
  const FEED_WIDTH_MAX = 76;
  const FEED_WIDTH_STEP = 1;

  function normalizeFeedWidth(value) {
    // localStorage 未设置时 getItem 返回 null；Number(null) 是 0，会被误夹到下限 40。
    if (value === null || value === undefined || value === "") return FEED_WIDTH_DEFAULT;
    const parsed = Math.round(Number(value));
    if (!Number.isFinite(parsed)) return FEED_WIDTH_DEFAULT;
    return Math.min(FEED_WIDTH_MAX, Math.max(FEED_WIDTH_MIN, parsed));
  }

  function readFeedWidth() {
    return normalizeFeedWidth(localStore.read(FEED_WIDTH_KEY));
  }

  function applyFeedWidth(value) {
    const width = normalizeFeedWidth(value);
    document.documentElement.style.setProperty("--heybox-up-feed-pct", String(width));
    return width;
  }

  function setFeedWidthPreference(value) {
    const width = applyFeedWidth(value);
    localStore.write(FEED_WIDTH_KEY, String(width));
    return width;
  }

  // Number inputs declare a step; a value off that grid is invalid even when it is
  // inside the range, so callers must restore the stored value instead of rounding.
  function isStepAligned(value, base, step) {
    const steps = (value - base) / step;
    return Math.abs(steps - Math.round(steps)) < 1e-6;
  }

  function parseFeedWidthInput(value) {
    // Empty or invalid input returns null so the caller restores the stored value;
    // normalizeFeedWidth would silently fall back to the default instead.
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    if (text === "") return null;
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) return null;
    if (!isStepAligned(parsed, FEED_WIDTH_MIN, FEED_WIDTH_STEP)) return null;
    return Math.min(FEED_WIDTH_MAX, Math.max(FEED_WIDTH_MIN, Math.round(parsed)));
  }

  // Body line height: applies to article body text only; headings, code blocks and
  // site cards keep their own line heights.
  const READER_LINE_HEIGHT_KEY = "heybox-up.readerLineHeight.v1";
  const READER_LINE_HEIGHT_DEFAULT = 1.7;
  const READER_LINE_HEIGHT_MIN = 1.4;
  const READER_LINE_HEIGHT_MAX = 2.2;
  const READER_LINE_HEIGHT_STEP = 0.05;

  function normalizeReaderLineHeight(value) {
    if (value === null || value === undefined || value === "") return READER_LINE_HEIGHT_DEFAULT;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return READER_LINE_HEIGHT_DEFAULT;
    return Math.min(READER_LINE_HEIGHT_MAX, Math.max(READER_LINE_HEIGHT_MIN, Math.round(parsed * 100) / 100));
  }

  function parseReaderLineHeightInput(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    if (text === "") return null;
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) return null;
    if (!isStepAligned(parsed, READER_LINE_HEIGHT_MIN, READER_LINE_HEIGHT_STEP)) return null;
    return Math.min(READER_LINE_HEIGHT_MAX, Math.max(READER_LINE_HEIGHT_MIN, Math.round(parsed * 100) / 100));
  }

  function readReaderLineHeight() {
    return normalizeReaderLineHeight(localStore.read(READER_LINE_HEIGHT_KEY));
  }

  function applyReaderLineHeight(value) {
    const lineHeight = normalizeReaderLineHeight(value);
    document.documentElement.style.setProperty("--heybox-up-reading-line-height", String(lineHeight));
    return lineHeight;
  }

  function setReaderLineHeightPreference(value) {
    const lineHeight = applyReaderLineHeight(value);
    localStore.write(READER_LINE_HEIGHT_KEY, String(lineHeight));
    return lineHeight;
  }

  // 站点会在评论上带 is_cy，值可能是数字 1、字符串 "1" 或布尔 true。
  function isCyComment(comment) {
    return Boolean(comment) && (comment.is_cy === 1 || comment.is_cy === true || comment.is_cy === "1");
  }

  function createStorageAccess(storageName) {
    const memory = new Map();
    const read = (key) => {
      if (memory.has(key)) return memory.get(key);
      try {
        const value = window[storageName].getItem(key);
        if (value !== null) memory.set(key, value);
        return value;
      } catch (error) {
        return null;
      }
    };
    const write = (key, value) => {
      memory.set(key, value);
      try {
        window[storageName].setItem(key, value);
        return true;
      } catch (error) {
        return false;
      }
    };
    return {
      read: read,
      write: write,
      readJson: (key, fallback) => {
        const raw = read(key);
        if (raw === null) return fallback;
        try {
          return JSON.parse(raw);
        } catch (error) {
          return fallback;
        }
      },
      writeJson: (key, value) => write(key, JSON.stringify(value)),
    };
  }

  const localStore = createStorageAccess("localStorage");
  const sessionStore = createStorageAccess("sessionStorage");

  const REQUEST_TIMEOUT_MS = 15000;

  function isAbortError(error) {
    return error instanceof DOMException && error.name === "AbortError";
  }

  function waitForDelay(ms, signal) {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      if (signal?.aborted === true) {
        reject(signal.reason || new DOMException("请求已取消", "AbortError"));
        return;
      }
      const timer = window.setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        window.clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        reject(signal?.reason || new DOMException("请求已取消", "AbortError"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const externalSignal = options.signal;
    const abortFromExternal = () => controller.abort(externalSignal.reason);
    if (externalSignal?.aborted === true) controller.abort(externalSignal.reason);
    else externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
    const timer = window.setTimeout(() => {
      controller.abort(new DOMException("请求超时", "TimeoutError"));
    }, timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      window.clearTimeout(timer);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    }
  }

  // Page edits arrive in bursts. One bounded observer replaces the independent body observers
  // so unrelated mutations cannot fan out into every route-specific sync on the same frame.
  const PAGE_SYNC_INTERVAL_MS = 120;
  const PAGE_ROUTE = Object.freeze({
    ARTICLE: "article",
    FAVOUR: "favour",
    FEED: "feed",
    TOPIC: "topic",
    CREATOR: "creator",
    OTHER: "other",
  });
  const PAGE_ROUTE_RULES = [
    { id: PAGE_ROUTE.ARTICLE, pattern: /^\/app\/bbs\/link\/\d+(?:\/|$)/ },
    { id: PAGE_ROUTE.FAVOUR, pattern: /^\/app\/user\/favour\/content(?:\/|$)/ },
    { id: PAGE_ROUTE.FEED, pattern: /^\/(?:$|app\/bbs\/home(?:\/|$))/ },
    { id: PAGE_ROUTE.TOPIC, pattern: /^\/app\/topic\/link\/\d+(?:\/|$)/ },
    { id: PAGE_ROUTE.CREATOR, pattern: /^\/creator(?:\/|$)/ },
  ];
  const pageSyncTasks = new Map();
  const pageMutationRevisions = { feed: 0, article: 0, topic: 0, favour: 0, creator: 0, chrome: 0 };
  const PAGE_MUTATION_REGION_SELECTORS = {
    feed: "#page-bbs-community, #heybox-up-comment-rail",
    article: "#page-bbs-link, #heybox-up-reader",
    topic: "#page-topic-link, #heybox-up-community-search",
    favour: ".user-favour, #heybox-up-favour",
    creator: "#page-creator-content-management, #page-creator-content-management-detail",
    chrome: ".nav, .nav-actions, #heybox-up-nav, #heybox-up-theme-entry",
  };
  const PAGE_MUTATION_REGION_ENTRIES = Object.entries(PAGE_MUTATION_REGION_SELECTORS);
  const PAGE_MUTATION_REGION_COMBINED = PAGE_MUTATION_REGION_ENTRIES.map((entry) => entry[1]).join(", ");
  const PAGE_MUTATION_IGNORE_SELECTOR = '[id^="heybox-up-"], input, textarea, select, [contenteditable]:not([contenteditable="false"])';
  const EMBEDDED_MEDIA_SELECTOR = "iframe, video, audio, embed, object";
  const EMBEDDED_MEDIA_WRAPPER_SELECTOR = "div.iframe";
  const EMBEDDED_MEDIA_OBSERVED_SELECTOR = `${EMBEDDED_MEDIA_SELECTOR}, ${EMBEDDED_MEDIA_WRAPPER_SELECTOR}`;
  const EMBEDDED_MEDIA_SOURCE_ATTRIBUTES = ["src", "srcdoc", "data"];
  const EMBEDDED_MEDIA_ATTRIBUTES = [...EMBEDDED_MEDIA_SOURCE_ATTRIBUTES, "width", "height", "hidden", "style"];
  // Site layout toggles often land on an ancestor class or visibility attribute, which hides an embed indirectly.
  const ARTICLE_LAYOUT_OBSERVED_SELECTOR = "#page-bbs-link";
  const PAGE_SYNC_ATTRIBUTE_FILTER = [...EMBEDDED_MEDIA_ATTRIBUTES, "class"];
  let pageSyncTimer = 0;
  let pageSyncLastRun = 0;
  let pageSyncRoute = readPageRoute();
  let pageSyncForceAll = false;

  function readPageRoute(pathname = location.pathname) {
    for (const rule of PAGE_ROUTE_RULES) {
      if (rule.pattern.test(pathname)) return rule.id;
    }
    return PAGE_ROUTE.OTHER;
  }

  function registerPageSync(task, intervalMs = 0, routes = null, region = null) {
    pageSyncTasks.set(task, {
      intervalMs: Math.max(0, Number(intervalMs) || 0),
      lastRun: 0,
      lastRegionRevision: -1,
      pending: false,
      routes: Array.isArray(routes) ? new Set(routes) : null,
      region: region,
    });
  }

  function runPageSyncTasks() {
    pageSyncTimer = 0;
    const now = performance.now();
    const route = readPageRoute();
    const routeChanged = route !== pageSyncRoute;
    const forceAll = routeChanged || pageSyncForceAll;
    pageSyncForceAll = false;
    pageSyncLastRun = now;
    pageSyncRoute = route;
    for (const [task, entry] of pageSyncTasks) {
      const routeMatches = entry.routes === null || entry.routes.has(route);
      // Route changes run every task once so the previous route can tear down its UI.
      if (!routeMatches && !forceAll) {
        entry.pending = false;
        continue;
      }
      const regionRevision = entry.region === null ? -1 : pageMutationRevisions[entry.region];
      if (!forceAll && entry.region !== null && regionRevision === entry.lastRegionRevision) continue;
      if (!forceAll && now - entry.lastRun < entry.intervalMs) {
        entry.pending = true;
        continue;
      }
      entry.lastRun = now;
      entry.lastRegionRevision = regionRevision;
      entry.pending = false;
      try {
        task();
      } catch (error) {
        console.error("[HeyBox Up] DOM sync failed", error);
      }
    }
    let nextDelay = Infinity;
    for (const [, entry] of pageSyncTasks) {
      if (!entry.pending) continue;
      nextDelay = Math.min(nextDelay, Math.max(0, entry.lastRun + entry.intervalMs - now));
    }
    if (nextDelay !== Infinity) {
      pageSyncTimer = window.setTimeout(runPageSyncTasks, nextDelay);
    }
  }

  function schedulePageSync() {
    if (pageSyncTimer !== 0) return;
    const elapsed = performance.now() - pageSyncLastRun;
    pageSyncTimer = window.setTimeout(runPageSyncTasks, Math.max(0, PAGE_SYNC_INTERVAL_MS - elapsed));
  }

  function scheduleForcedPageSync() {
    pageSyncForceAll = true;
    schedulePageSync();
  }

  function bumpRegionsForRoot(root) {
    if (!(root instanceof Element)) return;
    for (const [region, selector] of PAGE_MUTATION_REGION_ENTRIES) {
      if (root.matches(selector)) pageMutationRevisions[region] += 1;
    }
  }

  function notePageMutationRegions(record) {
    const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
    if (target === null || target === undefined) return false;
    const closestTracked = target.closest(PAGE_MUTATION_REGION_COMBINED + ", " + PAGE_MUTATION_IGNORE_SELECTOR);
    if (closestTracked !== null && closestTracked.matches(PAGE_MUTATION_IGNORE_SELECTOR)) return false;
    let touched = false;
    if (closestTracked !== null) {
      bumpRegionsForRoot(closestTracked);
      touched = true;
    }
    const changedNodes = [];
    if (record.type === "childList") {
      for (const node of record.addedNodes) changedNodes.push(node);
      for (const node of record.removedNodes) changedNodes.push(node);
    }
    let removedScriptUi = false;
    if (record.type === "childList") {
      for (const node of record.removedNodes) {
        if (node instanceof Element && (node.id.startsWith("heybox-up-")
          || node.querySelector('[id^="heybox-up-"]') !== null)) {
          removedScriptUi = true;
          break;
        }
      }
    }
    if (removedScriptUi) {
      for (const region of Object.keys(pageMutationRevisions)) pageMutationRevisions[region] += 1;
      return true;
    }
    for (const node of changedNodes) {
      if (!(node instanceof Element)) continue;
      if (node.matches(PAGE_MUTATION_REGION_COMBINED)) {
        bumpRegionsForRoot(node);
        touched = true;
      }
      for (const root of node.querySelectorAll(PAGE_MUTATION_REGION_COMBINED)) {
        bumpRegionsForRoot(root);
        touched = true;
      }
    }
    return touched;
  }

  function isObservedAttributeTarget(node) {
    if (!(node instanceof Element)) return false;
    if (node.matches(EMBEDDED_MEDIA_OBSERVED_SELECTOR)) return true;
    return node.closest(ARTICLE_LAYOUT_OBSERVED_SELECTOR) !== null;
  }

  function startPageSyncObserver() {
    if (!document.body || !document.body.isConnected) return;
    new MutationObserver((records) => {
      if (notePageSyncedRecords(records)) schedulePageSync();
    }).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: PAGE_SYNC_ATTRIBUTE_FILTER,
    });
    window.addEventListener("popstate", scheduleForcedPageSync);
    window.addEventListener("hashchange", scheduleForcedPageSync);
  }

  function notePageSyncedRecords(records) {
    let relevant = false;
    for (const record of records) {
      if (record.type === "attributes" && !isObservedAttributeTarget(record.target)) continue;
      relevant = notePageMutationRegions(record) || relevant;
    }
    return relevant;
  }

  const trackedStyleContent = new WeakMap();
  const constructedStylesById = new Map();
  let CAN_USE_CONSTRUCTED_STYLES = false;
  try {
    const testSheet = typeof CSSStyleSheet === "function" && typeof CSSStyleSheet.prototype.replaceSync === "function"
      ? new CSSStyleSheet()
      : null;
    if (testSheet !== null && "adoptedStyleSheets" in document) {
      testSheet.replaceSync(":root{}");
      CAN_USE_CONSTRUCTED_STYLES = true;
    }
  } catch (error) {
    CAN_USE_CONSTRUCTED_STYLES = false;
  }

  function ensureStyleElement(id, css, appendToEnd = false) {
    if (CAN_USE_CONSTRUCTED_STYLES) {
      try {
        let entry = constructedStylesById.get(id);
        if (entry === undefined) {
          const sheet = new CSSStyleSheet();
          sheet.replaceSync(css);
          entry = { sheet: sheet, css: css };
          constructedStylesById.set(id, entry);
        } else if (entry.css !== css) {
          entry.sheet.replaceSync(css);
          entry.css = css;
        }
        if (!document.adoptedStyleSheets.includes(entry.sheet)) {
          document.adoptedStyleSheets = [...document.adoptedStyleSheets, entry.sheet];
        }
        return;
      } catch (error) {
        CAN_USE_CONSTRUCTED_STYLES = false;
      }
    }
    let style = document.getElementById(id);
    if (style === null) {
      style = document.createElement("style");
      style.id = id;
      style.textContent = css;
      trackedStyleContent.set(style, css);
    } else if (trackedStyleContent.get(style) !== css) {
      /* A replaced or hot-updated style node must be repaired even after the first mount. */
      style.textContent = css;
      trackedStyleContent.set(style, css);
    }
    const parent = document.head || document.documentElement;
    if (parent === null) return;
    if (style.parentNode !== parent || (appendToEnd && parent === document.head && parent.lastElementChild !== style)) {
      parent.append(style);
    }
  }

  const THEME_CLASS = "heybox-up-theme";
  const THEME_ATTR = "data-heybox-up-theme";
  const THEME_STORAGE_KEY = "heybox-up.theme.v1";
  const THEME_ENTRY_ID = "heybox-up-theme-entry";
  const THEME_MEDIA = window.matchMedia("(prefers-color-scheme: dark)");

  // ==theme-core:start==
  const THEME_PRESETS = [
    { id: "system", label: "跟随系统", hint: "随系统深浅切换", dark: null, icon: "system", swatch: ["#f5f7f9", "#1b2430"] },
    { id: "dark", label: "夜航", hint: "冷灰深色，细边框", dark: true, icon: "dark", swatch: ["#0f1419", "#8fb0cf"] },
    { id: "oled", label: "纯黑", hint: "纯黑底，低圆角", dark: true, icon: "oled", swatch: ["#000000", "#a8c0d8"] },
    { id: "light", label: "浅色", hint: "站点原色", dark: false, icon: "light", swatch: ["#ffffff", "#eef1f4"] },
    { id: "paper", label: "纸页", hint: "暖纸底，衬线标题", dark: false, icon: "paper", swatch: ["#f4efe4", "#8a6f4e"] },
    { id: "mist", label: "雾青", hint: "冷雾底，大圆角", dark: false, icon: "mist", swatch: ["#eef3f5", "#4f7f8a"] },
  ];
  const THEME_IDS = THEME_PRESETS.map((preset) => preset.id);

  function getThemePreset(id) {
    return THEME_PRESETS.find((preset) => preset.id === id) || THEME_PRESETS[0];
  }

  function normalizeThemeMode(value) {
    return THEME_IDS.includes(value) ? value : "system";
  }

  function resolveTheme(mode, systemDark) {
    return mode === "system" ? (systemDark ? "dark" : "light") : getThemePreset(mode).id;
  }
  // ==theme-core:end==

  let currentThemeMode = "system";
  let themeEntry = null;
  let previewToggle = null;
  let navMotionToggle = null;
  let readerToggle = null;
  let feedWidthChips = [];
  let feedWidthInput = null;
  let readerLineHeightInput = null;

  function readThemeMode() {
    return normalizeThemeMode(localStore.read(THEME_STORAGE_KEY));
  }

  function writeThemeMode(mode) {
    localStore.write(THEME_STORAGE_KEY, mode);
  }

  const THEME_CSS = `
    :root.heybox-up-theme {
      --heybox-up-bg: #fff;
      --heybox-up-surface: #fff;
      --heybox-up-subtle: rgba(20, 25, 30, .06);
      --heybox-up-raised: #d7dce3;
      --heybox-up-border: rgba(20, 25, 30, .1);
      --heybox-up-text: #14191e;
      --heybox-up-text-2: #3c4249;
      --heybox-up-muted: #6b7280;
      --heybox-up-on-accent: #fff;
      --heybox-up-icon: #62676e;
      --heybox-up-icon-hover: #14191e;
      --heybox-up-icon-hover-bg: rgba(20, 25, 30, .06);
      --heybox-up-accent: #6f8db3;
      --hbu-menu-bg: #fff;
      --hbu-menu-text: #14191e;
      --hbu-menu-muted: #6b7280;
      --hbu-menu-border: rgba(20, 25, 30, .12);
      --hbu-menu-hover: rgba(20, 25, 30, .06);
      color-scheme: light;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) {
      background-color: var(--heybox-up-bg) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] {
      color-scheme: dark;
      --heybox-up-bg: #0f1419;
      --heybox-up-surface: #171d24;
      --heybox-up-subtle: #1e2630;
      --heybox-up-raised: #26303b;
      --heybox-up-border: #2d3845;
      --heybox-up-text: #dce5ef;
      --heybox-up-text-2: #b4c0ce;
      --heybox-up-muted: #8593a3;
      --heybox-up-accent: #8fb0cf;
      --heybox-up-on-accent: #10161c;
      --heybox-up-icon: #b4c0ce;
      --heybox-up-icon-hover: #dce5ef;
      --heybox-up-icon-hover-bg: rgba(220, 229, 239, .09);
      --hbu-menu-bg: #171d24;
      --hbu-menu-text: #dce5ef;
      --hbu-menu-muted: #8593a3;
      --hbu-menu-border: #2d3845;
      --hbu-menu-hover: rgba(220, 229, 239, .09);
      --hbu-success: #7fc3a2;
      --hbu-danger: #e0858d;
      --hbu-warning: #d8b77a;
      --hb-general-color-bg-0: #0f1419;
      --hb-general-color-bg-1: #171d24;
      --hb-general-color-bg-2: #1e2630;
      --hb-general-color-bg-3: #1e2630;
      --hb-general-color-bg-4: #171d24;
      --hb-general-color-bg-5: rgba(23, 29, 36, .9);
      --hb-general-color-bg-6: rgba(220, 229, 239, .1);
      --hb-general-color-text-1: #dce5ef;
      --hb-general-color-text-2: #b4c0ce;
      --hb-general-color-text-3: #8593a3;
      --hb-general-color-text-4: #6d7a88;
      --hb-general-color-text-5: #9dc0e2;
      --hb-general-color-text-6: #10161c;
      --hb-general-color-stroke-0: #2d3845;
      --hb-general-color-stroke-1: #2d3845;
      --hb-general-color-stroke-2: #26303b;
      --hb-general-color-stroke-3: #1e2630;
      --hb-general-color-primary: #8fb0cf;
      --hb-general-color-success: #7fc3a2;
      --hb-general-color-danger: #e0858d;
      --hb-primary: #dce5ef;
      --hb-primary--value: 220, 229, 239;
      --hb-primary-dynamic: #dce5ef;
      --hb-primary-dynamic--value: 220, 229, 239;
      --hb-neutral-100: #1e2630;
      --hb-neutral-100--value: 30, 38, 48;
      --hb-neutral-200: #1e2630;
      --hb-neutral-200--value: 30, 38, 48;
      --hb-neutral-300: #171d24;
      --hb-neutral-300--value: 23, 29, 36;
      --hb-neutral-400: #26303b;
      --hb-neutral-400--value: 38, 48, 59;
      --hb-neutral-500: #2d3845;
      --hb-neutral-500--value: 45, 56, 69;
      --hb-neutral-600: #6d7a88;
      --hb-neutral-600--value: 109, 122, 136;
      --hb-neutral-700: #8593a3;
      --hb-neutral-700--value: 133, 147, 163;
      --hb-neutral-800: #b4c0ce;
      --hb-neutral-800--value: 180, 192, 206;
      --el-color-primary: #8fb0cf;
      --el-color-primary-light-9: #1b2735;
      --el-color-success: #7fc3a2;
      --el-color-danger: #e0858d;
      --el-color-warning: #d8b77a;
      --el-bg-color: #171d24;
      --el-bg-color-page: #0f1419;
      --el-bg-color-overlay: #171d24;
      --el-fill-color-blank: #171d24;
      --el-fill-color: #1e2630;
      --el-fill-color-light: #1e2630;
      --el-fill-color-lighter: #1e2630;
      --el-fill-color-extra-light: #1e2630;
      --el-text-color-primary: #dce5ef;
      --el-text-color-regular: #b4c0ce;
      --el-text-color-secondary: #8593a3;
      --el-text-color-placeholder: #8593a3;
      --el-text-color-disabled: #6d7a88;
      --el-border-color: #2d3845;
      --el-border-color-light: #2d3845;
      --el-border-color-lighter: #2d3845;
      --el-border-color-extra-light: #26303b;
      --el-border-color-dark: #3b4653;
      --el-border-color-darker: #46515f;
      --el-disabled-bg-color: #1e2630;
      --el-disabled-text-color: #8593a3;
      --el-mask-color: rgba(15, 20, 25, .8);
      --el-overlay-color-lighter: rgba(0, 0, 0, .6);
      --el-table-bg-color: #171d24;
      --el-table-tr-bg-color: #171d24;
      --el-table-header-bg-color: #1e2630;
      --el-table-row-hover-bg-color: #1e2630;
      --el-table-border-color: #2d3845;
      --el-table-text-color: #dce5ef;
      --el-table-header-text-color: #b4c0ce;
      --el-box-shadow: 0 12px 32px rgba(0, 0, 0, .3);
      --el-box-shadow-light: 0 0 12px rgba(0, 0, 0, .28);
      --el-box-shadow-lighter: 0 0 6px rgba(0, 0, 0, .24);
      scrollbar-color: #3b4653 #0f1419;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] body {
      background-color: var(--heybox-up-bg) !important;
      color: var(--heybox-up-text);
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#app, .hb-website__app, .hb-page__app, .hb-layout__main, .hb-layout-main__container, .hb-layout__content) {
      background-color: var(--heybox-up-bg) !important;
      color: var(--heybox-up-text);
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.nav, .nav-user .nav-user-popover, .el-popper, .el-dropdown-menu, .el-dialog, .el-drawer, .el-message-box, .el-card, .el-table, .el-pagination, .el-select-dropdown, .el-autocomplete-suggestion, .hb-cpt__selector .selector__pull-list, .page-header__container-bg, .page-header__back-btn, .tab-list--wrapper, .link-tab-list, .hb-cpt-page-header, .hb-cpt__pagination, .hb-cpt__slide-tab, .user-profile-wrapper, .bbs-info, .message-center__main, .message-center__aside-title, .message-center__search-box, .message-home__tabs, .message-content-preview, .message-content-preview__post, .search-result__tab-header, .search-result__tool, .hb-search-result, .hot-search, .price-box, .result-mini-app__item, .result-filter-tag__tag, .hb-bbs-link__header, .hb-bbs-link__content, .link-comment, .link-reply, .comment__comment-header, .topic-link__header, .post__container, .image-text__container, .header-image__item, .bbs-link__related-recommend, .hb-cpt__empty, .qr-section, .app-link-item) {
      background-color: var(--heybox-up-surface) !important;
      border-color: var(--heybox-up-border) !important;
      color: var(--heybox-up-text);
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#page-bbs-community, #page-bbs-link, #page-bbs-list, .page-bbs-community, .page-bbs-link) {
      background-color: var(--heybox-up-bg) !important;
      color: var(--heybox-up-text);
    }
    /* Search page: page and list paint fixed white bands above and below the results. */
    :root.heybox-up-theme[data-heybox-up-dark="true"] #page-bbs-list::before,
    :root.heybox-up-theme[data-heybox-up-dark="true"] #page-bbs-list::after {
      background-color: var(--heybox-up-bg) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] #page-bbs-list .list::before,
    :root.heybox-up-theme[data-heybox-up-dark="true"] #page-bbs-list .list::after {
      background-color: var(--heybox-up-bg) !important;
    }
    /* Result rows are separated by inline 4px light strips. */
    :root.heybox-up-theme[data-heybox-up-dark="true"] #page-bbs-list .search-result__space {
      background-color: transparent !important;
    }
    /* The User tab paints a fixed light notice bar above the result list. */
    :root.heybox-up-theme[data-heybox-up-dark="true"] #page-bbs-list .search-result__middle.user {
      background-color: var(--heybox-up-surface) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] #page-bbs-list .search-result__middle.user::after {
      color: var(--heybox-up-muted) !important;
    }
    /* Horizontal result scroller fades to hard-coded white on the right edge. */
    :root.heybox-up-theme[data-heybox-up-dark="true"] #page-bbs-list .hb-cpt__pagination--right {
      background-image: linear-gradient(to left, var(--heybox-up-surface), var(--heybox-up-surface), transparent) !important;
    }
    /* 我的文章（创作者中心）：站点整页写死 #fff，深色下逐块补齐，避免只剩外框变黑。 */
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#page-creator-content-management, #page-creator-content-management-detail) {
      background-color: var(--heybox-up-bg) !important;
      color: var(--heybox-up-text);
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#page-creator-content-management .creator-content-management__header, #page-creator-content-management .creator-content-management__tabs, #page-creator-content-management-detail .content-detail__content-wrapper, #page-creator-content-management-detail .content-detail__section, .com-chart, #creator-preview__frame, .creator-preview-normal, .creator-draft) {
      background-color: var(--heybox-up-surface) !important;
      border-color: var(--heybox-up-border) !important;
      color: var(--heybox-up-text);
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#page-creator-content-management .creator-content-management__tabs::after, #page-creator-content-management .content-management-home__content + .content-management-home__content::after) {
      background-color: var(--heybox-up-border) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#page-creator-content-management .content-management-home__content:hover, #page-creator-content-management .creator-content-management__tabs .sorter:hover, .creator-content-item__operation-item:hover) {
      background-color: var(--heybox-up-subtle) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] .creator__data-indicator {
      background-color: var(--heybox-up-subtle) !important;
      box-shadow: 0 0 0 .5px var(--heybox-up-border) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] .creator__data-indicator.active {
      background-color: var(--heybox-up-surface) !important;
      box-shadow: inset 0 0 0 1px var(--heybox-up-accent) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#page-creator-content-management .creator-content-management__header, #page-creator-content-management-detail .content-detail__title, #page-creator-content-management-detail .content-detail__section-header, .data-indicator__data, .com-chart .nav, .com-chart .selection .text, .aside-miniprogram__header, .aside-miniprogram__item--name) {
      color: var(--heybox-up-text) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.data-indicator__title, #page-creator-content-management .creator-content-management__tabs .sorter, #page-topic-link .topic-link__sorter) {
      color: var(--heybox-up-text-2) !important;
    }
    /* 频道页：整页浅灰底 + 三块白卡，连同上下固定色条一起换底。 */
    :root.heybox-up-theme[data-heybox-up-dark="true"] #page-topic-link {
      background-color: var(--heybox-up-bg) !important;
      color: var(--heybox-up-text);
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] #page-topic-link::before,
    :root.heybox-up-theme[data-heybox-up-dark="true"] #page-topic-link::after {
      background-color: var(--heybox-up-bg) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#page-topic-link .topic-link__panel, #page-topic-link .topic-link__header, #page-topic-link .topic-link__filter-row, #page-topic-link .topic-link__game-detail, .topic-aside__topic-indicator, .topic__aside-miniprogram) {
      background-color: var(--heybox-up-surface) !important;
      border-color: var(--heybox-up-border) !important;
      color: var(--heybox-up-text);
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] #page-topic-link .topic-link__main::after {
      background-color: var(--heybox-up-surface) !important;
      border-color: var(--heybox-up-border) !important;
      color: var(--heybox-up-text);
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] .topic__aside-miniprogram .aside-miniprogram__item,
    :root.heybox-up-theme[data-heybox-up-dark="true"] #page-topic-link .topic-link__splitline::after {
      background-color: var(--heybox-up-subtle) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] .topic__aside-miniprogram .aside-miniprogram__item:hover {
      background-color: var(--heybox-up-surface) !important;
    }
    /* 兜底扫描挂上的类：只改底色、描边与文字色，不动布局。 */
    :root.heybox-up-theme[data-heybox-up-dark="true"] .heybox-up-dark-flat {
      background-color: var(--heybox-up-surface) !important;
      color: var(--heybox-up-text) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] .heybox-up-dark-flat-subtle {
      background-color: var(--heybox-up-subtle) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] .heybox-up-dark-edge {
      border-color: var(--heybox-up-border) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] .heybox-up-dark-ink {
      color: var(--heybox-up-text) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.hb-bbs-home, .bbs-home__content-list, .bbs-home__content-item, .bbs-home__topic-item, .bbs-community-hot-topic, .bbs-community__search-module, .right-side-default, .hb-cpt__scroll-list, #page-bbs-link .list, .link-tags__tag-item, .hb-cpt__popover-menu, .hb-cpt__report, .route-to-app__qrcode, .scroll-list__top-btn, .hb-cpt__loading.circle, .search-history, .search__pull-list) {
      background-color: var(--heybox-up-surface) !important;
      border-color: var(--heybox-up-border) !important;
      color: var(--heybox-up-text);
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.hb-cpt__image--default, .hb-cpt__image--placeholder, .link-reply__input-wrapper) {
      background-color: var(--heybox-up-subtle) !important;
      border-color: var(--heybox-up-border) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] .bbs-new-style-bottom__rich-stack {
      background-color: var(--heybox-up-subtle) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] .bbs-new-style-bottom__rich-node {
      color: var(--heybox-up-text-2) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] #page-user-favour > .content > .list {
      background-color: var(--heybox-up-surface) !important;
      border-color: var(--heybox-up-border) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] #page-user-favour .user-favour__list,
    :root.heybox-up-theme[data-heybox-up-dark="true"] #page-user-favour .user-favour__list > * {
      background-color: transparent !important;
      border-color: var(--heybox-up-border) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.user-favour__item, .favour-item, .favour-card, .list-content, .bbs-list-content, .bbs-link, .link-item, .hot-topic-item, .creator-content-item, .comment-message-item, .message-list-item.active) {
      background-color: var(--heybox-up-subtle) !important;
      border-color: var(--heybox-up-border) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.bbs-content__title, .bbs-content__content, .post__title, .post__content, .image-text__title, .image-text__content, .comment-item__content, .children-item__comment-content, .list-content__username, .comment-item__username, .hot-topic-item__name, .nav-item, .view-header__nav-item, .user-profile-wrapper .name, .bbs-info-item .value, .back-btn__text, .page-header__username, .link-user__username, .section-title__content, .content-tag-text, .slide-tab__tab-label, .slide-tab__tab-cnt, .info-box__username, .hb-editor, .message-list-item__title, .comment-message-item__username, .comment-message-item__text, .message-content-preview__reply-text, .message-content-preview__text, .creator-content-item__title, .editor__more-info-title, .creator-editor__form-label, .frame-top-title, .bbs-link-section-title-text, .user-favour__title) {
      color: var(--heybox-up-text) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.list-content__time, .bbs-list-content__time, .post__time, .image-text__time, .comment-item__time, .creator-content-item__create_at, .creator-content-item__type, .creator-content-item__data-item, .message-list-item__time, .user-favour__empty, .scroll-list__no-more-desc, .page-header__meta, .list-content__meta) {
      color: var(--heybox-up-muted) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.bbs-home__topic-name, .hot-topic__header, .related-recommend__container--header, .link-item__title, .qr-section .title, .qr-section span, .app-link-item span, .search-pull__found-item, .search-pull__history-item, .hb-cpt__popover-menu-item.plain) {
      color: var(--heybox-up-text) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.link-item__desc, .bbs-new-style-bottom__comment, .search-pull__section-title, .search-history__item) {
      color: var(--heybox-up-muted) !important;
    }
    /* Search suggestions: site fills history chips light and hot rank labels dark; retheme both. */
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.search-pull__history-item, .search-history__item) {
      background-color: var(--heybox-up-subtle) !important;
      border-color: var(--heybox-up-border) !important;
      color: var(--heybox-up-text) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.search-pull__history-item:hover, .search-history__item:hover) {
      background-color: var(--heybox-up-surface) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] .search-history__item::before {
      background-color: var(--heybox-up-subtle) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] .search-pull__section-title {
      color: var(--heybox-up-text-2) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] .search__hot-rank .hot-rank__tab-item {
      color: var(--heybox-up-text-2) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] .search__hot-rank .hot-rank__tab-item.active {
      color: var(--heybox-up-text) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] .search__hot-rank .hot-rank__list-item .hot-rank__list-item-game-name {
      color: var(--heybox-up-text) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] .search__hot-rank .hot-rank__list-item:hover {
      background-color: var(--heybox-up-subtle) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.post__content, .image-text__content) :where(p, span, b, strong, em, i, li, h1, h2, h3, h4, h5, h6, blockquote, .text) {
      color: inherit !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.post__content, .image-text__content) a {
      color: var(--heybox-up-accent) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(input:not([type="checkbox"]):not([type="radio"]), textarea, select) {
      background-color: var(--heybox-up-subtle) !important;
      border-color: var(--heybox-up-border) !important;
      color: var(--heybox-up-text) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(input, textarea)::placeholder {
      color: var(--heybox-up-muted) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] option {
      background-color: var(--heybox-up-surface);
      color: var(--heybox-up-text);
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.el-input__wrapper, .el-textarea__inner, .el-select__wrapper, [contenteditable="true"]) {
      background-color: var(--heybox-up-subtle) !important;
      color: var(--heybox-up-text) !important;
      box-shadow: 0 0 0 1px var(--heybox-up-border) inset !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.tab-item.active, .slide-tab__tab-item.active, .slide-tab__tab-item.active .slide-tab__tab-label, .nav-link.nav-link--active, .nav-link--active) {
      color: var(--heybox-up-text) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] .result-filter-tag__tag.active {
      background-color: var(--heybox-up-accent) !important;
      border-color: var(--heybox-up-accent) !important;
      color: var(--heybox-up-on-accent) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.page-header__back-btn, .hb-cpt__pagination, .hb-cpt__slide-tab) {
      border-color: var(--heybox-up-border) !important;
      color: var(--heybox-up-text-2) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.el-table th.el-table__cell, .el-table tr) {
      background-color: transparent !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.el-table, .el-table__inner-wrapper, .el-table__body-wrapper, .el-table__header-wrapper) {
      background-color: var(--heybox-up-surface) !important;
      color: var(--heybox-up-text) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.tab-active-block, .slide-tab-tab__bar) {
      background-color: var(--heybox-up-accent) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.hb-cpt__button.primary, .hb-cpt__button--primary, .editor-publish__btn.main-btn) {
      background-color: var(--heybox-up-accent) !important;
      background-image: none !important;
      border-color: var(--heybox-up-accent) !important;
      color: var(--heybox-up-on-accent) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.nav-user-popover-item:hover, .message-list-item:hover, .link-comment__comment-item:hover, .creator-content-item__operation-item:hover) {
      background-color: var(--heybox-up-subtle) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.bbs-info-item, .message-center__aside, .message-center__content, .comment-message-item, .link-comment__comment-item, .creator-content-item, .editor-tabs, .cpt-qa__row, .cpt-qa__tabs, .hb-cpt__editor-title, .editor-image-text__main-content, .editor-image-wrapper__box, .creator-editor__form-item) {
      border-color: var(--heybox-up-border) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] [data-mask$="-bg"] {
      background-color: var(--heybox-up-bg) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] [data-mask$="-edge"] {
      background-color: var(--heybox-up-surface) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] .nav {
      --nav-background: rgba(15, 20, 25, .94);
      --nav-shadow: 0 6px 16px rgba(0, 0, 0, .28);
      --nav-link-color: #8593a3;
      --nav-link-hover-color: #dce5ef;
      --nav-link-active-color: #dce5ef;
      --nav-link-hover-bg: transparent;
      --nav-link-active-bg: transparent;
      --publish-color: #10161c;
      --publish-bg: linear-gradient(46deg, #9db9d3, #8fb0cf);
      --publish-hover-shadow: 0 8px 18px rgba(0, 0, 0, .3);
      --nav-user-bg: rgba(220, 229, 239, .08);
      --nav-user-bg-hover: rgba(220, 229, 239, .14);
      --nav-user-divider-color: rgba(220, 229, 239, .12);
      --nav-user-name-color: #dce5ef;
      --nav-user-arrow-color: rgba(220, 229, 239, .72);
      --nav-logo-color: #dce5ef;
      --nav-language-color: #8593a3;
      --nav-language-border-color: rgba(133, 147, 163, .5);
      background: var(--nav-background) !important;
      box-shadow: var(--nav-shadow) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] .nav :is(.nav-link, .nav-icon) {
      color: var(--heybox-up-text-2) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] .nav button.nav-link.nav-link--active {
      color: var(--heybox-up-text) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] .nav-content-left-logo :is(path, polygon, rect) {
      fill: var(--heybox-up-text) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.nav-user-popover-name, .nav-user-popover-item-text) {
      color: var(--heybox-up-text) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.nav-user-popover-id, .nav-user-popover-item-icon) {
      color: var(--heybox-up-muted) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] .nav-user-popover-divider {
      background-color: var(--heybox-up-border) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(button, a, input, textarea, select, summary, [tabindex], [role="button"], [contenteditable="true"]):focus-visible {
      outline: 2px solid var(--heybox-up-accent) !important;
      outline-offset: 2px !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.comment-item__tag-line, .comment-item__writer-like, .children-item__reply-to, .children-item__create-time, .children-item__ip, .info-box__create-time, .info-box__ip, .like-box, .load-all__text, .link-reply__placeholder, .link-reply__operation-desc) {
      color: var(--heybox-up-muted) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.comment-children__load-all, .link-reply__editor, .link-reply__operation-item, .hb-toast, .el-message) {
      background-color: var(--heybox-up-subtle) !important;
      border-color: var(--heybox-up-border) !important;
      color: var(--heybox-up-text) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] .hb-loading-spinner {
      background-color: var(--heybox-up-surface) !important;
      border-color: var(--heybox-up-border) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.el-message, .el-message__content) {
      color: var(--heybox-up-text) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] .el-image-viewer__wrapper {
      background-color: rgba(0, 0, 0, .88) !important;
    }
    /* 登录表单保持官方浅色，避免第三方登录控件在深色下失去可读性。 */
    :root.heybox-up-theme[data-heybox-up-dark="true"] .website-login {
      color-scheme: light;
      background-color: #fff !important;
      color: #14191e !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] .website-login :is(input, textarea, select) {
      background-color: transparent !important;
      border-color: #e8eaed !important;
      color: #14191e !important;
    }
    /* 文章编辑器：站点把底色写在多层容器里，深色、纸页与雾青预设需要整块覆盖。 */
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor > .content > .list,
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.editor-tabs, .editor-article__main-content, .editor-image-text__main-content, .editor-video__main-content, .hb-cpt__editor-title, .editor__menu, .editor__more-info, .creator-editor__form-wrapper, .cpt-editor__publish, .cpt-qa),
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame {
      background-color: var(--heybox-up-surface) !important;
      border-color: var(--heybox-up-border) !important;
      color: var(--heybox-up-text) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor-article__main-content {
      box-shadow: 0 0 0 1px var(--heybox-up-border) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor__menu {
      box-shadow: inset 0 0 0 1px var(--heybox-up-border) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor-article__main-content :is(.hb-editor, .ProseMirror) {
      background-color: var(--heybox-up-subtle) !important;
      color: var(--heybox-up-text) !important;
    }
    :root.heybox-up-theme:is([data-heybox-up-theme="paper"], [data-heybox-up-theme="mist"]) #page-creator-editor .editor-article__main-content :is(.hb-editor, .ProseMirror) {
      background-color: var(--heybox-up-surface) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.hb-editor, .ProseMirror) :where(p, span, b, strong, em, i, u, s, li, h1, h2, h3, h4, h5, h6, blockquote, td, th) {
      color: var(--heybox-up-text) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.hb-editor, .ProseMirror) :is(a, .prose-link) {
      color: var(--heybox-up-accent) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor-title__cnt-indicator {
      color: var(--heybox-up-muted) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor-publish__btn.main-btn {
      background-color: var(--heybox-up-accent) !important;
      background-image: none !important;
      border-color: var(--heybox-up-accent) !important;
      color: var(--heybox-up-on-accent) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) :is(.hb-cpt__button.primary, .hb-cpt__button--primary) {
      background-color: var(--heybox-up-accent) !important;
      background-image: none !important;
      border-color: var(--heybox-up-accent) !important;
      color: var(--heybox-up-on-accent) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.editor__topic-item, .editor__hashtag-item, .editor__add-btn, .selector__box, .editor-publish__btn.sub-btn, .cpt-qa__tab, .cpt-qa__key) {
      background-color: var(--heybox-up-subtle) !important;
      border-color: var(--heybox-up-border) !important;
      color: var(--heybox-up-text-2) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.selector__pull-list, .editor-menu-more__list) {
      background-color: var(--heybox-up-surface) !important;
      border-color: var(--heybox-up-border) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .selector__pull-list-item {
      color: var(--heybox-up-text-2) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.selector__pull-list-item:hover, .selector__pull-list-item.active) {
      background-color: var(--heybox-up-raised) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .selector__box {
      box-shadow: 0 0 0 1px var(--heybox-up-border) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .switch__button {
      background-color: var(--heybox-up-raised) !important;
      border-color: var(--heybox-up-border) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .switch__button.active {
      background-color: var(--heybox-up-accent) !important;
      border-color: var(--heybox-up-accent) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .switch__button-indicator {
      background-color: var(--heybox-up-text-2) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .switch__button.active .switch__button-indicator {
      background-color: var(--heybox-up-on-accent) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.editor-form__more-info-title, .creator-editor__form-header, .selector__active, .cpt-qa__head-title, .cpt-qa__row-name) {
      color: var(--heybox-up-text) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.topic-item__text, .hashtag-item__text, .editor-form__more-info-desc, .editor__more-info-desc, .cpt-qa__head-sub) {
      color: var(--heybox-up-text-2) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.switch__true-label, .switch__false-label) {
      color: var(--heybox-up-muted) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.switch__true-label.active, .switch__false-label.active) {
      color: var(--heybox-up-text) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .cpt-form-split-line {
      background-color: var(--heybox-up-border) !important;
    }
    /* Editor dividers and toolbar icons: site paints light 4px / 1px strips and dims icon fills. */
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .creator-editor__form-wrapper::before {
      background-color: var(--heybox-up-bg) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .cpt-editor__publish::after,
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .hb-cpt__editor-title::after,
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor-menu__item-splitline {
      background-color: var(--heybox-up-border) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor__menu .hb-icon {
      color: var(--heybox-up-text-2) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor__menu .editor-menu__item--content-inactive .hb-icon svg {
      opacity: .8 !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor__menu .editor-menu__item.forbid {
      opacity: .8 !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor__menu .editor-menu-more__list-item {
      color: var(--heybox-up-text-2) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor__menu .editor-menu-more__list-item .hb-icon {
      color: var(--heybox-up-text-2) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor__menu .editor-menu-more__list-item svg {
      opacity: .9 !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor__menu .editor-menu-more__list-item:hover {
      background-color: var(--heybox-up-subtle) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) [data-mask$="-bg"] {
      background-color: var(--heybox-up-bg) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) [data-mask$="-edge"] {
      background-color: var(--heybox-up-surface) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.hb-cpt__image--default, .hb-cpt__image--placeholder) {
      background-color: var(--heybox-up-subtle) !important;
      border-color: var(--heybox-up-border) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.editor-image-wrapper__box, .video-uploader__unload) {
      background-color: var(--heybox-up-surface) !important;
      background-image: none !important;
      border-color: var(--heybox-up-border) !important;
      box-shadow: 0 0 0 .5px var(--heybox-up-border) !important;
      color: var(--heybox-up-text-2) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.editor-image-text__main-content, .editor-video__main-content) {
      box-shadow: 0 0 0 1px var(--heybox-up-border) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame :is(.creator-preview-normal, .bbs-link) {
      background-color: var(--heybox-up-surface) !important;
      border-color: var(--heybox-up-border) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame :is(.bbs-link-section-author, .bbs-link-section-tags) {
      background-color: transparent !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame .bbs-link-section-author-name {
      color: var(--heybox-up-text) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame .bbs-link-section-author-time {
      color: var(--heybox-up-muted) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame .bbs-link-section-author-follow {
      background-color: var(--heybox-up-accent) !important;
      background-image: none !important;
      border-color: var(--heybox-up-accent) !important;
      color: var(--heybox-up-on-accent) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame .bbs-link-section-author-follow :is(i, span, svg, use) {
      color: var(--heybox-up-on-accent) !important;
      fill: var(--heybox-up-on-accent) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame :is(.bbs-link-article-content, .hb-article) {
      color: var(--heybox-up-text) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame :is(.bbs-link-article-content, .hb-article) :where(p, span, b, strong, em, i, li, h1, h2, h3, h4, h5, h6, blockquote, .text, .main-title) {
      color: var(--heybox-up-text) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame :is(.bbs-link-article-content, .hb-article) :is(a, .prose-link) {
      color: var(--heybox-up-accent) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame .img-desc {
      color: var(--heybox-up-muted) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame .bbs-link-section-tags-item {
      background-color: var(--heybox-up-subtle) !important;
      border-color: var(--heybox-up-border) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame .bbs-link-section-tags-item-text {
      color: var(--heybox-up-text-2) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame :is(.bbs-link-section-bottom-info, .bbs-link-section-bottom-info-source) {
      color: var(--heybox-up-muted) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) .cpt-right-side :is(.footer-info, .footer-row, .report-text, .copyright-text) {
      color: var(--heybox-up-muted) !important;
    }
    :root.heybox-up-theme:not([data-heybox-up-theme="light"]) .cpt-right-side .footer-link {
      color: var(--heybox-up-text-2) !important;
    }
    /* 纯黑预设：黑底、低圆角、无阴影，仍复用全部深色覆盖规则。 */
    :root.heybox-up-theme[data-heybox-up-theme="oled"] {
      --heybox-up-bg: #000;
      --heybox-up-surface: #08090b;
      --heybox-up-subtle: #101216;
      --heybox-up-raised: #161a20;
      --heybox-up-border: #1d2026;
      --heybox-up-text: #e6ebf2;
      --heybox-up-text-2: #b8c2cf;
      --heybox-up-muted: #9aa4b2;
      --heybox-up-accent: #a8c0d8;
      --heybox-up-on-accent: #05070a;
      --hbu-menu-bg: #08090b;
      --hbu-menu-text: #e6ebf2;
      --hbu-menu-muted: #9aa4b2;
      --hbu-menu-border: #1d2026;
      --hbu-menu-hover: rgba(230, 235, 242, .07);
      --hb-general-color-bg-0: #000;
      --hb-general-color-bg-1: #08090b;
      --hb-general-color-bg-2: #101216;
      --hb-general-color-bg-3: #101216;
      --hb-general-color-bg-4: #08090b;
      --hb-general-color-text-1: #e6ebf2;
      --hb-general-color-text-2: #b8c2cf;
      --hb-general-color-text-3: #9aa4b2;
      --hb-general-color-stroke-0: #1d2026;
      --hb-general-color-stroke-1: #1d2026;
      --hb-general-color-stroke-2: #161a20;
      --hb-general-color-primary: #a8c0d8;
      --el-color-primary: #a8c0d8;
      --el-color-primary-light-9: #141a22;
      --el-bg-color: #08090b;
      --el-bg-color-page: #000;
      --el-bg-color-overlay: #08090b;
      --el-fill-color-blank: #08090b;
      --el-fill-color: #101216;
      --el-fill-color-light: #101216;
      --el-fill-color-lighter: #101216;
      --el-fill-color-extra-light: #101216;
      --el-border-color: #1d2026;
      --el-border-color-light: #1d2026;
      --el-border-color-lighter: #1d2026;
      --el-table-bg-color: #08090b;
      --el-table-tr-bg-color: #08090b;
      --el-table-header-bg-color: #101216;
      --el-table-row-hover-bg-color: #101216;
      --el-table-border-color: #1d2026;
      --el-mask-color: rgba(0, 0, 0, .86);
      --el-box-shadow: none;
      --el-box-shadow-light: none;
      scrollbar-color: #2a2e35 #000;
    }
    :root.heybox-up-theme[data-heybox-up-theme="oled"] .nav {
      --nav-background: #000;
      --nav-shadow: none;
      --publish-color: #05070a;
      --publish-bg: #a8c0d8;
      --nav-user-bg: rgba(230, 235, 242, .07);
      --nav-user-bg-hover: rgba(230, 235, 242, .13);
    }
    :root.heybox-up-theme[data-heybox-up-theme="oled"] :is(.bbs-home__content-item, .bbs-home__topic-item, .list-content, .user-favour__item, .post__container, .image-text__container, .link-comment, .hot-search, .right-side-default, .hb-bbs-link__header, .hb-bbs-link__content, .search-result__tool, .result-mini-app__item, .price-box, .el-card, .el-dialog, .el-drawer, .el-message-box, .el-popper, .el-dropdown-menu) {
      border-radius: 4px !important;
      box-shadow: none !important;
    }
    /* 纸页预设：暖纸底、衬线标题、细边扁平卡片。 */
    :root.heybox-up-theme[data-heybox-up-theme="paper"] {
      --heybox-up-bg: #f4efe4;
      --heybox-up-surface: #fffdf7;
      --heybox-up-subtle: #efe8d9;
      --heybox-up-raised: #e7ddc9;
      --heybox-up-border: #ddd2bd;
      --heybox-up-text: #2f2a22;
      --heybox-up-text-2: #4a4237;
      --heybox-up-muted: #7c7160;
      --heybox-up-accent: #8a6f4e;
      --heybox-up-icon: #7c7160;
      --heybox-up-icon-hover: #2f2a22;
      --heybox-up-icon-hover-bg: rgba(47, 42, 34, .07);
      --hbu-menu-bg: #fffdf7;
      --hbu-menu-text: #2f2a22;
      --hbu-menu-muted: #7c7160;
      --hbu-menu-border: #ddd2bd;
      --hbu-menu-hover: rgba(47, 42, 34, .06);
      --hb-general-color-bg-0: #f4efe4;
      --hb-general-color-bg-1: #fffdf7;
      --hb-general-color-bg-2: #efe8d9;
      --hb-general-color-bg-4: #fffdf7;
      --hb-general-color-text-1: #2f2a22;
      --hb-general-color-text-2: #4a4237;
      --hb-general-color-text-3: #7c7160;
      --hb-general-color-stroke-0: #ddd2bd;
      --hb-general-color-stroke-1: #ddd2bd;
      --hb-general-color-primary: #8a6f4e;
      --el-color-primary: #8a6f4e;
      --el-bg-color: #fffdf7;
      --el-bg-color-page: #f4efe4;
      --el-bg-color-overlay: #fffdf7;
      --el-fill-color-blank: #fffdf7;
      --el-fill-color-light: #efe8d9;
      --el-text-color-primary: #2f2a22;
      --el-text-color-regular: #4a4237;
      --el-text-color-secondary: #7c7160;
      --el-border-color: #ddd2bd;
      --el-border-color-light: #ddd2bd;
      scrollbar-color: #cfc2aa #f4efe4;
    }
    /* 雾青预设：冷雾底、大圆角、柔和浮层。 */
    :root.heybox-up-theme[data-heybox-up-theme="mist"] {
      --heybox-up-bg: #eef3f5;
      --heybox-up-surface: #fbfdfe;
      --heybox-up-subtle: #e4ecef;
      --heybox-up-raised: #dbe7eb;
      --heybox-up-border: #d3e0e5;
      --heybox-up-text: #1f2c33;
      --heybox-up-text-2: #3e5560;
      --heybox-up-muted: #6f8792;
      --heybox-up-accent: #4f7f8a;
      --heybox-up-icon: #6f8792;
      --heybox-up-icon-hover: #1f2c33;
      --heybox-up-icon-hover-bg: rgba(31, 44, 51, .07);
      --hbu-menu-bg: #fbfdfe;
      --hbu-menu-text: #1f2c33;
      --hbu-menu-muted: #6f8792;
      --hbu-menu-border: #d3e0e5;
      --hbu-menu-hover: rgba(31, 44, 51, .06);
      --hb-general-color-bg-0: #eef3f5;
      --hb-general-color-bg-1: #fbfdfe;
      --hb-general-color-bg-2: #e4ecef;
      --hb-general-color-bg-4: #fbfdfe;
      --hb-general-color-text-1: #1f2c33;
      --hb-general-color-text-2: #3e5560;
      --hb-general-color-text-3: #6f8792;
      --hb-general-color-stroke-0: #d3e0e5;
      --hb-general-color-stroke-1: #d3e0e5;
      --hb-general-color-primary: #4f7f8a;
      --el-color-primary: #4f7f8a;
      --el-bg-color: #fbfdfe;
      --el-bg-color-page: #eef3f5;
      --el-bg-color-overlay: #fbfdfe;
      --el-fill-color-blank: #fbfdfe;
      --el-fill-color-light: #e4ecef;
      --el-text-color-primary: #1f2c33;
      --el-text-color-regular: #3e5560;
      --el-text-color-secondary: #6f8792;
      --el-border-color: #d3e0e5;
      --el-border-color-light: #d3e0e5;
      scrollbar-color: #b9ccd3 #eef3f5;
    }
    :root.heybox-up-theme:is([data-heybox-up-theme="paper"], [data-heybox-up-theme="mist"]) body {
      background-color: var(--heybox-up-bg) !important;
      color: var(--heybox-up-text);
    }
    :root.heybox-up-theme:is([data-heybox-up-theme="paper"], [data-heybox-up-theme="mist"]) :is(#app, main, .hb-website__app, .hb-page__app, .hb-layout__main, .hb-layout-main__container, .hb-layout__content) {
      background-color: var(--heybox-up-bg) !important;
      color: var(--heybox-up-text);
    }
    :root.heybox-up-theme:is([data-heybox-up-theme="paper"], [data-heybox-up-theme="mist"]) :is(.nav, .nav-user .nav-user-popover, .el-popper, .el-dropdown-menu, .el-dialog, .el-drawer, .el-message-box, .hb-cpt__selector .selector__pull-list, .page-header__container-bg, .tab-list--wrapper, .link-tab-list, .hb-cpt-page-header, .user-profile-wrapper, .bbs-info, .message-center__main, .message-center__aside-title, .message-center__search-box, .message-home__tabs, .message-content-preview, .message-content-preview__post, .search-result__tab-header, .hb-search-result, .hb-bbs-link__header, .hb-bbs-link__content, .link-comment, .link-reply, .comment__comment-header, .topic-link__header, .post__container, .image-text__container, .bbs-link__related-recommend, .hb-cpt__empty, .qr-section, .app-link-item, .bbs-home__content-item, .bbs-home__topic-item, .list-content, .user-favour__item, #page-bbs-link .list, .hot-search, .right-side-default, .search-result__tool, .result-mini-app__item, .price-box, .result-filter-tag__tag) {
      background-color: var(--heybox-up-surface) !important;
      border-color: var(--heybox-up-border) !important;
      color: var(--heybox-up-text);
    }
    :root.heybox-up-theme:is([data-heybox-up-theme="paper"], [data-heybox-up-theme="mist"]) .nav {
      --nav-link-color: var(--heybox-up-muted);
      --nav-link-hover-color: var(--heybox-up-text);
      --nav-link-active-color: var(--heybox-up-text);
      --nav-link-hover-bg: transparent;
      --nav-link-active-bg: transparent;
      --publish-color: #fff;
      --publish-bg: var(--heybox-up-accent);
      --nav-user-bg: var(--heybox-up-subtle);
      --nav-user-bg-hover: var(--heybox-up-raised);
      --nav-user-name-color: var(--heybox-up-text);
      --nav-user-divider-color: var(--heybox-up-border);
      --nav-logo-color: var(--heybox-up-text);
    }
    :root.heybox-up-theme[data-heybox-up-theme="paper"] .nav {
      --nav-background: rgba(244, 239, 228, .95);
      --nav-shadow: 0 1px 0 #ddd2bd;
    }
    :root.heybox-up-theme[data-heybox-up-theme="mist"] .nav {
      --nav-background: rgba(251, 253, 254, .84);
      --nav-shadow: 0 8px 24px rgba(47, 74, 84, .08);
      backdrop-filter: blur(14px) saturate(1.1);
    }
    :root.heybox-up-theme[data-heybox-up-theme="paper"] :is(.bbs-home__content-item, .bbs-home__topic-item, .list-content, .user-favour__item, .post__container, .image-text__container, .link-comment, .hot-search, .right-side-default, .hb-bbs-link__header, .hb-bbs-link__content, .search-result__tool, .result-mini-app__item, .price-box, .el-card, .el-dialog, .el-drawer, .el-message-box, .el-popper, .el-dropdown-menu) {
      border-radius: 3px !important;
      box-shadow: none !important;
    }
    :root.heybox-up-theme[data-heybox-up-theme="mist"] :is(.bbs-home__content-item, .bbs-home__topic-item, .list-content, .user-favour__item, .post__container, .image-text__container, .link-comment, .hot-search, .right-side-default, .hb-bbs-link__header, .hb-bbs-link__content, .search-result__tool, .result-mini-app__item, .price-box, .el-card, .el-dialog, .el-drawer, .el-message-box, .el-popper, .el-dropdown-menu) {
      border-radius: 16px !important;
      box-shadow: 0 6px 20px rgba(47, 74, 84, .08) !important;
    }
    :root.heybox-up-theme[data-heybox-up-theme="paper"] :is(.post__title, .image-text__title, .bbs-content__title, .bbs-link-section-title-text, .section-title__content, .user-favour__title, .related-recommend__container--header) {
      font-family: Georgia, "Songti SC", "Noto Serif CJK SC", serif;
      letter-spacing: .01em;
    }
    :root.heybox-up-theme[data-heybox-up-theme="paper"] :is(.post__content, .image-text__content) a {
      color: var(--heybox-up-accent);
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    /* 版式：定宽阅读栏 + 卡片化信息流。站点通栏列表每行超过 90 字，长读易疲劳。 */
    @media (max-width: 799px) {
      /* 站点给 #app 写死 800px 下限；实际手机宽度会被裁切，这里恢复单列收缩。 */
      #app { min-width: 0 !important; width: 100% !important; }
    }
    :root {
      --heybox-up-page-w: 1360px;
      /* 中间栏占视口百分比，可在齿轮设置菜单里调；上限避免超宽屏上正文行过长。 */
      --heybox-up-feed-pct: 56;
      /* Body line height multiplier, adjustable in the settings menu or the reader rail panel. */
      --heybox-up-reading-line-height: 1.7;
      --heybox-up-feed-w: min(calc(var(--heybox-up-feed-pct) * 1vw), 1180px);
      --heybox-up-radius-card: 14px;
      --heybox-up-gap: 12px;
      --heybox-up-card-pad: 20px;
      --heybox-up-shadow-1: 0 1px 2px rgba(16, 24, 40, .05);
      --heybox-up-shadow-2: 0 14px 34px rgba(16, 24, 40, .14);
    }
    :root.heybox-up-theme[data-heybox-up-theme="paper"] {
      --heybox-up-radius-card: 4px;
      --heybox-up-shadow-1: none;
      --heybox-up-shadow-2: 0 10px 24px rgba(47, 42, 34, .12);
    }
    :root.heybox-up-theme[data-heybox-up-theme="mist"] {
      --heybox-up-radius-card: 18px;
      --heybox-up-shadow-1: 0 4px 14px rgba(47, 74, 84, .07);
      --heybox-up-shadow-2: 0 16px 36px rgba(47, 74, 84, .14);
    }
    :root.heybox-up-theme[data-heybox-up-theme="oled"] {
      --heybox-up-radius-card: 8px;
      --heybox-up-shadow-1: none;
      --heybox-up-shadow-2: 0 14px 34px rgba(0, 0, 0, .72);
    }
    @media (min-width: 1200px) {
      #app > main {
        max-width: var(--heybox-up-page-w) !important;
        padding-left: 24px !important;
        padding-right: 24px !important;
      }
      #app > main > section,
      #app > main > .layout-normal {
        max-width: 100% !important;
      }
    }
    /* 社区首页：移除热门社区/二维码右栏，信息流量成一条阅读栏，宽度够放两张图也不拉长正文行。 */
    #page-bbs-community .cpt-right-side.right {
      display: none !important;
    }
    #page-bbs-community .content {
      width: auto !important;
      max-width: var(--heybox-up-page-w) !important;
      margin: 0 auto !important;
      justify-content: center !important;
    }
    #page-bbs-community main.list {
      width: auto !important;
      max-width: var(--heybox-up-feed-w) !important;
      flex: 0 1 var(--heybox-up-feed-w) !important;
      min-width: 0;
    }
    /* 搜索栏跟随阅读栏宽度居中，避免页头比信息流每侧多出 176px。 */
    #page-bbs-community .bbs-community__search-module {
      width: min(var(--heybox-up-feed-w), 100%) !important;
      max-width: 100% !important;
      margin-left: auto !important;
      margin-right: auto !important;
    }
    /* 搜索建议加载期间的空壳会留下 26px 浮层，截获首张帖子卡片的点击；无内容时直接收起。 */
    #page-bbs-community .search__pull-list:has(> .search__suggestion:empty) {
      display: none !important;
    }
    @media (min-width: 1200px) {
      body.heybox-up-rail-open #page-bbs-community .content {
        justify-content: flex-start !important;
      }
      body.heybox-up-rail-open #page-bbs-community main.list {
        margin-left: 0 !important;
        margin-right: auto !important;
      }
    }
    #page-bbs-community .hb-bbs-home,
    #page-bbs-community .bbs-home__content-list {
      width: auto !important;
      max-width: none !important;
      flex: 1 1 auto !important;
      min-width: 0;
    }
    /* 卡片化：帖子之间留间隙与细边，滚动时条目边界一眼可辨。 */
    #page-bbs-community .bbs-home__content-list {
      display: flex !important;
      flex-direction: column;
      gap: var(--heybox-up-gap);
      padding: 4px 0 28px !important;
    }
    #page-bbs-community .bbs-home__content-item {
      margin: 0 !important;
      padding: 0 !important;
      border: 1px solid var(--heybox-up-border) !important;
      border-radius: var(--heybox-up-radius-card) !important;
      background-color: var(--heybox-up-surface) !important;
      box-shadow: var(--heybox-up-shadow-1);
      overflow: hidden;
      transition: border-color .16s ease, box-shadow .16s ease;
    }
    #page-bbs-community .bbs-home__content-item:hover {
      border-color: var(--heybox-up-raised) !important;
      box-shadow: var(--heybox-up-shadow-2);
    }
    #page-bbs-community .bbs-home__content-item > a.hb-cpt__bbs-list-content {
      display: block;
      padding: var(--heybox-up-card-pad) !important;
      background: transparent !important;
    }
    #page-bbs-community :is(.hb-bbs-home__feed-splitline, .hb-bbs-home__splitline)::before,
    #page-bbs-community :is(.hb-bbs-home__feed-splitline, .hb-bbs-home__splitline)::after {
      background: transparent !important;
    }
    #page-bbs-community .bbs-home__topic-list-wrapper {
      margin: 0 0 var(--heybox-up-gap) !important;
      padding: 10px 14px !important;
      border: 1px solid var(--heybox-up-border) !important;
      border-radius: var(--heybox-up-radius-card) !important;
      background-color: var(--heybox-up-surface) !important;
      overflow: hidden;
    }
    /* 卡片内排版：标题 17/1.5，正文 15/1.72，元信息压到 13px，层级靠字号与颜色拉开。 */
    #page-bbs-community .bbs-content__title {
      margin: 10px 0 6px !important;
      font-size: 17px !important;
      line-height: 1.5 !important;
      font-weight: 600;
      letter-spacing: .005em;
    }
    #page-bbs-community .bbs-content__content {
      font-size: 15px !important;
      line-height: 1.72 !important;
      color: var(--heybox-up-text-2) !important;
    }
    #page-bbs-community .bbs-list-content__header {
      gap: 8px;
    }
    #page-bbs-community .list-content__username {
      font-size: 13px !important;
      font-weight: 500;
    }
    #page-bbs-community .bbs-content__imgs-wrapper {
      margin-top: 10px !important;
    }
    #page-bbs-community .bbs-content__image {
      border-radius: 10px !important;
    }
    /* 作者行、更多按钮与图片计数是卡片里最小的可点区域，统一抬到 24px 与 11px。 */
    :root.heybox-up-theme :is(#page-bbs-community .header__user, #page-topic-link .header__user) {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
    }
    :root.heybox-up-theme .list-cotent__operation-btn {
      display: inline-grid;
      place-items: center;
      width: 24px !important;
      height: 24px !important;
    }
    :root.heybox-up-theme #page-topic-link .topic-link__sorter {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
    }
    :root.heybox-up-theme .bbs-content__image-cnt { font-size: 11px !important; }
    #page-bbs-community .bbs-new-style-bottom {
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid var(--heybox-up-border);
    }
    /* 窄屏：卡片化会吃掉内边距，收回固定宽度与内边距，信息流改用整幅。 */
    @media (max-width: 1100px) {
      :root {
        --heybox-up-feed-w: min(960px, 100%);
        --heybox-up-card-pad: 16px;
      }
    }
    /* 评论预览侧栏：展开时由桌面栅格为预览保留真实宽度，侧栏本身在 Shadow DOM 内自绘。 */
    :root { --heybox-up-rail-w: 320px; }
    @media (max-width: 1399px) {
      :root { --heybox-up-rail-w: 288px; }
    }
    #page-bbs-community :is(.bbs-new-style-bottom__comment, .content-list__comment) {
      cursor: pointer;
    }
    /* 评论排序只改 order，不动 DOM，避免打断站点自身的列表更新。 */
    #page-bbs-link .link-comment__list {
      display: flex !important;
      flex-direction: column;
    }
    /* 帖子详情：正文纸张 + 原生评论侧栏，两块各自成卡片，中间留 24px 空隙。 */
    @media (min-width: 1200px) {
      #page-bbs-link .content {
        width: auto !important;
        max-width: var(--heybox-up-page-w) !important;
        margin: 0 auto !important;
        gap: 24px;
        align-items: flex-start;
        justify-content: center;
      }
      #page-bbs-link .list {
        max-width: none !important;
        flex: 1 1 auto !important;
        min-width: 0;
      }
      #page-bbs-link .cpt-right-side.right {
        display: none !important;
      }
      #page-bbs-link .hb-cpt__scroll-list.hb-bbs-link__container {
        width: auto !important;
        max-width: none !important;
      }
      #page-bbs-link .hb-bbs-link__content {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) 424px;
        gap: 24px;
        align-items: start;
        width: auto !important;
        max-width: none !important;
      }
      #page-bbs-link .hb-bbs-image-text {
        grid-column: 1;
        min-width: 0;
        padding: 28px 32px !important;
        border: 1px solid var(--heybox-up-border) !important;
        border-radius: var(--heybox-up-radius-card) !important;
        background-color: var(--heybox-up-surface) !important;
        box-shadow: var(--heybox-up-shadow-1);
        /* 正文与评论各自滚动：正文列吸顶并限高，滚到底不带走整页。 */
        position: sticky;
        top: 88px;
        max-height: calc(100vh - 112px);
        overflow-y: auto;
        overscroll-behavior: contain;
        scrollbar-width: thin;
        scrollbar-gutter: stable;
      }
      #page-bbs-link .link-comment {
        grid-column: 2;
        position: sticky;
        top: 88px;
        height: calc(100vh - 112px);
        max-height: calc(100vh - 112px);
        overflow-y: auto;
        overscroll-behavior: contain;
        scrollbar-width: thin;
        width: 100% !important;
        margin: 0 !important;
        border: 1px solid var(--heybox-up-border) !important;
        border-radius: var(--heybox-up-radius-card) !important;
        background-color: var(--heybox-up-surface) !important;
        box-shadow: var(--heybox-up-shadow-1);
      }
      #page-bbs-link .link-comment .comment__comment-header {
        top: 0 !important;
        background-color: var(--heybox-up-surface) !important;
      }
    }
    /* Body: line height comes from the user preference; paragraphs stay under 46em. */
    #page-bbs-link :is(.post__title, .image-text__title, .section-title__content) {
      font-size: 25px !important;
      line-height: 1.42 !important;
      font-weight: 700;
      letter-spacing: -.01em;
    }
    #page-bbs-link :is(.post__content, .image-text__content) {
      font-size: 16px !important;
      line-height: var(--heybox-up-reading-line-height) !important;
    }
    /* The site hard-codes a 25px line height on nested paragraphs; cover body text
       only so cards and blockquotes keep their own styles. */
    #page-bbs-link :is(.post__content, .image-text__content) :is(p, li, ul, ol, .line, .order-line, .text):not([class*="com-"], [class*="com-"] *):not(blockquote, blockquote *) {
      line-height: var(--heybox-up-reading-line-height) !important;
    }
    #page-bbs-link :is(.post__content, .image-text__content) :is(p, blockquote, h1, h2, h3, h4) {
      max-width: 46em;
    }
    #page-bbs-link :is(.post__content, .image-text__content) p {
      margin: 0 0 .72em !important;
    }
    #page-bbs-link :is(.post__content, .image-text__content) h2 {
      margin: 1.4em 0 .6em !important;
      font-size: 20px !important;
      line-height: 1.5 !important;
    }
    #page-bbs-link :is(.post__content, .image-text__content) h3 {
      margin: 1.2em 0 .5em !important;
      font-size: 17px !important;
      line-height: 1.55 !important;
    }
    #page-bbs-link :is(.post__content, .image-text__content) blockquote {
      margin: 1em 0 !important;
      padding: 2px 0 2px 14px !important;
      border-left: 3px solid var(--heybox-up-accent) !important;
      color: var(--heybox-up-muted) !important;
      line-height: 1.8 !important;
    }
    #page-bbs-link :is(.post__content, .image-text__content) blockquote :is(p, .text) {
      line-height: 1.8 !important;
    }
    /* The native article styles hard-code dark text on nested paragraphs and ordered-list lines.
       Cards and blockquotes keep their own colors, matching the line-height exclusion above. */
    #page-bbs-link :is(.post__content, .image-text__content) :is(p, li, ol, ul, .line, .order-line, .text):not([class*="com-"], [class*="com-"] *):not(blockquote, blockquote *) {
      color: var(--heybox-up-text) !important;
    }
    #page-bbs-link :is(.post__content, .image-text__content) blockquote,
    #page-bbs-link :is(.post__content, .image-text__content) blockquote :is(p, .text) {
      color: var(--heybox-up-muted) !important;
    }
    #page-bbs-link :is(.post__content, .image-text__content) :is(img, .hb-cpt__image) {
      border-radius: 10px !important;
    }
    /* 评论区：14px 正文，楼层用细线分隔，嵌套回复保留站点结构只改圆角与间距。 */
    #page-bbs-link .link-comment__comment-item {
      padding: 14px 16px !important;
      border-top: 1px solid var(--heybox-up-border) !important;
    }
    #page-bbs-link :is(.comment-item__content, .children-item__comment-content) {
      font-size: 14px !important;
      line-height: 1.7 !important;
    }
    #page-bbs-link .link-comment__comment-children {
      margin-top: 8px !important;
      border-radius: 10px !important;
    }
    @media (max-width: 1199px) {
      #page-bbs-link .content {
        flex-direction: column;
      }
      #page-bbs-link .list {
        width: 100% !important;
        max-width: none !important;
      }
      #page-bbs-link .cpt-right-side.right {
        display: none !important;
      }
      #page-bbs-link .hb-cpt__scroll-list.hb-bbs-link__container,
      #page-bbs-link .hb-bbs-link__content {
        width: auto !important;
        max-width: none !important;
      }
      #page-bbs-link .hb-bbs-link__content {
        display: flex;
        flex-direction: column;
      }
      #page-bbs-link .link-comment {
        width: 100% !important;
        margin: 16px 0 0 !important;
      }
    }
    /* 站点未覆盖的容器补齐主题底色：嵌套回复块、个人主页列表。 */
    :root.heybox-up-theme .link-comment__comment-children {
      background-color: var(--heybox-up-subtle) !important;
      border-color: var(--heybox-up-border) !important;
    }
    :root.heybox-up-theme #page-user-profile > .content > .list {
      background-color: var(--heybox-up-surface) !important;
      border-color: var(--heybox-up-border) !important;
      color: var(--heybox-up-text);
    }
    /* Profile submissions use a near-white 4px divider and dark text colors from the original skin. */
    :root.heybox-up-theme #page-user-profile .user-profile-article-item::after {
      background-color: transparent !important;
      background-image: none !important;
    }
    :root.heybox-up-theme #page-user-profile .article-title .title {
      color: var(--heybox-up-text) !important;
    }
    :root.heybox-up-theme #page-user-profile .bottom-line :is(.time, .comment, .comment span) {
      color: var(--heybox-up-text-2) !important;
    }
    :root.heybox-up-theme #page-user-profile .tab-item {
      color: var(--heybox-up-text-2) !important;
    }
    :root.heybox-up-theme #page-user-profile .tab-item.active {
      color: var(--heybox-up-text) !important;
    }
    /* The profile right rail only carries the app QR code, promotions and ICP text. */
    #page-user-profile .cpt-right-side.right {
      display: none !important;
    }
    #page-user-profile .content > .list {
      flex: 1 1 auto !important;
      width: auto !important;
      min-width: 0 !important;
      max-width: none !important;
    }
    /* Theme the author hover card without changing its 315x146 box or z-index. */
    :root.heybox-up-theme #page-user-profile .name-box .detail-info {
      background-color: var(--heybox-up-surface) !important;
      color: var(--heybox-up-text) !important;
      box-shadow: 0 0 0 1px var(--heybox-up-border), 0 18px 46px rgba(0, 0, 0, .32) !important;
    }
    :root.heybox-up-theme #page-user-profile .name-box .detail-info::after {
      background-color: var(--heybox-up-surface) !important;
    }
    :root.heybox-up-theme #page-user-profile .name-box .detail-info .main-info {
      color: var(--heybox-up-text) !important;
    }
    :root.heybox-up-theme #page-user-profile .name-box .detail-info .sub-info {
      color: var(--heybox-up-text-2) !important;
    }
    /* 站点用伪元素画页面底色与帖子分隔条，颜色不随变量走，需单独覆盖。 */
    :root.heybox-up-theme[data-heybox-up-dark="true"] {
      background-color: var(--heybox-up-bg) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#app > main > section, #page-bbs-community .hb-bbs-home__feed-splitline, #page-bbs-community .hb-bbs-home__splitline)::before,
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#app > main > section, #page-bbs-community .hb-bbs-home__feed-splitline, #page-bbs-community .hb-bbs-home__splitline)::after {
      background-color: var(--heybox-up-bg) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#page-bbs-community main.list, #page-bbs-link main.list)::before,
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#page-bbs-community main.list, #page-bbs-link main.list)::after {
      background-color: var(--heybox-up-surface) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] .hb-cpt__moment-list-content::after {
      background-color: var(--heybox-up-subtle) !important;
    }
    /* 站点用伪元素画卡片底部 4px 色带，取色固定为近白，任何主题下都会形成白条。 */
    :root.heybox-up-theme .hb-bbs-image-text::after,
    :root.heybox-up-theme .hb-bbs-post::after,
    :root.heybox-up-theme .hb-bbs__video::after {
      background-color: transparent !important;
      background-image: none !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] .link-reply::before,
    :root.heybox-up-theme[data-heybox-up-dark="true"] .link-comment__comment-item + .link-comment__comment-item:not(:hover)::before,
    :root.heybox-up-theme[data-heybox-up-dark="true"] .link-comment__comment-children .comment-children__load-all::before,
    :root.heybox-up-theme[data-heybox-up-dark="true"] .hb-cpt__slide-tab.underline::after,
    :root.heybox-up-theme[data-heybox-up-dark="true"] .hb-cpt__slide-tab.line::after,
    :root.heybox-up-theme[data-heybox-up-dark="true"] .related-recommend__link-item--content::before,
    :root.heybox-up-theme[data-heybox-up-dark="true"] .related-recommend__link-item--topic::before {
      background-color: var(--heybox-up-border) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] .link-comment__comment-children .comment-children-item:hover::after {
      background-color: var(--heybox-up-subtle) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] .link-reply .link-reply__main-box .link-reply__input-wrapper::after {
      border-color: var(--heybox-up-border) !important;
    }
    /* 正文内嵌的 com-* 卡片族（游戏/专辑/百科/比赛/模组/角标/等）底色写死为浅色，
       深色下会整块发白。统一按容器、描边、主次文字、药丸底、占位块五组覆盖。 */
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.com-game-card, .com-album-card, .com-award-table-card, .com-chatroom-card, .com-league-card, .com-match-card, .com-mod-card, .com-sku-card, .com-wiki-card) {
      background-color: var(--heybox-up-subtle) !important;
      color: var(--heybox-up-text) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.com-game-card, .com-album-card, .com-award-table-card, .com-chatroom-card, .com-league-card, .com-match-card, .com-mod-card, .com-sku-card, .com-wiki-card).is-editor-mode,
    :root.heybox-up-theme[data-heybox-up-dark="true"] .com-card-placeholder {
      background-color: var(--heybox-up-surface) !important;
      color: var(--heybox-up-text) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] .com-card-placeholder svg path {
      fill: var(--heybox-up-muted) !important;
    }
    /* 卡片描边用 1px 边框乘 0.5 缩放绘制，颜色写死，深色下成亮边。 */
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.com-game-card, .com-album-card, .com-award-table-card, .com-chatroom-card, .com-league-card, .com-match-card, .com-mod-card, .com-sku-card, .com-wiki-card)::after {
      border-color: var(--heybox-up-border) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.com-award-table-card .award-table-row, .com-award-table-card .award-table-row.title, .com-award-table-card .award-table-row:last-of-type) {
      border-color: var(--heybox-up-border) !important;
    }
    /* 主文字：写死 #14191e。 */
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(
      .com-game-card .game-info .line-1,
      .com-game-card .game-info .line-2 .price-box .price-content-box,
      .com-game-card .game-info .line-2 .price-box .price-content-box .coupon-tip,
      .com-game-card .game-info .line-2 .follow-box .follow-num,
      .com-album-card .album-info .line-1 .album-name,
      .com-award-table-card .award-table-row,
      .com-chatroom-card .info-section .chatroom-title,
      .com-league-card .league-info-box .line-1 .league-title,
      .com-match-card .team-1 .team-name,
      .com-match-card .team-2 .team-name,
      .com-match-card .match-info-wrapper .line-2 .aftermatch .team-score.weight,
      .com-match-card .match-info-wrapper .line-2 .watched,
      .com-match-card .match-info-wrapper .line-2 .commingsoon,
      .com-mod-card .mod-card-info .mod-card-title,
      .com-sku-card .sku-info-box .line-1,
      .com-sku-card .sku-info-box .line-2 .price-box .price-content-box,
      .com-wiki-card .info-section .info-line .words-num
    ) {
      color: var(--heybox-up-text) !important;
    }
    /* 次要文字：写死 #8c9196 与 #64696e。 */
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(
      .com-game-card .game-info .line-2 .price-box .price-content-box .release-desc,
      .com-game-card .game-info .line-2 .price-box .price-content-box .release-time,
      .com-game-card .game-info .line-2 .price-box .price-content-box .original-price,
      .com-game-card .game-info .line-2 .follow-box .had-tag,
      .com-game-card .game-info .line-2 .follow-box i,
      .com-album-card .delete-desc,
      .com-album-card .album-info .line-2 .game-num,
      .com-award-table-card .award-table-row.unfold,
      .com-chatroom-card .info-section .line-2 .default-desc,
      .com-chatroom-card .info-section .line-2 .online-count,
      .com-chatroom-card .info-section .line-2 .room-count,
      .com-league-card .league-info-box .line-2 .league-date,
      .com-match-card .match-info-wrapper .line-1,
      .com-match-card .match-info-wrapper .line-2,
      .com-match-card .match-info-wrapper .line-3,
      .com-match-card .match-info-wrapper .line-2 .aftermatch .colon,
      .com-mod-card .mod-card-info .mod-card-summary,
      .com-sku-card .sku-info-box .line-2 .price-box .price-content-box .original-price,
      .com-wiki-card .info-section .info-line .words-num-desc,
      .com-wiki-card .info-section .info-line .enter-wiki,
      .com-wiki-card .info-section .info-line i
    ) {
      color: var(--heybox-up-muted) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] .com-game-card .game-info .line-2 .price-box .price-content-box .original-price::after {
      background-color: var(--heybox-up-muted) !important;
    }
    /* 药丸/标签底：写死 #f3f4f5，配深色文字，深色下变成亮块加暗字。 */
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(
      .com-game-card .game-info .line-2 .price-box,
      .com-game-card .game-info .line-2 .follow-box,
      .com-album-card .delete-album,
      .com-album-card .album-info .line-2 .favour-btn.favoured,
      .com-award-table-card .award-table-row.title,
      .com-award-table-card .award-table-row.unfold,
      .com-league-card .league-info-box .line-2 .league-date,
      .com-league-card .league-info-box .line-2 .price-pool,
      .com-match-card .match-info-wrapper .line-2 .aftermatch .team-score,
      .com-match-card .match-info-wrapper .line-2 .watched,
      .com-match-card .match-info-wrapper .line-2 .commingsoon,
      .com-match-card .match-info-wrapper .line-2 .aftermatch .colon,
      .com-sku-card .sku-info-box .line-2 .price-box
    ) {
      background-color: var(--heybox-up-raised) !important;
    }
    /* 深色实心按钮：写死 #14191e 或同色渐变，深色下与卡片底几乎融为一体。 */
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(
      .com-game-card .game-info .line-2 .follow-btn,
      .com-game-card .game-info .line-2 .wishlist-box,
      .com-game-card .game-info .line-2 .follow-box i,
      .com-game-card .game-info .line-2 .follow-box .follow-unit,
      .com-game-card .game-info .line-2 .wishlist-box i,
      .com-game-card .game-info .line-2 .wishlist-box .add-wishlist-text,
      .com-album-card .album-info .line-1 .album-label,
      .com-album-card .album-info .line-2 .favour-btn,
      .com-match-card .match-info-wrapper .line-2 .unwatched,
      .com-mod-card .mod-card-download,
      .com-mod-card .mod-card-download .mod-card-download-text,
      .com-sku-card .sku-info-box .line-2 .follow-btn
    ) {
      background-color: var(--heybox-up-raised) !important;
      background-image: none !important;
      color: var(--heybox-up-text) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] .com-album-card .album-info .line-2 .favour-btn.favoured {
      color: var(--heybox-up-text-2) !important;
    }
    /* 图片占位底与未加载图片的灰块。 */
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.com-album-card .game-img-album, .com-mod-card .mod-card-image-box) {
      background-color: var(--heybox-up-raised) !important;
    }
    /* 评论区与列表底部的写死浅色小件。 */
    :root.heybox-up-theme[data-heybox-up-dark="true"] .comment-item__writer-like span {
      background-color: var(--heybox-up-raised) !important;
      color: var(--heybox-up-text-2) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] .children-item__comment-creator {
      color: var(--heybox-up-accent) !important;
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] .scroll-list__no-more-desc::before {
      background-color: var(--heybox-up-border) !important;
    }
    /* 文章管理页：列表末尾的“暂无更多内容”会打断卡片流，直接隐藏。 */
    #page-creator-content-management .scroll-list__no-more-desc {
      display: none !important;
    }
    /* 收藏与文章页：右栏只剩二维码、推广与备案信息，移除后让主列表占满内容区。 */
    :is(#page-user-favour, #page-creator-content-management, #page-creator-content-management-detail)
      .cpt-right-side.right {
      display: none !important;
    }
    :is(#page-user-favour, #page-creator-content-management, #page-creator-content-management-detail)
      .content > .list {
      flex: 1 1 auto !important;
      width: auto !important;
      max-width: none !important;
    }
    /* Global search page: right rail holds only hot searches, a QR code, app links and ICP text. */
    #page-bbs-list .cpt-right-side.right {
      display: none !important;
    }
    #page-bbs-list .content > .list {
      flex: 1 1 0 !important;
      width: auto !important;
      min-width: 0 !important;
      max-width: none !important;
    }
    /* The native control anchors to the content box, so it drifts under rails and off the viewport. */
    .scroll-list__button-group {
      right: 20px !important;
      bottom: 24px !important;
      left: auto !important;
    }
    #page-bbs-community .scroll-list__button-group,
    #page-topic-link .scroll-list__button-group,
    #page-bbs-link .scroll-list__button-group {
      display: none !important;
    }
    /* Site confirm dialogs mount on body with fixed light surfaces behind the reader layer. */
    :root.heybox-up-theme .alert-container-wrapper .hb-cpt__alert {
      background-color: var(--heybox-up-surface) !important;
      color: var(--heybox-up-text) !important;
    }
    :root.heybox-up-theme .alert-container-wrapper .hb-cpt__alert-title {
      color: var(--heybox-up-text) !important;
    }
    :root.heybox-up-theme .alert-container-wrapper .hb-cpt__alert-desc {
      color: var(--heybox-up-muted) !important;
    }
    :root.heybox-up-theme .alert-container-wrapper .hb-cpt__alert-input-wrapper {
      background-color: var(--heybox-up-subtle) !important;
      box-shadow: inset 0 0 0 1px var(--heybox-up-border) !important;
    }
    :root.heybox-up-theme .alert-container-wrapper .hb-cpt__alert-input {
      color: var(--heybox-up-text) !important;
    }
    :root.heybox-up-theme .alert-container-wrapper .hb-cpt__alert-input::placeholder {
      color: var(--heybox-up-muted) !important;
    }
    :root.heybox-up-theme .alert-container-wrapper .alert-btn-box__btn.cancel {
      background-color: var(--heybox-up-subtle) !important;
      color: var(--heybox-up-text) !important;
    }
    :root.heybox-up-theme .alert-container-wrapper .alert-btn-box__btn.confirm {
      background: var(--heybox-up-accent) !important;
      color: var(--heybox-up-on-accent) !important;
    }
  `;

  const COMMENT_SORTS = [
    { id: "default", label: "默认" },
    { id: "time", label: "时间" },
    { id: "likes", label: "点赞" },
    { id: "author", label: "作者" },
  ];

  const COMMENT_SORT_HOST_ID = "heybox-up-comment-sort";

  const COMMENT_SORT_CSS = `
    :host {
      display: block;
      margin: 0 !important;
      padding: 9px 12px !important;
      border-bottom: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1)) !important;
      background: var(--heybox-up-surface, #fff) !important;
      font: 12px/1.4 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif !important;
    }
    .bar { display: flex; align-items: center; gap: 8px; }
    .group {
      display: inline-flex; gap: 2px; padding: 2px; border-radius: 999px;
      background: var(--heybox-up-subtle, rgba(20, 25, 30, .06));
    }
    .spacer { flex: 1 1 auto; }
    button {
      padding: 4px 10px; border: 0; border-radius: 999px;
      background: transparent; color: var(--heybox-up-muted, #6b7280);
      font: inherit; cursor: pointer;
      transition: color .12s ease, background-color .12s ease;
    }
    button:hover { color: var(--heybox-up-text, #14191e); }
    button:focus-visible { outline: 2px solid var(--heybox-up-accent, #6f8db3); outline-offset: 1px; }
    .group button[aria-pressed="true"] {
      background: var(--heybox-up-surface, #fff);
      color: var(--heybox-up-text, #14191e);
      font-weight: 600;
      box-shadow: 0 1px 2px rgba(16, 24, 40, .14);
    }
    .cy {
      padding: 4px 9px;
      border: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1));
    }
    .cy[aria-pressed="true"] {
      border-color: transparent;
      background: var(--heybox-up-subtle, rgba(20, 25, 30, .06));
      color: var(--heybox-up-accent, #6f8db3);
      font-weight: 600;
    }
  `;

  function parseCommentAge(text) {
    const value = text.trim();
    if (value === "" || value === "刚刚") return value === "刚刚" ? 0 : Number.POSITIVE_INFINITY;
    if (value === "昨天") return 86400;
    const relative = /^(\d+)\s*(秒|分钟|小时|天)前$/.exec(value);
    if (relative) {
      const unit = { 秒: 1, 分钟: 60, 小时: 3600, 天: 86400 }[relative[2]];
      return Number(relative[1]) * unit;
    }
    const parsed = Date.parse(value.replace(/-/g, "/"));
    return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : (Date.now() - parsed) / 1000;
  }

  function applyCommentSort(tree, mode) {
    const list = tree.querySelector(".link-comment__list");
    if (!list) return;
    const items = Array.from(list.children).filter((node) => node.classList.contains("link-comment__comment-item"));
    if (mode === "default") {
      for (const item of items) item.style.order = "";
      return;
    }
    const authorName = (document.querySelector("#page-bbs-link .link-user__username")?.textContent || "").trim();
    const keyed = items.map((item, index) => {
      const likes = Number((item.querySelector(".like-box__cnt")?.textContent || "0").trim()) || 0;
      const age = parseCommentAge(item.querySelector(".info-box__create-time")?.textContent || "");
      const name = (item.querySelector(".info-box__username")?.textContent || "").trim();
      return { item, index, likes, age, isAuthor: authorName !== "" && name === authorName };
    });
    keyed.sort((a, b) => {
      if (mode === "likes") return b.likes - a.likes || a.index - b.index;
      if (mode === "time") return a.age - b.age || a.index - b.index;
      if (mode === "author") return Number(b.isAuthor) - Number(a.isAuthor) || a.index - b.index;
      return a.index - b.index;
    });
    keyed.forEach((entry, index) => { entry.item.style.order = String(index); });
  }

  function createCommentSort(tree, mode = "default", isHideCy = () => false, onToggleCy = () => {}) {
    const host = document.createElement("div");
    host.id = COMMENT_SORT_HOST_ID;
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = COMMENT_SORT_CSS;
    const bar = document.createElement("div");
    bar.className = "bar";
    const group = document.createElement("div");
    group.className = "group";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "评论排序");
    bar.append(group);
    let current = mode;
    const buttons = COMMENT_SORTS.map((sort) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = sort.label;
      button.dataset.sort = sort.id;
      button.setAttribute("aria-pressed", String(sort.id === current));
      button.addEventListener("click", () => {
        current = sort.id;
        for (const node of buttons) node.setAttribute("aria-pressed", String(node.dataset.sort === current));
        applyCommentSort(tree, current);
      });
      group.append(button);
      return button;
    });
    const spacer = document.createElement("span");
    spacer.className = "spacer";
    const cyButton = document.createElement("button");
    cyButton.type = "button";
    cyButton.className = "cy";
    cyButton.textContent = "屏蔽 CY";
    cyButton.setAttribute("aria-pressed", String(isHideCy()));
    cyButton.title = isHideCy() ? "显示 CY 评论" : "屏蔽 CY 评论";
    cyButton.addEventListener("click", () => onToggleCy());
    bar.append(spacer, cyButton);
    shadow.append(style, bar);
    tree.prepend(host);
    return host;
  }

  function watchCommentSort() {
    if (!document.body) return;
    let host = null;
    let mode = "default";
    let cyLinkId = "";
    let cyPage = 0;
    let cyDone = false;
    let cyLoading = false;
    let cyIds = new Set();
    let cyScanned = new Set();

    const getLinkId = () => {
      const match = /link\/(\d+)/.exec(location.pathname);
      return match ? match[1] : "";
    };

    const toggleCy = () => {
      setHideCyPreference(!readHideCyPreference());
    };

    const updateCyButton = () => {
      const button = host?.shadowRoot?.querySelector("button.cy");
      if (!button) return;
      const hideCy = readHideCyPreference();
      button.setAttribute("aria-pressed", String(hideCy));
      button.title = hideCy ? "显示 CY 评论" : "屏蔽 CY 评论";
    };

    const markCy = () => {
      const tree = document.querySelector("#page-bbs-link .link-comment");
      if (!tree) return;
      let count = 0;
      const counted = new Set();
      for (const node of tree.querySelectorAll("[data-comment-id]")) {
        const id = node.getAttribute("data-comment-id") || "";
        if (cyIds.has(id)) {
          if (node.getAttribute("data-heybox-up-cy") !== "1") node.setAttribute("data-heybox-up-cy", "1");
          if (!counted.has(id)) {
            counted.add(id);
            count += 1;
          }
        } else if (node.hasAttribute("data-heybox-up-cy")) {
          node.removeAttribute("data-heybox-up-cy");
        }
      }
      const button = host?.shadowRoot?.querySelector("button.cy");
      if (!button) return;
      const hidden = readHideCyPreference() ? count : 0;
      button.textContent = hidden > 0 ? "屏蔽 CY (" + hidden + ")" : "屏蔽 CY";
    };

    const pullCyIds = async () => {
      if (cyLoading || cyDone) return;
      const linkId = getLinkId();
      const tree = document.querySelector("#page-bbs-link .link-comment");
      if (linkId === "" || !tree) return;
      const hasUnknown = () => Array.from(tree.querySelectorAll("[data-comment-id]"))
        .some((node) => {
          const id = node.getAttribute("data-comment-id") || "";
          return id !== "" && !cyScanned.has(id);
        });
      if (!hasUnknown()) return;
      cyLoading = true;
      try {
        // 只补未识别的楼层，最多 10 页，避免长楼反复翻页触发接口风控。
        while (!cyDone && cyPage < 10 && getLinkId() === linkId) {
          const data = await fetchRailPage(linkId, cyPage + 1);
          cyPage += 1;
          let added = 0;
          for (const group of data.groups) {
            const list = Array.isArray(group.comment) ? group.comment : [];
            for (const raw of list) {
              const id = String((raw && (raw.commentid || raw.comment_id)) || "");
              if (id !== "" && !cyScanned.has(id)) {
                cyScanned.add(id);
                added += 1;
              }
              if (id !== "" && isCyComment(raw)) cyIds.add(id);
            }
          }
          if (added === 0) cyDone = true;
          if (!hasUnknown()) break;
        }
        if (cyPage >= 10) cyDone = true;
      } catch (error) {
        // 接口失败时保持原生评论可见，不误伤正常楼层。
        cyDone = true;
      } finally {
        cyLoading = false;
        markCy();
      }
    };

    const sync = () => {
      if (!location.pathname.startsWith(LINK_HREF_PREFIX)) {
        host = null;
        mode = "default";
        return;
      }
      const tree = document.querySelector("#page-bbs-link .link-comment");
      if (!tree) return;
      const linkId = getLinkId();
      if (linkId !== cyLinkId) {
        cyLinkId = linkId;
        cyPage = 0;
        cyDone = false;
        cyIds = new Set();
        cyScanned = new Set();
      }
      const active = host?.shadowRoot?.querySelector('button[data-sort][aria-pressed="true"]');
      if (active) mode = active.dataset.sort || "default";
      if (!host || !host.isConnected || host.parentElement !== tree) {
        host = createCommentSort(tree, mode, readHideCyPreference, toggleCy);
      }
      applyCommentSort(tree, mode);
      updateCyButton();
      markCy();
      void pullCyIds();
    };

    registerPageSync(sync, 250, [PAGE_ROUTE.ARTICLE], "article");
    document.addEventListener(HIDE_CY_EVENT, () => {
      updateCyButton();
      markCy();
    });
    sync();
  }

  const THEME_ENTRY_CSS = `
    :host { display: inline-flex; flex: none; position: relative; gap: 2px; }
    .button {
      display: grid; place-items: center; width: 32px; height: 32px; padding: 0;
      border: 0; border-radius: 8px; background: transparent;
      color: var(--heybox-up-icon, #62676e); cursor: pointer;
    }
    .button:hover {
      background: var(--heybox-up-icon-hover-bg, rgba(20, 25, 30, .06));
      color: var(--heybox-up-icon-hover, #14191e);
    }
    .button:focus-visible {
      outline: 2px solid var(--heybox-up-accent, #6f8db3);
      outline-offset: 2px;
    }
    svg { display: block; width: 18px; height: 18px; }
    .menu {
      position: absolute; top: 38px; right: 0; z-index: 1000; width: 236px; padding: 6px;
      border: 1px solid var(--hbu-menu-border, rgba(20, 25, 30, .12)); border-radius: 12px;
      background: var(--hbu-menu-bg, #fff); color: var(--hbu-menu-text, #14191e);
      box-shadow: 0 14px 34px rgba(0, 0, 0, .18);
    }
    .theme-menu { right: 34px; }
    .settings-menu { max-height: min(70vh, 560px); overflow-y: auto; overscroll-behavior: contain; }
    .menu[hidden] { display: none; }
    .menu-title {
      padding: 6px 10px 4px; font-size: 11px; letter-spacing: .08em;
      color: var(--hbu-menu-muted, #6b7280);
    }
    .item {
      display: flex; align-items: center; gap: 10px; width: 100%; padding: 7px 8px;
      border: 0; border-radius: 8px; background: transparent; color: inherit;
      font: inherit; text-align: left; cursor: pointer;
    }
    .item:hover, .item:focus-visible { background: var(--hbu-menu-hover, rgba(20, 25, 30, .06)); outline: none; }
    .item[aria-checked="true"] { background: var(--hbu-menu-hover, rgba(20, 25, 30, .06)); }
    .swatch {
      flex: none; width: 28px; height: 28px; border-radius: 7px;
      border: 1px solid var(--hbu-menu-border, rgba(20, 25, 30, .12));
      background: linear-gradient(135deg, var(--a) 0 55%, var(--b) 55%);
    }
    .copy { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
    .name { font-size: 13px; line-height: 1.3; }
    .hint { font-size: 11px; line-height: 1.3; color: var(--hbu-menu-muted, #6b7280); }
    .check { margin-left: auto; font-size: 12px; color: var(--heybox-up-accent, #6f8db3); opacity: 0; }
    .item[aria-checked="true"] .check { opacity: 1; }
    .sep { height: 1px; margin: 6px 4px; background: var(--hbu-menu-border, rgba(20, 25, 30, .12)); }
    .field { padding: 2px 8px 6px; }
    .field + .field { padding-top: 0; }
    .field-label { padding: 0 2px 6px; font-size: 11px; letter-spacing: .08em; color: var(--hbu-menu-muted, #6b7280); }
    .field-row { display: flex; gap: 6px; align-items: center; }
    .number {
      width: 76px; height: 28px; padding: 0 8px; border: 1px solid var(--hbu-menu-border, rgba(20, 25, 30, .12));
      border-radius: 7px; outline: none; background: transparent; color: inherit;
      font: inherit; font-size: 12px; font-variant-numeric: tabular-nums;
    }
    .number:focus { border-color: var(--heybox-up-accent, #6f8db3); }
    .unit { font-size: 11px; color: var(--hbu-menu-muted, #6b7280); }
    .chips { display: flex; gap: 4px; }
    .chip {
      flex: 1 1 0; min-width: 0; padding: 5px 0; border: 1px solid var(--hbu-menu-border, rgba(20, 25, 30, .12));
      border-radius: 7px; background: transparent; color: inherit; font: inherit; font-size: 12px;
      font-variant-numeric: tabular-nums; text-align: center; cursor: pointer;
      transition: color .14s ease, border-color .14s ease, background .14s ease;
    }
    .chip:hover { background: var(--hbu-menu-hover, rgba(20, 25, 30, .06)); }
    .chip:focus-visible { outline: 2px solid var(--heybox-up-accent, #6f8db3); outline-offset: 1px; }
    .chip[aria-checked="true"] {
      border-color: var(--heybox-up-accent, #6f8db3);
      color: var(--heybox-up-accent, #6f8db3);
      background: var(--hbu-menu-hover, rgba(20, 25, 30, .06));
    }
    .item.toggle[aria-checked="true"] { background: transparent; }
    .switch {
      position: relative; flex: none; margin-left: auto; width: 30px; height: 16px; border-radius: 999px;
      border: 1px solid var(--hbu-menu-border, rgba(20, 25, 30, .12));
      background: var(--hbu-menu-hover, rgba(20, 25, 30, .06));
      transition: border-color .15s ease;
    }
    .switch::after {
      content: ""; position: absolute; top: 1px; left: 2px; width: 12px; height: 12px; border-radius: 50%;
      background: var(--hbu-menu-muted, #6b7280);
      transition: transform .15s ease, background .15s ease;
    }
    .item[aria-checked="true"] .switch { border-color: var(--heybox-up-accent, #6f8db3); }
    .item[aria-checked="true"] .switch::after { transform: translateX(13px); background: var(--heybox-up-accent, #6f8db3); }
  `;

  const THEME_ICONS = {
    system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
    dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/></svg>',
    oled: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 1.5"/></svg>',
    light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    paper: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>',
    mist: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h16M4 13h12M4 17h8"/><path d="M17.5 12.5c1.2 1.4 1.8 2.4 1.8 3.2a1.8 1.8 0 0 1-3.6 0c0-.8.6-1.8 1.8-3.2Z"/></svg>',
  };
  const SETTINGS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3.1"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 8.9 4.6h.08A1.7 1.7 0 0 0 10 3.04V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 8.9v.08A1.7 1.7 0 0 0 20.96 10H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z"/></svg>';

  function ensureThemeStyle() {
    ensureStyleElement("heybox-up-theme-style", THEME_CSS, true);
  }

  function updateThemeEntry() {
    if (!themeEntry) return;
    const preset = getThemePreset(currentThemeMode);
    themeEntry.button.innerHTML = THEME_ICONS[currentThemeMode];
    themeEntry.button.title = "主题：" + preset.label + "（点击选择）";
    themeEntry.button.setAttribute("aria-label", "主题：" + preset.label + "，点击选择");
    themeEntry.button.setAttribute("aria-expanded", String(!themeEntry.menu.hidden));
    themeEntry.settingsButton.setAttribute("aria-expanded", String(!themeEntry.settingsMenu.hidden));
    for (const item of themeEntry.items) {
      item.node.setAttribute("aria-checked", String(item.id === currentThemeMode));
    }
    if (previewToggle) previewToggle.setAttribute("aria-checked", String(readCommentPreviewPreference()));
    if (navMotionToggle) navMotionToggle.setAttribute("aria-checked", String(readNavMotionPreference()));
    if (readerToggle) readerToggle.setAttribute("aria-checked", String(readReaderPreference()));
    syncFeedWidthControls(readFeedWidth());
    syncNumberInput(readerLineHeightInput, readReaderLineHeight());
  }

  function applyTheme(mode, persist) {
    currentThemeMode = normalizeThemeMode(mode);
    const effective = resolveTheme(currentThemeMode, THEME_MEDIA.matches);
    const preset = getThemePreset(effective);
    const root = document.documentElement;
    root.classList.add(THEME_CLASS);
    root.setAttribute(THEME_ATTR, effective);
    root.setAttribute("data-heybox-up-dark", String(preset.dark === true));
    root.style.colorScheme = preset.dark === true ? "dark" : "light";
    ensureThemeStyle();
    if (persist) writeThemeMode(currentThemeMode);
    updateThemeEntry();
    if (preset.dark === true) scheduleDarkSweep(true);
    else clearDarkSweep();
  }

  function createThemeEntry() {
    const host = document.createElement("span");
    host.id = THEME_ENTRY_ID;
    host.className = "heybox-up-theme-entry";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = THEME_ENTRY_CSS;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button";
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", "false");
    const settingsButton = document.createElement("button");
    settingsButton.type = "button";
    settingsButton.className = "button";
    settingsButton.setAttribute("aria-haspopup", "menu");
    settingsButton.setAttribute("aria-expanded", "false");
    settingsButton.setAttribute("aria-label", "打开设置");
    settingsButton.title = "设置";
    settingsButton.innerHTML = SETTINGS_ICON;
    const menu = document.createElement("div");
    menu.className = "menu theme-menu";
    menu.hidden = true;
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "主题预设");
    menu.append(createThemeMenuTitle());
    const settingsMenu = document.createElement("div");
    settingsMenu.className = "menu settings-menu";
    settingsMenu.hidden = true;
    settingsMenu.setAttribute("role", "menu");
    settingsMenu.setAttribute("aria-label", "设置");
    settingsMenu.append(createSettingsMenuTitle());
    const items = THEME_PRESETS.map((preset) => {
      const node = document.createElement("button");
      node.type = "button";
      node.className = "item";
      node.dataset.theme = preset.id;
      node.setAttribute("role", "menuitemradio");
      node.setAttribute("aria-checked", "false");
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.setProperty("--a", preset.swatch[0]);
      swatch.style.setProperty("--b", preset.swatch[1]);
      const copy = document.createElement("span");
      copy.className = "copy";
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = preset.label;
      const hint = document.createElement("span");
      hint.className = "hint";
      hint.textContent = preset.hint;
      copy.append(name, hint);
      const check = document.createElement("span");
      check.className = "check";
      check.textContent = "✓";
      node.append(swatch, copy, check);
      node.addEventListener("click", () => { applyTheme(preset.id, true); closeThemeMenu(); button.focus(); });
      return { id: preset.id, node };
    });
    menu.append(...items.map((item) => item.node));
    settingsMenu.append(
      createCommentPreviewToggle(),
      createNavMotionToggle(),
      createReaderToggle(),
      createReaderLineHeightControl(),
      createThemeMenuSeparator(),
      createFeedWidthControl()
    );

    const closeThemeMenu = () => {
      if (menu.hidden) return;
      menu.hidden = true;
      button.setAttribute("aria-expanded", "false");
      updateThemeEntry();
    };
    const closeSettingsMenu = () => {
      if (settingsMenu.hidden) return;
      settingsMenu.hidden = true;
      settingsButton.setAttribute("aria-expanded", "false");
      updateThemeEntry();
    };
    button.addEventListener("click", () => {
      closeSettingsMenu();
      menu.hidden = !menu.hidden;
      button.setAttribute("aria-expanded", String(!menu.hidden));
      updateThemeEntry();
    });
    settingsButton.addEventListener("click", () => {
      closeThemeMenu();
      settingsMenu.hidden = !settingsMenu.hidden;
      settingsButton.setAttribute("aria-expanded", String(!settingsMenu.hidden));
      updateThemeEntry();
    });
    document.addEventListener("click", (event) => {
      if ((menu.hidden && settingsMenu.hidden) || event.composedPath().includes(host)) return;
      closeThemeMenu();
      closeSettingsMenu();
    }, true);
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || (menu.hidden && settingsMenu.hidden)) return;
      event.preventDefault();
      const returnTarget = settingsMenu.hidden ? button : settingsButton;
      closeThemeMenu();
      closeSettingsMenu();
      returnTarget.focus();
    });

    shadow.append(style, button, settingsButton, menu, settingsMenu);
    themeEntry = { host, button, menu, items, settingsButton, settingsMenu };
    updateThemeEntry();
  }

  function createThemeMenuTitle() {
    const title = document.createElement("div");
    title.className = "menu-title";
    title.textContent = "主题预设";
    return title;
  }

  function createSettingsMenuTitle() {
    const title = document.createElement("div");
    title.className = "menu-title";
    title.textContent = "设置";
    return title;
  }

  function createThemeMenuSeparator() {
    const line = document.createElement("div");
    line.className = "sep";
    line.setAttribute("role", "separator");
    return line;
  }

  // 首页评论预览开关：放在齿轮设置菜单里，偏好只写本机 localStorage。
  function createCommentPreviewToggle() {
    const node = document.createElement("button");
    node.type = "button";
    node.className = "item toggle";
    node.setAttribute("role", "menuitemcheckbox");
    node.setAttribute("aria-checked", String(readCommentPreviewPreference()));
    const copy = document.createElement("span");
    copy.className = "copy";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = "首页评论预览";
    const hint = document.createElement("span");
    hint.className = "hint";
    hint.textContent = "信息流右侧直接看评论";
    copy.append(name, hint);
    const toggle = document.createElement("span");
    toggle.className = "switch";
    node.append(copy, toggle);
    node.addEventListener("click", () => {
      const next = !(node.getAttribute("aria-checked") === "true");
      node.setAttribute("aria-checked", String(next));
      setCommentPreviewPreference(next);
    });
    previewToggle = node;
    return node;
  }

  // 动态导航图标开关：关闭后图标保持静态，悬停与激活都不再播放动画。
  function createNavMotionToggle() {
    const node = document.createElement("button");
    node.type = "button";
    node.className = "item toggle";
    node.setAttribute("role", "menuitemcheckbox");
    node.setAttribute("aria-checked", String(readNavMotionPreference()));
    const copy = document.createElement("span");
    copy.className = "copy";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = "动态导航图标";
    const hint = document.createElement("span");
    hint.className = "hint";
    hint.textContent = "悬停时播放轻量动画";
    copy.append(name, hint);
    const toggle = document.createElement("span");
    toggle.className = "switch";
    node.append(copy, toggle);
    node.addEventListener("click", () => {
      const next = !(node.getAttribute("aria-checked") === "true");
      node.setAttribute("aria-checked", String(next));
      setNavMotionPreference(next);
    });
    navMotionToggle = node;
    return node;
  }

  // 沉浸阅读开关：帖子页默认进入全屏沉浸阅读，关闭后保留原有双栏布局。
  function createReaderToggle() {
    const node = document.createElement("button");
    node.type = "button";
    node.className = "item toggle";
    node.setAttribute("role", "menuitemcheckbox");
    node.setAttribute("aria-checked", String(readReaderPreference()));
    const copy = document.createElement("span");
    copy.className = "copy";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = "沉浸阅读";
    const hint = document.createElement("span");
    hint.className = "hint";
    hint.textContent = "帖子页全屏沉浸阅读，评论收进侧栏";
    copy.append(name, hint);
    const toggle = document.createElement("span");
    toggle.className = "switch";
    node.append(copy, toggle);
    node.addEventListener("click", () => {
      const next = !(node.getAttribute("aria-checked") === "true");
      node.setAttribute("aria-checked", String(next));
      setReaderPreference(next);
    });
    readerToggle = node;
    return node;
  }

  // Feed width: preset chips and the custom percentage share one preference. Only the
  // CSS variable changes; the DOM is never reflowed by this feature.
  const FEED_WIDTH_STEPS = [40, 48, 56, 64, 72];

  function inputRootActiveElement(input) {
    const root = input.getRootNode();
    return root instanceof ShadowRoot ? root.activeElement : document.activeElement;
  }

  function syncNumberInput(input, value) {
    if (input === null) return;
    // Never overwrite the draft the user is still typing into a focused input.
    if (inputRootActiveElement(input) === input) return;
    input.value = String(value);
  }

  function bindNumberInput(input, commit) {
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      commit();
      input.blur();
    });
    input.addEventListener("change", commit);
    input.addEventListener("blur", commit);
  }

  function createReaderLineHeightControl() {
    const wrap = document.createElement("div");
    wrap.className = "field";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "正文行距");
    const label = document.createElement("div");
    label.className = "field-label";
    label.textContent = "正文行距";
    const row = document.createElement("div");
    row.className = "field-row";
    const input = document.createElement("input");
    input.type = "number";
    input.className = "number";
    input.min = String(READER_LINE_HEIGHT_MIN);
    input.max = String(READER_LINE_HEIGHT_MAX);
    input.step = String(READER_LINE_HEIGHT_STEP);
    input.inputMode = "decimal";
    input.value = String(readReaderLineHeight());
    input.setAttribute("aria-label", "正文行距倍数");
    input.title = "正文行距 " + READER_LINE_HEIGHT_MIN + " - " + READER_LINE_HEIGHT_MAX + " 倍";
    const unit = document.createElement("span");
    unit.className = "unit";
    unit.textContent = "倍";
    row.append(input, unit);
    wrap.append(label, row);
    bindNumberInput(input, () => {
      const next = parseReaderLineHeightInput(input.value);
      const value = next === null ? readReaderLineHeight() : setReaderLineHeightPreference(next);
      input.value = String(value);
      updateThemeEntry();
    });
    readerLineHeightInput = input;
    return wrap;
  }

  function syncFeedWidthChips(value) {
    for (const chip of feedWidthChips) {
      chip.setAttribute("aria-checked", String(Number(chip.dataset.width) === value));
    }
  }

  function syncFeedWidthControls(value) {
    syncFeedWidthChips(value);
    syncNumberInput(feedWidthInput, value);
  }

  function createFeedWidthControl() {
    const wrap = document.createElement("div");
    wrap.className = "field";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "中栏宽度");
    const label = document.createElement("div");
    label.className = "field-label";
    label.textContent = "中栏宽度（占屏幕宽度）";
    const chips = document.createElement("div");
    chips.className = "chips";
    for (const step of FEED_WIDTH_STEPS) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.dataset.width = String(step);
      chip.textContent = step + "%";
      chip.title = "中栏占屏幕宽度 " + step + "%";
      chip.setAttribute("role", "menuitemradio");
      chip.setAttribute("aria-checked", "false");
      chip.addEventListener("click", () => {
        const width = setFeedWidthPreference(step);
        syncFeedWidthControls(width);
      });
      chips.append(chip);
    }
    const row = document.createElement("div");
    row.className = "field-row";
    const input = document.createElement("input");
    input.type = "number";
    input.className = "number";
    input.min = String(FEED_WIDTH_MIN);
    input.max = String(FEED_WIDTH_MAX);
    input.step = String(FEED_WIDTH_STEP);
    input.inputMode = "numeric";
    input.value = String(readFeedWidth());
    input.setAttribute("aria-label", "自定义中栏宽度百分比");
    input.title = "自定义中栏宽度 " + FEED_WIDTH_MIN + " - " + FEED_WIDTH_MAX + "%";
    const unit = document.createElement("span");
    unit.className = "unit";
    unit.textContent = "%";
    row.append(input, unit);
    bindNumberInput(input, () => {
      const next = parseFeedWidthInput(input.value);
      const value = next === null ? readFeedWidth() : setFeedWidthPreference(next);
      input.value = String(value);
      syncFeedWidthChips(value);
      updateThemeEntry();
    });
    feedWidthInput = input;
    wrap.append(label, chips, row);
    feedWidthChips = Array.from(chips.children);
    syncFeedWidthControls(readFeedWidth());
    return wrap;
  }

  function mountThemeEntry() {
    if (!document.body) return;
    if (themeEntry?.host.isConnected && themeEntry.host.parentElement?.classList.contains("nav-actions")) return;
    const actions = document.querySelector(".nav-actions");
    if (!actions) return;
    if (!themeEntry) createThemeEntry();
    if (themeEntry.host.parentNode !== actions) {
      const anchor = actions.querySelector(".publish-btn, .login-btn");
      actions.insertBefore(themeEntry.host, anchor);
    }
  }

  function watchTheme() {
    if (!document.body) return;
    const sync = () => {
      ensureThemeStyle();
      mountThemeEntry();
      scheduleDarkSweep();
    };
    registerPageSync(sync, 400, null, "chrome");
    registerPageSync(() => scheduleDarkSweep(), 600, [PAGE_ROUTE.CREATOR, PAGE_ROUTE.TOPIC]);
    sync();
  }

  // 站点把不少底色直接写在组件里，选择器一变就漏出白块。深色主题下对这些页面做一次兜底扫描：
  // 只给近白底色、近白描边与过暗文字挂类，不改 DOM 结构；类一旦挂上就保留，避免与 hover 反复拉锯。
  const DARK_SWEEP_ROOT_SELECTOR =
    "#page-creator-content-management, #page-creator-content-management-detail, #page-topic-link";
  const DARK_FLAT_CLASS = "heybox-up-dark-flat";
  const DARK_FLAT_SUBTLE_CLASS = "heybox-up-dark-flat-subtle";
  const DARK_EDGE_CLASS = "heybox-up-dark-edge";
  const DARK_INK_CLASS = "heybox-up-dark-ink";
  const DARK_SWEEP_LIMIT = 3000;
  const DARK_SWEEP_SKIP = new Set([
    "IMG", "VIDEO", "CANVAS", "SVG", "PATH", "USE", "IFRAME",
    "INPUT", "TEXTAREA", "SELECT", "OPTION", "SCRIPT", "STYLE", "LINK",
  ]);
  const RGB_COLOR = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/;
  let darkSweepTimer = 0;
  let darkSweepIdleHandle = 0;
  let darkSweepLastRun = 0;

  function parseRgbColor(value) {
    const match = RGB_COLOR.exec(value || "");
    if (match === null) return null;
    return {
      r: Number(match[1]),
      g: Number(match[2]),
      b: Number(match[3]),
      a: match[4] === undefined ? 1 : Number(match[4]),
    };
  }

  function isNearWhite(color, min) {
    return color !== null && color.a >= 0.6 && (color.r + color.g + color.b) / 3 >= min;
  }

  function hasOwnText(node) {
    for (const child of node.childNodes) {
      if (child.nodeType === 3 && child.nodeValue.trim() !== "") return true;
    }
    return false;
  }

  function clearDarkSweep() {
    if (darkSweepTimer !== 0) {
      window.clearTimeout(darkSweepTimer);
      darkSweepTimer = 0;
    }
    if (darkSweepIdleHandle !== 0 && typeof window.cancelIdleCallback === "function") {
      window.cancelIdleCallback(darkSweepIdleHandle);
      darkSweepIdleHandle = 0;
    }
    const selector = "." + DARK_FLAT_CLASS + ", ." + DARK_FLAT_SUBTLE_CLASS + ", ." + DARK_EDGE_CLASS + ", ." + DARK_INK_CLASS;
    for (const node of document.querySelectorAll(selector)) {
      node.classList.remove(DARK_FLAT_CLASS, DARK_FLAT_SUBTLE_CLASS, DARK_EDGE_CLASS, DARK_INK_CLASS);
    }
  }

  function sweepDarkSurfaces() {
    if (document.documentElement.getAttribute("data-heybox-up-dark") !== "true") {
      clearDarkSweep();
      return;
    }
    const roots = document.querySelectorAll(DARK_SWEEP_ROOT_SELECTOR);
    if (roots.length === 0) return;
    const styleCache = new WeakMap();
    const flatCache = new WeakMap();
    const readStyle = (node) => {
      let style = styleCache.get(node);
      if (style === undefined) {
        style = getComputedStyle(node);
        styleCache.set(node, style);
      }
      return style;
    };
    // Cache opaque/flat ancestor state within one sweep instead of forcing style reads at every depth.
    const hasFlatBackground = (node) => {
      const path = [];
      for (let element = node; element !== null; element = element.parentElement) {
        if (element.classList.contains(DARK_FLAT_CLASS) || element.classList.contains(DARK_FLAT_SUBTLE_CLASS)) {
          for (const item of path) flatCache.set(item, true);
          return true;
        }
        const known = flatCache.get(element);
        if (known !== undefined) {
          for (const item of path) flatCache.set(item, known);
          return known;
        }
        path.push(element);
        const color = parseRgbColor(readStyle(element).backgroundColor);
        if (color !== null && color.a >= 0.6) {
          for (const item of path) flatCache.set(item, false);
          return false;
        }
      }
      for (const item of path) flatCache.set(item, false);
      return false;
    };
    for (const root of roots) {
      const nodes = root.querySelectorAll("*");
      const total = Math.min(nodes.length, DARK_SWEEP_LIMIT);
      for (let index = 0; index < total; index += 1) {
        const node = nodes[index];
        if (DARK_SWEEP_SKIP.has(node.tagName) || node.id.startsWith("heybox-up")) continue;
        const style = readStyle(node);
        if (!node.classList.contains(DARK_FLAT_CLASS) && !node.classList.contains(DARK_FLAT_SUBTLE_CLASS)) {
          if (style.backgroundImage === "none") {
            const bg = parseRgbColor(style.backgroundColor);
            if (isNearWhite(bg, 240)) {
              node.classList.add(isNearWhite(bg, 250) ? DARK_FLAT_CLASS : DARK_FLAT_SUBTLE_CLASS);
              flatCache.set(node, true);
            }
          }
        }
        if (!node.classList.contains(DARK_EDGE_CLASS) && styleHasBrightEdge(style)) {
          node.classList.add(DARK_EDGE_CLASS);
        }
        if (!node.classList.contains(DARK_INK_CLASS) && hasOwnText(node)) {
          const ink = parseRgbColor(style.color);
          if (ink !== null && (ink.r + ink.g + ink.b) / 3 < 120 && hasFlatBackground(node)) {
            node.classList.add(DARK_INK_CLASS);
          }
        }
      }
    }
  }

  // 只处理真正画出来的描边：宽 0 或 style 为 none 时，border-color 只是 color 的副本，改它没有意义。
  function styleHasBrightEdge(style) {
    if (style.borderStyle === "none" || style.borderStyle === "") return false;
    if (style.borderTopWidth === "0px" && style.borderRightWidth === "0px"
      && style.borderBottomWidth === "0px" && style.borderLeftWidth === "0px") return false;
    return isNearWhite(parseRgbColor(style.borderTopColor), 240)
      || isNearWhite(parseRgbColor(style.borderRightColor), 240)
      || isNearWhite(parseRgbColor(style.borderBottomColor), 240)
      || isNearWhite(parseRgbColor(style.borderLeftColor), 240);
  }

  function scheduleDarkSweep(force = false) {
    if (document.documentElement.getAttribute("data-heybox-up-dark") !== "true") return;
    if (document.querySelector(DARK_SWEEP_ROOT_SELECTOR) === null) return;
    if (darkSweepTimer !== 0 || darkSweepIdleHandle !== 0) {
      if (!force) return;
      window.clearTimeout(darkSweepTimer);
      darkSweepTimer = 0;
      if (darkSweepIdleHandle !== 0 && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(darkSweepIdleHandle);
        darkSweepIdleHandle = 0;
      }
    }
    const elapsed = performance.now() - darkSweepLastRun;
    const delay = force ? 350 : Math.max(350, 1200 - elapsed);
    darkSweepTimer = window.setTimeout(() => {
      darkSweepTimer = 0;
      darkSweepLastRun = performance.now();
      if (typeof window.requestIdleCallback === "function") {
        darkSweepIdleHandle = window.requestIdleCallback(() => {
          darkSweepIdleHandle = 0;
          sweepDarkSurfaces();
        }, { timeout: 1000 });
      } else {
        sweepDarkSurfaces();
      }
    }, delay);
  }

  // 顶部导航只保留四个高频入口，用「SVG + 文本」替换站点原有的七个文字按钮。
  const NAV_ID = "heybox-up-nav";
  const NAV_STYLE_ID = "heybox-up-nav-style";
  const NAV_STATIC_CLASS = "heybox-up-nav-static";
  const CY_HASH = "#heybox-up-cy";

  const NAV_ITEMS = [
    { id: "home", label: "首页", href: "/" },
    { id: "community", label: "社区", href: "/app/bbs/home" },
    { id: "favour", label: "收藏", href: "/app/user/favour/content" },
    { id: "article", label: "文章", href: "/creator/content_management/home?article_type=all" },
  ];

  const NAV_ICONS = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g class="hbu-ico-anim hbu-ico-home"><path d="M4 11.2 12 4l8 7.2"/><path d="M6.6 9.8V20h10.8V9.8"/><path d="M10.2 20v-5.2h3.6V20"/></g></svg>',
    community: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g class="hbu-ico-anim hbu-ico-community"><path d="M20.5 11.6a7.9 7.9 0 0 1-8.4 7.9 9 9 0 0 1-2.8-.4L4.5 20.5l1.3-4.1a7.8 7.8 0 0 1-1.3-4.8A7.9 7.9 0 0 1 12.4 3.7a7.9 7.9 0 0 1 8.1 7.9Z"/><circle cx="8.8" cy="12" r=".9" fill="currentColor" stroke="none"/><circle cx="12.4" cy="12" r=".9" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r=".9" fill="currentColor" stroke="none"/></g></svg>',
    favour: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g class="hbu-ico-anim hbu-ico-favour"><path d="M6.5 4h11a1 1 0 0 1 1 1v15l-6.5-4.2L5.5 20V5a1 1 0 0 1 1-1Z"/></g></svg>',
    article: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g class="hbu-ico-anim hbu-ico-article"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 16.5h6"/></g></svg>',
  };

  const NAV_CSS = `
    .nav-links > .nav-link { display: none !important; }
    #${NAV_ID} {
      display: flex;
      align-items: stretch;
      height: 64px;
      gap: 2px;
      margin-left: 2px;
      font: 14px/1.5 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
    }
    .hbu-nav-link {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      height: 100%;
      padding: 0 12px;
      border-radius: 8px;
      color: var(--nav-link-color, var(--heybox-up-muted, #8c9198));
      text-decoration: none;
      white-space: nowrap;
      transition: color .18s ease;
    }
    .hbu-nav-link::after {
      content: "";
      position: absolute;
      left: 12px;
      right: 12px;
      bottom: 11px;
      height: 2px;
      border-radius: 2px;
      background: var(--heybox-up-accent, #6f8db3);
      transform: scaleX(0);
      transform-origin: 50% 50%;
      transition: transform .2s ease;
    }
    .hbu-nav-link:hover { color: var(--nav-link-active-color, var(--heybox-up-text, #14191e)); }
    .hbu-nav-link:hover::after, .hbu-nav-link.is-active::after { transform: scaleX(1); }
    .hbu-nav-link.is-active {
      color: var(--nav-link-active-color, var(--heybox-up-text, #14191e));
      font-weight: 600;
    }
    .hbu-nav-link:focus-visible {
      outline: 2px solid var(--heybox-up-accent, #6f8db3);
      outline-offset: -2px;
    }
    .hbu-nav-link svg { width: 18px; height: 18px; flex: none; }
    .hbu-nav-link .hbu-ico-anim { transform-box: fill-box; transform-origin: 50% 60%; }
    .hbu-nav-link:hover .hbu-ico-home, .hbu-nav-link:focus-visible .hbu-ico-home, .hbu-nav-link.is-active .hbu-ico-home { animation: hbu-nav-home .55s cubic-bezier(.3, .7, .3, 1); }
    .hbu-nav-link:hover .hbu-ico-community, .hbu-nav-link:focus-visible .hbu-ico-community, .hbu-nav-link.is-active .hbu-ico-community { animation: hbu-nav-community .55s cubic-bezier(.3, .7, .3, 1); }
    .hbu-nav-link:hover .hbu-ico-favour, .hbu-nav-link:focus-visible .hbu-ico-favour, .hbu-nav-link.is-active .hbu-ico-favour { animation: hbu-nav-favour .55s cubic-bezier(.3, .7, .3, 1); }
    .hbu-nav-link:hover .hbu-ico-article, .hbu-nav-link:focus-visible .hbu-ico-article, .hbu-nav-link.is-active .hbu-ico-article { animation: hbu-nav-article .55s cubic-bezier(.3, .7, .3, 1); }
    @keyframes hbu-nav-home {
      0%, 100% { transform: translateY(0); }
      38% { transform: translateY(-1.8px); }
      72% { transform: translateY(.8px); }
    }
    @keyframes hbu-nav-community {
      0%, 100% { transform: translateY(0); }
      40% { transform: translateY(-2px); }
      76% { transform: translateY(.6px); }
    }
    @keyframes hbu-nav-favour {
      0%, 100% { transform: scaleY(1); }
      46% { transform: scaleY(.8) translateY(-1px); }
    }
    @keyframes hbu-nav-article {
      0%, 100% { transform: rotate(0); }
      38% { transform: rotate(-4deg); }
      72% { transform: rotate(1.5deg); }
    }
    :root.${NAV_STATIC_CLASS} .hbu-nav-link svg * { animation: none !important; }
    @media (prefers-reduced-motion: reduce) {
      .hbu-nav-link svg * { animation: none !important; }
      .hbu-nav-link::after { transition: none; }
    }
    @media (max-width: 1180px) {
      .hbu-nav-link { padding: 0 9px; gap: 5px; font-size: 13px; }
      .hbu-nav-link::after { left: 9px; right: 9px; }
    }
    @media (max-width: 940px) {
      .hbu-nav-link span { display: none; }
      .hbu-nav-link { padding: 0 10px; }
    }
  `;

  function applyNavMotionPreference(value) {
    document.documentElement.classList.toggle(NAV_STATIC_CLASS, value === false);
  }

  function ensureNavStyle() {
    ensureStyleElement(NAV_STYLE_ID, NAV_CSS);
  }

  function readNavActiveId() {
    const path = location.pathname;
    if (path === "/app/user/favour/content") return "favour";
    if (path === "/") return "home";
    if (path.startsWith("/creator/")) return "article";
    if (path.startsWith("/app/bbs/")) return "community";
    return "";
  }

  let navActiveHost = null;
  let navActiveId = "";

  function syncNavActive() {
    const host = document.getElementById(NAV_ID);
    if (!host) {
      navActiveHost = null;
      navActiveId = "";
      return;
    }
    const activeId = readNavActiveId();
    if (host === navActiveHost && activeId === navActiveId) return;
    for (const node of host.querySelectorAll(".hbu-nav-link")) {
      const active = node.dataset.nav === activeId;
      node.classList.toggle("is-active", active);
      if (active) node.setAttribute("aria-current", "page");
      else node.removeAttribute("aria-current");
    }
    navActiveHost = host;
    navActiveId = activeId;
  }

  function scrollToCySection() {
    const host = document.getElementById("heybox-up-favour");
    if (!host) return false;
    host.scrollIntoView({ behavior: "smooth", block: "start" });
    return true;
  }

  function readSiteRouter() {
    const root = document.querySelector("#app");
    const app = root ? root.__vue_app__ : null;
    const properties = app ? app.config.globalProperties : null;
    const router = properties ? properties.$router : null;
    return router && typeof router.push === "function" ? router : null;
  }

  // 站点是 Vue 单页应用：脚本合成点击的 <a> 带 isTrusted=false，路由会忽略它并整页刷新。
  // 这里优先调用站点的 router.push，取不到时退回 <a> 点击，最坏情况只是整页加载。
  function navigateToPath(path) {
    const router = readSiteRouter();
    if (router) {
      try {
        const pending = router.push(path);
        if (pending && typeof pending.catch === "function") pending.catch(() => {});
        return;
      } catch (error) {
        // 路由内部状态异常时退回原生跳转。
      }
    }
    const anchor = document.createElement("a");
    anchor.href = path;
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  }

  function handleNavClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest("a.hbu-nav-link");
    if (!link) return;
    // 组合键或中键交给浏览器，保留新标签页打开的能力。
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const id = link.dataset.nav;
    // 收藏页内再点收藏时清掉旧锚点，回到列表顶部。
    if (id === "favour" && location.pathname === "/app/user/favour/content" && location.hash !== "") {
      event.preventDefault();
      history.pushState(null, "", "/app/user/favour/content");
      window.scrollTo({ top: 0, behavior: "smooth" });
      syncNavActive();
      return;
    }
    // 导航栏挂在站点根节点之外，原生 <a> 点击会整页刷新；统一交给 navigateToPath 走站内路由。
    event.preventDefault();
    const href = link.getAttribute("href");
    if (href !== null && href !== "") navigateToPath(href);
  }

  function mountTopNav() {
    if (!document.body) return;
    const current = document.getElementById(NAV_ID);
    if (current?.parentElement?.classList.contains("nav-links") && current.parentElement.firstElementChild === current) {
      syncNavActive();
      return;
    }
    const links = document.querySelector(".nav .nav-links") || document.querySelector(".nav-links");
    if (!links) return;
    ensureNavStyle();
    let host = current;
    if (!host) {
      host = document.createElement("div");
      host.id = NAV_ID;
      host.setAttribute("role", "navigation");
      host.setAttribute("aria-label", "站内导航");
      host.innerHTML = NAV_ITEMS.map((item) =>
        '<a class="hbu-nav-link" data-nav="' + item.id + '" href="' + item.href + '" aria-label="' + item.label + '" title="' + item.label + '">' + NAV_ICONS[item.id] + "<span>" + item.label + "</span></a>"
      ).join("");
      host.addEventListener("click", handleNavClick);
    }
    if (host.parentNode !== links || links.firstElementChild !== host) links.prepend(host);
    syncNavActive();
  }

  function watchTopNav() {
    if (!document.body) return;
    const sync = () => {
      mountTopNav();
      syncNavActive();
    };
    window.addEventListener("hashchange", syncNavActive);
    window.addEventListener("popstate", syncNavActive);
    registerPageSync(sync, 300, null, "chrome");
    sync();
  }

  THEME_MEDIA.addEventListener("change", () => {
    if (currentThemeMode === "system") applyTheme("system", false);
  });
  applyTheme(readThemeMode(), false);
  applyFeedWidth(readFeedWidth());
  applyReaderLineHeight(readReaderLineHeight());
  document.addEventListener(NAV_MOTION_EVENT, (event) => applyNavMotionPreference(event.detail === true));
  applyNavMotionPreference(readNavMotionPreference());

  // ==sign-core:start==
  const SIG_ALPHABET = "AB45STUVWZEFGJ6CH01D237IXYPQRKLMN89";
  const MD5_SHIFTS = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const MD5_TABLE = Array.from({ length: 64 }, (_, index) =>
    Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0
  );

  function toUtf8Bytes(text) {
    const bytes = [];
    for (const char of text) {
      const point = char.codePointAt(0);
      if (point < 0x80) {
        bytes.push(point);
      } else if (point < 0x800) {
        bytes.push(0xc0 | (point >> 6), 0x80 | (point & 0x3f));
      } else if (point < 0x10000) {
        bytes.push(0xe0 | (point >> 12), 0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f));
      } else {
        bytes.push(
          0xf0 | (point >> 18),
          0x80 | ((point >> 12) & 0x3f),
          0x80 | ((point >> 6) & 0x3f),
          0x80 | (point & 0x3f)
        );
      }
    }
    return bytes;
  }

  function rotateLeft(value, shift) {
    return ((value << shift) | (value >>> (32 - shift))) >>> 0;
  }

  function md5Hex(text) {
    const bytes = toUtf8Bytes(text);
    const bitLength = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    const high = Math.floor(bitLength / 0x100000000) >>> 0;
    const low = bitLength >>> 0;
    for (const word of [low, high]) {
      bytes.push(word & 0xff, (word >>> 8) & 0xff, (word >>> 16) & 0xff, (word >>> 24) & 0xff);
    }

    let stateA = 0x67452301;
    let stateB = 0xefcdab89;
    let stateC = 0x98badcfe;
    let stateD = 0x10325476;

    for (let offset = 0; offset < bytes.length; offset += 64) {
      const words = [];
      for (let index = 0; index < 16; index += 1) {
        const base = offset + index * 4;
        words.push(
          (bytes[base] | (bytes[base + 1] << 8) | (bytes[base + 2] << 16) | (bytes[base + 3] << 24)) >>> 0
        );
      }

      let a = stateA;
      let b = stateB;
      let c = stateC;
      let d = stateD;

      for (let index = 0; index < 64; index += 1) {
        let mix;
        let slot;
        if (index < 16) {
          mix = (b & c) | (~b & d);
          slot = index;
        } else if (index < 32) {
          mix = (d & b) | (~d & c);
          slot = (5 * index + 1) % 16;
        } else if (index < 48) {
          mix = b ^ c ^ d;
          slot = (3 * index + 5) % 16;
        } else {
          mix = c ^ (b | ~d);
          slot = (7 * index) % 16;
        }
        const sum = (a + mix + MD5_TABLE[index] + words[slot]) >>> 0;
        a = d;
        d = c;
        c = b;
        b = (b + rotateLeft(sum, MD5_SHIFTS[index])) >>> 0;
      }

      stateA = (stateA + a) >>> 0;
      stateB = (stateB + b) >>> 0;
      stateC = (stateC + c) >>> 0;
      stateD = (stateD + d) >>> 0;
    }

    let hex = "";
    for (const word of [stateA, stateB, stateC, stateD]) {
      for (let index = 0; index < 4; index += 1) {
        hex += ((word >>> (index * 8)) & 0xff).toString(16).padStart(2, "0");
      }
    }
    return hex;
  }

  // endIndex < 0 时取字母表末尾若干位，其余情况用整表。
  function mapByAlphabet(value, endIndex) {
    const source = endIndex < 0 ? SIG_ALPHABET.slice(0, endIndex) : SIG_ALPHABET;
    let mapped = "";
    for (let index = 0; index < value.length; index += 1) {
      mapped += source[value.charCodeAt(index) % source.length];
    }
    return mapped;
  }

  function interleave(parts) {
    const longest = Math.max(...parts.map((part) => part.length));
    let merged = "";
    for (let index = 0; index < longest; index += 1) {
      for (const part of parts) {
        if (index < part.length) merged += part[index];
      }
    }
    return merged;
  }

  function xtime(value) {
    // 不能对左移结果截断：服务端算法保留了高位，截断会算出不同校验位。
    return value & 0x80 ? ((value << 1) ^ 0x1b) & 0xff : value << 1;
  }

  // 就地改写前 4 字节并返回整个数组：服务端求和时把末尾 2 字节也算进去。
  function mixColumns(values) {
    const quartic = (value) => xtime(value) ^ value;
    const r = (value) => quartic(xtime(value));
    const y = (value) => r(quartic(xtime(value)));
    const g = (value) => y(value) ^ r(value) ^ quartic(value);
    const [v0, v1, v2, v3] = values;
    values[0] = g(v0) ^ y(v1) ^ r(v2) ^ quartic(v3);
    values[1] = quartic(v0) ^ g(v1) ^ y(v2) ^ r(v3);
    values[2] = r(v0) ^ quartic(v1) ^ g(v2) ^ y(v3);
    values[3] = y(v0) ^ r(v1) ^ quartic(v2) ^ g(v3);
    return values;
  }

  function createSignature(path, time, nonce) {
    const normalizedPath = "/" + path.split("/").filter(Boolean).join("/") + "/";
    const seed = interleave([
      mapByAlphabet(String(time + 1), -2),
      mapByAlphabet(normalizedPath, 0),
      mapByAlphabet(nonce, 0),
    ]).slice(0, 20);
    const digest = md5Hex(seed);
    const tail = digest.slice(-6).split("").map((char) => char.charCodeAt(0));
    const checksum = String(mixColumns(tail).reduce((total, value) => total + value, 0) % 100).padStart(2, "0");
    return mapByAlphabet(digest.slice(0, 5), -4) + checksum;
  }
  // ==sign-core:end==

  function readCookie(name) {
    const prefix = name + "=";
    for (const part of document.cookie.split(";")) {
      const entry = part.trim();
      if (entry.startsWith(prefix)) {
        try {
          return decodeURIComponent(entry.slice(prefix.length));
        } catch (error) {
          return entry.slice(prefix.length);
        }
      }
    }
    return "";
  }

  function getHeyboxId() {
    return readCookie("heybox_id") || readCookie("user_heybox_id");
  }

  function buildCyApiUrl(userId, offset) {
    const time = Math.floor(Date.now() / 1000);
    const nonce = md5Hex(String(time) + String(Math.random())).toUpperCase();
    const hkey = createSignature(CY_API_PATH, time, nonce);
    const query = new URLSearchParams({
      os_type: "web",
      app: "heybox",
      client_type: "web",
      version: "999.0.4",
      web_version: "2.5",
      x_client_type: "web",
      x_app: "heybox_website",
      heybox_id: userId,
      x_os_type: "Windows",
      device_info: "Chrome",
      hkey: hkey,
      _time: String(time),
      nonce: nonce,
      userid: userId,
      only_cy: "1",
      filter_type: "0",
      enable_new_style_collect: "1",
      limit: String(CY_PAGE_SIZE),
      offset: String(offset),
      no_more: "false",
    });
    return "https://api.xiaoheihe.cn" + CY_API_PATH + "?" + query.toString();
  }

  async function fetchCyPage(userId, offset, signal) {
    const response = await fetchWithTimeout(buildCyApiUrl(userId, offset), {
      credentials: "include",
      headers: { accept: "application/json" },
      signal: signal,
    });
    if (!response.ok) throw new Error("接口返回 HTTP " + response.status);
    const data = await response.json();
    if (data.status !== "ok") throw new Error(data.msg || "接口返回失败状态");
    const list = Array.isArray(data.result) ? data.result : [];
    return { list, noMore: data.no_more === true || list.length === 0 };
  }

  function normalizeCyItem(raw) {
    const link = raw && raw.link;
    if (!link || link.id === undefined || link.id === null) return null;
    const thumbs = Array.isArray(link.thumbs) ? link.thumbs : [];
    return {
      id: String(link.id),
      title: typeof link.title === "string" && link.title.trim() !== "" ? link.title.trim() : "无标题帖子",
      text: typeof raw.text === "string" ? raw.text.trim() : "",
      createAt: Number(raw.create_at) || 0,
      thumb: typeof thumbs[0] === "string" ? thumbs[0] : "",
      kind: raw.comment_type === 1 ? "回复" : "评论",
    };
  }

  async function loadCyFavorites(userId, onProgress, signal) {
    const seen = new Set();
    const items = [];
    let offset = 0;
    for (;;) {
      const page = await fetchCyPage(userId, offset, signal);
      for (const raw of page.list) {
        const item = normalizeCyItem(raw);
        if (item && !seen.has(item.id)) {
          seen.add(item.id);
          items.push(item);
        }
      }
      onProgress(items.length);
      if (page.noMore || items.length >= CY_MAX_ITEMS) break;
      offset += CY_PAGE_SIZE;
      if (offset >= CY_MAX_ITEMS + CY_PAGE_SIZE) break;
    }
    return items.slice(0, CY_MAX_ITEMS);
  }

  function readCache(userId) {
    const parsed = localStore.readJson(CACHE_KEY_PREFIX + userId, null);
    if (!parsed || !Array.isArray(parsed.items)) return null;
    if (Date.now() - Number(parsed.savedAt) > CACHE_TTL_MS) return null;
    return parsed.items;
  }

  function writeCache(userId, items) {
    localStore.writeJson(CACHE_KEY_PREFIX + userId, { savedAt: Date.now(), items: items });
  }

  function formatTime(value) {
    if (!value) return "";
    const milliseconds = value > 1e12 ? value : value * 1000;
    const date = new Date(milliseconds);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("zh-CN", { hour12: false });
  }

  function createCard(item) {
    const card = document.createElement("a");
    card.className = "card";
    card.href = LINK_HREF_PREFIX + item.id;
    card.target = "_blank";
    card.rel = "noopener noreferrer";

    if (item.thumb !== "") {
      const thumb = document.createElement("img");
      thumb.className = "thumb";
      thumb.src = item.thumb;
      thumb.alt = "";
      thumb.loading = "lazy";
      thumb.referrerPolicy = "no-referrer";
      card.append(thumb);
    }

    const body = document.createElement("div");
    body.className = "body";
    const cardTitle = document.createElement("div");
    cardTitle.className = "card-title";
    cardTitle.textContent = item.title;
    const cardText = document.createElement("div");
    cardText.className = item.text !== "" ? "card-text" : "card-text is-empty";
    if (item.text === "") {
      cardText.textContent = "（无文字内容）";
    } else {
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("class", "card-text-icon");
      icon.setAttribute("viewBox", "0 0 16 16");
      icon.setAttribute("aria-hidden", "true");
      const iconPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      iconPath.setAttribute("fill", "currentColor");
      iconPath.setAttribute("d", "M8 3C4.5 3 1.8 5.5 1 8c.8 2.5 3.5 5 7 5s6.2-2.5 7-5c-.8-2.5-3.5-5-7-5Zm0 8.2A3.2 3.2 0 1 1 8 4.8a3.2 3.2 0 0 1 0 6.4Zm0-1.7a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z");
      icon.append(iconPath);
      const content = document.createElement("span");
      content.className = "card-text-body";
      content.textContent = item.text;
      cardText.append(icon, content);
      cardText.title = item.text;
    }
    const foot = document.createElement("div");
    foot.className = "card-foot";
    const kind = document.createElement("span");
    kind.textContent = "插眼" + item.kind;
    const time = document.createElement("span");
    time.textContent = formatTime(item.createAt);
    foot.append(kind, time);
    body.append(cardTitle, cardText, foot);
    card.append(body);
    return card;
  }

  const FAVOUR_HOST_ID = "heybox-up-favour";
  // shortcut: 依赖站点类名 .user-favour__list 及其父级 .list，站点改版时需升级。
  const FAVOUR_LIST_SELECTOR = ".user-favour__list";

  const FAVOUR_CSS = `
    :host { display: block; scroll-margin-top: 80px; font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; }
    .section { padding: 14px 8px 4px; }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
    .heading { font-size: 14px; font-weight: 700; }
    .refresh, .retry {
      font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 8px;
      border: 1px solid rgba(127,127,127,.32); background: transparent; color: inherit; cursor: pointer;
    }
    .refresh:hover:not(:disabled), .retry:hover { border-color: rgba(127,127,127,.55); }
    .refresh:disabled { opacity: .5; cursor: default; }
    .retry { margin: -2px 0 10px; }
    .note { font-size: 12px; opacity: .62; margin-bottom: 10px; }
    .search {
      width: 100%; box-sizing: border-box; margin-bottom: 10px; padding: 7px 10px;
      border-radius: 8px; border: 1px solid rgba(127,127,127,.28);
      background: rgba(127,127,127,.08); color: inherit; font: inherit; font-size: 13px;
    }
    .search:focus { outline: none; border-color: #6f8db3; }
    .card {
      display: flex; gap: 10px; padding: 10px; margin-bottom: 8px;
      border-radius: 12px; text-decoration: none; color: inherit;
      border: 1px solid rgba(127,127,127,.22);
    }
    .card:hover { border-color: rgba(127,127,127,.45); }
    .thumb { width: 52px; height: 52px; border-radius: 9px; object-fit: cover; flex: none; background: rgba(127,127,127,.16); }
    .body { min-width: 0; flex: 1; }
    .card-title {
      font-weight: 600; font-size: 13px; margin-bottom: 3px;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .card-text {
      display: flex; gap: 6px; align-items: flex-start; margin-bottom: 6px;
      font-size: 14px; line-height: 1.5; color: inherit;
    }
    .card-text-icon { width: 15px; height: 15px; flex: none; margin-top: 2px; color: #6f8db3; }
    .card-text-body { min-width: 0; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .card-text.is-empty { font-size: 12px; opacity: .55; }
    .card-foot { margin-top: 5px; font-size: 11px; opacity: .6; display: flex; gap: 10px; }
  `;

  function createFavourSection() {
    const host = document.createElement("div");
    host.id = FAVOUR_HOST_ID;
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = FAVOUR_CSS;
    shadow.append(style);

    const section = document.createElement("section");
    section.className = "section";
    const head = document.createElement("div");
    head.className = "head";
    const heading = document.createElement("div");
    heading.className = "heading";
    heading.textContent = "插眼收藏";
    const refresh = document.createElement("button");
    refresh.type = "button";
    refresh.className = "refresh";
    refresh.textContent = "刷新";
    refresh.setAttribute("aria-label", "刷新插眼收藏");
    head.append(heading, refresh);
    const note = document.createElement("div");
    note.className = "note";
    note.textContent = "正在读取插眼收藏…";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "retry";
    retry.textContent = "重试";
    retry.hidden = true;
    const search = document.createElement("input");
    search.type = "search";
    search.className = "search";
    search.placeholder = "搜索标题或插眼内容";
    search.setAttribute("aria-label", "搜索插眼收藏");
    search.hidden = true;
    const list = document.createElement("div");
    list.className = "list";
    section.append(head, note, retry, search, list);
    shadow.append(section);

    const state = { items: [], loading: false, error: "", notice: "", progress: 0, query: "", signature: "" };
    let loadController = null;

    const readPageIds = () => {
      const ids = new Set();
      for (const node of document.querySelectorAll(FAVOUR_LIST_SELECTOR + ' a[href*="/bbs/link/"]')) {
        const match = /\/bbs\/link\/(\d+)/.exec(node.getAttribute("href") || "");
        if (match) ids.add(match[1]);
      }
      return ids;
    };

    const render = () => {
      const pageIds = readPageIds();
      state.signature = Array.from(pageIds).sort().join(",");
      const visible = state.items.filter((item) => !pageIds.has(item.id));
      const query = state.query.trim();
      const needle = query.toLowerCase();
      const matched = needle === ""
        ? visible
        : visible.filter((item) => item.title.toLowerCase().includes(needle) || item.text.toLowerCase().includes(needle));
      list.replaceChildren();
      refresh.disabled = state.loading;
      refresh.textContent = state.loading ? "读取中…" : "刷新";
      retry.hidden = state.error === "";
      search.hidden = state.items.length === 0;
      if (state.error !== "") {
        note.textContent = "读取失败：" + state.error + (state.items.length > 0 ? "（显示上次结果）" : "");
      } else if (state.notice !== "") {
        note.textContent = state.notice;
      } else if (state.loading) {
        note.textContent = "正在读取插眼收藏…" + (state.progress > 0 ? " 已获取 " + state.progress + " 条" : "");
      } else if (state.items.length === 0) {
        note.textContent = "没有插眼收藏。";
      } else if (visible.length === 0) {
        note.textContent = "插眼条目已全部出现在列表中。";
      } else if (matched.length === 0) {
        note.textContent = "没有匹配“" + query + "”的插眼条目。";
      } else {
        note.textContent = "共 " + visible.length + " 条插眼收藏" + (query !== "" ? "，匹配 " + matched.length + " 条" : "") + "，网页收藏列表默认不显示。";
      }
      if (matched.length === 0) return;
      const fragment = document.createDocumentFragment();
      for (const item of matched) fragment.append(createCard(item));
      list.append(fragment);
    };

    const place = () => {
      const listNode = document.querySelector(FAVOUR_LIST_SELECTOR);
      const parent = listNode ? listNode.parentElement : null;
      if (!listNode || !parent) return;
      if (host.parentNode !== parent || host.previousElementSibling !== listNode) {
        parent.insertBefore(host, listNode.nextSibling);
      }
      if (Array.from(readPageIds()).sort().join(",") !== state.signature) render();
    };

    const load = async (force) => {
      if (state.loading) return;
      const userId = getHeyboxId();
      if (userId === "") {
        state.notice = "未登录小黑盒，无法读取插眼收藏。";
        render();
        return;
      }
      state.loading = true;
      state.error = "";
      state.notice = "";
      state.progress = 0;
      render();
      loadController?.abort();
      loadController = new AbortController();
      try {
        const cached = force ? null : readCache(userId);
        if (cached) {
          state.items = cached;
          return;
        }
        state.items = await loadCyFavorites(userId, (count) => {
          state.progress = count;
          note.textContent = "正在读取插眼收藏… 已获取 " + count + " 条";
        }, loadController.signal);
        writeCache(userId, state.items);
      } catch (error) {
        if (isAbortError(error)) return;
        state.error = error instanceof Error ? error.message : String(error);
      } finally {
        state.loading = false;
        loadController = null;
        render();
      }
    };

    refresh.addEventListener("click", () => void load(true));
    retry.addEventListener("click", () => void load(true));
    search.addEventListener("input", () => {
      state.query = search.value;
      render();
    });

    place();
    void load(false);
    return {
      host,
      place,
      dispose: () => {
        loadController?.abort();
        loadController = null;
        state.loading = false;
      },
    };
  }

  function watchFavourPage() {
    if (!document.body) return;
    let section = null;
    let cyJumpDone = false;

    const sync = () => {
      if (location.pathname !== FAVOUR_PATH || getHeyboxId() === "") {
        cyJumpDone = false;
        if (section) {
          section.dispose();
          section.host.remove();
          section = null;
        }
        return;
      }
      if (!section) section = createFavourSection();
      section.place();
      if (!cyJumpDone && location.hash === CY_HASH) {
        requestAnimationFrame(() => {
          if (!scrollToCySection()) return;
          cyJumpDone = true;
        });
      }
    };

    registerPageSync(sync, 300, [PAGE_ROUTE.FAVOUR], "favour");
    sync();
  }

  const RAIL_ID = "heybox-up-comment-rail";
  const COMMENT_TREE_API_PATH = "/bbs/app/link/tree";
  const COMMENT_CREATE_API_PATH = "/bbs/app/comment/create";
  const COMMENT_CREATE_RND_VERSION = "15";
  const COMMENT_CREATE_RND_SECRET = "Z7mFG4tQp9Ws2LxB8H";
  const RAIL_PAGE_SIZE = 20;
  // 预览只读：回复、点赞与楼中楼展开仍走帖子页的原生评论区。
  const RAIL_TRIGGER_SELECTOR = ".bbs-new-style-bottom__comment, .content-list__comment";

  const RAIL_ICONS = {
    comment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-3-.4L4 21l1.4-4.4A8.3 8.3 0 0 1 3.6 11.5 8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4Z"/></svg>',
    external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-8.5 8.5"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    collapse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  };

  const RAIL_CSS = `
    [hidden] { display: none !important; }
    :host {
      --rail-bg: var(--heybox-up-surface, #fff);
      --rail-text: var(--heybox-up-text, #14191e);
      --rail-text-2: var(--heybox-up-text-2, #3c4249);
      --rail-muted: var(--heybox-up-muted, #6b7280);
      --rail-subtle: var(--heybox-up-subtle, rgba(20, 25, 30, .06));
      --rail-line: var(--heybox-up-border, rgba(20, 25, 30, .1));
      --rail-accent: var(--heybox-up-accent, #6f8db3);
      --rail-radius: var(--heybox-up-radius-card, 14px);
      position: fixed;
      top: 80px;
      right: 20px;
      width: var(--heybox-up-rail-w, 340px);
      display: block;
      /* 低于站点导航（5000）与全屏 loading（2002），高于正文与编辑器控件。 */
      z-index: 1500;
      font: 13px/1.6 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
      color: var(--rail-text);
    }
    :host([data-state="hidden"]) { display: none; }
    @media (max-width: 1199px) { :host { display: none; } }
    .panel {
      display: flex;
      flex-direction: column;
      max-height: calc(100vh - 168px);
      background: var(--rail-bg);
      border: 1px solid var(--rail-line);
      border-radius: var(--rail-radius);
      box-shadow: var(--heybox-up-shadow-2, 0 18px 44px rgba(8, 12, 16, .24));
      overflow: hidden;
    }
    :host([data-state="collapsed"]) { top: 50%; right: 0; width: auto; transform: translateY(-50%); }
    :host([data-state="collapsed"]) .panel { border-radius: var(--rail-radius) 0 0 var(--rail-radius); }
    :host([data-state="collapsed"]) .dock { display: none; }
    :host([data-state="open"]) .tab { display: none; }
    .tab {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin: 0;
      padding: 12px 7px;
      border: 0;
      background: transparent;
      color: var(--rail-muted);
      font: inherit;
      writing-mode: vertical-rl;
      cursor: pointer;
    }
    .tab:hover { background: var(--rail-subtle); color: var(--rail-text); }
    .tab:focus-visible { outline: 2px solid var(--rail-accent); outline-offset: -2px; }
    .tab svg { width: 15px; height: 15px; }
    .dock { display: flex; flex-direction: column; min-height: 0; }
    .head { display: flex; gap: 8px; padding: 12px 14px 10px; border-bottom: 1px solid var(--rail-line); }
    .head-text { flex: 1 1 auto; min-width: 0; }
    .kicker { font-size: 10px; letter-spacing: .12em; color: var(--rail-muted); }
    .title {
      margin-top: 3px;
      font-size: 13px;
      font-weight: 600;
      line-height: 1.45;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
    }
    .tools { display: flex; flex: none; gap: 2px; }
    .icon {
      display: grid;
      place-items: center;
      width: 26px;
      height: 26px;
      border: 0;
      border-radius: 7px;
      background: transparent;
      color: var(--rail-muted);
      text-decoration: none;
      cursor: pointer;
    }
    .icon:hover { background: var(--rail-subtle); color: var(--rail-text); }
    .icon:focus-visible { outline: 2px solid var(--rail-accent); outline-offset: 1px; }
    .icon svg { width: 16px; height: 16px; }
    .icon.cy {
      width: auto;
      min-width: 26px;
      padding: 0 5px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: .04em;
    }
    .icon.cy[aria-pressed="true"] { background: var(--rail-subtle); color: var(--rail-accent); }
    .meta { padding: 8px 14px 0; font-size: 11px; color: var(--rail-muted); }
    .list { margin: 0; padding: 8px 0 0; list-style: none; overflow-y: auto; overscroll-behavior: contain; min-height: 0; }
    .item { display: flex; gap: 10px; padding: 11px 14px; border-top: 1px solid var(--rail-subtle); }
    .item:first-child { border-top: 0; }
    .avatar { width: 26px; height: 26px; border-radius: 50%; object-fit: cover; flex: none; background: var(--rail-subtle); }
    .body { flex: 1 1 auto; min-width: 0; }
    .who { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; }
    .name { font-size: 12px; font-weight: 600; color: var(--rail-text); }
    .time, .likes, .replies { font-size: 11px; color: var(--rail-muted); }
    .text { margin: 3px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--rail-text); }
    .text .emoji, .quote .emoji {
      display: inline-block;
      width: 17px;
      height: 17px;
      margin: 0 1px;
      vertical-align: -3px;
      background-repeat: no-repeat;
      background-size: 102px 306px;
    }
    .text .pic, .quote .pic {
      max-width: 100%;
      max-height: 160px;
      border-radius: 6px;
      object-fit: contain;
      vertical-align: top;
    }
    .foot { display: flex; gap: 10px; margin-top: 4px; }
    .sub { display: grid; gap: 4px; margin-top: 7px; padding-left: 9px; border-left: 2px solid var(--rail-subtle); }
    .quote {
      font-size: 12px;
      color: var(--rail-text-2);
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
    }
    .quote .quote-name { color: var(--rail-muted); }
    .status { padding: 26px 18px; text-align: center; color: var(--rail-muted); }
    .status.retry { cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
    .status a { color: var(--rail-accent); text-decoration: underline; text-underline-offset: 3px; }
    .foot-bar { display: flex; gap: 8px; padding: 11px 12px; border-top: 1px solid var(--rail-line); }
    .action {
      flex: 1 1 auto;
      height: 30px;
      border: 1px solid var(--rail-line);
      border-radius: 8px;
      background: transparent;
      color: var(--rail-text);
      font: inherit;
      cursor: pointer;
    }
    .action:hover { background: var(--rail-subtle); }
    .action:focus-visible { outline: 2px solid var(--rail-accent); outline-offset: 1px; }
    .action.primary { border-color: transparent; background: var(--rail-accent); color: var(--heybox-up-on-accent, #fff); }
  `;


  function createApiParams(path) {
    const time = Math.floor(Date.now() / 1000);
    const nonce = md5Hex(String(time) + String(Math.random())).toUpperCase();
    return {
      os_type: "web",
      app: "heybox",
      client_type: "web",
      version: "999.0.4",
      web_version: "2.5",
      x_client_type: "web",
      x_app: "heybox_website",
      x_os_type: "Windows",
      device_info: "Chrome",
      hkey: createSignature(path, time, nonce),
      _time: String(time),
      nonce: nonce,
    };
  }

  // ==comment-rnd:start==
  async function createCommentRnd(nonce, timestamp) {
    if (globalThis.crypto === undefined || globalThis.crypto.subtle === undefined) {
      throw new Error("当前浏览器不支持 CY 发布签名");
    }
    const encoder = new TextEncoder();
    const key = await globalThis.crypto.subtle.importKey(
      "raw",
      encoder.encode(COMMENT_CREATE_RND_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const message = COMMENT_CREATE_RND_SECRET + nonce + timestamp + ":" + nonce;
    const signature = await globalThis.crypto.subtle.sign("HMAC", key, encoder.encode(message));
    const digest = Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
    return COMMENT_CREATE_RND_VERSION + ":" + digest;
  }
  // ==comment-rnd:end==

  function buildLinkCommentUrl(linkId, page, signed) {
    const base = signed === false ? { heybox_id: getHeyboxId(), os_type: "web", app: "heybox", client_type: "web", version: "999.0.4", web_version: "2.5", x_client_type: "web", x_app: "heybox_website", x_os_type: "Windows", device_info: "Chrome" } : createApiParams(COMMENT_TREE_API_PATH);
    const query = new URLSearchParams({
      ...base,
      heybox_id: getHeyboxId(),
      link_id: String(linkId),
      is_first: page === 1 ? "1" : "0",
      page: String(page),
      index: "1",
      limit: String(RAIL_PAGE_SIZE),
      owner_only: "0",
    });
    // h_src 是站点网页端自带的空参数，缺省时接口更容易触发风控。
    return "https://api.xiaoheihe.cn" + COMMENT_TREE_API_PATH + "?" + query.toString().replace("&link_id=", "&h_src&link_id=");
  }

  function normalizeRailText(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 400);
  }

  // 站点表情是 CSS sprite（<span data-emoji>），不能当普通标签剥掉，
  // 否则纯表情评论在预览里会变成空白。这里把评论正文拆成文本、表情、图片三类片段，
  // 渲染时只创建节点，不注入原始 HTML。
  const RAIL_BODY_MAX = 4000;
  const RAIL_EMOJI_SPRITE = "https://static.max-c.com/heybox_web/emoji/cube/cube_emoji_v33.png";
  const RAIL_EMOJI_CELL = 17;
  const RAIL_EMOJI_TOKEN = /\[cube_([^\]]{1,64})\]/g;

  // 评论接口返回的是 [cube_表情名] 文本，而不是 DOM 里的编号 class。
  // 以下顺序与站点 cube 表情清单及 6 列精灵图一致，用来把名称还原成编号。
  const RAIL_EMOJI_NAMES = [
    "哭泣", "酷", "doge", "喜欢", "黑人问号", "惊讶",
    "开心", "捂脸哭", "晕", "感动", "委屈", "并不简单",
    "乖", "笑cry", "怒", "滑稽", "沧桑", "凄凉",
    "赞", "学习", "叹气", "加油", "摊手", "喷水",
    "打脸", "H币", "生气", "困", "闭嘴", "吐",
    "咕咕", "微笑", "哇", "汗", "吓", "睡觉",
    "2023", "圣诞树", "庆祝", "庆祝-圣诞", "你懂我", "我懂你",
    "阳", "比心", "wota", "鹅", "握草", "这是什么鸟",
    "上学-乐", "上学-丧", "打咩", "超人", "僵尸", "小鸡",
    "窝囊", "摸摸头", "电牛", "摘墨镜", "悟空", "2024",
    "良民", "嬉水女王", "2025", "浪人砍一刀", "吃鸡啦", "鸡毙你",
    "机智", "石化", "吹口哨", "思考", "太酷啦", "蛋糕",
    "毁灭战士", "P的谎言", "剑星伊芙", "欧润吉", "剑星渡鸦", "猛男微笑",
    "时间旅者", "来财", "我方了", "喜+1", "2026", "害羞",
    "吃瓜", "菜doge", "柠檬", "比耶", "爱心", "玫瑰",
    "+1", "-1", "点赞", "盒十", "耶", "鼓掌",
    "碰拳", "马年吉祥", "红包", "炒菜", "山姆无奈", "洛的点赞",
    "灵光一闪", "露莉亚", "傲娇助手", "认真记录", "鳄鱼", "星乐蒂",
  ];
  const RAIL_EMOJI_NAME_IDS = new Map(
    RAIL_EMOJI_NAMES.map((name, index) => [name, String((Math.floor(index / 6) + 1) * 10 + (index % 6) + 1)])
  );

  // 站点精灵图是 6 列 × 18 行，合法编号的个位是 1–6、十位段是 1–18；
  // 编号最大到 186，只认 11–66 会漏掉 7x–18x 这一大批表情。
  function isRailEmojiId(value) {
    const id = Number(value);
    if (!Number.isInteger(id) || id < 11 || id > 186) return false;
    const unit = id % 10;
    const row = Math.floor(id / 10);
    return unit >= 1 && unit <= 6 && row >= 1 && row <= 18;
  }

  function resolveRailEmojiId(value) {
    const raw = String(value === undefined || value === null ? "" : value).trim();
    const candidate = raw.startsWith("cube_") ? raw.slice(5) : raw;
    if (isRailEmojiId(candidate)) return String(Number(candidate));
    return RAIL_EMOJI_NAME_IDS.get(candidate) || "";
  }

  function parseRailBody(value) {
    const source = String(value === undefined || value === null ? "" : value).slice(0, RAIL_BODY_MAX);
    if (source === "") return [];
    const template = document.createElement("template");
    template.innerHTML = source;
    const segments = [];
    const pushText = (value) => {
      const parts = String(value).split(RAIL_EMOJI_TOKEN);
      for (let index = 0; index < parts.length; index += 1) {
        if (index % 2 === 1) {
          const emojiId = resolveRailEmojiId(parts[index]);
          if (emojiId !== "") segments.push({ type: "emoji", id: emojiId });
          else segments.push({ type: "text", text: "[cube_" + parts[index] + "]" });
          continue;
        }
        const collapsed = parts[index].replace(/\s+/g, " ");
        if (collapsed.trim() === "") continue;
        segments.push({ type: "text", text: collapsed });
      }
    };
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          pushText(child.nodeValue);
          continue;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        const element = child;
        const emoji = element.getAttribute("data-emoji");
        if (emoji !== null && emoji !== "") {
          const match = /(?:^|\s)hb-emoji-cube_([^\s]+)/.exec(String(element.className || ""));
          const candidates = [match === null ? "" : match[1], emoji];
          const id = candidates.map(resolveRailEmojiId).find((item) => item !== "") || "";
          if (id !== "") segments.push({ type: "emoji", id: id });
          else segments.push({ type: "text", text: "[" + emoji + "]" });
          continue;
        }
        if (element.tagName === "IMG") {
          const src = element.getAttribute("src");
          if (src !== null && /^https?:\/\//i.test(src)) segments.push({ type: "image", src });
          continue;
        }
        if (element.tagName === "BR") {
          pushText(" ");
          continue;
        }
        walk(element);
      }
    };
    walk(template.content);
    if (segments.length > 0) {
      const first = segments[0];
      if (first.type === "text") first.text = first.text.replace(/^\s+/, "");
      const last = segments[segments.length - 1];
      if (last.type === "text") last.text = last.text.replace(/\s+$/, "");
    }
    return segments.filter((segment) => segment.type !== "text" || segment.text !== "").slice(0, 80);
  }

  function railBodyText(segments) {
    return segments.filter((segment) => segment.type === "text").map((segment) => segment.text).join(" ").trim();
  }

  function normalizeRailComment(comment) {
    const raw = comment && typeof comment === "object" ? comment : {};
    const user = raw.user && typeof raw.user === "object" ? raw.user : {};
    const avatar = user.avatar || user.avartar || "";
    const body = parseRailBody(raw.text);
    return {
      id: String(raw.comment_id || raw.commentid || raw.id || ""),
      name: String(user.username || user.nickname || "匿名用户").trim(),
      avatar: typeof avatar === "string" ? avatar : "",
      text: railBodyText(body),
      body: body,
      createAt: Number(raw.create_at) || 0,
      likes: Number(raw.support_num || raw.support_count) || 0,
      replies: Number(raw.reply_count || raw.sub_comment_num) || 0,
      isCy: isCyComment(raw),
    };
  }

  function normalizeRailGroup(group) {
    const list = group && Array.isArray(group.comment) ? group.comment : [];
    const root = list[0];
    if (!root) return null;
    const item = normalizeRailComment(root);
    if (item.id === "" && item.body.length === 0 && item.name === "匿名用户") return null;
    item.quotes = list.slice(1, 3).map(normalizeRailComment).filter((quote) => quote.body.length > 0);
    return item;
  }

  let lastRailRequestAt = 0;
  const RAIL_PAGE_CACHE_TTL_MS = 2 * 60 * 1000;
  const RAIL_PAGE_CACHE_MAX = 24;
  const railPageCache = new Map();

  function readRailPageCache(linkId, page) {
    const key = linkId + ":" + page;
    const cached = railPageCache.get(key);
    if (cached === undefined) return null;
    if (Date.now() - cached.savedAt > RAIL_PAGE_CACHE_TTL_MS) {
      railPageCache.delete(key);
      return null;
    }
    railPageCache.delete(key);
    railPageCache.set(key, cached);
    return {
      items: cached.data.items,
      total: cached.data.total,
      title: cached.data.title,
      link: { ...cached.data.link },
      groups: cached.data.groups,
    };
  }

  function writeRailPageCache(linkId, page, data) {
    const key = linkId + ":" + page;
    railPageCache.delete(key);
    railPageCache.set(key, { savedAt: Date.now(), data: data });
    while (railPageCache.size > RAIL_PAGE_CACHE_MAX) {
      const oldest = railPageCache.keys().next().value;
      if (oldest === undefined) break;
      railPageCache.delete(oldest);
    }
  }

  function clearRailPageCache(linkId) {
    const prefix = linkId + ":";
    for (const key of railPageCache.keys()) {
      if (key.startsWith(prefix)) railPageCache.delete(key);
    }
  }

  async function fetchRailPage(linkId, page, options = {}) {
    const cached = readRailPageCache(linkId, page);
    if (cached !== null) return cached;
    const signal = options.signal;
    const wait = Math.max(0, 700 - (Date.now() - lastRailRequestAt));
    await waitForDelay(wait, signal);
    lastRailRequestAt = Date.now();
    const request = async (signed) => {
      const response = await fetchWithTimeout(buildLinkCommentUrl(linkId, page, signed), {
        credentials: "include",
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: signal,
      });
      if (!response.ok) throw new Error("接口返回 HTTP " + response.status);
      const payload = await response.json();
      if (payload.status !== "ok") throw new Error(payload.msg || "接口返回 " + payload.status);
      return payload;
    };
    let data;
    try {
      data = await request(true);
    } catch (primaryError) {
      if (isAbortError(primaryError)) throw primaryError;
      try {
        data = await request(false);
      } catch (fallbackError) {
        if (isAbortError(fallbackError)) throw fallbackError;
        throw new Error((primaryError && primaryError.message ? primaryError.message : "签名请求失败") + " / 匿名请求：" + (fallbackError && fallbackError.message ? fallbackError.message : "失败"));
      }
    }
    const result = data.result && typeof data.result === "object" ? data.result : {};
    const groups = Array.isArray(result.comments) ? result.comments : Array.isArray(result.comment) ? result.comment : [];
    const link = result.link && typeof result.link === "object" ? result.link : {};
    const normalized = {
      items: groups.map(normalizeRailGroup).filter((item) => item !== null),
      total: Number(link.comment_num || result.total_floor_num) || 0,
      title: typeof link.title === "string" ? link.title.trim() : "",
      link: {
        isAward: Number(link.is_award_link) === 1,
        isFavour: Number(link.is_favour) === 1,
        awardCount: Number(link.link_award_num) || 0,
        favourCount: Number(link.favour_count) || 0,
        commentCount: Number(link.comment_num || result.total_floor_num) || 0,
      },
      groups,
    };
    writeRailPageCache(linkId, page, normalized);
    return { ...normalized, link: { ...normalized.link } };
  }

  function formatRailAge(value) {
    const seconds = Math.floor(Date.now() / 1000) - Number(value || 0);
    if (!Number.isFinite(seconds) || seconds < 60) return "刚刚";
    if (seconds < 3600) return Math.floor(seconds / 60) + " 分钟前";
    if (seconds < 86400) return Math.floor(seconds / 3600) + " 小时前";
    if (seconds < 86400 * 30) return Math.floor(seconds / 86400) + " 天前";
    return formatTime(value).slice(0, 10);
  }

  function createCommentRail() {
    const host = document.createElement("div");
    host.id = RAIL_ID;
    host.dataset.state = "hidden";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = RAIL_CSS;

    const panel = document.createElement("div");
    panel.className = "panel";
    let loadController = null;

    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "tab";
    tab.setAttribute("aria-label", "展开评论预览");
    tab.setAttribute("aria-expanded", "false");
    tab.innerHTML = RAIL_ICONS.comment + "<span>评论预览</span>";

    const dock = document.createElement("div");
    dock.className = "dock";

    const head = document.createElement("div");
    head.className = "head";
    const headText = document.createElement("div");
    headText.className = "head-text";
    const kicker = document.createElement("div");
    kicker.className = "kicker";
    kicker.textContent = "评论预览";
    const titleNode = document.createElement("div");
    titleNode.className = "title";
    titleNode.textContent = "评论";
    headText.append(kicker, titleNode);
    const tools = document.createElement("div");
    tools.className = "tools";
    const cyButton = document.createElement("button");
    cyButton.type = "button";
    cyButton.className = "icon cy";
    cyButton.textContent = "CY";
    const openLinkNode = document.createElement("a");
    openLinkNode.className = "icon";
    openLinkNode.target = "_blank";
    openLinkNode.rel = "noopener noreferrer";
    openLinkNode.title = "打开帖子";
    openLinkNode.setAttribute("aria-label", "打开帖子");
    openLinkNode.innerHTML = RAIL_ICONS.external;
    const collapseButton = document.createElement("button");
    collapseButton.type = "button";
    collapseButton.className = "icon";
    collapseButton.title = "收起";
    collapseButton.setAttribute("aria-label", "收起评论预览");
    collapseButton.innerHTML = RAIL_ICONS.collapse;
    tools.append(cyButton, openLinkNode, collapseButton);
    head.append(headText, tools);

    const meta = document.createElement("div");
    meta.className = "meta";
    const list = document.createElement("ol");
    list.className = "list";
    const status = document.createElement("div");
    status.className = "status";
    const footBar = document.createElement("div");
    footBar.className = "foot-bar";
    const moreButton = document.createElement("button");
    moreButton.type = "button";
    moreButton.className = "action";
    moreButton.textContent = "加载更多";
    footBar.append(moreButton);

    dock.append(head, meta, list, status, footBar);
    panel.append(tab, dock);
    shadow.append(style, panel);

    const state = {
      mode: "hidden",
      linkId: "",
      title: "",
      total: 0,
      page: 0,
      items: [],
      loading: false,
      error: "",
      hasMore: false,
      seq: 0,
    };

    let hideCy = readHideCyPreference();

    const updateCyButton = () => {
      cyButton.setAttribute("aria-pressed", String(hideCy));
      cyButton.title = hideCy ? "显示 CY 评论" : "屏蔽 CY 评论";
      cyButton.setAttribute("aria-label", cyButton.title);
    };

    cyButton.addEventListener("click", () => {
      hideCy = !hideCy;
      setHideCyPreference(hideCy);
      updateCyButton();
      render();
    });

    document.addEventListener(HIDE_CY_EVENT, () => {
      const next = readHideCyPreference();
      if (next === hideCy) return;
      hideCy = next;
      updateCyButton();
      render();
    });

    const applyMode = () => {
      host.dataset.state = state.mode;
      tab.setAttribute("aria-expanded", String(state.mode === "open"));
      if (document.body) document.body.classList.toggle("heybox-up-rail-open", state.mode === "open");
    };

    const createEmoji = (id) => {
      const node = document.createElement("span");
      node.className = "emoji";
      node.setAttribute("role", "img");
      node.setAttribute("aria-label", "表情");
      // 编号的十位是精灵图行、个位是列；这里用负坐标裁切，
      // 不能照抄站点依赖 background-repeat 回卷的正坐标写法。
      const column = (Number(id) % 10) - 1;
      const row = Math.floor(Number(id) / 10) - 1;
      node.style.backgroundImage = 'url("' + RAIL_EMOJI_SPRITE + '")';
      node.style.backgroundPosition = "-" + column * RAIL_EMOJI_CELL + "px -" + row * RAIL_EMOJI_CELL + "px";
      return node;
    };

    const createImage = (src) => {
      const node = document.createElement("img");
      node.className = "pic";
      node.alt = "";
      node.loading = "lazy";
      node.referrerPolicy = "no-referrer";
      node.src = src;
      return node;
    };

    const fillBody = (node, segments) => {
      if (segments.length === 0) {
        node.textContent = "（图片或表情评论）";
        return;
      }
      for (const segment of segments) {
        if (segment.type === "text") node.append(document.createTextNode(segment.text));
        else if (segment.type === "emoji") node.append(createEmoji(segment.id));
        else node.append(createImage(segment.src));
      }
    };

    const createQuote = (quote) => {
      const node = document.createElement("div");
      node.className = "quote";
      const name = document.createElement("span");
      name.className = "quote-name";
      name.textContent = quote.name + "：";
      node.append(name);
      fillBody(node, quote.body);
      return node;
    };

    const createItem = (comment) => {
      const item = document.createElement("li");
      item.className = "item";
      item.setAttribute("role", "listitem");
      const avatar = document.createElement("img");
      avatar.className = "avatar";
      avatar.alt = "";
      avatar.loading = "lazy";
      avatar.referrerPolicy = "no-referrer";
      if (comment.avatar !== "") avatar.src = comment.avatar;
      const body = document.createElement("div");
      body.className = "body";
      const who = document.createElement("div");
      who.className = "who";
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = comment.name;
      who.append(name);
      if (comment.createAt > 0) {
        const time = document.createElement("span");
        time.className = "time";
        time.textContent = formatRailAge(comment.createAt);
        who.append(time);
      }
      const text = document.createElement("p");
      text.className = "text";
      fillBody(text, comment.body);
      const foot = document.createElement("div");
      foot.className = "foot";
      if (comment.likes > 0) {
        const likes = document.createElement("span");
        likes.className = "likes";
        likes.textContent = "赞 " + comment.likes;
        foot.append(likes);
      }
      if (comment.replies > 0) {
        const replies = document.createElement("span");
        replies.className = "replies";
        replies.textContent = comment.replies + " 条回复";
        foot.append(replies);
      }
      body.append(who, text);
      if (foot.childElementCount > 0) body.append(foot);
      const quotes = hideCy ? comment.quotes.filter((quote) => quote.isCy !== true) : comment.quotes;
      if (quotes.length > 0) {
        const sub = document.createElement("div");
        sub.className = "sub";
        sub.append(...quotes.map(createQuote));
        body.append(sub);
      }
      item.append(avatar, body);
      return item;
    };

    const render = () => {
      const visible = hideCy ? state.items.filter((item) => item.isCy !== true) : state.items;
      const hiddenCy = state.items.length - visible.length;
      titleNode.textContent = state.title !== "" ? state.title : "评论";
      openLinkNode.href = state.linkId !== "" ? LINK_HREF_PREFIX + state.linkId : "#";
      openLinkNode.hidden = state.linkId === "";
      const loadedText = visible.length > 0 ? " · 已加载 " + visible.length + " 条" : "";
      const cyText = hiddenCy > 0 ? " · 已屏蔽 " + hiddenCy + " 条 CY" : "";
      if (state.error !== "") {
        meta.textContent = "";
      } else if (state.total > 0) {
        meta.textContent = "共 " + state.total + " 条评论" + loadedText + cyText;
      } else {
        meta.textContent = (visible.length > 0 ? "已加载 " + visible.length + " 条" : "") + cyText;
      }
      list.replaceChildren(...visible.map(createItem));
      list.hidden = visible.length === 0;
      if (state.error !== "") {
        status.textContent = "";
        const label = document.createElement("span");
        label.textContent = state.error + " ";
        const link = document.createElement("a");
        link.href = LINK_HREF_PREFIX + state.linkId;
        link.textContent = "打开帖子";
        link.addEventListener("click", (event) => event.stopPropagation());
        status.append(label, link);
        status.classList.add("retry");
        status.hidden = false;
      } else if (state.loading && state.items.length === 0) {
        status.classList.remove("retry");
        status.textContent = "正在加载评论…";
        status.hidden = false;
      } else if (state.linkId === "") {
        status.classList.remove("retry");
        status.textContent = "这里会直接显示信息流首条帖子的评论；点其他帖子的评论数字可切换。";
        status.hidden = false;
      } else if (visible.length === 0) {
        status.classList.remove("retry");
        status.textContent = hiddenCy > 0 ? "已屏蔽全部 " + hiddenCy + " 条 CY 评论" : "这条帖子还没有评论";
        status.hidden = false;
      } else {
        status.classList.remove("retry");
        status.hidden = true;
      }
      moreButton.hidden = state.linkId === "" || !state.hasMore;
      moreButton.textContent = state.loading ? "加载中…" : "加载更多";
      footBar.hidden = moreButton.hidden;
    };

    const load = async (page) => {
      const seq = ++state.seq;
      state.loading = true;
      state.error = "";
      render();
      loadController?.abort();
      loadController = new AbortController();
      try {
        const data = await fetchRailPage(state.linkId, page, { signal: loadController.signal });
        if (seq !== state.seq) return;
        state.items = page === 1 ? data.items : state.items.concat(data.items);
        state.page = page;
        state.hasMore = data.items.length > 0;
        if (data.total > 0) state.total = data.total;
        if (data.title !== "" && state.title === "") state.title = data.title;
      } catch (error) {
        if (isAbortError(error)) return;
        if (seq !== state.seq) return;
        const message = error && error.message ? error.message : "未知错误";
        state.error = /show_captcha|captcha/i.test(message)
          ? "评论需要验证，请稍后重试，或打开帖子查看。"
          : "评论加载失败：" + message + "，可打开帖子查看。";
        state.hasMore = false;
      } finally {
        if (seq === state.seq) {
          state.loading = false;
          loadController = null;
          render();
        }
      }
    };

    const open = (linkId) => {
      const next = String(linkId === undefined || linkId === null ? "" : linkId);
      if (next === "") return;
      state.mode = "open";
      applyMode();
      if (next === state.linkId) return;
      loadController?.abort();
      loadController = null;
      state.seq += 1;
      state.loading = false;
      state.linkId = next;
      state.title = "";
      state.total = 0;
      state.page = 0;
      state.items = [];
      state.hasMore = false;
      state.error = "";
      render();
      void load(1);
    };

    const collapse = () => {
      state.mode = state.linkId === "" ? "hidden" : "collapsed";
      applyMode();
    };

    const setActive = (active) => {
      if (!active) {
        if (state.mode === "hidden" && !state.loading && loadController === null) return;
        loadController?.abort();
        loadController = null;
        state.seq += 1;
        state.loading = false;
        state.mode = "hidden";
        applyMode();
        return;
      }
      if (state.mode !== "hidden") return;
      state.mode = "collapsed";
      applyMode();
    };

    tab.addEventListener("click", () => {
      state.mode = "open";
      applyMode();
      if (state.linkId === "") {
        const anchor = document.querySelector("#page-bbs-community .bbs-home__content-list a[href*='/app/bbs/link/']");
        const match = anchor ? /link\/(\d+)/.exec(anchor.getAttribute("href") || "") : null;
        if (match) {
          open(match[1]);
          return;
        }
      }
      render();
    });
    collapseButton.addEventListener("click", collapse);
    status.addEventListener("click", () => {
      if (state.error === "" || state.loading) return;
      void load(1);
    });
    moreButton.addEventListener("click", () => {
      if (state.loading || state.linkId === "") return;
      void load(state.page + 1);
    });

    updateCyButton();
    applyMode();
    render();

    return {
      host,
      open,
      collapse,
      setActive,
      isOpen: () => state.mode === "open",
      getLinkId: () => state.linkId,
    };
  }

  function watchCommentRail() {
    if (!document.body) return;
    const rail = createCommentRail();
    document.body.append(rail.host);

    const isFeedPage = () => !location.pathname.startsWith(LINK_HREF_PREFIX)
      && document.querySelector("#page-bbs-community .bbs-home__content-list") !== null;

    const readLinkId = (href) => {
      const match = /link\/(\d+)/.exec(href || "");
      return match ? match[1] : "";
    };

    const readFirstFeedLinkId = () => {
      const anchor = document.querySelector("#page-bbs-community .bbs-home__content-list a[href*='/app/bbs/link/']");
      if (!anchor) return "";
      return readLinkId(anchor.getAttribute("href"));
    };

    // 评论按钮在视频/图集等卡片模板里不一定放在帖子锚点内，退回到整张卡片里找链接。
    const readCardLinkId = (element) => {
      const anchor = element.closest('a[href*="/app/bbs/link/"]');
      if (anchor) return readLinkId(anchor.getAttribute("href"));
      const card = element.closest(".bbs-home__content-item, .content-list__item, li");
      if (!card) return "";
      const inner = card.querySelector('a[href*="/app/bbs/link/"]');
      return inner ? readLinkId(inner.getAttribute("href")) : "";
    };

    const isEnabled = () => readCommentPreviewPreference();

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const trigger = target.closest(RAIL_TRIGGER_SELECTOR);
      if (!trigger) return;
      const linkId = readCardLinkId(trigger);
      if (linkId === "") return;
      if (!isEnabled()) return;
      if (!isFeedPage()) return;
      event.preventDefault();
      event.stopPropagation();
      rail.open(linkId);
    }, true);

    // 面板展开时，鼠标在信息流卡片上停留即切换预览，不必精确点中评论数字。
    let hoverTimer = 0;
    let hoverId = "";
    const cancelHover = () => {
      if (hoverTimer !== 0) window.clearTimeout(hoverTimer);
      hoverTimer = 0;
      hoverId = "";
    };
    document.addEventListener("pointerover", (event) => {
      if (!isEnabled() || !rail.isOpen()) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const card = target.closest("#page-bbs-community .bbs-home__content-item");
      if (!card) return;
      const linkId = readCardLinkId(card);
      if (linkId === "" || linkId === hoverId) return;
      cancelHover();
      hoverId = linkId;
      hoverTimer = window.setTimeout(() => {
        hoverTimer = 0;
        if (!rail.isOpen() || rail.getLinkId() === linkId) return;
        rail.open(linkId);
      }, 600);
    }, true);
    document.addEventListener("pointerout", (event) => {
      if (hoverTimer === 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const card = target.closest("#page-bbs-community .bbs-home__content-item");
      if (!card) return;
      const related = event.relatedTarget;
      if (related instanceof Node && card.contains(related)) return;
      cancelHover();
    }, true);
    document.addEventListener("pointerdown", cancelHover, true);
    document.addEventListener("scroll", cancelHover, true);

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !rail.isOpen()) return;
      event.preventDefault();
      rail.collapse();
    });

    let autoOpened = false;
    const sync = () => {
      if (!isEnabled()) {
        autoOpened = false;
        rail.setActive(false);
        rail.host.remove();
        return;
      }
      const active = isFeedPage();
      rail.setActive(active);
      if (!active) {
        autoOpened = false;
        rail.host.remove();
        return;
      }
      if (rail.host.parentNode !== document.body) document.body.append(rail.host);
      // 开启预览后，进入首页直接带出首条帖子的评论，不必先点评论数字。
      if (!autoOpened && !rail.isOpen()) {
        const linkId = readFirstFeedLinkId();
        if (linkId !== "") {
          autoOpened = true;
          rail.open(linkId);
        }
      }
    };
    document.addEventListener(COMMENT_PREVIEW_EVENT, sync);
    registerPageSync(sync, 200, [PAGE_ROUTE.FEED], "feed");
    sync();
  }

  // 帖子连读：在帖子页纵轴中心左右两侧提供上一篇/下一篇箭头，切换走站内路由，不整页刷新。
  const PAGER_ID = "heybox-up-post-pager";
  const FEED_ORDER_KEY = "heybox-up.feedOrder.v1";
  const POST_TRAIL_KEY = "heybox-up.postTrail.v1";
  const POST_TRAIL_MAX = 40;
  const FEED_ORDER_MAX = 600;
  const FEED_QUEUE_KEY = "heybox-up.feedQueue.v1";
  const FEED_CURSOR_KEY = "heybox-up.feedCursor.v1";
  const FEED_SEEN_KEY = "heybox-up.feedSeen.v1";
  const FEED_RECENT_KEY = "heybox-up.feedRecent.v1";
  const FEED_DISCOVERY_API_PATH = "/bbs/app/feeds";
  const FEED_DISCOVERY_PAGE_SIZE = 30;
  const FEED_DISCOVERY_PASS_PAGES = 3;

  // ==feed-discovery:start==
  const FEED_QUEUE_MAX = 80;
  const FEED_SEEN_MAX = 600;
  const FEED_RECENT_MAX = 12;
  const FEED_TITLE_MAX = 80;

  function normalizeFeedId(value) {
    if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    return /^[1-9]\d*$/.test(trimmed) ? trimmed : "";
  }

  function normalizeFeedText(value, maxLength = FEED_TITLE_MAX) {
    if (typeof value !== "string" && typeof value !== "number") return "";
    return String(value)
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength);
  }

  function readFeedContentType(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
    if (typeof value !== "string") return NaN;
    const trimmed = value.trim();
    return /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
  }

  function isFeedFallbackTitle(title, id) {
    return title === "" || title === "帖子 " + id;
  }

  function normalizeFeedCandidate(raw) {
    if (raw === null || typeof raw !== "object") return null;
    if (readFeedContentType(raw.content_type) === 18) return null;
    const id = normalizeFeedId(raw.linkid ?? raw.link_id ?? raw.id);
    if (id === "") return null;
    const user = raw.user !== null && typeof raw.user === "object" ? raw.user : null;
    const authorId = normalizeFeedText(
      raw.userid ?? raw.user_id ?? user?.userid ?? user?.id ?? raw.authorId,
      80,
    );
    const author = normalizeFeedText(
      raw.username ?? user?.username ?? user?.nickname ?? raw.author,
      80,
    );
    const topicIds = [];
    const topics = [];
    for (const topic of Array.isArray(raw.topics) ? raw.topics : []) {
      if (typeof topic === "string" || typeof topic === "number") {
        const topicId = normalizeFeedId(topic);
        if (topicId !== "") {
          if (!topicIds.includes(topicId)) topicIds.push(topicId);
          continue;
        }
        const topicName = normalizeFeedText(topic, 80);
        if (topicName !== "" && !topics.includes(topicName)) topics.push(topicName);
        continue;
      }
      const topicObject = topic !== null && typeof topic === "object" ? topic : null;
      const topicId = normalizeFeedId(topicObject?.topic_id ?? topicObject?.topicId ?? topicObject?.id ?? topic);
      const topicName = normalizeFeedText(topicObject?.name ?? topicObject?.topic_name ?? topicObject?.topicName, 80);
      if (topicId !== "" && !topicIds.includes(topicId)) topicIds.push(topicId);
      if (topicName !== "" && !topics.includes(topicName)) topics.push(topicName);
    }
    for (const topicId of Array.isArray(raw.topicIds) ? raw.topicIds : []) {
      const normalized = normalizeFeedId(topicId);
      if (normalized !== "" && !topicIds.includes(normalized)) topicIds.push(normalized);
    }
    for (const topicName of Array.isArray(raw.topicsText) ? raw.topicsText : []) {
      const normalized = normalizeFeedText(topicName, 80);
      if (normalized !== "" && !topics.includes(normalized)) topics.push(normalized);
    }
    const title = normalizeFeedText(raw.title) || normalizeFeedText(raw.description) || "帖子 " + id;
    return { id: id, title: title, authorId: authorId, author: author, topicIds: topicIds, topics: topics };
  }

  function mergeFeedCandidateMetadata(existing, incoming) {
    if (existing === null) return incoming;
    if (incoming === null) return existing;
    const existingTitleFallback = isFeedFallbackTitle(existing.title, existing.id);
    const incomingTitleFallback = isFeedFallbackTitle(incoming.title, incoming.id);
    const title = existingTitleFallback && !incomingTitleFallback ? incoming.title : existing.title || incoming.title;
    const topicIds = [...existing.topicIds];
    const topics = [...existing.topics];
    for (const topicId of incoming.topicIds) {
      if (!topicIds.includes(topicId)) topicIds.push(topicId);
    }
    for (const topic of incoming.topics) {
      if (!topics.includes(topic)) topics.push(topic);
    }
    return {
      id: existing.id,
      title: title,
      authorId: existing.authorId || incoming.authorId,
      author: existing.author || incoming.author,
      topicIds: topicIds,
      topics: topics,
    };
  }

  function mergeFeedOrder(existing, incoming) {
    const order = [];
    const positions = new Map();
    for (const raw of [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])]) {
      const candidate = normalizeFeedLegacyCandidate(raw);
      if (candidate === null) continue;
      const position = positions.get(candidate.id);
      if (position === undefined) {
        positions.set(candidate.id, order.length);
        order.push(candidate);
      } else {
        order[position] = mergeFeedCandidateMetadata(order[position], candidate);
      }
    }
    return order;
  }

  function normalizeFeedLegacyCandidate(raw) {
    if (typeof raw === "string" || (typeof raw === "number" && Number.isSafeInteger(raw))) {
      const id = normalizeFeedId(raw);
      return id === "" ? null : { id: id, title: "帖子 " + id, authorId: "", author: "", topicIds: [], topics: [] };
    }
    return normalizeFeedCandidate(raw);
  }

  function mergeRecentMetadata(existing, current, max = FEED_RECENT_MAX) {
    const merged = [];
    const positions = new Map();
    for (const raw of [current, ...(Array.isArray(existing) ? existing : [])]) {
      const candidate = normalizeFeedCandidate(raw);
      if (candidate === null) continue;
      const position = positions.get(candidate.id);
      if (position === undefined) {
        positions.set(candidate.id, merged.length);
        merged.push(candidate);
      } else {
        merged[position] = mergeFeedCandidateMetadata(merged[position], candidate);
      }
    }
    return merged.slice(0, Math.max(0, max));
  }

  function mergeFeedSeen(existing, ids, max = FEED_SEEN_MAX) {
    const seen = [];
    const known = new Set();
    for (const raw of [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(ids) ? ids : [])]) {
      const id = normalizeFeedId(raw);
      if (id === "" || known.has(id)) continue;
      known.add(id);
      seen.push(id);
    }
    const limit = Math.max(0, max);
    return seen.slice(Math.max(0, seen.length - limit));
  }

  function mergeFeedQueue(queue, incoming, options = {}) {
    const currentId = normalizeFeedId(options.currentId);
    const visited = options.visited instanceof Set ? options.visited : new Set();
    const seen = options.seen instanceof Set ? options.seen : new Set();
    const max = Number.isInteger(options.max) ? Math.max(0, options.max) : FEED_QUEUE_MAX;
    const merged = [];
    const positions = new Map();
    const add = (raw) => {
      const candidate = normalizeFeedLegacyCandidate(raw);
      if (candidate === null) return;
      if (candidate.id === currentId || visited.has(candidate.id) || seen.has(candidate.id)) return;
      const existingPosition = positions.get(candidate.id);
      if (existingPosition !== undefined) {
        merged[existingPosition] = mergeFeedCandidateMetadata(merged[existingPosition], candidate);
        return;
      }
      positions.set(candidate.id, merged.length);
      merged.push(candidate);
    };
    for (const raw of Array.isArray(queue) ? queue : []) add(raw);
    for (const raw of Array.isArray(incoming) ? incoming : []) add(raw);
    return merged.slice(0, max);
  }

  function scoreFeedCandidate(candidate, recent) {
    let score = 0;
    const authorId = candidate.authorId;
    const author = candidate.author;
    for (let index = 0; index < recent.length; index += 1) {
      const item = recent[index];
      const sameAuthor = (authorId !== "" && item.authorId === authorId) || (author !== "" && item.author === author);
      if (sameAuthor) score += index === 0 ? 100 : Math.max(10, 40 - index * 3);
      let overlap = 0;
      for (const topicId of candidate.topicIds) {
        if (recent[index].topicIds.includes(topicId)) overlap += 1;
      }
      for (const topic of candidate.topics) {
        if (recent[index].topics.includes(topic)) overlap += 1;
      }
      if (overlap > 0) score += overlap * Math.max(4, 18 - index * 2);
    }
    return score;
  }

  function rankFeedCandidates(candidates, recent) {
    const normalizedRecent = (Array.isArray(recent) ? recent : [])
      .map((item) => normalizeFeedCandidate(item))
      .filter((item) => item !== null);
    const unique = [];
    const known = new Set();
    for (const raw of Array.isArray(candidates) ? candidates : []) {
      const candidate = normalizeFeedLegacyCandidate(raw);
      if (candidate === null || known.has(candidate.id)) continue;
      known.add(candidate.id);
      unique.push(candidate);
    }
    return unique
      .map((candidate, index) => ({ candidate: candidate, index: index, score: scoreFeedCandidate(candidate, normalizedRecent) }))
      .sort((left, right) => left.score - right.score || left.index - right.index)
      .map((entry) => entry.candidate);
  }

  function selectNextFeedCandidate(options = {}) {
    const currentId = normalizeFeedId(options.currentId);
    const visited = options.visited instanceof Set ? options.visited : new Set();
    const seen = options.seen instanceof Set ? options.seen : new Set();
    const recent = Array.isArray(options.recent) ? options.recent : [];
    const isBlocked = (raw) => {
      const candidate = normalizeFeedLegacyCandidate(raw);
      if (candidate === null) return true;
      return candidate.id === currentId || visited.has(candidate.id) || seen.has(candidate.id);
    };
    const feedOrder = Array.isArray(options.feedOrder) ? options.feedOrder : [];
    const currentIndex = feedOrder.findIndex((item) => normalizeFeedLegacyCandidate(item)?.id === currentId);
    const sources = [
      { source: "feed", candidates: currentIndex === -1 ? [] : feedOrder.slice(currentIndex + 1).filter((item) => !isBlocked(item)) },
      { source: "queue", candidates: (Array.isArray(options.queue) ? options.queue : []).filter((item) => !isBlocked(item)) },
      { source: "related", candidates: (Array.isArray(options.related) ? options.related : []).filter((item) => !isBlocked(item)) },
    ];
    for (const entry of sources) {
      if (entry.candidates.length === 0) continue;
      const ranked = rankFeedCandidates(entry.candidates, recent);
      if (ranked.length > 0) return { source: entry.source, candidate: ranked[0] };
    }
    return null;
  }

  function normalizeFeedDiscoveryLinks(links) {
    if (!Array.isArray(links)) return null;
    const candidates = [];
    const seen = new Set();
    for (const raw of links) {
      const candidate = normalizeFeedCandidate(raw);
      if (candidate === null || seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      candidates.push(candidate);
    }
    return candidates;
  }

  function buildFeedDiscoveryUrl(offset, params) {
    const safeOffset = Number.isSafeInteger(offset) && offset > 0 ? offset : 0;
    const query = new URLSearchParams({ pull: "0", offset: String(safeOffset), dw: "660" });
    const extra = params !== null && typeof params === "object" ? params : {};
    for (const [key, value] of Object.entries(extra)) {
      if (value === undefined || value === null || value === "") continue;
      query.set(key, String(value));
    }
    return "https://api.xiaoheihe.cn" + FEED_DISCOVERY_API_PATH + "?" + query.toString();
  }

  // The feed endpoint answers login failures with a status value instead of an HTTP error.
  function readFeedDiscoveryResponse(data) {
    if (data === null || typeof data !== "object") {
      return { ok: false, links: [], message: "信息流返回内容无法解析" };
    }
    if (data.status === "login") {
      return { ok: false, links: [], message: "登录状态已失效，请先登录小黑盒" };
    }
    if (data.status !== "ok") {
      const message = normalizeFeedText(data.msg ?? data.message, 60) || "信息流接口返回失败";
      return { ok: false, links: [], message: message };
    }
    const result = data.result !== null && typeof data.result === "object" ? data.result : null;
    const links = normalizeFeedDiscoveryLinks(result === null ? null : result.links);
    if (links === null || links.length === 0) {
      return { ok: false, links: [], message: "没有发现更多文章" };
    }
    return { ok: true, links: links, message: "" };
  }

  async function requestFeedDiscoveryPage(offset, signal) {
    const attempts = [];
    try {
      attempts.push(buildFeedDiscoveryUrl(offset, { ...createApiParams(FEED_DISCOVERY_API_PATH), heybox_id: getHeyboxId() }));
    } catch (error) {
      // A failed signature only removes the signed attempt; the public query still works.
    }
    attempts.push(buildFeedDiscoveryUrl(offset, { heybox_id: getHeyboxId() }));
    let message = "信息流请求失败";
    for (const url of attempts) {
      try {
        const response = await fetchWithTimeout(url, {
          credentials: "include",
          cache: "no-store",
          headers: { accept: "application/json" },
          signal: signal,
        });
        if (!response.ok) {
          message = "信息流请求失败（HTTP " + response.status + "）";
          continue;
        }
        let data;
        try {
          data = await response.json();
        } catch (error) {
          if (isAbortError(error)) throw error;
          message = "信息流返回内容无法解析";
          continue;
        }
        return readFeedDiscoveryResponse(data);
      } catch (error) {
        if (isAbortError(error)) throw error;
        message = "网络异常，请稍后重试";
      }
    }
    return { ok: false, links: [], message: message };
  }
  // ==feed-discovery:end==

  const PAGER_CSS = `
    :host { position: fixed; inset: 0; display: block; pointer-events: none; z-index: 2147482990; font: 12px/1.5 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; color: var(--heybox-up-text, #14191e); }
    :host([hidden]) { display: none; }
    .pager { position: absolute; inset: 0; pointer-events: none; }
    .btn {
      position: absolute;
      top: 50%;
      display: grid;
      place-items: center;
      width: 42px;
      height: 64px;
      padding: 0;
      border: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .12));
      border-radius: 999px;
      background: var(--heybox-up-surface, #fff);
      box-shadow: var(--heybox-up-shadow-2, 0 10px 28px rgba(8, 12, 16, .18));
      color: var(--heybox-up-muted, #6b7280);
      font: inherit;
      cursor: pointer;
      opacity: .78;
      transform: translateY(-50%);
      pointer-events: auto;
      transition: opacity .16s ease, color .16s ease, background-color .16s ease, border-color .16s ease;
    }
    .btn--prev { left: max(10px, calc((100vw - var(--heybox-up-page-w, 1360px)) / 2 - 54px)); }
    .btn--next { right: max(10px, calc((100vw - var(--heybox-up-page-w, 1360px)) / 2 - 54px)); }
    .btn:hover:not(:disabled) { opacity: 1; border-color: var(--heybox-up-accent, #6f8db3); background: var(--heybox-up-subtle, rgba(20, 25, 30, .06)); color: var(--heybox-up-text, #14191e); }
    .btn:active:not(:disabled) { background: var(--heybox-up-raised, #d7dce3); }
    .btn:disabled { opacity: .3; cursor: default; }
    .btn:focus-visible { outline: 2px solid var(--heybox-up-accent, #6f8db3); outline-offset: 2px; }
    .btn svg { width: 20px; height: 20px; flex: none; transition: transform .16s ease; }
    .btn--prev:hover:not(:disabled) svg { transform: translateX(-1px); }
    .btn--next:hover:not(:disabled) svg { transform: translateX(1px); }
    @media (max-width: 1199px) { .btn { width: 38px; height: 56px; opacity: .64; } .btn--prev { left: 8px; } .btn--next { right: 8px; } }
    @media (max-width: 1080px) { :host { display: none; } }
    @media (prefers-reduced-motion: reduce) { .btn, .btn svg { transition: none; } }
  `;

  // 沉浸阅读：帖子页改为全屏连续阅读，顶部只留返回与作者，右侧放原生互动，评论收进抽屉。
  const READER_ID = "heybox-up-reader";
  const READER_STYLE_ID = "heybox-up-reader-style";
  const READER_CLASS = "heybox-up-reader";
  const READER_COMMENT_CLASS = "heybox-up-reader-comments";
  const READER_BACKDROP_CLASS = "heybox-up-reader-backdrop";
  const READER_SCROLL_KEY = "heybox-up.readerScroll.v1:";
  const READER_RATIO_KEY = "heybox-up.readerRatio.v1:";

  const READER_ICONS = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4.5 10.5 7.5-6 7.5 6"/><path d="M6.5 9.5V20h11V9.5"/><path d="M10 20v-5h4v5"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    like: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10.5v9H4.5a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z"/><path d="M7 11 10.6 4a2 2 0 0 1 3.8.9V9h4.1a2 2 0 0 1 2 2.4l-1.1 6.2a2.3 2.3 0 0 1-2.3 1.9H7"/></svg>',
    likeOn: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10.5v9H4.5a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z"/><path d="M7 11 10.6 4a2 2 0 0 1 3.8.9V9h4.1a2 2 0 0 1 2 2.4l-1.1 6.2a2.3 2.3 0 0 1-2.3 1.9H7"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8Z"/></svg>',
    starOn: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" aria-hidden="true"><path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8Z"/></svg>',
    comment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.3a7.4 7.4 0 0 1-7.5 7.3 8.4 8.4 0 0 1-2.8-.5L5 20l1.2-3.6A7 7 0 0 1 4.8 11a7.5 7.5 0 0 1 7.7-7.2A7.4 7.4 0 0 1 20 11.3Z"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="12" r="2.2"/><circle cx="17.5" cy="6" r="2.2"/><circle cx="17.5" cy="18" r="2.2"/><path d="m8.1 11 7.4-3.9M8.1 13l7.4 3.9"/></svg>',
    previous: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>',
  };

  const READER_CSS = `
    :root {
      --heybox-up-reading-line-height: 1.7;
      --hbu-reader-stage: 732px;
      --hbu-reader-bg: #e9eef3;
      --hbu-reader-page: #fff;
      --hbu-reader-subtle: #f1f4f7;
      --hbu-reader-ink: #14191e;
      --hbu-reader-ink-2: #3c444c;
      --hbu-reader-muted: #5f6b77;
      --hbu-reader-border: rgba(20, 25, 30, .12);
      --hbu-reader-glass: rgba(255, 255, 255, .78);
      --hbu-reader-glass-ink: #14191e;
      --hbu-reader-shadow: 0 20px 60px rgba(16, 24, 40, .18);
    }
    :root.heybox-up-theme[data-heybox-up-dark="true"] {
      --hbu-reader-bg: #080b0f;
      --hbu-reader-page: #12181f;
      --hbu-reader-subtle: #1b232c;
      --hbu-reader-ink: #e6edf5;
      --hbu-reader-ink-2: #b7c2ce;
      --hbu-reader-muted: #8b99a8;
      --hbu-reader-border: #2b3642;
      --hbu-reader-glass: rgba(21, 28, 36, .8);
      --hbu-reader-glass-ink: #e6edf5;
      --hbu-reader-shadow: 0 24px 70px rgba(0, 0, 0, .5);
    }
    :root.heybox-up-theme[data-heybox-up-theme="oled"] {
      --hbu-reader-bg: #000;
      --hbu-reader-page: #090909;
      --hbu-reader-subtle: #141414;
    }
    :root.heybox-up-theme[data-heybox-up-theme="paper"] {
      --hbu-reader-bg: #e7dfd0;
      --hbu-reader-page: #faf5ea;
      --hbu-reader-subtle: #f2eadb;
      --hbu-reader-ink: #332b21;
      --hbu-reader-ink-2: #5b5042;
      --hbu-reader-muted: #7d6f5d;
      --hbu-reader-border: #ddd0bc;
    }
    :root.heybox-up-theme[data-heybox-up-theme="mist"] {
      --hbu-reader-bg: #dde8ea;
      --hbu-reader-page: #f7fbfb;
      --hbu-reader-subtle: #eaf2f3;
      --hbu-reader-ink: #1d3338;
      --hbu-reader-ink-2: #405a60;
      --hbu-reader-muted: #607a80;
      --hbu-reader-border: #cbdcdf;
    }
    body.heybox-up-reader {
      overflow: hidden !important;
      background: var(--hbu-reader-bg) !important;
    }
    body.heybox-up-reader .nav,
    body.heybox-up-reader .hb-bbs-link__header {
      display: none !important;
    }
    body.heybox-up-reader .hb-bbs-link__reply-target {
      display: block !important;
      position: fixed !important;
      left: auto !important;
      right: 0;
      bottom: 0;
      z-index: 4031;
      width: min(440px, 100vw) !important;
      padding: 0 !important;
      background: var(--hbu-reader-page);
      border-top: 1px solid var(--hbu-reader-border);
      transform: translateY(102%);
      transition: transform .28s cubic-bezier(.3, .8, .3, 1);
      visibility: hidden;
    }
    body.${READER_COMMENT_CLASS} .hb-bbs-link__reply-target { transform: translateY(0); visibility: visible; }
    body.heybox-up-reader #page-bbs-link {
      position: fixed !important;
      inset: 0 !important;
      z-index: 4000;
      display: flex !important;
      justify-content: center;
      width: 100% !important;
      height: 100% !important;
      background: radial-gradient(70% 60% at 50% 0%, rgba(143, 176, 207, .2), transparent 70%), var(--hbu-reader-bg) !important;
    }
    body.heybox-up-reader #page-bbs-link .content,
    body.heybox-up-reader #page-bbs-link .list,
    body.heybox-up-reader #page-bbs-link .hb-bbs-link,
    body.heybox-up-reader #page-bbs-link .hb-bbs-link__container,
    body.heybox-up-reader #page-bbs-link .hb-bbs-link__content {
      display: block !important;
      width: 100% !important;
      max-width: none !important;
      height: 100% !important;
      min-width: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }
    body.heybox-up-reader .hb-bbs-image-text,
    body.heybox-up-reader .hb-bbs-post { display: none !important; }
    body.heybox-up-reader .cpt-right-side.right { display: none !important; }
    /* The reader sits at 4001, so lift the site confirmation dialog above it. */
    body.heybox-up-reader .alert-container-wrapper .hb-cpt__alert-wrapper { z-index: 4100 !important; }
    #${READER_ID} {
      position: fixed;
      top: 0;
      left: 50%;
      z-index: 4001;
      width: min(calc(var(--hbu-reader-stage) + 80px), 100%);
      height: 100%;
      height: 100dvh;
      transform: translateX(-50%);
      background: var(--hbu-reader-page);
      color: var(--hbu-reader-ink);
      box-shadow: var(--hbu-reader-shadow);
      font: 16px/1.6 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
      -webkit-font-smoothing: antialiased;
      isolation: isolate;
    }
    #${READER_ID} *, #${READER_ID} *::before, #${READER_ID} *::after { box-sizing: border-box; }
    #${READER_ID} :is(button, a, [role="button"]) { -webkit-tap-highlight-color: transparent; }
    #${READER_ID} :is(button, a, [role="button"]):focus-visible {
      outline: 2px solid var(--heybox-up-accent, #8fb0cf);
      outline-offset: 2px;
    }
    .hbu-reader-scroll {
      position: relative;
      width: calc(100% - 80px);
      height: 100%;
      overflow-x: hidden;
      overflow-y: auto;
      margin-inline: auto;
      overscroll-behavior: contain;
      scrollbar-width: none;
      scroll-behavior: smooth;
    }
    .hbu-reader-scroll::-webkit-scrollbar { display: none; }
    .hbu-reader-page {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 0;
      padding: 44px 60px 72px;
      background: var(--hbu-reader-page);
    }
    .hbu-reader-page[data-kind="text"] { padding: 24px 60px 40px; }
    .hbu-reader-page[data-kind="heading"] { padding: 56px 60px 28px; }
    .hbu-reader-page[data-kind="hero"] { min-height: 100dvh; padding: 0; }
    .hbu-reader-page[data-kind="end"] { min-height: 100dvh; }
    .hbu-reader-page[data-kind="text"] .hbu-reader-copy,
    .hbu-reader-page[data-kind="heading"] .hbu-reader-copy {
      width: min(34em, 100%);
      font-size: 18px;
      line-height: var(--heybox-up-reading-line-height);
      color: var(--hbu-reader-ink);
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }
    .hbu-reader-page[data-kind="heading"] { justify-content: center; }
    .hbu-reader-page[data-kind="heading"] .hbu-reader-copy {
      font-size: 27px;
      line-height: 1.42;
      font-weight: 700;
      letter-spacing: -.015em;
    }
    .hbu-reader-page[data-kind="rich"] {
      align-items: stretch;
      justify-content: flex-start;
      padding-top: 40px;
    }
    .hbu-reader-rich {
      width: 100%;
      font-size: 18px;
      line-height: var(--heybox-up-reading-line-height);
      color: var(--hbu-reader-ink);
      overflow-wrap: anywhere;
    }
    /* The cloned markup keeps a hard-coded 25px line height; cover body text only so
       cards and blockquotes keep their own styles. */
    .hbu-reader-rich :is(p, li, ul, ol, .line, .order-line, .text):not([class*="com-"], [class*="com-"] *):not(blockquote, blockquote *) {
      line-height: var(--heybox-up-reading-line-height) !important;
    }
    .hbu-reader-rich :is(h1, h2, h3, h4, h5, h6) { margin: 0 0 .7em; font-size: 22px; line-height: 1.45; }
    .hbu-reader-rich :is(p, .text) { margin: 0 0 .72em; }
    .hbu-reader-rich :is(ul, ol, pre, blockquote, table) { margin: 0 0 1em; }
    .hbu-reader-rich :is(ul, ol) { padding-left: 1.35em; }
    .hbu-reader-rich li + li { margin-top: .45em; }
    .hbu-reader-rich blockquote {
      padding: 2px 0 2px 15px;
      border-left: 3px solid var(--heybox-up-accent, #8fb0cf);
      color: var(--hbu-reader-ink-2);
      line-height: 1.8;
    }
    .hbu-reader-rich blockquote :is(p, .text) { line-height: 1.8 !important; }
    .hbu-reader-rich pre {
      padding: 14px 16px;
      border: 1px solid var(--hbu-reader-border);
      border-radius: 12px;
      background: var(--hbu-reader-subtle);
      overflow-x: auto;
      font: 13px/1.6 ui-monospace, SFMono-Regular, Consolas, monospace;
    }
    .hbu-reader-rich :is(img, video, .hb-cpt__image, .com-game-card, .com-album-card, .com-award-table-card, .com-chatroom-card, .com-league-card, .com-match-card, .com-mod-card, .com-sku-card, .com-wiki-card) { max-width: 100%; border-radius: 14px; }
    .hbu-reader-rich :is(.com-game-card, .com-album-card, .com-award-table-card, .com-chatroom-card, .com-league-card, .com-match-card, .com-mod-card, .com-sku-card, .com-wiki-card) {
      background: var(--hbu-reader-subtle) !important;
      border-color: var(--hbu-reader-border) !important;
      color: var(--hbu-reader-ink) !important;
    }
    .hbu-reader-rich :is(a, .prose-link) { color: var(--heybox-up-accent, #4f7ea8); }
    /* Cloned article nodes keep their original dark text colors on nested paragraphs and list lines.
       Cards and blockquotes keep their own colors, matching the line-height exclusion above. */
    .hbu-reader-rich :is(p, li, ol, ul, .line, .order-line, .text):not([class*="com-"], [class*="com-"] *):not(blockquote, blockquote *) {
      color: var(--hbu-reader-ink) !important;
    }
    .hbu-reader-rich blockquote,
    .hbu-reader-rich blockquote :is(p, .text) {
      color: var(--hbu-reader-ink-2) !important;
    }
    .hbu-reader-page[data-kind="media"] { justify-content: flex-start; padding: 32px 20px; background: #05070a; }
    .hbu-reader-page[data-kind="embed"] { justify-content: flex-start; padding: 32px 20px; background: #05070a; }
    .hbu-reader-embed {
      width: min(100%, 960px);
      margin: auto;
      overflow: hidden;
      background: #05070a;
      border-radius: 12px;
    }
    .hbu-reader-embed > * { width: 100% !important; height: 100% !important; margin: 0 !important; border: 0 !important; border-radius: 0 !important; }
    .hbu-reader-embed :is(iframe, video, embed, object) { display: block !important; width: 100% !important; height: 100% !important; border: 0 !important; }
    .hbu-reader-embed audio { display: block !important; width: 100% !important; height: auto !important; min-height: 54px !important; border: 0 !important; }
    .hbu-reader-media {
      display: block;
      max-width: 100%;
      max-height: none;
      width: auto;
      height: auto;
      object-fit: contain;
      margin: auto;
      border-radius: 12px;
      cursor: zoom-in;
      box-shadow: 0 18px 50px rgba(0, 0, 0, .35);
    }
    .hbu-reader-page[data-kind="hero"] {
      padding: 0;
      justify-content: flex-start;
      align-items: stretch;
      min-height: 100dvh;
      background: var(--hbu-reader-page);
      color: var(--hbu-reader-ink);
    }
    .hbu-reader-cover { position: relative; inset: auto; flex: 1 1 auto; min-height: 240px; overflow: hidden; background: #05070a; }
    .hbu-reader-cover-glow { position: absolute; inset: -48px; background-position: center; background-size: cover; filter: blur(42px) brightness(.5); transform: scale(1.1); }
    .hbu-reader-cover img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      opacity: 0;
      transition: opacity .32s ease;
      pointer-events: none;
    }
    .hbu-reader-cover img[data-active="true"] { opacity: 1; pointer-events: auto; }
    .hbu-reader-cover::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, rgba(0, 0, 0, .52), transparent 24%);
    }
    .hbu-reader-cover--empty { background: radial-gradient(80% 60% at 25% 15%, rgba(143, 176, 207, .35), transparent 70%), linear-gradient(150deg, #18222c, #070a0e); }
    .hbu-reader-cover-nav {
      position: absolute;
      top: 50%;
      z-index: 2;
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      margin-top: -20px;
      border: 1px solid rgba(255, 255, 255, .22);
      border-radius: 50%;
      background: rgba(8, 11, 15, .46);
      color: #fff;
      cursor: pointer;
    }
    .hbu-reader-cover-nav svg { width: 19px; height: 19px; }
    .hbu-reader-cover-nav[data-side="prev"] { left: 16px; }
    .hbu-reader-cover-nav[data-side="next"] { right: 16px; }
    .hbu-reader-cover-nav[hidden] { display: none; }
    .hbu-reader-cover-dots { position: absolute; top: 80px; left: 50%; z-index: 2; display: flex; gap: 0; transform: translateX(-50%); }
    .hbu-reader-cover-dots button { position: relative; width: 36px; height: 36px; padding: 0; border: 0; background: transparent; cursor: pointer; }
    .hbu-reader-cover-dots button::after { content: ""; position: absolute; top: 16px; right: 8px; left: 8px; height: 3px; border-radius: 99px; background: rgba(255, 255, 255, .38); }
    .hbu-reader-cover-dots button[aria-current="true"]::after { background: #fff; }
    .hbu-reader-caption {
      position: relative;
      z-index: 2;
      flex: none;
      width: 100%;
      margin: 0;
      padding: 22px 60px 64px;
      border: 0;
      border-radius: 0;
      background: var(--hbu-reader-page);
      color: var(--hbu-reader-ink);
    }
    .hbu-reader-kicker { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; margin-bottom: 13px; color: var(--hbu-reader-muted); font-size: 12px; line-height: 1.4; }
    .hbu-reader-kicker span { padding: 3px 9px; border: 1px solid var(--hbu-reader-border); border-radius: 99px; background: var(--hbu-reader-subtle); }
    .hbu-reader-title { display: -webkit-box; margin: 0 0 12px; overflow: hidden; color: var(--hbu-reader-ink); font-size: 31px; line-height: 1.28; font-weight: 750; letter-spacing: -.02em; text-wrap: balance; -webkit-box-orient: vertical; -webkit-line-clamp: 4; }
    .hbu-reader-byline { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; color: var(--hbu-reader-muted); font-size: 13px; }
    .hbu-reader-byline b { color: var(--hbu-reader-ink); font-weight: 600; }
    .hbu-reader-page[data-kind="end"] { justify-content: center; gap: 22px; background: var(--hbu-reader-page); }
    .hbu-reader-end-card { width: min(440px, 100%); padding: 24px; border: 1px solid var(--hbu-reader-border); border-radius: 20px; background: var(--hbu-reader-subtle); }
    .hbu-reader-end-head { display: flex; gap: 12px; align-items: center; }
    .hbu-reader-end-head img { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; background: var(--hbu-reader-page); }
    .hbu-reader-end-name { min-width: 0; flex: 1 1 auto; }
    .hbu-reader-end-name b { display: block; font-size: 15px; }
    .hbu-reader-end-name span { color: var(--hbu-reader-muted); font-size: 12px; }
    .hbu-reader-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 20px 0 18px; }
    .hbu-reader-stats div { padding: 10px 6px; border-radius: 12px; background: var(--hbu-reader-page); text-align: center; }
    .hbu-reader-stats b { display: block; font-size: 17px; }
    .hbu-reader-stats span { color: var(--hbu-reader-muted); font-size: 11px; }
    .hbu-reader-tags { display: flex; flex-wrap: wrap; gap: 6px; }
    .hbu-reader-tag { min-height: 36px; padding: 7px 12px; border: 1px solid var(--hbu-reader-border); border-radius: 99px; background: transparent; color: var(--hbu-reader-ink-2); font: inherit; font-size: 12px; cursor: pointer; }
    .hbu-reader-related { width: min(440px, 100%); }
    .hbu-reader-related h2 { margin: 0 0 8px; color: var(--hbu-reader-muted); font-size: 11px; font-weight: 600; letter-spacing: .08em; }
    .hbu-reader-related a { display: flex; gap: 10px; min-height: 44px; padding: 11px 13px; border: 1px solid var(--hbu-reader-border); border-radius: 12px; color: var(--hbu-reader-ink); font-size: 13px; line-height: 1.5; text-decoration: none; }
    .hbu-reader-related a + a { margin-top: 6px; }
    .hbu-reader-related a:hover { background: var(--hbu-reader-subtle); }
    .hbu-reader-end-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
    .hbu-reader-end-actions button { display: inline-flex; align-items: center; gap: 6px; min-height: 38px; padding: 8px 14px; border: 1px solid var(--hbu-reader-border); border-radius: 99px; background: transparent; color: var(--hbu-reader-ink); font: inherit; font-size: 13px; cursor: pointer; }
    .hbu-reader-end-actions button[data-home] { border-color: transparent; background: var(--hbu-reader-ink); color: var(--hbu-reader-page); font-weight: 650; }
    .hbu-reader-end-actions button:disabled { opacity: .42; cursor: default; }
    .hbu-reader-end-actions button svg { width: 15px; height: 15px; }
    .hbu-reader-end-status { margin: 0; color: var(--hbu-reader-muted); font-size: 12px; line-height: 1.5; text-align: center; }
    .hbu-reader-end-status[hidden] { display: none; }
    @media (max-height: 820px) {
      .hbu-reader-page[data-kind="end"] { gap: 12px; padding-top: 64px; padding-bottom: 64px; }
      .hbu-reader-page[data-kind="end"] .hbu-reader-related { display: none; }
      .hbu-reader-end-card { padding: 18px; }
      .hbu-reader-stats { margin: 14px 0 12px; }
    }
    @media (max-height: 520px) {
      .hbu-reader-page[data-kind="end"] { padding-top: 48px; padding-bottom: 40px; }
      .hbu-reader-page[data-kind="end"] .hbu-reader-stats { display: none; }
      .hbu-reader-end-head img { width: 40px; height: 40px; }
    }
    .hbu-reader-head { position: absolute; top: 0; right: 0; left: 0; z-index: 12; display: flex; gap: 9px; align-items: center; padding: 14px 16px; padding-top: max(14px, env(safe-area-inset-top)); background: linear-gradient(180deg, rgba(3, 5, 8, .92), rgba(3, 5, 8, .48) 58%, transparent); color: var(--hbu-reader-glass-ink); pointer-events: none; }
    .hbu-reader-head > * { pointer-events: auto; }
    .hbu-reader-round { display: grid; place-items: center; width: 40px; height: 40px; flex: none; padding: 0; border: 1px solid rgba(255, 255, 255, .2); border-radius: 50%; background: rgba(8, 11, 15, .46); color: #fff; cursor: pointer; backdrop-filter: blur(8px); }
    .hbu-reader-round svg { width: 19px; height: 19px; }
    .hbu-reader-home { display: inline-flex; align-items: center; gap: 6px; height: 40px; flex: none; padding: 0 13px 0 10px; border: 1px solid rgba(255, 255, 255, .2); border-radius: 99px; background: rgba(8, 11, 15, .46); color: #fff; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; backdrop-filter: blur(8px); }
    .hbu-reader-home svg { width: 17px; height: 17px; flex: none; }
    .hbu-reader-head-author { display: flex; gap: 7px; align-items: center; min-width: 0; max-width: 42%; padding: 4px 10px 4px 4px; border: 1px solid rgba(255, 255, 255, .18); border-radius: 99px; background: rgba(8, 11, 15, .46); color: #fff; text-decoration: none; backdrop-filter: blur(8px); }
    .hbu-reader-head-author img { width: 30px; height: 30px; flex: none; border-radius: 50%; object-fit: cover; background: #1e2630; }
    .hbu-reader-head-author span { min-width: 0; overflow: hidden; font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
    .hbu-reader-follow { min-width: 56px; height: 36px; padding: 0 13px; border: 0; border-radius: 99px; background: #f0f4f8; color: #16202a; font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
    .hbu-reader-follow[aria-pressed="true"] { background: rgba(255, 255, 255, .16); color: #fff; }
    .hbu-reader-head-spacer { flex: 1 1 auto; }
    .hbu-reader-rail { position: absolute; right: 16px; bottom: 118px; z-index: 11; display: flex; flex-direction: column; gap: 13px; align-items: center; }
    .hbu-reader-action { display: grid; place-items: center; width: 48px; min-height: 48px; padding: 4px 0; border: 1px solid rgba(255, 255, 255, .18); border-radius: 50%; background: rgba(12, 17, 23, .78); color: #f2f6fa; cursor: pointer; backdrop-filter: blur(10px); }
    .hbu-reader-action:hover { background: rgba(38, 48, 59, .9); }
    .hbu-reader-action svg { width: 21px; height: 21px; }
    .hbu-reader-action[aria-pressed="true"] { color: #ff8e9a; }
    .hbu-reader-action[data-action="favour"][aria-pressed="true"] { color: #f0c56a; }
    .hbu-reader-action[data-action="cy"][aria-pressed="true"] { color: #8fd0a8; }
    .hbu-reader-action--cy { display: flex; flex-direction: column; gap: 1px; align-items: center; justify-content: center; }
    .hbu-reader-cy-label { font-size: 11px; font-weight: 700; line-height: 1; letter-spacing: .02em; }
    .hbu-reader-rail-avatar { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
    .hbu-reader-favour-menu {
      position: absolute;
      right: calc(100% + 10px);
      bottom: 92px;
      width: 172px;
      max-height: min(300px, 56dvh);
      padding: 6px;
      overflow-y: auto;
      border: 1px solid rgba(255, 255, 255, .16);
      border-radius: 14px;
      background: rgba(12, 17, 23, .96);
      color: #f2f6fa;
      box-shadow: 0 16px 40px rgba(0, 0, 0, .4);
      backdrop-filter: blur(12px);
    }
    .hbu-reader-favour-menu[hidden] { display: none; }
    .hbu-reader-favour-menu button {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-height: 36px;
      padding: 7px 9px;
      border: 0;
      border-radius: 9px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 12px;
      text-align: left;
      cursor: pointer;
    }
    .hbu-reader-favour-menu button:hover { background: rgba(255, 255, 255, .1); }
    .hbu-reader-favour-menu button svg, .hbu-reader-favour-menu button i { flex: none; width: 15px; height: 15px; }
    .hbu-reader-favour-menu button span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .hbu-reader-favour-empty { padding: 10px; color: rgba(242, 246, 250, .7); font-size: 12px; line-height: 1.5; }
    .hbu-reader-spacing-menu { position: absolute; right: calc(100% + 10px); bottom: 0; z-index: 2; width: 196px; max-width: calc(100vw - 84px); padding: 10px; border: 1px solid rgba(255, 255, 255, .16); border-radius: 14px; background: rgba(12, 17, 23, .96); color: #f2f6fa; box-shadow: 0 16px 40px rgba(0, 0, 0, .4); backdrop-filter: blur(12px); }
    .hbu-reader-spacing-menu[hidden] { display: none; }
    .hbu-reader-spacing-label { margin-bottom: 8px; font-size: 12px; font-weight: 600; color: rgba(242, 246, 250, .86); }
    .hbu-reader-spacing-row { display: flex; gap: 7px; align-items: center; }
    .hbu-reader-spacing-row input { width: 70px; height: 32px; padding: 0 8px; border: 1px solid rgba(255, 255, 255, .2); border-radius: 8px; outline: none; background: rgba(255, 255, 255, .08); color: inherit; font: inherit; font-size: 13px; font-variant-numeric: tabular-nums; }
    .hbu-reader-spacing-row input:focus { border-color: rgba(255, 255, 255, .48); }
    .hbu-reader-spacing-unit { font-size: 12px; color: rgba(242, 246, 250, .7); }
    .hbu-reader-spacing-reset { height: 32px; margin-left: auto; padding: 0 9px; border: 1px solid rgba(255, 255, 255, .18); border-radius: 8px; background: transparent; color: inherit; font: inherit; font-size: 12px; cursor: pointer; }
    .hbu-reader-spacing-reset:hover { background: rgba(255, 255, 255, .1); }
    .hbu-reader-cy-dialog { position: absolute; inset: 0; z-index: 60; display: grid; place-items: center; padding: 24px; background: rgba(2, 4, 7, .62); backdrop-filter: blur(4px); }
    .hbu-reader-cy-dialog[hidden] { display: none; }
    .hbu-reader-cy-card { width: min(520px, 100%); padding: 20px; border: 1px solid var(--hbu-reader-border); border-radius: 20px; background: var(--hbu-reader-page); color: var(--hbu-reader-ink); box-shadow: 0 24px 70px rgba(0, 0, 0, .45); }
    .hbu-reader-cy-head { display: flex; gap: 12px; align-items: center; justify-content: space-between; margin-bottom: 12px; font-size: 15px; font-weight: 700; }
    .hbu-reader-cy-close { display: grid; place-items: center; width: 36px; height: 36px; padding: 0; border: 1px solid var(--hbu-reader-border); border-radius: 50%; background: transparent; color: inherit; cursor: pointer; }
    .hbu-reader-cy-close svg { width: 16px; height: 16px; }
    .hbu-reader-cy-text { width: 100%; min-height: 132px; padding: 12px; resize: vertical; border: 1px solid var(--hbu-reader-border); border-radius: 12px; outline: none; background: var(--hbu-reader-subtle); color: inherit; font: inherit; line-height: 1.6; }
    .hbu-reader-cy-text:focus { border-color: var(--heybox-up-accent, #8fb0cf); }
    .hbu-reader-cy-status { min-height: 18px; margin-top: 8px; color: var(--hbu-reader-muted); font-size: 12px; }
    .hbu-reader-cy-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
    .hbu-reader-cy-actions button { min-height: 36px; padding: 0 16px; border: 1px solid var(--hbu-reader-border); border-radius: 10px; background: transparent; color: inherit; font: inherit; font-size: 13px; cursor: pointer; }
    .hbu-reader-cy-actions button[data-primary] { border-color: transparent; background: var(--heybox-up-accent, #8fb0cf); color: #061018; font-weight: 650; }
    .hbu-reader-cy-actions button:disabled { opacity: .55; cursor: default; }
    .hbu-reader-action-count { display: block; margin-top: 2px; font-size: 10px; font-variant-numeric: tabular-nums; line-height: 1.2; }
    .hbu-reader-progress { position: absolute; right: 0; bottom: 0; left: 0; z-index: 10; display: flex; gap: 10px; align-items: center; height: 46px; padding: 0 18px; background: linear-gradient(0deg, rgba(3, 5, 8, .62), transparent); color: #fff; font-size: 11px; font-variant-numeric: tabular-nums; pointer-events: none; }
    .hbu-reader-progress-bar { flex: 1 1 auto; height: 2px; overflow: hidden; border-radius: 99px; background: rgba(255, 255, 255, .26); }
    .hbu-reader-progress-bar i { display: block; width: 0; height: 100%; background: #fff; transition: width .2s linear; }
    .hbu-reader-hint { color: rgba(255, 255, 255, .72); white-space: nowrap; }
    body.${READER_CLASS} #${PAGER_ID} { display: none !important; }
    body.${READER_CLASS} #page-bbs-link .link-comment {
      position: fixed !important;
      top: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      z-index: 4030;
      display: flex !important;
      flex-direction: column;
      width: min(440px, 100vw) !important;
      height: 100% !important;
      height: 100dvh !important;
      max-height: none !important;
      margin: 0 !important;
      border: 0 !important;
      border-left: 1px solid var(--hbu-reader-border) !important;
      border-radius: 0 !important;
      background: var(--hbu-reader-page) !important;
      color: var(--hbu-reader-ink) !important;
      box-shadow: -24px 0 60px rgba(0, 0, 0, .34);
      transform: translateX(102%);
      transition: transform .28s cubic-bezier(.3, .8, .3, 1);
      overscroll-behavior: contain;
      visibility: hidden;
    }
    body.${READER_COMMENT_CLASS} #page-bbs-link .link-comment { transform: translateX(0); visibility: visible; }
    body.${READER_CLASS} #page-bbs-link .link-comment .comment__comment-header { flex: none; padding-right: 52px; padding-top: 12px; background: var(--hbu-reader-page) !important; }
    body.${READER_CLASS} #page-bbs-link .link-comment__list { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
    body.${READER_COMMENT_CLASS} #page-bbs-link .link-comment__list { padding-bottom: 74px; }
    body.${READER_CLASS} #page-bbs-link .link-comment__comment-item { border-color: var(--hbu-reader-border) !important; }
    body.${READER_CLASS} .link-reply { border-color: var(--hbu-reader-border) !important; }
    body.${READER_CLASS} #page-bbs-link .link-comment .link-reply { flex: none; border-top: 1px solid var(--hbu-reader-border) !important; background: var(--hbu-reader-page) !important; }
    .hbu-reader-sheet-close { position: absolute; top: 54px; right: 12px; z-index: 101; display: grid; place-items: center; width: 36px; height: 36px; border: 1px solid var(--hbu-reader-border); border-radius: 50%; background: var(--hbu-reader-page); color: var(--hbu-reader-ink); cursor: pointer; }
    .hbu-reader-sheet-close svg { width: 17px; height: 17px; }
    .hbu-reader-sheet-status { margin: auto; padding: 28px 18px; color: var(--hbu-reader-muted); font-size: 13px; text-align: center; }
    .hbu-reader-sheet-status.retry { cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
    .hbu-reader-comments-panel { position: fixed; inset: 0; z-index: 4065; display: flex; justify-content: flex-end; }
    .hbu-reader-comments-panel[hidden] { display: none; }
    .hbu-reader-comments-scrim { position: absolute; inset: 0; background: rgba(2, 4, 7, .56); }
    .hbu-reader-comments-sheet { position: relative; z-index: 1; display: flex; flex-direction: column; width: min(440px, 100vw); height: 100%; height: 100dvh; border-left: 1px solid var(--hbu-reader-border); background: var(--hbu-reader-page); color: var(--hbu-reader-ink); font: 16px/1.6 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; box-shadow: -24px 0 60px rgba(0, 0, 0, .34); }
    .hbu-reader-comments-panel :is(button, a):focus-visible { outline: 2px solid var(--heybox-up-accent, #8fb0cf); outline-offset: 2px; }
    .hbu-reader-comments-head { display: flex; gap: 12px; align-items: center; padding: 18px 16px 13px; border-bottom: 1px solid var(--hbu-reader-border); }
    .hbu-reader-comments-heading { min-width: 0; flex: 1 1 auto; }
    .hbu-reader-comments-heading b { display: block; font-size: 15px; }
    .hbu-reader-comments-heading span { color: var(--hbu-reader-muted); font-size: 11px; }
    .hbu-reader-comments-close { display: grid; place-items: center; width: 36px; height: 36px; flex: none; padding: 0; border: 1px solid var(--hbu-reader-border); border-radius: 50%; background: transparent; color: inherit; cursor: pointer; }
    .hbu-reader-comments-close svg { width: 16px; height: 16px; }
    .hbu-reader-comments-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 4px 16px 18px; }
    .hbu-reader-comments-list { margin: 0; padding: 0; list-style: none; }
    .hbu-reader-comments-item { display: flex; gap: 10px; padding: 14px 0; border-bottom: 1px solid var(--hbu-reader-border); }
    .hbu-reader-comments-item:last-child { border-bottom: 0; }
    .hbu-reader-comments-avatar { width: 34px; height: 34px; flex: none; border-radius: 50%; object-fit: cover; background: var(--hbu-reader-subtle); }
    .hbu-reader-comments-main { min-width: 0; flex: 1 1 auto; }
    .hbu-reader-comments-who { display: flex; flex-wrap: wrap; gap: 7px; align-items: baseline; }
    .hbu-reader-comments-name { font-size: 13px; font-weight: 650; }
    .hbu-reader-comments-time { color: var(--hbu-reader-muted); font-size: 11px; }
    .hbu-reader-comments-text { margin: 4px 0 0; font-size: 14px; line-height: 1.68; white-space: pre-wrap; overflow-wrap: anywhere; }
    .hbu-reader-comments-meta { display: flex; gap: 12px; margin-top: 5px; color: var(--hbu-reader-muted); font-size: 11px; }
    .hbu-reader-comments-quote { margin-top: 8px; padding: 7px 9px; border-radius: 9px; background: var(--hbu-reader-subtle); color: var(--hbu-reader-ink-2); font-size: 12px; line-height: 1.55; overflow-wrap: anywhere; }
    .hbu-reader-comments-quote b { color: var(--hbu-reader-muted); font-weight: 600; }
    .hbu-reader-comments-text .hbu-reader-comments-emoji, .hbu-reader-comments-quote .hbu-reader-comments-emoji { display: inline-block; width: 17px; height: 17px; margin: 0 1px; vertical-align: -3px; background-repeat: no-repeat; background-size: 102px 306px; }
    .hbu-reader-comments-text img, .hbu-reader-comments-quote img { max-width: 100%; max-height: 180px; margin-top: 6px; border-radius: 8px; object-fit: contain; vertical-align: top; }
    .hbu-reader-comments-status { padding: 32px 12px; color: var(--hbu-reader-muted); font-size: 13px; text-align: center; }
    .hbu-reader-comments-status[data-retry="true"] { cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
    .hbu-reader-comments-foot { display: flex; gap: 8px; align-items: center; padding: 12px 16px; border-top: 1px solid var(--hbu-reader-border); }
    .hbu-reader-comments-foot button, .hbu-reader-comments-foot a { display: inline-flex; align-items: center; justify-content: center; min-height: 36px; padding: 0 14px; border: 1px solid var(--hbu-reader-border); border-radius: 9px; background: transparent; color: inherit; font: inherit; font-size: 12px; text-decoration: none; cursor: pointer; }
    .hbu-reader-comments-foot a { margin-left: auto; border-color: transparent; background: var(--heybox-up-accent, #8fb0cf); color: #061018; font-weight: 650; }
    .hbu-reader-comments-foot button:disabled { opacity: .55; cursor: default; }
    .hbu-reader-comments-list[hidden], .hbu-reader-comments-status[hidden], .hbu-reader-comments-foot button[hidden] { display: none; }
    .${READER_BACKDROP_CLASS} { position: fixed; inset: 0; z-index: 4009; background: rgba(2, 4, 7, .56); opacity: 0; pointer-events: none; transition: opacity .22s ease; }
    body.${READER_COMMENT_CLASS} .${READER_BACKDROP_CLASS} { opacity: 1; pointer-events: auto; }
    :root body.${READER_CLASS}.${READER_COMMENT_CLASS} #page-bbs-link,
    :root body.${READER_CLASS}.${READER_COMMENT_CLASS} #page-bbs-link .layout-normal,
    :root body.${READER_CLASS}.${READER_COMMENT_CLASS} #page-bbs-link .content,
    :root body.${READER_CLASS}.${READER_COMMENT_CLASS} #page-bbs-link .list { z-index: 4010 !important; background: transparent !important; background-color: transparent !important; pointer-events: none; }
    body.${READER_COMMENT_CLASS} .layout-normal { z-index: auto !important; background: transparent !important; pointer-events: none; }
    body.${READER_COMMENT_CLASS} .hb-bbs-link__reply-target .link-reply__operation-box { display: none !important; }
    body.${READER_COMMENT_CLASS} .hb-bbs-link { visibility: hidden; }
    body.${READER_COMMENT_CLASS} .hb-bbs-link .link-comment { visibility: visible; pointer-events: auto; }
    .hbu-reader-lightbox { position: fixed; inset: 0; z-index: 4050; display: grid; place-items: center; padding: 24px; border: 0; background: rgba(2, 4, 7, .94); cursor: zoom-out; }
    .hbu-reader-lightbox img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .hbu-reader-toast { position: absolute; bottom: 58px; left: 50%; z-index: 20; padding: 7px 13px; border-radius: 99px; background: rgba(5, 8, 11, .86); color: #fff; font-size: 12px; opacity: 0; pointer-events: none; transform: translate(-50%, 8px); transition: opacity .18s ease, transform .18s ease; }
    .hbu-reader-toast[data-show="true"] { opacity: 1; transform: translate(-50%, 0); }
    .hbu-reader-toast--fixed { position: fixed; bottom: 58px; z-index: 4060; }
    .hbu-reader-pending { display: grid; height: 100%; place-items: center; color: var(--hbu-reader-muted); font-size: 13px; letter-spacing: .04em; }
    @media (max-width: 900px) {
      #${READER_ID} { width: 100%; }
      .hbu-reader-scroll { width: 100%; }
      .hbu-reader-rail { right: 14px; bottom: 96px; }
      .hbu-reader-page { padding-right: 86px; }
      .hbu-reader-caption { padding-right: 86px; }
    }
    @media (max-width: 760px) {
      :root { --hbu-reader-stage: 100%; }
      .hbu-reader-rail-avatar-link { display: none; }
      .hbu-reader-page { padding: 22px 64px 48px 24px; }
      .hbu-reader-page[data-kind="hero"] { padding: 0; }
      .hbu-reader-page[data-kind="text"] { padding: 18px 64px 32px 24px; }
      .hbu-reader-page[data-kind="heading"] { padding: 44px 64px 24px 24px; }
      .hbu-reader-page[data-kind="media"] { padding: 20px 16px; }
      .hbu-reader-page[data-kind="embed"] { padding: 20px 16px; }
      .hbu-reader-page[data-kind="text"] .hbu-reader-copy,
      .hbu-reader-page[data-kind="heading"] .hbu-reader-copy,
      .hbu-reader-rich { font-size: 17px; }
      .hbu-reader-page[data-kind="heading"] .hbu-reader-copy { font-size: 24px; }
      .hbu-reader-caption { padding: 18px 64px 56px 24px; }
      .hbu-reader-title { font-size: 26px; }
      .hbu-reader-cy-text { font-size: 16px; }
      .hbu-reader-rail { gap: 9px; bottom: 88px; right: 10px; }
      .hbu-reader-action { width: 42px; min-height: 42px; }
      .hbu-reader-action svg { width: 19px; height: 19px; }
      .hbu-reader-head { padding: 10px 12px; padding-top: max(10px, env(safe-area-inset-top)); }
      .hbu-reader-head-author { max-width: 38%; }
      .hbu-reader-progress { padding: 0 12px; }
      .hbu-reader-round { width: 38px; height: 38px; }
      .hbu-reader-home { height: 38px; padding: 0 11px 0 9px; }
    }
    @media (max-width: 520px) {
      .hbu-reader-head-author span { display: none; }
      .hbu-reader-head-author { padding-right: 4px; }
      .hbu-reader-follow { min-width: 48px; padding: 0 10px; }
      .hbu-reader-home { width: 38px; justify-content: center; padding: 0; border-radius: 50%; }
      .hbu-reader-home span { display: none; }
      .hbu-reader-page { padding-right: 64px; }
      .hbu-reader-page[data-kind="media"] { padding-right: 16px; padding-left: 16px; }
      .hbu-reader-page[data-kind="embed"] { padding-right: 16px; padding-left: 16px; }
      .hbu-reader-caption { padding-right: 64px; }
      .hbu-reader-hint { display: none; }
      .hbu-reader-related { display: none; }
    }
    @media (max-height: 620px) {
      .hbu-reader-page { padding-top: 72px; padding-bottom: 76px; }
      .hbu-reader-page[data-kind="hero"] { padding: 0; }
      .hbu-reader-page[data-kind="text"] { padding-top: 16px; padding-bottom: 28px; }
      .hbu-reader-caption { padding: 14px 64px 22px 24px; }
      .hbu-reader-rail { bottom: 70px; gap: 7px; }
      .hbu-reader-action { width: 38px; min-height: 38px; }
      .hbu-reader-action-count { display: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      .hbu-reader-scroll { scroll-behavior: auto; }
      #${READER_ID} *, #${READER_ID} *::before, #${READER_ID} *::after { transition: none !important; }
    }
  `;

  const PAGER_ICONS = {
    prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>',
  };

  function readPostLinkId() {
    const match = /^\/app\/bbs\/link\/(\d+)/.exec(location.pathname);
    return match ? match[1] : "";
  }

  function readSessionArray(key) {
    const value = sessionStore.readJson(key, []);
    return Array.isArray(value) ? value : [];
  }

  function writeSessionValue(key, value) {
    sessionStore.writeJson(key, value);
  }

  function readFeedOrder() {
    return mergeFeedOrder(readSessionArray(FEED_ORDER_KEY), []);
  }

  function recordFeedOrder() {
    if (readPostLinkId() !== "") return;
    if (!document.querySelector("#page-bbs-community .bbs-home__content-list")) return;
    const seen = new Set();
    const list = [];
    for (const anchor of document.querySelectorAll("#page-bbs-community .bbs-home__content-list a[href*='/app/bbs/link/']")) {
      const match = /link\/(\d+)/.exec(anchor.getAttribute("href") || "");
      if (!match || seen.has(match[1])) continue;
      seen.add(match[1]);
      const titleNode = anchor.querySelector(".bbs-home__content-title, .link-item__title, .bbs-home__topic-name");
      const title = (titleNode ? titleNode.textContent : anchor.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80);
      list.push({ id: match[1], title: title });
    }
    if (list.length === 0) return;
    const merged = mergeFeedOrder(readSessionArray(FEED_ORDER_KEY), list).slice(-FEED_ORDER_MAX);
    if (merged.length > 0) writeSessionValue(FEED_ORDER_KEY, merged);
  }

  function readRelatedPostLinks() {
    const seen = new Set();
    const list = [];
    const nodes = document.querySelectorAll(".bbs-link__related-recommend a[href*='/app/bbs/link/'], .related-recommend__container a[href*='/app/bbs/link/']");
    for (const anchor of nodes) {
      const match = /link\/(\d+)/.exec(anchor.getAttribute("href") || "");
      if (!match || seen.has(match[1])) continue;
      seen.add(match[1]);
      const title = (anchor.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80);
      list.push({ id: match[1], title: title });
    }
    return list;
  }

  function readUserIdFromHref(href) {
    const value = typeof href === "string" ? href : "";
    if (value === "") return "";
    const match = /\/app\/user\/profile\/(\d+)/.exec(value) || /[?&]userid=(\d+)/.exec(value);
    return match ? normalizeFeedId(match[1]) : "";
  }

  // Article pages expose author and topic hooks in several shapes; missing fields stay empty.
  function readPostMeta(root, title) {
    const scope = root instanceof Element ? root : document;
    const authorNode = scope.querySelector(".link-user__username, .page-header__username");
    const authorLink = scope.querySelector(".link-user__user-wrapper, .page-header__user-wrapper, a[href*='/app/user/profile/']");
    const authorHref = authorLink?.getAttribute("href")
      || authorLink?.querySelector("a[href*='/app/user/profile/']")?.getAttribute("href")
      || "";
    const author = normalizeFeedText(authorNode?.textContent ?? "", 80);
    const authorId = readUserIdFromHref(authorHref);
    const topicIds = [];
    const topics = [];
    for (const node of Array.from(scope.querySelectorAll(".link-tags__tag-item"))) {
      const name = normalizeFeedText(node.textContent, 80);
      if (name !== "" && !topics.includes(name)) topics.push(name);
    }
    for (const anchor of Array.from(scope.querySelectorAll("a[href*='/app/topic/link/']"))) {
      const match = /topic\/link\/(\d+)/.exec(anchor.getAttribute("href") || "");
      if (match) {
        const topicId = normalizeFeedId(match[1]);
        if (topicId !== "" && !topicIds.includes(topicId)) topicIds.push(topicId);
      }
      const name = normalizeFeedText(anchor.textContent, 80);
      if (name !== "" && !topics.includes(name)) topics.push(name);
    }
    const heading = normalizeFeedText(title, FEED_TITLE_MAX)
      || normalizeFeedText(scope.querySelector(".section-title__content, .post__title, .image-text__title")?.textContent ?? "", FEED_TITLE_MAX);
    return { title: heading, authorId: authorId, author: author, topicIds: topicIds, topics: topics };
  }

  function readPostTrail() {
    return readSessionArray(POST_TRAIL_KEY).filter((id) => typeof id === "string" && /^\d+$/.test(id));
  }

  function readVisitedPostIds(currentId) {
    const visited = new Set(readPostTrail());
    if (currentId !== "") visited.add(currentId);
    return visited;
  }

  function pushPostTrail(id) {
    const trail = readPostTrail();
    if (trail[trail.length - 1] === id) return;
    const seenAt = trail.lastIndexOf(id);
    if (seenAt !== -1) trail.splice(seenAt, 1);
    trail.push(id);
    while (trail.length > POST_TRAIL_MAX) trail.shift();
    writeSessionValue(POST_TRAIL_KEY, trail);
  }

  function readFeedQueue() {
    return mergeFeedQueue(readSessionArray(FEED_QUEUE_KEY), []);
  }

  function writeFeedQueue(items) {
    writeSessionValue(FEED_QUEUE_KEY, mergeFeedQueue(items, [], { max: FEED_QUEUE_MAX }));
  }

  function readFeedCursor() {
    const raw = sessionStore.read(FEED_CURSOR_KEY);
    if (raw === null || raw === "") return 0;
    const value = Number(raw);
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  }

  function writeFeedCursor(offset) {
    if (!Number.isSafeInteger(offset) || offset < 0) return;
    sessionStore.write(FEED_CURSOR_KEY, String(offset));
  }

  function readFeedSeen() {
    return mergeFeedSeen(readSessionArray(FEED_SEEN_KEY), []);
  }

  function writeFeedSeen(ids) {
    writeSessionValue(FEED_SEEN_KEY, mergeFeedSeen(ids, []));
  }

  function readFeedRecent() {
    return mergeRecentMetadata(readSessionArray(FEED_RECENT_KEY), null);
  }

  function writeFeedRecent(recent) {
    writeSessionValue(FEED_RECENT_KEY, mergeRecentMetadata(recent, null));
  }

  function readFeedRecentSignature(recent) {
    return recent
      .map((item) => [item.id, item.title, item.authorId, item.author, item.topicIds.join(","), item.topics.join(",")].join("~"))
      .join("|");
  }

  // Continuous reading: source priority is feed order, then discovered queue, then related links.
  // Ranking runs on the first non-empty source only, and lower scores win so a new article is
  // drawn from a different author and topic than the recent trail.
  function createPostNavigationController() {
    let currentId = "";
    let related = [];
    let queue = readFeedQueue();
    let cursor = readFeedCursor();
    let seen = new Set(readFeedSeen());
    let recent = readFeedRecent();
    let recentKey = readFeedRecentSignature(recent);
    let discovering = false;
    let discoveryError = "";
    let exhausted = false;
    let generation = 0;
    const listeners = new Set();
    let statusKey = "";

    const readStatus = () => {
      const trail = readPostTrail();
      let prev = null;
      if (currentId !== "") {
        const at = trail.lastIndexOf(currentId);
        const prevId = at > 0 ? trail[at - 1] : at === -1 && trail.length > 0 ? trail[trail.length - 1] : "";
        if (prevId !== "" && prevId !== currentId) prev = { id: prevId, title: "" };
      }
      let next = null;
      if (currentId !== "") {
        const picked = selectNextFeedCandidate({
          currentId: currentId,
          visited: readVisitedPostIds(currentId),
          seen: seen,
          recent: recent,
          feedOrder: readFeedOrder(),
          queue: queue,
          related: related,
        });
        if (picked !== null) next = { id: picked.candidate.id, title: picked.candidate.title, source: picked.source };
      }
      return {
        currentId: currentId,
        prev: prev,
        next: next,
        discovering: discovering,
        error: discoveryError,
        exhausted: exhausted,
      };
    };

    const publish = (force) => {
      const status = readStatus();
      const key = [
        status.currentId,
        status.prev === null ? "" : status.prev.id,
        status.next === null ? "" : status.next.id,
        status.discovering ? "1" : "0",
        status.error,
        status.exhausted ? "1" : "0",
      ].join("|");
      if (force !== true && key === statusKey) return;
      statusKey = key;
      for (const listener of Array.from(listeners)) {
        try {
          listener(status);
        } catch (error) {
          // One failing listener must not stop the other panels from refreshing.
        }
      }
    };

    const sync = (id, meta, links) => {
      const nextId = normalizeFeedId(id);
      const nextRelated = normalizeFeedDiscoveryLinks(links);
      related = nextRelated === null ? [] : nextRelated;
      if (nextId === "") {
        if (currentId !== "") {
          currentId = "";
          discoveryError = "";
          exhausted = false;
          publish(true);
        }
        return;
      }
      const changed = nextId !== currentId;
      currentId = nextId;
      if (changed) {
        pushPostTrail(nextId);
        discoveryError = "";
        exhausted = false;
        if (queue.some((item) => item.id === nextId)) {
          queue = queue.filter((item) => item.id !== nextId);
          writeFeedQueue(queue);
        }
      }
      if (!seen.has(nextId)) {
        const nextSeen = new Set(seen);
        nextSeen.add(nextId);
        seen = nextSeen;
        writeFeedSeen(seen);
      }
      const incoming = normalizeFeedCandidate(meta !== null && typeof meta === "object" ? { ...meta, id: nextId } : { id: nextId });
      if (incoming !== null) {
        const merged = mergeRecentMetadata(recent, incoming);
        const key = readFeedRecentSignature(merged);
        if (key !== recentKey) {
          recent = merged;
          recentKey = key;
          writeFeedRecent(recent);
        }
      }
      publish(changed);
    };

    const takeNext = () => {
      const status = readStatus();
      if (status.next === null) return null;
      const id = status.next.id;
      if (queue.some((item) => item.id === id)) {
        queue = queue.filter((item) => item.id !== id);
        writeFeedQueue(queue);
      }
      if (!seen.has(id)) {
        const nextSeen = new Set(seen);
        nextSeen.add(id);
        seen = nextSeen;
        writeFeedSeen(seen);
      }
      pushPostTrail(id);
      publish(true);
      return { id: id, title: status.next.title };
    };

    const discover = async () => {
      if (discovering || currentId === "") return;
      discovering = true;
      discoveryError = "";
      exhausted = false;
      generation += 1;
      const runGeneration = generation;
      const controller = new AbortController();
      publish(true);
      try {
        for (let pass = 0; pass < FEED_DISCOVERY_PASS_PAGES; pass += 1) {
          const page = await requestFeedDiscoveryPage(cursor, controller.signal);
          if (runGeneration !== generation) return;
          if (!page.ok) {
            discoveryError = page.message;
            break;
          }
          queue = mergeFeedQueue(queue, page.links, {
            currentId: currentId,
            visited: readVisitedPostIds(currentId),
            seen: seen,
            max: FEED_QUEUE_MAX,
          });
          writeFeedQueue(queue);
          cursor += FEED_DISCOVERY_PAGE_SIZE;
          writeFeedCursor(cursor);
          if (readStatus().next !== null) break;
        }
      } catch (error) {
        if (runGeneration !== generation) return;
        if (!isAbortError(error)) discoveryError = "信息流请求失败，请稍后重试";
      } finally {
        if (runGeneration === generation) {
          discovering = false;
          if (discoveryError === "") exhausted = readStatus().next === null;
          publish(true);
        }
      }
    };

    const subscribe = (listener) => {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    };

    return {
      sync: sync,
      readStatus: readStatus,
      takeNext: takeNext,
      discover: discover,
      subscribe: subscribe,
    };
  }

  function isTypingTarget(target) {
    if (!(target instanceof Element)) return false;
    if (target.isContentEditable) return true;
    return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
  }

  // Site alerts mount under body; the inner wrapper is the only reliable open marker.
  function isSiteAlertOpen() {
    return document.querySelector(".alert-container-wrapper .hb-cpt__alert-wrapper") !== null;
  }

  // Shadow DOM retargets events to the host, so check every node on the composed path.
  function eventHitsTypingTarget(event) {
    for (const node of event.composedPath()) {
      if (isTypingTarget(node)) return true;
    }
    return isTypingTarget(event.target);
  }

  // The site marks followed authors by class, aria-pressed, or label depending on version.
  function isFollowedAuthor(button) {
    if (!(button instanceof Element)) return false;
    if (button.classList.contains("followed")) return true;
    if (button.getAttribute("aria-pressed") === "true") return true;
    return /^(已关注|互相关注)$/.test((button.textContent || "").trim());
  }

  function watchPostPager(navigation) {
    if (!document.body) return;
    const host = document.createElement("div");
    host.id = PAGER_ID;
    host.hidden = true;
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = PAGER_CSS;
    const pager = document.createElement("nav");
    pager.className = "pager";
    pager.setAttribute("aria-label", "文章连读");
    const prevButton = document.createElement("button");
    prevButton.type = "button";
    prevButton.className = "btn btn--prev";
    prevButton.setAttribute("aria-label", "上一篇");
    prevButton.title = "上一篇";
    prevButton.innerHTML = PAGER_ICONS.prev;
    const nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.className = "btn btn--next";
    nextButton.setAttribute("aria-label", "下一篇");
    nextButton.title = "下一篇";
    nextButton.innerHTML = PAGER_ICONS.next;
    pager.append(prevButton, nextButton);
    shadow.append(style, pager);

    let currentId = "";
    let prevId = "";
    let navigating = false;
    let pendingAdvance = false;

    const go = (id) => {
      if (id === "" || navigating) return;
      navigating = true;
      navigateToPath(LINK_HREF_PREFIX + id);
      const toTop = () => window.scrollTo({ top: 0, behavior: "auto" });
      requestAnimationFrame(toTop);
      window.setTimeout(toTop, 120);
      window.setTimeout(() => { navigating = false; }, 900);
    };

    const advance = () => {
      if (navigating) return;
      const status = navigation.readStatus();
      if (status.next !== null && status.next.source !== "related") {
        const taken = navigation.takeNext();
        if (taken !== null) {
          go(taken.id);
          return;
        }
      }
      pendingAdvance = true;
      void navigation.discover();
    };

    const renderStatus = (status) => {
      prevId = status.prev === null ? "" : status.prev.id;
      prevButton.disabled = prevId === "";
      prevButton.title = status.prev === null ? "没有上一篇" : "上一篇（[）";
      prevButton.setAttribute("aria-label", prevButton.title);
      nextButton.disabled = status.discovering;
      if (status.discovering) {
        nextButton.title = "正在寻找下一篇…";
      } else if (status.next !== null) {
        nextButton.title = status.next.title === "" ? "下一篇（]）" : "下一篇（]）：" + status.next.title;
      } else if (status.error !== "") {
        nextButton.title = "没有找到下一篇：" + status.error + "（点击重试）";
      } else if (status.exhausted) {
        nextButton.title = "已到信息流末尾（点击重试）";
      } else {
        nextButton.title = "点击寻找下一篇（]）";
      }
      nextButton.setAttribute("aria-label", nextButton.title);
    };

    prevButton.addEventListener("click", () => go(prevId));
    nextButton.addEventListener("click", advance);

    navigation.subscribe((status) => {
      if (host.hidden) return;
      renderStatus(status);
      if (!pendingAdvance || status.discovering) return;
      pendingAdvance = false;
      const taken = navigation.takeNext();
      if (taken !== null) go(taken.id);
    });

    document.addEventListener("keydown", (event) => {
      if (host.hidden || document.body.classList.contains(READER_CLASS) || event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isSiteAlertOpen() || eventHitsTypingTarget(event)) return;
      if (event.key === "[") {
        const prev = navigation.readStatus().prev;
        if (prev === null) return;
        event.preventDefault();
        go(prev.id);
      } else if (event.key === "]") {
        event.preventDefault();
        advance();
      }
    });

    const sync = () => {
      const id = readPostLinkId();
      if (id === "") {
        host.hidden = true;
        host.remove();
        currentId = "";
        pendingAdvance = false;
        navigation.sync("", null, []);
        return;
      }
      if (host.parentNode !== document.body) document.body.append(host);
      if (id !== currentId) {
        currentId = id;
        host.hidden = false;
      }
      navigation.sync(id, readPostMeta(document), readRelatedPostLinks());
      renderStatus(navigation.readStatus());
    };

    registerPageSync(sync, 200, [PAGE_ROUTE.ARTICLE], "article");
    registerPageSync(recordFeedOrder, 1000, [PAGE_ROUTE.FEED], "feed");
    sync();
    recordFeedOrder();
  }

  function readReaderScroll(id) {
    if (id === "") return 0;
    const value = Number(sessionStore.read(READER_SCROLL_KEY + id));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }

  function writeReaderScroll(id, index) {
    if (id === "") return;
    sessionStore.write(READER_SCROLL_KEY + id, String(index));
  }

  function readReaderRatio(id) {
    if (id === "") return -1;
    const stored = sessionStore.read(READER_RATIO_KEY + id);
    if (stored === null) return -1;
    const value = Number(stored);
    return Number.isFinite(value) && value >= 0 && value <= 1 ? value : -1;
  }

  function writeReaderRatio(id, ratio) {
    if (id === "") return;
    sessionStore.write(READER_RATIO_KEY + id, ratio.toFixed(4));
  }

  function ensureReaderStyle() {
    ensureStyleElement(READER_STYLE_ID, READER_CSS);
  }

  // 沉浸阅读：只克隆正文排版，评论与按钮仍指向站点原生节点。
  function watchReader(navigation) {
    if (!document.body) return;
    let host = null;
    let backdrop = null;
    let lightbox = null;
    let closeSheetButton = null;
    let sheetStatusTimer = 0;
    let favourPanel = null;
    let favourButton = null;
    let spacingPanel = null;
    let spacingButton = null;
    let spacingInput = null;
    let articleId = "";
    let dismissedArticleId = "";
    let signature = "";
    let activeIndex = 0;
    let pageCount = 0;
    let toastTimer = 0;
    let coverIndex = 0;
    let coverTotal = 0;
    let observer = null;
    let scrollRaf = 0;
    let restoring = false;
    let lastActionSyncAt = 0;
    let progressScroll = null;
    let progressCurrent = null;
    let progressFill = null;
    let lastProgressPercent = -1;
    let ratioSaveTimer = 0;
    let pendingRatio = null;
    let sourceCache = null;
    const suspendedEmbeds = new Map();
    let nativeActionArticle = null;
    let nativeActionBox = null;
    let nativeFavourButton = null;
    let linkStateController = null;
    let commentLoadController = null;
    let favourLoadController = null;
    let readerGeneration = 0;
    let linkState = null;
    let linkStatePromise = null;
    let actionBusy = false;
    let cyDialog = null;
    let cyTextarea = null;
    let cySubmit = null;
    let cyStatus = null;
    let cyBusy = false;
    let commentPanel = null;
    let commentPanelList = null;
    let commentPanelStatus = null;
    let commentPanelMeta = null;
    let commentPanelMore = null;
    let commentPanelClose = null;
    let commentOpenToken = 0;
    let commentState = createCommentState();
    let readerPendingAdvance = false;

    function createCommentState() {
      return { items: [], page: 0, total: 0, loading: false, error: "", hasMore: false, loaded: false, seq: 0 };
    }

    const showToast = (message) => {
      let toast = host?.querySelector(".hbu-reader-toast") || null;
      if (toast === null) {
        toast = document.createElement("div");
        toast.className = "hbu-reader-toast hbu-reader-toast--fixed";
        toast.setAttribute("aria-live", "polite");
        document.body.append(toast);
      }
      toast.textContent = message;
      toast.dataset.show = "true";
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => {
        toast.dataset.show = "false";
        if (toast.parentElement === document.body) window.setTimeout(() => toast.remove(), 220);
      }, 1400);
    };

    const copyText = async (text) => {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      try {
        if (navigator.clipboard !== undefined && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch (error) {
        // Fall through to the selection-based path when clipboard permission is unavailable.
      }
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.top = "0";
      area.style.left = "0";
      area.style.width = "1px";
      area.style.height = "1px";
      area.style.padding = "0";
      area.style.border = "0";
      area.style.opacity = "0";
      area.style.pointerEvents = "none";
      document.body.append(area);
      area.select();
      area.setSelectionRange(0, area.value.length);
      let copied = false;
      try {
        copied = document.execCommand("copy");
      } catch (error) {
        copied = false;
      }
      area.remove();
      active?.focus({ preventScroll: true });
      return copied;
    };

    const shareArticle = async (data) => {
      const url = "https://www.xiaoheihe.cn/app/bbs/link/" + articleId;
      const title = data.title || document.title || "小黑盒帖子";
      if (typeof navigator.share === "function") {
        const payload = { title: title, text: title, url: url };
        const shareable = typeof navigator.canShare !== "function" || navigator.canShare(payload);
        if (shareable) {
          try {
            await navigator.share(payload);
            return;
          } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") return;
          }
        }
      }
      const copied = await copyText(url);
      showToast(copied ? "链接已复制" : "复制失败，请手动复制链接");
    };

    const articleActionBox = () => {
      if (nativeActionBox !== null && nativeActionBox.isConnected) return nativeActionBox;
      const article = sourceCache?.article?.isConnected === true
        ? sourceCache.article
        : document.querySelector("#page-bbs-link .hb-bbs-image-text, #page-bbs-link .hb-bbs-post");
      if (article !== nativeActionArticle) {
        nativeActionArticle = article;
        nativeActionBox = null;
        nativeFavourButton = null;
      }
      nativeActionBox = Array.from(article?.querySelectorAll(".link-reply__operation-box") || [])
        .find((box) => box.closest("[data-comment-id]") === null) || null;
      return nativeActionBox;
    };

    const nativeLike = () => articleActionBox()?.querySelector("button:first-child") || null;

    const nativeFavour = () => {
      if (nativeFavourButton !== null && nativeFavourButton.isConnected) return nativeFavourButton;
      nativeFavourButton = document.querySelector("#page-bbs-link .hb-cpt__favour-btn");
      return nativeFavourButton;
    };

    const readCounts = () => {
      const values = Array.from(articleActionBox()?.querySelectorAll(".link-reply__operation-desc") || [])
        .map((node) => (node.textContent || "").trim());
      return { like: values[0] || "0", favour: values[1] || "0", comment: values[2] || "0" };
    };

    const formatActionCount = (value) => {
      const count = Math.max(0, Number(value) || 0);
      if (count >= 100000000) return (count / 100000000).toFixed(1).replace(/\.0$/, "") + "亿";
      if (count >= 10000) return (count / 10000).toFixed(1).replace(/\.0$/, "") + "万";
      return String(count);
    };

    const postReaderApi = async (path, body) => {
      const params = createApiParams(path);
      if (path === COMMENT_CREATE_API_PATH) {
        params._rnd = await createCommentRnd(params.nonce, params._time);
      }
      const query = new URLSearchParams({ ...params, heybox_id: getHeyboxId(), target: "heybox_app" });
      const response = await fetchWithTimeout("https://api.xiaoheihe.cn" + path + "?" + query.toString(), {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams(body).toString(),
      });
      if (!response.ok) throw new Error("接口返回 HTTP " + response.status);
      const data = await response.json();
      if (data.status === "login") throw new Error("请先登录小黑盒");
      if (data.status !== "ok") throw new Error(data.msg || "操作失败");
      return data.result;
    };

    const fetchFavourFolders = async (signal) => {
      if (getHeyboxId() === "") throw new Error("请先登录小黑盒");
      const path = "/bbs/app/profile/fav/folders";
      const query = new URLSearchParams({ ...createApiParams(path), heybox_id: getHeyboxId(), target: "heybox_app" });
      const response = await fetchWithTimeout("https://api.xiaoheihe.cn" + path + "?" + query.toString(), {
        credentials: "include",
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: signal,
      });
      if (!response.ok) throw new Error("接口返回 HTTP " + response.status);
      const data = await response.json();
      if (data.status === "login") throw new Error("请先登录小黑盒");
      if (data.status !== "ok") throw new Error(data.msg || "获取收藏夹失败");
      const folders = data.result && Array.isArray(data.result.folders) ? data.result.folders : [];
      return folders;
    };

    const loadLinkState = async () => {
      if (articleId === "") return null;
      if (linkStatePromise !== null) return linkStatePromise;
      const targetId = articleId;
      const controller = new AbortController();
      linkStateController = controller;
      linkStatePromise = (async () => {
        try {
          const page = await fetchRailPage(targetId, 1, { signal: controller.signal });
          if (articleId !== targetId || linkStateController !== controller) return null;
          linkState = page.link;
          syncActionStates();
          return linkState;
        } catch (error) {
          return null;
        } finally {
          if (linkStateController === controller) {
            linkStateController = null;
            linkStatePromise = null;
          }
        }
      })();
      return linkStatePromise;
    };

    const toggleLike = async () => {
      if (actionBusy || articleId === "") return;
      if (getHeyboxId() === "") {
        showToast("请先登录小黑盒");
        return;
      }
      actionBusy = true;
      const targetId = articleId;
      const generation = readerGeneration;
      try {
        const counts = readCounts();
        const current = linkState === null ? await loadLinkState() : linkState;
        if (articleId !== targetId || readerGeneration !== generation) return;
        const on = current !== null && current.isAward;
        const base = current === null ? parseCompactCount(counts.like) : current.awardCount;
        await postReaderApi("/bbs/app/profile/award/link", {
          link_id: targetId,
          award_type: on ? 0 : 1,
        });
        if (articleId !== targetId || readerGeneration !== generation) return;
        linkState = {
          ...(current || {
            isAward: false,
            isFavour: false,
            awardCount: base,
            favourCount: parseCompactCount(counts.favour),
            commentCount: parseCompactCount(counts.comment),
          }),
          isAward: !on,
          awardCount: Math.max(0, base + (on ? -1 : 1)),
        };
        syncActionStates();
        showToast(on ? "已取消点赞" : "已点赞");
      } catch (error) {
        showToast(error instanceof Error ? error.message : "点赞失败");
      } finally {
        actionBusy = false;
      }
    };

    const toggleFavour = async (folderId) => {
      if (actionBusy || articleId === "") return;
      actionBusy = true;
      const targetId = articleId;
      const generation = readerGeneration;
      try {
        const counts = readCounts();
        const current = linkState === null ? await loadLinkState() : linkState;
        if (articleId !== targetId || readerGeneration !== generation) return;
        const on = current !== null && current.isFavour;
        const base = current === null ? parseCompactCount(counts.favour) : current.favourCount;
        const userId = getHeyboxId();
        if (userId === "") throw new Error("请先登录小黑盒");
        await postReaderApi("/bbs/app/link/favour", {
          favour_type: on ? 2 : 1,
          link_id: targetId,
          userid: userId,
          folder_id: on ? "" : String(folderId || ""),
        });
        if (articleId !== targetId || readerGeneration !== generation) return;
        linkState = {
          ...(current || {
            isAward: false,
            isFavour: false,
            awardCount: parseCompactCount(counts.like),
            favourCount: base,
            commentCount: parseCompactCount(counts.comment),
          }),
          isFavour: !on,
          favourCount: Math.max(0, base + (on ? -1 : 1)),
        };
        closeFavourMenu();
        syncActionStates();
        showToast(on ? "已取消收藏" : "已收藏");
      } catch (error) {
        showToast(error instanceof Error ? error.message : "收藏失败");
      } finally {
        actionBusy = false;
      }
    };

    const syncActionStates = () => {
      if (host === null) return;
      const like = nativeLike();
      const favour = nativeFavour();
      const counts = linkState === null
        ? readCounts()
        : {
          like: formatActionCount(linkState.awardCount),
          favour: formatActionCount(linkState.favourCount),
          comment: formatActionCount(linkState.commentCount),
        };
      const likeNode = host.querySelector('[data-action="like"]');
      const favourNode = host.querySelector('[data-action="favour"]');
      const commentNode = host.querySelector('[data-action="comment"]');
      if (likeNode !== null) {
        const on = linkState === null
          ? like !== null && (like.getAttribute("aria-pressed") === "true" || like.classList.contains("active"))
          : linkState.isAward;
        likeNode.setAttribute("aria-pressed", String(on));
        const markup = (on ? READER_ICONS.likeOn : READER_ICONS.like) + '<span class="hbu-reader-action-count">' + counts.like + "</span>";
        if (likeNode.innerHTML !== markup) likeNode.innerHTML = markup;
      }
      if (favourNode !== null) {
        const on = linkState === null
          ? favour !== null && (favour.getAttribute("aria-pressed") === "true" || favour.classList.contains("active"))
          : linkState.isFavour;
        favourNode.setAttribute("aria-pressed", String(on));
        const markup = (on ? READER_ICONS.starOn : READER_ICONS.star) + '<span class="hbu-reader-action-count">' + counts.favour + "</span>";
        if (favourNode.innerHTML !== markup) favourNode.innerHTML = markup;
      }
      if (commentNode !== null) {
        const markup = READER_ICONS.comment + '<span class="hbu-reader-action-count">' + counts.comment + "</span>";
        if (commentNode.innerHTML !== markup) commentNode.innerHTML = markup;
      }
      const cyNode = host.querySelector('[data-action="cy"]');
      if (cyNode !== null) {
        const markup = '<span class="hbu-reader-cy-label">CY</span>';
        if (cyNode.innerHTML !== markup) cyNode.innerHTML = markup;
      }
      for (const stat of host.querySelectorAll("[data-stat]")) {
        const valueNode = stat.querySelector("b");
        const key = stat.dataset.stat;
        if (valueNode !== null && key !== undefined && counts[key] !== undefined && valueNode.textContent !== counts[key]) {
          valueNode.textContent = counts[key];
        }
      }
      // The site replaces the header button after a follow change, so re-query every sync.
      const nativeFollowButton = document.querySelector("#page-bbs-link .link-user__follow-btn");
      const on = isFollowedAuthor(nativeFollowButton);
      for (const followNode of host.querySelectorAll(".hbu-reader-follow")) {
        followNode.setAttribute("aria-pressed", String(on));
        if (followNode.textContent !== (on ? "已关注" : "关注")) followNode.textContent = on ? "已关注" : "关注";
      }
    };

    const clickNative = (selector) => {
      const node = document.querySelector("#page-bbs-link " + selector);
      if (node instanceof HTMLElement) node.click();
    };

    // Delegate follow toggling to the site button, then resync once its request settles.
    const toggleFollowAuthor = () => {
      clickNative(".link-user__follow-btn");
      window.setTimeout(syncActionStates, 400);
      window.setTimeout(syncActionStates, 1200);
    };

    const closeFavourMenu = () => {
      favourLoadController?.abort();
      favourLoadController = null;
      if (favourPanel === null) return;
      favourPanel.hidden = true;
      favourButton?.setAttribute("aria-expanded", "false");
    };
    document.addEventListener("pointerdown", (event) => {
      if (favourPanel === null || favourPanel.hidden) return;
      if (favourPanel.contains(event.target) || favourButton?.contains(event.target)) return;
      closeFavourMenu();
    }, true);

    const closeSpacingMenu = () => {
      if (spacingPanel === null) return;
      spacingPanel.hidden = true;
      spacingButton?.setAttribute("aria-expanded", "false");
    };
    document.addEventListener("pointerdown", (event) => {
      if (spacingPanel === null || spacingPanel.hidden) return;
      if (spacingPanel.contains(event.target) || spacingButton?.contains(event.target)) return;
      closeSpacingMenu();
    }, true);

    const commitSpacingInput = () => {
      if (spacingInput === null) return;
      const next = parseReaderLineHeightInput(spacingInput.value);
      const value = next === null ? readReaderLineHeight() : setReaderLineHeightPreference(next);
      spacingInput.value = String(value);
      syncNumberInput(readerLineHeightInput, value);
    };

    const openSpacingMenu = (rail, button) => {
      if (spacingPanel !== null && !spacingPanel.hidden) {
        closeSpacingMenu();
        button.focus({ preventScroll: true });
        return;
      }
      closeFavourMenu();
      if (spacingPanel === null) {
        const panel = document.createElement("div");
        panel.className = "hbu-reader-spacing-menu";
        panel.hidden = true;
        panel.setAttribute("role", "group");
        panel.setAttribute("aria-label", "正文行距");
        const label = document.createElement("div");
        label.className = "hbu-reader-spacing-label";
        label.textContent = "正文行距";
        const row = document.createElement("div");
        row.className = "hbu-reader-spacing-row";
        const input = document.createElement("input");
        input.type = "number";
        input.min = String(READER_LINE_HEIGHT_MIN);
        input.max = String(READER_LINE_HEIGHT_MAX);
        input.step = String(READER_LINE_HEIGHT_STEP);
        input.inputMode = "decimal";
        input.setAttribute("aria-label", "正文行距倍数");
        input.title = "正文行距 " + READER_LINE_HEIGHT_MIN + " - " + READER_LINE_HEIGHT_MAX + " 倍";
        const unit = document.createElement("span");
        unit.className = "hbu-reader-spacing-unit";
        unit.textContent = "倍";
        const reset = document.createElement("button");
        reset.type = "button";
        reset.className = "hbu-reader-spacing-reset";
        reset.textContent = "默认";
        reset.title = "恢复默认行距 " + READER_LINE_HEIGHT_DEFAULT + " 倍";
        reset.addEventListener("click", () => {
          const value = setReaderLineHeightPreference(READER_LINE_HEIGHT_DEFAULT);
          if (spacingInput !== null) spacingInput.value = String(value);
          syncNumberInput(readerLineHeightInput, value);
        });
        row.append(input, unit, reset);
        panel.append(label, row);
        bindNumberInput(input, commitSpacingInput);
        spacingPanel = panel;
        spacingInput = input;
      }
      spacingButton = button;
      if (spacingPanel.parentNode !== rail) rail.append(spacingPanel);
      spacingInput.value = String(readReaderLineHeight());
      spacingPanel.hidden = false;
      button.setAttribute("aria-expanded", "true");
      spacingInput.focus({ preventScroll: true });
    };

    const openFavourMenu = async (rail, button) => {
      if (favourPanel !== null && !favourPanel.hidden) {
        closeFavourMenu();
        return;
      }
      closeSpacingMenu();
      const targetId = articleId;
      const generation = readerGeneration;
      if (linkState === null) await loadLinkState();
      if (articleId !== targetId || readerGeneration !== generation || !rail.isConnected || host === null) return;
      if (linkState !== null && linkState.isFavour) {
        void toggleFavour();
        return;
      }
      if (getHeyboxId() === "") {
        showToast("请先登录小黑盒");
        return;
      }
      if (favourPanel === null) {
        favourPanel = document.createElement("div");
        favourPanel.className = "hbu-reader-favour-menu";
        favourPanel.setAttribute("role", "menu");
        favourPanel.setAttribute("aria-label", "选择收藏夹");
        rail.append(favourPanel);
      }
      favourButton = button;
      favourPanel.hidden = false;
      button.setAttribute("aria-expanded", "true");
      const status = document.createElement("div");
      status.className = "hbu-reader-favour-empty";
      status.textContent = "正在读取收藏夹…";
      favourPanel.replaceChildren(status);
      favourLoadController?.abort();
      const controller = new AbortController();
      favourLoadController = controller;
      try {
        const folders = await fetchFavourFolders(controller.signal);
        if (favourPanel === null || favourLoadController !== controller) return;
        favourLoadController = null;
        if (folders.length === 0) {
          const empty = document.createElement("div");
          empty.className = "hbu-reader-favour-empty";
          empty.textContent = "暂无收藏夹，请先在站点创建";
          favourPanel.replaceChildren(empty);
          return;
        }
        favourPanel.replaceChildren(...folders.map((folder) => {
          const proxy = document.createElement("button");
          proxy.type = "button";
          proxy.setAttribute("role", "menuitem");
          proxy.textContent = String(folder.name || folder.folder_name || "收藏夹");
          proxy.title = proxy.textContent;
          proxy.addEventListener("click", () => {
            void toggleFavour(folder.id);
          });
          return proxy;
        }));
      } catch (error) {
        if (isAbortError(error) || favourPanel === null || favourLoadController !== controller) return;
        favourLoadController = null;
        const empty = document.createElement("div");
        empty.className = "hbu-reader-favour-empty";
        empty.textContent = error instanceof Error ? error.message : "获取收藏夹失败";
        favourPanel.replaceChildren(empty);
      } finally {
        if (favourLoadController === controller) favourLoadController = null;
      }
    };

    const closeCyDialog = () => {
      if (cyDialog === null) return;
      cyDialog.remove();
      cyDialog = null;
      cyTextarea = null;
      cySubmit = null;
      cyStatus = null;
      if (host !== null && !document.body.classList.contains(READER_COMMENT_CLASS)) {
        host.querySelector('[data-action="cy"]')?.focus({ preventScroll: true });
      }
    };

    const submitCy = async () => {
      if (cyBusy || cyTextarea === null || cySubmit === null || cyStatus === null) return;
      const text = cyTextarea.value.trim();
      if (text === "") {
        cyStatus.textContent = "请输入 CY 内容";
        cyTextarea.focus();
        return;
      }
      cyBusy = true;
      cySubmit.disabled = true;
      cySubmit.textContent = "发布中…";
      cyStatus.textContent = "";
      const targetId = articleId;
      const generation = readerGeneration;
      try {
        await postReaderApi(COMMENT_CREATE_API_PATH, {
          is_cy: 1,
          link_id: targetId,
          reply_id: "-1",
          root_id: "-1",
          text: text,
        });
        if (articleId !== targetId || readerGeneration !== generation) return;
        if (linkState !== null) linkState.commentCount += 1;
        clearRailPageCache(targetId);
        showToast("CY 已发布");
        closeCyDialog();
        syncActionStates();
      } catch (error) {
        if (cyStatus !== null) cyStatus.textContent = error instanceof Error ? error.message : "CY 发布失败";
      } finally {
        cyBusy = false;
        if (cySubmit !== null) {
          cySubmit.disabled = false;
          cySubmit.textContent = "发布";
        }
      }
    };

    const openCyDialog = () => {
      if (host === null) return;
      closeFavourMenu();
      if (cyDialog !== null) {
        cyDialog.hidden = false;
        cyTextarea?.focus({ preventScroll: true });
        return;
      }
      const dialog = document.createElement("div");
      dialog.className = "hbu-reader-cy-dialog";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-label", "发布 CY");
      const card = document.createElement("div");
      card.className = "hbu-reader-cy-card";
      const head = document.createElement("div");
      head.className = "hbu-reader-cy-head";
      const title = document.createElement("span");
      title.textContent = "发布 CY";
      const close = document.createElement("button");
      close.type = "button";
      close.className = "hbu-reader-cy-close";
      close.setAttribute("aria-label", "关闭 CY 输入框");
      close.innerHTML = READER_ICONS.close;
      close.addEventListener("click", closeCyDialog);
      head.append(title, close);
      const textarea = document.createElement("textarea");
      textarea.className = "hbu-reader-cy-text";
      textarea.maxLength = 1000;
      textarea.placeholder = "写下这次插眼的内容…";
      textarea.setAttribute("aria-label", "CY 内容");
      const status = document.createElement("div");
      status.className = "hbu-reader-cy-status";
      status.setAttribute("role", "status");
      const actions = document.createElement("div");
      actions.className = "hbu-reader-cy-actions";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "取消";
      cancel.addEventListener("click", closeCyDialog);
      const submit = document.createElement("button");
      submit.type = "button";
      submit.dataset.primary = "true";
      submit.textContent = "发布";
      submit.addEventListener("click", () => void submitCy());
      actions.append(cancel, submit);
      card.append(head, textarea, status, actions);
      dialog.append(card);
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) closeCyDialog();
      });
      dialog.addEventListener("keydown", (event) => {
        if (event.key !== "Tab") return;
        const items = Array.from(dialog.querySelectorAll("button, textarea"))
          .filter((node) => node.getBoundingClientRect().width > 0);
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus({ preventScroll: true });
        }
      });
      cyDialog = dialog;
      cyTextarea = textarea;
      cySubmit = submit;
      cyStatus = status;
      host.append(dialog);
      textarea.focus({ preventScroll: true });
    };

    const fillReaderCommentBody = (node, segments) => {
      if (segments.length === 0) {
        node.textContent = "（图片或表情评论）";
        return;
      }
      for (const segment of segments) {
        if (segment.type === "text") {
          node.append(document.createTextNode(segment.text));
          continue;
        }
        if (segment.type === "emoji") {
          const emoji = document.createElement("span");
          emoji.className = "hbu-reader-comments-emoji";
          emoji.setAttribute("role", "img");
          emoji.setAttribute("aria-label", "表情");
          const column = (Number(segment.id) % 10) - 1;
          const row = Math.floor(Number(segment.id) / 10) - 1;
          emoji.style.backgroundImage = 'url("' + RAIL_EMOJI_SPRITE + '")';
          emoji.style.backgroundPosition = "-" + column * RAIL_EMOJI_CELL + "px -" + row * RAIL_EMOJI_CELL + "px";
          node.append(emoji);
          continue;
        }
        const image = document.createElement("img");
        image.alt = "";
        image.loading = "lazy";
        image.referrerPolicy = "no-referrer";
        image.src = segment.src;
        node.append(image);
      }
    };

    const createReaderCommentItem = (comment) => {
      const item = document.createElement("li");
      item.className = "hbu-reader-comments-item";
      item.setAttribute("role", "listitem");
      const avatar = document.createElement("img");
      avatar.className = "hbu-reader-comments-avatar";
      avatar.alt = "";
      avatar.loading = "lazy";
      avatar.referrerPolicy = "no-referrer";
      if (comment.avatar !== "") avatar.src = comment.avatar;
      const main = document.createElement("div");
      main.className = "hbu-reader-comments-main";
      const who = document.createElement("div");
      who.className = "hbu-reader-comments-who";
      const name = document.createElement("span");
      name.className = "hbu-reader-comments-name";
      name.textContent = comment.name;
      who.append(name);
      if (comment.createAt > 0) {
        const time = document.createElement("span");
        time.className = "hbu-reader-comments-time";
        time.textContent = formatRailAge(comment.createAt);
        who.append(time);
      }
      const text = document.createElement("p");
      text.className = "hbu-reader-comments-text";
      fillReaderCommentBody(text, comment.body);
      main.append(who, text);
      if (comment.likes > 0 || comment.replies > 0) {
        const meta = document.createElement("div");
        meta.className = "hbu-reader-comments-meta";
        if (comment.likes > 0) {
          const likes = document.createElement("span");
          likes.textContent = "赞 " + comment.likes;
          meta.append(likes);
        }
        if (comment.replies > 0) {
          const replies = document.createElement("span");
          replies.textContent = comment.replies + " 条回复";
          meta.append(replies);
        }
        main.append(meta);
      }
      const quotes = Array.isArray(comment.quotes) ? comment.quotes : [];
      for (const quote of quotes) {
        const node = document.createElement("div");
        node.className = "hbu-reader-comments-quote";
        const author = document.createElement("b");
        author.textContent = quote.name + "：";
        node.append(author);
        fillReaderCommentBody(node, quote.body);
        main.append(node);
      }
      item.append(avatar, main);
      return item;
    };

    const renderReaderComments = () => {
      if (commentPanel === null) return;
      const hideCy = readHideCyPreference();
      const visible = commentState.items.filter((item) => !hideCy || item.isCy !== true);
      const hiddenCy = commentState.items.length - visible.length;
      const meta = [];
      if (commentState.total > 0) meta.push("共 " + commentState.total + " 条");
      if (visible.length > 0) meta.push("已加载 " + visible.length + " 条");
      if (hiddenCy > 0) meta.push("已屏蔽 " + hiddenCy + " 条 CY");
      if (commentPanelMeta !== null) commentPanelMeta.textContent = meta.join(" · ");
      if (commentPanelList !== null) {
        commentPanelList.replaceChildren(...visible.map(createReaderCommentItem));
        commentPanelList.hidden = visible.length === 0;
      }
      if (commentPanelStatus !== null) {
        if (commentState.error !== "") {
          commentPanelStatus.hidden = false;
          commentPanelStatus.dataset.retry = "true";
          commentPanelStatus.textContent = commentState.error + "，点击重试";
        } else if (commentState.loading && commentState.items.length === 0) {
          commentPanelStatus.hidden = false;
          commentPanelStatus.dataset.retry = "false";
          commentPanelStatus.textContent = "正在加载评论…";
        } else if (!commentState.loaded) {
          commentPanelStatus.hidden = false;
          commentPanelStatus.dataset.retry = "false";
          commentPanelStatus.textContent = "正在准备评论…";
        } else if (visible.length === 0) {
          commentPanelStatus.hidden = false;
          commentPanelStatus.dataset.retry = "false";
          commentPanelStatus.textContent = hiddenCy > 0 ? "已屏蔽全部 " + hiddenCy + " 条 CY 评论" : "这条帖子还没有评论";
        } else {
          commentPanelStatus.hidden = true;
          commentPanelStatus.dataset.retry = "false";
        }
      }
      if (commentPanelMore !== null) {
        commentPanelMore.hidden = !commentState.hasMore;
        commentPanelMore.disabled = commentState.loading;
        commentPanelMore.textContent = commentState.loading ? "加载中…" : "加载更多";
      }
    };

    const loadReaderComments = async (page) => {
      if (commentState.loading) return;
      const seq = ++commentState.seq;
      commentLoadController?.abort();
      const controller = new AbortController();
      commentLoadController = controller;
      commentState.loading = true;
      commentState.error = "";
      if (page === 1) {
        commentState.items = [];
        commentState.page = 0;
        commentState.total = 0;
        commentState.hasMore = false;
        commentState.loaded = false;
      }
      renderReaderComments();
      try {
        const data = await fetchRailPage(articleId, page, { signal: controller.signal });
        if (seq !== commentState.seq || commentLoadController !== controller) return;
        const seen = new Set(commentState.items.map((item) => item.id));
        const fresh = data.items.filter((item) => item.id === "" || !seen.has(item.id));
        commentState.items = page === 1 ? fresh : commentState.items.concat(fresh);
        commentState.page = page;
        commentState.total = data.total > 0 ? data.total : Math.max(commentState.total, commentState.items.length);
        commentState.hasMore = data.items.length >= RAIL_PAGE_SIZE;
        commentState.loaded = true;
        if (linkState !== null && data.total > 0) linkState.commentCount = data.total;
        syncActionStates();
      } catch (error) {
        if (isAbortError(error)) return;
        if (seq !== commentState.seq || commentLoadController !== controller) return;
        const message = error instanceof Error ? error.message : "评论加载失败";
        commentState.error = /captcha|show_captcha/i.test(message) ? "评论需要验证，请稍后重试" : "评论加载失败：" + message;
        commentState.hasMore = false;
      } finally {
        if (seq === commentState.seq && commentLoadController === controller) {
          commentState.loading = false;
          commentLoadController = null;
          renderReaderComments();
        }
      }
    };

    const trapCommentPanelTab = (event) => {
      if (event.key !== "Tab" || commentPanel === null) return;
      const items = Array.from(commentPanel.querySelectorAll("button, a[href]"))
        .filter((node) => node.getBoundingClientRect().width > 0 && !node.hasAttribute("disabled"));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !commentPanel.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const ensureCommentPanel = () => {
      if (commentPanel !== null) {
        if (commentPanel.isConnected) return commentPanel;
        commentPanel = null;
        commentPanelList = null;
        commentPanelStatus = null;
        commentPanelMeta = null;
        commentPanelMore = null;
        commentPanelClose = null;
      }
      const panel = document.createElement("section");
      panel.className = "hbu-reader-comments-panel";
      panel.hidden = true;
      const scrim = document.createElement("div");
      scrim.className = "hbu-reader-comments-scrim";
      const sheet = document.createElement("div");
      sheet.className = "hbu-reader-comments-sheet";
      sheet.setAttribute("role", "dialog");
      sheet.setAttribute("aria-modal", "true");
      sheet.setAttribute("aria-label", "评论");
      const head = document.createElement("div");
      head.className = "hbu-reader-comments-head";
      const heading = document.createElement("div");
      heading.className = "hbu-reader-comments-heading";
      const title = document.createElement("b");
      title.textContent = "评论";
      const meta = document.createElement("span");
      meta.textContent = "";
      heading.append(title, meta);
      const close = document.createElement("button");
      close.type = "button";
      close.className = "hbu-reader-comments-close";
      close.setAttribute("aria-label", "关闭评论");
      close.innerHTML = READER_ICONS.close;
      head.append(heading, close);
      const body = document.createElement("div");
      body.className = "hbu-reader-comments-body";
      const list = document.createElement("ol");
      list.className = "hbu-reader-comments-list";
      const status = document.createElement("div");
      status.className = "hbu-reader-comments-status";
      status.setAttribute("role", "status");
      body.append(list, status);
      const foot = document.createElement("div");
      foot.className = "hbu-reader-comments-foot";
      const more = document.createElement("button");
      more.type = "button";
      more.textContent = "加载更多";
      const openLink = document.createElement("a");
      openLink.textContent = "打开帖子";
      openLink.href = LINK_HREF_PREFIX + articleId;
      openLink.target = "_blank";
      openLink.rel = "noopener noreferrer";
      foot.append(more, openLink);
      sheet.append(head, body, foot);
      panel.append(scrim, sheet);
      commentPanel = panel;
      commentPanelList = list;
      commentPanelStatus = status;
      commentPanelMeta = meta;
      commentPanelMore = more;
      commentPanelClose = close;
      close.addEventListener("click", closeComments);
      scrim.addEventListener("click", closeComments);
      more.addEventListener("click", () => {
        if (!commentState.loading) void loadReaderComments(commentState.page + 1);
      });
      status.addEventListener("click", () => {
        if (status.dataset.retry !== "true" || commentState.loading) return;
        void loadReaderComments(commentState.page > 0 ? commentState.page + 1 : 1);
      });
      sheet.addEventListener("keydown", trapCommentPanelTab);
      document.body.append(panel);
      return panel;
    };

    const openFallbackComments = () => {
      if (host === null) return;
      const panel = ensureCommentPanel();
      panel.hidden = false;
      host.inert = true;
      renderReaderComments();
      commentPanelClose?.focus({ preventScroll: true });
      if (!commentState.loaded && !commentState.loading) void loadReaderComments(1);
    };

    const openNativeComments = (sheet) => {
      if (commentPanel !== null) commentPanel.hidden = true;
      document.body.classList.add(READER_COMMENT_CLASS);
      host.inert = true;
      closeSheetButton?.focus({ preventScroll: true });
      watchSheetComments();
    };

    const openComments = async () => {
      if (host === null) return;
      closeFavourMenu();
      closeCyDialog();
      if (document.body.classList.contains(READER_COMMENT_CLASS) || (commentPanel !== null && !commentPanel.hidden)) {
        closeComments();
        return;
      }
      const token = ++commentOpenToken;
      const sheet = getCommentsSheet();
      if (sheet !== null) {
        openNativeComments(sheet);
        return;
      }
      showToast("正在加载评论…");
      const deadline = Date.now() + 1400;
      while (Date.now() < deadline && token === commentOpenToken) {
        await new Promise((resolve) => window.setTimeout(resolve, 100));
        const late = getCommentsSheet();
        if (late !== null) {
          openNativeComments(late);
          return;
        }
      }
      if (token === commentOpenToken) openFallbackComments();
    };

    const resetReaderComments = () => {
      commentOpenToken += 1;
      commentLoadController?.abort();
      commentLoadController = null;
      document.body.classList.remove(READER_COMMENT_CLASS);
      if (host !== null) host.inert = false;
      if (commentPanel !== null) {
        commentPanel.hidden = true;
        const link = commentPanel.querySelector(".hbu-reader-comments-foot a");
        if (link !== null) link.href = LINK_HREF_PREFIX + articleId;
      }
      commentState = createCommentState();
      clearSheetStatus();
    };

    document.addEventListener(HIDE_CY_EVENT, () => {
      if (commentPanel !== null && !commentPanel.hidden) renderReaderComments();
    });

    const clearSheetStatus = () => {
      window.clearTimeout(sheetStatusTimer);
      document.querySelectorAll(".hbu-reader-sheet-status").forEach((node) => node.remove());
    };

    const watchSheetComments = () => {
      clearSheetStatus();
      const sheet = document.querySelector("#page-bbs-link .link-comment");
      if (sheet === null) return;
      if (sheet.querySelector("[data-comment-id]") !== null) return;
      const list = sheet.querySelector(".link-comment__list");
      let attempts = 0;
      const status = document.createElement("div");
      status.className = "hbu-reader-sheet-status";
      status.textContent = "正在加载评论…";
      sheet.append(status);
      const retry = () => {
        status.classList.remove("retry");
        status.textContent = "正在加载评论…";
        attempts = 0;
        if (list instanceof HTMLElement) {
          list.scrollTop += 1;
          list.dispatchEvent(new Event("scroll"));
        }
        window.dispatchEvent(new Event("resize"));
        scheduleSheetCheck();
      };
      const scheduleSheetCheck = () => {
        window.clearTimeout(sheetStatusTimer);
        sheetStatusTimer = window.setTimeout(() => {
          if (!document.body.classList.contains(READER_COMMENT_CLASS)) {
            status.remove();
            return;
          }
          if (sheet.querySelector("[data-comment-id]") !== null) {
            status.remove();
            return;
          }
          attempts += 1;
          if (attempts < 8) {
            scheduleSheetCheck();
            return;
          }
          if (sheet.querySelector(".hb-cpt__empty, [class*='empty']") !== null) {
            status.remove();
            return;
          }
          status.textContent = "评论加载较慢，点击重试";
          status.classList.add("retry");
        }, 400);
      };
      status.addEventListener("click", () => {
        if (status.classList.contains("retry")) retry();
      });
      scheduleSheetCheck();
    };

    const closeComments = () => {
      commentOpenToken += 1;
      if (document.body.classList.contains(READER_COMMENT_CLASS)) {
        clearSheetStatus();
        document.body.classList.remove(READER_COMMENT_CLASS);
      }
      if (commentPanel !== null && !commentPanel.hidden) commentPanel.hidden = true;
      if (host !== null) host.inert = false;
      host?.querySelector('[data-action="comment"]')?.focus({ preventScroll: true });
    };

    const trapSheetTab = (event) => {
      if (event.key !== "Tab") return;
      const sheet = document.querySelector("#page-bbs-link .link-comment");
      if (sheet === null) return;
      const items = Array.from(sheet.querySelectorAll("button, a[href], input, textarea, [tabindex]:not([tabindex='-1'])"))
        .filter((node) => node.getBoundingClientRect().width > 0 && getComputedStyle(node).visibility !== "hidden");
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !sheet.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const openLightbox = (source) => {
      if (source === "") return;
      if (lightbox === null) {
        lightbox = document.createElement("button");
        lightbox.type = "button";
        lightbox.className = "hbu-reader-lightbox";
        lightbox.setAttribute("aria-label", "关闭大图");
        const img = document.createElement("img");
        lightbox.append(img);
        lightbox.addEventListener("click", () => {
          lightbox?.remove();
          lightbox = null;
        });
        document.body.append(lightbox);
      }
      const img = lightbox.querySelector("img");
      if (img !== null) img.src = source;
      lightbox.focus({ preventScroll: true });
    };

    const getCommentsSheet = () => {
      const sheet = document.querySelector("#page-bbs-link .link-comment");
      if (sheet === null) return null;
      if (closeSheetButton === null) closeSheetButton = document.createElement("button");
      closeSheetButton.type = "button";
      closeSheetButton.className = "hbu-reader-sheet-close";
      closeSheetButton.setAttribute("aria-label", "关闭评论");
      closeSheetButton.innerHTML = READER_ICONS.close;
      closeSheetButton.onclick = closeComments;
      if (sheet.dataset.hbuTabTrap !== "1") {
        sheet.dataset.hbuTabTrap = "1";
        sheet.addEventListener("keydown", trapSheetTab);
      }
      if (!sheet.contains(closeSheetButton)) sheet.prepend(closeSheetButton);
      return sheet;
    };

    const scrollToPage = (index) => {
      if (host === null) return;
      const pages = Array.from(host.querySelectorAll(".hbu-reader-page"));
      if (pages.length === 0) return;
      const next = Math.min(pages.length - 1, Math.max(0, index));
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      pages[next].scrollIntoView({ block: "start", behavior: behavior });
    };

    const scrollViewport = (direction) => {
      const scroll = host?.querySelector(".hbu-reader-scroll");
      if (!scroll) return;
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      scroll.scrollBy({ top: Math.round(scroll.clientHeight * 0.82) * direction, behavior: behavior });
    };

    const coverInView = () => {
      const scroll = host?.querySelector(".hbu-reader-scroll");
      const hero = host?.querySelector('.hbu-reader-page[data-kind="hero"]');
      if (!scroll || !hero) return false;
      return hero.getBoundingClientRect().bottom > scroll.clientHeight * 0.45;
    };

    const bindSwipe = (scroll) => {
      let startX = 0;
      let startY = 0;
      scroll.addEventListener("touchstart", (event) => {
        if (event.touches.length !== 1) return;
        startX = event.touches[0].clientX;
        startY = event.touches[0].clientY;
      }, { passive: true });
      scroll.addEventListener("touchend", (event) => {
        if (event.changedTouches.length !== 1) return;
        const deltaX = event.changedTouches[0].clientX - startX;
        const deltaY = event.changedTouches[0].clientY - startY;
        if (Math.abs(deltaX) < 52 || Math.abs(deltaX) < Math.abs(deltaY) * 1.3) return;
        if (coverInView() && coverTotal > 1) {
          if (deltaX < 0 && coverIndex === coverTotal - 1) scrollToPage(1);
          else if (deltaX > 0 && coverIndex === 0) scrollToPage(0);
          else setCover(coverIndex + (deltaX < 0 ? 1 : -1));
          return;
        }
        const page = host?.querySelectorAll(".hbu-reader-page")[activeIndex];
        if (page !== undefined && page.scrollWidth > page.clientWidth + 8) return;
        scrollViewport(deltaX < 0 ? 1 : -1);
      }, { passive: true });
    };

    const setCover = (value) => {
      if (host === null || coverTotal === 0) return;
      coverIndex = (value + coverTotal) % coverTotal;
      const sources = Array.from(host.querySelectorAll(".hbu-reader-cover img"));
      const glow = host.querySelector(".hbu-reader-cover-glow");
      if (glow !== null && sources[coverIndex] !== undefined) {
        glow.style.backgroundImage = 'url("' + (sources[coverIndex].getAttribute("src") || "").replace(/"/g, '\\"') + '")';
      }
      for (const [index, node] of sources.entries()) {
        node.dataset.active = String(index === coverIndex);
      }
      for (const [index, node] of Array.from(host.querySelectorAll(".hbu-reader-cover-dots button")).entries()) {
        node.setAttribute("aria-current", String(index === coverIndex));
      }
    };

    const bindTag = (node, text) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        const native = Array.from(document.querySelectorAll("#page-bbs-link .link-tags__tag-item"))
          .find((candidate) => (candidate.textContent || "").trim() === text);
        if (native instanceof HTMLElement) native.click();
      });
    };

    const bindRichProxy = (clone, native) => {
      const tags = Array.from(clone.querySelectorAll("button"));
      for (const button of tags) {
        const text = (button.textContent || "").trim();
        const className = typeof button.className === "string" ? button.className : "";
        button.addEventListener("click", (event) => {
          event.preventDefault();
          const candidates = Array.from(native.querySelectorAll("button"))
            .filter((node) => (typeof node.className === "string" ? node.className : "") === className && (node.textContent || "").trim() === text);
          if (candidates[0] instanceof HTMLElement) candidates[0].click();
        });
      }
      for (const link of clone.querySelectorAll("a[href]")) {
        if ((link.getAttribute("href") || "").startsWith("#")) link.addEventListener("click", (event) => event.preventDefault());
      }
      for (const image of clone.querySelectorAll("img")) {
        image.loading = "lazy";
        image.decoding = "async";
        image.addEventListener("click", () => openLightbox(image.currentSrc || image.src));
      }
    };

    const EMBED_TAGS = new Set(["iframe", "video", "audio", "embed", "object"]);
    const EMBED_SELECTOR = EMBEDDED_MEDIA_SELECTOR;

    const isInlineHidden = (node) => node instanceof HTMLElement
      && (node.hasAttribute("hidden") || node.style.display === "none" || node.style.visibility === "hidden");
    const isEmbedElement = (node) => node instanceof Element && EMBED_TAGS.has(node.tagName.toLowerCase());
    const isEmbedWrapper = (node) => node instanceof Element && node.tagName.toLowerCase() === "div" && node.classList.contains("iframe");
    const hasHiddenInlineAncestor = (node) => {
      let current = node.parentElement;
      while (current !== null) {
        if (isInlineHidden(current)) return true;
        current = current.parentElement;
      }
      return false;
    };
    const isComputedHidden = (node) => {
      if (!(node instanceof Element) || !node.isConnected) return false;
      const visibility = window.getComputedStyle(node).visibility;
      if (visibility === "hidden" || visibility === "collapse") return true;
      return hasHiddenDisplayAncestor(node);
    };
    const hasHiddenDisplayAncestor = (node) => {
      let current = node;
      while (current !== null && !current.matches(".hb-bbs-image-text, .hb-bbs-post")) {
        if (window.getComputedStyle(current).display === "none") return true;
        current = current.parentElement;
      }
      return false;
    };
    const isUnavailableEmbed = (node) => isInlineHidden(node) || hasHiddenInlineAncestor(node) || isComputedHidden(node);
    const isHiddenEmbedNode = (node) => (isEmbedElement(node) || isEmbedWrapper(node)) && isUnavailableEmbed(node);

    const readVisibleEmbeds = (node) => Array.from(node.querySelectorAll(EMBED_SELECTOR))
      .filter((embed) => !isUnavailableEmbed(embed));

    const isTextFreeContainer = (node) => {
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      return text === "" && node.querySelector("img, picture") === null;
    };

    const readSingleSourceGroup = (source, embeds) => embeds.length === 1 ? { source, embeds } : null;

    const readContainerEmbedGroup = (node, embeds) => {
      if (embeds.length === 0) return null;
      if (isEmbedWrapper(node)) return readSingleSourceGroup(node, embeds);
      return isTextFreeContainer(node) ? readSingleSourceGroup(embeds[0], embeds) : null;
    };

    const readEmbedGroup = (node) => {
      if (!(node instanceof Element) || isUnavailableEmbed(node)) return null;
      if (EMBED_TAGS.has(node.tagName.toLowerCase())) return { source: node, embeds: [node] };
      return readContainerEmbedGroup(node, readVisibleEmbeds(node));
    };

    const readEmbedGroups = (root) => {
      if (!(root instanceof Element)) return [];
      const groups = [];
      const collect = (node) => {
        if (!node.matches(EMBED_SELECTOR) && node.querySelector(EMBED_SELECTOR) === null) return;
        const group = readEmbedGroup(node);
        if (group !== null) {
          groups.push(group);
          return;
        }
        for (const child of Array.from(node.children)) collect(child);
      };
      collect(root);
      return groups;
    };

    const containsEmbedOrWrapper = (node) => node.matches(EMBED_SELECTOR)
      || isEmbedWrapper(node)
      || node.querySelector(EMBED_SELECTOR) !== null;

    const readMediaSequenceItem = (node) => {
      if (node instanceof HTMLImageElement) return { kind: "image", node };
      if (!containsEmbedOrWrapper(node)) return null;
      const group = readEmbedGroup(node);
      return group === null ? null : { kind: "embed", group };
    };

    const readMediaSequence = (root) => {
      if (!(root instanceof Element)) return [];
      const items = [];
      const collect = (node) => {
        const item = readMediaSequenceItem(node);
        if (item !== null) {
          items.push(item);
          return;
        }
        for (const child of Array.from(node.children)) collect(child);
      };
      collect(root);
      return items;
    };

    const readPositiveDimension = (raw, pattern) => {
      if (!pattern.test(raw)) return 0;
      const value = Number.parseFloat(raw);
      return Number.isFinite(value) && value > 0 ? value : 0;
    };

    const readEmbedDimension = (node, name) => {
      const inlineValue = node instanceof HTMLElement ? node.style[name].trim() : "";
      if (/^\d+(\.\d+)?px$/.test(inlineValue)) return readPositiveDimension(inlineValue, /^\d+(\.\d+)?px$/);
      const attributeValue = (node.getAttribute(name) || "").trim();
      return readPositiveDimension(attributeValue, /^\d+(\.\d+)?$/);
    };

    const readEmbedHeight = (node) => readEmbedDimension(node, "height");
    const readEmbedWidth = (node) => readEmbedDimension(node, "width");

    const isAudioOnlyGroup = (embeds) => embeds.length > 0 && embeds.every((embed) => embed.tagName.toLowerCase() === "audio");

    const SUSPENDED_SOURCE_MARKER = "heybox-up-suspended";

    const readSuspendedSourceValue = (name) => name === "srcdoc"
      ? "<!doctype html><meta name=\"heybox-up-suspended\" content=\"\">"
      : `about:blank#${SUSPENDED_SOURCE_MARKER}`;

    const reconcileSuspendedSourceMutations = (embed, state, records) => {
      if (suspendedEmbeds.get(embed) !== state) return;
      for (const record of records) {
        const name = record.attributeName;
        if (name === null) continue;
        delete state.attributes[name];
      }
    };

    const suspendMediaEmbed = (embed) => {
      suspendedEmbeds.set(embed, {
        kind: "media",
        muted: embed.muted,
        currentTime: Number.isFinite(embed.currentTime) ? embed.currentTime : 0,
      });
      embed.muted = true;
      embed.pause();
    };

    const suspendMarkupEmbed = (embed) => {
      const attributes = {};
      for (const name of EMBEDDED_MEDIA_SOURCE_ATTRIBUTES) {
        const value = embed.getAttribute(name);
        if (value !== null) attributes[name] = value;
      }
      const state = { kind: "markup", attributes, sourceObserver: null };
      state.sourceObserver = new MutationObserver((records) => reconcileSuspendedSourceMutations(embed, state, records));
      state.sourceObserver.observe(embed, { attributes: true, attributeFilter: EMBEDDED_MEDIA_SOURCE_ATTRIBUTES });
      suspendedEmbeds.set(embed, state);
      for (const name of Object.keys(attributes)) embed.setAttribute(name, readSuspendedSourceValue(name));
      state.sourceObserver.takeRecords();
    };

    const suspendNativeEmbed = (embed) => {
      if (suspendedEmbeds.has(embed)) return;
      if (embed instanceof HTMLMediaElement) {
        suspendMediaEmbed(embed);
        return;
      }
      suspendMarkupEmbed(embed);
    };

    const restoreSuspendedMedia = (embed, state) => {
      embed.muted = state.muted;
      if (state.currentTime <= 0 || embed.readyState <= 0) return;
      try {
        embed.currentTime = state.currentTime;
      } catch (error) {
        console.debug("[HeyBox Up] Failed to restore embedded media position", error);
      }
    };

    const restoreSuspendedMarkup = (embed, state) => {
      if (state.sourceObserver !== null) {
        reconcileSuspendedSourceMutations(embed, state, state.sourceObserver.takeRecords());
        state.sourceObserver.disconnect();
      }
      for (const [name, value] of Object.entries(state.attributes)) embed.setAttribute(name, value);
    };

    const restoreSuspendedEmbed = (embed, state) => {
      if (state.kind === "media" && embed instanceof HTMLMediaElement) {
        restoreSuspendedMedia(embed, state);
        return;
      }
      if (!(embed instanceof Element)) return;
      restoreSuspendedMarkup(embed, state);
    };

    const restoreSuspendedEmbeds = () => {
      for (const [embed, state] of suspendedEmbeds) restoreSuspendedEmbed(embed, state);
      suspendedEmbeds.clear();
    };

    const removeUnavailableEmbedClones = (clone, source) => {
      const nativeEmbeds = Array.from(source.querySelectorAll(EMBED_SELECTOR));
      const clonedEmbeds = Array.from(clone.querySelectorAll(EMBED_SELECTOR));
      nativeEmbeds.forEach((embed, index) => {
        const cloned = clonedEmbeds[index];
        if (cloned instanceof Element && isUnavailableEmbed(embed)) cloned.remove();
      });
    };

    const readGroupDimension = (group, reader) => {
      const ownValue = reader(group.source);
      if (!isEmbedWrapper(group.source) || ownValue > 0) return ownValue;
      const declared = group.embeds.find((embed) => reader(embed) > 0);
      return declared === undefined ? 0 : reader(declared);
    };

    const applyDefaultEmbedRatio = (frame, group) => {
      if (isAudioOnlyGroup(group.embeds)) return;
      frame.style.aspectRatio = "16 / 9";
    };

    const applyEmbedFrameAspect = (frame, group, width, height) => {
      if (width > 0 && height > 0) {
        frame.style.aspectRatio = `${width} / ${height}`;
        return;
      }
      if (height > 0) {
        frame.style.height = `${height}px`;
        return;
      }
      applyDefaultEmbedRatio(frame, group);
    };

    const applyEmbedFrameSize = (frame, group) => {
      const width = readGroupDimension(group, readEmbedWidth);
      const height = readGroupDimension(group, readEmbedHeight);
      if (width > 0) frame.style.width = `min(100%, ${width}px)`;
      applyEmbedFrameAspect(frame, group, width, height);
    };

    const addEmbedPage = (target, group) => {
      const clone = group.source.cloneNode(true);
      removeUnavailableEmbedClones(clone, group.source);
      const frame = document.createElement("div");
      frame.className = "hbu-reader-embed";
      frame.append(clone);
      applyEmbedFrameSize(frame, group);
      const page = document.createElement("section");
      page.className = "hbu-reader-page";
      page.dataset.kind = "embed";
      page.append(frame);
      target.append(page);
      for (const embed of group.embeds) suspendNativeEmbed(embed);
    };

    const addTextPages = (target, lines) => {
      let buffer = "";
      let bufferLines = 0;
      const flush = () => {
        const text = buffer.trim();
        buffer = "";
        bufferLines = 0;
        if (text === "") return;
        const page = document.createElement("section");
        page.className = "hbu-reader-page";
        page.dataset.kind = "text";
        const copy = document.createElement("div");
        copy.className = "hbu-reader-copy";
        copy.textContent = text;
        page.append(copy);
        target.append(page);
      };
      for (const raw of lines) {
        const line = raw.replace(/\s+/g, " ").trim();
        if (line === "") continue;
        if (buffer !== "") buffer += "\n\n";
        buffer += line;
        bufferLines += 1;
        if (bufferLines >= 4 || buffer.length >= 420) flush();
      }
      flush();
    };

    const addMediaPage = (target, source, caption) => {
      if (source === "") return;
      const page = document.createElement("section");
      page.className = "hbu-reader-page";
      page.dataset.kind = "media";
      const img = document.createElement("img");
      img.className = "hbu-reader-media";
      img.src = source;
      img.alt = caption || "正文图片";
      img.loading = "lazy";
      img.decoding = "async";
      img.addEventListener("click", () => openLightbox(img.currentSrc || img.src));
      page.append(img);
      target.append(page);
    };

    const addHeadingPage = (target, text) => {
      const value = text.replace(/\s+/g, " ").trim();
      if (value === "") return;
      const page = document.createElement("section");
      page.className = "hbu-reader-page";
      page.dataset.kind = "heading";
      const copy = document.createElement("div");
      copy.className = "hbu-reader-copy";
      copy.textContent = value;
      page.append(copy);
      target.append(page);
    };

    const addRichPage = (target, native) => {
      const clone = native.cloneNode(true);
      removeUnavailableEmbedClones(clone, native);
      bindRichProxy(clone, native);
      for (const group of readEmbedGroups(native)) {
        for (const embed of group.embeds) suspendNativeEmbed(embed);
      }
      const page = document.createElement("section");
      page.className = "hbu-reader-page";
      page.dataset.kind = "rich";
      const rich = document.createElement("div");
      rich.className = "hbu-reader-rich";
      rich.append(clone);
      page.append(rich);
      target.append(page);
    };

    const buildPages = (target, body) => {
      const lines = [];
      const flush = () => {
        if (lines.length === 0) return;
        addTextPages(target, lines.splice(0, lines.length));
      };
      const visit = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          for (const line of (node.textContent || "").split(/\n+/)) lines.push(line);
          return;
        }
        if (!(node instanceof Element)) return;
        const tag = node.tagName.toLowerCase();
        if (tag === "br") { flush(); return; }
        if (tag === "script" || tag === "style") return;
        if (isHiddenEmbedNode(node)) return;
        if (tag === "img") {
          flush();
          addMediaPage(target, (node.getAttribute("data-src") || node.getAttribute("src") || ""), node.getAttribute("alt") || "");
          return;
        }
        if (/^h[1-4]$/.test(tag)) {
          flush();
          addHeadingPage(target, node.textContent || "");
          return;
        }
        const embedGroup = readEmbedGroup(node);
        if (embedGroup !== null) {
          flush();
          addEmbedPage(target, embedGroup);
          return;
        }
        const images = Array.from(node.querySelectorAll("img"));
        const text = (node.textContent || "").replace(/\s+/g, " ").trim();
        const mediaOnly = text === "" && (images.length === 1 || readVisibleEmbeds(node).length > 0);
        if (mediaOnly) {
          flush();
          for (const item of readMediaSequence(node)) {
            if (item.kind === "image") {
              addMediaPage(target, item.node.getAttribute("data-src") || item.node.getAttribute("src") || item.node.currentSrc || "", item.node.getAttribute("alt") || "");
              continue;
            }
            addEmbedPage(target, item.group);
          }
          return;
        }
        const className = typeof node.className === "string" ? node.className : "";
        const isCard = /(^|\s)(com-|hb-cpt__image|card)/.test(className);
        const isMixedLeaf = text !== "" && !isCard && readVisibleEmbeds(node).length > 0
          && node.querySelector("p, div, section, article, ul, ol, table, blockquote, pre, h1, h2, h3, h4, h5, h6") === null;
        if (["div", "section", "article"].includes(tag) && isMixedLeaf) {
          flush();
          addRichPage(target, node);
          return;
        }
        if (["div", "section", "article"].includes(tag) && !isCard && node.children.length > 0) {
          for (const child of Array.from(node.childNodes)) visit(child);
          return;
        }
        const isSimple = (tag === "p" || tag === "div" && node.children.length === 0)
          && node.querySelector(EMBED_SELECTOR) === null;
        if (isSimple && text !== "" && images.length === 0) {
          lines.push(text);
          return;
        }
        flush();
        if (text !== "" || images.length > 0) addRichPage(target, node);
      };
      for (const child of Array.from(body.childNodes)) visit(child);
      flush();
    };

    const readEmbedSourceSrcs = (node) => JSON.stringify(
      Array.from(node.querySelectorAll("source")).map((child) => child.getAttribute("src") || "")
    );

    const readEmbedStyleValue = (node, name) => node instanceof HTMLElement ? node.style[name] || "" : "";

    const readEmbedSignature = (body) => Array.from(body.querySelectorAll(".iframe, iframe, video, audio, embed, object"))
      .map((node) => [
        node.tagName.toLowerCase(),
        node.classList.contains("iframe") ? "wrapper" : "",
        readEmbedStyleValue(node, "width"),
        readEmbedStyleValue(node, "height"),
        readEmbedStyleValue(node, "visibility"),
        readEmbedStyleValue(node, "display"),
        node.getAttribute("width") || "",
        node.getAttribute("height") || "",
        node.getAttribute("src") || "",
        node.getAttribute("srcdoc") || "",
        node.getAttribute("data") || "",
        readEmbedSourceSrcs(node),
        node.hasAttribute("hidden") ? "hidden" : "",
        isUnavailableEmbed(node) ? "hidden" : "visible",
      ].join("~"))
      .join("|");

    const flushReaderRatio = () => {
      if (ratioSaveTimer !== 0) {
        window.clearTimeout(ratioSaveTimer);
        ratioSaveTimer = 0;
      }
      if (pendingRatio === null) return;
      writeReaderRatio(pendingRatio.id, pendingRatio.ratio);
      pendingRatio = null;
    };

    const scheduleReaderRatio = (id, ratio) => {
      if (id === "") return;
      pendingRatio = { id: id, ratio: ratio };
      if (ratioSaveTimer !== 0) return;
      ratioSaveTimer = window.setTimeout(flushReaderRatio, 400);
    };

    const updateProgress = () => {
      const scroll = progressScroll;
      if (scroll === null || !scroll.isConnected) return;
      const max = scroll.scrollHeight - scroll.clientHeight;
      const ratio = max <= 0 ? 1 : Math.min(1, Math.max(0, scroll.scrollTop / max));
      const percent = Math.round(ratio * 100);
      if (progressCurrent !== null && progressCurrent.textContent !== percent + "%") {
        progressCurrent.textContent = percent + "%";
      }
      if (progressFill !== null && lastProgressPercent !== percent) {
        progressFill.style.width = Math.max(2, ratio * 100) + "%";
        lastProgressPercent = percent;
      }
      if (!restoring) scheduleReaderRatio(articleId, ratio);
    };

    const setActive = (index) => {
      activeIndex = Math.min(pageCount - 1, Math.max(0, index));
      updateProgress();
      writeReaderScroll(articleId, activeIndex);
    };

    const observePages = (scroll) => {
      observer?.disconnect();
      const pages = Array.from(host.querySelectorAll(".hbu-reader-page"));
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = pages.indexOf(entry.target);
          if (index !== -1) setActive(index);
        }
      }, { root: scroll, threshold: .55 });
      for (const page of pages) observer.observe(page);
    };

    const closeCurrentReader = () => {
      dismissedArticleId = articleId;
      teardown();
      showToast("已退出当前文章的沉浸阅读");
    };

    const syncReaderEndActions = () => {
      if (host === null) return;
      const status = navigation.readStatus();
      const prevButton = host.querySelector(".hbu-reader-end-actions [data-prev]");
      const nextButton = host.querySelector(".hbu-reader-end-actions [data-next]");
      const statusNode = host.querySelector(".hbu-reader-end-status");
      if (prevButton instanceof HTMLButtonElement) prevButton.disabled = status.prev === null;
      if (nextButton instanceof HTMLButtonElement) {
        nextButton.disabled = status.discovering;
        nextButton.innerHTML = status.discovering ? "正在寻找下一篇…" : "下一篇 " + READER_ICONS.next;
      }
      if (statusNode instanceof HTMLElement) {
        const text = status.discovering
          ? "正在从信息流寻找下一篇…"
          : status.error !== ""
            ? status.error + "，点击“下一篇”重试"
            : status.exhausted
              ? "已经读到本次信息流的末尾"
              : "";
        statusNode.textContent = text;
        statusNode.hidden = text === "";
      }
    };

    const advanceFromReader = () => {
      if (host === null) return;
      const status = navigation.readStatus();
      if (status.next !== null && status.next.source !== "related") {
        const taken = navigation.takeNext();
        if (taken !== null) {
          navigateToPath(LINK_HREF_PREFIX + taken.id);
          return;
        }
      }
      readerPendingAdvance = true;
      void navigation.discover();
    };

    const createHead = (data) => {
      const head = document.createElement("div");
      head.className = "hbu-reader-head";
      const back = document.createElement("button");
      back.type = "button";
      back.className = "hbu-reader-round";
      back.setAttribute("aria-label", "返回");
      back.title = "返回";
      back.innerHTML = READER_ICONS.back;
      back.addEventListener("click", () => history.back());
      const home = document.createElement("button");
      home.type = "button";
      home.className = "hbu-reader-home";
      home.setAttribute("aria-label", "返回社区首页");
      home.title = "返回社区首页（H）";
      home.innerHTML = READER_ICONS.home + "<span>社区首页</span>";
      home.addEventListener("click", () => navigateToPath("/app/bbs/home"));
      const author = document.createElement("a");
      author.className = "hbu-reader-head-author";
      author.href = data.authorHref;
      author.title = data.author;
      if (data.avatar !== "") {
        const avatar = document.createElement("img");
        avatar.src = data.avatar;
        avatar.alt = "";
        author.append(avatar);
      }
      const name = document.createElement("span");
      name.textContent = data.author;
      author.append(name);
      const follow = document.createElement("button");
      follow.type = "button";
      follow.className = "hbu-reader-follow";
      follow.textContent = "关注";
      follow.addEventListener("click", toggleFollowAuthor);
      const spacer = document.createElement("span");
      spacer.className = "hbu-reader-head-spacer";
      const share = document.createElement("button");
      share.type = "button";
      share.className = "hbu-reader-round";
      share.setAttribute("aria-label", "分享");
      share.title = "分享";
      share.innerHTML = READER_ICONS.share;
      share.addEventListener("click", () => void shareArticle(data));
      const exit = document.createElement("button");
      exit.type = "button";
      exit.className = "hbu-reader-round";
      exit.setAttribute("aria-label", "关闭当前文章的沉浸阅读");
      exit.title = "关闭当前文章的沉浸阅读（R）";
      exit.innerHTML = READER_ICONS.close;
      exit.addEventListener("click", closeCurrentReader);
      head.append(back, home, author, follow, spacer, share, exit);
      return head;
    };

    const createRail = (data) => {
      const rail = document.createElement("aside");
      rail.className = "hbu-reader-rail";
      rail.setAttribute("aria-label", "文章互动");
      const avatar = document.createElement("a");
      avatar.className = "hbu-reader-action hbu-reader-rail-avatar-link";
      avatar.href = data.authorHref;
      avatar.title = "查看作者 " + data.author;
      avatar.setAttribute("aria-label", "查看作者 " + data.author);
      if (data.avatar !== "") {
        const img = document.createElement("img");
        img.src = data.avatar;
        img.alt = "";
        img.className = "hbu-reader-rail-avatar";
        avatar.append(img);
      }
      const like = document.createElement("button");
      like.type = "button";
      like.className = "hbu-reader-action";
      like.dataset.action = "like";
      like.setAttribute("aria-label", "点赞");
      like.title = "点赞";
      like.addEventListener("click", () => void toggleLike());
      const favour = document.createElement("button");
      favour.type = "button";
      favour.className = "hbu-reader-action";
      favour.dataset.action = "favour";
      favour.setAttribute("aria-label", "收藏");
      favour.setAttribute("aria-haspopup", "menu");
      favour.setAttribute("aria-expanded", "false");
      favour.title = "收藏到收藏夹";
      favour.addEventListener("click", () => openFavourMenu(rail, favour));
      const cy = document.createElement("button");
      cy.type = "button";
      cy.className = "hbu-reader-action hbu-reader-action--cy";
      cy.dataset.action = "cy";
      cy.setAttribute("aria-label", "发布 CY");
      cy.title = "发布 CY";
      cy.innerHTML = '<span class="hbu-reader-cy-label">CY</span>';
      cy.addEventListener("click", openCyDialog);
      const comment = document.createElement("button");
      comment.type = "button";
      comment.className = "hbu-reader-action";
      comment.dataset.action = "comment";
      comment.setAttribute("aria-label", "查看评论");
      comment.title = "查看评论（C）";
      comment.addEventListener("click", () => void openComments());
      const share = document.createElement("button");
      share.type = "button";
      share.className = "hbu-reader-action";
      share.setAttribute("aria-label", "分享");
      share.title = "分享";
      share.innerHTML = READER_ICONS.share;
      share.addEventListener("click", () => void shareArticle(data));
      const spacing = document.createElement("button");
      spacing.type = "button";
      spacing.className = "hbu-reader-action";
      spacing.dataset.action = "spacing";
      spacing.setAttribute("aria-label", "正文行距设置");
      spacing.setAttribute("aria-haspopup", "true");
      spacing.setAttribute("aria-expanded", "false");
      spacing.title = "正文行距设置";
      spacing.innerHTML = SETTINGS_ICON;
      spacing.addEventListener("click", () => openSpacingMenu(rail, spacing));
      rail.append(avatar, like, favour, cy, comment, share, spacing);
      return rail;
    };

    const createHero = (data) => {
      const page = document.createElement("section");
      page.className = "hbu-reader-page";
      page.dataset.kind = "hero";
      const cover = document.createElement("div");
      cover.className = "hbu-reader-cover" + (data.covers.length === 0 ? " hbu-reader-cover--empty" : "");
      if (data.covers.length > 0) {
        const glow = document.createElement("div");
        glow.className = "hbu-reader-cover-glow";
        glow.style.backgroundImage = 'url("' + data.covers[0].replace(/"/g, '\\"') + '")';
        cover.append(glow);
      }
      coverTotal = data.covers.length;
      coverIndex = 0;
      data.covers.forEach((source, index) => {
        const img = document.createElement("img");
        img.src = source;
        img.alt = index === 0 ? data.title : "封面 " + (index + 1);
        img.dataset.active = String(index === 0);
        if (index > 1) img.loading = "lazy";
        img.addEventListener("click", () => openLightbox(img.currentSrc || img.src));
        cover.append(img);
      });
      if (data.covers.length > 1) {
        const prev = document.createElement("button");
        prev.type = "button";
        prev.className = "hbu-reader-cover-nav";
        prev.dataset.side = "prev";
        prev.setAttribute("aria-label", "上一张封面");
        prev.innerHTML = READER_ICONS.previous;
        prev.addEventListener("click", () => setCover(coverIndex - 1));
        const next = document.createElement("button");
        next.type = "button";
        next.className = "hbu-reader-cover-nav";
        next.dataset.side = "next";
        next.setAttribute("aria-label", "下一张封面");
        next.innerHTML = READER_ICONS.next;
        next.addEventListener("click", () => setCover(coverIndex + 1));
        const dots = document.createElement("div");
        dots.className = "hbu-reader-cover-dots";
        data.covers.forEach((source, index) => {
          const dot = document.createElement("button");
          dot.type = "button";
          dot.setAttribute("aria-label", "封面 " + (index + 1));
          dot.setAttribute("aria-current", String(index === 0));
          dot.addEventListener("click", () => setCover(index));
          dots.append(dot);
        });
        cover.append(prev, next, dots);
      }
      const caption = document.createElement("div");
      caption.className = "hbu-reader-caption";
      if (data.tags.length > 0 || data.time !== "") {
        const kicker = document.createElement("div");
        kicker.className = "hbu-reader-kicker";
        for (const tag of data.tags.slice(0, 3)) {
          const chip = document.createElement("span");
          chip.textContent = tag;
          kicker.append(chip);
        }
        if (data.time !== "") {
          const chip = document.createElement("span");
          chip.textContent = data.time + (data.ip !== "" ? " · " + data.ip : "");
          kicker.append(chip);
        }
        caption.append(kicker);
      }
      const title = document.createElement("h1");
      title.className = "hbu-reader-title";
      title.textContent = data.title || "无标题";
      const byline = document.createElement("div");
      byline.className = "hbu-reader-byline";
      const author = document.createElement("b");
      author.textContent = data.author;
      const hint = document.createElement("span");
      hint.textContent = "向下滑动阅读";
      byline.append(author, hint);
      caption.append(title, byline);
      page.append(cover, caption);
      return page;
    };

    const createEndPage = (data) => {
      const page = document.createElement("section");
      page.className = "hbu-reader-page";
      page.dataset.kind = "end";
      const card = document.createElement("div");
      card.className = "hbu-reader-end-card";
      const head = document.createElement("div");
      head.className = "hbu-reader-end-head";
      if (data.avatar !== "") {
        const avatar = document.createElement("img");
        avatar.src = data.avatar;
        avatar.alt = "";
        head.append(avatar);
      }
      const name = document.createElement("div");
      name.className = "hbu-reader-end-name";
      const label = document.createElement("b");
      label.textContent = data.author;
      const meta = document.createElement("span");
      meta.textContent = (data.level !== "" ? "Lv." + data.level : "") + (data.time !== "" ? (data.level !== "" ? " · " : "") + data.time : "");
      name.append(label, meta);
      const follow = document.createElement("button");
      follow.type = "button";
      follow.className = "hbu-reader-follow";
      follow.textContent = "关注";
      follow.addEventListener("click", toggleFollowAuthor);
      head.append(name, follow);
      const stats = document.createElement("div");
      stats.className = "hbu-reader-stats";
      for (const item of [
        { value: data.counts.like, label: "点赞" },
        { value: data.counts.favour, label: "收藏" },
        { value: data.counts.comment, label: "评论" },
      ]) {
        const box = document.createElement("div");
        box.dataset.stat = item.label === "点赞" ? "like" : item.label === "收藏" ? "favour" : "comment";
        const value = document.createElement("b");
        value.textContent = item.value;
        const text = document.createElement("span");
        text.textContent = item.label;
        box.append(value, text);
        stats.append(box);
      }
      card.append(head, stats);
      if (data.tags.length > 0) {
        const tags = document.createElement("div");
        tags.className = "hbu-reader-tags";
        for (const tag of data.tags) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "hbu-reader-tag";
          button.textContent = tag;
          bindTag(button, tag);
          tags.append(button);
        }
        card.append(tags);
      }
      page.append(card);
      const visitedPostIds = readVisitedPostIds(articleId);
      const visibleRelated = data.related.filter((item) => !visitedPostIds.has(item.id));
      if (visibleRelated.length > 0) {
        const related = document.createElement("div");
        related.className = "hbu-reader-related";
        const heading = document.createElement("h2");
        heading.textContent = "继续阅读";
        related.append(heading);
        for (const item of visibleRelated.slice(0, 4)) {
          const link = document.createElement("a");
          link.href = LINK_HREF_PREFIX + item.id;
          link.textContent = item.title || "帖子 " + item.id;
          related.append(link);
        }
        page.append(related);
      }
      const actions = document.createElement("div");
      actions.className = "hbu-reader-end-actions";
      const homeButton = document.createElement("button");
      homeButton.type = "button";
      homeButton.dataset.home = "";
      homeButton.innerHTML = READER_ICONS.home + " 社区首页";
      homeButton.addEventListener("click", () => navigateToPath("/app/bbs/home"));
      const prevButton = document.createElement("button");
      prevButton.type = "button";
      prevButton.dataset.prev = "";
      prevButton.innerHTML = READER_ICONS.previous + " 上一篇";
      prevButton.addEventListener("click", () => {
        const prev = navigation.readStatus().prev;
        if (prev !== null) navigateToPath(LINK_HREF_PREFIX + prev.id);
      });
      const nextButton = document.createElement("button");
      nextButton.type = "button";
      nextButton.dataset.next = "";
      nextButton.innerHTML = "下一篇 " + READER_ICONS.next;
      nextButton.addEventListener("click", advanceFromReader);
      const topButton = document.createElement("button");
      topButton.type = "button";
      topButton.textContent = "回到封面";
      topButton.addEventListener("click", () => scrollToPage(0));
      actions.append(homeButton, prevButton, topButton, nextButton);
      page.append(actions);
      const status = document.createElement("p");
      status.className = "hbu-reader-end-status";
      status.hidden = true;
      page.append(status);
      return page;
    };

    const readSource = () => {
      let pageRoot;
      let article;
      let body;
      let titleNode;
      const cached = sourceCache;
      if (cached !== null && cached.articleId === articleId && cached.pageRoot.isConnected
        && cached.article.isConnected && cached.body.isConnected
        && cached.titleNode !== null && cached.titleNode.isConnected) {
        pageRoot = cached.pageRoot;
        article = cached.article;
        body = cached.body;
        titleNode = cached.titleNode;
      } else {
        pageRoot = document.querySelector("#page-bbs-link");
        article = pageRoot?.querySelector(".hb-bbs-image-text, .hb-bbs-post");
        body = article?.querySelector(".image-text__content, .post__content");
        titleNode = article?.querySelector(".section-title__content, .post__title, .image-text__title");
        if (!pageRoot || !article || !body) {
          sourceCache = null;
          return null;
        }
        sourceCache = { articleId: articleId, pageRoot: pageRoot, article: article, body: body, titleNode: titleNode };
      }
      const covers = pageRoot.querySelectorAll(".image-text__header-image img, .post__header-image img");
      const tags = pageRoot.querySelectorAll(".link-tags__tag-item");
      const related = pageRoot.querySelectorAll(".bbs-link__related-recommend a[href*='/app/bbs/link/'], .related-recommend__container a[href*='/app/bbs/link/']");
      return {
        pageRoot,
        article,
        body,
        titleNode,
        signature: [articleId, titleNode?.textContent?.length || 0, body.childNodes.length, (body.textContent || "").length, covers.length, tags.length, related.length, readEmbedSignature(body)].join(":"),
      };
    };

    const readData = (source) => {
      if (source === null) return null;
      const { pageRoot, article, body, titleNode } = source;
      const authorNode = pageRoot.querySelector(".link-user__username, .page-header__username");
      const authorLink = pageRoot.querySelector(".link-user__user-wrapper, .page-header__user-wrapper");
      const avatarNode = authorLink?.querySelector("img") || pageRoot.querySelector(".page-header__user-wrapper img");
      const covers = Array.from(pageRoot.querySelectorAll(".image-text__header-image img, .post__header-image img"))
        .map((node) => node.currentSrc || node.src)
        .filter((source, index, list) => source !== "" && list.indexOf(source) === index);
      const tags = Array.from(pageRoot.querySelectorAll(".link-tags__tag-item"))
        .map((node) => (node.textContent || "").trim())
        .filter((value) => value !== "");
      const time = (pageRoot.querySelector(".link-data__time")?.textContent || "").trim();
      const ip = (pageRoot.querySelector(".link-data__ip")?.textContent || "").trim().replace(/^·/, "");
      const level = (pageRoot.querySelector(".link-user__level-tag")?.className.match(/hb-level-(\d+)/) || [])[1] || "";
      const related = Array.from(pageRoot.querySelectorAll(".bbs-link__related-recommend a[href*='/app/bbs/link/'], .related-recommend__container a[href*='/app/bbs/link/']"))
        .map((anchor) => {
          const match = /link\/(\d+)/.exec(anchor.getAttribute("href") || "");
          return match ? { id: match[1], title: (anchor.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80) } : null;
        })
        .filter(Boolean)
        .filter((item, index, list) => list.findIndex((other) => other.id === item.id) === index);
      const title = (titleNode?.textContent || "").trim();
      const meta = readPostMeta(pageRoot, title);
      return {
        article: article,
        body: body,
        title: title,
        author: (authorNode?.textContent || "").trim() || "作者",
        authorId: meta.authorId,
        authorHref: authorLink?.getAttribute("href") || "/app/user/profile/",
        avatar: avatarNode?.getAttribute("src") || "",
        topicIds: meta.topicIds,
        topics: meta.topics,
        meta: meta,
        covers: covers,
        tags: tags,
        time: time,
        ip: ip,
        level: level,
        related: related,
        counts: readCounts(),
        signature: source.signature,
      };
    };

    const refreshReaderSignature = () => {
      const refreshedSource = readSource();
      if (refreshedSource !== null) signature = refreshedSource.signature;
    };

    const openLinkedComments = () => {
      if (document.body.classList.contains(READER_COMMENT_CLASS) || /comment/i.test(location.hash)) {
        requestAnimationFrame(() => void openComments());
      }
    };

    const settleRatioRestore = (node, ratio) => {
      const apply = () => {
        node.scrollTop = (node.scrollHeight - node.clientHeight) * ratio;
      };
      apply();
      let cancelled = false;
      const stop = () => {
        cancelled = true;
        restoring = false;
      };
      for (const type of ["wheel", "touchstart", "pointerdown", "keydown"]) node.addEventListener(type, stop, { once: true, passive: true });
      const images = Array.from(node.querySelectorAll("img"));
      const settle = Promise.race([
        Promise.allSettled(images.map((image) => image.decode())),
        new Promise((resolve) => window.setTimeout(resolve, 1200)),
      ]);
      settle.then(() => {
        if (cancelled) return;
        apply();
        restoring = false;
        updateProgress();
      });
    };

    const restoreReaderPosition = (ratio, restore) => {
      if (ratio >= 0) {
        requestAnimationFrame(() => {
          const node = host?.querySelector(".hbu-reader-scroll");
          if (node === null || node === undefined) return;
          settleRatioRestore(node, ratio);
        });
        return;
      }
      if (restore <= 0) return;
      requestAnimationFrame(() => {
        const pages = host?.querySelectorAll(".hbu-reader-page");
        pages?.[restore]?.scrollIntoView({ block: "start", behavior: "auto" });
        setActive(restore);
      });
    };

    const render = (data) => {
      if (host === null) return;
      restoreSuspendedEmbeds();
      readerGeneration += 1;
      observer?.disconnect();
      window.cancelAnimationFrame(scrollRaf);
      scrollRaf = 0;
      flushReaderRatio();
      resetReaderComments();
      host.textContent = "";
      progressScroll = null;
      progressCurrent = null;
      progressFill = null;
      lastProgressPercent = -1;
      linkStateController?.abort();
      linkStateController = null;
      commentLoadController?.abort();
      commentLoadController = null;
      favourLoadController?.abort();
      favourLoadController = null;
      linkState = null;
      linkStatePromise = null;
      actionBusy = false;
      cyBusy = false;
      cyDialog = null;
      cyTextarea = null;
      cySubmit = null;
      cyStatus = null;
      favourPanel = null;
      favourButton = null;
      spacingPanel = null;
      spacingButton = null;
      spacingInput = null;
      coverIndex = 0;
      coverTotal = 0;
      activeIndex = 0;
      host.append(createHead(data));
      const scroll = document.createElement("div");
      scroll.className = "hbu-reader-scroll";
      scroll.tabIndex = 0;
      scroll.setAttribute("aria-label", "文章内容");
      bindSwipe(scroll);
      scroll.append(createHero(data));
      const pages = document.createDocumentFragment();
      buildPages(pages, data.body);
      refreshReaderSignature();
      scroll.append(pages);
      scroll.append(createEndPage(data));
      const rail = createRail(data);
      host.append(scroll, rail);
      const progress = document.createElement("div");
      progress.className = "hbu-reader-progress";
      const current = document.createElement("span");
      current.dataset.current = "";
      current.textContent = "1";
      const bar = document.createElement("span");
      bar.className = "hbu-reader-progress-bar";
      const fill = document.createElement("i");
      bar.append(fill);
      const total = document.createElement("span");
      total.dataset.total = "";
      total.textContent = "";
      const hint = document.createElement("span");
      hint.className = "hbu-reader-hint";
      hint.textContent = "滚轮 / ↑↓ 滚动";
      progress.append(current, bar, total, hint);
      const toast = document.createElement("div");
      toast.className = "hbu-reader-toast";
      toast.setAttribute("aria-live", "polite");
      host.append(progress, toast);
      progressScroll = scroll;
      progressCurrent = current;
      progressFill = fill;
      pageCount = host.querySelectorAll(".hbu-reader-page").length;
      observePages(scroll);
      scroll.addEventListener("scroll", () => {
        if (scrollRaf !== 0) return;
        scrollRaf = window.requestAnimationFrame(() => {
          scrollRaf = 0;
          updateProgress();
        });
      }, { passive: true });
      syncActionStates();
      lastActionSyncAt = performance.now();
      void loadLinkState();
      const ratio = readReaderRatio(articleId);
      const restore = ratio < 0 ? Math.min(pageCount - 1, readReaderScroll(articleId)) : 0;
      restoring = ratio >= 0;
      updateProgress();
      if (ratio >= 0) writeReaderRatio(articleId, ratio);
      openLinkedComments();
      restoreReaderPosition(ratio, restore);
      navigation.sync(articleId, { ...data.meta, id: articleId }, data.related);
      syncReaderEndActions();
    };

    const showPending = () => {
      ensureShell();
      if (host === null || host.childElementCount > 0) return;
      const pending = document.createElement("div");
      pending.className = "hbu-reader-pending";
      pending.textContent = "正在加载文章…";
      host.append(pending);
    };

    const teardown = () => {
      restoreSuspendedEmbeds();
      readerGeneration += 1;
      observer?.disconnect();
      observer = null;
      flushReaderRatio();
      restoring = false;
      progressScroll = null;
      progressCurrent = null;
      progressFill = null;
      lastProgressPercent = -1;
      sourceCache = null;
      nativeActionArticle = null;
      nativeActionBox = null;
      nativeFavourButton = null;
      linkStateController?.abort();
      linkStateController = null;
      commentLoadController?.abort();
      commentLoadController = null;
      favourLoadController?.abort();
      favourLoadController = null;
      linkState = null;
      linkStatePromise = null;
      actionBusy = false;
      cyBusy = false;
      cyDialog = null;
      cyTextarea = null;
      cySubmit = null;
      cyStatus = null;
      clearSheetStatus();
      document.body.classList.remove(READER_CLASS, READER_COMMENT_CLASS);
      commentOpenToken += 1;
      if (host !== null) host.inert = false;
      commentPanel?.remove();
      commentPanel = null;
      commentPanelList = null;
      commentPanelStatus = null;
      commentPanelMeta = null;
      commentPanelMore = null;
      commentPanelClose = null;
      commentState = createCommentState();
      closeSheetButton?.remove();
      closeSheetButton = null;
      favourPanel = null;
      favourButton = null;
      spacingPanel = null;
      spacingButton = null;
      spacingInput = null;
      host?.remove();
      host = null;
      backdrop?.remove();
      backdrop = null;
      lightbox?.remove();
      lightbox = null;
      signature = "";
      pageCount = 0;
      activeIndex = 0;
    };

    const ensureShell = () => {
      ensureReaderStyle();
      if (!document.body.classList.contains(READER_CLASS)) document.body.classList.add(READER_CLASS);
      if (host === null) {
        host = document.createElement("div");
        host.id = READER_ID;
        host.setAttribute("role", "region");
        host.setAttribute("aria-label", "沉浸阅读");
        document.body.append(host);
      }
      if (backdrop === null) {
        backdrop = document.createElement("div");
        backdrop.className = READER_BACKDROP_CLASS;
        backdrop.addEventListener("click", closeComments);
        document.body.append(backdrop);
      }
    };

    const sync = () => {
      const match = /^\/app\/bbs\/link\/(\d+)/.exec(location.pathname);
      if (match === null) {
        dismissedArticleId = "";
        if (host !== null || document.body.classList.contains(READER_CLASS)) teardown();
        signature = "";
        return;
      }
      if (!readReaderPreference()) {
        if (host !== null || document.body.classList.contains(READER_CLASS)) teardown();
        signature = "";
        return;
      }
      const nextArticleId = match[1];
      if (dismissedArticleId === nextArticleId) {
        if (host !== null || document.body.classList.contains(READER_CLASS)) teardown();
        signature = "";
        return;
      }
      if (articleId !== nextArticleId) {
        dismissedArticleId = "";
        flushReaderRatio();
        sourceCache = null;
        nativeActionArticle = null;
        nativeActionBox = null;
        nativeFavourButton = null;
      }
      articleId = nextArticleId;
      if (document.body.classList.contains(READER_COMMENT_CLASS) && document.querySelector("#page-bbs-link .link-comment") === null) closeComments();
      const source = readSource();
      if (source === null) {
        showPending();
        return;
      }
      ensureShell();
      if (signature === source.signature) {
        const now = performance.now();
        if (now - lastActionSyncAt >= 1000) {
          lastActionSyncAt = now;
          syncActionStates();
        }
        return;
      }
      signature = source.signature;
      const data = readData(source);
      if (data === null) return;
      render(data);
    };

    navigation.subscribe((status) => {
      if (host === null) {
        readerPendingAdvance = false;
        return;
      }
      syncReaderEndActions();
      if (!readerPendingAdvance || status.discovering) return;
      readerPendingAdvance = false;
      const taken = navigation.takeNext();
      if (taken !== null) navigateToPath(LINK_HREF_PREFIX + taken.id);
    });

    document.addEventListener(READER_EVENT, (event) => {
      if (readerToggle !== null) readerToggle.setAttribute("aria-checked", String(event.detail === true));
      if (event.detail !== true) {
        teardown();
        showToast("已退出沉浸阅读，可在设置中重新开启");
        return;
      }
      dismissedArticleId = "";
      signature = "";
      sync();
    });

    document.addEventListener("keydown", (event) => {
      if (host === null || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "Escape") {
        if (cyDialog !== null) {
          event.preventDefault();
          closeCyDialog();
        } else if (spacingPanel !== null && !spacingPanel.hidden) {
          event.preventDefault();
          closeSpacingMenu();
          spacingButton?.focus({ preventScroll: true });
        } else if (favourPanel !== null && !favourPanel.hidden) {
          event.preventDefault();
          closeFavourMenu();
        } else if (document.body.classList.contains(READER_COMMENT_CLASS) || (commentPanel !== null && !commentPanel.hidden)) {
          event.preventDefault();
          closeComments();
        } else if (lightbox !== null) {
          event.preventDefault();
          lightbox.remove();
          lightbox = null;
        } else if (isSiteAlertOpen()) {
          // The site confirmation dialog sits above the reader, so let it own this Escape.
          return;
        } else {
          event.preventDefault();
          closeCurrentReader();
        }
        return;
      }
      if (isSiteAlertOpen() || eventHitsTypingTarget(event)) return;
      if (event.key === "[") {
        event.preventDefault();
        const prev = navigation.readStatus().prev;
        if (prev !== null) navigateToPath(LINK_HREF_PREFIX + prev.id);
        return;
      }
      if (event.key === "]") {
        event.preventDefault();
        advanceFromReader();
        return;
      }
      if (event.key === "h" || event.key === "H") {
        event.preventDefault();
        navigateToPath("/app/bbs/home");
        return;
      }
      if (event.key === "ArrowRight" && coverInView() && coverTotal > 1) {
        event.preventDefault();
        setCover(coverIndex + 1);
        return;
      }
      if (event.key === "ArrowLeft" && coverInView() && coverTotal > 1) {
        event.preventDefault();
        setCover(coverIndex - 1);
        return;
      }
      if (["ArrowDown", "PageDown", "j", "J", " "].includes(event.key)) {
        event.preventDefault();
        scrollViewport(1);
      } else if (["ArrowUp", "PageUp", "k", "K"].includes(event.key)) {
        event.preventDefault();
        scrollViewport(-1);
      } else if (event.key === "Home") {
        event.preventDefault();
        scrollToPage(0);
      } else if (event.key === "End") {
        event.preventDefault();
        scrollToPage(pageCount - 1);
      } else if (event.key === "c" || event.key === "C") {
        event.preventDefault();
        if (document.body.classList.contains(READER_COMMENT_CLASS) || (commentPanel !== null && !commentPanel.hidden)) closeComments();
        else void openComments();
      } else if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        closeCurrentReader();
      }
    });

    registerPageSync(sync, 200, [PAGE_ROUTE.ARTICLE], "article");
    window.addEventListener("popstate", () => { signature = ""; sync(); });
    window.addEventListener("pagehide", flushReaderRatio);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushReaderRatio();
    });
    sync();
  }

  // 社区内搜索：站点搜索页（/app/search/list）只做全局检索，它的 queryFn 不读 topic_id，
  // 所以脚本在社区页直接带 topic_id 请求同一个搜索接口，把结果渲染在自建面板里。
  const COMMUNITY_SEARCH_API_PATH = "/bbs/app/api/general/search/v1";
  const COMMUNITY_SEARCH_ID = "heybox-up-community-search";
  const COMMUNITY_SEARCH_STYLE_ID = "heybox-up-community-search-style";
  const COMMUNITY_SEARCH_ACTIVE_CLASS = "heybox-up-cs-active";
  const COMMUNITY_SEARCH_PAGE_SIZE = 30;

  const COMMUNITY_SEARCH_ICONS = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.4"/><path d="m16.1 16.1 4.4 4.4"/></svg>',
  };

  const COMMUNITY_SEARCH_CSS = `
    #heybox-up-community-search {
      display: block;
      margin: 14px 0 12px;
      font: 13px/1.55 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
      color: var(--heybox-up-text, #14191e);
      -webkit-font-smoothing: antialiased;
    }
    #heybox-up-community-search *,
    #heybox-up-community-search *::before,
    #heybox-up-community-search *::after { box-sizing: border-box; }
    #heybox-up-community-search .bar {
      display: flex;
      align-items: center;
      gap: 10px;
      height: 42px;
      margin: 0;
      padding: 0 6px 0 13px;
      border: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1));
      border-radius: var(--heybox-up-radius-card, 14px);
      background: var(--heybox-up-surface, #fff);
      box-shadow: var(--heybox-up-shadow-1, none);
      transition: border-color .16s ease, box-shadow .16s ease;
    }
    #heybox-up-community-search .bar:focus-within {
      border-color: var(--heybox-up-accent, #6f8db3);
      box-shadow: 0 0 0 3px rgba(111, 141, 179, .16);
    }
    #heybox-up-community-search .icon { display: inline-flex; flex: none; color: var(--heybox-up-muted, #6b7280); }
    #heybox-up-community-search .icon svg { width: 16px; height: 16px; }
    #heybox-up-community-search .scope {
      flex: none;
      max-width: 34%;
      height: 22px;
      padding: 0 9px;
      border-radius: 999px;
      background: var(--heybox-up-subtle, rgba(20, 25, 30, .06));
      color: var(--heybox-up-muted, #6b7280);
      font-size: 12px;
      line-height: 22px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #heybox-up-community-search input.q {
      flex: 1 1 auto;
      min-width: 0;
      height: 30px;
      margin: 0;
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 14px;
      line-height: 30px;
      outline: none;
      box-shadow: none;
      appearance: none;
    }
    #heybox-up-community-search input.q::placeholder { color: var(--heybox-up-muted, #6b7280); }
    #heybox-up-community-search button.go {
      flex: none;
      height: 30px;
      margin: 0;
      padding: 0 15px;
      border: 0;
      border-radius: 999px;
      background: var(--heybox-up-accent, #6f8db3);
      color: var(--heybox-up-on-accent, #fff);
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: filter .16s ease;
    }
    #heybox-up-community-search button.go:hover { filter: brightness(1.06); }
    #heybox-up-community-search button.go:focus-visible,
    #heybox-up-community-search .chip:focus-visible,
    #heybox-up-community-search .more:focus-visible,
    #heybox-up-community-search .close:focus-visible {
      outline: 2px solid var(--heybox-up-accent, #6f8db3);
      outline-offset: 2px;
    }
    #heybox-up-community-search .panel {
      margin-top: 10px;
      border: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1));
      border-radius: var(--heybox-up-radius-card, 14px);
      background: var(--heybox-up-surface, #fff);
      box-shadow: var(--heybox-up-shadow-1, none);
      overflow: hidden;
    }
    #heybox-up-community-search .panel[hidden] { display: none !important; }
    #heybox-up-community-search .head {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 13px 16px;
      border-bottom: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1));
    }
    #heybox-up-community-search .head-text { flex: 1 1 auto; min-width: 0; }
    #heybox-up-community-search .head-title {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      line-height: 1.5;
      color: var(--heybox-up-text, #14191e);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #heybox-up-community-search .head-meta {
      margin: 2px 0 0;
      font-size: 12px;
      line-height: 1.5;
      color: var(--heybox-up-muted, #6b7280);
    }
    #heybox-up-community-search .head-actions { flex: none; display: flex; align-items: center; gap: 6px; }
    #heybox-up-community-search .ghost,
    #heybox-up-community-search .close {
      height: 28px;
      padding: 0 11px;
      border: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1));
      border-radius: 999px;
      background: transparent;
      color: var(--heybox-up-text-2, #3c4249);
      font: inherit;
      font-size: 12px;
      line-height: 26px;
      text-decoration: none;
      white-space: nowrap;
      cursor: pointer;
      transition: background .16s ease, border-color .16s ease, color .16s ease;
    }
    #heybox-up-community-search .ghost:hover,
    #heybox-up-community-search .close:hover {
      border-color: var(--heybox-up-accent, #6f8db3);
      background: var(--heybox-up-subtle, rgba(20, 25, 30, .06));
      color: var(--heybox-up-text, #14191e);
    }
    #heybox-up-community-search .filters {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 10px 16px;
      border-bottom: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1));
    }
    #heybox-up-community-search .filters[hidden] { display: none !important; }
    #heybox-up-community-search .chip {
      height: 26px;
      margin: 0;
      padding: 0 11px;
      border: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1));
      border-radius: 999px;
      background: transparent;
      color: var(--heybox-up-text-2, #3c4249);
      font: inherit;
      font-size: 12px;
      line-height: 24px;
      cursor: pointer;
      transition: color .16s ease, border-color .16s ease, background .16s ease;
    }
    #heybox-up-community-search .chip:hover { border-color: var(--heybox-up-accent, #6f8db3); }
    #heybox-up-community-search .chip[aria-pressed="true"] {
      border-color: var(--heybox-up-accent, #6f8db3);
      background: rgba(111, 141, 179, .14);
      color: var(--heybox-up-accent, #6f8db3);
      font-weight: 600;
    }
    #heybox-up-community-search .item {
      display: block;
      padding: 15px 16px;
      border-bottom: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1));
      color: inherit;
      text-decoration: none;
      cursor: pointer;
      transition: background .14s ease;
    }
    #heybox-up-community-search .item:last-child { border-bottom: 0; }
    #heybox-up-community-search .item:hover { background: var(--heybox-up-subtle, rgba(20, 25, 30, .06)); }
    #heybox-up-community-search .item-thumb {
      float: right;
      width: 88px;
      height: 66px;
      margin: 2px 0 6px 14px;
      border-radius: 8px;
      object-fit: cover;
      background: var(--heybox-up-subtle, rgba(20, 25, 30, .06));
    }
    #heybox-up-community-search .item-title {
      margin: 0 0 4px;
      font-size: 15px;
      font-weight: 600;
      line-height: 1.45;
      color: var(--heybox-up-text, #14191e);
    }
    #heybox-up-community-search .item-desc {
      margin: 0 0 8px;
      font-size: 13px;
      line-height: 1.62;
      color: var(--heybox-up-text-2, #3c4249);
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
    }
    #heybox-up-community-search .item-meta {
      margin: 0;
      font-size: 12px;
      line-height: 1.5;
      color: var(--heybox-up-muted, #6b7280);
    }
    #heybox-up-community-search .empty {
      margin: 0;
      padding: 30px 18px;
      text-align: center;
      font-size: 13px;
      line-height: 1.7;
      color: var(--heybox-up-muted, #6b7280);
    }
    #heybox-up-community-search .foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 12px 16px;
      border-top: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1));
    }
    #heybox-up-community-search .foot[hidden] { display: none !important; }
    #heybox-up-community-search .more {
      flex: none;
      height: 30px;
      margin: 0;
      padding: 0 14px;
      border: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1));
      border-radius: 999px;
      background: transparent;
      color: var(--heybox-up-text-2, #3c4249);
      font: inherit;
      font-size: 12px;
      cursor: pointer;
    }
    #heybox-up-community-search .more[hidden] { display: none !important; }
    #heybox-up-community-search .more:hover:not(:disabled) {
      border-color: var(--heybox-up-accent, #6f8db3);
      color: var(--heybox-up-text, #14191e);
    }
    #heybox-up-community-search .more:disabled { opacity: .45; cursor: default; }
    #heybox-up-community-search .status {
      margin: 0;
      font-size: 12px;
      line-height: 1.5;
      color: var(--heybox-up-muted, #6b7280);
      text-align: right;
    }
    /* 结果面板打开时，站点自己的筛选行与信息流藏起来，避免两套列表叠在一起。 */
    #page-topic-link.heybox-up-cs-active .topic-link__filter-row,
    #page-topic-link.heybox-up-cs-active .topic-link__list { display: none !important; }
    @media (max-width: 720px) {
      #heybox-up-community-search { margin: 10px 0; }
      #heybox-up-community-search .scope { display: none; }
      #heybox-up-community-search .head { flex-wrap: wrap; }
      #heybox-up-community-search .item-thumb { width: 72px; height: 54px; }
    }
  `;

  function ensureCommunitySearchStyle() {
    ensureStyleElement(COMMUNITY_SEARCH_STYLE_ID, COMMUNITY_SEARCH_CSS);
  }

  // 社区页地址形如 /app/topic/link/<topic_id>，社区名优先读右栏社区卡，其次页头与标题。
  function readTopicContext() {
    const match = /^\/app\/topic\/link\/(\d+)/.exec(location.pathname);
    if (match === null) return null;
    const indicator = document.querySelector("#page-topic-link .topic-aside__topic-indicator .hot-topic-item__name");
    if (indicator !== null) {
      const indicatorName = normalizeRailText(indicator.textContent).slice(0, 24);
      if (indicatorName !== "") return { topicId: match[1], name: indicatorName };
    }
    const header = document.querySelector("#page-topic-link .topic-link__header");
    let name = "";
    if (header !== null) {
      const heading = header.querySelector("h1, h2, [class*='name'], [class*='title']");
      if (heading !== null) name = normalizeRailText(heading.textContent).slice(0, 24);
    }
    if (name === "") name = normalizeRailText((document.title || "").replace(/[-_|].*$/, "")).slice(0, 24);
    return { topicId: match[1], name: name === "" ? "本社区" : name };
  }

  function buildCommunitySearchUrl(topicId, keyword, offset, timeRange, signed) {
    const query = new URLSearchParams({
      os_type: "web",
      app: "heybox",
      client_type: "web",
      version: "999.0.4",
      web_version: "2.5",
      x_client_type: "web",
      x_app: "heybox_website",
      x_os_type: "Windows",
      device_info: "Chrome",
      q: keyword,
      search_type: "link",
      is_pull_down: "0",
      offset: String(offset),
      limit: String(COMMUNITY_SEARCH_PAGE_SIZE),
      dw: "660",
      topic_id: String(topicId),
    });
    if (timeRange !== "") query.set("time_range", timeRange);
    if (signed === true) {
      const time = Math.floor(Date.now() / 1000);
      const nonce = md5Hex(String(time) + String(Math.random())).toUpperCase();
      query.set("hkey", createSignature(COMMUNITY_SEARCH_API_PATH, time, nonce));
      query.set("_time", String(time));
      query.set("nonce", nonce);
    }
    return "https://api.xiaoheihe.cn" + COMMUNITY_SEARCH_API_PATH + "?" + query.toString();
  }

  async function fetchCommunitySearchPage(url, signal) {
    let response;
    try {
      response = await fetchWithTimeout(url, { credentials: "include", headers: { accept: "application/json" }, signal: signal });
    } catch (error) {
      if (isAbortError(error)) return { ok: false, message: "搜索已取消", aborted: true };
      return { ok: false, message: error instanceof Error && error.message !== "" ? error.message : "网络请求失败，请稍后重试" };
    }
    if (response.ok !== true) return { ok: false, message: "接口返回 HTTP " + response.status };
    let data;
    try {
      data = await response.json();
    } catch (error) {
      return { ok: false, message: "接口返回非 JSON 内容，可能触发站点风控" };
    }
    if (!data || data.status !== "ok") {
      const status = data && typeof data.status === "string" ? data.status : "";
      const message = data && typeof data.msg === "string" && data.msg !== "" ? data.msg : status;
      return { ok: false, message: message === "" ? "接口返回失败状态" : message };
    }
    const result = data.result && typeof data.result === "object" ? data.result : {};
    const items = Array.isArray(result.items) ? result.items : [];
    // 接口每页会混入与帖子等量的空格占位条目；offset 只按真正的 link 条数推进。
    const linkCount = items.filter((entry) => entry && typeof entry === "object"
      && (typeof entry.type !== "string" || entry.type === "" || entry.type === "link")).length;
    const rawRanges = Array.isArray(result.time_range_list) ? result.time_range_list : [];
    const timeRanges = rawRanges
      .filter((entry) => entry && typeof entry === "object" && typeof entry.value === "string" && typeof entry.name === "string")
      .map((entry) => ({ value: entry.value, name: entry.name }));
    const scopedTip = typeof data.search_not_result_tips === "string" ? data.search_not_result_tips.trim() : "";
    const resultTip = typeof result.search_not_result_tips === "string" ? result.search_not_result_tips.trim() : "";
    return { ok: true, items, linkCount, timeRanges, tip: scopedTip !== "" ? scopedTip : resultTip };
  }

  async function requestCommunitySearch(topicId, keyword, offset, timeRange, signal) {
    // 站点搜索接口接受带签名的请求；签名被风控拒绝时退回不带签名的请求，两者都失败才报错。
    const signed = await fetchCommunitySearchPage(buildCommunitySearchUrl(topicId, keyword, offset, timeRange, true), signal);
    if (signed.aborted === true) return signed;
    if (signed.ok === true) return signed;
    const plain = await fetchCommunitySearchPage(buildCommunitySearchUrl(topicId, keyword, offset, timeRange, false), signal);
    return plain.ok === true ? plain : signed;
  }

  function pickSearchText(values) {
    for (const value of values) {
      if (typeof value === "string" && value.trim() !== "") return value.trim();
      if (typeof value === "number" && Number.isFinite(value)) return String(value);
    }
    return "";
  }

  function pickSearchNumber(values) {
    for (const value of values) {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return 0;
  }

  // 搜索结果的 link 条目与信息流 link 对象同构，但不同接口会缺字段，这里逐个兜底。
  function normalizeSearchResult(entry) {
    if (!entry || typeof entry !== "object") return null;
    if (typeof entry.type === "string" && entry.type !== "" && entry.type !== "link") return null;
    const info = entry.info && typeof entry.info === "object" ? entry.info : entry;
    const id = pickSearchText([info.linkid, info.link_id, info.id]);
    if (id === "") return null;
    const user = info.user && typeof info.user === "object" ? info.user : {};
    const thumbs = Array.isArray(info.thumbs) ? info.thumbs : [];
    return {
      id: id,
      title: pickSearchText([info.title, info.name]) || "无标题帖子",
      desc: normalizeRailText(pickSearchText([info.description, info.desc, info.text, info.content, info.summary])).slice(0, 160),
      author: pickSearchText([user.username, user.name, user.nickname]),
      thumb: pickSearchText([thumbs[0], info.thumb, info.cover, info.image]),
      createAt: pickSearchNumber([info.create_at, info.create_time, info.timestamp]),
      like: pickSearchNumber([info.like_num, info.like_count, info.up, info.likes]),
      comment: pickSearchNumber([info.comment_num, info.link_comment_num, info.comment_count, info.comments]),
    };
  }

  function createCommunitySearchItem(item) {
    const node = document.createElement("a");
    node.className = "item";
    node.href = LINK_HREF_PREFIX + item.id;
    node.addEventListener("click", (event) => {
      // 组合键与中键交给浏览器，保留新标签页打开。
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigateToPath(LINK_HREF_PREFIX + item.id);
    });
    if (item.thumb !== "") {
      const thumb = document.createElement("img");
      thumb.className = "item-thumb";
      thumb.src = item.thumb;
      thumb.alt = "";
      thumb.loading = "lazy";
      thumb.referrerPolicy = "no-referrer";
      node.append(thumb);
    }
    const title = document.createElement("h3");
    title.className = "item-title";
    title.textContent = item.title;
    node.append(title);
    if (item.desc !== "") {
      const desc = document.createElement("p");
      desc.className = "item-desc";
      desc.textContent = item.desc;
      node.append(desc);
    }
    const parts = [];
    if (item.author !== "") parts.push(item.author);
    if (item.createAt > 0) parts.push(formatRailAge(item.createAt));
    if (item.like > 0) parts.push("赞 " + item.like);
    if (item.comment > 0) parts.push("评论 " + item.comment);
    if (parts.length > 0) {
      const meta = document.createElement("p");
      meta.className = "item-meta";
      meta.textContent = parts.join(" · ");
      node.append(meta);
    }
    return node;
  }

  function createCommunitySearchPanel() {
    const root = document.createElement("section");
    root.id = COMMUNITY_SEARCH_ID;
    root.setAttribute("aria-label", "社区内搜索");

    const bar = document.createElement("form");
    bar.className = "bar";
    bar.setAttribute("role", "search");
    const icon = document.createElement("span");
    icon.className = "icon";
    icon.innerHTML = COMMUNITY_SEARCH_ICONS.search;
    const scope = document.createElement("span");
    scope.className = "scope";
    const input = document.createElement("input");
    input.className = "q";
    input.type = "search";
    input.name = "q";
    input.autocomplete = "off";
    input.placeholder = "搜索本社区的帖子";
    input.setAttribute("aria-label", "搜索本社区的帖子");
    const go = document.createElement("button");
    go.type = "submit";
    go.className = "go";
    go.textContent = "搜索";
    bar.append(icon, scope, input, go);

    const panel = document.createElement("div");
    panel.className = "panel";
    panel.hidden = true;

    const head = document.createElement("div");
    head.className = "head";
    const headText = document.createElement("div");
    headText.className = "head-text";
    const headTitle = document.createElement("p");
    headTitle.className = "head-title";
    const headMeta = document.createElement("p");
    headMeta.className = "head-meta";
    headMeta.setAttribute("role", "status");
    headMeta.setAttribute("aria-live", "polite");
    headText.append(headTitle, headMeta);
    const headActions = document.createElement("div");
    headActions.className = "head-actions";
    const globalLink = document.createElement("a");
    globalLink.className = "ghost";
    globalLink.href = "/app/search/list";
    globalLink.textContent = "全站搜索";
    globalLink.addEventListener("click", (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigateToPath(globalLink.getAttribute("href") || "/app/search/list");
    });
    const close = document.createElement("button");
    close.type = "button";
    close.className = "close";
    close.textContent = "返回社区";
    headActions.append(globalLink, close);
    head.append(headText, headActions);

    const filters = document.createElement("div");
    filters.className = "filters";
    filters.hidden = true;

    const list = document.createElement("div");
    list.className = "list";

    const foot = document.createElement("div");
    foot.className = "foot";
    foot.hidden = true;
    const more = document.createElement("button");
    more.type = "button";
    more.className = "more";
    more.textContent = "加载更多";
    const status = document.createElement("p");
    status.className = "status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    foot.append(more, status);

    panel.append(head, filters, list, foot);
    root.append(bar, panel);

    return { root, bar, input, scope, panel, headTitle, headMeta, globalLink, filters, list, foot, more, status, close };
  }

  function watchCommunitySearch() {
    if (!document.body) return;
    const ui = createCommunitySearchPanel();
    let state = null;
    let searchController = null;

    const pageNode = () => document.querySelector("#page-topic-link");
    const mainNode = () => document.querySelector("#page-topic-link .topic-link__main");

    const setActive = (active) => {
      const page = pageNode();
      if (page !== null) page.classList.toggle(COMMUNITY_SEARCH_ACTIVE_CLASS, active === true);
      ui.panel.hidden = active !== true;
    };

    const renderChips = () => {
      ui.filters.textContent = "";
      const ranges = state === null ? [] : state.timeRanges;
      if (ranges.length === 0) {
        ui.filters.hidden = true;
        return;
      }
      ui.filters.hidden = false;
      const build = (label, value) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip";
        chip.textContent = label;
        chip.setAttribute("aria-pressed", String(state !== null && state.timeRange === value));
        chip.addEventListener("click", () => {
          const current = state;
          if (current === null || current.loading === true || current.timeRange === value) return;
          current.timeRange = value;
          current.offset = 0;
          current.items = [];
          current.noMore = false;
          void run(true);
        });
        ui.filters.append(chip);
      };
      build("不限时间", "");
      for (const range of ranges) build(range.name, range.value);
    };

    const renderItems = () => {
      ui.list.textContent = "";
      const items = state === null ? [] : state.items;
      if (items.length > 0) {
        for (const item of items) ui.list.append(createCommunitySearchItem(item));
        return;
      }
      const empty = document.createElement("p");
      empty.className = "empty";
      if (state === null) empty.textContent = "";
      else if (state.loading === true) empty.textContent = "正在搜索…";
      else if (state.error !== "") empty.textContent = state.error;
      else if (state.tip !== "") empty.textContent = state.tip;
      else empty.textContent = "这个社区里没有匹配的帖子，换个关键词试试。";
      ui.list.append(empty);
    };

    const render = () => {
      if (state === null) return;
      ui.headTitle.textContent = "在「" + state.topicName + "」中搜索 “" + state.keyword + "”";
      const loaded = state.items.length;
      if (state.loading === true) {
        ui.headMeta.textContent = loaded === 0 ? "搜索中…" : "已加载 " + loaded + " 条，正在继续加载…";
      } else if (loaded === 0) {
        ui.headMeta.textContent = state.error === "" ? "" : "共 0 条";
      } else {
        ui.headMeta.textContent = "本社区已加载 " + loaded + " 条" + (state.noMore === true ? "" : "（还有更多）");
      }
      ui.globalLink.setAttribute("href", "/app/search/list?q=" + encodeURIComponent(state.keyword));
      renderChips();
      renderItems();
      const moreHadFocus = document.activeElement === ui.more;
      ui.foot.hidden = loaded > 0 || state.loading === true ? false : true;
      ui.more.hidden = state.noMore === true;
      ui.more.disabled = state.loading === true;
      if ((ui.more.hidden === true || ui.more.disabled === true) && moreHadFocus) ui.input.focus();
      if (state.status !== "") ui.status.textContent = state.status;
      else if (state.noMore === true && loaded > 0) ui.status.textContent = "已到最后一页";
      else ui.status.textContent = "";
    };

    const run = async (reset) => {
      const current = state;
      if (current === null || current.loading === true) return;
      current.loading = true;
      current.error = "";
      current.status = reset === true ? "" : "加载中…";
      render();
      const offset = reset === true ? 0 : current.offset;
      searchController?.abort();
      const controller = new AbortController();
      searchController = controller;
      const response = await requestCommunitySearch(current.topicId, current.keyword, offset, current.timeRange, controller.signal);
      if (state !== current || searchController !== controller) return;
      searchController = null;
      current.loading = false;
      current.status = "";
      if (response.aborted === true) {
        current.status = "搜索已取消";
        render();
        return;
      }
      if (response.ok !== true) {
        if (reset === true) {
          current.items = [];
          current.error = "搜索失败：" + response.message;
        } else {
          current.status = "加载失败：" + response.message;
        }
        render();
        return;
      }
      const known = new Set(current.items.map((item) => item.id));
      const incoming = [];
      for (const entry of response.items) {
        const item = normalizeSearchResult(entry);
        if (item === null || known.has(item.id)) continue;
        known.add(item.id);
        incoming.push(item);
      }
      current.items = reset === true ? incoming : current.items.concat(incoming);
      current.offset = offset + response.linkCount;
      current.noMore = response.linkCount === 0;
      current.tip = response.tip;
      if (current.timeRanges.length === 0 && response.timeRanges.length > 0) current.timeRanges = response.timeRanges;
      render();
    };

    const clearPanel = () => {
      ui.list.textContent = "";
      ui.filters.textContent = "";
      ui.filters.hidden = true;
      ui.foot.hidden = true;
      ui.headMeta.textContent = "";
    };

    const close = (restoreFocus) => {
      searchController?.abort();
      searchController = null;
      state = null;
      clearPanel();
      setActive(false);
      if (restoreFocus === true) ui.input.focus();
    };

    const submit = () => {
      const context = readTopicContext();
      if (context === null) return;
      const keyword = ui.input.value.trim();
      if (keyword === "") {
        ui.input.focus();
        return;
      }
      searchController?.abort();
      searchController = null;
      state = {
        topicId: context.topicId,
        topicName: context.name,
        keyword: keyword,
        timeRange: "",
        items: [],
        offset: 0,
        noMore: false,
        timeRanges: [],
        tip: "",
        error: "",
        status: "",
        loading: false,
      };
      setActive(true);
      render();
      void run(true);
    };

    ui.bar.addEventListener("submit", (event) => {
      event.preventDefault();
      submit();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || state === null || event.defaultPrevented === true) return;
      const target = event.target;
      if (target instanceof Element) {
        if (target !== ui.input && target.closest("input, textarea, select, [contenteditable]") !== null) return;
        const onPage = target === document.body || target === document.documentElement;
        if (onPage !== true && ui.root.contains(target) !== true) return;
        if (onPage === true) {
          const overlayOpen = Array.from(document.querySelectorAll("[aria-modal='true'], .el-overlay-dialog"))
            .some((node) => node.getClientRects().length > 0);
          if (overlayOpen === true) return;
        }
      }
      event.preventDefault();
      close(true);
    });
    ui.close.addEventListener("click", () => close(true));
    ui.more.addEventListener("click", () => {
      void run(false);
    });

    const sync = () => {
      ensureCommunitySearchStyle();
      const context = readTopicContext();
      const main = mainNode();
      if (context === null || main === null) {
        searchController?.abort();
        searchController = null;
        if (ui.root.parentNode !== null) ui.root.remove();
        if (state !== null) {
          state = null;
          clearPanel();
        }
        setActive(false);
        return;
      }
      const anchor = main.querySelector(".topic-link__filter-row");
      // 站点把筛选行放进了 .topic-link__panel，插入目标必须是它的实际父节点。
      const mount = anchor === null ? main : anchor.parentNode;
      const misplaced = ui.root.parentNode !== mount || (anchor !== null && ui.root.nextElementSibling !== anchor);
      if (misplaced === true) {
        if (anchor !== null) mount.insertBefore(ui.root, anchor);
        else mount.append(ui.root);
      }
      // 写入前先比对，避免 MutationObserver 被自身改动反复唤醒。
      if (ui.scope.textContent !== context.name) ui.scope.textContent = context.name;
      const placeholder = "在「" + context.name + "」中搜索帖子";
      if (ui.input.placeholder !== placeholder) ui.input.placeholder = placeholder;
      if (ui.input.getAttribute("aria-label") !== placeholder) ui.input.setAttribute("aria-label", placeholder);
      // 换到另一个社区时旧结果不再适用，直接回到信息流。
      if (state !== null && state.topicId !== context.topicId) {
        searchController?.abort();
        searchController = null;
        state = null;
        clearPanel();
      }
      setActive(state !== null);
    };

    registerPageSync(sync, 250, [PAGE_ROUTE.TOPIC], "topic");
    window.addEventListener("popstate", () => {
      if (state !== null) close(false);
    });
    sync();
  }

  // 桌面工作台：宽屏下把社区页排成左频道、中信息流、右热度三栏。
  // 站点原本是移动端单列思路，1600px 下仍有大半屏留白；这里只重排现有内容，不请求新接口。
  const DESKTOP_STYLE_ID = "heybox-up-desktop-style";
  const DESKTOP_LEFT_ID = "heybox-up-left-rail";
  const DESKTOP_RIGHT_ID = "heybox-up-right-rail";
  const DESKTOP_PAGE_CLASS = "heybox-up-desktop";
  const DESKTOP_HOT_TARGET_CLASS = "heybox-up-hot-target";
  const DESKTOP_HOT_LIMIT = 6;

  const DESKTOP_CSS = `
    #heybox-up-left-rail, #heybox-up-right-rail { display: none; }
    #heybox-up-left-rail,
    #heybox-up-right-rail {
      position: sticky;
      /* 桌面隐藏站点顶部搜索条后，侧栏直接停在导航下方。 */
      top: 80px;
      max-height: calc(100vh - 100px);
      overflow: auto;
      font: 13px/1.55 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
      color: var(--heybox-up-text-2, #3c4249);
      scrollbar-width: thin;
    }
    #heybox-up-left-rail .rail-block,
    #heybox-up-right-rail .rail-block {
      padding: 13px 10px;
      border: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1));
      border-radius: var(--heybox-up-radius-card, 14px);
      background: var(--heybox-up-surface, #fff);
      box-shadow: var(--heybox-up-shadow-1, none);
    }
    #heybox-up-left-rail .rail-block + .rail-block,
    #heybox-up-right-rail .rail-block + .rail-block { margin-top: 12px; }
    #heybox-up-left-rail .rail-title,
    #heybox-up-right-rail .rail-title {
      margin: 0 0 7px;
      padding: 0 8px;
      color: var(--heybox-up-muted, #6b7280);
      font-size: 11px;
      font-weight: 600;
      line-height: 1.5;
      letter-spacing: .08em;
    }
    #heybox-up-left-rail .rail-link,
    #heybox-up-left-rail .rail-channel,
    #heybox-up-right-rail .rail-link {
      display: flex;
      align-items: center;
      gap: 9px;
      width: 100%;
      height: 34px;
      margin: 0;
      padding: 0 8px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--heybox-up-text-2, #3c4249);
      font: inherit;
      font-size: 13px;
      line-height: 34px;
      text-align: left;
      text-decoration: none;
      white-space: nowrap;
      cursor: pointer;
      transition: background .14s ease, color .14s ease;
    }
    #heybox-up-left-rail .rail-link:hover,
    #heybox-up-left-rail .rail-channel:hover,
    #heybox-up-right-rail .rail-link:hover {
      background: var(--heybox-up-subtle, rgba(20, 25, 30, .06));
      color: var(--heybox-up-text, #14191e);
    }
    #heybox-up-left-rail .rail-link.is-active {
      background: rgba(111, 141, 179, .13);
      color: var(--heybox-up-accent, #6f8db3);
      font-weight: 600;
    }
    #heybox-up-left-rail .rail-link svg,
    #heybox-up-right-rail .rail-link svg { width: 17px; height: 17px; flex: none; }
    #heybox-up-left-rail .rail-channel img {
      width: 22px;
      height: 22px;
      flex: none;
      border-radius: 6px;
      object-fit: cover;
      background: var(--heybox-up-subtle, rgba(20, 25, 30, .06));
    }
    #heybox-up-left-rail .rail-channel .name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #heybox-up-left-rail .channels { max-height: 288px; overflow: auto; scrollbar-width: thin; }
    #heybox-up-left-rail .rail-link:focus-visible,
    #heybox-up-left-rail .rail-channel:focus-visible,
    #heybox-up-right-rail .rail-link:focus-visible,
    #heybox-up-right-rail .hot-item:focus-visible {
      outline: 2px solid var(--heybox-up-accent, #6f8db3);
      outline-offset: -2px;
    }
    #heybox-up-right-rail .hot-list {
      display: flex;
      flex-direction: column;
      gap: 1px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    #heybox-up-right-rail .hot-item {
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr);
      column-gap: 7px;
      width: 100%;
      margin: 0;
      padding: 8px 6px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
      transition: background .14s ease;
    }
    #heybox-up-right-rail .hot-item:hover { background: var(--heybox-up-subtle, rgba(20, 25, 30, .06)); }
    #heybox-up-right-rail .hot-rank {
      color: var(--heybox-up-muted, #6b7280);
      font-size: 12px;
      font-weight: 700;
      line-height: 1.5;
      font-variant-numeric: tabular-nums;
    }
    #heybox-up-right-rail .hot-item:nth-child(-n+3) .hot-rank { color: var(--heybox-up-accent, #6f8db3); }
    #heybox-up-right-rail .hot-title {
      display: -webkit-box;
      overflow: hidden;
      color: var(--heybox-up-text-2, #3c4249);
      font-size: 13px;
      line-height: 1.45;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }
    #heybox-up-right-rail .hot-item:hover .hot-title { color: var(--heybox-up-text, #14191e); }
    #heybox-up-right-rail .hot-meta {
      grid-column: 2;
      margin-top: 2px;
      color: var(--heybox-up-muted, #6b7280);
      font-size: 11px;
      line-height: 1.5;
    }
    #heybox-up-right-rail .rail-empty {
      margin: 0;
      padding: 10px 8px;
      color: var(--heybox-up-muted, #6b7280);
      font-size: 12px;
      line-height: 1.6;
    }
    #page-bbs-community .heybox-up-hot-target {
      border-color: var(--heybox-up-accent, #6f8db3) !important;
      box-shadow: 0 0 0 3px rgba(111, 141, 179, .18) !important;
    }
    @media (min-width: 1200px) {
      /* 顶部搜索条会横跨信息流、压住左栏上沿；桌面把搜索入口收进左栏“浏览”。
         站点还用固定 ::before 给搜索条铺 146px 高的遮罩；搜索条隐藏后把遮罩压到
         导航高度，既保留导航下方 16px 的顶部留白，也避免滚动时正文从留白处露出。 */
      #page-bbs-community.heybox-up-desktop .bbs-community__search-module {
        display: none !important;
      }
      #page-bbs-community.heybox-up-desktop::before {
        bottom: auto !important;
        height: 80px !important;
      }
      /* 站点还让 main.list 的 8px sticky 伪元素停在原搜索条下沿；搜索条隐藏后
         它会在 138px 处横切信息流并截获点击。保留其占位，取消吸顶与绘制。 */
      #page-bbs-community.heybox-up-desktop main.list::before {
        position: static !important;
        background: transparent !important;
        pointer-events: none !important;
      }
      #page-bbs-community.heybox-up-desktop .content {
        display: grid !important;
        width: 100% !important;
        /* 左右两列等宽，中间栏永远落在视口正中；两侧栏贴近中间栏而不是贴屏幕边。 */
        grid-template-columns:
          minmax(0, 1fr)
          /* 中栏再宽也要给两侧栏留出 208px + 288px + 间距，否则侧栏会压到正文上。 */
          minmax(320px, min(var(--heybox-up-feed-w), calc(100vw - 560px)))
          minmax(0, 1fr);
        column-gap: 24px;
        align-items: start;
        max-width: none !important;
        margin: 0 auto !important;
        justify-content: stretch !important;
      }
      #page-bbs-community.heybox-up-desktop .content > #heybox-up-left-rail {
        display: block;
        grid-column: 1;
        grid-row: 1;
        justify-self: end;
        width: 208px;
        align-self: start;
      }
      #page-bbs-community.heybox-up-desktop .content > main.list {
        grid-column: 2;
        grid-row: 1;
        width: auto !important;
        max-width: none !important;
        min-width: 0;
        margin: 0 !important;
        flex: none !important;
      }
      /* 评论预览只占右侧一列的真实宽度。旧实现再叠一层“侧栏 + 48px”右内边距，
         会在面板与信息流之间留下近乎双倍于面板的空白，并把中栏挤向左侧。 */
      body.heybox-up-rail-open #app > main { max-width: none !important; }
      body.heybox-up-rail-open #page-bbs-community.heybox-up-desktop .content {
        grid-template-columns:
          minmax(var(--heybox-up-rail-w), 1fr)
          minmax(320px, min(var(--heybox-up-feed-w), calc(100% - var(--heybox-up-rail-w) - var(--heybox-up-rail-w) - 48px)))
          minmax(var(--heybox-up-rail-w), 1fr);
        column-gap: 24px;
      }
      /* 左栏已有频道列表，原生横向频道条不再重复出现。 */
      #page-bbs-community.heybox-up-desktop .bbs-home__topic-list-wrapper {
        display: none !important;
      }
    }
    @media (min-width: 1500px) {
      body.heybox-up-desktop-on #app > main {
        max-width: none !important;
      }
      body.heybox-up-desktop-on #page-bbs-community {
        max-width: none !important;
        width: auto !important;
      }
      #page-bbs-community.heybox-up-desktop .content > #heybox-up-right-rail {
        display: block;
        grid-column: 3;
        grid-row: 1;
        justify-self: start;
        width: 288px;
        align-self: start;
      }
    }
    @media (min-width: 1500px) {
      body.heybox-up-rail-open #page-bbs-community.heybox-up-desktop #heybox-up-right-rail {
        display: none;
      }
    }
  `;

  function ensureDesktopStyle() {
    ensureStyleElement(DESKTOP_STYLE_ID, DESKTOP_CSS);
  }

  function parseCompactCount(value) {
    const match = /([0-9]+(?:\.[0-9]+)?)\s*(亿|万)?/.exec(value || "");
    if (match === null) return 0;
    const base = Number(match[1]);
    if (!Number.isFinite(base)) return 0;
    const unit = match[2] === "亿" ? 100000000 : match[2] === "万" ? 10000 : 1;
    return Math.round(base * unit);
  }

  function createDesktopRailLink(item, active) {
    const link = document.createElement("a");
    link.className = "rail-link" + (active === true ? " is-active" : "");
    link.href = item.href;
    link.dataset.route = item.id;
    link.innerHTML = item.icon;
    const label = document.createElement("span");
    label.textContent = item.label;
    link.append(label);
    link.addEventListener("click", (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigateToPath(item.href);
    });
    return link;
  }

  function createDesktopLeftRail() {
    const root = document.createElement("aside");
    root.id = DESKTOP_LEFT_ID;
    root.setAttribute("aria-label", "浏览与频道");

    const browse = document.createElement("section");
    browse.className = "rail-block";
    const browseTitle = document.createElement("p");
    browseTitle.className = "rail-title";
    browseTitle.textContent = "浏览";
    browse.append(browseTitle);
    const links = [
      { id: "community", label: "社区首页", href: "/app/bbs/home", icon: NAV_ICONS.community },
      { id: "favour", label: "我的收藏", href: "/app/user/favour/content", icon: NAV_ICONS.favour },
      { id: "article", label: "我的文章", href: "/creator/content_management/home?article_type=all", icon: NAV_ICONS.article },
      { id: "search", label: "全站搜索", href: "/app/search/list", icon: COMMUNITY_SEARCH_ICONS.search },
    ];
    for (const item of links) browse.append(createDesktopRailLink(item, item.id === "community"));

    const channelBlock = document.createElement("section");
    channelBlock.className = "rail-block";
    const channelTitle = document.createElement("p");
    channelTitle.className = "rail-title";
    channelTitle.textContent = "频道";
    const channels = document.createElement("div");
    channels.className = "channels";
    channelBlock.append(channelTitle, channels);
    root.append(browse, channelBlock);
    return { root, channels };
  }

  function createDesktopRightRail() {
    const root = document.createElement("aside");
    root.id = DESKTOP_RIGHT_ID;
    root.setAttribute("aria-label", "热门与快捷入口");

    const hotBlock = document.createElement("section");
    hotBlock.className = "rail-block";
    const hotTitle = document.createElement("p");
    hotTitle.className = "rail-title";
    hotTitle.textContent = "热门排行";
    const hot = document.createElement("ol");
    hot.className = "hot-list";
    hotBlock.append(hotTitle, hot);

    const toolsBlock = document.createElement("section");
    toolsBlock.className = "rail-block";
    const toolsTitle = document.createElement("p");
    toolsTitle.className = "rail-title";
    toolsTitle.textContent = "快捷入口";
    toolsBlock.append(toolsTitle);
    const tools = [
      { id: "favour", label: "我的收藏", href: "/app/user/favour/content", icon: NAV_ICONS.favour },
      { id: "article", label: "我的文章", href: "/creator/content_management/home?article_type=all", icon: NAV_ICONS.article },
    ];
    for (const item of tools) toolsBlock.append(createDesktopRailLink(item, false));
    root.append(hotBlock, toolsBlock);
    return { root, hot };
  }

  function readDesktopChannels() {
    return Array.from(document.querySelectorAll("#page-bbs-community .bbs-home__topic-item")).map((button) => {
      const nameNode = button.querySelector(".bbs-home__topic-name");
      const imageNode = button.querySelector("img.bbs-home__topic-item-icon");
      const name = normalizeRailText(nameNode === null ? button.textContent : nameNode.textContent).slice(0, 24);
      return { name, icon: imageNode === null ? "" : imageNode.getAttribute("src") || "" };
    }).filter((entry) => entry.name !== "");
  }

  function syncDesktopChannels(ui, cache) {
    const channels = readDesktopChannels();
    const signature = channels.map((entry) => entry.name + "\u0001" + entry.icon).join("\u0002");
    if (signature === cache.channels) return;
    cache.channels = signature;
    ui.channels.textContent = "";
    if (channels.length === 0) {
      const empty = document.createElement("p");
      empty.className = "rail-empty";
      empty.textContent = "频道列表还没渲染好";
      ui.channels.append(empty);
      return;
    }
    for (const channel of channels) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "rail-channel";
      if (channel.icon !== "") {
        const icon = document.createElement("img");
        icon.src = channel.icon;
        icon.alt = "";
        icon.loading = "lazy";
        icon.referrerPolicy = "no-referrer";
        button.append(icon);
      }
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = channel.name;
      button.append(name);
      button.addEventListener("click", () => {
        const native = Array.from(document.querySelectorAll("#page-bbs-community .bbs-home__topic-item")).find((node) => {
          const label = node.querySelector(".bbs-home__topic-name");
          return normalizeRailText(label === null ? node.textContent : label.textContent) === channel.name;
        });
        if (!native) return;
        for (const node of ui.channels.querySelectorAll(".rail-channel")) node.classList.remove("is-active");
        button.classList.add("is-active");
        native.click();
      });
      ui.channels.append(button);
    }
  }

  function readDesktopHotItems() {
    return Array.from(document.querySelectorAll("#page-bbs-community .bbs-home__content-item")).map((card, index) => {
      const link = card.querySelector("a[href*='/app/bbs/link/']");
      const href = link === null ? "" : link.getAttribute("href") || "";
      const idMatch = /\/app\/bbs\/link\/(\d+)/.exec(href);
      const titleNode = card.querySelector(".bbs-content__title");
      const title = normalizeRailText(titleNode === null ? card.textContent : titleNode.textContent).slice(0, 80);
      const commentNode = card.querySelector(".bbs-new-style-bottom__comment, .content-list__comment");
      const likeNode = card.querySelector(".bbs-new-style-bottom__like, .content-list__like");
      const comment = parseCompactCount(commentNode === null ? "" : commentNode.textContent);
      const like = parseCompactCount(likeNode === null ? "" : likeNode.textContent);
      return { card, index, id: idMatch === null ? "i" + index : idMatch[1], title, comment, like, score: comment * 2 + like };
    }).filter((entry) => entry.title !== "").sort((left, right) => right.score - left.score).slice(0, DESKTOP_HOT_LIMIT);
  }

  function syncDesktopHot(ui, cache) {
    const items = readDesktopHotItems();
    const signature = items.map((item) => item.id + ":" + item.score + ":" + item.title).join("|");
    if (signature === cache.hot) return;
    cache.hot = signature;
    ui.hot.textContent = "";
    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "rail-empty";
      empty.textContent = "信息流还没有可排序的热度数据";
      ui.hot.append(empty);
      return;
    }
    items.forEach((item, index) => {
      const row = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "hot-item";
      const rank = document.createElement("span");
      rank.className = "hot-rank";
      rank.textContent = String(index + 1);
      const title = document.createElement("span");
      title.className = "hot-title";
      title.textContent = item.title;
      const meta = document.createElement("span");
      meta.className = "hot-meta";
      const parts = [];
      if (item.comment > 0) parts.push(item.comment + " 评论");
      if (item.like > 0) parts.push(item.like + " 赞");
      meta.textContent = parts.length === 0 ? "当前信息流" : parts.join(" · ");
      button.append(rank, title, meta);
      button.addEventListener("click", () => {
        item.card.scrollIntoView({ behavior: "smooth", block: "center" });
        item.card.classList.add(DESKTOP_HOT_TARGET_CLASS);
        window.setTimeout(() => item.card.classList.remove(DESKTOP_HOT_TARGET_CLASS), 1400);
      });
      row.append(button);
      ui.hot.append(row);
    });
  }

  function watchDesktopShell() {
    if (!document.body) return;
    const desktopViewport = window.matchMedia("(min-width: 1200px)");
    const left = createDesktopLeftRail();
    const right = createDesktopRightRail();
    const cache = { channels: "", hot: "" };
    let lastDesktopSyncAt = 0;
    let lastDesktopPath = location.pathname;

    const teardown = () => {
      document.body.classList.remove("heybox-up-desktop-on");
      const page = document.querySelector("#page-bbs-community");
      if (page !== null) page.classList.remove(DESKTOP_PAGE_CLASS);
      if (left.root.parentNode !== null) left.root.remove();
      if (right.root.parentNode !== null) right.root.remove();
    };

    const sync = (force = false) => {
      const now = performance.now();
      if (location.pathname !== lastDesktopPath) {
        lastDesktopPath = location.pathname;
        force = true;
      }
      if (!force && now - lastDesktopSyncAt < 500) return;
      lastDesktopSyncAt = now;
      if (!desktopViewport.matches) {
        teardown();
        return;
      }
      const page = document.querySelector("#page-bbs-community");
      const content = page === null ? null : page.querySelector(".content");
      if (page === null || content === null || page.querySelector("main.list") === null) {
        teardown();
        return;
      }
      ensureDesktopStyle();
      page.classList.add(DESKTOP_PAGE_CLASS);
      document.body.classList.add("heybox-up-desktop-on");
      if (left.root.parentNode !== content) content.prepend(left.root);
      if (right.root.parentNode !== content) content.append(right.root);
      syncDesktopChannels(left, cache);
      syncDesktopHot(right, cache);
    };

    registerPageSync(sync, 400, [PAGE_ROUTE.FEED], "feed");
    window.addEventListener("popstate", () => requestAnimationFrame(() => sync(true)));
    desktopViewport.addEventListener("change", () => sync(true));
    sync(true);
  }

  function boot() {
    applyHideCyPreference(readHideCyPreference());
    const navigation = createPostNavigationController();
    watchTheme();
    watchTopNav();
    watchCommentSort();
    watchFavourPage();
    watchCommentRail();
    watchPostPager(navigation);
    watchReader(navigation);
    watchCommunitySearch();
    watchDesktopShell();
    startPageSyncObserver();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
