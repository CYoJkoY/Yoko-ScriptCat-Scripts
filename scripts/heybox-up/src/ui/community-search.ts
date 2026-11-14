import { PAGE_ROUTE, STORAGE_KEYS } from "../config";
import { LINK_HREF_PREFIX } from "../core/cy";
import { asRecord, readFiniteNumber } from "../core/json";
import { ensureStyleElement, pageSyncTasks, registerPageSync } from "../core/page-sync";
import { fetchWithTimeout, isAbortError } from "../core/request";
import { createSignature, md5Hex } from "../core/signature";
import { sessionStore } from "../state";
import { navigateToPath } from "./navigation";
import { formatRailAge, normalizeRailText } from "./rail";

export const COMMUNITY_SEARCH_API_PATH = "/bbs/app/api/general/search/v1";

export const COMMUNITY_SEARCH_ID = "heybox-up-community-search";

export const COMMUNITY_SEARCH_STYLE_ID = "heybox-up-community-search-style";

export const COMMUNITY_SEARCH_ACTIVE_CLASS = "heybox-up-cs-active";

export const COMMUNITY_SEARCH_PAGE_SIZE = 30;

/** Version of the session record; an unknown shape is ignored, never migrated. */
export const COMMUNITY_SEARCH_STATE_VERSION = 1;

export const COMMUNITY_SEARCH_KEYWORD_MAX = 120;

export const COMMUNITY_SEARCH_RANGE_MAX = 32;

/** Consecutive pages that only repeat shown posts may cost this many requests. */
export const COMMUNITY_SEARCH_DUPLICATE_PAGE_LIMIT = 3;

export const COMMUNITY_SEARCH_RESULT_CACHE_MAX = 60;

export const COMMUNITY_SEARCH_SESSION_MAX_CHARS = 96_000;

function communitySearchStorageKey(topicId: string): string {
  return STORAGE_KEYS.communitySearch + ":" + topicId;
}

export interface CommunitySearchSavedState {
  topicId: string;
  keyword: string;
  timeRange: string;
  filterTag: string;
  open: boolean;
  /** Showing the restored result set instead of the feed. */
  results: boolean;
}

export interface CommunitySearchSession {
  version: 1;
  topicId: string;
  keyword: string;
  timeRange: string;
  filterTag: string;
  open: boolean;
  results: boolean;
  items: CommunitySearchItemView[];
  offset: number;
  noMore: boolean;
  timeRanges: CommunitySearchTimeRange[];
  filterTags: CommunitySearchFilterTag[];
}

export interface TopicContext {
  topicId: string;
  name: string;
}

export interface CommunitySearchTimeRange {
  value: string;
  name: string;
}

export interface CommunitySearchFilterTag {
  tag: string;
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
    filterTags: CommunitySearchFilterTag[];
    tip: string;
  };

export interface CommunitySearchUi {
  root: HTMLElement;
  bar: HTMLFormElement;
  input: HTMLInputElement;
  reset: HTMLButtonElement;
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
  filterTag: string;
  items: CommunitySearchItemView[];
  offset: number;
  noMore: boolean;
  timeRanges: CommunitySearchTimeRange[];
  filterTags: CommunitySearchFilterTag[];
  tip: string;
  error: string;
  status: string;
  loading: boolean;
  /** Consecutive pages that carried links but nothing new. */
  duplicatePages: number;
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
  #heybox-up-community-search button.reset {
    position: relative;
    flex: none;
    width: 26px;
    height: 26px;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--heybox-up-muted, #6b7280);
    font: inherit;
    cursor: pointer;
    transition: background .16s ease, color .16s ease;
  }
  #heybox-up-community-search button.reset::after {
    content: "";
    display: inline-block;
    font-size: 0;
    line-height: 0;
    width: 8px;
    height: 8px;
    border: 1.5px solid currentColor;
    border-radius: 2px;
    transform: rotate(45deg);
  }
  #heybox-up-community-search button.reset::before {
    content: "清空";
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  #heybox-up-community-search button.reset[hidden] { display: none !important; }
  #heybox-up-community-search button.reset:hover {
    background: var(--heybox-up-subtle, rgba(20, 25, 30, .06));
    color: var(--heybox-up-text, #14191e);
  }
  #heybox-up-community-search button.go:focus-visible,
  #heybox-up-community-search button.reset:focus-visible,
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
  #heybox-up-community-search .filter-label {
    display: inline-flex;
    align-items: center;
    padding: 0 3px;
    color: var(--heybox-up-text-2, #3c4249);
    font-size: 12px;
    font-weight: 600;
  }
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

