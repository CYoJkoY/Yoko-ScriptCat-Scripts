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
  Object.defineProperty(globalThis, "IntersectionObserver", {
    configurable: true,
    writable: true,
    value: class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): unknown[] { return []; }
    },
  });
  // jsdom does not implement image decoding, and the reader awaits it before
  // restoring the scroll position once reader images settle.
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    writable: true,
    value: (): Promise<void> => Promise.resolve(),
  });
});

import { READER_ID, watchReader } from "../scripts/heybox-up/src/ui/reader";
import {
  resetRailEmojiCatalogCache,
} from "../scripts/heybox-up/src/ui/emoji-catalog";
import {
  applyRailEmojiCatalog,
  clearRailPageCache,
  RAIL_EMOJI_NAMES,
  RAIL_EMOJI_PACKS,
  RAIL_HEYGIRL_NAMES,
  readRailEmojiCatalogEntries,
  writeRailPageCache,
  type RailEmojiCatalog,
} from "../scripts/heybox-up/src/ui/rail";
import { READER_COMMENT_MARKS_KEY, saveReaderCommentMark } from "../scripts/heybox-up/src/ui/comment-marks";

const navigation = {
  sync: (): void => undefined,
  readStatus: () => ({ currentId: "1", revision: 0, prev: null, next: null, discovering: false, error: "", exhausted: true, history: [] }),
  takeNext: () => null,
  discover: async (): Promise<void> => undefined,
  subscribe: () => (): void => undefined,
};

const baselineRailEmojiCatalog = (): RailEmojiCatalog => ({
  cube: {
    sprite: RAIL_EMOJI_PACKS.cube.sprite,
    columns: RAIL_EMOJI_PACKS.cube.columns,
    rows: RAIL_EMOJI_PACKS.cube.rows,
    entries: RAIL_EMOJI_NAMES.map((name, index) => ({
      name,
      id: String((Math.floor(index / 6) + 1) * 10 + (index % 6) + 1),
    })),
  },
  heygirl: {
    sprite: RAIL_EMOJI_PACKS.heygirl.sprite,
    columns: RAIL_EMOJI_PACKS.heygirl.columns,
    rows: RAIL_EMOJI_PACKS.heygirl.rows,
    entries: RAIL_HEYGIRL_NAMES.map((name, index) => ({
      name,
      id: String((Math.floor(index / 6) + 1) * 10 + (index % 6) + 1),
    })),
  },
});

function mountReader(withLiveAssets: boolean = false): HTMLElement {
  history.replaceState(null, "", "/app/bbs/link/123456");
  document.body.innerHTML = [
    ...(withLiveAssets ? [
      '<script src="https://static.example/static/heybox/webapp/@heybox-spa/website/app/index-test.js"></script>',
      '<link rel="stylesheet" href="https://static.example/static/heybox/webapp/@heybox-spa/website/app/index-test.css">',
    ] : []),
    '<div id="page-bbs-link">',
    '<div class="hb-bbs-image-text">',
    '<div class="image-text__title">Title</div>',
    '<div class="image-text__header-image"><img src="https://img/a.jpg"><img src="https://img/b.jpg"><img src="https://img/c.jpg"></div>',
    '<div class="image-text__content"><p>Body</p></div>',
    '</div>',
    '<div class="link-user__user-wrapper"><a href="/app/user/profile/9"><img src="https://img/avatar.jpg"></a></div>',
    '<div class="link-user__username">Author</div>',
    '</div>',
  ].join("");
  watchReader(navigation);
  const host = document.getElementById(READER_ID);
  if (host === null) throw new Error("Expected the reader to mount");
  return host;
}

const treePayload = {
  status: "ok",
  result: {
    comments: [
      {
        comment: [
          { comment_id: "9001", text: "<p>fresh floor</p>", user: { username: "me", userid: 42 } },
        ],
      },
    ],
    link: { comment_num: 1, title: "t" },
  },
};

function stalePage(): Parameters<typeof writeRailPageCache>[3] {
  return {
    items: [],
    total: 0,
    floorTotal: 0,
    title: "t",
    link: { isAward: false, isFavour: false, awardCount: 0, favourCount: 0, commentCount: 0, cyCount: 0 },
    groups: [],
  };
}

