import { THEME_ATTRIBUTE, THEME_MODE, type ThemeMode } from "../config";

/**
 * Light is the absence of the attribute: without it every dark rule in the
 * style sheet stops matching, so the page keeps its own colours.
 */
export function applyTheme(doc: Document, mode: ThemeMode): void {
  const root: Element | null = doc.documentElement;
  if (root === null) return;
  if (mode === THEME_MODE.DARK) {
    root.setAttribute(THEME_ATTRIBUTE, THEME_MODE.DARK);
    return;
  }
  root.removeAttribute(THEME_ATTRIBUTE);
}

export function readAppliedTheme(doc: Document): ThemeMode {
  const root: Element | null = doc.documentElement;
  const applied = root === null ? null : root.getAttribute(THEME_ATTRIBUTE);
  return applied === THEME_MODE.DARK ? THEME_MODE.DARK : THEME_MODE.LIGHT;
}

export function releaseTheme(doc: Document): void {
  const root: Element | null = doc.documentElement;
  root?.removeAttribute(THEME_ATTRIBUTE);
}
