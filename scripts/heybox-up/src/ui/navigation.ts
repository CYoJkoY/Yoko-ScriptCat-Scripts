import { ensureStyleElement, registerPageSync } from "../core/page-sync";
import { asRecord } from "../core/json";
import { readNavMotionPreference } from "../state";

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

export const NAV_MOTION_FRAMES: Record<string, Keyframe[] | undefined> = {
  home: [
    { transform: "translateY(0) scale(1)", offset: 0 },
    { transform: "translateY(-5.5px) scale(1.06)", offset: 0.3 },
    { transform: "translateY(1.4px) scale(0.99)", offset: 0.58 },
    { transform: "translateY(-1.6px) scale(1.01)", offset: 0.78 },
    { transform: "translateY(0) scale(1)", offset: 1 },
  ],
  community: [
    { transform: "translateY(0) scale(1)", offset: 0 },
    { transform: "translateY(-5px) scale(1.07)", offset: 0.35 },
    { transform: "translateY(1.2px) scale(0.99)", offset: 0.66 },
    { transform: "translateY(-1.2px) scale(1.01)", offset: 0.84 },
    { transform: "translateY(0) scale(1)", offset: 1 },
  ],
  favour: [
    { transform: "translateY(0) scale(1)", offset: 0 },
    { transform: "translateY(1px) scale(0.92)", offset: 0.32 },
    { transform: "translateY(-5.5px) scale(1.05)", offset: 0.64 },
    { transform: "translateY(-1px) scale(1)", offset: 0.84 },
    { transform: "translateY(0) scale(1)", offset: 1 },
  ],
  article: [
    { transform: "rotate(0) translateY(0) scale(1)", offset: 0 },
    { transform: "rotate(-8deg) translateY(-3.5px) scale(1.03)", offset: 0.3 },
    { transform: "rotate(3.5deg) translateY(-1px) scale(1)", offset: 0.62 },
    { transform: "rotate(-1.5deg) translateY(0) scale(1)", offset: 0.82 },
    { transform: "rotate(0) translateY(0) scale(1)", offset: 1 },
  ],
};

export const NAV_PRESS_FRAMES: Keyframe[] = [
  { transform: "scale(1)", offset: 0 },
  { transform: "scale(0.86)", offset: 0.45 },
  { transform: "scale(1)", offset: 1 },
];

export const navMotionAnimations = new WeakMap<HTMLElement, Animation>();

export const navMotionBoundLinks = new WeakSet<Element>();

export const navMotionBoundHosts = new WeakSet<HTMLElement>();

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
  .hbu-nav-icon { display: inline-flex; width: 18px; height: 18px; flex: none; align-items: center; justify-content: center; transform-origin: 50% 60%; will-change: transform; }
  .hbu-nav-icon svg { display: block; width: 100%; height: 100%; flex: none; }
  :root.${NAV_STATIC_CLASS} .hbu-nav-icon { animation: none !important; }
  @media (prefers-reduced-motion: reduce) {
    .hbu-nav-icon { animation: none !important; }
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
  if (!value) stopNavIconMotion();
}

export function playNavIconMotion(icon: Element | null, frames: Keyframe[], duration: number, easing: string): void {
  if (!(icon instanceof HTMLElement)) return;
  if (!readNavMotionPreference() || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  navMotionAnimations.get(icon)?.cancel();
  const animation = icon.animate(frames, { duration: duration, easing: easing, fill: "none" });
  navMotionAnimations.set(icon, animation);
  animation.addEventListener("finish", () => {
    if (navMotionAnimations.get(icon) === animation) navMotionAnimations.delete(icon);
  }, { once: true });
}

export function playNavLinkMotion(link: Element): void {
  const name = link.getAttribute("data-nav") || "";
  const frames = NAV_MOTION_FRAMES[name];
  if (frames === undefined) return;
  playNavIconMotion(link.querySelector(".hbu-nav-icon"), frames, 620, "cubic-bezier(.22, .8, .3, 1)");
}

export function bindNavMotion(host: HTMLElement): void {
  if (navMotionBoundHosts.has(host)) return;
  navMotionBoundHosts.add(host);
  host.addEventListener("pointerover", (event) => {
    const link = event.target instanceof Element ? event.target.closest(".hbu-nav-link") : null;
    if (link === null || !host.contains(link)) return;
    const from = event.relatedTarget;
    if (from instanceof Node && link.contains(from)) return;
    playNavLinkMotion(link);
  });
  host.addEventListener("focusin", (event) => {
    const link = event.target instanceof Element ? event.target.closest(".hbu-nav-link") : null;
    if (link !== null && host.contains(link)) playNavLinkMotion(link);
  });
  host.addEventListener("pointerdown", (event) => {
    const link = event.target instanceof Element ? event.target.closest(".hbu-nav-link") : null;
    if (link !== null && host.contains(link)) playNavIconMotion(link.querySelector(".hbu-nav-icon"), NAV_PRESS_FRAMES, 140, "cubic-bezier(.3, .7, .3, 1)");
  });
}

export function stopNavIconMotion(): void {
  for (const icon of Array.from(document.querySelectorAll("#" + NAV_ID + " .hbu-nav-icon"))) {
    if (!(icon instanceof HTMLElement)) continue;
    const animation = navMotionAnimations.get(icon);
    if (animation === undefined) continue;
    animation.cancel();
    navMotionAnimations.delete(icon);
  }
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
  bindNavMotion(host);
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
