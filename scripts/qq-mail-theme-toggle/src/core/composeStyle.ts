import { COMPOSE_CONTENT_SELECTOR, COMPOSE_STYLE_ID, THEME_ATTRIBUTE, THEME_MODE } from "../config";

export function createComposePalette(doc: Document) {
  const declarations = new Map<HTMLElement, CSSStyleDeclaration>();
  const selectors = new WeakMap<Element, string>();

  const selectorFor = (element: Element): string => {
    const saved = selectors.get(element);
    if (saved !== undefined) return saved;
    const parent = element.parentElement;
    if (parent === null) return `html[${THEME_ATTRIBUTE}="${THEME_MODE.DARK}"]`;
    const position = Array.from(parent.children).indexOf(element) + 1;
    const boundary = element.matches(COMPOSE_CONTENT_SELECTOR) ? COMPOSE_CONTENT_SELECTOR : "";
    const selector = `${selectorFor(parent)} > ${boundary}:nth-child(${position})`;
    selectors.set(element, selector);
    return selector;
  };

  return {
    write(element: HTMLElement, property: string, value: string): boolean {
      if (element.style.getPropertyPriority(property) === "important") return false;
      const style = declarations.get(element) ?? doc.createElement("span").style;
      style.setProperty(property, value, "important");
      declarations.set(element, style);
      return true;
    },
    mount(): HTMLStyleElement | null {
      if (declarations.size === 0) return null;
      const style = doc.createElement("style");
      style.id = COMPOSE_STYLE_ID;
      style.textContent = Array.from(declarations, ([element, palette]) =>
        `${selectorFor(element)} { ${palette.cssText} }`,
      ).join("\n");
      (doc.head ?? doc.documentElement).append(style);
      return style;
    },
  };
}
