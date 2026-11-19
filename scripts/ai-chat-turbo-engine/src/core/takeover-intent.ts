import { TAKEOVER_INTENT_STORAGE_KEY } from "../config";
import { createReportedStorage } from "../storage/reported";
import { reportRecoverableError } from "./diagnostics";

/** A stale intent must not arm fullscreen for an unrelated later gesture. */
const TAKEOVER_INTENT_TTL_MS = 60_000;

interface TakeoverIntent {
  createdAt: number;
}

function isTakeoverIntent(value: unknown): value is TakeoverIntent {
  if (typeof value !== "object" || value === null) return false;
  const createdAt: unknown = Reflect.get(value, "createdAt");
  return typeof createdAt === "number" && Number.isFinite(createdAt);
}

/**
 * Sites whose new-chat action replaces the document destroy every in-memory
 * flag, including the armed takeover. Keep the fallback intent in
 * `sessionStorage` so the next document can claim the reserved key on its
 * first real gesture. The one-minute expiry prevents a closed page from
 * arming fullscreen for an unrelated tab reopened in the same session.
 */
const takeoverStore = createReportedStorage("sessionStorage", (failure) => {
  reportRecoverableError("reserve shortcut takeover", failure.error);
});

export function rememberTakeoverIntent(): boolean {
  return takeoverStore.writeJson(TAKEOVER_INTENT_STORAGE_KEY, {
    createdAt: Date.now(),
  } satisfies TakeoverIntent);
}

export function consumeTakeoverIntent(): boolean {
  const raw = takeoverStore.readJson(TAKEOVER_INTENT_STORAGE_KEY, null);
  takeoverStore.remove(TAKEOVER_INTENT_STORAGE_KEY);
  return (
    isTakeoverIntent(raw) === true &&
    Date.now() - raw.createdAt < TAKEOVER_INTENT_TTL_MS
  );
}

export function forgetTakeoverIntent(): void {
  takeoverStore.remove(TAKEOVER_INTENT_STORAGE_KEY);
}
