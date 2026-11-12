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
import { PLATFORMS } from "../scripts/ai-chat-turbo-engine/src/config";
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

function dispatchPointerMove(x: number, y: number, target: Element): void {
  const event = new MouseEvent("pointermove", {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
  });
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  target.dispatchEvent(event);
}

function stubNodeRect(
  node: Element,
  width: number,
  height: number,
  left = 0,
): void {
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

function rail(): HTMLElement {
  const node = document.getElementById("rail");
  if (!(node instanceof HTMLElement)) throw new Error("missing rail");
  return node;
}

/**
 * jsdom has no hit testing. The hide grace period asks the document what sits
 * under the last pointer position, so the tests answer that question directly.
 */
function stubHit(node: Element | null): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(
    document,
    "elementFromPoint",
  );
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    writable: true,
    value: () => node,
  });
  return () => {
    if (descriptor === undefined) {
      delete (document as { elementFromPoint?: unknown }).elementFromPoint;
      return;
    }
    Object.defineProperty(document, "elementFromPoint", descriptor);
  };
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

  it("stays dormant while the preference is off and re-arms when it returns", () => {
    let enabled = false;
    peek = createSidebarPeek({ sidebar: SIDEBAR, enabled: () => enabled });
    peek.bind(document);

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(peek.isPeeking()).toBe(false);

    enabled = true;
    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(peek.isPeeking()).toBe(true);

    enabled = false;
    peek.syncEnabled();
    expect(peek.isPeeking()).toBe(false);
    expect(rail().hasAttribute(SIDEBAR_PEEK_ATTRIBUTE)).toBe(false);
  });

  it("opens from the viewport edge when the rail has no hoverable box", () => {
    stubRect("#rail", 0, 0);
    const instance = start();
    const chat = document.getElementById("chat");
    if (!chat) throw new Error("missing chat");

    dispatchPointerMove(4, 300, chat);
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(instance.isPeeking()).toBe(true);
  });

  it("caps the peek width on a narrow viewport", () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "innerWidth");
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 360,
    });
    try {
      start();
      hoverButton();
      vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
      expect(rail().style.getPropertyValue(SIDEBAR_PEEK_WIDTH_VAR)).toBe(
        "151px",
      );
    } finally {
      if (descriptor === undefined) {
        delete (window as { innerWidth?: unknown }).innerWidth;
      } else {
        Object.defineProperty(window, "innerWidth", descriptor);
      }
    }
  });

  it("holds the peek while a portaled menu stays open", () => {
    const instance = start();
    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);

    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    stubNodeRect(menu, 180, 120, 60);
    document.body.appendChild(menu);

    dispatchPointer("pointerout", rail());
    vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS);
    expect(instance.isPeeking()).toBe(true);

    menu.remove();
    vi.advanceTimersByTime(400);
    expect(instance.isPeeking()).toBe(false);
  });

  it("keeps the peek alive for a press inside its portaled menu", () => {
    const instance = start();
    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);

    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    stubNodeRect(menu, 180, 120, 60);
    document.body.appendChild(menu);
    dispatchPointer("pointerdown", menu);
    expect(instance.isPeeking()).toBe(true);

    menu.remove();
    vi.advanceTimersByTime(400);
    expect(instance.isPeeking()).toBe(false);
  });

  it("ignores a closed menu the site leaves mounted", () => {
    const instance = start();
    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);

    const closed = document.createElement("div");
    closed.setAttribute("role", "dialog");
    closed.setAttribute("aria-hidden", "true");
    stubNodeRect(closed, 320, 240, 40);
    document.body.appendChild(closed);

    dispatchPointer("pointerout", rail());
    vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS);
    expect(instance.isPeeking()).toBe(false);
  });

  it("does not mistake an app-wide dialog for a peek menu", () => {
    const instance = start();
    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);

    const app = document.getElementById("app");
    if (!app) throw new Error("missing app");
    app.setAttribute("role", "dialog");
    stubNodeRect(app, 1024, 768);

    dispatchPointer("pointerout", rail());
    vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS);
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

  it("treats a zero-width or off-screen rail as collapsed", () => {
    const instance = start();
    const node = rail();
    node.className = "";

    stubRect("#rail", 0, 0);
    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(instance.isPeeking()).toBe(true);

    dispatchPointer("pointerout", node);
    vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS);
    expect(instance.isPeeking()).toBe(false);

    // Slid fully past the left edge, the way Yuanbao hides the panel.
    stubRect("#rail", 260, 768, -260);
    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(instance.isPeeking()).toBe(true);

    dispatchPointer("pointerout", node);
    vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS);
    expect(instance.isPeeking()).toBe(false);

    // Slid fully past the right edge.
    stubRect("#rail", 260, 768, 1024);
    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(instance.isPeeking()).toBe(true);

    dispatchPointer("pointerout", node);
    vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS);
    expect(instance.isPeeking()).toBe(false);

    // A rail that is still on screen at a readable width is left alone.
    stubRect("#rail", 320, 768);
    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(instance.isPeeking()).toBe(false);
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
    expect(SIDEBAR_PEEK_CSS).toContain(
      "transition: box-shadow 120ms ease-out !important;",
    );
    expect(SIDEBAR_PEEK_CSS).not.toMatch(/transition:[^;]*\bwidth\b/);
    expect(SIDEBAR_PEEK_CSS).toContain("@media (prefers-reduced-motion: reduce)");
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

