import {
  ATOMIC_ACTIONS_SELECTOR,
  ATOMIC_TOOL_CHIP_SELECTOR,
  ATOMIC_TOOL_ITEM_SELECTOR,
  ATOMIC_TOOL_MENU_SELECTOR,
} from "../config";
import { isEngineDormant } from "./auth";
import { reportRecoverableError } from "./diagnostics";
import {
  createRestoreCoordinator,
  type RestoreCoordinator,
} from "./restore-coordination";
import type { EngineState } from "../state";
import type { ElementFactory } from "../ui/code-blocks";
import {
  clearToolRecord,
  readToolRecord,
  writeToolRecord,
  type ToolRecord,
} from "../storage/tool-memory";

const POLL_INTERVAL = 350;
const MAX_POLLS = 80;
const MENU_WAIT_INTERVAL = 120;
const MENU_WAIT_ATTEMPTS = 12;
const MAX_RESTORE_ATTEMPTS = 6;
const RECORD_DELAYS = [120, 320, 700, 1200];
const VERIFY_DELAYS = [150, 400, 800, 1400];

export interface ToolMemoryDeps {
  el: ElementFactory;
  state: EngineState;
  triggerSendButton: (control: HTMLElement) => boolean;
  restoreCoordinator?: RestoreCoordinator;
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

interface AtomicTool {
  applicationId: string;
  label: string;
  node: HTMLElement;
}

function cleanText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 120);
}

function nodeVisible(node: HTMLElement): boolean {
  const rect = node.getBoundingClientRect();
  return rect.width >= 1 && rect.height >= 1;
}

function isInsideTurboUI(node: Element): boolean {
  return Boolean(node.closest("[id^='ai-turbo-'], .ai-turbo-code-bar"));
}

function applicationIdOf(node: Element): string {
  return cleanText(node.getAttribute("data-application-id") || "");
}

function toolLabel(node: HTMLElement): string {
  const aria = cleanText(node.getAttribute("aria-label") || "");
  if (aria) return aria;
  const visible = node.querySelector("[data-input-label='tools']");
  if (visible instanceof HTMLElement) {
    const label = cleanText(visible.textContent || "");
    if (label) return label;
  }
  return cleanText(node.textContent || "");
}

function chipRecord(node: HTMLElement): AtomicTool | null {
  if (!nodeVisible(node)) return null;
  const applicationId = applicationIdOf(node);
  if (!applicationId) return null;
  const labelNode = node.querySelector("span > span");
  const label =
    labelNode instanceof HTMLElement
      ? cleanText(labelNode.textContent || "")
      : "";
  return { applicationId, label, node };
}

function currentChip(): AtomicTool | null {
  const chips = Array.from(
    document.querySelectorAll<HTMLElement>(ATOMIC_TOOL_CHIP_SELECTOR),
  ).filter((node) => !isInsideTurboUI(node) && nodeVisible(node));
  for (const chip of chips) {
    const record = chipRecord(chip);
    if (record) return record;
  }
  return null;
}

function matchesSaved(tool: AtomicTool, saved: ToolRecord): boolean {
  if (saved.applicationId) return tool.applicationId === saved.applicationId;
  const expected = saved.label || saved.legacyLabels[0] || "";
  return Boolean(expected) && tool.label === expected;
}

function collectTools(nodes: Iterable<HTMLElement>): AtomicTool[] {
  const tools: AtomicTool[] = [];
  for (const node of nodes) {
    if (isInsideTurboUI(node) || !nodeVisible(node)) continue;
    const applicationId = applicationIdOf(node);
    if (!applicationId) continue;
    tools.push({ applicationId, label: toolLabel(node), node });
  }
  return tools;
}

function inlineTools(): AtomicTool[] {
  const items = Array.from(
    document.querySelectorAll<HTMLElement>(ATOMIC_TOOL_ITEM_SELECTOR),
  ).filter((node) => !node.closest("[role='menu']"));
  return collectTools(items);
}

function menuTools(): AtomicTool[] {
  return collectTools(
    document.querySelectorAll<HTMLElement>(
      `${ATOMIC_TOOL_MENU_SELECTOR} [role='menuitem'][data-application-id]`,
    ),
  );
}

function overflowTrigger(): HTMLElement | null {
  const actions = document.querySelectorAll<HTMLElement>(ATOMIC_ACTIONS_SELECTOR);
  for (const action of actions) {
    if (isInsideTurboUI(action) || !nodeVisible(action)) continue;
    const candidates = Array.from(
      action.querySelectorAll<HTMLElement>("button[aria-expanded]"),
    ).filter((node) => !node.hasAttribute("data-application-id"));
    const trigger = candidates.find((node) => nodeVisible(node));
    if (trigger) return trigger;
  }
  return null;
}

function atomicToolbarPresent(): boolean {
  return Array.from(
    document.querySelectorAll<HTMLElement>(ATOMIC_ACTIONS_SELECTOR),
  ).some((node) => !isInsideTurboUI(node) && nodeVisible(node));
}

