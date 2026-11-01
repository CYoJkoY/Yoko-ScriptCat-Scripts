// ==UserScript==
// @name         AI Chat Turbo Engine
// @namespace    https://cyojkoy.github.io/Payment/
// @version      0.16.5
// @description  跨平台 AI 对话加速：常驻统计 + 完整消息提取 + YAML 交接 + 多平台适配 + 长代码折叠 + 自适应脱水 + 推理强度记忆 + 元宝原子工具记忆
// @author       Yoko
// @updateURL    https://cdn.jsdelivr.net/gh/CYoJkoY/Yoko-ScriptCat-Scripts@main/dist/ai-chat-turbo-engine.user.js
// @downloadURL  https://ghfast.top/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/main/dist/ai-chat-turbo-engine.user.js
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

"use strict";
(() => {
  // shared/userscript/globals.ts
  function isRecord(value) {
    return typeof value === "object" && value !== null;
  }
  function readUserscriptInfo(scope) {
    if (!("GM_info" in scope)) return null;
    const candidate = scope.GM_info;
    if (!isRecord(candidate)) return null;
    const script = candidate["script"];
    if (!isRecord(script)) return null;
    const name = typeof script["name"] === "string" ? script["name"] : void 0;
    const version = typeof script["version"] === "string" ? script["version"] : void 0;
    return { script: { name, version } };
  }

  // scripts/ai-chat-turbo-engine/src/config.ts
  var HUD_ID = "ai-turbo-extreme-hud";
  var STYLE_ID = "ai-turbo-engine-styles";
  var CODE_COLLAPSE_HEIGHT = 300;
  var CODE_PREVIEW_HEIGHT = 200;
  var DEFAULT_MESSAGE_LIMIT = 60;
  var MESSAGE_LIMIT_MIN = 10;
  var MESSAGE_LIMIT_MAX = 999;
  var LOAD_WARNING_RATIO = 0.7;
  var LOAD_RING_RADIUS = 16.2;
  var LOAD_RING_CIRCUMFERENCE = 2 * Math.PI * LOAD_RING_RADIUS;
  var TURN_MARKER_ATTRIBUTES = /* @__PURE__ */ new Set([
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
    "data-app-shell-main-surface"
  ]);
  var TURN_SELECTOR_ATTRIBUTES = /* @__PURE__ */ new Set([
    ...TURN_MARKER_ATTRIBUTES,
    "class",
    "id"
  ]);
  var CHATGPT_SHELL_ROOT_SELECTOR = '[data-app-shell-main-surface] [data-thread-find-target="conversation"]';
  var CHATGPT_SHELL_TURN_SELECTOR = '[data-app-shell-main-surface] [data-thread-find-target="conversation"] [data-turn-key]';
  var CHATGPT_TRANSCRIPT_ROOT_SELECTOR = "ol[data-conversation-transcript]";
  var CHATGPT_TRANSCRIPT_MESSAGE_SELECTOR = "ol[data-conversation-transcript] > li[data-message-role]";
  var CHATGPT_CODE_CARD_BOUNDARY_SELECTOR = [
    "[data-turn-key]",
    '[data-testid^="conversation-turn-"]',
    "article[data-turn]",
    "section[data-turn]",
    'li[data-message-role="assistant"]',
    '[data-message-author-role="assistant"]'
  ].join(", ");
  var CHATGPT_CODE_HEADER_MARKER_SELECTOR = [
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
    'button[title*="复制代码"]'
  ].join(", ");
  var CHATGPT_CODE_CARD_MAX_ANCESTORS = 10;
  var SEARCH_PREVIEW_LIMIT = 180;
  var SEARCH_LIMIT = 10;
  var STORAGE_KEY_POS = "ai_turbo_pill_pos";
  var STORAGE_KEY_CONFIG = "ai_turbo_engine_config";
  var VIRTUAL_FILE_THRESHOLD = 1500;
  var COMPOSER_VISUAL_GAP = 48;
  var COMPOSER_VISUAL_MAX_DEPTH = 5;
  var STREAMING_IDLE_DELAY = 1500;
  var THROTTLE_INTERVAL = 80;
  var CODE_FENCE = "```";
  var VF_TOKEN_START = "[[TURBO_VFILE_START:";
  var VF_TOKEN_END = ":TURBO_VFILE_END]]";
  var VF_REGEX = /\[\[TURBO_VFILE_START:([^|\r\n]+)\|(\d+)\|(\d+):TURBO_VFILE_END\]\]/;
  var HANDOFF_STORAGE_KEY = "ai_turbo_handoff_restore";
  var PLAIN_HANDOFF_START = "[META]";
  var PLAIN_HANDOFF_END = "[END]";
  var PLAIN_HANDOFF_SECTIONS = [
    "[META]",
    "[TASK]",
    "[DECISIONS]",
    "[PROGRESS]",
    "[ROLE]",
    "[CONTEXT]",
    "[OPEN_ISSUES]",
    "[KEY_ENTITIES]",
    "[HANDOFF_NOTES]",
    "[END]"
  ];
  var PLAIN_HANDOFF_TOLERANCE = 1;
  var REASONING_SELECTOR = [
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
    "[data-type='reasoning']"
  ].join(", ");
  var STORAGE_KEY_REASONING = "ai_turbo_reasoning_memory";
  var STORAGE_KEY_TOOL_MEMORY = "ai_turbo_tool_memory";
  var STORAGE_KEY_YUANBAO_SELECTION = "ai_turbo_yuanbao_selection";
  var YUANBAO_MODEL_TRIGGER_SELECTOR = "[data-thinking-mode-switcher-trigger]";
  var YUANBAO_MODEL_ROW_SELECTOR = "[aria-label='选择模型']";
  var YUANBAO_MODEL_MENU_SELECTOR = "[role='menu'][aria-label='模型列表']";
  var YUANBAO_MODE_LABEL_SELECTOR = "[data-input-label='model']";
  var REASONING_CONTROL_PATTERN = /深度思考|深度推理|思考|推理|思维链|thinking|reasoning|think harder|effort|智商|extended thinking/i;
  var REASONING_CONTROL_SELECTOR = [
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
    "[data-state]"
  ].join(", ");
  var REASONING_MENU_SELECTOR = "[role='menu'], [role='listbox'], [role='dialog'], [role='radiogroup'], [data-radix-popper-content-wrapper], [data-floating-ui-portal]";
  var CHOICE_OPTION_SELECTOR = "[aria-checked], [aria-selected], [role='menuitemradio'], [role='radio'], [role='option'], [role='menuitem'], button, a";
  var CHOICE_RADIO_SELECTOR = "[aria-checked], [aria-selected], [role='menuitemradio'], [role='radio']";
  var TOOL_TRIGGER_SELECTOR = '[data-new-input-control="add-tools-trigger"]';
  var TOOL_TRIGGER_CONTAINER_SELECTOR = '[data-new-input-control="add-tools"]';
  var ATOMIC_ACTIONS_SELECTOR = '[data-new-input-control="atomic-actions"]';
  var ATOMIC_TOOL_ITEM_SELECTOR = `${ATOMIC_ACTIONS_SELECTOR} [data-application-id]`;
  var ATOMIC_TOOL_CHIP_SELECTOR = '[data-new-input-control="selected-atomic-action"][data-application-id]';
  var ATOMIC_TOOL_MENU_SELECTOR = `${ATOMIC_ACTIONS_SELECTOR} [role='menu']`;
  var TOOL_POPUP_SELECTOR = [
    "[role='menu']",
    "[role='listbox']",
    "[role='dialog']",
    "[role='radiogroup']",
    "[data-radix-popper-content-wrapper]",
    "[data-floating-ui-portal]"
  ].join(", ");
  var TOOL_ROW_SELECTOR = [
    "[role='menuitemcheckbox']",
    "[role='menuitemradio']",
    "[role='checkbox']",
    "[role='option']",
    "[aria-checked]",
    "[aria-pressed]",
    "[aria-selected]",
    "[data-state='checked']",
    "[data-state='unchecked']",
    "button"
  ].join(", ");
  var TOOL_TOGGLE_ROW_SELECTOR = [
    "[role='menuitemcheckbox']",
    "[role='menuitemradio']",
    "[role='checkbox']",
    "[role='option']",
    "[aria-checked]",
    "[aria-pressed]",
    "[aria-selected]",
    "[data-state='checked']",
    "[data-state='unchecked']"
  ].join(", ");
  function isToolControlElement(node) {
    if (!(node instanceof Element)) return false;
    return Boolean(
      node.closest(TOOL_TRIGGER_SELECTOR) || node.closest(TOOL_TRIGGER_CONTAINER_SELECTOR) || node.closest(ATOMIC_ACTIONS_SELECTOR) || node.closest(ATOMIC_TOOL_CHIP_SELECTOR)
    );
  }
  var BLOCK_TEXT_TAGS = /* @__PURE__ */ new Set([
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
    "UL"
  ]);
  var PLATFORMS = {
    chatgpt: {
      name: "ChatGPT",
      turnSelectorGroups: [
        [CHATGPT_SHELL_TURN_SELECTOR],
        [CHATGPT_TRANSCRIPT_MESSAGE_SELECTOR],
        [
          '[data-testid^="conversation-turn-"]',
          "article[data-turn]",
          "section[data-turn]"
        ],
        [
          '[data-message-author-role="user"]',
          '[data-message-author-role="assistant"]',
          '[data-message-role="user"]',
          '[data-message-role="assistant"]',
          '[data-role="user"]',
          '[data-role="assistant"]'
        ],
        [
          '[data-content-search-unit-key$=":user"]',
          '[data-content-search-unit-key$=":assistant"]'
        ],
        ["[data-turn-key]"]
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
        "[data-turn-key]"
      ],
      userTurnSelectors: [
        '[data-message-author-role="user"]',
        '[data-role="user"]',
        '[data-content-search-unit-key$=":user"]',
        '[data-user-message-bubble="true"]',
        '[data-testid="collapsible-user-message-root"]',
        '[data-testid*="user-message"]',
        '[class*="user-message"]'
      ],
      userContentSelectors: [
        '[data-testid="collapsible-user-message-root"]',
        ".whitespace-pre-wrap",
        '[data-user-message-bubble="true"]',
        '[data-content-search-unit-key$=":user"]',
        '[data-message-author-role="user"]'
      ],
      codeSelectors: ["pre"],
      contentSelectors: [
        ".markdown",
        ".prose",
        '[class*="markdown"]',
        ".whitespace-pre-wrap",
        '[data-content-search-unit-key$=":assistant"]',
        '[data-message-author-role="assistant"]',
        '[data-testid="message-content"]'
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
        "textarea"
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
        'button[type="submit"]'
      ]
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
        ".model-response-container"
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
        ".response-content"
      ],
      inputSelectors: [
        "rich-textarea .ql-editor",
        "rich-textarea div[contenteditable='true']",
        ".rich-textarea div[contenteditable='true']",
        "div[contenteditable='true'][role='textbox']",
        "div[contenteditable='true']",
        "textarea"
      ],
      sendButtonSelectors: [
        "button.send-button",
        'button[aria-label*="Send message"]',
        'button[aria-label*="发送消息"]',
        'button[aria-label*="Send"]',
        'button[aria-label*="发送"]',
        'button[aria-label*="提交"]',
        ".send-button-container button",
        "rich-textarea + * button"
      ]
    },
    grok: {
      name: "Grok",
      turnSelectors: [
        'div[data-testid*="message-container"]',
        'div[data-testid*="conversation-turn"]',
        'div[class*="message-bubble"]'
      ],
      codeSelectors: ["pre"],
      contentSelectors: ['div[class*="message-content"]', 'div[dir="auto"]'],
      inputSelectors: ["textarea", 'div[contenteditable="true"]'],
      sendButtonSelectors: [
        'button[aria-label*="Grok"]',
        'button[type="submit"]',
        'button[aria-label*="Send"]',
        'button[aria-label*="发送"]'
      ]
    },
    claude: {
      name: "Claude",
      turnSelectors: [
        "div.font-user-message",
        ".font-claude-response",
        ".font-claude-message",
        "div[data-test-render-count]"
      ],
      codeSelectors: ["pre"],
      contentSelectors: [
        ".standard-markdown",
        ".progressive-markdown",
        ".markdown",
        '[class*="font-claude"]'
      ],
      inputSelectors: [
        "div.ProseMirror[contenteditable='true']",
        'div[contenteditable="true"]'
      ],
      sendButtonSelectors: [
        'button[aria-label*="Send Message"]',
        'button[aria-label*="发送消息"]',
        'button[aria-label*="Send"]',
        'button[aria-label*="发送"]',
        "fieldset button:last-child"
      ]
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
        '[data-role="assistant"]'
      ],
      userTurnSelectors: [
        '[data-message-author-role="user"]',
        '[data-role="user"]',
        "div[data-um-id]",
        "div.d29f3d7d",
        '[data-testid*="user-message"]',
        '[class*="user-message"]'
      ],
      userContentSelectors: [
        "._9663006 .fbb737a4",
        ".ds-markdown",
        "div[data-um-id]",
        '[data-testid*="user-message"]',
        '[class*="user-message"]'
      ],
      codeSelectors: ["pre", "code-block"],
      contentSelectors: [
        ".ds-markdown",
        ".markdown",
        ".prose",
        '[class*="markdown"]',
        '[class*="answer"]'
      ],
      inputSelectors: [
        "#chat-input",
        'textarea[data-testid="chat-input"]',
        'textarea[placeholder*="Send a message" i]',
        "textarea[placeholder]",
        'div[contenteditable="true"][role="textbox"]',
        "textarea",
        '[contenteditable="true"]'
      ],
      sendButtonSelectors: [
        'button[data-testid="send-button"]',
        'button[aria-label="Send message"]',
        'button[data-testid*="send"]',
        'button[type="submit"]',
        'button[aria-label*="Send"]',
        'button[aria-label*="发送"]'
      ]
    },
    copilot: {
      name: "Microsoft Copilot",
      turnSelectors: [
        '[class*="user-message"]',
        '[class*="assistant-message"]',
        '[data-testid*="message"]'
      ],
      userTurnSelectors: [
        '[class*="user-message"]',
        '[data-testid*="user-message"]',
        '[data-message-author-role="user"]'
      ],
      userContentSelectors: [
        '[class*="user-message"]',
        '[data-testid*="user-message"]'
      ],
      codeSelectors: ["pre"],
      contentSelectors: [
        ".ac-textBlock",
        ".markdown",
        ".prose",
        '[class*="message-content"]'
      ],
      inputSelectors: [
        "textarea[placeholder]",
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"]',
        "textarea"
      ],
      sendButtonSelectors: [
        'button[data-testid*="send"]',
        'button[aria-label*="Send"]',
        'button[aria-label*="发送"]',
        'button[type="submit"]'
      ]
    },
    perplexity: {
      name: "Perplexity",
      turnSelectors: [
        '[data-testid="chat-message"]',
        '[data-testid*="chat-message"]',
        '[data-message-author-role="user"]',
        '[data-message-author-role="assistant"]'
      ],
      userTurnSelectors: [
        '[data-testid*="user-message"]',
        '[data-message-author-role="user"]',
        '[class*="user-message"]',
        '[class*="human"]'
      ],
      userContentSelectors: [
        '[data-testid*="user-message"]',
        '[class*="user-message"]',
        ".whitespace-pre-wrap"
      ],
      codeSelectors: ["pre"],
      contentSelectors: [
        ".prose",
        ".markdown",
        '[class*="prose"]',
        '[class*="message-content"]'
      ],
      inputSelectors: [
        "textarea[placeholder]",
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"]',
        "textarea"
      ],
      sendButtonSelectors: [
        'button[data-testid*="send"]',
        'button[aria-label*="Send"]',
        'button[aria-label*="发送"]',
        'button[type="submit"]'
      ]
    },
    poe: {
      name: "Poe",
      turnSelectors: [
        ".Message",
        ".ChatMessage",
        '[data-message-author-role="user"]',
        '[data-message-author-role="assistant"]'
      ],
      userTurnSelectors: [
        '[data-message-author-role="user"]',
        '[data-testid*="user-message"]',
        '[class*="UserMessage"]',
        '[class*="humanMessage"]'
      ],
      userContentSelectors: [
        '[data-testid*="user-message"]',
        '[class*="UserMessage"]',
        ".Message"
      ],
      codeSelectors: ["pre"],
      contentSelectors: [
        ".markdown",
        ".MessageContent",
        '[class*="messageContent"]',
        '[class*="message-content"]'
      ],
      inputSelectors: [
        "textarea[placeholder]",
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"]',
        "textarea"
      ],
      sendButtonSelectors: [
        'button[data-testid*="send"]',
        'button[aria-label*="Send"]',
        'button[aria-label*="发送"]',
        'button[type="submit"]'
      ]
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
        '[data-message-author-role="assistant"]'
      ],
      userTurnSelectors: [
        '[data-testid="send_message"]',
        '[data-testid*="user-message"]',
        '[data-message-author-role="user"]',
        '[data-message-role="user"]',
        '[data-role="user"]',
        '[class*="user-message"]'
      ],
      userContentSelectors: [
        '[data-testid="message_text_content"]',
        '[data-testid="message_content"]',
        '[data-testid*="user-message"]',
        '[class*="user-message"]'
      ],
      codeSelectors: ["pre"],
      contentSelectors: [
        '[data-testid="message_text_content"]',
        '[data-testid="message_content"]',
        '[data-testid*="message_content"]',
        ".markdown",
        '[class*="message-content"]'
      ],
      inputSelectors: [
        '[data-testid="chat_input_input"]',
        "#chat-input",
        "textarea[placeholder]",
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"]',
        "textarea"
      ],
      sendButtonSelectors: [
        '[data-testid="chat_input_send_button"]',
        'button[data-testid*="send"]',
        'button[aria-label*="Send"]',
        'button[aria-label*="发送"]',
        'button[type="submit"]'
      ]
    },
    yuanbao: {
      name: "Tencent Yuanbao / 腾讯元宝",
      turnSelectors: [
        ".agent-chat__list__item--human",
        ".agent-chat__list__item--ai",
        '[data-message-author-role="user"]',
        '[data-message-author-role="assistant"]'
      ],
      userTurnSelectors: [
        ".agent-chat__list__item--human",
        ".agent-chat__bubble--human",
        '[data-message-author-role="user"]',
        '[data-role="user"]'
      ],
      userContentSelectors: [
        ".agent-chat__bubble--human .hyc-content-text",
        ".agent-chat__bubble--human .agent-chat__bubble__content",
        ".agent-chat__bubble__content",
        '[data-message-author-role="user"]'
      ],
      codeSelectors: ["pre"],
      contentSelectors: [
        ".hyc-common-markdown-style",
        ".hyc-content-md-done",
        ".hyc-content-md",
        ".agent-chat__speech-text",
        ".agent-chat__bubble__content",
        ".hyc-content-text",
        '[data-message-author-role="assistant"]'
      ],
      inputSelectors: [
        '.agent-dialogue__content--common__input .ql-editor[contenteditable="true"]',
        '#search-bar .ql-editor[contenteditable="true"]',
        '.ql-editor[contenteditable="true"]',
        'div[contenteditable="true"][role="textbox"]',
        "textarea"
      ],
      sendButtonSelectors: [
        "#yuanbao-send-btn",
        '.agent-dialogue__content--common__input button[type="submit"]',
        'button[aria-label*="发送"]',
        'button[aria-label*="Send"]',
        'button[type="submit"]'
      ]
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
        '[class*="answerItem"]'
      ],
      userTurnSelectors: [
        ".chat-user-message-container",
        ".chat-user-message",
        '[data-message-author-role="user"]',
        '[data-message-author="user"]',
        '[data-role="user"]',
        '[data-testid="user-message"]',
        '[class*="questionItem"]',
        '[class*="user-message"]'
      ],
      userContentSelectors: [
        ".chat-user-message",
        ".chat-user-message-container",
        '[class*="questionItem"]',
        '[data-message-author-role="user"]',
        '[data-message-author="user"]',
        '[data-role="user"]',
        ".whitespace-pre-wrap"
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
        '[data-role="assistant"]'
      ],
      inputSelectors: [
        "textarea#chat-input",
        '#chat-input[contenteditable="true"]',
        "textarea.message-input-textarea",
        'textarea[placeholder*="Ask Qwen" i]',
        'textarea[placeholder*="message" i]',
        '[contenteditable="true"][role="textbox"]',
        "textarea",
        '[contenteditable="true"]'
      ],
      sendButtonSelectors: [
        ".message-input-right-button-send",
        'button[data-testid="send-button"]',
        'button[aria-label*="Send"]',
        'button[aria-label*="发送"]',
        'button[type="submit"]'
      ]
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
        '[data-role="assistant"]'
      ],
      userTurnSelectors: [
        '[class*="questionItem"]',
        '[data-message-author-role="user"]',
        '[data-message-author="user"]',
        '[data-role="user"]',
        '[class*="user-message"]'
      ],
      userContentSelectors: [
        '[class*="questionItem"]',
        ".bubble-uo23is",
        '[data-message-author-role="user"]',
        '[data-message-author="user"]',
        '[data-role="user"]'
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
        '[data-role="assistant"]'
      ],
      inputSelectors: [
        "textarea#chat-input",
        "textarea.message-input-textarea",
        '#chat-input[contenteditable="true"]',
        'textarea[placeholder*="问" i]',
        'textarea[placeholder*="消息" i]',
        '[contenteditable="true"][role="textbox"]',
        "textarea",
        '[contenteditable="true"]'
      ],
      sendButtonSelectors: [
        ".message-input-right-button-send",
        'button[data-testid="send-button"]',
        'button[aria-label*="发送"]',
        'button[aria-label*="Send"]',
        'button[type="submit"]'
      ]
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
        ".message-assistant"
      ],
      userTurnSelectors: [
        ".question-txt.dots",
        '[data-message-author="user"]',
        '[data-message-author-role="user"]',
        '[data-role="user"]',
        ".role-user",
        ".message-user",
        '[data-testid*="user-message"]'
      ],
      userContentSelectors: [
        ".question-txt.dots",
        ".message-user .markdown-body",
        ".message-user .markdown",
        ".role-user",
        ".message-user",
        '[data-message-author="user"]',
        '[data-role="user"]'
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
        '[data-role="assistant"]'
      ],
      inputSelectors: [
        "#chat-input",
        'textarea[placeholder*="请输入"]',
        'textarea[placeholder*="消息"]',
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"]',
        "textarea"
      ],
      sendButtonSelectors: [
        'button[data-testid="send-button"]',
        'button[aria-label*="发送"]',
        'button[aria-label*="Send"]',
        'button[type="submit"]'
      ]
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
        ".role-assistant"
      ],
      userTurnSelectors: [
        ".chat-user",
        '[data-message-author="user"]',
        '[data-role="user"]',
        ".message-user",
        ".role-user",
        '[data-testid="user-message"]'
      ],
      userContentSelectors: [
        ".chat-user .flex.justify-end.pb-1",
        '[data-message-author="user"]',
        '[data-role="user"]',
        ".chat-user",
        ".message-user",
        ".role-user"
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
        ".role-assistant"
      ],
      inputSelectors: [
        'div[contenteditable="true"]#chat-input',
        'div[contenteditable="true"][data-testid*="input"]',
        "textarea#chat-input",
        'textarea[placeholder="Send a Message"]',
        'textarea[placeholder*="message" i]',
        'div[contenteditable="true"][role="textbox"]',
        "textarea",
        '[contenteditable="true"]'
      ],
      sendButtonSelectors: [
        'button[type="submit"]',
        'button[aria-label="Send"]',
        'button[data-testid="send-button"]',
        'button[aria-label*="send" i]',
        'button[aria-label*="发送"]'
      ]
    }
  };

  // scripts/ai-chat-turbo-engine/src/core/diagnostics.ts
  var REPORT_LIMIT = 50;
  var reported = /* @__PURE__ */ new Set();
  function reportRecoverableError(scope, error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const key = `${scope}\0${detail}`;
    if (reported.has(key) || reported.size >= REPORT_LIMIT) return;
    reported.add(key);
    console.warn(`[AI Chat Turbo] ${scope} skipped: ${detail}`);
  }

  // scripts/ai-chat-turbo-engine/src/core/text.ts
  function normalizeText(sourceText) {
    return String(sourceText || "").replace(/\u00a0/g, " ").replace(/\r\n?/g, "\n").split("\n").map((line) => line.replace(/[ \t]+$/g, "")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  function escapeHtml(text) {
    return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function fastCountLines(text) {
    if (!text) return 0;
    let count = 1;
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) === 10) count++;
    }
    return count;
  }
  function matchesReasoningElement(element) {
    if (!(element instanceof Element)) return false;
    try {
      return element.matches(REASONING_SELECTOR);
    } catch (error) {
      reportRecoverableError("match reasoning element", error);
      return false;
    }
  }
  function isReasoningElement(element) {
    if (!(element instanceof Element)) return false;
    try {
      return matchesReasoningElement(element) || Boolean(element.closest(REASONING_SELECTOR));
    } catch (error) {
      reportRecoverableError("resolve reasoning ancestor", error);
      return false;
    }
  }
  function elementToPlainText(rootElement) {
    if (!(rootElement instanceof Element) || matchesReasoningElement(rootElement)) {
      return "";
    }
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
      "[hidden]"
    ].join(", ");
    const preservedCodeBlocks = [];
    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.nodeValue || "";
      }
      if (!(node instanceof Element)) {
        return Array.from(node.childNodes).map(walk).join("");
      }
      try {
        if (node !== rootElement && node.matches(ignoredSelectors)) return "";
      } catch (error) {
        reportRecoverableError("test ignored transcript selectors", error);
      }
      const tag = node.tagName.toUpperCase();
      if (tag === "BR") return "\n";
      if (tag === "PRE") {
        const codeText = node.textContent || "";
        const codeClasses = [
          node.className || "",
          node.querySelector("code")?.className || "",
          node.getAttribute("data-language") || "",
          node.querySelector("code")?.getAttribute("data-language") || "",
          node.querySelector("code")?.getAttribute("lang") || ""
        ].join(" ");
        const languageMatch = /language-([a-z0-9+#.-]+)/i.exec(codeClasses);
        const language = languageMatch ? (languageMatch[1] ?? "text").toLowerCase() : "text";
        const token = `TURBO_CODE_${preservedCodeBlocks.length}`;
        preservedCodeBlocks.push({ token, codeText, language });
        return `
${CODE_FENCE}${language}
${token}
${CODE_FENCE}
`;
      }
      const content = Array.from(node.childNodes).map(walk).join("");
      return BLOCK_TEXT_TAGS.has(tag) ? "\n" + content + "\n" : content;
    }
    let text = normalizeText(walk(rootElement));
    for (const block of preservedCodeBlocks) {
      const placeholder = `${CODE_FENCE}${block.language}
${block.token}
${CODE_FENCE}`;
      const preserved = `${CODE_FENCE}${block.language}
${block.codeText}
${CODE_FENCE}`;
      text = text.replace(placeholder, preserved);
    }
    return text;
  }

  // scripts/ai-chat-turbo-engine/src/core/turns.ts
  function createTurnUtils(platform) {
    let activeTurnSelectorGroup = null;
    const renderedCheckCache = /* @__PURE__ */ new Map();
    function clearRenderedCache() {
      renderedCheckCache.clear();
    }
    function isGeminiThoughtElement(element) {
      if (platform !== PLATFORMS.gemini || !(element instanceof Element))
        return false;
      return Boolean(
        element.closest(
          "model-thoughts, .thoughts-container, .thoughts-content, [data-test-id*='thought']"
        )
      );
    }
    function isUserTurn(turnElement) {
      if (!(turnElement instanceof Element)) return false;
      const contentSearchKey = turnElement.getAttribute(
        "data-content-search-unit-key"
      );
      if (contentSearchKey && /:(user|human)$/i.test(contentSearchKey)) {
        return true;
      }
      if (contentSearchKey && /:(assistant|model|system)$/i.test(contentSearchKey)) {
        return false;
      }
      const roleValues = [
        turnElement.getAttribute("data-message-author-role"),
        turnElement.getAttribute("data-message-author"),
        turnElement.getAttribute("data-role"),
        turnElement.getAttribute("data-message-role"),
        turnElement.getAttribute("data-conversation-role"),
        turnElement.getAttribute("data-turn")
      ].filter((role) => typeof role === "string");
      if (roleValues.some((role) => /^(user|human)$/i.test(role))) return true;
      if (roleValues.some((role) => /^(assistant|model|system)$/i.test(role))) {
        return false;
      }
      const platformUserSelectors = platform.userTurnSelectors || [];
      for (const selector of platformUserSelectors) {
        if (turnElement.matches(selector) || turnElement.querySelector(selector)) {
          return true;
        }
      }
      let ancestor = turnElement.parentElement;
      let ancestorDepth = 0;
      while (ancestor && ancestorDepth < 3) {
        const currentAncestor = ancestor;
        if (platformUserSelectors.some(
          (selector) => currentAncestor.matches(selector)
        )) {
          return true;
        }
        ancestor = ancestor.parentElement;
        ancestorDepth++;
      }
      if (turnElement.matches(
        "user-query, [data-test-id='user-query'], .user-query, .user-query-container"
      ) || turnElement.querySelector(
        ".user-query-text, .query-text, [class*='query-content']"
      )) {
        return true;
      }
      if (turnElement.matches("div.font-user-message") || turnElement.querySelector(".font-user-message")) {
        return true;
      }
      if (turnElement.matches('[data-testid*="user"], [class*="user"]') || turnElement.querySelector('[data-testid*="user"]')) {
        return true;
      }
      return false;
    }
    function getTurnRole(turnElement) {
      if (!(turnElement instanceof Element)) return "assistant";
      const contentSearchKey = turnElement.getAttribute(
        "data-content-search-unit-key"
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
        turnElement.getAttribute("data-turn")
      ].filter((role) => typeof role === "string");
      if (roleValues.some((role) => /^(user|human)$/i.test(role))) return "user";
      if (roleValues.some((role) => /^(assistant|model)$/i.test(role))) {
        return "assistant";
      }
      for (const selector of platform.userTurnSelectors || []) {
        try {
          if (turnElement.matches(selector)) return "user";
        } catch (error) {
          reportRecoverableError("test user turn selector", error);
        }
      }
      return isUserTurn(turnElement) ? "user" : "assistant";
    }
    function uniqueDomOrdered(elements) {
      const seen = /* @__PURE__ */ new Set();
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
    function isRenderedChatGPTElement(element) {
      if (!(element instanceof HTMLElement) || !element.isConnected || element.closest('[hidden], [aria-hidden="true"], [inert]')) {
        return false;
      }
      const cachedResult = renderedCheckCache.get(element);
      if (cachedResult !== void 0) return cachedResult;
      const computedStyle = window.getComputedStyle(element);
      const isRendered = computedStyle.display !== "none" && computedStyle.visibility !== "hidden" && computedStyle.visibility !== "collapse" && element.getClientRects().length > 0;
      renderedCheckCache.set(element, isRendered);
      return isRendered;
    }
    function selectChatGPTRootWithMostTurns(roots, turnSelector) {
      let selectedRoot = null;
      let largestTurnCount = -1;
      for (const candidateRoot of roots) {
        const turnCount = Array.from(
          candidateRoot.querySelectorAll(turnSelector)
        ).filter(
          (turnElement) => turnElement.closest("[data-turn-key]") === turnElement && isRenderedChatGPTElement(turnElement)
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
      const seenTurnRoles = /* @__PURE__ */ new Set();
      const turnContainers = Array.from(
        conversationRoot.querySelectorAll("[data-turn-key]")
      ).filter(
        (turnContainer) => turnContainer.closest("[data-turn-key]") === turnContainer && isRenderedChatGPTElement(turnContainer)
      );
      const roleSelectors = [
        {
          role: "user",
          selectors: [
            '[data-content-search-unit-key$=":user"]',
            '[data-user-message-bubble="true"]',
            '[data-message-role="user"]',
            '[data-conversation-role="user"]'
          ]
        },
        {
          role: "assistant",
          selectors: [
            '[data-content-search-unit-key$=":assistant"]',
            '[data-message-role="assistant"]',
            '[data-conversation-role="assistant"]',
            "[data-chatgpt-agent-turn-start]"
          ]
        }
      ];
      for (const turnContainer of turnContainers) {
        const turnKey = (turnContainer.getAttribute("data-turn-key") || turnContainer.getAttribute("data-turn-id") || turnContainer.id || "").trim();
        if (!turnKey) continue;
        for (const roleConfig of roleSelectors) {
          const roleIdentity = `${turnKey}:${roleConfig.role}`;
          if (seenTurnRoles.has(roleIdentity)) continue;
          let roleElement = null;
          for (const selector of roleConfig.selectors) {
            roleElement = Array.from(turnContainer.querySelectorAll(selector)).find(
              (candidateElement) => candidateElement.closest("[data-turn-key]") === turnContainer && isRenderedChatGPTElement(candidateElement)
            ) ?? null;
            if (roleElement) break;
          }
          if (!roleElement) continue;
          seenTurnRoles.add(roleIdentity);
          messageNodes.push(roleElement);
        }
      }
      return filterOutNested(uniqueDomOrdered(messageNodes)).filter(
        (element) => !isGeminiThoughtElement(element) && !matchesReasoningElement(element)
      );
    }
    function getCurrentChatGPTTurns() {
      if (platform.name !== "ChatGPT") return null;
      const shellRoots = Array.from(
        document.querySelectorAll(CHATGPT_SHELL_ROOT_SELECTOR)
      ).filter(isRenderedChatGPTElement);
      if (shellRoots.length) {
        const activeShellRoot = selectChatGPTRootWithMostTurns(
          shellRoots,
          "[data-turn-key]"
        );
        return activeShellRoot ? collectChatGPTShellMessages(activeShellRoot) : [];
      }
      const transcriptRoots = Array.from(
        document.querySelectorAll(CHATGPT_TRANSCRIPT_ROOT_SELECTOR)
      ).filter(isRenderedChatGPTElement);
      if (transcriptRoots.length) {
        let activeTranscriptRoot = transcriptRoots[0];
        let largestMessageCount = -1;
        for (const candidateRoot of transcriptRoots) {
          const messageCount = Array.from(
            candidateRoot.querySelectorAll(":scope > li[data-message-role]")
          ).filter(isRenderedChatGPTElement).length;
          if (messageCount >= largestMessageCount) {
            activeTranscriptRoot = candidateRoot;
            largestMessageCount = messageCount;
          }
        }
        return Array.from(
          activeTranscriptRoot.querySelectorAll(":scope > li[data-message-role]")
        ).filter(isRenderedChatGPTElement);
      }
      return null;
    }
    function getTurns() {
      const currentChatGPTTurns = getCurrentChatGPTTurns();
      if (currentChatGPTTurns !== null) return currentChatGPTTurns;
      const collected = [];
      for (const selector of getActiveTurnSelectors()) {
        document.querySelectorAll(selector).forEach((elem) => collected.push(elem));
      }
      const unnested = filterOutNested(collected);
      return unnested.filter(
        (element) => (platform.name !== "ChatGPT" || isRenderedChatGPTElement(element)) && !isGeminiThoughtElement(element) && !matchesReasoningElement(element)
      );
    }
    function findContentElement(turnElement) {
      const selectorGroups = [];
      if (isUserTurn(turnElement) && Array.isArray(platform.userContentSelectors)) {
        selectorGroups.push(platform.userContentSelectors);
      }
      selectorGroups.push(platform.contentSelectors || []);
      for (const selectorGroup of selectorGroups) {
        for (const selector of selectorGroup) {
          const match = turnElement.matches(selector) ? turnElement : turnElement.querySelector(selector);
          if (match && !isGeminiThoughtElement(match)) return match;
        }
      }
      return turnElement;
    }
    function extractTurnText(turnElement) {
      let raw = elementToPlainText(turnElement);
      const vfIdx = raw.indexOf(VF_TOKEN_START);
      if (vfIdx !== -1) {
        let userPart = raw.slice(0, vfIdx).replace(/```[a-z]*\s*$/i, "").trim();
        if (userPart === "请查阅并分析以下文本内容：" || userPart === "请查阅以下文本：") {
          userPart = "";
        }
        const match = raw.match(VF_REGEX);
        const fileName = match ? ` [📎 ${match[1]}]` : " [📎 附件文件]";
        raw = (userPart || "附件文本") + fileName;
      }
      return normalizeText(raw);
    }
    function getActiveTurnSelectors() {
      const selectorGroups = platform.turnSelectorGroups;
      if (!Array.isArray(selectorGroups)) {
        return platform.turnSelectors;
      }
      if (activeTurnSelectorGroup) {
        return activeTurnSelectorGroup;
      }
      for (const selectorGroup of selectorGroups) {
        if (selectorGroup.some(
          (selector) => document.querySelector(selector)
        )) {
          activeTurnSelectorGroup = selectorGroup;
          return selectorGroup;
        }
      }
      return platform.turnSelectors;
    }
    function invalidateActiveTurnSelectorGroup() {
      activeTurnSelectorGroup = null;
    }
    return {
      isGeminiThoughtElement,
      isUserTurn,
      getTurnRole,
      filterOutNested,
      getCurrentChatGPTTurns,
      getTurns,
      findContentElement,
      extractTurnText,
      getActiveTurnSelectors,
      invalidateActiveTurnSelectorGroup,
      clearRenderedCache
    };
  }

  // shared/storage/keyValue.ts
  var DEFAULT_MESSAGES = {
    read: "[shared/storage] read failed",
    write: "[shared/storage] write failed",
    remove: "[shared/storage] remove failed",
    parse: "[shared/storage] invalid JSON"
  };
  function reportFailure(options, operation, error) {
    if (options.onError !== void 0) {
      options.onError({ operation, error });
      return;
    }
    console.error(DEFAULT_MESSAGES[operation], error);
  }
  function createStringStorage(storage, options = {}) {
    const memory = /* @__PURE__ */ new Map();
    const useCache = options.cache !== false;
    const read = (key) => {
      if (useCache) {
        const cached = memory.get(key);
        if (cached !== void 0) return cached;
      }
      try {
        const value = storage.getItem(key);
        if (useCache && value !== null) memory.set(key, value);
        return value;
      } catch (error) {
        reportFailure(options, "read", error);
        return null;
      }
    };
    const write = (key, value) => {
      if (useCache) memory.set(key, value);
      try {
        storage.setItem(key, value);
        return true;
      } catch (error) {
        reportFailure(options, "write", error);
        return false;
      }
    };
    const remove = (key) => {
      if (useCache) memory.delete(key);
      try {
        storage.removeItem(key);
        return true;
      } catch (error) {
        reportFailure(options, "remove", error);
        return false;
      }
    };
    return {
      read,
      write,
      readJson: (key, fallback) => {
        const raw = read(key);
        if (raw === null) return fallback;
        try {
          return JSON.parse(raw);
        } catch (error) {
          reportFailure(options, "parse", error);
          return fallback;
        }
      },
      writeJson: (key, value) => {
        let serialized;
        try {
          serialized = JSON.stringify(value);
        } catch (error) {
          reportFailure(options, "write", error);
          return false;
        }
        return write(key, serialized);
      },
      remove
    };
  }
  function isStorageArea(value) {
    if (typeof value !== "object" || value === null) return false;
    return "getItem" in value && "setItem" in value && "removeItem" in value;
  }
  function resolveArea(kind) {
    const area = kind === "localStorage" ? window.localStorage : window.sessionStorage;
    if (!isStorageArea(area)) {
      throw new Error(kind + " is unavailable in this frame");
    }
    return area;
  }
  function getBrowserStorage(kind, options = {}) {
    return createStringStorage(
      {
        getItem: (key) => resolveArea(kind).getItem(key),
        setItem: (key, value) => resolveArea(kind).setItem(key, value),
        removeItem: (key) => resolveArea(kind).removeItem(key)
      },
      options
    );
  }

  // scripts/ai-chat-turbo-engine/src/storage/reported.ts
  function createReportedStorage(kind, report) {
    return getBrowserStorage(kind, { cache: false, onError: report });
  }

  // scripts/ai-chat-turbo-engine/src/state.ts
  var configStore = createReportedStorage("localStorage", (failure) => {
    const scope = failure.operation === "write" || failure.operation === "remove" ? "save engine config" : "load saved engine config";
    reportRecoverableError(scope, failure.error);
  });
  function createEngineState() {
    return {
      pruneEnabled: true,
      keepTurns: 8,
      messageLimit: DEFAULT_MESSAGE_LIMIT,
      collapseCode: true,
      virtualFileEnabled: true,
      rememberReasoning: true,
      rememberTools: true,
      hudOpen: false,
      totalTurns: 0,
      hiddenCount: 0,
      foldedCodeCount: 0,
      indexedTurns: []
    };
  }
  function normalizeMessageLimit(rawLimit) {
    const numericLimit = Number(rawLimit);
    if (!Number.isFinite(numericLimit)) return DEFAULT_MESSAGE_LIMIT;
    return Math.min(
      MESSAGE_LIMIT_MAX,
      Math.max(MESSAGE_LIMIT_MIN, Math.round(numericLimit))
    );
  }
  function isSavedConfig(value) {
    return typeof value === "object" && value !== null;
  }
  function loadSavedConfig(state) {
    try {
      const raw = configStore.read(STORAGE_KEY_CONFIG);
      if (raw === null || raw === "") return;
      const parsed = JSON.parse(raw);
      if (!isSavedConfig(parsed)) return;
      if (typeof parsed.keepTurns === "number" && !isNaN(parsed.keepTurns)) {
        state.keepTurns = Math.max(2, Math.min(50, parsed.keepTurns));
      }
      if (typeof parsed.messageLimit === "number" && Number.isFinite(parsed.messageLimit)) {
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
      if (typeof parsed.rememberTools === "boolean") {
        state.rememberTools = parsed.rememberTools;
      }
    } catch (error) {
      reportRecoverableError("load saved engine config", error);
    }
  }
  function saveCurrentConfig(state) {
    try {
      const config = {
        keepTurns: state.keepTurns,
        messageLimit: state.messageLimit,
        pruneEnabled: state.pruneEnabled,
        collapseCode: state.collapseCode,
        virtualFileEnabled: state.virtualFileEnabled,
        rememberReasoning: state.rememberReasoning,
        rememberTools: state.rememberTools
      };
      configStore.write(STORAGE_KEY_CONFIG, JSON.stringify(config));
    } catch (error) {
      reportRecoverableError("save engine config", error);
    }
  }

  // scripts/ai-chat-turbo-engine/src/ui/code-blocks.ts
  function createCodeBlockUtils(deps) {
    const {
      currentPlatform,
      state,
      el,
      withSelfMutation,
      filterOutNested,
      isGeminiThoughtElement,
      requestUpdate
    } = deps;
    const codeState = /* @__PURE__ */ new Map();
    const dirtyCodeBlocks = /* @__PURE__ */ new Set();
    let codeScanRequested = true;
    let codeResizeObserver = null;
    function normalizeCodeElement(candidate) {
      if (!(candidate instanceof HTMLElement)) return null;
      const geminiBlock = candidate.closest("code-block");
      if (geminiBlock instanceof HTMLElement) return geminiBlock;
      if (candidate.matches("code")) {
        return candidate.parentElement?.matches("pre") ? candidate.parentElement : candidate;
      }
      return candidate;
    }
    function getCodeBlocks(rootNode = document) {
      const collected = [];
      const selectors = currentPlatform.codeSelectors || ["pre"];
      for (const selector of selectors) {
        rootNode.querySelectorAll(selector).forEach((candidate) => {
          const belongsToUserTurn = (currentPlatform.userTurnSelectors || []).some((selector2) => {
            try {
              return candidate.matches(selector2) || Boolean(candidate.closest(selector2));
            } catch (error) {
              reportRecoverableError("test code card boundary", error);
              return false;
            }
          });
          if (candidate.classList.contains("ai-turbo-chat-folded-target") || belongsToUserTurn || candidate.closest(
            ".ai-turbo-chat-folded-target, .ai-turbo-chat-capsule, user-query, [data-message-author-role='user'], [data-content-search-unit-key$=':user'], [data-user-message-bubble='true'], [data-testid='collapsible-user-message-root'], .font-user-message"
          )) {
            return;
          }
          const codeElement = normalizeCodeElement(candidate);
          if (!codeElement) return;
          if (isGeminiThoughtElement(codeElement)) return;
          collected.push(codeElement);
        });
      }
      return filterOutNested(collected).filter(
        (element) => element instanceof HTMLElement
      );
    }
    function getCodeText(codeElement) {
      const sourceElement = codeElement.querySelector("pre code") || codeElement.querySelector("pre") || codeElement.querySelector("code") || codeElement;
      return typeof sourceElement.textContent === "string" ? sourceElement.textContent : "";
    }
    function getCodeLanguage(codeElement) {
      const langElem = codeElement.querySelector(
        'code[class*="language-"], [class*="language-"]'
      );
      if (langElem) {
        const match = String(langElem.className || "").match(
          /language-([a-z0-9+#.-]+)/i
        );
        if (match) return (match[1] ?? "").toUpperCase();
      }
      const decElem = codeElement.querySelector(
        ".code-block-decoration, [data-testid*='language']"
      );
      const decText = decElem?.textContent?.trim();
      if (decText && decText.length < 24) return decText.toUpperCase();
      const attrLang = codeElement.getAttribute("data-language") || codeElement.getAttribute("lang");
      if (attrLang) return attrLang.toUpperCase();
      return "代码";
    }
    function getCodeElementHeight(codeElement) {
      const pre = codeElement.querySelector("pre");
      return Math.max(
        codeElement.scrollHeight || 0,
        codeElement.offsetHeight || 0,
        pre?.scrollHeight || 0,
        pre?.offsetHeight || 0
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
            "important"
          );
          codeElement.style.setProperty("overflow", "hidden", "important");
        }
      });
    }
    function updateCodeMeta(entry, codeElement) {
      if (!entry || !codeElement?.isConnected) return;
      if (entry.renderedStaticOnce && !entry.isDisplayingStreaming && !dirtyCodeBlocks.has(codeElement)) {
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
      const isActivelyStreaming = entry.lastMutationTime > 0 && now - entry.lastMutationTime < STREAMING_IDLE_DELAY;
      if (isActivelyStreaming) {
        if (!entry.isDisplayingStreaming) {
          entry.isDisplayingStreaming = true;
          entry.langLabel.textContent = getCodeLanguage(codeElement);
          entry.linesLabel.textContent = "";
          entry.linesLabel.appendChild(
            el("span", { className: "ai-turbo-streaming-badge" }, [
              "● 正在输出..."
            ])
          );
          entry.toggleButton.textContent = entry.expanded ? "收起代码" : "展开代码";
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
      entry.linesLabel.textContent = lineCount ? `${lineCount.toLocaleString()} 行` : "";
      entry.toggleButton.textContent = entry.expanded ? "收起代码" : `展开 ${lineCount ? `${lineCount.toLocaleString()} 行` : "代码"}`;
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
          "ai-turbo-expanded"
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
        if (node.matches(CHATGPT_CODE_HEADER_MARKER_SELECTOR) || node.querySelector(CHATGPT_CODE_HEADER_MARKER_SELECTOR)) {
          return true;
        }
      } catch (error) {
        reportRecoverableError("inspect native code header", error);
        return false;
      }
      const className = typeof node.className === "string" ? node.className : "";
      const markerText = [
        className,
        node.getAttribute("data-testid") || "",
        node.getAttribute("aria-label") || "",
        node.getAttribute("title") || ""
      ].join(" ");
      if (/(?:code|language).*(?:header|toolbar|decoration)|(?:header|toolbar).*(?:code|language)/i.test(
        markerText
      )) {
        return true;
      }
      if (node.querySelector("button") && !node.querySelector("pre, code")) {
        const headerText = (node.textContent || "").trim();
        if (headerText.length > 0 && headerText.length <= 64 && (/^(?:[a-z0-9_+#.-]+)$/i.test(headerText) || /copy|复制|运行代码|code block/i.test(headerText))) {
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
      while (parent instanceof HTMLElement && depth < CHATGPT_CODE_CARD_MAX_ANCESTORS) {
        if (parent.matches(CHATGPT_CODE_CARD_BOUNDARY_SELECTOR)) break;
        let precedingSibling = branch.previousElementSibling;
        while (precedingSibling) {
          if (isNativeCodeHeaderNode(precedingSibling)) {
            return parent.contains(codeElement) ? parent : null;
          }
          precedingSibling = precedingSibling.previousElementSibling;
        }
        const className = typeof parent.className === "string" ? parent.className : "";
        const cardMarker = [
          className,
          parent.getAttribute("data-testid") || "",
          parent.getAttribute("data-role") || ""
        ].join(" ");
        if (/(?:code[-_ ]?(?:block|card|container)|(?:block|card)[-_ ]?code|group\/code)/i.test(
          cardMarker
        )) {
          classBasedFallback = parent;
        }
        branch = parent;
        parent = parent.parentElement;
        depth++;
      }
      return classBasedFallback instanceof HTMLElement && classBasedFallback.isConnected && classBasedFallback.contains(codeElement) ? classBasedFallback : null;
    }
    function getCodeControlAnchor(codeElement) {
      if (currentPlatform !== PLATFORMS.chatgpt) return codeElement;
      return getChatGPTCodeCardAnchor(codeElement);
    }
    function positionCodeControl(entry, codeElement) {
      const anchor = getCodeControlAnchor(codeElement);
      if (!(anchor instanceof HTMLElement) || anchor === codeElement) {
        unmountCodeControls(codeElement);
        return false;
      }
      if (entry.anchor === anchor && entry.bar.isConnected && entry.bar.nextElementSibling === anchor) {
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
        () => flashCopyState(button, "复制失败")
      );
    }
    function mountCodeControls(codeElement) {
      if (!state.collapseCode || !codeElement.isConnected || codeState.has(codeElement))
        return;
      if (codeElement.parentElement?.closest(".ai-turbo-code-target")) return;
      const measuredH = getCodeElementHeight(codeElement);
      if (measuredH <= CODE_COLLAPSE_HEIGHT) return;
      const anchor = getCodeControlAnchor(codeElement);
      if (currentPlatform === PLATFORMS.chatgpt && (!(anchor instanceof HTMLElement) || anchor === codeElement)) {
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
        linesLabel
      ]);
      const toggleButton = el("button", {
        type: "button",
        className: "ai-turbo-code-toggle",
        "aria-expanded": "false"
      });
      const copyButton = el("button", {
        type: "button",
        className: "ai-turbo-code-copy",
        "aria-label": "复制整段代码"
      });
      copyButton.textContent = "复制";
      copyButton.addEventListener("click", () => {
        copyCodeText(copyButton, codeElement);
      });
      const actionsWrap = el("div", { className: "ai-turbo-code-bar-actions" }, [
        copyButton,
        toggleButton
      ]);
      const bar = el(
        "div",
        {
          className: currentPlatform === PLATFORMS.chatgpt ? "ai-turbo-code-bar ai-turbo-code-bar-chatgpt" : "ai-turbo-code-bar"
        },
        [metaWrap, actionsWrap]
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
        renderedStaticOnce: false
      };
      if (!(anchor instanceof HTMLElement)) return;
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
        Array.from(codeState.values(), (entry) => entry.bar)
      );
      document.querySelectorAll(".ai-turbo-code-bar").forEach((bar) => {
        if (!activeBars.has(bar)) {
          bar.remove();
          return;
        }
        if (bar.classList.contains("ai-turbo-code-bar-chatgpt")) return;
        const next = bar.nextElementSibling;
        const nextEntry = next instanceof HTMLElement ? codeState.get(next) : void 0;
        if (!(next instanceof HTMLElement) || !nextEntry || nextEntry.bar !== bar) {
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
      const rawCandidates = forceScan ? getCodeBlocks() : Array.from(dirtyCandidates).map(normalizeCodeElement).filter(
        (elem) => elem instanceof HTMLElement && elem.isConnected
      );
      const candidates = filterOutNested(rawCandidates).filter(
        (element) => element instanceof HTMLElement
      );
      for (const codeElement of candidates) {
        const entry = codeState.get(codeElement);
        if (entry) {
          if (currentPlatform === PLATFORMS.chatgpt && !positionCodeControl(entry, codeElement)) {
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
        (entry) => !entry.expanded
      ).length;
      codeScanRequested = false;
      dirtyCodeBlocks.clear();
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
        codeResizeObserver?.observe(codeElement);
      });
    }
    function flushCodeBlockScan() {
      syncCodeBlocks(codeScanRequested, dirtyCodeBlocks);
    }
    function unmountAllCodeControls() {
      for (const codeElement of Array.from(codeState.keys())) {
        unmountCodeControls(codeElement);
      }
    }
    function disconnectCodeLayoutObserver() {
      codeResizeObserver?.disconnect();
      codeResizeObserver = null;
    }
    function requestCodeScan() {
      codeScanRequested = true;
    }
    function markCodeBlockDirty(codeElement) {
      dirtyCodeBlocks.add(codeElement);
    }
    return {
      normalizeCodeElement,
      flushCodeBlockScan,
      unmountAllCodeControls,
      observeCodeLayout,
      disconnectCodeLayoutObserver,
      requestCodeScan,
      markCodeBlockDirty
    };
  }

  // scripts/ai-chat-turbo-engine/src/core/auth.ts
  function hostnameMatches(hostname, domains) {
    return domains.some(
      (domain) => hostname === domain || hostname.endsWith("." + domain)
    );
  }
  var AUTH_ROUTE_SEGMENTS = /* @__PURE__ */ new Set([
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
    "password"
  ]);
  var AUTH_HOSTNAME_PREFIXES = [
    "auth.",
    "auth0.",
    "login.",
    "signin.",
    "accounts.",
    "sso."
  ];
  var engineActive = false;
  function setEngineActive(active) {
    engineActive = active;
  }
  function isEngineActive() {
    return engineActive;
  }
  function isAuthOrRedirectRoute(locationLike) {
    const source = locationLike || window.location;
    if (!source) return false;
    const hostname = String(source.hostname || "").toLowerCase();
    if (AUTH_HOSTNAME_PREFIXES.some((prefix) => hostname.startsWith(prefix))) {
      return true;
    }
    const pathname = String(source.pathname || "").toLowerCase();
    if (!pathname) return false;
    return pathname.split("/").filter(Boolean).some(
      (segment) => AUTH_ROUTE_SEGMENTS.has(segment.replace(/\.(?:html?|php|aspx?)$/, ""))
    );
  }
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
    if (hostnameMatches(hostname, ["grok.com"]) || hostname === "x.com" && pathname.startsWith("/i/grok")) {
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

  // scripts/ai-chat-turbo-engine/src/core/restore-coordination.ts
  function createRestoreCoordinator() {
    let active = null;
    const pending = {
      reasoning: false,
      tools: false
    };
    return {
      setPending(owner, value) {
        pending[owner] = value;
      },
      isPending(owner) {
        return pending[owner];
      },
      tryAcquire(owner) {
        if (active === null || active === owner) {
          active = owner;
          return true;
        }
        return false;
      },
      release(owner) {
        if (active === owner) active = null;
      },
      activeOwner() {
        return active;
      }
    };
  }

  // scripts/ai-chat-turbo-engine/src/storage/reasoning-memory.ts
  var memoryStore = createReportedStorage("localStorage", (failure) => {
    const scope = failure.operation === "write" || failure.operation === "remove" ? "save reasoning memory" : "load reasoning memory";
    reportRecoverableError(scope, failure.error);
  });
  function isObjectRecord(value) {
    return typeof value === "object" && value !== null;
  }
  function toReasoningRecord(value) {
    if (!isObjectRecord(value)) return null;
    const mode = value["mode"];
    if (mode !== "choice" && mode !== "toggle") return null;
    const record = { mode };
    const key = value["key"];
    if (typeof key === "string") record.key = key;
    const controlLabel = value["controlLabel"];
    if (typeof controlLabel === "string") record.controlLabel = controlLabel;
    const option = value["option"];
    if (typeof option === "string") record.option = option;
    const hint = value["hint"];
    if (typeof hint === "string") record.hint = hint;
    const resultLabel = value["resultLabel"];
    if (typeof resultLabel === "string") record.resultLabel = resultLabel;
    const label = value["label"];
    if (typeof label === "string") record.label = label;
    const on = value["on"];
    if (typeof on === "boolean") record.on = on;
    const ts = value["ts"];
    if (typeof ts === "number") record.ts = ts;
    const path = value["path"];
    if (Array.isArray(path)) {
      record.path = path.filter((part) => typeof part === "string");
    }
    return record;
  }
  function loadReasoningMemory() {
    try {
      const raw = memoryStore.read(STORAGE_KEY_REASONING);
      const parsed = raw === null || raw === "" ? {} : JSON.parse(raw);
      if (!isObjectRecord(parsed)) return {};
      const memory = {};
      for (const [scope, entry] of Object.entries(parsed)) {
        const record = toReasoningRecord(entry);
        if (record) memory[scope] = record;
      }
      return memory;
    } catch (error) {
      reportRecoverableError("load reasoning memory", error);
      return {};
    }
  }
  function saveReasoningMemory(memory) {
    memoryStore.writeJson(STORAGE_KEY_REASONING, memory);
  }
  function reasoningScope() {
    const account = location.pathname.match(/^\/u\/(\d+)(?:\/|$)/);
    return account ? `${location.hostname}#u${account[1]}` : location.hostname;
  }
  function readReasoningRecord(memory) {
    const all = memory ?? loadReasoningMemory();
    const scoped = all[reasoningScope()];
    if (scoped) return scoped;
    return all[location.hostname] ?? null;
  }
  function writeReasoningRecord(record) {
    const memory = loadReasoningMemory();
    const scope = reasoningScope();
    memory[scope] = record;
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

  // scripts/ai-chat-turbo-engine/src/storage/yuanbao-selection.ts
  var selectionStore = createReportedStorage("localStorage", (failure) => {
    const scope = failure.operation === "write" || failure.operation === "remove" ? "save Yuanbao selection" : "load Yuanbao selection";
    reportRecoverableError(scope, failure.error);
  });
  var MAX_LABEL = 120;
  function cleanLabel(raw) {
    if (typeof raw !== "string") return "";
    return raw.replace(/\s+/g, " ").trim().slice(0, MAX_LABEL);
  }
  function toSelectionRecord(value) {
    if (!isObjectRecord(value)) return null;
    const model = cleanLabel(value["model"]);
    const mode = cleanLabel(value["mode"]);
    if (!model && !mode) return null;
    const record = {};
    if (model) record.model = model;
    if (mode) record.mode = mode;
    const ts = value["ts"];
    if (typeof ts === "number" && Number.isFinite(ts)) record.ts = ts;
    return record;
  }
  function loadYuanbaoSelectionMemory() {
    try {
      const raw = selectionStore.read(STORAGE_KEY_YUANBAO_SELECTION);
      const parsed = raw === null || raw === "" ? {} : JSON.parse(raw);
      if (!isObjectRecord(parsed)) return {};
      const memory = {};
      for (const [scope, entry] of Object.entries(parsed)) {
        const record = toSelectionRecord(entry);
        if (record) memory[scope] = record;
      }
      return memory;
    } catch (error) {
      reportRecoverableError("load Yuanbao selection", error);
      return {};
    }
  }
  function saveYuanbaoSelectionMemory(memory) {
    selectionStore.writeJson(STORAGE_KEY_YUANBAO_SELECTION, memory);
  }
  function readYuanbaoSelectionRecord(memory) {
    const all = memory ?? loadYuanbaoSelectionMemory();
    return all[reasoningScope()] ?? all[location.hostname] ?? null;
  }
  function writeYuanbaoSelectionRecord(record) {
    const memory = loadYuanbaoSelectionMemory();
    const scope = reasoningScope();
    memory[scope] = record;
    if (scope !== location.hostname) delete memory[location.hostname];
    saveYuanbaoSelectionMemory(memory);
    return record;
  }
  function clearYuanbaoSelectionRecord() {
    const memory = loadYuanbaoSelectionMemory();
    delete memory[reasoningScope()];
    delete memory[location.hostname];
    saveYuanbaoSelectionMemory(memory);
  }

  // scripts/ai-chat-turbo-engine/src/core/reasoning.ts
  function createReasoningUtils(deps) {
    const {
      el,
      state,
      toolScope,
      withSelfMutation,
      triggerSendButton,
      requestUpdate,
      markRestoredTurn,
      requestFullTurnSync,
      restoreCoordinator: providedCoordinator
    } = deps;
    const restoreCoordinator = providedCoordinator ?? createRestoreCoordinator();
    let reasoningStatusNode = null;
    let reasoningRestoreTimer = 0;
    let reasoningRestoreAttempts = 0;
    let reasoningRestoreDone = false;
    let reasoningRestorePending = false;
    let yuanbaoMissingTriggerAttempts = 0;
    let applyingReasoning = false;
    let restoreToken = 0;
    const correctedToggleAttempts = /* @__PURE__ */ new Set();
    const choiceRestoreAttempts = /* @__PURE__ */ new Map();
    const popupCloseTimers = [];
    const yuanbaoRecordTimers = [];
    let conversationKey = `${location.origin}${location.pathname}`;
    let reasoningSettleTimer = 0;
    let reasoningMenuTrigger = null;
    let reasoningMenuTriggerAt = 0;
    let reasoningMenuTriggerLabel = "";
    let yuanbaoActionStatus = "";
    let yuanbaoAppliedKey = "";
    let yuanbaoAppliedAt = 0;
    const YUANBAO_APPLIED_WINDOW_MS = 15e3;
    function setReasoningPending(value) {
      reasoningRestorePending = value;
      restoreCoordinator.setPending("reasoning", value);
    }
    function releaseReasoningRestore() {
      setReasoningPending(false);
      restoreCoordinator.release("reasoning");
    }
    function isInsideTurboUI3(node) {
      if (!(node instanceof Element)) return false;
      return Boolean(node.closest("[id^='ai-turbo-'], .ai-turbo-code-bar"));
    }
    function controlLabel(control) {
      const visible = String(control.innerText || "").replace(/\s+/g, " ").trim();
      const raw = visible || control.getAttribute("aria-label") || control.getAttribute("title") || control.textContent || "";
      return raw.replace(/\s+/g, " ").trim().slice(0, 60);
    }
    function hasPopupSemantics(control) {
      if (control.hasAttribute("aria-expanded")) return true;
      const popup = control.getAttribute("aria-haspopup");
      if (popup !== null && popup !== "false") return true;
      if (control.hasAttribute("gemmenutrigger")) return true;
      if (control.hasAttribute("cdkoverlayorigin")) return true;
      if (control.matches("[data-radix-menu-trigger], .mat-mdc-menu-trigger")) {
        return true;
      }
      return false;
    }
    function explicitToggleState(control) {
      if (control instanceof HTMLInputElement) {
        if (control.type !== "checkbox" && control.type !== "radio") return null;
        return control.checked === true;
      }
      const input = control.querySelector(
        'input[type="checkbox"], input[type="radio"]'
      );
      if (input instanceof HTMLInputElement) return input.checked === true;
      const pressed = control.getAttribute("aria-pressed");
      if (pressed === "true" || pressed === "false") return pressed === "true";
      const checked = control.getAttribute("aria-checked");
      if (checked === "true" || checked === "false") return checked === "true";
      const dataState = control.getAttribute("data-state");
      if (dataState === "on" || dataState === "checked" || dataState === "active") {
        return true;
      }
      if (dataState === "off" || dataState === "unchecked" || dataState === "inactive") {
        return false;
      }
      return null;
    }
    function controlOnState(control) {
      const explicit = explicitToggleState(control);
      if (explicit !== null) return explicit;
      if (hasPopupSemantics(control)) return null;
      const dataState = control.getAttribute("data-state");
      if (dataState !== null && dataState !== "") {
        return /^(selected|true)$/i.test(dataState) ? true : null;
      }
      const cls = control.className;
      if (/(^|[\s_-])(active|selected|checked|is-on)([\s_-]|$)/i.test(cls))
        return true;
      return null;
    }
    function controlKey(control) {
      const raw = control.getAttribute("data-test-id") || control.getAttribute("data-testid") || control.id || control.getAttribute("aria-label") || "";
      return String(raw).replace(/\s+/g, " ").trim().slice(0, 60);
    }
    function toggleAttemptKey(control, desired) {
      const identity = controlKey(control) || controlLabel(control) || "reasoning-toggle";
      return `${conversationKey}|${identity}|${desired ? "on" : "off"}`;
    }
    function choiceAttemptKey(control, saved) {
      const path = Array.isArray(saved.path) ? saved.path.join(">") : "";
      return `${conversationKey}|${controlKey(control)}|${saved.option || ""}|${path}`;
    }
    function syncConversationScope() {
      const nextKey = `${location.origin}${location.pathname}`;
      if (nextKey === conversationKey) return;
      conversationKey = nextKey;
      correctedToggleAttempts.clear();
      choiceRestoreAttempts.clear();
    }
    function clickControlOnce(control) {
      try {
        control.click();
        return true;
      } catch (error) {
        reportRecoverableError("restore reasoning control", error);
        return false;
      }
    }
    function hoverControlOnce(control) {
      try {
        const rect = control.getBoundingClientRect();
        const init = {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2
        };
        control.dispatchEvent(new MouseEvent("mouseover", init));
        control.dispatchEvent(new MouseEvent("mousemove", init));
        return true;
      } catch (error) {
        reportRecoverableError("hover reasoning control", error);
        return false;
      }
    }
    function beginRestore() {
      restoreToken += 1;
      applyingReasoning = false;
      return restoreToken;
    }
    function restoreIsStale(token) {
      return token !== restoreToken;
    }
    function settleToggleCorrection(control, desired, token) {
      let attempts = 0;
      const check = () => {
        reasoningSettleTimer = 0;
        if (restoreIsStale(token)) return;
        attempts += 1;
        const current = controlOnState(control);
        if (current === desired || attempts >= 8 || !control.isConnected) {
          applyingReasoning = false;
          return;
        }
        reasoningSettleTimer = window.setTimeout(check, 100);
      };
      check();
    }
    function isDropdownTrigger(control) {
      if (control.hasAttribute("aria-expanded")) return true;
      const popup = control.getAttribute("aria-haspopup");
      if (popup !== null && popup !== "false") return true;
      if (control.hasAttribute("gemmenutrigger") || control.hasAttribute("cdkoverlayorigin")) return true;
      if (control.matches("[data-state], [data-radix-menu-trigger], .mat-mdc-menu-trigger")) return true;
      const label = control.getAttribute("aria-label") || "";
      return /^(open|选择|打开).{0,20}(picker|menu|mode|model)/i.test(label.trim());
    }
    function dispatchEscape() {
      const esc = new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        keyCode: 27,
        bubbles: true,
        cancelable: true
      });
      if (document.activeElement) document.activeElement.dispatchEvent(esc);
      document.dispatchEvent(esc);
    }
    function closeOpenPopup(control = null) {
      dispatchEscape();
      const trigger = control ?? reasoningMenuTrigger;
      if (!trigger || !trigger.isConnected) return;
      const settle = (remaining) => {
        if (!trigger.isConnected) return;
        if (trigger.getAttribute("aria-expanded") !== "true") return;
        if (!clickControlOnce(trigger)) return;
        if (remaining <= 1) return;
        const timer2 = window.setTimeout(() => {
          const index = popupCloseTimers.indexOf(timer2);
          if (index >= 0) popupCloseTimers.splice(index, 1);
          settle(remaining - 1);
        }, 160);
        popupCloseTimers.push(timer2);
      };
      const timer = window.setTimeout(() => {
        const index = popupCloseTimers.indexOf(timer);
        if (index >= 0) popupCloseTimers.splice(index, 1);
        settle(3);
      }, 120);
      popupCloseTimers.push(timer);
    }
    function popupRootFor(control) {
      const id = control.getAttribute("aria-controls");
      const byId = id ? document.getElementById(id) : null;
      if (byId) return byId;
      const owner = control.closest(REASONING_MENU_SELECTOR);
      return owner instanceof HTMLElement ? owner : null;
    }
    function hasVisibleMenu() {
      return Array.from(document.querySelectorAll(REASONING_MENU_SELECTOR)).some(
        (node) => !isInsideTurboUI3(node) && nodeVisible3(node)
      );
    }
    function rowScopedText(node, selector) {
      if (!(node instanceof Element)) return "";
      const part = Array.from(
        node.querySelectorAll(selector)
      ).find((candidate) => {
        if (isInsideTurboUI3(candidate) || !nodeVisible3(candidate)) return false;
        const owner = candidate.closest(
          "gem-menu-item, [role='menuitem'], [role='menuitemradio'], [role='option'], [role='radio']"
        );
        return owner === node;
      });
      return part ? String(part.innerText || "").replace(/\s+/g, " ").trim() : "";
    }
    function rowLabel(node) {
      const structured = rowScopedText(node, ".label");
      if (structured) return structured;
      const line = (node.innerText || "").split("\n").find((part) => part.trim());
      return line ? line.replace(/\s+/g, " ").trim() : "";
    }
    function rowHint(node) {
      const structured = rowScopedText(node, ".sublabel");
      if (structured) return structured;
      const lines = (node.innerText || "").split("\n").map((part) => part.replace(/\s+/g, " ").trim()).filter(Boolean);
      return lines[1] || "";
    }
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
      if (node.querySelector(
        ".selected, .checked, [aria-label='Selected'], [aria-label='selected'], [aria-label='已选中'], [data-state='checked'], [data-mat-icon-name='check']"
      )) {
        return true;
      }
      return null;
    }
    function menuHasSelectionState(menu) {
      if (!menu) return false;
      return Boolean(
        menu.querySelector(
          "[aria-checked], [aria-selected], [role='menuitemradio'], [role='radio'], .selected, .checked, [aria-label='Selected'], [aria-label='已选中'], [data-mat-icon-name='check']"
        )
      );
    }
    function nodeVisible3(node) {
      if (!(node instanceof HTMLElement)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width >= 1 && rect.height >= 1;
    }
    function choiceRowIsSelected(row) {
      const explicit = choiceRowSelected(row);
      if (explicit !== null) return explicit;
      const menu = row.closest(REASONING_MENU_SELECTOR);
      return menu && menuHasSelectionState(menu) ? false : null;
    }
    function choicePathForRow(row) {
      const path = [];
      let menu = row.closest(REASONING_MENU_SELECTOR);
      let depth = 0;
      while (menu && depth < 5) {
        const menuId = menu.id;
        if (!menuId) break;
        const parent = Array.from(
          document.querySelectorAll("[aria-controls]")
        ).find(
          (node) => {
            if (isInsideTurboUI3(node) || !nodeVisible3(node)) return false;
            if (node.getAttribute("aria-controls") !== menuId) return false;
            const popup = node.getAttribute("aria-haspopup");
            if (popup === null || popup === "false") return false;
            const owner2 = node.closest(REASONING_MENU_SELECTOR);
            return Boolean(owner2 && owner2 !== menu);
          }
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
        "gem-menu-item, [role='menuitem'], [role='menuitemradio'], [role='option'], [aria-checked], [aria-selected]"
      );
      if (!(row instanceof HTMLElement) || !row.closest(REASONING_MENU_SELECTOR)) {
        return null;
      }
      const popup = row.getAttribute("aria-haspopup");
      if (popup !== null && popup !== "false") return null;
      return rowLabel(row) ? row : null;
    }
    function findPathParent(menu, label) {
      if (!menu || !label) return null;
      const parents = Array.from(
        menu.querySelectorAll("[aria-haspopup]:not([aria-haspopup='false'])")
      ).filter((node) => {
        if (!(node instanceof HTMLElement)) return false;
        if (isInsideTurboUI3(node) || !nodeVisible3(node)) return false;
        const owner = node.closest("[role='menu']");
        if (owner && owner !== menu && menu.contains(owner)) return false;
        return rowLabel(node) === label;
      });
      return parents[0] || null;
    }
    function findExactChoiceRow(menu, option) {
      if (!menu || !option) return null;
      const rows = Array.from(
        menu.querySelectorAll(CHOICE_OPTION_SELECTOR)
      ).filter(
        (node) => {
          if (isInsideTurboUI3(node) || !nodeVisible3(node)) return false;
          if (node.closest(REASONING_MENU_SELECTOR) !== menu) return false;
          const popup = node.getAttribute("aria-haspopup");
          if (popup !== null && popup !== "false") return false;
          return rowLabel(node) === option;
        }
      );
      return rows.reduce((deepest, node) => {
        if (!deepest) return node;
        return deepest.contains(node) ? node : deepest;
      }, null);
    }
    function submenuForParent(parent) {
      const id = parent.getAttribute("aria-controls");
      const menu = id ? document.getElementById(id) : null;
      return menu && nodeVisible3(menu) ? menu : null;
    }
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
    function choiceTokens(saved) {
      const option = String(saved.option || "").trim();
      if (Array.isArray(saved.path) && saved.path.length) {
        return [...saved.path, option].map((part) => String(part).trim()).filter(Boolean);
      }
      const currentValue = option.replace(/^.*\bcurrently\s+/i, "").trim();
      return currentValue.split(/\s+/).filter(Boolean);
    }
    function upgradeChoiceRecord(saved, control, info) {
      const stableKey = controlKey(control);
      if (!stableKey || !info || !info.option) return;
      const samePath = JSON.stringify(Array.isArray(saved.path) ? saved.path : []) === JSON.stringify(info.path);
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
        ts: Date.now()
      });
      renderReasoningStatus();
    }
    function findRowIn(root, token) {
      if (!root || !token) return null;
      const rows = Array.from(
        root.querySelectorAll(CHOICE_OPTION_SELECTOR)
      ).filter((node) => {
        if (isInsideTurboUI3(node)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width >= 1 && rect.height >= 1;
      });
      const exact = rows.filter((node) => rowLabel(node) === token);
      if (exact.length) {
        return exact.reduce((best, node) => best.contains(node) ? node : best);
      }
      const tail = rows.filter((node) => rowLabel(node).endsWith(token));
      if (tail.length === 1) return tail[0];
      const head = rows.filter((node) => rowLabel(node).startsWith(`${token} `));
      return head.length === 1 ? head[0] : null;
    }
    function interactiveTarget(node) {
      if (node.matches("button, a, [role='menuitemradio'], [role='radio']")) return node;
      const inner = node.querySelector("button, a");
      return inner instanceof HTMLElement ? inner : node;
    }
    function findRowInOpenMenus(token) {
      const menus = Array.from(
        document.querySelectorAll(REASONING_MENU_SELECTOR)
      ).filter((node) => {
        if (isInsideTurboUI3(node) || toolScope.isInside(node)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width >= 1 && rect.height >= 1;
      });
      for (let i = menus.length - 1; i >= 0; i -= 1) {
        const row = findRowIn(menus[i], token);
        if (row) return row;
      }
      return null;
    }
    function findSubmenuParent(root, token) {
      if (!root) return null;
      const parents = Array.from(
        root.querySelectorAll("[aria-haspopup]:not([aria-haspopup='false'])")
      ).filter((node) => {
        if (!(node instanceof HTMLElement)) return false;
        if (isInsideTurboUI3(node)) return false;
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
    function restorePathChoice(saved, control, onSettled, token) {
      const path = (Array.isArray(saved.path) ? saved.path : []).map((part) => String(part).trim()).filter(Boolean);
      const option = String(saved.option || "").trim();
      if (!option) {
        onSettled(false, false);
        return;
      }
      let settled = false;
      let lastRow = null;
      const finish = (ok, conclusive) => {
        if (settled) return;
        settled = true;
        if (restoreIsStale(token)) return;
        const info = ok ? choiceRowInfo(lastRow) : null;
        window.setTimeout(() => closeOpenPopup(control), 100);
        if (info) {
          window.setTimeout(() => {
            if (control.isConnected) upgradeChoiceRecord(saved, control, info);
          }, 300);
        }
        applyingReasoning = false;
        onSettled(ok, conclusive === true);
      };
      const waitForSubmenu = (parent, done, attempt) => {
        if (settled || restoreIsStale(token)) return;
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
        if (settled || restoreIsStale(token)) return;
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
        parent.dispatchEvent(
          new PointerEvent("pointerover", { bubbles: true, cancelable: true, view: window })
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
        if (settled || restoreIsStale(token)) return;
        const root = popupRootFor(control);
        if (root && nodeVisible3(root)) {
          done(root);
          return;
        }
        const fallback = Array.from(
          document.querySelectorAll(REASONING_MENU_SELECTOR)
        ).find((node) => !isInsideTurboUI3(node) && nodeVisible3(node));
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
          if (restoreIsStale(token)) return;
          closeOpenPopup(control);
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
                (conclusive) => finish(false, conclusive === true)
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
          (conclusive) => finish(false, conclusive === true)
        );
      }, 0);
    }
    function restoreChoice(saved, control, onSettled, restoreId) {
      const tokens = choiceTokens(saved);
      if (!tokens.length) {
        onSettled(false, false);
        return;
      }
      let index = 0;
      let settled = false;
      let lastRow = null;
      const finish = (ok, conclusive) => {
        if (settled) return;
        settled = true;
        if (restoreIsStale(restoreId)) return;
        const info = ok ? choiceRowInfo(lastRow) : null;
        window.setTimeout(() => closeOpenPopup(control), 100);
        if (info) {
          window.setTimeout(() => {
            if (control.isConnected) upgradeChoiceRecord(saved, control, info);
          }, 300);
        }
        applyingReasoning = false;
        onSettled(ok, conclusive === true);
      };
      const step = (attempt) => {
        if (settled || restoreIsStale(restoreId)) return;
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
          parent.dispatchEvent(
            new PointerEvent("pointerover", { bubbles: true, cancelable: true, view: window })
          );
          parent.dispatchEvent(new MouseEvent("mouseenter", { view: window }));
          triggerSendButton(interactiveTarget(parent));
          const lookInSub = (deep) => {
            if (settled || restoreIsStale(restoreId)) return;
            const sub = document.getElementById(parent.getAttribute("aria-controls") || "");
            const row = findRowIn(sub, token) || findRowIn(popupRootFor(control), token) || findRowInOpenMenus(token);
            if (row) {
              lastRow = row;
              triggerSendButton(interactiveTarget(row));
              next();
              return;
            }
            if (deep >= 6) {
              closeOpenPopup(control);
              finish(false, true);
              return;
            }
            window.setTimeout(() => lookInSub(deep + 1), 200);
          };
          window.setTimeout(() => lookInSub(0), 250);
          return;
        }
        if (attempt >= 8) {
          const menuWasOpen = hasVisibleMenu();
          closeOpenPopup(control);
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
        closeOpenPopup(control);
        window.setTimeout(() => {
          triggerSendButton(interactiveTarget(control));
          window.setTimeout(() => step(0), 350);
        }, 200);
      };
      applyingReasoning = true;
      triggerSendButton(interactiveTarget(control));
      window.setTimeout(() => step(0), 350);
    }
    function observeControlChoice(control, labelBefore, startedAt) {
      [400, 900, 1600, 2600].forEach((delay) => {
        window.setTimeout(() => {
          if (applyingReasoning || !control.isConnected) return;
          const labelNow = controlLabel(control);
          if (!labelNow || labelNow === labelBefore) return;
          const memory = loadReasoningMemory();
          const saved = readReasoningRecord(memory);
          if (saved && saved.mode === "choice") {
            if (startedAt && saved.ts && saved.ts >= startedAt) return;
            if (saved.option === labelNow) return;
          }
          const root = popupRootFor(control);
          if (!hasVisibleMenu() && !(root && nodeVisible3(root))) return;
          writeReasoningRecord({
            mode: "choice",
            key: controlKey(control),
            controlLabel: labelBefore,
            option: labelNow,
            ts: Date.now()
          });
          renderReasoningStatus();
        }, delay);
      });
    }
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
    function pairOptionClick(target) {
      if (isToolControlElement(target) || toolScope.isInside(target)) return false;
      const row = choiceRowForTarget(target);
      if (!row) return false;
      const trigger = reasoningMenuTrigger;
      if (!trigger || !trigger.isConnected) return false;
      if (Date.now() - reasoningMenuTriggerAt > 2e4) return false;
      if (row === trigger || row.contains(trigger)) return false;
      const optionText = rowLabel(row);
      if (!optionText) return false;
      const menu = row.closest(REASONING_MENU_SELECTOR);
      const path = choicePathForRow(row);
      const explicitChoice = row.matches(CHOICE_RADIO_SELECTOR);
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
        ts
      };
      window.setTimeout(() => {
        if (applyingReasoning) return;
        writeReasoningRecord(record);
        renderReasoningStatus();
        captureChoiceResult(trigger, record);
      }, 0);
      return true;
    }
    function handleReasoningClick(event) {
      if (isEngineDormant()) return;
      if (!state.rememberReasoning || applyingReasoning) return;
      const target = event.target;
      if (!(target instanceof Element) || isInsideTurboUI3(target)) return;
      if (isYuanbaoHost()) {
        if (isToolControlElement(target) || toolScope.isInside(target)) return;
        if (handleYuanbaoSelectionClick(target)) return;
      }
      if (isToolControlElement(target) || toolScope.isInside(target)) return;
      if (pairOptionClick(target)) return;
      if (target.closest(REASONING_MENU_SELECTOR)) return;
      const control = target.closest(REASONING_CONTROL_SELECTOR);
      if (!(control instanceof HTMLElement)) return;
      const startedAt = Date.now();
      const labelBefore = controlLabel(control);
      if (!labelBefore) return;
      const keywordMatch = REASONING_CONTROL_PATTERN.test(labelBefore);
      if (!keywordMatch && !isDropdownTrigger(control)) return;
      reasoningMenuTrigger = control;
      reasoningMenuTriggerAt = Date.now();
      reasoningMenuTriggerLabel = labelBefore;
      if (keywordMatch) {
        window.setTimeout(() => {
          if (applyingReasoning || !control.isConnected) return;
          const on = controlOnState(control);
          if (on === null) return;
          writeReasoningRecord({ mode: "toggle", label: labelBefore, on, ts: Date.now() });
          renderReasoningStatus();
        }, 0);
      }
      if (keywordMatch && explicitToggleState(control) !== null) return;
      observeControlChoice(control, labelBefore, startedAt);
    }
    function handleDehydratedClick(event) {
      if (isEngineDormant()) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const turnElement = target.closest(".ai-turbo-dehydrated");
      if (!(turnElement instanceof HTMLElement)) return;
      markRestoredTurn(turnElement);
      withSelfMutation(() => {
        turnElement.classList.remove("ai-turbo-dehydrated");
        turnElement.style.removeProperty("--turbo-cached-h");
      });
      requestFullTurnSync();
      requestUpdate();
    }
    function renderReasoningStatus() {
      if (!reasoningStatusNode) return;
      reasoningStatusNode.textContent = "";
      if (!state.rememberReasoning) {
        reasoningStatusNode.textContent = "推理记忆：已关闭";
        return;
      }
      if (isYuanbaoHost() || readYuanbaoSelectionRecord()) {
        const saved2 = readYuanbaoSelectionRecord();
        if (!saved2) {
          reasoningStatusNode.textContent = "推理记忆：未记录（在模型菜单里选择模型或模式即可）";
          return;
        }
        const shown2 = [saved2.model, saved2.mode].filter(Boolean).join(" + ");
        reasoningStatusNode.textContent = `推理记忆：${shown2 || "未记录"} `;
        if (yuanbaoActionStatus) {
          reasoningStatusNode.appendChild(
            el("span", {}, [`· ${yuanbaoActionStatus} `])
          );
        }
        reasoningStatusNode.appendChild(
          el(
            "button",
            {
              type: "button",
              onclick: () => {
                clearReasoningRestoreTimer();
                clearYuanbaoSelectionRecord();
                clearReasoningRecord();
                yuanbaoActionStatus = "";
                reasoningRestoreDone = true;
                renderReasoningStatus();
              }
            },
            ["清除"]
          )
        );
        return;
      }
      const saved = readReasoningRecord();
      if (!saved || !saved.mode) {
        reasoningStatusNode.textContent = "推理记忆：未记录（在页面里点一次强度/模型选项即可）";
        return;
      }
      const pathText = saved.mode === "choice" && Array.isArray(saved.path) && saved.path.length ? `${saved.path.join(" / ")} / ` : "";
      const shown = saved.mode === "choice" ? `${saved.controlLabel || "控件"} → ${pathText}${saved.option}` : `${saved.label}（${saved.on ? "开" : "关"}）`;
      reasoningStatusNode.textContent = `推理记忆：${shown} `;
      reasoningStatusNode.appendChild(
        el(
          "button",
          {
            type: "button",
            onclick: () => {
              clearReasoningRecord();
              renderReasoningStatus();
            }
          },
          ["清除"]
        )
      );
    }
    function findRememberedControl(saved) {
      const visible = Array.from(
        document.querySelectorAll(REASONING_CONTROL_SELECTOR)
      ).filter(
        (node) => !isInsideTurboUI3(node) && !toolScope.isInside(node) && !isToolControlElement(node) && nodeVisible3(node)
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
        const byLabelPrefix = visible.find(
          (node) => controlLabel(node).startsWith(`${saved.controlLabel} `)
        );
        if (byLabelPrefix) return byLabelPrefix;
      }
      return visible.find((node) => REASONING_CONTROL_PATTERN.test(controlLabel(node))) || null;
    }
    function isYuanbaoHost() {
      if (hostnameMatches(location.hostname.toLowerCase(), [
        "yuanbao.tencent.com"
      ])) {
        return true;
      }
      return Array.from(
        document.querySelectorAll(YUANBAO_MODEL_TRIGGER_SELECTOR)
      ).some((node) => !isInsideTurboUI3(node));
    }
    function cleanSelectionText(raw) {
      return raw.replace(/\s+/g, " ").trim().slice(0, 120);
    }
    function selectionMatches(actual, expected) {
      return actual.toLowerCase().replace(/\s+/g, " ").trim() === expected.toLowerCase().replace(/\s+/g, " ").trim();
    }
    function yuanbaoTrigger() {
      return Array.from(
        document.querySelectorAll(YUANBAO_MODEL_TRIGGER_SELECTOR)
      ).find((node) => !isInsideTurboUI3(node) && nodeVisible3(node)) ?? null;
    }
    function yuanbaoPanelOpen(trigger) {
      return trigger.getAttribute("aria-expanded") === "true";
    }
    function yuanbaoSelectionKey(record) {
      return `${conversationKey}|${record.model || ""}|${record.mode || ""}`;
    }
    function yuanbaoSelectionApplied(record, trigger) {
      if (!trigger || !yuanbaoAppliedKey) return false;
      if (yuanbaoAppliedKey !== yuanbaoSelectionKey(record)) return false;
      if (Date.now() - yuanbaoAppliedAt > YUANBAO_APPLIED_WINDOW_MS) return false;
      if (yuanbaoPanelOpen(trigger) || yuanbaoMainMenu() || yuanbaoModelMenu()) {
        return false;
      }
      return !record.mode || selectionMatches(yuanbaoModeValue(trigger), record.mode);
    }
    function yuanbaoMainMenu() {
      const rows = Array.from(
        document.querySelectorAll(YUANBAO_MODEL_ROW_SELECTOR)
      ).filter((row) => !isInsideTurboUI3(row) && nodeVisible3(row));
      for (const row of rows) {
        const menu = row.closest(REASONING_MENU_SELECTOR);
        if (menu instanceof HTMLElement && menu.getAttribute("aria-label") !== "模型列表" && nodeVisible3(menu)) {
          return menu;
        }
      }
      return null;
    }
    function yuanbaoModelMenu() {
      return Array.from(
        document.querySelectorAll(YUANBAO_MODEL_MENU_SELECTOR)
      ).find((node) => !isInsideTurboUI3(node) && nodeVisible3(node)) ?? null;
    }
    function yuanbaoLeafTexts(row) {
      const leaves = Array.from(row.querySelectorAll("span")).filter(
        (node) => !isInsideTurboUI3(node) && nodeVisible3(node) && node.querySelector("span") === null
      ).map((node) => cleanSelectionText(node.textContent || "")).filter(Boolean);
      if (leaves.length) return leaves;
      return (row.innerText || row.textContent || "").split("\n").map(cleanSelectionText).filter(Boolean);
    }
    function yuanbaoRowTitle(row) {
      return yuanbaoLeafTexts(row)[0] || "";
    }
    function yuanbaoModeValue(trigger) {
      if (!trigger) return "";
      const label = trigger.querySelector(YUANBAO_MODE_LABEL_SELECTOR);
      if (label instanceof HTMLElement) {
        const text = cleanSelectionText(label.textContent || "");
        if (text) return text;
      }
      const main = yuanbaoMainMenu();
      if (main) {
        const selected = yuanbaoModeRows(main).find(
          (row) => choiceRowIsSelected(row) === true
        );
        if (selected) return yuanbaoRowTitle(selected);
      }
      return "";
    }
    function yuanbaoModeRows(menu) {
      return Array.from(
        menu.querySelectorAll(CHOICE_RADIO_SELECTOR)
      ).filter((row) => {
        if (isInsideTurboUI3(row) || !nodeVisible3(row)) return false;
        if (row.closest(REASONING_MENU_SELECTOR) !== menu) return false;
        return !row.matches(YUANBAO_MODEL_ROW_SELECTOR);
      });
    }
    function yuanbaoModelRow(menu) {
      return Array.from(
        menu.querySelectorAll(YUANBAO_MODEL_ROW_SELECTOR)
      ).find((row) => row.closest(REASONING_MENU_SELECTOR) === menu) ?? null;
    }
    function yuanbaoModelValue(menu) {
      if (menu) {
        const row = yuanbaoModelRow(menu);
        if (row) {
          const parts = yuanbaoLeafTexts(row);
          if (parts.length >= 2) return parts[1];
        }
      }
      const modelMenu = yuanbaoModelMenu();
      if (modelMenu) {
        const selected = Array.from(
          modelMenu.querySelectorAll(CHOICE_RADIO_SELECTOR)
        ).find(
          (row) => row.closest(REASONING_MENU_SELECTOR) === modelMenu && choiceRowIsSelected(row) === true
        );
        if (selected) return yuanbaoRowTitle(selected);
      }
      return "";
    }
    function yuanbaoSelectionRow(menu, expected) {
      return Array.from(
        menu.querySelectorAll(CHOICE_RADIO_SELECTOR)
      ).find(
        (row) => row.closest(REASONING_MENU_SELECTOR) === menu && selectionMatches(yuanbaoRowTitle(row), expected)
      ) ?? null;
    }
    function yuanbaoModelConflicts(model, mode) {
      if (!model || !mode) return false;
      return /^hy4\b/i.test(model) && !selectionMatches(mode, "专家模式");
    }
    function closeYuanbaoPanel(trigger, done, token, attempt = 0) {
      if (restoreIsStale(token)) return;
      if (!trigger.isConnected) {
        done();
        return;
      }
      const expanded = yuanbaoPanelOpen(trigger);
      const mounted = yuanbaoMainMenu() !== null || yuanbaoModelMenu() !== null;
      if (!expanded && !mounted) {
        done();
        return;
      }
      if (attempt >= 8) {
        done();
        return;
      }
      if (attempt === 0) {
        clickControlOnce(trigger);
      } else if (attempt === 4 && expanded) {
        clickControlOnce(trigger);
      }
      window.setTimeout(() => {
        closeYuanbaoPanel(trigger, done, token, attempt + 1);
      }, 160);
    }
    function waitForYuanbao(read, done, token, attempt = 0) {
      if (restoreIsStale(token)) return;
      const node = read();
      if (node || attempt >= 12) {
        done(node);
        return;
      }
      window.setTimeout(() => {
        waitForYuanbao(read, done, token, attempt + 1);
      }, 160);
    }
    function openYuanbaoPanel(trigger, done, token) {
      if (restoreIsStale(token)) return;
      const open = yuanbaoMainMenu();
      if (open) {
        done(open);
        return;
      }
      if (trigger.getAttribute("aria-expanded") !== "true") {
        if (!clickControlOnce(trigger)) {
          done(null);
          return;
        }
      }
      waitForYuanbao(
        yuanbaoMainMenu,
        (menu) => {
          if (restoreIsStale(token)) return;
          done(menu);
        },
        token
      );
    }
    function waitYuanbaoSelection(read, expected, done, token, attempt = 0) {
      if (restoreIsStale(token)) return;
      const actual = read();
      if (actual && selectionMatches(actual, expected)) {
        done(true);
        return;
      }
      if (attempt >= 10) {
        done(false);
        return;
      }
      window.setTimeout(
        () => waitYuanbaoSelection(read, expected, done, token, attempt + 1),
        160
      );
    }
    function openYuanbaoModelSubmenu(parent, done, token, attempt = 0) {
      if (restoreIsStale(token)) return;
      const opened = yuanbaoModelMenu();
      if (opened) {
        done(opened);
        return;
      }
      if (attempt >= 8) {
        done(null);
        return;
      }
      hoverControlOnce(parent);
      if (attempt >= 3) clickControlOnce(interactiveTarget(parent));
      window.setTimeout(() => {
        openYuanbaoModelSubmenu(parent, done, token, attempt + 1);
      }, 180);
    }
    function restoreYuanbaoModel(saved, trigger, token, done) {
      if (!saved.model) {
        done(true, false);
        return;
      }
      openYuanbaoPanel(
        trigger,
        (menu) => {
          if (!menu) {
            done(false, false);
            return;
          }
          const current = yuanbaoModelValue(menu);
          if (current && selectionMatches(current, saved.model || "")) {
            done(true, false);
            return;
          }
          const choose = (modelMenu2) => {
            const row = yuanbaoSelectionRow(modelMenu2, saved.model || "");
            if (!row) {
              done(false, true);
              return;
            }
            if (choiceRowIsSelected(row) === true) {
              done(true, false);
              return;
            }
            if (!clickControlOnce(interactiveTarget(row))) {
              done(false, false);
              return;
            }
            window.setTimeout(() => {
              if (restoreIsStale(token)) return;
              openYuanbaoPanel(
                trigger,
                (currentMenu) => {
                  if (!currentMenu) {
                    done(false, false);
                    return;
                  }
                  waitYuanbaoSelection(
                    () => yuanbaoModelValue(currentMenu),
                    saved.model || "",
                    (ok) => done(ok, !ok),
                    token
                  );
                },
                token
              );
            }, 220);
          };
          const modelMenu = yuanbaoModelMenu();
          if (modelMenu) {
            choose(modelMenu);
            return;
          }
          const parent = yuanbaoModelRow(menu);
          if (!parent) {
            done(false, true);
            return;
          }
          openYuanbaoModelSubmenu(
            parent,
            (sub) => {
              if (restoreIsStale(token)) return;
              if (!sub) {
                done(false, false);
                return;
              }
              choose(sub);
            },
            token
          );
        },
        token
      );
    }
    function restoreYuanbaoMode(saved, trigger, token, done) {
      if (!saved.mode) {
        done(true, false);
        return;
      }
      openYuanbaoPanel(
        trigger,
        (menu) => {
          if (!menu) {
            done(false, false);
            return;
          }
          const current = yuanbaoModeValue(trigger);
          if (current && selectionMatches(current, saved.mode || "")) {
            done(true, false);
            return;
          }
          const row = yuanbaoSelectionRow(menu, saved.mode || "");
          if (!row) {
            done(false, true);
            return;
          }
          if (choiceRowIsSelected(row) === true) {
            done(true, false);
            return;
          }
          if (!clickControlOnce(interactiveTarget(row))) {
            done(false, false);
            return;
          }
          waitYuanbaoSelection(
            () => yuanbaoModeValue(trigger),
            saved.mode || "",
            (ok) => done(ok, !ok),
            token
          );
        },
        token
      );
    }
    function migrateYuanbaoReasoningRecord(trigger) {
      const legacy = readReasoningRecord();
      const option = cleanSelectionText(legacy?.option || legacy?.label || "");
      if (!option) return null;
      const mode = yuanbaoModeValue(trigger);
      let record = null;
      if (/^(?:hy\s?\d|hy[0-9]|deepseek|混元)/i.test(option)) {
        record = { model: option };
      } else if (/快速|深度|专家|expert|think/i.test(option)) {
        record = { mode: option };
      }
      if (!record) return null;
      if (mode && !record.mode) record.mode = mode;
      record.ts = Date.now();
      writeYuanbaoSelectionRecord(record);
      return record;
    }
    function restoreYuanbaoSelection() {
      const trigger = yuanbaoTrigger();
      const stored = readYuanbaoSelectionRecord();
      const saved = stored ?? migrateYuanbaoReasoningRecord(trigger);
      if (!saved) {
        reasoningRestoreDone = true;
        releaseReasoningRestore();
        return;
      }
      if (yuanbaoSelectionApplied(saved, trigger)) {
        reasoningRestoreDone = true;
        releaseReasoningRestore();
        return;
      }
      if (applyingReasoning) return;
      setReasoningPending(true);
      if (!trigger) {
        yuanbaoMissingTriggerAttempts += 1;
        if (yuanbaoMissingTriggerAttempts >= 20) {
          reasoningRestoreDone = true;
          yuanbaoActionStatus = "未找到模型菜单，已停止恢复";
          releaseReasoningRestore();
          renderReasoningStatus();
        }
        return;
      }
      yuanbaoMissingTriggerAttempts = 0;
      if (!restoreCoordinator.tryAcquire("reasoning")) return;
      if (yuanbaoModelConflicts(saved.model || "", saved.mode || "")) {
        yuanbaoActionStatus = "模型与模式组合不兼容，已停止恢复";
        reasoningRestoreDone = true;
        releaseReasoningRestore();
        renderReasoningStatus();
        return;
      }
      const token = beginRestore();
      applyingReasoning = true;
      setReasoningPending(true);
      let settled = false;
      let modelConfirmed = !saved.model;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        applyingReasoning = false;
        reasoningRestoreDone = true;
        releaseReasoningRestore();
        yuanbaoActionStatus = ok ? "已恢复模型与模式" : "未能恢复模型与模式";
        if (ok) {
          yuanbaoAppliedKey = yuanbaoSelectionKey(saved);
          yuanbaoAppliedAt = Date.now();
        }
        renderReasoningStatus();
      };
      const settleAfter = (ok, conclusive, next) => {
        if (settled || restoreIsStale(token)) return;
        if (!ok) {
          closeYuanbaoPanel(trigger, () => finish(false), token);
          return;
        }
        if (conclusive) {
          closeYuanbaoPanel(trigger, () => finish(false), token);
          return;
        }
        next();
      };
      const verifyAndClose = () => {
        if (settled || restoreIsStale(token)) return;
        openYuanbaoPanel(
          trigger,
          (menu) => {
            const modeOk = !saved.mode || selectionMatches(yuanbaoModeValue(trigger), saved.mode);
            const modelOk = !saved.model || modelConfirmed && (!menu || selectionMatches(yuanbaoModelValue(menu), saved.model));
            closeYuanbaoPanel(trigger, () => finish(modeOk && modelOk), token);
          },
          token
        );
      };
      restoreYuanbaoModel(
        saved,
        trigger,
        token,
        (modelOk, modelConclusive) => {
          if (modelOk && !modelConclusive) modelConfirmed = true;
          settleAfter(modelOk, modelConclusive, () => {
            restoreYuanbaoMode(
              saved,
              trigger,
              token,
              (modeOk, modeConclusive) => {
                settleAfter(modeOk, modeConclusive, verifyAndClose);
              }
            );
          });
        }
      );
    }
    function mergeYuanbaoSelection(next) {
      const previous = readYuanbaoSelectionRecord();
      const merged = {
        ...previous || {},
        ...next.model ? { model: next.model } : {},
        ...next.mode ? { mode: next.mode } : {},
        ts: Date.now()
      };
      if (!merged.model && !merged.mode) return null;
      writeYuanbaoSelectionRecord(merged);
      yuanbaoAppliedKey = yuanbaoSelectionKey(merged);
      yuanbaoAppliedAt = Date.now();
      return merged;
    }
    function cancelYuanbaoRecordTimers() {
      for (const timer of yuanbaoRecordTimers.splice(0)) {
        window.clearTimeout(timer);
      }
    }
    function scheduleYuanbaoRecordSync(intent) {
      cancelYuanbaoRecordTimers();
      for (const delay of [120, 420, 900]) {
        yuanbaoRecordTimers.push(
          window.setTimeout(() => {
            syncYuanbaoSelection(intent);
          }, delay)
        );
      }
    }
    function syncYuanbaoSelection(intent) {
      if (applyingReasoning) return;
      const trigger = yuanbaoTrigger();
      const main = yuanbaoMainMenu();
      const modelMenu = yuanbaoModelMenu();
      const model = modelMenu ? (() => {
        const selected = Array.from(
          modelMenu.querySelectorAll(CHOICE_RADIO_SELECTOR)
        ).find(
          (row) => row.closest(REASONING_MENU_SELECTOR) === modelMenu && choiceRowIsSelected(row) === true
        );
        return selected ? yuanbaoRowTitle(selected) : "";
      })() : main ? yuanbaoModelValue(main) : "";
      const mode = yuanbaoModeValue(trigger);
      const previous = readYuanbaoSelectionRecord();
      const next = {
        model: intent === "model" ? previous?.model || "" : model || previous?.model || "",
        mode: intent === "mode" ? previous?.mode || "" : mode || previous?.mode || "",
        ts: Date.now()
      };
      if (!next.model && !next.mode) return;
      if (previous && previous.model === next.model && previous.mode === next.mode) {
        return;
      }
      writeYuanbaoSelectionRecord(next);
      renderReasoningStatus();
    }
    function handleYuanbaoSelectionClick(target) {
      if (!isYuanbaoHost()) return false;
      const trigger = yuanbaoTrigger();
      if (!trigger) return false;
      const main = yuanbaoMainMenu();
      const modelMenu = yuanbaoModelMenu();
      const inPicker = target.closest(YUANBAO_MODEL_TRIGGER_SELECTOR) !== null || main !== null && main.contains(target) || modelMenu !== null && modelMenu.contains(target);
      if (!inPicker) return false;
      if (target.closest(YUANBAO_MODEL_TRIGGER_SELECTOR)) return true;
      const modelRow = modelMenu instanceof HTMLElement ? Array.from(
        modelMenu.querySelectorAll(CHOICE_RADIO_SELECTOR)
      ).find(
        (row) => row.closest(REASONING_MENU_SELECTOR) === modelMenu && (row === target || row.contains(target))
      ) ?? null : null;
      if (modelRow) {
        const model = yuanbaoRowTitle(modelRow);
        if (!model) return true;
        mergeYuanbaoSelection({ model, mode: yuanbaoModeValue(trigger) });
        renderReasoningStatus();
        scheduleYuanbaoRecordSync("model");
        return true;
      }
      if (!main) return false;
      const modeRow = Array.from(main.querySelectorAll(CHOICE_RADIO_SELECTOR)).find(
        (row) => row.closest(REASONING_MENU_SELECTOR) === main && !row.matches(YUANBAO_MODEL_ROW_SELECTOR) && (row === target || row.contains(target))
      ) ?? null;
      if (!modeRow) return main.contains(target);
      const mode = yuanbaoRowTitle(modeRow);
      if (!mode) return true;
      mergeYuanbaoSelection({
        model: yuanbaoModelValue(main),
        mode
      });
      renderReasoningStatus();
      scheduleYuanbaoRecordSync("mode");
      return true;
    }
    function applyReasoningMemory() {
      syncConversationScope();
      if (isEngineDormant()) {
        reasoningRestoreDone = true;
        releaseReasoningRestore();
        return;
      }
      if (isYuanbaoHost() || readYuanbaoSelectionRecord()) {
        restoreYuanbaoSelection();
        return;
      }
      const saved = readReasoningRecord();
      if (!saved || !saved.mode) {
        reasoningRestoreDone = true;
        return;
      }
      const control = findRememberedControl(saved);
      if (!control) return;
      if (applyingReasoning) return;
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
        const attemptKey2 = choiceAttemptKey(control, saved);
        const attempts = choiceRestoreAttempts.get(attemptKey2) ?? 0;
        if (attempts >= 2) {
          reasoningRestoreDone = true;
          return;
        }
        choiceRestoreAttempts.set(attemptKey2, attempts + 1);
        const token2 = beginRestore();
        const restore = Array.isArray(saved.path) ? restorePathChoice : restoreChoice;
        restore(saved, control, (ok, conclusive) => {
          reasoningRestoreDone = ok || conclusive === true;
          if (attempts + 1 >= 2) reasoningRestoreDone = true;
          if (reasoningRestoreDone) {
            restoreCoordinator.release("reasoning");
          }
        }, token2);
        return;
      }
      reasoningRestoreDone = true;
      if (saved.mode !== "toggle") return;
      const now = controlOnState(control);
      if (now === null || now === (saved.on === true)) return;
      const desired = saved.on === true;
      const attemptKey = toggleAttemptKey(control, desired);
      if (correctedToggleAttempts.has(attemptKey)) return;
      correctedToggleAttempts.add(attemptKey);
      const token = beginRestore();
      applyingReasoning = true;
      if (!clickControlOnce(control)) {
        applyingReasoning = false;
        return;
      }
      settleToggleCorrection(control, desired, token);
    }
    function clearReasoningRestoreTimer() {
      window.clearInterval(reasoningRestoreTimer);
      reasoningRestoreTimer = 0;
      window.clearTimeout(reasoningSettleTimer);
      reasoningSettleTimer = 0;
      for (const timer of popupCloseTimers.splice(0)) window.clearTimeout(timer);
      cancelYuanbaoRecordTimers();
      restoreToken += 1;
      applyingReasoning = false;
      yuanbaoMissingTriggerAttempts = 0;
      if (reasoningRestorePending) releaseReasoningRestore();
    }
    function scheduleReasoningRestore() {
      clearReasoningRestoreTimer();
      syncConversationScope();
      reasoningRestoreDone = false;
      reasoningRestoreAttempts = 0;
      if (isEngineDormant()) return;
      if (!state.rememberReasoning) return;
      const yuanbaoRecord = readYuanbaoSelectionRecord();
      if (!yuanbaoRecord && !readReasoningRecord()) return;
      if (yuanbaoRecord && isYuanbaoHost() && yuanbaoSelectionApplied(yuanbaoRecord, yuanbaoTrigger())) {
        reasoningRestoreDone = true;
        releaseReasoningRestore();
        return;
      }
      if (isYuanbaoHost() || yuanbaoRecord) setReasoningPending(true);
      reasoningRestoreTimer = window.setInterval(() => {
        reasoningRestoreAttempts += 1;
        if (!reasoningRestoreDone) applyReasoningMemory();
        if (reasoningRestoreDone || reasoningRestoreAttempts >= 120) {
          clearReasoningRestoreTimer();
        }
      }, 500);
    }
    function attachStatusNode(node) {
      reasoningStatusNode = node;
    }
    return {
      handleReasoningClick,
      handleDehydratedClick,
      renderReasoningStatus,
      applyReasoningMemory,
      clearReasoningRestoreTimer,
      scheduleReasoningRestore,
      isRestorePending: () => restoreCoordinator.isPending("reasoning"),
      attachStatusNode
    };
  }

  // scripts/ai-chat-turbo-engine/src/storage/tool-memory.ts
  var toolStore = createReportedStorage("localStorage", (failure) => {
    const scope = failure.operation === "write" || failure.operation === "remove" ? "save tool memory" : "load tool memory";
    reportRecoverableError(scope, failure.error);
  });
  var MAX_TOOLS = 40;
  var MAX_LABEL2 = 120;
  var MAX_APPLICATION_ID = 120;
  function cleanLabel2(raw) {
    if (typeof raw !== "string") return "";
    return raw.replace(/\s+/g, " ").trim().slice(0, MAX_LABEL2);
  }
  function toToolRecord(value) {
    if (!isObjectRecord(value)) return null;
    const key = cleanLabel2(value["key"]);
    const applicationId = cleanLabel2(value["applicationId"]).slice(0, MAX_APPLICATION_ID);
    const label = cleanLabel2(value["label"]);
    const selectedRaw = value["selected"];
    const legacyLabels = [];
    if (Array.isArray(selectedRaw)) {
      for (const entry of selectedRaw) {
        const legacy = cleanLabel2(entry);
        if (!legacy || legacyLabels.includes(legacy)) continue;
        legacyLabels.push(legacy);
        if (legacyLabels.length >= MAX_TOOLS) break;
      }
    }
    if (!key || !applicationId && !label && !legacyLabels.length) return null;
    const controlLabel = cleanLabel2(value["controlLabel"]);
    const ts = value["ts"];
    return {
      key,
      controlLabel,
      applicationId,
      label: label || legacyLabels[0] || "",
      legacyLabels,
      ts: typeof ts === "number" && Number.isFinite(ts) ? ts : 0
    };
  }
  function loadToolMemory() {
    try {
      const raw = toolStore.read(STORAGE_KEY_TOOL_MEMORY);
      const parsed = raw === null || raw === "" ? {} : JSON.parse(raw);
      if (!isObjectRecord(parsed)) return {};
      const memory = {};
      for (const [scope, entry] of Object.entries(parsed)) {
        const record = toToolRecord(entry);
        if (record) memory[scope] = record;
      }
      return memory;
    } catch (error) {
      reportRecoverableError("load tool memory", error);
      return {};
    }
  }
  function saveToolMemory(memory) {
    toolStore.writeJson(STORAGE_KEY_TOOL_MEMORY, memory);
  }
  function readToolRecord(memory) {
    const all = memory ?? loadToolMemory();
    const scoped = all[reasoningScope()];
    if (scoped) return scoped;
    return all[location.hostname] ?? null;
  }
  function writeToolRecord(record) {
    const memory = loadToolMemory();
    const scope = reasoningScope();
    memory[scope] = record;
    if (scope !== location.hostname) delete memory[location.hostname];
    saveToolMemory(memory);
    return record;
  }
  function clearToolRecord() {
    const memory = loadToolMemory();
    delete memory[reasoningScope()];
    delete memory[location.hostname];
    saveToolMemory(memory);
  }

  // scripts/ai-chat-turbo-engine/src/core/tool-memory.ts
  var POLL_INTERVAL = 350;
  var MAX_POLLS = 80;
  var MENU_WAIT_INTERVAL = 120;
  var MENU_WAIT_ATTEMPTS = 12;
  var MAX_RESTORE_ATTEMPTS = 6;
  var RECORD_DELAYS = [120, 320, 700, 1200];
  var VERIFY_DELAYS = [150, 400, 800, 1400];
  function cleanText(raw) {
    return raw.replace(/\s+/g, " ").trim().slice(0, 120);
  }
  function nodeVisible(node) {
    const rect = node.getBoundingClientRect();
    return rect.width >= 1 && rect.height >= 1;
  }
  function isInsideTurboUI(node) {
    return Boolean(node.closest("[id^='ai-turbo-'], .ai-turbo-code-bar"));
  }
  function applicationIdOf(node) {
    return cleanText(node.getAttribute("data-application-id") || "");
  }
  function toolLabel(node) {
    const aria = cleanText(node.getAttribute("aria-label") || "");
    if (aria) return aria;
    const visible = node.querySelector("[data-input-label='tools']");
    if (visible instanceof HTMLElement) {
      const label = cleanText(visible.textContent || "");
      if (label) return label;
    }
    return cleanText(node.textContent || "");
  }
  function chipRecord(node) {
    if (!nodeVisible(node)) return null;
    const applicationId = applicationIdOf(node);
    if (!applicationId) return null;
    const labelNode = node.querySelector("span > span");
    const label = labelNode instanceof HTMLElement ? cleanText(labelNode.textContent || "") : "";
    return { applicationId, label, node };
  }
  function currentChip() {
    const chips = Array.from(
      document.querySelectorAll(ATOMIC_TOOL_CHIP_SELECTOR)
    ).filter((node) => !isInsideTurboUI(node) && nodeVisible(node));
    for (const chip of chips) {
      const record = chipRecord(chip);
      if (record) return record;
    }
    return null;
  }
  function matchesSaved(tool, saved) {
    if (saved.applicationId) return tool.applicationId === saved.applicationId;
    const expected = saved.label || saved.legacyLabels[0] || "";
    return Boolean(expected) && tool.label === expected;
  }
  function collectTools(nodes) {
    const tools = [];
    for (const node of nodes) {
      if (isInsideTurboUI(node) || !nodeVisible(node)) continue;
      const applicationId = applicationIdOf(node);
      if (!applicationId) continue;
      tools.push({ applicationId, label: toolLabel(node), node });
    }
    return tools;
  }
  function inlineTools() {
    const items = Array.from(
      document.querySelectorAll(ATOMIC_TOOL_ITEM_SELECTOR)
    ).filter((node) => !node.closest("[role='menu']"));
    return collectTools(items);
  }
  function menuTools() {
    return collectTools(
      document.querySelectorAll(
        `${ATOMIC_TOOL_MENU_SELECTOR} [role='menuitem'][data-application-id]`
      )
    );
  }
  function overflowTrigger() {
    const actions = document.querySelectorAll(ATOMIC_ACTIONS_SELECTOR);
    for (const action of actions) {
      if (isInsideTurboUI(action) || !nodeVisible(action)) continue;
      const candidates = Array.from(
        action.querySelectorAll("button[aria-expanded]")
      ).filter((node) => !node.hasAttribute("data-application-id"));
      const trigger = candidates.find((node) => nodeVisible(node));
      if (trigger) return trigger;
    }
    return null;
  }
  function atomicToolbarPresent() {
    return Array.from(
      document.querySelectorAll(ATOMIC_ACTIONS_SELECTOR)
    ).some((node) => !isInsideTurboUI(node) && nodeVisible(node));
  }
  function findTool(tools, saved) {
    if (saved.applicationId) {
      const byId = tools.find((tool) => tool.applicationId === saved.applicationId);
      if (byId) return byId;
    }
    const expected = saved.label || saved.legacyLabels[0] || "";
    if (!expected) return null;
    return tools.find((tool) => tool.label === expected) ?? null;
  }
  function createToolMemoryUtils(deps) {
    const {
      el,
      state,
      triggerSendButton,
      restoreCoordinator: providedCoordinator
    } = deps;
    const restoreCoordinator = providedCoordinator ?? createRestoreCoordinator();
    let statusNode = null;
    let pollTimer = 0;
    let pollCount = 0;
    let stepTimer = 0;
    const recordTimers = [];
    const verifyTimers = [];
    let restoreToken = 0;
    let restoring = false;
    let restoreDone = false;
    let restoreAttempts = 0;
    let openedOverflow = null;
    let actionStatus = "";
    function stopPolling() {
      window.clearInterval(pollTimer);
      pollTimer = 0;
      pollCount = 0;
    }
    function clearTimers(list) {
      for (const timer of list.splice(0)) window.clearTimeout(timer);
    }
    function click(control, scope) {
      try {
        return triggerSendButton(control);
      } catch (error) {
        reportRecoverableError(scope, error);
        return false;
      }
    }
    function closeOverflow() {
      const trigger = openedOverflow;
      openedOverflow = null;
      if (!trigger || !trigger.isConnected) return;
      if (trigger.getAttribute("aria-expanded") !== "true") return;
      click(trigger, "close tool overflow menu");
    }
    function endRestoreAttempt() {
      restoring = false;
      restoreCoordinator.setPending("tools", false);
      restoreCoordinator.release("tools");
    }
    function finishRestore(token, status) {
      if (token !== restoreToken) return;
      endRestoreAttempt();
      restoreDone = true;
      closeOverflow();
      actionStatus = status;
      renderStatus();
    }
    function persistChip(tool) {
      if (!tool) {
        clearToolRecord();
        actionStatus = "当前没有选中任何工具";
        renderStatus();
        return;
      }
      const saved = readToolRecord();
      if (saved && saved.applicationId === tool.applicationId && saved.label === tool.label) {
        return;
      }
      writeToolRecord({
        key: "atomic-actions",
        controlLabel: "工具",
        applicationId: tool.applicationId,
        label: tool.label,
        legacyLabels: tool.label ? [tool.label] : [],
        ts: Date.now()
      });
      actionStatus = tool.label ? `已记录 ${tool.label}` : `已记录 ${tool.applicationId}`;
      renderStatus();
    }
    function scheduleRecordCapture(applicationId, label, removing) {
      clearTimers(recordTimers);
      let confirmed = false;
      for (const [index, delay] of RECORD_DELAYS.entries()) {
        const timer = window.setTimeout(() => {
          const position = recordTimers.indexOf(timer);
          if (position >= 0) recordTimers.splice(position, 1);
          if (isEngineDormant() || !state.rememberTools || confirmed) return;
          const chip = currentChip();
          if (!removing && chip) {
            if (chip.applicationId === applicationId || index === RECORD_DELAYS.length - 1) {
              confirmed = true;
              persistChip(chip);
            }
            return;
          }
          if (removing && !chip) {
            confirmed = true;
            persistChip(null);
            return;
          }
          if (index === RECORD_DELAYS.length - 1) {
            actionStatus = label ? `未确认 ${label} 的选择，已保留原记录` : "未确认工具选择，已保留原记录";
            renderStatus();
          }
        }, delay);
        recordTimers.push(timer);
      }
    }
    function handleToolClick(event) {
      if (isEngineDormant()) return;
      const target = event.target;
      if (!(target instanceof Element) || isInsideTurboUI(target)) return;
      const chip = target.closest(ATOMIC_TOOL_CHIP_SELECTOR);
      if (chip instanceof HTMLElement) {
        if (restoring || !target.closest("button")) return;
        const info = chipRecord(chip);
        scheduleRecordCapture(info?.applicationId || "", info?.label || "", true);
        return;
      }
      if (restoring || !state.rememberTools) return;
      const item = target.closest(ATOMIC_TOOL_ITEM_SELECTOR);
      if (!(item instanceof HTMLElement)) return;
      const applicationId = applicationIdOf(item);
      if (!applicationId) return;
      scheduleRecordCapture(applicationId, toolLabel(item), false);
    }
    function verifyRestored(token, saved, attemptsLeft) {
      clearTimers(verifyTimers);
      for (const [index, delay] of VERIFY_DELAYS.entries()) {
        const timer = window.setTimeout(() => {
          const position = verifyTimers.indexOf(timer);
          if (position >= 0) verifyTimers.splice(position, 1);
          if (token !== restoreToken) return;
          const chip = currentChip();
          if (chip && matchesSaved(chip, saved)) {
            clearTimers(verifyTimers);
            writeToolRecord({
              key: "atomic-actions",
              controlLabel: "工具",
              applicationId: chip.applicationId,
              label: chip.label || saved.label,
              legacyLabels: chip.label ? [chip.label] : saved.legacyLabels,
              ts: Date.now()
            });
            finishRestore(
              token,
              `已恢复 ${chip.label || saved.label || saved.applicationId}`
            );
            return;
          }
          if (index !== VERIFY_DELAYS.length - 1) return;
          endRestoreAttempt();
          closeOverflow();
          if (attemptsLeft > 1) return;
          finishRestore(token, "未能恢复已记录的工具");
        }, delay);
        verifyTimers.push(timer);
      }
    }
    function tryRestore(saved, token) {
      restoreAttempts += 1;
      const chip = currentChip();
      if (chip && matchesSaved(chip, saved)) {
        finishRestore(token, `已恢复 ${chip.label || saved.label || saved.applicationId}`);
        return;
      }
      const attemptsLeft = MAX_RESTORE_ATTEMPTS - restoreAttempts + 1;
      const inline = findTool(inlineTools(), saved);
      if (inline) {
        if (!click(inline.node, "select atomic tool")) {
          endRestoreAttempt();
          return;
        }
        verifyRestored(token, saved, attemptsLeft);
        return;
      }
      const openMenuTool = findTool(menuTools(), saved);
      if (openMenuTool) {
        if (!click(openMenuTool.node, "select atomic overflow tool")) {
          endRestoreAttempt();
          return;
        }
        verifyRestored(token, saved, attemptsLeft);
        return;
      }
      const trigger = overflowTrigger();
      if (!trigger) {
        endRestoreAttempt();
        return;
      }
      if (trigger.getAttribute("aria-expanded") !== "true") {
        openedOverflow = trigger;
        if (!click(trigger, "open atomic tool overflow")) {
          openedOverflow = null;
          endRestoreAttempt();
          return;
        }
      }
      let attempt = 0;
      const wait = () => {
        stepTimer = 0;
        if (token !== restoreToken) return;
        const menuTool = findTool(menuTools(), saved);
        if (menuTool) {
          if (!click(menuTool.node, "select atomic overflow tool")) {
            endRestoreAttempt();
            closeOverflow();
            return;
          }
          verifyRestored(token, saved, attemptsLeft);
          return;
        }
        attempt += 1;
        if (attempt >= MENU_WAIT_ATTEMPTS) {
          endRestoreAttempt();
          closeOverflow();
          return;
        }
        stepTimer = window.setTimeout(wait, MENU_WAIT_INTERVAL);
      };
      stepTimer = window.setTimeout(wait, MENU_WAIT_INTERVAL);
    }
    function maybeRestore() {
      if (restoreDone || restoring) return;
      if (restoreCoordinator.isPending("reasoning")) return;
      if (isEngineDormant() || !state.rememberTools) {
        restoreDone = true;
        return;
      }
      const saved = readToolRecord();
      if (!saved || !saved.applicationId && !saved.label && !saved.legacyLabels.length) {
        restoreDone = true;
        return;
      }
      const chip = currentChip();
      if (chip && matchesSaved(chip, saved)) {
        finishRestore(restoreToken, `已恢复 ${chip.label || saved.label || saved.applicationId}`);
        return;
      }
      if (!chip && !atomicToolbarPresent()) return;
      if (restoreAttempts >= MAX_RESTORE_ATTEMPTS) {
        finishRestore(restoreToken, "找不到已记录的工具");
        return;
      }
      if (!restoreCoordinator.tryAcquire("tools")) return;
      restoreCoordinator.setPending("tools", true);
      restoring = true;
      restoreToken += 1;
      tryRestore(saved, restoreToken);
    }
    function clearTimer() {
      stopPolling();
      window.clearTimeout(stepTimer);
      stepTimer = 0;
      clearTimers(recordTimers);
      clearTimers(verifyTimers);
      restoreToken += 1;
      endRestoreAttempt();
      restoreDone = false;
      restoreAttempts = 0;
      closeOverflow();
    }
    function scheduleRestore() {
      clearTimer();
      if (isEngineDormant() || !state.rememberTools) return;
      const saved = readToolRecord();
      if (!saved) return;
      restoreDone = false;
      pollTimer = window.setInterval(() => {
        if (restoreCoordinator.isPending("reasoning")) return;
        pollCount += 1;
        maybeRestore();
        if (restoreDone || pollCount >= MAX_POLLS) stopPolling();
      }, POLL_INTERVAL);
    }
    function renderStatus() {
      if (!statusNode) return;
      statusNode.textContent = "";
      statusNode.title = actionStatus;
      if (!state.rememberTools) {
        statusNode.textContent = "工具记忆：已关闭";
        return;
      }
      const saved = readToolRecord();
      if (!saved) {
        statusNode.textContent = actionStatus || "工具记忆：未记录（在工具按钮里选择一个工具即可）";
        return;
      }
      const shown = saved.label || saved.applicationId || "已记录工具";
      statusNode.textContent = "工具记忆：" + shown + " ";
      if (actionStatus) {
        statusNode.appendChild(el("span", {}, ["· " + actionStatus + " "]));
      }
      statusNode.appendChild(
        el(
          "button",
          {
            type: "button",
            onclick: () => {
              clearToolRecord();
              actionStatus = "";
              clearTimer();
              renderStatus();
            }
          },
          ["清除"]
        )
      );
    }
    function attachStatusNode(node) {
      statusNode = node;
    }
    function teardown() {
      clearTimer();
      statusNode = null;
    }
    return {
      handleToolClick,
      maybeRestore,
      scheduleRestore,
      renderStatus,
      clearTimer,
      teardown,
      attachStatusNode
    };
  }

  // scripts/ai-chat-turbo-engine/src/core/tool-scope.ts
  var TOOL_POPUP_TTL = 3e4;
  function isInsideTurboUI2(node) {
    if (!(node instanceof Element)) return false;
    return Boolean(node.closest("[id^='ai-turbo-'], .ai-turbo-code-bar"));
  }
  function nodeVisible2(node) {
    const rect = node.getBoundingClientRect();
    return rect.width >= 1 && rect.height >= 1;
  }
  function visiblePopups() {
    return Array.from(
      document.querySelectorAll(TOOL_POPUP_SELECTOR)
    ).filter((node) => !isInsideTurboUI2(node) && nodeVisible2(node));
  }
  function popupOwnedByToolTrigger(popup) {
    if (popup.closest(TOOL_TRIGGER_CONTAINER_SELECTOR)) return true;
    const popupId = popup.id;
    if (!popupId) return false;
    const containers = document.querySelectorAll(TOOL_TRIGGER_CONTAINER_SELECTOR);
    for (const container of containers) {
      const controls = container.querySelectorAll("[aria-controls]");
      for (const control of controls) {
        if (control.getAttribute("aria-controls") === popupId) return true;
      }
    }
    return false;
  }
  function escapePopup() {
    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      keyCode: 27,
      bubbles: true,
      cancelable: true
    });
    document.activeElement?.dispatchEvent(escape);
    document.dispatchEvent(escape);
  }
  function createToolPopupScope() {
    const registered = [];
    function prune(now) {
      for (let index = registered.length - 1; index >= 0; index -= 1) {
        const entry = registered[index];
        if (!entry.popup.isConnected || entry.until <= now) {
          registered.splice(index, 1);
        }
      }
    }
    function register(control, popup) {
      const now = Date.now();
      prune(now);
      const existing = registered.find((entry) => entry.popup === popup);
      if (existing) {
        existing.control = control;
        existing.until = now + TOOL_POPUP_TTL;
        return;
      }
      registered.push({ control, popup, until: now + TOOL_POPUP_TTL });
    }
    function snapshot() {
      return new Set(visiblePopups());
    }
    function note(control, before) {
      const added = visiblePopups().filter(
        (popup2) => popup2 !== control && !before.has(popup2)
      );
      const preferredId = control.getAttribute("aria-controls");
      const preferred = preferredId ? added.find((popup2) => popup2.id === preferredId) : void 0;
      const popup = preferred ?? added[added.length - 1];
      if (popup) {
        register(control, popup);
        return popup;
      }
      if (!preferredId) return null;
      const fallback = document.getElementById(preferredId);
      if (!(fallback instanceof HTMLElement) || !nodeVisible2(fallback)) {
        return null;
      }
      register(control, fallback);
      return fallback;
    }
    function active(control) {
      prune(Date.now());
      for (let index = registered.length - 1; index >= 0; index -= 1) {
        const entry = registered[index];
        if (entry.control === control && nodeVisible2(entry.popup)) {
          return entry.popup;
        }
      }
      return null;
    }
    function resolve(control) {
      const known = active(control);
      if (known) return known;
      const popupId = control.getAttribute("aria-controls");
      if (!popupId) return null;
      const popup = document.getElementById(popupId);
      if (!(popup instanceof HTMLElement) || !nodeVisible2(popup)) return null;
      register(control, popup);
      return popup;
    }
    function popupFor(node) {
      if (!(node instanceof Element)) return null;
      prune(Date.now());
      for (let index = registered.length - 1; index >= 0; index -= 1) {
        const entry = registered[index];
        if (entry.popup === node || entry.popup.contains(node)) return entry.popup;
      }
      const closest = node.closest(TOOL_POPUP_SELECTOR);
      if (!(closest instanceof HTMLElement)) return null;
      return popupOwnedByToolTrigger(closest) ? closest : null;
    }
    function isInside(node) {
      return popupFor(node) !== null;
    }
    return {
      snapshot,
      note,
      active,
      resolve,
      popupFor,
      isInside,
      close: escapePopup
    };
  }

  // scripts/ai-chat-turbo-engine/src/core/composer.ts
  function createComposerUtils(deps) {
    const { currentPlatform } = deps;
    function getChatInput() {
      const selectors = [
        ...currentPlatform.inputSelectors || [],
        'form[data-chatgpt-composer] [contenteditable="true"][role="textbox"]',
        'div.ProseMirror[contenteditable="true"][role="textbox"]',
        "rich-textarea div[contenteditable='true']",
        'div[contenteditable="true"][role="textbox"]',
        "textarea",
        '[contenteditable="true"]'
      ];
      for (const selector of [...new Set(selectors)]) {
        const candidates = document.querySelectorAll(selector);
        for (const candidate of candidates) {
          if (!(candidate instanceof HTMLElement) || !candidate.isConnected || candidate.closest("#" + HUD_ID) || candidate.offsetParent === null && candidate.getClientRects().length === 0) {
            continue;
          }
          if (candidate.matches(
            'input[type="hidden"], textarea[aria-hidden="true"]'
          ) || candidate.getAttribute("aria-hidden") === "true") {
            continue;
          }
          return candidate;
        }
      }
      return null;
    }
    function isSendControlForInput(sendControl, inputElement) {
      if (!(sendControl instanceof HTMLElement) || !(inputElement instanceof HTMLElement)) {
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
        "fieldset"
      ];
      const sharesComposerContainer = composerSelectors.some((selector) => {
        const inputContainer = inputElement.closest(selector);
        return Boolean(
          inputContainer && inputContainer === sendControl.closest(selector)
        );
      });
      if (sharesComposerContainer) return true;
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
        btn.getAttribute("data-tooltip") || ""
      ].join(" ").toLowerCase();
      if (/\bstop\b|停止|cancel|abort|中止|取消/.test(label)) return false;
      return /send|submit|发送|提交|prompt|ask/.test(label);
    }
    function isButtonUsable(btn) {
      if (!(btn instanceof HTMLElement) || !btn.isConnected) return false;
      if (btn.closest(`#${HUD_ID}, #ai-turbo-vf-tray, #ai-turbo-vf-preview-modal`))
        return false;
      const style = window.getComputedStyle(btn);
      if (style.display === "none" || style.visibility === "hidden") return false;
      return btn.getClientRects().length > 0;
    }
    function isButtonDisabled(btn) {
      if (!(btn instanceof HTMLElement)) return true;
      if (btn.hasAttribute("disabled")) return true;
      if (btn instanceof HTMLButtonElement && btn.disabled === true) return true;
      if (btn instanceof HTMLInputElement && btn.disabled === true) return true;
      if (btn.getAttribute("aria-disabled") === "true") return true;
      return false;
    }
    function findSendControl(inputElement, { allowDisabled = false } = {}) {
      if (!inputElement) return null;
      const usable = (btn) => isButtonUsable(btn) && (allowDisabled || !isButtonDisabled(btn));
      for (const sel of currentPlatform.sendButtonSelectors || []) {
        let matches;
        try {
          matches = document.querySelectorAll(sel);
        } catch (error) {
          reportRecoverableError("query platform send selector", error);
          continue;
        }
        for (const btn of matches) {
          if (usable(btn) && isSendControlForInput(btn, inputElement) && btn instanceof HTMLElement) {
            return btn;
          }
        }
      }
      const form = inputElement.closest("form");
      if (form) {
        for (const btn of form.querySelectorAll(
          'button[type="submit"], button:not([type="button"]):not([type="reset"])'
        )) {
          if (usable(btn) && isSendLikeButton(btn) && btn instanceof HTMLElement)
            return btn;
        }
        for (const btn of form.querySelectorAll("button")) {
          if (usable(btn) && isSendLikeButton(btn) && btn instanceof HTMLElement)
            return btn;
        }
      }
      const composerSelectors = [
        "[data-chatgpt-composer]",
        ".input-area-container",
        "[class*='composer']",
        "[class*='input-area']",
        "[class*='input-container']",
        "[class*='query-bar']",
        "rich-textarea",
        "fieldset"
      ];
      for (const sel of composerSelectors) {
        let container = null;
        try {
          container = inputElement.closest(sel);
        } catch (error) {
          reportRecoverableError("query composer container", error);
        }
        if (!container) continue;
        for (const btn of container.querySelectorAll("button")) {
          if (usable(btn) && isSendLikeButton(btn) && btn instanceof HTMLElement)
            return btn;
        }
      }
      let ancestor = inputElement.parentElement;
      let depth = 0;
      while (ancestor && depth < 8 && ancestor !== document.body && ancestor !== document.documentElement) {
        for (const btn of ancestor.querySelectorAll("button")) {
          if (usable(btn) && isSendLikeButton(btn) && btn instanceof HTMLElement)
            return btn;
        }
        ancestor = ancestor.parentElement;
        depth++;
      }
      return null;
    }
    function triggerSendButton(btn) {
      if (!(btn instanceof HTMLElement)) return false;
      try {
        btn.focus({ preventScroll: true });
      } catch (error) {
        reportRecoverableError("focus send control", error);
      }
      const opts = {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0
      };
      try {
        btn.dispatchEvent(
          new PointerEvent("pointerdown", {
            ...opts,
            buttons: 1,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true
          })
        );
      } catch (error) {
        reportRecoverableError("dispatch pointerdown", error);
      }
      try {
        btn.dispatchEvent(new MouseEvent("mousedown", { ...opts, buttons: 1 }));
      } catch (error) {
        reportRecoverableError("dispatch mousedown", error);
      }
      try {
        btn.dispatchEvent(
          new PointerEvent("pointerup", {
            ...opts,
            buttons: 0,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true
          })
        );
      } catch (error) {
        reportRecoverableError("dispatch pointerup", error);
      }
      try {
        btn.dispatchEvent(new MouseEvent("mouseup", { ...opts, buttons: 0 }));
      } catch (error) {
        reportRecoverableError("dispatch mouseup", error);
      }
      try {
        btn.click();
      } catch (error) {
        reportRecoverableError("click send control", error);
        return false;
      }
      return true;
    }
    function fallbackKeyboardSubmit(inputElement) {
      if (!inputElement) return false;
      try {
        inputElement.focus({ preventScroll: true });
      } catch (error) {
        reportRecoverableError("focus composer", error);
      }
      const form = inputElement.closest("form");
      if (form && typeof form.requestSubmit === "function") {
        try {
          form.requestSubmit();
          return true;
        } catch (error) {
          reportRecoverableError("submit composer form", error);
        }
      }
      const enterOpts = {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
        composed: true
      };
      const enterEvt = new KeyboardEvent("keydown", enterOpts);
      try {
        Object.defineProperty(enterEvt, "keyCode", { get: () => 13 });
        Object.defineProperty(enterEvt, "which", { get: () => 13 });
      } catch (error) {
        reportRecoverableError("emulate legacy Enter key", error);
      }
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
        "fieldset"
      ];
      const inputRect = input.getBoundingClientRect();
      if (!inputRect.width || !inputRect.height) {
        return input.parentElement;
      }
      let best = null;
      let bestArea = Infinity;
      for (const selector of candidates) {
        let matched = null;
        try {
          matched = input.closest(selector);
        } catch (error) {
          reportRecoverableError("query input container", error);
          continue;
        }
        if (!(matched instanceof HTMLElement) || matched === input) continue;
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
    function getComposerVisualBounds(input, anchor) {
      const baseRect = (anchor || input).getBoundingClientRect();
      const bounds = {
        top: baseRect.top,
        left: baseRect.left,
        right: baseRect.right,
        width: baseRect.width
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
          if (sibling.id === "ai-turbo-vf-tray" || sibling.id === HUD_ID || sibling.id === "ai-turbo-vf-preview-modal") {
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
          if (siblingStyle.position === "fixed" || siblingStyle.position === "sticky") {
            sibling = sibling.previousElementSibling;
            continue;
          }
          if (sibling.matches('button, [role="button"]') && !sibling.querySelector(
            'input, textarea, [contenteditable="true"], [role="textbox"]'
          )) {
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
          const overlap = Math.min(bounds.right, siblingRect.right) - Math.max(bounds.left, siblingRect.left);
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
        if (!parent || parent === document.body || parent === document.documentElement) {
          break;
        }
        node = parent;
        depth++;
      }
      return bounds;
    }
    function insertTextAtomic(inputElement, text) {
      if (inputElement instanceof HTMLTextAreaElement || inputElement instanceof HTMLInputElement) {
        const proto = inputElement instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (setter) setter.call(inputElement, text);
        else inputElement.value = text;
        inputElement.dispatchEvent(new Event("input", { bubbles: true }));
        inputElement.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
      inputElement.focus();
      try {
        const range = document.createRange();
        range.selectNodeContents(inputElement);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      } catch (error) {
        reportRecoverableError("select composer text", error);
        try {
          document.execCommand("selectAll");
        } catch (fallbackError) {
          reportRecoverableError("select composer text fallback", fallbackError);
        }
      }
      const singleContainer = `<div style="white-space:pre-wrap;">${escapeHtml(text)}</div>`;
      let success = false;
      try {
        success = document.execCommand("insertHTML", false, singleContainer);
      } catch (error) {
        reportRecoverableError("insert composer HTML", error);
      }
      if (!success) {
        inputElement.textContent = text;
      }
      inputElement.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          cancelable: true,
          composed: true,
          inputType: "insertFromPaste",
          data: text
        })
      );
      inputElement.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return {
      getChatInput,
      findSendControl,
      triggerSendButton,
      fallbackKeyboardSubmit,
      isSendLikeButton,
      getInputContainer,
      getComposerVisualBounds,
      insertTextAtomic
    };
  }

  // scripts/ai-chat-turbo-engine/src/core/send.ts
  function createSendInterceptUtils(deps) {
    const {
      currentPlatform,
      composer,
      state,
      isEngineDormant: isEngineDormant2,
      fuseAndSubmit,
      resumeObservers,
      hasActiveFiles,
      isSubmitting,
      setSubmitting
    } = deps;
    function cleanupAndResume(onComplete, status) {
      window.setTimeout(() => {
        if (isEngineDormant2()) {
          onComplete(status);
          return;
        }
        resumeObservers();
        onComplete(status);
      }, 280);
    }
    function sendWithRetry(inputElement, onComplete) {
      let attempts = 0;
      const maxAttempts = 40;
      let forcedSubmitTried = false;
      const timer = setInterval(() => {
        attempts++;
        if (isEngineDormant2()) {
          clearInterval(timer);
          setSubmitting(false);
          cleanupAndResume(onComplete, false);
          return;
        }
        const sendBtn = composer.findSendControl(inputElement);
        if (sendBtn) {
          clearInterval(timer);
          composer.triggerSendButton(sendBtn);
          cleanupAndResume(onComplete, true);
          return;
        }
        if (attempts >= 16 && !forcedSubmitTried) {
          const disabledBtn = composer.findSendControl(inputElement, {
            allowDisabled: true
          });
          if (disabledBtn) {
            forcedSubmitTried = true;
            clearInterval(timer);
            try {
              disabledBtn.removeAttribute("disabled");
              disabledBtn.setAttribute("aria-disabled", "false");
            } catch (error) {
              reportRecoverableError("re-enable send control", error);
            }
            composer.triggerSendButton(disabledBtn);
            cleanupAndResume(onComplete, true);
            return;
          }
        }
        if (attempts >= maxAttempts) {
          clearInterval(timer);
          composer.fallbackKeyboardSubmit(inputElement);
          cleanupAndResume(onComplete, false);
        }
      }, 50);
    }
    function handleSendIntercept(event) {
      if (isEngineDormant2()) return;
      if (!state.virtualFileEnabled || !hasActiveFiles() || isSubmitting()) {
        return;
      }
      if (event instanceof KeyboardEvent && event.type === "keydown" && event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        const input = composer.getChatInput();
        const eventTarget = event.target;
        if (input && eventTarget instanceof Node && (eventTarget === input || input.contains(eventTarget))) {
          event.preventDefault();
          event.stopPropagation();
          setSubmitting(true);
          fuseAndSubmit(input);
          sendWithRetry(input, () => {
            setSubmitting(false);
          });
          return;
        }
      }
      if (event.type === "click") {
        const eventTarget = event.target;
        if (!(eventTarget instanceof Element)) return;
        let sendControl = null;
        try {
          sendControl = eventTarget.closest(
            (currentPlatform.sendButtonSelectors || []).join(",")
          );
        } catch (error) {
          reportRecoverableError("resolve clicked send control", error);
        }
        if (!sendControl) {
          let node = eventTarget;
          let depth = 0;
          while (node && depth < 4 && node !== document.body) {
            if (node instanceof HTMLElement && node.tagName === "BUTTON" && composer.isSendLikeButton(node)) {
              sendControl = node;
              break;
            }
            node = node.parentElement;
            depth++;
          }
        }
        if (!sendControl) return;
        const input = composer.getChatInput();
        if (!input) return;
        event.preventDefault();
        event.stopPropagation();
        setSubmitting(true);
        fuseAndSubmit(input);
        sendWithRetry(input, () => {
          setSubmitting(false);
        });
      }
    }
    return { sendWithRetry, handleSendIntercept };
  }

  // scripts/ai-chat-turbo-engine/src/core/handoff.ts
  function createHandoffUtils(deps) {
    const {
      currentPlatform,
      composer,
      sendIntercept,
      setSubmitting
    } = deps;
    const { getTurns, extractTurnText, getTurnRole } = deps.turns;
    const isSubmitting = deps.isSubmitting;
    let handoffStatusNode = null;
    let handoffResumeTimer = null;
    let rejectedHandoffWrite = null;
    const handoffStore = createReportedStorage("sessionStorage", (failure) => {
      if (failure.operation === "remove") {
        reportRecoverableError("clear pending handoff", failure.error);
        return;
      }
      if (failure.operation === "read" || failure.operation === "parse") {
        reportRecoverableError("read pending handoff", failure.error);
        return;
      }
      rejectedHandoffWrite = failure.error;
    });
    function persistPendingHandoff(restoreText, sourceTurns) {
      rejectedHandoffWrite = null;
      return handoffStore.writeJson(HANDOFF_STORAGE_KEY, {
        text: restoreText,
        createdAt: Date.now(),
        sourceUrl: window.location.href,
        sourceTurns
      });
    }
    function attachStatusNode(node) {
      handoffStatusNode = node;
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
          sections.push(`### ${role} · Message ${index + 1}

${contentText}`);
        }
      });
      if (!sections.length) {
        window.alert("当前页面没有可提取的文本");
        return;
      }
      const markdown = [
        `# 会话上下文提取 [${currentPlatform.name}]`,
        "",
        `> 提取时间: ${(/* @__PURE__ */ new Date()).toLocaleString()}`,
        "",
        sections.join("\n\n---\n\n"),
        ""
      ].join("\n");
      navigator.clipboard.writeText(markdown).then(() => {
        if (typeof onSuccess === "function") onSuccess(sections.length);
      }).catch(() => {
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
        "[END]"
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
        ""
      ];
      if (kind === "yaml") {
        intro.push(
          "（注：以下是旧版 YAML 交接包，可直接当作纯文本阅读，无需严格 YAML 解析。）"
        );
        intro.push("");
      }
      intro.push("===== 交接包开始 =====");
      intro.push(String(handoffText || "").trim());
      intro.push("===== 交接包结束 =====");
      return intro.join("\n");
    }
    function getComposerText(inputElement) {
      if (inputElement instanceof HTMLTextAreaElement || inputElement instanceof HTMLInputElement) {
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
        "handoff_notes"
      ];
      return requiredSections.every(
        (section) => new RegExp("^" + section + ":\\s*$", "m").test(yaml)
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
      const text = String(candidate).trim().replace(/^```(?:yaml|yml|txt|text|markdown|md|plain)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
      return isPlainHandoffShape(text) ? text : null;
    }
    function normalizeHandoffYaml(candidate) {
      if (!candidate) return null;
      const yaml = String(candidate).trim().replace(/^```(?:yaml|yml)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
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
      const codeElements = Array.from(
        latestAssistantTurn.querySelectorAll("pre code, pre, code, code-block")
      );
      for (const codeElement of codeElements) {
        if (isReasoningElement(codeElement)) continue;
        const codeText = codeElement.textContent || "";
        const plain2 = normalizePlainHandoff(codeText);
        if (plain2) return { kind: "plain", text: plain2 };
        const yaml2 = normalizeHandoffYaml(codeText);
        if (yaml2) return { kind: "yaml", text: yaml2 };
      }
      const fullText = extractTurnText(latestAssistantTurn);
      const fencedMatches = Array.from(
        fullText.matchAll(
          /```(?:yaml|yml|txt|text|markdown|md)?\s*([\s\S]*?)\s*```/gi
        )
      );
      for (const match of fencedMatches) {
        const plain2 = normalizePlainHandoff(match[1]);
        if (plain2) return { kind: "plain", text: plain2 };
        const yaml2 = normalizeHandoffYaml(match[1]);
        if (yaml2) return { kind: "yaml", text: yaml2 };
      }
      const plain = normalizePlainHandoff(fullText);
      if (plain) return { kind: "plain", text: plain };
      const yaml = normalizeHandoffYaml(fullText);
      if (yaml) return { kind: "yaml", text: yaml };
      return null;
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
        'a[aria-label*="新对话"]'
      ];
      for (const selector of selectors) {
        let controls = [];
        try {
          controls = Array.from(document.querySelectorAll(selector));
        } catch (error) {
          reportRecoverableError("query new chat control", error);
        }
        const found = controls.find(
          (control) => control instanceof HTMLElement && control.isConnected && control.getAttribute("target") !== "_blank" && (control.offsetParent !== null || control.getClientRects().length > 0)
        );
        if (found) return found;
      }
      const exactLabels = /* @__PURE__ */ new Set([
        "new chat",
        "new conversation",
        "new thread",
        "start new chat",
        "新建对话",
        "新对话",
        "新建聊天",
        "开始新对话",
        "开启新对话"
      ]);
      const labeledControl = Array.from(
        document.querySelectorAll("button, a, [role='button']")
      ).find((control) => {
        if (!(control instanceof HTMLElement) || !control.isConnected || control.getAttribute("target") === "_blank" || !(control.offsetParent !== null || control.getClientRects().length > 0)) {
          return false;
        }
        const label = [
          control.getAttribute("aria-label") || "",
          control.getAttribute("title") || "",
          control.innerText || control.textContent || ""
        ].join(" ").trim().toLowerCase();
        return exactLabels.has(label);
      });
      return labeledControl ?? null;
    }
    function resumePendingHandoffPrompt() {
      if (isEngineDormant()) return;
      if (handoffResumeTimer !== null) {
        window.clearInterval(handoffResumeTimer);
      }
      handoffResumeTimer = null;
      let attempts = 0;
      const timer = window.setInterval(() => {
        if (isEngineDormant()) {
          window.clearInterval(timer);
          if (handoffResumeTimer === timer) handoffResumeTimer = null;
          return;
        }
        let pending = null;
        try {
          const raw = handoffStore.read(HANDOFF_STORAGE_KEY);
          pending = JSON.parse(raw === null || raw === "" ? "null" : raw);
        } catch (error) {
          reportRecoverableError("read pending handoff", error);
        }
        if (!isObjectRecord(pending) || typeof pending["text"] !== "string") {
          window.clearInterval(timer);
          return;
        }
        const pendingText = pending["text"];
        const pendingCreatedAt = pending["createdAt"];
        const pendingSourceUrl = pending["sourceUrl"];
        const pendingSourceTurns = pending["sourceTurns"];
        if (typeof pendingText !== "string" || typeof pendingSourceUrl !== "string" || typeof pendingSourceTurns !== "number") {
          window.clearInterval(timer);
          return;
        }
        const createdAt = typeof pendingCreatedAt === "number" ? pendingCreatedAt : 0;
        if (Date.now() - createdAt > 5 * 60 * 1e3) {
          handoffStore.remove(HANDOFF_STORAGE_KEY);
          window.clearInterval(timer);
          return;
        }
        const currentTurns = getTurns().length;
        const isNewConversation = window.location.href !== pendingSourceUrl || pendingSourceTurns > 0 && currentTurns === 0;
        attempts++;
        if (isNewConversation) {
          const input = composer.getChatInput();
          if (input) {
            if (getComposerText(input).trim()) {
              navigator.clipboard.writeText(pendingText).then(() => {
                setHandoffStatus(
                  "新对话输入框已有草稿，恢复指令已复制到剪贴板。"
                );
                window.alert(
                  "新对话输入框已有未发送内容。为避免覆盖草稿，已将恢复指令复制到剪贴板，请手动粘贴。"
                );
              }).catch(() => {
                window.alert(
                  "无法覆盖新对话中的已有草稿。请保留草稿后手动粘贴恢复指令。"
                );
              });
            } else {
              composer.insertTextAtomic(input, pendingText);
              input.focus();
              setHandoffStatus("恢复指令已填入新对话；检查 YAML 后手动发送。");
            }
            handoffStore.remove(HANDOFF_STORAGE_KEY);
            window.clearInterval(timer);
            return;
          }
        }
        if (attempts >= 120) {
          handoffStore.remove(HANDOFF_STORAGE_KEY);
          window.clearInterval(timer);
          navigator.clipboard.writeText(pendingText).then(() => {
            setHandoffStatus("未识别到新对话输入框，恢复指令已复制到剪贴板。");
            window.alert(
              "未能可靠识别新对话输入框。完整恢复指令已复制，请手动打开新对话并粘贴。"
            );
          }).catch(() => {
            window.alert(
              "未能识别新对话输入框，也无法写入剪贴板。请回到原回答手动复制 YAML。"
            );
          });
        }
      }, 250);
      handoffResumeTimer = timer;
    }
    function copyHandoffFallback(text, statusMessage, alertMessage) {
      const done = (ok) => {
        setHandoffStatus(
          ok ? statusMessage : `${statusMessage}（写入剪贴板失败，请手动复制）`
        );
        if (alertMessage) {
          window.alert(
            ok ? alertMessage : "无法写入剪贴板。请检查浏览器权限，或手动选择对应内容后重试。"
          );
        }
      };
      try {
        if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
        navigator.clipboard.writeText(text).then(() => done(true)).catch(() => done(false));
      } catch (error) {
        reportRecoverableError("write clipboard", error);
        done(false);
      }
    }
    function startOneClickHandoff() {
      if (isEngineDormant()) return;
      if (isSubmitting()) return;
      const existing = extractLatestHandoffText();
      if (existing) {
        proceedOneClickHandoff(existing);
        return;
      }
      const prompt = buildHandoffGenerationPrompt();
      const input = composer.getChatInput();
      if (!input) {
        copyHandoffFallback(
          prompt,
          "未识别输入框，生成指令已复制到剪贴板。",
          "未识别到当前网站的输入框。生成指令已复制，请手动粘贴并发送。"
        );
        return;
      }
      if (getComposerText(input).trim()) {
        copyHandoffFallback(
          prompt,
          "输入框有草稿，生成指令已复制到剪贴板。",
          "当前输入框已有未发送内容。为避免覆盖草稿，生成指令已复制，请先处理现有草稿，再手动粘贴发送。"
        );
        return;
      }
      composer.insertTextAtomic(input, prompt);
      setHandoffStatus("已填入交接指令，正在发送……");
      const baselineTurns = getTurns().length;
      setSubmitting(true);
      sendIntercept.sendWithRetry(input, (sent) => {
        setSubmitting(false);
        if (!sent) {
          copyHandoffFallback(
            prompt,
            "发送未确认，生成指令已复制到剪贴板。",
            "未能确认发送成功。生成指令已复制，请手动粘贴发送。"
          );
          return;
        }
        setHandoffStatus("已发送交接指令；等待 AI 生成交接包……");
        waitForHandoffPackage(baselineTurns, prompt);
      });
    }
    function waitForHandoffPackage(baselineTurns, prompt) {
      const startedAt = Date.now();
      const TIMEOUT_MS = 18e4;
      const timer = window.setInterval(() => {
        if (isEngineDormant()) {
          window.clearInterval(timer);
          return;
        }
        if (getTurns().length <= baselineTurns) {
          if (Date.now() - startedAt > TIMEOUT_MS) {
            window.clearInterval(timer);
            copyHandoffFallback(
              prompt,
              "等待交接包超时，生成指令已复制到剪贴板。",
              "等待 AI 生成交接包超时。生成指令已复制，可手动重新执行。"
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
            "等待 AI 生成交接包超时。生成指令已复制，可手动重新执行。"
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
          "未识别到新对话按钮。完整恢复指令已复制，请手动打开新对话并粘贴。"
        );
        return;
      }
      if (!persistPendingHandoff(restoreText, getTurns().length)) {
        console.warn("[AI Turbo] Failed to persist handoff state", rejectedHandoffWrite);
        copyHandoffFallback(
          restoreText,
          "无法暂存恢复状态，恢复指令已复制到剪贴板。",
          "无法暂存跨页面恢复状态。完整恢复指令已复制，请手动打开新对话并粘贴。"
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
          "未在最近的助手回答中找到可识别的交接包。\n\n请等待回答完整结束后重试。\n\n若 AI 未按格式输出，可点击「发送 YAML 交接指令」重新生成。"
        );
        setHandoffStatus("尚未检测到完整交接包。");
        return;
      }
      const restoreText = buildHandoffRestorePrompt(result.text, result.kind);
      const newChatControl = findNewChatControl();
      if (!newChatControl) {
        navigator.clipboard.writeText(restoreText).then(() => {
          setHandoffStatus("未识别新对话入口；完整恢复指令已复制。");
          window.alert(
            "已提取交接包并复制完整恢复指令。此网站的新对话按钮未能可靠识别，请手动打开新对话并粘贴。"
          );
        }).catch(() => {
          window.alert(
            "已找到交接包，但无法识别新对话入口或写入剪贴板。请手动复制交接包后恢复。"
          );
        });
        return;
      }
      if (!persistPendingHandoff(restoreText, getTurns().length)) {
        console.warn("[AI Turbo] Failed to persist handoff state", rejectedHandoffWrite);
        navigator.clipboard.writeText(restoreText).then(() => {
          window.alert(
            "无法暂存跨页面恢复状态，已复制完整恢复指令，请手动打开新对话并粘贴。"
          );
        }).catch(() => {
          window.alert("无法暂存或复制恢复指令，请手动复制交接包。");
        });
        return;
      }
      setHandoffStatus("已识别交接包，正在打开新对话并准备填入恢复指令……");
      newChatControl.click();
      resumePendingHandoffPrompt();
    }
    function clearResumeTimer() {
      if (handoffResumeTimer !== null) {
        window.clearInterval(handoffResumeTimer);
      }
      handoffResumeTimer = null;
    }
    return {
      attachStatusNode,
      setHandoffStatus,
      exportCleanContext,
      startOneClickHandoff,
      resumePendingHandoffPrompt,
      prepareNewConversationFromYaml,
      clearResumeTimer
    };
  }

  // scripts/ai-chat-turbo-engine/src/ui/hud.ts
  var positionStore = createReportedStorage("localStorage", (failure) => {
    const scope = failure.operation === "write" || failure.operation === "remove" ? "save pill position" : "restore pill position";
    reportRecoverableError(scope, failure.error);
  });
  function isPillPosition(value) {
    if (typeof value !== "object" || value === null) return false;
    if (!("x" in value) || !("y" in value)) return false;
    return typeof value.x === "number" && typeof value.y === "number";
  }
  function createHudUtils(deps) {
    const {
      el,
      state,
      currentPlatform,
      version: VERSION,
      reasoningStatusNode,
      toolStatusNode,
      codeBlocks,
      reasoning,
      toolMemory,
      handoff,
      isEngineDormant: isEngineDormant2,
      requestUpdate,
      requestFullTurnSync,
      saveConfig,
      activeFileCount,
      clearFiles,
      injectStyles
    } = deps;
    let hudRootElement = null;
    let hudShadowRoot = null;
    let hudStats = null;
    let searchInput = null;
    let searchResultsBox = null;
    let searchDebounceTimer = null;
    function resolveLoadTone(totalTurns, messageLimit) {
      const loadRatio = messageLimit > 0 ? totalTurns / messageLimit : 0;
      if (loadRatio >= 1) return "critical";
      if (loadRatio >= LOAD_WARNING_RATIO) return "warning";
      return "normal";
    }
    function updateHudDashboard() {
      if (!hudStats) return;
      const hudSignature = `${state.totalTurns}|${state.hiddenCount}|${state.foldedCodeCount}|${activeFileCount()}|${state.messageLimit}`;
      if (hudStats.signature === hudSignature) return;
      hudStats.signature = hudSignature;
      hudStats.total.textContent = String(state.totalTurns);
      hudStats.hidden.textContent = String(state.hiddenCount);
      hudStats.folded.textContent = String(state.foldedCodeCount);
      const loadProgress = Math.min(
        1,
        Math.max(0, state.totalTurns) / state.messageLimit
      );
      const loadTone = resolveLoadTone(state.totalTurns, state.messageLimit);
      const loadToneLabel = loadTone === "critical" ? "已达到提醒上限" : loadTone === "warning" ? "接近提醒上限" : "负载正常";
      if (hudStats.pillRoot) {
        hudStats.pillRoot.dataset["loadTone"] = loadTone;
        hudStats.pillRoot.title = `长对话负载 ${state.totalTurns}/${state.messageLimit}（${loadToneLabel}，仅按消息数估算） · 消息 ${state.totalTurns} · 已脱水 ${state.hiddenCount} · 代码折叠 ${state.foldedCodeCount} · 虚拟文件 ${activeFileCount()}；点击打开面板，拖动可移动`;
        hudStats.pillRoot.setAttribute(
          "aria-label",
          `长对话负载 ${state.totalTurns}/${state.messageLimit}，${loadToneLabel}；消息 ${state.totalTurns}，已脱水 ${state.hiddenCount}，代码折叠 ${state.foldedCodeCount}，虚拟文件 ${activeFileCount()}；点击打开面板，拖动可移动`
        );
      }
      if (hudStats.totalStatusItem) {
        hudStats.totalStatusItem.dataset["loadTone"] = loadTone;
      }
      if (hudStats.pillCount) {
        hudStats.pillCount.textContent = String(state.totalTurns);
      }
      if (hudStats.pillLimit) {
        hudStats.pillLimit.textContent = `/${state.messageLimit}`;
      }
      hudStats.pillLoadProgress?.setAttribute(
        "stroke-dashoffset",
        String(LOAD_RING_CIRCUMFERENCE * (1 - loadProgress))
      );
    }
    function togglePanel(forceState) {
      ensureHUDMounted();
      if (!hudRootElement || !hudShadowRoot) return;
      state.hudOpen = typeof forceState === "boolean" ? forceState : !state.hudOpen;
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
      const matches = state.indexedTurns.filter((record) => record.text.toLowerCase().includes(normalizedQuery)).slice(0, SEARCH_LIMIT);
      if (!matches.length) {
        searchResultsBox.appendChild(
          el("div", { className: "result-empty" }, ["没有匹配的消息"])
        );
        return;
      }
      for (const record of matches) {
        const previewText = record.text || "（无文本）";
        const resultText = previewText.length > SEARCH_PREVIEW_LIMIT ? previewText.slice(0, SEARCH_PREVIEW_LIMIT) + "…" : previewText;
        const resultButton = el(
          "button",
          {
            type: "button",
            className: "result-item",
            onclick: () => {
              if (!(record.element instanceof HTMLElement)) return;
              const targetElement = record.element;
              togglePanel(false);
              targetElement.classList.remove("ai-turbo-dehydrated");
              targetElement.scrollIntoView({
                behavior: "smooth",
                block: "center"
              });
              targetElement.style.outline = "2px solid rgba(52, 211, 153, 0.85)";
              targetElement.style.outlineOffset = "4px";
              window.setTimeout(() => {
                targetElement.style.outline = "";
                targetElement.style.outlineOffset = "";
              }, 1800);
            }
          },
          [`#${record.id + 1}  ${resultText}`]
        );
        searchResultsBox.appendChild(resultButton);
      }
    }
    function buildHUD() {
      reasoning.attachStatusNode(reasoningStatusNode);
      toolMemory.attachStatusNode(toolStatusNode);
      if (isEngineDormant2()) return;
      if (hudRootElement?.isConnected) return;
      const mountTarget = document.body || document.documentElement;
      if (!mountTarget) return;
      document.getElementById(HUD_ID)?.remove();
      hudRootElement = el("div", {
        id: HUD_ID,
        style: "all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;display:block!important;"
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
        `/${state.messageLimit}`
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
        String(LOAD_RING_CIRCUMFERENCE)
      );
      pillLoadProgress.setAttribute(
        "stroke-dashoffset",
        String(LOAD_RING_CIRCUMFERENCE)
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
          "aria-label": `长对话负载 0/${state.messageLimit}，负载正常；消息 0，已脱水 0，代码折叠 0，虚拟文件 0；点击打开面板，拖动可移动`
        },
        [
          el("span", { className: "turbo-gauge", "aria-hidden": "true" }, [
            pillLoadRing,
            el("span", { className: "turbo-readout" }, [
              pillCountValue,
              pillLimitValue
            ])
          ])
        ]
      );
      const totalVal = el(
        "strong",
        { className: "status-value", id: "total-val" },
        ["0"]
      );
      const hiddenVal = el(
        "strong",
        { className: "status-value", id: "hidden-val" },
        ["0"]
      );
      const foldedVal = el(
        "strong",
        { className: "status-value", id: "folded-val" },
        ["0"]
      );
      const totalStatusItem = el("div", { className: "status-item" }, [
        el("span", { className: "status-label" }, ["消息总数"]),
        totalVal
      ]);
      const statusStrip = el("div", { className: "status-strip" }, [
        totalStatusItem,
        el("div", { className: "status-item" }, [
          el("span", { className: "status-label" }, ["已脱水"]),
          hiddenVal
        ]),
        el("div", { className: "status-item" }, [
          el("span", { className: "status-label" }, ["代码折叠"]),
          foldedVal
        ])
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
            saveConfig();
            requestFullTurnSync();
            requestUpdate();
          }
        },
        ["−"]
      );
      const stepInc = el(
        "button",
        {
          type: "button",
          onclick: () => {
            if (state.keepTurns >= 50) return;
            state.keepTurns++;
            keepVal.textContent = String(state.keepTurns);
            saveConfig();
            requestFullTurnSync();
            requestUpdate();
          }
        },
        ["+"]
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
          if (!Number.isInteger(numericLimit) || numericLimit < MESSAGE_LIMIT_MIN || numericLimit > MESSAGE_LIMIT_MAX) {
            messageLimitInput.value = String(state.messageLimit);
            return;
          }
          state.messageLimit = numericLimit;
          messageLimitInput.value = String(state.messageLimit);
          saveConfig();
          updateHudDashboard();
        }
      });
      const chkPrune = el("input", {
        type: "checkbox",
        checked: state.pruneEnabled ? "checked" : "",
        onchange: () => {
          state.pruneEnabled = chkPrune.checked;
          saveConfig();
          requestFullTurnSync();
          requestUpdate();
        }
      });
      const chkCollapse = el("input", {
        type: "checkbox",
        checked: state.collapseCode ? "checked" : "",
        onchange: () => {
          state.collapseCode = chkCollapse.checked;
          saveConfig();
          codeBlocks.requestCodeScan();
          requestUpdate();
        }
      });
      const chkVirtualFile = el("input", {
        type: "checkbox",
        checked: state.virtualFileEnabled ? "checked" : "",
        onchange: () => {
          state.virtualFileEnabled = chkVirtualFile.checked;
          saveConfig();
          if (!state.virtualFileEnabled) {
            clearFiles();
          }
        }
      });
      const chkReasoning = el("input", {
        type: "checkbox",
        checked: state.rememberReasoning ? "checked" : "",
        onchange: () => {
          state.rememberReasoning = chkReasoning.checked;
          saveConfig();
          reasoning.scheduleReasoningRestore();
          reasoning.renderReasoningStatus();
        }
      });
      const chkTools = el("input", {
        type: "checkbox",
        checked: state.rememberTools ? "checked" : "",
        onchange: () => {
          state.rememberTools = chkTools.checked;
          saveConfig();
          toolMemory.scheduleRestore();
          toolMemory.renderStatus();
        }
      });
      const forkText = el("span", { id: "fork-text" }, [
        "复制原始上下文（回退）"
      ]);
      const btnFork = el(
        "button",
        {
          className: "action-btn",
          type: "button",
          onclick: () => {
            handoff.exportCleanContext((count) => {
              btnFork.classList.add("copied");
              forkText.textContent = `已复制 ${count} 条完整消息`;
              window.setTimeout(() => {
                btnFork.classList.remove("copied");
                forkText.textContent = "复制原始上下文（回退）";
              }, 2200);
            });
          }
        },
        [forkText]
      );
      const btnOneClickHandoff = el(
        "button",
        {
          className: "action-btn",
          type: "button",
          onclick: () => handoff.startOneClickHandoff()
        },
        ["一键交接（生成并恢复）"]
      );
      const handoffStatusNode = el(
        "div",
        { className: "handoff-status", role: "status", "aria-live": "polite" },
        ["交接状态：未开始"]
      );
      handoff.attachStatusNode(handoffStatusNode);
      const strategySection = el("div", { className: "section" }, [
        el("div", { className: "section-title" }, ["引擎策略"]),
        el("div", { className: "control-row" }, [
          el("span", {}, ["活跃保留轮次"]),
          el("div", { className: "stepper" }, [stepDec, keepVal, stepInc])
        ]),
        el("div", { className: "control-row" }, [
          el("label", { htmlFor: "message-limit" }, ["消息提醒上限"]),
          el("div", { className: "limit-control" }, [
            messageLimitInput,
            el("span", { className: "limit-unit" }, ["条"])
          ])
        ]),
        el("div", { className: "control-row" }, [
          el("span", {}, ["安全视口脱水"]),
          el("label", { className: "switch" }, [
            chkPrune,
            el("span", { className: "slider" })
          ])
        ]),
        el("div", { className: "control-row" }, [
          el("span", {}, ["长代码自动折叠"]),
          el("label", { className: "switch" }, [
            chkCollapse,
            el("span", { className: "slider" })
          ])
        ]),
        el("div", { className: "control-row" }, [
          el("span", {}, ["长文本伪文件胶囊"]),
          el("label", { className: "switch" }, [
            chkVirtualFile,
            el("span", { className: "slider" })
          ])
        ]),
        el("div", { className: "control-row" }, [
          el("span", {}, ["记住推理强度"]),
          el("label", { className: "switch" }, [
            chkReasoning,
            el("span", { className: "slider" })
          ])
        ]),
        el("div", { className: "control-row" }, [
          el("span", {}, ["记住工具选择"]),
          el("label", { className: "switch" }, [
            chkTools,
            el("span", { className: "slider" })
          ])
        ]),
        reasoningStatusNode,
        toolStatusNode
      ]);
      const handoffSection = el("div", { className: "section" }, [
        el("div", { className: "section-title" }, ["上下文交接"]),
        btnOneClickHandoff,
        handoffStatusNode,
        btnFork
      ]);
      searchInput = el("input", {
        className: "search-input",
        type: "text",
        placeholder: "检索当前会话内容...",
        autocomplete: "off",
        oninput: () => {
          if (searchDebounceTimer !== null) {
            window.clearTimeout(searchDebounceTimer);
          }
          const inputElement = searchInput;
          searchDebounceTimer = window.setTimeout(() => {
            renderSearchResults(inputElement?.value.trim() ?? "");
          }, 100);
        }
      });
      searchResultsBox = el("div", { className: "results" });
      const searchSection = el("div", { className: "section" }, [
        el("div", { className: "section-title" }, ["历史检索"]),
        el("div", { className: "search-wrap" }, [searchInput]),
        searchResultsBox
      ]);
      const btnClose = el(
        "button",
        {
          className: "close-btn",
          type: "button",
          "aria-label": "关闭",
          onclick: () => togglePanel(false)
        },
        ["✕"]
      );
      const panelHeader = el("div", { className: "header" }, [
        el("div", {}, [
          el("div", { className: "brand-title" }, ["AI Turbo Engine"]),
          el("div", { className: "brand-subtitle" }, [
            `${currentPlatform.name} · v${VERSION}`
          ])
        ]),
        btnClose
      ]);
      const footerHint = el("div", { className: "footer-hint" }, [
        el("kbd", {}, ["Alt"]),
        " + ",
        el("kbd", {}, ["T"]),
        " 呼出 / 收起 · ",
        el("kbd", {}, ["Esc"]),
        " 退出"
      ]);
      const panel = el("div", { className: "hud-panel", id: "panel" }, [
        panelHeader,
        statusStrip,
        strategySection,
        handoffSection,
        searchSection,
        footerHint
      ]);
      const backdrop = el(
        "div",
        {
          className: "modal-backdrop",
          id: "backdrop",
          onclick: (e) => {
            if (e.target === backdrop) togglePanel(false);
          }
        },
        [panel]
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
        signature: ""
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
        const raw = positionStore.read(STORAGE_KEY_POS);
        const saved = JSON.parse(raw === null || raw === "" ? "null" : raw);
        if (isPillPosition(saved)) {
          posX = Math.min(maxX, Math.max(8, saved.x));
          posY = Math.min(maxY, Math.max(8, saved.y));
        }
      } catch (error) {
        reportRecoverableError("restore pill position", error);
      }
      pill.style.left = `${posX}px`;
      pill.style.top = `${posY}px`;
      let dragging = false;
      let startX = 0, startY = 0;
      let originX = 0, originY = 0;
      const onPointerMove = (e) => {
        if (!dragging) return;
        const nextX = Math.max(
          8,
          Math.min(
            window.innerWidth - pill.offsetWidth - 8,
            originX + e.clientX - startX
          )
        );
        const nextY = Math.max(
          8,
          Math.min(
            window.innerHeight - pill.offsetHeight - 8,
            originY + e.clientY - startY
          )
        );
        pill.style.left = `${nextX}px`;
        pill.style.top = `${nextY}px`;
      };
      const onPointerUp = (e) => {
        if (!dragging) return;
        dragging = false;
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        if (Math.abs(e.clientX - startX) < 4 && Math.abs(e.clientY - startY) < 4) {
          togglePanel(true);
          return;
        }
        const rect = pill.getBoundingClientRect();
        positionStore.writeJson(STORAGE_KEY_POS, { x: rect.left, y: rect.top });
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
    function ensureHUDMounted() {
      if (isEngineDormant2()) return;
      injectStyles();
      if (!hudRootElement?.isConnected) {
        buildHUD();
      } else if (document.body && hudRootElement.parentElement !== document.body) {
        document.body.appendChild(hudRootElement);
      }
    }
    function teardown() {
      if (searchDebounceTimer !== null) {
        window.clearTimeout(searchDebounceTimer);
      }
      searchDebounceTimer = null;
      document.getElementById(HUD_ID)?.remove();
      hudRootElement = null;
      hudShadowRoot = null;
      hudStats = null;
      searchInput = null;
      searchResultsBox = null;
      state.hudOpen = false;
    }
    return {
      buildHUD,
      ensureHUDMounted,
      togglePanel,
      updateHudDashboard,
      teardown
    };
  }

  // scripts/ai-chat-turbo-engine/src/ui/chat-capsules.ts
  function createChatCapsuleUtils(deps) {
    const { el, withSelfMutation, state } = deps;
    const isUserTurn = deps.isUserTurn;
    const processedUserTurns = /* @__PURE__ */ new WeakSet();
    const virtualFileChatRows = /* @__PURE__ */ new WeakMap();
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
          "aria-label": "虚拟文件"
        },
        [pill]
      );
      parent.insertBefore(row, turnElement);
      virtualFileChatRows.set(turnElement, row);
      return row;
    }
    function collapseInChatFileBlocks(turnElement) {
      if (!state.virtualFileEnabled || !isUserTurn(turnElement)) {
        return;
      }
      const existingRow = virtualFileChatRows.get(turnElement);
      if (processedUserTurns.has(turnElement) && existingRow?.isConnected) {
        return;
      }
      if (!existingRow?.isConnected) {
        processedUserTurns.delete(turnElement);
        virtualFileChatRows.delete(turnElement);
      }
      const walker = document.createTreeWalker(turnElement, NodeFilter.SHOW_TEXT);
      let targetTextNode = null;
      while (walker.nextNode()) {
        const currentNode = walker.currentNode;
        if (currentNode.nodeType === Node.TEXT_NODE && currentNode.nodeValue !== null && currentNode.nodeValue.includes(VF_TOKEN_START)) {
          targetTextNode = currentNode instanceof Text ? currentNode : null;
          break;
        }
      }
      if (!targetTextNode) return;
      const codeBlockElem = targetTextNode.parentElement?.closest("pre, code-block") ?? null;
      let containerBlock = codeBlockElem;
      if (!containerBlock) {
        let cur = targetTextNode.parentElement;
        while (cur && cur !== turnElement) {
          const tag = cur.tagName.toLowerCase();
          if (["p", "div", "pre", "code-block"].includes(tag) || cur.classList.contains("query-text") || cur.classList.contains("user-query-text")) {
            containerBlock = cur;
            break;
          }
          cur = cur.parentElement;
        }
      }
      if (!containerBlock) {
        containerBlock = targetTextNode.parentElement;
      }
      if (!(containerBlock instanceof HTMLElement)) return;
      const hostBlock = containerBlock;
      const fullRawText = hostBlock.textContent || "";
      const startIndex = fullRawText.indexOf(VF_TOKEN_START);
      if (startIndex === -1) return;
      const match = fullRawText.match(VF_REGEX);
      if (!match) return;
      const fileName = (match[1] ?? "").trim();
      const lineCount = parseInt(match[2] ?? "0", 10) || 0;
      const sizeBytes = parseInt(match[3] ?? "0", 10) || 0;
      const kbSize = (sizeBytes / 1024).toFixed(1);
      const metaInfo = `${lineCount.toLocaleString()} 行 · ${kbSize} KB`;
      let userPrompt = fullRawText.slice(0, startIndex);
      userPrompt = userPrompt.replace(/```[a-z]*\s*$/i, "").trim();
      if (userPrompt === "请查阅并分析以下文本内容：" || userPrompt === "请查阅以下文本：") {
        userPrompt = "";
      }
      let promptAlreadyVisible = false;
      let prev = hostBlock.previousElementSibling;
      while (prev) {
        if (prev.textContent && prev.textContent.trim().length > 0) {
          promptAlreadyVisible = true;
          break;
        }
        prev = prev.previousElementSibling;
      }
      const pill = withSelfMutation(() => {
        let isExpanded = false;
        const toggleBtn = el(
          "button",
          {
            type: "button",
            style: "background:rgba(255,255,255,0.08);border:1px solid rgba(148,163,184,0.25);color:#cbd5e1;padding:3px 12px;border-radius:999px;font:11px sans-serif;cursor:pointer;margin-left:auto;transition:all 0.15s ease;"
          },
          ["展开查看文本"]
        );
        const capsule = el(
          "div",
          {
            className: "ai-turbo-chat-capsule",
            style: "display:inline-flex;align-items:center;gap:8px;padding:6px 14px;background:rgba(18,24,38,0.95);border:1px solid rgba(52,211,153,0.45);border-radius:9999px;box-shadow:0 2px 10px rgba(0,0,0,0.3);user-select:none;max-width:100%;box-sizing:border-box;margin:6px 0 10px;"
          },
          [
            el("span", { style: "font-size:14px;line-height:1;" }, ["📄"]),
            el(
              "span",
              {
                style: "font:600 12px ui-monospace,monospace;color:#f1f5f9;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
              },
              [fileName]
            ),
            el(
              "span",
              {
                style: "font:10px ui-monospace;background:rgba(52,211,153,0.15);color:#34d399;padding:2px 6px;border-radius:4px;"
              },
              [metaInfo]
            ),
            toggleBtn
          ]
        );
        hostBlock.classList.add("ai-turbo-chat-folded-target");
        hostBlock.style.setProperty("display", "none", "important");
        hostBlock.style.setProperty("contain", "strict", "important");
        toggleBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          isExpanded = !isExpanded;
          toggleBtn.textContent = isExpanded ? "收起文本" : "展开查看文本";
          if (isExpanded) {
            hostBlock.style.setProperty("display", "block", "important");
            hostBlock.style.setProperty("max-height", "320px", "important");
            hostBlock.style.setProperty("overflow", "auto", "important");
          } else {
            hostBlock.style.setProperty("display", "none", "important");
          }
        });
        if (!promptAlreadyVisible && userPrompt) {
          const promptElem = el(
            "div",
            {
              className: "ai-turbo-chat-user-prompt",
              style: "margin-bottom:8px!important;white-space:pre-wrap!important;word-break:break-word!important;font:inherit!important;color:inherit!important;line-height:1.5!important;"
            },
            [userPrompt]
          );
          hostBlock.insertAdjacentElement("beforebegin", promptElem);
        }
        return capsule;
      });
      const mountedRow = mountVirtualFileCapsuleOutsideTurn(turnElement, pill);
      if (mountedRow) {
        processedUserTurns.add(turnElement);
      }
    }
    return { collapseInChatFileBlocks };
  }

  // scripts/ai-chat-turbo-engine/src/ui/icons.ts
  function createUiIcon(name, size = 14) {
    const paths = {
      file: ["M6 3.5h7.7L18.5 8v12H6z", "M13.5 3.5V8h5"],
      eye: [
        "M2.8 12s3.3-5 9.2-5 9.2 5 9.2 5-3.3 5-9.2 5-9.2-5-9.2-5z",
        "M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"
      ],
      close: ["M5 5l14 14", "M19 5L5 19"],
      bolt: ["M13.2 2.5L5 13h6.1l-.8 8.5L19 10.2h-6.2z"]
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
        "path"
      );
      path.setAttribute("d", pathData);
      svg.appendChild(path);
    }
    return svg;
  }

  // scripts/ai-chat-turbo-engine/src/ui/virtual-files.ts
  var VF_TRAY_SYNC_INTERVAL = 90;
  function createVirtualFileUtils(deps) {
    const {
      el,
      withSelfMutation,
      composer,
      state,
      isEngineDormant: isEngineDormant2,
      updateHudDashboard,
      suspendObservers
    } = deps;
    let activeVirtualFiles = [];
    let trayIsDirty = false;
    let virtualFileTrayAnchor = null;
    let virtualFileTrayResizeObserver = null;
    let virtualFileTrayPositionFrame = 0;
    let virtualFileTraySyncRaf = 0;
    let virtualFileTraySyncLastTs = 0;
    let virtualFileTrayLastSignature = "";
    let virtualFileTrayCachedInput = null;
    function stopVirtualFileTrayTracking() {
      stopVirtualFileTraySyncLoop();
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
      const observed = /* @__PURE__ */ new Set();
      const observeNode = (node2) => {
        if (!(node2 instanceof Element)) return;
        if (node2 === document.body || node2 === document.documentElement) return;
        if (observed.has(node2)) return;
        observed.add(node2);
        if (!virtualFileTrayResizeObserver) return;
        try {
          virtualFileTrayResizeObserver.observe(node2);
        } catch (error) {
          reportRecoverableError("observe tray layout", error);
        }
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
        input = composer.getChatInput();
        virtualFileTrayCachedInput = input;
      }
      if (!input || !input.isConnected) {
        tray.classList.remove("is-positioned");
        resetVirtualFileTraySignature();
        return;
      }
      const anchor = composer.getInputContainer(input);
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
      const bounds = composer.getComposerVisualBounds(input, anchor);
      const viewportPadding = 18;
      const verticalGap = 16;
      let visualTop = Number.isFinite(bounds.top) && bounds.top <= inputRect.top + 1 ? bounds.top : inputRect.top;
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
        Math.max(viewportPadding, viewportWidth - trayWidth - viewportPadding)
      );
      const finalBottom = Math.max(
        viewportPadding,
        viewportHeight - visualTop + verticalGap
      );
      const maxTrayHeight = Math.max(
        72,
        visualTop - viewportPadding - verticalGap
      );
      const signature = [
        Math.round(left * 10) / 10,
        Math.round(finalBottom * 10) / 10,
        Math.round(trayWidth * 10) / 10,
        Math.round(maxTrayHeight * 10) / 10
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
      tray.dataset["placement"] = "top";
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
        onclick: (event) => {
          if (event.target === previewBackdrop) previewBackdrop.remove();
        }
      });
      const titleSpan = el(
        "span",
        {
          style: "font:600 13px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#f8fafc;max-width:70%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
        },
        [
          `📄 ${fileItem.name} (${fileItem.lineCount.toLocaleString()} 行 · ${(fileItem.size / 1024).toFixed(1)} KB)`
        ]
      );
      const closeBtn = el(
        "button",
        {
          type: "button",
          style: "background:transparent;border:0;color:#94a3b8;cursor:pointer;font-size:16px;line-height:1;padding:4px;border-radius:4px;",
          onclick: () => previewBackdrop.remove()
        },
        ["✕"]
      );
      const header = el(
        "div",
        {
          style: "flex-shrink:0;display:flex;justify-content:space-between;align-items:center;padding:12px 18px;border-bottom:1px solid rgba(148,163,184,0.15);background:rgba(18,24,38,0.98);"
        },
        [titleSpan, closeBtn]
      );
      const bodyText = el(
        "pre",
        {
          style: "flex:1 1 auto;min-height:0;margin:0;padding:16px;overflow-y:auto;overflow-x:auto;background:rgba(5,8,15,0.7);font:12px/1.6 ui-monospace,monospace;color:#cbd5e1;white-space:pre-wrap;word-break:break-all;"
        },
        [
          fileItem.content.slice(0, 8e3) + (fileItem.content.length > 8e3 ? "\n\n... (预览仅截取前 8,000 字符，发送时将提交完整全部文本)" : "")
        ]
      );
      const footerText = el(
        "span",
        { style: "font:11px sans-serif;color:#64748b;" },
        ["按 Esc 键或点击外部任意区域即可快速关闭"]
      );
      const footerCloseBtn = el(
        "button",
        {
          type: "button",
          style: "background:rgba(255,255,255,0.08);border:1px solid rgba(148,163,184,0.25);color:#e2e8f0;padding:4px 14px;border-radius:6px;font:11px sans-serif;cursor:pointer;",
          onclick: () => previewBackdrop.remove()
        },
        ["关闭"]
      );
      const footer = el(
        "div",
        {
          style: "flex-shrink:0;display:flex;justify-content:space-between;align-items:center;padding:10px 18px;border-top:1px solid rgba(148,163,184,0.15);background:rgba(18,24,38,0.98);"
        },
        [footerText, footerCloseBtn]
      );
      const modalBox = el(
        "div",
        {
          style: "background:#0d121c;border:1px solid rgba(52,211,153,0.35);box-shadow:0 24px 60px rgba(0,0,0,0.85);border-radius:14px;width:720px;max-width:94vw;max-height:85vh;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;"
        },
        [header, bodyText, footer]
      );
      previewBackdrop.appendChild(modalBox);
      document.body.appendChild(previewBackdrop);
    }
    function renderVirtualFileTray() {
      let tray = document.getElementById("ai-turbo-vf-tray");
      resetVirtualFileTraySignature();
      if (!activeVirtualFiles.length) {
        const currentTray = tray;
        if (currentTray) {
          withSelfMutation(() => currentTray.remove());
        }
        stopVirtualFileTrayTracking();
        trayIsDirty = false;
        updateHudDashboard();
        return;
      }
      const input = composer.getChatInput();
      if (!input) return;
      const container = composer.getInputContainer(input);
      if (!container || !container.isConnected) {
        return;
      }
      withSelfMutation(() => {
        if (!tray) {
          tray = el("div", {
            id: "ai-turbo-vf-tray",
            className: "ai-turbo-vf-tray",
            role: "region",
            "aria-label": "虚拟文件"
          });
          document.body.appendChild(tray);
        }
        tray.textContent = "";
        const header = el(
          "div",
          {
            className: "ai-turbo-vf-header"
          },
          [
            el(
              "div",
              {
                className: "ai-turbo-vf-heading"
              },
              [
                el(
                  "span",
                  {
                    className: "ai-turbo-vf-heading-icon"
                  },
                  [createUiIcon("bolt", 13)]
                ),
                el(
                  "span",
                  {
                    className: "ai-turbo-vf-heading-title"
                  },
                  ["虚拟文件"]
                ),
                el(
                  "span",
                  {
                    className: "ai-turbo-vf-heading-count"
                  },
                  [`${activeVirtualFiles.length}`]
                )
              ]
            ),
            el(
              "span",
              {
                className: "ai-turbo-vf-heading-hint"
              },
              ["发送时作为上下文附加"]
            )
          ]
        );
        const fileList = el("div", {
          className: "ai-turbo-vf-list"
        });
        tray.appendChild(header);
        tray.appendChild(fileList);
        for (const item of activeVirtualFiles) {
          const sizeText = `${(item.size / 1024).toFixed(1)} KB`;
          const nameLabel = el(
            "span",
            {
              className: "ai-turbo-vf-name",
              title: item.name
            },
            [item.name]
          );
          const metaLabel = el(
            "span",
            {
              className: "ai-turbo-vf-meta"
            },
            [`${item.lineCount.toLocaleString()} 行`, " · ", sizeText]
          );
          const btnPreview = el(
            "button",
            {
              type: "button",
              className: "ai-turbo-vf-action ai-turbo-vf-action-preview",
              title: "预览文本内容",
              "aria-label": `预览 ${item.name}`
            },
            [createUiIcon("eye", 13)]
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
              "aria-label": `移除 ${item.name}`
            },
            [createUiIcon("close", 13)]
          );
          btnDelete.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            removeVirtualFile(item.id);
          });
          const fileItem = el(
            "div",
            {
              className: "ai-turbo-vf-pill"
            },
            [
              el(
                "span",
                {
                  className: "ai-turbo-vf-file-icon"
                },
                [createUiIcon("file", 14)]
              ),
              el(
                "div",
                {
                  className: "ai-turbo-vf-file-copy"
                },
                [nameLabel, metaLabel]
              ),
              el(
                "span",
                {
                  className: "ai-turbo-vf-badge"
                },
                ["TEXT"]
              ),
              el(
                "div",
                {
                  className: "ai-turbo-vf-actions"
                },
                [btnPreview, btnDelete]
              )
            ]
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
    function readLegacyClipboardData() {
      const legacy = Reflect.get(window, "clipboardData");
      if (typeof legacy !== "object" || legacy === null) return null;
      const getData = Reflect.get(legacy, "getData");
      if (typeof getData !== "function") return null;
      return {
        getData: (type) => {
          const value = Reflect.apply(getData, legacy, [type]);
          return typeof value === "string" ? value : "";
        }
      };
    }
    function handlePasteIntercept(event) {
      if (isEngineDormant2()) return;
      if (!state.virtualFileEnabled) return;
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(
        'rich-textarea, textarea, [contenteditable="true"], [role="textbox"]'
      )) {
        return;
      }
      const clipData = event.clipboardData || readLegacyClipboardData();
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
        timestamp: Date.now()
      });
      updateHudDashboard();
      trayIsDirty = true;
      renderVirtualFileTray();
    }
    function fuseAndSubmit(inputElement) {
      if (!activeVirtualFiles.length || !inputElement) return false;
      let userText = "";
      if (inputElement instanceof HTMLTextAreaElement) {
        userText = inputElement.value.trim();
      } else {
        userText = (inputElement.innerText || inputElement.textContent || "").trim();
      }
      const fileBlocks = activeVirtualFiles.map((vf) => {
        return `

${CODE_FENCE}text
${VF_TOKEN_START}${vf.name}|${vf.lineCount}|${vf.size}${VF_TOKEN_END}
${vf.content}
${CODE_FENCE}`;
      });
      const finalPrompt = (userText ? userText : "请查阅并分析以下文本内容：") + fileBlocks.join("\n");
      activeVirtualFiles = [];
      trayIsDirty = true;
      renderVirtualFileTray();
      suspendObservers();
      withSelfMutation(() => {
        composer.insertTextAtomic(inputElement, finalPrompt);
      });
      return true;
    }
    function clearFiles() {
      activeVirtualFiles = [];
      trayIsDirty = true;
      renderVirtualFileTray();
    }
    function activeFileCount() {
      return activeVirtualFiles.length;
    }
    function isTrayDirty() {
      return trayIsDirty;
    }
    return {
      stopTracking: stopVirtualFileTrayTracking,
      stopSyncLoop: stopVirtualFileTraySyncLoop,
      schedulePosition: scheduleVirtualFileTrayPosition,
      renderVirtualFileTray,
      clearFiles,
      activeFileCount,
      isTrayDirty,
      handlePasteIntercept,
      fuseAndSubmit
    };
  }

  // scripts/ai-chat-turbo-engine/src/ui/styles.ts
  function injectEngineStyles() {
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

  // scripts/ai-chat-turbo-engine/src/lifecycle.ts
  function initializeEngine() {
    const VERSION = readUserscriptInfo(globalThis)?.script.version ?? "0.0.0";
    const detectedPlatform = detectPlatform();
    if (!detectedPlatform) return;
    const currentPlatform = detectedPlatform;
    const {
      clearRenderedCache,
      extractTurnText,
      filterOutNested,
      getActiveTurnSelectors,
      getTurnRole,
      getTurns,
      invalidateActiveTurnSelectorGroup,
      isGeminiThoughtElement,
      isUserTurn
    } = createTurnUtils(currentPlatform);
    const state = createEngineState();
    const turnIndex = /* @__PURE__ */ new Map();
    const restoredTurns = /* @__PURE__ */ new WeakSet();
    let isSubmitting = false;
    let observer = null;
    let scheduleTimer = null;
    let lastUpdateTime = 0;
    let fullTurnSyncRequested = true;
    let dirtyTurns = /* @__PURE__ */ new Set();
    let previousTurns = [];
    let selfMutationDepth = 0;
    let globalListenersBound = false;
    let historyPatched = false;
    let routeWatcherBound = false;
    let viewportListenersBound = false;
    let loadListenerBound = false;
    function el(tag, attrs = {}, children = []) {
      const elem = document.createElement(tag);
      for (const [key, value] of Object.entries(attrs)) {
        if (key === "className") {
          if (typeof value === "string") elem.className = value;
        } else if (key === "style" && typeof value === "string") {
          elem.style.cssText = value;
        } else if (key.startsWith("on") && typeof value === "function") {
          elem.addEventListener(key.slice(2).toLowerCase(), value);
        } else {
          elem.setAttribute(key, String(value));
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
    const reasoningStatusNode = el("div", { className: "reasoning-status", role: "status" }, []);
    const toolStatusNode = el("div", { className: "reasoning-status", role: "status" }, []);
    const composer = createComposerUtils({ currentPlatform });
    const codeBlocks = createCodeBlockUtils({
      currentPlatform,
      state,
      el,
      withSelfMutation,
      filterOutNested,
      isGeminiThoughtElement,
      requestUpdate: () => requestUpdate()
    });
    function withSelfMutation(task) {
      selfMutationDepth++;
      try {
        return task();
      } finally {
        selfMutationDepth--;
      }
    }
    const chatCapsules = createChatCapsuleUtils({
      el,
      withSelfMutation,
      state,
      isUserTurn
    });
    const toolScope = createToolPopupScope();
    const restoreCoordinator = createRestoreCoordinator();
    const reasoning = createReasoningUtils({
      el,
      state,
      toolScope,
      withSelfMutation,
      triggerSendButton: (control) => composer.triggerSendButton(control),
      requestUpdate: () => requestUpdate(),
      markRestoredTurn: (turnElement) => restoredTurns.add(turnElement),
      requestFullTurnSync: () => {
        fullTurnSyncRequested = true;
      },
      restoreCoordinator
    });
    const toolMemory = createToolMemoryUtils({
      el,
      state,
      triggerSendButton: (control) => composer.triggerSendButton(control),
      restoreCoordinator
    });
    const virtualFiles = createVirtualFileUtils({
      el,
      withSelfMutation,
      composer,
      state,
      isEngineDormant,
      updateHudDashboard: () => hud?.updateHudDashboard(),
      suspendObservers: () => {
        observer?.disconnect();
        codeBlocks.disconnectCodeLayoutObserver();
      }
    });
    const sendIntercept = createSendInterceptUtils({
      currentPlatform,
      composer,
      state,
      isEngineDormant,
      fuseAndSubmit: (inputElement) => virtualFiles.fuseAndSubmit(inputElement),
      resumeObservers: () => {
        observeDom();
        codeBlocks.observeCodeLayout();
      },
      hasActiveFiles: () => virtualFiles.activeFileCount() > 0,
      isSubmitting: () => isSubmitting,
      setSubmitting: (value) => {
        isSubmitting = value;
      }
    });
    const handoff = createHandoffUtils({
      currentPlatform,
      composer,
      sendIntercept,
      turns: {
        getTurns,
        extractTurnText,
        getTurnRole
      },
      isSubmitting: () => isSubmitting,
      setSubmitting: (value) => {
        isSubmitting = value;
      }
    });
    let hud = null;
    hud = createHudUtils({
      el,
      state,
      currentPlatform,
      version: VERSION,
      reasoningStatusNode,
      toolStatusNode,
      codeBlocks,
      reasoning,
      toolMemory,
      handoff,
      isEngineDormant,
      requestUpdate: () => requestUpdate(),
      requestFullTurnSync: () => {
        fullTurnSyncRequested = true;
      },
      saveConfig: () => saveCurrentConfig(state),
      activeFileCount: () => virtualFiles.activeFileCount(),
      clearFiles: () => virtualFiles.clearFiles(),
      injectStyles: injectEngineStyles
    });
    function scheduleTrayPosition() {
      virtualFiles.schedulePosition();
    }
    function syncTurnIndex(forceFull) {
      const turns = getTurns();
      const structuralChange = forceFull || turns.length !== previousTurns.length || turns.some((turnElement, index) => turnElement !== previousTurns[index]);
      if (forceFull) {
        turnIndex.clear();
      } else if (structuralChange) {
        const liveTurns = new Set(turns);
        for (const indexedTurn of [...turnIndex.keys()]) {
          if (!liveTurns.has(indexedTurn)) turnIndex.delete(indexedTurn);
        }
      }
      for (const turnElement of turns) {
        chatCapsules.collapseInChatFileBlocks(turnElement);
        const record = turnIndex.get(turnElement);
        if (!record) {
          turnIndex.set(turnElement, {
            id: turnIndex.size,
            element: turnElement,
            text: extractTurnText(turnElement)
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
          text: extractTurnText(turnElement)
        };
        turnIndex.set(turnElement, fallbackRecord);
        return fallbackRecord;
      });
      const cutoff = state.pruneEnabled ? Math.max(0, turns.length - state.keepTurns) : 0;
      const toDehydrate = [];
      const toHydrate = [];
      turns.forEach((turnElement, index) => {
        const shouldDehydrate = state.pruneEnabled && index < cutoff && !restoredTurns.has(turnElement);
        const isDehydrated = turnElement.classList.contains(
          "ai-turbo-dehydrated"
        );
        if (shouldDehydrate && !isDehydrated && turnElement instanceof HTMLElement) {
          toDehydrate.push({
            elem: turnElement,
            height: turnElement.offsetHeight || 120
          });
        } else if (!shouldDehydrate && isDehydrated && turnElement instanceof HTMLElement) {
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
        (count, turnElement) => count + Number(turnElement.classList.contains("ai-turbo-dehydrated")),
        0
      );
      previousTurns = turns;
      dirtyTurns.clear();
      fullTurnSyncRequested = false;
    }
    function findIndexedTurnAncestor(mutationNode) {
      let ancestor = mutationNode instanceof Element ? mutationNode : mutationNode.parentElement;
      while (ancestor) {
        if (turnIndex.has(ancestor)) return ancestor;
        ancestor = ancestor.parentElement;
      }
      return null;
    }
    function collectMutationTargets(records) {
      const turnSelector = getActiveTurnSelectors().join(",");
      const allTurnSelectors = [
        ...currentPlatform.turnSelectors || [],
        ...(currentPlatform.turnSelectorGroups || []).flat()
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
        "[data-chatgpt-agent-turn-start]"
      ].join(",");
      const anyTurnSelector = `${allTurnSelector},${turnMarkerSelector}`;
      const codeSelectors = currentPlatform.codeSelectors || ["pre"];
      let structuralChange = false;
      let shouldRequestUpdate = false;
      for (const mutationRecord of records) {
        const mutationTarget = mutationRecord.target;
        if (mutationTarget instanceof Element && mutationTarget.closest(
          `#${HUD_ID}, .ai-turbo-code-bar, #ai-turbo-vf-tray, .ai-turbo-chat-capsule, #ai-turbo-vf-preview-modal`
        )) {
          continue;
        }
        if (mutationRecord.type === "attributes") {
          const attributeName = mutationRecord.attributeName || "";
          if (!(mutationTarget instanceof Element)) continue;
          const isSelectorAttribute = attributeName === "class" || attributeName === "id";
          const isMarkerAttribute = TURN_MARKER_ATTRIBUTES.has(attributeName);
          const isIndexedTurn = turnIndex.has(mutationTarget);
          const matchesKnownTurn = isIndexedTurn || Boolean(allTurnSelector) && (mutationTarget.matches(allTurnSelector) || mutationTarget.matches(turnMarkerSelector) || mutationTarget.matches('[data-testid^="conversation-turn-"]'));
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
        const possibleTurn = indexedTurn || (mutationTarget instanceof Element ? mutationTarget.closest(turnSelector) : mutationTarget.parentElement?.closest(turnSelector));
        if (possibleTurn instanceof Element && !isGeminiThoughtElement(possibleTurn) && !matchesReasoningElement(possibleTurn)) {
          dirtyTurns.add(possibleTurn);
        }
        let possibleCode = null;
        if (mutationTarget instanceof Element) {
          for (const selector of codeSelectors) {
            const candidate = mutationTarget.matches(selector) ? mutationTarget : mutationTarget.closest(selector);
            if (candidate instanceof HTMLElement) {
              possibleCode = codeBlocks.normalizeCodeElement(candidate);
              break;
            }
          }
        }
        if (possibleCode instanceof HTMLElement) {
          codeBlocks.markCodeBlockDirty(possibleCode);
        }
        if (mutationRecord.type !== "childList") continue;
        for (const changedNode of [
          ...mutationRecord.addedNodes,
          ...mutationRecord.removedNodes
        ]) {
          if (!(changedNode instanceof Element)) continue;
          if (changedNode.matches(anyTurnSelector) || changedNode.querySelector(anyTurnSelector)) {
            structuralChange = true;
          }
          for (const selector of codeSelectors) {
            if (changedNode.matches(selector)) {
              const elNorm = codeBlocks.normalizeCodeElement(changedNode);
              if (elNorm instanceof HTMLElement) {
                codeBlocks.markCodeBlockDirty(elNorm);
              }
            }
            changedNode.querySelectorAll(selector).forEach((c) => {
              const elNorm = codeBlocks.normalizeCodeElement(c);
              if (elNorm instanceof HTMLElement) {
                codeBlocks.markCodeBlockDirty(elNorm);
              }
            });
          }
        }
      }
      if (structuralChange) {
        invalidateActiveTurnSelectorGroup();
        fullTurnSyncRequested = true;
        codeBlocks.requestCodeScan();
      }
      return shouldRequestUpdate || structuralChange;
    }
    function runScheduledUpdate() {
      scheduleTimer = null;
      lastUpdateTime = performance.now();
      clearRenderedCache();
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
      codeBlocks.flushCodeBlockScan();
      toolMemory.maybeRestore();
      hud?.updateHudDashboard();
      hud?.ensureHUDMounted();
      if (virtualFiles.isTrayDirty()) virtualFiles.renderVirtualFileTray();
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
        subtree: true
      });
    }
    function patchHistoryForSpaNavigation() {
      if (historyPatched) return;
      historyPatched = true;
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;
      history.pushState = function(...args) {
        const result = originalPushState.apply(this, args);
        window.setTimeout(() => {
          if (syncEngineActivation()) return;
          invalidateActiveTurnSelectorGroup();
          fullTurnSyncRequested = true;
          codeBlocks.requestCodeScan();
          requestUpdate();
          reasoning.scheduleReasoningRestore();
          toolMemory.scheduleRestore();
        }, 0);
        return result;
      };
      history.replaceState = function(...args) {
        const result = originalReplaceState.apply(this, args);
        window.setTimeout(() => {
          if (syncEngineActivation()) return;
          invalidateActiveTurnSelectorGroup();
          fullTurnSyncRequested = true;
          codeBlocks.requestCodeScan();
          requestUpdate();
        }, 0);
        return result;
      };
      window.addEventListener("popstate", () => {
        if (syncEngineActivation()) return;
        invalidateActiveTurnSelectorGroup();
        fullTurnSyncRequested = true;
        codeBlocks.requestCodeScan();
        requestUpdate();
        reasoning.scheduleReasoningRestore();
        toolMemory.scheduleRestore();
      });
    }
    function teardownEngine() {
      reasoning.attachStatusNode(null);
      toolMemory.teardown();
      setEngineActive(false);
      reasoning.clearReasoningRestoreTimer();
      handoff.clearResumeTimer();
      hud?.teardown();
      hud = null;
      observer?.disconnect();
      codeBlocks.disconnectCodeLayoutObserver();
      if (scheduleTimer) {
        window.cancelAnimationFrame(scheduleTimer);
        window.clearTimeout(scheduleTimer);
        scheduleTimer = null;
      }
      virtualFiles.stopSyncLoop();
      codeBlocks.unmountAllCodeControls();
      withSelfMutation(() => {
        document.querySelectorAll(".ai-turbo-chat-capsule, .ai-turbo-chat-user-prompt").forEach((node) => node.remove());
        document.querySelectorAll(".ai-turbo-chat-folded-target").forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          node.classList.remove("ai-turbo-chat-folded-target");
          node.style.removeProperty("display");
          node.style.removeProperty("max-height");
          node.style.removeProperty("overflow");
          node.style.removeProperty("contain");
        });
        document.querySelectorAll(".ai-turbo-dehydrated").forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          node.classList.remove("ai-turbo-dehydrated");
          node.style.removeProperty("--turbo-cached-h");
        });
      });
      document.getElementById(HUD_ID)?.remove();
      document.getElementById(STYLE_ID)?.remove();
      document.getElementById("ai-turbo-vf-tray")?.remove();
      document.getElementById("ai-turbo-vf-preview-modal")?.remove();
      handoff.attachStatusNode(null);
    }
    function syncEngineActivation() {
      if (isAuthOrRedirectRoute()) {
        if (isEngineActive()) teardownEngine();
        return true;
      }
      if (!isEngineActive()) boot();
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
              "ai-turbo-vf-preview-modal"
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
              hud?.togglePanel(false);
              return;
            }
          }
          if (event.altKey && !event.ctrlKey && !event.metaKey && (event.code === "KeyT" || event.key.toLowerCase() === "t" || event.key === "†")) {
            event.preventDefault();
            event.stopPropagation();
            hud?.togglePanel();
          }
        },
        true
      );
      window.addEventListener(
        "paste",
        (event) => virtualFiles.handlePasteIntercept(event),
        true
      );
      window.addEventListener(
        "keydown",
        (event) => sendIntercept.handleSendIntercept(event),
        true
      );
      window.addEventListener(
        "click",
        (event) => sendIntercept.handleSendIntercept(event),
        true
      );
      window.addEventListener("click", reasoning.handleReasoningClick, true);
      window.addEventListener("click", toolMemory.handleToolClick, true);
      window.addEventListener("click", reasoning.handleDehydratedClick, true);
    }
    function boot() {
      if (isEngineActive()) return;
      if (isAuthOrRedirectRoute()) return;
      setEngineActive(true);
      loadSavedConfig(state);
      injectEngineStyles();
      hud?.buildHUD();
      codeBlocks.observeCodeLayout();
      observeDom();
      patchHistoryForSpaNavigation();
      bindGlobalListeners();
      reasoning.scheduleReasoningRestore();
      reasoning.renderReasoningStatus();
      toolMemory.scheduleRestore();
      toolMemory.renderStatus();
      if (!viewportListenersBound) {
        viewportListenersBound = true;
        window.addEventListener("resize", scheduleTrayPosition, {
          passive: true
        });
        window.addEventListener("scroll", scheduleTrayPosition, {
          passive: true,
          capture: true
        });
        window.visualViewport?.addEventListener(
          "resize",
          scheduleTrayPosition
        );
        window.visualViewport?.addEventListener(
          "scroll",
          scheduleTrayPosition
        );
      }
      fullTurnSyncRequested = true;
      codeBlocks.requestCodeScan();
      requestUpdate();
      handoff.resumePendingHandoffPrompt();
      if (!loadListenerBound) {
        loadListenerBound = true;
        window.addEventListener("load", () => {
          if (isEngineDormant()) return;
          fullTurnSyncRequested = true;
          codeBlocks.requestCodeScan();
          hud?.ensureHUDMounted();
          requestUpdate();
        });
      }
      [250, 800, 2e3].forEach((delay) => {
        window.setTimeout(() => {
          if (isEngineDormant()) return;
          hud?.ensureHUDMounted();
          requestUpdate();
        }, delay);
      });
    }
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
  }

  // scripts/ai-chat-turbo-engine/src/index.ts
  initializeEngine();
})();
