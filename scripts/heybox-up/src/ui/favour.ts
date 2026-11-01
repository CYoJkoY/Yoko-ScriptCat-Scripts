import { PAGE_ROUTE } from "../config";
import { resolveHeyboxId } from "../core/account";
import { createCard, loadCyFavorites, readCache, writeCache, type CyItem } from "../core/cy";
import { readPageRoute, registerPageSync } from "../core/page-sync";
import { isAbortError } from "../core/request";
import { asRecord } from "../core/json";
import { CY_HASH, scrollToCySection } from "./navigation";

export const FAVOUR_HOST_ID = "heybox-up-favour";

export const LOGIN_RETRY_DELAY_MS = 1500;

export const LOGIN_RETRY_MAX = 3;

export const FAVOUR_LIST_SELECTOR = ".user-favour__list";

export interface FavourSectionState {
  items: CyItem[];
  loading: boolean;
  error: string;
  notice: string;
  progress: number;
  query: string;
}

export interface FavourSection {
  readonly host: HTMLDivElement;
  readonly place: () => void;
  readonly dispose: () => void;
}

export const FAVOUR_CSS = `
  :host { display: block; scroll-margin-top: 80px; font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; }
  .section { padding: 14px 8px 4px; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
  .heading { font-size: 14px; font-weight: 700; }
  .refresh, .retry {
    font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 8px;
    border: 1px solid rgba(127,127,127,.32); background: transparent; color: inherit; cursor: pointer;
  }
  .refresh:hover:not(:disabled), .retry:hover { border-color: rgba(127,127,127,.55); }
  .refresh:disabled { opacity: .5; cursor: default; }
  .retry { margin: -2px 0 10px; }
  .note { font-size: 12px; opacity: .62; margin-bottom: 10px; }
  .search {
    width: 100%; box-sizing: border-box; margin-bottom: 10px; padding: 7px 10px;
    border-radius: 8px; border: 1px solid rgba(127,127,127,.28);
    background: rgba(127,127,127,.08); color: inherit; font: inherit; font-size: 13px;
  }
  .search:focus { outline: none; border-color: #6f8db3; }
  .card {
    display: flex; gap: 10px; padding: 10px; margin-bottom: 8px;
    border-radius: 12px; text-decoration: none; color: inherit;
    border: 1px solid rgba(127,127,127,.22);
  }
  .card:hover { border-color: rgba(127,127,127,.45); }
  .thumb { width: 52px; height: 52px; border-radius: 9px; object-fit: cover; flex: none; background: rgba(127,127,127,.16); }
  .body { min-width: 0; flex: 1; }
  .card-title {
    font-weight: 600; font-size: 13px; margin-bottom: 3px;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .card-text {
    display: flex; gap: 6px; align-items: flex-start; margin-bottom: 6px;
    font-size: 14px; line-height: 1.5; color: inherit;
  }
  .card-text-icon { width: 15px; height: 15px; flex: none; margin-top: 2px; color: #6f8db3; }
  .card-text-body { min-width: 0; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .card-text.is-empty { font-size: 12px; opacity: .55; }
  .card-foot { margin-top: 5px; font-size: 11px; opacity: .6; display: flex; gap: 10px; }
`;

