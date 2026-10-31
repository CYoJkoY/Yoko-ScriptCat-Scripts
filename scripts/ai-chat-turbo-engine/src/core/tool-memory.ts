import {
  TOOL_ROW_SELECTOR,
  TOOL_TOGGLE_ROW_SELECTOR,
  TOOL_TRIGGER_CONTAINER_SELECTOR,
  TOOL_TRIGGER_SELECTOR,
} from "../config";
import { isEngineDormant } from "./auth";
import { reportRecoverableError } from "./diagnostics";
import type { ToolPopupScope } from "./tool-scope";
import type { EngineState } from "../state";
import type { ElementFactory } from "../ui/code-blocks";
import {
  clearToolRecord,
  readToolRecord,
  writeToolRecord,
  type ToolRecord,
} from "../storage/tool-memory";

const POLL_INTERVAL = 500;
const MAX_POLLS = 60;
const MAX_RESTORE_STEPS = 8;
const MENU_WAIT_INTERVAL = 120;
const MENU_WAIT_ATTEMPTS = 10;
const ROW_SETTLE_DELAY = 400;
const ROW_RECORD_DELAY = 200;
const TRACK_DELAYS = [120, 350, 800];
const MAX_REARMS = 3;

export interface ToolMemoryDeps {
  el: ElementFactory;
  state: EngineState;
  toolScope: ToolPopupScope;
}

export interface ToolMemoryUtils {
  handleToolClick(event: MouseEvent): void;
  maybeRestore(): void;
  scheduleRestore(): void;
  renderStatus(): void;
  clearTimer(): void;
  teardown(): void;
  attachStatusNode(node: HTMLElement | null): void;
}

interface ToolRowState {
  label: string;
  selected: boolean;
  node: HTMLElement;
}

function cleanText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 120);
}

function nodeVisible(node: HTMLElement): boolean {
  const rect = node.getBoundingClientRect();
  return rect.width >= 1 && rect.height >= 1;
}

function rowText(row: HTMLElement): string {
  const line = (row.innerText || "").split("\n").find((part) => part.trim());
  const visible = cleanText(line || row.textContent || "");
  if (visible) return visible;
  return cleanText(row.getAttribute("aria-label") || "");
}

export function rowSelected(row: HTMLElement): boolean | null {
  const checked = row.getAttribute("aria-checked");
  if (checked === "true" || checked === "false") return checked === "true";
  const pressed = row.getAttribute("aria-pressed");
  if (pressed === "true" || pressed === "false") return pressed === "true";
  const selected = row.getAttribute("aria-selected");
  if (selected === "true" || selected === "false") return selected === "true";
  const dataState = row.getAttribute("data-state");
  if (
    dataState === "checked" ||
    dataState === "selected" ||
    dataState === "on" ||
    dataState === "active"
  ) {
    return true;
  }
  if (
    dataState === "unchecked" ||
    dataState === "unselected" ||
    dataState === "off" ||
    dataState === "inactive"
  ) {
    return false;
  }
  const toggleInput = row.querySelector(
    'input[type="checkbox"], input[type="radio"]',
  );
  if (toggleInput instanceof HTMLInputElement) return toggleInput.checked;
  if (row.matches(".selected, .checked")) return true;
  if (row.matches(".unselected, .unchecked")) return false;
  if (
    row.querySelector(
      ".selected, .checked, [aria-label='Selected'], [aria-label='selected'], [aria-label='已选中'], [data-state='checked'], [data-mat-icon-name='check']",
    )
  ) {
    return true;
  }
  return null;
}

function sameLabels(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((label, index) => label === sortedRight[index]);
}

function clickElement(node: HTMLElement, scope: string): boolean {
  try {
    node.click();
    return true;
  } catch (error: unknown) {
    reportRecoverableError(scope, error);
    return false;
  }
}

function interactiveRow(row: HTMLElement): HTMLElement {
  if (
    row.matches(
      "button, a, [role='menuitemcheckbox'], [role='menuitemradio'], [role='checkbox'], [role='option']",
    )
  ) {
    return row;
  }
  const inner = row.querySelector(
    "button, a, [role='menuitemcheckbox'], [role='menuitemradio'], [role='checkbox'], [role='option']",
  );
  return inner instanceof HTMLElement ? inner : row;
}

/**
 * The click target may be a button nested inside a row that owns the selected
 * state. Prefer the nearest row with toggle semantics before falling back to a
 * plain interactive row.
 */
