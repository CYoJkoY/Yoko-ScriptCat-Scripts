import { parseRejectDiag } from "./state";

export interface PctResult {
  pct: number;
  usedPct: number;
}

export interface PctOptions {
  allowBare?: boolean;
}

const CSS_LIKE_RE =
  /(?:^|[;{]\s*)(?:width|height|min-width|max-width|min-height|max-height|opacity|transform|translate|rotate|scale|stroke|fill|margin|padding|border|font-size|line-height|flex|top|left|right|bottom)\s*:/i;

export function isQuotaTextCandidate(text: unknown): boolean {
  if (typeof text !== "string") return false;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 160) return false;
  if (/[{}<>]/.test(trimmed)) return false;
  if (CSS_LIKE_RE.test(trimmed)) return false;
  return true;
}

export function pctFromTextWithContext(
  text: unknown,
  options: PctOptions = {},
): PctResult | null {
  if (typeof text !== "string" || !text) return null;
  if (/[{}<>]/.test(text) || CSS_LIKE_RE.test(text)) {
    parseRejectDiag.cssLike += 1;
    return null;
  }
  const allowBare = options.allowBare === true;
  const re = /(\d{1,3}(?:\.\d+)?)\s*%/g;
  let match: RegExpExecArray | null;
  let usedPct: number | null = null;
  let remainingPct: number | null = null;
  let barePct: number | null = null;

  const directionOf = (fragment: string): "remaining" | "used" | null => {
    if (/(剩余|剩餘|可用|余量|餘量|remaining|available|left)/i.test(fragment)) {
      return "remaining";
    }
    if (/(已用|已使用|使用量|用量|used|consumed|utiliz)/i.test(fragment)) {
      return "used";
    }
    return null;
  };

  while ((match = re.exec(text)) !== null) {
    const amount = match[1];
    if (amount === undefined) continue;
    const value = Math.min(100, Math.max(0, Math.round(parseFloat(amount))));
    const lineStart = text.lastIndexOf("\n", match.index);
    const lineEndIdx = text.indexOf("\n", match.index);
    const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx;
    const before = text.slice(Math.max(lineStart + 1, match.index - 12), match.index);
    const line = text.slice(lineStart + 1, lineEnd);
    const after = text.slice(match.index, Math.min(lineEnd, match.index + 12));
    const direction = directionOf(before) || directionOf(after) || directionOf(line);

    if (direction === "remaining") {
      if (remainingPct === null) remainingPct = value;
    } else if (direction === "used") {
      if (usedPct === null) usedPct = value;
    } else if (barePct === null) {
      barePct = value;
    }
  }

  if (remainingPct !== null) return { pct: remainingPct, usedPct: 100 - remainingPct };
  if (usedPct !== null) return { pct: 100 - usedPct, usedPct };
  if (barePct === null) return null;

  if (!allowBare) {
    parseRejectDiag.barePercent += 1;
    return null;
  }
  return { pct: 100 - barePct, usedPct: barePct };
}