describe("sidebar peek revealed rails", () => {
  function stubComputed(
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

  it("keeps a rail the site still lays out at its own display", () => {
    const node = rail();
    node.setAttribute(
      "style",
      "opacity: 0; transform: translateX(-280px); visibility: hidden;",
    );
    stubRect("#rail", 280, 768, -280);
    const restore = stubComputed([[node, { display: "block" }]]);

    try {
      peek = createSidebarPeek({
        sidebar: { ...SIDEBAR, revealRail: true, peekWidth: 280 },
      });
      peek.bind(document);

      hoverButton();
      vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
      // Doubao and Yuanbao keep a block box in flow; forcing flex would
      // rearrange their inner layout.
      expect(node.style.getPropertyValue("display")).toBe("");
      expect(node.style.getPropertyValue("opacity")).toBe("1");
      expect(node.style.getPropertyValue("transform")).toBe("none");
      expect(node.style.getPropertyValue("visibility")).toBe("visible");
      expect(node.style.getPropertyPriority("visibility")).toBe("important");
    } finally {
      restore();
    }

    dispatchPointer("pointerout", node);
    vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS);
    expect(node.style.getPropertyValue("opacity")).toBe("0");
    expect(node.style.getPropertyValue("transform")).toBe(
      "translateX(-280px)",
    );
    expect(node.style.getPropertyValue("visibility")).toBe("hidden");
  });

  it("lifts the clip of a column narrower than the peek", () => {
    const app = document.getElementById("app");
    if (!app) throw new Error("missing app");
    app.setAttribute("style", "overflow-x: clip; color: red;");
    stubRect("#app", 0, 768);
    stubRect("#rail", 0, 0);
    const restore = stubComputed([[app, { overflow: "hidden" }]]);

    try {
      peek = createSidebarPeek({
        sidebar: { ...SIDEBAR, revealRail: true, peekWidth: 280 },
      });
      peek.bind(document);

      hoverButton();
      vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
      expect(app.style.getPropertyValue("overflow-x")).toBe("visible");
      expect(app.style.getPropertyPriority("overflow-x")).toBe("important");
      expect(app.style.getPropertyValue("overflow-y")).toBe("visible");
      expect(app.style.getPropertyValue("color")).toBe("red");
    } finally {
      restore();
    }

    dispatchPointer("pointerout", rail());
    vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS);
    expect(app.style.getPropertyValue("overflow-x")).toBe("clip");
    expect(app.style.getPropertyValue("overflow-y")).toBe("");
    expect(app.style.getPropertyValue("color")).toBe("red");
  });

  it("leaves a clipping column that already fits the peek alone", () => {
    const app = document.getElementById("app");
    if (!app) throw new Error("missing app");
    stubRect("#app", 1440, 768);
    stubRect("#rail", 0, 0);
    const restore = stubComputed([[app, { overflow: "hidden" }]]);

    try {
      peek = createSidebarPeek({
        sidebar: { ...SIDEBAR, revealRail: true, peekWidth: 280 },
      });
      peek.bind(document);

      hoverButton();
      vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
      expect(app.style.getPropertyValue("overflow-x")).toBe("");
      expect(app.style.getPropertyValue("overflow-y")).toBe("");
    } finally {
      restore();
    }
  });
});

