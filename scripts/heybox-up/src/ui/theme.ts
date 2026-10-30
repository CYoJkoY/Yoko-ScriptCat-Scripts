import { FEED_WIDTH_MAX, FEED_WIDTH_MIN, FEED_WIDTH_STEP, PAGE_ROUTE, READER_LINE_HEIGHT_MAX, READER_LINE_HEIGHT_MIN, READER_LINE_HEIGHT_STEP } from "../config";
import { ensureStyleElement, registerPageSync } from "../core/page-sync";
import { localStore, parseFeedWidthInput, parseReaderLineHeightInput, readCommentPreviewPreference, readFeedWidth, readNavMotionPreference, readReaderLineHeight, readReaderPreference, setCommentPreviewPreference, setFeedWidthPreference, setNavMotionPreference, setReaderLineHeightPreference, setReaderPreference } from "../state";

export const THEME_CLASS = "heybox-up-theme";

export const THEME_ATTR = "data-heybox-up-theme";

export const THEME_STORAGE_KEY = "heybox-up.theme.v1";

export const THEME_ENTRY_ID = "heybox-up-theme-entry";

export const THEME_MEDIA = window.matchMedia("(prefers-color-scheme: dark)");

export interface ThemePreset {
  id: string;
  label: string;
  hint: string;
  dark: boolean | null;
  icon: string;
  swatch: string[];
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: "system", label: "跟随系统", hint: "随系统深浅切换", dark: null, icon: "system", swatch: ["#f5f7f9", "#1b2430"] },
  { id: "dark", label: "夜航", hint: "冷灰深色，细边框", dark: true, icon: "dark", swatch: ["#0f1419", "#8fb0cf"] },
  { id: "oled", label: "纯黑", hint: "纯黑底，低圆角", dark: true, icon: "oled", swatch: ["#000000", "#a8c0d8"] },
  { id: "light", label: "浅色", hint: "站点原色", dark: false, icon: "light", swatch: ["#ffffff", "#eef1f4"] },
  { id: "paper", label: "纸页", hint: "暖纸底，衬线标题", dark: false, icon: "paper", swatch: ["#f4efe4", "#8a6f4e"] },
  { id: "mist", label: "雾青", hint: "冷雾底，大圆角", dark: false, icon: "mist", swatch: ["#eef3f5", "#4f7f8a"] },
];

export const THEME_IDS = THEME_PRESETS.map((preset) => preset.id);

export function getThemePreset(id: string): ThemePreset {
  const found = THEME_PRESETS.find((preset) => preset.id === id);
  if (found !== undefined) return found;
  // THEME_PRESETS is a non-empty literal above, so index 0 always exists.
  const fallback = THEME_PRESETS[0];
  if (fallback === undefined) throw new Error("THEME_PRESETS is empty");
  return fallback;
}

export function normalizeThemeMode(value: unknown): string {
  return typeof value === "string" && THEME_IDS.includes(value) ? value : "system";
}

export function resolveTheme(mode: string, systemDark: boolean): string {
  return mode === "system" ? (systemDark ? "dark" : "light") : getThemePreset(mode).id;
}

export let currentThemeMode: string = "system";

export interface ThemeEntry {
  host: HTMLSpanElement;
  button: HTMLButtonElement;
  menu: HTMLDivElement;
  items: Array<{ id: string; node: HTMLButtonElement }>;
  settingsButton: HTMLButtonElement;
  settingsMenu: HTMLDivElement;
}

export let themeEntry: ThemeEntry | null = null;

export let previewToggle: HTMLButtonElement | null = null;

export let navMotionToggle: HTMLButtonElement | null = null;

export let readerToggle: HTMLButtonElement | null = null;

export let feedWidthChips: Element[] = [];

export let feedWidthInput: HTMLInputElement | null = null;

export let readerLineHeightInput: HTMLInputElement | null = null;

export function readThemeMode(): string {
  return normalizeThemeMode(localStore.read(THEME_STORAGE_KEY));
}

export function writeThemeMode(mode: string): void {
  localStore.write(THEME_STORAGE_KEY, mode);
}

