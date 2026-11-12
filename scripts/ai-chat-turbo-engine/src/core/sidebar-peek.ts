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
/**
 * Width of the strip at the viewport edge that stands in for a rail the site
 * removes or slides out of the document. Without it those rails have no box
 * to hover, so an approach from the screen edge never starts a peek.
 */
export const SIDEBAR_PEEK_EDGE_ZONE_PX = 8;
/** How far outside a visible rail the pointer may rest and still count. */
export const SIDEBAR_PEEK_PROXIMITY_PX = 10;
/** Longest a site menu opened from the peek may hold it open. */
export const SIDEBAR_PEEK_POPOVER_HOLD_MS = 30_000;
/** Narrow viewports cap the peek at this share of their width. */
export const SIDEBAR_PEEK_WIDTH_RATIO = 0.42;

/**
 * Menus and dialogs that sites portal to the body while the rail is open.
 * A press or a parked pointer inside one is still the peek being used.
 */
const POPOVER_SELECTOR = [
  '[role="menu"]',
  '[role="listbox"]',
  '[role="dialog"]',
  ".ant-dropdown",
  ".ant-modal-root",
  "[data-radix-popper-content-wrapper]",
].join(", ");

/** How often a held peek re-checks whether the site menu is still open. */
const POPOVER_RECHECK_MS = 400;

/**
 * Minimum gap between pointer-move probes. The hover intent delay is longer
 * than this, so throttling loses no approach; it only keeps a cursor swept
 * along the edge from forcing a layout read on every single event.
 */
const POINTER_PROBE_INTERVAL_MS = 40;

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

interface SuppressTarget {
  readonly node: HTMLElement;
  readonly opacity: StyleSnapshot;
  readonly pointerEvents: StyleSnapshot;
}

interface ClipTarget {
  readonly node: HTMLElement;
  readonly overflowX: StyleSnapshot;
  readonly overflowY: StyleSnapshot;
}

export interface SidebarPeekOptions {
  /** Platform rail description, or null when the site has no hover rail. */
  readonly sidebar: SidebarPeekDefinition | null;
  /** Live preference read; false keeps the peek dormant without unbinding. */
  readonly enabled?: () => boolean;
  readonly showDelayMs?: number;
  readonly hideDelayMs?: number;
}

export interface SidebarPeek {
  /** Watch one document for rail intent. Safe to call again after a reload. */
  bind: (doc: Document) => void;
  /** Stop watching, cancel pending timers, and restore the native rail. */
  teardown: () => void;
  /** Re-read the live preference and drop an active peek when it is off. */
  syncEnabled: () => void;
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
  let inertTargets: HTMLElement[] = [];
  let railDisplaySnapshot: StyleSnapshot | null = null;
  let railOpacitySnapshot: StyleSnapshot | null = null;
  let railTransformSnapshot: StyleSnapshot | null = null;
  let railVisibilitySnapshot: StyleSnapshot | null = null;
  let suppressTargets: SuppressTarget[] = [];
  let clipTargets: ClipTarget[] = [];
  let expandedByPeek = false;
  let pointerX = Number.NaN;
  let pointerY = Number.NaN;
  let activePeekWidth = peekWidth;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let holdRemainingMs = 0;
  let rescanNeeded = false;
  let lastProbeMs = Number.NEGATIVE_INFINITY;

  const hasRail = sidebarSelector !== "";

  function isEnabled(): boolean {
    return hasRail && (options.enabled?.() ?? true);
  }

  function resolveRail(): HTMLElement | null {
    const doc = boundDocument;
    if (!isEnabled() || doc === null) return null;
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
    // A rail without state classes is collapsed when it is narrow, when the
    // site slides it fully past an edge (Doubao, Yuanbao), or when it keeps a
    // zero-width slot for it (Grok, Qianwen). Measuring the box catches all
    // three, because the closed state never leaves a usable rail on screen.
    const rect = node.getBoundingClientRect();
    if (rect.width === 0) return true;
    if (rect.right <= 1) return true;
    const doc = node.ownerDocument;
    const viewport =
      doc.documentElement.clientWidth || doc.defaultView?.innerWidth || 0;
    if (viewport > 0 && rect.left >= viewport - 1) return true;
    return rect.width <= collapsedMaxWidth;
  }

  function sideOf(node: HTMLElement): SidebarPeekSide {
    const doc = node.ownerDocument;
    const viewport =
      doc.documentElement.clientWidth || doc.defaultView?.innerWidth || 0;
    if (viewport <= 0) return "left";
    const rect = node.getBoundingClientRect();
    return rect.left + rect.width / 2 < viewport / 2 ? "left" : "right";
  }

