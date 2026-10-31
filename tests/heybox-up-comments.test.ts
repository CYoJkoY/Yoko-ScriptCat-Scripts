// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  RAIL_PAGE_SIZE,
  buildArticleCommentBody,
  normalizeRailGroup,
  readRailFloorTotal,
  readRailPageCache,
  resolveCommentPageProgress,
  writeRailPageCache,
} from "../scripts/heybox-up/src/ui/rail";
import { clearRailPageCache } from "../scripts/heybox-up/src/ui/rail";

function floor(id: string, text: string): Record<string, unknown> {
  return { comment_id: id, text: "<p>" + text + "</p>", user: { username: "u" + id } };
}

function group(root: Record<string, unknown>, children: readonly Record<string, unknown>[]): Record<string, unknown> {
  return { comment: [root, ...children] };
}

beforeEach(() => {
  clearRailPageCache("100");
});

describe("rail comment tree", () => {
  it("derives root and parent ids for children that omit them", () => {
    const entry = normalizeRailGroup(group(floor("10", "floor"), [floor("11", "child")]));
    expect(entry).not.toBeNull();
    expect(entry?.rootId).toBe("10");
    expect(entry?.subComments).toHaveLength(1);
    expect(entry?.subComments[0].rootId).toBe("10");
    expect(entry?.subComments[0].parentId).toBe("10");
  });

  it("keeps server relation fields when they are present", () => {
    const child = {
      ...floor("12", "nested child"),
      root_id: "10",
      parent_id: "11",
    };
    const entry = normalizeRailGroup(group(floor("10", "floor"), [child]));
    expect(entry?.subComments[0].rootId).toBe("10");
    expect(entry?.subComments[0].parentId).toBe("11");
  });

  it("ignores placeholder relation ids", () => {
    const child = { ...floor("13", "placeholder"), root_id: "-1", parent_id: "0" };
    const entry = normalizeRailGroup(group(floor("10", "floor"), [child]));
    expect(entry?.subComments[0].rootId).toBe("10");
    expect(entry?.subComments[0].parentId).toBe("10");
  });

  it("keeps every child floor and deduplicates repeated ids", () => {
    const children = [floor("21", "a"), floor("22", "b"), floor("23", "c"), floor("24", "d"), floor("22", "b again")];
    const entry = normalizeRailGroup(group(floor("20", "root"), children));
    expect(entry?.subComments.map((item) => item.id)).toEqual(["21", "22", "23", "24"]);
    expect(entry?.quotes).toBe(entry?.subComments);
  });

  it("keeps children that have no id so nothing is silently dropped", () => {
    const anonymous = { text: "<p>no id child</p>", user: { username: "guest" } };
    const entry = normalizeRailGroup(group(floor("30", "root"), [anonymous]));
    expect(entry?.subComments).toHaveLength(1);
    expect(entry?.subComments[0].rootId).toBe("30");
  });
});

describe("comment page progress", () => {
  const base = { previouslyLoadedGroups: 0, floorTotal: 40 };

  it("stops when the page is empty", () => {
    expect(resolveCommentPageProgress({ ...base, rawGroupCount: 0, freshGroupCount: 0 })).toEqual({
      hasMore: false,
      loadedGroups: 0,
    });
  });

  it("stops when every group was already loaded", () => {
    expect(resolveCommentPageProgress({ ...base, rawGroupCount: 20, freshGroupCount: 0 })).toEqual({
      hasMore: false,
      loadedGroups: 20,
    });
  });

  it("continues while the floor total is not reached", () => {
    expect(resolveCommentPageProgress({ ...base, rawGroupCount: 20, freshGroupCount: 20 })).toEqual({
      hasMore: true,
      loadedGroups: 20,
    });
  });

  it("stops exactly at the advertised floor total", () => {
    expect(resolveCommentPageProgress({
      previouslyLoadedGroups: 20,
      rawGroupCount: 20,
      freshGroupCount: 20,
      floorTotal: 40,
    })).toEqual({ hasMore: false, loadedGroups: 40 });
  });

  it("falls back to the page size when the total is missing", () => {
    expect(resolveCommentPageProgress({ ...base, rawGroupCount: RAIL_PAGE_SIZE, freshGroupCount: 1, floorTotal: 0 }).hasMore).toBe(true);
    expect(resolveCommentPageProgress({ ...base, rawGroupCount: RAIL_PAGE_SIZE - 1, freshGroupCount: 1, floorTotal: 0 }).hasMore).toBe(false);
  });
});

describe("comment payload helpers", () => {
  it("reads a positive floor total and rejects invalid values", () => {
    expect(readRailFloorTotal({ total_floor_num: 12 })).toBe(12);
    expect(readRailFloorTotal({ total_floor_num: "7" })).toBe(7);
    expect(readRailFloorTotal({ total_floor_num: 0 })).toBe(0);
    expect(readRailFloorTotal({})).toBe(0);
    expect(readRailFloorTotal(null)).toBe(0);
  });

  it("keeps the floor total across a cache round trip", () => {
    writeRailPageCache("100", 1, "", {
      items: [],
      total: 3,
      floorTotal: 9,
      title: "t",
      link: { isAward: false, isFavour: false, awardCount: 0, favourCount: 0, commentCount: 3, cyCount: 0 },
      groups: [],
    });
    expect(readRailPageCache("100", 1)?.floorTotal).toBe(9);
  });

  it("builds a main comment body with the sentinel reply ids", () => {
    expect(buildArticleCommentBody("888", "hi", null)).toEqual({
      is_cy: "0",
      link_id: "888",
      reply_id: "-1",
      root_id: "-1",
      text: "hi",
    });
  });

  it("builds a floor reply and a nested reply with their real ids", () => {
    expect(buildArticleCommentBody("888", "to floor", { id: "10", rootId: "10" })).toMatchObject({
      reply_id: "10",
      root_id: "10",
    });
    expect(buildArticleCommentBody("888", "to child", { id: "11", rootId: "10" })).toMatchObject({
      reply_id: "11",
      root_id: "10",
    });
  });
});
