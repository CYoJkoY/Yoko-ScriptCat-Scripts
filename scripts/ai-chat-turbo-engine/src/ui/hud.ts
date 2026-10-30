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
  STORAGE_KEY_POS,
} from "../config";
import type { CodeBlockUtils } from "./code-blocks";
import type { ElementFactory } from "./code-blocks";
import type { ReasoningUtils } from "../core/reasoning";
import type { HandoffUtils } from "../core/handoff";
import { reportRecoverableError } from "../core/diagnostics";
import type { EngineState } from "../state";
import { createReportedStorage } from "../storage/reported";

const positionStore = createReportedStorage("localStorage", (failure) => {
  const scope =
    failure.operation === "write" || failure.operation === "remove"
      ? "save pill position"
      : "restore pill position";
  reportRecoverableError(scope, failure.error);
});

interface HudRefs {
  total: HTMLElement;
  hidden: HTMLElement;
  folded: HTMLElement;
  totalStatusItem: HTMLElement;
  pillRoot: HTMLElement;
  pillCount: HTMLElement;
  pillLimit: HTMLElement;
  pillLoadProgress: SVGElement;
  signature: string;
}

export interface HudDeps {
  el: ElementFactory;
  state: EngineState;
  currentPlatform: PlatformDefinition;
  version: string;
  reasoningStatusNode: HTMLElement;
  codeBlocks: Pick<CodeBlockUtils, "requestCodeScan">;
  reasoning: Pick<
    ReasoningUtils,
    "attachStatusNode" | "scheduleReasoningRestore" | "renderReasoningStatus"
  >;
  handoff: HandoffUtils;
  isEngineDormant: () => boolean;
  requestUpdate: () => void;
  requestFullTurnSync: () => void;
  saveConfig: () => void;
  activeFileCount: () => number;
  clearFiles: () => void;
  injectStyles: () => void;
}

interface PillPosition {
  readonly x: number;
  readonly y: number;
}

/** Guard the persisted drag position so a malformed payload keeps the default. */
function isPillPosition(value: unknown): value is PillPosition {
  if (typeof value !== "object" || value === null) return false;
  if (!("x" in value) || !("y" in value)) return false;
  return typeof value.x === "number" && typeof value.y === "number";
}

export interface HudUtils {
  buildHUD(): void;
  ensureHUDMounted(): void;
  togglePanel(forceState?: boolean): void;
  updateHudDashboard(): void;
  teardown(): void;
}

