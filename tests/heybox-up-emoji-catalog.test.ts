// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyRailEmojiCatalog,
  RAIL_EMOJI_NAMES,
  RAIL_EMOJI_PACKS,
  RAIL_HEYGIRL_NAMES,
  readRailEmojiCatalogEntries,
  type RailEmojiCatalog,
} from "../scripts/heybox-up/src/ui/rail";
import {
  discoverRailEmojiAssetSources,
  loadRailEmojiCatalog,
  parseRailEmojiCatalogFromSources,
  resetRailEmojiCatalogCache,
} from "../scripts/heybox-up/src/ui/emoji-catalog";

const deriveId = (index: number): string =>
  String((Math.floor(index / 6) + 1) * 10 + (index % 6) + 1);

const baselineCatalog = (): RailEmojiCatalog => ({
  cube: {
    sprite: RAIL_EMOJI_PACKS.cube.sprite,
    columns: RAIL_EMOJI_PACKS.cube.columns,
    rows: RAIL_EMOJI_PACKS.cube.rows,
    entries: RAIL_EMOJI_NAMES.map((name, index) => ({ name, id: deriveId(index) })),
  },
  heygirl: {
    sprite: RAIL_EMOJI_PACKS.heygirl.sprite,
    columns: RAIL_EMOJI_PACKS.heygirl.columns,
    rows: RAIL_EMOJI_PACKS.heygirl.rows,
    entries: RAIL_HEYGIRL_NAMES.map((name, index) => ({ name, id: deriveId(index) })),
  },
});

const testScript = (): string => {
  const cube = ["哭泣", "酷", "预言"]
    .map((name, index) => '{name:"' + name + '",id:' + deriveId(index) + ',unicode:"e012"}')
    .join(",");
  const heygirl = ["诶嘿", "挨刀"]
    .map((name, index) => '{name:"' + name + '",id:' + deriveId(index) + '}')
    .join(",");
  return [
    'const cubeList=[' + cube + '];',
    'const heygirlList=[' + heygirl + '];',
    'const packs=[{type:"cube",list:cubeList},{type:"heygirl",list:heygirlList}];',
  ].join("");
};

const testCss = (): string => [
  '.hb-emoji-cube{background-image:url(https://imgheybox.max-c.com/heybox_web/emoji/cube/cube_emoji_v36.png);background-size:120px 380px;}',
  ':root{--cube-length:20px;}',
  '.hb-emoji-heygirl{background-image:url(https://cdn.max-c.com/heybox_web/emoji/cube2/cube2_emoji.png);background-size:120px 80px;}',
  ':root{--heygirl-length:20px;}',
].join("");

const memoryStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  } satisfies Storage;
};

describe("heybox up live emoji catalog", () => {
  beforeEach(() => {
    resetRailEmojiCatalogCache();
    vi.stubGlobal("localStorage", memoryStorage());
  });

  afterEach(() => {
    applyRailEmojiCatalog(baselineCatalog());
    resetRailEmojiCatalogCache();
    vi.unstubAllGlobals();
  });

  it("parses both packs from the site bundle and stylesheet", () => {
    const parsed = parseRailEmojiCatalogFromSources(testScript(), testCss());
    expect(parsed?.cube).toMatchObject({
      sprite: "https://imgheybox.max-c.com/heybox_web/emoji/cube/cube_emoji_v36.png",
      columns: 6,
      rows: 19,
    });
    expect(parsed?.cube?.entries).toEqual([
      { name: "哭泣", id: "11", unicode: "e012" },
      { name: "酷", id: "12", unicode: "e012" },
      { name: "预言", id: "13", unicode: "e012" },
    ]);
    expect(parsed?.heygirl).toMatchObject({
      sprite: "https://cdn.max-c.com/heybox_web/emoji/cube2/cube2_emoji.png",
      columns: 6,
      rows: 4,
    });
  });

  it("keeps the intact pack when the other pack is malformed", () => {
    const parsed = parseRailEmojiCatalogFromSources(testScript(), testCss().replace("background-size:120px 380px;", ""));
    if (parsed === null) throw new Error("Expected the intact pack to parse");
    expect(parsed?.cube).toBeUndefined();
    expect(parsed?.heygirl?.entries).toHaveLength(2);
    expect(applyRailEmojiCatalog(parsed)).toBe(true);
    expect(readRailEmojiCatalogEntries("cube")).toHaveLength(RAIL_EMOJI_NAMES.length);
    expect(readRailEmojiCatalogEntries("heygirl")).toHaveLength(2);
  });

  it("discovers the current app bundle without a pinned hash", () => {
    document.body.innerHTML = [
      '<script src="https://static.example/static/heybox/webapp/@heybox-spa/website/app/index-old.js"></script>',
      '<link rel="stylesheet" href="https://static.example/static/heybox/webapp/@heybox-spa/website/app/index-old.css">',
    ].join("");
    expect(discoverRailEmojiAssetSources()).toEqual({
      scriptUrl: "https://static.example/static/heybox/webapp/@heybox-spa/website/app/index-old.js",
      cssUrl: "https://static.example/static/heybox/webapp/@heybox-spa/website/app/index-old.css",
    });
  });

  it("loads a fresh catalog once and reuses its local cache", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn((input: unknown) => {
      urls.push(String(input));
      const url = String(input);
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(url.endsWith(".css") ? testCss() : testScript()),
      });
    }));
    const sources = {
      scriptUrl: "https://static.example/static/heybox/webapp/@heybox-spa/website/app/index-a.js",
      cssUrl: "https://static.example/static/heybox/webapp/@heybox-spa/website/app/index-a.css",
    };
    const loaded = await loadRailEmojiCatalog(sources);
    expect(loaded?.cube?.entries).toHaveLength(3);
    expect(urls).toHaveLength(2);
    const cached = await loadRailEmojiCatalog(sources);
    expect(cached?.cube?.entries).toHaveLength(3);
    expect(urls).toHaveLength(2);
  });

  it("falls back without changing the registry after a failed refresh", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 503, text: () => Promise.resolve("") })));
    const sources = {
      scriptUrl: "https://static.example/static/heybox/webapp/@heybox-spa/website/app/index-b.js",
      cssUrl: "https://static.example/static/heybox/webapp/@heybox-spa/website/app/index-b.css",
    };
    await expect(loadRailEmojiCatalog(sources)).resolves.toBeNull();
    expect(readRailEmojiCatalogEntries("cube")).toHaveLength(RAIL_EMOJI_NAMES.length);
    await expect(loadRailEmojiCatalog(sources)).resolves.toBeNull();
  });
});
