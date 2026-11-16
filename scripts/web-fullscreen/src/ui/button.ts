import {
  BUTTON_ATTRIBUTE,
  BUTTON_CLASS,
  BUTTON_STATE_CLASS_PATTERN,
  DANGEROUS_BUTTON_ATTRIBUTES,
  FLOATING_BUTTON_BOTTOM_OFFSET_PX,
  FLOATING_BUTTON_CLASS,
  FLOATING_BUTTON_RIGHT_OFFSET_PX,
  FLOATING_BUTTON_SIZE_PX,
  LABELS,
  VIEWPORT_Z_INDEX,
} from "../config";
import type { PlayerMatch } from "../core/detect";
import { createWebFullscreenIcon } from "./icon";

function stripCloneAttributes(element: HTMLElement): void {
  for (const attribute of [...element.attributes]) {
    if (
      attribute.name.startsWith("data-") ||
      DANGEROUS_BUTTON_ATTRIBUTES.has(attribute.name)
    ) {
      element.removeAttribute(attribute.name);
    }
  }
  const stateClasses = [...element.classList].filter((name) =>
    BUTTON_STATE_CLASS_PATTERN.test(name),
  );
  element.classList.remove(...stateClasses);
  if (element.style.display === "none") element.style.removeProperty("display");
}

function applyFallbackStyle(button: HTMLElement): void {
  const style = button.style;
  style.display = "inline-flex";
  style.alignItems = "center";
  style.justifyContent = "center";
  style.padding = "0";
  style.border = "0";
  style.background = "transparent";
  style.color = "inherit";
  style.cursor = "pointer";
}

/**
 * Clone only the native control's attributes and tag, not its children or
 * listeners. This keeps the player's own button styling while guaranteeing
 * that clicking ours cannot replay the site's fullscreen handler through a
 * cloned data-role.
 */
export function createFullscreenButton(match: PlayerMatch): HTMLElement {
  const anchor = match.fullscreenButton;
  if (anchor === null) throw new Error("A custom player needs a fullscreen anchor");
  if (anchor.parentElement === null) {
    throw new Error("The fullscreen anchor is detached from the DOM");
  }

  // cloneNode(false) on an HTMLElement returns the same element interface.
  const button = anchor.cloneNode(false) as HTMLElement;
  stripCloneAttributes(button);
  button.classList.add(BUTTON_CLASS);
  button.setAttribute(BUTTON_ATTRIBUTE, "");
  button.setAttribute("aria-label", LABELS.enter);
  button.setAttribute("title", LABELS.enter);
  button.setAttribute("aria-pressed", "false");
  if (button instanceof HTMLButtonElement) button.type = "button";
  else {
    button.setAttribute("role", "button");
    button.setAttribute("tabindex", "0");
  }
  if (button.classList.length === 1) applyFallbackStyle(button);
  button.replaceChildren(createWebFullscreenIcon());
  return button;
}

export function insertBeforeFullscreen(
  match: PlayerMatch,
  button: HTMLElement,
): boolean {
  const anchor = match.fullscreenButton;
  if (anchor === null || anchor.parentElement === null) return false;
  anchor.parentElement.insertBefore(button, anchor);
  return true;
}

function styleFloatingButton(button: HTMLButtonElement): void {
  const style = button.style;
  style.position = "fixed";
  style.display = "inline-flex";
  style.alignItems = "center";
  style.justifyContent = "center";
  style.width = `${FLOATING_BUTTON_SIZE_PX}px`;
  style.height = `${FLOATING_BUTTON_SIZE_PX}px`;
  style.padding = "0";
  style.border = "1px solid rgba(255, 255, 255, 0.35)";
  style.borderRadius = "6px";
  style.background = "rgba(0, 0, 0, 0.62)";
  style.color = "#fff";
  style.cursor = "pointer";
  style.boxSizing = "border-box";
  style.zIndex = VIEWPORT_Z_INDEX;
  style.fontSize = "18px";
  style.lineHeight = "1";
}

export function createFloatingButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = FLOATING_BUTTON_CLASS;
  button.setAttribute(BUTTON_ATTRIBUTE, "");
  button.setAttribute("aria-label", LABELS.enter);
  button.setAttribute("title", LABELS.enter);
  button.setAttribute("aria-pressed", "false");
  styleFloatingButton(button);
  button.append(createWebFullscreenIcon());
  return button;
}

/**
 * Native <video controls> keeps its shadow control bar private, so the
 * fallback button sits just left of the browser's fullscreen glyph.
 */
export function positionFloatingButton(
  button: HTMLElement,
  video: HTMLVideoElement,
  view: Window,
): void {
  const rect = video.getBoundingClientRect();
  const visible =
    rect.width > 0 &&
    rect.height > 0 &&
    rect.right > 0 &&
    rect.bottom > 0 &&
    rect.left < view.innerWidth &&
    rect.top < view.innerHeight;
  button.style.display = visible ? "inline-flex" : "none";
  if (!visible) return;

  const right =
    Math.max(0, view.innerWidth - rect.right) + FLOATING_BUTTON_RIGHT_OFFSET_PX;
  const bottom =
    Math.max(0, view.innerHeight - rect.bottom) + FLOATING_BUTTON_BOTTOM_OFFSET_PX;
  button.style.right = `${Math.round(right)}px`;
  button.style.bottom = `${Math.round(bottom)}px`;
}
