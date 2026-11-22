import { THEME_MODE, type ThemeMode } from "../config";
import {
  CANVAS_PALETTE,
  FRINGE_SWEEP,
  buildPixelTable,
  formatColor,
  mapPixels,
  neutralDarkLut,
  normalizeColor,
  palettePixels,
  parseColor,
  pixelKeyOf,
  roleColor,
  roleForPathFill,
  type CanvasRole,
  type Rgba,
} from "./canvasColor";

const GRID_CONTAINER_SELECTOR = "#waffle-grid-container";
const GRID_CANVAS_SELECTOR = "#waffle-grid-container canvas";
const CHART_SELECTOR = ".waffle-chart, [class*='chart']";
const COLOR_CACHE_LIMIT = 512;
const ROLE_RECORD_LIMIT = 512;
/** Drawings kept per canvas for the bridge mask; the grid reuses its rects. */
const IMAGE_RECT_LIMIT = 64;

/**
 * A canvas the grid blits from is treated as a render cache of sheet paint when
 * enough of it is near-white paper. Photos, emoji bitmaps and other opaque
 * content fail this test and are left alone.
 */
const TILE_PAPER_MIN_CHANNEL = 224;
const TILE_PAPER_MAX_SPREAD = 24;
const TILE_PAPER_RATIO = 0.35;
/** Pixels read per cache check; large caches are sampled, not scanned whole. */
const TILE_SAMPLE_LIMIT = 4096;

/**
 * A theme switch can only recolour the pixels already in the canvas; it cannot
 * rebuild the anti-aliasing Google would have painted against a dark surface,
 * so blends of text, grid lines and fills with the old white background survive
 * as bright specks until the grid is redrawn. Sheets redraws on scroll but
 * ignores a synthetic `resize` whose dimensions it knows are unchanged, which
 * is why a manual page reload used to be the only cure. Nudging the grid's own
 * scroll box by a single pixel and restoring it a frame later makes Sheets
 * redraw the visible grid through the hooks, so the canvas becomes natively
 * anti-aliased dark instead of bridged pixel soup.
 */
const REPAINT_NUDGE_PX = 1;

/** Sheets debounces its own layout work, so the resize ping is repeated. */
const REPAINT_RETRY_MS = 120;

/** A late ping, for a Sheets tab that was throttled while the switch happened. */
const REPAINT_LATE_MS = 400;

/**
 * The nearest ancestor that Sheets would scroll, i.e. the element whose content
 * is taller or wider than its box. Both metrics are plain geometry reads, and a
 * box that cannot scroll (jsdom, a freshly built container) is simply skipped.
 */
function scrollBoxOf(node: Element): HTMLElement | null {
  if (!("scrollTop" in node) || !("clientHeight" in node)) return null;
  const element = node as HTMLElement;
  const scrollsDown = element.scrollHeight > element.clientHeight + REPAINT_NUDGE_PX;
  const scrollsAcross = element.scrollWidth > element.clientWidth + REPAINT_NUDGE_PX;
  return scrollsDown || scrollsAcross ? element : null;
}

type StyleProperty = "fillStyle" | "strokeStyle";
type DrawMethod = "fillText" | "strokeText" | "fillRect" | "fill" | "stroke" | "strokeRect";

interface RoleRecord {
  readonly color: Rgba;
  readonly role: CanvasRole;
}

interface StyleBinding {
  assignedValue(self: object): unknown;
  hasAssigned(self: object): boolean;
  setAssigned(self: object, value: unknown): void;
  deleteAssigned(self: object): void;
  writeRaw(self: object, value: unknown): void;
  restore(): void;
}

export interface CanvasThemeOptions {
  readonly doc?: Document;
  readonly scope?: object;
  readonly page?: object | null;
}

export interface CanvasThemeController {
  setMode(mode: ThemeMode): void;
  dispose(): void;
}

