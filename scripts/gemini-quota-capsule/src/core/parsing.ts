import { CONFIDENCE } from "../config";
import type { Metric, MetricDraft, MetricKind, ParsedQuota } from "../types";
import { usageParseDiag } from "./state";
import { pctFromTextWithContext } from "./text";
import { parseOfficialResetTextToTimestamp } from "./time";
import { extractQuotaFromWizStructure, sanitizeMetric } from "./quota";

interface CardOptions {
  allowBare?: boolean;
}

interface ProgressMetrics {
  fiveHour: Metric | null;
  weekly: Metric | null;
}

type Cardinality = "5h" | "7d";

export function extractMetricFromCardText(
  cardText: unknown,
  windowType: Cardinality,
  nowMs: number,
  options: CardOptions = {},
): MetricDraft | null {
  if (!cardText || typeof cardText !== "string") return null;

  let pctInfo = pctFromTextWithContext(cardText, {
    allowBare: options.allowBare !== false,
  });
  let used: number | null = null;
  let limit: number | null = null;

  if (!pctInfo) {
    const ratioMatch = cardText.match(/(\d+(?:\.\d+)?)\s*(?:\/|of|共|之)\s*(\d+(?:\.\d+)?)/i);
    if (ratioMatch) {
      const usedText = ratioMatch[1];
      const limitText = ratioMatch[2];
      if (usedText === undefined || limitText === undefined) return null;
      const usedValue = parseFloat(usedText);
      const limitValue = parseFloat(limitText);
      if (limitValue > 0 && usedValue >= 0 && usedValue <= limitValue) {
        used = usedValue;
        limit = limitValue;
        const usedPct = Math.min(100, Math.max(0, Math.round((usedValue / limitValue) * 100)));
        pctInfo = { pct: 100 - usedPct, usedPct };
      }
    } else if (
      /(?:已达上限|已用尽|配额耗尽|limit\s*reached|quota\s*exceeded|exhausted)/i.test(cardText)
    ) {
      pctInfo = { pct: 0, usedPct: 100 };
    }
  }

  if (!pctInfo) return null;

  const cleanHeaderPattern =
    windowType === "5h"
      ? /^(?:5\s*-?\s*(?:hour|hr|h|小时|小時|時間)|five\s*-?\s*hour|current\s*session|session|当前会话|会话)[\s:：\-—]*/i
      : /^(?:7\s*-?\s*(?:day|d|天|日)|week(?:ly)?|每周|每週|週間)[\s:：\-—]*/i;

  const lines = cardText
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter(Boolean);

  let resetAt: number | null = null;
  let rawResetText = "";

  for (const line of lines) {
    if (/(?:reset|重置|刷新|恢复|剩余|後|あと|available|可用|将于|將於)/i.test(line)) {
      let ts = parseOfficialResetTextToTimestamp(line, nowMs);
      if (!ts) {
        const strippedLine = line.replace(cleanHeaderPattern, "");
        ts = parseOfficialResetTextToTimestamp(strippedLine, nowMs);
      }
      if (ts) {
        resetAt = ts;
        rawResetText = line;
        break;
      }
    }
  }

  if (!resetAt) {
    resetAt = parseOfficialResetTextToTimestamp(cardText, nowMs);
  }

  return {
    pct: pctInfo.pct,
    usedPct: pctInfo.usedPct,
    used,
    limit,
    resetAt,
    rawResetText,
  };
}

