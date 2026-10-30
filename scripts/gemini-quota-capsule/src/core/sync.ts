import {
  AUTO_SYNC_HEARTBEAT_MS,
  AUTO_SYNC_INTERVAL_MS,
  HELPER_SYNC_HASH_KEY,
  STORAGE_KEY_SYNC_BRIDGE,
  USAGE_FRAME_BLANK_GRACE_MS,
  USAGE_FRAME_HEIGHT_PX,
  USAGE_FRAME_RETRY_COOLDOWN_MS,
  USAGE_FRAME_TIMEOUT_MS,
  USAGE_FRAME_WIDTH_PX,
  USAGE_HELPER_TIMEOUT_MS,
  USAGE_HELPER_WAIT_MS,
} from "../config";
import type {
  HelperSyncResult,
  ParsedQuota,
  SyncBridgePayload,
} from "../types";
import {
  discoverAccountPrefix,
  getAccountPrefix,
  getOfficialUsageUrl,
  isSameUsagePath,
  noteAccountPrefix,
} from "./account";
import { commitOfficialQuota } from "./cache";
import { shortenUrl } from "./diagnostics";
import { origFetch } from "./orig";
import { parseHtmlDocument, parseUsageDocument } from "./parsing";
import { replayCapturedQuotaRpc, requestOfficialUsageRpc, usageSyncDiag } from "./rpc";
import { localStore } from "../storage/browser";
import { setSyncTrigger } from "./runtime";
import { quotaState, requestUiUpdate, usageParseDiag } from "./state";

export interface PendingUsageHelper {
  nonce: string;
  finish: (payload: SyncBridgePayload | null) => void;
  promise: Promise<HelperSyncResult> | null;
  window: Window | null;
}

let activeSyncPromise: Promise<boolean> | null = null;
let probeIframeEl: HTMLIFrameElement | null = null;
let renderedUsageFrameBlockedUntil = 0;
let pendingUsageHelper: PendingUsageHelper | null = null;
let nextAutomaticSyncAt = 0;
let automaticFailureCount = 0;
let deferredAutomaticSync: ReturnType<typeof setTimeout> | null = null;

export function getPendingUsageHelper(): PendingUsageHelper | null {
  return pendingUsageHelper;
}

export function getAutomaticFailureCount(): number {
  return automaticFailureCount;
}

export function readHelperSyncNonce(): string | null {
  try {
    const hash = window.location.hash || "";
    if (!hash.startsWith("#")) return null;
    const params = new URLSearchParams(hash.slice(1));
    const nonce = params.get(HELPER_SYNC_HASH_KEY);
    return typeof nonce === "string" && nonce ? nonce : null;
  } catch {
    return null;
  }
}

export function buildUsageHelperUrl(
  nonce: string,
  preferredUrl?: string | null,
): string {
  const base = preferredUrl || getOfficialUsageUrl();
  const url = new URL(base, window.location.origin);
  url.hash = `${HELPER_SYNC_HASH_KEY}=${encodeURIComponent(nonce)}`;
  return url.toString();
}

export function readSyncBridgePayload(raw: unknown): SyncBridgePayload | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (!("nonce" in parsed)) return null;
    const nonce: unknown = parsed.nonce;
    if (typeof nonce !== "string" || !nonce) return null;
    // Single assertion: parsed is a non-null object whose nonce is a string;
    // the remaining helper fields stay unknown until they are validated.
    return parsed as SyncBridgePayload;
  } catch {
    return null;
  }
}

export function applyUsageHelperPayload(
  payload: HelperSyncResult | null,
): boolean {
  if (!payload || payload.ok !== true) return false;
  if (!payload.fiveHour && !payload.weekly) return false;
  const committed = commitOfficialQuota(
    {
      timestamp:
        typeof payload.timestamp === "number" && Number.isFinite(payload.timestamp)
          ? payload.timestamp
          : Date.now(),
      fiveHour: payload.fiveHour || null,
      weekly: payload.weekly || null,
      strategy: "usage-text",
    },
    "usage-page",
    false,
  );
  if (committed) usageParseDiag.textHit = true;
  return committed;
}

/**
 * Top-level background tab mode: only the complete official /usage page
 * renders real text. On success the result is written to the sync bridge, the
 * original page picks it up through the storage event, and this tab closes.
 */
