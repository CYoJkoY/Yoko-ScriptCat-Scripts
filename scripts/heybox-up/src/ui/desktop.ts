import { PAGE_ROUTE } from "../config";
import { ensureStyleElement, registerPageSync } from "../core/page-sync";
import { COMMUNITY_SEARCH_ICONS } from "./community-search";
import { NAV_ICONS, navigateToPath } from "./navigation";
import { normalizeRailText } from "./rail";

export const DESKTOP_STYLE_ID = "heybox-up-desktop-style";

export const DESKTOP_LEFT_ID = "heybox-up-left-rail";

export const DESKTOP_RIGHT_ID = "heybox-up-right-rail";

export const DESKTOP_PAGE_CLASS = "heybox-up-desktop";

export const DESKTOP_HOT_TARGET_CLASS = "heybox-up-hot-target";

export const DESKTOP_HOT_LIMIT = 6;

export interface DesktopRailItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon: string;
}

export interface DesktopChannel {
  readonly name: string;
  readonly icon: string;
}

export interface DesktopHotItem {
  readonly card: Element;
  readonly index: number;
  readonly id: string;
  readonly title: string;
  readonly comment: number;
  readonly like: number;
  readonly score: number;
}

export interface DesktopLeftRail {
  readonly root: HTMLElement;
  readonly channels: HTMLElement;
}

export interface DesktopRightRail {
  readonly root: HTMLElement;
  readonly hot: HTMLElement;
}

export interface DesktopCache {
  channels: string;
  hot: string;
}

