import {
  PAGE_MUTATION_REGION_SELECTORS,
  PAGE_ROUTE,
  PAGE_ROUTE_RULES,
  PAGE_SYNC_INTERVAL_MS,
  type PageMutationRegion,
  type PageRoute,
} from "../config";

/**
 * Route detection, the shared debounced sync scheduler, and the style
 * injection helper. Every UI module registers one task here instead of
 * running its own MutationObserver.
 */

export interface PageSyncEntry {
  intervalMs: number;
  lastRun: number;
  lastRegionRevision: number;
  pending: boolean;
  readonly routes: ReadonlySet<PageRoute> | null;
  readonly region: PageMutationRegion | null;
}

export type PageSyncTask = () => void;

export const pageSyncTasks: Map<PageSyncTask, PageSyncEntry> = new Map();

export const pageMutationRevisions: Record<PageMutationRegion, number> = {
  feed: 0,
  article: 0,
  topic: 0,
  favour: 0,
  creator: 0,
  chrome: 0,
};

export const PAGE_MUTATION_REGION_ENTRIES: readonly (readonly [PageMutationRegion, string])[] = [
  ["feed", PAGE_MUTATION_REGION_SELECTORS.feed],
  ["article", PAGE_MUTATION_REGION_SELECTORS.article],
  ["topic", PAGE_MUTATION_REGION_SELECTORS.topic],
  ["favour", PAGE_MUTATION_REGION_SELECTORS.favour],
  ["creator", PAGE_MUTATION_REGION_SELECTORS.creator],
  ["chrome", PAGE_MUTATION_REGION_SELECTORS.chrome],
];

export const PAGE_MUTATION_REGION_COMBINED = PAGE_MUTATION_REGION_ENTRIES.map((entry) => entry[1]).join(", ");

export const PAGE_MUTATION_IGNORE_SELECTOR =
  '[id^="heybox-up-"], input, textarea, select, [contenteditable]:not([contenteditable="false"])';

export const EMBEDDED_MEDIA_SELECTOR = "iframe, video, audio, embed, object";

export const EMBEDDED_MEDIA_WRAPPER_SELECTOR = "div.iframe";

export const EMBEDDED_MEDIA_OBSERVED_SELECTOR =
  EMBEDDED_MEDIA_SELECTOR + ", " + EMBEDDED_MEDIA_WRAPPER_SELECTOR;

export const EMBEDDED_MEDIA_SOURCE_ATTRIBUTES: readonly string[] = ["src", "srcdoc", "data"];

export const EMBEDDED_MEDIA_ATTRIBUTES: readonly string[] = [
  ...EMBEDDED_MEDIA_SOURCE_ATTRIBUTES,
  "width",
  "height",
  "hidden",
  "style",
];

export const ARTICLE_LAYOUT_OBSERVED_SELECTOR = "#page-bbs-link";

export const PAGE_SYNC_ATTRIBUTE_FILTER: readonly string[] = [
  ...EMBEDDED_MEDIA_ATTRIBUTES,
  "class",
  "data-src",
  "data-original",
  "poster",
];

export let pageSyncTimer = 0;

export let pageSyncLastRun = 0;

export let pageSyncRoute: PageRoute = readPageRoute();

export let pageSyncForceAll = false;

export function readPageRoute(pathname: string = location.pathname): PageRoute {
  for (const rule of PAGE_ROUTE_RULES) {
    if (rule.pattern.test(pathname)) return rule.id;
  }
  return PAGE_ROUTE.OTHER;
}

export function registerPageSync(
  task: PageSyncTask,
  intervalMs = 0,
  routes: readonly PageRoute[] | null = null,
  region: PageMutationRegion | null = null,
): void {
  pageSyncTasks.set(task, {
    intervalMs: Math.max(0, Number(intervalMs) || 0),
    lastRun: 0,
    lastRegionRevision: -1,
    pending: false,
    routes: Array.isArray(routes) ? new Set(routes) : null,
    region: region,
  });
}

export function runPageSyncTasks(): void {
  pageSyncTimer = 0;
  const now = performance.now();
  const route = readPageRoute();
  const routeChanged = route !== pageSyncRoute;
  const forceAll = routeChanged || pageSyncForceAll;
  pageSyncForceAll = false;
  pageSyncLastRun = now;
  pageSyncRoute = route;
  for (const [task, entry] of pageSyncTasks) {
    const routeMatches = entry.routes === null || entry.routes.has(route);
    // Route changes run every task once so the previous route can tear down its UI.
    if (!routeMatches && !forceAll) {
      entry.pending = false;
      continue;
    }
    const regionRevision = entry.region === null ? -1 : pageMutationRevisions[entry.region];
    if (!forceAll && entry.region !== null && regionRevision === entry.lastRegionRevision) continue;
    if (!forceAll && now - entry.lastRun < entry.intervalMs) {
      entry.pending = true;
      continue;
    }
    entry.lastRun = now;
    entry.lastRegionRevision = regionRevision;
    entry.pending = false;
    try {
      task();
    } catch (error) {
      console.error("[HeyBox Up] DOM sync failed", error);
    }
  }
  let nextDelay = Infinity;
  for (const [, entry] of pageSyncTasks) {
    if (!entry.pending) continue;
    nextDelay = Math.min(nextDelay, Math.max(0, entry.lastRun + entry.intervalMs - now));
  }
  if (nextDelay !== Infinity) {
    pageSyncTimer = window.setTimeout(runPageSyncTasks, nextDelay);
  }
}

