export type SyncOfficialUsage = (isManualClick?: boolean) => Promise<boolean>;

let syncTrigger: SyncOfficialUsage | null = null;

export function setSyncTrigger(trigger: SyncOfficialUsage): void {
  syncTrigger = trigger;
}

export function triggerOfficialSync(isManualClick: boolean): Promise<boolean> {
  if (!syncTrigger) return Promise.resolve(false);
  return syncTrigger(isManualClick);
}
