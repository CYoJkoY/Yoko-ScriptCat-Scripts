import type { PlatformDefinition } from "../config";
import {
  HUD_ID,
  LOAD_RING_CIRCUMFERENCE,
  LOAD_RING_RADIUS,
  LOAD_WARNING_RATIO,
  MESSAGE_LIMIT_MAX,
  MESSAGE_LIMIT_MIN,
  SEARCH_LIMIT,
  SEARCH_PREVIEW_LIMIT,
  STORAGE_KEY_DOCK,
  STORAGE_KEY_POS,
} from "../config";
import type { CodeBlockUtils, ElementFactory } from "./code-blocks";
import type { ReasoningUtils } from "../core/reasoning";
import type { ToolMemoryUtils } from "../core/tool-memory";
import type { HandoffUtils } from "../core/handoff";
import { reportRecoverableError } from "../core/diagnostics";
import {
  resetPersistedConfig,
  type EngineState,
  type HudTheme,
} from "../state";
import { createReportedStorage } from "../storage/reported";
import { HUD_STYLES } from "./hud-styles";

const positionStore = createReportedStorage("localStorage", (failure) => {
  const scope =
    failure.operation === "write" || failure.operation === "remove"
      ? "save pill position"
      : "restore pill position";
  reportRecoverableError(scope, failure.error);
});

const THEME_ATTRIBUTES = [
  "class",
  "style",
  "data-theme",
  "data-color-mode",
  "data-theme-mode",
  "data-mode",
  "data-color-scheme",
] as const;

/** Screen edge the HUD info display is folded into. */
type HudDockSide = "left" | "right";

/** Distance from an edge that turns a drag release into a dock. */
const DOCK_EDGE_SNAP = 26;
/** Visible width of the collapsed side tab while docked. */
const DOCK_TAB_WIDTH = 30;
const DOCK_TAB_HEIGHT = 86;

interface HudRefs {
  total: HTMLElement;
  hidden: HTMLElement;
  folded: HTMLElement;
  files: HTMLElement;
  totalStatusItem: HTMLElement;
  warning: HTMLElement;
  warningText: HTMLElement;
  panel: HTMLElement;
  backdrop: HTMLElement;
  pillRoot: HTMLElement;
  dockButton: HTMLButtonElement;
  pillCount: HTMLElement;
  pillLoadProgress: SVGElement;
  liveRegion: HTMLElement;
  signature: string;
}

export interface HudDeps {
  el: ElementFactory;
  state: EngineState;
  currentPlatform: PlatformDefinition;
  version: string;
  reasoningStatusNode: HTMLElement;
  toolStatusNode: HTMLElement;
  codeBlocks: Pick<
    CodeBlockUtils,
    "requestCodeScan" | "requestCodeScanForTurn"
  >;
  reasoning: Pick<
    ReasoningUtils,
    "attachStatusNode" | "scheduleReasoningRestore" | "renderReasoningStatus"
  >;
  toolMemory: Pick<
    ToolMemoryUtils,
    "attachStatusNode" | "scheduleRestore" | "renderStatus"
  >;
  handoff: HandoffUtils;
  isEngineDormant: () => boolean;
  requestUpdate: () => void;
  requestFullTurnSync: () => void;
  saveConfig: () => void;
  markRestoredTurn: (turnElement: Element) => void;
  /** Finish pending text extraction and return how many turns remain queued. */
  flushTextIndex: () => number;
  activeFileCount: () => number;
  clearFiles: () => void;
  /** Drop an active hover peek after the preference is switched off. */
  syncSidebarPeek: () => void;
  injectStyles: () => void;
}

interface PillPosition {
  readonly x: number;
  readonly y: number;
}

export interface HudUtils {
  buildHUD(): void;
  ensureHUDMounted(): void;
  togglePanel(forceState?: boolean): void;
  updateHudDashboard(): void;
  teardown(): void;
}

function isPillPosition(value: unknown): value is PillPosition {
  if (typeof value !== "object" || value === null) return false;
  if (!("x" in value) || !("y" in value)) return false;
  return typeof value.x === "number" && typeof value.y === "number";
}

export function parseHudTheme(value: unknown): HudTheme {
  return value === "light" || value === "dark" ? value : "auto";
}

function themeFromText(value: string | null | undefined): "light" | "dark" | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized.includes("dark") || normalized.includes("night")) return "dark";
  if (normalized.includes("light") || normalized.includes("day")) return "light";
  return null;
}

function themeFromClasses(node: Element): "light" | "dark" | null {
  const tokens = Array.from(node.classList, (token) => token.toLowerCase());
  for (const token of tokens) {
    if (
      token === "dark" ||
      token === "night" ||
      token === "theme-dark" ||
      token === "dark-theme" ||
      token.startsWith("dark-") ||
      token.endsWith("-dark")
    ) {
      return "dark";
    }
  }
  for (const token of tokens) {
    if (
      token === "light" ||
      token === "day" ||
      token === "theme-light" ||
      token === "light-theme" ||
      token.startsWith("light-") ||
      token.endsWith("-light")
    ) {
      return "light";
    }
  }
  return null;
}

function parseCssColor(
  value: string,
): { r: number; g: number; b: number; a: number } | null {
  const match = value.trim().match(/^rgba?\(([^)]+)\)$/i);
  if (!match) return null;
  const parts = match[1].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const red = Number(parts[0]);
  const green = Number(parts[1]);
  const blue = Number(parts[2]);
  const alpha = parts.length >= 4 ? Number(parts[3]) : 1;
  if (![red, green, blue, alpha].every(Number.isFinite)) return null;
  return { r: red, g: green, b: blue, a: alpha };
}

function relativeLuminance(color: { r: number; g: number; b: number }): number {
  const channel = (value: number): number => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * channel(color.r) +
    0.7152 * channel(color.g) +
    0.0722 * channel(color.b)
  );
}

function detectBackgroundTheme(): "light" | "dark" | null {
  for (const node of [document.documentElement, document.body]) {
    if (!node) continue;
    const background = window.getComputedStyle(node).backgroundColor;
    const color = parseCssColor(background);
    if (!color || color.a === 0) continue;
    return relativeLuminance(color) < 0.35 ? "dark" : "light";
  }
  return null;
}

