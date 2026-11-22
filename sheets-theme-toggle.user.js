// ==UserScript==
// @name         Google Sheets Theme Toggle
// @namespace    https://cyojkoy.github.io/Payment/
// @version      1.0.2
// @description  在 Google 表格（/spreadsheets/d/*）编辑界面右侧工具栏加一个深浅主题切换按钮；深色同时调整界面外壳与表格画布背景/默认文字颜色，保留作者自设的单元格底色与字体色，偏好持久化并跟随系统。
// @author       Yoko
// @updateURL    https://cdn.jsdelivr.net/gh/CYoJkoY/Yoko-ScriptCat-Scripts@release/sheets-theme-toggle.user.js
// @downloadURL  https://ghfast.top/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/release/sheets-theme-toggle.user.js
// @match        https://docs.google.com/spreadsheets/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
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

  // scripts/sheets-theme-toggle/src/core/canvasColor.ts
  function clampByte(value) {
    if (!Number.isFinite(value)) return 0;
    if (value <= 0) return 0;
    if (value >= 255) return 255;
    return Math.round(value);
  }
  function rgba(r, g, b, a = 255) {
    return { r, g, b, a };
  }
  var CANVAS_PALETTE = Object.freeze([
    // Cell surface.
    { light: rgba(255, 255, 255), dark: rgba(32, 33, 36) },
    // Row/column header band and the select-all corner.
    { light: rgba(248, 249, 250), dark: rgba(41, 42, 45) },
    // Default body text.
    { light: rgba(68, 71, 70), dark: rgba(232, 234, 237) },
    // Row/column header text.
    { light: rgba(4, 30, 73), dark: rgba(168, 199, 250) },
    // Selection highlight over the surface.
    { light: rgba(211, 227, 253), dark: rgba(57, 68, 87) },
    // Grid line stroke.
    { light: rgba(196, 199, 197), dark: rgba(95, 99, 104) },
    // Thick/frozen divider drawn as a filled band.
    { light: rgba(192, 192, 192), dark: rgba(97, 101, 106) },
    { light: rgba(199, 199, 199), dark: rgba(93, 97, 102) },
    // Translucent grid line (rgb 31 31 31 at 13.3% alpha).
    { light: rgba(31, 31, 31, 34), dark: rgba(255, 255, 255, 34) }
  ]);
  var DARK_SURFACE = rgba(32, 33, 36);
  var FRINGE_MIN_CHANNEL = 220;
  var FRINGE_MAX_SPREAD = 8;
  var colorKey = (color) => `${color.r},${color.g},${color.b},${color.a}`;
  function buildTable(from, to) {
    const table = /* @__PURE__ */ new Map();
    for (const pair of CANVAS_PALETTE) {
      const source = colorKey(pair[from]);
      if (table.has(source)) continue;
      table.set(source, pair[to]);
    }
    return table;
  }
  var DARK_TABLE = buildTable("light", "dark");
  var LIGHT_TABLE = buildTable("dark", "light");
  var pixelKey = (r, g, b, a) => (r << 24 | g << 16 | b << 8 | a) >>> 0;
  function buildPixelTable(from, to) {
    const table = /* @__PURE__ */ new Map();
    for (const pair of CANVAS_PALETTE) {
      const source = pair[from];
      const key = pixelKey(source.r, source.g, source.b, source.a);
      if (table.has(key)) continue;
      table.set(key, pair[to]);
    }
    return table;
  }
  var DARK_PIXELS = buildPixelTable("light", "dark");
  var LIGHT_PIXELS = buildPixelTable("dark", "light");
  function toDarkColor(color) {
    if (color.a === 0) return color;
    return DARK_TABLE.get(colorKey(color)) ?? color;
  }
  function toLightColor(color) {
    if (color.a === 0) return color;
    return LIGHT_TABLE.get(colorKey(color)) ?? color;
  }
  var HEX_PATTERN = /^#[0-9a-f]{3,8}$/u;
  var HEX_DIGIT_COUNTS = /* @__PURE__ */ new Set([3, 4, 6, 8]);
  function parseHex(hex) {
    if (!HEX_PATTERN.test(hex)) return null;
    const digits = hex.slice(1);
    if (!HEX_DIGIT_COUNTS.has(digits.length)) return null;
    const pairAt = (index) => Number.parseInt(digits.slice(index, index + 2), 16);
    if (digits.length === 3 || digits.length === 4) {
      const expanded = [...digits].map((digit) => Number.parseInt(digit + digit, 16));
      const [r2, g2, b2, a2] = expanded;
      if (r2 === void 0 || g2 === void 0 || b2 === void 0) return null;
      return rgba(r2, g2, b2, a2 ?? 255);
    }
    const r = pairAt(0);
    const g = pairAt(2);
    const b = pairAt(4);
    const a = digits.length === 8 ? pairAt(6) : 255;
    if ([r, g, b, a].some((value) => Number.isNaN(value))) return null;
    return rgba(r, g, b, a);
  }
  var NAMED_COLORS = Object.freeze({
    transparent: rgba(0, 0, 0, 0),
    white: rgba(255, 255, 255),
    black: rgba(0, 0, 0)
  });
  function parseChannel(segment) {
    const percent = segment.endsWith("%");
    const value = Number.parseFloat(percent ? segment.slice(0, -1) : segment);
    if (!Number.isFinite(value)) return null;
    return clampByte(percent ? value * 2.55 : value);
  }
  function parseAlpha(segment) {
    if (segment.endsWith("%")) {
      const percent = Number.parseFloat(segment.slice(0, -1));
      return Number.isFinite(percent) ? clampByte(percent / 100 * 255) : null;
    }
    const value = Number.parseFloat(segment);
    if (!Number.isFinite(value)) return null;
    return clampByte(value <= 1 ? value * 255 : value);
  }
  function parseFunction(body) {
    const segments = body.replace(/\//gu, " ").split(/[\s,]+/u).filter((segment) => segment.length > 0);
    if (segments.length < 3 || segments.length > 4) return null;
    const [rs, gs, bs, as] = segments;
    if (rs === void 0 || gs === void 0 || bs === void 0) return null;
    const r = parseChannel(rs);
    const g = parseChannel(gs);
    const b = parseChannel(bs);
    if (r === null || g === null || b === null) return null;
    if (as === void 0) return rgba(r, g, b);
    const a = parseAlpha(as);
    if (a === null) return null;
    return rgba(r, g, b, a);
  }
  function parseColor(input) {
    const value = input.trim().toLowerCase();
    const named = NAMED_COLORS[value];
    if (named !== void 0) return named;
    if (value.startsWith("#")) return parseHex(value);
    const open = value.indexOf("(");
    if (open === -1 || !value.endsWith(")")) return null;
    const name = value.slice(0, open);
    if (name !== "rgb" && name !== "rgba") return null;
    return parseFunction(value.slice(open + 1, -1));
  }
  var hexByte = (value) => value.toString(16).padStart(2, "0");
  function formatColor(color) {
    const { r, g, b, a } = color;
    if (a >= 255) return `#${hexByte(r)}${hexByte(g)}${hexByte(b)}`;
    return `rgba(${r}, ${g}, ${b}, ${Number((a / 255).toFixed(3))})`;
  }
  function normalizeColor(input) {
    const parsed = parseColor(input);
    return parsed === null ? input : formatColor(parsed);
  }
  function colorsEqual(left, right) {
    return left.r === right.r && left.g === right.g && left.b === right.b && left.a === right.a;
  }
  function recolorCssColor(input, mode) {
    const parsed = parseColor(input);
    if (parsed === null) return input;
    const mapped = mode === "dark" ? toDarkColor(parsed) : toLightColor(parsed);
    if (colorsEqual(mapped, parsed)) return input;
    return formatColor(mapped);
  }
  function recolorPixels(data, mode) {
    const table = mode === "dark" ? DARK_PIXELS : LIGHT_PIXELS;
    let changed = false;
    for (let index = 0; index + 3 < data.length; index += 4) {
      const alpha = data[index + 3] ?? 0;
      if (alpha === 0) continue;
      const r = data[index] ?? 0;
      const g = data[index + 1] ?? 0;
      const b = data[index + 2] ?? 0;
      const mapped = table.get(pixelKey(r, g, b, alpha));
      if (mapped !== void 0) {
        data[index] = mapped.r;
        data[index + 1] = mapped.g;
        data[index + 2] = mapped.b;
        data[index + 3] = mapped.a;
        changed = true;
        continue;
      }
      if (mode !== "dark") continue;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (min < FRINGE_MIN_CHANNEL || max - min > FRINGE_MAX_SPREAD) continue;
      data[index] = DARK_SURFACE.r;
      data[index + 1] = DARK_SURFACE.g;
      data[index + 2] = DARK_SURFACE.b;
      changed = true;
    }
    return changed;
  }

  // scripts/sheets-theme-toggle/src/core/canvasTheme.ts
  var GRID_CANVAS_SELECTOR = "#waffle-grid-container canvas";
  var CHART_SELECTOR = ".waffle-chart, [class*='chart']";
  var COLOR_CACHE_LIMIT = 256;
  function isRecord(value) {
    return typeof value === "object" && value !== null;
  }
  function isCanvasElement(value) {
    return isRecord(value) && Reflect.get(value, "nodeType") === 1 && typeof Reflect.get(value, "getContext") === "function";
  }
  function resolveContextConstructor(candidates) {
    for (const host of candidates) {
      if (!isRecord(host)) continue;
      const candidate = host["CanvasRenderingContext2D"];
      if (typeof candidate !== "function") continue;
      const prototype = candidate.prototype;
      if (isRecord(prototype)) return { prototype };
    }
    return null;
  }
  function hookStyleProperty(prototype, property, remap) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
    if (descriptor === void 0) return null;
    if (descriptor.get === void 0 && descriptor.set === void 0 && !("value" in descriptor)) return null;
    const assigned = /* @__PURE__ */ new WeakMap();
    const readOriginal = (self) => {
      if (assigned.has(self)) return assigned.get(self);
      if (descriptor.get !== void 0) return descriptor.get.call(self);
      return descriptor.value;
    };
    const writeOriginal = (self, value) => {
      if (descriptor.set !== void 0) {
        descriptor.set.call(self, value);
        return;
      }
      Reflect.defineProperty(self, property, { value, writable: true, configurable: true, enumerable: true });
    };
    const accessor = {
      configurable: true,
      enumerable: descriptor.enumerable ?? false,
      get() {
        const original = readOriginal(this);
        return typeof original === "string" ? normalizeColor(original) : original;
      },
      set(value) {
        assigned.set(this, value);
        writeOriginal(this, remap(this, value));
      }
    };
    try {
      Reflect.defineProperty(prototype, property, accessor);
    } catch (error) {
      if (error instanceof TypeError) return null;
      throw error;
    }
    return () => {
      const current = Object.getOwnPropertyDescriptor(prototype, property);
      if (current === void 0 || current.get !== accessor.get) return;
      Reflect.defineProperty(prototype, property, descriptor);
    };
  }
  function installCanvasTheme(options = {}) {
    const doc = options.doc ?? document;
    const scope = options.scope ?? globalThis;
    const page = options.page ?? (isRecord(scope) ? Reflect.get(scope, "unsafeWindow") : null);
    const constructor = resolveContextConstructor([page, scope]);
    let mode = THEME_MODE.LIGHT;
    let disposed = false;
    const themed = /* @__PURE__ */ new WeakSet();
    const canvases = /* @__PURE__ */ new Set();
    const rendered = /* @__PURE__ */ new WeakMap();
    const colorCache = /* @__PURE__ */ new Map();
    const recolor = (value) => {
      const cached = colorCache.get(value);
      if (cached !== void 0) return cached;
      const mapped = recolorCssColor(value, THEME_MODE.DARK);
      if (colorCache.size >= COLOR_CACHE_LIMIT) colorCache.clear();
      colorCache.set(value, mapped);
      return mapped;
    };
    const isThemedContext = (self) => {
      const canvas = Reflect.get(self, "canvas");
      return isCanvasElement(canvas) && themed.has(canvas);
    };
    const remap = (self, value) => {
      if (mode !== THEME_MODE.DARK) return value;
      if (typeof value !== "string") return value;
      if (!isThemedContext(self)) return value;
      return recolor(value);
    };
    const restores = [];
    if (constructor !== null) {
      for (const property of ["fillStyle", "strokeStyle"]) {
        const restore = hookStyleProperty(constructor.prototype, property, remap);
        if (restore !== null) restores.push(restore);
      }
    }
    const readPixels = (canvas) => {
      const context = canvas.getContext("2d");
      if (context === null) return null;
      const { width, height } = canvas;
      if (width === 0 || height === 0) return null;
      try {
        return context.getImageData(0, 0, width, height);
      } catch (error) {
        if (error instanceof DOMException && error.name === "SecurityError") return null;
        throw error;
      }
    };
    const applyPixels = (canvas, target) => {
      const image = readPixels(canvas);
      if (image === null) return;
      if (!recolorPixels(image.data, target)) return;
      const context = canvas.getContext("2d");
      if (context === null) return;
      try {
        context.putImageData(image, 0, 0);
      } catch (error) {
        if (error instanceof DOMException && error.name === "SecurityError") return;
        throw error;
      }
    };
    const register = (canvas) => {
      if (canvases.has(canvas)) return;
      canvases.add(canvas);
      themed.add(canvas);
      rendered.set(canvas, mode);
      if (mode === THEME_MODE.DARK) applyPixels(canvas, THEME_MODE.DARK);
    };
    const scan = () => {
      if (disposed) return;
      for (const canvas of Array.from(canvases)) {
        if (canvas.isConnected) continue;
        canvases.delete(canvas);
        themed.delete(canvas);
      }
      for (const canvas of Array.from(doc.querySelectorAll(GRID_CANVAS_SELECTOR))) {
        if (canvas.closest(CHART_SELECTOR) !== null) continue;
        register(canvas);
      }
    };
    let scanQueued = false;
    const scheduleScan = () => {
      if (scanQueued || disposed) return;
      scanQueued = true;
      queueMicrotask(() => {
        scanQueued = false;
        scan();
      });
    };
    const observer = doc.documentElement === null || typeof MutationObserver !== "function" ? null : new MutationObserver(scheduleScan);
    observer?.observe(doc.documentElement, { childList: true, subtree: true });
    scan();
    return {
      setMode: (next) => {
        if (disposed) return;
        mode = next;
        if (next === THEME_MODE.LIGHT) {
          for (const canvas of canvases) {
            if (rendered.get(canvas) === THEME_MODE.LIGHT) continue;
            applyPixels(canvas, THEME_MODE.LIGHT);
            rendered.set(canvas, THEME_MODE.LIGHT);
          }
          return;
        }
        scan();
        for (const canvas of canvases) {
          if (rendered.get(canvas) === THEME_MODE.DARK) continue;
          applyPixels(canvas, THEME_MODE.DARK);
          rendered.set(canvas, THEME_MODE.DARK);
        }
      },
      dispose: () => {
        if (disposed) return;
        for (const canvas of canvases) {
          if (rendered.get(canvas) !== THEME_MODE.DARK) continue;
          applyPixels(canvas, THEME_MODE.LIGHT);
          rendered.set(canvas, THEME_MODE.LIGHT);
        }
        disposed = true;
        observer?.disconnect();
        for (const restore of restores) restore();
        canvases.clear();
        colorCache.clear();
      }
    };
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
  var SURFACE_DARK = "#202124";
  var SURFACE_RAISED_DARK = "#292a2d";
  var SURFACE_TAB_DARK = "#2d2f31";
  var SURFACE_TAB_ACTIVE_DARK = "#3c4043";
  var SURFACE_CONTAINER_HIGHEST_DARK = "#303134";
  var TEXT_DARK = "#e8eaed";
  var TEXT_ACCENT_DARK = "#8ab4f8";
  var TEXT_MUTED_DARK = "#9aa0a6";
  var BORDER_DARK = "#5f6368";
  var ICON_LIGHT = "#444746";
  var HOVER_OVERLAY_LIGHT = "rgba(68, 71, 70, 0.08)";
  var ACTIVE_OVERLAY_LIGHT = "rgba(68, 71, 70, 0.16)";
  var HOVER_OVERLAY_DARK = "rgba(255, 255, 255, 0.08)";
  var ACTIVE_OVERLAY_DARK = "rgba(255, 255, 255, 0.16)";
  function darkGate() {
    return `html[${THEME_ATTRIBUTE}="${THEME_MODE.DARK}"]`;
  }
  function darkRule(selectors, declarations) {
    const gate = darkGate();
    return [
      selectors.map((selector) => `${gate} ${selector}`).join(",\n") + " {",
      ...declarations.map((declaration) => `  ${declaration};`),
      "}"
    ].join("\n");
  }
  var CHROME_SURFACES = Object.freeze([
    "#docs-chrome",
    "#docs-header",
    "#docs-titlebar-container",
    "#docs-bars",
    "#docs-toolbar",
    "#docs-toolbar-wrapper",
    "#docs-additional-bars",
    "#docs-menubar",
    "#formula-bar-name-box-wrapper",
    "table#grid-bottom-bar"
  ]);
  var CHROME_ICONS = Object.freeze([
    "#docs-chrome .docs-icon-img",
    "#docs-chrome .docs-icon-img-container",
    "#formula-bar .docs-icon-img",
    "#formula-bar .docs-icon-img-container",
    "#grid-bottom-bar .docs-icon-img",
    "#grid-bottom-bar .docs-icon-img-container",
    ".goog-menu .docs-icon-img",
    ".goog-menu .docs-icon-img-container"
  ]);
  var CHROME_TOKEN_HOSTS = Object.freeze([
    "#docs-chrome",
    "#grid-bottom-bar",
    ".goog-menu"
  ]);
  var DARK_TOKENS = Object.freeze([
    `--gm3-sys-color-surface: ${SURFACE_DARK}`,
    `--gm3-sys-color-surface-container-lowest: ${SURFACE_DARK}`,
    `--gm3-sys-color-surface-container-low: ${SURFACE_DARK}`,
    `--gm3-sys-color-surface-container: ${SURFACE_DARK}`,
    `--gm3-sys-color-surface-container-high: ${SURFACE_RAISED_DARK}`,
    `--gm3-sys-color-surface-container-highest: ${SURFACE_CONTAINER_HIGHEST_DARK}`,
    `--gm3-sys-color-on-surface: ${TEXT_DARK}`,
    "--gm3-sys-color-on-surface-variant: #c4c7c5",
    `--gm3-sys-color-outline: ${BORDER_DARK}`,
    "--gm3-sys-color-outline-variant: #444746"
  ]);
  var TOOLBAR_CONTROLS = Object.freeze([
    ".menu-button.goog-control",
    ".goog-control",
    ".goog-toolbar-button",
    ".goog-toolbar-menu-button",
    ".goog-toolbar-toggle-button"
  ]);
  var TOOLBAR_LABELS = Object.freeze([
    ".docs-title-input",
    ".docs-title-input-label",
    ".docs-title-input-label-inner",
    ".docs-title-untitled"
  ]);
  function buildThemeCss() {
    const gate = darkGate();
    const button = `button.${BUTTON_CLASS}`;
    const floating = `${button}[${FLOATING_ATTRIBUTE}]`;
    return [
      "/* Dark theme restyles the editor chrome only; the sheet keeps its pixels. */",
      `${gate} {`,
      `  background-color: ${SURFACE_DARK};`,
      "}",
      "",
      darkRule(CHROME_TOKEN_HOSTS, DARK_TOKENS),
      "",
      darkRule(CHROME_SURFACES, [
        `background-color: ${SURFACE_DARK}`,
        `color: ${TEXT_DARK}`,
        `border-color: ${BORDER_DARK}`
      ]),
      "",
      // The name box and the formula input do not inherit colour from the bar.
      darkRule(["#formula-bar", "#t-name-box", "#t-formula-bar-input"], [
        `background-color: ${SURFACE_RAISED_DARK}`,
        `color: ${TEXT_DARK}`,
        `border-color: ${BORDER_DARK}`
      ]),
      "",
      darkRule([...TOOLBAR_CONTROLS, ...TOOLBAR_LABELS], [`color: ${TEXT_DARK}`]),
      "",
      // Google paints hover states with a light overlay that would turn into a
      // bright block on a dark toolbar. Checked toggles keep Google's tonal pill,
      // so their glyph is left uninverted below for contrast.
      darkRule(
        [
          ".goog-toolbar-button-hover",
          ".goog-toolbar-menu-button-hover"
        ],
        [`background-color: ${HOVER_OVERLAY_DARK}`]
      ),
      "",
      darkRule(
        [".goog-toolbar-button-active", ".goog-toolbar-menu-button-active"],
        [`background-color: ${ACTIVE_OVERLAY_DARK}`]
      ),
      "",
      darkRule(
        [
          ".goog-toolbar-button .goog-toolbar-button-inner-box",
          ".goog-toolbar-menu-button .goog-toolbar-menu-button-inner-box"
        ],
        ["background-color: transparent"]
      ),
      "",
      darkRule([".goog-toolbar-separator"], [`border-color: ${BORDER_DARK}`]),
      "",
      darkRule([".docs-sheet-tab"], [
        `background-color: ${SURFACE_TAB_DARK}`,
        `color: ${TEXT_DARK}`
      ]),
      "",
      darkRule([".docs-sheet-tab.docs-sheet-active-tab"], [
        `background-color: ${SURFACE_TAB_ACTIVE_DARK}`
      ]),
      "",
      darkRule([".docs-sheet-tab-name"], [`color: ${TEXT_DARK}`]),
      "",
      darkRule([".docs-sheet-tab.docs-sheet-active-tab .docs-sheet-tab-name"], [
        `color: ${TEXT_ACCENT_DARK}`
      ]),
      "",
      // Menus render in their own layer above the page, so they need the same
      // treatment; the palette popup keeps its swatch colours and only its frame
      // is darkened.
      darkRule([".goog-menu", ".goog-menu.goog-menu-vertical"], [
        `background-color: ${SURFACE_RAISED_DARK}`,
        `color: ${TEXT_DARK}`,
        `border-color: ${BORDER_DARK}`
      ]),
      "",
      darkRule([".goog-menuitem", ".goog-menuitem-content"], [`color: ${TEXT_DARK}`]),
      "",
      darkRule([".goog-menuitem-highlight"], [
        `background-color: ${SURFACE_TAB_ACTIVE_DARK}`
      ]),
      "",
      darkRule([".goog-menuitem-disabled .goog-menuitem-content"], [
        `color: ${TEXT_MUTED_DARK}`
      ]),
      "",
      darkRule([".goog-menuseparator"], [`border-color: ${BORDER_DARK}`]),
      "",
      // The formula bar's divider is a 1px white strip, not a border.
      darkRule(["#docs-chrome .formula-bar-separator"], [
        `background-color: ${BORDER_DARK}`
      ]),
      "",
      darkRule([".goog-palette"], [`background-color: ${SURFACE_DARK}`]),
      "",
      darkRule([".docs-sheet-comment-indicator-text"], [`color: ${TEXT_DARK}`]),
      "",
      // Toolbar glyphs are dark images rather than `currentColor` masks, so the
      // dark surfaces above would hide them. Inverting only these icon boxes (never
      // the sheet, its media or the colour swatches) restores them in light grey.
      darkRule(CHROME_ICONS, ["filter: invert(1)"]),
      "",
      // A checked toggle keeps Google's light tonal pill, so its glyph stays dark
      // instead of being inverted into a washed-out light grey.
      darkRule(["#docs-chrome .goog-toolbar-button-checked .docs-icon-img"], [
        "filter: none"
      ]),
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
      `  color: ${ICON_LIGHT};`,
      "  font: inherit;",
      "  line-height: 1;",
      "  vertical-align: middle;",
      "  cursor: pointer;",
      "}",
      "",
      `${button}:hover {`,
      `  background-color: ${HOVER_OVERLAY_LIGHT};`,
      "}",
      "",
      `${button}:active {`,
      `  background-color: ${ACTIVE_OVERLAY_LIGHT};`,
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
      `  color: ${TEXT_DARK};`,
      "}",
      "",
      `${gate} ${button}:hover {`,
      `  background-color: ${HOVER_OVERLAY_DARK};`,
      "}",
      "",
      `${gate} ${button}:active {`,
      `  background-color: ${ACTIVE_OVERLAY_DARK};`,
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
      `  background-color: ${SURFACE_DARK};`,
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
    const canvasTheme = installCanvasTheme({ doc, ...options.scope === void 0 ? {} : { scope: options.scope } });
    canvasTheme.setMode(mode);
    const button = createThemeButton(doc, mode);
    const paint = (next, persist) => {
      mode = next;
      applyTheme(doc, mode);
      canvasTheme.setMode(mode);
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
        canvasTheme.dispose();
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
