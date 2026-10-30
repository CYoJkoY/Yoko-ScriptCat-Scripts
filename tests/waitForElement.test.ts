// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { waitForElement } from "../shared/dom/waitForElement";

describe("waitForElement", () => {
  it("resolves immediately when the element already exists", async () => {
    const target = document.createElement("button");
    target.id = "ready";
    document.body.append(target);

    await expect(waitForElement("#ready")).resolves.toBe(target);
  });

  it("skips non-matching nodes until the guard accepts one", async () => {
    const span = document.createElement("span");
    const anchor = document.createElement("a");
    document.body.append(span, anchor);
    const isMatch = (element: Element): element is HTMLAnchorElement => element instanceof HTMLAnchorElement;

    await expect(waitForElement("span, a", { isMatch })).resolves.toBe(anchor);
  });

  it("resolves on a later mutation inside the given root", async () => {
    const root = document.createElement("main");
    document.body.append(root);

    const pending = waitForElement("#late", { root, timeoutMs: 2000 });
    const late = document.createElement("div");
    late.id = "late";
    root.append(late);
    await expect(pending).resolves.toBe(late);
  });

  it("resolves null once the timeout elapses", async () => {
    vi.useFakeTimers();
    try {
      const root = document.createElement("main");
      document.body.append(root);
      const pending = waitForElement("#never", { root, timeoutMs: 250 });
      await vi.advanceTimersByTimeAsync(250);
      await expect(pending).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("resolves null without a timeout when the signal aborts", async () => {
    const root = document.createElement("main");
    document.body.append(root);
    const controller = new AbortController();
    const pending = waitForElement("#manual", { root, signal: controller.signal });
    controller.abort();
    await expect(pending).resolves.toBeNull();
  });

  it("returns null immediately for an already aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(waitForElement("#cold", { signal: controller.signal })).resolves.toBeNull();
  });
});

