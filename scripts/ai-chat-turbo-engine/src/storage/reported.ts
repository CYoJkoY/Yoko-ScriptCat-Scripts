import {
  getBrowserStorage,
  type BrowserStorageName,
  type StorageFailure,
  type StringStorageAdapter,
} from "../../../../shared/storage/keyValue";

/**
 * Engine storage keeps the released diagnostics: every failed access goes to
 * the caller's reporter, and reads never trust a cached copy so a second tab
 * or the host page can change a value between reads.
 */
export function createReportedStorage(
  kind: BrowserStorageName,
  report: (failure: StorageFailure) => void,
): StringStorageAdapter {
  return getBrowserStorage(kind, { cache: false, onError: report });
}
