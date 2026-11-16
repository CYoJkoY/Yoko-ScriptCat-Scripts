const FALLBACK_GAP_EM = 0.35;
const DEFAULT_FONT_SIZE_PX = 16;
const MIN_SHIFT_PX = 0.5;
const MIN_TRANSFORM_SCALE = 0.05;
const MAX_LOCAL_SHIFT_RATIO = 1 / MIN_TRANSFORM_SCALE;
const MIN_APPLIED_SHIFT_PX = 0.005;
const LAYOUT_EPSILON_PX = 0.5;
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

type StyledElement = HTMLElement | SVGElement;

interface StyleSnapshot {
  readonly element: StyledElement;
  readonly property: string;
  readonly value: string;
  readonly priority: string;
}

interface OwnedPropertyValue {
  readonly value: string;
  readonly priority: string;
}

interface OwnedStyle {
  readonly attribute: string;
  readonly values: Map<string, OwnedPropertyValue>;
}

interface TransformAxes {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
}

interface LocalShift {
  readonly x: number;
  readonly y: number;
}

const IDENTITY_AXES: TransformAxes = { a: 1, b: 0, c: 0, d: 1 };

interface LayoutBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface ControlBarFit {
  /** Re-apply the fit when the anchor's layout box moved or resized. */
  sync(): void;
  /** Re-apply the fit when surrounding controls changed without moving the anchor. */
  refit(): void;
  /** Whether this fit currently owns an inline style on the element. */
  ownsStyleOf(element: Element): boolean;
  /** Restore every site-owned inline value. */
  dispose(): void;
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

function computedStyleOf(element: Element): CSSStyleDeclaration | null {
  return element.ownerDocument.defaultView?.getComputedStyle(element) ?? null;
}

function layoutBoxOf(element: HTMLElement): LayoutBox {
  return {
    left: element.offsetLeft,
    top: element.offsetTop,
    width: element.offsetWidth,
    height: element.offsetHeight,
  };
}

function isSameLayoutBox(left: LayoutBox, right: LayoutBox): boolean {
  return (
    Math.abs(left.left - right.left) < LAYOUT_EPSILON_PX &&
    Math.abs(left.top - right.top) < LAYOUT_EPSILON_PX &&
    Math.abs(left.width - right.width) < LAYOUT_EPSILON_PX &&
    Math.abs(left.height - right.height) < LAYOUT_EPSILON_PX
  );
}

function isRtl(style: CSSStyleDeclaration | null): boolean {
  if (style === null) return false;
  return style.getPropertyValue("direction").trim().toLowerCase() === "rtl";
}

function isStyledElement(element: Element | null): element is StyledElement {
  if (element === null) return false;
  const view = element.ownerDocument.defaultView;
  if (view === null) return false;
  return element instanceof view.HTMLElement || element instanceof view.SVGElement;
}

function captureStyle(
  snapshots: StyleSnapshot[],
  element: StyledElement,
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

function rebaseSiteChangedProperties(
  snapshots: StyleSnapshot[],
  ownedStyles: ReadonlyMap<Element, OwnedStyle>,
): void {
  for (let index = 0; index < snapshots.length; index += 1) {
    const snapshot = snapshots[index];
    if (snapshot === undefined) continue;
    const owned = ownedStyles.get(snapshot.element);
    if (owned === undefined) continue;
    if (
      (snapshot.element.getAttribute("style") ?? "") === owned.attribute
    ) {
      continue;
    }
    const ownedValue = owned.values.get(snapshot.property);
    if (ownedValue === undefined) continue;
    const currentValue = snapshot.element.style.getPropertyValue(
      snapshot.property,
    );
    const currentPriority = snapshot.element.style.getPropertyPriority(
      snapshot.property,
    );
    if (
      currentValue === ownedValue.value &&
      currentPriority === ownedValue.priority
    ) {
      continue;
    }
    snapshots[index] = {
      ...snapshot,
      value: currentValue,
      priority: currentPriority,
    };
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

interface MarginSide {
  readonly logical: string;
  readonly physical: string;
}

/**
 * Logical and physical margins can disagree (logical properties are not always
 * reflected), so a side counts as spaced when either form is positive.
 */
function hasPositiveMargin(
  style: CSSStyleDeclaration | null,
  side: MarginSide,
): boolean {
  if (style === null) return false;
  return (
    isPositiveMargin(style.getPropertyValue(side.logical)) ||
    isPositiveMargin(style.getPropertyValue(side.physical))
  );
}

type MainAxisOrientation = "block" | "inline";

interface FlexMainAxis {
  readonly orientation: MainAxisOrientation;
  readonly reversed: boolean;
}

function resolveMainAxis(parentStyle: CSSStyleDeclaration | null): FlexMainAxis {
  if (parentStyle === null) return { orientation: "inline", reversed: false };
  const display = parentStyle.getPropertyValue("display").trim().toLowerCase();
  if (display === "flex" || display === "inline-flex") {
    const direction = parentStyle
      .getPropertyValue("flex-direction")
      .trim()
      .toLowerCase();
    return {
      orientation: direction.startsWith("column") ? "block" : "inline",
      reversed: direction.endsWith("-reverse"),
    };
  }
  if (display === "grid" || display === "inline-grid") {
    const block = parentStyle
      .getPropertyValue("grid-auto-flow")
      .trim()
      .toLowerCase()
      .split(/\s+/u)
      .includes("column");
    return { orientation: block ? "block" : "inline", reversed: false };
  }
  return { orientation: "inline", reversed: false };
}

function marginSidesFor(
  orientation: MainAxisOrientation,
  style: CSSStyleDeclaration | null,
): { readonly start: MarginSide; readonly end: MarginSide } {
  if (orientation === "block") {
    return {
      start: { logical: "margin-block-start", physical: "margin-top" },
      end: { logical: "margin-block-end", physical: "margin-bottom" },
    };
  }
  const rtl = isRtl(style);
  return {
    start: {
      logical: "margin-inline-start",
      physical: rtl ? "margin-right" : "margin-left",
    },
    end: {
      logical: "margin-inline-end",
      physical: rtl ? "margin-left" : "margin-right",
    },
  };
}

function resolveMainAxisGap(
  parentStyle: CSSStyleDeclaration | null,
  orientation: MainAxisOrientation,
): number | null {
  return orientation === "block"
    ? readPx(parentStyle, "row-gap") ?? readPx(parentStyle, "gap")
    : readPx(parentStyle, "column-gap") ?? readPx(parentStyle, "gap");
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
  snapshots: StyleSnapshot[],
): void {
  captureStyle(snapshots, button, "flex-grow");
  captureStyle(snapshots, button, "flex-shrink");
  captureStyle(snapshots, button, "flex-basis");
  button.style.setProperty("flex-grow", "0");
  button.style.setProperty("flex-shrink", "0");
  button.style.setProperty("flex-basis", "auto");

  const axis = resolveMainAxis(parentStyle);
  const gap = resolveMainAxisGap(parentStyle, axis.orientation);
  if (gap !== null && gap > 0) return;

  const buttonStyle = computedStyleOf(button);
  const space = formatPx(fallbackGapPx(anchorStyle));
  const buttonSides = marginSidesFor(axis.orientation, buttonStyle);
  const anchorSides = marginSidesFor(axis.orientation, anchorStyle);
  const precedingButtonSide = axis.reversed
    ? buttonSides.end
    : buttonSides.start;
  const anchorFacingButtonSide = axis.reversed
    ? buttonSides.start
    : buttonSides.end;
  const buttonFacingAnchorSide = axis.reversed
    ? anchorSides.end
    : anchorSides.start;

  if (!hasPositiveMargin(buttonStyle, precedingButtonSide)) {
    captureStyle(snapshots, button, precedingButtonSide.logical);
    button.style.setProperty(precedingButtonSide.logical, space);
  }

  // The clone can lose an ID- or data-* selector's margin, so inspect the
  // button's anchor-facing margin as well as the anchor's button-facing margin.
  const hasAnchorGap =
    hasPositiveMargin(anchorStyle, buttonFacingAnchorSide) ||
    hasPositiveMargin(buttonStyle, anchorFacingButtonSide);
  if (!hasAnchorGap) {
    captureStyle(snapshots, button, anchorFacingButtonSide.logical);
    button.style.setProperty(anchorFacingButtonSide.logical, space);
  }
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

function composeShiftedComponent(base: string, deltaPx: number): string {
  if (Math.abs(deltaPx) < MIN_APPLIED_SHIFT_PX) return base;
  const operator = deltaPx < 0 ? "-" : "+";
  return `calc(${base} ${operator} ${formatPx(Math.abs(deltaPx))})`;
}

/**
 * The measured rectangle already includes any existing translation. Compose
 * the new local shift into that value instead of replacing it.
 */
function composeShiftedTranslate(
  style: CSSStyleDeclaration | null,
  shift: LocalShift,
): string | null {
  if (
    Math.abs(shift.x) < MIN_APPLIED_SHIFT_PX &&
    Math.abs(shift.y) < MIN_APPLIED_SHIFT_PX
  ) {
    return null;
  }
  const raw = style?.getPropertyValue("translate").trim() ?? "";
  const parts = NO_TRANSLATE_VALUES.has(raw.toLowerCase())
    ? []
    : splitComponentValues(raw);
  if (parts.length === 0) {
    if (Math.abs(shift.y) < MIN_APPLIED_SHIFT_PX) {
      return `${formatPx(shift.x)} 0`;
    }
    return `${formatPx(shift.x)} ${formatPx(shift.y)}`;
  }

  const x = parts[0] === "0" ? "0px" : (parts[0] ?? "0px");
  const y = parts[1] ?? "0";
  const z = parts[2];
  const shifted = `${composeShiftedComponent(x, shift.x)} ${composeShiftedComponent(y, shift.y)}`;
  return z === undefined ? shifted : `${shifted} ${z}`;
}

function angleRadiansOf(raw: string): number | null {
  const match = /^(-?(?:\d+\.?\d*|\.\d+))(deg|grad|rad|turn)?$/iu.exec(raw.trim());
  if (match === null) return null;
  const value = Number.parseFloat(match[1] ?? "");
  if (!Number.isFinite(value)) return null;
  switch ((match[2] ?? "deg").toLowerCase()) {
    case "grad":
      return (value * Math.PI) / 200;
    case "rad":
      return value;
    case "turn":
      return value * Math.PI * 2;
    case "deg":
      return (value * Math.PI) / 180;
    default:
      return null;
  }
}

/**
 * Browsers expose the resolved transform as a matrix; the plain function forms
 * keep the calculation correct where computed transforms are not resolved.
 */
function transformPropertyAxesOf(
  style: CSSStyleDeclaration | null,
): TransformAxes {
  const raw = style?.getPropertyValue("transform").trim() ?? "";
  if (raw.length === 0 || raw.toLowerCase() === "none") return IDENTITY_AXES;

  const matrix = /^matrix(3d)?\(([^)]*)\)$/iu.exec(raw);
  if (matrix !== null) {
    const parts = (matrix[2] ?? "")
      .split(",")
      .map((part) => Number.parseFloat(part));
    const threeD = matrix[1] !== undefined;
    const a = parts[0];
    const b = parts[1];
    const c = parts[threeD ? 4 : 2];
    const d = parts[threeD ? 5 : 3];
    if (
      a === undefined ||
      b === undefined ||
      c === undefined ||
      d === undefined
    ) {
      return IDENTITY_AXES;
    }
    const finite =
      Number.isFinite(a) &&
      Number.isFinite(b) &&
      Number.isFinite(c) &&
      Number.isFinite(d);
    return finite ? { a, b, c, d } : IDENTITY_AXES;
  }

  const scale = /^scale\(([^)]*)\)$/iu.exec(raw);
  if (scale !== null) {
    const [rawX, rawY] = (scale[1] ?? "").split(",");
    const a = Number.parseFloat(rawX ?? "");
    const d = rawY === undefined ? a : Number.parseFloat(rawY);
    return Number.isFinite(a) && Number.isFinite(d)
      ? { a, b: 0, c: 0, d }
      : IDENTITY_AXES;
  }

  const scaleX = /^scaleX\(([^)]*)\)$/iu.exec(raw);
  if (scaleX !== null) {
    const a = Number.parseFloat(scaleX[1] ?? "");
    return Number.isFinite(a) ? { a, b: 0, c: 0, d: 1 } : IDENTITY_AXES;
  }

  const rotate = /^rotate(?:Z)?\(([^)]*)\)$/iu.exec(raw);
  if (rotate === null) return IDENTITY_AXES;
  const angle = angleRadiansOf(rotate[1] ?? "");
  if (angle === null) return IDENTITY_AXES;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return { a: cosine, b: sine, c: -sine, d: cosine };
}

function multiplyAxes(left: TransformAxes, right: TransformAxes): TransformAxes {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
  };
}

