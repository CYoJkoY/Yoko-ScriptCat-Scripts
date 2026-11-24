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
import {
  applyEmailDarkMode,
  disableEmailDarkMode,
  EMAIL_CONTENT_SELECTOR,
  enableEmailDarkMode,
  restoreEmailColors,
} from "../scripts/qq-mail-theme-toggle/src/core/emailDark";
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
const DARK_CANVAS = "rgb(26, 32, 40)";
const LIGHT_INK = "rgb(232, 236, 241)";
const WHITE_PAPER = "rgb(255, 255, 255)";
const DARK_INK = "rgb(29, 29, 31)";

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
  disableEmailDarkMode();
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
  const matches: RegExpExecArray[] = [];
  let match: RegExpExecArray | null = pattern.exec(withoutComments);
  while (match !== null) {
    matches.push(match);
    match = pattern.exec(withoutComments);
  }
  const exact = matches.find((candidate) => candidate[1].trim().endsWith(needle));
  if (exact !== undefined) return exact[0];
  const partial = matches.find((candidate) => candidate[1].includes(needle));
  if (partial !== undefined) return partial[0];
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
    expect(body).toContain("--base_gray_100: #EEF2F7;");
    expect(body).toContain("--base_gray_080: rgba(238, 242, 247, 0.92);");
  });

  it("remaps the shell foreground variables away from the inverted white ramp", () => {
    const sidebar = blockFor(css, ".frame-sidebar-menu");
    expect(sidebar).toContain(DARK_GATE);
    expect(sidebar).toContain("--color: var(--base_gray_100);");
    const header = blockFor(css, ".frame-header-setting-btn");
    expect(header).toContain("--color: var(--base_gray_080);");
  });

  it("repaints the blank reading pane illustration instead of leaving it dark", () => {
    const illustration = blockFor(css, ".mail-list-page-reader-tips .empty-tips::before");
    expect(illustration).toContain(DARK_GATE);
    const encoded = /background-image: url\("data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)"\)/u.exec(
      illustration,
    )?.[1];
    expect(encoded).toBeDefined();
    const svg = new DOMParser().parseFromString(atob(encoded ?? ""), "image/svg+xml");
    expect(svg.documentElement.getAttribute("viewBox")).toBe("0 0 160 120");
    expect(svg.querySelector("path")?.getAttribute("fill")).toBe("#EEF2F7");
    expect(svg.querySelector("path")?.getAttribute("fill-opacity")).toBe("0.45");
    const caption = blockFor(css, ".mail-list-page-reader-tips .empty-tips .tips-title");
    expect(caption).toContain("color: var(--base_gray_070);");
  });

  it("lifts the dimmest list and empty-state captions one ramp step", () => {
    expect(blockFor(css, ".mail-list-page-tips .empty-desc")).toContain(
      "color: var(--base_gray_060);",
    );
    expect(blockFor(css, ".mail-list-page-item .mail-digest")).toContain(
      "color: var(--base_gray_050);",
    );
    expect(blockFor(css, ".mail-list-page-item .mail-digest.digest-remark")).toContain(
      "color: var(--chrome_yellow_lighten_2);",
    );
  });

  it("targets real QQ classes instead of a nonexistent shell container", () => {
    expect(css).not.toContain(".frame-main");
    expect(css).not.toContain("common-state");
  });

  it("keeps scrollbar thumbs and unchecked checkbox icons visible", () => {
    for (const selector of [`${DARK_GATE} body`, ".frame-sidebar", ".xmail-page-root::-webkit-scrollbar-thumb"]) {
      const scrollbar = blockFor(css, selector);
      expect(scrollbar).toContain(DARK_GATE);
      expect(scrollbar).toContain("--color-scroll-bar-bg: var(--base_gray_030);");
      expect(scrollbar).toContain("--color-scroll-bar-hover-bg: var(--base_gray_060);");
      expect(scrollbar).toContain("--color-scroll-bar-active-bg: var(--base_gray_070);");
    }
    const checkbox = blockFor(css, ".ui-checkbox-uncheck-icon");
    expect(checkbox).toContain(DARK_GATE);
    expect(checkbox).toContain("color: var(--base_gray_060);");
  });

  it("recolours the gray loading ring without replacing its gradient or opacity", () => {
    const tip = blockFor(css, '.xmail-ui-icon-loading > svg > path[fill="#192636"]');
    const stops = blockFor(css, '.xmail-ui-icon-loading > svg stop[stop-color="#192636"]');
    expect(tip).toContain("fill: var(--base_gray_100);");
    expect(stops).toContain("stop-color: var(--base_gray_100);");
    expect(tip).not.toContain("fill-opacity:");
    expect(stops).not.toContain("stop-opacity:");
  });

  it("paints the reading pane as a dark canvas instead of a light island", () => {
    const detail = blockFor(css, ".mail-detail-content");
    expect(detail).toContain(DARK_GATE);
    expect(detail).toContain("color-scheme: dark;");
    expect(detail).toContain("background-color: #1A2028 !important;");
    expect(detail).toContain("color: #E8ECF1 !important;");
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

describe("email body recolouring", () => {
  function mountEmail(markup: string): HTMLElement {
    const host = document.createElement("div");
    host.className = EMAIL_CONTENT_SELECTOR.replace(/^\./u, "");
    host.innerHTML = markup;
    document.body.append(host);
    return host;
  }

  function mustQuery(root: ParentNode, selector: string): HTMLElement {
    const found = root.querySelector<HTMLElement>(selector);
    if (found === null) throw new Error(`Missing element: ${selector}`);
    return found;
  }

  function rgbChannels(value: string): readonly [number, number, number] {
    const body = /^rgba?\(([^)]+)\)$/u.exec(value);
    if (body === null) throw new Error(`Not an rgb colour: ${value}`);
    const parts = body[1].split(/[,\s/]+/u).filter((part) => part !== "");
    return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
  }

  it("turns white paper inside an email into the dark canvas", () => {
    const host = mountEmail(
      '<table style="background: rgb(255, 255, 255)"><tbody><tr><td>cell</td></tr></tbody></table>',
    );
    applyEmailDarkMode(document);
    const table = mustQuery(host, "table");
    expect(table.style.getPropertyValue("background-color")).toBe(DARK_CANVAS);
    expect(table.style.getPropertyPriority("background-color")).toBe("important");
  });

  it("lifts the dark ink an email hard-codes in its inline styles", () => {
    const host = mountEmail('<p style="color: #1d1d1f">正文</p>');
    applyEmailDarkMode(document);
    const paragraph = mustQuery(host, "p");
    expect(paragraph.style.getPropertyValue("color")).toBe(LIGHT_INK);
    expect(paragraph.style.getPropertyPriority("color")).toBe("important");
  });

  it("keeps saturated accents by lifting them instead of flattening them to grey", () => {
    const host = mountEmail('<a style="color: #005a9c">链接</a>');
    applyEmailDarkMode(document);
    const link = mustQuery(host, "a");
    const mapped = link.style.getPropertyValue("color");
    expect(mapped).not.toBe("rgb(0, 90, 156)");
    expect(mapped).not.toBe(LIGHT_INK);
    const [red, green, blue] = rgbChannels(mapped);
    expect(blue).toBeGreaterThan(green);
    expect(green).toBeGreaterThan(red);
  });

  it("never touches media elements", () => {
    const host = mountEmail(
      '<p style="color: #1d1d1f"><img alt="logo" src="logo.png" style="width:20px;height:20px"></p>',
    );
    applyEmailDarkMode(document);
    const image = mustQuery(host, "img");
    expect(image.getAttribute("style")).toBe("width:20px;height:20px");
    expect(image.style.getPropertyValue("color")).toBe("");
    expect(image.style.getPropertyValue("filter")).toBe("");
    expect(mustQuery(host, "p").style.getPropertyValue("color")).toBe(LIGHT_INK);
  });

  it("skips inline svg artwork while still recolouring its html siblings", () => {
    const host = mountEmail(
      '<div><svg viewBox="0 0 10 10" style="color: #1d1d1f"><text>icon</text></svg>' +
        '<span style="color: #1d1d1f">caption</span></div>',
    );
    applyEmailDarkMode(document);
    expect(mustQuery(host, "svg").getAttribute("style")).toBe("color: #1d1d1f");
    expect(mustQuery(host, "text").getAttribute("style")).toBeNull();
    expect(mustQuery(host, "span").style.getPropertyValue("color")).toBe(LIGHT_INK);
  });

  it("leaves text authored on top of a background image alone", () => {
    const host = mountEmail(
      '<div style="background-image: url(hero.png)"><span style="color: #1d1d1f">hero</span></div>',
    );
    applyEmailDarkMode(document);
    expect(mustQuery(host, "span").style.getPropertyValue("color")).toBe(DARK_INK);
  });

  it("restores the exact authored colours when the dark theme goes away", () => {
    const host = mountEmail(
      '<table style="background: rgb(255, 255, 255); color: #1d1d1f"><tbody><tr><td>cell</td></tr></tbody></table>',
    );
    const table = mustQuery(host, "table");
    applyEmailDarkMode(document);
    expect(table.style.getPropertyValue("background-color")).toBe(DARK_CANVAS);
    restoreEmailColors();
    expect(table.style.getPropertyValue("background-color")).toBe(WHITE_PAPER);
    expect(table.style.getPropertyValue("color")).toBe(DARK_INK);
    expect(table.style.getPropertyPriority("background-color")).toBe("");
  });

  it("recolours an email body that renders after the dark theme was enabled", async () => {
    const host = mountEmail('<div class="qmbox"></div>');
    enableEmailDarkMode(document);
    const table = document.createElement("table");
    table.setAttribute("style", "background: rgb(255, 255, 255)");
    mustQuery(host, ".qmbox").append(table);
    await vi.waitFor(() => {
      expect(table.style.getPropertyValue("background-color")).toBe(DARK_CANVAS);
    });
  });

  it("stops recolouring after the dark theme is disabled", async () => {
    const host = mountEmail('<div class="qmbox"></div>');
    enableEmailDarkMode(document);
    disableEmailDarkMode();
    const table = document.createElement("table");
    table.setAttribute("style", "background: rgb(255, 255, 255)");
    mustQuery(host, ".qmbox").append(table);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(table.style.getPropertyValue("background-color")).toBe(WHITE_PAPER);
    expect(table.getAttribute("style")).toBe("background: rgb(255, 255, 255)");
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

  it("darkens an open email body and restores it when switched back to light", () => {
    stubMatchMedia(true);
    const host = document.createElement("div");
    host.className = "mail-detail-content";
    host.innerHTML =
      '<table style="background: rgb(255, 255, 255); color: #1d1d1f"><tbody><tr><td>hi</td></tr></tbody></table>';
    document.body.append(host);
    const table = host.querySelector<HTMLElement>("table");
    const controller = installQqMailTheme({ doc: document, scope: globalThis });
    try {
      expect(controller.mode()).toBe(THEME_MODE.DARK);
      expect(table?.style.getPropertyValue("background-color")).toBe(DARK_CANVAS);
      controller.setMode(THEME_MODE.LIGHT);
      expect(table?.style.getPropertyValue("background-color")).toBe(WHITE_PAPER);
      expect(table?.style.getPropertyValue("color")).toBe(DARK_INK);
    } finally {
      controller.dispose();
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
