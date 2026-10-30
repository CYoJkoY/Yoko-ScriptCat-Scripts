import { PAGE_ROUTE } from "../config";
import { LINK_HREF_PREFIX } from "../core/cy";
import { asRecord, readFiniteNumber } from "../core/json";
import { ensureStyleElement, registerPageSync } from "../core/page-sync";
import { fetchWithTimeout, isAbortError } from "../core/request";
import { createSignature, md5Hex } from "../core/signature";
import { navigateToPath } from "./navigation";
import { formatRailAge, normalizeRailText } from "./rail";

export const COMMUNITY_SEARCH_API_PATH = "/bbs/app/api/general/search/v1";

export const COMMUNITY_SEARCH_ID = "heybox-up-community-search";

export const COMMUNITY_SEARCH_STYLE_ID = "heybox-up-community-search-style";

export const COMMUNITY_SEARCH_ACTIVE_CLASS = "heybox-up-cs-active";

export const COMMUNITY_SEARCH_PAGE_SIZE = 30;

export interface TopicContext {
  topicId: string;
  name: string;
}

export interface CommunitySearchTimeRange {
  value: string;
  name: string;
}

export interface CommunitySearchItemView {
  id: string;
  title: string;
  desc: string;
  author: string;
  thumb: string;
  createAt: number;
  like: number;
  comment: number;
}

export type CommunitySearchPage =
  | { ok: false; message: string; aborted?: boolean }
  | {
    ok: true;
    message?: undefined;
    aborted?: undefined;
    items: unknown[];
    linkCount: number;
    timeRanges: CommunitySearchTimeRange[];
    tip: string;
  };

export interface CommunitySearchUi {
  root: HTMLElement;
  bar: HTMLFormElement;
  input: HTMLInputElement;
  scope: HTMLElement;
  panel: HTMLElement;
  headTitle: HTMLElement;
  headMeta: HTMLElement;
  globalLink: HTMLAnchorElement;
  filters: HTMLElement;
  list: HTMLElement;
  foot: HTMLElement;
  more: HTMLButtonElement;
  status: HTMLElement;
  close: HTMLButtonElement;
}

export interface CommunitySearchState {
  topicId: string;
  topicName: string;
  keyword: string;
  timeRange: string;
  items: CommunitySearchItemView[];
  offset: number;
  noMore: boolean;
  timeRanges: CommunitySearchTimeRange[];
  tip: string;
  error: string;
  status: string;
  loading: boolean;
}

export const COMMUNITY_SEARCH_ICONS = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.4"/><path d="m16.1 16.1 4.4 4.4"/></svg>',
};

