import {
  CSS_TARGETS,
  DEFAULT_COMPONENT_CSS,
  DEFAULT_CONFIG,
  INDICATOR_MODES,
  MAX_IMAGE_DATA_URL_CHARS,
  MAX_SVG_CHARS,
  STORAGE_KEY_CFG,
  isOrnamentPreset,
  isProgressMode,
  isSafeCssText,
} from "./config";
import type {
  CapsuleConfig,
  ComponentCss,
  OrnamentKind,
  ProgressMode,
} from "./types";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeConfig(parsed: unknown): CapsuleConfig {
  const source = isRecord(parsed) ? parsed : {};
  const legacyMode = INDICATOR_MODES.some((mode) => mode.key === source["styleMode"])
    ? source["styleMode"]
    : DEFAULT_CONFIG.styleMode;
  const rawIcon = isRecord(source["icon"]) ? source["icon"] : {};
  const image =
    typeof rawIcon["image"] === "string" &&
    rawIcon["image"].length <= MAX_IMAGE_DATA_URL_CHARS &&
    /^data:image\/(?:png|jpeg|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/.test(rawIcon["image"])
      ? rawIcon["image"]
      : "";
  const svg =
    typeof rawIcon["svg"] === "string" && rawIcon["svg"].length <= MAX_SVG_CHARS
      ? rawIcon["svg"]
      : "";
  let iconKind: OrnamentKind = "prism";
  if (isOrnamentPreset(rawIcon["kind"])) {
    iconKind = rawIcon["kind"];
  } else if (rawIcon["kind"] === "image" && image) {
    iconKind = "image";
  } else if (rawIcon["kind"] === "svg" && svg) {
    iconKind = "svg";
  }
  const rawMetrics = isRecord(source["metrics"]) ? source["metrics"] : {};
  const css: ComponentCss = { ...DEFAULT_COMPONENT_CSS };
  const rawCss = isRecord(source["css"]) ? source["css"] : {};
  for (const target of CSS_TARGETS) {
    const value = rawCss[target.key];
    if (isSafeCssText(value)) {
      css[target.key] = value;
    }
  }
  const rawPos = isRecord(source["pos"]) ? source["pos"] : {};
  const resolvedStyleMode: ProgressMode =
    isProgressMode(legacyMode) && legacyMode !== "none"
      ? legacyMode
      : DEFAULT_CONFIG.styleMode;
  return {
    styleMode: resolvedStyleMode,
    pos: {
      right:
        typeof rawPos["right"] === "number" ? rawPos["right"] : DEFAULT_CONFIG.pos.right,
      bottom:
        typeof rawPos["bottom"] === "number" ? rawPos["bottom"] : DEFAULT_CONFIG.pos.bottom,
    },
    icon: { kind: iconKind, image, svg },
    metrics: {
      fiveHour: isProgressMode(rawMetrics["fiveHour"])
        ? rawMetrics["fiveHour"]
        : resolvedStyleMode,
      weekly: isProgressMode(rawMetrics["weekly"])
        ? rawMetrics["weekly"]
        : resolvedStyleMode,
    },
    css,
    debug: source["debug"] === true,
  };
}

function readStoredConfig(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY_CFG);
  } catch {
    return null;
  }
}

export function loadConfig(): CapsuleConfig {
  const raw = readStoredConfig();
  if (!raw) return normalizeConfig(null);
  try {
    return normalizeConfig(JSON.parse(raw));
  } catch {
    return normalizeConfig(null);
  }
}

export function saveConfig(cfg: CapsuleConfig): boolean {
  try {
    localStorage.setItem(STORAGE_KEY_CFG, JSON.stringify(cfg));
    return true;
  } catch (err) {
    console.warn("[Gemini Quota] 保存配置失败:", err);
    return false;
  }
}

export const config: CapsuleConfig = loadConfig();
