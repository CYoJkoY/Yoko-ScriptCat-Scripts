/** Minimal storage contract shared by localStorage and GM_getValue adapters. */
export interface StringStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type StorageOperation = "read" | "write" | "remove" | "parse";

export interface StorageFailure {
  readonly operation: StorageOperation;
  readonly error: unknown;
}

/** Callers decide how a storage failure surfaces: a log line or a silent fallback. */
export interface StringStorageOptions {
  readonly onError?: ((failure: StorageFailure) => void) | undefined;
  /**
   * Keep the last read and written value in memory. Defaults to true so a page
   * whose storage area starts rejecting writes still sees its own choices.
   * Pass false to mirror the raw area, where a failed write is not visible to
   * a later read.
   */
  readonly cache?: boolean | undefined;
}

export interface StringStorageAdapter {
  read(key: string): string | null;
  write(key: string, value: string): boolean;
  readJson(key: string, fallback: unknown): unknown;
  writeJson(key: string, value: unknown): boolean;
  remove(key: string): boolean;
}

const DEFAULT_MESSAGES: Readonly<Record<StorageOperation, string>> = {
  read: "[shared/storage] read failed",
  write: "[shared/storage] write failed",
  remove: "[shared/storage] remove failed",
  parse: "[shared/storage] invalid JSON",
};

function reportFailure(
  options: StringStorageOptions,
  operation: StorageOperation,
  error: unknown,
): void {
  if (options.onError !== undefined) {
    options.onError({ operation, error });
    return;
  }
  console.error(DEFAULT_MESSAGES[operation], error);
}

/**
 * Browser storage can throw on quota, privacy settings, or sandboxed frames.
 * Keep the last successfully read or written value in memory so callers still
 * observe one coherent session when persistence is unavailable.
 */
export function createStringStorage(
  storage: StringStorage,
  options: StringStorageOptions = {},
): StringStorageAdapter {
  const memory = new Map<string, string>();
  const useCache = options.cache !== false;
  const read = (key: string): string | null => {
    if (useCache) {
      const cached = memory.get(key);
      if (cached !== undefined) return cached;
    }
    try {
      const value = storage.getItem(key);
      if (useCache && value !== null) memory.set(key, value);
      return value;
    } catch (error) {
      reportFailure(options, "read", error);
      return null;
    }
  };
  const write = (key: string, value: string): boolean => {
    if (useCache) memory.set(key, value);
    try {
      storage.setItem(key, value);
      return true;
    } catch (error) {
      reportFailure(options, "write", error);
      return false;
    }
  };
  const remove = (key: string): boolean => {
    if (useCache) memory.delete(key);
    try {
      storage.removeItem(key);
      return true;
    } catch (error) {
      reportFailure(options, "remove", error);
      return false;
    }
  };
  return {
    read,
    write,
    readJson: (key, fallback) => {
      const raw = read(key);
      if (raw === null) return fallback;
      try {
        // JSON.parse returns any; re-stating the result as unknown keeps it untyped.
        return JSON.parse(raw) as unknown;
      } catch (error) {
        reportFailure(options, "parse", error);
        return fallback;
      }
    },
    writeJson: (key, value) => {
      let serialized: string;
      try {
        serialized = JSON.stringify(value);
      } catch (error) {
        // A value that cannot serialize is a caller bug, not a storage failure,
        // but the boolean contract keeps it from escaping into the host page.
        reportFailure(options, "write", error);
        return false;
      }
      return write(key, serialized);
    },
    remove,
  };
}

export type BrowserStorageName = "localStorage" | "sessionStorage";

function isStorageArea(value: unknown): value is Storage {
  if (typeof value !== "object" || value === null) return false;
  return "getItem" in value && "setItem" in value && "removeItem" in value;
}

function resolveArea(kind: BrowserStorageName): Storage {
  // Reading the area itself throws when the page blocks persistence, so the
  // lookup stays inside the call and the adapter turns a throw into a fallback.
  const area: unknown = kind === "localStorage" ? window.localStorage : window.sessionStorage;
  if (!isStorageArea(area)) {
    throw new Error(kind + " is unavailable in this frame");
  }
  return area;
}

export function getBrowserStorage(
  kind: BrowserStorageName,
  options: StringStorageOptions = {},
): StringStorageAdapter {
  return createStringStorage(
    {
      getItem: (key) => resolveArea(kind).getItem(key),
      setItem: (key, value) => resolveArea(kind).setItem(key, value),
      removeItem: (key) => resolveArea(kind).removeItem(key),
    },
    options,
  );
}

/**
 * Adapter for call sites that historically swallowed storage failures. The
 * cache is off so reads always hit the real area, matching a raw getItem call.
 */
export function getSilentBrowserStorage(
  kind: BrowserStorageName,
): StringStorageAdapter {
  return getBrowserStorage(kind, { cache: false, onError: () => undefined });
}
