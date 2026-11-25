// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PLATFORMS,
  type PlatformDefinition,
} from "../scripts/ai-chat-turbo-engine/src/config";
import type { ComposerUtils } from "../scripts/ai-chat-turbo-engine/src/core/composer";
import {
  createSendInterceptUtils,
  type SendInterceptUtils,
} from "../scripts/ai-chat-turbo-engine/src/core/send";
import {
  createEngineState,
  type EngineState,
} from "../scripts/ai-chat-turbo-engine/src/state";

type KeyInit = KeyboardEventInit & { keyCode?: number };

interface FixtureOptions {
  platform?: PlatformDefinition;
  input?: HTMLElement;
  hasFiles?: boolean;
  virtualFileEnabled?: boolean;
}

interface SendFixture {
  input: HTMLElement;
  composer: ComposerUtils;
  state: EngineState;
  utils: SendInterceptUtils;
  fuseAndSubmit: ReturnType<typeof vi.fn<(input: HTMLElement) => boolean>>;
  resumeObservers: ReturnType<typeof vi.fn<() => void>>;
  isSubmitting: () => boolean;
  press(init?: KeyInit, target?: EventTarget): KeyboardEvent;
}

function createComposer(
  input: HTMLElement,
  sendButton: HTMLElement,
): {
  composer: ComposerUtils;
  findSendControl: ReturnType<typeof vi.fn>;
  triggerSendButton: ReturnType<typeof vi.fn>;
} {
  const findSendControl = vi.fn(() => sendButton);
  const triggerSendButton = vi.fn(() => true);
  const composer: ComposerUtils = {
    getChatInput: () => input,
    findSendControl,
    triggerSendButton,
    fallbackKeyboardSubmit: () => true,
    isSendLikeButton: () => true,
    getInputContainer: () => null,
    getComposerVisualBounds: () => ({
      top: 0,
      left: 0,
      right: 0,
      width: 0,
    }),
    insertTextAtomic: () => {},
  };
  return { composer, findSendControl, triggerSendButton };
}

