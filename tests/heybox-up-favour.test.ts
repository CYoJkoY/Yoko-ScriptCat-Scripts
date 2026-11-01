// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  normalizeFavourFolders,
  planFavourChanges,
  planHasFavourChange,
  readFavourFolderId,
  readFavourFolderPage,
  resolveFavourOutcome,
} from "../scripts/heybox-up/src/ui/favour";

describe("favour folders", () => {
  it("normalizes ids and names and drops duplicates", () => {
    expect(normalizeFavourFolders([
      { id: 12, name: " 默认 " },
      { folder_id: "13", folder_name: "游戏" },
      { id: "12", name: "重复" },
      { id: "", name: "无 id" },
      null,
    ])).toEqual([
      { id: "12", name: "默认" },
      { id: "13", name: "游戏" },
    ]);
  });

  it("falls back to a readable name for a blank folder name", () => {
    expect(normalizeFavourFolders([{ id: "14", name: "  " }])).toEqual([
      { id: "14", name: "未命名收藏夹" },
    ]);
  });

  it("reads the created folder id from the nested and flat shapes", () => {
    expect(readFavourFolderId({ folder: { id: 21 } })).toBe("21");
    expect(readFavourFolderId({ folder: { folder_id: "22" } })).toBe("22");
    expect(readFavourFolderId({ folder_id: 23 })).toBe("23");
    expect(readFavourFolderId({})).toBe("");
    expect(readFavourFolderId(null)).toBe("");
  });
});

describe("favour folder pages", () => {
  it("reads link ids from the new style collect structure", () => {
    expect(readFavourFolderPage({
      links: [{ link: { linkid: 101 } }, { link: { link_id: "102" } }, { link_id: 103 }],
      has_next: 1,
    })).toEqual({ linkIds: ["101", "102", "103"], hasNext: true });
  });

  it("accepts every truthy pagination spelling", () => {
    for (const value of ["1", 1, true]) {
      expect(readFavourFolderPage({ links: [], has_next: value }).hasNext, String(value)).toBe(true);
    }
    expect(readFavourFolderPage({ links: [], has_more: "1" }).hasNext).toBe(true);
    for (const value of ["0", 0, false, undefined]) {
      expect(readFavourFolderPage({ links: [], has_next: value }).hasNext, String(value)).toBe(false);
    }
  });

  it("returns an empty page for a malformed result", () => {
    expect(readFavourFolderPage(null)).toEqual({ linkIds: [], hasNext: false });
    expect(readFavourFolderPage({ links: "nope" })).toEqual({ linkIds: [], hasNext: false });
  });
});

describe("favour change planning", () => {
  const base = {
    favourited: true,
    folderIds: ["1", "2", "3"],
    checkedIds: ["1", "3"],
    memberIds: ["2"],
    unknownIds: [],
  };

  it("adds checked folders and removes unchecked membership", () => {
    const plan = planFavourChanges(base);
    expect(plan.addIds).toEqual(["1", "3"]);
    expect(plan.removeIds).toEqual(["2"]);
    expect(plan.removeAll).toBe(false);
    expect(planHasFavourChange(plan)).toBe(true);
  });

  it("plans no request when nothing changed", () => {
    const plan = planFavourChanges({ ...base, checkedIds: ["2"], memberIds: ["2"] });
    expect(plan.addIds).toEqual([]);
    expect(plan.removeIds).toEqual([]);
    expect(planHasFavourChange(plan)).toBe(false);
  });

  it("uses a global removal only when every checkbox is clear", () => {
    const plan = planFavourChanges({ ...base, checkedIds: [], memberIds: ["1", "2"] });
    expect(plan.removeIds).toEqual(["1", "2"]);
    expect(plan.removeAll).toBe(true);
  });

  it("does not infer a global removal from an empty folder list", () => {
    const plan = planFavourChanges({
      favourited: true,
      folderIds: [],
      checkedIds: [],
      memberIds: [],
      unknownIds: [],
    });
    expect(plan.removeAll).toBe(false);
    expect(planHasFavourChange(plan)).toBe(false);
  });

  it("never removes a folder whose membership could not be read", () => {
    const plan = planFavourChanges({ ...base, checkedIds: ["1"], memberIds: ["2", "3"], unknownIds: ["2", "3"] });
    expect(plan.addIds).toEqual(["1"]);
    expect(plan.removeIds).toEqual([]);
    expect(plan.unknownIds).toEqual(["2", "3"]);
    expect(plan.removeAll).toBe(false);
  });

  it("still adds to an unknown folder when it is checked", () => {
    const plan = planFavourChanges({ ...base, checkedIds: ["2"], memberIds: [], unknownIds: ["2"] });
    expect(plan.addIds).toEqual(["2"]);
    expect(plan.removeIds).toEqual([]);
  });

  it("ignores ids that are not part of the current folder list", () => {
    const plan = planFavourChanges({ ...base, checkedIds: ["1", "99"], memberIds: ["2", "99"] });
    expect(plan.addIds).toEqual(["1"]);
    expect(plan.removeIds).toEqual(["2"]);
  });
});

describe("favour outcome", () => {
  const plan = planFavourChanges({
    favourited: true,
    folderIds: ["1", "2"],
    checkedIds: ["1"],
    memberIds: ["1", "2"],
    unknownIds: [],
  });

  it("keeps the favourite while one folder still holds it", () => {
    expect(resolveFavourOutcome(true, ["1", "2"], plan)).toBe(true);
  });

  it("drops the favourite after the last membership is removed", () => {
    const all = planFavourChanges({
      favourited: true,
      folderIds: ["1"],
      checkedIds: [],
      memberIds: ["1"],
      unknownIds: [],
    });
    expect(all.removeAll).toBe(true);
    expect(resolveFavourOutcome(true, ["1"], all)).toBe(false);
  });

  it("keeps the favourite when an unread folder may still hold it", () => {
    const partial = planFavourChanges({
      favourited: true,
      folderIds: ["1", "2"],
      checkedIds: [],
      memberIds: ["1"],
      unknownIds: ["2"],
    });
    expect(resolveFavourOutcome(true, ["1"], partial)).toBe(true);
  });

  it("reports a favourite after the first add", () => {
    const add = planFavourChanges({
      favourited: false,
      folderIds: ["1"],
      checkedIds: ["1"],
      memberIds: [],
      unknownIds: [],
    });
    expect(resolveFavourOutcome(false, [], add)).toBe(true);
  });
});
