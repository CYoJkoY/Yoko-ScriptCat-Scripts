// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SIDEBAR_PEEK_ATTRIBUTE,
  SIDEBAR_PEEK_CLICK_RELEASE_MS,
  SIDEBAR_PEEK_HIDE_DELAY_MS,
  SIDEBAR_PEEK_HOLD_ATTRIBUTE,
  SIDEBAR_PEEK_KEYBOARD_FOCUS_MS,
  SIDEBAR_PEEK_NAVIGATION_COLLAPSE_MS,
  SIDEBAR_PEEK_NATIVE_OPEN_CHECK_MS,
  SIDEBAR_PEEK_NATIVE_OPEN_GRACE_MS,
  SIDEBAR_PEEK_OPEN_ATTEMPTS,
  SIDEBAR_PEEK_OPEN_RETRY_MS,
  SIDEBAR_PEEK_SHIFT_VAR,
  SIDEBAR_PEEK_SHOW_DELAY_MS,
  SIDEBAR_PEEK_TRANSITION_HOLD_MS,
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
  x = 0,
  y = 0,
): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    relatedTarget: related,
    clientX: x,
    clientY: y,
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

function start(options: { isUserKey?: (event: Event) => boolean } = {}): SidebarPeek {
  peek = createSidebarPeek({ sidebar: SIDEBAR, ...options });
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
    const instance = start({ isUserKey: () => true });
    const button = document.getElementById("new-chat");
    if (!button) throw new Error("missing button");

    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );
    button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(instance.isPeeking()).toBe(true);

    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(instance.isPeeking()).toBe(false);
  });

  it("ignores focus a pointer interaction moves into the rail", () => {
    const instance = start({ isUserKey: () => true });
    const history = document.getElementById("history");
    if (!history) throw new Error("missing history");

    // The site focuses the row it was clicked on. That focus is not a hover
    // and must not expand the rail the press just released.
    dispatchPointer("pointerdown", history);
    history.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(instance.isPeeking()).toBe(false);
  });

  it("ignores keyboard focus once the key is long gone", () => {
    const instance = start({ isUserKey: () => true });
    const button = document.getElementById("new-chat");
    if (!button) throw new Error("missing button");

    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );
    vi.advanceTimersByTime(SIDEBAR_PEEK_KEYBOARD_FOCUS_MS + 1);
    button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(instance.isPeeking()).toBe(false);
  });

  it("ignores an Escape the page dispatches from a script", () => {
    const instance = start();

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(instance.isPeeking()).toBe(true);

    // Perplexity clears a popup by sending Escape to the document; that is the
    // page talking to itself and must leave the peek alone.
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(instance.isPeeking()).toBe(true);
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
    stubNodeRect(menu, 180, 120, 600);
    document.body.appendChild(menu);
    const restore = stubHit(menu);

    try {
      dispatchPointer("pointerout", rail(), null, "mouse", 700, 400);
      vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS);
      expect(instance.isPeeking()).toBe(true);

      menu.remove();
      vi.advanceTimersByTime(400);
      expect(instance.isPeeking()).toBe(false);
    } finally {
      restore();
    }
  });

  it("does not hold for a menu the pointer never entered", () => {
    const instance = start();
    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);

    const chat = document.getElementById("chat");
    if (!chat) throw new Error("missing chat");
    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    stubNodeRect(menu, 180, 120, 700);
    document.body.appendChild(menu);
    const restore = stubHit(chat);

    try {
      dispatchPointer("pointerout", rail(), null, "mouse", 600, 400);
      vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS);
      expect(instance.isPeeking()).toBe(false);
    } finally {
      restore();
      menu.remove();
    }
  });

  it("does not hold for a page dialog that was already open", () => {
    const instance = start();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    stubNodeRect(dialog, 400, 282, 545);
    document.body.appendChild(dialog);
    const restore = stubHit(dialog);

    try {
      hoverButton();
      vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
      expect(instance.isPeeking()).toBe(true);

      dispatchPointer("pointerout", rail(), null, "mouse", 700, 400);
      vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS);
      expect(instance.isPeeking()).toBe(false);
    } finally {
      restore();
      dialog.remove();
    }
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
      "min-width: var(--ai-turbo-sidebar-peek-width, 248px) !important;",
    );
    expect(SIDEBAR_PEEK_CSS).toContain(
      "max-width: var(--ai-turbo-sidebar-peek-width, 248px) !important;",
    );
    expect(SIDEBAR_PEEK_CSS).toContain("box-sizing: border-box !important;");
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
    expect(SIDEBAR_PEEK_CSS).toContain(
      "[data-ai-turbo-sidebar-peek-hold] * {",
    );
    expect(SIDEBAR_PEEK_CSS).toContain(
      "transition: none !important;",
    );
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
    // The peek only presses controls the page paints, so the toggles need a box.
    stubNodeRect(open, 32, 32);
    stubNodeRect(close, 32, 32);
    // The site's own expand press is what widens the rail; the deferred
    // collapse is only pressed on a rail that is still expanded.
    open.addEventListener("click", () => stubRect("#rail", 248, 768));

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
    // The press waits for the restored layout, so it lands on the next task.
    vi.advanceTimersByTime(1);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("presses the painted collapse control when the site mounts a hidden copy", () => {
    const open = document.createElement("button");
    open.id = "open-sidebar";
    document.body.append(open);
    stubNodeRect(open, 32, 32);
    open.addEventListener("click", () => stubRect("#rail", 248, 768));

    // ChatGPT keeps the compact rail's header mounted next to the expanded
    // one: two buttons share the accessible name and only the second has a
    // box. The capture reads the first, so the release has to pick the one
    // the page actually paints or the press lands on nothing.
    const hidden = document.createElement("button");
    hidden.className = "close-sidebar";
    hidden.setAttribute("aria-label", "Hide sidebar");
    const painted = document.createElement("button");
    painted.className = "close-sidebar";
    painted.setAttribute("aria-label", "Hide sidebar");
    stubNodeRect(painted, 36, 36);
    rail().append(hidden, painted);
    const hiddenSpy = vi.spyOn(hidden, "click");
    const paintedSpy = vi.spyOn(painted, "click");

    peek = createSidebarPeek({
      sidebar: {
        ...SIDEBAR,
        nativeExpand: { expand: "#open-sidebar", collapse: ".close-sidebar" },
      },
    });
    peek.bind(document);

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(paintedSpy).not.toHaveBeenCalled();

    dispatchPointer("pointerout", rail());
    vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS);
    vi.advanceTimersByTime(1);
    expect(paintedSpy).toHaveBeenCalledTimes(1);
    expect(hiddenSpy).not.toHaveBeenCalled();
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
      // A real pointer over the chat column is far from the rail band; the
      // default event position would sit inside the peek and mask the move.
      dispatchPointer("pointerout", toggle, null, "mouse", 600, 300);
      vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS);
      expect(instance.isPeeking()).toBe(false);
    } finally {
      restoreAgain();
    }
  });
});

