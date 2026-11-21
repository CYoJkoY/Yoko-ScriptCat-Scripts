import { createGmStorage } from "../../../../shared/storage/gmStorage";
import { getBrowserStorage } from "../../../../shared/storage/keyValue";
import { STORAGE_KEY, type ThemeMode } from "../config";
import { normalizeThemeMode } from "./theme";

export interface ThemePreference {
  /** `null` means the user never chose a mode, so the system decides. */
  read(): ThemeMode | null;
  write(mode: ThemeMode): void;
}

/**
 * GM_* storage survives manager-level script reinstalls; the page storage is the
 * fallback for managers running without the storage grants. The fallback keeps
 * the shared session cache and swallows failures, so a page that blocks
 * persistence still reports the mode the user picked in this tab.
 */
export function createThemePreference(scope: object = globalThis): ThemePreference {
  const storage = createGmStorage(scope, {
    fallback: getBrowserStorage("localStorage", { onError: (): void => undefined }),
  });
  return {
    read: () => normalizeThemeMode(storage.read(STORAGE_KEY)),
    write: (mode) => {
      storage.write(STORAGE_KEY, mode);
    },
  };
}
