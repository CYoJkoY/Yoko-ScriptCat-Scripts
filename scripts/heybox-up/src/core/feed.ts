import { createApiParams } from "../ui/rail";
import { getHeyboxId } from "./account";
import { asRecord } from "./json";
import { fetchWithTimeout, isAbortError } from "./request";

/**
 * Feed discovery and the "continue reading" queue: candidate normalization,
 * ranking against recently visited authors and topics, session state merging,
 * and the /bbs/app/feeds request.
 */

export const PAGER_ID = "heybox-up-post-pager";

export const FEED_ORDER_KEY = "heybox-up.feedOrder.v1";

export const POST_TRAIL_KEY = "heybox-up.postTrail.v1";

export const POST_TRAIL_MAX = 40;

export const FEED_ORDER_MAX = 600;

export const FEED_QUEUE_KEY = "heybox-up.feedQueue.v1";

export const FEED_CURSOR_KEY = "heybox-up.feedCursor.v1";

export const FEED_SEEN_KEY = "heybox-up.feedSeen.v1";

export const FEED_RECENT_KEY = "heybox-up.feedRecent.v1";

export const FEED_DISCOVERY_API_PATH = "/bbs/app/feeds";

export const FEED_DISCOVERY_PAGE_SIZE = 30;

export const FEED_DISCOVERY_PASS_PAGES = 3;

export const FEED_QUEUE_MAX = 80;

export const FEED_SEEN_MAX = 600;

export const FEED_RECENT_MAX = 12;

export const FEED_TITLE_MAX = 80;

export const FEED_DISCOVERY_BODY_TIMEOUT_MS = 15000;

export interface FeedCandidate {
  readonly id: string;
  readonly title: string;
  readonly authorId: string;
  readonly author: string;
  readonly topicIds: string[];
  readonly topics: string[];
}

export interface FeedPick {
  readonly source: string;
  readonly candidate: FeedCandidate;
}

export interface FeedDiscoveryResult {
  readonly ok: boolean;
  readonly links: FeedCandidate[];
  readonly message: string;
  readonly rawEmpty?: boolean;
}

export interface FeedQueueOptions {
  readonly currentId?: unknown;
  readonly visited?: unknown;
  readonly seen?: unknown;
  readonly max?: unknown;
}

export interface FeedPickOptions extends FeedQueueOptions {
  readonly recent?: unknown;
  readonly feedOrder?: unknown;
  readonly queue?: unknown;
  readonly related?: unknown;
}

export function buildFeedStateKey(baseKey: string, accountId: unknown): string {
  const account = normalizeFeedText(accountId, 80);
  return baseKey + ":" + (account === "" ? "anonymous" : account);
}

export function computeFeedDiscoveryOffset(feedOrder: unknown, pageSize: unknown): number {
  const loaded = Array.isArray(feedOrder) ? feedOrder.length : 0;
  const size = Number.isSafeInteger(pageSize) && Number(pageSize) > 0 ? Number(pageSize) : 30;
  if (loaded <= 0) return 0;
  return Math.ceil(loaded / size) * size;
}

export function normalizeFeedId(value: unknown): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return /^[1-9]\d*$/.test(trimmed) ? trimmed : "";
}

export function normalizeFeedText(value: unknown, maxLength: number = FEED_TITLE_MAX): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function readFeedContentType(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (typeof value !== "string") return NaN;
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
}

export function isFeedFallbackTitle(title: string, id: string): boolean {
  return title === "" || title === "帖子 " + id;
}

