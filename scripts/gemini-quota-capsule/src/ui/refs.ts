import type { MetricKind } from "../types";

export interface ProgressCacheEntry {
  key: string;
}

export interface OrnamentRenderState {
  key: string;
}

export interface CustomSvgCache {
  source: string;
  node: SVGElement | null;
}

export const refs: {
  rootEl: HTMLDivElement | null;
  pillContainerEl: HTMLDivElement | null;
  drawerEl: HTMLDivElement | null;
  headSlotEl: HTMLButtonElement | null;
  group5hEl: HTMLDivElement | null;
  usage5hTextEl: HTMLSpanElement | null;
  progress5hEl: HTMLSpanElement | null;
  timer5hTextEl: HTMLSpanElement | null;
  group7dEl: HTMLDivElement | null;
  usage7dTextEl: HTMLSpanElement | null;
  progress7dEl: HTMLSpanElement | null;
  timer7dTextEl: HTMLSpanElement | null;
  syncDotEl: HTMLSpanElement | null;
  btnRefreshEl: HTMLButtonElement | null;
  statusSourceEl: HTMLDivElement | null;
  statusSyncTimeEl: HTMLDivElement | null;
  styleStatusEl: HTMLDivElement | null;
  svgEditorEl: HTMLDivElement | null;
  svgTextareaEl: HTMLTextAreaElement | null;
  cssTextareaEl: HTMLTextAreaElement | null;
  cssTargetSelectEl: HTMLSelectElement | null;
  fileInputEl: HTMLInputElement | null;
  imageBtnEl: HTMLButtonElement | null;
  svgBtnEl: HTMLButtonElement | null;
} = {
  rootEl: null,
  pillContainerEl: null,
  drawerEl: null,
  headSlotEl: null,
  group5hEl: null,
  usage5hTextEl: null,
  progress5hEl: null,
  timer5hTextEl: null,
  group7dEl: null,
  usage7dTextEl: null,
  progress7dEl: null,
  timer7dTextEl: null,
  syncDotEl: null,
  btnRefreshEl: null,
  statusSourceEl: null,
  statusSyncTimeEl: null,
  styleStatusEl: null,
  svgEditorEl: null,
  svgTextareaEl: null,
  cssTextareaEl: null,
  cssTargetSelectEl: null,
  fileInputEl: null,
  imageBtnEl: null,
  svgBtnEl: null,
};

export const ornamentBtns: HTMLButtonElement[] = [];

export const progressBtns: Record<MetricKind, HTMLButtonElement[]> = {
  fiveHour: [],
  weekly: [],
};

export const uiState: {
  iconRevision: number;
  uploadSequence: number;
  lastOrnamentRender: OrnamentRenderState | null;
  customSvgCache: CustomSvgCache;
  progressCache: Record<MetricKind, ProgressCacheEntry>;
} = {
  iconRevision: 0,
  uploadSequence: 0,
  lastOrnamentRender: null,
  customSvgCache: { source: "", node: null },
  progressCache: {
    fiveHour: { key: "" },
    weekly: { key: "" },
  },
};

export function bumpIconRevision(): number {
  uiState.iconRevision += 1;
  return uiState.iconRevision;
}

export function nextUploadSequence(): number {
  uiState.uploadSequence += 1;
  return uiState.uploadSequence;
}
