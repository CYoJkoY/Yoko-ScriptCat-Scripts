import {
  FIVE_HOUR_MS,
  FRESH_MS,
  MAX_CACHE_AGE_MS,
  RESET_SLACK_MS,
  STORAGE_KEY_OFFICIAL_CACHE,
  WEEK_MS,
} from "../config";
import type {
  CachePayload,
  Metric,
  MetricKind,
  QuotaCommitInput,
} from "../types";
import { getAccountPrefix } from "./account";
import { sanitizeMetric } from "./quota";
import { quotaState, requestUiUpdate } from "./state";
import { toEpochMs } from "./time";
import { localStore } from "../storage/browser";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function officialCacheKey(): string {
  return `${STORAGE_KEY_OFFICIAL_CACHE}:${getAccountPrefix() || "default"}`;
}

export function commitOfficialQuota(
  extracted: QuotaCommitInput | null,
  sourceTag: string,
  saveStorage = true,
): boolean {
  if (!extracted) return false;
  const nowMs = Date.now();
  const fromCache = sourceTag === "cache";

  const applyMetric = (kind: MetricKind, incoming: unknown): boolean => {
    const clean = sanitizeMetric(incoming, kind, nowMs);
    if (!clean) return false;

    const prev = quotaState[kind];
    const prevFresh =
      prev.pct !== null && prev.updatedAt > 0 && nowMs - prev.updatedAt < FRESH_MS;

    if (prevFresh && clean.confidence < (prev.confidence || 0)) return false;

    const resetAt =
      clean.resetAt !== null
        ? clean.resetAt
        : prev.resetAt && prev.resetAt > nowMs
          ? prev.resetAt
          : null;

    quotaState[kind] = {
      ...clean,
      resetAt,
      rawResetText: clean.rawResetText || (resetAt ? prev.rawResetText : ""),
      updatedAt: fromCache ? 0 : nowMs,
    };
    return true;
  };

  const ok5h = applyMetric("fiveHour", extracted.fiveHour);
  const ok7d = applyMetric("weekly", extracted.weekly);
  if (!ok5h && !ok7d) return false;

  quotaState.source = sourceTag;
  quotaState.lastSyncTime = extracted.timestamp || nowMs;
  if (!fromCache) quotaState.lastError = "";

  if (saveStorage) {
    const payload: CachePayload = {
      timestamp: quotaState.lastSyncTime,
      source: sourceTag,
      fiveHour: quotaState.fiveHour,
      weekly: quotaState.weekly,
    };
    // Storage failures leave the in-session quota untouched.
    localStore.writeJson(officialCacheKey(), payload);
  }

  requestUiUpdate();
  return true;
}

export function restoreCachedOfficialQuota(): void {
  try {
    const raw = localStore.read(officialCacheKey());
    if (raw === null || raw === "") return;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return;

    const hasLiveData =
      quotaState.source !== "cache" &&
      (quotaState.fiveHour.pct !== null || quotaState.weekly.pct !== null);
    const parsedTimestamp = Number(parsed["timestamp"] || 0);
    if (hasLiveData && quotaState.lastSyncTime >= parsedTimestamp) return;

    const now = Date.now();
    const cacheAge = now - parsedTimestamp;
    if (!Number.isFinite(cacheAge) || cacheAge < 0 || cacheAge > MAX_CACHE_AGE_MS) {
      return;
    }
    const restoreMetric = (metric: unknown, kind: MetricKind): Metric | null => {
      const windowMs = kind === "fiveHour" ? FIVE_HOUR_MS : WEEK_MS;
      const record = isRecord(metric) ? metric : null;
      const rawResetAt = record ? toEpochMs(record["resetAt"], now) : null;
      if (rawResetAt !== null && rawResetAt - now > windowMs + RESET_SLACK_MS) {
        return null;
      }
      const clean = sanitizeMetric(metric, kind, now);
      if (!clean) return null;
      if (clean.resetAt !== null && clean.resetAt <= now) {
        clean.pct = null;
        clean.usedPct = null;
        clean.used = null;
        clean.limit = null;
        clean.resetAt = null;
        clean.rawResetText = "";
      }
      clean.updatedAt = 0;
      return clean;
    };

    const fiveHourRecord = parsed["fiveHour"];
    const weeklyRecord = parsed["weekly"];
    const fiveHourRaw = isRecord(fiveHourRecord)
      ? { confidence: 0, ...fiveHourRecord }
      : null;
    const weeklyRaw = isRecord(weeklyRecord) ? { confidence: 0, ...weeklyRecord } : null;

    const fiveHour = restoreMetric(fiveHourRaw, "fiveHour");
    const weekly = restoreMetric(weeklyRaw, "weekly");

    if (!fiveHour && !weekly) return;

    commitOfficialQuota(
      {
        timestamp: parsedTimestamp,
        fiveHour,
        weekly,
        strategy: "cache",
      },
      "cache",
      false,
    );
    quotaState.lastSyncTime = parsedTimestamp;
  } catch {
    // Ignore cache parse errors.
  }
}
