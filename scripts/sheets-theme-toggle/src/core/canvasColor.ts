/**
 * Colour mapping for the Google Sheets grid canvas.
 *
 * The grid is painted into a single `<canvas>`, so the dark theme cannot be
 * expressed in CSS. Two mapping layers cooperate here:
 *
 * 1. A measured palette of the colours Google draws its own chrome with — the
 *    cell surface, the default text, the header band, the grid lines and the
 *    selection highlight — mapped one-for-one to Google's dark greys.
 * 2. A role-based tone curve for everything else. Whatever Google or the author
 *    paints is either paper (surface fills), ink (text) or an edge (grid lines,
 *    borders, small glyphs), and each role is pushed into its own lightness
 *    band: paper becomes a dark tint that keeps its hue, ink becomes light, and
 *    edges land in a mid grey that stays visible on a dark surface. Hues are
 *    never rotated, so nothing is "inverted" the way a `filter: invert()` would
 *    turn a red fill cyan.
 *
 * Nothing here reinterprets the *content*: colours drawn by `drawImage` (cell
 * images, sparkline bitmaps) never pass through this module, and colours that
 * were never observed in a fill/text/stroke call are left pixel-for-pixel alone.
 * The spreadsheet data and every cell format are never touched; only the paint
 * Google emits is remapped.
 *
 * One limit cannot be hidden: the default surface is pure white (`#ffffff`),
 * which is indistinguishable from a fill an author explicitly painted white. An
 * explicit white fill therefore follows the theme.
 */

export interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

function clampByte(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 255) return 255;
  return Math.round(value);
}

function rgba(r: number, g: number, b: number, a: number = 255): Rgba {
  return { r, g, b, a };
}

interface PalettePair {
  /** The colour Google paints in the light theme. */
  readonly light: Rgba;
  /** The colour the script substitutes while the dark theme is active. */
  readonly dark: Rgba;
}

/**
 * Where a colour came from. `paper` is a surface fill (cell background, header
 * band, selection highlight), `ink` is text glyph fill, and `edge` is anything
 * stroked or drawn as a small glyph — grid lines, borders, sort arrows,
 * checkmarks — which must stay visible against a dark surface.
 */
export type CanvasRole = "paper" | "ink" | "edge";

/**
 * The palette measured from a live spreadsheet grid. Each entry is one drawing
 * role, never a hunch: `#ffffff` is the cell surface, `#444746` is the default
 * body text (Google's own slate grey, not `#000000`), `#f8f9fa` is the row and
 * column header band, `#041e49` is the header text, `#c4c7c5` is the grid line
 * stroke, and `rgba(31, 31, 31, 0.133)` is the translucent grid line.
 */
export const CANVAS_PALETTE: readonly PalettePair[] = Object.freeze([
  // Cell surface.
  { light: rgba(255, 255, 255), dark: rgba(32, 33, 36) },
  // Row/column header band and the select-all corner.
  { light: rgba(248, 249, 250), dark: rgba(41, 42, 45) },
  // Default body text.
  { light: rgba(68, 71, 70), dark: rgba(232, 234, 237) },
  // Row/column header text.
  { light: rgba(4, 30, 73), dark: rgba(168, 199, 250) },
  // Selection highlight over the surface.
  { light: rgba(211, 227, 253), dark: rgba(57, 68, 87) },
  // Grid line stroke.
  { light: rgba(196, 199, 197), dark: rgba(95, 99, 104) },
  // Thick/frozen divider drawn as a filled band.
  { light: rgba(192, 192, 192), dark: rgba(97, 101, 106) },
  { light: rgba(199, 199, 199), dark: rgba(93, 97, 102) },
  // Translucent grid line (rgb 31 31 31 at 13.3% alpha).
  { light: rgba(31, 31, 31, 34), dark: rgba(255, 255, 255, 34) },
]);

/** The dark surface colour a near-white fringe is swept into. */
const DARK_SURFACE = rgba(32, 33, 36);

/**
 * Anti-aliased text and grid-line edges are blends of the surface with an ink
 * colour and land on greys that are not themselves palette entries. A pixel is
 * treated as such a fringe only when it is nearly white and almost perfectly
 * neutral, which keeps author greys out.
 */
const FRINGE_MIN_CHANNEL = 220;
const FRINGE_MAX_SPREAD = 8;

const colorKey = (color: Rgba): string => `${color.r},${color.g},${color.b},${color.a}`;

function buildTable(from: "light" | "dark", to: "light" | "dark"): Map<string, Rgba> {
  const table = new Map<string, Rgba>();
  for (const pair of CANVAS_PALETTE) {
    const source = colorKey(pair[from]);
    if (table.has(source)) continue;
    table.set(source, pair[to]);
  }
  return table;
}