export function normalizeFeedCandidate(raw: unknown): FeedCandidate | null {
  const record = asRecord(raw);
  if (record === null) return null;
  if (readFeedContentType(record["content_type"]) === 18) return null;
  const id = normalizeFeedId(record["linkid"] ?? record["link_id"] ?? record["id"]);
  if (id === "") return null;
  const user = asRecord(record["user"]);
  const authorId = normalizeFeedText(
    record["userid"] ?? record["user_id"] ?? user?.["userid"] ?? user?.["id"] ?? record["authorId"],
    80,
  );
  const author = normalizeFeedText(
    record["username"] ?? user?.["username"] ?? user?.["nickname"] ?? record["author"],
    80,
  );
  const topicIds: string[] = [];
  const topics: string[] = [];
  const rawTopics = record["topics"];
  for (const topic of Array.isArray(rawTopics) ? rawTopics : []) {
    if (typeof topic === "string" || typeof topic === "number") {
      const topicId = normalizeFeedId(topic);
      if (topicId !== "") {
        if (!topicIds.includes(topicId)) topicIds.push(topicId);
        continue;
      }
      const topicName = normalizeFeedText(topic, 80);
      if (topicName !== "" && !topics.includes(topicName)) topics.push(topicName);
      continue;
    }
    const topicObject = asRecord(topic);
    const topicId = normalizeFeedId(
      topicObject?.["topic_id"] ?? topicObject?.["topicId"] ?? topicObject?.["id"] ?? topic,
    );
    const topicName = normalizeFeedText(
      topicObject?.["name"] ?? topicObject?.["topic_name"] ?? topicObject?.["topicName"],
      80,
    );
    if (topicId !== "" && !topicIds.includes(topicId)) topicIds.push(topicId);
    if (topicName !== "" && !topics.includes(topicName)) topics.push(topicName);
  }
  const rawTopicIds = record["topicIds"];
  for (const topicId of Array.isArray(rawTopicIds) ? rawTopicIds : []) {
    const normalized = normalizeFeedId(topicId);
    if (normalized !== "" && !topicIds.includes(normalized)) topicIds.push(normalized);
  }
  const rawTopicsText = record["topicsText"];
  for (const topicName of Array.isArray(rawTopicsText) ? rawTopicsText : []) {
    const normalized = normalizeFeedText(topicName, 80);
    if (normalized !== "" && !topics.includes(normalized)) topics.push(normalized);
  }
  const title =
    normalizeFeedText(record["title"]) ||
    normalizeFeedText(record["description"]) ||
    "帖子 " + id;
  return { id: id, title: title, authorId: authorId, author: author, topicIds: topicIds, topics: topics };
}

export function mergeFeedCandidateMetadata(
  existing: FeedCandidate | null,
  incoming: FeedCandidate | null,
): FeedCandidate | null {
  if (existing === null) return incoming;
  if (incoming === null) return existing;
  const existingTitleFallback = isFeedFallbackTitle(existing.title, existing.id);
  const incomingTitleFallback = isFeedFallbackTitle(incoming.title, incoming.id);
  const title =
    existingTitleFallback && !incomingTitleFallback ? incoming.title : existing.title || incoming.title;
  const topicIds = [...existing.topicIds];
  const topics = [...existing.topics];
  for (const topicId of incoming.topicIds) {
    if (!topicIds.includes(topicId)) topicIds.push(topicId);
  }
  for (const topic of incoming.topics) {
    if (!topics.includes(topic)) topics.push(topic);
  }
  return {
    id: existing.id,
    title: title,
    authorId: existing.authorId || incoming.authorId,
    author: existing.author || incoming.author,
    topicIds: topicIds,
    topics: topics,
  };
}

export function mergeFeedOrder(existing: unknown, incoming: unknown): FeedCandidate[] {
  const order: FeedCandidate[] = [];
  const positions = new Map<string, number>();
  const rows = [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])];
  for (const raw of rows) {
    const candidate = normalizeFeedLegacyCandidate(raw);
    if (candidate === null) continue;
    const position = positions.get(candidate.id);
    if (position === undefined) {
      positions.set(candidate.id, order.length);
      order.push(candidate);
    } else {
      const merged = mergeFeedCandidateMetadata(order[position] ?? null, candidate);
      if (merged !== null) order[position] = merged;
    }
  }
  return order;
}