export const COMMUNITY_SEARCH_CSS = `
  #heybox-up-community-search {
    display: block;
    margin: 14px 0 12px;
    font: 13px/1.55 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
    color: var(--heybox-up-text, #14191e);
    -webkit-font-smoothing: antialiased;
  }
  #heybox-up-community-search *,
  #heybox-up-community-search *::before,
  #heybox-up-community-search *::after { box-sizing: border-box; }
  #heybox-up-community-search .bar {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 42px;
    margin: 0;
    padding: 0 6px 0 13px;
    border: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1));
    border-radius: var(--heybox-up-radius-card, 14px);
    background: var(--heybox-up-surface, #fff);
    box-shadow: var(--heybox-up-shadow-1, none);
    transition: border-color .16s ease, box-shadow .16s ease;
  }
  #heybox-up-community-search .bar:focus-within {
    border-color: var(--heybox-up-accent, #6f8db3);
    box-shadow: 0 0 0 3px rgba(111, 141, 179, .16);
  }
  #heybox-up-community-search .icon { display: inline-flex; flex: none; color: var(--heybox-up-muted, #6b7280); }
  #heybox-up-community-search .icon svg { width: 16px; height: 16px; }
  #heybox-up-community-search .scope {
    flex: none;
    max-width: 34%;
    height: 22px;
    padding: 0 9px;
    border-radius: 999px;
    background: var(--heybox-up-subtle, rgba(20, 25, 30, .06));
    color: var(--heybox-up-muted, #6b7280);
    font-size: 12px;
    line-height: 22px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  #heybox-up-community-search input.q {
    flex: 1 1 auto;
    min-width: 0;
    height: 30px;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 14px;
    line-height: 30px;
    outline: none;
    box-shadow: none;
    appearance: none;
  }
  #heybox-up-community-search input.q::placeholder { color: var(--heybox-up-muted, #6b7280); }
  #heybox-up-community-search button.go {
    flex: none;
    height: 30px;
    margin: 0;
    padding: 0 15px;
    border: 0;
    border-radius: 999px;
    background: var(--heybox-up-accent, #6f8db3);
    color: var(--heybox-up-on-accent, #fff);
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: filter .16s ease;
  }
  #heybox-up-community-search button.go:hover { filter: brightness(1.06); }
  #heybox-up-community-search button.go:focus-visible,
  #heybox-up-community-search .chip:focus-visible,
  #heybox-up-community-search .more:focus-visible,
  #heybox-up-community-search .close:focus-visible {
    outline: 2px solid var(--heybox-up-accent, #6f8db3);
    outline-offset: 2px;
  }
  #heybox-up-community-search .panel {
    margin-top: 10px;
    border: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1));
    border-radius: var(--heybox-up-radius-card, 14px);
    background: var(--heybox-up-surface, #fff);
    box-shadow: var(--heybox-up-shadow-1, none);
    overflow: hidden;
  }
  #heybox-up-community-search .panel[hidden] { display: none !important; }
  #heybox-up-community-search .head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 13px 16px;
    border-bottom: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1));
  }
  #heybox-up-community-search .head-text { flex: 1 1 auto; min-width: 0; }
  #heybox-up-community-search .head-title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.5;
    color: var(--heybox-up-text, #14191e);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  #heybox-up-community-search .head-meta {
    margin: 2px 0 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--heybox-up-muted, #6b7280);
  }
  #heybox-up-community-search .head-actions { flex: none; display: flex; align-items: center; gap: 6px; }
  #heybox-up-community-search .ghost,
  #heybox-up-community-search .close {
    height: 28px;
    padding: 0 11px;
    border: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1));
    border-radius: 999px;
    background: transparent;
    color: var(--heybox-up-text-2, #3c4249);
    font: inherit;
    font-size: 12px;
    line-height: 26px;
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;
    transition: background .16s ease, border-color .16s ease, color .16s ease;
  }
  #heybox-up-community-search .ghost:hover,
  #heybox-up-community-search .close:hover {
    border-color: var(--heybox-up-accent, #6f8db3);
    background: var(--heybox-up-subtle, rgba(20, 25, 30, .06));
    color: var(--heybox-up-text, #14191e);
  }
  #heybox-up-community-search .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1));
  }
  #heybox-up-community-search .filters[hidden] { display: none !important; }
  #heybox-up-community-search .chip {
    height: 26px;
    margin: 0;
    padding: 0 11px;
    border: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1));
    border-radius: 999px;
    background: transparent;
    color: var(--heybox-up-text-2, #3c4249);
    font: inherit;
    font-size: 12px;
    line-height: 24px;
    cursor: pointer;
    transition: color .16s ease, border-color .16s ease, background .16s ease;
  }
  #heybox-up-community-search .chip:hover { border-color: var(--heybox-up-accent, #6f8db3); }
  #heybox-up-community-search .chip[aria-pressed="true"] {
    border-color: var(--heybox-up-accent, #6f8db3);
    background: rgba(111, 141, 179, .14);
    color: var(--heybox-up-accent, #6f8db3);
    font-weight: 600;
  }
  #heybox-up-community-search .item {
    display: block;
    padding: 15px 16px;
    border-bottom: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1));
    color: inherit;
    text-decoration: none;
    cursor: pointer;
    transition: background .14s ease;
  }
  #heybox-up-community-search .item:last-child { border-bottom: 0; }
  #heybox-up-community-search .item:hover { background: var(--heybox-up-subtle, rgba(20, 25, 30, .06)); }
  #heybox-up-community-search .item-thumb {
    float: right;
    width: 88px;
    height: 66px;
    margin: 2px 0 6px 14px;
    border-radius: 8px;
    object-fit: cover;
    background: var(--heybox-up-subtle, rgba(20, 25, 30, .06));
  }
  #heybox-up-community-search .item-title {
    margin: 0 0 4px;
    font-size: 15px;
    font-weight: 600;
    line-height: 1.45;
    color: var(--heybox-up-text, #14191e);
  }
  #heybox-up-community-search .item-desc {
    margin: 0 0 8px;
    font-size: 13px;
    line-height: 1.62;
    color: var(--heybox-up-text-2, #3c4249);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
  }
  #heybox-up-community-search .item-meta {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--heybox-up-muted, #6b7280);
  }
  #heybox-up-community-search .empty {
    margin: 0;
    padding: 30px 18px;
    text-align: center;
    font-size: 13px;
    line-height: 1.7;
    color: var(--heybox-up-muted, #6b7280);
  }
  #heybox-up-community-search .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 16px;
    border-top: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1));
  }
  #heybox-up-community-search .foot[hidden] { display: none !important; }
  #heybox-up-community-search .more {
    flex: none;
    height: 30px;
    margin: 0;
    padding: 0 14px;
    border: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1));
    border-radius: 999px;
    background: transparent;
    color: var(--heybox-up-text-2, #3c4249);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  #heybox-up-community-search .more[hidden] { display: none !important; }
  #heybox-up-community-search .more:hover:not(:disabled) {
    border-color: var(--heybox-up-accent, #6f8db3);
    color: var(--heybox-up-text, #14191e);
  }
  #heybox-up-community-search .more:disabled { opacity: .45; cursor: default; }
  #heybox-up-community-search .status {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--heybox-up-muted, #6b7280);
    text-align: right;
  }
  /* While the result panel is open the site filter row and feed hide, so two lists never stack. */
  #page-topic-link.heybox-up-cs-active .topic-link__filter-row,
  #page-topic-link.heybox-up-cs-active .topic-link__list { display: none !important; }
  @media (max-width: 720px) {
    #heybox-up-community-search { margin: 10px 0; }
    #heybox-up-community-search .scope { display: none; }
    #heybox-up-community-search .head { flex-wrap: wrap; }
    #heybox-up-community-search .item-thumb { width: 72px; height: 54px; }
  }
`;

