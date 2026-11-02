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
  applyPostHistoryLimit,
  createPostNavigationController,
  readReaderRatio,
  readReaderScroll,
  readPostHistoryCursor,
  readPostHistoryEntryTitle,
  readPostTrail,
  visitPostTrail,
  writePostHistoryTitle,
  writeReaderRatio,
  writeReaderScroll,
} from "../scripts/heybox-up/src/ui/reader";
import { POST_HISTORY_CURSOR_KEY, POST_HISTORY_TITLES_KEY, POST_TRAIL_KEY } from "../scripts/heybox-up/src/core/feed";
import { localStore, sessionStore, setReaderHistoryLimitPreference } from "../scripts/heybox-up/src/state";
import { STORAGE_KEYS } from "../scripts/heybox-up/src/config";

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
    localStore.remove(STORAGE_KEYS.readerHistoryLimit);
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

  it("drops the oldest visits once the configured limit is reached", () => {
    setReaderHistoryLimitPreference(3);
    for (const id of ["100", "200", "300", "400", "500"]) visitPostTrail(id);
    expect(readPostTrail()).toEqual(["300", "400", "500"]);
    expect(readPostHistoryCursor()).toBe(2);
  });

  it("keeps every visit when the limit is unlimited", () => {
    setReaderHistoryLimitPreference(0);
    for (let index = 0; index < 60; index += 1) visitPostTrail(String(1000 + index));
    expect(readPostTrail()).toHaveLength(60);
    expect(readPostHistoryCursor()).toBe(59);
  });

  it("stores only id nodes plus a title label per id", () => {
    setReaderHistoryLimitPreference(0);
    visitPostTrail("100");
    writePostHistoryTitle("100", "Tiny node");
    const trail = JSON.parse(window.sessionStorage.getItem(POST_TRAIL_KEY) ?? "null") as unknown;
    expect(trail).toEqual(["100"]);
    const titles = JSON.parse(window.sessionStorage.getItem(POST_HISTORY_TITLES_KEY) ?? "null") as unknown;
    expect(titles).toEqual({ "100": "Tiny node" });
  });

  it("forgets labels and scroll marks of pruned visits", () => {
    setReaderHistoryLimitPreference(0);
    // Fresh ids keep the shared recent-post memory cache from labelling them.
    const ids = ["7001", "7002", "7003"];
    for (const id of ids) visitPostTrail(id);
    for (const id of ids) {
      writePostHistoryTitle(id, "Post " + id);
      writeReaderScroll(id, 2);
      writeReaderRatio(id, 0.5);
    }
    expect(applyPostHistoryLimit(1)).toEqual(["7003"]);
    expect(readPostHistoryCursor()).toBe(0);
    expect(readPostHistoryEntryTitle("7001")).toBe("");
    expect(readPostHistoryEntryTitle("7003")).toBe("Post 7003");
    expect(readReaderScroll("7001")).toBe(0);
    expect(readReaderRatio("7001")).toBe(-1);
    expect(readReaderScroll("7003")).toBe(2);
  });

  it("moves the cursor back with the entries that were dropped", () => {
    setReaderHistoryLimitPreference(0);
    visitPostTrail("100");
    visitPostTrail("200");
    visitPostTrail("300");
    visitPostTrail("100");
    expect(readPostHistoryCursor()).toBe(0);
    expect(applyPostHistoryLimit(2)).toEqual(["200", "300"]);
    // The open post left with the oldest entry, so the cursor clamps to the front.
    expect(readPostHistoryCursor()).toBe(0);
    expect(readPostTrail()).toEqual(["200", "300"]);
  });
});
