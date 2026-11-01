// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";

interface RuleRecord {
  selector: string;
  style: CSSStyleDeclaration;
  media: string;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

const BASE_GATE = ":root";
const DARK_GATE = ':root.heybox-up-theme[data-heybox-up-dark="true"]';

const REQUIRED_TOKENS = [
  "bg",
  "page",
  "subtle",
  "ink",
  "ink-2",
  "muted",
  "border",
  "glow",
  "accent",
  "on-accent",
  "link",
  "glass",
  "glass-ink",
  "glass-border",
  "head",
  "float",
  "float-ink",
  "float-border",
  "float-hover",
  "float-muted",
  "active-like",
  "active-favour",
  "active-cy",
  "danger",
  "shadow",
  "scrim",
] as const;

type TokenName = (typeof REQUIRED_TOKENS)[number];

function collectRules(css: string): RuleRecord[] {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  const sheet = style.sheet;
  if (sheet === null) throw new Error("Expected a style sheet for the reader CSS");
  const collected: RuleRecord[] = [];
  const visit = (rules: CSSRuleList, media: string): void => {
    for (const rule of rules) {
      if (rule instanceof CSSMediaRule) {
        visit(rule.cssRules, rule.conditionText);
        continue;
      }
      if (!(rule instanceof CSSStyleRule)) continue;
      collected.push({ selector: rule.selectorText, style: rule.style, media });
    }
  };
  visit(sheet.cssRules, "");
  style.remove();
  return collected;
}

function ruleFor(rules: RuleRecord[], selector: string): RuleRecord {
  const found = rules.find((rule) => rule.selector === selector && rule.media === "");
  if (found === undefined) throw new Error("Missing reader rule: " + selector);
  return found;
}

function tokenMap(rule: RuleRecord): Map<string, string> {
  const map = new Map<string, string>();
  for (const name of REQUIRED_TOKENS) {
    const value = rule.style.getPropertyValue("--hbu-reader-" + name).trim();
    if (value !== "") map.set(name, value);
  }
  return map;
}

function presetTokens(rules: RuleRecord[], preset: string): Map<string, string> {
  const merged = new Map<string, string>(tokenMap(ruleFor(rules, BASE_GATE)));
  if (preset === "dark" || preset === "oled") {
    for (const [key, value] of tokenMap(ruleFor(rules, DARK_GATE))) merged.set(key, value);
  }
  if (preset !== "light" && preset !== "dark") {
    const gate = ':root.heybox-up-theme[data-heybox-up-theme="' + preset + '"]';
    for (const [key, value] of tokenMap(ruleFor(rules, gate))) merged.set(key, value);
  }
  return merged;
}

function parseColor(value: string): Rgb {
  const input = value.trim().toLowerCase();
  if (input.startsWith("#")) {
    const hex = input.slice(1);
    const expand = (part: string): number => Number.parseInt(part.length === 1 ? part + part : part, 16);
    if (hex.length === 3 || hex.length === 4) {
      return { r: expand(hex[0] ?? ""), g: expand(hex[1] ?? ""), b: expand(hex[2] ?? ""), a: 1 };
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: Number.parseInt(hex.slice(0, 2), 16),
        g: Number.parseInt(hex.slice(2, 4), 16),
        b: Number.parseInt(hex.slice(4, 6), 16),
        a: 1,
      };
    }
    throw new Error("Unsupported hex color: " + value);
  }
  const match = /^rgba?\(([^)]+)\)$/.exec(input);
  if (match === null) throw new Error("Unsupported color: " + value);
  const parts = (match[1] ?? "").split(",").map((part) => part.trim());
  const channel = (part: string | undefined): number => Number.parseFloat(part ?? "0");
  return { r: channel(parts[0]), g: channel(parts[1]), b: channel(parts[2]), a: parts.length > 3 ? channel(parts[3]) : 1 };
}

function over(foreground: Rgb, background: Rgb): Rgb {
  const alpha = foreground.a;
  return {
    r: foreground.r * alpha + background.r * (1 - alpha),
    g: foreground.g * alpha + background.g * (1 - alpha),
    b: foreground.b * alpha + background.b * (1 - alpha),
    a: 1,
  };
}

