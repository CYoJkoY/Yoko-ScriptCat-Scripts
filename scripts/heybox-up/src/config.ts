/**
 * Stable HeyBox Up preferences. Every key and default matches the released
 * single-file script, so an update keeps existing browser state intact.
 */
export const STORAGE_KEYS = Object.freeze({
  hideCy: "heybox-up.hideCy.v1",
  commentPreview: "heybox-up.commentPreview.v1",
  navMotion: "heybox-up.navMotion.v1",
  reader: "heybox-up.reader.v1",
  feedWidth: "heybox-up.feedWidth.v1",
  readerLineHeight: "heybox-up.readerLineHeight.v1",
  theme: "heybox-up.theme.v1",
});

export const PREFERENCE_DEFAULTS = Object.freeze({
  hideCy: false,
  commentPreview: true,
  navMotion: true,
  reader: true,
  feedWidth: 56,
  readerLineHeight: 1.7,
});

export const FEED_WIDTH_MIN = 40;
export const FEED_WIDTH_MAX = 76;
export const FEED_WIDTH_STEP = 1;
export const READER_LINE_HEIGHT_MIN = 1;
export const READER_LINE_HEIGHT_MAX = 2.2;
export const READER_LINE_HEIGHT_STEP = 0.05;
export const READER_LINE_HEIGHT_DEFAULT = 1.7;
export const REQUEST_TIMEOUT_MS = 15000;

export const PAGE_SYNC_INTERVAL_MS = 120;
export const PAGE_ROUTE = Object.freeze({
  ARTICLE: "article",
  FAVOUR: "favour",
  FEED: "feed",
  TOPIC: "topic",
  CREATOR: "creator",
  OTHER: "other",
} as const);

export type PageRoute = (typeof PAGE_ROUTE)[keyof typeof PAGE_ROUTE];
export type PageMutationRegion = "feed" | "article" | "topic" | "favour" | "creator" | "chrome";

export const PAGE_ROUTE_RULES: readonly { readonly id: PageRoute; readonly pattern: RegExp }[] = Object.freeze([
  { id: PAGE_ROUTE.ARTICLE, pattern: /^\/app\/bbs\/link\/\d+(?:\/|$)/ },
  { id: PAGE_ROUTE.FAVOUR, pattern: /^\/app\/user\/favour\/content(?:\/|$)/ },
  { id: PAGE_ROUTE.FEED, pattern: /^\/(?:$|app\/bbs\/home(?:\/|$))/ },
  { id: PAGE_ROUTE.TOPIC, pattern: /^\/app\/topic\/link\/\d+(?:\/|$)/ },
  { id: PAGE_ROUTE.CREATOR, pattern: /^\/creator(?:\/|$)/ },
]);

export const PAGE_MUTATION_REGION_SELECTORS: Readonly<Record<PageMutationRegion, string>> = Object.freeze({
  feed: "#page-bbs-community, #heybox-up-comment-rail",
  article: "#page-bbs-link, #heybox-up-reader",
  topic: "#page-topic-link, #heybox-up-community-search",
  favour: "#page-user-favour, .user-favour, #heybox-up-favour",
  creator: "#page-creator-content-management, #page-creator-content-management-detail",
  chrome: ".nav, .nav-actions, #heybox-up-nav, #heybox-up-theme-entry",
});