export function runUsageHelperSync(nonce: string): void {
  const deadline = Date.now() + USAGE_HELPER_TIMEOUT_MS;
  let finished = false;
  let partialResult: ParsedQuota | null = null;
  let partialTimer: ReturnType<typeof setTimeout> | null = null;
  let pollId: ReturnType<typeof setInterval> | null = null;

  const finish = (result: ParsedQuota | null, reason: string): void => {
    if (finished) return;
    finished = true;
    if (pollId) clearInterval(pollId);
    if (partialTimer) clearTimeout(partialTimer);

    let payload: SyncBridgePayload;
    if (result) {
      result.timestamp = Date.now();
      commitOfficialQuota(result, "usage-page", true);
      payload = {
        nonce,
        ok: true,
        timestamp: result.timestamp,
        fiveHour: result.fiveHour || null,
        weekly: result.weekly || null,
        reason: "",
      };
    } else {
      payload = {
        nonce,
        ok: false,
        timestamp: Date.now(),
        fiveHour: null,
        weekly: null,
        reason: reason || "官方 /usage 页面未返回可解析的用量文本",
      };
    }

    // The official cache write is kept even when storage is unavailable.
    localStore.writeJson(STORAGE_KEY_SYNC_BRIDGE, payload);
    try {
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    } catch {
      // Address bar cleanup failures are ignored.
    }
    setTimeout(() => {
      try {
        window.close();
      } catch {
        // Browsers may refuse to close windows the script did not open.
      }
    }, 250);
  };

  const attempt = (): void => {
    if (finished) return;
    if (!document.body) {
      if (Date.now() >= deadline) finish(null, "官方 /usage 页面尚未就绪");
      return;
    }
    const parsed = parseUsageDocument(document, "");
    if (parsed && (parsed.fiveHour || parsed.weekly)) {
      const has5h =
        parsed.fiveHour &&
        (parsed.fiveHour.pct !== null || parsed.fiveHour.resetAt !== null);
      const has7d =
        parsed.weekly &&
        (parsed.weekly.pct !== null || parsed.weekly.resetAt !== null);
      if (has5h && has7d) {
        finish(parsed, "");
        return;
      }
      partialResult = parsed;
      if (!partialTimer) {
        partialTimer = setTimeout(() => {
          if (partialResult) finish(partialResult, "");
          else finish(null, "官方 /usage 页面未在限时内给出完整用量");
        }, 1500);
      }
      return;
    }
    if (Date.now() >= deadline) {
      if (partialResult) finish(partialResult, "");
      else finish(null, "官方 /usage 页面未在限时内呈现用量文本");
    }
  };

  document.addEventListener("DOMContentLoaded", attempt, { once: true });
  pollId = setInterval(attempt, 400);
  attempt();
}

/**
 * Reserve a background tab during the user gesture's synchronous phase.
 * Browsers only honor window.open while the click is being handled.
 */
function reserveUsageHelperWindow(): Window | null {
  let helperWindow: Window | null = null;
  try {
    helperWindow = window.open("about:blank", "_blank");
  } catch {
    helperWindow = null;
  }
  if (!helperWindow) return null;
  try {
    helperWindow.blur();
    window.focus();
  } catch {
    // Some browsers refuse programmatic focus changes.
  }
  return helperWindow;
}

function closeUsageHelperWindow(helperWindow: Window | null): void {
  if (!helperWindow) return;
  try {
    if (!helperWindow.closed) helperWindow.close();
  } catch {
    // Close failures are ignored.
  }
}

/**
 * Decide whether this manual sync is worth reserving a background tab for.
 * Only when the RPC already failed repeatedly and the same-origin iframe is in
 * its cooldown does the placeholder actually get used.
 */
function maybeReserveHelperWindow(): Window | null {
  if (/\/usage\/?$/.test(window.location.pathname)) return null;
  if (automaticFailureCount <= 0) return null;
  if (Date.now() >= renderedUsageFrameBlockedUntil) return null;
  return reserveUsageHelperWindow();
}