export const DESKTOP_CSS = `
  #heybox-up-left-rail, #heybox-up-right-rail { display: none; }
  #heybox-up-left-rail,
  #heybox-up-right-rail {
    position: sticky;
    /* 桌面隐藏站点顶部搜索条后，侧栏直接停在导航下方。 */
    top: 80px;
    max-height: calc(100vh - 100px);
    overflow: auto;
    font: 13px/1.55 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
    color: var(--heybox-up-text-2, #3c4249);
    scrollbar-width: thin;
  }
  #heybox-up-left-rail .rail-block,
  #heybox-up-right-rail .rail-block {
    padding: 13px 10px;
    border: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1));
    border-radius: var(--heybox-up-radius-card, 14px);
    background: var(--heybox-up-surface, #fff);
    box-shadow: var(--heybox-up-shadow-1, none);
  }
  #heybox-up-left-rail .rail-block + .rail-block,
  #heybox-up-right-rail .rail-block + .rail-block { margin-top: 12px; }
  #heybox-up-left-rail .rail-title,
  #heybox-up-right-rail .rail-title {
    margin: 0 0 7px;
    padding: 0 8px;
    color: var(--heybox-up-muted, #6b7280);
    font-size: 11px;
    font-weight: 600;
    line-height: 1.5;
    letter-spacing: .08em;
  }
  #heybox-up-left-rail .rail-link,
  #heybox-up-left-rail .rail-channel,
  #heybox-up-right-rail .rail-link {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    height: 34px;
    margin: 0;
    padding: 0 8px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--heybox-up-text-2, #3c4249);
    font: inherit;
    font-size: 13px;
    line-height: 34px;
    text-align: left;
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;
    transition: background .14s ease, color .14s ease;
  }
  #heybox-up-left-rail .rail-link:hover,
  #heybox-up-left-rail .rail-channel:hover,
  #heybox-up-right-rail .rail-link:hover {
    background: var(--heybox-up-subtle, rgba(20, 25, 30, .06));
    color: var(--heybox-up-text, #14191e);
  }
  #heybox-up-left-rail .rail-link.is-active {
    background: rgba(111, 141, 179, .13);
    color: var(--heybox-up-accent, #6f8db3);
    font-weight: 600;
  }
  #heybox-up-left-rail .rail-link svg,
  #heybox-up-right-rail .rail-link svg { width: 17px; height: 17px; flex: none; }
  #heybox-up-left-rail .rail-channel img {
    width: 22px;
    height: 22px;
    flex: none;
    border-radius: 6px;
    object-fit: cover;
    background: var(--heybox-up-subtle, rgba(20, 25, 30, .06));
  }
  #heybox-up-left-rail .rail-channel .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  #heybox-up-left-rail .channels { max-height: 288px; overflow: auto; scrollbar-width: thin; }
  #heybox-up-left-rail .rail-link:focus-visible,
  #heybox-up-left-rail .rail-channel:focus-visible,
  #heybox-up-right-rail .rail-link:focus-visible,
  #heybox-up-right-rail .hot-item:focus-visible {
    outline: 2px solid var(--heybox-up-accent, #6f8db3);
    outline-offset: -2px;
  }
  #heybox-up-right-rail .hot-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  #heybox-up-right-rail .hot-item {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    column-gap: 7px;
    width: 100%;
    margin: 0;
    padding: 8px 6px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background .14s ease;
  }
  #heybox-up-right-rail .hot-item:hover { background: var(--heybox-up-subtle, rgba(20, 25, 30, .06)); }
  #heybox-up-right-rail .hot-rank {
    color: var(--heybox-up-muted, #6b7280);
    font-size: 12px;
    font-weight: 700;
    line-height: 1.5;
    font-variant-numeric: tabular-nums;
  }
  #heybox-up-right-rail .hot-item:nth-child(-n+3) .hot-rank { color: var(--heybox-up-accent, #6f8db3); }
  #heybox-up-right-rail .hot-title {
    display: -webkit-box;
    overflow: hidden;
    color: var(--heybox-up-text-2, #3c4249);
    font-size: 13px;
    line-height: 1.45;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
  #heybox-up-right-rail .hot-item:hover .hot-title { color: var(--heybox-up-text, #14191e); }
  #heybox-up-right-rail .hot-meta {
    grid-column: 2;
    margin-top: 2px;
    color: var(--heybox-up-muted, #6b7280);
    font-size: 11px;
    line-height: 1.5;
  }
  #heybox-up-right-rail .rail-empty {
    margin: 0;
    padding: 10px 8px;
    color: var(--heybox-up-muted, #6b7280);
    font-size: 12px;
    line-height: 1.6;
  }
  #page-bbs-community .heybox-up-hot-target {
    border-color: var(--heybox-up-accent, #6f8db3) !important;
    box-shadow: 0 0 0 3px rgba(111, 141, 179, .18) !important;
  }
  @media (min-width: 1200px) {
    /* 顶部搜索条会横跨信息流、压住左栏上沿；桌面把搜索入口收进左栏“浏览”。
       站点还用固定 ::before 给搜索条铺 146px 高的遮罩；搜索条隐藏后把遮罩压到
       导航高度，既保留导航下方 16px 的顶部留白，也避免滚动时正文从留白处露出。 */
    #page-bbs-community.heybox-up-desktop .bbs-community__search-module {
      display: none !important;
    }
    #page-bbs-community.heybox-up-desktop::before {
      bottom: auto !important;
      height: 80px !important;
    }
    /* 站点还让 main.list 的 8px sticky 伪元素停在原搜索条下沿；搜索条隐藏后
       它会在 138px 处横切信息流并截获点击。保留其占位，取消吸顶与绘制。 */
    #page-bbs-community.heybox-up-desktop main.list::before {
      position: static !important;
      background: transparent !important;
      pointer-events: none !important;
    }
    #page-bbs-community.heybox-up-desktop .content {
      display: grid !important;
      width: 100% !important;
      /* 左右两列等宽，中间栏永远落在视口正中；两侧栏贴近中间栏而不是贴屏幕边。 */
      grid-template-columns:
        minmax(0, 1fr)
        /* 中栏再宽也要给两侧栏留出 208px + 288px + 间距，否则侧栏会压到正文上。 */
        minmax(320px, min(var(--heybox-up-feed-w), calc(100vw - 560px)))
        minmax(0, 1fr);
      column-gap: 24px;
      align-items: start;
      max-width: none !important;
      margin: 0 auto !important;
      justify-content: stretch !important;
    }
    #page-bbs-community.heybox-up-desktop .content > #heybox-up-left-rail {
      display: block;
      grid-column: 1;
      grid-row: 1;
      justify-self: end;
      width: 208px;
      align-self: start;
    }
    #page-bbs-community.heybox-up-desktop .content > main.list {
      grid-column: 2;
      grid-row: 1;
      width: auto !important;
      max-width: none !important;
      min-width: 0;
      margin: 0 !important;
      flex: none !important;
    }
    /* 评论预览只占右侧一列的真实宽度。旧实现再叠一层“侧栏 + 48px”右内边距，
       会在面板与信息流之间留下近乎双倍于面板的空白，并把中栏挤向左侧。 */
    body.heybox-up-rail-open #app > main { max-width: none !important; }
    body.heybox-up-rail-open #page-bbs-community.heybox-up-desktop .content {
      grid-template-columns:
        minmax(var(--heybox-up-rail-w), 1fr)
        minmax(320px, min(var(--heybox-up-feed-w), calc(100% - var(--heybox-up-rail-w) - var(--heybox-up-rail-w) - 48px)))
        minmax(var(--heybox-up-rail-w), 1fr);
      column-gap: 24px;
    }
    /* 左栏已有频道列表，原生横向频道条不再重复出现。 */
    #page-bbs-community.heybox-up-desktop .bbs-home__topic-list-wrapper {
      display: none !important;
    }
  }
  @media (min-width: 1500px) {
    body.heybox-up-desktop-on #app > main {
      max-width: none !important;
    }
    body.heybox-up-desktop-on #page-bbs-community {
      max-width: none !important;
      width: auto !important;
    }
    #page-bbs-community.heybox-up-desktop .content > #heybox-up-right-rail {
      display: block;
      grid-column: 3;
      grid-row: 1;
      justify-self: start;
      width: 288px;
      align-self: start;
    }
  }
  @media (min-width: 1500px) {
    body.heybox-up-rail-open #page-bbs-community.heybox-up-desktop #heybox-up-right-rail {
      display: none;
    }
  }
`;

