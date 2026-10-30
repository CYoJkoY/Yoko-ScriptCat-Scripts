import { CONFIDENCE, FIVE_HOUR_MS, RESET_SLACK_MS, WEEK_MS } from "../config";
import type { Metric, MetricDraft, MetricKind, ParsedQuota } from "../types";
import { parseRejectDiag } from "./state";
import { isQuotaTextCandidate, pctFromTextWithContext } from "./text";
import { parseOfficialResetTextToTimestamp, toEpochMs } from "./time";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface ResetPick {
  resetAt: number | null;
  misbound: boolean;
}

interface StructuredPools {
  fiveHour: Metric | null;
  weekly: Metric | null;
}

interface WizOptions {
  useLabels?: boolean;
}

export function sanitizeMetric(
  metric: unknown,
  kind: MetricKind,
  nowMs = Date.now(),
): Metric | null {
  if (!isRecord(metric)) return null;
  const windowMs = kind === "fiveHour" ? FIVE_HOUR_MS : WEEK_MS;

  let pct: number | null = null;
  if (typeof metric["pct"] === "number" && Number.isFinite(metric["pct"])) {
    pct = Math.min(100, Math.max(0, Math.round(metric["pct"])));
  }
  const resetOnly = pct === null && metric["allowResetOnly"] === true;
  if (pct === null && !resetOnly) return null;

  const usedPct =
    typeof metric["usedPct"] === "number" && Number.isFinite(metric["usedPct"])
      ? Math.min(100, Math.max(0, Math.round(metric["usedPct"])))
      : pct === null
        ? null
        : 100 - pct;

  let resetAt = toEpochMs(metric["resetAt"], nowMs);
  let rawResetText =
    typeof metric["rawResetText"] === "string" ? metric["rawResetText"] : "";
  if (resetAt === null) {
    rawResetText = "";
  } else {
    const remaining = resetAt - nowMs;
    if (remaining > windowMs + RESET_SLACK_MS) return null;
    if (remaining < 0) {
      resetAt = null;
      rawResetText = "";
    }
  }

  const confidence =
    typeof metric["confidence"] === "number"
      ? metric["confidence"]
      : CONFIDENCE.heuristic;
  if (
    !resetOnly &&
    usedPct === 100 &&
    resetAt === null &&
    confidence <= CONFIDENCE.heuristic
  ) {
    parseRejectDiag.unverifiedFull += 1;
    return null;
  }

  return {
    pct,
    usedPct,
    used:
      typeof metric["used"] === "number" && Number.isFinite(metric["used"])
        ? metric["used"]
        : null,
    limit:
      typeof metric["limit"] === "number" && Number.isFinite(metric["limit"])
        ? metric["limit"]
        : null,
    resetAt,
    rawResetText,
    confidence,
    allowResetOnly: resetOnly,
    updatedAt: 0,
  };
}

export function poolKindFromLabel(label: unknown): MetricKind | null {
  if (typeof label !== "string") return null;
  const upper = label.trim().toUpperCase();
  if (!upper) return null;
  if (upper.includes("WEEK") || upper.includes("604800")) return "weekly";
  if (
    upper.includes("FIVE_HOURLY") ||
    upper.includes("FIVE_HOUR") ||
    upper.includes("FIVEHOUR") ||
    upper.includes("5_HOUR") ||
    upper.includes("5H") ||
    upper.includes("HOURLY") ||
    upper.includes("PER_HOUR") ||
    upper.includes("PERHOUR") ||
    upper.includes("18000")
  ) {
    return "fiveHour";
  }
  if (upper.includes("7D") || upper.includes("7_DAY")) return "weekly";
  return null;
}

const POOL_KIND_KEY_RE =
  /^(pool_?type|pool_?id|pool_?name|poolType|poolId|bucket|bucket_?type|type|kind|window_?type|quota_?type|limit_?type|id|name)$/i;
const USED_PCT_KEY_RE =
  /(?:percentage|percent|pct|ratio|fraction|utiliz).*used|used.*(?:percentage|percent|pct|ratio|fraction|utiliz)/i;
const REMAINING_PCT_KEY_RE =
  /(?:remaining|available|left|unused).*(?:percentage|percent|pct|ratio|fraction)|(?:percentage|percent|pct|ratio|fraction).*(?:remaining|available|left|unused)/i;
const PCT_KEY_RE = /(percent|pct|ratio|utiliz)/i;
const USED_KEY_RE =
  /^(used|used_?count|used_?amount|consumed|count|requests|messages)$/i;
