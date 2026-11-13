// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  COMMUNITY_SEARCH_DUPLICATE_PAGE_LIMIT,
  collectCommunitySearchPage,
  isSearchTimeRange,
  normalizeSearchKeyword,
  parseCommunitySearchSession,
  planCommunitySearchPaging,
  readCommunitySearchSession,
  writeCommunitySearchSession,
  clearCommunitySearchSavedState,
  type CommunitySearchItemView,
} from "../scripts/heybox-up/src/ui/community-search";

const result = (id: string): CommunitySearchItemView => ({
  id, title: "title " + id, desc: "", author: "", thumb: "", createAt: 0, like: 0, comment: 0,
});

describe("HeyBox Up community search state and paging", () => {
  it("validates restored session shape, size, and community scope", () => {
    const state = {
      version: 1, state: { topicId: "42", keyword: " hello   world ", timeRange: "week", open: true, results: true },
      items: [result("9")], offset: 30, noMore: false, timeRanges: [{ value: "week", name: "7 days" }],
    };
    expect(parseCommunitySearchSession(state, "42")?.keyword).toBe("hello world");
    expect(parseCommunitySearchSession(state, "43")).toBeNull();
    expect(parseCommunitySearchSession({ ...state, extra: "x".repeat(100_000) }, "42")).toBeNull();
    expect(parseCommunitySearchSession({ ...state, items: [{ ...result("9"), thumb: "javascript:alert(1)" }] }, "42")?.items[0]?.thumb).toBe("");
    expect(parseCommunitySearchSession({ ...state, version: 99 }, "42")).toBeNull();
    const parsed = parseCommunitySearchSession(state, "42");
    expect(parsed).not.toBeNull();
    if (parsed === null) throw new Error("expected valid session");
    writeCommunitySearchSession(parsed);
    expect(readCommunitySearchSession("42")?.items.map((item) => item.id)).toEqual(["9"]);
    expect(readCommunitySearchSession("43")).toBeNull();
    clearCommunitySearchSavedState("42");
    expect(readCommunitySearchSession("42")).toBeNull();
  });

  it("normalizes keywords and rejects invalid time ranges", () => {
    expect(normalizeSearchKeyword("  one two  ")).toBe("one two");
    expect(isSearchTimeRange("last_7-days")).toBe(true);
    expect(isSearchTimeRange("<script>")).toBe(false);
  });

  it("advances offsets over duplicate pages and bounds repeated probes", () => {
    const collector = { items: [result("1")], offset: 30 };
    const duplicate = collectCommunitySearchPage(collector, { items: [result("1")], linkCount: 30 }, false);
    expect(duplicate).toEqual({ added: 0, duplicateOnly: true, exhausted: false });
    expect(collector.offset).toBe(60);
    expect(COMMUNITY_SEARCH_DUPLICATE_PAGE_LIMIT).toBe(3);
    expect(collectCommunitySearchPage(collector, { items: [result("2")], linkCount: 30 }, false).added).toBe(1);
    expect(collector.items.map((item) => item.id)).toEqual(["1", "2"]);
    expect(collectCommunitySearchPage(collector, { items: [], linkCount: 0 }, false).exhausted).toBe(true);
  });

  it("does not issue a second request while paging is active", () => {
    expect(planCommunitySearchPaging({ offset: 30, noMore: false }, true)).toBe("wait");
    expect(planCommunitySearchPaging({ offset: 30, noMore: false }, false)).toBe("request");
    expect(planCommunitySearchPaging({ offset: 30, noMore: true }, false)).toBe("done");
  });
});
