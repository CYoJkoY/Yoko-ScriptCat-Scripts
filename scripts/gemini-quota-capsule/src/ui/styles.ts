// Base capsule styles. CSS text is kept byte-identical to the v1.0.3
// userscript so the rendered layout and selectors do not drift.

export const STYLES = `    #gc-pill-root {
      position: fixed;
      z-index: 9999999;
      user-select: none;
      touch-action: none;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
      font-size: 11px;
      color: #f8fafc;
      line-height: 1;
      filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.45));
    }
    .gc-pill-container {
      display: inline-flex;
      align-items: center;
      height: 24px;
      gap: 6px;
      background: rgba(15, 17, 21, 0.92);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 9999px;
      padding: 0 7px 0 5px;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
      cursor: grab;
      white-space: nowrap;
      transition: border-color 0.2s;
    }
    .gc-pill-container:active { cursor: grabbing; }
    .gc-pill-container:hover { border-color: rgba(255, 255, 255, 0.28); }
    @media (max-width: 420px) {
      #gc-pill-root .gc-pill-container { gap: 1px; }
      #gc-pill-root .gc-metric-group { gap: 1px; }
      #gc-pill-root .gc-pill-badge { padding-inline: 1px; }
      #gc-pill-root .gc-pill-counter { font-size: 10px; }
      #gc-pill-root .gc-pill-timer { font-size: 8px; }
    }

    .gc-capsule-head {
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--gc-accent, #10b981);
      width: 16px;
      height: 16px;
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      cursor: pointer;
      transition: color 0.2s ease, transform 0.2s ease;
    }
    .gc-capsule-head:hover { transform: translateY(-0.5px) scale(1.06); }
    .gc-ornament-svg, .gc-ornament-image {
      width: 16px;
      height: 16px;
      display: block;
      object-fit: contain;
      border-radius: 4px;
      pointer-events: none;
    }

    .gc-metric-group {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 100%;
    }
    .gc-pill-badge {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.2px;
      padding: 1.5px 3.5px;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.08);
      color: var(--gc-badge-color, #f8fafc);
      line-height: 1;
    }
    .gc-pill-counter {
      display: inline-block;
      width: 4ch;
      flex-shrink: 0;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      font-weight: 700;
      color: #ffffff;
      font-variant-numeric: tabular-nums;
    }
    .gc-pill-timer {
      display: inline-block;
      width: 8ch;
      flex-shrink: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 9.5px;
      color: var(--gc-timer-color, #94a3b8);
      font-variant-numeric: tabular-nums;
    }

    .gc-progress-slot {
      width: 24px;
      height: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      overflow: visible;
      box-sizing: border-box;
      color: var(--gc-progress-color, #10b981);
    }

    .gc-inline-track {
      width: 24px;
      height: 2.5px;
      background: rgba(255, 255, 255, 0.12);
      border-radius: 999px;
      overflow: hidden;
      display: block;
      box-sizing: border-box;
      flex-shrink: 0;
    }
    .gc-inline-fill {
      height: 100%;
      border-radius: 999px;
      transition: width 0.3s ease, background-color 0.3s ease;
    }
    .gc-inline-track[data-mode="segments"] {
      height: 6px;
      border-radius: 0;
      /* 遮罩将连续进度切成五格，填充比例仍保持精确。 */
      mask-image: repeating-linear-gradient(to right, #000 0 4px, transparent 4px 5px);
      -webkit-mask-image: repeating-linear-gradient(to right, #000 0 4px, transparent 4px 5px);
    }
    .gc-inline-track[data-mode="battery"] {
      height: 9px;
      border: 1px solid #94a3b8;
      border-radius: 2px;
    }
    .gc-inline-track[data-mode="battery"] .gc-inline-fill {
      /* 电池内胆改用小圆角，避免在方形外壳里出现胶囊形的圆头。 */
      border-radius: 1px;
    }
    .gc-capsule-head:focus-visible, .gc-choice-btn:focus-visible, .gc-btn-icon:focus-visible {
      outline: 2px solid #38bdf8;
      outline-offset: 2px;
    }

    .gc-v-divider {
      width: 1px;
      height: 10px;
      background: rgba(255, 255, 255, 0.12);
      flex-shrink: 0;
    }

    .gc-sync-dot {
      width: 4.5px;
      height: 4.5px;
      border-radius: 50%;
      flex-shrink: 0;
      background: #64748b;
    }
    .gc-sync-dot.official {
      background: #10b981;
      box-shadow: 0 0 4px rgba(16, 185, 129, 0.75);
    }
    .gc-sync-dot.syncing {
      background: #f59e0b;
      box-shadow: 0 0 5px rgba(245, 158, 11, 0.85);
    }
    .gc-sync-dot.error {
      background: #f43f5e;
    }

    .gc-pill-actions {
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
    .gc-btn-icon {
      background: transparent;
      border: none;
      outline: none;
      color: #94a3b8;
      cursor: pointer;
      width: 16px;
      height: 16px;
      padding: 0;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: color 0.15s, background 0.15s;
    }
    .gc-btn-icon:hover {
      color: #f8fafc;
      background: rgba(255, 255, 255, 0.12);
    }
    .gc-btn-icon svg { width: 11px; height: 11px; }

    @keyframes gc-spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .gc-spinning svg {
      animation: gc-spin 0.75s linear infinite;
      color: #38bdf8;
    }

    .gc-disk-box {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(255,255,255,0.2);
    }
    .gc-disk-core {
      position: absolute;
      width: 4.5px;
      height: 4.5px;
      background: #09090b;
      border-radius: 50%;
    }

    .gc-decay-capsule {
      width: 14px;
      height: 14px;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .gc-decay-body {
      width: 13px;
      height: 13px;
      position: relative;
    }
    .gc-decay-shard {
      position: absolute;
      width: 100%;
      height: 100%;
      top: 0;
      left: 0;
      transition: transform 0.35s ease, opacity 0.35s ease;
    }
    @keyframes gc-jitter {
      0% { transform: translate(0, 0) rotate(0deg); }
      25% { transform: translate(-0.7px, 0.7px) rotate(-1.5deg); }
      50% { transform: translate(0.7px, -0.7px) rotate(1.5deg); }
      75% { transform: translate(-0.7px, -0.5px) rotate(-0.8deg); }
      100% { transform: translate(0, 0) rotate(0deg); }
    }
    .gc-state-critical { animation: gc-jitter 0.18s infinite linear; }
    @media (prefers-reduced-motion: reduce) {
      #gc-pill-root *, #gc-pill-root *::before, #gc-pill-root *::after {
        animation: none !important;
        transition: none !important;
      }
    }

    #gc-pill-drawer {
      position: absolute;
      bottom: calc(100% + 6px);
      right: 0;
      width: 300px;
      max-width: calc(100vw - 24px);
      max-height: min(78vh, 620px);
      background: rgba(15, 17, 23, 0.98);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 9px;
      box-shadow: 0 10px 24px rgba(0,0,0,0.65);
      padding: 9px 11px;
      backdrop-filter: blur(18px);
      display: none;
      flex-direction: column;
      gap: 7px;
      z-index: 10000000;
      white-space: normal;
      box-sizing: border-box;
      overflow: hidden;
    }
    #gc-pill-drawer.gc-active { display: flex; }
    .gc-drawer-title {
      font-size: 10px;
      font-weight: 700;
      color: #94a3b8;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      padding-bottom: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
    }
    .gc-drawer-body {
      display: flex;
      flex-direction: column;
      gap: 8px;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding-right: 2px;
    }
    .gc-drawer-body::-webkit-scrollbar { width: 4px; }
    .gc-drawer-body::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.16);
      border-radius: 999px;
    }
    .gc-drawer-section {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .gc-section-label {
      font-size: 9px;
      font-weight: 600;
      color: #94a3b8;
      letter-spacing: 0.2px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .gc-mode-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 4px;
    }
    .gc-ornament-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 4px;
    }
    .gc-choice-btn {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #cbd5e1;
      padding: 3.5px 2px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 10px;
      text-align: center;
      transition: all 0.15s;
    }
    .gc-choice-btn:hover { background: rgba(255, 255, 255, 0.12); color: #fff; }
    .gc-choice-btn.active {
      background: #2563eb;
      border-color: #3b82f6;
      color: #fff;
      font-weight: 600;
    }
    .gc-choice-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .gc-custom-row {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }
    .gc-small-btn {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      color: #cbd5e1;
      border-radius: 4px;
      padding: 3px 6px;
      font-size: 9px;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    .gc-small-btn:hover { background: rgba(255,255,255,0.14); color: #fff; }
    .gc-small-btn.active { border-color: #38bdf8; color: #7dd3fc; }
    .gc-editor {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .gc-editor[hidden] { display: none; }
    .gc-textarea, .gc-select {
      width: 100%;
      box-sizing: border-box;
      background: rgba(2, 6, 23, 0.72);
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 5px;
      color: #e2e8f0;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 9.5px;
      line-height: 1.45;
      padding: 5px 6px;
      resize: vertical;
      outline: none;
    }
    .gc-textarea:focus, .gc-select:focus {
      border-color: #38bdf8;
      box-shadow: 0 0 0 1px rgba(56,189,248,0.3);
    }
    .gc-textarea { min-height: 66px; }
    .gc-css-textarea { min-height: 56px; }
    .gc-select { min-height: 26px; resize: none; padding: 3px 6px; }
    .gc-editor-actions {
      display: flex;
      gap: 4px;
      justify-content: flex-end;
    }
    .gc-style-status {
      min-height: 12px;
      font-size: 9px;
      line-height: 1.35;
      color: #64748b;
      overflow-wrap: anywhere;
    }
    .gc-style-status.error { color: #fb7185; }
    .gc-style-status.ok { color: #34d399; }
    .gc-drawer-status {
      font-size: 9.5px;
      color: #94a3b8;
      border-top: 1px solid rgba(255,255,255,0.08);
      padding-top: 5px;
      line-height: 1.45;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .gc-link-btn {
      color: #38bdf8;
      text-decoration: underline;
      cursor: pointer;
    }  `;

export function injectStyles(): void {
  if (document.getElementById("gc-pill-style")) return;
  const style = document.createElement("style");
  style.id = "gc-pill-style";
  style.textContent = STYLES;
  (document.head || document.documentElement).appendChild(style);
}