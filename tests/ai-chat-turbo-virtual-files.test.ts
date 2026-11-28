// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VIRTUAL_FILE_THRESHOLD } from "../scripts/ai-chat-turbo-engine/src/config";
import type { ComposerUtils } from "../scripts/ai-chat-turbo-engine/src/core/composer";
import { createEngineState } from "../scripts/ai-chat-turbo-engine/src/state";
import type { ElementFactory } from "../scripts/ai-chat-turbo-engine/src/ui/code-blocks";
import {
  createVirtualFileUtils,
  type VirtualFileUtils,
} from "../scripts/ai-chat-turbo-engine/src/ui/virtual-files";

function createTestElement<Tag extends keyof HTMLElementTagNameMap = "div">(
  tag: Tag,
  attrs: Readonly<Record<string, string | EventListener>> = {},
  children: readonly (string | Node)[] = [],
): HTMLElementTagNameMap[Tag] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (typeof value === "function") {
      node.addEventListener(key.replace(/^on/, ""), value);
      continue;
    }
    if (key === "className") {
      node.className = value;
      continue;
    }
    node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}

const el: ElementFactory = createTestElement;

const LONG_TEXT = "虚拟文件往返测试。".repeat(200);

interface VirtualFileFixture {
  files: VirtualFileUtils;
  textarea: HTMLTextAreaElement;
  /** Replaces the mounted composer, the way a route change does. */
  swapComposer: () => HTMLTextAreaElement;
}

function createFixture(): VirtualFileFixture {
  const container = document.createElement("div");
  container.className = "composer";
  let current = document.createElement("textarea");
  container.append(current);
  document.body.append(container);

  const composer: ComposerUtils = {
    getChatInput: () => current,
    findSendControl: () => null,
    triggerSendButton: () => false,
    fallbackKeyboardSubmit: () => false,
    isSendLikeButton: () => false,
    getInputContainer: () => container,
    getComposerVisualBounds: () => {
      const rect = current.getBoundingClientRect();
      return { top: rect.top, left: rect.left, right: rect.right, width: rect.width };
    },
    insertTextAtomic: (input, text) => {
      if (input instanceof HTMLTextAreaElement) input.value = text;
    },
  };

  const state = createEngineState();
  state.virtualFileEnabled = true;
  const files = createVirtualFileUtils({
    el,
    withSelfMutation: (task) => task(),
    composer,
    state,
    isEngineDormant: () => false,
    updateHudDashboard: vi.fn(),
    suspendObservers: vi.fn(),
  });

  const swapComposer = (): HTMLTextAreaElement => {
    const next = document.createElement("textarea");
    container.replaceChildren(next);
    current = next;
    return next;
  };

  return {
    files,
    get textarea() {
      return current;
    },
    swapComposer,
  };
}

function tray(): HTMLElement | null {
  return document.getElementById("ai-turbo-vf-tray");
}

let fixture: VirtualFileFixture;

beforeEach(() => {
  document.body.replaceChildren();
  fixture = createFixture();
});

afterEach(() => {
  fixture.files.stopTracking();
  document.body.replaceChildren();
});

