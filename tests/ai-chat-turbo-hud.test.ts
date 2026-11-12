// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HUD_ID,
  PLATFORMS,
  STORAGE_KEY_CONFIG,
  STORAGE_KEY_POS,
} from "../scripts/ai-chat-turbo-engine/src/config";
import {
  createEngineState,
  loadSavedConfig,
  resetPersistedConfig,
  saveCurrentConfig,
  type EngineState,
} from "../scripts/ai-chat-turbo-engine/src/state";
import {
  createHudUtils,
  type HudDeps,
  type HudUtils,
} from "../scripts/ai-chat-turbo-engine/src/ui/hud";
import type { ElementFactory } from "../scripts/ai-chat-turbo-engine/src/ui/code-blocks";
import type { PlatformDefinition } from "../scripts/ai-chat-turbo-engine/src/config";

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
    if (key === "style") {
      node.style.cssText = value;
      continue;
    }
    node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}

const el: ElementFactory = createTestElement;

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

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, "innerWidth", {
    value: width,
    configurable: true,
  });
  Object.defineProperty(window, "innerHeight", {
    value: height,
    configurable: true,
  });
}

interface HudFixture {
  state: EngineState;
  hud: HudUtils;
  shadow: ShadowRoot;
  panel: HTMLElement;
  pill: HTMLElement;
  markRestoredTurn: ReturnType<typeof vi.fn>;
  saveConfig: ReturnType<typeof vi.fn>;
  flushTextIndex: ReturnType<typeof vi.fn>;
  requestCodeScanForTurn: ReturnType<typeof vi.fn>;
}

const activeHuds: HudUtils[] = [];

function createHud(
  options: {
    platform?: PlatformDefinition;
    state?: EngineState;
    onSaved?: () => void;
  } = {},
): HudFixture {
  const state = options.state ?? createEngineState();
  const platform = options.platform ?? PLATFORMS.chatgpt;
  const markRestoredTurn = vi.fn();
  const flushTextIndex = vi.fn(() => 0);
  const requestCodeScanForTurn = vi.fn();
  const saveConfig = vi.fn(() => {
    saveCurrentConfig(state);
    options.onSaved?.();
  });
  const deps: HudDeps = {
    el,
    state,
    currentPlatform: platform,
    version: "0.17.1",
    reasoningStatusNode: document.createElement("div"),
    toolStatusNode: document.createElement("div"),
    codeBlocks: { requestCodeScan: vi.fn(), requestCodeScanForTurn },
    reasoning: {
      attachStatusNode: vi.fn(),
      scheduleReasoningRestore: vi.fn(),
      renderReasoningStatus: vi.fn(),
    },
    toolMemory: {
      attachStatusNode: vi.fn(),
      scheduleRestore: vi.fn(),
      renderStatus: vi.fn(),
    },
    handoff: {
      attachStatusNode: vi.fn(),
      setHandoffStatus: vi.fn(),
      exportCleanContext: vi.fn(),
      startOneClickHandoff: vi.fn(),
      resumePendingHandoffPrompt: vi.fn(),
      prepareNewConversationFromYaml: vi.fn(),
      clearResumeTimer: vi.fn(),
    },
    isEngineDormant: () => false,
    requestUpdate: vi.fn(),
    requestFullTurnSync: vi.fn(),
    saveConfig,
    markRestoredTurn,
    flushTextIndex,
    activeFileCount: () => 0,
    clearFiles: vi.fn(),
    syncSidebarPeek: vi.fn(),
    injectStyles: vi.fn(),
  };
  const hud = createHudUtils(deps);
  activeHuds.push(hud);
  hud.buildHUD();
  const root = document.getElementById(HUD_ID);
  if (!(root instanceof HTMLElement) || !root.shadowRoot) {
    throw new Error("HUD did not mount a shadow root");
  }
  const panel = root.shadowRoot.getElementById("panel");
  const pill = root.shadowRoot.getElementById("pill-trigger");
  if (!(panel instanceof HTMLElement) || !(pill instanceof HTMLElement)) {
    throw new Error("HUD is missing the panel or pill");
  }
  return {
    state,
    hud,
    shadow: root.shadowRoot,
    panel,
    pill,
    markRestoredTurn,
    saveConfig,
    flushTextIndex,
    requestCodeScanForTurn,
  };
}

