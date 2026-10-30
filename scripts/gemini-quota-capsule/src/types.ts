export type ProgressMode =
  | "bar"
  | "ring"
  | "disk"
  | "decay"
  | "segments"
  | "battery"
  | "columns"
  | "none";

export type OrnamentPreset =
  | "prism"
  | "spark"
  | "orbit"
  | "capsule"
  | "bolt"
  | "none";

export type OrnamentKind = OrnamentPreset | "image" | "svg";

export type CssTargetKey =
  | "container"
  | "head"
  | "five-hour"
  | "weekly"
  | "badge"
  | "counter"
  | "progress"
  | "timer"
  | "divider"
  | "actions"
  | "drawer";

export type MetricKind = "fiveHour" | "weekly";

export interface ComponentCss {
  container: string;
  head: string;
  "five-hour": string;
  weekly: string;
  badge: string;
  counter: string;
  progress: string;
  timer: string;
  divider: string;
  actions: string;
  drawer: string;
}

export interface CapsuleConfig {
  styleMode: ProgressMode;
  pos: { right: number; bottom: number };
  icon: { kind: OrnamentKind; image: string; svg: string };
  metrics: Record<MetricKind, ProgressMode>;
  css: ComponentCss;
  debug: boolean;
}

export interface MetricInput {
  pct?: unknown;
  usedPct?: unknown;
  used?: unknown;
  limit?: unknown;
  resetAt?: unknown;
  rawResetText?: unknown;
  confidence?: unknown;
  allowResetOnly?: unknown;
  updatedAt?: unknown;
}

export interface Metric {
  pct: number | null;
  usedPct: number | null;
  used: number | null;
  limit: number | null;
  resetAt: number | null;
  rawResetText: string;
  confidence: number;
  allowResetOnly?: boolean;
  updatedAt: number;
}

export interface MetricDraft {
  pct: number | null;
  usedPct: number | null;
  used: number | null;
  limit: number | null;
  resetAt: number | null;
  rawResetText: string;
  confidence?: number;
  allowResetOnly?: boolean;
}

export interface CapturedQuotaRpc {
  url: string;
  body: string;
  rpcId: string;
}

export interface UsagePageStatus {
  url: string;
  status: number;
  finalUrl: string;
  redirected: boolean;
  missing: boolean;
  sameAccount: boolean;
  resolvedPrefix: string;
  assumedAccount: boolean;
}

export interface QuotaState {
  source: string;
  isSyncing: boolean;
  syncPhase: string;
  lastSyncTime: number;
  lastError: string;
  fiveHour: Metric;
  weekly: Metric;
  capturedQuotaRpc: CapturedQuotaRpc | null;
  usagePageStatus: UsagePageStatus | null;
}

export interface ParsedQuota {
  timestamp: number;
  fiveHour: Metric | MetricDraft | null;
  weekly: Metric | MetricDraft | null;
  strategy?: string;
}

// External payloads (sync bridge, helper response) carry unvalidated metric
// shapes; sanitizeMetric narrows them at commit time.
export interface QuotaCommitInput {
  timestamp: number;
  fiveHour: unknown;
  weekly: unknown;
  strategy?: string;
}

export interface CachePayload {
  timestamp: number;
  source: string;
  fiveHour: Metric | null;
  weekly: Metric | null;
}

export interface SyncBridgePayload {
  nonce: string;
  ok?: unknown;
  timestamp?: unknown;
  fiveHour?: unknown;
  weekly?: unknown;
  reason?: unknown;
}

export interface HelperSyncResult {
  ok: boolean;
  reason?: string;
  timestamp?: unknown;
  fiveHour?: unknown;
  weekly?: unknown;
}

export interface RpcFrame {
  rpcId: string;
  payload: unknown;
}

export interface NetworkSample {
  at: string;
  url: string;
  status: number;
  len: number;
}

export interface RawFrameSample {
  url: string;
  rpcId: string;
  at: string;
  size: number;
  payload: string;
}

export interface ResponseSample {
  at: string;
  url: string;
  size: number;
  frameCount: number;
  rpcIds: string[];
  text: string;
}

export interface SnippetSample {
  at: string;
  kind: string;
  rpcId: string | null;
  url: string;
  size: number;
  text: string;
}