export const THEME_CSS = `
  :root.heybox-up-theme {
    --heybox-up-bg: #fff;
    --heybox-up-surface: #fff;
    --heybox-up-subtle: rgba(20, 25, 30, .06);
    --heybox-up-raised: #d7dce3;
    --heybox-up-border: rgba(20, 25, 30, .1);
    --heybox-up-text: #14191e;
    --heybox-up-text-2: #3c4249;
    --heybox-up-muted: #6b7280;
    --heybox-up-on-accent: #fff;
    --heybox-up-icon: #62676e;
    --heybox-up-icon-hover: #14191e;
    --heybox-up-icon-hover-bg: rgba(20, 25, 30, .06);
    --heybox-up-accent: #6f8db3;
    --hbu-menu-bg: #fff;
    --hbu-menu-text: #14191e;
    --hbu-menu-muted: #6b7280;
    --hbu-menu-border: rgba(20, 25, 30, .12);
    --hbu-menu-hover: rgba(20, 25, 30, .06);
    color-scheme: light;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) {
    background-color: var(--heybox-up-bg) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] {
    color-scheme: dark;
    --heybox-up-bg: #0f1419;
    --heybox-up-surface: #171d24;
    --heybox-up-subtle: #1e2630;
    --heybox-up-raised: #26303b;
    --heybox-up-border: #2d3845;
    --heybox-up-text: #dce5ef;
    --heybox-up-text-2: #b4c0ce;
    --heybox-up-muted: #8593a3;
    --heybox-up-accent: #8fb0cf;
    --heybox-up-on-accent: #10161c;
    --heybox-up-icon: #b4c0ce;
    --heybox-up-icon-hover: #dce5ef;
    --heybox-up-icon-hover-bg: rgba(220, 229, 239, .09);
    --hbu-menu-bg: #171d24;
    --hbu-menu-text: #dce5ef;
    --hbu-menu-muted: #8593a3;
    --hbu-menu-border: #2d3845;
    --hbu-menu-hover: rgba(220, 229, 239, .09);
    --hbu-success: #7fc3a2;
    --hbu-danger: #e0858d;
    --hbu-warning: #d8b77a;
    --hb-general-color-bg-0: #0f1419;
    --hb-general-color-bg-1: #171d24;
    --hb-general-color-bg-2: #1e2630;
    --hb-general-color-bg-3: #1e2630;
    --hb-general-color-bg-4: #171d24;
    --hb-general-color-bg-5: rgba(23, 29, 36, .9);
    --hb-general-color-bg-6: rgba(220, 229, 239, .1);
    --hb-general-color-text-1: #dce5ef;
    --hb-general-color-text-2: #b4c0ce;
    --hb-general-color-text-3: #8593a3;
    --hb-general-color-text-4: #6d7a88;
    --hb-general-color-text-5: #9dc0e2;
    --hb-general-color-text-6: #10161c;
    --hb-general-color-stroke-0: #2d3845;
    --hb-general-color-stroke-1: #2d3845;
    --hb-general-color-stroke-2: #26303b;
    --hb-general-color-stroke-3: #1e2630;
    --hb-general-color-primary: #8fb0cf;
    --hb-general-color-success: #7fc3a2;
    --hb-general-color-danger: #e0858d;
    --hb-primary: #dce5ef;
    --hb-primary--value: 220, 229, 239;
    --hb-primary-dynamic: #dce5ef;
    --hb-primary-dynamic--value: 220, 229, 239;
    --hb-neutral-100: #1e2630;
    --hb-neutral-100--value: 30, 38, 48;
    --hb-neutral-200: #1e2630;
    --hb-neutral-200--value: 30, 38, 48;
    --hb-neutral-300: #171d24;
    --hb-neutral-300--value: 23, 29, 36;
    --hb-neutral-400: #26303b;
    --hb-neutral-400--value: 38, 48, 59;
    --hb-neutral-500: #2d3845;
    --hb-neutral-500--value: 45, 56, 69;
    --hb-neutral-600: #6d7a88;
    --hb-neutral-600--value: 109, 122, 136;
    --hb-neutral-700: #8593a3;
    --hb-neutral-700--value: 133, 147, 163;
    --hb-neutral-800: #b4c0ce;
    --hb-neutral-800--value: 180, 192, 206;
    --el-color-primary: #8fb0cf;
    --el-color-primary-light-9: #1b2735;
    --el-color-success: #7fc3a2;
    --el-color-danger: #e0858d;
    --el-color-warning: #d8b77a;
    --el-bg-color: #171d24;
    --el-bg-color-page: #0f1419;
    --el-bg-color-overlay: #171d24;
    --el-fill-color-blank: #171d24;
    --el-fill-color: #1e2630;
    --el-fill-color-light: #1e2630;
    --el-fill-color-lighter: #1e2630;
    --el-fill-color-extra-light: #1e2630;
    --el-text-color-primary: #dce5ef;
    --el-text-color-regular: #b4c0ce;
    --el-text-color-secondary: #8593a3;
    --el-text-color-placeholder: #8593a3;
    --el-text-color-disabled: #6d7a88;
    --el-border-color: #2d3845;
    --el-border-color-light: #2d3845;
    --el-border-color-lighter: #2d3845;
    --el-border-color-extra-light: #26303b;
    --el-border-color-dark: #3b4653;
    --el-border-color-darker: #46515f;
    --el-disabled-bg-color: #1e2630;
    --el-disabled-text-color: #8593a3;
    --el-mask-color: rgba(15, 20, 25, .8);
    --el-overlay-color-lighter: rgba(0, 0, 0, .6);
    --el-table-bg-color: #171d24;
    --el-table-tr-bg-color: #171d24;
    --el-table-header-bg-color: #1e2630;
    --el-table-row-hover-bg-color: #1e2630;
    --el-table-border-color: #2d3845;
    --el-table-text-color: #dce5ef;
    --el-table-header-text-color: #b4c0ce;
    --el-box-shadow: 0 12px 32px rgba(0, 0, 0, .3);
    --el-box-shadow-light: 0 0 12px rgba(0, 0, 0, .28);
    --el-box-shadow-lighter: 0 0 6px rgba(0, 0, 0, .24);
    scrollbar-color: #3b4653 #0f1419;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] body {
    background-color: var(--heybox-up-bg) !important;
    color: var(--heybox-up-text);
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#app, .hb-website__app, .hb-page__app, .hb-layout__main, .hb-layout-main__container, .hb-layout__content) {
    background-color: var(--heybox-up-bg) !important;
    color: var(--heybox-up-text);
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.nav, .nav-user .nav-user-popover, .el-popper, .el-dropdown-menu, .el-dialog, .el-drawer, .el-message-box, .el-card, .el-table, .el-pagination, .el-select-dropdown, .el-autocomplete-suggestion, .hb-cpt__selector .selector__pull-list, .page-header__container-bg, .page-header__back-btn, .tab-list--wrapper, .link-tab-list, .hb-cpt-page-header, .hb-cpt__pagination, .hb-cpt__slide-tab, .user-profile-wrapper, .bbs-info, .message-center__main, .message-center__aside-title, .message-center__search-box, .message-home__tabs, .message-content-preview, .message-content-preview__post, .search-result__tab-header, .search-result__tool, .hb-search-result, .hot-search, .price-box, .result-mini-app__item, .result-filter-tag__tag, .hb-bbs-link__header, .hb-bbs-link__content, .link-comment, .link-reply, .comment__comment-header, .topic-link__header, .post__container, .image-text__container, .header-image__item, .bbs-link__related-recommend, .hb-cpt__empty, .qr-section, .app-link-item) {
    background-color: var(--heybox-up-surface) !important;
    border-color: var(--heybox-up-border) !important;
    color: var(--heybox-up-text);
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#page-bbs-community, #page-bbs-link, #page-bbs-list, .page-bbs-community, .page-bbs-link) {
    background-color: var(--heybox-up-bg) !important;
    color: var(--heybox-up-text);
  }
  /* Search page: page and list paint fixed white bands above and below the results. */
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-bbs-list::before,
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-bbs-list::after {
    background-color: var(--heybox-up-bg) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-bbs-list .list::before,
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-bbs-list .list::after {
    background-color: var(--heybox-up-bg) !important;
  }
  /* Result rows are separated by inline 4px light strips. */
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-bbs-list .search-result__space {
    background-color: transparent !important;
  }
  /* The User tab paints a fixed light notice bar above the result list. */
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-bbs-list .search-result__middle.user {
    background-color: var(--heybox-up-surface) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-bbs-list .search-result__middle.user::after {
    color: var(--heybox-up-muted) !important;
  }
  /* Horizontal result scroller fades to hard-coded white on the right edge. */
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-bbs-list .hb-cpt__pagination--right {
    background-image: linear-gradient(to left, var(--heybox-up-surface), var(--heybox-up-surface), transparent) !important;
  }
  /* 我的文章（创作者中心）：站点整页写死 #fff，深色下逐块补齐，避免只剩外框变黑。 */
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#page-creator-content-management, #page-creator-content-management-detail) {
    background-color: var(--heybox-up-bg) !important;
    color: var(--heybox-up-text);
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#page-creator-content-management .creator-content-management__header, #page-creator-content-management .creator-content-management__tabs, #page-creator-content-management-detail .content-detail__content-wrapper, #page-creator-content-management-detail .content-detail__section, .com-chart, #creator-preview__frame, .creator-preview-normal, .creator-draft) {
    background-color: var(--heybox-up-surface) !important;
    border-color: var(--heybox-up-border) !important;
    color: var(--heybox-up-text);
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#page-creator-content-management .creator-content-management__tabs::after, #page-creator-content-management .content-management-home__content + .content-management-home__content::after) {
    background-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#page-creator-content-management .content-management-home__content:hover, #page-creator-content-management .creator-content-management__tabs .sorter:hover, .creator-content-item__operation-item:hover) {
    background-color: var(--heybox-up-subtle) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .creator__data-indicator {
    background-color: var(--heybox-up-subtle) !important;
    box-shadow: 0 0 0 .5px var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .creator__data-indicator.active {
    background-color: var(--heybox-up-surface) !important;
    box-shadow: inset 0 0 0 1px var(--heybox-up-accent) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#page-creator-content-management .creator-content-management__header, #page-creator-content-management-detail .content-detail__title, #page-creator-content-management-detail .content-detail__section-header, .data-indicator__data, .com-chart .nav, .com-chart .selection .text, .aside-miniprogram__header, .aside-miniprogram__item--name) {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.data-indicator__title, #page-creator-content-management .creator-content-management__tabs .sorter, #page-topic-link .topic-link__sorter) {
    color: var(--heybox-up-text-2) !important;
  }
  /* 频道页：整页浅灰底 + 三块白卡，连同上下固定色条一起换底。 */
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-topic-link {
    background-color: var(--heybox-up-bg) !important;
    color: var(--heybox-up-text);
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-topic-link::before,
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-topic-link::after {
    background-color: var(--heybox-up-bg) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#page-topic-link .topic-link__panel, #page-topic-link .topic-link__header, #page-topic-link .topic-link__filter-row, #page-topic-link .topic-link__game-detail, .topic-aside__topic-indicator, .topic__aside-miniprogram) {
    background-color: var(--heybox-up-surface) !important;
    border-color: var(--heybox-up-border) !important;
    color: var(--heybox-up-text);
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-topic-link .topic-link__main::after {
    background-color: var(--heybox-up-surface) !important;
    border-color: var(--heybox-up-border) !important;
    color: var(--heybox-up-text);
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .topic__aside-miniprogram .aside-miniprogram__item,
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-topic-link .topic-link__splitline::after {
    background-color: var(--heybox-up-subtle) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .topic__aside-miniprogram .aside-miniprogram__item:hover {
    background-color: var(--heybox-up-surface) !important;
  }
  /* 兜底扫描挂上的类：只改底色、描边与文字色，不动布局。 */
  :root.heybox-up-theme[data-heybox-up-dark="true"] .heybox-up-dark-flat {
    background-color: var(--heybox-up-surface) !important;
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .heybox-up-dark-flat-subtle {
    background-color: var(--heybox-up-subtle) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .heybox-up-dark-edge {
    border-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .heybox-up-dark-ink {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.hb-bbs-home, .bbs-home__content-list, .bbs-home__content-item, .bbs-home__topic-item, .bbs-community-hot-topic, .bbs-community__search-module, .right-side-default, .hb-cpt__scroll-list, #page-bbs-link .list, .link-tags__tag-item, .hb-cpt__popover-menu, .hb-cpt__report, .route-to-app__qrcode, .scroll-list__top-btn, .hb-cpt__loading.circle, .search-history, .search__pull-list) {
    background-color: var(--heybox-up-surface) !important;
    border-color: var(--heybox-up-border) !important;
    color: var(--heybox-up-text);
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.hb-cpt__image--default, .hb-cpt__image--placeholder, .link-reply__input-wrapper) {
    background-color: var(--heybox-up-subtle) !important;
    border-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .bbs-new-style-bottom__rich-stack {
    background-color: var(--heybox-up-subtle) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .bbs-new-style-bottom__rich-node {
    color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-user-favour > .content > .list {
    background-color: var(--heybox-up-surface) !important;
    border-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-user-favour .user-favour__list,
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-user-favour .user-favour__list > * {
    background-color: transparent !important;
    border-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.user-favour__item, .favour-item, .favour-card, .list-content, .bbs-list-content, .bbs-link, .link-item, .hot-topic-item, .creator-content-item, .comment-message-item, .message-list-item.active) {
    background-color: var(--heybox-up-subtle) !important;
    border-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.bbs-content__title, .bbs-content__content, .post__title, .post__content, .image-text__title, .image-text__content, .comment-item__content, .children-item__comment-content, .list-content__username, .comment-item__username, .hot-topic-item__name, .nav-item, .view-header__nav-item, .user-profile-wrapper .name, .bbs-info-item .value, .back-btn__text, .page-header__username, .link-user__username, .section-title__content, .content-tag-text, .slide-tab__tab-label, .slide-tab__tab-cnt, .info-box__username, .hb-editor, .message-list-item__title, .comment-message-item__username, .comment-message-item__text, .message-content-preview__reply-text, .message-content-preview__text, .creator-content-item__title, .editor__more-info-title, .creator-editor__form-label, .frame-top-title, .bbs-link-section-title-text, .user-favour__title, .game-name, .result-mini-app__item--name, .result-tool__content--name) {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.list-content__time, .bbs-list-content__time, .post__time, .image-text__time, .comment-item__time, .creator-content-item__create_at, .creator-content-item__type, .creator-content-item__data-item, .message-list-item__time, .user-favour__empty, .scroll-list__no-more-desc, .page-header__meta, .list-content__meta) {
    color: var(--heybox-up-muted) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.bbs-home__topic-name, .hot-topic__header, .related-recommend__container--header, .link-item__title, .qr-section .title, .qr-section span, .app-link-item span, .search-pull__found-item, .search-pull__history-item, .hb-cpt__popover-menu-item.plain) {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.link-item__desc, .bbs-new-style-bottom__comment, .search-pull__section-title, .search-history__item) {
    color: var(--heybox-up-muted) !important;
  }
  /* Search suggestions: site fills history chips light and hot rank labels dark; retheme both. */
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.search-pull__history-item, .search-history__item) {
    background-color: var(--heybox-up-subtle) !important;
    border-color: var(--heybox-up-border) !important;
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.search-pull__history-item:hover, .search-history__item:hover) {
    background-color: var(--heybox-up-surface) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .search-history__item::before {
    background-color: var(--heybox-up-subtle) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .search-pull__section-title {
    color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .search__hot-rank .hot-rank__tab-item {
    color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .search__hot-rank .hot-rank__tab-item.active {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .search__hot-rank .hot-rank__list-item .hot-rank__list-item-game-name {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .search__hot-rank .hot-rank__list-item:hover {
    background-color: var(--heybox-up-subtle) !important;
  }
  /* Search results: the site paints matched terms in a fixed #004b96, unreadable on the themed surface. */
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-bbs-list em {
    color: var(--heybox-up-accent) !important;
  }
  /* Search autocomplete opens in a body-level Element Plus popper; theme the popper
     itself and every inner wrapper so suggestions never fall back to black on white. */
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.search-input-popper, .el-autocomplete__popper) {
    border: 1px solid var(--heybox-up-border) !important;
    background: var(--heybox-up-surface) !important;
    color: var(--heybox-up-text) !important;
    box-shadow: 0 18px 48px rgba(0, 0, 0, .48) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.search-input-popper, .el-autocomplete__popper) :is(.el-autocomplete-suggestion, .el-autocomplete-suggestion__wrap, .el-autocomplete-suggestion__list) {
    background: transparent !important;
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.search-input-popper, .el-autocomplete__popper) .el-autocomplete-suggestion__list li {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.search-input-popper, .el-autocomplete__popper) .el-autocomplete-suggestion__list li:hover,
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.search-input-popper, .el-autocomplete__popper) .el-autocomplete-suggestion__list li.highlighted,
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.search-input-popper, .el-autocomplete__popper) .el-autocomplete-suggestion__list li[aria-selected="true"] {
    background: var(--heybox-up-subtle) !important;
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.search-input-popper, .el-autocomplete__popper) .el-autocomplete-suggestion__list .item-text {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.search-input-popper, .el-autocomplete__popper) .el-autocomplete-suggestion__list :is(em, b, strong) {
    color: var(--heybox-up-accent) !important;
    font-style: normal;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.search-input-popper, .el-autocomplete__popper) :is(.el-popper__arrow, .popper__arrow)::before {
    border-color: var(--heybox-up-border) !important;
    background: var(--heybox-up-surface) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.post__content, .image-text__content) :where(p, span, b, strong, em, i, li, h1, h2, h3, h4, h5, h6, blockquote, .text) {
    color: inherit !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.post__content, .image-text__content) a {
    color: var(--heybox-up-accent) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(input:not([type="checkbox"]):not([type="radio"]), textarea, select) {
    background-color: var(--heybox-up-subtle) !important;
    border-color: var(--heybox-up-border) !important;
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(input, textarea)::placeholder {
    color: var(--heybox-up-muted) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] option {
    background-color: var(--heybox-up-surface);
    color: var(--heybox-up-text);
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.el-input__wrapper, .el-textarea__inner, .el-select__wrapper, [contenteditable="true"]) {
    background-color: var(--heybox-up-subtle) !important;
    color: var(--heybox-up-text) !important;
    box-shadow: 0 0 0 1px var(--heybox-up-border) inset !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.tab-item.active, .slide-tab__tab-item.active, .slide-tab__tab-item.active .slide-tab__tab-label, .nav-link.nav-link--active, .nav-link--active) {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .result-filter-tag__tag.active {
    background-color: var(--heybox-up-accent) !important;
    border-color: var(--heybox-up-accent) !important;
    color: var(--heybox-up-on-accent) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.page-header__back-btn, .hb-cpt__pagination, .hb-cpt__slide-tab) {
    border-color: var(--heybox-up-border) !important;
    color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.el-table th.el-table__cell, .el-table tr) {
    background-color: transparent !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.el-table, .el-table__inner-wrapper, .el-table__body-wrapper, .el-table__header-wrapper) {
    background-color: var(--heybox-up-surface) !important;
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.tab-active-block, .slide-tab-tab__bar) {
    background-color: var(--heybox-up-accent) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.hb-cpt__button.primary, .hb-cpt__button--primary, .editor-publish__btn.main-btn) {
    background-color: var(--heybox-up-accent) !important;
    background-image: none !important;
    border-color: var(--heybox-up-accent) !important;
    color: var(--heybox-up-on-accent) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.nav-user-popover-item:hover, .message-list-item:hover, .link-comment__comment-item:hover, .creator-content-item__operation-item:hover) {
    background-color: var(--heybox-up-subtle) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.bbs-info-item, .message-center__aside, .message-center__content, .comment-message-item, .link-comment__comment-item, .creator-content-item, .editor-tabs, .cpt-qa__row, .cpt-qa__tabs, .hb-cpt__editor-title, .editor-image-text__main-content, .editor-image-wrapper__box, .creator-editor__form-item) {
    border-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] [data-mask$="-bg"] {
    background-color: var(--heybox-up-bg) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] [data-mask$="-edge"] {
    background-color: var(--heybox-up-surface) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .nav {
    --nav-background: rgba(15, 20, 25, .94);
    --nav-shadow: 0 6px 16px rgba(0, 0, 0, .28);
    --nav-link-color: #8593a3;
    --nav-link-hover-color: #dce5ef;
    --nav-link-active-color: #dce5ef;
    --nav-link-hover-bg: transparent;
    --nav-link-active-bg: transparent;
    --publish-color: #10161c;
    --publish-bg: linear-gradient(46deg, #9db9d3, #8fb0cf);
    --publish-hover-shadow: 0 8px 18px rgba(0, 0, 0, .3);
    --nav-user-bg: rgba(220, 229, 239, .08);
    --nav-user-bg-hover: rgba(220, 229, 239, .14);
    --nav-user-divider-color: rgba(220, 229, 239, .12);
    --nav-user-name-color: #dce5ef;
    --nav-user-arrow-color: rgba(220, 229, 239, .72);
    --nav-logo-color: #dce5ef;
    --nav-language-color: #8593a3;
    --nav-language-border-color: rgba(133, 147, 163, .5);
    background: var(--nav-background) !important;
    box-shadow: var(--nav-shadow) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .nav :is(.nav-link, .nav-icon) {
    color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .nav button.nav-link.nav-link--active {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .nav-content-left-logo :is(path, polygon, rect) {
    fill: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.nav-user-popover-name, .nav-user-popover-item-text) {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.nav-user-popover-id, .nav-user-popover-item-icon) {
    color: var(--heybox-up-muted) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .nav-user-popover-divider {
    background-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(button, a, input, textarea, select, summary, [tabindex], [role="button"], [contenteditable="true"]):focus-visible {
    outline: 2px solid var(--heybox-up-accent) !important;
    outline-offset: 2px !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.comment-item__tag-line, .comment-item__writer-like, .children-item__reply-to, .children-item__create-time, .children-item__ip, .info-box__create-time, .info-box__ip, .like-box, .load-all__text, .link-reply__placeholder, .link-reply__operation-desc) {
    color: var(--heybox-up-muted) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.comment-children__load-all, .link-reply__editor, .link-reply__operation-item, .hb-toast, .el-message) {
    background-color: var(--heybox-up-subtle) !important;
    border-color: var(--heybox-up-border) !important;
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .hb-loading-spinner {
    background-color: var(--heybox-up-surface) !important;
    border-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.el-message, .el-message__content) {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .el-image-viewer__wrapper {
    background-color: rgba(0, 0, 0, .88) !important;
  }
  /* 登录表单保持官方浅色，避免第三方登录控件在深色下失去可读性。 */
  :root.heybox-up-theme[data-heybox-up-dark="true"] .website-login {
    color-scheme: light;
    background-color: #fff !important;
    color: #14191e !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .website-login :is(input, textarea, select) {
    background-color: transparent !important;
    border-color: #e8eaed !important;
    color: #14191e !important;
  }
  /* 文章编辑器：站点把底色写在多层容器里，深色、纸页与雾青预设需要整块覆盖。 */
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor > .content > .list,
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.editor-tabs, .editor-article__main-content, .editor-image-text__main-content, .editor-video__main-content, .hb-cpt__editor-title, .editor__menu, .editor__more-info, .creator-editor__form-wrapper, .cpt-editor__publish, .cpt-qa),
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame {
    background-color: var(--heybox-up-surface) !important;
    border-color: var(--heybox-up-border) !important;
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor-article__main-content {
    box-shadow: 0 0 0 1px var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor__menu {
    box-shadow: inset 0 0 0 1px var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor-article__main-content :is(.hb-editor, .ProseMirror) {
    background-color: var(--heybox-up-subtle) !important;
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme:is([data-heybox-up-theme="paper"], [data-heybox-up-theme="mist"]) #page-creator-editor .editor-article__main-content :is(.hb-editor, .ProseMirror) {
    background-color: var(--heybox-up-surface) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.hb-editor, .ProseMirror) :where(p, span, b, strong, em, i, u, s, li, h1, h2, h3, h4, h5, h6, blockquote, td, th) {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.hb-editor, .ProseMirror) :is(a, .prose-link) {
    color: var(--heybox-up-accent) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor-title__cnt-indicator {
    color: var(--heybox-up-muted) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor-publish__btn.main-btn {
    background-color: var(--heybox-up-accent) !important;
    background-image: none !important;
    border-color: var(--heybox-up-accent) !important;
    color: var(--heybox-up-on-accent) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) :is(.hb-cpt__button.primary, .hb-cpt__button--primary) {
    background-color: var(--heybox-up-accent) !important;
    background-image: none !important;
    border-color: var(--heybox-up-accent) !important;
    color: var(--heybox-up-on-accent) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.editor__topic-item, .editor__hashtag-item, .editor__add-btn, .selector__box, .editor-publish__btn.sub-btn, .cpt-qa__tab, .cpt-qa__key) {
    background-color: var(--heybox-up-subtle) !important;
    border-color: var(--heybox-up-border) !important;
    color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.selector__pull-list, .editor-menu-more__list) {
    background-color: var(--heybox-up-surface) !important;
    border-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .selector__pull-list-item {
    color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.selector__pull-list-item:hover, .selector__pull-list-item.active) {
    background-color: var(--heybox-up-raised) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .selector__box {
    box-shadow: 0 0 0 1px var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .switch__button {
    background-color: var(--heybox-up-raised) !important;
    border-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .switch__button.active {
    background-color: var(--heybox-up-accent) !important;
    border-color: var(--heybox-up-accent) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .switch__button-indicator {
    background-color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .switch__button.active .switch__button-indicator {
    background-color: var(--heybox-up-on-accent) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.editor-form__more-info-title, .creator-editor__form-header, .selector__active, .cpt-qa__head-title, .cpt-qa__row-name) {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.topic-item__text, .hashtag-item__text, .editor-form__more-info-desc, .editor__more-info-desc, .cpt-qa__head-sub) {
    color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.switch__true-label, .switch__false-label) {
    color: var(--heybox-up-muted) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.switch__true-label.active, .switch__false-label.active) {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .cpt-form-split-line {
    background-color: var(--heybox-up-border) !important;
  }
  /* Editor dividers and toolbar icons: site paints light 4px / 1px strips and dims icon fills. */
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .creator-editor__form-wrapper::before {
    background-color: var(--heybox-up-bg) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .cpt-editor__publish::after,
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .hb-cpt__editor-title::after,
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor-menu__item-splitline {
    background-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor__menu .hb-icon {
    color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor__menu .editor-menu__item--content-inactive .hb-icon svg {
    opacity: .8 !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor__menu .editor-menu__item.forbid {
    opacity: .8 !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor__menu .editor-menu-more__list-item {
    color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor__menu .editor-menu-more__list-item .hb-icon {
    color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor__menu .editor-menu-more__list-item svg {
    opacity: .9 !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor__menu .editor-menu-more__list-item:hover {
    background-color: var(--heybox-up-subtle) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) [data-mask$="-bg"] {
    background-color: var(--heybox-up-bg) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) [data-mask$="-edge"] {
    background-color: var(--heybox-up-surface) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.hb-cpt__image--default, .hb-cpt__image--placeholder) {
    background-color: var(--heybox-up-subtle) !important;
    border-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.editor-image-wrapper__box, .video-uploader__unload) {
    background-color: var(--heybox-up-surface) !important;
    background-image: none !important;
    border-color: var(--heybox-up-border) !important;
    box-shadow: 0 0 0 .5px var(--heybox-up-border) !important;
    color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.editor-image-text__main-content, .editor-video__main-content) {
    box-shadow: 0 0 0 1px var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame :is(.creator-preview-normal, .bbs-link) {
    background-color: var(--heybox-up-surface) !important;
    border-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame :is(.bbs-link-section-author, .bbs-link-section-tags) {
    background-color: transparent !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame .bbs-link-section-author-name {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame .bbs-link-section-author-time {
    color: var(--heybox-up-muted) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame .bbs-link-section-author-follow {
    background-color: var(--heybox-up-accent) !important;
    background-image: none !important;
    border-color: var(--heybox-up-accent) !important;
    color: var(--heybox-up-on-accent) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame .bbs-link-section-author-follow :is(i, span, svg, use) {
    color: var(--heybox-up-on-accent) !important;
    fill: var(--heybox-up-on-accent) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame :is(.bbs-link-article-content, .hb-article) {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame :is(.bbs-link-article-content, .hb-article) :where(p, span, b, strong, em, i, li, h1, h2, h3, h4, h5, h6, blockquote, .text, .main-title) {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame :is(.bbs-link-article-content, .hb-article) :is(a, .prose-link) {
    color: var(--heybox-up-accent) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame .img-desc {
    color: var(--heybox-up-muted) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame .bbs-link-section-tags-item {
    background-color: var(--heybox-up-subtle) !important;
    border-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame .bbs-link-section-tags-item-text {
    color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame :is(.bbs-link-section-bottom-info, .bbs-link-section-bottom-info-source) {
    color: var(--heybox-up-muted) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) .cpt-right-side :is(.footer-info, .footer-row, .report-text, .copyright-text) {
    color: var(--heybox-up-muted) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) .cpt-right-side .footer-link {
    color: var(--heybox-up-text-2) !important;
  }
  /* 纯黑预设：黑底、低圆角、无阴影，仍复用全部深色覆盖规则。 */
  :root.heybox-up-theme[data-heybox-up-theme="oled"] {
    --heybox-up-bg: #000;
    --heybox-up-surface: #08090b;
    --heybox-up-subtle: #101216;
    --heybox-up-raised: #161a20;
    --heybox-up-border: #1d2026;
    --heybox-up-text: #e6ebf2;
    --heybox-up-text-2: #b8c2cf;
    --heybox-up-muted: #9aa4b2;
    --heybox-up-accent: #a8c0d8;
    --heybox-up-on-accent: #05070a;
    --hbu-menu-bg: #08090b;
    --hbu-menu-text: #e6ebf2;
    --hbu-menu-muted: #9aa4b2;
    --hbu-menu-border: #1d2026;
    --hbu-menu-hover: rgba(230, 235, 242, .07);
    --hb-general-color-bg-0: #000;
    --hb-general-color-bg-1: #08090b;
    --hb-general-color-bg-2: #101216;
    --hb-general-color-bg-3: #101216;
    --hb-general-color-bg-4: #08090b;
    --hb-general-color-text-1: #e6ebf2;
    --hb-general-color-text-2: #b8c2cf;
    --hb-general-color-text-3: #9aa4b2;
    --hb-general-color-stroke-0: #1d2026;
    --hb-general-color-stroke-1: #1d2026;
    --hb-general-color-stroke-2: #161a20;
    --hb-general-color-primary: #a8c0d8;
    --el-color-primary: #a8c0d8;
    --el-color-primary-light-9: #141a22;
    --el-bg-color: #08090b;
    --el-bg-color-page: #000;
    --el-bg-color-overlay: #08090b;
    --el-fill-color-blank: #08090b;
    --el-fill-color: #101216;
    --el-fill-color-light: #101216;
    --el-fill-color-lighter: #101216;
    --el-fill-color-extra-light: #101216;
    --el-border-color: #1d2026;
    --el-border-color-light: #1d2026;
    --el-border-color-lighter: #1d2026;
    --el-table-bg-color: #08090b;
    --el-table-tr-bg-color: #08090b;
    --el-table-header-bg-color: #101216;
    --el-table-row-hover-bg-color: #101216;
    --el-table-border-color: #1d2026;
    --el-mask-color: rgba(0, 0, 0, .86);
    --el-box-shadow: none;
    --el-box-shadow-light: none;
    scrollbar-color: #2a2e35 #000;
  }
  :root.heybox-up-theme[data-heybox-up-theme="oled"] .nav {
    --nav-background: #000;
    --nav-shadow: none;
    --publish-color: #05070a;
    --publish-bg: #a8c0d8;
    --nav-user-bg: rgba(230, 235, 242, .07);
    --nav-user-bg-hover: rgba(230, 235, 242, .13);
  }
  :root.heybox-up-theme[data-heybox-up-theme="oled"] :is(.bbs-home__content-item, .bbs-home__topic-item, .list-content, .user-favour__item, .post__container, .image-text__container, .link-comment, .hot-search, .right-side-default, .hb-bbs-link__header, .hb-bbs-link__content, .search-result__tool, .result-mini-app__item, .price-box, .el-card, .el-dialog, .el-drawer, .el-message-box, .el-popper, .el-dropdown-menu) {
    border-radius: 4px !important;
    box-shadow: none !important;
  }
  /* 纸页预设：暖纸底、衬线标题、细边扁平卡片。 */
  :root.heybox-up-theme[data-heybox-up-theme="paper"] {
    --heybox-up-bg: #f4efe4;
    --heybox-up-surface: #fffdf7;
    --heybox-up-subtle: #efe8d9;
    --heybox-up-raised: #e7ddc9;
    --heybox-up-border: #ddd2bd;
    --heybox-up-text: #2f2a22;
    --heybox-up-text-2: #4a4237;
    --heybox-up-muted: #7c7160;
    --heybox-up-accent: #8a6f4e;
    --heybox-up-icon: #7c7160;
    --heybox-up-icon-hover: #2f2a22;
    --heybox-up-icon-hover-bg: rgba(47, 42, 34, .07);
    --hbu-menu-bg: #fffdf7;
    --hbu-menu-text: #2f2a22;
    --hbu-menu-muted: #7c7160;
    --hbu-menu-border: #ddd2bd;
    --hbu-menu-hover: rgba(47, 42, 34, .06);
    --hb-general-color-bg-0: #f4efe4;
    --hb-general-color-bg-1: #fffdf7;
    --hb-general-color-bg-2: #efe8d9;
    --hb-general-color-bg-4: #fffdf7;
    --hb-general-color-text-1: #2f2a22;
    --hb-general-color-text-2: #4a4237;
    --hb-general-color-text-3: #7c7160;
    --hb-general-color-stroke-0: #ddd2bd;
    --hb-general-color-stroke-1: #ddd2bd;
    --hb-general-color-primary: #8a6f4e;
    --el-color-primary: #8a6f4e;
    --el-bg-color: #fffdf7;
    --el-bg-color-page: #f4efe4;
    --el-bg-color-overlay: #fffdf7;
    --el-fill-color-blank: #fffdf7;
    --el-fill-color-light: #efe8d9;
    --el-text-color-primary: #2f2a22;
    --el-text-color-regular: #4a4237;
    --el-text-color-secondary: #7c7160;
    --el-border-color: #ddd2bd;
    --el-border-color-light: #ddd2bd;
    scrollbar-color: #cfc2aa #f4efe4;
  }
  /* 雾青预设：冷雾底、大圆角、柔和浮层。 */
  :root.heybox-up-theme[data-heybox-up-theme="mist"] {
    --heybox-up-bg: #eef3f5;
    --heybox-up-surface: #fbfdfe;
    --heybox-up-subtle: #e4ecef;
    --heybox-up-raised: #dbe7eb;
    --heybox-up-border: #d3e0e5;
    --heybox-up-text: #1f2c33;
    --heybox-up-text-2: #3e5560;
    --heybox-up-muted: #6f8792;
    --heybox-up-accent: #4f7f8a;
    --heybox-up-icon: #6f8792;
    --heybox-up-icon-hover: #1f2c33;
    --heybox-up-icon-hover-bg: rgba(31, 44, 51, .07);
    --hbu-menu-bg: #fbfdfe;
    --hbu-menu-text: #1f2c33;
    --hbu-menu-muted: #6f8792;
    --hbu-menu-border: #d3e0e5;
    --hbu-menu-hover: rgba(31, 44, 51, .06);
    --hb-general-color-bg-0: #eef3f5;
    --hb-general-color-bg-1: #fbfdfe;
    --hb-general-color-bg-2: #e4ecef;
    --hb-general-color-bg-4: #fbfdfe;
    --hb-general-color-text-1: #1f2c33;
    --hb-general-color-text-2: #3e5560;
    --hb-general-color-text-3: #6f8792;
    --hb-general-color-stroke-0: #d3e0e5;
    --hb-general-color-stroke-1: #d3e0e5;
    --hb-general-color-primary: #4f7f8a;
    --el-color-primary: #4f7f8a;
    --el-bg-color: #fbfdfe;
    --el-bg-color-page: #eef3f5;
    --el-bg-color-overlay: #fbfdfe;
    --el-fill-color-blank: #fbfdfe;
    --el-fill-color-light: #e4ecef;
    --el-text-color-primary: #1f2c33;
    --el-text-color-regular: #3e5560;
    --el-text-color-secondary: #6f8792;
    --el-border-color: #d3e0e5;
    --el-border-color-light: #d3e0e5;
    scrollbar-color: #b9ccd3 #eef3f5;
  }
  :root.heybox-up-theme:is([data-heybox-up-theme="paper"], [data-heybox-up-theme="mist"]) body {
    background-color: var(--heybox-up-bg) !important;
    color: var(--heybox-up-text);
  }
  :root.heybox-up-theme:is([data-heybox-up-theme="paper"], [data-heybox-up-theme="mist"]) :is(#app, main, .hb-website__app, .hb-page__app, .hb-layout__main, .hb-layout-main__container, .hb-layout__content) {
    background-color: var(--heybox-up-bg) !important;
    color: var(--heybox-up-text);
  }
  :root.heybox-up-theme:is([data-heybox-up-theme="paper"], [data-heybox-up-theme="mist"]) :is(.nav, .nav-user .nav-user-popover, .el-popper, .el-dropdown-menu, .el-dialog, .el-drawer, .el-message-box, .hb-cpt__selector .selector__pull-list, .page-header__container-bg, .tab-list--wrapper, .link-tab-list, .hb-cpt-page-header, .user-profile-wrapper, .bbs-info, .message-center__main, .message-center__aside-title, .message-center__search-box, .message-home__tabs, .message-content-preview, .message-content-preview__post, .search-result__tab-header, .hb-search-result, .hb-bbs-link__header, .hb-bbs-link__content, .link-comment, .link-reply, .comment__comment-header, .topic-link__header, .post__container, .image-text__container, .bbs-link__related-recommend, .hb-cpt__empty, .qr-section, .app-link-item, .bbs-home__content-item, .bbs-home__topic-item, .list-content, .user-favour__item, #page-bbs-link .list, .hot-search, .right-side-default, .search-result__tool, .result-mini-app__item, .price-box, .result-filter-tag__tag) {
    background-color: var(--heybox-up-surface) !important;
    border-color: var(--heybox-up-border) !important;
    color: var(--heybox-up-text);
  }
  :root.heybox-up-theme:is([data-heybox-up-theme="paper"], [data-heybox-up-theme="mist"]) .nav {
    --nav-link-color: var(--heybox-up-muted);
    --nav-link-hover-color: var(--heybox-up-text);
    --nav-link-active-color: var(--heybox-up-text);
    --nav-link-hover-bg: transparent;
    --nav-link-active-bg: transparent;
    --publish-color: #fff;
    --publish-bg: var(--heybox-up-accent);
    --nav-user-bg: var(--heybox-up-subtle);
    --nav-user-bg-hover: var(--heybox-up-raised);
    --nav-user-name-color: var(--heybox-up-text);
    --nav-user-divider-color: var(--heybox-up-border);
    --nav-logo-color: var(--heybox-up-text);
  }
  :root.heybox-up-theme[data-heybox-up-theme="paper"] .nav {
    --nav-background: rgba(244, 239, 228, .95);
    --nav-shadow: 0 1px 0 #ddd2bd;
  }
  :root.heybox-up-theme[data-heybox-up-theme="mist"] .nav {
    --nav-background: rgba(251, 253, 254, .84);
    --nav-shadow: 0 8px 24px rgba(47, 74, 84, .08);
    backdrop-filter: blur(14px) saturate(1.1);
  }
  :root.heybox-up-theme[data-heybox-up-theme="paper"] :is(.bbs-home__content-item, .bbs-home__topic-item, .list-content, .user-favour__item, .post__container, .image-text__container, .link-comment, .hot-search, .right-side-default, .hb-bbs-link__header, .hb-bbs-link__content, .search-result__tool, .result-mini-app__item, .price-box, .el-card, .el-dialog, .el-drawer, .el-message-box, .el-popper, .el-dropdown-menu) {
    border-radius: 3px !important;
    box-shadow: none !important;
  }
  :root.heybox-up-theme[data-heybox-up-theme="mist"] :is(.bbs-home__content-item, .bbs-home__topic-item, .list-content, .user-favour__item, .post__container, .image-text__container, .link-comment, .hot-search, .right-side-default, .hb-bbs-link__header, .hb-bbs-link__content, .search-result__tool, .result-mini-app__item, .price-box, .el-card, .el-dialog, .el-drawer, .el-message-box, .el-popper, .el-dropdown-menu) {
    border-radius: 16px !important;
    box-shadow: 0 6px 20px rgba(47, 74, 84, .08) !important;
  }
  :root.heybox-up-theme[data-heybox-up-theme="paper"] :is(.post__title, .image-text__title, .bbs-content__title, .bbs-link-section-title-text, .section-title__content, .user-favour__title, .related-recommend__container--header) {
    font-family: Georgia, "Songti SC", "Noto Serif CJK SC", serif;
    letter-spacing: .01em;
  }
  :root.heybox-up-theme[data-heybox-up-theme="paper"] :is(.post__content, .image-text__content) a {
    color: var(--heybox-up-accent);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  /* 版式：定宽阅读栏 + 卡片化信息流。站点通栏列表每行超过 90 字，长读易疲劳。 */
  @media (max-width: 799px) {
    /* 站点给 #app 写死 800px 下限；实际手机宽度会被裁切，这里恢复单列收缩。 */
    #app { min-width: 0 !important; width: 100% !important; }
  }
  :root {
    --heybox-up-page-w: 1360px;
    /* 中间栏占视口百分比，可在齿轮设置菜单里调；上限避免超宽屏上正文行过长。 */
    --heybox-up-feed-pct: 56;
    /* Body line height multiplier, adjustable in the settings menu or the reader rail panel. */
    --heybox-up-reading-line-height: 1.7;
    --heybox-up-feed-w: min(calc(var(--heybox-up-feed-pct) * 1vw), 1180px);
    --heybox-up-radius-card: 14px;
    --heybox-up-gap: 12px;
    --heybox-up-card-pad: 20px;
    --heybox-up-shadow-1: 0 1px 2px rgba(16, 24, 40, .05);
    --heybox-up-shadow-2: 0 14px 34px rgba(16, 24, 40, .14);
  }
  :root.heybox-up-theme[data-heybox-up-theme="paper"] {
    --heybox-up-radius-card: 4px;
    --heybox-up-shadow-1: none;
    --heybox-up-shadow-2: 0 10px 24px rgba(47, 42, 34, .12);
  }
  :root.heybox-up-theme[data-heybox-up-theme="mist"] {
    --heybox-up-radius-card: 18px;
    --heybox-up-shadow-1: 0 4px 14px rgba(47, 74, 84, .07);
    --heybox-up-shadow-2: 0 16px 36px rgba(47, 74, 84, .14);
  }
  :root.heybox-up-theme[data-heybox-up-theme="oled"] {
    --heybox-up-radius-card: 8px;
    --heybox-up-shadow-1: none;
    --heybox-up-shadow-2: 0 14px 34px rgba(0, 0, 0, .72);
  }
  @media (min-width: 1200px) {
    #app > main {
      max-width: var(--heybox-up-page-w) !important;
      padding-left: 24px !important;
      padding-right: 24px !important;
    }
    #app > main > section,
    #app > main > .layout-normal {
      max-width: 100% !important;
    }
  }
  /* 社区首页：移除热门社区/二维码右栏，信息流量成一条阅读栏，宽度够放两张图也不拉长正文行。 */
  #page-bbs-community .cpt-right-side.right {
    display: none !important;
  }
  #page-bbs-community .content {
    width: auto !important;
    max-width: var(--heybox-up-page-w) !important;
    margin: 0 auto !important;
    justify-content: center !important;
  }
  #page-bbs-community main.list {
    width: auto !important;
    max-width: var(--heybox-up-feed-w) !important;
    flex: 0 1 var(--heybox-up-feed-w) !important;
    min-width: 0;
  }
  /* 搜索栏跟随阅读栏宽度居中，避免页头比信息流每侧多出 176px。 */
  #page-bbs-community .bbs-community__search-module {
    width: min(var(--heybox-up-feed-w), 100%) !important;
    max-width: 100% !important;
    margin-left: auto !important;
    margin-right: auto !important;
  }
  /* 搜索建议加载期间的空壳会留下 26px 浮层，截获首张帖子卡片的点击；无内容时直接收起。 */
  #page-bbs-community .search__pull-list:has(> .search__suggestion:empty) {
    display: none !important;
  }
  @media (min-width: 1200px) {
    body.heybox-up-rail-open #page-bbs-community .content {
      justify-content: flex-start !important;
    }
    body.heybox-up-rail-open #page-bbs-community main.list {
      margin-left: 0 !important;
      margin-right: auto !important;
    }
  }
  #page-bbs-community .hb-bbs-home,
  #page-bbs-community .bbs-home__content-list {
    width: auto !important;
    max-width: none !important;
    flex: 1 1 auto !important;
    min-width: 0;
  }
  /* 卡片化：帖子之间留间隙与细边，滚动时条目边界一眼可辨。 */
  #page-bbs-community .bbs-home__content-list {
    display: flex !important;
    flex-direction: column;
    gap: var(--heybox-up-gap);
    padding: 4px 0 28px !important;
  }
  #page-bbs-community .bbs-home__content-item {
    margin: 0 !important;
    padding: 0 !important;
    border: 1px solid var(--heybox-up-border) !important;
    border-radius: var(--heybox-up-radius-card) !important;
    background-color: var(--heybox-up-surface) !important;
    box-shadow: var(--heybox-up-shadow-1);
    overflow: hidden;
    transition: border-color .16s ease, box-shadow .16s ease;
  }
  #page-bbs-community .bbs-home__content-item:hover {
    border-color: var(--heybox-up-raised) !important;
    box-shadow: var(--heybox-up-shadow-2);
  }
  #page-bbs-community .bbs-home__content-item > a.hb-cpt__bbs-list-content {
    display: block;
    padding: var(--heybox-up-card-pad) !important;
    background: transparent !important;
  }
  #page-bbs-community :is(.hb-bbs-home__feed-splitline, .hb-bbs-home__splitline)::before,
  #page-bbs-community :is(.hb-bbs-home__feed-splitline, .hb-bbs-home__splitline)::after {
    background: transparent !important;
  }
  #page-bbs-community .bbs-home__topic-list-wrapper {
    margin: 0 0 var(--heybox-up-gap) !important;
    padding: 10px 14px !important;
    border: 1px solid var(--heybox-up-border) !important;
    border-radius: var(--heybox-up-radius-card) !important;
    background-color: var(--heybox-up-surface) !important;
    overflow: hidden;
  }
  /* 卡片内排版：标题 17/1.5，正文 15/1.72，元信息压到 13px，层级靠字号与颜色拉开。 */
  #page-bbs-community .bbs-content__title {
    margin: 10px 0 6px !important;
    font-size: 17px !important;
    line-height: 1.5 !important;
    font-weight: 600;
    letter-spacing: .005em;
  }
  #page-bbs-community .bbs-content__content {
    font-size: 15px !important;
    line-height: 1.72 !important;
    color: var(--heybox-up-text-2) !important;
  }
  #page-bbs-community .bbs-list-content__header {
    gap: 8px;
  }
  #page-bbs-community .list-content__username {
    font-size: 13px !important;
    font-weight: 500;
  }
  #page-bbs-community .bbs-content__imgs-wrapper {
    margin-top: 10px !important;
  }
  #page-bbs-community .bbs-content__image {
    border-radius: 10px !important;
  }
  /* 作者行、更多按钮与图片计数是卡片里最小的可点区域，统一抬到 24px 与 11px。 */
  :root.heybox-up-theme :is(#page-bbs-community .header__user, #page-topic-link .header__user) {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
  }
  :root.heybox-up-theme .list-cotent__operation-btn {
    display: inline-grid;
    place-items: center;
    width: 24px !important;
    height: 24px !important;
  }
  :root.heybox-up-theme #page-topic-link .topic-link__sorter {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
  }
  :root.heybox-up-theme .bbs-content__image-cnt { font-size: 11px !important; }
  #page-bbs-community .bbs-new-style-bottom {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--heybox-up-border);
  }
  /* 窄屏：卡片化会吃掉内边距，收回固定宽度与内边距，信息流改用整幅。 */
  @media (max-width: 1100px) {
    :root {
      --heybox-up-feed-w: min(960px, 100%);
      --heybox-up-card-pad: 16px;
    }
  }
  /* 评论预览侧栏：展开时由桌面栅格为预览保留真实宽度，侧栏本身在 Shadow DOM 内自绘。 */
  :root { --heybox-up-rail-w: 320px; }
  @media (max-width: 1399px) {
    :root { --heybox-up-rail-w: 288px; }
  }
  #page-bbs-community :is(.bbs-new-style-bottom__comment, .content-list__comment) {
    cursor: pointer;
  }
  /* 评论排序只改 order，不动 DOM，避免打断站点自身的列表更新。 */
  #page-bbs-link .link-comment__list {
    display: flex !important;
    flex-direction: column;
  }
  /* 帖子详情：正文纸张 + 原生评论侧栏，两块各自成卡片，中间留 24px 空隙。 */
  @media (min-width: 1200px) {
    #page-bbs-link .content {
      width: auto !important;
      max-width: var(--heybox-up-page-w) !important;
      margin: 0 auto !important;
      gap: 24px;
      align-items: flex-start;
      justify-content: center;
    }
    #page-bbs-link .list {
      max-width: none !important;
      flex: 1 1 auto !important;
      min-width: 0;
    }
    #page-bbs-link .cpt-right-side.right {
      display: none !important;
    }
    #page-bbs-link .hb-cpt__scroll-list.hb-bbs-link__container {
      width: auto !important;
      max-width: none !important;
    }
    #page-bbs-link .hb-bbs-link__content {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) 424px;
      gap: 24px;
      align-items: start;
      width: auto !important;
      max-width: none !important;
    }
    #page-bbs-link .hb-bbs-image-text {
      grid-column: 1;
      min-width: 0;
      padding: 28px 32px !important;
      border: 1px solid var(--heybox-up-border) !important;
      border-radius: var(--heybox-up-radius-card) !important;
      background-color: var(--heybox-up-surface) !important;
      box-shadow: var(--heybox-up-shadow-1);
      /* 正文与评论各自滚动：正文列吸顶并限高，滚到底不带走整页。 */
      position: sticky;
      top: 88px;
      max-height: calc(100vh - 112px);
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
      scrollbar-gutter: stable;
    }
    #page-bbs-link .link-comment {
      grid-column: 2;
      position: sticky;
      top: 88px;
      height: calc(100vh - 112px);
      max-height: calc(100vh - 112px);
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
      width: 100% !important;
      margin: 0 !important;
      border: 1px solid var(--heybox-up-border) !important;
      border-radius: var(--heybox-up-radius-card) !important;
      background-color: var(--heybox-up-surface) !important;
      box-shadow: var(--heybox-up-shadow-1);
    }
    #page-bbs-link .link-comment .comment__comment-header {
      top: 0 !important;
      background-color: var(--heybox-up-surface) !important;
    }
  }
  /* Body: line height comes from the user preference; paragraphs stay under 46em. */
  #page-bbs-link :is(.post__title, .image-text__title, .section-title__content) {
    font-size: 25px !important;
    line-height: 1.42 !important;
    font-weight: 700;
    letter-spacing: -.01em;
  }
  #page-bbs-link :is(.post__content, .image-text__content) {
    font-size: 16px !important;
    line-height: var(--heybox-up-reading-line-height) !important;
  }
  /* The site hard-codes a 25px line height on nested paragraphs; cover body text
     only so cards and blockquotes keep their own styles. */
  #page-bbs-link :is(.post__content, .image-text__content) :is(p, li, ul, ol, .line, .order-line, .text):not([class*="com-"], [class*="com-"] *):not(blockquote, blockquote *) {
    line-height: var(--heybox-up-reading-line-height) !important;
  }
  #page-bbs-link :is(.post__content, .image-text__content) :is(p, blockquote, h1, h2, h3, h4) {
    max-width: 46em;
  }
  #page-bbs-link :is(.post__content, .image-text__content) p {
    margin: 0 0 .72em !important;
  }
  #page-bbs-link :is(.post__content, .image-text__content) h2 {
    margin: 1.4em 0 .6em !important;
    font-size: 20px !important;
    line-height: 1.5 !important;
  }
  #page-bbs-link :is(.post__content, .image-text__content) h3 {
    margin: 1.2em 0 .5em !important;
    font-size: 17px !important;
    line-height: 1.55 !important;
  }
  #page-bbs-link :is(.post__content, .image-text__content) blockquote {
    margin: 1em 0 !important;
    padding: 2px 0 2px 14px !important;
    border-left: 3px solid var(--heybox-up-accent) !important;
    color: var(--heybox-up-muted) !important;
    line-height: 1.8 !important;
  }
  #page-bbs-link :is(.post__content, .image-text__content) blockquote :is(p, .text) {
    line-height: 1.8 !important;
  }
  /* The native article styles hard-code dark text on nested paragraphs and ordered-list lines.
     Cards and blockquotes keep their own colors, matching the line-height exclusion above. */
  #page-bbs-link :is(.post__content, .image-text__content) :is(p, li, ol, ul, .line, .order-line, .text):not([class*="com-"], [class*="com-"] *):not(blockquote, blockquote *) {
    color: var(--heybox-up-text) !important;
  }
  #page-bbs-link :is(.post__content, .image-text__content) blockquote,
  #page-bbs-link :is(.post__content, .image-text__content) blockquote :is(p, .text) {
    color: var(--heybox-up-muted) !important;
  }
  #page-bbs-link :is(.post__content, .image-text__content) :is(img, .hb-cpt__image) {
    border-radius: 10px !important;
  }
  /* 评论区：14px 正文，楼层用细线分隔，嵌套回复保留站点结构只改圆角与间距。 */
  #page-bbs-link .link-comment__comment-item {
    padding: 14px 16px !important;
    border-top: 1px solid var(--heybox-up-border) !important;
  }
  #page-bbs-link :is(.comment-item__content, .children-item__comment-content) {
    font-size: 14px !important;
    line-height: 1.7 !important;
  }
  #page-bbs-link .link-comment__comment-children {
    margin-top: 8px !important;
    border-radius: 10px !important;
  }
  @media (max-width: 1199px) {
    #page-bbs-link .content {
      flex-direction: column;
    }
    #page-bbs-link .list {
      width: 100% !important;
      max-width: none !important;
    }
    #page-bbs-link .cpt-right-side.right {
      display: none !important;
    }
    #page-bbs-link .hb-cpt__scroll-list.hb-bbs-link__container,
    #page-bbs-link .hb-bbs-link__content {
      width: auto !important;
      max-width: none !important;
    }
    #page-bbs-link .hb-bbs-link__content {
      display: flex;
      flex-direction: column;
    }
    #page-bbs-link .link-comment {
      width: 100% !important;
      margin: 16px 0 0 !important;
    }
  }
  /* 站点未覆盖的容器补齐主题底色：嵌套回复块、个人主页列表。 */
  :root.heybox-up-theme .link-comment__comment-children {
    background-color: var(--heybox-up-subtle) !important;
    border-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme #page-user-profile > .content > .list {
    background-color: var(--heybox-up-surface) !important;
    border-color: var(--heybox-up-border) !important;
    color: var(--heybox-up-text);
  }
  /* Profile submissions use a near-white 4px divider and dark text colors from the original skin. */
  :root.heybox-up-theme #page-user-profile .user-profile-article-item::after {
    background-color: transparent !important;
    background-image: none !important;
  }
  :root.heybox-up-theme #page-user-profile .article-title .title {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme #page-user-profile .bottom-line :is(.time, .comment, .comment span) {
    color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme #page-user-profile .tab-item {
    color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme #page-user-profile .tab-item.active {
    color: var(--heybox-up-text) !important;
  }
  /* The profile right rail only carries the app QR code, promotions and ICP text. */
  #page-user-profile .cpt-right-side.right {
    display: none !important;
  }
  #page-user-profile .content > .list {
    flex: 1 1 auto !important;
    width: auto !important;
    min-width: 0 !important;
    max-width: none !important;
  }
  /* Theme the author hover card without changing its 315x146 box or z-index. */
  :root.heybox-up-theme #page-user-profile .name-box .detail-info {
    background-color: var(--heybox-up-surface) !important;
    color: var(--heybox-up-text) !important;
    box-shadow: 0 0 0 1px var(--heybox-up-border), 0 18px 46px rgba(0, 0, 0, .32) !important;
  }
  :root.heybox-up-theme #page-user-profile .name-box .detail-info::after {
    background-color: var(--heybox-up-surface) !important;
  }
  :root.heybox-up-theme #page-user-profile .name-box .detail-info .main-info {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme #page-user-profile .name-box .detail-info .sub-info {
    color: var(--heybox-up-text-2) !important;
  }
  /* 站点用伪元素画页面底色与帖子分隔条，颜色不随变量走，需单独覆盖。 */
  :root.heybox-up-theme[data-heybox-up-dark="true"] {
    background-color: var(--heybox-up-bg) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#app > main > section, #page-bbs-community .hb-bbs-home__feed-splitline, #page-bbs-community .hb-bbs-home__splitline)::before,
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#app > main > section, #page-bbs-community .hb-bbs-home__feed-splitline, #page-bbs-community .hb-bbs-home__splitline)::after {
    background-color: var(--heybox-up-bg) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#page-bbs-community main.list, #page-bbs-link main.list)::before,
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#page-bbs-community main.list, #page-bbs-link main.list)::after {
    background-color: var(--heybox-up-surface) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .hb-cpt__moment-list-content::after {
    background-color: var(--heybox-up-subtle) !important;
  }
  /* 站点用伪元素画卡片底部 4px 色带，取色固定为近白，任何主题下都会形成白条。 */
  :root.heybox-up-theme .hb-bbs-image-text::after,
  :root.heybox-up-theme .hb-bbs-post::after,
  :root.heybox-up-theme .hb-bbs__video::after {
    background-color: transparent !important;
    background-image: none !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .link-reply::before,
  :root.heybox-up-theme[data-heybox-up-dark="true"] .link-comment__comment-item + .link-comment__comment-item:not(:hover)::before,
  :root.heybox-up-theme[data-heybox-up-dark="true"] .link-comment__comment-children .comment-children__load-all::before,
  :root.heybox-up-theme[data-heybox-up-dark="true"] .hb-cpt__slide-tab.underline::after,
  :root.heybox-up-theme[data-heybox-up-dark="true"] .hb-cpt__slide-tab.line::after,
  :root.heybox-up-theme[data-heybox-up-dark="true"] .related-recommend__link-item--content::before,
  :root.heybox-up-theme[data-heybox-up-dark="true"] .related-recommend__link-item--topic::before {
    background-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .link-comment__comment-children .comment-children-item:hover::after {
    background-color: var(--heybox-up-subtle) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .link-reply .link-reply__main-box .link-reply__input-wrapper::after {
    border-color: var(--heybox-up-border) !important;
  }
  /* 正文内嵌的 com-* 卡片族（游戏/专辑/百科/比赛/模组/角标/等）底色写死为浅色，
     深色下会整块发白。统一按容器、描边、主次文字、药丸底、占位块五组覆盖。 */
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.com-game-card, .com-album-card, .com-award-table-card, .com-chatroom-card, .com-league-card, .com-match-card, .com-mod-card, .com-sku-card, .com-wiki-card) {
    background-color: var(--heybox-up-subtle) !important;
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.com-game-card, .com-album-card, .com-award-table-card, .com-chatroom-card, .com-league-card, .com-match-card, .com-mod-card, .com-sku-card, .com-wiki-card).is-editor-mode,
  :root.heybox-up-theme[data-heybox-up-dark="true"] .com-card-placeholder {
    background-color: var(--heybox-up-surface) !important;
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .com-card-placeholder svg path {
    fill: var(--heybox-up-muted) !important;
  }
  /* 卡片描边用 1px 边框乘 0.5 缩放绘制，颜色写死，深色下成亮边。 */
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.com-game-card, .com-album-card, .com-award-table-card, .com-chatroom-card, .com-league-card, .com-match-card, .com-mod-card, .com-sku-card, .com-wiki-card)::after {
    border-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.com-award-table-card .award-table-row, .com-award-table-card .award-table-row.title, .com-award-table-card .award-table-row:last-of-type) {
    border-color: var(--heybox-up-border) !important;
  }
  /* 主文字：写死 #14191e。 */
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(
    .com-game-card .game-info .line-1,
    .com-game-card .game-info .line-2 .price-box .price-content-box,
    .com-game-card .game-info .line-2 .price-box .price-content-box .coupon-tip,
    .com-game-card .game-info .line-2 .follow-box .follow-num,
    .com-album-card .album-info .line-1 .album-name,
    .com-award-table-card .award-table-row,
    .com-chatroom-card .info-section .chatroom-title,
    .com-league-card .league-info-box .line-1 .league-title,
    .com-match-card .team-1 .team-name,
    .com-match-card .team-2 .team-name,
    .com-match-card .match-info-wrapper .line-2 .aftermatch .team-score.weight,
    .com-match-card .match-info-wrapper .line-2 .watched,
    .com-match-card .match-info-wrapper .line-2 .commingsoon,
    .com-mod-card .mod-card-info .mod-card-title,
    .com-sku-card .sku-info-box .line-1,
    .com-sku-card .sku-info-box .line-2 .price-box .price-content-box,
    .com-wiki-card .info-section .info-line .words-num
  ) {
    color: var(--heybox-up-text) !important;
  }
  /* 次要文字：写死 #8c9196 与 #64696e。 */
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(
    .com-game-card .game-info .line-2 .price-box .price-content-box .release-desc,
    .com-game-card .game-info .line-2 .price-box .price-content-box .release-time,
    .com-game-card .game-info .line-2 .price-box .price-content-box .original-price,
    .com-game-card .game-info .line-2 .follow-box .had-tag,
    .com-game-card .game-info .line-2 .follow-box i,
    .com-album-card .delete-desc,
    .com-album-card .album-info .line-2 .game-num,
    .com-award-table-card .award-table-row.unfold,
    .com-chatroom-card .info-section .line-2 .default-desc,
    .com-chatroom-card .info-section .line-2 .online-count,
    .com-chatroom-card .info-section .line-2 .room-count,
    .com-league-card .league-info-box .line-2 .league-date,
    .com-match-card .match-info-wrapper .line-1,
    .com-match-card .match-info-wrapper .line-2,
    .com-match-card .match-info-wrapper .line-3,
    .com-match-card .match-info-wrapper .line-2 .aftermatch .colon,
    .com-mod-card .mod-card-info .mod-card-summary,
    .com-sku-card .sku-info-box .line-2 .price-box .price-content-box .original-price,
    .com-wiki-card .info-section .info-line .words-num-desc,
    .com-wiki-card .info-section .info-line .enter-wiki,
    .com-wiki-card .info-section .info-line i
  ) {
    color: var(--heybox-up-muted) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .com-game-card .game-info .line-2 .price-box .price-content-box .original-price::after {
    background-color: var(--heybox-up-muted) !important;
  }
  /* 药丸/标签底：写死 #f3f4f5，配深色文字，深色下变成亮块加暗字。 */
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(
    .com-game-card .game-info .line-2 .price-box,
    .com-game-card .game-info .line-2 .follow-box,
    .com-album-card .delete-album,
    .com-album-card .album-info .line-2 .favour-btn.favoured,
    .com-award-table-card .award-table-row.title,
    .com-award-table-card .award-table-row.unfold,
    .com-league-card .league-info-box .line-2 .league-date,
    .com-league-card .league-info-box .line-2 .price-pool,
    .com-match-card .match-info-wrapper .line-2 .aftermatch .team-score,
    .com-match-card .match-info-wrapper .line-2 .watched,
    .com-match-card .match-info-wrapper .line-2 .commingsoon,
    .com-match-card .match-info-wrapper .line-2 .aftermatch .colon,
    .com-sku-card .sku-info-box .line-2 .price-box
  ) {
    background-color: var(--heybox-up-raised) !important;
  }
  /* 深色实心按钮：写死 #14191e 或同色渐变，深色下与卡片底几乎融为一体。 */
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(
    .com-game-card .game-info .line-2 .follow-btn,
    .com-game-card .game-info .line-2 .wishlist-box,
    .com-game-card .game-info .line-2 .follow-box i,
    .com-game-card .game-info .line-2 .follow-box .follow-unit,
    .com-game-card .game-info .line-2 .wishlist-box i,
    .com-game-card .game-info .line-2 .wishlist-box .add-wishlist-text,
    .com-album-card .album-info .line-1 .album-label,
    .com-album-card .album-info .line-2 .favour-btn,
    .com-match-card .match-info-wrapper .line-2 .unwatched,
    .com-mod-card .mod-card-download,
    .com-mod-card .mod-card-download .mod-card-download-text,
    .com-sku-card .sku-info-box .line-2 .follow-btn
  ) {
    background-color: var(--heybox-up-raised) !important;
    background-image: none !important;
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .com-album-card .album-info .line-2 .favour-btn.favoured {
    color: var(--heybox-up-text-2) !important;
  }
  /* 图片占位底与未加载图片的灰块。 */
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.com-album-card .game-img-album, .com-mod-card .mod-card-image-box) {
    background-color: var(--heybox-up-raised) !important;
  }
  /* 评论区与列表底部的写死浅色小件。 */
  :root.heybox-up-theme[data-heybox-up-dark="true"] .comment-item__writer-like span {
    background-color: var(--heybox-up-raised) !important;
    color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .children-item__comment-creator {
    color: var(--heybox-up-accent) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .scroll-list__no-more-desc::before {
    background-color: var(--heybox-up-border) !important;
  }
  /* 文章管理页：列表末尾的“暂无更多内容”会打断卡片流，直接隐藏。 */
  #page-creator-content-management .scroll-list__no-more-desc {
    display: none !important;
  }
  /* 收藏与文章页：右栏只剩二维码、推广与备案信息，移除后让主列表占满内容区。 */
  :is(#page-user-favour, #page-creator-content-management, #page-creator-content-management-detail)
    .cpt-right-side.right {
    display: none !important;
  }
  :is(#page-user-favour, #page-creator-content-management, #page-creator-content-management-detail)
    .content > .list {
    flex: 1 1 auto !important;
    width: auto !important;
    max-width: none !important;
  }
  /* Global search page: right rail holds only hot searches, a QR code, app links and ICP text. */
  #page-bbs-list .cpt-right-side.right {
    display: none !important;
  }
  #page-bbs-list .content > .list {
    flex: 1 1 0 !important;
    width: auto !important;
    min-width: 0 !important;
    max-width: none !important;
  }
  /* The native control anchors to the content box, so it drifts under rails and off the viewport. */
  .scroll-list__button-group {
    right: 20px !important;
    bottom: 24px !important;
    left: auto !important;
  }
  #page-bbs-community .scroll-list__button-group,
  #page-topic-link .scroll-list__button-group,
  #page-bbs-link .scroll-list__button-group {
    display: none !important;
  }
  /* Site confirm dialogs mount on body with fixed light surfaces behind the reader layer. */
  :root.heybox-up-theme .alert-container-wrapper .hb-cpt__alert {
    background-color: var(--heybox-up-surface) !important;
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme .alert-container-wrapper .hb-cpt__alert-title {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme .alert-container-wrapper .hb-cpt__alert-desc {
    color: var(--heybox-up-muted) !important;
  }
  :root.heybox-up-theme .alert-container-wrapper .hb-cpt__alert-input-wrapper {
    background-color: var(--heybox-up-subtle) !important;
    box-shadow: inset 0 0 0 1px var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme .alert-container-wrapper .hb-cpt__alert-input {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme .alert-container-wrapper .hb-cpt__alert-input::placeholder {
    color: var(--heybox-up-muted) !important;
  }
  :root.heybox-up-theme .alert-container-wrapper .alert-btn-box__btn.cancel {
    background-color: var(--heybox-up-subtle) !important;
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme .alert-container-wrapper .alert-btn-box__btn.confirm {
    background: var(--heybox-up-accent) !important;
    color: var(--heybox-up-on-accent) !important;
  }
`;

