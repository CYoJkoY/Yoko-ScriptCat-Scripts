import {
  CHOICE_OPTION_SELECTOR,
  CHOICE_RADIO_SELECTOR,
  REASONING_CONTROL_PATTERN,
  REASONING_CONTROL_SELECTOR,
  REASONING_MENU_SELECTOR,
  isToolControlElement,
} from "../config";
import { isEngineDormant } from "./auth";
import { reportRecoverableError } from "./diagnostics";
import type { ToolPopupScope } from "./tool-scope";
import type { ElementFactory } from "../ui/code-blocks";
import type { EngineState } from "../state";
import {
  clearReasoningRecord,
  loadReasoningMemory,
  readReasoningRecord,
  saveReasoningMemory,
  writeReasoningRecord,
  type ReasoningRecord,
} from "../storage/reasoning-memory";

export interface ReasoningChoiceInfo {
  option: string;
  hint: string;
  path: string[];
}

export interface ReasoningDeps {
  el: ElementFactory;
  state: EngineState;
  toolScope: ToolPopupScope;
  withSelfMutation: <T>(task: () => T) => T;
  triggerSendButton: (control: HTMLElement) => boolean;
  requestUpdate: () => void;
  markRestoredTurn: (turnElement: Element) => void;
  requestFullTurnSync: () => void;
}

export interface ReasoningUtils {
  handleReasoningClick(event: MouseEvent): void;
  handleDehydratedClick(event: MouseEvent): void;
  renderReasoningStatus(): void;
  applyReasoningMemory(): void;
  clearReasoningRestoreTimer(): void;
  scheduleReasoningRestore(): void;
  attachStatusNode(node: HTMLElement | null): void;
}