describe("sidebar peek approach lane", () => {
  it("opens from the edge lane when the rail is inset from the viewport", () => {
    // A floating rail 40px in leaves a 40px dead strip in front of it; the
    // pointer's approach from the edge used to stop before reaching the box.
    stubRect("#rail", 52, 768, 40);
    const instance = start();
    const chat = document.getElementById("chat");
    if (!chat) throw new Error("missing chat");

    dispatchPointerMove(20, 300, chat);
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(instance.isPeeking()).toBe(true);
  });

  it("ignores a pointer well inside the chat column", () => {
    const instance = start();
    const chat = document.getElementById("chat");
    if (!chat) throw new Error("missing chat");

    dispatchPointerMove(520, 300, chat);
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(instance.isPeeking()).toBe(false);
  });
});

describe("sidebar peek hover tracking", () => {
  it("keeps the peek while the pointer crosses a blank area inside the panel", () => {
    const instance = start();
    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    const chat = document.getElementById("chat");
    if (!chat) throw new Error("missing chat");

    // Hit testing reports the gap between two rows as nothing, and the inner
    // shell as a node the rail does not own. Neither is the pointer leaving.
    for (const hit of [null, chat]) {
      const restore = stubHit(hit);
      try {
        dispatchPointerMove(120, 300, chat);
        vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS + 50);
        expect(instance.isPeeking()).toBe(true);
      } finally {
        restore();
      }
    }
  });

  it("closes once the pointer leaves the band", () => {
    const instance = start();
    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    const chat = document.getElementById("chat");
    if (!chat) throw new Error("missing chat");

    const restore = stubHit(chat);
    try {
      dispatchPointerMove(600, 300, chat);
      vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS - 1);
      expect(instance.isPeeking()).toBe(true);

      vi.advanceTimersByTime(1);
      expect(instance.isPeeking()).toBe(false);
    } finally {
      restore();
    }
  });

  it("opens from the last move of a sweep that outruns the probe interval", () => {
    const instance = start();
    const chat = document.getElementById("chat");
    if (!chat) throw new Error("missing chat");

    // The first move misses the rail's vertical span and the second arrives
    // inside the probe interval. Dropping that second position is what left a
    // real approach without a peek, so the trailing probe has to read it.
    dispatchPointerMove(20, 900, chat);
    dispatchPointerMove(20, 400, chat);
    vi.advanceTimersByTime(400);

    expect(instance.isPeeking()).toBe(true);
  });

  it("closes when the pointer leaves the document", () => {
    const instance = start();
    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(instance.isPeeking()).toBe(true);

    const leave = new MouseEvent("pointerleave", { bubbles: false });
    Object.defineProperty(leave, "pointerType", { value: "mouse" });
    document.dispatchEvent(leave);
    vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS + 10);

    expect(instance.isPeeking()).toBe(false);
  });
});

