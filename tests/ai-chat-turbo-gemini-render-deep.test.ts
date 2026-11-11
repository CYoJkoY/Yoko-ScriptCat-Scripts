// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CODE_FENCE,
  PLATFORMS,
  STYLE_ID,
  VF_TOKEN_START,
} from "../scripts/ai-chat-turbo-engine/src/config";
import { createTurnUtils } from "../scripts/ai-chat-turbo-engine/src/core/turns";
import {
  elementToPlainText,
  normalizeText,
} from "../scripts/ai-chat-turbo-engine/src/core/text";
import { createEngineState } from "../scripts/ai-chat-turbo-engine/src/state";
import {
  createCodeBlockUtils,
  type ElementFactory,
} from "../scripts/ai-chat-turbo-engine/src/ui/code-blocks";
import {
  GEMINI_NATIVE_RENDER_CSS,
  injectEngineStyles,
} from "../scripts/ai-chat-turbo-engine/src/ui/styles";

function createTestElement<Tag extends keyof HTMLElementTagNameMap = "div">(
  tag: Tag,
  attrs: Readonly<Record<string, string | EventListener>> = {},
  children: readonly (string | Node)[] = [],
): HTMLElementTagNameMap[Tag] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (typeof value === "function") {
      node.addEventListener(key.replace(/^on/, ""), value);
    } else if (key === "className") {
      node.className = value;
    } else {
      node.setAttribute(key, value);
    }
  }
  for (const child of children) node.append(child);
  return node;
}

const el: ElementFactory = createTestElement;

function filterOutNested(elements: readonly Element[]): Element[] {
  const unique = Array.from(new Set(elements));
  const candidates = new Set(unique);
  return unique.filter((element) => {
    let parent = element.parentElement;
    while (parent) {
      if (candidates.has(parent)) return false;
      parent = parent.parentElement;
    }
    return true;
  });
}

type ViewportCallback = (entries: IntersectionObserverEntry[]) => void;

let viewportCallback: ViewportCallback | null = null;
let viewportRootMargin: string | null = null;

function stubViewportObserver() {
  viewportCallback = null;
  viewportRootMargin = null;
  const observe = vi.fn();
  const unobserve = vi.fn();
  const disconnect = vi.fn();

  class FakeIntersectionObserver {
    root = null;
    rootMargin: string;
    thresholds = [0];
    observe = observe;
    unobserve = unobserve;
    disconnect = disconnect;

    constructor(callback: ViewportCallback, options?: IntersectionObserverInit) {
      viewportCallback = callback;
      this.rootMargin = options?.rootMargin ?? "";
      viewportRootMargin = this.rootMargin;
    }

    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  return { observe, unobserve, disconnect };
}

function emitIntersection(target: Element): void {
  if (!viewportCallback) throw new Error("IntersectionObserver was not created");
  viewportCallback([
    { target, isIntersecting: true } as IntersectionObserverEntry,
  ]);
}

function makeTall(element: HTMLElement) {
  const rectReads = vi.fn(() => ({ height: 420 }) as DOMRect);
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: rectReads,
  });
  const scrollReads = vi.fn();
  for (const property of ["scrollHeight", "offsetHeight"] as const) {
    Object.defineProperty(element, property, {
      configurable: true,
      get: () => {
        scrollReads();
        return 420;
      },
    });
  }
  return { rectReads, scrollReads };
}

function createCodeFixture(dehydrated = false) {
  const state = createEngineState();
  state.collapseCode = true;
  const turn = document.createElement("model-response");
  if (dehydrated) turn.classList.add("ai-turbo-dehydrated");
  const pre = document.createElement("pre");
  const code = document.createElement("code");
  code.textContent = "const answer = 42;";
  pre.append(code);
  turn.append(pre);
  document.body.append(turn);

  const measurements = makeTall(pre);
  const requestUpdate = vi.fn();
  const codeBlocks = createCodeBlockUtils({
    currentPlatform: PLATFORMS.gemini,
    state,
    el,
    withSelfMutation: (task) => task(),
    filterOutNested,
    isGeminiThoughtElement: () => false,
    requestUpdate,
  });

  return {
    codeBlocks,
    pre,
    requestUpdate,
    state,
    turn,
    ...measurements,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  Reflect.deleteProperty(window, "IntersectionObserver");
  document.head.innerHTML = "";
  document.body.replaceChildren();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.head.innerHTML = "";
  document.body.replaceChildren();
});

