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
  const rendered = new WeakMap<HTMLCanvasElement, ThemeMode>();
  const records = new WeakMap<HTMLCanvasElement, Map<number, RoleRecord>>();
  const gridFlags = new WeakMap<object, boolean>();
  const colorCache = new Map<string, string>();
  const restores: (() => void)[] = [];
  const repaintTimers: number[] = [];

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
    const canvas = contextCanvas(self);
    if (canvas === null) return false;
    if (themed.has(canvas)) return true;
    if (!classifyGrid(canvas)) return false;
    adopt(canvas);
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

  const applyPixels = (canvas: HTMLCanvasElement, target: ThemeMode): boolean => {
    const image = readPixels(canvas);
    if (image === null) return false;
    const changed = mapPixels(
      image.data,
      pixelTable(canvas, target),
      target === THEME_MODE.DARK ? FRINGE_SWEEP : null,
      target === THEME_MODE.DARK ? neutralDarkLut() : null,
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

  const requestRepaint = (view: Window | null): void => {
    if (view === null) return;
    for (const canvas of canvases) {
      if (!canvas.isConnected) continue;
      let host: HTMLElement | null = null;
      for (let node = canvas.parentElement; node !== null && host === null; node = node.parentElement) {
        host = scrollBoxOf(node);
      }
      if (host !== null) {
        nudgeScroll(host, view);
        break;
      }
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
    const timer = view.setTimeout(() => {
      const index = repaintTimers.indexOf(timer);
      if (index !== -1) repaintTimers.splice(index, 1);
      ping();
    }, REPAINT_RETRY_MS);
    repaintTimers.push(timer);
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
      disposed = true;
      observer?.disconnect();
      for (const restore of restores) restore();
      canvases.clear();
      colorCache.clear();
    },
  };
}
