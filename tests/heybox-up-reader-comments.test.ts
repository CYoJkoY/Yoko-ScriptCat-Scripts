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
import { clearRailPageCache, writeRailPageCache } from "../scripts/heybox-up/src/ui/rail";

const navigation = {
  sync: (): void => undefined,
  readStatus: () => ({ currentId: "1", revision: 0, prev: null, next: null, discovering: false, error: "", exhausted: true, history: [] }),
  takeNext: () => null,
  discover: async (): Promise<void> => undefined,
  subscribe: () => (): void => undefined,
};

function mountReader(): HTMLElement {
  history.replaceState(null, "", "/app/bbs/link/123456");
  document.body.innerHTML = [
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
    clearRailPageCache("123456");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    clearRailPageCache("123456");
    document.cookie = "heybox_id=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  });

  it("re-reads page one from the network instead of the cached copy", async () => {
    writeRailPageCache("123456", 1, "42", stalePage());
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn((input: unknown) => {
      calls.push(String(input));
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
    expect(calls.some((url) => url.includes("link_id=123456") && url.includes("page=1"))).toBe(true);
    expect(list?.textContent ?? "").toContain("fresh floor");
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
    expect(cube).toHaveLength(109);
    expect(heygirl).toHaveLength(24);
    // Every button paints a sprite cell, so nothing renders as a blank square.
    for (const button of [...cube, ...heygirl]) {
      const glyph = button.querySelector<HTMLElement>("span");
      expect(glyph?.style.backgroundImage).toContain("max-c.com/heybox_web/emoji/");
      expect(glyph?.style.backgroundPosition).toMatch(/^-?\d+px -?\d+px$/);
    }
    expect(cube[0]?.getAttribute("aria-label")).toBe("盒表情 哭泣");
    expect(heygirl[23]?.getAttribute("aria-label")).toBe("黑盒娘 挨刀");

    const input = host.ownerDocument.querySelector<HTMLTextAreaElement>(".hbu-reader-composer-input");
    cube[0]?.click();
    heygirl[23]?.click();
    expect(input?.value).toBe("[cube_哭泣][heygirl_挨刀]");
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
