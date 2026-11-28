import type { PlatformDefinition } from "../config";
import type { EngineState } from "../state";
import type { ComposerUtils } from "./composer";
import {
  DECLARED_CONTROL_MAX_DEPTH,
  declaredSendControlDepth,
} from "./composer";
import { reportRecoverableError } from "./diagnostics";
import { HUD_ID } from "../config";

export interface SendInterceptDeps {
  currentPlatform: PlatformDefinition;
  composer: ComposerUtils;
  state: EngineState;
  isEngineDormant: () => boolean;
  fuseAndSubmit: (inputElement: HTMLElement) => boolean;
  resumeObservers: () => void;
  hasActiveFiles: () => boolean;
  hasConversionOffer: () => boolean;
  dismissConversionOffer: () => void;
  isSubmitting: () => boolean;
  setSubmitting: (value: boolean) => void;
}

export interface SendInterceptUtils {
  sendWithRetry(
    inputElement: HTMLElement,
    onComplete: (status: boolean) => void,
  ): void;
  handleSendIntercept(event: KeyboardEvent | MouseEvent | InputEvent): void;
  bindCompositionTracking(target: Window): void;
}

/**
 * Windows Chrome reports the keydown that follows an IME commit with
 * `keyCode 229` even though the composition has already finished, so the raw
 * key code cannot decide whether Enter belongs to the input method. Track
 * composition directly instead and keep a short grace window for the events
 * that arrive out of order around `compositionend`.
 */
const IME_SETTLE_MS = 30;

function isNodeLike(value: unknown): value is Node {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Node).nodeType === "number"
  );
}

