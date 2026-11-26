// ==UserScript==
// @name         QQ Mail Theme Toggle
// @namespace    https://cyojkoy.github.io/Payment/
// @version      1.2.3
// @description  在QQ邮箱网页版左下角添加深浅主题切换按钮；深色主题替换界面配色令牌，并逐个元素重映射邮件正文里写死的内联颜色，不使用滤镜或反色，邮件中的图片、视频保持原始像素，偏好持久化并可跟随系统主题。
// @author       Yoko
// @updateURL    https://cdn.jsdelivr.net/gh/CYoJkoY/Yoko-ScriptCat-Scripts@release/qq-mail-theme-toggle.user.js
// @downloadURL  https://ghfast.top/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/release/qq-mail-theme-toggle.user.js
// @match        https://wx.mail.qq.com/home/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @noframes
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByb2xlPSJpbWciIGFyaWEtbGFiZWw9IlFRIE1haWwgVGhlbWUgVG9nZ2xlIj4NCiAgPGRlZnM+DQogICAgPGxpbmVhckdyYWRpZW50IGlkPSJxcWJnIiB4MT0iMCIgeTE9IjAiIHgyPSIwIiB5Mj0iNjQiIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIj4NCiAgICAgIDxzdG9wIG9mZnNldD0iMCIgc3RvcC1jb2xvcj0iIzEzMjAzMyIvPg0KICAgICAgPHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjMEIxMjIwIi8+DQogICAgPC9saW5lYXJHcmFkaWVudD4NCiAgPC9kZWZzPg0KICA8cmVjdCB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHJ4PSIxNCIgZmlsbD0idXJsKCNxcWJnKSIvPg0KICA8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg4LjI1IDguMjUpIHNjYWxlKDAuNSkiPg0KICA8Y2lyY2xlIGN4PSI0Ny41IiBjeT0iNDcuNSIgcj0iNDgiIGZpbGw9IiNGRkZGRkYiIHN0cm9rZT0iI0ZGRkZGRiIgc3Ryb2tlLXdpZHRoPSIxIi8+DQogIDxwYXRoIGQ9Ik00MCAwIDUzIDAgNTAgMCA0OSAxIDQ2IDEgNDUgMiA0MyAyIDQyIDMgMzcgNSAzNSA3IDM0IDcgMjYgMTUgMjYgMTYgMjIgMjEgMjIgMjMgMjAgMjYgMjAgMjggMTkgMjkgMTkgMzIgMTggMzMgMTggMzkgMTcgNDAgMTcgNDkgMTggNTAgMTggNTkgMTcgNjAgMTcgNjEgMTQgNjQgMTMgNjQgMTIgNjUgNyA2NSA2IDY0IDUgNjQgMiA2MSAyIDYwIDEgNTkgMSA1NSAwIDU0IDAgMzkgMSAzOCAxIDM0IDIgMzMgMiAzMSAzIDMwIDMgMjkgNCAyOCA3IDIxIDkgMTkgOSAxOCAxNyAxMCAxOCAxMCAyMSA3IDIyIDcgMjkgMyAzMSAzIDMyIDIgMzQgMiAzNSAxIDM5IDEgNDAgMFoiIGZpbGw9IiNGN0I2MEEiIHN0cm9rZT0iI0Y3QjYwQSIgc3Ryb2tlLXdpZHRoPSIxIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+DQogIDxwYXRoIGQ9Ik01NCAyIDYxIDIgNjIgMyA2NyA0IDY4IDUgNzMgNyA3NSA5IDc2IDkgODYgMTkgODYgMjAgODggMjIgODggMjMgOTIgMzAgOTIgMzIgOTMgMzMgOTMgMzYgOTQgMzcgOTQgNDEgOTUgNDIgOTUgNTIgOTQgNTMgOTQgNTggOTMgNTkgOTMgNjEgOTIgNjIgOTEgNjcgOTAgNjggODkgNzEgODcgNzMgODcgNzQgODcgNzIgODggNzEgODggNjggODkgNjcgODkgNTIgODggNTEgODcgNDYgODYgNDUgODQgNDAgODIgMzggODIgMzcgNzMgMjggNzIgMjggNjYgMjMgNjUgMjMgNjAgMjAgNTggMjAgNTcgMTkgNTQgMTggNTIgMTYgNTEgMTYgNTEgMTUgNDkgMTIgNDkgOCA1MCA3IDUxIDQgNTQgMloiIGZpbGw9IiM3Q0M1MUQiIHN0cm9rZT0iIzdDQzUxRCIgc3Ryb2tlLXdpZHRoPSIxIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+DQogIDxwYXRoIGQ9Ik03NCA2NiA3OSA2NyA4MiA3MCA4MiA3MSA4MyA3MiA4MyA3NyA4MiA3OCA4MiA3OSA3NCA4NyA3MSA4OCA2OSA5MCA2NyA5MCA2NCA5MiA2MiA5MiA2MSA5MyA1OSA5MyA1OCA5NCA1NCA5NCA1MyA5NSA0MiA5NSA0MSA5NCAzNyA5NCAzNiA5MyAzMyA5MyAzMiA5MiAyNyA5MSAyNiA5MCAyMyA4OSAyMSA4NyAyMCA4NyAxOCA4NSAxNyA4NSAxMCA3OCAxMCA3NyA3IDc0IDcgNzMgNCA2OCAxMCA3NCAxMSA3NCAxNCA3NyAxNSA3NyAyMiA4MSAyNSA4MSAyNiA4MiAzMSA4MiAzMiA4MyAzNyA4MyAzOCA4MiA0MyA4MiA0NCA4MSA0NyA4MSA0OCA4MCA1MCA4MCA1MSA3OSA1MiA3OSA1MyA3OCA2MCA3NSA2OSA2OCA3MCA2OCA3MSA2NyA3MyA2NyA3NCA2NloiIGZpbGw9IiNGRjQ0MDQiIHN0cm9rZT0iI0ZGNDQwNCIgc3Ryb2tlLXdpZHRoPSIxIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+DQogIDxwYXRoIGQ9Ik00NCAyNyA1MiAyNyA1MyAyOCA1NSAyOCA1NiAyOSA1OSAzMCA2MSAzMiA2MSAzMyA2MyAzNiA2MyAzOSA2NCA0MCA2NCA0NSA2NiA0NyA2NiA0OSA2NyA1MCA2NyA1MiA2OCA1MyA2OCA1NiA2NiA1NiA2MyA1NCA2MSA1NyA2MSA1OCA2NCA2MSA2NCA2MyA2MyA2NCA2MSA2NCA2MCA2NSA1MyA2NSA1MiA2NCA0NyA2MyA0NiA2NCA0NCA2NCA0MyA2NSAzNiA2NSAzMiA2MiAzMyA2MSAzMyA2MCAzNCA2MCAzNSA1OSAzNSA1NyAzNCA1NiAzNCA1NSAzMyA1NCAzMiA1NCAzMCA1NiAyOCA1NiAyOCA1MyAyOSA1MiAyOSA0OSAzMiA0NCAzMiA0MCAzMyAzOSAzNCAzNCAzOSAyOSA0MCAyOSA0MSAyOCA0MyAyOCA0NCAyN1oiIGZpbGw9IiMyRTlGRTAiIHN0cm9rZT0iIzJFOUZFMCIgc3Ryb2tlLXdpZHRoPSIxIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+DQogIDwvZz4NCiAgPGNpcmNsZSBjeD0iNTQuNSIgY3k9IjU0LjUiIHI9IjguNiIgZmlsbD0iIzBCMTIyMCIvPjxjaXJjbGUgY3g9IjU0LjUiIGN5PSI1NC41IiByPSI3LjAiIGZpbGw9IiNGOEZBRkMiLz48Y2lyY2xlIGN4PSI1Ni43IiBjeT0iNTMuMyIgcj0iNS42IiBmaWxsPSIjMEIxMjIwIi8+DQo8L3N2Zz4NCg==
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

  // scripts/qq-mail-theme-toggle/src/core/emailDark.ts
  var EMAIL_CONTENT_SELECTOR = ".mail-detail-content";
  var MEDIA_TAGS = /* @__PURE__ */ new Set([
    "IMG",
    "VIDEO",
    "PICTURE",
    "SOURCE",
    "CANVAS",
    "IFRAME",
    "OBJECT",
    "EMBED",
    "AUDIO"
  ]);
  var INERT_TAGS = /* @__PURE__ */ new Set([
    "SCRIPT",
    "STYLE",
    "LINK",
    "META",
    "NOSCRIPT",
    "TEMPLATE",
    "HEAD",
    "TITLE"
  ]);
  var DARK_BACKGROUND = { r: 26, g: 32, b: 40, a: 1 };
  var LIGHT_FOREGROUND = { r: 232, g: 236, b: 241, a: 1 };
  var DARK_BORDER = { r: 58, g: 64, b: 73, a: 1 };
  var CONTRAST_EXTREMES = [
    { r: 255, g: 255, b: 255, a: 1 },
    { r: 0, g: 0, b: 0, a: 1 }
  ];
  var PALETTE_ATTRIBUTES = ["style", "class", "color", "bgcolor", "background"];
  var PAPER_LUMINANCE = 0.18;
  var HAIRLINE_LUMINANCE = 0.55;
  var MIN_CONTRAST = 4.5;
  var MUTED_MAX_SATURATION = 0.18;
  var NEUTRAL_MAX_SATURATION = 0.08;
  var TINT_LIGHTNESS = 0.13;
  var TINT_MAX_SATURATION = 0.45;
  var LIGHTENED_LIGHTNESS = 0.72;
  var LIGHTENED_MAX_SATURATION = 0.8;
  var trackedElements = /* @__PURE__ */ new Map();
  var activeSession = null;
  function parseCssColor(value) {
    const normalized = value.trim().toLowerCase();
    if (normalized === "" || normalized === "transparent") return null;
    if (normalized === "white") return { r: 255, g: 255, b: 255, a: 1 };
    if (normalized === "black") return { r: 0, g: 0, b: 0, a: 1 };
    if (normalized.startsWith("#")) return parseHexColor(normalized);
    if (!normalized.startsWith("rgb")) return null;
    return parseRgbColor(normalized);
  }
  function parseHexColor(value) {
    const hex = value.slice(1);
    if (hex.length !== 3 && hex.length !== 4 && hex.length !== 6 && hex.length !== 8) return null;
    const expanded = hex.length === 3 || hex.length === 4 ? [...hex].map((character) => character + character).join("") : hex;
    const red = Number.parseInt(expanded.slice(0, 2), 16);
    const green = Number.parseInt(expanded.slice(2, 4), 16);
    const blue = Number.parseInt(expanded.slice(4, 6), 16);
    const alpha = expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1;
    if ([red, green, blue, alpha].some((channel) => Number.isNaN(channel))) return null;
    return { r: red, g: green, b: blue, a: alpha };
  }
  function parseRgbColor(value) {
    const open = value.indexOf("(");
    const close = value.lastIndexOf(")");
    if (open < 0 || close <= open) return null;
    const parts = value.slice(open + 1, close).replace("/", " ").split(/[\s,]+/u).filter((part) => part !== "");
    if (parts.length < 3) return null;
    const red = parseColorChannel(parts[0]);
    const green = parseColorChannel(parts[1]);
    const blue = parseColorChannel(parts[2]);
    const alpha = parts.length >= 4 ? parseAlphaChannel(parts[3]) : 1;
    if (red === null || green === null || blue === null || alpha === null) return null;
    return { r: red, g: green, b: blue, a: alpha };
  }
  function parseColorChannel(value) {
    const parsed = Number.parseFloat(value);
    if (Number.isNaN(parsed)) return null;
    const channel = value.endsWith("%") ? parsed / 100 * 255 : parsed;
    return Math.round(Math.min(255, Math.max(0, channel)));
  }
  function parseAlphaChannel(value) {
    const parsed = Number.parseFloat(value);
    if (Number.isNaN(parsed)) return null;
    const alpha = value.endsWith("%") ? parsed / 100 : parsed;
    return Math.min(1, Math.max(0, alpha));
  }
  function formatColor(color) {
    if (color.a < 0.999) {
      const rounded = Math.round(color.a * 1e3) / 1e3;
      return `rgba(${color.r}, ${color.g}, ${color.b}, ${rounded})`;
    }
    return `rgb(${color.r}, ${color.g}, ${color.b})`;
  }
  function channelLuminance(channel) {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }
  function luminance(color) {
    return 0.2126 * channelLuminance(color.r) + 0.7152 * channelLuminance(color.g) + 0.0722 * channelLuminance(color.b);
  }
  function contrastRatio(first, second) {
    const lighter = Math.max(luminance(first), luminance(second));
    const darker = Math.min(luminance(first), luminance(second));
    return (lighter + 0.05) / (darker + 0.05);
  }
  function compositeColor(foreground, background) {
    const remaining = 1 - foreground.a;
    return {
      r: foreground.r * foreground.a + background.r * remaining,
      g: foreground.g * foreground.a + background.g * remaining,
      b: foreground.b * foreground.a + background.b * remaining,
      a: 1
    };
  }
  function rgbToHsl(color) {
    const red = color.r / 255;
    const green = color.g / 255;
    const blue = color.b / 255;
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const lightness = (maximum + minimum) / 2;
    if (maximum === minimum) return [0, 0, lightness];
    const delta = maximum - minimum;
    const saturation = lightness > 0.5 ? delta / (2 - maximum - minimum) : delta / (maximum + minimum);
    let hue = 0;
    if (maximum === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
    if (maximum === green) hue = (blue - red) / delta + 2;
    if (maximum === blue) hue = (red - green) / delta + 4;
    return [hue / 6, saturation, lightness];
  }
  function hueToChannel(first, second, hue) {
    let value = hue;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return first + (second - first) * 6 * value;
    if (value < 1 / 2) return second;
    if (value < 2 / 3) return first + (second - first) * (2 / 3 - value) * 6;
    return first;
  }
  function hslToRgb(hue, saturation, lightness, alpha) {
    if (saturation === 0) {
      const channel = Math.round(lightness * 255);
      return { r: channel, g: channel, b: channel, a: alpha };
    }
    const second = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
    const first = 2 * lightness - second;
    return {
      r: Math.round(hueToChannel(first, second, hue + 1 / 3) * 255),
      g: Math.round(hueToChannel(first, second, hue) * 255),
      b: Math.round(hueToChannel(first, second, hue - 1 / 3) * 255),
      a: alpha
    };
  }
  function mapBackground(color) {
    if (color.a === 0 || luminance(color) < PAPER_LUMINANCE) return null;
    const [hue, saturation] = rgbToHsl(color);
    if (saturation < NEUTRAL_MAX_SATURATION) {
      return formatColor({ ...DARK_BACKGROUND, a: color.a });
    }
    const tint = hslToRgb(hue, Math.min(saturation, TINT_MAX_SATURATION), TINT_LIGHTNESS, color.a);
    return formatColor(tint);
  }
  function mapForeground(color, background) {
    if (color.a === 0) return null;
    if (contrastRatio(compositeColor(color, background), background) >= MIN_CONTRAST) return null;
    const [hue, saturation] = rgbToHsl(color);
    const candidate = saturation < MUTED_MAX_SATURATION ? LIGHT_FOREGROUND : hslToRgb(hue, Math.min(saturation, LIGHTENED_MAX_SATURATION), LIGHTENED_LIGHTNESS, 1);
    if (contrastRatio(candidate, background) >= MIN_CONTRAST) return formatColor(candidate);
    const fallback = CONTRAST_EXTREMES.find((ink) => contrastRatio(ink, background) >= MIN_CONTRAST);
    return formatColor(fallback ?? LIGHT_FOREGROUND);
  }
  function mapBorder(color) {
    if (color.a === 0 || luminance(color) < HAIRLINE_LUMINANCE) return null;
    return formatColor({ ...DARK_BORDER, a: color.a });
  }
  function setTrackedProperty(element, property, value) {
    const properties = trackedElements.get(element) ?? /* @__PURE__ */ new Map();
    const saved = properties.get(property) ?? {
      value: element.style.getPropertyValue(property),
      priority: element.style.getPropertyPriority(property)
    };
    element.style.setProperty(property, value, "important");
    properties.set(property, { ...saved, applied: element.style.getPropertyValue(property) });
    trackedElements.set(element, properties);
  }
  function borderEntries(computed) {
    return [
      ["border-top-color", computed.borderTopWidth, computed.borderTopStyle, computed.borderTopColor],
      [
        "border-right-color",
        computed.borderRightWidth,
        computed.borderRightStyle,
        computed.borderRightColor
      ],
      [
        "border-bottom-color",
        computed.borderBottomWidth,
        computed.borderBottomStyle,
        computed.borderBottomColor
      ],
      [
        "border-left-color",
        computed.borderLeftWidth,
        computed.borderLeftStyle,
        computed.borderLeftColor
      ]
    ];
  }
  function hasBorder(width, style) {
    if (width === "" || width === "0px" || style === "" || style === "none") return false;
    return true;
  }
  function readEmailElement(element, view) {
    const tag = element.tagName.toUpperCase();
    if (MEDIA_TAGS.has(tag) || INERT_TAGS.has(tag)) return null;
    if (!(element instanceof HTMLElement)) return null;
    const computed = view.getComputedStyle(element);
    return {
      element,
      color: computed.color,
      textFill: computed.getPropertyValue("-webkit-text-fill-color"),
      backgroundColor: computed.backgroundColor,
      backgroundImage: computed.backgroundImage,
      borders: borderEntries(computed),
      children: Array.from(element.children).map((child) => readEmailElement(child, view)).filter((child) => child !== null)
    };
  }
  function resolveBackground(snapshot, context) {
    const paintedOverImage = snapshot.backgroundImage !== "none" && snapshot.backgroundImage !== "";
    if (paintedOverImage) return { ...context, preserveForeground: true };
    const declared = parseCssColor(snapshot.backgroundColor);
    if (declared === null || declared.a === 0) return context;
    const preserveForeground = context.preserveForeground && declared.a < 1;
    const mapped = preserveForeground ? null : mapBackground(declared);
    if (mapped !== null) setTrackedProperty(snapshot.element, "background-color", mapped);
    const surface = mapped === null ? declared : parseCssColor(mapped) ?? declared;
    return {
      ...context,
      background: compositeColor(surface, context.background),
      preserveForeground
    };
  }
  function resolveForeground(value, context) {
    if (context.preserveForeground) return value;
    const color = parseCssColor(value);
    if (color === null) return value;
    return mapForeground(color, context.background) ?? value;
  }
  function recolorBorders(snapshot) {
    for (const [property, width, style, color] of snapshot.borders) {
      if (!hasBorder(width, style)) continue;
      const parsed = parseCssColor(color);
      if (parsed === null) continue;
      const mapped = mapBorder(parsed);
      if (mapped !== null) setTrackedProperty(snapshot.element, property, mapped);
    }
  }
  function visitElement(snapshot, context) {
    const surface = resolveBackground(snapshot, context);
    const foreground = resolveForeground(snapshot.color, surface);
    if (foreground !== snapshot.color || foreground !== context.foreground) {
      setTrackedProperty(snapshot.element, "color", foreground);
    }
    if (parseCssColor(snapshot.textFill) !== null) {
      setTrackedProperty(snapshot.element, "-webkit-text-fill-color", resolveForeground(snapshot.textFill, surface));
    }
    if (!surface.preserveForeground) recolorBorders(snapshot);
    const next = { ...surface, foreground };
    for (const child of snapshot.children) visitElement(child, next);
  }
  function applyEmailDarkMode(doc) {
    const view = doc.defaultView;
    if (view === null) return;
    activeSession?.observer.disconnect();
    try {
      restoreEmailColors();
      const snapshots = Array.from(doc.querySelectorAll(EMAIL_CONTENT_SELECTOR)).map((element) => readEmailElement(element, view)).filter((snapshot) => snapshot !== null);
      const root2 = { background: DARK_BACKGROUND, preserveForeground: false, foreground: "" };
      for (const snapshot of snapshots) visitElement(snapshot, root2);
    } finally {
      if (activeSession !== null) observeEmailContent(activeSession);
    }
  }
  function restoreElementColors(element, properties) {
    for (const [property, saved] of properties) {
      if (element.style.getPropertyValue(property) !== saved.applied) continue;
      if (element.style.getPropertyPriority(property) !== "important") continue;
      if (saved.value === "") element.style.removeProperty(property);
      else element.style.setProperty(property, saved.value, saved.priority);
    }
  }
  function restoreEmailColors() {
    for (const [element, properties] of trackedElements) restoreElementColors(element, properties);
    trackedElements.clear();
  }
  function touchesEmailContent(record) {
    const target = record.target instanceof Element ? record.target : record.target.parentElement;
    if (target?.closest(EMAIL_CONTENT_SELECTOR)) return true;
    for (const node of Array.from(record.addedNodes)) {
      if (!(node instanceof Element)) continue;
      if (node.closest(EMAIL_CONTENT_SELECTOR) !== null) return true;
      if (node.querySelector(EMAIL_CONTENT_SELECTOR) !== null) return true;
    }
    return false;
  }
  function scheduleFlush(session) {
    if (session.timer !== null) return;
    session.timer = session.view.setTimeout(() => {
      session.timer = null;
      if (activeSession !== session) return;
      applyEmailDarkMode(session.doc);
    }, 0);
  }
  function observeEmailContent(session) {
    session.observer.observe(session.doc.documentElement, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: PALETTE_ATTRIBUTES
    });
  }
  function enableEmailDarkMode(doc) {
    if (activeSession !== null && activeSession.doc !== doc) disableEmailDarkMode();
    applyEmailDarkMode(doc);
    if (activeSession !== null) return;
    const view = doc.defaultView;
    const root2 = doc.documentElement;
    if (view === null || root2 === null) return;
    const observer = new view.MutationObserver((records) => {
      for (const record of records) {
        if (!touchesEmailContent(record)) continue;
        scheduleFlush(session);
        return;
      }
    });
    const session = { doc, view, observer, timer: null };
    activeSession = session;
    observeEmailContent(session);
  }
  function disableEmailDarkMode() {
    const session = activeSession;
    if (session === null) {
      restoreEmailColors();
      return;
    }
    activeSession = null;
    session.observer.disconnect();
    if (session.timer !== null) session.view.clearTimeout(session.timer);
    restoreEmailColors();
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
    ["--base_gray_100", "#EEF2F7"],
    ["--base_gray_090", "rgba(238, 242, 247, 0.95)"],
    ["--base_gray_080", "rgba(238, 242, 247, 0.92)"],
    ["--base_gray_070", "rgba(238, 242, 247, 0.88)"],
    ["--base_gray_060", "rgba(238, 242, 247, 0.8)"],
    ["--base_gray_050", "rgba(238, 242, 247, 0.72)"],
    ["--base_gray_040", "rgba(238, 242, 247, 0.62)"],
    ["--base_gray_030", "rgba(238, 242, 247, 0.44)"],
    ["--base_gray_025", "rgba(238, 242, 247, 0.25)"],
    ["--base_gray_020", "rgba(238, 242, 247, 0.2)"],
    ["--base_gray_015", "rgba(238, 242, 247, 0.15)"],
    ["--base_gray_010", "rgba(238, 242, 247, 0.1)"],
    ["--base_gray_007", "rgba(238, 242, 247, 0.07)"],
    ["--base_gray_005", "rgba(238, 242, 247, 0.05)"],
    ["--base_gray_003", "rgba(238, 242, 247, 0.03)"],
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
  var ON_ACCENT = "#FFFFFF";
  var ON_ACCENT_MUTED = "rgba(255, 255, 255, 0.8)";
  var SCROLLBAR_TOKENS = Object.freeze([
    ["--color-scroll-bar-bg", "var(--base_gray_030)"],
    ["--color-scroll-bar-hover-bg", "var(--base_gray_060)"],
    ["--color-scroll-bar-active-bg", "var(--base_gray_070)"]
  ]);
  var EMPTY_MAIL_ICON = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYwIiBoZWlnaHQ9IjEyMCIgdmlld0JveD0iMCAwIDE2MCAxMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik0yMi41IDI2QzIyLjUgMjQuMDY3IDI0LjA2NyAyMi41IDI2IDIyLjVIMTM0QzEzNS45MzMgMjIuNSAxMzcuNSAyNC4wNjcgMTM3LjUgMjZWMzcuMTE3QzEzNy41IDM3Ljc2MjYgMTM3LjA4NyAzOC4zMzU4IDEzNi40NzQgMzguNTRMODMuMDA0MiA1Ni4zNjM0QzgxLjA1NDEgNTcuMDEzNCA3OC45NDU5IDU3LjAxMzQgNzYuOTk1OCA1Ni4zNjM0TDIzLjUyNTcgMzguNTRDMjIuOTEzMSAzOC4zMzU4IDIyLjUgMzcuNzYyNiAyMi41IDM3LjExN1YyNlpNMjAgMzcuMTE3VjI2QzIwIDIyLjY4NjMgMjIuNjg2MyAyMCAyNiAyMEgxMzRDMTM3LjMxNCAyMCAxNDAgMjIuNjg2MyAxNDAgMjZWMzcuMTE3Vjk0QzE0MCA5Ny4zMTM3IDEzNy4zMTQgMTAwIDEzNCAxMDBIMjZDMjIuNjg2MyAxMDAgMjAgOTcuMzEzNyAyMCA5NFYzNy4xMTdaTTEzNy41IDQwLjgyNTFWOTRDMTM3LjUgOTUuOTMzIDEzNS45MzMgOTcuNSAxMzQgOTcuNUgyNkMyNC4wNjcgOTcuNSAyMi41IDk1LjkzMyAyMi41IDk0VjQwLjgyNTFDMjIuNTc3MSA0MC44NTYzIDIyLjY1NTQgNDAuODg1MSAyMi43MzUxIDQwLjkxMTdMNzYuMjA1MyA1OC43MzUxQzc4LjY2ODUgNTkuNTU2MiA4MS4zMzE1IDU5LjU1NjIgODMuNzk0NyA1OC43MzUxTDEzNy4yNjUgNDAuOTExN0MxMzcuMzQ1IDQwLjg4NTEgMTM3LjQyMyA0MC44NTYzIDEzNy41IDQwLjgyNTFaIiBmaWxsPSIjRUVGMkY3IiBmaWxsLW9wYWNpdHk9IjAuNDUiLz48L3N2Zz4=";
  var SHELL_RULES = Object.freeze([
    [
      ".frame-sidebar",
      [
        ["--feature-title-color", "var(--base_gray_090)"],
        ["--sidebar-divider-color", "var(--base_gray_010)"],
        ...SCROLLBAR_TOKENS
      ]
    ],
    [".xmail-page-root::-webkit-scrollbar-thumb", SCROLLBAR_TOKENS],
    [
      ".frame-sidebar-menu",
      [
        ["--color", "var(--base_gray_100)"],
        ["--total-color", "var(--base_gray_070)"],
        ["--red-dot-tips-color", "var(--base_gray_070)"],
        ["--left-icon-color", "var(--base_gray_090)"],
        ["--feature-icon-color", "var(--base_gray_100)"],
        ["--lock-icon-color", "var(--base_gray_060)"],
        ["--hover-bg", "var(--base_gray_010)"],
        ["--active-bg", "var(--base_gray_020)"]
      ]
    ],
    [
      ".frame-sidebar-menu.sidebar-menu-active",
      [
        ["--bg", "var(--base_gray_015)"],
        ["--hover-bg", "var(--base_gray_020)"],
        ["--active-bg", "var(--base_gray_025)"],
        ["--total-color", "var(--base_gray_100)"]
      ]
    ],
    [".frame-sidebar .frame-sidebar-menu-right-btn", [["--color", "var(--base_gray_090)"]]],
    [".frame-sidebar-menu-left-btn", [["--icon-color", "var(--base_gray_080)"]]],
    [
      ".frame-sidebar-setting-menus",
      [
        ["--back-btn-color", "var(--base_gray_100)"],
        ["--back-btn-icon-color", "var(--base_gray_080)"],
        ["--group-title-color", "var(--base_gray_070)"]
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
        ["--bg", "var(--base_gray_015)"],
        ["--border-color", "var(--base_gray_060)"],
        ["--color", "var(--base_gray_100)"],
        ["--icon-color", "var(--base_gray_100)"],
        ["--down-icon-color", "var(--base_gray_060)"]
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
        ["--bg", "var(--base_gray_015)"],
        ["--search-icon-color", "var(--base_gray_080)"],
        ["--placeholder-text-color", "var(--base_gray_060)"]
      ]
    ],
    [
      ".cmp-vip-state-icon:not(.cmp-vip-icon-in-panel)",
      [["--vip-icon-color", "var(--base_gray_080)"]]
    ],
    /* Blank reading pane: the envelope plus the "未选中任何邮件" caption. */
    [".mail-list-page-reader-tips .empty-tips::before", [["background-image", `url("${EMPTY_MAIL_ICON}")`]]],
    [".mail-list-page-reader-tips .empty-tips .tips-title", [["color", "var(--base_gray_070)"]]],
    /* Empty folder ("暂无邮件") and its secondary line. */
    [".mail-list-page-tips .empty-desc", [["color", "var(--base_gray_060)"]]],
    /* Message preview line is the dimmest body text in the list; lift one step. */
    [".mail-list-page-item .mail-digest", [["color", "var(--base_gray_050)"]]],
    [".mail-list-page-item .mail-digest.digest-remark", [["color", "var(--chrome_yellow_lighten_2)"]]],
    /* Unchecked checkbox icons inherit the dim gray_030; lift them for contrast. */
    [
      ".xmail-ui-checkbox .ui-checkbox-icon-uncheck .ui-checkbox-uncheck-icon",
      [["color", "var(--base_gray_060)"]]
    ],
    ['.xmail-ui-icon-loading > svg > path[fill="#192636"]', [["fill", "var(--base_gray_100)"]]],
    [
      '.xmail-ui-icon-loading > svg stop[stop-color="#192636"]',
      [["stop-color", "var(--base_gray_100)"]]
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
  function splitSelectorList(selector) {
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let index = 0; index < selector.length; index += 1) {
      const char = selector[index];
      if (char === "(") depth += 1;
      else if (char === ")") depth = Math.max(0, depth - 1);
      else if (char === "," && depth === 0) {
        parts.push(selector.slice(start, index));
        start = index + 1;
      }
    }
    parts.push(selector.slice(start));
    return parts.map((part) => part.trim()).filter((part) => part.length > 0);
  }
  function rulesLines(gate, rules) {
    const lines = [];
    for (const [selector, declarations] of rules) {
      const head = splitSelectorList(selector).map((part) => `body ${part}`).join(", ");
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
      ...tokenLines(SCROLLBAR_TOKENS),
      "}",
      "",
      "/* Darken the decorative gradient behind the header and sidebar. */",
      `${body} .frame-theme-layer-base {`,
      "  background: linear-gradient(128deg, #0F1419 0%, #1A2028 72.12%) !important;",
      "}",
      "",
      ...rulesLines(gate, SHELL_RULES),
      ...rulesLines(gate, ON_ACCENT_RULES),
      "/* Reading pane: a dark canvas. The inline colours inside an email are remapped",
      "   one element at a time at runtime; media keep their own pixels. */",
      `${body} .mail-detail-content {`,
      "  color-scheme: dark;",
      "  background-color: #1A2028 !important;",
      "  color: #E8ECF1 !important;",
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
    const paintEmailSurface = (next) => {
      if (next === THEME_MODE.DARK) {
        enableEmailDarkMode(doc);
        return;
      }
      disableEmailDarkMode();
    };
    paintEmailSurface(mode);
    const paint = (next, persist) => {
      mode = next;
      applyTheme(doc, mode);
      paintEmailSurface(mode);
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
        disableEmailDarkMode();
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
