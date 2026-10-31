import {
  TOOL_POPUP_SELECTOR,
  TOOL_TRIGGER_CONTAINER_SELECTOR,
} from "../config";

const TOOL_POPUP_TTL = 30000;

interface RegisteredPopup {
  control: Element;
  popup: HTMLElement;
  until: number;
}

export interface ToolPopupScope {
  snapshot(): Set<Element>;
  note(control: Element, before: Set<Element>): HTMLElement | null;
  active(control: Element): HTMLElement | null;
  resolve(control: Element): HTMLElement | null;
  popupFor(node: unknown): HTMLElement | null;
  isInside(node: unknown): boolean;
  close(): void;
}

function isInsideTurboUI(node: unknown): boolean {
  if (!(node instanceof Element)) return false;
  return Boolean(node.closest("[id^='ai-turbo-'], .ai-turbo-code-bar"));
}

function nodeVisible(node: HTMLElement): boolean {
  const rect = node.getBoundingClientRect();
  return rect.width >= 1 && rect.height >= 1;
}

function visiblePopups(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(TOOL_POPUP_SELECTOR),
  ).filter((node) => !isInsideTurboUI(node) && nodeVisible(node));
}

function popupOwnedByToolTrigger(popup: HTMLElement): boolean {
  if (popup.closest(TOOL_TRIGGER_CONTAINER_SELECTOR)) return true;
  const popupId = popup.id;
  if (!popupId) return false;
  const containers = document.querySelectorAll(TOOL_TRIGGER_CONTAINER_SELECTOR);
  for (const container of containers) {
    const controls = container.querySelectorAll("[aria-controls]");
    for (const control of controls) {
      if (control.getAttribute("aria-controls") === popupId) return true;
    }
  }
  return false;
}

function escapePopup(): void {
  const escape = new KeyboardEvent("keydown", {
    key: "Escape",
    code: "Escape",
    keyCode: 27,
    bubbles: true,
    cancelable: true,
  });
  document.activeElement?.dispatchEvent(escape);
  document.dispatchEvent(escape);
}

/**
 * Tracks tool popups opened from the composer. Yuanbao portals its tool menu
 * away from the trigger, so the reasoning recorder needs an explicit owner map
 * to tell it apart from a reasoning menu.
 */
export function createToolPopupScope(): ToolPopupScope {
  const registered: RegisteredPopup[] = [];

  function prune(now: number): void {
    for (let index = registered.length - 1; index >= 0; index -= 1) {
      const entry = registered[index];
      if (!entry.popup.isConnected || entry.until <= now) {
        registered.splice(index, 1);
      }
    }
  }

  function register(control: Element, popup: HTMLElement): void {
    const now = Date.now();
    prune(now);
    const existing = registered.find((entry) => entry.popup === popup);
    if (existing) {
      existing.control = control;
      existing.until = now + TOOL_POPUP_TTL;
      return;
    }
    registered.push({ control, popup, until: now + TOOL_POPUP_TTL });
  }

  function snapshot(): Set<Element> {
    return new Set<Element>(visiblePopups());
  }

  function note(control: Element, before: Set<Element>): HTMLElement | null {
    const added = visiblePopups().filter(
      (popup) => popup !== control && !before.has(popup),
    );
    const preferredId = control.getAttribute("aria-controls");
    const preferred = preferredId
      ? added.find((popup) => popup.id === preferredId)
      : undefined;
    const popup = preferred ?? added[added.length - 1];
    if (popup) {
      register(control, popup);
      return popup;
    }
    if (!preferredId) return null;
    const fallback = document.getElementById(preferredId);
    if (!(fallback instanceof HTMLElement) || !nodeVisible(fallback)) {
      return null;
    }
    register(control, fallback);
    return fallback;
  }

  function active(control: Element): HTMLElement | null {
    prune(Date.now());
    for (let index = registered.length - 1; index >= 0; index -= 1) {
      const entry = registered[index];
      if (entry.control === control && nodeVisible(entry.popup)) {
        return entry.popup;
      }
    }
    return null;
  }

  function resolve(control: Element): HTMLElement | null {
    const known = active(control);
    if (known) return known;
    const popupId = control.getAttribute("aria-controls");
    if (!popupId) return null;
    const popup = document.getElementById(popupId);
    if (!(popup instanceof HTMLElement) || !nodeVisible(popup)) return null;
    register(control, popup);
    return popup;
  }

  function popupFor(node: unknown): HTMLElement | null {
    if (!(node instanceof Element)) return null;
    prune(Date.now());
    for (let index = registered.length - 1; index >= 0; index -= 1) {
      const entry = registered[index];
      if (entry.popup === node || entry.popup.contains(node)) return entry.popup;
    }
    const closest = node.closest(TOOL_POPUP_SELECTOR);
    if (!(closest instanceof HTMLElement)) return null;
    return popupOwnedByToolTrigger(closest) ? closest : null;
  }

  function isInside(node: unknown): boolean {
    return popupFor(node) !== null;
  }

  return {
    snapshot,
    note,
    active,
    resolve,
    popupFor,
    isInside,
    close: escapePopup,
  };
}
