const FALLBACK_GAP_EM = 0.35;
const DEFAULT_FONT_SIZE_PX = 16;
const MIN_SHIFT_PX = 0.5;
const POSITION_OFFSET_PROPERTIES = ["top", "right", "bottom", "left"] as const;
const NO_TRANSLATE_VALUES: ReadonlySet<string> = new Set([
  "",
  "none",
  "initial",
  "inherit",
  "unset",
  "revert",
  "revert-layer",
]);

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

function isPositiveMargin(raw: string): boolean {
  const value = raw.trim();
  if (value.length === 0) return false;
  if (value.toLowerCase() === "auto") return true;
  const parsed = Number.parseFloat(value);
  // An unparsable margin still occupies space, so treat it as present.
  return Number.isFinite(parsed) ? parsed > 0 : true;
}

/**
 * Logical and physical margins can disagree (logical properties are not always
 * reflected), so a side counts as spaced when either form is positive.
 */
function hasPositiveMargin(
  style: CSSStyleDeclaration | null,
  logicalProperty: string,
  physicalProperty: string,
): boolean {
  if (style === null) return false;
  return (
    isPositiveMargin(style.getPropertyValue(logicalProperty)) ||
    isPositiveMargin(style.getPropertyValue(physicalProperty))
  );
}

/**
 * Flex and grid bars already lay their children out in order. Keeping the
 * injected button at its natural width and adding a little breathing room
 * forces the controls before it to move over instead of sharing the same gap.
 */
function reserveFlexSpace(
  button: HTMLElement,
  parentStyle: CSSStyleDeclaration | null,
  anchorStyle: CSSStyleDeclaration,
): void {
  button.style.setProperty("flex-grow", "0");
  button.style.setProperty("flex-shrink", "0");
  button.style.setProperty("flex-basis", "auto");

  const gap = readPx(parentStyle, "column-gap") ?? readPx(parentStyle, "gap");
  if (gap !== null && gap > 0) return;

  const buttonStyle = computedStyleOf(button);
  const space = formatPx(fallbackGapPx(anchorStyle));
  const hasLeftGap = hasPositiveMargin(
    buttonStyle,
    "margin-inline-start",
    "margin-left",
  );
  if (!hasLeftGap) button.style.setProperty("margin-inline-start", space);

  // The clone can lose an ID- or data-* selector's margin, so inspect the
  // button's own end margin as well as the anchor's leading margin.
  const hasRightGap =
    hasPositiveMargin(anchorStyle, "margin-inline-start", "margin-left") ||
    hasPositiveMargin(buttonStyle, "margin-inline-end", "margin-right");
  if (!hasRightGap) button.style.setProperty("margin-inline-end", space);
}

function splitComponentValues(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (const character of value) {
    if (character === "(") depth += 1;
    else if (character === ")") depth = Math.max(0, depth - 1);
    if (/\s/u.test(character) && depth === 0) {
      if (current.length > 0) {
        parts.push(current);
        current = "";
      }
      continue;
    }
    current += character;
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

/**
 * The measured rectangle already includes any existing translation. Compose
 * the new shift into that value instead of replacing it.
 */
function composeShiftedTranslate(
  style: CSSStyleDeclaration | null,
  deltaPx: number,
): string {
  const raw = style?.getPropertyValue("translate").trim() ?? "";
  const parts = NO_TRANSLATE_VALUES.has(raw.toLowerCase())
    ? []
    : splitComponentValues(raw);
  if (parts.length === 0) return `${formatPx(-deltaPx)} 0`;

  const x = parts[0] === "0" ? "0px" : parts[0];
  const y = parts[1] ?? "0";
  const z = parts[2];
  const shiftedX = `calc(${x} - ${formatPx(deltaPx)})`;
  return z === undefined ? `${shiftedX} ${y}` : `${shiftedX} ${y} ${z}`;
}

function copyAnchorOffsets(
  anchorStyle: CSSStyleDeclaration,
  button: HTMLElement,
  snapshots: StyleSnapshot[],
): void {
  const buttonStyle = computedStyleOf(button);
  if (buttonStyle === null) return;
  for (const property of POSITION_OFFSET_PROPERTIES) {
    const value = anchorStyle.getPropertyValue(property).trim();
    if (value.length === 0 || value === "auto") continue;
    if (buttonStyle.getPropertyValue(property).trim() === value) continue;
    captureStyle(snapshots, button, property);
    button.style.setProperty(property, value);
  }
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
  anchorStyle: CSSStyleDeclaration,
  snapshots: StyleSnapshot[],
): void {
  const buttonStyle = computedStyleOf(button);
  if (buttonStyle === null) return;
  if (buttonStyle.getPropertyValue("position").trim() === "static") {
    captureStyle(snapshots, button, "position");
    button.style.setProperty("position", anchorStyle.getPropertyValue("position").trim());
  }
  copyAnchorOffsets(anchorStyle, button, snapshots);

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
    button.style.setProperty("translate", composeShiftedTranslate(buttonStyle, shiftPx));
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
    const siblingStyle = computedStyleOf(sibling);
    captureStyle(snapshots, sibling, "translate");
    sibling.style.setProperty(
      "translate",
      composeShiftedTranslate(siblingStyle, deltaPx),
    );
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
