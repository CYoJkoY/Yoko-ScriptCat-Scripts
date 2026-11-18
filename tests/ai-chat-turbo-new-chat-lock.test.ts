// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNewChatLockUtils } from "../scripts/ai-chat-turbo-engine/src/core/new-chat-lock";

interface TestKeyboard {
  lock: ReturnType<typeof vi.fn<(keyCodes: string[]) => Promise<void>>>;
  unlock: ReturnType<typeof vi.fn<() => void>>;
}

interface FullscreenFixture {
  keyboard: TestKeyboard;
  requestFullscreen: ReturnType<typeof vi.fn<() => Promise<void>>>;
  exitFullscreen: ReturnType<typeof vi.fn<() => Promise<void>>>;
  setFullscreen(active: boolean): void;
}

function createFullscreenFixture(): FullscreenFixture {
  let fullscreenElement: Element | null = null;
  const setFullscreen = (active: boolean): void => {
    fullscreenElement = active ? document.documentElement : null;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
    document.dispatchEvent(new Event("fullscreenchange"));
  };
  Object.defineProperty(document, "fullscreenEnabled", {
    configurable: true,
    value: true,
  });
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => fullscreenElement,
  });
  const requestFullscreen = vi.fn(async () => setFullscreen(true));
  const exitFullscreen = vi.fn(async () => setFullscreen(false));
  Object.defineProperty(document.documentElement, "requestFullscreen", {
    configurable: true,
    value: requestFullscreen,
  });
  Object.defineProperty(document, "exitFullscreen", {
    configurable: true,
    value: exitFullscreen,
  });
  const keyboard: TestKeyboard = {
    lock: vi.fn(async () => undefined),
    unlock: vi.fn(),
  };
  return { keyboard, requestFullscreen, exitFullscreen, setFullscreen };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createNewChatLockUtils", () => {
  it("locks only KeyO after entering fullscreen and exits on deactivation", async () => {
    const fixture = createFullscreenFixture();
    const lock = createNewChatLockUtils({
      doc: document,
      keyboard: fixture.keyboard,
    });

    await lock.toggle();

    expect(fixture.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(fixture.keyboard.lock).toHaveBeenCalledWith(["KeyO"]);
    expect(lock.isActive()).toBe(true);
    expect(lock.isSupported()).toBe(true);

    lock.deactivate();

    expect(fixture.keyboard.unlock).toHaveBeenCalledTimes(1);
    expect(fixture.exitFullscreen).toHaveBeenCalledTimes(1);
    expect(lock.getSnapshot().status).toBe("inactive");
    lock.dispose();
  });

  it("releases the lock when fullscreen exits outside the controller", async () => {
    const fixture = createFullscreenFixture();
    const lock = createNewChatLockUtils({
      doc: document,
      keyboard: fixture.keyboard,
    });
    await lock.toggle();

    fixture.setFullscreen(false);

    expect(fixture.keyboard.unlock).toHaveBeenCalledTimes(1);
    expect(lock.getSnapshot().status).toBe("inactive");
    lock.dispose();
  });

  it("releases the lock on page hide", async () => {
    const fixture = createFullscreenFixture();
    const lock = createNewChatLockUtils({
      doc: document,
      keyboard: fixture.keyboard,
    });
    await lock.toggle();

    window.dispatchEvent(new Event("pagehide"));

    expect(fixture.keyboard.unlock).toHaveBeenCalledTimes(1);
    expect(lock.isActive()).toBe(false);
    lock.dispose();
  });

  it("reports unsupported when fullscreen or keyboard lock is unavailable", () => {
    Object.defineProperty(document, "fullscreenEnabled", {
      configurable: true,
      value: false,
    });
    const lock = createNewChatLockUtils({ doc: document, keyboard: null });

    expect(lock.getSnapshot().status).toBe("unsupported");
    expect(lock.isSupported()).toBe(false);
    void lock.toggle();
    expect(lock.getSnapshot().status).toBe("unsupported");
    lock.dispose();
  });

  it("restores inactive state if fullscreen entry fails", async () => {
    const fixture = createFullscreenFixture();
    fixture.requestFullscreen.mockRejectedValue(new Error("denied"));
    const lock = createNewChatLockUtils({
      doc: document,
      keyboard: fixture.keyboard,
    });

    await lock.toggle();

    expect(fixture.keyboard.lock).not.toHaveBeenCalled();
    expect(lock.getSnapshot()).toEqual({ status: "error", error: "denied" });
    lock.deactivate();
    expect(lock.getSnapshot()).toEqual({ status: "inactive", error: null });
    lock.dispose();
  });

  it("unlocks and leaves fullscreen when Keyboard Lock rejects", async () => {
    const fixture = createFullscreenFixture();
    fixture.keyboard.lock.mockRejectedValue(new Error("permission denied"));
    const lock = createNewChatLockUtils({
      doc: document,
      keyboard: fixture.keyboard,
    });

    await lock.toggle();

    expect(fixture.keyboard.unlock).toHaveBeenCalledTimes(1);
    expect(fixture.exitFullscreen).toHaveBeenCalledTimes(1);
    expect(lock.getSnapshot()).toEqual({
      status: "error",
      error: "permission denied",
    });
    lock.dispose();
  });

  it("releases a delayed lock if takeover is cancelled while it is pending", async () => {
    const fixture = createFullscreenFixture();
    const resolveLock: Array<() => void> = [];
    fixture.keyboard.lock.mockImplementation(
      () => new Promise<void>((resolve) => resolveLock.push(resolve)),
    );
    const lock = createNewChatLockUtils({
      doc: document,
      keyboard: fixture.keyboard,
    });
    const activation = lock.toggle();
    await Promise.resolve();
    await Promise.resolve();

    expect(fixture.keyboard.lock).toHaveBeenCalledTimes(1);
    lock.deactivate();
    resolveLock[0]?.();
    await activation;

    expect(fixture.keyboard.unlock).toHaveBeenCalledTimes(1);
    expect(fixture.exitFullscreen).toHaveBeenCalledTimes(1);
    expect(lock.getSnapshot().status).toBe("inactive");
    lock.dispose();
  });

  it("does not exit fullscreen that was already active before takeover", async () => {
    const fixture = createFullscreenFixture();
    fixture.setFullscreen(true);
    fixture.exitFullscreen.mockClear();
    const lock = createNewChatLockUtils({
      doc: document,
      keyboard: fixture.keyboard,
    });

    await lock.toggle();
    lock.deactivate();

    expect(fixture.requestFullscreen).not.toHaveBeenCalled();
    expect(fixture.exitFullscreen).not.toHaveBeenCalled();
    expect(fixture.keyboard.unlock).toHaveBeenCalledTimes(1);
    lock.dispose();
  });
});
