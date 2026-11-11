/**
 * Gemini animates the history sidebar by changing its width, so every frame of
 * that transition lays the chat column out again. The page also spends several
 * hundred milliseconds in its own long tasks around the same toggle. Engine
 * scans started inside that window only extend the stall, so the engine waits
 * for the motion to settle and resyncs once.
 */
export const QUIET_WINDOW_MS = 450;

const SIDEBAR_SELECTOR = "bard-sidenav, .bard-sidenav, side-navigation";

const SIDEBAR_TOGGLE_SELECTOR = [
  '[data-test-id="side-nav-menu-button"]',
  'button[aria-label*="menu" i]',
  '.side-nav-menu-button',
  'button[aria-label*="主菜单"]',
].join(", ");

export interface MotionQuietOptions {
  /** Length of one quiet window in milliseconds. */
  durationMs?: number;
  /** Called once each time a quiet window closes. */
  onQuietEnd?: () => void;
}

export interface MotionQuiet {
  /** Open the quiet window, or extend it when one is already running. */
  start: (ms?: number) => void;
  /** Whether engine work should stay deferred right now. */
  isQuiet: () => boolean;
  /** Subscribe to window closes; returns an unsubscribe function. */
  onQuietEnd: (listener: () => void) => () => void;
  /** Watch one document for sidebar transitions and toggle clicks. */
  bind: (doc: Document) => void;
  /** Stop watching and cancel a running window. Subscribers stay bound. */
  teardown: () => void;
}

export function createMotionQuiet(
  options: MotionQuietOptions = {},
): MotionQuiet {
  const durationMs = options.durationMs ?? QUIET_WINDOW_MS;
  const endListeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let quiet = false;
  let boundDocument: Document | null = null;

  if (options.onQuietEnd) endListeners.add(options.onQuietEnd);

  function clearTimer(): void {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  }

  function finish(): void {
    timer = null;
    quiet = false;
    // Copy first so a listener that opens a new window is not lost.
    for (const listener of Array.from(endListeners)) listener();
  }

  function start(ms = durationMs): void {
    quiet = true;
    clearTimer();
    // Repeat triggers push the deadline out instead of stacking windows.
    timer = setTimeout(finish, ms);
  }

  function isQuiet(): boolean {
    return quiet;
  }

  function onQuietEnd(listener: () => void): () => void {
    endListeners.add(listener);
    return () => {
      endListeners.delete(listener);
    };
  }

  function handleTransitionRun(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest(SIDEBAR_SELECTOR)) return;
    start();
  }

  function handleClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest(SIDEBAR_TOGGLE_SELECTOR)) return;
    start();
  }

  function bind(doc: Document): void {
    if (boundDocument === doc) return;
    teardown();
    boundDocument = doc;
    // transition events do not bubble, so listen in the capture phase.
    doc.addEventListener("transitionrun", handleTransitionRun, true);
    doc.addEventListener("click", handleClick, true);
  }

  function teardown(): void {
    if (boundDocument) {
      boundDocument.removeEventListener("transitionrun", handleTransitionRun, true);
      boundDocument.removeEventListener("click", handleClick, true);
      boundDocument = null;
    }
    clearTimer();
    quiet = false;
  }

  return { start, isQuiet, onQuietEnd, bind, teardown };
}
