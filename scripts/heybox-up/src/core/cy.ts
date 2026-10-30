import { fetchWithTimeout } from "./request";
import { asRecord, isRecord } from "./json";
import { createSignature, md5Hex } from "./signature";
import { localStore } from "../state";

/**
 * "Cha yan" (插眼) favourites: paging over the profile comment list, the
 * ten minute cache, and the card markup shared by the rail and favour page.
 */

export const CY_API_PATH = "/bbs/app/profile/bbs/comment/list";
export const CY_PAGE_SIZE = 20;
export const CY_MAX_ITEMS = 200;
export const CACHE_TTL_MS = 10 * 60 * 1000;
export const CACHE_KEY_PREFIX = "heybox-up.cy.v1:";
export const LINK_HREF_PREFIX = "/app/bbs/link/";

export interface CyItem {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  readonly createAt: number;
  readonly thumb: string;
  readonly kind: string;
}

export interface CyPage {
  readonly list: unknown[];
  readonly noMore: boolean;
}

export function buildCyApiUrl(userId: string, offset: number): string {
  const time = Math.floor(Date.now() / 1000);
  const nonce = md5Hex(String(time) + String(Math.random())).toUpperCase();
  const hkey = createSignature(CY_API_PATH, time, nonce);
  const query = new URLSearchParams({
    os_type: "web",
    app: "heybox",
    client_type: "web",
    version: "999.0.4",
    web_version: "2.5",
    x_client_type: "web",
    x_app: "heybox_website",
    heybox_id: userId,
    x_os_type: "Windows",
    device_info: "Chrome",
    hkey: hkey,
    _time: String(time),
    nonce: nonce,
    userid: userId,
    only_cy: "1",
    filter_type: "0",
    enable_new_style_collect: "1",
    limit: String(CY_PAGE_SIZE),
    offset: String(offset),
    no_more: "false",
  });
  return "https://api.xiaoheihe.cn" + CY_API_PATH + "?" + query.toString();
}

