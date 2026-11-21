import { BUTTON_CLASS, STYLE_ID, THEME_ATTRIBUTE, THEME_MODE } from "../config";

/**
 * QQ Mail paints its whole interface from a design-token palette defined on
 * `<body class="page-color-theme">`. The dark theme therefore does not invert
 * anything: it only swaps the token values. Email bodies carry their own
 * hard-coded colours, so they are recoloured element by element by
 * `core/emailDark.ts` while photos, logos and videos keep their pixels.
 */
type Token = readonly [name: string, value: string];
type Declaration = readonly [property: string, value: string];
type Rule = readonly [selector: string, declarations: readonly Declaration[]];

/** Empty/foreground tokens are dark; the `gray` ramp becomes the light ink. */
const DARK_TOKENS: readonly Token[] = Object.freeze([
  ["--base_white_100", "#1A2028"],
  ["--base_white_090", "rgba(26, 32, 40, 0.9)"],
  ["--base_white_080", "rgba(26, 32, 40, 0.8)"],
  ["--base_white_070", "rgba(26, 32, 40, 0.7)"],
  ["--base_white_060", "rgba(26, 32, 40, 0.6)"],
  ["--base_white_050", "rgba(26, 32, 40, 0.5)"],
  ["--base_white_040", "rgba(26, 32, 40, 0.4)"],
  ["--base_white_030", "rgba(26, 32, 40, 0.3)"],
  ["--base_white_025", "rgba(26, 32, 40, 0.25)"],
  ["--base_white_020", "rgba(26, 32, 40, 0.2)"],
  ["--base_white_015", "rgba(26, 32, 40, 0.15)"],
  ["--base_white_010", "rgba(26, 32, 40, 0.1)"],
  ["--base_white_007", "rgba(26, 32, 40, 0.07)"],
  ["--base_white_005", "rgba(26, 32, 40, 0.05)"],
  ["--base_white_003", "rgba(26, 32, 40, 0.03)"],
  ["--base_gray_100", "#E8ECF1"],
  ["--base_gray_090", "rgba(232, 236, 241, 0.9)"],
  ["--base_gray_080", "rgba(232, 236, 241, 0.8)"],
  ["--base_gray_070", "rgba(232, 236, 241, 0.7)"],
  ["--base_gray_060", "rgba(232, 236, 241, 0.6)"],
  ["--base_gray_050", "rgba(232, 236, 241, 0.5)"],
  ["--base_gray_040", "rgba(232, 236, 241, 0.4)"],
  ["--base_gray_030", "rgba(232, 236, 241, 0.3)"],
  ["--base_gray_025", "rgba(232, 236, 241, 0.25)"],
  ["--base_gray_020", "rgba(232, 236, 241, 0.2)"],
  ["--base_gray_015", "rgba(232, 236, 241, 0.15)"],
  ["--base_gray_010", "rgba(232, 236, 241, 0.1)"],
  ["--base_gray_007", "rgba(232, 236, 241, 0.07)"],
  ["--base_gray_005", "rgba(232, 236, 241, 0.05)"],
  ["--base_gray_003", "rgba(232, 236, 241, 0.03)"],
  ["--base_black", "#E8ECF1"],
  ["--bg_white_web", "#1A2028"],
  ["--bg_white_web_alpha_090", "rgba(26, 32, 40, 0.9)"],
  ["--bg_gray_web_0", "#0F1419"],
  ["--bg_gray_web_1", "#13181D"],
  ["--bg_gray_web_2", "#1A2028"],
  ["--bg_gray_web_3", "#20262E"],
  ["--bg_segmented_control_option_selected", "#262D36"],
  ["--bg_panel_blur_stroke", "#3A4049"],
  ["--bg_switch_grabber", "#E8ECF1"],
  ["--bg_invoiceCard_unselected_hover", "#20262E"],
  ["--shadow_1", "0 2px 3px 0 rgba(0, 0, 0, 0.35)"],
]);

const ON_ACCENT = "#FFFFFF";
const ON_ACCENT_MUTED = "rgba(255, 255, 255, 0.8)";

/**
 * Header and sidebar float on the decorative gradient and use the `white`
 * ramp as their *foreground*. Flipping the palette alone would paint that
 * foreground dark on a dark surface, so each component variable is rebound to
 * the equivalent `gray` step, which the dark palette set to light ink.
 */