export function normalizeFeedLegacyCandidate(raw: unknown): FeedCandidate | null {
  if (typeof raw === "string" || (typeof raw === "number" && Number.isSafeInteger(raw))) {
    const id = normalizeFeedId(raw);
    return id === ""
      ? null
      : { id: id, title: "帖子 " + id, authorId: "", author: "", topicIds: [], topics: [] };
  }
  return normalizeFeedCandidate(raw);
}

export function mergeRecentMetadata(
  existing: unknown,
  current: unknown,
  max: number = FEED_RECENT_MAX,
): FeedCandidate[] {
  const merged: FeedCandidate[] = [];
  const positions = new Map<string, number>();
  const rows = [current, ...(Array.isArray(existing) ? existing : [])];
  for (const raw of rows) {
    const candidate = normalizeFeedCandidate(raw);
    if (candidate === null) continue;
    const position = positions.get(candidate.id);
    if (position === undefined) {
      positions.set(candidate.id, merged.length);
      merged.push(candidate);
    } else {
      const next = mergeFeedCandidateMetadata(merged[position] ?? null, candidate);
      if (next !== null) merged[position] = next;
    }
  }
  return merged.slice(0, Math.max(0, max));
}

export function mergeFeedSeen(existing: unknown, ids: unknown, max: number = FEED_SEEN_MAX): string[] {
  const seen: string[] = [];
  const known = new Set<string>();
  const rows = [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(ids) ? ids : [])];
  for (const raw of rows) {
    const id = normalizeFeedId(raw);
    if (id === "" || known.has(id)) continue;
    known.add(id);
    seen.push(id);
  }
  const limit = Math.max(0, max);
  return seen.slice(Math.max(0, seen.length - limit));
}

export function mergeFeedQueue(
  queue: unknown,
  incoming: unknown,
  options: FeedQueueOptions = {},
): FeedCandidate[] {
  const currentId = normalizeFeedId(options.currentId);
  const visited = options.visited instanceof Set ? options.visited : new Set<unknown>();
  const seen = options.seen instanceof Set ? options.seen : new Set<unknown>();
  const max = typeof options.max === "number" && Number.isInteger(options.max)
    ? Math.max(0, options.max)
    : FEED_QUEUE_MAX;
  const merged: FeedCandidate[] = [];
  const positions = new Map<string, number>();
  const add = (raw: unknown): void => {
    const candidate = normalizeFeedLegacyCandidate(raw);
    if (candidate === null) return;
    if (candidate.id === currentId || visited.has(candidate.id) || seen.has(candidate.id)) return;
    const existingPosition = positions.get(candidate.id);
    if (existingPosition !== undefined) {
      const next = mergeFeedCandidateMetadata(merged[existingPosition] ?? null, candidate);
      if (next !== null) merged[existingPosition] = next;
      return;
    }
    positions.set(candidate.id, merged.length);
    merged.push(candidate);
  };
  for (const raw of Array.isArray(queue) ? queue : []) add(raw);
  for (const raw of Array.isArray(incoming) ? incoming : []) add(raw);
  return merged.slice(0, max);
}

export function scoreFeedCandidate(candidate: FeedCandidate, recent: readonly FeedCandidate[]): number {
  let score = 0;
  const authorId = candidate.authorId;
  const author = candidate.author;
  for (let index = 0; index < recent.length; index += 1) {
    const item = recent[index];
    if (item === undefined) continue;
    const sameAuthor =
      (authorId !== "" && item.authorId === authorId) || (author !== "" && item.author === author);
    if (sameAuthor) score += index === 0 ? 100 : Math.max(10, 40 - index * 3);
    let overlap = 0;
    for (const topicId of candidate.topicIds) {
      if (item.topicIds.includes(topicId)) overlap += 1;
    }
    for (const topic of candidate.topics) {
      if (item.topics.includes(topic)) overlap += 1;
    }
    if (overlap > 0) score += overlap * Math.max(4, 18 - index * 2);
  }
  return score;
}

