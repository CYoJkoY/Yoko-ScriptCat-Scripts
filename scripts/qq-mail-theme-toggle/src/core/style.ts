import { BUTTON_CLASS, COMPOSE_CONTENT_SELECTOR, STYLE_ID, THEME_ATTRIBUTE, THEME_MODE } from "../config";

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
  ["--base_gray_100", "#EEF2F7"],
  ["--base_gray_090", "rgba(238, 242, 247, 0.95)"],
  ["--base_gray_080", "rgba(238, 242, 247, 0.92)"],
  ["--base_gray_070", "rgba(238, 242, 247, 0.88)"],
  ["--base_gray_060", "rgba(238, 242, 247, 0.8)"],
  ["--base_gray_050", "rgba(238, 242, 247, 0.72)"],
  ["--base_gray_040", "rgba(238, 242, 247, 0.62)"],
  ["--base_gray_030", "rgba(238, 242, 247, 0.44)"],
  ["--base_gray_025", "rgba(238, 242, 247, 0.25)"],
  ["--base_gray_020", "rgba(238, 242, 247, 0.2)"],
  ["--base_gray_015", "rgba(238, 242, 247, 0.15)"],
  ["--base_gray_010", "rgba(238, 242, 247, 0.1)"],
  ["--base_gray_007", "rgba(238, 242, 247, 0.07)"],
  ["--base_gray_005", "rgba(238, 242, 247, 0.05)"],
  ["--base_gray_003", "rgba(238, 242, 247, 0.03)"],
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
const SCROLLBAR_TOKENS: readonly Token[] = Object.freeze([
  ["--color-scroll-bar-bg", "var(--base_gray_030)"],
  ["--color-scroll-bar-hover-bg", "var(--base_gray_060)"],
  ["--color-scroll-bar-active-bg", "var(--base_gray_070)"],
]);

/**
 * QQ paints the blank reading pane ("未选中任何邮件") with a 160x120
 * `background-image` — `images/empty_mail.svg`, a single envelope path filled
 * with `#182B40` at 30%. On the dark canvas that is almost invisible, and a
 * `background-image` cannot inherit `currentColor`, so the same silhouette is
 * inlined here painted with the light ink ramp instead.
 */
