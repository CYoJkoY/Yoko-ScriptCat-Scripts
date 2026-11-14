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
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    writable: true,
    value: (): Promise<void> => Promise.resolve(),
  });
});

import {
  LIGHTBOX_LONG_IMAGE_RATIO,
  LIGHTBOX_LONG_IMAGE_WIDTH_RATIO,
  LIGHTBOX_ZOOM_MAX,
  READER_CSS,
  READER_ID,
  computeLightboxBaseWidth,
  computeLightboxZoomWidth,
  watchReader,
} from "../scripts/heybox-up/src/ui/reader";

const navigation = {
  sync: (): void => undefined,
  readStatus: () => ({ currentId: "1", revision: 0, prev: null, next: null, discovering: false, error: "", exhausted: true, history: [] }),
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

const mediaPayload = {
  status: "ok",
  result: {
    comments: [
      {
        comment: [
          {
            comment_id: "9100",
            text: "<p>big picture</p>",
            imgs: [{ url: "https://imgheybox1.max-c.com/bbs/2026/10/13/long.webp", width: 734, height: 2048 }],
            user: { username: "me", userid: 42 },
          },
        ],
      },
    ],
    link: { comment_num: 1, title: "t" },
  },
};

/** jsdom reports 0 x 0 for every picture, so the natural size is injected. */
function stubNaturalSize(img: HTMLImageElement, width: number, height: number): void {
  Object.defineProperty(img, "naturalWidth", { configurable: true, get: () => width });
  Object.defineProperty(img, "naturalHeight", { configurable: true, get: () => height });
}

async function openCommentLightbox(host: HTMLElement): Promise<HTMLImageElement> {
  host.querySelector<HTMLElement>('[data-action="comment"]')?.click();
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const thumbnail = host.ownerDocument.querySelector<HTMLImageElement>(".hbu-reader-comments-image");
  expect(thumbnail).not.toBeNull();
  thumbnail?.click();
  const viewer = document.querySelector<HTMLImageElement>(".hbu-reader-lightbox img");
  if (viewer === null) throw new Error("Expected the lightbox to open");
  stubNaturalSize(viewer, 734, 2048);
  viewer.dispatchEvent(new Event("load"));
  return viewer;
}

describe("reader lightbox sizing", () => {
  it("opens a long picture near half the viewport width", () => {
    const base = computeLightboxBaseWidth(734, 2048, 1440, 900);
    expect(base).toBe(Math.round(1440 * LIGHTBOX_LONG_IMAGE_WIDTH_RATIO));
    expect(2048 / 734).toBeGreaterThan(LIGHTBOX_LONG_IMAGE_RATIO);
  });

  it("never upscales a long picture that is already narrow", () => {
    expect(computeLightboxBaseWidth(300, 1800, 1440, 900)).toBe(300);
  });

  it("contains an ordinary photo inside the viewport", () => {
    const base = computeLightboxBaseWidth(2000, 1200, 1440, 900);
    expect(base).toBeLessThanOrEqual(Math.round(1440 * 0.92));
    expect(base).toBeLessThan(2000);
    // A tall-but-not-long photo is limited by the viewport height instead.
    expect(computeLightboxBaseWidth(1200, 1200, 1440, 700)).toBe(Math.round(700 * 0.84));
  });

  it("falls back to zero without a usable size", () => {
    expect(computeLightboxBaseWidth(0, 0, 1440, 900)).toBe(0);
    expect(computeLightboxBaseWidth(600, 600, 0, 900)).toBe(0);
  });

  it("steps zoom up to the cap and back to the base width", () => {
    const base = 720;
    const first = computeLightboxZoomWidth(base, 4000, 1);
    const second = computeLightboxZoomWidth(base, 4000, 2);
    expect(first).toBeGreaterThan(base);
    expect(second).toBeGreaterThan(first);
    expect(computeLightboxZoomWidth(base, 4000, 0)).toBe(base);
    expect(computeLightboxZoomWidth(base, 4000, LIGHTBOX_ZOOM_MAX + 3)).toBe(second);
  });
});

describe("reader lightbox interaction", () => {
  beforeEach(() => {
    document.cookie = "heybox_id=42";
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mediaPayload),
    })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    document.cookie = "heybox_id=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  });

  it("opens from a comment picture and zooms with left and right clicks", async () => {
    const host = mountReader();
    const viewer = await openCommentLightbox(host);
    const base = viewer.style.width;
    expect(viewer.dataset["zoom"]).toBe("0");
    expect(base).not.toBe("");

    viewer.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(viewer.dataset["zoom"]).toBe("1");
    expect(Number.parseInt(viewer.style.width, 10)).toBeGreaterThan(Number.parseInt(base, 10));

    const up = viewer.style.width;
    viewer.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(viewer.dataset["zoom"]).toBe("0");
    expect(viewer.style.width).toBe(base);
    expect(up).not.toBe(base);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(document.querySelector(".hbu-reader-lightbox")).toBeNull();
  });

  it("does not zoom below the base size on extra right clicks", async () => {
    const host = mountReader();
    const viewer = await openCommentLightbox(host);
    const base = viewer.style.width;
    for (let index = 0; index < 3; index += 1) {
      viewer.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    }
    expect(viewer.dataset["zoom"]).toBe("0");
    expect(viewer.style.width).toBe(base);
  });

  it("closes on a backdrop click", async () => {
    const host = mountReader();
    await openCommentLightbox(host);
    const overlay = document.querySelector<HTMLElement>(".hbu-reader-lightbox");
    expect(overlay).not.toBeNull();
    overlay?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.querySelector(".hbu-reader-lightbox")).toBeNull();
  });

  it("opens from Enter on a focused comment picture and returns focus on close", async () => {
    const host = mountReader();
    host.querySelector<HTMLElement>('[data-action="comment"]')?.click();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const thumbnail = host.ownerDocument.querySelector<HTMLImageElement>(".hbu-reader-comments-image");
    expect(thumbnail).not.toBeNull();
    expect(thumbnail?.getAttribute("role")).toBe("button");
    expect(thumbnail?.getAttribute("tabindex")).toBe("0");
    expect(thumbnail?.getAttribute("aria-label")).toBe("查看大图");

    thumbnail?.focus();
    thumbnail?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    const overlay = document.querySelector<HTMLElement>(".hbu-reader-lightbox");
    expect(overlay).not.toBeNull();
    expect(document.activeElement).toBe(overlay);
    const hint = overlay?.querySelector<HTMLElement>(".hbu-reader-lightbox-hint");
    expect(hint?.textContent).toContain("Enter");

    // Closing from the dialog restores the place the keyboard opened it from.
    overlay?.querySelector<HTMLButtonElement>(".hbu-reader-lightbox-close")?.click();
    expect(document.querySelector(".hbu-reader-lightbox")).toBeNull();
    expect(document.activeElement).toBe(thumbnail);
  });

  it("zooms the focused picture with Enter and Shift+Enter", async () => {
    const host = mountReader();
    const viewer = await openCommentLightbox(host);
    const base = viewer.style.width;
    viewer.focus();
    viewer.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(viewer.dataset["zoom"]).toBe("1");
    expect(Number.parseInt(viewer.style.width, 10)).toBeGreaterThan(Number.parseInt(base, 10));

    viewer.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true, cancelable: true }));
    expect(viewer.dataset["zoom"]).toBe("0");
    expect(viewer.style.width).toBe(base);
  });

  it("steps zoom with plus, minus, and reset keys while the dialog owns the keyboard", async () => {
    const host = mountReader();
    const viewer = await openCommentLightbox(host);
    const base = viewer.style.width;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "+", bubbles: true, cancelable: true }));
    expect(viewer.dataset["zoom"]).toBe("1");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "-", bubbles: true, cancelable: true }));
    expect(viewer.dataset["zoom"]).toBe("0");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "=", bubbles: true, cancelable: true }));
    expect(viewer.dataset["zoom"]).toBe("1");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "0", bubbles: true, cancelable: true }));
    expect(viewer.dataset["zoom"]).toBe("0");
    expect(viewer.style.width).toBe(base);

    // Reader shortcuts stay behind the modal while it is open.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "h", bubbles: true, cancelable: true }));
    expect(document.querySelector(".hbu-reader-lightbox")).not.toBeNull();
  });

  it("keeps Tab cycling inside the dialog", async () => {
    const host = mountReader();
    const viewer = await openCommentLightbox(host);
    const overlay = document.querySelector<HTMLElement>(".hbu-reader-lightbox");
    expect(overlay).not.toBeNull();
    const close = overlay?.querySelector<HTMLButtonElement>(".hbu-reader-lightbox-close");
    expect(close).not.toBeNull();

    const tab = (): void => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    };
    tab();
    expect(document.activeElement).toBe(close);
    tab();
    expect(document.activeElement).toBe(viewer);
    tab();
    expect(document.activeElement).toBe(close);
    tab();
    expect(document.activeElement).toBe(viewer);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(close);
  });
});