export function rankFeedCandidates(candidates: unknown, recent: unknown): FeedCandidate[] {
  const normalizedRecent: FeedCandidate[] = [];
  for (const item of Array.isArray(recent) ? recent : []) {
    const candidate = normalizeFeedCandidate(item);
    if (candidate !== null) normalizedRecent.push(candidate);
  }
  const unique: FeedCandidate[] = [];
  const known = new Set<string>();
  for (const raw of Array.isArray(candidates) ? candidates : []) {
    const candidate = normalizeFeedLegacyCandidate(raw);
    if (candidate === null || known.has(candidate.id)) continue;
    known.add(candidate.id);
    unique.push(candidate);
  }
  return unique
    .map((candidate, index) => ({
      candidate: candidate,
      index: index,
      score: scoreFeedCandidate(candidate, normalizedRecent),
    }))
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map((entry) => entry.candidate);
}

export function selectNextFeedCandidate(options: FeedPickOptions = {}): FeedPick | null {
  const currentId = normalizeFeedId(options.currentId);
  const visited = options.visited instanceof Set ? options.visited : new Set<unknown>();
  const seen = options.seen instanceof Set ? options.seen : new Set<unknown>();
  const recent = Array.isArray(options.recent) ? options.recent : [];
  const isBlocked = (raw: unknown): boolean => {
    const candidate = normalizeFeedLegacyCandidate(raw);
    if (candidate === null) return true;
    return candidate.id === currentId || visited.has(candidate.id) || seen.has(candidate.id);
  };
  const feedOrder = Array.isArray(options.feedOrder) ? options.feedOrder : [];
  const currentIndex = feedOrder.findIndex(
    (item) => normalizeFeedLegacyCandidate(item)?.id === currentId,
  );
  const feedPositions = new Map<string, number>();
  for (let index = 0; index < feedOrder.length; index += 1) {
    const id = normalizeFeedLegacyCandidate(feedOrder[index])?.id;
    if (id !== undefined && !feedPositions.has(id)) feedPositions.set(id, index);
  }
  // A queued post already passed in the rendered feed would move the reader backwards.
  const isBehindCurrent = (raw: unknown): boolean => {
    if (currentIndex === -1) return false;
    const id = normalizeFeedLegacyCandidate(raw)?.id;
    if (id === undefined) return false;
    const position = feedPositions.get(id);
    return position !== undefined && position <= currentIndex;
  };
  const queueRows = Array.isArray(options.queue) ? options.queue : [];
  const relatedRows = Array.isArray(options.related) ? options.related : [];
  const sources: readonly { readonly source: string; readonly candidates: unknown[] }[] = [
    {
      source: "feed",
      candidates: currentIndex === -1 ? [] : feedOrder.slice(currentIndex + 1).filter((item) => !isBlocked(item)),
    },
    {
      source: "queue",
      candidates: queueRows.filter((item) => !isBlocked(item) && !isBehindCurrent(item)),
    },
    { source: "related", candidates: relatedRows.filter((item) => !isBlocked(item)) },
  ];
  for (const entry of sources) {
    if (entry.candidates.length === 0) continue;
    const ranked = rankFeedCandidates(entry.candidates, recent);
    const first = ranked[0];
    if (first !== undefined) return { source: entry.source, candidate: first };
  }
  return null;
}

