import {
  CUSTOM_ORNAMENT_KINDS,
  MAX_CSS_CHARS,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DATA_URL_CHARS,
  METRIC_KINDS,
  ORNAMENT_MODES,
  isCssTargetKey,
  isProgressMode,
  isSafeCssText,
} from "../config";
import { config, saveConfig } from "../storage";
import { requestUiUpdate } from "../core/state";
import type { MetricKind, OrnamentKind } from "../types";
import { applyCustomCss, setAttrIfChanged } from "./dom";
import {
  bumpIconRevision,
  nextUploadSequence,
  ornamentBtns,
  progressBtns,
  refs,
  uiState,
} from "./refs";
import { sanitizeSvg } from "./svg";

export function setStyleStatus(message: string, kind = ""): void {
  const statusNode = refs.styleStatusEl;
  if (!statusNode) return;
  statusNode.textContent = message;
  statusNode.className = `gc-style-status${kind ? ` ${kind}` : ""}`;
}

export function cycleOrnamentMode(): void {
  const modes = ORNAMENT_MODES.map((mode) => mode.key);
  // config.icon.kind may be a custom image/svg kind, which simply does not
  // appear in the preset list; findIndex returns -1 and the cycle starts over.
  const current = ORNAMENT_MODES.findIndex((mode) => mode.key === config.icon.kind);
  const nextIdx = current < 0 ? 0 : (current + 1) % modes.length;
  const nextKind = modes[nextIdx];
  if (nextKind === undefined) return;
  const previous = config.icon.kind;
  config.icon.kind = nextKind;
  bumpIconRevision();
  if (!saveConfig(config)) {
    config.icon.kind = previous;
    bumpIconRevision();
    setStyleStatus(
      "保存失败：本地存储空间不足，请减小图片或清理站点数据。",
      "error",
    );
    requestUiUpdate();
    return;
  }
  setStyleStatus("已切换装饰图标。", "ok");
  requestUiUpdate();
}

export interface OrnamentValues {
  image?: string;
  svg?: string;
}

export function setOrnament(kind: OrnamentKind, values: OrnamentValues = {}): boolean {
  const previous = { ...config.icon };
  config.icon.kind = kind;
  if (typeof values.image === "string") config.icon.image = values.image;
  if (typeof values.svg === "string") config.icon.svg = values.svg;
  bumpIconRevision();
  if (!saveConfig(config)) {
    config.icon = previous;
    bumpIconRevision();
    setStyleStatus(
      "保存失败：本地存储空间不足，请改用更小的图片或清理站点数据。",
      "error",
    );
    requestUiUpdate();
    return false;
  }
  requestUiUpdate();
  return true;
}

export function setProgressMode(metricKey: unknown, mode: unknown): void {
  if (
    (metricKey !== "fiveHour" && metricKey !== "weekly") ||
    !isProgressMode(mode)
  ) {
    return;
  }
  const kind: MetricKind = metricKey;
  const previous = config.metrics[kind];
  const previousLegacyMode = config.styleMode;
  config.metrics[kind] = mode;
  // The legacy field keeps following 5H so external configs that still read
  // styleMode migrate smoothly.
  if (kind === "fiveHour") config.styleMode = mode;
  if (!saveConfig(config)) {
    config.metrics[kind] = previous;
    if (kind === "fiveHour") config.styleMode = previousLegacyMode;
    setStyleStatus("保存失败：无法写入本地存储。", "error");
    return;
  }
  setStyleStatus("样式已保存。", "ok");
  requestUiUpdate();
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}

function validateImageDataUrl(dataUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const picture = new Image();
    const cleanup = (): void => {
      clearTimeout(timeout);
      picture.onload = null;
      picture.onerror = null;
    };
    const timeout = setTimeout(() => {
      cleanup();
      picture.src = "";
      reject(new Error("图片解码超时"));
    }, 5000);
    picture.onload = () => {
      cleanup();
      if (picture.naturalWidth > 0 && picture.naturalHeight > 0) resolve();
      else reject(new Error("图片没有有效尺寸"));
    };
    picture.onerror = () => {
      cleanup();
      reject(new Error("图片损坏或浏览器不支持该格式"));
    };
    picture.src = dataUrl;
  });
}