export const THEME_ENTRY_CSS = `
  :host { display: inline-flex; flex: none; position: relative; gap: 2px; }
  .button {
    display: grid; place-items: center; width: 32px; height: 32px; padding: 0;
    border: 0; border-radius: 8px; background: transparent;
    color: var(--heybox-up-icon, #62676e); cursor: pointer;
  }
  .button:hover {
    background: var(--heybox-up-icon-hover-bg, rgba(20, 25, 30, .06));
    color: var(--heybox-up-icon-hover, #14191e);
  }
  .button:focus-visible {
    outline: 2px solid var(--heybox-up-accent, #6f8db3);
    outline-offset: 2px;
  }
  svg { display: block; width: 18px; height: 18px; }
  .menu {
    position: absolute; top: 38px; right: 0; z-index: 1000; width: 236px; padding: 6px;
    border: 1px solid var(--hbu-menu-border, rgba(20, 25, 30, .12)); border-radius: 12px;
    background: var(--hbu-menu-bg, #fff); color: var(--hbu-menu-text, #14191e);
    box-shadow: 0 14px 34px rgba(0, 0, 0, .18);
  }
  .theme-menu { right: 34px; }
  .settings-menu { max-height: min(70vh, 560px); overflow-y: auto; overscroll-behavior: contain; }
  .menu[hidden] { display: none; }
  .menu-title {
    padding: 6px 10px 4px; font-size: 11px; letter-spacing: .08em;
    color: var(--hbu-menu-muted, #6b7280);
  }
  .item {
    display: flex; align-items: center; gap: 10px; width: 100%; padding: 7px 8px;
    border: 0; border-radius: 8px; background: transparent; color: inherit;
    font: inherit; text-align: left; cursor: pointer;
  }
  .item:hover, .item:focus-visible { background: var(--hbu-menu-hover, rgba(20, 25, 30, .06)); outline: none; }
  .item[aria-checked="true"] { background: var(--hbu-menu-hover, rgba(20, 25, 30, .06)); }
  .swatch {
    flex: none; width: 28px; height: 28px; border-radius: 7px;
    border: 1px solid var(--hbu-menu-border, rgba(20, 25, 30, .12));
    background: linear-gradient(135deg, var(--a) 0 55%, var(--b) 55%);
  }
  .copy { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .name { font-size: 13px; line-height: 1.3; }
  .hint { font-size: 11px; line-height: 1.3; color: var(--hbu-menu-muted, #6b7280); }
  .check { margin-left: auto; font-size: 12px; color: var(--heybox-up-accent, #6f8db3); opacity: 0; }
  .item[aria-checked="true"] .check { opacity: 1; }
  .sep { height: 1px; margin: 6px 4px; background: var(--hbu-menu-border, rgba(20, 25, 30, .12)); }
  .field { padding: 2px 8px 6px; }
  .field + .field { padding-top: 0; }
  .field-label { padding: 0 2px 6px; font-size: 11px; letter-spacing: .08em; color: var(--hbu-menu-muted, #6b7280); }
  .field-row { display: flex; gap: 6px; align-items: center; }
  .number {
    width: 76px; height: 28px; padding: 0 8px; border: 1px solid var(--hbu-menu-border, rgba(20, 25, 30, .12));
    border-radius: 7px; outline: none; background: transparent; color: inherit;
    font: inherit; font-size: 12px; font-variant-numeric: tabular-nums;
  }
  .number:focus { border-color: var(--heybox-up-accent, #6f8db3); }
  .unit { font-size: 11px; color: var(--hbu-menu-muted, #6b7280); }
  .chips { display: flex; gap: 4px; }
  .chip {
    flex: 1 1 0; min-width: 0; padding: 5px 0; border: 1px solid var(--hbu-menu-border, rgba(20, 25, 30, .12));
    border-radius: 7px; background: transparent; color: inherit; font: inherit; font-size: 12px;
    font-variant-numeric: tabular-nums; text-align: center; cursor: pointer;
    transition: color .14s ease, border-color .14s ease, background .14s ease;
  }
  .chip:hover { background: var(--hbu-menu-hover, rgba(20, 25, 30, .06)); }
  .chip:focus-visible { outline: 2px solid var(--heybox-up-accent, #6f8db3); outline-offset: 1px; }
  .chip[aria-checked="true"] {
    border-color: var(--heybox-up-accent, #6f8db3);
    color: var(--heybox-up-accent, #6f8db3);
    background: var(--hbu-menu-hover, rgba(20, 25, 30, .06));
  }
  .item.toggle[aria-checked="true"] { background: transparent; }
  .switch {
    position: relative; flex: none; margin-left: auto; width: 30px; height: 16px; border-radius: 999px;
    border: 1px solid var(--hbu-menu-border, rgba(20, 25, 30, .12));
    background: var(--hbu-menu-hover, rgba(20, 25, 30, .06));
    transition: border-color .15s ease;
  }
  .switch::after {
    content: ""; position: absolute; top: 1px; left: 2px; width: 12px; height: 12px; border-radius: 50%;
    background: var(--hbu-menu-muted, #6b7280);
    transition: transform .15s ease, background .15s ease;
  }
  .item[aria-checked="true"] .switch { border-color: var(--heybox-up-accent, #6f8db3); }
  .item[aria-checked="true"] .switch::after { transform: translateX(13px); background: var(--heybox-up-accent, #6f8db3); }
`;

