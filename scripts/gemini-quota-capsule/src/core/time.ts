type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Normalize timestamps from Google Timestamp objects, second/nanosecond tuples,
 * ten or thirteen digit strings, and ISO 8601 strings into milliseconds.
 */
export function toEpochMs(value: unknown, nowMs = Date.now()): number | null {
  const minMs = nowMs - 10 * 60 * 1000;
  const maxMs = nowMs + 10 * 86400 * 1000;
  const plausible = (ms: number): boolean =>
    Number.isFinite(ms) && ms >= minMs && ms <= maxMs;

  if (typeof value === "number" && Number.isFinite(value)) {
    if (plausible(value)) return Math.round(value);
    if (plausible(value * 1000)) return Math.round(value * 1000);
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{10,13}$/.test(trimmed)) return toEpochMs(Number(trimmed), nowMs);
    if (!/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return null;
    const parsed = Date.parse(trimmed);
    return plausible(parsed) ? parsed : null;
  }

  if (Array.isArray(value)) {
    if (!value.length) return null;
    const head: unknown = value[0];
    if (typeof head === "number") return toEpochMs(head, nowMs);
    if (head && typeof head === "object") return toEpochMs(head, nowMs);
    return null;
  }

  if (isRecord(value)) {
    for (const key of [
      "seconds",
      "second",
      "secs",
      "sec",
      "epochSeconds",
      "timestamp",
      "millis",
      "milliseconds",
      "ms",
      "epochMillis",
    ]) {
      if (value[key] === undefined) continue;
      const parsed = toEpochMs(value[key], nowMs);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

// Relative durations must be introduced by a reset / refresh / remaining anchor.
const RELATIVE_RESET_PATTERNS: ReadonlyArray<RegExp> = [
  /(?:reset(?:s|ting)?|restor(?:e|es|ing)|renew(?:s|ed|ing)?)\s+(?:in|after)\s+([^.;,，。!?]{1,40})/i,
  /([^.;,，。!?]{1,40}?)\s+(?:until|before)\s+(?:the\s+)?(?:next\s+)?(?:reset|refill|renew)/i,
  /([^.;,，。!?]{1,40}?)\s*(?:后|後)\s*(?:重置|刷新|恢复|恢復|重設|リセット)/,
  /(?:剩余|剩餘|还剩|還剩|尚有|还有|還有)\s*([^.;,，。!?]{1,40})/,
  /あと\s*([^。!?]{1,40})/,
];

const DURATION_TOKEN_RE =
  /(\d+(?:\.\d+)?)\s*(weeks?|w|週間|週|周|days?|d|天|日|hours?|hrs?|hr|h|个?小时|個?小時|時間|minutes?|mins?|min|m|分钟|分鐘|分(?!钟|鐘|析|辨|部)|seconds?|secs?|sec|s|秒)\s*$/i;

function durationUnitToMs(unit: string): number | null {
  const normalized = unit.toLowerCase();
  if (/^(w|weeks?|周|週|週間)$/.test(normalized)) return 7 * 86400 * 1000;
  if (/^(d|days?|天|日)$/.test(normalized)) return 86400 * 1000;
  if (/^(h|hr|hrs|hours?|小时|小時|時間)$/.test(normalized)) return 3600 * 1000;
  if (/^(m|min|mins|minutes?|分钟|分鐘|分)$/.test(normalized)) return 60 * 1000;
  if (/^(s|sec|secs|seconds?|秒)$/.test(normalized)) return 1000;
  return null;
}

function sumTrailingDurations(fragment: string): number | null {
  if (typeof fragment !== "string") return null;
  let rest = fragment
    .trim()
    .replace(/[)）\]】]$/, "")
    .trim();
  let total = 0;
  for (let guard = 0; guard < 4; guard += 1) {
    const match = rest.match(DURATION_TOKEN_RE);
    if (!match) break;
    const amountText = match[1];
    const unitText = match[2];
    if (amountText === undefined || unitText === undefined) break;
    const unitMs = durationUnitToMs(unitText);
    if (unitMs === null) break;
    total += parseFloat(amountText) * unitMs;
    rest = rest.slice(0, match.index).trim();
  }
  return total > 0 ? total : null;
}

/**
 * Recover the real reset timestamp from official reset text. Supports absolute
 * ISO dates, English and Chinese dates, clock times, and anchored countdowns.
 */
export function parseOfficialResetTextToTimestamp(
  text: unknown,
  nowMs = Date.now(),
): number | null {
  if (!text || typeof text !== "string") return null;
  const clean = text.replace(/\s+/g, " ").trim();
  const minMs = nowMs - 10 * 60 * 1000;
  const maxMs = nowMs + 30 * 86400 * 1000;

  const isoMatch = clean.match(
    /(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?)?/,
  );
  if (isoMatch && isoMatch[4] !== undefined) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const hour = Number(isoMatch[4]);
    const minute = Number(isoMatch[5]);
    const second = isoMatch[6] === undefined ? 0 : Number(isoMatch[6]);
    const zone = isoMatch[7];
    const pad = (n: number): string => String(n).padStart(2, "0");
    const absolute = zone
      ? Date.parse(
          `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}${zone === "Z" ? "Z" : zone.replace(/^([+-]\d{2})(\d{2})$/, "$1:$2")}`,
        )
      : new Date(year, month - 1, day, hour, minute, second, 0).getTime();
    if (Number.isFinite(absolute) && absolute >= minMs && absolute <= maxMs) {
      return absolute;
    }
  }

  const cnDateMatch = clean.match(
    /(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*(上午|下午|晚上|凌晨)?\s*(\d{1,2}):(\d{2}))?/,
  );
  if (cnDateMatch) {
    const explicitYear = cnDateMatch[1] ? Number(cnDateMatch[1]) : null;
    const month = Number(cnDateMatch[2]);
    const day = Number(cnDateMatch[3]);
    const half = cnDateMatch[4] || "";
    let hour = cnDateMatch[5] === undefined ? 0 : Number(cnDateMatch[5]);
    const minute = cnDateMatch[6] === undefined ? 0 : Number(cnDateMatch[6]);
    if ((half === "下午" || half === "晚上") && hour < 12) hour += 12;
    if (half === "凌晨" && hour === 12) hour = 0;
    if (
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= 31 &&
      hour <= 23 &&
      minute <= 59
    ) {
      const year =
        explicitYear === null ? new Date(nowMs).getFullYear() : explicitYear;
      let absolute = new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
      if (explicitYear === null && absolute < nowMs - 86400 * 1000) {
        absolute = new Date(year + 1, month - 1, day, hour, minute, 0, 0).getTime();
      }
      if (absolute >= minMs && absolute <= maxMs) return absolute;
      return null;
    }
  }

  const monthDateMatch = clean.match(
    /\b(?:resets?|refresh(?:es|ing)?|renews?)?\s*(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?\s+(?:at\s*)?(\d{1,2}):(\d{2})\s*(AM|PM)?/i,
  );
  if (monthDateMatch) {
    const monthNames = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ];
    const monthLabel = monthDateMatch[1];
    const month = monthLabel
      ? monthNames.indexOf(monthLabel.slice(0, 3).toLowerCase())
      : -1;

    let hour = Number(monthDateMatch[4]);
    const minute = Number(monthDateMatch[5]);
    const meridiem = (monthDateMatch[6] || "").toUpperCase();
    if (meridiem === "PM" && hour < 12) hour += 12;
    if (meridiem === "AM" && hour === 12) hour = 0;
    const year = monthDateMatch[3]
      ? Number(monthDateMatch[3])
      : new Date(nowMs).getFullYear();
    if (month >= 0 && hour <= 23 && minute <= 59) {
      const dayNumber = Number(monthDateMatch[2]);
      let absolute = new Date(year, month, dayNumber, hour, minute, 0, 0).getTime();
      if (!monthDateMatch[3] && absolute < nowMs - 86400 * 1000) {
        absolute = new Date(year + 1, month, dayNumber, hour, minute, 0, 0).getTime();
      }
      if (absolute >= minMs && absolute <= maxMs) return absolute;
      return null;
    }
  }

  const clockMatch = clean.match(
    /(?:(tomorrow|明天|明日|today|今天|今日)\s*)?(?:at\s*|于\s*|於\s*)?(上午|下午|早上|晚上|凌晨)?\s*(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i,
  );
  if (clockMatch) {
    const dayWord = (clockMatch[1] || "").toLowerCase();
    const cnHalf = clockMatch[2] || "";
    let hr = parseInt(clockMatch[3] ?? "", 10);
    const mn = parseInt(clockMatch[4] ?? "", 10);
    const enHalf = (clockMatch[5] || "").toUpperCase();

    if (hr >= 0 && hr <= 23 && mn >= 0 && mn <= 59) {
      if (
        (enHalf === "PM" || cnHalf === "下午" || cnHalf === "晚上") &&
        hr < 12
      ) {
        hr += 12;
      } else if ((enHalf === "AM" || cnHalf === "凌晨") && hr === 12) {
        hr = 0;
      }
      const target = new Date(nowMs);
      target.setHours(hr, mn, 0, 0);
      if (dayWord === "tomorrow" || dayWord === "明天" || dayWord === "明日") {
        target.setDate(target.getDate() + 1);
      } else if (target.getTime() <= nowMs) {
        target.setDate(target.getDate() + 1);
      }
      const absolute = target.getTime();
      if (absolute >= minMs && absolute <= maxMs) return absolute;
    }
  }

  for (const pattern of RELATIVE_RESET_PATTERNS) {
    const match = clean.match(pattern);
    if (!match) continue;
    const fragment = match[1];
    if (fragment === undefined) continue;
    const deltaMs = sumTrailingDurations(fragment);
    if (deltaMs !== null && deltaMs > 0 && deltaMs <= 30 * 24 * 3600 * 1000) {
      return Math.round(nowMs + deltaMs);
    }
  }

  return null;
}
