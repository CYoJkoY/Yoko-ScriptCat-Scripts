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
}

function createFixture(): VirtualFileFixture {
  const container = document.createElement("div");
  container.className = "composer";
  const textarea = document.createElement("textarea");
  container.append(textarea);
  document.body.append(container);

  const composer: ComposerUtils = {
    getChatInput: () => textarea,
    findSendControl: () => null,
    triggerSendButton: () => false,
    fallbackKeyboardSubmit: () => false,
    isSendLikeButton: () => false,
    getInputContainer: () => container,
    getComposerVisualBounds: () => ({ top: 0, left: 0, right: 0, width: 0 }),
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
  return { files, textarea };
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

  it("removes the tray again when the composer text becomes short", () => {
    fixture.textarea.value = LONG_TEXT;
    fixture.files.handleComposerInput(fixture.textarea);
    expect(tray()).not.toBeNull();

    fixture.textarea.value = "短";
    fixture.files.handleComposerInput(fixture.textarea);
    expect(tray()).toBeNull();
  });
});
