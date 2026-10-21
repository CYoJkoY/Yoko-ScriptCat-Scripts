// ==UserScript==
// @name         HeyBox Up
// @namespace    https://cyojkoy.github.io/Payment/
// @version      0.1.11
// @description  补全小黑盒网页收藏：网页收藏列表不显示“插眼”(CY)，本脚本单独拉取 CY 列表，在收藏页（/app/user/favour/content）把 CY 条目补进收藏列表末尾，按帖子去重，结果缓存 10 分钟。社区首页（/app/bbs/home）隐藏右栏热门社区等冗余模块；帖子详情页（/app/bbs/link/*）把站点原生评论区停靠到右栏，保留原生回复与点赞，并补充默认/时间/点赞/作者排序，窄屏自动改为上下布局。另提供跟随系统、夜航、纯黑、浅色、纸页、雾青六套主题预设，在导航栏一键切换。需要登录小黑盒：脚本以浏览器内已有登录态请求小黑盒自己的插眼收藏接口（含本地计算的请求签名），只读取当前账号的数据；偏好与缓存仅写入本机 localStorage，不上传、不修改账号数据、不改动站点收藏总数。
// @author       Yoko
// @homepageURL  https://github.com/CYoJkoY/Yoko-ScriptCat-Scripts/blob/main/docs/heybox-up.md
// @supportURL   https://github.com/CYoJkoY/Yoko-ScriptCat-Scripts/issues
// @icon         data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2032%2032'%3E%3Crect%20width='32'%20height='32'%20rx='8'%20fill='%23232b36'/%3E%3Cpath%20d='M9%207.5h14a2.5%202.5%200%200%201%202.5%202.5v12a2.5%202.5%200%200%201-2.5%202.5H9A2.5%202.5%200%200%201%206.5%2022V10A2.5%202.5%200%200%201%209%207.5Z'%20fill='none'%20stroke='%238aa7c4'%20stroke-width='1.6'/%3E%3Cpath%20d='M10.5%2016c1.2-2.1%203.1-3.2%205.5-3.2s4.3%201.1%205.5%203.2c-1.2%202.1-3.1%203.2-5.5%203.2S11.7%2018.1%2010.5%2016Z'%20fill='%23a9c0d8'/%3E%3Ccircle%20cx='16'%20cy='16'%20r='1.7'%20fill='%23232b36'/%3E%3C/svg%3E
// @updateURL    https://cdn.jsdelivr.net/gh/CYoJkoY/Yoko-ScriptCat-Scripts@main/scripts/heybox-up.js
// @downloadURL  https://ghfast.top/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/main/scripts/heybox-up.js
// @match        https://www.xiaoheihe.cn/*
// @match        https://xiaoheihe.cn/*
// @run-at       document-start
// @grant        none
// @noframes
// @license      MIT
// ==/UserScript==