describe("Gemini deep native render contract", () => {
  it("covers both content containers and removes native glass and motion", () => {
    injectEngineStyles();
    const baseCss = document.getElementById(STYLE_ID)?.textContent ?? "";

    injectEngineStyles({ geminiNativeRender: true });
    const css = document.getElementById(STYLE_ID)?.textContent ?? "";

    expect(css).toBe(`${baseCss}\n${GEMINI_NATIVE_RENDER_CSS}`);
    expect(GEMINI_NATIVE_RENDER_CSS).toContain("model-response :is(.markdown, message-content");
    expect(GEMINI_NATIVE_RENDER_CSS).toContain("contain: layout style !important");
    expect(GEMINI_NATIVE_RENDER_CSS).toContain("backdrop-filter: none !important");
    expect(GEMINI_NATIVE_RENDER_CSS).toContain("animation: none !important");
    expect(GEMINI_NATIVE_RENDER_CSS).not.toMatch(/display\s*:/i);
  });

  it("never isolates a whole turn or paints over native popovers", () => {
    expect(GEMINI_NATIVE_RENDER_CSS).not.toMatch(
      /(?:^|\n)\s*(?:model-response|user-query)\s*\{/,
    );
    expect(GEMINI_NATIVE_RENDER_CSS).not.toMatch(
      /contain\s*:[^;]*\bpaint\b/i,
    );
    expect(GEMINI_NATIVE_RENDER_CSS).not.toMatch(
      /contain\s*:\s*(?:strict|content)\b/i,
    );
    expect(GEMINI_NATIVE_RENDER_CSS).not.toMatch(
      /content-visibility\s*:\s*hidden/i,
    );
  });
});

describe("lazy code block measurement", () => {
  it("only registers offscreen blocks until the viewport observer fires", () => {
    const observer = stubViewportObserver();
    const fixture = createCodeFixture();
    fixture.codeBlocks.observeCodeLayout();
    expect(viewportRootMargin).toBe("800px 0px");

    fixture.codeBlocks.requestCodeScan();
    fixture.codeBlocks.flushCodeBlockScan();

    expect(fixture.rectReads).not.toHaveBeenCalled();
    expect(fixture.scrollReads).not.toHaveBeenCalled();
    expect(observer.observe).toHaveBeenCalledWith(fixture.pre);
    expect(document.querySelector(".ai-turbo-code-bar")).toBeNull();
    expect(fixture.state.foldedCodeCount).toBe(0);

    emitIntersection(fixture.pre);
    expect(observer.unobserve).toHaveBeenCalledWith(fixture.pre);
    expect(fixture.requestUpdate).toHaveBeenCalled();

    fixture.codeBlocks.flushCodeBlockScan();
    expect(fixture.rectReads).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".ai-turbo-code-bar")).not.toBeNull();
    expect(fixture.pre.classList.contains("ai-turbo-code-target")).toBe(true);
    expect(fixture.state.foldedCodeCount).toBe(1);
  });

  it("never registers code inside a dehydrated turn", () => {
    const observer = stubViewportObserver();
    const fixture = createCodeFixture(true);
    fixture.codeBlocks.observeCodeLayout();

    fixture.codeBlocks.requestCodeScan();
    fixture.codeBlocks.flushCodeBlockScan();

    expect(observer.observe).not.toHaveBeenCalled();
    expect(fixture.rectReads).not.toHaveBeenCalled();
    expect(document.querySelector(".ai-turbo-code-bar")).toBeNull();
    expect(fixture.state.foldedCodeCount).toBe(0);
  });

  it("releases the viewport observer on teardown", () => {
    const observer = stubViewportObserver();
    const fixture = createCodeFixture();
    fixture.codeBlocks.observeCodeLayout();
    fixture.codeBlocks.requestCodeScan();
    fixture.codeBlocks.flushCodeBlockScan();

    fixture.codeBlocks.disconnectCodeLayoutObserver();
    expect(observer.unobserve).toHaveBeenCalledWith(fixture.pre);
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });

  it("falls back to measuring when IntersectionObserver is missing", () => {
    const fixture = createCodeFixture();
    fixture.codeBlocks.observeCodeLayout();
    fixture.codeBlocks.requestCodeScan();
    fixture.codeBlocks.flushCodeBlockScan();

    expect(fixture.rectReads).toHaveBeenCalled();
    expect(document.querySelector(".ai-turbo-code-bar")).not.toBeNull();
    expect(fixture.state.foldedCodeCount).toBe(1);
  });
});

