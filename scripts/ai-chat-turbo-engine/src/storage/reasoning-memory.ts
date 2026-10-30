import { STORAGE_KEY_REASONING } from "../config";
import { reportRecoverableError } from "../core/diagnostics";

export interface ReasoningRecord {
  mode: "choice" | "toggle";
  key?: string;
  controlLabel?: string;
  path?: string[];
  option?: string;
  hint?: string;
  resultLabel?: string;
  label?: string;
  on?: boolean;
  ts?: number;
}

export type ReasoningMemory = Record<string, ReasoningRecord>;

/** Shared guard for JSON payloads read from localStorage or sessionStorage. */
export function isObjectRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toReasoningRecord(value: unknown): ReasoningRecord | null {
  if (!isObjectRecord(value)) return null;
  const mode = value["mode"];
  if (mode !== "choice" && mode !== "toggle") return null;
  const record: ReasoningRecord = { mode };
  const key = value["key"];
  if (typeof key === "string") record.key = key;
  const controlLabel = value["controlLabel"];
  if (typeof controlLabel === "string") record.controlLabel = controlLabel;
  const option = value["option"];
  if (typeof option === "string") record.option = option;
  const hint = value["hint"];
  if (typeof hint === "string") record.hint = hint;
  const resultLabel = value["resultLabel"];
  if (typeof resultLabel === "string") record.resultLabel = resultLabel;
  const label = value["label"];
  if (typeof label === "string") record.label = label;
  const on = value["on"];
  if (typeof on === "boolean") record.on = on;
  const ts = value["ts"];
  if (typeof ts === "number") record.ts = ts;
  const path = value["path"];
  if (Array.isArray(path)) {
    record.path = path.filter((part): part is string => typeof part === "string");
  }
  return record;
}

export function loadReasoningMemory(): ReasoningMemory {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY_REASONING) || "{}",
    );
    if (!isObjectRecord(parsed)) return {};
    const memory: ReasoningMemory = {};
    for (const [scope, entry] of Object.entries(parsed)) {
      const record = toReasoningRecord(entry);
      if (record) memory[scope] = record;
    }
    return memory;
  } catch (error: unknown) {
    reportRecoverableError("load reasoning memory", error);
    return {};
  }
}

export function saveReasoningMemory(memory: ReasoningMemory): void {
  try {
    localStorage.setItem(STORAGE_KEY_REASONING, JSON.stringify(memory));
  } catch (error: unknown) {
    reportRecoverableError("save reasoning memory", error);
  }
}

/** Gemini account slots (/u/0, /u/1, ...) keep independent reasoning memories. */
export function reasoningScope(): string {
  const account = location.pathname.match(/^\/u\/(\d+)(?:\/|$)/);
  return account ? `${location.hostname}#u${account[1]}` : location.hostname;
}

export function readReasoningRecord(
  memory?: ReasoningMemory,
): ReasoningRecord | null {
  const all = memory ?? loadReasoningMemory();
  const scoped = all[reasoningScope()];
  if (scoped) return scoped;
  return all[location.hostname] ?? null;
}

export function writeReasoningRecord(record: ReasoningRecord): ReasoningRecord {
  const memory = loadReasoningMemory();
  const scope = reasoningScope();
  memory[scope] = record;
  // A scoped write supersedes the old hostname-wide record.
  if (scope !== location.hostname) delete memory[location.hostname];
  saveReasoningMemory(memory);
  return record;
}

export function clearReasoningRecord(): void {
  const memory = loadReasoningMemory();
  delete memory[reasoningScope()];
  delete memory[location.hostname];
  saveReasoningMemory(memory);
}
