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

import {
  createPostNavigationController,
  readPostHistoryCursor,
  readPostHistoryEntryTitle,
  readPostTrail,
  visitPostTrail,
  writePostHistoryTitle,
} from "../scripts/heybox-up/src/ui/reader";
import { POST_HISTORY_CURSOR_KEY, POST_HISTORY_TITLES_KEY, POST_TRAIL_KEY } from "../scripts/heybox-up/src/core/feed";
import { sessionStore } from "../scripts/heybox-up/src/state";

function clearTrail(): void {
  // The storage adapter keeps a memory copy, so clearing the raw area alone
  // would leave the previous test's trail visible.
  for (const key of [POST_TRAIL_KEY, POST_HISTORY_CURSOR_KEY, POST_HISTORY_TITLES_KEY]) {
    sessionStore.remove(key);
  }
}

describe("post history cursor", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    clearTrail();
    history.replaceState(null, "", "/app/bbs/link/100");
  });

  afterEach(() => {
    window.sessionStorage.clear();
    clearTrail();
  });

  it("walks back through the visit order instead of rewriting it", () => {
    visitPostTrail("100");
    visitPostTrail("200");
    visitPostTrail("300");
    expect(readPostTrail()).toEqual(["100", "200", "300"]);
    expect(readPostHistoryCursor()).toBe(2);

    // Stepping back moves the cursor only; no entry is replaced.
    visitPostTrail("200");
    expect(readPostTrail()).toEqual(["100", "200", "300"]);
    expect(readPostHistoryCursor()).toBe(1);

    visitPostTrail("100");
    expect(readPostTrail()).toEqual(["100", "200", "300"]);
    expect(readPostHistoryCursor()).toBe(0);
  });

  it("reports the post that was actually on screen as previous", () => {
    const navigation = createPostNavigationController();
    navigation.sync("100", { title: "First" }, []);
    navigation.sync("200", { title: "Second" }, []);
    expect(navigation.readStatus().prev).toEqual({ id: "100", title: "First" });

    navigation.sync("100", { title: "First" }, []);
    expect(navigation.readStatus().prev).toBeNull();
    expect(navigation.readStatus().history.map((entry) => entry.current)).toEqual([true, false]);
  });

  it("drops the abandoned forward branch when a new post opens", () => {
    visitPostTrail("100");
    visitPostTrail("200");
    visitPostTrail("300");
    visitPostTrail("200");
    visitPostTrail("400");
    expect(readPostTrail()).toEqual(["100", "200", "400"]);
    expect(readPostHistoryCursor()).toBe(2);
  });

  it("keeps history rows labelled after the recent list forgets them", () => {
    visitPostTrail("999");
    writePostHistoryTitle("999", "Only in the timeline");
    expect(readPostHistoryEntryTitle("999")).toBe("Only in the timeline");
  });
});
