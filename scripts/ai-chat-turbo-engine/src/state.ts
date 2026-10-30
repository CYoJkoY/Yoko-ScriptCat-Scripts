import {
  DEFAULT_MESSAGE_LIMIT,
  MESSAGE_LIMIT_MAX,
  MESSAGE_LIMIT_MIN,
  STORAGE_KEY_CONFIG,
} from "./config";
import { reportRecoverableError } from "./core/diagnostics";
import type { TurnRecord } from "./core/turns";

/** Mutable engine state shared by the HUD, turn pruning, and code folding. */
export interface EngineState {
  pruneEnabled: boolean;
  keepTurns: number;
  messageLimit: number;
  collapseCode: boolean;
  virtualFileEnabled: boolean;
  rememberReasoning: boolean;
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
}

export function createEngineState(): EngineState {
  return {
    pruneEnabled: true,
    keepTurns: 8,
    messageLimit: DEFAULT_MESSAGE_LIMIT,
    collapseCode: true,
    virtualFileEnabled: true,
    rememberReasoning: true,
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
    const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
    if (!raw) return;
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
    };
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
  } catch (error: unknown) {
    reportRecoverableError("save engine config", error);
  }
}