function shadowInput(
  shadow: ShadowRoot,
  id: string,
): HTMLInputElement {
  const node = shadow.getElementById(id);
  if (!(node instanceof HTMLInputElement)) {
    throw new Error("Missing input #" + id);
  }
  return node;
}

function pressPointer(
  target: EventTarget,
  type: string,
  x: number,
  y: number,
): void {
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: x,
      clientY: y,
    }),
  );
}

let scrollIntoView: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  installMemoryStorage();
  window.localStorage.clear();
  setViewport(1024, 768);
  document.documentElement.className = "";
  document.documentElement.removeAttribute("style");
  for (const attribute of [
    "data-theme",
    "data-color-mode",
    "data-theme-mode",
    "data-mode",
    "data-color-scheme",
  ]) {
    document.documentElement.removeAttribute(attribute);
  }
  vi.spyOn(window, "confirm").mockReturnValue(true);
  scrollIntoView = vi.fn();
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    value: scrollIntoView,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  for (const hud of activeHuds.splice(0)) hud.teardown();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
  window.localStorage.clear();
});

describe("HUD panel structure", () => {
  it("renders the four status cards and advanced settings closed by default", () => {
    const { shadow, panel } = createHud();
    const labels = Array.from(
      panel.querySelectorAll(".status-label"),
      (node) => node.textContent,
    );
    expect(labels).toEqual(["消息总数", "已脱水", "代码折叠", "虚拟文件"]);

    const order = [
      "历史检索",
      "上下文交接",
      "常用开关",
      "高级设置",
    ].map((title) => panel.textContent.indexOf(title));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((left, right) => left - right)).toEqual(order);

    const advanced = shadow.getElementById("advanced-settings");
    expect(advanced).toBeInstanceOf(HTMLDetailsElement);
    expect((advanced as HTMLDetailsElement).open).toBe(false);
    expect(panel.textContent).toContain(
      "修改会立即生效并自动保存",
    );
    expect(panel.textContent).toContain("恢复默认设置");
    expect(panel.getAttribute("role")).toBe("dialog");
    expect(panel.getAttribute("aria-modal")).toBe("true");
    expect(panel.getAttribute("aria-labelledby")).toBe("hud-title");
    expect(panel.getAttribute("aria-hidden")).toBe("true");
  });

  it("shows the tool memory switch only on platforms that declare support", () => {
    const chatgpt = createHud();
    expect(chatgpt.shadow.getElementById("hud-tools")).toBeNull();
    chatgpt.hud.teardown();
    activeHuds.splice(activeHuds.indexOf(chatgpt.hud), 1);

    const yuanbao = createHud({ platform: PLATFORMS.yuanbao });
    expect(yuanbao.shadow.getElementById("hud-tools")).not.toBeNull();
  });

  it("associates every switch with a unique id and visible label", () => {
    const { shadow } = createHud({ platform: PLATFORMS.yuanbao });
    const switches = Array.from(
      shadow.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"]',
      ),
    );
    const ids = switches.map((input) => input.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const input of switches) {
      expect(input.id).not.toBe("");
      const label = shadow.querySelector(
        'label[for="' + input.id + '"]',
      );
      expect(label).not.toBeNull();
      expect(label?.textContent?.trim()).not.toBe("");
    }

    expect(
      shadow
        .querySelector('label[for="message-limit"]')
        ?.textContent?.trim(),
    ).toBe("消息提醒上限");
    expect(
      shadow
        .querySelector('label[for="hud-theme"]')
        ?.textContent?.trim(),
    ).toBe("界面主题");
    const stepButtons = Array.from(
      shadow.querySelectorAll<HTMLButtonElement>(".stepper button"),
    );
    expect(stepButtons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "减少活跃保留轮次",
      "增加活跃保留轮次",
    ]);
    expect(
      shadowInput(shadow, "hud-search").getAttribute("aria-label"),
    ).toBe("检索当前会话内容");
    expect(
      shadow.getElementById("hud-theme")?.getAttribute("aria-label"),
    ).toBe("界面主题");
  });

  it("surfaces a warning action when the message count reaches the limit", () => {
    const state = createEngineState();
    state.totalTurns = 60;
    state.messageLimit = 60;
    const { shadow } = createHud({ state });
    const warning = shadow.querySelector<HTMLElement>(".load-warning");
    if (!warning) throw new Error("Missing load warning");
    expect(warning.hidden).toBe(false);
    expect(warning.textContent).toContain("消息数已达到提醒上限");
    expect(warning.textContent).toContain("检索会话");
    expect(warning.textContent).toContain("调整提醒上限");
    expect(shadow.querySelector(".turbo-count")?.textContent).toBe("60");
  });
});