export function schedulePageSync(): void {
  if (pageSyncTimer !== 0) return;
  const elapsed = performance.now() - pageSyncLastRun;
  pageSyncTimer = window.setTimeout(runPageSyncTasks, Math.max(0, PAGE_SYNC_INTERVAL_MS - elapsed));
}

export function scheduleForcedPageSync(): void {
  pageSyncForceAll = true;
  schedulePageSync();
}

export function bumpRegionsForRoot(root: Element): void {
  for (const [region, selector] of PAGE_MUTATION_REGION_ENTRIES) {
    if (root.matches(selector)) pageMutationRevisions[region] += 1;
  }
}

export function notePageMutationRegions(record: MutationRecord): boolean {
  const targetNode: Node = record.target;
  const target =
    targetNode.nodeType === Node.ELEMENT_NODE
      ? targetNode
      : targetNode.parentElement;
  if (target === null || !(target instanceof Element)) return false;
  const closestTracked = target.closest(
    PAGE_MUTATION_REGION_COMBINED + ", " + PAGE_MUTATION_IGNORE_SELECTOR,
  );
  if (closestTracked !== null && closestTracked.matches(PAGE_MUTATION_IGNORE_SELECTOR)) return false;
  let touched = false;
  if (closestTracked !== null) {
    bumpRegionsForRoot(closestTracked);
    touched = true;
  }
  const changedNodes: Node[] = [];
  if (record.type === "childList") {
    for (const node of record.addedNodes) changedNodes.push(node);
    for (const node of record.removedNodes) changedNodes.push(node);
  }
  let removedScriptUi = false;
  if (record.type === "childList") {
    for (const node of record.removedNodes) {
      if (
        node instanceof Element &&
        (node.id.startsWith("heybox-up-") || node.querySelector('[id^="heybox-up-"]') !== null)
      ) {
        removedScriptUi = true;
        break;
      }
    }
  }
  if (removedScriptUi) {
    for (const region of Object.keys(pageMutationRevisions)) {
      // Object.keys() of the typed record yields its own keys, so each is a region.
      pageMutationRevisions[region as PageMutationRegion] += 1;
    }
    return true;
  }
  for (const node of changedNodes) {
    if (!(node instanceof Element)) continue;
    if (node.matches(PAGE_MUTATION_REGION_COMBINED)) {
      bumpRegionsForRoot(node);
      touched = true;
    }
    for (const root of node.querySelectorAll(PAGE_MUTATION_REGION_COMBINED)) {
      bumpRegionsForRoot(root);
      touched = true;
    }
  }
  return touched;
}

export function isObservedAttributeTarget(node: unknown): boolean {
  if (!(node instanceof Element)) return false;
  if (node.matches(EMBEDDED_MEDIA_OBSERVED_SELECTOR)) return true;
  return node.closest(ARTICLE_LAYOUT_OBSERVED_SELECTOR) !== null;
}

export function startPageSyncObserver(): void {
  if (!document.body || !document.body.isConnected) return;
  new MutationObserver((records) => {
    if (notePageSyncedRecords(records)) schedulePageSync();
  }).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...PAGE_SYNC_ATTRIBUTE_FILTER],
  });
  window.addEventListener("popstate", scheduleForcedPageSync);
  window.addEventListener("hashchange", scheduleForcedPageSync);
}

export function notePageSyncedRecords(records: readonly MutationRecord[]): boolean {
  let relevant = false;
  for (const record of records) {
    if (record.type === "attributes" && !isObservedAttributeTarget(record.target)) continue;
    relevant = notePageMutationRegions(record) || relevant;
  }
  return relevant;
}

interface ConstructedStyleEntry {
  readonly sheet: CSSStyleSheet;
  css: string;
}

export const trackedStyleContent: WeakMap<HTMLElement, string> = new WeakMap();

export const constructedStylesById: Map<string, ConstructedStyleEntry> = new Map();

export let CAN_USE_CONSTRUCTED_STYLES = false;

try {
  const testSheet =
    typeof CSSStyleSheet === "function" && typeof CSSStyleSheet.prototype.replaceSync === "function"
      ? new CSSStyleSheet()
      : null;
  if (testSheet !== null && "adoptedStyleSheets" in document) {
    testSheet.replaceSync(":root{}");
    CAN_USE_CONSTRUCTED_STYLES = true;
  }
} catch {
  CAN_USE_CONSTRUCTED_STYLES = false;
}

export function ensureStyleElement(id: string, css: string, appendToEnd = false): void {
  if (CAN_USE_CONSTRUCTED_STYLES) {
    try {
      let entry = constructedStylesById.get(id);
      if (entry === undefined) {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(css);
        entry = { sheet: sheet, css: css };
        constructedStylesById.set(id, entry);
      } else if (entry.css !== css) {
        entry.sheet.replaceSync(css);
        entry.css = css;
      }
      const adopted: readonly CSSStyleSheet[] = document.adoptedStyleSheets;
      if (!adopted.includes(entry.sheet)) {
        document.adoptedStyleSheets = [...adopted, entry.sheet];
      }
      return;
    } catch {
      CAN_USE_CONSTRUCTED_STYLES = false;
    }
  }
  let style: HTMLElement | null = document.getElementById(id);
  if (style === null) {
    style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    trackedStyleContent.set(style, css);
  } else if (trackedStyleContent.get(style) !== css) {
    // A replaced or hot-updated style node must be repaired even after the first mount.
    style.textContent = css;
    trackedStyleContent.set(style, css);
  }
  const parent = document.head ?? document.documentElement;
  if (parent === null) return;
  if (style.parentNode !== parent || (appendToEnd && parent === document.head && parent.lastElementChild !== style)) {
    parent.append(style);
  }
}
