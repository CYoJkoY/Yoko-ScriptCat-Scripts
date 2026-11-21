// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUTTON_CLASS,
  BUTTON_ID,
  FLOATING_ATTRIBUTE,
  STORAGE_KEY,
  STYLE_ID,
  THEME_ATTRIBUTE,
  THEME_MODE,
} from "../scripts/sheets-theme-toggle/src/config";
import { applyTheme, readAppliedTheme } from "../scripts/sheets-theme-toggle/src/core/apply";
import { isSheetEditorPath } from "../scripts/sheets-theme-toggle/src/core/page";
import { createThemePreference } from "../scripts/sheets-theme-toggle/src/core/preference";
import {
  buildThemeCss,
  ensureThemeStyle,
  removeThemeStyle,
} from "../scripts/sheets-theme-toggle/src/core/style";
import {
  createSystemDarkQuery,
  normalizeThemeMode,
  resolveThemeMode,
  toggleThemeMode,
} from "../scripts/sheets-theme-toggle/src/core/theme";
import { installSheetsTheme } from "../scripts/sheets-theme-toggle/src/install";
import {
  createThemeButton,
  describeThemeButton,
  updateThemeButton,
} from "../scripts/sheets-theme-toggle/src/ui/button";
import { createThemeMount } from "../scripts/sheets-theme-toggle/src/ui/mount";

const DARK_GATE = `html[${THEME_ATTRIBUTE}="${THEME_MODE.DARK}"]`;

/**
 * jsdom ships no storage area unless Node is started with --localstorage-file,
 * so every test installs the same Map-backed stub the other suites use.
 */
function installMemoryStorage(): void {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length(): number {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
  Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
}

beforeEach(() => {
  installMemoryStorage();
});

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
  document.documentElement.removeAttribute("data-yoko-sheets-theme-ready");
  Reflect.deleteProperty(document, "readyState");
  removeThemeStyle(document);
  installMemoryStorage();
  vi.unstubAllGlobals();
});

function mountChrome(): void {
  document.body.innerHTML = `
    <div id="docs-header-container"></div>
    <div id="docs-menubar"></div>
    <div id="docs-toolbar-wrapper">
      <div id="docs-primary-toolbars"></div>
      <div id="docs-side-toolbar"></div>
    </div>
    <div id="docs-editor-container"></div>
  `;
}

describe("theme mode rules", () => {
  it("keeps only the two known modes and treats everything else as system", () => {
    expect(normalizeThemeMode("dark")).toBe(THEME_MODE.DARK);
    expect(normalizeThemeMode("light")).toBe(THEME_MODE.LIGHT);
    expect(normalizeThemeMode("oled")).toBeNull();
    expect(normalizeThemeMode(undefined)).toBeNull();
    expect(normalizeThemeMode(1)).toBeNull();
  });

  it("resolves an unset preference from the system", () => {
    expect(resolveThemeMode(null, true)).toBe(THEME_MODE.DARK);
    expect(resolveThemeMode(null, false)).toBe(THEME_MODE.LIGHT);
    expect(resolveThemeMode(THEME_MODE.DARK, false)).toBe(THEME_MODE.DARK);
  });

  it("toggles between the two modes", () => {
    expect(toggleThemeMode(THEME_MODE.DARK)).toBe(THEME_MODE.LIGHT);
    expect(toggleThemeMode(THEME_MODE.LIGHT)).toBe(THEME_MODE.DARK);
  });

  it("paints dark through the attribute and light by removing it", () => {
    applyTheme(document, THEME_MODE.DARK);
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe(THEME_MODE.DARK);
    expect(readAppliedTheme(document)).toBe(THEME_MODE.DARK);
    applyTheme(document, THEME_MODE.LIGHT);
    expect(document.documentElement.hasAttribute(THEME_ATTRIBUTE)).toBe(false);
    expect(readAppliedTheme(document)).toBe(THEME_MODE.LIGHT);
  });
});

describe("sheet editor routes", () => {
  it("accepts single-account and multi-account document paths", () => {
    expect(isSheetEditorPath("/spreadsheets/d/1AbC/edit")).toBe(true);
    expect(isSheetEditorPath("/spreadsheets/d/1AbC/edit#gid=0")).toBe(true);
    expect(isSheetEditorPath("/spreadsheets/u/0/d/1AbC/edit")).toBe(true);
    expect(isSheetEditorPath("/spreadsheets/u/12/d/1AbC/view")).toBe(true);
  });

  it("rejects the file list, other editors and partial paths", () => {
    expect(isSheetEditorPath("/spreadsheets/")).toBe(false);
    expect(isSheetEditorPath("/spreadsheets/u/0/")).toBe(false);
    expect(isSheetEditorPath("/spreadsheets/d/")).toBe(false);
    expect(isSheetEditorPath("/document/d/1AbC/edit")).toBe(false);
    expect(isSheetEditorPath("/presentation/d/1AbC/edit")).toBe(false);
  });
});