describe("sidebar peek native controls", () => {
  it("lifts inert inside the rail and puts it back on leave", () => {
    const node = rail();
    const panel = document.createElement("div");
    panel.id = "panel";
    panel.setAttribute("inert", "");
    panel.innerHTML = '<a href="#row">Row</a>';
    node.appendChild(panel);

    start();
    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(panel.hasAttribute("inert")).toBe(false);

    // A panel mounted after the peek opens must become clickable as well.
    const late = document.createElement("div");
    late.setAttribute("inert", "");
    node.appendChild(late);
    hoverButton();
    expect(late.hasAttribute("inert")).toBe(false);

    dispatchPointer("pointerout", node);
    vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS);
    expect(panel.hasAttribute("inert")).toBe(true);
    expect(late.hasAttribute("inert")).toBe(true);
  });

  it("reveals a rail the site keeps at display none", () => {
    const node = rail();
    node.style.setProperty("display", "none");
    node.style.setProperty("opacity", "0");
    node.style.setProperty("transform", "translateX(-261px)");
    stubRect("#rail", 0, 0);

    peek = createSidebarPeek({
      sidebar: { ...SIDEBAR, revealRail: true, shift: -261, peekWidth: 261 },
    });
    peek.bind(document);

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(node.style.getPropertyValue("display")).toBe("flex");
    expect(node.style.getPropertyPriority("display")).toBe("important");
    expect(node.style.getPropertyValue("opacity")).toBe("1");
    expect(node.style.getPropertyValue("transform")).toBe("none");
    expect(node.style.getPropertyValue(SIDEBAR_PEEK_SHIFT_VAR)).toBe("-261px");

    dispatchPointer("pointerout", node);
    vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS);
    expect(node.style.getPropertyValue("display")).toBe("none");
    expect(node.style.getPropertyPriority("display")).toBe("");
    expect(node.style.getPropertyValue("opacity")).toBe("0");
    expect(node.style.getPropertyValue("transform")).toBe(
      "translateX(-261px)",
    );
  });

  it("hides overlapping chrome and restores its inline declarations", () => {
    const bar = document.createElement("div");
    bar.id = "floating-bar";
    bar.setAttribute("style", "pointer-events: auto; color: red;");
    document.body.appendChild(bar);

    peek = createSidebarPeek({
      sidebar: { ...SIDEBAR, suppress: ["#floating-bar"] },
    });
    peek.bind(document);

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(bar.style.getPropertyValue("opacity")).toBe("0");
    expect(bar.style.getPropertyPriority("opacity")).toBe("important");
    expect(bar.style.getPropertyValue("pointer-events")).toBe("none");
    expect(bar.style.getPropertyValue("color")).toBe("red");

    dispatchPointer("pointerout", rail());
    vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS);
    expect(bar.style.getPropertyValue("opacity")).toBe("");
    expect(bar.style.getPropertyValue("pointer-events")).toBe("auto");
    expect(bar.style.getPropertyValue("color")).toBe("red");
  });

  it("expands through the native control and collapses on leave", () => {
    const open = document.createElement("button");
    open.id = "open-sidebar";
    const close = document.createElement("button");
    close.id = "close-sidebar";
    document.body.append(open, close);
    const openSpy = vi.spyOn(open, "click");
    const closeSpy = vi.spyOn(close, "click");

    peek = createSidebarPeek({
      sidebar: {
        ...SIDEBAR,
        nativeExpand: { expand: "#open-sidebar", collapse: "#close-sidebar" },
      },
    });
    peek.bind(document);

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).not.toHaveBeenCalled();

    dispatchPointer("pointerout", rail());
    vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps the peek open while the pointer still rests on the toggle", () => {
    const toggle = document.getElementById("toggle");
    if (!toggle) throw new Error("missing toggle");
    const chat = document.getElementById("chat");
    if (!chat) throw new Error("missing chat");
    const instance = start();

    dispatchPointer("pointerover", toggle);
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(instance.isPeeking()).toBe(true);

    const restore = stubHit(toggle);
    try {
      dispatchPointer("pointerout", toggle);
      vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS);
      expect(instance.isPeeking()).toBe(true);
    } finally {
      restore();
    }

    const restoreAgain = stubHit(chat);
    try {
      dispatchPointer("pointerout", toggle);
      vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS);
      expect(instance.isPeeking()).toBe(false);
    } finally {
      restoreAgain();
    }
  });
});

describe("sidebar peek platform coverage", () => {
  const covered = [
    "chatgpt",
    "gemini",
    "grok",
    "deepseek",
    "perplexity",
    "poe",
    "doubao",
    "yuanbao",
    "qwen",
    "qianwen",
    "glm",
    "zai",
    "copilot",
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
    expect(PLATFORMS.deepseek.sidebar?.revealRail).toBe(true);
    expect(PLATFORMS.deepseek.sidebar?.shift).toBe(-261);
    expect(PLATFORMS.deepseek.sidebar?.suppress).toContain(".ca6d4be1");
    expect(PLATFORMS.gemini.sidebar?.nativeExpand?.expand).toContain("打开边栏");
    expect(PLATFORMS.grok.sidebar?.nativeExpand?.expand).toContain("切换侧边栏");
    expect(PLATFORMS.grok.sidebar?.peekWidth).toBe(254);
    expect(PLATFORMS.poe.sidebar?.shift).toBe(-180);
    expect(PLATFORMS.poe.sidebar?.peekWidth).toBe(248);
    expect(PLATFORMS.doubao.sidebar?.revealRail).toBe(true);
    expect(PLATFORMS.doubao.sidebar?.peekWidth).toBe(280);
    expect(PLATFORMS.yuanbao.sidebar?.revealRail).toBe(true);
    expect(PLATFORMS.yuanbao.sidebar?.peekWidth).toBe(260);
    expect(PLATFORMS.qianwen.sidebar?.shift).toBe(-240);
    expect(PLATFORMS.qianwen.sidebar?.peekWidth).toBe(240);
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