export function requestUsageHelperSync(
  preferredUrl: string | null,
  reservedWindow: Window | null = null,
): Promise<HelperSyncResult> {
  if (pendingUsageHelper && pendingUsageHelper.promise) {
    return pendingUsageHelper.promise;
  }

  const nonce = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  const helperUrl = buildUsageHelperUrl(nonce, preferredUrl);

  let helperWindow = reservedWindow;
  if (helperWindow) {
    let stillOpen = false;
    try {
      stillOpen = !helperWindow.closed;
    } catch {
      stillOpen = false;
    }
    if (stillOpen) {
      try {
        // about:blank is same-origin with this page, so navigation is allowed.
        helperWindow.location.replace(helperUrl);
      } catch {
        closeUsageHelperWindow(helperWindow);
        helperWindow = null;
      }
    } else {
      helperWindow = null;
    }
  }
  if (!helperWindow) {
    try {
      helperWindow = window.open(helperUrl, "_blank");
    } catch {
      helperWindow = null;
    }
  }
  if (!helperWindow) {
    usageParseDiag.helperReason = "浏览器拦截了后台用量页窗口";
    return Promise.resolve({
      ok: false,
      reason: usageParseDiag.helperReason,
    });
  }

  usageParseDiag.helperAttempts += 1;
  try {
    helperWindow.blur();
    window.focus();
  } catch {
    // Some browsers refuse programmatic focus changes.
  }

  const promise = new Promise<HelperSyncResult>((resolve) => {
    let settled = false;
    let pollId: ReturnType<typeof setInterval> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let closedCheckScheduled = false;

    const finish = (payload: SyncBridgePayload | null): void => {
      if (settled) return;
      settled = true;
      if (pollId) clearInterval(pollId);
      if (timer) clearTimeout(timer);
      if (pendingUsageHelper && pendingUsageHelper.nonce === nonce) {
        pendingUsageHelper = null;
      }
      const ok = payload !== null && payload.ok === true;
      usageParseDiag.helperOK = ok;
      if (payload && typeof payload.reason === "string" && payload.reason) {
        usageParseDiag.helperReason = payload.reason;
      }
      if (!ok) {
        try {
          if (helperWindow && !helperWindow.closed) helperWindow.close();
        } catch {
          // Close failures are ignored.
        }
      }
      resolve(
        payload
          ? {
              ok,
              reason: typeof payload.reason === "string" ? payload.reason : "",
              timestamp: payload.timestamp,
              fiveHour: payload.fiveHour,
              weekly: payload.weekly,
            }
          : {
              ok: false,
              reason: "后台用量页未返回同步结果",
            },
      );
    };

    const readBridge = (): void => {
      if (settled) return;
      const payload = readSyncBridgePayload(
        localStore.read(STORAGE_KEY_SYNC_BRIDGE),
      );
      if (payload && payload.nonce === nonce) finish(payload);
    };

    const helperHandle: PendingUsageHelper = {
      nonce,
      finish,
      promise: null,
      window: helperWindow,
    };
    pendingUsageHelper = helperHandle;

    pollId = setInterval(() => {
      readBridge();
      if (settled) return;
      let closed = false;
      try {
        closed = helperWindow ? helperWindow.closed : true;
      } catch {
        closed = false;
      }
      if (closed && !closedCheckScheduled) {
        closedCheckScheduled = true;
        setTimeout(() => {
          readBridge();
          if (!settled) {
            finish({
              nonce,
              ok: false,
              reason: "后台用量页已关闭，但没有返回可解析的用量文本",
            });
          }
        }, 500);
      }
    }, 250);

    timer = setTimeout(() => {
      readBridge();
      if (!settled) {
        finish({
          nonce,
          ok: false,
          reason: "后台用量页未在限时内返回用量文本",
        });
      }
    }, USAGE_HELPER_WAIT_MS);

    helperHandle.promise = promise;
  });

  return promise;
}

/**
 * Silently probe the official /usage page with a credentialed GET and parse
 * the usage data embedded in the SSR HTML.
 */
