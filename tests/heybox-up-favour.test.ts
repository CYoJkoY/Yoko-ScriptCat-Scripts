// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../scripts/heybox-up/src/core/account", () => ({
  resolveHeyboxId: vi.fn(async (): Promise<string> => "42"),
}));

vi.hoisted(() => {
  const memory = new Map<string, string>();
  const storage = {
    get length() { return memory.size; },
    clear(): void { memory.clear(); },
    getItem(key: string): string | null { return memory.get(key) ?? null; },
    key(index: number): string | null { return Array.from(memory.keys())[index] ?? null; },
    removeItem(key: string): void { memory.delete(key); },
    setItem(key: string, value: string): void { memory.set(key, String(value)); },
  };
  for (const name of ["localStorage", "sessionStorage"]) {
    Object.defineProperty(window, name, { configurable: true, value: storage });
    Object.defineProperty(globalThis, name, { configurable: true, value: storage });
  }
});

import {
  CACHE_KEY_PREFIX,
  CY_MAX_ITEMS,
  writeCache,
  type CyItem,
} from "../scripts/heybox-up/src/core/cy";
import { createFavourSection, formatFavourCountNote } from "../scripts/heybox-up/src/ui/favour";
import { localStore } from "../scripts/heybox-up/src/state";
import {
  normalizeFavourFolders,
  planFavourChanges,
  planHasFavourChange,
  readFavourFolderId,
  readFavourFolderPage,
  resolveFavourOutcome,
} from "../scripts/heybox-up/src/ui/favour";