function individualRotateAxesOf(
  style: CSSStyleDeclaration | null,
): TransformAxes {
  const raw = style?.getPropertyValue("rotate").trim() ?? "";
  if (raw.length === 0 || raw.toLowerCase() === "none") return IDENTITY_AXES;
  const parts = splitComponentValues(raw);
  const angleRaw =
    parts.length === 1
      ? parts[0]
      : parts.length === 2 && parts[0]?.toLowerCase() === "z"
        ? parts[1]
        : null;
  const angle = angleRaw === undefined || angleRaw === null
    ? null
    : angleRadiansOf(angleRaw);
  if (angle === null) return IDENTITY_AXES;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return { a: cosine, b: sine, c: -sine, d: cosine };
}

function individualScaleAxesOf(
  style: CSSStyleDeclaration | null,
): TransformAxes {
  const raw = style?.getPropertyValue("scale").trim() ?? "";
  if (raw.length === 0 || raw.toLowerCase() === "none") return IDENTITY_AXES;
  const parts = splitComponentValues(raw);
  const x = Number.parseFloat(parts[0] ?? "");
  const y = parts[1] === undefined ? x : Number.parseFloat(parts[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return IDENTITY_AXES;
  return { a: x, b: 0, c: 0, d: y };
}

/**
 * Individual rotate and scale properties are applied before `transform`.
 * Include them so a longhand-scaled or rotated control gets the same local
 * delta as one using the shorthand.
 */
function transformAxesOf(style: CSSStyleDeclaration | null): TransformAxes {
  const rotate = individualRotateAxesOf(style);
  const scale = individualScaleAxesOf(style);
  const transform = transformPropertyAxesOf(style);
  return multiplyAxes(transform, multiplyAxes(scale, rotate));
}

/**
 * A local translation is transformed by the element's own matrix and then by
 * every ancestor's matrix. Fold both into one linear transform before undoing
 * the measured screen-space shift.
 */
function combinedTransformAxesOf(element: StyledElement): TransformAxes {
  let axes = transformAxesOf(computedStyleOf(element));
  for (
    let ancestor = element.parentElement;
    ancestor !== null;
    ancestor = ancestor.parentElement
  ) {
    axes = multiplyAxes(transformAxesOf(computedStyleOf(ancestor)), axes);
  }
  return axes;
}

/**
 * `translate` is applied before the element's own `transform`, so the local
 * delta is the screen-space shift pulled back through the inverse linear
 * transform. A rotated control then moves along its own axes instead of
 * turning the requested horizontal shift into vertical movement.
 */
function localShiftFor(
  element: StyledElement,
  screenShiftPx: number,
): LocalShift | null {
  const axes = combinedTransformAxesOf(element);
  const det = axes.a * axes.d - axes.b * axes.c;
  if (Math.abs(det) < MIN_TRANSFORM_SCALE * MIN_TRANSFORM_SCALE) return null;

  const x = (-screenShiftPx * axes.d) / det;
  const y = (screenShiftPx * axes.b) / det;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  // A near-singular matrix would demand an absurd local distance; leaving the
  // control in place is better than flinging it across the bar.
  const limit = Math.abs(screenShiftPx) * MAX_LOCAL_SHIFT_RATIO;
  if (Math.abs(x) > limit || Math.abs(y) > limit) return null;
  return { x, y };
}

function copyBoxSizing(
  anchorStyle: CSSStyleDeclaration,
  button: HTMLElement,
  snapshots: StyleSnapshot[],
): void {
  const value = anchorStyle.getPropertyValue("box-sizing").trim();
  if (value.length === 0) return;
  captureStyle(snapshots, button, "box-sizing");
  button.style.setProperty("box-sizing", value);
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
  // The clone keeps the anchor's classes, so a shared rule can leave it
  // `relative` while an ID rule positions the anchor absolutely. Copying the
  // insets onto a flow-positioned clone would offset it from its own place
  // instead of from the anchor, so the positioning mode must match first.
  const anchorPosition = anchorStyle.getPropertyValue("position").trim();
  if (
    anchorPosition.length > 0 &&
    buttonStyle.getPropertyValue("position").trim() !== anchorPosition
  ) {
    captureStyle(snapshots, button, "position");
    button.style.setProperty("position", anchorPosition);
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
    const shift = localShiftFor(button, shiftPx);
    const translate =
      shift === null ? null : composeShiftedTranslate(buttonStyle, shift);
    if (translate !== null) {
      captureStyle(snapshots, button, "translate");
      button.style.setProperty("translate", translate);
      shiftedLeft -= shiftPx;
    }
  }

  const allowedRight = shiftedLeft - spacePx;
  const siblings: StyledElement[] = [];
  let deltaPx = 0;

  for (
    let sibling = button.previousElementSibling;
    sibling !== null;
    sibling = sibling.previousElementSibling
  ) {
    if (!isStyledElement(sibling)) continue;
    const rect = sibling.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (rect.bottom <= anchorRect.top || rect.top >= anchorRect.bottom) continue;
    siblings.push(sibling);
    deltaPx = Math.max(deltaPx, rect.right - allowedRight);
  }

  if (deltaPx <= MIN_SHIFT_PX) return;
  for (const sibling of siblings) {
    const siblingStyle = computedStyleOf(sibling);
    const shift = localShiftFor(sibling, deltaPx);
    const translate =
      shift === null ? null : composeShiftedTranslate(siblingStyle, shift);
    if (translate === null) continue;
    captureStyle(snapshots, sibling, "translate");
    sibling.style.setProperty("translate", translate);
  }
}

function applyControlBarFit(
  anchor: HTMLElement,
  button: HTMLElement,
  snapshots: StyleSnapshot[],
): void {
  const parent = anchor.parentElement;
  if (parent === null || parent !== button.parentElement) return;

  const anchorStyle = computedStyleOf(anchor);
  if (anchorStyle === null) return;
  const parentStyle = computedStyleOf(parent);
  copyBoxSizing(anchorStyle, button, snapshots);

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
    reserveFlexSpace(button, parentStyle, anchorStyle, snapshots);
  }
}

/**
 * Give the injected button its own room in front of the native fullscreen
 * control. Absolute clusters bake pixel offsets into inline styles, so the fit
 * can be re-applied when the player's layout box changes.
 */
export function fitInControlBar(
  anchor: HTMLElement,
  button: HTMLElement,
): ControlBarFit {
  let snapshots: StyleSnapshot[] = [];
  let ownedStyles = new Map<Element, OwnedStyle>();
  let box: LayoutBox | null = null;

  const apply = (): void => {
    snapshots = [];
    applyControlBarFit(anchor, button, snapshots);
    ownedStyles = new Map();
    for (const snapshot of snapshots) {
      const existing = ownedStyles.get(snapshot.element);
      const values = existing?.values ?? new Map<string, OwnedPropertyValue>();
      values.set(snapshot.property, {
        value: snapshot.element.style.getPropertyValue(snapshot.property),
        priority: snapshot.element.style.getPropertyPriority(
          snapshot.property,
        ),
      });
      ownedStyles.set(snapshot.element, {
        attribute: snapshot.element.getAttribute("style") ?? "",
        values,
      });
    }
    // Measure after applying so a flex bar's own added margins do not look
    // like a layout change on the next check.
    box = layoutBoxOf(anchor);
  };

  const dispose = (): void => {
    rebaseSiteChangedProperties(snapshots, ownedStyles);
    restoreStyles(snapshots);
    snapshots = [];
    ownedStyles.clear();
    box = null;
  };

  apply();

  return {
    sync(): void {
      const next = layoutBoxOf(anchor);
      if (box !== null && isSameLayoutBox(box, next)) return;
      dispose();
      apply();
    },
    refit(): void {
      dispose();
      apply();
    },
    ownsStyleOf(element: Element): boolean {
      const owned = ownedStyles.get(element);
      return owned !== undefined &&
        (element.getAttribute("style") ?? "") === owned.attribute;
    },
    dispose,
  };
}
