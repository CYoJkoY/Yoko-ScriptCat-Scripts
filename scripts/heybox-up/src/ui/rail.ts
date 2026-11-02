import { PAGE_ROUTE } from "../config";
import { getHeyboxId } from "../core/account";
import { LINK_HREF_PREFIX, formatTime } from "../core/cy";
import { readPageRoute, registerPageSync } from "../core/page-sync";
import { asRecord } from "../core/json";
import { fetchWithTimeout, isAbortError, waitForDelay } from "../core/request";
import { createSignature, md5Hex } from "../core/signature";
import { COMMENT_PREVIEW_EVENT, HIDE_CY_EVENT, isCyComment, readCommentPreviewPreference, readHideCyPreference, setHideCyPreference } from "../state";

export const RAIL_ID = "heybox-up-comment-rail";

export const COMMENT_TREE_API_PATH = "/bbs/app/link/tree";

export const COMMENT_CREATE_API_PATH = "/bbs/app/comment/create";

export const DELETE_COMMENT_API_PATH = "/bbs/app/comment/delete";

export const COMMENT_CREATE_RND_VERSION = "15";

export const COMMENT_CREATE_RND_SECRET = "Z7mFG4tQp9Ws2LxB8H";

export const RAIL_PAGE_SIZE = 20;

export interface ApiParams {
  os_type: string;
  app: string;
  client_type: string;
  version: string;
  web_version: string;
  x_client_type: string;
  x_app: string;
  x_os_type: string;
  device_info: string;
  hkey: string;
  _time: string;
  nonce: string;
  [key: string]: string;
}

export interface RailTextSegment {
  type: "text";
  text: string;
}

export interface RailEmojiSegment {
  type: "emoji";
  id: string;
}

export interface RailImageSegment {
  type: "image";
  src: string;
}

export type RailSegment = RailTextSegment | RailEmojiSegment | RailImageSegment;

export interface RailComment {
  id: string;
  /** Author account id; empty when the payload did not expose one. */
  userId: string;
  name: string;
  /** Name echoed by the server for the comment this one answers. */
  replyName: string;
  avatar: string;
  text: string;
  body: RailSegment[];
  createAt: number;
  likes: number;
  replies: number;
  rootId: string;
  parentId: string;
  isCy: boolean;
}

export interface RailCommentEntry extends RailComment {
  subComments: RailComment[];
  /** Backwards-compatible alias for subComments. */
  quotes: RailComment[];
}

/** One comment with its resolved replies, kept in the order the server sent. */
export interface RailCommentThreadNode extends RailComment {
  children: RailCommentThreadNode[];
}

export interface RailLinkInfo {
  isAward: boolean;
  isFavour: boolean;
  awardCount: number;
  favourCount: number;
  commentCount: number;
  cyCount: number;
}

export interface RailPage {
  items: RailCommentEntry[];
  total: number;
  floorTotal: number;
  title: string;
  link: RailLinkInfo;
  groups: unknown[];
}

export interface CommentPageProgressInput {
  rawGroupCount: number;
  freshGroupCount: number;
  previouslyLoadedGroups: number;
  floorTotal: number;
}

export interface CommentPageProgress {
  hasMore: boolean;
  loadedGroups: number;
}

export interface ArticleReplyTargetPayload {
  id: string;
  rootId: string;
}

export interface RailPageOptions {
  accountId?: string;
  signal?: AbortSignal | null;
  /** Skips the in-memory page cache so a refresh always reads the site. */
  bypassCache?: boolean;
  /** Only accepts a cached page younger than this many milliseconds. */
  maxAgeMs?: number;
}

export const RAIL_TRIGGER_SELECTOR = ".bbs-new-style-bottom__comment, .content-list__comment";

export const RAIL_ICONS = {
  comment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-3-.4L4 21l1.4-4.4A8.3 8.3 0 0 1 3.6 11.5 8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4Z"/></svg>',
  external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-8.5 8.5"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  collapse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
};

export const RAIL_CSS = `
  [hidden] { display: none !important; }
  :host {
    --rail-bg: var(--heybox-up-surface, #fff);
    --rail-text: var(--heybox-up-text, #14191e);
    --rail-text-2: var(--heybox-up-text-2, #3c4249);
    --rail-muted: var(--heybox-up-muted, #6b7280);
    --rail-subtle: var(--heybox-up-subtle, rgba(20, 25, 30, .06));
    --rail-line: var(--heybox-up-border, rgba(20, 25, 30, .1));
    --rail-accent: var(--heybox-up-accent, #6f8db3);
    --rail-radius: var(--heybox-up-radius-card, 14px);
    position: fixed;
    top: 80px;
    right: 20px;
    width: var(--heybox-up-rail-w, 340px);
    display: block;
    /* Below the site navigation (5000) and full-screen loading (2002), above body and editor controls. */
    z-index: 1500;
    font: 13px/1.6 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
    color: var(--rail-text);
  }
  :host([data-state="hidden"]) { display: none; }
  @media (max-width: 1199px) { :host { display: none; } }
  .panel {
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 168px);
    background: var(--rail-bg);
    border: 1px solid var(--rail-line);
    border-radius: var(--rail-radius);
    box-shadow: var(--heybox-up-shadow-2, 0 18px 44px rgba(8, 12, 16, .24));
    overflow: hidden;
  }
  :host([data-state="collapsed"]) { top: 50%; right: 0; width: auto; transform: translateY(-50%); }
  :host([data-state="collapsed"]) .panel { border-radius: var(--rail-radius) 0 0 var(--rail-radius); }
  :host([data-state="collapsed"]) .dock { display: none; }
  :host([data-state="open"]) .tab { display: none; }
  .tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    padding: 12px 7px;
    border: 0;
    background: transparent;
    color: var(--rail-muted);
    font: inherit;
    writing-mode: vertical-rl;
    cursor: pointer;
  }
  .tab:hover { background: var(--rail-subtle); color: var(--rail-text); }
  .tab:focus-visible { outline: 2px solid var(--rail-accent); outline-offset: -2px; }
  .tab svg { width: 15px; height: 15px; }
  .dock { display: flex; flex-direction: column; min-height: 0; }
  .head { display: flex; gap: 8px; padding: 12px 14px 10px; border-bottom: 1px solid var(--rail-line); }
  .head-text { flex: 1 1 auto; min-width: 0; }
  .kicker { font-size: 10px; letter-spacing: .12em; color: var(--rail-muted); }
  .title {
    margin-top: 3px;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.45;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
  }
  .tools { display: flex; flex: none; gap: 2px; }
  .icon {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--rail-muted);
    text-decoration: none;
    cursor: pointer;
  }
  .icon:hover { background: var(--rail-subtle); color: var(--rail-text); }
  .icon:focus-visible { outline: 2px solid var(--rail-accent); outline-offset: 1px; }
  .icon svg { width: 16px; height: 16px; }
  .icon.cy {
    width: auto;
    min-width: 26px;
    padding: 0 5px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: .04em;
  }
  .icon.cy[aria-pressed="true"] { background: var(--rail-subtle); color: var(--rail-accent); }
  .meta { padding: 8px 14px 0; font-size: 11px; color: var(--rail-muted); }
  .list { margin: 0; padding: 8px 0 0; list-style: none; overflow-y: auto; overscroll-behavior: contain; min-height: 0; }
  .item { display: flex; gap: 10px; padding: 11px 14px; border-top: 1px solid var(--rail-subtle); }
  .item:first-child { border-top: 0; }
  .avatar { width: 26px; height: 26px; border-radius: 50%; object-fit: cover; flex: none; background: var(--rail-subtle); }
  .body { flex: 1 1 auto; min-width: 0; }
  .who { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; }
  .name { font-size: 12px; font-weight: 600; color: var(--rail-text); }
  .time, .likes, .replies { font-size: 11px; color: var(--rail-muted); }
  .text { margin: 3px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--rail-text); }
  .text .emoji, .quote .emoji {
    display: inline-block;
    width: 17px;
    height: 17px;
    margin: 0 1px;
    vertical-align: -3px;
    background-repeat: no-repeat;
    background-size: 102px 306px;
  }
  .text .pic, .quote .pic {
    max-width: 100%;
    max-height: 160px;
    border-radius: 6px;
    object-fit: contain;
    vertical-align: top;
  }
  .foot { display: flex; gap: 10px; margin-top: 4px; }
  .sub { display: grid; gap: 4px; margin-top: 7px; padding-left: 9px; border-left: 2px solid var(--rail-subtle); }
  .quote {
    font-size: 12px;
    color: var(--rail-text-2);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
  }
  .quote .quote-name { color: var(--rail-muted); }
  .status { padding: 26px 18px; text-align: center; color: var(--rail-muted); }
  .status.retry { cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
  .status a { color: var(--rail-accent); text-decoration: underline; text-underline-offset: 3px; }
  .foot-bar { display: flex; gap: 8px; padding: 11px 12px; border-top: 1px solid var(--rail-line); }
  .action {
    flex: 1 1 auto;
    height: 30px;
    border: 1px solid var(--rail-line);
    border-radius: 8px;
    background: transparent;
    color: var(--rail-text);
    font: inherit;
    cursor: pointer;
  }
  .action:hover { background: var(--rail-subtle); }
  .action:focus-visible { outline: 2px solid var(--rail-accent); outline-offset: 1px; }
  .action.primary { border-color: transparent; background: var(--rail-accent); color: var(--heybox-up-on-accent, #fff); }
`;