const EMPTY_MAIL_ICON =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYwIiBoZWlnaHQ9IjEyMCIgdmlld0JveD0iMCAwIDE2MCAxMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik0yMi41IDI2QzIyLjUgMjQuMDY3IDI0LjA2NyAyMi41IDI2IDIyLjVIMTM0QzEzNS45MzMgMjIuNSAxMzcuNSAyNC4wNjcgMTM3LjUgMjZWMzcuMTE3QzEzNy41IDM3Ljc2MjYgMTM3LjA4NyAzOC4zMzU4IDEzNi40NzQgMzguNTRMODMuMDA0MiA1Ni4zNjM0QzgxLjA1NDEgNTcuMDEzNCA3OC45NDU5IDU3LjAxMzQgNzYuOTk1OCA1Ni4zNjM0TDIzLjUyNTcgMzguNTRDMjIuOTEzMSAzOC4zMzU4IDIyLjUgMzcuNzYyNiAyMi41IDM3LjExN1YyNlpNMjAgMzcuMTE3VjI2QzIwIDIyLjY4NjMgMjIuNjg2MyAyMCAyNiAyMEgxMzRDMTM3LjMxNCAyMCAxNDAgMjIuNjg2MyAxNDAgMjZWMzcuMTE3Vjk0QzE0MCA5Ny4zMTM3IDEzNy4zMTQgMTAwIDEzNCAxMDBIMjZDMjIuNjg2MyAxMDAgMjAgOTcuMzEzNyAyMCA5NFYzNy4xMTdaTTEzNy41IDQwLjgyNTFWOTRDMTM3LjUgOTUuOTMzIDEzNS45MzMgOTcuNSAxMzQgOTcuNUgyNkMyNC4wNjcgOTcuNSAyMi41IDk1LjkzMyAyMi41IDk0VjQwLjgyNTFDMjIuNTc3MSA0MC44NTYzIDIyLjY1NTQgNDAuODg1MSAyMi43MzUxIDQwLjkxMTdMNzYuMjA1MyA1OC43MzUxQzc4LjY2ODUgNTkuNTU2MiA4MS4zMzE1IDU5LjU1NjIgODMuNzk0NyA1OC43MzUxTDEzNy4yNjUgNDAuOTExN0MxMzcuMzQ1IDQwLjg4NTEgMTM3LjQyMyA0MC44NTYzIDEzNy41IDQwLjgyNTFaIiBmaWxsPSIjRUVGMkY3IiBmaWxsLW9wYWNpdHk9IjAuNDUiLz48L3N2Zz4=";

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
      ["--feature-title-color", "var(--base_gray_090)"],
      ["--sidebar-divider-color", "var(--base_gray_010)"],
      ...SCROLLBAR_TOKENS,
    ],
  ],
  [".xmail-page-root::-webkit-scrollbar-thumb", SCROLLBAR_TOKENS],
  [
    ".frame-sidebar-menu",
    [
      ["--color", "var(--base_gray_100)"],
      ["--total-color", "var(--base_gray_070)"],
      ["--red-dot-tips-color", "var(--base_gray_070)"],
      ["--left-icon-color", "var(--base_gray_090)"],
      ["--feature-icon-color", "var(--base_gray_100)"],
      ["--lock-icon-color", "var(--base_gray_060)"],
      ["--hover-bg", "var(--base_gray_010)"],
      ["--active-bg", "var(--base_gray_020)"],
    ],
  ],
  [
    ".frame-sidebar-menu.sidebar-menu-active",
    [
      ["--bg", "var(--base_gray_015)"],
      ["--hover-bg", "var(--base_gray_020)"],
      ["--active-bg", "var(--base_gray_025)"],
      ["--total-color", "var(--base_gray_100)"],
    ],
  ],
  [".frame-sidebar .frame-sidebar-menu-right-btn", [["--color", "var(--base_gray_090)"]]],
  [".frame-sidebar-menu-left-btn", [["--icon-color", "var(--base_gray_080)"]]],
  [
    ".frame-sidebar-setting-menus",
    [
      ["--back-btn-color", "var(--base_gray_100)"],
      ["--back-btn-icon-color", "var(--base_gray_080)"],
      ["--group-title-color", "var(--base_gray_070)"],
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
      ["--bg", "var(--base_gray_015)"],
      ["--border-color", "var(--base_gray_060)"],
      ["--color", "var(--base_gray_100)"],
      ["--icon-color", "var(--base_gray_100)"],
      ["--down-icon-color", "var(--base_gray_060)"],
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
      ["--bg", "var(--base_gray_015)"],
      ["--search-icon-color", "var(--base_gray_080)"],
      ["--placeholder-text-color", "var(--base_gray_060)"],
    ],
  ],
  [
    ".cmp-vip-state-icon:not(.cmp-vip-icon-in-panel)",
    [["--vip-icon-color", "var(--base_gray_080)"]],
  ],
  /* Blank reading pane: the envelope plus the "未选中任何邮件" caption. */
  [".mail-list-page-reader-tips .empty-tips::before", [["background-image", `url("${EMPTY_MAIL_ICON}")`]]],
  [".mail-list-page-reader-tips .empty-tips .tips-title", [["color", "var(--base_gray_070)"]]],
  /* Empty folder ("暂无邮件") and its secondary line. */
  [".mail-list-page-tips .empty-desc", [["color", "var(--base_gray_060)"]]],
  /* Message preview line is the dimmest body text in the list; lift one step. */
  [".mail-list-page-item .mail-digest", [["color", "var(--base_gray_050)"]]],
  [".mail-list-page-item .mail-digest.digest-remark", [["color", "var(--chrome_yellow_lighten_2)"]]],
  /* Unchecked checkbox icons inherit the dim gray_030; lift them for contrast. */
  [
    ".xmail-ui-checkbox .ui-checkbox-icon-uncheck .ui-checkbox-uncheck-icon",
    [["color", "var(--base_gray_060)"]],
  ],
  [".xmail-ui-icon-loading > svg > path[fill=\"#192636\"]", [["fill", "var(--base_gray_100)"]]],
  [
    ".xmail-ui-icon-loading > svg stop[stop-color=\"#192636\"]",
    [["stop-color", "var(--base_gray_100)"]],
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
 * Split a selector list on commas that sit at the top level, so a comma inside
 * `:is(...)`/`:not(...)` does not get mistaken for a selector separator.
 */
function splitSelectorList(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < selector.length; index += 1) {
    const char = selector[index];
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (char === "," && depth === 0) {
      parts.push(selector.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(selector.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

/**
 * Every rule is anchored with `body` on top of the theme gate. QQ's own rules
 * use `body.page-color-theme <selector>`; the extra element step keeps ours
 * strictly more specific so it wins no matter which sheet loads last.
 */
function rulesLines(gate: string, rules: readonly Rule[]): string[] {
  const lines: string[] = [];
  for (const [selector, declarations] of rules) {
    const head = splitSelectorList(selector)
      .map((part) => `body ${part}`)
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
    ...tokenLines(SCROLLBAR_TOKENS),
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
    `${body} ${COMPOSE_CONTENT_SELECTOR} {`,
    "  background-color: #1A2028 !important;",
    "  color: #E8ECF1 !important;",
    "  caret-color: #E8ECF1 !important;",
    "  --editor-quote-border-color: #3A4049 !important;",
    "  --editor-todo-box-bg-color: #1A2028 !important;",
    "  --editor-todo-box-border-color: #A0A8B2 !important;",
    "  --editor-todo-tick-color: #E8ECF1 !important;",
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
