/** Query typed elements without asserting through unknown DOM shapes. */
export function queryElement<T extends Element>(
  root: ParentNode,
  selector: string,
  guard: (value: Element) => value is T,
): T | null {
  const element = root.querySelector(selector);
  return element !== null && guard(element) ? element : null;
}

export function queryElements<T extends Element>(
  root: ParentNode,
  selector: string,
  guard: (value: Element) => value is T,
): T[] {
  return [...root.querySelectorAll(selector)].filter(guard);
}

export function isHtmlInput(value: Element): value is HTMLInputElement {
  return value instanceof HTMLInputElement;
}

export function isHtmlButton(value: Element): value is HTMLButtonElement {
  return value instanceof HTMLButtonElement;
}

export function isHtmlTextArea(value: Element): value is HTMLTextAreaElement {
  return value instanceof HTMLTextAreaElement;
}
