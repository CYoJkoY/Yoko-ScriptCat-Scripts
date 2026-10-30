const REPORT_LIMIT = 50;
const reported = new Set<string>();

/**
 * A userscript must keep the host page alive when an optional capability is
 * unavailable. Log the first distinct failure so it stays diagnosable without
 * flooding the console while a host selector or clipboard API fails repeatedly.
 */
export function reportRecoverableError(scope: string, error: unknown): void {
  const detail =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const key = `${scope}\u0000${detail}`;
  if (reported.has(key) || reported.size >= REPORT_LIMIT) return;
  reported.add(key);
  console.warn(`[AI Chat Turbo] ${scope} skipped: ${detail}`);
}
