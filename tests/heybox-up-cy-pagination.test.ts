// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const memory = new Map<string, string>();
  const storage = {
    get length() { return memory.size; },
    clear(): void { memory.clear(); },
    getItem(key: string): string | null { return memory.get(key) ?? null; },
    key(index: number): string | null { return Array.from(memory.keys())[index] ?? null; },
    removeItem(key: string): void { memory.delete(key); },
    setItem(key: string, value: string): void { memory.set(key, String(value)); },
  };
  for (const name of ["localStorage", "sessionStorage"]) {
    Object.defineProperty(window, name, { configurable: true, value: storage });
    Object.defineProperty(globalThis, name, { configurable: true, value: storage });
  }
});

import {
  CACHE_KEY_PREFIX,
  CACHE_TTL_MS,
  CY_MAX_ITEMS,
  CY_PAGE_SIZE,
  loadCyFavoritesBatch,
  mergeCyFavorites,
  readCache,
  writeCache,
  type CyItem,
} from "../scripts/heybox-up/src/core/cy";
import { localStore } from "../scripts/heybox-up/src/state";

function cyRaw(id: number): unknown {
  return {
    text: "插眼内容 " + id,
    create_at: 1700000000 + id,
    comment_type: 1,
    link: {
      linkid: "p" + id,
      title: "帖子 " + id,
      thumbs: ["https://img.example.com/" + id + ".jpg"],
    },
  };
}

function cyPage(list: unknown[], hasNext?: string): Response {
  const result: Record<string, unknown> = { links: list };
  if (hasNext !== undefined) result["has_next"] = hasNext;
  return new Response(JSON.stringify({ status: "ok", result }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function pageOf(startId: number, count: number): unknown[] {
  return Array.from({ length: count }, (_, index) => cyRaw(startId + index));
}

function item(id: number): CyItem {
  return { id: "p" + id, title: "帖子 " + id, text: "", createAt: 1, thumb: "", kind: "评论" };
}

function requestOffset(call: unknown[]): number {
  return Number(new URL(String(call[0])).searchParams.get("offset"));
}

const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
  const offset = Number(new URL(String(input)).searchParams.get("offset"));
  if (offset <= 180) return cyPage(pageOf(offset, CY_PAGE_SIZE), "1");
  return cyPage([], "0");
});

let responder: ((offset: number) => Response) | null = null;

beforeEach(() => {
  responder = null;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

fetchMock.mockImplementation(async (input: RequestInfo | URL): Promise<Response> => {
  if (responder !== null) return responder(Number(new URL(String(input)).searchParams.get("offset")));
  const offset = Number(new URL(String(input)).searchParams.get("offset"));
  if (offset <= 180) return cyPage(pageOf(offset, CY_PAGE_SIZE), "1");
  return cyPage([], "0");
});

describe("cy favourites batch loader", () => {
  it("stops at the batch cap without auto-requesting further pages", async () => {
    const batch = await loadCyFavoritesBatch("42");
    const offsets = fetchMock.mock.calls.map(requestOffset);
    expect(offsets).toEqual([0, 20, 40, 60, 80, 100, 120, 140, 160, 180]);
    expect(batch.items.length).toBe(CY_MAX_ITEMS);
    expect(batch.hasNext).toBe(true);
    expect(batch.nextOffset).toBe(200);
    expect(batch.items[0].id).toBe("p0");
    expect(batch.items[199].id).toBe("p199");
  });

  it("ends the batch when the API reports no more pages", async () => {
    responder = (offset) => (offset === 0 ? cyPage(pageOf(0, 5), "0") : cyPage([], "0"));
    const batch = await loadCyFavoritesBatch("42");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(batch.items.length).toBe(5);
    expect(batch.hasNext).toBe(false);
    expect(batch.nextOffset).toBe(CY_PAGE_SIZE);
  });

  it("treats an empty page without a pagination signal as the end", async () => {
    responder = () => cyPage([]);
    const batch = await loadCyFavoritesBatch("42");
    expect(batch.items).toEqual([]);
    expect(batch.hasNext).toBe(false);
  });

  it("keeps the page-window bound when pages keep promising more but repeat ids", async () => {
    responder = (offset) => cyPage(pageOf(offset % 40, CY_PAGE_SIZE), "1");
    const batch = await loadCyFavoritesBatch("42");
    expect(fetchMock).toHaveBeenCalledTimes(11);
    expect(batch.items.length).toBe(40);
    expect(batch.hasNext).toBe(true);
    expect(batch.nextOffset).toBe(220);
  });

  it("skips ids that were already loaded and resumes from the given offset", async () => {
    const seenIds = Array.from({ length: 40 }, (_, id) => "p" + id);
    const batch = await loadCyFavoritesBatch("42", { seenIds });
    const offsets = fetchMock.mock.calls.map(requestOffset);
    expect(offsets[0]).toBe(0);
    expect(offsets).toEqual([0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200]);
    expect(batch.items.length).toBe(160);
    expect(batch.items[0].id).toBe("p40");
    expect(batch.items[159].id).toBe("p199");
    expect(batch.hasNext).toBe(false);
    expect(batch.nextOffset).toBe(220);
  });

  it("propagates endpoint failures to the caller", async () => {
    responder = () => new Response("boom", { status: 503 });
    await expect(loadCyFavoritesBatch("42")).rejects.toThrow("接口返回 HTTP 503");
  });
});

describe("cy favourites merge", () => {
  it("appends unseen ids in order and drops duplicates on both sides", () => {
    const merged = mergeCyFavorites([item(1), item(2)], [item(2), item(3), item(3), item(1)]);
    expect(merged.map((entry) => entry.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("keeps the existing list untouched when a batch adds nothing new", () => {
    const existing = [item(7)];
    expect(mergeCyFavorites(existing, [item(7)])).toEqual(existing);
  });
});

describe("cy favourites cache", () => {
  it("round-trips items together with the pagination position", () => {
    const favorites = { items: [item(1), item(2)], hasNext: true, nextOffset: 220 };
    writeCache("cache-user-1", favorites);
    expect(readCache("cache-user-1")).toEqual(favorites);
  });

  it("rejects entries written without pagination state", () => {
    localStore.writeJson(CACHE_KEY_PREFIX + "cache-user-2", {
      savedAt: Date.now(),
      items: [],
    });
    expect(readCache("cache-user-2")).toBeNull();
  });

  it("rejects entries with a malformed offset", () => {
    localStore.writeJson(CACHE_KEY_PREFIX + "cache-user-3", {
      savedAt: Date.now(),
      items: [],
      hasNext: true,
      nextOffset: "soon",
    });
    expect(readCache("cache-user-3")).toBeNull();
  });

  it("expires entries after the cache lifetime", () => {
    localStore.writeJson(CACHE_KEY_PREFIX + "cache-user-4", {
      savedAt: Date.now() - CACHE_TTL_MS - 1,
      items: [],
      hasNext: false,
      nextOffset: 0,
    });
    expect(readCache("cache-user-4")).toBeNull();
  });
});
