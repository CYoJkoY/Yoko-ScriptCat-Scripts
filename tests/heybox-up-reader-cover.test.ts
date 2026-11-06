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
import { pageSyncTasks } from "../scripts/heybox-up/src/core/page-sync";

const navigation = {
  sync: (): void => undefined,
  readStatus: () => ({ currentId: "1", revision: 0, prev: null, next: null, discovering: false, error: "", exhausted: true, history: [] }),
  takeNext: () => null,
  discover: async (): Promise<void> => undefined,
  subscribe: () => (): void => undefined,
};

function mountReader(content = "", adjacent = ""): HTMLElement {
  history.replaceState(null, "", "/app/bbs/link/123456");
  document.body.innerHTML = [
    '<div id="page-bbs-link">',
    '<div class="hb-bbs-image-text">',
    '<div class="image-text__title">Title</div>',
    '<div class="image-text__header-image"><img src="https://img/a.jpg"><img src="https://img/b.jpg"><img src="https://img/c.jpg"></div>',
    '<div class="image-text__content"><p>Body</p>' + content + '</div>',
    '</div>',
    adjacent,
    '<div class="link-user__user-wrapper"><a href="/app/user/profile/9"><img src="https://img/avatar.jpg"></a></div>',
    '<div class="link-user__username">Author</div>',
    '</div>',
  ].join("");
  watchReader(navigation);
  const host = document.getElementById(READER_ID);
  if (host === null) throw new Error("Expected the reader to mount");
  return host;
}

describe("reader cover pager band", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("keeps the pager in its own row under the photo", () => {
    const host = mountReader();
    const cover = host.querySelector(".hbu-reader-cover");
    const stage = cover?.querySelector(".hbu-reader-cover-stage");
    const progress = cover?.querySelector<HTMLElement>(".hbu-reader-cover-progress");
    expect(cover?.firstElementChild).toBe(stage);
    expect(cover?.lastElementChild).toBe(progress);
    expect(stage?.querySelector("img")).not.toBeNull();
    expect(stage?.querySelector(".hbu-reader-cover-nav")).not.toBeNull();
    expect(stage?.querySelector(".hbu-reader-cover-dots")).toBeNull();
    const dots = progress?.querySelector(".hbu-reader-cover-dots");
    expect(dots?.querySelectorAll("button")).toHaveLength(3);
    expect(progress?.hidden).toBe(false);
  });

  it("rebuilds the pager in the band after a cover fails", () => {
    const host = mountReader();
    const images = Array.from(host.querySelectorAll<HTMLImageElement>(".hbu-reader-cover-stage img"));
    for (const img of images) Object.defineProperty(img, "naturalWidth", { configurable: true, get: () => 0 });
    images[0]?.dispatchEvent(new Event("error"));
    const cover = host.querySelector(".hbu-reader-cover");
    const stage = cover?.querySelector(".hbu-reader-cover-stage");
    const progress = cover?.querySelector<HTMLElement>(".hbu-reader-cover-progress");
    expect(stage?.querySelectorAll("img")).toHaveLength(2);
    expect(progress?.querySelectorAll(".hbu-reader-cover-dots button")).toHaveLength(2);
    expect(progress?.hidden).toBe(false);
    expect(stage?.querySelector(".hbu-reader-cover-dots")).toBeNull();
  });

  it("collects interior and adjacent votes once in order and updates only the component", async () => {
    const host = mountReader(
      '<div class="article-vote"><h3>Inside</h3><button>Same</button></div>',
      '<div class="image-text__vote"><h3>Outside</h3><div class="vote-item"><img src="https://img/choice.jpg">Same</div><div class="vote-submit">Vote</div></div>',
    );
    const votes = host.querySelectorAll(".article-vote, .image-text__vote");
    expect(votes).toHaveLength(2);
    expect(Array.from(votes).map((vote) => vote.querySelector("h3")!.textContent)).toEqual(["Inside", "Outside"]);
    for (const vote of votes) expect(vote.closest(".hbu-reader-page")!.querySelectorAll("h3")).toHaveLength(1);
    const scroll = host.querySelector<HTMLElement>(".hbu-reader-scroll")!;
    scroll.scrollTop = 321;
    const button = votes[0]!.querySelector("button")!;
    button.focus();
    document.querySelector("#page-bbs-link .article-vote button")!.textContent = "Result with more text";
    await Promise.resolve();
    Array.from(pageSyncTasks.keys()).at(-1)!();
    expect(host.querySelector(".hbu-reader-scroll")).toBe(scroll);
    expect(scroll.scrollTop).toBe(321);
    expect(document.activeElement).toBe(button);
    expect(button.textContent).toBe("Result with more text");
  });
});
