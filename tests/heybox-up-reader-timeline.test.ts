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
import { localStore, readReaderTimelinePreference, setReaderTimelinePreference } from "../scripts/heybox-up/src/state";
import { STORAGE_KEYS } from "../scripts/heybox-up/src/config";

const navigation = {
  sync: (): void => undefined,
  readStatus: () => ({
    currentId: "123456",
    revision: 1,
    prev: { id: "100", title: "Earlier post" },
    next: null,
    discovering: false,
    error: "",
    exhausted: true,
    history: [
      { id: "100", title: "Earlier post", current: false },
      { id: "123456", title: "Title", current: true },
    ],
  }),
  takeNext: () => null,
  discover: async (): Promise<void> => undefined,
  subscribe: () => (): void => undefined,
};

function mountReader(): HTMLElement {
  history.replaceState(null, "", "/app/bbs/link/123456");
  document.body.innerHTML = [
    '<div id="page-bbs-link">',
    '<div class="hb-bbs-image-text">',
    '<div class="image-text__title">Title</div>',
    '<div class="image-text__content"><p>Body</p></div>',
    '</div>',
    '<div class="link-user__username">Author</div>',
    '</div>',
  ].join("");
  watchReader(navigation);
  const host = document.getElementById(READER_ID);
  if (host === null) throw new Error("Expected the reader to mount");
  return host;
}

