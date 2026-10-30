import type {
  CapsuleConfig,
  CssTargetKey,
  MetricKind,
  OrnamentKind,
  OrnamentPreset,
  ProgressMode,
} from "./types";

export const SCRIPT_VERSION = "1.0.3";

export const INDICATOR_MODES: ReadonlyArray<{
  key: Exclude<ProgressMode, "none">;
  text: string;
}> = [
  { key: "bar", text: "横条" },
  { key: "ring", text: "圆环" },
  { key: "disk", text: "圆盘" },
  { key: "decay", text: "崩坏" },
  { key: "segments", text: "分段" },
  { key: "battery", text: "电池" },
  { key: "columns", text: "双柱" },
];

export const PROGRESS_MODE_CHOICES: ReadonlyArray<{
  key: ProgressMode;
  text: string;
}> = [...INDICATOR_MODES, { key: "none", text: "隐藏" }];

export const ORNAMENT_MODES: ReadonlyArray<{
  key: OrnamentPreset;
  text: string;
}> = [
  { key: "prism", text: "棱镜" },
  { key: "spark", text: "星芒" },
  { key: "orbit", text: "轨道" },
  { key: "capsule", text: "胶囊" },
  { key: "bolt", text: "闪电" },
  { key: "none", text: "无" },
];

export const CUSTOM_ORNAMENT_KINDS: ReadonlyArray<OrnamentKind> = [
  "image",
  "svg",
];

export const CSS_TARGETS: ReadonlyArray<{
  key: CssTargetKey;
  text: string;
}> = [
  { key: "container", text: "胶囊容器" },
  { key: "head", text: "装饰图标" },
  { key: "five-hour", text: "5 小时组" },
  { key: "weekly", text: "每周组" },
  { key: "badge", text: "标签" },
  { key: "counter", text: "百分比" },
  { key: "progress", text: "进度图形" },
  { key: "timer", text: "倒计时" },
  { key: "divider", text: "分隔线" },
  { key: "actions", text: "操作区" },
  { key: "drawer", text: "设置抽屉" },
];

export const MAX_IMAGE_BYTES = 256 * 1024;
export const MAX_IMAGE_DATA_URL_CHARS = 420 * 1024;
export const MAX_SVG_CHARS = 20 * 1024;
export const MAX_CSS_CHARS = 8 * 1024;
export const SVG_NS = "http://www.w3.org/2000/svg";

export const STORAGE_KEY_CFG = "__gemini_quota_capsule_cfg_v5__";
export const STORAGE_KEY_OFFICIAL_CACHE = "__gemini_quota_official_cache_v8__";
export const STORAGE_KEY_SYNC_BRIDGE = "__gemini_quota_sync_bridge_v1__";
export const HELPER_SYNC_HASH_KEY = "gqc-usage-sync";

export const AUTO_SYNC_INTERVAL_MS = 3 * 60 * 1000;
export const AUTO_SYNC_HEARTBEAT_MS = 10000;

export const USAGE_FRAME_WIDTH_PX = 1280;
export const USAGE_FRAME_HEIGHT_PX = 900;
export const USAGE_FRAME_TIMEOUT_MS = 12000;
export const USAGE_FRAME_BLANK_GRACE_MS = 1500;
export const USAGE_FRAME_RETRY_COOLDOWN_MS = 10 * 60 * 1000;
export const USAGE_HELPER_TIMEOUT_MS = 20000;
export const USAGE_HELPER_WAIT_MS = 30000;

export const FIVE_HOUR_MS = 5 * 60 * 60 * 1000;
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const RESET_SLACK_MS = 30 * 60 * 1000;
export const FRESH_MS = 10 * 60 * 1000;
export const MAX_CACHE_AGE_MS = 10 * 60 * 1000;

export const CONFIDENCE = { heuristic: 1, dom: 2, pools: 3 } as const;

export const DEFAULT_COMPONENT_CSS = Object.freeze({
  container: "",
  head: "",
  "five-hour": "",
  weekly: "",
  badge: "",
  counter: "",
  progress: "",
  timer: "",
  divider: "",
  actions: "",
  drawer: "",
});

export const DEFAULT_CONFIG: CapsuleConfig = {
  styleMode: "bar",
  pos: { right: 20, bottom: 78 },
  icon: { kind: "prism", image: "", svg: "" },
  metrics: { fiveHour: "bar", weekly: "bar" },
  css: { ...DEFAULT_COMPONENT_CSS },
  debug: false,
};

export function isProgressMode(value: unknown): value is ProgressMode {
  return PROGRESS_MODE_CHOICES.some((mode) => mode.key === value);
}

export function isOrnamentPreset(value: unknown): value is OrnamentPreset {
  return ORNAMENT_MODES.some((mode) => mode.key === value);
}

export function isCssTargetKey(value: unknown): value is CssTargetKey {
  return CSS_TARGETS.some((target) => target.key === value);
}

export function isSafeCssText(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length > MAX_CSS_CHARS) return false;
  return !/[{}<>]|@import|expression\s*\(|javascript\s*:/i.test(value);
}

export const METRIC_KINDS: ReadonlyArray<MetricKind> = [
  "fiveHour",
  "weekly",
];