export function createApiParams(path: string): ApiParams {
  const time = Math.floor(Date.now() / 1000);
  const nonce = md5Hex(String(time) + String(Math.random())).toUpperCase();
  return {
    os_type: "web",
    app: "heybox",
    client_type: "web",
    version: "999.0.4",
    web_version: "2.5",
    x_client_type: "web",
    x_app: "heybox_website",
    x_os_type: "Windows",
    device_info: "Chrome",
    hkey: createSignature(path, time, nonce),
    _time: String(time),
    nonce: nonce,
  };
}

export async function createCommentRnd(nonce: string, timestamp: string): Promise<string> {
  if (globalThis.crypto === undefined || globalThis.crypto.subtle === undefined) {
    throw new Error("当前浏览器不支持 CY 发布签名");
  }
  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(COMMENT_CREATE_RND_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const message = COMMENT_CREATE_RND_SECRET + nonce + timestamp + ":" + nonce;
  const signature = await globalThis.crypto.subtle.sign("HMAC", key, encoder.encode(message));
  const digest = Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return COMMENT_CREATE_RND_VERSION + ":" + digest;
}

export function buildLinkCommentUrl(
  linkId: string,
  page: number,
  signed: boolean,
  accountId: string = getHeyboxId(),
): string {
  const base = signed === false ? { heybox_id: accountId, os_type: "web", app: "heybox", client_type: "web", version: "999.0.4", web_version: "2.5", x_client_type: "web", x_app: "heybox_website", x_os_type: "Windows", device_info: "Chrome" } : createApiParams(COMMENT_TREE_API_PATH);
  const query = new URLSearchParams({
    ...base,
    heybox_id: accountId,
    link_id: String(linkId),
    is_first: page === 1 ? "1" : "0",
    page: String(page),
    index: "1",
    limit: String(RAIL_PAGE_SIZE),
    owner_only: "0",
  });
  // h_src 是站点网页端自带的空参数，缺省时接口更容易触发风控。
  return "https://api.xiaoheihe.cn" + COMMENT_TREE_API_PATH + "?" + query.toString().replace("&link_id=", "&h_src&link_id=");
}

export function normalizeRailText(value: unknown): string {
  return String(value === undefined || value === null ? "" : value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

export const RAIL_BODY_MAX = 4000;

export const RAIL_EMOJI_SPRITE = "https://static.max-c.com/heybox_web/emoji/cube/cube_emoji_v33.png";

export const RAIL_EMOJI_CELL = 17;

export const RAIL_EMOJI_TOKEN = /\[cube_([^\]]{1,64})\]/g;

export const RAIL_EMOJI_NAMES = [
  "哭泣", "酷", "doge", "喜欢", "黑人问号", "惊讶",
  "开心", "捂脸哭", "晕", "感动", "委屈", "并不简单",
  "乖", "笑cry", "怒", "滑稽", "沧桑", "凄凉",
  "赞", "学习", "叹气", "加油", "摊手", "喷水",
  "打脸", "H币", "生气", "困", "闭嘴", "吐",
  "咕咕", "微笑", "哇", "汗", "吓", "睡觉",
  "2023", "圣诞树", "庆祝", "庆祝-圣诞", "你懂我", "我懂你",
  "阳", "比心", "wota", "鹅", "握草", "这是什么鸟",
  "上学-乐", "上学-丧", "打咩", "超人", "僵尸", "小鸡",
  "窝囊", "摸摸头", "电牛", "摘墨镜", "悟空", "2024",
  "良民", "嬉水女王", "2025", "浪人砍一刀", "吃鸡啦", "鸡毙你",
  "机智", "石化", "吹口哨", "思考", "太酷啦", "蛋糕",
  "毁灭战士", "P的谎言", "剑星伊芙", "欧润吉", "剑星渡鸦", "猛男微笑",
  "时间旅者", "来财", "我方了", "喜+1", "2026", "害羞",
  "吃瓜", "菜doge", "柠檬", "比耶", "爱心", "玫瑰",
  "+1", "-1", "点赞", "盒十", "耶", "鼓掌",
  "碰拳", "马年吉祥", "红包", "炒菜", "山姆无奈", "洛的点赞",
  "灵光一闪", "露莉亚", "傲娇助手", "认真记录", "鳄鱼", "星乐蒂",
];

export const RAIL_EMOJI_NAME_IDS = new Map(
  RAIL_EMOJI_NAMES.map((name, index) => [name, String((Math.floor(index / 6) + 1) * 10 + (index % 6) + 1)])
);

export function isRailEmojiId(value: unknown): boolean {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 11 || id > 186) return false;
  const unit = id % 10;
  const row = Math.floor(id / 10);
  return unit >= 1 && unit <= 6 && row >= 1 && row <= 18;
}

export function resolveRailEmojiId(value: unknown): string {
  const raw = String(value === undefined || value === null ? "" : value).trim();
  const candidate = raw.startsWith("cube_") ? raw.slice(5) : raw;
  if (isRailEmojiId(candidate)) return String(Number(candidate));
  return RAIL_EMOJI_NAME_IDS.get(candidate) || "";
}

export function parseRailBody(value: unknown): RailSegment[] {
  const source = String(value === undefined || value === null ? "" : value).slice(0, RAIL_BODY_MAX);
  if (source === "") return [];
  const template = document.createElement("template");
  template.innerHTML = source;
  const segments: RailSegment[] = [];
  const pushText = (value: unknown): void => {
    const parts = String(value).split(RAIL_EMOJI_TOKEN);
    for (let index = 0; index < parts.length; index += 1) {
      if (index % 2 === 1) {
        const emojiId = resolveRailEmojiId(parts[index]);
        if (emojiId !== "") segments.push({ type: "emoji", id: emojiId });
        else segments.push({ type: "text", text: "[cube_" + parts[index] + "]" });
        continue;
      }
      const collapsed = parts[index].replace(/\s+/g, " ");
      if (collapsed.trim() === "") continue;
      segments.push({ type: "text", text: collapsed });
    }
  };
  const walk = (node: ParentNode): void => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        pushText(child.nodeValue);
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE || !(child instanceof Element)) continue;
      const element = child;
      const emoji = element.getAttribute("data-emoji");
      if (emoji !== null && emoji !== "") {
        const match = /(?:^|\s)hb-emoji-cube_([^\s]+)/.exec(String(element.className || ""));
        const candidates = [match === null ? "" : match[1], emoji];
        const id = candidates.map(resolveRailEmojiId).find((item) => item !== "") || "";
        if (id !== "") segments.push({ type: "emoji", id: id });
        else segments.push({ type: "text", text: "[" + emoji + "]" });
        continue;
      }
      if (element.tagName === "IMG") {
        const src = element.getAttribute("src");
        if (src !== null && /^https?:\/\//i.test(src)) segments.push({ type: "image", src });
        continue;
      }
      if (element.tagName === "BR") {
        pushText(" ");
        continue;
      }
      walk(element);
    }
  };
  walk(template.content);
  if (segments.length > 0) {
    const first = segments[0];
    if (first.type === "text") first.text = first.text.replace(/^\s+/, "");
    const last = segments[segments.length - 1];
    if (last.type === "text") last.text = last.text.replace(/\s+$/, "");
  }
  return segments.filter((segment) => segment.type !== "text" || segment.text !== "").slice(0, 80);
}

