// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { applyCommentSort } from "../scripts/heybox-up/src/ui/comment-sort";

function comment(id: string, userId: string, name: string): string {
  return '<div class="link-comment__comment-item" data-comment-id="' + id + '">'
    + '<div class="info-box"><a class="info-box__avatar" href="/app/user/profile/' + userId + '"><img alt=""></a>'
    + '<a class="info-box__username" href="/app/user/profile/' + userId + '">' + name + "</a></div>"
    + "</div>";
}

function mount(header: string, items: readonly string[]): HTMLElement {
  document.body.innerHTML = '<div id="page-bbs-link">' + header
    + '<div class="link-comment"><div class="link-comment__list">' + items.join("") + "</div></div></div>";
  const tree = document.querySelector("#page-bbs-link .link-comment");
  if (tree === null) throw new Error("Expected the native comment tree");
  return tree as HTMLElement;
}

function order(tree: HTMLElement): string[] {
  const list = tree.querySelector(".link-comment__list");
  if (list === null) throw new Error("Expected the comment list");
  return Array.from(list.children)
    .map((node) => (node instanceof HTMLElement ? node.dataset["commentId"] ?? "" : ""))
    .filter((id) => id !== "");
}

function flexOrder(tree: HTMLElement): number[] {
  const list = tree.querySelector(".link-comment__list");
  if (list === null) throw new Error("Expected the comment list");
  return Array.from(list.children)
    .map((node) => (node instanceof HTMLElement ? Number(node.style.order || 0) : 0));
}

describe("comment author sort", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("lifts the author by profile id even when a reply shares the nickname", () => {
    const tree = mount(
      '<div class="link-user"><a class="link-user__user-wrapper" href="/app/user/profile/42"><img alt=""></a>'
        + '<div class="link-user__username">Author</div></div>',
      [
        comment("1", "7", "Author"),
        comment("2", "8", "Reader"),
        comment("3", "42", "Author"),
      ],
    );
    applyCommentSort(tree, "author");
    // The real author (id 42) moves first, while the same nickname from
    // another account keeps its original slot instead of tying with it.
    expect(flexOrder(tree)).toEqual([1, 2, 0]);
    expect(order(tree)).toEqual(["1", "2", "3"]);
  });

  it("keeps nickname matching only when the header has no profile link", () => {
    const tree = mount(
      '<div class="link-user"><div class="link-user__username">Author</div></div>',
      [comment("1", "7", "Reader"), comment("2", "8", "Author")],
    );
    applyCommentSort(tree, "author");
    expect(flexOrder(tree)).toEqual([1, 0]);
  });

  it("restores the native order for the default mode", () => {
    const tree = mount(
      '<div class="link-user"><a class="link-user__user-wrapper" href="/app/user/profile/42"></a>'
        + '<div class="link-user__username">Author</div></div>',
      [comment("1", "42", "Author"), comment("2", "8", "Reader")],
    );
    applyCommentSort(tree, "author");
    applyCommentSort(tree, "default");
    expect(flexOrder(tree)).toEqual([0, 0]);
    expect(order(tree)).toEqual(["1", "2"]);
  });
});
