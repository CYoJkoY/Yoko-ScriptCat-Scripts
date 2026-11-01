// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const createArea = (): Storage => {
    const values = new Map<string, string>();
    return {
      get length(): number {
        return values.size;
      },
      clear: (): void => {
        values.clear();
      },
      getItem: (key: string): string | null => values.get(key) ?? null,
      key: (index: number): string | null => Array.from(values.keys())[index] ?? null,
      removeItem: (key: string): void => {
        values.delete(key);
      },
      setItem: (key: string, value: string): void => {
        values.set(key, value);
      },
    };
  };
  Object.defineProperty(window, "localStorage", { configurable: true, value: createArea() });
  Object.defineProperty(window, "sessionStorage", { configurable: true, value: createArea() });
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
});

import { ADAPTED_ROUTES, PAGE_ROUTE, isOfficialHomePath } from "../scripts/heybox-up/src/config";
import { pageSyncTasks, readPageRoute, registerPageSync, runPageSyncTasks } from "../scripts/heybox-up/src/core/page-sync";
import { applyHideCyPreference, readHideCyPreference, releaseHideCy, setHideCyPreference } from "../scripts/heybox-up/src/state";
import { NAV_ID, NAV_STYLE_ID, ensureNavStyle, mountTopNav, releaseNav } from "../scripts/heybox-up/src/ui/navigation";
import { THEME_ATTR, THEME_CLASS, THEME_ENTRY_ID, THEME_STYLE_ID, applyTheme, getThemePreset, releaseTheme } from "../scripts/heybox-up/src/ui/theme";

function resetDocument(): void {
  document.documentElement.className = "";
  document.documentElement.removeAttribute(THEME_ATTR);
  document.documentElement.removeAttribute("data-heybox-up-dark");
  document.documentElement.removeAttribute("style");
  document.body.className = "";
  document.body.innerHTML = "";
  history.replaceState(null, "", "/");
}

beforeEach(() => {
  resetDocument();
  pageSyncTasks.clear();
  window.localStorage.clear();
});

afterEach(() => {
  resetDocument();
  pageSyncTasks.clear();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("official homepage routing", () => {
  it("classifies the root path separately from the community feed", () => {
    expect(readPageRoute("/")).toBe(PAGE_ROUTE.OFFICIAL_HOME);
    expect(readPageRoute("/app/bbs/home")).toBe(PAGE_ROUTE.FEED);
    expect(isOfficialHomePath("/")).toBe(true);
    expect(isOfficialHomePath("/app/bbs/home")).toBe(false);
    expect(isOfficialHomePath("/app")).toBe(false);
  });

  it("keeps the root path outside the adapted routes", () => {
    expect(ADAPTED_ROUTES.includes(PAGE_ROUTE.OFFICIAL_HOME)).toBe(false);
    expect(ADAPTED_ROUTES.includes(PAGE_ROUTE.FEED)).toBe(true);
    expect(ADAPTED_ROUTES.includes(PAGE_ROUTE.ARTICLE)).toBe(true);
  });

  it("skips default sync tasks on the root path and resumes on the feed", () => {
    let runs = 0;
    const task = (): void => {
      runs += 1;
    };
    history.replaceState(null, "", "/");
    registerPageSync(task);
    runPageSyncTasks();
    const baseline = runs;
    runPageSyncTasks();
    expect(runs).toBe(baseline);

    history.replaceState(null, "", "/app/bbs/home");
    runPageSyncTasks();
    expect(runs).toBe(baseline + 1);
  });
});

describe("official homepage teardown", () => {
  it("removes the theme hooks while keeping the stored preset", () => {
    history.replaceState(null, "", "/app/bbs/home");
    const preset = getThemePreset("night");
    applyTheme(preset.id, false);
    expect(document.documentElement.classList.contains(THEME_CLASS)).toBe(true);
    expect(document.documentElement.getAttribute(THEME_ATTR)).not.toBeNull();

    releaseTheme();
    expect(document.documentElement.classList.contains(THEME_CLASS)).toBe(false);
    expect(document.documentElement.getAttribute(THEME_ATTR)).toBeNull();
    expect(document.documentElement.style.getPropertyValue("color-scheme")).toBe("");
    expect(document.getElementById(THEME_STYLE_ID)).toBeNull();
    expect(document.getElementById(THEME_ENTRY_ID)).toBeNull();
  });

  it("does not paint the theme when the entry point starts on the root path", () => {
    const preset = getThemePreset("night");
    history.replaceState(null, "", "/");
    applyTheme(preset.id, true);
    expect(document.documentElement.classList.contains(THEME_CLASS)).toBe(false);
    expect(document.documentElement.getAttribute(THEME_ATTR)).toBeNull();
    expect(window.localStorage.getItem("heybox-up.theme.v1")).toBeNull();
  });

  it("unmounts the custom nav and its style sheet", () => {
    document.body.innerHTML = '<nav class="nav"><div class="nav-links"></div></nav>';
    history.replaceState(null, "", "/app/bbs/home");
    mountTopNav();
    expect(document.getElementById(NAV_ID)).not.toBeNull();
    expect(document.getElementById(NAV_STYLE_ID)).not.toBeNull();

    releaseNav();
    expect(document.getElementById(NAV_ID)).toBeNull();
    expect(document.getElementById(NAV_STYLE_ID)).toBeNull();
  });

  it("drops the CY hide class and style without clearing the preference", () => {
    setHideCyPreference(true);
    expect(document.body.classList.contains("heybox-up-hide-cy")).toBe(true);
    expect(document.getElementById("heybox-up-cy-style")).not.toBeNull();
    expect(readHideCyPreference()).toBe(true);

    releaseHideCy();
    expect(document.body.classList.contains("heybox-up-hide-cy")).toBe(false);
    expect(document.getElementById("heybox-up-cy-style")).toBeNull();
    expect(readHideCyPreference()).toBe(true);
  });

  it("restores the CY hide class when an adapted route applies it again", () => {
    setHideCyPreference(true);
    releaseHideCy();
    applyHideCyPreference(readHideCyPreference());
    expect(document.body.classList.contains("heybox-up-hide-cy")).toBe(true);
    expect(document.getElementById("heybox-up-cy-style")).not.toBeNull();
  });
});