export function railBodyText(segments: readonly RailSegment[]): string {
  return segments.filter((segment) => segment.type === "text").map((segment) => segment.text).join(" ").trim();
}

export function normalizeRailComment(comment: unknown): RailComment {
  const raw = asRecord(comment) ?? {};
  const user = asRecord(raw["user"]) ?? {};
  const avatar = user["avatar"] || user["avartar"] || "";
  const body = parseRailBody(raw["text"]);
  const id = String(raw["comment_id"] || raw["commentid"] || raw["id"] || "");
  const rawRootId = readRailRelationId(raw, ["root_id", "root_comment_id", "reply_root_id"]);
  return {
    id: id,
    userId: readRailCommentUserId(user),
    name: String(user["username"] || user["nickname"] || "匿名用户").trim(),
    replyName: readRailReplyName(raw),
    avatar: typeof avatar === "string" ? avatar : "",
    text: railBodyText(body),
    body: body,
    createAt: Number(raw["create_at"]) || 0,
    likes: Number(raw["support_num"] || raw["support_count"]) || 0,
    replies: Number(raw["reply_count"] || raw["sub_comment_num"]) || 0,
    // A root that points at itself is not a usable parent; the group builder
    // falls back to the floor id instead.
    rootId: rawRootId === id ? "" : rawRootId,
    parentId: readRailRelationId(raw, ["parent_id", "replyid", "reply_id", "reply_to_comment_id", "reply_comment_id", "reply_to", "to_comment_id"]),
    isCy: isCyComment(raw),
  };
}

function readRailReplyName(raw: Record<string, unknown>): string {
  const replyUser = asRecord(raw["replyuser"]) ?? asRecord(raw["reply_user"]) ?? {};
  return String(replyUser["username"] || replyUser["nickname"] || "").trim();
}

function readRailCommentUserId(user: Record<string, unknown>): string {
  for (const key of ["userid", "user_id", "heybox_id", "id"]) {
    const value = user[key];
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text === "" || text === "-1" || text === "0" || text === "undefined" || text === "null") continue;
    return text;
  }
  return "";
}

/**
 * Only the author of a comment may delete it, so the reader compares the
 * resolved account id against the comment author instead of trusting the DOM.
 */
export function isOwnRailComment(comment: { readonly userId: string }, accountId: string): boolean {
  const owner = typeof accountId === "string" ? accountId.trim() : "";
  if (owner === "" || comment.userId === "") return false;
  return comment.userId === owner;
}

function readRailRelationId(raw: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = raw[key];
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text === "" || text === "-1" || text === "0") continue;
    return text;
  }
  return "";
}

export function normalizeRailGroup(group: unknown): RailCommentEntry | null {
  // A group is only iterable when its comment field is an array; guard instead
  // of indexing the raw payload.
  const source = asRecord(group)?.["comment"];
  const list: unknown[] = Array.isArray(source) ? source : [];
  const root = list[0];
  if (root === undefined) return null;
  const item = normalizeRailComment(root);
  if (item.id === "" && item.body.length === 0 && item.name === "匿名用户") return null;
  // The tree endpoint nests every child comment after the floor. Keep all of
  // them so the reader can show and reply to the whole thread.
  const seen = new Set<string>();
  const subComments = list.slice(1)
    .map(normalizeRailComment)
    .filter((quote) => quote.body.length > 0)
    .filter((quote) => {
      if (quote.id === "") return true;
      if (seen.has(quote.id)) return false;
      seen.add(quote.id);
      return true;
    })
    .map((quote) => ({
      ...quote,
      rootId: quote.rootId !== "" ? quote.rootId : item.id,
      parentId: quote.parentId !== "" ? quote.parentId : item.id,
    }));
  return {
    ...item,
    rootId: item.id,
    parentId: item.id,
    subComments: subComments,
    quotes: subComments,
  };
}

/**
 * Resolves the flat child list of one floor into a nested tree. A parent that
 * is missing, self-referencing, outside this group, or part of a parent cycle
 * is attached to the floor, so a malformed payload never drops a comment.
 */
export function buildRailCommentTree(entry: RailCommentEntry): RailCommentThreadNode[] {
  const source = Array.isArray(entry.subComments) ? entry.subComments : [];
  const nodes: RailCommentThreadNode[] = [];
  const byId = new Map<string, RailCommentThreadNode>();
  for (const comment of source) {
    if (comment.id !== "" && byId.has(comment.id)) continue;
    const node: RailCommentThreadNode = { ...comment, children: [] };
    nodes.push(node);
    if (comment.id !== "") byId.set(comment.id, node);
  }
  const parentOf = new Map<RailCommentThreadNode, RailCommentThreadNode>();
  for (const node of nodes) {
    if (node.id === "" || node.parentId === "" || node.parentId === entry.id || node.parentId === node.id) continue;
    const parent = byId.get(node.parentId);
    if (parent === undefined || parent === node) continue;
    parentOf.set(node, parent);
  }
  // A cycle cannot be rendered recursively. Every node whose parent chain runs
  // into one is promoted to a floor reply instead.
  const detached = new Set<RailCommentThreadNode>();
  for (const node of nodes) {
    const seen = new Set<RailCommentThreadNode>();
    let cursor: RailCommentThreadNode | undefined = node;
    while (cursor !== undefined && !seen.has(cursor)) {
      seen.add(cursor);
      cursor = parentOf.get(cursor);
    }
    if (cursor !== undefined) {
      for (const member of seen) detached.add(member);
    }
  }
  const roots: RailCommentThreadNode[] = [];
  for (const node of nodes) {
    if (detached.has(node)) {
      roots.push(node);
      continue;
    }
    const parent = parentOf.get(node);
    if (parent === undefined || detached.has(parent)) {
      roots.push(node);
      continue;
    }
    parent.children.push(node);
  }
  return roots;
}

