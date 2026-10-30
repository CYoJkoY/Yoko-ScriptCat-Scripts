import {
  FEED_WIDTH_MAX,
  FEED_WIDTH_MIN,
  FEED_WIDTH_STEP,
  PREFERENCE_DEFAULTS,
  READER_LINE_HEIGHT_MAX,
  READER_LINE_HEIGHT_MIN,
  READER_LINE_HEIGHT_STEP,
  STORAGE_KEYS,
} from "./config";

/**
 * Silent storage adapters and typed HeyBox Up preferences.
 *
 * The released script never surfaced storage failures to the page, so the
 * adapters keep a session memory cache and return a fallback instead of
 * logging. Every key, default, and normalisation rule matches version 0.4.47.
 */

export interface StorageAccess {
  read(key: string): string | null;
  write(key: string, value: string): boolean;
  readJson(key: string, fallback: unknown): unknown;
  writeJson(key: string, value: unknown): boolean;
}

type StorageName = "localStorage" | "sessionStorage";

function isStorage(value: unknown): value is Storage {
  if (typeof value !== "object" || value === null) return false;
  return "getItem" in value && "setItem" in value && "removeItem" in value;
}

/**
 * Wraps one browser storage area. A failed write still updates the in-memory
 * map so the current page sees the value it just chose.
 */
export function createStorageAccess(name: StorageName): StorageAccess {
  const memory = new Map<string, string>();
  const read = (key: string): string | null => {
    const cached = memory.get(key);
    if (cached !== undefined) return cached;
    try {
      // Reading the area itself throws when the page blocks persistence, so the
      // lookup stays inside the guard and reports "no stored value" instead.
      const storage: unknown = name === "localStorage" ? window.localStorage : window.sessionStorage;
      if (!isStorage(storage)) return null;
      const value = storage.getItem(key);
      if (value !== null) memory.set(key, value);
      return value;
    } catch {
      // Private modes and sandboxed frames reject reads; treat as empty.
      return null;
    }
  };
  const write = (key: string, value: string): boolean => {
    memory.set(key, value);
    try {
      const storage: unknown = name === "localStorage" ? window.localStorage : window.sessionStorage;
      if (!isStorage(storage)) return false;
      storage.setItem(key, value);
      return true;
    } catch {
      // Quota and privacy errors keep the in-memory value only.
      return false;
    }
  };
  return {
    read,
    write,
    readJson: (key: string, fallback: unknown): unknown => {
      const raw = read(key);
      if (raw === null) return fallback;
      try {
        // JSON.parse returns any; re-stating the result as unknown keeps it untyped.
        return JSON.parse(raw) as unknown;
      } catch {
        // Corrupt cache entries must not break the page.
        return fallback;
      }
    },
    writeJson: (key: string, value: unknown): boolean => write(key, JSON.stringify(value)),
  };
}

export const localStore: StorageAccess = createStorageAccess("localStorage");
export const sessionStore: StorageAccess = createStorageAccess("sessionStorage");

export const HIDE_CY_EVENT = "heybox-up:hide-cy";
export const COMMENT_PREVIEW_EVENT = "heybox-up:comment-preview";
export const NAV_MOTION_EVENT = "heybox-up:nav-motion";
export const READER_EVENT = "heybox-up:reader";

const HIDE_CY_STYLE_ID = "heybox-up-cy-style";
const HIDE_CY_CLASS = "heybox-up-hide-cy";

export function readHideCyPreference(): boolean {
  return localStore.read(STORAGE_KEYS.hideCy) === "1";
}

export function ensureHideCyStyle(): void {
  if (document.getElementById(HIDE_CY_STYLE_ID) !== null) return;
  const style = document.createElement("style");
  style.id = HIDE_CY_STYLE_ID;
  style.textContent =
    "body." + HIDE_CY_CLASS + ' [data-heybox-up-cy="1"] { display: none !important; }';
  (document.head ?? document.documentElement).append(style);
}

export function applyHideCyPreference(value: boolean): void {
  ensureHideCyStyle();
  if (document.body !== null) document.body.classList.toggle(HIDE_CY_CLASS, value);
  document.dispatchEvent(new CustomEvent(HIDE_CY_EVENT, { detail: value }));
}

export function setHideCyPreference(value: boolean): void {
  localStore.write(STORAGE_KEYS.hideCy, value ? "1" : "0");
  applyHideCyPreference(value);
}

export function readCommentPreviewPreference(): boolean {
  return localStore.read(STORAGE_KEYS.commentPreview) !== "0";
}

