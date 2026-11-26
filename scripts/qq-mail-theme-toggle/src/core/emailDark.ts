/**
 * Third-party email HTML hard-codes its palette in inline styles, so swapping
 * QQ Mail's own tokens cannot reach it. This module remaps those colours one
 * element at a time: paper-white surfaces become dark, dark ink becomes light,
 * hairlines become dark borders and saturated accents keep their hue once they
 * clear the contrast bar. No CSS filter is ever applied and media elements are
 * never touched, so photos, logos and videos keep their original pixels.
 */

import { COMPOSE_CONTENT_SELECTOR } from "../config";
import { createComposePalette } from "./composeStyle";

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

type BackgroundLayerProperty =
  | "background-size"
  | "background-position"
  | "background-repeat"
  | "background-attachment"
  | "background-origin"
  | "background-clip"
  | "background-blend-mode";

type EmailStyleProperty =
  | "color"
  | "-webkit-text-fill-color"
  | "background-color"
  | "background-image"
  | BackgroundLayerProperty
  | BorderProperty;

type PaletteWriter = (element: HTMLElement, property: EmailStyleProperty, value: string) => boolean;

interface SavedProperty {
  readonly value: string;
  readonly priority: string;
  readonly applied: string;
}

interface EmailElementStyle {
  readonly element: HTMLElement;
  readonly shadowRoot: ShadowRoot | null;
  readonly color: string;
  readonly textFill: string;
  readonly backgroundColor: string;
  readonly backgroundImage: string;
  readonly backgroundLayers: readonly (readonly [BackgroundLayerProperty, string])[];
  readonly hasText: boolean;
  readonly borders: readonly BorderEntry[];
  readonly children: readonly EmailElementStyle[];
}

