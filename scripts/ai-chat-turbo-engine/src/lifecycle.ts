import { readUserscriptInfo } from "../../../shared/userscript/globals";
import { createTurnUtils } from "./core/turns";
import { createTurnTextIndex } from "./core/turn-index";
import { classifyMutations } from "./core/mutation-classify";
import {
  createEngineState,
  loadSavedConfig,
  saveCurrentConfig,
  type EngineState,
} from "./state";
import { createCodeBlockUtils } from "./ui/code-blocks";
import { createReasoningUtils } from "./core/reasoning";
import { createToolMemoryUtils } from "./core/tool-memory";
import { createRestoreCoordinator } from "./core/restore-coordination";
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
import {
  CODE_SCAN_INTERVAL,
  HUD_ID,
  STYLE_ID,
  TEXT_INDEX_FRAME_BUDGET,
  TEXT_INDEX_INTERVAL,
  TURN_MARKER_ATTRIBUTES,
  THROTTLE_INTERVAL,
  TURN_DISCOVERY_RETRY_INTERVAL,
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
  const turnTextIndex = createTurnTextIndex({ extract: extractTurnText });
  // 用户手动恢复过的轮次：即使仍在保留轮次之外也不再脱水，避免阅读被打断
  const restoredTurns = new Set<Element>();
  // 由引擎施加过脱水的轮次；恢复（含点击）时据此补扫该轮的代码块
  const dehydratedTurns = new Set<Element>();
  let isSubmitting = false;

  let observer: MutationObserver | null = null;
  let scheduleTimer: ReturnType<typeof setTimeout> | null = null;
  let textIndexTimer: ReturnType<typeof setTimeout> | null = null;
  let textIndexFrame: number | null = null;
  let codeScanTimer: ReturnType<typeof setTimeout> | null = null;
  let turnDiscoveryTimer: ReturnType<typeof setInterval> | null = null;
  let lastUpdateTime = 0;
  let lastCodeScanTime = 0;
  let fullTurnSyncRequested = true;
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
  const restoreCoordinator = createRestoreCoordinator();

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
    restoreCoordinator,
  });

  const toolMemory = createToolMemoryUtils({
    el,
    state,
    triggerSendButton: (control) => composer.triggerSendButton(control),
    restoreCoordinator,
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
    flushTextIndex,
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
    markRestoredTurn: (turnElement) => restoredTurns.add(turnElement),
    flushTextIndex: () => flushTextIndex({ force: true }),
    activeFileCount: () => virtualFiles.activeFileCount(),
    clearFiles: () => virtualFiles.clearFiles(),
    injectStyles: injectEngineStyles,
  });

  function scheduleTrayPosition(): void {
    virtualFiles.schedulePosition();
  }


  const IGNORED_MUTATION_TARGET_SELECTOR =
    "#" +
    HUD_ID +
    ", .ai-turbo-code-bar, #ai-turbo-vf-tray, .ai-turbo-chat-capsule, #ai-turbo-vf-preview-modal";

  function isIgnoredMutationTarget(target: Element): boolean {
    return Boolean(target.closest(IGNORED_MUTATION_TARGET_SELECTOR));
  }

  /**
   * Align the text index and turn counters with the current DOM without
   * extracting text. Extraction runs on the frame-budgeted queue below, so
   * this stays cheap enough to run on every structural sync.
   */
  function reconcileTurnIndex(): Element[] {
    const turns = getTurns();
    const liveTurns = new Set(turns);

    for (const restoredTurn of restoredTurns) {
      if (!liveTurns.has(restoredTurn)) restoredTurns.delete(restoredTurn);
    }
    for (const dehydratedTurn of dehydratedTurns) {
      if (!liveTurns.has(dehydratedTurn)) dehydratedTurns.delete(dehydratedTurn);
    }

    const addedTurns = turns.filter((turn) => !turnTextIndex.hasTurn(turn));
    turnTextIndex.reconcile(turns);

    for (const turnElement of addedTurns) {
      chatCapsules.collapseInChatFileBlocks(turnElement);
    }

    state.totalTurns = turns.length;
    state.indexedTurns = turnTextIndex.getRecords();
    return turns;
  }

  // 读写分离脱水：只读新脱水轮次的高度，再统一写入类名与缓存变量
  function syncTurnIndex(): void {
    const turns = reconcileTurnIndex();
    const cutoff = state.pruneEnabled
      ? Math.max(0, turns.length - state.keepTurns)
      : 0;

    const toDehydrate: HTMLElement[] = [];
    const toHydrate: HTMLElement[] = [];

    turns.forEach((turnElement, index) => {
      const shouldDehydrate =
        state.pruneEnabled && index < cutoff && !restoredTurns.has(turnElement);
      const isDehydrated = turnElement.classList.contains(
        "ai-turbo-dehydrated",
      );

      if (shouldDehydrate && !isDehydrated) {
        if (turnElement instanceof HTMLElement) toDehydrate.push(turnElement);
        return;
      }

      /* Manual restores remove the class outside this pass; notice them too. */
      const leftDehydration =
        !isDehydrated && dehydratedTurns.has(turnElement);
      if ((!shouldDehydrate && isDehydrated) || leftDehydration) {
        if (turnElement instanceof HTMLElement) toHydrate.push(turnElement);
      }
    });

    const heights = toDehydrate.map(
      (turnElement) => turnElement.offsetHeight || 120,
    );

    withSelfMutation(() => {
      for (let index = 0; index < toDehydrate.length; index++) {
        toDehydrate[index].style.setProperty(
          "--turbo-cached-h",
          String(heights[index]) + "px",
        );
        toDehydrate[index].classList.add("ai-turbo-dehydrated");
      }
      for (const turnElement of toHydrate) {
        turnElement.classList.remove("ai-turbo-dehydrated");
        turnElement.style.removeProperty("--turbo-cached-h");
      }
    });

    for (const turnElement of toDehydrate) {
      dehydratedTurns.add(turnElement);
      codeBlocks.suspendTurnCodeBlocks(turnElement);
    }
    for (const turnElement of toHydrate) {
      dehydratedTurns.delete(turnElement);
      codeBlocks.requestCodeScanForTurn(turnElement);
    }

    state.hiddenCount = turns.reduce(
      (count, turnElement) =>
        count + Number(turnElement.classList.contains("ai-turbo-dehydrated")),
      0,
    );

    if (turnTextIndex.pendingCount() > 0) requestTextIndexSoon();
  }

  function findIndexedTurnAncestor(mutationNode: Node): Element | null {
    let ancestor =
      mutationNode instanceof Element
        ? mutationNode
        : mutationNode.parentElement;

    while (ancestor) {
      if (turnTextIndex.hasTurn(ancestor)) return ancestor;
      ancestor = ancestor.parentElement;
    }

    return null;
  }

  /**
   * Run one incremental extraction slice. The time budget keeps a long
   * conversation from blocking paint; the rest continues next frame.
   */
  function runTextIndexFrame(): void {
    if (isEngineDormant()) return;
    const remaining = turnTextIndex.flush({
      budgetMs: TEXT_INDEX_FRAME_BUDGET,
    });
    if (remaining > 0) {
      textIndexFrame = window.requestAnimationFrame(() => {
        textIndexFrame = null;
        runTextIndexFrame();
      });
      return;
    }
    hud?.updateHudDashboard();
  }

  /** Wait out the streaming burst, then extract changed turns incrementally. */
  function requestTextIndexSoon(): void {
    if (textIndexTimer !== null || textIndexFrame !== null) return;
    textIndexTimer = window.setTimeout(() => {
      textIndexTimer = null;
      runTextIndexFrame();
    }, TEXT_INDEX_INTERVAL);
  }

  /**
   * Drain the text queue for search and handoff. A non-forced call performs
   * one bounded slice and reports what is left for the caller to retry.
   */
  function flushTextIndex(options: { force?: boolean } = {}): number {
    if (isEngineDormant()) return 0;
    reconcileTurnIndex();

    if (options.force === true) {
      const remaining = turnTextIndex.flush();
      hud?.updateHudDashboard();
      return remaining;
    }

    const remaining = turnTextIndex.flush({
      budgetMs: TEXT_INDEX_FRAME_BUDGET,
    });
    if (remaining > 0 && textIndexTimer === null && textIndexFrame === null) {
      textIndexFrame = window.requestAnimationFrame(() => {
        textIndexFrame = null;
        runTextIndexFrame();
      });
    }
    hud?.updateHudDashboard();
    return remaining;
  }

  /** Throttle code measurement so streaming text does not rescan per token. */
  function scheduleCodeScan(): void {
    if (codeScanTimer !== null) return;
    const elapsed = performance.now() - lastCodeScanTime;
    codeScanTimer = window.setTimeout(() => {
      codeScanTimer = null;
      if (isEngineDormant()) return;
      lastCodeScanTime = performance.now();
      codeBlocks.flushCodeBlockScan();
      hud?.updateHudDashboard();
      if (codeBlocks.isCodeScanPending()) scheduleCodeScan();
    }, Math.max(0, CODE_SCAN_INTERVAL - elapsed));
  }

  function handleMutationRecords(records: MutationRecord[]): void {
    const classification = classifyMutations(records, {
      turnSelector: getActiveTurnSelectors().join(","),
      isIgnoredTarget: isIgnoredMutationTarget,
      findTurnAncestor: findIndexedTurnAncestor,
    });

    if (classification.turnStructureChanged) {
      invalidateActiveTurnSelectorGroup();
      fullTurnSyncRequested = true;
    }

    if (classification.dirtyTurns.size > 0) {
      for (const turnElement of classification.dirtyTurns) {
        turnTextIndex.markDirty(turnElement);
      }
      requestTextIndexSoon();
    }

    if (classification.codeRoots.size > 0) {
      codeBlocks.markCodeSubtreesDirty(classification.codeRoots);
      scheduleCodeScan();
    }

    if (classification.requestUpdate) requestUpdate();
  }

  /**
   * Some hosts swap turns in with class-only markup. While nothing is indexed,
   * retry the selector groups once per second; stop as soon as a turn appears.
   */
  function syncTurnDiscoveryFallback(): void {
    if (state.totalTurns > 0) {
      if (turnDiscoveryTimer !== null) {
        window.clearInterval(turnDiscoveryTimer);
        turnDiscoveryTimer = null;
      }
      return;
    }
    if (turnDiscoveryTimer !== null) return;
    turnDiscoveryTimer = window.setInterval(() => {
      if (isEngineDormant()) return;
      if (state.totalTurns > 0) {
        if (turnDiscoveryTimer !== null) {
          window.clearInterval(turnDiscoveryTimer);
          turnDiscoveryTimer = null;
        }
        return;
      }
      invalidateActiveTurnSelectorGroup();
      requestUpdate();
    }, TURN_DISCOVERY_RETRY_INTERVAL);
  }

  /** Reset per-conversation caches when the route points at another chat. */
  function resetTurnIndexForNavigation(): void {
    invalidateActiveTurnSelectorGroup();
    turnTextIndex.clear();
    restoredTurns.clear();
    dehydratedTurns.clear();
    fullTurnSyncRequested = true;
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

    const structuralSync = fullTurnSyncRequested;
    fullTurnSyncRequested = false;
    syncTurnIndex();
    if (structuralSync) syncTurnDiscoveryFallback();
    if (codeBlocks.isCodeScanPending()) scheduleCodeScan();
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
      handleMutationRecords(records);
    });

    observer.observe(observeRoot, {
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: Array.from(TURN_MARKER_ATTRIBUTES),
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
        resetTurnIndexForNavigation();
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
        resetTurnIndexForNavigation();
        codeBlocks.requestCodeScan();
        requestUpdate();
      }, 0);
      return result;
    };

    window.addEventListener("popstate", () => {
      if (syncEngineActivation()) return;
      resetTurnIndexForNavigation();
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
    if (textIndexTimer !== null) {
      window.clearTimeout(textIndexTimer);
      textIndexTimer = null;
    }
    if (textIndexFrame !== null) {
      window.cancelAnimationFrame(textIndexFrame);
      textIndexFrame = null;
    }
    if (codeScanTimer !== null) {
      window.clearTimeout(codeScanTimer);
      codeScanTimer = null;
    }
    if (turnDiscoveryTimer !== null) {
      window.clearInterval(turnDiscoveryTimer);
      turnDiscoveryTimer = null;
    }
    turnTextIndex.clear();
    restoredTurns.clear();
    dehydratedTurns.clear();
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
          !event.repeat &&
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
    syncTurnDiscoveryFallback();
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