export function ensureDesktopStyle(): void {
  ensureStyleElement(DESKTOP_STYLE_ID, DESKTOP_CSS);
}

export function parseCompactCount(value: string | null | undefined): number {
  const match = /([0-9]+(?:\.[0-9]+)?)\s*(亿|万)?/.exec(value || "");
  if (match === null) return 0;
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return 0;
  const unit = match[2] === "亿" ? 100000000 : match[2] === "万" ? 10000 : 1;
  return Math.round(base * unit);
}

export function createDesktopRailLink(item: DesktopRailItem, active: boolean): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "rail-link" + (active === true ? " is-active" : "");
  link.href = item.href;
  link.dataset["route"] = item.id;
  link.innerHTML = item.icon;
  const label = document.createElement("span");
  label.textContent = item.label;
  link.append(label);
  link.addEventListener("click", (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigateToPath(item.href);
  });
  return link;
}

export function createDesktopLeftRail(): DesktopLeftRail {
  const root = document.createElement("aside");
  root.id = DESKTOP_LEFT_ID;
  root.setAttribute("aria-label", "浏览与频道");

  const browse = document.createElement("section");
  browse.className = "rail-block";
  const browseTitle = document.createElement("p");
  browseTitle.className = "rail-title";
  browseTitle.textContent = "浏览";
  browse.append(browseTitle);
  const links = [
    { id: "community", label: "社区首页", href: "/app/bbs/home", icon: NAV_ICONS["community"] },
    { id: "favour", label: "我的收藏", href: "/app/user/favour/content", icon: NAV_ICONS["favour"] },
    { id: "article", label: "我的文章", href: "/creator/content_management/home?article_type=all", icon: NAV_ICONS["article"] },
    { id: "search", label: "全站搜索", href: "/app/search/list", icon: COMMUNITY_SEARCH_ICONS.search },
  ];
  for (const item of links) browse.append(createDesktopRailLink(item, item.id === "community"));

  const channelBlock = document.createElement("section");
  channelBlock.className = "rail-block";
  const channelTitle = document.createElement("p");
  channelTitle.className = "rail-title";
  channelTitle.textContent = "频道";
  const channels = document.createElement("div");
  channels.className = "channels";
  channelBlock.append(channelTitle, channels);
  root.append(browse, channelBlock);
  return { root, channels };
}

