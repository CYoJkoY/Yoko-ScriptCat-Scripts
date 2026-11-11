import type { SidebarPeekDefinition } from "../config";

/** Marks the native rail that is currently peeking; the value is the side. */
export const SIDEBAR_PEEK_ATTRIBUTE = "data-ai-turbo-sidebar-peek";
/** Width the rail takes while it peeks. */
export const SIDEBAR_PEEK_WIDTH_VAR = "--ai-turbo-sidebar-peek-width";
/**
 * Negative margin that cancels the growth of a static rail in a flex or grid
 * row, so the chat column keeps its position instead of reflowing.
 */
export const SIDEBAR_PEEK_SHIFT_VAR = "--ai-turbo-sidebar-peek-shift";
/** Pointer must rest this long before the rail opens. */
export const SIDEBAR_PEEK_SHOW_DELAY_MS = 70;
/** Grace period that keeps the rail open while the pointer crosses a gap. */
export const SIDEBAR_PEEK_HIDE_DELAY_MS = 160;

const DEFAULT_PEEK_WIDTH = 248;
const DEFAULT_COLLAPSED_MAX_WIDTH = 96;

const COLLAPSED_CLASS_TOKENS = new Set([
  "collapsed",
  "is-collapsed",
  "sidenav-collapsed",
  "rail-collapsed",
  "side-nav-collapsed",
]);

const EXPANDED_CLASS_TOKENS = new Set([
  "sidenav-open",
  "is-expanded",
  "is-open",
  "expanded",
]);

const MOTION_ATTRIBUTES = ["class", "data-collapsed", "data-state", "aria-expanded"];

export type SidebarPeekSide = "left" | "right";

interface StyleSnapshot {
  readonly value: string;
  readonly priority: string;
}

interface RevealTarget {
  readonly node: HTMLElement;
  readonly display: StyleSnapshot;
}

export interface SidebarPeekOptions {
  /** Platform rail description, or null when the site has no hover rail. */
  readonly sidebar: SidebarPeekDefinition | null;
  readonly showDelayMs?: number;
  readonly hideDelayMs?: number;
}

export interface SidebarPeek {
  /** Watch one document for rail intent. Safe to call again after a reload. */
  bind: (doc: Document) => void;
  /** Stop watching, cancel pending timers, and restore the native rail. */
  teardown: () => void;
  /** Whether the rail currently carries the peek attribute. */
  isPeeking: () => boolean;
}

/**
 * Reveals a collapsed native navigation rail while the pointer rests on it.
 *
 * The rail is never cloned, rebuilt, or replaced: the module widens the live
 * node, restores its labels through CSS, and takes the attribute back off on
 * leave. Keeping the native node means the site keeps its own listeners, the
 * chat column keeps its history, and a peek costs no allocations beyond two
 * inline custom properties.
 */