export function createHudUtils(deps: HudDeps): HudUtils {
  const {
    el,
    state,
    currentPlatform,
    version: VERSION,
    reasoningStatusNode,
    codeBlocks,
    reasoning,
    handoff,
    isEngineDormant,
    requestUpdate,
    requestFullTurnSync,
    saveConfig,
    activeFileCount,
    clearFiles,
    injectStyles,
  } = deps;

  let hudRootElement: HTMLElement | null = null;
  let hudShadowRoot: ShadowRoot | null = null;
  let hudStats: HudRefs | null = null;
  let searchInput: HTMLInputElement | null = null;
  let searchResultsBox: HTMLElement | null = null;
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
function resolveLoadTone(
  totalTurns: number,
  messageLimit: number,
): "critical" | "warning" | "normal" {
  const loadRatio = messageLimit > 0 ? totalTurns / messageLimit : 0;
  if (loadRatio >= 1) return "critical";
  if (loadRatio >= LOAD_WARNING_RATIO) return "warning";
  return "normal";
}

function updateHudDashboard() {
  if (!hudStats) return;
  /* Rewriting identical text still invalidates style and paint. */
  const hudSignature = `${state.totalTurns}|${state.hiddenCount}|${state.foldedCodeCount}|${activeFileCount()}|${state.messageLimit}`;
  if (hudStats.signature === hudSignature) return;
  hudStats.signature = hudSignature;
  hudStats.total.textContent = String(state.totalTurns);
  hudStats.hidden.textContent = String(state.hiddenCount);
  hudStats.folded.textContent = String(state.foldedCodeCount);

  const loadProgress = Math.min(
    1,
    Math.max(0, state.totalTurns) / state.messageLimit,
  );
  const loadTone = resolveLoadTone(state.totalTurns, state.messageLimit);
  const loadToneLabel =
    loadTone === "critical"
      ? "已达到提醒上限"
      : loadTone === "warning"
        ? "接近提醒上限"
        : "负载正常";

  if (hudStats.pillRoot) {
    hudStats.pillRoot.dataset["loadTone"] = loadTone;
    hudStats.pillRoot.title = `长对话负载 ${state.totalTurns}/${state.messageLimit}（${loadToneLabel}，仅按消息数估算） · 消息 ${state.totalTurns} · 已脱水 ${state.hiddenCount} · 代码折叠 ${state.foldedCodeCount} · 虚拟文件 ${activeFileCount()}；点击打开面板，拖动可移动`;
    hudStats.pillRoot.setAttribute(
      "aria-label",
      `长对话负载 ${state.totalTurns}/${state.messageLimit}，${loadToneLabel}；消息 ${state.totalTurns}，已脱水 ${state.hiddenCount}，代码折叠 ${state.foldedCodeCount}，虚拟文件 ${activeFileCount()}；点击打开面板，拖动可移动`,
    );
  }
  if (hudStats.totalStatusItem) {
    hudStats.totalStatusItem.dataset["loadTone"] = loadTone;
  }
  if (hudStats.pillCount) {
    hudStats.pillCount.textContent = String(state.totalTurns);
  }
  if (hudStats.pillLimit) {
    hudStats.pillLimit.textContent = `/${state.messageLimit}`;
  }
  hudStats.pillLoadProgress?.setAttribute(
    "stroke-dashoffset",
    String(LOAD_RING_CIRCUMFERENCE * (1 - loadProgress)),
  );
}

function togglePanel(forceState?: boolean): void {
  ensureHUDMounted();
  if (!hudRootElement || !hudShadowRoot) return;

  state.hudOpen =
    typeof forceState === "boolean" ? forceState : !state.hudOpen;

  const backdrop = hudShadowRoot.querySelector("#backdrop");
  backdrop?.classList.toggle("open", state.hudOpen);

  if (state.hudOpen) {
    window.setTimeout(() => searchInput?.focus(), 60);
  }
}

function renderSearchResults(queryText: string): void {
  if (!searchResultsBox) return;
  searchResultsBox.textContent = "";
  if (!queryText) return;

  const normalizedQuery = queryText.toLowerCase();
  const matches = state.indexedTurns
    .filter((record) => record.text.toLowerCase().includes(normalizedQuery))
    .slice(0, SEARCH_LIMIT);

  if (!matches.length) {
    searchResultsBox.appendChild(
      el("div", { className: "result-empty" }, ["没有匹配的消息"]),
    );
    return;
  }

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
        onclick: () => {
          if (!(record.element instanceof HTMLElement)) return;
          const targetElement = record.element;
          togglePanel(false);
          targetElement.classList.remove("ai-turbo-dehydrated");
          targetElement.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
          targetElement.style.outline =
            "2px solid rgba(52, 211, 153, 0.85)";
          targetElement.style.outlineOffset = "4px";

          window.setTimeout(() => {
            targetElement.style.outline = "";
            targetElement.style.outlineOffset = "";
          }, 1800);
        },
      },
      [`#${record.id + 1}  ${resultText}`],
    );
    searchResultsBox.appendChild(resultButton);
  }
}

