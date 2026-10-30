import {
  createStringStorage,
  type StringStorage,
  type StringStorageAdapter,
  type StringStorageOptions,
} from "./keyValue";

/** The subset of the GM_* API the string adapter needs, all optional. */
export interface GmStorageApi {
  readonly getValue?: ((key: string, fallback: unknown) => unknown) | undefined;
  readonly setValue?: ((key: string, value: unknown) => void) | undefined;
  readonly deleteValue?: ((key: string) => void) | undefined;
}

export interface GmStorageOptions extends StringStorageOptions {
  /** Storage area used when the manager did not grant the GM_* functions. */
  readonly fallback?: StringStorageAdapter | undefined;
}

type GrantedFunction = (...args: readonly unknown[]) => unknown;

/** `typeof` narrows only to Function; this guard names the call shape we use. */
function asGranted(value: unknown): GrantedFunction | null {
  if (typeof value !== "function") return null;
  // Single assertion: the typeof check proves callability, and the signature
  // only describes how this adapter invokes the granted global.
  return value as GrantedFunction;
}

function callGranted(granted: GrantedFunction, scope: object, args: readonly unknown[]): unknown {
  const result: unknown = Reflect.apply(granted, scope, args);
  return result;
}

/**
 * Read the host globals through Reflect so a missing grant, a non-function, or
 * a page that shadows the name all resolve to "not granted" instead of throwing.
 */
function resolveApi(scope: object): GmStorageApi {
  const rawGet = asGranted(Reflect.get(scope, "GM_getValue"));
  const rawSet = asGranted(Reflect.get(scope, "GM_setValue"));
  const rawDelete = asGranted(Reflect.get(scope, "GM_deleteValue"));
  return {
    getValue:
      rawGet === null ? undefined : (key, fallback) => callGranted(rawGet, scope, [key, fallback]),
    setValue:
      rawSet === null
        ? undefined
        : (key, value) => {
            callGranted(rawSet, scope, [key, value]);
          },
    deleteValue:
      rawDelete === null
        ? undefined
        : (key) => {
            callGranted(rawDelete, scope, [key]);
          },
  };
}

/** Bridge GM_* values into the string storage contract without changing value types. */
export function createGmStorage(
  scope: object = globalThis,
  options: GmStorageOptions = {},
): StringStorageAdapter {
  const api = resolveApi(scope);
  const getValue = api.getValue;
  const setValue = api.setValue;
  if (getValue === undefined || setValue === undefined) {
    return options.fallback ?? createStringStorage(createMemoryStorage(), options);
  }
  const deleteValue = api.deleteValue;
  const backing: StringStorage = {
    getItem: (key) => {
      const value = getValue(key, null);
      if (value === null || value === undefined) return null;
      return typeof value === "string" ? value : JSON.stringify(value);
    },
    setItem: (key, value) => {
      setValue(key, value);
    },
    removeItem: (key) => {
      if (deleteValue === undefined) {
        throw new Error("GM_deleteValue is not granted");
      }
      deleteValue(key);
    },
  };
  return createStringStorage(backing, options);
}

export function createMemoryStorage(): StringStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}
