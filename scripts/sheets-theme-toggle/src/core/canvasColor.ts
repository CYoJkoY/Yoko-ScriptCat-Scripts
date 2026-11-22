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

/**
 * A recorded text colour and the tone it becomes in the dark theme. Google
 * anti-aliases glyphs against the light surface, so a glyph's edge pixels are
 * blends of the text colour with white — they are neither the text colour nor
 * the surface. Mapping only the exact colour leaves those edges dark, which
 * reads as invisible text on a dark cell. Interpolating the same blend ratio
 * between the dark tone and the dark surface rebuilds the ramp, so a switched
 * canvas keeps the same anti-aliasing a fresh redraw would produce.
 */
export interface BridgeLine {
  readonly from: Rgba;
  readonly to: Rgba;
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

/**
 * Anti-aliased text and grid lines over a bright surface also produce lighter
 * *mid* neutrals, not just the near-white ones the fringe sweep catches. Left as
 * they are, those greys glow as a bright halo the moment the surface turns dark
 * ("noise"). A neutral pixel is any whose channels differ by at most this much;
 * such pixels above the lightness floor are folded into the paper curve so they
 * settle into the dark surface. Coloured pixels (fills, images) and dark neutrals
 * keep their values, so nothing is inverted.
 */
const NEUTRAL_SPREAD = 24;
const NEUTRAL_LIGHTNESS_MIN = 0.5;

/**
 * Pale tints are the other half of the same problem: anti-aliased blends of a
 * colored element (selection highlight, pastel fill, colored text, conditional
 * format) with the bright surface are light and slightly tinted rather than
 * neutral, so a neutral-only fold would leave them glowing as colored specks on
 * the dark surface. Every pixel at or above this lightness is darkened along the
 * paper curve with its hue (channel ratios) preserved — never inverted — so the
 * pale fill settles into the dark background while staying the same hue and a
 * saturated highlight stops glaring. Channel spread is deliberately ignored: a
 * bright pastel (`#fce8b2`) has a spread above 64 and used to be skipped
 * wholesale, which is exactly the bright patch that survived a switch.
 */
const LIGHT_FOLD_MIN_LIGHTNESS = 0.42;

/**
 * A pixel is on a recorded text colour's anti-aliasing ramp when it sits within
 * this many channel units of the line the blend traces from the text colour to
 * white. The tolerance is loose enough for JPEG-free canvas quantisation and
 * tight enough that an unrelated fill is not mistaken for part of a glyph.
 */
const BRIDGE_TOLERANCE = 14;

/**
 * Ramps are followed all the way to the surface tone. The near-white sweep runs
 * first, so a neutral fringe never reaches a bridge line; letting a ramp reach
 * t = 1 only means the faintest edge of a glyph lands exactly on the dark
 * surface instead of being left behind as a stale light pixel.
 */
const BRIDGE_T_MAX = 1;

/** Marker for "no ramp / no fold applies to this pixel". */
const PACKED_NONE = -1;

/**
 * Six bits per channel as a memo key. A grid is dominated by flat fills, so one
 * lookup per distinct tone replaces thousands of per-pixel line projections; the
 * quantisation costs at most two levels of accuracy, which is invisible.
 */
const quantKey = (r: number, g: number, b: number): number =>
  ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);

const packRgb = (r: number, g: number, b: number): number =>
  (clampByte(r) << 16) | (clampByte(g) << 8) | clampByte(b);

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

let neutralDarkLutCache: Uint8Array | null = null;

/**
 * A 256-entry lookup that folds a neutral grey channel into the dark paper band.
 * Only channels at or above {@link NEUTRAL_LIGHTNESS_MIN} move — darker neutrals
 * (text that is already dark, true black) pass through untouched — so a runtime
 * switch cannot leave a bright grey halo, yet nothing is pushed toward white.
 */
export function neutralDarkLut(): Uint8Array {
  if (neutralDarkLutCache !== null) return neutralDarkLutCache;
  const lut = new Uint8Array(256);
  for (let value = 0; value < 256; value += 1) {
    const lightness = value / 255;
    lut[value] =
      lightness >= NEUTRAL_LIGHTNESS_MIN
        ? Math.round(roleLightness("paper", lightness) * 255)
        : value;
  }
  neutralDarkLutCache = lut;
  return lut;
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
 * Where a pixel sits on a recorded text colour's anti-aliasing ramp: `t` is the
 * fraction of the way from the glyph tone to white, so `0` is the glyph core and
 * `1` would be the bare surface. The dark result is the same fraction of the way
 * from the dark ink tone to the dark surface, which rebuilds the ramp instead of
 * leaving it dark. Returns the packed dark RGB, or {@link PACKED_NONE} when the
 * pixel is not on any ramp.
 */
function bridgePixel(r: number, g: number, b: number, lines: readonly BridgeLine[]): number {
  let result = PACKED_NONE;
  let bestResidual = Number.POSITIVE_INFINITY;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    const from = line.from;
    const dr = 255 - from.r;
    const dg = 255 - from.g;
    const db = 255 - from.b;
    const lengthSquared = dr * dr + dg * dg + db * db;
    // A colour that already is white traces no ramp.
    if (lengthSquared === 0) continue;
    const raw = ((r - from.r) * dr + (g - from.g) * dg + (b - from.b) * db) / lengthSquared;
    // Slightly darker than the glyph tone still counts as core (subpixel
    // rendering overshoots), but a pixel well past white is a different colour.
    if (raw > BRIDGE_T_MAX || raw < -0.25) continue;
    const t = raw < 0 ? 0 : raw;
    const residual = Math.max(
      Math.abs(r - (from.r + dr * t)),
      Math.abs(g - (from.g + dg * t)),
      Math.abs(b - (from.b + db * t)),
    );
    if (residual > BRIDGE_TOLERANCE) continue;
    const distance = (r - from.r) ** 2 + (g - from.g) ** 2 + (b - from.b) ** 2;
    // The closest ramp wins; a near tie goes to the colour the pixel itself sits
    // on, so a glyph's own tone beats a longer line that merely passes through
    // it (the black text ramp contains every neutral grey).
    if (residual > bestResidual + 2) continue;
    if (residual < bestResidual - 2 || distance < bestDistance) {
      bestResidual = residual;
      bestDistance = distance;
      const to = line.to;
      result = packRgb(
        to.r + (DARK_SURFACE.r - to.r) * t,
        to.g + (DARK_SURFACE.g - to.g) * t,
        to.b + (DARK_SURFACE.b - to.b) * t,
      );
    }
  }
  return result;
}

