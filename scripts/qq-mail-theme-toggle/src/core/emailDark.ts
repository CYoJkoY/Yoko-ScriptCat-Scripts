/**
 * Third-party email HTML hard-codes its palette in inline styles, so swapping
 * QQ Mail's own tokens cannot reach it. This module remaps those colours one
 * element at a time: paper-white surfaces become dark, dark ink becomes light,
 * hairlines become dark borders and saturated accents keep their hue once they
 * clear the contrast bar. No CSS filter is ever applied and media elements are
 * never touched, so photos, logos and videos keep their original pixels.
 */

interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

type BorderProperty =
  | "border-top-color"
  | "border-right-color"
  | "border-bottom-color"
  | "border-left-color";

type EmailStyleProperty = "color" | "background-color" | BorderProperty;

interface SavedProperty {
  readonly value: string;
  readonly priority: string;
}

interface TrackedElement {
  readonly properties: Map<EmailStyleProperty, SavedProperty>;
  readonly background: Rgba;
  readonly preserveForeground: boolean;
}

interface VisitContext {
  readonly background: Rgba;
  readonly preserveForeground: boolean;
}

interface EmailDarkSession {
  readonly doc: Document;
  readonly view: Window;
  readonly observer: MutationObserver;
  timer: number | null;
}

/** The reading pane that holds the rendered email document. */
export const EMAIL_CONTENT_SELECTOR = ".mail-detail-content";

/** Elements whose pixels must never be reinterpreted. */
const MEDIA_TAGS: ReadonlySet<string> = new Set([
  "IMG",
  "VIDEO",
  "PICTURE",
  "SOURCE",
  "CANVAS",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "AUDIO",
]);

/** Elements that carry no visible email content. */
const INERT_TAGS: ReadonlySet<string> = new Set([
  "SCRIPT",
  "STYLE",
  "LINK",
  "META",
  "NOSCRIPT",
  "TEMPLATE",
  "HEAD",
  "TITLE",
]);

const DARK_BACKGROUND: Rgba = { r: 26, g: 32, b: 40, a: 1 };
const LIGHT_FOREGROUND: Rgba = { r: 232, g: 236, b: 241, a: 1 };
const DARK_BORDER: Rgba = { r: 58, g: 64, b: 73, a: 1 };

/** Surfaces at or above this luminance count as "paper" and become dark. */
const PAPER_LUMINANCE = 0.58;
/** Hairlines at or above this luminance count as drawn on paper. */
const HAIRLINE_LUMINANCE = 0.55;
/** A surface this opaque fully hides whatever is painted behind it. */
const OPAQUE_ALPHA = 0.9;
/** WCAG AA contrast for body text. */
const MIN_CONTRAST = 4.5;
/** Below this saturation an accent is really ink, so it follows the ink ramp. */
const MUTED_MAX_SATURATION = 0.18;
/** Below this saturation a surface is really neutral paper. */
const NEUTRAL_MAX_SATURATION = 0.08;

const TINT_LIGHTNESS = 0.13;
const TINT_MAX_SATURATION = 0.45;
const LIGHTENED_LIGHTNESS = 0.72;
const LIGHTENED_MAX_SATURATION = 0.8;

let tracked: WeakMap<HTMLElement, TrackedElement> = new WeakMap();
let trackedElements: Set<HTMLElement> = new Set();
let activeSession: EmailDarkSession | null = null;

function parseCssColor(value: string): Rgba | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "" || normalized === "transparent") return null;
  if (normalized === "white") return { r: 255, g: 255, b: 255, a: 1 };
  if (normalized === "black") return { r: 0, g: 0, b: 0, a: 1 };
  if (normalized.startsWith("#")) return parseHexColor(normalized);
  if (!normalized.startsWith("rgb")) return null;
  return parseRgbColor(normalized);
}

