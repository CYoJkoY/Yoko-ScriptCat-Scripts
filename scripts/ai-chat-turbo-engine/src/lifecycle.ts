import { readUserscriptInfo } from "../../../shared/userscript/globals";
import { createTurnUtils, type TurnRecord } from "./core/turns";
import {
  createEngineState,
  loadSavedConfig,
  saveCurrentConfig,
  type EngineState,
} from "./state";
import { createCodeBlockUtils } from "./ui/code-blocks";
import { createReasoningUtils } from "./core/reasoning";
import { createToolMemoryUtils } from "./core/tool-memory";
import { createToolPopupScope } from "./core/tool-scope";
import { createComposerUtils } from "./core/composer";
import { createSendInterceptUtils, type SendInterceptUtils } from "./core/send";
import { createHandoffUtils } from "./core/handoff";
import { createHudUtils, type HudUtils } from "./ui/hud";
import { createChatCapsuleUtils } from "./ui/chat-capsules";
import {
  createVirtualFileUtils,
  type VirtualFileUtils,
} from "./ui/virtual-files";
import { injectEngineStyles } from "./ui/styles";
import { matchesReasoningElement } from "./core/text";
import {
  HUD_ID,
  STYLE_ID,
  TURN_MARKER_ATTRIBUTES,
  TURN_SELECTOR_ATTRIBUTES,
  THROTTLE_INTERVAL,
  type PlatformDefinition,
} from "./config";
import {
  detectPlatform,
  isAuthOrRedirectRoute,
  isEngineActive,
  isEngineDormant,
  setEngineActive,
} from "./core/auth";

