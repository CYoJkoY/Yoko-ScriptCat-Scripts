import {
  FRAME_CHANNEL,
  FRAME_FULLSCREEN_STYLES,
  FRAME_STYLE_PROPERTIES,
} from "../config";
import { isRecord } from "../../../../shared/userscript/globals";
import type { ScrollLock } from "./scrollLock";
import { restoreStyles, type StyleSnapshot } from "./styles";
import { promoteToViewport } from "./viewport";

type FrameAction = "enter" | "exit";

export interface FrameBridgeOptions {
  readonly scrollLock: ScrollLock;
  readonly onParentExit: () => void;
}

interface FrameState {
  readonly snapshots: readonly StyleSnapshot[];
  readonly forwarded: boolean;
  readonly releaseScroll: () => void;
}

function readFrameAction(data: unknown): FrameAction | null {
  if (!isRecord(data) || data["channel"] !== FRAME_CHANNEL) return null;
  const action = data["action"];
  if (action === "enter" || action === "exit") return action;
  return null;
}

function findFrameBySource(
  doc: Document,
  source: MessageEventSource | null,
): HTMLIFrameElement | null {
  if (source === null) return null;
  for (const frame of doc.querySelectorAll<HTMLIFrameElement>("iframe, frame")) {
    if (Object.is(frame.contentWindow, source)) return frame;
  }
  return null;
}

function postToFrame(frame: HTMLIFrameElement, action: FrameAction): void {
  const target = frame.contentWindow;
  if (target === null) return;
  target.postMessage({ channel: FRAME_CHANNEL, action }, "*");
}

function hasUserActivation(view: Window): boolean {
  const activation = view.navigator.userActivation;
  // Older engines do not expose the activation object; keep the feature usable
  // there while gating it on the click that opened web fullscreen elsewhere.
  return activation === undefined || activation.isActive;
}

/**
 * A video inside an iframe only fills the iframe. The child page asks its
 * direct parent to promote that iframe to the viewport, which also works for
 * cross-origin embeds because postMessage does not need document access.
 * Nested frames forward the request one level at a time.
 */
export function notifyParentFrame(action: FrameAction, view: Window): void {
  if (view.parent === view) return;
  view.parent.postMessage({ channel: FRAME_CHANNEL, action }, "*");
}

export function installFrameBridge(
  doc: Document,
  options: FrameBridgeOptions,
): () => void {
  const view = doc.defaultView;
  if (view === null) return () => undefined;
  const frameWindow: Window = view;

  const frames = new Map<HTMLIFrameElement, FrameState>();
  let keydownAttached = false;

  const detachKeydownIfIdle = (): void => {
    if (!keydownAttached || frames.size > 0) return;
    frameWindow.removeEventListener("keydown", onKeyDown, true);
    keydownAttached = false;
  };

  const releaseFrame = (
    frame: HTMLIFrameElement,
    notifyChild: boolean,
  ): void => {
    const state = frames.get(frame);
    if (state === undefined) return;
    frames.delete(frame);
    for (let index = state.snapshots.length - 1; index >= 0; index -= 1) {
      const snapshot = state.snapshots[index];
      if (snapshot !== undefined) restoreStyles(snapshot);
    }
    state.releaseScroll();
    if (state.forwarded) notifyParentFrame("exit", frameWindow);
    if (notifyChild) postToFrame(frame, "exit");
    detachKeydownIfIdle();
  };

  const restoreAll = (notifyChildren: boolean): void => {
    for (const frame of [...frames.keys()]) {
      releaseFrame(frame, notifyChildren);
    }
  };

  const enterFrame = (frame: HTMLIFrameElement): void => {
    if (frames.has(frame)) return;
    const snapshots: StyleSnapshot[] = [];
    promoteToViewport(
      frame,
      FRAME_STYLE_PROPERTIES,
      FRAME_FULLSCREEN_STYLES,
      snapshots,
    );
    const forwarded = frameWindow.parent !== frameWindow;
    const releaseScroll = options.scrollLock.acquire();
    frames.set(frame, { snapshots, forwarded, releaseScroll });
    attachKeydown();
    if (forwarded) notifyParentFrame("enter", frameWindow);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || frames.size === 0) return;
    event.preventDefault();
    event.stopPropagation();
    restoreAll(true);
  };

  function attachKeydown(): void {
    if (keydownAttached) return;
    frameWindow.addEventListener("keydown", onKeyDown, true);
    keydownAttached = true;
  }

  const onMessage = (event: MessageEvent): void => {
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
