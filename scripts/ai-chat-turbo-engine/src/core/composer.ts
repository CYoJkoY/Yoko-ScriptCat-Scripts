import { reportRecoverableError } from "./diagnostics";
import { COMPOSER_VISUAL_GAP, COMPOSER_VISUAL_MAX_DEPTH, HUD_ID } from "../config";
import { escapeHtml } from "./text";
import type { PlatformDefinition } from "../config";

export interface ComposerDeps {
  currentPlatform: PlatformDefinition;
}

export interface ComposerUtils {
  getChatInput(): HTMLElement | null;
  findSendControl(
    inputElement: HTMLElement | null,
    options?: { allowDisabled?: boolean },
  ): HTMLElement | null;
  triggerSendButton(control: unknown): boolean;
  fallbackKeyboardSubmit(inputElement: HTMLElement | null): boolean;
  isSendLikeButton(control: unknown): boolean;
  getInputContainer(input: HTMLElement): HTMLElement | null;
  getComposerVisualBounds(input: HTMLElement, anchor: HTMLElement): TextBounds;
  insertTextAtomic(inputElement: HTMLElement, text: string): void;
}

export interface TextBounds {
  top: number;
  left: number;
  right: number;
  width: number;
}

export function createComposerUtils(deps: ComposerDeps): ComposerUtils {
  const { currentPlatform } = deps;
  function getChatInput(): HTMLElement | null {
    const selectors = [
      ...(currentPlatform.inputSelectors || []),
      'form[data-chatgpt-composer] [contenteditable="true"][role="textbox"]',
      'div.ProseMirror[contenteditable="true"][role="textbox"]',
      "rich-textarea div[contenteditable='true']",
      'div[contenteditable="true"][role="textbox"]',
      "textarea",
      '[contenteditable="true"]',
    ];

    for (const selector of [...new Set(selectors)]) {
      const candidates = document.querySelectorAll(selector);
      for (const candidate of candidates) {
        if (
          !(candidate instanceof HTMLElement) ||
          !candidate.isConnected ||
          candidate.closest("#" + HUD_ID) ||
          (candidate.offsetParent === null &&
            candidate.getClientRects().length === 0)
        ) {
          continue;
        }
        if (
          candidate.matches(
            'input[type="hidden"], textarea[aria-hidden="true"]',
          ) ||
          candidate.getAttribute("aria-hidden") === "true"
        ) {
          continue;
        }
        return candidate;
      }
    }

    return null;
  }

  function isSendControlForInput(
    sendControl: unknown,
    inputElement: unknown,
  ): boolean {
    if (
      !(sendControl instanceof HTMLElement) ||
      !(inputElement instanceof HTMLElement)
    ) {
      return false;
    }

    const inputForm = inputElement.closest("form");
    const sendForm = sendControl.closest("form");
    if (inputForm && sendForm) {
      return inputForm === sendForm;
    }

    const composerSelectors = [
      "[data-chatgpt-composer]",
      ".input-area",
      ".input-area-container",
      "rich-textarea",
      "[class*='composer-parent']",
      "[class*='input-area']",
      "[class*='composer']",
      "[class*='input-container']",
      "fieldset",
    ];

    const sharesComposerContainer = composerSelectors.some((selector) => {
      const inputContainer = inputElement.closest(selector);
      return Boolean(
        inputContainer && inputContainer === sendControl.closest(selector),
      );
    });
    if (sharesComposerContainer) return true;

    // Some platforms render the input and send control as siblings without a
    // shared form or a consistently named composer wrapper.
    let ancestor = inputElement.parentElement;
    let depth = 0;
    while (ancestor && depth < 5 && ancestor !== document.body) {
      if (ancestor.contains(sendControl)) return true;
      ancestor = ancestor.parentElement;
      depth++;
    }

    return false;
  }

  function isSendLikeButton(btn: unknown): boolean {
    if (!(btn instanceof HTMLElement) || btn.tagName !== "BUTTON") return false;
    const label = [
      btn.getAttribute("aria-label") || "",
      btn.getAttribute("title") || "",
      btn.getAttribute("data-testid") || "",
      btn.getAttribute("data-tooltip") || "",
    ]
      .join(" ")
      .toLowerCase();
    // 排除停止/取消类按钮（ChatGPT 生成中会替换发送按钮为"Stop streaming"）
    if (/\bstop\b|停止|cancel|abort|中止|取消/.test(label)) return false;
    return /send|submit|发送|提交|prompt|ask/.test(label);
  }

  function isButtonUsable(btn: unknown): boolean {
    if (!(btn instanceof HTMLElement) || !btn.isConnected) return false;
    if (
      btn.closest(`#${HUD_ID}, #ai-turbo-vf-tray, #ai-turbo-vf-preview-modal`)
    )
      return false;
    const style = window.getComputedStyle(btn);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return btn.getClientRects().length > 0;
  }

  function isButtonDisabled(btn: unknown): boolean {
    if (!(btn instanceof HTMLElement)) return true;
    if (btn.hasAttribute("disabled")) return true;
    if (btn instanceof HTMLButtonElement && btn.disabled === true) return true;
    if (btn instanceof HTMLInputElement && btn.disabled === true) return true;
    if (btn.getAttribute("aria-disabled") === "true") return true;
    return false;
  }

  function findSendControl(
    inputElement: HTMLElement | null,
    { allowDisabled = false }: { allowDisabled?: boolean } = {},
  ): HTMLElement | null {
    if (!inputElement) return null;

    const usable = (btn: unknown): boolean =>
      isButtonUsable(btn) && (allowDisabled || !isButtonDisabled(btn));

    // 1) 平台选择器
    for (const sel of currentPlatform.sendButtonSelectors || []) {
      let matches: NodeListOf<Element>;
      try {
        matches = document.querySelectorAll(sel);
      } catch (error: unknown) {
        reportRecoverableError("query platform send selector", error);
        continue;
      }
      for (const btn of matches) {
        if (
          usable(btn) &&
          isSendControlForInput(btn, inputElement) &&
          btn instanceof HTMLElement
        ) {
          return btn;
        }
      }
    }

    // 2) input 所在 form
    const form = inputElement.closest("form");
    if (form) {
      for (const btn of form.querySelectorAll(
        'button[type="submit"], button:not([type="button"]):not([type="reset"])',
      )) {
        if (usable(btn) && isSendLikeButton(btn) && btn instanceof HTMLElement)
          return btn;
      }
      for (const btn of form.querySelectorAll("button")) {
        if (usable(btn) && isSendLikeButton(btn) && btn instanceof HTMLElement)
          return btn;
      }
    }

    // 3) composer 容器
    const composerSelectors = [
      "[data-chatgpt-composer]",
      ".input-area-container",
      "[class*='composer']",
      "[class*='input-area']",
      "[class*='input-container']",
      "[class*='query-bar']",
      "rich-textarea",
      "fieldset",
    ];
    for (const sel of composerSelectors) {
      let container: Element | null = null;
      try {
        container = inputElement.closest(sel);
      } catch (error: unknown) {
        reportRecoverableError("query composer container", error);
      }
      if (!container) continue;
      for (const btn of container.querySelectorAll("button")) {
        if (usable(btn) && isSendLikeButton(btn) && btn instanceof HTMLElement)
          return btn;
      }
    }

    // 4) 从 input 向上 8 层找
    let ancestor = inputElement.parentElement;
    let depth = 0;
    while (
      ancestor &&
      depth < 8 &&
      ancestor !== document.body &&
      ancestor !== document.documentElement
    ) {
      for (const btn of ancestor.querySelectorAll("button")) {
        if (usable(btn) && isSendLikeButton(btn) && btn instanceof HTMLElement)
          return btn;
      }
      ancestor = ancestor.parentElement;
      depth++;
    }

    return null;
  }

  /** 完整模拟 pointer + mouse 序列，兼容 React onPointerDown / onMouseDown */
  function triggerSendButton(btn: unknown): boolean {
    if (!(btn instanceof HTMLElement)) return false;
    try {
      btn.focus({ preventScroll: true });
    } catch (error: unknown) {
      reportRecoverableError("focus send control", error);
    }

    const opts = {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
    };
    try {
      btn.dispatchEvent(
        new PointerEvent("pointerdown", {
          ...opts,
          buttons: 1,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
        }),
      );
    } catch (error: unknown) {
      reportRecoverableError("dispatch pointerdown", error);
    }
    try {
      btn.dispatchEvent(new MouseEvent("mousedown", { ...opts, buttons: 1 }));
    } catch (error: unknown) {
      reportRecoverableError("dispatch mousedown", error);
    }
    try {
      btn.dispatchEvent(
        new PointerEvent("pointerup", {
          ...opts,
          buttons: 0,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
        }),
      );
    } catch (error: unknown) {
      reportRecoverableError("dispatch pointerup", error);
    }
    try {
      btn.dispatchEvent(new MouseEvent("mouseup", { ...opts, buttons: 0 }));
    } catch (error: unknown) {
      reportRecoverableError("dispatch mouseup", error);
    }
    try {
      btn.click();
    } catch (error: unknown) {
      reportRecoverableError("click send control", error);
      return false;
    }
    return true;
  }

  function fallbackKeyboardSubmit(inputElement: HTMLElement | null): boolean {
    if (!inputElement) return false;
    try {
      inputElement.focus({ preventScroll: true });
    } catch (error: unknown) {
      reportRecoverableError("focus composer", error);
    }

    const form = inputElement.closest("form");
    if (form && typeof form.requestSubmit === "function") {
      try {
        form.requestSubmit();
        return true;
      } catch (error: unknown) {
        reportRecoverableError("submit composer form", error);
      }
    }

    const enterOpts = {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
      composed: true,
    };
    const enterEvt = new KeyboardEvent("keydown", enterOpts);
    try {
      Object.defineProperty(enterEvt, "keyCode", { get: () => 13 });
      Object.defineProperty(enterEvt, "which", { get: () => 13 });
    } catch (error: unknown) {
      reportRecoverableError("emulate legacy Enter key", error);
    }
    inputElement.dispatchEvent(enterEvt);
    inputElement.dispatchEvent(new KeyboardEvent("keyup", enterOpts));
    return true;
  }

  function getInputContainer(input: HTMLElement): HTMLElement | null {
    if (!input) return null;

    const candidates = [
      "form[data-chatgpt-composer]",
      "[data-chatgpt-composer]",
      ".input-area-container",
      "form",
      ".input-area",
      "[class*='composer-parent']",
      "[class*='composer']",
      "[class*='input-area']",
      "[class*='input-container']",
      "rich-textarea",
      "fieldset",
    ];

    const inputRect = input.getBoundingClientRect();
    if (!inputRect.width || !inputRect.height) {
      return input.parentElement;
    }

    let best: HTMLElement | null = null;
    let bestArea = Infinity;

    for (const selector of candidates) {
      let matched: Element | null = null;
      try {
        matched = input.closest(selector);
      } catch (error: unknown) {
        reportRecoverableError("query input container", error);
        continue;
      }
      if (!(matched instanceof HTMLElement) || matched === input) continue;

      const rect = matched.getBoundingClientRect();
      if (rect.height < 20 || rect.width < 40) continue;
      if (rect.top > inputRect.top + 2) continue;
      if (rect.bottom < inputRect.bottom - 2) continue;
      if (rect.width < inputRect.width * 0.75) continue;

      const area = rect.width * rect.height;
      if (area < bestArea) {
        bestArea = area;
        best = matched;
      }
    }

    return best || input.parentElement;
  }

  function getComposerVisualBounds(
    input: HTMLElement,
    anchor: HTMLElement | null,
  ): { top: number; left: number; right: number; width: number } {
    const baseRect = (anchor || input).getBoundingClientRect();
    const bounds = {
      top: baseRect.top,
      left: baseRect.left,
      right: baseRect.right,
      width: baseRect.width,
    };

    let node = anchor || input;
    let depth = 0;

    while (node && depth < COMPOSER_VISUAL_MAX_DEPTH) {
      const nodeRect = node.getBoundingClientRect();
      let cursorTop = Math.min(nodeRect.top, bounds.top);

      let sibling = node.previousElementSibling;
      let guard = 0;

      while (sibling && guard < 24) {
        guard++;

        if (
          sibling.id === "ai-turbo-vf-tray" ||
          sibling.id === HUD_ID ||
          sibling.id === "ai-turbo-vf-preview-modal"
        ) {
          sibling = sibling.previousElementSibling;
          continue;
        }

        const siblingRect = sibling.getBoundingClientRect();
        const isVisible = siblingRect.width > 0 && siblingRect.height > 0;
        if (!isVisible) {
          sibling = sibling.previousElementSibling;
          continue;
        }

        const siblingStyle = window.getComputedStyle(sibling);
        if (
          siblingStyle.position === "fixed" ||
          siblingStyle.position === "sticky"
        ) {
          sibling = sibling.previousElementSibling;
          continue;
        }

        if (
          sibling.matches('button, [role="button"]') &&
          !sibling.querySelector(
            'input, textarea, [contenteditable="true"], [role="textbox"]',
          )
        ) {
          sibling = sibling.previousElementSibling;
          continue;
        }

        if (siblingRect.top < 8) {
          break;
        }

        const maxSiblingHeight = Math.max(baseRect.height * 3, 320);
        if (siblingRect.height > maxSiblingHeight) {
          break;
        }

        const overlap =
          Math.min(bounds.right, siblingRect.right) -
          Math.max(bounds.left, siblingRect.left);
        const minOverlap = Math.min(bounds.width, siblingRect.width) * 0.35;
        const gap = cursorTop - siblingRect.bottom;

        if (overlap > minOverlap && gap >= -1 && gap <= COMPOSER_VISUAL_GAP) {
          bounds.top = Math.min(bounds.top, siblingRect.top);
          bounds.left = Math.min(bounds.left, siblingRect.left);
          bounds.right = Math.max(bounds.right, siblingRect.right);
          bounds.width = bounds.right - bounds.left;
          cursorTop = siblingRect.top;
          sibling = sibling.previousElementSibling;
          continue;
        }

        break;
      }

      const parent = node.parentElement;
      if (
        !parent ||
        parent === document.body ||
        parent === document.documentElement
      ) {
        break;
      }
      node = parent;
      depth++;
    }

    return bounds;
  }

  function insertTextAtomic(inputElement: HTMLElement, text: string): void {
    if (
      inputElement instanceof HTMLTextAreaElement ||
      inputElement instanceof HTMLInputElement
    ) {
      // 用原生 setter，确保 React 受控组件能感知变化
      const proto =
        inputElement instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(inputElement, text);
      else inputElement.value = text;
      inputElement.dispatchEvent(new Event("input", { bubbles: true }));
      inputElement.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    inputElement.focus();

    // 用 Range 选中整个编辑器内容（比 execCommand("selectAll") 更可靠）
    try {
      const range = document.createRange();
      range.selectNodeContents(inputElement);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    } catch (error: unknown) {
      reportRecoverableError("select composer text", error);
      try {
        document.execCommand("selectAll");
      } catch (fallbackError: unknown) {
        reportRecoverableError("select composer text fallback", fallbackError);
      }
    }

    const singleContainer = `<div style="white-space:pre-wrap;">${escapeHtml(text)}</div>`;
    let success = false;
    try {
      success = document.execCommand("insertHTML", false, singleContainer);
    } catch (error: unknown) {
      reportRecoverableError("insert composer HTML", error);
    }

    if (!success) {
      inputElement.textContent = text;
    }

    // 派发 input 事件；如果 execCommand 成功，ProseMirror 通常已经派发过，
    // 这里补派一次保证 React 侧同步（幂等）。
    inputElement.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        composed: true,
        inputType: "insertFromPaste",
        data: text,
      }),
    );
    inputElement.dispatchEvent(new Event("change", { bubbles: true }));
  }
  return {
    getChatInput,
    findSendControl,
    triggerSendButton,
    fallbackKeyboardSubmit,
    isSendLikeButton,
    getInputContainer,
    getComposerVisualBounds,
    insertTextAtomic,
  };
}
