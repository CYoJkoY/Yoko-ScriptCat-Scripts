// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SIDEBAR_PEEK_ATTRIBUTE,
  SIDEBAR_PEEK_HIDE_DELAY_MS,
  SIDEBAR_PEEK_SHIFT_VAR,
  SIDEBAR_PEEK_SHOW_DELAY_MS,
  SIDEBAR_PEEK_WIDTH_VAR,
  createSidebarPeek,
  type SidebarPeek,
} from "../scripts/ai-chat-turbo-engine/src/core/sidebar-peek";
import { SIDEBAR_PEEK_CSS } from "../scripts/ai-chat-turbo-engine/src/ui/styles";
import {
  PLATFORMS,
  type PlatformDefinition,
} from "../scripts/ai-chat-turbo-engine/src/config";
import engineMeta from "../scripts/ai-chat-turbo-engine/meta";

const SIDEBAR = {
  selectors: ["#rail"],
  triggers: ["#toggle"],
  peekWidth: 248,
  collapsedMaxWidth: 96,
};

let peek: SidebarPeek | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = `
    <div id="app">
      <nav id="rail" class="collapsed">
        <button id="new-chat">New chat</button>
        <a id="history" href="#history">History</a>
      </nav>
      <main id="chat">Chat</main>
      <button id="toggle" data-testid="sidebar-toggle">Toggle</button>
    </div>
  `;
  stubRect("#rail", 52, 768);
  stubRect("#chat", 972, 768, 52);
});

afterEach(() => {
  peek?.teardown();
  peek = null;
  vi.useRealTimers();
  document.body.replaceChildren();
});

function stubRect(
  selector: string,
  width: number,
  height: number,
  left = 0,
): void {
  const node = document.querySelector(selector);
  if (!(node instanceof HTMLElement)) throw new Error(`missing ${selector}`);
  node.getBoundingClientRect = () =>
    ({
      width,
      height,
      left,
      top: 0,
      right: left + width,
      bottom: height,
      x: left,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

function dispatchPointer(
  type: "pointerover" | "pointerout" | "pointerdown",
  target: Element,
  related: EventTarget | null = null,
  pointerType = "mouse",
): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    relatedTarget: related,
  });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  target.dispatchEvent(event);
}

function rail(): HTMLElement {
  const node = document.getElementById("rail");
  if (!(node instanceof HTMLElement)) throw new Error("missing rail");
  return node;
}

function start(): SidebarPeek {
  peek = createSidebarPeek({ sidebar: SIDEBAR });
  peek.bind(document);
  return peek;
}

function hoverButton(): void {
  const button = document.getElementById("new-chat");
  if (!button) throw new Error("missing button");
  dispatchPointer("pointerover", button);
}