export function buildCommunitySearchUrl(topicId: string, keyword: string, offset: number, timeRange: string, filterTag: string, signed: boolean): string {
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
  if (filterTag !== "") query.set("filter_tag", filterTag);
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
  // Each page mixes in as many blank placeholder entries as links. A blank
  // entry has no result id and is dropped here, so the count only covers real
  // posts and the offset never advances over placeholders.
  const items: unknown[] = [];
  for (const entry of Array.isArray(result["items"]) ? result["items"] : []) {
    if (normalizeSearchResult(entry) !== null) items.push(entry);
  }
  const linkCount = items.length;
  const rawRanges = Array.isArray(result["time_range_list"]) ? result["time_range_list"] : [];
  const timeRanges = rawRanges
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .filter((entry) => typeof entry["value"] === "string" && typeof entry["name"] === "string")
    .map((entry) => ({ value: String(entry["value"]), name: String(entry["name"]) }));
  const rawFilterItem = (Array.isArray(result["items"]) ? result["items"] : [])
    .map((entry) => asRecord(entry))
    .find((entry) => entry !== null && entry["type"] === "filter_tag");
  const rawFilterTags = rawFilterItem !== undefined && rawFilterItem !== null && Array.isArray(rawFilterItem["filter_tags"])
    ? rawFilterItem["filter_tags"]
    : [];
  const filterTags = rawFilterTags
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .filter((entry) => isSearchFilterTagValue(entry["tag"]) && typeof entry["name"] === "string")
    .map((entry) => ({ tag: String(entry["tag"]), name: String(entry["name"]).slice(0, 24) }))
    .slice(0, 12);
  const rawScopedTip = data["search_not_result_tips"];
  const scopedTip = typeof rawScopedTip === "string" ? rawScopedTip.trim() : "";
  const rawResultTip = result["search_not_result_tips"];
  const resultTip = typeof rawResultTip === "string" ? rawResultTip.trim() : "";
  return { ok: true, items, linkCount, timeRanges, filterTags, tip: scopedTip !== "" ? scopedTip : resultTip };
}

export async function requestCommunitySearch(
  topicId: string,
  keyword: string,
  offset: number,
  timeRange: string,
  filterTag: string,
  signal: AbortSignal,
): Promise<CommunitySearchPage> {
  // The signed request is tried first; if risk control rejects it, the unsigned request is the fallback.
  const signed = await fetchCommunitySearchPage(buildCommunitySearchUrl(topicId, keyword, offset, timeRange, filterTag, true), signal);
  if (signed.aborted === true) return signed;
  if (signed.ok === true) return signed;
  const plain = await fetchCommunitySearchPage(buildCommunitySearchUrl(topicId, keyword, offset, timeRange, filterTag, false), signal);
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

/** The API only accepts numeric ids; anything else must not reach the query. */
export function isSearchTopicId(value: unknown): value is string {
  return typeof value === "string" && /^\d{1,20}$/.test(value);
}

export function isSearchTimeRange(value: unknown): value is string {
  return typeof value === "string" && value.length <= COMMUNITY_SEARCH_RANGE_MAX && /^[A-Za-z0-9_-]*$/.test(value);
}

export function isSearchFilterTagValue(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && /^[A-Za-z0-9_-]+$/.test(value);
}

export function normalizeSearchKeyword(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, COMMUNITY_SEARCH_KEYWORD_MAX);
}

