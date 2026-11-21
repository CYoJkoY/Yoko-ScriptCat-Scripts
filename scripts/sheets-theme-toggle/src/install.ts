import { type ThemeMode } from "./config";
import { applyTheme, releaseTheme } from "./core/apply";
import { createThemePreference } from "./core/preference";
import { ensureThemeStyle, removeThemeStyle } from "./core/style";
import { createSystemDarkQuery, resolveThemeMode, toggleThemeMode } from "./core/theme";
import { createThemeButton, updateThemeButton } from "./ui/button";
import { createThemeMount } from "./ui/mount";

export interface SheetsThemeController {
  /** The mode currently painted, after the system preference was resolved. */
  mode(): ThemeMode;
  /** Paint and remember a mode; the next page load starts from it. */
  setMode(mode: ThemeMode): void;
  dispose(): void;
}

export interface SheetsThemeOptions {
  readonly doc?: Document;
  /** Global object that exposes the GM_* storage functions, if any. */
  readonly scope?: object;
}

/**
 * Paint the stored (or system) theme, inject the toggle button and keep both in
 * sync. The theme is applied before the chrome exists so the first paint of the
 * editor already carries the right colours; the button follows the toolbar.
 */
export function installSheetsTheme(options: SheetsThemeOptions = {}): SheetsThemeController {
  const doc = options.doc ?? document;
  const preference = createThemePreference(options.scope ?? globalThis);
  const system = createSystemDarkQuery(doc.defaultView);
  let mode: ThemeMode = resolveThemeMode(preference.read(), system.matches);

  ensureThemeStyle(doc);
  applyTheme(doc, mode);

  const button = createThemeButton(doc, mode);
  const paint = (next: ThemeMode, persist: boolean): void => {
    mode = next;
    applyTheme(doc, mode);
    updateThemeButton(button, mode);
    if (persist) preference.write(mode);
  };

  const onClick = (): void => paint(toggleThemeMode(mode), true);
  button.addEventListener("click", onClick);

  // A system switch only matters while the user has not picked a mode; once a
  // preference exists, the stored value stays authoritative across reloads.
  const unsubscribe = system.subscribe(() => {
    if (preference.read() !== null) return;
    paint(resolveThemeMode(null, system.matches), false);
  });

  const mount = createThemeMount({
    doc,
    button,
    isChromeReady: () => doc.readyState !== "loading",
  });
  mount.ensureMounted();

  const onLoad = (): void => mount.ensureMounted();
  const listensForLoad = doc.readyState !== "complete";
  if (listensForLoad) doc.addEventListener("load", onLoad, { once: true });

  return {
    mode: () => mode,
    setMode: (next) => paint(next, true),
    dispose: () => {
      button.removeEventListener("click", onClick);
      if (listensForLoad) doc.removeEventListener("load", onLoad);
      unsubscribe();
      mount.dispose();
      button.remove();
      releaseTheme(doc);
      removeThemeStyle(doc);
    },
  };
}
