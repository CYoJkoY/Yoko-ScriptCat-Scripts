import { CODE_PREVIEW_HEIGHT, STYLE_ID } from "../config";

/**
 * Gemini keeps every answer block of a conversation in the DOM at once, so the
 * browser lays out and paints thousands of offscreen blocks while a long chat
 * loads, streams, or is switched to. Block level `content-visibility` lets the
 * browser skip that work for blocks outside the viewport. The nodes, their
 * text, selection, and native controls all stay intact.
 *
 * Two generations of markup are covered: the `.markdown` container and the
 * `message-content` custom element. `contain: layout style` keeps a streaming
 * append from invalidating the layout of every sibling block.
 *
 * Only block children and native `code-block` elements are isolated.
 * Isolating a whole turn would clip native popovers, menus, and focus rings
 * that legitimately overflow the turn box.
 */
export const GEMINI_NATIVE_RENDER_CSS = `
    model-response :is(.markdown, message-content, .message-content, .response-content, .md-content, .model-response-text) > * {
      content-visibility: auto !important;
      contain: layout style !important;
      contain-intrinsic-size: auto 3rem !important;
    }

    model-response :is(.markdown, message-content, .message-content, .response-content, .md-content, .model-response-text) > :is(pre, table, blockquote) {
      contain-intrinsic-size: auto 8rem !important;
    }

    model-response :is(.markdown, message-content, .message-content, .response-content, .md-content, .model-response-text) > :is(img, video, canvas, iframe) {
      contain-intrinsic-size: auto 12rem !important;
    }

    model-response code-block {
      content-visibility: auto !important;
      contain: layout style !important;
      contain-intrinsic-size: auto 10rem !important;
    }

    /* Frosted panels blur the page underneath on every repaint. Long answers
       repaint continuously, so the native glass costs more than it shows. */
    :is(top-bar, top-bar-actions, input-area, input-area-v2, side-navigation, chat-window, mat-toolbar, code-block, .top-bar, .input-area, .toolbar) {
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }

    /* Streaming markdown ships decorative transitions and animations that
       restart with every appended token. */
    model-response :is(.markdown, message-content, .message-content, .response-content, .md-content, .model-response-text),
    model-response :is(.markdown, message-content, .message-content, .response-content, .md-content, .model-response-text) * {
      animation: none !important;
      transition: none !important;
      will-change: auto !important;
    }

    /* The history sidebar animates its width, so every frame of that motion
       relayouts the chat column while the panel shadow and glass repaint. Keep
       the native width animation, shorten it, and drop the depth effects that
       only add paint. */
    bard-sidenav,
    bard-sidenav side-navigation,
    side-navigation,
    side-navigation-content,
    sidenav-with-history-container,
    conversations-list {
      box-shadow: none !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }

    bard-sidenav {
      transition-duration: 120ms !important;
      transition-timing-function: cubic-bezier(0.2, 0, 0, 1) !important;
    }

    /* Layout containment keeps an opening list from invalidating siblings
       outside the panel. Render skipping stays off here: an estimated
       contain-intrinsic-size would make the scroll height of the history list
       jump while rows mount. */
    side-navigation-content,
    sidenav-with-history-container,
    conversations-list,
    conversations-list > * {
      contain: layout style !important;
    }
`;

/**
 * Hover peek for a collapsed native navigation rail. The engine only sets an
 * attribute plus two custom properties; the rail keeps its nodes, state, and
 * listeners, so nothing is rebuilt when the pointer arrives or leaves.
 *
 * The shift variable carries a negative margin equal to the width growth. It
 * keeps a static rail from pushing the chat column aside, which is the layout
 * cost that a native expand pays. Site blocks below only re-expose the content
 * that each site removes while collapsed.
 */