function toggleRowFor(target: Element, popup: HTMLElement): HTMLElement | null {
  const toggle = target.closest(TOOL_TOGGLE_ROW_SELECTOR);
  if (toggle instanceof HTMLElement && popup.contains(toggle)) return toggle;
  const row = target.closest(TOOL_ROW_SELECTOR);
  return row instanceof HTMLElement && popup.contains(row) ? row : null;
}

export function createToolMemoryUtils(deps: ToolMemoryDeps): ToolMemoryUtils {
  const { el, state, toolScope } = deps;
  let statusNode: HTMLElement | null = null;
  let pollTimer = 0;
  let pollCount = 0;
  let stepTimer = 0;
  let recordTimer = 0;
  const trackTimers: number[] = [];
  let restoreToken = 0;
  let restoring = false;
  let restoreDone = false;
  let openedByUs = false;
  let actionStatus = "";
  let restoredTriggers = new WeakSet<Element>();
  let lastRestoredTrigger: HTMLElement | null = null;
  let rearmCount = 0;

  function stopPolling(): void {
    window.clearInterval(pollTimer);
    pollTimer = 0;
    pollCount = 0;
  }

  function closeOpenedMenu(): void {
    if (!openedByUs) return;
    openedByUs = false;
    toolScope.close();
  }

  function clearTimer(): void {
    stopPolling();
    window.clearTimeout(stepTimer);
    window.clearTimeout(recordTimer);
    for (const timer of trackTimers.splice(0)) window.clearTimeout(timer);
    stepTimer = 0;
    recordTimer = 0;
    restoreToken += 1;
    restoring = false;
    restoreDone = false;
    lastRestoredTrigger = null;
    rearmCount = 0;
    closeOpenedMenu();
  }

  function teardown(): void {
    clearTimer();
    statusNode = null;
  }

  function collectRows(popup: Element): ToolRowState[] {
    const candidates = Array.from(
      popup.querySelectorAll<HTMLElement>(TOOL_ROW_SELECTOR),
    );
    const rows: ToolRowState[] = [];
    const seen = new Set<string>();
    for (const row of candidates) {
      if (row.closest(TOOL_TRIGGER_CONTAINER_SELECTOR)) continue;
      const popupKind = row.getAttribute("aria-haspopup");
      if (popupKind !== null && popupKind !== "false") continue;
      if (!nodeVisible(row)) continue;
      const selected = rowSelected(row);
      if (selected === null) continue;
      const label = rowText(row);
      if (!label || seen.has(label)) continue;
      seen.add(label);
      rows.push({ label, selected, node: row });
    }
    return rows;
  }

  function selectedLabels(popup: Element): string[] | null {
    const rows = collectRows(popup);
    if (!rows.length) return null;
    return rows.filter((row) => row.selected).map((row) => row.label);
  }

  function triggerNode(): HTMLElement | null {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(TOOL_TRIGGER_SELECTOR),
    );
    return nodes.find((node) => nodeVisible(node)) ?? null;
  }

  function triggerLabel(trigger: Element): string {
    return cleanText(
      trigger.getAttribute("aria-label") || trigger.textContent || "add-tools",
    );
  }

  function persistSelection(
    trigger: Element,
    selected: readonly string[],
  ): void {
    const saved = readToolRecord();
    if (saved && sameLabels(saved.selected, selected)) return;
    const record: ToolRecord = {
      key: "add-tools",
      controlLabel: triggerLabel(trigger),
      selected: [...selected],
      ts: Date.now(),
    };
    writeToolRecord(record);
  }

  function recordRowClick(
    popup: HTMLElement,
    row: HTMLElement,
    trigger: HTMLElement,
  ): void {
    const label = rowText(row);
    if (!label) return;
    const wasSelected = rowSelected(row);
    const before = selectedLabels(popup);
    if (wasSelected === null && !row.matches(TOOL_TOGGLE_ROW_SELECTOR)) return;
    window.clearTimeout(recordTimer);
    recordTimer = window.setTimeout(() => {
      recordTimer = 0;
      if (isEngineDormant() || !state.rememberTools) return;
      stopPolling();
      restoreToken += 1;
      restoring = false;
      restoreDone = true;
      let next = popup.isConnected ? selectedLabels(popup) : null;
      if (next === null && before !== null) {
        if (wasSelected === true) {
          next = before.filter((entry) => entry !== label);
        } else if (wasSelected === false) {
          next = before.includes(label) ? before : [...before, label];
        } else {
          next = before.includes(label)
            ? before.filter((entry) => entry !== label)
            : [...before, label];
        }
      }
      if (next === null) return;
      persistSelection(trigger, next);
      actionStatus = next.length
        ? "已记录 " + next.join(" / ")
        : "当前没有选中任何工具";
      renderStatus();
    }, ROW_RECORD_DELAY);
  }

  function handleRowClick(target: Element): void {
    if (restoring) return;
    const popup = toolScope.popupFor(target);
    if (!popup) return;
    const row = toggleRowFor(target, popup);
    if (!row) return;
    const trigger = triggerNode();
    if (!trigger) return;
    recordRowClick(popup, row, trigger);
  }

  function handleToolClick(event: MouseEvent): void {
    if (isEngineDormant()) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (toolScope.isInside(target)) {
      if (!state.rememberTools) return;
      handleRowClick(target);
      return;
    }
    const trigger = target.closest(TOOL_TRIGGER_SELECTOR);
    if (trigger instanceof Element) {
      if (restoring) return;
      const before = toolScope.snapshot();
      for (const delay of TRACK_DELAYS) {
        const timer = window.setTimeout(() => {
          const index = trackTimers.indexOf(timer);
          if (index >= 0) trackTimers.splice(index, 1);
          // Yuanbao may swap the composer on click; fall back to the live
          // trigger so the popup still gets an owner.
          const owner = trigger.isConnected ? trigger : triggerNode();
          if (!owner) return;
          toolScope.note(owner, before);
        }, delay);
        trackTimers.push(timer);
      }
      return;
    }
    if (target.closest(TOOL_TRIGGER_CONTAINER_SELECTOR)) return;
  }

  function finishRestore(token: number, status: string): void {
    if (token !== restoreToken) return;
    restoring = false;
    restoreDone = true;
    stopPolling();
    closeOpenedMenu();
    actionStatus = status;
    renderStatus();
  }

  function waitForMenu(
    token: number,
    trigger: HTMLElement,
    before: Set<Element>,
    onReady: (popup: HTMLElement) => void,
    attempt: number,
  ): void {
    if (token !== restoreToken) return;
    const popup = toolScope.note(trigger, before) ?? toolScope.resolve(trigger);
    if (popup) {
      onReady(popup);
      return;
    }
    if (attempt >= MENU_WAIT_ATTEMPTS) {
      finishRestore(token, "未识别到工具菜单");
      return;
    }
    stepTimer = window.setTimeout(() => {
      waitForMenu(token, trigger, before, onReady, attempt + 1);
    }, MENU_WAIT_INTERVAL);
  }

  function withToolMenu(
    token: number,
    trigger: HTMLElement,
    onReady: (popup: HTMLElement) => void,
  ): void {
    const openPopup = toolScope.resolve(trigger);
    if (openPopup) {
      onReady(openPopup);
      return;
    }
    const before = toolScope.snapshot();
    if (!clickElement(trigger, "open tool menu")) {
      finishRestore(token, "无法打开工具菜单");
      return;
    }
    openedByUs = true;
    waitForMenu(token, trigger, before, onReady, 0);
  }

  function restoreStep(
    token: number,
    trigger: HTMLElement,
    record: ToolRecord,
    step: number,
    attempted: Map<string, number>,
  ): void {
    if (token !== restoreToken) return;
    if (isEngineDormant() || !state.rememberTools) {
      finishRestore(token, "");
      return;
    }
    if (step >= MAX_RESTORE_STEPS) {
      finishRestore(token, "恢复次数已达到上限");
      return;
    }
    withToolMenu(token, trigger, (popup) => {
      if (token !== restoreToken) return;
      const rows = collectRows(popup);
      if (!rows.length) {
        finishRestore(token, "当前菜单没有可读选中状态，暂不可恢复");
        return;
      }
      const missing = record.selected.filter((label) => {
        const match = rows.find((row) => row.label === label);
        return !match || !match.selected;
      });
      if (!missing.length) {
        const actual = rows.filter((row) => row.selected).map((row) => row.label);
        persistSelection(trigger, actual);
        finishRestore(
          token,
          actual.length ? "已恢复 " + actual.join(" / ") : "当前没有选中任何工具",
        );
        return;
      }
      const nextLabel = missing.find((label) =>
        rows.some((row) => row.label === label),
      );
      if (!nextLabel) {
        finishRestore(token, "找不到已记录的工具");
        return;
      }
      // A radio-style menu cannot hold every saved label at once; stop
      // instead of toggling the same rows until the step cap. One repeat is
      // allowed so a slow host update is not mistaken for a rejection.
      const clicks = attempted.get(nextLabel) ?? 0;
      if (clicks >= 2) {
        finishRestore(token, "这些工具无法同时选中");
        return;
      }
      attempted.set(nextLabel, clicks + 1);
      const row = rows.find((entry) => entry.label === nextLabel);
      if (!row) {
        finishRestore(token, "找不到已记录的工具");
        return;
      }
      if (!clickElement(interactiveRow(row.node), "select tool menu row")) {
        finishRestore(token, "无法选择工具");
        return;
      }
      stepTimer = window.setTimeout(() => {
        if (token !== restoreToken) return;
        restoreStep(token, trigger, record, step + 1, attempted);
      }, ROW_SETTLE_DELAY);
    });
  }

  function maybeRestore(): void {
    if (restoreDone) {
      // A new topic can rebuild the composer without a history entry. The old
      // trigger detaching is the only reliable signal that the host reset its
      // selection, so re-arm once in that case.
      if (!lastRestoredTrigger || lastRestoredTrigger.isConnected) return;
      if (rearmCount >= MAX_REARMS) return;
      rearmCount += 1;
      restoreDone = false;
      restoredTriggers = new WeakSet<Element>();
    }
    if (isEngineDormant() || !state.rememberTools) {
      restoreDone = true;
      return;
    }
    const saved = readToolRecord();
    if (!saved || !saved.selected.length) {
      restoreDone = true;
      return;
    }
    const trigger = triggerNode();
    if (!trigger) return;
    if (restoredTriggers.has(trigger)) {
      restoreDone = true;
      return;
    }
    if (restoring) return;
    restoredTriggers.add(trigger);
    lastRestoredTrigger = trigger;
    restoring = true;
    restoreToken += 1;
    const token = restoreToken;
    restoreStep(token, trigger, saved, 0, new Map<string, number>());
  }

  function scheduleRestore(): void {
    stopPolling();
    window.clearTimeout(stepTimer);
    window.clearTimeout(recordTimer);
    stepTimer = 0;
    recordTimer = 0;
    restoreToken += 1;
    restoring = false;
    lastRestoredTrigger = null;
    rearmCount = 0;
    closeOpenedMenu();
    restoredTriggers = new WeakSet<Element>();
    if (isEngineDormant()) return;
    if (!state.rememberTools) return;
    const saved = readToolRecord();
    if (!saved || !saved.selected.length) return;
    restoreDone = false;
    pollTimer = window.setInterval(() => {
      pollCount += 1;
      maybeRestore();
      if (restoreDone || pollCount >= MAX_POLLS) stopPolling();
    }, POLL_INTERVAL);
  }

  function renderStatus(): void {
    if (!statusNode) return;
    statusNode.textContent = "";
    statusNode.title = actionStatus;
    if (!state.rememberTools) {
      statusNode.textContent = "工具记忆：已关闭";
      return;
    }
    const saved = readToolRecord();
    if (!saved) {
      statusNode.textContent =
        actionStatus || "工具记忆：未记录（在工具菜单里勾选工具即可）";
      return;
    }
    if (!saved.selected.length) {
      statusNode.textContent = actionStatus || "工具记忆：当前没有选中任何工具";
      return;
    }
    statusNode.textContent = "工具记忆：" + saved.selected.join(" / ") + " ";
    if (actionStatus) {
      statusNode.appendChild(
        el("span", {}, ["· " + actionStatus + " "]),
      );
    }
    statusNode.appendChild(
      el(
        "button",
        {
          type: "button",
          onclick: () => {
            clearToolRecord();
            actionStatus = "";
            clearTimer();
            renderStatus();
          },
        },
        ["清除"],
      ),
    );
  }

  function attachStatusNode(node: HTMLElement | null): void {
    statusNode = node;
  }

  return {
    handleToolClick,
    maybeRestore,
    scheduleRestore,
    renderStatus,
    clearTimer,
    teardown,
    attachStatusNode,
  };
}