describe("sidebar peek inner shells", () => {
  it("stretches a shell pinned to the collapsed width and restores it", () => {
    const node = rail();
    const shell = document.createElement("div");
    shell.id = "shell";
    shell.style.setProperty("width", "52px");
    shell.style.setProperty("max-width", "52px");
    shell.style.setProperty("color", "red");
    node.appendChild(shell);
    stubNodeRect(shell, 52, 768);

    peek = createSidebarPeek({
      sidebar: { ...SIDEBAR, peekWidth: 248, shells: ["#shell"] },
    });
    peek.bind(document);

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(shell.style.getPropertyValue("width")).toBe("248px");
    expect(shell.style.getPropertyValue("min-width")).toBe("248px");
    expect(shell.style.getPropertyValue("max-width")).toBe("248px");
    expect(shell.style.getPropertyPriority("min-width")).toBe("important");

    dispatchPointer("pointerout", node);
    vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS);
    expect(shell.style.getPropertyValue("width")).toBe("52px");
    expect(shell.style.getPropertyValue("max-width")).toBe("52px");
    expect(shell.style.getPropertyValue("min-width")).toBe("");
    expect(shell.style.getPropertyValue("color")).toBe("red");
  });

  it("keeps the peek alive while the pointer rests on a widened shell", () => {
    const node = rail();
    const shell = document.createElement("div");
    shell.id = "shell";
    node.appendChild(shell);
    stubNodeRect(shell, 248, 768);

    peek = createSidebarPeek({
      sidebar: { ...SIDEBAR, shells: ["#shell"] },
    });
    peek.bind(document);

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);

    const chat = document.getElementById("chat");
    if (!chat) throw new Error("missing chat");
    const restore = stubHit(chat);
    try {
      dispatchPointerMove(220, 300, chat);
      vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS + 50);
      expect(peek.isPeeking()).toBe(true);
    } finally {
      restore();
    }
  });

  it("restores the site's shell width when a refresh lifts it twice", async () => {
    const node = rail();
    const shell = document.createElement("div");
    shell.id = "shell";
    shell.style.setProperty("width", "52px");
    shell.style.setProperty("max-width", "52px");
    node.appendChild(shell);
    stubNodeRect(shell, 52, 768);

    peek = createSidebarPeek({
      sidebar: { ...SIDEBAR, peekWidth: 248, shells: ["#shell"] },
    });
    peek.bind(document);

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(shell.style.getPropertyValue("width")).toBe("248px");

    // The site's renderer strips the peek attribute as it re-renders. The
    // peek redeclares itself and stretches the same shell a second time, so
    // the second pass must not mistake the peek width for the site's own.
    node.removeAttribute(SIDEBAR_PEEK_ATTRIBUTE);
    node.appendChild(document.createElement("span"));
    await Promise.resolve();
    vi.advanceTimersByTime(0);
    expect(node.getAttribute(SIDEBAR_PEEK_ATTRIBUTE)).toBe("left");
    expect(shell.style.getPropertyValue("width")).toBe("248px");

    dispatchPointer("pointerout", node);
    vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS);
    expect(shell.style.getPropertyValue("width")).toBe("52px");
    expect(shell.style.getPropertyValue("max-width")).toBe("52px");
  });

});

describe("sidebar peek inline hidden content", () => {
  /**
   * A history column the site keeps mounted behind an inline rule, which is
   * how ChatGPT hides the expanded list inside its collapsed sidebar.
   */
  function hiddenColumn(): HTMLElement {
    const column = document.createElement("div");
    column.id = "column";
    column.style.setProperty("display", "none", "important");
    column.innerHTML =
      '<a href="#one">Older chat</a><a href="#two">Another chat</a>';
    rail().append(column);
    return column;
  }

  it("re-shows a column the site hides inline and puts the rule back", () => {
    const column = hiddenColumn();
    start();

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);

    expect(rail().getAttribute(SIDEBAR_PEEK_ATTRIBUTE)).toBe("left");
    expect(column.style.getPropertyValue("display")).toBe("");

    const button = document.getElementById("new-chat");
    if (!button) throw new Error("missing button");
    dispatchPointer("pointerout", button);
    vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS);

    expect(column.style.getPropertyValue("display")).toBe("none");
    expect(column.style.getPropertyPriority("display")).toBe("important");
  });

  it("re-shows the column when the site hides it after the peek opened", async () => {
    const column = hiddenColumn();
    start();

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(column.style.getPropertyValue("display")).toBe("");

    // The site renders from its own collapsed state and the rule comes back.
    column.style.setProperty("display", "none", "important");
    await Promise.resolve();
    vi.advanceTimersByTime(0);

    expect(column.style.getPropertyValue("display")).toBe("");
    expect(rail().getAttribute(SIDEBAR_PEEK_ATTRIBUTE)).toBe("left");
  });
});

