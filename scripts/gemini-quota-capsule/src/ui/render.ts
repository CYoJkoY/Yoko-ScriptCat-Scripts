import { METRIC_KINDS } from "../config";
import { formatRemainingHuman, formatCompactCountdown, formatTooltip, getProgressColor } from "../core/format";
import { scheduleSyncAfterResponse } from "../core/network";
import { quotaState } from "../core/state";
import { parseOfficialResetTextToTimestamp } from "../core/time";
import type { Metric, ProgressMode } from "../types";
import { config } from "../storage";
import { el, setTextIfChanged, setTitleIfChanged, setVarIfChanged, svgEl } from "./dom";
import { syncStyleChoices } from "./elements";
import { refs, uiState } from "./refs";
import { nextSvgId, sanitizeSvg } from "./svg";

function clampRatio(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function createOrnamentSvg(kind: string, ratio: number): SVGSVGElement | null {
  const common = {
    viewBox: "0 0 16 16",
    class: "gc-ornament-svg",
    "aria-hidden": "true",
  };
  // The same page can render several previews at once, so gradient and clip
  // ids must be unique per instance.
  const uid = nextSvgId("gc-orn");
  if (kind === "spark") {
    return svgEl("svg", common, [
      svgEl("path", {
        d: "M8 .9c.42 3.9 2.8 6.28 6.7 6.7-3.9.42-6.28 2.8-6.7 6.7-.42-3.9-2.8-6.28-6.7-6.7C5.2 7.18 7.58 4.8 8 .9Z",
        fill: "currentColor",
      }),
      svgEl("circle", { cx: "8", cy: "8", r: "1.15", fill: "#fff", opacity: ".9" }),
    ]);
  }
  if (kind === "orbit") {
    return svgEl("svg", common, [
      svgEl("circle", {
        cx: "8", cy: "8", r: "5.2", fill: "none",
        stroke: "rgba(255,255,255,.2)", "stroke-width": ".8",
      }),
      svgEl("ellipse", {
        cx: "8", cy: "8", rx: "6.5", ry: "2.7", fill: "none",
        stroke: "currentColor", "stroke-width": "1.15",
        transform: "rotate(-32 8 8)",
      }),
      svgEl("ellipse", {
        cx: "8", cy: "8", rx: "6.2", ry: "2.4", fill: "none",
        stroke: "currentColor", "stroke-width": ".55", opacity: ".38",
        transform: "rotate(58 8 8)",
      }),
      svgEl("circle", { cx: "12.1", cy: "4.3", r: "1.35", fill: "currentColor" }),
      svgEl("circle", { cx: "12.1", cy: "4.3", r: ".5", fill: "#fff", opacity: ".75" }),
    ]);
  }
  if (kind === "capsule") {
    const fillHeight = Math.max(0.8, 11.6 * ratio);
    const fillTop = 12.6 - fillHeight;
    return svgEl("svg", common, [
      svgEl("defs", {}, [
        svgEl("clipPath", { id: `${uid}-clip` }, [
          svgEl("rect", { x: "4.6", y: "1.4", width: "6.8", height: "13.2", rx: "3.4" }),
        ]),
      ]),
      svgEl("rect", {
        x: "4.6", y: "1.4", width: "6.8", height: "13.2", rx: "3.4",
        fill: "rgba(255,255,255,.07)", stroke: "currentColor", "stroke-width": "1.15",
      }),
      svgEl("rect", {
        x: "4.6", y: String(fillTop.toFixed(2)), width: "6.8",
        height: String(fillHeight.toFixed(2)), fill: "currentColor",
        "clip-path": `url(#${uid}-clip)`, opacity: ".92",
      }),
      svgEl("rect", {
        x: "6.2", y: "3.2", width: "1.25", height: "4.6", rx: ".62",
        fill: "#fff", opacity: ".38",
      }),
    ]);
  }
  if (kind === "bolt") {
    return svgEl("svg", common, [
      svgEl("path", {
        d: "M9.6.9 3.5 8.8h3.4l-.6 6.3 6.2-8.3H9.1l.5-5.9Z",
        fill: "currentColor",
      }),
      svgEl("path", {
        d: "M9.6.9 3.5 8.8h2.2L8.4 4l1.2-3.1Z",
        fill: "#fff", opacity: ".28",
      }),
    ]);
  }
  if (kind === "none") return null;
  // Default prism: faceted refraction, avoiding the old half-green pill.
  return svgEl("svg", common, [
    svgEl("defs", {}, [
      svgEl("linearGradient", {
        id: `${uid}-fill`, x1: "2", y1: "1", x2: "14", y2: "15",
        gradientUnits: "userSpaceOnUse",
      }, [
        svgEl("stop", { offset: "0", "stop-color": "currentColor", "stop-opacity": ".98" }),
        svgEl("stop", { offset: "1", "stop-color": "currentColor", "stop-opacity": ".32" }),
      ]),
    ]),
    svgEl("path", {
      d: "M8 1.1 13.7 4.4v6.9L8 14.9 2.3 11.3V4.4Z",
      fill: `url(#${uid}-fill)`,
    }),
    svgEl("path", {
      d: "M8 1.1v13.8M2.3 4.4l11.4 6.9M13.7 4.4 2.3 11.3",
      fill: "none", stroke: "rgba(255,255,255,.5)", "stroke-width": ".55",
      "stroke-linejoin": "round",
    }),
    svgEl("path", {
      d: "M8 1.1 13.7 4.4 8 7.8 2.3 4.4Z",
      fill: "#fff", "fill-opacity": ".24",
    }),
  ]);
}

function renderOrnament(usedRatio5h: number, usedRatio7d: number): void {
  const headSlotEl = refs.headSlotEl;
  if (!headSlotEl) return;
  const used5h = clampRatio(usedRatio5h);
  const used7d = clampRatio(usedRatio7d);
  const dominant = Math.max(used5h, used7d);
  const color = getProgressColor(dominant).hex;
  const kind = config.icon.kind;
  if (headSlotEl.style.getPropertyValue("--gc-accent") !== color) {
    headSlotEl.style.setProperty("--gc-accent", color);
  }
  const key = [
    kind,
    uiState.iconRevision,
    kind === "capsule" ? dominant.toFixed(3) : "",
  ].join("|");
  if (uiState.lastOrnamentRender && uiState.lastOrnamentRender.key === key) return;
  uiState.lastOrnamentRender = { key };

  headSlotEl.textContent = "";
  headSlotEl.dataset["gcOrnament"] = kind;
  if (kind === "none") return;

  if (kind === "image" && config.icon.image) {
    const img = el("img", {
      className: "gc-ornament-image",
      src: config.icon.image,
      alt: "",
      draggable: "false",
      decoding: "async",
    });
    img.addEventListener("error", () => {
      headSlotEl.textContent = "";
      const fallback = createOrnamentSvg("prism", dominant);
      if (fallback) headSlotEl.appendChild(fallback);
    }, { once: true });
    headSlotEl.appendChild(img);
    return;
  }

  if (kind === "svg" && config.icon.svg) {
    if (uiState.customSvgCache.source !== config.icon.svg) {
      const checked = sanitizeSvg(config.icon.svg);
      uiState.customSvgCache = { source: config.icon.svg, node: checked.node };
    }
    const cachedNode = uiState.customSvgCache.node;
    if (cachedNode) {
      const node = cachedNode.cloneNode(true);
      if (node instanceof SVGElement) {
        node.setAttribute("class", "gc-ornament-svg");
        node.setAttribute("aria-hidden", "true");
        headSlotEl.appendChild(node);
        return;
      }
    }
  }

  const preset = createOrnamentSvg(kind, dominant);
  if (preset) headSlotEl.appendChild(preset);
}

function createProgressNode(
  mode: ProgressMode,
  ratio: number,
): HTMLElement | SVGElement | null {
  if (mode === "none") return null;
  if (mode === "bar" || mode === "segments" || mode === "battery") {
    const fill = el("div", { className: "gc-inline-fill" });
    fill.style.width = `${Math.min(100, Math.round(ratio * 100))}%`;
    fill.style.backgroundColor = "var(--gc-progress-color)";
    const track = el("div", { className: "gc-inline-track" }, [fill]);
    if (mode !== "bar") track.dataset["mode"] = mode;
    return track;
  }
  if (mode === "ring") {
    const radius = 5.8;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - ratio * circumference;
    return svgEl("svg", {
      viewBox: "0 0 16 16",
      style: "transform: rotate(-90deg); width:16px; height:16px;",
      "aria-hidden": "true",
    }, [
      svgEl("circle", {
        cx: "8", cy: "8", r: String(radius), stroke: "rgba(255,255,255,.14)",
        "stroke-width": "2", fill: "none",
      }),
      svgEl("circle", {
        cx: "8", cy: "8", r: String(radius), "stroke-width": "2",
        "stroke-linecap": "round", fill: "none", stroke: "var(--gc-progress-color)",
        style: `stroke-dasharray:${circumference};stroke-dashoffset:${offset};`,
      }),
    ]);
  }
  if (mode === "disk") {
    const degrees = Math.min(360, Math.round(ratio * 360));
    return el("div", {
      className: "gc-disk-box",
      style: `background:conic-gradient(var(--gc-progress-color) 0deg ${degrees}deg, rgba(255,255,255,.12) ${degrees}deg 360deg);`,
    }, [el("div", { className: "gc-disk-core" })]);
  }
  if (mode === "decay") {
    const r = Math.min(1.2, ratio);
    const isCritical = r >= 0.88;
    const drift = r * 4;
    const rot = r * 24;
    const shardsData = [
      { clip: "polygon(0% 0%, 55% 0%, 42% 45%, 0% 50%)", dx: -drift * 0.7, dy: -drift * 0.7, dr: -rot * 0.8 },
      { clip: "polygon(55% 0%, 100% 0%, 100% 48%, 42% 45%)", dx: drift * 0.6, dy: -drift * 0.6, dr: rot * 0.6 },
      { clip: "polygon(0% 50%, 42% 45%, 52% 70%, 0% 100%)", dx: -drift * 0.9, dy: drift * 0.4, dr: -rot * 0.9 },
      { clip: "polygon(42% 45%, 100% 48%, 80% 82%, 52% 70%)", dx: drift * 0.4, dy: drift * 0.2, dr: rot * 0.4 },
    ];
    const shards = shardsData.map((shard) => el("div", {
      className: "gc-decay-shard",
      style: `clip-path:${shard.clip};-webkit-clip-path:${shard.clip};background:var(--gc-progress-color);transform:translate(${shard.dx.toFixed(1)}px, ${shard.dy.toFixed(1)}px) rotate(${shard.dr.toFixed(1)}deg);`,
    }));
    const body = el("div", {
      className: `gc-decay-body ${isCritical ? "gc-state-critical" : ""}`,
    }, shards);
    return el("div", { className: "gc-decay-capsule" }, [body]);
  }
  if (mode === "columns") {
    const usedHeight = ratio * 14;
    const restHeight = (1 - ratio) * 14;
    return svgEl("svg", {
      viewBox: "0 0 16 16", width: "16", height: "16", "aria-hidden": "true",
    }, [
      svgEl("rect", { x: "2", y: "1", width: "4", height: "14", rx: "1", fill: "rgba(255,255,255,.08)" }),
      svgEl("rect", { x: "9", y: "1", width: "4", height: "14", rx: "1", fill: "rgba(255,255,255,.08)" }),
      svgEl("rect", {
        x: "2", y: (15 - usedHeight).toFixed(2), width: "4",
        height: usedHeight.toFixed(2), rx: "1", fill: "var(--gc-progress-color)",
      }),
      svgEl("rect", {
        x: "9", y: (15 - restHeight).toFixed(2), width: "4",
        height: restHeight.toFixed(2), rx: "1", fill: "rgba(255,255,255,.32)",
      }),
    ]);
  }
  return null;
}

function renderProgressSlot(
  slot: HTMLElement | null,
  mode: ProgressMode,
  ratio: number,
  cache: { key: string },
): void {
  if (!slot) return;
  const normalized = clampRatio(ratio);
  const color = getProgressColor(normalized).hex;
  const key = `${mode}|${normalized.toFixed(4)}|${color}`;
  setVarIfChanged(slot.parentElement, "--gc-progress-color", color);
  if (cache.key === key) return;
  cache.key = key;
  slot.textContent = "";
  slot.dataset["mode"] = mode;
  const node = createProgressNode(mode, normalized);
  if (node) slot.appendChild(node);
}

// Colors are written on the metric group rather than on individual nodes, so
// custom badge / timer / progress CSS can override the inherited value without
// competing with inline styles.
function setMetricColorVars(
  groupNode: HTMLElement | null,
  badgeColor: string,
  timerColor: string,
): void {
  setVarIfChanged(groupNode, "--gc-badge-color", badgeColor);
  setVarIfChanged(groupNode, "--gc-timer-color", timerColor);
}

function renderMetricUnit(
  metric: Metric | null,
  isWeekly: boolean,
  label: string,
  usageNode: HTMLElement | null,
  timerNode: HTMLElement | null,
  groupNode: HTMLElement | null,
): number {
  if (!metric) {
    setMetricColorVars(groupNode, "#94a3b8", "#64748b");
    setTextIfChanged(usageNode, "--%");
    setTextIfChanged(timerNode, quotaState.isSyncing ? "同步中" : "待同步");
    setTitleIfChanged(groupNode, formatTooltip(label, metric));
    return 0;
  }

  if (metric.pct === null) {
    setMetricColorVars(groupNode, "#94a3b8", "#64748b");
    setTextIfChanged(usageNode, "--%");
    if (metric.resetAt && metric.resetAt > Date.now()) {
      const remaining = metric.resetAt - Date.now();
      setTextIfChanged(timerNode, formatCompactCountdown(remaining, isWeekly));
      setVarIfChanged(groupNode, "--gc-timer-color", "#94a3b8");
      setTitleIfChanged(timerNode, `距官方重置 ${formatRemainingHuman(remaining)}`);
    } else {
      setTextIfChanged(timerNode, quotaState.isSyncing ? "同步中" : "待同步");
    }
    setTitleIfChanged(groupNode, formatTooltip(label, metric));
    return 0;
  }

  // Primary metric is the used percentage: higher means more used. metric.pct
  // stays "remaining"; only a derived value is shown so cached data and the
  // existing decision logic remain valid.
  const usedPct =
    typeof metric.usedPct === "number" && Number.isFinite(metric.usedPct)
      ? metric.usedPct
      : Math.max(0, Math.min(100, 100 - metric.pct));
  const usedRatio = usedPct / 100;
  const color = getProgressColor(usedRatio);

  setMetricColorVars(groupNode, color.hex, color.hex);
  setTextIfChanged(usageNode, `${usedPct}%`);

  const now = Date.now();
  if (metric.resetAt && metric.resetAt > now) {
    // The countdown is always official reset time minus now, recomputed each
    // second.
    const remaining = metric.resetAt - now;
    setTextIfChanged(timerNode, formatCompactCountdown(remaining, isWeekly));
    setTitleIfChanged(timerNode, `距官方重置 ${formatRemainingHuman(remaining)}`);
  } else if (metric.rawResetText) {
    // Without an official timestamp fall back to the text, anchored at capture
    // time so the countdown still decreases.
    const anchor = metric.updatedAt > 0 ? metric.updatedAt : now;
    const parsed = parseOfficialResetTextToTimestamp(
      metric.rawResetText,
      anchor,
    );
    setTextIfChanged(
      timerNode,
      parsed !== null && parsed > now
        ? formatCompactCountdown(parsed - now, isWeekly)
        : metric.rawResetText.slice(0, 10),
    );
    setTitleIfChanged(timerNode, metric.rawResetText);
  } else if (usedPct >= 100) {
    // 100% used means the quota is exhausted, not reset.
    setTextIfChanged(timerNode, "已用尽");
    setVarIfChanged(groupNode, "--gc-timer-color", "#f43f5e");
  } else {
    setTextIfChanged(timerNode, "官方实时");
    setVarIfChanged(groupNode, "--gc-timer-color", "#94a3b8");
  }

  setTitleIfChanged(groupNode, formatTooltip(label, metric));
  return usedRatio;
}

const SOURCE_LABELS: Record<"rpc" | "usage-page" | "cache" | "init", string> = {
  rpc: "官方 batchexecute RPC 实时帧",
  "usage-page": "官方 /usage 页面直连",
  cache: "官方数据本地缓存",
  init: "等待首次同步",
};

function sourceLabel(source: string): string {
  if (
    source === "rpc" ||
    source === "usage-page" ||
    source === "cache" ||
    source === "init"
  ) {
    return SOURCE_LABELS[source];
  }
  return "官方直连";
}

export function updateUI(): void {
  if (!refs.rootEl) return;

  const now = Date.now();
  let expired = false;
  for (const kind of METRIC_KINDS) {
    const metric = quotaState[kind];
    if (metric.resetAt && metric.resetAt <= now) {
      // The window rolled over: the old window's percentage and countdown are
      // void. The new window's usage is unknown, so show nothing rather than
      // reusing the old value or inventing 100%.
      metric.pct = null;
      metric.usedPct = null;
      metric.used = null;
      metric.limit = null;
      metric.resetAt = null;
      metric.rawResetText = "";
      metric.updatedAt = 0;
      expired = true;
    }
  }
  if (
    expired &&
    !quotaState.isSyncing &&
    now - quotaState.lastSyncTime > 30 * 1000
  ) {
    // The window just rolled over: fetch official data early, reusing the
    // response debounce so the reset instant cannot cause a burst of requests.
    scheduleSyncAfterResponse();
  }

  const ratio5h = renderMetricUnit(
    quotaState.fiveHour,
    false,
    "5 小时窗口",
    refs.usage5hTextEl,
    refs.timer5hTextEl,
    refs.group5hEl,
  );

  const ratio7d = renderMetricUnit(
    quotaState.weekly,
    true,
    "每周窗口",
    refs.usage7dTextEl,
    refs.timer7dTextEl,
    refs.group7dEl,
  );

  renderOrnament(ratio5h, ratio7d);
  renderProgressSlot(
    refs.progress5hEl,
    config.metrics.fiveHour,
    ratio5h,
    uiState.progressCache.fiveHour,
  );
  renderProgressSlot(
    refs.progress7dEl,
    config.metrics.weekly,
    ratio7d,
    uiState.progressCache.weekly,
  );

  const btnRefreshEl = refs.btnRefreshEl;
  if (
    btnRefreshEl &&
    btnRefreshEl.classList.contains("gc-spinning") !== quotaState.isSyncing
  ) {
    btnRefreshEl.classList.toggle("gc-spinning", quotaState.isSyncing);
  }

  const hasOfficialData =
    quotaState.fiveHour.pct !== null || quotaState.weekly.pct !== null;
  const dotClass = `gc-sync-dot ${
    quotaState.isSyncing
      ? "syncing"
      : hasOfficialData
        ? "official"
        : quotaState.lastError
          ? "error"
          : ""
  }`;
  const syncDotEl = refs.syncDotEl;
  if (syncDotEl && syncDotEl.className !== dotClass) syncDotEl.className = dotClass;

  const timeStr =
    quotaState.lastSyncTime > 0
      ? new Date(quotaState.lastSyncTime).toLocaleTimeString()
      : "未同步";

  // While syncing, show the current phase first so a refresh click gives
  // immediate visible feedback.
  setTextIfChanged(
    refs.statusSourceEl,
    quotaState.isSyncing && quotaState.syncPhase
      ? `状态: ${quotaState.syncPhase}…`
      : quotaState.lastError
        ? `状态: ${quotaState.lastError}`
        : `数据源: ${sourceLabel(quotaState.source)}`,
  );
  setTextIfChanged(refs.statusSyncTimeEl, `最后同步: ${timeStr}`);

  syncStyleChoices();
}
