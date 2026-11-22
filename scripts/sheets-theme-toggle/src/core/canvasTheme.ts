import { THEME_MODE, type ThemeMode } from "../config";
import { normalizeColor, recolorCssColor, recolorPixels } from "./canvasColor";

/**
 * The sheet body is a single `<canvas>` inside waffle's grid container. Charts
 * are drawn into canvases of their own and carry their own colours, so they are
 * filtered out rather than recoloured with the sheet.
 */
const GRID_CANVAS_SELECTOR = "#waffle-grid-container canvas";
const CHART_SELECTOR = ".waffle-chart, [class*='chart']";

/**
 * Google reuses a small palette, so the colour-string cache stays tiny; the cap
 * only guards against a pathological page that cycles through many colours.
 */
const COLOR_CACHE_LIMIT = 256;

type StyleProperty = "fillStyle" | "strokeStyle";

export interface CanvasThemeOptions {
  readonly doc?: Document;
  /** Sandbox global, which also exposes `unsafeWindow` when the manager grants it. */
  readonly scope?: object;
  /** Page-world object whose `CanvasRenderingContext2D` prototype Google writes to. */
  readonly page?: object | null;
}

export interface CanvasThemeController {
  /** Recolour the grid for `mode`; `light` restores the light pixels. */
  setMode(mode: ThemeMode): void;
  /** Undo the prototype patch and lift any recoloured canvas back to light. */
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

/**
 * Find the constructor whose prototype Google's 2D contexts inherit from. The
 * page world wins over the sandbox, because a context created by page code is an
 * instance of the page-world prototype even when the userscript runs sandboxed.
 */
function resolveContextConstructor(candidates: readonly unknown[]): ContextConstructor | null {
  for (const host of candidates) {
    if (!isRecord(host)) continue;
    const candidate = host["CanvasRenderingContext2D"];
    if (typeof candidate !== "function") continue;
    const prototype: unknown = candidate.prototype;
    if (isRecord(prototype)) return { prototype };
  }
  return null;
}

/**
 * Replace one style accessor with a pair that stores the caller's value verbatim
 * (so Google's read-back keeps matching) while forwarding a recoloured value to
 * the real setter. Returns a restore function, or null when the property cannot
 * be patched — the caller then falls back to the pixel pass alone.
 */
function hookStyleProperty(
  prototype: object,
  property: StyleProperty,
  remap: (self: object, value: unknown) => unknown,
): (() => void) | null {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
  if (descriptor === undefined) return null;
  if (descriptor.get === undefined && descriptor.set === undefined && !("value" in descriptor)) return null;

  /** What the caller assigned last, so the getter can report it back. */
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
      // A real context normalises what it stores, so report the same canonical
      // form rather than the raw keyword the caller typed.
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
    // A frozen or otherwise locked prototype throws a TypeError; that leaves
    // nothing to patch and the pixel pass still themes what is already on
    // screen. Any other failure is unexpected and must surface, not be hidden.
    if (error instanceof TypeError) return null;
    throw error;
  }

  return () => {
    const current = Object.getOwnPropertyDescriptor(prototype, property);
    // Only restore when our accessor is still the live one; a later patcher owns
    // the property now and must not be clobbered.
    if (current === undefined || current.get !== accessor.get) return;
    Reflect.defineProperty(prototype, property, descriptor);
  };
}

/**
 * Wire the canvas theme to the document: patch the 2D prototype so future draws
 * use the themed palette, and repaint pixels that were already on screen when
 * the theme or the set of grid canvases changed.
 */
