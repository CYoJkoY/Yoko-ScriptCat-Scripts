// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  QUIET_WINDOW_MS,
  createMotionQuiet,
} from "../scripts/ai-chat-turbo-engine/src/core/motion-quiet";

beforeEach(() => {
  vi.useFakeTimers();
  document.body.replaceChildren();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

function dispatchTransitionRun(target: Element): void {
  // transition events do not bubble; the listener has to sit in capture.
  target.dispatchEvent(new Event("transitionrun", { bubbles: false }));
}

function dispatchClick(target: Element): void {
  target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

describe("motion quiet window", () => {
  it("defers for the whole window and reports one close", () => {
    const onQuietEnd = vi.fn();
    const quiet = createMotionQuiet({ onQuietEnd });

    expect(quiet.isQuiet()).toBe(false);
    quiet.start();
    expect(quiet.isQuiet()).toBe(true);

    vi.advanceTimersByTime(QUIET_WINDOW_MS - 1);
    expect(quiet.isQuiet()).toBe(true);
    expect(onQuietEnd).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(quiet.isQuiet()).toBe(false);
    expect(onQuietEnd).toHaveBeenCalledTimes(1);

    quiet.teardown();
  });

  it("extends the deadline instead of stacking windows", () => {
    const onQuietEnd = vi.fn();
    const quiet = createMotionQuiet({ onQuietEnd });

    quiet.start(200);
    vi.advanceTimersByTime(150);
    quiet.start(200);
    vi.advanceTimersByTime(150);
    expect(quiet.isQuiet()).toBe(true);

    vi.advanceTimersByTime(50);
    expect(quiet.isQuiet()).toBe(false);
    expect(onQuietEnd).toHaveBeenCalledTimes(1);

    quiet.teardown();
  });

  it("starts on sidebar transitions and on toggle clicks only", () => {
    const quiet = createMotionQuiet({ durationMs: 100 });
    quiet.bind(document);

    const content = document.createElement("div");
    document.body.append(content);
    dispatchTransitionRun(content);
    expect(quiet.isQuiet()).toBe(false);

    const sidenav = document.createElement("bard-sidenav");
    document.body.append(sidenav);
    dispatchTransitionRun(sidenav);
    expect(quiet.isQuiet()).toBe(true);

    vi.advanceTimersByTime(100);
    expect(quiet.isQuiet()).toBe(false);

    const plainButton = document.createElement("button");
    document.body.append(plainButton);
    dispatchClick(plainButton);
    expect(quiet.isQuiet()).toBe(false);

    const toggle = document.createElement("button");
    toggle.setAttribute("data-test-id", "side-nav-menu-button");
    document.body.append(toggle);
    dispatchClick(toggle);
    expect(quiet.isQuiet()).toBe(true);

    quiet.teardown();
  });

  it("stops watching after teardown", () => {
    const quiet = createMotionQuiet({ durationMs: 100 });
    quiet.bind(document);
    const sidenav = document.createElement("bard-sidenav");
    document.body.append(sidenav);

    dispatchTransitionRun(sidenav);
    expect(quiet.isQuiet()).toBe(true);

    quiet.teardown();
    expect(quiet.isQuiet()).toBe(false);

    dispatchTransitionRun(sidenav);
    expect(quiet.isQuiet()).toBe(false);
  });

  it("keeps subscribers across windows until they unsubscribe", () => {
    const quiet = createMotionQuiet({ durationMs: 50 });
    const listener = vi.fn();
    const unsubscribe = quiet.onQuietEnd(listener);

    quiet.start();
    vi.advanceTimersByTime(50);
    expect(listener).toHaveBeenCalledTimes(1);

    quiet.start();
    vi.advanceTimersByTime(50);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    quiet.start();
    vi.advanceTimersByTime(50);
    expect(listener).toHaveBeenCalledTimes(2);

    quiet.teardown();
  });
});