describe("deferred code subtree expansion", () => {
  it("queues roots without walking them until the scan window", () => {
    const state = createEngineState();
    state.collapseCode = true;
    const codeBlocks = createCodeBlockUtils({
      currentPlatform: PLATFORMS.gemini,
      state,
      el,
      withSelfMutation: (task) => task(),
      filterOutNested,
      isGeminiThoughtElement: () => false,
      requestUpdate: vi.fn(),
    });
    codeBlocks.flushCodeBlockScan();

    const turn = document.createElement("model-response");
    const pre = document.createElement("pre");
    pre.textContent = "const answer = 42;";
    turn.append(pre);
    document.body.append(turn);
    makeTall(pre);

    const querySpy = vi.spyOn(turn, "querySelectorAll");
    codeBlocks.markCodeSubtreesDirty([turn, turn]);

    expect(querySpy).not.toHaveBeenCalled();
    expect(codeBlocks.isCodeScanPending()).toBe(true);

    codeBlocks.flushCodeBlockScan();
    expect(querySpy).toHaveBeenCalledTimes(2);
    expect(document.querySelectorAll(".ai-turbo-code-bar")).toHaveLength(1);
  });
});

describe("turn discovery cache", () => {
  it("reuses connected turns and re-queries after invalidation or removal", () => {
    const first = document.createElement("model-response");
    first.textContent = "answer";
    document.body.append(first);
    const turns = createTurnUtils(PLATFORMS.gemini);
    const querySpy = vi.spyOn(document, "querySelectorAll");

    expect(turns.getTurns()).toEqual([first]);
    expect(turns.getTurns()).toEqual([first]);
    expect(querySpy).toHaveBeenCalledTimes(1);

    turns.invalidateTurnCache();
    expect(turns.getTurns()).toEqual([first]);
    expect(querySpy).toHaveBeenCalledTimes(2);

    first.remove();
    expect(turns.getTurns()).toEqual([]);
    expect(querySpy).toHaveBeenCalledTimes(3);
  });
});

describe("text extraction cost", () => {
  function legacyNormalize(sourceText: string): string {
    return String(sourceText || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.replace(/[ \t]+$/g, ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  it("normalizes line ends exactly like the previous implementation", () => {
    const samples = [
      "alpha  \r\nbeta\t\r\n\r\n\r\ngamma\u00a0delta",
      "\r\n\r\n  leading and trailing  \r\n",
      "one\ntwo   \n\n\nthree\u00a0four",
      "",
      "\u00a0\u00a0",
    ];
    for (const sample of samples) {
      expect(normalizeText(sample)).toBe(legacyNormalize(sample));
    }
  });

  it("restores every code fence in one pass", () => {
    const root = document.createElement("model-response");
    const intro = document.createElement("p");
    intro.textContent = "Intro";
    const firstPre = document.createElement("pre");
    const firstCode = document.createElement("code");
    firstCode.className = "language-js";
    firstCode.textContent = "const a = 1;";
    firstPre.append(firstCode);
    const middle = document.createElement("p");
    middle.textContent = "Middle";
    const secondPre = document.createElement("pre");
    const secondCode = document.createElement("code");
    secondCode.className = "language-py";
    secondCode.textContent = "print(1)";
    secondPre.append(secondCode);
    root.append(intro, firstPre, middle, secondPre);
    document.body.append(root);

    const text = elementToPlainText(root);
    expect(text).not.toContain("\uE000TURBO_CODE_");
    expect(text).toContain(`${CODE_FENCE}js\nconst a = 1;\n${CODE_FENCE}`);
    expect(text).toContain(`${CODE_FENCE}py\nprint(1)\n${CODE_FENCE}`);
    expect(text.match(new RegExp(CODE_FENCE, "g"))).toHaveLength(4);
  });

  it("keeps the virtual file summary unchanged", () => {
    const turns = createTurnUtils(PLATFORMS.gemini);
    const turn = document.createElement("model-response");
    turn.textContent =
      "请查阅以下文本：" +
      `${VF_TOKEN_START}notes.txt|12|3:TURBO_VFILE_END]]`;

    expect(turns.extractTurnText(turn)).toBe("附件文本 [📎 notes.txt]");

    turn.textContent =
      "请总结这段内容：" +
      `${VF_TOKEN_START}a.md|3|1:TURBO_VFILE_END]]`;
    expect(turns.extractTurnText(turn)).toBe("请总结这段内容： [📎 a.md]");
  });
});
