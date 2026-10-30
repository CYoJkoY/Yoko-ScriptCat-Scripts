import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDebounced } from "../shared/utils/debounce";

describe("createDebounced", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs once with the latest arguments after the delay", () => {
    const calls: string[] = [];
    const debounced = createDebounced((value: string) => calls.push(value), { delayMs: 100 });

    debounced("first");
    debounced("second");
    expect(debounced.pending).toBe(true);
    vi.advanceTimersByTime(99);
    expect(calls).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(calls).toEqual(["second"]);
    expect(debounced.pending).toBe(false);
  });

  it("flush runs the pending call immediately and cancel drops it", () => {
    const calls: string[] = [];
    const debounced = createDebounced((value: string) => calls.push(value), { delayMs: 50 });

    debounced("kept");
    debounced.flush();
    expect(calls).toEqual(["kept"]);
    expect(debounced.pending).toBe(false);

    debounced("dropped");
    debounced.cancel();
    vi.advanceTimersByTime(50);
    expect(calls).toEqual(["kept"]);
  });

  it("clamps negative delays to zero", () => {
    const calls: number[] = [];
    const debounced = createDebounced((value: number) => calls.push(value), { delayMs: -10 });
    debounced(7);
    vi.runAllTimers();
    expect(calls).toEqual([7]);
  });
});