export const THEME_ICONS: Record<string, string> = {
  system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/></svg>',
  oled: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 1.5"/></svg>',
  light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  paper: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>',
  mist: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h16M4 13h12M4 17h8"/><path d="M17.5 12.5c1.2 1.4 1.8 2.4 1.8 3.2a1.8 1.8 0 0 1-3.6 0c0-.8.6-1.8 1.8-3.2Z"/></svg>',
};

export const SETTINGS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3.1"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 8.9 4.6h.08A1.7 1.7 0 0 0 10 3.04V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 8.9v.08A1.7 1.7 0 0 0 20.96 10H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z"/></svg>';

export function ensureThemeStyle(): void {
  ensureStyleElement("heybox-up-theme-style", THEME_CSS, true);
}

export function updateThemeEntry(): void {
  if (!themeEntry) return;
  const preset = getThemePreset(currentThemeMode);
  themeEntry.button.innerHTML = THEME_ICONS[currentThemeMode];
  themeEntry.button.title = "主题：" + preset.label + "（点击选择）";
  themeEntry.button.setAttribute("aria-label", "主题：" + preset.label + "，点击选择");
  themeEntry.button.setAttribute("aria-expanded", String(!themeEntry.menu.hidden));
  themeEntry.settingsButton.setAttribute("aria-expanded", String(!themeEntry.settingsMenu.hidden));
  for (const item of themeEntry.items) {
    item.node.setAttribute("aria-checked", String(item.id === currentThemeMode));
  }
  if (previewToggle) previewToggle.setAttribute("aria-checked", String(readCommentPreviewPreference()));
  if (navMotionToggle) navMotionToggle.setAttribute("aria-checked", String(readNavMotionPreference()));
  if (readerToggle) readerToggle.setAttribute("aria-checked", String(readReaderPreference()));
  syncFeedWidthControls(readFeedWidth());
  syncNumberInput(readerLineHeightInput, readReaderLineHeight());
}

