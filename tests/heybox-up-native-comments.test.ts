// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The reader module reads the system theme at import time in a real browser.
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
});

import { READER_CLASS } from "../scripts/heybox-up/src/ui/reader";
import { pageSyncTasks } from "../scripts/heybox-up/src/core/page-sync";
import {
  NATIVE_COMMENT_LOAD_COOLDOWN_MS,
  isNearCommentScrollEnd,
  readNativeLoadMoreButton,
  requestNativeCommentLoad,
  shouldTriggerNativeCommentLoad,
  watchNativeComments,
} from "../scripts/heybox-up/src/ui/native-comments";

let frames: FrameRequestCallback[] = [];
let frameCount = 0;

function flushFrames(): void {
  const queued = frames;
  frames = [];
  for (const callback of queued) callback(0);
}

function defineMetrics(container: HTMLElement, metrics: { scrollTop: number; clientHeight: number; scrollHeight: number }): void {
  Object.defineProperty(container, "clientHeight", { configurable: true, get: () => metrics.clientHeight });
  Object.defineProperty(container, "scrollHeight", { configurable: true, get: () => metrics.scrollHeight });
  Object.defineProperty(container, "scrollTop", {
    configurable: true,
    get: () => metrics.scrollTop,
    set: (value: number) => {
      metrics.scrollTop = value;
    },
  });
}

function mountCommentPage(metrics: { scrollTop: number; clientHeight: number; scrollHeight: number }): HTMLElement {
  history.replaceState(null, "", "/app/bbs/link/123");
  document.body.innerHTML = '<div id="page-bbs-link"><div class="link-comment"></div></div>';
  const container = document.querySelector<HTMLElement>(".link-comment");
  if (container === null) throw new Error("Expected the comment container");
  defineMetrics(container, metrics);
  return container;
}

function latestSyncTask(): () => void {
  const tasks = Array.from(pageSyncTasks.keys());
  const task = tasks[tasks.length - 1];
  if (task === undefined) throw new Error("Expected a registered page sync task");
  return task;
}

beforeEach(() => {
  frames = [];
  frameCount = 0;
  pageSyncTasks.clear();
  Object.defineProperty(window, "requestAnimationFrame", {
    configurable: true,
    writable: true,
    value: (callback: FrameRequestCallback): number => {
      frameCount += 1;
      frames.push(callback);
      return frameCount;
    },
  });
  Object.defineProperty(window, "cancelAnimationFrame", {
    configurable: true,
    writable: true,
    value: (): void => undefined,
  });
});

afterEach(() => {
  document.body.innerHTML = "";
  document.body.className = "";
  document.documentElement.className = "";
  history.replaceState(null, "", "/");
  pageSyncTasks.clear();
  vi.restoreAllMocks();
});

describe("comment scroll threshold", () => {
  it("accepts exactly 240px from the end and rejects 241px", () => {
    expect(isNearCommentScrollEnd({ scrollTop: 600, clientHeight: 400, scrollHeight: 1240 })).toBe(true);
    expect(isNearCommentScrollEnd({ scrollTop: 600, clientHeight: 400, scrollHeight: 1241 })).toBe(false);
    expect(isNearCommentScrollEnd({ scrollTop: 0, clientHeight: 400, scrollHeight: 640 })).toBe(true);
    expect(isNearCommentScrollEnd({ scrollTop: 0, clientHeight: 400, scrollHeight: 641 })).toBe(false);
  });

  it("rejects non-finite metrics", () => {
    expect(isNearCommentScrollEnd({ scrollTop: Number.NaN, clientHeight: 400, scrollHeight: 640 })).toBe(false);
    expect(isNearCommentScrollEnd({ scrollTop: 0, clientHeight: Number.POSITIVE_INFINITY, scrollHeight: 640 })).toBe(false);
  });
});