  /** The peek a viewport can afford, so a phone keeps a usable chat column. */
  function peekWidthFor(node: HTMLElement): number {
    const doc = node.ownerDocument;
    const viewport =
      doc.documentElement.clientWidth || doc.defaultView?.innerWidth || 0;
    if (viewport <= 0) return peekWidth;
    const cap = Math.round(viewport * SIDEBAR_PEEK_WIDTH_RATIO);
    return Math.max(1, Math.min(peekWidth, cap));
  }

  /**
   * A rail the site removes or slides out of the document has no box to
   * hover, and a narrow one is easy to miss by a few pixels. Both cases are
   * answered geometrically: a rail that is still laid out on screen gets its
   * box extended by a small band, and a rail that is not gets the edge strip
   * where it would appear.
   */
  function nearRail(x: number, y: number): HTMLElement | null {
    const rail = resolveRail();
    if (rail === null) return null;
    const doc = rail.ownerDocument;
    const view = doc.defaultView;
    const viewportWidth =
      doc.documentElement.clientWidth || view?.innerWidth || 0;
    const viewportHeight =
      doc.documentElement.clientHeight || view?.innerHeight || 0;
    const rect = rail.getBoundingClientRect();
    const onScreen = rect.width > 0 && rect.right > 1 && rect.left < viewportWidth - 1;
    if (onScreen) {
      return x >= rect.left - SIDEBAR_PEEK_PROXIMITY_PX &&
        x <= rect.right + SIDEBAR_PEEK_PROXIMITY_PX &&
        y >= rect.top - SIDEBAR_PEEK_PROXIMITY_PX &&
        y <= rect.bottom + SIDEBAR_PEEK_PROXIMITY_PX
        ? rail
        : null;
    }
    const side = sideOf(rail);
    const insideStrip =
      side === "left"
        ? x >= 0 && x <= SIDEBAR_PEEK_EDGE_ZONE_PX
        : x >= viewportWidth - SIDEBAR_PEEK_EDGE_ZONE_PX && x <= viewportWidth;
    if (!insideStrip) return null;
    const top = rect.height > 0 ? Math.max(0, rect.top) : 0;
    const bottom = rect.height > 0 ? Math.min(viewportHeight, rect.bottom) : viewportHeight;
    return y >= top - SIDEBAR_PEEK_PROXIMITY_PX &&
      y <= bottom + SIDEBAR_PEEK_PROXIMITY_PX
      ? rail
      : null;
  }