/**
 * Fold a pixel that is not part of a glyph into the dark surface: neutral greys
 * go through the cached lightness table, and every bright tint is darkened along
 * the paper curve with its hue preserved. Returns the packed dark RGB, or
 * {@link PACKED_NONE} when the pixel must keep its value.
 */
function foldPixel(r: number, g: number, b: number, spread: number, lut: Uint8Array): number {
  if (spread <= NEUTRAL_SPREAD) {
    const grey = Math.round((r + g + b) / 3);
    const value = lut[grey] ?? grey;
    if (value === grey) return PACKED_NONE;
    return packRgb(value, value, value);
  }
  const lightness = (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
  if (lightness < LIGHT_FOLD_MIN_LIGHTNESS) return PACKED_NONE;
  // Scale the channels by the paper curve's lightness ratio, so the hue (channel
  // ratios) survives and only the brightness is pulled down.
  const ratio = roleLightness("paper", lightness) / lightness;
  return packRgb(r * ratio, g * ratio, b * ratio);
}

/**
 * Recolour an RGBA pixel buffer in place from `table`, optionally sweeping
 * near-white fringes of the surface into `sweep` so a runtime toggle leaves no
 * bright halo. When `neutralLut` is supplied, lighter neutral greys (anti-aliased
 * edge blends that neither the exact table nor the near-white sweep touches) are
 * folded into the dark surface, and bright coloured tints are darkened with their
 * hue kept, clearing the halo and the glaring patches a dark switch would
 * otherwise expose. When `lines` is supplied, pixels on a recorded text colour's
 * anti-aliasing ramp are rebuilt against the dark surface instead of staying
 * dark, so switched text is as legible as a fresh redraw. Returns whether any
 * pixel changed, so a caller can skip the expensive `putImageData` upload.
 *
 * When `mask` is given, a non-zero entry leaves that pixel untouched. The
 * controller masks the rectangles Google painted with `drawImage`, so in-cell
 * images and emoji bitmaps keep their exact pixels through a theme switch.
 */
export function mapPixels(
  data: Uint8ClampedArray,
  table: ReadonlyMap<number, Rgba>,
  sweep: Rgba | null,
  neutralLut: Uint8Array | null = null,
  mask: Uint8Array | null = null,
  lines: readonly BridgeLine[] | null = null,
): boolean {
  let changed = false;
  const ramps = lines !== null && lines.length > 0 ? lines : null;
  /**
   * Both passes are pure functions of the tone and a canvas is mostly flat
   * fills, so one memo each removes nearly all of the per-pixel work. The caches
   * live for this call only; they must not leak between canvases or modes.
   */
  const rampCache: Map<number, number> | null = ramps === null ? null : new Map();
  const foldCache: Map<number, number> | null = neutralLut === null ? null : new Map();
  for (let index = 0; index + 3 < data.length; index += 4) {
    // A masked pixel holds content the script must not reinterpret, such as an
    // image Google drew with `drawImage`; it is left byte-for-byte alone.
    if (mask !== null && mask[index >> 2] === 1) continue;
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
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const spread = max - min;
    if (sweep !== null && min >= FRINGE_MIN_CHANNEL && max - min <= FRINGE_MAX_SPREAD) {
      data[index] = sweep.r;
      data[index + 1] = sweep.g;
      data[index + 2] = sweep.b;
      changed = true;
      continue;
    }
    const key = quantKey(r, g, b);
    if (ramps !== null && rampCache !== null) {
      let packed = rampCache.get(key);
      if (packed === undefined) {
        packed = bridgePixel(r, g, b, ramps);
        rampCache.set(key, packed);
      }
      if (packed !== PACKED_NONE) {
        data[index] = (packed >> 16) & 255;
        data[index + 1] = (packed >> 8) & 255;
        data[index + 2] = packed & 255;
        changed = true;
        continue;
      }
    }
    if (neutralLut === null || foldCache === null) continue;
    let folded = foldCache.get(key);
    if (folded === undefined) {
      folded = foldPixel(r, g, b, spread, neutralLut);
      foldCache.set(key, folded);
    }
    if (folded === PACKED_NONE) continue;
    data[index] = (folded >> 16) & 255;
    data[index + 1] = (folded >> 8) & 255;
    data[index + 2] = folded & 255;
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
  return mapPixels(
    data,
    palettePixels(mode),
    mode === "dark" ? FRINGE_SWEEP : null,
    mode === "dark" ? neutralDarkLut() : null,
  );
}