export function setCommentPreviewPreference(value: boolean): void {
  localStore.write(STORAGE_KEYS.commentPreview, value ? "1" : "0");
  document.dispatchEvent(new CustomEvent(COMMENT_PREVIEW_EVENT, { detail: value }));
}

export function readNavMotionPreference(): boolean {
  return localStore.read(STORAGE_KEYS.navMotion) !== "0";
}

export function setNavMotionPreference(value: boolean): void {
  localStore.write(STORAGE_KEYS.navMotion, value ? "1" : "0");
  document.dispatchEvent(new CustomEvent(NAV_MOTION_EVENT, { detail: value }));
}

export function readReaderPreference(): boolean {
  return localStore.read(STORAGE_KEYS.reader) !== "0";
}

export function setReaderPreference(value: boolean): void {
  localStore.write(STORAGE_KEYS.reader, value ? "1" : "0");
  document.dispatchEvent(new CustomEvent(READER_EVENT, { detail: value }));
}

export function normalizeFeedWidth(value: string | number | null | undefined): number {
  // localStorage returns null when unset; Number(null) is 0 and would clamp to
  // the lower bound, so the empty case returns the default first.
  if (value === null || value === undefined || value === "") return PREFERENCE_DEFAULTS.feedWidth;
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return PREFERENCE_DEFAULTS.feedWidth;
  return Math.min(FEED_WIDTH_MAX, Math.max(FEED_WIDTH_MIN, parsed));
}

export function readFeedWidth(): number {
  return normalizeFeedWidth(localStore.read(STORAGE_KEYS.feedWidth));
}

export function applyFeedWidth(value: string | number | null | undefined): number {
  const width = normalizeFeedWidth(value);
  document.documentElement.style.setProperty("--heybox-up-feed-pct", String(width));
  return width;
}

export function setFeedWidthPreference(value: string | number | null | undefined): number {
  const width = applyFeedWidth(value);
  localStore.write(STORAGE_KEYS.feedWidth, String(width));
  return width;
}

// Number inputs declare a step; an off-grid value is invalid even inside the
// range, so callers restore the stored value instead of rounding.
export function isStepAligned(value: number, base: number, step: number): boolean {
  const steps = (value - base) / step;
  return Math.abs(steps - Math.round(steps)) < 1e-6;
}

export function parseFeedWidthInput(value: unknown): number | null {
  // Empty or invalid input returns null so the caller restores the stored
  // value; normalizeFeedWidth would silently fall back to the default.
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text === "") return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;
  if (!isStepAligned(parsed, FEED_WIDTH_MIN, FEED_WIDTH_STEP)) return null;
  return Math.min(FEED_WIDTH_MAX, Math.max(FEED_WIDTH_MIN, Math.round(parsed)));
}

// Body line height applies to article body text only; headings, code blocks
// and site cards keep their own line heights.
export function normalizeReaderLineHeight(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return PREFERENCE_DEFAULTS.readerLineHeight;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return PREFERENCE_DEFAULTS.readerLineHeight;
  return Math.min(
    READER_LINE_HEIGHT_MAX,
    Math.max(READER_LINE_HEIGHT_MIN, Math.round(parsed * 100) / 100),
  );
}

export function parseReaderLineHeightInput(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text === "") return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;
  if (!isStepAligned(parsed, READER_LINE_HEIGHT_MIN, READER_LINE_HEIGHT_STEP)) return null;
  return Math.min(
    READER_LINE_HEIGHT_MAX,
    Math.max(READER_LINE_HEIGHT_MIN, Math.round(parsed * 100) / 100),
  );
}

export function readReaderLineHeight(): number {
  return normalizeReaderLineHeight(localStore.read(STORAGE_KEYS.readerLineHeight));
}

export function applyReaderLineHeight(value: string | number | null | undefined): number {
  const lineHeight = normalizeReaderLineHeight(value);
  document.documentElement.style.setProperty("--heybox-up-reading-line-height", String(lineHeight));
  return lineHeight;
}

export function setReaderLineHeightPreference(value: string | number | null | undefined): number {
  const lineHeight = applyReaderLineHeight(value);
  localStore.write(STORAGE_KEYS.readerLineHeight, String(lineHeight));
  return lineHeight;
}

// The site marks pinned comments with is_cy as 1, "1" or true.
export function isCyComment(comment: unknown): boolean {
  if (comment === null || typeof comment !== "object") return false;
  // The object check above already established a record; this only names it.
  const record = comment as Record<string, unknown>;
  return record["is_cy"] === 1 || record["is_cy"] === true || record["is_cy"] === "1";
}

