// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createToolPopupScope } from "../scripts/ai-chat-turbo-engine/src/core/tool-scope";
import {
  createToolMemoryUtils,
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
  toolbar: HTMLElement;
  writing: HTMLButtonElement;
  painting: HTMLButtonElement;
  overflow: HTMLButtonElement;
  overflowMenu: HTMLElement;
  overflowPainting: HTMLButtonElement;
  chipHost: HTMLElement;
}

let selectedTool: { id: string; label: string } | null = null;

function renderChip(host: HTMLElement): void {
  host.replaceChildren();
  if (!selectedTool) return;
  const chip = el("div", {
    "data-new-input-control": "selected-atomic-action",
    "data-application-id": selectedTool.id,
  });
  const wrap = el("span", {});
  const label = el("span", {}, [selectedTool.label]);
  const remove = el("button", { "aria-label": `移除 ${selectedTool.label}` }, ["x"]);
  remove.addEventListener("click", (event) => {
    event.stopPropagation();
    selectedTool = null;
    renderChip(host);
  });
  wrap.append(label, remove);
  chip.append(wrap);
  host.append(chip);
}

function installToolToolbar(): ToolFixture {
  selectedTool = null;
  const toolbar = el("div", {
    "data-new-input-control": "atomic-actions",
  });
  const writing = el("button", { "data-application-id": "AI_WRITING", "aria-label": "专业写作" });
  const painting = el("button", { "data-application-id": "AI_PAINTING", "aria-label": "AI生图" });
  const overflowMenu = el("div", { role: "menu", "aria-label": "工具" });
  const overflowPainting = el("button", {
    role: "menuitem",
    "data-application-id": "AI_PAINTING",
    "aria-label": "AI生图",
  });
  const overflow = el("button", { "aria-label": "工具", "aria-expanded": "false" });
  const select = (id: string, label: string): void => {
    selectedTool = { id, label };
    renderChip(chipHost);
  };
  writing.addEventListener("click", () => select("AI_WRITING", "专业写作"));
  painting.addEventListener("click", () => select("AI_PAINTING", "AI生图"));
  overflowPainting.addEventListener("click", () => {
    overflow.setAttribute("aria-expanded", "false");
    overflowMenu.remove();
    select("AI_PAINTING", "AI生图");
  });
  overflow.addEventListener("click", () => {
    const open = overflow.getAttribute("aria-expanded") === "true";
    overflow.setAttribute("aria-expanded", open ? "false" : "true");
    if (open) overflowMenu.remove();
    else toolbar.append(overflowMenu);
  });
  overflowMenu.append(overflowPainting);
  toolbar.append(writing, painting, overflow);
  const chipHost = el("div", {});
  document.body.append(toolbar, chipHost);
  return { toolbar, writing, painting, overflow, overflowMenu, overflowPainting, chipHost };
}

function createToolMemory(scope = createToolPopupScope()) {
  return createToolMemoryUtils({
    el,
    state: createEngineState(),
    triggerSendButton: (control) => {
      control.click();
      return true;
    },
  });
}