const DARK_TABLE = buildTable("light", "dark");
const LIGHT_TABLE = buildTable("dark", "light");

/** Pack an opaque-ish RGBA quad into one integer so the pixel pass allocates no strings. */
export const pixelKey = (r: number, g: number, b: number, a: number): number =>
  (((r << 24) | (g << 16) | (b << 8) | a) >>> 0);

/** The integer key of a parsed colour, for the role-driven pixel tables. */
export function pixelKeyOf(color: Rgba): number {
  return pixelKey(color.r, color.g, color.b, color.a);
}

function buildPalettePixels(from: "light" | "dark", to: "light" | "dark"): Map<number, Rgba> {
  const table = new Map<number, Rgba>();
  for (const pair of CANVAS_PALETTE) {
    const source = pair[from];
    const key = pixelKey(source.r, source.g, source.b, source.a);
    if (table.has(key)) continue;
    table.set(key, pair[to]);
  }
  return table;
}

const DARK_PIXELS = buildPalettePixels("light", "dark");
const LIGHT_PIXELS = buildPalettePixels("dark", "light");

/**
 * Per-role lightness curves, expressed in HSL. Each curve only moves lightness
 * and caps extreme saturation; hue is carried over untouched, so a red fill
 * stays red and a blue link stays blue instead of being inverted into cyan.
 *
 * - paper: every surface lands in a narrow dark band. Bright pastels keep a
 *   visible tint of their hue instead of glowing, and the plain white surface
 *   resolves to Google's own dark surface.
 * - ink: text lands in a narrow light band, so black text (Google's default) no
 *   longer disappears on a dark cell. Accent colours keep their hue and only
 *   lighten enough to clear the contrast bar.
 * - edge: strokes and small glyphs are pulled toward the middle of the range, so
 *   light grid lines darken and dark borders, arrows and ticks lighten; both stay
 *   visible against the dark surface.
 */
const PAPER_LIGHTNESS_BASE = 0.04;
const PAPER_LIGHTNESS_GAIN = 0.095;
const PAPER_MAX_SATURATION = 0.6;

const INK_LIGHTNESS_BASE = 0.86;
const INK_LIGHTNESS_GAIN = 0.12;
const INK_MAX_SATURATION = 0.85;

const EDGE_LIGHTNESS_BASE = 0.24;
const EDGE_BRIGHT_GAIN = 0.2;
const EDGE_DARK_GAIN = 0.24;
const EDGE_MAX_SATURATION = 0.6;

/** Above this lightness a painted colour is treated as a fill rather than a glyph. */
export const EDGE_SPLIT_LIGHTNESS = 0.55;