export function ensureCommunitySearchStyle(): void {
  ensureStyleElement(COMMUNITY_SEARCH_STYLE_ID, COMMUNITY_SEARCH_CSS);
}

export function readTopicContext(): TopicContext | null {
  const match = /^\/app\/topic\/link\/(\d+)/.exec(location.pathname);
  if (match === null) return null;
  const topicId = match[1];
  if (topicId === undefined) return null;
  const indicator = document.querySelector("#page-topic-link .topic-aside__topic-indicator .hot-topic-item__name");
  if (indicator !== null) {
    const indicatorName = normalizeRailText(indicator.textContent).slice(0, 24);
    if (indicatorName !== "") return { topicId: topicId, name: indicatorName };
  }
  const header = document.querySelector("#page-topic-link .topic-link__header");
  let name = "";
  if (header !== null) {
    const heading = header.querySelector("h1, h2, [class*='name'], [class*='title']");
    if (heading !== null) name = normalizeRailText(heading.textContent).slice(0, 24);
  }
  if (name === "") name = normalizeRailText((document.title || "").replace(/[-_|].*$/, "")).slice(0, 24);
  return { topicId: topicId, name: name === "" ? "本社区" : name };
}

export function buildCommunitySearchUrl(topicId: string, keyword: string, offset: number, timeRange: string, signed: boolean): string {
  const query = new URLSearchParams({
    os_type: "web",
    app: "heybox",
    client_type: "web",
    version: "999.0.4",
    web_version: "2.5",
    x_client_type: "web",
    x_app: "heybox_website",
    x_os_type: "Windows",
    device_info: "Chrome",
    q: keyword,
    search_type: "link",
    is_pull_down: "0",
    offset: String(offset),
    limit: String(COMMUNITY_SEARCH_PAGE_SIZE),
    dw: "660",
    topic_id: String(topicId),
  });
  if (timeRange !== "") query.set("time_range", timeRange);
  if (signed === true) {
    const time = Math.floor(Date.now() / 1000);
    const nonce = md5Hex(String(time) + String(Math.random())).toUpperCase();
    query.set("hkey", createSignature(COMMUNITY_SEARCH_API_PATH, time, nonce));
    query.set("_time", String(time));
    query.set("nonce", nonce);
  }
  return "https://api.xiaoheihe.cn" + COMMUNITY_SEARCH_API_PATH + "?" + query.toString();
}