export function readRailFloorTotal(result: unknown): number {
  const value = Number(asRecord(result)?.["total_floor_num"]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function resolveCommentPageProgress(input: CommentPageProgressInput): CommentPageProgress {
  const loadedGroups = input.previouslyLoadedGroups + input.rawGroupCount;
  if (input.rawGroupCount <= 0) return { hasMore: false, loadedGroups: loadedGroups };
  if (input.freshGroupCount <= 0) return { hasMore: false, loadedGroups: loadedGroups };
  if (input.floorTotal > 0 && loadedGroups >= input.floorTotal) {
    return { hasMore: false, loadedGroups: loadedGroups };
  }
  if (input.floorTotal <= 0 && input.rawGroupCount < RAIL_PAGE_SIZE) {
    return { hasMore: false, loadedGroups: loadedGroups };
  }
  return { hasMore: true, loadedGroups: loadedGroups };
}

/**
 * A merge keeps the floors of pages read earlier, so the group count is the
 * list length instead of the size of the page that was just refreshed.
 */
export function resolveMergedCommentProgress(input: {
  loadedGroups: number;
  floorTotal: number;
  rawGroupCount: number;
}): CommentPageProgress {
  if (input.floorTotal > 0) {
    return { hasMore: input.loadedGroups < input.floorTotal, loadedGroups: input.loadedGroups };
  }
  return { hasMore: input.rawGroupCount >= RAIL_PAGE_SIZE, loadedGroups: input.loadedGroups };
}

export function buildArticleCommentBody(
  linkId: string,
  text: string,
  target: ArticleReplyTargetPayload | null,
): Record<string, string> {
  return {
    is_cy: "0",
    link_id: linkId,
    reply_id: target === null ? "-1" : target.id,
    root_id: target === null ? "-1" : target.rootId,
    text: text,
  };
}

export function buildDeleteCommentBody(commentId: string): Record<string, string> {
  return { comment_id: commentId };
}

/** Reads the id of a freshly created comment so the reader can look for it. */
export function readCreatedCommentId(result: unknown): string {
  const record = asRecord(result);
  if (record === null) return "";
  const nested = asRecord(record["comment"]);
  const candidates: unknown[] = [record["comment_id"], record["commentid"], record["id"]];
  if (nested !== null) candidates.push(nested["comment_id"], nested["commentid"], nested["id"]);
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const text = String(candidate).trim();
    if (text === "" || text === "0" || text === "-1" || text === "undefined" || text === "null") continue;
    return text;
  }
  return "";
}

/** True when the loaded tree contains this floor or nested reply. */
export function railItemsHaveComment(items: readonly RailCommentEntry[], commentId: string): boolean {
  if (commentId === "") return false;
  for (const entry of items) {
    if (entry.id === commentId) return true;
    if (railThreadHasComment(buildRailCommentTree(entry), commentId)) return true;
  }
  return false;
}

function railThreadHasComment(nodes: readonly RailCommentThreadNode[], commentId: string): boolean {
  for (const node of nodes) {
    if (node.id === commentId) return true;
    if (railThreadHasComment(node.children, commentId)) return true;
  }
  return false;
}

/**
 * Every reply the site returns lives inside the floor group it belongs to, so
 * the floor id is what identifies the page that must be re-read after a write.
 */
export function findRailFloorIdForComment(items: readonly RailCommentEntry[], commentId: string): string {
  if (commentId === "") return "";
  for (const entry of items) {
    if (entry.id === commentId) return entry.id;
    if (railThreadHasComment(buildRailCommentTree(entry), commentId)) return entry.id;
  }
  return "";
}

/**
 * A page-one refresh answers with the newest floors and replies, but it does
 * not carry the floors a reader already paged in. Merging keeps the order the
 * list had: a floor that the refreshed page returned is replaced in place, a
 * new floor goes to the top, and floors of other pages stay where they were.
 */
export function mergeRailPageItems(
  existing: readonly RailCommentEntry[],
  incoming: readonly RailCommentEntry[],
): RailCommentEntry[] {
  const byId = new Map<string, RailCommentEntry>();
  for (const entry of incoming) {
    if (entry.id === "") continue;
    byId.set(entry.id, entry);
  }
  const known = new Set<string>(existing.map((entry) => entry.id));
  const merged: RailCommentEntry[] = [];
  for (const entry of existing) {
    const replacement = byId.get(entry.id);
    merged.push(replacement === undefined ? entry : replacement);
  }
  // A floor the reader has not seen yet goes above the list, which is where the
  // site puts a newly written floor.
  const fresh: RailCommentEntry[] = [];
  for (const entry of incoming) {
    if (entry.id === "" || known.has(entry.id)) continue;
    known.add(entry.id);
    fresh.push(entry);
  }
  return fresh.concat(merged);
}

export function countRailThreadNodes(nodes: readonly RailCommentThreadNode[]): number {
  let total = 0;
  for (const node of nodes) {
    total += 1 + countRailThreadNodes(node.children);
  }
  return total;
}

export const RAIL_PENDING_ID_PREFIX = "pending-";

export interface RailPendingReplyInput {
  parentId: string;
  rootId: string;
  text: string;
  userId: string;
  createAt: number;
  /** Falls back to a local placeholder when the create call returned no id. */
  commentId?: string;
  sequence: number;
}

/**
 * The create endpoint can take a while to show up in the tree, so the reply is
 * drawn from what the reader typed until the server echoes it back.
 */
export function createRailPendingReply(input: RailPendingReplyInput): RailComment {
  const text = input.text.trim();
  const id = typeof input.commentId === "string" && input.commentId !== ""
    ? input.commentId
    : RAIL_PENDING_ID_PREFIX + input.sequence;
  return {
    id: id,
    userId: input.userId,
    name: "我",
    replyName: "",
    avatar: "",
    text: text,
    body: [{ type: "text", text: text }],
    createAt: input.createAt,
    likes: 0,
    replies: 0,
    rootId: input.rootId,
    parentId: input.parentId,
    isCy: false,
  };
}

/** Attaches not-yet-synced replies to the floor they were posted under. */
export function attachRailPendingReplies(
  entry: RailCommentEntry,
  pending: readonly RailComment[],
): RailCommentEntry {
  if (pending.length === 0) return entry;
  const subComments = entry.subComments.concat(pending);
  return { ...entry, subComments: subComments, quotes: subComments };
}

/** The tree endpoint can put the author being answered in front of the text. */
const RAIL_ECHO_MENTION = /^(?:回复\s*)?@[^\s@:：,，]{1,32}[\s:：,，]+/;

function stripRailEchoMentions(value: string): string {
  let text = value;
  for (let guard = 0; guard < 4; guard += 1) {
    const next = text.replace(RAIL_ECHO_MENTION, "");
    if (next === text) return text;
    text = next;
  }
  return text;
}

/** Drops markup and emoji tokens so two renderings of one text compare equal. */
function flattenRailMatchText(value: string): string {
  return value
    .replace(/\[cube_[^\]]{1,64}\]/g, " ")
    .replace(/\[[^\]]{1,64}\]/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The echoed text may keep the mention the site shows in its own comment list,
 * so a prefix made of mentions is ignored before the comparison.
 */
function railEchoTextMatches(pendingText: string, echoText: string): boolean {
  const wanted = flattenRailMatchText(pendingText);
  if (wanted === "") return false;
  return stripRailEchoMentions(flattenRailMatchText(echoText)) === wanted;
}

/** Every comment id the loaded floors carry, used as the pre-write baseline. */
export function collectRailCommentIds(items: readonly RailCommentEntry[]): Set<string> {
  const ids = new Set<string>();
  for (const entry of items) {
    if (entry.id !== "") ids.add(entry.id);
    for (const node of collectRailEchoedNodes(entry)) ids.add(node.id);
  }
  return ids;
}

function collectRailEchoedNodes(entry: RailCommentEntry): RailCommentThreadNode[] {
  const nodes: RailCommentThreadNode[] = [];
  const collect = (branch: readonly RailCommentThreadNode[]): void => {
    for (const node of branch) {
      if (node.id !== "" && !node.id.startsWith(RAIL_PENDING_ID_PREFIX)) nodes.push(node);
      collect(node.children);
    }
  };
  collect(buildRailCommentTree(entry));
  return nodes;
}

/**
 * Resolves the server row that already carries a pending reply. The id the
 * create call reported is tried first, then the text written by the same
 * account. When neither matches, a comment id that was not in the floor before
 * the write is the echo: the create call and the tree endpoint do not always
 * share an id space, and the echoed text can be rewritten by the site.
 * The parent id is not part of the match: the tree endpoint sometimes omits it
 * for a nested reply, and a local row must never outlive the real one.
 */
function findRailPendingEcho(
  nodes: readonly RailCommentThreadNode[],
  pending: RailComment,
  claimedIds: ReadonlySet<string>,
  freshIds?: ReadonlySet<string>,
): RailCommentThreadNode | null {
  // Claims are tracked by id, because each call rebuilds the tree and the node
  // objects are new every time.
  const free = nodes.filter((node) => !claimedIds.has(node.id));
  const sameAuthor = (node: RailCommentThreadNode): boolean =>
    pending.userId === "" || node.userId === "" || node.userId === pending.userId;
  if (pending.id !== "" && !pending.id.startsWith(RAIL_PENDING_ID_PREFIX)) {
    const byId = free.find((node) => node.id === pending.id);
    if (byId !== undefined) return byId;
  }
  if (flattenRailMatchText(pending.text) === "") return null;
  const byText = free.find((node) => sameAuthor(node) && railEchoTextMatches(pending.text, node.text));
  if (byText !== undefined) return byText;
  if (freshIds === undefined) return null;
  // The create call and the tree endpoint do not always share an id space, so
  // an id that appeared under this floor after the write is the echo. Only the
  // signed-in account counts here, otherwise a reply written by someone else at
  // the same moment would be mistaken for the local row.
  if (pending.userId === "") return null;
  const fresh = free.filter((node) => node.userId === pending.userId && freshIds.has(node.id));
  if (fresh.length === 1) return fresh[0];
  const freshWithText = fresh.filter((node) => railEchoTextMatches(pending.text, node.text));
  return freshWithText.length === 1 ? freshWithText[0] : null;
}

/**
 * The ids this floor gained since the baseline was taken. The diff is scoped to
 * the floor that owns the reply, so an unrelated comment loaded from another
 * floor can never stand in for the echo.
 */
function readRailFreshIds(
  items: readonly RailCommentEntry[],
  entry: RailCommentEntry,
  pending: RailComment,
  knownIds: ReadonlySet<string>,
): ReadonlySet<string> | undefined {
  // The root id names the floor, unless it is one the loaded list does not
  // carry; the answered comment still leads back to the floor that owns it.
  const rootLoaded = pending.rootId !== "" && items.some((item) => item.id === pending.rootId);
  const owns = rootLoaded
    ? entry.id === pending.rootId
    : findRailFloorIdForComment(items, pending.parentId) === entry.id;
  if (!owns) return undefined;
  return new Set(collectRailEchoedNodes(entry).map((node) => node.id).filter((id) => !knownIds.has(id)));
}

/** True when the server already returned this pending reply. */
export function railThreadHasPendingReply(
  entry: RailCommentEntry,
  pending: RailComment,
  knownIds?: ReadonlySet<string>,
): boolean {
  const freshIds = knownIds === undefined ? undefined : readRailFreshIds([entry], entry, pending, knownIds);
  return findRailPendingEcho(collectRailEchoedNodes(entry), pending, new Set<string>(), freshIds) !== null;
}

/**
 * True when any loaded floor already carries this pending reply. Every floor is
 * searched because the echo can arrive under a different one than the floor
 * that owned the reply before the write.
 */
export function railItemsHavePendingReply(
  items: readonly RailCommentEntry[],
  pending: RailComment,
  knownIds?: ReadonlySet<string>,
): boolean {
  return items.some((entry) => railThreadHasPendingReply(entry, pending, knownIds));
}

/**
 * Drops the pending replies the site has already echoed back and keeps the ones
 * it has not. Matches are claimed one by one, so writing the same text twice
 * does not make the second local row disappear before its real row arrives.
 */
export function pruneRailPendingReplies(
  items: readonly RailCommentEntry[],
  pending: readonly RailComment[],
  /** Baseline ids captured before each row was written, used for the id diff. */
  baselineFor?: (row: RailComment) => ReadonlySet<string> | undefined,
): RailComment[] {
  if (pending.length === 0) return [];
  const claimedIds = new Set<string>();
  const kept: RailComment[] = [];
  for (const row of pending) {
    const baseline = baselineFor?.(row);
    let match: RailCommentThreadNode | null = null;
    for (const entry of items) {
      const freshIds = baseline === undefined ? undefined : readRailFreshIds(items, entry, row, baseline);
      match = findRailPendingEcho(collectRailEchoedNodes(entry), row, claimedIds, freshIds);
      if (match !== null) break;
    }
    if (match === null) {
      kept.push(row);
      continue;
    }
    claimedIds.add(match.id);
  }
  return kept;
}

export let lastRailRequestAt = 0;

export const RAIL_PAGE_CACHE_TTL_MS = 2 * 60 * 1000;

/** Page one drives both the counts and the panel, so it must stay recent. */
export const RAIL_PAGE_CACHE_FRESH_MS = 15 * 1000;

/** A write makes cached pages unreliable for a moment. */
export const RAIL_PAGE_CACHE_HOLDOFF_MS = 10 * 1000;

export const RAIL_PAGE_CACHE_MAX = 24;

export const railPageCache: Map<string, { savedAt: number; data: RailPage }> = new Map();

export const railPageCacheHoldoff: Map<string, number> = new Map();

/**
 * The tree endpoint can answer with the pre-write payload right after a create
 * or a delete, so that stale answer must neither be served nor cached.
 */
export function holdRailPageCache(linkId: string, holdoffMs: number = RAIL_PAGE_CACHE_HOLDOFF_MS): void {
  clearRailPageCache(linkId);
  if (linkId === "") return;
  railPageCacheHoldoff.set(linkId, Date.now() + Math.max(0, holdoffMs));
}

export function isRailPageCacheHeld(linkId: string): boolean {
  const until = railPageCacheHoldoff.get(linkId);
  if (until === undefined) return false;
  if (Date.now() < until) return true;
  railPageCacheHoldoff.delete(linkId);
  return false;
}

export function readRailPageCache(
  linkId: string,
  page: number,
  accountId = "",
  maxAgeMs: number = RAIL_PAGE_CACHE_TTL_MS,
): RailPage | null {
  if (isRailPageCacheHeld(linkId)) return null;
  const key = linkId + ":" + accountId + ":" + page;
  const cached = railPageCache.get(key);
  if (cached === undefined) return null;
  const limitMs = Number.isFinite(maxAgeMs) ? Math.min(Math.max(0, maxAgeMs), RAIL_PAGE_CACHE_TTL_MS) : RAIL_PAGE_CACHE_TTL_MS;
  if (Date.now() - cached.savedAt > limitMs) {
    railPageCache.delete(key);
    return null;
  }
  railPageCache.delete(key);
  railPageCache.set(key, cached);
  return {
    items: cached.data.items,
    total: cached.data.total,
    floorTotal: cached.data.floorTotal,
    title: cached.data.title,
    link: { ...cached.data.link },
    groups: cached.data.groups,
  };
}

export function writeRailPageCache(linkId: string, page: number, accountId: string, data: RailPage): void {
  if (isRailPageCacheHeld(linkId)) return;
  const key = linkId + ":" + accountId + ":" + page;
  railPageCache.delete(key);
  railPageCache.set(key, { savedAt: Date.now(), data: data });
  while (railPageCache.size > RAIL_PAGE_CACHE_MAX) {
    const oldest = railPageCache.keys().next().value;
    if (oldest === undefined) break;
    railPageCache.delete(oldest);
  }
}

export function clearRailPageCache(linkId: string): void {
  const prefix = linkId + ":";
  for (const key of railPageCache.keys()) {
    if (key.startsWith(prefix)) railPageCache.delete(key);
  }
}

function describeRequestError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message !== "" ? error.message : fallback;
}