// The favourites endpoint has shipped three shapes: a bare array, and
// result.links / result.list / result.comment_list. Anything else is an empty
// page so an object is never iterated as a list.
export function readCyPageRecords(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  const record = asRecord(result);
  if (record === null) return [];
  for (const key of ["links", "list", "comment_list"]) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

// The new endpoint reports result.has_next === "1" while the old one used
// no_more; when both are absent an empty page ends the loop.
export function readCyPageFinished(data: Record<string, unknown>, list: readonly unknown[]): boolean {
  const nested = asRecord(data["result"]);
  const hasNext = data["has_next"] ?? (nested === null ? undefined : nested["has_next"]);
  if (hasNext === "0" || hasNext === 0 || hasNext === false) return true;
  if (hasNext === "1" || hasNext === 1 || hasNext === true) return false;
  if (data["no_more"] === true) return true;
  return list.length === 0;
}

// New payloads name the post linkid; older ones still send id.
export function readCyLinkId(link: Record<string, unknown>): string {
  const raw = link["linkid"] ?? link["id"];
  if (raw === null || raw === undefined) return "";
  const text = String(raw).trim();
  return text === "" ? "" : text;
}

export async function fetchCyPage(
  userId: string,
  offset: number,
  signal?: AbortSignal | null,
): Promise<CyPage> {
  const response = await fetchWithTimeout(buildCyApiUrl(userId, offset), {
    credentials: "include",
    headers: { accept: "application/json" },
    ...(signal === undefined || signal === null ? {} : { signal }),
  });
  if (!response.ok) throw new Error("接口返回 HTTP " + response.status);
  const raw: unknown = await response.json();
  const data = asRecord(raw) ?? {};
  if (data["status"] !== "ok") throw new Error(describeCyApiFailure(data));
  const list = readCyPageRecords(data["result"]);
  return { list, noMore: readCyPageFinished(data, list) };
}

// Auth failures arrive with HTTP 200 and a status/msg pair. The raw messages
// mean nothing to a reader, so they collapse into one actionable sentence.
export function describeCyApiFailure(data: unknown): string {
  const record = asRecord(data);
  const rawMessage = record === null ? undefined : record["msg"];
  const message = typeof rawMessage === "string" ? rawMessage.trim() : "";
  if (message === "hkey 不能为空" || message.includes("注销") || message.includes("登录")) {
    return "登录状态已失效，请重新登录小黑盒后点击刷新。";
  }
  return message !== "" ? message : "接口返回失败状态";
}

export function normalizeCyItem(raw: unknown): CyItem | null {
  const record = asRecord(raw);
  if (record === null) return null;
  const link = asRecord(record["link"]);
  if (link === null) return null;
  const linkId = readCyLinkId(link);
  if (linkId === "") return null;
  const rawThumbs = link["thumbs"];
  const thumbs: unknown[] = Array.isArray(rawThumbs) ? rawThumbs : [];
  const rawTitle = link["title"];
  const rawText = record["text"];
  const firstThumb = thumbs[0];
  return {
    id: linkId,
    title:
      typeof rawTitle === "string" && rawTitle.trim() !== "" ? rawTitle.trim() : "无标题帖子",
    text: typeof rawText === "string" ? rawText.trim() : "",
    createAt: Number(record["create_at"]) || 0,
    thumb: typeof firstThumb === "string" ? firstThumb : "",
    kind: record["comment_type"] === 1 ? "回复" : "评论",
  };
}

export async function loadCyFavorites(
  userId: string,
  onProgress: (count: number) => void,
  signal?: AbortSignal | null,
): Promise<CyItem[]> {
  const seen = new Set<string>();
  const items: CyItem[] = [];
  let offset = 0;
  for (;;) {
    const page = await fetchCyPage(userId, offset, signal);
    for (const raw of page.list) {
      const item = normalizeCyItem(raw);
      if (item !== null && !seen.has(item.id)) {
        seen.add(item.id);
        items.push(item);
      }
    }
    onProgress(items.length);
    if (page.noMore || items.length >= CY_MAX_ITEMS) break;
    offset += CY_PAGE_SIZE;
    if (offset >= CY_MAX_ITEMS + CY_PAGE_SIZE) break;
  }
  return items.slice(0, CY_MAX_ITEMS);
}

// Cached rows are re-validated on read: a partially written entry from an
// older release must not reach the renderer as a half-formed object.
function asCachedItem(value: unknown): CyItem | null {
  const record = asRecord(value);
  if (record === null) return null;
  const id = record["id"];
  const title = record["title"];
  const text = record["text"];
  const createAt = record["createAt"];
  const thumb = record["thumb"];
  const kind = record["kind"];
  if (typeof id !== "string" || id === "") return null;
  return {
    id,
    title: typeof title === "string" ? title : "",
    text: typeof text === "string" ? text : "",
    createAt: typeof createAt === "number" && Number.isFinite(createAt) ? createAt : 0,
    thumb: typeof thumb === "string" ? thumb : "",
    kind: typeof kind === "string" ? kind : "",
  };
}

export function readCache(userId: string): CyItem[] | null {
  const parsed = localStore.readJson(CACHE_KEY_PREFIX + userId, null);
  const record = asRecord(parsed);
  if (record === null) return null;
  const rawItems = record["items"];
  if (!Array.isArray(rawItems)) return null;
  if (Date.now() - Number(record["savedAt"]) > CACHE_TTL_MS) return null;
  const items: CyItem[] = [];
  for (const raw of rawItems) {
    const item = asCachedItem(raw);
    if (item !== null) items.push(item);
  }
  return items;
}

export function writeCache(userId: string, items: readonly CyItem[]): void {
  localStore.writeJson(CACHE_KEY_PREFIX + userId, { savedAt: Date.now(), items: items });
}

export function formatTime(value: number): string {
  if (!value) return "";
  const milliseconds = value > 1e12 ? value : value * 1000;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function createCard(item: CyItem): HTMLAnchorElement {
  const card = document.createElement("a");
  card.className = "card";
  card.href = LINK_HREF_PREFIX + item.id;
  card.target = "_blank";
  card.rel = "noopener noreferrer";

  if (item.thumb !== "") {
    const thumb = document.createElement("img");
    thumb.className = "thumb";
    thumb.src = item.thumb;
    thumb.alt = "";
    thumb.loading = "lazy";
    thumb.referrerPolicy = "no-referrer";
    card.append(thumb);
  }

  const body = document.createElement("div");
  body.className = "body";
  const cardTitle = document.createElement("div");
  cardTitle.className = "card-title";
  cardTitle.textContent = item.title;
  const cardText = document.createElement("div");
  cardText.className = item.text !== "" ? "card-text" : "card-text is-empty";
  if (item.text === "") {
    cardText.textContent = "（无文字内容）";
  } else {
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("class", "card-text-icon");
    icon.setAttribute("viewBox", "0 0 16 16");
    icon.setAttribute("aria-hidden", "true");
    const iconPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    iconPath.setAttribute("fill", "currentColor");
    iconPath.setAttribute(
      "d",
      "M8 3C4.5 3 1.8 5.5 1 8c.8 2.5 3.5 5 7 5s6.2-2.5 7-5c-.8-2.5-3.5-5-7-5Zm0 8.2A3.2 3.2 0 1 1 8 4.8a3.2 3.2 0 0 1 0 6.4Zm0-1.7a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
    );
    icon.append(iconPath);
    const content = document.createElement("span");
    content.className = "card-text-body";
    content.textContent = item.text;
    cardText.append(icon, content);
    cardText.title = item.text;
  }
  const foot = document.createElement("div");
  foot.className = "card-foot";
  const kind = document.createElement("span");
  kind.textContent = "插眼" + item.kind;
  const time = document.createElement("span");
  time.textContent = formatTime(item.createAt);
  foot.append(kind, time);
  body.append(cardTitle, cardText, foot);
  card.append(body);
  return card;
}

export function isCyItemList(value: unknown): value is CyItem[] {
  if (!Array.isArray(value)) return false;
  for (const entry of value) {
    if (!isRecord(entry)) return false;
  }
  return true;
}
