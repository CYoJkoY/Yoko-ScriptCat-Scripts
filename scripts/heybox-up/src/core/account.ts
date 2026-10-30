import { createApiParams } from "../ui/rail";
import { localStore, sessionStore } from "../state";
import { asRecord } from "./json";
import { fetchWithTimeout } from "./request";

/**
 * Account id discovery. The site stores the id in a cookie, a store snapshot,
 * localStorage/sessionStorage, or only after calling the restore_login API, so
 * each source is tried in the original order.
 */

export function readCookie(name: string): string {
  const prefix = name + "=";
  for (const part of document.cookie.split(";")) {
    const entry = part.trim();
    if (entry.startsWith(prefix)) {
      try {
        return decodeURIComponent(entry.slice(prefix.length));
      } catch {
        return entry.slice(prefix.length);
      }
    }
  }
  return "";
}

export const HEYBOX_ID_PLACEHOLDERS: ReadonlySet<string> = new Set([
  "",
  "None",
  "none",
  "NONE",
  "null",
  "NULL",
  "undefined",
]);

export function normalizeHeyboxIdValue(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  return HEYBOX_ID_PLACEHOLDERS.has(text) ? "" : text;
}

export function getHeyboxId(): string {
  const primary = normalizeHeyboxIdValue(readCookie("heybox_id"));
  if (primary !== "") return primary;
  return normalizeHeyboxIdValue(readCookie("user_heybox_id"));
}

export const ACCOUNT_ID_RESTORE_PATH = "/account/restore_login";

export const ACCOUNT_ID_CACHE_TTL_MS = 60 * 1000;

export const ACCOUNT_ID_STORAGE_KEYS: readonly string[] = [
  "heybox_id",
  "user_heybox_id",
  "account.heybox_id",
];

export const accountIdCache: { value: string; at: number } = { value: "", at: 0 };

export function readAccountIdField(record: unknown): string {
  const fields = asRecord(record);
  if (fields === null) return "";
  for (const key of ["heybox_id", "heyboxId", "userid", "user_id"]) {
    const raw = fields[key];
    if (raw === null || raw === undefined) continue;
    const value = normalizeHeyboxIdValue(String(raw));
    if (value !== "") return value;
  }
  return "";
}

export function readAccountIdFromRaw(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const text = raw.trim();
  // A bare numeric string is an id; anything else is a JSON snapshot that
  // must be searched field by field.
  if (/^\d+$/.test(text)) return text;
  let parsed: unknown;
  try {
    // JSON.parse returns any; re-stating the result as unknown keeps it untyped.
    parsed = JSON.parse(text) as unknown;
  } catch {
    return "";
  }
  return readAccountIdField(parsed);
}

export function readAccountIdFromStorage(): string {
  for (const key of ACCOUNT_ID_STORAGE_KEYS) {
    const local = readAccountIdFromRaw(localStore.read(key));
    if (local !== "") return local;
    const session = readAccountIdFromRaw(sessionStore.read(key));
    if (session !== "") return session;
  }
  return "";
}

// The site's store bridge is not part of any public typing; it is read as an
// untyped host object and every shape is checked before use.
interface StoreBridge {
  readonly read?: (keys: readonly string[]) => unknown;
}

interface StoreSnapshotEntry {
  readonly exists?: unknown;
  readonly value?: unknown;
}

interface StoreSnapshotResult {
  readonly data?: { readonly snapshots?: readonly { readonly entry?: StoreSnapshotEntry }[] };
}

export async function readAccountIdFromStore(): Promise<string> {
  const host: unknown = Reflect.get(window, "storeV2API");
  const store = asRecord(host);
  if (store === null || typeof store["read"] !== "function") return "";
  let pending: unknown;
  try {
    pending = (store["read"] as (keys: readonly string[]) => unknown)(["account.heybox_id"]);
  } catch {
    return "";
  }
  // The page can hand back a cross-realm thenable, which fails instanceof.
  // Mirror the original duck-typed check so those still resolve.
  if (pending === null || typeof pending !== "object") return "";
  if (typeof Reflect.get(pending, "then") !== "function") return "";
  let snapshot: unknown;
  try {
    snapshot = await pending;
  } catch {
    return "";
  }
  const result = asRecord(snapshot);
  if (result === null) return "";
  const data = asRecord(result["data"]);
  if (data === null) return "";
  const snapshots = data["snapshots"];
  if (!Array.isArray(snapshots) || snapshots.length === 0) return "";
  const first = asRecord(snapshots[0]);
  if (first === null) return "";
  const entry = asRecord(first["entry"]);
  if (entry === null || entry["exists"] !== true) return "";
  const value = entry["value"];
  if (value === null || value === undefined) return "";
  return normalizeHeyboxIdValue(String(value));
}

export async function readAccountIdFromRestore(signal?: AbortSignal | null): Promise<string> {
  const query = new URLSearchParams(createApiParams(ACCOUNT_ID_RESTORE_PATH));
  const url = "https://api.xiaoheihe.cn" + ACCOUNT_ID_RESTORE_PATH + "?" + query.toString();
  const response = await fetchWithTimeout(url, {
    credentials: "include",
    cache: "no-store",
    headers: { accept: "application/json" },
    ...(signal === undefined || signal === null ? {} : { signal }),
  });
  if (!response.ok) return "";
  const raw: unknown = await response.json();
  const data = asRecord(raw);
  if (data === null || data["status"] !== "ok") return "";
  const result = asRecord(data["result"]);
  if (result === null) return "";
  const detail = readAccountIdField(result["account_detail"]);
  if (detail !== "") return detail;
  const profile = readAccountIdField(result["profile"]);
  if (profile !== "") return profile;
  return readAccountIdField(result);
}

export function rememberAccountId(value: string): string {
  if (value === "") return "";
  accountIdCache.value = value;
  accountIdCache.at = Date.now();
  return value;
}

export async function resolveHeyboxId(signal?: AbortSignal | null): Promise<string> {
  const cookieId = getHeyboxId();
  if (cookieId !== "") return rememberAccountId(cookieId);
  if (accountIdCache.value !== "" && Date.now() - accountIdCache.at < ACCOUNT_ID_CACHE_TTL_MS) {
    return accountIdCache.value;
  }
  const storeId = await readAccountIdFromStore();
  if (storeId !== "") return rememberAccountId(storeId);
  const storageId = readAccountIdFromStorage();
  if (storageId !== "") return rememberAccountId(storageId);
  const restored = await readAccountIdFromRestore(signal);
  if (restored !== "") return rememberAccountId(restored);
  return "";
}
