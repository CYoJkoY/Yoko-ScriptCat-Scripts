let observedAccountPrefix = "";

export function noteAccountPrefix(url: unknown): void {
  if (typeof url !== "string" || !url) return;
  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.origin !== window.location.origin) return;
    const match = parsed.pathname.match(/^(\/u\/\d+)\//);
    if (!match) return;
    if (observedAccountPrefix && observedAccountPrefix !== match[1]) return;
    observedAccountPrefix = match[1];
  } catch {
    return;
  }
}

export function getAccountPrefix(): string {
  const match = window.location.pathname.match(/^(\/u\/\d+)\b/);
  if (match) return match[1];
  return observedAccountPrefix;
}

export function discoverAccountPrefix(): string {
  const current = getAccountPrefix();
  if (current) return current;
  try {
    const entries = window.performance.getEntriesByType("resource");
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (!entry || typeof entry.name !== "string") continue;
      if (!/\/BardChatUi\/|batchexecute/.test(entry.name)) continue;
      noteAccountPrefix(entry.name);
      if (getAccountPrefix()) break;
    }
  } catch {
    return getAccountPrefix();
  }
  return getAccountPrefix();
}

export function getOfficialUsageUrl(): string {
  return `${window.location.origin}${getAccountPrefix()}/usage`;
}

export function isSameUsagePath(
  finalPath: unknown,
  candidatePath: unknown,
  allowBareRedirect = false,
): boolean {
  const normalize = (path: unknown): string =>
    typeof path === "string" ? path.replace(/\/+$/, "") : "";
  const target = normalize(candidatePath);
  if (!target) return false;
  const final = normalize(finalPath);
  if (final === target) return true;
  if (target !== "/usage" || allowBareRedirect !== true) return false;
  return /^\/u\/\d+\/usage$/.test(final);
}
