export const HUD_ID = "ai-turbo-extreme-hud";
export const STYLE_ID = "ai-turbo-engine-styles";
export const CODE_COLLAPSE_HEIGHT = 300;
export const CODE_PREVIEW_HEIGHT = 200;
export const DEFAULT_MESSAGE_LIMIT = 60;
export const MESSAGE_LIMIT_MIN = 10;
export const MESSAGE_LIMIT_MAX = 999;
export const LOAD_WARNING_RATIO = 0.7;
export const LOAD_RING_RADIUS = 16.2;
export const LOAD_RING_CIRCUMFERENCE = 2 * Math.PI * LOAD_RING_RADIUS;
export const TURN_MARKER_ATTRIBUTES = new Set([
  "data-testid",
  "data-turn",
  "data-turn-key",
  "data-message-author-role",
  "data-message-role",
  "data-conversation-role",
  "data-role",
  "data-content-search-unit-key",
  "data-content-search-turn-key",
  "data-thread-find-target",
  "data-conversation-transcript",
  "data-user-message-bubble",
  "data-chatgpt-agent-turn-start",
  "data-app-shell-main-surface",
]);
export const TURN_SELECTOR_ATTRIBUTES = new Set([
  ...TURN_MARKER_ATTRIBUTES,
  "class",
  "id",
]);
export const CHATGPT_SHELL_ROOT_SELECTOR =
  '[data-app-shell-main-surface] [data-thread-find-target="conversation"]';
export const CHATGPT_SHELL_TURN_SELECTOR =
  '[data-app-shell-main-surface] [data-thread-find-target="conversation"] [data-turn-key]';
export const CHATGPT_TRANSCRIPT_ROOT_SELECTOR = "ol[data-conversation-transcript]";
export const CHATGPT_TRANSCRIPT_MESSAGE_SELECTOR =
  "ol[data-conversation-transcript] > li[data-message-role]";
export const CHATGPT_CODE_CARD_BOUNDARY_SELECTOR = [
  "[data-turn-key]",
  '[data-testid^="conversation-turn-"]',
  "article[data-turn]",
  "section[data-turn]",
  'li[data-message-role="assistant"]',
  '[data-message-author-role="assistant"]',
].join(", ");
export const CHATGPT_CODE_HEADER_MARKER_SELECTOR = [
  ".code-block-decoration",
  '[data-testid*="code-block-header" i]',
  '[data-testid*="code-block-toolbar" i]',
  '[class*="code-block-header" i]',
  '[class*="code-header" i]',
  '[class*="code-toolbar" i]',
  'button[aria-label*="copy code" i]',
  'button[title*="copy code" i]',
  '[data-testid*="copy-code" i]',
  'button[aria-label*="复制代码"]',
  'button[title*="复制代码"]',
].join(", ");
export const CHATGPT_CODE_CARD_MAX_ANCESTORS = 10;
export const SEARCH_PREVIEW_LIMIT = 180;
export const SEARCH_LIMIT = 10;
export const STORAGE_KEY_POS = "ai_turbo_pill_pos";
export const STORAGE_KEY_CONFIG = "ai_turbo_engine_config";
export const VIRTUAL_FILE_THRESHOLD = 1500;
/** Gap in px between the composer top edge and a sibling that belongs to it. */
export const COMPOSER_VISUAL_GAP = 48;
/** How many composer ancestors to walk when measuring visible bounds. */
export const COMPOSER_VISUAL_MAX_DEPTH = 5;
export const STREAMING_IDLE_DELAY = 1500;
export const THROTTLE_INTERVAL = 80;
export const CODE_FENCE = "\x60\x60\x60";

export const VF_TOKEN_START = "[[TURBO_VFILE_START:";
export const VF_TOKEN_END = ":TURBO_VFILE_END]]";
export const VF_REGEX =
  /\[\[TURBO_VFILE_START:([^|\r\n]+)\|(\d+)\|(\d+):TURBO_VFILE_END\]\]/;
