import type { Metric } from "../types";

export function formatCompactCountdown(ms: number, isWeekly = false): string {
  if (ms <= 0) return "00:00";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const pad = (n: number): string => String(n).padStart(2, "0");

  if (days > 0) return `${days}d ${pad(hours)}h`;
  if (isWeekly && hours > 0) return `${hours}h ${pad(minutes)}m`;
  if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function formatRemainingHuman(ms: number): string {
  if (ms <= 0) return "已到期";
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const minutes = totalMin % 60;
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  if (minutes > 0) return `${minutes} 分`;
  return "不足 1 分";
}

export function formatTooltip(label: string, metric: Metric | null): string {
  if (!metric || metric.pct === null) {
    return `${label}: 等待从官方同步数据...`;
  }
  const usedPct =
    typeof metric.usedPct === "number" && Number.isFinite(metric.usedPct)
      ? metric.usedPct
      : 100 - metric.pct;
  const lines = [`${label} 已用: ${usedPct}% (剩余 ${metric.pct}%)`];
  if (metric.used !== null && metric.limit !== null) {
    lines.push(`频次用量: ${metric.used} / ${metric.limit}`);
  }
  const nowMs = Date.now();
  if (metric.resetAt && metric.resetAt > nowMs) {
    const dt = new Date(metric.resetAt);
    const pad = (n: number): string => String(n).padStart(2, "0");
    lines.push(
      `官方重置时间: ${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`,
    );
    lines.push(`距重置剩余: ${formatRemainingHuman(metric.resetAt - nowMs)}`);
  } else if (metric.rawResetText) {
    lines.push(`官方重置状态: ${metric.rawResetText}`);
  }
  return lines.join("\n");
}

export function getProgressColor(ratio: number): { hex: string; glow: string } {
  const clamped = Math.max(0, Math.min(1, ratio));
  if (clamped < 0.5) {
    return { hex: "#10b981", glow: "rgba(16, 185, 129, 0.45)" };
  }
  if (clamped < 0.75) {
    return { hex: "#f59e0b", glow: "rgba(245, 158, 11, 0.45)" };
  }
  if (clamped < 0.9) {
    return { hex: "#f97316", glow: "rgba(249, 115, 22, 0.55)" };
  }
  return { hex: "#f43f5e", glow: "rgba(244, 63, 94, 0.75)" };
}