export function createSendInterceptUtils(
  deps: SendInterceptDeps,
): SendInterceptUtils {
  const {
    currentPlatform,
    composer,
    state,
    isEngineDormant,
    fuseAndSubmit,
    resumeObservers,
    hasActiveFiles,
    hasConversionOffer,
    dismissConversionOffer,
    isSubmitting,
    setSubmitting,
  } = deps;

  let composing = false;
  let composeSettleTimer = 0;

  function bindCompositionTracking(target: Window): void {
    target.addEventListener(
      "compositionstart",
      () => {
        window.clearTimeout(composeSettleTimer);
        composing = true;
      },
      true,
    );
    target.addEventListener(
      "compositionend",
      () => {
        window.clearTimeout(composeSettleTimer);
        composeSettleTimer = window.setTimeout(() => {
          composing = false;
        }, IME_SETTLE_MS);
      },
      true,
    );
  }

  function cleanupAndResume(
    onComplete: (status: boolean) => void,
    status: boolean,
  ): void {
    window.setTimeout(() => {
      if (isEngineDormant()) {
        onComplete(status);
        return;
      }
      resumeObservers();
      onComplete(status);
    }, 280);
  }

  function hasComposerText(input: HTMLElement): boolean {
    if (
      input instanceof HTMLTextAreaElement ||
      input instanceof HTMLInputElement
    ) {
      return input.value.trim().length > 0;
    }
    const visible = typeof input.innerText === "string" ? input.innerText : "";
    // jsdom leaves `innerText` empty, so fall back to `textContent` when the
    // rendered text carries nothing.
    const raw = visible.trim().length > 0 ? visible : (input.textContent ?? "");
    return (raw ?? "")
      .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
      .trim().length > 0;
  }

  /**
   * An Enter that is safe to treat as a send intent at all. Shift keeps the
   * site's soft newline. While an input method is composing, Enter confirms a
   * candidate and must never be swallowed, but a finished composition still
   * reports `keyCode 229` on Windows, so the key code is not consulted: the
   * physical key plus the live composition state decide.
   */
  function isEnterKey(event: KeyboardEvent): boolean {
    if (event.shiftKey) return false;
    const stroke =
      event.key === "Enter" ||
      event.code === "Enter" ||
      event.code === "NumpadEnter";
    if (!stroke) return false;
    if (event.isComposing) return false;
    return !composing;
  }

  function isEditableTarget(node: HTMLElement): boolean {
    if (node instanceof HTMLTextAreaElement) return true;
    if (node instanceof HTMLInputElement) {
      return (
        node.type === "text" || node.type === "search" || node.type === "url"
      );
    }
    const editable = node.getAttribute("contenteditable");
    // Some hosts expose the editable flag as a property without reflecting it
    // into the attribute (jsdom among them), so both forms count.
    return (
      editable === "true" ||
      editable === "" ||
      node.contentEditable === "true"
    );
  }

  /**
   * True when a control declared as this platform's send button lives in the
   * editable's neighbourhood. That keeps the send intent tied to a real
   * composer instead of any stray editable (a rename box, a search field).
   */
  function ownsSendControl(element: HTMLElement): boolean {
    const selectors = currentPlatform.sendButtonSelectors || [];
    if (!selectors.length) return true;
    return (
      declaredSendControlDepth(element, selectors) <=
      DECLARED_CONTROL_MAX_DEPTH
    );
  }

  /**
   * Resolve the composer from the event itself. Selector guessing can pick a
   * different editable on a page that renders more than one (Yuanbao keeps a
   * Quill editor per panel), and the element that owns the keystroke is the
   * one the user typed into.
   */
  function resolveComposerInput(event: Event): HTMLElement | null {
    const path =
      typeof event.composedPath === "function" ? event.composedPath() : [];
    for (const node of path) {
      if (!(node instanceof HTMLElement) || !node.isConnected) continue;
      if (node.closest(`#${HUD_ID}`)) continue;
      if (node.getAttribute("aria-hidden") === "true") continue;
      if (!isEditableTarget(node)) continue;
      if (node !== composer.getChatInput() && !ownsSendControl(node)) continue;
      return node;
    }
    return composer.getChatInput();
  }

  function isEventInside(input: HTMLElement, event: Event): boolean {
    const eventTarget = event.target;
    if (!isNodeLike(eventTarget)) return false;
    return eventTarget === input || input.contains(eventTarget);
  }

  function consumeEnter(input: HTMLElement, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
    setSubmitting(true);
    fuseAndSubmit(input);
    sendWithRetry(input, () => {
      setSubmitting(false);
    });
  }

  function sendWithRetry(
    inputElement: HTMLElement,
    onComplete: (status: boolean) => void,
  ): void {
    let attempts = 0;
    const maxAttempts = 40; // 50ms * 40 ≈ 2000ms
    let forcedSubmitTried = false;

    const timer = setInterval(() => {
      attempts++;

      if (isEngineDormant()) {
        clearInterval(timer);
        setSubmitting(false);
        cleanupAndResume(onComplete, false);
        return;
      }

      // 第一轮：只接受可用的发送按钮
      const sendBtn = composer.findSendControl(inputElement);
      if (sendBtn) {
        clearInterval(timer);
        composer.triggerSendButton(sendBtn);
        cleanupAndResume(onComplete, true);
        return;
      }

      // 约 800ms 后：允许 disabled 按钮，尝试强行点击
      if (attempts >= 16 && !forcedSubmitTried) {
        const disabledBtn = composer.findSendControl(inputElement, {
          allowDisabled: true,
        });
        if (disabledBtn) {
          forcedSubmitTried = true;
          clearInterval(timer);
          try {
            disabledBtn.removeAttribute("disabled");
            disabledBtn.setAttribute("aria-disabled", "false");
          } catch (error: unknown) {
            reportRecoverableError("re-enable send control", error);
          }
          composer.triggerSendButton(disabledBtn);
          cleanupAndResume(onComplete, true);
          return;
        }
      }

      // 最终兜底
      if (attempts >= maxAttempts) {
        clearInterval(timer);
        composer.fallbackKeyboardSubmit(inputElement);
        cleanupAndResume(onComplete, false);
      }
    }, 50);
  }

  function handleSendIntercept(
    event: KeyboardEvent | MouseEvent | InputEvent,
  ): void {
    if (isEngineDormant()) return;

    // Guarding here also keeps the synthetic Enter that `fallbackKeyboardSubmit`
    // dispatches from looping back into this handler mid-send.
    if (isSubmitting()) return;

    if (event.type === "keydown") {
      const keyEvent = event as KeyboardEvent;
      if (!isEnterKey(keyEvent)) return;

      const input = resolveComposerInput(event);
      if (!input || !isEventInside(input, event)) return;

      const hasFiles = state.virtualFileEnabled && hasActiveFiles();
      const enterToSend = currentPlatform.enterToSend === true;
      // Without pending files only `enterToSend` platforms take the key.
      if (!hasFiles && !enterToSend) return;
      // For the opt-in site, a modified Enter belongs to the site or browser.
      // Pending virtual files keep the legacy behaviour on every platform.
      if (
        enterToSend &&
        !hasFiles &&
        (keyEvent.ctrlKey || keyEvent.altKey || keyEvent.metaKey)
      ) {
        return;
      }
      // Nothing to send on a bare Enter into an empty composer: let the site
      // keep the key so its own cursor behaviour stays intact.
      if (!hasFiles && !hasComposerText(input)) return;

      consumeEnter(input, event);
      return;
    }

    // Second net: a paragraph break that reached the editable means some
    // keystroke path bypassed the keydown handler (another capture listener
    // consuming the event, an input-method commit, a synthetic insert). The
    // opt-in platform still promised Enter sends, so stop the newline here.
    if (event.type === "beforeinput") {
      const inputEvent = event as InputEvent;
      if (inputEvent.inputType !== "insertParagraph") return;
      if (currentPlatform.enterToSend !== true) return;
      if (composing) return;

      const input = resolveComposerInput(event);
      if (!input || !isEventInside(input, event)) return;
      if (!hasComposerText(input)) return;

      consumeEnter(input, event);
      return;
    }

    if (event.type === "click") {
      if (!state.virtualFileEnabled) return;

      const hasFiles = hasActiveFiles();
      // A prompt-only tray is just an offer to convert the composer text. A
      // send click retires it here: the host clears the composer afterwards
      // and often fires no input event, so nothing else would remove it.
      if (!hasFiles && !hasConversionOffer()) return;

      const eventTarget = event.target;
      if (!(eventTarget instanceof Element)) return;

      // 1) 选择器匹配
      let sendControl: Element | null = null;
      try {
        sendControl = eventTarget.closest(
          (currentPlatform.sendButtonSelectors || []).join(","),
        );
      } catch (error: unknown) {
        reportRecoverableError("resolve clicked send control", error);
      }

      // 2) 兜底：向上 4 层按 aria-label / title / data-testid 识别
      if (!sendControl) {
        let node: Element | null = eventTarget;
        let depth = 0;
        while (node && depth < 4 && node !== document.body) {
          if (
            node instanceof HTMLElement &&
            node.tagName === "BUTTON" &&
            composer.isSendLikeButton(node)
          ) {
            sendControl = node;
            break;
          }
          node = node.parentElement;
          depth++;
        }
      }

      if (!sendControl) return;

      if (!hasFiles) {
        dismissConversionOffer();
        return;
      }

      const input = composer.getChatInput();
      if (!input) return;

      // 用户点击了发送按钮本身就是"发送意图"，
      // 不再强依赖 isSendControlForInput，避免误判导致消息发不出去。
      event.preventDefault();
      event.stopPropagation();
      setSubmitting(true);
      fuseAndSubmit(input);
      sendWithRetry(input, () => {
        setSubmitting(false);
      });
    }
  }

  return { sendWithRetry, handleSendIntercept, bindCompositionTracking };
}
