import type { PlatformDefinition } from "../config";

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

/**
 * Physical key of the new chat shortcut. The keyboard takeover locks the same
 * code, so both places must read it from here.
 */
export const NEW_CHAT_SHORTCUT_CODE = "KeyO";

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

const MODIFIER_ALIASES: Readonly<Record<string, string>> = {
  ctrl: "control",
  control: "control",
  shift: "shift",
  alt: "alt",
  option: "alt",
  meta: "meta",
  cmd: "meta",
  command: "meta",
};

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

function isNewChatControl(control: HTMLElement): boolean {
  return control.matches(CONTROL_SELECTOR) || hasNewChatLabel(control);
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

/**
 * A control that already declares our key combination. Clicking it from the
 * shortcut would run the site action twice, once natively and once from us.
 */
function advertisesNativeShortcut(root: Document): boolean {
  for (const control of root.querySelectorAll("[aria-keyshortcuts]")) {
    if (!(control instanceof HTMLElement)) continue;
    if (!isNewChatControl(control)) continue;
    const declared = control.getAttribute("aria-keyshortcuts") ?? "";
    for (const shortcut of declared.split(/\s+/)) {
      const parts = shortcut
        .split("+")
        .map(normalizeLabel)
        .map((part) => MODIFIER_ALIASES[part] ?? part)
        .sort();
      if (parts.join("+") === "control+o+shift") return true;
    }
  }
  return false;
}

function newChatDestination(
  platform: PlatformDefinition,
  page: Window,
  takeoverActive: boolean,
): string | null {
  if (platform.newChatShortcut === "native" && !takeoverActive) return null;
  const configuredPath =
    platform.newChatShortcut === "native"
      ? platform.newChatTakeoverPath
      : platform.newChatShortcut;
  if (configuredPath === undefined) return null;
  const path =
    platform.hostPaths?.[page.location.hostname] ?? configuredPath;
  const destination = new URL(path, page.location.origin);
  return destination.href === page.location.href ? null : destination.href;
}

/**
 * Open a new conversation on Ctrl+Shift+O.
 *
 * Platforms that ship the same combination are skipped, and so are pages
 * whose own control declares the keys through `aria-keyshortcuts`. Otherwise
 * the site's new chat control is clicked, because that is the only path which
 * keeps the site's own routing and draft handling. Navigating to the
 * platform's blank conversation path is the fallback for views that render no
 * control, such as a collapsed rail with the history list closed.
 */
export function handleNewChatShortcut(
  event: KeyboardEvent,
  platform: PlatformDefinition,
  page: Window,
  takeoverActive = false,
): void {
  if (platform.newChatShortcut === "native" && !takeoverActive) return;
  if (event.defaultPrevented || event.isComposing) return;
  if (!event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey) return;
  if (
    event.code !== NEW_CHAT_SHORTCUT_CODE &&
    event.key.toLowerCase() !== "o"
  ) {
    return;
  }

  if (!takeoverActive && advertisesNativeShortcut(page.document)) return;

  const control = findNewChatControl(page.document);
  const destination = newChatDestination(platform, page, takeoverActive);
  if (control !== null) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat) control.click();
    return;
  }
  if (destination === null) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  if (!event.repeat) page.location.assign(destination);
}
