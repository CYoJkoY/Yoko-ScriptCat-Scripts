// ==UserScript==
// @name         AI Chat Turbo Engine
// @namespace    https://cyojkoy.github.io/Payment/
// @version      0.16.1
// @description  跨平台 AI 对话加速：常驻统计 + 完整消息提取 + YAML 交接 + 多平台适配 + 长代码折叠 + 自适应脱水 + 推理强度记忆
// @author       Yoko
// @updateURL    https://cdn.jsdelivr.net/gh/CYoJkoY/Yoko-ScriptCat-Scripts@main/scripts/ai-chat-turbo-engine.js
// @downloadURL  https://ghfast.top/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/main/scripts/ai-chat-turbo-engine.js
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @match        https://gemini.google.com/*
// @match        https://grok.com/*
// @match        https://x.com/i/grok*
// @match        https://claude.ai/*
// @match        https://chat.deepseek.com/*
// @match        https://copilot.microsoft.com/*
// @match        https://perplexity.ai/*
// @match        https://www.perplexity.ai/*
// @match        https://poe.com/*
// @match        https://doubao.com/*
// @match        https://www.doubao.com/*
// @match        https://yuanbao.tencent.com/*
// @match        https://chat.qwen.ai/*
// @match        https://qianwen.com/*
// @match        https://www.qianwen.com/*
// @match        https://chatglm.cn/*
// @match        https://chat.z.ai/*
// @run-at       document-start
// @grant        none
// @noframes
// @icon         data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="64" height="64"><rect width="24" height="24" rx="6" fill="%2309090b"/><path d="M13 2L3 14h8l-1 8 11-12h-8l1-8z" fill="%2310b981"/></svg>
// @license      MIT
// ==/UserScript==

