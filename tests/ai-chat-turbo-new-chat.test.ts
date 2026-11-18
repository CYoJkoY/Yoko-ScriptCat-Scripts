// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bindNewChatShortcut,
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

/**
 * Sites built with plain elements expose the action through `role="button"` and
 * an aria label only, so the control is not a `<button>` at all.
 */
function addRoleControl(
  attrs: Record<string, string>,
  text = "",
): HTMLDivElement {
  const control = document.createElement("div");
  control.setAttribute("role", "button");
  for (const [key, value] of Object.entries(attrs)) control.setAttribute(key, value);
  control.textContent = text;
  document.body.append(control);
  return markRendered(control);
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

  it("prefers the platform icon selector over same-class siblings", () => {
    // DeepSeek renders the new chat button with no accessible name, and the
    // search and history buttons beside it share its classes.
    const shared = 'class="ds-button ds-button--iconLabelPrimary" role="button"';
    const icon = (d: string): string => `<svg viewBox="0 0 16 16"><path d="${d}"></path></svg>`;
    document.body.innerHTML = [
      `<div ${shared}>${icon("M9.67272 0.522841")}</div>`,
      `<div ${shared}>${icon("M8 0.599609C3.91309")}</div>`,
      `<div ${shared}>${icon("M11.748 6.7028")}</div>`,
    ].join("");
    for (const node of document.querySelectorAll("div[role='button']")) {
      markRendered(node as HTMLElement);
    }

    const control = findNewChatControl(document, {
      hostname: "chat.deepseek.com",
    });
    expect(control?.querySelector("path")?.getAttribute("d")).toBe(
      "M8 0.599609C3.91309",
    );
  });

  it("ignores platform selectors on a different host", () => {
    const shared = 'class="ds-button ds-button--iconLabelPrimary" role="button"';
    document.body.innerHTML = [
      `<div ${shared}><svg viewBox="0 0 16 16"><path d="M8 0.599609C3.91309"></path></svg></div>`,
    ].join("");
    for (const node of document.querySelectorAll("div[role='button']")) {
      markRendered(node as HTMLElement);
    }

    expect(findNewChatControl(document, { hostname: "zchat.z.ai" })).toBeNull();
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

describe("reported hosts", () => {
  it("clicks the Z.ai new chat control on zchat.z.ai", () => {
    const control = addRoleControl({ "aria-label": "新对话" });
    const click = vi.spyOn(control, "click");
    const page = createPage("https://zchat.z.ai/c/abc");

    const event = press(page);

    expect(event.defaultPrevented).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
    expect(page.location.assign).not.toHaveBeenCalled();
  });

  it("falls back to the Z.ai blank route on both origins", () => {
    document.body.replaceChildren();
    const zchat = createPage("https://zchat.z.ai/c/abc");
    expect(press(zchat).defaultPrevented).toBe(true);
    expect(zchat.location.assign).toHaveBeenCalledWith("https://zchat.z.ai/");

    const zai = createPage("https://chat.z.ai/c/abc");
    expect(press(zai).defaultPrevented).toBe(true);
    expect(zai.location.assign).toHaveBeenCalledWith("https://chat.z.ai/");
  });

  it("clicks Yuanbao's role-only new chat entry", () => {
    const control = addRoleControl({ "aria-label": "新建对话" });
    const click = vi.spyOn(control, "click");
    const page = createPage(
      "https://yuanbao.tencent.com/chat/naQivTmsDa/0SA6GtG4MqG",
    );

    const event = press(page);

    expect(event.defaultPrevented).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
    expect(page.location.assign).not.toHaveBeenCalled();
  });

  it("falls back to Yuanbao's blank conversation route", () => {
    const page = createPage(
      "https://yuanbao.tencent.com/chat/naQivTmsDa/0SA6GtG4MqG",
    );

    press(page);

    expect(page.location.assign).toHaveBeenCalledWith(
      "https://yuanbao.tencent.com/chat/",
    );
  });

  it("falls back to DeepSeek's blank conversation route", () => {
    const page = createPage(
      "https://chat.deepseek.com/a/chat/s/9f1d6c6e-1b3f-4a51-8f2c-3d1f0a7b2c44",
    );

    press(page);

    expect(page.location.assign).toHaveBeenCalledWith(
      "https://chat.deepseek.com/",
    );
  });
});

describe("bindNewChatShortcut", () => {
  it("registers one page-lifetime listener and stops on unbind", () => {
    const control = addControl({ "aria-label": "New chat" });
    const click = vi.spyOn(control, "click");
    const page = createPage("https://chatgpt.com/c/1");
    const target = new EventTarget();

    const unbind = bindNewChatShortcut(target, page);
    const bound = shortcutEvent();
    target.dispatchEvent(bound);

    expect(bound.defaultPrevented).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);

    unbind();
    const afterUnbind = shortcutEvent();
    target.dispatchEvent(afterUnbind);

    expect(afterUnbind.defaultPrevented).toBe(false);
    expect(click).toHaveBeenCalledTimes(1);
  });
});
