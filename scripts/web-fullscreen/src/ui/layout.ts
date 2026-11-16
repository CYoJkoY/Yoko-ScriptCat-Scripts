const FALLBACK_GAP_EM = 0.35;
const DEFAULT_FONT_SIZE_PX = 16;
const MIN_SHIFT_PX = 0.5;

const FLEX_OR_GRID_DISPLAYS: ReadonlySet<string> = new Set([
  "flex",
  "inline-flex",
  "grid",
  "inline-grid",
]);

interface StyleSnapshot {
  readonly element: HTMLElement;
  readonly property: string;
  readonly value: string;
  readonly priority: string;
}

function formatPx(value: number): string {
  return `${Math.round(value * 100) / 100}px`;
}

function readPx(
  style: CSSStyleDeclaration | null,
  property: string,
): number | null {
  if (style === null) return null;
  const raw = style.getPropertyValue(property).trim();
  if (raw.length === 0) return null;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function computedStyleOf(element: HTMLElement): CSSStyleDeclaration | null {
  return element.ownerDocument.defaultView?.getComputedStyle(element) ?? null;
}

function isRtl(style: CSSStyleDeclaration | null): boolean {
  if (style === null) return false;
  return style.getPropertyValue("direction").trim().toLowerCase() === "rtl";
}

function isHtmlElement(element: Element | null): element is HTMLElement {
  if (element === null) return false;
  const view = element.ownerDocument.defaultView;
  return view !== null && element instanceof view.HTMLElement;
}

function captureStyle(
  snapshots: StyleSnapshot[],
  element: HTMLElement,
  property: string,
): void {
  if (
    snapshots.some(
      (snapshot) =>
        snapshot.element === element && snapshot.property === property,
    )
  ) {
    return;
  }
  snapshots.push({
    element,
    property,
    value: element.style.getPropertyValue(property),
    priority: element.style.getPropertyPriority(property),
  });
}

function restoreStyles(snapshots: readonly StyleSnapshot[]): void {
  for (let index = snapshots.length - 1; index >= 0; index -= 1) {
    const snapshot = snapshots[index];
    if (snapshot === undefined) continue;
    if (snapshot.value.length === 0) {
      snapshot.element.style.removeProperty(snapshot.property);
      continue;
    }
    snapshot.element.style.setProperty(
      snapshot.property,
      snapshot.value,
      snapshot.priority,
    );
  }
}

function fallbackGapPx(anchorStyle: CSSStyleDeclaration | null): number {
  const fontSize = readPx(anchorStyle, "font-size") ?? DEFAULT_FONT_SIZE_PX;
  if (!(fontSize > 0)) return DEFAULT_FONT_SIZE_PX * FALLBACK_GAP_EM;
  return fontSize * FALLBACK_GAP_EM;
}

function resolveSpacePx(
  parentStyle: CSSStyleDeclaration | null,
  anchorStyle: CSSStyleDeclaration | null,
): number {
  const gap = readPx(parentStyle, "column-gap") ?? readPx(parentStyle, "gap");
  if (gap !== null && gap > 0) return gap;
  return fallbackGapPx(anchorStyle);
}

function hasInlineStartMargin(anchorStyle: CSSStyleDeclaration | null): boolean {
  const logical = readPx(anchorStyle, "margin-inline-start");
  if (logical !== null && logical > 0) return true;
  const physical = readPx(anchorStyle, "margin-left");
  return physical !== null && physical > 0;
}

/**
 * Flex and grid bars already lay their children out in order. Keeping the
 * injected button at its natural width and adding a little breathing room
 * forces the controls before it to move over instead of sharing the same gap.
 */
function reserveFlexSpace(
  button: HTMLElement,
  parentStyle: CSSStyleDeclaration | null,
  anchorStyle: CSSStyleDeclaration | null,
): void {
  button.style.setProperty("flex-grow", "0");
  button.style.setProperty("flex-shrink", "0");
  button.style.setProperty("flex-basis", "auto");

  if (hasInlineStartMargin(anchorStyle)) return;
  const gap = readPx(parentStyle, "column-gap") ?? readPx(parentStyle, "gap");
  if (gap !== null && gap > 0) return;

  const space = formatPx(fallbackGapPx(anchorStyle));
  button.style.setProperty("margin-inline-start", space);
  button.style.setProperty("margin-inline-end", space);
}

/**
 * Absolutely positioned control clusters do not participate in normal flow,
 * so a new sibling would cover the control to its left. Shift the button into
 * the anchor's gap, then move every preceding control by the same amount to
 * keep their original spacing intact.
 */
function shiftAbsoluteCluster(
  anchor: HTMLElement,
  button: HTMLElement,
  parentStyle: CSSStyleDeclaration | null,
  anchorStyle: CSSStyleDeclaration | null,
  snapshots: StyleSnapshot[],
): void {
  const buttonStyle = computedStyleOf(button);
  if (buttonStyle === null) return;
  if (buttonStyle.getPropertyValue("position").trim() === "static") {
    captureStyle(snapshots, button, "position");
    button.style.setProperty(
      "position",
      anchorStyle?.getPropertyValue("position").trim() ?? "absolute",
    );
  }

  const anchorRect = anchor.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();
  if (
    anchorRect.width <= 0 ||
    anchorRect.height <= 0 ||
    buttonRect.width <= 0 ||
    buttonRect.height <= 0
  ) {
    return;
  }

  const spacePx = resolveSpacePx(parentStyle, anchorStyle);
  const shiftPx = buttonRect.right - (anchorRect.left - spacePx);
  let shiftedLeft = buttonRect.left;
  if (shiftPx > MIN_SHIFT_PX) {
    captureStyle(snapshots, button, "translate");
    button.style.setProperty("translate", `${formatPx(-shiftPx)} 0`);
    shiftedLeft -= shiftPx;
  }

  const allowedRight = shiftedLeft - spacePx;
  const siblings: HTMLElement[] = [];
  let deltaPx = 0;

  for (
    let sibling = button.previousElementSibling;
    sibling !== null;
    sibling = sibling.previousElementSibling
  ) {
    if (!isHtmlElement(sibling)) continue;
    const rect = sibling.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (rect.bottom <= anchorRect.top || rect.top >= anchorRect.bottom) continue;
    siblings.push(sibling);
    deltaPx = Math.max(deltaPx, rect.right - allowedRight);
  }

  if (deltaPx <= MIN_SHIFT_PX) return;
  for (const sibling of siblings) {
    captureStyle(snapshots, sibling, "translate");
    sibling.style.setProperty("translate", `${formatPx(-deltaPx)} 0`);
  }
}

/**
 * Give the injected button its own room in front of the native fullscreen
 * control. Returns a cleanup that restores every site-owned inline value.
 */
export function fitInControlBar(
  anchor: HTMLElement,
  button: HTMLElement,
): () => void {
  button.style.setProperty("box-sizing", "border-box");

  const parent = anchor.parentElement;
  if (parent === null || parent !== button.parentElement) {
    return (): void => undefined;
  }

  const anchorStyle = computedStyleOf(anchor);
  if (anchorStyle === null) return (): void => undefined;
  const parentStyle = computedStyleOf(parent);

  const snapshots: StyleSnapshot[] = [];
  const position = anchorStyle.getPropertyValue("position").trim();
  const absolute = position === "absolute" || position === "fixed";

  if (absolute && !isRtl(anchorStyle) && !isRtl(parentStyle)) {
    shiftAbsoluteCluster(anchor, button, parentStyle, anchorStyle, snapshots);
  } else if (
    parentStyle !== null &&
    FLEX_OR_GRID_DISPLAYS.has(
      parentStyle.getPropertyValue("display").trim().toLowerCase(),
    )
  ) {
    reserveFlexSpace(button, parentStyle, anchorStyle);
  }

  if (snapshots.length === 0) return (): void => undefined;
  return (): void => {
    restoreStyles(snapshots);
  };
}
