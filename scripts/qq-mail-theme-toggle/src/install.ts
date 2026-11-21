import { type ThemeMode } from "./config";
import { applyTheme, releaseTheme } from "./core/apply";
import { createThemePreference } from "./core/preference";
import { ensureThemeStyle, removeThemeStyle } from "./core/style";
import { createSystemDarkQuery, resolveThemeMode, toggleThemeMode } from "./core/theme";
import { createThemeButton, updateThemeButton } from "./ui/button";

export interface QqMailThemeController {
  mode(): ThemeMode;
  setMode(mode: ThemeMode): void;
  dispose(): void;
}

export interface QqMailThemeOptions {
  readonly doc?: Document;
  readonly scope?: object;
}

export function installQqMailTheme(options: QqMailThemeOptions = {}): QqMailThemeController {
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

  const unsubscribe = system.subscribe(() => {
    if (preference.read() !== null) return;
    paint(resolveThemeMode(null, system.matches), false);
  });

  const mountButton = (): void => {
    const body = doc.body;
    if (body === null || button.isConnected) return;
    body.append(button);
  };

  mountButton();

  const onParseDone = (): void => mountButton();
  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", onParseDone, { once: true });
  }

  const mountObserver = new MutationObserver(mountButton);
  mountObserver.observe(doc.documentElement, { childList: true, subtree: true });

  return {
    mode: () => mode,
    setMode: (next) => paint(next, true),
    dispose: () => {
      button.removeEventListener("click", onClick);
      doc.removeEventListener("DOMContentLoaded", onParseDone);
      unsubscribe();
      mountObserver.disconnect();
      button.remove();
      releaseTheme(doc);
      removeThemeStyle(doc);
    },
  };
}
