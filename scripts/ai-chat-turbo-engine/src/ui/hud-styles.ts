export const HUD_STYLES = `
    * { box-sizing: border-box; }
    button, input, select { font: inherit; }

    :host {
      color-scheme: dark;
      --hud-panel-solid: #0c1012;
      --hud-text: #e2ebe6;
      --hud-title: #f8fafc;
      --hud-muted: #64748b;
      --hud-subtle: #475569;
      --hud-border: rgba(153, 166, 161, 0.19);
      --hud-border-soft: rgba(153, 166, 161, 0.11);
      --hud-field-bg: #0f1416;
      --hud-card-bg: #101517;
      --hud-hover: rgba(255, 255, 255, 0.08);
      --hud-accent: #72d6ab;
      --hud-scrim: rgba(0, 0, 0, 0.45);
      --hud-shadow: 0 26px 70px rgba(0, 0, 0, 0.48);
      --hud-track: rgba(148, 163, 184, 0.22);
      --hud-normal-tone: #5eead4;
      --hud-normal-strong: #34d399;
      --hud-normal-muted: #8ba39a;
      --hud-normal-surface: rgba(12, 18, 20, 0.97);
      --hud-normal-border: rgba(94, 234, 212, 0.3);
      --hud-normal-track: rgba(148, 163, 184, 0.22);
      --hud-normal-glow: rgba(16, 185, 129, 0.14);
      --hud-warning: #fbbf24;
      --hud-warning-strong: #f59e0b;
      --hud-warning-muted: #c7a766;
      --hud-warning-surface: rgba(38, 29, 10, 0.97);
      --hud-warning-border: rgba(251, 191, 36, 0.52);
      --hud-warning-track: rgba(251, 191, 36, 0.18);
      --hud-warning-glow: rgba(245, 158, 11, 0.2);
      --hud-warning-soft: rgba(251, 191, 36, 0.08);
      --hud-critical: #fb7185;
      --hud-critical-strong: #ef4444;
      --hud-critical-muted: #c99a9f;
      --hud-critical-surface: rgba(45, 13, 18, 0.97);
      --hud-critical-border: rgba(251, 113, 133, 0.58);
      --hud-critical-track: rgba(251, 113, 133, 0.2);
      --hud-critical-glow: rgba(239, 68, 68, 0.24);
      --hud-critical-soft: rgba(251, 113, 133, 0.08);
    }

    :host([data-hud-theme="light"]) {
      color-scheme: light;
      --hud-panel-solid: #ffffff;
      --hud-text: #1f2a26;
      --hud-title: #0f172a;
      --hud-muted: #64748b;
      --hud-subtle: #94a3b8;
      --hud-border: rgba(15, 23, 42, 0.12);
      --hud-border-soft: rgba(15, 23, 42, 0.08);
      --hud-field-bg: #ffffff;
      --hud-card-bg: #f8faf9;
      --hud-hover: rgba(15, 23, 42, 0.06);
      --hud-accent: #047857;
      --hud-scrim: rgba(15, 23, 42, 0.3);
      --hud-shadow: 0 24px 60px rgba(15, 23, 42, 0.18);
      --hud-track: rgba(100, 116, 139, 0.25);
      --hud-normal-tone: #047857;
      --hud-normal-strong: #059669;
      --hud-normal-muted: #4b7a6a;
      --hud-normal-surface: #ffffff;
      --hud-normal-border: rgba(4, 120, 87, 0.32);
      --hud-normal-track: rgba(4, 120, 87, 0.16);
      --hud-normal-glow: rgba(5, 150, 105, 0.16);
      --hud-warning: #b45309;
      --hud-warning-strong: #d97706;
      --hud-warning-muted: #92400e;
      --hud-warning-surface: #fffbeb;
      --hud-warning-border: rgba(217, 119, 6, 0.42);
      --hud-warning-track: rgba(217, 119, 6, 0.2);
      --hud-warning-glow: rgba(217, 119, 6, 0.18);
      --hud-warning-soft: rgba(217, 119, 6, 0.09);
      --hud-critical: #be123c;
      --hud-critical-strong: #e11d48;
      --hud-critical-muted: #9f1239;
      --hud-critical-surface: #fff1f2;
      --hud-critical-border: rgba(225, 29, 72, 0.42);
      --hud-critical-track: rgba(225, 29, 72, 0.18);
      --hud-critical-glow: rgba(225, 29, 72, 0.16);
      --hud-critical-soft: rgba(225, 29, 72, 0.08);
    }

    .docked-pill {
      --turbo-tone: var(--hud-normal-tone);
      --turbo-tone-strong: var(--hud-normal-strong);
      --turbo-muted: var(--hud-normal-muted);
      --turbo-surface: var(--hud-normal-surface);
      --turbo-border: var(--hud-normal-border);
      --turbo-track: var(--hud-normal-track);
      --turbo-glow: var(--hud-normal-glow);
      pointer-events: auto;
      position: fixed;
      display: grid;
      width: 48px;
      height: 48px;
      padding: 0;
      place-items: center;
      border-radius: 15px;
      background: var(--turbo-surface);
      border: 1px solid var(--turbo-border);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(255, 255, 255, 0.02) inset;
      color: var(--turbo-tone);
      font: 650 11px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      cursor: grab;
      user-select: none;
      touch-action: none;
      transition: background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
    }
    :host([data-hud-theme="light"]) .docked-pill {
      box-shadow: 0 8px 22px rgba(15, 23, 42, 0.14), 0 0 0 1px rgba(15, 23, 42, 0.03) inset;
    }
    .docked-pill[data-load-tone="warning"] {
      --turbo-tone: var(--hud-warning);
      --turbo-tone-strong: var(--hud-warning-strong);
      --turbo-muted: var(--hud-warning-muted);
      --turbo-surface: var(--hud-warning-surface);
      --turbo-border: var(--hud-warning-border);
      --turbo-track: var(--hud-warning-track);
      --turbo-glow: var(--hud-warning-glow);
    }
    .docked-pill[data-load-tone="critical"] {
      --turbo-tone: var(--hud-critical);
      --turbo-tone-strong: var(--hud-critical-strong);
      --turbo-muted: var(--hud-critical-muted);
      --turbo-surface: var(--hud-critical-surface);
      --turbo-border: var(--hud-critical-border);
      --turbo-track: var(--hud-critical-track);
      --turbo-glow: var(--hud-critical-glow);
    }
    .turbo-gauge { position: relative; display: grid; width: 40px; height: 40px; place-items: center; }
    .pill-load-ring { position: absolute; inset: 0; display: block; width: 40px; height: 40px; overflow: visible; }
    .pill-load-track { fill: none; stroke: var(--turbo-track); stroke-width: 2.4; }
    .pill-load-progress { fill: none; stroke: var(--turbo-tone-strong); stroke-width: 2.4; stroke-linecap: round; transition: stroke-dashoffset 220ms cubic-bezier(0.16, 1, 0.3, 1), stroke 180ms ease; }
    .turbo-readout { position: relative; display: flex; align-items: center; justify-content: center; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; line-height: 1; pointer-events: none; }
    .turbo-count { color: var(--turbo-tone); font-size: 12px; font-weight: 850; letter-spacing: -0.45px; font-variant-numeric: tabular-nums; }
    .docked-pill:active { cursor: grabbing; }
    .docked-pill.dragging { cursor: grabbing; }
    .docked-pill:hover {
      border-color: var(--turbo-tone);
      box-shadow: 0 10px 28px var(--turbo-glow), 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
      transform: translateY(-1px) scale(1.02);
    }

    /*
     * Docked mode folds the 48px pill into a slim tab on the chosen edge.
     * The ring and count stay visible, so the collapsed state still reports
     * load without opening the panel.
     */
    :host([data-hud-dock]) .docked-pill {
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      gap: 9px;
      width: 30px;
      height: 86px;
      padding-top: 9px;
      border-radius: 14px;
      transition: background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
    }
    :host([data-hud-dock="left"]) .docked-pill { border-top-left-radius: 0; border-bottom-left-radius: 0; }
    :host([data-hud-dock="right"]) .docked-pill { border-top-right-radius: 0; border-bottom-right-radius: 0; }
    :host([data-hud-dock]) .turbo-gauge { width: 26px; height: 26px; }
    :host([data-hud-dock]) .pill-load-ring { width: 26px; height: 26px; }
    :host([data-hud-dock]) .turbo-count { font-size: 10px; letter-spacing: -0.3px; }
    :host([data-hud-dock]) .docked-pill:hover { transform: none; }
    .dock-mark {
      display: none;
      font: 700 8px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0.12em;
      color: var(--turbo-muted);
    }
    :host([data-hud-dock]) .dock-mark { display: block; }

    .modal-backdrop {
      position: absolute;
      inset: 0;
      background: var(--hud-scrim);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 12px;
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transition: opacity 180ms ease, visibility 180ms ease;
    }
    .modal-backdrop.open {
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
    }

    .hud-panel {
      pointer-events: auto;
      width: min(420px, calc(100vw - 24px));
      max-height: calc(100vh - 24px);
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
      scrollbar-color: var(--hud-track) transparent;
      padding: 18px;
      border: 1px solid var(--hud-border);
      border-radius: 14px;
      background: var(--hud-panel-solid);
      box-shadow: var(--hud-shadow);
      color: var(--hud-text);
      transform: scale(0.96);
      transition: transform 140ms cubic-bezier(0.16, 1, 0.3, 1);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      outline: none;
    }
    @supports (height: 100dvh) {
      .hud-panel { max-height: min(720px, calc(100dvh - 24px)); }
    }
    .modal-backdrop.open .hud-panel { transform: scale(1); }
    /*
     * A docked panel slides out of the same edge as the collapsed tab. It
     * spans the viewport height, so long settings lists scroll inside the
     * sheet while the page keeps its own scroll position.
     */
    .modal-backdrop[data-dock] {
      padding: 0;
      align-items: stretch;
    }
    .modal-backdrop[data-dock="left"] { justify-content: flex-start; }
    .modal-backdrop[data-dock="right"] { justify-content: flex-end; }
    .modal-backdrop[data-dock] .hud-panel {
      width: min(392px, 100vw);
      height: 100%;
      max-height: none;
      padding: 18px 18px calc(18px + env(safe-area-inset-bottom));
      border-width: 0 1px 0 0;
      border-radius: 0;
      transform: translateX(-102%);
      transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
    }
    .modal-backdrop[data-dock="right"] .hud-panel {
      border-width: 0 0 0 1px;
      transform: translateX(102%);
    }
    .modal-backdrop[data-dock].open .hud-panel { transform: none; }
    /* The panel stays opaque: an 18px backdrop blur repaints the whole page
       behind it on every frame of the open and close animation. */

    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .brand-title { font-size: 13px; font-weight: 700; color: var(--hud-title); }
    .brand-subtitle { font-size: 10px; color: var(--hud-muted); margin-top: 1px; }
    .close-btn { background: transparent; border: 0; color: var(--hud-muted); cursor: pointer; padding: 4px 6px; border-radius: 6px; }
    .close-btn:hover { color: var(--hud-title); background: var(--hud-hover); }
    .header-actions { display: inline-flex; align-items: center; gap: 2px; }
    .dock-btn { background: transparent; border: 0; color: var(--hud-muted); cursor: pointer; padding: 4px 7px; border-radius: 6px; font: 600 10px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .dock-btn:hover { color: var(--hud-title); background: var(--hud-hover); }
    .dock-btn[aria-pressed="true"] { color: var(--hud-accent); background: var(--hud-hover); }

    .status-strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin-bottom: 12px; }
    .status-item { min-width: 0; padding: 9px 6px; border: 1px solid var(--hud-border-soft); border-radius: 9px; background: var(--hud-card-bg); text-align: center; }
    .status-label { font-size: 9px; color: var(--hud-muted); display: block; }
    .status-value { font-size: 14px; font-weight: 700; color: var(--hud-title); margin-top: 2px; font-variant-numeric: tabular-nums; }
    .status-item[data-load-tone="warning"] { border-color: var(--hud-warning-border); background: var(--hud-warning-soft); }
    .status-item[data-load-tone="warning"] .status-value { color: var(--hud-warning); }
    .status-item[data-load-tone="critical"] { border-color: var(--hud-critical-border); background: var(--hud-critical-soft); }
    .status-item[data-load-tone="critical"] .status-value { color: var(--hud-critical); }

    .load-warning { margin-bottom: 12px; padding: 9px 10px; border: 1px solid var(--hud-warning-border); border-radius: 9px; background: var(--hud-warning-soft); color: var(--hud-text); font-size: 10.5px; line-height: 1.55; }
    .load-warning[hidden] { display: none !important; }
    .load-warning[data-tone="critical"] { border-color: var(--hud-critical-border); background: var(--hud-critical-soft); }
    .load-warning-text { margin: 0; }
    .load-warning[data-tone="critical"] .load-warning-text { color: var(--hud-critical); }
    .load-warning-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 7px; }
    .load-warning-actions button { height: 24px; padding: 0 8px; border: 1px solid var(--hud-warning-border); border-radius: 6px; background: transparent; color: var(--hud-warning); font-size: 10px; font-weight: 650; cursor: pointer; }
    .load-warning[data-tone="critical"] .load-warning-actions button { border-color: var(--hud-critical-border); color: var(--hud-critical); }
    .load-warning-actions button:hover { background: var(--hud-hover); }

    .section { padding-top: 10px; border-top: 1px solid var(--hud-border-soft); }
    .section-title { font-size: 10px; font-weight: 700; color: var(--hud-muted); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.04em; }
    .control-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 32px; margin-bottom: 6px; font-size: 11px; color: var(--hud-text); }
    .control-label { cursor: pointer; }

    .stepper { display: inline-flex; align-items: center; border: 1px solid var(--hud-border); border-radius: 8px; background: var(--hud-field-bg); }
    .stepper button { width: 28px; height: 26px; border: 0; background: transparent; color: var(--hud-muted); cursor: pointer; border-radius: 7px; }
    .stepper button:hover { background: var(--hud-hover); color: var(--hud-accent); }
    .stepper span { min-width: 30px; text-align: center; font-size: 11px; font-family: ui-monospace, monospace; color: var(--hud-text); }
    .limit-control { display: inline-flex; align-items: center; gap: 5px; }
    .limit-input { width: 58px; height: 26px; padding: 0 6px; border: 1px solid var(--hud-border); border-radius: 7px; background: var(--hud-field-bg); color: var(--hud-text); font: 650 11px/1 ui-monospace, monospace; text-align: right; font-variant-numeric: tabular-nums; }
    .limit-input:hover { border-color: var(--hud-accent); }
    .limit-unit { color: var(--hud-muted); font-size: 10px; }
    .theme-select { height: 26px; padding: 0 6px; border: 1px solid var(--hud-border); border-radius: 7px; background: var(--hud-field-bg); color: var(--hud-text); font-size: 11px; }

    .switch { position: relative; display: inline-flex; width: 34px; height: 20px; flex: 0 0 auto; }
    .switch input { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; }
    .slider { position: absolute; inset: 0; border-radius: 999px; background: var(--hud-track); cursor: pointer; transition: 150ms; }
    .slider::before { content: ""; position: absolute; width: 14px; height: 14px; left: 3px; top: 3px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25); transition: 150ms; }
    .switch input:checked + .slider { background: var(--hud-normal-strong); }
    .switch input:checked + .slider::before { transform: translateX(14px); }
    .switch input:focus-visible + .slider { outline: 2px solid var(--hud-normal-tone); outline-offset: 2px; }

    .action-btn { width: 100%; height: 34px; margin-top: 10px; border: 1px solid var(--hud-border); border-radius: 8px; background: var(--hud-card-bg); color: var(--hud-text); font-size: 11px; font-weight: 600; cursor: pointer; transition: 140ms ease; }
    .action-btn:hover { background: var(--hud-hover); border-color: var(--hud-normal-border); color: var(--hud-accent); }
    .action-btn.copied { background: var(--hud-warning-soft); color: var(--hud-accent); border-color: var(--hud-normal-border); }
    .reset-btn { margin-top: 12px; }
    .reset-btn:hover { border-color: var(--hud-critical-border); color: var(--hud-critical); }
    .handoff-status { margin-top: 8px; color: var(--hud-muted); font-size: 10px; line-height: 1.5; overflow-wrap: anywhere; }
    .reasoning-status { margin: 2px 0 6px; color: var(--hud-muted); font-size: 10px; line-height: 1.5; overflow-wrap: anywhere; }
    .reasoning-status:empty { display: none; }
    .reasoning-status button { margin-left: 6px; padding: 0 4px; border: 1px solid var(--hud-border); border-radius: 4px; background: transparent; color: var(--hud-accent); font-size: 10px; line-height: 1.6; cursor: pointer; }
    .reasoning-status button:hover { border-color: var(--hud-normal-border); }

    .search-wrap { position: relative; margin-top: 8px; }
    .search-input { width: 100%; height: 34px; padding: 0 10px; border: 1px solid var(--hud-border); border-radius: 8px; background: var(--hud-field-bg); color: var(--hud-text); font-size: 11px; outline: none; }
    .search-input::placeholder { color: var(--hud-muted); }
    .search-input:focus { border-color: var(--hud-normal-border); }
    .results { max-height: 132px; overflow-y: auto; margin-top: 6px; display: grid; gap: 4px; }
    .result-item, .result-empty, .result-pending { padding: 6px 8px; font-size: 10px; border-radius: 7px; background: var(--hud-card-bg); color: var(--hud-text); border: none; text-align: left; }
    .result-item { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; cursor: pointer; }
    .result-item:hover { background: var(--hud-hover); color: var(--hud-accent); }
    .result-empty, .result-pending { text-align: center; color: var(--hud-muted); }
    .result-pending { font-style: italic; }
    .footer-hint { margin-top: 12px; font-size: 9.5px; color: var(--hud-subtle); text-align: center; }
    .settings-hint { margin: 4px 0 2px; color: var(--hud-muted); font-size: 9.5px; line-height: 1.5; }
    kbd { padding: 2px 4px; border: 1px solid var(--hud-border); border-radius: 4px; color: var(--hud-muted); font-family: ui-monospace, monospace; }

    .advanced { margin-top: 10px; }
    .advanced > summary { display: flex; align-items: center; gap: 6px; padding: 8px 0; font-size: 10px; font-weight: 700; color: var(--hud-muted); text-transform: uppercase; letter-spacing: 0.04em; cursor: pointer; list-style: none; }
    .advanced > summary::-webkit-details-marker { display: none; }
    .advanced > summary::before { content: "▸"; font-size: 10px; color: var(--hud-subtle); transition: transform 140ms ease; }
    .advanced[open] > summary::before { transform: rotate(90deg); }
    .advanced-body { padding: 2px 0 4px; }

    .sr-live { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0; }

    .hud-panel button:focus-visible,
    .hud-panel input:focus-visible,
    .hud-panel select:focus-visible,
    .docked-pill:focus-visible {
      outline: 2px solid var(--hud-normal-tone, #65d2a4);
      outline-offset: 2px;
    }

    @media (max-width: 440px) {
      .status-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }

    @media (prefers-reduced-motion: reduce) {
      .modal-backdrop, .hud-panel, .modal-backdrop[data-dock] .hud-panel, .docked-pill, .pill-load-progress, .slider, .advanced > summary::before { transition: none !important; }
    }
  `;

