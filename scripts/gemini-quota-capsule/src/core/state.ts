import type { Metric, QuotaState } from "../types";

function emptyMetric(): Metric {
  return {
    pct: null,
    usedPct: null,
    used: null,
    limit: null,
    resetAt: null,
    rawResetText: "",
    confidence: 0,
    updatedAt: 0,
  };
}

export const quotaState: QuotaState = {
  source: "init",
  isSyncing: false,
  syncPhase: "",
  lastSyncTime: 0,
  lastError: "",
  fiveHour: emptyMetric(),
  weekly: emptyMetric(),
  capturedQuotaRpc: null,
  usagePageStatus: null,
};

export const parseRejectDiag = {
  cssLike: 0,
  barePercent: 0,
  unverifiedFull: 0,
};

export const usageParseDiag = {
  blocks: 0,
  initHit: false,
  domHit: false,
  textHit: false,
  frameAttempts: 0,
  frameLoads: 0,
  frameBlocked: false,
  frameRedirected: false,
  frameTimeout: false,
  frameTextLength: 0,
  frameParsed: false,
  frameReason: "",
  helperAttempts: 0,
  helperOK: false,
  helperReason: "",
};

let uiUpdater: (() => void) | null = null;

export function setUiUpdater(updater: () => void): void {
  uiUpdater = updater;
}

export function requestUiUpdate(): void {
  if (uiUpdater) uiUpdater();
}

