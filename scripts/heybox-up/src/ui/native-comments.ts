import { PAGE_ROUTE } from "../config";
import { registerPageSync } from "../core/page-sync";
import { READER_CLASS } from "./reader";

/**
 * The site only loads the next comment page from a page-level scroll
 * listener. The wide layout scrolls the native comment column on its own, so
 * that listener never fires. This module forwards the column's bottom reach
 * to the site once per refresh, without scrolling the page itself.
 */

export const NATIVE_COMMENT_CONTAINER_SELECTOR = "#page-bbs-link .link-comment";

export const NATIVE_COMMENT_LOAD_THRESHOLD = 240;

export const NATIVE_COMMENT_LOAD_COOLDOWN_MS = 1200;

export interface CommentScrollMetrics {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

export interface NativeCommentLoadGate {
  lastTriggerAt: number;
  lastTriggerHeight: number;
}

export type NativeCommentLoadAction = "button" | "scroll" | "none";

/**
 * A control counts only when its own text names a loading action. Nested
 * matches are rejected so a wrapper around the button cannot fire twice.
 */
const LOAD_MORE_TEXT = /^(?:加载更多|查看更多|点击加载|更多评论)(?:\s*[(（].*[)）])?$/;

const LOAD_MORE_EXCLUDED_SELECTOR = [
  ".comment-children__load-all",
  ".link-comment__comment-children",
  "textarea",
  "input",
  "[contenteditable]:not([contenteditable='false'])",
  ".link-comment__reply",
].join(", ");

export function isNearCommentScrollEnd(metrics: CommentScrollMetrics, threshold = NATIVE_COMMENT_LOAD_THRESHOLD): boolean {
  if (!Number.isFinite(metrics.scrollHeight) || !Number.isFinite(metrics.scrollTop) || !Number.isFinite(metrics.clientHeight)) {
    return false;
  }
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= threshold;
}

export function shouldTriggerNativeCommentLoad(
  gate: NativeCommentLoadGate,
  metrics: CommentScrollMetrics,
  now: number,
): boolean {
  if (!isNearCommentScrollEnd(metrics)) return false;
  if (gate.lastTriggerAt > 0 && now - gate.lastTriggerAt < NATIVE_COMMENT_LOAD_COOLDOWN_MS) return false;
  // A taller list means the previous request produced a new page, so the
  // reader may ask again after scrolling back down. Without growth the site
  // has nothing more to load and repeated events would only spam it.
  return gate.lastTriggerHeight === 0 || metrics.scrollHeight > gate.lastTriggerHeight;
}

function isHiddenControl(node: Element): boolean {
  if (node.hasAttribute("hidden")) return true;
  if (node.getAttribute("aria-hidden") === "true") return true;
  if (node instanceof HTMLElement && node.style.display === "none") return true;
  return false;
}

function isDisabledControl(node: Element): boolean {
  if (node.hasAttribute("disabled")) return true;
  if (node.getAttribute("aria-disabled") === "true") return true;
  return false;
}

export function readNativeLoadMoreButton(container: Element): HTMLElement | null {
  for (const node of Array.from(container.querySelectorAll<HTMLElement>('button, a, [role="button"]'))) {
    if (node.closest(LOAD_MORE_EXCLUDED_SELECTOR) !== null) continue;
    if (isHiddenControl(node) || isDisabledControl(node)) continue;
    const label = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!LOAD_MORE_TEXT.test(label)) continue;
    return node;
  }
  return null;
}

export function requestNativeCommentLoad(container: Element): NativeCommentLoadAction {
  const button = readNativeLoadMoreButton(container);
  if (button !== null) {
    button.click();
    return "button";
  }
  // The article page binds its next-page loader to window scroll. Dispatch at
  // the bottom without changing the page position, and never re-dispatch from
  // our own handler because it listens on the column only.
  window.dispatchEvent(new Event("scroll"));
  document.dispatchEvent(new Event("scroll"));
  return "scroll";
}

export function watchNativeComments(): void {
  if (!document.body) return;
  let bound: HTMLElement | null = null;
  let boundScrollTop = 0;
  let frame = 0;
  const gate: NativeCommentLoadGate = { lastTriggerAt: 0, lastTriggerHeight: 0 };

  const readContainer = (): HTMLElement | null => {
    const node = document.querySelector(NATIVE_COMMENT_CONTAINER_SELECTOR);
    return node instanceof HTMLElement ? node : null;
  };

  const unbind = (): void => {
    if (bound !== null) bound.removeEventListener("scroll", onScroll);
    bound = null;
    boundScrollTop = 0;
    if (frame !== 0) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  };

  const run = (): void => {
    frame = 0;
    const container = bound;
    if (container === null || !container.isConnected) return;
    if (document.body.classList.contains(READER_CLASS)) return;
    boundScrollTop = container.scrollTop;
    const metrics: CommentScrollMetrics = {
      scrollTop: container.scrollTop,
      clientHeight: container.clientHeight,
      scrollHeight: container.scrollHeight,
    };
    if (!shouldTriggerNativeCommentLoad(gate, metrics, performance.now())) return;
    const action = requestNativeCommentLoad(container);
    if (action === "none") return;
    gate.lastTriggerAt = performance.now();
    gate.lastTriggerHeight = metrics.scrollHeight;
  };

  function onScroll(): void {
    if (frame !== 0) return;
    frame = window.requestAnimationFrame(run);
  }

  const sync = (): void => {
    const container = readContainer();
    const unavailable =
      container === null ||
      !location.pathname.startsWith("/app/bbs/link/") ||
      document.body.classList.contains(READER_CLASS) ||
      container.clientHeight <= 0 ||
      container.scrollHeight <= container.clientHeight;
    if (unavailable) {
      unbind();
      return;
    }
    if (container === bound) {
      // The container can be recycled after a router change; keep the gate
      // aligned when its height was reset without a new node.
      if (container.scrollTop < boundScrollTop - NATIVE_COMMENT_LOAD_THRESHOLD) {
        gate.lastTriggerAt = 0;
        gate.lastTriggerHeight = 0;
      }
      boundScrollTop = container.scrollTop;
      return;
    }
    unbind();
    bound = container;
    boundScrollTop = container.scrollTop;
    gate.lastTriggerAt = 0;
    gate.lastTriggerHeight = 0;
    container.addEventListener("scroll", onScroll, { passive: true });
  };

  registerPageSync(sync, 400, [PAGE_ROUTE.ARTICLE], "article");
  sync();
}