// The original read payload.msg/payload.status straight from the JSON body.
function readRailErrorMessage(record: Record<string, unknown>): string {
  const msg = record["msg"];
  if (typeof msg === "string" && msg !== "") return msg;
  return "接口返回 " + String(record["status"]);
}

export function countCyInGroups(groups: unknown): number {
  let total = 0;
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (!node || typeof node !== "object") return;
    if (isCyComment(node)) total += 1;
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") visit(value);
    }
  };
  visit(groups);
  return total;
}

export function readCyCount(link: Record<string, unknown>, groups: unknown): number {
  const candidates = [link["cy_num"], link["cy_count"], link["cy_total"]];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === "") continue;
    const value = Number(candidate);
    if (Number.isFinite(value) && value >= 0) return Math.floor(value);
  }
  return countCyInGroups(groups);
}

export async function fetchRailPage(
  linkId: string,
  page: number,
  options: RailPageOptions = {},
): Promise<RailPage> {
  const accountId = typeof options.accountId === "string" ? options.accountId : getHeyboxId();
  const maxAgeMs = typeof options.maxAgeMs === "number" ? options.maxAgeMs : RAIL_PAGE_CACHE_TTL_MS;
  const cached = options.bypassCache === true ? null : readRailPageCache(linkId, page, accountId, maxAgeMs);
  if (cached !== null) return cached;
  const signal = options.signal;
  const wait = Math.max(0, 700 - (Date.now() - lastRailRequestAt));
  await waitForDelay(wait, signal);
  lastRailRequestAt = Date.now();
  const request = async (signed: boolean): Promise<Record<string, unknown>> => {
    const init: RequestInit = {
      credentials: "include",
      cache: "no-store",
      headers: { accept: "application/json" },
    };
    if (signal !== undefined && signal !== null) init.signal = signal;
    const response = await fetchWithTimeout(buildLinkCommentUrl(linkId, page, signed, accountId), init);
    if (!response.ok) throw new Error("接口返回 HTTP " + response.status);
    const payload: unknown = await response.json();
    const record = asRecord(payload);
    if (record === null) throw new Error("接口返回 undefined");
    if (record["status"] !== "ok") throw new Error(readRailErrorMessage(record));
    return record;
  };
  let data: Record<string, unknown>;
  try {
    data = await request(true);
  } catch (primaryError) {
    if (isAbortError(primaryError)) throw primaryError;
    try {
      data = await request(false);
    } catch (fallbackError) {
      if (isAbortError(fallbackError)) throw fallbackError;
      throw new Error(describeRequestError(primaryError, "签名请求失败") + " / 匿名请求：" + describeRequestError(fallbackError, "失败"));
    }
  }
  const result = asRecord(data["result"]) ?? {};
  const rawGroups = result["comments"];
  const rawComment = result["comment"];
  const groups: unknown[] = Array.isArray(rawGroups) ? rawGroups : Array.isArray(rawComment) ? rawComment : [];
  const link = asRecord(result["link"]) ?? {};
  const normalized = {
    items: groups.map(normalizeRailGroup).filter((item) => item !== null),
    total: Number(link["comment_num"] || result["total_floor_num"]) || 0,
    floorTotal: readRailFloorTotal(result),
    title: typeof link["title"] === "string" ? link["title"].trim() : "",
    link: {
      isAward: Number(link["is_award_link"]) === 1,
      isFavour: Number(link["is_favour"]) === 1,
      awardCount: Number(link["link_award_num"]) || 0,
      favourCount: Number(link["favour_count"]) || 0,
      commentCount: Number(link["comment_num"] || result["total_floor_num"]) || 0,
      cyCount: readCyCount(link, groups),
    },
    groups,
  } satisfies RailPage;
  writeRailPageCache(linkId, page, accountId, normalized);
  return { ...normalized, link: { ...normalized.link } };
}

