import { CSS_TARGETS } from "../config";
import { config } from "../storage";

export type AttributeValue =
  | string
  | number
  | boolean
  | EventListener
  | null
  | undefined;

export type ElementAttrs = Record<string, AttributeValue>;

export type ChildNodeInput = Node | string | number | null | undefined;

export type ElementChildren = ChildNodeInput[] | ChildNodeInput;

// Native DOM builders. No innerHTML is used anywhere in this script, so the
// pill keeps working under CSP Trusted Types policies.
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: ElementAttrs = {},
  children: ElementChildren = [],
): HTMLElementTagNameMap[K] {
  const elem = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) continue;
    if (key === "style" && typeof value === "string") {
      elem.style.cssText = value;
    } else if (key === "className") {
      elem.className = String(value);
    } else if (key.startsWith("on") && typeof value === "function") {
      elem.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      elem.setAttribute(key, String(value));
    }
  }
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined) continue;
    if (typeof child === "string" || typeof child === "number") {
      elem.appendChild(document.createTextNode(String(child)));
    } else if (child instanceof Node) {
      elem.appendChild(child);
    }
  }
  return elem;
}

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: ElementAttrs = {},
  children: ElementChildren = [],
): SVGElementTagNameMap[K] {
  const elem = document.createElementNS(
    "http://www.w3.org/2000/svg",
    tag,
  );
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null) {
      elem.setAttribute(key, String(value));
    }
  }
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child instanceof Node) {
      elem.appendChild(child);
    }
  }
  return elem;
}

// The UI refreshes on a timer; writing only changed values avoids pointless
// MutationObserver records, style recalculation and text node replacement.
export function setTextIfChanged(node: Element | null, value: string): void {
  if (node && node.textContent !== value) node.textContent = value;
}

export function setVarIfChanged(
  node: HTMLElement | null,
  name: string,
  value: string,
): void {
  if (node && node.style.getPropertyValue(name) !== value) {
    node.style.setProperty(name, value);
  }
}

export function setTitleIfChanged(node: HTMLElement | null, value: string): void {
  if (node && node.title !== value) node.title = value;
}

export function setAttrIfChanged(
  node: Element | null,
  name: string,
  value: string,
): void {
  if (node && node.getAttribute(name) !== value) node.setAttribute(name, value);
}

export function buildCustomCss(): string {
  const rules: string[] = [];
  for (const target of CSS_TARGETS) {
    const declarations = config.css[target.key];
    if (!declarations) continue;
    rules.push(
      `#gc-pill-root [data-gc-part="${target.key}"] {\n${declarations}\n}`,
    );
  }
  return rules.join("\n");
}

export function applyCustomCss(): void {
  let styleElement = document.getElementById("gc-pill-custom-style");
  if (!styleElement) {
    const created = document.createElement("style");
    created.id = "gc-pill-custom-style";
    (document.head || document.documentElement).appendChild(created);
    styleElement = created;
  }
  styleElement.textContent = buildCustomCss();
}
