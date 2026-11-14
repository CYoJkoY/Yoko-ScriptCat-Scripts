// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  // Node 26 exposes a `localStorage` placeholder that jsdom does not override,
  // so the suite installs a plain in-memory Storage for both areas.
  const createStorage = (): Storage => {
    const data = new Map<string, string>();
    return {
      get length(): number { return data.size; },
      clear: (): void => { data.clear(); },
      getItem: (key: string): string | null => data.get(key) ?? null,
      key: (index: number): string | null => Array.from(data.keys())[index] ?? null,
      removeItem: (key: string): void => { data.delete(key); },
      setItem: (key: string, value: string): void => { data.set(key, String(value)); },
    };
  };
  for (const name of ["localStorage", "sessionStorage"] as const) {
    Object.defineProperty(window, name, { configurable: true, writable: true, value: createStorage() });
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: window[name] });
  }
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: (): void => undefined,
      removeListener: (): void => undefined,
      addEventListener: (): void => undefined,
      removeEventListener: (): void => undefined,
      dispatchEvent: (): boolean => true,
    }),
  });
  Object.defineProperty(globalThis, "IntersectionObserver", {
    configurable: true,
    writable: true,
    value: class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): unknown[] { return []; }
    },
  });
});

import { READER_RATIO_KEY, persistReaderRatio, readReaderRatio, removeStoredReaderPosition, writeReaderRatio } from "../scripts/heybox-up/src/ui/reader";
import { localStore, sessionStore } from "../scripts/heybox-up/src/state";
import { STORAGE_KEYS } from "../scripts/heybox-up/src/config";

const POSITION_KEY = STORAGE_KEYS.readerPositions;

function rawPositions(): unknown {
  return JSON.parse(window.localStorage.getItem(POSITION_KEY) ?? "null") as unknown;
}

function writeSave(positions: Record<string, { ratio: number; updatedAt: number }>, version = 1): void {
  localStore.write(POSITION_KEY, JSON.stringify({ version, positions }));
}

describe("reader position persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    localStore.remove(POSITION_KEY);
    sessionStore.remove(READER_RATIO_KEY + "100");
    sessionStore.remove(READER_RATIO_KEY + "200");
  });

  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    localStore.remove(POSITION_KEY);
  });

  it("restores a saved percentage in a new tab after the session is gone", () => {
    persistReaderRatio("100", 0.625);
    expect(rawPositions()).toMatchObject({ version: 1 });

    window.sessionStorage.clear();
    expect(readReaderRatio("100")).toBe(0.625);
  });

  it("prefers the live session ratio and leaves the durable copy to the flush", () => {
    persistReaderRatio("100", 0.2);
    writeReaderRatio("100", 0.8);
    expect(readReaderRatio("100")).toBe(0.8);
    expect(rawPositions()).toMatchObject({ positions: { "100": { ratio: 0.2 } } });
  });

  it("drops entries older than the retention window and unknown versions", () => {
    const now = Date.now();
    writeSave({
      "100": { ratio: 0.4, updatedAt: now - 31 * 24 * 60 * 60 * 1000 },
      "200": { ratio: 0.9, updatedAt: now - 1000 },
    });
    expect(readReaderRatio("100")).toBe(-1);
    expect(readReaderRatio("200")).toBe(0.9);
    expect(rawPositions()).toEqual({ version: 1, positions: { "200": { ratio: 0.9, updatedAt: now - 1000 } } });

    writeSave({ "100": { ratio: 0.4, updatedAt: now } }, 2);
    expect(readReaderRatio("100")).toBe(-1);
  });

  it("ignores malformed ids and ratios instead of restoring a broken spot", () => {
    writeSave({
      "not-a-post": { ratio: 0.5, updatedAt: Date.now() },
      "100": { ratio: 4, updatedAt: Date.now() },
    });
    expect(readReaderRatio("not-a-post")).toBe(-1);
    expect(readReaderRatio("100")).toBe(-1);
    expect(rawPositions()).toEqual({ version: 1, positions: {} });
    expect(readReaderRatio("empty")).toBe(-1);
  });

  it("keeps at most 200 posts and forgets the oldest one", () => {
    const now = Date.now();
    const positions: Record<string, { ratio: number; updatedAt: number }> = {};
    for (let index = 0; index < 201; index += 1) {
      positions[String(5000 + index)] = { ratio: 0.5, updatedAt: now - 1000 - index };
    }
    writeSave(positions);
    expect(readReaderRatio("5000")).toBe(0.5);
    expect(readReaderRatio("5001")).toBe(0.5);
    expect(readReaderRatio("5200")).toBe(-1);
  });

  it("removes a saved spot when its timeline visit is pruned", () => {
    persistReaderRatio("100", 0.5);
    removeStoredReaderPosition("100");
    expect(readReaderRatio("100")).toBe(-1);
  });
});
