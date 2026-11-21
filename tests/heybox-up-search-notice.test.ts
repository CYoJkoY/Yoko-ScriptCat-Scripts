// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  dismissCancelNotice,
  isCancelNoticeText,
  isSearchPagePath,
  watchSearchCancelNotice,
} from "../scripts/heybox-up/src/ui/search-notice";

function appendToast(text: string): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.className = "hb-toast__wrapper";
  const toast = document.createElement("div");
  toast.className = "hb-toast hb-toast__top";
  const body = document.createElement("div");
  body.className = "hb-toast__text";
  body.textContent = text;
  toast.append(body);
  wrapper.append(toast);
  document.body.append(wrapper);
  return wrapper;
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeAll(() => {
  watchSearchCancelNotice();
});

afterEach(() => {
  document.body.replaceChildren();
  history.replaceState({}, "", "/");
});

describe("HeyBox Up search cancel notice", () => {
  it("scopes the filter to the search route", () => {
    expect(isSearchPagePath("/app/search")).toBe(true);
    expect(isSearchPagePath("/app/search/")).toBe(true);
    expect(isSearchPagePath("/app/search/list")).toBe(true);
    expect(isSearchPagePath("/app/searchx")).toBe(false);
    expect(isSearchPagePath("/app/bbs/home")).toBe(false);
  });

  it("matches only a bare cancellation text", () => {
    expect(isCancelNoticeText("canceled")).toBe(true);
    expect(isCancelNoticeText("  Cancelled ")).toBe(true);
    expect(isCancelNoticeText("已取消")).toBe(true);
    expect(isCancelNoticeText("请求已取消")).toBe(true);
    expect(isCancelNoticeText("搜索失败")).toBe(false);
    expect(isCancelNoticeText("canceled by user")).toBe(false);
    expect(isCancelNoticeText(null)).toBe(false);
  });

  it("removes the wrapper of a cancelled toast and keeps real errors", () => {
    const cancelled = appendToast("canceled");
    const toast = cancelled.querySelector(".hb-toast");
    if (toast === null) throw new Error("expected a toast element");
    expect(dismissCancelNotice(toast)).toBe(true);
    expect(cancelled.isConnected).toBe(false);

    const failure = appendToast("搜索失败");
    const failureToast = failure.querySelector(".hb-toast");
    if (failureToast === null) throw new Error("expected a toast element");
    expect(dismissCancelNotice(failureToast)).toBe(false);
    expect(failure.isConnected).toBe(true);
  });

  it("drops the cancel toast inserted on the search page", async () => {
    history.replaceState({}, "", "/app/search/list?q=www&search_type=game");
    const cancelled = appendToast("canceled");
    await flush();
    expect(cancelled.isConnected).toBe(false);

    const failure = appendToast("搜索失败");
    await flush();
    expect(failure.isConnected).toBe(true);
  });

  it("drops the cancel toast whose text arrives after insertion", async () => {
    history.replaceState({}, "", "/app/search/");
    const cancelled = appendToast("");
    const text = cancelled.querySelector(".hb-toast__text");
    if (text === null) throw new Error("expected a toast text element");
    await flush();
    expect(cancelled.isConnected).toBe(true);
    text.textContent = "cancelled";
    await flush();
    expect(cancelled.isConnected).toBe(false);
  });

  it("leaves toasts alone on other routes", async () => {
    history.replaceState({}, "", "/app/bbs/home");
    const cancelled = appendToast("Cancelled");
    await flush();
    expect(cancelled.isConnected).toBe(true);
  });
});