export function applyTheme(mode: string, persist: boolean): void {
  currentThemeMode = normalizeThemeMode(mode);
  const effective = resolveTheme(currentThemeMode, THEME_MEDIA.matches);
  const preset = getThemePreset(effective);
  const root = document.documentElement;
  root.classList.add(THEME_CLASS);
  root.setAttribute(THEME_ATTR, effective);
  root.setAttribute("data-heybox-up-dark", String(preset.dark === true));
  root.style.colorScheme = preset.dark === true ? "dark" : "light";
  ensureThemeStyle();
  if (persist) writeThemeMode(currentThemeMode);
  updateThemeEntry();
  if (preset.dark === true) scheduleDarkSweep(true);
  else clearDarkSweep();
}

export function createThemeEntry(): void {
  const host = document.createElement("span");
  host.id = THEME_ENTRY_ID;
  host.className = "heybox-up-theme-entry";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = THEME_ENTRY_CSS;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button";
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");
  const settingsButton = document.createElement("button");
  settingsButton.type = "button";
  settingsButton.className = "button";
  settingsButton.setAttribute("aria-haspopup", "menu");
  settingsButton.setAttribute("aria-expanded", "false");
  settingsButton.setAttribute("aria-label", "打开设置");
  settingsButton.title = "设置";
  settingsButton.innerHTML = SETTINGS_ICON;
  const menu = document.createElement("div");
  menu.className = "menu theme-menu";
  menu.hidden = true;
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "主题预设");
  menu.append(createThemeMenuTitle());
  const settingsMenu = document.createElement("div");
  settingsMenu.className = "menu settings-menu";
  settingsMenu.hidden = true;
  settingsMenu.setAttribute("role", "menu");
  settingsMenu.setAttribute("aria-label", "设置");
  settingsMenu.append(createSettingsMenuTitle());
  const items = THEME_PRESETS.map((preset) => {
    const node = document.createElement("button");
    node.type = "button";
    node.className = "item";
    node.dataset["theme"] = preset.id;
    node.setAttribute("role", "menuitemradio");
    node.setAttribute("aria-checked", "false");
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.setProperty("--a", preset.swatch[0]);
    swatch.style.setProperty("--b", preset.swatch[1]);
    const copy = document.createElement("span");
    copy.className = "copy";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = preset.label;
    const hint = document.createElement("span");
    hint.className = "hint";
    hint.textContent = preset.hint;
    copy.append(name, hint);
    const check = document.createElement("span");
    check.className = "check";
    check.textContent = "✓";
    node.append(swatch, copy, check);
    node.addEventListener("click", () => { applyTheme(preset.id, true); closeThemeMenu(); button.focus(); });
    return { id: preset.id, node };
  });
  menu.append(...items.map((item) => item.node));
  settingsMenu.append(
    createCommentPreviewToggle(),
    createNavMotionToggle(),
    createReaderToggle(),
    createReaderLineHeightControl(),
    createThemeMenuSeparator(),
    createFeedWidthControl()
  );

  const closeThemeMenu = () => {
    if (menu.hidden) return;
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
    updateThemeEntry();
  };
  const closeSettingsMenu = () => {
    if (settingsMenu.hidden) return;
    settingsMenu.hidden = true;
    settingsButton.setAttribute("aria-expanded", "false");
    updateThemeEntry();
  };
  button.addEventListener("click", () => {
    closeSettingsMenu();
    menu.hidden = !menu.hidden;
    button.setAttribute("aria-expanded", String(!menu.hidden));
    updateThemeEntry();
  });
  settingsButton.addEventListener("click", () => {
    closeThemeMenu();
    settingsMenu.hidden = !settingsMenu.hidden;
    settingsButton.setAttribute("aria-expanded", String(!settingsMenu.hidden));
    updateThemeEntry();
  });
  document.addEventListener("click", (event) => {
    if ((menu.hidden && settingsMenu.hidden) || event.composedPath().includes(host)) return;
    closeThemeMenu();
    closeSettingsMenu();
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || (menu.hidden && settingsMenu.hidden)) return;
    event.preventDefault();
    const returnTarget = settingsMenu.hidden ? button : settingsButton;
    closeThemeMenu();
    closeSettingsMenu();
    returnTarget.focus();
  });

  shadow.append(style, button, settingsButton, menu, settingsMenu);
  themeEntry = { host, button, menu, items, settingsButton, settingsMenu };
  updateThemeEntry();
}