describe("system dark query", () => {
  interface MediaQueryStub {
    readonly matcher: object;
    listenerCount(): number;
    notify(): void;
  }

  /**
   * `vi.stubGlobal` accepts `unknown`, so the double only carries the members
   * the script actually touches. The legacy case deletes the modern pair, which
   * is exactly how a Safari 13 `MediaQueryList` looks to the feature check.
   */
  function stubMediaQuery(matches: boolean, mode: "events" | "legacy"): MediaQueryStub {
    const listeners: (() => void)[] = [];
    const register = (listener: () => void): void => {
      listeners.push(listener);
    };
    const unregister = (listener: () => void): void => {
      const index = listeners.indexOf(listener);
      if (index !== -1) listeners.splice(index, 1);
    };
    const matcher = {
      matches,
      media: "(prefers-color-scheme: dark)",
      onchange: null,
      dispatchEvent: (): boolean => false,
      addEventListener: (_type: string, listener: () => void): void => register(listener),
      removeEventListener: (_type: string, listener: () => void): void => unregister(listener),
      addListener: register,
      removeListener: unregister,
    };
    if (mode === "legacy") {
      Reflect.deleteProperty(matcher, "addEventListener");
      Reflect.deleteProperty(matcher, "removeEventListener");
    }
    return {
      matcher,
      listenerCount: () => listeners.length,
      notify: () => {
        for (const listener of [...listeners]) listener();
      },
    };
  }

  it("reads matches and subscribes to changes", () => {
    const stub = stubMediaQuery(true, "events");
    const spy = vi.fn((query: string) => {
      expect(query).toBe("(prefers-color-scheme: dark)");
      return stub.matcher;
    });
    vi.stubGlobal("matchMedia", spy);
    let notified = 0;
    const query = createSystemDarkQuery(window);
    expect(query.matches).toBe(true);
    const unsubscribe = query.subscribe(() => {
      notified += 1;
    });
    expect(stub.listenerCount()).toBe(1);
    stub.notify();
    expect(notified).toBe(1);
    unsubscribe();
    expect(stub.listenerCount()).toBe(0);
  });

  it("uses the deprecated listener pair when addEventListener is missing", () => {
    const stub = stubMediaQuery(false, "legacy");
    vi.stubGlobal("matchMedia", () => stub.matcher);
    let notified = 0;
    const query = createSystemDarkQuery(window);
    const unsubscribe = query.subscribe(() => {
      notified += 1;
    });
    expect(query.matches).toBe(false);
    stub.notify();
    expect(notified).toBe(1);
    unsubscribe();
    expect(stub.listenerCount()).toBe(0);
  });

  it("falls back to light when the view has no matchMedia", () => {
    const query = createSystemDarkQuery(null);
    expect(query.matches).toBe(false);
    expect(typeof query.subscribe((): void => undefined)).toBe("function");
  });
});

describe("preference storage", () => {
  it("persists the chosen mode and treats an unknown value as unset", () => {
    const preference = createThemePreference(globalThis);
    expect(preference.read()).toBeNull();
    preference.write(THEME_MODE.DARK);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(THEME_MODE.DARK);
    expect(preference.read()).toBe(THEME_MODE.DARK);
    window.localStorage.setItem(STORAGE_KEY, "not-a-mode");
    expect(createThemePreference(globalThis).read()).toBeNull();
  });

  it("keeps the session coherent when localStorage rejects writes", () => {
    const failing: Storage = {
      length: 0,
      clear: () => undefined,
      getItem: () => null,
      key: () => null,
      removeItem: () => undefined,
      setItem: () => {
        throw new Error("quota");
      },
    };
    Object.defineProperty(window, "localStorage", { value: failing, configurable: true });
    const preference = createThemePreference(globalThis);
    expect(() => preference.write(THEME_MODE.DARK)).not.toThrow();
    expect(preference.read()).toBe(THEME_MODE.DARK);
  });
});

