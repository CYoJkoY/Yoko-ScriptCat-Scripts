// ==UserScript==
// @name         Web Fullscreen Button
// @namespace    https://cyojkoy.github.io/Payment/
// @version      1.0.0
// @description  给只有全屏按钮的视频播放器补一个网页全屏按钮，并把它动态插在全屏按钮前面；网页全屏只铺满浏览器视口，不进入系统全屏。
// @author       Yoko
// @updateURL    https://cdn.jsdelivr.net/gh/CYoJkoY/Yoko-ScriptCat-Scripts@main/dist/web-fullscreen.user.js
// @downloadURL  https://ghfast.top/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/main/dist/web-fullscreen.user.js
// @match        http://*/*
// @match        https://*/*
// @run-at       document-idle
// @grant        none
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
      observer.observe(root, { childList: true, subtree: true });
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
        const button2 = createFullscreenButton(match);
        if (!insertBeforeFullscreen(match, button2)) return false;
        binding.button = button2;
        binding.floating = false;
        binding.removeButton = attachHandlers(button2, binding);
        return true;
      }
      if (doc.body === null) return false;
      const button = createFloatingButton();
      doc.body.append(button);
      binding.button = button;
      binding.floating = true;
      binding.removeButton = attachHandlers(button, binding);
      positionFloatingButton(button, binding.video, frameWindow);
      return true;
    }
    function needsRemount(binding, match) {
      if (binding.button === null) return true;
      if (binding.match.mode !== match.mode) return true;
      if (match.mode !== "custom") return !binding.button.isConnected;
      return !binding.button.isConnected || binding.button.nextElementSibling !== match.fullscreenButton;
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
            removeButton: null
          };
          bindings.set(video, binding);
        }
        refreshBinding(binding);
        updateButtonState(binding);
      }
      syncFloatingPositions();
    }
    const unsubscribe = controller.subscribe(() => {
      for (const binding of bindings.values()) updateButtonState(binding);
      syncFloatingPositions();
    });
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element) discover(node);
          else if (node instanceof DocumentFragment) discover(node);
        }
      }
      schedule();
    });
    if (doc.documentElement !== null) {
      observer.observe(doc.documentElement, { childList: true, subtree: true });
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
    frameWindow.addEventListener("resize", requestPositionSync);
    const removeFrameBridge = installFrameBridge(doc, {
      scrollLock,
      onParentExit: () => controller.exit()
    });
    return () => {
      observer.disconnect();
      schedule.cancel();
      resizeObserver?.disconnect();
      frameWindow.removeEventListener("scroll", requestPositionSync, true);
      frameWindow.removeEventListener("resize", requestPositionSync);
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
