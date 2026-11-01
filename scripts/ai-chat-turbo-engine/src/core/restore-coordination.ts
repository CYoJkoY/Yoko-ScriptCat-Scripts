export type RestoreOwner = "reasoning" | "tools";

export interface RestoreCoordinator {
  setPending(owner: RestoreOwner, pending: boolean): void;
  isPending(owner: RestoreOwner): boolean;
  tryAcquire(owner: RestoreOwner): boolean;
  release(owner: RestoreOwner): void;
  activeOwner(): RestoreOwner | null;
}

/**
 * Gives reasoning restores priority over tool restores and keeps their
 * popup interactions from overlapping. The lock is idempotent for its owner
 * so a retry can continue without releasing and racing another restore.
 */
export function createRestoreCoordinator(): RestoreCoordinator {
  let active: RestoreOwner | null = null;
  const pending: Record<RestoreOwner, boolean> = {
    reasoning: false,
    tools: false,
  };
  return {
    setPending(owner: RestoreOwner, value: boolean): void {
      pending[owner] = value;
    },
    isPending(owner: RestoreOwner): boolean {
      return pending[owner];
    },
    tryAcquire(owner: RestoreOwner): boolean {
      if (active === null || active === owner) {
        active = owner;
        return true;
      }
      return false;
    },
    release(owner: RestoreOwner): void {
      if (active === owner) active = null;
    },
    activeOwner(): RestoreOwner | null {
      return active;
    },
  };
}