describe("sidebar hover peek", () => {
  it("widens the existing rail after the hover intent delay", () => {
    const instance = start();

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS - 1);
    expect(rail().hasAttribute(SIDEBAR_PEEK_ATTRIBUTE)).toBe(false);

    vi.advanceTimersByTime(1);
    expect(rail().getAttribute(SIDEBAR_PEEK_ATTRIBUTE)).toBe("left");
    expect(rail().style.getPropertyValue(SIDEBAR_PEEK_WIDTH_VAR)).toBe("248px");
    expect(rail().style.getPropertyValue(SIDEBAR_PEEK_SHIFT_VAR)).toMatch(
      /^-?\d+px$/,
    );
    expect(instance.isPeeking()).toBe(true);
  });

  it("marks a rail on the right half as a right peek", () => {
    start();
    stubRect("#rail", 52, 768, 1000);

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(rail().getAttribute(SIDEBAR_PEEK_ATTRIBUTE)).toBe("right");
  });

  it("keeps the rail open while moving between its buttons", () => {
    start();
    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);

    const button = document.getElementById("new-chat");
    const history = document.getElementById("history");
    if (!button || !history) throw new Error("missing rail controls");
    dispatchPointer("pointerout", button, history);
    vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS);

    expect(rail().hasAttribute(SIDEBAR_PEEK_ATTRIBUTE)).toBe(true);
  });

  it("restores the native rail after the leave grace period", () => {
    const instance = start();
    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);

    const button = document.getElementById("new-chat");
    if (!button) throw new Error("missing button");
    dispatchPointer("pointerout", button);
    vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS - 1);
    expect(rail().hasAttribute(SIDEBAR_PEEK_ATTRIBUTE)).toBe(true);

    vi.advanceTimersByTime(1);
    expect(rail().hasAttribute(SIDEBAR_PEEK_ATTRIBUTE)).toBe(false);
    expect(rail().style.getPropertyValue(SIDEBAR_PEEK_WIDTH_VAR)).toBe("");
    expect(rail().style.getPropertyValue(SIDEBAR_PEEK_SHIFT_VAR)).toBe("");
    expect(instance.isPeeking()).toBe(false);
  });

  it("peeks when hovering a toggle button outside the rail", () => {
    start();
    const toggle = document.getElementById("toggle");
    if (!toggle) throw new Error("missing toggle");
    dispatchPointer("pointerover", toggle);
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);

    expect(rail().hasAttribute(SIDEBAR_PEEK_ATTRIBUTE)).toBe(true);
  });

  it("ignores an expanded rail and non-mouse pointers", () => {
    const instance = start();
    const expanded = rail();
    expanded.className = "sidenav-open";
    stubRect("#rail", 288, 768);

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(instance.isPeeking()).toBe(false);

    expanded.className = "collapsed";
    stubRect("#rail", 52, 768);
    dispatchPointer("pointerover", expanded, null, "touch");
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(instance.isPeeking()).toBe(false);
  });

  it("opens on keyboard focus and closes on Escape", () => {
    const instance = start();
    const button = document.getElementById("new-chat");
    if (!button) throw new Error("missing button");

    button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(instance.isPeeking()).toBe(true);

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(instance.isPeeking()).toBe(false);
  });

  it("closes immediately on an outside press or the native toggle", () => {
    const instance = start();
    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);

    const chat = document.getElementById("chat");
    if (!chat) throw new Error("missing chat");
    dispatchPointer("pointerdown", chat);
    expect(instance.isPeeking()).toBe(false);

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    const toggle = document.getElementById("toggle");
    if (!toggle) throw new Error("missing toggle");
    dispatchPointer("pointerdown", toggle);
    expect(instance.isPeeking()).toBe(false);
  });

  it("offsets the width growth so a flex row keeps the chat column in place", () => {
    const computed = new Map<Element, Partial<CSSStyleDeclaration>>();
    const app = document.getElementById("app");
    if (!app) throw new Error("missing app");
    computed.set(rail(), { position: "static" });
    computed.set(app, {
      display: "flex",
      flexDirection: "row",
      overflow: "visible",
    });
    const spy = vi
      .spyOn(window, "getComputedStyle")
      .mockImplementation((node: Element) => {
        const base: Partial<CSSStyleDeclaration> = {
          position: "static",
          display: "block",
          flexDirection: "row",
          overflow: "visible",
          ...computed.get(node),
        };
        return base as CSSStyleDeclaration;
      });

    try {
      start();
      hoverButton();
      vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);

      expect(rail().style.getPropertyValue(SIDEBAR_PEEK_SHIFT_VAR)).toBe(
        "-196px",
      );
      const chat = document.getElementById("chat");
      expect(chat?.getAttribute("style")).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it("preserves a site-defined width property and leaves the rail mounted", () => {
    start();
    const node = rail();
    const buttonCount = node.children.length;
    node.style.setProperty(SIDEBAR_PEEK_WIDTH_VAR, "200px");
    node.style.setProperty(SIDEBAR_PEEK_SHIFT_VAR, "5px");

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(node.style.getPropertyValue(SIDEBAR_PEEK_WIDTH_VAR)).toBe("248px");

    dispatchPointer("pointerout", node);
    vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS);
    expect(node.style.getPropertyValue(SIDEBAR_PEEK_WIDTH_VAR)).toBe("200px");
    expect(node.style.getPropertyValue(SIDEBAR_PEEK_SHIFT_VAR)).toBe("5px");
    expect(document.getElementById("rail")).toBe(node);
    expect(node.children).toHaveLength(buttonCount);
  });

  it("removes listeners, timers, attributes, and overrides on teardown", () => {
    const instance = start();
    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(instance.isPeeking()).toBe(true);

    instance.teardown();
    expect(rail().hasAttribute(SIDEBAR_PEEK_ATTRIBUTE)).toBe(false);
    expect(rail().style.getPropertyValue(SIDEBAR_PEEK_WIDTH_VAR)).toBe("");
    expect(rail().style.getPropertyValue(SIDEBAR_PEEK_SHIFT_VAR)).toBe("");

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(rail().hasAttribute(SIDEBAR_PEEK_ATTRIBUTE)).toBe(false);
  });
});

