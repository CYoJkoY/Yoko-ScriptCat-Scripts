import {
  getSilentBrowserStorage,
  type StringStorageAdapter,
} from "../../../../shared/storage/keyValue";

/**
 * Cache reads and background sync treat a blocked or full storage area as
 * "nothing stored"; the shared adapter returns the fallback and stays quiet.
 */
export const localStore: StringStorageAdapter = getSilentBrowserStorage("localStorage");
