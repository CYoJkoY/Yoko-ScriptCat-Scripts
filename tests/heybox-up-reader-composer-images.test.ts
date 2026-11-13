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
  // jsdom ships no WebCrypto, and the comment create call signs its nonce.
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    writable: true,
    value: {
      subtle: {
        importKey: (): Promise<unknown> => Promise.resolve({}),
        sign: (): Promise<ArrayBuffer> => Promise.resolve(new Uint8Array(32).buffer),
        encrypt: ({ iv }: { iv: Uint8Array }): Promise<ArrayBuffer> => {
          const plain = new Uint8Array(48);
          const out = new Uint8Array(iv.length + plain.length);
          out.set(iv, 0);
          out.set(plain, iv.length);
          return Promise.resolve(out.buffer);
        },
      },
    },
  });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: (): string => "blob:preview",
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    writable: true,
    value: (): void => undefined,
  });
  // jsdom never loads a blob picture, which would leave the size probe on its
  // three second timeout; the fake image answers immediately instead.
  Object.defineProperty(globalThis, "Image", {
    configurable: true,
    writable: true,
    value: class {
      naturalWidth = 800;
      naturalHeight = 600;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        setTimeout(() => this.onload?.(), 0);
      }
    },
  });
});

import { READER_ID, watchReader } from "../scripts/heybox-up/src/ui/reader";
import { clearRailPageCache } from "../scripts/heybox-up/src/ui/rail";

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

const treePayload = {
  status: "ok",
  result: {
    comments: [{ comment: [{ comment_id: "9001", text: "<p>floor</p>", user: { username: "me", userid: 42 } }] }],
    link: { comment_num: 1, title: "t" },
  },
};

interface RecordedCall {
  url: string;
  method: string;
  body: string;
}

function jsonResponse(payload: unknown): { ok: boolean; status: number; json: () => Promise<unknown> } {
  return { ok: true, status: 200, json: () => Promise.resolve(payload) };
}

function stubUploads(options: { failUpload?: boolean } = {}): RecordedCall[] {
  const calls: RecordedCall[] = [];
  vi.stubGlobal("fetch", vi.fn((input: unknown, init: RequestInit = {}) => {
    const url = String(input);
    const body = typeof init.body === "string" ? init.body : "";
    calls.push({ url: url, method: init.method ?? "GET", body: body });
    if (url.includes("/upload/info/v2")) {
      return Promise.resolve(jsonResponse({ status: "ok", result: { keys: ["bbs/2026/11/03/a.webp"], bucket: "bbs-1" } }));
    }
    if (url.includes("/upload/token/v2")) {
      return Promise.resolve(jsonResponse({
        status: "ok",
        result: {
          credentials: { tmpSecretId: "id", tmpSecretKey: "key", sessionToken: "token" },
          startTime: 1700000000,
          expiredTime: 1700003600,
        },
      }));
    }
    if (init.method === "PUT") {
      return Promise.resolve(options.failUpload === true ? { ok: false, status: 403, json: () => Promise.resolve({}) } : { ok: true, status: 200 });
    }
    if (url.includes("/upload/callback/v2")) {
      return Promise.resolve(jsonResponse({
        status: "ok",
        result: { preview_urls: ["https://imgheybox1.max-c.com/bbs/2026/11/03/a.webp"], thumbs: ["https://imgheybox1.max-c.com/bbs/2026/11/03/a-thumb.webp"] },
      }));
    }
    if (url.includes("/comment/create")) {
      return Promise.resolve(jsonResponse({ status: "ok", result: { comment_id: "9300" } }));
    }
    return Promise.resolve(jsonResponse(treePayload));
  }));
  return calls;
}

