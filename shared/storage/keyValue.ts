/** Minimal storage contract shared by localStorage and GM_getValue adapters. */
export interface StringStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface StringStorageAdapter {
  read(key: string): string | null;
  write(key: string, value: string): boolean;
  readJson(key: string, fallback: unknown): unknown;
  writeJson(key: string, value: unknown): boolean;
}

/**
 * Browser storage can throw on quota, privacy settings, or sandboxed frames.
 * Keep the last successfully read or written value in memory so callers still
 * observe one coherent session when persistence is unavailable.
 */
export function createStringStorage(storage: StringStorage): StringStorageAdapter {
  const memory = new Map<string, string>();
  const read = (key: string): string | null => {
    const cached = memory.get(key);
    if (cached !== undefined) return cached;
    try {
      const value = storage.getItem(key);
      if (value !== null) memory.set(key, value);
      return value;
    } catch (error) {
      console.error("[shared/storage] read failed", error);
      return null;
    }
  };
  const write = (key: string, value: string): boolean => {
    memory.set(key, value);
    try {
      storage.setItem(key, value);
      return true;
    } catch (error) {
      console.error("[shared/storage] write failed", error);
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
        console.error("[shared/storage] invalid JSON", error);
        return fallback;
      }
    },
    writeJson: (key, value) => write(key, JSON.stringify(value)),
  };
}

export function getBrowserStorage(kind: "localStorage" | "sessionStorage"): StringStorageAdapter {
  const storage = kind === "localStorage" ? window.localStorage : window.sessionStorage;
  return createStringStorage(storage);
}
