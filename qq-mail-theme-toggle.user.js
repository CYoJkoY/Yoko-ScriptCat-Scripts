// ==UserScript==
// @name         QQ Mail Theme Toggle
// @namespace    https://cyojkoy.github.io/Payment/
// @version      1.1.0
// @description  在QQ邮箱网页版左下角添加深浅主题切换按钮；深色主题通过替换界面配色令牌生效，不做反色，邮件正文与其中的图片、视频始终保持原始配色，偏好持久化并可跟随系统主题。
// @author       Yoko
// @updateURL    https://cdn.jsdelivr.net/gh/CYoJkoY/Yoko-ScriptCat-Scripts@release/qq-mail-theme-toggle.user.js
// @downloadURL  https://ghfast.top/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/release/qq-mail-theme-toggle.user.js
// @match        https://wx.mail.qq.com/home/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @noframes
// @icon         data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%20role%3D%22img%22%20aria-label%3D%22QQ%20Mail%20Theme%20Toggle%22%3E%20%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2214%22%20fill%3D%22%230f172a%22%2F%3E%20%3Cpath%20d%3D%22M14%2020h30v22H14z%22%20fill%3D%22none%22%20stroke%3D%22%2338bdf8%22%20stroke-width%3D%222.5%22%2F%3E%20%3Cpath%20d%3D%22M14%2022l15%2012%2015-12%22%20fill%3D%22none%22%20stroke%3D%22%2338bdf8%22%20stroke-width%3D%222.5%22%2F%3E%20%3Ccircle%20cx%3D%2246%22%20cy%3D%2244%22%20r%3D%229%22%20fill%3D%22%23fbbf24%22%2F%3E%20%3Cpath%20d%3D%22M42%2044a4%204%200%200%200%208%200%205%205%200%200%201-8%200z%22%20fill%3D%22%230f172a%22%2F%3E%20%3C%2Fsvg%3E
// @license      MIT
// ==/UserScript==

