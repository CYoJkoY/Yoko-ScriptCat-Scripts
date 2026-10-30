import { PAGE_ROUTE } from "../config";
import { LINK_HREF_PREFIX } from "../core/cy";
import { asRecord } from "../core/json";
import { registerPageSync } from "../core/page-sync";
import { fetchRailPage } from "./rail";
import { HIDE_CY_EVENT, isCyComment, readHideCyPreference, setHideCyPreference } from "../state";

export const COMMENT_SORTS = [
  { id: "default", label: "默认" },
  { id: "time", label: "时间" },
  { id: "likes", label: "点赞" },
  { id: "author", label: "作者" },
];

export const COMMENT_SORT_HOST_ID = "heybox-up-comment-sort";

const COMMENT_AGE_UNITS: Readonly<Record<string, number | undefined>> = {
  秒: 1,
  分钟: 60,
  小时: 3600,
  天: 86400,
};

export const COMMENT_SORT_CSS = `
  :host {
    display: block;
    margin: 0 !important;
    padding: 9px 12px !important;
    border-bottom: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1)) !important;
    background: var(--heybox-up-surface, #fff) !important;
    font: 12px/1.4 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif !important;
  }
  .bar { display: flex; align-items: center; gap: 8px; }
  .group {
    display: inline-flex; gap: 2px; padding: 2px; border-radius: 999px;
    background: var(--heybox-up-subtle, rgba(20, 25, 30, .06));
  }
  .spacer { flex: 1 1 auto; }
  button {
    padding: 4px 10px; border: 0; border-radius: 999px;
    background: transparent; color: var(--heybox-up-muted, #6b7280);
    font: inherit; cursor: pointer;
    transition: color .12s ease, background-color .12s ease;
  }
  button:hover { color: var(--heybox-up-text, #14191e); }
  button:focus-visible { outline: 2px solid var(--heybox-up-accent, #6f8db3); outline-offset: 1px; }
  .group button[aria-pressed="true"] {
    background: var(--heybox-up-surface, #fff);
    color: var(--heybox-up-text, #14191e);
    font-weight: 600;
    box-shadow: 0 1px 2px rgba(16, 24, 40, .14);
  }
  .cy {
    padding: 4px 9px;
    border: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1));
  }
  .cy[aria-pressed="true"] {
    border-color: transparent;
    background: var(--heybox-up-subtle, rgba(20, 25, 30, .06));
    color: var(--heybox-up-accent, #6f8db3);
    font-weight: 600;
  }
`;

export function parseCommentAge(text: string): number {
  const value = text.trim();
  if (value === "" || value === "刚刚") return value === "刚刚" ? 0 : Number.POSITIVE_INFINITY;
  if (value === "昨天") return 86400;
  const relative = /^(\d+)\s*(秒|分钟|小时|天)前$/.exec(value);
  if (relative) {
    const unit = COMMENT_AGE_UNITS[relative[2]];
    return Number(relative[1]) * (unit ?? 0);
  }
  const parsed = Date.parse(value.replace(/-/g, "/"));
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : (Date.now() - parsed) / 1000;
}

export function applyCommentSort(tree: Element, mode: string): void {
  const list = tree.querySelector(".link-comment__list");
  if (!list) return;
  const items: HTMLElement[] = [];
  for (const node of Array.from(list.children)) {
    if (node instanceof HTMLElement && node.classList.contains("link-comment__comment-item")) items.push(node);
  }
  if (mode === "default") {
    for (const item of items) item.style.order = "";
    return;
  }
  const authorName = (document.querySelector("#page-bbs-link .link-user__username")?.textContent || "").trim();
  const keyed = items.map((item: HTMLElement, index: number) => {
    const likes = Number((item.querySelector(".like-box__cnt")?.textContent || "0").trim()) || 0;
    const age = parseCommentAge(item.querySelector(".info-box__create-time")?.textContent || "");
    const name = (item.querySelector(".info-box__username")?.textContent || "").trim();
    return { item, index, likes, age, isAuthor: authorName !== "" && name === authorName };
  });
  keyed.sort((a, b) => {
    if (mode === "likes") return b.likes - a.likes || a.index - b.index;
    if (mode === "time") return a.age - b.age || a.index - b.index;
    if (mode === "author") return Number(b.isAuthor) - Number(a.isAuthor) || a.index - b.index;
    return a.index - b.index;
  });
  keyed.forEach((entry, index) => { entry.item.style.order = String(index); });
}

export function createCommentSort(
  tree: Element,
  mode = "default",
  isHideCy: () => boolean = () => false,
  onToggleCy: () => void = () => {},
): HTMLDivElement {
  const host = document.createElement("div");
  host.id = COMMENT_SORT_HOST_ID;
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = COMMENT_SORT_CSS;
  const bar = document.createElement("div");
  bar.className = "bar";
  const group = document.createElement("div");
  group.className = "group";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "评论排序");
  bar.append(group);
  let current = mode;
  const buttons = COMMENT_SORTS.map((sort) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = sort.label;
    button.dataset["sort"] = sort.id;
    button.setAttribute("aria-pressed", String(sort.id === current));
    button.addEventListener("click", () => {
      current = sort.id;
      for (const node of buttons) node.setAttribute("aria-pressed", String(node.dataset["sort"] === current));
      applyCommentSort(tree, current);
    });
    group.append(button);
    return button;
  });
  const spacer = document.createElement("span");
  spacer.className = "spacer";
  const cyButton = document.createElement("button");
  cyButton.type = "button";
  cyButton.className = "cy";
  cyButton.textContent = "屏蔽 CY";
  cyButton.setAttribute("aria-pressed", String(isHideCy()));
  cyButton.title = isHideCy() ? "显示 CY 评论" : "屏蔽 CY 评论";
  cyButton.addEventListener("click", () => onToggleCy());
  bar.append(spacer, cyButton);
  shadow.append(style, bar);
  tree.prepend(host);
  return host;
}

