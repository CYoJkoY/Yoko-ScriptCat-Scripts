import { SCRIPT_MARKER_ATTRIBUTE } from "./config";
import { isSheetEditorPath } from "./core/page";
import { installSheetsTheme } from "./install";

/**
 * The script runs at `document-start`: the theme attribute and its style sheet
 * are applied before the first paint, and the button mounts itself as soon as
 * Google's toolbar parses in. The file list shares the `/spreadsheets/` tree
 * but has no editor to theme, so only document routes install.
 */
function bootstrap(): void {
  const root: Element | null = document.documentElement;
  if (root === null) return;
  if (root.hasAttribute(SCRIPT_MARKER_ATTRIBUTE)) return;
  if (!isSheetEditorPath(window.location.pathname)) return;
  root.setAttribute(SCRIPT_MARKER_ATTRIBUTE, "");
  installSheetsTheme();
}

const root: Element | null = document.documentElement;
if (root === null) {
  document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
} else {
  bootstrap();
}
