import type { NetworkSample, RawFrameSample, ResponseSample, SnippetSample } from "../types";
import { parseBatchExecuteResponse } from "./batch";

const RAW_FRAME_LIMIT = 6;
const RAW_FRAME_MAX_CHARS = 24000;
export const rawFrameRing: RawFrameSample[] = [];
const RESPONSE_RING_LIMIT = 8;
const RESPONSE_MAX_CHARS = 12000;
export const responseRing: ResponseSample[] = [];

export const obsDiag = {
  batchExecSeen: 0,
  batchFrames: 0,
  quotaHits: 0,
  lastRpcIds: [] as string[],
  nonQuotaResponses: 0,
  responseReadFailures: 0,
};

const NET_RING_LIMIT = 24;
export const netRing: NetworkSample[] = [];
const NET_INTEREST_RE = /(batchexecute|usage|quota|limit|entitle|billing|gxu|tier)/i;

export function safeDiagnosticUrl(url: unknown, maxLength = 180): string {
  if (typeof url !== "string") return "";
  try {
    const parsed = new URL(url, window.location.href);
    const rpcids = parsed.searchParams.get("rpcids");
    const safeQuery = rpcids ? `?rpcids=${encodeURIComponent(rpcids)}` : "";
    const safe = `${parsed.origin}${parsed.pathname}${safeQuery}`;
    return safe.length > maxLength ? `${safe.slice(0, maxLength)}…` : safe;
  } catch {
    const safe = url.split(/[?#]/, 1)[0] ?? "";
    return safe.length > maxLength ? `${safe.slice(0, maxLength)}…` : safe;
  }
}

export function shortenUrl(url: unknown): string {
  if (typeof url !== "string") return "";
  try {
    const parsed = new URL(url, window.location.href);
    const rpcids = parsed.searchParams.get("rpcids");
    const safeQuery = rpcids ? `?rpcids=${encodeURIComponent(rpcids)}` : "";
    const safe = `${parsed.origin}${parsed.pathname}${safeQuery}`;
    return safe.length > 140 ? `${safe.slice(0, 140)}…` : safe;
  } catch {
    const safe = url.split(/[?#]/, 1)[0] ?? "";
    return safe.length > 140 ? `${safe.slice(0, 140)}…` : safe;
  }
}

export function noteNetwork(url: unknown, status: number, len: number): void {
  try {
    const text = typeof url === "string" ? url : "";
    if (!text || !NET_INTEREST_RE.test(text)) return;
    netRing.push({ at: new Date().toISOString(), url: safeDiagnosticUrl(text), status, len });
    while (netRing.length > NET_RING_LIMIT) netRing.shift();
  } catch {
    // Diagnostics failures must not affect the main flow.
  }
}

export function noteDiag(rpcId: string): void {
  obsDiag.batchFrames += 1;
  if (rpcId && !obsDiag.lastRpcIds.includes(rpcId)) {
    obsDiag.lastRpcIds.push(rpcId);
    if (obsDiag.lastRpcIds.length > 12) obsDiag.lastRpcIds.shift();
  }
}

export function rememberRawFrame(url: unknown, rpcId: string, payload: unknown): void {
  try {
    const text = JSON.stringify(payload);
    if (!/GXU_|percentage|percentUsed|usage|quota|18000|604800|windowRefresh/i.test(text)) {
      return;
    }
    rawFrameRing.push({
      url: safeDiagnosticUrl(url),
      rpcId,
      at: new Date().toISOString(),
      size: text.length,
      payload:
        text.length > RAW_FRAME_MAX_CHARS
          ? `${text.slice(0, RAW_FRAME_MAX_CHARS)}…`
          : text,
    });
    while (rawFrameRing.length > RAW_FRAME_LIMIT) rawFrameRing.shift();
  } catch {
    // Unserializable payloads are skipped.
  }
}

export function rememberBatchResponse(url: unknown, text: unknown, frames: ReturnType<typeof parseBatchExecuteResponse>): void {
  if (typeof text !== "string") return;
  const safeText =
    text.length <= RESPONSE_MAX_CHARS
      ? text
      : `${text.slice(0, RESPONSE_MAX_CHARS / 2)}…${text.slice(-RESPONSE_MAX_CHARS / 2)}`;
  responseRing.push({
    at: new Date().toISOString(),
    url: safeDiagnosticUrl(url),
    size: text.length,
    frameCount: frames.length,
    rpcIds: frames.map((frame) => frame.rpcId).slice(0, 12),
    text: safeText,
  });
  while (responseRing.length > RESPONSE_RING_LIMIT) responseRing.shift();
}

const SNIPPET_LIMIT = 12;
const SNIPPET_RADIUS_BEFORE = 90;
const SNIPPET_RADIUS_AFTER = 110;
export const snippetRing: SnippetSample[] = [];
const QUOTA_HINT_RE =
  /(quota|rate.?limit|usage.?limit|remaining|percentUsed|percentage|reset|GXU_|限额|限額|额度|額度|用量|剩余|剩餘|已用|重置)/i;

export function rememberQuotaSnippets(
  kind: string,
  rpcId: string | null,
  url: unknown,
  text: unknown,
): void {
  if (typeof text !== "string" || text.length < 8) return;
  const seen = new Set(snippetRing.map((item) => item.text));
  const re = new RegExp(QUOTA_HINT_RE.source, "gi");
  let match: RegExpExecArray | null;
  let added = 0;
  while ((match = re.exec(text)) !== null && added < 2) {
    const start = Math.max(0, match.index - SNIPPET_RADIUS_BEFORE);
    const end = Math.min(text.length, match.index + SNIPPET_RADIUS_AFTER);
    const snippet = text.slice(start, end).replace(/\s+/g, " ").trim();
    if (!snippet || seen.has(snippet)) continue;
    seen.add(snippet);
    snippetRing.push({
      at: new Date().toISOString(),
      kind,
      rpcId: rpcId || null,
      url: shortenUrl(url),
      size: text.length,
      text: snippet,
    });
    while (snippetRing.length > SNIPPET_LIMIT) snippetRing.shift();
    added += 1;
  }
}

export function collectProgressbarHints(): unknown[] {
  const out: unknown[] = [];
  try {
    const nodes = document.querySelectorAll("[role='progressbar'], progress, [aria-valuenow]");
    for (const node of Array.from(nodes).slice(0, 10)) {
      const attrNow = node.getAttribute("aria-valuenow");
      const attrMax = node.getAttribute("aria-valuemax");
      let cardText = "";
      try {
        const card = node.closest("section, article, li, tr, div");
        cardText = card ? (readInnerText(card) || card.textContent || "").trim() : "";
      } catch {
        cardText = "";
      }
      const valueProperty = Reflect.get(node, "value");
      const maxProperty = Reflect.get(node, "max");
      out.push({
        tag: String(node.tagName || "").toLowerCase(),
        now: attrNow !== null ? attrNow : valueProperty !== undefined ? valueProperty : null,
        max: attrMax !== null ? attrMax : maxProperty !== undefined ? maxProperty : null,
        label: (
          node.getAttribute("aria-valuetext") ||
          node.getAttribute("aria-label") ||
          readInnerText(node)
        )
          .replace(/\s+/g, " ")
          .slice(0, 80),
        card: cardText.replace(/\s+/g, " ").slice(0, 140),
      });
    }
  } catch {
    // Diagnostics failures must not affect the main flow.
  }
  return out;
}

export function collectQuotaDomHints(): string[] {
  const hints: string[] = [];
  try {
    const body = document.body;
    const text = body ? readInnerText(body) || body.textContent || "" : "";
    const lines = text.split(/\n+/);
    const seen = new Set<string>();
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.length > 160) continue;
      if (!QUOTA_HINT_RE.test(line)) continue;
      if (seen.has(line)) continue;
      seen.add(line);
      hints.push(line);
      if (hints.length >= 8) break;
    }
  } catch {
    // Diagnostics failures must not affect the main flow.
  }
  return hints;
}

function readInnerText(node: Element): string {
  const innerText = Reflect.get(node, "innerText");
  return typeof innerText === "string" ? innerText : "";
}