export function parseOfficialUsageText(
  text: unknown,
  nowMs = Date.now(),
): ParsedQuota | null {
  if (typeof text !== "string" || !text.trim()) return null;
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const sections: Record<MetricKind, string[]> = { fiveHour: [], weekly: [] };
  let current: MetricKind | null = null;
  for (const line of lines) {
    if (/^current\s+usage$/i.test(line)) {
      current = "fiveHour";
      continue;
    }
    if (/^weekly\s+limit$/i.test(line)) {
      current = "weekly";
      continue;
    }
    if (/^(?:usage\s+limits|pro|your plan|learn more|updated)/i.test(line)) {
      continue;
    }
    if (current) {
      sections[current].push(line);
    }
  }
  const parseSection = (section: string[], windowType: Cardinality): MetricDraft | null => {
    if (!section.length) return null;
    return extractMetricFromCardText(section.join("\n"), windowType, nowMs, {
      allowBare: false,
    });
  };
  const fiveHour = parseSection(sections.fiveHour, "5h");
  const weekly = parseSection(sections.weekly, "7d");
  if (!fiveHour && !weekly) return null;
  return { timestamp: nowMs, fiveHour, weekly, strategy: "usage-text" };
}

export function scanBalancedArray(text: string, start: number): number {
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === quote) {
        quote = "";
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "[") {
      depth += 1;
    } else if (ch === "]") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function extractInitDataBlocks(html: unknown, limit = 40): string[] {
  if (typeof html !== "string" || !html) return [];
  const marker = "AF_initDataCallback(";
  const blocks: string[] = [];
  let cursor = 0;
  while (blocks.length < limit) {
    const at = html.indexOf(marker, cursor);
    if (at === -1) break;
    cursor = at + marker.length;
    const dataAt = html.indexOf("data:", cursor);
    if (dataAt === -1 || dataAt - at > 4000) break;
    const tailStart = dataAt + "data:".length;
    const head = html.slice(tailStart, tailStart + 200);
    const arrLead = head.match(
      /^(?:\s*function\s*\([^)]*\)\s*\{\s*(?:return\s*)?)?\s*\[/,
    );
    if (!arrLead) continue;
    const arrStart = tailStart + arrLead[0].length - 1;
    const arrEnd = scanBalancedArray(html, arrStart);
    if (arrEnd === -1) break;
    blocks.push(html.slice(arrStart, arrEnd + 1));
    cursor = arrEnd + 1;
  }
  return blocks;
}

export function collectProgressbarMetrics(
  doc: Document,
  nowMs = Date.now(),
): ProgressMetrics {
  const found: ProgressMetrics = { fiveHour: null, weekly: null };
  if (!doc || typeof doc.querySelectorAll !== "function") return found;

  const fiveLabelRe =
    /(?:5\s*-?\s*(?:hours?|hrs?|h|小时|小時|時間)|five\s*-?\s*hours?|hourly|per\s*hour|current\s*session|当前会话|会话)/i;
  const weekLabelRe = /(?:7\s*-?\s*(?:day|d|天|日)|week(?:ly)?|每周|每週|週間)/i;
  const usedRe = /(?:已用|已使用|使用量|用量|used|usage|consumed|utiliz)/i;
  const remainingRe = /(?:剩余|剩餘|可用|余量|餘量|remaining|available|left)/i;
  const nodes: Element[] = [];
  const visit = (root: Document | ShadowRoot): void => {
    for (const node of root.querySelectorAll("[role='progressbar'], progress, [aria-valuenow]")) {
      nodes.push(node);
    }
    for (const host of root.querySelectorAll("*")) {
      if (host.shadowRoot) visit(host.shadowRoot);
    }
  };
  visit(doc);

  for (const node of nodes) {
    const rawNow = node.getAttribute("aria-valuenow") ?? readValueProperty(node);
    const rawMax = node.getAttribute("aria-valuemax") ?? readMaxProperty(node) ?? 100;
    const value = Number(rawNow);
    const max = Number(rawMax);
    if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || value < 0) {
      continue;
    }

    const valueText = [
      node.getAttribute("aria-valuetext") || "",
      node.getAttribute("aria-label") || "",
      readInnerText(node),
    ].join(" ");
    let container: Element = node;
    for (let level = 0; level < 4 && container.parentElement; level += 1) {
      container = container.parentElement;
      const text = readText(container);
      if (text.length >= 4 && text.length <= 500) break;
    }
    const cardText = readText(container);
    const context = `${valueText} ${cardText}`;
    const isFive = fiveLabelRe.test(context);
    const isWeekly = weekLabelRe.test(context);
    if (isFive === isWeekly) continue;

    const kind: MetricKind = isFive ? "fiveHour" : "weekly";
    if (found[kind]) continue;
    const ratio = Math.min(1, Math.max(0, value / max));
    const percentage = Math.round(ratio * 100);
    const direction = remainingRe.test(context)
      ? "remaining"
      : usedRe.test(context)
        ? "used"
        : null;
    if (
      !direction ||
      /loading|加载|recent conversations|recent conversation/i.test(context)
    ) {
      continue;
    }

    const usedPct = direction === "used" ? percentage : 100 - percentage;
    const resetAt = parseOfficialResetTextToTimestamp(cardText, nowMs);
    found[kind] = {
      pct: 100 - usedPct,
      usedPct,
      used: null,
      limit: null,
      resetAt,
      rawResetText: resetAt ? cardText : "",
      confidence: CONFIDENCE.dom,
      updatedAt: 0,
    };
  }
  return found;
}