export function createFavourSection(): FavourSection {
  const host = document.createElement("div");
  host.id = FAVOUR_HOST_ID;
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = FAVOUR_CSS;
  shadow.append(style);

  const section = document.createElement("section");
  section.className = "section";
  const head = document.createElement("div");
  head.className = "head";
  const heading = document.createElement("div");
  heading.className = "heading";
  heading.textContent = "插眼收藏";
  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.className = "refresh";
  refresh.textContent = "刷新";
  refresh.setAttribute("aria-label", "刷新插眼收藏");
  head.append(heading, refresh);
  const note = document.createElement("div");
  note.className = "note";
  note.textContent = "正在读取插眼收藏…";
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "retry";
  retry.textContent = "重试";
  retry.hidden = true;
  const search = document.createElement("input");
  search.type = "search";
  search.className = "search";
  search.placeholder = "搜索标题或插眼内容";
  search.setAttribute("aria-label", "搜索插眼收藏");
  search.hidden = true;
  const list = document.createElement("div");
  list.className = "list";
  section.append(head, note, retry, search, list);
  shadow.append(section);

  const state: FavourSectionState = { items: [], loading: false, error: "", notice: "", progress: 0, query: "" };
  let loadController: AbortController | null = null;
  let loginRetryTimer = 0;
  let loginRetryLeft = 0;
  let disposed = false;

  const render = (): void => {
    const query = state.query.trim();
    const needle = query.toLowerCase();
    const matched = needle === ""
      ? state.items
      : state.items.filter((item) => item.title.toLowerCase().includes(needle) || item.text.toLowerCase().includes(needle));
    list.replaceChildren();
    refresh.disabled = state.loading;
    refresh.textContent = state.loading ? "读取中…" : "刷新";
    retry.hidden = state.error === "";
    search.hidden = state.items.length === 0;
    if (state.error !== "") {
      note.textContent = "读取失败：" + state.error + (state.items.length > 0 ? "（显示上次结果）" : "");
    } else if (state.notice !== "") {
      note.textContent = state.notice;
    } else if (state.loading) {
      note.textContent = "正在读取插眼收藏…" + (state.progress > 0 ? " 已获取 " + state.progress + " 条" : "");
    } else if (state.items.length === 0) {
      note.textContent = "没有插眼收藏。";
    } else if (matched.length === 0) {
      note.textContent = "没有匹配“" + query + "”的插眼条目。";
    } else {
      note.textContent = "共 " + state.items.length + " 条插眼收藏" + (query !== "" ? "，匹配 " + matched.length + " 条" : "") + "，网页收藏列表默认不显示。";
    }
    if (matched.length === 0) return;
    const fragment = document.createDocumentFragment();
    for (const item of matched) fragment.append(createCard(item));
    list.append(fragment);
  };

  // The site sometimes paints the page skeleton before it inserts the favour
  // list. Append the block to the content area until .user-favour__list shows up,
  // then move it directly below the list so the block stays visible either way.
  const readFavourContainer = (): Element | null => {
    const page = document.querySelector("#page-user-favour");
    if (!page) return null;
    return page.querySelector(".content") ?? page;
  };

  const place = (): void => {
    const listNode = document.querySelector(FAVOUR_LIST_SELECTOR);
    if (listNode && listNode.parentElement) {
      const container = listNode.parentElement;
      if (host.parentNode !== container || host.previousElementSibling !== listNode) {
        container.insertBefore(host, listNode.nextSibling);
      }
      return;
    }
    const container = readFavourContainer();
    if (container === null) return;
    if (host.parentNode !== container || host.nextSibling !== null) container.append(host);
  };

  const load = async (force: boolean): Promise<void> => {
    if (disposed || state.loading) return;
    window.clearTimeout(loginRetryTimer);
    loginRetryTimer = 0;
    state.loading = true;
    state.error = "";
    state.notice = "";
    state.progress = 0;
    render();
    loadController?.abort();
    loadController = new AbortController();
    let loginMissing = false;
    try {
      const userId = await resolveHeyboxId(loadController.signal);
      if (userId === "") {
        loginMissing = true;
        state.notice = "未登录小黑盒，无法读取插眼收藏。";
        return;
      }
      loginRetryLeft = 0;
      const cached = force ? null : readCache(userId);
      if (cached) {
        state.items = cached;
        return;
      }
      state.items = await loadCyFavorites(userId, (count) => {
        state.progress = count;
        note.textContent = "正在读取插眼收藏… 已获取 " + count + " 条";
      }, loadController.signal);
      writeCache(userId, state.items);
    } catch (error) {
      if (isAbortError(error)) return;
      state.error = error instanceof Error ? error.message : String(error);
    } finally {
      state.loading = false;
      loadController = null;
      render();
      // The site writes the account id into the cookie only after login, which
      // can land just after the first paint. Retry a few times so a signed-in
      // reader never has to refresh by hand.
      if (loginMissing && loginRetryLeft < LOGIN_RETRY_MAX) {
        loginRetryLeft += 1;
        loginRetryTimer = window.setTimeout(() => void load(false), LOGIN_RETRY_DELAY_MS);
      }
    }
  };

  refresh.addEventListener("click", () => void load(true));
  retry.addEventListener("click", () => void load(true));
  search.addEventListener("input", () => {
    state.query = search.value;
    render();
  });

  place();
  void load(false);
  return {
    host,
    place,
    dispose: () => {
      disposed = true;
      window.clearTimeout(loginRetryTimer);
      loginRetryTimer = 0;
      loginRetryLeft = LOGIN_RETRY_MAX;
      loadController?.abort();
      loadController = null;
      state.loading = false;
    },
  };
}

export function watchFavourPage(): void {
  if (!document.body) return;
  let section: FavourSection | null = null;
  let cyJumpDone = false;

  const sync = (): void => {
    if (readPageRoute() !== PAGE_ROUTE.FAVOUR) {
      cyJumpDone = false;
      if (section) {
        section.dispose();
        section.host.remove();
        section = null;
      }
      return;
    }
    if (!section) section = createFavourSection();
    section.place();
    if (!cyJumpDone && location.hash === CY_HASH) {
      requestAnimationFrame(() => {
        if (!scrollToCySection()) return;
        cyJumpDone = true;
      });
    }
  };

  registerPageSync(sync, 300, [PAGE_ROUTE.FAVOUR], "favour");
  sync();
}

