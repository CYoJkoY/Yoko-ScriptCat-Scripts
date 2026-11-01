// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  RAIL_PAGE_SIZE,
  RAIL_PENDING_ID_PREFIX,
  attachRailPendingReplies,
  buildRailCommentTree,
  buildArticleCommentBody,
  buildDeleteCommentBody,
  createRailPendingReply,
  findRailFloorIdForComment,
  isOwnRailComment,
  mergeRailPageItems,
  normalizeRailGroup,
  pruneRailPendingReplies,
  readRailFloorTotal,
  readRailPageCache,
  railItemsHaveComment,
  railThreadHasPendingReply,
  resolveCommentPageProgress,
  resolveMergedCommentProgress,
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

  it("nests a floor, its reply, and the reply to that reply", () => {
    const entry = normalizeRailGroup(group(floor("50", "floor"), [
      { ...floor("51", "child"), replyid: 50, replyuser: { username: "floor-author" } },
      { ...floor("52", "grandchild"), replyid: 51, replyuser: { username: "child-author" } },
    ]));
    expect(entry).not.toBeNull();
    if (entry === null) return;
    const tree = buildRailCommentTree(entry);
    expect(tree.map((node) => node.id)).toEqual(["51"]);
    expect(tree[0].children.map((node) => node.id)).toEqual(["52"]);
    expect(tree[0].children[0].replyName).toBe("child-author");
  });

  it("accepts replyid and reply_id as parent relations", () => {
    const entry = normalizeRailGroup(group(floor("60", "floor"), [
      { ...floor("61", "child"), replyid: 60 },
      { ...floor("62", "other"), reply_id: "61" },
    ]));
    expect(entry?.subComments[0].parentId).toBe("60");
    expect(entry?.subComments[1].parentId).toBe("61");
    const tree = buildRailCommentTree(entry as NonNullable<typeof entry>);
    expect(tree[0].children[0].id).toBe("62");
  });

  it("attaches a reply whose parent is missing or points at itself", () => {
    const entry = normalizeRailGroup(group(floor("70", "floor"), [
      { ...floor("71", "orphan"), replyid: 999 },
      { ...floor("72", "self"), replyid: 72 },
    ]));
    const tree = buildRailCommentTree(entry as NonNullable<typeof entry>);
    expect(tree.map((node) => node.id)).toEqual(["71", "72"]);
    expect(tree[0].children).toHaveLength(0);
  });

  it("breaks a parent cycle without dropping either comment", () => {
    const entry = normalizeRailGroup(group(floor("80", "floor"), [
      { ...floor("81", "a"), replyid: 82 },
      { ...floor("82", "b"), replyid: 81 },
    ]));
    const tree = buildRailCommentTree(entry as NonNullable<typeof entry>);
    expect(tree.map((node) => node.id).sort()).toEqual(["81", "82"]);
    expect(tree.every((node) => node.children.length === 0)).toBe(true);
  });

  it("keeps server order for independent replies and ignores duplicate ids", () => {
    const entry = normalizeRailGroup(group(floor("90", "floor"), [
      floor("91", "first"),
      floor("92", "second"),
      floor("91", "duplicate"),
    ]));
    const tree = buildRailCommentTree(entry as NonNullable<typeof entry>);
    expect(tree.map((node) => node.id)).toEqual(["91", "92"]);
  });

  it("finds a grandchild when checking whether a loaded page holds an id", () => {
    const entry = normalizeRailGroup(group(floor("95", "floor"), [
      { ...floor("96", "child"), replyid: 95 },
      { ...floor("97", "grandchild"), replyid: 96 },
    ]));
    expect(railItemsHaveComment(entry === null ? [] : [entry], "97")).toBe(true);
    expect(railItemsHaveComment(entry === null ? [] : [entry], "98")).toBe(false);
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

  it("builds a delete body with only the comment id", () => {
    expect(buildDeleteCommentBody("123")).toEqual({ comment_id: "123" });
  });
});

describe("comment ownership", () => {
  it("reads the author id from the documented user fields", () => {
    for (const key of ["userid", "user_id", "heybox_id", "id"] as const) {
      const entry = normalizeRailGroup(group({ comment_id: "40", text: "<p>x</p>", user: { username: "u", [key]: 4321 } }, []));
      expect(entry?.userId, key).toBe("4321");
    }
  });

  it("leaves the author id empty when the payload hides it", () => {
    expect(normalizeRailGroup(group(floor("41", "no id"), []))?.userId).toBe("");
    expect(normalizeRailGroup(group({ comment_id: "42", text: "<p>y</p>", user: { username: "u", userid: "0" } }, []))?.userId).toBe("");
  });

  it("only matches the signed-in account", () => {
    const comment = { userId: "4321" };
    expect(isOwnRailComment(comment, "4321")).toBe(true);
    expect(isOwnRailComment(comment, "4322")).toBe(false);
    expect(isOwnRailComment(comment, "")).toBe(false);
    expect(isOwnRailComment({ userId: "" }, "4321")).toBe(false);
  });
});

function entry(id: string, children: readonly Record<string, unknown>[] = []): NonNullable<ReturnType<typeof normalizeRailGroup>> {
  const parsed = normalizeRailGroup(group(floor(id, "floor " + id), children));
  if (parsed === null) throw new Error("Expected a floor for " + id);
  return parsed;
}

