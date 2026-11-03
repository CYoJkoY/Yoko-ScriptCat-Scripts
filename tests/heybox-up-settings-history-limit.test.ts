// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
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
});

import { READER_HISTORY_LIMIT_UNLIMITED, READER_HISTORY_LIMIT_WARN, STORAGE_KEYS } from "../scripts/heybox-up/src/config";
import { localStore, normalizeReaderHistoryLimit, parseReaderHistoryLimitInput, readReaderHistoryLimit, READER_HISTORY_LIMIT_EVENT } from "../scripts/heybox-up/src/state";
import { createReaderHistoryLimitControl, readerHistoryLimitHint, readerHistoryLimitInput } from "../scripts/heybox-up/src/ui/theme";

function commit(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("change"));
}

describe("reader history limit preference", () => {
  beforeEach(() => {
    localStore.remove(STORAGE_KEYS.readerHistoryLimit);
  });

  afterEach(() => {
    localStore.remove(STORAGE_KEYS.readerHistoryLimit);
    document.body.innerHTML = "";
  });

  it("defaults to forty visits", () => {
    expect(readReaderHistoryLimit()).toBe(40);
  });

  it("rejects negative and fractional values", () => {
    expect(parseReaderHistoryLimitInput("-1")).toBeNull();
    expect(parseReaderHistoryLimitInput("2.5")).toBeNull();
    expect(parseReaderHistoryLimitInput("abc")).toBeNull();
    expect(parseReaderHistoryLimitInput("")).toBeNull();
    expect(normalizeReaderHistoryLimit("-3")).toBe(40);
  });

  it("accepts zero as unlimited", () => {
    expect(parseReaderHistoryLimitInput("0")).toBe(0);
    expect(normalizeReaderHistoryLimit("0")).toBe(READER_HISTORY_LIMIT_UNLIMITED);
  });

  it("stores the committed number and announces it", () => {
    const seen: unknown[] = [];
    const listener = (event: Event): void => {
      seen.push(event instanceof CustomEvent ? event.detail : undefined);
    };
    document.addEventListener(READER_HISTORY_LIMIT_EVENT, listener);
    const control = createReaderHistoryLimitControl();
    document.body.append(control);
    const input = readerHistoryLimitInput;
    if (input === null) throw new Error("Expected the limit input");
    commit(input, "120");
    expect(readReaderHistoryLimit()).toBe(120);
    expect(seen).toEqual([120]);
    expect(localStore.read(STORAGE_KEYS.readerHistoryLimit)).toBe("120");
    document.removeEventListener(READER_HISTORY_LIMIT_EVENT, listener);
  });

  it("restores the stored value when the input cannot be parsed", () => {
    localStore.write(STORAGE_KEYS.readerHistoryLimit, "15");
    document.body.append(createReaderHistoryLimitControl());
    const input = readerHistoryLimitInput;
    if (input === null) throw new Error("Expected the limit input");
    commit(input, "-5");
    expect(input.value).toBe("15");
    expect(readReaderHistoryLimit()).toBe(15);
  });

  it("warns about unlimited and very large trails", () => {
    document.body.append(createReaderHistoryLimitControl());
    const input = readerHistoryLimitInput;
    const hint = readerHistoryLimitHint;
    if (input === null || hint === null) throw new Error("Expected the limit control");
    expect(hint.dataset["warn"]).toBe("false");
    expect(hint.textContent).toContain("40");

    commit(input, "0");
    expect(hint.dataset["warn"]).toBe("true");
    expect(hint.textContent).toContain("不限条数");
    expect(hint.textContent).toContain("内存");

    commit(input, String(READER_HISTORY_LIMIT_WARN + 1));
    expect(hint.dataset["warn"]).toBe("true");
    expect(hint.textContent).toContain("内存");

    commit(input, String(READER_HISTORY_LIMIT_WARN));
    expect(hint.dataset["warn"]).toBe("false");
  });
});
