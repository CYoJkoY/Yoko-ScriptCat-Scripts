// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { STYLE_ID } from "../scripts/ai-chat-turbo-engine/src/config";
import {
  GEMINI_NATIVE_RENDER_CSS,
  injectEngineStyles,
} from "../scripts/ai-chat-turbo-engine/src/ui/styles";

function readStyleText(): string {
  const node = document.getElementById(STYLE_ID);
  expect(node).not.toBeNull();
  return node?.textContent ?? "";
}

function normalize(css: string): string {
  return css.replace(/\s+/g, " ").trim();
}

function selectorsOf(css: string): string[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return Array.from(withoutComments.matchAll(/([^{}]+)\{/g)).map((match) =>
    (match[1] ?? "").replace(/\s+/g, " ").trim(),
  );
}

const CONTENT_SELECTOR =
  "model-response :is(.markdown, message-content, .message-content, .response-content, .md-content, .model-response-text)";
const SIDEBAR_EFFECT_SELECTORS =
  "bard-sidenav, bard-sidenav side-navigation, side-navigation, side-navigation-content, sidenav-with-history-container, conversations-list";
const SIDEBAR_CONTAIN_SELECTORS =
  "side-navigation-content, sidenav-with-history-container, conversations-list, conversations-list > *";
const EXPECTED_SELECTORS = [
  `${CONTENT_SELECTOR} > *`,
  `${CONTENT_SELECTOR} > :is(pre, table, blockquote)`,
  `${CONTENT_SELECTOR} > :is(img, video, canvas, iframe)`,
  "model-response code-block",
  ":is(top-bar, top-bar-actions, input-area, input-area-v2, side-navigation, chat-window, mat-toolbar, code-block, .top-bar, .input-area, .toolbar)",
  `${CONTENT_SELECTOR}, ${CONTENT_SELECTOR} *`,
  SIDEBAR_EFFECT_SELECTORS,
  "bard-sidenav",
  SIDEBAR_CONTAIN_SELECTORS,
];

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("Gemini native message render isolation", () => {
  it("adds every Gemini rule to the engine stylesheet", () => {
    injectEngineStyles({ geminiNativeRender: true });

    const css = normalize(readStyleText());
    expect(css).toContain(
      `${CONTENT_SELECTOR} > * { content-visibility: auto !important; contain: layout style !important; contain-intrinsic-size: auto 3rem !important; }`,
    );
    expect(css).toContain(
      `${CONTENT_SELECTOR} > :is(pre, table, blockquote) { contain-intrinsic-size: auto 8rem !important; }`,
    );
    expect(css).toContain(
      `${CONTENT_SELECTOR} > :is(img, video, canvas, iframe) { contain-intrinsic-size: auto 12rem !important; }`,
    );
    expect(css).toContain(
      "model-response code-block { content-visibility: auto !important; contain: layout style !important; contain-intrinsic-size: auto 10rem !important; }",
    );
    expect(css).toContain(
      `${EXPECTED_SELECTORS[4]} { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }`,
    );
    expect(css).toContain(
      `${EXPECTED_SELECTORS[5]} { animation: none !important; transition: none !important; will-change: auto !important; }`,
    );
    expect(css).toContain(
      `${SIDEBAR_EFFECT_SELECTORS} { box-shadow: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }`,
    );
    expect(css).toContain(
      "bard-sidenav { transition-duration: 120ms !important; transition-timing-function: cubic-bezier(0.2, 0, 0, 1) !important; }",
    );
    expect(css).toContain(
      `${SIDEBAR_CONTAIN_SELECTORS} { contain: layout style !important; }`,
    );
  });

  it("keeps the Gemini rules out of every other platform", () => {
    injectEngineStyles();
    const defaultCss = readStyleText();
    expect(defaultCss).not.toContain("model-response");
    expect(defaultCss).not.toContain("content-visibility: auto");

    injectEngineStyles({ geminiNativeRender: false });
    expect(readStyleText()).toBe(defaultCss);
  });

  it("reuses one style node and rewrites it in place", () => {
    injectEngineStyles({ geminiNativeRender: true });
    const first = document.getElementById(STYLE_ID);
    expect(document.querySelectorAll(`#${STYLE_ID}`)).toHaveLength(1);

    injectEngineStyles({ geminiNativeRender: true });
    expect(document.querySelectorAll(`#${STYLE_ID}`)).toHaveLength(1);
    expect(document.getElementById(STYLE_ID)).toBe(first);

    injectEngineStyles({ geminiNativeRender: false });
    expect(document.getElementById(STYLE_ID)).toBe(first);
    expect(first?.textContent).not.toContain("model-response");

    injectEngineStyles({ geminiNativeRender: true });
    expect(document.getElementById(STYLE_ID)).toBe(first);
    expect(first?.textContent).toContain(`${CONTENT_SELECTOR} > *`);
  });

  it("restores the stylesheet after the host drops the style node", () => {
    injectEngineStyles({ geminiNativeRender: true });
    document.getElementById(STYLE_ID)?.remove();

    injectEngineStyles({ geminiNativeRender: true });
    const restored = document.getElementById(STYLE_ID);
    expect(restored).not.toBeNull();
    expect(restored?.textContent).toContain("model-response code-block");
  });

  it("keeps dehydration pinned to content-visibility hidden", () => {
    injectEngineStyles({ geminiNativeRender: true });
    const css = normalize(readStyleText());

    expect(css).toContain(
      ".ai-turbo-dehydrated { content-visibility: hidden !important; contain: layout paint style !important;",
    );
    expect(css).not.toContain(".ai-turbo-dehydrated { content-visibility: auto");
  });

  it("scopes isolation to block content and never to a whole turn", () => {
    const selectors = selectorsOf(GEMINI_NATIVE_RENDER_CSS);
    expect(selectors).toEqual(EXPECTED_SELECTORS);
    expect(GEMINI_NATIVE_RENDER_CSS.match(/content-visibility/g)).toHaveLength(2);
    expect(GEMINI_NATIVE_RENDER_CSS).not.toMatch(
      /(?:^|\n)\s*(?:model-response|user-query)\s*\{/
    );
    for (const selector of selectors) {
      expect(selector).not.toBe("model-response");
      expect(selector).not.toBe("user-query");
      expect(selector.startsWith("model-response >")).toBe(false);
    }
  });

  it("hides nothing and drops no content", () => {
    injectEngineStyles({ geminiNativeRender: true });
    const css = readStyleText();

    expect(css).not.toMatch(/display\s*:\s*none/i);
    expect(GEMINI_NATIVE_RENDER_CSS).not.toMatch(/display\s*:/i);
    expect(GEMINI_NATIVE_RENDER_CSS).not.toMatch(/[;{\n]\s*(?:visibility|opacity)\s*:/i);
    expect(GEMINI_NATIVE_RENDER_CSS).not.toMatch(
      /content-visibility\s*:\s*hidden/i,
    );
    // Paint containment on a whole turn would clip native menus and focus rings.
    expect(GEMINI_NATIVE_RENDER_CSS).not.toMatch(/contain\s*:[^;]*\bpaint\b/i);
    expect(GEMINI_NATIVE_RENDER_CSS).not.toMatch(
      /contain\s*:\s*(?:strict|content)\b/i,
    );
    // The history list keeps its native height estimate: contain-intrinsic-size
    // would make its scrollbar jump while rows mount during the sidebar motion.
    expect(GEMINI_NATIVE_RENDER_CSS).not.toMatch(
      /conversations-list[^{]*\{[^}]*content-visibility/,
    );
  });
});