export const HANDOFF_STORAGE_KEY = "ai_turbo_handoff_restore";
export const PLAIN_HANDOFF_START = "[META]";
export const PLAIN_HANDOFF_END = "[END]";
export const PLAIN_HANDOFF_SECTIONS = [
  "[META]",
  "[TASK]",
  "[DECISIONS]",
  "[PROGRESS]",
  "[ROLE]",
  "[CONTEXT]",
  "[OPEN_ISSUES]",
  "[KEY_ENTITIES]",
  "[HANDOFF_NOTES]",
  "[END]",
];
export const PLAIN_HANDOFF_TOLERANCE = 1;
export const REASONING_SELECTOR = [
  "model-thoughts",
  ".thoughts-container",
  ".thoughts-content",
  "[data-test-id*='thought' i]",
  "[data-testid*='thought' i]",
  "[data-testid*='reasoning' i]",
  "[data-testid*='thinking' i]",
  "[class*='reasoning' i]",
  "[class*='thinking' i]",
  "[class*='thought-process' i]",
  "[aria-label*='reasoning' i]",
  "[aria-label*='thinking' i]",
  "[aria-label*='思考']",
  "[aria-label*='推理']",
  "[data-type='reasoning']",
].join(", ");

export const STORAGE_KEY_REASONING = "ai_turbo_reasoning_memory";
export const REASONING_CONTROL_PATTERN =
  /深度思考|深度推理|思考|推理|思维链|thinking|reasoning|think harder|effort|智商|extended thinking/i;
export const REASONING_CONTROL_SELECTOR = [
  "button",
  "[role='button']",
  "[role='switch']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='menuitemradio']",
  "[role='menuitem']",
  "[role='option']",
  "[aria-pressed]",
  "[aria-checked]",
  "[data-state]",
].join(", ");
export const REASONING_MENU_SELECTOR =
  "[role='menu'], [role='listbox'], [role='dialog'], [role='radiogroup'], [data-radix-popper-content-wrapper], [data-floating-ui-portal]";
// 弹层里可能被选中的项：只用于找回上次的选项，不依赖任何文案关键词
export const CHOICE_OPTION_SELECTOR =
  "[aria-checked], [aria-selected], [role='menuitemradio'], [role='radio'], [role='option'], [role='menuitem'], button, a";
// 只带单选语义的项：普通菜单项不算，避免把“工具菜单”当成强度选择
export const CHOICE_RADIO_SELECTOR =
  "[aria-checked], [aria-selected], [role='menuitemradio'], [role='radio']";

export const BLOCK_TEXT_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DD",
  "DIV",
  "DL",
  "DT",
  "FIELDSET",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "SECTION",
  "TABLE",
  "TBODY",
  "TD",
  "TH",
  "THEAD",
  "TR",
  "UL",
]);

export interface PlatformDefinition {
  readonly name: string;
  readonly turnSelectors: readonly string[];
  readonly turnSelectorGroups?: readonly (readonly string[])[];
  readonly userTurnSelectors?: readonly string[];
  readonly userContentSelectors?: readonly string[];
  readonly codeSelectors: readonly string[];
  readonly contentSelectors: readonly string[];
  readonly inputSelectors: readonly string[];
  readonly sendButtonSelectors: readonly string[];
}