(function () {
  "use strict";

  const CY_API_PATH = "/bbs/app/profile/bbs/comment/list";
  const CY_PAGE_SIZE = 20;
  const CY_MAX_ITEMS = 200;
  const CACHE_TTL_MS = 10 * 60 * 1000;
  const CACHE_KEY_PREFIX = "heybox-up.cy.v1:";
  const LINK_HREF_PREFIX = "/app/bbs/link/";

  const THEME_CLASS = "heybox-up-theme";
  const THEME_ATTR = "data-heybox-up-theme";
  const THEME_STORAGE_KEY = "heybox-up.theme.v1";
  const THEME_ENTRY_ID = "heybox-up-theme-entry";
  const THEME_MEDIA = window.matchMedia("(prefers-color-scheme: dark)");

  // ==theme-core:start==
  const THEME_PRESETS = [
    { id: "system", label: "跟随系统", hint: "随系统深浅切换", dark: null, icon: "system", swatch: ["#f5f7f9", "#1b2430"] },
    { id: "dark", label: "夜航", hint: "冷灰深色，细边框", dark: true, icon: "dark", swatch: ["#0f1419", "#8fb0cf"] },
    { id: "oled", label: "纯黑", hint: "纯黑底，低圆角", dark: true, icon: "oled", swatch: ["#000000", "#a8c0d8"] },
    { id: "light", label: "浅色", hint: "站点原色", dark: false, icon: "light", swatch: ["#ffffff", "#eef1f4"] },
    { id: "paper", label: "纸页", hint: "暖纸底，衬线标题", dark: false, icon: "paper", swatch: ["#f4efe4", "#8a6f4e"] },
    { id: "mist", label: "雾青", hint: "冷雾底，大圆角", dark: false, icon: "mist", swatch: ["#eef3f5", "#4f7f8a"] },
  ];
  const THEME_IDS = THEME_PRESETS.map((preset) => preset.id);

  function getThemePreset(id) {
    return THEME_PRESETS.find((preset) => preset.id === id) || THEME_PRESETS[0];
  }

  function normalizeThemeMode(value) {
    return THEME_IDS.includes(value) ? value : "system";
  }

  function resolveTheme(mode, systemDark) {
    return mode === "system" ? (systemDark ? "dark" : "light") : getThemePreset(mode).id;
  }
  // ==theme-core:end==

  let currentThemeMode = "system";
  let themeEntry = null;

  function readThemeMode() {
    try {
      return normalizeThemeMode(localStorage.getItem(THEME_STORAGE_KEY));
    } catch (error) {
      console.warn("[HeyBox Up] 读取主题设置失败", error);
      return "system";
    }
  }

  function writeThemeMode(mode) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch (error) {
      console.warn("[HeyBox Up] 保存主题设置失败", error);
    }
  }

  const THEME_CSS = `
    :root.heybox-up-theme {
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
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#page-bbs-community, #page-bbs-link, .page-bbs-community, .page-bbs-link) {
      background-color: var(--heybox-up-bg) !important;
      color: var(--heybox-up-text);
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
    :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.bbs-content__title, .bbs-content__content, .post__title, .post__content, .image-text__title, .image-text__content, .comment-item__content, .children-item__comment-content, .list-content__username, .comment-item__username, .hot-topic-item__name, .nav-item, .view-header__nav-item, .user-profile-wrapper .name, .bbs-info-item .value, .back-btn__text, .page-header__username, .link-user__username, .section-title__content, .content-tag-text, .slide-tab__tab-label, .slide-tab__tab-cnt, .info-box__username, .hb-editor, .message-list-item__title, .comment-message-item__username, .comment-message-item__text, .message-content-preview__reply-text, .message-content-preview__text, .creator-content-item__title, .editor__more-info-title, .creator-editor__form-label, .frame-top-title, .bbs-link-section-title-text, .user-favour__title) {
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
    :root.heybox-up-theme[data-heybox-up-theme="paper"] :is(.post__title, .image-text__title, .bbs-content__title, .bbs-link-section-title-text, .user-favour__title, .related-recommend__container--header) {
      font-family: Georgia, "Songti SC", "Noto Serif CJK SC", serif;
      letter-spacing: .01em;
    }
    :root.heybox-up-theme[data-heybox-up-theme="paper"] :is(.post__content, .image-text__content) a {
      color: var(--heybox-up-accent);
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    /* 宽屏布局：放宽站点 1300/1032px 两级容器，社区信息流解除 660px 限制。 */
    @media (min-width: 1200px) {
      #app > main {
        max-width: 1600px !important;
        padding-left: 24px !important;
        padding-right: 24px !important;
      }
      #app > main > section,
      #app > main > .layout-normal {
        max-width: 100% !important;
      }
      #page-bbs-community main.list {
        max-width: none !important;
      }
    }
    /* 社区首页：右栏热门社区与二维码等冗余模块整体移除，信息流占满宽度。 */
    #page-bbs-community .cpt-right-side.right {
      display: none !important;
    }
    #page-bbs-community .content {
      width: auto !important;
      max-width: min(1500px, calc(100vw - 48px)) !important;
      margin: 0 auto !important;
    }
    #page-bbs-community main.list,
    #page-bbs-community .hb-bbs-home,
    #page-bbs-community .bbs-home__content-list {
      width: auto !important;
      max-width: none !important;
      flex: 1 1 auto !important;
      min-width: 0;
    }
    /* 评论排序只改 order，不动 DOM，避免打断站点自身的列表更新。 */
    #page-bbs-link .link-comment__list {
      display: flex !important;
      flex-direction: column;
    }
    /* 帖子详情：正文左栏，原生评论区在内容容器内改为右栏，避免搬动节点丢失站点样式。 */
    @media (min-width: 1200px) {
      #page-bbs-link .content {
        width: auto !important;
        max-width: min(1600px, calc(100vw - 48px)) !important;
        margin: 0 auto !important;
        gap: 24px;
        align-items: flex-start;
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
        grid-template-columns: minmax(0, 1fr) 400px;
        gap: 24px;
        align-items: start;
        width: auto !important;
        max-width: none !important;
      }
      #page-bbs-link .hb-bbs-image-text {
        grid-column: 1;
        min-width: 0;
      }
      #page-bbs-link .link-comment {
        grid-column: 2;
        position: sticky;
        top: 88px;
        max-height: calc(100vh - 104px);
        overflow: auto;
        width: 100% !important;
        margin: 0 !important;
      }
      #page-bbs-link .link-comment .comment__comment-header {
        top: 0 !important;
      }
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
  `;

  const COMMENT_SORTS = [
    { id: "default", label: "默认" },
    { id: "time", label: "时间" },
    { id: "likes", label: "点赞" },
    { id: "author", label: "作者" },
  ];

  const COMMENT_SORT_HOST_ID = "heybox-up-comment-sort";

  const COMMENT_SORT_CSS = `
    :host { display: block; margin: 0 0 8px; }
    .bar { display: flex; align-items: center; gap: 4px; font: 12px/1.4 system-ui, sans-serif; }
    .label { margin-right: 4px; color: var(--heybox-up-muted, #6b7280); }
    button {
      padding: 2px 8px; border: 1px solid transparent; border-radius: 999px;
      background: transparent; color: var(--heybox-up-muted, #6b7280);
      font: inherit; cursor: pointer;
    }
    button:hover { background: var(--heybox-up-subtle, rgba(20, 25, 30, .06)); color: var(--heybox-up-text, #14191e); }
    button[aria-pressed="true"] {
      border-color: var(--heybox-up-accent, #6f8db3);
      color: var(--heybox-up-accent, #6f8db3);
    }
  `;

  function parseCommentAge(text) {
    const value = text.trim();
    if (value === "" || value === "刚刚") return value === "刚刚" ? 0 : Number.POSITIVE_INFINITY;
    if (value === "昨天") return 86400;
    const relative = /^(\d+)\s*(秒|分钟|小时|天)前$/.exec(value);
    if (relative) {
      const unit = { 秒: 1, 分钟: 60, 小时: 3600, 天: 86400 }[relative[2]];
      return Number(relative[1]) * unit;
    }
    const parsed = Date.parse(value.replace(/-/g, "/"));
    return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : (Date.now() - parsed) / 1000;
  }

  function applyCommentSort(tree, mode) {
    const list = tree.querySelector(".link-comment__list");
    if (!list) return;
    const items = Array.from(list.children).filter((node) => node.classList.contains("link-comment__comment-item"));
    if (mode === "default") {
      for (const item of items) item.style.order = "";
      return;
    }
    const authorName = (document.querySelector("#page-bbs-link .link-user__username")?.textContent || "").trim();
    const keyed = items.map((item, index) => {
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

  function createCommentSort(tree, mode = "default") {
    const host = document.createElement("div");
    host.id = COMMENT_SORT_HOST_ID;
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = COMMENT_SORT_CSS;
    const bar = document.createElement("div");
    bar.className = "bar";
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = "排序";
    bar.append(label);
    let current = mode;
    const buttons = COMMENT_SORTS.map((sort) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = sort.label;
      button.dataset.sort = sort.id;
      button.setAttribute("aria-pressed", String(sort.id === current));
      button.addEventListener("click", () => {
        current = sort.id;
        for (const node of buttons) node.setAttribute("aria-pressed", String(node.dataset.sort === current));
        applyCommentSort(tree, current);
      });
      bar.append(button);
      return button;
    });
    shadow.append(style, bar);
    tree.prepend(host);
    return host;
  }

  function watchCommentSort() {
    if (!document.body) return;
    let host = null;
    let mode = "default";
    let scheduled = false;

    const sync = () => {
      if (!location.pathname.startsWith(LINK_HREF_PREFIX)) {
        host = null;
        mode = "default";
        return;
      }
      const tree = document.querySelector("#page-bbs-link .link-comment");
      if (!tree) return;
      const active = host?.shadowRoot?.querySelector('button[aria-pressed="true"]');
      if (active) mode = active.dataset.sort || "default";
      if (!host || !host.isConnected || host.parentElement !== tree) {
        host = createCommentSort(tree, mode);
      }
      applyCommentSort(tree, mode);
    };

    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        sync();
      });
    };

    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    sync();
  }

  const THEME_ENTRY_CSS = `
    :host { display: inline-flex; flex: none; position: relative; }
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
  `;

  const THEME_ICONS = {
    system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
    dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/></svg>',
    oled: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 1.5"/></svg>',
    light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    paper: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>',
    mist: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h16M4 13h12M4 17h8"/><path d="M17.5 12.5c1.2 1.4 1.8 2.4 1.8 3.2a1.8 1.8 0 0 1-3.6 0c0-.8.6-1.8 1.8-3.2Z"/></svg>',
  };

  function ensureThemeStyle() {
    let style = document.getElementById("heybox-up-theme-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "heybox-up-theme-style";
      style.textContent = THEME_CSS;
    }
    const parent = document.head || document.documentElement;
    if (!parent) return;
    if (style.parentNode !== parent || parent === document.head && document.head.lastElementChild !== style) {
      parent.append(style);
    }
  }

  function updateThemeEntry() {
    if (!themeEntry) return;
    const preset = getThemePreset(currentThemeMode);
    themeEntry.button.innerHTML = THEME_ICONS[currentThemeMode];
    themeEntry.button.title = "主题：" + preset.label + "（点击选择）";
    themeEntry.button.setAttribute("aria-label", "主题：" + preset.label + "，点击选择");
    themeEntry.button.setAttribute("aria-expanded", String(!themeEntry.menu.hidden));
    for (const item of themeEntry.items) {
      item.node.setAttribute("aria-checked", String(item.id === currentThemeMode));
    }
  }

  function applyTheme(mode, persist) {
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
  }

  function createThemeEntry() {
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
    const menu = document.createElement("div");
    menu.className = "menu";
    menu.hidden = true;
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "主题预设");
    menu.append(createThemeMenuTitle());
    const items = THEME_PRESETS.map((preset) => {
      const node = document.createElement("button");
      node.type = "button";
      node.className = "item";
      node.dataset.theme = preset.id;
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
      node.addEventListener("click", () => { applyTheme(preset.id, true); closeMenu(); button.focus(); });
      return { id: preset.id, node };
    });
    menu.append(...items.map((item) => item.node));

    const closeMenu = () => {
      if (menu.hidden) return;
      menu.hidden = true;
      button.setAttribute("aria-expanded", "false");
      updateThemeEntry();
    };
    button.addEventListener("click", () => {
      menu.hidden = !menu.hidden;
      button.setAttribute("aria-expanded", String(!menu.hidden));
      updateThemeEntry();
    });
    document.addEventListener("click", (event) => {
      if (menu.hidden || event.composedPath().includes(host)) return;
      closeMenu();
    }, true);
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || menu.hidden) return;
      event.preventDefault();
      closeMenu();
      button.focus();
    });

    shadow.append(style, button, menu);
    themeEntry = { host, button, menu, items };
    updateThemeEntry();
  }

  function createThemeMenuTitle() {
    const title = document.createElement("div");
    title.className = "menu-title";
    title.textContent = "主题预设";
    return title;
  }

  function mountThemeEntry() {
    if (!document.body) return;
    const actions = document.querySelector(".nav-actions");
    if (!actions) return;
    if (!themeEntry) createThemeEntry();
    if (themeEntry.host.parentNode !== actions) {
      const anchor = actions.querySelector(".publish-btn, .login-btn");
      actions.insertBefore(themeEntry.host, anchor);
    }
  }

  function watchTheme() {
    if (!document.body) return;
    let scheduled = false;
    const sync = () => {
      ensureThemeStyle();
      mountThemeEntry();
    };
    new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        sync();
      });
    }).observe(document.body, { childList: true, subtree: true });
    sync();
  }

  THEME_MEDIA.addEventListener("change", () => {
    if (currentThemeMode === "system") applyTheme("system", false);
  });
  applyTheme(readThemeMode(), false);

  // ==sign-core:start==
  const SIG_ALPHABET = "AB45STUVWZEFGJ6CH01D237IXYPQRKLMN89";
  const MD5_SHIFTS = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const MD5_TABLE = Array.from({ length: 64 }, (_, index) =>
    Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0
  );

  function toUtf8Bytes(text) {
    const bytes = [];
    for (const char of text) {
      const point = char.codePointAt(0);
      if (point < 0x80) {
        bytes.push(point);
      } else if (point < 0x800) {
        bytes.push(0xc0 | (point >> 6), 0x80 | (point & 0x3f));
      } else if (point < 0x10000) {
        bytes.push(0xe0 | (point >> 12), 0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f));
      } else {
        bytes.push(
          0xf0 | (point >> 18),
          0x80 | ((point >> 12) & 0x3f),
          0x80 | ((point >> 6) & 0x3f),
          0x80 | (point & 0x3f)
        );
      }
    }
    return bytes;
  }

  function rotateLeft(value, shift) {
    return ((value << shift) | (value >>> (32 - shift))) >>> 0;
  }

  function md5Hex(text) {
    const bytes = toUtf8Bytes(text);
    const bitLength = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    const high = Math.floor(bitLength / 0x100000000) >>> 0;
    const low = bitLength >>> 0;
    for (const word of [low, high]) {
      bytes.push(word & 0xff, (word >>> 8) & 0xff, (word >>> 16) & 0xff, (word >>> 24) & 0xff);
    }

    let stateA = 0x67452301;
    let stateB = 0xefcdab89;
    let stateC = 0x98badcfe;
    let stateD = 0x10325476;

    for (let offset = 0; offset < bytes.length; offset += 64) {
      const words = [];
      for (let index = 0; index < 16; index += 1) {
        const base = offset + index * 4;
        words.push(
          (bytes[base] | (bytes[base + 1] << 8) | (bytes[base + 2] << 16) | (bytes[base + 3] << 24)) >>> 0
        );
      }

      let a = stateA;
      let b = stateB;
      let c = stateC;
      let d = stateD;

      for (let index = 0; index < 64; index += 1) {
        let mix;
        let slot;
        if (index < 16) {
          mix = (b & c) | (~b & d);
          slot = index;
        } else if (index < 32) {
          mix = (d & b) | (~d & c);
          slot = (5 * index + 1) % 16;
        } else if (index < 48) {
          mix = b ^ c ^ d;
          slot = (3 * index + 5) % 16;
        } else {
          mix = c ^ (b | ~d);
          slot = (7 * index) % 16;
        }
        const sum = (a + mix + MD5_TABLE[index] + words[slot]) >>> 0;
        a = d;
        d = c;
        c = b;
        b = (b + rotateLeft(sum, MD5_SHIFTS[index])) >>> 0;
      }

      stateA = (stateA + a) >>> 0;
      stateB = (stateB + b) >>> 0;
      stateC = (stateC + c) >>> 0;
      stateD = (stateD + d) >>> 0;
    }

    let hex = "";
    for (const word of [stateA, stateB, stateC, stateD]) {
      for (let index = 0; index < 4; index += 1) {
        hex += ((word >>> (index * 8)) & 0xff).toString(16).padStart(2, "0");
      }
    }
    return hex;
  }

  // endIndex < 0 时取字母表末尾若干位，其余情况用整表。
  function mapByAlphabet(value, endIndex) {
    const source = endIndex < 0 ? SIG_ALPHABET.slice(0, endIndex) : SIG_ALPHABET;
    let mapped = "";
    for (let index = 0; index < value.length; index += 1) {
      mapped += source[value.charCodeAt(index) % source.length];
    }
    return mapped;
  }

  function interleave(parts) {
    const longest = Math.max(...parts.map((part) => part.length));
    let merged = "";
    for (let index = 0; index < longest; index += 1) {
      for (const part of parts) {
        if (index < part.length) merged += part[index];
      }
    }
    return merged;
  }

  function xtime(value) {
    // 不能对左移结果截断：服务端算法保留了高位，截断会算出不同校验位。
    return value & 0x80 ? ((value << 1) ^ 0x1b) & 0xff : value << 1;
  }

  // 就地改写前 4 字节并返回整个数组：服务端求和时把末尾 2 字节也算进去。
  function mixColumns(values) {
    const quartic = (value) => xtime(value) ^ value;
    const r = (value) => quartic(xtime(value));
    const y = (value) => r(quartic(xtime(value)));
    const g = (value) => y(value) ^ r(value) ^ quartic(value);
    const [v0, v1, v2, v3] = values;
    values[0] = g(v0) ^ y(v1) ^ r(v2) ^ quartic(v3);
    values[1] = quartic(v0) ^ g(v1) ^ y(v2) ^ r(v3);
    values[2] = r(v0) ^ quartic(v1) ^ g(v2) ^ y(v3);
    values[3] = y(v0) ^ r(v1) ^ quartic(v2) ^ g(v3);
    return values;
  }

  function createSignature(path, time, nonce) {
    const normalizedPath = "/" + path.split("/").filter(Boolean).join("/") + "/";
    const seed = interleave([
      mapByAlphabet(String(time + 1), -2),
      mapByAlphabet(normalizedPath, 0),
      mapByAlphabet(nonce, 0),
    ]).slice(0, 20);
    const digest = md5Hex(seed);
    const tail = digest.slice(-6).split("").map((char) => char.charCodeAt(0));
    const checksum = String(mixColumns(tail).reduce((total, value) => total + value, 0) % 100).padStart(2, "0");
    return mapByAlphabet(digest.slice(0, 5), -4) + checksum;
  }
  // ==sign-core:end==

  function readCookie(name) {
    const prefix = name + "=";
    for (const part of document.cookie.split(";")) {
      const entry = part.trim();
      if (entry.startsWith(prefix)) return decodeURIComponent(entry.slice(prefix.length));
    }
    return "";
  }

  function getHeyboxId() {
    return readCookie("heybox_id") || readCookie("user_heybox_id");
  }

  function buildCyApiUrl(userId, offset) {
    const time = Math.floor(Date.now() / 1000);
    const nonce = md5Hex(String(time) + String(Math.random())).toUpperCase();
    const hkey = createSignature(CY_API_PATH, time, nonce);
    const query = new URLSearchParams({
      os_type: "web",
      app: "heybox",
      client_type: "web",
      version: "999.0.4",
      web_version: "2.5",
      x_client_type: "web",
      x_app: "heybox_website",
      heybox_id: userId,
      x_os_type: "Windows",
      device_info: "Chrome",
      hkey: hkey,
      _time: String(time),
      nonce: nonce,
      userid: userId,
      only_cy: "1",
      filter_type: "0",
      enable_new_style_collect: "1",
      limit: String(CY_PAGE_SIZE),
      offset: String(offset),
      no_more: "false",
    });
    return "https://api.xiaoheihe.cn" + CY_API_PATH + "?" + query.toString();
  }

  async function fetchCyPage(userId, offset) {
    const response = await fetch(buildCyApiUrl(userId, offset), {
      credentials: "include",
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error("接口返回 HTTP " + response.status);
    const data = await response.json();
    if (data.status !== "ok") throw new Error(data.msg || "接口返回失败状态");
    const list = Array.isArray(data.result) ? data.result : [];
    return { list, noMore: data.no_more === true || list.length === 0 };
  }

  function normalizeCyItem(raw) {
    const link = raw && raw.link;
    if (!link || link.id === undefined || link.id === null) return null;
    const thumbs = Array.isArray(link.thumbs) ? link.thumbs : [];
    return {
      id: String(link.id),
      title: typeof link.title === "string" && link.title.trim() !== "" ? link.title.trim() : "无标题帖子",
      text: typeof raw.text === "string" ? raw.text.trim() : "",
      createAt: Number(raw.create_at) || 0,
      thumb: typeof thumbs[0] === "string" ? thumbs[0] : "",
      kind: raw.comment_type === 1 ? "回复" : "评论",
    };
  }

  async function loadCyFavorites(userId, onProgress) {
    const seen = new Set();
    const items = [];
    let offset = 0;
    for (;;) {
      const page = await fetchCyPage(userId, offset);
      for (const raw of page.list) {
        const item = normalizeCyItem(raw);
        if (item && !seen.has(item.id)) {
          seen.add(item.id);
          items.push(item);
        }
      }
      onProgress(items.length);
      if (page.noMore || items.length >= CY_MAX_ITEMS) break;
      offset += CY_PAGE_SIZE;
      if (offset >= CY_MAX_ITEMS + CY_PAGE_SIZE) break;
    }
    return items.slice(0, CY_MAX_ITEMS);
  }

  function readCache(userId) {
    try {
      const raw = localStorage.getItem(CACHE_KEY_PREFIX + userId);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.items)) return null;
      if (Date.now() - Number(parsed.savedAt) > CACHE_TTL_MS) return null;
      return parsed.items;
    } catch (error) {
      console.warn("[HeyBox Up] 读取缓存失败", error);
      return null;
    }
  }

  function writeCache(userId, items) {
    try {
      localStorage.setItem(CACHE_KEY_PREFIX + userId, JSON.stringify({ savedAt: Date.now(), items: items }));
    } catch (error) {
      console.warn("[HeyBox Up] 写入缓存失败", error);
    }
  }

  function formatTime(value) {
    if (!value) return "";
    const milliseconds = value > 1e12 ? value : value * 1000;
    const date = new Date(milliseconds);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("zh-CN", { hour12: false });
  }

  function createCard(item) {
    const card = document.createElement("a");
    card.className = "card";
    card.href = LINK_HREF_PREFIX + item.id;
    card.target = "_blank";
    card.rel = "noopener noreferrer";

    if (item.thumb !== "") {
      const thumb = document.createElement("img");
      thumb.className = "thumb";
      thumb.src = item.thumb;
      thumb.alt = "";
      thumb.loading = "lazy";
      thumb.referrerPolicy = "no-referrer";
      card.append(thumb);
    }

    const body = document.createElement("div");
    body.className = "body";
    const cardTitle = document.createElement("div");
    cardTitle.className = "card-title";
    cardTitle.textContent = item.title;
    const cardText = document.createElement("div");
    cardText.className = item.text !== "" ? "card-text" : "card-text is-empty";
    if (item.text === "") {
      cardText.textContent = "（无文字内容）";
    } else {
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("class", "card-text-icon");
      icon.setAttribute("viewBox", "0 0 16 16");
      icon.setAttribute("aria-hidden", "true");
      const iconPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      iconPath.setAttribute("fill", "currentColor");
      iconPath.setAttribute("d", "M8 3C4.5 3 1.8 5.5 1 8c.8 2.5 3.5 5 7 5s6.2-2.5 7-5c-.8-2.5-3.5-5-7-5Zm0 8.2A3.2 3.2 0 1 1 8 4.8a3.2 3.2 0 0 1 0 6.4Zm0-1.7a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z");
      icon.append(iconPath);
      const content = document.createElement("span");
      content.className = "card-text-body";
      content.textContent = item.text;
      cardText.append(icon, content);
      cardText.title = item.text;
    }
    const foot = document.createElement("div");
    foot.className = "card-foot";
    const kind = document.createElement("span");
    kind.textContent = "插眼" + item.kind;
    const time = document.createElement("span");
    time.textContent = formatTime(item.createAt);
    foot.append(kind, time);
    body.append(cardTitle, cardText, foot);
    card.append(body);
    return card;
  }

  const FAVOUR_PATH = "/app/user/favour/content";
  const FAVOUR_HOST_ID = "heybox-up-favour";
  // shortcut: 依赖站点类名 .user-favour__list 及其父级 .list，站点改版时需升级。
  const FAVOUR_LIST_SELECTOR = ".user-favour__list";

  const FAVOUR_CSS = `
    :host { display: block; font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; }
    .section { padding: 14px 8px 4px; }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
    .heading { font-size: 14px; font-weight: 700; }
    .refresh, .retry {
      font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 8px;
      border: 1px solid rgba(127,127,127,.32); background: transparent; color: inherit; cursor: pointer;
    }
    .refresh:hover:not(:disabled), .retry:hover { border-color: rgba(127,127,127,.55); }
    .refresh:disabled { opacity: .5; cursor: default; }
    .retry { margin: -2px 0 10px; }
    .note { font-size: 12px; opacity: .62; margin-bottom: 10px; }
    .search {
      width: 100%; box-sizing: border-box; margin-bottom: 10px; padding: 7px 10px;
      border-radius: 8px; border: 1px solid rgba(127,127,127,.28);
      background: rgba(127,127,127,.08); color: inherit; font: inherit; font-size: 13px;
    }
    .search:focus { outline: none; border-color: #6f8db3; }
    .card {
      display: flex; gap: 10px; padding: 10px; margin-bottom: 8px;
      border-radius: 12px; text-decoration: none; color: inherit;
      border: 1px solid rgba(127,127,127,.22);
    }
    .card:hover { border-color: rgba(127,127,127,.45); }
    .thumb { width: 52px; height: 52px; border-radius: 9px; object-fit: cover; flex: none; background: rgba(127,127,127,.16); }
    .body { min-width: 0; flex: 1; }
    .card-title {
      font-weight: 600; font-size: 13px; margin-bottom: 3px;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .card-text {
      display: flex; gap: 6px; align-items: flex-start; margin-bottom: 6px;
      font-size: 14px; line-height: 1.5; color: inherit;
    }
    .card-text-icon { width: 15px; height: 15px; flex: none; margin-top: 2px; color: #6f8db3; }
    .card-text-body { min-width: 0; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .card-text.is-empty { font-size: 12px; opacity: .55; }
    .card-foot { margin-top: 5px; font-size: 11px; opacity: .6; display: flex; gap: 10px; }
  `;

  function createFavourSection() {
    const host = document.createElement("div");
    host.id = FAVOUR_HOST_ID;
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = FAVOUR_CSS;
    shadow.append(style);

    const section = document.createElement("section");
    section.className = "section";
    const head = document.createElement("div");
    head.className = "head";
    const heading = document.createElement("div");
    heading.className = "heading";
    heading.textContent = "插眼收藏";
    const refresh = document.createElement("button");
    refresh.type = "button";
    refresh.className = "refresh";
    refresh.textContent = "刷新";
    refresh.setAttribute("aria-label", "刷新插眼收藏");
    head.append(heading, refresh);
    const note = document.createElement("div");
    note.className = "note";
    note.textContent = "正在读取插眼收藏…";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "retry";
    retry.textContent = "重试";
    retry.hidden = true;
    const search = document.createElement("input");
    search.type = "search";
    search.className = "search";
    search.placeholder = "搜索标题或插眼内容";
    search.setAttribute("aria-label", "搜索插眼收藏");
    search.hidden = true;
    const list = document.createElement("div");
    list.className = "list";
    section.append(head, note, retry, search, list);
    shadow.append(section);

    const state = { items: [], loading: false, error: "", notice: "", progress: 0, query: "", signature: "" };

    const readPageIds = () => {
      const ids = new Set();
      for (const node of document.querySelectorAll(FAVOUR_LIST_SELECTOR + ' a[href*="/bbs/link/"]')) {
        const match = /\/bbs\/link\/(\d+)/.exec(node.getAttribute("href") || "");
        if (match) ids.add(match[1]);
      }
      return ids;
    };

    const render = () => {
      const pageIds = readPageIds();
      state.signature = Array.from(pageIds).sort().join(",");
      const visible = state.items.filter((item) => !pageIds.has(item.id));
      const query = state.query.trim();
      const needle = query.toLowerCase();
      const matched = needle === ""
        ? visible
        : visible.filter((item) => item.title.toLowerCase().includes(needle) || item.text.toLowerCase().includes(needle));
      list.replaceChildren();
      refresh.disabled = state.loading;
      refresh.textContent = state.loading ? "读取中…" : "刷新";
      retry.hidden = state.error === "";
      search.hidden = state.items.length === 0;
      if (state.error !== "") {
        note.textContent = "读取失败：" + state.error + (state.items.length > 0 ? "（显示上次结果）" : "");
      } else if (state.notice !== "") {
        note.textContent = state.notice;
      } else if (state.loading) {
        note.textContent = "正在读取插眼收藏…" + (state.progress > 0 ? " 已获取 " + state.progress + " 条" : "");
      } else if (state.items.length === 0) {
        note.textContent = "没有插眼收藏。";
      } else if (visible.length === 0) {
        note.textContent = "插眼条目已全部出现在列表中。";
      } else if (matched.length === 0) {
        note.textContent = "没有匹配“" + query + "”的插眼条目。";
      } else {
        note.textContent = "共 " + visible.length + " 条插眼收藏" + (query !== "" ? "，匹配 " + matched.length + " 条" : "") + "，网页收藏列表默认不显示。";
      }
      if (matched.length === 0) return;
      const fragment = document.createDocumentFragment();
      for (const item of matched) fragment.append(createCard(item));
      list.append(fragment);
    };

    const place = () => {
      const listNode = document.querySelector(FAVOUR_LIST_SELECTOR);
      const parent = listNode ? listNode.parentElement : null;
      if (!listNode || !parent) return;
      if (host.parentNode !== parent || host.previousElementSibling !== listNode) {
        parent.insertBefore(host, listNode.nextSibling);
      }
      if (Array.from(readPageIds()).sort().join(",") !== state.signature) render();
    };

    const load = async (force) => {
      if (state.loading) return;
      const userId = getHeyboxId();
      if (userId === "") {
        state.notice = "未登录小黑盒，无法读取插眼收藏。";
        render();
        return;
      }
      state.loading = true;
      state.error = "";
      state.notice = "";
      state.progress = 0;
      render();
      try {
        const cached = force ? null : readCache(userId);
        if (cached) {
          state.items = cached;
          return;
        }
        state.items = await loadCyFavorites(userId, (count) => {
          state.progress = count;
          note.textContent = "正在读取插眼收藏… 已获取 " + count + " 条";
        });
        writeCache(userId, state.items);
      } catch (error) {
        state.error = error instanceof Error ? error.message : String(error);
      } finally {
        state.loading = false;
        render();
      }
    };

    refresh.addEventListener("click", () => void load(true));
    retry.addEventListener("click", () => void load(true));
    search.addEventListener("input", () => {
      state.query = search.value;
      render();
    });

    place();
    void load(false);
    return { host, place };
  }

  function watchFavourPage() {
    if (!document.body) return;
    let section = null;
    let scheduled = false;

    const sync = () => {
      if (location.pathname !== FAVOUR_PATH || getHeyboxId() === "") {
        if (section) {
          section.host.remove();
          section = null;
        }
        return;
      }
      if (!section) section = createFavourSection();
      section.place();
    };

    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        sync();
      });
    };

    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    sync();
  }

  function boot() {
    watchTheme();
    watchCommentSort();
    watchFavourPage();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
