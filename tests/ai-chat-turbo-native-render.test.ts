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
  return Array.from(css.matchAll(/([^{}]+)\{/g)).map((match) =>
    (match[1] ?? "").replace(/\s+/g, " ").trim(),
  );
}

const EXPECTED_SELECTORS = [
  "model-response .markdown > *",
  "model-response .markdown > :is(pre, table, blockquote)",
  "model-response .markdown > :is(img, video, canvas, iframe)",
  "model-response code-block",
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
      "model-response .markdown > * { content-visibility: auto !important; contain-intrinsic-size: auto 3rem !important; }",
    );
    expect(css).toContain(
      "model-response .markdown > :is(pre, table, blockquote) { contain-intrinsic-size: auto 8rem !important; }",
    );
    expect(css).toContain(
      "model-response .markdown > :is(img, video, canvas, iframe) { contain-intrinsic-size: auto 12rem !important; }",
    );
    expect(css).toContain(
      "model-response code-block { content-visibility: auto !important; contain-intrinsic-size: auto 10rem !important; }",
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
    expect(first?.textContent).toContain("model-response .markdown > *");
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

  it("scopes isolation to markdown blocks and code blocks only", () => {
    expect(selectorsOf(GEMINI_NATIVE_RENDER_CSS)).toEqual(EXPECTED_SELECTORS);
    expect(GEMINI_NATIVE_RENDER_CSS.match(/content-visibility/g)).toHaveLength(2);
    for (const selector of selectorsOf(GEMINI_NATIVE_RENDER_CSS)) {
      expect(selector === "model-response" || selector === "user-query").toBe(false);
      expect(selector.startsWith("model-response .markdown > ") || selector === "model-response code-block").toBe(true);
    }
  });

  it("hides nothing and drops no content", () => {
    injectEngineStyles({ geminiNativeRender: true });
    const css = readStyleText();

    expect(css).not.toMatch(/display\s*:\s*none/i);
    expect(GEMINI_NATIVE_RENDER_CSS).not.toMatch(/display\s*:/i);
    expect(GEMINI_NATIVE_RENDER_CSS).not.toMatch(/[;{\n]\s*(?:visibility|opacity)\s*:/i);
    // Paint containment on a whole turn would clip native menus and focus rings.
    expect(GEMINI_NATIVE_RENDER_CSS).not.toMatch(/contain\s*:|content-visibility\s*:\s*hidden/i);
  });
});