export function normalizeFeedDiscoveryLinks(links: unknown): FeedCandidate[] | null {
  if (!Array.isArray(links)) return null;
  const candidates: FeedCandidate[] = [];
  const seen = new Set<string>();
  for (const raw of links) {
    const candidate = normalizeFeedCandidate(raw);
    if (candidate === null || seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    candidates.push(candidate);
  }
  return candidates;
}

export function buildFeedDiscoveryUrl(offset: number, params: unknown): string {
  const safeOffset = Number.isSafeInteger(offset) && offset > 0 ? offset : 0;
  const query = new URLSearchParams({ pull: "0", offset: String(safeOffset), dw: "660" });
  const extra = asRecord(params) ?? {};
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined || value === null || value === "") continue;
    query.set(key, String(value));
  }
  return "https://api.xiaoheihe.cn" + FEED_DISCOVERY_API_PATH + "?" + query.toString();
}

export function readFeedDiscoveryResponse(data: unknown): FeedDiscoveryResult {
  const record = asRecord(data);
  if (record === null) {
    return { ok: false, links: [], message: "信息流返回内容无法解析" };
  }
  if (record["status"] === "login") {
    return { ok: false, links: [], message: "登录状态已失效，请先登录小黑盒" };
  }
  if (record["status"] !== "ok") {
    const message =
      normalizeFeedText(record["msg"] ?? record["message"], 60) || "信息流接口返回失败";
    return { ok: false, links: [], message: message };
  }
  const result = asRecord(record["result"]);
  const rawLinks = result === null ? undefined : result["links"];
  const links = normalizeFeedDiscoveryLinks(rawLinks);
  // An empty array is a successful end-of-feed page; only a malformed payload is an error.
  if (links === null) {
    return { ok: false, links: [], message: "信息流返回内容无法解析" };
  }
  // Promoted, invalid, and duplicate entries are filtered out, so only the raw
  // length proves that the feed has no later pages left.
  return {
    ok: true,
    links: links,
    rawEmpty: Array.isArray(rawLinks) ? rawLinks.length === 0 : false,
    message: "",
  };
}

export function hasDiscoverableNext(status: unknown): boolean {
  const record = asRecord(status);
  if (record === null) return false;
  const next = asRecord(record["next"]);
  if (next === null) return false;
  return next["source"] !== "related";
}

export function readFeedBodyJson(
  response: Response,
  signal: AbortSignal | null | undefined,
  timeoutMs: number,
): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    let settled = false;
    const settle = (callback: (value: unknown) => void, value: unknown): void => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      callback(value);
    };
    const onAbort = (): void => {
      settle(reject, signal?.reason || new DOMException("请求已取消", "AbortError"));
    };
    const timer = globalThis.setTimeout(() => {
      settle(reject, new DOMException("请求超时", "TimeoutError"));
    }, timeoutMs);
    if (signal?.aborted === true) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    Promise.resolve()
      // Response.json() is any in lib.dom; this narrows it to unknown at the edge.
      .then(() => response.json() as Promise<unknown>)
      .then((value) => settle(resolve, value), (error: unknown) => settle(reject, error));
  });
}

export async function requestFeedDiscoveryPage(
  offset: number,
  signal?: AbortSignal | null,
  bodyTimeoutMs: number = FEED_DISCOVERY_BODY_TIMEOUT_MS,
): Promise<FeedDiscoveryResult> {
  const attempts: string[] = [];
  try {
    attempts.push(
      buildFeedDiscoveryUrl(offset, { ...createApiParams(FEED_DISCOVERY_API_PATH), heybox_id: getHeyboxId() }),
    );
  } catch {
    // A failed signature only removes the signed attempt; the public query still works.
  }
  attempts.push(buildFeedDiscoveryUrl(offset, { heybox_id: getHeyboxId() }));
  let message = "信息流请求失败";
  const requestOptions: RequestInit = {
    credentials: "include",
    cache: "no-store",
    headers: { accept: "application/json" },
    ...(signal === undefined || signal === null ? {} : { signal }),
  };
  for (const url of attempts) {
    try {
      const response = await fetchWithTimeout(url, requestOptions);
      if (!response.ok) {
        message = "信息流请求失败（HTTP " + response.status + "）";
        continue;
      }
      let rawData: unknown;
      try {
        rawData = await readFeedBodyJson(response, signal, bodyTimeoutMs);
      } catch (error) {
        if (isAbortError(error)) throw error;
        message =
          error instanceof DOMException && error.name === "TimeoutError"
            ? "信息流响应超时，请稍后重试"
            : "信息流返回内容无法解析";
        continue;
      }
      const result = readFeedDiscoveryResponse(rawData);
      if (result.ok) return result;
      message = result.message;
      // A login failure is terminal; other failures still try the public query.
      const record = asRecord(rawData);
      if (record !== null && record["status"] === "login") return result;
    } catch (error) {
      if (isAbortError(error)) throw error;
      message = "网络异常，请稍后重试";
    }
  }
  return { ok: false, links: [], message: message };
}

