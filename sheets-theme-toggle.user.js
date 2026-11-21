// ==UserScript==
// @name         Google Sheets Theme Toggle
// @namespace    https://cyojkoy.github.io/Payment/
// @version      1.0.0
// @description  在 Google 表格（/spreadsheets/d/*）编辑界面右侧工具栏加一个深浅主题切换按钮；深色用 CSS 反色铺满整个编辑器，浅色还原 Google 原色，偏好持久化并跟随系统。
// @author       Yoko
// @updateURL    https://cdn.jsdelivr.net/gh/CYoJkoY/Yoko-ScriptCat-Scripts@release/sheets-theme-toggle.user.js
// @downloadURL  https://ghfast.top/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/release/sheets-theme-toggle.user.js
// @match        https://docs.google.com/spreadsheets/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @noframes
// @icon         data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%20role%3D%22img%22%20aria-label%3D%22Google%20Sheets%20Theme%20Toggle%22%3E%20%3Cdefs%3E%20%3ClinearGradient%20id%3D%22bg%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%220%22%20y2%3D%2264%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%20%3Cstop%20offset%3D%220%22%20stop-color%3D%22%230b3d2e%22%2F%3E%20%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23062018%22%2F%3E%20%3C%2FlinearGradient%3E%20%3C%2Fdefs%3E%20%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2214%22%20fill%3D%22url(%23bg)%22%2F%3E%20%3Crect%20x%3D%2214%22%20y%3D%2210%22%20width%3D%2228%22%20height%3D%2244%22%20rx%3D%224%22%20fill%3D%22none%22%20stroke%3D%22%2334a853%22%20stroke-width%3D%222.5%22%2F%3E%20%3Cpath%20d%3D%22M20%2020h16M20%2028h16M20%2036h16M20%2044h16%22%20stroke%3D%22%2334a853%22%20stroke-width%3D%221.6%22%2F%3E%20%3Ccircle%20cx%3D%2246%22%20cy%3D%2242%22%20r%3D%229%22%20fill%3D%22%23fbbc04%22%2F%3E%20%3Cpath%20d%3D%22M46%2036.5v-3M46%2050.5v-3M39.5%2042h-3M55.5%2042h-3M41.5%2037.5l-2-2M52.5%2048.5l-2-2M41.5%2046.5l-2%202M52.5%2035.5l-2%202%22%20stroke%3D%22%23f9ab00%22%20stroke-width%3D%221.6%22%20stroke-linecap%3D%22round%22%2F%3E%20%3C%2Fsvg%3E
// @license      MIT
// ==/UserScript==