describe("sidebar peek navigation release", () => {
  function nativeControls(): { open: HTMLElement; close: HTMLElement } {
    const open = document.createElement("button");
    open.id = "open-sidebar";
    const close = document.createElement("button");
    close.id = "close-sidebar";
    document.body.append(open, close);
    return { open, close };
  }

  it("retires before a history link navigates without pressing collapse", () => {
    const { close } = nativeControls();
    const closeSpy = vi.spyOn(close, "click");
    const instance = createSidebarPeek({
      sidebar: {
        ...SIDEBAR,
        nativeExpand: { expand: "#open-sidebar", collapse: "#close-sidebar" },
        // jsdom paints nothing, so no control is found and the native path
        // would retire immediately. This case covers the CSS fallback.
        nativeOnly: false,
      },
    });
    peek = instance;
    instance.bind(document);

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(peek.isPeeking()).toBe(true);
    expect(closeSpy).not.toHaveBeenCalled();

    const history = document.getElementById("history");
    if (!history) throw new Error("missing history");
    history.setAttribute("href", "/c/another-chat");
    // Keep jsdom from leaving the document; the peek's capture listener runs
    // before this bubble-phase handler either way.
    history.addEventListener("click", (event) => event.preventDefault());
    history.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    vi.advanceTimersByTime(SIDEBAR_PEEK_CLICK_RELEASE_MS);
    expect(peek.isPeeking()).toBe(false);
    expect(closeSpy).not.toHaveBeenCalled();
    expect(rail().style.getPropertyValue(SIDEBAR_PEEK_WIDTH_VAR)).toBe("");

    vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS * 2);
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it("drops a pending leave timer when the route changes", () => {
    const { close } = nativeControls();
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
    dispatchPointer("pointerout", rail());

    window.history.pushState({}, "", "/c/next-chat");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(peek.isPeeking()).toBe(false);
    expect(closeSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS * 2);
    expect(closeSpy).not.toHaveBeenCalled();
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
    expect(PLATFORMS.chatgpt.sidebar?.shells?.length ?? 0).toBeGreaterThan(0);
    expect(PLATFORMS.gemini.sidebar?.shells ?? []).toContain(
      ".sidenav-with-history-container",
    );
    // Z.ai renders its row actions from the expanded state only, so the peek
    // presses the site's own toggle and lets it lay the panel out; a fixed
    // margin would then cancel the site's own push.
    expect(PLATFORMS.zai.sidebar?.nativeExpand?.expand).toContain("切换侧边栏");
    expect(Object.hasOwn(PLATFORMS.zai.sidebar ?? {}, "shift")).toBe(false);
    expect(PLATFORMS.copilot.sidebar?.peekWidth).toBe(256);
    expect(PLATFORMS.deepseek.sidebar?.revealRail).toBe(true);
    expect(PLATFORMS.deepseek.sidebar?.shift).toBe(-261);
    expect(PLATFORMS.deepseek.sidebar?.suppress).toContain(".ca6d4be1");
    expect(PLATFORMS.gemini.sidebar?.nativeExpand?.expand).toContain("打开边栏");
    // The peek band has to match the column the native control paints.
    expect(PLATFORMS.gemini.sidebar?.peekWidth).toBe(288);
    expect(PLATFORMS.grok.sidebar?.nativeExpand?.expand).toContain("切换侧边栏");
    expect(PLATFORMS.grok.sidebar?.peekWidth).toBe(254);
    expect(PLATFORMS.poe.sidebar?.shift).toBe(-180);
    expect(PLATFORMS.poe.sidebar?.peekWidth).toBe(248);
    expect(PLATFORMS.doubao.sidebar?.revealRail).toBe(true);
    expect(PLATFORMS.doubao.sidebar?.peekWidth).toBe(280);
    expect(PLATFORMS.yuanbao.sidebar?.revealRail).toBe(true);
    expect(PLATFORMS.yuanbao.sidebar?.peekWidth).toBe(260);
    expect(PLATFORMS.yuanbao.sidebar?.nativeExpand?.expand).toContain("打开侧栏");
    expect(PLATFORMS.qwen.sidebar?.nativeExpand?.expand).toContain("切换侧边栏");
    expect(PLATFORMS.qianwen.sidebar?.shift).toBe(-240);
    expect(PLATFORMS.qianwen.sidebar?.peekWidth).toBe(240);
    // Copilot, Perplexity, Poe and GLM all mount their history rows only
    // after their own control opens the rail: widening the shell alone leaves
    // the compact markup with an empty column. Each one therefore carries a
    // native expand and collapse pair, in both the Chinese and English
    // accessible names the sites use.
    expect(PLATFORMS.copilot.sidebar?.nativeExpand?.expand).toContain("展开边栏");
    expect(PLATFORMS.copilot.sidebar?.nativeExpand?.collapse).toContain("折叠边栏");
    expect(PLATFORMS.perplexity.sidebar?.nativeExpand?.expand).toContain(
      "展开侧边栏",
    );
    expect(PLATFORMS.perplexity.sidebar?.nativeExpand?.collapse).toContain(
      "收起侧边栏",
    );
    expect(PLATFORMS.poe.sidebar?.nativeExpand?.expand).toContain(
      "切换侧边栏折叠",
    );
    // GLM paints two controls with the same class in its header; the search
    // button comes first, so the toggle has to exclude it or the peek opens a
    // search box and leaves the history rows at zero height.
    expect(PLATFORMS.glm.sidebar?.nativeExpand?.expand).toContain(
      ":not(.search-btn)",
    );
    expect(PLATFORMS.glm.sidebar?.nativeExpand?.collapse).toContain(
      ":not(.search-btn)",
    );
  });

  it("no longer declares Claude as a supported platform", () => {
    expect(Object.keys(PLATFORMS)).not.toContain("claude");
    expect(engineMeta.match.some((entry) => entry.includes("claude.ai"))).toBe(
      false,
    );
  });

  it("resolves the DeepSeek fallbacks to the rail, not the toolbar", () => {
    // DeepSeek rotates its hashed class names, so the fallbacks have to hold
    // on structure alone. The compact toolbar is also a second column of the
    // app row and is full of ds buttons: a positional fallback picked it up
    // and the peek widened a 114x40 control strip.
    document.body.innerHTML = `
      <div id="root">
        <div class="shell">
          <div class="middle">
            <div class="row">
              <div class="topbar"><div class="toolbar">
                <div class="ds-button" role="button">A</div>
                <div class="ds-button" role="button">B</div>
              </div></div>
              <div class="rail" style="display: none">
                <div class="header"><div class="actions">
                  <div class="ds-button" role="button">C</div>
                </div></div>
                <div class="ds-scroll-area">
                  <div>History</div>
                </div>
              </div>
              <div class="chat">
                <div class="message">
                  <div class="ds-markdown ds-assistant-message-main-content">
                    <div class="ds-scroll-area"><p>Answer</p></div>
                  </div>
                </div>
                <div class="code-block">
                  <div class="ds-scroll-area"><pre>code</pre></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    const railNode = document.querySelector(".rail");
    const sidebar = PLATFORMS.deepseek.sidebar;
    if (sidebar === undefined) throw new Error("missing DeepSeek sidebar");
    // The first selector targets the hashed classes; every fallback after it
    // must land on the same node.
    const fallbacks = sidebar.selectors.slice(1);
    expect(fallbacks.length).toBeGreaterThan(0);
    for (const selector of fallbacks) {
      const found = document.querySelectorAll(selector);
      expect(found.length, selector).toBe(1);
      expect(found[0], selector).toBe(railNode);
    }
    // The toolbar owns no scroller of its own, so no fallback can name it.
    for (const selector of fallbacks) {
      expect(
        document.querySelector(".topbar")?.matches(selector) ?? false,
        selector,
      ).toBe(false);
    }
    // A transcript body and a code scroller each own a ds-scroll-area too;
    // the fallback must not widen either when the hash classes rotate.
    for (const selector of fallbacks) {
      expect(
        document.querySelector(".chat")?.matches(selector) ?? false,
        selector,
      ).toBe(false);
      expect(
        document.querySelector(".code-block")?.matches(selector) ?? false,
        selector,
      ).toBe(false);
    }
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

describe("sidebar peek first approach", () => {
  it("opens from a pointer move that already lands on the rail", () => {
    const instance = start();
    const button = document.getElementById("new-chat");
    if (!button) throw new Error("missing button");

    // A zero-width rail is covered by a transparent overlay on Grok, so the
    // pointerover that used to arm the peek never names the rail.
    stubRect("#rail", 0, 768);
    dispatchPointerMove(10, 300, button);
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(instance.isPeeking()).toBe(true);
    expect(rail().getAttribute(SIDEBAR_PEEK_ATTRIBUTE)).toBe("left");
  });

  it("opens when the move lands on a trigger outside the rail", () => {
    const instance = start();
    const toggle = document.getElementById("toggle");
    if (!toggle) throw new Error("missing toggle");

    dispatchPointerMove(8, 300, toggle);
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(instance.isPeeking()).toBe(true);
  });
});

describe("sidebar peek rail replacement", () => {
  it("follows a rail the site rebuilt after its native toggle", () => {
    const open = document.createElement("button");
    open.id = "open-sidebar";
    const close = document.createElement("button");
    close.id = "close-sidebar";
    document.body.append(open, close);
    const closeSpy = vi.spyOn(close, "click");
    stubNodeRect(open, 32, 32);
    stubNodeRect(close, 32, 32);
    open.addEventListener("click", () => {
      const old = rail();
      const fresh = document.createElement("nav");
      fresh.id = "rail";
      fresh.innerHTML = `
        <button id="new-chat">New chat</button>
        <a id="history" href="#history">History</a>
      `;
      stubNodeRect(fresh, 248, 768);
      old.replaceWith(fresh);
    });

    peek = createSidebarPeek({
      sidebar: {
        ...SIDEBAR,
        nativeExpand: { expand: "#open-sidebar", collapse: "#close-sidebar" },
        // The assertions below describe the CSS fallback: the native path
        // never marks the rail, because the site itself owns the expansion.
        nativeOnly: false,
      },
    });
    peek.bind(document);

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    vi.advanceTimersByTime(32);

    const fresh = rail();
    expect(fresh.getAttribute(SIDEBAR_PEEK_ATTRIBUTE)).toBe("left");
    expect(fresh.style.getPropertyValue(SIDEBAR_PEEK_WIDTH_VAR)).toBe("248px");
    expect(closeSpy).not.toHaveBeenCalled();

    dispatchPointer("pointerout", fresh);
    vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS);
    vi.advanceTimersByTime(1);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("restores the attribute when the site rewrites the rail style", async () => {
    const instance = start();
    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);

    const node = rail();
    node.removeAttribute(SIDEBAR_PEEK_ATTRIBUTE);
    node.classList.toggle("rerendered");
    await Promise.resolve();
    await Promise.resolve();

    expect(node.getAttribute(SIDEBAR_PEEK_ATTRIBUTE)).toBe("left");
    expect(instance.isPeeking()).toBe(true);
  });
});

describe("sidebar peek content shells", () => {
  function nativeControls(): { open: HTMLElement; close: HTMLElement } {
    const open = document.createElement("button");
    open.id = "open-sidebar";
    const close = document.createElement("button");
    close.id = "close-sidebar";
    document.body.append(open, close);
    stubNodeRect(open, 32, 32);
    stubNodeRect(close, 32, 32);
    return { open, close };
  }

  function nativePeek(): SidebarPeek {
    return createSidebarPeek({
      sidebar: {
        ...SIDEBAR,
        nativeExpand: { expand: "#open-sidebar", collapse: "#close-sidebar" },
      },
    });
  }

  it("retires when the pressed control never paints the panel", () => {
    const { close } = nativeControls();
    const closeSpy = vi.spyOn(close, "click");
    // The control is painted but its press reaches no handler: Qwen's
    // collapsed rail keeps a toggle that some routes leave inert.
    peek = nativePeek();
    peek.bind(document);

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(peek.isPeeking()).toBe(true);

    vi.advanceTimersByTime(SIDEBAR_PEEK_NATIVE_OPEN_CHECK_MS);
    expect(peek.isPeeking()).toBe(true);
    vi.advanceTimersByTime(SIDEBAR_PEEK_NATIVE_OPEN_CHECK_MS);

    expect(peek.isPeeking()).toBe(false);
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it("keeps a peek the site painted open", () => {
    const { open, close } = nativeControls();
    const closeSpy = vi.spyOn(close, "click");
    open.addEventListener("click", () => stubRect("#rail", 248, 768));
    peek = nativePeek();
    peek.bind(document);

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    vi.advanceTimersByTime(SIDEBAR_PEEK_NATIVE_OPEN_CHECK_MS * 2);
    expect(peek.isPeeking()).toBe(true);
    expect(closeSpy).not.toHaveBeenCalled();

    dispatchPointer("pointerout", rail());
    vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS);
    expect(peek.isPeeking()).toBe(false);
    // The press waits for the restored layout, so it lands on the next task.
    vi.advanceTimersByTime(1);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("drops a peek when a replacement rail is already collapsed", async () => {
    const { open, close } = nativeControls();
    const closeSpy = vi.spyOn(close, "click");
    open.addEventListener("click", () => stubRect("#rail", 248, 768));
    peek = nativePeek();
    peek.bind(document);

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(peek.isPeeking()).toBe(true);

    // A history jump replaces the rail with the site's collapsed copy. The
    // press that opened the old node no longer describes this one, so the
    // peek must not carry the expansion into it.
    vi.advanceTimersByTime(SIDEBAR_PEEK_NATIVE_OPEN_GRACE_MS + 200);
    const old = rail();
    const fresh = document.createElement("nav");
    fresh.id = "rail";
    fresh.innerHTML = `
      <button id="new-chat">New chat</button>
      <a id="history" href="#history">History</a>
    `;
    stubNodeRect(fresh, 52, 768);
    old.replaceWith(fresh);
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(32);

    expect(peek.isPeeking()).toBe(false);
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it("follows a replacement rail the site rendered open", async () => {
    const { open, close } = nativeControls();
    const closeSpy = vi.spyOn(close, "click");
    open.addEventListener("click", () => {
      const old = rail();
      const fresh = document.createElement("nav");
      fresh.id = "rail";
      fresh.innerHTML = `
        <button id="new-chat">New chat</button>
        <a id="history" href="#history">History</a>
      `;
      stubNodeRect(fresh, 248, 768);
      old.replaceWith(fresh);
    });
    peek = nativePeek();
    peek.bind(document);

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(32);

    expect(peek.isPeeking()).toBe(true);
    vi.advanceTimersByTime(SIDEBAR_PEEK_NATIVE_OPEN_CHECK_MS);
    expect(peek.isPeeking()).toBe(true);

    dispatchPointer("pointerout", rail());
    vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS);
    expect(peek.isPeeking()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  function shellWithRows(width: number): HTMLElement {
    const shell = document.createElement("div");
    shell.id = "shell";
    shell.innerHTML = `
      <a href="#one">First chat</a>
      <a href="#two">Second chat</a>
    `;
    rail().appendChild(shell);
    stubNodeRect(shell, width, 768);
    return shell;
  }

  it("stretches a narrow wrapper around the history rows without config", () => {
    const shell = shellWithRows(52);
    peek = createSidebarPeek({ sidebar: SIDEBAR });
    peek.bind(document);

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(shell.style.getPropertyValue("width")).toBe("248px");
    expect(shell.style.getPropertyPriority("width")).toBe("important");

    dispatchPointer("pointerout", rail());
    vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS);
    expect(shell.style.getPropertyValue("width")).toBe("");
  });

  it("keeps the peek while the pointer rests on a widened wrapper", () => {
    const shell = shellWithRows(52);
    peek = createSidebarPeek({ sidebar: SIDEBAR });
    peek.bind(document);

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    stubNodeRect(shell, 248, 768);

    const restore = stubHit(null);
    try {
      dispatchPointerMove(200, 300, shell);
      vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS + 50);
      expect(peek.isPeeking()).toBe(true);
    } finally {
      restore();
    }
  });

  it("reveals leaf labels the site removed from layout", () => {
    const shell = document.createElement("div");
    shell.id = "shell";
    const link = document.createElement("a");
    link.href = "#row";
    const label = document.createElement("span");
    label.textContent = "Long chat title";
    label.style.setProperty("display", "none");
    link.appendChild(label);
    const second = document.createElement("a");
    second.href = "#other";
    second.textContent = "Another";
    shell.append(link, second);
    rail().appendChild(shell);
    stubNodeRect(shell, 52, 768);

    peek = createSidebarPeek({ sidebar: SIDEBAR });
    peek.bind(document);
    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(label.style.getPropertyValue("display")).toBe("block");

    dispatchPointer("pointerout", rail());
    vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS);
    expect(label.style.getPropertyValue("display")).toBe("none");
  });
});

describe("sidebar peek navigation collapse", () => {
  it("closes the panel it expanded right after a history jump", () => {
    const open = document.createElement("button");
    open.id = "open-sidebar";
    const close = document.createElement("button");
    close.id = "close-sidebar";
    document.body.append(open, close);
    const closeSpy = vi.spyOn(close, "click");
    stubNodeRect(open, 32, 32);
    stubNodeRect(close, 32, 32);
    open.addEventListener("click", () => stubRect("#rail", 248, 768));

    peek = createSidebarPeek({
      sidebar: {
        ...SIDEBAR,
        nativeExpand: { expand: "#open-sidebar", collapse: "#close-sidebar" },
      },
    });
    peek.bind(document);

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    const history = document.getElementById("history");
    if (!history) throw new Error("missing history");
    history.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    // The press navigates to the row's own hash. The route change retires the
    // peek on its own task, before the site's collapse transition has played
    // out, and the deferred press waits that transition before landing.
    vi.advanceTimersByTime(1);
    expect(peek.isPeeking()).toBe(false);
    vi.advanceTimersByTime(SIDEBAR_PEEK_NAVIGATION_COLLAPSE_MS - 2);
    expect(closeSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("leaves a panel the site is already closing alone", () => {
    const open = document.createElement("button");
    open.id = "open-sidebar";
    const close = document.createElement("button");
    close.id = "close-sidebar";
    document.body.append(open, close);
    stubNodeRect(open, 32, 32);
    stubNodeRect(close, 32, 32);
    const closeSpy = vi.spyOn(close, "click");
    open.addEventListener("click", () => stubRect("#rail", 248, 768));

    peek = createSidebarPeek({
      sidebar: {
        ...SIDEBAR,
        nativeExpand: { expand: "#open-sidebar", collapse: "#close-sidebar" },
      },
    });
    peek.bind(document);

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    const history = document.getElementById("history");
    if (!history) throw new Error("missing history");
    history.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    // The site reacts to the same press by animating its own collapse. The
    // deferred press used to toggle again mid-transition, which restarted the
    // animation from its current width: the stall a history jump left behind.
    stubRect("#rail", 200, 768);
    vi.advanceTimersByTime(SIDEBAR_PEEK_NAVIGATION_COLLAPSE_MS);
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it("waits for the pointer to leave before peeking again after a jump", () => {
    const instance = start();
    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(instance.isPeeking()).toBe(true);

    const history = document.getElementById("history");
    if (!history) throw new Error("missing history");
    history.setAttribute("href", "/c/another-chat");
    history.addEventListener("click", (event) => event.preventDefault());
    history.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    vi.advanceTimersByTime(SIDEBAR_PEEK_CLICK_RELEASE_MS);
    expect(instance.isPeeking()).toBe(false);

    // The pointer still rests on the row it pressed. Re-arming there reopened
    // the rail the site was closing and the panel pumped open and shut.
    const button = document.getElementById("new-chat");
    if (!button) throw new Error("missing button");
    dispatchPointer("pointerover", button);
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS * 2);
    expect(instance.isPeeking()).toBe(false);

    const chat = document.getElementById("chat");
    if (!chat) throw new Error("missing chat");
    dispatchPointerMove(600, 300, chat);
    dispatchPointer("pointerover", button);
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(instance.isPeeking()).toBe(true);
  });
});

describe("sidebar peek native expansion", () => {
  function paintsControls(): { open: HTMLElement; close: HTMLElement } {
    const open = document.createElement("button");
    open.id = "open-sidebar";
    const close = document.createElement("button");
    close.id = "close-sidebar";
    document.body.append(open, close);
    stubNodeRect(open, 32, 32);
    stubNodeRect(close, 32, 32);
    return { open, close };
  }

  it("opens the site panel and writes no geometry of its own", () => {
    const { open, close } = paintsControls();
    const openSpy = vi.spyOn(open, "click");
    const closeSpy = vi.spyOn(close, "click");
    open.addEventListener("click", () => stubRect("#rail", 248, 768));

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
    expect(peek.isPeeking()).toBe(true);
    const node = rail();
    expect(node.getAttribute(SIDEBAR_PEEK_ATTRIBUTE)).toBeNull();
    expect(node.style.getPropertyValue(SIDEBAR_PEEK_WIDTH_VAR)).toBe("");
    expect(node.style.getPropertyValue(SIDEBAR_PEEK_SHIFT_VAR)).toBe("");

    dispatchPointer("pointerout", node);
    vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS);
    expect(peek.isPeeking()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("waits for an open control the site paints on a later frame", () => {
    // Gemini mounts the control a render after the pointer lands, so a single
    // lookup reads a rail that is still empty and drops a hover it could show.
    const open = document.createElement("button");
    open.id = "open-sidebar";
    document.body.append(open);

    peek = createSidebarPeek({
      sidebar: {
        ...SIDEBAR,
        nativeExpand: { expand: "#open-sidebar", collapse: "#close-sidebar" },
      },
    });
    peek.bind(document);

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(peek.isPeeking()).toBe(true);

    const openSpy = vi.spyOn(open, "click");
    stubNodeRect(open, 32, 32);
    vi.advanceTimersByTime(SIDEBAR_PEEK_OPEN_RETRY_MS);
    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  it("gives up when the control never becomes paintable", () => {
    const open = document.createElement("button");
    open.id = "open-sidebar";
    document.body.append(open);

    peek = createSidebarPeek({
      sidebar: {
        ...SIDEBAR,
        nativeExpand: { expand: "#open-sidebar", collapse: "#close-sidebar" },
      },
    });
    peek.bind(document);

    hoverButton();
    vi.advanceTimersByTime(
      SIDEBAR_PEEK_SHOW_DELAY_MS +
        SIDEBAR_PEEK_OPEN_ATTEMPTS * SIDEBAR_PEEK_OPEN_RETRY_MS,
    );

    expect(peek.isPeeking()).toBe(false);
    expect(rail().getAttribute(SIDEBAR_PEEK_ATTRIBUTE)).toBeNull();
  });

  it("skips the expand press on a rail the site already opened", () => {
    const open = document.createElement("button");
    open.id = "open-sidebar";
    document.body.append(open);
    stubNodeRect(open, 32, 32);
    const openSpy = vi.spyOn(open, "click");
    // ChatGPT and Qwen keep the collapsed state class until their own width
    // animation ends, so a visibly open rail still reads `collapsed`. Pressing
    // expand there replayed the site's expanded render over the peek.
    rail().className = "collapsed";
    stubRect("#rail", 288, 768);

    peek = createSidebarPeek({
      sidebar: {
        ...SIDEBAR,
        nativeExpand: { expand: "#open-sidebar", collapse: "#close-sidebar" },
      },
    });
    peek.bind(document);

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);

    expect(openSpy).not.toHaveBeenCalled();
    expect(peek.isPeeking()).toBe(false);
  });

  it("opens a rail whose expanded class outlived the site's collapse", () => {
    const open = document.createElement("button");
    open.id = "open-sidebar";
    document.body.append(open);
    stubNodeRect(open, 32, 32);
    open.addEventListener("click", () => stubRect("#rail", 248, 768));
    const openSpy = vi.spyOn(open, "click");
    rail().className = "sidenav-open";
    stubRect("#rail", 52, 768);

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
    expect(peek.isPeeking()).toBe(true);
  });

  it("keeps the peek while the site's panel paints no box", () => {
    const open = document.createElement("button");
    open.id = "open-sidebar";
    const close = document.createElement("button");
    close.id = "close-sidebar";
    document.body.append(open, close);
    stubNodeRect(open, 32, 32);
    stubNodeRect(close, 32, 32);
    const closeSpy = vi.spyOn(close, "click");
    open.addEventListener("click", () => stubRect("#rail", 248, 768));

    peek = createSidebarPeek({
      sidebar: {
        ...SIDEBAR,
        nativeExpand: { expand: "#open-sidebar", collapse: "#close-sidebar" },
      },
    });
    peek.bind(document);

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(peek.isPeeking()).toBe(true);

    const chat = document.getElementById("chat");
    if (!chat) throw new Error("missing chat");
    // Yuanbao slides the rail fully past the edge and Grok keeps a zero-width
    // slot for it. The pointer still rests on the panel the user can see, so
    // the box it was last painted at has to keep answering for it.
    stubRect("#rail", 0, 768);
    const restore = stubHit(document.body);
    try {
      dispatchPointerMove(120, 300, chat);
      vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS + 50);
      expect(peek.isPeeking()).toBe(true);
      expect(closeSpy).not.toHaveBeenCalled();

      dispatchPointerMove(600, 300, chat);
      vi.advanceTimersByTime(SIDEBAR_PEEK_HIDE_DELAY_MS + 50);
      expect(peek.isPeeking()).toBe(false);
    } finally {
      restore();
    }
  });
});

describe("sidebar peek instant release", () => {
  it("retires on a history row rendered as a plain button", () => {
    const instance = start();

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);
    expect(instance.isPeeking()).toBe(true);

    const row = document.createElement("button");
    row.textContent = "Older conversation";
    rail().append(row);
    row.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    // Sites such as Z.ai navigate from their own handler, so there is no
    // href to wait on. The release is read one beat after the press, which is
    // still well before the route paints, and it must not stay pending.
    expect(instance.isPeeking()).toBe(true);
    vi.advanceTimersByTime(SIDEBAR_PEEK_CLICK_RELEASE_MS);
    expect(instance.isPeeking()).toBe(false);
    expect(rail().style.getPropertyValue(SIDEBAR_PEEK_WIDTH_VAR)).toBe("");
  });

  it("keeps the peek when an unannotated press opens a menu", () => {
    const instance = start();

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);

    // Qwen mounts its history row menu on a plain button that carries only an
    // aria-label, so nothing in the markup says a menu is coming.
    const trigger = document.createElement("button");
    trigger.setAttribute("aria-label", "Chat Menu");
    rail().append(trigger);
    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    const dropdown = document.createElement("div");
    dropdown.className = "ant-dropdown";
    const item = document.createElement("div");
    item.textContent = "Delete";
    dropdown.append(item);
    document.body.append(dropdown);
    stubNodeRect(dropdown, 120, 90, 200);

    vi.advanceTimersByTime(SIDEBAR_PEEK_CLICK_RELEASE_MS);

    // The dropdown the press produced is the user still working in the panel.
    expect(instance.isPeeking()).toBe(true);
    expect(rail().style.getPropertyValue(SIDEBAR_PEEK_WIDTH_VAR)).not.toBe("");
  });

  it("keeps the peek when the press opens a menu", () => {
    const instance = start();

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);

    const menu = document.createElement("button");
    menu.setAttribute("aria-haspopup", "menu");
    menu.textContent = "More";
    rail().append(menu);
    menu.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    // Releasing here would tear down the rail the menu is anchored to.
    expect(instance.isPeeking()).toBe(true);
  });

  it("suspends the site transition for the release and gives it back", () => {
    const instance = start();
    rail().style.setProperty("transition", "width 300ms ease");

    hoverButton();
    vi.advanceTimersByTime(SIDEBAR_PEEK_SHOW_DELAY_MS);

    const history = document.getElementById("history");
    if (!history) throw new Error("missing history");
    history.setAttribute("href", "/c/another-chat");
    history.addEventListener("click", (event) => event.preventDefault());
    history.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    // Without this the restored width animates back over the conversation the
    // click just opened, which is the lag this module has to avoid. The rail's
    // own declaration is back before the press returns; the subtree stays
    // quiet only until the site has applied its collapsed width.
    vi.advanceTimersByTime(SIDEBAR_PEEK_CLICK_RELEASE_MS);
    expect(instance.isPeeking()).toBe(false);
    expect(rail().style.getPropertyValue("transition")).toBe(
      "width 300ms ease",
    );
    expect(rail().style.getPropertyPriority("transition")).toBe("");
    expect(rail().hasAttribute(SIDEBAR_PEEK_HOLD_ATTRIBUTE)).toBe(true);

    vi.advanceTimersByTime(SIDEBAR_PEEK_TRANSITION_HOLD_MS);
    expect(rail().hasAttribute(SIDEBAR_PEEK_HOLD_ATTRIBUTE)).toBe(false);
  });
});

