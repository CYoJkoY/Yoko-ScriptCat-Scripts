import { findPlatformForLocation, type PlatformDefinition } from "../config";
import { isAuthOrRedirectRoute } from "./auth";
import { reportRecoverableError } from "./diagnostics";

/**
 * Selectors carried over from the handoff lookup, which already covered the
 * platform-specific test ids and the aria labels that wrap "new chat" in a
 * longer sentence. The shortcut and the handoff must find the same control.
 *
 * The list stays generic on purpose: an element id is one site's own
 * convention, and a site that reuses another site's id for a different action
 * then has that control hijacked. Z.ai reuses ChatGPT's former
 * `#sidebar-new-chat-button` id for its Home button, so the selector is
 * declared on the ChatGPT platform instead, where it can be dropped the day
 * the site stops shipping it. Host-specific ids never enter this list.
 *
 * Sites that ship no accessible name for their new chat button cannot be
 * covered here: DeepSeek renders it as a bare `div[role="button"]` with no
 * label, and its sibling buttons in the same row are search and history, so a
 * class-only match would press the wrong one. Those sites declare their own
 * selectors in the platform registry instead.
 */
const CONTROL_SELECTORS = [
  'button[data-testid*="new-chat" i]',
  'button[data-testid*="new_chat" i]',
  'button[data-testid*="new-conversation" i]',
  '[role="button"][data-testid*="new-chat" i]',
  'button[aria-label*="new chat" i]',
  'button[aria-label*="new conversation" i]',
  'button[aria-label*="start new chat" i]',
  'a[aria-label*="new chat" i]',
  'button[title*="new chat" i]',
  'button[title*="new conversation" i]',
  'button[aria-label*="新建对话"]',
  'button[aria-label*="新对话"]',
  'button[aria-label*="新建聊天"]',
  'button[title*="新建对话"]',
  'button[title*="新对话"]',
  'a[aria-label*="新对话"]',
] as const;

const CONTROL_SELECTOR = CONTROL_SELECTORS.join(",");

/** Physical key the takeover locks and the handler claims. */
export const NEW_CHAT_SHORTCUT_CODE = "KeyO";

/**
 * Chromium reserves Ctrl+Shift+O for its bookmark manager and, on some
 * builds, consumes the keydown before the page sees it. Alt+Shift+O is not
 * reserved by any mainstream browser, so it always reaches the page and the
 * engine can claim it without a fullscreen Keyboard Lock.
 */
export const NEW_CHAT_ALTERNATIVE_MODIFIERS = "Alt+Shift+O";

/**
 * Yuanbao mounts its new-chat entry only after the history list loads, so a
 * shortcut pressed on a freshly rendered collapsed rail finds no control.
 * Its `/chat/` fallback redirects to the most recent conversation, so the
 * engine waits briefly for the site to mount the entry first.
 */
export const NEW_CHAT_CONTROL_WAIT_MS = 600;

export interface NewChatPage {
  readonly document: Document;
  readonly storage?: Pick<Storage, "removeItem">;
  readonly location: Pick<
    Location,
    "hostname" | "pathname" | "origin" | "href" | "assign" | "reload"
  >;
}

/** Labels that name the action and nothing else, for unlabelled markup. */
const EXACT_LABELS = new Set([
  "new chat",
  "new conversation",
  "new thread",
  "new session",
  "start new chat",
  "start a new chat",
  "新建对话",
  "新对话",
  "新建聊天",
  "新聊天",
  "开始新对话",
  "开启新对话",
  "新建会话",
]);

