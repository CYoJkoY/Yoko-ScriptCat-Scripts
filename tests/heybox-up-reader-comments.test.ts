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
});