describe("style contract", () => {
  interface RuleRecord {
    readonly selector: string;
    readonly style: CSSStyleDeclaration;
  }

  function collectRules(css: string): RuleRecord[] {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.append(style);
    const sheet = style.sheet;
    if (sheet === null) throw new Error("Expected the theme style sheet to parse");
    try {
      const collected: RuleRecord[] = [];
      for (const rule of Array.from(sheet.cssRules)) {
        if (rule instanceof CSSStyleRule) {
          collected.push({ selector: rule.selectorText, style: rule.style });
        }
      }
      return collected;
    } finally {
      style.remove();
    }
  }

  const rules = collectRules(buildThemeCss());

  function ruleFor(selector: string): RuleRecord {
    const found = rules.find((rule) => rule.selector === selector);
    if (found === undefined) throw new Error("Missing CSS rule: " + selector);
    return found;
  }

  // Selector lists are merged into one rule, so a plain `includes` check can
  // match a longer selector that merely starts with the one under test.
  function ruleWithSelector(selector: string): RuleRecord {
    const found = rules.find((rule) =>
      rule.selector
        .split(",")
        .map((part) => part.trim())
        .includes(selector),
    );
    if (found === undefined) throw new Error("Missing CSS selector: " + selector);
    return found;
  }

  it("darkens only app chrome without filters or document surface rules", () => {
    const root = ruleFor(DARK_GATE);
    expect(root.style.getPropertyValue("filter")).toBe("");
    expect(root.style.getPropertyValue("background-color")).toBe("rgb(32, 33, 36)");

    const toolbar = ruleWithSelector(`${DARK_GATE} #docs-toolbar-wrapper`);
    expect(toolbar.style.getPropertyValue("background-color")).toBe("rgb(32, 33, 36)");
    expect(toolbar.style.getPropertyValue("color")).toBe("rgb(232, 234, 237)");

    const formulaBar = ruleWithSelector(`${DARK_GATE} #formula-bar`);
    expect(formulaBar.style.getPropertyValue("background-color")).toBe("rgb(41, 42, 45)");

    // Google paints the toolbar from Material 3 tokens, so the dark palette is
    // re-declared on the chrome subtree instead of every widget individually.
    const tokenHost = rules.find(
      (rule) => rule.style.getPropertyValue("--gm3-sys-color-surface") !== "",
    );
    expect(tokenHost).toBeDefined();
    expect(tokenHost?.selector).toContain(`${DARK_GATE} #docs-chrome`);

    const sheetTab = ruleWithSelector(`${DARK_GATE} .docs-sheet-tab`);
    expect(sheetTab.style.getPropertyValue("background-color")).toBe("rgb(45, 47, 49)");

    // Google paints this divider with a white background rather than a border.
    const separator = ruleFor(`${DARK_GATE} #docs-chrome .formula-bar-separator`);
    expect(separator.style.getPropertyValue("background-color")).toBe("rgb(95, 99, 104)");

    const button = ruleFor(`${DARK_GATE} button.${BUTTON_CLASS}`);
    expect(button.style.getPropertyValue("filter")).toBe("");
    expect(button.style.getPropertyValue("color")).toBe("rgb(232, 234, 237)");
  });

  it("does not apply filters or surface rules to the editor canvas or swatches", () => {
    const css = buildThemeCss();
    expect(css).not.toContain("#docs-editor");
    expect(css).not.toContain(".grid-container");
    expect(css).not.toContain(".cell-input");

    // Issue #240 bans inverting the sheet, its media or its swatches. Glyph
    // boxes are UI, so a filter is allowed only when the selector targets one.
    const filtered = rules.filter((rule) => rule.style.getPropertyValue("filter") !== "");
    expect(filtered.length).toBeGreaterThan(0);
    for (const rule of filtered) {
      for (const selector of rule.selector.split(",").map((part) => part.trim())) {
        expect(selector).toContain(".docs-icon-img");
      }
    }

    const forbiddenElement = /(?:^|[\s>+~])(?:img|video|picture|canvas)(?=$|[\s.:#[>+~])/;
    for (const rule of rules) {
      for (const selector of rule.selector.split(",").map((part) => part.trim())) {
        expect(selector).not.toMatch(forbiddenElement);
      }
    }

    const palette = ruleFor(`${DARK_GATE} .goog-palette`);
    expect(palette.style.length).toBe(1);
    expect(palette.style.getPropertyValue("background-color")).toBe("rgb(32, 33, 36)");
  });

  it("pins the fallback button to the viewport", () => {
    const floating = ruleFor(`button.${BUTTON_CLASS}[${FLOATING_ATTRIBUTE}]`);
    expect(floating.style.getPropertyValue("position")).toBe("fixed");
    expect(floating.style.getPropertyValue("right")).toBe("16px");
    expect(floating.style.getPropertyValue("bottom")).toBe("16px");
    const darkFloating = ruleFor(`${DARK_GATE} button.${BUTTON_CLASS}[${FLOATING_ATTRIBUTE}]`);
    expect(darkFloating.style.getPropertyValue("background-color")).toBe("rgb(32, 33, 36)");
  });

  it("mounts and removes exactly one style element", () => {
    ensureThemeStyle(document);
    ensureThemeStyle(document);
    expect(document.querySelectorAll(`style#${STYLE_ID}`)).toHaveLength(1);
    removeThemeStyle(document);
    expect(document.getElementById(STYLE_ID)).toBeNull();
  });
});

describe("button", () => {
  it("shows the action the click performs", () => {
    expect(describeThemeButton(THEME_MODE.LIGHT)).toBe("切换到深色主题");
    expect(describeThemeButton(THEME_MODE.DARK)).toBe("切换到浅色主题");
    const light = createThemeButton(document, THEME_MODE.LIGHT);
    expect(light.getAttribute("aria-pressed")).toBe("false");
    expect(light.querySelector("path")).not.toBeNull();
    updateThemeButton(light, THEME_MODE.DARK);
    expect(light.getAttribute("aria-pressed")).toBe("true");
    expect(light.querySelector("circle")).not.toBeNull();
  });

  it("is a real button with a fixed id and class", () => {
    const button = createThemeButton(document, THEME_MODE.LIGHT);
    expect(button.tagName).toBe("BUTTON");
    expect(button.type).toBe("button");
    expect(button.id).toBe(BUTTON_ID);
    expect(button.classList.contains(BUTTON_CLASS)).toBe(true);
  });
});

describe("mount", () => {
  it("appends the button to the side toolbar and re-inserts it after a re-render", async () => {
    mountChrome();
    const button = createThemeButton(document, THEME_MODE.LIGHT);
    const mount = createThemeMount({ doc: document, button, isParseComplete: () => true });
    try {
      mount.ensureMounted();
      const toolbar = document.getElementById("docs-side-toolbar");
      expect(button.parentElement).toBe(toolbar);
      expect(button.hasAttribute(FLOATING_ATTRIBUTE)).toBe(false);
      toolbar?.removeChild(button);
      await new Promise((resolve) => setTimeout(resolve, 160));
      expect(button.parentElement).toBe(toolbar);
    } finally {
      mount.dispose();
    }
  });

  it("falls back to the main toolbar when the side toolbar is missing", () => {
    document.body.innerHTML = `<div id="docs-toolbar"></div>`;
    const button = createThemeButton(document, THEME_MODE.LIGHT);
    const mount = createThemeMount({ doc: document, button, isParseComplete: () => true });
    try {
      mount.ensureMounted();
      expect(button.parentElement).toBe(document.getElementById("docs-toolbar"));
    } finally {
      mount.dispose();
    }
  });

  it("pins a floating button to the body when the toolbar never renders", () => {
    document.body.append(document.createElement("div"));
    const button = createThemeButton(document, THEME_MODE.LIGHT);
    const mount = createThemeMount({ doc: document, button, isParseComplete: () => true });
    try {
      mount.ensureMounted();
      expect(button.parentElement).toBe(document.body);
      expect(button.hasAttribute(FLOATING_ATTRIBUTE)).toBe(true);
    } finally {
      mount.dispose();
    }
  });

  it("waits for the chrome before showing the fallback", () => {
    document.body.append(document.createElement("div"));
    const button = createThemeButton(document, THEME_MODE.LIGHT);
    const mount = createThemeMount({ doc: document, button, isParseComplete: () => false });
    try {
      mount.ensureMounted();
      expect(button.isConnected).toBe(false);
    } finally {
      mount.dispose();
    }
  });
});

describe("installSheetsTheme", () => {
  interface SystemStub {
    /** Flip the media query and notify, exactly like the OS would. */
    setMatches(next: boolean): void;
    listenerCount(): number;
  }

  function stubMatchMedia(initial: boolean): SystemStub {
    let matches = initial;
    const listeners: (() => void)[] = [];
    vi.stubGlobal("matchMedia", () => ({
      get matches(): boolean {
        return matches;
      },
      addEventListener: (_: string, listener: () => void) => {
        listeners.push(listener);
      },
      removeEventListener: (_: string, listener: () => void) => {
        const index = listeners.indexOf(listener);
        if (index !== -1) listeners.splice(index, 1);
      },
    }));
    return {
      setMatches: (next) => {
        matches = next;
        for (const listener of [...listeners]) listener();
      },
      listenerCount: () => listeners.length,
    };
  }

  it("applies the system theme, mounts the button and toggles on click", () => {
    stubMatchMedia(true);
    mountChrome();
    const controller = installSheetsTheme({ doc: document, scope: globalThis });
    try {
      expect(controller.mode()).toBe(THEME_MODE.DARK);
      expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe(THEME_MODE.DARK);
      const button = document.getElementById(BUTTON_ID);
      expect(button).not.toBeNull();
      expect(button?.getAttribute("aria-pressed")).toBe("true");
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(controller.mode()).toBe(THEME_MODE.LIGHT);
      expect(document.documentElement.hasAttribute(THEME_ATTRIBUTE)).toBe(false);
      expect(button?.getAttribute("aria-pressed")).toBe("false");
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe(THEME_MODE.LIGHT);
    } finally {
      controller.dispose();
    }
  });

  it("keeps a stored mode across a system change", () => {
    const system = stubMatchMedia(true);
    mountChrome();
    window.localStorage.setItem(STORAGE_KEY, THEME_MODE.LIGHT);
    const controller = installSheetsTheme({ doc: document, scope: globalThis });
    try {
      expect(controller.mode()).toBe(THEME_MODE.LIGHT);
      expect(system.listenerCount()).toBe(1);
      system.setMatches(false);
      expect(controller.mode()).toBe(THEME_MODE.LIGHT);
      expect(document.documentElement.hasAttribute(THEME_ATTRIBUTE)).toBe(false);
    } finally {
      controller.dispose();
    }
  });

  it("follows the system when no preference was stored", () => {
    const system = stubMatchMedia(false);
    mountChrome();
    const controller = installSheetsTheme({ doc: document, scope: globalThis });
    try {
      expect(controller.mode()).toBe(THEME_MODE.LIGHT);
      system.setMatches(true);
      expect(controller.mode()).toBe(THEME_MODE.DARK);
      expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe(THEME_MODE.DARK);
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
      system.setMatches(false);
      expect(controller.mode()).toBe(THEME_MODE.LIGHT);
    } finally {
      controller.dispose();
    }
  });

  it("releases the page state on dispose and reinstalls cleanly", () => {
    stubMatchMedia(false);
    mountChrome();
    const first = installSheetsTheme({ doc: document, scope: globalThis });
    first.dispose();
    expect(document.documentElement.hasAttribute(THEME_ATTRIBUTE)).toBe(false);
    expect(document.getElementById(STYLE_ID)).toBeNull();
    expect(document.getElementById(BUTTON_ID)).toBeNull();
    const second = installSheetsTheme({ doc: document, scope: globalThis });
    try {
      expect(second.mode()).toBe(THEME_MODE.LIGHT);
      expect(document.getElementById(BUTTON_ID)).not.toBeNull();
    } finally {
      second.dispose();
    }
  });

  it("mounts once parsing finishes when the document is still loading", () => {
    stubMatchMedia(false);
    Object.defineProperty(document, "readyState", { value: "loading", configurable: true });
    const controller = installSheetsTheme({ doc: document, scope: globalThis });
    try {
      // Nothing may be pinned to the body before the parse completes.
      expect(document.getElementById(BUTTON_ID)).toBeNull();
      Object.defineProperty(document, "readyState", { value: "complete", configurable: true });
      mountChrome();
      document.dispatchEvent(new Event("DOMContentLoaded"));
      expect(document.getElementById(BUTTON_ID)?.parentElement).toBe(
        document.getElementById("docs-side-toolbar"),
      );
    } finally {
      controller.dispose();
    }
  });
});

describe("theme preference", () => {
  /** A manager that granted the GM storage pair, as in the shipped header. */
  function createGmScope(): { readonly scope: object; readonly values: Map<string, unknown> } {
    const values = new Map<string, unknown>();
    return {
      values,
      scope: {
        GM_getValue: (key: string, fallback: unknown): unknown => values.get(key) ?? fallback,
        GM_setValue: (key: string, value: unknown): void => {
          values.set(key, value);
        },
      },
    };
  }

  it("writes the picked mode through GM_setValue and never touches page storage", () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: (): void => undefined,
      removeEventListener: (): void => undefined,
    }));
    mountChrome();
    const { scope, values } = createGmScope();
    const controller = installSheetsTheme({ doc: document, scope });
    try {
      controller.setMode(THEME_MODE.DARK);
      expect(values.get(STORAGE_KEY)).toBe(THEME_MODE.DARK);
      expect(controller.mode()).toBe(THEME_MODE.DARK);
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    } finally {
      controller.dispose();
    }

    // A fresh install against the same manager storage starts in the saved mode.
    const reloaded = installSheetsTheme({ doc: document, scope });
    try {
      expect(reloaded.mode()).toBe(THEME_MODE.DARK);
    } finally {
      reloaded.dispose();
    }
  });
});