describe("reader comment panel first open", () => {
  beforeEach(() => {
    document.cookie = "heybox_id=42";
    sessionStorage.removeItem(READER_COMMENT_MARKS_KEY);
    clearRailPageCache("123456");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    clearRailPageCache("123456");
    sessionStorage.removeItem(READER_COMMENT_MARKS_KEY);
    document.cookie = "heybox_id=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  });

  it("re-reads page one from the network instead of the cached copy", async () => {
    writeRailPageCache("123456", 1, "42", stalePage());
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal("fetch", vi.fn((input: unknown, init?: RequestInit) => {
      calls.push({ url: String(input), body: String(init?.body ?? "") });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(treePayload),
      });
    }));
    const host = mountReader();
    host.querySelector<HTMLElement>('[data-action="comment"]')?.click();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const list = host.ownerDocument.querySelector(".hbu-reader-comments-list");
    expect(
      calls.some(
        (call) =>
          call.url.includes("link_id=123456") && call.url.includes("page=1"),
      ),
    ).toBe(true);
    expect(list?.textContent ?? "").toContain("fresh floor");
  });

  it("restores a published floor after reload and polls until the server tree echoes it", async () => {
    const now = Math.floor(Date.now() / 1000);
    saveReaderCommentMark({
      linkId: "123456",
      commentId: "",
      text: "my persisted comment",
      userId: "42",
      rootId: "",
      parentId: "",
      createAt: now,
      verifyPage: 1,
      imageUrls: [],
    });
    let treeReads = 0;
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn((input: unknown) => {
      const url = String(input);
      calls.push(url);
      treeReads += 1;
      const payload = treeReads < 2 ? {
        status: "ok",
        result: { comments: [{ comment: [] }], link: { comment_num: 0, title: "t" } },
      } : {
        status: "ok",
        result: {
          comments: [{ comment: [{ comment_id: "9300", text: "<p>my persisted comment</p>", user: { username: "me", userid: 42 } }] }],
          link: { comment_num: 1, title: "t" },
        },
      };
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(payload) });
    }));
    const host = mountReader();
    host.querySelector<HTMLElement>('[data-action="comment"]')?.click();
    await vi.waitFor(() => {
      expect(calls.filter((url) => url.includes("link_id=123456") && url.includes("page=1")).length).toBeGreaterThanOrEqual(2);
      expect(host.ownerDocument.querySelector(".hbu-reader-comments-list")?.textContent ?? "").toContain("my persisted comment");
    }, { timeout: 5000 });
    expect(host.ownerDocument.querySelector(".hbu-reader-comments-syncing")).toBeNull();
  });

  it("renders comment images, cube emoji and heygirl emoji", async () => {
    const mediaPayload = {
      status: "ok",
      result: {
        comments: [
          {
            comment: [
              {
                comment_id: "9100",
                text: "<p>看图[cube_酷][heygirl_诶嘿]</p>",
                imgs: [{ url: "https://imgheybox1.max-c.com/bbs/2026/10/13/a.webp", thumb: "https://imgheybox1.max-c.com/bbs/2026/10/13/a-thumb.webp", width: 734, height: 1024 }],
                user: { username: "me", userid: 42 },
              },
            ],
          },
        ],
        link: { comment_num: 1, title: "t" },
      },
    };
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mediaPayload),
    })));
    const host = mountReader();
    host.querySelector<HTMLElement>('[data-action="comment"]')?.click();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const image = host.ownerDocument.querySelector<HTMLImageElement>(".hbu-reader-comments-image");
    expect(image).not.toBeNull();
    expect(image?.getAttribute("src")).toBe("https://imgheybox1.max-c.com/bbs/2026/10/13/a.webp");
    const emoji = Array.from(host.ownerDocument.querySelectorAll<HTMLElement>(".hbu-reader-comments-emoji"));
    expect(emoji).toHaveLength(2);
    expect(emoji[0].style.backgroundImage).toContain("cube_emoji_v34.png");
    expect(emoji[0].style.backgroundPosition).toBe("-17px 0px");
    expect(emoji[0].style.backgroundSize).toBe("102px 323px");
    expect(emoji[1].style.backgroundImage).toContain("cube2_emoji.png");
    expect(emoji[1].style.backgroundSize).toBe("102px 68px");
  });

  it("keeps Cy emoji images visible when the server uses an image marker", async () => {
    const cyPayload = {
      status: "ok",
      result: {
        comments: [{
          comment: [{
            comment_id: "9101",
            text: '<p><img class="emoji" alt="[cube_酷]" src="https://static.max-c.com/heybox_web/emoji/cube/cube_emoji_v34.png"></p>',
            user: { username: "me", userid: 42 },
          }],
        }],
        link: { comment_num: 1, title: "t" },
      },
    };
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(cyPayload),
    })));
    const host = mountReader();
    host.querySelector<HTMLElement>('[data-action="comment"]')?.click();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const emoji = host.ownerDocument.querySelector<HTMLElement>(".hbu-reader-comments-emoji");
    expect(emoji).not.toBeNull();
    expect(emoji?.style.backgroundPosition).toBe("-17px 0px");
    expect(host.ownerDocument.querySelector(".hbu-reader-comments-text")?.textContent).not.toContain("图片或表情");
  });

  it("mounts visible like and favorite icons before state synchronization", () => {
    const host = mountReader();
    expect(host.querySelector('[data-action="like"] svg')).not.toBeNull();
    expect(host.querySelector('[data-action="favour"] svg')).not.toBeNull();
  });

  it("offers every emoji of both packs and inserts the site token", async () => {
    const host = mountReader();
    host.querySelector<HTMLElement>('[data-action="comment"]')?.click();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const toggle = host.ownerDocument.querySelector<HTMLButtonElement>(".hbu-reader-composer-emoji-toggle");
    expect(toggle).not.toBeNull();
    toggle?.click();
    const panel = host.ownerDocument.querySelector<HTMLElement>(".hbu-reader-composer-emoji");
    expect(panel?.hidden).toBe(false);
    const cube = Array.from(panel?.querySelectorAll<HTMLButtonElement>('[data-pack="cube"] button') ?? []);
    const heygirl = Array.from(panel?.querySelectorAll<HTMLButtonElement>('[data-pack="heygirl"] button') ?? []);
    expect(cube).toHaveLength(readRailEmojiCatalogEntries("cube").length);
    expect(heygirl).toHaveLength(readRailEmojiCatalogEntries("heygirl").length);
    // Every button paints a sprite cell, so nothing renders as a blank square.
    for (const button of [...cube, ...heygirl]) {
      const glyph = button.querySelector<HTMLElement>("span");
      expect(glyph?.style.backgroundImage).toContain("max-c.com/heybox_web/emoji/");
      expect(glyph?.style.backgroundPosition).toMatch(/^-?\d+px -?\d+px$/);
    }
    expect(cube[0]?.getAttribute("aria-label")).toBe("盒表情 哭泣");
    expect(heygirl[23]?.getAttribute("aria-label")).toBe("黑盒娘 挨刀");

    const input = host.ownerDocument.querySelector<HTMLElement>(".hbu-reader-composer-input");
    cube[0]?.click();
    heygirl[23]?.click();
    const glyphs = Array.from(input?.querySelectorAll<HTMLElement>("[data-emoji]") ?? []);
    expect(glyphs.map((glyph) => glyph.dataset["emoji"])).toEqual(["cube_哭泣", "heygirl_挨刀"]);
    expect(input?.textContent).not.toContain("[cube_哭泣]");
    expect(input?.textContent).not.toContain("[heygirl_挨刀]");
  });

  it("renders typed and pasted tokens while submitting raw tokens", async () => {
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal("fetch", vi.fn((input: unknown, init?: RequestInit) => {
      calls.push({ url: String(input), body: String(init?.body ?? "") });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(treePayload),
      });
    }));
    const host = mountReader();
    host.querySelector<HTMLElement>('[data-action="comment"]')?.click();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const input = host.ownerDocument.querySelector<HTMLElement>(".hbu-reader-composer-input");
    expect(input).not.toBeNull();
    input!.textContent = "手动[cube_哭泣]";
    input!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(input!.querySelector<HTMLElement>("[data-emoji='cube_哭泣']")).not.toBeNull();
    expect(input!.textContent).not.toContain("[cube_哭泣]");

    const paste = new Event("paste", { bubbles: true, cancelable: true }) as Event & {
      clipboardData: Pick<DataTransfer, "getData">;
    };
    paste.clipboardData = {
      getData: (format: string) => format === "text/plain" ? "粘贴[heygirl_挨刀]" : "",
    };
    input!.dispatchEvent(paste);
    expect(input!.querySelector<HTMLElement>("[data-emoji='heygirl_挨刀']")).not.toBeNull();
    expect(input!.textContent).not.toContain("[heygirl_挨刀]");

    host.ownerDocument.querySelector<HTMLButtonElement>(".hbu-reader-composer-submit")?.click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const created = calls.find((call) => call.url.includes("/comment/create"));
    expect(created).toBeTruthy();
    expect(new URLSearchParams(created?.body ?? "").get("text")).toBe(
      "手动[cube_哭泣]粘贴[heygirl_挨刀]",
    );
  });

  it("loads the live emoji catalog and renders composer tokens", async () => {
    const cubeNames = Array.from({ length: 111 }, (_, index) =>
      index === 109 ? "预言" : index === 110 ? "鬼斩客" : "旧" + (index + 1),
    );
    const cubeList = cubeNames
      .map((name, index) => '{name:"' + name + '",id:' + ((Math.floor(index / 6) + 1) * 10 + (index % 6) + 1) + ',unicode:"e02f"}')
      .join(",");
    const heygirlList = ["诶嘿", "挨刀"]
      .map((name, index) => '{name:"' + name + '",id:' + ((Math.floor(index / 6) + 1) * 10 + (index % 6) + 1) + '}')
      .join(",");
    const script = [
      'const cubeList=[' + cubeList + '];',
      'const heygirlList=[' + heygirlList + '];',
      'const packs=[{type:"cube",list:cubeList},{type:"heygirl",list:heygirlList}];',
    ].join("");
    const css = [
      '.hb-emoji-cube{background-image:url(https://imgheybox.max-c.com/heybox_web/emoji/cube/cube_emoji_v36.png);background-size:120px 380px;}',
      ':root{--cube-length:20px;}',
      '.hb-emoji-heygirl{background-image:url(https://cdn.max-c.com/heybox_web/emoji/cube2/cube2_emoji.png);background-size:120px 80px;}',
      ':root{--heygirl-length:20px;}',
    ].join("");
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal("fetch", vi.fn((input: unknown, init?: RequestInit) => {
      calls.push({ url: String(input), body: String(init?.body ?? "") });
      const url = String(input);
      if (url.endsWith("index-test.js")) return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(script) });
      if (url.endsWith("index-test.css")) return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(css) });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          status: "ok",
          result: {
            comments: [{
              comment: [{
                comment_id: "9200",
                text: "<p>[cube_预言]</p>",
                user: { username: "me", userid: 42 },
              }],
            }],
            link: { comment_num: 1, title: "t" },
          },
        }),
      });
    }));
    try {
      resetRailEmojiCatalogCache();
      const host = mountReader(true);
      host.querySelector<HTMLElement>('[data-action="comment"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await vi.waitFor(() => {
        const cube = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-pack="cube"] button'));
        expect(cube).toHaveLength(111);
        expect(cube.at(-1)?.title).toBe("鬼斩客");
        expect(cube.at(-1)?.querySelector<HTMLElement>("span")?.style.backgroundImage).toContain("cube_emoji_v36.png");
      });
      const prophecy = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-pack="cube"] button'))
        .find((button) => button.dataset["name"] === "预言");
      prophecy?.click();
      const input = document.querySelector<HTMLElement>(".hbu-reader-composer-input");
      const glyph = input?.querySelector<HTMLElement>("[data-emoji='cube_预言']");
      expect(glyph).not.toBeNull();
      expect(input?.textContent).not.toContain("[cube_预言]");
      const rendered = document.querySelector<HTMLElement>(".hbu-reader-comments-emoji");
      expect(rendered?.style.backgroundImage).toContain("cube_emoji_v36.png");
      expect(rendered?.style.backgroundSize).toBe("102px 323px");
      document.querySelector<HTMLButtonElement>(".hbu-reader-composer-submit")?.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const created = calls.find((call) => call.url.includes("/comment/create"));
      expect(created).toBeTruthy();
      expect(new URLSearchParams(created?.body ?? "").get("text")).toBe("[cube_预言]");
    } finally {
      resetRailEmojiCatalogCache();
      applyRailEmojiCatalog(baselineRailEmojiCatalog());
    }
  });

  it("moves through the emoji grid with the arrow keys", async () => {
    const host = mountReader();
    host.querySelector<HTMLElement>('[data-action="comment"]')?.click();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const toggle = host.ownerDocument.querySelector<HTMLButtonElement>(".hbu-reader-composer-emoji-toggle");
    toggle?.click();
    const panel = host.ownerDocument.querySelector<HTMLElement>(".hbu-reader-composer-emoji");
    if (panel === null) throw new Error("Expected the emoji panel");
    const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>("button"));
    expect(host.ownerDocument.activeElement).toBe(buttons[0]);
    panel.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    expect(host.ownerDocument.activeElement).toBe(buttons[1]);
    panel.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    expect(host.ownerDocument.activeElement).toBe(buttons[7]);
    panel.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }));
    expect(host.ownerDocument.activeElement).toBe(buttons[buttons.length - 1]);
    panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }));
    expect(host.ownerDocument.activeElement).toBe(buttons[0]);
  });
});
