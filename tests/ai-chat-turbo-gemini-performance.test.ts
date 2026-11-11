// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLATFORMS } from "../scripts/ai-chat-turbo-engine/src/config";
import { classifyMutations } from "../scripts/ai-chat-turbo-engine/src/core/mutation-classify";
import { createTurnTextIndex } from "../scripts/ai-chat-turbo-engine/src/core/turn-index";
import { createTurnUtils } from "../scripts/ai-chat-turbo-engine/src/core/turns";
import { createEngineState } from "../scripts/ai-chat-turbo-engine/src/state";
import {
  createCodeBlockUtils,
  type ElementFactory,
} from "../scripts/ai-chat-turbo-engine/src/ui/code-blocks";

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
    } else if (key === "style") {
      node.style.cssText = value;
    } else {
      node.setAttribute(key, value);
    }
  }
  for (const child of children) node.append(child);
  return node;
}

const el: ElementFactory = createTestElement;

function mutation(
  init: Partial<MutationRecord> & { type: MutationRecord["type"]; target: Node },
): MutationRecord {
  return {
    attributeName: null,
    attributeNamespace: null,
    addedNodes: [] as unknown as NodeList,
    nextSibling: null,
    oldValue: null,
    previousSibling: null,
    removedNodes: [] as unknown as NodeList,
    ...init,
  } as MutationRecord;
}

function nodes(...values: Node[]): NodeList {
  return values as unknown as NodeList;
}

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

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("Gemini turn discovery", () => {
  it("uses the custom elements first and falls back to the legacy class DOM", () => {
    const customQuery = document.createElement("user-query");
    customQuery.textContent = "custom question";
    const customResponse = document.createElement("model-response");
    customResponse.textContent = "custom answer";
    document.body.append(customQuery, customResponse);

    const turns = createTurnUtils(PLATFORMS.gemini);
    expect(turns.getActiveTurnSelectors()).toEqual([
      "user-query",
      "model-response",
    ]);
    expect(turns.getTurns()).toEqual([customQuery, customResponse]);

    customQuery.remove();
    customResponse.remove();
    const legacyQuery = document.createElement("div");
    legacyQuery.className = "user-query";
    legacyQuery.textContent = "legacy question";
    const legacyResponse = document.createElement("div");
    legacyResponse.className = "model-response";
    legacyResponse.textContent = "legacy answer";
    document.body.append(legacyQuery, legacyResponse);

    turns.invalidateActiveTurnSelectorGroup();
    expect(turns.getActiveTurnSelectors()).toEqual([
      ".user-query",
      ".model-response",
      ".user-query-container",
      ".model-response-container",
    ]);
    expect(turns.getTurns()).toEqual([legacyQuery, legacyResponse]);
  });

  it("walks the document once and keeps document order without nested turns", () => {
    const model = document.createElement("div");
    model.className = "model-response";
    model.textContent = "answer";
    const container = document.createElement("div");
    container.className = "user-query-container";
    const query = document.createElement("div");
    query.className = "user-query";
    query.textContent = "question";
    container.append(query);
    document.body.append(model, container);

    const turns = createTurnUtils(PLATFORMS.gemini);
    const original = document.querySelectorAll.bind(document);
    const querySpy = vi
      .spyOn(document, "querySelectorAll")
      .mockImplementation(original);

    expect(turns.getTurns()).toEqual([model, container]);
    expect(querySpy).toHaveBeenCalledTimes(1);
    expect(querySpy.mock.calls[0]?.[0]).toContain("user-query");
    expect(querySpy.mock.calls[0]?.[0]).toContain("model-response");
  });

  it("drops reasoning blocks from the turn list", () => {
    const response = document.createElement("model-response");
    const thoughts = document.createElement("model-thoughts");
    thoughts.textContent = "private reasoning";
    response.append(thoughts);
    document.body.append(response);

    const turns = createTurnUtils(PLATFORMS.gemini);
    expect(turns.getTurns()).toEqual([response]);
  });
});

