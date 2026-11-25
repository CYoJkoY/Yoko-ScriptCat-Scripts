import type { PlatformDefinition } from "../config";
import type { EngineState } from "../state";
import type { ComposerUtils } from "./composer";
import { reportRecoverableError } from "./diagnostics";

export interface SendInterceptDeps {
  currentPlatform: PlatformDefinition;
  composer: ComposerUtils;
  state: EngineState;
  isEngineDormant: () => boolean;
  fuseAndSubmit: (inputElement: HTMLElement) => boolean;
  resumeObservers: () => void;
  hasActiveFiles: () => boolean;
  isSubmitting: () => boolean;
  setSubmitting: (value: boolean) => void;
}

export interface SendInterceptUtils {
  sendWithRetry(
    inputElement: HTMLElement,
    onComplete: (status: boolean) => void,
  ): void;
  handleSendIntercept(event: KeyboardEvent | MouseEvent): void;
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
    isSubmitting,
    setSubmitting,
  } = deps;

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
   * site's soft newline. IMEs report a composing Enter as `keyCode 229`, and
   * that Enter confirms a candidate, so it must never be swallowed.
   */
  function isEnterKey(event: KeyboardEvent): boolean {
    if (event.key !== "Enter") return false;
    if (event.shiftKey) return false;
    if (event.isComposing) return false;
    return event.keyCode !== 229;
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

  function handleSendIntercept(event: KeyboardEvent | MouseEvent): void {
    if (isEngineDormant()) return;

    // Guarding here also keeps the synthetic Enter that `fallbackKeyboardSubmit`
    // dispatches from looping back into this handler mid-send.
    if (isSubmitting()) return;

    if (event instanceof KeyboardEvent && event.type === "keydown") {
      if (!isEnterKey(event)) return;

      const input = composer.getChatInput();
      const eventTarget = event.target;
      if (
        !input ||
        !(eventTarget instanceof Node) ||
        (eventTarget !== input && !input.contains(eventTarget))
      ) {
        return;
      }

      const hasFiles = state.virtualFileEnabled && hasActiveFiles();
      const enterToSend = currentPlatform.enterToSend === true;
      // Without pending files only `enterToSend` platforms take the key.
      if (!hasFiles && !enterToSend) return;
      // For the opt-in site, a modified Enter belongs to the site or browser.
      // Pending virtual files keep the legacy behaviour on every platform.
      if (
        enterToSend &&
        !hasFiles &&
        (event.ctrlKey || event.altKey || event.metaKey)
      ) {
        return;
      }
      // Nothing to send on a bare Enter into an empty composer: let the site
      // keep the key so its own cursor behaviour stays intact.
      if (!hasFiles && !hasComposerText(input)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setSubmitting(true);
      fuseAndSubmit(input);
      sendWithRetry(input, () => {
        setSubmitting(false);
      });
      return;
    }

    if (event.type === "click") {
      if (!state.virtualFileEnabled || !hasActiveFiles()) return;

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

  return { sendWithRetry, handleSendIntercept };
}
