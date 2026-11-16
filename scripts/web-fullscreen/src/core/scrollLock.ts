import { SCROLL_LOCK_PROPERTIES, type StyleDeclaration } from "../config";
import {
  applyStyles,
  captureStyles,
  restoreStyles,
  type StyleSnapshot,
} from "./styles";

const HIDDEN_OVERFLOW: readonly StyleDeclaration[] = [
  ["overflow-x", "hidden"],
  ["overflow-y", "hidden"],
];

export function lockDocumentScroll(doc: Document): StyleSnapshot[] {
  const targets = [doc.documentElement, doc.body].filter(
    (element): element is HTMLElement => element !== null,
  );
  return targets.map((element) => {
    const snapshot = captureStyles(element, SCROLL_LOCK_PROPERTIES);
    applyStyles(element, HIDDEN_OVERFLOW);
    return snapshot;
  });
}

export interface ScrollLock {
  acquire(): () => void;
}

/**
 * Video fullscreen and iframe promotion can be requested at the same time.
 * A shared lock keeps the page scrollable only after both owners have exited.
 */
export function createScrollLock(doc: Document): ScrollLock {
  let snapshots: StyleSnapshot[] | null = null;
  let owners = 0;

  const releaseAll = (): void => {
    if (snapshots === null) return;
    const captured = snapshots;
    snapshots = null;
    for (let index = captured.length - 1; index >= 0; index -= 1) {
      const snapshot = captured[index];
      if (snapshot !== undefined) restoreStyles(snapshot);
    }
  };

  return {
    acquire() {
      if (snapshots === null) snapshots = lockDocumentScroll(doc);
      owners += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        owners = Math.max(0, owners - 1);
        if (owners === 0) releaseAll();
      };
    },
  };
}