export const PLATFORMS = {
  chatgpt: {
    name: "ChatGPT",
    turnSelectorGroups: [
      [CHATGPT_SHELL_TURN_SELECTOR],
      [CHATGPT_TRANSCRIPT_MESSAGE_SELECTOR],
      [
        '[data-testid^="conversation-turn-"]',
        "article[data-turn]",
        "section[data-turn]",
      ],
      [
        '[data-message-author-role="user"]',
        '[data-message-author-role="assistant"]',
        '[data-message-role="user"]',
        '[data-message-role="assistant"]',
        '[data-role="user"]',
        '[data-role="assistant"]',
      ],
      [
        '[data-content-search-unit-key$=":user"]',
        '[data-content-search-unit-key$=":assistant"]',
      ],
      ["[data-turn-key]"],
    ],
    turnSelectors: [
      CHATGPT_SHELL_TURN_SELECTOR,
      CHATGPT_TRANSCRIPT_MESSAGE_SELECTOR,
      '[data-testid^="conversation-turn-"]',
      "article[data-turn]",
      "section[data-turn]",
      '[data-message-author-role="user"]',
      '[data-message-author-role="assistant"]',
      '[data-message-role="user"]',
      '[data-message-role="assistant"]',
      '[data-role="user"]',
      '[data-role="assistant"]',
      '[data-content-search-unit-key$=":user"]',
      '[data-content-search-unit-key$=":assistant"]',
      "[data-turn-key]",
    ],
    userTurnSelectors: [
      '[data-message-author-role="user"]',
      '[data-role="user"]',
      '[data-content-search-unit-key$=":user"]',
      '[data-user-message-bubble="true"]',
      '[data-testid="collapsible-user-message-root"]',
      '[data-testid*="user-message"]',
      '[class*="user-message"]',
    ],
    userContentSelectors: [
      '[data-testid="collapsible-user-message-root"]',
      ".whitespace-pre-wrap",
      '[data-user-message-bubble="true"]',
      '[data-content-search-unit-key$=":user"]',
      '[data-message-author-role="user"]',
    ],
    codeSelectors: ["pre"],
    contentSelectors: [
      ".markdown",
      ".prose",
      '[class*="markdown"]',
      ".whitespace-pre-wrap",
      '[data-content-search-unit-key$=":assistant"]',
      '[data-message-author-role="assistant"]',
      '[data-testid="message-content"]',
    ],
    inputSelectors: [
      'form[data-chatgpt-composer] [contenteditable="true"][role="textbox"]',
      'form[data-chatgpt-composer] [contenteditable="true"]',
      '[data-chatgpt-composer] [contenteditable="true"]',
      'div.ProseMirror[contenteditable="true"][role="textbox"]',
      "#prompt-textarea",
      'textarea[name="prompt-textarea"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
      "textarea",
    ],
    sendButtonSelectors: [
      'form[data-chatgpt-composer] button[type="submit"]',
      'form[data-chatgpt-composer] button[data-testid*="send" i]',
      'form[data-chatgpt-composer] button[aria-label*="Send" i]',
      'form[data-chatgpt-composer] button[aria-label*="发送"]',
      '[data-chatgpt-composer] button[data-testid*="send" i]',
      '[data-chatgpt-composer] button[aria-label*="Send" i]',
      'button[data-testid="send-button"]',
      'button[data-testid="fruitjuice-send-button"]',
      'button[data-testid="composer-send-button"]',
      'button[data-testid*="send-button" i]',
      'button[data-testid*="send" i]',
      'button[aria-label="Send prompt"]',
      'button[aria-label*="Send prompt" i]',
      'button[aria-label*="Send message" i]',
      'button[aria-label*="Send" i]',
      'button[aria-label*="发送"]',
      'button[title*="Send" i]',
      'button[type="submit"]',
    ],
  },
  gemini: {
    name: "Gemini",
    turnSelectors: [
      "user-query",
      "model-response",
      '[data-test-id="user-query"]',
      '[data-test-id="model-response"]',
      ".user-query",
      ".model-response",
      ".user-query-container",
      ".model-response-container",
    ],
    codeSelectors: ["code-block", "pre"],
    contentSelectors: [
      ".query-text",
      ".user-query-text",
      "[class*='query-content']",
      ".model-response-text",
      "message-content",
      ".message-content",
      ".markdown",
      ".md-content",
      ".response-content",
    ],
    inputSelectors: [
      "rich-textarea .ql-editor",
      "rich-textarea div[contenteditable='true']",
      ".rich-textarea div[contenteditable='true']",
      "div[contenteditable='true'][role='textbox']",
      "div[contenteditable='true']",
      "textarea",
    ],
    sendButtonSelectors: [
      "button.send-button",
      'button[aria-label*="Send message"]',
      'button[aria-label*="发送消息"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="发送"]',
      'button[aria-label*="提交"]',
      ".send-button-container button",
      "rich-textarea + * button",
    ],
  },
  grok: {
    name: "Grok",
    turnSelectors: [
      'div[data-testid*="message-container"]',
      'div[data-testid*="conversation-turn"]',
      'div[class*="message-bubble"]',
    ],
    codeSelectors: ["pre"],
    contentSelectors: ['div[class*="message-content"]', 'div[dir="auto"]'],
    inputSelectors: ["textarea", 'div[contenteditable="true"]'],
    sendButtonSelectors: [
      'button[aria-label*="Grok"]',
      'button[type="submit"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="发送"]',
    ],
  },
  claude: {
    name: "Claude",
    turnSelectors: [
      "div.font-user-message",
      ".font-claude-response",
      ".font-claude-message",
      "div[data-test-render-count]",
    ],
    codeSelectors: ["pre"],
    contentSelectors: [
      ".standard-markdown",
      ".progressive-markdown",
      ".markdown",
      '[class*="font-claude"]',
    ],
    inputSelectors: [
      "div.ProseMirror[contenteditable='true']",
      'div[contenteditable="true"]',
    ],
    sendButtonSelectors: [
      'button[aria-label*="Send Message"]',
      'button[aria-label*="发送消息"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="发送"]',
      "fieldset button:last-child",
    ],
  },
  deepseek: {
    name: "DeepSeek",
    turnSelectors: [
      ".ds-message",
      "div[data-um-id]",
      "div.dad65929",
      "div._4f9bf79",
      "div.d29f3d7d",
      '[data-message-author-role="user"]',
      '[data-message-author-role="assistant"]',
      '[data-role="user"]',
      '[data-role="assistant"]',
    ],
    userTurnSelectors: [
      '[data-message-author-role="user"]',
      '[data-role="user"]',
      "div[data-um-id]",
      "div.d29f3d7d",
      '[data-testid*="user-message"]',
      '[class*="user-message"]',
    ],
    userContentSelectors: [
      "._9663006 .fbb737a4",
      ".ds-markdown",
      "div[data-um-id]",
      '[data-testid*="user-message"]',
      '[class*="user-message"]',
    ],
    codeSelectors: ["pre", "code-block"],
    contentSelectors: [
      ".ds-markdown",
      ".markdown",
      ".prose",
      '[class*="markdown"]',
      '[class*="answer"]',
    ],
    inputSelectors: [
      "#chat-input",
      'textarea[data-testid="chat-input"]',
      'textarea[placeholder*="Send a message" i]',
      "textarea[placeholder]",
      'div[contenteditable="true"][role="textbox"]',
      "textarea",
      '[contenteditable="true"]',
    ],
    sendButtonSelectors: [
      'button[data-testid="send-button"]',
      'button[aria-label="Send message"]',
      'button[data-testid*="send"]',
      'button[type="submit"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="发送"]',
    ],
  },
  copilot: {
    name: "Microsoft Copilot",
    turnSelectors: [
      '[class*="user-message"]',
      '[class*="assistant-message"]',
      '[data-testid*="message"]',
    ],
    userTurnSelectors: [
      '[class*="user-message"]',
      '[data-testid*="user-message"]',
      '[data-message-author-role="user"]',
    ],
    userContentSelectors: [
      '[class*="user-message"]',
      '[data-testid*="user-message"]',
    ],
    codeSelectors: ["pre"],
    contentSelectors: [
      ".ac-textBlock",
      ".markdown",
      ".prose",
      '[class*="message-content"]',
    ],
    inputSelectors: [
      "textarea[placeholder]",
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
      "textarea",
    ],
    sendButtonSelectors: [
      'button[data-testid*="send"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="发送"]',
      'button[type="submit"]',
    ],
  },
  perplexity: {
    name: "Perplexity",
    turnSelectors: [
      '[data-testid="chat-message"]',
      '[data-testid*="chat-message"]',
      '[data-message-author-role="user"]',
      '[data-message-author-role="assistant"]',
    ],
    userTurnSelectors: [
      '[data-testid*="user-message"]',
      '[data-message-author-role="user"]',
      '[class*="user-message"]',
      '[class*="human"]',
    ],
    userContentSelectors: [
      '[data-testid*="user-message"]',
      '[class*="user-message"]',
      ".whitespace-pre-wrap",
    ],
    codeSelectors: ["pre"],
    contentSelectors: [
      ".prose",
      ".markdown",
      '[class*="prose"]',
      '[class*="message-content"]',
    ],
    inputSelectors: [
      "textarea[placeholder]",
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
      "textarea",
    ],
    sendButtonSelectors: [
      'button[data-testid*="send"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="发送"]',
      'button[type="submit"]',
    ],
  },
  poe: {
    name: "Poe",
    turnSelectors: [
      ".Message",
      ".ChatMessage",
      '[data-message-author-role="user"]',
      '[data-message-author-role="assistant"]',
    ],
    userTurnSelectors: [
      '[data-message-author-role="user"]',
      '[data-testid*="user-message"]',
      '[class*="UserMessage"]',
      '[class*="humanMessage"]',
    ],
    userContentSelectors: [
      '[data-testid*="user-message"]',
      '[class*="UserMessage"]',
      ".Message",
    ],
    codeSelectors: ["pre"],
    contentSelectors: [
      ".markdown",
      ".MessageContent",
      '[class*="messageContent"]',
      '[class*="message-content"]',
    ],
    inputSelectors: [
      "textarea[placeholder]",
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
      "textarea",
    ],
    sendButtonSelectors: [
      'button[data-testid*="send"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="发送"]',
      'button[type="submit"]',
    ],
  },
  doubao: {
    name: "Doubao",
    turnSelectors: [
      '[data-testid="send_message"]',
      '[data-testid="receive_message"]',
      '[data-testid="message_text_content"]',
      '[data-testid="message_content"]',
      '[data-testid*="message_content"]',
      '[data-message-author-role="user"]',
      '[data-message-author-role="assistant"]',
    ],
    userTurnSelectors: [
      '[data-testid="send_message"]',
      '[data-testid*="user-message"]',
      '[data-message-author-role="user"]',
      '[data-message-role="user"]',
      '[data-role="user"]',
      '[class*="user-message"]',
    ],
    userContentSelectors: [
      '[data-testid="message_text_content"]',
      '[data-testid="message_content"]',
      '[data-testid*="user-message"]',
      '[class*="user-message"]',
    ],
    codeSelectors: ["pre"],
    contentSelectors: [
      '[data-testid="message_text_content"]',
      '[data-testid="message_content"]',
      '[data-testid*="message_content"]',
      ".markdown",
      '[class*="message-content"]',
    ],
    inputSelectors: [
      '[data-testid="chat_input_input"]',
      "#chat-input",
      "textarea[placeholder]",
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
      "textarea",
    ],
    sendButtonSelectors: [
      '[data-testid="chat_input_send_button"]',
      'button[data-testid*="send"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="发送"]',
      'button[type="submit"]',
    ],
  },
  yuanbao: {
    name: "Tencent Yuanbao / 腾讯元宝",
    turnSelectors: [
      ".agent-chat__list__item--human",
      ".agent-chat__list__item--ai",
      '[data-message-author-role="user"]',
      '[data-message-author-role="assistant"]',
    ],
    userTurnSelectors: [
      ".agent-chat__list__item--human",
      ".agent-chat__bubble--human",
      '[data-message-author-role="user"]',
      '[data-role="user"]',
    ],
    userContentSelectors: [
      ".agent-chat__bubble--human .hyc-content-text",
      ".agent-chat__bubble--human .agent-chat__bubble__content",
      ".agent-chat__bubble__content",
      '[data-message-author-role="user"]',
    ],
    codeSelectors: ["pre"],
    contentSelectors: [
      ".hyc-common-markdown-style",
      ".hyc-content-md-done",
      ".hyc-content-md",
      ".agent-chat__speech-text",
      ".agent-chat__bubble__content",
      ".hyc-content-text",
      '[data-message-author-role="assistant"]',
    ],
    inputSelectors: [
      '.agent-dialogue__content--common__input .ql-editor[contenteditable="true"]',
      '#search-bar .ql-editor[contenteditable="true"]',
      '.ql-editor[contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
      "textarea",
    ],
    sendButtonSelectors: [
      "#yuanbao-send-btn",
      '.agent-dialogue__content--common__input button[type="submit"]',
      'button[aria-label*="发送"]',
      'button[aria-label*="Send"]',
      'button[type="submit"]',
    ],
  },
  qwen: {
    name: "Qwen Chat",
    turnSelectors: [
      ".chat-user-message-container",
      ".chat-user-message",
      '[data-message-author-role="user"]',
      '[data-message-author-role="assistant"]',
      '[data-message-author="user"]',
      '[data-message-author="assistant"]',
      '[data-role="user"]',
      '[data-role="assistant"]',
      '[data-testid="chat-message"]',
      '[class*="questionItem"]',
      '[class*="answerItem"]',
    ],
    userTurnSelectors: [
      ".chat-user-message-container",
      ".chat-user-message",
      '[data-message-author-role="user"]',
      '[data-message-author="user"]',
      '[data-role="user"]',
      '[data-testid="user-message"]',
      '[class*="questionItem"]',
      '[class*="user-message"]',
    ],
    userContentSelectors: [
      ".chat-user-message",
      ".chat-user-message-container",
      '[class*="questionItem"]',
      '[data-message-author-role="user"]',
      '[data-message-author="user"]',
      '[data-role="user"]',
      ".whitespace-pre-wrap",
    ],
    codeSelectors: ["pre"],
    contentSelectors: [
      ".markdown-root",
      ".markdown-body",
      ".tongyi-markdown",
      ".markdown",
      ".prose",
      '[class*="answerItem"]',
      '[data-message-author-role="assistant"]',
      '[data-message-author="assistant"]',
      '[data-role="assistant"]',
    ],
    inputSelectors: [
      "textarea#chat-input",
      '#chat-input[contenteditable="true"]',
      "textarea.message-input-textarea",
      'textarea[placeholder*="Ask Qwen" i]',
      'textarea[placeholder*="message" i]',
      '[contenteditable="true"][role="textbox"]',
      "textarea",
      '[contenteditable="true"]',
    ],
    sendButtonSelectors: [
      ".message-input-right-button-send",
      'button[data-testid="send-button"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="发送"]',
      'button[type="submit"]',
    ],
  },
  qianwen: {
    name: "Qianwen / 千问",
    turnSelectors: [
      '[class*="questionItem"]',
      '[class*="answerItem"]',
      '[data-message-author-role="user"]',
      '[data-message-author-role="assistant"]',
      '[data-message-author="user"]',
      '[data-message-author="assistant"]',
      '[data-role="user"]',
      '[data-role="assistant"]',
    ],
    userTurnSelectors: [
      '[class*="questionItem"]',
      '[data-message-author-role="user"]',
      '[data-message-author="user"]',
      '[data-role="user"]',
      '[class*="user-message"]',
    ],
    userContentSelectors: [
      '[class*="questionItem"]',
      ".bubble-uo23is",
      '[data-message-author-role="user"]',
      '[data-message-author="user"]',
      '[data-role="user"]',
    ],
    codeSelectors: ["pre"],
    contentSelectors: [
      ".tongyi-markdown",
      ".markdown-body",
      ".markdown",
      ".prose",
      '[class*="answerItem"]',
      '[data-message-author-role="assistant"]',
      '[data-message-author="assistant"]',
      '[data-role="assistant"]',
    ],
    inputSelectors: [
      "textarea#chat-input",
      "textarea.message-input-textarea",
      '#chat-input[contenteditable="true"]',
      'textarea[placeholder*="问" i]',
      'textarea[placeholder*="消息" i]',
      '[contenteditable="true"][role="textbox"]',
      "textarea",
      '[contenteditable="true"]',
    ],
    sendButtonSelectors: [
      ".message-input-right-button-send",
      'button[data-testid="send-button"]',
      'button[aria-label*="发送"]',
      'button[aria-label*="Send"]',
      'button[type="submit"]',
    ],
  },
  glm: {
    name: "ChatGLM / 智谱清言",
    turnSelectors: [
      ".question-txt.dots",
      '[data-message-author="user"]',
      '[data-message-author="assistant"]',
      '[data-message-author-role="user"]',
      '[data-message-author-role="assistant"]',
      '[data-role="user"]',
      '[data-role="assistant"]',
      ".role-user",
      ".role-assistant",
      ".message-user",
      ".message-assistant",
    ],
    userTurnSelectors: [
      ".question-txt.dots",
      '[data-message-author="user"]',
      '[data-message-author-role="user"]',
      '[data-role="user"]',
      ".role-user",
      ".message-user",
      '[data-testid*="user-message"]',
    ],
    userContentSelectors: [
      ".question-txt.dots",
      ".message-user .markdown-body",
      ".message-user .markdown",
      ".role-user",
      ".message-user",
      '[data-message-author="user"]',
      '[data-role="user"]',
    ],
    codeSelectors: ["pre"],
    contentSelectors: [
      ".role-assistant .markdown-body",
      ".message-assistant .markdown-body",
      ".markdown-body",
      ".markdown",
      ".prose",
      '[class*="markdown"]',
      '[class*="answer"]',
      '[data-message-author="assistant"]',
      '[data-role="assistant"]',
    ],
    inputSelectors: [
      "#chat-input",
      'textarea[placeholder*="请输入"]',
      'textarea[placeholder*="消息"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
      "textarea",
    ],
    sendButtonSelectors: [
      'button[data-testid="send-button"]',
      'button[aria-label*="发送"]',
      'button[aria-label*="Send"]',
      'button[type="submit"]',
    ],
  },
  zai: {
    name: "Z.ai (GLM)",
    turnSelectors: [
      ".chat-user",
      ".chat-assistant",
      '[data-message-author="user"]',
      '[data-message-author="assistant"]',
      '[data-role="user"]',
      '[data-role="assistant"]',
      ".message-user",
      ".message-assistant",
      ".role-user",
      ".role-assistant",
    ],
    userTurnSelectors: [
      ".chat-user",
      '[data-message-author="user"]',
      '[data-role="user"]',
      ".message-user",
      ".role-user",
      '[data-testid="user-message"]',
    ],
    userContentSelectors: [
      ".chat-user .flex.justify-end.pb-1",
      '[data-message-author="user"]',
      '[data-role="user"]',
      ".chat-user",
      ".message-user",
      ".role-user",
    ],
    codeSelectors: ["pre"],
    contentSelectors: [
      ".chat-assistant .markdown-body",
      ".chat-assistant .markdown-root",
      ".chat-assistant",
      ".markdown-body",
      ".markdown-root",
      ".markdown",
      ".prose",
      '[class*="markdown"]',
      '[data-message-author="assistant"]',
      '[data-role="assistant"]',
      ".message-assistant",
      ".role-assistant",
    ],
    inputSelectors: [
      'div[contenteditable="true"]#chat-input',
      'div[contenteditable="true"][data-testid*="input"]',
      "textarea#chat-input",
      'textarea[placeholder="Send a Message"]',
      'textarea[placeholder*="message" i]',
      'div[contenteditable="true"][role="textbox"]',
      "textarea",
      '[contenteditable="true"]',
    ],
    sendButtonSelectors: [
      'button[type="submit"]',
      'button[aria-label="Send"]',
      'button[data-testid="send-button"]',
      'button[aria-label*="send" i]',
      'button[aria-label*="发送"]',
    ],
  },
} satisfies Record<string, PlatformDefinition>;