export function watchCommentSort(): void {
  if (!document.body) return;
  let host: HTMLDivElement | null = null;
  let mode = "default";
  let cyLinkId = "";
  let cyPage = 0;
  let cyDone = false;
  let cyLoading = false;
  let cyIds = new Set<string>();
  let cyScanned = new Set<string>();

  const getLinkId = (): string => {
    const match = /link\/(\d+)/.exec(location.pathname);
    return match ? match[1] : "";
  };

  const toggleCy = (): void => {
    setHideCyPreference(!readHideCyPreference());
  };

  const updateCyButton = (): void => {
    const button = host?.shadowRoot?.querySelector("button.cy");
    if (!(button instanceof HTMLButtonElement)) return;
    const hideCy = readHideCyPreference();
    button.setAttribute("aria-pressed", String(hideCy));
    button.title = hideCy ? "显示 CY 评论" : "屏蔽 CY 评论";
  };

  const markCy = (): void => {
    const tree = document.querySelector("#page-bbs-link .link-comment");
    if (!tree) return;
    let count = 0;
    const counted = new Set<string>();
    for (const node of tree.querySelectorAll("[data-comment-id]")) {
      const id = node.getAttribute("data-comment-id") || "";
      if (cyIds.has(id)) {
        if (node.getAttribute("data-heybox-up-cy") !== "1") node.setAttribute("data-heybox-up-cy", "1");
        if (!counted.has(id)) {
          counted.add(id);
          count += 1;
        }
      } else if (node.hasAttribute("data-heybox-up-cy")) {
        node.removeAttribute("data-heybox-up-cy");
      }
    }
    const button = host?.shadowRoot?.querySelector("button.cy");
    if (!(button instanceof HTMLButtonElement)) return;
    const hidden = readHideCyPreference() ? count : 0;
    button.textContent = hidden > 0 ? "屏蔽 CY (" + hidden + ")" : "屏蔽 CY";
  };

  const pullCyIds = async (): Promise<void> => {
    if (cyLoading || cyDone) return;
    const linkId = getLinkId();
    const tree = document.querySelector("#page-bbs-link .link-comment");
    if (linkId === "" || !tree) return;
    const hasUnknown = (): boolean => Array.from(tree.querySelectorAll("[data-comment-id]"))
      .some((node) => {
        const id = node.getAttribute("data-comment-id") || "";
        return id !== "" && !cyScanned.has(id);
      });
    if (!hasUnknown()) return;
    cyLoading = true;
    try {
      // Only fetch floors that are not identified yet, ten pages at most, so a
      // long thread cannot trip the endpoint rate limit.
      while (!cyDone && cyPage < 10 && getLinkId() === linkId) {
        const data = await fetchRailPage(linkId, cyPage + 1);
        cyPage += 1;
        let added = 0;
        for (const group of data.groups) {
          const groupRecord = asRecord(group);
          const rawList = groupRecord === null ? undefined : groupRecord["comment"];
          const list: unknown[] = Array.isArray(rawList) ? rawList : [];
          for (const raw of list) {
            const record = asRecord(raw);
            const id = String((record === null ? "" : record["commentid"] || record["comment_id"]) || "");
            if (id !== "" && !cyScanned.has(id)) {
              cyScanned.add(id);
              added += 1;
            }
            if (id !== "" && isCyComment(raw)) cyIds.add(id);
          }
        }
        if (added === 0) cyDone = true;
        if (!hasUnknown()) break;
      }
      if (cyPage >= 10) cyDone = true;
    } catch {
      // A failed page keeps native comments visible and never marks real floors.
      cyDone = true;
    } finally {
      cyLoading = false;
      markCy();
    }
  };

  const sync = (): void => {
    if (!location.pathname.startsWith(LINK_HREF_PREFIX)) {
      host = null;
      mode = "default";
      return;
    }
    const tree = document.querySelector("#page-bbs-link .link-comment");
    if (!tree) return;
    const linkId = getLinkId();
    if (linkId !== cyLinkId) {
      cyLinkId = linkId;
      cyPage = 0;
      cyDone = false;
      cyIds = new Set();
      cyScanned = new Set();
    }
    const active = host?.shadowRoot?.querySelector('button[data-sort][aria-pressed="true"]');
    if (active instanceof HTMLElement) mode = active.dataset["sort"] || "default";
    if (!host || !host.isConnected || host.parentElement !== tree) {
      host = createCommentSort(tree, mode, readHideCyPreference, toggleCy);
    }
    applyCommentSort(tree, mode);
    updateCyButton();
    markCy();
    void pullCyIds();
  };

  registerPageSync(sync, 250, [PAGE_ROUTE.ARTICLE], "article");
  document.addEventListener(HIDE_CY_EVENT, () => {
    updateCyButton();
    markCy();
  });
  sync();
}
