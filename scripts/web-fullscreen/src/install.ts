import { createDebounced } from "../../../shared/utils/debounce";
import {
  LABELS,
  MIN_VIDEO_HEIGHT_PX,
  MIN_VIDEO_WIDTH_PX,
  SCAN_DEBOUNCE_MS,
} from "./config";
import {
  createWebFullscreenController,
  type WebFullscreenMode,
} from "./core/controller";
import { findPlayerMatch, type PlayerMatch } from "./core/detect";
import { installFrameBridge } from "./core/frameBridge";
import { createScrollLock } from "./core/scrollLock";
import {
  createFloatingButton,
  createFullscreenButton,
  insertBeforeFullscreen,
  positionFloatingButton,
} from "./ui/button";
import { fitInControlBar, type ControlBarFit } from "./ui/layout";

interface Binding {
  readonly video: HTMLVideoElement;
  match: PlayerMatch;
  button: HTMLElement | null;
  floating: boolean;
  removeButton: (() => void) | null;
  fit: ControlBarFit | null;
  activated: boolean;
  activationRoot: HTMLElement | null;
  removeActivation: (() => void) | null;
}

const ACTIVATION_EVENTS = [
  "pointerover",
  "pointerdown",
  "touchstart",
  "focusin",
] as const;

function setAttributeIfChanged(
  element: HTMLElement,
  name: string,
  value: string,
): void {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}

function isEligibleVideo(video: HTMLVideoElement): boolean {
  if (!video.isConnected) return false;
  const rect = video.getBoundingClientRect();
  return rect.width >= MIN_VIDEO_WIDTH_PX && rect.height >= MIN_VIDEO_HEIGHT_PX;
}

function disposeButton(binding: Binding): void {
  binding.fit?.dispose();
  binding.fit = null;
  binding.removeButton?.();
  binding.removeButton = null;
  binding.button?.remove();
  binding.button = null;
  binding.floating = false;
}

function releaseActivation(binding: Binding): void {
  binding.removeActivation?.();
  binding.removeActivation = null;
  binding.activationRoot = null;
}

