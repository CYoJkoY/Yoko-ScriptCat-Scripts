import { createGmStorage } from "../../../../shared/storage/gmStorage";
import { getBrowserStorage } from "../../../../shared/storage/keyValue";
import { STORAGE_KEY, type ThemeMode } from "../config";
import { normalizeThemeMode } from "./theme";

export interface ThemePreference {
  /** `null` means the user never chose a mode, so the system decides. */
  read(): ThemeMode | null;
  write(mode: ThemeMode): void;
}

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
