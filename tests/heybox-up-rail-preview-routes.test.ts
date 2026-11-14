// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const environment = vi.hoisted(() => ({ pathname: "/app/bbs/home", reducedMotion: false, narrowViewport: false }));

vi.hoisted(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: {
      get pathname() { return environment.pathname; },
      set pathname(next: string) { environment.pathname = next; },
      href: "https://www.xiaoheihe.cn/app/bbs/home",
    },
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList => ({
      matches: query === "(prefers-reduced-motion: reduce)" && environment.reducedMotion
        || query === "(max-width: 1199px)" && environment.narrowViewport,
      media: "",
      onchange: null,
      addListener: (): void => undefined,
      removeListener: (): void => undefined,
      addEventListener: (): void => undefined,
      removeEventListener: (): void => undefined,
      dispatchEvent: (): boolean => true,
    }),
  });
  const memory = new Map<string, string>();
  const storage = {
    get length() { return memory.size; },
    clear(): void { memory.clear(); },
    getItem(key: string): string | null { return memory.get(key) ?? null; },
    key(index: number): string | null { return Array.from(memory.keys())[index] ?? null; },
    removeItem(key: string): void { memory.delete(key); },
    setItem(key: string, value: string): void { memory.set(key, String(value)); },
  };
  for (const name of ["localStorage", "sessionStorage"]) {
    Object.defineProperty(window, name, { configurable: true, value: storage });
    Object.defineProperty(globalThis, name, { configurable: true, value: storage });
  }
});

import { RAIL_ID, watchCommentRail } from "../scripts/heybox-up/src/ui/rail";
import { pageSyncTasks } from "../scripts/heybox-up/src/core/page-sync";

const FEED_MARKUP = '<div id="page-bbs-community"><div class="bbs-home__content-list">'
  + '<div class="bbs-home__content-item"><a href="/app/bbs/link/800">A</a>'
  + '<button class="bbs-new-style-bottom__comment">8</button></div>'
  + '<div class="bbs-home__content-item"><a href="/app/bbs/link/801">B</a>'
  + '<button class="bbs-new-style-bottom__comment">3</button></div>'
  + "</div></div>";

const TOPIC_MARKUP = '<div id="page-topic-link"><div class="content-list">'
  + '<div class="content-list__item"><a href="/app/bbs/link/900">A</a>'
  + '<span class="content-list__comment">2</span></div>'
  + '<div class="content-list__item"><a href="/app/bbs/link/901">B</a>'
  + '<span class="content-list__comment">1</span></div>'
  + "</div></div>";

function railHost(): HTMLElement {
  const hosts = document.querySelectorAll<HTMLElement>("div#" + RAIL_ID);
  const host = hosts[hosts.length - 1];
  if (host === undefined) throw new Error("rail not mounted");
  return host;
}

function railPart<T extends Element>(selector: string): T {
  const node = railHost().shadowRoot?.querySelector<T>(selector);
  if (!node) throw new Error(selector + " missing");
  return node;
}

/** The scheduler is a module singleton, so each case drops the previous tasks. */
function resetPageSync(): void {
  pageSyncTasks.clear();
}

async function settle(): Promise<void> {
  for (let index = 0; index < 4; index += 1) await Promise.resolve();
}

