const FALLBACK_GAP_EM = 0.35;
const DEFAULT_FONT_SIZE_PX = 16;
const MIN_SHIFT_PX = 0.5;
const MIN_TRANSFORM_SCALE = 0.05;
const MAX_LOCAL_SHIFT_RATIO = 1 / MIN_TRANSFORM_SCALE;
const MIN_APPLIED_SHIFT_PX = 0.005;
const LAYOUT_EPSILON_PX = 0.5;
const POSITION_OFFSET_PROPERTIES = ["top", "right", "bottom", "left"] as const;
const CONTROL_ICON_SELECTOR = "svg, img, i, [class*='icon']";
const MIN_MEASURED_SIZE_PX = 1;
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

interface SiblingSnapshot {
  readonly element: StyledElement;
  readonly offset: LayoutBox | null;
  readonly rect: LayoutBox;
}

interface ControlSizes {
  readonly icon: number | null;
  readonly controlWidth: number | null;
  readonly controlHeight: number | null;
}

interface CssBoxSize {
  readonly width: number;
  readonly height: number;
}

interface FitSnapshot {
  readonly anchorOffset: LayoutBox;
  readonly buttonRect: LayoutBox;
  readonly siblings: readonly SiblingSnapshot[];
  readonly sizes: ControlSizes;
}

export interface ControlBarFit {
  /** Re-apply the fit when the anchor's layout box moved or resized. */
  sync(): void;
  /** Re-apply the fit when surrounding controls changed without moving the anchor. */
  refit(): void;
  /** Elements whose rendered size feeds the measured button and icon sizes. */
  resizeTargets(): readonly Element[];
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

/**
 * A bounding rect already includes the element's own and its ancestors'
 * transforms, while a CSS width is applied before them. The axis-aligned
 * bounding box of a local `width` x `height` box is
 * `|a| * width + |c| * height` by `|b| * width + |d| * height`, so solve that
 * system to recover the untransformed size the clone should carry. This also
 * undoes a rotation, which axis scale lengths alone cannot.
 */
function measuredCssBoxOf(
  element: Element,
  axes: TransformAxes,
): CssBoxSize | null {
  const a = Math.abs(axes.a);
  const b = Math.abs(axes.b);
  const c = Math.abs(axes.c);
  const d = Math.abs(axes.d);
  const det = a * d - b * c;
  // Near 45 degrees a rotation makes both local dimensions indistinguishable
  // from the bounding box; skip the write instead of guessing.
  if (!(Math.abs(det) > MIN_TRANSFORM_SCALE * MIN_TRANSFORM_SCALE)) return null;
  const rect = element.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return null;
  const width = (rect.width * d - c * rect.height) / det;
  const height = (a * rect.height - b * rect.width) / det;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width < MIN_MEASURED_SIZE_PX || height < MIN_MEASURED_SIZE_PX) return null;
  return { width, height };
}

function measuredCssSizeOf(
  element: Element,
  axes: TransformAxes,
): number | null {
  const box = measuredCssBoxOf(element, axes);
  return box === null ? null : Math.min(box.width, box.height);
}

function iconElementOf(control: Element, axes: TransformAxes): Element | null {
  for (const candidate of control.querySelectorAll(CONTROL_ICON_SELECTOR)) {
    if (measuredCssSizeOf(candidate, axes) !== null) return candidate;
  }
  // An empty control can draw its glyph with a pseudo-element or background.
  // Its whole box is not the icon, so fall back to neighbouring icons instead.
  return control.matches(CONTROL_ICON_SELECTOR) ? control : null;
}

function medianSize(sizes: readonly number[]): number | null {
  if (sizes.length === 0) return null;
  const sorted = [...sizes].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted[middle] ?? null;
}

/**
 * Prefer the anchor's own icon, then the icons of neighbouring controls. The
 * median keeps one unusually large control from stretching the button.
 */
function measureIconTarget(
  anchor: HTMLElement,
  button: HTMLElement,
  axes: TransformAxes,
): number | null {
  const anchorIcon = iconElementOf(anchor, axes);
  if (anchorIcon !== null) {
    const anchorSize = measuredCssSizeOf(anchorIcon, axes);
    if (anchorSize !== null) return anchorSize;
  }

  const parent = anchor.parentElement;
  if (parent === null) return null;
  const sizes: number[] = [];
  for (const sibling of parent.children) {
    if (sibling === anchor || sibling === button) continue;
    if (!isStyledElement(sibling)) continue;
    const icon = iconElementOf(sibling, axes);
    if (icon === null) continue;
    const size = measuredCssSizeOf(icon, axes);
    if (size !== null) sizes.push(size);
  }
  return medianSize(sizes);
}

