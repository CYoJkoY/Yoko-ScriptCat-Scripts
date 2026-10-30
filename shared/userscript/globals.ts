/** Narrow views of the userscript-manager globals this repository reads. */
export interface UserscriptInfo {
  readonly script: {
    readonly name?: string | undefined;
    readonly version?: string | undefined;
  };
}

export interface UserscriptGlobals {
  readonly GM_info?: UserscriptInfo;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readUserscriptInfo(scope: object): UserscriptInfo | null {
  if (!("GM_info" in scope)) return null;
  const candidate: unknown = scope.GM_info;
  if (!isRecord(candidate)) return null;
  const script: unknown = candidate["script"];
  if (!isRecord(script)) return null;
  const name = typeof script["name"] === "string" ? script["name"] : undefined;
  const version = typeof script["version"] === "string" ? script["version"] : undefined;
  return { script: { name, version } };
}