function clampUnit(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
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

function hslToRgba(hue: number, saturation: number, lightness: number, alpha: number): Rgba {
  if (saturation === 0) {
    const channel = Math.round(lightness * 255);
    return rgba(channel, channel, channel, alpha);
  }
  const second =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const first = 2 * lightness - second;
  return rgba(
    Math.round(hueToChannel(first, second, hue + 1 / 3) * 255),
    Math.round(hueToChannel(first, second, hue) * 255),
    Math.round(hueToChannel(first, second, hue - 1 / 3) * 255),
    alpha,
  );
}

function roleLightness(role: CanvasRole, lightness: number): number {
  const clamped = clampUnit(lightness);
  if (role === "paper") return PAPER_LIGHTNESS_BASE + PAPER_LIGHTNESS_GAIN * clamped;
  if (role === "ink") return INK_LIGHTNESS_BASE + INK_LIGHTNESS_GAIN * clamped;
  if (clamped >= 0.5) return EDGE_LIGHTNESS_BASE + (clamped - 0.5) * EDGE_BRIGHT_GAIN * 2;
  return EDGE_LIGHTNESS_BASE + (0.5 - clamped) * EDGE_DARK_GAIN * 2;
}

function roleMaxSaturation(role: CanvasRole): number {
  if (role === "ink") return INK_MAX_SATURATION;
  if (role === "edge") return EDGE_MAX_SATURATION;
  return PAPER_MAX_SATURATION;
}

/** Which role a path fill drawn in `color` most plausibly plays. */
export function roleForPathFill(color: Rgba): CanvasRole {
  const [, , lightness] = rgbToHsl(color);
  return lightness >= EDGE_SPLIT_LIGHTNESS ? "paper" : "edge";
}

/**
 * Recolour one colour for its role in the dark theme. Palette colours keep their
 * exact measured counterparts so the canvas matches the chrome; everything else
 * goes through the role curve.
 */
export function roleColor(color: Rgba, role: CanvasRole): Rgba {
  if (color.a === 0) return color;
  const palette = DARK_TABLE.get(colorKey(color));
  if (palette !== undefined) return palette;
  const [hue, saturation, lightness] = rgbToHsl(color);
  return hslToRgba(
    hue,
    Math.min(saturation, roleMaxSaturation(role)),
    roleLightness(role, lightness),
    color.a,
  );
}

/** Map a parsed colour to its dark-theme form, or return it unchanged. */
export function toDarkColor(color: Rgba): Rgba {
  if (color.a === 0) return color;
  return DARK_TABLE.get(colorKey(color)) ?? color;
}

/** Map a parsed colour back to its light-theme form, or return it unchanged. */
export function toLightColor(color: Rgba): Rgba {
  if (color.a === 0) return color;
  return LIGHT_TABLE.get(colorKey(color)) ?? color;
}

const HEX_PATTERN = /^#[0-9a-f]{3,8}$/u;
const HEX_DIGIT_COUNTS: ReadonlySet<number> = new Set([3, 4, 6, 8]);

function parseHex(hex: string): Rgba | null {
  if (!HEX_PATTERN.test(hex)) return null;
  const digits = hex.slice(1);
  if (!HEX_DIGIT_COUNTS.has(digits.length)) return null;
  const pairAt = (index: number): number => Number.parseInt(digits.slice(index, index + 2), 16);
  if (digits.length === 3 || digits.length === 4) {
    const expanded = [...digits].map((digit) => Number.parseInt(digit + digit, 16));
    const [r, g, b, a] = expanded;
    if (r === undefined || g === undefined || b === undefined) return null;
    return rgba(r, g, b, a ?? 255);
  }
  const r = pairAt(0);
  const g = pairAt(2);
  const b = pairAt(4);
  const a = digits.length === 8 ? pairAt(6) : 255;
  if ([r, g, b, a].some((value) => Number.isNaN(value))) return null;
  return rgba(r, g, b, a);
}

/**
 * The named colours that survive normalisation when Google assigns a keyword
 * instead of a literal. Anything else that is not a hex or `rgb()`/`rgba()`
 * function yields `null`, so the caller leaves it alone (gradients and patterns
 * arrive as objects, never as strings).
 */
const NAMED_COLORS: Readonly<Record<string, Rgba>> = Object.freeze({
  transparent: rgba(0, 0, 0, 0),
  white: rgba(255, 255, 255),
  black: rgba(0, 0, 0),
});

function parseChannel(segment: string): number | null {
  const percent = segment.endsWith("%");
  const value = Number.parseFloat(percent ? segment.slice(0, -1) : segment);
  if (!Number.isFinite(value)) return null;
  return clampByte(percent ? value * 2.55 : value);
}

function parseAlpha(segment: string): number | null {
  if (segment.endsWith("%")) {
    const percent = Number.parseFloat(segment.slice(0, -1));
    return Number.isFinite(percent) ? clampByte((percent / 100) * 255) : null;
  }
  const value = Number.parseFloat(segment);
  if (!Number.isFinite(value)) return null;
  // `rgb()` legacy syntax keeps alpha on the 0–1 scale; the modern syntax also
  // allows a raw byte, so a value above 1 is read as such.
  return clampByte(value <= 1 ? value * 255 : value);
}

function parseFunction(body: string): Rgba | null {
  const segments = body
    .replace(/\//gu, " ")
    .split(/[\s,]+/u)
    .filter((segment) => segment.length > 0);
  if (segments.length < 3 || segments.length > 4) return null;
  const [rs, gs, bs, as] = segments;
  if (rs === undefined || gs === undefined || bs === undefined) return null;
  const r = parseChannel(rs);
  const g = parseChannel(gs);
  const b = parseChannel(bs);
  if (r === null || g === null || b === null) return null;
  if (as === undefined) return rgba(r, g, b);
  const a = parseAlpha(as);
  if (a === null) return null;
  return rgba(r, g, b, a);
}

/**
 * Parse the canonical colour strings a 2D context produces. Anything that is not
 * a hex literal, an `rgb()`/`rgba()` function or one of the few named colours
 * yields `null`.
 */
export function parseColor(input: string): Rgba | null {
  const value = input.trim().toLowerCase();
  const named = NAMED_COLORS[value];
  if (named !== undefined) return named;
  if (value.startsWith("#")) return parseHex(value);
  const open = value.indexOf("(");
  if (open === -1 || !value.endsWith(")")) return null;
  const name = value.slice(0, open);
  if (name !== "rgb" && name !== "rgba") return null;
  return parseFunction(value.slice(open + 1, -1));
}

const hexByte = (value: number): string => value.toString(16).padStart(2, "0");

/**
 * Render a colour the way a 2D context reports it: `#rrggbb` when opaque and
 * `rgba(r, g, b, a)` when translucent. Keeping the opaque form hexadecimal means
 * a value read back from the context matches what Google compares against.
 */
export function formatColor(color: Rgba): string {
  const { r, g, b, a } = color;
  if (a >= 255) return `#${hexByte(r)}${hexByte(g)}${hexByte(b)}`;
  return `rgba(${r}, ${g}, ${b}, ${Number((a / 255).toFixed(3))})`;
}

/** Canonicalise a CSS colour string, or return it verbatim when unparseable. */
export function normalizeColor(input: string): string {
  const parsed = parseColor(input);
  return parsed === null ? input : formatColor(parsed);
}

export function colorsEqual(left: Rgba, right: Rgba): boolean {
  return left.r === right.r && left.g === right.g && left.b === right.b && left.a === right.a;
}

/**
 * Recolour one CSS colour string for the given theme. A colour that does not
 * change is returned as the exact input, not a re-formatted string, so Google's
 * own read-back stays byte-identical for author colours.
 */
export function recolorCssColor(input: string, mode: "dark" | "light"): string {
  const parsed = parseColor(input);
  if (parsed === null) return input;
  const mapped = mode === "dark" ? toDarkColor(parsed) : toLightColor(parsed);
  if (colorsEqual(mapped, parsed)) return input;
  return formatColor(mapped);
}

/**
 * Recolour one CSS colour string for a role in the dark theme. Returns the
 * exact input when the colour does not change, so Google's own read-back stays
 * byte-identical.
 */
export function recolorCssColorForRole(input: string, role: CanvasRole): string {
  const parsed = parseColor(input);
  if (parsed === null) return input;
  const mapped = roleColor(parsed, role);
  if (colorsEqual(mapped, parsed)) return input;
  return formatColor(mapped);
}

/**
 * The integer-keyed pixel table for a set of colour pairs. The first pair for a
 * key wins, so callers put exact palette pairs first and measured pairs after.
 */
export function buildPixelTable(pairs: Iterable<readonly [Rgba, Rgba]>): Map<number, Rgba> {
  const table = new Map<number, Rgba>();
  for (const [from, to] of pairs) {
    const key = pixelKeyOf(from);
    if (table.has(key)) continue;
    table.set(key, to);
  }
  return table;
}

/** The measured palette for `mode`, as a plain integer-keyed map. */
export function palettePixels(mode: "dark" | "light"): ReadonlyMap<number, Rgba> {
  return mode === "dark" ? DARK_PIXELS : LIGHT_PIXELS;
}

/**
 * Recolour an RGBA pixel buffer in place from `table`, optionally sweeping
 * near-white fringes of the surface into `sweep` so a runtime toggle leaves no
 * bright halo. Returns whether any pixel changed, so a caller can skip the
 * expensive `putImageData` upload.
 */
export function mapPixels(
  data: Uint8ClampedArray,
  table: ReadonlyMap<number, Rgba>,
  sweep: Rgba | null,
): boolean {
  let changed = false;
  for (let index = 0; index + 3 < data.length; index += 4) {
    const alpha = data[index + 3] ?? 0;
    if (alpha === 0) continue;
    const r = data[index] ?? 0;
    const g = data[index + 1] ?? 0;
    const b = data[index + 2] ?? 0;
    const mapped = table.get(pixelKey(r, g, b, alpha));
    if (mapped !== undefined) {
      data[index] = mapped.r;
      data[index + 1] = mapped.g;
      data[index + 2] = mapped.b;
      data[index + 3] = mapped.a;
      changed = true;
      continue;
    }
    if (sweep === null) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (min < FRINGE_MIN_CHANNEL || max - min > FRINGE_MAX_SPREAD) continue;
    data[index] = sweep.r;
    data[index + 1] = sweep.g;
    data[index + 2] = sweep.b;
    changed = true;
  }
  return changed;
}

/** The dark surface a near-white fringe is swept into. */
export const FRINGE_SWEEP: Rgba = DARK_SURFACE;

/**
 * Recolour an RGBA pixel buffer in place using only the measured palette;
 * everything else is left as it is. This is the conservative entry point the
 * controller used before role tables existed, kept for callers and tests that
 * only need the measured colours.
 */
export function recolorPixels(data: Uint8ClampedArray, mode: "dark" | "light"): boolean {
  return mapPixels(data, palettePixels(mode), mode === "dark" ? FRINGE_SWEEP : null);
}