function parseHexColor(value: string): Rgba | null {
  const hex = value.slice(1);
  if (hex.length !== 3 && hex.length !== 4 && hex.length !== 6 && hex.length !== 8) return null;
  const expanded =
    hex.length === 3 || hex.length === 4
      ? [...hex].map((character) => character + character).join("")
      : hex;
  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);
  const alpha = expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1;
  if ([red, green, blue, alpha].some((channel) => Number.isNaN(channel))) return null;
  return { r: red, g: green, b: blue, a: alpha };
}

function parseRgbColor(value: string): Rgba | null {
  const open = value.indexOf("(");
  const close = value.lastIndexOf(")");
  if (open < 0 || close <= open) return null;
  const parts = value
    .slice(open + 1, close)
    .replace("/", " ")
    .split(/[\s,]+/u)
    .filter((part) => part !== "");
  if (parts.length < 3) return null;
  const red = parseColorChannel(parts[0]);
  const green = parseColorChannel(parts[1]);
  const blue = parseColorChannel(parts[2]);
  const alpha = parts.length >= 4 ? parseAlphaChannel(parts[3]) : 1;
  if (red === null || green === null || blue === null || alpha === null) return null;
  return { r: red, g: green, b: blue, a: alpha };
}

function parseColorChannel(value: string): number | null {
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) return null;
  const channel = value.endsWith("%") ? (parsed / 100) * 255 : parsed;
  return Math.round(Math.min(255, Math.max(0, channel)));
}

function parseAlphaChannel(value: string): number | null {
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) return null;
  const alpha = value.endsWith("%") ? parsed / 100 : parsed;
  return Math.min(1, Math.max(0, alpha));
}

