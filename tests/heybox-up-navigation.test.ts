// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: (): void => undefined,
      removeListener: (): void => undefined,
      addEventListener: (): void => undefined,
      removeEventListener: (): void => undefined,
      dispatchEvent: (): boolean => true,
    }),
  });
});

import { COMMUNITY_SEARCH_ICONS } from "../scripts/heybox-up/src/ui/community-search";
import { createDesktopLeftRail, createDesktopRightRail } from "../scripts/heybox-up/src/ui/desktop";
import {
  NAV_CSS,
  NAV_DYNAMIC_ICONS,
  NAV_ID,
  NAV_STATIC_CLASS,
  NAV_STATIC_ICONS,
  applyNavMotionPreference,
  mountTopNav,
  navIconMarkup,
  navIconMarkupFor,
  syncNavActive,
  syncNavIconVariant,
} from "../scripts/heybox-up/src/ui/navigation";

function parseMarkup(markup: string): HTMLElement {
  const template = document.createElement("template");
  template.innerHTML = markup;
  const node = template.content.firstElementChild;
  if (!(node instanceof HTMLElement)) throw new Error("Expected an element");
  return node;
}

function mountLinkHost(iconMarkup: string): HTMLAnchorElement {
  document.body.innerHTML = [
    '<nav class="nav">',
    '<div class="nav-links">',
    '<div id="' + NAV_ID + '" role="navigation">',
    '<a class="hbu-nav-link is-active" data-nav="community" href="/app/bbs/home" aria-label="社区" title="社区" aria-current="page">',
    iconMarkup + "<span>社区</span>",
    "</a>",
    "</div>",
    "</div>",
    "</nav>",
  ].join("");
  const link = document.querySelector<HTMLAnchorElement>(".hbu-nav-link");
  if (link === null) throw new Error("Expected the navigation link");
  return link;
}

beforeEach(() => {
  document.documentElement.className = "";
  document.body.className = "";
  document.body.innerHTML = "";
  history.replaceState(null, "", "/");
  syncNavActive();
});

afterEach(() => {
  document.documentElement.className = "";
  document.body.className = "";
  document.body.innerHTML = "";
  history.replaceState(null, "", "/");
  syncNavActive();
  vi.restoreAllMocks();
});