const LIMIT_KEY_RE = /^(limit|max|maximum|quota|capacity|total|cap)$/i;
const RESET_KEY_RE = /(refresh|reset|expire|renew)/i;
const QUOTA_SCOPE_KEY_RE = /^(gxu|pool|window|quota|limit|usage|refresh|billing|rate)/i;
const FRACTION_KEY_RE = /(fraction|ratio|0to1|0_to_1)/i;

export function poolKindFromRecord(record: unknown): MetricKind | null {
  if (!isRecord(record)) return null;
  for (const [key, value] of Object.entries(record)) {
    if (!POOL_KIND_KEY_RE.test(key)) continue;
    const kind = poolKindFromLabel(typeof value === "string" ? value : "");
    if (kind) return kind;
  }
  return null;
}

export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value.trim())) {
    return Number(value.trim());
  }
  if (
    Array.isArray(value) &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0])
  ) {
    return value[0];
  }
  if (isRecord(value)) {
    for (const key of ["value", "number", "amount", "count", "used", "percent"]) {
      const candidate = value[key];
      if (typeof candidate === "number" && Number.isFinite(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

function findNumericField(
  scopes: ReadonlyArray<UnknownRecord>,
  regex: RegExp,
): { key: string; number: number } | null {
  for (const scope of scopes) {
    for (const [key, value] of Object.entries(scope)) {
      if (!regex.test(key)) continue;
      const number = toFiniteNumber(value);
      if (number !== null) return { key, number };
    }
  }
  return null;
}

export function pctHintFromKey(key: unknown): "fraction" | "percent" | null {
  if (typeof key !== "string" || !key) return null;
  return FRACTION_KEY_RE.test(key) ? "fraction" : "percent";
}

export function normalizePctValue(
  raw: unknown,
  hint: "fraction" | "percent" | null = null,
): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return null;
  if (hint === "fraction") return Math.min(100, Math.round(raw * 100));
  if (hint === "percent") return Math.min(100, Math.round(raw));
  if (raw > 0 && raw < 1 && !Number.isInteger(raw)) {
    return Math.min(100, Math.round(raw * 100));
  }
  return Math.min(100, Math.round(raw));
}

export function collectResetCandidates(
  record: unknown,
  nowMs: number,
  depth = 0,
  out: number[] = [],
): number[] {
  if (!record || typeof record !== "object" || depth > 2) return out;
  for (const [key, value] of Object.entries(record)) {
    if (RESET_KEY_RE.test(key)) {
      const direct = toEpochMs(value, nowMs);
      if (direct !== null) {
        out.push(direct);
        continue;
      }
      if (typeof value === "string") {
        const parsed = parseOfficialResetTextToTimestamp(value, nowMs);
        if (parsed !== null) out.push(parsed);
      }
    }
    if (value && typeof value === "object") {
      collectResetCandidates(value, nowMs, depth + 1, out);
    }
  }
  return out;
}

export function pickResetAt(
  candidates: ReadonlyArray<number>,
  kind: MetricKind,
  nowMs: number,
): ResetPick {
  const windowMs = kind === "fiveHour" ? FIVE_HOUR_MS : WEEK_MS;
  const unique = [...new Set(candidates)].sort((a, b) => a - b);
  if (!unique.length) return { resetAt: null, misbound: false };

  const fitting = unique.filter(
    (ts) => ts > nowMs && ts - nowMs <= windowMs + RESET_SLACK_MS,
  );
  const beyondWindow = unique.filter((ts) => ts - nowMs > windowMs + RESET_SLACK_MS);

  if (!fitting.length) {
    return { resetAt: null, misbound: beyondWindow.length > 0 };
  }
  if (fitting.length > 1) return { resetAt: null, misbound: false };
  return { resetAt: fitting[0] ?? null, misbound: false };
}

function findNumberByKey(scope: unknown, regex: RegExp): number | null {
  if (!isRecord(scope)) return null;
  for (const [key, value] of Object.entries(scope)) {
    if (!regex.test(key)) continue;
    const number = toFiniteNumber(value);
    if (number !== null) return number;
  }
  return null;
}

export function readMetricFromRecord(
  record: unknown,
  kind: MetricKind,
  nowMs: number,
): MetricDraft | null {
  if (!isRecord(record)) return null;

  const scopes: UnknownRecord[] = [record];
  for (const [key, value] of Object.entries(record)) {
    if (!isRecord(value)) continue;
    if (QUOTA_SCOPE_KEY_RE.test(key)) scopes.push(value);
  }

  const remainingPctField = findNumericField(scopes, REMAINING_PCT_KEY_RE);
  const usedPctField = findNumericField(scopes, USED_PCT_KEY_RE);
  const ambiguousPctField = findNumericField(scopes, PCT_KEY_RE);

  let pct: number | null = null;
  let usedPct: number | null = null;

  if (remainingPctField) {
    pct = normalizePctValue(
      remainingPctField.number,
      pctHintFromKey(remainingPctField.key),
    );
    if (pct !== null) usedPct = 100 - pct;
  } else if (usedPctField) {
    const value = normalizePctValue(
      usedPctField.number,
      pctHintFromKey(usedPctField.key),
    );
    if (value !== null) {
      usedPct = value;
      pct = 100 - value;
    }
  } else if (ambiguousPctField) {
    const value = normalizePctValue(
      ambiguousPctField.number,
      pctHintFromKey(ambiguousPctField.key),
    );
    if (value !== null) {
      usedPct = value;
      pct = 100 - value;
    }
  }

  let used: number | null = null;
  let limit: number | null = null;

  if (pct === null) {
    for (const scope of scopes) {
      const usedValue = findNumberByKey(scope, USED_KEY_RE);
      const limitValue = findNumberByKey(scope, LIMIT_KEY_RE);
      if (
        usedValue !== null &&
        limitValue !== null &&
        limitValue > 0 &&
        usedValue >= 0 &&
        usedValue <= limitValue
      ) {
        used = usedValue;
        limit = limitValue;
        usedPct = Math.min(100, Math.max(0, Math.round((usedValue / limitValue) * 100)));
        pct = 100 - usedPct;
        break;
      }
    }
  } else {
    used = findNumberByKey(record, USED_KEY_RE);
    limit = findNumberByKey(record, LIMIT_KEY_RE);
  }

  if (pct === null) return null;

  const resetPick = pickResetAt(collectResetCandidates(record, nowMs), kind, nowMs);
  if (resetPick.misbound) return null;

  return {
    pct,
    usedPct,
    used,
    limit,
    resetAt: resetPick.resetAt,
    rawResetText: "",
  };
}

function flattenShallow(node: ReadonlyArray<unknown>, depth = 0): unknown[] {
  const out: unknown[] = [];
  for (const item of node) {
    if (Array.isArray(item) && depth < 2) {
      out.push(...flattenShallow(item, depth + 1));
    } else {
      out.push(item);
    }
  }
  return out;
}

export function readMetricFromArrayTuple(
  node: ReadonlyArray<unknown>,
  kind: MetricKind,
  nowMs: number,
): MetricDraft | null {
  const items = flattenShallow(node);
  const candidates: number[] = [];
  let pctInfo: { pct: number; usedPct: number } | null = null;

  for (const item of items) {
    if (typeof item === "number") {
      const timestamp = toEpochMs(item, nowMs);
      if (timestamp !== null) candidates.push(timestamp);
      continue;
    }
    if (typeof item === "string") {
      if (!isQuotaTextCandidate(item)) continue;
      if (!pctInfo) {
        const info = pctFromTextWithContext(item, { allowBare: false });
        if (info) {
          pctInfo = info;
          continue;
        }
      }
      const timestamp =
        toEpochMs(item, nowMs) || parseOfficialResetTextToTimestamp(item, nowMs);
      if (timestamp !== null) candidates.push(timestamp);
    }
  }

  if (!pctInfo) return null;

  const resetPick = pickResetAt(candidates, kind, nowMs);
  if (resetPick.misbound) return null;

  return {
    pct: pctInfo.pct,
    usedPct: pctInfo.usedPct,
    used: null,
    limit: null,
    resetAt: resetPick.resetAt,
    rawResetText: "",
  };
}

export function strictPoolKindFromLabel(label: unknown): MetricKind | null {
  if (typeof label !== "string") return null;
  const upper = label.trim().toUpperCase();
  if (!/^GXU_[A-Z0-9_]{2,}$/.test(upper)) return null;
  if (/(WEEK|7D|604800)/.test(upper)) return "weekly";
  if (/(FIVE_HOURLY|5H|HOUR|18000)/.test(upper)) return "fiveHour";
  return null;
}

export function collectStructuredPools(
  rootData: unknown,
  nowMs: number,
): StructuredPools | null {
  const found: StructuredPools = { fiveHour: null, weekly: null };
  let hits = 0;

  const record = (kind: MetricKind, candidate: MetricDraft): void => {
    if (found[kind]) return;
    const clean = sanitizeMetric(
      { ...candidate, confidence: CONFIDENCE.pools },
      kind,
      nowMs,
    );
    if (!clean) return;
    found[kind] = clean;
    hits += 1;
  };

  const walk = (node: unknown, depth: number): void => {
    if (!node || depth > 20) return;

    if (typeof node === "string") {
      const trimmed = node.trim();
      if (
        (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
        (trimmed.startsWith("{") && trimmed.endsWith("}"))
      ) {
        try {
          walk(JSON.parse(trimmed), depth + 1);
        } catch {
          // Ignore non-JSON strings.
        }
      }
      return;
    }

    if (Array.isArray(node)) {
      const labels = new Set<MetricKind>();
      for (const item of flattenShallow(node)) {
        const kind = strictPoolKindFromLabel(item);
        if (kind) labels.add(kind);
      }
      if (labels.size === 1) {
        const kind = [...labels][0];
        if (kind) {
          const metric = readMetricFromArrayTuple(node, kind, nowMs);
          if (metric) record(kind, metric);
        }
      }
      for (const child of node) walk(child, depth + 1);
      return;
    }

    if (isRecord(node)) {
      const kind = poolKindFromRecord(node);
      if (kind) {
        const metric = readMetricFromRecord(node, kind, nowMs);
        if (metric) record(kind, metric);
      }
      for (const child of Object.values(node)) walk(child, depth + 1);
    }
  };

  walk(rootData, 0);
  return hits > 0 ? found : null;
}

export function collectQuotaByLabels(
  rootData: unknown,
  nowMs: number,
): StructuredPools | null {
  let found5h: Metric | null = null;
  let found7d: Metric | null = null;

  const walk = (node: unknown, depth = 0): void => {
    if (depth > 16 || !node) return;

    if (typeof node === "string") {
      const trimmed = node.trim();
      if (
        (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
        (trimmed.startsWith("{") && trimmed.endsWith("}"))
      ) {
        try {
          walk(JSON.parse(trimmed), depth + 1);
        } catch {
          // Ignore non-JSON strings.
        }
      }
      return;
    }

    if (Array.isArray(node)) {
      const flatStrings = node.filter((x) => typeof x === "string").join(" ");
      const has5hLabel =
        /(?:5\s*-?\s*(?:hour|hr|h|小时|小時|時間)|five\s*-?\s*hour|hourly|per\s*hour|每小时|每小時|current\s*session|当前会话|会话|セッション)/i.test(
          flatStrings,
        ) ||
        node.includes(18000) ||
        node.includes("18000");
      const has7dLabel =
        /(?:7\s*-?\s*(?:day|d|天|日)|week(?:ly)?|每周|每週|週間)/i.test(flatStrings) ||
        node.includes(604800) ||
        node.includes("604800");

      if (has5hLabel !== has7dLabel) {
        const kind: MetricKind = has5hLabel ? "fiveHour" : "weekly";
        const existing = kind === "fiveHour" ? found5h : found7d;
        if (!existing) {
          const metric = readMetricFromArrayTuple(node, kind, nowMs);
          const clean = metric
            ? sanitizeMetric(
                { ...metric, confidence: CONFIDENCE.heuristic },
                kind,
                nowMs,
              )
            : null;
          if (clean) {
            if (kind === "fiveHour") found5h = clean;
            else found7d = clean;
          }
        }
      }

      for (const child of node) walk(child, depth + 1);
      return;
    }

    if (isRecord(node)) {
      const kind = poolKindFromRecord(node);
      if (kind) {
        const existing = kind === "fiveHour" ? found5h : found7d;
        if (!existing) {
          const metric = readMetricFromRecord(node, kind, nowMs);
          const clean = metric
            ? sanitizeMetric(
                { ...metric, confidence: CONFIDENCE.heuristic },
                kind,
                nowMs,
              )
            : null;
          if (clean) {
            if (kind === "fiveHour") found5h = clean;
            else found7d = clean;
          }
        }
      }
      for (const child of Object.values(node)) walk(child, depth + 1);
    }
  };

  walk(rootData, 0);
  if (!found5h && !found7d) return null;
  return { fiveHour: found5h, weekly: found7d };
}

export function extractQuotaFromWizStructure(
  rootData: unknown,
  nowMs = Date.now(),
  options: WizOptions = {},
): ParsedQuota | null {
  if (!rootData || typeof rootData !== "object") return null;

  const structured = collectStructuredPools(rootData, nowMs);
  const labeled =
    options.useLabels === false ? null : collectQuotaByLabels(rootData, nowMs);
  if (!structured && !labeled) return null;

  return {
    timestamp: nowMs,
    fiveHour:
      (structured && structured.fiveHour) || (labeled && labeled.fiveHour) || null,
    weekly: (structured && structured.weekly) || (labeled && labeled.weekly) || null,
    strategy: structured ? "pools" : "labels",
  };
}
