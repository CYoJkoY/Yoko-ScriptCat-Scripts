export const READER_VOTE_SELECTOR = ".image-text__vote, .article-vote, .vote-container";
const CONTROL_SELECTOR = "button, input, select, textarea, label, a[href], [role=button], [class*=vote-item], [class*=vote-submit]";
let componentSequence = 0;

/** Keep a native component mirrored without rebuilding the surrounding article. */
export function bindReaderInteraction(clone: Element, source: Element, includeNode: (node: Node) => boolean = () => true): { refresh: () => void; dispose: () => void } {
  let native = source;
  const parent = source.parentElement;
  const slot = parent === null ? -1 : Array.from(parent.children).indexOf(source);
  let mapping = new WeakMap<Node, Node>();
  let disposed = false;
  const radioGroupPrefix = "hbu-reader-" + (++componentSequence) + "-";

  const mirror = (copy: Node, original: Node): void => {
    mapping.set(copy, original);
    // Embedded media has its own suspension and restoration lifecycle.
    if (original instanceof Element && original.matches("iframe, video, audio, embed, object")) return;
    if (copy instanceof Element && original instanceof Element) {
      for (const attribute of Array.from(copy.attributes)) {
        if (!original.hasAttribute(attribute.name)) copy.removeAttribute(attribute.name);
      }
      for (const attribute of Array.from(original.attributes)) {
        const value = attribute.name === "name" && original instanceof HTMLInputElement && original.type === "radio"
          ? radioGroupPrefix + attribute.value : attribute.value;
        if (copy.getAttribute(attribute.name) !== value) copy.setAttribute(attribute.name, value);
      }
      if (copy instanceof HTMLInputElement && original instanceof HTMLInputElement) {
        copy.checked = original.checked;
        if (copy.value !== original.value) copy.value = original.value;
        copy.indeterminate = original.indeterminate;
      }
      if (copy instanceof HTMLTextAreaElement && original instanceof HTMLTextAreaElement && copy.value !== original.value) copy.value = original.value;
      if (copy instanceof HTMLOptionElement && original instanceof HTMLOptionElement) copy.selected = original.selected;
    } else if (copy.nodeValue !== original.nodeValue) copy.nodeValue = original.nodeValue;
    const originals = Array.from(original.childNodes).filter(includeNode);
    for (const [index, child] of originals.entries()) {
      let copied: Node | undefined = copy.childNodes[index];
      if (copied === undefined || copied.nodeType !== child.nodeType || copied.nodeName !== child.nodeName) {
        const replacement = child.cloneNode(true);
        if (copied === undefined) copy.appendChild(replacement);
        else copy.replaceChild(replacement, copied);
        copied = replacement;
      }
      mirror(copied, child);
    }
    while (copy.childNodes.length > originals.length) copy.removeChild(copy.lastChild!);
  };

  const refresh = (): void => {
    if (disposed) return;
    if (!native.isConnected && parent !== null) {
      const replacement = parent.children[slot];
      if (replacement === undefined || replacement.tagName !== source.tagName
        || source.matches(READER_VOTE_SELECTOR) && !replacement.matches(READER_VOTE_SELECTOR)) {
        mapping = new WeakMap<Node, Node>();
        return;
      }
      native = replacement;
    }
    mapping = new WeakMap<Node, Node>();
    mirror(clone, native);
  };

  const forward = (event: Event): void => {
    if (!(event.target instanceof Element)) return;
    if (event.type === "submit") {
      event.preventDefault();
      event.stopImmediatePropagation();
      const form = mapping.get(event.target);
      if (form instanceof HTMLFormElement) {
        const submitter = event instanceof SubmitEvent && event.submitter !== null ? mapping.get(event.submitter) : undefined;
        form.requestSubmit(submitter instanceof HTMLElement ? submitter : undefined);
      }
      return;
    }
    const control = event.target.closest(CONTROL_SELECTOR);
    if (control === null || !clone.contains(control)) return;
    const target = mapping.get(event.target);
    if (!(target instanceof Element)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === "click") {
      if (target instanceof HTMLElement) target.click();
      else target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }
    else {
      const proxy = event.target;
      if (proxy instanceof HTMLInputElement && target instanceof HTMLInputElement) {
        target.value = proxy.value;
        target.checked = proxy.checked;
      } else if (proxy instanceof HTMLTextAreaElement && target instanceof HTMLTextAreaElement) target.value = proxy.value;
      else if (proxy instanceof HTMLSelectElement && target instanceof HTMLSelectElement) {
        for (const [index, option] of Array.from(proxy.options).entries()) target.options[index]!.selected = option.selected;
      }
      target.dispatchEvent(new Event(event.type, { bubbles: true }));
    }
    // A cancelled checkbox click restores its default state after this listener.
    queueMicrotask(refresh);
  };

  refresh();
  const observer = new MutationObserver(refresh);
  observer.observe(parent || native, { subtree: true, childList: true, attributes: true, characterData: true });
  for (const type of ["click", "input", "change", "submit"]) clone.addEventListener(type, forward, true);
  parent?.addEventListener("input", refresh);
  parent?.addEventListener("change", refresh);
  return { refresh, dispose: () => {
    disposed = true;
    observer.disconnect();
    mapping = new WeakMap<Node, Node>();
    for (const type of ["click", "input", "change", "submit"]) clone.removeEventListener(type, forward, true);
    parent?.removeEventListener("input", refresh);
    parent?.removeEventListener("change", refresh);
  } };
}
