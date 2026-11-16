// ==UserScript==
// @name         Web Fullscreen Button
// @namespace    https://cyojkoy.github.io/Payment/
// @version      1.0.1
// @description  给只有全屏按钮的视频播放器补一个网页全屏按钮，并把它动态插在全屏按钮前面；网页全屏只铺满浏览器视口，不进入系统全屏。
// @author       Yoko
// @updateURL    https://cdn.jsdelivr.net/gh/CYoJkoY/Yoko-ScriptCat-Scripts@main/dist/web-fullscreen.user.js
// @downloadURL  https://ghfast.top/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/main/dist/web-fullscreen.user.js
// @match        http://*/*
// @match        https://*/*
// @run-at       document-idle
// @grant        none
// @icon         data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%20role%3D%22img%22%20aria-label%3D%22Web%20Fullscreen%20Button%22%3E%20%3Cdefs%3E%20%3ClinearGradient%20id%3D%22bg%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%220%22%20y2%3D%2264%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%20%3Cstop%20offset%3D%220%22%20stop-color%3D%22%2316233d%22%2F%3E%20%3Cstop%20offset%3D%221%22%20stop-color%3D%22%230a1020%22%2F%3E%20%3C%2FlinearGradient%3E%20%3C%2Fdefs%3E%20%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2214%22%20fill%3D%22url(%23bg)%22%2F%3E%20%3Crect%20x%3D%220.75%22%20y%3D%220.75%22%20width%3D%2262.5%22%20height%3D%2262.5%22%20rx%3D%2213.25%22%20fill%3D%22none%22%20stroke%3D%22%232b3d63%22%20stroke-width%3D%221.5%22%2F%3E%20%3Crect%20x%3D%228%22%20y%3D%2213%22%20width%3D%2248%22%20height%3D%2238%22%20rx%3D%226%22%20fill%3D%22none%22%20stroke%3D%22%2338bdf8%22%20stroke-width%3D%222.5%22%2F%3E%20%3Cpath%20d%3D%22M8%2022H56%22%20stroke%3D%22%2338bdf8%22%20stroke-width%3D%222.5%22%2F%3E%20%3Ccircle%20cx%3D%2213.5%22%20cy%3D%2217.5%22%20r%3D%221.5%22%20fill%3D%22%237dd3fc%22%2F%3E%20%3Ccircle%20cx%3D%2218.5%22%20cy%3D%2217.5%22%20r%3D%221.5%22%20fill%3D%22%237dd3fc%22%2F%3E%20%3Ccircle%20cx%3D%2223.5%22%20cy%3D%2217.5%22%20r%3D%221.5%22%20fill%3D%22%237dd3fc%22%2F%3E%20%3Cpath%20d%3D%22M19%2028H16v3M45%2028h3v3M19%2045h-3v-3M45%2045h3v-3%22%20fill%3D%22none%22%20stroke%3D%22%23f8fafc%22%20stroke-width%3D%222.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%20%3Cpath%20d%3D%22M29%2029.5l9%206.5-9%206.5z%22%20fill%3D%22%2338bdf8%22%2F%3E%20%3C%2Fsvg%3E
// @license      MIT
// ==/UserScript==

