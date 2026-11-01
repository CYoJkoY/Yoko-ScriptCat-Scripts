// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createToolPopupScope } from "../scripts/ai-chat-turbo-engine/src/core/tool-scope";
import {
  createToolMemoryUtils,
} from "../scripts/ai-chat-turbo-engine/src/core/tool-memory";
import { createReasoningUtils } from "../scripts/ai-chat-turbo-engine/src/core/reasoning";
import { createRestoreCoordinator } from "../scripts/ai-chat-turbo-engine/src/core/restore-coordination";
import { readToolRecord, writeToolRecord } from "../scripts/ai-chat-turbo-engine/src/storage/tool-memory";
import {
  readReasoningRecord,
  writeReasoningRecord,
} from "../scripts/ai-chat-turbo-engine/src/storage/reasoning-memory";
import {
  readYuanbaoSelectionRecord,
  writeYuanbaoSelectionRecord,
} from "../scripts/ai-chat-turbo-engine/src/storage/yuanbao-selection";
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

function createToolMemory(restoreCoordinator = createRestoreCoordinator()) {
  return createToolMemoryUtils({
    el,
    state: createEngineState(),
    triggerSendButton: (control) => {
      control.click();
      return true;
    },
    restoreCoordinator,
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

function createReasoning(
  state = createEngineState(),
  restoreCoordinator = createRestoreCoordinator(),
) {
  return createReasoningUtils({
    el,
    state,
    toolScope: createToolPopupScope(),
    withSelfMutation: <T>(task: () => T): T => task(),
    triggerSendButton: () => true,
    requestUpdate: () => undefined,
    markRestoredTurn: () => undefined,
    requestFullTurnSync: () => undefined,
    restoreCoordinator,
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

const YUANBAO_MODES = ["快速回答", "深度思考", "专家模式"] as const;
const YUANBAO_MODELS = ["Hy4 preview", "Hy3", "DeepSeek"] as const;

interface YuanbaoFixture {
  trigger: HTMLButtonElement;
  label: HTMLElement;
  clicks: string[];
  modelMenu: () => HTMLElement | null;
  mainMenu: () => HTMLElement | null;
  selectMode: (mode: string) => void;
}

function installYuanbaoSelector(
  initialModel: string = "Hy3",
  initialMode: string = "快速回答",
): YuanbaoFixture {
  let model = initialModel;
  let mode = initialMode;
  let main: HTMLElement | null = null;
  let submenu: HTMLElement | null = null;
  let modelValue: HTMLElement | null = null;
  const modeRows = new Map<string, HTMLElement>();
  const clicks: string[] = [];
  const trigger = el(
    "button",
    {
      "data-thinking-mode-switcher-trigger": "true",
      "aria-label": "切换模型",
      "aria-expanded": "false",
    },
  );
  const label = el("span", { "data-input-label": "model" }, [initialMode]);
  trigger.append(label);

  const closeSubmenu = (): void => {
    submenu?.remove();
    submenu = null;
  };

  const closeMain = (): void => {
    closeSubmenu();
    main?.remove();
    main = null;
    trigger.setAttribute("aria-expanded", "false");
  };

  const applyMode = (next: string, closeAfter: boolean): void => {
    mode = next;
    label.textContent = next;
    for (const [name, row] of modeRows) {
      row.setAttribute("aria-checked", name === next ? "true" : "false");
    }
    if (closeAfter) closeMain();
  };

  const buildModelMenu = (): void => {
    closeSubmenu();
    const menu = el("div", { role: "menu", "aria-label": "模型列表" });
    for (const name of YUANBAO_MODELS) {
      const row = el(
        "button",
        {
          role: "menuitemradio",
          "aria-checked": name === model ? "true" : "false",
        },
        [name],
      );
      row.addEventListener("click", () => {
        clicks.push(`model:${name}`);
        model = name;
        if (modelValue) modelValue.textContent = name;
        if (name === "Hy4 preview") applyMode("专家模式", false);
        closeSubmenu();
      });
      menu.append(row);
    }
    submenu = menu;
    document.body.append(menu);
  };

  const buildMain = (): void => {
    const menu = el("div", { role: "menu" });
    const modelRow = el("button", { role: "menuitem", "aria-label": "选择模型" });
    modelRow.append(el("span", {}, ["模型"]));
    modelValue = el("span", {}, [model]);
    modelRow.append(modelValue);
    modelRow.addEventListener("click", () => {
      clicks.push("open-model-menu");
      buildModelMenu();
    });
    menu.append(modelRow);
    modeRows.clear();
    for (const name of YUANBAO_MODES) {
      const row = el(
        "button",
        {
          role: "menuitemradio",
          "aria-checked": name === mode ? "true" : "false",
        },
        [name],
      );
      row.addEventListener("click", () => {
        clicks.push(`mode:${name}`);
        applyMode(name, true);
      });
      modeRows.set(name, row);
      menu.append(row);
    }
    main = menu;
    trigger.setAttribute("aria-expanded", "true");
    document.body.append(menu);
  };

  trigger.addEventListener("click", () => {
    if (main) {
      clicks.push("toggle:close");
      closeMain();
      return;
    }
    clicks.push("toggle:open");
    buildMain();
  });

  document.body.append(trigger);
  return {
    trigger,
    label,
    clicks,
    modelMenu: () =>
      document.querySelector<HTMLElement>("[role='menu'][aria-label='模型列表']"),
    mainMenu: () =>
      document.querySelector<HTMLElement>("div[role='menu']:not([aria-label='模型列表'])"),
    selectMode: (next: string) => {
      const row = modeRows.get(next);
      if (row) row.click();
    },
  };
}

function yuanbaoRow(menu: HTMLElement, text: string): HTMLElement {
  const row =
    menu.querySelector<HTMLElement>(`[aria-label='${text}']`) ??
    Array.from(menu.querySelectorAll<HTMLElement>("[role='menuitemradio']")).find(
      (node) => node.textContent?.trim() === text,
    );
  if (!row) throw new Error(`missing Yuanbao row: ${text}`);
  return row;
}

describe("yuanbao model and mode memory", () => {
  it("leaves reasoning controls outside the model picker on the generic path", async () => {
    const fixture = installYuanbaoSelector();
    const reasoning = createReasoning();
    window.addEventListener("click", reasoning.handleReasoningClick, true);
    const toggle = installReasoningToggle({ "aria-pressed": "true" });

    reasoning.handleReasoningClick(press(toggle.button));
    await vi.advanceTimersByTimeAsync(0);

    expect(readReasoningRecord()).toMatchObject({
      mode: "toggle",
      label: "深度思考",
      on: true,
    });
    expect(readYuanbaoSelectionRecord()).toBeNull();
    expect(fixture.clicks).toEqual([]);
    window.removeEventListener("click", reasoning.handleReasoningClick, true);
    reasoning.clearReasoningRestoreTimer();
  });

  it("records model and mode without overwriting each other", async () => {
    const fixture = installYuanbaoSelector();
    const reasoning = createReasoning();
    window.addEventListener("click", reasoning.handleReasoningClick, true);

    press(fixture.trigger);
    fixture.selectMode("深度思考");
    await vi.advanceTimersByTimeAsync(1000);
    expect(readYuanbaoSelectionRecord()).toMatchObject({
      model: "Hy3",
      mode: "深度思考",
    });

    press(fixture.trigger);
    const main = fixture.mainMenu();
    expect(main).not.toBeNull();
    if (main) press(yuanbaoRow(main, "选择模型"));
    const modelMenu = fixture.modelMenu();
    expect(modelMenu).not.toBeNull();
    if (modelMenu) press(yuanbaoRow(modelMenu, "DeepSeek"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(readYuanbaoSelectionRecord()).toMatchObject({
      model: "DeepSeek",
      mode: "深度思考",
    });

    fixture.selectMode("快速回答");
    await vi.advanceTimersByTimeAsync(1000);
    expect(readYuanbaoSelectionRecord()).toMatchObject({
      model: "DeepSeek",
      mode: "快速回答",
    });
    window.removeEventListener("click", reasoning.handleReasoningClick, true);
    reasoning.clearReasoningRestoreTimer();
  });

  it.each([
    ["Hy4 preview", "专家模式", "Hy3", "快速回答"],
    ["DeepSeek", "深度思考", "Hy3", "快速回答"],
    ["Hy3", "快速回答", "DeepSeek", "深度思考"],
  ])(
    "restores model %s before mode %s and closes the panel",
    async (model, mode, initialModel, initialMode) => {
    const fixture = installYuanbaoSelector(initialModel, initialMode);
    const coordinator = createRestoreCoordinator();
    writeYuanbaoSelectionRecord({ model, mode, ts: Date.now() });
    const reasoning = createReasoning(createEngineState(), coordinator);

    reasoning.applyReasoningMemory();
    expect(coordinator.activeOwner()).toBe("reasoning");
    await vi.advanceTimersByTimeAsync(1500);

    const selectedModel = fixture.clicks.findIndex((entry) => entry.startsWith("model:"));
    const selectedMode = fixture.clicks.findIndex((entry) => entry.startsWith("mode:"));
    expect(selectedModel).toBeGreaterThanOrEqual(0);
    if (selectedMode >= 0) expect(selectedMode).toBeGreaterThan(selectedModel);
    expect(fixture.label.textContent).toBe(mode);
    expect(fixture.trigger.getAttribute("aria-expanded")).toBe("false");
    expect(fixture.mainMenu()).toBeNull();
    expect(fixture.modelMenu()).toBeNull();
    expect(coordinator.isPending("reasoning")).toBe(false);
    expect(coordinator.activeOwner()).toBeNull();
    reasoning.clearReasoningRestoreTimer();
    },
  );

  it("migrates a legacy reasoning record into the selection record", async () => {
    const fixture = installYuanbaoSelector("Hy3", "快速回答");
    writeReasoningRecord({
      mode: "choice",
      key: "切换模型",
      controlLabel: "快速回答",
      option: "DeepSeek",
      ts: Date.now(),
    });
    const reasoning = createReasoning();

    reasoning.applyReasoningMemory();
    await vi.advanceTimersByTimeAsync(1500);

    expect(readYuanbaoSelectionRecord()).toMatchObject({
      model: "DeepSeek",
      mode: "快速回答",
    });
    expect(fixture.clicks).toContain("model:DeepSeek");
    reasoning.clearReasoningRestoreTimer();
  });

  it("stops an incompatible Hy4 and quick-answer pair without opening the menu", async () => {
    const fixture = installYuanbaoSelector();
    const coordinator = createRestoreCoordinator();
    writeYuanbaoSelectionRecord({
      model: "Hy4 preview",
      mode: "快速回答",
      ts: Date.now(),
    });
    const status = el("div", {});
    const reasoning = createReasoning(createEngineState(), coordinator);
    reasoning.attachStatusNode(status);

    reasoning.applyReasoningMemory();

    expect(fixture.clicks).toEqual([]);
    expect(fixture.trigger.getAttribute("aria-expanded")).toBe("false");
    expect(coordinator.isPending("reasoning")).toBe(false);
    expect(status.textContent).toContain("不兼容");
    reasoning.clearReasoningRestoreTimer();
  });

  it("keeps a saved tool waiting until Yuanbao reasoning restoration ends", async () => {
    const fixture = installYuanbaoSelector();
    installToolToolbar();
    writeToolRecord({
      key: "atomic-actions",
      controlLabel: "工具",
      applicationId: "AI_PAINTING",
      label: "AI生图",
      legacyLabels: ["AI生图"],
      ts: Date.now(),
    });
    writeYuanbaoSelectionRecord({
      model: "DeepSeek",
      mode: "深度思考",
      ts: Date.now(),
    });
    const coordinator = createRestoreCoordinator();
    const reasoning = createReasoning(createEngineState(), coordinator);
    const toolMemory = createToolMemory(coordinator);

    reasoning.applyReasoningMemory();
    toolMemory.maybeRestore();
    expect(selectedTool).toBeNull();
    await vi.advanceTimersByTimeAsync(1500);
    expect(fixture.label.textContent).toBe("深度思考");
    expect(coordinator.isPending("reasoning")).toBe(false);

    toolMemory.maybeRestore();
    await vi.advanceTimersByTimeAsync(700);
    expect(selectedTool?.id).toBe("AI_PAINTING");
    reasoning.clearReasoningRestoreTimer();
    toolMemory.teardown();
  });

  it("stops waiting for a missing trigger and releases the restore lock", async () => {
    writeYuanbaoSelectionRecord({
      model: "DeepSeek",
      mode: "深度思考",
      ts: Date.now(),
    });
    const coordinator = createRestoreCoordinator();
    const status = el("div", {});
    const reasoning = createReasoning(createEngineState(), coordinator);
    reasoning.attachStatusNode(status);

    reasoning.scheduleReasoningRestore();
    expect(coordinator.isPending("reasoning")).toBe(true);
    expect(coordinator.activeOwner()).toBeNull();
    await vi.advanceTimersByTimeAsync(10_200);

    expect(coordinator.isPending("reasoning")).toBe(false);
    expect(coordinator.activeOwner()).toBeNull();
    expect(status.textContent).toContain("未找到模型菜单");
    reasoning.clearReasoningRestoreTimer();
  });

  it("clears both records and cancels an active restore from the status button", async () => {
    installYuanbaoSelector();
    writeYuanbaoSelectionRecord({
      model: "DeepSeek",
      mode: "深度思考",
      ts: Date.now(),
    });
    writeReasoningRecord({
      mode: "choice",
      option: "Hy3",
      ts: Date.now(),
    });
    const coordinator = createRestoreCoordinator();
    const status = el("div", {});
    const reasoning = createReasoning(createEngineState(), coordinator);
    reasoning.attachStatusNode(status);
    reasoning.scheduleReasoningRestore();
    reasoning.renderReasoningStatus();
    expect(coordinator.isPending("reasoning")).toBe(true);

    const clear = status.querySelector("button");
    expect(clear).not.toBeNull();
    if (clear) press(clear);
    await vi.advanceTimersByTimeAsync(10_500);

    expect(readYuanbaoSelectionRecord()).toBeNull();
    expect(readReasoningRecord()).toBeNull();
    expect(coordinator.isPending("reasoning")).toBe(false);
    expect(coordinator.activeOwner()).toBeNull();
    expect(status.textContent).toBe("推理记忆：未记录（在模型菜单里选择模型或模式即可）");
  });
});