  /**
   * Widening a rail that sits in a row would push the chat column aside, which
   * is the reflow this feature exists to avoid. A single negative margin of the
   * exact growth cancels it. Fixed and absolutely positioned rails get none
   * because their width is already out of flow, and a clipped parent gets the
   * platform's configured shift instead of a measurement.
   */
  function measureShift(
    node: HTMLElement,
    collapsedWidth: number,
    width: number,
  ): number {
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
    const shift = Math.round(collapsedWidth - width);
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

  function cancelHold(): void {
    if (holdTimer !== null) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    holdRemainingMs = 0;
  }

  function releaseActive(): void {
    cancelHide();
    cancelHold();
    rescanNeeded = false;
    const node = active;
    if (node === null) return;
    active = null;
    if (expandedByPeek) {
      expandedByPeek = false;
      const collapseSelector = definition?.nativeExpand?.collapse ?? "";
      const collapse =
        collapseSelector === ""
          ? null
          : node.ownerDocument.querySelector(collapseSelector);
      if (collapse instanceof HTMLElement) collapse.click();
    }
    node.removeAttribute(SIDEBAR_PEEK_ATTRIBUTE);
    restoreSnapshot(node, SIDEBAR_PEEK_WIDTH_VAR, widthSnapshot);
    restoreSnapshot(node, SIDEBAR_PEEK_SHIFT_VAR, shiftSnapshot);
    if (railDisplaySnapshot !== null) {
      restoreSnapshot(node, "display", railDisplaySnapshot);
      railDisplaySnapshot = null;
    }
    if (railOpacitySnapshot !== null) {
      restoreSnapshot(node, "opacity", railOpacitySnapshot);
      railOpacitySnapshot = null;
    }
    if (railTransformSnapshot !== null) {
      restoreSnapshot(node, "transform", railTransformSnapshot);
      railTransformSnapshot = null;
    }
    if (railVisibilitySnapshot !== null) {
      restoreSnapshot(node, "visibility", railVisibilitySnapshot);
      railVisibilitySnapshot = null;
    }
    widthSnapshot = null;
    shiftSnapshot = null;
    restoreInert();
    restoreReveal();
    restoreSuppress();
    restoreClip();
  }

  /**
   * ChatGPT leaves the expanded panel in the DOM with the inert attribute, so
   * the browser ignores every press inside it even though the box is visible
   * and pointer-events is auto. Removing the attribute only while the peek is
   * open restores the native controls; leaving re-applies it exactly.
   */
  function liftInert(rail: HTMLElement): void {
    for (const found of Array.from(rail.querySelectorAll("[inert]"))) {
      if (!(found instanceof HTMLElement)) continue;
      if (inertTargets.includes(found)) continue;
      inertTargets.push(found);
      found.removeAttribute("inert");
    }
  }

  function restoreInert(): void {
    if (inertTargets.length === 0) return;
    const targets = inertTargets;
    inertTargets = [];
    for (const node of targets) node.setAttribute("inert", "");
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

  /**
   * DeepSeek keeps a compact toolbar fixed over the hidden rail. A revealed
   * rail puts its own header in exactly that box, so the toolbar has to stop
   * painting above it and stop receiving the presses aimed at the rail.
   * Both declarations are restored from their exact inline snapshots.
   */
  function suppressOverlap(): void {
    const selectors = definition?.suppress;
    const doc = boundDocument;
    if (selectors === undefined || selectors.length === 0 || doc === null) {
      return;
    }
    const selector = selectors.join(", ");
    for (const found of Array.from(doc.querySelectorAll(selector))) {
      if (!(found instanceof HTMLElement)) continue;
      if (suppressTargets.some((target) => target.node === found)) continue;
      suppressTargets.push({
        node: found,
        opacity: readSnapshot(found, "opacity"),
        pointerEvents: readSnapshot(found, "pointer-events"),
      });
      found.style.setProperty("opacity", "0", "important");
      found.style.setProperty("pointer-events", "none", "important");
    }
  }

  function restoreSuppress(): void {
    if (suppressTargets.length === 0) return;
    const targets = suppressTargets;
    suppressTargets = [];
    for (const target of targets) {
      restoreSnapshot(target.node, "opacity", target.opacity);
      restoreSnapshot(target.node, "pointer-events", target.pointerEvents);
    }
  }

  /**
   * Doubao, Yuanbao, and Qianwen keep the rail inside a column that clips
   * overflow at the collapsed width. Widening the rail alone leaves it cut
   * off inside that box, so every clipping ancestor narrower than the peek
   * gets a visible overflow for the hovered moment. Both axes are snapshotted
   * separately because an inline `overflow` shorthand expands into them.
   */
  function liftClip(rail: HTMLElement): void {
    if (definition?.revealRail !== true) return;
    const doc = boundDocument;
    const view = rail.ownerDocument.defaultView;
    if (doc === null || view === null) return;
    for (
      let node = rail.parentElement;
      node !== null && node !== doc.body;
      node = node.parentElement
    ) {
      const style = view.getComputedStyle(node);
      if (style.overflow === "visible") continue;
      if (node.getBoundingClientRect().width >= activePeekWidth) continue;
      clipTargets.push({
        node,
        overflowX: readSnapshot(node, "overflow-x"),
        overflowY: readSnapshot(node, "overflow-y"),
      });
      node.style.setProperty("overflow-x", "visible", "important");
      node.style.setProperty("overflow-y", "visible", "important");
    }
  }

  function restoreClip(): void {
    if (clipTargets.length === 0) return;
    const targets = clipTargets;
    clipTargets = [];
    for (const target of targets) {
      restoreSnapshot(target.node, "overflow-x", target.overflowX);
      restoreSnapshot(target.node, "overflow-y", target.overflowY);
    }
  }

  function applyPeek(node: HTMLElement): void {
    cancelShow();
    cancelHide();
    if (active === node) return;
    releaseActive();
    const collapsedWidth = node.getBoundingClientRect().width;
    const width = peekWidthFor(node);
    activePeekWidth = width;
    const measured = measureShift(node, collapsedWidth, width);
    const configuredShift = definition?.shift ?? 0;
    // A configured shift stands in for a measurement the site's clipping
    // parent makes unreliable; it has to shrink with the width it cancels.
    const fallbackShift =
      width === peekWidth ? configuredShift : configuredShift + (peekWidth - width);
    const shift = measured < 0 ? measured : fallbackShift;
    widthSnapshot = readSnapshot(node, SIDEBAR_PEEK_WIDTH_VAR);
    shiftSnapshot = readSnapshot(node, SIDEBAR_PEEK_SHIFT_VAR);
    if (definition?.revealRail === true) {
      railDisplaySnapshot = readSnapshot(node, "display");
      railOpacitySnapshot = readSnapshot(node, "opacity");
      railTransformSnapshot = readSnapshot(node, "transform");
      railVisibilitySnapshot = readSnapshot(node, "visibility");
      const view = node.ownerDocument.defaultView;
      const display = view === null ? "none" : view.getComputedStyle(node).display;
      // Doubao and Yuanbao keep the rail in flow and only slide it away; its
      // block display is part of that layout, so only a removed rail is
      // rebuilt as a flex column.
      if (display === "none") {
        node.style.setProperty("display", "flex", "important");
      }
      node.style.setProperty("opacity", "1", "important");
      node.style.setProperty("transform", "none", "important");
      node.style.setProperty("visibility", "visible", "important");
    }
    active = node;
    rescanNeeded = true;
    node.style.setProperty(SIDEBAR_PEEK_WIDTH_VAR, `${width}px`);
    node.style.setProperty(SIDEBAR_PEEK_SHIFT_VAR, `${shift}px`);
    node.setAttribute(SIDEBAR_PEEK_ATTRIBUTE, sideOf(node));
    liftReveal(node);
    liftInert(node);
    liftClip(node);
    suppressOverlap();
    if (definition?.nativeExpand !== undefined) {
      const expand = node.ownerDocument.querySelector(
        definition.nativeExpand.expand,
      );
      if (expand instanceof HTMLElement) {
        expandedByPeek = true;
        expand.click();
      }
    }
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
      // A site that expands on the same press re-lays the rail out under the
      // pointer; the resulting synthetic pointerout must not close it while
      // the cursor still rests on the panel.
      if (pointerStillOverRail(rail)) return;
      // A menu the peek opened lives outside the rail in the body, so the
      // pointer leaving the rail is not the user leaving the peek.
      if (sitePopover() !== null) {
        holdForPopover(rail);
        return;
      }
      releaseActive();
    }, hideDelayMs);
  }

