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
import { localStore, readReaderTimelinePreference, sessionStore, setReaderTimelinePreference } from "../scripts/heybox-up/src/state";
import { READER_HISTORY_LIMIT_EVENT } from "../scripts/heybox-up/src/state";
import { STORAGE_KEYS } from "../scripts/heybox-up/src/config";
import { READER_RATIO_KEY, writeReaderRatio } from "../scripts/heybox-up/src/ui/reader";

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

/** Switches the viewport query the reader reads when it is constructed. */
function setNarrowViewport(narrow: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList => ({
      matches: narrow,
      media: query,
      onchange: null,
      addListener: (): void => undefined,
      removeListener: (): void => undefined,
      addEventListener: (): void => undefined,
      removeEventListener: (): void => undefined,
      dispatchEvent: (): boolean => true,
    }),
  });
}

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

function timeline(host: HTMLElement): HTMLElement {
  const panel = host.querySelector<HTMLElement>(".hbu-reader-history-menu");
  if (panel === null) throw new Error("Expected the docked timeline");
  return panel;
}

describe("reader history timeline", () => {
  beforeEach(() => {
    setNarrowViewport(false);
    localStore.remove(STORAGE_KEYS.readerTimeline);
    sessionStore.remove(READER_RATIO_KEY + "100");
    sessionStore.remove(READER_RATIO_KEY + "123456");
    setReaderTimelinePreference(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    localStore.remove(STORAGE_KEYS.readerTimeline);
    sessionStore.remove(READER_RATIO_KEY + "100");
    sessionStore.remove(READER_RATIO_KEY + "123456");
  });

  it("docks the timeline beside the article without a click", () => {
    const host = mountReader();
    expect(host.classList.contains("hbu-reader-has-timeline")).toBe(true);
    const panel = timeline(host);
    expect(panel.hidden).toBe(false);
    expect(panel.hasAttribute("inert")).toBe(false);
    expect(panel.getAttribute("aria-hidden")).toBeNull();
    expect(panel.parentElement).toBe(host);
    // Wide screens keep the rail toggle in the DOM for narrow-screen resizes,
    // but the CSS hides it while the column is docked.
    const rail = host.querySelector(".hbu-reader-rail");
    const action = rail?.querySelector<HTMLButtonElement>('[data-action="history"]');
    expect(action).not.toBeNull();
    expect(action?.getAttribute("aria-expanded")).toBe("false");
    expect(action?.nextElementSibling?.getAttribute("data-action")).toBe("spacing");
    expect(host.querySelector(".hbu-reader-history-close")).not.toBeNull();
  });

  it("lists visited posts newest first and marks the open one", () => {
    writeReaderRatio("100", 0.625);
    const host = mountReader();
    const panel = timeline(host);
    expect(panel.querySelector(".hbu-reader-history-meta")?.textContent).toBe("共 2 篇 · 正在阅读第 2 篇");
    const rows = Array.from(panel.querySelectorAll(".hbu-reader-history-row"));
    expect(rows.map((row) => row.getAttribute("data-id"))).toEqual(["123456", "100"]);
    expect(rows[0]?.getAttribute("aria-current")).toBe("true");
    expect(rows[0]?.getAttribute("aria-label")).toBe("第 2 篇，共 2 篇：Title，正在阅读");
    expect(rows[1]?.getAttribute("aria-label")).toBe("第 1 篇，共 2 篇：Earlier post，已读 63%");
    expect(rows[1]?.querySelector(".hbu-reader-history-progress")?.textContent).toBe("63%");
    expect(rows[0]?.querySelector(".hbu-reader-history-current")?.textContent).toBe("正在阅读");
  });

  it("refreshes the per-post reading progress when navigation rerenders", () => {
    const host = mountReader();
    writeReaderRatio("100", 0.4);
    document.dispatchEvent(new CustomEvent(READER_HISTORY_LIMIT_EVENT, { detail: 40 }));
    const row = host.querySelector<HTMLButtonElement>('.hbu-reader-history-row[data-id="100"]');
    expect(row?.querySelector(".hbu-reader-history-progress")?.textContent).toBe("40%");
    expect(row?.getAttribute("aria-label")).toContain("已读 40%");
  });

  it("marks a finished post and draws its progress bar", () => {
    writeReaderRatio("100", 1);
    const host = mountReader();
    const row = host.querySelector<HTMLButtonElement>('.hbu-reader-history-row[data-id="100"]');
    expect(row?.querySelector(".hbu-reader-history-progress")?.textContent).toBe("读完");
    expect(row?.getAttribute("aria-label")).toBe("第 1 篇，共 2 篇：Earlier post，已读完");
    const fill = row?.querySelector<HTMLElement>(".hbu-reader-history-bar > i");
    expect(fill?.style.width).toBe("100%");
    expect(fill?.parentElement?.getAttribute("aria-hidden")).toBe("true");
    // An unread visit keeps the row clean instead of showing 0%.
    const currentRow = host.querySelector<HTMLButtonElement>('.hbu-reader-history-row[data-id="123456"]');
    expect(currentRow?.querySelector(".hbu-reader-history-progress")).toBeNull();
  });

  it("moves the row focus with the arrow keys and shows progress in the peek", () => {
    writeReaderRatio("100", 1);
    const host = mountReader();
    const rows = Array.from(host.querySelectorAll<HTMLButtonElement>(".hbu-reader-history-row"));
    const [currentRow, olderRow] = rows;
    if (currentRow === undefined || olderRow === undefined) throw new Error("Expected two rows");
    currentRow.focus();
    currentRow.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(olderRow);
    // The first row has nowhere to go upward.
    olderRow.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(olderRow);
    expect(location.pathname).toBe("/app/bbs/link/123456");

    const thumb = host.querySelector<HTMLButtonElement>(".hbu-reader-history-thumb");
    thumb?.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }));
    expect(host.querySelector(".hbu-reader-history-peek")?.textContent).toBe("Earlier post · 读完");
  });

  it("scrolls the current visit into view when the timeline mounts", () => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    try {
      const host = mountReader();
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
      const currentRow = host.querySelector(".hbu-reader-history-row[aria-current='true']");
      expect(scrollIntoView.mock.contexts.at(-1)).toBe(currentRow);
    } finally {
      if (original === undefined) delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
      else Object.defineProperty(HTMLElement.prototype, "scrollIntoView", original);
    }
  });

  it("removes the action, column and host class when the switch turns off", () => {
    const host = mountReader();
    setReaderTimelinePreference(false);
    expect(host.querySelector('[data-action="history"]')).toBeNull();
    expect(host.querySelector(".hbu-reader-history-menu")).toBeNull();
    expect(host.querySelector(".hbu-reader-history-scrim")).toBeNull();
    expect(host.classList.contains("hbu-reader-has-timeline")).toBe(false);

    setReaderTimelinePreference(true);
    expect(host.querySelector('[data-action="history"]')).not.toBeNull();
    expect(host.classList.contains("hbu-reader-has-timeline")).toBe(true);
    expect(host.querySelector(".hbu-reader-history-menu")).not.toBeNull();
  });

  it("prints the visit position as x/n on the draggable thumb", () => {
    const host = mountReader();
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

  it("synchronizes drawer accessibility when crossing the docking breakpoint", () => {
    const media = window.matchMedia("(max-width: 900px)");
    let resize: (() => void) | undefined;
    media.addEventListener = (_type: string, listener: EventListenerOrEventListenerObject | ((this: MediaQueryList, event: MediaQueryListEvent) => unknown)): void => {
      if (typeof listener === "function") resize = () => listener.call(media, new Event("change") as MediaQueryListEvent);
    };
    const matchMedia = vi.spyOn(window, "matchMedia").mockImplementation(() => media);
    try {
      const host = mountReader();
      expect(matchMedia).toHaveBeenCalledWith("(max-width: 900px)");
      if (resize === undefined) throw new Error("Expected a viewport change listener");
      Object.defineProperty(media, "matches", { configurable: true, value: true });
      resize();
      expect(timeline(host).hasAttribute("inert")).toBe(true);
      host.querySelector<HTMLButtonElement>('[data-action="history"]')?.click();
      expect(host.dataset["timelineOpen"]).toBe("true");
      Object.defineProperty(media, "matches", { configurable: true, value: false });
      resize();
      expect(host.dataset["timelineOpen"]).toBeUndefined();
      expect(timeline(host).hasAttribute("inert")).toBe(false);
      expect(timeline(host).hasAttribute("aria-hidden")).toBe(false);
      expect(host.querySelector<HTMLButtonElement>(".hbu-reader-history-scrim")?.hidden).toBe(true);
    } finally {
      matchMedia.mockRestore();
    }
  });

  it("folds into a drawer at or below 900px and closes on Escape", () => {
    setNarrowViewport(true);
    const host = mountReader();
    const panel = timeline(host);
    const action = host.querySelector<HTMLButtonElement>('[data-action="history"]');
    const scrim = host.querySelector<HTMLDivElement>(".hbu-reader-history-scrim");
    if (action === null || scrim === null) throw new Error("Expected the drawer controls");
    // Closed by default, and inert so tabbing cannot reach the hidden rows.
    expect(panel.getAttribute("aria-hidden")).toBe("true");
    expect(panel.hasAttribute("inert")).toBe(true);
    expect(scrim.hidden).toBe(true);
    expect(action.getAttribute("aria-expanded")).toBe("false");

    action.click();
    expect(host.dataset["timelineOpen"]).toBe("true");
    expect(panel.getAttribute("aria-hidden")).toBe("false");
    expect(panel.hasAttribute("inert")).toBe(false);
    expect(scrim.hidden).toBe(false);
    expect(action.getAttribute("aria-expanded")).toBe("true");

    const thumb = host.querySelector<HTMLButtonElement>(".hbu-reader-history-thumb");
    if (thumb === null) throw new Error("Expected the rail thumb");
    thumb.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(host.dataset["timelineOpen"]).toBeUndefined();
    expect(panel.getAttribute("aria-hidden")).toBe("true");
    expect(scrim.hidden).toBe(true);
    expect(action.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(action);
  });

  it("closes the drawer from its own close button", () => {
    setNarrowViewport(true);
    const host = mountReader();
    host.querySelector<HTMLButtonElement>('[data-action="history"]')?.click();
    const close = host.querySelector<HTMLButtonElement>(".hbu-reader-history-close");
    if (close === null) throw new Error("Expected the drawer close button");
    close.click();
    expect(host.dataset["timelineOpen"]).toBeUndefined();
    expect(timeline(host).getAttribute("aria-hidden")).toBe("true");
  });
});