function readValueProperty(node: Element): string | null {
  const value = Reflect.get(node, "value");
  return typeof value === "number" || typeof value === "string" ? String(value) : null;
}

function readMaxProperty(node: Element): string | null {
  const max = Reflect.get(node, "max");
  return typeof max === "number" || typeof max === "string" ? String(max) : null;
}

function readInnerText(node: Element): string {
  const innerText = Reflect.get(node, "innerText");
  return typeof innerText === "string" ? innerText : "";
}

function readText(node: Element): string {
  return (readInnerText(node) || node.textContent || "").trim();
}

export function parseHtmlDocument(rawHtml: unknown): Document | null {
  if (typeof rawHtml !== "string" || !rawHtml) return null;

  let frame: HTMLIFrameElement | null = null;
  try {
    frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("tabindex", "-1");
    frame.style.cssText =
      "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;top:-9999px;border:0;";
    const host = document.body || document.documentElement;
    if (!host) return null;
    host.appendChild(frame);
    const frameWindow = frame.contentWindow;
    const parserCtor: unknown = frameWindow
      ? Reflect.get(frameWindow, "DOMParser")
      : null;
    if (typeof parserCtor !== "function") return null;
    const textFriendly = rawHtml
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
      .replace(
        /<\/(?:p|div|h[1-6]|li|tr|td|section|article|main|header|footer|aside|nav)\s*>|<br\s*\/?>/gi,
        (tag) => `${tag}\n`,
      );
    // Single assertion: the frame window exposes a callable DOMParser constructor.
    const parser = new (parserCtor as new () => DOMParser)();
    return parser.parseFromString(textFriendly, "text/html");
  } catch {
    return null;
  } finally {
    if (frame && frame.parentNode) frame.parentNode.removeChild(frame);
  }
}

