import type { RpcFrame } from "../types";

/**
 * Parse a batchexecute response into wrb.fr frames. Framing residue and opaque
 * payloads are ignored or preserved exactly as the original did.
 */
export function parseBatchExecuteResponse(rawText: unknown): RpcFrame[] {
  if (!rawText || typeof rawText !== "string") return [];
  const results: RpcFrame[] = [];
  const stripped = rawText.replace(/^\)\]\}'\s*/, "");
  const seen = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
        try {
          visit(JSON.parse(trimmed));
        } catch {
          // Plain text payload.
        }
      }
      return;
    }
    if (!Array.isArray(value)) return;
    if (
      value[0] === "wrb.fr" &&
      typeof value[1] === "string" &&
      typeof value[2] === "string"
    ) {
      const rpcId = value[1];
      const payloadText = value[2];
      const key = `${rpcId}\u0000${payloadText}`;
      if (seen.has(key)) return;
      seen.add(key);
      let payload: unknown = payloadText;
      try {
        payload = JSON.parse(payloadText);
      } catch {
        // Opaque payload.
      }
      results.push({ rpcId, payload });
      return;
    }
    for (const child of value) visit(child);
  };
  for (const line of stripped.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      visit(JSON.parse(trimmed));
    } catch {
      // Framing residue.
    }
  }
  return results;
}
