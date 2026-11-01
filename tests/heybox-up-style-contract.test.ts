// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { NAV_CSS } from "../scripts/heybox-up/src/ui/navigation";

const HOVER_MEDIA = "(hover: hover) and (pointer: fine)";
const DARK_GATE = ':root.heybox-up-theme[data-heybox-up-dark="true"]';

interface RuleRecord {
  selector: string;
  style: CSSStyleDeclaration;
  media: string;
}

let themeRules: RuleRecord[] = [];

function collectRules(css: string): RuleRecord[] {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  const sheet = style.sheet;
  if (sheet === null) throw new Error("Expected a style sheet for the supplied CSS");
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

function navHoverRules(rules: RuleRecord[]): RuleRecord[] {
  return rules.filter((rule) => rule.selector.includes(":hover") && rule.selector.includes(".hbu-nav-icon"));
}

function rulesInMedia(rules: RuleRecord[], media: string, selector: string): RuleRecord | undefined {
  return rules.find((rule) => rule.media === media && rule.selector === selector);
}

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
  const theme = await import("../scripts/heybox-up/src/ui/theme");
  const style = document.createElement("style");
  style.textContent = theme.THEME_CSS;
  document.head.append(style);
  themeRules = collectRules(theme.THEME_CSS);
});

describe("navigation motion contract", () => {
  it("limits hover motion to devices that report a fine pointer", () => {
    const hovered = navHoverRules(collectRules(NAV_CSS));
    expect(hovered).toHaveLength(3);
    for (const rule of hovered) expect(rule.media).toBe(HOVER_MEDIA);
    expect(hovered.slice(0, 2).map((rule) => rule.selector)).toEqual([
      ".hbu-nav-link:hover .hbu-nav-icon.hbu-ico-anim",
      '.hbu-nav-link[data-nav="article"]:hover .hbu-nav-icon.hbu-ico-anim',
    ]);
    expect(hovered.slice(0, 2).map((rule) => rule.style.transform)).toEqual([
      "translateY(-2px) scale(1.14)",
      "rotate(-7deg) translateY(-2px) scale(1.1)",
    ]);
    const spedUp = rulesInMedia(collectRules(NAV_CSS), HOVER_MEDIA, ".hbu-nav-link:hover .hbu-nav-icon.hbu-ico-anim path.hbu-ico-flow");
    expect(spedUp?.style.getPropertyValue("animation-duration")).toBe("1.3s");
  });

  it("runs the dynamic flow animation without any hover, focus, or press state", () => {
    const rules = collectRules(NAV_CSS);
    const flow = rules.find((rule) => rule.selector === ".hbu-ico-anim path.hbu-ico-flow");
    expect(flow).toBeDefined();
    expect(flow?.media).toBe("");
    expect(flow?.style.getPropertyValue("animation")).toBe("hbu-nav-ico-flow 3.2s ease-in-out infinite");
    expect(flow?.style.getPropertyValue("stroke-dasharray")).toBe(".3 .7");
    const breathe = rules.find((rule) => rule.selector === ".hbu-nav-icon.hbu-ico-anim svg");
    expect(breathe?.media).toBe("");
    expect(breathe?.style.getPropertyValue("animation")).toBe("hbu-nav-ico-breathe 3.8s ease-in-out infinite");
    // Only the unconditional rule may start the flow animation; every other
    // mention changes just the duration instead of re-declaring the shorthand.
    const start = rules.filter((rule) => rule.style.getPropertyValue("animation").includes("hbu-nav-ico-flow"));
    expect(start).toHaveLength(1);
    expect(start[0]?.selector).toBe(".hbu-ico-anim path.hbu-ico-flow");
    expect(NAV_CSS).toContain("@keyframes hbu-nav-ico-flow");
  });

  it("keeps focus and press feedback outside the hover gate", () => {
    const rules = collectRules(NAV_CSS);
    const focus = rules.filter((rule) => rule.selector.includes(":focus-visible") && rule.selector.includes(".hbu-nav-icon"));
    expect(focus).toHaveLength(3);
    expect(focus.slice(0, 2).map((rule) => rule.selector)).toEqual([
      ".hbu-nav-link:focus-visible .hbu-nav-icon.hbu-ico-anim",
      '.hbu-nav-link[data-nav="article"]:focus-visible .hbu-nav-icon.hbu-ico-anim',
    ]);
    const focusDraw = focus.find((rule) => rule.selector.includes("path.hbu-ico-flow"));
    expect(focusDraw?.selector).toBe(".hbu-nav-link:focus-visible .hbu-nav-icon.hbu-ico-anim path.hbu-ico-flow");
    expect(focusDraw?.style.getPropertyValue("animation-duration")).toBe("1.3s");
    for (const rule of focus) expect(rule.media).toBe("");
    const press = rules.filter((rule) => rule.selector.includes(":active") && rule.selector.includes(".hbu-nav-icon"));
    expect(press).toHaveLength(3);
    const pressDraw = press.find((rule) => rule.selector.includes("path.hbu-ico-flow"));
    expect(pressDraw?.selector).toBe(".hbu-nav-link:active .hbu-nav-icon.hbu-ico-anim path.hbu-ico-flow");
    expect(pressDraw?.style.getPropertyValue("animation-duration")).toBe("0.9s");
    for (const rule of press) {
      expect(rule.media).toBe("");
      if (rule.selector.includes("path")) {
        expect(rule.style.getPropertyValue("animation-duration")).toBe("0.9s");
      } else {
        expect(rule.style.transform).toContain("scale(.9)");
      }
    }
    const underline = rules.find((rule) => rule.selector.includes(".hbu-nav-link.is-active::after"));
    expect(underline?.style.transform).toBe("scaleX(1)");
  });

  it("zeroes transform, transition, and animation for static and reduced motion", () => {
    const rules = collectRules(NAV_CSS);
    const staticRule = rules.find((rule) => rule.selector === ":root.heybox-up-nav-static .hbu-nav-icon");
    expect(staticRule).toBeDefined();
    expect(staticRule?.style.getPropertyValue("transform")).toBe("none");
    expect(staticRule?.style.getPropertyValue("transition")).toBe("none");
    expect(staticRule?.style.getPropertyValue("animation")).toBe("none");
    const staticStroke = rules.find((rule) => rule.selector === ":root.heybox-up-nav-static .hbu-nav-icon path");
    expect(staticStroke?.style.getPropertyValue("stroke-dasharray")).toBe("none");
    expect(staticStroke?.style.getPropertyValue("stroke-dashoffset")).toBe("0");
    const staticFlow = rules.find((rule) => rule.selector === ":root.heybox-up-nav-static .hbu-nav-icon path.hbu-ico-flow");
    expect(staticFlow?.style.getPropertyValue("display")).toBe("none");
    const reduced = rules.find((rule) => rule.media === "(prefers-reduced-motion: reduce)"
      && rule.selector.includes(".hbu-nav-icon"));
    expect(reduced).toBeDefined();
    expect(reduced?.style.getPropertyValue("transform")).toBe("none");
    expect(reduced?.style.getPropertyValue("transition")).toBe("none");
    expect(reduced?.style.getPropertyValue("animation")).toBe("none");
    const reducedStroke = rules.find((rule) => rule.media === "(prefers-reduced-motion: reduce)"
      && rule.selector === ".hbu-nav-icon path");
    expect(reducedStroke?.style.getPropertyValue("stroke-dasharray")).toBe("none");
    expect(reducedStroke?.style.getPropertyValue("stroke-dashoffset")).toBe("0");
    const reducedFlow = rules.find((rule) => rule.media === "(prefers-reduced-motion: reduce)"
      && rule.selector === ".hbu-nav-icon path.hbu-ico-flow");
    expect(reducedFlow?.style.getPropertyValue("display")).toBe("none");
    expect(NAV_CSS).toContain("@keyframes hbu-nav-ico-flow");
  });

  it("preserves the 18px icon layout box", () => {
    const icon = collectRules(NAV_CSS).find((rule) => rule.selector === ".hbu-nav-icon");
    expect(icon?.style.getPropertyValue("width")).toBe("18px");
    expect(icon?.style.getPropertyValue("height")).toBe("18px");
    // jsdom expands the flex shorthand to longhands, which still prove a fixed box.
    expect(icon?.style.getPropertyValue("flex-grow")).toBe("0");
    expect(icon?.style.getPropertyValue("flex-shrink")).toBe("0");
    expect(icon?.style.getPropertyValue("flex-basis")).toBe("auto");
  });
});

