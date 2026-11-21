/**
 * Stable identifiers shared by the theme engine, the injected UI and the tests.
 * The `yoko-` prefix keeps every node this script adds out of Google's own
 * selector space.
 */
export const SCRIPT_MARKER_ATTRIBUTE = "data-yoko-sheets-theme-ready";

/** Present on `<html>` with the value "dark" while the dark theme is active. */
export const THEME_ATTRIBUTE = "data-yoko-sheets-theme";

export const STYLE_ID = "yoko-sheets-theme-style";

export const BUTTON_ID = "yoko-sheets-theme-toggle";

export const BUTTON_CLASS = "yoko-sheets-theme-button";

/** Marks the fallback button pinned to the viewport instead of the toolbar. */
export const FLOATING_ATTRIBUTE = "data-yoko-sheets-theme-floating";

/** Namespaced like the other scripts so it cannot collide with page keys. */
export const STORAGE_KEY = "yoko_sheets_theme_mode";

export const THEME_MODE = Object.freeze({
  LIGHT: "light",
  DARK: "dark",
} as const);

export type ThemeMode = (typeof THEME_MODE)[keyof typeof THEME_MODE];

export const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Google's right-hand toolbar sits on the same row as the formatting toolbar
 * and keeps a 40px box, so a 28px icon button fits without stretching the row.
 * The main toolbar is the second choice; the page body is the last resort.
 */
export const MOUNT_TARGET_SELECTORS: readonly string[] = Object.freeze([
  "#docs-side-toolbar",
  "#docs-toolbar",
]);

/** Delay before re-inserting a button that Google's renderer dropped. */
export const REMOUNT_DELAY_MS = 120;

export const BUTTON_LABELS = Object.freeze({
  toDark: "切换到深色主题",
  toLight: "切换到浅色主题",
});