describe("HUD theme", () => {
  it("follows the host theme in auto mode and lets a manual choice win", () => {
    document.documentElement.classList.add("dark");
    const { state, shadow, hud } = createHud();
    const root = document.getElementById(HUD_ID);
    expect(root?.getAttribute("data-hud-theme")).toBe("dark");

    document.documentElement.className = "light";
    hud.updateHudDashboard();
    expect(root?.getAttribute("data-hud-theme")).toBe("light");

    state.hudTheme = "dark";
    hud.updateHudDashboard();
    expect(root?.getAttribute("data-hud-theme")).toBe("dark");
    expect(shadow.getElementById("hud-theme")).not.toBeNull();
  });

  it("persists the theme selection and announces it", () => {
    const { shadow, state } = createHud();
    const select = shadow.getElementById("hud-theme");
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error("Missing theme select");
    }
    select.value = "dark";
    select.dispatchEvent(new Event("change", { bubbles: true }));

    expect(state.hudTheme).toBe("dark");
    expect(
      document.getElementById(HUD_ID)?.getAttribute("data-hud-theme"),
    ).toBe("dark");
    const saved: unknown = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY_CONFIG) ?? "null",
    );
    expect(saved).toMatchObject({ hudTheme: "dark" });
    expect(shadow.querySelector(".sr-live")?.textContent).toContain(
      "设置已保存",
    );
  });
});

describe("HUD focus and keyboard behavior", () => {
  it("moves focus into the panel and restores it on close", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { shadow, hud, state, pill } = createHud();
    hud.togglePanel(true);

    expect(state.hudOpen).toBe(true);
    expect(shadow.activeElement).toBe(shadow.getElementById("hud-search"));
    expect(pill.getAttribute("aria-expanded")).toBe("true");
    expect(
      shadow.getElementById("backdrop")?.hasAttribute("inert"),
    ).toBe(false);

    hud.togglePanel(false);
    expect(state.hudOpen).toBe(false);
    expect(document.activeElement).toBe(opener);
    expect(pill.getAttribute("aria-expanded")).toBe("false");
    expect(
      shadow.getElementById("backdrop")?.hasAttribute("inert"),
    ).toBe(true);
    expect(
      shadow.getElementById("panel")?.getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("falls back to the pill when the opener is gone", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { hud, pill } = createHud();
    hud.togglePanel(true);
    opener.remove();
    hud.togglePanel(false);
    expect(
      (document.getElementById(HUD_ID)?.shadowRoot?.activeElement) ?? null,
    ).toBe(pill);
  });

  it("loops Tab and Shift+Tab inside the dialog", () => {
    const { shadow, hud } = createHud();
    hud.togglePanel(true);
    const focusables = Array.from(
      shadow
        .getElementById("panel")
        ?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), summary',
        ) ?? [],
    ).filter((node) => {
      if (node.closest("[hidden]")) return false;
      const closedDetails = node.closest("details:not([open])");
      return !closedDetails || node.tagName === "SUMMARY";
    });
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    expect(first).toBeDefined();
    expect(last).toBeDefined();

    last.focus();
    shadow.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );
    expect(shadow.activeElement).toBe(first);

    first.focus();
    shadow.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true,
      }),
    );
    expect(shadow.activeElement).toBe(last);
  });

  it("opens from a native click on the pill", () => {
    const { hud, pill, state } = createHud();
    expect(pill.getAttribute("aria-haspopup")).toBe("dialog");
    expect(pill.getAttribute("aria-controls")).toBe("panel");
    expect(pill.tagName).toBe("BUTTON");
    pill.click();
    expect(state.hudOpen).toBe(true);
    expect(hud).toBeTruthy();
  });
});