describe("favour folders", () => {
  it("offers load-more when the API confirms more pages at the batch cap", () => {
    expect(formatFavourCountNote(CY_MAX_ITEMS, CY_MAX_ITEMS, "", true)).toContain("已加载 200 条");
    expect(formatFavourCountNote(CY_MAX_ITEMS, CY_MAX_ITEMS, "", true)).toContain(
      "可点击「加载更多」继续读取。",
    );
  });

  it("reports a complete list once the API says there are no more pages", () => {
    expect(formatFavourCountNote(CY_MAX_ITEMS, CY_MAX_ITEMS, "", false)).toContain(
      "接口已确认没有更多记录。",
    );
    expect(formatFavourCountNote(CY_MAX_ITEMS, CY_MAX_ITEMS, "", false)).not.toContain("结果可能不完整");
  });

  it("keeps the plain count below the batch cap regardless of the pagination signal", () => {
    expect(formatFavourCountNote(199, 199, "", false)).toContain("共 199 条");
    expect(formatFavourCountNote(199, 199, "", true)).toContain("共 199 条");
  });

  it("preserves the search match count in the limit notice", () => {
    expect(formatFavourCountNote(CY_MAX_ITEMS, 3, "tag", true)).toContain("匹配 3 条");
  });

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

describe("favour section load-more", () => {
  function cyRaw(id: number): unknown {
    return {
      text: "插眼内容 " + id,
      create_at: 1700000000 + id,
      comment_type: 1,
      link: { linkid: "p" + id, title: "帖子 " + id, thumbs: [] },
    };
  }

  function cyPage(list: unknown[], hasNext: string): Response {
    return new Response(JSON.stringify({ status: "ok", result: { links: list, has_next: hasNext } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  async function flush(): Promise<void> {
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
  }

  function part<T extends Element>(section: { host: HTMLElement }, selector: string): T {
    const node = section.host.shadowRoot?.querySelector<T>(selector);
    if (!node) throw new Error(selector + " missing");
    return node;
  }

  function cardCount(section: { host: HTMLElement }): number {
    return section.host.shadowRoot!.querySelectorAll(".card").length;
  }

  function requestOffset(call: unknown[]): string {
    return new URL(String(call[0])).searchParams.get("offset") ?? "";
  }

  const cyFetch = vi.fn(async (_input: RequestInfo | URL): Promise<Response> => cyPage([], "0"));
  let failNextBatch = false;

  beforeEach(() => {
    localStorage.clear();
    localStore.remove(CACHE_KEY_PREFIX + "42");
    failNextBatch = false;
    cyFetch.mockClear();
    cyFetch.mockImplementation(async (input: RequestInfo | URL): Promise<Response> => {
      const offset = new URL(String(input)).searchParams.get("offset") ?? "";
      if (offset !== "0" && failNextBatch) {
        failNextBatch = false;
        return new Response("boom", { status: 503 });
      }
      if (offset === "0") {
        return cyPage(Array.from({ length: CY_MAX_ITEMS }, (_, id) => cyRaw(id)), "1");
      }
      return cyPage([cyRaw(900), cyRaw(901)], "0");
    });
    vi.stubGlobal("fetch", cyFetch);
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("shows load-more at the batch cap and merges the next batch without duplicates", async () => {
    const section = createFavourSection();
    await flush();
    const more = part<HTMLButtonElement>(section, ".load-more");
    expect(more.hidden).toBe(false);
    expect(more.textContent).toBe("加载更多");
    expect(cardCount(section)).toBe(CY_MAX_ITEMS);
    more.click();
    await flush();
    expect(cardCount(section)).toBe(CY_MAX_ITEMS + 2);
    expect(part<HTMLButtonElement>(section, ".load-more").hidden).toBe(true);
    const note = part<HTMLElement>(section, ".note");
    expect(note.textContent).toContain("共 202 条插眼收藏");
    expect(note.textContent).toContain("接口已确认没有更多记录。");
  });

  it("keeps existing results on failure and retries the same offset", async () => {
    const section = createFavourSection();
    await flush();
    const more = part<HTMLButtonElement>(section, ".load-more");
    failNextBatch = true;
    more.click();
    await flush();
    const note = part<HTMLElement>(section, ".note");
    expect(note.textContent).toContain("读取失败：接口返回 HTTP 503");
    expect(note.textContent).toContain("（显示上次结果）");
    expect(cardCount(section)).toBe(CY_MAX_ITEMS);
    const retryMore = part<HTMLButtonElement>(section, ".load-more");
    expect(retryMore.hidden).toBe(false);
    expect(retryMore.disabled).toBe(false);
    const offsets = cyFetch.mock.calls.map(requestOffset);
    expect(offsets).toEqual(["0", "20"]);
    retryMore.click();
    await flush();
    expect(cardCount(section)).toBe(CY_MAX_ITEMS + 2);
  });

  it("hides load-more when the first page already ends the list", async () => {
    cyFetch.mockImplementation(async (): Promise<Response> => {
      return cyPage(Array.from({ length: 5 }, (_, id) => cyRaw(id)), "0");
    });
    const section = createFavourSection();
    await flush();
    expect(part<HTMLButtonElement>(section, ".load-more").hidden).toBe(true);
    expect(part<HTMLElement>(section, ".note").textContent).toContain("共 5 条插眼收藏");
    expect(cardCount(section)).toBe(5);
  });

  it("updates the search match count after a batch merge", async () => {
    const section = createFavourSection();
    await flush();
    const search = part<HTMLInputElement>(section, ".search");
    search.value = "帖子 900";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();
    expect(part<HTMLElement>(section, ".note").textContent).toContain("没有匹配");
    part<HTMLButtonElement>(section, ".load-more").click();
    await flush();
    const note = part<HTMLElement>(section, ".note");
    expect(note.textContent).toContain("匹配 1 条");
    expect(note.textContent).toContain("共 202 条");
  });

  it("resumes a cached load-more position without refetching the first batch", async () => {
    const cachedItems: CyItem[] = Array.from({ length: 2 }, (_, id) => ({
      id: "c" + id,
      title: "旧帖 " + id,
      text: "",
      createAt: 1,
      thumb: "",
      kind: "评论",
    }));
    writeCache("42", { items: cachedItems, hasNext: true, nextOffset: 220 });
    cyFetch.mockImplementation(async (input: RequestInfo | URL): Promise<Response> => {
      const offset = new URL(String(input)).searchParams.get("offset") ?? "";
      return offset === "220" ? cyPage([cyRaw(220)], "0") : cyPage([], "0");
    });
    const section = createFavourSection();
    await flush();
    expect(cyFetch).not.toHaveBeenCalled();
    expect(cardCount(section)).toBe(2);
    const more = part<HTMLButtonElement>(section, ".load-more");
    expect(more.hidden).toBe(false);
    more.click();
    await flush();
    expect(requestOffset(cyFetch.mock.calls[0])).toBe("220");
    expect(cardCount(section)).toBe(3);
    expect(part<HTMLButtonElement>(section, ".load-more").hidden).toBe(true);
  });
});
