import { FLOATING_ATTRIBUTE, MOUNT_TARGET_SELECTORS, REMOUNT_DELAY_MS } from "../config";

export interface ThemeMount {
  ensureMounted(): void;
  dispose(): void;
}

export interface ThemeMountOptions {
  readonly doc: Document;
  readonly button: HTMLButtonElement;
  /** False while the page is still parsing, which keeps the fallback off screen. */
  readonly isParseComplete: () => boolean;
}

function findToolbar(doc: Document): HTMLElement | null {
  for (const selector of MOUNT_TARGET_SELECTORS) {
    const element = doc.querySelector(selector);
    if (element instanceof HTMLElement) return element;
  }
  return null;
}

/**
 * Google re-renders whole chrome subtrees on view-mode changes and on document
 * loads, which drops any foreign node. The observer re-inserts the button as
 * soon as it is gone, but it never resets its own timer: a busy page would
 * otherwise starve the remount forever.
 */
export function createThemeMount(options: ThemeMountOptions): ThemeMount {
  const { doc, button, isParseComplete } = options;
  const view = doc.defaultView;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let observer: MutationObserver | null = null;

  const mount = (): void => {
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

  const schedule = (): void => {
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      mount();
    }, REMOUNT_DELAY_MS);
  };

  const isSettled = (): boolean => {
    // The connection check is O(1) and every toolbar lookup is a query, so the
    // cheap test runs first on a page that mutates its DOM constantly.
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
    const root = doc.documentElement;
    if (root !== null) observer.observe(root, { childList: true, subtree: true });
  }

  return {
    ensureMounted: mount,
    dispose: () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      observer?.disconnect();
      observer = null;
    },
  };
}