describe("HUD pill dragging", () => {
  it("starts dragging only after the pointer moves more than 4px", () => {
    window.localStorage.setItem(
      STORAGE_KEY_POS,
      JSON.stringify({ x: 100, y: 100 }),
    );
    const { pill, state } = createHud();

    pressPointer(pill, "pointerdown", 200, 200);
    pressPointer(window, "pointermove", 202, 202);
    pressPointer(window, "pointerup", 202, 202);
    pill.click();
    expect(state.hudOpen).toBe(true);

    state.hudOpen = false;
    pressPointer(pill, "pointerdown", 200, 200);
    pressPointer(window, "pointermove", 206, 206);
    pressPointer(window, "pointerup", 206, 206);
    pill.click();
    expect(state.hudOpen).toBe(false);

    const saved: unknown = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY_POS) ?? "null",
    );
    expect(saved).toEqual({ x: 106, y: 106 });
    pill.click();
    expect(state.hudOpen).toBe(true);
  });

  it("suppresses the click after pointercancel and removes move listeners", () => {
    window.localStorage.setItem(
      STORAGE_KEY_POS,
      JSON.stringify({ x: 100, y: 100 }),
    );
    const { pill, state } = createHud();
    pressPointer(pill, "pointerdown", 200, 200);
    pressPointer(window, "pointermove", 210, 210);
    pressPointer(window, "pointercancel", 210, 210);
    pill.click();
    expect(state.hudOpen).toBe(false);

    pressPointer(window, "pointermove", 400, 400);
    expect(pill.style.left).toBe("110px");
  });

  it("clamps a saved position and re-clamps it after a viewport resize", () => {
    window.localStorage.setItem(
      STORAGE_KEY_POS,
      JSON.stringify({ x: 5000, y: 5000 }),
    );
    const { pill } = createHud();
    expect(pill.style.left).toBe("968px");
    expect(pill.style.top).toBe("712px");
    expect(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY_POS) ?? "null"),
    ).toEqual({ x: 968, y: 712 });

    setViewport(400, 300);
    window.dispatchEvent(new Event("resize"));
    expect(pill.style.left).toBe("344px");
    expect(pill.style.top).toBe("244px");
    expect(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY_POS) ?? "null"),
    ).toEqual({ x: 344, y: 244 });
  });
});

describe("HUD search restore", () => {
  it("marks the restored turn before removing dehydration state", () => {
    const turn = document.createElement("div");
    turn.className = "turn ai-turbo-dehydrated";
    turn.style.setProperty("--turbo-cached-h", "320px");
    document.body.append(turn);
    const state = createEngineState();
    state.indexedTurns.push({ id: 0, element: turn, text: "needle text" });
    const {
      hud,
      shadow,
      markRestoredTurn,
      requestCodeScanForTurn,
      panel,
    } = createHud({ state });
    hud.togglePanel(true);

    const input = shadowInput(shadow, "hud-search");
    input.value = "needle";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    vi.advanceTimersByTime(120);

    const result = shadow.querySelector<HTMLButtonElement>(".result-item");
    if (!result) throw new Error("Missing search result");
    result.click();

    expect(markRestoredTurn).toHaveBeenCalledWith(turn);
    expect(requestCodeScanForTurn).toHaveBeenCalledWith(turn);
    expect(turn.classList.contains("ai-turbo-dehydrated")).toBe(false);
    expect(turn.style.getPropertyValue("--turbo-cached-h")).toBe("");
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
    expect(turn.style.outline).toContain("2px solid");
    expect(panel.getAttribute("aria-hidden")).toBe("true");
    vi.advanceTimersByTime(1800);
    expect(turn.style.outline).toBe("");
  });
});

describe("HUD search indexing", () => {
  it("shows known matches with a pending notice instead of an empty result", () => {
    const turn = document.createElement("div");
    document.body.append(turn);
    const state = createEngineState();
    state.indexedTurns.push({ id: 0, element: turn, text: "alpha answer" });
    const { shadow, hud, flushTextIndex } = createHud({ state });
    flushTextIndex.mockReturnValue(1);
    hud.togglePanel(true);

    const input = shadowInput(shadow, "hud-search");
    input.value = "alpha";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    vi.advanceTimersByTime(120);

    expect(shadow.querySelector(".result-item")?.textContent).toContain("alpha");
    const pending = shadow.querySelector(".result-pending");
    expect(pending?.textContent).toBe("正在索引 1 条消息…");
    expect(pending?.getAttribute("role")).toBe("status");
    expect(shadow.textContent).not.toContain("没有匹配的消息");

    flushTextIndex.mockReturnValue(0);
    vi.advanceTimersByTime(200);
    expect(shadow.querySelector(".result-pending")).toBeNull();
    expect(shadow.querySelector(".result-item")?.textContent).toContain("alpha");
  });

  it("does not report no match while indexing is still pending", () => {
    const { shadow, hud, flushTextIndex } = createHud();
    flushTextIndex.mockReturnValue(2);
    hud.togglePanel(true);

    const input = shadowInput(shadow, "hud-search");
    input.value = "missing";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    vi.advanceTimersByTime(120);

    expect(shadow.querySelector(".result-empty")).toBeNull();
    expect(shadow.querySelector(".result-pending")).not.toBeNull();

    flushTextIndex.mockReturnValue(0);
    vi.advanceTimersByTime(200);
    expect(shadow.querySelector(".result-empty")).not.toBeNull();
  });
});

