// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { labelCommunityCardActions } from "../scripts/heybox-up/src/ui/desktop";

describe("community card action accessibility", () => {
  it("labels icon-only post menu buttons for assistive technology and hover", () => {
    document.body.innerHTML = '<div id="page-bbs-community"><button class="list-cotent__operation-btn"><svg aria-hidden="true"></svg></button></div>';

    labelCommunityCardActions();

    const button = document.querySelector<HTMLButtonElement>(".list-cotent__operation-btn");
    expect(button?.getAttribute("aria-label")).toBe("更多帖子操作");
    expect(button?.title).toBe("更多帖子操作");
  });

  it("preserves an accessible name already supplied by the site", () => {
    document.body.innerHTML = '<div id="page-bbs-community"><button class="list-cotent__operation-btn" aria-label="自定义操作"></button></div>';

    labelCommunityCardActions();

    const button = document.querySelector<HTMLButtonElement>(".list-cotent__operation-btn");
    expect(button?.getAttribute("aria-label")).toBe("自定义操作");
    expect(button?.title).toBe("自定义操作");
  });
});
