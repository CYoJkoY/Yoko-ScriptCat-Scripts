import {
  applyRailEmojiCatalog,
} from "./rail";
import type { RailEmojiCatalog, RailEmojiCatalogPack, RailEmojiPack } from "./rail";

/** Current site bundle locations needed to rebuild the emoji registry. */
export interface RailEmojiAssetSources {
  scriptUrl: string;
  cssUrl: string;
}

const CATALOG_CACHE_KEY = "heybox-up.rail-emoji-catalog.v1";
const CATALOG_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const CATALOG_FAILURE_RETRY_MS = 30 * 1000;
const CATALOG_ASSET_TIMEOUT_MS = 15 * 1000;

const SCRIPT_SOURCE_PATTERN = /\/static\/heybox\/webapp\/@heybox-spa\/website\/app\/index-[^/?#]+\.js(?:[?#]|$)/i;
const CSS_SOURCE_PATTERN = /\/static\/heybox\/webapp\/@heybox-spa\/website\/app\/index-[^/?#]+\.css(?:[?#]|$)/i;

let catalogPromise: Promise<Partial<RailEmojiCatalog> | null> | null = null;
let lastCatalogFailureAt = 0;

function absoluteAssetUrl(value: string): string {
  const raw = value.trim();
  if (raw === "") return "";
  try {
    const url = new URL(raw, document.baseURI);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

/** Finds the same entry bundle the running site is using, not a pinned hash. */
export function discoverRailEmojiAssetSources(root: ParentNode = document): RailEmojiAssetSources | null {
  let scriptUrl = "";
  let cssUrl = "";
  for (const element of Array.from(root.querySelectorAll("script[src], link[href]"))) {
    if (element instanceof HTMLScriptElement) {
      const candidate = absoluteAssetUrl(element.src);
      if (scriptUrl === "" && SCRIPT_SOURCE_PATTERN.test(candidate)) scriptUrl = candidate;
    } else if (element instanceof HTMLLinkElement) {
      const candidate = absoluteAssetUrl(element.href);
      if (cssUrl === "" && CSS_SOURCE_PATTERN.test(candidate)) cssUrl = candidate;
    }
  }
  return scriptUrl === "" || cssUrl === "" ? null : { scriptUrl, cssUrl };
}

function decodeJsText(value: string): string {
  try {
    return JSON.parse('"' + value + '"') as string;
  } catch {
    return value;
  }
}

/** The bundle exposes its registry as an array plus a typed list reference. */
function readBundleList(source: string, pack: "cube" | "heygirl"): string | null {
  const marker = 'type:"' + pack + '",list:';
  let cursor = source.indexOf(marker);
  while (cursor !== -1) {
    const reference = /^([A-Za-z_$][\w$]*)/.exec(source.slice(cursor + marker.length));
    if (reference !== null) {
      const declaration = new RegExp(
        "(?:const|let|var)\\s+" + reference[1].replace(/[$]/g, "\\$") + "\\s*=\\s*\\[",
      );
      const match = declaration.exec(source);
      if (match !== null) {
        const arrayStart = source.indexOf("[", match.index);
        const arrayEnd = source.indexOf("];", arrayStart);
        if (arrayStart !== -1 && arrayEnd !== -1) {
          return source.slice(arrayStart + 1, arrayEnd);
        }
      }
    }
    cursor = source.indexOf(marker, cursor + marker.length);
  }
  return null;
}

function readBundleEntries(list: string | null): { name: string; id: string; unicode?: string }[] {
  if (list === null) return [];
  const entries: { name: string; id: string; unicode?: string }[] = [];
  const seen = new Set<string>();
  const pattern = /\{\s*name\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*id\s*:\s*"?([0-9]+)"?\s*(?:,\s*unicode\s*:\s*"((?:\\.|[^"\\])*)"\s*)?\s*\}/g;
  for (let match = pattern.exec(list); match !== null; match = pattern.exec(list)) {
    const id = String(Number(match[2]));
    if (id === "0" || seen.has(id)) continue;
    const unicode = match[3] === undefined ? undefined : decodeJsText(match[3]).toLowerCase();
    if (unicode !== undefined && !/^[a-f0-9]+$/.test(unicode)) continue;
    seen.add(id);
    entries.push({
      name: decodeJsText(match[1]),
      id: id,
      ...(unicode === undefined ? {} : { unicode: unicode }),
    });
  }
  return entries;
}

function readCssPack(css: string, pack: "cube" | "heygirl"): { sprite: string; columns: number; rows: number } | null {
  const rule = css.match(new RegExp("\\.hb-emoji-" + pack + "\\s*\\{([^}]*)\\}", "i"));
  if (rule === null) return null;
  const body = rule[1];
  const image = body.match(/background-image\s*:\s*url\(\s*(['"]?)([^)'"]+)\1\s*\)/i);
  if (image === null) return null;
  const sprite = absoluteAssetUrl(image[2]).replace(/^http:\/\//i, "https://");
  if (sprite === "") return null;
  const size = body.match(/background-size\s*:\s*([0-9.]+)px\s+([0-9.]+)px/i);
  if (size === null) return null;
  const cell = css.match(new RegExp("--" + pack + "-length\\s*:\\s*([0-9.]+)px", "i"));
  const unit = cell === null ? 20 : Number(cell[1]);
  const columns = Number(size[1]) / unit;
  const rows = Number(size[2]) / unit;
  return Number.isInteger(columns) && columns > 0 && Number.isInteger(rows) && rows > 0
    ? { sprite, columns, rows }
    : null;
}

/** Pure parser, kept separate from DOM discovery and network access. */
export function parseRailEmojiCatalogFromSources(script: string, css: string): Partial<RailEmojiCatalog> | null {
  const writableCatalog: { -readonly [Pack in RailEmojiPack]?: RailEmojiCatalogPack } = {};
  for (const pack of ["cube", "heygirl"] as const) {
    const entries = readBundleEntries(readBundleList(script, pack));
    const sprite = readCssPack(css, pack);
    if (entries.length > 0 && sprite !== null) {
      writableCatalog[pack] = { ...sprite, entries };
    }
  }
  return writableCatalog["cube"] !== undefined || writableCatalog["heygirl"] !== undefined ? writableCatalog : null;
}

function readCache(): { savedAt: number; catalog: Partial<RailEmojiCatalog> } | null {
  try {
    const raw = localStorage.getItem(CATALOG_CACHE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as { savedAt?: unknown; catalog?: unknown };
    if (typeof parsed.savedAt !== "number" || !Number.isFinite(parsed.savedAt) || typeof parsed.catalog !== "object" || parsed.catalog === null) return null;
    return { savedAt: parsed.savedAt, catalog: parsed.catalog as Partial<RailEmojiCatalog> };
  } catch {
    return null;
  }
}

function writeCache(catalog: Partial<RailEmojiCatalog>): void {
  try {
    localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({ version: 1, savedAt: Date.now(), catalog }));
  } catch {
    // Storage is an optimization; catalog refresh must not block the composer.
  }
}

async function fetchAsset(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), CATALOG_ASSET_TIMEOUT_MS);
  try {
    const response = await fetch(url, { credentials: "omit", signal: controller.signal });
    if (!response.ok) throw new Error(String(response.status));
    return await response.text();
  } finally {
    window.clearTimeout(timeout);
  }
}

async function loadCatalog(sources: RailEmojiAssetSources): Promise<Partial<RailEmojiCatalog> | null> {
  const [script, css] = await Promise.all([fetchAsset(sources.scriptUrl), fetchAsset(sources.cssUrl)]);
  const catalog = parseRailEmojiCatalogFromSources(script, css);
  if (catalog === null || !applyRailEmojiCatalog(catalog)) return null;
  writeCache(catalog);
  return catalog;
}

/** Refreshes once; failures retry only after a short delay. */
export async function loadRailEmojiCatalog(sources?: RailEmojiAssetSources): Promise<Partial<RailEmojiCatalog> | null> {
  const cache = readCache();
  if (cache !== null && Date.now() - cache.savedAt < CATALOG_CACHE_TTL_MS && applyRailEmojiCatalog(cache.catalog)) {
    return cache.catalog;
  }
  if (catalogPromise !== null) return catalogPromise;
  if (Date.now() - lastCatalogFailureAt < CATALOG_FAILURE_RETRY_MS) return null;
  const discovered = sources ?? discoverRailEmojiAssetSources();
  if (discovered === null) {
    lastCatalogFailureAt = Date.now();
    return null;
  }
  catalogPromise = loadCatalog(discovered).catch(() => {
    lastCatalogFailureAt = Date.now();
    return null;
  }).finally(() => {
    catalogPromise = null;
  });
  return catalogPromise;
}

export function resetRailEmojiCatalogCache(): void {
  catalogPromise = null;
  lastCatalogFailureAt = 0;
  try {
    localStorage.removeItem(CATALOG_CACHE_KEY);
  } catch {
    // Tests may have disabled storage; a reset still needs to succeed.
  }
}

