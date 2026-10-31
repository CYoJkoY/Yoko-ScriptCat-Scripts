import {
  DEFAULT_MESSAGE_LIMIT,
  MESSAGE_LIMIT_MAX,
  MESSAGE_LIMIT_MIN,
  STORAGE_KEY_CONFIG,
} from "./config";
import { reportRecoverableError } from "./core/diagnostics";
import { createReportedStorage } from "./storage/reported";
import type { TurnRecord } from "./core/turns";

/**
 * Reads and writes keep the released diagnostics: one message per failed
 * settings load or save, routed through the shared adapter.
 */
const configStore = createReportedStorage("localStorage", (failure) => {
  const scope =
    failure.operation === "write" || failure.operation === "remove"
      ? "save engine config"
      : "load saved engine config";
  reportRecoverableError(scope, failure.error);
});

/** Mutable engine state shared by the HUD, turn pruning, and code folding. */
export interface EngineState {
  pruneEnabled: boolean;
  keepTurns: number;
  messageLimit: number;
  collapseCode: boolean;
  virtualFileEnabled: boolean;
  rememberReasoning: boolean;
  rememberTools: boolean;
  hudOpen: boolean;
  totalTurns: number;
  hiddenCount: number;
  foldedCodeCount: number;
  indexedTurns: TurnRecord[];
}

/** Persisted subset of the engine state; key order matches the legacy payload. */
interface SavedEngineConfig {
  keepTurns: number;
  messageLimit: number;
  pruneEnabled: boolean;
  collapseCode: boolean;
  virtualFileEnabled: boolean;
  rememberReasoning: boolean;
  rememberTools: boolean;
}

export function createEngineState(): EngineState {
  return {
    pruneEnabled: true,
    keepTurns: 8,
    messageLimit: DEFAULT_MESSAGE_LIMIT,
    collapseCode: true,
    virtualFileEnabled: true,
    rememberReasoning: true,
    rememberTools: true,
    hudOpen: false,
    totalTurns: 0,
    hiddenCount: 0,
    foldedCodeCount: 0,
    indexedTurns: [],
  };
}

export function normalizeMessageLimit(rawLimit: unknown): number {
  const numericLimit = Number(rawLimit);
  if (!Number.isFinite(numericLimit)) return DEFAULT_MESSAGE_LIMIT;
  return Math.min(
    MESSAGE_LIMIT_MAX,
    Math.max(MESSAGE_LIMIT_MIN, Math.round(numericLimit)),
  );
}

function isSavedConfig(value: unknown): value is SavedEngineConfig {
  return typeof value === "object" && value !== null;
}

/** Read the stored settings; malformed payloads keep every default. */
export function loadSavedConfig(state: EngineState): void {
  try {
    const raw = configStore.read(STORAGE_KEY_CONFIG);
    if (raw === null || raw === "") return;
    const parsed: unknown = JSON.parse(raw);
    if (!isSavedConfig(parsed)) return;
    if (typeof parsed.keepTurns === "number" && !isNaN(parsed.keepTurns)) {
      state.keepTurns = Math.max(2, Math.min(50, parsed.keepTurns));
    }
    if (
      typeof parsed.messageLimit === "number" &&
      Number.isFinite(parsed.messageLimit)
    ) {
      state.messageLimit = normalizeMessageLimit(parsed.messageLimit);
    }
    if (typeof parsed.pruneEnabled === "boolean") {
      state.pruneEnabled = parsed.pruneEnabled;
    }
    if (typeof parsed.collapseCode === "boolean") {
      state.collapseCode = parsed.collapseCode;
    }
    if (typeof parsed.virtualFileEnabled === "boolean") {
      state.virtualFileEnabled = parsed.virtualFileEnabled;
    }
    if (typeof parsed.rememberReasoning === "boolean") {
      state.rememberReasoning = parsed.rememberReasoning;
    }
    if (typeof parsed.rememberTools === "boolean") {
      state.rememberTools = parsed.rememberTools;
    }
  } catch (error: unknown) {
    reportRecoverableError("load saved engine config", error);
  }
}

export function saveCurrentConfig(state: EngineState): void {
  try {
    const config: SavedEngineConfig = {
      keepTurns: state.keepTurns,
      messageLimit: state.messageLimit,
      pruneEnabled: state.pruneEnabled,
      collapseCode: state.collapseCode,
      virtualFileEnabled: state.virtualFileEnabled,
      rememberReasoning: state.rememberReasoning,
      rememberTools: state.rememberTools,
    };
    configStore.write(STORAGE_KEY_CONFIG, JSON.stringify(config));
  } catch (error: unknown) {
    reportRecoverableError("save engine config", error);
  }
}