describe("HUD reset", () => {
  it("restores persisted defaults while keeping live counters", () => {
    const state = createEngineState();
    state.hudTheme = "dark";
    state.keepTurns = 22;
    state.messageLimit = 999;
    state.pruneEnabled = false;
    state.collapseCode = false;
    state.virtualFileEnabled = false;
    state.rememberReasoning = false;
    state.totalTurns = 17;
    state.hiddenCount = 5;
    state.foldedCodeCount = 3;
    const { shadow, hud } = createHud({ state });
    hud.togglePanel(true);

    const reset = shadow.querySelector<HTMLButtonElement>(".reset-btn");
    if (!reset) throw new Error("Missing reset button");
    reset.click();

    expect(window.confirm).toHaveBeenCalled();
    expect(state.hudTheme).toBe("auto");
    expect(state.keepTurns).toBe(8);
    expect(state.messageLimit).toBe(60);
    expect(state.pruneEnabled).toBe(true);
    expect(state.collapseCode).toBe(true);
    expect(state.virtualFileEnabled).toBe(true);
    expect(state.rememberReasoning).toBe(true);
    expect(state.totalTurns).toBe(17);
    expect(state.hiddenCount).toBe(5);
    expect(state.foldedCodeCount).toBe(3);
    const select = shadow.getElementById("hud-theme");
    expect((select as HTMLSelectElement).value).toBe("auto");

    const saved: unknown = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY_CONFIG) ?? "null",
    );
    expect(saved).toMatchObject({
      hudTheme: "auto",
      keepTurns: 8,
      messageLimit: 60,
    });
  });
});

describe("HUD persisted config", () => {
  it("falls back to auto when an older payload has no theme", () => {
    window.localStorage.setItem(
      STORAGE_KEY_CONFIG,
      JSON.stringify({ keepTurns: 12, collapseCode: false }),
    );
    const state = createEngineState();
    loadSavedConfig(state);
    expect(state.hudTheme).toBe("auto");
    expect(state.keepTurns).toBe(12);
    expect(state.collapseCode).toBe(false);
  });

  it("ignores an invalid theme value and keeps auto", () => {
    window.localStorage.setItem(
      STORAGE_KEY_CONFIG,
      JSON.stringify({ hudTheme: "sepia" }),
    );
    const state = createEngineState();
    loadSavedConfig(state);
    expect(state.hudTheme).toBe("auto");
  });

  it("saves the theme alongside the existing config keys", () => {
    const state = createEngineState();
    state.hudTheme = "light";
    saveCurrentConfig(state);
    const saved: unknown = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY_CONFIG) ?? "null",
    );
    expect(saved).toMatchObject({
      hudTheme: "light",
      pruneEnabled: true,
      keepTurns: 8,
      messageLimit: 60,
      collapseCode: true,
      virtualFileEnabled: true,
      rememberReasoning: true,
      rememberTools: true,
    });
  });

  it("resets only persisted settings", () => {
    const state = createEngineState();
    const element = document.createElement("div");
    state.hudTheme = "dark";
    state.keepTurns = 30;
    state.pruneEnabled = false;
    state.rememberTools = false;
    state.totalTurns = 9;
    state.hiddenCount = 2;
    state.foldedCodeCount = 1;
    state.indexedTurns.push({ id: 0, element, text: "kept" });

    resetPersistedConfig(state);

    expect(state.hudTheme).toBe("auto");
    expect(state.keepTurns).toBe(8);
    expect(state.pruneEnabled).toBe(true);
    expect(state.rememberTools).toBe(true);
    expect(state.totalTurns).toBe(9);
    expect(state.hiddenCount).toBe(2);
    expect(state.foldedCodeCount).toBe(1);
    expect(state.indexedTurns).toHaveLength(1);
  });
});
