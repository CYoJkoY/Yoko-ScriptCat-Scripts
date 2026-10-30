export const USERSCRIPT_HEADER_OPEN = "==UserScript==";
export const USERSCRIPT_HEADER_CLOSE = "==/UserScript==";

export type UserscriptGrant = "none" | "GM_getValue" | "GM_setValue" | "GM_deleteValue" | "GM_listValues" | "GM_addStyle" | "unsafeWindow";

export interface UserscriptMeta {
  readonly name: string;
  readonly namespace: string;
  readonly version: string;
  readonly description: string;
  readonly author: string;
  readonly match: readonly string[];
  readonly grant?: readonly UserscriptGrant[];
  readonly runAt?: "document-start" | "document-end" | "document-idle";
  readonly noframes?: boolean;
  readonly icon?: string;
  readonly license?: string;
  readonly homepageURL?: string;
  readonly supportURL?: string;
  readonly updateURL?: string;
  readonly downloadURL?: string;
}

const HEADER_FIELD_WIDTH = 13;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const RUN_AT_VALUES: readonly NonNullable<UserscriptMeta["runAt"]>[] = ["document-start", "document-end", "document-idle"];
const GRANT_VALUES: readonly UserscriptGrant[] = [
  "none",
  "GM_getValue",
  "GM_setValue",
  "GM_deleteValue",
  "GM_listValues",
  "GM_addStyle",
  "unsafeWindow",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string") {
    throw new Error(`Userscript metadata field "${field}" must be a string`);
  }
  return requireSingleLine(field, value);
}

function readOptionalString(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error(`Userscript metadata field "${field}" must be a string`);
  }
  return requireSingleLine(field, value);
}

function readStringList(record: Record<string, unknown>, field: string): string[] {
  const value = record[field];
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Userscript metadata field "${field}" must be a non-empty array`);
  }
  return value.map((entry: unknown) => {
    if (typeof entry !== "string") {
      throw new Error(`Userscript metadata field "${field}" must contain strings`);
    }
    return requireSingleLine(field, entry);
  });
}

function readRunAt(record: Record<string, unknown>): NonNullable<UserscriptMeta["runAt"]> | undefined {
  const value = record["runAt"];
  if (value === undefined) return undefined;
  // The includes() check below is the guard; the cast only satisfies its parameter type.
  if (typeof value !== "string" || !RUN_AT_VALUES.includes(value as (typeof RUN_AT_VALUES)[number])) {
    throw new Error(`Userscript metadata field "runAt" must be one of ${RUN_AT_VALUES.join(", ")}`);
  }
  // Narrowed to a member of RUN_AT_VALUES by the check above.
  return value as (typeof RUN_AT_VALUES)[number];
}

function readGrants(record: Record<string, unknown>): UserscriptGrant[] | undefined {
  const value = record["grant"];
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new Error('Userscript metadata field "grant" must be an array');
  }
  return value.map((entry: unknown) => {
    // Same pattern as readRunAt: includes() proves membership before the cast.
    if (typeof entry !== "string" || !GRANT_VALUES.includes(entry as UserscriptGrant)) {
      throw new Error(`Unsupported userscript grant: ${String(entry)}`);
    }
    // Narrowed to a supported grant by the check above.
    return entry as UserscriptGrant;
  });
}

export function parseUserscriptMeta(value: unknown): UserscriptMeta {
  if (!isRecord(value)) {
    throw new Error("Userscript metadata must be an object");
  }
  const runAt = readRunAt(value);
  const grant = readGrants(value);
  const noframes = value["noframes"];
  if (noframes !== undefined && typeof noframes !== "boolean") {
    throw new Error('Userscript metadata field "noframes" must be a boolean');
  }
  const icon = readOptionalString(value, "icon");
  const license = readOptionalString(value, "license");
  const homepageURL = readOptionalString(value, "homepageURL");
  const supportURL = readOptionalString(value, "supportURL");
  const updateURL = readOptionalString(value, "updateURL");
  const downloadURL = readOptionalString(value, "downloadURL");
  return assertUserscriptMeta({
    name: readRequiredString(value, "name"),
    namespace: readRequiredString(value, "namespace"),
    version: readRequiredString(value, "version"),
    description: readRequiredString(value, "description"),
    author: readRequiredString(value, "author"),
    match: readStringList(value, "match"),
    ...(grant === undefined ? {} : { grant }),
    ...(runAt === undefined ? {} : { runAt }),
    ...(noframes === undefined ? {} : { noframes }),
    ...(icon === undefined ? {} : { icon }),
    ...(license === undefined ? {} : { license }),
    ...(homepageURL === undefined ? {} : { homepageURL }),
    ...(supportURL === undefined ? {} : { supportURL }),
    ...(updateURL === undefined ? {} : { updateURL }),
    ...(downloadURL === undefined ? {} : { downloadURL }),
  });
}

function requireSingleLine(field: string, value: string): string {
  if (value.length === 0) {
    throw new Error(`Userscript metadata field "${field}" must not be empty`);
  }
  if (value.includes("\n") || value.includes("\r")) {
    throw new Error(`Userscript metadata field "${field}" must stay on one line`);
  }
  return value;
}

function renderLine(key: string, value?: string): string | null {
  if (value === undefined) return null;
  return `// @${key.padEnd(HEADER_FIELD_WIDTH)}${requireSingleLine(key, value)}`;
}

export function assertUserscriptMeta(value: UserscriptMeta): UserscriptMeta {
  if (value.match.length === 0) {
    throw new Error("Userscript metadata requires at least one @match entry");
  }
  if (!VERSION_PATTERN.test(value.version)) {
    throw new Error(`Userscript version "${value.version}" is not an exact semantic version`);
  }
  requireSingleLine("name", value.name);
  requireSingleLine("namespace", value.namespace);
  requireSingleLine("description", value.description);
  requireSingleLine("author", value.author);
  for (const match of value.match) requireSingleLine("match", match);
  for (const grant of value.grant ?? ["none"]) requireSingleLine("grant", grant);
  return value;
}

export function renderUserscriptHeader(meta: UserscriptMeta): string {
  assertUserscriptMeta(meta);
  const lines = [
    `// ${USERSCRIPT_HEADER_OPEN}`,
    renderLine("name", meta.name),
    renderLine("namespace", meta.namespace),
    renderLine("version", meta.version),
    renderLine("description", meta.description),
    renderLine("author", meta.author),
    renderLine("homepageURL", meta.homepageURL),
    renderLine("supportURL", meta.supportURL),
    renderLine("updateURL", meta.updateURL),
    renderLine("downloadURL", meta.downloadURL),
    ...meta.match.map((entry) => renderLine("match", entry)),
    renderLine("run-at", meta.runAt),
    ...(meta.grant ?? ["none"]).map((entry) => renderLine("grant", entry)),
    meta.noframes === true ? "// @noframes" : null,
    renderLine("icon", meta.icon),
    renderLine("license", meta.license),
  ];
  const body = lines.filter((line): line is string => line !== null);
  body.push(`// ${USERSCRIPT_HEADER_CLOSE}`);
  return `${body.join("\n")}\n`;
}
