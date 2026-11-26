/**
 * Stable identifiers shared by the theme engine, the injected UI and tests.
 * The `yoko-` prefix keeps every node this script adds out of QQ Mail's own
 * selector space.
 */
export const SCRIPT_MARKER_ATTRIBUTE = "data-yoko-qq-mail-theme-ready";

/** Present on `<html>` with the value "dark" while the dark theme is active. */
export const THEME_ATTRIBUTE = "data-yoko-qq-mail-theme";

export const STYLE_ID = "yoko-qq-mail-theme-style";

export const COMPOSE_STYLE_ID = "yoko-qq-mail-compose-style";

export const COMPOSE_CONTENT_SELECTOR = '.xmail-cmp-editor-content[contenteditable="true"]';

export const BUTTON_ID = "yoko-qq-mail-theme-toggle";

export const BUTTON_CLASS = "yoko-qq-mail-theme-button";

export const STORAGE_KEY = "yoko_qq_mail_theme_mode";

export const THEME_MODE = Object.freeze({
  LIGHT: "light",
  DARK: "dark",
} as const);

export type ThemeMode = (typeof THEME_MODE)[keyof typeof THEME_MODE];

export const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";

export const BUTTON_LABELS = Object.freeze({
  toDark: "切换到深色主题",
  toLight: "切换到浅色主题",
});
