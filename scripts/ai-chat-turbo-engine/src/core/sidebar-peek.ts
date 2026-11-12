import type { SidebarPeekDefinition } from "../config";

/** Marks the native rail that is currently peeking; the value is the side. */
export const SIDEBAR_PEEK_ATTRIBUTE = "data-ai-turbo-sidebar-peek";
/** Marks the rail subtree whose transitions are paused for the release. */
export const SIDEBAR_PEEK_HOLD_ATTRIBUTE = "data-ai-turbo-sidebar-peek-hold";
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
 * Width of the activation lane along the rail's edge. A collapsed rail is
 * often invisible, slid out of the document, or narrower than the pointer's
 * actual approach, so intent is read from this lane as well as from the rail
 * box itself.
 */
export const SIDEBAR_PEEK_LANE_PX = 28;
/** How far outside a visible rail the pointer may rest and still count. */
export const SIDEBAR_PEEK_PROXIMITY_PX = 10;
/** Longest a site menu opened from the peek may hold it open. */
export const SIDEBAR_PEEK_POPOVER_HOLD_MS = 30_000;
/** Narrow viewports cap the peek at this share of their width. */
export const SIDEBAR_PEEK_WIDTH_RATIO = 0.42;
/**
 * How long the release keeps the rail subtree free of transitions. It has to
 * outlast the deferred collapse press and the longest site collapse the peek
 * can trigger (300ms on Z.ai), so the panel lands in one frame.
 */
export const SIDEBAR_PEEK_TRANSITION_HOLD_MS = 360;
/**
 * How many times one peek may re-show a content column the site hides again.
 * ChatGPT re-applies its inline hidden rule once, on the render that follows
 * the widened rail; the cap keeps a site that hides on every render from
 * turning the lift into a loop.
 */
export const SIDEBAR_PEEK_RELIFT_LIMIT = 4;

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

interface ShellTarget {
  readonly node: HTMLElement;
  readonly width: StyleSnapshot;
  readonly minWidth: StyleSnapshot;
  readonly maxWidth: StyleSnapshot;
  readonly boxSizing: StyleSnapshot;
}

/** Text a collapsed rail hides behind display, visibility, opacity, or a cap. */
interface LabelTarget {
  readonly node: HTMLElement;
  readonly display: StyleSnapshot;
  readonly visibility: StyleSnapshot;
  readonly opacity: StyleSnapshot;
  readonly maxWidth: StyleSnapshot;
}

/** An inline transition held back for one frame while a peek releases. */
interface TransitionTarget {
  readonly node: HTMLElement;
  readonly transition: StyleSnapshot;
}