function normalizeLabel(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function isRendered(control: HTMLElement): boolean {
  if (control.matches(':disabled, [aria-disabled="true"], [target="_blank" i]')) {
    return false;
  }
  /*
   * `hidden` and `inert` stop the click outright. `aria-hidden` is not a
   * filter here, matching the handoff lookup: the geometry and visibility
   * checks below decide whether the control can actually be pressed.
   */
  if (control.closest("[hidden], [inert]") !== null) return false;
  if (control.getClientRects().length === 0) return false;
  return getComputedStyle(control).visibility === "visible";
}

function hasNewChatLabel(control: HTMLElement): boolean {
  const labels = [
    control.getAttribute("aria-label"),
    control.getAttribute("title"),
    control.textContent,
  ];
  return labels.some((label) => EXACT_LABELS.has(normalizeLabel(label)));
}

/**
 * Selectors declared by the current platform, or none when the site names its
 * button accessibly. A site that only distinguishes its new chat button by
 * icon has to declare that selector itself: the shared list cannot tell the
 * button apart from the toolbar buttons sitting next to it.
 */
function platformControlSelectors(location: Pick<Location, "hostname">): readonly string[] {
  const platform = findPlatformForLocation(location.hostname, "");
  if (platform === null) return [];
  return platform.newChatControlSelectors ?? [];
}

/**
 * Drop the site's own composer draft so a blank-route reset does not restore
 * the previous text. DeepSeek keeps the draft inside its own framework state
 * and restores it after a same-URL navigation, so the composer is emptied
 * through the native setter first: the framework then observes an empty value
 * and persists that instead. Z.ai adds a storage key on top, read back on
 * boot, so the key is removed after the composer is empty. A storage failure
 * is reported and the reset still runs, since a leftover draft is better than
 * no new conversation.
 *
 * The storage key alone is not enough on Z.ai: the textarea is the source of
 * truth and the site writes it back on the next input or restore, so a key
 * dropped while the textarea still holds text comes back with the page. The
 * composer is therefore emptied first, through the native `value` setter, so
 * the site's own handler sees an empty value and persists the empty draft.
 */
function clearPlatformDraft(
  page: NewChatPage,
  platform: PlatformDefinition,
): void {
  resetVisibleComposer(page.document);
  const keys = platform.draftStorageKeys ?? [];
  for (const key of keys) {
    try {
      page.storage?.removeItem(key);
    } catch (error: unknown) {
      reportRecoverableError("clear site draft before new chat", error);
    }
  }
}

/**
 * Empty every rendered textarea on the page through the native setter, so the
 * framework that owns it observes the change instead of having the value
 * swapped behind its back. A site with no textarea, or a framework that keeps
 * the text elsewhere, simply has nothing to clear.
 */
function resetVisibleComposer(document: Document): void {
  const textareas = document.querySelectorAll("textarea");
  for (const textarea of textareas) {
    if (!(textarea instanceof HTMLTextAreaElement)) continue;
    if (textarea.value === "") continue;
    try {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      if (typeof setter !== "function") continue;
      setter.call(textarea, "");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    } catch (error: unknown) {
      reportRecoverableError("clear composer before new chat", error);
    }
  }
}

/**
 * The new chat control of the current page, or null when the site renders
 * none at this viewport. Hidden copies are skipped: ChatGPT keeps a
 * zero-sized duplicate for the collapsed rail and clicking it does nothing.
 */
export function findNewChatControl(
  root: Document,
  location?: Pick<Location, "hostname">,
): HTMLElement | null {
  /*
   * Three passes, most specific first: the platform's own selectors win over
   * every shared heuristic, then the marker selectors, and only the leftover
   * generic controls are walked for an exact label.
   */
  for (const selector of platformControlSelectors(location ?? { hostname: "" })) {
    for (const control of root.querySelectorAll(selector)) {
      if (control instanceof HTMLElement && isRendered(control)) return control;
    }
  }
  for (const control of root.querySelectorAll(CONTROL_SELECTOR)) {
    if (control instanceof HTMLElement && isRendered(control)) return control;
  }
  for (const control of root.querySelectorAll("button, a, [role='button']")) {
    if (!(control instanceof HTMLElement)) continue;
    if (!hasNewChatLabel(control)) continue;
    if (!isRendered(control)) continue;
    return control;
  }
  return null;
}

/** Which of the two accepted combinations the event carries, if any. */
type NewChatShortcutKind = "primary" | "alternative";

/**
 * Classify the event against the two combinations the engine claims.
 *
 * `Ctrl+Shift+O` is the primary. `Alt+Shift+O` is the alternative for the
 * builds that consume the primary before the renderer sees it: no mainstream
 * browser reserves it, so it always reaches the page. A combination that adds
 * both `Ctrl` and `Alt`, or `Meta`, belongs to neither and is left alone.
 */
function classifyNewChatShortcut(
  event: KeyboardEvent,
): NewChatShortcutKind | null {
  if (event.shiftKey === false || event.metaKey === true) return null;
  if (
    event.code !== NEW_CHAT_SHORTCUT_CODE &&
    event.key.toLowerCase() !== "o"
  ) {
    return null;
  }
  if (event.ctrlKey === true && event.altKey === false) return "primary";
  if (event.altKey === true && event.ctrlKey === false) return "alternative";
  return null;
}

/**
 * Send the document to the platform's blank conversation route, or re-enter
 * the current blank route after dropping the site's stored draft.
 *
 * This is the fallback for sites that render no new chat control at all.
 * `blankRouteReset` covers the sites whose blank route is itself the new
 * conversation and whose composer survives a plain navigation, so the route
 * is re-entered after the draft is dropped.
 */
function openNewChatRoute(
  page: NewChatPage,
  platform: PlatformDefinition,
): void {
  const { location } = page;
  const path = platform.hostPaths?.[location.hostname] ?? platform.newChatShortcut;
  const destination = new URL(path, location.origin);
  if (destination.href !== location.href) {
    location.assign(destination.href);
    return;
  }
  if (platform.blankRouteReset !== true) return;
  clearPlatformDraft(page, platform);
  location.reload();
}

/**
 * Claim the combination and open a new conversation.
 *
 * Returns `true` only when the press was satisfied inside this page by
 * pressing the site's own control. A route jump returns `false`: the document
 * is about to be replaced, and anything this page owns is torn down with it.
 */
export function handleNewChatShortcut(
  event: KeyboardEvent,
  page: NewChatPage,
): boolean {
  if (event.defaultPrevented === true || event.isComposing === true) return false;
  if (classifyNewChatShortcut(event) === null) return false;

  const { location } = page;
  if (isAuthOrRedirectRoute(location) === true) return false;
  const platform = findPlatformForLocation(location.hostname, location.pathname);
  if (platform === null) return false;

  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.repeat === true) return false;

  const control = findNewChatControl(page.document, page.location);
  if (control !== null) {
    control.click();
    return true;
  }

  /*
   * Yuanbao mounts its entry only after the history list loads, and its
   * `/chat/` fallback redirects to the most recent conversation, so wait once
   * for the site to render the control before falling back. Sites without
   * declared selectors render no control at all, so their route path runs
   * immediately.
   */
  if (platform.newChatControlSelectors === undefined) {
    openNewChatRoute(page, platform);
    return false;
  }

  const pressedHref = location.href;
  const view = page.document.defaultView ?? window;
  view.setTimeout(() => {
    // A navigation of its own means the press was already satisfied.
    if (page.location.href !== pressedHref) return;
    const lateControl = findNewChatControl(page.document, page.location);
    if (lateControl !== null) {
      lateControl.click();
      return;
    }
    openNewChatRoute(page, platform);
  }, NEW_CHAT_CONTROL_WAIT_MS);
  return false;
}