interface VisitContext {
  readonly background: Rgba;
  readonly foreground: string;
  readonly write: PaletteWriter;
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
const CONTRAST_EXTREMES: readonly Rgba[] = [
  { r: 255, g: 255, b: 255, a: 1 },
  { r: 0, g: 0, b: 0, a: 1 },
];
const PALETTE_ATTRIBUTES = ["style", "class", "color", "bgcolor", "background"];
const CONTENT_SELECTOR = `${EMAIL_CONTENT_SELECTOR}, ${COMPOSE_CONTENT_SELECTOR}`;
const IMAGE_OVERLAY_ALPHA = 0.85;
const BACKGROUND_LAYER_DEFAULTS: readonly (readonly [BackgroundLayerProperty, string])[] = [
  ["background-size", "auto"],
  ["background-position", "0% 0%"],
  ["background-repeat", "repeat"],
  ["background-attachment", "scroll"],
  ["background-origin", "padding-box"],
  ["background-clip", "border-box"],
  ["background-blend-mode", "normal"],
];

/** Surfaces at or above this luminance count as "paper" and become dark. */
const PAPER_LUMINANCE = 0.18;
/** Hairlines at or above this luminance count as drawn on paper. */
const HAIRLINE_LUMINANCE = 0.55;
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

const trackedElements = new Map<HTMLElement, Map<EmailStyleProperty, SavedProperty>>();
let activeSession: EmailDarkSession | null = null;
let composeStyle: HTMLStyleElement | null = null;
let observedRoots: readonly ShadowRoot[] = [];

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

function compositeColor(foreground: Rgba, background: Rgba): Rgba {
  const remaining = 1 - foreground.a;
  return {
    r: foreground.r * foreground.a + background.r * remaining,
    g: foreground.g * foreground.a + background.g * remaining,
    b: foreground.b * foreground.a + background.b * remaining,
    a: 1,
  };
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
  if (color.a === 0) return null;
  if (contrastRatio(compositeColor(color, background), background) >= MIN_CONTRAST) return null;
  const [hue, saturation] = rgbToHsl(color);
  const candidate = saturation < MUTED_MAX_SATURATION
    ? LIGHT_FOREGROUND
    : hslToRgb(hue, Math.min(saturation, LIGHTENED_MAX_SATURATION), LIGHTENED_LIGHTNESS, 1);
  if (contrastRatio(candidate, background) >= MIN_CONTRAST) return formatColor(candidate);
  const fallback = CONTRAST_EXTREMES.find((ink) => contrastRatio(ink, background) >= MIN_CONTRAST);
  return formatColor(fallback ?? LIGHT_FOREGROUND);
}

/** Light hairlines drawn on paper become hairlines drawn on the dark canvas. */
function mapBorder(color: Rgba): string | null {
  if (color.a === 0 || luminance(color) < HAIRLINE_LUMINANCE) return null;
  return formatColor({ ...DARK_BORDER, a: color.a });
}

function setTrackedProperty(
  element: HTMLElement,
  property: EmailStyleProperty,
  value: string,
): boolean {
  const properties = trackedElements.get(element) ?? new Map<EmailStyleProperty, SavedProperty>();
  const saved = properties.get(property) ?? {
    value: element.style.getPropertyValue(property),
    priority: element.style.getPropertyPriority(property),
  };
  element.style.setProperty(property, value, "important");
  properties.set(property, { ...saved, applied: element.style.getPropertyValue(property) });
  trackedElements.set(element, properties);
  return true;
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

function readEmailElement(element: Element, view: Window): EmailElementStyle | null {
  const tag = element.tagName.toUpperCase();
  if (MEDIA_TAGS.has(tag) || INERT_TAGS.has(tag)) return null;
  if (!(element instanceof HTMLElement)) return null;
  const computed = view.getComputedStyle(element);
  const shadowRoot = element.shadowRoot;
  const childNodes = [...element.childNodes, ...(shadowRoot?.childNodes ?? [])];
  const children = childNodes
    .filter((node): node is Element => node instanceof Element)
    .map((child) => readEmailElement(child, view))
    .filter((child): child is EmailElementStyle => child !== null);
  const hasOwnText = childNodes
    .some((node) => node.nodeType === 3 && (node.textContent?.trim().length ?? 0) > 0);
  return {
    element,
    shadowRoot,
    color: computed.color,
    textFill: computed.getPropertyValue("-webkit-text-fill-color"),
    backgroundColor: computed.backgroundColor,
    backgroundImage: computed.backgroundImage,
    backgroundLayers: BACKGROUND_LAYER_DEFAULTS.map(([property, fallback]) =>
      [property, computed.getPropertyValue(property) || fallback] as const,
    ),
    hasText: hasOwnText || children.some((child) => child.hasText),
    borders: borderEntries(computed),
    children,
  };
}

function collectShadowRoots(snapshot: EmailElementStyle, roots: Set<ShadowRoot>): void {
  if (snapshot.shadowRoot !== null) roots.add(snapshot.shadowRoot);
  for (const child of snapshot.children) collectShadowRoots(child, roots);
}

function darkenImageSurface(snapshot: EmailElementStyle, context: VisitContext): VisitContext {
  const overlay = { ...DARK_BACKGROUND, a: IMAGE_OVERLAY_ALPHA };
  const color = formatColor(overlay);
  const image = `linear-gradient(${color}, ${color}), ${snapshot.backgroundImage}`;
  if (!context.write(snapshot.element, "background-image", image)) return context;
  for (const [property, value] of snapshot.backgroundLayers) {
    const fallback = BACKGROUND_LAYER_DEFAULTS.find(([name]) => name === property)?.[1] ?? "initial";
    context.write(snapshot.element, property, `${fallback}, ${value}`);
  }
  return { ...context, background: compositeColor(overlay, CONTRAST_EXTREMES[0]) };
}

function resolveBackground(snapshot: EmailElementStyle, context: VisitContext): VisitContext {
  const declared = parseCssColor(snapshot.backgroundColor);
  const mapped = declared === null ? null : mapBackground(declared);
  const applied = mapped !== null && context.write(snapshot.element, "background-color", mapped);
  const surface = applied ? parseCssColor(mapped) : declared;
  const result = surface === null ? context : {
    ...context, background: compositeColor(surface, context.background),
  };
  const hasImage = snapshot.backgroundImage !== "none" && snapshot.backgroundImage !== "";
  if (hasImage && snapshot.hasText) return darkenImageSurface(snapshot, result);
  return result;
}

function resolveForeground(value: string, context: VisitContext): string {
  const color = parseCssColor(value);
  if (color === null) return value;
  return mapForeground(color, context.background) ?? value;
}

function recolorBorders(snapshot: EmailElementStyle, write: PaletteWriter): void {
  for (const [property, width, style, color] of snapshot.borders) {
    if (!hasBorder(width, style)) continue;
    const parsed = parseCssColor(color);
    if (parsed === null) continue;
    const mapped = mapBorder(parsed);
    if (mapped !== null) write(snapshot.element, property, mapped);
  }
}

function visitElement(snapshot: EmailElementStyle, context: VisitContext): void {
  const surface = resolveBackground(snapshot, context);
  const foreground = resolveForeground(snapshot.color, surface);
  if (foreground !== snapshot.color || foreground !== context.foreground) {
    context.write(snapshot.element, "color", foreground);
  }
  const textFill = resolveForeground(snapshot.textFill || snapshot.color, surface);
  context.write(snapshot.element, "-webkit-text-fill-color", textFill);
  recolorBorders(snapshot, context.write);
  const next = { ...surface, foreground };
  for (const child of snapshot.children) visitElement(child, next);
}

export function applyEmailDarkMode(doc: Document): void {
  const view = doc.defaultView;
  if (view === null) return;
  activeSession?.observer.disconnect();
  try {
    restoreEmailColors();
    const snapshots = Array.from(doc.querySelectorAll(CONTENT_SELECTOR))
      .map((element) => readEmailElement(element, view))
      .filter((snapshot): snapshot is EmailElementStyle => snapshot !== null);
    const roots = new Set<ShadowRoot>();
    for (const snapshot of snapshots) collectShadowRoots(snapshot, roots);
    observedRoots = Array.from(roots);
    const palette = createComposePalette(doc);
    for (const snapshot of snapshots) {
      const write = snapshot.element.matches(COMPOSE_CONTENT_SELECTOR) ? palette.write : setTrackedProperty;
      visitElement(snapshot, { background: DARK_BACKGROUND, foreground: "", write });
    }
    composeStyle = palette.mount();
  } finally {
    if (activeSession !== null) observeEmailContent(activeSession);
  }
}

function restoreElementColors(element: HTMLElement, properties: Map<EmailStyleProperty, SavedProperty>): void {
  for (const [property, saved] of properties) {
    if (element.style.getPropertyValue(property) !== saved.applied) continue;
    if (element.style.getPropertyPriority(property) !== "important") continue;
    if (saved.value === "") element.style.removeProperty(property);
    else element.style.setProperty(property, saved.value, saved.priority);
  }
}

export function restoreEmailColors(): void {
  composeStyle?.remove();
  composeStyle = null;
  observedRoots = [];
  for (const [element, properties] of trackedElements) restoreElementColors(element, properties);
  trackedElements.clear();
}

function touchesEmailContent(record: MutationRecord): boolean {
  const target = mutationTargetElement(record.target);
  if (target !== null && isInsideEmailContent(target)) return true;
  if (record.type === "childList" && target?.querySelector(COMPOSE_CONTENT_SELECTOR)) return true;
  for (const node of [...record.addedNodes, ...record.removedNodes]) {
    if (!(node instanceof Element)) continue;
    if (isInsideEmailContent(node)) return true;
    if (node.querySelector(CONTENT_SELECTOR) !== null) return true;
  }
  return false;
}

function mutationTargetElement(target: Node): Element | null {
  if (target instanceof Element) return target;
  if (target.parentElement !== null) return target.parentElement;
  const root = target.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

function isInsideEmailContent(node: Node): boolean {
  let current: Node | null = node;
  while (current !== null) {
    if (current instanceof Element && current.closest(CONTENT_SELECTOR) !== null) return true;
    const root = current.getRootNode();
    if (!(root instanceof ShadowRoot)) return false;
    current = root.host;
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

function observeEmailContent(session: EmailDarkSession): void {
  const options: MutationObserverInit = {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    attributeFilter: PALETTE_ATTRIBUTES,
  };
  session.observer.observe(session.doc.documentElement, options);
  for (const root of observedRoots) session.observer.observe(root, options);
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
  observeEmailContent(session);
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