describe("native comment load gate", () => {
  const metrics = { scrollTop: 600, clientHeight: 400, scrollHeight: 1240 };

  it("suppresses repeated loads during the cooldown", () => {
    const gate = { lastTriggerAt: 1000, lastTriggerHeight: 1000 };
    expect(shouldTriggerNativeCommentLoad(gate, metrics, 1000 + NATIVE_COMMENT_LOAD_COOLDOWN_MS - 1)).toBe(false);
    expect(shouldTriggerNativeCommentLoad(gate, metrics, 1000 + NATIVE_COMMENT_LOAD_COOLDOWN_MS)).toBe(true);
  });

  it("requires the list to grow before loading again", () => {
    const gate = { lastTriggerAt: 0, lastTriggerHeight: 1240 };
    expect(shouldTriggerNativeCommentLoad(gate, metrics, 5000)).toBe(false);
    expect(shouldTriggerNativeCommentLoad(gate, { ...metrics, scrollTop: 601, scrollHeight: 1241 }, 5000)).toBe(true);
  });
});

describe("native load more button", () => {
  it("finds a normalized load more label outside excluded regions", () => {
    document.body.innerHTML = '<div id="comments"><button type="button"> 加载更多 (12) </button></div>';
    const container = document.getElementById("comments");
    if (container === null) throw new Error("Expected the comment container");
    expect(readNativeLoadMoreButton(container)?.textContent).toBe(" 加载更多 (12) ");
  });

  it("ignores reply text that merely starts with a loading word", () => {
    document.body.innerHTML = '<div id="comments"><button type="button">加载更多回复</button></div>';
    const container = document.getElementById("comments");
    if (container === null) throw new Error("Expected the comment container");
    expect(readNativeLoadMoreButton(container)).toBeNull();
  });

  it("skips nested child lists and reply composers", () => {
    document.body.innerHTML = [
      '<div id="comments">',
      '<div class="comment-children__load-all"><button type="button">加载更多</button></div>',
      '<div class="link-comment__comment-children"><a role="button" href="#">查看更多</a></div>',
      '<div class="link-comment__reply"><button type="button">点击加载</button></div>',
      "</div>",
    ].join("");
    const container = document.getElementById("comments");
    if (container === null) throw new Error("Expected the comment container");
    expect(readNativeLoadMoreButton(container)).toBeNull();
  });

  it("skips hidden, disabled and editable controls", () => {
    document.body.innerHTML = [
      '<div id="comments">',
      '<button type="button" hidden>加载更多</button>',
      '<button type="button" aria-hidden="true">查看更多</button>',
      '<button type="button" style="display: none">点击加载</button>',
      '<button type="button" disabled>更多评论</button>',
      '<a role="button" href="#" aria-disabled="true">加载更多</a>',
      '<div role="button" contenteditable="true">加载更多</div>',
      '<button type="button">加载更多</button>',
      "</div>",
    ].join("");
    const container = document.getElementById("comments");
    if (container === null) throw new Error("Expected the comment container");
    const button = readNativeLoadMoreButton(container);
    expect(button?.tagName).toBe("BUTTON");
    expect(button?.textContent).toBe("加载更多");
  });
});

describe("requestNativeCommentLoad", () => {
  it("clicks the page control when one exists", () => {
    document.body.innerHTML = '<div id="comments"><button type="button">加载更多</button></div>';
    const container = document.getElementById("comments");
    if (container === null) throw new Error("Expected the comment container");
    const button = readNativeLoadMoreButton(container);
    if (button === null) throw new Error("Expected the load more button");
    const click = vi.fn();
    button.addEventListener("click", click);
    const windowScroll = vi.fn();
    const documentScroll = vi.fn();
    window.addEventListener("scroll", windowScroll);
    document.addEventListener("scroll", documentScroll);
    expect(requestNativeCommentLoad(container)).toBe("button");
    expect(click).toHaveBeenCalledTimes(1);
    expect(windowScroll).not.toHaveBeenCalled();
    expect(documentScroll).not.toHaveBeenCalled();
    window.removeEventListener("scroll", windowScroll);
    document.removeEventListener("scroll", documentScroll);
  });

  it("forwards one scroll event to window and document without a control", () => {
    document.body.innerHTML = '<div id="comments"></div>';
    const container = document.getElementById("comments");
    if (container === null) throw new Error("Expected the comment container");
    const windowScroll = vi.fn();
    const documentScroll = vi.fn();
    window.addEventListener("scroll", windowScroll);
    document.addEventListener("scroll", documentScroll);
    expect(requestNativeCommentLoad(container)).toBe("scroll");
    expect(windowScroll).toHaveBeenCalledTimes(1);
    expect(documentScroll).toHaveBeenCalledTimes(1);
    window.removeEventListener("scroll", windowScroll);
    document.removeEventListener("scroll", documentScroll);
  });
});