"use strict";
(() => {
  // scripts/qq-mail-theme-toggle/src/config.ts
  var SCRIPT_MARKER_ATTRIBUTE = "data-yoko-qq-mail-theme-ready";
  var THEME_ATTRIBUTE = "data-yoko-qq-mail-theme";
  var STYLE_ID = "yoko-qq-mail-theme-style";
  var BUTTON_ID = "yoko-qq-mail-theme-toggle";
  var BUTTON_CLASS = "yoko-qq-mail-theme-button";
  var STORAGE_KEY = "yoko_qq_mail_theme_mode";
  var THEME_MODE = Object.freeze({
    LIGHT: "light",
    DARK: "dark"
  });
  var SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";
  var BUTTON_LABELS = Object.freeze({
    toDark: "切换到深色主题",
    toLight: "切换到浅色主题"
  });

  // scripts/qq-mail-theme-toggle/src/core/apply.ts
  function applyTheme(doc, mode) {
    const root2 = doc.documentElement;
    if (root2 === null) return;
    if (mode === THEME_MODE.DARK) {
      root2.setAttribute(THEME_ATTRIBUTE, THEME_MODE.DARK);
      return;
    }
    root2.removeAttribute(THEME_ATTRIBUTE);
  }
  function releaseTheme(doc) {
    const root2 = doc.documentElement;
    root2?.removeAttribute(THEME_ATTRIBUTE);
  }

  // shared/storage/keyValue.ts
  var DEFAULT_MESSAGES = {
    read: "[shared/storage] read failed",
    write: "[shared/storage] write failed",
    remove: "[shared/storage] remove failed",
    parse: "[shared/storage] invalid JSON"
  };
  function reportFailure(options, operation, error) {
    if (options.onError !== void 0) {
      options.onError({ operation, error });
      return;
    }
    console.error(DEFAULT_MESSAGES[operation], error);
  }
  function createStringStorage(storage, options = {}) {
    const memory = /* @__PURE__ */ new Map();
    const useCache = options.cache !== false;
    const read = (key) => {
      if (useCache) {
        const cached = memory.get(key);
        if (cached !== void 0) return cached;
      }
      try {
        const value = storage.getItem(key);
        if (useCache && value !== null) memory.set(key, value);
        return value;
      } catch (error) {
        reportFailure(options, "read", error);
        return null;
      }
    };
    const write = (key, value) => {
      if (useCache) memory.set(key, value);
      try {
        storage.setItem(key, value);
        return true;
      } catch (error) {
        reportFailure(options, "write", error);
        return false;
      }
    };
    const remove = (key) => {
      if (useCache) memory.delete(key);
      try {
        storage.removeItem(key);
        return true;
      } catch (error) {
        reportFailure(options, "remove", error);
        return false;
      }
    };
    return {
      read,
      write,
      readJson: (key, fallback) => {
        const raw = read(key);
        if (raw === null) return fallback;
        try {
          return JSON.parse(raw);
        } catch (error) {
          reportFailure(options, "parse", error);
          return fallback;
        }
      },
      writeJson: (key, value) => {
        let serialized;
        try {
          serialized = JSON.stringify(value);
        } catch (error) {
          reportFailure(options, "write", error);
          return false;
        }
        return write(key, serialized);
      },
      remove
    };
  }
  function isStorageArea(value) {
    if (typeof value !== "object" || value === null) return false;
    return "getItem" in value && "setItem" in value && "removeItem" in value;
  }
  function resolveArea(kind) {
    const area = kind === "localStorage" ? window.localStorage : window.sessionStorage;
    if (!isStorageArea(area)) {
      throw new Error(kind + " is unavailable in this frame");
    }
    return area;
  }
  function getBrowserStorage(kind, options = {}) {
    return createStringStorage(
      {
        getItem: (key) => resolveArea(kind).getItem(key),
        setItem: (key, value) => resolveArea(kind).setItem(key, value),
        removeItem: (key) => resolveArea(kind).removeItem(key)
      },
      options
    );
  }

  // shared/storage/gmStorage.ts
  function asGranted(value) {
    if (typeof value !== "function") return null;
    return value;
  }
  function callGranted(granted, scope, args) {
    const result = Reflect.apply(granted, scope, args);
    return result;
  }
  function resolveApi(scope) {
    const rawGet = asGranted(Reflect.get(scope, "GM_getValue"));
    const rawSet = asGranted(Reflect.get(scope, "GM_setValue"));
    const rawDelete = asGranted(Reflect.get(scope, "GM_deleteValue"));
    return {
      getValue: rawGet === null ? void 0 : (key, fallback) => callGranted(rawGet, scope, [key, fallback]),
      setValue: rawSet === null ? void 0 : (key, value) => {
        callGranted(rawSet, scope, [key, value]);
      },
      deleteValue: rawDelete === null ? void 0 : (key) => {
        callGranted(rawDelete, scope, [key]);
      }
    };
  }
  function createGmStorage(scope = globalThis, options = {}) {
    const api = resolveApi(scope);
    const getValue = api.getValue;
    const setValue = api.setValue;
    if (getValue === void 0 || setValue === void 0) {
      return options.fallback ?? createStringStorage(createMemoryStorage(), options);
    }
    const deleteValue = api.deleteValue;
    const backing = {
      getItem: (key) => {
        const value = getValue(key, null);
        if (value === null || value === void 0) return null;
        return typeof value === "string" ? value : JSON.stringify(value);
      },
      setItem: (key, value) => {
        setValue(key, value);
      },
      removeItem: (key) => {
        if (deleteValue === void 0) {
          throw new Error("GM_deleteValue is not granted");
        }
        deleteValue(key);
      }
    };
    return createStringStorage(backing, options);
  }
  function createMemoryStorage() {
    const values = /* @__PURE__ */ new Map();
    return {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      }
    };
  }

  // scripts/qq-mail-theme-toggle/src/core/theme.ts
  function normalizeThemeMode(value) {
    if (value === THEME_MODE.DARK) return THEME_MODE.DARK;
    if (value === THEME_MODE.LIGHT) return THEME_MODE.LIGHT;
    return null;
  }
  function resolveThemeMode(preference, systemPrefersDark) {
    if (preference !== null) return preference;
    return systemPrefersDark ? THEME_MODE.DARK : THEME_MODE.LIGHT;
  }
  function toggleThemeMode(current) {
    return current === THEME_MODE.DARK ? THEME_MODE.LIGHT : THEME_MODE.DARK;
  }
  function createSystemDarkQuery(view) {
    if (view === null || typeof view.matchMedia !== "function") {
      return { matches: false, subscribe: () => () => void 0 };
    }
    const matcher = view.matchMedia(SYSTEM_DARK_QUERY);
    return {
      get matches() {
        return matcher.matches === true;
      },
      subscribe: (listener) => {
        const handler = () => listener();
        if (typeof matcher.addEventListener === "function") {
          matcher.addEventListener("change", handler);
          return () => matcher.removeEventListener("change", handler);
        }
        matcher.addListener(handler);
        return () => matcher.removeListener(handler);
      }
    };
  }

  // scripts/qq-mail-theme-toggle/src/core/preference.ts
  function createThemePreference(scope = globalThis) {
    const storage = createGmStorage(scope, {
      fallback: getBrowserStorage("localStorage", { onError: () => void 0 })
    });
    return {
      read: () => normalizeThemeMode(storage.read(STORAGE_KEY)),
      write: (mode) => {
        storage.write(STORAGE_KEY, mode);
      }
    };
  }

  // scripts/qq-mail-theme-toggle/src/core/style.ts
  var DARK_TOKENS = Object.freeze([
    ["--base_white_100", "#1A2028"],
    ["--base_white_090", "rgba(26, 32, 40, 0.9)"],
    ["--base_white_080", "rgba(26, 32, 40, 0.8)"],
    ["--base_white_070", "rgba(26, 32, 40, 0.7)"],
    ["--base_white_060", "rgba(26, 32, 40, 0.6)"],
    ["--base_white_050", "rgba(26, 32, 40, 0.5)"],
    ["--base_white_040", "rgba(26, 32, 40, 0.4)"],
    ["--base_white_030", "rgba(26, 32, 40, 0.3)"],
    ["--base_white_025", "rgba(26, 32, 40, 0.25)"],
    ["--base_white_020", "rgba(26, 32, 40, 0.2)"],
    ["--base_white_015", "rgba(26, 32, 40, 0.15)"],
    ["--base_white_010", "rgba(26, 32, 40, 0.1)"],
    ["--base_white_007", "rgba(26, 32, 40, 0.07)"],
    ["--base_white_005", "rgba(26, 32, 40, 0.05)"],
    ["--base_white_003", "rgba(26, 32, 40, 0.03)"],
    ["--base_gray_100", "#E8ECF1"],
    ["--base_gray_090", "rgba(232, 236, 241, 0.9)"],
    ["--base_gray_080", "rgba(232, 236, 241, 0.8)"],
    ["--base_gray_070", "rgba(232, 236, 241, 0.7)"],
    ["--base_gray_060", "rgba(232, 236, 241, 0.6)"],
    ["--base_gray_050", "rgba(232, 236, 241, 0.5)"],
    ["--base_gray_040", "rgba(232, 236, 241, 0.4)"],
    ["--base_gray_030", "rgba(232, 236, 241, 0.3)"],
    ["--base_gray_025", "rgba(232, 236, 241, 0.25)"],
    ["--base_gray_020", "rgba(232, 236, 241, 0.2)"],
    ["--base_gray_015", "rgba(232, 236, 241, 0.15)"],
    ["--base_gray_010", "rgba(232, 236, 241, 0.1)"],
    ["--base_gray_007", "rgba(232, 236, 241, 0.07)"],
    ["--base_gray_005", "rgba(232, 236, 241, 0.05)"],
    ["--base_gray_003", "rgba(232, 236, 241, 0.03)"],
    ["--base_black", "#E8ECF1"],
    ["--bg_white_web", "#1A2028"],
    ["--bg_white_web_alpha_090", "rgba(26, 32, 40, 0.9)"],
    ["--bg_gray_web_0", "#0F1419"],
    ["--bg_gray_web_1", "#13181D"],
    ["--bg_gray_web_2", "#1A2028"],
    ["--bg_gray_web_3", "#20262E"],
    ["--bg_segmented_control_option_selected", "#262D36"],
    ["--bg_panel_blur_stroke", "#3A4049"],
    ["--bg_switch_grabber", "#E8ECF1"],
    ["--bg_invoiceCard_unselected_hover", "#20262E"],
    ["--shadow_1", "0 2px 3px 0 rgba(0, 0, 0, 0.35)"]
  ]);
  var LIGHT_TOKENS = Object.freeze([
    ["--base_white_100", "#FFFFFF"],
    ["--base_white_090", "rgba(255, 255, 255, 0.9)"],
    ["--base_white_080", "rgba(255, 255, 255, 0.8)"],
    ["--base_white_070", "rgba(255, 255, 255, 0.7)"],
    ["--base_white_060", "rgba(255, 255, 255, 0.6)"],
    ["--base_white_050", "rgba(255, 255, 255, 0.5)"],
    ["--base_white_040", "rgba(255, 255, 255, 0.4)"],
    ["--base_white_030", "rgba(255, 255, 255, 0.3)"],
    ["--base_white_025", "rgba(255, 255, 255, 0.25)"],
    ["--base_white_020", "rgba(255, 255, 255, 0.2)"],
    ["--base_white_015", "rgba(255, 255, 255, 0.15)"],
    ["--base_white_010", "rgba(255, 255, 255, 0.1)"],
    ["--base_white_007", "rgba(255, 255, 255, 0.07)"],
    ["--base_white_005", "rgba(255, 255, 255, 0.05)"],
    ["--base_white_003", "rgba(255, 255, 255, 0.03)"],
    ["--base_gray_100", "#13181D"],
    ["--base_gray_090", "rgba(21, 26, 33, 0.9)"],
    ["--base_gray_080", "rgba(22, 30, 38, 0.8)"],
    ["--base_gray_070", "rgba(23, 33, 43, 0.7)"],
    ["--base_gray_060", "rgba(24, 36, 48, 0.6)"],
    ["--base_gray_050", "rgba(25, 38, 54, 0.5)"],
    ["--base_gray_040", "rgba(25, 41, 59, 0.4)"],
    ["--base_gray_030", "rgba(24, 43, 64, 0.3)"],
    ["--base_gray_025", "rgba(24, 44, 66, 0.25)"],
    ["--base_gray_020", "rgba(23, 45, 69, 0.2)"],
    ["--base_gray_015", "rgba(23, 46, 71, 0.15)"],
    ["--base_gray_010", "rgba(22, 46, 74, 0.1)"],
    ["--base_gray_007", "rgba(21, 46, 74, 0.07)"],
    ["--base_gray_005", "rgba(20, 46, 77, 0.05)"],
    ["--base_gray_003", "rgba(19, 46, 64, 0.03)"],
    ["--base_black", "#000000"],
    ["--bg_white_web", "#FFFFFF"],
    ["--bg_white_web_alpha_090", "rgba(255, 255, 255, 0.9)"],
    ["--bg_gray_web_0", "#E6EDF5"],
    ["--bg_gray_web_1", "#F2F7FA"],
    ["--bg_gray_web_2", "#F7FAFC"],
    ["--bg_gray_web_3", "#FAFBFC"],
    ["--bg_segmented_control_option_selected", "#FFFFFF"],
    ["--bg_panel_blur_stroke", "#FFFFFF"],
    ["--bg_switch_grabber", "#FFFFFF"],
    ["--bg_invoiceCard_unselected_hover", "#F3F4F6"],
    ["--shadow_1", "0 2px 3px 0 rgba(19, 24, 29, 0.12)"]
  ]);
  var ON_ACCENT = "#FFFFFF";
  var ON_ACCENT_MUTED = "rgba(255, 255, 255, 0.8)";
  var SHELL_RULES = Object.freeze([
    [
      ".frame-sidebar",
      [
        ["--feature-title-color", "var(--base_gray_080)"],
        ["--sidebar-divider-color", "var(--base_gray_010)"]
      ]
    ],
    [
      ".frame-sidebar-menu",
      [
        ["--color", "var(--base_gray_100)"],
        ["--total-color", "var(--base_gray_060)"],
        ["--red-dot-tips-color", "var(--base_gray_060)"],
        ["--left-icon-color", "var(--base_gray_080)"],
        ["--feature-icon-color", "var(--base_gray_100)"],
        ["--lock-icon-color", "var(--base_gray_050)"],
        ["--hover-bg", "var(--base_gray_020)"],
        ["--active-bg", "var(--base_gray_040)"]
      ]
    ],
    [
      ".frame-sidebar-menu.sidebar-menu-active",
      [
        ["--bg", "var(--base_gray_030)"],
        ["--hover-bg", "var(--base_gray_040)"],
        ["--active-bg", "var(--base_gray_050)"],
        ["--total-color", "var(--base_gray_100)"]
      ]
    ],
    [".frame-sidebar .frame-sidebar-menu-right-btn", [["--color", "var(--base_gray_070)"]]],
    [".frame-sidebar-menu-left-btn", [["--icon-color", "var(--base_gray_060)"]]],
    [
      ".frame-sidebar-setting-menus",
      [
        ["--back-btn-color", "var(--base_gray_100)"],
        ["--back-btn-icon-color", "var(--base_gray_080)"],
        ["--group-title-color", "var(--base_gray_060)"]
      ]
    ],
    [
      ".frame-sidebar-compose-btn",
      [
        ["--base-bg", "#2A333E"],
        ["--border-color", "#3A4049"],
        ["--color", "var(--base_gray_100)"],
        ["--icon-color", "var(--base_gray_100)"]
      ]
    ],
    [".frame-sidebar-my-files-menu-icon", [["color", "var(--base_gray_100)"]]],
    [".frame-header-setting-btn", [["--color", "var(--base_gray_080)"]]],
    [
      ".frame-header-auto-reply-btn",
      [
        ["--bg", "var(--base_gray_030)"],
        ["--border-color", "var(--base_gray_060)"],
        ["--color", "var(--base_gray_100)"],
        ["--icon-color", "var(--base_gray_100)"],
        ["--down-icon-color", "var(--base_gray_050)"]
      ]
    ],
    [
      ".xmail-cmp-profile-btn",
      [
        ["--nick-color", "var(--base_gray_100)"],
        ["--email-color", "var(--base_gray_080)"]
      ]
    ],
    [
      ".mail-lazy-search-wrap",
      [
        ["--bg", "var(--base_gray_030)"],
        ["--search-icon-color", "var(--base_gray_080)"],
        ["--placeholder-text-color", "var(--base_gray_040)"]
      ]
    ],
    [
      ".cmp-vip-state-icon:not(.cmp-vip-icon-in-panel)",
      [["--vip-icon-color", "var(--base_gray_080)"]]
    ]
  ]);
  var ON_ACCENT_RULES = Object.freeze([
    [
      ".xmail-ui-btn.ui-btn-them-black, .xmail-ui-btn.ui-btn-them-blue, .xmail-ui-btn.ui-btn-them-vip",
      [
        ["--color", ON_ACCENT],
        ["--icon-color", ON_ACCENT]
      ]
    ],
    [".xmail-ui-toast .ui-toast-msg", [["color", ON_ACCENT]]],
    [".xmail-cmp-mail-tag .cmp-mail-tag-name", [["color", ON_ACCENT]]],
    [".cmp-mail-tag-del-btn", [["color", ON_ACCENT]]],
    [".cmp-mail-tag-del-btn:hover", [["color", ON_ACCENT_MUTED]]],
    [".cmp-mail-tag-del-btn:active", [["color", ON_ACCENT]]],
    [".mail-list-page-item .mail-tags .more-tag", [["color", ON_ACCENT]]],
    [".mail-detail-remark-bar .remark-save-btn", [["color", ON_ACCENT]]],
    [
      ".mail-list-page-toolbar-data-panel .monthly-item.monthly-item-selected",
      [["color", ON_ACCENT]]
    ],
    [
      ".xmail-cmp-date-picker-panel .rc-picker-cell-selected .rc-picker-cell-inner",
      [["color", ON_ACCENT]]
    ],
    [
      ".xmail-ui-radio.ui-radio-checked",
      [
        ["--checked-icon-inner-hover", ON_ACCENT],
        ["--checked-icon-inner-active", ON_ACCENT]
      ]
    ],
    [".xmail-ui-progress-bar.ui-progress-theme-white", [["--fill-bg", ON_ACCENT]]],
    [
      ".xmail-cmp-vip-float-bubble .cmp-vip-float-bubble-body",
      [["--arrow-bg", ON_ACCENT]]
    ]
  ]);
  function darkGate() {
    return `html[${THEME_ATTRIBUTE}="${THEME_MODE.DARK}"]`;
  }
  function tokenLines(tokens) {
    return tokens.map(([name, value]) => `  ${name}: ${value};`);
  }
  function rulesLines(gate, rules) {
    const lines = [];
    for (const [selector, declarations] of rules) {
      const head = selector.split(",").map((part) => `body ${part.trim()}`).join(", ");
      lines.push(`${gate} ${head} {`);
      for (const [property, value] of declarations) {
        lines.push(`  ${property}: ${value};`);
      }
      lines.push("}");
      lines.push("");
    }
    return lines;
  }
  function buildThemeCss() {
    const gate = darkGate();
    const body = `${gate} body`;
    const button = `button.${BUTTON_CLASS}`;
    return [
      "/* Dark theme: swap the design tokens only. No filter, no inversion. */",
      `${body} {`,
      "  color-scheme: dark;",
      ...tokenLines(DARK_TOKENS),
      "}",
      "",
      "/* Darken the decorative gradient behind the header and sidebar. */",
      `${body} .frame-theme-layer-base {`,
      "  background: linear-gradient(128deg, #0F1419 0%, #1A2028 72.12%) !important;",
      "}",
      "",
      ...rulesLines(gate, SHELL_RULES),
      ...rulesLines(gate, ON_ACCENT_RULES),
      "/* Reading pane: untouched light palette so emails keep their real colours. */",
      `${body} .mail-detail-content {`,
      "  color-scheme: light;",
      "  background-color: #FFFFFF !important;",
      ...tokenLines(LIGHT_TOKENS),
      "}",
      "",
      "/* Toggle button: a compact icon button pinned to the bottom-left corner. */",
      `${button} {`,
      "  position: fixed;",
      "  left: 16px;",
      "  bottom: 16px;",
      "  z-index: 2147483000;",
      "  display: inline-flex;",
      "  align-items: center;",
      "  justify-content: center;",
      "  width: 36px;",
      "  height: 36px;",
      "  padding: 0;",
      "  border: 1px solid rgba(0, 0, 0, 0.12);",
      "  border-radius: 50%;",
      "  background-color: #FFFFFF;",
      "  color: #253247;",
      "  font: inherit;",
      "  line-height: 1;",
      "  cursor: pointer;",
      "  box-shadow: 0 2px 8px rgba(19, 24, 29, 0.22);",
      "}",
      `${button}:hover { background-color: #F2F7FA; }`,
      `${gate} ${button} {`,
      "  background-color: #20262E;",
      "  color: #E8ECF1;",
      "  border-color: #3A4049;",
      "  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);",
      "}",
      `${gate} ${button}:hover { background-color: #2A333E; }`,
      `${button}:focus-visible { outline: 2px solid #0F7AF5; outline-offset: 2px; }`,
      `${button} > svg { width: 20px; height: 20px; pointer-events: none; }`,
      ""
    ].join("\n");
  }
  function ensureThemeStyle(doc) {
    if (doc.getElementById(STYLE_ID) !== null) return;
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = buildThemeCss();
    const parent = doc.head ?? doc.documentElement;
    if (parent === null) return;
    parent.append(style);
  }
  function removeThemeStyle(doc) {
    doc.getElementById(STYLE_ID)?.remove();
  }

  // scripts/qq-mail-theme-toggle/src/ui/button.ts
  var SVG_NAMESPACE = "http://www.w3.org/2000/svg";
  var SUN_SHAPES = Object.freeze([
    { tag: "circle", attributes: { cx: "12", cy: "12", r: "4.2" } },
    {
      tag: "path",
      attributes: {
        d: "M12 2.4v2.2M12 19.4v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.4 12h2.2M19.4 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"
      }
    }
  ]);
  var MOON_SHAPES = Object.freeze([
    {
      tag: "path",
      attributes: { d: "M20.2 14.6A8.6 8.6 0 0 1 9.4 3.8a8.6 8.6 0 1 0 10.8 10.8Z" }
    }
  ]);
  function createIcon(doc, mode) {
    const icon = doc.createElementNS(SVG_NAMESPACE, "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("focusable", "false");
    const shapes = mode === THEME_MODE.DARK ? SUN_SHAPES : MOON_SHAPES;
    for (const shape of shapes) {
      const element = doc.createElementNS(SVG_NAMESPACE, shape.tag);
      element.setAttribute("fill", "none");
      element.setAttribute("stroke", "currentColor");
      element.setAttribute("stroke-width", "1.6");
      element.setAttribute("stroke-linecap", "round");
      element.setAttribute("stroke-linejoin", "round");
      for (const [name, value] of Object.entries(shape.attributes)) {
        element.setAttribute(name, value);
      }
      icon.append(element);
    }
    return icon;
  }
  function describeThemeButton(mode) {
    return mode === THEME_MODE.DARK ? BUTTON_LABELS.toLight : BUTTON_LABELS.toDark;
  }
  function updateThemeButton(button, mode) {
    const label = describeThemeButton(mode);
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
    button.setAttribute("aria-pressed", mode === THEME_MODE.DARK ? "true" : "false");
    button.replaceChildren(createIcon(button.ownerDocument, mode));
  }
  function createThemeButton(doc, mode) {
    const button = doc.createElement("button");
    button.type = "button";
    button.id = BUTTON_ID;
    button.className = BUTTON_CLASS;
    updateThemeButton(button, mode);
    return button;
  }

  // scripts/qq-mail-theme-toggle/src/install.ts
  function installQqMailTheme(options = {}) {
    const doc = options.doc ?? document;
    const preference = createThemePreference(options.scope ?? globalThis);
    const system = createSystemDarkQuery(doc.defaultView);
    let mode = resolveThemeMode(preference.read(), system.matches);
    ensureThemeStyle(doc);
    applyTheme(doc, mode);
    const button = createThemeButton(doc, mode);
    const paint = (next, persist) => {
      mode = next;
      applyTheme(doc, mode);
      updateThemeButton(button, mode);
      if (persist) preference.write(mode);
    };
    const onClick = () => paint(toggleThemeMode(mode), true);
    button.addEventListener("click", onClick);
    const unsubscribe = system.subscribe(() => {
      if (preference.read() !== null) return;
      paint(resolveThemeMode(null, system.matches), false);
    });
    const mountButton = () => {
      const body = doc.body;
      if (body === null || button.isConnected) return;
      body.append(button);
    };
    mountButton();
    const onParseDone = () => mountButton();
    if (doc.readyState === "loading") {
      doc.addEventListener("DOMContentLoaded", onParseDone, { once: true });
    }
    const mountObserver = new MutationObserver(mountButton);
    mountObserver.observe(doc.documentElement, { childList: true, subtree: true });
    return {
      mode: () => mode,
      setMode: (next) => paint(next, true),
      dispose: () => {
        button.removeEventListener("click", onClick);
        doc.removeEventListener("DOMContentLoaded", onParseDone);
        unsubscribe();
        mountObserver.disconnect();
        button.remove();
        releaseTheme(doc);
        removeThemeStyle(doc);
      }
    };
  }

  // scripts/qq-mail-theme-toggle/src/index.ts
  function bootstrap() {
    const root2 = document.documentElement;
    if (root2 === null) return;
    if (root2.hasAttribute(SCRIPT_MARKER_ATTRIBUTE)) return;
    root2.setAttribute(SCRIPT_MARKER_ATTRIBUTE, "");
    installQqMailTheme();
  }
  var root = document.documentElement;
  if (root === null) {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