export function formatRailAge(value: number): string {
  const seconds = Math.floor(Date.now() / 1000) - Number(value || 0);
  if (!Number.isFinite(seconds) || seconds < 60) return "刚刚";
  if (seconds < 3600) return Math.floor(seconds / 60) + " 分钟前";
  if (seconds < 86400) return Math.floor(seconds / 3600) + " 小时前";
  if (seconds < 86400 * 30) return Math.floor(seconds / 86400) + " 天前";
  return formatTime(value).slice(0, 10);
}

export function createCommentRail() {
  const host = document.createElement("div");
  host.id = RAIL_ID;
  host.dataset["state"] = "hidden";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = RAIL_CSS;

  const panel = document.createElement("div");
  panel.className = "panel";
  let loadController: AbortController | null = null;

  const tab = document.createElement("button");
  tab.type = "button";
  tab.className = "tab";
  tab.setAttribute("aria-label", "展开评论预览");
  tab.setAttribute("aria-expanded", "false");
  tab.innerHTML = RAIL_ICONS.comment + "<span>评论预览</span>";

  const dock = document.createElement("div");
  dock.className = "dock";

  const head = document.createElement("div");
  head.className = "head";
  const headText = document.createElement("div");
  headText.className = "head-text";
  const kicker = document.createElement("div");
  kicker.className = "kicker";
  kicker.textContent = "评论预览";
  const titleNode = document.createElement("div");
  titleNode.className = "title";
  titleNode.textContent = "评论";
  headText.append(kicker, titleNode);
  const tools = document.createElement("div");
  tools.className = "tools";
  const cyButton = document.createElement("button");
  cyButton.type = "button";
  cyButton.className = "icon cy";
  cyButton.textContent = "CY";
  const openLinkNode = document.createElement("a");
  openLinkNode.className = "icon";
  openLinkNode.target = "_blank";
  openLinkNode.rel = "noopener noreferrer";
  openLinkNode.title = "打开帖子";
  openLinkNode.setAttribute("aria-label", "打开帖子");
  openLinkNode.innerHTML = RAIL_ICONS.external;
  const collapseButton = document.createElement("button");
  collapseButton.type = "button";
  collapseButton.className = "icon";
  collapseButton.title = "收起";
  collapseButton.setAttribute("aria-label", "收起评论预览");
  collapseButton.innerHTML = RAIL_ICONS.collapse;
  tools.append(cyButton, openLinkNode, collapseButton);
  head.append(headText, tools);

  const meta = document.createElement("div");
  meta.className = "meta";
  const list = document.createElement("ol");
  list.className = "list";
  const status = document.createElement("div");
  status.className = "status";
  const footBar = document.createElement("div");
  footBar.className = "foot-bar";
  const moreButton = document.createElement("button");
  moreButton.type = "button";
  moreButton.className = "action";
  moreButton.textContent = "加载更多";
  footBar.append(moreButton);

  dock.append(head, meta, list, status, footBar);
  panel.append(tab, dock);
  shadow.append(style, panel);

  const state: {
    mode: "hidden" | "collapsed" | "open";
    linkId: string;
    title: string;
    total: number;
    page: number;
    items: RailCommentEntry[];
    loading: boolean;
    error: string;
    hasMore: boolean;
    loadedGroups: number;
    seq: number;
  } = {
    mode: "hidden",
    linkId: "",
    title: "",
    total: 0,
    page: 0,
    items: [],
    loading: false,
    error: "",
    hasMore: false,
    loadedGroups: 0,
    seq: 0,
  };

  let hideCy = readHideCyPreference();

  const updateCyButton = (): void => {
    cyButton.setAttribute("aria-pressed", String(hideCy));
    cyButton.title = hideCy ? "显示 CY 评论" : "屏蔽 CY 评论";
    cyButton.setAttribute("aria-label", cyButton.title);
  };

  cyButton.addEventListener("click", () => {
    hideCy = !hideCy;
    setHideCyPreference(hideCy);
    updateCyButton();
    render();
  });

  document.addEventListener(HIDE_CY_EVENT, () => {
    const next = readHideCyPreference();
    if (next === hideCy) return;
    hideCy = next;
    updateCyButton();
    render();
  });

  const applyMode = (): void => {
    host.dataset["state"] = state.mode;
    tab.setAttribute("aria-expanded", String(state.mode === "open"));
    if (document.body) document.body.classList.toggle("heybox-up-rail-open", state.mode === "open");
  };

  const createEmoji = (id: string): HTMLSpanElement => {
    const node = document.createElement("span");
    node.className = "emoji";
    node.setAttribute("role", "img");
    node.setAttribute("aria-label", "表情");
    // The tens digit is the sprite row and the ones digit the column. Negative
    // offsets clip the cell; the site wraps positive offsets with background-repeat.
    const column = (Number(id) % 10) - 1;
    const row = Math.floor(Number(id) / 10) - 1;
    node.style.backgroundImage = 'url("' + RAIL_EMOJI_SPRITE + '")';
    node.style.backgroundPosition = "-" + column * RAIL_EMOJI_CELL + "px -" + row * RAIL_EMOJI_CELL + "px";
    return node;
  };

  const createImage = (src: string): HTMLImageElement => {
    const node = document.createElement("img");
    node.className = "pic";
    node.alt = "";
    node.loading = "lazy";
    node.referrerPolicy = "no-referrer";
    node.src = src;
    return node;
  };

  const fillBody = (node: HTMLElement, segments: readonly RailSegment[]): void => {
    if (segments.length === 0) {
      node.textContent = "（图片或表情评论）";
      return;
    }
    for (const segment of segments) {
      if (segment.type === "text") node.append(document.createTextNode(segment.text));
      else if (segment.type === "emoji") node.append(createEmoji(segment.id));
      else node.append(createImage(segment.src));
    }
  };

  const createQuote = (quote: RailComment): HTMLDivElement => {
    const node = document.createElement("div");
    node.className = "quote";
    const name = document.createElement("span");
    name.className = "quote-name";
    name.textContent = quote.name + "：";
    node.append(name);
    fillBody(node, quote.body);
    return node;
  };

  const createItem = (comment: RailCommentEntry): HTMLLIElement => {
    const item = document.createElement("li");
    item.className = "item";
    item.setAttribute("role", "listitem");
    const avatar = document.createElement("img");
    avatar.className = "avatar";
    avatar.alt = "";
    avatar.loading = "lazy";
    avatar.referrerPolicy = "no-referrer";
    if (comment.avatar !== "") avatar.src = comment.avatar;
    const body = document.createElement("div");
    body.className = "body";
    const who = document.createElement("div");
    who.className = "who";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = comment.name;
    who.append(name);
    if (comment.createAt > 0) {
      const time = document.createElement("span");
      time.className = "time";
      time.textContent = formatRailAge(comment.createAt);
      who.append(time);
    }
    const text = document.createElement("p");
    text.className = "text";
    fillBody(text, comment.body);
    const foot = document.createElement("div");
    foot.className = "foot";
    if (comment.likes > 0) {
      const likes = document.createElement("span");
      likes.className = "likes";
      likes.textContent = "赞 " + comment.likes;
      foot.append(likes);
    }
    if (comment.replies > 0) {
      const replies = document.createElement("span");
      replies.className = "replies";
      replies.textContent = comment.replies + " 条回复";
      foot.append(replies);
    }
    body.append(who, text);
    if (foot.childElementCount > 0) body.append(foot);
    const quotes = hideCy ? comment.quotes.filter((quote) => quote.isCy !== true) : comment.quotes;
    if (quotes.length > 0) {
      const sub = document.createElement("div");
      sub.className = "sub";
      sub.append(...quotes.map(createQuote));
      body.append(sub);
    }
    item.append(avatar, body);
    return item;
  };

  const render = (): void => {
    const visible = hideCy ? state.items.filter((item) => item.isCy !== true) : state.items;
    const hiddenCy = state.items.length - visible.length;
    titleNode.textContent = state.title !== "" ? state.title : "评论";
    openLinkNode.href = state.linkId !== "" ? LINK_HREF_PREFIX + state.linkId : "#";
    openLinkNode.hidden = state.linkId === "";
    const loadedText = visible.length > 0 ? " · 已加载 " + visible.length + " 条" : "";
    const cyText = hiddenCy > 0 ? " · 已屏蔽 " + hiddenCy + " 条 CY" : "";
    if (state.error !== "") {
      meta.textContent = "";
    } else if (state.total > 0) {
      meta.textContent = "共 " + state.total + " 条评论" + loadedText + cyText;
    } else {
      meta.textContent = (visible.length > 0 ? "已加载 " + visible.length + " 条" : "") + cyText;
    }
    list.replaceChildren(...visible.map(createItem));
    list.hidden = visible.length === 0;
    if (state.error !== "") {
      status.textContent = "";
      const label = document.createElement("span");
      label.textContent = state.error + " ";
      const link = document.createElement("a");
      link.href = LINK_HREF_PREFIX + state.linkId;
      link.textContent = "打开帖子";
      link.addEventListener("click", (event) => event.stopPropagation());
      status.append(label, link);
      status.classList.add("retry");
      status.hidden = false;
    } else if (state.loading && state.items.length === 0) {
      status.classList.remove("retry");
      status.textContent = "正在加载评论…";
      status.hidden = false;
    } else if (state.linkId === "") {
      status.classList.remove("retry");
      status.textContent = "这里会直接显示信息流首条帖子的评论；点其他帖子的评论数字可切换。";
      status.hidden = false;
    } else if (visible.length === 0) {
      status.classList.remove("retry");
      status.textContent = hiddenCy > 0 ? "已屏蔽全部 " + hiddenCy + " 条 CY 评论" : "这条帖子还没有评论";
      status.hidden = false;
    } else {
      status.classList.remove("retry");
      status.hidden = true;
    }
    moreButton.hidden = state.linkId === "" || !state.hasMore;
    moreButton.textContent = state.loading ? "加载中…" : "加载更多";
    footBar.hidden = moreButton.hidden;
  };

  const load = async (page: number): Promise<void> => {
    const seq = ++state.seq;
    state.loading = true;
    state.error = "";
    render();
    loadController?.abort();
    loadController = new AbortController();
    try {
      const data = await fetchRailPage(state.linkId, page, { signal: loadController.signal });
      if (seq !== state.seq) return;
      const seen = new Set(state.items.map((item) => item.id));
      const fresh = data.items.filter((item) => item.id === "" || !seen.has(item.id));
      state.items = page === 1 ? fresh : state.items.concat(fresh);
      state.page = page;
      const progress = resolveCommentPageProgress({
        rawGroupCount: data.items.length,
        freshGroupCount: fresh.length,
        previouslyLoadedGroups: page === 1 ? 0 : state.loadedGroups,
        floorTotal: data.floorTotal,
      });
      state.loadedGroups = progress.loadedGroups;
      state.hasMore = progress.hasMore;
      if (data.total > 0) state.total = data.total;
      if (data.title !== "" && state.title === "") state.title = data.title;
    } catch (error) {
      if (isAbortError(error)) return;
      if (seq !== state.seq) return;
      const message = error instanceof Error && error.message ? error.message : "未知错误";
      state.error = /show_captcha|captcha/i.test(message)
        ? "评论需要验证，请稍后重试，或打开帖子查看。"
        : "评论加载失败：" + message + "，可打开帖子查看。";
      state.hasMore = false;
    } finally {
      if (seq === state.seq) {
        state.loading = false;
        loadController = null;
        render();
      }
    }
  };

  const open = (linkId: unknown): void => {
    const next = String(linkId === undefined || linkId === null ? "" : linkId);
    if (next === "") return;
    state.mode = "open";
    applyMode();
    if (next === state.linkId) return;
    loadController?.abort();
    loadController = null;
    state.seq += 1;
    state.loading = false;
    state.linkId = next;
    state.title = "";
    state.total = 0;
    state.page = 0;
    state.items = [];
    state.hasMore = false;
    state.loadedGroups = 0;
    state.error = "";
    render();
    void load(1);
  };

  const collapse = (): void => {
    state.mode = state.linkId === "" ? "hidden" : "collapsed";
    applyMode();
  };

  const setActive = (active: boolean): void => {
    if (!active) {
      if (state.mode === "hidden" && !state.loading && loadController === null) return;
      loadController?.abort();
      loadController = null;
      state.seq += 1;
      state.loading = false;
      state.mode = "hidden";
      applyMode();
      return;
    }
    if (state.mode !== "hidden") return;
    state.mode = "collapsed";
    applyMode();
  };

  tab.addEventListener("click", () => {
    state.mode = "open";
    applyMode();
    if (state.linkId === "") {
      const anchor = document.querySelector("#page-bbs-community .bbs-home__content-list a[href*='/app/bbs/link/']");
      const match = anchor ? /link\/(\d+)/.exec(anchor.getAttribute("href") || "") : null;
      if (match) {
        open(match[1]);
        return;
      }
    }
    render();
  });
  collapseButton.addEventListener("click", collapse);
  status.addEventListener("click", () => {
    if (state.error === "" || state.loading) return;
    void load(1);
  });
  moreButton.addEventListener("click", () => {
    if (state.loading || state.linkId === "") return;
    void load(state.page + 1);
  });

  updateCyButton();
  applyMode();
  render();

  return {
    host,
    open,
    collapse,
    setActive,
    isOpen: () => state.mode === "open",
    getLinkId: () => state.linkId,
  };
}