export function installCanvasTheme(options: CanvasThemeOptions = {}): CanvasThemeController {
  const doc = options.doc ?? document;
  const scope = options.scope ?? globalThis;
  const page = options.page ?? (isRecord(scope) ? Reflect.get(scope, "unsafeWindow") : null);
  const constructor = resolveContextConstructor([page, scope]);

  let mode: ThemeMode = THEME_MODE.LIGHT;
  let disposed = false;

  /** Canvases whose draws should be intercepted (membership via DOM identity). */
  const themed = new WeakSet<object>();
  /** Live grid canvases, iterated to repaint on a theme change. */
  const canvases = new Set<HTMLCanvasElement>();
  /** The theme a canvas' pixels are currently normalised to. */
  const rendered = new WeakMap<HTMLCanvasElement, ThemeMode>();
  /** Memoised light→dark colour strings, keyed by the value Google assigned. */
  const colorCache = new Map<string, string>();

  const recolor = (value: string): string => {
    const cached = colorCache.get(value);
    if (cached !== undefined) return cached;
    const mapped = recolorCssColor(value, THEME_MODE.DARK);
    if (colorCache.size >= COLOR_CACHE_LIMIT) colorCache.clear();
    colorCache.set(value, mapped);
    return mapped;
  };

  const isThemedContext = (self: object): boolean => {
    const canvas = Reflect.get(self, "canvas");
    return isCanvasElement(canvas) && themed.has(canvas);
  };

  const remap = (self: object, value: unknown): unknown => {
    if (mode !== THEME_MODE.DARK) return value;
    if (typeof value !== "string") return value;
    if (!isThemedContext(self)) return value;
    return recolor(value);
  };

  const restores: (() => void)[] = [];
  if (constructor !== null) {
    for (const property of ["fillStyle", "strokeStyle"] as const) {
      const restore = hookStyleProperty(constructor.prototype, property, remap);
      if (restore !== null) restores.push(restore);
    }
  }

  /**
   * Read a canvas' pixels. A tainted canvas (a cross-origin image was drawn) is
   * unreadable; that is a documented skip, not a swallowed failure, and any other
   * error is re-thrown so it is not hidden.
   */
  const readPixels = (canvas: HTMLCanvasElement): ImageData | null => {
    const context = canvas.getContext("2d");
    if (context === null) return null;
    const { width, height } = canvas;
    if (width === 0 || height === 0) return null;
    try {
      return context.getImageData(0, 0, width, height);
    } catch (error) {
      if (error instanceof DOMException && error.name === "SecurityError") return null;
      throw error;
    }
  };

  /** Repaint one canvas' pixels into `target`, leaving author colours untouched. */
  const applyPixels = (canvas: HTMLCanvasElement, target: ThemeMode): void => {
    const image = readPixels(canvas);
    if (image === null) return;
    if (!recolorPixels(image.data, target)) return;
    const context = canvas.getContext("2d");
    if (context === null) return;
    try {
      context.putImageData(image, 0, 0);
    } catch (error) {
      if (error instanceof DOMException && error.name === "SecurityError") return;
      throw error;
    }
  };

  const register = (canvas: HTMLCanvasElement): void => {
    if (canvases.has(canvas)) return;
    canvases.add(canvas);
    themed.add(canvas);
    // A canvas discovered while dark already holds light pixels drawn before the
    // patch saw it, so normalise it now; a blank canvas is all-transparent and the
    // pixel pass is skipped for free.
    rendered.set(canvas, mode);
    if (mode === THEME_MODE.DARK) applyPixels(canvas, THEME_MODE.DARK);
  };

  const scan = (): void => {
    if (disposed) return;
    for (const canvas of Array.from(canvases)) {
      if (canvas.isConnected) continue;
      canvases.delete(canvas);
      themed.delete(canvas);
    }
    for (const canvas of Array.from(doc.querySelectorAll<HTMLCanvasElement>(GRID_CANVAS_SELECTOR))) {
      if (canvas.closest(CHART_SELECTOR) !== null) continue;
      register(canvas);
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

  // Google replaces the whole grid subtree when the active sheet changes, so the
  // observer both discovers new canvases and drops detached ones.
  const observer =
    doc.documentElement === null || typeof MutationObserver !== "function"
      ? null
      : new MutationObserver(scheduleScan);
  observer?.observe(doc.documentElement, { childList: true, subtree: true });

  scan();

  return {
    setMode: (next) => {
      if (disposed) return;
      mode = next;
      if (next === THEME_MODE.LIGHT) {
        for (const canvas of canvases) {
          if (rendered.get(canvas) === THEME_MODE.LIGHT) continue;
          applyPixels(canvas, THEME_MODE.LIGHT);
          rendered.set(canvas, THEME_MODE.LIGHT);
        }
        return;
      }
      scan();
      for (const canvas of canvases) {
        if (rendered.get(canvas) === THEME_MODE.DARK) continue;
        applyPixels(canvas, THEME_MODE.DARK);
        rendered.set(canvas, THEME_MODE.DARK);
      }
    },
    dispose: () => {
      if (disposed) return;
      // Lift recoloured pixels back to light before the hook is removed, so the
      // page is left exactly as if the script had never run.
      for (const canvas of canvases) {
        if (rendered.get(canvas) !== THEME_MODE.DARK) continue;
        applyPixels(canvas, THEME_MODE.LIGHT);
        rendered.set(canvas, THEME_MODE.LIGHT);
      }
      disposed = true;
      observer?.disconnect();
      for (const restore of restores) restore();
      canvases.clear();
      colorCache.clear();
    },
  };
}