export async function fetchCommunitySearchPage(url: string, signal: AbortSignal): Promise<CommunitySearchPage> {
  let response;
  try {
    response = await fetchWithTimeout(url, { credentials: "include", headers: { accept: "application/json" }, signal: signal });
  } catch (error) {
    if (isAbortError(error)) return { ok: false, message: "搜索已取消", aborted: true };
    return { ok: false, message: error instanceof Error && error.message !== "" ? error.message : "网络请求失败，请稍后重试" };
  }
  if (response.ok !== true) return { ok: false, message: "接口返回 HTTP " + response.status };
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    return { ok: false, message: "接口返回非 JSON 内容，可能触发站点风控" };
  }
  const data = asRecord(raw);
  if (data === null || data["status"] !== "ok") {
    const status = data !== null && typeof data["status"] === "string" ? data["status"] : "";
    const rawMessage = data === null ? "" : data["msg"];
    const message = typeof rawMessage === "string" && rawMessage !== "" ? rawMessage : status;
    return { ok: false, message: message === "" ? "接口返回失败状态" : message };
  }
  const result = asRecord(data["result"]) ?? {};
  const items = Array.isArray(result["items"]) ? result["items"] : [];
  // Each page mixes in as many blank placeholder entries as links; offset advances by real links only.
  const linkCount = items.filter((entry) => {
    const record = asRecord(entry);
    if (record === null) return false;
    const type = record["type"];
    return typeof type !== "string" || type === "" || type === "link";
  }).length;
  const rawRanges = Array.isArray(result["time_range_list"]) ? result["time_range_list"] : [];
  const timeRanges = rawRanges
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .filter((entry) => typeof entry["value"] === "string" && typeof entry["name"] === "string")
    .map((entry) => ({ value: String(entry["value"]), name: String(entry["name"]) }));
  const rawScopedTip = data["search_not_result_tips"];
  const scopedTip = typeof rawScopedTip === "string" ? rawScopedTip.trim() : "";
  const rawResultTip = result["search_not_result_tips"];
  const resultTip = typeof rawResultTip === "string" ? rawResultTip.trim() : "";
  return { ok: true, items, linkCount, timeRanges, tip: scopedTip !== "" ? scopedTip : resultTip };
}

export async function requestCommunitySearch(
  topicId: string,
  keyword: string,
  offset: number,
  timeRange: string,
  signal: AbortSignal,
): Promise<CommunitySearchPage> {
  // The signed request is tried first; if risk control rejects it, the unsigned request is the fallback.
  const signed = await fetchCommunitySearchPage(buildCommunitySearchUrl(topicId, keyword, offset, timeRange, true), signal);
  if (signed.aborted === true) return signed;
  if (signed.ok === true) return signed;
  const plain = await fetchCommunitySearchPage(buildCommunitySearchUrl(topicId, keyword, offset, timeRange, false), signal);
  return plain.ok === true ? plain : signed;
}

