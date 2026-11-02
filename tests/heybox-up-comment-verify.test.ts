// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

// The reader module reads the system theme at import time in a real browser.
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

import {
  COMMENT_VERIFY_ATTEMPTS,
  COMMENT_VERIFY_MAX_ATTEMPTS,
  readCommentVerifyDelay,
} from "../scripts/heybox-up/src/ui/reader";

describe("comment verify schedule", () => {
  it("waits out every sparse echo check before giving up", () => {
    const waits: number[] = [];
    for (let attempt = 1; attempt < COMMENT_VERIFY_MAX_ATTEMPTS; attempt += 1) {
      waits.push(readCommentVerifyDelay(attempt));
    }
    // A reply is read right after the write and then after each wait, so the
    // last sparse check only runs when the cap leaves room for its own round.
    expect(waits).toEqual([400, 600, 900, 1200, 1500, 6000, 12000, 20000]);
  });

  it("stops saying syncing before the sparse checks start", () => {
    expect(COMMENT_VERIFY_ATTEMPTS).toBe(5);
    expect(readCommentVerifyDelay(COMMENT_VERIFY_ATTEMPTS - 1)).toBe(1200);
    expect(readCommentVerifyDelay(COMMENT_VERIFY_ATTEMPTS)).toBe(1500);
  });
});