function luminance(color: Rgb): number {
  const channel = (value: number): number => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

function contrast(foreground: Rgb, background: Rgb): number {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}

function tokenColor(tokens: Map<string, string>, name: TokenName, underneath: Rgb): Rgb {
  const value = tokens.get(name);
  if (value === undefined) throw new Error("Missing reader token: " + name);
  return over(parseColor(value), underneath);
}

function solid(tokens: Map<string, string>, name: TokenName): Rgb {
  const color = tokenColor(tokens, name, { r: 0, g: 0, b: 0, a: 1 });
  expect(color.a).toBe(1);
  return color;
}

const PRESETS = ["light", "dark", "oled", "paper", "mist"] as const;

let readerCss = "";
let rules: RuleRecord[] = [];

beforeAll(async () => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: (): void => undefined,
      removeListener: (): void => undefined,
      addEventListener: (): void => undefined,
      removeEventListener: (): void => undefined,
      dispatchEvent: (): boolean => true,
    }),
  });
  const reader = await import("../scripts/heybox-up/src/ui/reader");
  readerCss = reader.READER_CSS;
  rules = collectRules(readerCss);
});

describe("immersive reader theme contract", () => {
  it("resolves every reader token for all five effective presets", () => {
    for (const preset of PRESETS) {
      const tokens = presetTokens(rules, preset);
      for (const name of REQUIRED_TOKENS) {
        expect(tokens.get(name), preset + " is missing --hbu-reader-" + name).toMatch(/\S/);
      }
    }
    const paper = presetTokens(rules, "paper");
    const mist = presetTokens(rules, "mist");
    const dark = presetTokens(rules, "dark");
    for (const name of ["page", "accent", "float", "head", "scrim", "shadow"] as const) {
      expect(paper.get(name)).not.toBe(dark.get(name));
      expect(mist.get(name)).not.toBe(dark.get(name));
    }
    expect(paper.get("on-accent")).not.toBe(dark.get("on-accent"));
    expect(mist.get("on-accent")).not.toBe(dark.get("on-accent"));
  });

  it("keeps text, links and accent buttons readable on every page surface", () => {
    for (const preset of PRESETS) {
      const tokens = presetTokens(rules, preset);
      const page = solid(tokens, "page");
      const subtle = solid(tokens, "subtle");
      const accent = solid(tokens, "accent");
      for (const [label, foreground, background] of [
        ["ink/page", solid(tokens, "ink"), page],
        ["ink-2/page", solid(tokens, "ink-2"), page],
        ["muted/subtle", solid(tokens, "muted"), subtle],
        ["link/page", tokenColor(tokens, "link", page), page],
        ["danger/page", tokenColor(tokens, "danger", page), page],
        ["on-accent/accent", solid(tokens, "on-accent"), accent],
      ] as const) {
        const ratio = contrast(foreground, background);
        expect(ratio, preset + " " + label + " is " + ratio.toFixed(2)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("paints chrome from the reader tokens instead of night literals", () => {
    const expectations: Array<[string, string, string]> = [
      [".hbu-reader-head", "background", "var(--hbu-reader-head)"],
      [".hbu-reader-round", "background", "var(--hbu-reader-glass)"],
      [".hbu-reader-home", "background", "var(--hbu-reader-glass)"],
      [".hbu-reader-head-author", "background", "var(--hbu-reader-glass)"],
      [".hbu-reader-action", "color", "var(--hbu-reader-glass-ink)"],
      [".hbu-reader-action:hover", "background", "var(--hbu-reader-float-hover)"],
      ['.hbu-reader-action[aria-pressed="true"]', "color", "var(--hbu-reader-active-like)"],
      [".hbu-reader-favour-menu", "background", "var(--hbu-reader-float)"],
      [".hbu-reader-spacing-menu", "background", "var(--hbu-reader-float)"],
      [".hbu-reader-progress", "color", "var(--hbu-reader-glass-ink)"],
      [".hbu-reader-progress-bar i", "background", "var(--hbu-reader-accent)"],
      [".hbu-reader-hint", "color", "var(--hbu-reader-float-muted)"],
      [".hbu-reader-toast", "background", "var(--hbu-reader-float)"],
      [".hbu-reader-cy-dialog", "background", "var(--hbu-reader-scrim)"],
      [".hbu-reader-comments-scrim", "background", "var(--hbu-reader-scrim)"],
      [".hbu-reader-comments-delete:hover", "color", "var(--hbu-reader-danger)"],
    ];
    for (const [selector, property, expected] of expectations) {
      expect(ruleFor(rules, selector).style.getPropertyValue(property), selector + " " + property).toBe(expected);
    }
    const head = ruleFor(rules, ".hbu-reader-head").style.getPropertyValue("background");
    expect(head).not.toContain("rgba(3, 5, 8");
    const toast = ruleFor(rules, ".hbu-reader-toast").style;
    expect(toast.getPropertyValue("color")).toBe("var(--hbu-reader-float-ink)");
  });

  it("uses the reader accent and ink for accent surfaces", () => {
    const accentSelectors = [
      ".hbu-reader-notice a",
      '.hbu-reader-cy-actions button[data-primary]',
      ".hbu-reader-comments-foot a",
      ".hbu-reader-composer-submit",
      '.hbu-reader-pending-actions button[data-retry]',
      ".hbu-reader-follow",
    ];
    for (const selector of accentSelectors) {
      const style = ruleFor(rules, selector).style;
      expect(style.getPropertyValue("background"), selector).toBe("var(--hbu-reader-accent)");
      expect(style.getPropertyValue("color"), selector).toBe("var(--hbu-reader-on-accent)");
    }
    expect(ruleFor(rules, ".hbu-reader-rich :is(a, .prose-link)").style.color).toBe("var(--hbu-reader-link)");
    expect(ruleFor(rules, ".hbu-reader-rich blockquote").style.getPropertyValue("border-left")).toContain(
      "var(--hbu-reader-accent)",
    );
  });

  it("leaves no fixed night chrome in the reader rules", () => {
    const body = readerCss.slice(readerCss.indexOf("  body.heybox-up-reader {"));
    for (const literal of [
      "#061018",
      "#f2f6fa",
      "#ff8e9a",
      "#f0c56a",
      "#8fd0a8",
      "rgba(12, 17, 23",
      "rgba(3, 5, 8",
      "rgba(38, 48, 59",
      "rgba(5, 8, 11",
      "rgba(242, 246, 250",
      "--heybox-up-accent",
    ]) {
      expect(body, literal + " should resolve through a reader token").not.toContain(literal);
    }
    expect(ruleFor(rules, "body.heybox-up-reader #page-bbs-link").style.getPropertyValue("background")).toContain(
      "var(--hbu-reader-glow)",
    );
  });

  it("keeps the neutral letterbox for photos, video and embeds", () => {
    for (const kind of ["media", "embed", "video"]) {
      const selector = '.hbu-reader-page[data-kind="' + kind + '"]';
      expect(ruleFor(rules, selector).style.getPropertyValue("background"), kind).toBe("rgb(5, 7, 10)");
    }
    expect(ruleFor(rules, ".hbu-reader-cover").style.getPropertyValue("background")).toBe("rgb(5, 7, 10)");
    expect(ruleFor(rules, ".hbu-reader-video").style.getPropertyValue("background")).toBe("rgb(0, 0, 0)");
  });

  it("preserves the reading stage and progress band layout", () => {
    expect(ruleFor(rules, BASE_GATE).style.getPropertyValue("--hbu-reader-stage")).toBe("732px");
    expect(ruleFor(rules, ".hbu-reader-progress").style.getPropertyValue("height")).toBe("46px");
    expect(ruleFor(rules, ".hbu-reader-scroll").style.getPropertyValue("height")).toBe("calc(100% - 46px)");
  });
});