function findTool(
  tools: readonly AtomicTool[],
  saved: ToolRecord,
): AtomicTool | null {
  if (saved.applicationId) {
    const byId = tools.find((tool) => tool.applicationId === saved.applicationId);
    if (byId) return byId;
  }
  const expected = saved.label || saved.legacyLabels[0] || "";
  if (!expected) return null;
  return tools.find((tool) => tool.label === expected) ?? null;
}

export function createToolMemoryUtils(deps: ToolMemoryDeps): ToolMemoryUtils {
  const {
    el,
    state,
    triggerSendButton,
    restoreCoordinator: providedCoordinator,
  } = deps;
  const restoreCoordinator =
    providedCoordinator ?? createRestoreCoordinator();
  let statusNode: HTMLElement | null = null;
  let pollTimer = 0;
  let pollCount = 0;
  let stepTimer = 0;
  const recordTimers: number[] = [];
  const verifyTimers: number[] = [];
  let restoreToken = 0;
  let restoring = false;
  let restoreDone = false;
  let restoreAttempts = 0;
  let openedOverflow: HTMLElement | null = null;
  let actionStatus = "";

  function stopPolling(): void {
    window.clearInterval(pollTimer);
    pollTimer = 0;
    pollCount = 0;
  }

  function clearTimers(list: number[]): void {
    for (const timer of list.splice(0)) window.clearTimeout(timer);
  }

  function click(control: HTMLElement, scope: string): boolean {
    try {
      return triggerSendButton(control);
    } catch (error: unknown) {
      reportRecoverableError(scope, error);
      return false;
    }
  }

  function closeOverflow(): void {
    const trigger = openedOverflow;
    openedOverflow = null;
    if (!trigger || !trigger.isConnected) return;
    if (trigger.getAttribute("aria-expanded") !== "true") return;
    click(trigger, "close tool overflow menu");
  }

  function endRestoreAttempt(): void {
    restoring = false;
    restoreCoordinator.setPending("tools", false);
    restoreCoordinator.release("tools");
  }

  function finishRestore(token: number, status: string): void {
    if (token !== restoreToken) return;
    endRestoreAttempt();
    restoreDone = true;
    closeOverflow();
    actionStatus = status;
    renderStatus();
  }

  function persistChip(tool: AtomicTool | null): void {
    if (!tool) {
      clearToolRecord();
      actionStatus = "当前没有选中任何工具";
      renderStatus();
      return;
    }
    const saved = readToolRecord();
    if (
      saved &&
      saved.applicationId === tool.applicationId &&
      saved.label === tool.label
    ) {
      return;
    }
    writeToolRecord({
      key: "atomic-actions",
      controlLabel: "工具",
      applicationId: tool.applicationId,
      label: tool.label,
      legacyLabels: tool.label ? [tool.label] : [],
      ts: Date.now(),
    });
    actionStatus = tool.label
      ? `已记录 ${tool.label}`
      : `已记录 ${tool.applicationId}`;
    renderStatus();
  }

  function scheduleRecordCapture(
    applicationId: string,
    label: string,
    removing: boolean,
  ): void {
    clearTimers(recordTimers);
    let confirmed = false;
    for (const [index, delay] of RECORD_DELAYS.entries()) {
      const timer = window.setTimeout(() => {
        const position = recordTimers.indexOf(timer);
        if (position >= 0) recordTimers.splice(position, 1);
        if (isEngineDormant() || !state.rememberTools || confirmed) return;
        const chip = currentChip();
        if (!removing && chip) {
          if (chip.applicationId === applicationId || index === RECORD_DELAYS.length - 1) {
            confirmed = true;
            persistChip(chip);
          }
          return;
        }
        if (removing && !chip) {
          confirmed = true;
          persistChip(null);
          return;
        }
        if (index === RECORD_DELAYS.length - 1) {
          actionStatus = label
            ? `未确认 ${label} 的选择，已保留原记录`
            : "未确认工具选择，已保留原记录";
          renderStatus();
        }
      }, delay);
      recordTimers.push(timer);
    }
  }

  function handleToolClick(event: MouseEvent): void {
    if (isEngineDormant()) return;
    const target = event.target;
    if (!(target instanceof Element) || isInsideTurboUI(target)) return;
    const chip = target.closest(ATOMIC_TOOL_CHIP_SELECTOR);
    if (chip instanceof HTMLElement) {
      if (restoring || !target.closest("button")) return;
      const info = chipRecord(chip);
      scheduleRecordCapture(info?.applicationId || "", info?.label || "", true);
      return;
    }
    if (restoring || !state.rememberTools) return;
    const item = target.closest(ATOMIC_TOOL_ITEM_SELECTOR);
    if (!(item instanceof HTMLElement)) return;
    const applicationId = applicationIdOf(item);
    if (!applicationId) return;
    scheduleRecordCapture(applicationId, toolLabel(item), false);
  }

  function verifyRestored(
    token: number,
    saved: ToolRecord,
    attemptsLeft: number,
  ): void {
    clearTimers(verifyTimers);
    for (const [index, delay] of VERIFY_DELAYS.entries()) {
      const timer = window.setTimeout(() => {
        const position = verifyTimers.indexOf(timer);
        if (position >= 0) verifyTimers.splice(position, 1);
        if (token !== restoreToken) return;
        const chip = currentChip();
        if (chip && matchesSaved(chip, saved)) {
          clearTimers(verifyTimers);
          writeToolRecord({
            key: "atomic-actions",
            controlLabel: "工具",
            applicationId: chip.applicationId,
            label: chip.label || saved.label,
            legacyLabels: chip.label ? [chip.label] : saved.legacyLabels,
            ts: Date.now(),
          });
          finishRestore(
            token,
            `已恢复 ${chip.label || saved.label || saved.applicationId}`,
          );
          return;
        }
        if (index !== VERIFY_DELAYS.length - 1) return;
        endRestoreAttempt();
        closeOverflow();
        if (attemptsLeft > 1) return;
        finishRestore(token, "未能恢复已记录的工具");
      }, delay);
      verifyTimers.push(timer);
    }
  }

  function tryRestore(saved: ToolRecord, token: number): void {
    restoreAttempts += 1;
    const chip = currentChip();
    if (chip && matchesSaved(chip, saved)) {
      finishRestore(token, `已恢复 ${chip.label || saved.label || saved.applicationId}`);
      return;
    }
    const attemptsLeft = MAX_RESTORE_ATTEMPTS - restoreAttempts + 1;
    const inline = findTool(inlineTools(), saved);
    if (inline) {
      if (!click(inline.node, "select atomic tool")) {
        endRestoreAttempt();
        return;
      }
      verifyRestored(token, saved, attemptsLeft);
      return;
    }
    const openMenuTool = findTool(menuTools(), saved);
    if (openMenuTool) {
      if (!click(openMenuTool.node, "select atomic overflow tool")) {
        endRestoreAttempt();
        return;
      }
      verifyRestored(token, saved, attemptsLeft);
      return;
    }
    const trigger = overflowTrigger();
    if (!trigger) {
      endRestoreAttempt();
      return;
    }
    if (trigger.getAttribute("aria-expanded") !== "true") {
      openedOverflow = trigger;
      if (!click(trigger, "open atomic tool overflow")) {
        openedOverflow = null;
        endRestoreAttempt();
        return;
      }
    }
    let attempt = 0;
    const wait = (): void => {
      stepTimer = 0;
      if (token !== restoreToken) return;
      const menuTool = findTool(menuTools(), saved);
      if (menuTool) {
        if (!click(menuTool.node, "select atomic overflow tool")) {
          endRestoreAttempt();
          closeOverflow();
          return;
        }
        verifyRestored(token, saved, attemptsLeft);
        return;
      }
      attempt += 1;
      if (attempt >= MENU_WAIT_ATTEMPTS) {
        endRestoreAttempt();
        closeOverflow();
        return;
      }
      stepTimer = window.setTimeout(wait, MENU_WAIT_INTERVAL);
    };
    stepTimer = window.setTimeout(wait, MENU_WAIT_INTERVAL);
  }

  function maybeRestore(): void {
    if (restoreDone || restoring) return;
    if (restoreCoordinator.isPending("reasoning")) return;
    if (isEngineDormant() || !state.rememberTools) {
      restoreDone = true;
      return;
    }
    const saved = readToolRecord();
    if (
      !saved ||
      (!saved.applicationId && !saved.label && !saved.legacyLabels.length)
    ) {
      restoreDone = true;
      return;
    }
    const chip = currentChip();
    if (chip && matchesSaved(chip, saved)) {
      finishRestore(restoreToken, `已恢复 ${chip.label || saved.label || saved.applicationId}`);
      return;
    }
    if (!chip && !atomicToolbarPresent()) return;
    if (restoreAttempts >= MAX_RESTORE_ATTEMPTS) {
      finishRestore(restoreToken, "找不到已记录的工具");
      return;
    }
    if (!restoreCoordinator.tryAcquire("tools")) return;
    restoreCoordinator.setPending("tools", true);
    restoring = true;
    restoreToken += 1;
    tryRestore(saved, restoreToken);
  }

  function clearTimer(): void {
    stopPolling();
    window.clearTimeout(stepTimer);
    stepTimer = 0;
    clearTimers(recordTimers);
    clearTimers(verifyTimers);
    restoreToken += 1;
    endRestoreAttempt();
    restoreDone = false;
    restoreAttempts = 0;
    closeOverflow();
  }

  function scheduleRestore(): void {
    clearTimer();
    if (isEngineDormant() || !state.rememberTools) return;
    const saved = readToolRecord();
    if (!saved) return;
    restoreDone = false;
    pollTimer = window.setInterval(() => {
      if (restoreCoordinator.isPending("reasoning")) return;
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
        actionStatus || "工具记忆：未记录（在工具按钮里选择一个工具即可）";
      return;
    }
    const shown = saved.label || saved.applicationId || "已记录工具";
    statusNode.textContent = "工具记忆：" + shown + " ";
    if (actionStatus) {
      statusNode.appendChild(el("span", {}, ["· " + actionStatus + " "]));
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

  function teardown(): void {
    clearTimer();
    statusNode = null;
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
