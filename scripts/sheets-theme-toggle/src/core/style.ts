import {
  BUTTON_CLASS,
  FLOATING_ATTRIBUTE,
  STYLE_ID,
  THEME_ATTRIBUTE,
  THEME_MODE,
} from "../config";

const SURFACE_DARK = "#202124";

function darkGate(): string {
  return `html[${THEME_ATTRIBUTE}="${THEME_MODE.DARK}"]`;
}

export function buildThemeCss(): string {
  const gate = darkGate();
  const button = `button.${BUTTON_CLASS}`;
  const floating = `${button}[${FLOATING_ATTRIBUTE}]`;
  const appSurfaces = [
    "#docs-chrome",
    "#docs-bars",
    "#docs-toolbar-wrapper",
    "#docs-editor",
    ".grid-container",
  ].join(",\n");

  return [
    "/* Dark theme: restyle Google's editing chrome without changing document colours. */",
    `${gate} {`,
    `  background-color: ${SURFACE_DARK};`,
    "}",
    "",
    `${appSurfaces} {`,
    `  background-color: ${SURFACE_DARK};`,
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
    "  background-color: transparent;",
    "  color: #e8eaed;",
    "}",
    "",
    `${gate} ${button}:hover {`,
    "  background-color: rgba(255, 255, 255, 0.1);",
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
  // The DOM types declare a root element that a document being created at
  // `document-start` may not have yet, so the guard is real, not defensive noise.
  const parent: Element | null = doc.head ?? doc.documentElement;
  if (parent === null) return;
  parent.append(style);
}

export function removeThemeStyle(doc: Document): void {
  doc.getElementById(STYLE_ID)?.remove();
}
