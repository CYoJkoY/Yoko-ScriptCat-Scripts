import { TURN_MARKER_ATTRIBUTES } from "../config";

export interface MutationClassificationContext {
  /** Selector for the turn elements of the active turn selector group. */
  turnSelector: string;
  /** Engine-owned nodes whose mutations must be ignored. */
  isIgnoredTarget: (target: Element) => boolean;
  /** Closest indexed turn around a mutation node, if any. */
  findTurnAncestor: (node: Node) => Element | null;
}

export interface MutationClassification {
  /** A resync of turn discovery and dehydration is required. */
  requestUpdate: boolean;
  /** New or removed turn containers were seen. */
  turnStructureChanged: boolean;
  /** Indexed turns whose text may have changed. */
  dirtyTurns: Set<Element>;
  /** Subtrees that may contain new or changed code blocks. */
  codeRoots: Set<Element>;
}

/**
 * Sort one mutation batch into the work it actually requires.
 *
 * Content that changes inside an already indexed turn is the streaming fast
 * path: it only marks that turn dirty, so a running answer never forces a full
 * conversation rescan. Turn discovery is requested only when a turn container
 * appears or disappears outside the indexed set.
 */
export function classifyMutations(
  records: readonly MutationRecord[],
  context: MutationClassificationContext,
): MutationClassification {
  const dirtyTurns = new Set<Element>();
  const codeRoots = new Set<Element>();
  let requestUpdate = false;
  let turnStructureChanged = false;

  const matchesTurn = (element: Element): boolean => {
    if (!context.turnSelector) return false;
    try {
      return element.matches(context.turnSelector);
    } catch {
      return false;
    }
  };

  for (const record of records) {
    const target = record.target;
    if (target instanceof Element && context.isIgnoredTarget(target)) {
      continue;
    }

    const indexedTurn = context.findTurnAncestor(target);

    if (record.type === "attributes") {
      const attributeName = record.attributeName ?? "";
      if (!TURN_MARKER_ATTRIBUTES.has(attributeName)) continue;
      /* A known turn keeps its identity; marker churn inside it is noise. */
      if (indexedTurn) continue;
      /* An unindexed node gained a turn marker: the selector group may be new. */
      turnStructureChanged = true;
      requestUpdate = true;
      continue;
    }

    if (indexedTurn) {
      dirtyTurns.add(indexedTurn);
      const codeRoot =
        target instanceof Element ? target : target.parentElement;
      if (codeRoot) codeRoots.add(codeRoot);
      continue;
    }

    if (record.type === "characterData") {
      requestUpdate = true;
      continue;
    }

    requestUpdate = true;

    for (const node of [...record.addedNodes, ...record.removedNodes]) {
      if (!(node instanceof Element)) continue;
      if (matchesTurn(node)) turnStructureChanged = true;
      /* Only queue what was added; the parent may hold the whole history. */
      if (record.addedNodes.length) codeRoots.add(node);
    }
  }

  return { requestUpdate, turnStructureChanged, dirtyTurns, codeRoots };
}
