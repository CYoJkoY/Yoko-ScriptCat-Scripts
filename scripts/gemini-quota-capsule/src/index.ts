import {
  AUTO_SYNC_HEARTBEAT_MS,
  AUTO_SYNC_INTERVAL_MS,
  SCRIPT_VERSION,
  STORAGE_KEY_SYNC_BRIDGE,
} from "./config";
import {
  getAccountPrefix,
  getOfficialUsageUrl,
  isSameUsagePath,
  noteAccountPrefix,
} from "./core/account";
import { parseBatchExecuteResponse } from "./core/batch";
import { commitOfficialQuota, officialCacheKey, restoreCachedOfficialQuota } from "./core/cache";
import { USAGE_RPC_ID } from "./core/constants";
import {
  collectProgressbarHints,
  collectQuotaDomHints,
  netRing,
  obsDiag,
  rawFrameRing,
  rememberQuotaSnippets,
  responseRing,
  shortenUrl,
  snippetRing,
} from "./core/diagnostics";
import { formatCompactCountdown, formatRemainingHuman } from "./core/format";
import { installNetworkObserver } from "./core/network";
import { origFetch } from "./core/orig";
import {
  collectProgressbarMetrics,
  extractInitDataBlocks,
  extractMetricFromCardText,
  parseHtmlDocument,
  parseOfficialUsageText,
  parseUsageDocument,
  scanBalancedArray,
} from "./core/parsing";
import {
  collectResetCandidates,
  collectStructuredPools,
  extractQuotaFromWizStructure,
  normalizePctValue,
  pctHintFromKey,
  pickResetAt,
  poolKindFromLabel,
  readMetricFromArrayTuple,
  readMetricFromRecord,
  sanitizeMetric,
} from "./core/quota";
import { buildOfficialUsageRequest, parseUsageRpcPayload, usageSyncDiag } from "./core/rpc";
import { parseRejectDiag, quotaState, setUiUpdater, usageParseDiag } from "./core/state";
import {
  buildUsageHelperUrl,
  getAutomaticFailureCount,
  getPendingUsageHelper,
  readHelperSyncNonce,
  readSyncBridgePayload,
  requestUsageHelperSync,
  runUsageHelperSync,
  syncOfficialUsage,
} from "./core/sync";
import { pctFromTextWithContext } from "./core/text";
import { parseOfficialResetTextToTimestamp, toEpochMs } from "./core/time";
import { config, saveConfig } from "./storage";
import type {
  CapsuleConfig,
  ComponentCss,
  HelperSyncResult,
  Metric,
  MetricKind,
  NetworkSample,
  OrnamentKind,
  ParsedQuota,
  ProgressMode,
  QuotaState,
  RawFrameSample,
  ResponseSample,
  SnippetSample,
} from "./types";
import { createDOM, ensureMounted } from "./ui/panel";
import { updateUI } from "./ui/render";

export interface ProbeBlockHit {
  size: number;
  excerpt: string;
}

export interface ProbeResult {
  version: string;
  url: string;
  status: number;
  finalUrl: string;
  redirectedAway: boolean;
  note: string;
  len: number;
  blocks: number;
  initHit: boolean;
  blockHits: ProbeBlockHit[];
  fiveHour: ParsedQuota["fiveHour"];
  weekly: ParsedQuota["weekly"];
}

export interface ReportResult {
  version: string;
  at: string;
  href: string;
  path: string;
  state: {
    source: string;
    lastError: string;
    fiveHour: { pct: number | null; usedPct: number | null; confidence: number };
    weekly: { pct: number | null; usedPct: number | null; confidence: number };
  };
  usagePage: QuotaState["usagePageStatus"];
  domHints: string[];
  progressbars: unknown[];
  captured: {
    batchExecSeen: number;
    batchFrames: number;
    quotaHits: number;
    nonQuotaResponses: number;
    responseReadFailures: number;
    rpcIds: string[];
    rawFrames: number;
    snippets: number;
  };
  endpoints: NetworkSample[];
  snippets: SnippetSample[];
}

export interface DumpConfig {
  styleMode: ProgressMode;
  pos: { right: number; bottom: number };
  icon: { kind: OrnamentKind; imageChars: number; svgChars: number };
  metrics: Record<MetricKind, ProgressMode>;
  css: ComponentCss;
  debug: boolean;
}

export interface DumpState {
  source: string;
  isSyncing: boolean;
  syncPhase: string;
  lastSyncTime: number;
  lastError: string;
  fiveHour: Metric;
  weekly: Metric;
  capturedRpc: { url: string; rpcId: string } | null;
}