describe("sidebar peek stylesheet contract", () => {
  it("takes its width from a variable and compensates the growth", () => {
    expect(SIDEBAR_PEEK_CSS).toContain(
      "width: var(--ai-turbo-sidebar-peek-width, 248px) !important;",
    );
    expect(SIDEBAR_PEEK_CSS).toContain(
      'margin-right: var(--ai-turbo-sidebar-peek-shift, 0px) !important;',
    );
    expect(SIDEBAR_PEEK_CSS).toContain(
      'margin-left: var(--ai-turbo-sidebar-peek-shift, 0px) !important;',
    );
    expect(SIDEBAR_PEEK_CSS).toContain("transition: none !important;");
  });

  it("never rewrites the chat column or takes the rail out of flow", () => {
    expect(SIDEBAR_PEEK_CSS).not.toMatch(/bard-sidenav-content/);
    expect(SIDEBAR_PEEK_CSS).not.toMatch(/position\s*:\s*(?:fixed|absolute)/);
    expect(SIDEBAR_PEEK_CSS).not.toMatch(/display\s*:\s*none/);
  });

  it("reveals the Gemini history list only while the peek attribute is set", () => {
    expect(SIDEBAR_PEEK_CSS).toContain(
      ".collapsed :is(.label-and-badge, .title-text)",
    );
    expect(SIDEBAR_PEEK_CSS).toContain("visibility: visible !important;");
    expect(SIDEBAR_PEEK_CSS).toContain("opacity: 1 !important;");
    expect(SIDEBAR_PEEK_CSS).toContain("infinite-scroller");
    expect(SIDEBAR_PEEK_CSS).toContain("mat-nav-list");
    expect(SIDEBAR_PEEK_CSS).toContain("flex-direction: column !important;");
    for (const selector of SIDEBAR_PEEK_CSS.split("\n").filter((line) =>
      line.trim().endsWith("{"),
    )) {
      if (!selector.includes("bard-sidenav")) continue;
      expect(selector).toContain("[data-ai-turbo-sidebar-peek]");
    }
  });
});

describe("sidebar peek layout compensation", () => {
  function computedMap(
    pairs: ReadonlyArray<readonly [Element, Partial<CSSStyleDeclaration>]>,
  ): () => void {
    const computed = new Map<Element, Partial<CSSStyleDeclaration>>(pairs);
    const spy = vi
      .spyOn(window, "getComputedStyle")
      .mockImplementation((node: Element) => {
        const base: Partial<CSSStyleDeclaration> = {
          position: "static",
          display: "block",
          flexDirection: "row",
          overflow: "visible",
          ...computed.get(node),
        };
        return base as CSSStyleDeclaration;
      });
    return () => spy.mockRestore();
  }

  it("cancels the growth inside a content-sized block wrapper", () => {
    const app = document.getElementById("app");
    if (!app) throw new Error("missing app");
    const restore = computedMap([
      [rail(), { position: "static" }],
      [app, { display: "block", overflow: "visible" }],
    ]);

    try {
      start();
      hoverButton();
      vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
      expect(rail().style.getPropertyValue(SIDEBAR_PEEK_SHIFT_VAR)).toBe(
        "-196px",
      );
    } finally {
      restore();
    }
  });

  it("falls back to the configured shift when the parent clips overflow", () => {
    const app = document.getElementById("app");
    if (!app) throw new Error("missing app");
    const restore = computedMap([
      [rail(), { position: "relative" }],
      [app, { display: "flex", flexDirection: "row", overflow: "hidden" }],
    ]);

    try {
      peek = createSidebarPeek({ sidebar: { ...SIDEBAR, shift: -178 } });
      peek.bind(document);
      hoverButton();
      vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
      expect(rail().style.getPropertyValue(SIDEBAR_PEEK_SHIFT_VAR)).toBe(
        "-178px",
      );
    } finally {
      restore();
    }
  });
});

