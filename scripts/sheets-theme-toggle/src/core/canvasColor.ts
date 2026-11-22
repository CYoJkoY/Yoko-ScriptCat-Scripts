/**
 * Role-based colour mapping for the Google Sheets grid canvas.
 *
 * The grid is painted into a single `<canvas>`, so the dark theme cannot be
 * expressed in CSS. Google draws its own chrome — the cell surface, the default
 * text, the row/column header band, the grid lines and the selection highlight —
 * from a small, fixed palette, so the script maps exactly those palette colours
 * and leaves every other colour on the canvas alone. That is what keeps the
 * promise honest: an author fill (`#f8cbad`, `#fbe5d6`, a grey `#d0cece`
 * column) and an author black font (`#000000`) are not in the palette, so they
 * come through untouched. The spreadsheet data and every cell format are never
 * touched; only the paint Google emits is remapped.
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
const pixelKey = (r: number, g: number, b: number, a: number): number =>
  (((r << 24) | (g << 16) | (b << 8) | a) >>> 0);

function buildPixelTable(from: "light" | "dark", to: "light" | "dark"): Map<number, Rgba> {
  const table = new Map<number, Rgba>();
  for (const pair of CANVAS_PALETTE) {
    const source = pair[from];
    const key = pixelKey(source.r, source.g, source.b, source.a);
    if (table.has(key)) continue;
    table.set(key, pair[to]);
  }
  return table;
}

const DARK_PIXELS = buildPixelTable("light", "dark");
const LIGHT_PIXELS = buildPixelTable("dark", "light");

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

function colorsEqual(left: Rgba, right: Rgba): boolean {
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
 * Recolour an RGBA pixel buffer in place. Palette colours move; near-white
 * fringes of the surface are swept into the dark surface so a runtime toggle
 * leaves no bright halo; everything else — author fills and author text of every
 * colour, including black — is left as it is. Returns whether any pixel changed,
 * so a caller can skip the expensive `putImageData` upload.
 */
export function recolorPixels(data: Uint8ClampedArray, mode: "dark" | "light"): boolean {
  const table = mode === "dark" ? DARK_PIXELS : LIGHT_PIXELS;
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
    if (mode !== "dark") continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (min < FRINGE_MIN_CHANNEL || max - min > FRINGE_MAX_SPREAD) continue;
    data[index] = DARK_SURFACE.r;
    data[index + 1] = DARK_SURFACE.g;
    data[index + 2] = DARK_SURFACE.b;
    changed = true;
  }
  return changed;
}
