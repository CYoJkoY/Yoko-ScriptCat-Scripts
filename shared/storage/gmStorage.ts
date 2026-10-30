import { createStringStorage, type StringStorage, type StringStorageAdapter } from "./keyValue";

export interface GmStorageApi {
  readonly getValue?: ((key: string, fallback: unknown) => unknown) | undefined;
  readonly setValue?: ((key: string, value: unknown) => void) | undefined;
}

function readUnknown(scope: object, key: string): unknown {
  if (!(key in scope)) return undefined;
  return Reflect.get(scope, key);
}

/** Bridge GM_* values into the string storage contract without changing value types. */
export function createGmStorage(scope: object = globalThis, fallback?: StringStorageAdapter): StringStorageAdapter {
  const api: GmStorageApi = {
    getValue: typeof readUnknown(scope, "GM_getValue") === "function"
      ? (key, defaultValue) => (readUnknown(scope, "GM_getValue") as (key: string, value: unknown) => unknown)(key, defaultValue)
      : undefined,
    setValue: typeof readUnknown(scope, "GM_setValue") === "function"
      ? (key, value) => (readUnknown(scope, "GM_setValue") as (key: string, value: unknown) => void)(key, value)
      : undefined,
  };
  if (api.getValue === undefined || api.setValue === undefined) {
    return fallback ?? createStringStorage(createMemoryStorage());
  }
  const getValue = api.getValue;
  const setValue = api.setValue;
  const backing: StringStorage = {
    getItem: (key) => {
      const value = getValue(key, null);
      if (value === null || value === undefined) return null;
      return typeof value === "string" ? value : JSON.stringify(value);
    },
    setItem: (key, value) => {
      setValue(key, value);
    },
  };
  return createStringStorage(backing);
}

export function createMemoryStorage(): StringStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}