export function createDesktopRightRail(): DesktopRightRail {
  const root = document.createElement("aside");
  root.id = DESKTOP_RIGHT_ID;
  root.setAttribute("aria-label", "热门与快捷入口");

  const hotBlock = document.createElement("section");
  hotBlock.className = "rail-block";
  const hotTitle = document.createElement("p");
  hotTitle.className = "rail-title";
  hotTitle.textContent = "热门排行";
  const hot = document.createElement("ol");
  hot.className = "hot-list";
  hotBlock.append(hotTitle, hot);

  const toolsBlock = document.createElement("section");
  toolsBlock.className = "rail-block";
  const toolsTitle = document.createElement("p");
  toolsTitle.className = "rail-title";
  toolsTitle.textContent = "快捷入口";
  toolsBlock.append(toolsTitle);
  const tools = [
    { id: "favour", label: "我的收藏", href: "/app/user/favour/content", icon: NAV_ICONS["favour"] },
    { id: "article", label: "我的文章", href: "/creator/content_management/home?article_type=all", icon: NAV_ICONS["article"] },
  ];
  for (const item of tools) toolsBlock.append(createDesktopRailLink(item, false));
  root.append(hotBlock, toolsBlock);
  return { root, hot };
}

export function readDesktopChannels(): DesktopChannel[] {
  return Array.from(document.querySelectorAll("#page-bbs-community .bbs-home__topic-item")).map((button) => {
    const nameNode = button.querySelector(".bbs-home__topic-name");
    const imageNode = button.querySelector("img.bbs-home__topic-item-icon");
    const name = normalizeRailText(nameNode instanceof Element ? nameNode.textContent : button.textContent).slice(0, 24);
    return { name, icon: imageNode === null ? "" : imageNode.getAttribute("src") || "" };
  }).filter((entry) => entry.name !== "");
}

export function syncDesktopChannels(ui: DesktopLeftRail, cache: DesktopCache): void {
  const channels = readDesktopChannels();
  const signature = channels.map((entry) => entry.name + "\u0001" + entry.icon).join("\u0002");
  if (signature === cache.channels) return;
  cache.channels = signature;
  ui.channels.textContent = "";
  if (channels.length === 0) {
    const empty = document.createElement("p");
    empty.className = "rail-empty";
    empty.textContent = "频道列表还没渲染好";
    ui.channels.append(empty);
    return;
  }
  for (const channel of channels) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rail-channel";
    if (channel.icon !== "") {
      const icon = document.createElement("img");
      icon.src = channel.icon;
      icon.alt = "";
      icon.loading = "lazy";
      icon.referrerPolicy = "no-referrer";
      button.append(icon);
    }
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = channel.name;
    button.append(name);
    button.addEventListener("click", () => {
      const native = Array.from(document.querySelectorAll("#page-bbs-community .bbs-home__topic-item")).find((node) => {
        const label = node.querySelector(".bbs-home__topic-name");
        return normalizeRailText(label === null ? node.textContent : label.textContent) === channel.name;
      });
      if (!native) return;
      for (const node of ui.channels.querySelectorAll(".rail-channel")) node.classList.remove("is-active");
      button.classList.add("is-active");
      // Keyboard-capable channel buttons are always HTMLElements; the guard only
      // narrows the DOM query result for the compiler.
      if (native instanceof HTMLElement) native.click();
    });
    ui.channels.append(button);
  }
}