interface ContextConstructor {
  readonly prototype: object;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCanvasElement(value: unknown): value is HTMLCanvasElement {
  return isRecord(value) && Reflect.get(value, "nodeType") === 1 && typeof Reflect.get(value, "getContext") === "function";
}

function resolveContextConstructor(
  candidates: readonly unknown[],
  key = "CanvasRenderingContext2D",
): ContextConstructor | null {
  for (const host of candidates) {
    if (!isRecord(host)) continue;
    const candidate = host[key];
    if (typeof candidate !== "function") continue;
    const prototype: unknown = candidate.prototype;
    if (isRecord(prototype)) return { prototype };
  }
  return null;
}

function hookStyleProperty(
  prototype: object,
  property: StyleProperty,
  remap: (self: object, value: unknown) => unknown,
): StyleBinding | null {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
  if (descriptor === undefined) return null;
  if (descriptor.get === undefined && descriptor.set === undefined && !("value" in descriptor)) return null;

  const assigned = new WeakMap<object, unknown>();
  const readOriginal = (self: object): unknown => {
    if (assigned.has(self)) return assigned.get(self);
    if (descriptor.get !== undefined) return descriptor.get.call(self);
    return descriptor.value;
  };
  const writeOriginal = (self: object, value: unknown): void => {
    if (descriptor.set !== undefined) {
      descriptor.set.call(self, value);
      return;
    }
    Reflect.defineProperty(self, property, { value, writable: true, configurable: true, enumerable: true });
  };

  const accessor: PropertyDescriptor = {
    configurable: true,
    enumerable: descriptor.enumerable ?? false,
    get(this: object): unknown {
      const original = readOriginal(this);
      return typeof original === "string" ? normalizeColor(original) : original;
    },
    set(this: object, value: unknown): void {
      assigned.set(this, value);
      writeOriginal(this, remap(this, value));
    },
  };

  try {
    Reflect.defineProperty(prototype, property, accessor);
  } catch (error) {
    if (error instanceof TypeError) return null;
    throw error;
  }

  return {
    assignedValue: (self) => readOriginal(self),
    hasAssigned: (self) => assigned.has(self),
    setAssigned: (self, value) => {
      assigned.set(self, value);
    },
    deleteAssigned: (self) => {
      assigned.delete(self);
    },
    writeRaw: (self, value) => writeOriginal(self, value),
    restore: () => {
      const current = Object.getOwnPropertyDescriptor(prototype, property);
      if (current === undefined || current.get !== accessor.get) return;
      Reflect.defineProperty(prototype, property, descriptor);
    },
  };
}

function hookDrawMethod(
  prototype: object,
  method: DrawMethod,
  draw: Function,
  role: (self: object, args: readonly unknown[]) => CanvasRole,
  fill: StyleBinding,
  stroke: StyleBinding,
  themed: (self: object) => boolean,
  record: (self: object, color: Rgba, role: CanvasRole) => void,
  darkColor: (color: Rgba, role: CanvasRole) => string,
  dark: () => boolean,
): (() => void) | null {
  const original = Object.getOwnPropertyDescriptor(prototype, method);
  if (original?.value !== draw || typeof draw !== "function") return null;
  const wrapper = function (this: object, ...args: unknown[]): unknown {
    // Adopt the canvas first so the very draw that paints a switched worksheet
    // is themed; a later record then finds it registered.
    const isGrid = themed(this);
    const style = method === "fillText" || method === "fillRect" || method === "fill" ? fill : stroke;
    const defaultRole: CanvasRole = style === fill ? "paper" : "edge";
    const current = style.assignedValue(this);
    const currentColor = typeof current === "string" ? parseColor(current) : null;
    const currentRole = role(this, args);
    if (currentColor !== null) record(this, currentColor, currentRole);
    if (!isGrid || currentColor === null || !dark()) return draw.apply(this, args);
    style.writeRaw(this, darkColor(currentColor, currentRole));
    try {
      return draw.apply(this, args);
    } finally {
      // Leave the style in the state the setter would have produced, so a draw
      // that bypasses these wrappers never picks up an unthemed colour.
      style.writeRaw(this, darkColor(currentColor, defaultRole));
    }
  };
  try {
    Reflect.defineProperty(prototype, method, { ...original, value: wrapper });
  } catch (error) {
    if (error instanceof TypeError) return null;
    throw error;
  }
  return () => {
    const current = Object.getOwnPropertyDescriptor(prototype, method);
    if (current?.value !== wrapper) return;
    Reflect.defineProperty(prototype, method, original);
  };
}

/**
 * Wrap an existing prototype method so extra behaviour can run around it.
 * Returns a restore function, or null when the method cannot be wrapped.
 */
function wrapPrototypeMethod(
  prototype: object,
  name: string,
  wrap: (next: Function) => Function,
): (() => void) | null {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
  if (descriptor === undefined) return null;
  const original = descriptor.value;
  if (typeof original !== "function") return null;
  const wrapper = wrap(original);
  try {
    Reflect.defineProperty(prototype, name, { ...descriptor, value: wrapper });
  } catch (error) {
    if (error instanceof TypeError) return null;
    throw error;
  }
  return () => {
    const current = Object.getOwnPropertyDescriptor(prototype, name);
    if (current?.value !== wrapper) return;
    Reflect.defineProperty(prototype, name, descriptor);
  };
}

export function installCanvasTheme(options: CanvasThemeOptions = {}): CanvasThemeController {
  const doc = options.doc ?? document;
  const scope = options.scope ?? globalThis;
  const page = options.page ?? (isRecord(scope) ? Reflect.get(scope, "unsafeWindow") : null);
  const constructor = resolveContextConstructor([page, scope]);
  let mode: ThemeMode = THEME_MODE.LIGHT;
  let applied: ThemeMode | null = null;
  let disposed = false;

  const themed = new WeakSet<object>();
  const canvases = new Set<HTMLCanvasElement>();
  /**
   * Detached or offscreen canvases the grid blits from. Sheets caches rendered
   * cells in them; if they were painted before the hooks existed they blit as
   * light rectangles, which is the pixel noise a reload used to clear.
   */
  const sources = new Set<HTMLCanvasElement>();
  /**
   * Canvases the grid blits from that were judged not to be sheet paint. The
   * check needs a full pixel read, so a negative answer is remembered instead of
   * being recomputed on every frame.
   */
  const foreignSources = new WeakSet<object>();
  const rendered = new WeakMap<HTMLCanvasElement, ThemeMode>();
  const records = new WeakMap<HTMLCanvasElement, Map<number, RoleRecord>>();
  /** Rectangles where `drawImage` was called; kept for the bridge mask. */
  const imageRects = new WeakMap<HTMLCanvasElement, Array<readonly [number, number, number, number]>>();
  const gridFlags = new WeakMap<object, boolean>();
  const colorCache = new Map<string, string>();
  const restores: (() => void)[] = [];
  const repaintTimers: number[] = [];
  /** Saved `save()` stacks of assigned style values, kept in step with the native state. */
  const styleStack = new WeakMap<
    object,
    Array<{ fill: { present: boolean; value: unknown }; stroke: { present: boolean; value: unknown } }>
  >();

  const themedColor = (color: Rgba, role: CanvasRole): string => {
    const key = `${role}|${pixelKeyOf(color)}`;
    const cached = colorCache.get(key);
    if (cached !== undefined) return cached;
    const value = formatColor(roleColor(color, role));
    if (colorCache.size >= COLOR_CACHE_LIMIT) colorCache.clear();
    colorCache.set(key, value);
    return value;
  };

  const contextCanvas = (self: object): HTMLCanvasElement | null => {
    const canvas = Reflect.get(self, "canvas");
    return isCanvasElement(canvas) ? canvas : null;
  };

  /** The canvas or OffscreenCanvas behind a context, without the DOM check. */
  const contextSurface = (self: object): object | null => {
    const surface: unknown = Reflect.get(self, "canvas");
    return isRecord(surface) ? surface : null;
  };

  /**
   * Decide whether a canvas is the sheet grid, read straight from the DOM. A
   * switched worksheet is repainted in the same task that swaps the canvas, so
   * waiting for the observer's microtask would let the first paint run
   * unthemed and leave anti-aliased noise; asking the DOM synchronously closes
   * that window. A "yes" never changes, so it is cached; a "no" is only trusted
   * once the canvas is in the document, so one painted before insertion is
   * re-checked on its next draw.
   */
  const classifyGrid = (canvas: HTMLCanvasElement): boolean => {
    const cached = gridFlags.get(canvas);
    if (cached !== undefined) return cached;
    const isChart = canvas.closest(CHART_SELECTOR) !== null;
    const isGrid = !isChart && canvas.closest(GRID_CONTAINER_SELECTOR) !== null;
    if (isGrid || canvas.isConnected) gridFlags.set(canvas, isGrid);
    return isGrid;
  };
  const adopt = (canvas: HTMLCanvasElement): void => {
    if (canvases.has(canvas)) return;
    canvases.add(canvas);
    themed.add(canvas);
    // A synchronously adopted canvas is painted through the interceptors, so its
    // pixels already match `mode`; no separate pixel pass is needed here.
    rendered.set(canvas, mode);
  };
  const isThemedContext = (self: object): boolean => {
    const surface = contextSurface(self);
    if (surface === null) return false;
    if (themed.has(surface)) return true;
    // A detached or offscreen surface has no DOM ancestry to classify; it joins
    // the theme only once the grid is seen drawing from it.
    if (!isCanvasElement(surface)) return false;
    if (!classifyGrid(surface)) return false;
    adopt(surface);
    return true;
  };
  const remember = (self: object, color: Rgba, role: CanvasRole): void => {
    const canvas = contextCanvas(self);
    if (canvas === null || !themed.has(canvas)) return;
    let canvasRecords = records.get(canvas);
    if (canvasRecords === undefined) {
      canvasRecords = new Map();
      records.set(canvas, canvasRecords);
    }
    const key = pixelKeyOf(color);
    if (!canvasRecords.has(key) && canvasRecords.size >= ROLE_RECORD_LIMIT) {
      const first = canvasRecords.keys().next().value;
      if (typeof first === "number") canvasRecords.delete(first);
    }
    if (!canvasRecords.has(key)) canvasRecords.set(key, { color, role });
  };

  const remap = (role: CanvasRole) => (self: object, value: unknown): unknown => {
    if (typeof value !== "string") return value;
    const parsed = parseColor(value);
    if (parsed === null) return value;
    if (mode !== THEME_MODE.DARK || !isThemedContext(self)) return value;
    return themedColor(parsed, role);
  };

  const fill = constructor === null ? null : hookStyleProperty(constructor.prototype, "fillStyle", remap("paper"));
  const stroke = constructor === null ? null : hookStyleProperty(constructor.prototype, "strokeStyle", remap("edge"));
  if (fill !== null) restores.push(fill.restore);
  if (stroke !== null) restores.push(stroke.restore);

  // OffscreenCanvas has its own context prototype, so the hooks above never see
  // a cache Sheets renders there. Style hooks alone are enough: once such a
  // cache is adopted as a grid source, its paints follow the theme.
  const offscreenConstructor = resolveContextConstructor([page, scope], "OffscreenCanvasRenderingContext2D");
  if (offscreenConstructor !== null) {
    for (const [property, role] of [
      ["fillStyle", "paper"],
      ["strokeStyle", "edge"],
    ] as const) {
      const binding = hookStyleProperty(offscreenConstructor.prototype, property, remap(role));
      if (binding !== null) restores.push(binding.restore);
    }
  }

  const roleForMethod = (method: DrawMethod, self: object, args: readonly unknown[]): CanvasRole => {
    if (method === "fillText" || method === "strokeText") return "ink";
    if (method === "fillRect") return "paper";
    if (method === "fill") {
      const current = fill?.assignedValue(self);
      const color = typeof current === "string" ? parseColor(current) : null;
      return color === null ? "paper" : roleForPathFill(color);
    }
    return "edge";
  };

  /**
   * The device-space box a `drawImage` call covers. The three arities place the
   * destination differently, and the current transform (usually a DPR scale)
   * shifts it out of the canvas's bitmap pixels, so the corners are mapped and
   * reduced to a bounding box.
   */
  const imageDestinationOf = (
    self: object,
    args: readonly unknown[],
    canvas: HTMLCanvasElement,
  ): readonly [number, number, number, number] | null => {
    const num = (value: unknown, fallback: number): number =>
      typeof value === "number" && Number.isFinite(value) ? value : fallback;
    const dim = (value: unknown, key: "width" | "height"): number =>
      typeof value === "object" && value !== null ? num(Reflect.get(value, key), 0) : 0;
    const image = args[0];
    let dx = 0;
    let dy = 0;
    let dw = dim(image, "width") || canvas.width;
    let dh = dim(image, "height") || canvas.height;
    if (args.length >= 9) {
      // 9-argument: drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh)
      dx = num(args[5], 0);
      dy = num(args[6], 0);
      dw = num(args[7], dw);
      dh = num(args[8], dh);
    } else if (args.length >= 5) {
      // 5-argument: drawImage(image, dx, dy, dw, dh)
      dx = num(args[1], 0);
      dy = num(args[2], 0);
      dw = num(args[3], dw);
      dh = num(args[4], dh);
    } else if (args.length === 3) {
      // 3-argument: drawImage(image, dx, dy); size is the image's own dimensions.
      dx = num(args[1], 0);
      dy = num(args[2], 0);
    }
    if (dw <= 0 || dh <= 0) return null;
    let corners: Array<readonly [number, number]> = [
      [dx, dy],
      [dx + dw, dy],
      [dx, dy + dh],
      [dx + dw, dy + dh],
    ];
    const getTransform = Reflect.get(self, "getTransform");
    if (typeof getTransform === "function") {
      try {
        const matrix: unknown = getTransform.call(self);
        if (isRecord(matrix)) {
          const [a, b, c, d, e, f] = ["a", "b", "c", "d", "e", "f"].map((key) =>
            typeof Reflect.get(matrix, key) === "number" ? (Reflect.get(matrix, key) as number) : 0,
          ) as [number, number, number, number, number, number];
          corners = corners.map(([x, y]) => [a * x + c * y + e, b * x + d * y + f] as const);
        }
      } catch {
        // A context mid-teardown can reject the transform read; keep user space.
      }
    }
    const xs = corners.map(([x]) => x);
    const ys = corners.map(([, y]) => y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return [left, top, Math.max(...xs) - left, Math.max(...ys) - top];
  };

  /**
   * Route a gradient's colour stops through the same role curve as a solid
   * style, so a gradient overlay follows the theme instead of staying bright.
   */
  const decorateGradient = (gradient: unknown, self: object): void => {
    if (!isRecord(gradient)) return;
    const addColorStop = Reflect.get(gradient, "addColorStop");
    if (typeof addColorStop !== "function") return;
    const original: Function = addColorStop;
    const wrapped = function (this: object, offset: unknown, color: unknown): unknown {
      let mapped = color;
      if (typeof color === "string" && mode === THEME_MODE.DARK && isThemedContext(self)) {
        const parsed = parseColor(color);
        if (parsed !== null) mapped = themedColor(parsed, roleForPathFill(parsed));
      }
      return original.call(this, offset, mapped);
    };
    try {
      Reflect.defineProperty(gradient, "addColorStop", {
        configurable: true,
        writable: true,
        enumerable: false,
        value: wrapped,
      });
    } catch {
      // A frozen gradient object keeps its original colours.
    }
  };

  if (constructor !== null && fill !== null && stroke !== null) {
    const prototype = constructor.prototype;
    const methods: readonly DrawMethod[] = ["fillText", "strokeText", "fillRect", "fill", "stroke", "strokeRect"];
    for (const method of methods) {
      const draw = Reflect.get(prototype, method);
      if (typeof draw !== "function") continue;
      const restore = hookDrawMethod(
        prototype,
        method,
        draw,
        (self, args) => roleForMethod(method, self, args),
        fill,
        stroke,
        isThemedContext,
        remember,
        themedColor,
        () => mode === THEME_MODE.DARK,
      );
      if (restore !== null) restores.push(restore);
    }

    if (typeof Reflect.get(prototype, "save") === "function" && typeof Reflect.get(prototype, "restore") === "function") {
      const saveRestore = wrapPrototypeMethod(prototype, "save", (next) =>
        function (this: object, ...args: unknown[]): void {
          const stack = styleStack.get(this) ?? [];
          if (stack.length < 256) {
            stack.push({
              fill: { present: fill.hasAssigned(this), value: fill.assignedValue(this) },
              stroke: { present: stroke.hasAssigned(this), value: stroke.assignedValue(this) },
            });
            styleStack.set(this, stack);
          }
          return next.apply(this, args);
        });
      if (saveRestore !== null) restores.push(saveRestore);

      const restoreRestore = wrapPrototypeMethod(prototype, "restore", (next) =>
        function (this: object, ...args: unknown[]): void {
          const stack = styleStack.get(this);
          const saved = stack?.pop();
          if (saved === undefined) return next.apply(this, args);
          if (saved.fill.present) fill.setAssigned(this, saved.fill.value);
          else fill.deleteAssigned(this);
          if (saved.stroke.present) stroke.setAssigned(this, saved.stroke.value);
          else stroke.deleteAssigned(this);
          return next.apply(this, args);
        });
      if (restoreRestore !== null) restores.push(restoreRestore);
    }

    if (typeof Reflect.get(prototype, "drawImage") === "function") {
      const drawImageRestore = wrapPrototypeMethod(prototype, "drawImage", (next) =>
        function (this: object, ...args: unknown[]): unknown {
          // A tile cache is themed before the blit, so the pixels Sheets copies
          // onto the grid are already dark instead of a light rectangle.
          const source = adoptSourceImage(args[0]);
          const result = next.apply(this, args);
          const canvas = contextCanvas(this);
          if (canvas === null || !isThemedContext(this)) return result;
          // A themed cache holds our own paint; it is bridged like the grid
          // rather than masked out as opaque content.
          if (source !== null) return result;
          const rect = imageDestinationOf(this, args, canvas);
          if (rect === null) return result;
          const rects = imageRects.get(canvas) ?? [];
          if (rects.length >= IMAGE_RECT_LIMIT) rects.shift();
          rects.push(rect);
          imageRects.set(canvas, rects);
          return result;
        });
      if (drawImageRestore !== null) restores.push(drawImageRestore);
    }

    // Gradient overlays (frozen-pane shadows, selection washes) carry their
    // colour in `addColorStop`, never in `fillStyle`, so the style hooks cannot
    // reach them. Decorate each gradient the grid creates and map its stops too,
    // otherwise a white-to-transparent gradient stays a bright band on dark.
    for (const factory of ["createLinearGradient", "createRadialGradient", "createConicGradient"]) {
      if (typeof Reflect.get(prototype, factory) !== "function") continue;
      const restore = wrapPrototypeMethod(prototype, factory, (next) =>
        function (this: object, ...args: unknown[]): unknown {
          const gradient = next.apply(this, args);
          decorateGradient(gradient, this);
          return gradient;
        });
      if (restore !== null) restores.push(restore);
    }
  }

  const readPixels = (canvas: HTMLCanvasElement): ImageData | null => {
    const context = canvas.getContext("2d");
    if (context === null || canvas.width === 0 || canvas.height === 0) return null;
    try {
      return context.getImageData(0, 0, canvas.width, canvas.height);
    } catch (error) {
      if (error instanceof DOMException && error.name === "SecurityError") return null;
      throw error;
    }
  };

  const pixelTable = (canvas: HTMLCanvasElement, target: ThemeMode): ReadonlyMap<number, Rgba> => {
    const pairs: Array<readonly [Rgba, Rgba]> = CANVAS_PALETTE.map((pair) =>
      target === THEME_MODE.DARK ? [pair.light, pair.dark] : [pair.dark, pair.light],
    );
    const remembered = records.get(canvas);
    if (remembered !== undefined) {
      for (const { color, role } of remembered.values()) {
        pairs.push(
          target === THEME_MODE.DARK
            ? [color, roleColor(color, role)]
            : [roleColor(color, role), color],
        );
      }
    }
    return buildPixelTable(pairs);
  };

  const applyPixels = (canvas: HTMLCanvasElement, target: ThemeMode, useMask = true): boolean => {
    const image = readPixels(canvas);
    if (image === null) return false;
    // Pixels Google painted with `drawImage` are opaque content the script must
    // not reinterpret, so they are masked out of the bridge entirely.
    const rects = useMask ? imageRects.get(canvas) : undefined;
    let mask: Uint8Array | null = null;
    if (rects !== undefined && rects.length > 0 && image.width > 0 && image.height > 0) {
      mask = new Uint8Array(image.width * image.height);
      const total = image.width * image.height;
      for (const [rx, ry, rw, rh] of rects) {
        const left = Math.max(0, Math.floor(rx));
        const top = Math.max(0, Math.floor(ry));
        const right = Math.min(image.width, Math.ceil(rx + rw));
        const bottom = Math.min(image.height, Math.ceil(ry + rh));
        if (right <= left || bottom <= top) continue;
        // A rectangle covering half the canvas is a composited layer, not an
        // in-cell image: masking it would leave that whole area unthemed, so it
        // is deliberately bridged like the rest of the grid.
        if ((right - left) * (bottom - top) * 2 >= total) continue;
        for (let y = top; y < bottom; y += 1) {
          mask.fill(1, y * image.width + left, y * image.width + right);
        }
      }
    }
    const changed = mapPixels(
      image.data,
      pixelTable(canvas, target),
      target === THEME_MODE.DARK ? FRINGE_SWEEP : null,
      target === THEME_MODE.DARK ? neutralDarkLut() : null,
      mask,
    );
    if (!changed) return false;
    const context = canvas.getContext("2d");
    if (context === null) return false;
    try {
      context.putImageData(image, 0, 0);
    } catch (error) {
      if (error instanceof DOMException && error.name === "SecurityError") return false;
      throw error;
    }
    return true;
  };

  /**
   * Whether a canvas the grid blits from looks like cached sheet paint: mostly
   * near-white paper. Photos, charts and emoji atlases are mostly opaque colour
   * and fall below the ratio, so they are never reinterpreted as theme paint.
   */
  const looksLikeGridTile = (canvas: HTMLCanvasElement): boolean => {
    const image = readPixels(canvas);
    if (image === null) return false;
    const { data } = image;
    const total = Math.floor(data.length / 4);
    if (total === 0) return false;
    const step = Math.max(1, Math.floor(total / TILE_SAMPLE_LIMIT));
    let sampled = 0;
    let paper = 0;
    for (let pixel = 0; pixel < total; pixel += step) {
      const index = pixel * 4;
      if ((data[index + 3] ?? 0) === 0) continue;
      sampled += 1;
      const r = data[index] ?? 0;
      const g = data[index + 1] ?? 0;
      const b = data[index + 2] ?? 0;
      const max = Math.max(r, g, b);
      if (Math.min(r, g, b) >= TILE_PAPER_MIN_CHANNEL && max - Math.min(r, g, b) <= TILE_PAPER_MAX_SPREAD) {
        paper += 1;
      }
    }
    // A canvas with nothing on it yet is a render buffer, not an image.
    if (sampled === 0) return true;
    return paper / sampled >= TILE_PAPER_RATIO;
  };

  /**
   * Bring a canvas that the grid draws from into the theme before the blit, so
   * its pixels already match the mode instead of landing as a light rectangle.
   * Returns `"grid"` for the sheet canvas itself, `"cache"` for a themed tile
   * cache, and null for anything else (an image or an unfamiliar canvas, which
   * the bridge then masks as opaque content).
   */
  const adoptSourceImage = (image: unknown): "grid" | "cache" | null => {
    if (!isRecord(image) || typeof Reflect.get(image, "getContext") !== "function") return null;
    if (themed.has(image)) {
      const candidate = image as unknown as HTMLCanvasElement;
      return sources.has(candidate) ? "cache" : "grid";
    }
    const canvas = image as unknown as HTMLCanvasElement;
    if (isCanvasElement(canvas)) {
      // A canvas that is on the page elsewhere is not ours to theme.
      if (canvas.isConnected) return classifyGrid(canvas) ? "grid" : null;
    }
    if (foreignSources.has(canvas)) return null;
    // A detached or offscreen canvas only joins the theme when its content
    // looks like cached sheet paint; an image cache stays untouched.
    if (!looksLikeGridTile(canvas)) {
      foreignSources.add(canvas);
      return null;
    }
    themed.add(canvas);
    sources.add(canvas);
    // Bridge the cache in place so the blit that follows copies dark pixels.
    applyPixels(canvas, mode, false);
    rendered.set(canvas, mode);
    return "cache";
  };

/**
 * The grid box whose size Sheets derives the canvas from. A real, observable
 * size change is the one thing Sheets cannot optimise away: it re-lays out the
 * grid and repaints every visible cell through the draw hooks, exactly like a
 * page reload does.
 */
function gridBoxOf(canvas: HTMLCanvasElement): HTMLElement | null {
  const box = canvas.closest(GRID_CONTAINER_SELECTOR);
  if (box === null || !("style" in box)) return null;
  return box as HTMLElement;
}

  /**
   * Move the scroll box one pixel and put it back on the next frame. The
   * synthetic `scroll` reports the new offset immediately (Sheets redraws at
   * that offset), and the restore drives a native `scroll` once the position is
   * back, so the grid ends up redrawn at the correct offset.
   */
  const nudgeScroll = (host: HTMLElement, view: Window | null): void => {
    const top = host.scrollTop;
    const left = host.scrollLeft;
    const down = host.scrollHeight > host.clientHeight + REPAINT_NUDGE_PX;
    const across = host.scrollWidth > host.clientWidth + REPAINT_NUDGE_PX;
    const restore = (): void => {
      try {
        host.scrollTop = top;
        host.scrollLeft = left;
        host.dispatchEvent(new Event("scroll"));
      } catch {
        // A torn-down document can reject writes and events mid-navigation.
      }
    };
    try {
      if (down) host.scrollTop = top + REPAINT_NUDGE_PX;
      if (across) host.scrollLeft = left + REPAINT_NUDGE_PX;
      host.dispatchEvent(new Event("scroll"));
    } catch {
      return;
    }
    if (view !== null && typeof view.requestAnimationFrame === "function") {
      view.requestAnimationFrame(restore);
      return;
    }
    restore();
  };

  /**
   * Shrink the grid box by one pixel for two frames. Sheets sizes the grid
   * canvas from this box, so the size change makes its renderer rebuild the
   * canvas - the same path a page reload takes, and the only one that cannot be
   * skipped as a no-op. The inline height is restored exactly as it was, so
   * Google's own layout value is never lost.
   */
  const squeezeLayout = (box: HTMLElement, view: Window | null): void => {
    const height = box.clientHeight;
    if (height <= 2) return;
    const previous = box.style.getPropertyValue("height");
    const priority = box.style.getPropertyPriority("height");
    const restore = (): void => {
      try {
        if (previous === "") box.style.removeProperty("height");
        else box.style.setProperty("height", previous, priority);
      } catch {
        // A torn-down document can reject style writes mid-navigation.
      }
    };
    try {
      box.style.setProperty("height", `${height - 1}px`, "important");
    } catch {
      return;
    }
    if (view === null || typeof view.requestAnimationFrame !== "function") {
      restore();
      return;
    }
    view.requestAnimationFrame(() => {
      view.requestAnimationFrame(restore);
    });
  };

  const requestRepaint = (view: Window | null): void => {
    if (view === null) return;
    for (const canvas of canvases) {
      if (!canvas.isConnected) continue;
      const box = gridBoxOf(canvas);
      if (box !== null) squeezeLayout(box, view);
      let host: HTMLElement | null = null;
      for (let node = canvas.parentElement; node !== null && host === null; node = node.parentElement) {
        host = scrollBoxOf(node);
      }
      if (host !== null) {
        nudgeScroll(host, view);
        break;
      }
      if (box !== null) break;
    }
    const ping = (): void => {
      try {
        view.dispatchEvent(new Event("resize"));
      } catch {
        // A torn-down document can reject synthetic events during navigation.
      }
    };
    ping();
    if (typeof view.requestAnimationFrame === "function") {
      view.requestAnimationFrame(ping);
    }
    if (typeof view.setTimeout !== "function") return;
    for (const delay of [REPAINT_RETRY_MS, REPAINT_LATE_MS]) {
      const timer = view.setTimeout(() => {
        const index = repaintTimers.indexOf(timer);
        if (index !== -1) repaintTimers.splice(index, 1);
        ping();
      }, delay);
      repaintTimers.push(timer);
    }
  };

  const register = (canvas: HTMLCanvasElement): void => {
    if (canvases.has(canvas)) return;
    adopt(canvas);
    // A canvas the observer finds before it was adopted may hold light pixels
    // painted in a race; bridge them and ask Google to redraw so the bridging's
    // anti-aliased leftovers are replaced by a clean repaint.
    if (mode === THEME_MODE.DARK && applyPixels(canvas, THEME_MODE.DARK)) {
      requestRepaint(doc.defaultView);
    }
  };

  const scan = (): void => {
    if (disposed) return;
    for (const canvas of Array.from(canvases)) {
      if (canvas.isConnected) continue;
      canvases.delete(canvas);
      themed.delete(canvas);
    }
    for (const canvas of Array.from(doc.querySelectorAll<HTMLCanvasElement>(GRID_CANVAS_SELECTOR))) {
      if (canvas.closest(CHART_SELECTOR) === null) register(canvas);
    }
  };

  let scanQueued = false;
  const scheduleScan = (): void => {
    if (scanQueued || disposed) return;
    scanQueued = true;
    queueMicrotask(() => {
      scanQueued = false;
      scan();
    });
  };
  const observer =
    doc.documentElement === null || typeof MutationObserver !== "function"
      ? null
      : new MutationObserver(scheduleScan);
  observer?.observe(doc.documentElement, { childList: true, subtree: true });
  scan();

  return {
    setMode: (next) => {
      if (disposed) return;
      const changed = applied !== null && applied !== next;
      mode = next;
      if (next === THEME_MODE.DARK) scan();
      for (const canvas of canvases) {
        if (rendered.get(canvas) === next) continue;
        applyPixels(canvas, next);
        rendered.set(canvas, next);
      }
      // Tile caches hold the same paint as the grid; without this they would
      // keep blitting stale light pixels over the switched canvas.
      for (const source of sources) {
        if (rendered.get(source) === next) continue;
        applyPixels(source, next, false);
        rendered.set(source, next);
      }
      applied = next;
      if (changed) requestRepaint(doc.defaultView);
    },
    dispose: () => {
      if (disposed) return;
      const win = doc.defaultView;
      if (win !== null) {
        for (const timer of repaintTimers) win.clearTimeout(timer);
      }
      repaintTimers.length = 0;
      for (const canvas of canvases) {
        if (rendered.get(canvas) !== THEME_MODE.DARK) continue;
        applyPixels(canvas, THEME_MODE.LIGHT);
        rendered.set(canvas, THEME_MODE.LIGHT);
      }
      for (const source of sources) {
        if (rendered.get(source) !== THEME_MODE.DARK) continue;
        applyPixels(source, THEME_MODE.LIGHT, false);
        rendered.set(source, THEME_MODE.LIGHT);
      }
      disposed = true;
      observer?.disconnect();
      for (const restore of restores) restore();
      canvases.clear();
      sources.clear();
      colorCache.clear();
    },
  };
}