describe("virtual file tray conversion", () => {
  it("ignores a short typed message", () => {
    fixture.textarea.value = "short";
    fixture.files.handleComposerInput(fixture.textarea);
    expect(tray()).toBeNull();
  });

  it("offers conversion once the composer crosses the threshold", () => {
    expect(LONG_TEXT.length).toBeGreaterThan(VIRTUAL_FILE_THRESHOLD);
    fixture.textarea.value = LONG_TEXT;
    fixture.files.handleComposerInput(fixture.textarea);

    expect(tray()).not.toBeNull();
    expect(tray()?.textContent).toContain("文本转文件");
    expect(document.querySelector(".ai-turbo-vf-pill")).toBeNull();
  });

  it("moves long composer text into a file and can return it unchanged", () => {
    fixture.textarea.value = LONG_TEXT;
    fixture.files.handleComposerInput(fixture.textarea);

    document
      .querySelector<HTMLButtonElement>(".ai-turbo-vf-convert-composer")
      ?.click();

    expect(fixture.files.activeFileCount()).toBe(1);
    expect(fixture.textarea.value).toBe("");
    expect(
      document.querySelector(".ai-turbo-vf-name")?.textContent,
    ).toContain("composer_text_");

    document
      .querySelector<HTMLButtonElement>(".ai-turbo-vf-action-convert")
      ?.click();

    expect(fixture.files.activeFileCount()).toBe(0);
    expect(fixture.textarea.value).toBe(LONG_TEXT.trim());
    expect(document.querySelector(".ai-turbo-vf-pill")).toBeNull();
  });

  it("leaves no conversion prompt behind after returning a file to text", () => {
    fixture.textarea.value = LONG_TEXT;
    fixture.files.handleComposerInput(fixture.textarea);
    document
      .querySelector<HTMLButtonElement>(".ai-turbo-vf-convert-composer")
      ?.click();
    document
      .querySelector<HTMLButtonElement>(".ai-turbo-vf-action-convert")
      ?.click();

    expect(tray()).toBeNull();

    // The host echoes the programmatic insertion with its own input event.
    fixture.files.handleComposerInput(fixture.textarea);
    expect(tray()).toBeNull();
  });

  it("offers conversion again once the restored text changes", () => {
    fixture.textarea.value = LONG_TEXT;
    fixture.files.handleComposerInput(fixture.textarea);
    document
      .querySelector<HTMLButtonElement>(".ai-turbo-vf-convert-composer")
      ?.click();
    document
      .querySelector<HTMLButtonElement>(".ai-turbo-vf-action-convert")
      ?.click();
    expect(tray()).toBeNull();

    fixture.textarea.value = `${LONG_TEXT}继续写`;
    fixture.files.handleComposerInput(fixture.textarea);

    expect(tray()).not.toBeNull();
    expect(tray()?.textContent).toContain("文本转文件");
  });

  it("keeps a dismissed conversion prompt closed until the text changes", () => {
    fixture.textarea.value = LONG_TEXT;
    fixture.files.handleComposerInput(fixture.textarea);

    const dismiss = document.querySelector<HTMLButtonElement>(
      ".ai-turbo-vf-dismiss-conversion",
    );
    expect(dismiss).not.toBeNull();
    dismiss?.click();
    expect(tray()).toBeNull();

    fixture.files.handleComposerInput(fixture.textarea);
    expect(tray()).toBeNull();

    fixture.textarea.value = `${LONG_TEXT}再改一次`;
    fixture.files.handleComposerInput(fixture.textarea);
    expect(tray()).not.toBeNull();
  });

  it("clears the tray when the pending files are sent", () => {
    fixture.textarea.value = LONG_TEXT;
    fixture.files.handleComposerInput(fixture.textarea);
    document
      .querySelector<HTMLButtonElement>(".ai-turbo-vf-convert-composer")
      ?.click();
    expect(tray()).not.toBeNull();

    expect(fixture.files.fuseAndSubmit(fixture.textarea)).toBe(true);
    expect(fixture.files.activeFileCount()).toBe(0);
    expect(tray()).toBeNull();

    fixture.files.handleComposerInput(fixture.textarea);
    expect(tray()).toBeNull();
  });

  it("removes the whole tray when a conversion prompt is dismissed", () => {
    fixture.textarea.value = LONG_TEXT;
    fixture.files.handleComposerInput(fixture.textarea);
    expect(document.querySelector(".ai-turbo-vf-list")).toBeNull();

    document
      .querySelector<HTMLButtonElement>(".ai-turbo-vf-dismiss-conversion")
      ?.click();

    expect(tray()).toBeNull();
    expect(fixture.files.isTrayDirty()).toBe(false);
  });

  it("positions a prompt-only tray instead of leaving it hidden", async () => {
    // jsdom never lays out nodes, so the tray needs a composer with a box.
    fixture.textarea.getBoundingClientRect = () =>
      ({ top: 500, left: 40, width: 720, height: 120 }) as DOMRect;

    fixture.textarea.value = LONG_TEXT;
    fixture.files.handleComposerInput(fixture.textarea);
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(tray()?.classList.contains("is-positioned")).toBe(true);
    expect(document.querySelector(".ai-turbo-vf-list")).toBeNull();
  });

  it("avoids native attachment previews when the composer lifts upward", async () => {
    fixture.textarea.getBoundingClientRect = () =>
      ({ top: 500, left: 40, width: 720, height: 120 }) as DOMRect;

    const composer = fixture.textarea.closest(".composer");
    if (!(composer instanceof HTMLElement)) throw new Error("missing composer");
    composer.getBoundingClientRect = () =>
      ({ top: 360, left: 40, width: 720, height: 260 }) as DOMRect;

    fixture.textarea.value = LONG_TEXT;
    fixture.files.handleComposerInput(fixture.textarea);
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(tray()?.style.bottom).toBe("424px");
    expect(tray()?.style.maxHeight).toBe("326px");
  });

  it("drops a prompt-only tray when a route swap leaves an empty composer", async () => {
    fixture.textarea.value = LONG_TEXT;
    fixture.files.handleComposerInput(fixture.textarea);
    expect(tray()).not.toBeNull();

    fixture.textarea.value = "";
    await new Promise((resolve) => setTimeout(resolve, 160));

    expect(tray()).toBeNull();
  });

  it("drops a prompt-only tray when a send clears the composer silently", async () => {
    // A painted composer keeps the cached node usable, which is exactly the
    // path a send takes: the host empties the box without any input event.
    fixture.textarea.getBoundingClientRect = () =>
      ({ top: 500, left: 40, width: 720, height: 120 }) as DOMRect;
    fixture.textarea.getClientRects = () =>
      [fixture.textarea.getBoundingClientRect()] as unknown as DOMRectList;

    fixture.textarea.value = LONG_TEXT;
    fixture.files.handleComposerInput(fixture.textarea);
    expect(tray()).not.toBeNull();

    fixture.textarea.value = "";
    await new Promise((resolve) => setTimeout(resolve, 160));

    expect(tray()).toBeNull();
    expect(fixture.files.isTrayDirty()).toBe(false);
  });

  it("keeps the conversion offer while the long text stays put", async () => {
    fixture.textarea.getBoundingClientRect = () =>
      ({ top: 500, left: 40, width: 720, height: 120 }) as DOMRect;
    fixture.textarea.getClientRects = () =>
      [fixture.textarea.getBoundingClientRect()] as unknown as DOMRectList;

    fixture.textarea.value = LONG_TEXT;
    fixture.files.handleComposerInput(fixture.textarea);
    await new Promise((resolve) => setTimeout(resolve, 160));

    expect(tray()).not.toBeNull();
  });

  it("drops the tray when the host swaps in a fresh empty composer", async () => {
    fixture.textarea.value = LONG_TEXT;
    fixture.files.handleComposerInput(fixture.textarea);
    expect(tray()).not.toBeNull();

    const next = fixture.swapComposer();
    await new Promise((resolve) => setTimeout(resolve, 160));

    expect(next.value).toBe("");
    expect(tray()).toBeNull();
    expect(fixture.files.isTrayDirty()).toBe(false);
  });

  it("removes the tray again when the composer text becomes short", () => {
    fixture.textarea.value = LONG_TEXT;
    fixture.files.handleComposerInput(fixture.textarea);
    expect(tray()).not.toBeNull();

    fixture.textarea.value = "短";
    fixture.files.handleComposerInput(fixture.textarea);
    expect(tray()).toBeNull();
  });
});
