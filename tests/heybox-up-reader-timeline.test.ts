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
    const rows = Array.from(panel?.querySelectorAll(".hbu-reader-history-row") ?? []);
    expect(rows.map((row) => row.getAttribute("data-id"))).toEqual(["123456", "100"]);
    expect(rows[0]?.getAttribute("aria-current")).toBe("true");
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
});
