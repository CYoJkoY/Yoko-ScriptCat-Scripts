import type { TurnRecord } from "./turns";

export interface TurnTextIndexOptions {
  /** Extract the searchable text of one turn. */
  extract: (turn: Element) => string;
}

export interface TurnTextIndex {
  /**
   * Align the index with the current DOM order. Surviving turns keep their
   * extracted text; new turns are queued and removed turns are dropped.
   */
  reconcile(turns: readonly Element[]): void;
  /** Queue one already indexed turn for re-extraction. */
  markDirty(turn: Element): void;
  hasTurn(turn: Element): boolean;
  /** Ordered snapshot; the same record objects are reused across calls. */
  getRecords(): TurnRecord[];
  /**
   * Extract queued turns. `budgetMs` caps one slice of work; leave it out to
   * drain the queue. Returns the number of turns still pending.
   */
  flush(options?: { budgetMs?: number }): number;
  pendingCount(): number;
  clear(): void;
}

/**
 * Incremental text index for conversation turns.
 *
 * Extraction is the expensive part of turn indexing, so it runs on a queue
 * instead of inside the structural sync. A turn that never changes keeps its
 * text for the lifetime of the conversation.
 */
export function createTurnTextIndex(
  options: TurnTextIndexOptions,
): TurnTextIndex {
  const records = new Map<Element, TurnRecord>();
  const pending = new Set<Element>();
  let snapshot: TurnRecord[] = [];

  function reconcile(turns: readonly Element[]): void {
    const live = new Set(turns);
    for (const element of Array.from(records.keys())) {
      if (live.has(element)) continue;
      records.delete(element);
      pending.delete(element);
    }

    snapshot = turns.map((element, index) => {
      let record = records.get(element);
      if (!record) {
        record = { id: index, element, text: "" };
        records.set(element, record);
        pending.add(element);
      }
      record.id = index;
      return record;
    });
  }

  function markDirty(turn: Element): void {
    if (!records.has(turn)) return;
    pending.add(turn);
  }

  function hasTurn(turn: Element): boolean {
    return records.has(turn);
  }

  function getRecords(): TurnRecord[] {
    return snapshot;
  }

  function flush(flushOptions: { budgetMs?: number } = {}): number {
    const budgetMs = flushOptions.budgetMs;
    const startedAt = budgetMs === undefined ? 0 : performance.now();

    for (const element of pending) {
      if (
        budgetMs !== undefined &&
        performance.now() - startedAt >= budgetMs
      ) {
        break;
      }
      pending.delete(element);
      const record = records.get(element);
      if (!record || !element.isConnected) continue;
      record.text = options.extract(element);
    }

    return pending.size;
  }

  function pendingCount(): number {
    return pending.size;
  }

  function clear(): void {
    records.clear();
    pending.clear();
    snapshot = [];
  }

  return {
    reconcile,
    markDirty,
    hasTurn,
    getRecords,
    flush,
    pendingCount,
    clear,
  };
}