describe("reader lightbox layering", () => {
  const layers = new Map<string, number>();
  const style = document.createElement("style");
  style.textContent = READER_CSS;
  document.head.append(style);
  const sheet = style.sheet;
  if (sheet === null) throw new Error("Expected the reader style sheet");
  for (const rule of sheet.cssRules) {
    if (!(rule instanceof CSSStyleRule)) continue;
    const zIndex = Number.parseInt(rule.style.getPropertyValue("z-index"), 10);
    if (Number.isFinite(zIndex)) layers.set(rule.selectorText, zIndex);
  }
  style.remove();

  it("paints the viewer above the comment sheet it is opened from", () => {
    const panel = layers.get(".hbu-reader-comments-panel");
    const lightbox = layers.get(".hbu-reader-lightbox");
    expect(panel).toBe(4065);
    expect(lightbox).toBeDefined();
    expect(lightbox ?? 0).toBeGreaterThan(panel ?? 0);
  });

  it("stays below the site alert so a login prompt is never covered", () => {
    expect(layers.get(".hbu-reader-lightbox") ?? 0).toBeLessThan(4100);
  });
});

describe("reader media page spacing", () => {
  it("uses responsive whitespace and avoids doubling gaps between adjacent images", () => {
    expect(READER_CSS).toContain('.hbu-reader-page[data-kind="media"] { justify-content: flex-start; padding: 2rem 20px;');
    expect(READER_CSS).toContain('.hbu-reader-page[data-kind="media"] { padding: 1.5rem 16px; }');
    expect(READER_CSS).toContain('.hbu-reader-page[data-kind="media"] + .hbu-reader-page[data-kind="media"] { padding-top: 0; }');
    expect(READER_CSS).toContain('.hbu-reader-rich figcaption { margin: .5rem 0 0;');
  });

  it("keeps the photo stage free of a dimming scrim", () => {
    expect(READER_CSS).not.toContain(".hbu-reader-cover-stage::after");
  });
});
