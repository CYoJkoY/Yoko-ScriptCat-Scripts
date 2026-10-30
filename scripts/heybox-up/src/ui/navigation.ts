import { ensureStyleElement, registerPageSync } from "../core/page-sync";
import { asRecord } from "../core/json";

export const NAV_ID = "heybox-up-nav";

export const NAV_STYLE_ID = "heybox-up-nav-style";

export const NAV_STATIC_CLASS = "heybox-up-nav-static";

export const CY_HASH = "#heybox-up-cy";

export interface NavItem {
  id: string;
  label: string;
  href: string;
}

/** Minimal shape of the site's Vue Router instance, only what the port needs. */
export interface SiteRouterLike {
  push(path: string): unknown;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "首页", href: "/" },
  { id: "community", label: "社区", href: "/app/bbs/home" },
  { id: "favour", label: "收藏", href: "/app/user/favour/content" },
  { id: "article", label: "文章", href: "/creator/content_management/home?article_type=all" },
];

export const NAV_ICONS: Record<string, string> = {
  home: '<span class="hbu-nav-icon hbu-ico-anim hbu-ico-home" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11.2 12 4l8 7.2"/><path d="M6.6 9.8V20h10.8V9.8"/><path d="M10.2 20v-5.2h3.6V20"/></svg></span>',
  community: '<span class="hbu-nav-icon hbu-ico-anim hbu-ico-community" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 11.6a7.9 7.9 0 0 1-8.4 7.9 9 9 0 0 1-2.8-.4L4.5 20.5l1.3-4.1a7.8 7.8 0 0 1-1.3-4.8A7.9 7.9 0 0 1 12.4 3.7a7.9 7.9 0 0 1 8.1 7.9Z"/><circle cx="8.8" cy="12" r=".9" fill="currentColor" stroke="none"/><circle cx="12.4" cy="12" r=".9" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r=".9" fill="currentColor" stroke="none"/></svg></span>',
  favour: '<span class="hbu-nav-icon hbu-ico-anim hbu-ico-favour" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 4h11a1 1 0 0 1 1 1v15l-6.5-4.2L5.5 20V5a1 1 0 0 1 1-1Z"/></svg></span>',
  article: '<span class="hbu-nav-icon hbu-ico-anim hbu-ico-article" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 16.5h6"/></svg></span>',
};

export const NAV_CSS = `
  .nav-links > .nav-link { display: none !important; }
  #${NAV_ID} {
    display: flex;
    align-items: stretch;
    height: 64px;
    gap: 2px;
    margin-left: 2px;
    font: 14px/1.5 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
  }
  .hbu-nav-link {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 100%;
    padding: 0 12px;
    border-radius: 8px;
    color: var(--nav-link-color, var(--heybox-up-muted, #8c9198));
    text-decoration: none;
    white-space: nowrap;
    transition: color .18s ease;
  }
  .hbu-nav-link::after {
    content: "";
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: 11px;
    height: 2px;
    border-radius: 2px;
    background: var(--heybox-up-accent, #6f8db3);
    transform: scaleX(0);
    transform-origin: 50% 50%;
    transition: transform .2s ease;
  }
  .hbu-nav-link:hover { color: var(--nav-link-active-color, var(--heybox-up-text, #14191e)); }
  .hbu-nav-link:hover::after, .hbu-nav-link.is-active::after { transform: scaleX(1); }
  .hbu-nav-link.is-active {
    color: var(--nav-link-active-color, var(--heybox-up-text, #14191e));
    font-weight: 600;
  }
  .hbu-nav-link:focus-visible {
    outline: 2px solid var(--heybox-up-accent, #6f8db3);
    outline-offset: -2px;
  }
  .hbu-nav-icon {
    display: inline-flex;
    width: 18px;
    height: 18px;
    flex: none;
    align-items: center;
    justify-content: center;
    transform-origin: 50% 60%;
    transition:
      transform .18s cubic-bezier(.22, .8, .3, 1),
      color .18s ease;
  }
  .hbu-nav-icon svg { display: block; width: 100%; height: 100%; flex: none; }
  .hbu-nav-link:focus-visible .hbu-nav-icon {
    color: var(--nav-link-active-color, var(--heybox-up-text, #14191e));
    transform: translateY(-2px) scale(1.14);
  }
  .hbu-nav-link[data-nav="article"]:focus-visible .hbu-nav-icon {
    transform: rotate(-7deg) translateY(-2px) scale(1.1);
  }
  /* Touch browsers keep :hover on the tapped link, which would leave the icon enlarged.
     Gate hover-only motion to devices that can hover with a precise pointer. */
  @media (hover: hover) and (pointer: fine) {
    .hbu-nav-link:hover .hbu-nav-icon {
      color: var(--nav-link-active-color, var(--heybox-up-text, #14191e));
      transform: translateY(-2px) scale(1.14);
    }
    .hbu-nav-link[data-nav="article"]:hover .hbu-nav-icon {
      transform: rotate(-7deg) translateY(-2px) scale(1.1);
    }
  }
  .hbu-nav-link:active .hbu-nav-icon { transform: translateY(0) scale(.9); transition-duration: .08s; }
  .hbu-nav-link[data-nav="article"]:active .hbu-nav-icon { transform: translateY(0) rotate(0) scale(.9); }
  :root.${NAV_STATIC_CLASS} .hbu-nav-icon {
    animation: none !important;
    transform: none !important;
    transition: none !important;
  }
  @media (prefers-reduced-motion: reduce) {
    .hbu-nav-icon {
      animation: none !important;
      transform: none !important;
      transition: none !important;
    }
    .hbu-nav-link::after { transition: none; }
  }
  @media (max-width: 1180px) {
    .hbu-nav-link { padding: 0 9px; gap: 5px; font-size: 13px; }
    .hbu-nav-link::after { left: 9px; right: 9px; }
  }
  @media (max-width: 940px) {
    .hbu-nav-link > span:not(.hbu-nav-icon) { display: none; }
    .hbu-nav-link { padding: 0 10px; }
  }
`;