function press(key: string, target: EventTarget = document.body, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

const fetchMock = vi.fn(async (): Promise<Response> => new Response(JSON.stringify({
  status: "ok",
  result: { comments: [], link: { comment_num: 0 }, total_floor_num: 0 },
}), { status: 200, headers: { "content-type": "application/json" } }));

let stopWatching: () => void = () => undefined;

beforeEach(() => {
  environment.pathname = "/app/bbs/home";
  environment.reducedMotion = false;
  environment.narrowViewport = false;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.useFakeTimers();
  resetPageSync();
  document.body.innerHTML = "";
  document.body.innerHTML = FEED_MARKUP;
  stopWatching = watchCommentRail();
  vi.advanceTimersByTime(0);
});

afterEach(() => {
  stopWatching();
  stopWatching = () => undefined;
  resetPageSync();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  document.body.className = "";
});

describe("comment preview routes", () => {
  it("intercepts the comment counter on the community home", () => {
    const counter = document.querySelector(".bbs-new-style-bottom__comment")!;
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    counter.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(railPart(".title").textContent).toBe("评论");
    expect((railPart("a.icon") as HTMLAnchorElement).getAttribute("href")).toContain("800");
  });

  it("keeps native comment navigation when the preview rail is hidden on narrow viewports", () => {
    environment.narrowViewport = true;
    const counter = document.querySelector(".bbs-new-style-bottom__comment")!;
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    counter.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
  });

  it("opens topic feeds from the counter instead of leaving them collapsed", () => {
    environment.pathname = "/app/topic/link/12";
    document.body.innerHTML = TOPIC_MARKUP;
    vi.advanceTimersByTime(200);
    document.dispatchEvent(new CustomEvent("heybox-up:comment-preview"));
    const comment = document.querySelectorAll<HTMLElement>(".content-list__comment")[1]!;
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    comment.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect((railPart("a.icon") as HTMLAnchorElement).getAttribute("href")).toContain("901");
  });

  it("clears the home preview when the SPA moves to a topic feed", async () => {
    await vi.advanceTimersByTimeAsync(0);
    expect(railHost().dataset["state"]).toBe("open");

    environment.pathname = "/app/topic/link/12";
    document.body.innerHTML = TOPIC_MARKUP;
    document.dispatchEvent(new CustomEvent("heybox-up:comment-preview"));

    expect(railHost().dataset["state"]).toBe("collapsed");
  });

  it("steps through the feed with the arrow keys and ignores editable fields", async () => {
    await vi.advanceTimersByTimeAsync(0);
    const emptyState = railHost().shadowRoot!.querySelector(".status")!;
    expect(emptyState.textContent).toContain("这条帖子还没有评论");
    const scrolls = new Map<Element, ReturnType<typeof vi.fn>>();
    for (const card of document.querySelectorAll<Element>(".bbs-home__content-item")) {
      const spy = vi.fn();
      (card as HTMLElement).scrollIntoView = spy;
      scrolls.set(card, spy);
    }
    const [first, second] = document.querySelectorAll(".bbs-home__content-item");
    const down = press("ArrowDown");
    expect(down.defaultPrevented).toBe(true);
    expect(scrolls.get(second!)!).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(scrolls.get(first!)!).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(railPart(".list")).not.toBeNull();
    expect((railPart("a.icon") as HTMLAnchorElement).getAttribute("href")).toContain("801");
    const end = press("ArrowDown");
    expect(end.defaultPrevented).toBe(false);
    expect(scrolls.get(second!)!).toHaveBeenCalledTimes(1);
    environment.reducedMotion = true;
    const up = press("ArrowUp");
    expect(up.defaultPrevented).toBe(true);
    expect(scrolls.get(first!)!).toHaveBeenCalledWith({ block: "nearest", behavior: "auto" });
    const input = document.createElement("input");
    document.body.append(input);
    const typed = press("ArrowDown", input);
    expect(typed.defaultPrevented).toBe(false);
    const modified = press("ArrowDown", document.body, { ctrlKey: true });
    expect(modified.defaultPrevented).toBe(false);
    const escape = press("Escape");
    expect(escape.defaultPrevented).toBe(true);
    expect(railHost().dataset["state"]).toBe("collapsed");
  });

  it("makes preview failures keyboard retryable", async () => {
    // The signed request falls back to an anonymous one, so both must fail
    // before the preview enters the error state.
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    const counter = document.querySelectorAll(".bbs-new-style-bottom__comment")[1]!;
    counter.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(1000);
    const status = railPart(".status");
    expect(status.getAttribute("role")).toBe("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toContain("评论加载失败");
    const retry = railPart<HTMLButtonElement>("button.retry-button");
    expect(retry.hidden).toBe(false);
    expect(retry.disabled).toBe(false);
    expect(retry.getAttribute("aria-label")).toBe("重试加载评论");
    const callsBeforeRetry = fetchMock.mock.calls.length;
    retry.click();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock.mock.calls.length).toBe(callsBeforeRetry + 1);
    expect(retry.hidden).toBe(true);
    expect(status.textContent).not.toContain("评论加载失败");
    expect(status.textContent).toContain("这条帖子还没有评论");
  });
});
