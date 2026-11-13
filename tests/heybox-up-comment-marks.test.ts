// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("reader comment marks", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    vi.resetModules();
  });

  it("restores a published comment mark after the verification window and reload", async () => {
    const beforeReload = await import("../scripts/heybox-up/src/ui/comment-marks");
    const mark = beforeReload.saveReaderCommentMark({
      linkId: "article-42",
      commentId: "",
      text: "published while the tree is still stale",
      userId: "user-7",
      rootId: "",
      parentId: "",
      createAt: 1_800_000_000,
      verifyPage: 1,
      imageUrls: [],
    });
    expect(mark).not.toBeNull();

    vi.resetModules();
    const afterReload = await import("../scripts/heybox-up/src/ui/comment-marks");
    expect(afterReload.readReaderCommentMarks("article-42")).toEqual([mark]);
  });
});