describe("floor lookup for a refresh", () => {
  it("finds the floor of a direct reply and of a nested reply", () => {
    const items = [
      entry("100", [floor("101", "child")]),
      entry("200", [{ ...floor("201", "child"), replyid: 200 }, { ...floor("202", "grandchild"), replyid: 201 }]),
    ];
    expect(findRailFloorIdForComment(items, "100")).toBe("100");
    expect(findRailFloorIdForComment(items, "101")).toBe("100");
    expect(findRailFloorIdForComment(items, "202")).toBe("200");
  });

  it("reports no floor for an id that is not loaded", () => {
    expect(findRailFloorIdForComment([entry("300")], "301")).toBe("");
    expect(findRailFloorIdForComment([], "300")).toBe("");
    expect(findRailFloorIdForComment([entry("300")], "")).toBe("");
  });
});

describe("merged page refresh", () => {
  it("keeps floors of other pages and replaces the refreshed floor in place", () => {
    const existing = [entry("1"), entry("2"), entry("3")];
    const incoming = [entry("2", [floor("20", "new reply")])];
    const merged = mergeRailPageItems(existing, incoming);
    expect(merged.map((item) => item.id)).toEqual(["1", "2", "3"]);
    expect(merged[1].subComments.map((item) => item.id)).toEqual(["20"]);
  });

  it("puts a floor the list has not seen above the loaded ones", () => {
    const merged = mergeRailPageItems([entry("1"), entry("2")], [entry("0"), entry("2")]);
    expect(merged.map((item) => item.id)).toEqual(["0", "1", "2"]);
  });

  it("keeps the loaded floors when the refreshed page is empty", () => {
    const merged = mergeRailPageItems([entry("1"), entry("2")], []);
    expect(merged.map((item) => item.id)).toEqual(["1", "2"]);
  });

  it("reports progress from the merged list, not from the refreshed page", () => {
    expect(resolveMergedCommentProgress({ loadedGroups: 40, floorTotal: 40, rawGroupCount: 20 })).toEqual({
      hasMore: false,
      loadedGroups: 40,
    });
    expect(resolveMergedCommentProgress({ loadedGroups: 20, floorTotal: 40, rawGroupCount: 20 })).toEqual({
      hasMore: true,
      loadedGroups: 20,
    });
    expect(resolveMergedCommentProgress({ loadedGroups: 20, floorTotal: 0, rawGroupCount: RAIL_PAGE_SIZE }).hasMore).toBe(true);
    expect(resolveMergedCommentProgress({ loadedGroups: 20, floorTotal: 0, rawGroupCount: 1 }).hasMore).toBe(false);
  });
});

describe("optimistic reply rows", () => {
  const pending = createRailPendingReply({
    parentId: "500",
    rootId: "400",
    text: "hello there",
    userId: "77",
    createAt: 1_700_000_000,
    sequence: 3,
  });

  it("uses the created id when the create call reported one", () => {
    expect(createRailPendingReply({
      parentId: "500",
      rootId: "400",
      text: "hello there",
      userId: "77",
      createAt: 1_700_000_000,
      sequence: 3,
      commentId: "9001",
    }).id).toBe("9001");
    expect(pending.id).toBe(RAIL_PENDING_ID_PREFIX + "3");
    expect(pending.text).toBe("hello there");
    expect(pending.parentId).toBe("500");
    expect(pending.rootId).toBe("400");
    expect(pending.body).toEqual([{ type: "text", text: "hello there" }]);
  });

  it("attaches the local row under its floor without touching the server rows", () => {
    const floorEntry = entry("400", [floor("401", "existing")]);
    const attached = attachRailPendingReplies(floorEntry, [pending]);
    expect(attached.subComments.map((item) => item.id)).toEqual(["401", pending.id]);
    expect(attached.quotes).toBe(attached.subComments);
    expect(floorEntry.subComments.map((item) => item.id)).toEqual(["401"]);
    expect(attachRailPendingReplies(floorEntry, [])).toBe(floorEntry);
  });

  it("matches a local row against the echoed row by id or by author and text", () => {
    const echoed = entry("400", [{ ...floor("500", "hello there"), user: { username: "u", userid: 77 } }]);
    expect(railThreadHasPendingReply(echoed, pending)).toBe(true);
    expect(railThreadHasPendingReply(echoed, { ...pending, text: "something else" })).toBe(false);
    expect(railThreadHasPendingReply(entry("400"), pending)).toBe(false);
    const byId = { ...pending, id: "500", text: "different text" };
    expect(railThreadHasPendingReply(echoed, byId)).toBe(true);
  });

  it("does not treat a local row as its own echo", () => {
    const attached = attachRailPendingReplies(entry("400"), [pending]);
    expect(railThreadHasPendingReply(attached, pending)).toBe(false);
  });

  it("keeps only the local rows the site has not returned yet", () => {
    const items = [entry("400", [{ ...floor("500", "hello there"), user: { username: "u", userid: 77 } }])];
    expect(pruneRailPendingReplies(items, [pending])).toEqual([]);
    expect(pruneRailPendingReplies(items, [pending, { ...pending, text: "second", id: RAIL_PENDING_ID_PREFIX + "4" }])).toHaveLength(1);
    expect(pruneRailPendingReplies([entry("400")], [pending])).toEqual([pending]);
    expect(pruneRailPendingReplies(items, [])).toEqual([]);
  });
});