function detectHostTheme(): "light" | "dark" {
  const nodes = [document.documentElement, document.body];

  for (const node of nodes) {
    if (!node) continue;
    const fromClasses = themeFromClasses(node);
    if (fromClasses) return fromClasses;
  }

  for (const node of nodes) {
    if (!node) continue;
    for (const attribute of THEME_ATTRIBUTES) {
      if (attribute === "class" || attribute === "style") continue;
      const fromAttribute = themeFromText(node.getAttribute(attribute));
      if (fromAttribute) return fromAttribute;
    }
  }

  for (const node of nodes) {
    if (!node) continue;
    const scheme = window
      .getComputedStyle(node)
      .getPropertyValue("color-scheme");
    const fromScheme = themeFromText(scheme);
    if (fromScheme) return fromScheme;
  }

  const fromBackground = detectBackgroundTheme();
  if (fromBackground) return fromBackground;

  if (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

function resolveLoadTone(
  totalTurns: number,
  messageLimit: number,
): "critical" | "warning" | "normal" {
  const loadRatio = messageLimit > 0 ? totalTurns / messageLimit : 0;
  if (loadRatio >= 1) return "critical";
  if (loadRatio >= LOAD_WARNING_RATIO) return "warning";
  return "normal";
}

export function createHudUtils(deps: HudDeps): HudUtils {
  const {
    el,
    state,
    currentPlatform,
    version: VERSION,
    reasoningStatusNode,
    toolStatusNode,
    codeBlocks,
    reasoning,
    toolMemory,
    handoff,
    isEngineDormant,
    requestUpdate,
    requestFullTurnSync,
    saveConfig,
    markRestoredTurn,
    flushTextIndex,
    activeFileCount,
    clearFiles,
    injectStyles,
  } = deps;

  let hudRootElement: HTMLElement | null = null;
  let hudShadowRoot: ShadowRoot | null = null;
  let hudStats: HudRefs | null = null;
  let searchInput: HTMLInputElement | null = null;
  let searchResultsBox: HTMLElement | null = null;
  let searchDebounceTimer: number | null = null;
  let searchRefreshTimer: number | null = null;
  let announceTimer: number | null = null;
  let themeObserver: MutationObserver | null = null;
  let themeMediaQuery: MediaQueryList | null = null;
  let cleanupPillDrag: (() => void) | null = null;
  let suppressPillClick = false;
  let focusBeforeOpen: HTMLElement | null = null;
  let dockSide: HudDockSide | null = null;
  /** Repositions the pill after the dock state changes; set while mounted. */
  let dockController:
    | ((side: HudDockSide | null, wasDocked?: boolean) => void)
    | null = null;

  function parseDockSide(value: unknown): HudDockSide | null {
    return value === "left" || value === "right" ? value : null;
  }

  function readDockSide(): HudDockSide | null {
    try {
      return parseDockSide(positionStore.read(STORAGE_KEY_DOCK));
    } catch (error: unknown) {
      reportRecoverableError("restore HUD dock", error);
      return null;
    }
  }

  function persistDockSide(side: HudDockSide | null): void {
    if (side) positionStore.write(STORAGE_KEY_DOCK, side);
    else positionStore.remove(STORAGE_KEY_DOCK);
  }

  /**
   * The dock state lives in two places: the host attribute drives the set of
   * styles that fold the pill into a side tab, and the backdrop attribute turns
   * the modal into a drawer sliding out of the same edge.
   */
  function syncDockChrome(): void {
    if (!hudStats) return;
    if (hudRootElement) {
      if (dockSide) hudRootElement.setAttribute("data-hud-dock", dockSide);
      else hudRootElement.removeAttribute("data-hud-dock");
    }
    if (dockSide) hudStats.backdrop.setAttribute("data-dock", dockSide);
    else hudStats.backdrop.removeAttribute("data-dock");

    const docked = dockSide !== null;
    hudStats.dockButton.textContent = docked ? "取消贴边" : "贴边";
    hudStats.dockButton.title = docked
      ? "取消贴边，恢复悬浮仪表"
      : "贴到屏幕边缘，收成侧边信息条";
    hudStats.dockButton.setAttribute("aria-pressed", docked ? "true" : "false");
    hudStats.dockButton.setAttribute(
      "aria-label",
      docked ? "取消贴边，恢复悬浮仪表" : "把信息面板贴到屏幕边缘",
    );
  }

  function setDockSide(side: HudDockSide | null): void {
    if (dockSide === side) return;
    const wasDocked = dockSide !== null;
    dockSide = side;
    persistDockSide(side);
    syncDockChrome();
    dockController?.(side, wasDocked);
  }

  let keepValue: HTMLElement | null = null;
  let messageLimitInput: HTMLInputElement | null = null;
  let themeSelect: HTMLSelectElement | null = null;
  let advancedSettings: HTMLDetailsElement | null = null;
  let chkPrune: HTMLInputElement | null = null;
  let chkCollapse: HTMLInputElement | null = null;
  let chkVirtualFile: HTMLInputElement | null = null;
  let chkSidebarPeek: HTMLInputElement | null = null;
  let chkReasoning: HTMLInputElement | null = null;
  let chkTools: HTMLInputElement | null = null;

  function announce(message: string): void {
    if (!hudStats) return;
    if (announceTimer !== null) {
      window.clearTimeout(announceTimer);
      announceTimer = null;
    }
    hudStats.liveRegion.textContent = message;
    announceTimer = window.setTimeout(() => {
      if (hudStats) hudStats.liveRegion.textContent = "";
      announceTimer = null;
    }, 2400);
  }

  function syncTheme(): void {
    if (!hudRootElement) return;
    const resolved =
      state.hudTheme === "auto" ? detectHostTheme() : state.hudTheme;
    if (hudRootElement.dataset["hudTheme"] !== resolved) {
      hudRootElement.dataset["hudTheme"] = resolved;
    }
  }

  function bindThemeWatchers(): void {
    if (themeObserver || !hudRootElement) return;
    themeObserver = new MutationObserver(() => syncTheme());
    const options: MutationObserverInit = {
      attributes: true,
      attributeFilter: Array.from(THEME_ATTRIBUTES),
    };
    themeObserver.observe(document.documentElement, options);
    if (document.body) themeObserver.observe(document.body, options);

    if (typeof window.matchMedia === "function") {
      themeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      themeMediaQuery.addEventListener("change", syncTheme);
    }
  }

  function unbindThemeWatchers(): void {
    themeObserver?.disconnect();
    themeObserver = null;
    if (themeMediaQuery) {
      themeMediaQuery.removeEventListener("change", syncTheme);
      themeMediaQuery = null;
    }
  }

  function syncControls(): void {
    if (keepValue) keepValue.textContent = String(state.keepTurns);
    if (messageLimitInput) {
      messageLimitInput.value = String(state.messageLimit);
    }
    if (themeSelect) themeSelect.value = state.hudTheme;
    if (chkPrune) chkPrune.checked = state.pruneEnabled;
    if (chkCollapse) chkCollapse.checked = state.collapseCode;
    if (chkVirtualFile) chkVirtualFile.checked = state.virtualFileEnabled;
    if (chkSidebarPeek) chkSidebarPeek.checked = state.sidebarPeekEnabled;
    if (chkReasoning) chkReasoning.checked = state.rememberReasoning;
    if (chkTools) chkTools.checked = state.rememberTools;
  }

  function resetAllSettings(): void {
    if (
      !window.confirm(
        "恢复默认设置？HUD 位置、当前统计与会话数据会保留。",
      )
    ) {
      return;
    }
    resetPersistedConfig(state);
    syncControls();
    deps.syncSidebarPeek();
    saveConfig();
    syncTheme();
    if (!state.virtualFileEnabled) clearFiles();
    codeBlocks.requestCodeScan();
    requestFullTurnSync();
    requestUpdate();
    reasoning.scheduleReasoningRestore();
    reasoning.renderReasoningStatus();
    toolMemory.scheduleRestore();
    toolMemory.renderStatus();
    if (hudStats) {
      hudStats.signature = "";
      updateHudDashboard();
    }
    announce("已恢复默认设置");
  }

  function updateHudDashboard(): void {
    syncTheme();
    if (!hudStats) return;
    const fileCount = activeFileCount();
    const hudSignature =
      String(state.totalTurns) +
      "|" +
      String(state.hiddenCount) +
      "|" +
      String(state.foldedCodeCount) +
      "|" +
      String(fileCount) +
      "|" +
      String(state.messageLimit);
    if (hudStats.signature === hudSignature) return;
    hudStats.signature = hudSignature;

    hudStats.total.textContent = String(state.totalTurns);
    hudStats.hidden.textContent = String(state.hiddenCount);
    hudStats.folded.textContent = String(state.foldedCodeCount);
    hudStats.files.textContent = String(fileCount);

    const loadProgress = Math.min(
      1,
      Math.max(0, state.totalTurns) / Math.max(1, state.messageLimit),
    );
    const loadTone = resolveLoadTone(state.totalTurns, state.messageLimit);
    const loadToneLabel =
      loadTone === "critical"
        ? "已达到提醒上限"
        : loadTone === "warning"
          ? "接近提醒上限"
          : "负载正常";

    hudStats.pillRoot.dataset["loadTone"] = loadTone;
    hudStats.pillRoot.title =
      "负载 " +
      state.totalTurns +
      "/" +
      state.messageLimit +
      "（" +
      loadToneLabel +
      "）；点击打开面板，拖动可移动，拖到屏幕边缘会收成侧边条";
    hudStats.pillRoot.setAttribute(
      "aria-label",
      "长对话负载 " +
        state.totalTurns +
        "/" +
        state.messageLimit +
        "，" +
        loadToneLabel +
        "；消息 " +
        state.totalTurns +
        "，已脱水 " +
        state.hiddenCount +
        "，代码折叠 " +
        state.foldedCodeCount +
        "，虚拟文件 " +
        fileCount +
        "；点击打开面板，拖动可移动，拖到屏幕边缘会收成侧边条",
    );
    hudStats.totalStatusItem.dataset["loadTone"] = loadTone;
    hudStats.pillCount.textContent = String(state.totalTurns);
    hudStats.pillLoadProgress.setAttribute(
      "stroke-dashoffset",
      String(LOAD_RING_CIRCUMFERENCE * (1 - loadProgress)),
    );

    hudStats.warning.hidden = loadTone === "normal";
    hudStats.warning.dataset["tone"] = loadTone;
    hudStats.warningText.textContent =
      loadTone === "critical"
        ? "消息数已达到提醒上限（" +
          state.totalTurns +
          "/" +
          state.messageLimit +
          "）。建议检查脱水效果，或新建对话继续。"
        : loadTone === "warning"
          ? "消息数已接近提醒上限（" +
            state.totalTurns +
            "/" +
            state.messageLimit +
            "）。可检查脱水效果，或新建对话继续。"
          : "";
  }

  function getFocusableElements(): HTMLElement[] {
    if (!hudStats) return [];
    const selector =
      'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [href], [tabindex]:not([tabindex="-1"])';
    return Array.from(
      hudStats.panel.querySelectorAll<HTMLElement>(selector),
    ).filter((node) => {
      if (node.hasAttribute("hidden") || node.closest("[hidden]")) return false;
      const closedDetails = node.closest("details:not([open])");
      if (closedDetails && node.tagName !== "SUMMARY") return false;
      return true;
    });
  }

  function restoreFocus(): void {
    if (!hudStats) return;
    const candidate = focusBeforeOpen;
    focusBeforeOpen = null;
    const target =
      candidate &&
      candidate.isConnected &&
      !candidate.hasAttribute("disabled") &&
      candidate.getAttribute("aria-disabled") !== "true"
        ? candidate
        : hudStats.pillRoot;
    target.focus();
    const active = hudShadowRoot?.activeElement ?? document.activeElement;
    if (active !== target) hudStats.pillRoot.focus();
  }

  function rememberFocus(): void {
    if (!hudStats) return;
    const active = document.activeElement;
    focusBeforeOpen =
      active instanceof HTMLElement &&
      active !== document.body &&
      active !== document.documentElement
        ? active
        : hudStats.pillRoot;
  }

  function applyPanelState(open: boolean): void {
    if (!hudStats) return;
    hudStats.backdrop.classList.toggle("open", open);
    hudStats.backdrop.setAttribute("aria-hidden", String(!open));
    hudStats.panel.setAttribute("aria-hidden", String(!open));
    hudStats.pillRoot.setAttribute("aria-expanded", String(open));
    if (open) {
      hudStats.backdrop.removeAttribute("inert");
    } else {
      hudStats.backdrop.setAttribute("inert", "");
    }
  }

  function togglePanel(forceState?: boolean): void {
    ensureHUDMounted();
    if (!hudStats) return;
    const next =
      typeof forceState === "boolean" ? forceState : !state.hudOpen;
    if (next === state.hudOpen) {
      if (next) searchInput?.focus();
      return;
    }
    if (next) rememberFocus();
    state.hudOpen = next;
    applyPanelState(next);
    if (next) {
      searchInput?.focus();
    } else {
      restoreFocus();
    }
  }

  function handleShadowKeydown(event: Event): void {
    if (!(event instanceof KeyboardEvent)) return;
    if (event.key !== "Tab" || !state.hudOpen || !hudStats) return;
    const focusables = getFocusableElements();
    if (!focusables.length) {
      event.preventDefault();
      hudStats.panel.focus();
      return;
    }
    const active = hudShadowRoot?.activeElement ?? document.activeElement;
    const index = focusables.indexOf(active as HTMLElement);
    if (event.shiftKey) {
      if (index <= 0) {
        event.preventDefault();
        focusables[focusables.length - 1].focus();
      }
      return;
    }
    if (index === -1 || index === focusables.length - 1) {
      event.preventDefault();
      focusables[0].focus();
    }
  }

  function renderSearchResults(queryText: string): void {
    if (!searchResultsBox) return;
    searchResultsBox.textContent = "";
    if (!queryText) return;

    const pendingCount = flushTextIndex();
    const normalizedQuery = queryText.toLowerCase();
    const matches = state.indexedTurns
      .filter((record) => record.text.toLowerCase().includes(normalizedQuery))
      .slice(0, SEARCH_LIMIT);

    if (!matches.length) {
      if (pendingCount === 0) {
        searchResultsBox.appendChild(
          el("div", { className: "result-empty" }, ["没有匹配的消息"]),
        );
        return;
      }
    } else {
      for (const record of matches) {
        const previewText = record.text || "（无文本）";
        const resultText =
          previewText.length > SEARCH_PREVIEW_LIMIT
            ? previewText.slice(0, SEARCH_PREVIEW_LIMIT) + "…"
            : previewText;
        const resultButton = el(
          "button",
          {
            type: "button",
            className: "result-item",
          },
          ["#" + String(record.id + 1) + "  " + resultText],
        );
        resultButton.addEventListener("click", () => {
          const targetElement = record.element;
          if (!(targetElement instanceof Element)) return;
          markRestoredTurn(targetElement);
          targetElement.classList.remove("ai-turbo-dehydrated");
          if (targetElement instanceof HTMLElement) {
            targetElement.style.removeProperty("--turbo-cached-h");
          }
          togglePanel(false);
          targetElement.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
          codeBlocks.requestCodeScanForTurn(targetElement);
          if (targetElement instanceof HTMLElement) {
            targetElement.style.outline = "2px solid rgba(52, 211, 153, 0.85)";
            targetElement.style.outlineOffset = "4px";
            window.setTimeout(() => {
              targetElement.style.outline = "";
              targetElement.style.outlineOffset = "";
            }, 1800);
          }
        });
        searchResultsBox.appendChild(resultButton);
      }
    }

    if (pendingCount > 0) {
      searchResultsBox.appendChild(
        el(
          "div",
          { className: "result-pending", role: "status", "aria-live": "polite" },
          ["正在索引 " + String(pendingCount) + " 条消息…"],
        ),
      );
      if (searchRefreshTimer !== null) {
        window.clearTimeout(searchRefreshTimer);
      }
      searchRefreshTimer = window.setTimeout(() => {
        searchRefreshTimer = null;
        const currentQuery = searchInput?.value.trim() ?? "";
        if (currentQuery === queryText) renderSearchResults(currentQuery);
      }, 200);
    }
  }

  function initPillDrag(pill: HTMLElement): () => void {
    const pillWidth = pill.offsetWidth || 48;
    const pillHeight = pill.offsetHeight || 48;
    let posX = Math.max(8, window.innerWidth - pillWidth - 8);
    let posY = Math.max(8, window.innerHeight - pillHeight - 8);
    let hadSaved = false;

    try {
      const raw = positionStore.read(STORAGE_KEY_POS);
      const saved: unknown = JSON.parse(
        raw === null || raw === "" ? "null" : raw,
      );
      if (isPillPosition(saved)) {
        posX = saved.x;
        posY = saved.y;
        hadSaved = true;
      }
    } catch (error: unknown) {
      reportRecoverableError("restore pill position", error);
    }

    const limits = (): { maxX: number; maxY: number } => ({
      maxX: Math.max(8, window.innerWidth - (pill.offsetWidth || 48) - 8),
      maxY: Math.max(8, window.innerHeight - (pill.offsetHeight || 48) - 8),
    });

    const clamp = (): void => {
      const { maxX, maxY } = limits();
      posX = Math.min(maxX, Math.max(8, posX));
      posY = Math.min(maxY, Math.max(8, posY));
    };

    const apply = (): void => {
      pill.style.left = String(posX) + "px";
      pill.style.top = String(posY) + "px";
    };

    /** Pin the collapsed tab flush against one edge at the current height. */
    const applyDock = (side: HudDockSide): void => {
      const width = pill.offsetWidth || DOCK_TAB_WIDTH;
      const height = pill.offsetHeight || DOCK_TAB_HEIGHT;
      const maxY = Math.max(8, window.innerHeight - height - 8);
      posY = Math.min(maxY, Math.max(8, posY));
      pill.style.left =
        side === "left"
          ? "0px"
          : String(Math.max(0, window.innerWidth - width)) + "px";
      pill.style.top = String(posY) + "px";
    };

    /** A release inside the snap band folds the HUD into that edge. */
    const resolveDockSide = (): HudDockSide | null => {
      const width = pill.offsetWidth || 48;
      const rightGap = window.innerWidth - (posX + width);
      if (posX <= DOCK_EDGE_SNAP) return "left";
      if (rightGap <= DOCK_EDGE_SNAP) return "right";
      return null;
    };

    const persist = (): void => {
      positionStore.writeJson(STORAGE_KEY_POS, { x: posX, y: posY });
    };

    const beforeX = posX;
    const beforeY = posY;
    clamp();
    apply();
    if (hadSaved && (beforeX !== posX || beforeY !== posY)) persist();

    let pointerDown = false;
    let dragStarted = false;
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;

    /*
     * The dock button and the drag release share one controller: docking
     * rewrites the inline position to the edge, undocking nudges the pill back
     * inside the snap band so the next release does not immediately redock.
     */
    dockController = (side, wasDocked = false): void => {
      if (side) {
        applyDock(side);
        return;
      }
      if (wasDocked) {
        const width = pill.offsetWidth || 48;
        if (posX <= DOCK_EDGE_SNAP) posX = 24;
        else if (posX + width >= window.innerWidth - DOCK_EDGE_SNAP) {
          posX = window.innerWidth - width - 24;
        }
      }
      clamp();
      apply();
    };

    const removeMoveListeners = (): void => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    };

    const finishDrag = (): void => {
      pointerDown = false;
      dragStarted = false;
      pill.classList.remove("dragging");
      removeMoveListeners();
    };

    function onPointerMove(event: PointerEvent): void {
      if (!pointerDown) return;
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      if (!dragStarted && Math.sqrt(deltaX * deltaX + deltaY * deltaY) <= 4) {
        return;
      }
      if (!dragStarted) {
        dragStarted = true;
        suppressPillClick = true;
        pill.classList.add("dragging");
      }
      event.preventDefault();
      const { maxX, maxY } = limits();
      posX = Math.min(maxX, Math.max(8, originX + deltaX));
      posY = Math.min(maxY, Math.max(8, originY + deltaY));
      apply();
    }

    function onPointerUp(event: PointerEvent): void {
      if (!pointerDown) return;
      const dragged = dragStarted;
      finishDrag();
      if (dragged) {
        suppressPillClick = true;
        const nextDock = resolveDockSide();
        if (nextDock) {
          setDockSide(nextDock);
          persist();
        } else {
          if (dockSide) setDockSide(null);
          clamp();
          apply();
          persist();
        }
      }
      event.preventDefault();
    }

    function onPointerCancel(): void {
      if (!pointerDown) return;
      const dragged = dragStarted;
      finishDrag();
      if (dragged) {
        suppressPillClick = true;
        if (dockSide) applyDock(dockSide);
        else apply();
        persist();
      }
    }

    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) return;
      suppressPillClick = false;
      pointerDown = true;
      dragStarted = false;
      startX = event.clientX;
      startY = event.clientY;
      if (dockSide) {
        const rect = pill.getBoundingClientRect();
        posX = rect.left;
        posY = rect.top;
      }
      originX = posX;
      originY = posY;
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerCancel);
    };

    const onViewportResize = (): void => {
      if (dockSide) {
        applyDock(dockSide);
        return;
      }
      const beforeX = posX;
      const beforeY = posY;
      clamp();
      apply();
      if (beforeX !== posX || beforeY !== posY) persist();
    };

    pill.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", onViewportResize, { passive: true });
    window.visualViewport?.addEventListener("resize", onViewportResize);

    dockSide = readDockSide();
    syncDockChrome();
    dockController(dockSide);

    return () => {
      removeMoveListeners();
      pill.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onViewportResize);
      window.visualViewport?.removeEventListener("resize", onViewportResize);
      pill.classList.remove("dragging");
      dockController = null;
      pointerDown = false;
      dragStarted = false;
    };
  }

  function buildHUD(): void {
    reasoning.attachStatusNode(reasoningStatusNode);
    toolMemory.attachStatusNode(toolStatusNode);
    if (isEngineDormant()) return;
    if (hudRootElement?.isConnected && hudStats) {
      updateHudDashboard();
      return;
    }

    const mountTarget = document.body || document.documentElement;
    if (!mountTarget) return;

    document.getElementById(HUD_ID)?.remove();
    cleanupPillDrag?.();
    cleanupPillDrag = null;
    unbindThemeWatchers();
    hudStats = null;

    hudRootElement = el("div", {
      id: HUD_ID,
      style:
        "all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;display:block!important;",
    });
    hudShadowRoot = hudRootElement.attachShadow({ mode: "open" });

    const styles = document.createElement("style");
    styles.textContent = HUD_STYLES;
    hudShadowRoot.appendChild(styles);

    const pillCountValue = el("strong", { className: "turbo-count" }, ["0"]);
    const svgNamespace = "http://www.w3.org/2000/svg";
    const pillLoadRing = document.createElementNS(svgNamespace, "svg");
    pillLoadRing.setAttribute("class", "pill-load-ring");
    pillLoadRing.setAttribute("viewBox", "0 0 40 40");
    pillLoadRing.setAttribute("aria-hidden", "true");

    const pillLoadTrack = document.createElementNS(svgNamespace, "circle");
    pillLoadTrack.setAttribute("class", "pill-load-track");
    pillLoadTrack.setAttribute("cx", "20");
    pillLoadTrack.setAttribute("cy", "20");
    pillLoadTrack.setAttribute("r", String(LOAD_RING_RADIUS));

    const pillLoadProgress = document.createElementNS(svgNamespace, "circle");
    pillLoadProgress.setAttribute("class", "pill-load-progress");
    pillLoadProgress.setAttribute("cx", "20");
    pillLoadProgress.setAttribute("cy", "20");
    pillLoadProgress.setAttribute("r", String(LOAD_RING_RADIUS));
    pillLoadProgress.setAttribute(
      "stroke-dasharray",
      String(LOAD_RING_CIRCUMFERENCE),
    );
    pillLoadProgress.setAttribute(
      "stroke-dashoffset",
      String(LOAD_RING_CIRCUMFERENCE),
    );
    pillLoadProgress.setAttribute("transform", "rotate(-90 20 20)");
    pillLoadRing.append(pillLoadTrack, pillLoadProgress);

    const pill = el(
      "button",
      {
        className: "docked-pill",
        id: "pill-trigger",
        type: "button",
        "data-load-tone": "normal",
        title: "负载 0/" + String(state.messageLimit) + "（负载正常）；点击打开面板，拖动可移动",
        "aria-label":
          "长对话负载 0/" +
          String(state.messageLimit) +
          "，负载正常；消息 0，已脱水 0，代码折叠 0，虚拟文件 0；点击打开面板，拖动可移动",
        "aria-haspopup": "dialog",
        "aria-controls": "panel",
        "aria-expanded": "false",
      },
      [
        el("span", { className: "turbo-gauge", "aria-hidden": "true" }, [
          pillLoadRing,
          el("span", { className: "turbo-readout" }, [pillCountValue]),
        ]),
        el("span", { className: "dock-mark", "aria-hidden": "true" }, ["AI"]),
      ],
    );

    pill.addEventListener("click", (event) => {
      if (suppressPillClick) {
        suppressPillClick = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      togglePanel(true);
    });

    const totalVal = el("strong", { className: "status-value" }, ["0"]);
    const hiddenVal = el("strong", { className: "status-value" }, ["0"]);
    const foldedVal = el("strong", { className: "status-value" }, ["0"]);
    const filesVal = el("strong", { className: "status-value" }, ["0"]);

    const totalStatusItem = el("div", { className: "status-item" }, [
      el("span", { className: "status-label" }, ["消息总数"]),
      totalVal,
    ]);
    const statusStrip = el("div", { className: "status-strip" }, [
      totalStatusItem,
      el("div", { className: "status-item" }, [
        el("span", { className: "status-label" }, ["已脱水"]),
        hiddenVal,
      ]),
      el("div", { className: "status-item" }, [
        el("span", { className: "status-label" }, ["代码折叠"]),
        foldedVal,
      ]),
      el("div", { className: "status-item" }, [
        el("span", { className: "status-label" }, ["虚拟文件"]),
        filesVal,
      ]),
    ]);

    const warningText = el("p", { className: "load-warning-text" });
    const warningSearch = el(
      "button",
      { type: "button" },
      ["检索会话"],
    );
    const warningLimit = el(
      "button",
      { type: "button" },
      ["调整提醒上限"],
    );
    const warning = el(
      "div",
      {
        className: "load-warning",
        role: "status",
        "aria-live": "polite",
        hidden: "",
      },
      [
        warningText,
        el("div", { className: "load-warning-actions" }, [
          warningSearch,
          warningLimit,
        ]),
      ],
    );
    warningSearch.addEventListener("click", () => searchInput?.focus());
    warningLimit.addEventListener("click", () => {
      if (advancedSettings) advancedSettings.open = true;
      messageLimitInput?.focus();
      messageLimitInput?.select();
    });

    searchInput = el("input", {
      className: "search-input",
      id: "hud-search",
      type: "text",
      placeholder: "检索当前会话内容...",
      autocomplete: "off",
      "aria-label": "检索当前会话内容",
    });
    searchInput.addEventListener("input", () => {
      if (searchDebounceTimer !== null) {
        window.clearTimeout(searchDebounceTimer);
      }
      const inputElement = searchInput;
      searchDebounceTimer = window.setTimeout(() => {
        renderSearchResults(inputElement?.value.trim() ?? "");
      }, 120);
    });
    searchResultsBox = el("div", { className: "results" });
    const searchSection = el("div", { className: "section" }, [
      el("div", { className: "section-title" }, ["历史检索"]),
      el("div", { className: "search-wrap" }, [searchInput]),
      searchResultsBox,
    ]);

    const forkText = el("span", {}, ["复制原始上下文（回退）"]);
    const btnFork = el(
      "button",
      { className: "action-btn", type: "button" },
      [forkText],
    );
    btnFork.addEventListener("click", () => {
      handoff.exportCleanContext((count) => {
        btnFork.classList.add("copied");
        forkText.textContent = "已复制 " + String(count) + " 条完整消息";
        window.setTimeout(() => {
          btnFork.classList.remove("copied");
          forkText.textContent = "复制原始上下文（回退）";
        }, 2200);
      });
    });

    const btnOneClickHandoff = el(
      "button",
      { className: "action-btn", type: "button" },
      ["一键交接（生成并恢复）"],
    );
    btnOneClickHandoff.addEventListener("click", () =>
      handoff.startOneClickHandoff(),
    );
    const handoffStatusNode = el(
      "div",
      { className: "handoff-status", role: "status", "aria-live": "polite" },
      ["交接状态：未开始"],
    );
    handoff.attachStatusNode(handoffStatusNode);
    const handoffSection = el("div", { className: "section" }, [
      el("div", { className: "section-title" }, ["上下文交接"]),
      btnOneClickHandoff,
      handoffStatusNode,
      btnFork,
    ]);

    chkPrune = el("input", { id: "hud-prune", type: "checkbox" });
    chkCollapse = el("input", { id: "hud-collapse", type: "checkbox" });
    chkVirtualFile = el("input", {
      id: "hud-virtual-file",
      type: "checkbox",
    });
    chkSidebarPeek = el("input", {
      id: "hud-sidebar-peek",
      type: "checkbox",
    });
    chkReasoning = el("input", { id: "hud-reasoning", type: "checkbox" });

    const switchRow = (
      id: string,
      labelText: string,
      input: HTMLInputElement,
    ): HTMLElement =>
      el("div", { className: "control-row" }, [
        el("label", { for: id, className: "control-label" }, [labelText]),
        el("label", { className: "switch" }, [
          input,
          el("span", { className: "slider" }),
        ]),
      ]);

    chkPrune.checked = state.pruneEnabled;
    chkCollapse.checked = state.collapseCode;
    chkVirtualFile.checked = state.virtualFileEnabled;
    chkSidebarPeek.checked = state.sidebarPeekEnabled;
    chkReasoning.checked = state.rememberReasoning;

    chkPrune.addEventListener("change", () => {
      state.pruneEnabled = chkPrune?.checked ?? true;
      saveConfig();
      requestFullTurnSync();
      requestUpdate();
      announce(
        "安全视口脱水" +
          (state.pruneEnabled ? "已开启" : "已关闭") +
          "，设置已保存",
      );
    });
    chkCollapse.addEventListener("change", () => {
      state.collapseCode = chkCollapse?.checked ?? true;
      saveConfig();
      codeBlocks.requestCodeScan();
      requestUpdate();
      announce(
        "长代码自动折叠" +
          (state.collapseCode ? "已开启" : "已关闭") +
          "，设置已保存",
      );
    });
    chkVirtualFile.addEventListener("change", () => {
      state.virtualFileEnabled = chkVirtualFile?.checked ?? true;
      saveConfig();
      if (!state.virtualFileEnabled) clearFiles();
      updateHudDashboard();
      announce(
        "长文本伪文件胶囊" +
          (state.virtualFileEnabled ? "已开启" : "已关闭") +
          "，设置已保存",
      );
    });
    chkSidebarPeek.addEventListener("change", () => {
      state.sidebarPeekEnabled = chkSidebarPeek?.checked ?? true;
      saveConfig();
      deps.syncSidebarPeek();
      announce(
        "悬停展开侧栏" +
          (state.sidebarPeekEnabled ? "已开启" : "已关闭") +
          "，设置已保存",
      );
    });
    chkReasoning.addEventListener("change", () => {
      state.rememberReasoning = chkReasoning?.checked ?? true;
      saveConfig();
      reasoning.scheduleReasoningRestore();
      reasoning.renderReasoningStatus();
      announce(
        "记住推理强度" +
          (state.rememberReasoning ? "已开启" : "已关闭") +
          "，设置已保存",
      );
    });

    const commonRows: HTMLElement[] = [
      switchRow("hud-prune", "安全视口脱水", chkPrune),
      switchRow("hud-collapse", "长代码自动折叠", chkCollapse),
      switchRow("hud-virtual-file", "长文本伪文件胶囊", chkVirtualFile),
      switchRow("hud-sidebar-peek", "悬停展开侧栏", chkSidebarPeek),
      switchRow("hud-reasoning", "记住推理强度", chkReasoning),
      reasoningStatusNode,
    ];

    if (currentPlatform.supportsToolMemory === true) {
      const toolInput = el("input", { id: "hud-tools", type: "checkbox" });
      toolInput.checked = state.rememberTools;
      toolInput.addEventListener("change", () => {
        state.rememberTools = toolInput.checked;
        saveConfig();
        toolMemory.scheduleRestore();
        toolMemory.renderStatus();
        announce(
          "记住工具选择" +
            (state.rememberTools ? "已开启" : "已关闭") +
            "，设置已保存",
        );
      });
      chkTools = toolInput;
      commonRows.push(
        switchRow("hud-tools", "记住工具选择", toolInput),
        toolStatusNode,
      );
    }

    const commonSection = el("div", { className: "section" }, [
      el("div", { className: "section-title" }, ["常用开关"]),
      el("p", { className: "settings-hint" }, [
        "修改会立即生效并自动保存。",
      ]),
      ...commonRows,
    ]);

    keepValue = el("span", { id: "keep-val" }, [String(state.keepTurns)]);
    const stepDec = el(
      "button",
      {
        type: "button",
        "aria-label": "减少活跃保留轮次",
      },
      ["−"],
    );
    const stepInc = el(
      "button",
      {
        type: "button",
        "aria-label": "增加活跃保留轮次",
      },
      ["+"],
    );
    stepDec.addEventListener("click", () => {
      if (state.keepTurns <= 2) return;
      state.keepTurns--;
      if (keepValue) keepValue.textContent = String(state.keepTurns);
      saveConfig();
      requestFullTurnSync();
      requestUpdate();
      announce("活跃保留轮次：" + String(state.keepTurns) + "，设置已保存");
    });
    stepInc.addEventListener("click", () => {
      if (state.keepTurns >= 50) return;
      state.keepTurns++;
      if (keepValue) keepValue.textContent = String(state.keepTurns);
      saveConfig();
      requestFullTurnSync();
      requestUpdate();
      announce("活跃保留轮次：" + String(state.keepTurns) + "，设置已保存");
    });

    const limitInput = el("input", {
      className: "limit-input",
      id: "message-limit",
      type: "number",
      min: String(MESSAGE_LIMIT_MIN),
      max: String(MESSAGE_LIMIT_MAX),
      step: "1",
      value: String(state.messageLimit),
      title:
        "消息提醒上限，范围 " +
        String(MESSAGE_LIMIT_MIN) +
        " 至 " +
        String(MESSAGE_LIMIT_MAX),
      "aria-label": "消息提醒上限",
    });
    limitInput.value = String(state.messageLimit);
    limitInput.addEventListener("change", () => {
      const rawValue = limitInput.value.trim();
      if (rawValue === "") {
        limitInput.value = String(state.messageLimit);
        return;
      }
      const numericLimit = Number(rawValue);
      if (
        !Number.isInteger(numericLimit) ||
        numericLimit < MESSAGE_LIMIT_MIN ||
        numericLimit > MESSAGE_LIMIT_MAX
      ) {
        limitInput.value = String(state.messageLimit);
        return;
      }
      state.messageLimit = numericLimit;
      limitInput.value = String(state.messageLimit);
      saveConfig();
      updateHudDashboard();
      announce(
        "消息提醒上限：" + String(state.messageLimit) + "，设置已保存",
      );
    });
    messageLimitInput = limitInput;

    themeSelect = el("select", {
      className: "theme-select",
      id: "hud-theme",
      "aria-label": "界面主题",
    });
    for (const option of [
      ["auto", "自动"],
      ["light", "浅色"],
      ["dark", "深色"],
    ] as const) {
      themeSelect.appendChild(
        el("option", { value: option[0] }, [option[1]]),
      );
    }
    themeSelect.value = state.hudTheme;
    themeSelect.addEventListener("change", () => {
      state.hudTheme = parseHudTheme(themeSelect?.value);
      if (themeSelect) themeSelect.value = state.hudTheme;
      saveConfig();
      syncTheme();
      const label =
        state.hudTheme === "auto"
          ? "自动"
          : state.hudTheme === "light"
            ? "浅色"
            : "深色";
      announce("界面主题：" + label + "，设置已保存");
    });

    const resetButton = el(
      "button",
      { className: "action-btn reset-btn", type: "button" },
      ["恢复默认设置"],
    );
    resetButton.addEventListener("click", resetAllSettings);

    const advancedBody = el("div", { className: "advanced-body" }, [
      el("div", { className: "control-row" }, [
        el("span", {}, ["活跃保留轮次"]),
        el("div", { className: "stepper" }, [stepDec, keepValue, stepInc]),
      ]),
      el("div", { className: "control-row" }, [
        el("label", { for: "message-limit" }, ["消息提醒上限"]),
        el("div", { className: "limit-control" }, [
          limitInput,
          el("span", { className: "limit-unit" }, ["条"]),
        ]),
      ]),
      el("div", { className: "control-row" }, [
        el("label", { for: "hud-theme" }, ["界面主题"]),
        themeSelect,
      ]),
      resetButton,
    ]);
    advancedSettings = el(
      "details",
      { className: "section advanced", id: "advanced-settings" },
      [
        el("summary", {}, ["高级设置"]),
        advancedBody,
      ],
    );

    const btnClose = el(
      "button",
      {
        className: "close-btn",
        type: "button",
        "aria-label": "关闭面板",
      },
      ["✕"],
    );
    btnClose.addEventListener("click", () => togglePanel(false));

    const btnDock = el(
      "button",
      {
        className: "dock-btn",
        type: "button",
        title: "贴到屏幕边缘，收成侧边信息条",
        "aria-label": "把信息面板贴到屏幕边缘",
        "aria-pressed": "false",
      },
      ["贴边"],
    );
    btnDock.addEventListener("click", () => {
      if (dockSide) {
        setDockSide(null);
        announce("已取消贴边，恢复悬浮仪表");
        return;
      }
      const pillCenter = pill.offsetLeft + pill.offsetWidth / 2;
      const side: HudDockSide =
        pillCenter < window.innerWidth / 2 ? "left" : "right";
      setDockSide(side);
      announce(side === "left" ? "已贴到左侧边缘" : "已贴到右侧边缘");
    });

    const panelHeader = el("div", { className: "header" }, [
      el("div", {}, [
        el("div", { className: "brand-title", id: "hud-title" }, [
          "AI Turbo Engine",
        ]),
        el("div", { className: "brand-subtitle" }, [
          currentPlatform.name + " · v" + VERSION,
        ]),
      ]),
      el("div", { className: "header-actions" }, [btnDock, btnClose]),
    ]);

    const footerHint = el("div", { className: "footer-hint" }, [
      el("kbd", {}, ["Alt"]),
      " + ",
      el("kbd", {}, ["T"]),
      " 呼出 / 收起 · ",
      el("kbd", {}, ["Esc"]),
      " 退出",
    ]);

    const liveRegion = el("div", {
      className: "sr-live",
      role: "status",
      "aria-live": "polite",
      "aria-atomic": "true",
    });

    const panel = el(
      "div",
      {
        className: "hud-panel",
        id: "panel",
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "hud-title",
        "aria-hidden": "true",
        tabindex: "-1",
      },
      [
        panelHeader,
        statusStrip,
        warning,
        searchSection,
        handoffSection,
        commonSection,
        advancedSettings,
        footerHint,
        liveRegion,
      ],
    );

    const backdrop = el(
      "div",
      {
        className: "modal-backdrop",
        id: "backdrop",
        "aria-hidden": "true",
        inert: "",
      },
      [panel],
    );
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) togglePanel(false);
    });

    hudShadowRoot.append(pill, backdrop);
    mountTarget.appendChild(hudRootElement);
    hudShadowRoot.addEventListener("keydown", handleShadowKeydown);

    hudStats = {
      total: totalVal,
      hidden: hiddenVal,
      folded: foldedVal,
      files: filesVal,
      totalStatusItem,
      warning,
      warningText,
      panel,
      backdrop,
      pillRoot: pill,
      dockButton: btnDock,
      pillCount: pillCountValue,
      pillLoadProgress,
      liveRegion,
      signature: "",
    };
    syncControls();
    bindThemeWatchers();
    applyPanelState(state.hudOpen);
    updateHudDashboard();
    cleanupPillDrag = initPillDrag(pill);
    if (state.hudOpen) searchInput.focus();
  }

  function ensureHUDMounted(): void {
    if (isEngineDormant()) return;
    injectStyles();
    if (!hudRootElement?.isConnected) {
      buildHUD();
    } else if (document.body && hudRootElement.parentElement !== document.body) {
      document.body.appendChild(hudRootElement);
    }
  }

  function teardown(): void {
    if (searchDebounceTimer !== null) {
      window.clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
    }
    if (announceTimer !== null) {
      window.clearTimeout(announceTimer);
      announceTimer = null;
    }
    if (searchRefreshTimer !== null) {
      window.clearTimeout(searchRefreshTimer);
      searchRefreshTimer = null;
    }
    cleanupPillDrag?.();
    cleanupPillDrag = null;
    unbindThemeWatchers();
    document.getElementById(HUD_ID)?.remove();
    hudRootElement = null;
    hudShadowRoot = null;
    hudStats = null;
    searchInput = null;
    searchResultsBox = null;
    keepValue = null;
    messageLimitInput = null;
    themeSelect = null;
    advancedSettings = null;
    chkPrune = null;
    chkCollapse = null;
    chkVirtualFile = null;
    chkSidebarPeek = null;
    chkReasoning = null;
    chkTools = null;
    focusBeforeOpen = null;
    suppressPillClick = false;
    state.hudOpen = false;
  }

  return {
    buildHUD,
    ensureHUDMounted,
    togglePanel,
    updateHudDashboard,
    teardown,
  };
}