/** Reads one stored record and drops every field that does not fit its shape. */
export function parseCommunitySearchSavedState(raw: unknown): CommunitySearchSavedState | null {
  const record = asRecord(raw);
  if (record === null) return null;
  if (record["version"] !== COMMUNITY_SEARCH_STATE_VERSION) return null;
  const body = asRecord(record["state"]);
  if (body === null) return null;
  const topicId = body["topicId"];
  if (!isSearchTopicId(topicId)) return null;
  const rawKeyword = body["keyword"];
  if (typeof rawKeyword !== "string") return null;
  const keyword = normalizeSearchKeyword(rawKeyword);
  if (keyword === "" || rawKeyword.length > COMMUNITY_SEARCH_KEYWORD_MAX * 2) return null;
  const timeRange = body["timeRange"];
  if (!isSearchTimeRange(timeRange)) return null;
  const rawFilterTag = body["filterTag"];
  const filterTag = rawFilterTag === undefined ? "" : rawFilterTag;
  if (typeof filterTag !== "string" || (filterTag !== "" && !isSearchFilterTagValue(filterTag))) return null;
  const open = body["open"];
  if (typeof open !== "boolean") return null;
  // Version 1 records written before results existed lack the field; those
  // restore the keyword and an open search without a result list.
  const results = body["results"];
  if (results !== undefined && typeof results !== "boolean") return null;
  return {
    topicId: topicId,
    keyword: keyword,
    timeRange: timeRange,
    filterTag: filterTag,
    open: open,
    results: open === true && results === true,
  };
}

export function isCommunitySearchItem(value: unknown): value is CommunitySearchItemView {
  const record = asRecord(value);
  if (record === null) return false;
  return isSearchTopicId(record["id"])
    && typeof record["title"] === "string"
    && typeof record["desc"] === "string"
    && typeof record["author"] === "string"
    && typeof record["thumb"] === "string"
    && isFiniteCount(record["createAt"])
    && isFiniteCount(record["like"])
    && isFiniteCount(record["comment"]);
}

function isFiniteCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isSearchRange(value: unknown): value is CommunitySearchTimeRange {
  const record = asRecord(value);
  return record !== null
    && isSearchTimeRange(record["value"])
    && typeof record["name"] === "string"
    && record["name"].length <= 24;
}

function isSearchFilterTag(value: unknown): value is CommunitySearchFilterTag {
  const record = asRecord(value);
  return record !== null
    && isSearchFilterTagValue(record["tag"])
    && typeof record["name"] === "string"
    && record["name"].length <= 24;
}

/**
 * Rebuilds the result list so a reload shows what the reader left behind. Every
 * row is validated because it becomes a link and an image source again.
 */
