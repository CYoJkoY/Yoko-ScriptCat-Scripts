// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLATFORMS, type PlatformDefinition } from "../scripts/ai-chat-turbo-engine/src/config";
import {
  findNewChatControl,
  handleNewChatShortcut,
} from "../scripts/ai-chat-turbo-engine/src/core/new-chat";

interface FakePage {
  document: Document;
  location: {
    hostname: string;
    origin: string;
    href: string;
    assign: (url: string) => void;
  };
}

/** jsdom never lays out nodes, so the visibility probe needs a rect. */
function markRendered<T extends HTMLElement>(node: T): T {
  node.getClientRects = (() => ({ length: 1 })) as unknown as typeof node.getClientRects;
  return node;
}

function createPage(
  platform: PlatformDefinition,
  href = "https://chat.deepseek.com/a/chat",
): FakePage {
  const url = new URL(href);
  return {
    document,
    location: {
      hostname: url.hostname,
      origin: url.origin,
      href,
      assign: vi.fn<(url: string) => void>(),
    },
  };
}

function press(
  page: FakePage,
  platform: PlatformDefinition,
  init: KeyboardEventInit = {},
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: "o",
    code: "KeyO",
    ctrlKey: true,
    shiftKey: true,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  handleNewChatShortcut(event, platform, page as unknown as Window);
  return event;
}

function addControl(attrs: Record<string, string>, text = ""): HTMLButtonElement {
  const button = document.createElement("button");
  for (const [key, value] of Object.entries(attrs)) button.setAttribute(key, value);
  button.textContent = text;
  document.body.append(button);
  return markRendered(button);
}

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("findNewChatControl", () => {
  it("finds the platform test id and the localized label", () => {
    addControl({ "data-testid": "create-new-chat-button" });
    expect(findNewChatControl(document)?.dataset["testid"]).toBe(
      "create-new-chat-button",
    );

    document.body.replaceChildren();
    addControl({ "aria-label": "新建对话" });
    expect(findNewChatControl(document)?.getAttribute("aria-label")).toBe(
      "新建对话",
    );
  });

  it("falls back to an exact visible label", () => {
    addControl({}, "New chat");
    expect(findNewChatControl(document)?.textContent).toBe("New chat");
  });

  it("skips hidden, disabled and blank-target controls", () => {
    const hidden = addControl({ "aria-label": "New chat" });
    hidden.setAttribute("hidden", "");
    const disabled = addControl({ "aria-label": "新建对话" });
    disabled.setAttribute("disabled", "");
    addControl({ "aria-label": "New chat", target: "_blank" });

    expect(findNewChatControl(document)).toBeNull();
  });
});

describe("handleNewChatShortcut", () => {
  it("does nothing on platforms that already bind the combination", () => {
    const control = addControl({ "aria-label": "New chat" });
    const click = vi.spyOn(control, "click");
    const page = createPage(PLATFORMS.chatgpt, "https://chatgpt.com/c/1");

    const event = press(page, PLATFORMS.chatgpt);

    expect(event.defaultPrevented).toBe(false);
    expect(click).not.toHaveBeenCalled();
    expect(page.location.assign).not.toHaveBeenCalled();
  });

  it("clicks the site control once and stops the event", () => {
    const control = addControl({ "aria-label": "New chat" });
    const click = vi.spyOn(control, "click");
    const page = createPage(PLATFORMS.deepseek);

    const event = press(page, PLATFORMS.deepseek);

    expect(event.defaultPrevented).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
    expect(page.location.assign).not.toHaveBeenCalled();
  });

  it("still cancels the event while the key is held down", () => {
    const control = addControl({ "aria-label": "New chat" });
    const click = vi.spyOn(control, "click");
    const page = createPage(PLATFORMS.deepseek);

    const event = press(page, PLATFORMS.deepseek, { repeat: true });

    expect(event.defaultPrevented).toBe(true);
    expect(click).not.toHaveBeenCalled();
  });

  it("leaves the keys alone when the site declares them itself", () => {
    const control = addControl({
      "aria-label": "New chat",
      "aria-keyshortcuts": "Control+Shift+O",
    });
    const click = vi.spyOn(control, "click");
    const page = createPage(PLATFORMS.perplexity);

    const event = press(page, PLATFORMS.perplexity);

    expect(event.defaultPrevented).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });

  it("navigates to the blank conversation when no control is rendered", () => {
    const page = createPage(PLATFORMS.poe, "https://poe.com/chat/abc");

    press(page, PLATFORMS.poe);

    expect(page.location.assign).toHaveBeenCalledWith("https://poe.com/");
  });

  it("uses the shared-host prefix for Grok inside X", () => {
    const page = createPage(PLATFORMS.grok, "https://x.com/i/grok/chat/1");

    press(page, PLATFORMS.grok);

    expect(page.location.assign).toHaveBeenCalledWith(
      "https://x.com/i/grok",
    );
  });

  it("does not reload a page that already sits on the blank path", () => {
    const page = createPage(PLATFORMS.poe, "https://poe.com/");

    const event = press(page, PLATFORMS.poe);

    expect(event.defaultPrevented).toBe(false);
    expect(page.location.assign).not.toHaveBeenCalled();
  });

  it("ignores other modifiers, other keys and composing input", () => {
    addControl({ "aria-label": "New chat" });
    const page = createPage(PLATFORMS.deepseek);

    expect(press(page, PLATFORMS.deepseek, { altKey: true }).defaultPrevented)
      .toBe(false);
    expect(press(page, PLATFORMS.deepseek, { metaKey: true }).defaultPrevented)
      .toBe(false);
    expect(press(page, PLATFORMS.deepseek, { shiftKey: false }).defaultPrevented)
      .toBe(false);
    expect(press(page, PLATFORMS.deepseek, { key: "p", code: "KeyP" }).defaultPrevented)
      .toBe(false);
    expect(press(page, PLATFORMS.deepseek, { isComposing: true }).defaultPrevented)
      .toBe(false);
  });

  it("leaves an already handled event untouched", () => {
    addControl({ "aria-label": "New chat" });
    const page = createPage(PLATFORMS.deepseek);
    const event = new KeyboardEvent("keydown", {
      key: "o",
      code: "KeyO",
      ctrlKey: true,
      shiftKey: true,
      cancelable: true,
    });
    event.preventDefault();

    handleNewChatShortcut(event, PLATFORMS.deepseek, page as unknown as Window);

    expect(page.location.assign).not.toHaveBeenCalled();
  });
});
