import { CODE_PREVIEW_HEIGHT, STYLE_ID } from "../config";

export function injectEngineStyles() {
  // The host may rebuild <head> during account switching, which drops the
  // style node with it. Reuse a live node, otherwise restore one so the HUD
  // never stays on screen without the engine stylesheet.
  const existingStyle = document.getElementById(STYLE_ID);
  if (existingStyle?.isConnected) return;
  existingStyle?.remove();

  const styleElement = document.createElement("style");
  styleElement.id = STYLE_ID;
  styleElement.textContent = `
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
      display: inline-flex !important;
      align-items: center !important;
      gap: 8px !important;
      padding: 6px 14px !important;
      margin: 0 !important;
      max-width: min(100%, 680px) !important;
      background: #111619 !important;
      border: 1px solid rgba(153, 166, 161, 0.18) !important;
      border-left: 2px solid rgba(101, 210, 164, 0.7) !important;
      border-radius: 10px !important;
      box-shadow: 0 5px 16px rgba(0, 0, 0, 0.16) !important;
      user-select: none !important;
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

    .ai-turbo-chat-file-row .ai-turbo-chat-capsule {
      flex: 0 1 auto !important;
      min-width: 0 !important;
      max-width: min(680px, 100%) !important;
    }

    .ai-turbo-chat-capsule:hover {
      border-color: rgba(101, 210, 164, 0.3) !important;
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

  (document.head || document.documentElement).appendChild(styleElement);
}