export function watchCommentRail() {
  if (!document.body) return;
  const rail = createCommentRail();
  document.body.append(rail.host);

  const isFeedPage = () => readPageRoute() === PAGE_ROUTE.FEED
    && document.querySelector("#page-bbs-community .bbs-home__content-list") !== null;

  const readLinkId = (href: string | null): string => {
    const match = /link\/(\d+)/.exec(href || "");
    return match ? match[1] : "";
  };

  const readFirstFeedLinkId = (): string => {
    const anchor = document.querySelector("#page-bbs-community .bbs-home__content-list a[href*='/app/bbs/link/']");
    if (!anchor) return "";
    return readLinkId(anchor.getAttribute("href"));
  };

  // Card templates for video and galleries do not always nest the comment
  // button inside the post anchor, so fall back to the containing card.
  const readCardLinkId = (element: Element): string => {
    const anchor = element.closest('a[href*="/app/bbs/link/"]');
    if (anchor) return readLinkId(anchor.getAttribute("href"));
    const card = element.closest(".bbs-home__content-item, .content-list__item, li");
    if (!card) return "";
    const inner = card.querySelector('a[href*="/app/bbs/link/"]');
    return inner ? readLinkId(inner.getAttribute("href")) : "";
  };

  const isEnabled = (): boolean => readCommentPreviewPreference();

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const trigger = target.closest(RAIL_TRIGGER_SELECTOR);
    if (!trigger) return;
    const linkId = readCardLinkId(trigger);
    if (linkId === "") return;
    if (!isEnabled()) return;
    if (!isFeedPage()) return;
    event.preventDefault();
    event.stopPropagation();
    rail.open(linkId);
  }, true);

  // While the panel is open, hovering a feed card switches the preview, so the
  // comment counter does not have to be clicked exactly.
  let hoverTimer = 0;
  let hoverId = "";
  const cancelHover = (): void => {
    if (hoverTimer !== 0) window.clearTimeout(hoverTimer);
    hoverTimer = 0;
    hoverId = "";
  };
  document.addEventListener("pointerover", (event) => {
    if (!isEnabled() || !rail.isOpen()) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const card = target.closest("#page-bbs-community .bbs-home__content-item");
    if (!card) return;
    const linkId = readCardLinkId(card);
    if (linkId === "" || linkId === hoverId) return;
    cancelHover();
    hoverId = linkId;
    hoverTimer = window.setTimeout(() => {
      hoverTimer = 0;
      if (!rail.isOpen() || rail.getLinkId() === linkId) return;
      rail.open(linkId);
    }, 600);
  }, true);
  document.addEventListener("pointerout", (event) => {
    if (hoverTimer === 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const card = target.closest("#page-bbs-community .bbs-home__content-item");
    if (!card) return;
    const related = event.relatedTarget;
    if (related instanceof Node && card.contains(related)) return;
    cancelHover();
  }, true);
  document.addEventListener("pointerdown", cancelHover, true);
  document.addEventListener("scroll", cancelHover, true);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !rail.isOpen()) return;
    event.preventDefault();
    rail.collapse();
  });

  let autoOpened = false;
  const sync = (): void => {
    if (!isEnabled()) {
      autoOpened = false;
      rail.setActive(false);
      rail.host.remove();
      return;
    }
    const active = isFeedPage();
    rail.setActive(active);
    if (!active) {
      autoOpened = false;
      rail.host.remove();
      return;
    }
    if (rail.host.parentNode !== document.body) document.body.append(rail.host);
    // 开启预览后，进入首页直接带出首条帖子的评论，不必先点评论数字。
    if (!autoOpened && !rail.isOpen()) {
      const linkId = readFirstFeedLinkId();
      if (linkId !== "") {
        autoOpened = true;
        rail.open(linkId);
      }
    }
  };
  document.addEventListener(COMMENT_PREVIEW_EVENT, sync);
  registerPageSync(sync, 200, [PAGE_ROUTE.FEED], "feed");
  sync();
}