"use strict";
(() => {
  // scripts/web-fullscreen/src/config.ts
  var SCRIPT_MARKER_ATTRIBUTE = "data-yoko-web-fullscreen-ready";
  var BUTTON_ATTRIBUTE = "data-yoko-web-fullscreen";
  var BUTTON_CLASS = "yoko-web-fullscreen-button";
  var FLOATING_BUTTON_CLASS = "yoko-web-fullscreen-floating";
  var LABELS = {
    enter: "网页全屏",
    exit: "退出网页全屏"
  };
  var NATIVE_FULLSCREEN_TEXT = /^(?:(?:enter|exit|go|toggle|switch|open|close)\s+)?full\s*-?\s*screen(?:\s+(?:mode|view))?(?:\s*\([^)]*\))?$|^(?:(?:进入|退出|开启|关闭|切换|播放器)\s*)?全屏(?:播放|模式|观看)?(?:\s*[（(][^）)]*[）)])?$/iu;
  var FULLSCREEN_HINT_TEXT = /full\s*-?\s*screen|全屏/iu;
  var EXISTING_WEB_FULLSCREEN_TEXT = /网页全屏|web\s*-?\s*fullscreen|theater|theatre|影院|宽屏|wide\s*-?\s*screen/iu;
  var FULLSCREEN_LABEL_ATTRIBUTES = [
    "aria-label",
    "title",
    "data-title",
    "data-tooltip",
    "data-original-title"
  ];
  var CONTROL_CANDIDATE_SELECTOR = [
    "button",
    '[role="button"]',
    "a[href]",
    "[tabindex]",
    "[aria-label]",
    '[class*="fullscreen"]',
    '[class*="full-screen"]',
    '[class*="full_screen"]',
    '[data-role*="fullscreen"]',
    '[data-action*="fullscreen"]',
    '[data-test*="fullscreen"]',
    '[data-testid*="fullscreen"]'
  ].join(",");
  var MAX_LABEL_LENGTH = 40;
  var PLAYER_SEARCH_DEPTH = 12;
  var PLAYER_MAX_WIDTH_RATIO = 1.8;
  var PLAYER_MAX_HEIGHT_RATIO = 2.6;
  var MIN_VIDEO_WIDTH_PX = 240;
  var MIN_VIDEO_HEIGHT_PX = 135;
  var SCAN_DEBOUNCE_MS = 180;
  var VIEWPORT_Z_INDEX = "2147483000";
  var FLOATING_BUTTON_SIZE_PX = 34;
  var FLOATING_BUTTON_RIGHT_OFFSET_PX = 52;
  var FLOATING_BUTTON_BOTTOM_OFFSET_PX = 8;
  var BOX_SIDES = ["top", "right", "bottom", "left"];
  var RADIUS_CORNERS = [
    "top-left",
    "top-right",
    "bottom-right",
    "bottom-left"
  ];
  var EDGE_PROPERTIES = [
    ...BOX_SIDES.map((side) => `margin-${side}`),
    ...BOX_SIDES.map((side) => `padding-${side}`)
  ];
  var BORDER_PROPERTIES = BOX_SIDES.flatMap((side) => [
    `border-${side}-width`,
    `border-${side}-style`
  ]);
  var RADIUS_PROPERTIES = RADIUS_CORNERS.map(
    (corner) => `border-${corner}-radius`
  );
  var EDGE_STYLES = [
    ...BOX_SIDES.map((side) => [`margin-${side}`, "0"]),
    ...BOX_SIDES.map((side) => [`padding-${side}`, "0"])
  ];
  var BORDER_STYLES = BOX_SIDES.flatMap((side) => [
    [`border-${side}-width`, "0"],
    [`border-${side}-style`, "none"]
  ]);
  var RADIUS_STYLES = RADIUS_CORNERS.map(
    (corner) => [`border-${corner}-radius`, "0"]
  );
  var PLAYER_STYLE_PROPERTIES = [
    "position",
    "top",
    "left",
    "right",
    "bottom",
    "width",
    "height",
    "max-width",
    "max-height",
    "min-width",
    "min-height",
    ...EDGE_PROPERTIES,
    ...BORDER_PROPERTIES,
    ...RADIUS_PROPERTIES,
    "box-sizing",
    "z-index",
    "background-color",
    "overflow-x",
    "overflow-y",
    "transform",
    "contain"
  ];
  var PLAYER_FULLSCREEN_STYLES = [
    ["position", "fixed"],
    ["top", "0"],
    ["left", "0"],
    ["right", "auto"],
    ["bottom", "auto"],
    ["width", "100vw"],
    ["height", "100vh"],
    ["max-width", "none"],
    ["max-height", "none"],
    ["min-width", "0"],
    ["min-height", "0"],
    ...EDGE_STYLES,
    ...BORDER_STYLES,
    ...RADIUS_STYLES,
    ["box-sizing", "border-box"],
    ["z-index", VIEWPORT_Z_INDEX],
    ["background-color", "#000"],
    ["overflow-x", "hidden"],
    ["overflow-y", "hidden"],
    ["transform", "none"],
    ["contain", "none"]
  ];
  var VIDEO_STYLE_PROPERTIES = [
    "position",
    "top",
    "left",
    "width",
    "height",
    "max-width",
    "max-height",
    "min-width",
    "min-height",
    ...BOX_SIDES.map((side) => `margin-${side}`),
    "object-fit",
    "background-color",
    "z-index",
    "transform"
  ];
  var CUSTOM_PLAYER_VIDEO_STYLES = [
    ["width", "100%"],
    ["height", "100%"],
    ["max-width", "none"],
    ["max-height", "none"],
    ["min-width", "0"],
    ["min-height", "0"],
    ["object-fit", "contain"],
    ["background-color", "#000"]
  ];
  var NATIVE_VIDEO_STYLES = [
    ["position", "fixed"],
    ["top", "0"],
    ["left", "0"],
    ["right", "auto"],
    ["bottom", "auto"],
    ["width", "100vw"],
    ["height", "100vh"],
    ["max-width", "none"],
    ["max-height", "none"],
    ["min-width", "0"],
    ["min-height", "0"],
    ...BOX_SIDES.map((side) => [`margin-${side}`, "0"]),
    ["object-fit", "contain"],
    ["background-color", "#000"],
    ["z-index", VIEWPORT_Z_INDEX],
    ["transform", "none"]
  ];
  var CONTAINING_BLOCK_PROPERTIES = [
    "transform",
    "filter",
    "perspective",
    "contain",
    "will-change",
    "backdrop-filter",
    "z-index",
    "isolation"
  ];
  var CONTAINING_BLOCK_STYLES = [
    ["transform", "none"],
    ["filter", "none"],
    ["perspective", "none"],
    ["contain", "none"],
    ["will-change", "auto"],
    ["backdrop-filter", "none"],
    ["z-index", "auto"],
    ["isolation", "auto"]
  ];
  var SCROLL_LOCK_PROPERTIES = ["overflow-x", "overflow-y"];
  var FRAME_CHANNEL = "yoko-web-fullscreen-frame";
  var FRAME_STYLE_PROPERTIES = [
    "position",
    "top",
    "left",
    "right",
    "bottom",
    "width",
    "height",
    "max-width",
    "max-height",
    "min-width",
    "min-height",
    ...EDGE_PROPERTIES,
    ...BORDER_PROPERTIES,
    "box-sizing",
    "background-color",
    "z-index"
  ];
  var FRAME_FULLSCREEN_STYLES = [
    ["position", "fixed"],
    ["top", "0"],
    ["left", "0"],
    ["right", "auto"],
    ["bottom", "auto"],
    ["width", "100vw"],
    ["height", "100vh"],
    ["max-width", "none"],
    ["max-height", "none"],
    ["min-width", "0"],
    ["min-height", "0"],
    ...EDGE_STYLES,
    ...BORDER_STYLES,
    ["box-sizing", "border-box"],
    ["background-color", "#000"],
    ["z-index", VIEWPORT_Z_INDEX]
  ];
  var DANGEROUS_BUTTON_ATTRIBUTES = /* @__PURE__ */ new Set([
    "id",
    "href",
    "target",
    "download",
    "disabled",
    "hidden",
    "aria-pressed",
    "aria-expanded",
    "aria-haspopup",
    "aria-controls",
    "aria-keyshortcuts",
    "aria-labelledby",
    "aria-describedby",
    "aria-disabled",
    "aria-hidden"
  ]);
  var BUTTON_STATE_CLASS_PATTERN = /^(?:.*[-_])?(?:is-)?(?:active|selected|checked|current|disabled|hidden|focused|on)$/iu;

  // shared/utils/debounce.ts
  function createDebounced(task, options) {
    const schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    const cancelSchedule = options.cancelSchedule ?? ((handle) => clearTimeout(handle));
    let timer = null;
    let lastArgs = null;
    const invoke = () => {
      timer = null;
      const args = lastArgs;
      lastArgs = null;
      if (args !== null) task(...args);
    };
    const debounced = ((...args) => {
      lastArgs = args;
      if (timer !== null) cancelSchedule(timer);
      timer = schedule(invoke, Math.max(0, options.delayMs));
    });
    debounced.cancel = () => {
      if (timer !== null) cancelSchedule(timer);
      timer = null;
      lastArgs = null;
    };
    debounced.flush = () => {
      if (timer === null) return;
      cancelSchedule(timer);
      invoke();
    };
    Object.defineProperty(debounced, "pending", { get: () => timer !== null });
    return debounced;
  }

  // shared/userscript/globals.ts
  function isRecord(value) {
    return typeof value === "object" && value !== null;
  }

  // scripts/web-fullscreen/src/core/styles.ts
  function captureStyles(element, properties) {
    return {
      element,
      values: properties.map((property) => ({
        property,
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property)
      }))
    };
  }
  function applyStyles(element, declarations) {
    for (const [property, value] of declarations) {
      element.style.setProperty(property, value, "important");
    }
  }
  function restoreStyles(snapshot) {
    for (const { property, value, priority } of snapshot.values) {
      if (value === "") {
        snapshot.element.style.removeProperty(property);
        continue;
      }
      snapshot.element.style.setProperty(property, value, priority);
    }
  }

  // scripts/web-fullscreen/src/core/viewport.ts
  function parentElementOrShadowHost(element) {
    const parent = element.parentElement;
    if (parent !== null) return parent;
    const root = element.getRootNode();
    if (!(root instanceof ShadowRoot)) return null;
    return root.host instanceof HTMLElement ? root.host : null;
  }
  function promoteToViewport(element, properties, declarations, snapshots) {
    snapshots.push(captureStyles(element, properties));
    applyStyles(element, declarations);
    let ancestor = parentElementOrShadowHost(element);
    while (ancestor !== null) {
      snapshots.push(captureStyles(ancestor, CONTAINING_BLOCK_PROPERTIES));
      applyStyles(ancestor, CONTAINING_BLOCK_STYLES);
      ancestor = parentElementOrShadowHost(ancestor);
    }
  }

  // scripts/web-fullscreen/src/core/frameBridge.ts
  function readFrameAction(data) {
    if (!isRecord(data) || data["channel"] !== FRAME_CHANNEL) return null;
    const action = data["action"];
    if (action === "enter" || action === "exit") return action;
    return null;
  }
  function findFrameBySource(doc, source) {
    if (source === null) return null;
    for (const frame of doc.querySelectorAll("iframe, frame")) {
      if (Object.is(frame.contentWindow, source)) return frame;
    }
    return null;
  }
  function postToFrame(frame, action) {
    const target = frame.contentWindow;
    if (target === null) return;
    target.postMessage({ channel: FRAME_CHANNEL, action }, "*");
  }
  function hasUserActivation(view) {
    const activation = view.navigator.userActivation;
    return activation === void 0 || activation.isActive;
  }
  function notifyParentFrame(action, view) {
    if (view.parent === view) return;
    view.parent.postMessage({ channel: FRAME_CHANNEL, action }, "*");
  }
  function installFrameBridge(doc, options) {
    const view = doc.defaultView;
    if (view === null) return () => void 0;
    const frameWindow = view;
    const frames = /* @__PURE__ */ new Map();
    let keydownAttached = false;
    const detachKeydownIfIdle = () => {
      if (!keydownAttached || frames.size > 0) return;
      frameWindow.removeEventListener("keydown", onKeyDown, true);
      keydownAttached = false;
    };
    const releaseFrame = (frame, notifyChild) => {
      const state = frames.get(frame);
      if (state === void 0) return;
      frames.delete(frame);
      for (let index = state.snapshots.length - 1; index >= 0; index -= 1) {
        const snapshot = state.snapshots[index];
        if (snapshot !== void 0) restoreStyles(snapshot);
      }
      state.releaseScroll();
      if (state.forwarded) notifyParentFrame("exit", frameWindow);
      if (notifyChild) postToFrame(frame, "exit");
      detachKeydownIfIdle();
    };
    const restoreAll = (notifyChildren) => {
      for (const frame of [...frames.keys()]) {
        releaseFrame(frame, notifyChildren);
      }
    };
    const enterFrame = (frame) => {
      if (frames.has(frame)) return;
      const snapshots = [];
      promoteToViewport(
        frame,
        FRAME_STYLE_PROPERTIES,
        FRAME_FULLSCREEN_STYLES,
        snapshots
      );
      const forwarded = frameWindow.parent !== frameWindow;
      const releaseScroll = options.scrollLock.acquire();
      frames.set(frame, { snapshots, forwarded, releaseScroll });
      attachKeydown();
      if (forwarded) notifyParentFrame("enter", frameWindow);
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape" || frames.size === 0) return;
      event.preventDefault();
      event.stopPropagation();
      restoreAll(true);
    };
    function attachKeydown() {
      if (keydownAttached) return;
      frameWindow.addEventListener("keydown", onKeyDown, true);
      keydownAttached = true;
    }
    const onMessage = (event) => {
      const action = readFrameAction(event.data);
      if (action === null) return;
      if (Object.is(event.source, frameWindow.parent)) {
        if (action !== "exit") return;
        options.onParentExit();
        restoreAll(true);
        return;
      }
      const frame = findFrameBySource(doc, event.source);
      if (frame === null) return;
      if (action === "enter") {
        if (hasUserActivation(frameWindow)) enterFrame(frame);
        return;
      }
      releaseFrame(frame, false);
    };
    frameWindow.addEventListener("message", onMessage);
    return () => {
      frameWindow.removeEventListener("message", onMessage);
      frameWindow.removeEventListener("keydown", onKeyDown, true);
      keydownAttached = false;
      restoreAll(true);
    };
  }

  // scripts/web-fullscreen/src/core/scrollLock.ts
  var HIDDEN_OVERFLOW = [
    ["overflow-x", "hidden"],
    ["overflow-y", "hidden"]
  ];
  function lockDocumentScroll(doc) {
    const targets = [doc.documentElement, doc.body].filter(
      (element) => element !== null
    );
    return targets.map((element) => {
      const snapshot = captureStyles(element, SCROLL_LOCK_PROPERTIES);
      applyStyles(element, HIDDEN_OVERFLOW);
      return snapshot;
    });
  }
  function createScrollLock(doc) {
    let snapshots = null;
    let owners = 0;
    const releaseAll = () => {
      if (snapshots === null) return;
      const captured = snapshots;
      snapshots = null;
      for (let index = captured.length - 1; index >= 0; index -= 1) {
        const snapshot = captured[index];
        if (snapshot !== void 0) restoreStyles(snapshot);
      }
    };
    return {
      acquire() {
        if (snapshots === null) snapshots = lockDocumentScroll(doc);
        owners += 1;
        let released = false;
        return () => {
          if (released) return;
          released = true;
          owners = Math.max(0, owners - 1);
          if (owners === 0) releaseAll();
        };
      }
    };
  }

  // scripts/web-fullscreen/src/core/controller.ts
  function stylePlayer(target, snapshots) {
    if (target.mode === "native") {
      promoteToViewport(
        target.player,
        PLAYER_STYLE_PROPERTIES,
        NATIVE_VIDEO_STYLES,
        snapshots
      );
      return;
    }
    promoteToViewport(
      target.player,
      PLAYER_STYLE_PROPERTIES,
      PLAYER_FULLSCREEN_STYLES,
      snapshots
    );
    snapshots.push(captureStyles(target.video, VIDEO_STYLE_PROPERTIES));
    applyStyles(target.video, CUSTOM_PLAYER_VIDEO_STYLES);
  }
  function createWebFullscreenController(doc = document, scrollLock = createScrollLock(doc)) {
    const view = doc.defaultView;
    if (view === null) throw new Error("The document has no browsing window");
    let active = null;
    const listeners = /* @__PURE__ */ new Set();
    const emit = () => {
      const video = active?.target.video ?? null;
      for (const listener of listeners) listener(video);
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      exit();
    };
    const onFullscreenChange = () => {
      if (doc.fullscreenElement !== null) exit();
    };
    const removeListeners = () => {
      doc.removeEventListener("keydown", onKeyDown, true);
      doc.removeEventListener("fullscreenchange", onFullscreenChange);
    };
    const exit = () => {
      if (active === null) return;
      const state = active;
      active = null;
      removeListeners();
      for (let index = state.snapshots.length - 1; index >= 0; index -= 1) {
        const snapshot = state.snapshots[index];
        if (snapshot !== void 0) restoreStyles(snapshot);
      }
      state.releaseScroll();
      notifyParentFrame("exit", view);
      emit();
    };
    const enter = (target) => {
      if (!target.video.isConnected) return false;
      const snapshots = [];
      const releaseScroll = scrollLock.acquire();
      active = { target, snapshots, releaseScroll };
      stylePlayer(target, snapshots);
      doc.addEventListener("keydown", onKeyDown, true);
      doc.addEventListener("fullscreenchange", onFullscreenChange);
      notifyParentFrame("enter", view);
      emit();
      return true;
    };
    return {
      toggle(target) {
        if (active !== null && active.target.video === target.video) {
          exit();
          return false;
        }
        if (active !== null) exit();
        enter(target);
        return active !== null;
      },
      exit,
      isActiveFor(video) {
        return active !== null && active.target.video === video;
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    };
  }

  // scripts/web-fullscreen/src/core/detect.ts
  function readLabels(element) {
    const labels = [];
    for (const attribute of FULLSCREEN_LABEL_ATTRIBUTES) {
      const value = element.getAttribute(attribute);
      if (value !== null && value.trim().length > 0) labels.push(value.trim());
    }
    const text = element.textContent?.trim() ?? "";
    if (text.length > 0 && text.length <= MAX_LABEL_LENGTH) labels.push(text);
    return labels;
  }
  function isClickable(element) {
    return element.matches(
      'button, [role="button"], a[href], [tabindex], [onclick], [class*="btn"], [class*="button"], [class*="ctrl"], [class*="control"]'
    );
  }
  function identifierOf(element) {
    const testId = element.getAttribute("data-testid") ?? "";
    return `${element.id} ${element.className} ${testId}`;
  }
  function scoreButton(element, video) {
    if (element.hasAttribute(BUTTON_ATTRIBUTE)) return 0;
    if (element.contains(video)) return 0;
    if (element.closest('[role="menu"], [role="dialog"]') !== null) return 0;
    const labels = readLabels(element);
    const identifier = identifierOf(element);
    let score = 0;
    if (labels.some((label) => NATIVE_FULLSCREEN_TEXT.test(label))) score += 6;
    if (FULLSCREEN_HINT_TEXT.test(identifier)) score += 3;
    if (labels.some((label) => FULLSCREEN_HINT_TEXT.test(label))) score += 2;
    if (score > 0 && isClickable(element)) score += 1;
    return score;
  }
  function collectCandidates(root) {
    const candidates = [];
    for (const element of root.querySelectorAll(CONTROL_CANDIDATE_SELECTOR)) {
      if (element instanceof HTMLElement) candidates.push(element);
    }
    return candidates;
  }
  function findControls(root, video) {
    let bestButton = null;
    let bestScore = 0;
    let hasWebFullscreen = false;
    for (const candidate of collectCandidates(root)) {
      if (candidate.hasAttribute(BUTTON_ATTRIBUTE)) continue;
      const labels = readLabels(candidate);
      if (isClickable(candidate) && labels.some((label) => EXISTING_WEB_FULLSCREEN_TEXT.test(label))) {
        hasWebFullscreen = true;
        continue;
      }
      const score = scoreButton(candidate, video);
      if (score <= bestScore) continue;
      bestButton = candidate;
      bestScore = score;
    }
    return { button: bestButton, hasWebFullscreen };
  }
  function fitsPlayerBounds(node, videoRect) {
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return true;
    return rect.width <= videoRect.width * PLAYER_MAX_WIDTH_RATIO && rect.height <= videoRect.height * PLAYER_MAX_HEIGHT_RATIO;
  }
  function findPlayerMatch(video) {
    const doc = video.ownerDocument;
    const videoRect = video.getBoundingClientRect();
    let node = video.parentElement;
    let depth = 0;
    while (node !== null && node !== doc.body && depth < PLAYER_SEARCH_DEPTH) {
      if (!fitsPlayerBounds(node, videoRect)) break;
      const controls = findControls(node, video);
      if (controls.hasWebFullscreen) {
        return { video, mode: "skip", root: node, fullscreenButton: null };
      }
      if (controls.button !== null) {
        return {
          video,
          mode: "custom",
          root: node,
          fullscreenButton: controls.button
        };
      }
      node = node.parentElement;
      depth += 1;
    }
    return { video, mode: "native", root: video, fullscreenButton: null };
  }

  // scripts/web-fullscreen/src/ui/icon.ts
  var SVG_NAMESPACE = "http://www.w3.org/2000/svg";
  function svgElement(tag, attributes) {
    const element = document.createElementNS(SVG_NAMESPACE, tag);
    for (const [name, value] of Object.entries(attributes)) {
      element.setAttribute(name, value);
    }
    return element;
  }
  function createWebFullscreenIcon() {
    const icon = svgElement("svg", {
      viewBox: "0 0 24 24",
      "aria-hidden": "true",
      focusable: "false"
    });
    icon.style.width = "1em";
    icon.style.height = "1em";
    icon.style.flex = "0 0 auto";
    icon.style.pointerEvents = "none";
    const frame = svgElement("rect", {
      x: "2.75",
      y: "4.75",
      width: "18.5",
      height: "14.5",
      rx: "2.25",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.5"
    });
    const corners = svgElement("path", {
      d: "M9 10V8.5h2M15 10V8.5h-2M9 14v1.5h2M15 14v1.5h-2",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.5",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    });
    icon.append(frame, corners);
    return icon;
  }

  // scripts/web-fullscreen/src/ui/button.ts
  function stripCloneAttributes(element) {
    for (const attribute of [...element.attributes]) {
      if (attribute.name.startsWith("data-") || DANGEROUS_BUTTON_ATTRIBUTES.has(attribute.name)) {
        element.removeAttribute(attribute.name);
      }
    }
    const stateClasses = [...element.classList].filter(
      (name) => BUTTON_STATE_CLASS_PATTERN.test(name)
    );
    element.classList.remove(...stateClasses);
    if (element.style.display === "none") element.style.removeProperty("display");
  }
  function applyFallbackStyle(button) {
    const style = button.style;
    style.display = "inline-flex";
    style.alignItems = "center";
    style.justifyContent = "center";
    style.width = "2em";
    style.height = "2em";
    style.padding = "0";
    style.border = "0";
    style.background = "transparent";
    style.color = "inherit";
    style.cursor = "pointer";
  }
  function createFullscreenButton(match) {
    const anchor = match.fullscreenButton;
    if (anchor === null) throw new Error("A custom player needs a fullscreen anchor");
    if (anchor.parentElement === null) {
      throw new Error("The fullscreen anchor is detached from the DOM");
    }
    const button = anchor.cloneNode(false);
    stripCloneAttributes(button);
    button.classList.add(BUTTON_CLASS);
    button.setAttribute(BUTTON_ATTRIBUTE, "");
    button.setAttribute("aria-label", LABELS.enter);
    button.setAttribute("title", LABELS.enter);
    button.setAttribute("aria-pressed", "false");
    if (button instanceof HTMLButtonElement) button.type = "button";
    else {
      button.setAttribute("role", "button");
      button.setAttribute("tabindex", "0");
    }
    if (button.classList.length === 1) applyFallbackStyle(button);
    button.replaceChildren(createWebFullscreenIcon());
    return button;
  }
  function insertBeforeFullscreen(match, button) {
    const anchor = match.fullscreenButton;
    if (anchor === null || anchor.parentElement === null) return false;
    anchor.parentElement.insertBefore(button, anchor);
    return true;
  }
  function styleFloatingButton(button) {
    const style = button.style;
    style.position = "fixed";
    style.display = "inline-flex";
    style.alignItems = "center";
    style.justifyContent = "center";
    style.width = `${FLOATING_BUTTON_SIZE_PX}px`;
    style.height = `${FLOATING_BUTTON_SIZE_PX}px`;
    style.padding = "0";
    style.border = "1px solid rgba(255, 255, 255, 0.35)";
    style.borderRadius = "6px";
    style.background = "rgba(0, 0, 0, 0.62)";
    style.color = "#fff";
    style.cursor = "pointer";
    style.boxSizing = "border-box";
    style.zIndex = VIEWPORT_Z_INDEX;
    style.fontSize = "18px";
    style.lineHeight = "1";
  }
  function createFloatingButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = FLOATING_BUTTON_CLASS;
    button.setAttribute(BUTTON_ATTRIBUTE, "");
    button.setAttribute("aria-label", LABELS.enter);
    button.setAttribute("title", LABELS.enter);
    button.setAttribute("aria-pressed", "false");
    styleFloatingButton(button);
    button.append(createWebFullscreenIcon());
    return button;
  }
  function positionFloatingButton(button, video, view) {
    const rect = video.getBoundingClientRect();
    const visible = rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < view.innerWidth && rect.top < view.innerHeight;
    button.style.display = visible ? "inline-flex" : "none";
    if (!visible) return;
    const right = Math.max(0, view.innerWidth - rect.right) + FLOATING_BUTTON_RIGHT_OFFSET_PX;
    const bottom = Math.max(0, view.innerHeight - rect.bottom) + FLOATING_BUTTON_BOTTOM_OFFSET_PX;
    button.style.right = `${Math.round(right)}px`;
    button.style.bottom = `${Math.round(bottom)}px`;
  }

  // scripts/web-fullscreen/src/ui/layout.ts
  var FALLBACK_GAP_EM = 0.35;
  var DEFAULT_FONT_SIZE_PX = 16;
  var MIN_SHIFT_PX = 0.5;
  var MIN_TRANSFORM_SCALE = 0.05;
  var MAX_LOCAL_SHIFT_RATIO = 1 / MIN_TRANSFORM_SCALE;
  var MIN_APPLIED_SHIFT_PX = 5e-3;
  var LAYOUT_EPSILON_PX = 0.5;
  var POSITION_OFFSET_PROPERTIES = ["top", "right", "bottom", "left"];
  var NO_TRANSLATE_VALUES = /* @__PURE__ */ new Set([
    "",
    "none",
    "initial",
    "inherit",
    "unset",
    "revert",
    "revert-layer"
  ]);
  var FLEX_OR_GRID_DISPLAYS = /* @__PURE__ */ new Set([
    "flex",
    "inline-flex",
    "grid",
    "inline-grid"
  ]);
  var IDENTITY_AXES = { a: 1, b: 0, c: 0, d: 1 };
  function formatPx(value) {
    return `${Math.round(value * 100) / 100}px`;
  }
  function readPx(style, property) {
    if (style === null) return null;
    const raw = style.getPropertyValue(property).trim();
    if (raw.length === 0) return null;
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  function computedStyleOf(element) {
    return element.ownerDocument.defaultView?.getComputedStyle(element) ?? null;
  }
  function layoutBoxOf(element) {
    return {
      left: element.offsetLeft,
      top: element.offsetTop,
      width: element.offsetWidth,
      height: element.offsetHeight
    };
  }
  function offsetBoxOf(element) {
    const view = element.ownerDocument.defaultView;
    if (view === null || !(element instanceof view.HTMLElement)) return null;
    return layoutBoxOf(element);
  }
  function relativeRectOf(element, origin) {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left - origin.left,
      top: rect.top - origin.top,
      width: rect.width,
      height: rect.height
    };
  }
  function isSameLayoutBox(left, right) {
    return Math.abs(left.left - right.left) < LAYOUT_EPSILON_PX && Math.abs(left.top - right.top) < LAYOUT_EPSILON_PX && Math.abs(left.width - right.width) < LAYOUT_EPSILON_PX && Math.abs(left.height - right.height) < LAYOUT_EPSILON_PX;
  }
  function snapshotFit(anchor, button) {
    const anchorRect = anchor.getBoundingClientRect();
    const siblings = [];
    for (let sibling = button.previousElementSibling; sibling !== null; sibling = sibling.previousElementSibling) {
      if (!isStyledElement(sibling)) continue;
      siblings.push({
        element: sibling,
        offset: offsetBoxOf(sibling),
        rect: relativeRectOf(sibling, anchorRect)
      });
    }
    return {
      anchorOffset: layoutBoxOf(anchor),
      buttonRect: relativeRectOf(button, anchorRect),
      siblings
    };
  }
  function isSameSiblingSnapshot(left, right) {
    if (left.element !== right.element) return false;
    if (!isSameLayoutBox(left.rect, right.rect)) return false;
    if (left.offset === null || right.offset === null) {
      return left.offset === right.offset;
    }
    return isSameLayoutBox(left.offset, right.offset);
  }
  function isSameFitSnapshot(left, right) {
    if (!isSameLayoutBox(left.anchorOffset, right.anchorOffset)) return false;
    if (!isSameLayoutBox(left.buttonRect, right.buttonRect)) return false;
    if (left.siblings.length !== right.siblings.length) return false;
    for (let index = 0; index < left.siblings.length; index += 1) {
      const prevSibling = left.siblings[index];
      const nextSibling = right.siblings[index];
      if (prevSibling === void 0 || nextSibling === void 0) return false;
      if (!isSameSiblingSnapshot(prevSibling, nextSibling)) return false;
    }
    return true;
  }
  function isRtl(style) {
    if (style === null) return false;
    return style.getPropertyValue("direction").trim().toLowerCase() === "rtl";
  }
  function isStyledElement(element) {
    if (element === null) return false;
    const view = element.ownerDocument.defaultView;
    if (view === null) return false;
    return element instanceof view.HTMLElement || element instanceof view.SVGElement;
  }
  function captureStyle(snapshots, element, property) {
    if (snapshots.some(
      (snapshot) => snapshot.element === element && snapshot.property === property
    )) {
      return;
    }
    snapshots.push({
      element,
      property,
      value: element.style.getPropertyValue(property),
      priority: element.style.getPropertyPriority(property)
    });
  }
  function restoreStyles2(snapshots) {
    for (let index = snapshots.length - 1; index >= 0; index -= 1) {
      const snapshot = snapshots[index];
      if (snapshot === void 0) continue;
      if (snapshot.value.length === 0) {
        snapshot.element.style.removeProperty(snapshot.property);
        continue;
      }
      snapshot.element.style.setProperty(
        snapshot.property,
        snapshot.value,
        snapshot.priority
      );
    }
  }
  function rebaseSiteChangedProperties(snapshots, ownedStyles) {
    for (let index = 0; index < snapshots.length; index += 1) {
      const snapshot = snapshots[index];
      if (snapshot === void 0) continue;
      const owned = ownedStyles.get(snapshot.element);
      if (owned === void 0) continue;
      if ((snapshot.element.getAttribute("style") ?? "") === owned.attribute) {
        continue;
      }
      const ownedValue = owned.values.get(snapshot.property);
      if (ownedValue === void 0) continue;
      const currentValue = snapshot.element.style.getPropertyValue(
        snapshot.property
      );
      const currentPriority = snapshot.element.style.getPropertyPriority(
        snapshot.property
      );
      if (currentValue === ownedValue.value && currentPriority === ownedValue.priority) {
        continue;
      }
      snapshots[index] = {
        ...snapshot,
        value: currentValue,
        priority: currentPriority
      };
    }
  }
  function fallbackGapPx(anchorStyle) {
    const fontSize = readPx(anchorStyle, "font-size") ?? DEFAULT_FONT_SIZE_PX;
    if (!(fontSize > 0)) return DEFAULT_FONT_SIZE_PX * FALLBACK_GAP_EM;
    return fontSize * FALLBACK_GAP_EM;
  }
  function resolveSpacePx(parentStyle, anchorStyle) {
    const gap = readPx(parentStyle, "column-gap") ?? readPx(parentStyle, "gap");
    if (gap !== null && gap > 0) return gap;
    return fallbackGapPx(anchorStyle);
  }
  function isPositiveMargin(raw) {
    const value = raw.trim();
    if (value.length === 0) return false;
    if (value.toLowerCase() === "auto") return true;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed > 0 : true;
  }
  function hasPositiveMargin(style, side) {
    if (style === null) return false;
    return isPositiveMargin(style.getPropertyValue(side.logical)) || isPositiveMargin(style.getPropertyValue(side.physical));
  }
  function resolveMainAxis(parentStyle) {
    if (parentStyle === null) return { orientation: "inline", reversed: false };
    const display = parentStyle.getPropertyValue("display").trim().toLowerCase();
    if (display === "flex" || display === "inline-flex") {
      const direction = parentStyle.getPropertyValue("flex-direction").trim().toLowerCase();
      return {
        orientation: direction.startsWith("column") ? "block" : "inline",
        reversed: direction.endsWith("-reverse")
      };
    }
    if (display === "grid" || display === "inline-grid") {
      const block = parentStyle.getPropertyValue("grid-auto-flow").trim().toLowerCase().split(/\s+/u).includes("column");
      return { orientation: block ? "block" : "inline", reversed: false };
    }
    return { orientation: "inline", reversed: false };
  }
  function marginSidesFor(orientation, style) {
    if (orientation === "block") {
      return {
        start: { logical: "margin-block-start", physical: "margin-top" },
        end: { logical: "margin-block-end", physical: "margin-bottom" }
      };
    }
    const rtl = isRtl(style);
    return {
      start: {
        logical: "margin-inline-start",
        physical: rtl ? "margin-right" : "margin-left"
      },
      end: {
        logical: "margin-inline-end",
        physical: rtl ? "margin-left" : "margin-right"
      }
    };
  }
  function resolveMainAxisGap(parentStyle, orientation) {
    return orientation === "block" ? readPx(parentStyle, "row-gap") ?? readPx(parentStyle, "gap") : readPx(parentStyle, "column-gap") ?? readPx(parentStyle, "gap");
  }
  function reserveFlexSpace(button, parentStyle, anchorStyle, snapshots) {
    captureStyle(snapshots, button, "flex-grow");
    captureStyle(snapshots, button, "flex-shrink");
    captureStyle(snapshots, button, "flex-basis");
    button.style.setProperty("flex-grow", "0");
    button.style.setProperty("flex-shrink", "0");
    button.style.setProperty("flex-basis", "auto");
    const axis = resolveMainAxis(parentStyle);
    const gap = resolveMainAxisGap(parentStyle, axis.orientation);
    if (gap !== null && gap > 0) return;
    const buttonStyle = computedStyleOf(button);
    const space = formatPx(fallbackGapPx(anchorStyle));
    const buttonSides = marginSidesFor(axis.orientation, buttonStyle);
    const anchorSides = marginSidesFor(axis.orientation, anchorStyle);
    const precedingButtonSide = axis.reversed ? buttonSides.end : buttonSides.start;
    const anchorFacingButtonSide = axis.reversed ? buttonSides.start : buttonSides.end;
    const buttonFacingAnchorSide = axis.reversed ? anchorSides.end : anchorSides.start;
    if (!hasPositiveMargin(buttonStyle, precedingButtonSide)) {
      captureStyle(snapshots, button, precedingButtonSide.logical);
      button.style.setProperty(precedingButtonSide.logical, space);
    }
    const hasAnchorGap = hasPositiveMargin(anchorStyle, buttonFacingAnchorSide) || hasPositiveMargin(buttonStyle, anchorFacingButtonSide);
    if (!hasAnchorGap) {
      captureStyle(snapshots, button, anchorFacingButtonSide.logical);
      button.style.setProperty(anchorFacingButtonSide.logical, space);
    }
  }
  function splitComponentValues(value) {
    const parts = [];
    let current = "";
    let depth = 0;
    for (const character of value) {
      if (character === "(") depth += 1;
      else if (character === ")") depth = Math.max(0, depth - 1);
      if (/\s/u.test(character) && depth === 0) {
        if (current.length > 0) {
          parts.push(current);
          current = "";
        }
        continue;
      }
      current += character;
    }
    if (current.length > 0) parts.push(current);
    return parts;
  }
  function composeShiftedComponent(base, deltaPx) {
    if (Math.abs(deltaPx) < MIN_APPLIED_SHIFT_PX) return base;
    const operator = deltaPx < 0 ? "-" : "+";
    return `calc(${base} ${operator} ${formatPx(Math.abs(deltaPx))})`;
  }
  function composeShiftedTranslate(style, shift) {
    if (Math.abs(shift.x) < MIN_APPLIED_SHIFT_PX && Math.abs(shift.y) < MIN_APPLIED_SHIFT_PX) {
      return null;
    }
    const raw = style?.getPropertyValue("translate").trim() ?? "";
    const parts = NO_TRANSLATE_VALUES.has(raw.toLowerCase()) ? [] : splitComponentValues(raw);
    if (parts.length === 0) {
      if (Math.abs(shift.y) < MIN_APPLIED_SHIFT_PX) {
        return `${formatPx(shift.x)} 0`;
      }
      return `${formatPx(shift.x)} ${formatPx(shift.y)}`;
    }
    const x = parts[0] === "0" ? "0px" : parts[0] ?? "0px";
    const y = parts[1] ?? "0";
    const z = parts[2];
    const shifted = `${composeShiftedComponent(x, shift.x)} ${composeShiftedComponent(y, shift.y)}`;
    return z === void 0 ? shifted : `${shifted} ${z}`;
  }
  function angleRadiansOf(raw) {
    const match = /^(-?(?:\d+\.?\d*|\.\d+))(deg|grad|rad|turn)?$/iu.exec(raw.trim());
    if (match === null) return null;
    const value = Number.parseFloat(match[1] ?? "");
    if (!Number.isFinite(value)) return null;
    switch ((match[2] ?? "deg").toLowerCase()) {
      case "grad":
        return value * Math.PI / 200;
      case "rad":
        return value;
      case "turn":
        return value * Math.PI * 2;
      case "deg":
        return value * Math.PI / 180;
      default:
        return null;
    }
  }
  function transformPropertyAxesOf(style) {
    const raw = style?.getPropertyValue("transform").trim() ?? "";
    if (raw.length === 0 || raw.toLowerCase() === "none") return IDENTITY_AXES;
    const matrix = /^matrix(3d)?\(([^)]*)\)$/iu.exec(raw);
    if (matrix !== null) {
      const parts = (matrix[2] ?? "").split(",").map((part) => Number.parseFloat(part));
      const threeD = matrix[1] !== void 0;
      const a = parts[0];
      const b = parts[1];
      const c = parts[threeD ? 4 : 2];
      const d = parts[threeD ? 5 : 3];
      if (a === void 0 || b === void 0 || c === void 0 || d === void 0) {
        return IDENTITY_AXES;
      }
      const finite = Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && Number.isFinite(d);
      return finite ? { a, b, c, d } : IDENTITY_AXES;
    }
    const scale = /^scale\(([^)]*)\)$/iu.exec(raw);
    if (scale !== null) {
      const [rawX, rawY] = (scale[1] ?? "").split(",");
      const a = Number.parseFloat(rawX ?? "");
      const d = rawY === void 0 ? a : Number.parseFloat(rawY);
      return Number.isFinite(a) && Number.isFinite(d) ? { a, b: 0, c: 0, d } : IDENTITY_AXES;
    }
    const scaleX = /^scaleX\(([^)]*)\)$/iu.exec(raw);
    if (scaleX !== null) {
      const a = Number.parseFloat(scaleX[1] ?? "");
      return Number.isFinite(a) ? { a, b: 0, c: 0, d: 1 } : IDENTITY_AXES;
    }
    const rotate = /^rotate(?:Z)?\(([^)]*)\)$/iu.exec(raw);
    if (rotate === null) return IDENTITY_AXES;
    const angle = angleRadiansOf(rotate[1] ?? "");
    if (angle === null) return IDENTITY_AXES;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    return { a: cosine, b: sine, c: -sine, d: cosine };
  }
  function multiplyAxes(left, right) {
    return {
      a: left.a * right.a + left.c * right.b,
      b: left.b * right.a + left.d * right.b,
      c: left.a * right.c + left.c * right.d,
      d: left.b * right.c + left.d * right.d
    };
  }
  function individualRotateAxesOf(style) {
    const raw = style?.getPropertyValue("rotate").trim() ?? "";
    if (raw.length === 0 || raw.toLowerCase() === "none") return IDENTITY_AXES;
    const parts = splitComponentValues(raw);
    const angleRaw = parts.length === 1 ? parts[0] : parts.length === 2 && parts[0]?.toLowerCase() === "z" ? parts[1] : null;
    const angle = angleRaw === void 0 || angleRaw === null ? null : angleRadiansOf(angleRaw);
    if (angle === null) return IDENTITY_AXES;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    return { a: cosine, b: sine, c: -sine, d: cosine };
  }
  function individualScaleAxesOf(style) {
    const raw = style?.getPropertyValue("scale").trim() ?? "";
    if (raw.length === 0 || raw.toLowerCase() === "none") return IDENTITY_AXES;
    const parts = splitComponentValues(raw);
    const x = Number.parseFloat(parts[0] ?? "");
    const y = parts[1] === void 0 ? x : Number.parseFloat(parts[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return IDENTITY_AXES;
    return { a: x, b: 0, c: 0, d: y };
  }
  function transformAxesOf(style) {
    const rotate = individualRotateAxesOf(style);
    const scale = individualScaleAxesOf(style);
    const transform = transformPropertyAxesOf(style);
    return multiplyAxes(transform, multiplyAxes(scale, rotate));
  }
  function combinedTransformAxesOf(element) {
    let axes = transformAxesOf(computedStyleOf(element));
    for (let ancestor = element.parentElement; ancestor !== null; ancestor = ancestor.parentElement) {
      axes = multiplyAxes(transformAxesOf(computedStyleOf(ancestor)), axes);
    }
    return axes;
  }
  function localShiftFor(element, screenShiftPx) {
    const axes = combinedTransformAxesOf(element);
    const det = axes.a * axes.d - axes.b * axes.c;
    if (Math.abs(det) < MIN_TRANSFORM_SCALE * MIN_TRANSFORM_SCALE) return null;
    const x = -screenShiftPx * axes.d / det;
    const y = screenShiftPx * axes.b / det;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const limit = Math.abs(screenShiftPx) * MAX_LOCAL_SHIFT_RATIO;
    if (Math.abs(x) > limit || Math.abs(y) > limit) return null;
    return { x, y };
  }
  function copyBoxSizing(anchorStyle, button, snapshots) {
    const value = anchorStyle.getPropertyValue("box-sizing").trim();
    if (value.length === 0) return;
    captureStyle(snapshots, button, "box-sizing");
    button.style.setProperty("box-sizing", value);
  }
  function copyAnchorOffsets(anchorStyle, button, snapshots) {
    const buttonStyle = computedStyleOf(button);
    if (buttonStyle === null) return;
    for (const property of POSITION_OFFSET_PROPERTIES) {
      const value = anchorStyle.getPropertyValue(property).trim();
      if (value.length === 0) continue;
      if (buttonStyle.getPropertyValue(property).trim() === value) continue;
      captureStyle(snapshots, button, property);
      button.style.setProperty(property, value);
    }
  }
  function shiftAbsoluteCluster(anchor, button, parentStyle, anchorStyle, snapshots) {
    const buttonStyle = computedStyleOf(button);
    if (buttonStyle === null) return;
    const anchorPosition = anchorStyle.getPropertyValue("position").trim();
    if (anchorPosition.length > 0 && buttonStyle.getPropertyValue("position").trim() !== anchorPosition) {
      captureStyle(snapshots, button, "position");
      button.style.setProperty("position", anchorPosition);
    }
    copyAnchorOffsets(anchorStyle, button, snapshots);
    const anchorRect = anchor.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    if (anchorRect.width <= 0 || anchorRect.height <= 0 || buttonRect.width <= 0 || buttonRect.height <= 0) {
      return;
    }
    const spacePx = resolveSpacePx(parentStyle, anchorStyle);
    const shiftPx = buttonRect.right - (anchorRect.left - spacePx);
    let shiftedLeft = buttonRect.left;
    if (shiftPx > MIN_SHIFT_PX) {
      const shift = localShiftFor(button, shiftPx);
      const translate = shift === null ? null : composeShiftedTranslate(buttonStyle, shift);
      if (translate !== null) {
        captureStyle(snapshots, button, "translate");
        button.style.setProperty("translate", translate);
        shiftedLeft -= shiftPx;
      }
    }
    const allowedRight = shiftedLeft - spacePx;
    const siblings = [];
    let deltaPx = 0;
    for (let sibling = button.previousElementSibling; sibling !== null; sibling = sibling.previousElementSibling) {
      if (!isStyledElement(sibling)) continue;
      const rect = sibling.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (rect.bottom <= anchorRect.top || rect.top >= anchorRect.bottom) continue;
      siblings.push(sibling);
      deltaPx = Math.max(deltaPx, rect.right - allowedRight);
    }
    if (deltaPx <= MIN_SHIFT_PX) return;
    for (const sibling of siblings) {
      const siblingStyle = computedStyleOf(sibling);
      const shift = localShiftFor(sibling, deltaPx);
      const translate = shift === null ? null : composeShiftedTranslate(siblingStyle, shift);
      if (translate === null) continue;
      captureStyle(snapshots, sibling, "translate");
      sibling.style.setProperty("translate", translate);
    }
  }
  function applyControlBarFit(anchor, button, snapshots) {
    const parent = anchor.parentElement;
    if (parent === null || parent !== button.parentElement) return;
    const anchorStyle = computedStyleOf(anchor);
    if (anchorStyle === null) return;
    const parentStyle = computedStyleOf(parent);
    copyBoxSizing(anchorStyle, button, snapshots);
    const position = anchorStyle.getPropertyValue("position").trim();
    const absolute = position === "absolute" || position === "fixed";
    if (absolute && !isRtl(anchorStyle) && !isRtl(parentStyle)) {
      shiftAbsoluteCluster(anchor, button, parentStyle, anchorStyle, snapshots);
    } else if (parentStyle !== null && FLEX_OR_GRID_DISPLAYS.has(
      parentStyle.getPropertyValue("display").trim().toLowerCase()
    )) {
      reserveFlexSpace(button, parentStyle, anchorStyle, snapshots);
    }
  }
  function fitInControlBar(anchor, button) {
    let snapshots = [];
    let ownedStyles = /* @__PURE__ */ new Map();
    let fitSnapshot = null;
    const apply = () => {
      snapshots = [];
      applyControlBarFit(anchor, button, snapshots);
      ownedStyles = /* @__PURE__ */ new Map();
      for (const snapshot of snapshots) {
        const existing = ownedStyles.get(snapshot.element);
        const values = existing?.values ?? /* @__PURE__ */ new Map();
        values.set(snapshot.property, {
          value: snapshot.element.style.getPropertyValue(snapshot.property),
          priority: snapshot.element.style.getPropertyPriority(
            snapshot.property
          )
        });
        ownedStyles.set(snapshot.element, {
          attribute: snapshot.element.getAttribute("style") ?? "",
          values
        });
      }
      fitSnapshot = snapshotFit(anchor, button);
    };
    const dispose = () => {
      rebaseSiteChangedProperties(snapshots, ownedStyles);
      restoreStyles2(snapshots);
      snapshots = [];
      ownedStyles.clear();
      fitSnapshot = null;
    };
    apply();
    return {
      sync() {
        const next = snapshotFit(anchor, button);
        if (fitSnapshot !== null && isSameFitSnapshot(fitSnapshot, next)) return;
        dispose();
        apply();
      },
      refit() {
        dispose();
        apply();
      },
      ownsStyleOf(element) {
        const owned = ownedStyles.get(element);
        return owned !== void 0 && (element.getAttribute("style") ?? "") === owned.attribute;
      },
      dispose
    };
  }

  // scripts/web-fullscreen/src/install.ts
  function setAttributeIfChanged(element, name, value) {
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  }
  function isEligibleVideo(video) {
    if (!video.isConnected) return false;
    const rect = video.getBoundingClientRect();
    return rect.width >= MIN_VIDEO_WIDTH_PX && rect.height >= MIN_VIDEO_HEIGHT_PX;
  }
  function disposeButton(binding) {
    binding.fit?.dispose();
    binding.fit = null;
    binding.removeButton?.();
    binding.removeButton = null;
    binding.button?.remove();
    binding.button = null;
    binding.floating = false;
  }
  function installWebFullscreen(doc = document) {
    const view = doc.defaultView;
    if (view === null) return () => void 0;
    const frameWindow = view;
    const scrollLock = createScrollLock(doc);
    const controller = createWebFullscreenController(doc, scrollLock);
    const bindings = /* @__PURE__ */ new Map();
    const knownVideos = /* @__PURE__ */ new Set();
    const schedule = createDebounced(() => sync(), {
      delayMs: SCAN_DEBOUNCE_MS
    });
    const scheduleFit = createDebounced(() => refitControlBars(), {
      delayMs: SCAN_DEBOUNCE_MS
    });
    let resizeObserver = null;
    if (typeof ResizeObserver === "function") {
      resizeObserver = new ResizeObserver(() => schedule());
    }
    const observedRoots = /* @__PURE__ */ new Set();
    function discover(root) {
      if (root instanceof Element && root.shadowRoot !== null) {
        observeRoot(root.shadowRoot);
        discover(root.shadowRoot);
      }
      for (const video of root.querySelectorAll("video")) {
        if (knownVideos.has(video)) continue;
        knownVideos.add(video);
        resizeObserver?.observe(video);
      }
      for (const element of root.querySelectorAll("*")) {
        if (element.shadowRoot === null) continue;
        observeRoot(element.shadowRoot);
        discover(element.shadowRoot);
      }
    }
    function observeRoot(root) {
      if (observedRoots.has(root)) return;
      observedRoots.add(root);
      observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style", "hidden"]
      });
    }
    function toggleBinding(binding) {
      if (binding.match.mode === "skip") return;
      const mode = binding.match.mode === "custom" ? "custom" : "native";
      controller.toggle({
        video: binding.video,
        player: binding.match.root,
        mode
      });
      syncFloatingPositions();
    }
    function attachHandlers(button, binding) {
      const onClick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        toggleBinding(binding);
      };
      const onKeyDown = (event) => {
        if (button instanceof HTMLButtonElement) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        toggleBinding(binding);
      };
      button.addEventListener("click", onClick);
      button.addEventListener("keydown", onKeyDown);
      return () => {
        button.removeEventListener("click", onClick);
        button.removeEventListener("keydown", onKeyDown);
      };
    }
    function mountButton(binding) {
      const match = binding.match;
      if (match.mode === "skip") return false;
      if (match.mode === "custom") {
        const anchor = match.fullscreenButton;
        if (anchor === null) return false;
        const button2 = createFullscreenButton(match);
        if (!insertBeforeFullscreen(match, button2)) return false;
        binding.button = button2;
        binding.floating = false;
        binding.fit = fitInControlBar(anchor, button2);
        binding.removeButton = attachHandlers(button2, binding);
        return true;
      }
      if (doc.body === null) return false;
      const button = createFloatingButton();
      doc.body.append(button);
      binding.button = button;
      binding.floating = true;
      binding.fit = null;
      binding.removeButton = attachHandlers(button, binding);
      positionFloatingButton(button, binding.video, frameWindow);
      return true;
    }
    function needsRemount(binding, match) {
      if (binding.button === null) return true;
      if (binding.match.mode !== match.mode) return true;
      if (match.mode !== "custom") return !binding.button.isConnected;
      return !binding.button.isConnected || binding.button.nextElementSibling !== match.fullscreenButton || binding.match.fullscreenButton !== match.fullscreenButton;
    }
    function refreshBinding(binding) {
      const match = findPlayerMatch(binding.video);
      if (match.mode === "skip") {
        disposeButton(binding);
        binding.match = match;
        return;
      }
      if (needsRemount(binding, match)) {
        disposeButton(binding);
        binding.match = match;
        mountButton(binding);
        return;
      }
      binding.match = match;
    }
    function updateButtonState(binding) {
      const button = binding.button;
      if (button === null) return;
      const active = controller.isActiveFor(binding.video);
      const label = active ? LABELS.exit : LABELS.enter;
      setAttributeIfChanged(button, "aria-label", label);
      setAttributeIfChanged(button, "title", label);
      setAttributeIfChanged(button, "aria-pressed", String(active));
    }
    function syncFloatingPositions() {
      for (const binding of bindings.values()) {
        if (!binding.floating || binding.button === null) continue;
        positionFloatingButton(binding.button, binding.video, frameWindow);
      }
    }
    function syncControlBars() {
      for (const binding of bindings.values()) binding.fit?.sync();
    }
    function refitControlBars() {
      for (const binding of bindings.values()) binding.fit?.refit();
    }
    function removeBinding(binding) {
      if (controller.isActiveFor(binding.video)) controller.exit();
      resizeObserver?.unobserve(binding.video);
      disposeButton(binding);
      bindings.delete(binding.video);
    }
    function sync() {
      for (const [video, binding] of bindings) {
        if (!video.isConnected) removeBinding(binding);
      }
      for (const video of knownVideos) {
        if (!video.isConnected) {
          knownVideos.delete(video);
          resizeObserver?.unobserve(video);
          continue;
        }
        if (!isEligibleVideo(video)) continue;
        let binding = bindings.get(video);
        if (binding === void 0) {
          binding = {
            video,
            match: findPlayerMatch(video),
            button: null,
            floating: false,
            removeButton: null,
            fit: null
          };
          bindings.set(video, binding);
        }
        refreshBinding(binding);
        binding.fit?.sync();
        updateButtonState(binding);
      }
      syncFloatingPositions();
    }
    const unsubscribe = controller.subscribe(() => {
      for (const binding of bindings.values()) updateButtonState(binding);
      syncFloatingPositions();
    });
    const affectsControlBar = (target, attributeName) => {
      for (const binding of bindings.values()) {
        const fit = binding.fit;
        const button = binding.button;
        if (fit === null || button === null) continue;
        if (target === button || button.contains(target)) continue;
        if (attributeName === "style" && fit.ownsStyleOf(target)) continue;
        const anchor = binding.match.fullscreenButton;
        if (anchor === null) continue;
        if (target === anchor || target.contains(anchor)) return true;
        const bar = button.parentElement;
        if (bar !== null && bar.contains(target)) return true;
      }
      return false;
    };
    const observer = new MutationObserver((records) => {
      let childListChanged = false;
      let layoutChanged = false;
      for (const record of records) {
        if (record.type === "attributes") {
          if (record.target instanceof Element && affectsControlBar(record.target, record.attributeName)) {
            layoutChanged = true;
          }
          continue;
        }
        childListChanged = true;
        if (record.target instanceof Element && affectsControlBar(record.target, null)) {
          layoutChanged = true;
        }
        for (const node of record.addedNodes) {
          if (node instanceof Element) discover(node);
          else if (node instanceof DocumentFragment) discover(node);
        }
      }
      if (layoutChanged) scheduleFit();
      if (childListChanged) schedule();
    });
    if (doc.documentElement !== null) {
      observeRoot(doc.documentElement);
    }
    discover(doc);
    sync();
    let positionFrame = 0;
    const requestPositionSync = () => {
      if (positionFrame !== 0) return;
      positionFrame = frameWindow.requestAnimationFrame(() => {
        positionFrame = 0;
        syncFloatingPositions();
      });
    };
    frameWindow.addEventListener("scroll", requestPositionSync, true);
    const onResize = () => {
      requestPositionSync();
      syncControlBars();
    };
    frameWindow.addEventListener("resize", onResize);
    const removeFrameBridge = installFrameBridge(doc, {
      scrollLock,
      onParentExit: () => controller.exit()
    });
    return () => {
      observer.disconnect();
      schedule.cancel();
      scheduleFit.cancel();
      resizeObserver?.disconnect();
      frameWindow.removeEventListener("scroll", requestPositionSync, true);
      frameWindow.removeEventListener("resize", onResize);
      if (positionFrame !== 0) frameWindow.cancelAnimationFrame(positionFrame);
      unsubscribe();
      controller.exit();
      for (const binding of [...bindings.values()]) disposeButton(binding);
      bindings.clear();
      knownVideos.clear();
      observedRoots.clear();
      removeFrameBridge();
    };
  }

  // scripts/web-fullscreen/src/index.ts
  function bootstrap() {
    const root = document.documentElement;
    if (root === null || root.hasAttribute(SCRIPT_MARKER_ATTRIBUTE)) return;
    root.setAttribute(SCRIPT_MARKER_ATTRIBUTE, "");
    installWebFullscreen(document);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