export function installWebFullscreen(
  doc: Document = document,
): () => void {
  const view = doc.defaultView;
  if (view === null) return () => undefined;
  // Bind the non-null view once so nested callbacks keep the narrowed type.
  const frameWindow: Window = view;

  const scrollLock = createScrollLock(doc);
  const controller = createWebFullscreenController(doc, scrollLock);
  const bindings = new Map<HTMLVideoElement, Binding>();
  const knownVideos = new Set<HTMLVideoElement>();

  const schedule = createDebounced(() => sync(), {
    delayMs: SCAN_DEBOUNCE_MS,
  });
  // Class or style changes can move an absolute anchor without resizing the
  // video, so only the bar fit needs to re-run for those.
  const scheduleFit = createDebounced(() => refitControlBars(), {
    delayMs: SCAN_DEBOUNCE_MS,
  });

  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver === "function") {
    resizeObserver = new ResizeObserver(() => schedule());
  }

  const observedRoots = new Set<Node>();

  function discover(root: ParentNode): void {
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

  function observeRoot(root: Node): void {
    if (observedRoots.has(root)) return;
    observedRoots.add(root);
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden"],
    });
  }

  function toggleBinding(binding: Binding): void {
    if (binding.match.mode === "skip") return;
    const mode: WebFullscreenMode =
      binding.match.mode === "custom" ? "custom" : "native";
    controller.toggle({
      video: binding.video,
      player: binding.match.root,
      mode,
    });
    // A native video becomes the viewport while its floating button stays fixed
    // to the page; move that button with the video immediately.
    syncFloatingPositions();
  }

  function activateBinding(binding: Binding): void {
    if (binding.activated) return;
    binding.activated = true;
    releaseActivation(binding);
    // Let a lazily rendered native web-fullscreen control appear before the
    // scan decides whether this player still needs our button.
    schedule();
  }

  function retainActivation(binding: Binding): void {
    if (binding.activated || binding.match.mode !== "custom") return;
    const root = binding.match.root;
    if (binding.removeActivation !== null && binding.activationRoot === root) {
      return;
    }
    releaseActivation(binding);
    const onActivate = (): void => activateBinding(binding);
    for (const event of ACTIVATION_EVENTS) {
      root.addEventListener(event, onActivate);
    }
    binding.activationRoot = root;
    binding.removeActivation = () => {
      for (const event of ACTIVATION_EVENTS) {
        root.removeEventListener(event, onActivate);
      }
    };
  }

  function attachHandlers(button: HTMLElement, binding: Binding): () => void {
    const onClick = (event: MouseEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      toggleBinding(binding);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
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

  function mountButton(binding: Binding): boolean {
    const match = binding.match;
    if (match.mode === "skip") return false;
    if (match.mode === "custom") {
      const anchor = match.fullscreenButton;
      if (anchor === null) return false;
      const button = createFullscreenButton(match);
      if (!insertBeforeFullscreen(match, button)) return false;
      binding.button = button;
      binding.floating = false;
      binding.fit = fitInControlBar(anchor, button);
      binding.removeButton = attachHandlers(button, binding);
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

  function needsRemount(binding: Binding, match: PlayerMatch): boolean {
    if (binding.button === null) return true;
    if (binding.match.mode !== match.mode) return true;
    if (match.mode !== "custom") return !binding.button.isConnected;
    return (
      !binding.button.isConnected ||
      binding.button.nextElementSibling !== match.fullscreenButton ||
      binding.match.fullscreenButton !== match.fullscreenButton
    );
  }

  function refreshBinding(binding: Binding): void {
    const match = findPlayerMatch(binding.video);
    if (match.mode === "skip") {
      disposeButton(binding);
      releaseActivation(binding);
      binding.match = match;
      return;
    }
    if (match.mode === "custom" && !binding.activated) {
      // A floating fallback was already active because the controls had not
      // rendered yet; now that the bar exists, inject without another hover.
      const controlsJustAppeared = binding.match.mode === "native";
      disposeButton(binding);
      binding.match = match;
      if (controlsJustAppeared) {
        binding.activated = true;
        mountButton(binding);
        return;
      }
      retainActivation(binding);
      return;
    }
    if (match.mode === "native") releaseActivation(binding);
    if (needsRemount(binding, match)) {
      disposeButton(binding);
      binding.match = match;
      mountButton(binding);
      return;
    }
    binding.match = match;
  }

  function updateButtonState(binding: Binding): void {
    const button = binding.button;
    if (button === null) return;
    const active = controller.isActiveFor(binding.video);
    const label = active ? LABELS.exit : LABELS.enter;
    setAttributeIfChanged(button, "aria-label", label);
    setAttributeIfChanged(button, "title", label);
    setAttributeIfChanged(button, "aria-pressed", String(active));
  }

  function syncFloatingPositions(): void {
    for (const binding of bindings.values()) {
      if (!binding.floating || binding.button === null) continue;
      positionFloatingButton(binding.button, binding.video, frameWindow);
    }
  }

  // Absolute clusters store the anchor's pixel offsets, so a breakpoint or
  // player resize must re-run the fit once the layout box actually moved.
  function syncControlBars(): void {
    for (const binding of bindings.values()) binding.fit?.sync();
  }

  // Visibility or size changes among the preceding controls do not move an
  // absolute anchor, so their mutations need an unconditional refit.
  function refitControlBars(): void {
    for (const binding of bindings.values()) binding.fit?.refit();
  }

  function removeBinding(binding: Binding): void {
    if (controller.isActiveFor(binding.video)) controller.exit();
    resizeObserver?.unobserve(binding.video);
    releaseActivation(binding);
    disposeButton(binding);
    bindings.delete(binding.video);
  }

  function sync(): void {
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
      if (binding === undefined) {
        binding = {
          video,
          match: findPlayerMatch(video),
          button: null,
          floating: false,
          removeButton: null,
          fit: null,
          activated: false,
          activationRoot: null,
          removeActivation: null,
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

  // Changes in the fitted bar can move the anchor or reveal a preceding
  // control. Ignore our own inline style writes so refitting cannot loop.
  const affectsControlBar = (
    target: Element,
    attributeName: string | null,
  ): boolean => {
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
        if (
          record.target instanceof Element &&
          affectsControlBar(record.target, record.attributeName)
        ) {
          layoutChanged = true;
        }
        continue;
      }
      childListChanged = true;
      if (
        record.target instanceof Element &&
        affectsControlBar(record.target, null)
      ) {
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
  const requestPositionSync = (): void => {
    if (positionFrame !== 0) return;
    positionFrame = frameWindow.requestAnimationFrame(() => {
      positionFrame = 0;
      syncFloatingPositions();
    });
  };
  frameWindow.addEventListener("scroll", requestPositionSync, true);
  // Scroll only moves the floating button; a controlled bar's pixel offsets go
  // stale only when the viewport changes the anchor's own layout box.
  const onResize = (): void => {
    requestPositionSync();
    syncControlBars();
  };
  frameWindow.addEventListener("resize", onResize);

  const removeFrameBridge = installFrameBridge(doc, {
    scrollLock,
    onParentExit: () => controller.exit(),
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
    for (const binding of [...bindings.values()]) {
      releaseActivation(binding);
      disposeButton(binding);
    }
    bindings.clear();
    knownVideos.clear();
    observedRoots.clear();
    removeFrameBridge();
  };
}