function formatColor(color: Rgba): string {
  if (color.a < 0.999) {
    const rounded = Math.round(color.a * 1000) / 1000;
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${rounded})`;
  }
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

function channelLuminance(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(color: Rgba): number {
  return (
    0.2126 * channelLuminance(color.r) +
    0.7152 * channelLuminance(color.g) +
    0.0722 * channelLuminance(color.b)
  );
}

function contrastRatio(first: Rgba, second: Rgba): number {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function rgbToHsl(color: Rgba): readonly [number, number, number] {
  const red = color.r / 255;
  const green = color.g / 255;
  const blue = color.b / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const lightness = (maximum + minimum) / 2;
  if (maximum === minimum) return [0, 0, lightness];
  const delta = maximum - minimum;
  const saturation =
    lightness > 0.5 ? delta / (2 - maximum - minimum) : delta / (maximum + minimum);
  let hue = 0;
  if (maximum === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
  if (maximum === green) hue = (blue - red) / delta + 2;
  if (maximum === blue) hue = (red - green) / delta + 4;
  return [hue / 6, saturation, lightness];
}

function hueToChannel(first: number, second: number, hue: number): number {
  let value = hue;
  if (value < 0) value += 1;
  if (value > 1) value -= 1;
  if (value < 1 / 6) return first + (second - first) * 6 * value;
  if (value < 1 / 2) return second;
  if (value < 2 / 3) return first + (second - first) * (2 / 3 - value) * 6;
  return first;
}

function hslToRgb(hue: number, saturation: number, lightness: number, alpha: number): Rgba {
  if (saturation === 0) {
    const channel = Math.round(lightness * 255);
    return { r: channel, g: channel, b: channel, a: alpha };
  }
  const second =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const first = 2 * lightness - second;
  return {
    r: Math.round(hueToChannel(first, second, hue + 1 / 3) * 255),
    g: Math.round(hueToChannel(first, second, hue) * 255),
    b: Math.round(hueToChannel(first, second, hue - 1 / 3) * 255),
    a: alpha,
  };
}

/** Paper becomes the dark canvas, tinted paper keeps a hint of its hue. */
function mapBackground(color: Rgba): string | null {
  if (color.a === 0 || luminance(color) < PAPER_LUMINANCE) return null;
  const [hue, saturation] = rgbToHsl(color);
  if (saturation < NEUTRAL_MAX_SATURATION) {
    return formatColor({ ...DARK_BACKGROUND, a: color.a });
  }
  const tint = hslToRgb(hue, Math.min(saturation, TINT_MAX_SATURATION), TINT_LIGHTNESS, color.a);
  return formatColor(tint);
}

/** Ink that no longer reads on the dark canvas is lifted; accents keep their hue. */
function mapForeground(color: Rgba, background: Rgba): string | null {
  if (color.a === 0 || contrastRatio(color, background) >= MIN_CONTRAST) return null;
  const [hue, saturation] = rgbToHsl(color);
  if (saturation < MUTED_MAX_SATURATION) {
    return formatColor({ ...LIGHT_FOREGROUND, a: color.a });
  }
  const lightened = hslToRgb(
    hue,
    Math.min(saturation, LIGHTENED_MAX_SATURATION),
    LIGHTENED_LIGHTNESS,
    color.a,
  );
  return formatColor(lightened);
}

/** Light hairlines drawn on paper become hairlines drawn on the dark canvas. */
function mapBorder(color: Rgba): string | null {
  if (color.a === 0 || luminance(color) < HAIRLINE_LUMINANCE) return null;
  return formatColor({ ...DARK_BORDER, a: color.a });
}

function setTrackedProperty(
  element: HTMLElement,
  state: TrackedElement,
  property: EmailStyleProperty,
  value: string,
): void {
  if (!state.properties.has(property)) {
    state.properties.set(property, {
      value: element.style.getPropertyValue(property),
      priority: element.style.getPropertyPriority(property),
    });
  }
  element.style.setProperty(property, value, "important");
}

type BorderEntry = readonly [BorderProperty, string, string, string];

function borderEntries(computed: CSSStyleDeclaration): readonly BorderEntry[] {
  return [
    ["border-top-color", computed.borderTopWidth, computed.borderTopStyle, computed.borderTopColor],
    [
      "border-right-color",
      computed.borderRightWidth,
      computed.borderRightStyle,
      computed.borderRightColor,
    ],
    [
      "border-bottom-color",
      computed.borderBottomWidth,
      computed.borderBottomStyle,
      computed.borderBottomColor,
    ],
    [
      "border-left-color",
      computed.borderLeftWidth,
      computed.borderLeftStyle,
      computed.borderLeftColor,
    ],
  ];
}

function hasBorder(width: string, style: string): boolean {
  if (width === "" || width === "0px" || style === "" || style === "none") return false;
  return true;
}

/**
 * Recolour one element, remember what it looked like, and hand the resulting
 * context down to its children. Media subtrees are skipped before any read or
 * write happens, and elements painted over a background image keep their ink.
 */
function trackElement(
  element: HTMLElement,
  context: VisitContext,
  view: Window,
): VisitContext {
  const computed = view.getComputedStyle(element);
  const paintedOverImage = computed.backgroundImage !== "none" && computed.backgroundImage !== "";
  let background = context.background;
  const preserveForeground = context.preserveForeground || paintedOverImage;
  const pending: [EmailStyleProperty, string][] = [];

  const declared = parseCssColor(computed.backgroundColor);
  if (paintedOverImage) {
    // Whatever the author drew on the image must stay exactly as authored.
  } else if (declared !== null) {
    const mapped = mapBackground(declared);
    if (mapped !== null) {
      pending.push(["background-color", mapped]);
      background = parseCssColor(mapped) ?? background;
    } else if (declared.a >= OPAQUE_ALPHA) {
      background = declared;
    }
  }

  if (!preserveForeground) {
    const foreground = parseCssColor(computed.color);
    if (foreground !== null) {
      const mapped = mapForeground(foreground, background);
      if (mapped !== null) pending.push(["color", mapped]);
    }
    for (const [property, width, style, color] of borderEntries(computed)) {
      if (!hasBorder(width, style)) continue;
      const parsed = parseCssColor(color);
      if (parsed === null) continue;
      const mapped = mapBorder(parsed);
      if (mapped !== null) pending.push([property, mapped]);
    }
  }

  const state: TrackedElement = { properties: new Map(), background, preserveForeground };
  tracked.set(element, state);
  trackedElements.add(element);
  for (const [property, value] of pending) setTrackedProperty(element, state, property, value);

  return { background, preserveForeground };
}

function visitElement(element: Element, context: VisitContext, view: Window): void {
  // `tagName` keeps the authored case for SVG elements, so compare upper-cased.
  const tag = element.tagName.toUpperCase();
  if (MEDIA_TAGS.has(tag) || INERT_TAGS.has(tag)) return;
  // Anything that is not a plain HTML element (svg, MathML, …) is left alone.
  if (!(element instanceof HTMLElement)) return;

  const existing = tracked.get(element);
  const next: VisitContext =
    existing === undefined
      ? trackElement(element, context, view)
      : { background: existing.background, preserveForeground: existing.preserveForeground };

  for (const child of Array.from(element.children)) {
    visitElement(child, next, view);
  }
}

function pruneDisconnected(): void {
  for (const element of trackedElements) {
    if (element.isConnected) continue;
    trackedElements.delete(element);
    tracked.delete(element);
  }
}

/** Recolour every rendered email body in `doc`. Safe to call repeatedly. */
export function applyEmailDarkMode(doc: Document): void {
  const view = doc.defaultView;
  if (view === null) return;
  pruneDisconnected();
  const root: VisitContext = { background: DARK_BACKGROUND, preserveForeground: false };
  for (const element of Array.from(doc.querySelectorAll<HTMLElement>(EMAIL_CONTENT_SELECTOR))) {
    visitElement(element, root, view);
  }
}

/** Put every touched declaration back exactly as the email authored it. */
export function restoreEmailColors(): void {
  for (const element of trackedElements) {
    const state = tracked.get(element);
    if (state === undefined) continue;
    for (const [property, saved] of state.properties) {
      if (saved.value === "") {
        element.style.removeProperty(property);
        continue;
      }
      element.style.setProperty(property, saved.value, saved.priority);
    }
  }
  tracked = new WeakMap();
  trackedElements = new Set();
}

function touchesEmailContent(record: MutationRecord): boolean {
  if (record.target instanceof Element) {
    if (record.target.closest(EMAIL_CONTENT_SELECTOR) !== null) return true;
  }
  for (const node of Array.from(record.addedNodes)) {
    if (!(node instanceof Element)) continue;
    if (node.closest(EMAIL_CONTENT_SELECTOR) !== null) return true;
    if (node.querySelector(EMAIL_CONTENT_SELECTOR) !== null) return true;
  }
  return false;
}

function scheduleFlush(session: EmailDarkSession): void {
  if (session.timer !== null) return;
  session.timer = session.view.setTimeout(() => {
    session.timer = null;
    if (activeSession !== session) return;
    applyEmailDarkMode(session.doc);
  }, 0);
}

/** Recolour now, then keep watching for freshly rendered email bodies. */
export function enableEmailDarkMode(doc: Document): void {
  if (activeSession !== null && activeSession.doc !== doc) disableEmailDarkMode();
  applyEmailDarkMode(doc);
  if (activeSession !== null) return;
  const view = doc.defaultView;
  const root = doc.documentElement;
  if (view === null || root === null) return;
  const observer = new view.MutationObserver((records) => {
    for (const record of records) {
      if (!touchesEmailContent(record)) continue;
      scheduleFlush(session);
      return;
    }
  });
  const session: EmailDarkSession = { doc, view, observer, timer: null };
  activeSession = session;
  observer.observe(root, { childList: true, subtree: true });
}

/** Stop watching and put the email bodies back to their authored colours. */
export function disableEmailDarkMode(): void {
  const session = activeSession;
  if (session === null) {
    restoreEmailColors();
    return;
  }
  activeSession = null;
  session.observer.disconnect();
  if (session.timer !== null) session.view.clearTimeout(session.timer);
  restoreEmailColors();
}
