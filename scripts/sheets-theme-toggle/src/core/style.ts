import {
  BUTTON_CLASS,
  FLOATING_ATTRIBUTE,
  STYLE_ID,
  THEME_ATTRIBUTE,
  THEME_MODE,
} from "../config";

/** Google's own dark surfaces, so the chrome matches the rest of Google's UI. */
const SURFACE_DARK = "#202124";
const SURFACE_RAISED_DARK = "#292a2d";
const SURFACE_TAB_DARK = "#2d2f31";
const SURFACE_TAB_ACTIVE_DARK = "#3c4043";

const TEXT_DARK = "#e8eaed";
const TEXT_ACCENT_DARK = "#8ab4f8";
const TEXT_MUTED_DARK = "#9aa0a6";
const BORDER_DARK = "#5f6368";

/** The colour Google paints its toolbar glyphs with in the light theme. */
const ICON_LIGHT = "#444746";
const HOVER_OVERLAY_LIGHT = "rgba(68, 71, 70, 0.08)";
const ACTIVE_OVERLAY_LIGHT = "rgba(68, 71, 70, 0.16)";
const HOVER_OVERLAY_DARK = "rgba(255, 255, 255, 0.08)";
const ACTIVE_OVERLAY_DARK = "rgba(255, 255, 255, 0.16)";

function darkGate(): string {
  return `html[${THEME_ATTRIBUTE}="${THEME_MODE.DARK}"]`;
}

/**
 * Build one rule from a gate and a set of selectors it must prefix, so the
 * generated CSS keeps a single colour per surface instead of repeating it.
 */
function darkRule(selectors: readonly string[], declarations: readonly string[]): string {
  const gate = darkGate();
  return [
    selectors.map((selector) => `${gate} ${selector}`).join(",\n") + " {",
    ...declarations.map((declaration) => `  ${declaration};`),
    "}",
  ].join("\n");
}

/**
 * Text and background colours for the top shell. The sheet itself is painted
 * into a canvas, so it is deliberately absent: darkening it would recolour the
 * author's cells, images and charts.
 */
const CHROME_SURFACES: readonly string[] = Object.freeze([
  "#docs-chrome",
  "#docs-header",
  "#docs-titlebar-container",
  "#docs-bars",
  "#docs-toolbar",
  "#docs-toolbar-wrapper",
  "#docs-additional-bars",
  "#docs-menubar",
  "#formula-bar-name-box-wrapper",
  "table#grid-bottom-bar",
]);

/** Toolbar glyphs are `content: url(...)` images, so only a filter recolours them. */
const CHROME_ICONS: readonly string[] = Object.freeze([
  "#docs-chrome .docs-icon-img",
  "#docs-chrome .docs-icon-img-container",
  "#formula-bar .docs-icon-img",
  "#formula-bar .docs-icon-img-container",
  "#grid-bottom-bar .docs-icon-img",
  "#grid-bottom-bar .docs-icon-img-container",
  ".goog-menu .docs-icon-img",
  ".goog-menu .docs-icon-img-container",
]);

/**
 * Google paints most of the chrome from Material 3 custom properties: toolbar
 * buttons, comboboxes and inputs all take their background from
 * `--gm3-sys-color-surface*` and their glyph colour from `--gm3-sys-color-on-surface*`.
 * Re-declaring those properties on the chrome subtree makes Google's own rules
 * resolve to dark values, which beats writing a more specific selector for every
 * widget. If Google ever renames a property, the explicit rules below still hold.
 */
const CHROME_TOKEN_HOSTS: readonly string[] = Object.freeze([
  "#docs-chrome",
  "#grid-bottom-bar",
  ".goog-menu",
]);

const DARK_TOKENS: readonly string[] = Object.freeze([
  `--gm3-sys-color-surface: ${SURFACE_DARK}`,
  `--gm3-sys-color-surface-container-lowest: ${SURFACE_DARK}`,
  `--gm3-sys-color-surface-container-low: ${SURFACE_DARK}`,
  `--gm3-sys-color-surface-container: ${SURFACE_DARK}`,
  `--gm3-sys-color-surface-container-high: ${SURFACE_RAISED_DARK}`,
  "--gm3-sys-color-surface-container-highest: #303134",
  `--gm3-sys-color-on-surface: ${TEXT_DARK}`,
  "--gm3-sys-color-on-surface-variant: #c4c7c5",
  `--gm3-sys-color-outline: ${BORDER_DARK}`,
  "--gm3-sys-color-outline-variant: #444746",
]);