export function createThemeMenuTitle(): HTMLDivElement {
  const title = document.createElement("div");
  title.className = "menu-title";
  title.textContent = "主题预设";
  return title;
}

export function createSettingsMenuTitle(): HTMLDivElement {
  const title = document.createElement("div");
  title.className = "menu-title";
  title.textContent = "设置";
  return title;
}

export function createThemeMenuSeparator(): HTMLDivElement {
  const line = document.createElement("div");
  line.className = "sep";
  line.setAttribute("role", "separator");
  return line;
}

export function createCommentPreviewToggle(): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = "item toggle";
  node.setAttribute("role", "menuitemcheckbox");
  node.setAttribute("aria-checked", String(readCommentPreviewPreference()));
  const copy = document.createElement("span");
  copy.className = "copy";
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = "首页评论预览";
  const hint = document.createElement("span");
  hint.className = "hint";
  hint.textContent = "信息流右侧直接看评论";
  copy.append(name, hint);
  const toggle = document.createElement("span");
  toggle.className = "switch";
  node.append(copy, toggle);
  node.addEventListener("click", () => {
    const next = !(node.getAttribute("aria-checked") === "true");
    node.setAttribute("aria-checked", String(next));
    setCommentPreviewPreference(next);
  });
  previewToggle = node;
  return node;
}

