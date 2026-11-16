import {
  CONTAINING_BLOCK_PROPERTIES,
  CONTAINING_BLOCK_STYLES,
  type StyleDeclaration,
} from "../config";
import {
  applyStyles,
  captureStyles,
  type StyleSnapshot,
} from "./styles";

function parentElementOrShadowHost(element: HTMLElement): HTMLElement | null {
  const parent = element.parentElement;
  if (parent !== null) return parent;
  const root = element.getRootNode();
  if (!(root instanceof ShadowRoot)) return null;
  return root.host instanceof HTMLElement ? root.host : null;
}

/**
 * position: fixed is resolved against the nearest transformed, filtered or
 * contained ancestor, and its z-index is trapped inside any ancestor stacking
 * context. Both are neutralised while the target owns the viewport. Every
 * captured value is restored on exit.
 */
export function promoteToViewport(
  element: HTMLElement,
  properties: readonly string[],
  declarations: readonly StyleDeclaration[],
  snapshots: StyleSnapshot[],
): void {
  snapshots.push(captureStyles(element, properties));
  applyStyles(element, declarations);

  let ancestor = parentElementOrShadowHost(element);
  while (ancestor !== null) {
    snapshots.push(captureStyles(ancestor, CONTAINING_BLOCK_PROPERTIES));
    applyStyles(ancestor, CONTAINING_BLOCK_STYLES);
    ancestor = parentElementOrShadowHost(ancestor);
  }
}