export function initializeEngine(): void {
  // Read the version from the userscript header so the panel cannot drift.
  const VERSION = readUserscriptInfo(globalThis)?.script.version ?? "0.0.0";

  const detectedPlatform = detectPlatform();
  if (!detectedPlatform) return;
  // Bind the narrowed platform once so closures keep the non-null type.
  const currentPlatform: PlatformDefinition = detectedPlatform;
  const {
    clearRenderedCache,
    extractTurnText,
    filterOutNested,
    getActiveTurnSelectors,
    getTurnRole,
    getTurns,
    invalidateActiveTurnSelectorGroup,
    isGeminiThoughtElement,
    isUserTurn,
  } = createTurnUtils(currentPlatform);

  const state: EngineState = createEngineState();
  const turnIndex = new Map<Element, TurnRecord>();
  // 用户手动恢复过的轮次：即使仍在保留轮次之外也不再脱水，避免阅读被打断
  const restoredTurns = new WeakSet<Element>();
  let isSubmitting = false;

  let observer: MutationObserver | null = null;
  let scheduleTimer: ReturnType<typeof setTimeout> | null = null;
  let lastUpdateTime = 0;
  let fullTurnSyncRequested = true;
  let dirtyTurns = new Set<Element>();
  let previousTurns: Element[] = [];
  let selfMutationDepth = 0;
  let globalListenersBound = false;
  let historyPatched = false;
  let routeWatcherBound = false;
  let viewportListenersBound = false;
  let loadListenerBound = false;

  type ElementTagName = keyof HTMLElementTagNameMap;

  function el<Tag extends ElementTagName = "div">(
    tag: Tag,
    attrs: Readonly<Record<string, string | EventListener>> = {},
    children: readonly (string | Node)[] = [],
  ): HTMLElementTagNameMap[Tag] {
    const elem = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "className") {
        if (typeof value === "string") elem.className = value;
      } else if (key === "style" && typeof value === "string") {
        elem.style.cssText = value;
      } else if (key.startsWith("on") && typeof value === "function") {
        elem.addEventListener(key.slice(2).toLowerCase(), value);
      } else {
        elem.setAttribute(key, String(value));
      }
    }
    for (const child of children) {
      if (typeof child === "string") {
        elem.appendChild(document.createTextNode(child));
      } else if (child instanceof Node) {
        elem.appendChild(child);
      }
    }
    return elem;
  }

  const reasoningStatusNode = el("div", { className: "reasoning-status", role: "status" }, []);
  const toolStatusNode = el("div", { className: "reasoning-status", role: "status" }, []);

  const composer = createComposerUtils({ currentPlatform });

  const codeBlocks = createCodeBlockUtils({
    currentPlatform,
    state,
    el,
    withSelfMutation,
    filterOutNested,
    isGeminiThoughtElement,
    requestUpdate: () => requestUpdate(),
  });

  function withSelfMutation<T>(task: () => T): T {
    selfMutationDepth++;
    try {
      return task();
    } finally {
      selfMutationDepth--;
    }
  }

  const chatCapsules = createChatCapsuleUtils({
    el,
    withSelfMutation,
    state,
    isUserTurn,
  });

  // 从完整消息容器中提取文本；不再只取第一个 Markdown 子节点或截断到 800 字符。
  const toolScope = createToolPopupScope();

  const reasoning = createReasoningUtils({
    el,
    state,
    toolScope,
    withSelfMutation,
    triggerSendButton: (control) => composer.triggerSendButton(control),
    requestUpdate: () => requestUpdate(),
    markRestoredTurn: (turnElement) => restoredTurns.add(turnElement),
    requestFullTurnSync: () => {
      fullTurnSyncRequested = true;
    },
  });

  const toolMemory = createToolMemoryUtils({
    el,
    state,
    triggerSendButton: (control) => composer.triggerSendButton(control),
  });

  const virtualFiles: VirtualFileUtils = createVirtualFileUtils({
    el,
    withSelfMutation,
    composer,
    state,
    isEngineDormant,
    updateHudDashboard: () => hud?.updateHudDashboard(),
    suspendObservers: () => {
      observer?.disconnect();
      codeBlocks.disconnectCodeLayoutObserver();
    },
  });

  const sendIntercept: SendInterceptUtils = createSendInterceptUtils({
    currentPlatform,
    composer,
    state,
    isEngineDormant,
    fuseAndSubmit: (inputElement) => virtualFiles.fuseAndSubmit(inputElement),
    resumeObservers: () => {
      observeDom();
      codeBlocks.observeCodeLayout();
    },
    hasActiveFiles: () => virtualFiles.activeFileCount() > 0,
    isSubmitting: () => isSubmitting,
    setSubmitting: (value) => {
      isSubmitting = value;
    },
  });

  const handoff = createHandoffUtils({
    currentPlatform,
    composer,
    sendIntercept,
    turns: {
      getTurns,
      extractTurnText,
      getTurnRole,
    },
    isSubmitting: () => isSubmitting,
    setSubmitting: (value) => {
      isSubmitting = value;
    },
  });

  let hud: HudUtils | null = null;

  hud = createHudUtils({
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
    requestUpdate: () => requestUpdate(),
    requestFullTurnSync: () => {
      fullTurnSyncRequested = true;
    },
    saveConfig: () => saveCurrentConfig(state),
    activeFileCount: () => virtualFiles.activeFileCount(),
    clearFiles: () => virtualFiles.clearFiles(),
    injectStyles: injectEngineStyles,
  });

  function scheduleTrayPosition(): void {
    virtualFiles.schedulePosition();
  }


  // 读写分离脱水，彻底杜绝 Layout Thrashing
  function syncTurnIndex(forceFull: boolean): void {
    const turns = getTurns();
    const structuralChange =
      forceFull ||
      turns.length !== previousTurns.length ||
      turns.some((turnElement, index) => turnElement !== previousTurns[index]);

    if (forceFull) {
      turnIndex.clear();
    } else if (structuralChange) {
      /*
       * A new turn only appends: keep the text of every surviving turn and
       * re-extract new or dirty ones, so one message costs O(1) not O(n).
       * shortcut: a text edit the observer never reports stays stale, upgrade
       * to a periodic full re-sync if a platform does that.
       */
      const liveTurns = new Set(turns);
      for (const indexedTurn of [...turnIndex.keys()]) {
        if (!liveTurns.has(indexedTurn)) turnIndex.delete(indexedTurn);
      }
    }

    for (const turnElement of turns) {
      chatCapsules.collapseInChatFileBlocks(turnElement);
      const record = turnIndex.get(turnElement);
      if (!record) {
        turnIndex.set(turnElement, {
          id: turnIndex.size,
          element: turnElement,
          text: extractTurnText(turnElement),
        });
      } else if (dirtyTurns.has(turnElement)) {
        record.text = extractTurnText(turnElement);
      }
    }

    for (const turnElement of dirtyTurns) {
      if (!turnIndex.has(turnElement)) {
        fullTurnSyncRequested = true;
      }
    }

    state.totalTurns = turns.length;
    state.indexedTurns = turns.map((turnElement, index) => {
      const record = turnIndex.get(turnElement);
      if (record) {
        record.id = index;
        return record;
      }
      const fallbackRecord: TurnRecord = {
        id: index,
        element: turnElement,
        text: extractTurnText(turnElement),
      };
      turnIndex.set(turnElement, fallbackRecord);
      return fallbackRecord;
    });

    const cutoff = state.pruneEnabled
      ? Math.max(0, turns.length - state.keepTurns)
      : 0;

    const toDehydrate: { elem: HTMLElement; height: number }[] = [];
    const toHydrate: HTMLElement[] = [];

    turns.forEach((turnElement, index) => {
      const shouldDehydrate =
        state.pruneEnabled && index < cutoff && !restoredTurns.has(turnElement);
      const isDehydrated = turnElement.classList.contains(
        "ai-turbo-dehydrated",
      );

      if (shouldDehydrate && !isDehydrated && turnElement instanceof HTMLElement) {
        toDehydrate.push({
          elem: turnElement,
          height: turnElement.offsetHeight || 120,
        });
      } else if (
        !shouldDehydrate &&
        isDehydrated &&
        turnElement instanceof HTMLElement
      ) {
        toHydrate.push(turnElement);
      }
    });

    withSelfMutation(() => {
      for (let i = 0; i < toDehydrate.length; i++) {
        const item = toDehydrate[i];
        item.elem.style.setProperty("--turbo-cached-h", `${item.height}px`);
        item.elem.classList.add("ai-turbo-dehydrated");
      }
      for (let i = 0; i < toHydrate.length; i++) {
        toHydrate[i].classList.remove("ai-turbo-dehydrated");
        toHydrate[i].style.removeProperty("--turbo-cached-h");
      }
    });

    state.hiddenCount = turns.reduce(
      (count, turnElement) =>
        count + Number(turnElement.classList.contains("ai-turbo-dehydrated")),
      0,
    );
    previousTurns = turns;
    dirtyTurns.clear();
    fullTurnSyncRequested = false;
  }

  function findIndexedTurnAncestor(mutationNode: Node): Element | null {
    let ancestor =
      mutationNode instanceof Element
        ? mutationNode
        : mutationNode.parentElement;

    while (ancestor) {
      if (turnIndex.has(ancestor)) return ancestor;
      ancestor = ancestor.parentElement;
    }

    return null;
  }

  function collectMutationTargets(records: MutationRecord[]): boolean {
    const turnSelector = getActiveTurnSelectors().join(",");
    const allTurnSelectors = [
      ...(currentPlatform.turnSelectors || []),
      ...(currentPlatform.turnSelectorGroups || []).flat(),
    ];
    const allTurnSelector = [...new Set(allTurnSelectors)].join(",");
    const turnMarkerSelector = [
      '[data-testid^="conversation-turn-"]',
      "[data-turn]",
      "[data-turn-key]",
      "[data-message-author-role]",
      "[data-message-role]",
      "[data-conversation-role]",
      "[data-role]",
      '[data-content-search-unit-key$=":user"]',
      '[data-content-search-unit-key$=":assistant"]',
      '[data-thread-find-target="conversation"]',
      "ol[data-conversation-transcript]",
      '[data-user-message-bubble="true"]',
      "[data-chatgpt-agent-turn-start]",
    ].join(",");
    const anyTurnSelector = `${allTurnSelector},${turnMarkerSelector}`;
    const codeSelectors = currentPlatform.codeSelectors || ["pre"];
    let structuralChange = false;
    let shouldRequestUpdate = false;

    for (const mutationRecord of records) {
        const mutationTarget = mutationRecord.target;

      if (
        mutationTarget instanceof Element &&
        mutationTarget.closest(
          `#${HUD_ID}, .ai-turbo-code-bar, #ai-turbo-vf-tray, .ai-turbo-chat-capsule, #ai-turbo-vf-preview-modal`,
        )
      ) {
        continue;
      }

      if (mutationRecord.type === "attributes") {
        const attributeName = mutationRecord.attributeName || "";
        if (!(mutationTarget instanceof Element)) continue;

        const isSelectorAttribute =
          attributeName === "class" || attributeName === "id";
        const isMarkerAttribute = TURN_MARKER_ATTRIBUTES.has(attributeName);
        const isIndexedTurn = turnIndex.has(mutationTarget);
        const matchesKnownTurn =
          isIndexedTurn ||
          (Boolean(allTurnSelector) &&
            (mutationTarget.matches(allTurnSelector) ||
              mutationTarget.matches(turnMarkerSelector) ||
              mutationTarget.matches('[data-testid^="conversation-turn-"]')));

        // Preserve the existing refresh behaviour for marker attributes.
        // Ignore unrelated class/id changes to avoid redundant full syncs.
        if (isMarkerAttribute) shouldRequestUpdate = true;

        if (matchesKnownTurn && (isMarkerAttribute || isSelectorAttribute)) {
          invalidateActiveTurnSelectorGroup();
          structuralChange = true;
          shouldRequestUpdate = true;
        }
        continue;
      }

      shouldRequestUpdate = true;
      const indexedTurn = findIndexedTurnAncestor(mutationTarget);
      const possibleTurn =
        indexedTurn ||
        (mutationTarget instanceof Element
          ? mutationTarget.closest(turnSelector)
          : mutationTarget.parentElement?.closest(turnSelector));

      if (
        possibleTurn instanceof Element &&
        !isGeminiThoughtElement(possibleTurn) &&
        !matchesReasoningElement(possibleTurn)
      ) {
        dirtyTurns.add(possibleTurn);
      }

      let possibleCode: HTMLElement | null = null;

      if (mutationTarget instanceof Element) {
        for (const selector of codeSelectors) {
          const candidate = mutationTarget.matches(selector)
            ? mutationTarget
            : mutationTarget.closest(selector);
          if (candidate instanceof HTMLElement) {
            possibleCode = codeBlocks.normalizeCodeElement(candidate);
            break;
          }
        }
      }

      if (possibleCode instanceof HTMLElement) {
        codeBlocks.markCodeBlockDirty(possibleCode);
      }

      if (mutationRecord.type !== "childList") continue;

      for (const changedNode of [
        ...mutationRecord.addedNodes,
        ...mutationRecord.removedNodes,
      ]) {
        if (!(changedNode instanceof Element)) continue;

        if (
          changedNode.matches(anyTurnSelector) ||
          changedNode.querySelector(anyTurnSelector)
        ) {
          structuralChange = true;
        }

        for (const selector of codeSelectors) {
          if (changedNode.matches(selector)) {
            const elNorm = codeBlocks.normalizeCodeElement(changedNode);
            if (elNorm instanceof HTMLElement) {
              codeBlocks.markCodeBlockDirty(elNorm);
            }
          }
          changedNode.querySelectorAll(selector).forEach((c) => {
            const elNorm = codeBlocks.normalizeCodeElement(c);
            if (elNorm instanceof HTMLElement) {
              codeBlocks.markCodeBlockDirty(elNorm);
            }
          });
        }
      }
    }

    if (structuralChange) {
      invalidateActiveTurnSelectorGroup();
      fullTurnSyncRequested = true;
      codeBlocks.requestCodeScan();
    }

    return shouldRequestUpdate || structuralChange;
  }

  function runScheduledUpdate(): void {
    scheduleTimer = null;
    lastUpdateTime = performance.now();
    clearRenderedCache();

    if (isEngineDormant()) return;

    if (selfMutationDepth > 0) {
      requestUpdate();
      return;
    }

    const currentTurnSet = new Set(previousTurns);
    for (const dirtyTurn of dirtyTurns) {
      if (!(dirtyTurn instanceof Element) || !currentTurnSet.has(dirtyTurn)) {
        fullTurnSyncRequested = true;
      }
    }

    syncTurnIndex(fullTurnSyncRequested);
    codeBlocks.flushCodeBlockScan();
    toolMemory.maybeRestore();
    hud?.updateHudDashboard();
    hud?.ensureHUDMounted();
    if (virtualFiles.isTrayDirty()) virtualFiles.renderVirtualFileTray();
  }

  function requestUpdate(): void {
    if (scheduleTimer) return;
    const elapsed = performance.now() - lastUpdateTime;
    if (elapsed >= THROTTLE_INTERVAL) {
      scheduleTimer = window.requestAnimationFrame(runScheduledUpdate);
    } else {
      scheduleTimer = window.setTimeout(() => {
        scheduleTimer = window.requestAnimationFrame(runScheduledUpdate);
      }, THROTTLE_INTERVAL - elapsed);
    }
  }

  function observeDom(): void {
    const observeRoot = document.documentElement || document.body;
    if (!observeRoot) return;

    observer?.disconnect();
    observer = new MutationObserver((records) => {
      if (selfMutationDepth > 0) return;
      if (collectMutationTargets(records)) requestUpdate();
    });

    observer.observe(observeRoot, {
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: Array.from(TURN_SELECTOR_ATTRIBUTES),
      subtree: true,
    });
  }

  function patchHistoryForSpaNavigation(): void {
    if (historyPatched) return;
    historyPatched = true;
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      const result = originalPushState.apply(this, args);
      window.setTimeout(() => {
        if (syncEngineActivation()) return;
        invalidateActiveTurnSelectorGroup();
        fullTurnSyncRequested = true;
        codeBlocks.requestCodeScan();
        requestUpdate();
        reasoning.scheduleReasoningRestore();
        toolMemory.scheduleRestore();
      }, 0);
      return result;
    };

    history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args);
      window.setTimeout(() => {
        if (syncEngineActivation()) return;
        invalidateActiveTurnSelectorGroup();
        fullTurnSyncRequested = true;
        codeBlocks.requestCodeScan();
        requestUpdate();
      }, 0);
      return result;
    };

    window.addEventListener("popstate", () => {
      if (syncEngineActivation()) return;
      invalidateActiveTurnSelectorGroup();
      fullTurnSyncRequested = true;
      codeBlocks.requestCodeScan();
      requestUpdate();
      reasoning.scheduleReasoningRestore();
      toolMemory.scheduleRestore();
    });
  }

  /** Remove every engine artifact and inline style from the host page. */
  function teardownEngine(): void {
    reasoning.attachStatusNode(null);
    toolMemory.teardown();
    setEngineActive(false);
    reasoning.clearReasoningRestoreTimer();
    handoff.clearResumeTimer();
    hud?.teardown();
    hud = null;

    observer?.disconnect();
    codeBlocks.disconnectCodeLayoutObserver();
    if (scheduleTimer) {
      window.cancelAnimationFrame(scheduleTimer);
      window.clearTimeout(scheduleTimer);
      scheduleTimer = null;
    }
    virtualFiles.stopSyncLoop();

    codeBlocks.unmountAllCodeControls();

    withSelfMutation(() => {
      document
        .querySelectorAll(".ai-turbo-chat-capsule, .ai-turbo-chat-user-prompt")
        .forEach((node) => node.remove());
      document
        .querySelectorAll(".ai-turbo-chat-folded-target")
        .forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          node.classList.remove("ai-turbo-chat-folded-target");
          node.style.removeProperty("display");
          node.style.removeProperty("max-height");
          node.style.removeProperty("overflow");
          node.style.removeProperty("contain");
        });
      document
        .querySelectorAll(".ai-turbo-dehydrated")
        .forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          node.classList.remove("ai-turbo-dehydrated");
          node.style.removeProperty("--turbo-cached-h");
        });
    });

    document.getElementById(HUD_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById("ai-turbo-vf-tray")?.remove();
    document.getElementById("ai-turbo-vf-preview-modal")?.remove();

    handoff.attachStatusNode(null);
  }

  /**
   * Align engine state with the current route.
   * Returns true on an auth or redirect route so callers stop page work.
   */
  function syncEngineActivation(): boolean {
    if (isAuthOrRedirectRoute()) {
      if (isEngineActive()) teardownEngine();
      return true;
    }
    if (!isEngineActive()) boot();
    return false;
  }

  function bindGlobalListeners(): void {
    if (globalListenersBound) return;
    globalListenersBound = true;
    window.addEventListener(
      "keydown",
      (event) => {
        if (isEngineDormant()) return;
        if (event.key === "Escape") {
          const previewModal = document.getElementById(
            "ai-turbo-vf-preview-modal",
          );
          if (previewModal) {
            event.preventDefault();
            event.stopPropagation();
            previewModal.remove();
            return;
          }
          if (state.hudOpen) {
            event.preventDefault();
            event.stopPropagation();
            hud?.togglePanel(false);
            return;
          }
        }

        if (
          event.altKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          (event.code === "KeyT" ||
            event.key.toLowerCase() === "t" ||
            event.key === "†")
        ) {
          event.preventDefault();
          event.stopPropagation();
          hud?.togglePanel();
        }
      },
      true,
    );

    window.addEventListener(
      "paste",
      (event) => virtualFiles.handlePasteIntercept(event),
      true,
    );
    window.addEventListener(
      "keydown",
      (event) => sendIntercept.handleSendIntercept(event),
      true,
    );
    window.addEventListener(
      "click",
      (event) => sendIntercept.handleSendIntercept(event),
      true,
    );
    window.addEventListener("click", reasoning.handleReasoningClick, true);
    window.addEventListener("click", toolMemory.handleToolClick, true);
    window.addEventListener("click", reasoning.handleDehydratedClick, true);
  }

  function boot(): void {
    if (isEngineActive()) return;
    // Account switching passes through login and callback routes. Booting the
    // HUD, listeners, and polling there competes with the auth flow and can
    // leave the engine UI on a redirect stub that has no site styles yet.
    if (isAuthOrRedirectRoute()) return;
    setEngineActive(true);

    loadSavedConfig(state);
    injectEngineStyles();
    hud?.buildHUD();
    codeBlocks.observeCodeLayout();
    observeDom();
    patchHistoryForSpaNavigation();
    bindGlobalListeners();
    reasoning.scheduleReasoningRestore();
    reasoning.renderReasoningStatus();
    toolMemory.scheduleRestore();
    toolMemory.renderStatus();

    if (!viewportListenersBound) {
      viewportListenersBound = true;
      window.addEventListener("resize", scheduleTrayPosition, {
        passive: true,
      });

      window.addEventListener("scroll", scheduleTrayPosition, {
        passive: true,
        capture: true,
      });

      window.visualViewport?.addEventListener(
        "resize",
        scheduleTrayPosition,
      );

      window.visualViewport?.addEventListener(
        "scroll",
        scheduleTrayPosition,
      );
    }

    fullTurnSyncRequested = true;
    codeBlocks.requestCodeScan();
    requestUpdate();

    handoff.resumePendingHandoffPrompt();

    if (!loadListenerBound) {
      loadListenerBound = true;
      window.addEventListener("load", () => {
        if (isEngineDormant()) return;
        fullTurnSyncRequested = true;
        codeBlocks.requestCodeScan();
        hud?.ensureHUDMounted();
        requestUpdate();
      });
    }

    [250, 800, 2000].forEach((delay) => {
      window.setTimeout(() => {
        if (isEngineDormant()) return;
        hud?.ensureHUDMounted();
        requestUpdate();
      }, delay);
    });
  }

  /**
   * On login and callback routes keep only a route check: no UI, no DOM
   * writes, and start the engine once the page returns to a chat route.
   */
  function watchForChatRoute(): void {
    patchHistoryForSpaNavigation();
    if (routeWatcherBound) return;
    routeWatcherBound = true;
    const resumeWhenChatRoute = () => {
      if (isAuthOrRedirectRoute()) return;
      boot();
    };
    window.addEventListener("popstate", resumeWhenChatRoute);
    window.addEventListener("hashchange", resumeWhenChatRoute);
  }

  function startEngine() {
    if (isAuthOrRedirectRoute()) {
      watchForChatRoute();
      return;
    }
    boot();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startEngine, { once: true });
  } else {
    startEngine();
  }
}
