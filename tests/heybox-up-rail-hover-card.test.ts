// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { readRailCardLinkId, readRailLinkId } from "../scripts/heybox-up/src/ui/rail";

afterEach(() => {
  document.body.innerHTML = "";
});

function mount(html: string): void {
  document.body.innerHTML = html;
}

describe("comment preview hover cards", () => {
  it("resolves the community home card", () => {
    mount('<div id="page-bbs-community"><div class="bbs-home__content-list">'
      + '<div class="bbs-home__content-item">'
      + '<a href="/app/bbs/link/100"><div class="bbs-new-style-bottom__comment">3</div></a>'
      + "</div></div></div>");
    const comment = document.querySelector(".bbs-new-style-bottom__comment");
    expect(readRailCardLinkId(comment)).toBe("100");
  });

  it("resolves a topic feed card whose comment counter sits outside the anchor", () => {
    mount('<div id="page-topic-link"><div class="content-list">'
      + '<div class="content-list__item">'
      + '<a href="/app/bbs/link/200">Post</a>'
      + '<div class="content-list__comment">7</div>'
      + "</div></div></div>");
    const comment = document.querySelector(".content-list__comment");
    expect(readRailCardLinkId(comment)).toBe("200");
  });

  it("resolves creator and generic list cards", () => {
    mount('<div id="page-creator-content-management">'
      + '<div class="content-list__item"><a href="/app/bbs/link/300">A</a>'
      + '<span class="content-list__comment">1</span></div></div>'
      + '<ul class="content-list"><li><a href="/app/bbs/link/400">B</a>'
      + '<span class="content-list__comment">2</span></li></ul>');
    const creator = document.querySelector("#page-creator-content-management .content-list__comment");
    const generic = document.querySelector(".content-list li .content-list__comment");
    expect(readRailCardLinkId(creator)).toBe("300");
    expect(readRailCardLinkId(generic)).toBe("400");
  });

  it("returns an empty id outside feed cards and reads absolute links", () => {
    mount('<div class="plain"><span id="lonely">x</span></div>'
      + '<div class="bbs-home__content-list"><div class="bbs-home__content-item">'
      + '<a href="https://www.xiaoheihe.cn/app/bbs/link/500?from=feed">P</a></div></div>');
    expect(readRailCardLinkId(document.getElementById("lonely"))).toBe("");
    expect(readRailCardLinkId(document.querySelector(".bbs-home__content-item a"))).toBe("500");
    expect(readRailLinkId(null)).toBe("");
  });
});
