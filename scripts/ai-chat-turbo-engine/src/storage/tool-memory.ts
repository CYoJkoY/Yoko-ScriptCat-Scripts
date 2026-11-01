import { STORAGE_KEY_TOOL_MEMORY } from "../config";
import { reportRecoverableError } from "../core/diagnostics";
import { createReportedStorage } from "./reported";
import { isObjectRecord, reasoningScope } from "./reasoning-memory";

const toolStore = createReportedStorage("localStorage", (failure) => {
  const scope =
    failure.operation === "write" || failure.operation === "remove"
      ? "save tool memory"
      : "load tool memory";
  reportRecoverableError(scope, failure.error);
});

const MAX_TOOLS = 40;
const MAX_LABEL = 120;
const MAX_APPLICATION_ID = 120;

export interface ToolRecord {
  key: string;
  controlLabel: string;
  applicationId: string;
  label: string;
  /** Labels written by 0.16.2 and earlier; used only for migration. */
  legacyLabels: string[];
  ts: number;
}

export type ToolMemory = Record<string, ToolRecord>;

function cleanLabel(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_LABEL);
}

function toToolRecord(value: unknown): ToolRecord | null {
  if (!isObjectRecord(value)) return null;
  const key = cleanLabel(value["key"]);
  const applicationId = cleanLabel(value["applicationId"]).slice(0, MAX_APPLICATION_ID);
  const label = cleanLabel(value["label"]);
  const selectedRaw = value["selected"];
  const legacyLabels: string[] = [];
  if (Array.isArray(selectedRaw)) {
    for (const entry of selectedRaw) {
      const legacy = cleanLabel(entry);
      if (!legacy || legacyLabels.includes(legacy)) continue;
      legacyLabels.push(legacy);
      if (legacyLabels.length >= MAX_TOOLS) break;
    }
  }
  if (!key || (!applicationId && !label && !legacyLabels.length)) return null;
  const controlLabel = cleanLabel(value["controlLabel"]);
  const ts = value["ts"];
  return {
    key,
    controlLabel,
    applicationId,
    label: label || legacyLabels[0] || "",
    legacyLabels,
    ts: typeof ts === "number" && Number.isFinite(ts) ? ts : 0,
  };
}

export function loadToolMemory(): ToolMemory {
  try {
    const raw = toolStore.read(STORAGE_KEY_TOOL_MEMORY);
    const parsed: unknown = raw === null || raw === "" ? {} : JSON.parse(raw);
    if (!isObjectRecord(parsed)) return {};
    const memory: ToolMemory = {};
    for (const [scope, entry] of Object.entries(parsed)) {
      const record = toToolRecord(entry);
      if (record) memory[scope] = record;
    }
    return memory;
  } catch (error: unknown) {
    reportRecoverableError("load tool memory", error);
    return {};
  }
}

export function saveToolMemory(memory: ToolMemory): void {
  toolStore.writeJson(STORAGE_KEY_TOOL_MEMORY, memory);
}

export function readToolRecord(memory?: ToolMemory): ToolRecord | null {
  const all = memory ?? loadToolMemory();
  const scoped = all[reasoningScope()];
  if (scoped) return scoped;
  return all[location.hostname] ?? null;
}

export function writeToolRecord(record: ToolRecord): ToolRecord {
  const memory = loadToolMemory();
  const scope = reasoningScope();
  memory[scope] = record;
  if (scope !== location.hostname) delete memory[location.hostname];
  saveToolMemory(memory);
  return record;
}

export function clearToolRecord(): void {
  const memory = loadToolMemory();
  delete memory[reasoningScope()];
  delete memory[location.hostname];
  saveToolMemory(memory);
}