export const PAGER_CSS = `
  :host { position: fixed; inset: 0; display: block; pointer-events: none; z-index: 2147482990; font: 12px/1.5 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; color: var(--heybox-up-text, #14191e); }
  :host([hidden]) { display: none; }
  .pager { position: absolute; inset: 0; pointer-events: none; }
  .btn {
    position: absolute;
    top: 50%;
    display: grid;
    place-items: center;
    width: 42px;
    height: 64px;
    padding: 0;
    border: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .12));
    border-radius: 999px;
    background: var(--heybox-up-surface, #fff);
    box-shadow: var(--heybox-up-shadow-2, 0 10px 28px rgba(8, 12, 16, .18));
    color: var(--heybox-up-muted, #6b7280);
    font: inherit;
    cursor: pointer;
    opacity: .78;
    transform: translateY(-50%);
    pointer-events: auto;
    transition: opacity .16s ease, color .16s ease, background-color .16s ease, border-color .16s ease;
  }
  .btn--prev { left: max(10px, calc((100vw - var(--heybox-up-page-w, 1360px)) / 2 - 54px)); }
  .btn--next { right: max(10px, calc((100vw - var(--heybox-up-page-w, 1360px)) / 2 - 54px)); }
  .btn:hover:not(:disabled) { opacity: 1; border-color: var(--heybox-up-accent, #6f8db3); background: var(--heybox-up-subtle, rgba(20, 25, 30, .06)); color: var(--heybox-up-text, #14191e); }
  .btn:active:not(:disabled) { background: var(--heybox-up-raised, #d7dce3); }
  .btn:disabled { opacity: .3; cursor: default; }
  .btn:focus-visible { outline: 2px solid var(--heybox-up-accent, #6f8db3); outline-offset: 2px; }
  .btn svg { width: 20px; height: 20px; flex: none; transition: transform .16s ease; }
  .btn--prev:hover:not(:disabled) svg { transform: translateX(-1px); }
  .btn--next:hover:not(:disabled) svg { transform: translateX(1px); }
  .pager-status {
    position: absolute;
    top: calc(50% + 46px);
    right: max(10px, calc((100vw - var(--heybox-up-page-w, 1360px)) / 2 - 84px));
    max-width: 180px;
    margin: 0;
    padding: 6px 10px;
    border: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .12));
    border-radius: 8px;
    background: var(--heybox-up-surface, #fff);
    box-shadow: var(--heybox-up-shadow-2, 0 10px 28px rgba(8, 12, 16, .18));
    color: var(--heybox-up-muted, #6b7280);
    font: inherit;
    text-align: center;
    pointer-events: none;
  }
  .pager-status[hidden] { display: none; }
  @media (max-width: 1199px) { .btn { width: 38px; height: 56px; opacity: .64; } .btn--prev { left: 8px; } .btn--next { right: 8px; } }
  @media (max-width: 1199px) { .pager-status { top: calc(50% + 42px); right: 8px; max-width: 136px; } }
  @media (max-width: 1080px) { :host { display: none; } }
  @media (prefers-reduced-motion: reduce) { .btn, .btn svg { transition: none; } }
`;