export function createNavMotionToggle(): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = "item toggle";
  node.setAttribute("role", "menuitemcheckbox");
  node.setAttribute("aria-checked", String(readNavMotionPreference()));
  const copy = document.createElement("span");
  copy.className = "copy";
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = "动态导航图标";
  const hint = document.createElement("span");
  hint.className = "hint";
  hint.textContent = "悬停时播放轻量动画";
  copy.append(name, hint);
  const toggle = document.createElement("span");
  toggle.className = "switch";
  node.append(copy, toggle);
  node.addEventListener("click", () => {
    const next = !(node.getAttribute("aria-checked") === "true");
    node.setAttribute("aria-checked", String(next));
    setNavMotionPreference(next);
  });
  navMotionToggle = node;
  return node;
}

export function createReaderToggle(): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = "item toggle";
  node.setAttribute("role", "menuitemcheckbox");
  node.setAttribute("aria-checked", String(readReaderPreference()));
  const copy = document.createElement("span");
  copy.className = "copy";
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = "沉浸阅读";
  const hint = document.createElement("span");
  hint.className = "hint";
  hint.textContent = "帖子页全屏沉浸阅读，评论收进侧栏";
  copy.append(name, hint);
  const toggle = document.createElement("span");
  toggle.className = "switch";
  node.append(copy, toggle);
  node.addEventListener("click", () => {
    const next = !(node.getAttribute("aria-checked") === "true");
    node.setAttribute("aria-checked", String(next));
    setReaderPreference(next);
  });
  readerToggle = node;
  return node;
}

export const FEED_WIDTH_STEPS: number[] = [40, 48, 56, 64, 72];

