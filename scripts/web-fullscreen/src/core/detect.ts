import {
  BUTTON_ATTRIBUTE,
  CONTROL_CANDIDATE_SELECTOR,
  EXISTING_WEB_FULLSCREEN_TEXT,
  FULLSCREEN_HINT_TEXT,
  FULLSCREEN_LABEL_ATTRIBUTES,
  MAX_LABEL_LENGTH,
  NATIVE_FULLSCREEN_TEXT,
  PLAYER_MAX_HEIGHT_RATIO,
  PLAYER_MAX_WIDTH_RATIO,
  PLAYER_SEARCH_DEPTH,
} from "../config";

export type PlayerMode = "custom" | "native" | "skip";

export interface PlayerMatch {
  readonly video: HTMLVideoElement;
  readonly mode: PlayerMode;
  readonly root: HTMLElement;
  readonly fullscreenButton: HTMLElement | null;
}

/**
 * A class change can make an already-present control recognizable (or no
 * longer recognizable), so the installer uses this to decide whether a full
 * rescan is worth scheduling.
 */
export function looksLikePlayerControl(identifier: string): boolean {
  return (
    FULLSCREEN_HINT_TEXT.test(identifier) ||
    EXISTING_WEB_FULLSCREEN_TEXT.test(identifier)
  );
}

interface ControlSearch {
  readonly button: HTMLElement | null;
  readonly hasWebFullscreen: boolean;
}

function readLabels(element: HTMLElement): string[] {
  const labels: string[] = [];
  for (const attribute of FULLSCREEN_LABEL_ATTRIBUTES) {
    const value = element.getAttribute(attribute);
    if (value !== null && value.trim().length > 0) labels.push(value.trim());
  }
  const text = element.textContent?.trim() ?? "";
  if (text.length > 0 && text.length <= MAX_LABEL_LENGTH) labels.push(text);
  return labels;
}

function isClickable(element: HTMLElement): boolean {
  return element.matches(
    'button, [role="button"], a[href], [tabindex], [onclick], ' +
      '[class*="btn"], [class*="button"], [class*="ctrl"], [class*="control"]',
  );
}

function identifierOf(element: HTMLElement): string {
  const testId = element.getAttribute("data-testid") ?? "";
  return `${element.id} ${element.className} ${testId}`;
}

function scoreButton(element: HTMLElement, video: HTMLVideoElement): number {
  if (element.hasAttribute(BUTTON_ATTRIBUTE)) return 0;
  if (element.contains(video)) return 0;
  if (element.closest('[role="menu"], [role="dialog"]') !== null) return 0;

  const labels = readLabels(element);
  const identifier = identifierOf(element);
  let score = 0;
  if (labels.some((label) => NATIVE_FULLSCREEN_TEXT.test(label))) score += 6;
  if (FULLSCREEN_HINT_TEXT.test(identifier)) score += 3;
  if (labels.some((label) => FULLSCREEN_HINT_TEXT.test(label))) score += 2;
  if (score > 0 && isClickable(element)) score += 1;
  return score;
}

function collectCandidates(root: HTMLElement): HTMLElement[] {
  const candidates: HTMLElement[] = [];
  for (const element of root.querySelectorAll(CONTROL_CANDIDATE_SELECTOR)) {
    if (element instanceof HTMLElement) candidates.push(element);
  }
  return candidates;
}

function findControls(root: HTMLElement, video: HTMLVideoElement): ControlSearch {
  let bestButton: HTMLElement | null = null;
  let bestScore = 0;
  let hasWebFullscreen = false;

  for (const candidate of collectCandidates(root)) {
    if (candidate.hasAttribute(BUTTON_ATTRIBUTE)) continue;
    const labels = readLabels(candidate);
    if (
      isClickable(candidate) &&
      labels.some((label) => EXISTING_WEB_FULLSCREEN_TEXT.test(label))
    ) {
      hasWebFullscreen = true;
      continue;
    }
    const score = scoreButton(candidate, video);
    if (score <= bestScore) continue;
    bestButton = candidate;
    bestScore = score;
  }

  return { button: bestButton, hasWebFullscreen };
}

function fitsPlayerBounds(node: HTMLElement, videoRect: DOMRect): boolean {
  const rect = node.getBoundingClientRect();
  // jsdom and display:none nodes report no box; keep searching structurally.
  if (rect.width <= 0 || rect.height <= 0) return true;
  return (
    rect.width <= videoRect.width * PLAYER_MAX_WIDTH_RATIO &&
    rect.height <= videoRect.height * PLAYER_MAX_HEIGHT_RATIO
  );
}

/**
 * Walk up from the video until the nearest ancestor that owns a control bar.
 * Every level is bound-checked so a page-level "fullscreen" control is not
 * mistaken for the player control.
 */
export function findPlayerMatch(video: HTMLVideoElement): PlayerMatch {
  const doc = video.ownerDocument;
  const videoRect = video.getBoundingClientRect();
  let node = video.parentElement;
  let depth = 0;

  while (
    node !== null &&
    node !== doc.body &&
    depth < PLAYER_SEARCH_DEPTH
  ) {
    if (!fitsPlayerBounds(node, videoRect)) break;
    const controls = findControls(node, video);
    if (controls.hasWebFullscreen) {
      return { video, mode: "skip", root: node, fullscreenButton: null };
    }
    if (controls.button !== null) {
      return {
        video,
        mode: "custom",
        root: node,
        fullscreenButton: controls.button,
      };
    }
    node = node.parentElement;
    depth += 1;
  }

  return { video, mode: "native", root: video, fullscreenButton: null };
}
