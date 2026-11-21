// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUTTON_CLASS,
  BUTTON_ID,
  SCRIPT_MARKER_ATTRIBUTE,
  STORAGE_KEY,
  STYLE_ID,
  THEME_ATTRIBUTE,
  THEME_MODE,
} from "../scripts/qq-mail-theme-toggle/src/config";
import { applyTheme, readAppliedTheme, releaseTheme } from "../scripts/qq-mail-theme-toggle/src/core/apply";
import { createThemePreference } from "../scripts/qq-mail-theme-toggle/src/core/preference";
import { buildThemeCss, ensureThemeStyle, removeThemeStyle } from "../scripts/qq-mail-theme-toggle/src/core/style";
import {
  createSystemDarkQuery,
  normalizeThemeMode,
  resolveThemeMode,
  toggleThemeMode,
} from "../scripts/qq-mail-theme-toggle/src/core/theme";
import { installQqMailTheme } from "../scripts/qq-mail-theme-toggle/src/install";
import {
  createThemeButton,
  describeThemeButton,
  updateThemeButton,
} from "../scripts/qq-mail-theme-toggle/src/ui/button";

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
  document.documentElement.removeAttribute(SCRIPT_MARKER_ATTRIBUTE);
  removeThemeStyle(document);
  installMemoryStorage();
  vi.unstubAllGlobals();
});

/** Pull every selector out of a style sheet string, ignoring comments. */
function selectorsOf(css: string): string[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//gu, "");
  const selectors: string[] = [];
  const pattern = /([^{}]+)\{[^{}]*\}/gu;
  let match: RegExpExecArray | null = pattern.exec(withoutComments);
  while (match !== null) {
    selectors.push(match[1].trim());
    match = pattern.exec(withoutComments);
  }
  return selectors;
}

/** Return the declaration block that follows the first selector containing `needle`. */
function blockFor(css: string, needle: string): string {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//gu, "");
  const pattern = /([^{}]+)\{[^{}]*\}/gu;
  let match: RegExpExecArray | null = pattern.exec(withoutComments);
  while (match !== null) {
    if (match[1].includes(needle)) return match[0];
    match = pattern.exec(withoutComments);
  }
  throw new Error("Missing CSS block containing: " + needle);
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
    expect(resolveThemeMode(THEME_MODE.LIGHT, true)).toBe(THEME_MODE.LIGHT);
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
    applyTheme(document, THEME_MODE.DARK);
    releaseTheme(document);
    expect(document.documentElement.hasAttribute(THEME_ATTRIBUTE)).toBe(false);
  });
});

describe("system dark query", () => {
  interface MediaQueryStub {
    readonly matcher: object;
    listenerCount(): number;
    notify(): void;
  }

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
  const css = buildThemeCss();

  it("gates every page-wide rule on the theme attribute", () => {
    const pageSelectors = selectorsOf(css).filter(
      (selector) => !selector.includes(`button.${BUTTON_CLASS}`),
    );
    expect(pageSelectors.length).toBeGreaterThan(0);
    for (const selector of pageSelectors) {
      expect(selector, selector).toContain(DARK_GATE);
    }
  });

  it("scopes every ungated rule to the toggle button", () => {
    for (const selector of selectorsOf(css).filter(
      (candidate) => !candidate.includes(THEME_ATTRIBUTE),
    )) {
      expect(selector, selector).toContain(`button.${BUTTON_CLASS}`);
    }
  });

  it("swaps the toggle body tokens and opts into the dark colour scheme", () => {
    const body = blockFor(css, `${DARK_GATE} body`);
    expect(body).toContain("color-scheme: dark;");
    expect(body).toContain("--base_white_100: #1A2028;");
    expect(body).toContain("--base_black: #E8ECF1;");
  });

  it("remaps the shell foreground variables away from the inverted white ramp", () => {
    const sidebar = blockFor(css, ".frame-sidebar-menu");
    expect(sidebar).toContain(DARK_GATE);
    expect(sidebar).toContain("--color: var(--base_gray_100);");
    const header = blockFor(css, ".frame-header-setting-btn");
    expect(header).toContain("--color: var(--base_gray_080);");
  });

  it("keeps the reading pane as an untouched light island", () => {
    const detail = blockFor(css, ".mail-detail-content");
    expect(detail).toContain(DARK_GATE);
    expect(detail).toContain("color-scheme: light;");
    expect(detail).toContain("background-color: #FFFFFF !important;");
    expect(detail).toContain("--base_white_100: #FFFFFF;");
    expect(detail).toContain("--base_black: #000000;");
  });

  it("never inverts or filters the page, so embedded images keep their colours", () => {
    expect(css).not.toContain("invert(");
    expect(css).not.toContain("filter:");
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

describe("installQqMailTheme", () => {
  interface SystemStub {
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
    const controller = installQqMailTheme({ doc: document, scope: globalThis });
    try {
      expect(controller.mode()).toBe(THEME_MODE.DARK);
      expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe(THEME_MODE.DARK);
      const button = document.getElementById(BUTTON_ID);
      expect(button).not.toBeNull();
      expect(button?.getAttribute("aria-pressed")).toBe("true");
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(controller.mode()).toBe(THEME_MODE.LIGHT);
      expect(document.documentElement.hasAttribute(THEME_ATTRIBUTE)).toBe(false);
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe(THEME_MODE.LIGHT);
    } finally {
      controller.dispose();
    }
  });

  it("keeps a stored mode across a system change", () => {
    const system = stubMatchMedia(true);
    window.localStorage.setItem(STORAGE_KEY, THEME_MODE.LIGHT);
    const controller = installQqMailTheme({ doc: document, scope: globalThis });
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
    const controller = installQqMailTheme({ doc: document, scope: globalThis });
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

  it("re-renders the button after the page drops it", async () => {
    stubMatchMedia(false);
    const controller = installQqMailTheme({ doc: document, scope: globalThis });
    try {
      const button = document.getElementById(BUTTON_ID);
      expect(button).not.toBeNull();
      button?.remove();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(document.getElementById(BUTTON_ID)).not.toBeNull();
    } finally {
      controller.dispose();
    }
  });

  it("releases the page state on dispose and reinstalls cleanly", () => {
    stubMatchMedia(false);
    const first = installQqMailTheme({ doc: document, scope: globalThis });
    first.dispose();
    expect(document.documentElement.hasAttribute(THEME_ATTRIBUTE)).toBe(false);
    expect(document.getElementById(STYLE_ID)).toBeNull();
    expect(document.getElementById(BUTTON_ID)).toBeNull();
    const second = installQqMailTheme({ doc: document, scope: globalThis });
    try {
      expect(second.mode()).toBe(THEME_MODE.LIGHT);
      expect(document.getElementById(BUTTON_ID)).not.toBeNull();
    } finally {
      second.dispose();
    }
  });
});

describe("theme preference through GM storage", () => {
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
    const { scope, values } = createGmScope();
    const controller = installQqMailTheme({ doc: document, scope });
    try {
      controller.setMode(THEME_MODE.DARK);
      expect(values.get(STORAGE_KEY)).toBe(THEME_MODE.DARK);
      expect(controller.mode()).toBe(THEME_MODE.DARK);
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    } finally {
      controller.dispose();
    }

    const reloaded = installQqMailTheme({ doc: document, scope });
    try {
      expect(reloaded.mode()).toBe(THEME_MODE.DARK);
    } finally {
      reloaded.dispose();
    }
  });
});