export function createReasoningUtils(deps: ReasoningDeps): ReasoningUtils {
  const {
    el,
    state,
    toolScope,
    withSelfMutation,
    triggerSendButton,
    requestUpdate,
    markRestoredTurn,
    requestFullTurnSync,
  } = deps;

  let reasoningStatusNode: HTMLElement | null = null;
  let reasoningRestoreTimer = 0;
  let reasoningRestoreAttempts = 0;
  let reasoningRestoreDone = false;
  let applyingReasoning = false;
  let restoreToken = 0;
  const correctedToggleAttempts = new Set<string>();
  const choiceRestoreAttempts = new Map<string, number>();
  const popupCloseTimers: number[] = [];
  let conversationKey = `${location.origin}${location.pathname}`;
  let reasoningSettleTimer = 0;
  // 最近点开的控件：弹层里的选项点击时用来把“哪个控件的哪个选项”配对
  let reasoningMenuTrigger: HTMLElement | null = null;
  let reasoningMenuTriggerAt = 0;
  let reasoningMenuTriggerLabel = "";
  function isInsideTurboUI(node: unknown): boolean {
    if (!(node instanceof Element)) return false;
    return Boolean(node.closest("[id^='ai-turbo-'], .ai-turbo-code-bar"));
  }

  function controlLabel(control: HTMLElement): string {
    // Prefer what the user can read; Gemini's aria-label is a sentence such as
    // "Open mode picker, currently Flash High" and cannot be used as an option.
    const visible = String(control.innerText || "")
      .replace(/\s+/g, " ")
      .trim();
    const raw =
      visible ||
      control.getAttribute("aria-label") ||
      control.getAttribute("title") ||
      control.textContent ||
      "";
    return raw.replace(/\s+/g, " ").trim().slice(0, 60);
  }

  function hasPopupSemantics(control: HTMLElement): boolean {
    if (control.hasAttribute("aria-expanded")) return true;
    const popup = control.getAttribute("aria-haspopup");
    if (popup !== null && popup !== "false") return true;
    if (control.hasAttribute("gemmenutrigger")) return true;
    if (control.hasAttribute("cdkoverlayorigin")) return true;
    if (control.matches("[data-radix-menu-trigger], .mat-mdc-menu-trigger")) {
      return true;
    }
    return false;
  }

  function explicitToggleState(control: HTMLElement): boolean | null {
    if (control instanceof HTMLInputElement) {
      if (control.type !== "checkbox" && control.type !== "radio") return null;
      return control.checked === true;
    }
    const input = control.querySelector(
      'input[type="checkbox"], input[type="radio"]',
    );
    if (input instanceof HTMLInputElement) return input.checked === true;
    const pressed = control.getAttribute("aria-pressed");
    if (pressed === "true" || pressed === "false") return pressed === "true";
    const checked = control.getAttribute("aria-checked");
    if (checked === "true" || checked === "false") return checked === "true";
    const dataState = control.getAttribute("data-state");
    if (dataState === "on" || dataState === "checked" || dataState === "active") {
      return true;
    }
    if (dataState === "off" || dataState === "unchecked" || dataState === "inactive") {
      return false;
    }
    return null;
  }

  function controlOnState(control: HTMLElement): boolean | null {
    const explicit = explicitToggleState(control);
    if (explicit !== null) return explicit;
    // Radix style menus expose open/closed on the trigger; that is popup
    // state, not the on/off value of the control.
    if (hasPopupSemantics(control)) return null;
    const dataState = control.getAttribute("data-state");
    if (dataState !== null && dataState !== "") {
      // Only values with toggle semantics count; open/closed would otherwise
      // read as a permanent "off" and trigger a correction click.
      return /^(selected|true)$/i.test(dataState) ? true : null;
    }
    const cls = control.className;
    if (/(^|[\s_-])(active|selected|checked|is-on)([\s_-]|$)/i.test(cls))
      return true;
    return null;
  }

  function controlKey(control: Element): string {
    const raw =
      control.getAttribute("data-test-id") ||
      control.getAttribute("data-testid") ||
      control.id ||
      control.getAttribute("aria-label") ||
      "";
    return String(raw).replace(/\s+/g, " ").trim().slice(0, 60);
  }

  function toggleAttemptKey(control: HTMLElement, desired: boolean): string {
    const identity =
      controlKey(control) || controlLabel(control) || "reasoning-toggle";
    return `${conversationKey}|${identity}|${desired ? "on" : "off"}`;
  }

  function choiceAttemptKey(control: HTMLElement, saved: ReasoningRecord): string {
    const path = Array.isArray(saved.path) ? saved.path.join(">") : "";
    return `${conversationKey}|${controlKey(control)}|${saved.option || ""}|${path}`;
  }

  function syncConversationScope(): void {
    const nextKey = `${location.origin}${location.pathname}`;
    if (nextKey === conversationKey) return;
    conversationKey = nextKey;
    correctedToggleAttempts.clear();
    choiceRestoreAttempts.clear();
  }

  function clickControlOnce(control: HTMLElement): boolean {
    try {
      control.click();
      return true;
    } catch (error: unknown) {
      reportRecoverableError("restore reasoning control", error);
      return false;
    }
  }

  function beginRestore(): number {
    restoreToken += 1;
    applyingReasoning = false;
    return restoreToken;
  }

  function restoreIsStale(token: number): boolean {
    return token !== restoreToken;
  }

  function settleToggleCorrection(
    control: HTMLElement,
    desired: boolean,
    token: number,
  ): void {
    let attempts = 0;
    const check = (): void => {
      reasoningSettleTimer = 0;
      if (restoreIsStale(token)) return;
      attempts += 1;
      const current = controlOnState(control);
      if (current === desired || attempts >= 8 || !control.isConnected) {
        applyingReasoning = false;
        return;
      }
      reasoningSettleTimer = window.setTimeout(check, 100);
    };
    check();
  }

  function isDropdownTrigger(control: Element): boolean {
    if (control.hasAttribute("aria-expanded")) return true;
    const popup = control.getAttribute("aria-haspopup");
    if (popup !== null && popup !== "false") return true;
    // Angular Material / CDK 等框架用自定义属性或类名标记弹层触发器，不带 aria-haspopup
    if (control.hasAttribute("gemmenutrigger") || control.hasAttribute("cdkoverlayorigin")) return true;
    if (control.matches("[data-state], [data-radix-menu-trigger], .mat-mdc-menu-trigger")) return true;
    const label = control.getAttribute("aria-label") || "";
    return /^(open|选择|打开).{0,20}(picker|menu|mode|model)/i.test(label.trim());
  }

  function dispatchEscape(): void {
    const esc = new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      keyCode: 27,
      bubbles: true,
      cancelable: true,
    });
    if (document.activeElement) document.activeElement.dispatchEvent(esc);
    document.dispatchEvent(esc);
  }

  function closeOpenPopup(control: HTMLElement | null = null): void {
    dispatchEscape();
    // Yuanbao's thinking-mode switcher is a hover popup and has no Escape
    // handler. Its trigger owns aria-expanded, so click the trigger when the
    // panel is still open after the key event.
    const trigger = control ?? reasoningMenuTrigger;
    if (!trigger || !trigger.isConnected) return;
    const settle = (remaining: number): void => {
      if (!trigger.isConnected) return;
      if (trigger.getAttribute("aria-expanded") !== "true") return;
      if (!clickControlOnce(trigger)) return;
      if (remaining <= 1) return;
      const timer = window.setTimeout(() => {
        const index = popupCloseTimers.indexOf(timer);
        if (index >= 0) popupCloseTimers.splice(index, 1);
        settle(remaining - 1);
      }, 160);
      popupCloseTimers.push(timer);
    };
    // React may commit aria-expanded only after the Escape dispatch returns.
    const timer = window.setTimeout(() => {
      const index = popupCloseTimers.indexOf(timer);
      if (index >= 0) popupCloseTimers.splice(index, 1);
      settle(3);
    }, 120);
    popupCloseTimers.push(timer);
  }

  function popupRootFor(control: Element): HTMLElement | null {
    const id = control.getAttribute("aria-controls");
    const byId = id ? document.getElementById(id) : null;
    if (byId) return byId;
    const owner = control.closest(REASONING_MENU_SELECTOR);
    return owner instanceof HTMLElement ? owner : null;
  }

  function hasVisibleMenu(): boolean {
    return Array.from(document.querySelectorAll(REASONING_MENU_SELECTOR)).some(
      (node) => !isInsideTurboUI(node) && nodeVisible(node),
    );
  }

  function rowScopedText(node: Element, selector: string): string {
    if (!(node instanceof Element)) return "";
    const part = Array.from(
      node.querySelectorAll<HTMLElement>(selector),
    ).find((candidate) => {
      if (isInsideTurboUI(candidate) || !nodeVisible(candidate)) return false;
      const owner = candidate.closest(
        "gem-menu-item, [role='menuitem'], [role='menuitemradio'], [role='option'], [role='radio']",
      );
      return owner === node;
    });
    return part ? String(part.innerText || "").replace(/\s+/g, " ").trim() : "";
  }

  function rowLabel(node: HTMLElement): string {
    const structured = rowScopedText(node, ".label");
    if (structured) return structured;
    const line = (node.innerText || "").split("\n").find((part) => part.trim());
    return line ? line.replace(/\s+/g, " ").trim() : "";
  }

  function rowHint(node: HTMLElement): string {
    const structured = rowScopedText(node, ".sublabel");
    if (structured) return structured;
    const lines = (node.innerText || "")
      .split("\n")
      .map((part) => part.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    return lines[1] || "";
  }

  function choiceRowSelected(node: unknown): boolean | null {
    if (!(node instanceof Element)) return null;
    const checked = node.getAttribute("aria-checked");
    if (checked !== null && checked !== "") return checked === "true";
    const selected = node.getAttribute("aria-selected");
    if (selected !== null && selected !== "") return selected === "true";
    const dataState = node.getAttribute("data-state");
    if (dataState === "checked" || dataState === "selected" || dataState === "on") return true;
    if (dataState === "unchecked" || dataState === "unselected" || dataState === "off") return false;
    if (node.matches(".selected, .checked")) return true;
    if (
      node.querySelector(
      ".selected, .checked, [aria-label='Selected'], [aria-label='selected'], [aria-label='已选中'], [data-state='checked'], [data-mat-icon-name='check']",
      )
    ) {
      return true;
    }
    return null;
  }

  function menuHasSelectionState(menu: Element | null): boolean {
    if (!menu) return false;
    return Boolean(
      menu.querySelector(
        "[aria-checked], [aria-selected], [role='menuitemradio'], [role='radio'], .selected, .checked, [aria-label='Selected'], [aria-label='已选中'], [data-mat-icon-name='check']",
      ),
    );
  }

  function nodeVisible(node: unknown): node is HTMLElement {
    if (!(node instanceof HTMLElement)) return false;
    const rect = node.getBoundingClientRect();
    return rect.width >= 1 && rect.height >= 1;
  }

  function choiceRowIsSelected(row: HTMLElement): boolean | null {
    const explicit = choiceRowSelected(row);
    if (explicit !== null) return explicit;
    const menu = row.closest(REASONING_MENU_SELECTOR);
    return menu && menuHasSelectionState(menu) ? false : null;
  }

  function choicePathForRow(row: Element): string[] {
    const path: string[] = [];
    let menu: Element | null = row.closest(REASONING_MENU_SELECTOR);
    let depth = 0;
    while (menu && depth < 5) {
      const menuId = menu.id;
      if (!menuId) break;
      const parent = Array.from(
        document.querySelectorAll<HTMLElement>("[aria-controls]"),
      ).find((node) => {
          if (isInsideTurboUI(node) || !nodeVisible(node)) return false;
          if (node.getAttribute("aria-controls") !== menuId) return false;
          const popup = node.getAttribute("aria-haspopup");
          if (popup === null || popup === "false") return false;
          const owner = node.closest(REASONING_MENU_SELECTOR);
          return Boolean(owner && owner !== menu);
        },
      );
      if (!parent) break;
      const owner = parent.closest(REASONING_MENU_SELECTOR);
      if (!owner || owner === menu) break;
      const label = rowLabel(parent);
      if (label) path.unshift(label);
      menu = owner;
      depth += 1;
    }
    return path;
  }

  function choiceRowForTarget(target: Element): HTMLElement | null {
    const row = target.closest(
      "gem-menu-item, [role='menuitem'], [role='menuitemradio'], [role='option'], [aria-checked], [aria-selected]",
    );
    if (!(row instanceof HTMLElement) || !row.closest(REASONING_MENU_SELECTOR)) {
      return null;
    }
    const popup = row.getAttribute("aria-haspopup");
    if (popup !== null && popup !== "false") return null;
    return rowLabel(row) ? row : null;
  }

  function findPathParent(menu: Element | null, label: string): HTMLElement | null {
    if (!menu || !label) return null;
    const parents = Array.from(
      menu.querySelectorAll("[aria-haspopup]:not([aria-haspopup='false'])"),
    ).filter((node): node is HTMLElement => {
      if (!(node instanceof HTMLElement)) return false;
      if (isInsideTurboUI(node) || !nodeVisible(node)) return false;
      const owner = node.closest("[role='menu']");
      if (owner && owner !== menu && menu.contains(owner)) return false;
      return rowLabel(node) === label;
    });
    return parents[0] || null;
  }

  function findExactChoiceRow(
    menu: Element | null,
    option: string,
  ): HTMLElement | null {
    if (!menu || !option) return null;
    const rows = Array.from(
      menu.querySelectorAll<HTMLElement>(CHOICE_OPTION_SELECTOR),
    ).filter((node) => {
        if (isInsideTurboUI(node) || !nodeVisible(node)) return false;
        if (node.closest(REASONING_MENU_SELECTOR) !== menu) return false;
        const popup = node.getAttribute("aria-haspopup");
        if (popup !== null && popup !== "false") return false;
        return rowLabel(node) === option;
      },
    );
    return rows.reduce<HTMLElement | null>((deepest, node) => {
      if (!deepest) return node;
      return deepest.contains(node) ? node : deepest;
    }, null);
  }

  function submenuForParent(parent: Element): HTMLElement | null {
    const id = parent.getAttribute("aria-controls");
    const menu = id ? document.getElementById(id) : null;
    return menu && nodeVisible(menu) ? menu : null;
  }

  function choiceLooksApplied(saved: ReasoningRecord, control: HTMLElement): boolean {
    const label = controlLabel(control).toLowerCase();
    if (!label) return false;
    if (saved.resultLabel && label === String(saved.resultLabel).toLowerCase()) {
      return true;
    }
    const option = String(saved.option || "").trim();
    if (!option) return false;
    if (/\bcurrently\s+/i.test(option)) {
      const tail = option.replace(/^.*\bcurrently\s+/i, "").trim().toLowerCase();
      return Boolean(tail) && (label === tail || label.endsWith(` ${tail}`));
    }
    const expected = option.toLowerCase();
    return label === expected || label.endsWith(` ${expected}`);
  }

  function choiceTokens(saved: ReasoningRecord): string[] {
    const option = String(saved.option || "").trim();
    if (Array.isArray(saved.path) && saved.path.length) {
      return [...saved.path, option].map((part) => String(part).trim()).filter(Boolean);
    }
    const currentValue = option.replace(/^.*\bcurrently\s+/i, "").trim();
    return currentValue.split(/\s+/).filter(Boolean);
  }

  function upgradeChoiceRecord(
    saved: ReasoningRecord,
    control: HTMLElement,
    info: ReasoningChoiceInfo,
  ): void {
    const stableKey = controlKey(control);
    if (!stableKey || !info || !info.option) return;
    const samePath =
      JSON.stringify(Array.isArray(saved.path) ? saved.path : []) ===
      JSON.stringify(info.path);
    if (saved.key === stableKey && saved.option === info.option && samePath) return;
    const labelNow = controlLabel(control);
    writeReasoningRecord({
      mode: "choice",
      key: stableKey,
      controlLabel: saved.controlLabel || "",
      path: info.path,
      option: info.option,
      hint: info.hint || "",
      resultLabel: labelNow || saved.resultLabel || "",
      ts: Date.now(),
    });
    renderReasoningStatus();
  }

  function findRowIn(root: Element | null, token: string): HTMLElement | null {
    if (!root || !token) return null;
    const rows = Array.from(
      root.querySelectorAll<HTMLElement>(CHOICE_OPTION_SELECTOR),
    ).filter((node) => {
      if (isInsideTurboUI(node)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width >= 1 && rect.height >= 1;
    });
    const exact = rows.filter((node) => rowLabel(node) === token);
    if (exact.length) {
      return exact.reduce((best, node) => (best.contains(node) ? node : best));
    }
    const tail = rows.filter((node) => rowLabel(node).endsWith(token));
    if (tail.length === 1) return tail[0];
    // 子菜单行把说明挤在同一行（Gemini 的“High Extra thorough”），退回“以该词开头且唯一”
    const head = rows.filter((node) => rowLabel(node).startsWith(`${token} `));
    return head.length === 1 ? head[0] : null;
  }

  function interactiveTarget(node: HTMLElement): HTMLElement {
    if (node.matches("button, a, [role='menuitemradio'], [role='radio']")) return node;
    const inner = node.querySelector("button, a");
    return inner instanceof HTMLElement ? inner : node;
  }

  function findRowInOpenMenus(token: string): HTMLElement | null {
    const menus = Array.from(
      document.querySelectorAll<HTMLElement>(REASONING_MENU_SELECTOR),
    ).filter((node) => {
      if (isInsideTurboUI(node) || toolScope.isInside(node)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width >= 1 && rect.height >= 1;
    });
    for (let i = menus.length - 1; i >= 0; i -= 1) {
      const row = findRowIn(menus[i], token);
      if (row) return row;
    }
    return null;
  }

  function findSubmenuParent(root: Element | null, token: string): HTMLElement | null {
    if (!root) return null;
    // 只有真能展开的行才算：Gemini 的普通行也带 aria-haspopup="false"，整链会被它们撑满
    const parents = Array.from(
      root.querySelectorAll("[aria-haspopup]:not([aria-haspopup='false'])"),
    ).filter((node): node is HTMLElement => {
      if (!(node instanceof HTMLElement)) return false;
      if (isInsideTurboUI(node)) return false;
      // 子菜单里的行已经属于下一层，在这一层点它没有意义
      const owner = node.closest("[role='menu']");
      if (owner && owner !== root && root.contains(owner)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width >= 1 && rect.height >= 1;
    });
    if (!parents.length) return null;
    const loaded = parents.find((parent) => {
      const sub = document.getElementById(parent.getAttribute("aria-controls") || "");
      return sub ? Boolean(findRowIn(sub, token)) : false;
    });
    return loaded || (parents.length === 1 ? parents[0] : null);
  }

  function choiceRowInfo(row: HTMLElement | null): ReasoningChoiceInfo | null {
    if (!row || !row.isConnected) return null;
    const option = rowLabel(row);
    if (!option) return null;
    return { option, hint: rowHint(row), path: choicePathForRow(row) };
  }

  function restorePathChoice(
    saved: ReasoningRecord,
    control: HTMLElement,
    onSettled: (ok: boolean, conclusive: boolean) => void,
    token: number,
  ): void {
    const path = (Array.isArray(saved.path) ? saved.path : [])
      .map((part) => String(part).trim())
      .filter(Boolean);
    const option = String(saved.option || "").trim();
    if (!option) {
      onSettled(false, false);
      return;
    }

    let settled = false;
    let lastRow: HTMLElement | null = null;

    const finish = (ok: boolean, conclusive?: boolean): void => {
      if (settled) return;
      settled = true;
      if (restoreIsStale(token)) return;
      const info = ok ? choiceRowInfo(lastRow) : null;
      window.setTimeout(() => closeOpenPopup(control), 100);
      if (info) {
        window.setTimeout(() => {
          if (control.isConnected) upgradeChoiceRecord(saved, control, info);
        }, 300);
      }
      applyingReasoning = false;
      // A missing path or option will not appear on a later attempt; only a slow popup is retried.
      onSettled(ok, conclusive === true);
    };

    const waitForSubmenu = (
      parent: HTMLElement,
      done: (submenu: HTMLElement | null) => void,
      attempt: number,
    ): void => {
      if (settled || restoreIsStale(token)) return;
      const sub = submenuForParent(parent);
      if (sub) {
        done(sub);
        return;
      }
      if (attempt >= 10) {
        done(null);
        return;
      }
      window.setTimeout(() => waitForSubmenu(parent, done, attempt + 1), 180);
    };

    const walk = (
      menu: Element | null,
      index: number,
      done: (row: HTMLElement) => void,
      fail: (conclusive: boolean) => void,
    ): void => {
      if (settled || restoreIsStale(token)) return;
      if (!menu) {
        fail(false);
        return;
      }
      if (index >= path.length) {
        const row = findExactChoiceRow(menu, option);
        if (row) done(row);
        else fail(true);
        return;
      }
      const parent = findPathParent(menu, path[index]);
      if (!parent) {
        fail(true);
        return;
      }
      // Some menus expand on hover, so send both events before the click.
      parent.dispatchEvent(
        new PointerEvent("pointerover", { bubbles: true, cancelable: true, view: window }),
      );
      parent.dispatchEvent(new MouseEvent("mouseenter", { view: window }));
      triggerSendButton(interactiveTarget(parent));
      waitForSubmenu(parent, (sub) => {
        if (!sub) {
          fail(false);
          return;
        }
        walk(sub, index + 1, done, fail);
      }, 0);
    };

    const openRoot = (
      done: (menu: HTMLElement) => void,
      attempt: number,
    ): void => {
      if (settled || restoreIsStale(token)) return;
      const root = popupRootFor(control);
      if (root && nodeVisible(root)) {
        done(root);
        return;
      }
      const fallback = Array.from(
        document.querySelectorAll<HTMLElement>(REASONING_MENU_SELECTOR),
      ).find((node) => !isInsideTurboUI(node) && nodeVisible(node));
      if (fallback) {
        done(fallback);
        return;
      }
      if (attempt >= 10) {
        finish(false, false);
        return;
      }
      if (attempt === 0) triggerSendButton(interactiveTarget(control));
      window.setTimeout(() => openRoot(done, attempt + 1), 180);
    };

    const verifySelection = (): void => {
      window.setTimeout(() => {
        if (settled) return;
        if (restoreIsStale(token)) return;
        closeOpenPopup(control);
        window.setTimeout(() => {
          if (settled) return;
          openRoot((menu) => {
            walk(
              menu,
              0,
              (row) => {
                lastRow = row;
                const selected = choiceRowIsSelected(row);
                if (selected === true) finish(true);
                else if (selected === false) finish(false);
                else finish(choiceLooksApplied(saved, control));
              },
              (conclusive) => finish(false, conclusive === true),
            );
          }, 0);
        }, 220);
      }, 260);
    };

    applyingReasoning = true;
    openRoot((menu) => {
      walk(
        menu,
        0,
        (row) => {
          lastRow = row;
          const selected = choiceRowIsSelected(row);
          if (selected === true) {
            finish(true);
            return;
          }
          if (selected === null && choiceLooksApplied(saved, control)) {
            finish(true);
            return;
          }
          triggerSendButton(interactiveTarget(row));
          verifySelection();
        },
        (conclusive) => finish(false, conclusive === true),
      );
    }, 0);
  }

  function restoreChoice(
    saved: ReasoningRecord,
    control: HTMLElement,
    onSettled: (ok: boolean, conclusive: boolean) => void,
    restoreId: number,
  ): void {
    const tokens = choiceTokens(saved);
    if (!tokens.length) {
      onSettled(false, false);
      return;
    }
    let index = 0;
    let settled = false;
    let lastRow: HTMLElement | null = null;
    const finish = (ok: boolean, conclusive?: boolean): void => {
      if (settled) return;
      settled = true;
      if (restoreIsStale(restoreId)) return;
      const info = ok ? choiceRowInfo(lastRow) : null;
      window.setTimeout(() => closeOpenPopup(control), 100);
      if (info) {
        window.setTimeout(() => {
          if (control.isConnected) upgradeChoiceRecord(saved, control, info);
        }, 300);
      }
      applyingReasoning = false;
      onSettled(ok, conclusive === true);
    };
    const step = (attempt: number): void => {
      if (settled || restoreIsStale(restoreId)) return;
      const token = tokens[index];
      const root = popupRootFor(control);
      const hit = findRowIn(root, token) || findRowInOpenMenus(token);
      if (hit) {
        lastRow = hit;
        triggerSendButton(interactiveTarget(hit));
        next();
        return;
      }
      const parent = findSubmenuParent(root, token);
      if (parent) {
        // 子菜单可能是悬停展开的，先给一个移入事件，再点
        parent.dispatchEvent(
          new PointerEvent("pointerover", { bubbles: true, cancelable: true, view: window }),
        );
        parent.dispatchEvent(new MouseEvent("mouseenter", { view: window }));
        triggerSendButton(interactiveTarget(parent));
        // 子菜单点开才渲染，等它出现再找（最多约 1.4s）
        const lookInSub = (deep: number): void => {
          if (settled || restoreIsStale(restoreId)) return;
          const sub = document.getElementById(parent.getAttribute("aria-controls") || "");
          const row =
            findRowIn(sub, token) ||
            findRowIn(popupRootFor(control), token) ||
            findRowInOpenMenus(token);
          if (row) {
            lastRow = row;
            triggerSendButton(interactiveTarget(row));
            next();
            return;
          }
          if (deep >= 6) {
            closeOpenPopup(control);
            finish(false, true);
            return;
          }
          window.setTimeout(() => lookInSub(deep + 1), 200);
        };
        window.setTimeout(() => lookInSub(0), 250);
        return;
      }
      // 首次展开弹层较慢时菜单还不在 DOM 里，多等几轮（约 2s），否则会在空菜单上白点一下
      if (attempt >= 8) {
        // 没找到就关掉菜单，不留一个弹层挡着用户
        const menuWasOpen = hasVisibleMenu();
        closeOpenPopup(control);
        finish(false, menuWasOpen);
        return;
      }
      window.setTimeout(() => step(attempt + 1), 250);
    };
    const next = () => {
      index += 1;
      if (index >= tokens.length) {
        finish(true);
        return;
      }
      // 下一层要重新展开弹层；先关掉，避免停在中间状态
      closeOpenPopup(control);
      window.setTimeout(() => {
        triggerSendButton(interactiveTarget(control));
        window.setTimeout(() => step(0), 350);
      }, 200);
    };
    applyingReasoning = true;
    triggerSendButton(interactiveTarget(control));
    window.setTimeout(() => step(0), 350);
  }

  function observeControlChoice(
    control: HTMLElement,
    labelBefore: string,
    startedAt: number,
  ): void {
    [400, 900, 1600, 2600].forEach((delay) => {
      window.setTimeout(() => {
        if (applyingReasoning || !control.isConnected) return;
        const labelNow = controlLabel(control);
        if (!labelNow || labelNow === labelBefore) return;
        const memory = loadReasoningMemory();
        const saved = readReasoningRecord(memory);
        if (saved && saved.mode === "choice") {
          // A path-aware record from this same click is richer than the label.
          if (startedAt && saved.ts && saved.ts >= startedAt) return;
          if (saved.option === labelNow) return;
        }
        // A toggle that only changes its own text opens no menu. Recording it
        // as a choice makes the next restore click it forever.
        const root = popupRootFor(control);
        if (!hasVisibleMenu() && !(root && nodeVisible(root))) return;
        writeReasoningRecord({
          mode: "choice",
          key: controlKey(control),
          controlLabel: labelBefore,
          option: labelNow,
          ts: Date.now(),
        });
        renderReasoningStatus();
      }, delay);
    });
  }

  function captureChoiceResult(trigger: HTMLElement, record: ReasoningRecord): void {
    [300, 700, 1400, 2400].forEach((delay) => {
      window.setTimeout(() => {
        if (applyingReasoning || !trigger.isConnected) return;
        const labelNow = controlLabel(trigger);
        if (!labelNow || labelNow === record.controlLabel) return;
        const memory = loadReasoningMemory();
        const saved = readReasoningRecord(memory);
        if (!saved || saved.mode !== "choice" || saved.ts !== record.ts) return;
        if (saved.resultLabel === labelNow) return;
        saved.resultLabel = labelNow;
        saveReasoningMemory(memory);
        renderReasoningStatus();
      }, delay);
    });
  }

  function pairOptionClick(target: Element): boolean {
    if (isToolControlElement(target) || toolScope.isInside(target)) return false;
    const row = choiceRowForTarget(target);
    if (!row) return false;
    const trigger = reasoningMenuTrigger;
    if (!trigger || !trigger.isConnected) return false;
    if (Date.now() - reasoningMenuTriggerAt > 20000) return false;
    if (row === trigger || row.contains(trigger)) return false;
    const optionText = rowLabel(row);
    if (!optionText) return false;
    const menu = row.closest(REASONING_MENU_SELECTOR);
    const path = choicePathForRow(row);
    const explicitChoice = row.matches(CHOICE_RADIO_SELECTOR);
    // Top-level action rows have no selection marker and must not be recorded.
    if (!explicitChoice && !(path.length && menuHasSelectionState(menu))) {
      return false;
    }
    const triggerLabel = reasoningMenuTriggerLabel;
    const hint = rowHint(row);
    const ts = Date.now();
    const record: ReasoningRecord = {
      mode: "choice",
      key: controlKey(trigger),
      controlLabel: triggerLabel,
      path,
      option: optionText,
      hint,
      ts,
    };
    window.setTimeout(() => {
      if (applyingReasoning) return;
      writeReasoningRecord(record);
      renderReasoningStatus();
      captureChoiceResult(trigger, record);
    }, 0);
    return true;
  }

  function handleReasoningClick(event: MouseEvent): void {
    if (isEngineDormant()) return;
    if (!state.rememberReasoning || applyingReasoning) return;
    const target = event.target;
    if (!(target instanceof Element) || isInsideTurboUI(target)) return;
    // Yuanbao's add-tool entry is a popup trigger with no reasoning keyword;
    // its rows must never overwrite the reasoning record either.
    if (isToolControlElement(target) || toolScope.isInside(target)) return;
    if (pairOptionClick(target)) return;
    // 弹层里的项不单独记：它的效果会体现在控件的文案上
    if (target.closest(REASONING_MENU_SELECTOR)) return;
    const control = target.closest(REASONING_CONTROL_SELECTOR);
    if (!(control instanceof HTMLElement)) return;

    const startedAt = Date.now();
    const labelBefore = controlLabel(control);
    if (!labelBefore) return;
    const keywordMatch = REASONING_CONTROL_PATTERN.test(labelBefore);
    // 不靠关键词也得是下拉/弹层触发器，否则“发送→停止”这类文案变化会被当成强度选择
    if (!keywordMatch && !isDropdownTrigger(control)) return;
    reasoningMenuTrigger = control;
    reasoningMenuTriggerAt = Date.now();
    reasoningMenuTriggerLabel = labelBefore;

    if (keywordMatch) {
      window.setTimeout(() => {
        if (applyingReasoning || !control.isConnected) return;
        const on = controlOnState(control);
        if (on === null) return; // 状态不可读，记了也安全不了
        writeReasoningRecord({ mode: "toggle", label: labelBefore, on, ts: Date.now() });
        renderReasoningStatus();
      }, 0);
    }

    if (keywordMatch && explicitToggleState(control) !== null) return;
    observeControlChoice(control, labelBefore, startedAt);
  }

  function handleDehydratedClick(event: MouseEvent): void {
    if (isEngineDormant()) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const turnElement = target.closest(".ai-turbo-dehydrated");
    if (!(turnElement instanceof HTMLElement)) return;

    markRestoredTurn(turnElement);
    withSelfMutation(() => {
      turnElement.classList.remove("ai-turbo-dehydrated");
      turnElement.style.removeProperty("--turbo-cached-h");
    });
    requestFullTurnSync();
    requestUpdate();
  }

  function renderReasoningStatus(): void {
    if (!reasoningStatusNode) return;
    reasoningStatusNode.textContent = "";
    if (!state.rememberReasoning) {
      reasoningStatusNode.textContent = "推理记忆：已关闭";
      return;
    }
    const saved = readReasoningRecord();
    if (!saved || !saved.mode) {
      reasoningStatusNode.textContent =
        "推理记忆：未记录（在页面里点一次强度/模型选项即可）";
      return;
    }
    const pathText =
      saved.mode === "choice" && Array.isArray(saved.path) && saved.path.length
        ? `${saved.path.join(" / ")} / `
        : "";
    const shown =
      saved.mode === "choice"
        ? `${saved.controlLabel || "控件"} → ${pathText}${saved.option}`
        : `${saved.label}（${saved.on ? "开" : "关"}）`;
    reasoningStatusNode.textContent = `推理记忆：${shown} `;
    reasoningStatusNode.appendChild(
      el(
        "button",
        {
          type: "button",
          onclick: () => {
            clearReasoningRecord();
            renderReasoningStatus();
          },
        },
        ["清除"],
      ),
    );
  }

  function findRememberedControl(saved: ReasoningRecord): HTMLElement | null {
    const visible = Array.from(
      document.querySelectorAll<HTMLElement>(REASONING_CONTROL_SELECTOR),
    ).filter(
      (node) =>
        !isInsideTurboUI(node) &&
        !toolScope.isInside(node) &&
        !isToolControlElement(node) &&
        nodeVisible(node),
    );
    if (saved.key) {
      const byKey = visible.find((node) => controlKey(node) === saved.key);
      if (byKey) return byKey;
    }
    if (/,\s*currently\b/i.test(saved.key || "")) {
      const prefix = String(saved.key).split(/,\s*currently\b/i)[0].trim();
      const byAccessibleName = visible.find((node) => {
        const ariaLabel = node.getAttribute("aria-label") || "";
        return ariaLabel === saved.key || ariaLabel.startsWith(`${prefix},`);
      });
      if (byAccessibleName) return byAccessibleName;
    }
    if (saved.controlLabel) {
      const byLabel = visible.find((node) => controlLabel(node) === saved.controlLabel);
      if (byLabel) return byLabel;
      const byLabelPrefix = visible.find((node) =>
        controlLabel(node).startsWith(`${saved.controlLabel} `),
      );
      if (byLabelPrefix) return byLabelPrefix;
    }
    // 文案会随选择变化，最后退一步找最像推理/模型选择的控件
    return visible.find((node) => REASONING_CONTROL_PATTERN.test(controlLabel(node))) || null;
  }

  function applyReasoningMemory(): void {
    syncConversationScope();
    if (isEngineDormant()) {
      reasoningRestoreDone = true;
      return;
    }
    const saved = readReasoningRecord();
    if (!saved || !saved.mode) {
      reasoningRestoreDone = true;
      return;
    }
    const control = findRememberedControl(saved);
    if (!control) return; // 页还没渲染好，下次再试
    if (applyingReasoning) return; // 上一次还原还在进行中

    const stableKey = controlKey(control);
    if (saved.mode === "choice" && stableKey && saved.key !== stableKey) {
      saved.key = stableKey;
      writeReasoningRecord(saved);
    }

    if (saved.mode === "choice" && /,\s*currently\b/i.test(saved.option || "")) {
      const normalized = String(saved.option).replace(/^.*\bcurrently\s+/i, "").trim();
      if (normalized) {
        saved.option = normalized;
        writeReasoningRecord(saved);
      }
    }

    if (saved.mode === "choice" && saved.option) {
      if (choiceLooksApplied(saved, control)) {
        reasoningRestoreDone = true;
        return;
      }
      const attemptKey = choiceAttemptKey(control, saved);
      const attempts = choiceRestoreAttempts.get(attemptKey) ?? 0;
      if (attempts >= 2) {
        // A record that cannot be applied twice will not start working on the
        // next poll; keep the menu closed instead of flashing it forever.
        reasoningRestoreDone = true;
        return;
      }
      choiceRestoreAttempts.set(attemptKey, attempts + 1);
      const token = beginRestore();
      // Retry only transient failures; an unavailable saved option cannot appear later.
      const restore = Array.isArray(saved.path) ? restorePathChoice : restoreChoice;
      restore(saved, control, (ok: boolean, conclusive: boolean): void => {
        // Retrying a record whose target row is missing only makes the menu flash open forever.
        reasoningRestoreDone = ok || conclusive === true;
        if (attempts + 1 >= 2) reasoningRestoreDone = true;
      }, token);
      return;
    }

    reasoningRestoreDone = true;
    if (saved.mode !== "toggle") return;
    const now = controlOnState(control);
    if (now === null || now === (saved.on === true)) return;
    const desired = saved.on === true;
    const attemptKey = toggleAttemptKey(control, desired);
    if (correctedToggleAttempts.has(attemptKey)) return;
    correctedToggleAttempts.add(attemptKey);
    const token = beginRestore();
    applyingReasoning = true;
    if (!clickControlOnce(control)) {
      applyingReasoning = false;
      return;
    }
    settleToggleCorrection(control, desired, token);
  }

  function clearReasoningRestoreTimer(): void {
    window.clearInterval(reasoningRestoreTimer);
    reasoningRestoreTimer = 0;
    window.clearTimeout(reasoningSettleTimer);
    reasoningSettleTimer = 0;
    for (const timer of popupCloseTimers.splice(0)) window.clearTimeout(timer);
    restoreToken += 1;
    applyingReasoning = false;
  }

  function scheduleReasoningRestore(): void {
    clearReasoningRestoreTimer();
    syncConversationScope();
    reasoningRestoreDone = false;
    reasoningRestoreAttempts = 0;
    if (isEngineDormant()) return;
    if (!state.rememberReasoning) return;
    if (!readReasoningRecord()) return;
    reasoningRestoreTimer = window.setInterval(() => {
      reasoningRestoreAttempts += 1;
      applyReasoningMemory();
      if (reasoningRestoreDone || reasoningRestoreAttempts >= 120) {
        clearReasoningRestoreTimer();
      }
    }, 500);
  }
  function attachStatusNode(node: HTMLElement | null): void {
    reasoningStatusNode = node;
  }

  return {
    handleReasoningClick,
    handleDehydratedClick,
    renderReasoningStatus,
    applyReasoningMemory,
    clearReasoningRestoreTimer,
    scheduleReasoningRestore,
    attachStatusNode,
  };
}