const SHELL_RULES: readonly Rule[] = Object.freeze([
  [
    ".frame-sidebar",
    [
      ["--feature-title-color", "var(--base_gray_080)"],
      ["--sidebar-divider-color", "var(--base_gray_010)"],
    ],
  ],
  [
    ".frame-sidebar-menu",
    [
      ["--color", "var(--base_gray_100)"],
      ["--total-color", "var(--base_gray_060)"],
      ["--red-dot-tips-color", "var(--base_gray_060)"],
      ["--left-icon-color", "var(--base_gray_080)"],
      ["--feature-icon-color", "var(--base_gray_100)"],
      ["--lock-icon-color", "var(--base_gray_050)"],
      ["--hover-bg", "var(--base_gray_020)"],
      ["--active-bg", "var(--base_gray_040)"],
    ],
  ],
  [
    ".frame-sidebar-menu.sidebar-menu-active",
    [
      ["--bg", "var(--base_gray_030)"],
      ["--hover-bg", "var(--base_gray_040)"],
      ["--active-bg", "var(--base_gray_050)"],
      ["--total-color", "var(--base_gray_100)"],
    ],
  ],
  [".frame-sidebar .frame-sidebar-menu-right-btn", [["--color", "var(--base_gray_070)"]]],
  [".frame-sidebar-menu-left-btn", [["--icon-color", "var(--base_gray_060)"]]],
  [
    ".frame-sidebar-setting-menus",
    [
      ["--back-btn-color", "var(--base_gray_100)"],
      ["--back-btn-icon-color", "var(--base_gray_080)"],
      ["--group-title-color", "var(--base_gray_060)"],
    ],
  ],
  [
    ".frame-sidebar-compose-btn",
    [
      ["--base-bg", "#2A333E"],
      ["--border-color", "#3A4049"],
      ["--color", "var(--base_gray_100)"],
      ["--icon-color", "var(--base_gray_100)"],
    ],
  ],
  [".frame-sidebar-my-files-menu-icon", [["color", "var(--base_gray_100)"]]],
  [".frame-header-setting-btn", [["--color", "var(--base_gray_080)"]]],
  [
    ".frame-header-auto-reply-btn",
    [
      ["--bg", "var(--base_gray_030)"],
      ["--border-color", "var(--base_gray_060)"],
      ["--color", "var(--base_gray_100)"],
      ["--icon-color", "var(--base_gray_100)"],
      ["--down-icon-color", "var(--base_gray_050)"],
    ],
  ],
  [
    ".xmail-cmp-profile-btn",
    [
      ["--nick-color", "var(--base_gray_100)"],
      ["--email-color", "var(--base_gray_080)"],
    ],
  ],
  [
    ".mail-lazy-search-wrap",
    [
      ["--bg", "var(--base_gray_030)"],
      ["--search-icon-color", "var(--base_gray_080)"],
      ["--placeholder-text-color", "var(--base_gray_040)"],
    ],
  ],
  [
    ".cmp-vip-state-icon:not(.cmp-vip-icon-in-panel)",
    [["--vip-icon-color", "var(--base_gray_080)"]],
  ],
]);

/**
 * Accent-filled controls (primary buttons, tags, toasts, selected cells…) draw
 * a coloured background and relied on `white_100` for their text. The dark
 * palette turned that foreground dark, so these surfaces pin it back to white.
 */
const ON_ACCENT_RULES: readonly Rule[] = Object.freeze([
  [
    ".xmail-ui-btn.ui-btn-them-black, .xmail-ui-btn.ui-btn-them-blue, .xmail-ui-btn.ui-btn-them-vip",
    [
      ["--color", ON_ACCENT],
      ["--icon-color", ON_ACCENT],
    ],
  ],
  [".xmail-ui-toast .ui-toast-msg", [["color", ON_ACCENT]]],
  [".xmail-cmp-mail-tag .cmp-mail-tag-name", [["color", ON_ACCENT]]],
  [".cmp-mail-tag-del-btn", [["color", ON_ACCENT]]],
  [".cmp-mail-tag-del-btn:hover", [["color", ON_ACCENT_MUTED]]],
  [".cmp-mail-tag-del-btn:active", [["color", ON_ACCENT]]],
  [".mail-list-page-item .mail-tags .more-tag", [["color", ON_ACCENT]]],
  [".mail-detail-remark-bar .remark-save-btn", [["color", ON_ACCENT]]],
  [
    ".mail-list-page-toolbar-data-panel .monthly-item.monthly-item-selected",
    [["color", ON_ACCENT]],
  ],
  [
    ".xmail-cmp-date-picker-panel .rc-picker-cell-selected .rc-picker-cell-inner",
    [["color", ON_ACCENT]],
  ],
  [
    ".xmail-ui-radio.ui-radio-checked",
    [
      ["--checked-icon-inner-hover", ON_ACCENT],
      ["--checked-icon-inner-active", ON_ACCENT],
    ],
  ],
  [".xmail-ui-progress-bar.ui-progress-theme-white", [["--fill-bg", ON_ACCENT]]],
  [
    ".xmail-cmp-vip-float-bubble .cmp-vip-float-bubble-body",
    [["--arrow-bg", ON_ACCENT]],
  ],
]);