describe("search suggestion contrast contract", () => {
  it("scopes every suggestion rule to the dark gate", () => {
    const suggestion = themeRules.filter((rule) =>
      rule.selector.includes(".search__pull-list")
      && !rule.selector.includes(":has(> .search__suggestion:empty)")
    );
    expect(suggestion).toHaveLength(9);
    for (const rule of suggestion) expect(rule.selector.startsWith(DARK_GATE)).toBe(true);
    expect(suggestion.map((rule) => rule.selector)).toEqual(expect.arrayContaining([
      DARK_GATE + " .search__pull-list .suggestion__item-desc",
      DARK_GATE + " .search__pull-list .suggestion__item-icon",
      DARK_GATE + " .search__pull-list .suggestion__item:focus-visible",
    ]));
    const fragment = suggestion.find((rule) =>
      rule.selector === DARK_GATE + " .search__pull-list .suggestion__item :is(em, b, strong, mark)"
    );
    expect(fragment?.style.getPropertyValue("color")).toBe("var(--heybox-up-accent)");
  });

  it("keeps the suggestion surface dark without preset-id coupling", () => {
    const suggestion = themeRules.filter((rule) =>
      rule.selector.includes(".search__pull-list")
      && !rule.selector.includes(":has(> .search__suggestion:empty)")
    );
    expect(suggestion.some((rule) => rule.selector.includes("data-heybox-up-theme"))).toBe(false);
    const panel = suggestion.find((rule) => rule.style.getPropertyValue("background-color") === "var(--heybox-up-surface)");
    expect(panel).toBeDefined();
    expect(panel?.selector.startsWith(DARK_GATE)).toBe(true);
  });

  it("resolves dark and OLED text tokens, leaving light untouched", () => {
    const readTokens = (): { text: string; muted: string; accent: string; surface: string } => {
      const style = window.getComputedStyle(document.documentElement);
      return {
        text: style.getPropertyValue("--heybox-up-text").trim(),
        muted: style.getPropertyValue("--heybox-up-muted").trim(),
        accent: style.getPropertyValue("--heybox-up-accent").trim(),
        surface: style.getPropertyValue("--heybox-up-surface").trim(),
      };
    };
    const root = document.documentElement;
    root.className = "heybox-up-theme";
    root.dataset["heyboxUpDark"] = "true";
    root.dataset["heyboxUpTheme"] = "dark";
    expect(readTokens()).toEqual({ text: "#dce5ef", muted: "#8593a3", accent: "#8fb0cf", surface: "#171d24" });
    root.dataset["heyboxUpTheme"] = "oled";
    expect(readTokens()).toEqual({ text: "#e6ebf2", muted: "#9aa4b2", accent: "#a8c0d8", surface: "#08090b" });
    delete root.dataset["heyboxUpDark"];
    root.dataset["heyboxUpTheme"] = "light";
    expect(readTokens().text).toBe("#14191e");
  });
});

