import { SYSTEM_DARK_QUERY, THEME_MODE, type ThemeMode } from "../config";

/** Anything other than the two literal modes means "no explicit preference". */
export function normalizeThemeMode(value: unknown): ThemeMode | null {
  if (value === THEME_MODE.DARK) return THEME_MODE.DARK;
  if (value === THEME_MODE.LIGHT) return THEME_MODE.LIGHT;
  return null;
}

export function resolveThemeMode(
  preference: ThemeMode | null,
  systemPrefersDark: boolean,
): ThemeMode {
  if (preference !== null) return preference;
  return systemPrefersDark ? THEME_MODE.DARK : THEME_MODE.LIGHT;
}

export function toggleThemeMode(current: ThemeMode): ThemeMode {
  return current === THEME_MODE.DARK ? THEME_MODE.LIGHT : THEME_MODE.DARK;
}

export interface SystemDarkQuery {
  readonly matches: boolean;
  /** Returns an unsubscribe function; a no-op when the view cannot report it. */
  subscribe(listener: () => void): () => void;
}

/**
 * Wrap `matchMedia` so a frame without it (or with a throwing stub) still
 * resolves to "light" instead of failing the whole install.
 */
export function createSystemDarkQuery(view: Window | null): SystemDarkQuery {
  if (view === null || typeof view.matchMedia !== "function") {
    return { matches: false, subscribe: () => () => undefined };
  }
  const matcher = view.matchMedia(SYSTEM_DARK_QUERY);
  return {
    get matches() {
      return matcher.matches === true;
    },
    subscribe: (listener) => {
      const handler = (): void => listener();
      if (typeof matcher.addEventListener === "function") {
        matcher.addEventListener("change", handler);
        return () => matcher.removeEventListener("change", handler);
      }
      // Pre-14 Safari only exposes the deprecated listener pair.
      matcher.addListener(handler);
      return () => matcher.removeListener(handler);
    },
  };
}