export function inputRootActiveElement(input: HTMLElement): Element | null {
  const root = input.getRootNode();
  return root instanceof ShadowRoot ? root.activeElement : document.activeElement;
}

export function syncNumberInput(input: HTMLInputElement | null, value: number): void {
  if (input === null) return;
  // Never overwrite the draft the user is still typing into a focused input.
  if (inputRootActiveElement(input) === input) return;
  input.value = String(value);
}

export function bindNumberInput(input: HTMLInputElement, commit: () => void): void {
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    commit();
    input.blur();
  });
  input.addEventListener("change", commit);
  input.addEventListener("blur", commit);
}

export function createReaderLineHeightControl(): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = "field";
  wrap.setAttribute("role", "group");
  wrap.setAttribute("aria-label", "正文行距");
  const label = document.createElement("div");
  label.className = "field-label";
  label.textContent = "正文行距";
  const row = document.createElement("div");
  row.className = "field-row";
  const input = document.createElement("input");
  input.type = "number";
  input.className = "number";
  input.min = String(READER_LINE_HEIGHT_MIN);
  input.max = String(READER_LINE_HEIGHT_MAX);
  input.step = String(READER_LINE_HEIGHT_STEP);
  input.inputMode = "decimal";
  input.value = String(readReaderLineHeight());
  input.setAttribute("aria-label", "正文行距倍数");
  input.title = "正文行距 " + READER_LINE_HEIGHT_MIN + " - " + READER_LINE_HEIGHT_MAX + " 倍";
  const unit = document.createElement("span");
  unit.className = "unit";
  unit.textContent = "倍";
  row.append(input, unit);
  wrap.append(label, row);
  bindNumberInput(input, () => {
    const next = parseReaderLineHeightInput(input.value);
    const value = next === null ? readReaderLineHeight() : setReaderLineHeightPreference(next);
    input.value = String(value);
    updateThemeEntry();
  });
  readerLineHeightInput = input;
  return wrap;
}

export function syncFeedWidthChips(value: number): void {
  for (const chip of feedWidthChips) {
    if (!(chip instanceof HTMLElement)) continue;
    chip.setAttribute("aria-checked", String(Number(chip.dataset["width"]) === value));
  }
}

export function syncFeedWidthControls(value: number): void {
  syncFeedWidthChips(value);
  syncNumberInput(feedWidthInput, value);
}

export function createFeedWidthControl(): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = "field";
  wrap.setAttribute("role", "group");
  wrap.setAttribute("aria-label", "中栏宽度");
  const label = document.createElement("div");
  label.className = "field-label";
  label.textContent = "中栏宽度（占屏幕宽度）";
  const chips = document.createElement("div");
  chips.className = "chips";
  for (const step of FEED_WIDTH_STEPS) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset["width"] = String(step);
    chip.textContent = step + "%";
    chip.title = "中栏占屏幕宽度 " + step + "%";
    chip.setAttribute("role", "menuitemradio");
    chip.setAttribute("aria-checked", "false");
    chip.addEventListener("click", () => {
      const width = setFeedWidthPreference(step);
      syncFeedWidthControls(width);
    });
    chips.append(chip);
  }
  const row = document.createElement("div");
  row.className = "field-row";
  const input = document.createElement("input");
  input.type = "number";
  input.className = "number";
  input.min = String(FEED_WIDTH_MIN);
  input.max = String(FEED_WIDTH_MAX);
  input.step = String(FEED_WIDTH_STEP);
  input.inputMode = "numeric";
  input.value = String(readFeedWidth());
  input.setAttribute("aria-label", "自定义中栏宽度百分比");
  input.title = "自定义中栏宽度 " + FEED_WIDTH_MIN + " - " + FEED_WIDTH_MAX + "%";
  const unit = document.createElement("span");
  unit.className = "unit";
  unit.textContent = "%";
  row.append(input, unit);
  bindNumberInput(input, () => {
    const next = parseFeedWidthInput(input.value);
    const value = next === null ? readFeedWidth() : setFeedWidthPreference(next);
    input.value = String(value);
    syncFeedWidthChips(value);
    updateThemeEntry();
  });
  feedWidthInput = input;
  wrap.append(label, chips, row);
  feedWidthChips = Array.from(chips.children);
  syncFeedWidthControls(readFeedWidth());
  return wrap;
}

export function mountThemeEntry(): void {
  if (!document.body) return;
  if (themeEntry?.host.isConnected && themeEntry.host.parentElement?.classList.contains("nav-actions")) return;
  const actions = document.querySelector(".nav-actions");
  if (!actions) return;
  if (!themeEntry) createThemeEntry();
  const entry = themeEntry;
  if (entry === null) return;
  if (entry.host.parentNode !== actions) {
    const anchor = actions.querySelector(".publish-btn, .login-btn");
    actions.insertBefore(entry.host, anchor);
  }
}

export function watchTheme(): void {
  if (!document.body) return;
  const sync = () => {
    ensureThemeStyle();
    mountThemeEntry();
    scheduleDarkSweep();
  };
  registerPageSync(sync, 400, null, "chrome");
  registerPageSync(() => scheduleDarkSweep(), 600, [PAGE_ROUTE.CREATOR, PAGE_ROUTE.TOPIC]);
  sync();
}

export const DARK_SWEEP_ROOT_SELECTOR =
  "#page-creator-content-management, #page-creator-content-management-detail, #page-topic-link";

export const DARK_FLAT_CLASS = "heybox-up-dark-flat";

export const DARK_FLAT_SUBTLE_CLASS = "heybox-up-dark-flat-subtle";

export const DARK_EDGE_CLASS = "heybox-up-dark-edge";

export const DARK_INK_CLASS = "heybox-up-dark-ink";

export const DARK_SWEEP_LIMIT = 3000;

export const DARK_SWEEP_SKIP = new Set([
  "IMG", "VIDEO", "CANVAS", "SVG", "PATH", "USE", "IFRAME",
  "INPUT", "TEXTAREA", "SELECT", "OPTION", "SCRIPT", "STYLE", "LINK",
]);

export const RGB_COLOR = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/;

export let darkSweepTimer: number = 0;

export let darkSweepIdleHandle: number = 0;

export let darkSweepLastRun: number = 0;

export interface RgbColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseRgbColor(value: string | null | undefined): RgbColor | null {
  const match = RGB_COLOR.exec(value || "");
  if (match === null) return null;
  return {
    r: Number(match[1] ?? 0),
    g: Number(match[2] ?? 0),
    b: Number(match[3] ?? 0),
    a: match[4] === undefined ? 1 : Number(match[4]),
  };
}

export function isNearWhite(color: RgbColor | null, min: number): boolean {
  return color !== null && color.a >= 0.6 && (color.r + color.g + color.b) / 3 >= min;
}

export function hasOwnText(node: Element): boolean {
  for (const child of node.childNodes) {
    const text = child.nodeValue;
    if (child.nodeType === 3 && text !== null && text.trim() !== "") return true;
  }
  return false;
}

export function clearDarkSweep(): void {
  if (darkSweepTimer !== 0) {
    window.clearTimeout(darkSweepTimer);
    darkSweepTimer = 0;
  }
  if (darkSweepIdleHandle !== 0 && typeof window.cancelIdleCallback === "function") {
    window.cancelIdleCallback(darkSweepIdleHandle);
    darkSweepIdleHandle = 0;
  }
  const selector = "." + DARK_FLAT_CLASS + ", ." + DARK_FLAT_SUBTLE_CLASS + ", ." + DARK_EDGE_CLASS + ", ." + DARK_INK_CLASS;
  for (const node of document.querySelectorAll(selector)) {
    node.classList.remove(DARK_FLAT_CLASS, DARK_FLAT_SUBTLE_CLASS, DARK_EDGE_CLASS, DARK_INK_CLASS);
  }
}

export function sweepDarkSurfaces(): void {
  if (document.documentElement.getAttribute("data-heybox-up-dark") !== "true") {
    clearDarkSweep();
    return;
  }
  const roots = document.querySelectorAll(DARK_SWEEP_ROOT_SELECTOR);
  if (roots.length === 0) return;
  const styleCache = new WeakMap<HTMLElement, CSSStyleDeclaration>();
  const flatCache = new WeakMap<HTMLElement, boolean>();
  const readStyle = (node: HTMLElement): CSSStyleDeclaration => {
    let style = styleCache.get(node);
    if (style === undefined) {
      style = getComputedStyle(node);
      styleCache.set(node, style);
    }
    return style;
  };
  // Cache opaque/flat ancestor state within one sweep instead of forcing style reads at every depth.
  const hasFlatBackground = (node: HTMLElement): boolean => {
    const path: HTMLElement[] = [];
    let element: HTMLElement | null = node;
    while (element !== null) {
      if (element.classList.contains(DARK_FLAT_CLASS) || element.classList.contains(DARK_FLAT_SUBTLE_CLASS)) {
        for (const item of path) flatCache.set(item, true);
        return true;
      }
      const known = flatCache.get(element);
      if (known !== undefined) {
        for (const item of path) flatCache.set(item, known);
        return known;
      }
      path.push(element);
      const color = parseRgbColor(readStyle(element).backgroundColor);
      if (color !== null && color.a >= 0.6) {
        for (const item of path) flatCache.set(item, false);
        return false;
      }
      element = element.parentElement;
    }
    for (const item of path) flatCache.set(item, false);
    return false;
  };
  for (const root of roots) {
    const nodes = root.querySelectorAll("*");
    const total = Math.min(nodes.length, DARK_SWEEP_LIMIT);
    for (let index = 0; index < total; index += 1) {
      const node = nodes[index];
      if (!(node instanceof HTMLElement)) continue;
      if (DARK_SWEEP_SKIP.has(node.tagName) || node.id.startsWith("heybox-up")) continue;
      const style = readStyle(node);
      if (!node.classList.contains(DARK_FLAT_CLASS) && !node.classList.contains(DARK_FLAT_SUBTLE_CLASS)) {
        if (style.backgroundImage === "none") {
          const bg = parseRgbColor(style.backgroundColor);
          if (isNearWhite(bg, 240)) {
            node.classList.add(isNearWhite(bg, 250) ? DARK_FLAT_CLASS : DARK_FLAT_SUBTLE_CLASS);
            flatCache.set(node, true);
          }
        }
      }
      if (!node.classList.contains(DARK_EDGE_CLASS) && styleHasBrightEdge(style)) {
        node.classList.add(DARK_EDGE_CLASS);
      }
      if (!node.classList.contains(DARK_INK_CLASS) && hasOwnText(node)) {
        const ink = parseRgbColor(style.color);
        if (ink !== null && (ink.r + ink.g + ink.b) / 3 < 120 && hasFlatBackground(node)) {
          node.classList.add(DARK_INK_CLASS);
        }
      }
    }
  }
}

export function styleHasBrightEdge(style: CSSStyleDeclaration): boolean {
  if (style.borderStyle === "none" || style.borderStyle === "") return false;
  if (style.borderTopWidth === "0px" && style.borderRightWidth === "0px"
    && style.borderBottomWidth === "0px" && style.borderLeftWidth === "0px") return false;
  return isNearWhite(parseRgbColor(style.borderTopColor), 240)
    || isNearWhite(parseRgbColor(style.borderRightColor), 240)
    || isNearWhite(parseRgbColor(style.borderBottomColor), 240)
    || isNearWhite(parseRgbColor(style.borderLeftColor), 240);
}

export function scheduleDarkSweep(force: boolean = false): void {
  if (document.documentElement.getAttribute("data-heybox-up-dark") !== "true") return;
  if (document.querySelector(DARK_SWEEP_ROOT_SELECTOR) === null) return;
  if (darkSweepTimer !== 0 || darkSweepIdleHandle !== 0) {
    if (!force) return;
    window.clearTimeout(darkSweepTimer);
    darkSweepTimer = 0;
    if (darkSweepIdleHandle !== 0 && typeof window.cancelIdleCallback === "function") {
      window.cancelIdleCallback(darkSweepIdleHandle);
      darkSweepIdleHandle = 0;
    }
  }
  const elapsed = performance.now() - darkSweepLastRun;
  const delay = force ? 350 : Math.max(350, 1200 - elapsed);
  darkSweepTimer = window.setTimeout(() => {
    darkSweepTimer = 0;
    darkSweepLastRun = performance.now();
    if (typeof window.requestIdleCallback === "function") {
      darkSweepIdleHandle = window.requestIdleCallback(() => {
        darkSweepIdleHandle = 0;
        sweepDarkSurfaces();
      }, { timeout: 1000 });
    } else {
      sweepDarkSurfaces();
    }
  }, delay);
}
