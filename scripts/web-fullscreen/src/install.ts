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

interface Binding {
  readonly video: HTMLVideoElement;
  match: PlayerMatch;
  button: HTMLElement | null;
  floating: boolean;
  removeButton: (() => void) | null;
}

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
  binding.removeButton?.();
  binding.removeButton = null;
  binding.button?.remove();
  binding.button = null;
  binding.floating = false;
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
    observer.observe(root, { childList: true, subtree: true });
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
      const button = createFullscreenButton(match);
      if (!insertBeforeFullscreen(match, button)) return false;
      binding.button = button;
      binding.floating = false;
      binding.removeButton = attachHandlers(button, binding);
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

  function needsRemount(binding: Binding, match: PlayerMatch): boolean {
    if (binding.button === null) return true;
    if (binding.match.mode !== match.mode) return true;
    if (match.mode !== "custom") return !binding.button.isConnected;
    return (
      !binding.button.isConnected ||
      binding.button.nextElementSibling !== match.fullscreenButton
    );
  }

  function refreshBinding(binding: Binding): void {
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

  function removeBinding(binding: Binding): void {
    if (controller.isActiveFor(binding.video)) controller.exit();
    resizeObserver?.unobserve(binding.video);
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
  const requestPositionSync = (): void => {
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
    onParentExit: () => controller.exit(),
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