export function pickSearchText(values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

export function pickSearchNumber(values: unknown[]): number {
  for (const value of values) {
    const parsed = readFiniteNumber(value);
    if (parsed !== null && parsed > 0) return parsed;
  }
  return 0;
}

export function normalizeSearchResult(entry: unknown): CommunitySearchItemView | null {
  const record = asRecord(entry);
  if (record === null) return null;
  const type = record["type"];
  if (typeof type === "string" && type !== "" && type !== "link") return null;
  const info = asRecord(record["info"]) ?? record;
  const id = pickSearchText([info["linkid"], info["link_id"], info["id"]]);
  if (id === "") return null;
  const user = asRecord(info["user"]) ?? {};
  const thumbs = Array.isArray(info["thumbs"]) ? info["thumbs"] : [];
  return {
    id: id,
    title: pickSearchText([info["title"], info["name"]]) || "无标题帖子",
    desc: normalizeRailText(pickSearchText([info["description"], info["desc"], info["text"], info["content"], info["summary"]])).slice(0, 160),
    author: pickSearchText([user["username"], user["name"], user["nickname"]]),
    thumb: pickSearchText([thumbs[0], info["thumb"], info["cover"], info["image"]]),
    createAt: pickSearchNumber([info["create_at"], info["create_time"], info["timestamp"]]),
    like: pickSearchNumber([info["like_num"], info["like_count"], info["up"], info["likes"]]),
    comment: pickSearchNumber([info["comment_num"], info["link_comment_num"], info["comment_count"], info["comments"]]),
  };
}

export function createCommunitySearchItem(item: CommunitySearchItemView): HTMLAnchorElement {
  const node = document.createElement("a");
  node.className = "item";
  node.href = LINK_HREF_PREFIX + item.id;
  node.addEventListener("click", (event) => {
    // Modifier keys and the middle button stay with the browser so new tabs keep working.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigateToPath(LINK_HREF_PREFIX + item.id);
  });
  if (item.thumb !== "") {
    const thumb = document.createElement("img");
    thumb.className = "item-thumb";
    thumb.src = item.thumb;
    thumb.alt = "";
    thumb.loading = "lazy";
    thumb.referrerPolicy = "no-referrer";
    node.append(thumb);
  }
  const title = document.createElement("h3");
  title.className = "item-title";
  title.textContent = item.title;
  node.append(title);
  if (item.desc !== "") {
    const desc = document.createElement("p");
    desc.className = "item-desc";
    desc.textContent = item.desc;
    node.append(desc);
  }
  const parts: string[] = [];
  if (item.author !== "") parts.push(item.author);
  if (item.createAt > 0) parts.push(formatRailAge(item.createAt));
  if (item.like > 0) parts.push("赞 " + item.like);
  if (item.comment > 0) parts.push("评论 " + item.comment);
  if (parts.length > 0) {
    const meta = document.createElement("p");
    meta.className = "item-meta";
    meta.textContent = parts.join(" · ");
    node.append(meta);
  }
  return node;
}

export function createCommunitySearchPanel(): CommunitySearchUi {
  const root = document.createElement("section");
  root.id = COMMUNITY_SEARCH_ID;
  root.setAttribute("aria-label", "社区内搜索");

  const bar = document.createElement("form");
  bar.className = "bar";
  bar.setAttribute("role", "search");
  const icon = document.createElement("span");
  icon.className = "icon";
  icon.innerHTML = COMMUNITY_SEARCH_ICONS.search;
  const scope = document.createElement("span");
  scope.className = "scope";
  const input = document.createElement("input");
  input.className = "q";
  input.type = "search";
  input.name = "q";
  input.autocomplete = "off";
  input.placeholder = "搜索本社区的帖子";
  input.setAttribute("aria-label", "搜索本社区的帖子");
  const go = document.createElement("button");
  go.type = "submit";
  go.className = "go";
  go.textContent = "搜索";
  bar.append(icon, scope, input, go);

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.hidden = true;

  const head = document.createElement("div");
  head.className = "head";
  const headText = document.createElement("div");
  headText.className = "head-text";
  const headTitle = document.createElement("p");
  headTitle.className = "head-title";
  const headMeta = document.createElement("p");
  headMeta.className = "head-meta";
  headMeta.setAttribute("role", "status");
  headMeta.setAttribute("aria-live", "polite");
  headText.append(headTitle, headMeta);
  const headActions = document.createElement("div");
  headActions.className = "head-actions";
  const globalLink = document.createElement("a");
  globalLink.className = "ghost";
  globalLink.href = "/app/search/list";
  globalLink.textContent = "全站搜索";
  globalLink.addEventListener("click", (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigateToPath(globalLink.getAttribute("href") || "/app/search/list");
  });
  const close = document.createElement("button");
  close.type = "button";
  close.className = "close";
  close.textContent = "返回社区";
  headActions.append(globalLink, close);
  head.append(headText, headActions);

  const filters = document.createElement("div");
  filters.className = "filters";
  filters.hidden = true;

  const list = document.createElement("div");
  list.className = "list";

  const foot = document.createElement("div");
  foot.className = "foot";
  foot.hidden = true;
  const more = document.createElement("button");
  more.type = "button";
  more.className = "more";
  more.textContent = "加载更多";
  const status = document.createElement("p");
  status.className = "status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  foot.append(more, status);

  panel.append(head, filters, list, foot);
  root.append(bar, panel);

  return { root, bar, input, scope, panel, headTitle, headMeta, globalLink, filters, list, foot, more, status, close };
}

export function watchCommunitySearch(): void {
  if (!document.body) return;
  const ui = createCommunitySearchPanel();
  let state: CommunitySearchState | null = null;
  let searchController: AbortController | null = null;

  const pageNode = (): Element | null => document.querySelector("#page-topic-link");
  const mainNode = (): Element | null => document.querySelector("#page-topic-link .topic-link__main");

  const setActive = (active: boolean): void => {
    const page = pageNode();
    if (page !== null) page.classList.toggle(COMMUNITY_SEARCH_ACTIVE_CLASS, active === true);
    ui.panel.hidden = active !== true;
  };

  const renderChips = () => {
    ui.filters.textContent = "";
    const ranges = state === null ? [] : state.timeRanges;
    if (ranges.length === 0) {
      ui.filters.hidden = true;
      return;
    }
    ui.filters.hidden = false;
    const build = (label: string, value: string): void => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = label;
      chip.setAttribute("aria-pressed", String(state !== null && state.timeRange === value));
      chip.addEventListener("click", () => {
        const current = state;
        if (current === null || current.loading === true || current.timeRange === value) return;
        current.timeRange = value;
        current.offset = 0;
        current.items = [];
        current.noMore = false;
        void run(true);
      });
      ui.filters.append(chip);
    };
    build("不限时间", "");
    for (const range of ranges) build(range.name, range.value);
  };

  const renderItems = (): void => {
    ui.list.textContent = "";
    const items = state === null ? [] : state.items;
    if (items.length > 0) {
      for (const item of items) ui.list.append(createCommunitySearchItem(item));
      return;
    }
    const empty = document.createElement("p");
    empty.className = "empty";
    if (state === null) empty.textContent = "";
    else if (state.loading === true) empty.textContent = "正在搜索…";
    else if (state.error !== "") empty.textContent = state.error;
    else if (state.tip !== "") empty.textContent = state.tip;
    else empty.textContent = "这个社区里没有匹配的帖子，换个关键词试试。";
    ui.list.append(empty);
  };

  const render = (): void => {
    if (state === null) return;
    ui.headTitle.textContent = "在「" + state.topicName + "」中搜索 “" + state.keyword + "”";
    const loaded = state.items.length;
    if (state.loading === true) {
      ui.headMeta.textContent = loaded === 0 ? "搜索中…" : "已加载 " + loaded + " 条，正在继续加载…";
    } else if (loaded === 0) {
      ui.headMeta.textContent = state.error === "" ? "" : "共 0 条";
    } else {
      ui.headMeta.textContent = "本社区已加载 " + loaded + " 条" + (state.noMore === true ? "" : "（还有更多）");
    }
    ui.globalLink.setAttribute("href", "/app/search/list?q=" + encodeURIComponent(state.keyword));
    renderChips();
    renderItems();
    const moreHadFocus = document.activeElement === ui.more;
    ui.foot.hidden = loaded > 0 || state.loading === true ? false : true;
    ui.more.hidden = state.noMore === true;
    ui.more.disabled = state.loading === true;
    if ((ui.more.hidden === true || ui.more.disabled === true) && moreHadFocus) ui.input.focus();
    if (state.status !== "") ui.status.textContent = state.status;
    else if (state.noMore === true && loaded > 0) ui.status.textContent = "已到最后一页";
    else ui.status.textContent = "";
  };

  const run = async (reset: boolean): Promise<void> => {
    const current = state;
    if (current === null || current.loading === true) return;
    current.loading = true;
    current.error = "";
    current.status = reset === true ? "" : "加载中…";
    render();
    const offset = reset === true ? 0 : current.offset;
    searchController?.abort();
    const controller = new AbortController();
    searchController = controller;
    const response = await requestCommunitySearch(current.topicId, current.keyword, offset, current.timeRange, controller.signal);
    if (state !== current || searchController !== controller) return;
    searchController = null;
    current.loading = false;
    current.status = "";
    if (response.aborted === true) {
      current.status = "搜索已取消";
      render();
      return;
    }
    if (response.ok !== true) {
      if (reset === true) {
        current.items = [];
        current.error = "搜索失败：" + response.message;
      } else {
        current.status = "加载失败：" + response.message;
      }
      render();
      return;
    }
    const known = new Set(current.items.map((item) => item.id));
    const incoming: CommunitySearchItemView[] = [];
    for (const entry of response.items) {
      const item = normalizeSearchResult(entry);
      if (item === null || known.has(item.id)) continue;
      known.add(item.id);
      incoming.push(item);
    }
    current.items = reset === true ? incoming : current.items.concat(incoming);
    current.offset = offset + response.linkCount;
    current.noMore = response.linkCount === 0;
    current.tip = response.tip;
    if (current.timeRanges.length === 0 && response.timeRanges.length > 0) current.timeRanges = response.timeRanges;
    render();
  };

  const clearPanel = (): void => {
    ui.list.textContent = "";
    ui.filters.textContent = "";
    ui.filters.hidden = true;
    ui.foot.hidden = true;
    ui.headMeta.textContent = "";
  };

  const close = (restoreFocus: boolean): void => {
    searchController?.abort();
    searchController = null;
    state = null;
    clearPanel();
    setActive(false);
    if (restoreFocus === true) ui.input.focus();
  };

  const submit = (): void => {
    const context = readTopicContext();
    if (context === null) return;
    const keyword = ui.input.value.trim();
    if (keyword === "") {
      ui.input.focus();
      return;
    }
    searchController?.abort();
    searchController = null;
    state = {
      topicId: context.topicId,
      topicName: context.name,
      keyword: keyword,
      timeRange: "",
      items: [],
      offset: 0,
      noMore: false,
      timeRanges: [],
      tip: "",
      error: "",
      status: "",
      loading: false,
    };
    setActive(true);
    render();
    void run(true);
  };

  ui.bar.addEventListener("submit", (event) => {
    event.preventDefault();
    submit();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || state === null || event.defaultPrevented === true) return;
    const target = event.target;
    if (target instanceof Element) {
      if (target !== ui.input && target.closest("input, textarea, select, [contenteditable]") !== null) return;
      const onPage = target === document.body || target === document.documentElement;
      if (onPage !== true && ui.root.contains(target) !== true) return;
      if (onPage === true) {
        const overlayOpen = Array.from(document.querySelectorAll("[aria-modal='true'], .el-overlay-dialog"))
          .some((node) => node.getClientRects().length > 0);
        if (overlayOpen === true) return;
      }
    }
    event.preventDefault();
    close(true);
  });
  ui.close.addEventListener("click", () => close(true));
  ui.more.addEventListener("click", () => {
    void run(false);
  });

  const sync = (): void => {
    ensureCommunitySearchStyle();
    const context = readTopicContext();
    const main = mainNode();
    if (context === null || main === null) {
      searchController?.abort();
      searchController = null;
      if (ui.root.parentNode !== null) ui.root.remove();
      if (state !== null) {
        state = null;
        clearPanel();
      }
      setActive(false);
      return;
    }
    const anchor = main.querySelector(".topic-link__filter-row");
    // The site nests the filter row inside .topic-link__panel, so the insert target must be its parent.
    const mount = anchor === null ? main : anchor.parentNode;
    if (mount === null) return;
    const misplaced = ui.root.parentNode !== mount || (anchor !== null && ui.root.nextElementSibling !== anchor);
    if (misplaced === true) {
      if (anchor !== null) mount.insertBefore(ui.root, anchor);
      else mount.append(ui.root);
    }
    // Compare before writing so the MutationObserver does not wake on our own changes.
    if (ui.scope.textContent !== context.name) ui.scope.textContent = context.name;
    const placeholder = "在「" + context.name + "」中搜索帖子";
    if (ui.input.placeholder !== placeholder) ui.input.placeholder = placeholder;
    if (ui.input.getAttribute("aria-label") !== placeholder) ui.input.setAttribute("aria-label", placeholder);
    // Results do not carry over to another community, so drop them and show the feed again.
    if (state !== null && state.topicId !== context.topicId) {
      searchController?.abort();
      searchController = null;
      state = null;
      clearPanel();
    }
    setActive(state !== null);
  };

  registerPageSync(sync, 250, [PAGE_ROUTE.TOPIC], "topic");
  window.addEventListener("popstate", () => {
    if (state !== null) close(false);
  });
  sync();
}
