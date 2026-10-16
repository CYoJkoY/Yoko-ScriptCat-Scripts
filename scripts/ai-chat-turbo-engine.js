// ==UserScript==
// @name         AI Chat Turbo Engine
// @namespace    https://local/ai-turbo-engine-v9
// @version      0.12.1
// @description  跨平台 AI 对话加速：常驻统计 + 完整消息提取 + YAML 交接 + 多平台适配 + 长代码折叠 + 自适应脱水
// @author       Yoko
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

  const VERSION = "0.12.1";
  const HUD_ID = "ai-turbo-extreme-hud";
  const STYLE_ID = "ai-turbo-engine-styles";
  const CODE_COLLAPSE_HEIGHT = 300;
  const CODE_PREVIEW_HEIGHT = 200;
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
  const BLOCK_TEXT_TAGS = new Set([
    "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DD", "DIV", "DL", "DT",
    "FIELDSET", "FIGCAPTION", "FIGURE", "FOOTER", "H1", "H2", "H3", "H4",
    "H5", "H6", "HEADER", "HR", "LI", "MAIN", "NAV", "OL", "P", "SECTION",
    "TABLE", "TBODY", "TD", "TH", "THEAD", "TR", "UL",
  ]);

  const PLATFORMS = {
    chatgpt: {
      name: "ChatGPT",
      turnSelectorGroups: [
        [
          '[data-content-search-unit-key$=":user"]',
          '[data-content-search-unit-key$=":assistant"]',
        ],
        [
          '[data-message-author-role="user"]',
          '[data-message-author-role="assistant"]',
          '[data-role="user"]',
          '[data-role="assistant"]',
        ],
        [
          '[data-testid^="conversation-turn-"]',
          "article[data-turn]",
          "section[data-turn]",
        ],
        ["[data-turn-key]"],
      ],
      turnSelectors: [
        '[data-content-search-unit-key$=":user"]',
        '[data-content-search-unit-key$=":assistant"]',
        '[data-message-author-role="user"]',
        '[data-message-author-role="assistant"]',
        '[data-role="user"]',
        '[data-role="assistant"]',
        '[data-testid^="conversation-turn-"]',
        "article[data-turn]",
        "section[data-turn]",
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
        'form[data-chatgpt-composer] button[data-testid*="send"]',
        'form[data-chatgpt-composer] button[aria-label*="Send"]',
        'form[data-chatgpt-composer] button[aria-label*="发送"]',
        'button[data-testid="send-button"]',
        'button[data-testid="fruitjuice-send-button"]',
        'button[aria-label*="Send"]',
        'button[aria-label*="发送"]',
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
        'textarea[placeholder]',
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
        'textarea[placeholder]',
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
        'textarea[placeholder]',
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
        'textarea[placeholder]',
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
        'textarea[placeholder]',
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
    collapseCode: true,
    virtualFileEnabled: true,
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
        if (typeof parsed.pruneEnabled === "boolean") {
          state.pruneEnabled = parsed.pruneEnabled;
        }
        if (typeof parsed.collapseCode === "boolean") {
          state.collapseCode = parsed.collapseCode;
        }
        if (typeof parsed.virtualFileEnabled === "boolean") {
          state.virtualFileEnabled = parsed.virtualFileEnabled;
        }
      }
    } catch (_) {}
  }

  function saveCurrentConfig() {
    try {
      const config = {
        keepTurns: state.keepTurns,
        pruneEnabled: state.pruneEnabled,
        collapseCode: state.collapseCode,
        virtualFileEnabled: state.virtualFileEnabled,
      };
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
    } catch (_) {}
  }

  const turnIndex = new Map();
  const codeState = new Map();
  const processedUserTurns = new WeakSet();
  const virtualFileChatRows = new WeakMap();
  let activeVirtualFiles = [];
  let trayIsDirty = false;
  let isSubmitting = false;

  let hudRootElement = null;
  let hudShadowRoot = null;
  let hudStats = null;
  let handoffStatusNode = null;
  let searchInput = null;
  let searchResultsBox = null;
  let virtualFileTrayAnchor = null;
  let virtualFileTrayResizeObserver = null;
  let virtualFileTrayPositionFrame = 0;
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
  let selfMutationDepth = 0;

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
    if (!(rootElement instanceof Element) || matchesReasoningElement(rootElement)) {
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
        return Array.from(node.childNodes || []).map(walk).join("");
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
    if (contentSearchKey && /:(assistant|model|system)$/i.test(contentSearchKey)) {
      return false;
    }

    const roleValues = [
      turnElement.getAttribute("data-message-author-role"),
      turnElement.getAttribute("data-message-author"),
      turnElement.getAttribute("data-role"),
      turnElement.getAttribute("data-message-role"),
      turnElement.getAttribute("data-conversation-role"),
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
      if (platformUserSelectors.some((selector) => ancestor.matches(selector))) {
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

  function getTurns() {
    const collected = [];
    for (const selector of getActiveTurnSelectors()) {
      document
        .querySelectorAll(selector)
        .forEach((elem) => collected.push(elem));
    }

    const unnested = filterOutNested(collected);
    return unnested.filter(
      (element) =>
        !isGeminiThoughtElement(element) && !matchesReasoningElement(element),
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
      turns[0] !== previousTurns[0] ||
      turns[turns.length - 1] !== previousTurns[previousTurns.length - 1];

    if (structuralChange) {
      turnIndex.clear();
      turns.forEach((turnElement, index) => {
        collapseInChatFileBlocks(turnElement);
        turnIndex.set(turnElement, {
          id: index,
          element: turnElement,
          text: extractTurnText(turnElement),
        });
      });
    } else {
      for (const turnElement of dirtyTurns) {
        collapseInChatFileBlocks(turnElement);
        const record = turnIndex.get(turnElement);
        if (record) {
          record.text = extractTurnText(turnElement);
        } else {
          fullTurnSyncRequested = true;
        }
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
      const shouldDehydrate = state.pruneEnabled && index < cutoff;
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

    state.hiddenCount = cutoff;
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
            return candidate.matches(selector) || Boolean(candidate.closest(selector));
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

    if (!entry.isDisplayingStreaming && entry.renderedStaticOnce) {
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

  function getCodeControlAnchor(codeElement) {
    if (currentPlatform !== PLATFORMS.chatgpt) return codeElement;

    const parent = codeElement.parentElement;
    if (!(parent instanceof HTMLElement)) return codeElement;

    let display = "";
    try {
      display = window.getComputedStyle(parent).display;
    } catch (_) {
      return codeElement;
    }

    // ChatGPT may place <pre> inside a flex/grid code surface. Insert the bar
    // before that layout container so the control occupies its own row.
    return ["flex", "inline-flex", "grid", "inline-grid"].includes(display)
      ? parent
      : codeElement;
  }

  function positionCodeControl(entry, codeElement) {
    const anchor = getCodeControlAnchor(codeElement);
    if (
      entry.anchor === anchor &&
      entry.bar.isConnected &&
      entry.bar.nextElementSibling === anchor
    ) {
      return;
    }

    withSelfMutation(() => {
      entry.bar.remove();
      anchor.insertAdjacentElement("beforebegin", entry.bar);
      entry.anchor = anchor;
    });
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

    let sibling = codeElement.previousElementSibling;
    while (sibling && sibling.classList.contains("ai-turbo-code-bar")) {
      const toRemove = sibling;
      sibling = sibling.previousElementSibling;
      toRemove.remove();
    }

    const initialText = getCodeText(codeElement);
    const anchor = getCodeControlAnchor(codeElement);

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

    const bar = el("div", { className: "ai-turbo-code-bar" }, [
      metaWrap,
      toggleButton,
    ]);

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
      if (!activeBars.has(bar)) bar.remove();
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
        positionCodeControl(entry, codeElement);
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
          (candidate.offsetParent === null && candidate.getClientRects().length === 0)
        ) {
          continue;
        }
        if (
          candidate.matches('input[type="hidden"], textarea[aria-hidden="true"]') ||
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

  function getInputContainer(input) {
    if (!input) return null;
    const candidates = [
      ".input-area",
      ".input-area-container",
      "rich-textarea",
      "[class*='composer-parent']",
      "[class*='input-area']",
      "form",
      "[class*='composer']",
      "[class*='input-container']",
      "fieldset",
    ];
    for (const selector of candidates) {
      const matched = input.closest(selector);
      if (matched && matched.getBoundingClientRect().height > 20) {
        return matched;
      }
    }
    return input.parentElement;
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
    if (virtualFileTrayResizeObserver) {
      virtualFileTrayResizeObserver.disconnect();
      virtualFileTrayResizeObserver = null;
    }

    virtualFileTrayAnchor = null;

    if (virtualFileTrayPositionFrame) {
      window.cancelAnimationFrame(virtualFileTrayPositionFrame);
      virtualFileTrayPositionFrame = 0;
    }
  }

  function scheduleVirtualFileTrayPosition() {
    if (!activeVirtualFiles.length) return;

    if (virtualFileTrayPositionFrame) return;

    virtualFileTrayPositionFrame = window.requestAnimationFrame(() => {
      virtualFileTrayPositionFrame = 0;
      positionVirtualFileTray();
    });
  }

  function positionVirtualFileTray() {
    const tray = document.getElementById("ai-turbo-vf-tray");

    if (!tray || !tray.isConnected || !activeVirtualFiles.length) {
      return;
    }

    const input = getChatInput();
    const anchor = getInputContainer(input);

    if (!input || !anchor || !input.isConnected || !anchor.isConnected) {
      tray.classList.remove("is-positioned");
      return;
    }

    if (anchor !== virtualFileTrayAnchor) {
      if (virtualFileTrayResizeObserver) {
        virtualFileTrayResizeObserver.disconnect();
      }

      virtualFileTrayAnchor = anchor;

      if ("ResizeObserver" in window) {
        virtualFileTrayResizeObserver = new ResizeObserver(() => {
          scheduleVirtualFileTrayPosition();
        });

        virtualFileTrayResizeObserver.observe(anchor);

        if (input !== anchor) {
          virtualFileTrayResizeObserver.observe(input);
        }
      }
    }

    const anchorRect = anchor.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();

    if (
      !anchorRect.width ||
      !anchorRect.height ||
      !inputRect.width ||
      !inputRect.height
    ) {
      tray.classList.remove("is-positioned");
      return;
    }

    const viewportPadding = 18;
    const verticalGap = 16;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const availableWidth = Math.max(0, viewportWidth - viewportPadding * 2);

    const trayWidth = Math.min(Math.max(anchorRect.width, 280), availableWidth);

    const left = Math.min(
      Math.max(viewportPadding, anchorRect.left),
      Math.max(viewportPadding, viewportWidth - trayWidth - viewportPadding),
    );

    /*
     * 核心修改：
     * 不再使用 top / bottom 二选一。
     * 直接使用 bottom 锚定输入框顶部。
     *
     * 这样无论输入框高度怎么变化，
     * 托盘都始终位于输入框上方。
     */
    const bottom = viewportHeight - inputRect.top + verticalGap;

    tray.style.width = `${trayWidth}px`;
    tray.style.left = `${left}px`;
    tray.style.top = "auto";
    tray.style.bottom = `${Math.max(viewportPadding, bottom)}px`;

    /*
     * 输入框非常靠近顶部时，仍然保持托盘向上布局，
     * 不再翻转到输入框下面。
     */
    const maxTrayHeight = Math.max(
      48,
      inputRect.top - viewportPadding - verticalGap,
    );

    tray.style.maxHeight = `${maxTrayHeight}px`;
    tray.style.overflowY = "auto";

    tray.dataset.placement = "top";
    tray.classList.add("is-positioned");
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

    positionVirtualFileTray();
    window.requestAnimationFrame(positionVirtualFileTray);
    updateHudDashboard();
  }

  function handlePasteIntercept(event) {
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
      inputElement.value = text;
      inputElement.dispatchEvent(new Event("input", { bubbles: true }));
      inputElement.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    inputElement.focus();

    const singleContainer = `<div style="white-space:pre-wrap;">${escapeHtml(text)}</div>`;

    document.execCommand("selectAll", false, null);
    let success = false;
    try {
      success = document.execCommand("insertHTML", false, singleContainer);
    } catch (_) {}

    if (!success) {
      inputElement.textContent = text;
    }

    inputElement.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        inputType: "insertFromPaste",
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
    const maxAttempts = 30;

    const timer = setInterval(() => {
      attempts++;

      let sendBtn = null;
      for (const sel of currentPlatform.sendButtonSelectors || []) {
        const candidates = document.querySelectorAll(sel);
        for (const btn of candidates) {
          if (
            btn instanceof HTMLElement &&
            btn.isConnected &&
            (btn.offsetParent !== null || btn.getClientRects().length > 0) &&
            isSendControlForInput(btn, inputElement) &&
            !btn.hasAttribute("disabled") &&
            btn.getAttribute("aria-disabled") !== "true"
          ) {
            sendBtn = btn;
            break;
          }
        }
        if (sendBtn) break;
      }

      if (sendBtn) {
        clearInterval(timer);
        sendBtn.click();
        cleanupAndResume(onComplete, true);
        return;
      }

      if (attempts >= 8) {
        for (const sel of currentPlatform.sendButtonSelectors || []) {
          const btn = document.querySelector(sel);
          if (
            btn instanceof HTMLElement &&
            btn.isConnected &&
            (btn.offsetParent !== null || btn.getClientRects().length > 0) &&
            isSendControlForInput(btn, inputElement)
          ) {
            clearInterval(timer);
            btn.removeAttribute("disabled");
            btn.setAttribute("aria-disabled", "false");
            btn.click();
            cleanupAndResume(onComplete, true);
            return;
          }
        }
      }

      if (attempts >= maxAttempts) {
        clearInterval(timer);
        if (inputElement) {
          inputElement.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "Enter",
              code: "Enter",
              keyCode: 13,
              which: 13,
              bubbles: true,
            }),
          );
        }
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

      const sendControl = eventTarget.closest(
        (currentPlatform.sendButtonSelectors || []).join(","),
      );
      if (!sendControl) return;

      const input = getChatInput();
      if (!input || !isSendControlForInput(sendControl, input)) return;

      event.preventDefault();
      event.stopPropagation();
      isSubmitting = true;
      fuseAndSubmit(input);
      sendWithRetry(input, () => {
        isSubmitting = false;
      });
    }
  }

  function injectEngineStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const styleElement = document.createElement("style");
    styleElement.id = STYLE_ID;
    styleElement.textContent = `
      .ai-turbo-dehydrated {
        content-visibility: hidden !important;
        contain: layout paint style !important;
        contain-intrinsic-size: auto 120px var(--turbo-cached-h, 120px) !important;
      }
      .ai-turbo-dehydrated * {
        pointer-events: none !important;
      }

      .ai-turbo-code-bar {
        box-sizing: border-box !important;
        display: flex !important;
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        flex: 0 0 100% !important;
        grid-column: 1 / -1 !important;
        align-self: stretch !important;
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

      .ai-turbo-code-bar:hover {
        border-color: rgba(101, 210, 164, 0.3) !important;
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18) !important;
      }

      .ai-turbo-code-bar-meta {
        display: inline-flex !important;
        align-items: center !important;
        gap: 8px !important;
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

      .ai-turbo-code-toggle {
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

      .ai-turbo-code-toggle:hover {
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
          bottom 160ms cubic-bezier(0.16, 1, 0.3, 1),
          left 160ms cubic-bezier(0.16, 1, 0.3, 1),
          max-height 120ms ease,
          opacity 120ms ease,
          transform 120ms ease,
          visibility 120ms ease !important;
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
        .ai-turbo-code-toggle {
          transition: none !important;
        }
      }
    `;

    (document.head || document.documentElement).appendChild(styleElement);
  }

  function updateHudDashboard() {
    if (!hudStats) return;
    hudStats.total.textContent = String(state.totalTurns);
    hudStats.hidden.textContent = String(state.hiddenCount);
    hudStats.folded.textContent = String(state.foldedCodeCount);
    if (hudStats.pillTotal) hudStats.pillTotal.textContent = String(state.totalTurns);
    if (hudStats.pillHidden) hudStats.pillHidden.textContent = String(state.hiddenCount);
    if (hudStats.pillFolded) hudStats.pillFolded.textContent = String(state.foldedCodeCount);
    if (hudStats.pillVirtual) hudStats.pillVirtual.textContent = String(activeVirtualFiles.length);
    const pill = hudShadowRoot?.querySelector("#pill-trigger");
    if (pill) {
      pill.title = `消息 ${state.totalTurns} · 已脱水 ${state.hiddenCount} · 代码折叠 ${state.foldedCodeCount} · 虚拟文件 ${activeVirtualFiles.length}；点击打开面板，拖动可移动`;
    }
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
        pointer-events: auto;
        position: fixed;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 36px;
        max-width: min(390px, calc(100vw - 16px));
        padding: 5px 10px;
        border-radius: 999px;
        background: rgba(13, 17, 19, 0.97);
        border: 1px solid rgba(153, 166, 161, 0.26);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
        color: #dce5e1;
        font: 650 11px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        cursor: grab;
        user-select: none;
        touch-action: none;
        white-space: nowrap;
      }
      .pill-brand { display: inline-flex; align-items: center; gap: 4px; flex: 0 0 auto; }
      .pill-metrics {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding-left: 8px;
        border-left: 1px solid rgba(153, 166, 161, 0.22);
        color: #9baaa3;
        font: 600 10px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        min-width: 0;
      }
      .pill-metric { display: inline-flex; align-items: baseline; gap: 3px; }
      .pill-metric-label { color: #9aa9a1; font-size: 9px; }
      .pill-metric-value { color: #74ddb1; font-size: 11px; font-weight: 800; }
      @media (max-width: 440px) {
        .docked-pill { gap: 6px; padding: 5px 8px; }
        .pill-metrics { gap: 5px; padding-left: 6px; }
        .pill-metric-label { font-size: 8px; }
      }
      .docked-pill:active { cursor: grabbing; }
      .docked-pill:hover {
        color: #72d6ab;
        border-color: rgba(101, 210, 164, 0.45);
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

      .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
      .brand-title { font-size: 13px; font-weight: 700; color: #f8fafc; }
      .brand-subtitle { font-size: 10px; color: #64748b; margin-top: 1px; }
      .close-btn { background: transparent; border: 0; color: #64748b; cursor: pointer; padding: 4px; border-radius: 6px; }
      .close-btn:hover { color: #f8fafc; background: rgba(255, 255, 255, 0.08); }

      .status-strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 12px; }
      .status-item { padding: 9px; border: 1px solid rgba(153, 166, 161, 0.11); border-radius: 9px; background: #101517; text-align: center; }
      .status-label { font-size: 9px; color: #64748b; display: block; }
      .status-value { font-size: 14px; font-weight: 700; color: #e8efeb; margin-top: 2px; }

      .section { padding-top: 10px; border-top: 1px solid rgba(153, 166, 161, 0.1); }
      .section-title { font-size: 10px; font-weight: 700; color: #68746f; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.04em; }
      .control-row { display: flex; align-items: center; justify-content: space-between; min-height: 32px; margin-bottom: 6px; font-size: 11px; color: #c9d3ce; }

      .stepper { display: inline-flex; align-items: center; border: 1px solid rgba(153, 166, 161, 0.15); border-radius: 8px; background: #0f1315; }
      .stepper button { width: 26px; height: 24px; border: 0; background: transparent; color: #94a3b8; cursor: pointer; }
      .stepper button:hover { background: rgba(101, 210, 164, 0.07); color: #72d6ab; }
      .stepper span { min-width: 28px; text-align: center; font-size: 11px; font-family: ui-monospace, monospace; }

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

      @media (prefers-reduced-motion: reduce) {
        .modal-backdrop, .hud-panel { transition: none !important; }
      }
    `;
    hudShadowRoot.appendChild(styles);

    const pillTotalVal = el("span", { className: "pill-metric-value" }, ["0"]);
    const pillHiddenVal = el("span", { className: "pill-metric-value" }, ["0"]);
    const pillFoldedVal = el("span", { className: "pill-metric-value" }, ["0"]);
    const pillVirtualVal = el("span", { className: "pill-metric-value" }, ["0"]);

    const pill = el(
      "button",
      {
        className: "docked-pill",
        id: "pill-trigger",
        type: "button",
        title: "消息 0 · 已脱水 0 · 代码折叠 0 · 虚拟文件 0；点击打开面板，拖动可移动",
      },
      [
        el("span", { className: "pill-brand" }, ["⚡ ", el("span", {}, ["Turbo"])]),
        el("span", { className: "pill-metrics", "aria-label": "实时统计" }, [
          el("span", { className: "pill-metric", title: "消息总数" }, [
            el("span", { className: "pill-metric-label" }, ["消息"]),
            pillTotalVal,
          ]),
          el("span", { className: "pill-metric", title: "已脱水消息数" }, [
            el("span", { className: "pill-metric-label" }, ["脱水"]),
            pillHiddenVal,
          ]),
          el("span", { className: "pill-metric", title: "折叠代码块数" }, [
            el("span", { className: "pill-metric-label" }, ["折叠"]),
            pillFoldedVal,
          ]),
          el("span", { className: "pill-metric", title: "当前待发送虚拟文件数" }, [
            el("span", { className: "pill-metric-label" }, ["文件"]),
            pillVirtualVal,
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

    const statusStrip = el("div", { className: "status-strip" }, [
      el("div", { className: "status-item" }, [
        el("span", { className: "status-label" }, ["消息总数"]),
        totalVal,
      ]),
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

    const forkText = el("span", { id: "fork-text" }, ["复制原始上下文（回退）"]);
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

    const btnGenerateHandoff = el(
      "button",
      {
        className: "action-btn",
        type: "button",
        onclick: startHandoffGeneration,
      },
      ["发送 YAML 交接指令"],
    );
    const btnContinueHandoff = el(
      "button",
      {
        className: "action-btn",
        type: "button",
        onclick: prepareNewConversationFromYaml,
      },
      ["恢复到新对话"],
    );
    const btnCopyHandoffYaml = el(
      "button",
      {
        className: "action-btn",
        type: "button",
        onclick: copyLatestHandoffYaml,
      },
      ["仅复制 YAML 交接包"],
    );
    const btnCopyRestorePrompt = el(
      "button",
      {
        className: "action-btn",
        type: "button",
        onclick: copyLatestRestorePrompt,
      },
      ["仅复制新对话恢复指令"],
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
    ]);

    const handoffSection = el("div", { className: "section" }, [
      el("div", { className: "section-title" }, ["上下文交接"]),
      btnGenerateHandoff,
      btnContinueHandoff,
      btnCopyRestorePrompt,
      btnCopyHandoffYaml,
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
      pillTotal: pillTotalVal,
      pillHidden: pillHiddenVal,
      pillFolded: pillFoldedVal,
      pillVirtual: pillVirtualVal,
    };
    updateHudDashboard();

    initPillDrag(pill);
  }

  function initPillDrag(pill) {
    if (!pill) return;

    const pillWidth = pill.offsetWidth || 280;
    const pillHeight = pill.offsetHeight || 36;
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
      "你即将结束当前对话。请对迄今全部对话进行深度复盘，生成一份 YAML 格式的“上下文交接包”，用于在新会话中无缝恢复工作。",
      "",
      "要求：",
      "1. 只输出一个 YAML 代码块，不要添加解释、客套话或 Markdown 标题。",
      "2. YAML 必须语法正确；字符串包含冒号、引号、换行时使用双引号并转义，或使用 | 块。",
      "3. 信息必须自包含、准确，不编造。没有内容的字段用 [] 或 null。",
      "4. 若内容过长，优先压缩为关键点，但必须保证 YAML 完整闭合。",
      "5. 严格使用以下结构和字段，不得省略顶层字段：",
      "",
      CODE_FENCE + "yaml",
      "meta:",
      '  version: "1.0"',
      '  generated_at: ""',
      '  source_model: ""',
      '  language: "zh-CN"',
      "task:",
      '  objective: ""',
      "  success_criteria: []",
      '  current_status: ""',
      "decisions:",
      "  confirmed: []",
      "  rejected: []",
      "  assumptions: []",
      "progress:",
      "  done: []",
      "  in_progress: []",
      "  next_actions: []",
      "role:",
      '  persona: ""',
      '  tone: ""',
      "  response_format: []",
      "  boundaries: []",
      "context:",
      "  tools: []",
      "  tech_stack: []",
      "  files: []",
      "  data: []",
      "  constraints: []",
      "open_issues:",
      "  questions: []",
      "  risks: []",
      "  blockers: []",
      "key_entities:",
      "  people: []",
      "  projects: []",
      "  terms: []",
      "handoff_notes: []",
      CODE_FENCE,
    ].join("\n");
  }

  function buildHandoffRestorePrompt(yamlText) {
    return [
      "你将接收一份 YAML 格式的“上下文交接包”，用于恢复此前会话的工作状态。请按以下步骤操作：",
      "",
      "1. 解析并校验以下 YAML 的语法。",
      "2. 如果 YAML 不完整或语法错误，只指出问题，不要猜测，也不要开始工作。",
      "3. 如果 YAML 有效，用简短摘要确认：",
      "   - 任务目标：",
      "   - 当前状态：",
      "   - 已确认决策：",
      "   - 已排除方案：",
      "   - 下一步行动：",
      "   - 你的角色/风格：",
      "4. 确认后，直接进入该角色，从 next_actions 的第一项开始继续工作。不要重新询问 YAML 中已有的信息，也不要重新讨论已确认或已排除的决策。",
      "5. 若 YAML 中有 open_issues.questions，先按优先级列出，并询问我需要先处理哪一个；若没有，直接执行下一步。",
      "",
      "现在准备接收 YAML，这是你的YAML信息：",
      CODE_FENCE + "yaml",
      yamlText.trim(),
      CODE_FENCE,
    ].join("\n");
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

  function normalizeHandoffYaml(candidate) {
    if (!candidate) return null;
    const yaml = String(candidate)
      .trim()
      .replace(/^```(?:yaml|yml)\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    return isHandoffYamlShape(yaml) ? yaml : null;
  }

  function extractLatestHandoffYaml() {
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
      latestAssistantTurn.querySelectorAll("pre code, pre, code"),
    );
    for (const codeElement of codeElements) {
      if (isReasoningElement(codeElement)) continue;
      const languageHint = [
        codeElement.className || "",
        codeElement.getAttribute("data-language") || "",
        codeElement.parentElement?.className || "",
        codeElement.parentElement?.getAttribute("data-language") || "",
      ].join(" ");
      const codeText = codeElement.textContent || "";
      if (/ya?ml/i.test(languageHint) || codeText.trim().startsWith("meta:")) {
        const candidate = normalizeHandoffYaml(codeText);
        if (candidate) return candidate;
      }
    }

    const fullText = extractTurnText(latestAssistantTurn);
    const fencedCandidates = Array.from(
      fullText.matchAll(/\`\`\`(?:yaml|yml)\s*([\s\S]*?)\s*\`\`\`/gi),
    );
    for (const match of fencedCandidates) {
      const candidate = normalizeHandoffYaml(match[1]);
      if (candidate) return candidate;
    }

    return normalizeHandoffYaml(fullText);
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
          window.alert("无法写入剪贴板，请检查浏览器权限，或手动选择对应内容。");
        });
    } catch (_) {
      setHandoffStatus("剪贴板不可用，请检查浏览器权限。");
      window.alert("当前页面无法访问剪贴板。请检查浏览器权限，或手动选择对应内容。");
    }
  }

  function copyLatestHandoffYaml() {
    const yamlText = extractLatestHandoffYaml();
    if (!yamlText) {
      setHandoffStatus("尚未检测到最新助手回答中的完整 YAML。");
      window.alert("未找到符合交接包结构的 YAML。请等待助手回答完整结束后重试。");
      return;
    }
    copyHandoffText(
      yamlText,
      `已复制 YAML 交接包（${yamlText.length.toLocaleString()} 字符）。`,
    );
  }

  function copyLatestRestorePrompt() {
    const yamlText = extractLatestHandoffYaml();
    if (!yamlText) {
      setHandoffStatus("尚未检测到最新助手回答中的完整 YAML。");
      window.alert("未找到符合交接包结构的 YAML。请等待助手回答完整结束后重试。");
      return;
    }
    const restoreText = buildHandoffRestorePrompt(yamlText);
    copyHandoffText(
      restoreText,
      `已复制完整的新对话恢复指令（${restoreText.length.toLocaleString()} 字符）。`,
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
      const found = controls.find((control) =>
        control instanceof HTMLElement &&
        control.isConnected &&
        control.getAttribute("target") !== "_blank" &&
        (control.offsetParent !== null || control.getClientRects().length > 0),
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
    return Array.from(
      document.querySelectorAll("button, a, [role='button']"),
    ).find((control) => {
      if (
        !(control instanceof HTMLElement) ||
        !control.isConnected ||
        control.getAttribute("target") === "_blank" ||
        !(control.offsetParent !== null || control.getClientRects().length > 0)
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
    }) || null;
  }

  function resumePendingHandoffPrompt() {
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
                setHandoffStatus("新对话输入框已有草稿，恢复指令已复制到剪贴板。");
                window.alert("新对话输入框已有未发送内容。为避免覆盖草稿，已将恢复指令复制到剪贴板，请手动粘贴。");
              })
              .catch(() => {
                window.alert("无法覆盖新对话中的已有草稿。请保留草稿后手动粘贴恢复指令。");
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
            window.alert("未能可靠识别新对话输入框。完整恢复指令已复制，请手动打开新对话并粘贴。");
          })
          .catch(() => {
            window.alert("未能识别新对话输入框，也无法写入剪贴板。请回到原回答手动复制 YAML。");
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
          window.alert("未识别到当前网站的输入框。生成指令已复制，请手动粘贴并发送。");
        })
        .catch(() => window.alert("未能识别输入框，也无法写入剪贴板。"));
      return;
    }

    if (getComposerText(input).trim()) {
      navigator.clipboard
        .writeText(prompt)
        .then(() => {
          setHandoffStatus("当前输入框有草稿；生成指令已复制，未覆盖草稿。");
          window.alert("当前输入框已有未发送内容。为避免覆盖草稿，生成指令已复制，请先处理现有草稿，再手动粘贴发送。");
        })
        .catch(() => window.alert("当前输入框有草稿，且无法复制生成指令。"));
      return;
    }

    insertTextAtomic(input, prompt);
    isSubmitting = true;
    setHandoffStatus("已填入生成指令，正在发送……");
    sendWithRetry(input, (sent) => {
      isSubmitting = false;
      setHandoffStatus(
        sent
          ? "已发送 YAML 交接指令；等待回答完成后，点击“恢复到新对话”。"
          : "指令已填入但未确认发送，请检查输入框后手动发送。",
      );
    });
  }

  function prepareNewConversationFromYaml() {
    const yamlText = extractLatestHandoffYaml();
    if (!yamlText) {
      window.alert(
        "未在最近的助手回答中找到符合交接包结构的 YAML 代码块。请等待回答完整结束，或手动复制 YAML。",
      );
      setHandoffStatus("尚未检测到完整交接 YAML。");
      return;
    }

    const restoreText = buildHandoffRestorePrompt(yamlText);
    const newChatControl = findNewChatControl();
    if (!newChatControl) {
      navigator.clipboard
        .writeText(restoreText)
        .then(() => {
          setHandoffStatus("未识别新对话入口；完整恢复指令已复制。");
          window.alert("已提取 YAML 并复制完整恢复指令。此网站的新对话按钮未能可靠识别，请手动打开新对话并粘贴。");
        })
        .catch(() => {
          window.alert("已找到 YAML，但无法识别新对话入口或写入剪贴板。请手动复制 YAML 后恢复。");
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
        .then(() => window.alert("无法暂存跨页面恢复状态，已复制完整恢复指令，请手动打开新对话并粘贴。"))
        .catch(() => window.alert("无法暂存或复制恢复指令，请手动复制 YAML。"));
      return;
    }

    setHandoffStatus("已识别 YAML，正在打开新对话并准备填入恢复指令……");
    newChatControl.click();
    resumePendingHandoffPrompt();
  }

  function collectMutationTargets(records) {
    const turnSelector = getActiveTurnSelectors().join(",");
    let structuralChange = false;

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

      const possibleTurn =
        mutationTarget instanceof Element
          ? mutationTarget.closest(turnSelector)
          : mutationTarget.parentElement?.closest(turnSelector);

      if (
        possibleTurn instanceof Element &&
        !isGeminiThoughtElement(possibleTurn) &&
        !matchesReasoningElement(possibleTurn)
      ) {
        dirtyTurns.add(possibleTurn);
      }

      const codeSelectors = currentPlatform.codeSelectors || ["pre"];
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
          changedNode.matches(turnSelector) ||
          changedNode.querySelector(turnSelector)
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
      fullTurnSyncRequested = true;
      codeScanRequested = true;
    }
  }

  function runScheduledUpdate() {
    scheduleTimer = null;
    lastUpdateTime = performance.now();

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
      collectMutationTargets(records);
      requestUpdate();
    });

    observer.observe(observeRoot, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  function ensureHUDMounted() {
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
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      const result = originalPushState.apply(this, args);
      window.setTimeout(() => {
        invalidateActiveTurnSelectorGroup();
        fullTurnSyncRequested = true;
        codeScanRequested = true;
        requestUpdate();
      }, 0);
      return result;
    };

    history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args);
      window.setTimeout(() => {
        invalidateActiveTurnSelectorGroup();
        fullTurnSyncRequested = true;
        codeScanRequested = true;
        requestUpdate();
      }, 0);
      return result;
    };

    window.addEventListener("popstate", () => {
      invalidateActiveTurnSelectorGroup();
      fullTurnSyncRequested = true;
      codeScanRequested = true;
      requestUpdate();
    });
  }

  function bindGlobalListeners() {
    window.addEventListener(
      "keydown",
      (event) => {
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
  }

  function boot() {
    loadSavedConfig();
    injectEngineStyles();
    buildHUD();
    observeCodeLayout();
    observeDom();
    patchHistoryForSpaNavigation();
    bindGlobalListeners();

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

    fullTurnSyncRequested = true;
    codeScanRequested = true;
    requestUpdate();

    resumePendingHandoffPrompt();

    window.addEventListener("load", () => {
      fullTurnSyncRequested = true;
      codeScanRequested = true;
      ensureHUDMounted();
      requestUpdate();
    });

    [250, 800, 2000].forEach((delay) => {
      window.setTimeout(() => {
        ensureHUDMounted();
        requestUpdate();
      }, delay);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
