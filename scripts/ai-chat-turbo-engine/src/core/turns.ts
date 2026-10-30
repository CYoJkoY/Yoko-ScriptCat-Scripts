import { CHATGPT_SHELL_ROOT_SELECTOR, CHATGPT_TRANSCRIPT_ROOT_SELECTOR, PLATFORMS, VF_REGEX, VF_TOKEN_START, type PlatformDefinition } from '../config';
import { reportRecoverableError } from './diagnostics';
import { elementToPlainText, matchesReasoningElement, normalizeText } from './text';

/**
 * Turn discovery and classification for one platform.
 *
 * The factory keeps every DOM cache and the active selector group private to a
 * single engine instance; the platform is bound once at boot time instead of
 * being read from module state.
 */
/** One indexed conversation turn, ordered by DOM position. */
export interface TurnRecord {
  id: number;
  element: Element;
  text: string;
}

export function createTurnUtils(platform: PlatformDefinition) {
  let activeTurnSelectorGroup: readonly string[] | null = null;
  const renderedCheckCache = new Map<Element, boolean>();

  /** Drop one update pass of layout truth; callers run this before a sync. */
  function clearRenderedCache(): void {
    renderedCheckCache.clear();
  }

  function isGeminiThoughtElement(element: unknown): boolean {
    if (platform !== PLATFORMS.gemini || !(element instanceof Element))
      return false;
    return Boolean(
      element.closest(
        "model-thoughts, .thoughts-container, .thoughts-content, [data-test-id*='thought']",
      ),
    );
  }

  function isUserTurn(turnElement: unknown): boolean {
    if (!(turnElement instanceof Element)) return false;

    const contentSearchKey = turnElement.getAttribute(
      "data-content-search-unit-key",
    );
    if (contentSearchKey && /:(user|human)$/i.test(contentSearchKey)) {
      return true;
    }
    if (
      contentSearchKey &&
      /:(assistant|model|system)$/i.test(contentSearchKey)
    ) {
      return false;
    }

    const roleValues = [
      turnElement.getAttribute("data-message-author-role"),
      turnElement.getAttribute("data-message-author"),
      turnElement.getAttribute("data-role"),
      turnElement.getAttribute("data-message-role"),
      turnElement.getAttribute("data-conversation-role"),
      turnElement.getAttribute("data-turn"),
    ].filter((role): role is string => typeof role === "string");
    if (roleValues.some((role) => /^(user|human)$/i.test(role))) return true;
    if (roleValues.some((role) => /^(assistant|model|system)$/i.test(role))) {
      return false;
    }

    const platformUserSelectors = platform.userTurnSelectors || [];
    for (const selector of platformUserSelectors) {
      if (
        turnElement.matches(selector) ||
        turnElement.querySelector(selector)
      ) {
        return true;
      }
    }

    // Some platforms mark the wrapper's parent rather than the message-content node.
    let ancestor = turnElement.parentElement;
    let ancestorDepth = 0;
    while (ancestor && ancestorDepth < 3) {
      const currentAncestor = ancestor;
      if (
        platformUserSelectors.some((selector) =>
          currentAncestor.matches(selector),
        )
      ) {
        return true;
      }
      ancestor = ancestor.parentElement;
      ancestorDepth++;
    }

    if (
      turnElement.matches(
        "user-query, [data-test-id='user-query'], .user-query, .user-query-container",
      ) ||
      turnElement.querySelector(
        ".user-query-text, .query-text, [class*='query-content']",
      )
    ) {
      return true;
    }

    if (
      turnElement.matches("div.font-user-message") ||
      turnElement.querySelector(".font-user-message")
    ) {
      return true;
    }

    if (
      turnElement.matches('[data-testid*="user"], [class*="user"]') ||
      turnElement.querySelector('[data-testid*="user"]')
    ) {
      return true;
    }

    return false;
  }

  function getTurnRole(turnElement: unknown): "user" | "assistant" {
    if (!(turnElement instanceof Element)) return "assistant";

    const contentSearchKey = turnElement.getAttribute(
      "data-content-search-unit-key",
    );
    if (contentSearchKey && /:(user|human)$/i.test(contentSearchKey)) {
      return "user";
    }
    if (contentSearchKey && /:(assistant|model)$/i.test(contentSearchKey)) {
      return "assistant";
    }

    const roleValues = [
      turnElement.getAttribute("data-message-author-role"),
      turnElement.getAttribute("data-message-author"),
      turnElement.getAttribute("data-role"),
      turnElement.getAttribute("data-message-role"),
      turnElement.getAttribute("data-conversation-role"),
      turnElement.getAttribute("data-turn"),
    ].filter((role): role is string => typeof role === "string");

    if (roleValues.some((role) => /^(user|human)$/i.test(role))) return "user";
    if (roleValues.some((role) => /^(assistant|model)$/i.test(role))) {
      return "assistant";
    }

    for (const selector of platform.userTurnSelectors || []) {
      try {
        if (turnElement.matches(selector)) return "user";
      } catch (error: unknown) {
        reportRecoverableError("test user turn selector", error);
      }
    }
    return isUserTurn(turnElement) ? "user" : "assistant";
  }

  function uniqueDomOrdered(elements: Iterable<unknown>): Element[] {
    const seen = new Set<Element>();
    const unique: Element[] = [];

    for (const element of elements) {
      if (!(element instanceof Element) || seen.has(element)) continue;
      seen.add(element);
      unique.push(element);
    }

    unique.sort((first, second) => {
      if (first === second) return 0;
      const relation = first.compareDocumentPosition(second);
      if (relation & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (relation & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    return unique;
  }

  function filterOutNested(elements: Iterable<unknown>): Element[] {
    const ordered = uniqueDomOrdered(elements);
    const candidateSet = new Set(ordered);

    return ordered.filter((element) => {
      let parent = element.parentElement;
      while (parent) {
        if (candidateSet.has(parent)) return false;
        parent = parent.parentElement;
      }
      return true;
    });
  }

  function isRenderedChatGPTElement(element: Element): boolean {
    if (
      !(element instanceof HTMLElement) ||
      !element.isConnected ||
      element.closest('[hidden], [aria-hidden="true"], [inert]')
    ) {
      return false;
    }

    const cachedResult = renderedCheckCache.get(element);
    if (cachedResult !== undefined) return cachedResult;

    const computedStyle = window.getComputedStyle(element);
    const isRendered =
      computedStyle.display !== "none" &&
      computedStyle.visibility !== "hidden" &&
      computedStyle.visibility !== "collapse" &&
      element.getClientRects().length > 0;
    /* One layout truth per update pass keeps streaming off the layout path. */
    renderedCheckCache.set(element, isRendered);
    return isRendered;
  }

  function selectChatGPTRootWithMostTurns(
    roots: readonly Element[],
    turnSelector: string,
  ): Element | null {
    let selectedRoot: Element | null = null;
    let largestTurnCount = -1;

    for (const candidateRoot of roots) {
      const turnCount = Array.from(
        candidateRoot.querySelectorAll(turnSelector),
      ).filter(
        (turnElement) =>
          turnElement.closest("[data-turn-key]") === turnElement &&
          isRenderedChatGPTElement(turnElement),
      ).length;

      if (turnCount >= largestTurnCount) {
        selectedRoot = candidateRoot;
        largestTurnCount = turnCount;
      }
    }

    return selectedRoot;
  }

  function collectChatGPTShellMessages(conversationRoot: Element): Element[] {
    const messageNodes: Element[] = [];
    const seenTurnRoles = new Set<string>();
    const turnContainers = Array.from(
      conversationRoot.querySelectorAll("[data-turn-key]"),
    ).filter(
      (turnContainer) =>
        turnContainer.closest("[data-turn-key]") === turnContainer &&
        isRenderedChatGPTElement(turnContainer),
    );

    const roleSelectors = [
      {
        role: "user",
        selectors: [
          '[data-content-search-unit-key$=":user"]',
          '[data-user-message-bubble="true"]',
          '[data-message-role="user"]',
          '[data-conversation-role="user"]',
        ],
      },
      {
        role: "assistant",
        selectors: [
          '[data-content-search-unit-key$=":assistant"]',
          '[data-message-role="assistant"]',
          '[data-conversation-role="assistant"]',
          "[data-chatgpt-agent-turn-start]",
        ],
      },
    ];

    for (const turnContainer of turnContainers) {
      const turnKey = (
        turnContainer.getAttribute("data-turn-key") ||
        turnContainer.getAttribute("data-turn-id") ||
        turnContainer.id ||
        ""
      ).trim();
      if (!turnKey) continue;

      for (const roleConfig of roleSelectors) {
        const roleIdentity = `${turnKey}:${roleConfig.role}`;
        if (seenTurnRoles.has(roleIdentity)) continue;

        let roleElement: Element | null = null;
        for (const selector of roleConfig.selectors) {
          roleElement =
            Array.from(turnContainer.querySelectorAll(selector)).find(
              (candidateElement) =>
                candidateElement.closest("[data-turn-key]") === turnContainer &&
                isRenderedChatGPTElement(candidateElement),
            ) ?? null;
          if (roleElement) break;
        }

        if (!roleElement) continue;
        seenTurnRoles.add(roleIdentity);
        messageNodes.push(roleElement);
      }
    }

    return filterOutNested(uniqueDomOrdered(messageNodes)).filter(
      (element) =>
        !isGeminiThoughtElement(element) && !matchesReasoningElement(element),
    );
  }

  function getCurrentChatGPTTurns(): Element[] | null {
    if (platform.name !== "ChatGPT") return null;

    const shellRoots = Array.from(
      document.querySelectorAll(CHATGPT_SHELL_ROOT_SELECTOR),
    ).filter(isRenderedChatGPTElement);

    if (shellRoots.length) {
      const activeShellRoot = selectChatGPTRootWithMostTurns(
        shellRoots,
        "[data-turn-key]",
      );
      // A recognized but empty shell is authoritative; do not count a kept or hidden chat.
      return activeShellRoot
        ? collectChatGPTShellMessages(activeShellRoot)
        : [];
    }

    const transcriptRoots = Array.from(
      document.querySelectorAll(CHATGPT_TRANSCRIPT_ROOT_SELECTOR),
    ).filter(isRenderedChatGPTElement);

    if (transcriptRoots.length) {
      let activeTranscriptRoot = transcriptRoots[0];
      let largestMessageCount = -1;

      for (const candidateRoot of transcriptRoots) {
        const messageCount = Array.from(
          candidateRoot.querySelectorAll(":scope > li[data-message-role]"),
        ).filter(isRenderedChatGPTElement).length;

        if (messageCount >= largestMessageCount) {
          activeTranscriptRoot = candidateRoot;
          largestMessageCount = messageCount;
        }
      }

      return Array.from(
        activeTranscriptRoot.querySelectorAll(":scope > li[data-message-role]"),
      ).filter(isRenderedChatGPTElement);
    }

    return null;
  }

  function getTurns(): Element[] {
    const currentChatGPTTurns = getCurrentChatGPTTurns();
    if (currentChatGPTTurns !== null) return currentChatGPTTurns;

    const collected: Element[] = [];
    for (const selector of getActiveTurnSelectors()) {
      document
        .querySelectorAll(selector)
        .forEach((elem) => collected.push(elem));
    }

    const unnested = filterOutNested(collected);
    return unnested.filter(
      (element) =>
        (platform.name !== "ChatGPT" ||
          isRenderedChatGPTElement(element)) &&
        !isGeminiThoughtElement(element) &&
        !matchesReasoningElement(element),
    );
  }

  function findContentElement(turnElement: Element): Element {
    const selectorGroups: (readonly string[])[] = [];
    if (
      isUserTurn(turnElement) &&
      Array.isArray(platform.userContentSelectors)
    ) {
      selectorGroups.push(platform.userContentSelectors);
    }
    selectorGroups.push(platform.contentSelectors || []);

    for (const selectorGroup of selectorGroups) {
      for (const selector of selectorGroup) {
        const match = turnElement.matches(selector)
          ? turnElement
          : turnElement.querySelector(selector);
        if (match && !isGeminiThoughtElement(match)) return match;
      }
    }
    return turnElement;
  }

  function extractTurnText(turnElement: Element): string {
    let raw = elementToPlainText(turnElement);
    const vfIdx = raw.indexOf(VF_TOKEN_START);
    if (vfIdx !== -1) {
      let userPart = raw
        .slice(0, vfIdx)
        .replace(/```[a-z]*\s*$/i, "")
        .trim();
      if (
        userPart === "请查阅并分析以下文本内容：" ||
        userPart === "请查阅以下文本："
      ) {
        userPart = "";
      }
      const match = raw.match(VF_REGEX);
      const fileName = match ? ` [📎 ${match[1]}]` : " [📎 附件文件]";
      raw = (userPart || "附件文本") + fileName;
    }
    return normalizeText(raw);
  }

  function getActiveTurnSelectors(): readonly string[] {
    const selectorGroups = platform.turnSelectorGroups;
    if (!Array.isArray(selectorGroups)) {
      return platform.turnSelectors;
    }

    if (activeTurnSelectorGroup) {
      return activeTurnSelectorGroup;
    }

    for (const selectorGroup of selectorGroups) {
      if (
        selectorGroup.some((selector: string) =>
          document.querySelector(selector),
        )
      ) {
        activeTurnSelectorGroup = selectorGroup;
        return selectorGroup;
      }
    }

    return platform.turnSelectors;
  }

  function invalidateActiveTurnSelectorGroup() {
    activeTurnSelectorGroup = null;
  }

  return {
    isGeminiThoughtElement,
    isUserTurn,
    getTurnRole,
    filterOutNested,
    getCurrentChatGPTTurns,
    getTurns,
    findContentElement,
    extractTurnText,
    getActiveTurnSelectors,
    invalidateActiveTurnSelectorGroup,
    clearRenderedCache,
  };
}
