// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findNewChatControl,
  handleNewChatShortcut,
} from "../scripts/ai-chat-turbo-engine/src/core/new-chat";

interface FakePage {
  document: Document;
  location: {
    hostname: string;
    pathname: string;
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

function createPage(href = "https://chat.deepseek.com/a/chat"): FakePage {
  const url = new URL(href);
  return {
    document,
    location: {
      hostname: url.hostname,
      pathname: url.pathname,
      origin: url.origin,
      href,
      assign: vi.fn<(url: string) => void>(),
    },
  };
}

function shortcutEvent(
  init: KeyboardEventInit = {},
): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key: "o",
    code: "KeyO",
    ctrlKey: true,
    shiftKey: true,
    bubbles: true,
    cancelable: true,
    ...init,
  });
}

function press(page: FakePage, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = shortcutEvent(init);
  handleNewChatShortcut(event, page);
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
  it("takes over the combination on platforms that also bind it", () => {
    const control = addControl({
      "aria-label": "New chat",
      "aria-keyshortcuts": "Control+Shift+O",
    });
    const click = vi.spyOn(control, "click");
    const page = createPage("https://chatgpt.com/c/1");
    const hostListener = vi.fn(() => control.click());
    const event = shortcutEvent({ key: "O", code: "" });
    window.addEventListener("keydown", (incoming) => {
      handleNewChatShortcut(incoming, page);
    }, { capture: true, once: true });
    document.addEventListener("keydown", hostListener, true);
    try {
      control.dispatchEvent(event);
    } finally {
      document.removeEventListener("keydown", hostListener, true);
    }

    expect(event.defaultPrevented).toBe(true);
    expect(hostListener).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledTimes(1);
    expect(page.location.assign).not.toHaveBeenCalled();
  });

  it("uses the platform path when a native site's control is absent", () => {
    const page = createPage("https://gemini.google.com/app/chat");
    const event = press(page);

    expect(event.defaultPrevented).toBe(true);
    expect(page.location.assign).toHaveBeenCalledWith("https://gemini.google.com/app");
  });

  it("clicks the site control once and stops the event", () => {
    const control = addControl({ "aria-label": "New chat" });
    const click = vi.spyOn(control, "click");
    const page = createPage();

    const event = press(page);

    expect(event.defaultPrevented).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
    expect(page.location.assign).not.toHaveBeenCalled();
  });

  it("still cancels the event while the key is held down", () => {
    const control = addControl({ "aria-label": "New chat" });
    const click = vi.spyOn(control, "click");
    const page = createPage();

    const event = press(page, { repeat: true });

    expect(event.defaultPrevented).toBe(true);
    expect(click).not.toHaveBeenCalled();
  });

  it("claims the keys even when the site declares them itself", () => {
    const control = addControl({
      "aria-label": "New chat",
      "aria-keyshortcuts": "Control+Shift+O",
    });
    const click = vi.spyOn(control, "click");
    const page = createPage("https://www.perplexity.ai/search/thread");

    const event = press(page);

    expect(event.defaultPrevented).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("navigates to the blank conversation when no control is rendered", () => {
    const page = createPage("https://poe.com/chat/abc");

    press(page);

    expect(page.location.assign).toHaveBeenCalledWith("https://poe.com/");
  });

  it("uses the shared-host prefix for Grok inside X", () => {
    const page = createPage("https://x.com/i/grok/chat/1");

    press(page);

    expect(page.location.assign).toHaveBeenCalledWith(
      "https://x.com/i/grok",
    );
  });

  it.each(["https://x.com/home", "https://chatgpt.com/auth/login"])(
    "leaves Ctrl+Shift+O alone on %s",
    (href) => {
      const page = createPage(href);
      const event = press(page);

      expect(event.defaultPrevented).toBe(false);
      expect(page.location.assign).not.toHaveBeenCalled();
    },
  );

  it("does not reload a page that already sits on the blank path", () => {
    const page = createPage("https://poe.com/");

    const event = press(page);

    expect(event.defaultPrevented).toBe(true);
    expect(page.location.assign).not.toHaveBeenCalled();
  });

  it("keeps the browser bookmark manager out on a native blank page", () => {
    const page = createPage("https://chatgpt.com/");

    const event = press(page);

    expect(event.defaultPrevented).toBe(true);
    expect(page.location.assign).not.toHaveBeenCalled();
  });

  it("ignores other modifiers, other keys and composing input", () => {
    addControl({ "aria-label": "New chat" });
    const page = createPage();

    expect(press(page, { altKey: true }).defaultPrevented)
      .toBe(false);
    expect(press(page, { metaKey: true }).defaultPrevented)
      .toBe(false);
    expect(press(page, { shiftKey: false }).defaultPrevented)
      .toBe(false);
    expect(press(page, { key: "p", code: "KeyP" }).defaultPrevented)
      .toBe(false);
    expect(press(page, { isComposing: true }).defaultPrevented)
      .toBe(false);
  });

  it("leaves an already handled event untouched", () => {
    const control = addControl({ "aria-label": "New chat" });
    const click = vi.spyOn(control, "click");
    const page = createPage();
    const event = shortcutEvent();
    event.preventDefault();

    handleNewChatShortcut(event, page);

    expect(click).not.toHaveBeenCalled();
    expect(page.location.assign).not.toHaveBeenCalled();
  });
});
