export type StyleDeclaration = readonly [property: string, value: string];

export const SCRIPT_MARKER_ATTRIBUTE = "data-yoko-web-fullscreen-ready";
export const BUTTON_ATTRIBUTE = "data-yoko-web-fullscreen";
export const BUTTON_CLASS = "yoko-web-fullscreen-button";
export const FLOATING_BUTTON_CLASS = "yoko-web-fullscreen-floating";

export const LABELS = {
  enter: "网页全屏",
  exit: "退出网页全屏",
} as const;

export const NATIVE_FULLSCREEN_TEXT =
  /^(?:(?:enter|exit|go|toggle|switch|open|close)\s+)?full\s*-?\s*screen(?:\s+(?:mode|view))?(?:\s*\([^)]*\))?$|^(?:(?:进入|退出|开启|关闭|切换|播放器)\s*)?全屏(?:播放|模式|观看)?(?:\s*[（(][^）)]*[）)])?$/iu;

export const FULLSCREEN_HINT_TEXT = /full\s*-?\s*screen|全屏/iu;

export const EXISTING_WEB_FULLSCREEN_TEXT =
  /网页全屏|web\s*-?\s*fullscreen|theater|theatre|影院|宽屏|wide\s*-?\s*screen/iu;

export const FULLSCREEN_LABEL_ATTRIBUTES = [
  "aria-label",
  "title",
  "data-title",
  "data-tooltip",
  "data-original-title",
] as const;

export const CONTROL_CANDIDATE_SELECTOR = [
  "button",
  '[role="button"]',
  "a[href]",
  "[tabindex]",
  "[aria-label]",
  '[class*="fullscreen"]',
  '[class*="full-screen"]',
  '[class*="full_screen"]',
  '[data-role*="fullscreen"]',
  '[data-action*="fullscreen"]',
  '[data-test*="fullscreen"]',
  '[data-testid*="fullscreen"]',
].join(",");

export const MAX_LABEL_LENGTH = 40;
export const PLAYER_SEARCH_DEPTH = 12;
export const PLAYER_MAX_WIDTH_RATIO = 1.8;
export const PLAYER_MAX_HEIGHT_RATIO = 2.6;

export const MIN_VIDEO_WIDTH_PX = 240;
export const MIN_VIDEO_HEIGHT_PX = 135;
export const SCAN_DEBOUNCE_MS = 180;

export const VIEWPORT_Z_INDEX = "2147483000";
export const FLOATING_BUTTON_SIZE_PX = 34;
export const FLOATING_BUTTON_RIGHT_OFFSET_PX = 52;
export const FLOATING_BUTTON_BOTTOM_OFFSET_PX = 8;

const BOX_SIDES = ["top", "right", "bottom", "left"] as const;
const RADIUS_CORNERS = [
  "top-left",
  "top-right",
  "bottom-right",
  "bottom-left",
] as const;

/*
 * Shorthands such as margin, border and border-radius expand into longhands
 * when written. Capturing only the shorthand would lose longhands the site had
 * set inline, so every property below is captured and restored individually.
 */
const EDGE_PROPERTIES = [
  ...BOX_SIDES.map((side) => `margin-${side}`),
  ...BOX_SIDES.map((side) => `padding-${side}`),
] as const;
const BORDER_PROPERTIES = BOX_SIDES.flatMap((side) => [
  `border-${side}-width`,
  `border-${side}-style`,
]);
const RADIUS_PROPERTIES = RADIUS_CORNERS.map(
  (corner) => `border-${corner}-radius`,
);

const EDGE_STYLES: readonly StyleDeclaration[] = [
  ...BOX_SIDES.map((side) => [`margin-${side}`, "0"] as const),
  ...BOX_SIDES.map((side) => [`padding-${side}`, "0"] as const),
];
const BORDER_STYLES: readonly StyleDeclaration[] = BOX_SIDES.flatMap((side) => [
  [`border-${side}-width`, "0"] as const,
  [`border-${side}-style`, "none"] as const,
]);
const RADIUS_STYLES: readonly StyleDeclaration[] = RADIUS_CORNERS.map(
  (corner) => [`border-${corner}-radius`, "0"] as const,
);

export const PLAYER_STYLE_PROPERTIES = [
  "position",
  "top",
  "left",
  "right",
  "bottom",
  "width",
  "height",
  "max-width",
  "max-height",
  "min-width",
  "min-height",
  ...EDGE_PROPERTIES,
  ...BORDER_PROPERTIES,
  ...RADIUS_PROPERTIES,
  "box-sizing",
  "z-index",
  "background-color",
  "overflow-x",
  "overflow-y",
  "transform",
  "contain",
] as const;