(function () {
  "use strict";

  // Read the version from the userscript header so the panel cannot drift.
  const VERSION =
    (typeof GM_info !== "undefined" && GM_info?.script?.version) || "0.0.0";
  const HUD_ID = "ai-turbo-extreme-hud";
  const STYLE_ID = "ai-turbo-engine-styles";
  const CODE_COLLAPSE_HEIGHT = 300;
  const CODE_PREVIEW_HEIGHT = 200;
  const DEFAULT_MESSAGE_LIMIT = 60;
  const MESSAGE_LIMIT_MIN = 10;
  const MESSAGE_LIMIT_MAX = 999;
  const LOAD_WARNING_RATIO = 0.7;
  const LOAD_RING_RADIUS = 16.2;
  const LOAD_RING_CIRCUMFERENCE = 2 * Math.PI * LOAD_RING_RADIUS;
  const TURN_MARKER_ATTRIBUTES = new Set([
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
  const TURN_SELECTOR_ATTRIBUTES = new Set([
    ...TURN_MARKER_ATTRIBUTES,
    "class",
    "id",
  ]);
  const CHATGPT_SHELL_ROOT_SELECTOR =
    '[data-app-shell-main-surface] [data-thread-find-target="conversation"]';
  const CHATGPT_SHELL_TURN_SELECTOR =
    '[data-app-shell-main-surface] [data-thread-find-target="conversation"] [data-turn-key]';
  const CHATGPT_TRANSCRIPT_ROOT_SELECTOR = "ol[data-conversation-transcript]";
  const CHATGPT_TRANSCRIPT_MESSAGE_SELECTOR =
    "ol[data-conversation-transcript] > li[data-message-role]";
  const CHATGPT_CODE_CARD_BOUNDARY_SELECTOR = [
    "[data-turn-key]",
    '[data-testid^="conversation-turn-"]',
    "article[data-turn]",
    "section[data-turn]",
    'li[data-message-role="assistant"]',
    '[data-message-author-role="assistant"]',
  ].join(", ");
  const CHATGPT_CODE_HEADER_MARKER_SELECTOR = [
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
  const CHATGPT_CODE_CARD_MAX_ANCESTORS = 10;
  const SEARCH_PREVIEW_LIMIT = 180;
  const SEARCH_LIMIT = 10;
  const STORAGE_KEY_POS = "ai_turbo_pill_pos";
  const STORAGE_KEY_CONFIG = "ai_turbo_engine_config";
  const VIRTUAL_FILE_THRESHOLD = 1500;
  const STREAMING_IDLE_DELAY = 1500;
  const THROTTLE_INTERVAL = 80;
  const CODE_FENCE = "\x60\x60\x60";

  const VF_TOKEN_START = "[[TURBO_VFILE_START:";
  const VF_TOKEN_END = ":TURBO_VFILE_END]]";
  const VF_REGEX =
    /\[\[TURBO_VFILE_START:([^|\r\n]+)\|(\d+)\|(\d+):TURBO_VFILE_END\]\]/;
  const HANDOFF_STORAGE_KEY = "ai_turbo_handoff_restore";
  const PLAIN_HANDOFF_START = "[META]";
  const PLAIN_HANDOFF_END = "[END]";
  const PLAIN_HANDOFF_SECTIONS = [
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
  const PLAIN_HANDOFF_TOLERANCE = 1;
  const REASONING_SELECTOR = [
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

  const STORAGE_KEY_REASONING = "ai_turbo_reasoning_memory";
  const REASONING_CONTROL_PATTERN =
    /深度思考|深度推理|思考|推理|思维链|thinking|reasoning|think harder|effort|智商|extended thinking/i;
  const REASONING_CONTROL_SELECTOR = [
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
  const REASONING_MENU_SELECTOR =
    "[role='menu'], [role='listbox'], [role='dialog'], [role='radiogroup'], [data-radix-popper-content-wrapper], [data-floating-ui-portal]";
  // 弹层里可能被选中的项：只用于找回上次的选项，不依赖任何文案关键词
  const CHOICE_OPTION_SELECTOR =
    "[aria-checked], [aria-selected], [role='menuitemradio'], [role='radio'], [role='option'], [role='menuitem'], button, a";
  // 只带单选语义的项：普通菜单项不算，避免把“工具菜单”当成强度选择
  const CHOICE_RADIO_SELECTOR =
    "[aria-checked], [aria-selected], [role='menuitemradio'], [role='radio']";

  const BLOCK_TEXT_TAGS = new Set([
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

  const PLATFORMS = {
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
  };

  function hostnameMatches(hostname, domains) {
    return domains.some(
      (domain) => hostname === domain || hostname.endsWith("." + domain),
    );
  }

  // Login, account chooser, and OAuth callback routes are not chat pages.
  // Only path segments are inspected; query params such as next or redirect
  // are ignored so normal chat links keep working.
  const AUTH_ROUTE_SEGMENTS = new Set([
    "auth",
    "auth0",
    "authorize",
    "authorization",
    "oauth",
    "oauth2",
    "openid",
    "sso",
    "saml",
    "login",
    "log-in",
    "signin",
    "sign-in",
    "sign_in",
    "signup",
    "sign-up",
    "sign_up",
    "register",
    "registration",
    "callback",
    "magic-link",
    "magiclink",
    "verify",
    "verification",
    "mfa",
    "2fa",
    "otp",
    "account",
    "accounts",
    "account-chooser",
    "choose-account",
    "switch-account",
    "challenge",
    "captcha",
    "consent",
    "redirect",
    "recover",
    "recovery",
    "reset-password",
    "forgot-password",
    "password",
  ]);
  const AUTH_HOSTNAME_PREFIXES = [
    "auth.",
    "auth0.",
    "login.",
    "signin.",
    "accounts.",
    "sso.",
  ];

  // Whether the engine is live in this document. SPA navigation to an auth
  // route sets it back to false until the chat route returns.
  let engineActive = false;

  function isAuthOrRedirectRoute(locationLike) {
    const source = locationLike || window.location;
    if (!source) return false;

    const hostname = String(source.hostname || "").toLowerCase();
    if (
      AUTH_HOSTNAME_PREFIXES.some((prefix) => hostname.startsWith(prefix))
    ) {
      return true;
    }

    const pathname = String(source.pathname || "").toLowerCase();
    if (!pathname) return false;

    return pathname
      .split("/")
      .filter(Boolean)
      .some((segment) =>
        AUTH_ROUTE_SEGMENTS.has(segment.replace(/\.(?:html?|php|aspx?)$/, "")),
      );
  }

  /** Dormant on auth and redirect routes: no UI, no listeners, no input writes. */
  function isEngineDormant() {
    return !engineActive || isAuthOrRedirectRoute();
  }

  function detectPlatform() {
    const hostname = window.location.hostname.toLowerCase();
    const pathname = window.location.pathname;

    if (hostnameMatches(hostname, ["chatgpt.com", "chat.openai.com"])) {
      return PLATFORMS.chatgpt;
    }
    if (hostnameMatches(hostname, ["gemini.google.com"])) {
      return PLATFORMS.gemini;
    }
    if (
      hostnameMatches(hostname, ["grok.com"]) ||
      (hostname === "x.com" && pathname.startsWith("/i/grok"))
    ) {
      return PLATFORMS.grok;
    }
    if (hostnameMatches(hostname, ["claude.ai"])) {
      return PLATFORMS.claude;
    }
    if (hostnameMatches(hostname, ["deepseek.com"])) {
      return PLATFORMS.deepseek;
    }
    if (hostnameMatches(hostname, ["copilot.microsoft.com"])) {
      return PLATFORMS.copilot;
    }
    if (hostnameMatches(hostname, ["perplexity.ai"])) {
      return PLATFORMS.perplexity;
    }
    if (hostnameMatches(hostname, ["poe.com"])) {
      return PLATFORMS.poe;
    }
    if (hostnameMatches(hostname, ["doubao.com"])) {
      return PLATFORMS.doubao;
    }
    if (hostnameMatches(hostname, ["yuanbao.tencent.com"])) {
      return PLATFORMS.yuanbao;
    }
    if (hostnameMatches(hostname, ["chat.qwen.ai"])) {
      return PLATFORMS.qwen;
    }
    if (hostnameMatches(hostname, ["qianwen.com"])) {
      return PLATFORMS.qianwen;
    }
    if (hostnameMatches(hostname, ["chatglm.cn"])) {
      return PLATFORMS.glm;
    }
    if (hostnameMatches(hostname, ["chat.z.ai"])) {
      return PLATFORMS.zai;
    }
    return null;
  }

  const currentPlatform = detectPlatform();
  if (!currentPlatform) return;

  const state = {
    pruneEnabled: true,
    keepTurns: 8,
    messageLimit: DEFAULT_MESSAGE_LIMIT,
    collapseCode: true,
    virtualFileEnabled: true,
    rememberReasoning: true,
    hudOpen: false,
    totalTurns: 0,
    hiddenCount: 0,
    foldedCodeCount: 0,
    indexedTurns: [],
  };

  function loadSavedConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.keepTurns === "number" && !isNaN(parsed.keepTurns)) {
          state.keepTurns = Math.max(2, Math.min(50, parsed.keepTurns));
        }
        if (
          typeof parsed.messageLimit === "number" &&
          Number.isFinite(parsed.messageLimit)
        ) {
          state.messageLimit = normalizeMessageLimit(parsed.messageLimit);
        }
        if (typeof parsed.pruneEnabled === "boolean") {
          state.pruneEnabled = parsed.pruneEnabled;
        }
        if (typeof parsed.collapseCode === "boolean") {
          state.collapseCode = parsed.collapseCode;
        }
        if (typeof parsed.virtualFileEnabled === "boolean") {
          state.virtualFileEnabled = parsed.virtualFileEnabled;
        }
        if (typeof parsed.rememberReasoning === "boolean") {
          state.rememberReasoning = parsed.rememberReasoning;
        }
      }
    } catch (_) {}
  }

  function saveCurrentConfig() {
    try {
      const config = {
        keepTurns: state.keepTurns,
        messageLimit: state.messageLimit,
        pruneEnabled: state.pruneEnabled,
        collapseCode: state.collapseCode,
        virtualFileEnabled: state.virtualFileEnabled,
        rememberReasoning: state.rememberReasoning,
      };
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
    } catch (_) {}
  }

  function normalizeMessageLimit(rawLimit) {
    const numericLimit = Number(rawLimit);
    if (!Number.isFinite(numericLimit)) return DEFAULT_MESSAGE_LIMIT;
    return Math.min(
      MESSAGE_LIMIT_MAX,
      Math.max(MESSAGE_LIMIT_MIN, Math.round(numericLimit)),
    );
  }

  const turnIndex = new Map();
  const codeState = new Map();
  const processedUserTurns = new WeakSet();
  // 用户手动恢复过的轮次：即使仍在保留轮次之外也不再脱水，避免阅读被打断
  const restoredTurns = new WeakSet();
  const virtualFileChatRows = new WeakMap();
  let activeVirtualFiles = [];
  let trayIsDirty = false;
  let isSubmitting = false;

  let hudRootElement = null;
  let hudShadowRoot = null;
  let hudStats = null;
  let handoffStatusNode = null;
  let reasoningStatusNode = null;
  let searchInput = null;
  let searchResultsBox = null;
  let virtualFileTrayAnchor = null;
  let virtualFileTrayResizeObserver = null;
  let virtualFileTrayPositionFrame = 0;

  let virtualFileTraySyncRaf = 0;
  let virtualFileTraySyncLastTs = 0;
  let virtualFileTrayLastSignature = "";
  let virtualFileTrayCachedInput = null;

  const VF_TRAY_SYNC_INTERVAL = 90; // ms
  const COMPOSER_VISUAL_GAP = 48;
  const COMPOSER_VISUAL_MAX_DEPTH = 5;
  let searchDebounceTimer = null;
  let observer = null;
  let codeResizeObserver = null;
  let scheduleTimer = null;
  let lastUpdateTime = 0;
  let fullTurnSyncRequested = true;
  let codeScanRequested = true;
  let dirtyTurns = new Set();
  let dirtyCodeBlocks = new Set();
  let previousTurns = [];
  let activeTurnSelectorGroup = null;
  const renderedCheckCache = new Map();
  let selfMutationDepth = 0;
  let globalListenersBound = false;
  let historyPatched = false;
  let routeWatcherBound = false;
  let viewportListenersBound = false;

  function el(tag, attrs = {}, children = []) {
    const elem = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "className") {
        elem.className = value;
      } else if (key === "style" && typeof value === "string") {
        elem.style.cssText = value;
      } else if (key.startsWith("on") && typeof value === "function") {
        elem.addEventListener(key.slice(2).toLowerCase(), value);
      } else {
        elem.setAttribute(key, value);
      }
    }
    for (const child of children) {
      if (typeof child === "string") {
        elem.appendChild(document.createTextNode(child));
      } else if (child instanceof Node) {
        elem.appendChild(child);
      }
    }
    return elem;
  }

  function withSelfMutation(task) {
    selfMutationDepth++;
    try {
      return task();
    } finally {
      selfMutationDepth--;
    }
  }

  function fastCountLines(text) {
    if (!text) return 0;
    let count = 1;
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) === 10) count++;
    }
    return count;
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizeText(sourceText) {
    return String(sourceText || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.replace(/[ \t]+$/g, ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function matchesReasoningElement(element) {
    if (!(element instanceof Element)) return false;
    try {
      return element.matches(REASONING_SELECTOR);
    } catch (_) {
      return false;
    }
  }

  function isReasoningElement(element) {
    if (!(element instanceof Element)) return false;
    try {
      return (
        matchesReasoningElement(element) ||
        Boolean(element.closest(REASONING_SELECTOR))
      );
    } catch (_) {
      return false;
    }
  }

  function elementToPlainText(rootElement) {
    if (
      !(rootElement instanceof Element) ||
      matchesReasoningElement(rootElement)
    ) {
      return "";
    }

    // Walk the live DOM without cloning large messages on each streaming mutation.
    // CSS dehydration/folding does not remove text nodes, so full text remains readable.
    const ignoredSelectors = [
      REASONING_SELECTOR,
      ".ai-turbo-chat-file-row",
      ".ai-turbo-chat-capsule",
      ".ai-turbo-code-bar",
      "#ai-turbo-vf-tray",
      "#ai-turbo-vf-preview-modal",
      "button",
      "[role='toolbar']",
      "script",
      "style",
      "svg",
      "[hidden]",
    ].join(", ");
    const preservedCodeBlocks = [];

    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.nodeValue || "";
      }
      if (!(node instanceof Element)) {
        return Array.from(node.childNodes || [])
          .map(walk)
          .join("");
      }

      try {
        if (node !== rootElement && node.matches(ignoredSelectors)) return "";
      } catch (_) {}

      const tag = node.tagName.toUpperCase();
      if (tag === "BR") return "\n";
      if (tag === "PRE") {
        const codeText = node.textContent || "";
        const codeClasses = [
          node.className || "",
          node.querySelector("code")?.className || "",
          node.getAttribute("data-language") || "",
          node.querySelector("code")?.getAttribute("data-language") || "",
          node.querySelector("code")?.getAttribute("lang") || "",
        ].join(" ");
        const languageMatch = codeClasses.match(/language-([a-z0-9+#.-]+)/i);
        const language = languageMatch
          ? languageMatch[1].toLowerCase()
          : "text";
        const token = `\uE000TURBO_CODE_${preservedCodeBlocks.length}\uE001`;
        preservedCodeBlocks.push({ token, codeText, language });
        return `\n${CODE_FENCE}${language}\n${token}\n${CODE_FENCE}\n`;
      }

      const content = Array.from(node.childNodes).map(walk).join("");
      return BLOCK_TEXT_TAGS.has(tag) ? "\n" + content + "\n" : content;
    }

    let text = normalizeText(walk(rootElement));
    for (const block of preservedCodeBlocks) {
      const placeholder = `${CODE_FENCE}${block.language}\n${block.token}\n${CODE_FENCE}`;
      const preserved = `${CODE_FENCE}${block.language}\n${block.codeText}\n${CODE_FENCE}`;
      text = text.replace(placeholder, preserved);
    }
    return text;
  }

  function isGeminiThoughtElement(element) {
    if (currentPlatform !== PLATFORMS.gemini || !(element instanceof Element))
      return false;
    return Boolean(
      element.closest(
        "model-thoughts, .thoughts-container, .thoughts-content, [data-test-id*='thought']",
      ),
    );
  }

  function isUserTurn(turnElement) {
    if (!(turnElement instanceof Element)) return false;

    const contentSearchKey = turnElement.getAttribute(
      "data-content-search-unit-key",
    );
    if (contentSearchKey && /:(user|human)$/i.test(contentSearchKey)) {
      return true;
    }
    if (
      contentSearchKey &&
      /:(assistant|model|system)$/i.test(contentSearchKey)
    ) {
      return false;
    }

    const roleValues = [
      turnElement.getAttribute("data-message-author-role"),
      turnElement.getAttribute("data-message-author"),
      turnElement.getAttribute("data-role"),
      turnElement.getAttribute("data-message-role"),
      turnElement.getAttribute("data-conversation-role"),
      turnElement.getAttribute("data-turn"),
    ].filter(Boolean);
    if (roleValues.some((role) => /^(user|human)$/i.test(role))) return true;
    if (roleValues.some((role) => /^(assistant|model|system)$/i.test(role))) {
      return false;
    }

    const platformUserSelectors = currentPlatform.userTurnSelectors || [];
    for (const selector of platformUserSelectors) {
      if (
        turnElement.matches(selector) ||
        turnElement.querySelector(selector)
      ) {
        return true;
      }
    }

    // Some platforms mark the wrapper's parent rather than the message-content node.
    let ancestor = turnElement.parentElement;
    let ancestorDepth = 0;
    while (ancestor && ancestorDepth < 3) {
      if (
        platformUserSelectors.some((selector) => ancestor.matches(selector))
      ) {
        return true;
      }
      ancestor = ancestor.parentElement;
      ancestorDepth++;
    }

    if (
      turnElement.matches(
        "user-query, [data-test-id='user-query'], .user-query, .user-query-container",
      ) ||
      turnElement.querySelector(
        ".user-query-text, .query-text, [class*='query-content']",
      )
    ) {
      return true;
    }

    if (
      turnElement.matches("div.font-user-message") ||
      turnElement.querySelector(".font-user-message")
    ) {
      return true;
    }

    if (
      turnElement.matches('[data-testid*="user"], [class*="user"]') ||
      turnElement.querySelector('[data-testid*="user"]')
    ) {
      return true;
    }

    return false;
  }

  function getTurnRole(turnElement) {
    if (!(turnElement instanceof Element)) return "assistant";

    const contentSearchKey = turnElement.getAttribute(
      "data-content-search-unit-key",
    );
    if (contentSearchKey && /:(user|human)$/i.test(contentSearchKey)) {
      return "user";
    }
    if (contentSearchKey && /:(assistant|model)$/i.test(contentSearchKey)) {
      return "assistant";
    }

    const roleValues = [
      turnElement.getAttribute("data-message-author-role"),
      turnElement.getAttribute("data-message-author"),
      turnElement.getAttribute("data-role"),
      turnElement.getAttribute("data-message-role"),
      turnElement.getAttribute("data-conversation-role"),
      turnElement.getAttribute("data-turn"),
    ].filter(Boolean);

    if (roleValues.some((role) => /^(user|human)$/i.test(role))) return "user";
    if (roleValues.some((role) => /^(assistant|model)$/i.test(role))) {
      return "assistant";
    }

    for (const selector of currentPlatform.userTurnSelectors || []) {
      try {
        if (turnElement.matches(selector)) return "user";
      } catch (_) {}
    }
    return isUserTurn(turnElement) ? "user" : "assistant";
  }

  function uniqueDomOrdered(elements) {
    const seen = new Set();
    const unique = [];

    for (const element of elements) {
      if (!(element instanceof Element) || seen.has(element)) continue;
      seen.add(element);
      unique.push(element);
    }

    unique.sort((first, second) => {
      if (first === second) return 0;
      const relation = first.compareDocumentPosition(second);
      if (relation & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (relation & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    return unique;
  }

  function filterOutNested(elements) {
    const ordered = uniqueDomOrdered(elements);
    const candidateSet = new Set(ordered);

    return ordered.filter((element) => {
      let parent = element.parentElement;
      while (parent) {
        if (candidateSet.has(parent)) return false;
        parent = parent.parentElement;
      }
      return true;
    });
  }

  function getActiveTurnSelectors() {
    const selectorGroups = currentPlatform.turnSelectorGroups;
    if (!Array.isArray(selectorGroups)) {
      return currentPlatform.turnSelectors;
    }

    if (activeTurnSelectorGroup) {
      return activeTurnSelectorGroup;
    }

    for (const selectorGroup of selectorGroups) {
      if (selectorGroup.some((selector) => document.querySelector(selector))) {
        activeTurnSelectorGroup = selectorGroup;
        return activeTurnSelectorGroup;
      }
    }

    return currentPlatform.turnSelectors;
  }

  function invalidateActiveTurnSelectorGroup() {
    activeTurnSelectorGroup = null;
  }

  function isRenderedChatGPTElement(element) {
    if (
      !(element instanceof HTMLElement) ||
      !element.isConnected ||
      element.closest('[hidden], [aria-hidden="true"], [inert]')
    ) {
      return false;
    }

    const cachedResult = renderedCheckCache.get(element);
    if (cachedResult !== undefined) return cachedResult;

    const computedStyle = window.getComputedStyle(element);
    const isRendered =
      computedStyle.display !== "none" &&
      computedStyle.visibility !== "hidden" &&
      computedStyle.visibility !== "collapse" &&
      element.getClientRects().length > 0;
    /* One layout truth per update pass keeps streaming off the layout path. */
    renderedCheckCache.set(element, isRendered);
    return isRendered;
  }

  function selectChatGPTRootWithMostTurns(roots, turnSelector) {
    let selectedRoot = null;
    let largestTurnCount = -1;

    for (const candidateRoot of roots) {
      const turnCount = Array.from(
        candidateRoot.querySelectorAll(turnSelector),
      ).filter(
        (turnElement) =>
          turnElement.closest("[data-turn-key]") === turnElement &&
          isRenderedChatGPTElement(turnElement),
      ).length;

      if (turnCount >= largestTurnCount) {
        selectedRoot = candidateRoot;
        largestTurnCount = turnCount;
      }
    }

    return selectedRoot;
  }

  function collectChatGPTShellMessages(conversationRoot) {
    const messageNodes = [];
    const seenTurnRoles = new Set();
    const turnContainers = Array.from(
      conversationRoot.querySelectorAll("[data-turn-key]"),
    ).filter(
      (turnContainer) =>
        turnContainer.closest("[data-turn-key]") === turnContainer &&
        isRenderedChatGPTElement(turnContainer),
    );

    const roleSelectors = [
      {
        role: "user",
        selectors: [
          '[data-content-search-unit-key$=":user"]',
          '[data-user-message-bubble="true"]',
          '[data-message-role="user"]',
          '[data-conversation-role="user"]',
        ],
      },
      {
        role: "assistant",
        selectors: [
          '[data-content-search-unit-key$=":assistant"]',
          '[data-message-role="assistant"]',
          '[data-conversation-role="assistant"]',
          "[data-chatgpt-agent-turn-start]",
        ],
      },
    ];

    for (const turnContainer of turnContainers) {
      const turnKey = (
        turnContainer.getAttribute("data-turn-key") ||
        turnContainer.getAttribute("data-turn-id") ||
        turnContainer.id ||
        ""
      ).trim();
      if (!turnKey) continue;

      for (const roleConfig of roleSelectors) {
        const roleIdentity = `${turnKey}:${roleConfig.role}`;
        if (seenTurnRoles.has(roleIdentity)) continue;

        let roleElement = null;
        for (const selector of roleConfig.selectors) {
          roleElement = Array.from(
            turnContainer.querySelectorAll(selector),
          ).find(
            (candidateElement) =>
              candidateElement.closest("[data-turn-key]") === turnContainer &&
              isRenderedChatGPTElement(candidateElement),
          );
          if (roleElement) break;
        }

        if (!roleElement) continue;
        seenTurnRoles.add(roleIdentity);
        messageNodes.push(roleElement);
      }
    }

    return filterOutNested(uniqueDomOrdered(messageNodes)).filter(
      (element) =>
        !isGeminiThoughtElement(element) && !matchesReasoningElement(element),
    );
  }

  function getCurrentChatGPTTurns() {
    if (currentPlatform.name !== "ChatGPT") return null;

    const shellRoots = Array.from(
      document.querySelectorAll(CHATGPT_SHELL_ROOT_SELECTOR),
    ).filter(isRenderedChatGPTElement);

    if (shellRoots.length) {
      const activeShellRoot = selectChatGPTRootWithMostTurns(
        shellRoots,
        "[data-turn-key]",
      );
      // A recognized but empty shell is authoritative; do not count a kept or hidden chat.
      return activeShellRoot
        ? collectChatGPTShellMessages(activeShellRoot)
        : [];
    }

    const transcriptRoots = Array.from(
      document.querySelectorAll(CHATGPT_TRANSCRIPT_ROOT_SELECTOR),
    ).filter(isRenderedChatGPTElement);

    if (transcriptRoots.length) {
      let activeTranscriptRoot = transcriptRoots[0];
      let largestMessageCount = -1;

      for (const candidateRoot of transcriptRoots) {
        const messageCount = Array.from(
          candidateRoot.querySelectorAll(":scope > li[data-message-role]"),
        ).filter(isRenderedChatGPTElement).length;

        if (messageCount >= largestMessageCount) {
          activeTranscriptRoot = candidateRoot;
          largestMessageCount = messageCount;
        }
      }

      return Array.from(
        activeTranscriptRoot.querySelectorAll(":scope > li[data-message-role]"),
      ).filter(isRenderedChatGPTElement);
    }

    return null;
  }

  function getTurns() {
    const currentChatGPTTurns = getCurrentChatGPTTurns();
    if (currentChatGPTTurns !== null) return currentChatGPTTurns;

    const collected = [];
    for (const selector of getActiveTurnSelectors()) {
      document
        .querySelectorAll(selector)
        .forEach((elem) => collected.push(elem));
    }

    const unnested = filterOutNested(collected);
    return unnested.filter(
      (element) =>
        (currentPlatform.name !== "ChatGPT" ||
          isRenderedChatGPTElement(element)) &&
        !isGeminiThoughtElement(element) &&
        !matchesReasoningElement(element),
    );
  }

  function findContentElement(turnElement) {
    const selectorGroups = [];
    if (
      isUserTurn(turnElement) &&
      Array.isArray(currentPlatform.userContentSelectors)
    ) {
      selectorGroups.push(currentPlatform.userContentSelectors);
    }
    selectorGroups.push(currentPlatform.contentSelectors || []);

    for (const selectorGroup of selectorGroups) {
      for (const selector of selectorGroup) {
        const match = turnElement.matches(selector)
          ? turnElement
          : turnElement.querySelector(selector);
        if (match && !isGeminiThoughtElement(match)) return match;
      }
    }
    return turnElement;
  }

  // 从完整消息容器中提取文本；不再只取第一个 Markdown 子节点或截断到 800 字符。
  function extractTurnText(turnElement) {
    let raw = elementToPlainText(turnElement);
    const vfIdx = raw.indexOf(VF_TOKEN_START);
    if (vfIdx !== -1) {
      let userPart = raw
        .slice(0, vfIdx)
        .replace(/```[a-z]*\s*$/i, "")
        .trim();
      if (
        userPart === "请查阅并分析以下文本内容：" ||
        userPart === "请查阅以下文本："
      ) {
        userPart = "";
      }
      const match = raw.match(VF_REGEX);
      const fileName = match ? ` [📎 ${match[1]}]` : " [📎 附件文件]";
      raw = (userPart || "附件文本") + fileName;
    }
    return normalizeText(raw);
  }

  function mountVirtualFileCapsuleOutsideTurn(turnElement, pill) {
    if (!(turnElement instanceof Element) || !pill) {
      return null;
    }

    const parent = turnElement.parentElement;

    if (!parent) {
      return null;
    }

    const previousRow = virtualFileChatRows.get(turnElement);

    if (previousRow?.isConnected) {
      previousRow.remove();
    }

    const row = el(
      "div",
      {
        className: "ai-turbo-chat-file-row",
        role: "group",
        "aria-label": "虚拟文件",
      },
      [pill],
    );

    /*
     * 关键：
     * 不再把 pill 插入 bubble 内部。
     * 而是把它作为 turnElement 的同级节点，
     * 并放在消息气泡之前。
     */
    parent.insertBefore(row, turnElement);

    virtualFileChatRows.set(turnElement, row);

    return row;
  }

  // 修复问题(2)：保留并醒目呈现用户原本的提问文本，将大文件精准收纳为小胶囊
  function collapseInChatFileBlocks(turnElement) {
    if (!state.virtualFileEnabled || !turnElement || !isUserTurn(turnElement)) {
      return;
    }

    const existingRow = virtualFileChatRows.get(turnElement);

    if (processedUserTurns.has(turnElement) && existingRow?.isConnected) {
      return;
    }

    /*
     * 宿主网站 SPA 重绘后，原来的外置节点可能已经被移除。
     * 这种情况下允许重新挂载。
     */
    if (!existingRow?.isConnected) {
      processedUserTurns.delete(turnElement);
      virtualFileChatRows.delete(turnElement);
    }

    const walker = document.createTreeWalker(
      turnElement,
      NodeFilter.SHOW_TEXT,
      null,
      false,
    );

    let targetTextNode = null;
    while (walker.nextNode()) {
      if (
        walker.currentNode.nodeValue &&
        walker.currentNode.nodeValue.includes(VF_TOKEN_START)
      ) {
        targetTextNode = walker.currentNode;
        break;
      }
    }

    if (!targetTextNode) return;

    const codeBlockElem =
      targetTextNode.parentElement?.closest("pre, code-block");

    // 智能定位待折叠宿主元素
    let containerBlock = codeBlockElem;
    if (!containerBlock) {
      let cur = targetTextNode.parentElement;
      while (cur && cur !== turnElement) {
        const tag = cur.tagName.toLowerCase();
        if (
          ["p", "div", "pre", "code-block"].includes(tag) ||
          cur.classList.contains("query-text") ||
          cur.classList.contains("user-query-text")
        ) {
          containerBlock = cur;
          break;
        }
        cur = cur.parentElement;
      }
    }
    if (!containerBlock) containerBlock = targetTextNode.parentElement;

    const fullRawText = containerBlock.textContent || "";
    const startIndex = fullRawText.indexOf(VF_TOKEN_START);
    if (startIndex === -1) return;

    const match = fullRawText.match(VF_REGEX);
    if (!match) return;

    const fileName = match[1].trim();
    const lineCount = parseInt(match[2], 10) || 0;
    const sizeBytes = parseInt(match[3], 10) || 0;
    const kbSize = (sizeBytes / 1024).toFixed(1);
    const metaInfo = `${lineCount.toLocaleString()} 行 · ${kbSize} KB`;

    // 提取用户真实提问 Prompt
    let userPrompt = fullRawText.slice(0, startIndex);
    userPrompt = userPrompt.replace(/```[a-z]*\s*$/i, "").trim();
    if (
      userPrompt === "请查阅并分析以下文本内容：" ||
      userPrompt === "请查阅以下文本："
    ) {
      userPrompt = "";
    }

    // 检查是否有前序兄弟节点已经独立呈现了该提问
    let promptAlreadyVisible = false;
    let prev = containerBlock.previousElementSibling;
    while (prev) {
      if (prev.textContent && prev.textContent.trim().length > 0) {
        promptAlreadyVisible = true;
        break;
      }
      prev = prev.previousElementSibling;
    }

    withSelfMutation(() => {
      let isExpanded = false;
      const toggleBtn = el(
        "button",
        {
          type: "button",
          style:
            "background:rgba(255,255,255,0.08);border:1px solid rgba(148,163,184,0.25);color:#cbd5e1;padding:3px 12px;border-radius:999px;font:11px sans-serif;cursor:pointer;margin-left:auto;transition:all 0.15s ease;",
        },
        ["展开查看文本"],
      );

      const pill = el(
        "div",
        {
          className: "ai-turbo-chat-capsule",
          style:
            "display:inline-flex;align-items:center;gap:8px;padding:6px 14px;background:rgba(18,24,38,0.95);border:1px solid rgba(52,211,153,0.45);border-radius:9999px;box-shadow:0 2px 10px rgba(0,0,0,0.3);user-select:none;max-width:100%;box-sizing:border-box;margin:6px 0 10px;",
        },
        [
          el("span", { style: "font-size:14px;line-height:1;" }, ["📄"]),
          el(
            "span",
            {
              style:
                "font:600 12px ui-monospace,monospace;color:#f1f5f9;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
            },
            [fileName],
          ),
          el(
            "span",
            {
              style:
                "font:10px ui-monospace;background:rgba(52,211,153,0.15);color:#34d399;padding:2px 6px;border-radius:4px;",
            },
            [metaInfo],
          ),
          toggleBtn,
        ],
      );

      // 将原大文本容器隔离脱水
      containerBlock.classList.add("ai-turbo-chat-folded-target");
      containerBlock.style.setProperty("display", "none", "important");
      containerBlock.style.setProperty("contain", "strict", "important");

      toggleBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        isExpanded = !isExpanded;
        toggleBtn.textContent = isExpanded ? "收起文本" : "展开查看文本";
        if (isExpanded) {
          containerBlock.style.setProperty("display", "block", "important");
          containerBlock.style.setProperty("max-height", "320px", "important");
          containerBlock.style.setProperty("overflow", "auto", "important");
        } else {
          containerBlock.style.setProperty("display", "none", "important");
        }
      });

      // 若原容器内包含用户提问且无前序元素展示，独立保留用户真实提问
      if (!promptAlreadyVisible && userPrompt) {
        const promptElem = el(
          "div",
          {
            className: "ai-turbo-chat-user-prompt",
            style:
              "margin-bottom:8px!important;white-space:pre-wrap!important;word-break:break-word!important;font:inherit!important;color:inherit!important;line-height:1.5!important;",
          },
          [userPrompt],
        );

        containerBlock.insertAdjacentElement("beforebegin", promptElem);
      }
    });

    const mountedRow = mountVirtualFileCapsuleOutsideTurn(turnElement, pill);

    if (mountedRow) {
      processedUserTurns.add(turnElement);
    }
  }

  // 读写分离脱水，彻底杜绝 Layout Thrashing
  function syncTurnIndex(forceFull) {
    const turns = getTurns();
    const structuralChange =
      forceFull ||
      turns.length !== previousTurns.length ||
      turns.some((turnElement, index) => turnElement !== previousTurns[index]);

    if (forceFull) {
      turnIndex.clear();
    } else if (structuralChange) {
      /*
       * A new turn only appends: keep the text of every surviving turn and
       * re-extract new or dirty ones, so one message costs O(1) not O(n).
       * shortcut: a text edit the observer never reports stays stale, upgrade
       * to a periodic full re-sync if a platform does that.
       */
      const liveTurns = new Set(turns);
      for (const indexedTurn of [...turnIndex.keys()]) {
        if (!liveTurns.has(indexedTurn)) turnIndex.delete(indexedTurn);
      }
    }

    for (const turnElement of turns) {
      collapseInChatFileBlocks(turnElement);
      const record = turnIndex.get(turnElement);
      if (!record) {
        turnIndex.set(turnElement, {
          id: turnIndex.size,
          element: turnElement,
          text: extractTurnText(turnElement),
        });
      } else if (dirtyTurns.has(turnElement)) {
        record.text = extractTurnText(turnElement);
      }
    }

    for (const turnElement of dirtyTurns) {
      if (!turnIndex.has(turnElement)) {
        fullTurnSyncRequested = true;
      }
    }

    state.totalTurns = turns.length;
    state.indexedTurns = turns.map((turnElement, index) => {
      const record = turnIndex.get(turnElement);
      if (record) {
        record.id = index;
        return record;
      }
      const fallbackRecord = {
        id: index,
        element: turnElement,
        text: extractTurnText(turnElement),
      };
      turnIndex.set(turnElement, fallbackRecord);
      return fallbackRecord;
    });

    const cutoff = state.pruneEnabled
      ? Math.max(0, turns.length - state.keepTurns)
      : 0;

    const toDehydrate = [];
    const toHydrate = [];

    turns.forEach((turnElement, index) => {
      const shouldDehydrate =
        state.pruneEnabled && index < cutoff && !restoredTurns.has(turnElement);
      const isDehydrated = turnElement.classList.contains(
        "ai-turbo-dehydrated",
      );

      if (shouldDehydrate && !isDehydrated) {
        toDehydrate.push({
          elem: turnElement,
          height: turnElement.offsetHeight || 120,
        });
      } else if (!shouldDehydrate && isDehydrated) {
        toHydrate.push(turnElement);
      }
    });

    withSelfMutation(() => {
      for (let i = 0; i < toDehydrate.length; i++) {
        const item = toDehydrate[i];
        item.elem.style.setProperty("--turbo-cached-h", `${item.height}px`);
        item.elem.classList.add("ai-turbo-dehydrated");
      }
      for (let i = 0; i < toHydrate.length; i++) {
        toHydrate[i].classList.remove("ai-turbo-dehydrated");
        toHydrate[i].style.removeProperty("--turbo-cached-h");
      }
    });

    state.hiddenCount = turns.reduce(
      (count, turnElement) =>
        count + Number(turnElement.classList.contains("ai-turbo-dehydrated")),
      0,
    );
    previousTurns = turns;
    dirtyTurns.clear();
    fullTurnSyncRequested = false;
  }

  function normalizeCodeElement(candidate) {
    if (!(candidate instanceof HTMLElement)) return null;
    const geminiBlock = candidate.closest("code-block");
    if (geminiBlock instanceof HTMLElement) return geminiBlock;
    if (candidate.matches("code")) {
      return candidate.parentElement?.matches("pre")
        ? candidate.parentElement
        : candidate;
    }
    return candidate;
  }

  function getCodeBlocks(rootNode = document) {
    const collected = [];
    const selectors = currentPlatform.codeSelectors || ["pre"];

    for (const selector of selectors) {
      rootNode.querySelectorAll(selector).forEach((candidate) => {
        const belongsToUserTurn = (
          currentPlatform.userTurnSelectors || []
        ).some((selector) => {
          try {
            return (
              candidate.matches(selector) ||
              Boolean(candidate.closest(selector))
            );
          } catch (_) {
            return false;
          }
        });

        if (
          candidate.classList.contains("ai-turbo-chat-folded-target") ||
          belongsToUserTurn ||
          candidate.closest(
            ".ai-turbo-chat-folded-target, .ai-turbo-chat-capsule, user-query, [data-message-author-role='user'], [data-content-search-unit-key$=':user'], [data-user-message-bubble='true'], [data-testid='collapsible-user-message-root'], .font-user-message",
          )
        ) {
          return;
        }
        const codeElement = normalizeCodeElement(candidate);
        if (!codeElement) return;
        if (isGeminiThoughtElement(codeElement)) return;
        collected.push(codeElement);
      });
    }

    return filterOutNested(collected);
  }

  function getCodeText(codeElement) {
    const sourceElement =
      codeElement.querySelector("pre code") ||
      codeElement.querySelector("pre") ||
      codeElement.querySelector("code") ||
      codeElement;
    return typeof sourceElement.textContent === "string"
      ? sourceElement.textContent
      : "";
  }

  function getCodeLanguage(codeElement) {
    const langElem = codeElement.querySelector(
      'code[class*="language-"], [class*="language-"]',
    );
    if (langElem) {
      const match = String(langElem.className || "").match(
        /language-([a-z0-9+#.-]+)/i,
      );
      if (match) return match[1].toUpperCase();
    }
    const decElem = codeElement.querySelector(
      ".code-block-decoration, [data-testid*='language']",
    );
    const decText = decElem?.textContent?.trim();
    if (decText && decText.length < 24) return decText.toUpperCase();

    const attrLang =
      codeElement.getAttribute("data-language") ||
      codeElement.getAttribute("lang");
    if (attrLang) return attrLang.toUpperCase();

    return "代码";
  }

  function getCodeElementHeight(codeElement) {
    const pre = codeElement.querySelector("pre");
    return Math.max(
      codeElement.scrollHeight || 0,
      codeElement.offsetHeight || 0,
      pre?.scrollHeight || 0,
      pre?.offsetHeight || 0,
    );
  }

  function applyFoldStyles(entry, codeElement) {
    withSelfMutation(() => {
      if (entry.expanded) {
        codeElement.classList.remove("ai-turbo-folded");
        codeElement.classList.add("ai-turbo-expanded");
        codeElement.style.removeProperty("max-height");
        codeElement.style.removeProperty("overflow");
      } else {
        codeElement.classList.remove("ai-turbo-expanded");
        codeElement.classList.add("ai-turbo-folded");
        codeElement.style.setProperty("display", "block", "important");
        codeElement.style.setProperty(
          "max-height",
          `${CODE_PREVIEW_HEIGHT}px`,
          "important",
        );
        codeElement.style.setProperty("overflow", "hidden", "important");
      }
    });
  }

  function updateCodeMeta(entry, codeElement) {
    if (!entry || !codeElement?.isConnected) return;

    /* An already rendered, unchanged block has nothing new to show. */
    if (
      entry.renderedStaticOnce &&
      !entry.isDisplayingStreaming &&
      !dirtyCodeBlocks.has(codeElement)
    ) {
      return;
    }

    const currentText = getCodeText(codeElement);
    const currentLen = currentText.length;
    const now = Date.now();

    if (currentLen !== entry.lastLength) {
      entry.lastLength = currentLen;
      entry.lastMutationTime = now;
      entry.renderedStaticOnce = false;
    }

    const isActivelyStreaming =
      entry.lastMutationTime > 0 &&
      now - entry.lastMutationTime < STREAMING_IDLE_DELAY;

    if (isActivelyStreaming) {
      if (!entry.isDisplayingStreaming) {
        entry.isDisplayingStreaming = true;
        entry.langLabel.textContent = getCodeLanguage(codeElement);
        entry.linesLabel.textContent = "";
        entry.linesLabel.appendChild(
          el("span", { className: "ai-turbo-streaming-badge" }, [
            "● 正在输出...",
          ]),
        );
        entry.toggleButton.textContent = entry.expanded
          ? "收起代码"
          : "展开代码";
      }

      if (entry.streamingTimer) clearTimeout(entry.streamingTimer);
      entry.streamingTimer = setTimeout(() => {
        updateCodeMeta(entry, codeElement);
      }, STREAMING_IDLE_DELAY + 50);
      return;
    }

    entry.isDisplayingStreaming = false;
    entry.renderedStaticOnce = true;

    const lineCount = fastCountLines(currentText);
    entry.langLabel.textContent = getCodeLanguage(codeElement);
    entry.linesLabel.textContent = lineCount
      ? `${lineCount.toLocaleString()} 行`
      : "";
    entry.toggleButton.textContent = entry.expanded
      ? "收起代码"
      : `展开 ${lineCount ? `${lineCount.toLocaleString()} 行` : "代码"}`;
    entry.toggleButton.setAttribute("aria-expanded", String(entry.expanded));
  }

  function unmountCodeControls(codeElement) {
    const entry = codeState.get(codeElement);
    if (!entry) return;
    if (entry.streamingTimer) clearTimeout(entry.streamingTimer);
    withSelfMutation(() => {
      entry.bar?.remove();
      codeElement.classList.remove(
        "ai-turbo-code-target",
        "ai-turbo-folded",
        "ai-turbo-expanded",
      );
      codeElement.style.removeProperty("max-height");
      codeElement.style.removeProperty("overflow");
      codeElement.style.removeProperty("display");
    });
    codeState.delete(codeElement);
  }

  function isNativeCodeHeaderNode(node) {
    if (!(node instanceof HTMLElement)) return false;

    try {
      if (
        node.matches(CHATGPT_CODE_HEADER_MARKER_SELECTOR) ||
        node.querySelector(CHATGPT_CODE_HEADER_MARKER_SELECTOR)
      ) {
        return true;
      }
    } catch (_) {
      return false;
    }

    const className = typeof node.className === "string" ? node.className : "";
    const markerText = [
      className,
      node.getAttribute("data-testid") || "",
      node.getAttribute("aria-label") || "",
      node.getAttribute("title") || "",
    ].join(" ");

    if (
      /(?:code|language).*(?:header|toolbar|decoration)|(?:header|toolbar).*(?:code|language)/i.test(
        markerText,
      )
    ) {
      return true;
    }

    // Some native headers expose the language name and an icon-only copy
    // button instead of an accessible "Copy code" label.
    if (node.querySelector("button") && !node.querySelector("pre, code")) {
      const headerText = (node.textContent || "").trim();
      if (
        headerText.length > 0 &&
        headerText.length <= 64 &&
        (/^(?:[a-z0-9_+#.-]+)$/i.test(headerText) ||
          /copy|复制|运行代码|code block/i.test(headerText))
      ) {
        return true;
      }
    }

    return false;
  }

  function getChatGPTCodeCardAnchor(codeElement) {
    let branch = codeElement;
    let parent = codeElement.parentElement;
    let classBasedFallback = null;
    let depth = 0;

    while (
      parent instanceof HTMLElement &&
      depth < CHATGPT_CODE_CARD_MAX_ANCESTORS
    ) {
      // Never treat an entire assistant turn or transcript slot as a code
      // card. Only inspect ancestors below that boundary.
      if (parent.matches(CHATGPT_CODE_CARD_BOUNDARY_SELECTOR)) break;

      let precedingSibling = branch.previousElementSibling;
      while (precedingSibling) {
        if (isNativeCodeHeaderNode(precedingSibling)) {
          return parent.contains(codeElement) ? parent : null;
        }
        precedingSibling = precedingSibling.previousElementSibling;
      }

      const className =
        typeof parent.className === "string" ? parent.className : "";
      const cardMarker = [
        className,
        parent.getAttribute("data-testid") || "",
        parent.getAttribute("data-role") || "",
      ].join(" ");

      if (
        /(?:code[-_ ]?(?:block|card|container)|(?:block|card)[-_ ]?code|group\/code)/i.test(
          cardMarker,
        )
      ) {
        classBasedFallback = parent;
      }

      branch = parent;
      parent = parent.parentElement;
      depth++;
    }

    // If header controls cannot be recognized, only use an explicitly named
    // code-card wrapper. Otherwise leave this native code block untouched.
    return classBasedFallback instanceof HTMLElement &&
      classBasedFallback.isConnected &&
      classBasedFallback.contains(codeElement)
      ? classBasedFallback
      : null;
  }

  function getCodeControlAnchor(codeElement) {
    if (currentPlatform !== PLATFORMS.chatgpt) return codeElement;
    return getChatGPTCodeCardAnchor(codeElement);
  }

  function positionCodeControl(entry, codeElement) {
    const anchor = getCodeControlAnchor(codeElement);
    if (!(anchor instanceof HTMLElement) || anchor === codeElement) {
      // Fail closed: remove our fold state and reveal the original code if the
      // current ChatGPT DOM no longer exposes a safe outer-card anchor.
      unmountCodeControls(codeElement);
      return false;
    }

    if (
      entry.anchor === anchor &&
      entry.bar.isConnected &&
      entry.bar.nextElementSibling === anchor
    ) {
      return true;
    }

    withSelfMutation(() => {
      entry.bar.remove();
      anchor.insertAdjacentElement("beforebegin", entry.bar);
      entry.anchor = anchor;
    });
    return true;
  }

  function flashCopyState(button, label) {
    button.textContent = label;
    window.setTimeout(() => {
      if (button.isConnected) button.textContent = "复制";
    }, 1200);
  }

  function copyCodeText(button, codeElement) {
    const text = getCodeText(codeElement);
    if (!navigator.clipboard?.writeText) {
      flashCopyState(button, "不可用");
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => flashCopyState(button, "已复制"),
      () => flashCopyState(button, "复制失败"),
    );
  }

  function mountCodeControls(codeElement) {
    if (
      !state.collapseCode ||
      !codeElement.isConnected ||
      codeState.has(codeElement)
    )
      return;
    if (codeElement.parentElement?.closest(".ai-turbo-code-target")) return;

    const measuredH = getCodeElementHeight(codeElement);
    if (measuredH <= CODE_COLLAPSE_HEIGHT) return;

    const anchor = getCodeControlAnchor(codeElement);
    if (
      currentPlatform === PLATFORMS.chatgpt &&
      (!(anchor instanceof HTMLElement) || anchor === codeElement)
    ) {
      return;
    }

    let sibling = codeElement.previousElementSibling;
    while (sibling && sibling.classList.contains("ai-turbo-code-bar")) {
      const toRemove = sibling;
      sibling = sibling.previousElementSibling;
      toRemove.remove();
    }

    const initialText = getCodeText(codeElement);

    const langLabel = el("span", { className: "ai-turbo-code-lang" });
    const linesLabel = el("span", { className: "ai-turbo-code-lines" });
    const metaWrap = el("div", { className: "ai-turbo-code-bar-meta" }, [
      langLabel,
      linesLabel,
    ]);

    const toggleButton = el("button", {
      type: "button",
      className: "ai-turbo-code-toggle",
      "aria-expanded": "false",
    });

    const copyButton = el("button", {
      type: "button",
      className: "ai-turbo-code-copy",
      "aria-label": "复制整段代码",
    });
    copyButton.textContent = "复制";
    copyButton.addEventListener("click", () => {
      copyCodeText(copyButton, codeElement);
    });

    const actionsWrap = el("div", { className: "ai-turbo-code-bar-actions" }, [
      copyButton,
      toggleButton,
    ]);

    const bar = el(
      "div",
      {
        className:
          currentPlatform === PLATFORMS.chatgpt
            ? "ai-turbo-code-bar ai-turbo-code-bar-chatgpt"
            : "ai-turbo-code-bar",
      },
      [metaWrap, actionsWrap],
    );

    const entry = {
      bar,
      anchor,
      langLabel,
      linesLabel,
      toggleButton,
      expanded: false,
      lastLength: initialText.length,
      lastMutationTime: 0,
      streamingTimer: null,
      isDisplayingStreaming: false,
      renderedStaticOnce: false,
    };

    codeState.set(codeElement, entry);

    withSelfMutation(() => {
      codeElement.classList.add("ai-turbo-code-target");
      anchor.insertAdjacentElement("beforebegin", bar);
    });

    toggleButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      entry.expanded = !entry.expanded;
      applyFoldStyles(entry, codeElement);
      entry.renderedStaticOnce = false;
      updateCodeMeta(entry, codeElement);

      if (!entry.expanded) {
        bar.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    });

    applyFoldStyles(entry, codeElement);
    updateCodeMeta(entry, codeElement);
  }

  function sweepOrphanBars() {
    const activeBars = new Set(
      Array.from(codeState.values(), (entry) => entry.bar),
    );

    document.querySelectorAll(".ai-turbo-code-bar").forEach((bar) => {
      if (!activeBars.has(bar)) {
        bar.remove();
        return;
      }

      if (bar.classList.contains("ai-turbo-code-bar-chatgpt")) return;

      const next = bar.nextElementSibling;
      if (!next || !codeState.has(next) || codeState.get(next).bar !== bar) {
        bar.remove();
      }
    });
  }

  function syncCodeBlocks(forceScan, dirtyCandidates) {
    if (!state.collapseCode) {
      for (const [codeElement] of codeState) {
        unmountCodeControls(codeElement);
      }
      state.foldedCodeCount = 0;
      codeScanRequested = false;
      dirtyCodeBlocks.clear();
      sweepOrphanBars();
      return;
    }

    for (const [codeElement] of codeState) {
      if (!codeElement.isConnected) {
        unmountCodeControls(codeElement);
      }
    }

    const rawCandidates = forceScan
      ? getCodeBlocks()
      : Array.from(dirtyCandidates)
          .map(normalizeCodeElement)
          .filter((elem) => elem instanceof HTMLElement && elem.isConnected);

    const candidates = filterOutNested(rawCandidates);

    for (const codeElement of candidates) {
      const entry = codeState.get(codeElement);
      if (entry) {
        if (
          currentPlatform === PLATFORMS.chatgpt &&
          !positionCodeControl(entry, codeElement)
        ) {
          continue;
        }
        updateCodeMeta(entry, codeElement);
      } else {
        mountCodeControls(codeElement);
      }

      if (codeResizeObserver) {
        codeResizeObserver.observe(codeElement);
      }
    }

    sweepOrphanBars();

    state.foldedCodeCount = Array.from(codeState.values()).filter(
      (entry) => !entry.expanded,
    ).length;
    codeScanRequested = false;
    dirtyCodeBlocks.clear();
  }

  function getChatInput() {
    const selectors = [
      ...(currentPlatform.inputSelectors || []),
      'form[data-chatgpt-composer] [contenteditable="true"][role="textbox"]',
      'div.ProseMirror[contenteditable="true"][role="textbox"]',
      "rich-textarea div[contenteditable='true']",
      'div[contenteditable="true"][role="textbox"]',
      "textarea",
      '[contenteditable="true"]',
    ];

    for (const selector of [...new Set(selectors)]) {
      const candidates = document.querySelectorAll(selector);
      for (const candidate of candidates) {
        if (
          !(candidate instanceof HTMLElement) ||
          !candidate.isConnected ||
          candidate.closest("#" + HUD_ID) ||
          (candidate.offsetParent === null &&
            candidate.getClientRects().length === 0)
        ) {
          continue;
        }
        if (
          candidate.matches(
            'input[type="hidden"], textarea[aria-hidden="true"]',
          ) ||
          candidate.getAttribute("aria-hidden") === "true"
        ) {
          continue;
        }
        return candidate;
      }
    }

    return null;
  }

  function isSendControlForInput(sendControl, inputElement) {
    if (
      !(sendControl instanceof HTMLElement) ||
      !(inputElement instanceof HTMLElement)
    ) {
      return false;
    }

    const inputForm = inputElement.closest("form");
    const sendForm = sendControl.closest("form");
    if (inputForm && sendForm) {
      return inputForm === sendForm;
    }

    const composerSelectors = [
      "[data-chatgpt-composer]",
      ".input-area",
      ".input-area-container",
      "rich-textarea",
      "[class*='composer-parent']",
      "[class*='input-area']",
      "[class*='composer']",
      "[class*='input-container']",
      "fieldset",
    ];

    const sharesComposerContainer = composerSelectors.some((selector) => {
      const inputContainer = inputElement.closest(selector);
      return Boolean(
        inputContainer && inputContainer === sendControl.closest(selector),
      );
    });
    if (sharesComposerContainer) return true;

    // Some platforms render the input and send control as siblings without a
    // shared form or a consistently named composer wrapper.
    let ancestor = inputElement.parentElement;
    let depth = 0;
    while (ancestor && depth < 5 && ancestor !== document.body) {
      if (ancestor.contains(sendControl)) return true;
      ancestor = ancestor.parentElement;
      depth++;
    }

    return false;
  }

  function isSendLikeButton(btn) {
    if (!(btn instanceof HTMLElement) || btn.tagName !== "BUTTON") return false;
    const label = [
      btn.getAttribute("aria-label") || "",
      btn.getAttribute("title") || "",
      btn.getAttribute("data-testid") || "",
      btn.getAttribute("data-tooltip") || "",
    ]
      .join(" ")
      .toLowerCase();
    // 排除停止/取消类按钮（ChatGPT 生成中会替换发送按钮为"Stop streaming"）
    if (/\bstop\b|停止|cancel|abort|中止|取消/.test(label)) return false;
    return /send|submit|发送|提交|prompt|ask/.test(label);
  }

  function isButtonUsable(btn) {
    if (!(btn instanceof HTMLElement) || !btn.isConnected) return false;
    if (
      btn.closest(`#${HUD_ID}, #ai-turbo-vf-tray, #ai-turbo-vf-preview-modal`)
    )
      return false;
    const style = window.getComputedStyle(btn);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return btn.getClientRects().length > 0;
  }

  function isButtonDisabled(btn) {
    if (!(btn instanceof HTMLElement)) return true;
    if (btn.hasAttribute("disabled")) return true;
    if (btn.disabled === true) return true;
    if (btn.getAttribute("aria-disabled") === "true") return true;
    return false;
  }

  /**
   * 集中查找发送按钮。
   * 1) 平台选择器
   * 2) input 所在 form 内的 submit / send-like
   * 3) input 的 composer 容器内的 send-like
   * 4) 从 input 向上 8 层内的 send-like
   */
  function findSendControl(inputElement, { allowDisabled = false } = {}) {
    if (!inputElement) return null;

    const usable = (btn) =>
      isButtonUsable(btn) && (allowDisabled || !isButtonDisabled(btn));

    // 1) 平台选择器
    for (const sel of currentPlatform.sendButtonSelectors || []) {
      let matches;
      try {
        matches = document.querySelectorAll(sel);
      } catch (_) {
        continue;
      }
      for (const btn of matches) {
        if (usable(btn) && isSendControlForInput(btn, inputElement)) {
          return btn;
        }
      }
    }

    // 2) input 所在 form
    const form = inputElement.closest("form");
    if (form) {
      for (const btn of form.querySelectorAll(
        'button[type="submit"], button:not([type="button"]):not([type="reset"])',
      )) {
        if (usable(btn) && isSendLikeButton(btn)) return btn;
      }
      for (const btn of form.querySelectorAll("button")) {
        if (usable(btn) && isSendLikeButton(btn)) return btn;
      }
    }

    // 3) composer 容器
    const composerSelectors = [
      "[data-chatgpt-composer]",
      ".input-area-container",
      "[class*='composer']",
      "[class*='input-area']",
      "[class*='input-container']",
      "[class*='query-bar']",
      "rich-textarea",
      "fieldset",
    ];
    for (const sel of composerSelectors) {
      let container;
      try {
        container = inputElement.closest(sel);
      } catch (_) {}
      if (!container) continue;
      for (const btn of container.querySelectorAll("button")) {
        if (usable(btn) && isSendLikeButton(btn)) return btn;
      }
    }

    // 4) 从 input 向上 8 层找
    let ancestor = inputElement.parentElement;
    let depth = 0;
    while (
      ancestor &&
      depth < 8 &&
      ancestor !== document.body &&
      ancestor !== document.documentElement
    ) {
      for (const btn of ancestor.querySelectorAll("button")) {
        if (usable(btn) && isSendLikeButton(btn)) return btn;
      }
      ancestor = ancestor.parentElement;
      depth++;
    }

    return null;
  }

  /** 完整模拟 pointer + mouse 序列，兼容 React onPointerDown / onMouseDown */
  function triggerSendButton(btn) {
    if (!(btn instanceof HTMLElement)) return false;
    try {
      btn.focus({ preventScroll: true });
    } catch (_) {}

    const opts = {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
    };
    try {
      btn.dispatchEvent(
        new PointerEvent("pointerdown", {
          ...opts,
          buttons: 1,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
        }),
      );
    } catch (_) {}
    try {
      btn.dispatchEvent(new MouseEvent("mousedown", { ...opts, buttons: 1 }));
    } catch (_) {}
    try {
      btn.dispatchEvent(
        new PointerEvent("pointerup", {
          ...opts,
          buttons: 0,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
        }),
      );
    } catch (_) {}
    try {
      btn.dispatchEvent(new MouseEvent("mouseup", { ...opts, buttons: 0 }));
    } catch (_) {}
    try {
      btn.click();
    } catch (_) {
      return false;
    }
    return true;
  }

  /** 兜底：键盘 Enter + form.requestSubmit */
  function fallbackKeyboardSubmit(inputElement) {
    if (!inputElement) return false;
    try {
      inputElement.focus({ preventScroll: true });
    } catch (_) {}

    const form = inputElement.closest("form");
    if (form && typeof form.requestSubmit === "function") {
      try {
        form.requestSubmit();
        return true;
      } catch (_) {}
    }

    const enterOpts = {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
      composed: true,
    };
    const enterEvt = new KeyboardEvent("keydown", enterOpts);
    try {
      Object.defineProperty(enterEvt, "keyCode", { get: () => 13 });
      Object.defineProperty(enterEvt, "which", { get: () => 13 });
    } catch (_) {}
    inputElement.dispatchEvent(enterEvt);
    inputElement.dispatchEvent(new KeyboardEvent("keyup", enterOpts));
    return true;
  }

  function getInputContainer(input) {
    if (!input) return null;

    const candidates = [
      "form[data-chatgpt-composer]",
      "[data-chatgpt-composer]",
      ".input-area-container",
      "form",
      ".input-area",
      "[class*='composer-parent']",
      "[class*='composer']",
      "[class*='input-area']",
      "[class*='input-container']",
      "rich-textarea",
      "fieldset",
    ];

    const inputRect = input.getBoundingClientRect();
    if (!inputRect.width || !inputRect.height) {
      return input.parentElement;
    }

    let best = null;
    let bestArea = Infinity;

    for (const selector of candidates) {
      let matched;
      try {
        matched = input.closest(selector);
      } catch (_) {
        continue;
      }
      if (!matched || matched === input) continue;

      const rect = matched.getBoundingClientRect();
      if (rect.height < 20 || rect.width < 40) continue;
      if (rect.top > inputRect.top + 2) continue;
      if (rect.bottom < inputRect.bottom - 2) continue;
      if (rect.width < inputRect.width * 0.75) continue;

      const area = rect.width * rect.height;
      if (area < bestArea) {
        bestArea = area;
        best = matched;
      }
    }

    return best || input.parentElement;
  }

  /**
   * Calculate the composer's "visual boundary":
   * Include the native attachment / preview / toolbar sibling nodes immediately above the input container
   * as part of the top boundary, as long as they are vertically adjacent to the current area and horizontally overlap it.
   * This way, when uploading real files causes the input box to deform (the attachment area floats upward),
   * the pseudo file tray will automatically follow above the attachment area instead of covering the native attachments.
   */
  function getComposerVisualBounds(input, anchor) {
    const baseRect = (anchor || input).getBoundingClientRect();
    const bounds = {
      top: baseRect.top,
      left: baseRect.left,
      right: baseRect.right,
      width: baseRect.width,
    };

    let node = anchor || input;
    let depth = 0;

    while (node && depth < COMPOSER_VISUAL_MAX_DEPTH) {
      const nodeRect = node.getBoundingClientRect();
      let cursorTop = Math.min(nodeRect.top, bounds.top);

      let sibling = node.previousElementSibling;
      let guard = 0;

      while (sibling && guard < 24) {
        guard++;

        if (
          sibling.id === "ai-turbo-vf-tray" ||
          sibling.id === HUD_ID ||
          sibling.id === "ai-turbo-vf-preview-modal"
        ) {
          sibling = sibling.previousElementSibling;
          continue;
        }

        const siblingRect = sibling.getBoundingClientRect();
        const isVisible = siblingRect.width > 0 && siblingRect.height > 0;
        if (!isVisible) {
          sibling = sibling.previousElementSibling;
          continue;
        }

        const siblingStyle = window.getComputedStyle(sibling);
        if (
          siblingStyle.position === "fixed" ||
          siblingStyle.position === "sticky"
        ) {
          sibling = sibling.previousElementSibling;
          continue;
        }

        if (
          sibling.matches('button, [role="button"]') &&
          !sibling.querySelector(
            'input, textarea, [contenteditable="true"], [role="textbox"]',
          )
        ) {
          sibling = sibling.previousElementSibling;
          continue;
        }

        if (siblingRect.top < 8) {
          break;
        }

        const maxSiblingHeight = Math.max(baseRect.height * 3, 320);
        if (siblingRect.height > maxSiblingHeight) {
          break;
        }

        const overlap =
          Math.min(bounds.right, siblingRect.right) -
          Math.max(bounds.left, siblingRect.left);
        const minOverlap = Math.min(bounds.width, siblingRect.width) * 0.35;
        const gap = cursorTop - siblingRect.bottom;

        if (overlap > minOverlap && gap >= -1 && gap <= COMPOSER_VISUAL_GAP) {
          bounds.top = Math.min(bounds.top, siblingRect.top);
          bounds.left = Math.min(bounds.left, siblingRect.left);
          bounds.right = Math.max(bounds.right, siblingRect.right);
          bounds.width = bounds.right - bounds.left;
          cursorTop = siblingRect.top;
          sibling = sibling.previousElementSibling;
          continue;
        }

        break;
      }

      const parent = node.parentElement;
      if (
        !parent ||
        parent === document.body ||
        parent === document.documentElement
      ) {
        break;
      }
      node = parent;
      depth++;
    }

    return bounds;
  }

  function createUiIcon(name, size = 14) {
    const paths = {
      file: ["M6 3.5h7.7L18.5 8v12H6z", "M13.5 3.5V8h5"],
      eye: [
        "M2.8 12s3.3-5 9.2-5 9.2 5 9.2 5-3.3 5-9.2 5-9.2-5-9.2-5z",
        "M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
      ],
      close: ["M5 5l14 14", "M19 5L5 19"],
      bolt: ["M13.2 2.5L5 13h6.1l-.8 8.5L19 10.2h-6.2z"],
    };

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");

    for (const pathData of paths[name] || []) {
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      path.setAttribute("d", pathData);
      svg.appendChild(path);
    }

    return svg;
  }

  function stopVirtualFileTrayTracking() {
    stopVirtualFileTrayTracking();
    window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;

    if (virtualFileTrayResizeObserver) {
      virtualFileTrayResizeObserver.disconnect();
      virtualFileTrayResizeObserver = null;
    }

    virtualFileTrayAnchor = null;
    virtualFileTrayCachedInput = null;
    virtualFileTrayLastSignature = "";

    if (virtualFileTrayPositionFrame) {
      window.cancelAnimationFrame(virtualFileTrayPositionFrame);
      virtualFileTrayPositionFrame = 0;
    }
  }

  function resetVirtualFileTraySignature() {
    virtualFileTrayLastSignature = "";
  }

  function startVirtualFileTraySyncLoop() {
    if (virtualFileTraySyncRaf) return;
    virtualFileTraySyncLastTs = 0;

    const tick = (ts) => {
      virtualFileTraySyncRaf = 0;

      const tray = document.getElementById("ai-turbo-vf-tray");
      if (!tray || !tray.isConnected || !activeVirtualFiles.length) {
        return;
      }

      if (ts - virtualFileTraySyncLastTs >= VF_TRAY_SYNC_INTERVAL) {
        virtualFileTraySyncLastTs = ts;
        positionVirtualFileTray();
      }

      virtualFileTraySyncRaf = window.requestAnimationFrame(tick);
    };

    virtualFileTraySyncRaf = window.requestAnimationFrame(tick);
  }

  function stopVirtualFileTraySyncLoop() {
    if (virtualFileTraySyncRaf) {
      window.cancelAnimationFrame(virtualFileTraySyncRaf);
      virtualFileTraySyncRaf = 0;
    }
    virtualFileTraySyncLastTs = 0;
  }

  function scheduleVirtualFileTrayPosition() {
    if (!activeVirtualFiles.length) return;
    if (virtualFileTrayPositionFrame) return;

    virtualFileTrayPositionFrame = window.requestAnimationFrame(() => {
      virtualFileTrayPositionFrame = 0;
      positionVirtualFileTray();
    });
  }

  function bindVirtualFileTrayObservers(anchor, input) {
    if (virtualFileTrayResizeObserver) {
      virtualFileTrayResizeObserver.disconnect();
    }
    virtualFileTrayAnchor = anchor;

    if (!("ResizeObserver" in window)) return;

    virtualFileTrayResizeObserver = new ResizeObserver(() => {
      resetVirtualFileTraySignature();
      scheduleVirtualFileTrayPosition();
    });

    const observed = new Set();
    const observeNode = (node) => {
      if (!(node instanceof Element)) return;
      if (node === document.body || node === document.documentElement) return;
      if (observed.has(node)) return;
      observed.add(node);
      try {
        virtualFileTrayResizeObserver.observe(node);
      } catch (_) {}
    };

    observeNode(input);
    let node = anchor;
    let depth = 0;
    while (node && depth < COMPOSER_VISUAL_MAX_DEPTH) {
      observeNode(node);
      observeNode(node.parentElement);
      node = node.parentElement;
      depth++;
    }
  }

  function positionVirtualFileTray() {
    const tray = document.getElementById("ai-turbo-vf-tray");
    if (!tray || !tray.isConnected || !activeVirtualFiles.length) return;

    let input = virtualFileTrayCachedInput;
    if (!input || !input.isConnected || input.getClientRects().length === 0) {
      input = getChatInput();
      virtualFileTrayCachedInput = input;
    }

    if (!input || !input.isConnected) {
      tray.classList.remove("is-positioned");
      resetVirtualFileTraySignature();
      return;
    }

    const anchor = getInputContainer(input);
    if (!anchor || !anchor.isConnected) {
      tray.classList.remove("is-positioned");
      resetVirtualFileTraySignature();
      return;
    }

    if (anchor !== virtualFileTrayAnchor) {
      bindVirtualFileTrayObservers(anchor, input);
    }

    const inputRect = input.getBoundingClientRect();
    if (!inputRect.width || !inputRect.height) {
      tray.classList.remove("is-positioned");
      resetVirtualFileTraySignature();
      return;
    }

    const bounds = getComposerVisualBounds(input, anchor);

    const viewportPadding = 18;
    const verticalGap = 16;

    let visualTop =
      Number.isFinite(bounds.top) && bounds.top <= inputRect.top + 1
        ? bounds.top
        : inputRect.top;

    visualTop = Math.min(visualTop, inputRect.top);
    const minVisibleTop = viewportPadding + verticalGap + 60;
    visualTop = Math.max(minVisibleTop, Math.max(0, visualTop));
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const availableWidth = Math.max(0, viewportWidth - viewportPadding * 2);

    const baseWidth = Math.max(inputRect.width, bounds.width || 0);
    const trayWidth = Math.min(Math.max(baseWidth, 280), availableWidth);

    const anchorLeft = Math.min(inputRect.left, bounds.left);
    const left = Math.min(
      Math.max(viewportPadding, anchorLeft),
      Math.max(viewportPadding, viewportWidth - trayWidth - viewportPadding),
    );

    const finalBottom = Math.max(
      viewportPadding,
      viewportHeight - visualTop + verticalGap,
    );
    const maxTrayHeight = Math.max(
      72,
      visualTop - viewportPadding - verticalGap,
    );

    const signature = [
      Math.round(left * 10) / 10,
      Math.round(finalBottom * 10) / 10,
      Math.round(trayWidth * 10) / 10,
      Math.round(maxTrayHeight * 10) / 10,
    ].join("|");

    const isPositioned = tray.classList.contains("is-positioned");

    if (signature === virtualFileTrayLastSignature && isPositioned) {
      return;
    }
    virtualFileTrayLastSignature = signature;

    tray.style.width = `${trayWidth}px`;
    tray.style.left = `${left}px`;
    tray.style.top = "auto";
    tray.style.bottom = `${finalBottom}px`;
    tray.style.maxHeight = `${maxTrayHeight}px`;
    tray.style.overflowY = "auto";
    tray.dataset.placement = "top";

    if (!isPositioned) {
      tray.classList.add("is-positioned");
    }
  }

  function removeVirtualFile(id) {
    activeVirtualFiles = activeVirtualFiles.filter((item) => item.id !== id);
    trayIsDirty = true;
    renderVirtualFileTray();
  }

  function showTextPreviewModal(fileItem) {
    document.getElementById("ai-turbo-vf-preview-modal")?.remove();

    const previewBackdrop = el("div", {
      id: "ai-turbo-vf-preview-modal",
      className: "ai-turbo-modal-backdrop",
      onclick: (e) => {
        if (e.target === previewBackdrop) previewBackdrop.remove();
      },
    });

    const titleSpan = el(
      "span",
      {
        style:
          "font:600 13px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#f8fafc;max-width:70%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
      },
      [
        `📄 ${fileItem.name} (${fileItem.lineCount.toLocaleString()} 行 · ${(fileItem.size / 1024).toFixed(1)} KB)`,
      ],
    );

    const closeBtn = el(
      "button",
      {
        type: "button",
        style:
          "background:transparent;border:0;color:#94a3b8;cursor:pointer;font-size:16px;line-height:1;padding:4px;border-radius:4px;",
        onclick: () => previewBackdrop.remove(),
      },
      ["✕"],
    );

    const header = el(
      "div",
      {
        style:
          "flex-shrink:0;display:flex;justify-content:space-between;align-items:center;padding:12px 18px;border-bottom:1px solid rgba(148,163,184,0.15);background:rgba(18,24,38,0.98);",
      },
      [titleSpan, closeBtn],
    );

    const bodyText = el(
      "pre",
      {
        style:
          "flex:1 1 auto;min-height:0;margin:0;padding:16px;overflow-y:auto;overflow-x:auto;background:rgba(5,8,15,0.7);font:12px/1.6 ui-monospace,monospace;color:#cbd5e1;white-space:pre-wrap;word-break:break-all;",
      },
      [
        fileItem.content.slice(0, 8000) +
          (fileItem.content.length > 8000
            ? "\n\n... (预览仅截取前 8,000 字符，发送时将提交完整全部文本)"
            : ""),
      ],
    );

    const footerText = el(
      "span",
      { style: "font:11px sans-serif;color:#64748b;" },
      ["按 Esc 键或点击外部任意区域即可快速关闭"],
    );

    const footerCloseBtn = el(
      "button",
      {
        type: "button",
        style:
          "background:rgba(255,255,255,0.08);border:1px solid rgba(148,163,184,0.25);color:#e2e8f0;padding:4px 14px;border-radius:6px;font:11px sans-serif;cursor:pointer;",
        onclick: () => previewBackdrop.remove(),
      },
      ["关闭"],
    );

    const footer = el(
      "div",
      {
        style:
          "flex-shrink:0;display:flex;justify-content:space-between;align-items:center;padding:10px 18px;border-top:1px solid rgba(148,163,184,0.15);background:rgba(18,24,38,0.98);",
      },
      [footerText, footerCloseBtn],
    );

    const modalBox = el(
      "div",
      {
        style:
          "background:#0d121c;border:1px solid rgba(52,211,153,0.35);box-shadow:0 24px 60px rgba(0,0,0,0.85);border-radius:14px;width:720px;max-width:94vw;max-height:85vh;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;",
      },
      [header, bodyText, footer],
    );

    previewBackdrop.appendChild(modalBox);
    document.body.appendChild(previewBackdrop);
  }

  function renderVirtualFileTray() {
    let tray = document.getElementById("ai-turbo-vf-tray");

    resetVirtualFileTraySignature();

    if (!activeVirtualFiles.length) {
      if (tray) {
        withSelfMutation(() => tray.remove());
      }

      stopVirtualFileTrayTracking();
      trayIsDirty = false;
      updateHudDashboard();
      return;
    }

    const input = getChatInput();
    const container = getInputContainer(input);

    if (!container || !container.isConnected) {
      return;
    }

    withSelfMutation(() => {
      if (!tray) {
        tray = el("div", {
          id: "ai-turbo-vf-tray",
          className: "ai-turbo-vf-tray",
          role: "region",
          "aria-label": "虚拟文件",
        });

        document.body.appendChild(tray);
      }

      tray.textContent = "";

      const header = el(
        "div",
        {
          className: "ai-turbo-vf-header",
        },
        [
          el(
            "div",
            {
              className: "ai-turbo-vf-heading",
            },
            [
              el(
                "span",
                {
                  className: "ai-turbo-vf-heading-icon",
                },
                [createUiIcon("bolt", 13)],
              ),
              el(
                "span",
                {
                  className: "ai-turbo-vf-heading-title",
                },
                ["虚拟文件"],
              ),
              el(
                "span",
                {
                  className: "ai-turbo-vf-heading-count",
                },
                [`${activeVirtualFiles.length}`],
              ),
            ],
          ),

          el(
            "span",
            {
              className: "ai-turbo-vf-heading-hint",
            },
            ["发送时作为上下文附加"],
          ),
        ],
      );

      const fileList = el("div", {
        className: "ai-turbo-vf-list",
      });

      tray.appendChild(header);
      tray.appendChild(fileList);

      for (const item of activeVirtualFiles) {
        const sizeText = `${(item.size / 1024).toFixed(1)} KB`;

        const nameLabel = el(
          "span",
          {
            className: "ai-turbo-vf-name",
            title: item.name,
          },
          [item.name],
        );

        const metaLabel = el(
          "span",
          {
            className: "ai-turbo-vf-meta",
          },
          [`${item.lineCount.toLocaleString()} 行`, " · ", sizeText],
        );

        const btnPreview = el(
          "button",
          {
            type: "button",
            className: "ai-turbo-vf-action ai-turbo-vf-action-preview",
            title: "预览文本内容",
            "aria-label": `预览 ${item.name}`,
          },
          [createUiIcon("eye", 13)],
        );

        btnPreview.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          showTextPreviewModal(item);
        });

        const btnDelete = el(
          "button",
          {
            type: "button",
            className: "ai-turbo-vf-action ai-turbo-vf-action-delete",
            title: "移除该文件",
            "aria-label": `移除 ${item.name}`,
          },
          [createUiIcon("close", 13)],
        );

        btnDelete.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          removeVirtualFile(item.id);
        });

        const fileItem = el(
          "div",
          {
            className: "ai-turbo-vf-pill",
          },
          [
            el(
              "span",
              {
                className: "ai-turbo-vf-file-icon",
              },
              [createUiIcon("file", 14)],
            ),

            el(
              "div",
              {
                className: "ai-turbo-vf-file-copy",
              },
              [nameLabel, metaLabel],
            ),

            el(
              "span",
              {
                className: "ai-turbo-vf-badge",
              },
              ["TEXT"],
            ),

            el(
              "div",
              {
                className: "ai-turbo-vf-actions",
              },
              [btnPreview, btnDelete],
            ),
          ],
        );

        fileList.appendChild(fileItem);
      }

      trayIsDirty = false;
    });

    resetVirtualFileTraySignature();
    positionVirtualFileTray();
    startVirtualFileTraySyncLoop();
    updateHudDashboard();
  }

  function handlePasteIntercept(event) {
    if (isEngineDormant()) return;
    if (!state.virtualFileEnabled) return;

    const target = event.target;
    if (
      !(target instanceof Element) ||
      !target.closest(
        'rich-textarea, textarea, [contenteditable="true"], [role="textbox"]',
      )
    ) {
      return;
    }

    const clipData = event.clipboardData || window["clipboardData"];
    if (!clipData) return;

    const pastedText = clipData.getData("text/plain");
    if (!pastedText || pastedText.length < VIRTUAL_FILE_THRESHOLD) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    const byteSize = new Blob([pastedText]).size;
    const kbSize = (byteSize / 1024).toFixed(1);
    const lineCount = fastCountLines(pastedText);
    const vfId = `vf_${Date.now()}`;
    const fileName = `pasted_text_${kbSize}kb.txt`;

    activeVirtualFiles.push({
      id: vfId,
      name: fileName,
      size: byteSize,
      charCount: pastedText.length,
      lineCount,
      content: pastedText,
      timestamp: Date.now(),
    });

    updateHudDashboard();
    trayIsDirty = true;
    renderVirtualFileTray();
  }

  function insertTextAtomic(inputElement, text) {
    if (
      inputElement instanceof HTMLTextAreaElement ||
      inputElement instanceof HTMLInputElement
    ) {
      // 用原生 setter，确保 React 受控组件能感知变化
      const proto =
        inputElement instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(inputElement, text);
      else inputElement.value = text;
      inputElement.dispatchEvent(new Event("input", { bubbles: true }));
      inputElement.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    inputElement.focus();

    // 用 Range 选中整个编辑器内容（比 execCommand("selectAll") 更可靠）
    try {
      const range = document.createRange();
      range.selectNodeContents(inputElement);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    } catch (_) {
      try {
        document.execCommand("selectAll", false, null);
      } catch (_) {}
    }

    const singleContainer = `<div style="white-space:pre-wrap;">${escapeHtml(text)}</div>`;
    let success = false;
    try {
      success = document.execCommand("insertHTML", false, singleContainer);
    } catch (_) {}

    if (!success) {
      inputElement.textContent = text;
    }

    // 派发 input 事件；如果 execCommand 成功，ProseMirror 通常已经派发过，
    // 这里补派一次保证 React 侧同步（幂等）。
    inputElement.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        composed: true,
        inputType: "insertFromPaste",
        data: text,
      }),
    );
    inputElement.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function fuseAndSubmit(inputElement) {
    if (!activeVirtualFiles.length || !inputElement) return false;

    let userText = "";
    if (inputElement instanceof HTMLTextAreaElement) {
      userText = inputElement.value.trim();
    } else {
      userText = (
        inputElement.innerText ||
        inputElement.textContent ||
        ""
      ).trim();
    }

    const fileBlocks = activeVirtualFiles.map((vf) => {
      return `\n\n${CODE_FENCE}text\n${VF_TOKEN_START}${vf.name}|${vf.lineCount}|${vf.size}${VF_TOKEN_END}\n${vf.content}\n${CODE_FENCE}`;
    });

    const finalPrompt =
      (userText ? userText : "请查阅并分析以下文本内容：") +
      fileBlocks.join("\n");

    activeVirtualFiles = [];
    trayIsDirty = true;
    renderVirtualFileTray();

    observer?.disconnect();
    codeResizeObserver?.disconnect();

    withSelfMutation(() => {
      insertTextAtomic(inputElement, finalPrompt);
    });

    return true;
  }

  function sendWithRetry(inputElement, onComplete) {
    let attempts = 0;
    const maxAttempts = 40; // 50ms * 40 ≈ 2000ms
    let forcedSubmitTried = false;

    const timer = setInterval(() => {
      attempts++;

      if (isEngineDormant()) {
        clearInterval(timer);
        isSubmitting = false;
        cleanupAndResume(onComplete, false);
        return;
      }

      // 第一轮：只接受可用的发送按钮
      const sendBtn = findSendControl(inputElement);
      if (sendBtn) {
        clearInterval(timer);
        triggerSendButton(sendBtn);
        cleanupAndResume(onComplete, true);
        return;
      }

      // 约 800ms 后：允许 disabled 按钮，尝试强行点击
      if (attempts >= 16 && !forcedSubmitTried) {
        const disabledBtn = findSendControl(inputElement, {
          allowDisabled: true,
        });
        if (disabledBtn) {
          forcedSubmitTried = true;
          clearInterval(timer);
          try {
            disabledBtn.removeAttribute("disabled");
            disabledBtn.setAttribute("aria-disabled", "false");
          } catch (_) {}
          triggerSendButton(disabledBtn);
          cleanupAndResume(onComplete, true);
          return;
        }
      }

      // 最终兜底
      if (attempts >= maxAttempts) {
        clearInterval(timer);
        fallbackKeyboardSubmit(inputElement);
        cleanupAndResume(onComplete, false);
      }
    }, 50);
  }

  function cleanupAndResume(onComplete, status) {
    window.setTimeout(() => {
      observeDom();
      observeCodeLayout();
      if (onComplete) onComplete(status);
    }, 280);
  }

  function handleSendIntercept(event) {
    if (isEngineDormant()) return;
    if (
      !state.virtualFileEnabled ||
      !activeVirtualFiles.length ||
      isSubmitting
    ) {
      return;
    }

    if (
      event.type === "keydown" &&
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.isComposing
    ) {
      const input = getChatInput();
      if (input && (event.target === input || input.contains(event.target))) {
        event.preventDefault();
        event.stopPropagation();
        isSubmitting = true;
        fuseAndSubmit(input);
        sendWithRetry(input, () => {
          isSubmitting = false;
        });
        return;
      }
    }

    if (event.type === "click") {
      const eventTarget = event.target;
      if (!(eventTarget instanceof Element)) return;

      // 1) 选择器匹配
      let sendControl = null;
      try {
        sendControl = eventTarget.closest(
          (currentPlatform.sendButtonSelectors || []).join(","),
        );
      } catch (_) {}

      // 2) 兜底：向上 4 层按 aria-label / title / data-testid 识别
      if (!sendControl) {
        let node = eventTarget;
        let depth = 0;
        while (node && depth < 4 && node !== document.body) {
          if (
            node instanceof HTMLElement &&
            node.tagName === "BUTTON" &&
            isSendLikeButton(node)
          ) {
            sendControl = node;
            break;
          }
          node = node.parentElement;
          depth++;
        }
      }

      if (!sendControl) return;

      const input = getChatInput();
      if (!input) return;

      // 用户点击了发送按钮本身就是"发送意图"，
      // 不再强依赖 isSendControlForInput，避免误判导致消息发不出去。
      event.preventDefault();
      event.stopPropagation();
      isSubmitting = true;
      fuseAndSubmit(input);
      sendWithRetry(input, () => {
        isSubmitting = false;
      });
    }
  }

  /* ---------------- 推理强度记忆 ---------------- */

  let reasoningRestoreTimer = 0;
  let reasoningRestoreAttempts = 0;
  let reasoningRestoreDone = false;
  let applyingReasoning = false;
  // 最近点开的控件：弹层里的选项点击时用来把“哪个控件的哪个选项”配对
  let reasoningMenuTrigger = null;
  let reasoningMenuTriggerAt = 0;
  let reasoningMenuTriggerLabel = "";

  function loadReasoningMemory() {
    try {
      const parsed = JSON.parse(
        localStorage.getItem(STORAGE_KEY_REASONING) || "{}",
      );
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function saveReasoningMemory(memory) {
    try {
      localStorage.setItem(STORAGE_KEY_REASONING, JSON.stringify(memory));
    } catch (_) {}
  }

  /** Gemini account slots (/u/0, /u/1, ...) keep independent reasoning memories. */
  function reasoningScope() {
    const account = location.pathname.match(/^\/u\/(\d+)(?:\/|$)/);
    return account ? `${location.hostname}#u${account[1]}` : location.hostname;
  }

  function readReasoningRecord(memory) {
    const all = memory || loadReasoningMemory();
    const scoped = all[reasoningScope()];
    if (scoped && typeof scoped === "object") return scoped;
    return all[location.hostname] || null;
  }

  function writeReasoningRecord(record) {
    const memory = loadReasoningMemory();
    const scope = reasoningScope();
    memory[scope] = record;
    // A scoped write supersedes the old hostname-wide record.
    if (scope !== location.hostname) delete memory[location.hostname];
    saveReasoningMemory(memory);
    return record;
  }

  function clearReasoningRecord() {
    const memory = loadReasoningMemory();
    delete memory[reasoningScope()];
    delete memory[location.hostname];
    saveReasoningMemory(memory);
  }

  function isInsideTurboUI(node) {
    if (!node || typeof node.closest !== "function") return false;
    return Boolean(node.closest("[id^='ai-turbo-'], .ai-turbo-code-bar"));
  }

  function controlLabel(control) {
    // Prefer what the user can read; Gemini's aria-label is a sentence such as
    // "Open mode picker, currently Flash High" and cannot be used as an option.
    const visible = String(control.innerText || "")
      .replace(/\s+/g, " ")
      .trim();
    const raw =
      visible ||
      control.getAttribute("aria-label") ||
      control.getAttribute("title") ||
      control.textContent ||
      "";
    return raw.replace(/\s+/g, " ").trim().slice(0, 60);
  }

  /** true/false = 已知开/关；null = 平台未暴露状态 */
  function controlOnState(control) {
    if (control.tagName === "INPUT")
      return control.checked === true ? true : false;
    const input = control.querySelector?.('input[type="checkbox"]');
    if (input) return input.checked === true;
    const pressed = control.getAttribute("aria-pressed");
    if (pressed !== null) return pressed === "true";
    const checked = control.getAttribute("aria-checked");
    if (checked !== null) return checked === "true";
    const dataState = control.getAttribute("data-state");
    if (dataState)
      return /^(on|open|checked|active|selected|true)$/i.test(dataState);
    const cls = typeof control.className === "string" ? control.className : "";
    if (/(^|[\s_-])(active|selected|checked|is-on)([\s_-]|$)/i.test(cls))
      return true;
    return null;
  }

  /** Stable control identity: prefer structural attributes over changeable labels. */
  function controlKey(control) {
    const raw =
      control.getAttribute("data-test-id") ||
      control.getAttribute("data-testid") ||
      control.id ||
      control.getAttribute("aria-label") ||
      "";
    return String(raw).replace(/\s+/g, " ").trim().slice(0, 60);
  }

  /** 只有下拉/弹层类按钮才可能承载“选一个选项”的语义 */
  function isDropdownTrigger(control) {
    if (control.hasAttribute("aria-expanded")) return true;
    const popup = control.getAttribute("aria-haspopup");
    if (popup !== null && popup !== "false") return true;
    // Angular Material / CDK 等框架用自定义属性或类名标记弹层触发器，不带 aria-haspopup
    if (control.hasAttribute("gemmenutrigger") || control.hasAttribute("cdkoverlayorigin")) return true;
    if (control.matches("[data-state], [data-radix-menu-trigger], .mat-mdc-menu-trigger")) return true;
    const label = control.getAttribute("aria-label") || "";
    return /^(open|选择|打开).{0,20}(picker|menu|mode|model)/i.test(label.trim());
  }

  function closeOpenPopup() {    const esc = new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      keyCode: 27,
      bubbles: true,
      cancelable: true,
    });
    if (document.activeElement) document.activeElement.dispatchEvent(esc);
    document.dispatchEvent(esc);
  }

  /** 弹层根：优先用 aria-controls 指向的菜单，避免在整页里捞按钮 */
  function popupRootFor(control) {
    const id = control.getAttribute("aria-controls");
    const byId = id ? document.getElementById(id) : null;
    return byId || control.closest(REASONING_MENU_SELECTOR);
  }

  function hasVisibleMenu() {
    return Array.from(document.querySelectorAll(REASONING_MENU_SELECTOR)).some(
      (node) => !isInsideTurboUI(node) && nodeVisible(node),
    );
  }

  /** Read row copy from the row's own visible label structure, not a nested menu. */
  function rowScopedText(node, selector) {
    if (!(node instanceof Element)) return "";
    const part = Array.from(node.querySelectorAll(selector)).find((candidate) => {
      if (isInsideTurboUI(candidate) || !nodeVisible(candidate)) return false;
      const owner = candidate.closest(
        "gem-menu-item, [role='menuitem'], [role='menuitemradio'], [role='option'], [role='radio']",
      );
      return owner === node;
    });
    return part ? String(part.innerText || "").replace(/\s+/g, " ").trim() : "";
  }

  /** Gemini exposes label / sublabel elements even when innerText flattens them. */
  function rowLabel(node) {
    const structured = rowScopedText(node, ".label");
    if (structured) return structured;
    const line = (node.innerText || "").split("\n").find((part) => part.trim());
    return line ? line.replace(/\s+/g, " ").trim() : "";
  }

  function rowHint(node) {
    const structured = rowScopedText(node, ".sublabel");
    if (structured) return structured;
    const lines = (node.innerText || "")
      .split("\n")
      .map((part) => part.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    return lines[1] || "";
  }

  /** Read selection without requiring radio semantics; Gemini marks rows with class and icon. */
  function choiceRowSelected(node) {
    if (!(node instanceof Element)) return null;
    const checked = node.getAttribute("aria-checked");
    if (checked !== null && checked !== "") return checked === "true";
    const selected = node.getAttribute("aria-selected");
    if (selected !== null && selected !== "") return selected === "true";
    const dataState = node.getAttribute("data-state");
    if (dataState === "checked" || dataState === "selected" || dataState === "on") return true;
    if (dataState === "unchecked" || dataState === "unselected" || dataState === "off") return false;
    if (node.matches(".selected, .checked")) return true;
    if (
      node.querySelector(
      ".selected, .checked, [aria-label='Selected'], [aria-label='selected'], [aria-label='已选中'], [data-state='checked'], [data-mat-icon-name='check']",
      )
    ) {
      return true;
    }
    return null;
  }

  function menuHasSelectionState(menu) {
    if (!menu) return false;
    return Boolean(
      menu.querySelector(
        "[aria-checked], [aria-selected], [role='menuitemradio'], [role='radio'], .selected, .checked, [aria-label='Selected'], [aria-label='已选中'], [data-mat-icon-name='check']",
      ),
    );
  }

  function nodeVisible(node) {
    if (!(node instanceof Element)) return false;
    const rect = node.getBoundingClientRect();
    return rect.width >= 1 && rect.height >= 1;
  }

  /**
   * Selected state is explicit on some rows and implied by a sibling marker on
   * others (Gemini marks only the active row).
   */
  function choiceRowIsSelected(row) {
    const explicit = choiceRowSelected(row);
    if (explicit !== null) return explicit;
    const menu = row.closest(REASONING_MENU_SELECTOR);
    return menu && menuHasSelectionState(menu) ? false : null;
  }

  /** Build the visible parent path, e.g. ["Thinking level"], from nested menu owners. */
  function choicePathForRow(row) {
    const path = [];
    let menu = row.closest(REASONING_MENU_SELECTOR);
    let depth = 0;
    while (menu && depth < 5) {
      const menuId = menu.id;
      if (!menuId) break;
      const parent = Array.from(document.querySelectorAll("[aria-controls]")).find(
        (node) => {
          if (isInsideTurboUI(node) || !nodeVisible(node)) return false;
          if (node.getAttribute("aria-controls") !== menuId) return false;
          const popup = node.getAttribute("aria-haspopup");
          if (popup === null || popup === "false") return false;
          const owner = node.closest(REASONING_MENU_SELECTOR);
          return Boolean(owner && owner !== menu);
        },
      );
      if (!parent) break;
      const owner = parent.closest(REASONING_MENU_SELECTOR);
      if (!owner || owner === menu) break;
      const label = rowLabel(parent);
      if (label) path.unshift(label);
      menu = owner;
      depth += 1;
    }
    return path;
  }

  function choiceRowForTarget(target) {
    const row = target.closest(
      "gem-menu-item, [role='menuitem'], [role='menuitemradio'], [role='option'], [aria-checked], [aria-selected]",
    );
    if (!row || !row.closest(REASONING_MENU_SELECTOR)) return null;
    const popup = row.getAttribute("aria-haspopup");
    if (popup !== null && popup !== "false") return null;
    return rowLabel(row) ? row : null;
  }

  /** Parent row for one saved path segment, at the current menu level only. */
  function findPathParent(menu, label) {
    if (!menu || !label) return null;
    const parents = Array.from(
      menu.querySelectorAll("[aria-haspopup]:not([aria-haspopup='false'])"),
    ).filter((node) => {
      if (isInsideTurboUI(node) || !nodeVisible(node)) return false;
      const owner = node.closest("[role='menu']");
      if (owner && owner !== menu && menu.contains(owner)) return false;
      return rowLabel(node) === label;
    });
    return parents[0] || null;
  }

  /** Exact leaf row by its first visible line; never a submenu parent. */
  function findExactChoiceRow(menu, option) {
    if (!menu || !option) return null;
    const rows = Array.from(menu.querySelectorAll(CHOICE_OPTION_SELECTOR)).filter(
      (node) => {
        if (isInsideTurboUI(node) || !nodeVisible(node)) return false;
        if (node.closest(REASONING_MENU_SELECTOR) !== menu) return false;
        const popup = node.getAttribute("aria-haspopup");
        if (popup !== null && popup !== "false") return false;
        return rowLabel(node) === option;
      },
    );
    return rows.reduce((deepest, node) => {
      if (!deepest) return node;
      return deepest.contains(node) ? node : deepest;
    }, null);
  }

  function submenuForParent(parent) {
    const id = parent.getAttribute("aria-controls");
    const menu = id ? document.getElementById(id) : null;
    return menu && nodeVisible(menu) ? menu : null;
  }

  /** Whether the trigger already shows the remembered choice. */
  function choiceLooksApplied(saved, control) {
    const label = controlLabel(control).toLowerCase();
    if (!label) return false;
    if (saved.resultLabel && label === String(saved.resultLabel).toLowerCase()) {
      return true;
    }
    const option = String(saved.option || "").trim();
    if (!option) return false;
    if (/\bcurrently\s+/i.test(option)) {
      const tail = option.replace(/^.*\bcurrently\s+/i, "").trim().toLowerCase();
      return Boolean(tail) && (label === tail || label.endsWith(` ${tail}`));
    }
    const expected = option.toLowerCase();
    return label === expected || label.endsWith(` ${expected}`);
  }

  /** Keep the old trigger-label fallback, but discard accessible-name prose. */
  function choiceTokens(saved) {
    const option = String(saved.option || "").trim();
    if (Array.isArray(saved.path) && saved.path.length) {
      return [...saved.path, option].map((part) => String(part).trim()).filter(Boolean);
    }
    const currentValue = option.replace(/^.*\bcurrently\s+/i, "").trim();
    return currentValue.split(/\s+/).filter(Boolean);
  }

  /** Replace a legacy or label-only record with the exact row the user chose. */
  function upgradeChoiceRecord(saved, control, info) {
    const stableKey = controlKey(control);
    if (!stableKey || !info || !info.option) return;
    const samePath =
      JSON.stringify(Array.isArray(saved.path) ? saved.path : []) ===
      JSON.stringify(info.path);
    if (saved.key === stableKey && saved.option === info.option && samePath) return;
    const labelNow = controlLabel(control);
    writeReasoningRecord({
      mode: "choice",
      key: stableKey,
      controlLabel: saved.controlLabel || "",
      path: info.path,
      option: info.option,
      hint: info.hint || "",
      resultLabel: labelNow || saved.resultLabel || "",
      ts: Date.now(),
    });
    renderReasoningStatus();
  }

  /** 弹层内按文案找一行：先精确，再只认“以该文案结尾”（模型行带版本号前缀） */
  function findRowIn(root, token) {
    if (!root || !token) return null;
    const rows = Array.from(root.querySelectorAll(CHOICE_OPTION_SELECTOR)).filter((node) => {
      if (isInsideTurboUI(node)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width >= 1 && rect.height >= 1;
    });
    const exact = rows.filter((node) => rowLabel(node) === token);
    if (exact.length) {
      return exact.reduce((best, node) => (best.contains(node) ? node : best));
    }
    const tail = rows.filter((node) => rowLabel(node).endsWith(token));
    if (tail.length === 1) return tail[0];
    // 子菜单行把说明挤在同一行（Gemini 的“High Extra thorough”），退回“以该词开头且唯一”
    const head = rows.filter((node) => rowLabel(node).startsWith(`${token} `));
    return head.length === 1 ? head[0] : null;
  }

  /**
   * 真正接收点击的元素。菜单行（gem-menu-item 之类）只是壳，监听器常常挂在里面的 button 上，
   * 直接向壳发事件不会被当成选中。
   */
  function interactiveTarget(node) {
    if (node.matches("button, a, [role='menuitemradio'], [role='radio']")) return node;
    return node.querySelector("button, a") || node;
  }

  /**
   * 在可见弹层里按文案找一行。菜单的 id 每次打开都变、子菜单还可能挂到别处，
   * 所以顶层找不到时退回到整栈可见弹层，从最上层往下找。
   */
  function findRowInOpenMenus(token) {
    const menus = Array.from(document.querySelectorAll(REASONING_MENU_SELECTOR)).filter((node) => {
      if (isInsideTurboUI(node)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width >= 1 && rect.height >= 1;
    });
    for (let i = menus.length - 1; i >= 0; i -= 1) {
      const row = findRowIn(menus[i], token);
      if (row) return row;
    }
    return null;
  }

  /**
   * 负责展开子菜单的行。子菜单是点开才渲染的，所以不能要求它里面已经有目标项：
   * 先挑子菜单里已经能看到目标项的那个，没有就退回唯一的可展开行。
   */
  function findSubmenuParent(root, token) {
    if (!root) return null;
    // 只有真能展开的行才算：Gemini 的普通行也带 aria-haspopup="false"，整链会被它们撑满
    const parents = Array.from(
      root.querySelectorAll("[aria-haspopup]:not([aria-haspopup='false'])"),
    ).filter((node) => {
      if (isInsideTurboUI(node)) return false;
      // 子菜单里的行已经属于下一层，在这一层点它没有意义
      const owner = node.closest("[role='menu']");
      if (owner && owner !== root && root.contains(owner)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width >= 1 && rect.height >= 1;
    });
    if (!parents.length) return null;
    const loaded = parents.find((parent) => {
      const sub = document.getElementById(parent.getAttribute("aria-controls") || "");
      return sub ? Boolean(findRowIn(sub, token)) : false;
    });
    return loaded || (parents.length === 1 ? parents[0] : null);
  }

  function choiceRowInfo(row) {
    if (!row || !row.isConnected) return null;
    const option = rowLabel(row);
    if (!option) return null;
    return { option, hint: rowHint(row), path: choicePathForRow(row) };
  }

  /**
   * Restore a path-aware record by walking the exact aria-controls chain.
   * The final row is checked for its selected marker before and after a click.
   */
  function restorePathChoice(saved, control, onSettled) {
    const path = (Array.isArray(saved.path) ? saved.path : [])
      .map((part) => String(part).trim())
      .filter(Boolean);
    const option = String(saved.option || "").trim();
    if (!option) {
      if (onSettled) onSettled(false);
      return;
    }

    let settled = false;
    let lastRow = null;

    const finish = (ok, conclusive) => {
      if (settled) return;
      settled = true;
      const info = ok ? choiceRowInfo(lastRow) : null;
      window.setTimeout(closeOpenPopup, 100);
      if (info) {
        window.setTimeout(() => {
          if (control.isConnected) upgradeChoiceRecord(saved, control, info);
        }, 300);
      }
      applyingReasoning = false;
      // A missing path or option will not appear on a later attempt; only a slow popup is retried.
      if (onSettled) onSettled(ok, conclusive === true);
    };

    const waitForSubmenu = (parent, done, attempt) => {
      if (settled) return;
      const sub = submenuForParent(parent);
      if (sub) {
        done(sub);
        return;
      }
      if (attempt >= 10) {
        done(null);
        return;
      }
      window.setTimeout(() => waitForSubmenu(parent, done, attempt + 1), 180);
    };

    const walk = (menu, index, done, fail) => {
      if (settled) return;
      if (!menu) {
        fail(false);
        return;
      }
      if (index >= path.length) {
        const row = findExactChoiceRow(menu, option);
        if (row) done(row);
        else fail(true);
        return;
      }
      const parent = findPathParent(menu, path[index]);
      if (!parent) {
        fail(true);
        return;
      }
      // Some menus expand on hover, so send both events before the click.
      parent.dispatchEvent(
        new PointerEvent("pointerover", { bubbles: true, cancelable: true, view: window }),
      );
      parent.dispatchEvent(new MouseEvent("mouseenter", { view: window }));
      triggerSendButton(interactiveTarget(parent));
      waitForSubmenu(parent, (sub) => {
        if (!sub) {
          fail(false);
          return;
        }
        walk(sub, index + 1, done, fail);
      }, 0);
    };

    const openRoot = (done, attempt) => {
      if (settled) return;
      const root = popupRootFor(control);
      if (root && nodeVisible(root)) {
        done(root);
        return;
      }
      const fallback = Array.from(
        document.querySelectorAll(REASONING_MENU_SELECTOR),
      ).find((node) => !isInsideTurboUI(node) && nodeVisible(node));
      if (fallback) {
        done(fallback);
        return;
      }
      if (attempt >= 10) {
        finish(false, false);
        return;
      }
      if (attempt === 0) triggerSendButton(interactiveTarget(control));
      window.setTimeout(() => openRoot(done, attempt + 1), 180);
    };

    const verifySelection = () => {
      window.setTimeout(() => {
        if (settled) return;
        closeOpenPopup();
        window.setTimeout(() => {
          if (settled) return;
          openRoot((menu) => {
            walk(
              menu,
              0,
              (row) => {
                lastRow = row;
                const selected = choiceRowIsSelected(row);
                if (selected === true) finish(true);
                else if (selected === false) finish(false);
                else finish(choiceLooksApplied(saved, control));
              },
              (conclusive) => finish(false, conclusive === true),
            );
          }, 0);
        }, 220);
      }, 260);
    };

    applyingReasoning = true;
    openRoot((menu) => {
      walk(
        menu,
        0,
        (row) => {
          lastRow = row;
          const selected = choiceRowIsSelected(row);
          if (selected === true) {
            finish(true);
            return;
          }
          if (selected === null && choiceLooksApplied(saved, control)) {
            finish(true);
            return;
          }
          triggerSendButton(interactiveTarget(row));
          verifySelection();
        },
        (conclusive) => finish(false, conclusive === true),
      );
    }, 0);
  }

  /**
   * Legacy fallback: tokenize a saved trigger label and click matching rows.
   * Path-aware records use restorePathChoice; this keeps old memory valid.
   */
  function restoreChoice(saved, control, onSettled) {
    const tokens = choiceTokens(saved);
    if (!tokens.length) {
      if (onSettled) onSettled(false);
      return;
    }
    let index = 0;
    let settled = false;
    let lastRow = null;
    const finish = (ok, conclusive) => {
      if (settled) return;
      settled = true;
      const info = ok ? choiceRowInfo(lastRow) : null;
      window.setTimeout(closeOpenPopup, 100);
      if (info) {
        window.setTimeout(() => {
          if (control.isConnected) upgradeChoiceRecord(saved, control, info);
        }, 300);
      }
      applyingReasoning = false;
      if (onSettled) onSettled(ok, conclusive === true);
    };
    const step = (attempt) => {
      if (settled) return;
      const token = tokens[index];
      const root = popupRootFor(control);
      const hit = findRowIn(root, token) || findRowInOpenMenus(token);
      if (hit) {
        lastRow = hit;
        triggerSendButton(interactiveTarget(hit));
        next();
        return;
      }
      const parent = findSubmenuParent(root, token);
      if (parent) {
        // 子菜单可能是悬停展开的，先给一个移入事件，再点
        parent.dispatchEvent(
          new PointerEvent("pointerover", { bubbles: true, cancelable: true, view: window }),
        );
        parent.dispatchEvent(new MouseEvent("mouseenter", { view: window }));
        triggerSendButton(interactiveTarget(parent));
        // 子菜单点开才渲染，等它出现再找（最多约 1.4s）
        const lookInSub = (deep) => {
          if (settled) return;
          const sub = document.getElementById(parent.getAttribute("aria-controls") || "");
          const row =
            findRowIn(sub, token) ||
            findRowIn(popupRootFor(control), token) ||
            findRowInOpenMenus(token);
          if (row) {
            lastRow = row;
            triggerSendButton(interactiveTarget(row));
            next();
            return;
          }
          if (deep >= 6) {
            closeOpenPopup();
            finish(false, true);
            return;
          }
          window.setTimeout(() => lookInSub(deep + 1), 200);
        };
        window.setTimeout(() => lookInSub(0), 250);
        return;
      }
      // 首次展开弹层较慢时菜单还不在 DOM 里，多等几轮（约 2s），否则会在空菜单上白点一下
      if (attempt >= 8) {
        // 没找到就关掉菜单，不留一个弹层挡着用户
        const menuWasOpen = hasVisibleMenu();
        closeOpenPopup();
        finish(false, menuWasOpen);
        return;
      }
      window.setTimeout(() => step(attempt + 1), 250);
    };
    const next = () => {
      index += 1;
      if (index >= tokens.length) {
        finish(true);
        return;
      }
      // 下一层要重新展开弹层；先关掉，避免停在中间状态
      closeOpenPopup();
      window.setTimeout(() => {
        triggerSendButton(interactiveTarget(control));
        window.setTimeout(() => step(0), 350);
      }, 200);
    };
    applyingReasoning = true;
    triggerSendButton(interactiveTarget(control));
    window.setTimeout(() => step(0), 350);
  }

  /** Record a visible trigger-label change as a generic choice fallback. */
  function observeControlChoice(control, labelBefore, startedAt) {
    [400, 900, 1600, 2600].forEach((delay) => {
      window.setTimeout(() => {
        if (applyingReasoning || !control.isConnected) return;
        const labelNow = controlLabel(control);
        if (!labelNow || labelNow === labelBefore) return;
        const memory = loadReasoningMemory();
        const saved = readReasoningRecord(memory);
        if (saved && saved.mode === "choice") {
          // A path-aware record from this same click is richer than the label.
          if (startedAt && saved.ts && saved.ts >= startedAt) return;
          if (saved.option === labelNow) return;
        }
        writeReasoningRecord({
          mode: "choice",
          key: controlKey(control),
          controlLabel: labelBefore,
          option: labelNow,
          ts: Date.now(),
        });
        renderReasoningStatus();
      }, delay);
    });
  }

  /** Keep the post-click trigger label for fast, non-intrusive state checks. */
  function captureChoiceResult(trigger, record) {
    [300, 700, 1400, 2400].forEach((delay) => {
      window.setTimeout(() => {
        if (applyingReasoning || !trigger.isConnected) return;
        const labelNow = controlLabel(trigger);
        if (!labelNow || labelNow === record.controlLabel) return;
        const memory = loadReasoningMemory();
        const saved = readReasoningRecord(memory);
        if (!saved || saved.mode !== "choice" || saved.ts !== record.ts) return;
        if (saved.resultLabel === labelNow) return;
        saved.resultLabel = labelNow;
        saveReasoningMemory(memory);
        renderReasoningStatus();
      }, delay);
    });
  }

  /** Pair a menu row with its trigger and record the path to that choice. */
  function pairOptionClick(target) {
    const row = choiceRowForTarget(target);
    if (!row) return false;
    const trigger = reasoningMenuTrigger;
    if (!trigger || !trigger.isConnected) return false;
    if (Date.now() - reasoningMenuTriggerAt > 20000) return false;
    if (row === trigger || row.contains(trigger)) return false;
    const optionText = rowLabel(row);
    if (!optionText) return false;
    const menu = row.closest(REASONING_MENU_SELECTOR);
    const path = choicePathForRow(row);
    const explicitChoice = row.matches(CHOICE_RADIO_SELECTOR);
    // Top-level action rows have no selection marker and must not be recorded.
    if (!explicitChoice && !(path.length && menuHasSelectionState(menu))) {
      return false;
    }
    const triggerLabel = reasoningMenuTriggerLabel;
    const hint = rowHint(row);
    const ts = Date.now();
    const record = {
      mode: "choice",
      key: controlKey(trigger),
      controlLabel: triggerLabel,
      path,
      option: optionText,
      hint,
      ts,
    };
    window.setTimeout(() => {
      if (applyingReasoning) return;
      writeReasoningRecord(record);
      renderReasoningStatus();
      captureChoiceResult(trigger, record);
    }, 0);
    return true;
  }

  /** 用户点了页面上的推理控件就记下当前状态 */
  function handleReasoningClick(event) {
    if (isEngineDormant()) return;
    if (!state.rememberReasoning || applyingReasoning) return;
    const target = event.target;
    if (!(target instanceof Element) || isInsideTurboUI(target)) return;
    if (pairOptionClick(target)) return;
    // 弹层里的项不单独记：它的效果会体现在控件的文案上
    if (target.closest(REASONING_MENU_SELECTOR)) return;
    const control = target.closest(REASONING_CONTROL_SELECTOR);
    if (!control) return;

    const startedAt = Date.now();
    const labelBefore = controlLabel(control);
    if (!labelBefore) return;
    const keywordMatch = REASONING_CONTROL_PATTERN.test(labelBefore);
    // 不靠关键词也得是下拉/弹层触发器，否则“发送→停止”这类文案变化会被当成强度选择
    if (!keywordMatch && !isDropdownTrigger(control)) return;
    reasoningMenuTrigger = control;
    reasoningMenuTriggerAt = Date.now();
    reasoningMenuTriggerLabel = labelBefore;

    if (keywordMatch) {
      window.setTimeout(() => {
        if (applyingReasoning || !control.isConnected) return;
        const on = controlOnState(control);
        if (on === null) return; // 状态不可读，记了也安全不了
        writeReasoningRecord({ mode: "toggle", label: labelBefore, on, ts: Date.now() });
        renderReasoningStatus();
      }, 0);
    }

    observeControlChoice(control, labelBefore, startedAt);
  }

  // 点击被脱水的空白占位区即恢复该轮渲染，单向不回退
  function handleDehydratedClick(event) {
    if (isEngineDormant()) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const turnElement = target.closest(".ai-turbo-dehydrated");
    if (!turnElement) return;

    restoredTurns.add(turnElement);
    withSelfMutation(() => {
      turnElement.classList.remove("ai-turbo-dehydrated");
      turnElement.style.removeProperty("--turbo-cached-h");
    });
    fullTurnSyncRequested = true;
    requestUpdate();
  }

  function renderReasoningStatus() {
    if (!reasoningStatusNode) return;
    reasoningStatusNode.textContent = "";
    if (!state.rememberReasoning) {
      reasoningStatusNode.textContent = "推理记忆：已关闭";
      return;
    }
    const saved = readReasoningRecord();
    if (!saved || !saved.mode) {
      reasoningStatusNode.textContent =
        "推理记忆：未记录（在页面里点一次强度/模型选项即可）";
      return;
    }
    const pathText =
      saved.mode === "choice" && Array.isArray(saved.path) && saved.path.length
        ? `${saved.path.join(" / ")} / `
        : "";
    const shown =
      saved.mode === "choice"
        ? `${saved.controlLabel || "控件"} → ${pathText}${saved.option}`
        : `${saved.label}（${saved.on ? "开" : "关"}）`;
    reasoningStatusNode.textContent = `推理记忆：${shown} `;
    reasoningStatusNode.appendChild(
      el(
        "button",
        {
          type: "button",
          onclick: () => {
            clearReasoningRecord();
            renderReasoningStatus();
          },
        },
        ["清除"],
      ),
    );
  }

  /** 按记忆里的身份找回控件：key 优先，其次可见文案 */
  function findRememberedControl(saved) {
    const visible = Array.from(document.querySelectorAll(REASONING_CONTROL_SELECTOR)).filter(
      (node) => !isInsideTurboUI(node) && nodeVisible(node),
    );
    if (saved.key) {
      const byKey = visible.find((node) => controlKey(node) === saved.key);
      if (byKey) return byKey;
    }
    if (/,\s*currently\b/i.test(saved.key || "")) {
      const prefix = String(saved.key).split(/,\s*currently\b/i)[0].trim();
      const byAccessibleName = visible.find((node) => {
        const ariaLabel = node.getAttribute("aria-label") || "";
        return ariaLabel === saved.key || ariaLabel.startsWith(`${prefix},`);
      });
      if (byAccessibleName) return byAccessibleName;
    }
    if (saved.controlLabel) {
      const byLabel = visible.find((node) => controlLabel(node) === saved.controlLabel);
      if (byLabel) return byLabel;
      const byLabelPrefix = visible.find((node) =>
        controlLabel(node).startsWith(`${saved.controlLabel} `),
      );
      if (byLabelPrefix) return byLabelPrefix;
    }
    // 文案会随选择变化，最后退一步找最像推理/模型选择的控件
    return visible.find((node) => REASONING_CONTROL_PATTERN.test(controlLabel(node))) || null;
  }

  function applyReasoningMemory() {
    if (isEngineDormant()) {
      reasoningRestoreDone = true;
      return;
    }
    const saved = readReasoningRecord();
    if (!saved || !saved.mode) {
      reasoningRestoreDone = true;
      return;
    }
    const control = findRememberedControl(saved);
    if (!control) return; // 页还没渲染好，下次再试
    if (applyingReasoning) return; // 上一次还原还在进行中

    const stableKey = controlKey(control);
    if (saved.mode === "choice" && stableKey && saved.key !== stableKey) {
      saved.key = stableKey;
      writeReasoningRecord(saved);
    }

    if (saved.mode === "choice" && /,\s*currently\b/i.test(saved.option || "")) {
      const normalized = String(saved.option).replace(/^.*\bcurrently\s+/i, "").trim();
      if (normalized) {
        saved.option = normalized;
        writeReasoningRecord(saved);
      }
    }

    if (saved.mode === "choice" && saved.option) {
      if (choiceLooksApplied(saved, control)) {
        reasoningRestoreDone = true;
        return;
      }
      // Retry only transient failures; an unavailable saved option cannot appear later.
      const restore = Array.isArray(saved.path) ? restorePathChoice : restoreChoice;
      restore(saved, control, (ok, conclusive) => {
        // Retrying a record whose target row is missing only makes the menu flash open forever.
        reasoningRestoreDone = ok || conclusive === true;
      });
      return;
    }

    reasoningRestoreDone = true;
    if (saved.mode !== "toggle") return;
    const now = controlOnState(control);
    if (now === null || now === (saved.on === true)) return;
    applyingReasoning = true;
    triggerSendButton(control);
    window.setTimeout(() => {
      applyingReasoning = false;
    }, 500);
  }

  /** 渲染往往晚于脚本启动，所以有限次轮询，直到应用或超时 */
  function scheduleReasoningRestore() {
    window.clearInterval(reasoningRestoreTimer);
    reasoningRestoreDone = false;
    reasoningRestoreAttempts = 0;
    if (isEngineDormant()) return;
    if (!state.rememberReasoning) return;
    if (!readReasoningRecord()) return;
    reasoningRestoreTimer = window.setInterval(() => {
      reasoningRestoreAttempts += 1;
      applyReasoningMemory();
      if (reasoningRestoreDone || reasoningRestoreAttempts >= 120) {
        window.clearInterval(reasoningRestoreTimer);
      }
    }, 500);
  }

  function injectEngineStyles() {
    // The host may rebuild <head> during account switching, which drops the
    // style node with it. Reuse a live node, otherwise restore one so the HUD
    // never stays on screen without the engine stylesheet.
    const existingStyle = document.getElementById(STYLE_ID);
    if (existingStyle?.isConnected) return;
    existingStyle?.remove();

    const styleElement = document.createElement("style");
    styleElement.id = STYLE_ID;
    styleElement.textContent = `
      .ai-turbo-dehydrated {
        content-visibility: hidden !important;
        contain: layout paint style !important;
        contain-intrinsic-size: auto var(--turbo-cached-h, 120px) !important;
        /* 占位区可点击恢复：用不占地布局的 outline + 斜纹做可见提示 */
        cursor: pointer !important;
        outline: 1px dashed rgba(153, 166, 161, 0.45) !important;
        outline-offset: -1px !important;
        background-image: repeating-linear-gradient(
          45deg,
          rgba(153, 166, 161, 0.06) 0 6px,
          transparent 6px 14px
        ) !important;
      }
      .ai-turbo-dehydrated * {
        pointer-events: none !important;
      }

      .ai-turbo-code-bar {
        box-sizing: border-box !important;
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        min-height: 38px !important;
        padding: 5px 8px 5px 12px !important;
        margin: 14px 0 8px !important;
        background: #111619 !important;
        border: 1px solid rgba(153, 166, 161, 0.16) !important;
        border-radius: 10px !important;
        box-shadow: 0 5px 16px rgba(0, 0, 0, 0.14) !important;
        position: relative !important;
        z-index: 10 !important;
        transition: border-color 0.2s ease, box-shadow 0.2s ease !important;
      }

      .ai-turbo-code-bar-chatgpt {
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        flex: 0 0 auto !important;
        grid-column: 1 / -1 !important;
        align-self: stretch !important;
      }

      .ai-turbo-code-bar:hover {
        border-color: rgba(101, 210, 164, 0.3) !important;
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18) !important;
      }

      .ai-turbo-code-bar-meta {
        display: inline-flex !important;
        align-items: center !important;
        gap: 8px !important;
        min-width: 0 !important;
        overflow: hidden !important;
        font: 11px ui-monospace, SFMono-Regular, Menlo, monospace !important;
      }

      .ai-turbo-code-lang {
        font-weight: 700 !important;
        color: #72d6ab !important;
      }

      .ai-turbo-code-lines {
        color: #94a3b8 !important;
      }

      @keyframes ai-turbo-pulse {
        0% { opacity: 0.45; transform: scale(0.98); }
        50% { opacity: 1; transform: scale(1.02); }
        100% { opacity: 0.45; transform: scale(0.98); }
      }

      .ai-turbo-streaming-badge {
        display: inline-flex !important;
        align-items: center !important;
        gap: 4px !important;
        color: #34d399 !important;
        font-weight: 700 !important;
        animation: ai-turbo-pulse 1.3s infinite ease-in-out !important;
      }

      .ai-turbo-code-bar-actions {
        display: inline-flex !important;
        align-items: center !important;
        gap: 6px !important;
        flex: 0 0 auto !important;
      }

      .ai-turbo-code-toggle,
      .ai-turbo-code-copy {
        appearance: none !important;
        background: rgba(255, 255, 255, 0.035) !important;
        border: 1px solid rgba(153, 166, 161, 0.14) !important;
        color: #c9d2ce !important;
        padding: 5px 9px !important;
        border-radius: 7px !important;
        font: 600 10.5px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        cursor: pointer !important;
        transition: all 120ms ease !important;
      }

      .ai-turbo-code-toggle:hover,
      .ai-turbo-code-copy:hover {
        background: rgba(101, 210, 164, 0.08) !important;
        color: #72d6ab !important;
        border-color: rgba(101, 210, 164, 0.28) !important;
      }

      .ai-turbo-code-target {
        display: block !important;
        margin-top: 0 !important;
        border-radius: 10px !important;
      }

      .ai-turbo-code-target.ai-turbo-folded {
        max-height: ${CODE_PREVIEW_HEIGHT}px !important;
        overflow: hidden !important;
        position: relative !important;
      }

      .ai-turbo-code-target.ai-turbo-folded pre,
      .ai-turbo-code-target.ai-turbo-folded code,
      .ai-turbo-code-target.ai-turbo-folded .code-block-decoration + * {
        max-height: ${CODE_PREVIEW_HEIGHT}px !important;
        overflow: hidden !important;
      }

      .ai-turbo-code-target.ai-turbo-folded::after {
        content: "" !important;
        position: absolute !important;
        inset: auto 0 0 0 !important;
        height: 70px !important;
        background: linear-gradient(180deg, rgba(13, 18, 28, 0) 0%, rgba(13, 18, 28, 0.96) 100%) !important;
        pointer-events: none !important;
        z-index: 5 !important;
      }

      .ai-turbo-code-target.ai-turbo-expanded {
        max-height: none !important;
        overflow: visible !important;
      }

      .ai-turbo-code-target.ai-turbo-expanded pre,
      .ai-turbo-code-target.ai-turbo-expanded code,
      .ai-turbo-code-target.ai-turbo-expanded .code-block-decoration + * {
        max-height: none !important;
        overflow: visible !important;
      }

      /* 虚拟文件悬浮托盘样式 */
      .ai-turbo-vf-tray {
        position: fixed !important;
        z-index: 2147483645 !important;
        display: grid !important;
        gap: 7px !important;
        padding: 8px !important;
        box-sizing: border-box !important;
        background: rgba(14, 18, 20, 0.985) !important;
        border: 1px solid rgba(153, 166, 161, 0.19) !important;
        border-left: 2px solid rgba(101, 210, 164, 0.72) !important;
        border-radius: 12px !important;
        box-shadow:
          0 16px 36px rgba(0, 0, 0, 0.28),
          0 4px 10px rgba(0, 0, 0, 0.18) !important;
        color: #e7eeea !important;
        pointer-events: auto !important;
        opacity: 0 !important;
        visibility: hidden !important;
        transform: translateY(3px) !important;
        /* 平滑浮动动画，彻底消除文本框高度变动时的跳闪 */
        transition:
          bottom 120ms cubic-bezier(0.22, 1, 0.36, 1),
          left 120ms cubic-bezier(0.22, 1, 0.36, 1),
          max-height 90ms ease-out,
          opacity 120ms ease,
          transform 120ms ease,
          visibility 120ms ease !important;
        will-change: bottom, left, max-height !important;
      }

      .ai-turbo-vf-tray.is-positioned {
        opacity: 1 !important;
        visibility: visible !important;
        transform: translateY(0) !important;
      }

      .ai-turbo-vf-header {
        min-width: 0 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 12px !important;
        padding: 1px 3px 2px !important;
      }

      .ai-turbo-vf-heading {
        min-width: 0 !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 6px !important;
      }

      .ai-turbo-vf-heading-icon {
        width: 20px !important;
        height: 20px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        color: #72d6ab !important;
        border: 1px solid rgba(101, 210, 164, 0.22) !important;
        border-radius: 6px !important;
        background: rgba(101, 210, 164, 0.07) !important;
      }

      .ai-turbo-vf-heading-title {
        font: 650 11px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        color: #e7eeea !important;
      }

      .ai-turbo-vf-heading-count {
        min-width: 18px !important;
        height: 18px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 0 5px !important;
        border-radius: 6px !important;
        background: rgba(101, 210, 164, 0.09) !important;
        color: #72d6ab !important;
        font: 700 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace !important;
      }

      .ai-turbo-vf-heading-hint {
        flex: 0 0 auto !important;
        color: #69756f !important;
        font: 9.5px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      }

      .ai-turbo-vf-list {
        display: flex !important;
        flex-wrap: wrap !important;
        gap: 6px !important;
        min-width: 0 !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        scrollbar-width: thin !important;
      }

      .ai-turbo-vf-pill {
        min-width: 0 !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 7px !important;
        min-height: 34px !important;
        padding: 5px 7px 5px 8px !important;
        border: 1px solid rgba(153, 166, 161, 0.16) !important;
        border-radius: 9px !important;
        background: rgba(24, 29, 32, 0.96) !important;
        box-sizing: border-box !important;
        transition: background 120ms ease, border-color 120ms ease !important;
      }

      .ai-turbo-vf-pill:hover {
        background: rgba(29, 35, 38, 0.98) !important;
        border-color: rgba(101, 210, 164, 0.27) !important;
      }

      .ai-turbo-vf-file-icon {
        width: 24px !important;
        height: 24px !important;
        flex: 0 0 24px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        color: #9eaba5 !important;
        background: rgba(255, 255, 255, 0.035) !important;
        border: 1px solid rgba(153, 166, 161, 0.13) !important;
        border-radius: 7px !important;
      }

      .ai-turbo-vf-file-copy {
        min-width: 80px !important;
        max-width: 260px !important;
        display: grid !important;
        gap: 2px !important;
      }

      .ai-turbo-vf-name {
        display: block !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
        color: #e8eeeb !important;
        font: 550 11px/1.25 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      }

      .ai-turbo-vf-meta {
        display: block !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
        color: #68746f !important;
        font: 9px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace !important;
      }

      .ai-turbo-vf-badge {
        flex: 0 0 auto !important;
        display: inline-flex !important;
        align-items: center !important;
        height: 20px !important;
        padding: 0 6px !important;
        border-radius: 5px !important;
        background: rgba(101, 210, 164, 0.08) !important;
        border: 1px solid rgba(101, 210, 164, 0.14) !important;
        color: #72d6ab !important;
        font: 700 8px/1 ui-monospace, SFMono-Regular, Menlo, monospace !important;
        letter-spacing: 0.04em !important;
      }

      .ai-turbo-vf-actions {
        display: inline-flex !important;
        align-items: center !important;
        gap: 2px !important;
        margin-left: 2px !important;
      }

      .ai-turbo-vf-action {
        width: 26px !important;
        height: 26px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 0 !important;
        border: 0 !important;
        border-radius: 6px !important;
        background: transparent !important;
        color: #77827d !important;
        cursor: pointer !important;
        transition: background 120ms ease, color 120ms ease !important;
      }

      .ai-turbo-vf-action:hover {
        background: rgba(255, 255, 255, 0.055) !important;
        color: #d8e1dc !important;
      }

      .ai-turbo-vf-action-preview:hover {
        color: #72d6ab !important;
      }

      .ai-turbo-vf-action-delete:hover {
        color: #ef8c8c !important;
        background: rgba(239, 68, 68, 0.08) !important;
      }

      .ai-turbo-chat-capsule {
        display: inline-flex !important;
        align-items: center !important;
        gap: 8px !important;
        padding: 6px 14px !important;
        margin: 0 !important;
        max-width: min(100%, 680px) !important;
        background: #111619 !important;
        border: 1px solid rgba(153, 166, 161, 0.18) !important;
        border-left: 2px solid rgba(101, 210, 164, 0.7) !important;
        border-radius: 10px !important;
        box-shadow: 0 5px 16px rgba(0, 0, 0, 0.16) !important;
        user-select: none !important;
      }

      .ai-turbo-chat-file-row {
        display: flex !important;
        align-items: center !important;
        justify-content: flex-end !important;

        width: 100% !important;
        max-width: 100% !important;

        box-sizing: border-box !important;

        margin: 4px 0 6px !important;
        padding: 0 !important;

        min-width: 0 !important;

        pointer-events: auto !important;
      }

      .ai-turbo-chat-file-row .ai-turbo-chat-capsule {
        flex: 0 1 auto !important;
        min-width: 0 !important;
        max-width: min(680px, 100%) !important;
      }

      .ai-turbo-chat-capsule:hover {
        border-color: rgba(101, 210, 164, 0.3) !important;
      }

      .ai-turbo-modal-backdrop {
        position: fixed !important;
        inset: 0 !important;
        background: rgba(0, 0, 0, 0.72) !important;
        backdrop-filter: blur(8px) !important;
        -webkit-backdrop-filter: blur(8px) !important;
        z-index: 2147483646 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 24px !important;
        box-sizing: border-box !important;
      }

      @media (prefers-reduced-motion: reduce) {
        .ai-turbo-vf-tray,
        .ai-turbo-vf-pill,
        .ai-turbo-vf-action,
        .ai-turbo-code-bar,
        .ai-turbo-code-toggle,
        .ai-turbo-code-copy {
          transition: none !important;
        }
      }
    `;

    (document.head || document.documentElement).appendChild(styleElement);
  }

  function resolveLoadTone(totalTurns, messageLimit) {
    const loadRatio = messageLimit > 0 ? totalTurns / messageLimit : 0;
    if (loadRatio >= 1) return "critical";
    if (loadRatio >= LOAD_WARNING_RATIO) return "warning";
    return "normal";
  }

  function updateHudDashboard() {
    if (!hudStats) return;
    /* Rewriting identical text still invalidates style and paint. */
    const hudSignature = `${state.totalTurns}|${state.hiddenCount}|${state.foldedCodeCount}|${activeVirtualFiles.length}|${state.messageLimit}`;
    if (hudStats.signature === hudSignature) return;
    hudStats.signature = hudSignature;
    hudStats.total.textContent = String(state.totalTurns);
    hudStats.hidden.textContent = String(state.hiddenCount);
    hudStats.folded.textContent = String(state.foldedCodeCount);

    const loadProgress = Math.min(
      1,
      Math.max(0, state.totalTurns) / state.messageLimit,
    );
    const loadTone = resolveLoadTone(state.totalTurns, state.messageLimit);
    const loadToneLabel =
      loadTone === "critical"
        ? "已达到提醒上限"
        : loadTone === "warning"
          ? "接近提醒上限"
          : "负载正常";

    if (hudStats.pillRoot) {
      hudStats.pillRoot.dataset.loadTone = loadTone;
      hudStats.pillRoot.title = `长对话负载 ${state.totalTurns}/${state.messageLimit}（${loadToneLabel}，仅按消息数估算） · 消息 ${state.totalTurns} · 已脱水 ${state.hiddenCount} · 代码折叠 ${state.foldedCodeCount} · 虚拟文件 ${activeVirtualFiles.length}；点击打开面板，拖动可移动`;
      hudStats.pillRoot.setAttribute(
        "aria-label",
        `长对话负载 ${state.totalTurns}/${state.messageLimit}，${loadToneLabel}；消息 ${state.totalTurns}，已脱水 ${state.hiddenCount}，代码折叠 ${state.foldedCodeCount}，虚拟文件 ${activeVirtualFiles.length}；点击打开面板，拖动可移动`,
      );
    }
    if (hudStats.totalStatusItem) {
      hudStats.totalStatusItem.dataset.loadTone = loadTone;
    }
    if (hudStats.pillCount) {
      hudStats.pillCount.textContent = String(state.totalTurns);
    }
    if (hudStats.pillLimit) {
      hudStats.pillLimit.textContent = `/${state.messageLimit}`;
    }
    hudStats.pillLoadProgress?.setAttribute(
      "stroke-dashoffset",
      String(LOAD_RING_CIRCUMFERENCE * (1 - loadProgress)),
    );
  }

  function togglePanel(forceState) {
    ensureHUDMounted();
    if (!hudRootElement || !hudShadowRoot) return;

    state.hudOpen =
      typeof forceState === "boolean" ? forceState : !state.hudOpen;

    const backdrop = hudShadowRoot.querySelector("#backdrop");
    backdrop?.classList.toggle("open", state.hudOpen);

    if (state.hudOpen) {
      window.setTimeout(() => searchInput?.focus(), 60);
    }
  }

  function renderSearchResults(queryText) {
    if (!searchResultsBox) return;
    searchResultsBox.textContent = "";
    if (!queryText) return;

    const normalizedQuery = queryText.toLowerCase();
    const matches = state.indexedTurns
      .filter((record) => record.text.toLowerCase().includes(normalizedQuery))
      .slice(0, SEARCH_LIMIT);

    if (!matches.length) {
      searchResultsBox.appendChild(
        el("div", { className: "result-empty" }, ["没有匹配的消息"]),
      );
      return;
    }

    for (const record of matches) {
      const previewText = record.text || "（无文本）";
      const resultText =
        previewText.length > SEARCH_PREVIEW_LIMIT
          ? previewText.slice(0, SEARCH_PREVIEW_LIMIT) + "…"
          : previewText;
      const resultButton = el(
        "button",
        {
          type: "button",
          className: "result-item",
          onclick: () => {
            togglePanel(false);
            record.element.classList.remove("ai-turbo-dehydrated");
            record.element.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
            record.element.style.outline = "2px solid rgba(52, 211, 153, 0.85)";
            record.element.style.outlineOffset = "4px";

            window.setTimeout(() => {
              record.element.style.outline = "";
              record.element.style.outlineOffset = "";
            }, 1800);
          },
        },
        [`#${record.id + 1}  ${resultText}`],
      );
      searchResultsBox.appendChild(resultButton);
    }
  }

  function buildHUD() {
    if (isEngineDormant()) return;
    if (hudRootElement?.isConnected) return;

    const mountTarget = document.body || document.documentElement;
    if (!mountTarget) return;

    document.getElementById(HUD_ID)?.remove();

    hudRootElement = el("div", {
      id: HUD_ID,
      style:
        "all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;display:block!important;",
    });

    hudShadowRoot = hudRootElement.attachShadow({ mode: "open" });

    const styles = document.createElement("style");
    styles.textContent = `
      * { box-sizing: border-box; }
      button, input { font: inherit; }

      .docked-pill {
        --turbo-tone: #5eead4;
        --turbo-tone-strong: #34d399;
        --turbo-muted: #8ba39a;
        --turbo-surface: rgba(12, 18, 20, 0.97);
        --turbo-border: rgba(94, 234, 212, 0.3);
        --turbo-track: rgba(148, 163, 184, 0.22);
        --turbo-glow: rgba(16, 185, 129, 0.14);
        pointer-events: auto;
        position: fixed;
        display: grid;
        width: 48px;
        height: 48px;
        padding: 0;
        place-items: center;
        border-radius: 15px;
        background: var(--turbo-surface);
        border: 1px solid var(--turbo-border);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(255, 255, 255, 0.02) inset;
        color: var(--turbo-tone);
        font: 650 11px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        cursor: grab;
        user-select: none;
        touch-action: none;
        transition: background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
      }
      .docked-pill[data-load-tone="warning"] {
        --turbo-tone: #fbbf24;
        --turbo-tone-strong: #f59e0b;
        --turbo-muted: #c7a766;
        --turbo-surface: rgba(38, 29, 10, 0.97);
        --turbo-border: rgba(251, 191, 36, 0.52);
        --turbo-track: rgba(251, 191, 36, 0.18);
        --turbo-glow: rgba(245, 158, 11, 0.2);
      }
      .docked-pill[data-load-tone="critical"] {
        --turbo-tone: #fb7185;
        --turbo-tone-strong: #ef4444;
        --turbo-muted: #c99a9f;
        --turbo-surface: rgba(45, 13, 18, 0.97);
        --turbo-border: rgba(251, 113, 133, 0.58);
        --turbo-track: rgba(251, 113, 133, 0.2);
        --turbo-glow: rgba(239, 68, 68, 0.24);
      }
      .turbo-gauge { position: relative; display: grid; width: 40px; height: 40px; place-items: center; }
      .pill-load-ring { position: absolute; inset: 0; display: block; width: 40px; height: 40px; overflow: visible; }
      .pill-load-track { fill: none; stroke: var(--turbo-track); stroke-width: 2.4; }
      .pill-load-progress { fill: none; stroke: var(--turbo-tone-strong); stroke-width: 2.4; stroke-linecap: round; transition: stroke-dashoffset 220ms cubic-bezier(0.16, 1, 0.3, 1), stroke 180ms ease; }
      .turbo-readout { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; line-height: 1; pointer-events: none; }
      .turbo-count { color: var(--turbo-tone); font-size: 11px; font-weight: 850; letter-spacing: -0.45px; font-variant-numeric: tabular-nums; }
      .turbo-limit { color: var(--turbo-muted); font-size: 8px; font-weight: 700; letter-spacing: -0.3px; font-variant-numeric: tabular-nums; }
      .docked-pill:active { cursor: grabbing; }
      .docked-pill:hover {
        border-color: var(--turbo-tone);
        box-shadow: 0 10px 28px var(--turbo-glow), 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
        transform: translateY(-1px) scale(1.02);
      }

      .modal-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transition: opacity 180ms ease, visibility 180ms ease;
      }
      .modal-backdrop.open {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
      }

      .hud-panel {
        pointer-events: auto;
        width: 392px;
        max-width: 94vw;
        max-height: calc(100vh - 48px);
        overflow-y: auto;
        overscroll-behavior: contain;
        scrollbar-width: thin;
        scrollbar-color: rgba(148, 163, 184, 0.3) transparent;
        padding: 18px;
        border: 1px solid rgba(153, 166, 161, 0.19);
        border-radius: 14px;
        background: #0c1012;
        box-shadow: 0 26px 70px rgba(0, 0, 0, 0.48);
        color: #e2ebe6;
        transform: scale(0.96);
        transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .modal-backdrop.open .hud-panel { transform: scale(1); }

      @supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
        .hud-panel {
          background: rgba(12, 16, 18, 0.9);
          -webkit-backdrop-filter: blur(18px) saturate(140%);
          backdrop-filter: blur(18px) saturate(140%);
        }
      }

      .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
      .brand-title { font-size: 13px; font-weight: 700; color: #f8fafc; }
      .brand-subtitle { font-size: 10px; color: #64748b; margin-top: 1px; }
      .close-btn { background: transparent; border: 0; color: #64748b; cursor: pointer; padding: 4px; border-radius: 6px; }
      .close-btn:hover { color: #f8fafc; background: rgba(255, 255, 255, 0.08); }

      .status-strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 12px; }
      .status-item { padding: 9px; border: 1px solid rgba(153, 166, 161, 0.11); border-radius: 9px; background: #101517; text-align: center; }
      .status-label { font-size: 9px; color: #64748b; display: block; }
      .status-value { font-size: 14px; font-weight: 700; color: #e8efeb; margin-top: 2px; font-variant-numeric: tabular-nums; }
      .status-item[data-load-tone="warning"] { border-color: rgba(251, 191, 36, 0.32); background: rgba(251, 191, 36, 0.06); }
      .status-item[data-load-tone="warning"] .status-value { color: #fbbf24; }
      .status-item[data-load-tone="critical"] { border-color: rgba(251, 113, 133, 0.38); background: rgba(251, 113, 133, 0.07); }
      .status-item[data-load-tone="critical"] .status-value { color: #fb7185; }

      .section { padding-top: 10px; border-top: 1px solid rgba(153, 166, 161, 0.1); }
      .section-title { font-size: 10px; font-weight: 700; color: #68746f; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.04em; }
      .control-row { display: flex; align-items: center; justify-content: space-between; min-height: 32px; margin-bottom: 6px; font-size: 11px; color: #c9d3ce; }

      .stepper { display: inline-flex; align-items: center; border: 1px solid rgba(153, 166, 161, 0.15); border-radius: 8px; background: #0f1315; }
      .stepper button { width: 26px; height: 24px; border: 0; background: transparent; color: #94a3b8; cursor: pointer; }
      .stepper button:hover { background: rgba(101, 210, 164, 0.07); color: #72d6ab; }
      .stepper span { min-width: 28px; text-align: center; font-size: 11px; font-family: ui-monospace, monospace; }
      .limit-control { display: inline-flex; align-items: center; gap: 5px; }
      .limit-input { width: 54px; height: 24px; padding: 0 6px; border: 1px solid rgba(153, 166, 161, 0.15); border-radius: 7px; background: #0f1315; color: #e8efeb; font: 650 11px/1 ui-monospace, monospace; text-align: right; font-variant-numeric: tabular-nums; }
      .limit-input:hover { border-color: rgba(101, 210, 164, 0.28); }
      .limit-unit { color: #64748b; font-size: 10px; }

      .switch { position: relative; width: 34px; height: 20px; }
      .switch input { opacity: 0; width: 0; height: 0; }
      .slider { position: absolute; inset: 0; border-radius: 999px; background: rgba(148, 163, 184, 0.2); cursor: pointer; transition: 150ms; }
      .slider::before { content: ""; position: absolute; width: 14px; height: 14px; left: 3px; top: 3px; border-radius: 50%; background: #fff; transition: 150ms; }
      .switch input:checked + .slider { background: #10b981; }
      .switch input:checked + .slider::before { transform: translateX(14px); }

      .action-btn { width: 100%; height: 34px; margin-top: 10px; border: 1px solid rgba(153, 166, 161, 0.15); border-radius: 8px; background: #111719; color: #ccd6d1; font-size: 11px; font-weight: 600; cursor: pointer; transition: 140ms ease; }
      .action-btn:hover { background: rgba(101, 210, 164, 0.07); border-color: rgba(101, 210, 164, 0.25); color: #72d6ab; }
      .action-btn.copied { background: rgba(16, 185, 129, 0.2); color: #6ee7b7; border-color: rgba(52, 211, 153, 0.4); }
      .handoff-status { margin-top: 8px; color: #8da097; font-size: 10px; line-height: 1.5; overflow-wrap: anywhere; }
      .reasoning-status { margin-top: 6px; color: #8da097; font-size: 10px; line-height: 1.5; overflow-wrap: anywhere; }
      .reasoning-status:empty { display: none; }
      .reasoning-status button { margin-left: 6px; padding: 0 4px; border: 1px solid rgba(148, 163, 184, 0.25); border-radius: 4px; background: transparent; color: #72d6ab; font-size: 10px; line-height: 1.6; cursor: pointer; }
      .reasoning-status button:hover { border-color: rgba(101, 210, 164, 0.55); }

      .search-wrap { position: relative; margin-top: 8px; }
      .search-input { width: 100%; height: 34px; padding: 0 10px; border: 1px solid rgba(153, 166, 161, 0.16); border-radius: 8px; background: #0f1416; color: #e6eeea; font-size: 11px; outline: none; }
      .search-input:focus { border-color: rgba(101, 210, 164, 0.48); }
      .results { max-height: 120px; overflow-y: auto; margin-top: 6px; display: grid; gap: 4px; }
      .result-item, .result-empty { padding: 6px 8px; font-size: 10px; border-radius: 7px; background: #101517; color: #cbd5e1; border: none; text-align: left; cursor: pointer; }
      .result-item { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
      .result-item:hover { background: rgba(101, 210, 164, 0.07); color: #72d6ab; }
      .result-empty { text-align: center; color: #64748b; }
      .footer-hint { margin-top: 12px; font-size: 9.5px; color: #475569; text-align: center; }
      kbd { padding: 2px 4px; border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 4px; color: #94a3b8; font-family: ui-monospace, monospace; }

      .hud-panel button:focus-visible,
      .hud-panel input:focus-visible,
      .docked-pill:focus-visible { outline: 2px solid var(--turbo-tone, #65d2a4); outline-offset: 2px; }

      @media (prefers-reduced-motion: reduce) {
        .modal-backdrop, .hud-panel, .docked-pill, .pill-load-progress { transition: none !important; }
      }
    `;
    hudShadowRoot.appendChild(styles);

    const pillCountValue = el("strong", { className: "turbo-count" }, ["0"]);
    const pillLimitValue = el("span", { className: "turbo-limit" }, [
      `/${state.messageLimit}`,
    ]);

    const svgNamespace = "http://www.w3.org/2000/svg";
    const pillLoadRing = document.createElementNS(svgNamespace, "svg");
    pillLoadRing.setAttribute("class", "pill-load-ring");
    pillLoadRing.setAttribute("viewBox", "0 0 40 40");
    pillLoadRing.setAttribute("aria-hidden", "true");

    const pillLoadTrack = document.createElementNS(svgNamespace, "circle");
    pillLoadTrack.setAttribute("class", "pill-load-track");
    pillLoadTrack.setAttribute("cx", "20");
    pillLoadTrack.setAttribute("cy", "20");
    pillLoadTrack.setAttribute("r", String(LOAD_RING_RADIUS));

    const pillLoadProgress = document.createElementNS(svgNamespace, "circle");
    pillLoadProgress.setAttribute("class", "pill-load-progress");
    pillLoadProgress.setAttribute("cx", "20");
    pillLoadProgress.setAttribute("cy", "20");
    pillLoadProgress.setAttribute("r", String(LOAD_RING_RADIUS));
    pillLoadProgress.setAttribute(
      "stroke-dasharray",
      String(LOAD_RING_CIRCUMFERENCE),
    );
    pillLoadProgress.setAttribute(
      "stroke-dashoffset",
      String(LOAD_RING_CIRCUMFERENCE),
    );
    pillLoadProgress.setAttribute("transform", "rotate(-90 20 20)");

    pillLoadRing.append(pillLoadTrack, pillLoadProgress);

    const pill = el(
      "button",
      {
        className: "docked-pill",
        id: "pill-trigger",
        type: "button",
        "data-load-tone": "normal",
        title: `长对话负载 0/${state.messageLimit}（负载正常，仅按消息数估算） · 消息 0 · 已脱水 0 · 代码折叠 0 · 虚拟文件 0；点击打开面板，拖动可移动`,
        "aria-label": `长对话负载 0/${state.messageLimit}，负载正常；消息 0，已脱水 0，代码折叠 0，虚拟文件 0；点击打开面板，拖动可移动`,
      },
      [
        el("span", { className: "turbo-gauge", "aria-hidden": "true" }, [
          pillLoadRing,
          el("span", { className: "turbo-readout" }, [
            pillCountValue,
            pillLimitValue,
          ]),
        ]),
      ],
    );

    const totalVal = el(
      "strong",
      { className: "status-value", id: "total-val" },
      ["0"],
    );
    const hiddenVal = el(
      "strong",
      { className: "status-value", id: "hidden-val" },
      ["0"],
    );
    const foldedVal = el(
      "strong",
      { className: "status-value", id: "folded-val" },
      ["0"],
    );

    const totalStatusItem = el("div", { className: "status-item" }, [
      el("span", { className: "status-label" }, ["消息总数"]),
      totalVal,
    ]);

    const statusStrip = el("div", { className: "status-strip" }, [
      totalStatusItem,
      el("div", { className: "status-item" }, [
        el("span", { className: "status-label" }, ["已脱水"]),
        hiddenVal,
      ]),
      el("div", { className: "status-item" }, [
        el("span", { className: "status-label" }, ["代码折叠"]),
        foldedVal,
      ]),
    ]);

    const keepVal = el("span", { id: "keep-val" }, [String(state.keepTurns)]);
    const stepDec = el(
      "button",
      {
        type: "button",
        onclick: () => {
          if (state.keepTurns <= 2) return;
          state.keepTurns--;
          keepVal.textContent = String(state.keepTurns);
          saveCurrentConfig();
          fullTurnSyncRequested = true;
          requestUpdate();
        },
      },
      ["−"],
    );
    const stepInc = el(
      "button",
      {
        type: "button",
        onclick: () => {
          if (state.keepTurns >= 50) return;
          state.keepTurns++;
          keepVal.textContent = String(state.keepTurns);
          saveCurrentConfig();
          fullTurnSyncRequested = true;
          requestUpdate();
        },
      },
      ["+"],
    );

    const messageLimitInput = el("input", {
      className: "limit-input",
      id: "message-limit",
      type: "number",
      min: String(MESSAGE_LIMIT_MIN),
      max: String(MESSAGE_LIMIT_MAX),
      step: "1",
      value: String(state.messageLimit),
      title: `消息提醒上限，范围 ${MESSAGE_LIMIT_MIN} 至 ${MESSAGE_LIMIT_MAX}`,
      "aria-label": "消息提醒上限",
      onchange: () => {
        const rawValue = messageLimitInput.value.trim();
        if (rawValue === "") {
          messageLimitInput.value = String(state.messageLimit);
          return;
        }
        const numericLimit = Number(rawValue);
        if (
          !Number.isInteger(numericLimit) ||
          numericLimit < MESSAGE_LIMIT_MIN ||
          numericLimit > MESSAGE_LIMIT_MAX
        ) {
          messageLimitInput.value = String(state.messageLimit);
          return;
        }
        state.messageLimit = numericLimit;
        messageLimitInput.value = String(state.messageLimit);
        saveCurrentConfig();
        updateHudDashboard();
      },
    });

    const chkPrune = el("input", {
      type: "checkbox",
      checked: state.pruneEnabled ? "checked" : "",
      onchange: () => {
        state.pruneEnabled = chkPrune.checked;
        saveCurrentConfig();
        fullTurnSyncRequested = true;
        requestUpdate();
      },
    });

    const chkCollapse = el("input", {
      type: "checkbox",
      checked: state.collapseCode ? "checked" : "",
      onchange: () => {
        state.collapseCode = chkCollapse.checked;
        saveCurrentConfig();
        codeScanRequested = true;
        requestUpdate();
      },
    });

    const chkVirtualFile = el("input", {
      type: "checkbox",
      checked: state.virtualFileEnabled ? "checked" : "",
      onchange: () => {
        state.virtualFileEnabled = chkVirtualFile.checked;
        saveCurrentConfig();
        if (!state.virtualFileEnabled) {
          activeVirtualFiles = [];
          trayIsDirty = true;
          renderVirtualFileTray();
        }
      },
    });

    const chkReasoning = el("input", {
      type: "checkbox",
      checked: state.rememberReasoning ? "checked" : "",
      onchange: () => {
        state.rememberReasoning = chkReasoning.checked;
        saveCurrentConfig();
        // 关闭时也要调用：它会先清掉轮询定时器
        scheduleReasoningRestore();
        renderReasoningStatus();
      },
    });

    const forkText = el("span", { id: "fork-text" }, [
      "复制原始上下文（回退）",
    ]);
    const btnFork = el(
      "button",
      {
        className: "action-btn",
        type: "button",
        onclick: () => {
          exportCleanContext((count) => {
            btnFork.classList.add("copied");
            forkText.textContent = `已复制 ${count} 条完整消息`;
            window.setTimeout(() => {
              btnFork.classList.remove("copied");
              forkText.textContent = "复制原始上下文（回退）";
            }, 2200);
          });
        },
      },
      [forkText],
    );

    const btnOneClickHandoff = el(
      "button",
      {
        className: "action-btn",
        type: "button",
        onclick: startOneClickHandoff,
      },
      ["一键交接（生成并恢复）"],
    );
    handoffStatusNode = el(
      "div",
      { className: "handoff-status", role: "status", "aria-live": "polite" },
      ["交接状态：未开始"],
    );

    const strategySection = el("div", { className: "section" }, [
      el("div", { className: "section-title" }, ["引擎策略"]),
      el("div", { className: "control-row" }, [
        el("span", {}, ["活跃保留轮次"]),
        el("div", { className: "stepper" }, [stepDec, keepVal, stepInc]),
      ]),
      el("div", { className: "control-row" }, [
        el("label", { htmlFor: "message-limit" }, ["消息提醒上限"]),
        el("div", { className: "limit-control" }, [
          messageLimitInput,
          el("span", { className: "limit-unit" }, ["条"]),
        ]),
      ]),
      el("div", { className: "control-row" }, [
        el("span", {}, ["安全视口脱水"]),
        el("label", { className: "switch" }, [
          chkPrune,
          el("span", { className: "slider" }),
        ]),
      ]),
      el("div", { className: "control-row" }, [
        el("span", {}, ["长代码自动折叠"]),
        el("label", { className: "switch" }, [
          chkCollapse,
          el("span", { className: "slider" }),
        ]),
      ]),
      el("div", { className: "control-row" }, [
        el("span", {}, ["长文本伪文件胶囊"]),
        el("label", { className: "switch" }, [
          chkVirtualFile,
          el("span", { className: "slider" }),
        ]),
      ]),
      el("div", { className: "control-row" }, [
        el("span", {}, ["记住推理强度"]),
        el("label", { className: "switch" }, [
          chkReasoning,
          el("span", { className: "slider" }),
        ]),
      ]),
      reasoningStatusNode = el("div", { className: "reasoning-status", role: "status" }, []),
    ]);

    const handoffSection = el("div", { className: "section" }, [
      el("div", { className: "section-title" }, ["上下文交接"]),
      btnOneClickHandoff,
      handoffStatusNode,
      btnFork,
    ]);

    searchInput = el("input", {
      className: "search-input",
      type: "text",
      placeholder: "检索当前会话内容...",
      autocomplete: "off",
      oninput: () => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = window.setTimeout(() => {
          renderSearchResults(searchInput.value.trim());
        }, 100);
      },
    });
    searchResultsBox = el("div", { className: "results" });

    const searchSection = el("div", { className: "section" }, [
      el("div", { className: "section-title" }, ["历史检索"]),
      el("div", { className: "search-wrap" }, [searchInput]),
      searchResultsBox,
    ]);

    const btnClose = el(
      "button",
      {
        className: "close-btn",
        type: "button",
        "aria-label": "关闭",
        onclick: () => togglePanel(false),
      },
      ["✕"],
    );

    const panelHeader = el("div", { className: "header" }, [
      el("div", {}, [
        el("div", { className: "brand-title" }, ["AI Turbo Engine"]),
        el("div", { className: "brand-subtitle" }, [
          `${currentPlatform.name} · v${VERSION}`,
        ]),
      ]),
      btnClose,
    ]);

    const footerHint = el("div", { className: "footer-hint" }, [
      el("kbd", {}, ["Alt"]),
      " + ",
      el("kbd", {}, ["T"]),
      " 呼出 / 收起 · ",
      el("kbd", {}, ["Esc"]),
      " 退出",
    ]);

    const panel = el("div", { className: "hud-panel", id: "panel" }, [
      panelHeader,
      statusStrip,
      strategySection,
      handoffSection,
      searchSection,
      footerHint,
    ]);

    const backdrop = el(
      "div",
      {
        className: "modal-backdrop",
        id: "backdrop",
        onclick: (e) => {
          if (e.target === backdrop) togglePanel(false);
        },
      },
      [panel],
    );

    hudShadowRoot.append(pill, backdrop);
    mountTarget.appendChild(hudRootElement);

    hudStats = {
      total: totalVal,
      hidden: hiddenVal,
      folded: foldedVal,
      totalStatusItem,
      pillRoot: pill,
      pillCount: pillCountValue,
      pillLimit: pillLimitValue,
      pillLoadProgress,
    };
    updateHudDashboard();

    initPillDrag(pill);
  }

  function initPillDrag(pill) {
    if (!pill) return;

    const pillWidth = pill.offsetWidth || 48;
    const pillHeight = pill.offsetHeight || 48;
    const maxX = Math.max(8, window.innerWidth - pillWidth - 8);
    const maxY = Math.max(8, window.innerHeight - pillHeight - 8);
    let posX = maxX;
    let posY = maxY;

    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_POS) || "null");
      if (saved && typeof saved.x === "number" && typeof saved.y === "number") {
        posX = Math.min(maxX, Math.max(8, saved.x));
        posY = Math.min(maxY, Math.max(8, saved.y));
      }
    } catch (_) {}

    pill.style.left = `${posX}px`;
    pill.style.top = `${posY}px`;

    let dragging = false;
    let startX = 0,
      startY = 0;
    let originX = 0,
      originY = 0;

    const onPointerMove = (e) => {
      if (!dragging) return;
      const nextX = Math.max(
        8,
        Math.min(
          window.innerWidth - pill.offsetWidth - 8,
          originX + e.clientX - startX,
        ),
      );
      const nextY = Math.max(
        8,
        Math.min(
          window.innerHeight - pill.offsetHeight - 8,
          originY + e.clientY - startY,
        ),
      );
      pill.style.left = `${nextX}px`;
      pill.style.top = `${nextY}px`;
    };

    const onPointerUp = (e) => {
      if (!dragging) return;
      dragging = false;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);

      if (
        Math.abs(e.clientX - startX) < 4 &&
        Math.abs(e.clientY - startY) < 4
      ) {
        togglePanel(true);
        return;
      }

      try {
        const rect = pill.getBoundingClientRect();
        localStorage.setItem(
          STORAGE_KEY_POS,
          JSON.stringify({ x: rect.left, y: rect.top }),
        );
      } catch (_) {}
    };

    pill.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = pill.getBoundingClientRect();
      originX = rect.left;
      originY = rect.top;
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    });
  }

  function exportCleanContext(onSuccess) {
    const turns = getTurns();
    if (!turns.length) {
      window.alert("未检测到有效对话内容");
      return;
    }

    const sections = [];
    turns.forEach((turnElement, index) => {
      const contentText = extractTurnText(turnElement);
      if (contentText) {
        const role = getTurnRole(turnElement) === "user" ? "用户" : "助手";
        sections.push(`### ${role} · Message ${index + 1}\n\n${contentText}`);
      }
    });

    if (!sections.length) {
      window.alert("当前页面没有可提取的文本");
      return;
    }

    const markdown = [
      `# 会话上下文提取 [${currentPlatform.name}]`,
      "",
      `> 提取时间: ${new Date().toLocaleString()}`,
      "",
      sections.join("\n\n---\n\n"),
      "",
    ].join("\n");

    navigator.clipboard
      .writeText(markdown)
      .then(() => {
        if (typeof onSuccess === "function") onSuccess(sections.length);
      })
      .catch(() => {
        window.alert("写入剪贴板失败，请检查浏览器权限。");
      });
  }

  function buildHandoffGenerationPrompt() {
    return [
      "请对本次对话做一次完整复盘，然后严格按照下面的纯文本格式输出交接包。",
      "严格规则：",
      "1. 不要使用 Markdown 代码块，不要添加任何解释、客套话或标题。",
      "2. 从 [META] 开始，到 [END] 结束；顺序不得调整。",
      "3. 每个字段形如 `字段名: 内容`；内容如有多项，用 | 分隔；没有内容的字段写「无」。",
      "4. 信息必须准确、自包含，不要编造。内容尽量精炼。",
      "",
      "[META]",
      "version: 1.0",
      "generated_at: <当前时间>",
      "source_model: <模型名>",
      "language: zh-CN",
      "",
      "[TASK]",
      "objective: <任务目标，一句话>",
      "success_criteria: <成功标准>",
      "current_status: <当前状态>",
      "",
      "[DECISIONS]",
      "confirmed: <已确认决策>",
      "rejected: <已否决方案>",
      "assumptions: <关键假设>",
      "",
      "[PROGRESS]",
      "done: <已完成事项>",
      "in_progress: <进行中事项>",
      "next_actions: <下一步行动>",
      "",
      "[ROLE]",
      "persona: <角色设定>",
      "tone: <语气风格>",
      "response_format: <回复格式>",
      "boundaries: <边界>",
      "",
      "[CONTEXT]",
      "tools: <工具>",
      "tech_stack: <技术栈>",
      "files: <文件>",
      "data: <数据>",
      "constraints: <约束>",
      "",
      "[OPEN_ISSUES]",
      "questions: <待确认问题>",
      "risks: <风险>",
      "blockers: <阻碍>",
      "",
      "[KEY_ENTITIES]",
      "people: <人物>",
      "projects: <项目>",
      "terms: <术语>",
      "",
      "[HANDOFF_NOTES]",
      "<自由补充信息>",
      "",
      "[END]",
    ].join("\n");
  }

  function buildHandoffRestorePrompt(handoffText, kind = "plain") {
    const intro = [
      "你将接收一份「上下文交接包」，用于恢复此前会话的工作状态。请按以下步骤操作：",
      "",
      "1. 直接读取下面交接包的全部字段（这是纯文本格式，不是代码，无需当作代码解析）。",
      "2. 用简短摘要确认：任务目标 / 当前状态 / 已确认决策 / 已排除方案 / 下一步 / 你的角色。",
      "3. 确认后直接进入该角色，从 [PROGRESS].next_actions 的第一项开始继续工作，不要重新询问已有信息。",
      "4. 若 [OPEN_ISSUES].questions 非空，先按优先级列出并询问先处理哪一个；否则直接执行下一步。",
      "5. 字段值为「无」或空时表示该项无内容，不要追问。",
      "",
    ];
    if (kind === "yaml") {
      intro.push(
        "（注：以下是旧版 YAML 交接包，可直接当作纯文本阅读，无需严格 YAML 解析。）",
      );
      intro.push("");
    }
    intro.push("===== 交接包开始 =====");
    intro.push(String(handoffText || "").trim());
    intro.push("===== 交接包结束 =====");
    return intro.join("\n");
  }

  function getComposerText(inputElement) {
    if (
      inputElement instanceof HTMLTextAreaElement ||
      inputElement instanceof HTMLInputElement
    ) {
      return inputElement.value || "";
    }
    return inputElement?.innerText || inputElement?.textContent || "";
  }

  function setHandoffStatus(message) {
    if (handoffStatusNode) handoffStatusNode.textContent = message;
  }

  function isHandoffYamlShape(yamlText) {
    const yaml = String(yamlText || "").trim();
    if (!yaml.startsWith("meta:")) return false;
    const requiredSections = [
      "meta",
      "task",
      "decisions",
      "progress",
      "role",
      "context",
      "open_issues",
      "key_entities",
      "handoff_notes",
    ];
    return requiredSections.every((section) =>
      new RegExp("^" + section + ":\\s*$", "m").test(yaml),
    );
  }

  function isPlainHandoffShape(text) {
    const t = String(text || "").trim();
    if (!t.includes(PLAIN_HANDOFF_START)) return false;
    if (!t.includes(PLAIN_HANDOFF_END)) return false;
    const hitCount = PLAIN_HANDOFF_SECTIONS.filter((s) => t.includes(s)).length;
    return hitCount >= PLAIN_HANDOFF_SECTIONS.length - PLAIN_HANDOFF_TOLERANCE;
  }

  function normalizePlainHandoff(candidate) {
    if (!candidate) return null;
    const text = String(candidate)
      .trim()
      .replace(/^```(?:yaml|yml|txt|text|markdown|md|plain)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    return isPlainHandoffShape(text) ? text : null;
  }

  function normalizeHandoffYaml(candidate) {
    if (!candidate) return null;
    const yaml = String(candidate)
      .trim()
      .replace(/^```(?:yaml|yml)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    return isHandoffYamlShape(yaml) ? yaml : null;
  }

  function extractLatestHandoffText() {
    const turns = getTurns();
    let latestAssistantTurn = null;

    for (let index = turns.length - 1; index >= 0; index--) {
      if (getTurnRole(turns[index]) === "assistant") {
        latestAssistantTurn = turns[index];
        break;
      }
    }
    if (!latestAssistantTurn) return null;

    // 1) 优先检查代码块（有些平台仍会自动包裹，即使要求不用）
    const codeElements = Array.from(
      latestAssistantTurn.querySelectorAll("pre code, pre, code, code-block"),
    );
    for (const codeElement of codeElements) {
      if (isReasoningElement(codeElement)) continue;
      const codeText = codeElement.textContent || "";
      const plain = normalizePlainHandoff(codeText);
      if (plain) return { kind: "plain", text: plain };
      const yaml = normalizeHandoffYaml(codeText);
      if (yaml) return { kind: "yaml", text: yaml };
    }

    // 2) 完整消息文本（先按 fenced 代码块切，再做整体兜底）
    const fullText = extractTurnText(latestAssistantTurn);

    const fencedMatches = Array.from(
      fullText.matchAll(
        /```(?:yaml|yml|txt|text|markdown|md)?\s*([\s\S]*?)\s*```/gi,
      ),
    );
    for (const match of fencedMatches) {
      const plain = normalizePlainHandoff(match[1]);
      if (plain) return { kind: "plain", text: plain };
      const yaml = normalizeHandoffYaml(match[1]);
      if (yaml) return { kind: "yaml", text: yaml };
    }

    // 3) 整体文本兜底（处理 AI 直接把标记铺在消息里、没有任何代码块的情况）
    const plain = normalizePlainHandoff(fullText);
    if (plain) return { kind: "plain", text: plain };
    const yaml = normalizeHandoffYaml(fullText);
    if (yaml) return { kind: "yaml", text: yaml };

    return null;
  }

  // 保留旧函数名，兼容内部旧调用；内部转为提取纯文本
  function extractLatestHandoffYaml() {
    const result = extractLatestHandoffText();
    return result ? result.text : null;
  }

  function copyHandoffText(text, successMessage) {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API is unavailable");
      }
      navigator.clipboard
        .writeText(text)
        .then(() => setHandoffStatus(successMessage))
        .catch(() => {
          setHandoffStatus("剪贴板写入失败，请检查浏览器权限。");
          window.alert(
            "无法写入剪贴板，请检查浏览器权限，或手动选择对应内容。",
          );
        });
    } catch (_) {
      setHandoffStatus("剪贴板不可用，请检查浏览器权限。");
      window.alert(
        "当前页面无法访问剪贴板。请检查浏览器权限，或手动选择对应内容。",
      );
    }
  }

  function copyLatestHandoffYaml() {
    const yamlText = extractLatestHandoffYaml();
    if (!yamlText) {
      setHandoffStatus("尚未检测到最新助手回答中的完整 YAML。");
      window.alert(
        "未找到符合交接包结构的 YAML。请等待助手回答完整结束后重试。",
      );
      return;
    }
    copyHandoffText(
      yamlText,
      `已复制 YAML 交接包（${yamlText.length.toLocaleString()} 字符）。`,
    );
  }

  function copyLatestHandoffText() {
    const result = extractLatestHandoffText();
    if (!result) {
      setHandoffStatus("尚未检测到最新助手回答中的完整交接包。");
      window.alert(
        "未找到可识别的交接包。\n\n" +
          "请确认：\n" +
          "1. AI 回答已完整结束；\n" +
          "2. 内容中同时包含 [META] 与 [END]。\n\n" +
          "若缺失，请点「发送 YAML 交接指令」让 AI 重新生成。",
      );
      return;
    }
    const kindLabel = result.kind === "yaml" ? "旧版 YAML" : "纯文本";
    copyHandoffText(
      result.text,
      `已复制交接包（${kindLabel}，${result.text.length.toLocaleString()} 字符）。`,
    );
  }

  // 兼容旧函数名（面板按钮仍叫 copyLatestHandoffYaml）
  function copyLatestHandoffYaml() {
    copyLatestHandoffText();
  }

  function copyLatestRestorePrompt() {
    const result = extractLatestHandoffText();
    if (!result) {
      setHandoffStatus("尚未检测到完整交接包。");
      window.alert("未找到可识别的交接包。请等待回答完整结束后重试。");
      return;
    }
    const restoreText = buildHandoffRestorePrompt(result.text, result.kind);
    copyHandoffText(
      restoreText,
      `已复制新对话恢复指令（${restoreText.length.toLocaleString()} 字符）。`,
    );
  }

  function findNewChatControl() {
    const selectors = [
      'button[data-testid*="new-chat" i]',
      'button[data-testid*="new_chat" i]',
      'button[data-testid*="new-conversation" i]',
      '[role="button"][data-testid*="new-chat" i]',
      'button[aria-label*="new chat" i]',
      'button[aria-label*="new conversation" i]',
      'button[aria-label*="start new chat" i]',
      'a[aria-label*="new chat" i]',
      'button[title*="new chat" i]',
      'button[title*="new conversation" i]',
      'button[aria-label*="新建对话"]',
      'button[aria-label*="新对话"]',
      'button[aria-label*="新建聊天"]',
      'button[title*="新建对话"]',
      'button[title*="新对话"]',
      'a[aria-label*="新对话"]',
    ];

    for (const selector of selectors) {
      let controls = [];
      try {
        controls = Array.from(document.querySelectorAll(selector));
      } catch (_) {}
      const found = controls.find(
        (control) =>
          control instanceof HTMLElement &&
          control.isConnected &&
          control.getAttribute("target") !== "_blank" &&
          (control.offsetParent !== null ||
            control.getClientRects().length > 0),
      );
      if (found) return found;
    }

    const exactLabels = new Set([
      "new chat",
      "new conversation",
      "new thread",
      "start new chat",
      "新建对话",
      "新对话",
      "新建聊天",
      "开始新对话",
      "开启新对话",
    ]);
    return (
      Array.from(document.querySelectorAll("button, a, [role='button']")).find(
        (control) => {
          if (
            !(control instanceof HTMLElement) ||
            !control.isConnected ||
            control.getAttribute("target") === "_blank" ||
            !(
              control.offsetParent !== null ||
              control.getClientRects().length > 0
            )
          ) {
            return false;
          }
          const label = [
            control.getAttribute("aria-label") || "",
            control.getAttribute("title") || "",
            control.innerText || control.textContent || "",
          ]
            .join(" ")
            .trim()
            .toLowerCase();
          return exactLabels.has(label);
        },
      ) || null
    );
  }

  function resumePendingHandoffPrompt() {
    if (isEngineDormant()) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      let pending = null;
      try {
        pending = JSON.parse(
          sessionStorage.getItem(HANDOFF_STORAGE_KEY) || "null",
        );
      } catch (_) {}
      if (!pending || typeof pending.text !== "string") {
        window.clearInterval(timer);
        return;
      }

      if (Date.now() - (pending.createdAt || 0) > 5 * 60 * 1000) {
        sessionStorage.removeItem(HANDOFF_STORAGE_KEY);
        window.clearInterval(timer);
        return;
      }

      const currentTurns = getTurns().length;
      const isNewConversation =
        window.location.href !== pending.sourceUrl ||
        (pending.sourceTurns > 0 && currentTurns === 0);
      attempts++;

      if (isNewConversation) {
        const input = getChatInput();
        if (input) {
          if (getComposerText(input).trim()) {
            navigator.clipboard
              .writeText(pending.text)
              .then(() => {
                setHandoffStatus(
                  "新对话输入框已有草稿，恢复指令已复制到剪贴板。",
                );
                window.alert(
                  "新对话输入框已有未发送内容。为避免覆盖草稿，已将恢复指令复制到剪贴板，请手动粘贴。",
                );
              })
              .catch(() => {
                window.alert(
                  "无法覆盖新对话中的已有草稿。请保留草稿后手动粘贴恢复指令。",
                );
              });
          } else {
            insertTextAtomic(input, pending.text);
            input.focus();
            setHandoffStatus("恢复指令已填入新对话；检查 YAML 后手动发送。");
          }
          sessionStorage.removeItem(HANDOFF_STORAGE_KEY);
          window.clearInterval(timer);
          return;
        }
      }

      if (attempts >= 120) {
        sessionStorage.removeItem(HANDOFF_STORAGE_KEY);
        window.clearInterval(timer);
        navigator.clipboard
          .writeText(pending.text)
          .then(() => {
            setHandoffStatus("未识别到新对话输入框，恢复指令已复制到剪贴板。");
            window.alert(
              "未能可靠识别新对话输入框。完整恢复指令已复制，请手动打开新对话并粘贴。",
            );
          })
          .catch(() => {
            window.alert(
              "未能识别新对话输入框，也无法写入剪贴板。请回到原回答手动复制 YAML。",
            );
          });
      }
    }, 250);
  }

  function startHandoffGeneration() {
    const prompt = buildHandoffGenerationPrompt();
    const input = getChatInput();

    if (!input) {
      navigator.clipboard
        .writeText(prompt)
        .then(() => {
          setHandoffStatus("未识别当前输入框，生成指令已复制。");
          window.alert(
            "未识别到当前网站的输入框。生成指令已复制，请手动粘贴并发送。",
          );
        })
        .catch(() => window.alert("未能识别输入框，也无法写入剪贴板。"));
      return;
    }

    if (getComposerText(input).trim()) {
      navigator.clipboard
        .writeText(prompt)
        .then(() => {
          setHandoffStatus("当前输入框有草稿；生成指令已复制，未覆盖草稿。");
          window.alert(
            "当前输入框已有未发送内容。为避免覆盖草稿，生成指令已复制，请先处理现有草稿，再手动粘贴发送。",
          );
        })
        .catch(() => window.alert("当前输入框有草稿，且无法复制生成指令。"));
      return;
    }

    // 插入指令
    insertTextAtomic(input, prompt);

    // ★ 关键改造：插入后验证平台是否过滤了关键标记
    window.setTimeout(() => {
      const actual = getComposerText(input);
      const mustSurvive = [
        PLAIN_HANDOFF_START,
        "[TASK]",
        "[PROGRESS]",
        PLAIN_HANDOFF_END,
      ];
      const survived = mustSurvive.every((marker) => actual.includes(marker));

      if (!survived) {
        // 平台过滤 / 截断 —— 自动复制到剪贴板并详细提示
        navigator.clipboard
          .writeText(prompt)
          .then(() => {
            setHandoffStatus("检测到平台过滤了交接指令，已复制到剪贴板。");
            window.alert(
              "检测到当前平台可能过滤了交接指令内容。\n\n" +
                "生成指令已完整复制到剪贴板。请手动粘贴并发送。\n\n" +
                "若仍然发不出去，请尝试以下方式：\n" +
                "1. 分两次发送：先粘贴到 [PROGRESS] 结尾，发送后再补发其余部分；\n" +
                "2. 检查输入框是否有长度限制；\n" +
                "3. 用一句中文描述让 AI 先复述格式，再粘贴具体字段。",
            );
          })
          .catch(() => {
            window.alert(
              "检测到平台过滤了交接指令，且无法写入剪贴板。请手动重试。",
            );
          });
        return;
      }

      // 插入成功，执行发送
      isSubmitting = true;
      setHandoffStatus("已填入生成指令，正在发送……");
      const baselineTurns = getTurns().length;

      sendWithRetry(input, (sent) => {
        isSubmitting = false;

        if (!sent) {
          setHandoffStatus(
            "发送未确认，请检查输入框。若未发出，可从剪贴板重新粘贴。",
          );
          navigator.clipboard.writeText(prompt).catch(() => {});
          return;
        }

        setHandoffStatus(
          "已发送生成指令；等待回答完成后点击「恢复到新对话」。",
        );
        verifyHandoffSent(baselineTurns, prompt);
      });
    }, 120);
  }

  // ★ 新增：发送后轮次校验，确认消息真的进入了对话
  function verifyHandoffSent(baselineTurns, prompt) {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts++;
      const currentTurns = getTurns().length;

      if (currentTurns > baselineTurns) {
        window.clearInterval(timer);
        return;
      }

      if (attempts >= 20) {
        window.clearInterval(timer);
        navigator.clipboard
          .writeText(prompt)
          .then(() => {
            setHandoffStatus("检测到消息可能未发出，已重新复制到剪贴板。");
          })
          .catch(() => {});
      }
    }, 500);
  }

  function copyHandoffFallback(text, statusMessage, alertMessage) {
    const done = (ok) => {
      setHandoffStatus(
        ok ? statusMessage : `${statusMessage}（写入剪贴板失败，请手动复制）`,
      );
      if (alertMessage) {
        window.alert(
          ok
            ? alertMessage
            : "无法写入剪贴板。请检查浏览器权限，或手动选择对应内容后重试。",
        );
      }
    };
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      navigator.clipboard
        .writeText(text)
        .then(() => done(true))
        .catch(() => done(false));
    } catch (_) {
      done(false);
    }
  }

  /**
   * 一键交接：
   * 1. 若最新助手回答已包含完整交接包 → 直接打开新对话并填入恢复指令。
   * 2. 若没有 → 自动发送交接生成指令，轮询等待 AI 输出完整交接包后再恢复。
   * 3. 任一步失败（输入框不存在 / 输入框有草稿 / 发送未确认 / 等待超时 /
   *    未找到新对话入口 / 无法暂存 sessionStorage）→ 把当前进度
   *    （生成指令或恢复指令）复制到剪贴板，方便手动继续。
   */
  function startOneClickHandoff() {
    if (isEngineDormant()) return;
    if (isSubmitting) return;

    // 已有现成交接包：直接进入恢复流程
    const existing = extractLatestHandoffText();
    if (existing) {
      proceedOneClickHandoff(existing);
      return;
    }

    const prompt = buildHandoffGenerationPrompt();
    const input = getChatInput();

    if (!input) {
      copyHandoffFallback(
        prompt,
        "未识别输入框，生成指令已复制到剪贴板。",
        "未识别到当前网站的输入框。生成指令已复制，请手动粘贴并发送。",
      );
      return;
    }

    if (getComposerText(input).trim()) {
      copyHandoffFallback(
        prompt,
        "输入框有草稿，生成指令已复制到剪贴板。",
        "当前输入框已有未发送内容。为避免覆盖草稿，生成指令已复制，请先处理现有草稿，再手动粘贴发送。",
      );
      return;
    }

    insertTextAtomic(input, prompt);
    setHandoffStatus("已填入交接指令，正在发送……");
    const baselineTurns = getTurns().length;
    isSubmitting = true;

    sendWithRetry(input, (sent) => {
      isSubmitting = false;

      if (!sent) {
        copyHandoffFallback(
          prompt,
          "发送未确认，生成指令已复制到剪贴板。",
          "未能确认发送成功。生成指令已复制，请手动粘贴发送。",
        );
        return;
      }

      setHandoffStatus("已发送交接指令；等待 AI 生成交接包……");
      waitForHandoffPackage(baselineTurns, prompt);
    });
  }

  function waitForHandoffPackage(baselineTurns, prompt) {
    const startedAt = Date.now();
    const TIMEOUT_MS = 180000; // 3 分钟

    const timer = window.setInterval(() => {
      if (isEngineDormant()) {
        window.clearInterval(timer);
        return;
      }
      // 避免在助手消息尚未出现（旧回答仍是最新）时误判为已生成
      if (getTurns().length <= baselineTurns) {
        if (Date.now() - startedAt > TIMEOUT_MS) {
          window.clearInterval(timer);
          copyHandoffFallback(
            prompt,
            "等待交接包超时，生成指令已复制到剪贴板。",
            "等待 AI 生成交接包超时。生成指令已复制，可手动重新执行。",
          );
        }
        return;
      }

      const result = extractLatestHandoffText();
      if (result) {
        window.clearInterval(timer);
        setHandoffStatus("已检测到交接包，正在准备新对话……");
        proceedOneClickHandoff(result);
        return;
      }

      if (Date.now() - startedAt > TIMEOUT_MS) {
        window.clearInterval(timer);
        copyHandoffFallback(
          prompt,
          "等待交接包超时，生成指令已复制到剪贴板。",
          "等待 AI 生成交接包超时。生成指令已复制，可手动重新执行。",
        );
      }
    }, 600);
  }

  function proceedOneClickHandoff(result) {
    if (isEngineDormant()) return;
    const restoreText = buildHandoffRestorePrompt(result.text, result.kind);
    const newChatControl = findNewChatControl();

    if (!newChatControl) {
      copyHandoffFallback(
        restoreText,
        "未识别新对话入口，恢复指令已复制到剪贴板。",
        "未识别到新对话按钮。完整恢复指令已复制，请手动打开新对话并粘贴。",
      );
      return;
    }

    try {
      sessionStorage.setItem(
        HANDOFF_STORAGE_KEY,
        JSON.stringify({
          text: restoreText,
          createdAt: Date.now(),
          sourceUrl: window.location.href,
          sourceTurns: getTurns().length,
        }),
      );
    } catch (_) {
      copyHandoffFallback(
        restoreText,
        "无法暂存恢复状态，恢复指令已复制到剪贴板。",
        "无法暂存跨页面恢复状态。完整恢复指令已复制，请手动打开新对话并粘贴。",
      );
      return;
    }

    setHandoffStatus("正在打开新对话并准备填入恢复指令……");
    newChatControl.click();
    resumePendingHandoffPrompt();
  }

  function prepareNewConversationFromYaml() {
    if (isEngineDormant()) return;
    const result = extractLatestHandoffText();
    if (!result) {
      window.alert(
        "未在最近的助手回答中找到可识别的交接包。\n\n" +
          "请等待回答完整结束后重试。\n\n" +
          "若 AI 未按格式输出，可点击「发送 YAML 交接指令」重新生成。",
      );
      setHandoffStatus("尚未检测到完整交接包。");
      return;
    }

    const restoreText = buildHandoffRestorePrompt(result.text, result.kind);
    const newChatControl = findNewChatControl();

    if (!newChatControl) {
      navigator.clipboard
        .writeText(restoreText)
        .then(() => {
          setHandoffStatus("未识别新对话入口；完整恢复指令已复制。");
          window.alert(
            "已提取交接包并复制完整恢复指令。此网站的新对话按钮未能可靠识别，请手动打开新对话并粘贴。",
          );
        })
        .catch(() => {
          window.alert(
            "已找到交接包，但无法识别新对话入口或写入剪贴板。请手动复制交接包后恢复。",
          );
        });
      return;
    }

    try {
      sessionStorage.setItem(
        HANDOFF_STORAGE_KEY,
        JSON.stringify({
          text: restoreText,
          createdAt: Date.now(),
          sourceUrl: window.location.href,
          sourceTurns: getTurns().length,
        }),
      );
    } catch (_) {
      navigator.clipboard
        .writeText(restoreText)
        .then(() => {
          window.alert(
            "无法暂存跨页面恢复状态，已复制完整恢复指令，请手动打开新对话并粘贴。",
          );
        })
        .catch(() => {
          window.alert("无法暂存或复制恢复指令，请手动复制交接包。");
        });
      return;
    }

    setHandoffStatus("已识别交接包，正在打开新对话并准备填入恢复指令……");
    newChatControl.click();
    resumePendingHandoffPrompt();
  }

  function findIndexedTurnAncestor(mutationNode) {
    let ancestor =
      mutationNode instanceof Element
        ? mutationNode
        : mutationNode.parentElement;

    while (ancestor) {
      if (turnIndex.has(ancestor)) return ancestor;
      ancestor = ancestor.parentElement;
    }

    return null;
  }

  function collectMutationTargets(records) {
    const turnSelector = getActiveTurnSelectors().join(",");
    const allTurnSelectors = [
      ...(currentPlatform.turnSelectors || []),
      ...(currentPlatform.turnSelectorGroups || []).flat(),
    ];
    const allTurnSelector = [...new Set(allTurnSelectors)].join(",");
    const turnMarkerSelector = [
      '[data-testid^="conversation-turn-"]',
      "[data-turn]",
      "[data-turn-key]",
      "[data-message-author-role]",
      "[data-message-role]",
      "[data-conversation-role]",
      "[data-role]",
      '[data-content-search-unit-key$=":user"]',
      '[data-content-search-unit-key$=":assistant"]',
      '[data-thread-find-target="conversation"]',
      "ol[data-conversation-transcript]",
      '[data-user-message-bubble="true"]',
      "[data-chatgpt-agent-turn-start]",
    ].join(",");
    const anyTurnSelector = `${allTurnSelector},${turnMarkerSelector}`;
    const codeSelectors = currentPlatform.codeSelectors || ["pre"];
    let structuralChange = false;
    let shouldRequestUpdate = false;

    for (const mutationRecord of records) {
      const mutationTarget = mutationRecord.target;

      if (
        mutationTarget instanceof Element &&
        mutationTarget.closest(
          `#${HUD_ID}, .ai-turbo-code-bar, #ai-turbo-vf-tray, .ai-turbo-chat-capsule, #ai-turbo-vf-preview-modal`,
        )
      ) {
        continue;
      }

      if (mutationRecord.type === "attributes") {
        const attributeName = mutationRecord.attributeName || "";
        if (!(mutationTarget instanceof Element)) continue;

        const isSelectorAttribute =
          attributeName === "class" || attributeName === "id";
        const isMarkerAttribute = TURN_MARKER_ATTRIBUTES.has(attributeName);
        const isIndexedTurn = turnIndex.has(mutationTarget);
        const matchesKnownTurn =
          isIndexedTurn ||
          (Boolean(allTurnSelector) &&
            (mutationTarget.matches(allTurnSelector) ||
              mutationTarget.matches(turnMarkerSelector) ||
              mutationTarget.matches('[data-testid^="conversation-turn-"]')));

        // Preserve the existing refresh behaviour for marker attributes.
        // Ignore unrelated class/id changes to avoid redundant full syncs.
        if (isMarkerAttribute) shouldRequestUpdate = true;

        if (matchesKnownTurn && (isMarkerAttribute || isSelectorAttribute)) {
          invalidateActiveTurnSelectorGroup();
          structuralChange = true;
          shouldRequestUpdate = true;
        }
        continue;
      }

      shouldRequestUpdate = true;
      const indexedTurn = findIndexedTurnAncestor(mutationTarget);
      const possibleTurn =
        indexedTurn ||
        (mutationTarget instanceof Element
          ? mutationTarget.closest(turnSelector)
          : mutationTarget.parentElement?.closest(turnSelector));

      if (
        possibleTurn instanceof Element &&
        !isGeminiThoughtElement(possibleTurn) &&
        !matchesReasoningElement(possibleTurn)
      ) {
        dirtyTurns.add(possibleTurn);
      }

      let possibleCode = null;

      if (mutationTarget instanceof Element) {
        for (const selector of codeSelectors) {
          const candidate = mutationTarget.matches(selector)
            ? mutationTarget
            : mutationTarget.closest(selector);
          if (candidate instanceof HTMLElement) {
            possibleCode = normalizeCodeElement(candidate);
            break;
          }
        }
      }

      if (possibleCode instanceof HTMLElement) {
        dirtyCodeBlocks.add(possibleCode);
      }

      if (mutationRecord.type !== "childList") continue;

      for (const changedNode of [
        ...mutationRecord.addedNodes,
        ...mutationRecord.removedNodes,
      ]) {
        if (!(changedNode instanceof Element)) continue;

        if (
          changedNode.matches(anyTurnSelector) ||
          changedNode.querySelector(anyTurnSelector)
        ) {
          structuralChange = true;
        }

        for (const selector of codeSelectors) {
          if (changedNode.matches(selector)) {
            const elNorm = normalizeCodeElement(changedNode);
            if (elNorm instanceof HTMLElement) {
              dirtyCodeBlocks.add(elNorm);
            }
          }
          changedNode.querySelectorAll(selector).forEach((c) => {
            const elNorm = normalizeCodeElement(c);
            if (elNorm instanceof HTMLElement) {
              dirtyCodeBlocks.add(elNorm);
            }
          });
        }
      }
    }

    if (structuralChange) {
      invalidateActiveTurnSelectorGroup();
      fullTurnSyncRequested = true;
      codeScanRequested = true;
    }

    return shouldRequestUpdate || structuralChange;
  }

  function runScheduledUpdate() {
    scheduleTimer = null;
    lastUpdateTime = performance.now();
    renderedCheckCache.clear();

    if (isEngineDormant()) return;

    if (selfMutationDepth > 0) {
      requestUpdate();
      return;
    }

    const currentTurnSet = new Set(previousTurns);
    for (const dirtyTurn of dirtyTurns) {
      if (!(dirtyTurn instanceof Element) || !currentTurnSet.has(dirtyTurn)) {
        fullTurnSyncRequested = true;
      }
    }

    syncTurnIndex(fullTurnSyncRequested);
    syncCodeBlocks(codeScanRequested, dirtyCodeBlocks);
    updateHudDashboard();
    ensureHUDMounted();
    if (trayIsDirty) renderVirtualFileTray();
  }

  function requestUpdate() {
    if (scheduleTimer) return;
    const elapsed = performance.now() - lastUpdateTime;
    if (elapsed >= THROTTLE_INTERVAL) {
      scheduleTimer = window.requestAnimationFrame(runScheduledUpdate);
    } else {
      scheduleTimer = window.setTimeout(() => {
        scheduleTimer = window.requestAnimationFrame(runScheduledUpdate);
      }, THROTTLE_INTERVAL - elapsed);
    }
  }

  function observeCodeLayout() {
    if (!("ResizeObserver" in window)) return;
    codeResizeObserver?.disconnect();

    codeResizeObserver = new ResizeObserver((entries) => {
      for (const resizeEntry of entries) {
        const normalized = normalizeCodeElement(resizeEntry.target);
        if (normalized instanceof HTMLElement) {
          dirtyCodeBlocks.add(normalized);
        }
      }
      if (entries.length) requestUpdate();
    });

    getCodeBlocks().forEach((codeElement) => {
      codeResizeObserver.observe(codeElement);
    });
  }

  function observeDom() {
    const observeRoot = document.documentElement || document.body;
    if (!observeRoot) return;

    observer?.disconnect();
    observer = new MutationObserver((records) => {
      if (selfMutationDepth > 0) return;
      if (collectMutationTargets(records)) requestUpdate();
    });

    observer.observe(observeRoot, {
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: Array.from(TURN_SELECTOR_ATTRIBUTES),
      subtree: true,
    });
  }

  function ensureHUDMounted() {
    if (isEngineDormant()) return;
    injectEngineStyles();
    if (!hudRootElement?.isConnected) {
      buildHUD();
    } else if (
      document.body &&
      hudRootElement.parentElement !== document.body
    ) {
      document.body.appendChild(hudRootElement);
    }
  }

  function patchHistoryForSpaNavigation() {
    if (historyPatched) return;
    historyPatched = true;
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      const result = originalPushState.apply(this, args);
      window.setTimeout(() => {
        if (syncEngineActivation()) return;
        invalidateActiveTurnSelectorGroup();
        fullTurnSyncRequested = true;
        codeScanRequested = true;
        requestUpdate();
        scheduleReasoningRestore();
      }, 0);
      return result;
    };

    history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args);
      window.setTimeout(() => {
        if (syncEngineActivation()) return;
        invalidateActiveTurnSelectorGroup();
        fullTurnSyncRequested = true;
        codeScanRequested = true;
        requestUpdate();
      }, 0);
      return result;
    };

    window.addEventListener("popstate", () => {
      if (syncEngineActivation()) return;
      invalidateActiveTurnSelectorGroup();
      fullTurnSyncRequested = true;
      codeScanRequested = true;
      requestUpdate();
      scheduleReasoningRestore();
    });
  }

  /** Remove every engine artifact and inline style from the host page. */
  function teardownEngine() {
    engineActive = false;
    window.clearInterval(reasoningRestoreTimer);
    reasoningRestoreTimer = 0;

    observer?.disconnect();
    codeResizeObserver?.disconnect();
    if (scheduleTimer) {
      window.cancelAnimationFrame(scheduleTimer);
      window.clearTimeout(scheduleTimer);
      scheduleTimer = null;
    }
    stopVirtualFileTraySyncLoop();

    for (const codeElement of Array.from(codeState.keys())) {
      unmountCodeControls(codeElement);
    }

    withSelfMutation(() => {
      document
        .querySelectorAll(".ai-turbo-chat-capsule, .ai-turbo-chat-user-prompt")
        .forEach((node) => node.remove());
      document.querySelectorAll(".ai-turbo-chat-folded-target").forEach((node) => {
        node.classList.remove("ai-turbo-chat-folded-target");
        node.style.removeProperty("display");
        node.style.removeProperty("max-height");
        node.style.removeProperty("overflow");
        node.style.removeProperty("contain");
      });
      document.querySelectorAll(".ai-turbo-dehydrated").forEach((node) => {
        node.classList.remove("ai-turbo-dehydrated");
        node.style.removeProperty("--turbo-cached-h");
      });
    });

    document.getElementById(HUD_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById("ai-turbo-vf-tray")?.remove();
    document.getElementById("ai-turbo-vf-preview-modal")?.remove();

    hudRootElement = null;
    hudShadowRoot = null;
    hudStats = null;
    handoffStatusNode = null;
    reasoningStatusNode = null;
    searchInput = null;
    searchResultsBox = null;
    state.hudOpen = false;
  }

  /**
   * Align engine state with the current route.
   * Returns true on an auth or redirect route so callers stop page work.
   */
  function syncEngineActivation() {
    if (isAuthOrRedirectRoute()) {
      if (engineActive) teardownEngine();
      return true;
    }
    if (!engineActive) boot();
    return false;
  }

  function bindGlobalListeners() {
    if (globalListenersBound) return;
    globalListenersBound = true;
    window.addEventListener(
      "keydown",
      (event) => {
        if (isEngineDormant()) return;
        if (event.key === "Escape") {
          const previewModal = document.getElementById(
            "ai-turbo-vf-preview-modal",
          );
          if (previewModal) {
            event.preventDefault();
            event.stopPropagation();
            previewModal.remove();
            return;
          }
          if (state.hudOpen) {
            event.preventDefault();
            event.stopPropagation();
            togglePanel(false);
            return;
          }
        }

        if (
          event.altKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          (event.code === "KeyT" ||
            event.key.toLowerCase() === "t" ||
            event.key === "†")
        ) {
          event.preventDefault();
          event.stopPropagation();
          togglePanel();
        }
      },
      true,
    );

    window.addEventListener("paste", handlePasteIntercept, true);
    window.addEventListener("keydown", handleSendIntercept, true);
    window.addEventListener("click", handleSendIntercept, true);
    window.addEventListener("click", handleReasoningClick, true);
    window.addEventListener("click", handleDehydratedClick, true);
  }

  function boot() {
    if (engineActive) return;
    // Account switching passes through login and callback routes. Booting the
    // HUD, listeners, and polling there competes with the auth flow and can
    // leave the engine UI on a redirect stub that has no site styles yet.
    if (isAuthOrRedirectRoute()) return;
    engineActive = true;

    loadSavedConfig();
    injectEngineStyles();
    buildHUD();
    observeCodeLayout();
    observeDom();
    patchHistoryForSpaNavigation();
    bindGlobalListeners();
    scheduleReasoningRestore();
    renderReasoningStatus();

    if (!viewportListenersBound) {
      viewportListenersBound = true;
      window.addEventListener("resize", scheduleVirtualFileTrayPosition, {
        passive: true,
      });

      window.addEventListener("scroll", scheduleVirtualFileTrayPosition, {
        passive: true,
        capture: true,
      });

      window.visualViewport?.addEventListener(
        "resize",
        scheduleVirtualFileTrayPosition,
      );

      window.visualViewport?.addEventListener(
        "scroll",
        scheduleVirtualFileTrayPosition,
      );
    }

    fullTurnSyncRequested = true;
    codeScanRequested = true;
    requestUpdate();

    resumePendingHandoffPrompt();

    window.addEventListener("load", () => {
      if (isEngineDormant()) return;
      fullTurnSyncRequested = true;
      codeScanRequested = true;
      ensureHUDMounted();
      requestUpdate();
    });

    [250, 800, 2000].forEach((delay) => {
      window.setTimeout(() => {
        if (isEngineDormant()) return;
        ensureHUDMounted();
        requestUpdate();
      }, delay);
    });
  }

  /**
   * On login and callback routes keep only a route check: no UI, no DOM
   * writes, and start the engine once the page returns to a chat route.
   */
  function watchForChatRoute() {
    patchHistoryForSpaNavigation();
    if (routeWatcherBound) return;
    routeWatcherBound = true;
    const resumeWhenChatRoute = () => {
      if (isAuthOrRedirectRoute()) return;
      boot();
    };
    window.addEventListener("popstate", resumeWhenChatRoute);
    window.addEventListener("hashchange", resumeWhenChatRoute);
  }

  function startEngine() {
    if (isAuthOrRedirectRoute()) {
      watchForChatRoute();
      return;
    }
    boot();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startEngine, { once: true });
  } else {
    startEngine();
  }
})();