function buildHUD() {
  reasoning.attachStatusNode(reasoningStatusNode);
  if (isEngineDormant()) return;
  if (hudRootElement?.isConnected) return;

  const mountTarget = document.body || document.documentElement;
  if (!mountTarget) return;

  document.getElementById(HUD_ID)?.remove();

  hudRootElement = el("div", {
    id: HUD_ID,
    style:
      "all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;display:block!important;",
  });

  hudShadowRoot = hudRootElement.attachShadow({ mode: "open" });

  const styles = document.createElement("style");
  styles.textContent = `
    * { box-sizing: border-box; }
    button, input { font: inherit; }

    .docked-pill {
      --turbo-tone: #5eead4;
      --turbo-tone-strong: #34d399;
      --turbo-muted: #8ba39a;
      --turbo-surface: rgba(12, 18, 20, 0.97);
      --turbo-border: rgba(94, 234, 212, 0.3);
      --turbo-track: rgba(148, 163, 184, 0.22);
      --turbo-glow: rgba(16, 185, 129, 0.14);
      pointer-events: auto;
      position: fixed;
      display: grid;
      width: 48px;
      height: 48px;
      padding: 0;
      place-items: center;
      border-radius: 15px;
      background: var(--turbo-surface);
      border: 1px solid var(--turbo-border);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(255, 255, 255, 0.02) inset;
      color: var(--turbo-tone);
      font: 650 11px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      cursor: grab;
      user-select: none;
      touch-action: none;
      transition: background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
    }
    .docked-pill[data-load-tone="warning"] {
      --turbo-tone: #fbbf24;
      --turbo-tone-strong: #f59e0b;
      --turbo-muted: #c7a766;
      --turbo-surface: rgba(38, 29, 10, 0.97);
      --turbo-border: rgba(251, 191, 36, 0.52);
      --turbo-track: rgba(251, 191, 36, 0.18);
      --turbo-glow: rgba(245, 158, 11, 0.2);
    }
    .docked-pill[data-load-tone="critical"] {
      --turbo-tone: #fb7185;
      --turbo-tone-strong: #ef4444;
      --turbo-muted: #c99a9f;
      --turbo-surface: rgba(45, 13, 18, 0.97);
      --turbo-border: rgba(251, 113, 133, 0.58);
      --turbo-track: rgba(251, 113, 133, 0.2);
      --turbo-glow: rgba(239, 68, 68, 0.24);
    }
    .turbo-gauge { position: relative; display: grid; width: 40px; height: 40px; place-items: center; }
    .pill-load-ring { position: absolute; inset: 0; display: block; width: 40px; height: 40px; overflow: visible; }
    .pill-load-track { fill: none; stroke: var(--turbo-track); stroke-width: 2.4; }
    .pill-load-progress { fill: none; stroke: var(--turbo-tone-strong); stroke-width: 2.4; stroke-linecap: round; transition: stroke-dashoffset 220ms cubic-bezier(0.16, 1, 0.3, 1), stroke 180ms ease; }
    .turbo-readout { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; line-height: 1; pointer-events: none; }
    .turbo-count { color: var(--turbo-tone); font-size: 11px; font-weight: 850; letter-spacing: -0.45px; font-variant-numeric: tabular-nums; }
    .turbo-limit { color: var(--turbo-muted); font-size: 8px; font-weight: 700; letter-spacing: -0.3px; font-variant-numeric: tabular-nums; }
    .docked-pill:active { cursor: grabbing; }
    .docked-pill:hover {
      border-color: var(--turbo-tone);
      box-shadow: 0 10px 28px var(--turbo-glow), 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
      transform: translateY(-1px) scale(1.02);
    }

    .modal-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transition: opacity 180ms ease, visibility 180ms ease;
    }
    .modal-backdrop.open {
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
    }

    .hud-panel {
      pointer-events: auto;
      width: 392px;
      max-width: 94vw;
      max-height: calc(100vh - 48px);
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
      scrollbar-color: rgba(148, 163, 184, 0.3) transparent;
      padding: 18px;
      border: 1px solid rgba(153, 166, 161, 0.19);
      border-radius: 14px;
      background: #0c1012;
      box-shadow: 0 26px 70px rgba(0, 0, 0, 0.48);
      color: #e2ebe6;
      transform: scale(0.96);
      transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .modal-backdrop.open .hud-panel { transform: scale(1); }

    @supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
      .hud-panel {
        background: rgba(12, 16, 18, 0.9);
        -webkit-backdrop-filter: blur(18px) saturate(140%);
        backdrop-filter: blur(18px) saturate(140%);
      }
    }

    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .brand-title { font-size: 13px; font-weight: 700; color: #f8fafc; }
    .brand-subtitle { font-size: 10px; color: #64748b; margin-top: 1px; }
    .close-btn { background: transparent; border: 0; color: #64748b; cursor: pointer; padding: 4px; border-radius: 6px; }
    .close-btn:hover { color: #f8fafc; background: rgba(255, 255, 255, 0.08); }

    .status-strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 12px; }
    .status-item { padding: 9px; border: 1px solid rgba(153, 166, 161, 0.11); border-radius: 9px; background: #101517; text-align: center; }
    .status-label { font-size: 9px; color: #64748b; display: block; }
    .status-value { font-size: 14px; font-weight: 700; color: #e8efeb; margin-top: 2px; font-variant-numeric: tabular-nums; }
    .status-item[data-load-tone="warning"] { border-color: rgba(251, 191, 36, 0.32); background: rgba(251, 191, 36, 0.06); }
    .status-item[data-load-tone="warning"] .status-value { color: #fbbf24; }
    .status-item[data-load-tone="critical"] { border-color: rgba(251, 113, 133, 0.38); background: rgba(251, 113, 133, 0.07); }
    .status-item[data-load-tone="critical"] .status-value { color: #fb7185; }

    .section { padding-top: 10px; border-top: 1px solid rgba(153, 166, 161, 0.1); }
    .section-title { font-size: 10px; font-weight: 700; color: #68746f; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.04em; }
    .control-row { display: flex; align-items: center; justify-content: space-between; min-height: 32px; margin-bottom: 6px; font-size: 11px; color: #c9d3ce; }

    .stepper { display: inline-flex; align-items: center; border: 1px solid rgba(153, 166, 161, 0.15); border-radius: 8px; background: #0f1315; }
    .stepper button { width: 26px; height: 24px; border: 0; background: transparent; color: #94a3b8; cursor: pointer; }
    .stepper button:hover { background: rgba(101, 210, 164, 0.07); color: #72d6ab; }
    .stepper span { min-width: 28px; text-align: center; font-size: 11px; font-family: ui-monospace, monospace; }
    .limit-control { display: inline-flex; align-items: center; gap: 5px; }
    .limit-input { width: 54px; height: 24px; padding: 0 6px; border: 1px solid rgba(153, 166, 161, 0.15); border-radius: 7px; background: #0f1315; color: #e8efeb; font: 650 11px/1 ui-monospace, monospace; text-align: right; font-variant-numeric: tabular-nums; }
    .limit-input:hover { border-color: rgba(101, 210, 164, 0.28); }
    .limit-unit { color: #64748b; font-size: 10px; }

    .switch { position: relative; width: 34px; height: 20px; }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider { position: absolute; inset: 0; border-radius: 999px; background: rgba(148, 163, 184, 0.2); cursor: pointer; transition: 150ms; }
    .slider::before { content: ""; position: absolute; width: 14px; height: 14px; left: 3px; top: 3px; border-radius: 50%; background: #fff; transition: 150ms; }
    .switch input:checked + .slider { background: #10b981; }
    .switch input:checked + .slider::before { transform: translateX(14px); }

    .action-btn { width: 100%; height: 34px; margin-top: 10px; border: 1px solid rgba(153, 166, 161, 0.15); border-radius: 8px; background: #111719; color: #ccd6d1; font-size: 11px; font-weight: 600; cursor: pointer; transition: 140ms ease; }
    .action-btn:hover { background: rgba(101, 210, 164, 0.07); border-color: rgba(101, 210, 164, 0.25); color: #72d6ab; }
    .action-btn.copied { background: rgba(16, 185, 129, 0.2); color: #6ee7b7; border-color: rgba(52, 211, 153, 0.4); }
    .handoff-status { margin-top: 8px; color: #8da097; font-size: 10px; line-height: 1.5; overflow-wrap: anywhere; }
    .reasoning-status { margin-top: 6px; color: #8da097; font-size: 10px; line-height: 1.5; overflow-wrap: anywhere; }
    .reasoning-status:empty { display: none; }
    .reasoning-status button { margin-left: 6px; padding: 0 4px; border: 1px solid rgba(148, 163, 184, 0.25); border-radius: 4px; background: transparent; color: #72d6ab; font-size: 10px; line-height: 1.6; cursor: pointer; }
    .reasoning-status button:hover { border-color: rgba(101, 210, 164, 0.55); }

    .search-wrap { position: relative; margin-top: 8px; }
    .search-input { width: 100%; height: 34px; padding: 0 10px; border: 1px solid rgba(153, 166, 161, 0.16); border-radius: 8px; background: #0f1416; color: #e6eeea; font-size: 11px; outline: none; }
    .search-input:focus { border-color: rgba(101, 210, 164, 0.48); }
    .results { max-height: 120px; overflow-y: auto; margin-top: 6px; display: grid; gap: 4px; }
    .result-item, .result-empty { padding: 6px 8px; font-size: 10px; border-radius: 7px; background: #101517; color: #cbd5e1; border: none; text-align: left; cursor: pointer; }
    .result-item { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .result-item:hover { background: rgba(101, 210, 164, 0.07); color: #72d6ab; }
    .result-empty { text-align: center; color: #64748b; }
    .footer-hint { margin-top: 12px; font-size: 9.5px; color: #475569; text-align: center; }
    kbd { padding: 2px 4px; border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 4px; color: #94a3b8; font-family: ui-monospace, monospace; }

    .hud-panel button:focus-visible,
    .hud-panel input:focus-visible,
    .docked-pill:focus-visible { outline: 2px solid var(--turbo-tone, #65d2a4); outline-offset: 2px; }

    @media (prefers-reduced-motion: reduce) {
      .modal-backdrop, .hud-panel, .docked-pill, .pill-load-progress { transition: none !important; }
    }
  `;
  hudShadowRoot.appendChild(styles);

  const pillCountValue = el("strong", { className: "turbo-count" }, ["0"]);
  const pillLimitValue = el("span", { className: "turbo-limit" }, [
    `/${state.messageLimit}`,
  ]);

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
      title: `长对话负载 0/${state.messageLimit}（负载正常，仅按消息数估算） · 消息 0 · 已脱水 0 · 代码折叠 0 · 虚拟文件 0；点击打开面板，拖动可移动`,
      "aria-label": `长对话负载 0/${state.messageLimit}，负载正常；消息 0，已脱水 0，代码折叠 0，虚拟文件 0；点击打开面板，拖动可移动`,
    },
    [
      el("span", { className: "turbo-gauge", "aria-hidden": "true" }, [
        pillLoadRing,
        el("span", { className: "turbo-readout" }, [
          pillCountValue,
          pillLimitValue,
        ]),
      ]),
    ],
  );

  const totalVal = el(
    "strong",
    { className: "status-value", id: "total-val" },
    ["0"],
  );
  const hiddenVal = el(
    "strong",
    { className: "status-value", id: "hidden-val" },
    ["0"],
  );
  const foldedVal = el(
    "strong",
    { className: "status-value", id: "folded-val" },
    ["0"],
  );

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
  ]);

  const keepVal = el("span", { id: "keep-val" }, [String(state.keepTurns)]);
  const stepDec = el(
    "button",
    {
      type: "button",
      onclick: () => {
        if (state.keepTurns <= 2) return;
        state.keepTurns--;
        keepVal.textContent = String(state.keepTurns);
        saveConfig();
        requestFullTurnSync();
        requestUpdate();
      },
    },
    ["−"],
  );
  const stepInc = el(
    "button",
    {
      type: "button",
      onclick: () => {
        if (state.keepTurns >= 50) return;
        state.keepTurns++;
        keepVal.textContent = String(state.keepTurns);
        saveConfig();
        requestFullTurnSync();
        requestUpdate();
      },
    },
    ["+"],
  );

  const messageLimitInput = el("input", {
    className: "limit-input",
    id: "message-limit",
    type: "number",
    min: String(MESSAGE_LIMIT_MIN),
    max: String(MESSAGE_LIMIT_MAX),
    step: "1",
    value: String(state.messageLimit),
    title: `消息提醒上限，范围 ${MESSAGE_LIMIT_MIN} 至 ${MESSAGE_LIMIT_MAX}`,
    "aria-label": "消息提醒上限",
    onchange: () => {
      const rawValue = messageLimitInput.value.trim();
      if (rawValue === "") {
        messageLimitInput.value = String(state.messageLimit);
        return;
      }
      const numericLimit = Number(rawValue);
      if (
        !Number.isInteger(numericLimit) ||
        numericLimit < MESSAGE_LIMIT_MIN ||
        numericLimit > MESSAGE_LIMIT_MAX
      ) {
        messageLimitInput.value = String(state.messageLimit);
        return;
      }
      state.messageLimit = numericLimit;
      messageLimitInput.value = String(state.messageLimit);
      saveConfig();
      updateHudDashboard();
    },
  });

  const chkPrune = el("input", {
    type: "checkbox",
    checked: state.pruneEnabled ? "checked" : "",
    onchange: () => {
      state.pruneEnabled = chkPrune.checked;
      saveConfig();
      requestFullTurnSync();
      requestUpdate();
    },
  });

  const chkCollapse = el("input", {
    type: "checkbox",
    checked: state.collapseCode ? "checked" : "",
    onchange: () => {
      state.collapseCode = chkCollapse.checked;
      saveConfig();
      codeBlocks.requestCodeScan();
      requestUpdate();
    },
  });

  const chkVirtualFile = el("input", {
    type: "checkbox",
    checked: state.virtualFileEnabled ? "checked" : "",
    onchange: () => {
      state.virtualFileEnabled = chkVirtualFile.checked;
      saveConfig();
      if (!state.virtualFileEnabled) {
        clearFiles();
      }
    },
  });

  const chkReasoning = el("input", {
    type: "checkbox",
    checked: state.rememberReasoning ? "checked" : "",
    onchange: () => {
      state.rememberReasoning = chkReasoning.checked;
      saveConfig();
      // 关闭时也要调用：它会先清掉轮询定时器
      reasoning.scheduleReasoningRestore();
      reasoning.renderReasoningStatus();
    },
  });

  const forkText = el("span", { id: "fork-text" }, [
    "复制原始上下文（回退）",
  ]);
  const btnFork = el(
    "button",
    {
      className: "action-btn",
      type: "button",
      onclick: () => {
        handoff.exportCleanContext((count) => {
          btnFork.classList.add("copied");
          forkText.textContent = `已复制 ${count} 条完整消息`;
          window.setTimeout(() => {
            btnFork.classList.remove("copied");
            forkText.textContent = "复制原始上下文（回退）";
          }, 2200);
        });
      },
    },
    [forkText],
  );

  const btnOneClickHandoff = el(
    "button",
    {
      className: "action-btn",
      type: "button",
      onclick: () => handoff.startOneClickHandoff(),
    },
    ["一键交接（生成并恢复）"],
  );
  const handoffStatusNode = el(
    "div",
    { className: "handoff-status", role: "status", "aria-live": "polite" },
    ["交接状态：未开始"],
  );
  handoff.attachStatusNode(handoffStatusNode);

  const strategySection = el("div", { className: "section" }, [
    el("div", { className: "section-title" }, ["引擎策略"]),
    el("div", { className: "control-row" }, [
      el("span", {}, ["活跃保留轮次"]),
      el("div", { className: "stepper" }, [stepDec, keepVal, stepInc]),
    ]),
    el("div", { className: "control-row" }, [
      el("label", { htmlFor: "message-limit" }, ["消息提醒上限"]),
      el("div", { className: "limit-control" }, [
        messageLimitInput,
        el("span", { className: "limit-unit" }, ["条"]),
      ]),
    ]),
    el("div", { className: "control-row" }, [
      el("span", {}, ["安全视口脱水"]),
      el("label", { className: "switch" }, [
        chkPrune,
        el("span", { className: "slider" }),
      ]),
    ]),
    el("div", { className: "control-row" }, [
      el("span", {}, ["长代码自动折叠"]),
      el("label", { className: "switch" }, [
        chkCollapse,
        el("span", { className: "slider" }),
      ]),
    ]),
    el("div", { className: "control-row" }, [
      el("span", {}, ["长文本伪文件胶囊"]),
      el("label", { className: "switch" }, [
        chkVirtualFile,
        el("span", { className: "slider" }),
      ]),
    ]),
    el("div", { className: "control-row" }, [
      el("span", {}, ["记住推理强度"]),
      el("label", { className: "switch" }, [
        chkReasoning,
        el("span", { className: "slider" }),
      ]),
    ]),
    reasoningStatusNode,
  ]);

  const handoffSection = el("div", { className: "section" }, [
    el("div", { className: "section-title" }, ["上下文交接"]),
    btnOneClickHandoff,
    handoffStatusNode,
    btnFork,
  ]);

  searchInput = el("input", {
    className: "search-input",
    type: "text",
    placeholder: "检索当前会话内容...",
    autocomplete: "off",
    oninput: () => {
      if (searchDebounceTimer !== null) {
        window.clearTimeout(searchDebounceTimer);
      }
      const inputElement = searchInput;
      searchDebounceTimer = window.setTimeout(() => {
        renderSearchResults(inputElement?.value.trim() ?? "");
      }, 100);
    },
  });
  searchResultsBox = el("div", { className: "results" });

  const searchSection = el("div", { className: "section" }, [
    el("div", { className: "section-title" }, ["历史检索"]),
    el("div", { className: "search-wrap" }, [searchInput]),
    searchResultsBox,
  ]);

  const btnClose = el(
    "button",
    {
      className: "close-btn",
      type: "button",
      "aria-label": "关闭",
      onclick: () => togglePanel(false),
    },
    ["✕"],
  );

  const panelHeader = el("div", { className: "header" }, [
    el("div", {}, [
      el("div", { className: "brand-title" }, ["AI Turbo Engine"]),
      el("div", { className: "brand-subtitle" }, [
        `${currentPlatform.name} · v${VERSION}`,
      ]),
    ]),
    btnClose,
  ]);

  const footerHint = el("div", { className: "footer-hint" }, [
    el("kbd", {}, ["Alt"]),
    " + ",
    el("kbd", {}, ["T"]),
    " 呼出 / 收起 · ",
    el("kbd", {}, ["Esc"]),
    " 退出",
  ]);

  const panel = el("div", { className: "hud-panel", id: "panel" }, [
    panelHeader,
    statusStrip,
    strategySection,
    handoffSection,
    searchSection,
    footerHint,
  ]);

  const backdrop = el(
    "div",
    {
      className: "modal-backdrop",
      id: "backdrop",
      onclick: (e) => {
        if (e.target === backdrop) togglePanel(false);
      },
    },
    [panel],
  );

  hudShadowRoot.append(pill, backdrop);
  mountTarget.appendChild(hudRootElement);

  hudStats = {
    total: totalVal,
    hidden: hiddenVal,
    folded: foldedVal,
    totalStatusItem,
    pillRoot: pill,
    pillCount: pillCountValue,
    pillLimit: pillLimitValue,
    pillLoadProgress,
    signature: "",
  };
  updateHudDashboard();

  initPillDrag(pill);
}