export const SIDEBAR_PEEK_CSS = `
    [data-ai-turbo-sidebar-peek] {
      width: var(--ai-turbo-sidebar-peek-width, 248px) !important;
      /* Doubao and Qianwen paint a site header above the rail; a raised
         stacking level lets the peeked rail take the pointer there. */
      z-index: 120 !important;
      /* Only the shadow animates. Width has to stay instant: a width
         transition relayouts the whole chat column on every frame. */
      transition: box-shadow 120ms ease-out !important;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18) !important;
    }

    /* The shadow reads as "this panel is a temporary overlay", but users who
       asked for less motion get the plain instant rail. */
    @media (prefers-reduced-motion: reduce) {
      [data-ai-turbo-sidebar-peek] {
        transition: none !important;
      }
    }

    [data-ai-turbo-sidebar-peek="left"] {
      margin-right: var(--ai-turbo-sidebar-peek-shift, 0px) !important;
    }

    [data-ai-turbo-sidebar-peek="right"] {
      margin-left: var(--ai-turbo-sidebar-peek-shift, 0px) !important;
    }

    /* DeepSeek disables the hidden rail as a whole, so re-enabling only the
       rail box would still leave every entry inert. A rail that peeks is
       meant to be used, so its controls accept presses for that moment. */
    [data-ai-turbo-sidebar-peek],
    [data-ai-turbo-sidebar-peek] * {
      pointer-events: auto !important;
    }

    /* ChatGPT keeps the expanded panel mounted at opacity 0 next to the rail.
       Its inner scroller is lifted by the peek module because that node holds
       an inline hidden-display rule, which a stylesheet cannot beat. */
    aside.app-shell-left-panel[data-ai-turbo-sidebar-peek] #app-shell-sidebar > div:nth-child(2) {
      opacity: 1 !important;
      pointer-events: auto !important;
      transition: none !important;
    }

    /* Qwen hides history rows through visibility on their wrapper levels, so
       every level between the rail and the title has to re-enter. */
    #sidebar.sidebar[data-ai-turbo-sidebar-peek] {
      max-width: var(--ai-turbo-sidebar-peek-width, 240px) !important;
    }

    #sidebar.sidebar[data-ai-turbo-sidebar-peek] :is(.session-list-wrapper, .sidebar-entry-list-content) {
      visibility: visible !important;
      opacity: 1 !important;
      transition: none !important;
    }

    #sidebar.sidebar[data-ai-turbo-sidebar-peek] :is(.sidebar-entry-list-text, .chat-item-title-text, .folder-name) {
      visibility: visible !important;
      opacity: 1 !important;
      transition: none !important;
    }

    /* ChatGLM shrinks every entry to its icon and removes the label box. */
    aside.el-aside.aside-container[data-ai-turbo-sidebar-peek] :is(.aside-subject, .aside-subjects) {
      width: auto !important;
    }

    aside.el-aside.aside-container[data-ai-turbo-sidebar-peek] .subject-text {
      display: flex !important;
      transition: none !important;
    }

    /* Z.ai pins its inner shell to the collapsed width and blurs labels. */
    #sidebar[data-ai-turbo-sidebar-peek] > [role="presentation"] {
      width: var(--ai-turbo-sidebar-peek-width, 238px) !important;
      transition: none !important;
    }

    #sidebar[data-ai-turbo-sidebar-peek] [data-slot="sidebar-label"] {
      max-width: none !important;
      opacity: 1 !important;
      filter: none !important;
      transition: none !important;
    }

    #sidebar[data-ai-turbo-sidebar-peek] [data-testid="sidebar-scroll-region"] {
      opacity: 1 !important;
      transition: none !important;
    }

    #sidebar[data-ai-turbo-sidebar-peek] [role="presentation"] :is(button.w-full, a.w-full) {
      width: 100% !important;
      transition: none !important;
    }

    /* Perplexity clips its nav at the collapsed width inside the spacing
       wrapper, so the wrapper rule alone keeps the labels cut off. */
    div.w-sideBarWidth[data-ai-turbo-sidebar-peek] nav {
      width: var(--ai-turbo-sidebar-peek-width, 240px) !important;
      transition: none !important;
    }

    /* Poe clips each row to its icon button while the rail is narrow, which
       removes the label box from layout. The rows only need their text back;
       the rail width and its negative margin come from the generic rules. */
    aside[class*="SidebarLayout_sidebar"][data-ai-turbo-sidebar-peek] [data-pdl-sidebar-menu-button] {
      gap: 8px !important;
    }

    aside[class*="SidebarLayout_sidebar"][data-ai-turbo-sidebar-peek] [data-pdl-sidebar-menu-button] > span {
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      white-space: nowrap !important;
      overflow: hidden !important;
    }

    bard-sidenav[data-ai-turbo-sidebar-peek] .sidenav-with-history-container.collapsed {
      width: var(--ai-turbo-sidebar-peek-width, 248px) !important;
      transition: none !important;
    }

    /* Gemini renders its history only after the native open control runs; the
       peek presses it and caps the expansion, so the transition has to be off
       for both the collapsed and the opened container. */
    bard-sidenav[data-ai-turbo-sidebar-peek] .sidenav-with-history-container {
      transition: none !important;
    }

    bard-sidenav[data-ai-turbo-sidebar-peek] .sidenav-with-history-container.collapsed :is(.label-and-badge, .title-text) {
      visibility: visible !important;
      opacity: 1 !important;
      transition: none !important;
    }

    /* Gemini hides the whole history scroller while collapsed, so restoring a
       single label is not enough; the list itself has to re-enter the flow. */
    bard-sidenav[data-ai-turbo-sidebar-peek] .sidenav-with-history-container.collapsed infinite-scroller,
    bard-sidenav[data-ai-turbo-sidebar-peek] .sidenav-with-history-container.collapsed infinite-scroller * {
      visibility: visible !important;
      opacity: 1 !important;
    }

    bard-sidenav[data-ai-turbo-sidebar-peek] .sidenav-with-history-container.collapsed mat-nav-list {
      display: flex !important;
      flex-direction: column !important;
      transition: none !important;
    }

    /* Copilot pins the rail width with !important inside its application
       cascade layer, which outranks every unlayered !important declaration.
       Only a layered !important can win, so these rules join the site's first
       layer: foundation already holds that position, so the site's own layer
       order stays exactly as declared whether this sheet is parsed before or
       after the site styles. The rail's own rail-width variable has to move
       as well, otherwise the drawer body keeps the collapsed geometry even
       when the outer box grows. */
    @layer foundation {
      div.fui-NavDrawer[data-ai-turbo-sidebar-peek] {
        --m365-nav-rail-width: var(--ai-turbo-sidebar-peek-width, 256px);
        width: var(--ai-turbo-sidebar-peek-width, 256px) !important;
        min-width: var(--ai-turbo-sidebar-peek-width, 256px) !important;
        max-width: var(--ai-turbo-sidebar-peek-width, 256px) !important;
      }

      div.fui-NavDrawer[data-ai-turbo-sidebar-peek] .fui-NavDrawerBody {
        width: auto !important;
        transition: none !important;
      }

      div.fui-NavDrawer[data-ai-turbo-sidebar-peek] a.fui-NavItem {
        min-width: 0 !important;
        max-width: none !important;
        transition: none !important;
      }
    }

    /* The collapsed drawer removes the label box from layout. */
    div.fui-NavDrawer[data-ai-turbo-sidebar-peek] a.fui-NavItem > span:last-child {
      display: block !important;
      opacity: 1 !important;
      transition: none !important;
    }
`;