  /** The first visible site menu or dialog the rail may have opened. */
  function sitePopover(): HTMLElement | null {
    const doc = boundDocument;
    const view = doc?.defaultView ?? null;
    if (doc === null || view === null) return null;
    const rail = resolvedRail;
    for (const found of Array.from(doc.querySelectorAll(POPOVER_SELECTOR))) {
      if (!(found instanceof HTMLElement)) continue;
      if (rail !== null && rail.contains(found)) continue;
      // A dialog that wraps the whole app would otherwise read as a menu the
      // rail opened, and hold every peek open for the full budget.
      if (rail !== null && found.contains(rail)) continue;
      if (!isVisiblePopover(found, view)) continue;
      return found;
    }
    return null;
  }

  /**
   * Sites keep closed menus mounted far more often than not. Size, the
   * accessibility flag, and the computed display are what separate a menu the
   * user can see from a wrapper that merely exists in the document.
   */
  function isVisiblePopover(node: HTMLElement, view: Window): boolean {
    if (node.hidden) return false;
    if (node.getAttribute("aria-hidden") === "true") return false;
    if (node.closest("[inert]") !== null) return false;
    const style = view.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    const rect = node.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  }

  /** The visible portaled menu under a press, when it is not the rail itself. */
  function popoverFor(target: Element): HTMLElement | null {
    const view = boundDocument?.defaultView ?? null;
    if (view === null) return null;
    const found = target.closest(POPOVER_SELECTOR);
    if (!(found instanceof HTMLElement)) return null;
    const rail = resolvedRail;
    if (rail !== null && (rail.contains(found) || found.contains(rail))) {
      return null;
    }
    return isVisiblePopover(found, view) ? found : null;
  }

  /**
   * Keeps the peek up while a portaled menu is open and closes it once the
   * menu goes away. The budget bounds a site dialog the user left open, so a
   * single peek cannot outlive its own hover by more than the hold window.
   */
  function holdForPopover(rail: HTMLElement): void {
    if (holdTimer !== null) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (holdRemainingMs <= 0) holdRemainingMs = SIDEBAR_PEEK_POPOVER_HOLD_MS;
    const step = Math.min(POPOVER_RECHECK_MS, holdRemainingMs);
    holdRemainingMs -= step;
    holdTimer = setTimeout(() => {
      holdTimer = null;
      if (active !== rail) return;
      const popover = sitePopover();
      if (popover !== null && holdRemainingMs > 0) {
        holdForPopover(rail);
        return;
      }
      holdRemainingMs = 0;
      if (pointerStillOverRail(rail)) return;
      releaseActive();
    }, step);
  }

