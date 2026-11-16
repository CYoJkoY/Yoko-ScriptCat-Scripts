import {
  CUSTOM_PLAYER_VIDEO_STYLES,
  NATIVE_VIDEO_STYLES,
  PLAYER_FULLSCREEN_STYLES,
  PLAYER_STYLE_PROPERTIES,
  VIDEO_STYLE_PROPERTIES,
} from "../config";
import { notifyParentFrame } from "./frameBridge";
import { createScrollLock, type ScrollLock } from "./scrollLock";
import {
  applyStyles,
  captureStyles,
  restoreStyles,
  type StyleSnapshot,
} from "./styles";
import { promoteToViewport } from "./viewport";

export type WebFullscreenMode = "custom" | "native";

export interface WebFullscreenTarget {
  readonly video: HTMLVideoElement;
  readonly player: HTMLElement;
  readonly mode: WebFullscreenMode;
}

export type WebFullscreenListener = (video: HTMLVideoElement | null) => void;

export interface WebFullscreenController {
  toggle(target: WebFullscreenTarget): boolean;
  exit(): void;
  isActiveFor(video: HTMLVideoElement): boolean;
  subscribe(listener: WebFullscreenListener): () => void;
}

interface ActiveState {
  readonly target: WebFullscreenTarget;
  readonly snapshots: StyleSnapshot[];
  readonly releaseScroll: () => void;
}

function stylePlayer(target: WebFullscreenTarget, snapshots: StyleSnapshot[]): void {
  if (target.mode === "native") {
    promoteToViewport(
      target.player,
      PLAYER_STYLE_PROPERTIES,
      NATIVE_VIDEO_STYLES,
      snapshots,
    );
    return;
  }

  promoteToViewport(
    target.player,
    PLAYER_STYLE_PROPERTIES,
    PLAYER_FULLSCREEN_STYLES,
    snapshots,
  );
  snapshots.push(captureStyles(target.video, VIDEO_STYLE_PROPERTIES));
  applyStyles(target.video, CUSTOM_PLAYER_VIDEO_STYLES);
}

export function createWebFullscreenController(
  doc: Document = document,
  scrollLock: ScrollLock = createScrollLock(doc),
): WebFullscreenController {
  const view = doc.defaultView;
  if (view === null) throw new Error("The document has no browsing window");

  let active: ActiveState | null = null;
  const listeners = new Set<WebFullscreenListener>();

  const emit = (): void => {
    const video = active?.target.video ?? null;
    for (const listener of listeners) listener(video);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    exit();
  };

  const onFullscreenChange = (): void => {
    if (doc.fullscreenElement !== null) exit();
  };

  const removeListeners = (): void => {
    doc.removeEventListener("keydown", onKeyDown, true);
    doc.removeEventListener("fullscreenchange", onFullscreenChange);
  };

  const exit = (): void => {
    if (active === null) return;
    const state = active;
    active = null;
    removeListeners();
    for (let index = state.snapshots.length - 1; index >= 0; index -= 1) {
      const snapshot = state.snapshots[index];
      if (snapshot !== undefined) restoreStyles(snapshot);
    }
    state.releaseScroll();
    notifyParentFrame("exit", view);
    emit();
  };

  const enter = (target: WebFullscreenTarget): boolean => {
    if (!target.video.isConnected) return false;

    const snapshots: StyleSnapshot[] = [];
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
    },
  };
}