const BASE_ENGINE_CSS = `
    .ai-turbo-dehydrated {
      content-visibility: hidden !important;
      contain: layout paint style !important;
      contain-intrinsic-size: auto var(--turbo-cached-h, 120px) !important;
      /* 占位区可点击恢复：用不占地布局的 outline + 斜纹做可见提示 */
      cursor: pointer !important;
      outline: 1px dashed rgba(153, 166, 161, 0.45) !important;
      outline-offset: -1px !important;
      background-image: repeating-linear-gradient(
        45deg,
        rgba(153, 166, 161, 0.06) 0 6px,
        transparent 6px 14px
      ) !important;
    }
    .ai-turbo-dehydrated * {
      pointer-events: none !important;
    }

    .ai-turbo-code-bar {
      box-sizing: border-box !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      min-height: 38px !important;
      padding: 5px 8px 5px 12px !important;
      margin: 14px 0 8px !important;
      background: #111619 !important;
      border: 1px solid rgba(153, 166, 161, 0.16) !important;
      border-radius: 10px !important;
      box-shadow: 0 5px 16px rgba(0, 0, 0, 0.14) !important;
      position: relative !important;
      z-index: 10 !important;
      transition: border-color 0.2s ease, box-shadow 0.2s ease !important;
    }

    .ai-turbo-code-bar-chatgpt {
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
      flex: 0 0 auto !important;
      grid-column: 1 / -1 !important;
      align-self: stretch !important;
    }

    .ai-turbo-code-bar:hover {
      border-color: rgba(101, 210, 164, 0.3) !important;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18) !important;
    }

    .ai-turbo-code-bar-meta {
      display: inline-flex !important;
      align-items: center !important;
      gap: 8px !important;
      min-width: 0 !important;
      overflow: hidden !important;
      font: 11px ui-monospace, SFMono-Regular, Menlo, monospace !important;
    }

    .ai-turbo-code-lang {
      font-weight: 700 !important;
      color: #72d6ab !important;
    }

    .ai-turbo-code-lines {
      color: #94a3b8 !important;
    }

    @keyframes ai-turbo-pulse {
      0% { opacity: 0.45; transform: scale(0.98); }
      50% { opacity: 1; transform: scale(1.02); }
      100% { opacity: 0.45; transform: scale(0.98); }
    }

    .ai-turbo-streaming-badge {
      display: inline-flex !important;
      align-items: center !important;
      gap: 4px !important;
      color: #34d399 !important;
      font-weight: 700 !important;
      animation: ai-turbo-pulse 1.3s infinite ease-in-out !important;
    }

    .ai-turbo-code-bar-actions {
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
      flex: 0 0 auto !important;
    }

    .ai-turbo-code-toggle,
    .ai-turbo-code-copy {
      appearance: none !important;
      background: rgba(255, 255, 255, 0.035) !important;
      border: 1px solid rgba(153, 166, 161, 0.14) !important;
      color: #c9d2ce !important;
      padding: 5px 9px !important;
      border-radius: 7px !important;
      font: 600 10.5px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      cursor: pointer !important;
      transition: all 120ms ease !important;
    }

    .ai-turbo-code-toggle:hover,
    .ai-turbo-code-copy:hover {
      background: rgba(101, 210, 164, 0.08) !important;
      color: #72d6ab !important;
      border-color: rgba(101, 210, 164, 0.28) !important;
    }

    .ai-turbo-code-target {
      display: block !important;
      margin-top: 0 !important;
      border-radius: 10px !important;
    }

    .ai-turbo-code-target.ai-turbo-folded {
      max-height: ${CODE_PREVIEW_HEIGHT}px !important;
      overflow: hidden !important;
      position: relative !important;
    }

    .ai-turbo-code-target.ai-turbo-folded pre,
    .ai-turbo-code-target.ai-turbo-folded code,
    .ai-turbo-code-target.ai-turbo-folded .code-block-decoration + * {
      max-height: ${CODE_PREVIEW_HEIGHT}px !important;
      overflow: hidden !important;
    }

    .ai-turbo-code-target.ai-turbo-folded::after {
      content: "" !important;
      position: absolute !important;
      inset: auto 0 0 0 !important;
      height: 70px !important;
      background: linear-gradient(180deg, rgba(13, 18, 28, 0) 0%, rgba(13, 18, 28, 0.96) 100%) !important;
      pointer-events: none !important;
      z-index: 5 !important;
    }

    .ai-turbo-code-target.ai-turbo-expanded {
      max-height: none !important;
      overflow: visible !important;
    }

    .ai-turbo-code-target.ai-turbo-expanded pre,
    .ai-turbo-code-target.ai-turbo-expanded code,
    .ai-turbo-code-target.ai-turbo-expanded .code-block-decoration + * {
      max-height: none !important;
      overflow: visible !important;
    }

    /* 虚拟文件悬浮托盘样式 */
    .ai-turbo-vf-tray {
      position: fixed !important;
      z-index: 2147483645 !important;
      display: grid !important;
      gap: 7px !important;
      padding: 8px !important;
      box-sizing: border-box !important;
      background: rgba(14, 18, 20, 0.985) !important;
      border: 1px solid rgba(153, 166, 161, 0.19) !important;
      border-left: 2px solid rgba(101, 210, 164, 0.72) !important;
      border-radius: 12px !important;
      box-shadow:
        0 16px 36px rgba(0, 0, 0, 0.28),
        0 4px 10px rgba(0, 0, 0, 0.18) !important;
      color: #e7eeea !important;
      pointer-events: auto !important;
      opacity: 0 !important;
      visibility: hidden !important;
      transform: translateY(3px) !important;
      /* 平滑浮动动画，彻底消除文本框高度变动时的跳闪 */
      transition:
        bottom 120ms cubic-bezier(0.22, 1, 0.36, 1),
        left 120ms cubic-bezier(0.22, 1, 0.36, 1),
        max-height 90ms ease-out,
        opacity 120ms ease,
        transform 120ms ease,
        visibility 120ms ease !important;
      will-change: bottom, left, max-height !important;
    }

    .ai-turbo-vf-tray.is-positioned {
      opacity: 1 !important;
      visibility: visible !important;
      transform: translateY(0) !important;
    }

    .ai-turbo-vf-header {
      min-width: 0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 12px !important;
      padding: 1px 3px 2px !important;
    }

    .ai-turbo-vf-heading {
      min-width: 0 !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
    }

    .ai-turbo-vf-heading-icon {
      width: 20px !important;
      height: 20px !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      color: #72d6ab !important;
      border: 1px solid rgba(101, 210, 164, 0.22) !important;
      border-radius: 6px !important;
      background: rgba(101, 210, 164, 0.07) !important;
    }

    .ai-turbo-vf-heading-title {
      font: 650 11px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      color: #e7eeea !important;
    }

    .ai-turbo-vf-heading-count {
      min-width: 18px !important;
      height: 18px !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 0 5px !important;
      border-radius: 6px !important;
      background: rgba(101, 210, 164, 0.09) !important;
      color: #72d6ab !important;
      font: 700 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace !important;
    }

    .ai-turbo-vf-heading-hint {
      flex: 0 0 auto !important;
      color: #69756f !important;
      font: 9.5px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
    }

    .ai-turbo-vf-header-actions {
      display: inline-flex !important;
      align-items: center !important;
      gap: 8px !important;
      min-width: 0 !important;
    }

    .ai-turbo-vf-convert-composer {
      appearance: none !important;
      -webkit-appearance: none !important;
      flex: 0 0 auto !important;
      padding: 3px 8px !important;
      border: 1px solid rgba(101, 210, 164, 0.28) !important;
      border-radius: 999px !important;
      background: rgba(101, 210, 164, 0.07) !important;
      color: #86d8b4 !important;
      font: 600 10px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      cursor: pointer !important;
    }

    .ai-turbo-vf-convert-composer:hover,
    .ai-turbo-vf-convert-composer:focus-visible {
      border-color: rgba(101, 210, 164, 0.55) !important;
      background: rgba(101, 210, 164, 0.14) !important;
      color: #d8f0e5 !important;
      outline: none !important;
    }

    .ai-turbo-vf-list {
      display: flex !important;
      flex-wrap: wrap !important;
      gap: 6px !important;
      min-width: 0 !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      scrollbar-width: thin !important;
    }

    .ai-turbo-vf-pill {
      min-width: 0 !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 7px !important;
      min-height: 34px !important;
      padding: 5px 7px 5px 8px !important;
      border: 1px solid rgba(153, 166, 161, 0.16) !important;
      border-radius: 9px !important;
      background: rgba(24, 29, 32, 0.96) !important;
      box-sizing: border-box !important;
      transition: background 120ms ease, border-color 120ms ease !important;
    }

    .ai-turbo-vf-pill:hover {
      background: rgba(29, 35, 38, 0.98) !important;
      border-color: rgba(101, 210, 164, 0.27) !important;
    }

    .ai-turbo-vf-file-icon {
      width: 24px !important;
      height: 24px !important;
      flex: 0 0 24px !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      color: #9eaba5 !important;
      background: rgba(255, 255, 255, 0.035) !important;
      border: 1px solid rgba(153, 166, 161, 0.13) !important;
      border-radius: 7px !important;
    }

    .ai-turbo-vf-file-copy {
      min-width: 80px !important;
      max-width: 260px !important;
      display: grid !important;
      gap: 2px !important;
    }

    .ai-turbo-vf-name {
      display: block !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
      color: #e8eeeb !important;
      font: 550 11px/1.25 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
    }

    .ai-turbo-vf-meta {
      display: block !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
      color: #68746f !important;
      font: 9px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace !important;
    }

    .ai-turbo-vf-badge {
      flex: 0 0 auto !important;
      display: inline-flex !important;
      align-items: center !important;
      height: 20px !important;
      padding: 0 6px !important;
      border-radius: 5px !important;
      background: rgba(101, 210, 164, 0.08) !important;
      border: 1px solid rgba(101, 210, 164, 0.14) !important;
      color: #72d6ab !important;
      font: 700 8px/1 ui-monospace, SFMono-Regular, Menlo, monospace !important;
      letter-spacing: 0.04em !important;
    }

    .ai-turbo-vf-actions {
      display: inline-flex !important;
      align-items: center !important;
      gap: 2px !important;
      margin-left: 2px !important;
    }

    .ai-turbo-vf-action {
      width: 26px !important;
      height: 26px !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 0 !important;
      border: 0 !important;
      border-radius: 6px !important;
      background: transparent !important;
      color: #77827d !important;
      cursor: pointer !important;
      transition: background 120ms ease, color 120ms ease !important;
    }

    .ai-turbo-vf-action-label {
      width: auto !important;
      padding: 0 7px !important;
      font: 600 10px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      white-space: nowrap !important;
    }

    .ai-turbo-vf-action-convert:hover {
      color: #86d8b4 !important;
      background: rgba(101, 210, 164, 0.09) !important;
    }

    .ai-turbo-vf-action:hover {
      background: rgba(255, 255, 255, 0.055) !important;
      color: #d8e1dc !important;
    }

    .ai-turbo-vf-action-preview:hover {
      color: #72d6ab !important;
    }

    .ai-turbo-vf-action-delete:hover {
      color: #ef8c8c !important;
      background: rgba(239, 68, 68, 0.08) !important;
    }

    .ai-turbo-chat-capsule {
      appearance: none !important;
      -webkit-appearance: none !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 8px !important;
      min-width: 0 !important;
      padding: 6px 10px 6px 11px !important;
      margin: 0 !important;
      max-width: 100% !important;
      background: #111619 !important;
      border: 1px solid rgba(153, 166, 161, 0.18) !important;
      border-left: 2px solid rgba(101, 210, 164, 0.7) !important;
      border-radius: 10px !important;
      box-shadow: 0 5px 16px rgba(0, 0, 0, 0.16) !important;
      color: #e7eeea !important;
      font: inherit !important;
      text-align: left !important;
      cursor: pointer !important;
      user-select: none !important;
      transition:
        border-color 120ms ease,
        background 120ms ease !important;
    }

    .ai-turbo-chat-capsule-icon {
      flex: 0 0 auto !important;
      display: inline-flex !important;
      color: #72d6ab !important;
    }

    .ai-turbo-chat-capsule-name {
      min-width: 0 !important;
      max-width: 260px !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
      color: #f1f5f9 !important;
      font: 600 12px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace !important;
    }

    .ai-turbo-chat-capsule-meta {
      flex: 0 0 auto !important;
      padding: 2px 6px !important;
      border-radius: 4px !important;
      background: rgba(101, 210, 164, 0.12) !important;
      color: #72d6ab !important;
      font: 10px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace !important;
      white-space: nowrap !important;
    }

    .ai-turbo-chat-capsule-action {
      flex: 0 0 auto !important;
      padding-left: 8px !important;
      border-left: 1px solid rgba(153, 166, 161, 0.16) !important;
      color: #9fb3ab !important;
      font: 600 11px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      white-space: nowrap !important;
    }

    .ai-turbo-chat-file-row {
      display: flex !important;
      align-items: center !important;
      justify-content: flex-end !important;

      width: 100% !important;
      max-width: 100% !important;

      box-sizing: border-box !important;

      margin: 4px 0 6px !important;
      padding: 0 !important;

      min-width: 0 !important;

      pointer-events: auto !important;
    }

    .ai-turbo-chat-file-stack {
      display: flex !important;
      flex-direction: column !important;
      align-items: flex-end !important;
      gap: 6px !important;
      min-width: 0 !important;
      max-width: 100% !important;
    }

    .ai-turbo-chat-user-prompt {
      max-width: 100% !important;
      margin: 0 0 2px !important;
      color: inherit !important;
      font: inherit !important;
      line-height: 1.5 !important;
      white-space: pre-wrap !important;
      overflow-wrap: anywhere !important;
      text-align: left !important;
      user-select: text !important;
    }

    .ai-turbo-chat-file-row .ai-turbo-chat-capsule {
      flex: 0 1 auto !important;
      min-width: 0 !important;
      max-width: min(680px, 100%) !important;
    }

    .ai-turbo-chat-file-toggle {
      appearance: none !important;
      -webkit-appearance: none !important;
      align-self: flex-end !important;
      margin: 0 !important;
      padding: 3px 8px !important;
      background: transparent !important;
      border: 1px solid rgba(153, 166, 161, 0.2) !important;
      border-radius: 999px !important;
      color: #9fb3ab !important;
      font: 600 11px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      cursor: pointer !important;
      user-select: none !important;
    }

    .ai-turbo-chat-file-toggle:hover,
    .ai-turbo-chat-file-toggle:focus-visible {
      border-color: rgba(101, 210, 164, 0.45) !important;
      color: #d8e1dc !important;
      outline: none !important;
    }

    .ai-turbo-chat-file-toggle:focus-visible {
      box-shadow: 0 0 0 2px rgba(101, 210, 164, 0.4) !important;
    }

    .ai-turbo-chat-capsule:hover,
    .ai-turbo-chat-capsule:focus-visible {
      border-color: rgba(101, 210, 164, 0.42) !important;
      background: #161d21 !important;
      outline: none !important;
    }

    .ai-turbo-chat-capsule:focus-visible {
      box-shadow:
        0 0 0 2px rgba(101, 210, 164, 0.45),
        0 5px 16px rgba(0, 0, 0, 0.16) !important;
    }

    .ai-turbo-modal-backdrop {
      position: fixed !important;
      inset: 0 !important;
      background: rgba(0, 0, 0, 0.72) !important;
      backdrop-filter: blur(8px) !important;
      -webkit-backdrop-filter: blur(8px) !important;
      z-index: 2147483646 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 24px !important;
      box-sizing: border-box !important;
    }

    .ai-turbo-text-preview-dialog {
      display: flex !important;
      flex-direction: column !important;
      width: 760px !important;
      max-width: 94vw !important;
      max-height: 86vh !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
      background: #0d121c !important;
      border: 1px solid rgba(101, 210, 164, 0.32) !important;
      border-radius: 14px !important;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.85) !important;
      color: #cbd5e1 !important;
      font: 12px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
    }

    .ai-turbo-text-preview-header {
      flex: 0 0 auto !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 12px !important;
      padding: 12px 14px 12px 18px !important;
      border-bottom: 1px solid rgba(153, 166, 161, 0.15) !important;
      background: rgba(18, 24, 38, 0.98) !important;
    }

    .ai-turbo-text-preview-heading {
      min-width: 0 !important;
      display: flex !important;
      align-items: baseline !important;
      gap: 10px !important;
    }

    .ai-turbo-text-preview-name {
      min-width: 0 !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
      color: #f8fafc !important;
      font: 600 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace !important;
    }

    .ai-turbo-text-preview-meta {
      flex: 0 0 auto !important;
      color: #72d6ab !important;
      font: 10.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace !important;
      white-space: nowrap !important;
    }

    .ai-turbo-text-preview-close {
      flex: 0 0 auto !important;
      appearance: none !important;
      -webkit-appearance: none !important;
      padding: 4px 7px !important;
      border: 0 !important;
      border-radius: 6px !important;
      background: transparent !important;
      color: #94a3b8 !important;
      font: 15px/1 sans-serif !important;
      cursor: pointer !important;
    }

    .ai-turbo-text-preview-close:hover {
      color: #e2e8f0 !important;
      background: rgba(255, 255, 255, 0.08) !important;
    }

    .ai-turbo-text-preview-body {
      flex: 1 1 auto !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 16px !important;
      overflow: auto !important;
      background: rgba(5, 8, 15, 0.7) !important;
      color: #cbd5e1 !important;
      font: 12px/1.65 ui-monospace, SFMono-Regular, Menlo, monospace !important;
      white-space: pre-wrap !important;
      overflow-wrap: anywhere !important;
      tab-size: 4 !important;
      user-select: text !important;
    }

    .ai-turbo-text-preview-footer {
      flex: 0 0 auto !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 12px !important;
      padding: 10px 14px 10px 18px !important;
      border-top: 1px solid rgba(153, 166, 161, 0.15) !important;
      background: rgba(18, 24, 38, 0.98) !important;
    }

    .ai-turbo-text-preview-info {
      min-width: 0 !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
      color: #64748b !important;
      font: 11px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
    }

    .ai-turbo-text-preview-actions {
      flex: 0 0 auto !important;
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
    }

    .ai-turbo-text-preview-action {
      appearance: none !important;
      -webkit-appearance: none !important;
      padding: 5px 12px !important;
      border: 1px solid rgba(153, 166, 161, 0.2) !important;
      border-radius: 7px !important;
      background: rgba(255, 255, 255, 0.06) !important;
      color: #e2e8f0 !important;
      font: 11px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      cursor: pointer !important;
      white-space: nowrap !important;
    }

    .ai-turbo-text-preview-action:hover {
      border-color: rgba(101, 210, 164, 0.36) !important;
      color: #72d6ab !important;
    }

    @media (prefers-reduced-motion: reduce) {
      .ai-turbo-vf-tray,
      .ai-turbo-vf-pill,
      .ai-turbo-vf-action,
      .ai-turbo-code-bar,
      .ai-turbo-code-toggle,
      .ai-turbo-code-copy {
        transition: none !important;
      }
    }
  `;

export type EngineStyleOptions = {
  /** Append the Gemini native message render isolation rules. */
  geminiNativeRender?: boolean;
};

export function injectEngineStyles(options: EngineStyleOptions = {}): void {
  const baseCss = `${BASE_ENGINE_CSS}\n${SIDEBAR_PEEK_CSS}`;
  const css = options.geminiNativeRender
    ? `${baseCss}\n${GEMINI_NATIVE_RENDER_CSS}`
    : baseCss;

  // The host may rebuild <head> during account switching, which drops the
  // style node with it. Reuse a live node, otherwise restore one so the HUD
  // never stays on screen without the engine stylesheet. A reused node is
  // rewritten in place when the platform rules change.
  const existingStyle = document.getElementById(STYLE_ID);
  if (existingStyle?.isConnected) {
    if (existingStyle.textContent !== css) existingStyle.textContent = css;
    return;
  }
  existingStyle?.remove();

  const styleElement = document.createElement("style");
  styleElement.id = STYLE_ID;
  styleElement.textContent = css;

  (document.head || document.documentElement).appendChild(styleElement);
}