describe("navigation icon variants", () => {
  it("keeps static markup free of motion hooks", () => {
    for (const markup of Object.values(NAV_STATIC_ICONS)) {
      const icon = parseMarkup(markup);
      expect(icon.classList.contains("hbu-ico-anim")).toBe(false);
      expect(icon.querySelectorAll("path").length).toBeGreaterThan(0);
      for (const path of icon.querySelectorAll("path")) {
        expect(path.hasAttribute("pathLength")).toBe(false);
        expect(path.classList.contains("hbu-ico-stroke")).toBe(false);
      }
    }
  });

  it("marks every dynamic path for the draw animation", () => {
    for (const [id, markup] of Object.entries(NAV_DYNAMIC_ICONS)) {
      const icon = parseMarkup(markup);
      expect(icon.classList.contains("hbu-ico-anim")).toBe(true);
      expect(icon.classList.contains("hbu-ico-" + id)).toBe(true);
      expect(icon.querySelectorAll("path").length).toBeGreaterThan(0);
      for (const path of icon.querySelectorAll("path")) {
        expect(path.getAttribute("pathLength")).toBe("1");
        expect(path.classList.contains("hbu-ico-stroke")).toBe(true);
      }
      for (const circle of icon.querySelectorAll("circle")) {
        expect(circle.hasAttribute("pathLength")).toBe(false);
        expect(circle.classList.contains("hbu-ico-stroke")).toBe(false);
      }
    }
  });

  it("builds the same glyph for an explicit variant", () => {
    expect(navIconMarkup("article", false)).toBe(NAV_STATIC_ICONS["article"]);
    expect(navIconMarkup("article", true)).toBe(NAV_DYNAMIC_ICONS["article"]);
    expect(navIconMarkup("missing", true)).toBe("");
  });

  it("ships the draw keyframes in the navigation CSS", () => {
    expect(NAV_CSS).toContain("@keyframes hbu-nav-ico-draw");
    expect(NAV_CSS).toContain(":root." + NAV_STATIC_CLASS + " .hbu-nav-icon");
    expect(NAV_CSS).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("reads the static preference from the root class", () => {
    document.documentElement.classList.add(NAV_STATIC_CLASS);
    expect(parseMarkup(navIconMarkupFor("community")).classList.contains("hbu-ico-anim")).toBe(false);
    document.documentElement.classList.remove(NAV_STATIC_CLASS);
    expect(parseMarkup(navIconMarkupFor("community")).classList.contains("hbu-ico-anim")).toBe(true);
  });
});

describe("navigation icon preference", () => {
  it("swaps the mounted icons while preserving the anchors", () => {
    const link = mountLinkHost(NAV_DYNAMIC_ICONS["community"] ?? "");
    const click = vi.fn();
    link.addEventListener("click", click);
    link.focus();

    applyNavMotionPreference(false);
    expect(document.documentElement.classList.contains(NAV_STATIC_CLASS)).toBe(true);
    const staticIcon = link.querySelector(".hbu-nav-icon");
    expect(staticIcon?.classList.contains("hbu-ico-anim")).toBe(false);
    expect(link.getAttribute("href")).toBe("/app/bbs/home");
    expect(link.getAttribute("aria-label")).toBe("社区");
    expect(link.getAttribute("title")).toBe("社区");
    expect(link.classList.contains("is-active")).toBe(true);
    expect(link.getAttribute("aria-current")).toBe("page");
    expect(link.textContent).toBe("社区");
    expect(document.activeElement).toBe(link);
    link.click();
    expect(click).toHaveBeenCalledTimes(1);

    applyNavMotionPreference(true);
    expect(document.documentElement.classList.contains(NAV_STATIC_CLASS)).toBe(false);
    expect(link.querySelector(".hbu-nav-icon")?.classList.contains("hbu-ico-anim")).toBe(true);
    expect(link.querySelectorAll(".hbu-nav-icon")).toHaveLength(1);
  });

  it("does not swap an icon that already matches the preference", () => {
    const link = mountLinkHost(NAV_STATIC_ICONS["community"] ?? "");
    const original = link.querySelector(".hbu-nav-icon");
    syncNavIconVariant(false);
    expect(link.querySelector(".hbu-nav-icon")).toBe(original);
  });

  it("mounts the first nav with the current preference", () => {
    document.documentElement.classList.add(NAV_STATIC_CLASS);
    document.body.innerHTML = '<nav class="nav"><div class="nav-links"></div></nav>';
    mountTopNav();
    const host = document.getElementById(NAV_ID);
    expect(host).not.toBeNull();
    expect(host?.querySelectorAll(".hbu-nav-icon")).toHaveLength(3);
    expect(host?.querySelectorAll(".hbu-nav-icon.hbu-ico-anim")).toHaveLength(0);
    expect(host?.querySelectorAll("path[pathLength]")).toHaveLength(0);

    document.documentElement.classList.remove(NAV_STATIC_CLASS);
    mountTopNav();
    expect(host?.querySelectorAll(".hbu-nav-icon.hbu-ico-anim")).toHaveLength(3);
  });

  it("switches desktop rail icons tagged with a route", () => {
    const left = createDesktopLeftRail();
    const right = createDesktopRightRail();
    document.body.append(left.root, right.root);
    const railIcons = Array.from(left.root.querySelectorAll('a[data-route]:not([data-route="search"]) .hbu-nav-icon'));
    expect(railIcons.length).toBeGreaterThan(0);
    expect(railIcons.every((icon) => icon.classList.contains("hbu-ico-anim"))).toBe(true);

    applyNavMotionPreference(false);
    expect(railIcons.every((icon) => icon.isConnected)).toBe(false);
    expect(left.root.querySelectorAll("a[data-route=\"community\"] .hbu-nav-icon")).toHaveLength(1);
    expect(left.root.querySelectorAll("a[data-route=\"community\"] .hbu-nav-icon.hbu-ico-anim")).toHaveLength(0);
    expect(right.root.querySelectorAll("a[data-route] .hbu-nav-icon.hbu-ico-anim")).toHaveLength(0);
    expect(right.root.querySelectorAll("a[data-route] .hbu-nav-icon")).toHaveLength(2);

    applyNavMotionPreference(true);
    expect(left.root.querySelectorAll("a[data-route]:not([data-route=\"search\"]) .hbu-nav-icon.hbu-ico-anim")).toHaveLength(3);
  });

  it("leaves the search icon outside the navigation glyph set", () => {
    const left = createDesktopLeftRail();
    document.body.append(left.root);
    const searchIcon = left.root.querySelector('a[data-route="search"] svg');
    expect(searchIcon).not.toBeNull();
    expect(left.root.querySelector('a[data-route="search"] .hbu-nav-icon')).toBeNull();
    const before = searchIcon?.outerHTML;
    // The parser expands self-closing tags, so compare the normalized markup.
    const expected = document.createElement("template");
    expected.innerHTML = COMMUNITY_SEARCH_ICONS.search;
    expect(before).toBe(expected.innerHTML);
    syncNavIconVariant(true);
    expect(searchIcon?.outerHTML).toBe(before);
  });
});