export function readDesktopHotItems(): DesktopHotItem[] {
  return Array.from(document.querySelectorAll("#page-bbs-community .bbs-home__content-item")).map((card, index) => {
    const link = card.querySelector("a[href*='/app/bbs/link/']");
    const href = link === null ? "" : link.getAttribute("href") || "";
    const idMatch = /\/app\/bbs\/link\/(\d+)/.exec(href);
    const titleNode = card.querySelector(".bbs-content__title");
    const title = normalizeRailText(titleNode instanceof Element ? titleNode.textContent : card.textContent).slice(0, 80);
    const commentNode = card.querySelector(".bbs-new-style-bottom__comment, .content-list__comment");
    const likeNode = card.querySelector(".bbs-new-style-bottom__like, .content-list__like");
    const comment = parseCompactCount(commentNode === null ? "" : commentNode.textContent);
    const like = parseCompactCount(likeNode === null ? "" : likeNode.textContent);
    return { card, index, id: idMatch === null ? "i" + index : idMatch[1], title, comment, like, score: comment * 2 + like };
  }).filter((entry) => entry.title !== "").sort((left, right) => right.score - left.score).slice(0, DESKTOP_HOT_LIMIT);
}

export function syncDesktopHot(ui: DesktopRightRail, cache: DesktopCache): void {
  const items = readDesktopHotItems();
  const signature = items.map((item) => item.id + ":" + item.score + ":" + item.title).join("|");
  if (signature === cache.hot) return;
  cache.hot = signature;
  ui.hot.textContent = "";
  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "rail-empty";
    empty.textContent = "信息流还没有可排序的热度数据";
    ui.hot.append(empty);
    return;
  }
  items.forEach((item, index) => {
    const row = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hot-item";
    const rank = document.createElement("span");
    rank.className = "hot-rank";
    rank.textContent = String(index + 1);
    const title = document.createElement("span");
    title.className = "hot-title";
    title.textContent = item.title;
    const meta = document.createElement("span");
    meta.className = "hot-meta";
    const parts = [];
    if (item.comment > 0) parts.push(item.comment + " 评论");
    if (item.like > 0) parts.push(item.like + " 赞");
    meta.textContent = parts.length === 0 ? "当前信息流" : parts.join(" · ");
    button.append(rank, title, meta);
    button.addEventListener("click", () => {
      item.card.scrollIntoView({ behavior: "smooth", block: "center" });
      item.card.classList.add(DESKTOP_HOT_TARGET_CLASS);
      window.setTimeout(() => item.card.classList.remove(DESKTOP_HOT_TARGET_CLASS), 1400);
    });
    row.append(button);
    ui.hot.append(row);
  });
}

export function watchDesktopShell() {
  if (!document.body) return;
  const desktopViewport = window.matchMedia("(min-width: 1200px)");
  const left = createDesktopLeftRail();
  const right = createDesktopRightRail();
  const cache = { channels: "", hot: "" };
  let lastDesktopSyncAt = 0;
  let lastDesktopPath = location.pathname;

  const teardown = () => {
    document.body.classList.remove("heybox-up-desktop-on");
    const page = document.querySelector("#page-bbs-community");
    if (page !== null) page.classList.remove(DESKTOP_PAGE_CLASS);
    if (left.root.parentNode !== null) left.root.remove();
    if (right.root.parentNode !== null) right.root.remove();
  };

  const sync = (force = false) => {
    const now = performance.now();
    if (location.pathname !== lastDesktopPath) {
      lastDesktopPath = location.pathname;
      force = true;
    }
    if (!force && now - lastDesktopSyncAt < 500) return;
    lastDesktopSyncAt = now;
    if (!desktopViewport.matches) {
      teardown();
      return;
    }
    const page = document.querySelector("#page-bbs-community");
    const content = page === null ? null : page.querySelector(".content");
    if (page === null || content === null || page.querySelector("main.list") === null) {
      teardown();
      return;
    }
    ensureDesktopStyle();
    page.classList.add(DESKTOP_PAGE_CLASS);
    document.body.classList.add("heybox-up-desktop-on");
    if (left.root.parentNode !== content) content.prepend(left.root);
    if (right.root.parentNode !== content) content.append(right.root);
    syncDesktopChannels(left, cache);
    syncDesktopHot(right, cache);
  };

  registerPageSync(sync, 400, [PAGE_ROUTE.FEED], "feed");
  window.addEventListener("popstate", () => requestAnimationFrame(() => sync(true)));
  desktopViewport.addEventListener("change", () => sync(true));
  sync(true);
}