export async function handleImageFile(
  file: File | null | undefined,
): Promise<void> {
  if (!file) return;
  const sequence = nextUploadSequence();
  const revision = uiState.iconRevision;
  const isCurrent = (): boolean =>
    sequence === uiState.uploadSequence && revision === uiState.iconRevision;
  if (file.size > MAX_IMAGE_BYTES) {
    setStyleStatus(`图片超过 ${MAX_IMAGE_BYTES / 1024}KB 上限。`, "error");
    return;
  }
  const isSvg =
    file.type === "image/svg+xml" || /\.svg$/i.test(file.name || "");
  try {
    if (isSvg) {
      const text = await file.text();
      if (!isCurrent()) return;
      const checked = sanitizeSvg(text);
      if (!checked.node) {
        setStyleStatus(checked.error, "error");
        return;
      }
      if (setOrnament("svg", { svg: text })) {
        setStyleStatus("SVG 图标已应用。", "ok");
      }
      return;
    }
    if (!/^image\/(png|jpeg|webp|gif|avif)$/i.test(file.type)) {
      setStyleStatus("仅支持 PNG、JPEG、WebP、GIF、AVIF 或 SVG。", "error");
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    if (!isCurrent()) return;
    if (
      !dataUrl.startsWith("data:image/") ||
      dataUrl.length > MAX_IMAGE_DATA_URL_CHARS
    ) {
      setStyleStatus("图片编码后体积过大，请压缩后重试。", "error");
      return;
    }
    await validateImageDataUrl(dataUrl);
    if (!isCurrent()) return;
    if (setOrnament("image", { image: dataUrl })) {
      setStyleStatus("图片图标已应用。", "ok");
    }
  } catch (error) {
    if (!isCurrent()) return;
    setStyleStatus(
      `读取图片失败：${error instanceof Error && error.message ? error.message : "未知错误"}`,
      "error",
    );
  }
}

export function applySvgSource(source: string): boolean {
  const checked = sanitizeSvg(source);
  if (!checked.node) {
    setStyleStatus(checked.error, "error");
    return false;
  }
  if (!setOrnament("svg", { svg: source })) return false;
  setStyleStatus("SVG 图标已应用。", "ok");
  return true;
}

export function toggleSvgEditor(show?: boolean): void {
  const editorNode = refs.svgEditorEl;
  if (!editorNode) return;
  const open = typeof show === "boolean" ? show : editorNode.hidden;
  editorNode.hidden = !open;
  if (open) {
    const textarea = refs.svgTextareaEl;
    if (!textarea) return;
    textarea.value = config.icon.kind === "svg" ? config.icon.svg : "";
    textarea.focus();
  }
}

export function refreshCssEditor(): void {
  const textarea = refs.cssTextareaEl;
  const select = refs.cssTargetSelectEl;
  if (!textarea || !select) return;
  const target = select.value;
  if (!isCssTargetKey(target)) return;
  textarea.value = config.css[target] || "";
}

export function applyComponentCss(): void {
  const textarea = refs.cssTextareaEl;
  const select = refs.cssTargetSelectEl;
  if (!textarea || !select) return;
  const target = select.value;
  if (!isCssTargetKey(target)) return;
  const value = textarea.value.trim();
  if (value && !isSafeCssText(value)) {
    setStyleStatus(
      `CSS 不可用：上限 ${MAX_CSS_CHARS / 1024}KB，且不能包含大括号、尖括号、@import、expression() 或 javascript:。`,
      "error",
    );
    return;
  }
  const previous = config.css[target];
  config.css[target] = value;
  if (!saveConfig(config)) {
    config.css[target] = previous;
    textarea.value = previous;
    setStyleStatus("CSS 保存失败：本地存储空间不足。", "error");
    return;
  }
  applyCustomCss();
  setStyleStatus(
    value ? "组件 CSS 已应用。" : "该组件的自定义 CSS 已清空。",
    "ok",
  );
}

export function clearComponentCss(): void {
  const textarea = refs.cssTextareaEl;
  const select = refs.cssTargetSelectEl;
  if (!textarea || !select) return;
  const target = select.value;
  if (!isCssTargetKey(target)) return;
  const previous = config.css[target];
  config.css[target] = "";
  if (!saveConfig(config)) {
    config.css[target] = previous;
    textarea.value = previous;
    setStyleStatus("CSS 保存失败：本地存储空间不足。", "error");
    return;
  }
  textarea.value = "";
  applyCustomCss();
  setStyleStatus("该组件的自定义 CSS 已恢复默认。", "ok");
}

export function syncStyleChoices(): void {
  for (const button of ornamentBtns) {
    const active = button.dataset["ornament"] === config.icon.kind;
    button.classList.toggle("active", active);
    setAttrIfChanged(button, "aria-pressed", String(active));
  }
  for (const kind of METRIC_KINDS) {
    for (const button of progressBtns[kind]) {
      const active = button.dataset["mode"] === config.metrics[kind];
      button.classList.toggle("active", active);
      setAttrIfChanged(button, "aria-pressed", String(active));
    }
  }
  const imageButton = refs.imageBtnEl;
  if (imageButton) imageButton.classList.toggle("active", config.icon.kind === "image");
  const svgButton = refs.svgBtnEl;
  if (svgButton) svgButton.classList.toggle("active", config.icon.kind === "svg");
}