export function createSidebarPeek(options: SidebarPeekOptions): SidebarPeek {
  const definition = options.sidebar;
  const showDelayMs = options.showDelayMs ?? SIDEBAR_PEEK_SHOW_DELAY_MS;
  const hideDelayMs = options.hideDelayMs ?? SIDEBAR_PEEK_HIDE_DELAY_MS;
  const peekWidth = definition?.peekWidth ?? DEFAULT_PEEK_WIDTH;
  const collapsedMaxWidth =
    definition?.collapsedMaxWidth ?? DEFAULT_COLLAPSED_MAX_WIDTH;
  const sidebarSelector = definition?.selectors.join(", ") ?? "";
  const triggerSelector = definition?.triggers?.join(", ") ?? "";
  const revealSelector = definition?.reveal?.join(", ") ?? "";

  let boundDocument: Document | null = null;
  let observer: MutationObserver | null = null;
  let resolveDocument: Document | null = null;
  let resolvedRail: HTMLElement | null = null;
  let active: HTMLElement | null = null;
  let widthSnapshot: StyleSnapshot | null = null;
  let shiftSnapshot: StyleSnapshot | null = null;
  let showTimer: ReturnType<typeof setTimeout> | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingRail: HTMLElement | null = null;
  let revealTargets: readonly RevealTarget[] = [];

  const enabled = sidebarSelector !== "";

  function resolveRail(): HTMLElement | null {
    const doc = boundDocument;
    if (!enabled || doc === null) return null;
    if (resolvedRail !== null && resolvedRail.isConnected) return resolvedRail;
    if (resolveDocument !== doc) {
      resolveDocument = doc;
      resolvedRail = null;
    }
    const found = doc.querySelector(sidebarSelector);
    resolvedRail = found instanceof HTMLElement ? found : null;
    return resolvedRail;
  }

  function railFor(node: Element): HTMLElement | null {
    const rail = resolveRail();
    if (rail === null) return null;
    if (rail === node || rail.contains(node)) return rail;
    if (triggerSelector !== "" && node.closest(triggerSelector) !== null) {
      return rail;
    }
    return null;
  }

  function hasExpandedToken(node: HTMLElement): boolean {
    for (const token of node.classList) {
      if (EXPANDED_CLASS_TOKENS.has(token)) return true;
    }
    return false;
  }

  function isCollapsed(node: HTMLElement): boolean {
    for (const token of node.classList) {
      if (COLLAPSED_CLASS_TOKENS.has(token)) return true;
      if (EXPANDED_CLASS_TOKENS.has(token)) return false;
    }
    // A rail without state classes still counts as collapsed while it is
    // narrow; a zero rect means layout is unavailable, so stay conservative.
    const width = node.getBoundingClientRect().width;
    return width > 0 && width <= collapsedMaxWidth;
  }

  function sideOf(node: HTMLElement): SidebarPeekSide {
    const doc = node.ownerDocument;
    const viewport =
      doc.documentElement.clientWidth || doc.defaultView?.innerWidth || 0;
    if (viewport <= 0) return "left";
    const rect = node.getBoundingClientRect();
    return rect.left + rect.width / 2 < viewport / 2 ? "left" : "right";
  }

  /**
   * Widening a rail that sits in a row would push the chat column aside, which
   * is the reflow this feature exists to avoid. A single negative margin of the
   * exact growth cancels it. Fixed and absolutely positioned rails get none
   * because their width is already out of flow, and a clipped parent gets the
   * platform's configured shift instead of a measurement.
   */
  function measureShift(node: HTMLElement, collapsedWidth: number): number {
    const view = node.ownerDocument.defaultView;
    if (view === null) return 0;
    if (!Number.isFinite(collapsedWidth) || collapsedWidth <= 0) return 0;
    const style = view.getComputedStyle(node);
    if (style.position !== "static" && style.position !== "relative") return 0;
    const parent = node.parentElement;
    if (parent === null) return 0;
    const parentStyle = view.getComputedStyle(parent);
    const isFlex =
      parentStyle.display === "flex" || parentStyle.display === "inline-flex";
    const isGrid =
      parentStyle.display === "grid" || parentStyle.display === "inline-grid";
    // A block wrapper whose width follows its content (Qwen's .sidebar-wrapper)
    // shrinks back by the same negative margin, so it is measured the same way.
    const isBlockFlow =
      parentStyle.display === "block" ||
      parentStyle.display === "flow-root" ||
      parentStyle.display === "inline-block";
    if (!isFlex && !isGrid && !isBlockFlow) return 0;
    if (isFlex && !parentStyle.flexDirection.startsWith("row")) return 0;
    if (parentStyle.overflow !== "visible") return 0;
    const shift = Math.round(collapsedWidth - peekWidth);
    return shift < 0 ? shift : 0;
  }

  function readSnapshot(
    node: HTMLElement,
    property: string,
  ): StyleSnapshot {
    return {
      value: node.style.getPropertyValue(property),
      priority: node.style.getPropertyPriority(property),
    };
  }

  function restoreSnapshot(
    node: HTMLElement,
    property: string,
    snapshot: StyleSnapshot | null,
  ): void {
    if (snapshot === null || snapshot.value === "") {
      node.style.removeProperty(property);
      return;
    }
    node.style.setProperty(property, snapshot.value, snapshot.priority);
  }

  function cancelShow(): void {
    if (showTimer !== null) {
      clearTimeout(showTimer);
      showTimer = null;
    }
    pendingRail = null;
  }

  function cancelHide(): void {
    if (hideTimer !== null) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function releaseActive(): void {
    const node = active;
    if (node === null) return;
    active = null;
    node.removeAttribute(SIDEBAR_PEEK_ATTRIBUTE);
    restoreSnapshot(node, SIDEBAR_PEEK_WIDTH_VAR, widthSnapshot);
    restoreSnapshot(node, SIDEBAR_PEEK_SHIFT_VAR, shiftSnapshot);
    widthSnapshot = null;
    shiftSnapshot = null;
    restoreReveal();
  }

  /**
   * A few sites keep their expanded panel mounted but clip it with an inline
   * display: none !important. Only that inline declaration can override the
   * site's own inline value, so the peek lifts it for the hovered moment and
   * puts the exact snapshot back on leave.
   */
  function liftReveal(rail: HTMLElement): void {
    if (revealSelector === "") return;
    const targets: RevealTarget[] = [];
    for (const found of Array.from(rail.querySelectorAll(revealSelector))) {
      if (!(found instanceof HTMLElement)) continue;
      targets.push({ node: found, display: readSnapshot(found, "display") });
      found.style.setProperty("display", "flex", "important");
    }
    revealTargets = targets;
  }

  function restoreReveal(): void {
    if (revealTargets.length === 0) return;
    const targets = revealTargets;
    revealTargets = [];
    for (const target of targets) {
      restoreSnapshot(target.node, "display", target.display);
    }
  }

  function applyPeek(node: HTMLElement): void {
    cancelShow();
    cancelHide();
    if (active === node) return;
    releaseActive();
    const collapsedWidth = node.getBoundingClientRect().width;
    const measured = measureShift(node, collapsedWidth);
    const shift = measured < 0 ? measured : definition?.shift ?? 0;
    widthSnapshot = readSnapshot(node, SIDEBAR_PEEK_WIDTH_VAR);
    shiftSnapshot = readSnapshot(node, SIDEBAR_PEEK_SHIFT_VAR);
    active = node;
    node.style.setProperty(SIDEBAR_PEEK_WIDTH_VAR, `${peekWidth}px`);
    node.style.setProperty(SIDEBAR_PEEK_SHIFT_VAR, `${shift}px`);
    node.setAttribute(SIDEBAR_PEEK_ATTRIBUTE, sideOf(node));
    liftReveal(node);
  }

  function scheduleShow(rail: HTMLElement): void {
    cancelHide();
    if (active === rail) return;
    if (pendingRail === rail && showTimer !== null) return;
    cancelShow();
    pendingRail = rail;
    showTimer = setTimeout(() => {
      showTimer = null;
      const target = pendingRail;
      pendingRail = null;
      if (target === null || !target.isConnected) return;
      // The site may have opened the rail during the intent delay.
      if (!isCollapsed(target)) return;
      applyPeek(target);
    }, showDelayMs);
  }

  function scheduleHide(rail: HTMLElement): void {
    if (pendingRail === rail) cancelShow();
    if (active !== rail) return;
    cancelHide();
    hideTimer = setTimeout(() => {
      hideTimer = null;
      if (active !== rail) return;
      releaseActive();
    }, hideDelayMs);
  }

  function isMousePointer(event: Event): boolean {
    const pointerType = (event as PointerEvent).pointerType;
    return (
      pointerType === undefined || pointerType === "" || pointerType === "mouse"
    );
  }

  function handlePointerOver(event: Event): void {
    if (!isMousePointer(event)) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const rail = railFor(target);
    if (rail === null) return;
    scheduleShow(rail);
  }

  function handlePointerOut(event: Event): void {
    if (!isMousePointer(event)) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const rail = railFor(target);
    if (rail === null) return;
    const related = (event as MouseEvent).relatedTarget;
    if (related instanceof Element && railFor(related) === rail) return;
    scheduleHide(rail);
  }

  function handlePointerDown(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const rail = railFor(target);
    if (rail === null) {
      cancelShow();
      releaseActive();
      return;
    }
    // A press inside the peek keeps it open for the click that follows. A press
    // on the native toggle would expand the rail, so the peek steps aside.
    if (active === rail && !rail.contains(target)) releaseActive();
  }

  function handleFocusIn(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const rail = railFor(target);
    if (rail === null) return;
    if (active === rail) return;
    if (!isCollapsed(rail)) return;
    applyPeek(rail);
  }

  function handleKeyDown(event: Event): void {
    const key = (event as KeyboardEvent).key;
    if (key === "Escape") {
      cancelShow();
      releaseActive();
      return;
    }
    if (active === null || (key !== "Enter" && key !== " ")) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (triggerSelector === "" || target.closest(triggerSelector) === null) {
      return;
    }
    // The native toggle is about to open the rail for real; the peek has to
    // step aside so its negative margin does not overlap the expanded panel.
    cancelShow();
    releaseActive();
  }

  function handleMutations(): void {
    const node = active;
    if (node === null) return;
    if (!node.isConnected || hasExpandedToken(node)) releaseActive();
  }

  function bind(doc: Document): void {
    if (boundDocument === doc) return;
    teardown();
    if (!enabled) return;
    boundDocument = doc;
    doc.addEventListener("pointerover", handlePointerOver);
    doc.addEventListener("pointerout", handlePointerOut);
    doc.addEventListener("pointerdown", handlePointerDown);
    doc.addEventListener("focusin", handleFocusIn);
    doc.addEventListener("keydown", handleKeyDown);
    const root = doc.documentElement ?? doc.body;
    if (root !== null) {
      observer = new MutationObserver(handleMutations);
      observer.observe(root, {
        attributes: true,
        attributeFilter: MOTION_ATTRIBUTES,
        childList: true,
        subtree: true,
      });
    }
  }

  function teardown(): void {
    cancelShow();
    cancelHide();
    releaseActive();
    if (observer !== null) {
      observer.disconnect();
      observer = null;
    }
    if (boundDocument !== null) {
      boundDocument.removeEventListener("pointerover", handlePointerOver);
      boundDocument.removeEventListener("pointerout", handlePointerOut);
      boundDocument.removeEventListener("pointerdown", handlePointerDown);
      boundDocument.removeEventListener("focusin", handleFocusIn);
      boundDocument.removeEventListener("keydown", handleKeyDown);
      boundDocument = null;
    }
    resolveDocument = null;
    resolvedRail = null;
  }

  return {
    bind,
    teardown,
    isPeeking: () => active !== null,
  };
}