describe("incremental turn text index", () => {
  it("reuses unchanged text and only extracts new or dirty turns", () => {
    const first = document.createElement("div");
    first.textContent = "first";
    const second = document.createElement("div");
    second.textContent = "second";
    const third = document.createElement("div");
    third.textContent = "third";
    document.body.append(first, second, third);

    const extract = vi.fn((turn: Element) => turn.textContent ?? "");
    const index = createTurnTextIndex({ extract });

    index.reconcile([first, second]);
    expect(index.pendingCount()).toBe(2);
    expect(index.flush()).toBe(0);
    expect(extract.mock.calls.map(([turn]) => turn)).toEqual([first, second]);
    expect(index.getRecords().map((record) => record.text)).toEqual([
      "first",
      "second",
    ]);

    index.reconcile([first, second]);
    expect(index.flush()).toBe(0);
    expect(extract).toHaveBeenCalledTimes(2);

    first.textContent = "first updated";
    index.markDirty(first);
    expect(index.flush()).toBe(0);
    expect(extract).toHaveBeenCalledTimes(3);
    expect(extract).toHaveBeenLastCalledWith(first);
    expect(index.getRecords()[0]?.text).toBe("first updated");

    index.reconcile([second, third]);
    expect(index.getRecords().map((record) => record.id)).toEqual([0, 1]);
    expect(index.getRecords().map((record) => record.element)).toEqual([
      second,
      third,
    ]);
    expect(index.getRecords()[0]?.text).toBe("second");
    expect(index.flush()).toBe(0);
    expect(extract).toHaveBeenCalledTimes(4);
    expect(extract).toHaveBeenLastCalledWith(third);
  });

  it("stops at the frame budget and resumes from the remaining queue", () => {
    const turns = Array.from({ length: 4 }, (_, indexValue) => {
      const element = document.createElement("div");
      element.textContent = String(indexValue);
      document.body.append(element);
      return element;
    });

    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const extract = vi.fn((turn: Element) => {
      now += 10;
      return turn.textContent ?? "";
    });
    const index = createTurnTextIndex({ extract });
    index.reconcile(turns);

    expect(index.flush({ budgetMs: 8 })).toBe(3);
    expect(extract).toHaveBeenCalledTimes(1);
    expect(index.flush()).toBe(0);
    expect(extract).toHaveBeenCalledTimes(4);
  });

  it("drops queued work for turns that left the document", () => {
    const first = document.createElement("div");
    const second = document.createElement("div");
    document.body.append(first, second);
    const extract = vi.fn(() => "text");
    const index = createTurnTextIndex({ extract });

    index.reconcile([first, second]);
    index.markDirty(first);
    index.reconcile([second]);

    expect(index.flush()).toBe(0);
    expect(extract).toHaveBeenCalledTimes(1);
    expect(extract).toHaveBeenCalledWith(second);
    expect(index.getRecords().map((record) => record.element)).toEqual([
      second,
    ]);
  });
});

describe("mutation classification", () => {
  const turnSelector = "user-query,model-response";
  const context = (indexed: Element | null) => ({
    turnSelector,
    isIgnoredTarget: () => false,
    findTurnAncestor: () => indexed,
  });

  it("marks only the indexed turn dirty for streamed content", () => {
    const turn = document.createElement("model-response");
    const content = document.createElement("div");
    turn.append(content);
    document.body.append(turn);

    const result = classifyMutations(
      [
        mutation({ type: "characterData", target: content.firstChild ?? content }),
        mutation({
          type: "childList",
          target: content,
          addedNodes: nodes(document.createTextNode("more")),
        }),
      ],
      context(turn),
    );

    expect(result.requestUpdate).toBe(false);
    expect(result.turnStructureChanged).toBe(false);
    expect(result.dirtyTurns).toEqual(new Set([turn]));
    expect(result.codeRoots).toEqual(new Set([content]));
  });

  it("ignores class and marker churn inside an indexed turn", () => {
    const turn = document.createElement("model-response");
    document.body.append(turn);

    const result = classifyMutations(
      [
        mutation({ type: "attributes", target: turn, attributeName: "class" }),
        mutation({
          type: "attributes",
          target: turn,
          attributeName: "data-testid",
        }),
      ],
      context(turn),
    );

    expect(result.requestUpdate).toBe(false);
    expect(result.turnStructureChanged).toBe(false);
    expect(result.dirtyTurns.size).toBe(0);
  });

  it("requests turn discovery for inserted and removed turn containers", () => {
    const host = document.createElement("div");
    const inserted = document.createElement("user-query");
    const removed = document.createElement("model-response");
    document.body.append(host);

    const insertedResult = classifyMutations(
      [mutation({ type: "childList", target: host, addedNodes: nodes(inserted) })],
      context(null),
    );
    expect(insertedResult.requestUpdate).toBe(true);
    expect(insertedResult.turnStructureChanged).toBe(true);
    expect(insertedResult.codeRoots).toEqual(new Set([inserted]));

    const removedResult = classifyMutations(
      [mutation({ type: "childList", target: host, removedNodes: nodes(removed) })],
      context(null),
    );
    expect(removedResult.requestUpdate).toBe(true);
    expect(removedResult.turnStructureChanged).toBe(true);
    expect(removedResult.codeRoots.size).toBe(0);
  });

  it("requests discovery when an unindexed node gains a turn marker", () => {
    const wrapper = document.createElement("div");
    document.body.append(wrapper);
    const result = classifyMutations(
      [
        mutation({
          type: "attributes",
          target: wrapper,
          attributeName: "data-testid",
        }),
      ],
      context(null),
    );

    expect(result.requestUpdate).toBe(true);
    expect(result.turnStructureChanged).toBe(true);
  });
});