function pickFiles(input: HTMLInputElement, files: File[]): void {
  Object.defineProperty(input, "files", { configurable: true, value: files });
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function openComposer(host: HTMLElement): Promise<void> {
  host.querySelector<HTMLElement>('[data-action="comment"]')?.click();
  await new Promise((resolve) => setTimeout(resolve, 1200));
}

async function settle(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await new Promise((resolve) => setTimeout(resolve, 20));
}

function commentCreateCalls(calls: readonly RecordedCall[]): RecordedCall[] {
  return calls.filter((call) => call.url.includes("/comment/create"));
}

describe("reader composer pictures", () => {
  beforeEach(() => {
    document.cookie = "heybox_id=42";
    clearRailPageCache("123456");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    clearRailPageCache("123456");
    document.cookie = "heybox_id=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  });

  it("offers a picture picker that accepts several images", async () => {
    stubUploads();
    const host = mountReader();
    await openComposer(host);
    const toggle = document.querySelector<HTMLButtonElement>(".hbu-reader-composer-image-toggle");
    const input = document.querySelector<HTMLInputElement>(".hbu-reader-composer-file");
    expect(toggle).not.toBeNull();
    expect(toggle?.disabled).toBe(false);
    expect(input?.type).toBe("file");
    expect(input?.accept).toBe("image/*");
    expect(input?.multiple).toBe(true);
  });

  it("uploads a picked picture and posts its CDN url as imgs", async () => {
    const calls = stubUploads();
    const host = mountReader();
    await openComposer(host);
    const fileInput = document.querySelector<HTMLInputElement>(".hbu-reader-composer-file");
    if (fileInput === null) throw new Error("Expected the file input");
    pickFiles(fileInput, [new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" })]);
    await settle();

    const item = document.querySelector<HTMLElement>(".hbu-reader-composer-image");
    expect(item?.dataset["status"]).toBe("ready");
    expect(item?.querySelector("img")?.getAttribute("src")).toBe("blob:preview");
    const submit = document.querySelector<HTMLButtonElement>(".hbu-reader-composer-submit");
    // Pictures alone are a valid comment, so the empty contenteditable still
    // submits.
    expect(submit?.disabled).toBe(false);

    submit?.click();
    await settle();
    const created = commentCreateCalls(calls);
    expect(created).toHaveLength(1);
    const body = new URLSearchParams(created[0]?.body ?? "");
    expect(body.get("imgs")).toBe("https://imgheybox1.max-c.com/bbs/2026/11/03/a.webp");
    expect(body.get("text")).toBe("");
    expect(body.get("link_id")).toBe("123456");
  });

  it("keeps the composer usable when the upload fails", async () => {
    stubUploads({ failUpload: true });
    const host = mountReader();
    await openComposer(host);
    const fileInput = document.querySelector<HTMLInputElement>(".hbu-reader-composer-file");
    if (fileInput === null) throw new Error("Expected the file input");
    pickFiles(fileInput, [new File([new Uint8Array([1])], "bad.png", { type: "image/png" })]);
    await settle();

    const item = document.querySelector<HTMLElement>(".hbu-reader-composer-image");
    expect(item?.dataset["status"]).toBe("failed");
    expect(document.querySelector(".hbu-reader-composer-status")?.textContent).toContain("上传失败");
    // A failed picture cannot be sent, so an empty comment stays disabled.
    expect(document.querySelector<HTMLButtonElement>(".hbu-reader-composer-submit")?.disabled).toBe(true);
    // Removing it frees the picker again.
    document.querySelector<HTMLButtonElement>(".hbu-reader-composer-image-remove")?.click();
    expect(document.querySelector(".hbu-reader-composer-image")).toBeNull();
    expect(document.querySelector<HTMLButtonElement>(".hbu-reader-composer-image-toggle")?.disabled).toBe(false);
  });

  it("rejects a non-image choice with the site wording", async () => {
    stubUploads();
    const host = mountReader();
    await openComposer(host);
    const fileInput = document.querySelector<HTMLInputElement>(".hbu-reader-composer-file");
    if (fileInput === null) throw new Error("Expected the file input");
    pickFiles(fileInput, [new File(["x"], "a.txt", { type: "text/plain" })]);
    await settle();
    expect(document.querySelector(".hbu-reader-composer-status")?.textContent).toBe("仅支持选择图片文件");
    expect(document.querySelector(".hbu-reader-composer-image")).toBeNull();
  });

  it("caps the picker at nine pictures", async () => {
    stubUploads();
    const host = mountReader();
    await openComposer(host);
    const fileInput = document.querySelector<HTMLInputElement>(".hbu-reader-composer-file");
    if (fileInput === null) throw new Error("Expected the file input");
    const files = Array.from({ length: 9 }, (_, index) => new File([new Uint8Array([index])], "p" + index + ".png", { type: "image/png" }));
    pickFiles(fileInput, files);
    await settle();
    expect(document.querySelectorAll(".hbu-reader-composer-image")).toHaveLength(9);
    expect(document.querySelector<HTMLButtonElement>(".hbu-reader-composer-image-toggle")?.disabled).toBe(true);
  });

  it("leaves pictures out of a reply because the site hides that picker", async () => {
    stubUploads();
    const host = mountReader();
    await openComposer(host);
    const fileInput = document.querySelector<HTMLInputElement>(".hbu-reader-composer-file");
    if (fileInput === null) throw new Error("Expected the file input");
    pickFiles(fileInput, [new File([new Uint8Array([1])], "a.png", { type: "image/png" })]);
    await settle();
    document.querySelector<HTMLButtonElement>(".hbu-reader-comments-reply")?.click();
    expect(document.querySelectorAll(".hbu-reader-composer-image")).toHaveLength(0);
    expect(document.querySelector<HTMLButtonElement>(".hbu-reader-composer-image-toggle")?.disabled).toBe(true);
  });
});
