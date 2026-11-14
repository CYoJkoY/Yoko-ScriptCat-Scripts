import { PAGE_ROUTE, READER_LINE_HEIGHT_DEFAULT, READER_LINE_HEIGHT_MAX, READER_LINE_HEIGHT_MIN, READER_LINE_HEIGHT_STEP, STORAGE_KEYS } from "../config";
import { getHeyboxId, resolveHeyboxId } from "../core/account";
import { LINK_HREF_PREFIX } from "../core/cy";
import { FEED_CURSOR_KEY, FEED_DISCOVERY_PAGE_SIZE, FEED_DISCOVERY_PASS_PAGES, FEED_ORDER_KEY, FEED_ORDER_MAX, FEED_QUEUE_KEY, FEED_QUEUE_MAX, FEED_RECENT_KEY, FEED_SEEN_KEY, FEED_TITLE_MAX, PAGER_CSS, PAGER_ID, POST_HISTORY_CURSOR_KEY, POST_HISTORY_TITLES_KEY, POST_TRAIL_KEY, buildFeedStateKey, computeFeedDiscoveryOffset, hasDiscoverableNext, mergeFeedOrder, mergeFeedQueue, mergeFeedSeen, mergeRecentMetadata, normalizeFeedCandidate, normalizeFeedDiscoveryLinks, normalizeFeedId, normalizeFeedText, requestFeedDiscoveryPage, selectNextFeedCandidate } from "../core/feed";
import { EMBEDDED_MEDIA_SELECTOR, EMBEDDED_MEDIA_SOURCE_ATTRIBUTES, ensureStyleElement, registerPageSync } from "../core/page-sync";
import { fetchWithTimeout, isAbortError, waitForDelay } from "../core/request";
import { asRecord } from "../core/json";
import { MAX_COMMENT_IMAGES, uploadCommentImage } from "../core/upload";
import { loadRailEmojiCatalog } from "./emoji-catalog";
import { parseCompactCount } from "./desktop";
import { normalizeFavourFolders, planFavourChanges, planHasFavourChange, readFavourFolderId, readFavourFolderPage, resolveFavourOutcome } from "./favour";
import type { FavourChangePlan, FavourFolder } from "./favour";
import { navigateToPath } from "./navigation";
import { COMMENT_CREATE_API_PATH, DELETE_COMMENT_API_PATH, RAIL_PAGE_CACHE_FRESH_MS, RAIL_PENDING_ID_PREFIX, applyRailEmojiStyle, attachRailPendingReplies, buildArticleCommentBody, buildDeleteCommentBody, buildRailCommentTree, clearRailPageCache, collectRailCommentIds, countRailThreadNodes, createApiParams, createCommentCreateQuery, createRailEmojiElement, createRailPendingReply, fetchRailPage, findRailFloorIdForComment, formatRailAge, holdRailPageCache, isOwnRailComment, mergeRailPageItems, pruneRailPendingReplies, railItemsHaveComment, railItemsHaveOwnFloorComment, railItemsHavePendingReply, readCreatedCommentId, readRailEmojiCatalogEntries, resolveCommentPageProgress, resolveMergedCommentProgress, resolveRailEmoji, resolveRailEmojiRef } from "./rail";
import type { ArticleReplyTargetPayload, RailComment, RailCommentEntry, RailCommentThreadNode, RailEmojiPack, RailLinkInfo, RailSegment } from "./rail";
import { readReaderCommentMarks, removeReaderCommentMark, saveReaderCommentMark } from "./comment-marks";
import type { ReaderCommentMark } from "./comment-marks";
import { SETTINGS_ICON, bindNumberInput, readerLineHeightInput, readerToggle, syncNumberInput } from "./theme";
import { HIDE_CY_EVENT, READER_EVENT, READER_HISTORY_LIMIT_EVENT, READER_TIMELINE_EVENT, localStore, parseReaderHistoryLimitInput, parseReaderLineHeightInput, readHideCyPreference, readReaderHistoryLimit, readReaderLineHeight, readReaderPreference, readReaderTimelinePreference, sessionStore, setReaderHistoryLimitPreference, setReaderLineHeightPreference, setReaderTimelinePreference } from "../state";
import type { FeedCandidate } from "../core/feed";
import { bindReaderInteraction, READER_VOTE_SELECTOR } from "./reader-interactions";

export interface RelatedPostLink {
  id: string;
  title: string;
}

export interface PostMeta {
  title: string;
  authorId: string;
  author: string;
  topicIds: string[];
  topics: string[];
}

export interface FeedCursorState {
  present: boolean;
  offset: number;
}

export interface PostPagerStatus {
  currentId: string;
  revision: number;
  prev: { id: string; title: string } | null;
  next: { id: string; title: string; source?: string } | null;
  /** Visit order, oldest first, with the entry the reader is looking at marked. */
  history: PostHistoryEntry[];
  discovering: boolean;
  error: string;
  exhausted: boolean;
}

export interface PostHistoryEntry {
  id: string;
  title: string;
  current: boolean;
}

/** One picture picked for a comment, kept until the composer is cleared. */
interface ComposerImage {
  readonly id: number;
  readonly name: string;
  readonly file: File;
  /** Blob preview URL; empty when the webview refuses blob URLs. */
  previewUrl: string;
  status: "pending" | "ready" | "failed";
  /** CDN preview URL returned once the upload settles. */
  url: string;
  /** Chinese reason shown on a failed upload. */
  error: string;
  /** Set when the reader removes or clears the picture mid-upload. */
  removed: boolean;
  controller: AbortController;
}

export interface PostNavigationController {
  sync(id: unknown, meta: unknown, links: unknown): void;
  readStatus(): PostPagerStatus;
  takeNext(): { id: string; title: string } | null;
  discover(): Promise<void>;
  subscribe(listener: (status: PostPagerStatus) => void): () => void;
}

export const READER_ID = "heybox-up-reader";

export const READER_STYLE_ID = "heybox-up-reader-style";

export const READER_CLASS = "heybox-up-reader";

export const READER_SOURCE_ROOT_SELECTOR = ":is(.hb-bbs-image-text, .hb-bbs-post, .hb-bbs__video)";

export const READER_SOURCE_BODY_SELECTOR = ".image-text__content, .post__content, .bbs-video__content-wrapper";

export const READER_SOURCE_TITLE_SELECTOR = ".section-title__content, .post__title, .image-text__title";

export const READER_SOURCE_HEADER_SELECTOR = ".image-text__header-image img, .post__header-image img";

export const READER_SOURCE_VIDEO_SELECTOR = ".bbs-video__video-container video, video.bbs-video__video-box, .hb-bbs__video video";

export const READER_MEDIA_EXCLUDE_SELECTOR = ".comment, .link-comment, .com-award-table, .com-game-card, .bbs-link__related-recommend, .bbs-video__user, .bbs-video__tags, .link-user, [class*='avatar'], [class*='icon'], [class*='emoji']";

export const READER_SCROLL_KEY = "heybox-up.readerScroll.v1:";

export const READER_RATIO_KEY = "heybox-up.readerRatio.v1:";

/** Reading positions expire after 30 days and keep at most 200 posts. */
const READER_POSITIONS_VERSION = 1;
const READER_POSITIONS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const READER_POSITIONS_MAX = 200;
const POST_ID_PATTERN = /^\d+$/;

/** Comment row actions that a list redraw must keep focused on their redrawn twin. */
const COMMENT_CONTROL_ATTRIBUTES = { reply: "replyId", remove: "deleteId", collapse: "threadId", expand: "threadId" } as const;
const COMMENT_CONTROL_CLASSES = {
  reply: "hbu-reader-comments-reply",
  remove: "hbu-reader-comments-delete",
  collapse: "hbu-reader-comments-collapse",
  expand: "hbu-reader-comments-expand",
} as const;
type CommentControlAction = keyof typeof COMMENT_CONTROL_ATTRIBUTES;

export const READER_PENDING_NOTICE_MS = 9000;

/** Ratio above which a picture counts as a long, scroll-through image. */
export const LIGHTBOX_LONG_IMAGE_RATIO = 1.6;

/** Long pictures open at about half the viewport width, never upscaled. */
export const LIGHTBOX_LONG_IMAGE_WIDTH_RATIO = 0.5;

export const LIGHTBOX_ZOOM_MAX = 2;

/**
 * Base width of the lightbox picture. Ordinary photos are contained inside the
 * viewport, while a long picture opens at roughly half the screen width so its
 * text and detail stay readable and the reader scrolls instead of squinting.
 */
export function computeLightboxBaseWidth(
  naturalWidth: number,
  naturalHeight: number,
  viewportWidth: number,
  viewportHeight: number = 0,
): number {
  const width = Number.isFinite(naturalWidth) && naturalWidth > 0 ? naturalWidth : 0;
  const height = Number.isFinite(naturalHeight) && naturalHeight > 0 ? naturalHeight : 0;
  const screenWidth = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 0;
  if (width === 0 || screenWidth === 0) return 0;
  const ratio = height === 0 ? 1 : height / width;
  if (ratio > LIGHTBOX_LONG_IMAGE_RATIO) {
    const target = Math.round(screenWidth * LIGHTBOX_LONG_IMAGE_WIDTH_RATIO);
    return Math.max(1, Math.min(width, target));
  }
  const byWidth = screenWidth * 0.92;
  const byHeight = height > 0 && Number.isFinite(viewportHeight) && viewportHeight > 0
    ? viewportHeight * 0.84 * (width / height)
    : byWidth;
  return Math.max(1, Math.round(Math.min(width, byWidth, byHeight)));
}

/** Width for one zoom step, capped so the picture never stretches past its source. */
export function computeLightboxZoomWidth(baseWidth: number, naturalWidth: number, step: number): number {
  const base = Number.isFinite(baseWidth) && baseWidth > 0 ? baseWidth : 0;
  if (base === 0) return 0;
  // Zoom may go past the source size a little for detail work, but the base
  // width is never exceeded by more than the zoom ceiling.
  const natural = Number.isFinite(naturalWidth) && naturalWidth > 0 ? naturalWidth : 0;
  const cap = Math.max(natural, base * 2.4);
  const scale = Math.pow(1.55, Math.max(0, Math.min(LIGHTBOX_ZOOM_MAX, Number.isFinite(step) ? step : 0)));
  return Math.round(Math.min(cap, base * scale));
}

/**
 * A create or delete can be answered by the tree endpoint with the payload it
 * built before the write landed, so the owning page is polled until the
 * caller expectation is met instead of trusting the first answer. The first
 * rounds are quick because the site usually echoes a reply within a second;
 * the later rounds back off so a slow endpoint still gets a few chances.
 */
export const COMMENT_VERIFY_DELAYS_MS: readonly number[] = [400, 600, 900, 1200, 1500];

export const COMMENT_VERIFY_ATTEMPTS = COMMENT_VERIFY_DELAYS_MS.length;

/**
 * A reply that has not been echoed by then stops saying "syncing", because a
 * spinner that runs for half a minute reads as a broken publish. The site can
 * still echo it much later, so a local row keeps a few sparse background
 * checks that swap it for the real one without going back to "syncing".
 */
export const COMMENT_VERIFY_GRACE_DELAYS_MS: readonly number[] = [6000, 12000, 20000];

/**
 * Every delay in the schedule needs a round that waits it out. Attempt 0 is the
 * first read right after the write, so the cap is the wait count plus one; the
 * extra round is what keeps the last sparse check from being computed after the
 * loop has already given up.
 */
export const COMMENT_VERIFY_WAIT_COUNT = COMMENT_VERIFY_DELAYS_MS.length + COMMENT_VERIFY_GRACE_DELAYS_MS.length;

export const COMMENT_VERIFY_MAX_ATTEMPTS = COMMENT_VERIFY_WAIT_COUNT + 1;

export const readCommentVerifyDelay = (attempt: number): number => {
  const index = Math.max(0, attempt - 1);
  if (index < COMMENT_VERIFY_DELAYS_MS.length) return COMMENT_VERIFY_DELAYS_MS[index];
  const graceIndex = Math.min(index - COMMENT_VERIFY_DELAYS_MS.length, COMMENT_VERIFY_GRACE_DELAYS_MS.length - 1);
  return COMMENT_VERIFY_GRACE_DELAYS_MS[graceIndex];
};

/**
 * Past this many nesting levels the branch stops adding indentation, so a deep
 * reply chain can never widen the comment sheet.
 */
export const RAIL_MAX_INDENT_DEPTH = 4;

export const READER_ICONS = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4.5 10.5 7.5-6 7.5 6"/><path d="M6.5 9.5V20h11V9.5"/><path d="M10 20v-5h4v5"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  like: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10.5v9H4.5a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z"/><path d="M7 11 10.6 4a2 2 0 0 1 3.8.9V9h4.1a2 2 0 0 1 2 2.4l-1.1 6.2a2.3 2.3 0 0 1-2.3 1.9H7"/></svg>',
  likeOn: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10.5v9H4.5a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z"/><path d="M7 11 10.6 4a2 2 0 0 1 3.8.9V9h4.1a2 2 0 0 1 2 2.4l-1.1 6.2a2.3 2.3 0 0 1-2.3 1.9H7"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8Z"/></svg>',
  starOn: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" aria-hidden="true"><path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8Z"/></svg>',
  comment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.3a7.4 7.4 0 0 1-7.5 7.3 8.4 8.4 0 0 1-2.8-.5L5 20l1.2-3.6A7 7 0 0 1 4.8 11a7.5 7.5 0 0 1 7.7-7.2A7.4 7.4 0 0 1 20 11.3Z"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="12" r="2.2"/><circle cx="17.5" cy="6" r="2.2"/><circle cx="17.5" cy="18" r="2.2"/><path d="m8.1 11 7.4-3.9M8.1 13l7.4 3.9"/></svg>',
  previous: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>',
  history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.2"/><path d="M12 7.6V12l3.1 1.9"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4.5V10h-5.4"/></svg>',
};

export const READER_CSS = `
  :root {
    --heybox-up-reading-line-height: 1.7;
    --hbu-reader-stage: 732px;
    /* Viewport-pinned history column on desktop. */
    --hbu-reader-history-width: clamp(240px, 22vw, 300px);
    /* Light preset. It is also the fallback set every other preset overrides. */
    --hbu-reader-bg: #e9eef3;
    --hbu-reader-page: #fff;
    --hbu-reader-subtle: #f1f4f7;
    --hbu-reader-ink: #14191e;
    --hbu-reader-ink-2: #3c444c;
    --hbu-reader-muted: #5f6b77;
    --hbu-reader-border: rgba(20, 25, 30, .12);
    --hbu-reader-glow: transparent;
    --hbu-reader-accent: #6f8db3;
    --hbu-reader-on-accent: #10161c;
    --hbu-reader-link: #4a678d;
    --hbu-reader-glass: #fff;
    --hbu-reader-glass-ink: #14191e;
    --hbu-reader-glass-border: rgba(20, 25, 30, .12);
    --hbu-reader-head: var(--hbu-reader-page);
    --hbu-reader-float: rgba(255, 255, 255, .98);
    --hbu-reader-float-ink: #14191e;
    --hbu-reader-float-border: rgba(20, 25, 30, .14);
    --hbu-reader-float-hover: rgba(20, 25, 30, .06);
    --hbu-reader-float-muted: #5a6572;
    --hbu-reader-active-like: #c0364e;
    --hbu-reader-active-favour: #8a6512;
    --hbu-reader-active-cy: #2f7a52;
    --hbu-reader-danger: #c0364e;
    --hbu-reader-scrim: rgba(20, 25, 30, .42);
    --hbu-reader-shadow: 0 8px 24px rgba(16, 24, 40, .12);
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] {
    --hbu-reader-bg: #080b0f;
    --hbu-reader-page: #12181f;
    --hbu-reader-subtle: #1b232c;
    --hbu-reader-ink: #e6edf5;
    --hbu-reader-ink-2: #b7c2ce;
    --hbu-reader-muted: #8b99a8;
    --hbu-reader-border: #2b3642;
    --hbu-reader-glow: transparent;
    --hbu-reader-accent: #8fb0cf;
    --hbu-reader-on-accent: #10161c;
    --hbu-reader-link: #8fb0cf;
    --hbu-reader-glass: #151c24;
    --hbu-reader-glass-ink: #e6edf5;
    --hbu-reader-glass-border: rgba(230, 237, 245, .14);
    --hbu-reader-head: var(--hbu-reader-page);
    --hbu-reader-float: rgba(21, 28, 36, .97);
    --hbu-reader-float-ink: #e6edf5;
    --hbu-reader-float-border: #2b3642;
    --hbu-reader-float-hover: rgba(230, 237, 245, .1);
    --hbu-reader-float-muted: #9dabb9;
    --hbu-reader-active-like: #ff8e9a;
    --hbu-reader-active-favour: #f0c56a;
    --hbu-reader-active-cy: #8fd0a8;
    --hbu-reader-danger: #ff8e9a;
    --hbu-reader-scrim: rgba(2, 4, 7, .62);
    --hbu-reader-shadow: 0 8px 24px rgba(0, 0, 0, .28);
  }
  :root.heybox-up-theme[data-heybox-up-theme="oled"] {
    --hbu-reader-bg: #000;
    --hbu-reader-page: #090909;
    --hbu-reader-subtle: #141414;
    --hbu-reader-border: #242424;
    --hbu-reader-glow: transparent;
    --hbu-reader-accent: #a8c0d8;
    --hbu-reader-on-accent: #05070a;
    --hbu-reader-link: #a8c0d8;
    --hbu-reader-glass: #101010;
    --hbu-reader-glass-border: rgba(230, 237, 245, .14);
    --hbu-reader-head: var(--hbu-reader-page);
    --hbu-reader-float: rgba(12, 12, 12, .97);
    --hbu-reader-float-ink: #e6edf5;
    --hbu-reader-float-border: #242424;
    --hbu-reader-float-hover: rgba(230, 237, 245, .1);
    --hbu-reader-float-muted: #9dabb9;
    --hbu-reader-active-like: #ff8e9a;
    --hbu-reader-active-favour: #f0c56a;
    --hbu-reader-active-cy: #8fd0a8;
    --hbu-reader-danger: #ff8e9a;
    --hbu-reader-scrim: rgba(0, 0, 0, .74);
    --hbu-reader-shadow: 0 8px 24px rgba(0, 0, 0, .55);
  }
  :root.heybox-up-theme[data-heybox-up-theme="paper"] {
    --hbu-reader-bg: #e7dfd0;
    --hbu-reader-page: #faf5ea;
    --hbu-reader-subtle: #f2eadb;
    --hbu-reader-ink: #332b21;
    --hbu-reader-ink-2: #5b5042;
    --hbu-reader-muted: #726451;
    --hbu-reader-border: #ddd0bc;
    --hbu-reader-glow: transparent;
    --hbu-reader-accent: #7b6244;
    --hbu-reader-on-accent: #fffdf7;
    --hbu-reader-link: #7b6244;
    --hbu-reader-glass: #faf5ea;
    --hbu-reader-glass-ink: #332b21;
    --hbu-reader-glass-border: rgba(51, 43, 33, .16);
    --hbu-reader-head: var(--hbu-reader-page);
    --hbu-reader-float: rgba(255, 253, 247, .98);
    --hbu-reader-float-ink: #332b21;
    --hbu-reader-float-border: #ddd0bc;
    --hbu-reader-float-hover: rgba(51, 43, 33, .07);
    --hbu-reader-float-muted: #6a5d4b;
    --hbu-reader-active-like: #b23a4c;
    --hbu-reader-active-favour: #7d5a16;
    --hbu-reader-active-cy: #2e6d4c;
    --hbu-reader-danger: #b23a4c;
    --hbu-reader-scrim: rgba(51, 43, 33, .46);
    --hbu-reader-shadow: 0 6px 18px rgba(51, 43, 33, .12);
  }
  :root.heybox-up-theme[data-heybox-up-theme="mist"] {
    --hbu-reader-bg: #dde8ea;
    --hbu-reader-page: #f7fbfb;
    --hbu-reader-subtle: #eaf2f3;
    --hbu-reader-ink: #1d3338;
    --hbu-reader-ink-2: #405a60;
    --hbu-reader-muted: #567076;
    --hbu-reader-border: #cbdcdf;
    --hbu-reader-glow: transparent;
    --hbu-reader-accent: #40646d;
    --hbu-reader-on-accent: #fff;
    --hbu-reader-link: #40646d;
    --hbu-reader-glass: #fbfdfd;
    --hbu-reader-glass-ink: #1d3338;
    --hbu-reader-glass-border: rgba(29, 51, 56, .16);
    --hbu-reader-head: var(--hbu-reader-page);
    --hbu-reader-float: rgba(252, 254, 254, .98);
    --hbu-reader-float-ink: #1d3338;
    --hbu-reader-float-border: #cbdcdf;
    --hbu-reader-float-hover: rgba(29, 51, 56, .07);
    --hbu-reader-float-muted: #4f686e;
    --hbu-reader-active-like: #b83c50;
    --hbu-reader-active-favour: #83601a;
    --hbu-reader-active-cy: #2b6f55;
    --hbu-reader-danger: #b83c50;
    --hbu-reader-scrim: rgba(29, 51, 56, .44);
    --hbu-reader-shadow: 0 6px 18px rgba(47, 74, 84, .12);
  }
  body.heybox-up-reader {
    overflow: hidden !important;
    background: var(--hbu-reader-bg) !important;
  }
  body.heybox-up-reader .nav,
  body.heybox-up-reader .hb-bbs-link__header {
    display: none !important;
  }
  /* The custom panel is the only comment surface in the reader; the native drawer
     and its reply box stay in the DOM but never paint. */
  body.heybox-up-reader #page-bbs-link .link-comment,
  body.heybox-up-reader .hb-bbs-link__reply-target { display: none !important; }
  body.heybox-up-reader #page-bbs-link {
    position: fixed !important;
    inset: 0 !important;
    z-index: 4000;
    display: flex !important;
    justify-content: center;
    width: 100% !important;
    height: 100% !important;
    background: var(--hbu-reader-bg) !important;
  }
  body.heybox-up-reader #page-bbs-link .content,
  body.heybox-up-reader #page-bbs-link .list,
  body.heybox-up-reader #page-bbs-link .hb-bbs-link,
  body.heybox-up-reader #page-bbs-link .hb-bbs-link__container,
  body.heybox-up-reader #page-bbs-link .hb-bbs-link__content {
    display: block !important;
    width: 100% !important;
    max-width: none !important;
    height: 100% !important;
    min-width: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }
  body.heybox-up-reader .hb-bbs-image-text,
  body.heybox-up-reader .hb-bbs-post,
  body.heybox-up-reader .hb-bbs__video { display: none !important; }
  body.heybox-up-reader .cpt-right-side.right { display: none !important; }
  /* The reader sits at 4001, so lift the site confirmation dialog above it. */
  body.heybox-up-reader .alert-container-wrapper .hb-cpt__alert-wrapper { z-index: 4100 !important; }
  #${READER_ID} {
    position: fixed;
    top: 0;
    left: 50%;
    z-index: 4001;
    width: min(calc(var(--hbu-reader-stage) + 80px), 100%);
    height: 100%;
    height: 100dvh;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) 46px;
    transform: translateX(-50%);
    background: var(--hbu-reader-page);
    color: var(--hbu-reader-ink);
    box-shadow: var(--hbu-reader-shadow);
    font: 16px/1.6 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
    -webkit-font-smoothing: antialiased;
    isolation: isolate;
  }
  #${READER_ID} *, #${READER_ID} *::before, #${READER_ID} *::after { box-sizing: border-box; }
  #${READER_ID} :is(button, a, [role="button"]) { -webkit-tap-highlight-color: transparent; }
  #${READER_ID} :is(button, a, [role="button"]):focus-visible {
    outline: 2px solid var(--hbu-reader-accent);
    outline-offset: 2px;
  }
  .hbu-reader-scroll {
    position: relative;
    grid-row: 2;
    width: calc(100% - 80px);
    /* The toolbar and progress bar own separate rows outside the scrollport. */
    height: 100%;
    min-height: 0;
    container-type: size;
    overflow-x: hidden;
    overflow-y: auto;
    margin-inline: auto;
    overscroll-behavior: contain;
    scrollbar-width: none;
    scroll-behavior: smooth;
  }
  .hbu-reader-scroll::-webkit-scrollbar { display: none; }
  .hbu-reader-page {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 0;
    padding: 44px 60px 72px;
    background: var(--hbu-reader-page);
  }
  /* 文本页不再用页内边距撑开段距：上下内边距归零，由段落自身的下间距形成
     统一的 .72em 节奏，跨页处也只保留一次段间距，避免 64px 的叠加空隙。 */
  .hbu-reader-page[data-kind="text"] { padding: 0 60px; }
  .hbu-reader-page[data-kind="heading"] { padding: 56px 60px 28px; }
  .hbu-reader-page[data-kind="hero"] { min-height: 100cqh; padding: 0; }
  .hbu-reader-page[data-kind="end"] { min-height: 100cqh; }
  .hbu-reader-page[data-kind="text"] .hbu-reader-copy,
  .hbu-reader-page[data-kind="heading"] .hbu-reader-copy {
    width: min(34em, 100%);
    font-size: 18px;
    line-height: var(--heybox-up-reading-line-height);
    color: var(--hbu-reader-ink);
    overflow-wrap: anywhere;
  }
  .hbu-reader-page[data-kind="text"] .hbu-reader-copy { white-space: normal; }
  .hbu-reader-page[data-kind="heading"] .hbu-reader-copy { white-space: pre-wrap; }
  .hbu-reader-page[data-kind="text"] .hbu-reader-copy p { margin: 0 0 .72em; }
  .hbu-reader-page[data-kind="heading"] { justify-content: center; }
  .hbu-reader-page[data-kind="heading"] .hbu-reader-copy {
    font-size: 27px;
    line-height: 1.42;
    font-weight: 700;
    letter-spacing: -.015em;
  }
  .hbu-reader-page[data-kind="rich"] {
    align-items: stretch;
    justify-content: flex-start;
    padding-top: 40px;
  }
  .hbu-reader-rich {
    width: 100%;
    min-width: 0;
    font-size: 18px;
    line-height: var(--heybox-up-reading-line-height);
    color: var(--hbu-reader-ink);
    white-space: normal !important;
    overflow-wrap: anywhere;
    word-break: normal;
  }
  .hbu-reader-rich img[class*="emoji"], .hbu-reader-rich [class*="emoji"] img { display: inline-block !important; width: 1.2em !important; height: 1.2em !important; max-width: 1.2em !important; max-height: 1.2em !important; object-fit: contain; vertical-align: -0.2em; }
  /* The cloned markup keeps a hard-coded 25px line height; cover body text only so
     cards and blockquotes keep their own styles. */
  .hbu-reader-rich :is(p, li, ul, ol, .line, .order-line, .text):not([class*="com-"], [class*="com-"] *):not(blockquote, blockquote *) {
    line-height: var(--heybox-up-reading-line-height) !important;
  }
  .hbu-reader-rich :is(h1, h2, h3, h4, h5, h6) { margin: 0 0 .7em; font-size: 22px; line-height: 1.45; }
  .hbu-reader-rich :is(p, .text) { margin: 0 0 .72em; }
  .hbu-reader-rich :is(ul, ol, pre, blockquote, table) { margin: 0 0 1em; }
  .hbu-reader-rich figure { margin: 2rem 0; }
  .hbu-reader-rich figure > img { display: block; height: auto; margin-inline: auto; }
  .hbu-reader-rich figcaption { margin: .5rem 0 0; color: var(--hbu-reader-muted); font-size: .875em; }
  .hbu-reader-rich :is(ul, ol) { padding-left: 1.35em; }
  .hbu-reader-rich li + li { margin-top: .45em; }
  .hbu-reader-rich blockquote {
    padding: 2px 0 2px 15px;
    border-left: 3px solid var(--hbu-reader-accent);
    color: var(--hbu-reader-ink-2);
    line-height: 1.8;
  }
  .hbu-reader-rich blockquote :is(p, .text) { line-height: 1.8 !important; }
  .hbu-reader-rich pre {
    padding: 14px 16px;
    border: 1px solid var(--hbu-reader-border);
    border-radius: 12px;
    background: var(--hbu-reader-subtle);
    overflow-x: auto;
    font: 13px/1.6 ui-monospace, SFMono-Regular, Consolas, monospace;
  }
  .hbu-reader-rich :is(img, video, .hb-cpt__image, .com-game-card, .com-album-card, .com-award-table-card, .com-chatroom-card, .com-league-card, .com-match-card, .com-mod-card, .com-sku-card, .com-wiki-card) { max-width: 100%; border-radius: 14px; }
  .hbu-reader-rich :is(.com-game-card, .com-album-card, .com-award-table-card, .com-chatroom-card, .com-league-card, .com-match-card, .com-mod-card, .com-sku-card, .com-wiki-card) {
    background: var(--hbu-reader-subtle) !important;
    border-color: var(--hbu-reader-border) !important;
    color: var(--hbu-reader-ink) !important;
  }
  .hbu-reader-rich :is(a, .prose-link) { color: var(--hbu-reader-link); }
  /* Cloned article nodes keep their original dark text colors on nested paragraphs and list lines.
     Cards and blockquotes keep their own colors, matching the line-height exclusion above. */
  .hbu-reader-rich :is(p, li, ol, ul, .line, .order-line, .text):not([class*="com-"], [class*="com-"] *):not(blockquote, blockquote *) {
    color: var(--hbu-reader-ink) !important;
  }
  .hbu-reader-rich blockquote,
  .hbu-reader-rich blockquote :is(p, .text) {
    color: var(--hbu-reader-ink-2) !important;
  }
  /* Body images share the article surface and use whitespace instead of a letterbox. */
  .hbu-reader-page[data-kind="media"] { justify-content: flex-start; padding: 2rem 20px; background: var(--hbu-reader-page); }
  .hbu-reader-page[data-kind="media"] + .hbu-reader-page[data-kind="media"] { padding-top: 0; }
  .hbu-reader-page[data-kind="text"]:has(+ .hbu-reader-page[data-kind="media"]) .hbu-reader-copy > :last-child { margin-bottom: 0; }
  .hbu-reader-page[data-kind="embed"] { justify-content: flex-start; padding: 2rem 20px; background: #05070a; }
  .hbu-reader-page[data-kind="video"] { justify-content: flex-start; padding: 2rem 20px; background: #05070a; }
  .hbu-reader-page[data-kind="notice"] { justify-content: center; padding: 32px 24px 72px; background: var(--hbu-reader-page); }
  .hbu-reader-notice {
    width: min(520px, 100%);
    padding: 22px;
    border: 1px solid var(--hbu-reader-border);
    border-radius: 16px;
    background: var(--hbu-reader-subtle);
    color: var(--hbu-reader-ink);
    text-align: center;
  }
  .hbu-reader-notice h2 { margin: 0 0 8px; font-size: 17px; line-height: 1.4; }
  .hbu-reader-notice p { margin: 0; color: var(--hbu-reader-muted); font-size: 13px; line-height: 1.6; }
  .hbu-reader-notice a {
    display: inline-flex;
    align-items: center;
    min-height: 36px;
    margin-top: 14px;
    padding: 0 14px;
    border-radius: 9px;
    background: var(--hbu-reader-accent);
    color: var(--hbu-reader-on-accent);
    font-size: 12px;
    font-weight: 650;
    text-decoration: none;
  }
  .hbu-reader-embed {
    width: min(100%, 960px);
    margin: auto;
    overflow: hidden;
    background: #05070a;
    border-radius: 12px;
  }
  .hbu-reader-embed > * { width: 100% !important; height: 100% !important; margin: 0 !important; border: 0 !important; border-radius: 0 !important; }
  .hbu-reader-embed :is(iframe, video, embed, object) { display: block !important; width: 100% !important; height: 100% !important; border: 0 !important; }
  .hbu-reader-embed audio { display: block !important; width: 100% !important; height: auto !important; min-height: 54px !important; border: 0 !important; }
  .hbu-reader-media {
    display: block;
    max-width: 100%;
    max-height: none;
    width: auto;
    height: auto;
    object-fit: contain;
    margin: 0 auto;
    border-radius: 12px;
    cursor: zoom-in;
  }
  .hbu-reader-video {
    display: block;
    width: min(100%, 1120px);
    max-height: calc(100cqh - 4rem);
    margin: auto;
    aspect-ratio: 16 / 9;
    border-radius: 12px;
    background: #000;
    object-fit: contain;
    box-shadow: 0 18px 50px rgba(0, 0, 0, .35);
  }
  .hbu-reader-page[data-kind="hero"] {
    padding: 0;
    justify-content: flex-start;
    align-items: stretch;
    min-height: 100cqh;
    background: var(--hbu-reader-page);
    color: var(--hbu-reader-ink);
  }
  /* The cover is a stage plus a pager band: the band always owns its own row under the photo. */
  .hbu-reader-cover {
    position: relative;
    inset: auto;
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 240px;
    overflow: hidden;
    background: #05070a;
  }
  .hbu-reader-cover-stage { position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden; }
  .hbu-reader-cover-glow { position: absolute; inset: -48px; background-position: center; background-size: cover; filter: blur(42px) brightness(.5); transform: scale(1.1); }
  .hbu-reader-cover img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    opacity: 0;
    transition: opacity .32s ease;
    pointer-events: none;
  }
  .hbu-reader-cover img[data-active="true"] { opacity: 1; pointer-events: auto; }
  .hbu-reader-page[data-kind="hero"][data-cover="none"] { justify-content: center; }
  .hbu-reader-cover-nav {
    position: absolute;
    top: 50%;
    z-index: 2;
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    margin-top: -20px;
    border: 1px solid rgba(255, 255, 255, .22);
    border-radius: 50%;
    background: rgba(8, 11, 15, .46);
    color: #fff;
    cursor: pointer;
  }
  .hbu-reader-cover-nav svg { width: 19px; height: 19px; }
  .hbu-reader-cover-nav[data-side="prev"] { left: 16px; }
  .hbu-reader-cover-nav[data-side="next"] { right: 16px; }
  .hbu-reader-cover-nav[hidden] { display: none; }
  /* A blank strip below the photo holds the pager, so a dot never covers the picture. */
  .hbu-reader-cover-progress {
    position: relative;
    z-index: 2;
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    height: 32px;
    background: #05070a;
  }
  .hbu-reader-cover-progress[hidden] { display: none; }
  .hbu-reader-cover-dots {
    display: flex;
    gap: 0;
    align-items: center;
    max-width: 100%;
    height: 100%;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .hbu-reader-cover-dots::-webkit-scrollbar { display: none; }
  .hbu-reader-cover-dots button { position: relative; width: 36px; height: 32px; padding: 0; border: 0; background: transparent; cursor: pointer; }
  .hbu-reader-cover-dots button::after { content: ""; position: absolute; top: 50%; right: 8px; left: 8px; height: 3px; margin-top: -1.5px; border-radius: 99px; background: rgba(255, 255, 255, .38); }
  .hbu-reader-cover-dots button[aria-current="true"]::after { background: #fff; }
  .hbu-reader-caption {
    position: relative;
    z-index: 2;
    flex: none;
    width: 100%;
    margin: 0;
    padding: 22px 60px 64px;
    border: 0;
    border-radius: 0;
    background: var(--hbu-reader-page);
    color: var(--hbu-reader-ink);
  }
  .hbu-reader-kicker { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; margin-bottom: 13px; color: var(--hbu-reader-muted); font-size: 12px; line-height: 1.4; }
  .hbu-reader-kicker span { padding: 3px 9px; border: 1px solid var(--hbu-reader-border); border-radius: 99px; background: var(--hbu-reader-subtle); }
  .hbu-reader-title { display: -webkit-box; margin: 0 0 12px; overflow: hidden; color: var(--hbu-reader-ink); font-size: 31px; line-height: 1.28; font-weight: 750; letter-spacing: -.02em; text-wrap: balance; -webkit-box-orient: vertical; -webkit-line-clamp: 4; }
  .hbu-reader-byline { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; color: var(--hbu-reader-muted); font-size: 13px; }
  .hbu-reader-byline b { color: var(--hbu-reader-ink); font-weight: 600; }
  .hbu-reader-page[data-kind="end"] { justify-content: center; gap: 22px; background: var(--hbu-reader-page); }
  .hbu-reader-end-card { width: min(440px, 100%); padding: 24px; border: 1px solid var(--hbu-reader-border); border-radius: 20px; background: var(--hbu-reader-subtle); }
  .hbu-reader-end-head { display: flex; gap: 12px; align-items: center; }
  .hbu-reader-end-head img { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; background: var(--hbu-reader-page); }
  .hbu-reader-end-name { min-width: 0; flex: 1 1 auto; }
  .hbu-reader-end-name b { display: block; font-size: 15px; }
  .hbu-reader-end-name span { color: var(--hbu-reader-muted); font-size: 12px; }
  .hbu-reader-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 20px 0 18px; }
  .hbu-reader-stats div { padding: 10px 6px; border-radius: 12px; background: var(--hbu-reader-page); text-align: center; }
  .hbu-reader-stats b { display: block; font-size: 17px; }
  .hbu-reader-stats span { color: var(--hbu-reader-muted); font-size: 11px; }
  .hbu-reader-tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .hbu-reader-tag { min-height: 36px; padding: 7px 12px; border: 1px solid var(--hbu-reader-border); border-radius: 99px; background: transparent; color: var(--hbu-reader-ink-2); font: inherit; font-size: 12px; cursor: pointer; }
  .hbu-reader-related { width: min(440px, 100%); }
  .hbu-reader-related h2 { margin: 0 0 8px; color: var(--hbu-reader-muted); font-size: 11px; font-weight: 600; letter-spacing: .08em; }
  .hbu-reader-related a { display: flex; gap: 10px; min-width: 0; min-height: 44px; padding: 11px 13px; overflow-wrap: anywhere; word-break: break-word; border: 1px solid var(--hbu-reader-border); border-radius: 12px; color: var(--hbu-reader-ink); font-size: 13px; line-height: 1.5; text-decoration: none; }
  .hbu-reader-related a + a { margin-top: 6px; }
  .hbu-reader-related a:hover { background: var(--hbu-reader-subtle); }
  .hbu-reader-end-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
  .hbu-reader-end-actions button { display: inline-flex; align-items: center; gap: 6px; min-height: 38px; padding: 8px 14px; border: 1px solid var(--hbu-reader-border); border-radius: 99px; background: transparent; color: var(--hbu-reader-ink); font: inherit; font-size: 13px; cursor: pointer; }
  .hbu-reader-end-actions button[data-home] { border-color: transparent; background: var(--hbu-reader-ink); color: var(--hbu-reader-page); font-weight: 650; }
  .hbu-reader-end-actions button:disabled { opacity: .42; cursor: default; }
  .hbu-reader-end-actions button svg { width: 15px; height: 15px; }
  .hbu-reader-end-status { margin: 0; color: var(--hbu-reader-muted); font-size: 12px; line-height: 1.5; text-align: center; }
  .hbu-reader-end-status[hidden] { display: none; }
  @media (max-height: 820px) {
    .hbu-reader-page[data-kind="end"] { gap: 12px; padding-top: 64px; padding-bottom: 64px; }
    .hbu-reader-page[data-kind="end"] .hbu-reader-related { display: none; }
    .hbu-reader-end-card { padding: 18px; }
    .hbu-reader-stats { margin: 14px 0 12px; }
  }
  @media (max-height: 520px) {
    .hbu-reader-page[data-kind="end"] { padding-top: 48px; padding-bottom: 40px; }
    .hbu-reader-page[data-kind="end"] .hbu-reader-stats { display: none; }
    .hbu-reader-end-head img { width: 40px; height: 40px; }
  }
  .hbu-reader-head { position: relative; grid-row: 1; width: calc(100% - 80px); margin-inline: auto; z-index: 12; display: flex; gap: 9px; align-items: center; padding: 14px 16px; padding-top: max(14px, env(safe-area-inset-top)); background: var(--hbu-reader-head); color: var(--hbu-reader-glass-ink); pointer-events: none; }
  .hbu-reader-head > * { pointer-events: auto; }
  .hbu-reader-round { display: grid; place-items: center; width: 40px; height: 40px; flex: none; padding: 0; border: 1px solid var(--hbu-reader-glass-border); border-radius: 50%; background: var(--hbu-reader-glass); color: var(--hbu-reader-glass-ink); cursor: pointer; }
  .hbu-reader-round svg { width: 19px; height: 19px; }
  .hbu-reader-home { display: inline-flex; align-items: center; gap: 6px; height: 40px; flex: none; padding: 0 13px 0 10px; border: 1px solid var(--hbu-reader-glass-border); border-radius: 99px; background: var(--hbu-reader-glass); color: var(--hbu-reader-glass-ink); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
  .hbu-reader-home svg { width: 17px; height: 17px; flex: none; }
  .hbu-reader-head-author { display: flex; gap: 7px; align-items: center; min-width: 0; max-width: 42%; padding: 4px 10px 4px 4px; border: 1px solid var(--hbu-reader-glass-border); border-radius: 99px; background: var(--hbu-reader-glass); color: var(--hbu-reader-glass-ink); text-decoration: none; }
  .hbu-reader-head-author img { width: 30px; height: 30px; flex: none; border-radius: 50%; object-fit: cover; background: var(--hbu-reader-subtle); }
  .hbu-reader-head-author span { min-width: 0; overflow: hidden; font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
  .hbu-reader-follow { min-width: 56px; height: 36px; padding: 0 13px; border: 0; border-radius: 99px; background: var(--hbu-reader-accent); color: var(--hbu-reader-on-accent); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
  .hbu-reader-follow[aria-pressed="true"] { background: var(--hbu-reader-float-hover); color: var(--hbu-reader-glass-ink); }
  .hbu-reader-head-spacer { flex: 1 1 auto; }
  .hbu-reader-rail { position: absolute; right: -32px; bottom: 118px; z-index: 11; display: flex; flex-direction: column; gap: 13px; align-items: center; }
  .hbu-reader-action { display: grid; place-items: center; width: 48px; min-height: 48px; padding: 4px 0; border: 1px solid var(--hbu-reader-glass-border); border-radius: 50%; background: var(--hbu-reader-glass); color: var(--hbu-reader-glass-ink); cursor: pointer; }
  .hbu-reader-action:hover { background: var(--hbu-reader-float-hover); }
  .hbu-reader-action svg { width: 21px; height: 21px; }
  .hbu-reader-action[aria-pressed="true"] { color: var(--hbu-reader-active-like); }
  .hbu-reader-action[data-action="favour"][aria-pressed="true"] { color: var(--hbu-reader-active-favour); }
  .hbu-reader-action[data-action="cy"][aria-pressed="true"] { color: var(--hbu-reader-active-cy); }
  .hbu-reader-action--cy { display: flex; flex-direction: column; gap: 1px; align-items: center; justify-content: center; }
  .hbu-reader-cy-label { font-size: 11px; font-weight: 700; line-height: 1; letter-spacing: .02em; }
  .hbu-reader-cy-count { font-size: 11px; font-weight: 700; line-height: 1; letter-spacing: .01em; opacity: .72; font-variant-numeric: tabular-nums; }
  .hbu-reader-rail-avatar { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
  .hbu-reader-favour-menu {
    position: absolute;
    right: calc(100% + 10px);
    bottom: 92px;
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 248px;
    max-width: calc(100vw - 84px);
    max-height: min(420px, 64dvh);
    padding: 10px;
    border: 1px solid var(--hbu-reader-float-border);
    border-radius: 14px;
    background: var(--hbu-reader-float);
    color: var(--hbu-reader-float-ink);
    box-shadow: var(--hbu-reader-shadow);
  }
  .hbu-reader-favour-menu[hidden] { display: none; }
  .hbu-reader-favour-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .hbu-reader-favour-head > span { font-size: 13px; font-weight: 600; }
  .hbu-reader-favour-close {
    width: 24px; height: 24px; padding: 0; border: 0; border-radius: 7px;
    background: transparent; color: inherit; font: inherit; font-size: 16px; line-height: 1; cursor: pointer;
  }
  .hbu-reader-favour-close:hover { background: var(--hbu-reader-float-hover); }
  .hbu-reader-favour-status { min-height: 16px; font-size: 12px; line-height: 1.5; color: var(--hbu-reader-float-muted); }
  .hbu-reader-favour-status[data-tone="error"] { color: var(--hbu-reader-danger); }
  .hbu-reader-favour-list { display: flex; flex-direction: column; gap: 2px; min-height: 0; overflow-y: auto; }
  .hbu-reader-favour-option { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; cursor: pointer; }
  .hbu-reader-favour-option:hover { background: var(--hbu-reader-float-hover); }
  .hbu-reader-favour-option input { flex: none; width: 14px; height: 14px; margin: 0; accent-color: var(--hbu-reader-accent); cursor: pointer; }
  .hbu-reader-favour-name { min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
  .hbu-reader-favour-tag {
    flex: none; padding: 1px 5px; border-radius: 5px;
    background: var(--hbu-reader-float-hover); color: var(--hbu-reader-float-muted); font-size: 10px;
  }
  .hbu-reader-favour-empty { padding: 8px; color: var(--hbu-reader-float-muted); font-size: 12px; line-height: 1.5; }
  .hbu-reader-favour-create { display: flex; gap: 6px; }
  .hbu-reader-favour-create-input {
    min-width: 0; flex: 1 1 auto; height: 30px; padding: 0 8px;
    border: 1px solid var(--hbu-reader-float-border); border-radius: 8px; outline: none;
    background: var(--hbu-reader-float-hover); color: inherit; font: inherit; font-size: 12px;
  }
  .hbu-reader-favour-create-input:focus { border-color: var(--hbu-reader-accent); }
  .hbu-reader-favour-create-btn, .hbu-reader-favour-save {
    height: 30px; padding: 0 12px; border: 1px solid var(--hbu-reader-float-border); border-radius: 8px;
    background: var(--hbu-reader-float-hover); color: inherit; font: inherit; font-size: 12px; cursor: pointer;
  }
  .hbu-reader-favour-create-btn:hover:not(:disabled) { border-color: var(--hbu-reader-accent); }
  .hbu-reader-favour-actions { display: flex; justify-content: flex-end; }
  .hbu-reader-favour-save { min-width: 64px; border-color: var(--hbu-reader-accent); background: var(--hbu-reader-accent); color: #fff; font-weight: 600; }
  .hbu-reader-favour-save:hover:not(:disabled) { filter: brightness(1.08); }
  .hbu-reader-favour-menu :is(button, input):disabled { cursor: default; opacity: .5; }
  .hbu-reader-spacing-menu { position: absolute; right: calc(100% + 10px); bottom: 0; z-index: 2; width: 248px; max-width: calc(100vw - 84px); padding: 10px; border: 1px solid var(--hbu-reader-float-border); border-radius: 14px; background: var(--hbu-reader-float); color: var(--hbu-reader-float-ink); box-shadow: var(--hbu-reader-shadow); backdrop-filter: blur(12px); }
  .hbu-reader-spacing-menu[hidden] { display: none; }
  .hbu-reader-spacing-label { margin-bottom: 8px; font-size: 12px; font-weight: 600; color: var(--hbu-reader-float-ink); }
  .hbu-reader-spacing-row { display: flex; gap: 7px; align-items: center; }
  .hbu-reader-spacing-row input { width: 70px; height: 32px; padding: 0 8px; border: 1px solid var(--hbu-reader-float-border); border-radius: 8px; outline: none; background: var(--hbu-reader-float-hover); color: inherit; font: inherit; font-size: 13px; font-variant-numeric: tabular-nums; }
  .hbu-reader-spacing-row input:focus { border-color: var(--hbu-reader-accent); }
  .hbu-reader-spacing-unit { font-size: 12px; color: var(--hbu-reader-float-muted); }
  .hbu-reader-spacing-reset { height: 32px; margin-left: auto; padding: 0 9px; border: 1px solid var(--hbu-reader-float-border); border-radius: 8px; background: transparent; color: inherit; font: inherit; font-size: 12px; cursor: pointer; }
  .hbu-reader-spacing-reset:hover { background: var(--hbu-reader-float-hover); }
  .hbu-reader-setting-section + .hbu-reader-setting-section { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--hbu-reader-float-border); }
  .hbu-reader-setting-line { display: flex; gap: 8px; align-items: center; min-height: 32px; color: var(--hbu-reader-float-muted); font-size: 12px; }
  .hbu-reader-setting-line input[type="number"] { width: 76px; height: 30px; margin-left: auto; padding: 0 7px; border: 1px solid var(--hbu-reader-float-border); border-radius: 8px; outline: none; background: var(--hbu-reader-float-hover); color: var(--hbu-reader-float-ink); font: inherit; font-variant-numeric: tabular-nums; }
  .hbu-reader-setting-line input[type="number"]:focus { border-color: var(--hbu-reader-accent); }
  .hbu-reader-setting-switch { display: flex; gap: 8px; align-items: center; width: 100%; min-height: 32px; padding: 0; border: 0; background: transparent; color: var(--hbu-reader-float-ink); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
  .hbu-reader-setting-switch::after { content: ""; width: 28px; height: 16px; margin-left: auto; border: 1px solid var(--hbu-reader-float-border); border-radius: 99px; background: var(--hbu-reader-float-hover); }
  .hbu-reader-setting-switch[aria-checked="true"]::after { border-color: var(--hbu-reader-accent); background: var(--hbu-reader-accent); }
  /* The timeline is a docked sidecar outside the centered article stage. */
  .hbu-reader-history-menu { position: absolute; top: 0; right: calc(-1 * var(--hbu-reader-history-width)); bottom: 0; z-index: 13; display: flex; flex-direction: column; gap: 10px; width: var(--hbu-reader-history-width); padding: 18px 16px 20px; overflow: hidden; border-left: 1px solid var(--hbu-reader-border); background: var(--hbu-reader-page); color: var(--hbu-reader-ink); }
  .hbu-reader-history-head { display: flex; flex: none; gap: 8px; align-items: flex-start; justify-content: space-between; }
  .hbu-reader-history-head-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .hbu-reader-history-close { display: none; place-items: center; width: 30px; height: 30px; flex: none; padding: 0; border: 1px solid var(--hbu-reader-border); border-radius: 50%; background: transparent; color: var(--hbu-reader-muted); cursor: pointer; }
  .hbu-reader-history-close:hover { border-color: var(--hbu-reader-accent); color: var(--hbu-reader-ink); }
  .hbu-reader-history-close svg { width: 15px; height: 15px; }
  .hbu-reader-history-label { font-size: 14px; font-weight: 700; color: var(--hbu-reader-ink); }
  .hbu-reader-history-meta { color: var(--hbu-reader-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  /* The feed-style rail on the right of the menu: a fixed-height track with one
     draggable thumb that prints the current position as x/n. */
  .hbu-reader-history-body { display: flex; flex: 1 1 auto; gap: 8px; align-items: stretch; min-height: 0; }
  .hbu-reader-history-rail { position: relative; flex: none; width: 52px; touch-action: none; user-select: none; }
  .hbu-reader-history-track { position: absolute; top: 8px; bottom: 8px; left: 50%; width: 2px; margin-left: -1px; border-radius: 99px; background: var(--hbu-reader-border); cursor: pointer; }
  .hbu-reader-history-tick { position: absolute; left: calc(50% - 2px); width: 4px; height: 4px; margin-top: -2px; border-radius: 50%; background: var(--hbu-reader-border); }
  .hbu-reader-history-thumb { position: absolute; top: 0; left: 50%; display: grid; place-items: center; min-width: 42px; height: 22px; padding: 0 6px; translate: -50% -50%; border: 1px solid var(--hbu-reader-accent); border-radius: 99px; background: var(--hbu-reader-page); color: var(--hbu-reader-accent); font: inherit; font-size: 11px; font-weight: 650; font-variant-numeric: tabular-nums; line-height: 1; cursor: grab; box-shadow: 0 6px 16px rgba(0, 0, 0, .18); touch-action: none; }
  .hbu-reader-history-thumb[data-dragging="true"] { cursor: grabbing; }
  .hbu-reader-history-thumb:focus-visible { outline: 2px solid var(--hbu-reader-accent); outline-offset: 2px; }
  .hbu-reader-history-thumb[data-preview="true"] { border-color: var(--hbu-reader-ink); color: var(--hbu-reader-ink); }
  .hbu-reader-history-peek { flex: none; min-height: 15px; overflow: hidden; color: var(--hbu-reader-muted); font-size: 11px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
  .hbu-reader-history-list { display: flex; flex: 1 1 auto; flex-direction: column; gap: 1px; min-height: 0; margin: 0; padding: 0 0 0 2px; overflow-y: auto; list-style: none; }
  .hbu-reader-history-item { position: relative; display: flex; padding-left: 13px; }
  /* A single continuous rule carries the visit order between rows. */
  .hbu-reader-history-item::before { content: ""; position: absolute; top: 0; bottom: 0; left: 3px; width: 1px; background: var(--hbu-reader-border); }
  .hbu-reader-history-item:first-child::before { top: 50%; }
  .hbu-reader-history-item:last-child::before { bottom: 50%; }
  .hbu-reader-history-dot { position: absolute; top: 50%; left: -13px; width: 7px; height: 7px; margin-top: -3.5px; margin-left: 3px; translate: -3px 0; border-radius: 50%; background: var(--hbu-reader-border); }
  .hbu-reader-history-row { position: relative; display: flex; gap: 6px; align-items: center; width: 100%; min-height: 36px; padding: 6px 8px; border: 0; border-radius: 8px; background: transparent; color: inherit; font: inherit; font-size: 12px; line-height: 1.5; text-align: left; cursor: pointer; }
  .hbu-reader-history-row:hover { background: var(--hbu-reader-subtle); }
  .hbu-reader-history-title { display: -webkit-box; min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: normal; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
  .hbu-reader-history-progress { flex: none; min-width: 30px; color: var(--hbu-reader-muted); font-size: 10px; font-variant-numeric: tabular-nums; text-align: right; }
  /* A hairline under each row turns the list into a visual reading record. */
  .hbu-reader-history-bar { position: absolute; right: 8px; bottom: 3px; left: 8px; height: 2px; overflow: hidden; border-radius: 2px; background: var(--hbu-reader-border); opacity: .55; }
  .hbu-reader-history-bar > i { display: block; height: 100%; border-radius: inherit; background: var(--hbu-reader-accent); }
  .hbu-reader-history-row[aria-current="true"] { background: var(--hbu-reader-subtle); color: var(--hbu-reader-accent); font-weight: 650; }
  .hbu-reader-history-row[data-preview="true"] { outline: 1px solid var(--hbu-reader-ink); outline-offset: -1px; background: var(--hbu-reader-subtle); }
  .hbu-reader-history-current { flex: none; padding: 2px 5px; border-radius: 5px; background: var(--hbu-reader-glow); color: var(--hbu-reader-accent); font-size: 10px; font-weight: 650; }
  .hbu-reader-history-item[data-current="true"] .hbu-reader-history-dot { background: var(--hbu-reader-accent); }
  .hbu-reader-history-empty { padding: 6px 8px; color: var(--hbu-reader-muted); font-size: 12px; line-height: 1.5; }
  .hbu-reader-cy-dialog { position: absolute; inset: 0; z-index: 60; display: grid; place-items: center; padding: 24px; background: var(--hbu-reader-scrim); backdrop-filter: blur(4px); }
  .hbu-reader-cy-dialog[hidden] { display: none; }
  .hbu-reader-cy-card { width: min(520px, 100%); padding: 20px; border: 1px solid var(--hbu-reader-border); border-radius: 20px; background: var(--hbu-reader-page); color: var(--hbu-reader-ink); box-shadow: var(--hbu-reader-shadow); }
  .hbu-reader-cy-head { display: flex; gap: 12px; align-items: center; justify-content: space-between; margin-bottom: 12px; font-size: 15px; font-weight: 700; }
  .hbu-reader-cy-close { display: grid; place-items: center; width: 36px; height: 36px; padding: 0; border: 1px solid var(--hbu-reader-border); border-radius: 50%; background: transparent; color: inherit; cursor: pointer; }
  .hbu-reader-cy-close svg { width: 16px; height: 16px; }
  .hbu-reader-cy-text { width: 100%; min-height: 132px; padding: 12px; resize: vertical; border: 1px solid var(--hbu-reader-border); border-radius: 12px; outline: none; background: var(--hbu-reader-subtle); color: inherit; font: inherit; line-height: 1.6; }
  .hbu-reader-cy-text:focus { border-color: var(--hbu-reader-accent); }
  .hbu-reader-cy-status { min-height: 18px; margin-top: 8px; color: var(--hbu-reader-muted); font-size: 12px; }
  .hbu-reader-cy-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
  .hbu-reader-cy-actions button { min-height: 36px; padding: 0 16px; border: 1px solid var(--hbu-reader-border); border-radius: 10px; background: transparent; color: inherit; font: inherit; font-size: 13px; cursor: pointer; }
  .hbu-reader-cy-actions button[data-primary] { border-color: transparent; background: var(--hbu-reader-accent); color: var(--hbu-reader-on-accent); font-weight: 650; }
  .hbu-reader-cy-actions button:disabled { opacity: .55; cursor: default; }
  .hbu-reader-action-count { display: block; margin-top: 2px; font-size: 10px; font-variant-numeric: tabular-nums; line-height: 1.2; }
  .hbu-reader-progress { position: relative; grid-row: 3; width: calc(100% - 80px); margin-inline: auto; z-index: 10; display: flex; gap: 10px; align-items: center; height: 46px; padding: 0 18px; background: linear-gradient(0deg, var(--hbu-reader-glass), transparent); color: var(--hbu-reader-glass-ink); font-size: 11px; font-variant-numeric: tabular-nums; pointer-events: none; }
  .hbu-reader-progress-bar { flex: 1 1 auto; height: 2px; overflow: hidden; border-radius: 99px; background: var(--hbu-reader-glass-border); }
  .hbu-reader-progress-bar i { display: block; width: 0; height: 100%; background: var(--hbu-reader-accent); transition: width .2s linear; }
  .hbu-reader-hint { color: var(--hbu-reader-float-muted); white-space: nowrap; }
  body.${READER_CLASS} #${PAGER_ID} { display: none !important; }
  .hbu-reader-comments-panel { position: fixed; inset: 0; z-index: 4065; display: flex; justify-content: flex-end; }
  .hbu-reader-comments-panel[hidden] { display: none; }
  .hbu-reader-comments-scrim { position: absolute; inset: 0; background: var(--hbu-reader-scrim); }
  .hbu-reader-comments-sheet { position: relative; z-index: 1; display: flex; flex-direction: column; width: min(440px, 100vw); height: 100%; height: 100dvh; border-left: 1px solid var(--hbu-reader-border); background: var(--hbu-reader-page); color: var(--hbu-reader-ink); font: 16px/1.6 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; box-shadow: var(--hbu-reader-shadow); }
  .hbu-reader-comments-panel :is(button, a):focus-visible { outline: 2px solid var(--hbu-reader-accent); outline-offset: 2px; }
  .hbu-reader-comments-head { display: flex; gap: 12px; align-items: center; padding: 18px 16px 13px; border-bottom: 1px solid var(--hbu-reader-border); }
  .hbu-reader-comments-heading { min-width: 0; flex: 1 1 auto; }
  .hbu-reader-comments-heading b { display: block; font-size: 15px; }
  .hbu-reader-comments-heading span { color: var(--hbu-reader-muted); font-size: 11px; }
  .hbu-reader-comments-close { display: grid; place-items: center; width: 36px; height: 36px; flex: none; padding: 0; border: 1px solid var(--hbu-reader-border); border-radius: 50%; background: transparent; color: inherit; cursor: pointer; }
  .hbu-reader-comments-close svg { width: 16px; height: 16px; }
  .hbu-reader-comments-refresh { display: grid; place-items: center; width: 36px; height: 36px; flex: none; padding: 0; border: 1px solid var(--hbu-reader-border); border-radius: 50%; background: transparent; color: var(--hbu-reader-muted); cursor: pointer; }
  .hbu-reader-comments-refresh:hover { color: inherit; border-color: var(--hbu-reader-accent); }
  .hbu-reader-comments-refresh:disabled { opacity: .55; cursor: default; }
  .hbu-reader-comments-refresh svg { width: 16px; height: 16px; }
  .hbu-reader-comments-refresh[data-busy="true"] svg { animation: hbu-reader-spin .9s linear infinite; }
  @keyframes hbu-reader-spin { to { transform: rotate(360deg); } }
  .hbu-reader-comments-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 4px 16px 18px; }
  .hbu-reader-comments-list { margin: 0; padding: 0; list-style: none; }
  .hbu-reader-comments-item { display: flex; gap: 10px; padding: 14px 0; border-bottom: 1px solid var(--hbu-reader-border); }
  .hbu-reader-comments-item:last-child { border-bottom: 0; }
  .hbu-reader-comments-avatar-link { display: block; width: 34px; height: 34px; flex: none; border-radius: 50%; }
  .hbu-reader-comments-avatar-link--child { width: 24px; height: 24px; }
  .hbu-reader-comments-avatar { display: block; width: 100%; height: 100%; border-radius: 50%; object-fit: cover; background: var(--hbu-reader-subtle); }
  .hbu-reader-comments-main { min-width: 0; flex: 1 1 auto; }
  .hbu-reader-comments-who { display: flex; flex-wrap: wrap; gap: 7px; align-items: baseline; }
  .hbu-reader-comments-name { font-size: 13px; font-weight: 650; }
  .hbu-reader-comments-name-link { color: inherit; text-decoration: none; }
  .hbu-reader-comments-name-link:hover .hbu-reader-comments-name { color: var(--hbu-reader-link); text-decoration: underline; }
  .hbu-reader-comments-time { color: var(--hbu-reader-muted); font-size: 11px; }
  .hbu-reader-comments-text { margin: 4px 0 0; font-size: 14px; line-height: 1.68; white-space: pre-wrap; overflow-wrap: anywhere; }
  .hbu-reader-comments-meta { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 5px; color: var(--hbu-reader-muted); font-size: 11px; }
  .hbu-reader-comments-reply { flex: none; padding: 0; border: 0; background: transparent; color: var(--hbu-reader-muted); font: inherit; font-size: 11px; cursor: pointer; }
  .hbu-reader-comments-reply:hover { color: var(--hbu-reader-link); }
  .hbu-reader-comments-delete { flex: none; padding: 0; border: 0; background: transparent; color: var(--hbu-reader-muted); font: inherit; font-size: 11px; cursor: pointer; }
  .hbu-reader-comments-delete:hover { color: var(--hbu-reader-danger); }
  .hbu-reader-comments-delete:disabled { opacity: .55; cursor: default; }
  .hbu-reader-comments-children { margin: 8px 0 0; padding: 0 0 0 13px; border-left: 1px solid var(--hbu-reader-border); list-style: none; }
  .hbu-reader-comments-child { position: relative; padding: 7px 0 0; }
  .hbu-reader-comments-child::before { content: ""; position: absolute; top: 19px; left: -13px; width: 11px; height: 1px; background: var(--hbu-reader-border); }
  .hbu-reader-comments-child:first-child { padding-top: 0; }
  .hbu-reader-comments-child:first-child::before { top: 12px; }
  .hbu-reader-comments-child-row { display: flex; gap: 8px; align-items: flex-start; }
  .hbu-reader-comments-child-main { min-width: 0; flex: 1 1 auto; }
  .hbu-reader-comments-reply-to { color: var(--hbu-reader-muted); font-size: 11px; }
  .hbu-reader-comments-child .hbu-reader-comments-text { margin-top: 2px; font-size: 13px; }
  .hbu-reader-comments-child .hbu-reader-comments-meta { margin-top: 3px; }
  .hbu-reader-comments-collapse { flex: none; padding: 0; border: 0; background: transparent; color: var(--hbu-reader-muted); font: inherit; font-size: 11px; cursor: pointer; }
  .hbu-reader-comments-collapse:hover { color: var(--hbu-reader-link); }
  /* A folded branch keeps a short indent and a dashed rule, so the row still
     shows that replies are stored underneath it. */
  .hbu-reader-comments-children--collapsed { padding-left: 6px; border-left-style: dashed; }
  .hbu-reader-comments-child--collapsed { padding-top: 0; }
  .hbu-reader-comments-child--collapsed::before { display: none; }
  .hbu-reader-comments-expand { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; padding: 2px 9px; border: 1px dashed var(--hbu-reader-border); border-radius: 999px; background: transparent; color: var(--hbu-reader-muted); font: inherit; font-size: 11px; cursor: pointer; }
  .hbu-reader-comments-expand::before { content: "+"; font-weight: 700; }
  .hbu-reader-comments-expand:hover { border-color: var(--hbu-reader-link); color: var(--hbu-reader-link); }
  .hbu-reader-comments-syncing { flex: none; color: var(--hbu-reader-muted); font-size: 11px; opacity: .85; }
  .hbu-reader-comments-syncing--settled { opacity: .7; }
  /* Past the depth cap the branch stops indenting, so a long reply chain can
     never push the sheet wider than its own column. */
  .hbu-reader-comments-children--deep { margin-top: 6px; padding-left: 0; border-left: 0; }
  .hbu-reader-comments-children--deep > .hbu-reader-comments-child::before { display: none; }
  .hbu-reader-comments-text .hbu-reader-comments-emoji { display: inline-block; width: 17px; height: 17px; margin: 0 1px; vertical-align: -3px; background-repeat: no-repeat; }
  .hbu-reader-comments-text img, .hbu-reader-comments-text .hbu-reader-comments-image { display: block; max-width: 100%; max-height: 180px; margin-top: 6px; border-radius: 8px; object-fit: contain; vertical-align: top; }
  /* Comment pictures open the shared viewer on click, matching article photos. */
  .hbu-reader-comments-text .hbu-reader-comments-image { cursor: zoom-in; }
  .hbu-reader-comments-status { display: grid; justify-items: center; gap: 10px; padding: 32px 12px; color: var(--hbu-reader-muted); font-size: 13px; text-align: center; }
  .hbu-reader-comments-status-retry { display: inline-flex; align-items: center; justify-content: center; min-height: 36px; padding: 0 16px; border: 1px solid var(--hbu-reader-border); border-radius: 9px; background: transparent; color: inherit; font: inherit; font-size: 12px; cursor: pointer; }
  .hbu-reader-comments-status-retry:hover { border-color: var(--hbu-reader-accent); }
  .hbu-reader-comments-foot { display: flex; gap: 8px; align-items: center; padding: 12px 16px; border-top: 1px solid var(--hbu-reader-border); }
  .hbu-reader-comments-foot button, .hbu-reader-comments-foot a { display: inline-flex; align-items: center; justify-content: center; min-height: 36px; padding: 0 14px; border: 1px solid var(--hbu-reader-border); border-radius: 9px; background: transparent; color: inherit; font: inherit; font-size: 12px; text-decoration: none; cursor: pointer; }
  .hbu-reader-comments-foot a { margin-left: auto; border-color: transparent; background: var(--hbu-reader-accent); color: var(--hbu-reader-on-accent); font-weight: 650; }
  .hbu-reader-comments-foot button:disabled { opacity: .55; cursor: default; }
  .hbu-reader-comments-list[hidden], .hbu-reader-comments-status[hidden], .hbu-reader-comments-status [hidden], .hbu-reader-comments-foot button[hidden] { display: none; }
  .hbu-reader-composer {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: 7px;
    padding: 10px 16px 12px;
    border-bottom: 1px solid var(--hbu-reader-border);
    background: var(--hbu-reader-page);
  }
  .hbu-reader-composer-input {
    box-sizing: border-box;
    width: 100%;
    min-height: 58px;
    max-height: 132px;
    padding: 8px 11px;
    overflow-y: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    border: 1px solid var(--hbu-reader-border);
    border-radius: 10px;
    outline: none;
    background: var(--hbu-reader-subtle);
    color: var(--hbu-reader-ink);
    font: 13px/1.6 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
  }
  .hbu-reader-composer-input[data-empty="true"]::before { content: attr(data-placeholder); color: var(--hbu-reader-muted); pointer-events: none; }
  .hbu-reader-composer-input:focus { border-color: var(--hbu-reader-accent); }
  .hbu-reader-composer-reply { display: flex; gap: 8px; align-items: center; min-width: 0; padding: 5px 9px; border-radius: 8px; background: var(--hbu-reader-subtle); color: var(--hbu-reader-ink-2); font-size: 11px; }
  .hbu-reader-composer-reply[hidden] { display: none; }
  .hbu-reader-composer-reply-name { min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hbu-reader-composer-reply-cancel { flex: none; padding: 0; border: 0; background: transparent; color: var(--hbu-reader-link); font: inherit; cursor: pointer; }
  .hbu-reader-composer-bar { display: flex; gap: 8px; align-items: center; }
  .hbu-reader-composer-emoji-toggle, .hbu-reader-composer-image-toggle { flex: none; min-height: 30px; padding: 0 10px; border: 1px solid var(--hbu-reader-border); border-radius: 8px; background: transparent; color: var(--hbu-reader-ink-2); font: inherit; font-size: 12px; cursor: pointer; }
  .hbu-reader-composer-emoji-toggle[aria-expanded="true"] { border-color: var(--hbu-reader-accent); color: var(--hbu-reader-ink); }
  .hbu-reader-composer-emoji-toggle:disabled, .hbu-reader-composer-image-toggle:disabled { opacity: .55; cursor: default; }
  /* Picked pictures keep a square thumbnail so a nine picture row wraps instead
     of pushing the panel wider than its column. */
  .hbu-reader-composer-images { display: flex; flex-wrap: wrap; gap: 9px; }
  .hbu-reader-composer-images[hidden] { display: none; }
  .hbu-reader-composer-image { position: relative; width: 62px; height: 62px; margin: 0; }
  .hbu-reader-composer-image-frame { position: relative; display: grid; place-items: center; width: 100%; height: 100%; overflow: hidden; border: 1px solid var(--hbu-reader-border); border-radius: 9px; background: var(--hbu-reader-subtle); }
  .hbu-reader-composer-image-frame img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .hbu-reader-composer-image-placeholder { color: var(--hbu-reader-muted); font-size: 11px; }
  .hbu-reader-composer-image-state { position: absolute; right: 0; bottom: 0; left: 0; padding: 1px 0; background: var(--hbu-reader-float); color: var(--hbu-reader-float-ink); font-size: 10px; text-align: center; }
  .hbu-reader-composer-image-retry { position: absolute; right: 2px; bottom: 2px; left: 2px; min-height: 18px; padding: 0 3px; border: 1px solid var(--hbu-reader-border); border-radius: 5px; background: var(--hbu-reader-float); color: var(--hbu-reader-float-ink); font: inherit; font-size: 10px; line-height: 16px; cursor: pointer; }
  .hbu-reader-composer-image[data-status="failed"] .hbu-reader-composer-image-frame { border-color: var(--hbu-reader-danger); }
  .hbu-reader-composer-image-remove { position: absolute; top: -6px; right: -6px; display: grid; place-items: center; width: 20px; height: 20px; padding: 0; border: 1px solid var(--hbu-reader-border); border-radius: 50%; background: var(--hbu-reader-float); color: var(--hbu-reader-float-ink); font: inherit; font-size: 13px; line-height: 1; cursor: pointer; }
  .hbu-reader-composer-file { display: none; }
  .hbu-reader-composer-emoji { max-height: 196px; padding: 8px; overflow-y: auto; overscroll-behavior: contain; border: 1px solid var(--hbu-reader-border); border-radius: 10px; background: var(--hbu-reader-subtle); }
  .hbu-reader-composer-emoji[hidden] { display: none; }
  .hbu-reader-composer-emoji-groups { display: flex; flex-direction: column; gap: 10px; }
  .hbu-reader-composer-emoji-label { margin: 0 0 5px 2px; color: var(--hbu-reader-muted); font-size: 11px; font-weight: 600; letter-spacing: .02em; }
  .hbu-reader-composer-emoji-grid { display: grid; grid-template-columns: repeat(6, 26px); gap: 6px; justify-content: center; }
  .hbu-reader-composer-emoji-grid button { display: grid; place-items: center; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 6px; background: transparent; cursor: pointer; }
  .hbu-reader-composer-emoji-grid button:hover, .hbu-reader-composer-emoji-grid button:focus-visible { background: var(--hbu-reader-page); }
  /* The inline sprite style owns the sheet size, so only the repeat policy is
     set here; a contain fit would shift every cell offset. */
  .hbu-reader-composer-emoji-grid span { display: block; width: 22px; height: 22px; background-repeat: no-repeat; }
  .hbu-reader-composer-emoji-glyph { display: inline-block; width: 17px; height: 17px; vertical-align: -3px; background-repeat: no-repeat; }
  .hbu-reader-composer-status { min-width: 0; flex: 1 1 auto; color: var(--hbu-reader-muted); font-size: 11px; line-height: 1.4; overflow-wrap: anywhere; }
  .hbu-reader-composer-count { flex: none; color: var(--hbu-reader-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  .hbu-reader-composer-submit { flex: none; min-height: 30px; padding: 0 13px; border: 1px solid transparent; border-radius: 8px; background: var(--hbu-reader-accent); color: var(--hbu-reader-on-accent); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
  .hbu-reader-composer-submit:disabled { opacity: .55; cursor: default; }
  /* The lightbox is a scrollable stage: a very long picture keeps its reading
     width and grows downward instead of being squeezed into the viewport. The
     width itself is measured in JS so zoom steps stay exact. The viewer opens
     from inside the comment sheet as well as from the article, so it paints
     above every reader overlay: the panel sits at 4065 and the toast at 4060,
     while the site alert stays at 4100. */
  .hbu-reader-lightbox { position: fixed; inset: 0; z-index: 4070; display: flex; flex-direction: column; align-items: center; padding: 52px 12px 20px; overflow: auto; border: 0; background: rgba(2, 4, 7, .95); color: #e9eef5; font: inherit; }
  .hbu-reader-lightbox-stage { display: flex; flex: 0 0 auto; align-items: flex-start; justify-content: center; width: 100%; }
  .hbu-reader-lightbox img { display: block; max-width: none; height: auto; margin: 0 auto; border-radius: 10px; box-shadow: 0 20px 60px rgba(0, 0, 0, .55); cursor: zoom-in; transition: width .16s ease; }
  .hbu-reader-lightbox img[data-zoom="0"] { cursor: zoom-in; }
  .hbu-reader-lightbox img:not([data-zoom="0"]) { cursor: zoom-out; }
  .hbu-reader-lightbox-bar { position: fixed; top: 0; right: 0; left: 0; display: flex; gap: 10px; align-items: center; padding: 8px 12px; background: linear-gradient(180deg, rgba(2, 4, 7, .92), transparent); }
  .hbu-reader-lightbox-hint { flex: 1 1 auto; min-width: 0; overflow: hidden; color: rgba(233, 238, 245, .72); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
  .hbu-reader-lightbox-close { display: grid; place-items: center; width: 36px; height: 36px; flex: none; padding: 0; border: 1px solid rgba(255, 255, 255, .22); border-radius: 50%; background: rgba(12, 16, 22, .6); color: inherit; cursor: pointer; }
  .hbu-reader-lightbox-close svg { width: 17px; height: 17px; }
.hbu-reader-lightbox :is(img, button):focus-visible { outline: 2px solid var(--hbu-reader-accent); outline-offset: 2px; }
  .hbu-reader-toast { position: absolute; bottom: 58px; left: 50%; z-index: 20; padding: 7px 13px; border: 1px solid var(--hbu-reader-float-border); border-radius: 99px; background: var(--hbu-reader-float); color: var(--hbu-reader-float-ink); font-size: 12px; box-shadow: 0 10px 26px rgba(0, 0, 0, .18); opacity: 0; pointer-events: none; transform: translate(-50%, 8px); transition: opacity .18s ease, transform .18s ease; }
  .hbu-reader-toast[data-show="true"] { opacity: 1; transform: translate(-50%, 0); }
  .hbu-reader-toast--fixed { position: fixed; bottom: 58px; z-index: 4060; }
  .hbu-reader-pending { display: grid; height: 100%; place-items: center; padding: 24px; color: var(--hbu-reader-muted); font-size: 13px; letter-spacing: .04em; }
  .hbu-reader-pending-card { display: flex; flex-direction: column; gap: 12px; align-items: center; text-align: center; }
  .hbu-reader-pending-text { margin: 0; }
  .hbu-reader-pending-actions { display: flex; gap: 8px; align-items: center; }
  .hbu-reader-pending-actions[hidden] { display: none; }
  .hbu-reader-pending-actions button {
    min-height: 34px;
    padding: 0 14px;
    border: 1px solid var(--hbu-reader-border);
    border-radius: 9px;
    background: var(--hbu-reader-page);
    color: var(--hbu-reader-ink);
    font: inherit;
    letter-spacing: 0;
    cursor: pointer;
  }
  .hbu-reader-pending-actions button[data-retry] {
    border-color: transparent;
    background: var(--hbu-reader-accent);
    color: var(--hbu-reader-on-accent);
    font-weight: 650;
  }
  @media (max-width: 900px) {
    #${READER_ID} { width: 100%; }
    .hbu-reader-scroll, .hbu-reader-head, .hbu-reader-progress { width: 100%; }
    .hbu-reader-rail { right: 14px; bottom: 96px; }
    .hbu-reader-page { padding-right: 86px; }
    .hbu-reader-caption { padding-right: 86px; }
  }
  @media (max-width: 760px) {
    :root { --hbu-reader-stage: 100%; }
    .hbu-reader-rail-avatar-link { display: none; }
    .hbu-reader-page { padding: 22px 64px 48px 24px; }
    .hbu-reader-page[data-kind="hero"] { padding: 0; }
    .hbu-reader-page[data-kind="text"] { padding: 0 64px 0 24px; }
    .hbu-reader-page[data-kind="heading"] { padding: 44px 64px 24px 24px; }
    .hbu-reader-page[data-kind="media"] { padding: 1.5rem 16px; }
    .hbu-reader-rich figure { margin-block: 1.5rem; }
    .hbu-reader-page[data-kind="embed"] { padding: 1.5rem 16px; }
    .hbu-reader-page[data-kind="video"] { padding: 1.5rem 16px; }
    .hbu-reader-video { max-height: calc(100cqh - 3rem); }
    .hbu-reader-page[data-kind="text"] .hbu-reader-copy,
    .hbu-reader-page[data-kind="heading"] .hbu-reader-copy,
    .hbu-reader-rich { font-size: 17px; }
    .hbu-reader-page[data-kind="heading"] .hbu-reader-copy { font-size: 24px; }
    .hbu-reader-caption { padding: 18px 64px 56px 24px; }
    .hbu-reader-title { font-size: 26px; }
    .hbu-reader-cy-text { font-size: 16px; }
    .hbu-reader-rail { gap: 9px; bottom: 88px; right: 10px; }
    .hbu-reader-action { width: 42px; min-height: 42px; }
    .hbu-reader-action svg { width: 19px; height: 19px; }
    .hbu-reader-head { padding: 10px 12px; padding-top: max(10px, env(safe-area-inset-top)); }
    .hbu-reader-head-author { max-width: 38%; }
    .hbu-reader-progress { padding: 0 12px; }
    .hbu-reader-round { width: 38px; height: 38px; }
    .hbu-reader-home { height: 38px; padding: 0 11px 0 9px; }
  }
  @media (max-width: 520px) {
    .hbu-reader-head-author span { display: none; }
    .hbu-reader-head-author { padding-right: 4px; }
    .hbu-reader-follow { min-width: 48px; padding: 0 10px; }
    .hbu-reader-home { width: 38px; justify-content: center; padding: 0; border-radius: 50%; }
    .hbu-reader-home span { display: none; }
    .hbu-reader-page { padding-right: 64px; }
    .hbu-reader-page[data-kind="media"] { padding-right: 16px; padding-left: 16px; }
    .hbu-reader-page[data-kind="embed"] { padding-right: 16px; padding-left: 16px; }
    .hbu-reader-caption { padding-right: 64px; }
    .hbu-reader-hint { display: none; }
    .hbu-reader-related { display: none; }
  }
  @media (max-height: 620px) {
    .hbu-reader-page { padding-top: 72px; padding-bottom: 76px; }
    .hbu-reader-page:is([data-kind="media"], [data-kind="embed"], [data-kind="video"]) { padding-top: 1.5rem; padding-bottom: 1.5rem; }
    .hbu-reader-video { max-height: calc(100cqh - 3rem); }
    .hbu-reader-page[data-kind="hero"] { padding: 0; }
    .hbu-reader-page[data-kind="text"] { padding-top: 0; padding-bottom: 0; }
    .hbu-reader-caption { padding: 14px 64px 58px 24px; }
    .hbu-reader-rail { bottom: 70px; gap: 7px; }
    .hbu-reader-action { width: 38px; min-height: 38px; }
    .hbu-reader-action-count { display: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .hbu-reader-scroll { scroll-behavior: auto; }
    #${READER_ID} *, #${READER_ID} *::before, #${READER_ID} *::after { transition: none !important; }
  }
  /* Keep the history column docked at the viewport edge while sharing the
     available row with the article stage and action rail. */
  @media (min-width: 901px) {
    #${READER_ID}.hbu-reader-has-timeline { left: 0; width: calc(100% - var(--hbu-reader-history-width) - 40px); transform: none; }
    #${READER_ID}.hbu-reader-has-timeline .hbu-reader-scroll { width: min(var(--hbu-reader-stage), calc(100% - 80px)); margin-left: auto; margin-right: 80px; }
    #${READER_ID}.hbu-reader-has-timeline .hbu-reader-rail { right: 0; width: 56px; transform: none; }
    #${READER_ID}.hbu-reader-has-timeline .hbu-reader-head { width: calc(100% - 80px); }
    #${READER_ID}.hbu-reader-has-timeline .hbu-reader-progress { margin-left: auto; margin-right: 80px; width: min(var(--hbu-reader-stage), calc(100% - 80px)); }
    #${READER_ID}.hbu-reader-has-timeline .hbu-reader-history-menu { position: fixed; left: auto; right: 16px; width: var(--hbu-reader-history-width); }
    #${READER_ID}.hbu-reader-has-timeline [data-action="history"] { display: none; }
  }
  .hbu-reader-history-scrim { position: absolute; inset: 0; z-index: 44; padding: 0; border: 0; background: var(--hbu-reader-scrim); }
  .hbu-reader-history-scrim[hidden] { display: none; }
  /* Keep the timeline in a drawer only on narrow viewports. */
  @media (max-width: 900px) {
    #${READER_ID}.hbu-reader-has-timeline { width: 100%; }
    #${READER_ID}.hbu-reader-has-timeline .hbu-reader-scroll { width: 100%; margin-left: 0; margin-right: 0; }
    #${READER_ID}.hbu-reader-has-timeline .hbu-reader-rail { right: 14px; transform: none; }
    .hbu-reader-history-menu { right: 0; width: min(320px, 88vw); z-index: 45; visibility: hidden; box-shadow: var(--hbu-reader-shadow); transform: translateX(100%); transition: transform .22s ease, visibility .22s; }
    #${READER_ID}[data-timeline-open="true"] .hbu-reader-history-menu { visibility: visible; transform: none; }
    .hbu-reader-history-close { display: grid; }
  }
  @media (max-width: 760px) {
    #${READER_ID}.hbu-reader-has-timeline .hbu-reader-rail { right: 10px; transform: none; }
    .hbu-reader-history-menu { padding: 14px 12px 16px; }
  }
  /* The progress bar is now a sibling band, not an overlay on a page. */
`;

export const PAGER_ICONS = {
  prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>',
};

export function readPostLinkId(): string {
  const match = /^\/app\/bbs\/link\/(\d+)/.exec(location.pathname);
  return match ? match[1] : "";
}

export function readSessionArray(key: string): unknown[] {
  const value = sessionStore.readJson(key, []);
  return Array.isArray(value) ? value : [];
}

/** Reads a session JSON object without trusting its shape. */
export function readSessionRecord(key: string): Record<string, unknown> {
  const value = sessionStore.readJson(key, {});
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function writeSessionValue(key: string, value: unknown): boolean {
  return sessionStore.writeJson(key, value);
}

export function readFeedOrder(accountId: string = getHeyboxId()): FeedCandidate[] {
  return mergeFeedOrder(readSessionArray(buildFeedStateKey(FEED_ORDER_KEY, accountId)), []);
}

export function recordFeedOrder(): void {
  if (readPostLinkId() !== "") return;
  if (!document.querySelector("#page-bbs-community .bbs-home__content-list")) return;
  const seen = new Set<string>();
  const list: FeedCandidate[] = [];
  for (const anchor of document.querySelectorAll("#page-bbs-community .bbs-home__content-list a[href*='/app/bbs/link/']")) {
    const matched = /link\/(\d+)/.exec(anchor.getAttribute("href") || "");
    if (!matched) continue;
    const matchId = matched[1];
    if (seen.has(matchId)) continue;
    seen.add(matchId);
    const titleNode = anchor.querySelector(".bbs-home__content-title, .link-item__title, .bbs-home__topic-name");
    const title = (titleNode ? titleNode.textContent : anchor.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80);
    const card = anchor.closest(".bbs-home__content-item, .content-list__item, li");
    const meta = readPostMeta(card === null ? anchor : card, title);
    // The anchor itself is always an Element, so this guard only exists for the type.
    if (meta === null) continue;
    list.push({
      id: matchId,
      title: meta.title || title,
      authorId: meta.authorId,
      author: meta.author,
      topicIds: meta.topicIds,
      topics: meta.topics,
    });
  }
  if (list.length === 0) return;
  const accountId = getHeyboxId();
  const orderKey = buildFeedStateKey(FEED_ORDER_KEY, accountId);
  const merged = mergeFeedOrder(readSessionArray(orderKey), list).slice(-FEED_ORDER_MAX);
  if (merged.length > 0) writeSessionValue(orderKey, merged);
}

export function readRelatedPostLinks(): RelatedPostLink[] {
  const seen = new Set<string>();
  const list: RelatedPostLink[] = [];
  const nodes = document.querySelectorAll(".bbs-link__related-recommend a[href*='/app/bbs/link/'], .related-recommend__container a[href*='/app/bbs/link/']");
  for (const anchor of nodes) {
    const matched = /link\/(\d+)/.exec(anchor.getAttribute("href") || "");
    if (!matched) continue;
    const matchId = matched[1];
    if (seen.has(matchId)) continue;
    seen.add(matchId);
    const title = (anchor.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80);
    list.push({ id: matchId, title: title });
  }
  return list;
}

export function readUserIdFromHref(href: unknown): string {
  const value = typeof href === "string" ? href : "";
  if (value === "") return "";
  const match = /\/app\/user\/profile\/(\d+)/.exec(value) || /[?&]userid=(\d+)/.exec(value);
  return match ? normalizeFeedId(match[1]) : "";
}

export function readPostMeta(root: unknown, title: unknown): PostMeta | null {
  if (!(root instanceof Element)) return null;
  const scope = root;
  const authorNode = scope.querySelector(".list-content__username, .link-user__username, .page-header__username");
  const authorLink = scope.querySelector(".header__user, .link-user__user-wrapper, .page-header__user-wrapper, a[href*='/app/user/profile/']");
  const authorHref = authorLink?.getAttribute("href")
    || authorLink?.querySelector("a[href*='/app/user/profile/']")?.getAttribute("href")
    || "";
  const author = normalizeFeedText(authorNode?.textContent ?? "", 80);
  const authorId = readUserIdFromHref(authorHref);
  const topicIds: string[] = [];
  const topics: string[] = [];
  for (const node of Array.from(scope.querySelectorAll(".link-tags__tag-item"))) {
    const name = normalizeFeedText(node.textContent, 80);
    if (name !== "" && !topics.includes(name)) topics.push(name);
  }
  for (const anchor of Array.from(scope.querySelectorAll("a[href*='/app/topic/link/']"))) {
    const matched = /topic\/link\/(\d+)/.exec(anchor.getAttribute("href") || "");
    if (matched) {
      const topicId = normalizeFeedId(matched[1]);
      if (topicId !== "" && !topicIds.includes(topicId)) topicIds.push(topicId);
    }
    const name = normalizeFeedText(anchor.textContent, 80);
    if (name !== "" && !topics.includes(name)) topics.push(name);
  }
  const heading = normalizeFeedText(title, FEED_TITLE_MAX)
    || normalizeFeedText(scope.querySelector(READER_SOURCE_TITLE_SELECTOR)?.textContent ?? "", FEED_TITLE_MAX);
  return { title: heading, authorId: authorId, author: author, topicIds: topicIds, topics: topics };
}

export function readPostTrail(): string[] {
  return readSessionArray(POST_TRAIL_KEY).filter((id): id is string => typeof id === "string" && /^\d+$/.test(id));
}

/** Reads the stored visit cursor, or -1 when it has not been written yet. */
export function readPostHistoryCursor(): number {
  const raw = sessionStore.read(POST_HISTORY_CURSOR_KEY);
  if (raw === null || raw === "") return -1;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : -1;
}

export function writePostHistoryCursor(index: number): void {
  if (!Number.isSafeInteger(index) || index < 0) return;
  sessionStore.write(POST_HISTORY_CURSOR_KEY, String(index));
}

export function readVisitedPostIds(currentId: string): Set<string> {
  const visited = new Set(readPostTrail());
  if (currentId !== "") visited.add(currentId);
  return visited;
}

/**
 * Records a visit and moves the history cursor. Re-entering a post that is
 * already in the trail selects that entry instead of appending a duplicate, so
 * "previous" keeps walking the older direction after a step back.
 */
export function visitPostTrail(id: string): string[] {
  const trail = readPostTrail();
  if (id === "") return trail;
  const existing = trail.lastIndexOf(id);
  if (existing !== -1) {
    writePostHistoryCursor(existing);
    return trail;
  }
  // Opening a new post after stepping back drops the abandoned forward branch,
  // the way browser history does, so "previous" always means the post that was
  // actually on screen before this one.
  const cursor = readPostHistoryCursor();
  if (cursor >= 0 && cursor < trail.length - 1) trail.splice(cursor + 1);
  trail.push(id);
  const dropped = trimPostTrail(trail, readReaderHistoryLimit());
  writeSessionValue(POST_TRAIL_KEY, trail);
  writePostHistoryCursor(trail.length - 1);
  prunePostHistoryExtras(dropped);
  return trail;
}

/**
 * Trims the oldest visits in place so the trail honours the configured limit.
 * A limit of zero means unlimited. Returns the ids that left the trail so their
 * cached labels and scroll marks can be dropped with them.
 */
export function trimPostTrail(trail: string[], limit: number): string[] {
  const dropped: string[] = [];
  if (!Number.isSafeInteger(limit) || limit <= 0) return dropped;
  while (trail.length > limit) {
    const removed = trail.shift();
    if (removed !== undefined) dropped.push(removed);
  }
  return dropped;
}

/** Keeps the timeline to tiny `{ id: title }` nodes and nothing else. */
export function prunePostHistoryExtras(dropped: readonly string[]): void {
  if (dropped.length === 0) return;
  const stored = readSessionRecord(POST_HISTORY_TITLES_KEY);
  let changed = false;
  for (const id of dropped) {
    if (Object.prototype.hasOwnProperty.call(stored, id)) {
      delete stored[id];
      changed = true;
    }
    sessionStore.remove(READER_SCROLL_KEY + id);
    sessionStore.remove(READER_RATIO_KEY + id);
    removeStoredReaderPosition(id);
  }
  if (changed) writeSessionValue(POST_HISTORY_TITLES_KEY, stored);
}

/** Applies a lowered limit at once, keeping the newest entries. */
export function applyPostHistoryLimit(limit: number): string[] {
  const trail = readPostTrail();
  const cursor = readPostHistoryCursor();
  const dropped = trimPostTrail(trail, limit);
  if (dropped.length === 0) return trail;
  writeSessionValue(POST_TRAIL_KEY, trail);
  const nextCursor = cursor < 0 ? cursor : Math.max(0, cursor - dropped.length);
  writePostHistoryCursor(nextCursor);
  prunePostHistoryExtras(dropped);
  return trail;
}

/**
 * Title lookup for the history panel. Titles come from the recent metadata the
 * reader already records, so the timeline never needs an extra request.
 */
export function readPostHistoryEntryTitle(id: string): string {
  const recent = readFeedRecent();
  const found = recent.find((item) => item.id === id);
  if (found !== undefined && found.title !== "") return found.title;
  // Older visits eventually fall out of the twelve entry recent list, so the
  // timeline keeps its own label cache.
  const stored = readSessionRecord(POST_HISTORY_TITLES_KEY);
  const value = stored[id];
  return typeof value === "string" ? value : "";
}

export function writePostHistoryTitle(id: string, title: string): void {
  if (id === "" || title === "") return;
  const stored = readSessionRecord(POST_HISTORY_TITLES_KEY);
  if (stored[id] === title) return;
  stored[id] = title;
  const trail = readPostTrail();
  const kept: Record<string, string> = {};
  for (const trailId of trail) {
    const value = stored[trailId];
    if (typeof value === "string") kept[trailId] = value;
  }
  writeSessionValue(POST_HISTORY_TITLES_KEY, kept);
}

export function readFeedQueue(accountId: string = getHeyboxId()): FeedCandidate[] {
  return mergeFeedQueue(readSessionArray(buildFeedStateKey(FEED_QUEUE_KEY, accountId)), []);
}

export function writeFeedQueue(items: unknown, accountId: string = getHeyboxId()): boolean {
  return writeSessionValue(buildFeedStateKey(FEED_QUEUE_KEY, accountId), mergeFeedQueue(items, [], { max: FEED_QUEUE_MAX }));
}

export function readFeedCursorState(accountId: string = getHeyboxId()): FeedCursorState {
  const raw = sessionStore.read(buildFeedStateKey(FEED_CURSOR_KEY, accountId));
  if (raw === null || raw === "") return { present: false, offset: 0 };
  const value = Number(raw);
  return { present: true, offset: Number.isSafeInteger(value) && value >= 0 ? value : 0 };
}

export function writeFeedCursor(offset: number, accountId: string = getHeyboxId()): boolean {
  if (!Number.isSafeInteger(offset) || offset < 0) return false;
  return sessionStore.write(buildFeedStateKey(FEED_CURSOR_KEY, accountId), String(offset));
}

export function readFeedSeen(accountId: string = getHeyboxId()): string[] {
  return mergeFeedSeen(readSessionArray(buildFeedStateKey(FEED_SEEN_KEY, accountId)), []);
}

export function writeFeedSeen(ids: unknown, accountId: string = getHeyboxId()): string[] {
  const list = mergeFeedSeen(ids instanceof Set ? Array.from(ids) : ids, []);
  writeSessionValue(buildFeedStateKey(FEED_SEEN_KEY, accountId), list);
  return list;
}

export function readFeedRecent(accountId: string = getHeyboxId()): FeedCandidate[] {
  return mergeRecentMetadata(readSessionArray(buildFeedStateKey(FEED_RECENT_KEY, accountId)), null);
}

export function writeFeedRecent(recent: unknown, accountId: string = getHeyboxId()): void {
  writeSessionValue(buildFeedStateKey(FEED_RECENT_KEY, accountId), mergeRecentMetadata(recent, null));
}

export function readFeedRecentSignature(recent: readonly FeedCandidate[]): string {
  return recent
    .map((item) => [item.id, item.title, item.authorId, item.author, item.topicIds.join(","), item.topics.join(",")].join("~"))
    .join("|");
}

export function createPostNavigationController(): PostNavigationController {
  let currentId = "";
  let related: FeedCandidate[] = [];
  let accountId = getHeyboxId();
  let queue: FeedCandidate[] = [];
  let cursor = 0;
  let cursorStored = false;
  let seen = new Set<string>();
  let recent: FeedCandidate[] = [];
  let recentKey = "";
  let discovering = false;
  let discoveryError = "";
  let exhausted = false;
  let generation = 0;
  let revision = 0;
  const listeners = new Set<(status: PostPagerStatus) => void>();
  let statusKey = "";

  const loadAccountState = () => {
    queue = readFeedQueue(accountId);
    const storedCursor = readFeedCursorState(accountId);
    cursor = storedCursor.present ? storedCursor.offset : computeFeedDiscoveryOffset(readFeedOrder(), FEED_DISCOVERY_PAGE_SIZE);
    cursorStored = storedCursor.present;
    seen = new Set(readFeedSeen(accountId));
    recent = readFeedRecent(accountId);
    recentKey = readFeedRecentSignature(recent);
  };

  // Feed state belongs to one account. Switching users invalidates the running pass and
  // reloads the new account's queue, cursor, seen IDs, and diversity metadata.
  const syncAccount = () => {
    const nextAccountId = getHeyboxId();
    if (nextAccountId === accountId) return false;
    accountId = nextAccountId;
    generation += 1;
    discovering = false;
    discoveryError = "";
    exhausted = false;
    loadAccountState();
    return true;
  };

  loadAccountState();

  const readStatus = (): PostPagerStatus => {
    const trail = readPostTrail();
    let prev: { id: string; title: string } | null = null;
    const cursor = readPostHistoryCursor();
    const at = currentId === "" ? -1 : trail.lastIndexOf(currentId);
    // The cursor is the authority. It only points at the visited entry, so
    // stepping back twice keeps moving toward older posts instead of bouncing
    // between two ids that overwrote each other.
    const position = at === -1 ? -1 : cursor >= 0 && trail[cursor] === currentId ? cursor : at;
    if (position > 0) {
      const prevId = trail[position - 1];
      if (prevId !== undefined && prevId !== currentId) {
        prev = { id: prevId, title: readPostHistoryEntryTitle(prevId) };
      }
    }
    const history: PostHistoryEntry[] = trail.map((id, index) => ({
      id: id,
      title: readPostHistoryEntryTitle(id),
      current: index === position,
    }));
    let next: { id: string; title: string; source?: string } | null = null;
    if (currentId !== "") {
      const picked = selectNextFeedCandidate({
        currentId: currentId,
        visited: readVisitedPostIds(currentId),
        seen: seen,
        recent: recent,
        feedOrder: readFeedOrder(),
        queue: queue,
        related: related,
      });
      if (picked !== null) next = { id: picked.candidate.id, title: picked.candidate.title, source: picked.source };
    }
    return {
      currentId: currentId,
      revision: revision,
      prev: prev,
      next: next,
      history: history,
      discovering: discovering,
      error: discoveryError,
      exhausted: exhausted,
    };
  };

  const publish = (force: boolean): void => {
    const status = readStatus();
    const key = [
      status.currentId,
      String(status.revision),
      status.prev === null ? "" : status.prev.id,
      status.next === null ? "" : status.next.id,
      status.history.map((entry) => (entry.current ? "*" : "") + entry.id).join(","),
      status.discovering ? "1" : "0",
      status.error,
      status.exhausted ? "1" : "0",
    ].join("|");
    if (force !== true && key === statusKey) return;
    statusKey = key;
    for (const listener of Array.from(listeners)) {
      try {
        listener(status);
      } catch {
        // One failing listener must not stop the other panels from refreshing.
      }
    }
  };

  const sync = (id: unknown, meta: unknown, links: unknown): void => {
    syncAccount();
    const nextId = normalizeFeedId(id);
    const nextRelated = normalizeFeedDiscoveryLinks(links);
    related = nextRelated === null ? [] : nextRelated;
    if (nextId === "") {
      if (currentId !== "") {
        currentId = "";
        revision += 1;
        discoveryError = "";
        exhausted = false;
        publish(true);
      }
      return;
    }
    const changed = nextId !== currentId;
    currentId = nextId;
    if (changed) {
      revision += 1;
      visitPostTrail(nextId);
      discoveryError = "";
      exhausted = false;
      if (queue.some((item) => item.id === nextId)) {
        queue = queue.filter((item) => item.id !== nextId);
        writeFeedQueue(queue, accountId);
      }
    }
    if (!seen.has(nextId)) {
      const nextSeen = new Set(seen);
      nextSeen.add(nextId);
      seen = new Set(writeFeedSeen(nextSeen, accountId));
    }
    const incoming = normalizeFeedCandidate(meta !== null && typeof meta === "object" ? { ...meta, id: nextId } : { id: nextId });
    if (incoming !== null) {
      writePostHistoryTitle(nextId, incoming.title);
      const merged = mergeRecentMetadata(recent, incoming);
      const key = readFeedRecentSignature(merged);
      if (key !== recentKey) {
        recent = merged;
        recentKey = key;
        writeFeedRecent(recent, accountId);
      }
    }
    publish(changed);
  };

  // Read-only: the queue, seen set, and trail advance only when sync sees the new route, so a
  // rejected or slow navigation leaves the candidate retryable.
  const takeNext = () => {
    const status = readStatus();
    if (status.next === null) return null;
    return { id: status.next.id, title: status.next.title };
  };

  const discover = async () => {
    syncAccount();
    if (discovering || currentId === "") return;
    if (!cursorStored) {
      cursor = computeFeedDiscoveryOffset(readFeedOrder(), FEED_DISCOVERY_PAGE_SIZE);
      cursorStored = writeFeedCursor(cursor, accountId);
    }
    discovering = true;
    discoveryError = "";
    exhausted = false;
    generation += 1;
    const runGeneration = generation;
    const controller = new AbortController();
    publish(true);
    try {
      for (let pass = 0; pass < FEED_DISCOVERY_PASS_PAGES; pass += 1) {
        const page = await requestFeedDiscoveryPage(cursor, controller.signal);
        if (runGeneration !== generation) return;
        if (!page.ok) {
          discoveryError = page.message;
          break;
        }
        const nextQueue = mergeFeedQueue(queue, page.links, {
          currentId: currentId,
          visited: readVisitedPostIds(currentId),
          seen: seen,
          max: FEED_QUEUE_MAX,
        });
        // Advance only after the queue is durable; otherwise a reload loses this page while
        // the cursor already points past it.
        if (!writeFeedQueue(nextQueue, accountId)) {
          if (runGeneration !== generation) return;
          discoveryError = "无法保存连读进度；点击“下一篇”重试";
          break;
        }
        queue = nextQueue;
        const nextCursor = cursor + FEED_DISCOVERY_PAGE_SIZE;
        if (writeFeedCursor(nextCursor, accountId)) {
          cursor = nextCursor;
          cursorStored = true;
        }
        // Only an empty raw API page proves exhaustion; a page whose entries were all filtered
        // still has later pages to inspect.
        if (page.rawEmpty === true) break;
        if (hasDiscoverableNext(readStatus())) break;
      }
    } catch (error) {
      if (runGeneration !== generation) return;
      if (!isAbortError(error)) discoveryError = "信息流请求失败，请稍后重试";
    } finally {
      if (runGeneration === generation) {
        discovering = false;
        if (discoveryError === "") exhausted = readStatus().next === null;
        publish(true);
      }
    }
  };

  const subscribe = (listener: unknown): (() => void) => {
    if (typeof listener !== "function") return () => {};
    // Only callables reach the set; the original guarded with the same typeof check.
    const callback = listener as (status: PostPagerStatus) => void;
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  };

  return {
    sync: sync,
    readStatus: readStatus,
    takeNext: takeNext,
    discover: discover,
    subscribe: subscribe,
  };
}

export function isTypingTarget(target: unknown): boolean {
  if (!(target instanceof Element)) return false;
  // SVG and MathML elements have no editing host; the original read undefined and treated it as false.
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}

export function isSiteAlertOpen() {
  return document.querySelector(".alert-container-wrapper .hb-cpt__alert-wrapper") !== null;
}

export function eventHitsTypingTarget(event: Event): boolean {
  for (const node of event.composedPath()) {
    if (isTypingTarget(node)) return true;
  }
  return isTypingTarget(event.target);
}

export function isFollowedAuthor(button: unknown): boolean {
  if (!(button instanceof Element)) return false;
  if (button.classList.contains("followed")) return true;
  if (button.getAttribute("aria-pressed") === "true") return true;
  return /^(已关注|互相关注)$/.test((button.textContent || "").trim());
}

export function watchPostPager(navigation: PostNavigationController): void {
  if (!document.body) return;
  const host = document.createElement("div");
  host.id = PAGER_ID;
  host.hidden = true;
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = PAGER_CSS;
  const pager = document.createElement("nav");
  pager.className = "pager";
  pager.setAttribute("aria-label", "文章连读");
  const prevButton = document.createElement("button");
  prevButton.type = "button";
  prevButton.className = "btn btn--prev";
  prevButton.setAttribute("aria-label", "上一篇");
  prevButton.title = "上一篇";
  prevButton.innerHTML = PAGER_ICONS.prev;
  const nextButton = document.createElement("button");
  nextButton.type = "button";
  nextButton.className = "btn btn--next";
  nextButton.setAttribute("aria-label", "下一篇");
  nextButton.title = "下一篇";
  nextButton.innerHTML = PAGER_ICONS.next;
  const statusNode = document.createElement("p");
  statusNode.className = "pager-status";
  statusNode.setAttribute("role", "status");
  statusNode.setAttribute("aria-live", "polite");
  statusNode.hidden = true;
  pager.append(prevButton, nextButton, statusNode);
  shadow.append(style, pager);

  let currentId = "";
  let prevId = "";
  let navigating = false;
  let pendingAdvanceSourceId = "";
  let pendingAdvanceRevision = -1;

  const clearPendingAdvance = () => {
    pendingAdvanceSourceId = "";
    pendingAdvanceRevision = -1;
  };

  const go = (id: string): void => {
    if (id === "" || navigating) return;
    navigating = true;
    // The lock survives the transition; the next sync unlocks once the route reports the new id.
    void navigateToPath(LINK_HREF_PREFIX + id).then((accepted) => {
      if (accepted !== true) navigating = false;
    }, () => {
      navigating = false;
    });
    const toTop = () => window.scrollTo({ top: 0, behavior: "auto" });
    requestAnimationFrame(toTop);
    window.setTimeout(toTop, 120);
  };

  const advance = (): void => {
    if (navigating) return;
    const status = navigation.readStatus();
    if (status.next !== null && status.next.source !== "related") {
      const taken = navigation.takeNext();
      if (taken !== null) {
        clearPendingAdvance();
        go(taken.id);
        return;
      }
    }
    pendingAdvanceSourceId = status.currentId;
    pendingAdvanceRevision = status.revision;
    void navigation.discover();
  };

  const renderStatus = (status: PostPagerStatus): void => {
    prevId = status.prev === null ? "" : status.prev.id;
    prevButton.disabled = prevId === "";
    prevButton.title = status.prev === null ? "没有上一篇" : "上一篇（[）";
    prevButton.setAttribute("aria-label", prevButton.title);
    nextButton.disabled = status.discovering;
    if (status.discovering) {
      nextButton.title = "正在寻找下一篇…";
    } else if (status.next !== null) {
      nextButton.title = status.next.title === "" ? "下一篇（]）" : "下一篇（]）：" + status.next.title;
    } else if (status.error !== "") {
      nextButton.title = "没有找到下一篇：" + status.error + "（点击重试）";
    } else if (status.exhausted) {
      nextButton.title = "已到信息流末尾（点击重试）";
    } else {
      nextButton.title = "点击寻找下一篇（]）";
    }
    nextButton.setAttribute("aria-label", nextButton.title);
    statusNode.textContent = status.discovering ? "正在寻找下一篇…" : "";
    statusNode.hidden = !status.discovering;
  };

  prevButton.addEventListener("click", () => go(prevId));
  nextButton.addEventListener("click", advance);

  navigation.subscribe((status) => {
    if (host.hidden) return;
    renderStatus(status);
    if (pendingAdvanceSourceId === "") return;
    // Returning to the same article does not revive a pass that started before leaving it.
    if (status.currentId !== pendingAdvanceSourceId || status.revision !== pendingAdvanceRevision) {
      clearPendingAdvance();
      return;
    }
    if (status.discovering) return;
    const taken = navigation.takeNext();
    clearPendingAdvance();
    if (taken !== null) go(taken.id);
  });

  document.addEventListener("keydown", (event) => {
    if (host.hidden || document.body.classList.contains(READER_CLASS) || event.defaultPrevented) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isSiteAlertOpen() || eventHitsTypingTarget(event)) return;
    if (event.key === "[") {
      const prev = navigation.readStatus().prev;
      if (prev === null) return;
      event.preventDefault();
      go(prev.id);
    } else if (event.key === "]") {
      event.preventDefault();
      advance();
    }
  });

  const sync = (): void => {
    const id = readPostLinkId();
    if (id === "") {
      host.hidden = true;
      host.remove();
      currentId = "";
      navigating = false;
      clearPendingAdvance();
      navigation.sync("", null, []);
      return;
    }
    if (host.parentNode !== document.body) document.body.append(host);
    if (id !== currentId) {
      currentId = id;
      navigating = false;
      host.hidden = false;
    }
    const pageRoot = document.querySelector("#page-bbs-link");
    navigation.sync(id, pageRoot === null ? null : readPostMeta(pageRoot, ""), readRelatedPostLinks());
    renderStatus(navigation.readStatus());
  };

  registerPageSync(sync, 200, [PAGE_ROUTE.ARTICLE], "article");
  registerPageSync(recordFeedOrder, 1000, [PAGE_ROUTE.FEED], "feed");
  sync();
  recordFeedOrder();
}

export function readReaderScroll(id: string): number {
  if (id === "") return 0;
  const value = Number(sessionStore.read(READER_SCROLL_KEY + id));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function writeReaderScroll(id: string, index: number): void {
  if (id === "") return;
  sessionStore.write(READER_SCROLL_KEY + id, String(index));
}

interface StoredReaderPosition {
  ratio: number;
  updatedAt: number;
}

/**
 * A versioned, expiring map of reading positions. Session state remains the
 * live source; this record carries a post's percentage into a later tab.
 */
function readStoredReaderPositions(): { changed: boolean; positions: Record<string, StoredReaderPosition> } {
  const raw = localStore.readJson(STORAGE_KEYS.readerPositions, null);
  const container = asRecord(raw);
  if (container === null || container["version"] !== READER_POSITIONS_VERSION) {
    return { changed: raw !== null, positions: {} };
  }
  const stored = asRecord(container["positions"]);
  if (stored === null) return { changed: true, positions: {} };
  const cutoff = Date.now() - READER_POSITIONS_TTL_MS;
  const positions: Record<string, StoredReaderPosition> = {};
  let changed = false;
  for (const [id, value] of Object.entries(stored)) {
    const entry = asRecord(value);
    const ratio = entry === null ? Number.NaN : Number(entry["ratio"]);
    const updatedAt = entry === null ? Number.NaN : Number(entry["updatedAt"]);
    if (!POST_ID_PATTERN.test(id) || !Number.isFinite(ratio) || ratio < 0 || ratio > 1
      || !Number.isFinite(updatedAt) || updatedAt <= cutoff) {
      changed = true;
      continue;
    }
    positions[id] = { ratio, updatedAt };
  }
  const ids = Object.keys(positions);
  if (ids.length > READER_POSITIONS_MAX) {
    changed = true;
    for (const id of ids
      .sort((a, b) => positions[a]!.updatedAt - positions[b]!.updatedAt)
      .slice(0, ids.length - READER_POSITIONS_MAX)) {
      delete positions[id];
    }
  }
  return { changed, positions };
}

function writeStoredReaderPositions(positions: Record<string, StoredReaderPosition>): void {
  localStore.writeJson(STORAGE_KEYS.readerPositions, {
    version: READER_POSITIONS_VERSION,
    positions,
  });
}

/** Removes a saved position when the timeline drops its visit. */
export function removeStoredReaderPosition(id: string): void {
  if (id === "" || !POST_ID_PATTERN.test(id)) return;
  const { positions } = readStoredReaderPositions();
  if (!Object.prototype.hasOwnProperty.call(positions, id)) return;
  delete positions[id];
  writeStoredReaderPositions(positions);
}

/** Writes one post's percentage into the durable map; callers throttle this. */
export function persistReaderRatio(id: string, ratio: number): void {
  if (id === "" || !POST_ID_PATTERN.test(id) || !Number.isFinite(ratio) || ratio < 0 || ratio > 1) return;
  const { positions } = readStoredReaderPositions();
  positions[id] = { ratio, updatedAt: Date.now() };
  writeStoredReaderPositions(positions);
}

export function readReaderRatio(id: string): number {
  if (id === "") return -1;
  const stored = sessionStore.read(READER_RATIO_KEY + id);
  if (stored !== null) {
    const value = Number(stored);
    if (Number.isFinite(value) && value >= 0 && value <= 1) return value;
  }
  const { changed, positions } = readStoredReaderPositions();
  if (changed) writeStoredReaderPositions(positions);
  const saved = positions[id];
  return saved === undefined ? -1 : saved.ratio;
}

export function writeReaderRatio(id: string, ratio: number): void {
  if (id === "") return;
  sessionStore.write(READER_RATIO_KEY + id, ratio.toFixed(4));
}

export function ensureReaderStyle(): void {
  ensureStyleElement(READER_STYLE_ID, READER_CSS);
}

interface ReaderSourceCache {
  articleId: string;
  pageRoot: Element;
  article: Element;
}

interface ReaderCommentState {
  items: RailCommentEntry[];
  page: number;
  total: number;
  loading: boolean;
  error: string;
  hasMore: boolean;
  loadedGroups: number;
  loaded: boolean;
  /** Timestamp of the last successful page-one read, used to age out the panel. */
  loadedAt: number;
  seq: number;
  /** Page each loaded floor came from, so a reply can re-read its own page. */
  floorPages: Map<string, number>;
  /** Replies written here but not echoed by the tree endpoint yet. */
  pendingReplies: RailComment[];
  /** Ids each local reply had already seen when it was written, for the diff match. */
  pendingBaselines: Map<string, Set<string>>;
  /** Local replies whose verification window ran out without an echo. */
  settledReplies: Set<string>;
  /** Floors restored from a mark after a reload, before the site echoes them. */
  localFloors: RailCommentEntry[];
  /** Mark each local floor stands for, so it is dropped when the real row arrives. */
  localFloorMarks: Map<string, ReaderCommentMark>;
}

interface ReaderCommentLoadOptions {
  /** Forces a network read of page one instead of the cached copy. */
  fresh?: boolean;
  /** Replaces an in-flight load instead of being ignored. */
  force?: boolean;
  /** Keeps polling page one until this comment id shows up in the tree. */
  expectPresentId?: string;
  /** Keeps polling page one until this comment id is gone from the tree. */
  expectAbsentId?: string;
  /** Verification round counter for the polling loop below. */
  attempt?: number;
  /**
   * Reply written from this panel that the server may not have returned yet.
   * It is matched by id or by text so a create without an id still verifies.
   */
  expectPending?: RailComment;
  /**
   * Merges the answer into the loaded list instead of replacing it, so a
   * refresh after a write keeps the floors read from the other pages.
   */
  merge?: boolean;
  /**
   * Page that owns the floor a pending reply was written under. The polling
   * loop alternates between it and page one, because a new reply can move the
   * floor to the first page.
   */
  verifyPage?: number;
  /**
   * Comments written in this tab that a reload is still waiting to see. They
   * survive a full page load in sessionStorage, unlike the in-memory pending
   * rows, so every mark must show up before the load counts as fresh.
   */
  expectations?: readonly ReaderCommentMark[];
}

interface SuspendedMediaEmbedState {
  readonly kind: "media";
  readonly muted: boolean;
  readonly currentTime: number;
}

interface SuspendedMarkupEmbedState {
  readonly kind: "markup";
  readonly attributes: Record<string, string>;
  sourceObserver: MutationObserver | null;
}

type SuspendedEmbedState = SuspendedMediaEmbedState | SuspendedMarkupEmbedState;

interface EmbedGroup {
  source: Element;
  embeds: Element[];
}

interface MediaSequenceImage {
  readonly kind: "image";
  node: HTMLImageElement;
}

interface MediaSequenceEmbed {
  readonly kind: "embed";
  group: EmbedGroup;
}

type MediaSequenceItem = MediaSequenceImage | MediaSequenceEmbed;

interface ReaderVideo {
  node: Element;
  source: string;
  poster: string;
}

interface ReaderSource {
  pageRoot: Element;
  article: Element;
  body: Element | null;
  titleNode: Element | null;
  covers: string[];
  bodyImages: string[];
  videos: ReaderVideo[];
  videoMissing: boolean;
  isVideoPost: boolean;
  signature: string;
}

interface ReaderData {
  article: Element;
  body: Element | null;
  title: string;
  author: string;
  authorId: string;
  authorHref: string;
  avatar: string;
  topicIds: string[];
  topics: string[];
  meta: PostMeta;
  covers: string[];
  heroImage: string;
  videos: ReaderVideo[];
  videoMissing: boolean;
  isVideoPost: boolean;
  tags: string[];
  time: string;
  ip: string;
  level: string;
  related: RelatedPostLink[];
  counts: { like: string; favour: string; comment: string };
  signature: string;
}

export function watchReader(navigation: PostNavigationController): void {
  if (!document.body) return;
  let host: HTMLElement | null = null;
  let lightbox: HTMLElement | null = null;
  let lightboxImage: HTMLImageElement | null = null;
  let lightboxZoom = 0;
  let lightboxBaseWidth = 0;
  let lightboxNatural = { width: 0, height: 0 };
  let lightboxReturnFocus: HTMLElement | null = null;
  let favourPanel: HTMLDivElement | null = null;
  let favourButton: HTMLButtonElement | null = null;
  let spacingPanel: HTMLDivElement | null = null;
  let spacingButton: HTMLButtonElement | null = null;
  let spacingInput: HTMLInputElement | null = null;
  let historyPanel: HTMLDivElement | null = null;
  let historyButton: HTMLButtonElement | null = null;
  let historyMeta: HTMLDivElement | null = null;
  let historyList: HTMLOListElement | null = null;
  let historyRail: HTMLDivElement | null = null;
  let historyThumb: HTMLButtonElement | null = null;
  let historyPeek: HTMLDivElement | null = null;
  let historyScrim: HTMLDivElement | null = null;
  /** Below this width the dock folds into a drawer opened from the rail. */
  const historyNarrow = window.matchMedia("(max-width: 900px)");
  /** Visit number the thumb is previewing while dragged; 0 follows the post on screen. */
  let historyPreviewX = 0;
  let articleId = "";
  let dismissedArticleId = "";
  let signature = "";
  let activeIndex = 0;
  let pageCount = 0;
  let toastTimer = 0;
  let coverIndex = 0;
  let coverTotal = 0;
  let observer: IntersectionObserver | null = null;
  let scrollRaf = 0;
  let restoring = false;
  let lastActionSyncAt = 0;
  let progressScroll: HTMLElement | null = null;
  let progressCurrent: HTMLElement | null = null;
  let progressFill: HTMLElement | null = null;
  let lastProgressPercent = -1;
  let ratioSaveTimer = 0;
  let durableRatioTimer = 0;
  let pendingRatio: { id: string; ratio: number } | null = null;
  let sourceCache: ReaderSourceCache | null = null;
  const suspendedEmbeds: Map<Element, SuspendedEmbedState> = new Map();
  let nativeActionArticle: Element | null = null;
  let nativeActionBox: Element | null = null;
  let nativeFavourButton: Element | null = null;
  let linkStateController: AbortController | null = null;
  let commentLoadController: AbortController | null = null;
  let favourLoadController: AbortController | null = null;
  let readerGeneration = 0;
  let linkState: RailLinkInfo | null = null;
  let linkStatePromise: Promise<RailLinkInfo | null> | null = null;
  // CY publishes made in the current article; the first comment tree may predate them.
  let cyPublishedCount = 0;
  // Normal comments published in the current article; the first tree page may predate them.
  let articleCommentPublishedCount = 0;
  let actionBusy = false;
  let favourMenuBusy = false;
  let favourSaveBusy = false;
  let favourCreateBusy = false;
  let favourCreateController: AbortController | null = null;
  let favourSaveController: AbortController | null = null;
  let favourPanelFolders: FavourFolder[] = [];
  let favourPanelChecked: Set<string> = new Set<string>();
  let favourPanelMembers: Set<string> = new Set<string>();
  let favourPanelUnknown: Set<string> = new Set<string>();
  let favourPanelFavourited = false;
  let favourPanelStatus: HTMLDivElement | null = null;
  let favourPanelList: HTMLDivElement | null = null;
  let favourPanelSave: HTMLButtonElement | null = null;
  let favourPanelCreateInput: HTMLInputElement | null = null;
  let favourPanelCreateButton: HTMLButtonElement | null = null;
  let favourPanelClose: HTMLButtonElement | null = null;
  let cyDialog: HTMLDivElement | null = null;
  let cyTextarea: HTMLTextAreaElement | null = null;
  let cySubmit: HTMLButtonElement | null = null;
  let cyStatus: HTMLDivElement | null = null;
  let cyBusy = false;
  let articleCommentBusy = false;
  // Distinguishes optimistic reply rows that the create call returned no id for.
  let pendingReplySeq = 0;
  const ARTICLE_COMMENT_MAX_LENGTH = 1000;
  const liveCatalogBootstrap = (): void => {
    void loadRailEmojiCatalog().then((catalog) => {
      if (catalog !== null) {
        rebuildComposerEmojiPickers();
        if (commentPanel !== null && !commentPanel.hidden) renderReaderComments();
      }
    }).catch(() => undefined);
  };

  interface ComposerEmojiPicker {
    close: (restoreFocus: boolean) => void;
    refresh: () => void;
  }

  const articleComposerEmojiClosers: WeakMap<Element, ComposerEmojiPicker> = new WeakMap();
  let articleComposerSelectionCleanup: (() => void) | null = null;
  // Pictures picked for the composer live next to the element they belong to,
  // so closing or resetting the panel cannot leave an upload behind.
  const articleComposerImages: WeakMap<Element, ComposerImage[]> = new WeakMap();
  let articleComposerImageSeq = 0;
  let commentPanel: HTMLElement | null = null;
  let commentPanelList: HTMLOListElement | null = null;
  let lastCommentControlFocus: { id: string; action: CommentControlAction } | null = null;
  let commentPanelStatus: HTMLDivElement | null = null;
  let commentPanelStatusText: HTMLDivElement | null = null;
  let commentPanelRetry: HTMLButtonElement | null = null;
  let commentPanelMeta: HTMLSpanElement | null = null;
  let commentPanelMore: HTMLButtonElement | null = null;
  let commentPanelClose: HTMLButtonElement | null = null;
  let commentPanelRefresh: HTMLButtonElement | null = null;
  let articleReplyTarget: (ArticleReplyTargetPayload & { name: string }) | null = null;
  let commentState: ReaderCommentState = createCommentState();
  // Reopening a panel whose page one is older than this refreshes from the site
  // instead of trusting the in-memory copy.
  const COMMENT_PANEL_STALE_MS = 60 * 1000;
  // The comment author id is only known after account discovery, so delete
  // actions stay hidden until the reader can prove who is logged in.
  let readerAccountId = "";
  const commentDeleteBusy = new Set<string>();
  // Collapsing a reply hides its whole subtree, so a deep chain can be folded
  // away instead of widening the sheet. Keyed by comment id and kept for the
  // article, so a refresh does not reopen what the reader folded.
  const collapsedCommentThreads = new Set<string>();
  let readerPendingAdvanceSourceId = "";
  let readerPendingAdvanceRevision = -1;
  let readerAdvanceLocked = false;
  let readerAdvanceLockToken = 0;
  let readerPendingCard: HTMLElement | null = null;
  let readerPendingTimer = 0;
  let readerPendingArticleId = "";
  let readerPendingGeneration = -1;

  function createCommentState(): ReaderCommentState {
    return {
      items: [],
      page: 0,
      total: 0,
      loading: false,
      error: "",
      hasMore: false,
      loadedGroups: 0,
      loaded: false,
      loadedAt: 0,
      seq: 0,
      floorPages: new Map<string, number>(),
      pendingReplies: [],
      pendingBaselines: new Map<string, Set<string>>(),
      settledReplies: new Set<string>(),
      localFloors: [],
      localFloorMarks: new Map<string, ReaderCommentMark>(),
    };
  }

  const showToast = (message: string): void => {
    let toast: HTMLElement | null = host?.querySelector<HTMLElement>(".hbu-reader-toast") ?? null;
    if (toast === null) {
      const created = document.createElement("div");
      created.className = "hbu-reader-toast hbu-reader-toast--fixed";
      created.setAttribute("aria-live", "polite");
      document.body.append(created);
      toast = created;
    }
    const toastNode = toast;
    toastNode.textContent = message;
    toastNode.dataset["show"] = "true";
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastNode.dataset["show"] = "false";
      if (toastNode.parentElement === document.body) window.setTimeout(() => toastNode.remove(), 220);
    }, 1400);
  };

  const copyText = async (text: string): Promise<boolean> => {
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    try {
      if (navigator.clipboard !== undefined && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (error) {
      // Fall through to the selection-based path when clipboard permission is unavailable.
    }
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "0";
    area.style.left = "0";
    area.style.width = "1px";
    area.style.height = "1px";
    area.style.padding = "0";
    area.style.border = "0";
    area.style.opacity = "0";
    area.style.pointerEvents = "none";
    document.body.append(area);
    area.select();
    area.setSelectionRange(0, area.value.length);
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch (error) {
      copied = false;
    }
    area.remove();
    active?.focus({ preventScroll: true });
    return copied;
  };

  const shareArticle = async (data: ReaderData): Promise<void> => {
    const url = "https://www.xiaoheihe.cn/app/bbs/link/" + articleId;
    const title = data.title || document.title || "小黑盒帖子";
    if (typeof navigator.share === "function") {
      const payload = { title: title, text: title, url: url };
      const shareable = typeof navigator.canShare !== "function" || navigator.canShare(payload);
      if (shareable) {
        try {
          await navigator.share(payload);
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
        }
      }
    }
    const copied = await copyText(url);
    showToast(copied ? "链接已复制" : "复制失败，请手动复制链接");
  };

  const articleActionBox = (): Element | null => {
    if (nativeActionBox !== null && nativeActionBox.isConnected) return nativeActionBox;
    const article = sourceCache?.article?.isConnected === true
      ? sourceCache.article
      : document.querySelector("#page-bbs-link " + READER_SOURCE_ROOT_SELECTOR);
    if (article !== nativeActionArticle) {
      nativeActionArticle = article;
      nativeActionBox = null;
      nativeFavourButton = null;
    }
    // Video posts keep their article action box outside .hb-bbs__video, so scope the
    // lookup to the page instead of the media root. Comment rows are excluded below.
    const actionScope = article?.closest("#page-bbs-link") || document.querySelector("#page-bbs-link");
    nativeActionBox = Array.from(actionScope?.querySelectorAll(".link-reply__operation-box") || [])
      .find((box) => box.closest("[data-comment-id]") === null) || null;
    return nativeActionBox;
  };

  const nativeLike = (): Element | null => articleActionBox()?.querySelector("button:first-child") || null;

  const nativeFavour = (): Element | null => {
    if (nativeFavourButton !== null && nativeFavourButton.isConnected) return nativeFavourButton;
    const scoped = articleActionBox()?.querySelector(".hb-cpt__favour-btn") || null;
    nativeFavourButton = scoped instanceof HTMLButtonElement
      ? scoped
      : Array.from(document.querySelectorAll("#page-bbs-link .hb-cpt__favour-btn"))
        .find((node) => node.closest("[data-comment-id]") === null) || null;
    return nativeFavourButton;
  };

  const readCounts = (): { like: string; favour: string; comment: string } => {
    const values = Array.from(articleActionBox()?.querySelectorAll(".link-reply__operation-desc") || [])
      .map((node) => (node.textContent || "").trim());
    return { like: values[0] || "0", favour: values[1] || "0", comment: values[2] || "0" };
  };

  const formatActionCount = (value: unknown): string => {
    const count = Math.max(0, Number(value) || 0);
    if (count >= 100000000) return (count / 100000000).toFixed(1).replace(/\.0$/, "") + "亿";
    if (count >= 10000) return (count / 10000).toFixed(1).replace(/\.0$/, "") + "万";
    return String(count);
  };

  // The site can keep a valid session while the heybox_id cookie is still missing, so
  // every write takes the resolved account ID instead of reading the cookie directly.
  const postReaderApi = async (
    path: string,
    body: Record<string, string>,
    accountId: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> => {
    if (typeof accountId !== "string" || accountId === "") throw new Error("请先登录小黑盒");
    // Comment creation follows the site's RND-16 flow. The site builds only the
    // signed query and passes all creation fields in the POST body, so target is
    // not repeated in the query.
    const params: Record<string, string> = path === COMMENT_CREATE_API_PATH
      ? await createCommentCreateQuery(path)
      : { ...createApiParams(path), heybox_id: accountId, target: "heybox_app" };
    const query = new URLSearchParams(params);
    const response = await fetchWithTimeout("https://api.xiaoheihe.cn" + path + "?" + query.toString(), {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams(body).toString(),
      ...(signal !== undefined ? { signal } : {}),
    });
    if (!response.ok) throw new Error("接口返回 HTTP " + response.status);
    const payload: unknown = await response.json();
    // A non-object body keeps the original comparison result: status is undefined.
    const data = asRecord(payload) ?? {};
    if (data["status"] === "login") throw new Error("请先登录小黑盒");
    if (data["status"] !== "ok") throw new Error(String(data["msg"] || "操作失败"));
    return data["result"];
  };

  const fetchFavourFolders = async (signal: AbortSignal, accountId: unknown): Promise<FavourFolder[]> => {
    if (typeof accountId !== "string" || accountId === "") throw new Error("请先登录小黑盒");
    const path = "/bbs/app/profile/fav/folders";
    const query = new URLSearchParams({ ...createApiParams(path), heybox_id: accountId, target: "heybox_app" });
    const response = await fetchWithTimeout("https://api.xiaoheihe.cn" + path + "?" + query.toString(), {
      credentials: "include",
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: signal,
    });
    if (!response.ok) throw new Error("接口返回 HTTP " + response.status);
    const payload: unknown = await response.json();
    const data = asRecord(payload) ?? {};
    if (data["status"] === "login") throw new Error("请先登录小黑盒");
    if (data["status"] !== "ok") throw new Error(String(data["msg"] || "获取收藏夹失败"));
    const result = asRecord(data["result"]);
    const folders = result !== null && Array.isArray(result["folders"]) ? result["folders"] : [];
    // Only the folders array is asserted; every folder field is read defensively.
    return normalizeFavourFolders(folders);
  };

  const FAVOUR_SCAN_PAGE_SIZE = 30;
  const FAVOUR_SCAN_MAX_PAGES = 10;
  const FAVOUR_SCAN_MAX_REQUESTS = 48;

  // The observed site bundle does not send folder_id here, so per-folder
  // filtering is unverified. A caller that cannot trust the filter marks the
  // whole folder unknown instead of planning a removal.
  const fetchFavourFolderLinks = async (
    folderId: string,
    offset: number,
    accountId: string,
    signal: AbortSignal,
  ): Promise<{ linkIds: string[]; hasNext: boolean }> => {
    const path = "/bbs/app/profile/fav/folder/v2/links";
    const query = new URLSearchParams({
      ...createApiParams(path),
      heybox_id: accountId,
      target: "heybox_app",
      enable_new_style_collect: "1",
      folder_id: folderId,
      offset: String(offset),
      limit: String(FAVOUR_SCAN_PAGE_SIZE),
      dw: "660",
    });
    const response = await fetchWithTimeout("https://api.xiaoheihe.cn" + path + "?" + query.toString(), {
      credentials: "include",
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: signal,
    });
    if (!response.ok) throw new Error("接口返回 HTTP " + response.status);
    const payload: unknown = await response.json();
    const data = asRecord(payload) ?? {};
    if (data["status"] === "login") throw new Error("请先登录小黑盒");
    if (data["status"] !== "ok") throw new Error(String(data["msg"] || "读取收藏夹失败"));
    return readFavourFolderPage(data["result"]);
  };

  interface FavourFolderScan {
    ids: Set<string>;
    complete: boolean;
  }

  const scanFavourFolder = async (
    folderId: string,
    accountId: string,
    signal: AbortSignal,
    budget: { left: number },
  ): Promise<FavourFolderScan> => {
    const ids = new Set<string>();
    let offset = 0;
    for (let page = 0; page < FAVOUR_SCAN_MAX_PAGES; page += 1) {
      if (budget.left <= 0) return { ids: ids, complete: false };
      budget.left -= 1;
      const result = await fetchFavourFolderLinks(folderId, offset, accountId, signal);
      for (const id of result.linkIds) ids.add(id);
      // A missing pagination flag can still accompany a full page. Only an
      // empty or short page proves this folder was read to the end.
      if (result.linkIds.length < FAVOUR_SCAN_PAGE_SIZE) return { ids: ids, complete: true };
      offset += FAVOUR_SCAN_PAGE_SIZE;
    }
    return { ids: ids, complete: false };
  };

  const scanFavourMemberships = async (
    folders: readonly FavourFolder[],
    accountId: string,
    signal: AbortSignal,
  ): Promise<void> => {
    const scans = new Map<string, FavourFolderScan>();
    const budget = { left: FAVOUR_SCAN_MAX_REQUESTS };
    for (const folder of folders) {
      try {
        scans.set(folder.id, await scanFavourFolder(folder.id, accountId, signal, budget));
      } catch (error) {
        if (isAbortError(error)) throw error;
        scans.set(folder.id, { ids: new Set<string>(), complete: false });
      }
    }
    // Folders that all return the same list mean the server ignored folder_id.
    // Such a duplicate answer says nothing about membership, so keep every
    // checkbox as an add-only option and never remove from it.
    const signatures = new Set<string>();
    let completeScans = 0;
    for (const folder of folders) {
      const scan = scans.get(folder.id);
      if (scan === undefined || !scan.complete) continue;
      completeScans += 1;
      signatures.add(Array.from(scan.ids).sort().join(","));
    }
    const filterSuspicious = folders.length >= 2 && completeScans >= 2 && signatures.size === 1;
    for (const folder of folders) {
      const scan = scans.get(folder.id);
      if (scan === undefined || !scan.complete || filterSuspicious) {
        favourPanelUnknown.add(folder.id);
        continue;
      }
      if (scan.ids.has(articleId)) favourPanelMembers.add(folder.id);
    }
  };

  // A CY or comment published while the first tree page is in flight is missing from
  // that payload, so the resolved link state adds every publish after the request started.
  const addPublishedActions = (link: RailLinkInfo, publishedCy: number, publishedComments: number): RailLinkInfo => {
    if (publishedCy > 0) {
      link.commentCount = (Number(link.commentCount) || 0) + publishedCy;
      link.cyCount = Math.max(0, Number(link.cyCount) || 0) + publishedCy;
    }
    if (publishedComments > 0) {
      link.commentCount = (Number(link.commentCount) || 0) + publishedComments;
    }
    return link;
  };

  // Anonymous reads stay available while the account ID is being restored; the resolved
  // ID is only used to keep per-account caches apart.
  const loadLinkState = async (accountId: unknown = ""): Promise<RailLinkInfo | null> => {
    if (articleId === "") return null;
    if (linkStatePromise !== null) return linkStatePromise;
    const targetId = articleId;
    const resolved = typeof accountId === "string" ? accountId : "";
    const controller = new AbortController();
    linkStateController = controller;
    const publishedAtStart = cyPublishedCount;
    const commentsAtStart = articleCommentPublishedCount;
    linkStatePromise = (async () => {
      try {
        const page = await fetchRailPage(targetId, 1, { signal: controller.signal, accountId: resolved });
        if (articleId !== targetId || linkStateController !== controller) return null;
        const publishedDuringRequest = cyPublishedCount - publishedAtStart;
        const commentsDuringRequest = articleCommentPublishedCount - commentsAtStart;
        linkState = addPublishedActions(page.link, publishedDuringRequest, commentsDuringRequest);
        if (publishedDuringRequest > 0 || commentsDuringRequest > 0) clearRailPageCache(targetId);
        syncActionStates();
        return linkState;
      } catch (error) {
        return null;
      } finally {
        if (linkStateController === controller) {
          linkStateController = null;
          linkStatePromise = null;
        }
      }
    })();
    return linkStatePromise;
  };

  const toggleLike = async (): Promise<void> => {
    if (actionBusy || articleId === "") return;
    actionBusy = true;
    const targetId = articleId;
    const generation = readerGeneration;
    try {
      const accountId = await resolveHeyboxId();
      if (articleId !== targetId || readerGeneration !== generation) return;
      if (accountId === "") throw new Error("请先登录小黑盒");
      const counts = readCounts();
      const current = linkState === null ? await loadLinkState(accountId) : linkState;
      if (articleId !== targetId || readerGeneration !== generation) return;
      const on = current !== null && current.isAward;
      const base = current === null ? parseCompactCount(counts.like) : current.awardCount;
      await postReaderApi("/bbs/app/profile/award/link", {
        link_id: targetId,
        award_type: on ? "0" : "1",
      }, accountId);
      if (articleId !== targetId || readerGeneration !== generation) return;
      linkState = {
        ...(current || {
          isAward: false,
          isFavour: false,
          awardCount: base,
          favourCount: parseCompactCount(counts.favour),
          commentCount: parseCompactCount(counts.comment),
          cyCount: cyPublishedCount,
        }),
        isAward: !on,
        awardCount: Math.max(0, base + (on ? -1 : 1)),
      };
      syncActionStates();
      showToast(on ? "已取消点赞" : "已点赞");
    } catch (error) {
      // A stale failure must not surface a toast for the article now being read.
      if (articleId === targetId && readerGeneration === generation) {
        showToast(error instanceof Error ? error.message : "点赞失败");
      }
    } finally {
      // A stale request must not release the lock held by a newer article.
      if (articleId === targetId && readerGeneration === generation) {
        actionBusy = false;
      }
    }
  };

  const currentFavourPlan = (): FavourChangePlan => planFavourChanges({
    favourited: favourPanelFavourited,
    folderIds: favourPanelFolders.map((folder) => folder.id),
    checkedIds: Array.from(favourPanelChecked),
    memberIds: Array.from(favourPanelMembers),
    unknownIds: Array.from(favourPanelUnknown),
  });

  // A folder write only moves the favourite count on the first add or the
  // last removal, so a multi-folder save still changes the number once.
  const applyFavourState = (next: boolean): void => {
    if (linkState === null || linkState.isFavour === next) return;
    linkState = {
      ...linkState,
      isFavour: next,
      favourCount: Math.max(0, linkState.favourCount + (next ? 1 : -1)),
    };
    syncActionStates();
  };

  const setFavourStatus = (message: string, error = false): void => {
    if (favourPanelStatus === null) return;
    favourPanelStatus.textContent = message;
    if (error) favourPanelStatus.dataset["tone"] = "error";
    else delete favourPanelStatus.dataset["tone"];
  };

  const refreshFavourControls = (): void => {
    if (favourPanel === null) return;
    const busy = favourLoadController !== null || favourSaveBusy || favourCreateBusy;
    for (const control of favourPanel.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, button")) {
      control.disabled = busy;
    }
    if (favourPanelSave !== null) {
      const plan = currentFavourPlan();
      favourPanelSave.disabled = busy || !planHasFavourChange(plan);
    }
    if (favourPanelClose !== null) favourPanelClose.disabled = favourSaveBusy;
  };

  const syncActionStates = (): void => {
    if (host === null) return;
    const like = nativeLike();
    const favour = nativeFavour();
    const counts = linkState === null
      ? readCounts()
      : {
        like: formatActionCount(linkState.awardCount),
        favour: formatActionCount(linkState.favourCount),
        comment: formatActionCount(linkState.commentCount),
      };
    const likeNode = host.querySelector<HTMLElement>('[data-action="like"]');
    const favourNode = host.querySelector<HTMLElement>('[data-action="favour"]');
    const commentNode = host.querySelector<HTMLElement>('[data-action="comment"]');
    if (likeNode !== null) {
      const on = linkState === null
        ? like !== null && (like.getAttribute("aria-pressed") === "true" || like.classList.contains("active"))
        : linkState.isAward;
      likeNode.setAttribute("aria-pressed", String(on));
      const markup = (on ? READER_ICONS.likeOn : READER_ICONS.like) + '<span class="hbu-reader-action-count">' + counts.like + "</span>";
      if (likeNode.innerHTML !== markup) likeNode.innerHTML = markup;
    }
    if (favourNode !== null) {
      const on = linkState === null
        ? favour !== null && (favour.getAttribute("aria-pressed") === "true" || favour.classList.contains("active"))
        : linkState.isFavour;
      favourNode.setAttribute("aria-pressed", String(on));
      const markup = (on ? READER_ICONS.starOn : READER_ICONS.star) + '<span class="hbu-reader-action-count">' + counts.favour + "</span>";
      if (favourNode.innerHTML !== markup) favourNode.innerHTML = markup;
    }
    if (commentNode !== null) {
      const markup = READER_ICONS.comment + '<span class="hbu-reader-action-count">' + counts.comment + "</span>";
      if (commentNode.innerHTML !== markup) commentNode.innerHTML = markup;
    }
    const cyNode = host.querySelector<HTMLElement>('[data-action="cy"]');
    if (cyNode !== null) {
      const cyTotal = linkState === null ? cyPublishedCount : Math.max(0, Number(linkState.cyCount) || 0);
      const label = "CY " + formatActionCount(cyTotal);
      const markup = '<span class="hbu-reader-cy-label">CY</span><span class="hbu-reader-cy-count">' + formatActionCount(cyTotal) + "</span>";
      if (cyNode.innerHTML !== markup) cyNode.innerHTML = markup;
      if (cyNode.title !== label) cyNode.title = label;
      if (cyNode.getAttribute("aria-label") !== label) cyNode.setAttribute("aria-label", label);
    }
    for (const stat of host.querySelectorAll<HTMLElement>("[data-stat]")) {
      const valueNode = stat.querySelector<HTMLElement>("b");
      const key = stat.dataset["stat"];
      if (key !== "like" && key !== "favour" && key !== "comment") continue;
      if (valueNode !== null && valueNode.textContent !== counts[key]) {
        valueNode.textContent = counts[key];
      }
    }
    // The site replaces the header button after a follow change, so re-query every sync.
    const nativeFollowButton = document.querySelector("#page-bbs-link .link-user__follow-btn");
    const on = isFollowedAuthor(nativeFollowButton);
    for (const followNode of host.querySelectorAll<HTMLElement>(".hbu-reader-follow")) {
      followNode.setAttribute("aria-pressed", String(on));
      if (followNode.textContent !== (on ? "已关注" : "关注")) followNode.textContent = on ? "已关注" : "关注";
    }
  };

  const clickNative = (selector: string): void => {
    const node = document.querySelector("#page-bbs-link " + selector);
    if (node instanceof HTMLElement) node.click();
  };

  // Delegate follow toggling to the site button, then resync once its request settles.
  const toggleFollowAuthor = (): void => {
    clickNative(".link-user__follow-btn");
    window.setTimeout(syncActionStates, 400);
    window.setTimeout(syncActionStates, 1200);
  };

  const closeFavourMenu = (focusButton = false, force = false): void => {
    // Writes in flight keep the dialog open; closing it early would hide a
    // partial result and leave the user without feedback.
    if ((favourSaveBusy || favourCreateBusy) && !force) return;
    const wasOpen = favourPanel !== null && !favourPanel.hidden;
    favourLoadController?.abort();
    favourLoadController = null;
    if (favourPanel !== null) {
      favourPanel.hidden = true;
      favourButton?.setAttribute("aria-expanded", "false");
    }
    favourPanelFolders = [];
    favourPanelChecked = new Set<string>();
    favourPanelMembers = new Set<string>();
    favourPanelUnknown = new Set<string>();
    favourPanelFavourited = false;
    if (focusButton && wasOpen) favourButton?.focus({ preventScroll: true });
  };

  // A reader rebuild drops the whole rail, including the dialog. Abort in-flight
  // work and clear every dialog reference so a stale save cannot keep the new
  // article's favourite button locked or paint into detached nodes.
  const resetFavourPanel = (): void => {
    favourLoadController?.abort();
    favourLoadController = null;
    favourSaveController?.abort();
    favourSaveController = null;
    favourCreateController?.abort();
    favourCreateController = null;
    favourMenuBusy = false;
    favourSaveBusy = false;
    favourCreateBusy = false;
    favourPanelFolders = [];
    favourPanelChecked = new Set<string>();
    favourPanelMembers = new Set<string>();
    favourPanelUnknown = new Set<string>();
    favourPanelFavourited = false;
    favourPanel = null;
    favourPanelStatus = null;
    favourPanelList = null;
    favourPanelSave = null;
    favourPanelCreateInput = null;
    favourPanelCreateButton = null;
    favourPanelClose = null;
    favourButton = null;
  };
  document.addEventListener("pointerdown", (event) => {
    if (favourPanel === null || favourPanel.hidden) return;
    const target = event.target instanceof Node ? event.target : null;
    if (favourPanel.contains(target) || favourButton?.contains(target)) return;
    closeFavourMenu();
  }, true);

  const closeSpacingMenu = (): void => {
    if (spacingPanel === null) return;
    spacingPanel.hidden = true;
    spacingButton?.setAttribute("aria-expanded", "false");
  };
  document.addEventListener("pointerdown", (event) => {
    if (spacingPanel === null || spacingPanel.hidden) return;
    const target = event.target instanceof Node ? event.target : null;
    if (spacingPanel.contains(target) || spacingButton?.contains(target)) return;
    closeSpacingMenu();
  }, true);

  const commitSpacingInput = (): void => {
    if (spacingInput === null) return;
    const next = parseReaderLineHeightInput(spacingInput.value);
    const value = next === null ? readReaderLineHeight() : setReaderLineHeightPreference(next);
    spacingInput.value = String(value);
    syncNumberInput(readerLineHeightInput, value);
  };

  const isHistoryDrawerOpen = (): boolean =>
    historyNarrow.matches && host?.dataset["timelineOpen"] === "true";

  /**
   * The same panel is a persistent column on desktop and a drawer below
   * 901px. Keeping one mode function means the scrim, inert state and the
   * toggle's aria-expanded can never disagree after a resize.
   */
  const syncHistoryPanelMode = (): void => {
    if (historyPanel === null) return;
    if (historyNarrow.matches) {
      const open = isHistoryDrawerOpen();
      if (open) historyPanel.removeAttribute("inert");
      else historyPanel.setAttribute("inert", "");
      historyPanel.setAttribute("aria-hidden", String(!open));
      if (historyScrim !== null) historyScrim.hidden = !open;
      historyButton?.setAttribute("aria-expanded", String(open));
      return;
    }
    if (host !== null) delete host.dataset["timelineOpen"];
    historyPanel.removeAttribute("inert");
    historyPanel.removeAttribute("aria-hidden");
    if (historyScrim !== null) historyScrim.hidden = true;
    historyButton?.setAttribute("aria-expanded", "false");
  };

  const openHistoryDrawer = (): void => {
    if (host === null || historyPanel === null || historyButton === null) return;
    closeFavourMenu();
    closeSpacingMenu();
    host.dataset["timelineOpen"] = "true";
    syncHistoryPanelMode();
    const currentRow = historyPanel.querySelector<HTMLButtonElement>(".hbu-reader-history-row[aria-current='true']");
    currentRow?.scrollIntoView?.({ block: "nearest" });
    currentRow?.focus({ preventScroll: true });
  };

  const closeHistoryDrawer = (returnFocus: boolean = false): void => {
    if (host === null) return;
    if (!isHistoryDrawerOpen()) {
      syncHistoryPanelMode();
      return;
    }
    delete host.dataset["timelineOpen"];
    // Move focus out before the drawer turns inert, or the browser drops the
    // caret to the body when the focused row disappears from the tab order.
    if (returnFocus) {
      historyButton?.focus({ preventScroll: true });
    }
    syncHistoryPanelMode();
  };

  document.addEventListener("pointerdown", (event) => {
    if (!isHistoryDrawerOpen() || historyPanel === null) return;
    const target = event.target instanceof Node ? event.target : null;
    if (historyPanel.contains(target) || historyButton?.contains(target)) return;
    closeHistoryDrawer();
  }, true);
  historyNarrow.addEventListener("change", syncHistoryPanelMode);

  /* One label for the row, the peek and the screen reader, so they cannot drift. */
  const historyProgressLabel = (id: string): string => {
    const ratio = readReaderRatio(id);
    if (ratio < 0) return "";
    return ratio >= .98 ? "读完" : Math.round(ratio * 100) + "%";
  };

  /**
   * Rebuilds the visit list. The current entry is highlighted and every other
   * row jumps straight to that post, so the timeline works as a shortcut back
   * through the reading session.
   */
  const renderHistoryPanel = (): void => {
    if (historyList === null || historyRail === null || historyThumb === null) return;
    const status = navigation.readStatus();
    const total = status.history.length;
    const currentIndex = status.history.findIndex((entry) => entry.current);
    if (historyMeta !== null) {
      historyMeta.textContent = total === 0
        ? "还没有访问记录"
        : "共 " + total + " 篇 · 正在阅读第 " + (currentIndex + 1) + " 篇";
    }
    historyList.textContent = "";
    // Newest first reads as a timeline that grows downward toward the post in
    // front of the reader, which is where the eye already is.
    const ordered = status.history.slice().reverse();
    for (const [orderIndex, entry] of ordered.entries()) {
      const item = document.createElement("li");
      item.className = "hbu-reader-history-item";
      if (entry.current) item.dataset["current"] = "true";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "hbu-reader-history-row";
      button.dataset["id"] = entry.id;
      if (entry.current) button.setAttribute("aria-current", "true");
      const marker = document.createElement("span");
      marker.className = "hbu-reader-history-dot";
      const label = document.createElement("span");
      label.className = "hbu-reader-history-title";
      const rowTitle = entry.title === "" ? "帖子 " + entry.id : entry.title;
      label.textContent = rowTitle;
      const visitNumber = total - orderIndex;
      const ratio = readReaderRatio(entry.id);
      const progressText = historyProgressLabel(entry.id);
      button.setAttribute("aria-label", "第 " + visitNumber + " 篇，共 " + total + " 篇：" + rowTitle + (progressText === "" ? "" : ratio >= .98 ? "，已读完" : "，已读 " + progressText) + (entry.current ? "，正在阅读" : ""));
      button.append(marker, label);
      if (ratio >= 0) {
        const bar = document.createElement("span");
        bar.className = "hbu-reader-history-bar";
        bar.setAttribute("aria-hidden", "true");
        const fill = document.createElement("i");
        fill.style.width = Math.max(3, Math.round(ratio * 100)) + "%";
        bar.append(fill);
        button.append(bar);
      }
      if (progressText !== "") {
        const progress = document.createElement("span");
        progress.className = "hbu-reader-history-progress";
        progress.textContent = progressText;
        progress.title = ratio >= .98 ? "上次读到末尾" : "上次读到 " + progressText;
        button.append(progress);
      }
      if (entry.current) {
        const current = document.createElement("span");
        current.className = "hbu-reader-history-current";
        current.textContent = "正在阅读";
        button.append(current);
      }
      button.addEventListener("click", () => {
        if (entry.current) {
          closeHistoryDrawer(true);
          return;
        }
        closeHistoryDrawer();
        openReaderArticle(entry.id);
      });
      button.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        const rows = Array.from(historyList?.querySelectorAll<HTMLButtonElement>(".hbu-reader-history-row") ?? []);
        const at = rows.indexOf(button);
        const next = rows[at + (event.key === "ArrowDown" ? 1 : -1)];
        if (next === undefined) return;
        event.preventDefault();
        next.focus({ preventScroll: false });
      });
      item.append(button);
      historyList.append(item);
    }
    if (ordered.length === 0) {
      const empty = document.createElement("li");
      empty.className = "hbu-reader-history-empty";
      empty.textContent = "读完几篇后，这里会留下访问顺序。";
      historyList.append(empty);
    }
    const previewIndex = Math.max(0, currentIndex);
    historyPreviewX = previewIndex;
    renderHistoryRail(previewIndex, total);
    historyThumb.setAttribute("data-preview", "false");
  };

  /** Places the thumb and its ticks so the rail matches the stored visit order. */
  const renderHistoryRail = (index: number, total: number): void => {
    if (historyRail === null || historyThumb === null) return;
    const track = historyRail.querySelector<HTMLElement>(".hbu-reader-history-track");
    if (track === null) return;
    for (const tick of Array.from(track.querySelectorAll(".hbu-reader-history-tick"))) tick.remove();
    // One dot per visit, capped so a very long trail does not turn into a blur.
    const tickCount = total > 1 && total <= 30 ? total : 0;
    for (let i = 0; i < tickCount; i += 1) {
      const tick = document.createElement("span");
      tick.className = "hbu-reader-history-tick";
      tick.style.top = historyRailOffset(i, total) * 100 + "%";
      track.append(tick);
    }
    historyThumb.style.top = historyRailOffset(index, total) * 100 + "%";
    historyThumb.textContent = total === 0 ? "0/0" : index + 1 + "/" + total;
    historyThumb.setAttribute("aria-valuemin", total === 0 ? "0" : "1");
    historyThumb.setAttribute("aria-valuemax", String(total));
    historyThumb.setAttribute("aria-valuenow", String(total === 0 ? 0 : index + 1));
    historyThumb.setAttribute("aria-valuetext", total === 0 ? "暂无记录" : "第 " + (index + 1) + " 篇，共 " + total + " 篇");
    historyThumb.disabled = total === 0;
    historyRail.hidden = total === 0;
    if (historyPeek !== null) {
      const entry = navigation.readStatus().history[index];
      if (entry === undefined || entry.title === "") historyPeek.textContent = "";
      else {
        const progress = historyProgressLabel(entry.id);
        historyPeek.textContent = entry.title + (progress === "" ? "" : " · " + progress);
      }
      historyPeek.hidden = historyPeek.textContent === "";
    }
  };

  /** The rail mirrors the list above it: the newest visit sits at the top. */
  const historyRailOffset = (index: number, total: number): number => {
    if (total <= 1) return 0;
    return (total - 1 - index) / (total - 1);
  };

  const historyIndexFromRatio = (ratio: number, total: number): number => {
    if (total <= 0) return 0;
    const clamped = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
    return total - 1 - Math.round(clamped * (total - 1));
  };

  /** Moves the thumb to a visit number without leaving the post on screen. */
  const previewHistoryIndex = (index: number): number => {
    const total = navigation.readStatus().history.length;
    const next = Math.min(Math.max(0, index), Math.max(0, total - 1));
    historyPreviewX = next;
    renderHistoryRail(next, total);
    historyThumb?.setAttribute("data-preview", "true");
    if (historyList !== null) {
      const rows = Array.from(historyList.querySelectorAll<HTMLButtonElement>(".hbu-reader-history-row"));
      const previewRow = rows[total - 1 - next];
      for (const row of rows) row.removeAttribute("data-preview");
      previewRow?.setAttribute("data-preview", "true");
      previewRow?.scrollIntoView?.({ block: "nearest" });
    }
    return next;
  };

  const commitHistoryIndex = (index: number): void => {
    const entry = navigation.readStatus().history[index];
    if (entry === undefined || entry.current) {
      renderHistoryPanel();
      return;
    }
    closeHistoryDrawer();
    openReaderArticle(entry.id);
  };

  /**
   * Binds drag, track clicks and arrow keys to the rail. Every gesture previews
   * the target visit in the thumb and only opens the post once the pointer is
   * released, so a long drag never fires a burst of navigations.
   */
  const bindHistoryRail = (railBody: HTMLDivElement, track: HTMLElement, thumb: HTMLButtonElement): void => {
    let dragging = false;
    const ratioAt = (clientY: number): number => {
      const rect = railBody.getBoundingClientRect();
      if (rect.height <= 0) return 0;
      return (clientY - rect.top) / rect.height;
    };
    const moveTo = (clientY: number): number => {
      const total = navigation.readStatus().history.length;
      return previewHistoryIndex(historyIndexFromRatio(ratioAt(clientY), total));
    };
    const endDrag = (event: PointerEvent): void => {
      if (!dragging) return;
      dragging = false;
      thumb.dataset["dragging"] = "false";
      if (thumb.hasPointerCapture(event.pointerId)) thumb.releasePointerCapture(event.pointerId);
      commitHistoryIndex(historyPreviewX);
    };
    thumb.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      dragging = true;
      thumb.dataset["dragging"] = "true";
      thumb.setPointerCapture(event.pointerId);
      moveTo(event.clientY);
    });
    thumb.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      moveTo(event.clientY);
    });
    thumb.addEventListener("pointerup", endDrag);
    thumb.addEventListener("pointercancel", (event) => {
      if (!dragging) return;
      dragging = false;
      thumb.dataset["dragging"] = "false";
      if (thumb.hasPointerCapture(event.pointerId)) thumb.releasePointerCapture(event.pointerId);
      renderHistoryPanel();
    });
    track.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      commitHistoryIndex(moveTo(event.clientY));
    });
    thumb.addEventListener("keydown", (event) => {
      const total = navigation.readStatus().history.length;
      if (total === 0) return;
      let next = historyPreviewX;
      // Up walks toward the newer visits at the top, down toward older ones.
      if (event.key === "ArrowUp" || event.key === "ArrowRight") next += 1;
      else if (event.key === "ArrowDown" || event.key === "ArrowLeft") next -= 1;
      else if (event.key === "Home") next = total - 1;
      else if (event.key === "End") next = 0;
      else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        commitHistoryIndex(historyPreviewX);
        return;
      } else return;
      event.preventDefault();
      previewHistoryIndex(next);
    });
  };

  /**
   * Mounts the timeline into the reader shell. On wide screens it is a column
   * that is always on screen; below 901px CSS folds it into a drawer that the
   * rail toggles. Only the drawer changes `hidden` semantics through inert.
   */
  const mountHistoryTimeline = (): void => {
    if (host === null || historyPanel !== null) return;
    const panel = document.createElement("div");
    panel.className = "hbu-reader-history-menu";
    panel.setAttribute("role", "group");
    panel.setAttribute("aria-label", "阅读时间轴");
    panel.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !isHistoryDrawerOpen()) return;
      event.preventDefault();
      event.stopPropagation();
      closeHistoryDrawer(true);
    });
    const heading = document.createElement("div");
    heading.className = "hbu-reader-history-head";
    const headText = document.createElement("div");
    headText.className = "hbu-reader-history-head-text";
    const label = document.createElement("div");
    label.className = "hbu-reader-history-label";
    label.textContent = "阅读时间轴";
    const meta = document.createElement("div");
    meta.className = "hbu-reader-history-meta";
    meta.setAttribute("aria-live", "polite");
    headText.append(label, meta);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "hbu-reader-history-close";
    close.setAttribute("aria-label", "关闭阅读时间轴");
    close.innerHTML = READER_ICONS.close;
    close.addEventListener("click", () => closeHistoryDrawer(true));
    heading.append(headText, close);
    const body = document.createElement("div");
    body.className = "hbu-reader-history-body";
    const list = document.createElement("ol");
    list.className = "hbu-reader-history-list";
    const railTrack = document.createElement("div");
    railTrack.className = "hbu-reader-history-track";
    const thumb = document.createElement("button");
    thumb.type = "button";
    thumb.className = "hbu-reader-history-thumb";
    thumb.setAttribute("role", "slider");
    thumb.setAttribute("aria-label", "阅读时间轴位置");
    thumb.setAttribute("aria-orientation", "vertical");
    thumb.setAttribute("aria-valuemin", "0");
    thumb.setAttribute("aria-valuemax", "0");
    thumb.setAttribute("aria-valuenow", "0");
    thumb.title = "拖动快速跳转，点击跳回当前篇";
    const railBody = document.createElement("div");
    railBody.className = "hbu-reader-history-rail";
    railBody.append(railTrack, thumb);
    const peek = document.createElement("div");
    peek.className = "hbu-reader-history-peek";
    peek.hidden = true;
    peek.setAttribute("role", "status");
    peek.setAttribute("aria-live", "polite");
    peek.setAttribute("aria-atomic", "true");
    body.append(list, railBody);
    panel.append(heading, body, peek);
    const scrim = document.createElement("div");
    scrim.className = "hbu-reader-history-scrim";
    scrim.hidden = true;
    scrim.addEventListener("pointerdown", () => closeHistoryDrawer(true));
    historyPanel = panel;
    historyMeta = meta;
    historyList = list;
    historyRail = railBody;
    historyThumb = thumb;
    historyPeek = peek;
    historyScrim = scrim;
    bindHistoryRail(railBody, railTrack, thumb);
    host.append(scrim, panel);
    renderHistoryPanel();
    syncHistoryPanelMode();
    const currentRow = panel.querySelector<HTMLButtonElement>(".hbu-reader-history-row[aria-current='true']");
    currentRow?.scrollIntoView?.({ block: "nearest" });
  };

  const createHistoryAction = (): HTMLButtonElement => {
    const history = document.createElement("button");
    history.type = "button";
    history.className = "hbu-reader-action";
    history.dataset["action"] = "history";
    history.setAttribute("aria-label", "阅读时间轴");
    history.setAttribute("aria-haspopup", "true");
    history.setAttribute("aria-expanded", "false");
    history.title = "阅读时间轴";
    history.innerHTML = READER_ICONS.history;
    history.addEventListener("click", () => {
      if (isHistoryDrawerOpen()) closeHistoryDrawer(true);
      else openHistoryDrawer();
    });
    return history;
  };

  const syncHistoryTimeline = (): void => {
    if (host === null) return;
    const rail = host.querySelector<HTMLElement>(".hbu-reader-rail");
    if (rail === null) return;
    const existing = rail.querySelector<HTMLButtonElement>('[data-action="history"]');
    if (!readReaderTimelinePreference()) {
      delete host.dataset["timelineOpen"];
      host.classList.remove("hbu-reader-has-timeline");
      existing?.remove();
      historyPanel?.remove();
      historyScrim?.remove();
      historyPanel = null;
      historyMeta = null;
      historyList = null;
      historyRail = null;
      historyThumb = null;
      historyPeek = null;
      historyScrim = null;
      historyButton = null;
      historyPreviewX = 0;
      return;
    }
    host.classList.add("hbu-reader-has-timeline");
    historyButton = existing;
    if (historyButton === null) {
      const spacing = rail.querySelector<HTMLElement>('[data-action="spacing"]');
      const history = createHistoryAction();
      historyButton = history;
      if (spacing === null) rail.append(history);
      else rail.insertBefore(history, spacing);
    }
    if (historyPanel === null) mountHistoryTimeline();
    else renderHistoryPanel();
    syncHistoryPanelMode();
  };

  const openSpacingMenu = (rail: HTMLElement, button: HTMLButtonElement): void => {
    if (spacingPanel !== null && !spacingPanel.hidden) {
      closeSpacingMenu();
      button.focus({ preventScroll: true });
      return;
    }
    closeFavourMenu();
    closeHistoryDrawer();
    if (spacingPanel === null) {
      const panel = document.createElement("div");
      panel.className = "hbu-reader-spacing-menu";
      panel.hidden = true;
      panel.setAttribute("role", "group");
      panel.setAttribute("aria-label", "沉浸阅读设置");
      const label = document.createElement("div");
      label.className = "hbu-reader-spacing-label";
      label.textContent = "正文行距";
      const row = document.createElement("div");
      row.className = "hbu-reader-spacing-row";
      const input = document.createElement("input");
      input.type = "number";
      input.min = String(READER_LINE_HEIGHT_MIN);
      input.max = String(READER_LINE_HEIGHT_MAX);
      input.step = String(READER_LINE_HEIGHT_STEP);
      input.inputMode = "decimal";
      input.setAttribute("aria-label", "正文行距倍数");
      input.title = "正文行距 " + READER_LINE_HEIGHT_MIN + " - " + READER_LINE_HEIGHT_MAX + " 倍";
      const unit = document.createElement("span");
      unit.className = "hbu-reader-spacing-unit";
      unit.textContent = "倍";
      const reset = document.createElement("button");
      reset.type = "button";
      reset.className = "hbu-reader-spacing-reset";
      reset.textContent = "默认";
      reset.title = "恢复默认行距 " + READER_LINE_HEIGHT_DEFAULT + " 倍";
      reset.addEventListener("click", () => {
        const value = setReaderLineHeightPreference(READER_LINE_HEIGHT_DEFAULT);
        if (spacingInput !== null) spacingInput.value = String(value);
        syncNumberInput(readerLineHeightInput, value);
      });
      row.append(input, unit, reset);
      const spacingSection = document.createElement("div");
      spacingSection.className = "hbu-reader-setting-section";
      spacingSection.append(label, row);
      const historySection = document.createElement("div");
      historySection.className = "hbu-reader-setting-section";
      const timelineToggle = document.createElement("button");
      timelineToggle.type = "button";
      timelineToggle.className = "hbu-reader-setting-switch";
      timelineToggle.setAttribute("role", "switch");
      timelineToggle.setAttribute("aria-label", "启用阅读时间轴");
      timelineToggle.textContent = "显示阅读时间轴";
      timelineToggle.setAttribute("aria-checked", String(readReaderTimelinePreference()));
      timelineToggle.addEventListener("click", () => {
        const enabled = timelineToggle.getAttribute("aria-checked") !== "true";
        timelineToggle.setAttribute("aria-checked", String(enabled));
        setReaderTimelinePreference(enabled);
      });
      const historyLine = document.createElement("label");
      historyLine.className = "hbu-reader-setting-line";
      historyLine.textContent = "时间轴保留条数";
      const historyInput = document.createElement("input");
      historyInput.type = "number";
      historyInput.min = "0";
      historyInput.step = "1";
      historyInput.inputMode = "numeric";
      historyInput.setAttribute("aria-label", "时间轴保留条数，0 表示不限");
      historyInput.title = "设置为 0 表示不限条数";
      historyInput.value = String(readReaderHistoryLimit());
      historyInput.addEventListener("change", () => {
        const parsed = parseReaderHistoryLimitInput(historyInput.value);
        const value = parsed === null ? readReaderHistoryLimit() : setReaderHistoryLimitPreference(parsed);
        historyInput.value = String(value);
      });
      historyLine.append(historyInput);
      historySection.append(timelineToggle, historyLine);
      panel.append(spacingSection, historySection);
      bindNumberInput(input, commitSpacingInput);
      spacingPanel = panel;
      spacingInput = input;
    }
    spacingButton = button;
    if (spacingPanel.parentNode !== rail) rail.append(spacingPanel);
    if (spacingInput === null) return;
    spacingInput.value = String(readReaderLineHeight());
    const timelineToggle = spacingPanel.querySelector<HTMLButtonElement>(".hbu-reader-setting-switch");
    timelineToggle?.setAttribute("aria-checked", String(readReaderTimelinePreference()));
    const historyInput = spacingPanel.querySelector<HTMLInputElement>(".hbu-reader-setting-line input");
    if (historyInput !== null) historyInput.value = String(readReaderHistoryLimit());
    spacingPanel.hidden = false;
    button.setAttribute("aria-expanded", "true");
    spacingInput.focus({ preventScroll: true });
  };

  const ensureFavourPanel = (rail: HTMLElement): HTMLDivElement => {
    if (favourPanel === null) {
      const panel = document.createElement("div");
      panel.className = "hbu-reader-favour-menu";
      panel.hidden = true;
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", "收藏到收藏夹");
      const head = document.createElement("div");
      head.className = "hbu-reader-favour-head";
      const title = document.createElement("span");
      title.textContent = "收藏到收藏夹";
      const close = document.createElement("button");
      close.type = "button";
      close.className = "hbu-reader-favour-close";
      close.setAttribute("aria-label", "关闭收藏夹面板");
      close.textContent = "×";
      close.addEventListener("click", () => closeFavourMenu(true));
      head.append(title, close);
      const status = document.createElement("div");
      status.className = "hbu-reader-favour-status";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      const list = document.createElement("div");
      list.className = "hbu-reader-favour-list";
      list.setAttribute("role", "group");
      list.setAttribute("aria-label", "收藏夹");
      const create = document.createElement("div");
      create.className = "hbu-reader-favour-create";
      const input = document.createElement("input");
      input.type = "text";
      input.className = "hbu-reader-favour-create-input";
      input.maxLength = 30;
      input.placeholder = "新建收藏夹";
      input.setAttribute("aria-label", "新收藏夹名称");
      const createButton = document.createElement("button");
      createButton.type = "button";
      createButton.className = "hbu-reader-favour-create-btn";
      createButton.textContent = "创建";
      createButton.addEventListener("click", () => void createFavourFolder());
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        void createFavourFolder();
      });
      create.append(input, createButton);
      const actions = document.createElement("div");
      actions.className = "hbu-reader-favour-actions";
      const save = document.createElement("button");
      save.type = "button";
      save.className = "hbu-reader-favour-save";
      save.textContent = "保存";
      save.addEventListener("click", () => void saveFavourChanges());
      actions.append(save);
      panel.append(head, status, list, create, actions);
      rail.append(panel);
      favourPanel = panel;
      favourPanelStatus = status;
      favourPanelList = list;
      favourPanelSave = save;
      favourPanelCreateInput = input;
      favourPanelCreateButton = createButton;
      favourPanelClose = close;
    }
    if (favourPanel.parentNode !== rail) rail.append(favourPanel);
    return favourPanel;
  };

  const renderFavourFolderList = (): void => {
    if (favourPanelList === null) return;
    const list = favourPanelList;
    if (favourPanelFolders.length === 0) {
      const empty = document.createElement("div");
      empty.className = "hbu-reader-favour-empty";
      empty.textContent = "还没有收藏夹，可在下方新建";
      list.replaceChildren(empty);
      refreshFavourControls();
      return;
    }
    const rows: HTMLElement[] = [];
    for (const folder of favourPanelFolders) {
      const option = document.createElement("label");
      option.className = "hbu-reader-favour-option";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = folder.id;
      input.checked = favourPanelChecked.has(folder.id);
      input.addEventListener("change", () => {
        if (input.checked) favourPanelChecked.add(folder.id);
        else favourPanelChecked.delete(folder.id);
        refreshFavourControls();
      });
      const name = document.createElement("span");
      name.className = "hbu-reader-favour-name";
      name.textContent = folder.name;
      name.title = folder.name;
      option.append(input, name);
      if (favourPanelUnknown.has(folder.id)) {
        const tag = document.createElement("span");
        tag.className = "hbu-reader-favour-tag";
        tag.textContent = "待核对";
        tag.title = "未能读取该收藏夹的收藏状态，取消勾选不会移除";
        option.append(tag);
      }
      rows.push(option);
    }
    list.replaceChildren(...rows);
    refreshFavourControls();
  };

  const createFavourFolder = async (): Promise<void> => {
    if (favourPanelCreateInput === null || favourPanel === null) return;
    if (favourCreateBusy || favourSaveBusy || favourLoadController !== null || articleId === "") return;
    const name = favourPanelCreateInput.value.trim();
    if (name === "") {
      setFavourStatus("请输入收藏夹名称", true);
      favourPanelCreateInput.focus({ preventScroll: true });
      return;
    }
    const targetId = articleId;
    const generation = readerGeneration;
    const previousIds = new Set(favourPanelFolders.map((folder) => folder.id));
    favourCreateBusy = true;
    const controller = new AbortController();
    favourCreateController = controller;
    refreshFavourControls();
    setFavourStatus("正在创建收藏夹…");
    let message = "";
    let created: FavourFolder | null = null;
    try {
      const accountId = await resolveHeyboxId();
      if (accountId === "") throw new Error("请先登录小黑盒");
      const result = await postReaderApi("/bbs/app/profile/fav/folder/add", { name: name }, accountId, controller.signal);
      if (articleId !== targetId || readerGeneration !== generation || favourCreateController !== controller) return;
      const createdId = readFavourFolderId(result);
      const loadController = new AbortController();
      favourLoadController = loadController;
      let folders: FavourFolder[];
      try {
        folders = await fetchFavourFolders(loadController.signal, accountId);
      } catch (error) {
        if (isAbortError(error)) throw error;
        folders = favourPanelFolders.slice();
      } finally {
        if (favourLoadController === loadController) favourLoadController = null;
      }
      if (articleId !== targetId || readerGeneration !== generation || favourCreateController !== controller) return;
      let id = createdId;
      if (id === "") {
        const fresh = folders.find((folder) => !previousIds.has(folder.id) && folder.name === name);
        if (fresh !== undefined) id = fresh.id;
      }
      favourPanelFolders = folders;
      if (id !== "") {
        created = { id: id, name: name };
        if (!favourPanelFolders.some((folder) => folder.id === id)) {
          favourPanelFolders = favourPanelFolders.concat([created]);
        }
        favourPanelChecked.add(id);
        favourPanelMembers.delete(id);
        favourPanelUnknown.delete(id);
        message = "已创建收藏夹「" + name + "」，勾选后保存";
      } else {
        message = "已创建收藏夹，请重新打开面板后勾选";
      }
      if (favourPanelCreateInput !== null) favourPanelCreateInput.value = "";
    } catch (error) {
      if (isAbortError(error)) return;
      setFavourStatus("创建收藏夹失败：" + (error instanceof Error ? error.message : "请稍后重试"), true);
    } finally {
      if (favourCreateController === controller) {
        favourCreateController = null;
        favourCreateBusy = false;
        refreshFavourControls();
      }
    }
    if (articleId !== targetId || readerGeneration !== generation) return;
    renderFavourFolderList();
    if (message !== "") setFavourStatus(message);
  };

  const saveFavourChanges = async (): Promise<void> => {
    if (favourSaveBusy || favourCreateBusy || favourMenuBusy || articleId === "") return;
    if (favourPanel === null || favourLoadController !== null) return;
    const plan = currentFavourPlan();
    if (!favourPanelFavourited && favourPanelChecked.size === 0) {
      setFavourStatus("请至少选择一个收藏夹", true);
      return;
    }
    if (!planHasFavourChange(plan)) {
      setFavourStatus(favourPanelUnknown.size > 0
        ? "没有可保存的变更，部分收藏夹未核对"
        : "没有需要保存的变更");
      return;
    }
    const targetId = articleId;
    const generation = readerGeneration;
    favourSaveBusy = true;
    const controller = new AbortController();
    favourSaveController = controller;
    refreshFavourControls();
    setFavourStatus("正在保存…");
    const appliedAdd: string[] = [];
    const appliedRemove: string[] = [];
    let removeAll = false;
    let failure = "";
    try {
      const userId = await resolveHeyboxId();
      if (userId === "") throw new Error("请先登录小黑盒");
      // Adds run before removals so a failed request never leaves the link
      // unfavourited while the reader still shows it as favourited.
      for (const id of plan.addIds) {
        await postReaderApi("/bbs/app/link/favour", {
          favour_type: "1",
          link_id: targetId,
          userid: userId,
          folder_id: id,
        }, userId, controller.signal);
        appliedAdd.push(id);
      }
      if (plan.removeAll) {
        await postReaderApi("/bbs/app/link/favour", {
          favour_type: "2",
          link_id: targetId,
          userid: userId,
          folder_id: "",
        }, userId, controller.signal);
        removeAll = true;
      } else {
        for (const id of plan.removeIds) {
          await postReaderApi("/bbs/app/link/favour", {
            favour_type: "2",
            link_id: targetId,
            userid: userId,
            folder_id: id,
          }, userId, controller.signal);
          appliedRemove.push(id);
        }
      }
    } catch (error) {
      failure = error instanceof Error ? error.message : "收藏保存失败";
    } finally {
      if (favourSaveController === controller) {
        favourSaveController = null;
        favourSaveBusy = false;
      }
    }
    if (articleId !== targetId || readerGeneration !== generation) return;
    const appliedPlan: FavourChangePlan = {
      addIds: appliedAdd,
      removeIds: appliedRemove,
      removeAll: removeAll,
      unknownIds: plan.unknownIds,
    };
    const nextFavourited = resolveFavourOutcome(favourPanelFavourited, Array.from(favourPanelMembers), appliedPlan);
    const wasFavourited = favourPanelFavourited;
    if (nextFavourited !== wasFavourited) applyFavourState(nextFavourited);
    if (failure !== "") {
      for (const id of appliedAdd) {
        favourPanelChecked.add(id);
        favourPanelMembers.add(id);
        favourPanelUnknown.delete(id);
      }
      for (const id of appliedRemove) {
        favourPanelChecked.delete(id);
        favourPanelMembers.delete(id);
      }
      favourPanelFavourited = nextFavourited;
      renderFavourFolderList();
      setFavourStatus("保存失败：" + failure + "。已完成的修改已保留，可再次保存。", true);
      return;
    }
    closeFavourMenu(true);
    showToast(wasFavourited ? "已更新收藏夹" : "已收藏");
  };

  const showFavourPanel = async (rail: HTMLElement, button: HTMLButtonElement, accountId: string): Promise<void> => {
    ensureFavourPanel(rail);
    if (favourPanel === null) return;
    favourButton = button;
    favourPanel.hidden = false;
    button.setAttribute("aria-expanded", "true");
    favourPanelFolders = [];
    favourPanelChecked = new Set<string>();
    favourPanelMembers = new Set<string>();
    favourPanelUnknown = new Set<string>();
    favourPanelFavourited = linkState !== null && linkState.isFavour;
    renderFavourFolderList();
    setFavourStatus("正在读取收藏夹…");
    favourLoadController?.abort();
    const controller = new AbortController();
    favourLoadController = controller;
    refreshFavourControls();
    favourPanelClose?.focus({ preventScroll: true });
    let folders: FavourFolder[];
    try {
      folders = await fetchFavourFolders(controller.signal, accountId);
    } catch (error) {
      if (isAbortError(error) || favourPanel === null || favourLoadController !== controller) return;
      favourLoadController = null;
      refreshFavourControls();
      setFavourStatus(error instanceof Error ? error.message : "获取收藏夹失败", true);
      return;
    }
    if (favourPanel === null || favourLoadController !== controller) return;
    favourPanelFolders = folders;
    renderFavourFolderList();
    if (folders.length === 0) {
      favourLoadController = null;
      refreshFavourControls();
      setFavourStatus("还没有收藏夹，可在下方新建");
      return;
    }
    if (!favourPanelFavourited) {
      favourLoadController = null;
      refreshFavourControls();
      setFavourStatus("勾选要收藏到的收藏夹，然后保存");
      return;
    }
    setFavourStatus("正在核对收藏夹…");
    try {
      await scanFavourMemberships(folders, accountId, controller.signal);
    } catch (error) {
      if (!isAbortError(error)) {
        for (const folder of folders) favourPanelUnknown.add(folder.id);
      }
    }
    if (favourPanel === null || favourLoadController !== controller) return;
    favourLoadController = null;
    renderFavourFolderList();
    setFavourStatus(favourPanelUnknown.size > 0
      ? "部分收藏夹未能核对，未勾选的不会移除"
      : "勾选加入，取消勾选移除，然后保存");
  };

  const openFavourMenu = async (rail: HTMLElement, button: HTMLButtonElement): Promise<void> => {
    if (favourMenuBusy || favourSaveBusy) return;
    if (favourPanel !== null && !favourPanel.hidden) {
      closeFavourMenu(true);
      return;
    }
    closeSpacingMenu();
    closeHistoryDrawer();
    const targetId = articleId;
    const generation = readerGeneration;
    favourMenuBusy = true;
    try {
      const accountId = await resolveHeyboxId();
      if (articleId !== targetId || readerGeneration !== generation || !rail.isConnected || host === null) return;
      if (accountId === "") {
        showToast("请先登录小黑盒");
        return;
      }
      if (linkState === null) await loadLinkState(accountId);
      if (articleId !== targetId || readerGeneration !== generation || !rail.isConnected || host === null) return;
      await showFavourPanel(rail, button, accountId);
    } finally {
      favourMenuBusy = false;
    }
  };

  const closeCyDialog = (): void => {
    if (cyDialog === null) return;
    cyDialog.remove();
    cyDialog = null;
    cyTextarea = null;
    cySubmit = null;
    cyStatus = null;
    if (host !== null && !isCommentPanelOpen()) {
      host.querySelector<HTMLElement>('[data-action="cy"]')?.focus({ preventScroll: true });
    }
  };

  const submitCy = async (): Promise<void> => {
    if (cyBusy || cyTextarea === null || cySubmit === null || cyStatus === null) return;
    const text = cyTextarea.value.trim();
    if (text === "") {
      cyStatus.textContent = "请输入 CY 内容";
      cyTextarea.focus();
      return;
    }
    cyBusy = true;
    cySubmit.disabled = true;
    cySubmit.textContent = "发布中…";
    cyStatus.textContent = "";
    const targetId = articleId;
    const generation = readerGeneration;
    try {
      const accountId = await resolveHeyboxId();
      if (articleId !== targetId || readerGeneration !== generation) return;
      if (accountId === "") throw new Error("请先登录小黑盒");
      await postReaderApi(COMMENT_CREATE_API_PATH, {
        is_cy: "1",
        link_id: targetId,
        reply_id: "-1",
        root_id: "-1",
        text: text,
      }, accountId);
      if (articleId !== targetId || readerGeneration !== generation) return;
      cyPublishedCount += 1;
      // A CY is a comment too, so the same write invalidates cached pages.
      holdRailPageCache(targetId);
      if (linkState !== null) {
        addPublishedActions(linkState, 1, 0);
      } else {
        void loadLinkState(accountId);
      }
      showToast("CY 已发布");
      closeCyDialog();
      syncActionStates();
    } catch (error) {
      // The dialog is rebuilt per article, so a stale failure must not paint its
      // message into the CY status area of the article now being read.
      if (articleId === targetId && readerGeneration === generation && cyStatus !== null) {
        cyStatus.textContent = error instanceof Error ? error.message : "CY 发布失败";
      }
    } finally {
      // A stale request must not release the lock held by a newer article.
      if (articleId === targetId && readerGeneration === generation) {
        cyBusy = false;
        if (cySubmit !== null) {
          cySubmit.disabled = false;
          cySubmit.textContent = "发布";
        }
      }
    }
  };

  const openCyDialog = (): void => {
    if (host === null) return;
    closeFavourMenu();
    if (cyDialog !== null) {
      cyDialog.hidden = false;
      cyTextarea?.focus({ preventScroll: true });
      return;
    }
    const dialog = document.createElement("div");
    dialog.className = "hbu-reader-cy-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "发布 CY");
    const card = document.createElement("div");
    card.className = "hbu-reader-cy-card";
    const head = document.createElement("div");
    head.className = "hbu-reader-cy-head";
    const title = document.createElement("span");
    title.textContent = "发布 CY";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "hbu-reader-cy-close";
    close.setAttribute("aria-label", "关闭 CY 输入框");
    close.innerHTML = READER_ICONS.close;
    close.addEventListener("click", closeCyDialog);
    head.append(title, close);
    const textarea = document.createElement("textarea");
    textarea.className = "hbu-reader-cy-text";
    textarea.maxLength = 1000;
    textarea.placeholder = "写下这次插眼的内容…";
    textarea.setAttribute("aria-label", "CY 内容");
    const status = document.createElement("div");
    status.className = "hbu-reader-cy-status";
    status.setAttribute("role", "status");
    const actions = document.createElement("div");
    actions.className = "hbu-reader-cy-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "取消";
    cancel.addEventListener("click", closeCyDialog);
    const submit = document.createElement("button");
    submit.type = "button";
    submit.dataset["primary"] = "true";
    submit.textContent = "发布";
    // Reopening the dialog while a publish is still in flight must not offer an
    // enabled button that silently ignores clicks.
    if (cyBusy) {
      submit.disabled = true;
      submit.textContent = "发布中…";
    }
    submit.addEventListener("click", () => void submitCy());
    actions.append(cancel, submit);
    card.append(head, textarea, status, actions);
    dialog.append(card);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeCyDialog();
    });
    dialog.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>("button, textarea"))
        .filter((node) => node.getBoundingClientRect().width > 0);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    });
    cyDialog = dialog;
    cyTextarea = textarea;
    cySubmit = submit;
    cyStatus = status;
    host.append(dialog);
    textarea.focus({ preventScroll: true });
  };

  const fillReaderCommentBody = (node: HTMLElement, segments: readonly RailSegment[]): void => {
    if (segments.length === 0) {
      node.textContent = "（图片或表情评论）";
      return;
    }
    for (const segment of segments) {
      if (segment.type === "text") {
        node.append(document.createTextNode(segment.text));
        continue;
      }
      if (segment.type === "emoji") {
        const emoji = document.createElement("span");
        emoji.className = "hbu-reader-comments-emoji";
        emoji.setAttribute("role", "img");
        emoji.setAttribute("aria-label", "表情");
        applyRailEmojiStyle(emoji, segment);
        node.append(emoji);
        continue;
      }
      const image = document.createElement("img");
      image.className = "hbu-reader-comments-image";
      image.alt = "";
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";
      image.src = segment.src;
      image.alt = "评论图片";
      bindLightboxTrigger(image, () => segment.src);
      node.append(image);
    }
  };

  const createReaderCommentDeleteButton = (comment: RailComment): HTMLButtonElement | null => {
    // A row the site has not echoed back yet has no usable id, so it cannot be
    // deleted or replied to until a refresh replaces it with the real comment.
    if (comment.id === "" || isPendingReplyRow(comment.id)) return null;
    if (!isOwnRailComment(comment, readerAccountId)) return null;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "hbu-reader-comments-delete";
    remove.textContent = commentDeleteBusy.has(comment.id) ? "删除中…" : "删除";
    remove.setAttribute("aria-label", "删除这条评论");
    remove.dataset["deleteId"] = comment.id;
    remove.disabled = commentDeleteBusy.has(comment.id);
    return remove;
  };

  const readerCommentProfileHref = (userId: string): string => "/app/user/profile/" + encodeURIComponent(userId);

  const createReaderCommentAvatar = (comment: RailComment, small: boolean): HTMLElement => {
    const avatar = document.createElement("img");
    avatar.className = "hbu-reader-comments-avatar";
    avatar.alt = "";
    avatar.loading = "lazy";
    avatar.referrerPolicy = "no-referrer";
    if (comment.avatar !== "") avatar.src = comment.avatar;
    // The wrapper owns the fixed avatar size, so a comment without a profile
    // link keeps the same 34px or 24px box as a linked avatar.
    const wrapperClass = "hbu-reader-comments-avatar-link" + (small ? " hbu-reader-comments-avatar-link--child" : "");
    if (comment.userId === "") {
      const span = document.createElement("span");
      span.className = wrapperClass;
      span.append(avatar);
      return span;
    }
    const link = document.createElement("a");
    link.className = wrapperClass;
    link.href = readerCommentProfileHref(comment.userId);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute("aria-label", "查看 " + comment.name + " 的主页");
    link.title = "查看 " + comment.name + " 的主页";
    link.append(avatar);
    return link;
  };

  const createReaderCommentName = (comment: RailComment): HTMLElement => {
    const name = document.createElement("span");
    name.className = "hbu-reader-comments-name";
    name.textContent = comment.name;
    if (comment.userId === "") return name;
    const link = document.createElement("a");
    link.className = "hbu-reader-comments-name-link";
    link.href = readerCommentProfileHref(comment.userId);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute("aria-label", "查看 " + comment.name + " 的主页");
    link.title = comment.name + " 的主页";
    link.append(name);
    return link;
  };

  // A hidden CY node takes its whole branch with it, so a reply is never shown
  // without the comment it answers.
  const filterReaderCommentThread = (
    nodes: readonly RailCommentThreadNode[],
    hideCy: boolean,
  ): RailCommentThreadNode[] => nodes
    .filter((node) => !hideCy || node.isCy !== true)
    .map((node) => ({ ...node, children: filterReaderCommentThread(node.children, hideCy) }));

  // A reply can carry the floor id, or only the id of the comment it answers
  // when the site reports no root. Both resolve to the floor that owns it, so
  // the local row is never dropped for lack of a usable root id.
  const resolvePendingFloorId = (items: readonly RailCommentEntry[], pending: RailComment): string => {
    if (pending.rootId !== "" && items.some((item) => item.id === pending.rootId)) return pending.rootId;
    return findRailFloorIdForComment(items, pending.parentId);
  };

  // Replies are attached to their floor before the tree is built, so a reply
  // that the site has not echoed back yet is still visible right after publish.
  const readPendingRepliesFor = (floorId: string): RailComment[] => commentState.pendingReplies.filter((pending) =>
    resolvePendingFloorId(commentState.items, pending) === floorId);

  const withPendingReplies = (entry: RailCommentEntry): RailCommentEntry =>
    attachRailPendingReplies(entry, readPendingRepliesFor(entry.id));

  // A row that only lives in this panel has nothing the site can act on yet,
  // whether the create call reported an id or not.
  const isPendingReplyRow = (commentId: string): boolean =>
    commentId.startsWith(RAIL_PENDING_ID_PREFIX) || commentState.pendingReplies.some((row) => row.id === commentId);

  // The baseline is the set of comment ids the panel had loaded when a reply
  // was written. Any id of the same author that shows up afterwards is the
  // echo, even when the create call and the tree endpoint disagree on ids.
  const readPendingBaseline = (row: RailComment): ReadonlySet<string> | undefined =>
    commentState.pendingBaselines.get(row.id);

  // Folding a row hides its whole subtree, so every descendant goes with the
  // one the reader closed instead of leaving an orphaned branch behind.
  const createThreadCollapseButton = (threadId: string, hiddenCount: number): HTMLButtonElement => {
    const collapse = document.createElement("button");
    collapse.type = "button";
    collapse.className = "hbu-reader-comments-collapse";
    collapse.dataset["threadId"] = threadId;
    collapse.textContent = "收起回复";
    collapse.setAttribute("aria-expanded", "true");
    collapse.setAttribute("aria-label", "收起这条评论下的 " + hiddenCount + " 条回复");
    return collapse;
  };

  // The placeholder keeps a short indent and a dashed rule, so a folded branch
  // still says that replies are stored underneath it.
  const createCollapsedThreadRow = (threadId: string, hiddenCount: number): HTMLUListElement => {
    const holder = document.createElement("ul");
    holder.className = "hbu-reader-comments-children hbu-reader-comments-children--collapsed";
    const hiddenRow = document.createElement("li");
    hiddenRow.className = "hbu-reader-comments-child hbu-reader-comments-child--collapsed";
    const expand = document.createElement("button");
    expand.type = "button";
    expand.className = "hbu-reader-comments-expand";
    expand.dataset["threadId"] = threadId;
    expand.textContent = hiddenCount + " 条回复已收起";
    expand.setAttribute("aria-expanded", "false");
    hiddenRow.append(expand);
    holder.append(hiddenRow);
    return holder;
  };

  // Every reload replaces the rendered list, which detaches the focused action.
  // The control is described by its comment and action so focus can land on the
  // redrawn twin, which keeps Tab and arrow navigation going after a refresh.
  // Folding a branch also uses it: the control that replaces the pressed one
  // carries the branch id, so the reader stays on the same thread.
  const describeCommentControl = (control: HTMLElement): { id: string; action: CommentControlAction } | null => {
    for (const [action, attribute] of Object.entries(COMMENT_CONTROL_ATTRIBUTES) as [CommentControlAction, string][]) {
      const id = control.dataset[attribute];
      if (id !== undefined && control.classList.contains(COMMENT_CONTROL_CLASSES[action])) return { id, action };
    }
    return null;
  };

  const restoreCommentControlFocus = (target: { id: string; action: CommentControlAction } | null): void => {
    if (target === null || commentPanelList === null) return;
    const attribute = COMMENT_CONTROL_ATTRIBUTES[target.action];
    const selector = "." + COMMENT_CONTROL_CLASSES[target.action];
    for (const control of commentPanelList.querySelectorAll<HTMLElement>(selector)) {
      if (control.dataset[attribute] !== target.id) continue;
      control.focus({ preventScroll: true });
      return;
    }
  };

  const createReaderCommentItem = (raw: RailCommentEntry): HTMLLIElement => {
    // A reply posted here is attached before the tree is built, so it shows up
    // even while the tree endpoint still answers without it.
    const comment = withPendingReplies(raw);
    const item = document.createElement("li");
    item.className = "hbu-reader-comments-item";
    item.setAttribute("role", "listitem");
    const avatar = createReaderCommentAvatar(comment, false);
    const main = document.createElement("div");
    main.className = "hbu-reader-comments-main";
    const who = document.createElement("div");
    who.className = "hbu-reader-comments-who";
    who.append(createReaderCommentName(comment));
    if (comment.createAt > 0) {
      const time = document.createElement("span");
      time.className = "hbu-reader-comments-time";
      time.textContent = formatRailAge(comment.createAt);
      who.append(time);
    }
    const text = document.createElement("p");
    text.className = "hbu-reader-comments-text";
    fillReaderCommentBody(text, comment.body);
    main.append(who, text);
    const meta = document.createElement("div");
    meta.className = "hbu-reader-comments-meta";
    if (comment.likes > 0) {
      const likes = document.createElement("span");
      likes.textContent = "赞 " + comment.likes;
      meta.append(likes);
    }
    if (comment.replies > 0) {
      const replies = document.createElement("span");
      replies.textContent = comment.replies + " 条回复";
      meta.append(replies);
    }
    if (isPendingReplyRow(comment.id)) {
      // A floor restored from a mark has no server id yet, so it reports its
      // state instead of offering actions the tree endpoint cannot resolve.
      const syncing = document.createElement("span");
      const settled = commentState.settledReplies.has(comment.id);
      syncing.className = "hbu-reader-comments-syncing" + (settled ? " hbu-reader-comments-syncing--settled" : "");
      syncing.textContent = settled ? "已提交" : "同步中…";
      meta.append(syncing);
    } else {
      meta.append(createReaderReplyButton({
        id: comment.id,
        rootId: comment.rootId !== "" ? comment.rootId : comment.id,
        name: comment.name,
      }));
      const deleteButton = createReaderCommentDeleteButton(comment);
      if (deleteButton !== null) meta.append(deleteButton);
    }
    const visibleChildren = filterReaderCommentThread(buildRailCommentTree(comment), readHideCyPreference());
    const hiddenCount = countRailThreadNodes(visibleChildren);
    const collapsible = comment.id !== "" && visibleChildren.length > 0;
    const collapsed = collapsible && collapsedCommentThreads.has(comment.id);
    // Only the visible state owns a control: expanded rows offer "收起回复",
    // and a folded row offers the "N 条回复已收起" placeholder instead.
    if (collapsible && !collapsed) meta.append(createThreadCollapseButton(comment.id, hiddenCount));
    main.append(meta);
    if (visibleChildren.length > 0) {
      if (collapsed) {
        main.append(createCollapsedThreadRow(comment.id, hiddenCount));
      } else {
        const children = document.createElement("ul");
        children.className = "hbu-reader-comments-children";
        // The floor itself sits at depth zero, so its direct replies are the
        // first indented level.
        for (const child of visibleChildren) children.append(createReaderCommentChild(child, comment, 1));
        main.append(children);
      }
    }
    item.append(avatar, main);
    return item;
  };

  const createReaderCommentChild = (child: RailCommentThreadNode, parent: RailComment, depth: number): HTMLLIElement => {
    const item = document.createElement("li");
    item.className = "hbu-reader-comments-child";
    item.setAttribute("role", "listitem");
    const avatar = createReaderCommentAvatar(child, true);
    const main = document.createElement("div");
    main.className = "hbu-reader-comments-child-main";
    const who = document.createElement("div");
    who.className = "hbu-reader-comments-who";
    who.append(createReaderCommentName(child));
    // replyName is the author the server says this reply answers. Fall back to
    // the resolved parent author when the payload omits it.
    const replyTo = child.replyName !== "" ? child.replyName : parent.name;
    if (replyTo !== "") {
      const hint = document.createElement("span");
      hint.className = "hbu-reader-comments-reply-to";
      hint.textContent = "回复 @" + replyTo;
      who.append(hint);
    }
    if (child.createAt > 0) {
      const time = document.createElement("span");
      time.className = "hbu-reader-comments-time";
      time.textContent = formatRailAge(child.createAt);
      who.append(time);
    }
    const text = document.createElement("p");
    text.className = "hbu-reader-comments-text";
    fillReaderCommentBody(text, child.body);
    const actions = document.createElement("div");
    actions.className = "hbu-reader-comments-meta";
    if (child.likes > 0) {
      const likes = document.createElement("span");
      likes.textContent = "赞 " + child.likes;
      actions.append(likes);
    }
    if (child.replies > 0) {
      const replies = document.createElement("span");
      replies.textContent = child.replies + " 条回复";
      actions.append(replies);
    }
    const pendingRow = isPendingReplyRow(child.id);
    if (pendingRow) {
      // The tree endpoint has not echoed this row yet. Replying to it would
      // target a comment the server does not know, and deleting it would need
      // an id the list cannot resolve, so it reports its own state instead.
      const syncing = document.createElement("span");
      const settled = commentState.settledReplies.has(child.id);
      syncing.className = "hbu-reader-comments-syncing" + (settled ? " hbu-reader-comments-syncing--settled" : "");
      syncing.textContent = settled ? "已提交" : "同步中…";
      actions.append(syncing);
    } else {
      actions.append(createReaderReplyButton({
        id: child.id !== "" ? child.id : parent.id,
        rootId: child.rootId !== "" ? child.rootId : parent.rootId !== "" ? parent.rootId : parent.id,
        name: child.name,
      }));
      const deleteButton = createReaderCommentDeleteButton(child);
      if (deleteButton !== null) actions.append(deleteButton);
    }
    const visibleChildren = filterReaderCommentThread(child.children, readHideCyPreference());
    // A reply with descendants can be folded away; folding it also hides every
    // reply underneath it, so a long chain never has to be read level by level.
    const collapsible = child.id !== "" && visibleChildren.length > 0;
    const hiddenCount = collapsible ? countRailThreadNodes(visibleChildren) : 0;
    const collapsed = collapsible && collapsedCommentThreads.has(child.id);
    if (collapsible && !collapsed) actions.append(createThreadCollapseButton(child.id, hiddenCount));
    main.append(who, text, actions);
    if (visibleChildren.length > 0) {
      if (collapsed) {
        main.append(createCollapsedThreadRow(child.id, hiddenCount));
      } else {
        const children = document.createElement("ul");
        children.className = "hbu-reader-comments-children" + (depth >= RAIL_MAX_INDENT_DEPTH ? " hbu-reader-comments-children--deep" : "");
        for (const nested of visibleChildren) children.append(createReaderCommentChild(nested, child, depth + 1));
        main.append(children);
      }
    }
    const row = document.createElement("div");
    row.className = "hbu-reader-comments-child-row";
    row.append(avatar, main);
    item.append(row);
    return item;
  };

  const createReaderReplyButton = (target: ArticleReplyTargetPayload & { name: string }): HTMLButtonElement => {
    const reply = document.createElement("button");
    reply.type = "button";
    reply.className = "hbu-reader-comments-reply";
    reply.textContent = "回复";
    reply.setAttribute("aria-label", "回复 " + target.name);
    reply.dataset["replyId"] = target.id;
    reply.dataset["replyRoot"] = target.rootId;
    reply.dataset["replyName"] = target.name;
    return reply;
  };

  const renderReaderComments = (): void => {
    if (commentPanel === null) return;
    const active = document.activeElement;
    const focusedControl = active instanceof HTMLElement && commentPanelList?.contains(active) === true
      ? describeCommentControl(active)
      : active === commentPanelRefresh
        ? lastCommentControlFocus
        : null;
    const hideCy = readHideCyPreference();
    const loadedVisible = commentState.items.filter((item) => !hideCy || item.isCy !== true);
    const hiddenCy = commentState.items.length - loadedVisible.length;
    // Restored floors go above the server list, which is where the site puts a
    // freshly written comment, and they stay until the real row arrives.
    const visible = commentState.localFloors.concat(loadedVisible);
    const meta: string[] = [];
    if (commentState.total > 0) meta.push("共 " + commentState.total + " 条");
    if (loadedVisible.length > 0) meta.push("已加载 " + loadedVisible.length + " 条");
    if (hiddenCy > 0) meta.push("已屏蔽 " + hiddenCy + " 条 CY");
    if (commentPanelMeta !== null) commentPanelMeta.textContent = meta.join(" · ");
    if (commentPanelList !== null) {
      commentPanelList.replaceChildren(...visible.map(createReaderCommentItem));
      commentPanelList.hidden = visible.length === 0;
    }
    if (focusedControl !== null) restoreCommentControlFocus(focusedControl);
    if (commentPanelStatus !== null) {
      if (commentState.error !== "") {
        commentPanelStatus.hidden = false;
        if (commentPanelStatusText !== null) commentPanelStatusText.textContent = commentState.error;
        if (commentPanelRetry !== null) {
          commentPanelRetry.hidden = false;
          commentPanelRetry.disabled = commentState.loading;
        }
      } else if (commentState.loading && visible.length === 0) {
        commentPanelStatus.hidden = false;
        if (commentPanelStatusText !== null) commentPanelStatusText.textContent = "正在加载评论…";
        if (commentPanelRetry !== null) commentPanelRetry.hidden = true;
      } else if (!commentState.loaded) {
        commentPanelStatus.hidden = false;
        if (commentPanelStatusText !== null) commentPanelStatusText.textContent = "正在准备评论…";
        if (commentPanelRetry !== null) commentPanelRetry.hidden = true;
      } else if (visible.length === 0) {
        commentPanelStatus.hidden = false;
        if (commentPanelStatusText !== null) {
          commentPanelStatusText.textContent = hiddenCy > 0 ? "已屏蔽全部 " + hiddenCy + " 条 CY 评论" : "这条帖子还没有评论";
        }
        if (commentPanelRetry !== null) commentPanelRetry.hidden = true;
      } else {
        commentPanelStatus.hidden = true;
        if (commentPanelRetry !== null) commentPanelRetry.hidden = true;
      }
    }
    if (commentPanelMore !== null) {
      commentPanelMore.hidden = !commentState.hasMore;
      commentPanelMore.disabled = commentState.loading;
      commentPanelMore.textContent = commentState.loading ? "加载中…" : "加载更多";
    }
    if (commentPanelRefresh !== null) {
      commentPanelRefresh.disabled = commentState.loading;
      commentPanelRefresh.dataset["busy"] = commentState.loading ? "true" : "false";
    }
  };

  const pendingFromMark = (mark: ReaderCommentMark): RailComment => createRailPendingReply({
    parentId: mark.parentId,
    rootId: mark.rootId !== "" ? mark.rootId : mark.parentId,
    text: mark.text,
    userId: mark.userId,
    createAt: mark.createAt,
    sequence: 0,
    ...(mark.commentId === "" ? {} : { commentId: mark.commentId }),
    imageUrls: mark.imageUrls,
  });

  // A mark for a top-level floor is the floor itself; a nested mark is looked
  // up among the replies of every loaded floor, because a new reply can lift
  // its floor towards the first page.
  const commentMarkIsVisible = (
    mark: ReaderCommentMark,
    loaded: readonly RailCommentEntry[],
  ): boolean => {
    if (mark.parentId === "") {
      if (mark.commentId !== "") return railItemsHaveComment(loaded, mark.commentId);
      return railItemsHaveOwnFloorComment(loaded, mark.userId, mark.text, mark.createAt, mark.imageUrls);
    }
    return railItemsHavePendingReply(loaded, pendingFromMark(mark));
  };

  const localFloorIdForMark = (mark: ReaderCommentMark): string =>
    RAIL_PENDING_ID_PREFIX + "mark-" + mark.token;

  // The site tree may still answer with the pre-write payload after a reload,
  // so the marked floor is drawn locally until the real row arrives. A reply
  // without an id gets the same stable local id across reopenings of the panel.
  const restoreReaderCommentMarks = (): void => {
    const marks = readReaderCommentMarks(articleId);
    if (marks.length === 0) return;
    for (const mark of marks) {
      const visibleAlready = commentState.loaded && commentMarkIsVisible(mark, commentState.items);
      if (visibleAlready) continue;
      if (mark.parentId === "") {
        const floorId = localFloorIdForMark(mark);
        if (commentState.localFloors.some((row) => row.id === floorId)) continue;
        const pending = createRailPendingReply({
          parentId: "",
          rootId: "",
          text: mark.text,
          userId: mark.userId,
          createAt: mark.createAt,
          sequence: 0,
          imageUrls: mark.imageUrls,
        });
        commentState.localFloors.unshift({ ...pending, id: floorId, subComments: [], quotes: [] });
        commentState.localFloorMarks.set(floorId, mark);
        continue;
      }
      const pendingId = mark.commentId !== "" ? mark.commentId : localFloorIdForMark(mark);
      if (commentState.pendingReplies.some((row) => row.id === pendingId)) continue;
      const pending = pendingFromMark(mark);
      commentState.pendingReplies.push({ ...pending, id: pendingId });
    }
  };

  // Drops a local floor only once the refreshed tree carries the real comment,
  // so a lagging answer never makes the restored row flicker away.
  const syncLocalCommentFloors = (): void => {
    if (commentState.localFloors.length === 0) return;
    commentState.localFloors = commentState.localFloors.filter((row) => {
      const mark = commentState.localFloorMarks.get(row.id);
      if (mark === undefined) return true;
      if (!commentMarkIsVisible(mark, commentState.items)) return true;
      commentState.localFloorMarks.delete(row.id);
      return false;
    });
  };

  // An empty expectation always matches: only a publish or delete asks for a
  // specific id to appear or disappear. A pending reply with no id from the
  // create call is matched by its text, so a publish is still verifiable.
  const matchesCommentExpectation = (options: ReaderCommentLoadOptions, loaded: readonly RailCommentEntry[]): boolean => {
    const wantPresent = options.expectPresentId ?? "";
    const wantAbsent = options.expectAbsentId ?? "";
    if (wantPresent !== "" && !railItemsHaveComment(loaded, wantPresent)) return false;
    if (wantAbsent !== "" && railItemsHaveComment(loaded, wantAbsent)) return false;
    const pending = options.expectPending;
    if (pending !== undefined) {
      // The reply can be echoed under any floor the panel has loaded, because a
      // new reply lifts its floor towards the first page, so every loaded floor
      // is searched instead of only the one that owned it before the write.
      if (!railItemsHavePendingReply(loaded, pending, readPendingBaseline(pending))) return false;
    }
    for (const mark of options.expectations ?? []) {
      if (!commentMarkIsVisible(mark, loaded)) return false;
    }
    return true;
  };

  const collectReaderCommentSubtree = (
    nodes: readonly RailCommentThreadNode[],
    commentId: string,
    removed: Set<string>,
  ): boolean => {
    for (const node of nodes) {
      if (node.id === commentId) {
        const collectAll = (branch: readonly RailCommentThreadNode[]): void => {
          for (const member of branch) {
            if (member.id !== "") removed.add(member.id);
            collectAll(member.children);
          }
        };
        collectAll([node]);
        return true;
      }
      if (collectReaderCommentSubtree(node.children, commentId, removed)) return true;
    }
    return false;
  };

  // A delete keeps its row off screen while page one is re-read, so the site
  // echoing the deleted floor back for a moment does not resurrect it. Nested
  // replies of a deleted comment go with it instead of resurfacing as orphans.
  const withoutCommentId = (items: readonly RailCommentEntry[], commentId: string): RailCommentEntry[] => {
    if (commentId === "") return items.slice();
    const next: RailCommentEntry[] = [];
    for (const entry of items) {
      if (entry.id === commentId) continue;
      const removed = new Set<string>();
      collectReaderCommentSubtree(buildRailCommentTree(entry), commentId, removed);
      const children = entry.subComments.filter((child) => !removed.has(child.id));
      if (children.length === entry.subComments.length) {
        next.push(entry);
        continue;
      }
      next.push({ ...entry, subComments: children, quotes: children });
    }
    return next;
  };

  // Remembers which page a floor came from, so a reply written under a floor of
  // page three refreshes that page instead of page one. The last page that
  // returned a floor wins, because new comments shift floors between pages.
  const recordFloorPages = (items: readonly RailCommentEntry[], page: number): void => {
    for (const entry of items) {
      if (entry.id === "") continue;
      commentState.floorPages.set(entry.id, page);
    }
  };

  const loadReaderComments = async (page: number, options: ReaderCommentLoadOptions = {}): Promise<void> => {
    if (commentState.loading && options.force !== true) return;
    const seq = ++commentState.seq;
    const targetId = articleId;
    const generationAtLoad = readerGeneration;
    commentLoadController?.abort();
    const controller = new AbortController();
    commentLoadController = controller;
    commentState.loading = true;
    commentState.error = "";
    const merge = options.merge === true;
    const writeRefresh = options.fresh === true || options.expectPresentId !== undefined || options.expectAbsentId !== undefined || options.expectPending !== undefined || (options.expectations?.length ?? 0) > 0;
    // A refresh keeps the rendered list until the new page arrives, so the panel
    // does not flash empty while the reader is waiting for its own comment.
    const keepItems = merge || (page === 1 && writeRefresh);
    if (page === 1 && !keepItems) {
      commentState.items = [];
      commentState.page = 0;
      commentState.total = 0;
      commentState.hasMore = false;
      commentState.loadedGroups = 0;
      commentState.loaded = false;
      commentState.floorPages.clear();
    }
    renderReaderComments();
    let stale = false;
    try {
      const accountId = await resolveHeyboxId(controller.signal);
      if (seq !== commentState.seq || commentLoadController !== controller) return;
      if (accountId !== readerAccountId) readerAccountId = accountId;
      const fresh = merge || (page === 1 && writeRefresh);
      const data = await fetchRailPage(targetId, page, {
        signal: controller.signal,
        accountId: accountId,
        bypassCache: fresh,
        ...(page === 1 ? { maxAgeMs: RAIL_PAGE_CACHE_FRESH_MS } : {}),
      });
      if (seq !== commentState.seq || commentLoadController !== controller) return;
      const incoming = withoutCommentId(data.items, options.expectAbsentId ?? "");
      const seen = new Set(commentState.items.map((item) => item.id));
      const added = incoming.filter((item) => item.id === "" || !seen.has(item.id));
      if (merge) {
        // A merged refresh replaces the floors it returned in place and keeps
        // the floors of the pages read earlier, so a reply never wipes them.
        // The deleted floor is dropped from both sides before the merge.
        const base = withoutCommentId(commentState.items, options.expectAbsentId ?? "");
        commentState.items = mergeRailPageItems(base, incoming);
        commentState.page = Math.max(commentState.page, page);
      } else if (page === 1) {
        commentState.items = incoming;
        commentState.page = 1;
      } else {
        commentState.items = commentState.items.concat(added);
        commentState.page = page;
      }
      recordFloorPages(incoming, page);
      // A delete already lowered the count locally, so a page that still lists
      // the removed comment must not raise it back.
      const absentId = options.expectAbsentId ?? "";
      const echoingDeleted = absentId !== "" && railItemsHaveComment(incoming, absentId);
      commentState.total = echoingDeleted ? commentState.total : data.total > 0 ? data.total : Math.max(commentState.total, commentState.items.length);
      // A reply the site has echoed back replaces its optimistic copy.
      const beforePrune = commentState.pendingReplies;
      commentState.pendingReplies = pruneRailPendingReplies(commentState.items, beforePrune, readPendingBaseline);
      for (const row of beforePrune) {
        if (commentState.pendingReplies.includes(row)) continue;
        commentState.pendingBaselines.delete(row.id);
        commentState.settledReplies.delete(row.id);
      }
      syncLocalCommentFloors();
      const progress = merge
        ? resolveMergedCommentProgress({
          loadedGroups: commentState.items.length,
          floorTotal: data.floorTotal,
          rawGroupCount: incoming.length,
        })
        : resolveCommentPageProgress({
          rawGroupCount: data.items.length,
          freshGroupCount: page === 1 ? data.items.length : added.length,
          previouslyLoadedGroups: page === 1 ? 0 : commentState.loadedGroups,
          floorTotal: data.floorTotal,
        });
      commentState.loadedGroups = progress.loadedGroups;
      commentState.hasMore = progress.hasMore;
      commentState.loaded = true;
      if (page === 1 || merge) commentState.loadedAt = Date.now();
      // The tree endpoint can lag behind a successful publish. Keep the freshly
      // incremented count visible while still accepting a larger server total.
      if (linkState !== null && !echoingDeleted && Number.isFinite(data.total) && data.total > 0) {
        const current = Number(linkState.commentCount);
        linkState.commentCount = Math.max(Number.isFinite(current) ? current : 0, data.total);
      }
      syncActionStates();
      stale = !matchesCommentExpectation(options, commentState.items);
    } catch (error) {
      if (isAbortError(error)) return;
      if (seq !== commentState.seq || commentLoadController !== controller) return;
      const message = error instanceof Error ? error.message : "评论加载失败";
      commentState.error = /captcha|show_captcha/i.test(message) ? "评论需要验证，请稍后重试" : "评论加载失败：" + message;
      commentState.hasMore = false;
    } finally {
      if (seq === commentState.seq && commentLoadController === controller) {
        commentState.loading = false;
        commentLoadController = null;
        renderReaderComments();
      }
    }
    if (!stale) return;
    if (articleId !== targetId || readerGeneration !== generationAtLoad) return;
    // A manual refresh or a second write owns the panel now, so this poll stops
    // instead of competing with the newer load.
    if (seq !== commentState.seq) return;
    const attempt = (options.attempt ?? 0) + 1;
    const pending = options.expectPending;
    const expectations = options.expectations ?? [];
    // A local row gets the sparse background checks as well, so a late echo
    // still replaces it; a delete or a plain publish stops right away.
    const maxAttempts = pending === undefined && expectations.length === 0
      ? COMMENT_VERIFY_ATTEMPTS
      : COMMENT_VERIFY_MAX_ATTEMPTS;
    if (attempt >= maxAttempts) {
      if (pending !== undefined) {
        commentState.settledReplies.add(pending.id);
        renderReaderComments();
      }
      if (expectations.length > 0) {
        for (const mark of expectations) {
          // The tree can remain behind the already-updated comment count. Keep
          // the persisted mark after polling gives up so a reload can restore
          // the published row until the mark expires or the tree echoes it.
          const floorId = localFloorIdForMark(mark);
          if (commentState.localFloors.some((row) => row.id === floorId)) {
            commentState.settledReplies.add(floorId);
          }
        }
        renderReaderComments();
      }
      if (options.expectAbsentId !== undefined) showToast("评论已删除，列表仍待站点同步");
      else if ((options.expectPresentId ?? "") !== "" || expectations.length > 0) showToast("评论已提交，列表仍待站点同步");
      return;
    }
    if (pending !== undefined && attempt === COMMENT_VERIFY_ATTEMPTS) {
      // The row is on screen and stays there, so it stops claiming to sync
      // while the background checks keep looking for the server copy.
      commentState.settledReplies.add(pending.id);
      renderReaderComments();
    }
    // A new reply lifts its floor towards the first page, so the first page is
    // re-read as well instead of only the page that owned the floor before.
    const ownedPage = options.verifyPage ?? page;
    const nextPage = attempt % 3 === 2 && page !== 1 ? 1 : ownedPage;
    void waitForDelay(readCommentVerifyDelay(attempt), controller.signal).then(() => {
      if (articleId !== targetId || readerGeneration !== generationAtLoad) return;
      if (seq !== commentState.seq) return;
      void loadReaderComments(nextPage, { ...options, fresh: true, force: true, merge: true, attempt: attempt });
    }).catch(() => undefined);
  };

  const readArticleComposers = (): Element[] => Array.from(document.querySelectorAll("[data-hbu-article-composer]"));

  const readComposerImages = (root: Element): ComposerImage[] => articleComposerImages.get(root) ?? [];

  const createComposerPreviewUrl = (file: File): string => {
    if (typeof URL.createObjectURL !== "function") return "";
    try {
      return URL.createObjectURL(file);
    } catch {
      // A webview that exposes the API but refuses blob URLs still uploads.
      return "";
    }
  };

  const revokeComposerPreviewUrl = (url: string): void => {
    if (url === "" || typeof URL.revokeObjectURL !== "function") return;
    URL.revokeObjectURL(url);
  };

  const readComposerStatus = (root: Element): HTMLElement | null => {
    const status = root.querySelector(".hbu-reader-composer-status");
    return status instanceof HTMLElement ? status : null;
  };

  /**
   * Draws the picked pictures and the add button. The strip is rebuilt from the
   * state instead of patched in place, so a removed or failed picture can never
   * leave a stale thumbnail behind.
   */
  const renderComposerImages = (root: Element): void => {
    const strip = root.querySelector(".hbu-reader-composer-images");
    if (!(strip instanceof HTMLElement)) return;
    const images = readComposerImages(root);
    strip.textContent = "";
    strip.hidden = images.length === 0;
    for (const image of images) {
      const item = document.createElement("figure");
      item.className = "hbu-reader-composer-image";
      item.dataset["status"] = image.status;
      item.dataset["imageId"] = String(image.id);
      const frame = document.createElement("div");
      frame.className = "hbu-reader-composer-image-frame";
      if (image.previewUrl !== "") {
        const preview = document.createElement("img");
        preview.alt = image.name;
        preview.decoding = "async";
        preview.src = image.previewUrl;
        frame.append(preview);
      } else {
        const placeholder = document.createElement("span");
        placeholder.className = "hbu-reader-composer-image-placeholder";
        placeholder.textContent = "图片";
        frame.append(placeholder);
      }
      if (image.status !== "ready") {
        const state = document.createElement("span");
        state.className = "hbu-reader-composer-image-state";
        state.textContent = image.status === "pending" ? "上传中…" : "上传失败";
        frame.append(state);
      }
      if (image.status === "failed") {
        const retry = document.createElement("button");
        retry.type = "button";
        retry.className = "hbu-reader-composer-image-retry";
        retry.textContent = "重试上传";
        retry.setAttribute("aria-label", "重试上传图片 " + image.name);
        retry.addEventListener("click", () => retryComposerImage(root, image.id));
        item.append(retry);
      }
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "hbu-reader-composer-image-remove";
      remove.textContent = "×";
      remove.title = "移除图片";
      remove.setAttribute("aria-label", "移除图片 " + image.name);
      remove.addEventListener("click", () => removeComposerImage(root, image.id));
      item.append(frame, remove);
      strip.append(item);
    }
  };

  const uploadComposerImage = (root: Element, image: ComposerImage): void => {
    void (async () => {
      try {
        const accountId = await resolveHeyboxId(image.controller.signal);
        if (image.removed) return;
        if (accountId === "") throw new Error("请先登录小黑盒");
        const uploaded = await uploadCommentImage(image.file, accountId, image.controller.signal);
        if (image.removed) return;
        image.status = "ready";
        image.url = uploaded.url;
      } catch (error) {
        if (image.removed || isAbortError(error)) return;
        image.status = "failed";
        image.error = error instanceof Error ? error.message : "图片上传失败";
      }
      if (image.removed) return;
      renderComposerImages(root);
      if (image.status === "failed") {
        const status = readComposerStatus(root);
        if (status !== null) status.textContent = image.name + " 上传失败" + (image.error === "" ? "" : "：" + image.error);
      }
      syncArticleComposers();
    })();
  };

  function removeComposerImage(root: Element, id: number): void {
    const kept: ComposerImage[] = [];
    for (const image of readComposerImages(root)) {
      if (image.id !== id) {
        kept.push(image);
        continue;
      }
      image.removed = true;
      image.controller.abort();
      revokeComposerPreviewUrl(image.previewUrl);
      image.previewUrl = "";
    }
    articleComposerImages.set(root, kept);
    const status = readComposerStatus(root);
    if (status !== null) status.textContent = "";
    renderComposerImages(root);
    syncArticleComposers();
  }

  function retryComposerImage(root: Element, id: number): void {
    const image = readComposerImages(root).find((candidate) => candidate.id === id);
    if (image === undefined || image.removed || image.status !== "failed") return;
    image.controller = new AbortController();
    image.status = "pending";
    image.error = "";
    image.url = "";
    const status = readComposerStatus(root);
    if (status !== null) status.textContent = "";
    renderComposerImages(root);
    syncArticleComposers();
    uploadComposerImage(root, image);
  }

  function clearComposerImages(root: Element): void {
    for (const image of readComposerImages(root)) {
      image.removed = true;
      image.controller.abort();
      revokeComposerPreviewUrl(image.previewUrl);
      image.previewUrl = "";
    }
    articleComposerImages.delete(root);
    renderComposerImages(root);
  }

  const COMPOSER_EMOJI_TOKEN = /\[((?:cube|heygirl)_[^\[\]\n]{1,64})\]/gi;
  const composerSelections: WeakMap<HTMLElement, Range> = new WeakMap();

  const serializeComposerNode = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? "";
    if (!(node instanceof Element)) {
      return Array.from(node.childNodes).map(serializeComposerNode).join("");
    }
    if (node instanceof HTMLBRElement) return "\n";
    const emojiName = node instanceof HTMLElement ? node.dataset["emoji"] ?? "" : "";
    if (emojiName !== "") return "[" + emojiName + "]";
    return Array.from(node.childNodes).map(serializeComposerNode).join("");
  };

  const serializeComposerText = (input: HTMLElement): string => serializeComposerNode(input);

  const saveComposerSelection = (input: HTMLElement): void => {
    const selection = document.getSelection();
    if (selection === null || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (input.contains(range.commonAncestorContainer)) composerSelections.set(input, range.cloneRange());
  };

  const focusComposerAt = (input: HTMLElement, savedRange?: Range | null): void => {
    input.focus({ preventScroll: true });
    const selection = document.getSelection();
    if (selection === null) return;
    let range = savedRange ?? composerSelections.get(input) ?? null;
    if (range === null || !input.isConnected || !input.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(input);
      range.collapse(false);
    } else {
      range = range.cloneRange();
    }
    selection.removeAllRanges();
    selection.addRange(range);
    saveComposerSelection(input);
  };

  const updateComposerTextState = (input: HTMLElement): void => {
    const root = input.closest("[data-hbu-article-composer]");
    const count = root?.querySelector(".hbu-reader-composer-count");
    const text = serializeComposerText(input);
    input.dataset["empty"] = text.trim() === "" ? "true" : "false";
    if (count instanceof HTMLElement) count.textContent = text.length + "/" + ARTICLE_COMMENT_MAX_LENGTH;
  };

  const renderComposerEmojiTokens = (input: HTMLElement): boolean => {
    const walker = document.createTreeWalker(input, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if (node instanceof Text) textNodes.push(node);
    }
    let rendered = false;
    for (const node of textNodes) {
      const value = node.nodeValue ?? "";
      COMPOSER_EMOJI_TOKEN.lastIndex = 0;
      if (!COMPOSER_EMOJI_TOKEN.test(value)) continue;
      COMPOSER_EMOJI_TOKEN.lastIndex = 0;
      const fragment = document.createDocumentFragment();
      let cursor = 0;
      let lastGlyph: HTMLElement | null = null;
      let nodeRendered = false;
      for (let match = COMPOSER_EMOJI_TOKEN.exec(value); match !== null; match = COMPOSER_EMOJI_TOKEN.exec(value)) {
        const emoji = resolveRailEmojiRef(match[1]);
        if (emoji === null) continue;
        if (match.index > cursor) fragment.append(document.createTextNode(value.slice(cursor, match.index)));
        const glyph = createRailEmojiElement(emoji, "hbu-reader-composer-emoji-glyph");
        glyph.dataset["emoji"] = match[1];
        glyph.contentEditable = "false";
        fragment.append(glyph);
        lastGlyph = glyph;
        cursor = match.index + match[0].length;
        nodeRendered = true;
      }
      rendered = true;
      if (!nodeRendered) continue;
      if (cursor < value.length) fragment.append(document.createTextNode(value.slice(cursor)));
      node.replaceWith(fragment);
      if (lastGlyph !== null) {
        const range = document.createRange();
        range.setStartAfter(lastGlyph);
        range.collapse(true);
        composerSelections.set(input, range);
        const selection = document.getSelection();
        if (selection !== null && input.isConnected) {
          selection.removeAllRanges();
          selection.addRange(range.cloneRange());
        }
      }
    }
    return rendered;
  };

  const rejectComposerOverflow = (input: HTMLElement, event: InputEvent): void => {
    if (event.inputType !== "insertText" || typeof event.data !== "string") return;
    const selection = document.getSelection();
    const range = selection !== null && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    const selected = range !== null && input.contains(range.commonAncestorContainer)
      ? serializeComposerNode(range.cloneContents())
      : "";
    if (serializeComposerText(input).length - selected.length + event.data.length > ARTICLE_COMMENT_MAX_LENGTH) {
      event.preventDefault();
      const root = input.closest("[data-hbu-article-composer]");
      const status = root?.querySelector(".hbu-reader-composer-status");
      if (status instanceof HTMLElement) status.textContent = "评论最多 " + ARTICLE_COMMENT_MAX_LENGTH + " 字";
    }
  };

  const insertComposerText = (input: HTMLElement, text: string): boolean => {
    if (text === "") return false;
    const current = serializeComposerText(input);
    const selection = document.getSelection();
    const selectedRange = selection !== null && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    const selectedText = selectedRange !== null && input.contains(selectedRange.commonAncestorContainer)
      ? serializeComposerNode(selectedRange.cloneContents())
      : "";
    if (current.length - selectedText.length + text.length > ARTICLE_COMMENT_MAX_LENGTH) return false;
    focusComposerAt(input);
    const activeSelection = document.getSelection();
    if (activeSelection === null || activeSelection.rangeCount === 0) return false;
    const range = activeSelection.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    activeSelection.removeAllRanges();
    activeSelection.addRange(range);
    composerSelections.set(input, range.cloneRange());
    input.normalize();
    renderComposerEmojiTokens(input);
    updateComposerTextState(input);
    return true;
  };

  const insertComposerLineBreak = (input: HTMLElement): void => {
    focusComposerAt(input);
    const selection = document.getSelection();
    if (selection === null || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const lineBreak = document.createElement("br");
    range.insertNode(lineBreak);
    range.setStartAfter(lineBreak);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    composerSelections.set(input, range.cloneRange());
    updateComposerTextState(input);
  };

  const setComposerText = (input: HTMLElement, text: string): void => {
    input.replaceChildren(text === "" ? document.createDocumentFragment() : document.createTextNode(text));
    renderComposerEmojiTokens(input);
    const range = document.createRange();
    range.selectNodeContents(input);
    range.collapse(false);
    composerSelections.set(input, range);
    updateComposerTextState(input);
  };

  const addComposerImages = (root: Element, files: readonly File[]): void => {
    const status = readComposerStatus(root);
    const images = readComposerImages(root);
    const room = MAX_COMMENT_IMAGES - images.length;
    if (room <= 0) {
      if (status !== null) status.textContent = "最多选择 " + MAX_COMMENT_IMAGES + " 张图片";
      return;
    }
    // The site's own picker only forwards image files, so a non-image choice is
    // rejected here instead of failing later on the upload call.
    const picked = files.filter((file) => file.type.startsWith("image/"));
    if (picked.length === 0) {
      if (status !== null) status.textContent = "仅支持选择图片文件";
      return;
    }
    const chosen = picked.slice(0, room);
    if (status !== null) status.textContent = picked.length > room ? "最多选择 " + MAX_COMMENT_IMAGES + " 张图片" : "";
    const next = images.slice();
    const added: ComposerImage[] = [];
    for (const file of chosen) {
      articleComposerImageSeq += 1;
      const image: ComposerImage = {
        id: articleComposerImageSeq,
        name: file.name,
        file: file,
        previewUrl: createComposerPreviewUrl(file),
        status: "pending",
        url: "",
        error: "",
        removed: false,
        controller: new AbortController(),
      };
      next.push(image);
      added.push(image);
    }
    articleComposerImages.set(root, next);
    renderComposerImages(root);
    syncArticleComposers();
    for (const image of added) uploadComposerImage(root, image);
  };

  const clearArticleReplyTarget = (restoreFocus: boolean): void => {
    if (articleReplyTarget === null) return;
    articleReplyTarget = null;
    syncArticleComposers();
    if (restoreFocus) readArticleComposers()[0]?.querySelector<HTMLElement>(".hbu-reader-composer-input")?.focus({ preventScroll: true });
  };

  /**
   * Enters reply mode. The site's own composer hides picture picking while a
   * reply is addressed, so pictures already picked for a new floor comment are
   * dropped here instead of being silently attached to the reply.
   */
  const beginArticleReply = (target: { id: string; rootId: string; name: string }): void => {
    for (const root of readArticleComposers()) {
      if (readComposerImages(root).length === 0) continue;
      clearComposerImages(root);
      const status = readComposerStatus(root);
      if (status !== null) status.textContent = "回复暂不支持图片，已移除所选图片";
    }
    articleReplyTarget = target;
    syncArticleComposers();
    readArticleComposers()[0]?.querySelector<HTMLElement>(".hbu-reader-composer-input")?.focus({ preventScroll: true });
  };

  const syncArticleComposers = (): void => {
    const reply = articleReplyTarget;
    for (const root of readArticleComposers()) {
      const input = root.querySelector(".hbu-reader-composer-input");
      const submit = root.querySelector(".hbu-reader-composer-submit");
      if (!(input instanceof HTMLElement) || input.getAttribute("contenteditable") !== "true" || !(submit instanceof HTMLButtonElement)) continue;
      const images = readComposerImages(root);
      const uploading = images.some((image) => image.status === "pending");
      const ready = images.filter((image) => image.status === "ready").length;
      // A picture-only comment is valid on the site, so the button unlocks as
      // soon as one upload settles; an in-flight upload keeps it locked.
      const text = serializeComposerText(input);
      submit.disabled = articleCommentBusy || uploading || (text.trim() === "" && ready === 0);
      submit.textContent = articleCommentBusy ? "发布中…" : "发布";
      const imageToggle = root.querySelector(".hbu-reader-composer-image-toggle");
      if (imageToggle instanceof HTMLButtonElement) {
        imageToggle.disabled = articleCommentBusy || reply !== null || images.length >= MAX_COMMENT_IMAGES;
        imageToggle.title = reply === null ? "添加图片" : "回复暂不支持图片";
      }
      const replyBar = root.querySelector(".hbu-reader-composer-reply");
      const replyName = root.querySelector(".hbu-reader-composer-reply-name");
      if (replyBar instanceof HTMLElement) replyBar.hidden = reply === null;
      if (replyName !== null) replyName.textContent = reply === null ? "" : "回复 @" + reply.name;
      input.dataset["placeholder"] = reply === null ? "评论这篇文章…" : "回复 @" + reply.name + "…";
      input.setAttribute("aria-label", reply === null ? "评论内容" : "回复 " + reply.name);
    }
  };

  const clearArticleComposers = (): void => {
    for (const root of readArticleComposers()) {
      articleComposerEmojiClosers.get(root)?.close(false);
      const input = root.querySelector(".hbu-reader-composer-input");
      const status = root.querySelector(".hbu-reader-composer-status");
      const count = root.querySelector(".hbu-reader-composer-count");
      const file = root.querySelector(".hbu-reader-composer-file");
      if (input instanceof HTMLElement && input.getAttribute("contenteditable") === "true") setComposerText(input, "");
      if (file instanceof HTMLInputElement) file.value = "";
      if (status !== null) status.textContent = "";
      if (count !== null) count.textContent = "0/" + ARTICLE_COMMENT_MAX_LENGTH;
      clearComposerImages(root);
    }
    articleReplyTarget = null;
    syncArticleComposers();
  };

  const submitArticleComment = async (input: HTMLElement, status: HTMLElement): Promise<void> => {
    if (articleCommentBusy) return;
    const root = input.closest("[data-hbu-article-composer]");
    const images = root === null ? [] : readComposerImages(root);
    if (images.some((image) => image.status === "pending")) {
      status.textContent = "图片上传中，请稍候";
      return;
    }
    const imageUrls = images.filter((image) => image.status === "ready" && image.url !== "").map((image) => image.url);
    const text = serializeComposerText(input).trim();
    if (text === "" && imageUrls.length === 0) {
      status.textContent = "请输入评论内容";
      input.focus({ preventScroll: true });
      return;
    }
    const targetId = articleId;
    const generation = readerGeneration;
    const reply = articleReplyTarget;
    articleCommentBusy = true;
    syncArticleComposers();
    status.textContent = "";
    try {
      const accountId = await resolveHeyboxId();
      if (articleId !== targetId || readerGeneration !== generation) return;
      if (accountId === "") throw new Error("请先登录小黑盒");
      const created = await postReaderApi(COMMENT_CREATE_API_PATH, buildArticleCommentBody(targetId, text, reply, imageUrls), accountId);
      if (articleId !== targetId || readerGeneration !== generation) return;
      const createdId = readCreatedCommentId(created);
      const wroteAt = Math.floor(Date.now() / 1000);
      // The panel used to remember a write only in memory, so a reload lost the
      // evidence that the tree endpoint still owed this comment. Recording it
      // here also covers writes made while the panel is closed or from the
      // article composer, which never reached the panel's pending list.
      const replyRootId = reply === null ? "" : reply.rootId !== "" ? reply.rootId : reply.id;
      const replyFloorId = reply === null
        ? ""
        : findRailFloorIdForComment(commentState.items, reply.id) || findRailFloorIdForComment(commentState.items, replyRootId);
      const replyVerifyPage = replyFloorId === "" ? 1 : commentState.floorPages.get(replyFloorId) ?? 1;
      saveReaderCommentMark({
        linkId: targetId,
        commentId: createdId,
        text: text,
        userId: accountId,
        rootId: replyRootId,
        parentId: reply === null ? "" : reply.id,
        createAt: wroteAt,
        verifyPage: replyVerifyPage,
        imageUrls: imageUrls,
      });
      clearArticleComposers();
      showToast("评论已发布");
      articleCommentPublishedCount += 1;
      // A write invalidates every cached page, and the tree endpoint may still
      // answer with the pre-write payload for a moment, so the page that owns
      // the target is read again from the network and polled until the new
      // comment appears.
      holdRailPageCache(targetId);
      if (linkState !== null) {
        linkState.commentCount = Math.max(0, Number(linkState.commentCount) || 0) + 1;
      } else {
        void loadLinkState(accountId);
      }
      syncActionStates();
      if (commentPanel !== null && !commentPanel.hidden) {
        // A reply is drawn right away and then verified on the page that holds
        // its floor. Re-reading page one alone used to drop the floor of a
        // later page, which is why a nested reply vanished from the panel.
        const pending = reply === null ? null : createRailPendingReply({
          parentId: reply.id,
          rootId: reply.rootId !== "" ? reply.rootId : reply.id,
          text: text,
          userId: accountId,
          createAt: wroteAt,
          sequence: ++pendingReplySeq,
          imageUrls: imageUrls,
          ...(createdId === "" ? {} : { commentId: createdId }),
        });
        if (pending !== null) {
          // A reply written under a folded branch would land out of sight, so
          // the floor that owns it is opened before the local row is drawn.
          const pendingFloorId = resolvePendingFloorId(commentState.items, pending);
          if (pendingFloorId !== "") collapsedCommentThreads.delete(pendingFloorId);
          // The ids already on screen are the baseline for the echo: an id the
          // panel did not have before the write belongs to this reply.
          commentState.pendingBaselines.set(pending.id, collectRailCommentIds(commentState.items));
          commentState.pendingReplies.push(pending);
          renderReaderComments();
        }
        const floorId = pending === null ? "" : resolvePendingFloorId(commentState.items, pending);
        const page = floorId === "" ? 1 : commentState.floorPages.get(floorId) ?? 1;
        void loadReaderComments(page, {
          fresh: true,
          force: true,
          merge: true,
          verifyPage: page,
          ...(pending !== null
            ? { expectPending: pending }
            : createdId === "" ? {} : { expectPresentId: createdId }),
        });
      }
    } catch (error) {
      // The fallback panel survives article changes, so a stale failure must not paint
      // its message into the composer of the article now being read.
      if (articleId === targetId && readerGeneration === generation && status.isConnected) {
        status.textContent = error instanceof Error ? error.message : "评论发布失败";
      }
    } finally {
      // A stale request must not release the lock held by a newer article.
      if (articleId === targetId && readerGeneration === generation) {
        articleCommentBusy = false;
        syncArticleComposers();
      }
    }
  };

  const findReaderCommentNode = (
    nodes: readonly RailCommentThreadNode[],
    commentId: string,
  ): RailCommentThreadNode | null => {
    for (const node of nodes) {
      if (node.id === commentId) return node;
      const nested = findReaderCommentNode(node.children, commentId);
      if (nested !== null) return nested;
    }
    return null;
  };

  // Walks the resolved tree, so a grandchild reply is reachable just like a
  // direct reply and its own ownership check can run before the delete write.
  const readReaderCommentById = (commentId: string): RailComment | null => {
    for (const entry of commentState.items) {
      if (entry.id === commentId) return entry;
      const nested = findReaderCommentNode(buildRailCommentTree(entry), commentId);
      if (nested !== null) return nested;
    }
    return null;
  };

  const collectReaderThreadIds = (
    nodes: readonly RailCommentThreadNode[],
    commentId: string,
  ): Set<string> | null => {
    for (const node of nodes) {
      if (node.id === commentId) {
        const ids = new Set<string>();
        const collect = (list: readonly RailCommentThreadNode[]): void => {
          for (const member of list) {
            if (member.id !== "") ids.add(member.id);
            collect(member.children);
          }
        };
        collect([node]);
        return ids;
      }
      const nested = collectReaderThreadIds(node.children, commentId);
      if (nested !== null) return nested;
    }
    return null;
  };

  // Returns how many entries the removal took out, so the two counters can drop
  // by the same amount the tree lost (a floor takes its replies with it).
  const removeDeletedComment = (commentId: string): number => {
    let removed = 0;
    const nextItems: RailCommentEntry[] = [];
    for (const entry of commentState.items) {
      if (entry.id === commentId) {
        // The tree endpoint returns replies as children, so dropping the floor
        // also drops the replies the server must have removed with it.
        removed += 1 + (Array.isArray(entry.subComments) ? entry.subComments.length : 0);
        continue;
      }
      const visibleChildren = Array.isArray(entry.subComments) ? entry.subComments : [];
      // The server stores every descendant in the floor's flat sub-comment
      // list, so the removed subtree is resolved before filtering that list.
      const subtree = collectReaderThreadIds(buildRailCommentTree(entry), commentId);
      if (subtree === null) {
        nextItems.push(entry);
        continue;
      }
      const keptChildren = visibleChildren.filter((child) => !subtree.has(child.id));
      removed += visibleChildren.length - keptChildren.length;
      nextItems.push({ ...entry, subComments: keptChildren, quotes: keptChildren });
    }
    if (removed === 0) return 0;
    commentState.items = nextItems;
    return removed;
  };

  const deleteReaderComment = async (commentId: string): Promise<void> => {
    if (commentId === "" || commentDeleteBusy.has(commentId)) return;
    const owned = readReaderCommentById(commentId);
    if (owned === null || !isOwnRailComment(owned, readerAccountId)) return;
    const targetId = articleId;
    const generation = readerGeneration;
    // Ask before a destructive write; hosts that stub confirm keep the action.
    if (typeof window.confirm === "function" && !window.confirm("删除这条评论？")) return;
    commentDeleteBusy.add(commentId);
    renderReaderComments();
    try {
      const accountId = await resolveHeyboxId();
      if (accountId === "") throw new Error("请先登录小黑盒");
      await postReaderApi(DELETE_COMMENT_API_PATH, buildDeleteCommentBody(commentId), accountId);
      if (articleId !== targetId || readerGeneration !== generation) return;
      removeReaderCommentMark(targetId, commentId);
      if (articleReplyTarget !== null && articleReplyTarget.id === commentId) clearArticleReplyTarget(false);
      const removedCount = removeDeletedComment(commentId);
      commentState.total = Math.max(0, commentState.total - removedCount);
      // A restored reply with this id is no longer a pending echo of anything.
      for (const row of commentState.pendingReplies) {
        if (row.id !== commentId) continue;
        commentState.pendingBaselines.delete(row.id);
        commentState.settledReplies.delete(row.id);
      }
      commentState.pendingReplies = commentState.pendingReplies.filter((row) => row.id !== commentId);
      if (linkState !== null) linkState.commentCount = Math.max(0, (Number(linkState.commentCount) || 0) - removedCount);
      // Deleting invalidates every cached page, and the tree endpoint may still
      // echo the deleted floor for a moment, so page one is read from the
      // network again until the removed comment is gone from the answer.
      holdRailPageCache(targetId);
      syncActionStates();
      showToast("评论已删除");
      if (commentPanel !== null && !commentPanel.hidden) {
        // The removed comment can sit on any loaded page, so its own page is
        // re-read and merged instead of replacing the list with page one.
        const floorId = owned.rootId !== "" ? owned.rootId : commentId;
        const page = commentState.floorPages.get(floorId) ?? 1;
        void loadReaderComments(page, { fresh: true, force: true, merge: true, expectAbsentId: commentId });
      }
    } catch (error) {
      if (articleId === targetId && readerGeneration === generation) {
        showToast(error instanceof Error ? error.message : "评论删除失败");
      }
    } finally {
      commentDeleteBusy.delete(commentId);
      if (articleId === targetId && readerGeneration === generation) renderReaderComments();
    }
  };

  const createComposerEmojiPicker = (
    input: HTMLElement,
    status: HTMLElement,
    toggle: HTMLButtonElement,
    panel: HTMLDivElement,
  ): ComposerEmojiPicker => {
    const grid = document.createElement("div");
    grid.className = "hbu-reader-composer-emoji-groups";
    let isOpen = false;
    let outsideBound = false;
    const detachOutside = () => {
      if (!outsideBound) return;
      document.removeEventListener("pointerdown", onOutsidePointer, true);
      outsideBound = false;
    };
    const close = (restoreFocus: boolean): void => {
      if (!isOpen) return;
      isOpen = false;
      panel.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      detachOutside();
      if (restoreFocus === true && toggle.isConnected) toggle.focus({ preventScroll: true });
    };
    const onOutsidePointer = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Node && (panel.contains(target) || toggle.contains(target))) return;
      close(false);
    };
    const focusAt = (index: number): void => {
      if (buttons.length === 0) return;
      buttons[Math.min(buttons.length - 1, Math.max(0, index))].focus({ preventScroll: true });
    };
    const insert = (pack: RailEmojiPack, name: string): void => {
      const token = "[" + pack + "_" + name + "]";
      if (!insertComposerText(input, token)) {
        status.textContent = "评论最多 " + ARTICLE_COMMENT_MAX_LENGTH + " 字，无法插入表情";
        return;
      }
      status.textContent = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus({ preventScroll: true });
    };
    const open = () => {
      if (isOpen) return;
      isOpen = true;
      panel.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
      document.addEventListener("pointerdown", onOutsidePointer, true);
      outsideBound = true;
      focusAt(0);
    };
    // Both sprite packs the site itself accepts are offered here. The cube pack
    // is the historical default, and heygirl previously had no way to be sent.
    let buttons: HTMLButtonElement[] = [];
    const build = (): void => {
      grid.replaceChildren();
      buttons = [];
      for (const pack of ["cube", "heygirl"] as const) {
        const group = document.createElement("div");
        group.className = "hbu-reader-composer-emoji-group";
        group.dataset["pack"] = pack;
        const label = document.createElement("div");
        label.className = "hbu-reader-composer-emoji-label";
        label.textContent = pack === "cube" ? "盒表情" : "黑盒娘";
        const sectionGrid = document.createElement("div");
        sectionGrid.className = "hbu-reader-composer-emoji-grid";
        for (const entry of readRailEmojiCatalogEntries(pack)) {
          const name = entry.name;
          const button = document.createElement("button");
          button.type = "button";
          button.dataset["pack"] = pack;
          button.dataset["name"] = name;
          button.setAttribute("aria-label", (pack === "cube" ? "盒表情 " : "黑盒娘 ") + name);
          button.title = name;
          const glyph = document.createElement("span");
          const emoji = resolveRailEmoji(pack, name);
          if (emoji !== null) applyRailEmojiStyle(glyph, emoji, 22);
          button.append(glyph);
          button.addEventListener("click", () => insert(pack, name));
          sectionGrid.append(button);
          buttons.push(button);
        }
        group.append(label, sectionGrid);
        grid.append(group);
      }
    };
    build();
    panel.append(grid);
    panel.addEventListener("keydown", (event) => {
      const active = document.activeElement;
      const index = active instanceof HTMLButtonElement ? buttons.indexOf(active) : -1;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(true);
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        focusAt(0);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        focusAt(buttons.length - 1);
        return;
      }
      const delta = event.key === "ArrowLeft" ? -1
        : event.key === "ArrowRight" ? 1
          : event.key === "ArrowUp" ? -6
            : event.key === "ArrowDown" ? 6
              : 0;
      if (delta === 0) return;
      event.preventDefault();
      focusAt((index < 0 ? 0 : index) + delta);
    });
    toggle.addEventListener("click", () => {
      if (isOpen) close(true);
      else open();
    });
    return { close: close, refresh: build };
  };

  const rebuildComposerEmojiPickers = (): void => {
    for (const root of readArticleComposers()) articleComposerEmojiClosers.get(root)?.refresh();
  };

  const createArticleComposer = (): HTMLDivElement => {
    const root = document.createElement("div");
    root.className = "hbu-reader-composer";
    root.dataset["hbuArticleComposer"] = "";
    const replyBar = document.createElement("div");
    replyBar.className = "hbu-reader-composer-reply";
    replyBar.hidden = true;
    const replyText = document.createElement("span");
    replyText.className = "hbu-reader-composer-reply-name";
    const replyCancel = document.createElement("button");
    replyCancel.type = "button";
    replyCancel.className = "hbu-reader-composer-reply-cancel";
    replyCancel.textContent = "取消回复";
    replyCancel.addEventListener("click", () => clearArticleReplyTarget(true));
    replyBar.append(replyText, replyCancel);
    const input = document.createElement("div");
    input.className = "hbu-reader-composer-input";
    input.setAttribute("contenteditable", "true");
    input.setAttribute("role", "textbox");
    input.setAttribute("aria-multiline", "true");
    input.dataset["placeholder"] = "评论这篇文章…";
    input.dataset["empty"] = "true";
    input.setAttribute("spellcheck", "false");
    input.setAttribute("aria-label", "评论内容");
    const bar = document.createElement("div");
    bar.className = "hbu-reader-composer-bar";
    const status = document.createElement("div");
    status.className = "hbu-reader-composer-status";
    status.setAttribute("role", "status");
    const count = document.createElement("span");
    count.className = "hbu-reader-composer-count";
    count.textContent = "0/" + ARTICLE_COMMENT_MAX_LENGTH;
    const submit = document.createElement("button");
    submit.type = "button";
    submit.className = "hbu-reader-composer-submit";
    submit.textContent = "发布";
    submit.disabled = true;
    const emojiToggle = document.createElement("button");
    emojiToggle.type = "button";
    emojiToggle.className = "hbu-reader-composer-emoji-toggle";
    emojiToggle.textContent = "表情";
    emojiToggle.setAttribute("aria-label", "插入表情");
    emojiToggle.setAttribute("aria-expanded", "false");
    const emojiPanel = document.createElement("div");
    emojiPanel.className = "hbu-reader-composer-emoji";
    emojiPanel.hidden = true;
    emojiPanel.setAttribute("role", "group");
    emojiPanel.setAttribute("aria-label", "表情列表");
    const emojiPicker = createComposerEmojiPicker(input, status, emojiToggle, emojiPanel);
    const imageToggle = document.createElement("button");
    imageToggle.type = "button";
    imageToggle.className = "hbu-reader-composer-image-toggle";
    imageToggle.textContent = "图片";
    imageToggle.title = "添加图片";
    imageToggle.setAttribute("aria-label", "添加图片");
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.className = "hbu-reader-composer-file";
    fileInput.accept = "image/*";
    fileInput.multiple = true;
    fileInput.tabIndex = -1;
    fileInput.setAttribute("aria-hidden", "true");
    const strip = document.createElement("div");
    strip.className = "hbu-reader-composer-images";
    strip.hidden = true;
    strip.setAttribute("role", "group");
    strip.setAttribute("aria-label", "已选图片");
    // The hidden file input keeps the keyboard focus on the visible button.
    imageToggle.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      const files = fileInput.files === null ? [] : Array.from(fileInput.files);
      // Clearing the value lets the same file be picked again after a removal.
      fileInput.value = "";
      addComposerImages(root, files);
    });
    root.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || emojiPanel.hidden) return;
      event.preventDefault();
      event.stopPropagation();
      emojiPicker.close(true);
    }, true);
    let composing = false;
    const syncComposerText = (): void => {
      if (!composing) renderComposerEmojiTokens(input);
      updateComposerTextState(input);
      syncArticleComposers();
    };
    input.addEventListener("compositionstart", () => {
      composing = true;
    });
    input.addEventListener("compositionend", () => {
      composing = false;
      syncComposerText();
    });
    input.addEventListener("beforeinput", (event) => {
      if (event instanceof InputEvent) rejectComposerOverflow(input, event);
    });
    input.addEventListener("input", syncComposerText);
    input.addEventListener("keyup", () => saveComposerSelection(input));
    input.addEventListener("pointerup", () => saveComposerSelection(input));
    articleComposerSelectionCleanup?.();
    const saveSelection = (): void => saveComposerSelection(input);
    document.addEventListener("selectionchange", saveSelection);
    articleComposerSelectionCleanup = () => {
      document.removeEventListener("selectionchange", saveSelection);
      articleComposerSelectionCleanup = null;
    };
    input.addEventListener("paste", (event) => {
      event.preventDefault();
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (insertComposerText(input, text)) syncArticleComposers();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.isComposing) return;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        if (!submit.disabled) void submitArticleComment(input, status);
        return;
      }
      event.preventDefault();
      insertComposerLineBreak(input);
      syncArticleComposers();
    });
    submit.addEventListener("click", () => void submitArticleComment(input, status));
    bar.append(emojiToggle, imageToggle, status, count, submit);
    root.append(replyBar, input, emojiPanel, strip, fileInput, bar);
    articleComposerEmojiClosers.set(root, emojiPicker);
    return root;
  };

  liveCatalogBootstrap();

  const trapCommentPanelTab = (event: KeyboardEvent): void => {
    if (event.key !== "Tab" || commentPanel === null) return;
    const items = Array.from(commentPanel.querySelectorAll<HTMLElement>("button, a[href], [contenteditable='true'], input, [tabindex]:not([tabindex='-1'])"))
      .filter((node) => node.getBoundingClientRect().width > 0 && !node.hasAttribute("disabled"));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && (document.activeElement === first || !commentPanel.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const ensureCommentPanel = (): HTMLElement => {
    if (commentPanel !== null) {
      if (commentPanel.isConnected) return commentPanel;
      commentPanel = null;
      commentPanelList = null;
      lastCommentControlFocus = null;
      commentPanelStatus = null;
      commentPanelStatusText = null;
      commentPanelRetry = null;
      commentPanelMeta = null;
      commentPanelMore = null;
      commentPanelClose = null;
      commentPanelRefresh = null;
    }
    const panel = document.createElement("section");
    panel.className = "hbu-reader-comments-panel";
    panel.hidden = true;
    const scrim = document.createElement("div");
    scrim.className = "hbu-reader-comments-scrim";
    const sheet = document.createElement("div");
    sheet.className = "hbu-reader-comments-sheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.setAttribute("aria-label", "评论");
    const head = document.createElement("div");
    head.className = "hbu-reader-comments-head";
    const heading = document.createElement("div");
    heading.className = "hbu-reader-comments-heading";
    const title = document.createElement("b");
    title.textContent = "评论";
    const meta = document.createElement("span");
    meta.textContent = "";
    heading.append(title, meta);
    const refresh = document.createElement("button");
    refresh.type = "button";
    refresh.className = "hbu-reader-comments-refresh";
    refresh.setAttribute("aria-label", "刷新评论");
    refresh.title = "刷新评论";
    refresh.innerHTML = READER_ICONS.refresh;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "hbu-reader-comments-close";
    close.setAttribute("aria-label", "关闭评论");
    close.innerHTML = READER_ICONS.close;
    head.append(heading, refresh, close);
    const composer = createArticleComposer();
    const body = document.createElement("div");
    body.className = "hbu-reader-comments-body";
    const list = document.createElement("ol");
    list.className = "hbu-reader-comments-list";
    const status = document.createElement("div");
    status.className = "hbu-reader-comments-status";
    status.setAttribute("role", "group");
    status.setAttribute("aria-label", "评论加载状态");
    const statusText = document.createElement("div");
    statusText.setAttribute("role", "status");
    statusText.setAttribute("aria-live", "polite");
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "hbu-reader-comments-status-retry";
    retry.textContent = "重试";
    retry.hidden = true;
    status.append(statusText, retry);
    body.append(list, status);
    const foot = document.createElement("div");
    foot.className = "hbu-reader-comments-foot";
    const more = document.createElement("button");
    more.type = "button";
    more.textContent = "加载更多";
    const openLink = document.createElement("a");
    openLink.textContent = "打开帖子";
    openLink.href = LINK_HREF_PREFIX + articleId;
    openLink.target = "_blank";
    openLink.rel = "noopener noreferrer";
    foot.append(more, openLink);
    sheet.append(head, composer, body, foot);
    panel.append(scrim, sheet);
    commentPanel = panel;
    commentPanelList = list;
    commentPanelStatus = status;
    commentPanelStatusText = statusText;
    commentPanelRetry = retry;
    commentPanelMeta = meta;
    commentPanelMore = more;
    commentPanelClose = close;
    commentPanelRefresh = refresh;
    list.addEventListener("focusin", (event) => {
      const target = event.target;
      if (target instanceof HTMLElement) {
        const described = describeCommentControl(target);
        if (described !== null) lastCommentControlFocus = described;
      }
    });
    close.addEventListener("click", closeComments);
    scrim.addEventListener("click", closeComments);
    refresh.addEventListener("click", () => {
      if (commentState.loading) return;
      // Refreshing page one keeps the floors read from later pages, so a manual
      // refresh cannot drop a thread the reader already paged in.
      void loadReaderComments(1, { fresh: true, force: true, merge: commentState.page > 1 });
    });
    more.addEventListener("click", () => {
      if (!commentState.loading) void loadReaderComments(commentState.page + 1);
    });
    retry.addEventListener("click", () => {
      if (commentState.loading) return;
      commentPanelClose?.focus({ preventScroll: true });
      void loadReaderComments(commentState.page > 0 ? commentState.page + 1 : 1);
    });
    list.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const collapse = target.closest(".hbu-reader-comments-collapse");
      if (collapse instanceof HTMLElement) {
        const threadId = collapse.dataset["threadId"] || "";
        if (threadId === "") return;
        event.preventDefault();
        const redrawFrom: { id: string; action: CommentControlAction } = { id: threadId, action: "expand" };
        collapsedCommentThreads.add(threadId);
        renderReaderComments();
        restoreCommentControlFocus(redrawFrom);
        return;
      }
      const expand = target.closest(".hbu-reader-comments-expand");
      if (expand instanceof HTMLElement) {
        const threadId = expand.dataset["threadId"] || "";
        if (threadId === "") return;
        event.preventDefault();
        const redrawFrom: { id: string; action: CommentControlAction } = { id: threadId, action: "collapse" };
        collapsedCommentThreads.delete(threadId);
        renderReaderComments();
        restoreCommentControlFocus(redrawFrom);
        return;
      }
      const remove = target.closest(".hbu-reader-comments-delete");
      if (remove instanceof HTMLElement) {
        const deleteId = remove.dataset["deleteId"] || "";
        if (deleteId === "") return;
        event.preventDefault();
        void deleteReaderComment(deleteId);
        return;
      }
      const reply = target.closest(".hbu-reader-comments-reply");
      if (!(reply instanceof HTMLElement)) return;
      const id = reply.dataset["replyId"] || "";
      const rootId = reply.dataset["replyRoot"] || id;
      const name = reply.dataset["replyName"] || "";
      if (id === "") return;
      event.preventDefault();
      beginArticleReply({ id: id, rootId: rootId, name: name });
    });
    sheet.addEventListener("keydown", trapCommentPanelTab);
    document.body.append(panel);
    return panel;
  };

  const isCommentPanelOpen = (): boolean => commentPanel !== null && !commentPanel.hidden;

  const openComments = (): void => {
    if (host === null) return;
    closeFavourMenu();
    closeCyDialog();
    if (isCommentPanelOpen()) {
      closeComments();
      return;
    }
    const panel = ensureCommentPanel();
    panel.hidden = false;
    host.inert = true;
    renderReaderComments();
    commentPanelClose?.focus({ preventScroll: true });
    syncArticleComposers();
    if (commentState.loading) return;
    // Marks survive a page reload, so the panel can restore its own comment and
    // keep checking the page that owns it instead of trusting one stale answer.
    const marks = readReaderCommentMarks(articleId);
    restoreReaderCommentMarks();
    const markVerifyPage = marks.reduce((page, mark) => Math.max(page, mark.verifyPage), 1);
    const expectationOptions: ReaderCommentLoadOptions = marks.length === 0
      ? {}
      : { expectations: marks, verifyPage: markVerifyPage };
    renderReaderComments();
    // A panel reopened after a while can show a page that predates writes made
    // elsewhere, so a stale page one is refreshed from the network.
    const stalePanel = commentState.loaded && Date.now() - commentState.loadedAt > COMMENT_PANEL_STALE_MS;
    if (!commentState.loaded) {
      // The first page is read from the network on open. The site itself keeps a
      // cache of the tree and only prepends a freshly written floor there, so a
      // cached copy taken before the write (for example by the link state read
      // during render) would hide the reader's own new comment after leaving and
      // re-entering the post.
      void loadReaderComments(1, { fresh: true, force: true, ...expectationOptions });
    } else if (stalePanel) {
      void loadReaderComments(1, { fresh: true, force: true, merge: commentState.page > 1, ...expectationOptions });
    }
  };

  const resetReaderComments = (): void => {
    commentLoadController?.abort();
    commentLoadController = null;
    articleCommentBusy = false;
    commentDeleteBusy.clear();
    collapsedCommentThreads.clear();
    clearArticleComposers();
    if (host !== null) host.inert = false;
    if (commentPanel !== null) {
      commentPanel.hidden = true;
      const link = commentPanel.querySelector<HTMLAnchorElement>(".hbu-reader-comments-foot a");
      if (link !== null) link.href = LINK_HREF_PREFIX + articleId;
    }
    commentState = createCommentState();
  };

  document.addEventListener(HIDE_CY_EVENT, () => {
    if (commentPanel !== null && !commentPanel.hidden) renderReaderComments();
  });

  const closeComments = (): void => {
    if (commentPanel === null || commentPanel.hidden) return;
    commentPanel.hidden = true;
    lastCommentControlFocus = null;
    if (host !== null) host.inert = false;
    host?.querySelector<HTMLElement>('[data-action="comment"]')?.focus({ preventScroll: true });
  };

  const closeLightbox = (): void => {
    const active = document.activeElement;
    const restoreFocus = lightbox !== null && active instanceof HTMLElement && lightbox.contains(active);
    lightbox?.remove();
    lightbox = null;
    lightboxImage = null;
    lightboxZoom = 0;
    lightboxBaseWidth = 0;
    lightboxNatural = { width: 0, height: 0 };
    if (restoreFocus && lightboxReturnFocus !== null && lightboxReturnFocus.isConnected) {
      lightboxReturnFocus.focus({ preventScroll: true });
    }
    lightboxReturnFocus = null;
  };

  /** Applies the current zoom step to the open picture without reopening it. */
  const applyLightboxZoom = (): void => {
    if (lightboxImage === null) return;
    const width = computeLightboxZoomWidth(lightboxBaseWidth, lightboxNatural.width, lightboxZoom);
    if (width <= 0) return;
    lightboxImage.style.width = width + "px";
    lightboxImage.dataset["zoom"] = String(lightboxZoom);
    const hint = lightbox?.querySelector<HTMLElement>(".hbu-reader-lightbox-hint");
    if (hint !== null && hint !== undefined) {
      hint.textContent = lightboxZoom === 0
        ? "左键或 Enter 放大 · 右键或 Shift+Enter 缩小 · 0 复位 · 滚轮查看长图"
        : "左键放大 · 右键缩小 · 已放大 " + Math.round((width / Math.max(1, lightboxBaseWidth)) * 100) + "%";
    }
  };

  const stepLightboxZoom = (delta: number): void => {
    if (lightboxImage === null) return;
    lightboxZoom = Math.max(0, Math.min(LIGHTBOX_ZOOM_MAX, lightboxZoom + delta));
    applyLightboxZoom();
  };

  const resetLightboxZoom = (): void => {
    if (lightboxImage === null) return;
    lightboxZoom = 0;
    applyLightboxZoom();
  };

  /** Tab is trapped inside the modal and cycles over its own controls. */
  const cycleLightboxFocus = (backwards: boolean): void => {
    if (lightbox === null) return;
    const focusables = Array.from(lightbox.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])'));
    if (focusables.length === 0) return;
    const index = focusables.findIndex((node) => node === document.activeElement);
    const next = backwards
      ? (index <= 0 ? focusables.length - 1 : index - 1)
      : (index === -1 || index === focusables.length - 1 ? 0 : index + 1);
    focusables[next]!.focus({ preventScroll: true });
  };

  /** Reader pictures open the lightbox like a button: by click, Enter, or Space. */
  const bindLightboxTrigger = (image: HTMLImageElement, source: () => string): void => {
    image.tabIndex = 0;
    image.setAttribute("role", "button");
    image.setAttribute("aria-label", "查看大图");
    image.title = "查看大图";
    image.addEventListener("click", () => openLightbox(source()));
    image.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openLightbox(source());
    });
  };

  /**
   * Sole image viewer. Left click steps the picture up, right click steps it
   * back down, and a long picture opens at roughly half the screen width so it
   * can be read by scrolling instead of by squinting.
   */
  const openLightbox = (source: string): void => {
    if (source === "") return;
    if (lightbox === null) {
      const overlay = document.createElement("div");
      overlay.className = "hbu-reader-lightbox";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", "查看大图");
      overlay.tabIndex = -1;

      const bar = document.createElement("div");
      bar.className = "hbu-reader-lightbox-bar";
      const hint = document.createElement("div");
      hint.className = "hbu-reader-lightbox-hint";
      hint.textContent = "左键或 Enter 放大 · 右键或 Shift+Enter 缩小 · 0 复位 · 滚轮查看长图";
      const close = document.createElement("button");
      close.type = "button";
      close.className = "hbu-reader-lightbox-close";
      close.setAttribute("aria-label", "关闭大图");
      close.title = "关闭大图";
      close.innerHTML = READER_ICONS.close;
      close.addEventListener("click", closeLightbox);
      bar.append(hint, close);

      const stage = document.createElement("div");
      stage.className = "hbu-reader-lightbox-stage";
      const img = document.createElement("img");
      img.alt = "";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.dataset["zoom"] = "0";
      // A left click zooms in one step, a right click steps back out, and a
      // double click keeps the familiar browser shortcut to the base size.
      img.addEventListener("click", (event) => {
        event.stopPropagation();
        stepLightboxZoom(1);
      });
      img.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        stepLightboxZoom(-1);
      });
      img.addEventListener("dblclick", (event) => {
        event.preventDefault();
        resetLightboxZoom();
      });
      // Keyboard users zoom the focused picture: Enter zooms in, Shift+Enter
      // steps back out, and +/- or 0 work from anywhere inside the dialog.
      img.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        stepLightboxZoom(event.shiftKey ? -1 : 1);
      });
      img.tabIndex = 0;
      img.setAttribute("role", "button");
      img.setAttribute("aria-label", "放大图片");
      img.addEventListener("load", () => {
        lightboxNatural = { width: img.naturalWidth, height: img.naturalHeight };
        lightboxBaseWidth = computeLightboxBaseWidth(img.naturalWidth, img.naturalHeight, window.innerWidth, window.innerHeight);
        applyLightboxZoom();
      });
      stage.append(img);
      // The picture swallows its own clicks; anywhere else on the backdrop closes.
      overlay.addEventListener("click", closeLightbox);
      overlay.append(bar, stage);
      document.body.append(overlay);
      lightbox = overlay;
      lightboxImage = img;
      lightboxReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    const img = lightboxImage;
    if (img === null) return;
    lightboxZoom = 0;
    lightboxBaseWidth = 0;
    lightboxNatural = { width: 0, height: 0 };
    img.dataset["zoom"] = "0";
    img.style.width = "";
    img.src = source;
    // A cached picture may already be complete, so the load event never fires.
    if (img.complete && img.naturalWidth > 0) {
      lightboxNatural = { width: img.naturalWidth, height: img.naturalHeight };
      lightboxBaseWidth = computeLightboxBaseWidth(img.naturalWidth, img.naturalHeight, window.innerWidth, window.innerHeight);
      applyLightboxZoom();
    }
    lightbox.focus({ preventScroll: true });
  };

  const scrollToPage = (index: number): void => {
    if (host === null) return;
    const pages = Array.from(host.querySelectorAll<HTMLElement>(".hbu-reader-page"));
    if (pages.length === 0) return;
    const next = Math.min(pages.length - 1, Math.max(0, index));
    const target = pages[next];
    if (target === undefined) return;
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    target.scrollIntoView({ block: "start", behavior: behavior });
  };

  const scrollViewport = (direction: number): void => {
    const scroll = host?.querySelector<HTMLElement>(".hbu-reader-scroll");
    if (!scroll) return;
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    scroll.scrollBy({ top: Math.round(scroll.clientHeight * 0.82) * direction, behavior: behavior });
  };

  const coverInView = (): boolean => {
    const scroll = host?.querySelector<HTMLElement>(".hbu-reader-scroll");
    const hero = host?.querySelector('.hbu-reader-page[data-kind="hero"]');
    if (!scroll || !hero) return false;
    return hero.getBoundingClientRect().bottom - scroll.getBoundingClientRect().top > scroll.clientHeight * 0.45;
  };

  const bindSwipe = (scroll: HTMLElement): void => {
    let startX = 0;
    let startY = 0;
    scroll.addEventListener("touchstart", (event) => {
      if (event.touches.length !== 1) return;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
    }, { passive: true });
    scroll.addEventListener("touchend", (event) => {
      if (event.changedTouches.length !== 1) return;
      const deltaX = event.changedTouches[0].clientX - startX;
      const deltaY = event.changedTouches[0].clientY - startY;
      if (Math.abs(deltaX) < 52 || Math.abs(deltaX) < Math.abs(deltaY) * 1.3) return;
      if (coverInView() && coverTotal > 1) {
        if (deltaX < 0 && coverIndex === coverTotal - 1) scrollToPage(1);
        else if (deltaX > 0 && coverIndex === 0) scrollToPage(0);
        else setCover(coverIndex + (deltaX < 0 ? 1 : -1));
        return;
      }
      const page = host?.querySelectorAll<HTMLElement>(".hbu-reader-page")[activeIndex];
      if (page !== undefined && page.scrollWidth > page.clientWidth + 8) return;
      scrollViewport(deltaX < 0 ? 1 : -1);
    }, { passive: true });
  };

  const setCover = (value: number): void => {
    if (host === null || coverTotal === 0) return;
    coverIndex = (value + coverTotal) % coverTotal;
    const sources = Array.from(host.querySelectorAll<HTMLImageElement>(".hbu-reader-cover img"));
    const glow = host.querySelector<HTMLElement>(".hbu-reader-cover-glow");
    if (glow !== null && sources[coverIndex] !== undefined) {
      glow.style.backgroundImage = 'url("' + readImageSource(sources[coverIndex]).replace(/"/g, '\\"') + '")';
    }
    for (const [index, node] of sources.entries()) {
      node.dataset["active"] = String(index === coverIndex);
    }
    for (const [index, node] of Array.from(host.querySelectorAll<HTMLElement>(".hbu-reader-cover-dots button")).entries()) {
      node.setAttribute("aria-current", String(index === coverIndex));
    }
  };

  const bindTag = (node: HTMLButtonElement, text: string): void => {
    node.addEventListener("click", (event) => {
      event.preventDefault();
      const native = Array.from(document.querySelectorAll("#page-bbs-link .link-tags__tag-item"))
        .find((candidate) => (candidate.textContent || "").trim() === text);
      if (native instanceof HTMLElement) native.click();
    });
  };

  const interactionBindings = new Set<{ refresh: () => void; dispose: () => void }>();

  const bindRichProxy = (clone: Element, native: Element): void => {
    if (native.matches(READER_VOTE_SELECTOR + ", button, input, select, textarea, [role=button]")
      || native.querySelector("button, input, select, textarea, [role=button]") !== null) {
      interactionBindings.add(bindReaderInteraction(clone, native, (node) => !(node instanceof Element) || !isHiddenEmbedNode(node)));
    }
    for (const link of Array.from(clone.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
      if ((link.getAttribute("href") || "").startsWith("#")) link.addEventListener("click", (event) => event.preventDefault());
    }
    for (const image of Array.from(clone.querySelectorAll<HTMLImageElement>("img"))) {
      const source = readImageSource(image);
      if (source !== "") image.src = source;
      image.loading = "lazy";
      image.decoding = "async";
      bindLightboxTrigger(image, () => readImageSource(image));
    }
  };

  const EMBED_TAGS = new Set(["iframe", "video", "audio", "embed", "object"]);
  const EMBED_SELECTOR = EMBEDDED_MEDIA_SELECTOR;

  const isInlineHidden = (node: unknown): boolean => node instanceof HTMLElement
    && (node.hasAttribute("hidden") || node.style.display === "none" || node.style.visibility === "hidden");
  const isEmbedElement = (node: unknown): boolean => node instanceof Element && EMBED_TAGS.has(node.tagName.toLowerCase());
  const isEmbedWrapper = (node: unknown): boolean => node instanceof Element && node.tagName.toLowerCase() === "div" && node.classList.contains("iframe");
  const hasHiddenInlineAncestor = (node: Element): boolean => {
    let current = node.parentElement;
    while (current !== null) {
      if (isInlineHidden(current)) return true;
      current = current.parentElement;
    }
    return false;
  };
  const isComputedHidden = (node: unknown): boolean => {
    if (!(node instanceof Element) || !node.isConnected) return false;
    const visibility = window.getComputedStyle(node).visibility;
    if (visibility === "hidden" || visibility === "collapse") return true;
    return hasHiddenDisplayAncestor(node);
  };
  const hasHiddenDisplayAncestor = (node: Element): boolean => {
    let current: Element | null = node;
    while (current !== null && !current.matches(READER_SOURCE_ROOT_SELECTOR)) {
      if (window.getComputedStyle(current).display === "none") return true;
      current = current.parentElement;
    }
    return false;
  };
  const isUnavailableEmbed = (node: Element): boolean => isInlineHidden(node) || hasHiddenInlineAncestor(node) || isComputedHidden(node);
  const isHiddenEmbedNode = (node: Element): boolean => (isEmbedElement(node) || isEmbedWrapper(node)) && isUnavailableEmbed(node);

  const readVisibleEmbeds = (node: Element): Element[] => Array.from(node.querySelectorAll(EMBED_SELECTOR))
    .filter((embed) => !isUnavailableEmbed(embed));

  const isTextFreeContainer = (node: Element): boolean => {
    const text = (node.textContent || "").replace(/\s+/g, " ").trim();
    return text === "" && node.querySelector("img, picture") === null;
  };

  const readSingleSourceGroup = (source: Element, embeds: Element[]): EmbedGroup | null => embeds.length === 1 ? { source: source, embeds: embeds } : null;

  const readContainerEmbedGroup = (node: Element, embeds: Element[]): EmbedGroup | null => {
    if (embeds.length === 0) return null;
    if (isEmbedWrapper(node)) return readSingleSourceGroup(node, embeds);
    return isTextFreeContainer(node) ? readSingleSourceGroup(embeds[0], embeds) : null;
  };

  const readEmbedGroup = (node: unknown): EmbedGroup | null => {
    if (!(node instanceof Element) || isUnavailableEmbed(node)) return null;
    if (EMBED_TAGS.has(node.tagName.toLowerCase())) return { source: node, embeds: [node] };
    return readContainerEmbedGroup(node, readVisibleEmbeds(node));
  };

  const readEmbedGroups = (root: Element): EmbedGroup[] => {
    if (!(root instanceof Element)) return [];
    const groups: EmbedGroup[] = [];
    const collect = (node: Element): void => {
      if (!node.matches(EMBED_SELECTOR) && node.querySelector(EMBED_SELECTOR) === null) return;
      const group = readEmbedGroup(node);
      if (group !== null) {
        groups.push(group);
        return;
      }
      for (const child of Array.from(node.children)) collect(child);
    };
    collect(root);
    return groups;
  };

  const containsEmbedOrWrapper = (node: Element): boolean => node.matches(EMBED_SELECTOR)
    || isEmbedWrapper(node)
    || node.querySelector(EMBED_SELECTOR) !== null;

  const readMediaSequenceItem = (node: Element): MediaSequenceItem | null => {
    if (node instanceof HTMLImageElement) return { kind: "image", node };
    if (!containsEmbedOrWrapper(node)) return null;
    const group = readEmbedGroup(node);
    return group === null ? null : { kind: "embed", group };
  };

  const readMediaSequence = (root: Element): MediaSequenceItem[] => {
    if (!(root instanceof Element)) return [];
    const items: MediaSequenceItem[] = [];
    const collect = (node: Element): void => {
      const item = readMediaSequenceItem(node);
      if (item !== null) {
        items.push(item);
        return;
      }
      for (const child of Array.from(node.children)) collect(child);
    };
    collect(root);
    return items;
  };

  // Site images can keep their real URL in data-src/data-original while src is a
  // placeholder. One reader here keeps body pages, the hero, and signatures aligned.
  const readImageSource = (node: unknown): string => {
    if (!(node instanceof HTMLImageElement)) return "";
    for (const name of ["data-src", "data-original"]) {
      const value = (node.getAttribute(name) || "").trim();
      if (value !== "" && !/^(?:data|blob):/i.test(value)) return value;
    }
    for (const value of [node.currentSrc, node.getAttribute("src") || ""]) {
      const source = value.trim();
      if (source !== "" && !/^(?:data|blob):/i.test(source)) return source;
    }
    return "";
  };

  const readVideoSource = (node: unknown): string => {
    if (!(node instanceof HTMLVideoElement)) return "";
    const values = [
      ...Array.from(node.querySelectorAll("source")).map((source) => source.getAttribute("src") || ""),
      node.getAttribute("src") || "",
      node.currentSrc,
    ];
    for (const raw of values) {
      const source = raw.trim();
      if (source === "" || /^(?:javascript|data):/i.test(source)) continue;
      return source;
    }
    return "";
  };

  const readPosterSource = (node: unknown): string => {
    if (!(node instanceof HTMLVideoElement)) return "";
    const poster = (node.getAttribute("poster") || "").trim();
    return poster !== "" && !/^(?:data|blob):/i.test(poster) ? poster : "";
  };

  const readHeaderImages = (pageRoot: unknown): string[] => {
    const seen = new Set<string>();
    const sources: string[] = [];
    if (!(pageRoot instanceof Element)) return sources;
    for (const node of Array.from(pageRoot.querySelectorAll<HTMLImageElement>(READER_SOURCE_HEADER_SELECTOR))) {
      const source = readImageSource(node);
      if (source === "" || seen.has(source)) continue;
      seen.add(source);
      sources.push(source);
    }
    return sources;
  };

  const readOrderedImageSources = (scope: unknown): string[] => {
    if (!(scope instanceof Element)) return [];
    const seen = new Set<string>();
    const sources: string[] = [];
    for (const node of Array.from(scope.querySelectorAll<HTMLImageElement>("img"))) {
      if (node.closest(READER_MEDIA_EXCLUDE_SELECTOR) !== null) continue;
      const source = readImageSource(node);
      if (source === "" || seen.has(source)) continue;
      seen.add(source);
      sources.push(source);
    }
    return sources;
  };

  const readBodyImages = (article: Element, body: Element | null): string[] => {
    const scope = body || article;
    if (!(scope instanceof Element)) return [];
    const seen = new Set<string>();
    const candidates: { source: string; area: number; loaded: boolean; index: number }[] = [];
    for (const [index, node] of Array.from(scope.querySelectorAll<HTMLImageElement>("img")).entries()) {
      if (node.closest(READER_MEDIA_EXCLUDE_SELECTOR) !== null) continue;
      const source = readImageSource(node);
      if (source === "" || seen.has(source)) continue;
      seen.add(source);
      const naturalWidth = node.naturalWidth;
      const naturalHeight = node.naturalHeight;
      const rect = node.getBoundingClientRect();
      const declaredWidth = Number(node.getAttribute("width")) || 0;
      const declaredHeight = Number(node.getAttribute("height")) || 0;
      const width = naturalWidth > 0 ? naturalWidth : (rect.width > 0 ? rect.width : declaredWidth);
      const height = naturalHeight > 0 ? naturalHeight : (rect.height > 0 ? rect.height : declaredHeight);
      if (width > 0 && width < 120) continue;
      candidates.push({ source: source, area: width * height, loaded: naturalWidth > 0, index: index });
    }
    candidates.sort((left, right) => Number(right.loaded) - Number(left.loaded) || right.area - left.area || left.index - right.index);
    return candidates.map((item) => item.source);
  };

  const readPositiveDimension = (raw: string, pattern: RegExp): number => {
    if (!pattern.test(raw)) return 0;
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) && value > 0 ? value : 0;
  };

  const readEmbedDimension = (node: Element, name: "width" | "height"): number => {
    const inlineValue = node instanceof HTMLElement ? node.style[name].trim() : "";
    if (/^\d+(\.\d+)?px$/.test(inlineValue)) return readPositiveDimension(inlineValue, /^\d+(\.\d+)?px$/);
    const attributeValue = (node.getAttribute(name) || "").trim();
    return readPositiveDimension(attributeValue, /^\d+(\.\d+)?$/);
  };

  const readEmbedHeight = (node: Element): number => readEmbedDimension(node, "height");
  const readEmbedWidth = (node: Element): number => readEmbedDimension(node, "width");

  const isAudioOnlyGroup = (embeds: Element[]): boolean => embeds.length > 0 && embeds.every((embed) => embed.tagName.toLowerCase() === "audio");

  const SUSPENDED_SOURCE_MARKER = "heybox-up-suspended";

  const readSuspendedSourceValue = (name: string): string => name === "srcdoc"
    ? "<!doctype html><meta name=\"heybox-up-suspended\" content=\"\">"
    : `about:blank#${SUSPENDED_SOURCE_MARKER}`;

  const reconcileSuspendedSourceMutations = (
    embed: Element,
    state: SuspendedMarkupEmbedState,
    records: MutationRecord[],
  ): void => {
    if (suspendedEmbeds.get(embed) !== state) return;
    for (const record of records) {
      const name = record.attributeName;
      if (name === null) continue;
      delete state.attributes[name];
    }
  };

  const suspendMediaEmbed = (embed: HTMLMediaElement): void => {
    suspendedEmbeds.set(embed, {
      kind: "media",
      muted: embed.muted,
      currentTime: Number.isFinite(embed.currentTime) ? embed.currentTime : 0,
    });
    embed.muted = true;
    embed.pause();
  };

  const suspendMarkupEmbed = (embed: Element): void => {
    const attributes: Record<string, string> = {};
    for (const name of EMBEDDED_MEDIA_SOURCE_ATTRIBUTES) {
      const value = embed.getAttribute(name);
      if (value !== null) attributes[name] = value;
    }
    const state: SuspendedMarkupEmbedState = { kind: "markup", attributes: attributes, sourceObserver: null };
    const sourceObserver = new MutationObserver((records) => reconcileSuspendedSourceMutations(embed, state, records));
    state.sourceObserver = sourceObserver;
    sourceObserver.observe(embed, { attributes: true, attributeFilter: Array.from(EMBEDDED_MEDIA_SOURCE_ATTRIBUTES) });
    suspendedEmbeds.set(embed, state);
    for (const name of Object.keys(attributes)) embed.setAttribute(name, readSuspendedSourceValue(name));
    sourceObserver.takeRecords();
  };

  const suspendNativeEmbed = (embed: Element): void => {
    if (suspendedEmbeds.has(embed)) return;
    if (embed instanceof HTMLMediaElement) {
      suspendMediaEmbed(embed);
      return;
    }
    suspendMarkupEmbed(embed);
  };

  const restoreSuspendedMedia = (embed: HTMLMediaElement, state: SuspendedMediaEmbedState): void => {
    embed.muted = state.muted;
    if (state.currentTime <= 0 || embed.readyState <= 0) return;
    try {
      embed.currentTime = state.currentTime;
    } catch (error) {
      console.debug("[HeyBox Up] Failed to restore embedded media position", error);
    }
  };

  const restoreSuspendedMarkup = (embed: Element, state: SuspendedMarkupEmbedState): void => {
    if (state.sourceObserver !== null) {
      reconcileSuspendedSourceMutations(embed, state, state.sourceObserver.takeRecords());
      state.sourceObserver.disconnect();
    }
    for (const [name, value] of Object.entries(state.attributes)) embed.setAttribute(name, value);
  };

  const restoreSuspendedEmbed = (embed: Element, state: SuspendedEmbedState): void => {
    if (state.kind === "markup") {
      restoreSuspendedMarkup(embed, state);
      return;
    }
    if (embed instanceof HTMLMediaElement) restoreSuspendedMedia(embed, state);
  };

  const restoreSuspendedEmbeds = (): void => {
    for (const [embed, state] of suspendedEmbeds) restoreSuspendedEmbed(embed, state);
    suspendedEmbeds.clear();
  };

  const removeUnavailableEmbedClones = (clone: Element, source: Element): void => {
    const nativeEmbeds = Array.from(source.querySelectorAll(EMBED_SELECTOR));
    const clonedEmbeds = Array.from(clone.querySelectorAll(EMBED_SELECTOR));
    nativeEmbeds.forEach((embed, index) => {
      const cloned = clonedEmbeds[index];
      if (cloned instanceof Element && isUnavailableEmbed(embed)) cloned.remove();
    });
  };

  const readGroupDimension = (group: EmbedGroup, reader: (node: Element) => number): number => {
    const ownValue = reader(group.source);
    if (!isEmbedWrapper(group.source) || ownValue > 0) return ownValue;
    const declared = group.embeds.find((embed) => reader(embed) > 0);
    return declared === undefined ? 0 : reader(declared);
  };

  const applyDefaultEmbedRatio = (frame: HTMLElement, group: EmbedGroup): void => {
    if (isAudioOnlyGroup(group.embeds)) return;
    frame.style.aspectRatio = "16 / 9";
  };

  const applyEmbedFrameAspect = (frame: HTMLElement, group: EmbedGroup, width: number, height: number): void => {
    if (width > 0 && height > 0) {
      frame.style.aspectRatio = `${width} / ${height}`;
      return;
    }
    if (height > 0) {
      frame.style.height = `${height}px`;
      return;
    }
    applyDefaultEmbedRatio(frame, group);
  };

  const applyEmbedFrameSize = (frame: HTMLElement, group: EmbedGroup): void => {
    const width = readGroupDimension(group, readEmbedWidth);
    const height = readGroupDimension(group, readEmbedHeight);
    if (width > 0) frame.style.width = `min(100%, ${width}px)`;
    applyEmbedFrameAspect(frame, group, width, height);
  };

  const addEmbedPage = (target: DocumentFragment, group: EmbedGroup): void => {
    // cloneNode returns Node; the source is an Element, so the clone is one too.
    const clone = group.source.cloneNode(true) as Element;
    removeUnavailableEmbedClones(clone, group.source);
    const frame = document.createElement("div");
    frame.className = "hbu-reader-embed";
    frame.append(clone);
    applyEmbedFrameSize(frame, group);
    const page = document.createElement("section");
    page.className = "hbu-reader-page";
    page.dataset["kind"] = "embed";
    page.append(frame);
    target.append(page);
    for (const embed of group.embeds) suspendNativeEmbed(embed);
  };

  const addTextPages = (target: DocumentFragment, lines: string[]): void => {
    let buffer: string[] = [];
    let bufferChars = 0;
    const flush = () => {
      const paragraphs = buffer;
      buffer = [];
      bufferChars = 0;
      if (paragraphs.length === 0) return;
      const page = document.createElement("section");
      page.className = "hbu-reader-page";
      page.dataset["kind"] = "text";
      const copy = document.createElement("div");
      copy.className = "hbu-reader-copy";
      for (const paragraph of paragraphs) {
        const node = document.createElement("p");
        node.textContent = paragraph;
        copy.append(node);
      }
      page.append(copy);
      target.append(page);
    };
    for (const raw of lines) {
      const line = raw.replace(/\s+/g, " ").trim();
      if (line === "") continue;
      buffer.push(line);
      bufferChars += line.length;
      if (buffer.length >= 4 || bufferChars >= 420) flush();
    }
    flush();
  };

  const addMediaPage = (target: DocumentFragment, source: string, caption: string): void => {
    if (source === "") return;
    const page = document.createElement("section");
    page.className = "hbu-reader-page";
    page.dataset["kind"] = "media";
    const img = document.createElement("img");
    img.className = "hbu-reader-media";
    img.src = source;
    img.alt = caption || "正文图片";
    img.loading = "lazy";
    img.decoding = "async";
    bindLightboxTrigger(img, () => img.currentSrc || img.src);
    page.append(img);
    target.append(page);
  };

  const addNoticePage = (target: DocumentFragment, heading: string, message: string): void => {
    const page = document.createElement("section");
    page.className = "hbu-reader-page";
    page.dataset["kind"] = "notice";
    const card = document.createElement("div");
    card.className = "hbu-reader-notice";
    const title = document.createElement("h2");
    title.textContent = heading;
    const copy = document.createElement("p");
    copy.textContent = message;
    const action = document.createElement("a");
    action.href = LINK_HREF_PREFIX + articleId;
    action.textContent = "查看原帖";
    const capturedArticleId = articleId;
    action.addEventListener("click", (event) => {
      event.preventDefault();
      if (articleId !== capturedArticleId) return;
      dismissedArticleId = capturedArticleId;
      teardown();
      showToast("已退出沉浸阅读，可在设置中重新开启");
    });
    card.append(title, copy, action);
    page.append(card);
    target.append(page);
  };

  // A standalone video post owns a dedicated page with native controls; video.js is never
  // bootstrapped here because the reader page is a detached surface the player cannot bind to.
  const addVideoPage = (target: DocumentFragment, item: ReaderVideo): void => {
    const page = document.createElement("section");
    page.className = "hbu-reader-page";
    page.dataset["kind"] = "video";
    const video = document.createElement("video");
    video.className = "hbu-reader-video";
    video.controls = true;
    video.autoplay = false;
    video.playsInline = true;
    video.preload = "metadata";
    video.setAttribute("aria-label", "原帖视频");
    if (item.poster !== "") video.poster = item.poster;
    video.src = item.source;
    page.append(video);
    target.append(page);
    suspendNativeEmbed(item.node);
  };

  const addVideoPostPages = (target: DocumentFragment, data: ReaderData): void => {
    if (!data.isVideoPost) return;
    const usable = data.videos.filter((item) => item.source !== "");
    if (usable.length === 0) {
      addNoticePage(target, "视频暂时无法加载", "原帖还没有给出可播放的视频地址，可以刷新页面重试，或回到原帖播放。");
      return;
    }
    for (const item of usable) addVideoPage(target, item);
  };

  const addHeadingPage = (target: DocumentFragment, text: string): void => {
    const value = text.replace(/\s+/g, " ").trim();
    if (value === "") return;
    const page = document.createElement("section");
    page.className = "hbu-reader-page";
    page.dataset["kind"] = "heading";
    const copy = document.createElement("div");
    copy.className = "hbu-reader-copy";
    copy.textContent = value;
    page.append(copy);
    target.append(page);
  };

  const addRichPage = (target: DocumentFragment, native: Element): void => {
    // cloneNode returns Node; the source is an Element, so the clone is one too.
    const clone = native.cloneNode(true) as Element;
    removeUnavailableEmbedClones(clone, native);
    bindRichProxy(clone, native);
    for (const group of readEmbedGroups(native)) {
      for (const embed of group.embeds) suspendNativeEmbed(embed);
    }
    const page = document.createElement("section");
    page.className = "hbu-reader-page";
    page.dataset["kind"] = "rich";
    const rich = document.createElement("div");
    rich.className = "hbu-reader-rich";
    rich.append(clone);
    page.append(rich);
    target.append(page);
  };

  const buildPages = (target: DocumentFragment, body: Element): void => {
    if (!(target instanceof DocumentFragment) || !(body instanceof Element)) return;
    const lines: string[] = [];
    const flush = () => {
      if (lines.length === 0) return;
      addTextPages(target, lines.splice(0, lines.length));
    };
    const visit = (node: Node): void => {
      if (node.nodeType === Node.TEXT_NODE) {
        for (const line of (node.textContent || "").split(/\n+/)) lines.push(line);
        return;
      }
      if (!(node instanceof Element)) return;
      const tag = node.tagName.toLowerCase();
      if (tag === "br") { flush(); return; }
      if (tag === "script" || tag === "style") return;
      if (isHiddenEmbedNode(node)) return;
      if (node.matches(READER_VOTE_SELECTOR)) {
        flush();
        addRichPage(target, node);
        return;
      }
      if (tag === "img") {
        flush();
        addMediaPage(target, (node.getAttribute("data-src") || node.getAttribute("src") || ""), node.getAttribute("alt") || "");
        return;
      }
      if (/^h[1-4]$/.test(tag)) {
        flush();
        addHeadingPage(target, node.textContent || "");
        return;
      }
      const embedGroup = readEmbedGroup(node);
      if (embedGroup !== null) {
        flush();
        addEmbedPage(target, embedGroup);
        return;
      }
      const images = Array.from(node.querySelectorAll("img"));
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      const mediaOnly = text === "" && (images.length === 1 || readVisibleEmbeds(node).length > 0);
      if (mediaOnly) {
        flush();
        for (const item of readMediaSequence(node)) {
          if (item.kind === "image") {
            addMediaPage(target, item.node.getAttribute("data-src") || item.node.getAttribute("src") || item.node.currentSrc || "", item.node.getAttribute("alt") || "");
            continue;
          }
          addEmbedPage(target, item.group);
        }
        return;
      }
      const className = typeof node.className === "string" ? node.className : "";
      const isCard = /(^|\s)(com-|hb-cpt__image|card)/.test(className);
      const isMixedLeaf = text !== "" && !isCard && readVisibleEmbeds(node).length > 0
        && node.querySelector("p, div, section, article, ul, ol, table, blockquote, pre, h1, h2, h3, h4, h5, h6") === null;
      if (["div", "section", "article"].includes(tag) && isMixedLeaf) {
        flush();
        addRichPage(target, node);
        return;
      }
      if (["div", "section", "article"].includes(tag) && !isCard && node.children.length > 0) {
        for (const child of Array.from(node.childNodes)) visit(child);
        return;
      }
      const isSimple = (tag === "p" || tag === "div" && node.children.length === 0)
        && node.querySelector(EMBED_SELECTOR) === null;
      if (isSimple && text !== "" && images.length === 0) {
        lines.push(text);
        return;
      }
      flush();
      if (text !== "" || images.length > 0) addRichPage(target, node);
    };
    const article = body.closest(READER_SOURCE_ROOT_SELECTOR);
    const scope = article?.parentElement || body.parentElement || body;
    const votes = Array.from(scope.querySelectorAll(READER_VOTE_SELECTOR))
      .filter((vote) => !body.contains(vote) && vote.parentElement?.closest(READER_VOTE_SELECTOR) === null);
    const before = votes.filter((vote) => (vote.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
    for (const vote of before) addRichPage(target, vote);
    for (const child of Array.from(body.childNodes)) visit(child);
    flush();
    for (const vote of votes) if (!before.includes(vote)) addRichPage(target, vote);
  };

  const readEmbedSourceSrcs = (node: Element): string => JSON.stringify(
    Array.from(node.querySelectorAll("source")).map((child) => child.getAttribute("src") || "")
  );

  const readEmbedStyleValue = (node: Element, name: "width" | "height" | "visibility" | "display"): string => node instanceof HTMLElement ? node.style[name] || "" : "";

  const readEmbedSignature = (root: unknown): string => {
    if (!(root instanceof Element)) return "";
    return Array.from(root.querySelectorAll(".iframe, iframe, video, audio, embed, object"))
      .map((node) => [
        node.tagName.toLowerCase(),
        node.classList.contains("iframe") ? "wrapper" : "",
        readEmbedStyleValue(node, "width"),
        readEmbedStyleValue(node, "height"),
        readEmbedStyleValue(node, "visibility"),
        readEmbedStyleValue(node, "display"),
        node.getAttribute("width") || "",
        node.getAttribute("height") || "",
        node.getAttribute("src") || "",
        node instanceof HTMLMediaElement ? node.currentSrc : "",
        node.getAttribute("poster") || "",
        node.getAttribute("srcdoc") || "",
        node.getAttribute("data") || "",
        readEmbedSourceSrcs(node),
        node.hasAttribute("hidden") ? "hidden" : "",
        isUnavailableEmbed(node) ? "hidden" : "visible",
      ].join("~"))
      .join("|");
  };

  const flushReaderRatio = () => {
    if (ratioSaveTimer !== 0) {
      window.clearTimeout(ratioSaveTimer);
      ratioSaveTimer = 0;
    }
    if (durableRatioTimer !== 0) {
      window.clearTimeout(durableRatioTimer);
      durableRatioTimer = 0;
    }
    if (pendingRatio === null) return;
    writeReaderRatio(pendingRatio.id, pendingRatio.ratio);
    persistReaderRatio(pendingRatio.id, pendingRatio.ratio);
    pendingRatio = null;
  };

  const scheduleReaderRatio = (id: string, ratio: number): void => {
    if (id === "") return;
    pendingRatio = { id: id, ratio: ratio };
    if (ratioSaveTimer === 0) {
      ratioSaveTimer = window.setTimeout(() => {
        ratioSaveTimer = 0;
        if (pendingRatio !== null) writeReaderRatio(pendingRatio.id, pendingRatio.ratio);
      }, 400);
    }
    // The durable copy is written on a slower cadence so scrolling never
    // serialises the whole position map on every progress tick.
    if (durableRatioTimer === 0) {
      durableRatioTimer = window.setTimeout(() => {
        durableRatioTimer = 0;
        if (pendingRatio !== null) persistReaderRatio(pendingRatio.id, pendingRatio.ratio);
      }, 2000);
    }
  };

  const updateProgress = () => {
    const scroll = progressScroll;
    if (scroll === null || !scroll.isConnected) return;
    const max = scroll.scrollHeight - scroll.clientHeight;
    const ratio = max <= 0 ? 1 : Math.min(1, Math.max(0, scroll.scrollTop / max));
    const percent = Math.round(ratio * 100);
    if (progressCurrent !== null && progressCurrent.textContent !== percent + "%") {
      progressCurrent.textContent = percent + "%";
    }
    if (progressFill !== null && lastProgressPercent !== percent) {
      progressFill.style.width = Math.max(2, ratio * 100) + "%";
      lastProgressPercent = percent;
    }
    if (!restoring) scheduleReaderRatio(articleId, ratio);
  };

  const setActive = (index: number): void => {
    activeIndex = Math.min(pageCount - 1, Math.max(0, index));
    updateProgress();
    writeReaderScroll(articleId, activeIndex);
  };

  const observePages = (scroll: HTMLElement): void => {
    observer?.disconnect();
    if (host === null) return;
    const pages = Array.from(host.querySelectorAll<HTMLElement>(".hbu-reader-page"));
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const index = entry.target instanceof HTMLElement ? pages.indexOf(entry.target) : -1;
        if (index !== -1) setActive(index);
      }
    }, { root: scroll, threshold: .55 });
    for (const page of pages) observer.observe(page);
  };

  const closeCurrentReader = () => {
    dismissedArticleId = articleId;
    teardown();
    showToast("已退出当前文章的沉浸阅读");
  };

  const syncReaderEndActions = () => {
    if (host === null) return;
    const status = navigation.readStatus();
    const prevButton = host.querySelector(".hbu-reader-end-actions [data-prev]");
    const nextButton = host.querySelector(".hbu-reader-end-actions [data-next]");
    const statusNode = host.querySelector(".hbu-reader-end-status");
    if (prevButton instanceof HTMLButtonElement) prevButton.disabled = status.prev === null;
    if (nextButton instanceof HTMLButtonElement) {
      nextButton.disabled = status.discovering;
      nextButton.innerHTML = status.discovering ? "正在寻找下一篇…" : "下一篇 " + READER_ICONS.next;
    }
    if (statusNode instanceof HTMLElement) {
      const text = status.discovering
        ? "正在从信息流寻找下一篇…"
        : status.error !== ""
          ? status.error + "，点击“下一篇”重试"
          : status.exhausted
            ? "已经读到本次信息流的末尾"
            : "";
      statusNode.textContent = text;
      statusNode.hidden = text === "";
    }
  };

  const lockReaderAdvance = () => {
    readerAdvanceLockToken += 1;
    readerAdvanceLocked = true;
    return readerAdvanceLockToken;
  };

  // A late router rejection from a finished attempt must not release a newer advance lock.
  const unlockReaderAdvance = (token = 0) => {
    if (token !== 0 && token !== readerAdvanceLockToken) return;
    readerAdvanceLocked = false;
  };

  const clearPendingReaderAdvance = () => {
    readerPendingAdvanceSourceId = "";
    readerPendingAdvanceRevision = -1;
  };

  const openReaderArticle = (id: string): void => {
    if (id === "") return;
    const token = lockReaderAdvance();
    void navigateToPath(LINK_HREF_PREFIX + id).then((accepted) => {
      if (accepted !== true) unlockReaderAdvance(token);
    }, () => {
      unlockReaderAdvance(token);
    });
  };

  const advanceFromReader = () => {
    if (host === null || readerAdvanceLocked) return;
    const status = navigation.readStatus();
    if (status.next !== null && status.next.source !== "related") {
      const taken = navigation.takeNext();
      if (taken !== null) {
        clearPendingReaderAdvance();
        openReaderArticle(taken.id);
        return;
      }
    }
    readerPendingAdvanceSourceId = status.currentId;
    readerPendingAdvanceRevision = status.revision;
    void navigation.discover();
  };

  const createHead = (data: ReaderData): HTMLDivElement => {
    const head = document.createElement("div");
    head.className = "hbu-reader-head";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "hbu-reader-round";
    back.setAttribute("aria-label", "返回");
    back.title = "返回";
    back.innerHTML = READER_ICONS.back;
    back.addEventListener("click", () => history.back());
    const home = document.createElement("button");
    home.type = "button";
    home.className = "hbu-reader-home";
    home.setAttribute("aria-label", "返回社区首页");
    home.title = "返回社区首页（H）";
    home.innerHTML = READER_ICONS.home + "<span>社区首页</span>";
    home.addEventListener("click", () => navigateToPath("/app/bbs/home"));
    const author = document.createElement("a");
    author.className = "hbu-reader-head-author";
    author.href = data.authorHref;
    author.title = data.author;
    if (data.avatar !== "") {
      const avatar = document.createElement("img");
      avatar.src = data.avatar;
      avatar.alt = "";
      author.append(avatar);
    }
    const name = document.createElement("span");
    name.textContent = data.author;
    author.append(name);
    const follow = document.createElement("button");
    follow.type = "button";
    follow.className = "hbu-reader-follow";
    follow.textContent = "关注";
    follow.addEventListener("click", toggleFollowAuthor);
    const spacer = document.createElement("span");
    spacer.className = "hbu-reader-head-spacer";
    const share = document.createElement("button");
    share.type = "button";
    share.className = "hbu-reader-round";
    share.setAttribute("aria-label", "分享");
    share.title = "分享";
    share.innerHTML = READER_ICONS.share;
    share.addEventListener("click", () => void shareArticle(data));
    const exit = document.createElement("button");
    exit.type = "button";
    exit.className = "hbu-reader-round";
    exit.setAttribute("aria-label", "关闭当前文章的沉浸阅读");
    exit.title = "关闭当前文章的沉浸阅读（R）";
    exit.innerHTML = READER_ICONS.close;
    exit.addEventListener("click", closeCurrentReader);
    head.append(back, home, author, follow, spacer, share, exit);
    return head;
  };

  const createRail = (data: ReaderData): HTMLElement => {
    const rail = document.createElement("aside");
    rail.className = "hbu-reader-rail";
    rail.setAttribute("aria-label", "文章互动");
    const avatar = document.createElement("a");
    avatar.className = "hbu-reader-action hbu-reader-rail-avatar-link";
    avatar.href = data.authorHref;
    avatar.title = "查看作者 " + data.author;
    avatar.setAttribute("aria-label", "查看作者 " + data.author);
    if (data.avatar !== "") {
      const img = document.createElement("img");
      img.src = data.avatar;
      img.alt = "";
      img.className = "hbu-reader-rail-avatar";
      avatar.append(img);
    }
    const like = document.createElement("button");
    like.type = "button";
    like.className = "hbu-reader-action";
    like.dataset["action"] = "like";
    like.setAttribute("aria-label", "点赞");
    like.title = "点赞";
    like.innerHTML = READER_ICONS.like;
    like.addEventListener("click", () => void toggleLike());
    const favour = document.createElement("button");
    favour.type = "button";
    favour.className = "hbu-reader-action";
    favour.dataset["action"] = "favour";
    favour.setAttribute("aria-label", "收藏");
    favour.setAttribute("aria-haspopup", "dialog");
    favour.setAttribute("aria-expanded", "false");
    favour.title = "收藏到收藏夹";
    favour.innerHTML = READER_ICONS.star;
    favour.addEventListener("click", () => openFavourMenu(rail, favour));
    const cy = document.createElement("button");
    cy.type = "button";
    cy.className = "hbu-reader-action hbu-reader-action--cy";
    cy.dataset["action"] = "cy";
    cy.setAttribute("aria-label", "CY 0");
    cy.title = "CY 0";
    cy.innerHTML = '<span class="hbu-reader-cy-label">CY</span><span class="hbu-reader-cy-count">0</span>';
    cy.addEventListener("click", openCyDialog);
    const comment = document.createElement("button");
    comment.type = "button";
    comment.className = "hbu-reader-action";
    comment.dataset["action"] = "comment";
    comment.setAttribute("aria-label", "查看评论");
    comment.title = "查看评论（C）";
    comment.addEventListener("click", () => void openComments());
    const share = document.createElement("button");
    share.type = "button";
    share.className = "hbu-reader-action";
    share.setAttribute("aria-label", "分享");
    share.title = "分享";
    share.innerHTML = READER_ICONS.share;
    share.addEventListener("click", () => void shareArticle(data));
    const spacing = document.createElement("button");
    spacing.type = "button";
    spacing.className = "hbu-reader-action";
    spacing.dataset["action"] = "spacing";
    spacing.setAttribute("aria-label", "阅读设置");
    spacing.setAttribute("aria-haspopup", "true");
    spacing.setAttribute("aria-expanded", "false");
    spacing.title = "阅读设置";
    spacing.innerHTML = SETTINGS_ICON;
    spacing.addEventListener("click", () => openSpacingMenu(rail, spacing));
    rail.append(avatar, like, favour, cy, comment, share, spacing);
    return rail;
  };

  const createHeroCover = (page: HTMLElement, data: ReaderData, sources: string[], kind: string): void => {
    const cover = document.createElement("div");
    cover.className = "hbu-reader-cover";
    // The photo and its pager live in separate rows, so the pager never paints
    // over the picture. The band stays blank except for the dots themselves.
    const stage = document.createElement("div");
    stage.className = "hbu-reader-cover-stage";
    const progress = document.createElement("div");
    progress.className = "hbu-reader-cover-progress";
    progress.hidden = true;
    const glow = document.createElement("div");
    glow.className = "hbu-reader-cover-glow";
    const capturedArticleId = articleId;
    const capturedGeneration = readerGeneration;
    const images: HTMLImageElement[] = [];
    const renderCoverPager = (): void => {
      const nav = stage.querySelectorAll<HTMLElement>(".hbu-reader-cover-nav");
      for (const node of nav) node.hidden = coverTotal < 2;
      progress.textContent = "";
      progress.hidden = coverTotal < 2;
      if (coverTotal < 2) return;
      const row = document.createElement("div");
      row.className = "hbu-reader-cover-dots";
      images.forEach((image, dotIndex) => {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.setAttribute("aria-label", "封面 " + (dotIndex + 1));
        dot.setAttribute("aria-current", String(dotIndex === coverIndex));
        dot.addEventListener("click", () => setCover(dotIndex));
        row.append(dot);
      });
      progress.append(row);
    };
    const dropFailedCover = (failed: HTMLImageElement): void => {
      // Error and zero-size load events can arrive before the cover is inserted.
      // Article identity and reader generation are sufficient stale-event guards.
      if (host === null || !host.isConnected) return;
      if (articleId !== capturedArticleId || readerGeneration !== capturedGeneration) return;
      const index = images.indexOf(failed);
      if (index === -1) return;
      images.splice(index, 1);
      failed.remove();
      // Removing an earlier slide shifts every later index, so the pointer must move
      // with the array before it is clamped to the new bounds.
      if (index < coverIndex) coverIndex -= 1;
      coverTotal = images.length;
      coverIndex = Math.min(Math.max(0, coverIndex), Math.max(0, coverTotal - 1));
      if (coverTotal === 0) {
        cover.remove();
        // A broken header image group falls back to the largest body image before
        // the hero drops its media area entirely.
        if (kind === "header" && data.heroImage !== "") {
          createHeroCover(page, data, [data.heroImage], "body");
          return;
        }
        page.dataset["cover"] = "none";
        coverIndex = 0;
        return;
      }
      page.dataset["cover"] = kind;
      renderCoverPager();
      setCover(coverIndex);
    };
    stage.append(glow);
    sources.forEach((source, index) => {
      const img = document.createElement("img");
      img.alt = index === 0 ? data.title : "封面 " + (index + 1);
      img.dataset["active"] = String(index === 0);
      if (index > 1) img.loading = "lazy";
      img.addEventListener("error", () => dropFailedCover(img), { once: true });
      img.addEventListener("load", () => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) return;
        dropFailedCover(img);
      }, { once: true });
      bindLightboxTrigger(img, () => readImageSource(img));
      stage.append(img);
      images.push(img);
      img.src = source;
    });
    page.dataset["cover"] = kind;
    coverTotal = images.length;
    coverIndex = 0;
    if (images.length > 0) glow.style.backgroundImage = 'url("' + sources[0].replace(/"/g, '\\"') + '")';
    if (images.length > 1) {
      const prev = document.createElement("button");
      prev.type = "button";
      prev.className = "hbu-reader-cover-nav";
      prev.dataset["side"] = "prev";
      prev.setAttribute("aria-label", "上一张封面");
      prev.innerHTML = READER_ICONS.previous;
      prev.addEventListener("click", () => setCover(coverIndex - 1));
      const next = document.createElement("button");
      next.type = "button";
      next.className = "hbu-reader-cover-nav";
      next.dataset["side"] = "next";
      next.setAttribute("aria-label", "下一张封面");
      next.innerHTML = READER_ICONS.next;
      next.addEventListener("click", () => setCover(coverIndex + 1));
      stage.append(prev, next);
    }
    renderCoverPager();
    cover.append(stage, progress);
    // Prepending keeps a late body-image fallback above the caption it already rendered after.
    page.prepend(cover);
  };

  const createHero = (data: ReaderData): HTMLElement => {
    const page = document.createElement("section");
    page.className = "hbu-reader-page";
    page.dataset["kind"] = "hero";
    const heroes = data.covers.length > 0
      ? data.covers
      : (data.heroImage !== "" ? [data.heroImage] : []);
    const kind = data.covers.length > 0 ? "header" : "body";
    if (heroes.length > 0) createHeroCover(page, data, heroes, kind);
    else page.dataset["cover"] = "none";
    const caption = document.createElement("div");
    caption.className = "hbu-reader-caption";
    if (data.tags.length > 0 || data.time !== "") {
      const kicker = document.createElement("div");
      kicker.className = "hbu-reader-kicker";
      for (const tag of data.tags.slice(0, 3)) {
        const chip = document.createElement("span");
        chip.textContent = tag;
        kicker.append(chip);
      }
      if (data.time !== "") {
        const chip = document.createElement("span");
        chip.textContent = data.time + (data.ip !== "" ? " · " + data.ip : "");
        kicker.append(chip);
      }
      caption.append(kicker);
    }
    const title = document.createElement("h1");
    title.className = "hbu-reader-title";
    title.textContent = data.title || "无标题";
    const byline = document.createElement("div");
    byline.className = "hbu-reader-byline";
    const author = document.createElement("b");
    author.textContent = data.author;
    const hint = document.createElement("span");
    hint.textContent = "向下滑动阅读";
    byline.append(author, hint);
    caption.append(title, byline);
    page.append(caption);
    return page;
  };

  const createEndPage = (data: ReaderData): HTMLElement => {
    const page = document.createElement("section");
    page.className = "hbu-reader-page";
    page.dataset["kind"] = "end";
    const card = document.createElement("div");
    card.className = "hbu-reader-end-card";
    const head = document.createElement("div");
    head.className = "hbu-reader-end-head";
    if (data.avatar !== "") {
      const avatar = document.createElement("img");
      avatar.src = data.avatar;
      avatar.alt = "";
      head.append(avatar);
    }
    const name = document.createElement("div");
    name.className = "hbu-reader-end-name";
    const label = document.createElement("b");
    label.textContent = data.author;
    const meta = document.createElement("span");
    meta.textContent = (data.level !== "" ? "Lv." + data.level : "") + (data.time !== "" ? (data.level !== "" ? " · " : "") + data.time : "");
    name.append(label, meta);
    const follow = document.createElement("button");
    follow.type = "button";
    follow.className = "hbu-reader-follow";
    follow.textContent = "关注";
    follow.addEventListener("click", toggleFollowAuthor);
    head.append(name, follow);
    const stats = document.createElement("div");
    stats.className = "hbu-reader-stats";
    for (const item of [
      { value: data.counts.like, label: "点赞" },
      { value: data.counts.favour, label: "收藏" },
      { value: data.counts.comment, label: "评论" },
    ]) {
      const box = document.createElement("div");
      box.dataset["stat"] = item.label === "点赞" ? "like" : item.label === "收藏" ? "favour" : "comment";
      const value = document.createElement("b");
      value.textContent = item.value;
      const text = document.createElement("span");
      text.textContent = item.label;
      box.append(value, text);
      stats.append(box);
    }
    card.append(head, stats);
    if (data.tags.length > 0) {
      const tags = document.createElement("div");
      tags.className = "hbu-reader-tags";
      for (const tag of data.tags) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "hbu-reader-tag";
        button.textContent = tag;
        bindTag(button, tag);
        tags.append(button);
      }
      card.append(tags);
    }
    page.append(card);
    const visitedPostIds = readVisitedPostIds(articleId);
    const visibleRelated = data.related.filter((item) => !visitedPostIds.has(item.id));
    if (visibleRelated.length > 0) {
      const related = document.createElement("div");
      related.className = "hbu-reader-related";
      const heading = document.createElement("h2");
      heading.textContent = "继续阅读";
      related.append(heading);
      for (const item of visibleRelated.slice(0, 4)) {
        const link = document.createElement("a");
        link.href = LINK_HREF_PREFIX + item.id;
        link.textContent = item.title || "帖子 " + item.id;
        related.append(link);
      }
      page.append(related);
    }
    const actions = document.createElement("div");
    actions.className = "hbu-reader-end-actions";
    const homeButton = document.createElement("button");
    homeButton.type = "button";
    homeButton.dataset["home"] = "";
    homeButton.innerHTML = READER_ICONS.home + " 社区首页";
    homeButton.addEventListener("click", () => navigateToPath("/app/bbs/home"));
    const prevButton = document.createElement("button");
    prevButton.type = "button";
    prevButton.dataset["prev"] = "";
    prevButton.innerHTML = READER_ICONS.previous + " 上一篇";
    prevButton.addEventListener("click", () => {
      const prev = navigation.readStatus().prev;
      if (prev !== null) navigateToPath(LINK_HREF_PREFIX + prev.id);
    });
    const nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.dataset["next"] = "";
    nextButton.innerHTML = "下一篇 " + READER_ICONS.next;
    nextButton.addEventListener("click", advanceFromReader);
    const topButton = document.createElement("button");
    topButton.type = "button";
    topButton.textContent = "回到封面";
    topButton.addEventListener("click", () => scrollToPage(0));
    actions.append(homeButton, prevButton, topButton, nextButton);
    page.append(actions);
    const status = document.createElement("p");
    status.className = "hbu-reader-end-status";
    status.hidden = true;
    page.append(status);
    return page;
  };

  const readSource = (): ReaderSource | null => {
    let pageRoot: Element;
    let article: Element;
    const cached = sourceCache;
    if (cached !== null && cached.articleId === articleId
      && cached.pageRoot.isConnected && cached.article.isConnected) {
      pageRoot = cached.pageRoot;
      article = cached.article;
    } else {
      const queriedRoot = document.querySelector("#page-bbs-link");
      const queriedArticle = queriedRoot?.querySelector(READER_SOURCE_ROOT_SELECTOR) || null;
      if (!(queriedRoot instanceof Element) || !(queriedArticle instanceof Element)) {
        sourceCache = null;
        return null;
      }
      pageRoot = queriedRoot;
      article = queriedArticle;
      sourceCache = { articleId: articleId, pageRoot: pageRoot, article: article };
    }
    // A video post can have no body or title node at all; those absences are valid
    // states, so only the page root and article root are required for a cached read.
    const body = article.querySelector(READER_SOURCE_BODY_SELECTOR) || null;
    const titleNode = article.querySelector(READER_SOURCE_TITLE_SELECTOR) || null;
    const covers = readHeaderImages(pageRoot);
    const bodyImages = readOrderedImageSources(body || article);
    // Only a dedicated video post owns the page media area. A video embedded in a
    // normal article stays an embed page, matching the native reading order.
    const isVideoPost = article.classList.contains("hb-bbs__video");
    const videoNodes = isVideoPost
      ? Array.from(article.querySelectorAll(READER_SOURCE_VIDEO_SELECTOR))
      : [];
    const videos = videoNodes.map((node) => ({
      node: node,
      source: readVideoSource(node),
      poster: readPosterSource(node),
    }));
    const videoMissing = isVideoPost && videos.every((item) => item.source === "");
    const tags = pageRoot.querySelectorAll(".link-tags__tag-item");
    const related = pageRoot.querySelectorAll(".bbs-link__related-recommend a[href*='/app/bbs/link/'], .related-recommend__container a[href*='/app/bbs/link/']");
    const stableTextLength = (node: Node): number => {
      if (node instanceof Element && (node.matches(READER_VOTE_SELECTOR)
        || /(^|\s)(com-|hb-cpt__image|card)/.test(node.className))) return 0;
      if (node.nodeType === Node.TEXT_NODE) return (node.textContent || "").length;
      return Array.from(node.childNodes).reduce((length, child) => length + stableTextLength(child), 0);
    };
    return {
      pageRoot,
      article,
      body,
      titleNode,
      covers,
      bodyImages,
      videos,
      videoMissing,
      isVideoPost,
      signature: [
        articleId,
        isVideoPost ? "video" : "post",
        titleNode?.textContent?.length || 0,
        body?.childNodes.length || 0,
        body === null ? 0 : stableTextLength(body),
        (article.parentElement || article).querySelectorAll(READER_VOTE_SELECTOR).length,
        covers.join(","),
        bodyImages.join(","),
        videos.map((item) => item.source + "~" + item.poster).join(","),
        tags.length,
        related.length,
        readEmbedSignature(pageRoot),
      ].join(":"),
    };
  };

  // Header covers win over body images. When a post has no header cover, its most
  // substantial body image makes a better hero than an empty gradient panel.
  const readHeroImage = (body: Element | null): string => {
    if (!(body instanceof Element)) return "";
    const candidates: { source: string; area: number; loaded: boolean; index: number }[] = [];
    for (const [index, node] of Array.from(body.querySelectorAll<HTMLImageElement>("img")).entries()) {
      if (node.closest(READER_MEDIA_EXCLUDE_SELECTOR) !== null) continue;
      const source = readImageSource(node);
      if (source === "") continue;
      const naturalWidth = node.naturalWidth;
      const naturalHeight = node.naturalHeight;
      const rect = node.getBoundingClientRect();
      const declaredWidth = Number(node.getAttribute("width")) || 0;
      const declaredHeight = Number(node.getAttribute("height")) || 0;
      const width = naturalWidth > 0 ? naturalWidth : (rect.width > 0 ? rect.width : declaredWidth);
      const height = naturalHeight > 0 ? naturalHeight : (rect.height > 0 ? rect.height : declaredHeight);
      if (width > 0 && width < 120) continue;
      candidates.push({ source: source, area: width * height, loaded: naturalWidth > 0, index: index });
    }
    if (candidates.length === 0) return "";
    candidates.sort((left, right) => Number(right.loaded) - Number(left.loaded) || right.area - left.area || left.index - right.index);
    const best = candidates[0];
    return best === undefined ? "" : best.source;
  };

  const readData = (source: ReaderSource | null): ReaderData | null => {
    if (source === null) return null;
    const { pageRoot, article, body, titleNode, covers, videos, videoMissing, isVideoPost } = source;
    const authorNode = pageRoot.querySelector(".link-user__username, .page-header__username");
    const authorLink = pageRoot.querySelector(".link-user__user-wrapper, .page-header__user-wrapper");
    const avatarNode = authorLink?.querySelector("img") || pageRoot.querySelector(".page-header__user-wrapper img");
    const tags = Array.from(pageRoot.querySelectorAll(".link-tags__tag-item"))
      .map((node) => (node.textContent || "").trim())
      .filter((value) => value !== "");
    const time = (pageRoot.querySelector(".link-data__time")?.textContent || "").trim();
    const ip = (pageRoot.querySelector(".link-data__ip")?.textContent || "").trim().replace(/^·/, "");
    const level = (pageRoot.querySelector(".link-user__level-tag")?.className.match(/hb-level-(\d+)/) || [])[1] || "";
    const related = Array.from(pageRoot.querySelectorAll(".bbs-link__related-recommend a[href*='/app/bbs/link/'], .related-recommend__container a[href*='/app/bbs/link/']"))
      .map((anchor) => {
        const match = /link\/(\d+)/.exec(anchor.getAttribute("href") || "");
        const id = match === null ? undefined : match[1];
        if (id === undefined) return null;
        return { id: id, title: (anchor.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80) };
      })
      .filter((item): item is RelatedPostLink => item !== null)
      .filter((item, index, list) => list.findIndex((other) => other.id === item.id) === index);
    const title = (titleNode?.textContent || "").trim();
    const meta = readPostMeta(pageRoot, title);
    if (meta === null) return null;
    return {
      article: article,
      body: body,
      title: title,
      author: (authorNode?.textContent || "").trim() || "作者",
      authorId: meta.authorId,
      authorHref: authorLink?.getAttribute("href") || "/app/user/profile/",
      avatar: avatarNode?.getAttribute("src") || "",
      topicIds: meta.topicIds,
      topics: meta.topics,
      meta: meta,
      covers: covers,
      // Keep a body fallback even when header images exist, so a header image that
      // fails to load can hand the hero over to the largest body image.
      heroImage: readHeroImage(body),
      videos: videos,
      videoMissing: videoMissing,
      isVideoPost: isVideoPost,
      tags: tags,
      time: time,
      ip: ip,
      level: level,
      related: related,
      counts: readCounts(),
      signature: source.signature,
    };
  };

  const refreshReaderSignature = () => {
    const refreshedSource = readSource();
    if (refreshedSource !== null) signature = refreshedSource.signature;
  };

  const openLinkedComments = () => {
    if (/comment/i.test(location.hash)) {
      requestAnimationFrame(() => openComments());
    }
  };

  const settleRatioRestore = (node: HTMLElement, ratio: number): void => {
    const apply = () => {
      node.scrollTop = (node.scrollHeight - node.clientHeight) * ratio;
    };
    apply();
    let cancelled = false;
    const stop = () => {
      cancelled = true;
      restoring = false;
    };
    for (const type of ["wheel", "touchstart", "pointerdown", "keydown"]) node.addEventListener(type, stop, { once: true, passive: true });
    const images = Array.from(node.querySelectorAll<HTMLImageElement>("img"));
    const settle = Promise.race([
      // decode() is missing in some embedded webviews; a rejected or absent
      // decode must not leave the restore flag stuck and block later restores.
      Promise.allSettled(images.map((image) => typeof image.decode === "function" ? image.decode() : Promise.resolve())),
      new Promise<void>((resolve) => window.setTimeout(resolve, 1200)),
    ]);
    settle.then(() => {
      if (cancelled) return;
      apply();
      restoring = false;
      updateProgress();
    });
  };

  const restoreReaderPosition = (ratio: number, restore: number): void => {
    if (ratio >= 0) {
      requestAnimationFrame(() => {
        const node = host?.querySelector<HTMLElement>(".hbu-reader-scroll");
        if (node === null || node === undefined) return;
        settleRatioRestore(node, ratio);
      });
      return;
    }
    if (restore <= 0) return;
    requestAnimationFrame(() => {
      const pages = host?.querySelectorAll<HTMLElement>(".hbu-reader-page");
      pages?.[restore]?.scrollIntoView({ block: "start", behavior: "auto" });
      setActive(restore);
    });
  };

  const render = (data: ReaderData): void => {
    if (host === null) return;
    restoreSuspendedEmbeds();
    for (const binding of interactionBindings) binding.dispose();
    interactionBindings.clear();
    readerGeneration += 1;
    observer?.disconnect();
    window.cancelAnimationFrame(scrollRaf);
    scrollRaf = 0;
    flushReaderRatio();
    resetReaderComments();
    clearPendingReader();
    host.textContent = "";
    progressScroll = null;
    progressCurrent = null;
    progressFill = null;
    lastProgressPercent = -1;
    linkStateController?.abort();
    linkStateController = null;
    commentLoadController?.abort();
    commentLoadController = null;
    resetFavourPanel();
    linkState = null;
    linkStatePromise = null;
    cyPublishedCount = 0;
    articleCommentPublishedCount = 0;
    actionBusy = false;
    cyBusy = false;
    articleCommentBusy = false;
    clearArticleComposers();
    cyDialog = null;
    cyTextarea = null;
    cySubmit = null;
    cyStatus = null;
    spacingPanel = null;
    spacingButton = null;
    spacingInput = null;
    historyPanel = null;
    historyButton = null;
    historyList = null;
    historyMeta = null;
    historyRail = null;
    historyThumb = null;
    historyPeek = null;
    historyScrim = null;
    historyPreviewX = 0;
    coverIndex = 0;
    coverTotal = 0;
    activeIndex = 0;
    host.append(createHead(data));
    const scroll = document.createElement("div");
    scroll.className = "hbu-reader-scroll";
    scroll.tabIndex = 0;
    scroll.setAttribute("aria-label", "文章内容");
    bindSwipe(scroll);
    scroll.append(createHero(data));
    const pages = document.createDocumentFragment();
    addVideoPostPages(pages, data);
    if (data.body instanceof Element) buildPages(pages, data.body);
    refreshReaderSignature();
    scroll.append(pages);
    scroll.append(createEndPage(data));
    const rail = createRail(data);
    host.append(scroll, rail);
    syncHistoryTimeline();
    const progress = document.createElement("div");
    progress.className = "hbu-reader-progress";
    const current = document.createElement("span");
    current.dataset["current"] = "";
    current.textContent = "1";
    const bar = document.createElement("span");
    bar.className = "hbu-reader-progress-bar";
    const fill = document.createElement("i");
    bar.append(fill);
    const total = document.createElement("span");
    total.dataset["total"] = "";
    total.textContent = "";
    const hint = document.createElement("span");
    hint.className = "hbu-reader-hint";
    hint.textContent = "滚轮 / ↑↓ 滚动";
    progress.append(current, bar, total, hint);
    const toast = document.createElement("div");
    toast.className = "hbu-reader-toast";
    toast.setAttribute("aria-live", "polite");
    host.append(progress, toast);
    progressScroll = scroll;
    progressCurrent = current;
    progressFill = fill;
    pageCount = host.querySelectorAll(".hbu-reader-page").length;
    observePages(scroll);
    scroll.addEventListener("scroll", () => {
      if (scrollRaf !== 0) return;
      scrollRaf = window.requestAnimationFrame(() => {
        scrollRaf = 0;
        updateProgress();
      });
    }, { passive: true });
    syncActionStates();
    lastActionSyncAt = performance.now();
    void loadLinkState();
    const ratio = readReaderRatio(articleId);
    const restore = ratio < 0 ? Math.min(pageCount - 1, readReaderScroll(articleId)) : 0;
    restoring = ratio >= 0;
    updateProgress();
    if (ratio >= 0) writeReaderRatio(articleId, ratio);
    openLinkedComments();
    restoreReaderPosition(ratio, restore);
    navigation.sync(articleId, { ...data.meta, id: articleId }, data.related);
    syncReaderEndActions();
  };

  const clearPendingTimer = () => {
    if (readerPendingTimer !== 0) {
      window.clearTimeout(readerPendingTimer);
      readerPendingTimer = 0;
    }
  };

  const clearPendingReader = () => {
    clearPendingTimer();
    readerPendingCard?.remove();
    readerPendingCard = null;
    readerPendingArticleId = "";
    readerPendingGeneration = -1;
  };

  // A rejected router transition or a captcha-gated API can leave the article page empty.
  // The pending card stays passive for a few seconds, then offers retry and a native exit.
  const showPending = (): void => {
    ensureShell();
    if (host === null) return;
    // A pending card replaces the rendered reader, so the previous signature
    // must not short-circuit the next successful sync.
    signature = "";
    if (readerPendingCard !== null) {
      if (readerPendingArticleId === articleId && readerPendingGeneration === readerGeneration) return;
      clearPendingReader();
    }
    for (const binding of interactionBindings) binding.dispose();
    interactionBindings.clear();
    host.textContent = "";
    const pending = document.createElement("div");
    pending.className = "hbu-reader-pending";
    const card = document.createElement("div");
    card.className = "hbu-reader-pending-card";
    const message = document.createElement("p");
    message.className = "hbu-reader-pending-text";
    message.textContent = "正在加载文章…";
    const actions = document.createElement("div");
    actions.className = "hbu-reader-pending-actions";
    actions.hidden = true;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.dataset["retry"] = "";
    retry.textContent = "重试";
    const original = document.createElement("button");
    original.type = "button";
    original.dataset["original"] = "";
    original.textContent = "查看原帖";
    actions.append(retry, original);
    card.append(message, actions);
    pending.append(card);
    host.append(pending);
    readerPendingCard = pending;
    readerPendingArticleId = articleId;
    readerPendingGeneration = readerGeneration;
    const capturedArticleId = articleId;
    const capturedGeneration = readerGeneration;
    retry.addEventListener("click", () => {
      if (host === null || !host.isConnected) return;
      if (articleId !== capturedArticleId || readerGeneration !== capturedGeneration) return;
      clearPendingReader();
      sourceCache = null;
      signature = "";
      sync();
    });
    original.addEventListener("click", () => {
      if (host === null || !host.isConnected) return;
      if (articleId !== capturedArticleId || readerGeneration !== capturedGeneration) return;
      clearPendingReader();
      dismissedArticleId = capturedArticleId;
      teardown();
      showToast("已退出沉浸阅读，可在设置中重新开启");
    });
    readerPendingTimer = window.setTimeout(() => {
      readerPendingTimer = 0;
      if (host === null || !host.isConnected) return;
      if (articleId !== capturedArticleId || readerGeneration !== capturedGeneration) return;
      if (!pending.isConnected) return;
      message.textContent = "这篇帖子加载得有点慢，可能是网络中断或站点校验未通过。";
      actions.hidden = false;
    }, READER_PENDING_NOTICE_MS);
  };

  const teardown = () => {
    restoreSuspendedEmbeds();
    for (const binding of interactionBindings) binding.dispose();
    interactionBindings.clear();
    readerGeneration += 1;
    clearPendingReader();
    clearPendingReaderAdvance();
    readerAdvanceLocked = false;
    readerAdvanceLockToken += 1;
    observer?.disconnect();
    observer = null;
    flushReaderRatio();
    restoring = false;
    progressScroll = null;
    progressCurrent = null;
    progressFill = null;
    lastProgressPercent = -1;
    sourceCache = null;
    nativeActionArticle = null;
    nativeActionBox = null;
    nativeFavourButton = null;
    linkStateController?.abort();
    linkStateController = null;
    commentLoadController?.abort();
    commentLoadController = null;
    resetFavourPanel();
    linkState = null;
    linkStatePromise = null;
    cyPublishedCount = 0;
    articleCommentPublishedCount = 0;
    actionBusy = false;
    cyBusy = false;
    cyDialog = null;
    cyTextarea = null;
    cySubmit = null;
    cyStatus = null;
    articleCommentBusy = false;
    clearArticleComposers();
    articleComposerSelectionCleanup?.();
    document.body.classList.remove(READER_CLASS);
    if (host !== null) host.inert = false;
    commentPanel?.remove();
    commentPanel = null;
    commentPanelList = null;
    commentPanelStatus = null;
    commentPanelStatusText = null;
    commentPanelRetry = null;
    commentPanelMeta = null;
    commentPanelMore = null;
    commentPanelClose = null;
    commentPanelRefresh = null;
    commentState = createCommentState();
    spacingPanel = null;
    spacingButton = null;
    spacingInput = null;
    historyPanel = null;
    historyButton = null;
    historyList = null;
    historyRail = null;
    historyThumb = null;
    historyPeek = null;
    historyScrim = null;
    historyPreviewX = 0;
    host?.remove();
    host = null;
    closeLightbox();
    signature = "";
    pageCount = 0;
    activeIndex = 0;
  };

  const ensureShell = () => {
    ensureReaderStyle();
    if (!document.body.classList.contains(READER_CLASS)) document.body.classList.add(READER_CLASS);
    if (host === null) {
      host = document.createElement("div");
      host.id = READER_ID;
      host.setAttribute("role", "region");
      host.setAttribute("aria-label", "沉浸阅读");
      document.body.append(host);
    }
  };

  const sync = () => {
    const match = /^\/app\/bbs\/link\/(\d+)/.exec(location.pathname);
    if (match === null) {
      dismissedArticleId = "";
      if (host !== null || document.body.classList.contains(READER_CLASS)) teardown();
      signature = "";
      return;
    }
    if (!readReaderPreference()) {
      if (host !== null || document.body.classList.contains(READER_CLASS)) teardown();
      signature = "";
      return;
    }
    const nextArticleId = match[1];
    if (dismissedArticleId === nextArticleId) {
      if (host !== null || document.body.classList.contains(READER_CLASS)) teardown();
      signature = "";
      return;
    }
    if (articleId !== nextArticleId) {
      dismissedArticleId = "";
      unlockReaderAdvance();
      flushReaderRatio();
      sourceCache = null;
      nativeActionArticle = null;
      nativeActionBox = null;
      nativeFavourButton = null;
    }
    articleId = nextArticleId;
    const source = readSource();
    if (source === null) {
      showPending();
      return;
    }
    ensureShell();
    if (signature === source.signature) {
      for (const binding of interactionBindings) binding.refresh();
      const now = performance.now();
      if (now - lastActionSyncAt >= 1000) {
        lastActionSyncAt = now;
        syncActionStates();
      }
      return;
    }
    signature = source.signature;
    const data = readData(source);
    if (data === null) return;
    render(data);
  };

  navigation.subscribe((status) => {
    if (host === null) {
      clearPendingReaderAdvance();
      return;
    }
    syncReaderEndActions();
    if (historyPanel !== null) renderHistoryPanel();
    if (readerPendingAdvanceSourceId === "") return;
    if (status.currentId !== readerPendingAdvanceSourceId || status.revision !== readerPendingAdvanceRevision) {
      clearPendingReaderAdvance();
      return;
    }
    if (status.discovering) return;
    const taken = navigation.takeNext();
    clearPendingReaderAdvance();
    if (taken !== null) {
      openReaderArticle(taken.id);
    }
  });

  document.addEventListener(READER_EVENT, (event) => {
    const detail = event instanceof CustomEvent ? event.detail : undefined;
    if (readerToggle !== null) readerToggle.setAttribute("aria-checked", String(detail === true));
    if (detail !== true) {
      teardown();
      showToast("已退出沉浸阅读，可在设置中重新开启");
      return;
    }
    dismissedArticleId = "";
    signature = "";
    sync();
  });

  document.addEventListener(READER_TIMELINE_EVENT, () => {
    syncHistoryTimeline();
  });

  document.addEventListener(READER_HISTORY_LIMIT_EVENT, (event) => {
    const detail = event instanceof CustomEvent ? event.detail : undefined;
    const limit = typeof detail === "number" && Number.isSafeInteger(detail) && detail >= 0 ? detail : readReaderHistoryLimit();
    applyPostHistoryLimit(limit);
    if (historyPanel !== null) renderHistoryPanel();
    if (host !== null) syncReaderEndActions();
  });

  document.addEventListener("keydown", (event) => {
    if (host === null || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Escape") {
      // The lightbox sits above every reader surface, so it owns Escape first.
      if (lightbox !== null) {
        event.preventDefault();
        closeLightbox();
      } else if (cyDialog !== null) {
        event.preventDefault();
        closeCyDialog();
      } else if (spacingPanel !== null && !spacingPanel.hidden) {
        event.preventDefault();
        closeSpacingMenu();
        spacingButton?.focus({ preventScroll: true });
      } else if (isHistoryDrawerOpen()) {
        event.preventDefault();
        closeHistoryDrawer(true);
      } else if (favourPanel !== null && !favourPanel.hidden) {
        event.preventDefault();
        closeFavourMenu(true);
      } else if (isCommentPanelOpen() && articleReplyTarget !== null) {
        event.preventDefault();
        clearArticleReplyTarget(true);
      } else if (isCommentPanelOpen()) {
        event.preventDefault();
        closeComments();
      } else if (isSiteAlertOpen()) {
        // The site confirmation dialog sits above the reader, so let it own this Escape.
        return;
      } else {
        event.preventDefault();
        closeCurrentReader();
      }
      return;
    }
    if (lightbox !== null) {
      if (!lightbox.isConnected) {
        // A wiped body can leave this closure holding a detached overlay;
        // forget it so a stale dialog never swallows reader keys.
        closeLightbox();
        return;
      }
      // The modal picture owns the keyboard: zoom keys work from anywhere in
      // the dialog, Tab cycles its own controls, and reader shortcuts cannot
      // navigate behind the overlay.
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        stepLightboxZoom(1);
        return;
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        stepLightboxZoom(-1);
        return;
      }
      if (event.key === "0") {
        event.preventDefault();
        resetLightboxZoom();
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        cycleLightboxFocus(event.shiftKey);
        return;
      }
      return;
    }
    if (isSiteAlertOpen() || eventHitsTypingTarget(event)) return;
    // The comment dialog owns its keyboard surface. Let Space activate its buttons
    // and let arrows or PageUp/PageDown scroll the comment list instead of the reader.
    if (isCommentPanelOpen() && commentPanel !== null && commentPanel.contains(event.target instanceof Node ? event.target : null)) return;
    if (event.key === "[") {
      event.preventDefault();
      const prev = navigation.readStatus().prev;
      if (prev !== null) navigateToPath(LINK_HREF_PREFIX + prev.id);
      return;
    }
    if (event.key === "]") {
      event.preventDefault();
      advanceFromReader();
      return;
    }
    // A timeline owns the navigation keys: arrows walk its rows and must not
    // scroll the post behind the panel. Check the DOM rather than this closure
    // so a listener left over from an earlier mount also stays out of the way.
    if (event.target instanceof Element && event.target.closest(".hbu-reader-history-menu") !== null) return;
    if (event.key === "h" || event.key === "H") {
      event.preventDefault();
      navigateToPath("/app/bbs/home");
      return;
    }
    if (event.key === "ArrowRight" && coverInView() && coverTotal > 1) {
      event.preventDefault();
      setCover(coverIndex + 1);
      return;
    }
    if (event.key === "ArrowLeft" && coverInView() && coverTotal > 1) {
      event.preventDefault();
      setCover(coverIndex - 1);
      return;
    }
    if (["ArrowDown", "PageDown", "j", "J", " "].includes(event.key)) {
      event.preventDefault();
      scrollViewport(1);
    } else if (["ArrowUp", "PageUp", "k", "K"].includes(event.key)) {
      event.preventDefault();
      scrollViewport(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      scrollToPage(0);
    } else if (event.key === "End") {
      event.preventDefault();
      scrollToPage(pageCount - 1);
    } else if (event.key === "c" || event.key === "C") {
      event.preventDefault();
      if (isCommentPanelOpen()) closeComments();
      else openComments();
    } else if (event.key === "r" || event.key === "R") {
      event.preventDefault();
      closeCurrentReader();
    }
  });

  registerPageSync(sync, 200, [PAGE_ROUTE.ARTICLE], "article");
  window.addEventListener("popstate", () => { signature = ""; sync(); });
  window.addEventListener("pagehide", flushReaderRatio);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushReaderRatio();
  });
  sync();
}