  function pointerStillOverRail(rail: HTMLElement): boolean {
    if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) return false;
    const doc = rail.ownerDocument;
    if (typeof doc.elementFromPoint !== "function") return false;
    const hit = doc.elementFromPoint(pointerX, pointerY);
    if (!(hit instanceof Element)) return false;
    if (rail.contains(hit)) return true;
    // Gemini and Grok open through their own toggle, which sits outside the
    // rail. The pointer still rests on the control that opened the panel, so
    // the peek must not close underneath it.
    return triggerSelector !== "" && hit.closest(triggerSelector) !== null;
  }

  function isMousePointer(event: Event): boolean {
    const pointerType = (event as PointerEvent).pointerType;
    return (
      pointerType === undefined || pointerType === "" || pointerType === "mouse"
    );
  }

  function handlePointerOver(event: Event): void {
    if (!isMousePointer(event)) return;
    pointerX = (event as MouseEvent).clientX;
    pointerY = (event as MouseEvent).clientY;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const rail = railFor(target);
    if (rail === null) return;
    if (active === rail) {
      liftInert(rail);
      if (rescanNeeded) {
        rescanNeeded = false;
        suppressOverlap();
      }
    }
    scheduleShow(rail);
  }

  /**
   * Hovering a rail the site has removed, moved off screen, or shrunk to a
   * sliver is unreliable: the pointer misses the box by a few pixels and no
   * pointerover ever names the rail. The same intent is read from the pointer
   * position instead, which is what makes the edge approach work on every
   * platform rather than only those with a wide collapsed rail.
   */
  function handlePointerMove(event: Event): void {
    if (!isMousePointer(event)) return;
    const mouse = event as MouseEvent;
    pointerX = mouse.clientX;
    pointerY = mouse.clientY;
    if (active !== null) return;
    const doc = boundDocument;
    if (doc === null) return;
    const viewport =
      doc.documentElement.clientWidth || doc.defaultView?.innerWidth || 0;
    // A cursor in the middle of the page is not heading for an edge rail. One
    // cheap comparison keeps the layout read in nearRail off the common path.
    const band = Math.max(120, collapsedMaxWidth + SIDEBAR_PEEK_PROXIMITY_PX);
    if (viewport > 0 && pointerX > band && pointerX < viewport - band) {
      if (pendingRail !== null) cancelShow();
      return;
    }
    const target = event.target;
    if (target instanceof Element && railFor(target) !== null) return;
    const now = performance.now();
    if (now - lastProbeMs < POINTER_PROBE_INTERVAL_MS) return;
    lastProbeMs = now;
    const rail = nearRail(pointerX, pointerY);
    if (rail === null) {
      // The pointer slid past the rail before the intent delay elapsed.
      if (pendingRail !== null) cancelShow();
      return;
    }
    scheduleShow(rail);
  }

  function handlePointerOut(event: Event): void {
    if (!isMousePointer(event)) return;
    pointerX = (event as MouseEvent).clientX;
    pointerY = (event as MouseEvent).clientY;
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
    // A press inside a menu the peek opened belongs to the peek, even though
    // the site portals that menu outside the rail.
    if (active !== null && popoverFor(target) !== null) {
      cancelHide();
      // The click may close the menu or keep it open for another choice; the
      // watcher decides on the next tick instead of leaving the peek pinned.
      holdForPopover(active);
      return;
    }
    const rail = railFor(target);
    if (rail === null) {
      cancelShow();
      releaseActive();
      return;
    }
    // A press inside the peek keeps it open for the click that follows. A press
    // on the native toggle would expand the rail, so the peek steps aside.
    if (active === rail && !rail.contains(target)) {
      if (triggerSelector !== "" && target.closest(triggerSelector) !== null) {
        // The site's own press decides the end state. Undoing the peek with a
        // synthetic collapse first would toggle the rail twice.
        expandedByPeek = false;
      }
      releaseActive();
    }
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
    expandedByPeek = false;
    releaseActive();
  }

  function handleMutations(): void {
    const node = active;
    if (node === null) return;
    rescanNeeded = true;
    if (expandedByPeek) {
      if (!node.isConnected) releaseActive();
      return;
    }
    if (!node.isConnected || hasExpandedToken(node)) releaseActive();
  }

  function bind(doc: Document): void {
    if (boundDocument === doc) return;
    teardown();
    if (!hasRail) return;
    boundDocument = doc;
    doc.addEventListener("pointerover", handlePointerOver);
    doc.addEventListener("pointermove", handlePointerMove);
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
      boundDocument.removeEventListener("pointermove", handlePointerMove);
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
    syncEnabled: () => {
      if (isEnabled()) return;
      cancelShow();
      releaseActive();
    },
    isPeeking: () => active !== null,
  };
}