export interface DumpResult {
  version: string;
  at: string;
  href: string;
  config: DumpConfig;
  state: DumpState;
  frames: RawFrameSample[];
  responses: ResponseSample[];
  endpoints: NetworkSample[];
  diagnostics: {
    batchExecSeen: number;
    batchFrames: number;
    quotaHits: number;
    nonQuotaResponses: number;
    responseReadFailures: number;
    lastRpcIds: string[];
    rawFrames: number;
    responses: number;
    usageBlocks: number;
    usageInitHit: boolean;
    usageFrameAttempts: number;
    usageFrameLoads: number;
    usageFrameBlocked: boolean;
    usageFrameRedirected: boolean;
    usageFrameTimeout: boolean;
    usageFrameTextLength: number;
    usageFrameParsed: boolean;
    usageFrameReason: string;
    usageHelperAttempts: number;
    usageHelperOK: boolean;
    usageHelperReason: string;
    usageRpcId: string;
    usageRpcError: string;
    usageHelperError: string;
    rejected: { cssLike: number; barePercent: number; unverifiedFull: number };
    usagePage: QuotaState["usagePageStatus"];
    quotaSnippets: number;
    domHints: string[];
    progressbars: unknown[];
  };
}

const testApi = {
  parseUsageRpcPayload,
  buildOfficialUsageRequest,
  officialCacheKey,
  collectQuotaDomHints,
  collectProgressbarHints,
  collectProgressbarMetrics,
  rememberQuotaSnippets,
  shortenUrl,
  toEpochMs,
  parseOfficialResetTextToTimestamp,
  pctFromTextWithContext,
  pickResetAt,
  collectResetCandidates,
  sanitizeMetric,
  poolKindFromLabel,
  readMetricFromArrayTuple,
  readMetricFromRecord,
  collectStructuredPools,
  extractQuotaFromWizStructure,
  parseBatchExecuteResponse,
  parseUsageDocument,
  parseHtmlDocument,
  parseOfficialUsageText,
  extractInitDataBlocks,
  scanBalancedArray,
  normalizePctValue,
  pctHintFromKey,
  extractMetricFromCardText,
  commitOfficialQuota,
  buildUsageHelperUrl,
  readHelperSyncNonce,
  readSyncBridgePayload,
  formatCompactCountdown,
  formatRemainingHuman,
  isSameUsagePath,
  getAccountPrefix,
  getOfficialUsageUrl,
  noteAccountPrefix,
};

export interface GqcApi {
  version: string;
  readonly state: QuotaState;
  readonly config: CapsuleConfig;
  sync: () => Promise<boolean>;
  helperSync: () => Promise<HelperSyncResult>;
  parseResetText: (text: unknown, nowMs?: number) => number | null;
  setDebug: (enabled: unknown) => void;
  probeUsage: () => Promise<ProbeResult>;
  report: () => ReportResult;
  dump: () => DumpResult;
  // Absent until probeUsage()/report() runs, matching the pre-refactor object.
  lastProbe?: ProbeResult | null;
  lastReport?: ReportResult | null;
  _test: typeof testApi;
}

function bootstrap(): void {
  // Top-level background tab opened by this page: it only reads the official
  // /usage page text, writes the sync bridge and closes itself. No UI.
  const helperNonce = readHelperSyncNonce();
  if (helperNonce) {
    runUsageHelperSync(helperNonce);
    return;
  }

  restoreCachedOfficialQuota();

  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key === officialCacheKey()) {
      restoreCachedOfficialQuota();
      return;
    }
    if (e.key === STORAGE_KEY_SYNC_BRIDGE && e.newValue) {
      const payload = readSyncBridgePayload(e.newValue);
      const pendingUsageHelper = getPendingUsageHelper();
      if (
        payload &&
        pendingUsageHelper &&
        payload.nonce === pendingUsageHelper.nonce
      ) {
        pendingUsageHelper.finish(payload);
      }
    }
  });

  const init = (): void => {
    createDOM();
    setTimeout(() => {
      void syncOfficialUsage(false);
    }, 500);

    // /usage renders client-side: the numbers are usually not painted at
    // 500ms, so retry a few times. These three instants cover the first
    // skeleton, the data arrival and the end of the chart animation.
    if (/\/usage\/?$/.test(window.location.pathname)) {
      for (const delay of [1500, 5000, 12000]) {
        setTimeout(() => void syncOfficialUsage(false), delay);
      }
    }

    setInterval(() => {
      if (
        getAutomaticFailureCount() > 0 ||
        Date.now() - quotaState.lastSyncTime >= AUTO_SYNC_INTERVAL_MS
      ) {
        void syncOfficialUsage(false);
      }
    }, AUTO_SYNC_HEARTBEAT_MS);
    document.addEventListener("visibilitychange", () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - quotaState.lastSyncTime >= AUTO_SYNC_INTERVAL_MS
      ) {
        void syncOfficialUsage(false);
      }
    });

    setInterval(() => {
      ensureMounted();
      updateUI();
    }, 1000);
  };

  if (document.body) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  }
}

