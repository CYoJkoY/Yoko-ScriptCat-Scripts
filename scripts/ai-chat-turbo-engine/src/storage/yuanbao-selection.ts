import { STORAGE_KEY_YUANBAO_SELECTION } from "../config";
import { reportRecoverableError } from "../core/diagnostics";
import {
  isObjectRecord,
  reasoningScope,
} from "./reasoning-memory";
import { createReportedStorage } from "./reported";

const selectionStore = createReportedStorage("localStorage", (failure) => {
  const scope =
    failure.operation === "write" || failure.operation === "remove"
      ? "save Yuanbao selection"
      : "load Yuanbao selection";
  reportRecoverableError(scope, failure.error);
});

const MAX_LABEL = 120;

export interface YuanbaoSelectionRecord {
  model?: string;
  mode?: string;
  ts?: number;
}

export type YuanbaoSelectionMemory = Record<string, YuanbaoSelectionRecord>;

function cleanLabel(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_LABEL);
}

function toSelectionRecord(value: unknown): YuanbaoSelectionRecord | null {
  if (!isObjectRecord(value)) return null;
  const model = cleanLabel(value["model"]);
  const mode = cleanLabel(value["mode"]);
  if (!model && !mode) return null;
  const record: YuanbaoSelectionRecord = {};
  if (model) record.model = model;
  if (mode) record.mode = mode;
  const ts = value["ts"];
  if (typeof ts === "number" && Number.isFinite(ts)) record.ts = ts;
  return record;
}

export function loadYuanbaoSelectionMemory(): YuanbaoSelectionMemory {
  try {
    const raw = selectionStore.read(STORAGE_KEY_YUANBAO_SELECTION);
    const parsed: unknown = raw === null || raw === "" ? {} : JSON.parse(raw);
    if (!isObjectRecord(parsed)) return {};
    const memory: YuanbaoSelectionMemory = {};
    for (const [scope, entry] of Object.entries(parsed)) {
      const record = toSelectionRecord(entry);
      if (record) memory[scope] = record;
    }
    return memory;
  } catch (error: unknown) {
    reportRecoverableError("load Yuanbao selection", error);
    return {};
  }
}

export function saveYuanbaoSelectionMemory(
  memory: YuanbaoSelectionMemory,
): void {
  selectionStore.writeJson(STORAGE_KEY_YUANBAO_SELECTION, memory);
}

export function readYuanbaoSelectionRecord(
  memory?: YuanbaoSelectionMemory,
): YuanbaoSelectionRecord | null {
  const all = memory ?? loadYuanbaoSelectionMemory();
  return all[reasoningScope()] ?? all[location.hostname] ?? null;
}

export function writeYuanbaoSelectionRecord(
  record: YuanbaoSelectionRecord,
): YuanbaoSelectionRecord {
  const memory = loadYuanbaoSelectionMemory();
  const scope = reasoningScope();
  memory[scope] = record;
  if (scope !== location.hostname) delete memory[location.hostname];
  saveYuanbaoSelectionMemory(memory);
  return record;
}

export function clearYuanbaoSelectionRecord(): void {
  const memory = loadYuanbaoSelectionMemory();
  delete memory[reasoningScope()];
  delete memory[location.hostname];
  saveYuanbaoSelectionMemory(memory);
}