function createFixture(options: FixtureOptions = {}): SendFixture {
  const platform = options.platform ?? PLATFORMS.yuanbao;

  const input = options.input ?? document.createElement("textarea");
  if (!(options.input instanceof HTMLElement) && input instanceof HTMLTextAreaElement) {
    input.value = "hello";
  }
  if (!input.isConnected) document.body.append(input);

  const sendButton = document.createElement("button");
  sendButton.type = "button";
  document.body.append(sendButton);

  const { composer, findSendControl, triggerSendButton } = createComposer(
    input,
    sendButton,
  );

  const state = createEngineState();
  state.virtualFileEnabled = options.virtualFileEnabled ?? true;

  let submitting = false;
  const fuseAndSubmit = vi.fn<(input: HTMLElement) => boolean>(() => true);
  const resumeObservers = vi.fn<() => void>();

  const utils = createSendInterceptUtils({
    currentPlatform: platform,
    composer,
    state,
    isEngineDormant: () => false,
    fuseAndSubmit,
    resumeObservers,
    hasActiveFiles: () => options.hasFiles === true,
    isSubmitting: () => submitting,
    setSubmitting: (value: boolean) => {
      submitting = value;
    },
  });

  function press(init: KeyInit = {}, target: EventTarget = input): KeyboardEvent {
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
      ...init,
    });
    if (typeof init.keyCode === "number") {
      Object.defineProperty(event, "keyCode", { get: () => init.keyCode });
    }
    const handler = (received: Event): void => {
      utils.handleSendIntercept(received as KeyboardEvent);
    };
    target.addEventListener("keydown", handler);
    target.dispatchEvent(event);
    target.removeEventListener("keydown", handler);
    return event;
  }

  return {
    input,
    composer,
    state,
    utils,
    fuseAndSubmit,
    resumeObservers,
    isSubmitting: () => submitting,
    press,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("send intercept", () => {
  it("sends on a plain Enter where the platform opts in", () => {
    const fixture = createFixture();

    const event = fixture.press({ key: "Enter" });

    expect(event.defaultPrevented).toBe(true);
    expect(fixture.fuseAndSubmit).toHaveBeenCalledWith(fixture.input);
    expect(fixture.isSubmitting()).toBe(true);

    vi.advanceTimersByTime(50);
    expect(fixture.composer.findSendControl).toHaveBeenCalledWith(
      fixture.input,
    );
    expect(fixture.composer.triggerSendButton).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(300);
    expect(fixture.isSubmitting()).toBe(false);
    expect(fixture.resumeObservers).toHaveBeenCalledTimes(1);
  });

  it("sends from a contenteditable composer", () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.textContent = "元宝，帮我看下这段代码";
    const fixture = createFixture({ input: editor });

    const event = fixture.press({ key: "Enter" });

    expect(event.defaultPrevented).toBe(true);
    expect(fixture.fuseAndSubmit).toHaveBeenCalledWith(editor);
    vi.advanceTimersByTime(50);
    expect(fixture.composer.triggerSendButton).toHaveBeenCalledTimes(1);
  });

  it("keeps Shift+Enter for a soft newline", () => {
    const fixture = createFixture();

    const event = fixture.press({ key: "Enter", shiftKey: true });

    expect(event.defaultPrevented).toBe(false);
    expect(fixture.fuseAndSubmit).not.toHaveBeenCalled();
    expect(fixture.composer.findSendControl).not.toHaveBeenCalled();
    expect(fixture.isSubmitting()).toBe(false);
  });

  it("leaves modified Enter and other keys to the site", () => {
    const fixture = createFixture();

    for (const init of [
      { key: "Enter", ctrlKey: true },
      { key: "Enter", metaKey: true },
      { key: "Enter", altKey: true },
      { key: "a", code: "KeyA" },
    ] satisfies KeyInit[]) {
      const event = fixture.press(init);
      expect(event.defaultPrevented, JSON.stringify(init)).toBe(false);
    }
    expect(fixture.fuseAndSubmit).not.toHaveBeenCalled();
  });

  it("never swallows an input-method Enter", () => {
    const fixture = createFixture();

    expect(fixture.press({ key: "Enter", isComposing: true }).defaultPrevented)
      .toBe(false);
    expect(fixture.press({ key: "Enter", keyCode: 229 }).defaultPrevented)
      .toBe(false);
    expect(fixture.fuseAndSubmit).not.toHaveBeenCalled();
  });

  it("keeps the site's Enter on an empty composer", () => {
    const fixture = createFixture();
    (fixture.input as HTMLTextAreaElement).value = "   \n";

    const event = fixture.press({ key: "Enter" });

    expect(event.defaultPrevented).toBe(false);
    expect(fixture.fuseAndSubmit).not.toHaveBeenCalled();
  });

  it("treats a contenteditable holding only a <br> as empty", () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.append(document.createElement("br"));
    const fixture = createFixture({ input: editor });

    const event = fixture.press({ key: "Enter" });

    expect(event.defaultPrevented).toBe(false);
    expect(fixture.fuseAndSubmit).not.toHaveBeenCalled();
  });

  it("leaves Enter alone on platforms that do not opt in", () => {
    const fixture = createFixture({ platform: PLATFORMS.chatgpt });

    const event = fixture.press({ key: "Enter" });

    expect(event.defaultPrevented).toBe(false);
    expect(fixture.fuseAndSubmit).not.toHaveBeenCalled();
  });

  it("still fuses pending files on a platform without the Enter opt-in", () => {
    const fixture = createFixture({
      platform: PLATFORMS.chatgpt,
      hasFiles: true,
    });
    (fixture.input as HTMLTextAreaElement).value = "";

    const event = fixture.press({ key: "Enter" });

    expect(event.defaultPrevented).toBe(true);
    expect(fixture.fuseAndSubmit).toHaveBeenCalledWith(fixture.input);
    vi.advanceTimersByTime(50);
    expect(fixture.composer.triggerSendButton).toHaveBeenCalledTimes(1);
  });

  it("keeps the legacy combined Enter for pending files", () => {
    const fixture = createFixture({
      platform: PLATFORMS.chatgpt,
      hasFiles: true,
    });
    (fixture.input as HTMLTextAreaElement).value = "";

    const event = fixture.press({ key: "Enter", ctrlKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(fixture.fuseAndSubmit).toHaveBeenCalledWith(fixture.input);
  });

  it("ignores Enter that lands outside the composer", () => {
    const fixture = createFixture();
    const elsewhere = document.createElement("div");
    document.body.append(elsewhere);

    const event = fixture.press({ key: "Enter" }, elsewhere);

    expect(event.defaultPrevented).toBe(false);
    expect(fixture.fuseAndSubmit).not.toHaveBeenCalled();
  });

  it("keeps the consuming Enter from bubbling but lets Shift+Enter through", () => {
    const consumed = createFixture();
    let consumedSeen = false;
    const onConsumed = (): void => {
      consumedSeen = true;
    };
    window.addEventListener("keydown", onConsumed);
    consumed.press({ key: "Enter" });
    window.removeEventListener("keydown", onConsumed);
    expect(consumedSeen).toBe(false);

    const soft = createFixture();
    let softSeen = false;
    const onSoft = (): void => {
      softSeen = true;
    };
    window.addEventListener("keydown", onSoft);
    soft.press({ key: "Enter", shiftKey: true });
    window.removeEventListener("keydown", onSoft);
    expect(softSeen).toBe(true);
  });
});
