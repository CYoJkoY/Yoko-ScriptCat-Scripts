import {
  BUTTON_CLASS,
  FLOATING_ATTRIBUTE,
  STYLE_ID,
  THEME_ATTRIBUTE,
  THEME_MODE,
} from "../config";

/**
 * The grid of a Google spreadsheet is painted into a single `<canvas>`, so no
 * surface override can reach it: inverting the painted result is the only way
 * to darken the document area. Photographs and video inside the page are
 * inverted a second time so they keep their real colours.
 */
const KEEP_ORIGINAL_COLOURS_TAGS: readonly string[] = Object.freeze([
  "img",
  "video",
  "picture",
]);

const INVERT_DECLARATION = "filter: invert(1) hue-rotate(180deg);";

function darkGate(): string {
  return `html[${THEME_ATTRIBUTE}="${THEME_MODE.DARK}"]`;
}

/**
 * The button is inverted a second time while the dark theme is active, which
 * cancels the page-wide inversion for that one node. Its own colours therefore
 * render exactly as authored, and the dark variants below stay readable.
 */
export function buildThemeCss(): string {
  const gate = darkGate();
  const button = `button.${BUTTON_CLASS}`;
  const floating = `${button}[${FLOATING_ATTRIBUTE}]`;
  const keepOriginal = KEEP_ORIGINAL_COLOURS_TAGS.map((tag) => `${gate} ${tag}`).join(",\n");

  return [
    "/* Dark theme: invert the painted page, then restore media colours. */",
    `${gate} {`,
    "  background-color: #ffffff;",
    `  ${INVERT_DECLARATION}`,
    "}",
    "",
    `${keepOriginal} {`,
    `  ${INVERT_DECLARATION}`,
    "}",
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
    "  color: #5f6368;",
    "  font: inherit;",
    "  line-height: 1;",
    "  vertical-align: middle;",
    "  cursor: pointer;",
    "}",
    "",
    `${button}:hover {`,
    "  background-color: rgba(60, 64, 67, 0.08);",
    "}",
    "",
    `${button}:active {`,
    "  background-color: rgba(60, 64, 67, 0.16);",
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
    `  ${INVERT_DECLARATION}`,
    "  color: #e8eaed;",
    "}",
    "",
    `${gate} ${button}:hover {`,
    "  background-color: rgba(232, 234, 237, 0.12);",
    "}",
    "",
    `${gate} ${button}:active {`,
    "  background-color: rgba(232, 234, 237, 0.2);",
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
    "  background-color: #202124;",
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
  const parent = doc.head ?? doc.documentElement;
  parent.append(style);
}

export function removeThemeStyle(doc: Document): void {
  doc.getElementById(STYLE_ID)?.remove();
}