function measureControlSizes(
  anchor: HTMLElement,
  button: HTMLElement,
): ControlSizes {
  const controlAxes = combinedTransformAxesOf(button);
  const cloneIcon = button.querySelector("svg");
  const iconAxes =
    cloneIcon === null ? controlAxes : combinedTransformAxesOf(cloneIcon);
  const control = measuredCssBoxOf(anchor, controlAxes);
  return {
    icon: measureIconTarget(anchor, button, iconAxes),
    controlWidth: control?.width ?? null,
    controlHeight: control?.height ?? null,
  };
}

/**
 * The anchor and the icons the fit measures. The installer observes them so a
 * webfont swap or a hover rule that only changes a control's rendered size
 * still refreshes the cloned button.
 */
function resizeTargetsOf(anchor: HTMLElement, button: HTMLElement): Element[] {
  const targets = new Set<Element>();
  const parent = anchor.parentElement;
  const scopes =
    parent === null ? [anchor] : [anchor, ...parent.children];
  for (const scope of scopes) {
    if (!isStyledElement(scope) || scope === button) continue;
    targets.add(scope);
    for (const icon of scope.querySelectorAll(CONTROL_ICON_SELECTOR)) {
      targets.add(icon);
    }
  }
  return [...targets];
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

function offsetBoxOf(element: Element): LayoutBox | null {
  const view = element.ownerDocument.defaultView;
  if (view === null || !(element instanceof view.HTMLElement)) return null;
  return layoutBoxOf(element);
}

function relativeRectOf(element: Element, origin: DOMRect): LayoutBox {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left - origin.left,
    top: rect.top - origin.top,
    width: rect.width,
    height: rect.height,
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

function snapshotFit(anchor: HTMLElement, button: HTMLElement): FitSnapshot {
  const anchorRect = anchor.getBoundingClientRect();
  const siblings: SiblingSnapshot[] = [];
  for (
    let sibling = button.previousElementSibling;
    sibling !== null;
    sibling = sibling.previousElementSibling
  ) {
    if (!isStyledElement(sibling)) continue;
    siblings.push({
      element: sibling,
      offset: offsetBoxOf(sibling),
      rect: relativeRectOf(sibling, anchorRect),
    });
  }
  return {
    anchorOffset: layoutBoxOf(anchor),
    buttonRect: relativeRectOf(button, anchorRect),
    siblings,
    sizes: measureControlSizes(anchor, button),
  };
}

function isSameSiblingSnapshot(
  left: SiblingSnapshot,
  right: SiblingSnapshot,
): boolean {
  if (left.element !== right.element) return false;
  if (!isSameLayoutBox(left.rect, right.rect)) return false;
  if (left.offset === null || right.offset === null) {
    return left.offset === right.offset;
  }
  return isSameLayoutBox(left.offset, right.offset);
}

function isSameFitSnapshot(left: FitSnapshot, right: FitSnapshot): boolean {
  if (!isSameLayoutBox(left.anchorOffset, right.anchorOffset)) return false;
  if (!isSameLayoutBox(left.buttonRect, right.buttonRect)) return false;
  if (!isSameControlSizes(left.sizes, right.sizes)) return false;
  if (left.siblings.length !== right.siblings.length) return false;
  for (let index = 0; index < left.siblings.length; index += 1) {
    const prevSibling = left.siblings[index];
    const nextSibling = right.siblings[index];
    if (prevSibling === undefined || nextSibling === undefined) return false;
    if (!isSameSiblingSnapshot(prevSibling, nextSibling)) return false;
  }
  return true;
}

function isSameControlSizes(left: ControlSizes, right: ControlSizes): boolean {
  return (
    isSameOptionalSize(left.icon, right.icon) &&
    isSameOptionalSize(left.controlWidth, right.controlWidth) &&
    isSameOptionalSize(left.controlHeight, right.controlHeight)
  );
}

function isSameOptionalSize(left: number | null, right: number | null): boolean {
  if (left === null || right === null) return left === right;
  return Math.abs(left - right) < LAYOUT_EPSILON_PX;
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

function copyFontSize(
  anchorStyle: CSSStyleDeclaration,
  button: HTMLElement,
  snapshots: StyleSnapshot[],
): void {
  const value = anchorStyle.getPropertyValue("font-size").trim();
  if (value.length === 0) return;
  const buttonStyle = computedStyleOf(button);
  if (buttonStyle?.getPropertyValue("font-size").trim() === value) return;
  captureStyle(snapshots, button, "font-size");
  button.style.setProperty("font-size", value);
}

function copyAnchorPosition(
  anchorStyle: CSSStyleDeclaration,
  button: HTMLElement,
  snapshots: StyleSnapshot[],
): void {
  const position = anchorStyle.getPropertyValue("position").trim();
  if (position.length === 0) return;
  const buttonStyle = computedStyleOf(button);
  if (buttonStyle?.getPropertyValue("position").trim() === position) return;
  captureStyle(snapshots, button, "position");
  button.style.setProperty("position", position);
}

type SizeAxis = "horizontal" | "vertical";

const CONTENT_BOX_EDGES: Readonly<Record<SizeAxis, readonly string[]>> = {
  horizontal: [
    "padding-left",
    "padding-right",
    "border-left-width",
    "border-right-width",
  ],
  vertical: [
    "padding-top",
    "padding-bottom",
    "border-top-width",
    "border-bottom-width",
  ],
};

/**
 * The measured rect is an outer size. A content-box minimum only constrains
 * the inner content area, so subtract the clone's own padding and borders
 * before applying it; otherwise those edges are added twice.
 */
function contentBoxSizeOf(
  element: HTMLElement,
  outerSize: number,
  axis: SizeAxis,
): number {
  const style = computedStyleOf(element);
  if (style === null) return outerSize;
  const boxSizing = style.getPropertyValue("box-sizing").trim().toLowerCase();
  if (boxSizing === "border-box") return outerSize;
  let edgesPx = 0;
  for (const property of CONTENT_BOX_EDGES[axis]) {
    edgesPx += readPx(style, property) ?? 0;
  }
  return Math.max(0, outerSize - edgesPx);
}

function applyMeasuredSizes(
  anchor: HTMLElement,
  button: HTMLElement,
  snapshots: StyleSnapshot[],
): void {
  const sizes = measureControlSizes(anchor, button);
  const icon = button.querySelector("svg");
  if (icon !== null && sizes.icon !== null) {
    const size = formatPx(sizes.icon);
    captureStyle(snapshots, icon, "width");
    captureStyle(snapshots, icon, "height");
    icon.style.setProperty("width", size);
    icon.style.setProperty("height", size);
  }
  if (sizes.controlWidth === null || sizes.controlHeight === null) return;
  const width = formatPx(
    contentBoxSizeOf(button, sizes.controlWidth, "horizontal"),
  );
  const height = formatPx(
    contentBoxSizeOf(button, sizes.controlHeight, "vertical"),
  );
  captureStyle(snapshots, button, "min-width");
  captureStyle(snapshots, button, "min-height");
  button.style.setProperty("min-width", width);
  button.style.setProperty("min-height", height);
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
    if (value.length === 0) continue;
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
  copyAnchorPosition(anchorStyle, button, snapshots);
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
  copyFontSize(anchorStyle, button, snapshots);
  applyMeasuredSizes(anchor, button, snapshots);

  const position = anchorStyle.getPropertyValue("position").trim();
  const absolute = position === "absolute" || position === "fixed";
  const offsetRelative = position === "relative" || position === "sticky";
  const rtl = isRtl(anchorStyle) || isRtl(parentStyle);

  // The anchor may be positioned by an ID rule while the clone only keeps the
  // shared class. Align the mode before insets or flex spacing are derived from
  // it. RTL bars cannot use the absolute cluster shift below, so an
  // out-of-flow clone would lose its control-bar slot; keep the clone in flow
  // instead.
  if (!(absolute && rtl)) {
    copyAnchorPosition(anchorStyle, button, snapshots);
  }

  if (absolute && !rtl) {
    shiftAbsoluteCluster(anchor, button, parentStyle, anchorStyle, snapshots);
    return;
  }
  if (offsetRelative) {
    // Relative and sticky insets shift the control visually without changing
    // its flow slot, so the clone must carry the same nudge.
    copyAnchorOffsets(anchorStyle, button, snapshots);
  }
  if (
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
  let fitSnapshot: FitSnapshot | null = null;
  let resizeTargets: readonly Element[] = [];

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
    fitSnapshot = snapshotFit(anchor, button);
    resizeTargets = resizeTargetsOf(anchor, button);
  };

  const dispose = (): void => {
    rebaseSiteChangedProperties(snapshots, ownedStyles);
    restoreStyles(snapshots);
    snapshots = [];
    ownedStyles.clear();
    fitSnapshot = null;
    resizeTargets = [];
  };

  apply();

  return {
    sync(): void {
      const next = snapshotFit(anchor, button);
      if (fitSnapshot !== null && isSameFitSnapshot(fitSnapshot, next)) return;
      dispose();
      apply();
    },
    refit(): void {
      dispose();
      apply();
    },
    resizeTargets(): readonly Element[] {
      return resizeTargets;
    },
    ownsStyleOf(element: Element): boolean {
      const owned = ownedStyles.get(element);
      return owned !== undefined &&
        (element.getAttribute("style") ?? "") === owned.attribute;
    },
    dispose,
  };
}
