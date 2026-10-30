import { describe, expect, it, vi } from "vitest";
import { createStringStorage, type StringStorage } from "../shared/storage/keyValue";
import { createGmStorage, createMemoryStorage } from "../shared/storage/gmStorage";

describe("createStringStorage", () => {
  it("returns the fallback for missing and invalid JSON", () => {
    const storage = createStringStorage(createMemoryStorage());
    expect(storage.readJson("missing", { ok: true })).toEqual({ ok: true });
    storage.write("broken", "{");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(storage.readJson("broken", 5)).toBe(5);
    expect(error).toHaveBeenCalled();
  });

  it("keeps memory coherent when the backing store throws", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const throwing: StringStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    const storage = createStringStorage(throwing);
    expect(storage.write("key", "value")).toBe(false);
    expect(storage.read("key")).toBe("value");
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("round-trips JSON values", () => {
    const storage = createStringStorage(createMemoryStorage());
    expect(storage.writeJson("config", { a: 1, b: [true] })).toBe(true);
    expect(storage.readJson("config", null)).toEqual({ a: 1, b: [true] });
  });
});

describe("createGmStorage", () => {
  it("delegates to GM_getValue and GM_setValue when both exist", () => {
    const values = new Map<string, unknown>();
    const scope = {
      GM_getValue: (key: string, fallback: unknown) => values.get(key) ?? fallback,
      GM_setValue: (key: string, value: unknown) => {
        values.set(key, value);
      },
    };
    const storage = createGmStorage(scope);
    storage.write("token", "abc");
    expect(values.get("token")).toBe("abc");
    expect(storage.read("token")).toBe("abc");
    expect(storage.read("absent")).toBeNull();
  });

  it("serializes non-string GM values without losing their shape", () => {
    const scope = {
      GM_getValue: () => ({ nested: true }),
      GM_setValue: () => undefined,
    };
    const storage = createGmStorage(scope);
    expect(storage.readJson("config", null)).toEqual({ nested: true });
  });

  it("falls back to isolated memory when the GM API is absent", () => {
    const first = createGmStorage({});
    const second = createGmStorage({});
    first.write("key", "one");
    expect(first.read("key")).toBe("one");
    expect(second.read("key")).toBeNull();
  });

  it("ignores non-function GM globals", () => {
    const storage = createGmStorage({ GM_getValue: 3, GM_setValue: "no" });
    storage.write("key", "value");
    expect(storage.read("key")).toBe("value");
  });
});
