import { findPlatformForLocation } from "../config";
import { isAuthOrRedirectRoute } from "./auth";

/**
 * Selectors carried over from the handoff lookup, which already covered the
 * platform-specific test ids and the aria labels that wrap "new chat" in a
 * longer sentence. The shortcut and the handoff must find the same control.
 */
const CONTROL_SELECTORS = [
  "#sidebar-new-chat-button",
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

interface NewChatPage {
  readonly document: Document;
  readonly location: Pick<Location, "hostname" | "pathname" | "origin" | "href" | "assign">;
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
 * The new chat control of the current page, or null when the site renders
 * none at this viewport. Hidden copies are skipped: ChatGPT keeps a
 * zero-sized duplicate for the collapsed rail and clicking it does nothing.
 */
export function findNewChatControl(root: Document): HTMLElement | null {
  /*
   * Two passes so a marker selector always wins over plain button text: the
   * first matches a handful of nodes, the second only walks the generic
   * controls left over for an exact label.
   */
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

export function handleNewChatShortcut(
  event: KeyboardEvent,
  page: NewChatPage,
): void {
  if (event.defaultPrevented === true || event.isComposing === true) return;
  if (event.ctrlKey === false || event.shiftKey === false) return;
  if (event.altKey === true || event.metaKey === true) return;
  if (
    event.code !== NEW_CHAT_SHORTCUT_CODE &&
    event.key.toLowerCase() !== "o"
  ) {
    return;
  }

  const { location } = page;
  if (isAuthOrRedirectRoute(location) === true) return;
  const platform = findPlatformForLocation(location.hostname, location.pathname);
  if (platform === null) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.repeat === true) return;

  const control = findNewChatControl(page.document);
  if (control !== null) {
    control.click();
    return;
  }

  const path = platform.hostPaths?.[location.hostname] ?? platform.newChatShortcut;
  const destination = new URL(path, location.origin);
  if (destination.href !== location.href) location.assign(destination.href);
}
