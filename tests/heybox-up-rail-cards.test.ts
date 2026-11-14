// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readPageRoute } from "../scripts/heybox-up/src/core/page-sync";

const nav = vi.hoisted(() => ({ pathname: "/app/bbs/home" }));

vi.hoisted(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: {},
  });
});

import {
  bindCommentRail,
  createCommentRailAt,
  readRailCardLinkIds,
  stepRailCardLinkId,
} from "../scripts/heybox-up/src/ui/rail";

function feed(cards: readonly string[]): void {
  document.body.innerHTML = '<div id="page-bbs-community"><div class="bbs-home__content-list">'
    + cards.map((id) => '<div class="bbs-home__content-item"><a href="/app/bbs/link/' + id + '">'
      + '<div class="bbs-new-style-bottom__comment">' + id.charAt(0) + "</div></a></div>").join("")
    + "</div></div>";
}

beforeEach(() => {
  nav.pathname = "/app/bbs/home";
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: {
      get pathname() { return nav.pathname; },
      set pathname(next: string) { nav.pathname = next; },
    },
  });
});

afterEach(() => {
  document.body.innerHTML = "";
  document.body.className = "";
});

describe("feed card list", () => {
  it("reads cards in document order and skips cards with no post link", () => {
    feed(["700", "701"]);
    document.querySelector(".bbs-home__content-list")!.insertAdjacentHTML("beforeend",
      '<div class="bbs-home__content-item"><video controls></video></div>'
      + '<div class="bbs-home__content-item"><a href="/app/bbs/link/702">c</a></div>'
      + '<div class="bbs-home__content-item"><a href="/app/bbs/link/700">dup</a></div>');
    expect(readRailCardLinkIds(document)).toEqual(["700", "701", "702"]);
  });

  it("steps through the list and stops at both ends", () => {
    const ids = ["1", "2", "3"];
    expect(stepRailCardLinkId(ids, "2", 1)).toBe("3");
    expect(stepRailCardLinkId(ids, "2", -1)).toBe("1");
    expect(stepRailCardLinkId(ids, "3", 1)).toBe("");
    expect(stepRailCardLinkId(ids, "1", -1)).toBe("");
    expect(stepRailCardLinkId(ids, "", 1)).toBe("1");
    expect(stepRailCardLinkId(ids, "9", -1)).toBe("3");
    expect(stepRailCardLinkId([], "1", 1)).toBe("");
  });
});

describe("comment rail binding", () => {
  function mount() {
    feed(["800", "801", "802"]);
    const rail = createCommentRailAt(document.createElement("div"));
    const binding = bindCommentRail(rail, document, () => true);
    binding.sync();
    return { rail, binding };
  }

  it("auto opens the first post on the community home", () => {
    const { rail } = mount();
    expect(rail.isOpen()).toBe(true);
    expect(rail.getLinkId()).toBe("800");
    expect(document.body.classList.contains("heybox-up-rail-open")).toBe(true);
  });

  it("mounts collapsed on topic and creator feeds without auto opening", () => {
    for (const path of ["/app/topic/link/12", "/creator/42"]) {
      nav.pathname = path;
      expect(readPageRoute(nav.pathname)).toBe(path.startsWith("/app/topic") ? "topic" : "creator");
    const page = document.createElement("div");
      page.innerHTML = '<div class="content-list"><div class="content-list__item">'
        + '<a href="/app/bbs/link/900">p</a><span class="content-list__comment">1</span></div></div>';
      const rail = createCommentRailAt(page);
    const binding = bindCommentRail(rail, page, () => true, () => readPageRoute(nav.pathname));
      binding.sync();
      expect(binding.isFeedPage()).toBe(true);
      expect(binding.readFirstFeedLinkId()).toBe("");
      expect(rail.host.parentNode).toBe(page);
      expect(rail.isOpen()).toBe(false);
      expect(rail.open("900")).toBe(true);
      expect(rail.getLinkId()).toBe("900");
      expect(readRailCardLinkIds(page)).toEqual(["900"]);
    }
  });

  it("hides the panel when the preview is switched off or no feed is on screen", () => {
    const { rail } = mount();
    const binding = bindCommentRail(rail, document, () => false, () => readPageRoute(nav.pathname));
    binding.sync();
    nav.pathname = "/app/user/favour/content";
    const enabled = bindCommentRail(rail, document, () => true, () => readPageRoute(nav.pathname));
    enabled.sync();
    expect(enabled.isFeedPage()).toBe(false);
    expect(rail.host.parentNode).toBeNull();
  });
});