describe("sidebar peek reveal targets", () => {
  it("lifts an inline hidden panel only while peeking, then restores it", () => {
    const node = rail();
    const panel = document.createElement("div");
    panel.id = "panel";
    panel.innerHTML = "<span>History</span>";
    panel.setAttribute("style", "display: none !important; color: red;");
    node.appendChild(panel);

    peek = createSidebarPeek({
      sidebar: { ...SIDEBAR, reveal: ["#panel"] },
    });
    peek.bind(document);

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(panel.style.getPropertyValue("display")).toBe("flex");
    expect(panel.style.getPropertyPriority("display")).toBe("important");
    expect(panel.style.getPropertyValue("color")).toBe("red");

    dispatchPointer("pointerout", panel);
    vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS);
    expect(panel.style.getPropertyValue("display")).toBe("none");
    expect(panel.style.getPropertyPriority("display")).toBe("important");
    expect(panel.style.getPropertyValue("color")).toBe("red");
  });
});

describe("sidebar peek platform coverage", () => {
  const covered = [
    "chatgpt",
    "perplexity",
    "qwen",
    "glm",
    "zai",
    "copilot",
  ] as const;
  const unverified = [
    "grok",
    "deepseek",
    "poe",
    "doubao",
    "yuanbao",
    "qianwen",
  ] as const;

  it("declares a measurable rail for every tested platform", () => {
    for (const key of covered) {
      const sidebar = PLATFORMS[key].sidebar;
      if (!sidebar) throw new Error(`${key} has no sidebar definition`);
      expect(sidebar.selectors.length).toBeGreaterThan(0);
      expect(sidebar.triggers?.length ?? 0).toBeGreaterThan(0);
      expect(sidebar.peekWidth ?? 0).toBeGreaterThan(0);
      expect(sidebar.collapsedMaxWidth ?? 0).toBeGreaterThan(0);
    }
    expect(PLATFORMS.chatgpt.sidebar?.reveal?.length ?? 0).toBeGreaterThan(0);
    expect(PLATFORMS.zai.sidebar?.shift).toBe(-178);
    expect(PLATFORMS.copilot.sidebar?.peekWidth).toBe(256);
  });

  it("no longer declares Claude as a supported platform", () => {
    expect(Object.keys(PLATFORMS)).not.toContain("claude");
    expect(engineMeta.match.some((entry) => entry.includes("claude.ai"))).toBe(
      false,
    );
  });

  it("injects on both Copilot hosts", () => {
    expect(engineMeta.match).toContain("https://copilot.com/*");
    expect(engineMeta.match).toContain("https://copilot.microsoft.com/*");
  });

  it("leaves platforms without a usable rail unregistered", () => {
    const definitions: Record<string, PlatformDefinition> = PLATFORMS;
    for (const key of unverified) {
      expect(definitions[key].sidebar).toBeUndefined();
    }
  });

  it("registers nothing and stays inert without a definition", () => {
    const instance = createSidebarPeek({ sidebar: null });
    peek = instance;
    expect(instance.isPeeking()).toBe(false);
    instance.bind(document);
    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(instance.isPeeking()).toBe(false);
    expect(rail().hasAttribute(SIDEBAR_PEEK_ATTRIBUTE)).toBe(false);
    expect(rail().style.getPropertyValue(SIDEBAR_PEEK_WIDTH_VAR)).toBe("");
  });

  it("scopes every site rule to the peek attribute", () => {
    const selectors = SIDEBAR_PEEK_CSS.split("\n")
      .map((line) => line.trim())
      .filter(
        (line) =>
          line.endsWith("{") &&
          !line.startsWith("/*") &&
          // Grouping at-rules such as @layer open a block without being a
          // selector; the rules inside them are checked separately.
          !line.startsWith("@"),
      );
    expect(selectors.length).toBeGreaterThan(6);
    for (const selector of selectors) {
      expect(selector).toContain(`[${SIDEBAR_PEEK_ATTRIBUTE}`);
    }
  });

  it("overrides Copilot's layered rail width without leaving a layer", () => {
    expect(SIDEBAR_PEEK_CSS).toContain("@layer foundation {");
    expect(SIDEBAR_PEEK_CSS).toContain(
      "--m365-nav-rail-width: var(--ai-turbo-sidebar-peek-width, 256px);",
    );
    expect(SIDEBAR_PEEK_CSS).toContain("div.fui-NavDrawer");
    expect(SIDEBAR_PEEK_CSS).toContain(".fui-NavDrawerBody");
    expect(SIDEBAR_PEEK_CSS).toContain("a.fui-NavItem");
  });
});

