import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createThrottled } from "../shared/utils/throttle";

describe("createThrottled", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reuses a pending timer and coalesces calls into the latest arguments", () => {
    vi.setSystemTime(0);
    const calls: string[] = [];
    const throttled = createThrottled((value: string) => calls.push(value), { intervalMs: 100 });

    throttled("first");
    expect(calls).toEqual(["first"]);
    vi.setSystemTime(20);
    throttled("second");
    throttled("third");
    expect(throttled.pending).toBe(true);
    vi.advanceTimersByTime(79);
    expect(calls).toEqual(["first"]);
    vi.advanceTimersByTime(1);
    expect(calls).toEqual(["first", "third"]);
    expect(throttled.pending).toBe(false);
  });

  it("cancel drops the trailing call and allows an immediate run", () => {
    vi.setSystemTime(0);
    const calls: number[] = [];
    const throttled = createThrottled((value: number) => calls.push(value), { intervalMs: 50 });

    throttled(1);
    vi.setSystemTime(10);
    throttled(2);
    throttled.cancel();
    expect(throttled.pending).toBe(false);
    throttled(3);
    vi.advanceTimersByTime(50);
    expect(calls).toEqual([1, 3]);
  });

  it("flush executes a queued trailing call", () => {
    vi.setSystemTime(0);
    const calls: string[] = [];
    const throttled = createThrottled((value: string) => calls.push(value), { intervalMs: 500 });

    throttled("immediate");
    throttled("queued");
    throttled.flush();
    expect(calls).toEqual(["immediate", "queued"]);
    expect(throttled.pending).toBe(false);
  });
});
