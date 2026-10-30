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
    if (!state.virtualFileEnabled || !hasActiveFiles() || isSubmitting()) {
      return;
    }

    if (
      event instanceof KeyboardEvent &&
      event.type === "keydown" &&
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.isComposing
    ) {
      const input = composer.getChatInput();
      const eventTarget = event.target;
      if (
        input &&
        eventTarget instanceof Node &&
        (eventTarget === input || input.contains(eventTarget))
      ) {
        event.preventDefault();
        event.stopPropagation();
        setSubmitting(true);
        fuseAndSubmit(input);
        sendWithRetry(input, () => {
          setSubmitting(false);
        });
        return;
      }
    }

    if (event.type === "click") {
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