async function probeUsagePage(): Promise<{ result: ParsedQuota; url: string } | null> {
  const origin = window.location.origin;
  const prefix = discoverAccountPrefix();
  const candidates = prefix ? [origin + prefix + "/usage"] : [origin + "/usage"];
  for (const candidateUrl of candidates) {
    let candidatePath = "";
    try {
      candidatePath = new URL(candidateUrl, window.location.href).pathname;
    } catch {
      candidatePath = "";
    }
    if (!candidatePath) continue;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), USAGE_FRAME_TIMEOUT_MS);
    try {
      const response = await origFetch.call(window, candidateUrl, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });
      let finalUrl: URL | null = null;
      try {
        finalUrl = new URL(response.url || candidateUrl, window.location.href);
      } catch {
        finalUrl = null;
      }
      // The response must stay on this origin and, when the account prefix was
      // already known, on that same account path.
      const finalPath = finalUrl ? finalUrl.pathname : "";
      const sameAccount =
        finalUrl !== null &&
        finalUrl.origin === window.location.origin &&
        isSameUsagePath(finalPath, candidatePath, prefix === "");
      const resolvedPrefixMatch = finalPath.match(/^(\/u\/\d+)(?=\/)/);
      const resolvedPrefix = resolvedPrefixMatch ? resolvedPrefixMatch[1] ?? "" : "";
      quotaState.usagePageStatus = {
        url: shortenUrl(candidateUrl),
        status: response.status,
        finalUrl: shortenUrl(response.url || ""),
        redirected: response.redirected === true,
        missing: response.redirected === true && !/\/usage\/?$/.test(finalPath),
        sameAccount,
        resolvedPrefix,
        // A bare /usage resolves to Google's default account; that attribution
        // is best effort and is not proof of the account shown on this page.
        assumedAccount:
          sameAccount === true &&
          candidatePath === "/usage" &&
          resolvedPrefix !== "",
      };
      if (!sameAccount) continue;
      noteAccountPrefix(response.url || candidateUrl);
      if (!response.ok) continue;
      const rawHtml = await response.text();
      const doc = parseHtmlDocument(rawHtml);
      if (doc === null) continue;
      const parsed = parseUsageDocument(doc, rawHtml);
      if (parsed === null) continue;
      if (!parsed.fiveHour && !parsed.weekly) continue;
      return { result: parsed, url: candidateUrl };
    } catch {
      // Network errors and timeouts fall through to the next candidate.
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

function readIframeDocument(iframe: HTMLIFrameElement): Document | null {
  try {
    return (
      iframe.contentDocument ||
      (iframe.contentWindow && iframe.contentWindow.document) ||
      null
    );
  } catch {
    // frame-ancestors / X-Frame-Options make the document unreadable.
    return null;
  }
}

function markUsageFrameUnavailable(reason: string): void {
  usageParseDiag.frameBlocked = true;
  usageParseDiag.frameReason = reason;
  renderedUsageFrameBlockedUntil = Date.now() + USAGE_FRAME_RETRY_COOLDOWN_MS;
}

/**
 * Render the official /usage page in an off-screen same-origin iframe.
 * Only a response whose path matches the requested account path is accepted.
 */
function extractViaSameOriginUsageIframe(
  usageUrl: string,
  timeoutMs = USAGE_FRAME_TIMEOUT_MS,
): Promise<ParsedQuota | null> {
  return new Promise((resolve) => {
    if (!document.body) {
      resolve(null);
      return;
    }
    let requestedPath = "";
    try {
      requestedPath = new URL(usageUrl, window.location.href).pathname;
    } catch {
      resolve(null);
      return;
    }
    const allowBareRedirect =
      requestedPath === "/usage" && getAccountPrefix() === "";

    usageParseDiag.frameAttempts += 1;
    if (probeIframeEl && probeIframeEl.parentNode) {
      probeIframeEl.parentNode.removeChild(probeIframeEl);
    }
    const iframe = document.createElement("iframe");
    iframe.setAttribute("src", usageUrl);
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("tabindex", "-1");
    iframe.style.cssText = [
      "position:fixed",
      `width:${USAGE_FRAME_WIDTH_PX}px`,
      `height:${USAGE_FRAME_HEIGHT_PX}px`,
      "opacity:0",
      "pointer-events:none",
      "left:-20000px",
      "top:0",
      "border:0",
      "z-index:-1",
    ].join(";");
    probeIframeEl = iframe;

    let finished = false;
    let observer: MutationObserver | null = null;
    let pollId: ReturnType<typeof setInterval> | null = null;
    let partialTimer: ReturnType<typeof setTimeout> | null = null;
    let blankTimer: ReturnType<typeof setTimeout> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let partialResult: ParsedQuota | null = null;

    const done = (result: ParsedQuota | null, unavailableReason = ""): void => {
      if (finished) return;
      finished = true;
      if (pollId) clearInterval(pollId);
      if (partialTimer) clearTimeout(partialTimer);
      if (blankTimer) clearTimeout(blankTimer);
      if (timeoutId) clearTimeout(timeoutId);
      if (observer) observer.disconnect();
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      if (probeIframeEl === iframe) probeIframeEl = null;
      if (unavailableReason) markUsageFrameUnavailable(unavailableReason);
      resolve(result);
    };

    const verifyFramePath = (frameDoc: Document): boolean => {
      try {
        const framePath = new URL(frameDoc.URL, window.location.href).pathname;
        if (!isSameUsagePath(framePath, requestedPath, allowBareRedirect)) {
          usageParseDiag.frameRedirected = true;
          done(null, "官方 /usage 页面重定向到了其他账号");
          return false;
        }
        noteAccountPrefix(frameDoc.URL);
        return true;
      } catch {
        usageParseDiag.frameRedirected = true;
        done(null, "官方 /usage 页面地址无法校验");
        return false;
      }
    };

    const tryExtract = (): void => {
      if (finished) return;
      const frameDoc = readIframeDocument(iframe);
      if (!frameDoc || !frameDoc.body) return;
      if (!frameDoc.URL || frameDoc.URL === "about:blank") return;
      if (!verifyFramePath(frameDoc)) return;

      const text = frameDoc.body.innerText || frameDoc.body.textContent || "";
      usageParseDiag.frameTextLength = Math.max(
        usageParseDiag.frameTextLength,
        text.length,
      );
      const parsed = parseUsageDocument(frameDoc, "");
      if (!parsed || (!parsed.fiveHour && !parsed.weekly)) return;
      usageParseDiag.frameParsed = true;
      const has5h = !!(
        parsed.fiveHour &&
        (parsed.fiveHour.pct !== null || parsed.fiveHour.resetAt !== null)
      );
      const has7d = !!(
        parsed.weekly &&
        (parsed.weekly.pct !== null || parsed.weekly.resetAt !== null)
      );
      if (has5h && has7d) {
        done(parsed);
        return;
      }
      partialResult = parsed;
      if (!partialTimer) {
        partialTimer = setTimeout(() => done(partialResult), 1200);
      }
    };

    iframe.addEventListener("load", () => {
      usageParseDiag.frameLoads += 1;
      if (blankTimer) {
        clearTimeout(blankTimer);
        blankTimer = null;
      }
      const frameDoc = readIframeDocument(iframe);
      if (!frameDoc) {
        done(null, "官方 /usage 页面拒绝被同源 iframe 嵌入");
        return;
      }
      if (!frameDoc.URL || frameDoc.URL === "about:blank") {
        blankTimer = setTimeout(() => {
          blankTimer = null;
          const pendingDoc = readIframeDocument(iframe);
          if (!pendingDoc || !pendingDoc.URL || pendingDoc.URL === "about:blank") {
            done(null, "同源 iframe 只拿到了空白文档");
          }
        }, USAGE_FRAME_BLANK_GRACE_MS);
        return;
      }
      if (!verifyFramePath(frameDoc)) return;
      tryExtract();
      try {
        if (frameDoc.body) {
          observer = new MutationObserver(tryExtract);
          observer.observe(frameDoc.body, {
            childList: true,
            subtree: true,
            characterData: true,
          });
        }
      } catch {
        // Polling still covers client-side rendering updates.
      }
    });
    iframe.addEventListener("error", () => {
      done(null, "同源 iframe 加载官方 /usage 页面失败");
    });

    document.body.appendChild(iframe);
    pollId = setInterval(tryExtract, 300);
    timeoutId = setTimeout(() => {
      if (partialResult) done(partialResult);
      else {
        usageParseDiag.frameTimeout = true;
        done(null, "官方 /usage 页面未在限时内呈现用量文本");
      }
    }, timeoutMs);
  });
}

/**
 * Silent-first sync order: current /usage DOM, replayed official RPC, built
 * RPC, silent GET /usage probe, hidden same-origin iframe, and for manual
 * clicks only, a background helper tab.
 */
export async function syncOfficialUsage(isManualClick = false): Promise<boolean> {
  const onUsagePage = /\/usage\/?$/.test(window.location.pathname);
  let manualHelperWindow: Window | null = null;

  if (activeSyncPromise !== null) {
    if (isManualClick) {
      quotaState.syncPhase = "等待进行中的同步结束";
      requestUiUpdate();
    }
    return activeSyncPromise;
  }

  // Reserving the tab must happen before any await: window.open depends on the
  // user activation. It sits after the in-flight check so rapid clicks cannot
  // open a second blank tab.
  if (isManualClick) {
    manualHelperWindow = maybeReserveHelperWindow();
  }

  if (!isManualClick && document.visibilityState === "hidden") return false;
  if (!isManualClick && Date.now() < nextAutomaticSyncAt) {
    if (deferredAutomaticSync === null) {
      deferredAutomaticSync = setTimeout(() => {
        deferredAutomaticSync = null;
        void syncOfficialUsage(false);
      }, nextAutomaticSyncAt - Date.now());
    }
    return false;
  }
  if (deferredAutomaticSync !== null) {
    clearTimeout(deferredAutomaticSync);
    deferredAutomaticSync = null;
  }
  quotaState.isSyncing = true;
  quotaState.syncPhase = isManualClick ? "同步官方用量" : "静默同步官方用量";
  quotaState.lastError = "";
  usageSyncDiag.helperError = "";
  requestUiUpdate();
  activeSyncPromise = (async () => {
    let ok = false;
    try {
      // 0. Already on /usage: read the main DOM without another request.
      if (onUsagePage) {
        ok = commitOfficialQuota(
          parseUsageDocument(document, ""),
          "usage-page",
          true,
        );
      }
      // 1. Replay the request the official page itself sent.
      if (!ok) ok = await replayCapturedQuotaRpc();
      // 2. Build a batchexecute call with the page session token.
      if (!ok) ok = await requestOfficialUsageRpc();

      // 3. Silent fallback: credentialed GET /usage with embedded SSR data.
      if (!ok && !onUsagePage) {
        const probe = await probeUsagePage();
        const probeResult = probe && probe.result;
        if (
          probeResult &&
          (probeResult.fiveHour || probeResult.weekly) &&
          commitOfficialQuota(probeResult, "usage-page", true)
        ) {
          ok = !!(probeResult.fiveHour && probeResult.weekly);
        }
      }

      // 4. Hidden same-origin iframe rendering of the official /usage page.
      const usageUrl = getOfficialUsageUrl();
      if (!ok && Date.now() >= renderedUsageFrameBlockedUntil) {
        const fromIframe = await extractViaSameOriginUsageIframe(usageUrl);
        ok = !!(
          fromIframe && commitOfficialQuota(fromIframe, "usage-page", true)
        );
      }

      // 5. The last fallback only serves manual clicks.
      if (!ok && isManualClick && !onUsagePage) {
        quotaState.syncPhase = "后台读取官方 /usage 页面文本";
        requestUiUpdate();
        const helperResult = await requestUsageHelperSync(
          usageUrl,
          manualHelperWindow,
        );
        // The handle now belongs to the helper tab, which closes itself.
        manualHelperWindow = null;
        ok = !!(
          helperResult &&
          helperResult.ok === true &&
          applyUsageHelperPayload(helperResult)
        );
        if (!ok) {
          usageSyncDiag.helperError =
            helperResult &&
            typeof helperResult.reason === "string" &&
            helperResult.reason
              ? helperResult.reason
              : "后台官方 /usage 页面未返回用量文本";
          quotaState.lastError = usageSyncDiag.helperError;
        }
      }
      return ok;
    } catch (error) {
      quotaState.lastError = error instanceof Error ? error.message : "官方同步失败";
      return false;
    } finally {
      closeUsageHelperWindow(manualHelperWindow);
      automaticFailureCount = ok ? 0 : Math.min(automaticFailureCount + 1, 5);
      nextAutomaticSyncAt =
        Date.now() +
        (ok
          ? AUTO_SYNC_HEARTBEAT_MS
          : Math.min(
              AUTO_SYNC_INTERVAL_MS,
              AUTO_SYNC_HEARTBEAT_MS * 2 ** automaticFailureCount,
            ));
      quotaState.isSyncing = false;
      quotaState.syncPhase = "";
      activeSyncPromise = null;
      requestUiUpdate();
    }
  })();
  return activeSyncPromise;
}

setSyncTrigger(syncOfficialUsage);