"use strict";
(() => {
  // scripts/sheets-theme-toggle/src/config.ts
  var SCRIPT_MARKER_ATTRIBUTE = "data-yoko-sheets-theme-ready";
  var THEME_ATTRIBUTE = "data-yoko-sheets-theme";
  var STYLE_ID = "yoko-sheets-theme-style";
  var BUTTON_ID = "yoko-sheets-theme-toggle";
  var BUTTON_CLASS = "yoko-sheets-theme-button";
  var FLOATING_ATTRIBUTE = "data-yoko-sheets-theme-floating";
  var STORAGE_KEY = "yoko_sheets_theme_mode";
  var THEME_MODE = Object.freeze({
    LIGHT: "light",
    DARK: "dark"
  });
  var SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";
  var MOUNT_TARGET_SELECTORS = Object.freeze([
    "#docs-side-toolbar",
    "#docs-toolbar"
  ]);
  var REMOUNT_DELAY_MS = 120;
  var BUTTON_LABELS = Object.freeze({
    toDark: "切换到深色主题",
    toLight: "切换到浅色主题"
  });

  // scripts/sheets-theme-toggle/src/core/page.ts
  var SHEET_DOCUMENT_PATH = /^\/spreadsheets\/(?:u\/\d+\/)?d\/[^/]+/;
  function isSheetEditorPath(pathname) {
    return SHEET_DOCUMENT_PATH.test(pathname);
  }

  // scripts/sheets-theme-toggle/src/core/apply.ts
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

  // scripts/sheets-theme-toggle/src/core/theme.ts
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

  // scripts/sheets-theme-toggle/src/core/preference.ts
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

  // scripts/sheets-theme-toggle/src/core/style.ts
  var KEEP_ORIGINAL_COLOURS_TAGS = Object.freeze([
    "img",
    "video",
    "picture"
  ]);
  var INVERT_DECLARATION = "filter: invert(1) hue-rotate(180deg);";
  function darkGate() {
    return `html[${THEME_ATTRIBUTE}="${THEME_MODE.DARK}"]`;
  }
  function buildThemeCss() {
    const gate = darkGate();
    const button = `button.${BUTTON_CLASS}`;
    const floating = `${button}[${FLOATING_ATTRIBUTE}]`;
    const keepOriginal = KEEP_ORIGINAL_COLOURS_TAGS.map((tag) => `${gate} ${tag}`).join(",\n");
    return [
      "/* Dark theme: invert the painted page, then restore media colours. */",
      `${gate} {`,
      "  background-color: #ffffff;",
      `  ${INVERT_DECLARATION}`,
      "}",
      "",
      `${keepOriginal} {`,
      `  ${INVERT_DECLARATION}`,
      "}",
      "",
      "/* Toggle button: a compact icon button sized for Google's toolbar row. */",
      `${button} {`,
      "  display: inline-flex;",
      "  align-items: center;",
      "  justify-content: center;",
      "  box-sizing: border-box;",
      "  width: 28px;",
      "  height: 28px;",
      "  margin: 0 2px;",
      "  padding: 0;",
      "  border: 0;",
      "  border-radius: 50%;",
      "  background: transparent;",
      "  color: #5f6368;",
      "  font: inherit;",
      "  line-height: 1;",
      "  vertical-align: middle;",
      "  cursor: pointer;",
      "}",
      "",
      `${button}:hover {`,
      "  background-color: rgba(60, 64, 67, 0.08);",
      "}",
      "",
      `${button}:active {`,
      "  background-color: rgba(60, 64, 67, 0.16);",
      "}",
      "",
      `${button}:focus-visible {`,
      "  outline: 2px solid #1a73e8;",
      "  outline-offset: 2px;",
      "}",
      "",
      `${button} > svg {`,
      "  display: block;",
      "  width: 18px;",
      "  height: 18px;",
      "  pointer-events: none;",
      "}",
      "",
      `${gate} ${button} {`,
      `  ${INVERT_DECLARATION}`,
      "  color: #e8eaed;",
      "}",
      "",
      `${gate} ${button}:hover {`,
      "  background-color: rgba(232, 234, 237, 0.12);",
      "}",
      "",
      `${gate} ${button}:active {`,
      "  background-color: rgba(232, 234, 237, 0.2);",
      "}",
      "",
      "/* Fallback: the editor chrome never rendered, so pin the button to the view. */",
      `${floating} {`,
      "  position: fixed;",
      "  right: 16px;",
      "  bottom: 16px;",
      "  z-index: 2147483000;",
      "  background-color: #ffffff;",
      "  box-shadow: 0 1px 3px rgba(60, 64, 67, 0.3), 0 4px 8px 3px rgba(60, 64, 67, 0.15);",
      "}",
      "",
      `${gate} ${floating} {`,
      "  background-color: #202124;",
      "}",
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

  // scripts/sheets-theme-toggle/src/ui/button.ts
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

  // scripts/sheets-theme-toggle/src/ui/mount.ts
  function findToolbar(doc) {
    for (const selector of MOUNT_TARGET_SELECTORS) {
      const element = doc.querySelector(selector);
      if (element instanceof HTMLElement) return element;
    }
    return null;
  }
  function createThemeMount(options) {
    const { doc, button, isParseComplete } = options;
    const view = doc.defaultView;
    let timer = null;
    let observer = null;
    const mount = () => {
      const toolbar = findToolbar(doc);
      if (toolbar !== null) {
        if (button.parentElement !== toolbar) toolbar.append(button);
        button.removeAttribute(FLOATING_ATTRIBUTE);
        return;
      }
      if (button.isConnected) return;
      if (!isParseComplete() || doc.body === null) return;
      button.setAttribute(FLOATING_ATTRIBUTE, "");
      doc.body.append(button);
    };
    const schedule = () => {
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        mount();
      }, REMOUNT_DELAY_MS);
    };
    const isSettled = () => {
      if (!button.isConnected) return false;
      const toolbar = findToolbar(doc);
      if (toolbar !== null) return button.parentElement === toolbar;
      return button.hasAttribute(FLOATING_ATTRIBUTE);
    };
    if (view !== null) {
      observer = new view.MutationObserver(() => {
        if (isSettled()) return;
        schedule();
      });
      const root2 = doc.documentElement;
      if (root2 !== null) observer.observe(root2, { childList: true, subtree: true });
    }
    return {
      ensureMounted: mount,
      dispose: () => {
        if (timer !== null) clearTimeout(timer);
        timer = null;
        observer?.disconnect();
        observer = null;
      }
    };
  }

  // scripts/sheets-theme-toggle/src/install.ts
  function installSheetsTheme(options = {}) {
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
    const mount = createThemeMount({
      doc,
      button,
      isParseComplete: () => doc.readyState !== "loading"
    });
    mount.ensureMounted();
    const onParseDone = () => mount.ensureMounted();
    const waitsForParse = doc.readyState === "loading";
    if (waitsForParse) doc.addEventListener("DOMContentLoaded", onParseDone, { once: true });
    return {
      mode: () => mode,
      setMode: (next) => paint(next, true),
      dispose: () => {
        button.removeEventListener("click", onClick);
        if (waitsForParse) doc.removeEventListener("DOMContentLoaded", onParseDone);
        unsubscribe();
        mount.dispose();
        button.remove();
        releaseTheme(doc);
        removeThemeStyle(doc);
      }
    };
  }

  // scripts/sheets-theme-toggle/src/index.ts
  function bootstrap() {
    const root2 = document.documentElement;
    if (root2 === null) return;
    if (root2.hasAttribute(SCRIPT_MARKER_ATTRIBUTE)) return;
    if (!isSheetEditorPath(window.location.pathname)) return;
    root2.setAttribute(SCRIPT_MARKER_ATTRIBUTE, "");
    installSheetsTheme();
  }
  var root = document.documentElement;
  if (root === null) {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
