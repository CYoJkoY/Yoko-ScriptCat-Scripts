// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createToolPopupScope } from "../scripts/ai-chat-turbo-engine/src/core/tool-scope";
import {
  createToolMemoryUtils,
  rowSelected,
} from "../scripts/ai-chat-turbo-engine/src/core/tool-memory";
import { createReasoningUtils } from "../scripts/ai-chat-turbo-engine/src/core/reasoning";
import { readToolRecord, writeToolRecord } from "../scripts/ai-chat-turbo-engine/src/storage/tool-memory";
import { readReasoningRecord } from "../scripts/ai-chat-turbo-engine/src/storage/reasoning-memory";
import { setEngineActive } from "../scripts/ai-chat-turbo-engine/src/core/auth";
import { createEngineState } from "../scripts/ai-chat-turbo-engine/src/state";
import type { ElementFactory } from "../scripts/ai-chat-turbo-engine/src/ui/code-blocks";

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
    if (key === "checked" && node instanceof HTMLInputElement) {
      node.checked = value === "checked";
      continue;
    }
    node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}

const el: ElementFactory = createTestElement;

/** Node 26 exposes localStorage but leaves it undefined; tests own the area. */
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
}

function visibleRect(): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 160,
    bottom: 40,
    width: 160,
    height: 40,
    toJSON: () => ({}),
  } as DOMRect;
}

function press(node: Element): MouseEvent {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  node.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(visibleRect);
  installMemoryStorage();
  window.localStorage.clear();
  setEngineActive(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
  window.localStorage.clear();
  setEngineActive(false);
});

interface ToolFixture {
  trigger: HTMLButtonElement;
  popup: HTMLElement;
  paintRow: HTMLElement;
  searchRow: HTMLElement;
}

function installToolMenu(): ToolFixture {
  const container = el("div", { "data-new-input-control": "add-tools" });
  const trigger = el("button", {
    "data-new-input-control": "add-tools-trigger",
    "aria-expanded": "false",
    "aria-controls": "yuanbao-tools-menu",
  }, ["添加工具"]);
  const paintRow = el("button", { role: "menuitemcheckbox", "aria-checked": "false" }, ["绘画"]);
  const searchRow = el("button", { role: "menuitemcheckbox", "aria-checked": "false" }, ["搜索"]);
  const popup = el("div", { id: "yuanbao-tools-menu", role: "menu" }, [paintRow, searchRow]);
  for (const row of [paintRow, searchRow]) {
    row.addEventListener("click", () => {
      row.setAttribute("aria-checked", row.getAttribute("aria-checked") === "true" ? "false" : "true");
    });
  }
  container.append(trigger);
  document.body.append(container, popup);
  return { trigger, popup, paintRow, searchRow };
}

describe("rowSelected", () => {
  it("reads explicit toggle attributes before class hints", () => {
    const row = el("button", { "aria-checked": "true" }, ["绘画"]);
    expect(rowSelected(row)).toBe(true);
    row.setAttribute("aria-checked", "false");
    expect(rowSelected(row)).toBe(false);
  });

  it("returns null when a row exposes no selection state", () => {
    const row = el("button", {}, ["普通按钮"]);
    expect(rowSelected(row)).toBeNull();
  });
});

describe("createToolPopupScope", () => {
  it("registers the popup named by aria-controls and owns its rows", () => {
    const fixture = installToolMenu();
    const scope = createToolPopupScope();
    const popup = scope.note(fixture.trigger, new Set<Element>());
    expect(popup).toBe(fixture.popup);
    expect(scope.active(fixture.trigger)).toBe(fixture.popup);
    expect(scope.isInside(fixture.paintRow)).toBe(true);
    expect(scope.isInside(document.body)).toBe(false);
  });

  it("does not claim unrelated menus as tool popups", () => {
    const foreign = el("div", { role: "menu" }, [el("button", {}, ["High"])]);
    document.body.append(foreign);
    const scope = createToolPopupScope();
    expect(scope.isInside(foreign.firstElementChild)).toBe(false);
  });

  it("skips popups that belong to the engine UI", () => {
    const shell = el("div", { className: "ai-turbo-code-bar" });
    const popup = el("div", { role: "menu" });
    shell.append(popup);
    document.body.append(shell);
    const scope = createToolPopupScope();
    expect(scope.snapshot().has(popup)).toBe(false);
  });
});

