// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  buildCommunitySearchUrl,
  COMMUNITY_SEARCH_DUPLICATE_PAGE_LIMIT,
  collectCommunitySearchPage,
  fetchCommunitySearchPage,
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

  it("sends tag filters and reads the site's filter_tag options", async () => {
    const url = new URL(buildCommunitySearchUrl("42", "game", 30, "week", "guide", false));
    expect(url.searchParams.get("topic_id")).toBe("42");
    expect(url.searchParams.get("time_range")).toBe("week");
    expect(url.searchParams.get("filter_tag")).toBe("guide");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "ok",
      result: {
        items: [
          { type: "filter_tag", filter_tags: [{ tag: "guide", name: "攻略" }, { tag: "news", name: "资讯" }] },
          { type: "link", info: { linkid: "77", title: "A post" } },
        ],
      },
    }), { status: 200, headers: { "content-type": "application/json" } })));
    try {
      const page = await fetchCommunitySearchPage("https://example.test/search", new AbortController().signal);
      expect(page.ok).toBe(true);
      if (page.ok) {
        expect(page.filterTags).toEqual([{ tag: "guide", name: "攻略" }, { tag: "news", name: "资讯" }]);
        expect(page.items).toHaveLength(1);
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("persists a selected tag and safely ignores unknown tag options", () => {
    const state = {
      version: 1,
      state: { topicId: "42", keyword: "hello", timeRange: "", filterTag: "guide", open: true, results: true },
      items: [result("9")], offset: 30, noMore: false, timeRanges: [],
      filterTags: [{ tag: "guide", name: "攻略" }],
    };
    expect(parseCommunitySearchSession(state, "42")?.filterTag).toBe("guide");
    expect(parseCommunitySearchSession({ ...state, filterTags: [{ tag: "bad tag", name: "Bad" }] }, "42")).toBeNull();
    expect(parseCommunitySearchSession({ ...state, filterTags: [], state: { ...state.state, filterTag: "missing" } }, "42")?.filterTag).toBe("");
  });

  it("restores older sessions without category fields as unfiltered sessions", () => {
    const legacyState = {
      version: 1,
      state: { topicId: "42", keyword: "hello", timeRange: "", open: true, results: true },
      items: [result("9")], offset: 30, noMore: false, timeRanges: [],
    };
    expect(parseCommunitySearchSession(legacyState, "42")).toMatchObject({ filterTag: "", filterTags: [] });
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