export function parseUsageDocument(doc: Document | null, rawHtml = ""): ParsedQuota | null {
  const nowMs = Date.now();
  let fiveHour: MetricDraft | Metric | null = null;
  let weekly: MetricDraft | Metric | null = null;

  if (doc && doc.body) {
    const officialText = parseOfficialUsageText(
      doc.body.innerText || doc.body.textContent || "",
      nowMs,
    );
    if (officialText) {
      fiveHour = officialText.fiveHour;
      weekly = officialText.weekly;
    }
    const fiveRegex =
      /(?:5\s*-?\s*(?:hour|hr|h|小时|小時|時間)|five\s*-?\s*hour|hourly|per\s*hour|每小时|每小時|current\s*session|session|当前会话|会话(?:配额|限额|用量)?|セッション)/i;
    const weekRegex = /(?:7\s*-?\s*(?:day|d|天|日)|week(?:ly)?|每周|每週|週間)/i;
    const strictlyWeekRegex = /(?:week(?:ly)?|每周|每週|週間|7\s*-?\s*(?:day|days|天))/i;
    const strictlyFiveRegex =
      /(?:5\s*-?\s*(?:hour|hours|hr|hrs|h|小时|小時)|five\s*-?\s*hour|hourly|per\s*hour|每小时|每小時|current\s*session|当前会话)/i;

    const blocks = Array.from(
      doc.querySelectorAll(
        "section, article, [role='region'], [class*='card'], [class*='quota'], [class*='usage'], [class*='limit'], div",
      ),
    );

    const candidates: Record<Cardinality, string[]> = { "5h": [], "7d": [] };
    for (const node of blocks) {
      const txt = readText(node);
      if (txt.length < 4 || txt.length > 500) continue;

      const is5h = fiveRegex.test(txt);
      const is7d = weekRegex.test(txt);
      const isStrict7d = strictlyWeekRegex.test(txt);

      if (is5h && !isStrict7d) {
        candidates["5h"].push(txt);
      } else if (is7d && !is5h) {
        candidates["7d"].push(txt);
      }
    }

    const pickShortest = (kind: Cardinality): MetricDraft | null => {
      const list = candidates[kind].slice().sort((a, b) => a.length - b.length);
      for (const txt of list.slice(0, 5)) {
        const metric = extractMetricFromCardText(txt, kind, nowMs);
        if (metric) return metric;
      }
      return null;
    };

    if (!fiveHour) fiveHour = pickShortest("5h");
    if (!weekly) weekly = pickShortest("7d");

    const progressMetrics = collectProgressbarMetrics(doc, nowMs);
    if (!fiveHour && progressMetrics.fiveHour) fiveHour = progressMetrics.fiveHour;
    if (!weekly && progressMetrics.weekly) weekly = progressMetrics.weekly;

    const fullText = doc.body.innerText || doc.body.textContent || "";
    const sliceUntilNextLabel = (startIdx: number, stopRegex: RegExp, maxLen: number): string => {
      const tail = fullText.slice(startIdx, startIdx + maxLen);
      const stop = tail.search(stopRegex);
      return stop > 0 ? tail.slice(0, stop) : tail;
    };

    if (!fiveHour) {
      const idx5 = fullText.search(fiveRegex);
      if (idx5 !== -1) {
        fiveHour = extractMetricFromCardText(
          sliceUntilNextLabel(idx5, strictlyWeekRegex, 400),
          "5h",
          nowMs,
          { allowBare: false },
        );
      }
    }
    if (!weekly) {
      const idx7 = fullText.search(weekRegex);
      if (idx7 !== -1) {
        weekly = extractMetricFromCardText(
          sliceUntilNextLabel(idx7, strictlyFiveRegex, 400),
          "7d",
          nowMs,
          { allowBare: false },
        );
      }
    }
  }

  if (rawHtml && (!fiveHour || !weekly)) {
    const rawBlocks = extractInitDataBlocks(rawHtml);
    usageParseDiag.blocks = rawBlocks.length;
    for (const rawBlock of rawBlocks) {
      try {
        const dataArr: unknown = JSON.parse(rawBlock);
        const wizExtracted = extractQuotaFromWizStructure(dataArr, nowMs, {
          useLabels: false,
        });
        if (wizExtracted) {
          usageParseDiag.initHit = true;
          if (wizExtracted.fiveHour && !fiveHour) {
            fiveHour = wizExtracted.fiveHour;
          }
          if (wizExtracted.weekly && !weekly) {
            weekly = wizExtracted.weekly;
          }
        }
      } catch {
        // Ignore malformed init blocks.
      }
      if (fiveHour && weekly) break;
    }
  }

  const tagMetric = (
    metric: MetricDraft | Metric | null,
    kind: MetricKind,
  ): Metric | null => {
    if (!metric) return null;
    const confidence = Math.max(
      typeof metric.confidence === "number" ? metric.confidence : 0,
      CONFIDENCE.dom,
    );
    return sanitizeMetric({ ...metric, confidence }, kind, nowMs);
  };

  fiveHour = tagMetric(fiveHour, "fiveHour");
  weekly = tagMetric(weekly, "weekly");

  if (!fiveHour && !weekly) return null;
  return { timestamp: nowMs, fiveHour, weekly, strategy: "dom" };
}