export interface FavourFolder {
  id: string;
  name: string;
}

export interface FavourChangePlan {
  addIds: string[];
  removeIds: string[];
  removeAll: boolean;
  unknownIds: string[];
}

export interface FavourPlanInput {
  favourited: boolean;
  folderIds: readonly string[];
  checkedIds: readonly string[];
  memberIds: readonly string[];
  unknownIds: readonly string[];
}

export interface FavourFolderPage {
  linkIds: string[];
  hasNext: boolean;
}

function readFavourId(value: unknown): string {
  if (value === undefined || value === null) return "";
  const text = String(value).trim();
  if (text === "" || text === "0" || text === "-1" || text === "undefined" || text === "null") return "";
  return text;
}

export function normalizeFavourFolders(records: readonly unknown[]): FavourFolder[] {
  const folders: FavourFolder[] = [];
  const seen = new Set<string>();
  for (const entry of records) {
    const record = asRecord(entry);
    if (record === null) continue;
    const id = readFavourId(record["id"] ?? record["folder_id"]);
    if (id === "" || seen.has(id)) continue;
    seen.add(id);
    const rawName = String(record["name"] ?? record["folder_name"] ?? "").trim();
    folders.push({ id: id, name: rawName === "" ? "未命名收藏夹" : rawName });
  }
  return folders;
}

export function readFavourFolderId(result: unknown): string {
  const record = asRecord(result);
  if (record === null) return "";
  const folder = asRecord(record["folder"]);
  return readFavourId(folder?.["id"] ?? folder?.["folder_id"] ?? record["folder_id"]);
}

function readFavourLinkId(entry: unknown): string {
  const record = asRecord(entry);
  if (record === null) return "";
  const link = asRecord(record["link"]);
  return readFavourId(
    link?.["linkid"]
      ?? link?.["link_id"]
      ?? link?.["id"]
      ?? record["link_id"]
      ?? record["linkid"],
  );
}

export function readFavourFolderPage(result: unknown): FavourFolderPage {
  const record = asRecord(result);
  if (record === null) return { linkIds: [], hasNext: false };
  const rawLinks = Array.isArray(record["links"]) ? record["links"] : [];
  const linkIds: string[] = [];
  for (const entry of rawLinks) {
    const id = readFavourLinkId(entry);
    if (id !== "") linkIds.push(id);
  }
  const next = record["has_next"] ?? record["has_more"];
  return {
    linkIds: linkIds,
    hasNext: next === true || next === 1 || next === "1",
  };
}

/**
 * Checked folders are joined, unchecked folders are left. A favourite in a
 * folder whose membership could not be read is never removed implicitly.
 */
export function planFavourChanges(input: FavourPlanInput): FavourChangePlan {
  const folderIds = new Set(input.folderIds);
  const checked = new Set(input.checkedIds.filter((id) => folderIds.has(id)));
  const unknown = input.unknownIds.filter((id) => folderIds.has(id));
  const unknownSet = new Set(unknown);
  // Membership of an unread folder stays untouched, so it can never become an
  // implicit removal just because its checkbox is off.
  const members = new Set(input.memberIds.filter((id) => folderIds.has(id) && !unknownSet.has(id)));
  const addIds = Array.from(checked).filter((id) => !members.has(id));
  const removeIds = Array.from(members).filter((id) => !checked.has(id));
  return {
    addIds: addIds,
    removeIds: removeIds,
    // An empty folder list means the request failed or the account has no
    // folders yet; neither is proof that clearing every checkbox should
    // unfavourite the link globally.
    removeAll: folderIds.size > 0 && input.favourited && checked.size === 0 && unknown.length === 0,
    unknownIds: unknown,
  };
}

export function planHasFavourChange(plan: FavourChangePlan): boolean {
  return plan.removeAll || plan.addIds.length > 0 || plan.removeIds.length > 0;
}

/** The link stays favourited while any folder still holds it. */
export function resolveFavourOutcome(
  favourited: boolean,
  memberIds: readonly string[],
  plan: FavourChangePlan,
): boolean {
  if (plan.removeAll) return false;
  const removed = new Set(plan.removeIds);
  const remaining = new Set<string>();
  for (const id of memberIds) {
    if (!removed.has(id)) remaining.add(id);
  }
  for (const id of plan.addIds) remaining.add(id);
  if (remaining.size > 0) return true;
  return favourited && plan.unknownIds.length > 0;
}