/** How a peek ended, which decides whether a native control may be pressed. */
type ReleaseReason = "hover" | "navigation" | "adopt" | "lifecycle";

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
  const sidebarSelectors = definition?.selectors ?? [];
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
  let shellTargets: ShellTarget[] = [];
  /** Row containers the peek re-showed after the site removed them inline. */
  let revealShells: { node: HTMLElement; display: StyleSnapshot }[] = [];
  /** Watches only those containers for the inline rule coming back. */
  let revealObserver: MutationObserver | null = null;
  let reliftTimer: ReturnType<typeof setTimeout> | null = null;
  let reliftAttempts = 0;
  let labelTargets: LabelTarget[] = [];
  let transitionTargets: TransitionTarget[] = [];
  let collapseTarget: HTMLElement | null = null;
  let appliedHref = "";
  let expandedByPeek = false;
  let pointerX = Number.NaN;
  let pointerY = Number.NaN;
  let activePeekWidth = peekWidth;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let holdRemainingMs = 0;
  let rescanNeeded = false;
  let lastProbeMs = Number.NEGATIVE_INFINITY;
  let probeTimer: ReturnType<typeof setTimeout> | null = null;
  let activeShift = 0;
  let reacquireTimer: ReturnType<typeof setTimeout> | null = null;
  let reacquireAttempts = 0;
  let transitionHoldTimer: ReturnType<typeof setTimeout> | null = null;
  let transitionHoldNode: HTMLElement | null = null;
  /** Pending press on the site's own collapse control after a release. */
  let nativeCollapseTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Menus and dialogs that were already on screen when the peek opened. They
   * belong to the page, not to the hovered rail, so they can never hold it.
   */
  const preexistingPopovers = new Set<HTMLElement>();

  const hasRail = sidebarSelectors.length > 0;

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
    // Selectors are tried in declared order. Joining them into one query
    // would let a fallback that matches an unrelated node earlier in the
    // document shadow the real rail, and the peek would widen that node.
    resolvedRail = null;
    for (const selector of sidebarSelectors) {
      const found = doc.querySelector(selector);
      if (found instanceof HTMLElement) {
        resolvedRail = found;
        break;
      }
    }
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
   * hover, a collapsed one is often inset from the edge or floated above it,
   * and a narrow one is easy to miss by a few pixels. All three are answered
   * geometrically: the approach lane spans from the viewport edge to the rail
   * box, so a pointer that starts at the edge always ends up on the rail.
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
    const side = sideOf(rail);
    const top = (rect.height > 0 ? rect.top : 0) - SIDEBAR_PEEK_PROXIMITY_PX;
    const bottom =
      (rect.height > 0 ? rect.bottom : viewportHeight) +
      SIDEBAR_PEEK_PROXIMITY_PX;
    if (y < top || y > bottom) return null;
    const onScreen =
      rect.width > 0 && rect.right > 1 && rect.left < viewportWidth - 1;
    if (side === "left") {
      // The lane reaches from the edge to the rail's far side, so an inset
      // rail, a zero-width rail, and a rail parked off screen share one zone.
      const end = Math.max(onScreen ? rect.right : 0, SIDEBAR_PEEK_LANE_PX);
      const start = onScreen ? Math.min(rect.left, 0) : 0;
      return x >= start - SIDEBAR_PEEK_PROXIMITY_PX && x <= end + SIDEBAR_PEEK_PROXIMITY_PX
        ? rail
        : null;
    }
    const start = Math.min(
      onScreen ? rect.left : viewportWidth,
      viewportWidth - SIDEBAR_PEEK_LANE_PX,
    );
    return x >= start - SIDEBAR_PEEK_PROXIMITY_PX &&
      x <= viewportWidth + SIDEBAR_PEEK_PROXIMITY_PX
      ? rail
      : null;
  }

  function rectHoldsPointer(
    rect: DOMRect,
    x: number,
    y: number,
  ): boolean {
    if (rect.width <= 0 || rect.height <= 0) return false;
    return (
      x >= rect.left - SIDEBAR_PEEK_PROXIMITY_PX &&
      x <= rect.right + SIDEBAR_PEEK_PROXIMITY_PX &&
      y >= rect.top - SIDEBAR_PEEK_PROXIMITY_PX &&
      y <= rect.bottom + SIDEBAR_PEEK_PROXIMITY_PX
    );
  }

  /**
   * The patch of screen a peeked rail occupies: its own box widened by the
   * peek away from the edge it sits on, plus every inner shell the panel was
   * stretched through. Containment is what keeps the peek up while the pointer
   * crosses a blank row, because the rail's DOM box is not what the user sees.
   */
  function withinPeekBand(
    rail: HTMLElement,
    x: number,
    y: number,
  ): boolean {
    const rect = rail.getBoundingClientRect();
    const side = sideOf(rail);
    const reach = Math.max(rect.width, activePeekWidth);
    const top = rect.height > 0 ? rect.top - SIDEBAR_PEEK_PROXIMITY_PX : -Infinity;
    const bottom =
      rect.height > 0 ? rect.bottom + SIDEBAR_PEEK_PROXIMITY_PX : Infinity;
    if (y >= top && y <= bottom) {
      const inside =
        side === "left"
          ? x >= rect.left - SIDEBAR_PEEK_PROXIMITY_PX &&
            x <= rect.left + reach + SIDEBAR_PEEK_PROXIMITY_PX
          : x <= rect.right + SIDEBAR_PEEK_PROXIMITY_PX &&
            x >= rect.right - reach - SIDEBAR_PEEK_PROXIMITY_PX;
      if (inside) return true;
    }
    for (const shell of shellTargets) {
      if (rectHoldsPointer(shell.node.getBoundingClientRect(), x, y)) return true;
    }
    return false;
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

  function releaseActive(reason: ReleaseReason = "hover"): void {
    cancelHide();
    cancelHold();
    cancelReacquire();
    cancelProbe();
    rescanNeeded = false;
    preexistingPopovers.clear();
    const node = active;
    if (node === null) return;
    active = null;
    // Widths go back to what the site declared. Sites animate that change on
    // their own, so without a quiet frame the rail spends a few hundred
    // milliseconds shrinking over the conversation the click just opened,
    // and every widened shell relayouts its history list on each frame. The
    // hold starts before the collapse control is pressed: a transition that
    // begins on that press would otherwise play out in full.
    const held = reason === "hover" || reason === "navigation";
    if (held) holdTransitions(node);
    // The site's own collapse control is pressed after the geometry is back,
    // never before it. A press while the peek width still forces the panel
    // open reaches a renderer that still owns an expanded layout: it commits
    // the expanded view again and the rail stays wide long after the pointer
    // left. Deferring the press also lets the release land in one frame.
    let collapse: HTMLElement | null = null;
    if (expandedByPeek) {
      expandedByPeek = false;
      const control = collapseFor(node);
      // An adopted peek moves its expansion to the rail that replaced this
      // one, so that release presses nothing. Every other release does: a
      // hover only presses a captured control that still belongs to the
      // peek, while after a navigation or a teardown that captured control
      // is the only safe one, since a fresh lookup finds another route's
      // toggle.
      if (
        control !== null &&
        reason !== "adopt" &&
        (reason === "navigation" || stillOwned(node, control))
      ) {
        collapse = control;
      }
    }
    collapseTarget = null;
    appliedHref = "";
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
    restoreShells();
    restoreLabels();
    if (held) {
      // Commit the restored geometry while transitions are still off. Clearing
      // them on a timer races the paint: after a navigation the main thread
      // can recalc styles later than any delay, and the browser would then
      // animate the whole collapse from the peek width.
      void node.getBoundingClientRect();
      releaseTransitions();
    }
    if (collapse !== null) requestNativeCollapse(node, collapse);
  }

  /**
   * Suspends transitions on the rail, the shells the peek stretched, and the
   * labels it re-exposed, so the release writes every restored width in one
   * layout instead of animating each box separately. The caller drops the
   * declarations again once that layout is committed.
   */
  function holdTransitions(rail: HTMLElement): void {
    finishTransitionHold();
    const nodes: HTMLElement[] = [rail];
    for (const target of shellTargets) nodes.push(target.node);
    for (const target of revealShells) nodes.push(target.node);
    for (const target of labelTargets) nodes.push(target.node);
    for (const node of nodes) {
      if (!node.isConnected) continue;
      if (transitionTargets.some((entry) => entry.node === node)) continue;
      transitionTargets.push({
        node,
        transition: readSnapshot(node, "transition"),
      });
      node.style.setProperty("transition", "none", "important");
    }
    // Sites animate wrappers inside the rail that the peek never touched
    // (Z.ai's w-[238px] block, Poe's category list). One attribute silences
    // that whole subtree instead of writing a declaration on every row.
    transitionHoldNode = rail;
    rail.setAttribute(SIDEBAR_PEEK_HOLD_ATTRIBUTE, "");
  }

  function releaseTransitions(): void {
    const targets = transitionTargets;
    transitionTargets = [];
    for (const target of targets) {
      if (!target.node.isConnected) continue;
      restoreSnapshot(target.node, "transition", target.transition);
    }
    const held = transitionHoldNode;
    transitionHoldNode = null;
    if (held === null) return;
    if (transitionHoldTimer !== null) clearTimeout(transitionHoldTimer);
    // The collapse press after a navigation is deferred by a task, and the
    // site applies its collapsed width after that. Keeping the subtree quiet
    // until the site settles means its own transition never sees a start
    // value, so it stays at the final width when the declarations return.
    transitionHoldTimer = setTimeout(() => {
      transitionHoldTimer = null;
      transitionHoldNode = null;
      held.removeAttribute(SIDEBAR_PEEK_HOLD_ATTRIBUTE);
    }, SIDEBAR_PEEK_TRANSITION_HOLD_MS);
  }

  /** Ends a pending hold early, when a new peek owns the rail again. */
  function finishTransitionHold(): void {
    if (transitionHoldTimer !== null) {
      clearTimeout(transitionHoldTimer);
      transitionHoldTimer = null;
    }
    const node = transitionHoldNode;
    transitionHoldNode = null;
    if (node !== null) node.removeAttribute(SIDEBAR_PEEK_HOLD_ATTRIBUTE);
  }

  /**
   * Presses the site's own collapse control on the task after the release.
   * The rail is already restored to its declared styles by then, so the
   * press reaches an expanded panel the site still owns; pressing earlier
   * let the site commit its expanded render over the restored rail. The box
   * is re-measured first, because after a navigation the site may have
   * closed the panel on its own, and a toggle pressed on a closed rail would
   * reopen it.
   */
  function requestNativeCollapse(
    rail: HTMLElement,
    control: HTMLElement,
  ): void {
    cancelNativeCollapse();
    nativeCollapseTimer = setTimeout(() => {
      nativeCollapseTimer = null;
      if (!rail.isConnected) return;
      if (control.ownerDocument !== rail.ownerDocument) return;
      // A peek that opened again owns the rail; its expansion is the state
      // the user asked for and must not be undone here.
      if (active === rail) return;
      // The site already closed the panel during its navigation. Only the
      // box is consulted here: a rail that just finished expanding can still
      // carry its old collapsed class for a frame, and pressing the toggle
      // then would reopen it.
      if (rail.getBoundingClientRect().width <= collapsedMaxWidth) return;
      // The header can be re-rendered between the release and this task, and
      // the rail may now hold a different copy of the toggle. Press whatever
      // the site is painting; a detached node closes nothing. A captured
      // control without a box is still pressed when nothing painted exists:
      // some sites hide the button and keep its press handler alive.
      const target = isPaintedControl(control)
        ? control
        : firstPaintedControl(rail, definition?.nativeExpand?.collapse ?? "") ??
          (control.isConnected ? control : null);
      target?.click();
    }, 0);
  }

  function cancelNativeCollapse(): void {
    if (nativeCollapseTimer === null) return;
    clearTimeout(nativeCollapseTimer);
    nativeCollapseTimer = null;
  }

  /**
   * The native collapse control is captured when the peek opens. Looking it up
   * again on release would find whatever the page shows by then, which after a
   * navigation is a different rail's toggle; pressing it toggles the wrong
   * panel and stalls the transition the site is already running.
   */
  function collapseFor(rail: HTMLElement): HTMLElement | null {
    const selector = definition?.nativeExpand?.collapse ?? "";
    if (selector === "") return null;
    const captured = collapseTarget;
    if (captured !== null && isPaintedControl(captured)) return captured;
    // Sites mount a hidden copy of every header control for the compact rail:
    // ChatGPT keeps two buttons with the same accessible name and only one of
    // them has a box. The capture above can land on the copy, and pressing it
    // does nothing, so the rail is asked again for a control the user could
    // actually press. A document-wide lookup stays out of this: after a
    // navigation it finds another route's toggle.
    const scoped = firstPaintedControl(rail, selector);
    if (scoped !== null) return scoped;
    if (captured !== null && captured.isConnected) return captured;
    return firstPaintedControl(rail.ownerDocument, selector);
  }

  /**
   * A control is only worth pressing when the page painted it: sites keep
   * 0x0 duplicates and inert-ed panels around, and a press on those reaches
   * nothing while the peek looks like it gave up on closing.
   */
  function isPaintedControl(node: Element | null): boolean {
    if (node === null) return false;
    if (!(node instanceof HTMLElement)) return false;
    if (!node.isConnected) return false;
    if (node.closest("[inert]") !== null) return false;
    if (node.hasAttribute("disabled")) return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  }

  function firstPaintedControl(
    root: ParentNode,
    selector: string,
  ): HTMLElement | null {
    for (const found of Array.from(root.querySelectorAll(selector))) {
      if (!(found instanceof HTMLElement)) continue;
      if (isPaintedControl(found)) return found;
    }
    return null;
  }

  /** A captured control may only be pressed while it still belongs to the peek. */
  function stillOwned(rail: HTMLElement, node: HTMLElement): boolean {
    if (!node.isConnected) return false;
    if (node.ownerDocument !== rail.ownerDocument) return false;
    const view = rail.ownerDocument.defaultView;
    if (appliedHref !== "" && view !== null && view.location.href !== appliedHref) {
      return false;
    }
    return true;
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

  /**
   * Widening the rail is not enough when the panel it opens lives inside a
   * shell that the site pins to the collapsed width: the rail grows and the
   * content stays clipped. Each declared shell is stretched to the peek width
   * for the hovered moment and put back from its exact inline snapshot.
   */
  function liftShells(rail: HTMLElement, width: number): void {
    const selectors = definition?.shells;
    if (selectors === undefined || selectors.length === 0) return;
    const seen = new Set<HTMLElement>();
    for (const selector of selectors) {
      for (const found of Array.from(rail.querySelectorAll(selector))) {
        if (!(found instanceof HTMLElement)) continue;
        if (found === rail || seen.has(found)) continue;
        seen.add(found);
        stretchShell(found, shellWidthFor(rail, found, width));
      }
    }
  }

  /**
   * The rail clips at its padding box, so a shell nested under that padding
   * cannot take the peek width outright: an eight pixel inset would push it
   * eight pixels past the clip and cut the end of every history label.
   * Measuring the shell's own left edge against the clip gives the width it
   * can really use, and border-box keeps its padding inside that number.
   */
  function shellWidthFor(
    rail: HTMLElement,
    node: HTMLElement,
    width: number,
  ): number {
    const view = rail.ownerDocument.defaultView;
    if (view === null) return width;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 && rect.height <= 0) return width;
    const border = parseFloat(view.getComputedStyle(rail).borderRightWidth);
    const clipRight = rail.getBoundingClientRect().right - (Number.isFinite(border) ? border : 0);
    const available = Math.floor(clipRight - rect.left) - 1;
    if (available < 80 || available >= width) return width;
    return available;
  }

  function stretchShell(node: HTMLElement, width: number): void {
    shellTargets.push({
      node,
      width: readSnapshot(node, "width"),
      minWidth: readSnapshot(node, "min-width"),
      maxWidth: readSnapshot(node, "max-width"),
      boxSizing: readSnapshot(node, "box-sizing"),
    });
    const value = `${width}px`;
    node.style.setProperty("box-sizing", "border-box", "important");
    node.style.setProperty("width", value, "important");
    node.style.setProperty("min-width", value, "important");
    node.style.setProperty("max-width", value, "important");
  }

  function restoreShells(): void {
    // The watch has to stop before the inline rule is written back, or the
    // release itself would look like the site hiding the column again.
    stopRevealWatch();
    if (revealShells.length > 0) {
      const reveals = revealShells;
      revealShells = [];
      for (const target of reveals) {
        restoreSnapshot(target.node, "display", target.display);
      }
    }
    if (shellTargets.length === 0) return;
    const targets = shellTargets;
    shellTargets = [];
    for (const target of targets) {
      restoreSnapshot(target.node, "width", target.width);
      restoreSnapshot(target.node, "min-width", target.minWidth);
      restoreSnapshot(target.node, "max-width", target.maxWidth);
      restoreSnapshot(target.node, "box-sizing", target.boxSizing);
    }
  }

  /**
   * Every site keeps a different wrapper around its history rows, but the
   * shape of the problem is the same: the wrapper or one of its ancestors is
   * pinned to the collapsed width and clips the labels. Walking the chain
   * above each row finds exactly those boxes, so a new platform needs no
   * hand-written selector for its shell to open completely. Only boxes that
   * hold at least two rows are stretched, which keeps an icon badge or a
   * single button from being widened by accident.
   */
  function liftContentShells(rail: HTMLElement, width: number): void {
    const view = rail.ownerDocument.defaultView;
    if (view === null) return;
    const rows = Array.from(
      rail.querySelectorAll('a[href], [role="link"], [role="treeitem"]'),
    );
    if (rows.length < 2) return;
    // A rail the peek cannot make wider than its collapsed box stays as it
    // is: revealing a column there would open the panel over a rail that
    // never grew.
    if (width <= collapsedMaxWidth) return;
    const counts = new Map<HTMLElement, number>();
    for (const row of rows) {
      for (
        let node = row.parentElement;
        node !== null && node !== rail;
        node = node.parentElement
      ) {
        if (!(node instanceof HTMLElement)) continue;
        counts.set(node, (counts.get(node) ?? 0) + 1);
      }
    }
    const seen = new Set<HTMLElement>();
    for (const target of shellTargets) seen.add(target.node);
    for (const target of revealShells) seen.add(target.node);
    let lifted = 0;
    for (const [node, count] of counts) {
      if (count < 2 || seen.has(node) || lifted >= 32) continue;
      let style = view.getComputedStyle(node);
      if (style.display === "none") {
        // ChatGPT keeps the expanded history mounted and removes its wrapper
        // with an inline display:none. No stylesheet rule can beat that, so
        // the declaration is taken away for the hover and the wrapper's own
        // display comes back. A wrapper hidden by a stylesheet is left alone:
        // it is usually a duplicate list the site never shows.
        const inline = readSnapshot(node, "display");
        if (inline.value === "") continue;
        node.style.removeProperty("display");
        style = view.getComputedStyle(node);
        if (style.display === "none") {
          restoreSnapshot(node, "display", inline);
          continue;
        }
        revealShells.push({ node, display: inline });
      }
      if (style.display === "contents" || style.display === "inline") {
        continue;
      }
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 && rect.height <= 0) continue;
      const available = shellWidthFor(rail, node, width);
      if (rect.width >= available - 2) continue;
      seen.add(node);
      lifted += 1;
      stretchShell(node, available);
    }
    if (revealShells.length > 0) watchRevealShells();
  }

  /**
   * The document observer filters on motion attributes, so it never sees a
   * style rewrite. A site that renders from its own state puts the inline
   * hidden rule back on the next render after the rail widens (ChatGPT does
   * exactly once), which would leave the panel empty. Watching the handful of
   * containers the peek re-showed costs nothing and catches that rewrite.
   */
  function watchRevealShells(): void {
    if (revealObserver !== null) revealObserver.disconnect();
    revealObserver = new MutationObserver(handleRevealMutation);
    for (const target of revealShells) {
      revealObserver.observe(target.node, {
        attributes: true,
        attributeFilter: ["style"],
      });
    }
  }

  function stopRevealWatch(): void {
    if (revealObserver !== null) {
      revealObserver.disconnect();
      revealObserver = null;
    }
    if (reliftTimer !== null) {
      clearTimeout(reliftTimer);
      reliftTimer = null;
    }
  }

  /** One re-show per task, and only while the peek still owns the rail. */
  function handleRevealMutation(): void {
    if (active === null || reliftTimer !== null) return;
    if (reliftAttempts >= SIDEBAR_PEEK_RELIFT_LIMIT) return;
    if (!revealShells.some((target) => inlineHidden(target.node))) return;
    reliftTimer = setTimeout(() => {
      reliftTimer = null;
      reliftRevealShells();
    }, 0);
  }

  function inlineHidden(node: HTMLElement): boolean {
    return node.style.getPropertyValue("display").trim() === "none";
  }

  /**
   * Re-shows the containers the site hid again. A container whose own display
   * stays hidden once the inline rule is gone is hidden by a stylesheet, so
   * its declaration is handed back and it drops out of the peek.
   */
  function reliftRevealShells(): void {
    const rail = active;
    if (rail === null || revealShells.length === 0) return;
    const view = rail.ownerDocument.defaultView;
    if (view === null) return;
    reliftAttempts += 1;
    const kept: { node: HTMLElement; display: StyleSnapshot }[] = [];
    for (const target of revealShells) {
      if (!target.node.isConnected) continue;
      if (inlineHidden(target.node)) target.node.style.removeProperty("display");
      if (view.getComputedStyle(target.node).display === "none") {
        restoreSnapshot(target.node, "display", target.display);
        continue;
      }
      kept.push(target);
    }
    revealShells = kept;
    if (kept.length === 0) {
      stopRevealWatch();
      return;
    }
    // The first pass measured every box at width 0, because the column was
    // hidden while it ran. The widths are read again against what the site
    // just painted.
    liftContentShells(rail, activePeekWidth);
    liftLabels(rail);
  }

  /**
   * A rail usually hides its labels with three or four declarations spread
   * over different wrapper levels, and each site picks its own. Rather than
   * guessing one selector per platform, the peek reads the leaf text nodes of
   * the rows it already widened and lifts only the declarations that hide
   * them. A label that is merely truncated by a narrow box is left to the
   * stretched shell; one removed from layout has to be put back.
   */
  function liftLabels(rail: HTMLElement): void {
    const view = rail.ownerDocument.defaultView;
    if (view === null) return;
    for (const row of Array.from(
      rail.querySelectorAll('a[href], [role="link"], [role="treeitem"]'),
    )) {
      const leaves = row.querySelectorAll("span, div, p");
      if (leaves.length > 12) continue;
      for (const leaf of Array.from(leaves)) {
        if (!(leaf instanceof HTMLElement)) continue;
        if (leaf.children.length > 0) continue;
        const text = (leaf.textContent ?? "").trim();
        if (text.length < 2) continue;
        if (labelTargets.some((target) => target.node === leaf)) continue;
        const style = view.getComputedStyle(leaf);
        const hidden =
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.opacity === "0" ||
          parseFloat(style.maxWidth) === 0;
        if (!hidden) continue;
        labelTargets.push({
          node: leaf,
          display: readSnapshot(leaf, "display"),
          visibility: readSnapshot(leaf, "visibility"),
          opacity: readSnapshot(leaf, "opacity"),
          maxWidth: readSnapshot(leaf, "max-width"),
        });
        if (style.display === "none") {
          leaf.style.setProperty("display", "block", "important");
        }
        leaf.style.setProperty("visibility", "visible", "important");
        leaf.style.setProperty("opacity", "1", "important");
        if (parseFloat(style.maxWidth) === 0) {
          leaf.style.setProperty("max-width", "none", "important");
        }
      }
    }
  }

  function restoreLabels(): void {
    if (labelTargets.length === 0) return;
    const targets = labelTargets;
    labelTargets = [];
    for (const target of targets) {
      restoreSnapshot(target.node, "display", target.display);
      restoreSnapshot(target.node, "visibility", target.visibility);
      restoreSnapshot(target.node, "opacity", target.opacity);
      restoreSnapshot(target.node, "max-width", target.maxWidth);
    }
  }

  function applyPeek(node: HTMLElement, adopting = false): void {
    cancelShow();
    cancelHide();
    cancelReacquire();
    if (active === node) {
      refreshPeek(node);
      return;
    }
    // A site that replaces its rail while expanding has already run its own
    // toggle. The adopted peek keeps that expansion and only takes over the
    // new node, so the panel is never toggled twice.
    const carriedExpansion = adopting && expandedByPeek;
    const carriedCollapse = adopting ? collapseTarget : null;
    releaseActive(adopting ? "adopt" : "hover");
    expandedByPeek = carriedExpansion;
    collapseTarget = carriedCollapse;
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
    activeShift = shift;
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
    reliftAttempts = 0;
    // A hold left over from the previous release would mute the menus this
    // peek is about to open, and the rail is instant again while it peeks.
    finishTransitionHold();
    // Record the page's own dialogs before the native toggle runs: a modal
    // that already covered part of the layout must never read as a menu the
    // rail just opened, or the pointer resting on it would pin the peek.
    snapshotPopovers();
    node.style.setProperty(SIDEBAR_PEEK_WIDTH_VAR, `${width}px`);
    node.style.setProperty(SIDEBAR_PEEK_SHIFT_VAR, `${shift}px`);
    node.setAttribute(SIDEBAR_PEEK_ATTRIBUTE, sideOf(node));
    liftReveal(node);
    liftInert(node);
    liftClip(node);
    liftShells(node, width);
    liftContentShells(node, width);
    liftLabels(node);
    suppressOverlap();
    if (definition?.nativeExpand !== undefined) {
      if (carriedExpansion) {
        const collapse = node.ownerDocument.querySelector(
          definition.nativeExpand.collapse,
        );
        collapseTarget = collapse instanceof HTMLElement ? collapse : null;
      } else {
        const expand = node.ownerDocument.querySelector(
          definition.nativeExpand.expand,
        );
        if (expand instanceof HTMLElement) {
          expandedByPeek = true;
          expand.click();
          const collapse = node.ownerDocument.querySelector(
            definition.nativeExpand.collapse,
          );
          collapseTarget = collapse instanceof HTMLElement ? collapse : null;
          // The site renders the opened rail on its next paint, often by
          // replacing the node the attribute was set on.
          scheduleReacquire();
        }
      }
    }
    const view = node.ownerDocument.defaultView;
    appliedHref = view?.location.href ?? "";
  }

  /**
   * Sites rebuild the rail through their own renderer after the native
   * toggle. The peek then follows the rail it still owns instead of dropping
   * the attribute: the replacement node gets the same width, the same inner
   * shells, and the same leave behaviour as the node that opened it.
   */
  function refreshPeek(node: HTMLElement): void {
    const view = node.ownerDocument.defaultView;
    if (view === null) return;
    if (node.getAttribute(SIDEBAR_PEEK_ATTRIBUTE) === null) {
      node.setAttribute(SIDEBAR_PEEK_ATTRIBUTE, sideOf(node));
    }
    node.style.setProperty(SIDEBAR_PEEK_WIDTH_VAR, `${activePeekWidth}px`);
    node.style.setProperty(SIDEBAR_PEEK_SHIFT_VAR, `${activeShift}px`);
    liftInert(node);
    liftShells(node, activePeekWidth);
    liftContentShells(node, activePeekWidth);
    liftLabels(node);
    if (appliedHref === "") appliedHref = view.location.href;
  }

  function cancelReacquire(): void {
    if (reacquireTimer !== null) {
      clearTimeout(reacquireTimer);
      reacquireTimer = null;
    }
    reacquireAttempts = 0;
  }

  function scheduleReacquire(): void {
    if (reacquireTimer !== null) return;
    reacquireTimer = setTimeout(() => {
      reacquireTimer = null;
      reacquireRail();
    }, 32);
  }

  function reacquireRail(): void {
    if (active === null) return;
    const rail = resolveRail();
    if (rail === null) {
      if (reacquireAttempts < 5) {
        reacquireAttempts += 1;
        scheduleReacquire();
        return;
      }
      releaseActive("navigation");
      return;
    }
    reacquireAttempts = 0;
    if (rail === active) {
      refreshPeek(rail);
      return;
    }
    applyPeek(rail, true);
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
      // pointer leaving the rail is not the user leaving the peek. Only a
      // menu the pointer actually entered counts.
      if (popoverUnderPointer() !== null) {
        holdForPopover(rail);
        return;
      }
      releaseActive();
    }, hideDelayMs);
  }

  /**
   * The menu the peek opened is portaled to the body, so a pointer that walks
   * off the rail and into that menu is still using the peek. Reading the
   * document under the pointer is what separates it from a dialog that lives
   * somewhere else on the page: those used to pin the peek for its whole
   * budget and made the panel look stuck.
   */
  function popoverUnderPointer(): HTMLElement | null {
    const doc = boundDocument;
    if (doc === null) return null;
    if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) return null;
    if (typeof doc.elementFromPoint !== "function") return null;
    const hit = doc.elementFromPoint(pointerX, pointerY);
    return hit instanceof Element ? popoverFor(hit) : null;
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
    // A menu the site tore down is no longer on screen, however recently it
    // was hovered. Keeping it would pin the peek to a node nobody can see.
    if (!found.isConnected) return null;
    if (isPreexistingPopover(found)) return null;
    const rail = resolvedRail;
    if (rail !== null && (rail.contains(found) || found.contains(rail))) {
      return null;
    }
    return isVisiblePopover(found, view) ? found : null;
  }

  /** Dialogs already on screen when the peek opened, i.e. the page's own. */
  function snapshotPopovers(): void {
    preexistingPopovers.clear();
    const doc = boundDocument;
    const view = doc?.defaultView ?? null;
    if (doc === null || view === null) return;
    for (const found of Array.from(doc.querySelectorAll(POPOVER_SELECTOR))) {
      if (!(found instanceof HTMLElement)) continue;
      if (!isVisiblePopover(found, view)) continue;
      preexistingPopovers.add(found);
    }
  }

  function isPreexistingPopover(node: HTMLElement): boolean {
    if (preexistingPopovers.size === 0) return false;
    for (const known of preexistingPopovers) {
      if (!known.isConnected) continue;
      if (known === node || known.contains(node)) return true;
    }
    return false;
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
      const popover = popoverUnderPointer();
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
    if (hit instanceof Element) {
      if (rail.contains(hit)) return true;
      // Gemini and Grok open through their own toggle, which sits outside the
      // rail. The pointer still rests on the control that opened the panel, so
      // the peek must not close underneath it.
      if (triggerSelector !== "" && hit.closest(triggerSelector) !== null) {
        return true;
      }
    }
    // The peek paints over nodes the rail does not own: an inner shell in a
    // sibling layer, a transparent overlay, or the blank space between two
    // rows. A miss there is the pointer crossing the panel, not leaving it,
    // so the peek's own geometry has the final say.
    return withinPeekBand(rail, pointerX, pointerY);
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
    const target = event.target;
    if (target instanceof Element) {
      const overRail = railFor(target);
      if (overRail !== null) {
        // A move that already lands on the rail is the strongest form of the
        // same intent. Waiting for pointerover loses the first approach when
        // the rail sits under a transparent overlay, when its box is zero
        // width, or when the page re-renders the rail under a resting cursor.
        if (active === overRail) cancelHide();
        else scheduleShow(overRail);
        return;
      }
    }
    if (!pointerNearEdge()) {
      cancelProbe();
      if (active !== null) requestHide(active);
      else if (pendingRail !== null) cancelShow();
      return;
    }
    scheduleProbe();
  }

  function cancelProbe(): void {
    if (probeTimer !== null) {
      clearTimeout(probeTimer);
      probeTimer = null;
    }
  }

  /**
   * An approach lands on the last move of a quick sweep, and pointer events
   * arrive faster than the probe interval. Reading only the moves that pass
   * the interval drops exactly the position the cursor stopped at, so a
   * throttled move arms one trailing probe that reads where it actually
   * rests. The interval still bounds layout reads on a swept cursor.
   */
  function scheduleProbe(): void {
    const now = performance.now();
    const wait = lastProbeMs + POINTER_PROBE_INTERVAL_MS - now;
    if (wait > 0) {
      if (probeTimer === null) {
        probeTimer = setTimeout(() => {
          probeTimer = null;
          runProbe();
        }, wait);
      }
      return;
    }
    runProbe();
  }

  /** Re-answer "is the pointer on the peek" for the position it rests at. */
  function runProbe(): void {
    lastProbeMs = performance.now();
    if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) return;
    // A pointer that wandered into the middle of the page is no longer a
    // hovered rail, whether the peek is open or still pending.
    if (!pointerNearEdge()) {
      if (active !== null) requestHide(active);
      else if (pendingRail !== null) cancelShow();
      return;
    }
    const open = active;
    if (open !== null) {
      // Sites fire no pointerout when the pointer crosses an inner gap, so
      // state corrected only on pointerout stays wrong until something else
      // happens. The probe owns that correction.
      if (pointerStillOverRail(open)) {
        cancelHide();
        return;
      }
      if (popoverUnderPointer() !== null) {
        holdForPopover(open);
        return;
      }
      requestHide(open);
      return;
    }
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

  /**
   * Leaving the window fires no pointerout on the rail, so a peek left under
   * the cursor would stay open until the pointer came back. The document's
   * own leave event is the signal that the hover really ended, and dropping
   * the remembered position keeps the hide check from reading a stale point.
   */
  function handlePointerLeave(event: Event): void {
    if (!isMousePointer(event)) return;
    pointerX = Number.NaN;
    pointerY = Number.NaN;
    cancelProbe();
    cancelShow();
    if (active !== null) scheduleHide(active);
  }

  /** Arm the leave grace period once; pointer moves must not push it forward. */
  function requestHide(rail: HTMLElement): void {
    if (hideTimer !== null) return;
    scheduleHide(rail);
  }

  /**
   * A history row is a link on some sites and a plain button on others, but
   * either way the page swaps the transcript under the pointer. The peek
   * retires on that press so the panel is gone before the next route paints;
   * waiting for the route observer leaves the old rail covering the new
   * conversation for a quarter of a second. Controls that open a menu,
   * dialog, or editor keep the peek, because the user is still working in
   * the panel that was just revealed.
   */
  function handleClick(event: Event): void {
    const rail = active;
    if (rail === null) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!rail.contains(target)) return;
    if (keepsPeek(target)) return;
    const anchor = target.closest("a[href]");
    const view = rail.ownerDocument.defaultView;
    if (view !== null && anchor instanceof HTMLAnchorElement) {
      if (anchor.href === view.location.href) return;
    }
    releaseActive("navigation");
  }

  /**
   * A press that starts something the rail must stay open for: a menu or
   * dialog trigger, a text field, or the site's own expand and collapse
   * controls. Releasing on those would either close the menu that is opening
   * or toggle the panel twice, once by the site and once by the peek.
   */
  function keepsPeek(target: Element): boolean {
    if (
      target.closest(
        'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="menu"], [role="dialog"], [aria-haspopup], [aria-expanded]',
      ) !== null
    ) {
      return true;
    }
    const nativeExpand = definition?.nativeExpand;
    if (nativeExpand !== undefined) {
      for (const selector of [nativeExpand.expand, nativeExpand.collapse]) {
        if (target.closest(selector) !== null) return true;
      }
    }
    if (collapseTarget !== null && collapseTarget.contains(target)) {
      return true;
    }
    return false;
  }

  /** A route change invalidates every timer and the collapsed state it assumed. */
  function handleNavigation(): void {
    cancelShow();
    if (active !== null) releaseActive("navigation");
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
    if (!node.isConnected) {
      // The native toggle often renders a replacement rail. Follow it while
      // the pointer still rests where the peek was asked for; a rail removed
      // by a route change is not re-adopted because the peek has already let
      // go of that navigation.
      if (expandedByPeek && pointerNearEdge()) {
        scheduleReacquire();
        return;
      }
      releaseActive("navigation");
      return;
    }
    const view = node.ownerDocument.defaultView;
    if (appliedHref !== "" && view !== null && view.location.href !== appliedHref) {
      // A pushState route change arrives here before any hover event can, so
      // the peek retires against the rail it opened instead of the new one.
      releaseActive("navigation");
      return;
    }
    rescanNeeded = true;
    // A renderer can rewrite the rail's inline style and attributes while the
    // panel it expanded stays on screen. Re-declaring the peek here keeps the
    // attribute and the width in step with what the user sees.
    if (node.getAttribute(SIDEBAR_PEEK_ATTRIBUTE) === null) {
      refreshPeek(node);
    }
    if (expandedByPeek) return;
    if (hasExpandedToken(node)) releaseActive();
  }

  /** Whether the last pointer position still points at an edge rail lane. */
  function pointerNearEdge(): boolean {
    if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) return false;
    const doc = boundDocument;
    if (doc === null) return false;
    const viewport =
      doc.documentElement.clientWidth || doc.defaultView?.innerWidth || 0;
    if (viewport <= 0) return false;
    const band = Math.max(
      120,
      collapsedMaxWidth + SIDEBAR_PEEK_PROXIMITY_PX,
      SIDEBAR_PEEK_LANE_PX + SIDEBAR_PEEK_PROXIMITY_PX,
    );
    return pointerX <= band || pointerX >= viewport - band;
  }

  function bind(doc: Document): void {
    if (boundDocument === doc) return;
    teardown();
    if (!hasRail) return;
    boundDocument = doc;
    doc.addEventListener("pointerover", handlePointerOver);
    doc.addEventListener("pointermove", handlePointerMove);
    doc.addEventListener("pointerout", handlePointerOut);
    doc.addEventListener("pointerleave", handlePointerLeave);
    doc.addEventListener("pointerdown", handlePointerDown);
    doc.addEventListener("focusin", handleFocusIn);
    doc.addEventListener("keydown", handleKeyDown);
    doc.addEventListener("click", handleClick, true);
    const win = doc.defaultView;
    if (win !== null) {
      win.addEventListener("popstate", handleNavigation);
      win.addEventListener("hashchange", handleNavigation);
    }
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
    cancelNativeCollapse();
    releaseActive("lifecycle");
    releaseTransitions();
    finishTransitionHold();
    stopRevealWatch();
    if (observer !== null) {
      observer.disconnect();
      observer = null;
    }
    if (boundDocument !== null) {
      boundDocument.removeEventListener("pointerover", handlePointerOver);
      boundDocument.removeEventListener("pointermove", handlePointerMove);
      boundDocument.removeEventListener("pointerout", handlePointerOut);
      boundDocument.removeEventListener("pointerleave", handlePointerLeave);
      boundDocument.removeEventListener("pointerdown", handlePointerDown);
      boundDocument.removeEventListener("focusin", handleFocusIn);
      boundDocument.removeEventListener("keydown", handleKeyDown);
      boundDocument.removeEventListener("click", handleClick, true);
      const win = boundDocument.defaultView;
      if (win !== null) {
        win.removeEventListener("popstate", handleNavigation);
        win.removeEventListener("hashchange", handleNavigation);
      }
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
