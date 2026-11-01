// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RAIL_PAGE_CACHE_HOLDOFF_MS,
  RAIL_PAGE_CACHE_TTL_MS,
  clearRailPageCache,
  holdRailPageCache,
  isRailPageCacheHeld,
  normalizeRailGroup,
  railItemsHaveComment,
  readCreatedCommentId,
  readRailPageCache,
  writeRailPageCache,
} from "../scripts/heybox-up/src/ui/rail";

function page(total: number, floorTotal: number): Parameters<typeof writeRailPageCache>[3] {
  return {
    items: [],
    total: total,
    floorTotal: floorTotal,
    title: "t",
    link: { isAward: false, isFavour: false, awardCount: 0, favourCount: 0, commentCount: total, cyCount: 0 },
    groups: [],
  };
}

afterEach(() => {
  vi.useRealTimers();
  holdRailPageCache("", 0);
  clearRailPageCache("200");
  clearRailPageCache("201");
});

describe("rail page cache staleness", () => {
  it("honours a shorter max age than the two minute ttl", () => {
    vi.useFakeTimers();
    clearRailPageCache("200");
    writeRailPageCache("200", 1, "", page(3, 3));
    expect(readRailPageCache("200", 1, "", 15_000)?.total).toBe(3);
    vi.advanceTimersByTime(16_000);
    expect(readRailPageCache("200", 1, "", 15_000)).toBeNull();
  });

  it("keeps the cached page while it is younger than the asked age", () => {
    vi.useFakeTimers();
    clearRailPageCache("201");
    writeRailPageCache("201", 1, "", page(5, 5));
    vi.advanceTimersByTime(5_000);
    expect(readRailPageCache("201", 1, "", 15_000)?.total).toBe(5);
  });

  it("clamps an oversized max age to the two minute ttl", () => {
    vi.useFakeTimers();
    clearRailPageCache("201");
    writeRailPageCache("201", 1, "", page(4, 4));
    vi.advanceTimersByTime(RAIL_PAGE_CACHE_TTL_MS + 1);
    expect(readRailPageCache("201", 1, "", RAIL_PAGE_CACHE_TTL_MS * 10)).toBeNull();
  });
});

describe("rail page cache holdoff", () => {
  it("drops the cached pages and blocks reads and writes for the window", () => {
    vi.useFakeTimers();
    clearRailPageCache("200");
    writeRailPageCache("200", 1, "", page(6, 6));
    holdRailPageCache("200");
    expect(isRailPageCacheHeld("200")).toBe(true);
    expect(readRailPageCache("200", 1)).toBeNull();
    writeRailPageCache("200", 1, "", page(9, 9));
    expect(readRailPageCache("200", 1)).toBeNull();
  });

  it("expires on its own so the cache is usable again", () => {
    vi.useFakeTimers();
    clearRailPageCache("200");
    holdRailPageCache("200");
    vi.advanceTimersByTime(RAIL_PAGE_CACHE_HOLDOFF_MS + 1);
    expect(isRailPageCacheHeld("200")).toBe(false);
    writeRailPageCache("200", 1, "", page(7, 7));
    expect(readRailPageCache("200", 1)?.total).toBe(7);
  });

  it("ignores an empty link id", () => {
    holdRailPageCache("");
    expect(isRailPageCacheHeld("")).toBe(false);
  });
});

describe("created comment id", () => {
  it("reads the id from the documented result shapes", () => {
    expect(readCreatedCommentId({ comment_id: 555 })).toBe("555");
    expect(readCreatedCommentId({ commentid: "556" })).toBe("556");
    expect(readCreatedCommentId({ id: "557" })).toBe("557");
    expect(readCreatedCommentId({ comment: { comment_id: "558" } })).toBe("558");
  });

  it("rejects payloads without a usable id", () => {
    expect(readCreatedCommentId(null)).toBe("");
    expect(readCreatedCommentId({})).toBe("");
    expect(readCreatedCommentId({ comment_id: 0 })).toBe("");
    expect(readCreatedCommentId({ comment_id: -1 })).toBe("");
    expect(readCreatedCommentId({ comment_id: "  " })).toBe("");
    expect(readCreatedCommentId({ comment_id: "undefined" })).toBe("");
    expect(readCreatedCommentId("559")).toBe("");
  });
});

describe("rail items lookup", () => {
  const root = normalizeRailGroup({ comment: [{ comment_id: "700", text: "<p>root</p>", user: { username: "u" } }] });
  const withChild = normalizeRailGroup({
    comment: [
      { comment_id: "710", text: "<p>root</p>", user: { username: "u" } },
      { comment_id: "711", text: "<p>child</p>", user: { username: "u" }, root_id: "710" },
    ],
  });
  const items = root === null || withChild === null ? [] : [root, withChild];

  it("finds a floor and a nested reply", () => {
    expect(railItemsHaveComment(items, "700")).toBe(true);
    expect(railItemsHaveComment(items, "710")).toBe(true);
    expect(railItemsHaveComment(items, "711")).toBe(true);
  });

  it("reports a missing id and an empty request as absent", () => {
    expect(railItemsHaveComment(items, "999")).toBe(false);
    expect(railItemsHaveComment(items, "")).toBe(false);
    expect(railItemsHaveComment([], "700")).toBe(false);
  });
});
