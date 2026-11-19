// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bindNewChatShortcut,
  findNewChatControl,
  handleNewChatShortcut,
  isTakeoverGesture,
  NEW_CHAT_CONTROL_WAIT_MS,
} from "../scripts/ai-chat-turbo-engine/src/core/new-chat";
import {
  forgetTakeoverIntent,
  consumeTakeoverIntent,
  rememberTakeoverIntent,
} from "../scripts/ai-chat-turbo-engine/src/core/takeover-intent";
import { TAKEOVER_INTENT_STORAGE_KEY } from "../scripts/ai-chat-turbo-engine/src/config";

interface FakePage {
  document: Document;
  storage: Pick<Storage, "removeItem">;
  location: {
    hostname: string;
    pathname: string;
    origin: string;
    href: string;
    assign: (url: string) => void;
    reload: () => void;
  };
}

/** jsdom never lays out nodes, so the visibility probe needs a rect. */
function markRendered<T extends HTMLElement>(node: T): T {
  node.getClientRects = (() => ({ length: 1 })) as unknown as typeof node.getClientRects;
  return node;
}

/** jsdom exposes no storage area, so the draft reset needs its own memory one. */
function installMemoryStorage(): void {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length(): number {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
  Object.defineProperty(window, "localStorage", {
    value: storage,
    configurable: true,
  });
  Object.defineProperty(window, "sessionStorage", {
    value: storage,
    configurable: true,
  });
}

function createPage(href = "https://chat.deepseek.com/a/chat"): FakePage {
  const url = new URL(href);
  return {
    document,
    storage: window.localStorage,
    location: {
      hostname: url.hostname,
      pathname: url.pathname,
      origin: url.origin,
      href,
      assign: vi.fn<(url: string) => void>(),
      reload: vi.fn<() => void>(),
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

/** The same combination released, which is all a reserved key ever delivers. */
function shortcutRelease(
  init: KeyboardEventInit = {},
): KeyboardEvent {
  return new KeyboardEvent("keyup", {
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
  installMemoryStorage();
  window.localStorage.clear();
  forgetTakeoverIntent();
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

  it("finds the yuanbao entry behind a role-only markup", () => {
    document.body.innerHTML = [
      '<div class="yb-recent-conv-list__split">最近</div>',
      '<div class="yb-new-chat-entry__item" role="button" aria-label="新建对话" tabindex="0"></div>',
      '<div class="yb-ai-creation-entry__item" role="button" aria-label="AI 创作" tabindex="0"></div>',
    ].join("");
    const entry = document.querySelector(".yb-new-chat-entry__item") as HTMLElement;
    markRendered(entry);

    const control = findNewChatControl(document, {
      hostname: "yuanbao.tencent.com",
    });
    expect(control?.className).toBe("yb-new-chat-entry__item");
  });

  it("keeps the yuanbao entry out of reach on another host", () => {
    document.body.innerHTML =
      '<div class="yb-new-chat-entry__item" role="button"></div>';
    markRendered(
      document.querySelector(".yb-new-chat-entry__item") as HTMLElement,
    );

    expect(
      findNewChatControl(document, { hostname: "zchat.z.ai" }),
    ).toBeNull();
  });

  it("keeps a reused host id out of the shared list", () => {
    /*
     * Z.ai reuses ChatGPT's `#sidebar-new-chat-button` id for its Home
     * button. While the id sat in the shared selector list, the shortcut
     * found that button and navigated home instead of opening a
     * conversation, so the id is scoped to the ChatGPT platform and must
     * stay out of the shared list.
     */
    document.body.innerHTML =
 '<button id="sidebar-new-chat-button">主页</button>';
    markRendered(
      document.querySelector("#sidebar-new-chat-button") as HTMLElement,
    );

    expect(
      findNewChatControl(document, { hostname: "zchat.z.ai" }),
    ).toBeNull();
    expect(
      findNewChatControl(document, { hostname: "chat.z.ai" }),
    ).toBeNull();
    expect(
      findNewChatControl(document, { hostname: "chatgpt.com" }),
    ).not.toBeNull();
  });
});

describe("handleNewChatShortcut", () => {
  it("reports whether the press was satisfied inside the page", () => {
    const control = addControl({ "aria-label": "New chat" });

    expect(handleNewChatShortcut(shortcutEvent(), createPage())).toBe(true);

    control.remove();
    document.body.replaceChildren();
    expect(
      handleNewChatShortcut(
        shortcutEvent(),
        createPage("https://chat.deepseek.com/a/chat"),
      ),
    ).toBe(false);
  });

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
    expect(page.location.reload).not.toHaveBeenCalled();
  });

  it("keeps the browser bookmark manager out on a native blank page", () => {
    const page = createPage("https://chatgpt.com/");

    const event = press(page);

    expect(event.defaultPrevented).toBe(true);
    expect(page.location.assign).not.toHaveBeenCalled();
    expect(page.location.reload).not.toHaveBeenCalled();
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

  it("opens a new chat with the alternative combination", () => {
    const control = addControl({ "aria-label": "New chat" });
    const click = vi.spyOn(control, "click");
    const page = createPage();
    const event = shortcutEvent({ ctrlKey: false, altKey: true });

    expect(handleNewChatShortcut(event, page)).toBe(true);

    expect(event.defaultPrevented).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
    expect(page.location.assign).not.toHaveBeenCalled();
  });

  it("routes the alternative combination where no control renders", () => {
    const page = createPage("https://zchat.z.ai/c/abc");
    const event = shortcutEvent({ ctrlKey: false, altKey: true });

    handleNewChatShortcut(event, page);

    expect(event.defaultPrevented).toBe(true);
    expect(page.location.assign).toHaveBeenCalledWith("https://zchat.z.ai/");
  });

  it("keeps combinations that add Meta or both Ctrl and Alt out", () => {
    addControl({ "aria-label": "New chat" });
    const page = createPage();

    const withMeta = press(page, {
      ctrlKey: false,
      altKey: true,
      metaKey: true,
    });
    const withBoth = press(page, { ctrlKey: true, altKey: true });

    expect(withMeta.defaultPrevented).toBe(false);
    expect(withBoth.defaultPrevented).toBe(false);
    expect(page.location.assign).not.toHaveBeenCalled();
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

  it("waits for Yuanbao's entry before falling back to its blank route", () => {
    vi.useFakeTimers();
    try {
      const page = createPage(
        "https://yuanbao.tencent.com/chat/naQivTmsDa/0SA6GtG4MqG",
      );

      press(page);
      expect(page.location.assign).not.toHaveBeenCalled();

      vi.advanceTimersByTime(NEW_CHAT_CONTROL_WAIT_MS);
      expect(page.location.assign).toHaveBeenCalledWith(
        "https://yuanbao.tencent.com/chat/",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("clicks Yuanbao's entry when it mounts inside the wait window", () => {
    vi.useFakeTimers();
    try {
      const page = createPage(
        "https://yuanbao.tencent.com/chat/naQivTmsDa/0SA6GtG4MqG",
      );

      press(page);
      const control = addRoleControl({ "aria-label": "新建对话" });
      const click = vi.spyOn(control, "click");
      vi.advanceTimersByTime(NEW_CHAT_CONTROL_WAIT_MS);

      expect(click).toHaveBeenCalledTimes(1);
      expect(page.location.assign).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
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

  it("re-enters Z.ai's blank route and drops its stored draft", () => {
    document.body.replaceChildren();
    window.localStorage.setItem("chat-input-", '{"prompt":"draft"}');
    const page = createPage("https://zchat.z.ai/");

    const event = press(page);

    expect(event.defaultPrevented).toBe(true);
    expect(page.location.assign).not.toHaveBeenCalled();
    expect(page.location.reload).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem("chat-input-")).toBeNull();
    window.localStorage.clear();
  });

  it("re-enters DeepSeek's blank route to clear the in-memory draft", () => {
    document.body.replaceChildren();
    const page = createPage("https://chat.deepseek.com/");

    const event = press(page);

    expect(event.defaultPrevented).toBe(true);
    expect(page.location.assign).not.toHaveBeenCalled();
    expect(page.location.reload).toHaveBeenCalledTimes(1);
  });

  it("empties the rendered composer before dropping the stored draft", () => {
    document.body.replaceChildren();
    const textarea = document.createElement("textarea");
    textarea.value = "draft text";
    document.body.append(textarea);
    window.localStorage.setItem("chat-input-", '{"prompt":"draft text"}');
    const page = createPage("https://zchat.z.ai/");

    press(page);

    expect(textarea.value).toBe("");
    expect(window.localStorage.getItem("chat-input-")).toBeNull();
    expect(page.location.reload).toHaveBeenCalledTimes(1);
    window.localStorage.clear();
  });

  it("leaves an already empty composer untouched", () => {
    document.body.replaceChildren();
    const textarea = document.createElement("textarea");
    document.body.append(textarea);
    const dispatched = vi.fn();
    textarea.addEventListener("input", dispatched);
    window.localStorage.setItem("chat-input-", '{"prompt":""}');
    const page = createPage("https://zchat.z.ai/");

    press(page);

    expect(dispatched).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("chat-input-")).toBeNull();
    window.localStorage.clear();
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

  it("claims the keyup when the browser reserves the keydown", () => {
    const control = addControl({ "aria-label": "New chat" });
    const click = vi.spyOn(control, "click");
    const page = createPage("https://chatgpt.com/c/1");
    const target = new EventTarget();

    const unbind = bindNewChatShortcut(target, page);
    const release = shortcutRelease();
    target.dispatchEvent(release);

    expect(release.defaultPrevented).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);

    unbind();
  });

  it("does not fire the new chat twice when both events arrive", () => {
    const control = addControl({ "aria-label": "New chat" });
    const click = vi.spyOn(control, "click");
    const page = createPage("https://chatgpt.com/c/1");
    const target = new EventTarget();

    const unbind = bindNewChatShortcut(target, page);
    target.dispatchEvent(shortcutEvent());
    target.dispatchEvent(shortcutRelease());

    expect(click).toHaveBeenCalledTimes(1);

    unbind();
  });

  it("arms the deferred takeover when the press stayed in the page", () => {
    const control = addControl({ "aria-label": "新建对话" });
    const click = vi.spyOn(control, "click");
    const page = createPage(
      "https://yuanbao.tencent.com/chat/naQivTmsDa/0SA6GtG4MqG",
    );
    const target = new EventTarget();
    const armReservedKeyTakeover = vi.fn();
    const rememberTakeoverIntent = vi.fn();

    const unbind = bindNewChatShortcut(target, page, {
      armReservedKeyTakeover,
      rememberTakeoverIntent,
    });
    target.dispatchEvent(shortcutRelease());

    expect(click).toHaveBeenCalledTimes(1);
    expect(armReservedKeyTakeover).toHaveBeenCalledTimes(1);
    expect(rememberTakeoverIntent).toHaveBeenCalledTimes(1);

    unbind();
  });

  it("stays quiet when a keydown already opened the conversation", () => {
    addControl({ "aria-label": "New chat" });
    const page = createPage();
    const target = new EventTarget();
    const armReservedKeyTakeover = vi.fn();
    const rememberTakeoverIntent = vi.fn();

    const unbind = bindNewChatShortcut(target, page, {
      armReservedKeyTakeover,
      rememberTakeoverIntent,
    });
    target.dispatchEvent(shortcutEvent());
    target.dispatchEvent(shortcutRelease());

    expect(armReservedKeyTakeover).not.toHaveBeenCalled();
    expect(rememberTakeoverIntent).not.toHaveBeenCalled();

    unbind();
  });

  it("does not arm the takeover for the unreserved alternative", () => {
    const control = addControl({ "aria-label": "New chat" });
    const click = vi.spyOn(control, "click");
    const page = createPage("https://chatgpt.com/c/1");
    const target = new EventTarget();
    const armReservedKeyTakeover = vi.fn();
    const rememberTakeoverIntent = vi.fn();

    const unbind = bindNewChatShortcut(target, page, {
      armReservedKeyTakeover,
      rememberTakeoverIntent,
    });
    target.dispatchEvent(shortcutRelease({ ctrlKey: false, altKey: true }));

    expect(click).toHaveBeenCalledTimes(1);
    expect(armReservedKeyTakeover).not.toHaveBeenCalled();
    expect(rememberTakeoverIntent).not.toHaveBeenCalled();

    unbind();
  });

  it.each([
    "https://zchat.z.ai/c/abc",
    "https://chat.deepseek.com/a/chat/s/9f1d6c6e-1b3f-4a51-8f2c-3d1f0a7b2c44",
  ])(
    "does not report a fallback on a navigating host (%s)",
    (href) => {
      const page = createPage(href);
      const target = new EventTarget();
      const armReservedKeyTakeover = vi.fn();
      const rememberTakeoverIntent = vi.fn();

      const unbind = bindNewChatShortcut(target, page, {
        armReservedKeyTakeover,
        rememberTakeoverIntent,
      });
      target.dispatchEvent(shortcutRelease());

      expect(page.location.assign).toHaveBeenCalledTimes(1);
      expect(armReservedKeyTakeover).not.toHaveBeenCalled();
      expect(rememberTakeoverIntent).toHaveBeenCalledTimes(1);

      unbind();
    },
  );

  it("ignores the keyup when the letter was pressed first", () => {
    const control = addControl({ "aria-label": "New chat" });
    const click = vi.spyOn(control, "click");
    const page = createPage("https://chatgpt.com/c/1");
    const target = new EventTarget();

    const unbind = bindNewChatShortcut(target, page);
    target.dispatchEvent(shortcutEvent({ ctrlKey: false, shiftKey: false }));
    target.dispatchEvent(shortcutRelease());

    expect(click).not.toHaveBeenCalled();

    unbind();
  });
});

describe("isTakeoverGesture", () => {
  it("accepts a pointer press or an ordinary key press", () => {
    expect(isTakeoverGesture(new PointerEvent("pointerdown"))).toBe(true);
    expect(isTakeoverGesture(shortcutEvent())).toBe(true);
    expect(isTakeoverGesture(new KeyboardEvent("keydown", { key: "a" }))).toBe(
      true,
    );
  });

  it("rejects the release, which carries no user activation", () => {
    expect(isTakeoverGesture(shortcutRelease())).toBe(false);
  });

  it("rejects Escape so leaving the takeover fullscreen cannot re-enter it", () => {
    expect(isTakeoverGesture(new KeyboardEvent("keydown", { key: "Escape" }))).toBe(
      false,
    );
  });
});

describe("takeover intent", () => {
  it("persists once and consumes it exactly one time", () => {
    expect(rememberTakeoverIntent()).toBe(true);
    expect(
      window.sessionStorage.getItem(TAKEOVER_INTENT_STORAGE_KEY),
    ).not.toBeNull();

    expect(consumeTakeoverIntent()).toBe(true);
    expect(consumeTakeoverIntent()).toBe(false);
    expect(
      window.sessionStorage.getItem(TAKEOVER_INTENT_STORAGE_KEY),
    ).toBeNull();
  });

  it("rejects an intent older than one minute", () => {
    window.sessionStorage.setItem(
      TAKEOVER_INTENT_STORAGE_KEY,
      JSON.stringify({ createdAt: Date.now() - 61_000 }),
    );

    expect(consumeTakeoverIntent()).toBe(false);
    expect(
      window.sessionStorage.getItem(TAKEOVER_INTENT_STORAGE_KEY),
    ).toBeNull();
  });
});