describe("tool selection memory", () => {
  it("records the full checked set after a row click", async () => {
    const fixture = installToolMenu();
    const state = createEngineState();
    const scope = createToolPopupScope();
    const toolMemory = createToolMemoryUtils({ el, state, toolScope: scope });
    window.addEventListener("click", toolMemory.handleToolClick, true);

    press(fixture.trigger);
    await vi.advanceTimersByTimeAsync(900);
    press(fixture.paintRow);
    await vi.advanceTimersByTimeAsync(250);

    expect(readToolRecord()?.selected).toEqual(["绘画"]);
    window.removeEventListener("click", toolMemory.handleToolClick, true);
    toolMemory.teardown();
  });

  it("drops a tool from the record when the user unchecks it", async () => {
    const fixture = installToolMenu();
    fixture.paintRow.setAttribute("aria-checked", "true");
    writeToolRecord({ key: "add-tools", controlLabel: "添加工具", selected: ["绘画"], ts: Date.now() });
    const state = createEngineState();
    const scope = createToolPopupScope();
    const toolMemory = createToolMemoryUtils({ el, state, toolScope: scope });
    window.addEventListener("click", toolMemory.handleToolClick, true);

    press(fixture.trigger);
    await vi.advanceTimersByTimeAsync(900);
    press(fixture.paintRow);
    await vi.advanceTimersByTimeAsync(250);

    expect(readToolRecord()?.selected).toEqual([]);
    window.removeEventListener("click", toolMemory.handleToolClick, true);
    toolMemory.teardown();
  });

  it("restores a saved row without reopening a popup that is already visible", async () => {
    const fixture = installToolMenu();
    const triggerClicks = vi.fn();
    fixture.trigger.addEventListener("click", triggerClicks);
    writeToolRecord({ key: "add-tools", controlLabel: "添加工具", selected: ["绘画"], ts: Date.now() });

    const state = createEngineState();
    const scope = createToolPopupScope();
    const toolMemory = createToolMemoryUtils({ el, state, toolScope: scope });
    const status = el("div", {});
    toolMemory.attachStatusNode(status);
    toolMemory.maybeRestore();
    await vi.advanceTimersByTimeAsync(600);

    expect(fixture.paintRow.getAttribute("aria-checked")).toBe("true");
    expect(fixture.searchRow.getAttribute("aria-checked")).toBe("false");
    expect(triggerClicks).not.toHaveBeenCalled();
    expect(status.textContent).toContain("已恢复 绘画");
    toolMemory.teardown();
  });
});

interface ReasoningFixture {
  button: HTMLButtonElement;
  clicks: ReturnType<typeof vi.fn>;
}

function installReasoningToggle(attrs: Record<string, string>): ReasoningFixture {
  const button = el("button", attrs, ["深度思考"]);
  const clicks = vi.fn();
  button.addEventListener("click", clicks);
  document.body.append(button);
  return { button, clicks };
}

function createReasoning(state = createEngineState()) {
  return createReasoningUtils({
    el,
    state,
    toolScope: createToolPopupScope(),
    withSelfMutation: <T>(task: () => T): T => task(),
    triggerSendButton: () => true,
    requestUpdate: () => undefined,
    markRestoredTurn: () => undefined,
    requestFullTurnSync: () => undefined,
  });
}

describe("reasoning toggle restore", () => {
  it("does not read popup open state as a toggle value", async () => {
    const fixture = installReasoningToggle({ "aria-expanded": "true", "data-state": "open" });
    const reasoning = createReasoning();
    reasoning.handleReasoningClick(press(fixture.button));
    await vi.advanceTimersByTimeAsync(0);
    expect(readReasoningRecord()).toBeNull();
    reasoning.clearReasoningRestoreTimer();
  });

  it("ignores data-state that only describes a closed popup", async () => {
    const fixture = installReasoningToggle({ "data-state": "closed" });
    const reasoning = createReasoning();
    reasoning.handleReasoningClick(press(fixture.button));
    await vi.advanceTimersByTimeAsync(0);
    expect(readReasoningRecord()).toBeNull();
    reasoning.clearReasoningRestoreTimer();
  });

  it("corrects a mismatched toggle once and stops retrying", async () => {
    const fixture = installReasoningToggle({ "aria-pressed": "false" });
    window.localStorage.setItem(
      "ai_turbo_reasoning_memory",
      JSON.stringify({ [location.hostname]: { mode: "toggle", label: "深度思考", on: true } }),
    );
    const reasoning = createReasoning();
    reasoning.applyReasoningMemory();
    expect(fixture.clicks).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    reasoning.applyReasoningMemory();
    reasoning.applyReasoningMemory();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fixture.clicks).toHaveBeenCalledTimes(1);
    reasoning.clearReasoningRestoreTimer();
  });
});