describe("watchNativeComments", () => {
  it("loads from the column while the list can still grow", () => {
    const metrics = { scrollTop: 600, clientHeight: 400, scrollHeight: 1240 };
    const container = mountCommentPage(metrics);
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(5000);
    const windowScroll = vi.fn();
    window.addEventListener("scroll", windowScroll);

    watchNativeComments();
    container.dispatchEvent(new Event("scroll"));
    expect(frameCount).toBe(1);
    flushFrames();
    expect(windowScroll).toHaveBeenCalledTimes(1);

    container.dispatchEvent(new Event("scroll"));
    flushFrames();
    expect(windowScroll).toHaveBeenCalledTimes(1);

    now.mockReturnValue(5000 + NATIVE_COMMENT_LOAD_COOLDOWN_MS + 1);
    metrics.scrollHeight = 1600;
    metrics.scrollTop = 1200;
    container.dispatchEvent(new Event("scroll"));
    flushFrames();
    expect(windowScroll).toHaveBeenCalledTimes(2);

    metrics.scrollHeight = 2000;
    metrics.scrollTop = 1600;
    now.mockReturnValue(5000 + NATIVE_COMMENT_LOAD_COOLDOWN_MS * 3);
    container.dispatchEvent(new Event("scroll"));
    flushFrames();
    expect(windowScroll).toHaveBeenCalledTimes(3);

    window.removeEventListener("scroll", windowScroll);
  });

  it("stays idle in the immersive reader and rebinds after leaving it", () => {
    const metrics = { scrollTop: 600, clientHeight: 400, scrollHeight: 1240 };
    const container = mountCommentPage(metrics);
    document.body.classList.add(READER_CLASS);
    watchNativeComments();
    const sync = latestSyncTask();
    container.dispatchEvent(new Event("scroll"));
    expect(frameCount).toBe(0);

    document.body.classList.remove(READER_CLASS);
    sync();
    container.dispatchEvent(new Event("scroll"));
    expect(frameCount).toBe(1);

    document.body.classList.add(READER_CLASS);
    sync();
    flushFrames();
    container.dispatchEvent(new Event("scroll"));
    expect(frameCount).toBe(1);
  });

  it("stays idle when the column cannot scroll or the route is not an article", () => {
    const metrics = { scrollTop: 0, clientHeight: 800, scrollHeight: 800 };
    const container = mountCommentPage(metrics);
    watchNativeComments();
    container.dispatchEvent(new Event("scroll"));
    expect(frameCount).toBe(0);

    metrics.scrollHeight = 2000;
    latestSyncTask()();
    container.dispatchEvent(new Event("scroll"));
    expect(frameCount).toBe(1);

    const windowScroll = vi.fn();
    window.addEventListener("scroll", windowScroll);
    history.replaceState(null, "", "/app/bbs/home");
    latestSyncTask()();
    flushFrames();
    const framesBefore = frameCount;
    container.dispatchEvent(new Event("scroll"));
    expect(windowScroll).not.toHaveBeenCalled();
    expect(frameCount).toBe(framesBefore);
    window.removeEventListener("scroll", windowScroll);
  });

  it("clicks an in-page load more control instead of forwarding scroll", () => {
    const metrics = { scrollTop: 600, clientHeight: 400, scrollHeight: 1240 };
    const container = mountCommentPage(metrics);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "加载更多";
    container.append(button);
    const click = vi.fn();
    button.addEventListener("click", click);
    const windowScroll = vi.fn();
    window.addEventListener("scroll", windowScroll);
    watchNativeComments();
    container.dispatchEvent(new Event("scroll"));
    flushFrames();
    expect(click).toHaveBeenCalledTimes(1);
    expect(windowScroll).not.toHaveBeenCalled();
    window.removeEventListener("scroll", windowScroll);
  });
});
