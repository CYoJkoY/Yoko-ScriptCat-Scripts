import { CONFIDENCE } from "../config";
import type { ParsedQuota } from "../types";
import { discoverAccountPrefix, getAccountPrefix } from "./account";
import { parseBatchExecuteResponse } from "./batch";
import { commitOfficialQuota } from "./cache";
import { RPC_TIMEOUT_MS, USAGE_RPC_ARGS, USAGE_RPC_ID } from "./constants";
import { origFetch } from "./orig";
import { sanitizeMetric } from "./quota";
import { quotaState } from "./state";
import { toEpochMs } from "./time";

type UnknownRecord = Record<string, unknown>;

export const usageSyncDiag = {
  rpcError: "",
  helperError: "",
};

export interface OfficialUsageRequest {
  url: string;
  body: string;
  prefix: string;
  rpcId: string;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readWizGlobalData(): UnknownRecord | null {
  const value: unknown = Reflect.get(window, "WIZ_global_data");
  return isRecord(value) ? value : null;
}

export function parseUsageRpcPayload(
  payload: unknown,
  nowMs = Date.now(),
): ParsedQuota | null {
  if (!Array.isArray(payload) || !Array.isArray(payload[1])) return null;
  const result: ParsedQuota = {
    timestamp: nowMs,
    fiveHour: null,
    weekly: null,
  };
  for (const row of payload[1]) {
    if (!Array.isArray(row)) continue;
    // row[0] semantics vary per account and window and may be 0 when exhausted;
    // it is not a validity signal, so it is intentionally not read.
    const fraction: unknown = row[1];
    const period: unknown = row[2];
    const resets: unknown = row[3];
    const kind = period === 1 ? "fiveHour" : period === 2 ? "weekly" : null;
    if (kind === null) continue;
    // Multiple rows for one window: the first usable row wins.
    if (result[kind] !== null) continue;
    if (
      typeof fraction !== "number" ||
      !Number.isFinite(fraction) ||
      fraction < 0
    ) {
      continue;
    }
    if (!Array.isArray(resets) || !Array.isArray(resets[0])) continue;
    const seconds: unknown = resets[0][0];
    const rawNanos: unknown = resets[0].length > 1 ? resets[0][1] : 0;
    if (
      !Number.isSafeInteger(seconds) ||
      !Number.isInteger(rawNanos) ||
      typeof rawNanos !== "number" ||
      rawNanos < 0 ||
      rawNanos >= 1e9
    ) {
      continue;
    }
    if (typeof seconds !== "number") continue;
    const resetAt = toEpochMs(
      seconds * 1000 + Math.floor(rawNanos / 1e6),
      nowMs,
    );
    if (resetAt === null) continue;
    const usedPct = Math.min(100, Math.max(0, Math.round(fraction * 100)));
    result[kind] = sanitizeMetric(
      { pct: 100 - usedPct, usedPct, resetAt, confidence: CONFIDENCE.pools },
      kind,
      nowMs,
    );
  }
  return result.fiveHour !== null || result.weekly !== null ? result : null;
}

export function buildOfficialUsageRequest(): OfficialUsageRequest | null {
  const wiz = readWizGlobalData();
  if (!wiz) return null;
  const token: unknown = wiz["SNlM0e"];
  if (typeof token !== "string" || token.length === 0) return null;
  const rpcId = USAGE_RPC_ID;
  const args = USAGE_RPC_ARGS;
  const prefix = discoverAccountPrefix();
  if (!prefix) return null;
  const url = new URL(
    prefix + "/_/BardChatUi/data/batchexecute",
    window.location.origin,
  );
  const params = new Map<string, string>([
    ["rpcids", rpcId],
    ["source-path", prefix + "/usage"],
    ["hl", "en"],
    ["_reqid", String((Date.now() % 900000) + 100000)],
    ["rt", "c"],
  ]);
  const bl: unknown = wiz["cfb2h"];
  if (typeof bl === "string") params.set("bl", bl);
  const fsid: unknown = wiz["FdrFJe"];
  if (typeof fsid === "string") params.set("f.sid", fsid);
  for (const [key, value] of params) url.searchParams.set(key, value);
  const body = new URLSearchParams({
    "f.req": JSON.stringify([[[rpcId, args, null, "generic"]]]),
    at: token,
  }).toString();
  return { url: url.href, body, prefix, rpcId };
}

/** Send one batchexecute call with the page session and decode wrb.fr frames. */
export async function postUsageRpc(
  url: string,
  body: string,
): Promise<ReturnType<typeof parseBatchExecuteResponse>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    const response = await origFetch.call(window, url, {
      method: "POST",
      credentials: "include",
      signal: controller.signal,
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded;charset=UTF-8",
        "X-Same-Domain": "1",
      },
      body,
    });
    if (!response.ok) {
      throw new Error("官方用量请求失败 (HTTP " + response.status + ")");
    }
    if (response.redirected === true) {
      throw new Error("官方用量请求发生重定向，已忽略响应");
    }
    return parseBatchExecuteResponse(await response.text());
  } finally {
    clearTimeout(timeout);
  }
}