export function parseCommunitySearchSession(raw: unknown, topicId: string): CommunitySearchSession | null {
  if (!isSearchTopicId(topicId)) return null;
  try {
    if (JSON.stringify(raw).length > COMMUNITY_SEARCH_SESSION_MAX_CHARS) return null;
  } catch {
    return null;
  }
  const record = asRecord(raw);
  if (record === null) return null;
  const saved = parseCommunitySearchSavedState(raw);
  if (saved === null || saved.topicId !== topicId) return null;
  const rawItems = record["items"];
  if (!Array.isArray(rawItems) || rawItems.length > COMMUNITY_SEARCH_RESULT_CACHE_MAX) return null;
  const items: CommunitySearchItemView[] = [];
  const ids = new Set<string>();
  for (const entry of rawItems) {
    if (!isCommunitySearchItem(entry) || ids.has(entry.id)) return null;
    ids.add(entry.id);
    items.push({
      id: entry.id,
      title: entry.title.slice(0, 200),
      desc: entry.desc.slice(0, 240),
      author: entry.author.slice(0, 40),
      thumb: /^https?:\/\//i.test(entry.thumb) ? entry.thumb : "",
      createAt: Number.isFinite(entry.createAt) && entry.createAt > 0 ? entry.createAt : 0,
      like: Number.isFinite(entry.like) && entry.like > 0 ? entry.like : 0,
      comment: Number.isFinite(entry.comment) && entry.comment > 0 ? entry.comment : 0,
    });
  }
  const offset = record["offset"];
  const noMore = record["noMore"];
  if (!Number.isSafeInteger(offset) || Number(offset) < 0 || typeof noMore !== "boolean") return null;
  const rawRanges = record["timeRanges"];
  if (!Array.isArray(rawRanges) || rawRanges.length > 12) return null;
  const timeRanges: CommunitySearchTimeRange[] = [];
  for (const entry of rawRanges) {
    if (!isSearchRange(entry)) return null;
    timeRanges.push({ value: entry.value, name: entry.name.slice(0, 24) });
  }
  const rawFilterTags = record["filterTags"];
  const filterTags: CommunitySearchFilterTag[] = [];
  if (rawFilterTags !== undefined) {
    if (!Array.isArray(rawFilterTags) || rawFilterTags.length > 12) return null;
    for (const entry of rawFilterTags) {
      if (!isSearchFilterTag(entry)) return null;
      filterTags.push({ tag: entry.tag, name: entry.name.slice(0, 24) });
    }
  }
  return {
    version: 1,
    topicId: saved.topicId,
    keyword: saved.keyword,
    timeRange: resolveCommunitySearchRange(timeRanges, saved.timeRange),
    filterTag: filterTags.some((entry) => entry.tag === saved.filterTag) ? saved.filterTag : "",
    open: saved.open,
    results: saved.results,
    items: items,
    offset: Number(offset),
    noMore: noMore,
    timeRanges: timeRanges,
    filterTags: filterTags,
  };
}

export function readCommunitySearchSession(topicId: string): CommunitySearchSession | null {
  if (!isSearchTopicId(topicId)) return null;
  return parseCommunitySearchSession(sessionStore.readJson(communitySearchStorageKey(topicId), null), topicId);
}


export function writeCommunitySearchSession(state: CommunitySearchSession): void {
  if (!isSearchTopicId(state.topicId)) return;
  if (parseCommunitySearchSavedState({ version: 1, state: state }) === null) return;
  if (!state.items.every(isCommunitySearchItem)) return;
  const record = {
    version: COMMUNITY_SEARCH_STATE_VERSION,
    state: {
      topicId: state.topicId,
      keyword: normalizeSearchKeyword(state.keyword),
      timeRange: state.timeRange,
      filterTag: state.filterTag,
      open: state.open === true,
      results: state.results === true,
    },
    items: state.items.slice(0, COMMUNITY_SEARCH_RESULT_CACHE_MAX).map((item) => ({
      id: item.id,
      title: item.title.slice(0, 200),
      desc: item.desc.slice(0, 240),
      author: item.author.slice(0, 40),
      thumb: item.thumb,
      createAt: item.createAt,
      like: item.like,
      comment: item.comment,
    })),
    offset: state.offset,
    noMore: state.noMore === true,
    timeRanges: state.timeRanges.slice(0, 12).map((range) => ({ value: range.value, name: range.name.slice(0, 24) })),
    filterTags: state.filterTags.slice(0, 12).map((tag) => ({ tag: tag.tag, name: tag.name.slice(0, 24) })),
  };
  if (parseCommunitySearchSession(record, state.topicId) === null) return;
  sessionStore.writeJson(communitySearchStorageKey(state.topicId), record);
}

export function clearCommunitySearchSavedState(topicId: string): void {
  if (!isSearchTopicId(topicId)) return;
  sessionStore.remove(communitySearchStorageKey(topicId));
}

/** A range saved by another session may not exist any more; match its label too. */
export function resolveCommunitySearchRange(
  ranges: readonly CommunitySearchTimeRange[],
  savedValue: string,
): string {
  if (savedValue === "") return "";
  return ranges.some((entry) => entry.value === savedValue) ? savedValue : "";
}