const api: GqcApi = {
  version: SCRIPT_VERSION,
  get state() {
    return quotaState;
  },
  get config() {
    return config;
  },
  sync() {
    return syncOfficialUsage(true);
  },
  /**
   * Debug: request one background usage page sync (opens a background tab).
   * Browsers usually only allow popups inside a user gesture, so calls from
   * the console may be blocked and return ok:false.
   */
  helperSync() {
    // Bare /usage is the current account's usage page; a /u/<n> prefix is
    // added by getOfficialUsageUrl().
    return requestUsageHelperSync(getOfficialUsageUrl(), null);
  },
  parseResetText(text: unknown, nowMs = Date.now()) {
    return parseOfficialResetTextToTimestamp(text, nowMs);
  },
  setDebug(enabled: unknown) {
    config.debug = !!enabled;
    saveConfig(config);
  },
  /**
   * Single-command self check: fetch /usage directly and report the status,
   * AF_initDataCallback block count and parse result.
   *
   * Note: this returns a Promise. copy(JSON.stringify(__gqc.probeUsage()))
   * only yields {} because Promises do not serialize. The result is logged and
   * stored in __gqc.lastProbe, so call it directly: __gqc.probeUsage()
   */
  async probeUsage(): Promise<ProbeResult> {
    const url = getOfficialUsageUrl();
    const resp = await origFetch.call(window, url, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    const rawHtml = resp.ok ? await resp.text() : "";
    const finalUrl = resp.url || "";
    const finalPath = (() => {
      try {
        return new URL(finalUrl || url, window.location.href).pathname;
      } catch {
        // An unparsable final URL means no path to compare against.
        return "";
      }
    })();
    const redirectedAway =
      !!resp.redirected && !/\/usage\/?$/.test(finalPath);
    let parsed: ParsedQuota | { error: string } | null = null;
    if (rawHtml && !redirectedAway) {
      try {
        const parsedDoc = parseHtmlDocument(rawHtml);
        parsed = parsedDoc
          ? parseUsageDocument(parsedDoc, rawHtml)
          : { error: "无法创建安全 HTML 文档" };
      } catch (err) {
        parsed = { error: err instanceof Error ? err.message : "解析失败" };
      }
    }
    const parsedQuota = parsed !== null && !("error" in parsed) ? parsed : null;
    const result: ProbeResult = {
      version: SCRIPT_VERSION,
      url,
      status: resp.status,
      finalUrl: shortenUrl(finalUrl),
      redirectedAway,
      note: redirectedAway
        ? "本次 /usage 通道不可用（最终地址已离开请求路径）"
        : "",
      len: rawHtml.length,
      blocks: usageParseDiag.blocks,
      initHit: usageParseDiag.initHit,
      blockHits: redirectedAway
        ? []
        : extractInitDataBlocks(rawHtml)
            .filter((block) =>
              /hourly|weekly|quota|percent|usage|limit|gxu/i.test(block),
            )
            .slice(0, 5)
            .map((block) => ({
              size: block.length,
              // Only a short excerpt to confirm field names; no chat content.
              excerpt: block.length > 600 ? `${block.slice(0, 600)}…` : block,
            })),
      fiveHour: parsedQuota ? parsedQuota.fiveHour : null,
      weekly: parsedQuota ? parsedQuota.weekly : null,
    };
    this.lastProbe = result;
    try {
      console.log("[Gemini Quota] probeUsage", JSON.stringify(result));
    } catch {
      // Logging a circular or oversized value must not break the probe.
    }
    return result;
  },
  /**
   * One-shot evidence capture: answer where the official page keeps the two
   * numbers. Open Gemini's limit/usage popup, send a message, then run
   * __gqc.report() in the console. The result is logged and kept in
   * __gqc.lastReport (keyword neighborhoods only: at most 2 snippets per
   * frame and 8 lines per page, never a whole conversation).
   */
  report(): ReportResult {
    const result: ReportResult = {
      version: SCRIPT_VERSION,
      at: new Date().toISOString(),
      href: shortenUrl(window.location.href),
      path: window.location.pathname,
      state: {
        source: quotaState.source,
        lastError: quotaState.lastError,
        fiveHour: {
          pct: quotaState.fiveHour.pct,
          usedPct: quotaState.fiveHour.usedPct,
          confidence: quotaState.fiveHour.confidence,
        },
        weekly: {
          pct: quotaState.weekly.pct,
          usedPct: quotaState.weekly.usedPct,
          confidence: quotaState.weekly.confidence,
        },
      },
      usagePage: quotaState.usagePageStatus,
      domHints: collectQuotaDomHints(),
      progressbars: collectProgressbarHints(),
      captured: {
        batchExecSeen: obsDiag.batchExecSeen,
        batchFrames: obsDiag.batchFrames,
        quotaHits: obsDiag.quotaHits,
        nonQuotaResponses: obsDiag.nonQuotaResponses,
        responseReadFailures: obsDiag.responseReadFailures,
        rpcIds: obsDiag.lastRpcIds.slice(),
        rawFrames: rawFrameRing.length,
        snippets: snippetRing.length,
      },
      endpoints: netRing.slice(),
      snippets: snippetRing.slice(),
    };
    this.lastReport = result;
    try {
      console.log("[Gemini Quota] report", JSON.stringify(result, null, 2));
    } catch {
      // Logging a circular or oversized value must not break the report.
    }
    return result;
  },
  dump(): DumpResult {
    return {
      version: SCRIPT_VERSION,
      at: new Date().toISOString(),
      href: window.location.href,
      // Config images and SVGs can be hundreds of KB; keep only their sizes so
      // the console output is not flooded with asset bodies.
      config: {
        ...config,
        icon: {
          kind: config.icon.kind,
          imageChars: config.icon.image.length,
          svgChars: config.icon.svg.length,
        },
        css: { ...config.css },
      },
      state: {
        source: quotaState.source,
        isSyncing: quotaState.isSyncing,
        syncPhase: quotaState.syncPhase,
        lastSyncTime: quotaState.lastSyncTime,
        lastError: quotaState.lastError,
        fiveHour: { ...quotaState.fiveHour },
        weekly: { ...quotaState.weekly },
        capturedRpc: quotaState.capturedQuotaRpc
          ? {
              url: quotaState.capturedQuotaRpc.url,
              rpcId: quotaState.capturedQuotaRpc.rpcId,
            }
          : null,
      },
      frames: rawFrameRing.slice(),
      responses: responseRing.slice(),
      endpoints: netRing.slice(),
      diagnostics: {
        batchExecSeen: obsDiag.batchExecSeen,
        batchFrames: obsDiag.batchFrames,
        quotaHits: obsDiag.quotaHits,
        nonQuotaResponses: obsDiag.nonQuotaResponses,
        responseReadFailures: obsDiag.responseReadFailures,
        lastRpcIds: obsDiag.lastRpcIds.slice(),
        rawFrames: rawFrameRing.length,
        responses: responseRing.length,
        usageBlocks: usageParseDiag.blocks,
        usageInitHit: usageParseDiag.initHit,
        // Official /usage text channel: iframe and background tab progress.
        usageFrameAttempts: usageParseDiag.frameAttempts,
        usageFrameLoads: usageParseDiag.frameLoads,
        usageFrameBlocked: usageParseDiag.frameBlocked,
        usageFrameRedirected: usageParseDiag.frameRedirected,
        usageFrameTimeout: usageParseDiag.frameTimeout,
        usageFrameTextLength: usageParseDiag.frameTextLength,
        usageFrameParsed: usageParseDiag.frameParsed,
        usageFrameReason: usageParseDiag.frameReason,
        usageHelperAttempts: usageParseDiag.helperAttempts,
        usageHelperOK: usageParseDiag.helperOK,
        usageHelperReason: usageParseDiag.helperReason,
        usageRpcId: USAGE_RPC_ID,
        usageRpcError: usageSyncDiag.rpcError,
        usageHelperError: usageSyncDiag.helperError,
        // Rejection counters explain "why no numbers this time" without
        // guessing official field names again.
        rejected: { ...parseRejectDiag },
        usagePage: quotaState.usagePageStatus,
        quotaSnippets: snippetRing.length,
        domHints: collectQuotaDomHints(),
        progressbars: collectProgressbarHints(),
      },
    };
  },
  _test: testApi,
};

installNetworkObserver();
setUiUpdater(updateUI);
Reflect.set(window, "__gqc", api);
bootstrap();