describe("reader history timeline", () => {
  beforeEach(() => {
    localStore.remove(STORAGE_KEYS.readerTimeline);
    setReaderTimelinePreference(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    localStore.remove(STORAGE_KEYS.readerTimeline);
  });

  it("ships the timeline action enabled by default", () => {
    expect(readReaderTimelinePreference()).toBe(true);
    const host = mountReader();
    const rail = host.querySelector(".hbu-reader-rail");
    const action = rail?.querySelector<HTMLButtonElement>('[data-action="history"]');
    expect(action).not.toBeNull();
    expect(action?.getAttribute("aria-expanded")).toBe("false");
    // The action stays above the settings gear so the rail keeps one order.
    expect(action?.nextElementSibling?.getAttribute("data-action")).toBe("spacing");
  });

  it("lists visited posts newest first and marks the open one", () => {
    const host = mountReader();
    host.querySelector<HTMLButtonElement>('[data-action="history"]')?.click();
    const panel = host.querySelector<HTMLElement>(".hbu-reader-history-menu");
    expect(panel?.hidden).toBe(false);
    expect(panel?.querySelector(".hbu-reader-history-meta")?.textContent).toBe("共 2 篇 · 正在阅读第 2 篇");
    const rows = Array.from(panel?.querySelectorAll(".hbu-reader-history-row") ?? []);
    expect(rows.map((row) => row.getAttribute("data-id"))).toEqual(["123456", "100"]);
    expect(rows[0]?.getAttribute("aria-current")).toBe("true");
    expect(rows[0]?.getAttribute("aria-label")).toBe("第 2 篇，共 2 篇：Title，正在阅读");
    expect(rows[1]?.getAttribute("aria-label")).toBe("第 1 篇，共 2 篇：Earlier post");
    expect(rows[0]?.querySelector(".hbu-reader-history-current")?.textContent).toBe("正在阅读");
  });

  it("closes on Escape and returns focus to the timeline action", () => {
    const host = mountReader();
    const action = host.querySelector<HTMLButtonElement>('[data-action="history"]');
    action?.click();
    const panel = host.querySelector<HTMLElement>(".hbu-reader-history-menu");
    const thumb = host.querySelector<HTMLButtonElement>(".hbu-reader-history-thumb");
    if (panel === null || thumb === null) throw new Error("Expected the open timeline");
    thumb.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(panel.hidden).toBe(true);
    expect(action?.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(action);
  });

  it("scrolls the current visit into view when the timeline opens", () => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    try {
      const host = mountReader();
      host.querySelector<HTMLButtonElement>('[data-action="history"]')?.click();
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    } finally {
      if (original === undefined) delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
      else Object.defineProperty(HTMLElement.prototype, "scrollIntoView", original);
    }
  });

  it("removes the action and panel when the switch turns off", () => {
    const host = mountReader();
    host.querySelector<HTMLButtonElement>('[data-action="history"]')?.click();
    setReaderTimelinePreference(false);
    expect(host.querySelector('[data-action="history"]')).toBeNull();
    expect(host.querySelector(".hbu-reader-history-menu")).toBeNull();

    setReaderTimelinePreference(true);
    expect(host.querySelector('[data-action="history"]')).not.toBeNull();
  });

  it("prints the visit position as x/n on the draggable thumb", () => {
    const host = mountReader();
    host.querySelector<HTMLButtonElement>('[data-action="history"]')?.click();
    const thumb = host.querySelector<HTMLButtonElement>(".hbu-reader-history-thumb");
    expect(thumb?.textContent).toBe("2/2");
    expect(thumb?.getAttribute("role")).toBe("slider");
    expect(thumb?.getAttribute("aria-orientation")).toBe("vertical");
    expect(thumb?.getAttribute("aria-valuemin")).toBe("1");
    expect(thumb?.getAttribute("aria-valuemax")).toBe("2");
    expect(thumb?.getAttribute("aria-valuenow")).toBe("2");
    expect(thumb?.getAttribute("aria-valuetext")).toBe("第 2 篇，共 2 篇");
    // The newest visit sits at the top of the rail.
    expect(thumb?.style.top).toBe("0%");
  });

  it("previews another visit with the arrow keys without leaving the post", () => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    try {
      const host = mountReader();
      host.querySelector<HTMLButtonElement>('[data-action="history"]')?.click();
      const thumb = host.querySelector<HTMLButtonElement>(".hbu-reader-history-thumb");
      if (thumb === null) throw new Error("Expected the rail thumb");
      const rows = Array.from(host.querySelectorAll<HTMLButtonElement>(".hbu-reader-history-row"));
      const peek = host.querySelector<HTMLElement>(".hbu-reader-history-peek");
      expect(peek?.getAttribute("role")).toBe("status");
      expect(peek?.getAttribute("aria-live")).toBe("polite");
      expect(peek?.getAttribute("aria-atomic")).toBe("true");
      thumb.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }));
      expect(thumb.textContent).toBe("2/2");
      thumb.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }));
      expect(thumb.textContent).toBe("1/2");
      expect(thumb.style.top).toBe("100%");
      expect(thumb.getAttribute("data-preview")).toBe("true");
      expect(peek?.textContent).toBe("Earlier post");
      expect(peek?.hidden).toBe(false);
      expect(rows[1]?.getAttribute("data-preview")).toBe("true");
      expect(rows[0]?.getAttribute("data-preview")).toBeNull();
      expect(rows[0]?.getAttribute("aria-current")).toBe("true");
      expect(rows[1]?.getAttribute("aria-current")).toBeNull();
      expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "nearest" });
      expect(scrollIntoView.mock.contexts.at(-1)).toBe(rows[1]);

      thumb.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
      expect(thumb.textContent).toBe("2/2");
      // Previewing never navigates on its own.
      expect(location.pathname).toBe("/app/bbs/link/123456");
    } finally {
      if (original === undefined) delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
      else Object.defineProperty(HTMLElement.prototype, "scrollIntoView", original);
    }
  });

  it("tracks the pointer while the thumb is dragged", () => {
    const host = mountReader();
    host.querySelector<HTMLButtonElement>('[data-action="history"]')?.click();
    const body = host.querySelector<HTMLElement>(".hbu-reader-history-rail");
    const thumb = host.querySelector<HTMLButtonElement>(".hbu-reader-history-thumb");
    if (body === null || thumb === null) throw new Error("Expected the timeline rail");
    body.getBoundingClientRect = () => ({
      x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 200, width: 52, height: 200,
      toJSON: () => ({}),
    } as DOMRect);
    thumb.setPointerCapture = (): void => undefined;
    thumb.releasePointerCapture = (): void => undefined;
    thumb.hasPointerCapture = (): boolean => true;

    thumb.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, pointerId: 1, clientY: 0 }));
    expect(thumb.getAttribute("data-dragging")).toBe("true");
    expect(thumb.textContent).toBe("2/2");

    thumb.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientY: 200 }));
    expect(thumb.textContent).toBe("1/2");
    expect(thumb.style.top).toBe("100%");

    thumb.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientY: 0 }));
    expect(thumb.textContent).toBe("2/2");
    expect(thumb.style.top).toBe("0%");
  });
});