export interface CommunitySearchPageState {
  offset: number;
  noMore: boolean;
}

export type CommunitySearchPagingAction = "request" | "wait" | "done";

/**
 * Decides what the paging button should do. While an automatic probe is in
 * flight the button waits instead of issuing a second request.
 */
export function planCommunitySearchPaging(
  state: CommunitySearchPageState,
  loading: boolean,
): CommunitySearchPagingAction {
  if (loading === true) return "wait";
  if (state.noMore === true) return "done";
  return "request";
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

export interface CommunitySearchPageCollector {
  items: CommunitySearchItemView[];
  offset: number;
}

export interface CommunitySearchPageCollection {
  added: number;
  duplicateOnly: boolean;
  exhausted: boolean;
}

/**
 * Merges one page into the collector. A page whose links are all already shown
 * keeps its offset advance but reports duplicateOnly, so the caller can probe
 * one more page instead of leaving the reader to press "load more" again.
 */
export function collectCommunitySearchPage(
  collector: CommunitySearchPageCollector,
  response: { items: unknown[]; linkCount: number },
  reset: boolean,
): CommunitySearchPageCollection {
  const known = new Set(collector.items.map((item) => item.id));
  const incoming: CommunitySearchItemView[] = [];
  let linkCount = 0;
  for (const entry of response.items) {
    const item = normalizeSearchResult(entry);
    if (item !== null) linkCount += 1;
    if (item === null || known.has(item.id)) continue;
    known.add(item.id);
    incoming.push(item);
  }
  collector.items = reset === true ? incoming : collector.items.concat(incoming);
  // A page carrying real links always advances at least one position, even if
  // an older response omitted linkCount, so a probe cannot request it twice.
  const reported = Number(response.linkCount) || 0;
  const step = reported > 0 || linkCount > 0 ? Math.max(reported, linkCount) : 0;
  collector.offset += step;
  const exhausted = linkCount === 0;
  return { added: incoming.length, duplicateOnly: exhausted !== true && incoming.length === 0, exhausted: exhausted };
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
  // type=search adds a second native clear control, so the field uses text with
  // an explicit reset button that also becomes the only non-keyboard clear path.
  input.type = "text";
  input.name = "q";
  input.autocomplete = "off";
  input.placeholder = "搜索本社区的帖子";
  input.setAttribute("aria-label", "搜索本社区的帖子");
  const go = document.createElement("button");
  go.type = "submit";
  go.className = "go";
  go.textContent = "搜索";
  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "reset";
  reset.textContent = "清空";
  reset.hidden = true;
  bar.append(icon, scope, input, reset, go);

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

  return { root, bar, input, reset, scope, panel, headTitle, headMeta, globalLink, filters, list, foot, more, status, close };
}

export function watchCommunitySearch(): () => void {
  if (!document.body) return () => undefined;
  const ui = createCommunitySearchPanel();
  let state: CommunitySearchState | null = null;
  let searchController: AbortController | null = null;
  let restoredTopicId = "";

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
    const filterTags = state === null ? [] : state.filterTags;
    if (ranges.length === 0 && filterTags.length === 0) {
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
        current.duplicatePages = 0;
        persist();
        void run(true);
      });
      ui.filters.append(chip);
    };
    build("不限时间", "");
    for (const range of ranges) build(range.name, range.value);
    if (filterTags.length > 0) {
      const divider = document.createElement("span");
      divider.className = "filter-label";
      divider.textContent = "分类";
      ui.filters.append(divider);
      const buildTag = (label: string, value: string): void => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip";
        chip.textContent = label;
        chip.setAttribute("aria-pressed", String(state !== null && state.filterTag === value));
        chip.addEventListener("click", () => {
          const current = state;
          if (current === null || current.loading === true || current.filterTag === value) return;
          current.filterTag = value;
          current.offset = 0;
          current.items = [];
          current.noMore = false;
          current.duplicatePages = 0;
          persist();
          void run(true);
        });
        ui.filters.append(chip);
      };
      buildTag("全部分类", "");
      for (const tag of filterTags) buildTag(tag.name, tag.tag);
    }
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

  const syncResetVisibility = (): void => {
    const hidden = ui.input.value === "";
    if (ui.reset.hidden !== hidden) ui.reset.hidden = hidden;
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
    if (ui.input.value !== state.keyword) ui.input.value = state.keyword;
    syncResetVisibility();
    const moreHadFocus = document.activeElement === ui.more;
    ui.foot.hidden = loaded > 0 || state.loading === true ? false : true;
    ui.more.hidden = state.noMore === true;
    ui.more.disabled = state.loading === true;
    if ((ui.more.hidden === true || ui.more.disabled === true) && moreHadFocus) ui.input.focus();
    if (state.status !== "") ui.status.textContent = state.status;
    else if (state.noMore === true && loaded > 0) ui.status.textContent = "已到最后一页";
    else ui.status.textContent = "";
  };

  /** Returns true once the page result was merged into the current state. */
  const run = async (reset: boolean): Promise<boolean> => {
    const current = state;
    if (current === null || current.loading === true) return false;
    current.loading = true;
    current.error = "";
    current.status = reset === true ? "" : "加载中…";
    render();
    const offset = reset === true ? 0 : current.offset;
    if (reset === true) current.offset = 0;
    searchController?.abort();
    const controller = new AbortController();
    searchController = controller;
    const response = await requestCommunitySearch(current.topicId, current.keyword, offset, current.timeRange, current.filterTag, controller.signal);
    if (state !== current || searchController !== controller) return false;
    searchController = null;
    current.loading = false;
    current.status = "";
    if (response.aborted === true) {
      current.status = "搜索已取消";
      render();
      return false;
    }
    if (response.ok !== true) {
      if (reset === true) {
        current.items = [];
        current.error = "搜索失败：" + response.message;
      } else {
        current.status = "加载失败：" + response.message;
      }
      render();
      return false;
    }
    const collection = collectCommunitySearchPage(current, response, reset);
    current.noMore = collection.exhausted;
    current.tip = response.tip;
    if (current.timeRanges.length === 0 && response.timeRanges.length > 0) current.timeRanges = response.timeRanges;
    if (current.filterTags.length === 0 && response.filterTags.length > 0) current.filterTags = response.filterTags;
    // A page made only of already shown posts advances the offset without
    // growing the list. Probe the next page a bounded number of times so the
    // reader does not have to click "load more" repeatedly for no visible
    // change, then say where the list really stopped.
    if (reset !== true && collection.duplicateOnly === true) {
      const duplicates = Math.min(current.duplicatePages + 1, COMMUNITY_SEARCH_DUPLICATE_PAGE_LIMIT);
      current.duplicatePages = duplicates;
      if (duplicates < COMMUNITY_SEARCH_DUPLICATE_PAGE_LIMIT) {
        return await run(false);
      }
      current.status = "已连续 " + duplicates + " 页没有新帖子，已暂停自动翻页";
    } else if (collection.added > 0 || reset === true) {
      current.duplicatePages = 0;
    }
    render();
    return true;
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
    if (restoreFocus === true) {
      ui.input.setSelectionRange(ui.input.value.length, ui.input.value.length);
    }
    persist();
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
      filterTag: "",
      items: [],
      offset: 0,
      noMore: false,
      timeRanges: [],
      filterTags: [],
      tip: "",
      error: "",
      status: "",
      loading: false,
      duplicatePages: 0,
    };
    setActive(true);
    render();
    persist();
    void run(true).then(persist, () => undefined);
  };

  ui.bar.addEventListener("submit", (event) => {
    event.preventDefault();
    submit();
  });
  ui.input.addEventListener("input", syncResetVisibility);
  ui.reset.addEventListener("click", () => {
    searchController?.abort();
    searchController = null;
    state = null;
    clearPanel();
    setActive(false);
    ui.input.value = "";
    const context = readTopicContext();
    if (context !== null) clearCommunitySearchSavedState(context.topicId);
    syncResetVisibility();
    ui.input.focus();
  });
  ui.input.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || ui.input.value === "") return;
    event.preventDefault();
    ui.input.value = "";
    syncResetVisibility();
  });
  // Leaving the field after typing keeps the draft for the next visit.
  ui.input.addEventListener("change", persist);
  const onKeyDown = (event: KeyboardEvent): void => {
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
  };
  document.addEventListener("keydown", onKeyDown);
  ui.close.addEventListener("click", () => close(true));
  ui.more.addEventListener("click", () => {
    void run(false).then(persist, () => undefined);
  });

  const sync = (): void => {
    ensureCommunitySearchStyle();
    const context = readTopicContext();
    const main = mainNode();
    if (context === null || main === null) {
      searchController?.abort();
      searchController = null;
      if (ui.root.parentNode !== null) ui.root.remove();
      restoredTopicId = "";
      ui.input.value = "";
      syncResetVisibility();
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
    restore(context);
    setActive(state !== null);
  };

  /** Stores the keyword and the open panel, with the list only when it is showing. */
  function persist(): void {
    const context = readTopicContext();
    if (context === null) return;
    const current = state !== null && state.topicId === context.topicId ? state : null;
    const keyword = current !== null ? current.keyword : normalizeSearchKeyword(ui.input.value);
    if (keyword === "") {
      clearCommunitySearchSavedState(context.topicId);
      return;
    }
    const ranges = current !== null ? current.timeRanges : [];
    writeCommunitySearchSession({
      version: 1,
      topicId: context.topicId,
      keyword: keyword,
      timeRange: current !== null ? resolveCommunitySearchRange(ranges, current.timeRange) : "",
      filterTag: current !== null ? current.filterTag : "",
      open: current !== null || ui.input.value.trim() !== "",
      results: current !== null,
      items: current !== null ? current.items : [],
      offset: current !== null ? current.offset : 0,
      noMore: current !== null ? current.noMore : false,
      timeRanges: ranges,
      filterTags: current !== null ? current.filterTags : [],
    });
  }

  /** Runs once per topic visit; returning to the feed leaves the keyword only. */
  const restore = (context: TopicContext): void => {
    if (restoredTopicId === context.topicId) return;
    if (restoredTopicId !== "") {
      ui.input.value = "";
      syncResetVisibility();
    }
    restoredTopicId = context.topicId;
    const saved = readCommunitySearchSession(context.topicId);
    if (saved === null) return;
    ui.input.value = saved.keyword;
    syncResetVisibility();
    if (saved.open !== true) return;
    state = {
      topicId: context.topicId,
      topicName: context.name,
      keyword: saved.keyword,
      timeRange: saved.timeRange,
      filterTag: saved.filterTag,
      items: saved.results === true ? saved.items : [],
      offset: saved.offset,
      noMore: saved.noMore,
      timeRanges: saved.timeRanges,
      filterTags: saved.filterTags,
      tip: "",
      error: "",
      status: "",
      loading: false,
      duplicatePages: 0,
    };
    setActive(true);
    render();
    // An open panel without a restored list fetches once; a restored list keeps
    // its saved rows until the reader asks for more.
    if (saved.results !== true) void run(true).then(persist, () => undefined);
  };

  registerPageSync(sync, 250, [PAGE_ROUTE.TOPIC], "topic");
  const controller = new AbortController();
  window.addEventListener("popstate", () => {
    if (state !== null) close(false);
  }, { signal: controller.signal });
  sync();
  return () => {
    controller.abort();
    searchController?.abort();
    searchController = null;
    pageSyncTasks.delete(sync);
    ui.root.remove();
    document.removeEventListener("keydown", onKeyDown);
    setActive(false);
  };
}