describe("code block mounting", () => {
  function createCodeFixture(dehydrated: boolean) {
    const state = createEngineState();
    const turn = document.createElement("model-response");
    if (dehydrated) turn.classList.add("ai-turbo-dehydrated");
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = "const answer = 42;";
    pre.append(code);
    turn.append(pre);
    document.body.append(turn);

    const measurements = vi.fn();
    for (const property of ["scrollHeight", "offsetHeight"] as const) {
      Object.defineProperty(pre, property, {
        configurable: true,
        get: () => {
          measurements();
          return 420;
        },
      });
    }

    const codeBlocks = createCodeBlockUtils({
      currentPlatform: PLATFORMS.gemini,
      state,
      el,
      withSelfMutation: (task) => task(),
      filterOutNested,
      isGeminiThoughtElement: () => false,
      requestUpdate: vi.fn(),
    });
    return { codeBlocks, measurements, pre, state, turn };
  }

  it("does not measure or mount code inside a dehydrated turn", () => {
    const { codeBlocks, measurements, pre, state, turn } = createCodeFixture(true);

    codeBlocks.requestCodeScanForTurn(turn);
    codeBlocks.flushCodeBlockScan();

    expect(measurements).not.toHaveBeenCalled();
    expect(document.querySelector(".ai-turbo-code-bar")).toBeNull();
    expect(pre.classList.contains("ai-turbo-code-target")).toBe(false);
    expect(state.foldedCodeCount).toBe(0);
  });

  it("mounts restored code once and drops the count when suspended", () => {
    const { codeBlocks, measurements, pre, state, turn } = createCodeFixture(true);
    codeBlocks.flushCodeBlockScan();
    turn.classList.remove("ai-turbo-dehydrated");

    codeBlocks.requestCodeScanForTurn(turn);
    codeBlocks.flushCodeBlockScan();

    expect(measurements).toHaveBeenCalled();
    expect(document.querySelector(".ai-turbo-code-bar")).not.toBeNull();
    expect(pre.classList.contains("ai-turbo-code-target")).toBe(true);
    expect(state.foldedCodeCount).toBe(1);

    codeBlocks.suspendTurnCodeBlocks(turn);
    expect(document.querySelector(".ai-turbo-code-bar")).toBeNull();
    expect(pre.classList.contains("ai-turbo-code-target")).toBe(false);
    expect(state.foldedCodeCount).toBe(0);
  });

  it("does not scan the document when the layout observer starts", () => {
    const observed: Element[] = [];
    const disconnect = vi.fn();
    class FakeResizeObserver {
      observe = vi.fn((target: Element) => {
        observed.push(target);
      });
      unobserve = vi.fn();
      disconnect = disconnect;
    }
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);

    const { codeBlocks, pre } = createCodeFixture(false);
    const querySpy = vi.spyOn(document, "querySelectorAll");
    codeBlocks.observeCodeLayout();

    expect(querySpy).not.toHaveBeenCalled();
    expect(observed).toHaveLength(0);

    codeBlocks.flushCodeBlockScan();
    expect(observed).toEqual([pre]);

    codeBlocks.disconnectCodeLayoutObserver();
    expect(disconnect).toHaveBeenCalled();
  });
});