function darkGate(): string {
  return `html[${THEME_ATTRIBUTE}="${THEME_MODE.DARK}"]`;
}

function tokenLines(tokens: readonly Token[]): string[] {
  return tokens.map(([name, value]) => `  ${name}: ${value};`);
}

/**
 * Every rule is anchored with `body` on top of the theme gate. QQ's own rules
 * use `body.page-color-theme <selector>`; the extra element step keeps ours
 * strictly more specific so it wins no matter which sheet loads last.
 */
function rulesLines(gate: string, rules: readonly Rule[]): string[] {
  const lines: string[] = [];
  for (const [selector, declarations] of rules) {
    const head = selector
      .split(",")
      .map((part) => `body ${part.trim()}`)
      .join(", ");
    lines.push(`${gate} ${head} {`);
    for (const [property, value] of declarations) {
      lines.push(`  ${property}: ${value};`);
    }
    lines.push("}");
    lines.push("");
  }
  return lines;
}

export function buildThemeCss(): string {
  const gate = darkGate();
  const body = `${gate} body`;
  const button = `button.${BUTTON_CLASS}`;

  return [
    "/* Dark theme: swap the design tokens only. No filter, no inversion. */",
    `${body} {`,
    "  color-scheme: dark;",
    ...tokenLines(DARK_TOKENS),
    "}",
    "",
    "/* Darken the decorative gradient behind the header and sidebar. */",
    `${body} .frame-theme-layer-base {`,
    "  background: linear-gradient(128deg, #0F1419 0%, #1A2028 72.12%) !important;",
    "}",
    "",
    ...rulesLines(gate, SHELL_RULES),
    ...rulesLines(gate, ON_ACCENT_RULES),
    "/* Reading pane: a dark canvas. The inline colours inside an email are remapped",
    "   one element at a time at runtime; media keep their own pixels. */",
    `${body} .mail-detail-content {`,
    "  color-scheme: dark;",
    "  background-color: #1A2028 !important;",
    "  color: #E8ECF1 !important;",
    "}",
    "",
    "/* Toggle button: a compact icon button pinned to the bottom-left corner. */",
    `${button} {`,
    "  position: fixed;",
    "  left: 16px;",
    "  bottom: 16px;",
    "  z-index: 2147483000;",
    "  display: inline-flex;",
    "  align-items: center;",
    "  justify-content: center;",
    "  width: 36px;",
    "  height: 36px;",
    "  padding: 0;",
    "  border: 1px solid rgba(0, 0, 0, 0.12);",
    "  border-radius: 50%;",
    "  background-color: #FFFFFF;",
    "  color: #253247;",
    "  font: inherit;",
    "  line-height: 1;",
    "  cursor: pointer;",
    "  box-shadow: 0 2px 8px rgba(19, 24, 29, 0.22);",
    "}",
    `${button}:hover { background-color: #F2F7FA; }`,
    `${gate} ${button} {`,
    "  background-color: #20262E;",
    "  color: #E8ECF1;",
    "  border-color: #3A4049;",
    "  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);",
    "}",
    `${gate} ${button}:hover { background-color: #2A333E; }`,
    `${button}:focus-visible { outline: 2px solid #0F7AF5; outline-offset: 2px; }`,
    `${button} > svg { width: 20px; height: 20px; pointer-events: none; }`,
    "",
  ].join("\n");
}

export function ensureThemeStyle(doc: Document): void {
  if (doc.getElementById(STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = buildThemeCss();
  const parent: Element | null = doc.head ?? doc.documentElement;
  if (parent === null) return;
  parent.append(style);
}

export function removeThemeStyle(doc: Document): void {
  doc.getElementById(STYLE_ID)?.remove();
}