export async function requestOfficialUsageRpc(): Promise<boolean> {
  const request = buildOfficialUsageRequest();
  if (request === null) {
    usageSyncDiag.rpcError = "官方页面登录参数尚未就绪";
    quotaState.lastError = "官方页面登录参数尚未就绪，将自动重试";
    return false;
  }
  try {
    const frames = await postUsageRpc(request.url, request.body);
    const currentPrefix = getAccountPrefix();
    if (currentPrefix !== request.prefix) {
      throw new Error("账号已变化，已忽略旧账号响应");
    }
    for (const frame of frames) {
      if (frame.rpcId !== request.rpcId) continue;
      const parsed = parseUsageRpcPayload(frame.payload);
      if (parsed !== null && commitOfficialQuota(parsed, "rpc", true)) {
        usageSyncDiag.rpcError = "";
        return true;
      }
    }
    usageSyncDiag.rpcError = "响应未包含可验证的用量字段";
    quotaState.lastError = "官方响应未包含可验证的用量字段，将自动重试";
  } catch (error) {
    usageSyncDiag.rpcError =
      error instanceof Error ? error.message : "官方用量请求失败";
    quotaState.lastError = usageSyncDiag.rpcError;
  }
  return false;
}

/**
 * Replay the jSf9Qc request the official /usage page already issued. It keeps
 * whatever args shape Google ships, and only runs for the current account.
 */
export async function replayCapturedQuotaRpc(): Promise<boolean> {
  const captured = quotaState.capturedQuotaRpc;
  if (
    !captured ||
    captured.rpcId !== USAGE_RPC_ID ||
    typeof captured.url !== "string" ||
    typeof captured.body !== "string"
  ) {
    return false;
  }
  const prefix = discoverAccountPrefix();
  if (!prefix) return false;
  try {
    const url = new URL(captured.url, window.location.origin);
    if (url.origin !== window.location.origin) return false;
    const pathPrefix = url.pathname.match(/^(\/u\/\d+)\//);
    if (!pathPrefix || pathPrefix[1] !== prefix) return false;

    const body = new URLSearchParams(captured.body);
    const wiz = readWizGlobalData();
    const token: unknown = wiz ? wiz["SNlM0e"] : null;
    if (
      typeof token === "string" &&
      token.length > 0 &&
      body.has("at")
    ) {
      body.set("at", token);
    }
    const response = await origFetch.call(window, url.href, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "X-Same-Domain": "1",
      },
      body: body.toString(),
    });
    if (!response.ok || response.redirected === true) return false;
    const frames = parseBatchExecuteResponse(await response.text());
    if (getAccountPrefix() !== prefix) return false;
    for (const frame of frames) {
      if (frame.rpcId !== USAGE_RPC_ID) continue;
      const parsed = parseUsageRpcPayload(frame.payload);
      if (parsed !== null && commitOfficialQuota(parsed, "rpc", true)) {
        usageSyncDiag.rpcError = "";
        return true;
      }
    }
  } catch {
    // Replay failures fall through to the token-built RPC; the later attempt
    // overwrites the diagnostic reason.
  }
  return false;
}