describe("createToolPopupScope", () => {
  it("registers the popup named by aria-controls and owns its rows", () => {
    const container = el("div", { "data-new-input-control": "add-tools" });
    const trigger = el("button", {
      "data-new-input-control": "add-tools-trigger",
      "aria-expanded": "false",
      "aria-controls": "yuanbao-tools-menu",
    }, ["添加工具"]);
    const row = el("button", { role: "menuitemcheckbox" }, ["绘画"]);
    const popup = el("div", { id: "yuanbao-tools-menu", role: "menu" }, [row]);
    container.append(trigger);
    document.body.append(container, popup);
    const fixture = { trigger, menu: popup, row };
    const scope = createToolPopupScope();
    const resolved = scope.note(fixture.trigger, new Set<Element>());
    expect(resolved).toBe(fixture.menu);
    expect(scope.active(fixture.trigger)).toBe(fixture.menu);
    expect(scope.isInside(fixture.row)).toBe(true);
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
  it("records the selected application chip after a tool click", async () => {
    const fixture = installToolToolbar();
    const toolMemory = createToolMemory();
    window.addEventListener("click", toolMemory.handleToolClick, true);

    press(fixture.writing);
    await vi.advanceTimersByTimeAsync(200);

    expect(readToolRecord()?.applicationId).toBe("AI_WRITING");
    expect(readToolRecord()?.label).toBe("专业写作");
    window.removeEventListener("click", toolMemory.handleToolClick, true);
    toolMemory.teardown();
  });

  it("clears the record when the selected tool chip is removed", async () => {
    const fixture = installToolToolbar();
    selectedTool = { id: "AI_PAINTING", label: "AI生图" };
    renderChip(fixture.chipHost);
    writeToolRecord({
      key: "atomic-actions",
      controlLabel: "工具",
      applicationId: "AI_PAINTING",
      label: "AI生图",
      legacyLabels: ["AI生图"],
      ts: Date.now(),
    });
    const toolMemory = createToolMemory();
    window.addEventListener("click", toolMemory.handleToolClick, true);

    const remove = fixture.chipHost.querySelector("button");
    expect(remove).not.toBeNull();
    if (remove) press(remove);
    await vi.advanceTimersByTimeAsync(200);

    expect(readToolRecord()).toBeNull();
    window.removeEventListener("click", toolMemory.handleToolClick, true);
    toolMemory.teardown();
  });

  it("restores an inline tool and does not click an already selected chip", async () => {
    const fixture = installToolToolbar();
    const clicks = vi.fn();
    fixture.writing.addEventListener("click", clicks);
    selectedTool = { id: "AI_WRITING", label: "专业写作" };
    renderChip(fixture.chipHost);
    writeToolRecord({
      key: "atomic-actions",
      controlLabel: "工具",
      applicationId: "AI_WRITING",
      label: "专业写作",
      legacyLabels: ["专业写作"],
      ts: Date.now(),
    });
    const toolMemory = createToolMemory();
    const status = el("div", {});
    toolMemory.attachStatusNode(status);
    toolMemory.maybeRestore();
    await vi.advanceTimersByTimeAsync(500);

    expect(clicks).not.toHaveBeenCalled();
    expect(status.textContent).toContain("专业写作");
    toolMemory.teardown();
  });

  it("restores a tool through the overflow menu when it is not inline", async () => {
    const fixture = installToolToolbar();
    fixture.painting.remove();
    writeToolRecord({
      key: "atomic-actions",
      controlLabel: "工具",
      applicationId: "AI_PAINTING",
      label: "AI生图",
      legacyLabels: ["AI生图"],
      ts: Date.now(),
    });
    const toolMemory = createToolMemory();
    const status = el("div", {});
    toolMemory.attachStatusNode(status);
    toolMemory.maybeRestore();
    await vi.advanceTimersByTimeAsync(700);

    expect(selectedTool?.id).toBe("AI_PAINTING");
    expect(fixture.overflow.getAttribute("aria-expanded")).toBe("false");
    expect(status.textContent).toContain("已恢复 AI生图");
    toolMemory.teardown();
  });

  it("retries when the first click does not produce a chip", async () => {
    const fixture = installToolToolbar();
    let failedOnce = false;
    fixture.painting.addEventListener("click", (event) => {
      if (failedOnce) return;
      failedOnce = true;
      event.stopImmediatePropagation();
    }, true);
    writeToolRecord({
      key: "atomic-actions",
      controlLabel: "工具",
      applicationId: "AI_PAINTING",
      label: "AI生图",
      legacyLabels: ["AI生图"],
      ts: Date.now(),
    });
    const toolMemory = createToolMemory();
    const status = el("div", {});
    toolMemory.attachStatusNode(status);
    toolMemory.maybeRestore();
    await vi.advanceTimersByTimeAsync(2500);
    toolMemory.maybeRestore();
    await vi.advanceTimersByTimeAsync(1800);

    expect(failedOnce).toBe(true);
    expect(selectedTool?.id).toBe("AI_PAINTING");
    toolMemory.teardown();
  });

  it("falls back to the saved label for records written by older versions", async () => {
    installToolToolbar();
    writeToolRecord({
      key: "add-tools",
      controlLabel: "添加工具",
      applicationId: "",
      label: "AI生图",
      legacyLabels: ["AI生图"],
      ts: Date.now(),
    });
    const toolMemory = createToolMemory();
    toolMemory.maybeRestore();
    await vi.advanceTimersByTimeAsync(1600);
    expect(selectedTool?.id).toBe("AI_PAINTING");
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

describe("yuanbao model panel restore", () => {
  it("closes the thinking-mode panel owned by the restore flow", async () => {
    const trigger = el("button", {
      "data-thinking-mode-switcher-trigger": "",
      "aria-label": "切换模型",
      "aria-expanded": "true",
      "aria-controls": "yb-model-menu",
    }, ["元宝" ]);
    const row = el("button", {
      role: "menuitemradio",
      "aria-checked": "true",
    }, ["Pro"]);
    const menu = el("div", { id: "yb-model-menu", role: "menu" }, [row]);
    const clicks = vi.fn(() => {
      trigger.setAttribute(
        "aria-expanded",
        trigger.getAttribute("aria-expanded") === "true" ? "false" : "true",
      );
    });
    trigger.addEventListener("click", clicks);
    document.body.append(trigger, menu);
    window.localStorage.setItem(
      "ai_turbo_reasoning_memory",
      JSON.stringify({
        [location.hostname]: {
          mode: "choice",
          key: "切换模型",
          controlLabel: "元宝",
          path: [],
          option: "Pro",
          ts: Date.now(),
        },
      }),
    );

    const reasoning = createReasoning();
    reasoning.applyReasoningMemory();
    await vi.advanceTimersByTimeAsync(1200);

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    reasoning.clearReasoningRestoreTimer();
  });
});
