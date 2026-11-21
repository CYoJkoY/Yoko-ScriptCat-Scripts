import { BUTTON_CLASS, BUTTON_ID, BUTTON_LABELS, THEME_MODE, type ThemeMode } from "../config";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

interface IconShape {
  readonly tag: string;
  readonly attributes: Readonly<Record<string, string>>;
}

const SUN_SHAPES: readonly IconShape[] = Object.freeze([
  { tag: "circle", attributes: { cx: "12", cy: "12", r: "4.2" } },
  {
    tag: "path",
    attributes: {
      d: "M12 2.4v2.2M12 19.4v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.4 12h2.2M19.4 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6",
    },
  },
]);

const MOON_SHAPES: readonly IconShape[] = Object.freeze([
  {
    tag: "path",
    attributes: { d: "M20.2 14.6A8.6 8.6 0 0 1 9.4 3.8a8.6 8.6 0 1 0 10.8 10.8Z" },
  },
]);

/** The icon always shows the action: a moon invites the dark theme, a sun the light one. */
function createIcon(doc: Document, mode: ThemeMode): SVGSVGElement {
  const icon = doc.createElementNS(SVG_NAMESPACE, "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  const shapes = mode === THEME_MODE.DARK ? SUN_SHAPES : MOON_SHAPES;
  for (const shape of shapes) {
    const element = doc.createElementNS(SVG_NAMESPACE, shape.tag);
    element.setAttribute("fill", "none");
    element.setAttribute("stroke", "currentColor");
    element.setAttribute("stroke-width", "1.6");
    element.setAttribute("stroke-linecap", "round");
    element.setAttribute("stroke-linejoin", "round");
    for (const [name, value] of Object.entries(shape.attributes)) {
      element.setAttribute(name, value);
    }
    icon.append(element);
  }
  return icon;
}

export function describeThemeButton(mode: ThemeMode): string {
  return mode === THEME_MODE.DARK ? BUTTON_LABELS.toLight : BUTTON_LABELS.toDark;
}

export function updateThemeButton(button: HTMLButtonElement, mode: ThemeMode): void {
  const label = describeThemeButton(mode);
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
  button.setAttribute("aria-pressed", mode === THEME_MODE.DARK ? "true" : "false");
  button.replaceChildren(createIcon(button.ownerDocument, mode));
}

/**
 * A real `<button>` keeps native focus, Enter and Space handling, so the
 * toggle needs no keyboard glue of its own.
 */
export function createThemeButton(doc: Document, mode: ThemeMode): HTMLButtonElement {
  const button = doc.createElement("button");
  button.type = "button";
  button.id = BUTTON_ID;
  button.className = BUTTON_CLASS;
  updateThemeButton(button, mode);
  return button;
}