export interface NewChatShortcutHooks {
  /**
   * Arms a deferred Keyboard Lock takeover when the press only arrived as
   * `keyup`, meaning the browser consumed the `keydown` for its own shortcut.
   * The `keyup` event carries no transient user activation, so the caller must
   * not request fullscreen here; it only stores the intent and arms the lock on
   * the next real gesture, including the document reached by this navigation.
   */
  armReservedKeyTakeover?: () => void;
  rememberTakeoverIntent?: () => void;
}

/**
 * Claim the combination during the capture phase for the whole page lifetime.
 *
 * The listener is registered once, before the engine boots, so it also covers
 * login and redirect routes that never build the HUD; the returned unbinder
 * exists for tests and for a future re-injection guard.
 *
 * Chromium reserves Ctrl+Shift+O for its bookmark manager, but it asks the
 * renderer first: measured with a real OS keystroke on Edge 122 and Helium 158,
 * the `KeyO` keydown does reach the page, and `preventDefault()` on it in the
 * capture phase keeps the bookmark manager closed. That same measurement shows
 * the event can arrive with an empty `code`, so both `code` and `key` are
 * matched. `keydown` is therefore the primary path, and `keyup` is the fallback
 * for builds that consume the keydown before the page sees it, claimed only
 * when no matching keydown was observed. The keyup handler also guards against
 * a false trigger when the letter is released while the modifiers are pressed
 * separately, in either order.
 *
 * A fallback press means the browser already opened its own panel, so the
 * page cannot stop it after the fact. The hook above reports that case to the
 * caller, which stores the takeover intent for the next real gesture because
 * a `keyup` event carries no transient user activation.
 */
export function bindNewChatShortcut(
  target: Pick<Window, "addEventListener" | "removeEventListener">,
  page: NewChatPage,
  hooks: NewChatShortcutHooks = {},
): () => void {
  let sawShortcutKeyDown = false;
  const listener = (event: KeyboardEvent): void => {
    const isShortcutKey =
      event.code === NEW_CHAT_SHORTCUT_CODE || event.key.toLowerCase() === "o";
    if (isShortcutKey === true) {
      if (event.type === "keydown") {
        sawShortcutKeyDown = true;
      } else {
        const keyDownWasSeen = sawShortcutKeyDown;
        sawShortcutKeyDown = false;
        if (keyDownWasSeen === false) {
          handleNewChatShortcut(event, page);
          // Only the reserved primary can be swallowed by the browser, so the
          // takeover intent is not worth arming for the alternative. A
          // navigating site starts the route during the keyup, which kills its
          // in-memory lock flag; the persistent intent follows the new page.
          const isPrimaryShortcut = classifyNewChatShortcut(event) === "primary";
          if (isPrimaryShortcut === true) {
            hooks.rememberTakeoverIntent?.();
            hooks.armReservedKeyTakeover?.();
          }
        }
        return;
      }
    }
    if (event.type === "keydown") handleNewChatShortcut(event, page);
  };
  target.addEventListener("keydown", listener, { capture: true, passive: false });
  target.addEventListener("keyup", listener, { capture: true, passive: false });
  return () => {
    target.removeEventListener("keydown", listener, { capture: true });
    target.removeEventListener("keyup", listener, { capture: true });
  };
}

/**
 * Whether the event can carry the transient user activation that
 * `requestFullscreen()` requires before the lock can be armed.
 *
 * A `keyup` never can, which is why a fallback press only stores the intent.
 * Pointer and key presses can, except for `Escape`: it is the exit key of the
 * fullscreen the takeover owns, so honouring it there would trap the user.
 */
export function isTakeoverGesture(event: Event): boolean {
  if (event.type === "pointerdown") return true;
  if (event.type !== "keydown") return false;
  return !(event instanceof KeyboardEvent) || event.key !== "Escape";
}