export const PLAYER_FULLSCREEN_STYLES: readonly StyleDeclaration[] = [
  ["position", "fixed"],
  ["top", "0"],
  ["left", "0"],
  ["right", "auto"],
  ["bottom", "auto"],
  ["width", "100vw"],
  ["height", "100vh"],
  ["max-width", "none"],
  ["max-height", "none"],
  ["min-width", "0"],
  ["min-height", "0"],
  ...EDGE_STYLES,
  ...BORDER_STYLES,
  ...RADIUS_STYLES,
  ["box-sizing", "border-box"],
  ["z-index", VIEWPORT_Z_INDEX],
  ["background-color", "#000"],
  ["overflow-x", "hidden"],
  ["overflow-y", "hidden"],
  ["transform", "none"],
  ["contain", "none"],
];

export const VIDEO_STYLE_PROPERTIES = [
  "position",
  "top",
  "left",
  "width",
  "height",
  "max-width",
  "max-height",
  "min-width",
  "min-height",
  ...BOX_SIDES.map((side) => `margin-${side}`),
  "object-fit",
  "background-color",
  "z-index",
  "transform",
] as const;

export const CUSTOM_PLAYER_VIDEO_STYLES: readonly StyleDeclaration[] = [
  ["width", "100%"],
  ["height", "100%"],
  ["max-width", "none"],
  ["max-height", "none"],
  ["min-width", "0"],
  ["min-height", "0"],
  ["object-fit", "contain"],
  ["background-color", "#000"],
];

export const NATIVE_VIDEO_STYLES: readonly StyleDeclaration[] = [
  ["position", "fixed"],
  ["top", "0"],
  ["left", "0"],
  ["right", "auto"],
  ["bottom", "auto"],
  ["width", "100vw"],
  ["height", "100vh"],
  ["max-width", "none"],
  ["max-height", "none"],
  ["min-width", "0"],
  ["min-height", "0"],
  ...BOX_SIDES.map((side) => [`margin-${side}`, "0"] as const),
  ["object-fit", "contain"],
  ["background-color", "#000"],
  ["z-index", VIEWPORT_Z_INDEX],
  ["transform", "none"],
];

export const CONTAINING_BLOCK_PROPERTIES = [
  "transform",
  "filter",
  "perspective",
  "contain",
  "will-change",
  "backdrop-filter",
  "z-index",
  "isolation",
] as const;

export const CONTAINING_BLOCK_STYLES: readonly StyleDeclaration[] = [
  ["transform", "none"],
  ["filter", "none"],
  ["perspective", "none"],
  ["contain", "none"],
  ["will-change", "auto"],
  ["backdrop-filter", "none"],
  ["z-index", "auto"],
  ["isolation", "auto"],
];

export const SCROLL_LOCK_PROPERTIES = ["overflow-x", "overflow-y"] as const;

export const FRAME_CHANNEL = "yoko-web-fullscreen-frame";

export const FRAME_STYLE_PROPERTIES = [
  "position",
  "top",
  "left",
  "right",
  "bottom",
  "width",
  "height",
  "max-width",
  "max-height",
  "min-width",
  "min-height",
  ...EDGE_PROPERTIES,
  ...BORDER_PROPERTIES,
  "box-sizing",
  "background-color",
  "z-index",
] as const;

export const FRAME_FULLSCREEN_STYLES: readonly StyleDeclaration[] = [
  ["position", "fixed"],
  ["top", "0"],
  ["left", "0"],
  ["right", "auto"],
  ["bottom", "auto"],
  ["width", "100vw"],
  ["height", "100vh"],
  ["max-width", "none"],
  ["max-height", "none"],
  ["min-width", "0"],
  ["min-height", "0"],
  ...EDGE_STYLES,
  ...BORDER_STYLES,
  ["box-sizing", "border-box"],
  ["background-color", "#000"],
  ["z-index", VIEWPORT_Z_INDEX],
];

export const DANGEROUS_BUTTON_ATTRIBUTES: ReadonlySet<string> = new Set([
  "id",
  "href",
  "target",
  "download",
  "disabled",
  "hidden",
  "aria-pressed",
  "aria-expanded",
  "aria-haspopup",
  "aria-controls",
  "aria-keyshortcuts",
  "aria-labelledby",
  "aria-describedby",
  "aria-disabled",
  "aria-hidden",
]);

export const BUTTON_STATE_CLASS_PATTERN =
  /^(?:.*[-_])?(?:is-)?(?:active|selected|checked|current|disabled|hidden|focused|on)$/iu;