function initPillDrag(pill: HTMLElement): void {
  if (!pill) return;

  const pillWidth = pill.offsetWidth || 48;
  const pillHeight = pill.offsetHeight || 48;
  const maxX = Math.max(8, window.innerWidth - pillWidth - 8);
  const maxY = Math.max(8, window.innerHeight - pillHeight - 8);
  let posX = maxX;
  let posY = maxY;

  try {
    // An absent key and an empty value both mean "never dragged".
    const raw = positionStore.read(STORAGE_KEY_POS);
    const saved: unknown = JSON.parse(raw === null || raw === "" ? "null" : raw);
    if (isPillPosition(saved)) {
      posX = Math.min(maxX, Math.max(8, saved.x));
      posY = Math.min(maxY, Math.max(8, saved.y));
    }
  } catch (error: unknown) {
    reportRecoverableError("restore pill position", error);
  }

  pill.style.left = `${posX}px`;
  pill.style.top = `${posY}px`;

  let dragging = false;
  let startX = 0,
    startY = 0;
  let originX = 0,
    originY = 0;

  const onPointerMove = (e: PointerEvent): void => {
    if (!dragging) return;
    const nextX = Math.max(
      8,
      Math.min(
        window.innerWidth - pill.offsetWidth - 8,
        originX + e.clientX - startX,
      ),
    );
    const nextY = Math.max(
      8,
      Math.min(
        window.innerHeight - pill.offsetHeight - 8,
        originY + e.clientY - startY,
      ),
    );
    pill.style.left = `${nextX}px`;
    pill.style.top = `${nextY}px`;
  };

  const onPointerUp = (e: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);

    if (
      Math.abs(e.clientX - startX) < 4 &&
      Math.abs(e.clientY - startY) < 4
    ) {
      togglePanel(true);
      return;
    }

    const rect = pill.getBoundingClientRect();
    positionStore.writeJson(STORAGE_KEY_POS, { x: rect.left, y: rect.top });
  };

  pill.addEventListener("pointerdown", (e: PointerEvent) => {
    if (e.button !== 0) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = pill.getBoundingClientRect();
    originX = rect.left;
    originY = rect.top;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  });
}
  function ensureHUDMounted(): void {
    if (isEngineDormant()) return;
    injectStyles();
    if (!hudRootElement?.isConnected) {
      buildHUD();
    } else if (
      document.body &&
      hudRootElement.parentElement !== document.body
    ) {
      document.body.appendChild(hudRootElement);
    }
  }

  function teardown(): void {
    if (searchDebounceTimer !== null) {
      window.clearTimeout(searchDebounceTimer);
    }
    searchDebounceTimer = null;
    document.getElementById(HUD_ID)?.remove();
    hudRootElement = null;
    hudShadowRoot = null;
    hudStats = null;
    searchInput = null;
    searchResultsBox = null;
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