const TOOLBAR_CONTROLS: readonly string[] = Object.freeze([
  ".menu-button.goog-control",
  ".goog-control",
  ".goog-toolbar-button",
  ".goog-toolbar-menu-button",
  ".goog-toolbar-toggle-button",
]);

const TOOLBAR_LABELS: readonly string[] = Object.freeze([
  ".docs-title-input",
  ".docs-title-input-label",
  ".docs-title-input-label-inner",
  ".docs-title-untitled",
]);

export function buildThemeCss(): string {
  const gate = darkGate();
  const button = `button.${BUTTON_CLASS}`;
  const floating = `${button}[${FLOATING_ATTRIBUTE}]`;

  return [
    "/* Dark theme restyles the editor chrome only; the sheet keeps its pixels. */",
    `${gate} {`,
    `  background-color: ${SURFACE_DARK};`,
    "}",
    "",
    darkRule(CHROME_TOKEN_HOSTS, DARK_TOKENS),
    "",
    darkRule(CHROME_SURFACES, [
      `background-color: ${SURFACE_DARK}`,
      `color: ${TEXT_DARK}`,
      `border-color: ${BORDER_DARK}`,
    ]),
    "",
    // The name box and the formula input do not inherit colour from the bar.
    darkRule(["#formula-bar", "#t-name-box", "#t-formula-bar-input"], [
      `background-color: ${SURFACE_RAISED_DARK}`,
      `color: ${TEXT_DARK}`,
      `border-color: ${BORDER_DARK}`,
    ]),
    "",
    darkRule([...TOOLBAR_CONTROLS, ...TOOLBAR_LABELS], [`color: ${TEXT_DARK}`]),
    "",
    // Google paints hover and toggle states with light overlays that would turn
    // into bright blocks on a dark toolbar.
    darkRule(
      [
        ".goog-toolbar-button-hover",
        ".goog-toolbar-menu-button-hover",
        ".goog-toolbar-button-checked",
        ".goog-toolbar-toggle-button.goog-toolbar-button-checked",
      ],
      [`background-color: ${HOVER_OVERLAY_DARK}`],
    ),
    "",
    darkRule(
      [".goog-toolbar-button-active", ".goog-toolbar-menu-button-active"],
      [`background-color: ${ACTIVE_OVERLAY_DARK}`],
    ),
    "",
    darkRule(
      [
        ".goog-toolbar-button .goog-toolbar-button-inner-box",
        ".goog-toolbar-menu-button .goog-toolbar-menu-button-inner-box",
      ],
      ["background-color: transparent"],
    ),
    "",
    darkRule([".goog-toolbar-separator"], [`border-color: ${BORDER_DARK}`]),
    "",
    darkRule([".docs-sheet-tab"], [
      `background-color: ${SURFACE_TAB_DARK}`,
      `color: ${TEXT_DARK}`,
    ]),
    "",
    darkRule([".docs-sheet-tab.docs-sheet-active-tab"], [
      `background-color: ${SURFACE_TAB_ACTIVE_DARK}`,
    ]),
    "",
    darkRule([".docs-sheet-tab-name"], [`color: ${TEXT_DARK}`]),
    "",
    darkRule([".docs-sheet-tab.docs-sheet-active-tab .docs-sheet-tab-name"], [
      `color: ${TEXT_ACCENT_DARK}`,
    ]),
    "",
    // Menus render in their own layer above the page, so they need the same
    // treatment; the palette popup keeps its swatch colours and only its frame
    // is darkened.
    darkRule([".goog-menu", ".goog-menu.goog-menu-vertical"], [
      `background-color: ${SURFACE_RAISED_DARK}`,
      `color: ${TEXT_DARK}`,
      `border-color: ${BORDER_DARK}`,
    ]),
    "",
    darkRule([".goog-menuitem", ".goog-menuitem-content"], [`color: ${TEXT_DARK}`]),
    "",
    darkRule([".goog-menuitem-highlight"], [
      `background-color: ${SURFACE_TAB_ACTIVE_DARK}`,
    ]),
    "",
    darkRule([".goog-menuitem-disabled .goog-menuitem-content"], [
      `color: ${TEXT_MUTED_DARK}`,
    ]),
    "",
    darkRule([".goog-menuseparator"], [`border-color: ${BORDER_DARK}`]),
    "",
    // The formula bar's divider is a 1px white strip, not a border.
    darkRule(["#docs-chrome .formula-bar-separator"], [
      `background-color: ${BORDER_DARK}`,
    ]),
    "",
    darkRule([".goog-palette"], [`background-color: ${SURFACE_DARK}`]),
    "",
    darkRule([".docs-sheet-comment-indicator-text"], [`color: ${TEXT_DARK}`]),
    "",
    // Toolbar glyphs are dark images rather than `currentColor` masks, so the
    // dark surfaces above would hide them. Inverting only these icon boxes (never
    // the sheet, its media or the colour swatches) restores them in light grey.
    darkRule(CHROME_ICONS, ["filter: invert(1)"]),
    "",
    "/* Toggle button: a compact icon button sized for Google's toolbar row. */",
    `${button} {`,
    "  display: inline-flex;",
    "  align-items: center;",
    "  justify-content: center;",
    "  box-sizing: border-box;",
    "  width: 28px;",
    "  height: 28px;",
    "  margin: 0 2px;",
    "  padding: 0;",
    "  border: 0;",
    "  border-radius: 50%;",
    "  background: transparent;",
    `  color: ${ICON_LIGHT};`,
    "  font: inherit;",
    "  line-height: 1;",
    "  vertical-align: middle;",
    "  cursor: pointer;",
    "}",
    "",
    `${button}:hover {`,
    `  background-color: ${HOVER_OVERLAY_LIGHT};`,
    "}",
    "",
    `${button}:active {`,
    `  background-color: ${ACTIVE_OVERLAY_LIGHT};`,
    "}",
    "",
    `${button}:focus-visible {`,
    "  outline: 2px solid #1a73e8;",
    "  outline-offset: 2px;",
    "}",
    "",
    `${button} > svg {`,
    "  display: block;",
    "  width: 18px;",
    "  height: 18px;",
    "  pointer-events: none;",
    "}",
    "",
    `${gate} ${button} {`,
    `  color: ${TEXT_DARK};`,
    "}",
    "",
    `${gate} ${button}:hover {`,
    `  background-color: ${HOVER_OVERLAY_DARK};`,
    "}",
    "",
    `${gate} ${button}:active {`,
    `  background-color: ${ACTIVE_OVERLAY_DARK};`,
    "}",
    "",
    "/* Fallback: the editor chrome never rendered, so pin the button to the view. */",
    `${floating} {`,
    "  position: fixed;",
    "  right: 16px;",
    "  bottom: 16px;",
    "  z-index: 2147483000;",
    "  background-color: #ffffff;",
    "  box-shadow: 0 1px 3px rgba(60, 64, 67, 0.3), 0 4px 8px 3px rgba(60, 64, 67, 0.15);",
    "}",
    "",
    `${gate} ${floating} {`,
    `  background-color: ${SURFACE_DARK};`,
    "}",
    "",
  ].join("\n");
}

/**
 * The style sheet is inert until the dark attribute is set, so it can be
 * injected at `document-start` even before `<head>` exists.
 */
export function ensureThemeStyle(doc: Document): void {
  if (doc.getElementById(STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = buildThemeCss();
  // The DOM types declare a root element that a document being created at
  // `document-start` may not have yet, so the guard is real, not defensive noise.
  const parent: Element | null = doc.head ?? doc.documentElement;
  if (parent === null) return;
  parent.append(style);
}

export function removeThemeStyle(doc: Document): void {
  doc.getElementById(STYLE_ID)?.remove();
}