export function applyNavMotionPreference(value: boolean): void {
  document.documentElement.classList.toggle(NAV_STATIC_CLASS, value === false);
}

export function ensureNavStyle(): void {
  ensureStyleElement(NAV_STYLE_ID, NAV_CSS);
}

export function readNavActiveId(): string {
  const path = location.pathname;
  if (path === "/app/user/favour/content") return "favour";
  if (path === "/") return "home";
  if (path.startsWith("/creator/")) return "article";
  if (path.startsWith("/app/bbs/")) return "community";
  return "";
}

export let navActiveHost: HTMLElement | null = null;

export let navActiveId: string = "";

export function syncNavActive(): void {
  const host = document.getElementById(NAV_ID);
  if (!host) {
    navActiveHost = null;
    navActiveId = "";
    return;
  }
  const activeId = readNavActiveId();
  if (host === navActiveHost && activeId === navActiveId) return;
  for (const node of Array.from(host.querySelectorAll<HTMLElement>(".hbu-nav-link"))) {
    const active = node.dataset["nav"] === activeId;
    node.classList.toggle("is-active", active);
    if (active) node.setAttribute("aria-current", "page");
    else node.removeAttribute("aria-current");
  }
  navActiveHost = host;
  navActiveId = activeId;
}

export function scrollToCySection(): boolean {
  const host = document.getElementById("heybox-up-favour");
  if (!host) return false;
  host.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

export function readSiteRouter(): SiteRouterLike | null {
  const root = document.querySelector("#app");
  const app = asRecord(root === null ? null : Reflect.get(root, "__vue_app__"));
  const config = app === null ? null : asRecord(app["config"]);
  const properties = config === null ? null : asRecord(config["globalProperties"]);
  const router = properties === null ? null : asRecord(properties["$router"]);
  if (router === null) return null;
  const push: unknown = router["push"];
  if (typeof push !== "function") return null;
  // The router object came from the page and is only probed for push(); wrapping it keeps the
  // call site free of an unsafe assertion while preserving the original call shape.
  return { push: (path: string): unknown => Reflect.apply(push, router, [path]) };
}

function readThenable(value: unknown): PromiseLike<unknown> | null {
  // The original gated on truthiness, so callable values were accepted too.
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" && typeof value !== "function") return null;
  const then = Reflect.get(value, "then");
  if (typeof then !== "function") return null;
  // The page's router returns a Promise; the guard above already proved a then() exists.
  return value as PromiseLike<unknown>;
}

export function navigateToPath(path: string): Promise<boolean> {
  const router = readSiteRouter();
  if (router) {
    try {
      const pending = router.push(path);
      const thenable = readThenable(pending);
      if (thenable !== null) {
        return Promise.resolve(thenable).then(
          (result: unknown) => !(result !== null && typeof result === "object" && typeof Reflect.get(result, "type") === "number"),
          () => false,
        );
      }
      return Promise.resolve(true);
    } catch {
      // A broken router state falls back to the native navigation below.
    }
  }
  const anchor = document.createElement("a");
  anchor.href = path;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  return Promise.resolve(true);
}

export function handleNavClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const link = target.closest("a.hbu-nav-link");
  if (!link) return;
  // 组合键或中键交给浏览器，保留新标签页打开的能力。
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const id = link.getAttribute("data-nav");
  // Clicking favour again while on the favour page clears the old anchor and returns to the top.
  if (id === "favour" && location.pathname === "/app/user/favour/content" && location.hash !== "") {
    event.preventDefault();
    history.pushState(null, "", "/app/user/favour/content");
    window.scrollTo({ top: 0, behavior: "smooth" });
    syncNavActive();
    return;
  }
  // The nav bar lives outside the site root, so a native <a> click reloads the whole page.
  event.preventDefault();
  const href = link.getAttribute("href");
  if (href !== null && href !== "") navigateToPath(href);
}

export function mountTopNav(): void {
  if (!document.body) return;
  const current = document.getElementById(NAV_ID);
  if (current?.parentElement?.classList.contains("nav-links") && current.parentElement.firstElementChild === current) {
    syncNavActive();
    return;
  }
  const links = document.querySelector(".nav .nav-links") || document.querySelector(".nav-links");
  if (!links) return;
  ensureNavStyle();
  let host = current;
  if (!host) {
    host = document.createElement("div");
    host.id = NAV_ID;
    host.setAttribute("role", "navigation");
    host.setAttribute("aria-label", "站内导航");
    host.innerHTML = NAV_ITEMS.map((item) =>
      '<a class="hbu-nav-link" data-nav="' + item.id + '" href="' + item.href + '" aria-label="' + item.label + '" title="' + item.label + '">' + NAV_ICONS[item.id] + "<span>" + item.label + "</span></a>"
    ).join("");
    host.addEventListener("click", handleNavClick);
  }
  if (host.parentNode !== links || links.firstElementChild !== host) links.prepend(host);
  syncNavActive();
}

export function watchTopNav(): void {
  if (!document.body) return;
  const sync = () => {
    mountTopNav();
    syncNavActive();
  };
  window.addEventListener("hashchange", syncNavActive);
  window.addEventListener("popstate", syncNavActive);
  registerPageSync(sync, 300, null, "chrome");
  sync();
}
