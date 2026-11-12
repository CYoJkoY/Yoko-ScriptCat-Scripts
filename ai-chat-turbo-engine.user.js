// ==UserScript==
// @name         AI Chat Turbo Engine
// @namespace    https://cyojkoy.github.io/Payment/
// @version      0.20.7
// @description  跨平台 AI 对话加速：常驻统计 + 完整消息提取 + YAML 交接 + 多平台适配 + 长代码折叠 + 自适应脱水 + 推理强度记忆 + 元宝原子工具记忆
// @author       Yoko
// @updateURL    https://cdn.jsdelivr.net/gh/CYoJkoY/Yoko-ScriptCat-Scripts@main/dist/ai-chat-turbo-engine.user.js
// @downloadURL  https://ghfast.top/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/main/dist/ai-chat-turbo-engine.user.js
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @match        https://gemini.google.com/*
// @match        https://grok.com/*
// @match        https://x.com/i/grok*
// @match        https://chat.deepseek.com/*
// @match        https://copilot.com/*
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
    "data-test-id",
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
  var STORAGE_KEY_DOCK = "ai_turbo_hud_dock";
  var STORAGE_KEY_CONFIG = "ai_turbo_engine_config";
  var VIRTUAL_FILE_THRESHOLD = 1500;
  var COMPOSER_VISUAL_GAP = 48;
  var COMPOSER_VISUAL_MAX_DEPTH = 5;
  var STREAMING_IDLE_DELAY = 1500;
  var THROTTLE_INTERVAL = 80;
  var TEXT_INDEX_INTERVAL = 450;
  var TEXT_INDEX_FRAME_BUDGET = 8;
  var CODE_SCAN_INTERVAL = 250;
  var TURN_DISCOVERY_RETRY_INTERVAL = 1e3;
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
      hosts: ["chatgpt.com", "chat.openai.com"],
      shellTurnRoots: true,
      codeCardChrome: true,
      sidebar: {
        selectors: ["aside.app-shell-left-panel"],
        triggers: [
          'button[aria-label="显示侧边栏"]',
          'button[aria-label*="Show sidebar" i]',
          'button[aria-label*="Expand sidebar" i]'
        ],
        // The expanded panel is mounted but its scroller keeps an inline
        // display: none !important until the site opens it itself.
        reveal: ["#app-shell-sidebar > div:nth-child(2) > div:first-child"],
        // The collapsed rail mounts the expanded list behind an inline
        // display:none and its renderer writes that rule back on the next
        // commit, so a reveal alone loses the list again. The peek presses the
        // site's own expand control: the site then owns the opened state and
        // the rows keep their data and listeners.
        nativeExpand: {
          expand: 'button[aria-label="显示侧边栏"], button[aria-label*="Show sidebar" i], button[aria-label*="Expand sidebar" i]',
          collapse: 'button[aria-label="隐藏侧边栏"], button[aria-label*="Hide sidebar" i], button[aria-label*="Close sidebar" i]'
        },
        // The rail host grows but the panel column keeps a collapsed width and
        // its own scroller clips the labels, so both are stretched with it.
        shells: ["#app-shell-sidebar", "#app-shell-sidebar > div:nth-child(2)"],
        peekWidth: 340,
        collapsedMaxWidth: 96
      },
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
      hosts: ["gemini.google.com"],
      nativeTurnRoots: true,
      quietMotion: true,
      sidebar: {
        selectors: ["bard-sidenav", ".bard-sidenav", "side-navigation"],
        triggers: [
          '[data-test-id="side-nav-sparkle-button"]',
          '[data-test-id="side-nav-menu-button"]',
          ".side-nav-menu-button",
          'button[aria-label*="打开边栏"]',
          'button[aria-label*="收起边栏"]',
          'button[aria-label*="侧边栏"]'
        ],
        // Gemini builds its history rows only after the native open control is
        // pressed; a wider collapsed rail shows the labels but no rows.
        nativeExpand: {
          expand: 'button[aria-label*="打开边栏"], button[aria-label*="Open sidebar" i]',
          collapse: 'button[aria-label*="关闭边栏"], button[aria-label*="Close sidebar" i]'
        },
        // The history container and its scrollport are pinned to the collapsed
        // width; the native open control alone leaves both at the old size.
        shells: [
          "bard-sidenav",
          ".sidenav-with-history-container",
          ".overflow-container"
        ],
        // Matches the width the site paints after its own open control runs.
        // A narrower cap leaves the pointer band short while the panel animates
        // in, so a cursor already over the visible column reads as outside it.
        peekWidth: 288,
        collapsedMaxWidth: 96
      },
      turnSelectorGroups: [
        ["user-query", "model-response"],
        ['[data-test-id="user-query"]', '[data-test-id="model-response"]'],
        [
          ".user-query",
          ".model-response",
          ".user-query-container",
          ".model-response-container"
        ]
      ],
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
      userTurnSelectors: [
        "user-query",
        '[data-test-id="user-query"]',
        ".user-query",
        ".user-query-container"
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
      hosts: ["grok.com"],
      hostPaths: { "x.com": "/i/grok" },
      sidebar: {
        selectors: ["#app-sidebar", 'aside[aria-label="应用导航"]'],
        triggers: ['button[aria-label="切换侧边栏"]'],
        // Grok keeps a zero-width slot until its own toggle runs, and only the
        // expanded state renders the history rows. The peek presses that toggle
        // and presses it again on leave. The rail overlays the chat column
        // instead of pushing it, so no negative margin is needed.
        nativeExpand: {
          expand: 'button[aria-label="切换侧边栏"]',
          collapse: 'button[aria-label="切换侧边栏"]'
        },
        peekWidth: 254,
        collapsedMaxWidth: 96
      },
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
    deepseek: {
      name: "DeepSeek",
      hosts: ["chat.deepseek.com"],
      sidebar: {
        selectors: [
          "div.b8812f16.a2f3d50e",
          // Fallback for a hash rotation: the rail is the first column of the
          // app row, next to the compact top bar that holds the native toggle.
          "#root > div > div > div > div > div:nth-child(2)"
        ],
        triggers: [
          ".ca6d4be1 .ds-button",
          '#root div[role="button"][aria-label*="边栏"]',
          '#root > div > div > div > div > div:first-child [role="button"]'
        ],
        // The compact top bar is drawn over the hidden rail; once the rail is
        // revealed the bar covers its logo and would swallow the first presses.
        suppress: [".ca6d4be1"],
        // The site keeps the whole rail at display: none, so the peek has to
        // bring it back and cancel the full native width with a fixed margin.
        revealRail: true,
        shift: -261,
        peekWidth: 261,
        collapsedMaxWidth: 96
      },
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
      hosts: ["copilot.com", "copilot.microsoft.com"],
      // The rail is a Fluent NavDrawer that the site widens itself. Its width
      // rule sits in the `application` cascade layer with !important, so the
      // stylesheet override joins the site's first layer instead. The rail
      // stays mounted and keeps its own listeners while peeking. Its history
      // list is only rendered once the drawer's own control opens it, so the
      // peek presses that control instead of leaving an empty wide column.
      sidebar: {
        selectors: [
          'div.fai-CopilotNavDrawer[role="navigation"]',
          'div.fui-NavDrawer[role="navigation"]'
        ],
        triggers: [
          '[data-testid="nav-toggle-button"]',
          'button[aria-label="展开边栏"]',
          'button[aria-label="折叠边栏"]',
          'button[aria-label*="Expand sidebar" i]',
          'button[aria-label*="Collapse sidebar" i]'
        ],
        nativeExpand: {
          expand: 'button[aria-label="展开边栏"], button[aria-label*="Expand sidebar" i]',
          collapse: 'button[aria-label="折叠边栏"], button[aria-label*="Collapse sidebar" i]'
        },
        peekWidth: 256,
        collapsedMaxWidth: 96
      },
      turnSelectors: [
        "div.fai-UserMessage",
        "div.fai-CopilotMessage"
      ],
      userTurnSelectors: [
        "div.fai-UserMessage"
      ],
      userContentSelectors: [
        'div.fai-UserMessage [data-testid="chatOutput"]',
        'div.fai-UserMessage [class*="user-message"]'
      ],
      codeSelectors: ["pre"],
      contentSelectors: [
        ".fai-CopilotMessage__content",
        ".markdown",
        ".prose",
        ".ac-textBlock"
      ],
      inputSelectors: [
        'span.fai-EditorInput__input[role="textbox"]',
        'span.fai-EditorInput__input[contenteditable="true"]',
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"]',
        "textarea[placeholder]",
        "textarea"
      ],
      sendButtonSelectors: [
        'button[aria-label="发送"]',
        "button.fai-SendButton",
        'button[aria-label*="Send" i]',
        'button[aria-label*="发送"]',
        'button[data-testid*="send"]',
        'button[type="submit"]'
      ]
    },
    perplexity: {
      name: "Perplexity",
      hosts: ["perplexity.ai", "www.perplexity.ai"],
      sidebar: {
        selectors: ["div.w-sideBarWidth"],
        triggers: [
          'button[aria-label="展开侧边栏"]',
          'button[aria-label="打开侧边栏"]',
          'button[aria-label*="Expand sidebar" i]',
          'button[aria-label*="Open sidebar" i]'
        ],
        // Perplexity mounts the session list only after its own control opens
        // the column; a widened shell keeps the compact markup and shows just
        // the navigation rows. Its control ignores scripted presses in the
        // builds that were measured, so the press is best effort: when the site
        // honours it the thread titles appear, and when it does not the rail
        // still widens without fighting the page.
        nativeExpand: {
          expand: 'button[aria-label="展开侧边栏"], button[aria-label*="Expand sidebar" i]',
          collapse: 'button[aria-label="收起侧边栏"], button[aria-label*="Collapse sidebar" i]'
        },
        // Measured again on the live site: the control stays closed after a
        // scripted click, so a peek that only pressed it left the rail at 56px
        // and did nothing. The CSS widening stays the visible path here, and the
        // press stays best effort for the builds that do honour it.
        nativeOnly: false,
        peekWidth: 240,
        collapsedMaxWidth: 88
      },
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
      hosts: ["poe.com"],
      sidebar: {
        selectors: ['aside[class*="SidebarLayout_sidebar"]'],
        triggers: [
          'button[aria-label="切换侧边栏折叠"]',
          'button[aria-label*="Toggle sidebar" i]'
        ],
        // Poe's row wrapper keeps the rail in a flex row that clips overflow,
        // so the growth is cancelled by a fixed margin instead of a
        // measurement.
        shift: -180,
        // The rail only renders its conversation list after the site's own
        // toggle runs; widening the shell alone leaves the navigation icons.
        nativeExpand: {
          expand: 'button[aria-label="切换侧边栏折叠"], button[aria-label*="Toggle sidebar" i]',
          collapse: 'button[aria-label="切换侧边栏折叠"], button[aria-label*="Toggle sidebar" i]'
        },
        peekWidth: 248,
        collapsedMaxWidth: 88
      },
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
      hosts: ["doubao.com", "www.doubao.com"],
      sidebar: {
        selectors: ["nav.panel-fvxXfj", "#chat-route-main nav"],
        triggers: [
          'button[aria-label="显示侧栏"]',
          'button[aria-label="收起侧栏"]',
          "[data-sidebar-hover-trigger]"
        ],
        // The rail stays in the DOM at full width, slid out of its zero-width
        // column, so the peek has to undo the transform, the transparency and
        // the clip on that column.
        revealRail: true,
        peekWidth: 280,
        collapsedMaxWidth: 96
      },
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
      hosts: ["yuanbao.tencent.com"],
      supportsToolMemory: true,
      sidebar: {
        selectors: [".yb-nav__content-wrapper"],
        triggers: [
          '[aria-label="打开侧栏"]',
          '.yb-nav [aria-label="收起侧栏"]',
          '.yb-nav [data-testid*="sidebar"]'
        ],
        // Yuanbao hides the whole wrapper with a transform and visibility on a
        // layer whose width is already laid out, so nothing has to be shifted.
        // The hidden wrapper only carries a skeleton: the history list is
        // mounted once the site's own trigger runs, so revealRail keeps showing
        // the layer while nativeExpand asks the site for the real rows.
        revealRail: true,
        nativeExpand: {
          expand: '[aria-label="打开侧栏"]',
          collapse: '[aria-label="收起侧栏"]'
        },
        peekWidth: 260,
        collapsedMaxWidth: 96
      },
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
      hosts: ["chat.qwen.ai"],
      sidebar: {
        selectors: ["#sidebar.sidebar"],
        triggers: [
          'button[aria-label="切换侧边栏"]',
          'button[aria-label="展开侧边栏"]',
          'button[aria-label*="sidebar" i]'
        ],
        // Qwen unmounts its history list when the rail collapses: the 60px
        // rail keeps only two icon buttons, so widening that box shows an empty
        // panel. The peek presses the site's own toggle, which renders the
        // rows, and presses the same toggle on leave.
        nativeExpand: {
          expand: 'button[aria-label="切换侧边栏"], button[aria-label="展开侧边栏"], button[aria-label*="Toggle sidebar" i]',
          collapse: 'button[aria-label="切换侧边栏"], button[aria-label="收起侧边栏"], button[aria-label*="Toggle sidebar" i]'
        },
        peekWidth: 240,
        collapsedMaxWidth: 96
      },
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
      hosts: ["qianwen.com", "www.qianwen.com"],
      sidebar: {
        selectors: ["aside#new-nav-tab-wrapper"],
        triggers: [
          'button[aria-label="收起侧边栏"]',
          '[data-icon-type="qwpcicon-sidebarRight"]',
          'button[aria-label*="侧边栏"]'
        ],
        // Qianwen collapses the aside to w-0 and keeps the panel absolutely
        // positioned beside it; the fixed margin keeps the chat column's
        // measurements untouched.
        shift: -240,
        peekWidth: 240,
        collapsedMaxWidth: 8
      },
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
      hosts: ["chatglm.cn"],
      sidebar: {
        selectors: ["aside.el-aside.aside-container"],
        triggers: [".aside-header .operation-btn"],
        // The header holds two controls with the same class: the search button
        // sits first and the collapse toggle second, so pressing the first
        // painted match opened a search box and left the rail collapsed. The
        // history rows stay at zero height until that toggle runs.
        nativeExpand: {
          expand: ".aside-header .btn-area .operation-btn:not(.search-btn)",
          collapse: ".aside-header .btn-area .operation-btn:not(.search-btn)"
        },
        // The class carries two controls and the site swaps their handlers as
        // the panel opens. Widening the rail is the path that was verified here
        // (40 -> 260 with 40 history rows), so the peek keeps writing geometry
        // and treats the press as best effort rather than depending on it.
        nativeOnly: false,
        peekWidth: 260,
        collapsedMaxWidth: 88
      },
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
      hosts: ["chat.z.ai"],
      sidebar: {
        selectors: ["#sidebar"],
        triggers: ['button[aria-label="切换侧边栏"]'],
        // Z.ai renders the row actions (rename, delete, pin) from its expanded
        // state only; a widened collapsed rail keeps the compact row markup and
        // loses those buttons. The peek therefore presses the site's own toggle
        // and lets the site lay the panel out, which is the same 238px column a
        // real press produces.
        nativeExpand: {
          expand: 'button[aria-label="切换侧边栏"]',
          collapse: 'button[aria-label="切换侧边栏"]'
        },
        peekWidth: 238,
        collapsedMaxWidth: 88
      },
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
  var PLATFORM_ENTRIES = Object.entries(PLATFORMS);
  function hostnameMatches(hostname, domains) {
    return domains.some(
      (domain) => hostname === domain || hostname.endsWith("." + domain)
    );
  }
  function findPlatformForLocation(hostname, pathname) {
    const host = hostname.toLowerCase();
    const path = pathname || "/";
    const declaresHost = (declared) => declared.some((candidate) => candidate.toLowerCase() === host);
    for (const [, platform] of PLATFORM_ENTRIES) {
      for (const [suffix, prefix] of Object.entries(platform.hostPaths ?? {})) {
        if (suffix.toLowerCase() === host && path.startsWith(prefix)) {
          return platform;
        }
      }
      if (declaresHost(platform.hosts)) {
        return platform;
      }
    }
    return null;
  }
  function buildPlatformMatchPatterns() {
    const patterns = [];
    const seen = /* @__PURE__ */ new Set();
    const add = (pattern) => {
      if (seen.has(pattern)) return;
      seen.add(pattern);
      patterns.push(pattern);
    };
    for (const [, platform] of PLATFORM_ENTRIES) {
      for (const host of platform.hosts) add(`https://${host}/*`);
      for (const [host, prefix] of Object.entries(platform.hostPaths ?? {})) {
        add(`https://${host}${prefix}*`);
      }
    }
    return patterns;
  }
  var PLATFORM_MATCH_PATTERNS = buildPlatformMatchPatterns();

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
  var TRANSCRIPT_IGNORED_SELECTORS = [
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
  var BLOCK_TEXT_LOCAL_NAMES = new Set(
    Array.from(BLOCK_TEXT_TAGS, (tag) => tag.toLowerCase())
  );
  var TRANSCRIPT_IGNORED_LOCAL_NAMES = /* @__PURE__ */ new Set([
    "button",
    "model-thoughts",
    "script",
    "style",
    "svg"
  ]);
  function normalizeText(sourceText) {
    return String(sourceText || "").replace(/\u00a0/g, " ").replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
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
    const chunks = [];
    const preservedCodeBlocks = [];
    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const value = node.nodeValue;
        if (value) chunks.push(value);
        return;
      }
      if (!(node instanceof Element)) {
        for (const child of node.childNodes) walk(child);
        return;
      }
      const tag = node.localName;
      if (node !== rootElement) {
        if (TRANSCRIPT_IGNORED_LOCAL_NAMES.has(tag) || node.hasAttribute("hidden")) {
          return;
        }
        try {
          if (node.matches(TRANSCRIPT_IGNORED_SELECTORS)) return;
        } catch (error) {
          reportRecoverableError("test ignored transcript selectors", error);
        }
      }
      if (tag === "br") {
        chunks.push("\n");
        return;
      }
      if (tag === "pre") {
        const codeText = node.textContent || "";
        const codeChild = node.querySelector("code");
        const codeClasses = [
          node.className || "",
          codeChild?.className || "",
          node.getAttribute("data-language") || "",
          codeChild?.getAttribute("data-language") || "",
          codeChild?.getAttribute("lang") || ""
        ].join(" ");
        const languageMatch = /language-([a-z0-9+#.-]+)/i.exec(codeClasses);
        const language = languageMatch ? (languageMatch[1] ?? "text").toLowerCase() : "text";
        const token = `TURBO_CODE_${preservedCodeBlocks.length}`;
        preservedCodeBlocks.push({ token, codeText, language });
        chunks.push(`
${CODE_FENCE}${language}
${token}
${CODE_FENCE}
`);
        return;
      }
      const isBlock = BLOCK_TEXT_LOCAL_NAMES.has(tag);
      if (isBlock) chunks.push("\n");
      for (const child of node.childNodes) walk(child);
      if (isBlock) chunks.push("\n");
    }
    walk(rootElement);
    const text = normalizeText(chunks.join(""));
    if (preservedCodeBlocks.length === 0) return text;
    return text.replace(/\uE000TURBO_CODE_(\d+)\uE001/g, (token, rawIndex) => {
      const block = preservedCodeBlocks[Number(rawIndex)];
      return block ? block.codeText : token;
    });
  }

  // scripts/ai-chat-turbo-engine/src/core/turns.ts
  function createTurnUtils(platform) {
    let activeTurnSelectorGroup = null;
    const renderedCheckCache = /* @__PURE__ */ new Map();
    const userTurnSelectorText = (platform.userTurnSelectors || []).join(", ");
    let cachedTurns = null;
    function invalidateTurnCache() {
      cachedTurns = null;
    }
    function clearRenderedCache() {
      renderedCheckCache.clear();
    }
    function isGeminiThoughtElement(element) {
      if (!platform.nativeTurnRoots || !(element instanceof Element))
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
      if (userTurnSelectorText && (turnElement.matches(userTurnSelectorText) || turnElement.querySelector(userTurnSelectorText))) {
        return true;
      }
      let ancestor = turnElement.parentElement;
      let ancestorDepth = 0;
      while (ancestor && ancestorDepth < 3) {
        if (userTurnSelectorText && ancestor.matches(userTurnSelectorText)) {
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
      if (userTurnSelectorText && turnElement.matches(userTurnSelectorText)) {
        return "user";
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
      return filterNestedInDocumentOrder(ordered);
    }
    function filterNestedInDocumentOrder(elements) {
      if (elements.length < 2) return [...elements];
      const candidateSet = new Set(elements);
      return elements.filter((element) => {
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
      if (!platform.shellTurnRoots) return null;
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
      const cached = cachedTurns;
      if (cached !== null && cached.every((turn) => turn.isConnected)) {
        return cached;
      }
      const selectors = getActiveTurnSelectors();
      if (selectors.length === 0) return [];
      const collected = Array.from(
        document.querySelectorAll(selectors.join(","))
      );
      const resolved = filterNestedInDocumentOrder(collected).filter(
        (element) => (!platform.shellTurnRoots || isRenderedChatGPTElement(element)) && !isGeminiThoughtElement(element) && !matchesReasoningElement(element)
      );
      cachedTurns = resolved;
      return resolved;
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
      const raw = elementToPlainText(turnElement);
      const vfIdx = raw.indexOf(VF_TOKEN_START);
      if (vfIdx === -1) return raw;
      let userPart = raw.slice(0, vfIdx).replace(/```[a-z]*\s*$/i, "").trim();
      if (userPart === "请查阅并分析以下文本内容：" || userPart === "请查阅以下文本：") {
        userPart = "";
      }
      const match = raw.match(VF_REGEX);
      const fileName = match ? ` [📎 ${match[1]}]` : " [📎 附件文件]";
      return normalizeText((userPart || "附件文本") + fileName);
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
      cachedTurns = null;
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
      invalidateTurnCache,
      clearRenderedCache
    };
  }

  // scripts/ai-chat-turbo-engine/src/core/turn-index.ts
  function createTurnTextIndex(options) {
    const records = /* @__PURE__ */ new Map();
    const pending = /* @__PURE__ */ new Set();
    let snapshot = [];
    function reconcile(turns) {
      const live = new Set(turns);
      for (const element of Array.from(records.keys())) {
        if (live.has(element)) continue;
        records.delete(element);
        pending.delete(element);
      }
      snapshot = turns.map((element, index) => {
        let record = records.get(element);
        if (!record) {
          record = { id: index, element, text: "" };
          records.set(element, record);
          pending.add(element);
        }
        record.id = index;
        return record;
      });
    }
    function markDirty(turn) {
      if (!records.has(turn)) return;
      pending.add(turn);
    }
    function hasTurn(turn) {
      return records.has(turn);
    }
    function getRecords() {
      return snapshot;
    }
    function flush(flushOptions = {}) {
      const budgetMs = flushOptions.budgetMs;
      const startedAt = budgetMs === void 0 ? 0 : performance.now();
      for (const element of pending) {
        if (budgetMs !== void 0 && performance.now() - startedAt >= budgetMs) {
          break;
        }
        pending.delete(element);
        const record = records.get(element);
        if (!record || !element.isConnected) continue;
        record.text = options.extract(element);
      }
      return pending.size;
    }
    function pendingCount() {
      return pending.size;
    }
    function clear() {
      records.clear();
      pending.clear();
      snapshot = [];
    }
    return {
      reconcile,
      markDirty,
      hasTurn,
      getRecords,
      flush,
      pendingCount,
      clear
    };
  }

  // scripts/ai-chat-turbo-engine/src/core/motion-quiet.ts
  var QUIET_WINDOW_MS = 450;
  var SIDEBAR_SELECTOR = "bard-sidenav, .bard-sidenav, side-navigation";
  var SIDEBAR_TOGGLE_SELECTOR = [
    '[data-test-id="side-nav-menu-button"]',
    'button[aria-label*="menu" i]',
    ".side-nav-menu-button",
    'button[aria-label*="主菜单"]'
  ].join(", ");
  function createMotionQuiet(options = {}) {
    const durationMs = options.durationMs ?? QUIET_WINDOW_MS;
    const endListeners = /* @__PURE__ */ new Set();
    let timer = null;
    let quiet = false;
    let boundDocument = null;
    if (options.onQuietEnd) endListeners.add(options.onQuietEnd);
    function clearTimer() {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
    }
    function finish() {
      timer = null;
      quiet = false;
      for (const listener of Array.from(endListeners)) listener();
    }
    function start(ms = durationMs) {
      quiet = true;
      clearTimer();
      timer = setTimeout(finish, ms);
    }
    function isQuiet() {
      return quiet;
    }
    function onQuietEnd(listener) {
      endListeners.add(listener);
      return () => {
        endListeners.delete(listener);
      };
    }
    function handleTransitionRun(event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest(SIDEBAR_SELECTOR)) return;
      start();
    }
    function handleClick(event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest(SIDEBAR_TOGGLE_SELECTOR)) return;
      start();
    }
    function bind(doc) {
      if (boundDocument === doc) return;
      teardown();
      boundDocument = doc;
      doc.addEventListener("transitionrun", handleTransitionRun, true);
      doc.addEventListener("click", handleClick, true);
    }
    function teardown() {
      if (boundDocument) {
        boundDocument.removeEventListener("transitionrun", handleTransitionRun, true);
        boundDocument.removeEventListener("click", handleClick, true);
        boundDocument = null;
      }
      clearTimer();
      quiet = false;
    }
    return { start, isQuiet, onQuietEnd, bind, teardown };
  }

  // scripts/ai-chat-turbo-engine/src/core/sidebar-peek.ts
  var SIDEBAR_PEEK_ATTRIBUTE = "data-ai-turbo-sidebar-peek";
  var SIDEBAR_PEEK_HOLD_ATTRIBUTE = "data-ai-turbo-sidebar-peek-hold";
  var SIDEBAR_PEEK_WIDTH_VAR = "--ai-turbo-sidebar-peek-width";
  var SIDEBAR_PEEK_SHIFT_VAR = "--ai-turbo-sidebar-peek-shift";
  var SIDEBAR_PEEK_SHOW_DELAY_MS = 70;
  var SIDEBAR_PEEK_HIDE_DELAY_MS = 160;
  var SIDEBAR_PEEK_LANE_PX = 28;
  var SIDEBAR_PEEK_PROXIMITY_PX = 10;
  var SIDEBAR_PEEK_POPOVER_HOLD_MS = 3e4;
  var SIDEBAR_PEEK_WIDTH_RATIO = 0.42;
  var SIDEBAR_PEEK_TRANSITION_HOLD_MS = 360;
  var SIDEBAR_PEEK_NAVIGATION_COLLAPSE_MS = 360;
  var SIDEBAR_PEEK_KEYBOARD_FOCUS_MS = 700;
  var SIDEBAR_PEEK_OPEN_RETRY_MS = 90;
  var SIDEBAR_PEEK_OPEN_ATTEMPTS = 8;
  var SIDEBAR_PEEK_NATIVE_OPEN_CHECK_MS = 320;
  var SIDEBAR_PEEK_NATIVE_OPEN_CHECKS = 2;
  var SIDEBAR_PEEK_NATIVE_OPEN_GRACE_MS = 400;
  var SIDEBAR_PEEK_RELIFT_LIMIT = 4;
  var SIDEBAR_PEEK_CLICK_RELEASE_MS = 140;
  var POPOVER_SELECTOR = [
    '[role="menu"]',
    '[role="listbox"]',
    '[role="dialog"]',
    ".ant-dropdown",
    ".ant-modal-root",
    "[data-radix-popper-content-wrapper]"
  ].join(", ");
  var POPOVER_RECHECK_MS = 400;
  var POINTER_PROBE_INTERVAL_MS = 40;
  var DEFAULT_PEEK_WIDTH = 248;
  var DEFAULT_COLLAPSED_MAX_WIDTH = 96;
  var COLLAPSED_CLASS_TOKENS = /* @__PURE__ */ new Set([
    "collapsed",
    "is-collapsed",
    "sidenav-collapsed",
    "rail-collapsed",
    "side-nav-collapsed"
  ]);
  var EXPANDED_CLASS_TOKENS = /* @__PURE__ */ new Set([
    "sidenav-open",
    "is-expanded",
    "is-open",
    "expanded"
  ]);
  var MOTION_ATTRIBUTES = ["class", "data-collapsed", "data-state", "aria-expanded"];
  function createSidebarPeek(options) {
    const definition = options.sidebar;
    const showDelayMs = options.showDelayMs ?? SIDEBAR_PEEK_SHOW_DELAY_MS;
    const hideDelayMs = options.hideDelayMs ?? SIDEBAR_PEEK_HIDE_DELAY_MS;
    const isUserKey = options.isUserKey ?? ((event) => event.isTrusted);
    const peekWidth = definition?.peekWidth ?? DEFAULT_PEEK_WIDTH;
    const collapsedMaxWidth = definition?.collapsedMaxWidth ?? DEFAULT_COLLAPSED_MAX_WIDTH;
    const sidebarSelectors = definition?.selectors ?? [];
    const triggerSelector = definition?.triggers?.join(", ") ?? "";
    const revealSelector = definition?.reveal?.join(", ") ?? "";
    const nativeOnly = definition?.nativeExpand !== void 0 && definition?.nativeOnly !== false;
    let boundDocument = null;
    let observer = null;
    let resolveDocument = null;
    let resolvedRail = null;
    let active = null;
    let widthSnapshot = null;
    let shiftSnapshot = null;
    let showTimer = null;
    let hideTimer = null;
    let pendingRail = null;
    let revealTargets = [];
    let inertTargets = [];
    let railDisplaySnapshot = null;
    let railOpacitySnapshot = null;
    let railTransformSnapshot = null;
    let railVisibilitySnapshot = null;
    let suppressTargets = [];
    let clipTargets = [];
    let shellTargets = [];
    let revealShells = [];
    let revealObserver = null;
    let reliftTimer = null;
    let reliftAttempts = 0;
    let labelTargets = [];
    let transitionTargets = [];
    let collapseTarget = null;
    let appliedHref = "";
    let expandedByPeek = false;
    let pointerX = Number.NaN;
    let pointerY = Number.NaN;
    let lastUserKeyMs = Number.NEGATIVE_INFINITY;
    let activePeekWidth = peekWidth;
    let activeSide = "left";
    let peekBand = null;
    let suppressShowUntilExit = false;
    let holdTimer = null;
    let holdRemainingMs = 0;
    let rescanNeeded = false;
    let lastProbeMs = Number.NEGATIVE_INFINITY;
    let probeTimer = null;
    let activeShift = 0;
    let reacquireTimer = null;
    let reacquireAttempts = 0;
    let openTimer = null;
    let openAttempts = 0;
    let nativeOpenTimer = null;
    let nativeOpenChecks = 0;
    let nativeOpenSeq = 0;
    let nativeOpenPressedAt = Number.NEGATIVE_INFINITY;
    let transitionHoldTimer = null;
    let transitionHoldNode = null;
    let nativeCollapseTimer = null;
    let clickReleaseTimer = null;
    const preexistingPopovers = /* @__PURE__ */ new Set();
    const hasRail = sidebarSelectors.length > 0;
    function isEnabled() {
      return hasRail && (options.enabled?.() ?? true);
    }
    function resolveRail() {
      const doc = boundDocument;
      if (!isEnabled() || doc === null) return null;
      if (resolvedRail !== null && resolvedRail.isConnected) return resolvedRail;
      if (resolveDocument !== doc) {
        resolveDocument = doc;
        resolvedRail = null;
      }
      resolvedRail = null;
      for (const selector of sidebarSelectors) {
        const found = doc.querySelector(selector);
        if (found instanceof HTMLElement) {
          resolvedRail = found;
          break;
        }
      }
      return resolvedRail;
    }
    function railFor(node) {
      const rail = resolveRail();
      if (rail === null) return null;
      if (rail === node || rail.contains(node)) return rail;
      if (triggerSelector !== "" && node.closest(triggerSelector) !== null) {
        return rail;
      }
      return null;
    }
    function hasExpandedToken(node) {
      for (const token of node.classList) {
        if (EXPANDED_CLASS_TOKENS.has(token)) return true;
      }
      return false;
    }
    function isCollapsed(node) {
      const painted = node.getBoundingClientRect();
      if (rectIsOnScreen(node, painted)) {
        return painted.width <= collapsedMaxWidth;
      }
      for (const token of node.classList) {
        if (COLLAPSED_CLASS_TOKENS.has(token)) return true;
        if (EXPANDED_CLASS_TOKENS.has(token)) return false;
      }
      if (painted.width === 0) return true;
      if (painted.right <= 1) return true;
      const viewport = viewportWidthOf(node);
      if (viewport > 0 && painted.left >= viewport - 1) return true;
      return painted.width <= collapsedMaxWidth;
    }
    function sideOf(node) {
      const viewport = viewportWidthOf(node);
      if (viewport <= 0) return "left";
      const rect = node.getBoundingClientRect();
      return rect.left + rect.width / 2 < viewport / 2 ? "left" : "right";
    }
    function viewportWidthOf(node) {
      const doc = node.ownerDocument;
      return doc.documentElement.clientWidth || doc.defaultView?.innerWidth || 0;
    }
    function viewportHeightOf(node) {
      const doc = node.ownerDocument;
      return doc.documentElement.clientHeight || doc.defaultView?.innerHeight || 0;
    }
    function rectIsOnScreen(node, rect) {
      if (rect.width <= 0 || rect.height <= 0) return false;
      if (rect.right <= 1) return false;
      const width = viewportWidthOf(node);
      if (width > 0 && rect.left >= width - 1) return false;
      const height = viewportHeightOf(node);
      return height <= 0 || rect.bottom > 1 && rect.top < height - 1;
    }
    function rememberBand(rect) {
      if (rect.width <= 0 || rect.height <= 0) return;
      peekBand = {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom
      };
    }
    function peekWidthFor(node) {
      const doc = node.ownerDocument;
      const viewport = doc.documentElement.clientWidth || doc.defaultView?.innerWidth || 0;
      if (viewport <= 0) return peekWidth;
      const cap = Math.round(viewport * SIDEBAR_PEEK_WIDTH_RATIO);
      return Math.max(1, Math.min(peekWidth, cap));
    }
    function nearRail(x, y) {
      const rail = resolveRail();
      if (rail === null) return null;
      const doc = rail.ownerDocument;
      const view = doc.defaultView;
      const viewportWidth = doc.documentElement.clientWidth || view?.innerWidth || 0;
      const viewportHeight = doc.documentElement.clientHeight || view?.innerHeight || 0;
      const rect = rail.getBoundingClientRect();
      const side = sideOf(rail);
      const top = (rect.height > 0 ? rect.top : 0) - SIDEBAR_PEEK_PROXIMITY_PX;
      const bottom = (rect.height > 0 ? rect.bottom : viewportHeight) + SIDEBAR_PEEK_PROXIMITY_PX;
      if (y < top || y > bottom) return null;
      const onScreen = rect.width > 0 && rect.right > 1 && rect.left < viewportWidth - 1;
      if (side === "left") {
        const end = Math.max(onScreen ? rect.right : 0, SIDEBAR_PEEK_LANE_PX);
        const start2 = onScreen ? Math.min(rect.left, 0) : 0;
        return x >= start2 - SIDEBAR_PEEK_PROXIMITY_PX && x <= end + SIDEBAR_PEEK_PROXIMITY_PX ? rail : null;
      }
      const start = Math.min(
        onScreen ? rect.left : viewportWidth,
        viewportWidth - SIDEBAR_PEEK_LANE_PX
      );
      return x >= start - SIDEBAR_PEEK_PROXIMITY_PX && x <= viewportWidth + SIDEBAR_PEEK_PROXIMITY_PX ? rail : null;
    }
    function rectHoldsPointer(rect, x, y) {
      if (rect.width <= 0 || rect.height <= 0) return false;
      return x >= rect.left - SIDEBAR_PEEK_PROXIMITY_PX && x <= rect.right + SIDEBAR_PEEK_PROXIMITY_PX && y >= rect.top - SIDEBAR_PEEK_PROXIMITY_PX && y <= rect.bottom + SIDEBAR_PEEK_PROXIMITY_PX;
    }
    function withinPeekBand(rail, x, y) {
      if (nativeOnly) {
        const current = resolveRail() ?? rail;
        const live = current.getBoundingClientRect();
        if (rectHoldsPointer(live, x, y)) {
          rememberBand(live);
          return true;
        }
        if (peekBand !== null && boxHoldsPointer(peekBand, x, y)) return true;
        const reach2 = Math.max(SIDEBAR_PEEK_LANE_PX, activePeekWidth, live.width);
        const boxTop = live.height > 0 ? live.top : peekBand?.top ?? 0;
        const boxBottom = live.height > 0 ? live.bottom : peekBand?.bottom ?? viewportHeightOf(current);
        if (y < boxTop - SIDEBAR_PEEK_PROXIMITY_PX || y > boxBottom + SIDEBAR_PEEK_PROXIMITY_PX) {
          return false;
        }
        if (activeSide === "right") {
          const viewport = viewportWidthOf(current);
          return x >= viewport - reach2 - SIDEBAR_PEEK_PROXIMITY_PX && x <= viewport + SIDEBAR_PEEK_PROXIMITY_PX;
        }
        return x >= -SIDEBAR_PEEK_PROXIMITY_PX && x <= reach2 + SIDEBAR_PEEK_PROXIMITY_PX;
      }
      const rect = rail.getBoundingClientRect();
      const side = sideOf(rail);
      const reach = Math.max(rect.width, activePeekWidth);
      const top = rect.height > 0 ? rect.top - SIDEBAR_PEEK_PROXIMITY_PX : -Infinity;
      const bottom = rect.height > 0 ? rect.bottom + SIDEBAR_PEEK_PROXIMITY_PX : Infinity;
      if (y >= top && y <= bottom) {
        const inside = side === "left" ? x >= rect.left - SIDEBAR_PEEK_PROXIMITY_PX && x <= rect.left + reach + SIDEBAR_PEEK_PROXIMITY_PX : x <= rect.right + SIDEBAR_PEEK_PROXIMITY_PX && x >= rect.right - reach - SIDEBAR_PEEK_PROXIMITY_PX;
        if (inside) return true;
      }
      for (const shell of shellTargets) {
        if (rectHoldsPointer(shell.node.getBoundingClientRect(), x, y)) return true;
      }
      return false;
    }
    function boxHoldsPointer(box, x, y) {
      return x >= box.left - SIDEBAR_PEEK_PROXIMITY_PX && x <= box.right + SIDEBAR_PEEK_PROXIMITY_PX && y >= box.top - SIDEBAR_PEEK_PROXIMITY_PX && y <= box.bottom + SIDEBAR_PEEK_PROXIMITY_PX;
    }
    function measureShift(node, collapsedWidth, width) {
      const view = node.ownerDocument.defaultView;
      if (view === null) return 0;
      if (!Number.isFinite(collapsedWidth) || collapsedWidth <= 0) return 0;
      const style = view.getComputedStyle(node);
      if (style.position !== "static" && style.position !== "relative") return 0;
      const parent = node.parentElement;
      if (parent === null) return 0;
      const parentStyle = view.getComputedStyle(parent);
      const isFlex = parentStyle.display === "flex" || parentStyle.display === "inline-flex";
      const isGrid = parentStyle.display === "grid" || parentStyle.display === "inline-grid";
      const isBlockFlow = parentStyle.display === "block" || parentStyle.display === "flow-root" || parentStyle.display === "inline-block";
      if (!isFlex && !isGrid && !isBlockFlow) return 0;
      if (isFlex && !parentStyle.flexDirection.startsWith("row")) return 0;
      if (parentStyle.overflow !== "visible") return 0;
      const shift = Math.round(collapsedWidth - width);
      return shift < 0 ? shift : 0;
    }
    function readSnapshot(node, property) {
      return {
        value: node.style.getPropertyValue(property),
        priority: node.style.getPropertyPriority(property)
      };
    }
    function restoreSnapshot(node, property, snapshot) {
      if (snapshot === null || snapshot.value === "") {
        node.style.removeProperty(property);
        return;
      }
      node.style.setProperty(property, snapshot.value, snapshot.priority);
    }
    function cancelShow() {
      if (showTimer !== null) {
        clearTimeout(showTimer);
        showTimer = null;
      }
      pendingRail = null;
    }
    function cancelHide() {
      if (hideTimer !== null) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    }
    function cancelHold() {
      if (holdTimer !== null) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      holdRemainingMs = 0;
    }
    function cancelOpen() {
      if (openTimer !== null) {
        clearTimeout(openTimer);
        openTimer = null;
      }
      openAttempts = 0;
    }
    function cancelNativeOpenCheck() {
      if (nativeOpenTimer !== null) {
        clearTimeout(nativeOpenTimer);
        nativeOpenTimer = null;
      }
      nativeOpenChecks = 0;
    }
    function releaseActive(reason = "hover") {
      cancelHide();
      cancelHold();
      cancelOpen();
      cancelNativeOpenCheck();
      cancelReacquire();
      cancelProbe();
      cancelClickRelease();
      rescanNeeded = false;
      preexistingPopovers.clear();
      const node = active;
      if (node === null) return;
      active = null;
      const held = !nativeOnly && (reason === "hover" || reason === "navigation");
      if (held) holdTransitions(node);
      const releasedWidth = node.getBoundingClientRect().width;
      let collapse = null;
      if (expandedByPeek) {
        expandedByPeek = false;
        const control = collapseFor(node);
        if (control !== null && reason !== "adopt" && (reason === "navigation" || stillOwned(node, control))) {
          collapse = control;
        }
      }
      collapseTarget = null;
      appliedHref = "";
      node.removeAttribute(SIDEBAR_PEEK_ATTRIBUTE);
      restoreSnapshot(node, SIDEBAR_PEEK_WIDTH_VAR, widthSnapshot);
      restoreSnapshot(node, SIDEBAR_PEEK_SHIFT_VAR, shiftSnapshot);
      if (railDisplaySnapshot !== null) {
        restoreSnapshot(node, "display", railDisplaySnapshot);
        railDisplaySnapshot = null;
      }
      if (railOpacitySnapshot !== null) {
        restoreSnapshot(node, "opacity", railOpacitySnapshot);
        railOpacitySnapshot = null;
      }
      if (railTransformSnapshot !== null) {
        restoreSnapshot(node, "transform", railTransformSnapshot);
        railTransformSnapshot = null;
      }
      if (railVisibilitySnapshot !== null) {
        restoreSnapshot(node, "visibility", railVisibilitySnapshot);
        railVisibilitySnapshot = null;
      }
      widthSnapshot = null;
      shiftSnapshot = null;
      restoreInert();
      restoreReveal();
      restoreSuppress();
      restoreClip();
      restoreShells();
      restoreLabels();
      if (held) {
        void node.getBoundingClientRect();
        releaseTransitions();
      }
      if (collapse !== null) {
        requestNativeCollapse(
          node,
          collapse,
          reason === "navigation" ? SIDEBAR_PEEK_NAVIGATION_COLLAPSE_MS : 0,
          releasedWidth
        );
      }
    }
    function holdTransitions(rail) {
      finishTransitionHold();
      const nodes = [rail];
      for (const target of shellTargets) nodes.push(target.node);
      for (const target of revealShells) nodes.push(target.node);
      for (const target of labelTargets) nodes.push(target.node);
      for (const node of nodes) {
        if (!node.isConnected) continue;
        if (transitionTargets.some((entry) => entry.node === node)) continue;
        transitionTargets.push({
          node,
          transition: readSnapshot(node, "transition")
        });
        node.style.setProperty("transition", "none", "important");
      }
      transitionHoldNode = rail;
      rail.setAttribute(SIDEBAR_PEEK_HOLD_ATTRIBUTE, "");
    }
    function releaseTransitions() {
      const targets = transitionTargets;
      transitionTargets = [];
      for (const target of targets) {
        if (!target.node.isConnected) continue;
        restoreSnapshot(target.node, "transition", target.transition);
      }
      const held = transitionHoldNode;
      transitionHoldNode = null;
      if (held === null) return;
      if (transitionHoldTimer !== null) clearTimeout(transitionHoldTimer);
      transitionHoldTimer = setTimeout(() => {
        transitionHoldTimer = null;
        transitionHoldNode = null;
        held.removeAttribute(SIDEBAR_PEEK_HOLD_ATTRIBUTE);
      }, SIDEBAR_PEEK_TRANSITION_HOLD_MS);
    }
    function finishTransitionHold() {
      if (transitionHoldTimer !== null) {
        clearTimeout(transitionHoldTimer);
        transitionHoldTimer = null;
      }
      const node = transitionHoldNode;
      transitionHoldNode = null;
      if (node !== null) node.removeAttribute(SIDEBAR_PEEK_HOLD_ATTRIBUTE);
    }
    function requestNativeCollapse(rail, control, delayMs, releasedWidth) {
      cancelNativeCollapse();
      nativeCollapseTimer = setTimeout(() => {
        nativeCollapseTimer = null;
        if (!rail.isConnected) return;
        if (control.ownerDocument !== rail.ownerDocument) return;
        if (active === rail) return;
        const now = rail.getBoundingClientRect().width;
        if (now <= collapsedMaxWidth) return;
        if (releasedWidth > collapsedMaxWidth + 8 && now <= releasedWidth - 8) {
          return;
        }
        const target = isPaintedControl(control) ? control : firstPaintedControl(rail, definition?.nativeExpand?.collapse ?? "") ?? (control.isConnected ? control : null);
        target?.click();
      }, delayMs);
    }
    function cancelNativeCollapse() {
      if (nativeCollapseTimer === null) return;
      clearTimeout(nativeCollapseTimer);
      nativeCollapseTimer = null;
    }
    function cancelClickRelease() {
      if (clickReleaseTimer === null) return;
      clearTimeout(clickReleaseTimer);
      clickReleaseTimer = null;
    }
    function collapseFor(rail) {
      const selector = definition?.nativeExpand?.collapse ?? "";
      if (selector === "") return null;
      const captured = collapseTarget;
      if (captured !== null && isPaintedControl(captured)) return captured;
      const scoped = firstPaintedControl(rail, selector);
      if (scoped !== null) return scoped;
      if (captured !== null && captured.isConnected) return captured;
      return firstPaintedControl(rail.ownerDocument, selector);
    }
    function isPaintedControl(node) {
      if (node === null) return false;
      if (!(node instanceof HTMLElement)) return false;
      if (!node.isConnected) return false;
      if (node.closest("[inert]") !== null) return false;
      if (node.hasAttribute("disabled")) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1;
    }
    function firstPaintedControl(root, selector) {
      for (const found of Array.from(root.querySelectorAll(selector))) {
        if (!(found instanceof HTMLElement)) continue;
        if (isPaintedControl(found)) return found;
      }
      return null;
    }
    function pressNativeExpand(rail) {
      const selector = definition?.nativeExpand?.expand ?? "";
      if (selector === "") return true;
      const expand = firstPaintedControl(rail, selector) ?? firstPaintedControl(rail.ownerDocument, selector);
      if (expand === null) return false;
      expandedByPeek = true;
      nativeOpenPressedAt = performance.now();
      nativeOpenSeq += 1;
      const seq = nativeOpenSeq;
      expand.click();
      collapseTarget = firstPaintedControl(
        rail.ownerDocument,
        definition?.nativeExpand?.collapse ?? ""
      ) ?? (isPaintedControl(expand) ? expand : null);
      scheduleReacquire();
      if (nativeOnly) scheduleNativeOpenCheck(rail, seq);
      return true;
    }
    function nativePanelOpen(node) {
      if (!node.isConnected) return false;
      if (node.getBoundingClientRect().width > collapsedMaxWidth + 4) return true;
      if (hasExpandedToken(node)) return true;
      const state = node.getAttribute("data-state");
      if (state === "expanded" || state === "open") return true;
      return node.getAttribute("aria-expanded") === "true";
    }
    function nativeOpenIsRecent() {
      return performance.now() - nativeOpenPressedAt <= SIDEBAR_PEEK_NATIVE_OPEN_GRACE_MS;
    }
    function scheduleNativeOpenCheck(rail, seq) {
      cancelNativeOpenCheck();
      const check = () => {
        nativeOpenTimer = null;
        if (seq !== nativeOpenSeq) return;
        if (active === null) return;
        const current = resolveRail();
        if (current !== null && current !== rail) {
          return;
        }
        if (nativePanelOpen(rail)) return;
        nativeOpenChecks += 1;
        if (nativeOpenChecks < SIDEBAR_PEEK_NATIVE_OPEN_CHECKS) {
          nativeOpenTimer = setTimeout(check, SIDEBAR_PEEK_NATIVE_OPEN_CHECK_MS);
          return;
        }
        expandedByPeek = false;
        collapseTarget = null;
        releaseActive("lifecycle");
      };
      nativeOpenTimer = setTimeout(check, SIDEBAR_PEEK_NATIVE_OPEN_CHECK_MS);
    }
    function retryNativeExpand(rail) {
      if (openTimer !== null) return;
      if (openAttempts >= SIDEBAR_PEEK_OPEN_ATTEMPTS) {
        releaseActive("lifecycle");
        return;
      }
      openAttempts += 1;
      openTimer = setTimeout(() => {
        openTimer = null;
        if (active !== rail) return;
        if (!rail.isConnected) {
          releaseActive("lifecycle");
          return;
        }
        if (!pressNativeExpand(rail)) retryNativeExpand(rail);
      }, SIDEBAR_PEEK_OPEN_RETRY_MS);
    }
    function stillOwned(rail, node) {
      if (!node.isConnected) return false;
      if (node.ownerDocument !== rail.ownerDocument) return false;
      const view = rail.ownerDocument.defaultView;
      if (appliedHref !== "" && view !== null && view.location.href !== appliedHref) {
        return false;
      }
      return true;
    }
    function liftInert(rail) {
      if (nativeOnly) return;
      for (const found of Array.from(rail.querySelectorAll("[inert]"))) {
        if (!(found instanceof HTMLElement)) continue;
        if (inertTargets.includes(found)) continue;
        inertTargets.push(found);
        found.removeAttribute("inert");
      }
    }
    function restoreInert() {
      if (inertTargets.length === 0) return;
      const targets = inertTargets;
      inertTargets = [];
      for (const node of targets) node.setAttribute("inert", "");
    }
    function liftReveal(rail) {
      if (nativeOnly) return;
      if (revealSelector === "") return;
      const targets = [];
      for (const found of Array.from(rail.querySelectorAll(revealSelector))) {
        if (!(found instanceof HTMLElement)) continue;
        targets.push({ node: found, display: readSnapshot(found, "display") });
        found.style.setProperty("display", "flex", "important");
      }
      revealTargets = targets;
    }
    function restoreReveal() {
      if (revealTargets.length === 0) return;
      const targets = revealTargets;
      revealTargets = [];
      for (const target of targets) {
        restoreSnapshot(target.node, "display", target.display);
      }
    }
    function suppressOverlap() {
      if (nativeOnly) return;
      const selectors = definition?.suppress;
      const doc = boundDocument;
      if (selectors === void 0 || selectors.length === 0 || doc === null) {
        return;
      }
      const selector = selectors.join(", ");
      for (const found of Array.from(doc.querySelectorAll(selector))) {
        if (!(found instanceof HTMLElement)) continue;
        if (suppressTargets.some((target) => target.node === found)) continue;
        suppressTargets.push({
          node: found,
          opacity: readSnapshot(found, "opacity"),
          pointerEvents: readSnapshot(found, "pointer-events")
        });
        found.style.setProperty("opacity", "0", "important");
        found.style.setProperty("pointer-events", "none", "important");
      }
    }
    function restoreSuppress() {
      if (suppressTargets.length === 0) return;
      const targets = suppressTargets;
      suppressTargets = [];
      for (const target of targets) {
        restoreSnapshot(target.node, "opacity", target.opacity);
        restoreSnapshot(target.node, "pointer-events", target.pointerEvents);
      }
    }
    function liftClip(rail) {
      if (nativeOnly) return;
      if (definition?.revealRail !== true) return;
      const doc = boundDocument;
      const view = rail.ownerDocument.defaultView;
      if (doc === null || view === null) return;
      for (let node = rail.parentElement; node !== null && node !== doc.body; node = node.parentElement) {
        const style = view.getComputedStyle(node);
        if (style.overflow === "visible") continue;
        if (node.getBoundingClientRect().width >= activePeekWidth) continue;
        clipTargets.push({
          node,
          overflowX: readSnapshot(node, "overflow-x"),
          overflowY: readSnapshot(node, "overflow-y")
        });
        node.style.setProperty("overflow-x", "visible", "important");
        node.style.setProperty("overflow-y", "visible", "important");
      }
    }
    function restoreClip() {
      if (clipTargets.length === 0) return;
      const targets = clipTargets;
      clipTargets = [];
      for (const target of targets) {
        restoreSnapshot(target.node, "overflow-x", target.overflowX);
        restoreSnapshot(target.node, "overflow-y", target.overflowY);
      }
    }
    function liftShells(rail, width) {
      if (nativeOnly) return;
      const selectors = definition?.shells;
      if (selectors === void 0 || selectors.length === 0) return;
      const seen = /* @__PURE__ */ new Set();
      for (const selector of selectors) {
        for (const found of Array.from(rail.querySelectorAll(selector))) {
          if (!(found instanceof HTMLElement)) continue;
          if (found === rail || seen.has(found)) continue;
          seen.add(found);
          stretchShell(found, shellWidthFor(rail, found, width));
        }
      }
    }
    function shellWidthFor(rail, node, width) {
      const view = rail.ownerDocument.defaultView;
      if (view === null) return width;
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 && rect.height <= 0) return width;
      const border = parseFloat(view.getComputedStyle(rail).borderRightWidth);
      const clipRight = rail.getBoundingClientRect().right - (Number.isFinite(border) ? border : 0);
      const available = Math.floor(clipRight - rect.left) - 1;
      if (available < 80 || available >= width) return width;
      return available;
    }
    function stretchShell(node, width) {
      if (!shellTargets.some((target) => target.node === node)) {
        shellTargets.push({
          node,
          width: readSnapshot(node, "width"),
          minWidth: readSnapshot(node, "min-width"),
          maxWidth: readSnapshot(node, "max-width"),
          boxSizing: readSnapshot(node, "box-sizing")
        });
      }
      const value = `${width}px`;
      node.style.setProperty("box-sizing", "border-box", "important");
      node.style.setProperty("width", value, "important");
      node.style.setProperty("min-width", value, "important");
      node.style.setProperty("max-width", value, "important");
    }
    function restoreShells() {
      stopRevealWatch();
      if (revealShells.length > 0) {
        const reveals = revealShells;
        revealShells = [];
        for (const target of reveals) {
          restoreSnapshot(target.node, "display", target.display);
        }
      }
      if (shellTargets.length === 0) return;
      const targets = shellTargets;
      shellTargets = [];
      for (const target of targets) {
        restoreSnapshot(target.node, "width", target.width);
        restoreSnapshot(target.node, "min-width", target.minWidth);
        restoreSnapshot(target.node, "max-width", target.maxWidth);
        restoreSnapshot(target.node, "box-sizing", target.boxSizing);
      }
    }
    function liftContentShells(rail, width) {
      if (nativeOnly) return;
      const view = rail.ownerDocument.defaultView;
      if (view === null) return;
      const rows = Array.from(
        rail.querySelectorAll('a[href], [role="link"], [role="treeitem"]')
      );
      if (rows.length < 2) return;
      if (width <= collapsedMaxWidth) return;
      const counts = /* @__PURE__ */ new Map();
      for (const row of rows) {
        for (let node = row.parentElement; node !== null && node !== rail; node = node.parentElement) {
          if (!(node instanceof HTMLElement)) continue;
          counts.set(node, (counts.get(node) ?? 0) + 1);
        }
      }
      const seen = /* @__PURE__ */ new Set();
      for (const target of shellTargets) seen.add(target.node);
      for (const target of revealShells) seen.add(target.node);
      let lifted = 0;
      for (const [node, count] of counts) {
        if (count < 2 || seen.has(node) || lifted >= 32) continue;
        let style = view.getComputedStyle(node);
        if (style.display === "none") {
          const inline = readSnapshot(node, "display");
          if (inline.value === "") continue;
          node.style.removeProperty("display");
          style = view.getComputedStyle(node);
          if (style.display === "none") {
            restoreSnapshot(node, "display", inline);
            continue;
          }
          revealShells.push({ node, display: inline });
        }
        if (style.display === "contents" || style.display === "inline") {
          continue;
        }
        const rect = node.getBoundingClientRect();
        if (rect.width <= 0 && rect.height <= 0) continue;
        const available = shellWidthFor(rail, node, width);
        if (rect.width >= available - 2) continue;
        seen.add(node);
        lifted += 1;
        stretchShell(node, available);
      }
      if (revealShells.length > 0) watchRevealShells();
    }
    function watchRevealShells() {
      if (revealObserver !== null) revealObserver.disconnect();
      revealObserver = new MutationObserver(handleRevealMutation);
      for (const target of revealShells) {
        revealObserver.observe(target.node, {
          attributes: true,
          attributeFilter: ["style"]
        });
      }
    }
    function stopRevealWatch() {
      if (revealObserver !== null) {
        revealObserver.disconnect();
        revealObserver = null;
      }
      if (reliftTimer !== null) {
        clearTimeout(reliftTimer);
        reliftTimer = null;
      }
    }
    function handleRevealMutation() {
      if (active === null || reliftTimer !== null) return;
      if (reliftAttempts >= SIDEBAR_PEEK_RELIFT_LIMIT) return;
      if (!revealShells.some((target) => inlineHidden(target.node))) return;
      reliftTimer = setTimeout(() => {
        reliftTimer = null;
        reliftRevealShells();
      }, 0);
    }
    function inlineHidden(node) {
      return node.style.getPropertyValue("display").trim() === "none";
    }
    function reliftRevealShells() {
      const rail = active;
      if (rail === null || revealShells.length === 0) return;
      const view = rail.ownerDocument.defaultView;
      if (view === null) return;
      reliftAttempts += 1;
      const kept = [];
      for (const target of revealShells) {
        if (!target.node.isConnected) continue;
        if (inlineHidden(target.node)) target.node.style.removeProperty("display");
        if (view.getComputedStyle(target.node).display === "none") {
          restoreSnapshot(target.node, "display", target.display);
          continue;
        }
        kept.push(target);
      }
      revealShells = kept;
      if (kept.length === 0) {
        stopRevealWatch();
        return;
      }
      liftContentShells(rail, activePeekWidth);
      liftLabels(rail);
    }
    function liftLabels(rail) {
      if (nativeOnly) return;
      const view = rail.ownerDocument.defaultView;
      if (view === null) return;
      for (const row of Array.from(
        rail.querySelectorAll('a[href], [role="link"], [role="treeitem"]')
      )) {
        const leaves = row.querySelectorAll("span, div, p");
        if (leaves.length > 12) continue;
        for (const leaf of Array.from(leaves)) {
          if (!(leaf instanceof HTMLElement)) continue;
          if (leaf.children.length > 0) continue;
          const text = (leaf.textContent ?? "").trim();
          if (text.length < 2) continue;
          if (labelTargets.some((target) => target.node === leaf)) continue;
          const style = view.getComputedStyle(leaf);
          const hidden = style.display === "none" || style.visibility === "hidden" || style.opacity === "0" || parseFloat(style.maxWidth) === 0;
          if (!hidden) continue;
          labelTargets.push({
            node: leaf,
            display: readSnapshot(leaf, "display"),
            visibility: readSnapshot(leaf, "visibility"),
            opacity: readSnapshot(leaf, "opacity"),
            maxWidth: readSnapshot(leaf, "max-width")
          });
          if (style.display === "none") {
            leaf.style.setProperty("display", "block", "important");
          }
          leaf.style.setProperty("visibility", "visible", "important");
          leaf.style.setProperty("opacity", "1", "important");
          if (parseFloat(style.maxWidth) === 0) {
            leaf.style.setProperty("max-width", "none", "important");
          }
        }
      }
    }
    function restoreLabels() {
      if (labelTargets.length === 0) return;
      const targets = labelTargets;
      labelTargets = [];
      for (const target of targets) {
        restoreSnapshot(target.node, "display", target.display);
        restoreSnapshot(target.node, "visibility", target.visibility);
        restoreSnapshot(target.node, "opacity", target.opacity);
        restoreSnapshot(target.node, "max-width", target.maxWidth);
      }
    }
    function applyPeek(node, adopting = false) {
      cancelShow();
      cancelHide();
      cancelOpen();
      cancelReacquire();
      cancelNativeCollapse();
      suppressShowUntilExit = false;
      if (active === node) {
        refreshPeek(node);
        return;
      }
      if (adopting && nativeOnly && expandedByPeek && !nativePanelOpen(node) && !nativeOpenIsRecent()) {
        expandedByPeek = false;
        collapseTarget = null;
        releaseActive("navigation");
        return;
      }
      const carriedExpansion = adopting && expandedByPeek;
      const carriedCollapse = adopting ? collapseTarget : null;
      releaseActive(adopting ? "adopt" : "hover");
      expandedByPeek = carriedExpansion;
      collapseTarget = carriedCollapse;
      const collapsedWidth = node.getBoundingClientRect().width;
      const width = peekWidthFor(node);
      activePeekWidth = width;
      activeSide = sideOf(node);
      const measured = measureShift(node, collapsedWidth, width);
      const configuredShift = definition?.shift ?? 0;
      const fallbackShift = width === peekWidth ? configuredShift : configuredShift + (peekWidth - width);
      const shift = measured < 0 ? measured : fallbackShift;
      activeShift = shift;
      widthSnapshot = readSnapshot(node, SIDEBAR_PEEK_WIDTH_VAR);
      shiftSnapshot = readSnapshot(node, SIDEBAR_PEEK_SHIFT_VAR);
      if (!nativeOnly && definition?.revealRail === true) {
        railDisplaySnapshot = readSnapshot(node, "display");
        railOpacitySnapshot = readSnapshot(node, "opacity");
        railTransformSnapshot = readSnapshot(node, "transform");
        railVisibilitySnapshot = readSnapshot(node, "visibility");
        const view2 = node.ownerDocument.defaultView;
        const display = view2 === null ? "none" : view2.getComputedStyle(node).display;
        if (display === "none") {
          node.style.setProperty("display", "flex", "important");
        }
        node.style.setProperty("opacity", "1", "important");
        node.style.setProperty("transform", "none", "important");
        node.style.setProperty("visibility", "visible", "important");
      }
      active = node;
      rescanNeeded = true;
      reliftAttempts = 0;
      finishTransitionHold();
      snapshotPopovers();
      if (!nativeOnly) {
        node.style.setProperty(SIDEBAR_PEEK_WIDTH_VAR, `${width}px`);
        node.style.setProperty(SIDEBAR_PEEK_SHIFT_VAR, `${shift}px`);
        node.setAttribute(SIDEBAR_PEEK_ATTRIBUTE, sideOf(node));
      }
      liftReveal(node);
      liftInert(node);
      liftClip(node);
      liftShells(node, width);
      liftContentShells(node, width);
      liftLabels(node);
      suppressOverlap();
      if (definition?.nativeExpand !== void 0) {
        if (carriedExpansion) {
          collapseTarget = firstPaintedControl(node, definition.nativeExpand.collapse) ?? firstPaintedControl(node.ownerDocument, definition.nativeExpand.collapse);
          if (nativeOnly) {
            nativeOpenSeq += 1;
            scheduleNativeOpenCheck(node, nativeOpenSeq);
          }
        } else if (!pressNativeExpand(node) && nativeOnly) {
          retryNativeExpand(node);
        }
        activePeekWidth = Math.max(
          activePeekWidth,
          Math.round(node.getBoundingClientRect().width)
        );
        rememberBand(node.getBoundingClientRect());
      }
      const view = node.ownerDocument.defaultView;
      appliedHref = view?.location.href ?? "";
    }
    function refreshPeek(node) {
      if (nativeOnly) {
        const view2 = node.ownerDocument.defaultView;
        if (view2 !== null && appliedHref === "") appliedHref = view2.location.href;
        const live = node.getBoundingClientRect();
        activePeekWidth = Math.max(
          activePeekWidth,
          Math.round(live.width)
        );
        rememberBand(live);
        return;
      }
      const view = node.ownerDocument.defaultView;
      if (view === null) return;
      if (node.getAttribute(SIDEBAR_PEEK_ATTRIBUTE) === null) {
        node.setAttribute(SIDEBAR_PEEK_ATTRIBUTE, sideOf(node));
      }
      node.style.setProperty(SIDEBAR_PEEK_WIDTH_VAR, `${activePeekWidth}px`);
      node.style.setProperty(SIDEBAR_PEEK_SHIFT_VAR, `${activeShift}px`);
      liftInert(node);
      liftShells(node, activePeekWidth);
      liftContentShells(node, activePeekWidth);
      liftLabels(node);
      if (appliedHref === "") appliedHref = view.location.href;
    }
    function cancelReacquire() {
      if (reacquireTimer !== null) {
        clearTimeout(reacquireTimer);
        reacquireTimer = null;
      }
      reacquireAttempts = 0;
    }
    function scheduleReacquire() {
      if (reacquireTimer !== null) return;
      reacquireTimer = setTimeout(() => {
        reacquireTimer = null;
        reacquireRail();
      }, 32);
    }
    function reacquireRail() {
      if (active === null) return;
      const rail = resolveRail();
      if (rail === null) {
        if (reacquireAttempts < 5) {
          reacquireAttempts += 1;
          scheduleReacquire();
          return;
        }
        releaseActive("navigation");
        return;
      }
      reacquireAttempts = 0;
      if (rail === active) {
        refreshPeek(rail);
        return;
      }
      applyPeek(rail, true);
    }
    function scheduleShow(rail) {
      cancelHide();
      if (active === rail) return;
      if (suppressShowUntilExit) return;
      if (pendingRail === rail && showTimer !== null) return;
      cancelShow();
      pendingRail = rail;
      showTimer = setTimeout(() => {
        showTimer = null;
        const target = pendingRail;
        pendingRail = null;
        if (target === null || !target.isConnected) return;
        if (!isCollapsed(target)) return;
        applyPeek(target);
      }, showDelayMs);
    }
    function scheduleHide(rail) {
      if (pendingRail === rail) cancelShow();
      if (active !== rail) return;
      cancelHide();
      hideTimer = setTimeout(() => {
        hideTimer = null;
        if (active !== rail) return;
        if (pointerStillOverRail(rail)) return;
        if (popoverUnderPointer() !== null) {
          holdForPopover(rail);
          return;
        }
        releaseActive();
      }, hideDelayMs);
    }
    function popoverUnderPointer() {
      const doc = boundDocument;
      if (doc === null) return null;
      if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) return null;
      if (typeof doc.elementFromPoint !== "function") return null;
      const hit = doc.elementFromPoint(pointerX, pointerY);
      return hit instanceof Element ? popoverFor(hit) : null;
    }
    function isVisiblePopover(node, view) {
      if (node.hidden) return false;
      if (node.getAttribute("aria-hidden") === "true") return false;
      if (node.closest("[inert]") !== null) return false;
      const style = view.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") {
        return false;
      }
      const rect = node.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1;
    }
    function popoverFor(target) {
      const view = boundDocument?.defaultView ?? null;
      if (view === null) return null;
      const found = target.closest(POPOVER_SELECTOR);
      if (!(found instanceof HTMLElement)) return null;
      if (!found.isConnected) return null;
      if (isPreexistingPopover(found)) return null;
      const rail = resolvedRail;
      if (rail !== null && (rail.contains(found) || found.contains(rail))) {
        return null;
      }
      return isVisiblePopover(found, view) ? found : null;
    }
    function snapshotPopovers() {
      preexistingPopovers.clear();
      const doc = boundDocument;
      const view = doc?.defaultView ?? null;
      if (doc === null || view === null) return;
      for (const found of Array.from(doc.querySelectorAll(POPOVER_SELECTOR))) {
        if (!(found instanceof HTMLElement)) continue;
        if (!isVisiblePopover(found, view)) continue;
        preexistingPopovers.add(found);
      }
    }
    function visiblePopovers() {
      const found = /* @__PURE__ */ new Set();
      const doc = boundDocument;
      const view = doc?.defaultView ?? null;
      if (doc === null || view === null) return found;
      for (const node of Array.from(doc.querySelectorAll(POPOVER_SELECTOR))) {
        if (!(node instanceof HTMLElement)) continue;
        if (!isVisiblePopover(node, view)) continue;
        found.add(node);
      }
      return found;
    }
    function isPreexistingPopover(node) {
      if (preexistingPopovers.size === 0) return false;
      for (const known of preexistingPopovers) {
        if (!known.isConnected) continue;
        if (known === node || known.contains(node)) return true;
      }
      return false;
    }
    function holdForPopover(rail) {
      if (holdTimer !== null) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      if (holdRemainingMs <= 0) holdRemainingMs = SIDEBAR_PEEK_POPOVER_HOLD_MS;
      const step = Math.min(POPOVER_RECHECK_MS, holdRemainingMs);
      holdRemainingMs -= step;
      holdTimer = setTimeout(() => {
        holdTimer = null;
        if (active !== rail) return;
        const popover = popoverUnderPointer();
        if (popover !== null && holdRemainingMs > 0) {
          holdForPopover(rail);
          return;
        }
        holdRemainingMs = 0;
        if (pointerStillOverRail(rail)) return;
        releaseActive();
      }, step);
    }
    function pointerStillOverRail(rail) {
      if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) return false;
      const doc = rail.ownerDocument;
      if (typeof doc.elementFromPoint !== "function") return false;
      const current = nativeOnly ? resolveRail() ?? rail : rail;
      const hit = doc.elementFromPoint(pointerX, pointerY);
      if (hit instanceof Element) {
        if (current.contains(hit) || rail.contains(hit)) return true;
        if (triggerSelector !== "" && hit.closest(triggerSelector) !== null) {
          return true;
        }
      }
      return withinPeekBand(current, pointerX, pointerY);
    }
    function isMousePointer(event) {
      const pointerType = event.pointerType;
      return pointerType === void 0 || pointerType === "" || pointerType === "mouse";
    }
    function handlePointerOver(event) {
      if (!isMousePointer(event)) return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const rail = railFor(target);
      if (rail === null) return;
      if (active === rail) {
        liftInert(rail);
        if (rescanNeeded) {
          rescanNeeded = false;
          suppressOverlap();
        }
      }
      scheduleShow(rail);
    }
    function handlePointerMove(event) {
      if (!isMousePointer(event)) return;
      const mouse = event;
      pointerX = mouse.clientX;
      pointerY = mouse.clientY;
      const target = event.target;
      if (target instanceof Element) {
        const overRail = railFor(target);
        if (overRail !== null) {
          if (active === overRail) cancelHide();
          else scheduleShow(overRail);
          return;
        }
      }
      if (!pointerNearEdge()) {
        suppressShowUntilExit = false;
        cancelProbe();
        if (active !== null) requestHide(active);
        else if (pendingRail !== null) cancelShow();
        return;
      }
      scheduleProbe();
    }
    function cancelProbe() {
      if (probeTimer !== null) {
        clearTimeout(probeTimer);
        probeTimer = null;
      }
    }
    function scheduleProbe() {
      const now = performance.now();
      const wait = lastProbeMs + POINTER_PROBE_INTERVAL_MS - now;
      if (wait > 0) {
        if (probeTimer === null) {
          probeTimer = setTimeout(() => {
            probeTimer = null;
            runProbe();
          }, wait);
        }
        return;
      }
      runProbe();
    }
    function runProbe() {
      lastProbeMs = performance.now();
      if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) return;
      if (!pointerNearEdge()) {
        suppressShowUntilExit = false;
        if (active !== null) requestHide(active);
        else if (pendingRail !== null) cancelShow();
        return;
      }
      const open = active;
      if (open !== null) {
        if (pointerStillOverRail(open)) {
          cancelHide();
          return;
        }
        if (popoverUnderPointer() !== null) {
          holdForPopover(open);
          return;
        }
        requestHide(open);
        return;
      }
      const rail = nearRail(pointerX, pointerY);
      if (rail === null) {
        if (pendingRail !== null) cancelShow();
        return;
      }
      scheduleShow(rail);
    }
    function handlePointerOut(event) {
      if (!isMousePointer(event)) return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const rail = railFor(target);
      if (rail === null) return;
      const related = event.relatedTarget;
      if (related instanceof Element && railFor(related) === rail) return;
      scheduleHide(rail);
    }
    function handlePointerLeave(event) {
      if (!isMousePointer(event)) return;
      pointerX = Number.NaN;
      pointerY = Number.NaN;
      suppressShowUntilExit = false;
      cancelProbe();
      cancelShow();
      if (active !== null) scheduleHide(active);
    }
    function requestHide(rail) {
      if (hideTimer !== null) return;
      scheduleHide(rail);
    }
    function handleClick(event) {
      const rail = active;
      if (rail === null) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!rail.contains(target)) return;
      if (keepsPeek(target)) return;
      const anchor = target.closest("a[href]");
      const view = rail.ownerDocument.defaultView;
      if (view !== null && anchor instanceof HTMLAnchorElement) {
        if (anchor.href === view.location.href) return;
      }
      const before = visiblePopovers();
      cancelClickRelease();
      clickReleaseTimer = setTimeout(() => {
        clickReleaseTimer = null;
        if (active !== rail) return;
        for (const popup of visiblePopovers()) {
          if (before.has(popup)) continue;
          holdForPopover(rail);
          return;
        }
        releaseActive("navigation");
        suppressShowUntilExit = true;
      }, SIDEBAR_PEEK_CLICK_RELEASE_MS);
    }
    function keepsPeek(target) {
      if (target.closest(
        'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="menu"], [role="dialog"], [aria-haspopup], [aria-expanded]'
      ) !== null) {
        return true;
      }
      const nativeExpand = definition?.nativeExpand;
      if (nativeExpand !== void 0) {
        for (const selector of [nativeExpand.expand, nativeExpand.collapse]) {
          if (target.closest(selector) !== null) return true;
        }
      }
      if (collapseTarget !== null && collapseTarget.contains(target)) {
        return true;
      }
      return false;
    }
    function handleNavigation() {
      cancelShow();
      if (active !== null) {
        releaseActive("navigation");
        suppressShowUntilExit = true;
      }
    }
    function handlePointerDown(event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (active !== null && popoverFor(target) !== null) {
        cancelHide();
        holdForPopover(active);
        return;
      }
      const rail = railFor(target);
      if (rail === null) {
        cancelShow();
        releaseActive();
        return;
      }
      if (active === rail && !rail.contains(target)) {
        if (triggerSelector !== "" && target.closest(triggerSelector) !== null) {
          expandedByPeek = false;
        }
        releaseActive();
      }
    }
    function handleFocusIn(event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (performance.now() - lastUserKeyMs > SIDEBAR_PEEK_KEYBOARD_FOCUS_MS) {
        return;
      }
      const rail = railFor(target);
      if (rail === null) return;
      if (active === rail) return;
      if (!isCollapsed(rail)) return;
      applyPeek(rail);
    }
    function handleKeyDown(event) {
      if (!isUserKey(event)) return;
      lastUserKeyMs = performance.now();
      const key = event.key;
      if (key === "Escape") {
        cancelShow();
        releaseActive();
        return;
      }
      if (active === null || key !== "Enter" && key !== " ") return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (triggerSelector === "" || target.closest(triggerSelector) === null) {
        return;
      }
      cancelShow();
      expandedByPeek = false;
      releaseActive();
    }
    function handleMutations() {
      const node = active;
      if (node === null) return;
      if (!node.isConnected) {
        if (expandedByPeek && pointerNearEdge()) {
          scheduleReacquire();
          return;
        }
        releaseActive("navigation");
        return;
      }
      const view = node.ownerDocument.defaultView;
      if (appliedHref !== "" && view !== null && view.location.href !== appliedHref) {
        releaseActive("navigation");
        return;
      }
      rescanNeeded = true;
      if (node.getAttribute(SIDEBAR_PEEK_ATTRIBUTE) === null) {
        refreshPeek(node);
      }
      if (expandedByPeek) return;
      if (hasExpandedToken(node)) releaseActive();
    }
    function pointerNearEdge() {
      if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) return false;
      const doc = boundDocument;
      if (doc === null) return false;
      const viewport = doc.documentElement.clientWidth || doc.defaultView?.innerWidth || 0;
      if (viewport <= 0) return false;
      const band = Math.max(
        120,
        collapsedMaxWidth + SIDEBAR_PEEK_PROXIMITY_PX,
        SIDEBAR_PEEK_LANE_PX + SIDEBAR_PEEK_PROXIMITY_PX
      );
      return pointerX <= band || pointerX >= viewport - band;
    }
    function bind(doc) {
      if (boundDocument === doc) return;
      teardown();
      if (!hasRail) return;
      boundDocument = doc;
      doc.addEventListener("pointerover", handlePointerOver);
      doc.addEventListener("pointermove", handlePointerMove);
      doc.addEventListener("pointerout", handlePointerOut);
      doc.addEventListener("pointerleave", handlePointerLeave);
      doc.addEventListener("pointerdown", handlePointerDown);
      doc.addEventListener("focusin", handleFocusIn);
      doc.addEventListener("keydown", handleKeyDown);
      doc.addEventListener("click", handleClick, true);
      const win = doc.defaultView;
      if (win !== null) {
        win.addEventListener("popstate", handleNavigation);
        win.addEventListener("hashchange", handleNavigation);
      }
      const root = doc.documentElement ?? doc.body;
      if (root !== null) {
        observer = new MutationObserver(handleMutations);
        observer.observe(root, {
          attributes: true,
          attributeFilter: MOTION_ATTRIBUTES,
          childList: true,
          subtree: true
        });
      }
    }
    function teardown() {
      cancelShow();
      cancelHide();
      cancelNativeCollapse();
      releaseActive("lifecycle");
      peekBand = null;
      suppressShowUntilExit = false;
      releaseTransitions();
      finishTransitionHold();
      stopRevealWatch();
      if (observer !== null) {
        observer.disconnect();
        observer = null;
      }
      if (boundDocument !== null) {
        boundDocument.removeEventListener("pointerover", handlePointerOver);
        boundDocument.removeEventListener("pointermove", handlePointerMove);
        boundDocument.removeEventListener("pointerout", handlePointerOut);
        boundDocument.removeEventListener("pointerleave", handlePointerLeave);
        boundDocument.removeEventListener("pointerdown", handlePointerDown);
        boundDocument.removeEventListener("focusin", handleFocusIn);
        boundDocument.removeEventListener("keydown", handleKeyDown);
        boundDocument.removeEventListener("click", handleClick, true);
        const win = boundDocument.defaultView;
        if (win !== null) {
          win.removeEventListener("popstate", handleNavigation);
          win.removeEventListener("hashchange", handleNavigation);
        }
        boundDocument = null;
      }
      resolveDocument = null;
      resolvedRail = null;
    }
    return {
      bind,
      teardown,
      syncEnabled: () => {
        if (isEnabled()) return;
        cancelShow();
        releaseActive();
      },
      isPeeking: () => active !== null
    };
  }

  // scripts/ai-chat-turbo-engine/src/core/mutation-classify.ts
  function classifyMutations(records, context) {
    const dirtyTurns = /* @__PURE__ */ new Set();
    const codeRoots = /* @__PURE__ */ new Set();
    let requestUpdate = false;
    let turnStructureChanged = false;
    const matchesTurn = (element) => {
      if (!context.turnSelector) return false;
      try {
        return element.matches(context.turnSelector);
      } catch {
        return false;
      }
    };
    for (const record of records) {
      const target = record.target;
      if (target instanceof Element && context.isIgnoredTarget(target)) {
        continue;
      }
      const indexedTurn = context.findTurnAncestor(target);
      if (record.type === "attributes") {
        const attributeName = record.attributeName ?? "";
        if (!TURN_MARKER_ATTRIBUTES.has(attributeName)) continue;
        if (indexedTurn) continue;
        turnStructureChanged = true;
        requestUpdate = true;
        continue;
      }
      if (indexedTurn) {
        dirtyTurns.add(indexedTurn);
        const codeRoot = target instanceof Element ? target : target.parentElement;
        if (codeRoot) codeRoots.add(codeRoot);
        continue;
      }
      if (record.type === "characterData") {
        requestUpdate = true;
        continue;
      }
      requestUpdate = true;
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (matchesTurn(node)) turnStructureChanged = true;
        codeRoots.add(node);
      }
      for (const node of record.removedNodes) {
        if (!(node instanceof Element)) continue;
        if (matchesTurn(node)) turnStructureChanged = true;
      }
    }
    return { requestUpdate, turnStructureChanged, dirtyTurns, codeRoots };
  }

  // scripts/ai-chat-turbo-engine/src/core/navigation.ts
  function navigationKey(location2) {
    return `${location2.pathname}${location2.search}`;
  }
  function createNavigationTracker(initialLocation) {
    let lastKey = navigationKey(initialLocation);
    return {
      observe(location2) {
        const nextKey = navigationKey(location2);
        if (nextKey === lastKey) return false;
        lastKey = nextKey;
        return true;
      }
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
  var DEFAULT_PERSISTED_CONFIG = {
    pruneEnabled: true,
    keepTurns: 8,
    messageLimit: DEFAULT_MESSAGE_LIMIT,
    collapseCode: true,
    virtualFileEnabled: true,
    sidebarPeekEnabled: true,
    rememberReasoning: true,
    rememberTools: true,
    hudTheme: "auto"
  };
  var configStore = createReportedStorage("localStorage", (failure) => {
    const scope = failure.operation === "write" || failure.operation === "remove" ? "save engine config" : "load saved engine config";
    reportRecoverableError(scope, failure.error);
  });
  function createEngineState() {
    return {
      ...DEFAULT_PERSISTED_CONFIG,
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
      if (typeof parsed.sidebarPeekEnabled === "boolean") {
        state.sidebarPeekEnabled = parsed.sidebarPeekEnabled;
      }
      if (typeof parsed.rememberReasoning === "boolean") {
        state.rememberReasoning = parsed.rememberReasoning;
      }
      if (typeof parsed.rememberTools === "boolean") {
        state.rememberTools = parsed.rememberTools;
      }
      if (parsed.hudTheme === "auto" || parsed.hudTheme === "light" || parsed.hudTheme === "dark") {
        state.hudTheme = parsed.hudTheme;
      }
    } catch (error) {
      reportRecoverableError("load saved engine config", error);
    }
  }
  function resetPersistedConfig(state) {
    Object.assign(state, DEFAULT_PERSISTED_CONFIG);
  }
  function saveCurrentConfig(state) {
    try {
      const config = {
        keepTurns: state.keepTurns,
        messageLimit: state.messageLimit,
        pruneEnabled: state.pruneEnabled,
        collapseCode: state.collapseCode,
        virtualFileEnabled: state.virtualFileEnabled,
        sidebarPeekEnabled: state.sidebarPeekEnabled,
        rememberReasoning: state.rememberReasoning,
        rememberTools: state.rememberTools,
        hudTheme: state.hudTheme
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
    const observedCodeBlocks = /* @__PURE__ */ new Set();
    const pendingCodeRoots = /* @__PURE__ */ new Set();
    const watchedCodeBlocks = /* @__PURE__ */ new Set();
    const viewportReadyCodeBlocks = /* @__PURE__ */ new Set();
    let codeScanRequested = true;
    let codeResizeObserver = null;
    let codeViewportObserver = null;
    let barsDirty = false;
    const codeSelectorText = (currentPlatform.codeSelectors || ["pre"]).join(
      ","
    );
    const userTurnSelectorText = (currentPlatform.userTurnSelectors || []).join(
      ","
    );
    const CODE_VIEWPORT_MARGIN = "800px 0px";
    function normalizeCodeElement(candidate) {
      if (!(candidate instanceof HTMLElement)) return null;
      const geminiBlock = candidate.closest("code-block");
      if (geminiBlock instanceof HTMLElement) return geminiBlock;
      if (candidate.matches("code")) {
        return candidate.parentElement?.matches("pre") ? candidate.parentElement : candidate;
      }
      return candidate;
    }
    function isInsideUserTurn(candidate) {
      if (!userTurnSelectorText) return false;
      try {
        return candidate.matches(userTurnSelectorText) || Boolean(candidate.closest(userTurnSelectorText));
      } catch (error) {
        reportRecoverableError("test code card boundary", error);
        return false;
      }
    }
    function toCodeElement(candidate) {
      if (candidate.closest(".ai-turbo-dehydrated")) return null;
      const belongsToUserTurn = isInsideUserTurn(candidate);
      if (candidate.classList.contains("ai-turbo-chat-folded-target") || belongsToUserTurn || candidate.closest(
        ".ai-turbo-chat-folded-target, .ai-turbo-chat-capsule, user-query, [data-message-author-role='user'], [data-content-search-unit-key$=':user'], [data-user-message-bubble='true'], [data-testid='collapsible-user-message-root'], .font-user-message"
      )) {
        return null;
      }
      const codeElement = normalizeCodeElement(candidate);
      if (!codeElement) return null;
      if (isGeminiThoughtElement(codeElement)) return null;
      return codeElement;
    }
    function collectCodeElements(rootNode) {
      const collected = [];
      const nearest = rootNode.closest(codeSelectorText);
      if (nearest) {
        const codeElement = toCodeElement(nearest);
        if (codeElement) collected.push(codeElement);
      }
      rootNode.querySelectorAll(codeSelectorText).forEach((candidate) => {
        const codeElement = toCodeElement(candidate);
        if (codeElement) collected.push(codeElement);
      });
      return filterOutNested(collected).filter(
        (element) => element instanceof HTMLElement
      );
    }
    function getCodeBlocks(rootNode = document) {
      const collected = [];
      rootNode.querySelectorAll(codeSelectorText).forEach((candidate) => {
        const codeElement = toCodeElement(candidate);
        if (codeElement) collected.push(codeElement);
      });
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
      const rectHeight = Math.round(codeElement.getBoundingClientRect().height);
      if (rectHeight > 0) return rectHeight;
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
    function observeCodeElement(codeElement) {
      if (!codeResizeObserver || observedCodeBlocks.has(codeElement)) return;
      observedCodeBlocks.add(codeElement);
      codeResizeObserver.observe(codeElement);
    }
    function unobserveCodeElement(codeElement) {
      if (!observedCodeBlocks.delete(codeElement)) return;
      codeResizeObserver?.unobserve(codeElement);
    }
    function supportsViewportObservation() {
      return "IntersectionObserver" in window;
    }
    function observeCodeViewport(codeElement) {
      if (!codeViewportObserver || watchedCodeBlocks.has(codeElement)) return;
      watchedCodeBlocks.add(codeElement);
      codeViewportObserver.observe(codeElement);
    }
    function unobserveCodeViewport(codeElement) {
      viewportReadyCodeBlocks.delete(codeElement);
      if (!watchedCodeBlocks.delete(codeElement)) return;
      codeViewportObserver?.unobserve(codeElement);
    }
    function ensureCodeViewportObserver() {
      if (codeViewportObserver || !supportsViewportObservation()) return;
      codeViewportObserver = new IntersectionObserver(
        (entries) => {
          let queued = false;
          for (const viewportEntry of entries) {
            if (!viewportEntry.isIntersecting) continue;
            const target = viewportEntry.target;
            if (!(target instanceof HTMLElement)) continue;
            unobserveCodeViewport(target);
            if (!target.isConnected) continue;
            dirtyCodeBlocks.add(normalizeCodeElement(target) ?? target);
            viewportReadyCodeBlocks.add(target);
            queued = true;
          }
          if (queued) requestUpdate();
        },
        { rootMargin: CODE_VIEWPORT_MARGIN, threshold: 0 }
      );
    }
    function releaseCodeViewportWatchers() {
      for (const watched of Array.from(watchedCodeBlocks)) {
        unobserveCodeViewport(watched);
      }
      codeViewportObserver?.disconnect();
      codeViewportObserver = null;
      watchedCodeBlocks.clear();
      viewportReadyCodeBlocks.clear();
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
      dirtyCodeBlocks.delete(codeElement);
      unobserveCodeElement(codeElement);
      unobserveCodeViewport(codeElement);
      barsDirty = true;
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
      if (!currentPlatform.codeCardChrome) return codeElement;
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
      if (currentPlatform.codeCardChrome && (!(anchor instanceof HTMLElement) || anchor === codeElement)) {
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
          className: currentPlatform.codeCardChrome ? "ai-turbo-code-bar ai-turbo-code-bar-chatgpt" : "ai-turbo-code-bar"
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
      observeCodeElement(codeElement);
      barsDirty = true;
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
    function expandPendingCodeRoots() {
      if (pendingCodeRoots.size === 0) return [];
      const expanded = [];
      for (const root of pendingCodeRoots) {
        if (!root.isConnected) continue;
        if (root.closest(".ai-turbo-dehydrated")) continue;
        expanded.push(...collectCodeElements(root));
      }
      pendingCodeRoots.clear();
      return expanded;
    }
    function syncCodeBlocks(forceScan, dirtyCandidates) {
      const queuedRootCandidates = expandPendingCodeRoots();
      if (!state.collapseCode) {
        for (const [codeElement] of codeState) {
          unmountCodeControls(codeElement);
        }
        state.foldedCodeCount = 0;
        codeScanRequested = false;
        dirtyCodeBlocks.clear();
        queuedRootCandidates.length = 0;
        releaseCodeViewportWatchers();
        sweepOrphanBars();
        return;
      }
      for (const [codeElement] of codeState) {
        if (!codeElement.isConnected) {
          unmountCodeControls(codeElement);
        }
      }
      const rawCandidates = [
        ...forceScan ? getCodeBlocks() : [],
        ...queuedRootCandidates,
        ...Array.from(dirtyCandidates).map(normalizeCodeElement).filter(
          (elem) => elem instanceof HTMLElement && elem.isConnected && !elem.closest(".ai-turbo-dehydrated")
        )
      ];
      const candidates = filterOutNested(rawCandidates).filter(
        (element) => element instanceof HTMLElement
      );
      for (const codeElement of candidates) {
        const entry = codeState.get(codeElement);
        if (entry) {
          if (currentPlatform.codeCardChrome && !positionCodeControl(entry, codeElement)) {
            continue;
          }
          updateCodeMeta(entry, codeElement);
        } else if (codeViewportObserver && !viewportReadyCodeBlocks.has(codeElement)) {
          observeCodeViewport(codeElement);
        } else {
          viewportReadyCodeBlocks.delete(codeElement);
          mountCodeControls(codeElement);
        }
      }
      if (barsDirty) {
        sweepOrphanBars();
        barsDirty = false;
      }
      state.foldedCodeCount = Array.from(codeState.values()).filter(
        (entry) => !entry.expanded
      ).length;
      codeScanRequested = false;
      dirtyCodeBlocks.clear();
    }
    function observeCodeLayout() {
      ensureCodeViewportObserver();
      if (!("ResizeObserver" in window)) return;
      codeResizeObserver?.disconnect();
      observedCodeBlocks.clear();
      codeResizeObserver = new ResizeObserver((entries) => {
        for (const resizeEntry of entries) {
          const normalized = normalizeCodeElement(resizeEntry.target);
          if (normalized instanceof HTMLElement) {
            dirtyCodeBlocks.add(normalized);
          }
        }
        if (entries.length) requestUpdate();
      });
      for (const codeElement of codeState.keys()) {
        observeCodeElement(codeElement);
      }
    }
    function flushCodeBlockScan() {
      syncCodeBlocks(codeScanRequested, dirtyCodeBlocks);
    }
    function unmountAllCodeControls() {
      for (const codeElement of Array.from(codeState.keys())) {
        unmountCodeControls(codeElement);
      }
      pendingCodeRoots.clear();
      dirtyCodeBlocks.clear();
      releaseCodeViewportWatchers();
    }
    function disconnectCodeLayoutObserver() {
      codeResizeObserver?.disconnect();
      codeResizeObserver = null;
      observedCodeBlocks.clear();
      pendingCodeRoots.clear();
      dirtyCodeBlocks.clear();
      releaseCodeViewportWatchers();
    }
    function requestCodeScan() {
      codeScanRequested = true;
    }
    function markCodeBlockDirty(codeElement) {
      if (codeElement.closest(".ai-turbo-dehydrated")) return;
      dirtyCodeBlocks.add(codeElement);
    }
    function requestCodeScanForTurn(turnElement) {
      if (!state.collapseCode) return;
      if (turnElement.closest(".ai-turbo-dehydrated")) return;
      let queued = false;
      for (const codeElement of collectCodeElements(turnElement)) {
        dirtyCodeBlocks.add(codeElement);
        queued = true;
      }
      if (queued) requestUpdate();
    }
    function suspendTurnCodeBlocks(turnElement) {
      for (const codeElement of Array.from(codeState.keys())) {
        if (codeElement === turnElement || turnElement.contains(codeElement)) {
          unmountCodeControls(codeElement);
        }
      }
      for (const codeElement of Array.from(dirtyCodeBlocks)) {
        if (codeElement === turnElement || turnElement.contains(codeElement)) {
          dirtyCodeBlocks.delete(codeElement);
        }
      }
      for (const watched of Array.from(watchedCodeBlocks)) {
        if (watched === turnElement || turnElement.contains(watched)) {
          unobserveCodeViewport(watched);
        }
      }
      for (const root of Array.from(pendingCodeRoots)) {
        if (root === turnElement || turnElement.contains(root)) {
          pendingCodeRoots.delete(root);
        }
      }
      state.foldedCodeCount = Array.from(codeState.values()).filter(
        (entry) => !entry.expanded
      ).length;
    }
    function markCodeSubtreesDirty(roots) {
      for (const root of roots) {
        if (!root.isConnected) continue;
        if (root.closest(".ai-turbo-dehydrated")) continue;
        pendingCodeRoots.add(root);
      }
    }
    function isCodeScanPending() {
      return codeScanRequested || dirtyCodeBlocks.size > 0 || pendingCodeRoots.size > 0;
    }
    return {
      normalizeCodeElement,
      flushCodeBlockScan,
      unmountAllCodeControls,
      observeCodeLayout,
      disconnectCodeLayoutObserver,
      requestCodeScan,
      requestCodeScanForTurn,
      suspendTurnCodeBlocks,
      markCodeSubtreesDirty,
      markCodeBlockDirty,
      isCodeScanPending
    };
  }

  // scripts/ai-chat-turbo-engine/src/core/auth.ts
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
    return findPlatformForLocation(
      window.location.hostname,
      window.location.pathname
    );
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
      deps.flushTextIndex?.();
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
      deps.flushTextIndex?.();
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

  // scripts/ai-chat-turbo-engine/src/ui/hud-styles.ts
  var HUD_STYLES = `
    * { box-sizing: border-box; }
    button, input, select { font: inherit; }

    :host {
      color-scheme: dark;
      --hud-panel-solid: #0c1012;
      --hud-text: #e2ebe6;
      --hud-title: #f8fafc;
      --hud-muted: #64748b;
      --hud-subtle: #475569;
      --hud-border: rgba(153, 166, 161, 0.19);
      --hud-border-soft: rgba(153, 166, 161, 0.11);
      --hud-field-bg: #0f1416;
      --hud-card-bg: #101517;
      --hud-hover: rgba(255, 255, 255, 0.08);
      --hud-accent: #72d6ab;
      --hud-scrim: rgba(0, 0, 0, 0.45);
      --hud-shadow: 0 26px 70px rgba(0, 0, 0, 0.48);
      --hud-track: rgba(148, 163, 184, 0.22);
      --hud-normal-tone: #5eead4;
      --hud-normal-strong: #34d399;
      --hud-normal-muted: #8ba39a;
      --hud-normal-surface: rgba(12, 18, 20, 0.97);
      --hud-normal-border: rgba(94, 234, 212, 0.3);
      --hud-normal-track: rgba(148, 163, 184, 0.22);
      --hud-normal-glow: rgba(16, 185, 129, 0.14);
      --hud-warning: #fbbf24;
      --hud-warning-strong: #f59e0b;
      --hud-warning-muted: #c7a766;
      --hud-warning-surface: rgba(38, 29, 10, 0.97);
      --hud-warning-border: rgba(251, 191, 36, 0.52);
      --hud-warning-track: rgba(251, 191, 36, 0.18);
      --hud-warning-glow: rgba(245, 158, 11, 0.2);
      --hud-warning-soft: rgba(251, 191, 36, 0.08);
      --hud-critical: #fb7185;
      --hud-critical-strong: #ef4444;
      --hud-critical-muted: #c99a9f;
      --hud-critical-surface: rgba(45, 13, 18, 0.97);
      --hud-critical-border: rgba(251, 113, 133, 0.58);
      --hud-critical-track: rgba(251, 113, 133, 0.2);
      --hud-critical-glow: rgba(239, 68, 68, 0.24);
      --hud-critical-soft: rgba(251, 113, 133, 0.08);
    }

    :host([data-hud-theme="light"]) {
      color-scheme: light;
      --hud-panel-solid: #ffffff;
      --hud-text: #1f2a26;
      --hud-title: #0f172a;
      --hud-muted: #64748b;
      --hud-subtle: #94a3b8;
      --hud-border: rgba(15, 23, 42, 0.12);
      --hud-border-soft: rgba(15, 23, 42, 0.08);
      --hud-field-bg: #ffffff;
      --hud-card-bg: #f8faf9;
      --hud-hover: rgba(15, 23, 42, 0.06);
      --hud-accent: #047857;
      --hud-scrim: rgba(15, 23, 42, 0.3);
      --hud-shadow: 0 24px 60px rgba(15, 23, 42, 0.18);
      --hud-track: rgba(100, 116, 139, 0.25);
      --hud-normal-tone: #047857;
      --hud-normal-strong: #059669;
      --hud-normal-muted: #4b7a6a;
      --hud-normal-surface: #ffffff;
      --hud-normal-border: rgba(4, 120, 87, 0.32);
      --hud-normal-track: rgba(4, 120, 87, 0.16);
      --hud-normal-glow: rgba(5, 150, 105, 0.16);
      --hud-warning: #b45309;
      --hud-warning-strong: #d97706;
      --hud-warning-muted: #92400e;
      --hud-warning-surface: #fffbeb;
      --hud-warning-border: rgba(217, 119, 6, 0.42);
      --hud-warning-track: rgba(217, 119, 6, 0.2);
      --hud-warning-glow: rgba(217, 119, 6, 0.18);
      --hud-warning-soft: rgba(217, 119, 6, 0.09);
      --hud-critical: #be123c;
      --hud-critical-strong: #e11d48;
      --hud-critical-muted: #9f1239;
      --hud-critical-surface: #fff1f2;
      --hud-critical-border: rgba(225, 29, 72, 0.42);
      --hud-critical-track: rgba(225, 29, 72, 0.18);
      --hud-critical-glow: rgba(225, 29, 72, 0.16);
      --hud-critical-soft: rgba(225, 29, 72, 0.08);
    }

    .docked-pill {
      --turbo-tone: var(--hud-normal-tone);
      --turbo-tone-strong: var(--hud-normal-strong);
      --turbo-muted: var(--hud-normal-muted);
      --turbo-surface: var(--hud-normal-surface);
      --turbo-border: var(--hud-normal-border);
      --turbo-track: var(--hud-normal-track);
      --turbo-glow: var(--hud-normal-glow);
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
    :host([data-hud-theme="light"]) .docked-pill {
      box-shadow: 0 8px 22px rgba(15, 23, 42, 0.14), 0 0 0 1px rgba(15, 23, 42, 0.03) inset;
    }
    .docked-pill[data-load-tone="warning"] {
      --turbo-tone: var(--hud-warning);
      --turbo-tone-strong: var(--hud-warning-strong);
      --turbo-muted: var(--hud-warning-muted);
      --turbo-surface: var(--hud-warning-surface);
      --turbo-border: var(--hud-warning-border);
      --turbo-track: var(--hud-warning-track);
      --turbo-glow: var(--hud-warning-glow);
    }
    .docked-pill[data-load-tone="critical"] {
      --turbo-tone: var(--hud-critical);
      --turbo-tone-strong: var(--hud-critical-strong);
      --turbo-muted: var(--hud-critical-muted);
      --turbo-surface: var(--hud-critical-surface);
      --turbo-border: var(--hud-critical-border);
      --turbo-track: var(--hud-critical-track);
      --turbo-glow: var(--hud-critical-glow);
    }
    .turbo-gauge { position: relative; display: grid; width: 40px; height: 40px; place-items: center; }
    .pill-load-ring { position: absolute; inset: 0; display: block; width: 40px; height: 40px; overflow: visible; }
    .pill-load-track { fill: none; stroke: var(--turbo-track); stroke-width: 2.4; }
    .pill-load-progress { fill: none; stroke: var(--turbo-tone-strong); stroke-width: 2.4; stroke-linecap: round; transition: stroke-dashoffset 220ms cubic-bezier(0.16, 1, 0.3, 1), stroke 180ms ease; }
    .turbo-readout { position: relative; display: flex; align-items: center; justify-content: center; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; line-height: 1; pointer-events: none; }
    .turbo-count { color: var(--turbo-tone); font-size: 12px; font-weight: 850; letter-spacing: -0.45px; font-variant-numeric: tabular-nums; }
    .docked-pill:active { cursor: grabbing; }
    .docked-pill.dragging { cursor: grabbing; }
    .docked-pill:hover {
      border-color: var(--turbo-tone);
      box-shadow: 0 10px 28px var(--turbo-glow), 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
      transform: translateY(-1px) scale(1.02);
    }

    /*
     * Docked mode folds the 48px pill into a slim tab on the chosen edge.
     * The ring and count stay visible, so the collapsed state still reports
     * load without opening the panel.
     */
    :host([data-hud-dock]) .docked-pill {
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      gap: 9px;
      width: 30px;
      height: 86px;
      padding-top: 9px;
      border-radius: 14px;
      transition: background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
    }
    :host([data-hud-dock="left"]) .docked-pill { border-top-left-radius: 0; border-bottom-left-radius: 0; }
    :host([data-hud-dock="right"]) .docked-pill { border-top-right-radius: 0; border-bottom-right-radius: 0; }
    :host([data-hud-dock]) .turbo-gauge { width: 26px; height: 26px; }
    :host([data-hud-dock]) .pill-load-ring { width: 26px; height: 26px; }
    :host([data-hud-dock]) .turbo-count { font-size: 10px; letter-spacing: -0.3px; }
    :host([data-hud-dock]) .docked-pill:hover { transform: none; }
    .dock-mark {
      display: none;
      font: 700 8px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0.12em;
      color: var(--turbo-muted);
    }
    :host([data-hud-dock]) .dock-mark { display: block; }

    .modal-backdrop {
      position: absolute;
      inset: 0;
      background: var(--hud-scrim);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 12px;
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
      width: min(420px, calc(100vw - 24px));
      max-height: calc(100vh - 24px);
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
      scrollbar-color: var(--hud-track) transparent;
      padding: 18px;
      border: 1px solid var(--hud-border);
      border-radius: 14px;
      background: var(--hud-panel-solid);
      box-shadow: var(--hud-shadow);
      color: var(--hud-text);
      transform: scale(0.96);
      transition: transform 140ms cubic-bezier(0.16, 1, 0.3, 1);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      outline: none;
    }
    @supports (height: 100dvh) {
      .hud-panel { max-height: min(720px, calc(100dvh - 24px)); }
    }
    .modal-backdrop.open .hud-panel { transform: scale(1); }
    /*
     * A docked panel slides out of the same edge as the collapsed tab. It
     * spans the viewport height, so long settings lists scroll inside the
     * sheet while the page keeps its own scroll position.
     */
    .modal-backdrop[data-dock] {
      padding: 0;
      align-items: stretch;
    }
    .modal-backdrop[data-dock="left"] { justify-content: flex-start; }
    .modal-backdrop[data-dock="right"] { justify-content: flex-end; }
    .modal-backdrop[data-dock] .hud-panel {
      width: min(392px, 100vw);
      height: 100%;
      max-height: none;
      padding: 18px 18px calc(18px + env(safe-area-inset-bottom));
      border-width: 0 1px 0 0;
      border-radius: 0;
      transform: translateX(-102%);
      transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
    }
    .modal-backdrop[data-dock="right"] .hud-panel {
      border-width: 0 0 0 1px;
      transform: translateX(102%);
    }
    .modal-backdrop[data-dock].open .hud-panel { transform: none; }
    /* The panel stays opaque: an 18px backdrop blur repaints the whole page
       behind it on every frame of the open and close animation. */

    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .brand-title { font-size: 13px; font-weight: 700; color: var(--hud-title); }
    .brand-subtitle { font-size: 10px; color: var(--hud-muted); margin-top: 1px; }
    .close-btn { background: transparent; border: 0; color: var(--hud-muted); cursor: pointer; padding: 4px 6px; border-radius: 6px; }
    .close-btn:hover { color: var(--hud-title); background: var(--hud-hover); }
    .header-actions { display: inline-flex; align-items: center; gap: 2px; }
    .dock-btn { background: transparent; border: 0; color: var(--hud-muted); cursor: pointer; padding: 4px 7px; border-radius: 6px; font: 600 10px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .dock-btn:hover { color: var(--hud-title); background: var(--hud-hover); }
    .dock-btn[aria-pressed="true"] { color: var(--hud-accent); background: var(--hud-hover); }

    .status-strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin-bottom: 12px; }
    .status-item { min-width: 0; padding: 9px 6px; border: 1px solid var(--hud-border-soft); border-radius: 9px; background: var(--hud-card-bg); text-align: center; }
    .status-label { font-size: 9px; color: var(--hud-muted); display: block; }
    .status-value { font-size: 14px; font-weight: 700; color: var(--hud-title); margin-top: 2px; font-variant-numeric: tabular-nums; }
    .status-item[data-load-tone="warning"] { border-color: var(--hud-warning-border); background: var(--hud-warning-soft); }
    .status-item[data-load-tone="warning"] .status-value { color: var(--hud-warning); }
    .status-item[data-load-tone="critical"] { border-color: var(--hud-critical-border); background: var(--hud-critical-soft); }
    .status-item[data-load-tone="critical"] .status-value { color: var(--hud-critical); }

    .load-warning { margin-bottom: 12px; padding: 9px 10px; border: 1px solid var(--hud-warning-border); border-radius: 9px; background: var(--hud-warning-soft); color: var(--hud-text); font-size: 10.5px; line-height: 1.55; }
    .load-warning[hidden] { display: none !important; }
    .load-warning[data-tone="critical"] { border-color: var(--hud-critical-border); background: var(--hud-critical-soft); }
    .load-warning-text { margin: 0; }
    .load-warning[data-tone="critical"] .load-warning-text { color: var(--hud-critical); }
    .load-warning-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 7px; }
    .load-warning-actions button { height: 24px; padding: 0 8px; border: 1px solid var(--hud-warning-border); border-radius: 6px; background: transparent; color: var(--hud-warning); font-size: 10px; font-weight: 650; cursor: pointer; }
    .load-warning[data-tone="critical"] .load-warning-actions button { border-color: var(--hud-critical-border); color: var(--hud-critical); }
    .load-warning-actions button:hover { background: var(--hud-hover); }

    .section { padding-top: 10px; border-top: 1px solid var(--hud-border-soft); }
    .section-title { font-size: 10px; font-weight: 700; color: var(--hud-muted); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.04em; }
    .control-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 32px; margin-bottom: 6px; font-size: 11px; color: var(--hud-text); }
    .control-label { cursor: pointer; }

    .stepper { display: inline-flex; align-items: center; border: 1px solid var(--hud-border); border-radius: 8px; background: var(--hud-field-bg); }
    .stepper button { width: 28px; height: 26px; border: 0; background: transparent; color: var(--hud-muted); cursor: pointer; border-radius: 7px; }
    .stepper button:hover { background: var(--hud-hover); color: var(--hud-accent); }
    .stepper span { min-width: 30px; text-align: center; font-size: 11px; font-family: ui-monospace, monospace; color: var(--hud-text); }
    .limit-control { display: inline-flex; align-items: center; gap: 5px; }
    .limit-input { width: 58px; height: 26px; padding: 0 6px; border: 1px solid var(--hud-border); border-radius: 7px; background: var(--hud-field-bg); color: var(--hud-text); font: 650 11px/1 ui-monospace, monospace; text-align: right; font-variant-numeric: tabular-nums; }
    .limit-input:hover { border-color: var(--hud-accent); }
    .limit-unit { color: var(--hud-muted); font-size: 10px; }
    .theme-select { height: 26px; padding: 0 6px; border: 1px solid var(--hud-border); border-radius: 7px; background: var(--hud-field-bg); color: var(--hud-text); font-size: 11px; }

    .switch { position: relative; display: inline-flex; width: 34px; height: 20px; flex: 0 0 auto; }
    .switch input { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; }
    .slider { position: absolute; inset: 0; border-radius: 999px; background: var(--hud-track); cursor: pointer; transition: 150ms; }
    .slider::before { content: ""; position: absolute; width: 14px; height: 14px; left: 3px; top: 3px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25); transition: 150ms; }
    .switch input:checked + .slider { background: var(--hud-normal-strong); }
    .switch input:checked + .slider::before { transform: translateX(14px); }
    .switch input:focus-visible + .slider { outline: 2px solid var(--hud-normal-tone); outline-offset: 2px; }

    .action-btn { width: 100%; height: 34px; margin-top: 10px; border: 1px solid var(--hud-border); border-radius: 8px; background: var(--hud-card-bg); color: var(--hud-text); font-size: 11px; font-weight: 600; cursor: pointer; transition: 140ms ease; }
    .action-btn:hover { background: var(--hud-hover); border-color: var(--hud-normal-border); color: var(--hud-accent); }
    .action-btn.copied { background: var(--hud-warning-soft); color: var(--hud-accent); border-color: var(--hud-normal-border); }
    .reset-btn { margin-top: 12px; }
    .reset-btn:hover { border-color: var(--hud-critical-border); color: var(--hud-critical); }
    .handoff-status { margin-top: 8px; color: var(--hud-muted); font-size: 10px; line-height: 1.5; overflow-wrap: anywhere; }
    .reasoning-status { margin: 2px 0 6px; color: var(--hud-muted); font-size: 10px; line-height: 1.5; overflow-wrap: anywhere; }
    .reasoning-status:empty { display: none; }
    .reasoning-status button { margin-left: 6px; padding: 0 4px; border: 1px solid var(--hud-border); border-radius: 4px; background: transparent; color: var(--hud-accent); font-size: 10px; line-height: 1.6; cursor: pointer; }
    .reasoning-status button:hover { border-color: var(--hud-normal-border); }

    .search-wrap { position: relative; margin-top: 8px; }
    .search-input { width: 100%; height: 34px; padding: 0 10px; border: 1px solid var(--hud-border); border-radius: 8px; background: var(--hud-field-bg); color: var(--hud-text); font-size: 11px; outline: none; }
    .search-input::placeholder { color: var(--hud-muted); }
    .search-input:focus { border-color: var(--hud-normal-border); }
    .results { max-height: 132px; overflow-y: auto; margin-top: 6px; display: grid; gap: 4px; }
    .result-item, .result-empty, .result-pending { padding: 6px 8px; font-size: 10px; border-radius: 7px; background: var(--hud-card-bg); color: var(--hud-text); border: none; text-align: left; }
    .result-item { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; cursor: pointer; }
    .result-item:hover { background: var(--hud-hover); color: var(--hud-accent); }
    .result-empty, .result-pending { text-align: center; color: var(--hud-muted); }
    .result-pending { font-style: italic; }
    .footer-hint { margin-top: 12px; font-size: 9.5px; color: var(--hud-subtle); text-align: center; }
    .settings-hint { margin: 4px 0 2px; color: var(--hud-muted); font-size: 9.5px; line-height: 1.5; }
    kbd { padding: 2px 4px; border: 1px solid var(--hud-border); border-radius: 4px; color: var(--hud-muted); font-family: ui-monospace, monospace; }

    .advanced { margin-top: 10px; }
    .advanced > summary { display: flex; align-items: center; gap: 6px; padding: 8px 0; font-size: 10px; font-weight: 700; color: var(--hud-muted); text-transform: uppercase; letter-spacing: 0.04em; cursor: pointer; list-style: none; }
    .advanced > summary::-webkit-details-marker { display: none; }
    .advanced > summary::before { content: "▸"; font-size: 10px; color: var(--hud-subtle); transition: transform 140ms ease; }
    .advanced[open] > summary::before { transform: rotate(90deg); }
    .advanced-body { padding: 2px 0 4px; }

    .sr-live { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0; }

    .hud-panel button:focus-visible,
    .hud-panel input:focus-visible,
    .hud-panel select:focus-visible,
    .docked-pill:focus-visible {
      outline: 2px solid var(--hud-normal-tone, #65d2a4);
      outline-offset: 2px;
    }

    @media (max-width: 440px) {
      .status-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }

    @media (prefers-reduced-motion: reduce) {
      .modal-backdrop, .hud-panel, .modal-backdrop[data-dock] .hud-panel, .docked-pill, .pill-load-progress, .slider, .advanced > summary::before { transition: none !important; }
    }
  `;

  // scripts/ai-chat-turbo-engine/src/ui/hud.ts
  var positionStore = createReportedStorage("localStorage", (failure) => {
    const scope = failure.operation === "write" || failure.operation === "remove" ? "save pill position" : "restore pill position";
    reportRecoverableError(scope, failure.error);
  });
  var THEME_ATTRIBUTES = [
    "class",
    "style",
    "data-theme",
    "data-color-mode",
    "data-theme-mode",
    "data-mode",
    "data-color-scheme"
  ];
  var DOCK_EDGE_SNAP = 26;
  var DOCK_TAB_WIDTH = 30;
  var DOCK_TAB_HEIGHT = 86;
  function isPillPosition(value) {
    if (typeof value !== "object" || value === null) return false;
    if (!("x" in value) || !("y" in value)) return false;
    return typeof value.x === "number" && typeof value.y === "number";
  }
  function parseHudTheme(value) {
    return value === "light" || value === "dark" ? value : "auto";
  }
  function themeFromText(value) {
    if (!value) return null;
    const normalized = value.toLowerCase();
    if (normalized.includes("dark") || normalized.includes("night")) return "dark";
    if (normalized.includes("light") || normalized.includes("day")) return "light";
    return null;
  }
  function themeFromClasses(node) {
    const tokens = Array.from(node.classList, (token) => token.toLowerCase());
    for (const token of tokens) {
      if (token === "dark" || token === "night" || token === "theme-dark" || token === "dark-theme" || token.startsWith("dark-") || token.endsWith("-dark")) {
        return "dark";
      }
    }
    for (const token of tokens) {
      if (token === "light" || token === "day" || token === "theme-light" || token === "light-theme" || token.startsWith("light-") || token.endsWith("-light")) {
        return "light";
      }
    }
    return null;
  }
  function parseCssColor(value) {
    const match = value.trim().match(/^rgba?\(([^)]+)\)$/i);
    if (!match) return null;
    const parts = match[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const red = Number(parts[0]);
    const green = Number(parts[1]);
    const blue = Number(parts[2]);
    const alpha = parts.length >= 4 ? Number(parts[3]) : 1;
    if (![red, green, blue, alpha].every(Number.isFinite)) return null;
    return { r: red, g: green, b: blue, a: alpha };
  }
  function relativeLuminance(color) {
    const channel = (value) => {
      const normalized = value / 255;
      return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
  }
  function detectBackgroundTheme() {
    for (const node of [document.documentElement, document.body]) {
      if (!node) continue;
      const background = window.getComputedStyle(node).backgroundColor;
      const color = parseCssColor(background);
      if (!color || color.a === 0) continue;
      return relativeLuminance(color) < 0.35 ? "dark" : "light";
    }
    return null;
  }
  function detectHostTheme() {
    const nodes = [document.documentElement, document.body];
    for (const node of nodes) {
      if (!node) continue;
      const fromClasses = themeFromClasses(node);
      if (fromClasses) return fromClasses;
    }
    for (const node of nodes) {
      if (!node) continue;
      for (const attribute of THEME_ATTRIBUTES) {
        if (attribute === "class" || attribute === "style") continue;
        const fromAttribute = themeFromText(node.getAttribute(attribute));
        if (fromAttribute) return fromAttribute;
      }
    }
    for (const node of nodes) {
      if (!node) continue;
      const scheme = window.getComputedStyle(node).getPropertyValue("color-scheme");
      const fromScheme = themeFromText(scheme);
      if (fromScheme) return fromScheme;
    }
    const fromBackground = detectBackgroundTheme();
    if (fromBackground) return fromBackground;
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  }
  function resolveLoadTone(totalTurns, messageLimit) {
    const loadRatio = messageLimit > 0 ? totalTurns / messageLimit : 0;
    if (loadRatio >= 1) return "critical";
    if (loadRatio >= LOAD_WARNING_RATIO) return "warning";
    return "normal";
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
      markRestoredTurn,
      flushTextIndex,
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
    let searchRefreshTimer = null;
    let announceTimer = null;
    let themeObserver = null;
    let themeMediaQuery = null;
    let cleanupPillDrag = null;
    let suppressPillClick = false;
    let focusBeforeOpen = null;
    let dockSide = null;
    let dockController = null;
    function parseDockSide(value) {
      return value === "left" || value === "right" ? value : null;
    }
    function readDockSide() {
      try {
        return parseDockSide(positionStore.read(STORAGE_KEY_DOCK));
      } catch (error) {
        reportRecoverableError("restore HUD dock", error);
        return null;
      }
    }
    function persistDockSide(side) {
      if (side) positionStore.write(STORAGE_KEY_DOCK, side);
      else positionStore.remove(STORAGE_KEY_DOCK);
    }
    function syncDockChrome() {
      if (!hudStats) return;
      if (hudRootElement) {
        if (dockSide) hudRootElement.setAttribute("data-hud-dock", dockSide);
        else hudRootElement.removeAttribute("data-hud-dock");
      }
      if (dockSide) hudStats.backdrop.setAttribute("data-dock", dockSide);
      else hudStats.backdrop.removeAttribute("data-dock");
      const docked = dockSide !== null;
      hudStats.dockButton.textContent = docked ? "取消贴边" : "贴边";
      hudStats.dockButton.title = docked ? "取消贴边，恢复悬浮仪表" : "贴到屏幕边缘，收成侧边信息条";
      hudStats.dockButton.setAttribute("aria-pressed", docked ? "true" : "false");
      hudStats.dockButton.setAttribute(
        "aria-label",
        docked ? "取消贴边，恢复悬浮仪表" : "把信息面板贴到屏幕边缘"
      );
    }
    function setDockSide(side) {
      if (dockSide === side) return;
      const wasDocked = dockSide !== null;
      dockSide = side;
      persistDockSide(side);
      syncDockChrome();
      dockController?.(side, wasDocked);
    }
    let keepValue = null;
    let messageLimitInput = null;
    let themeSelect = null;
    let advancedSettings = null;
    let chkPrune = null;
    let chkCollapse = null;
    let chkVirtualFile = null;
    let chkSidebarPeek = null;
    let chkReasoning = null;
    let chkTools = null;
    function announce(message) {
      if (!hudStats) return;
      if (announceTimer !== null) {
        window.clearTimeout(announceTimer);
        announceTimer = null;
      }
      hudStats.liveRegion.textContent = message;
      announceTimer = window.setTimeout(() => {
        if (hudStats) hudStats.liveRegion.textContent = "";
        announceTimer = null;
      }, 2400);
    }
    function syncTheme() {
      if (!hudRootElement) return;
      const resolved = state.hudTheme === "auto" ? detectHostTheme() : state.hudTheme;
      if (hudRootElement.dataset["hudTheme"] !== resolved) {
        hudRootElement.dataset["hudTheme"] = resolved;
      }
    }
    function bindThemeWatchers() {
      if (themeObserver || !hudRootElement) return;
      themeObserver = new MutationObserver(() => syncTheme());
      const options = {
        attributes: true,
        attributeFilter: Array.from(THEME_ATTRIBUTES)
      };
      themeObserver.observe(document.documentElement, options);
      if (document.body) themeObserver.observe(document.body, options);
      if (typeof window.matchMedia === "function") {
        themeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        themeMediaQuery.addEventListener("change", syncTheme);
      }
    }
    function unbindThemeWatchers() {
      themeObserver?.disconnect();
      themeObserver = null;
      if (themeMediaQuery) {
        themeMediaQuery.removeEventListener("change", syncTheme);
        themeMediaQuery = null;
      }
    }
    function syncControls() {
      if (keepValue) keepValue.textContent = String(state.keepTurns);
      if (messageLimitInput) {
        messageLimitInput.value = String(state.messageLimit);
      }
      if (themeSelect) themeSelect.value = state.hudTheme;
      if (chkPrune) chkPrune.checked = state.pruneEnabled;
      if (chkCollapse) chkCollapse.checked = state.collapseCode;
      if (chkVirtualFile) chkVirtualFile.checked = state.virtualFileEnabled;
      if (chkSidebarPeek) chkSidebarPeek.checked = state.sidebarPeekEnabled;
      if (chkReasoning) chkReasoning.checked = state.rememberReasoning;
      if (chkTools) chkTools.checked = state.rememberTools;
    }
    function resetAllSettings() {
      if (!window.confirm(
        "恢复默认设置？HUD 位置、当前统计与会话数据会保留。"
      )) {
        return;
      }
      resetPersistedConfig(state);
      syncControls();
      deps.syncSidebarPeek();
      saveConfig();
      syncTheme();
      if (!state.virtualFileEnabled) clearFiles();
      codeBlocks.requestCodeScan();
      requestFullTurnSync();
      requestUpdate();
      reasoning.scheduleReasoningRestore();
      reasoning.renderReasoningStatus();
      toolMemory.scheduleRestore();
      toolMemory.renderStatus();
      if (hudStats) {
        hudStats.signature = "";
        updateHudDashboard();
      }
      announce("已恢复默认设置");
    }
    function updateHudDashboard() {
      syncTheme();
      if (!hudStats) return;
      const fileCount = activeFileCount();
      const hudSignature = String(state.totalTurns) + "|" + String(state.hiddenCount) + "|" + String(state.foldedCodeCount) + "|" + String(fileCount) + "|" + String(state.messageLimit);
      if (hudStats.signature === hudSignature) return;
      hudStats.signature = hudSignature;
      hudStats.total.textContent = String(state.totalTurns);
      hudStats.hidden.textContent = String(state.hiddenCount);
      hudStats.folded.textContent = String(state.foldedCodeCount);
      hudStats.files.textContent = String(fileCount);
      const loadProgress = Math.min(
        1,
        Math.max(0, state.totalTurns) / Math.max(1, state.messageLimit)
      );
      const loadTone = resolveLoadTone(state.totalTurns, state.messageLimit);
      const loadToneLabel = loadTone === "critical" ? "已达到提醒上限" : loadTone === "warning" ? "接近提醒上限" : "负载正常";
      hudStats.pillRoot.dataset["loadTone"] = loadTone;
      hudStats.pillRoot.title = "负载 " + state.totalTurns + "/" + state.messageLimit + "（" + loadToneLabel + "）；点击打开面板，拖动可移动，拖到屏幕边缘会收成侧边条";
      hudStats.pillRoot.setAttribute(
        "aria-label",
        "长对话负载 " + state.totalTurns + "/" + state.messageLimit + "，" + loadToneLabel + "；消息 " + state.totalTurns + "，已脱水 " + state.hiddenCount + "，代码折叠 " + state.foldedCodeCount + "，虚拟文件 " + fileCount + "；点击打开面板，拖动可移动，拖到屏幕边缘会收成侧边条"
      );
      hudStats.totalStatusItem.dataset["loadTone"] = loadTone;
      hudStats.pillCount.textContent = String(state.totalTurns);
      hudStats.pillLoadProgress.setAttribute(
        "stroke-dashoffset",
        String(LOAD_RING_CIRCUMFERENCE * (1 - loadProgress))
      );
      hudStats.warning.hidden = loadTone === "normal";
      hudStats.warning.dataset["tone"] = loadTone;
      hudStats.warningText.textContent = loadTone === "critical" ? "消息数已达到提醒上限（" + state.totalTurns + "/" + state.messageLimit + "）。建议检查脱水效果，或新建对话继续。" : loadTone === "warning" ? "消息数已接近提醒上限（" + state.totalTurns + "/" + state.messageLimit + "）。可检查脱水效果，或新建对话继续。" : "";
    }
    function getFocusableElements() {
      if (!hudStats) return [];
      const selector = 'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [href], [tabindex]:not([tabindex="-1"])';
      return Array.from(
        hudStats.panel.querySelectorAll(selector)
      ).filter((node) => {
        if (node.hasAttribute("hidden") || node.closest("[hidden]")) return false;
        const closedDetails = node.closest("details:not([open])");
        if (closedDetails && node.tagName !== "SUMMARY") return false;
        return true;
      });
    }
    function restoreFocus() {
      if (!hudStats) return;
      const candidate = focusBeforeOpen;
      focusBeforeOpen = null;
      const target = candidate && candidate.isConnected && !candidate.hasAttribute("disabled") && candidate.getAttribute("aria-disabled") !== "true" ? candidate : hudStats.pillRoot;
      target.focus();
      const active = hudShadowRoot?.activeElement ?? document.activeElement;
      if (active !== target) hudStats.pillRoot.focus();
    }
    function rememberFocus() {
      if (!hudStats) return;
      const active = document.activeElement;
      focusBeforeOpen = active instanceof HTMLElement && active !== document.body && active !== document.documentElement ? active : hudStats.pillRoot;
    }
    function applyPanelState(open) {
      if (!hudStats) return;
      hudStats.backdrop.classList.toggle("open", open);
      hudStats.backdrop.setAttribute("aria-hidden", String(!open));
      hudStats.panel.setAttribute("aria-hidden", String(!open));
      hudStats.pillRoot.setAttribute("aria-expanded", String(open));
      if (open) {
        hudStats.backdrop.removeAttribute("inert");
      } else {
        hudStats.backdrop.setAttribute("inert", "");
      }
    }
    function togglePanel(forceState) {
      ensureHUDMounted();
      if (!hudStats) return;
      const next = typeof forceState === "boolean" ? forceState : !state.hudOpen;
      if (next === state.hudOpen) {
        if (next) searchInput?.focus();
        return;
      }
      if (next) rememberFocus();
      state.hudOpen = next;
      applyPanelState(next);
      if (next) {
        searchInput?.focus();
      } else {
        restoreFocus();
      }
    }
    function handleShadowKeydown(event) {
      if (!(event instanceof KeyboardEvent)) return;
      if (event.key !== "Tab" || !state.hudOpen || !hudStats) return;
      const focusables = getFocusableElements();
      if (!focusables.length) {
        event.preventDefault();
        hudStats.panel.focus();
        return;
      }
      const active = hudShadowRoot?.activeElement ?? document.activeElement;
      const index = focusables.indexOf(active);
      if (event.shiftKey) {
        if (index <= 0) {
          event.preventDefault();
          focusables[focusables.length - 1].focus();
        }
        return;
      }
      if (index === -1 || index === focusables.length - 1) {
        event.preventDefault();
        focusables[0].focus();
      }
    }
    function renderSearchResults(queryText) {
      if (!searchResultsBox) return;
      searchResultsBox.textContent = "";
      if (!queryText) return;
      const pendingCount = flushTextIndex();
      const normalizedQuery = queryText.toLowerCase();
      const matches = state.indexedTurns.filter((record) => record.text.toLowerCase().includes(normalizedQuery)).slice(0, SEARCH_LIMIT);
      if (!matches.length) {
        if (pendingCount === 0) {
          searchResultsBox.appendChild(
            el("div", { className: "result-empty" }, ["没有匹配的消息"])
          );
          return;
        }
      } else {
        for (const record of matches) {
          const previewText = record.text || "（无文本）";
          const resultText = previewText.length > SEARCH_PREVIEW_LIMIT ? previewText.slice(0, SEARCH_PREVIEW_LIMIT) + "…" : previewText;
          const resultButton = el(
            "button",
            {
              type: "button",
              className: "result-item"
            },
            ["#" + String(record.id + 1) + "  " + resultText]
          );
          resultButton.addEventListener("click", () => {
            const targetElement = record.element;
            if (!(targetElement instanceof Element)) return;
            markRestoredTurn(targetElement);
            targetElement.classList.remove("ai-turbo-dehydrated");
            if (targetElement instanceof HTMLElement) {
              targetElement.style.removeProperty("--turbo-cached-h");
            }
            togglePanel(false);
            targetElement.scrollIntoView({
              behavior: "smooth",
              block: "center"
            });
            codeBlocks.requestCodeScanForTurn(targetElement);
            if (targetElement instanceof HTMLElement) {
              targetElement.style.outline = "2px solid rgba(52, 211, 153, 0.85)";
              targetElement.style.outlineOffset = "4px";
              window.setTimeout(() => {
                targetElement.style.outline = "";
                targetElement.style.outlineOffset = "";
              }, 1800);
            }
          });
          searchResultsBox.appendChild(resultButton);
        }
      }
      if (pendingCount > 0) {
        searchResultsBox.appendChild(
          el(
            "div",
            { className: "result-pending", role: "status", "aria-live": "polite" },
            ["正在索引 " + String(pendingCount) + " 条消息…"]
          )
        );
        if (searchRefreshTimer !== null) {
          window.clearTimeout(searchRefreshTimer);
        }
        searchRefreshTimer = window.setTimeout(() => {
          searchRefreshTimer = null;
          const currentQuery = searchInput?.value.trim() ?? "";
          if (currentQuery === queryText) renderSearchResults(currentQuery);
        }, 200);
      }
    }
    function initPillDrag(pill) {
      const pillWidth = pill.offsetWidth || 48;
      const pillHeight = pill.offsetHeight || 48;
      let posX = Math.max(8, window.innerWidth - pillWidth - 8);
      let posY = Math.max(8, window.innerHeight - pillHeight - 8);
      let hadSaved = false;
      try {
        const raw = positionStore.read(STORAGE_KEY_POS);
        const saved = JSON.parse(
          raw === null || raw === "" ? "null" : raw
        );
        if (isPillPosition(saved)) {
          posX = saved.x;
          posY = saved.y;
          hadSaved = true;
        }
      } catch (error) {
        reportRecoverableError("restore pill position", error);
      }
      const limits = () => ({
        maxX: Math.max(8, window.innerWidth - (pill.offsetWidth || 48) - 8),
        maxY: Math.max(8, window.innerHeight - (pill.offsetHeight || 48) - 8)
      });
      const clamp = () => {
        const { maxX, maxY } = limits();
        posX = Math.min(maxX, Math.max(8, posX));
        posY = Math.min(maxY, Math.max(8, posY));
      };
      const apply = () => {
        pill.style.left = String(posX) + "px";
        pill.style.top = String(posY) + "px";
      };
      const applyDock = (side) => {
        const width = pill.offsetWidth || DOCK_TAB_WIDTH;
        const height = pill.offsetHeight || DOCK_TAB_HEIGHT;
        const maxY = Math.max(8, window.innerHeight - height - 8);
        posY = Math.min(maxY, Math.max(8, posY));
        pill.style.left = side === "left" ? "0px" : String(Math.max(0, window.innerWidth - width)) + "px";
        pill.style.top = String(posY) + "px";
      };
      const resolveDockSide = () => {
        const width = pill.offsetWidth || 48;
        const rightGap = window.innerWidth - (posX + width);
        if (posX <= DOCK_EDGE_SNAP) return "left";
        if (rightGap <= DOCK_EDGE_SNAP) return "right";
        return null;
      };
      const persist = () => {
        positionStore.writeJson(STORAGE_KEY_POS, { x: posX, y: posY });
      };
      const beforeX = posX;
      const beforeY = posY;
      clamp();
      apply();
      if (hadSaved && (beforeX !== posX || beforeY !== posY)) persist();
      let pointerDown = false;
      let dragStarted = false;
      let startX = 0;
      let startY = 0;
      let originX = 0;
      let originY = 0;
      dockController = (side, wasDocked = false) => {
        if (side) {
          applyDock(side);
          return;
        }
        if (wasDocked) {
          const width = pill.offsetWidth || 48;
          if (posX <= DOCK_EDGE_SNAP) posX = 24;
          else if (posX + width >= window.innerWidth - DOCK_EDGE_SNAP) {
            posX = window.innerWidth - width - 24;
          }
        }
        clamp();
        apply();
      };
      const removeMoveListeners = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerCancel);
      };
      const finishDrag = () => {
        pointerDown = false;
        dragStarted = false;
        pill.classList.remove("dragging");
        removeMoveListeners();
      };
      function onPointerMove(event) {
        if (!pointerDown) return;
        const deltaX = event.clientX - startX;
        const deltaY = event.clientY - startY;
        if (!dragStarted && Math.sqrt(deltaX * deltaX + deltaY * deltaY) <= 4) {
          return;
        }
        if (!dragStarted) {
          dragStarted = true;
          suppressPillClick = true;
          pill.classList.add("dragging");
        }
        event.preventDefault();
        const { maxX, maxY } = limits();
        posX = Math.min(maxX, Math.max(8, originX + deltaX));
        posY = Math.min(maxY, Math.max(8, originY + deltaY));
        apply();
      }
      function onPointerUp(event) {
        if (!pointerDown) return;
        const dragged = dragStarted;
        finishDrag();
        if (dragged) {
          suppressPillClick = true;
          const nextDock = resolveDockSide();
          if (nextDock) {
            setDockSide(nextDock);
            persist();
          } else {
            if (dockSide) setDockSide(null);
            clamp();
            apply();
            persist();
          }
        }
        event.preventDefault();
      }
      function onPointerCancel() {
        if (!pointerDown) return;
        const dragged = dragStarted;
        finishDrag();
        if (dragged) {
          suppressPillClick = true;
          if (dockSide) applyDock(dockSide);
          else apply();
          persist();
        }
      }
      const onPointerDown = (event) => {
        if (event.button !== 0) return;
        suppressPillClick = false;
        pointerDown = true;
        dragStarted = false;
        startX = event.clientX;
        startY = event.clientY;
        if (dockSide) {
          const rect = pill.getBoundingClientRect();
          posX = rect.left;
          posY = rect.top;
        }
        originX = posX;
        originY = posY;
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("pointercancel", onPointerCancel);
      };
      const onViewportResize = () => {
        if (dockSide) {
          applyDock(dockSide);
          return;
        }
        const beforeX2 = posX;
        const beforeY2 = posY;
        clamp();
        apply();
        if (beforeX2 !== posX || beforeY2 !== posY) persist();
      };
      pill.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("resize", onViewportResize, { passive: true });
      window.visualViewport?.addEventListener("resize", onViewportResize);
      dockSide = readDockSide();
      syncDockChrome();
      dockController(dockSide);
      return () => {
        removeMoveListeners();
        pill.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("resize", onViewportResize);
        window.visualViewport?.removeEventListener("resize", onViewportResize);
        pill.classList.remove("dragging");
        dockController = null;
        pointerDown = false;
        dragStarted = false;
      };
    }
    function buildHUD() {
      reasoning.attachStatusNode(reasoningStatusNode);
      toolMemory.attachStatusNode(toolStatusNode);
      if (isEngineDormant2()) return;
      if (hudRootElement?.isConnected && hudStats) {
        updateHudDashboard();
        return;
      }
      const mountTarget = document.body || document.documentElement;
      if (!mountTarget) return;
      document.getElementById(HUD_ID)?.remove();
      cleanupPillDrag?.();
      cleanupPillDrag = null;
      unbindThemeWatchers();
      hudStats = null;
      hudRootElement = el("div", {
        id: HUD_ID,
        style: "all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;display:block!important;"
      });
      hudShadowRoot = hudRootElement.attachShadow({ mode: "open" });
      const styles = document.createElement("style");
      styles.textContent = HUD_STYLES;
      hudShadowRoot.appendChild(styles);
      const pillCountValue = el("strong", { className: "turbo-count" }, ["0"]);
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
          title: "负载 0/" + String(state.messageLimit) + "（负载正常）；点击打开面板，拖动可移动",
          "aria-label": "长对话负载 0/" + String(state.messageLimit) + "，负载正常；消息 0，已脱水 0，代码折叠 0，虚拟文件 0；点击打开面板，拖动可移动",
          "aria-haspopup": "dialog",
          "aria-controls": "panel",
          "aria-expanded": "false"
        },
        [
          el("span", { className: "turbo-gauge", "aria-hidden": "true" }, [
            pillLoadRing,
            el("span", { className: "turbo-readout" }, [pillCountValue])
          ]),
          el("span", { className: "dock-mark", "aria-hidden": "true" }, ["AI"])
        ]
      );
      pill.addEventListener("click", (event) => {
        if (suppressPillClick) {
          suppressPillClick = false;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        togglePanel(true);
      });
      const totalVal = el("strong", { className: "status-value" }, ["0"]);
      const hiddenVal = el("strong", { className: "status-value" }, ["0"]);
      const foldedVal = el("strong", { className: "status-value" }, ["0"]);
      const filesVal = el("strong", { className: "status-value" }, ["0"]);
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
        ]),
        el("div", { className: "status-item" }, [
          el("span", { className: "status-label" }, ["虚拟文件"]),
          filesVal
        ])
      ]);
      const warningText = el("p", { className: "load-warning-text" });
      const warningSearch = el(
        "button",
        { type: "button" },
        ["检索会话"]
      );
      const warningLimit = el(
        "button",
        { type: "button" },
        ["调整提醒上限"]
      );
      const warning = el(
        "div",
        {
          className: "load-warning",
          role: "status",
          "aria-live": "polite",
          hidden: ""
        },
        [
          warningText,
          el("div", { className: "load-warning-actions" }, [
            warningSearch,
            warningLimit
          ])
        ]
      );
      warningSearch.addEventListener("click", () => searchInput?.focus());
      warningLimit.addEventListener("click", () => {
        if (advancedSettings) advancedSettings.open = true;
        messageLimitInput?.focus();
        messageLimitInput?.select();
      });
      searchInput = el("input", {
        className: "search-input",
        id: "hud-search",
        type: "text",
        placeholder: "检索当前会话内容...",
        autocomplete: "off",
        "aria-label": "检索当前会话内容"
      });
      searchInput.addEventListener("input", () => {
        if (searchDebounceTimer !== null) {
          window.clearTimeout(searchDebounceTimer);
        }
        const inputElement = searchInput;
        searchDebounceTimer = window.setTimeout(() => {
          renderSearchResults(inputElement?.value.trim() ?? "");
        }, 120);
      });
      searchResultsBox = el("div", { className: "results" });
      const searchSection = el("div", { className: "section" }, [
        el("div", { className: "section-title" }, ["历史检索"]),
        el("div", { className: "search-wrap" }, [searchInput]),
        searchResultsBox
      ]);
      const forkText = el("span", {}, ["复制原始上下文（回退）"]);
      const btnFork = el(
        "button",
        { className: "action-btn", type: "button" },
        [forkText]
      );
      btnFork.addEventListener("click", () => {
        handoff.exportCleanContext((count) => {
          btnFork.classList.add("copied");
          forkText.textContent = "已复制 " + String(count) + " 条完整消息";
          window.setTimeout(() => {
            btnFork.classList.remove("copied");
            forkText.textContent = "复制原始上下文（回退）";
          }, 2200);
        });
      });
      const btnOneClickHandoff = el(
        "button",
        { className: "action-btn", type: "button" },
        ["一键交接（生成并恢复）"]
      );
      btnOneClickHandoff.addEventListener(
        "click",
        () => handoff.startOneClickHandoff()
      );
      const handoffStatusNode = el(
        "div",
        { className: "handoff-status", role: "status", "aria-live": "polite" },
        ["交接状态：未开始"]
      );
      handoff.attachStatusNode(handoffStatusNode);
      const handoffSection = el("div", { className: "section" }, [
        el("div", { className: "section-title" }, ["上下文交接"]),
        btnOneClickHandoff,
        handoffStatusNode,
        btnFork
      ]);
      chkPrune = el("input", { id: "hud-prune", type: "checkbox" });
      chkCollapse = el("input", { id: "hud-collapse", type: "checkbox" });
      chkVirtualFile = el("input", {
        id: "hud-virtual-file",
        type: "checkbox"
      });
      chkSidebarPeek = el("input", {
        id: "hud-sidebar-peek",
        type: "checkbox"
      });
      chkReasoning = el("input", { id: "hud-reasoning", type: "checkbox" });
      const switchRow = (id, labelText, input) => el("div", { className: "control-row" }, [
        el("label", { for: id, className: "control-label" }, [labelText]),
        el("label", { className: "switch" }, [
          input,
          el("span", { className: "slider" })
        ])
      ]);
      chkPrune.checked = state.pruneEnabled;
      chkCollapse.checked = state.collapseCode;
      chkVirtualFile.checked = state.virtualFileEnabled;
      chkSidebarPeek.checked = state.sidebarPeekEnabled;
      chkReasoning.checked = state.rememberReasoning;
      chkPrune.addEventListener("change", () => {
        state.pruneEnabled = chkPrune?.checked ?? true;
        saveConfig();
        requestFullTurnSync();
        requestUpdate();
        announce(
          "安全视口脱水" + (state.pruneEnabled ? "已开启" : "已关闭") + "，设置已保存"
        );
      });
      chkCollapse.addEventListener("change", () => {
        state.collapseCode = chkCollapse?.checked ?? true;
        saveConfig();
        codeBlocks.requestCodeScan();
        requestUpdate();
        announce(
          "长代码自动折叠" + (state.collapseCode ? "已开启" : "已关闭") + "，设置已保存"
        );
      });
      chkVirtualFile.addEventListener("change", () => {
        state.virtualFileEnabled = chkVirtualFile?.checked ?? true;
        saveConfig();
        if (!state.virtualFileEnabled) clearFiles();
        updateHudDashboard();
        announce(
          "长文本伪文件胶囊" + (state.virtualFileEnabled ? "已开启" : "已关闭") + "，设置已保存"
        );
      });
      chkSidebarPeek.addEventListener("change", () => {
        state.sidebarPeekEnabled = chkSidebarPeek?.checked ?? true;
        saveConfig();
        deps.syncSidebarPeek();
        announce(
          "悬停展开侧栏" + (state.sidebarPeekEnabled ? "已开启" : "已关闭") + "，设置已保存"
        );
      });
      chkReasoning.addEventListener("change", () => {
        state.rememberReasoning = chkReasoning?.checked ?? true;
        saveConfig();
        reasoning.scheduleReasoningRestore();
        reasoning.renderReasoningStatus();
        announce(
          "记住推理强度" + (state.rememberReasoning ? "已开启" : "已关闭") + "，设置已保存"
        );
      });
      const commonRows = [
        switchRow("hud-prune", "安全视口脱水", chkPrune),
        switchRow("hud-collapse", "长代码自动折叠", chkCollapse),
        switchRow("hud-virtual-file", "长文本伪文件胶囊", chkVirtualFile),
        switchRow("hud-sidebar-peek", "悬停展开侧栏", chkSidebarPeek),
        switchRow("hud-reasoning", "记住推理强度", chkReasoning),
        reasoningStatusNode
      ];
      if (currentPlatform.supportsToolMemory === true) {
        const toolInput = el("input", { id: "hud-tools", type: "checkbox" });
        toolInput.checked = state.rememberTools;
        toolInput.addEventListener("change", () => {
          state.rememberTools = toolInput.checked;
          saveConfig();
          toolMemory.scheduleRestore();
          toolMemory.renderStatus();
          announce(
            "记住工具选择" + (state.rememberTools ? "已开启" : "已关闭") + "，设置已保存"
          );
        });
        chkTools = toolInput;
        commonRows.push(
          switchRow("hud-tools", "记住工具选择", toolInput),
          toolStatusNode
        );
      }
      const commonSection = el("div", { className: "section" }, [
        el("div", { className: "section-title" }, ["常用开关"]),
        el("p", { className: "settings-hint" }, [
          "修改会立即生效并自动保存。"
        ]),
        ...commonRows
      ]);
      keepValue = el("span", { id: "keep-val" }, [String(state.keepTurns)]);
      const stepDec = el(
        "button",
        {
          type: "button",
          "aria-label": "减少活跃保留轮次"
        },
        ["−"]
      );
      const stepInc = el(
        "button",
        {
          type: "button",
          "aria-label": "增加活跃保留轮次"
        },
        ["+"]
      );
      stepDec.addEventListener("click", () => {
        if (state.keepTurns <= 2) return;
        state.keepTurns--;
        if (keepValue) keepValue.textContent = String(state.keepTurns);
        saveConfig();
        requestFullTurnSync();
        requestUpdate();
        announce("活跃保留轮次：" + String(state.keepTurns) + "，设置已保存");
      });
      stepInc.addEventListener("click", () => {
        if (state.keepTurns >= 50) return;
        state.keepTurns++;
        if (keepValue) keepValue.textContent = String(state.keepTurns);
        saveConfig();
        requestFullTurnSync();
        requestUpdate();
        announce("活跃保留轮次：" + String(state.keepTurns) + "，设置已保存");
      });
      const limitInput = el("input", {
        className: "limit-input",
        id: "message-limit",
        type: "number",
        min: String(MESSAGE_LIMIT_MIN),
        max: String(MESSAGE_LIMIT_MAX),
        step: "1",
        value: String(state.messageLimit),
        title: "消息提醒上限，范围 " + String(MESSAGE_LIMIT_MIN) + " 至 " + String(MESSAGE_LIMIT_MAX),
        "aria-label": "消息提醒上限"
      });
      limitInput.value = String(state.messageLimit);
      limitInput.addEventListener("change", () => {
        const rawValue = limitInput.value.trim();
        if (rawValue === "") {
          limitInput.value = String(state.messageLimit);
          return;
        }
        const numericLimit = Number(rawValue);
        if (!Number.isInteger(numericLimit) || numericLimit < MESSAGE_LIMIT_MIN || numericLimit > MESSAGE_LIMIT_MAX) {
          limitInput.value = String(state.messageLimit);
          return;
        }
        state.messageLimit = numericLimit;
        limitInput.value = String(state.messageLimit);
        saveConfig();
        updateHudDashboard();
        announce(
          "消息提醒上限：" + String(state.messageLimit) + "，设置已保存"
        );
      });
      messageLimitInput = limitInput;
      themeSelect = el("select", {
        className: "theme-select",
        id: "hud-theme",
        "aria-label": "界面主题"
      });
      for (const option of [
        ["auto", "自动"],
        ["light", "浅色"],
        ["dark", "深色"]
      ]) {
        themeSelect.appendChild(
          el("option", { value: option[0] }, [option[1]])
        );
      }
      themeSelect.value = state.hudTheme;
      themeSelect.addEventListener("change", () => {
        state.hudTheme = parseHudTheme(themeSelect?.value);
        if (themeSelect) themeSelect.value = state.hudTheme;
        saveConfig();
        syncTheme();
        const label = state.hudTheme === "auto" ? "自动" : state.hudTheme === "light" ? "浅色" : "深色";
        announce("界面主题：" + label + "，设置已保存");
      });
      const resetButton = el(
        "button",
        { className: "action-btn reset-btn", type: "button" },
        ["恢复默认设置"]
      );
      resetButton.addEventListener("click", resetAllSettings);
      const advancedBody = el("div", { className: "advanced-body" }, [
        el("div", { className: "control-row" }, [
          el("span", {}, ["活跃保留轮次"]),
          el("div", { className: "stepper" }, [stepDec, keepValue, stepInc])
        ]),
        el("div", { className: "control-row" }, [
          el("label", { for: "message-limit" }, ["消息提醒上限"]),
          el("div", { className: "limit-control" }, [
            limitInput,
            el("span", { className: "limit-unit" }, ["条"])
          ])
        ]),
        el("div", { className: "control-row" }, [
          el("label", { for: "hud-theme" }, ["界面主题"]),
          themeSelect
        ]),
        resetButton
      ]);
      advancedSettings = el(
        "details",
        { className: "section advanced", id: "advanced-settings" },
        [
          el("summary", {}, ["高级设置"]),
          advancedBody
        ]
      );
      const btnClose = el(
        "button",
        {
          className: "close-btn",
          type: "button",
          "aria-label": "关闭面板"
        },
        ["✕"]
      );
      btnClose.addEventListener("click", () => togglePanel(false));
      const btnDock = el(
        "button",
        {
          className: "dock-btn",
          type: "button",
          title: "贴到屏幕边缘，收成侧边信息条",
          "aria-label": "把信息面板贴到屏幕边缘",
          "aria-pressed": "false"
        },
        ["贴边"]
      );
      btnDock.addEventListener("click", () => {
        if (dockSide) {
          setDockSide(null);
          announce("已取消贴边，恢复悬浮仪表");
          return;
        }
        const pillCenter = pill.offsetLeft + pill.offsetWidth / 2;
        const side = pillCenter < window.innerWidth / 2 ? "left" : "right";
        setDockSide(side);
        announce(side === "left" ? "已贴到左侧边缘" : "已贴到右侧边缘");
      });
      const panelHeader = el("div", { className: "header" }, [
        el("div", {}, [
          el("div", { className: "brand-title", id: "hud-title" }, [
            "AI Turbo Engine"
          ]),
          el("div", { className: "brand-subtitle" }, [
            currentPlatform.name + " · v" + VERSION
          ])
        ]),
        el("div", { className: "header-actions" }, [btnDock, btnClose])
      ]);
      const footerHint = el("div", { className: "footer-hint" }, [
        el("kbd", {}, ["Alt"]),
        " + ",
        el("kbd", {}, ["T"]),
        " 呼出 / 收起 · ",
        el("kbd", {}, ["Esc"]),
        " 退出"
      ]);
      const liveRegion = el("div", {
        className: "sr-live",
        role: "status",
        "aria-live": "polite",
        "aria-atomic": "true"
      });
      const panel = el(
        "div",
        {
          className: "hud-panel",
          id: "panel",
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": "hud-title",
          "aria-hidden": "true",
          tabindex: "-1"
        },
        [
          panelHeader,
          statusStrip,
          warning,
          searchSection,
          handoffSection,
          commonSection,
          advancedSettings,
          footerHint,
          liveRegion
        ]
      );
      const backdrop = el(
        "div",
        {
          className: "modal-backdrop",
          id: "backdrop",
          "aria-hidden": "true",
          inert: ""
        },
        [panel]
      );
      backdrop.addEventListener("click", (event) => {
        if (event.target === backdrop) togglePanel(false);
      });
      hudShadowRoot.append(pill, backdrop);
      mountTarget.appendChild(hudRootElement);
      hudShadowRoot.addEventListener("keydown", handleShadowKeydown);
      hudStats = {
        total: totalVal,
        hidden: hiddenVal,
        folded: foldedVal,
        files: filesVal,
        totalStatusItem,
        warning,
        warningText,
        panel,
        backdrop,
        pillRoot: pill,
        dockButton: btnDock,
        pillCount: pillCountValue,
        pillLoadProgress,
        liveRegion,
        signature: ""
      };
      syncControls();
      bindThemeWatchers();
      applyPanelState(state.hudOpen);
      updateHudDashboard();
      cleanupPillDrag = initPillDrag(pill);
      if (state.hudOpen) searchInput.focus();
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
        searchDebounceTimer = null;
      }
      if (announceTimer !== null) {
        window.clearTimeout(announceTimer);
        announceTimer = null;
      }
      if (searchRefreshTimer !== null) {
        window.clearTimeout(searchRefreshTimer);
        searchRefreshTimer = null;
      }
      cleanupPillDrag?.();
      cleanupPillDrag = null;
      unbindThemeWatchers();
      document.getElementById(HUD_ID)?.remove();
      hudRootElement = null;
      hudShadowRoot = null;
      hudStats = null;
      searchInput = null;
      searchResultsBox = null;
      keepValue = null;
      messageLimitInput = null;
      themeSelect = null;
      advancedSettings = null;
      chkPrune = null;
      chkCollapse = null;
      chkVirtualFile = null;
      chkSidebarPeek = null;
      chkReasoning = null;
      chkTools = null;
      focusBeforeOpen = null;
      suppressPillClick = false;
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

  // scripts/ai-chat-turbo-engine/src/ui/text-preview.ts
  var TEXT_PREVIEW_MODAL_ID = "ai-turbo-vf-preview-modal";
  var TEXT_PREVIEW_CHAR_LIMIT = 12e3;
  var restoreFocusTarget = null;
  function closeTextPreview() {
    const modal = document.getElementById(TEXT_PREVIEW_MODAL_ID);
    if (!modal) return false;
    const target = restoreFocusTarget;
    modal.remove();
    restoreFocusTarget = null;
    if (target instanceof HTMLElement && target.isConnected) {
      target.focus({ preventScroll: true });
    }
    return true;
  }
  function copyWithTextarea(text) {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "readonly");
    area.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none;";
    document.body.appendChild(area);
    area.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    area.remove();
    return copied;
  }
  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
    }
    return copyWithTextarea(text);
  }
  function formatCount(value) {
    return value.toLocaleString("zh-CN");
  }
  function showTextPreview(options) {
    const { el, name, meta, content, note } = options;
    const fullText = content ?? "";
    const focusSource = document.activeElement;
    closeTextPreview();
    restoreFocusTarget = focusSource instanceof HTMLElement ? focusSource : null;
    const backdrop = el("div", {
      id: TEXT_PREVIEW_MODAL_ID,
      className: "ai-turbo-modal-backdrop ai-turbo-text-preview"
    });
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closeTextPreview();
    });
    const titleNode = el(
      "span",
      { className: "ai-turbo-text-preview-name", title: name },
      [name]
    );
    const metaNode = el("span", { className: "ai-turbo-text-preview-meta" }, [
      meta
    ]);
    const closeBtn = el(
      "button",
      {
        type: "button",
        className: "ai-turbo-text-preview-close",
        title: "关闭预览",
        "aria-label": "关闭预览"
      },
      ["✕"]
    );
    closeBtn.addEventListener("click", () => closeTextPreview());
    const header = el("div", { className: "ai-turbo-text-preview-header" }, [
      el("div", { className: "ai-turbo-text-preview-heading" }, [
        titleNode,
        metaNode
      ]),
      closeBtn
    ]);
    const body = el("pre", {
      className: "ai-turbo-text-preview-body",
      tabindex: "0"
    });
    const renderBody = (limit) => {
      body.textContent = fullText ? fullText.slice(0, limit) : "（这条消息里没有可预览的正文）";
    };
    renderBody(TEXT_PREVIEW_CHAR_LIMIT);
    const charCount = fullText.length;
    const lineCount = fullText ? fullText.split("\n").length : 0;
    const info = el("span", { className: "ai-turbo-text-preview-info" }, [
      `${formatCount(charCount)} 字符 · ${formatCount(lineCount)} 行`,
      ...note ? [` · ${note}`] : []
    ]);
    const actions = el("div", { className: "ai-turbo-text-preview-actions" });
    if (charCount > TEXT_PREVIEW_CHAR_LIMIT) {
      const expandBtn = el(
        "button",
        { type: "button", className: "ai-turbo-text-preview-action" },
        [`显示全部（${formatCount(charCount)} 字符）`]
      );
      expandBtn.addEventListener("click", () => {
        renderBody(charCount);
        expandBtn.remove();
      });
      actions.appendChild(expandBtn);
    }
    const copyBtn = el(
      "button",
      { type: "button", className: "ai-turbo-text-preview-action" },
      ["复制全部"]
    );
    copyBtn.addEventListener("click", () => {
      void copyText(fullText).then((copied) => {
        copyBtn.textContent = copied ? "已复制" : "复制失败";
        window.setTimeout(() => {
          if (copyBtn.isConnected) copyBtn.textContent = "复制全部";
        }, 1600);
      });
    });
    actions.appendChild(copyBtn);
    const footer = el("div", { className: "ai-turbo-text-preview-footer" }, [
      info,
      actions
    ]);
    const dialog = el(
      "div",
      {
        className: "ai-turbo-text-preview-dialog",
        role: "dialog",
        "aria-modal": "true",
        "aria-label": `${name} 预览`
      },
      [header, body, footer]
    );
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeTextPreview();
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = Array.from(
        dialog.querySelectorAll("button:not([disabled])")
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    closeBtn.focus({ preventScroll: true });
  }

  // scripts/ai-chat-turbo-engine/src/ui/chat-capsules.ts
  var GENERIC_PROMPTS = /* @__PURE__ */ new Set([
    "请查阅并分析以下文本内容：",
    "请查阅以下文本："
  ]);
  var BLOCK_TAGS = /* @__PURE__ */ new Set([
    "P",
    "DIV",
    "PRE",
    "LI",
    "BLOCKQUOTE",
    "TD",
    "SECTION",
    "ARTICLE",
    "CODE-BLOCK"
  ]);
  function escapePattern(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function createTokenPattern() {
    return new RegExp(
      `${escapePattern(VF_TOKEN_START)}([^|\\r\\n]+)\\|(\\d+)\\|(\\d+)${escapePattern(VF_TOKEN_END)}`,
      "g"
    );
  }
  var FENCE_WITH_LANG_TAIL = /(?:^|\n)[ \t]*`{3,}[a-z0-9_-]+[ \t]*$/i;
  var FENCE_TAIL = /(?:^|\n)[ \t]*`{3,}[ \t]*$/i;
  var FENCE_AFTER_PROMPT = /`{3,}[a-z0-9_-]+[ \t]*$/i;
  function dropFenceLine(text, pattern) {
    const next = text.replace(pattern, "");
    return next === text ? text : next.replace(/[ \t]+$/, "");
  }
  function stripWrapper(raw, options) {
    let text = raw.replace(/\r\n?/g, "\n").replace(/\s+$/, "");
    if (options.nextBlock) {
      text = dropFenceLine(text, FENCE_WITH_LANG_TAIL).replace(/\s+$/, "");
    }
    text = dropFenceLine(text, FENCE_TAIL);
    return text.replace(/^\n+/, "").replace(/\s+$/, "");
  }
  function parseChatVirtualFileMessage(source) {
    if (!source || !source.includes(VF_TOKEN_START)) return null;
    const pattern = createTokenPattern();
    const headers = [];
    let match = pattern.exec(source);
    while (match) {
      if (match[0]) headers.push(match);
      match = pattern.exec(source);
    }
    if (!headers.length) return null;
    const files = [];
    for (let index = 0; index < headers.length; index++) {
      const header = headers[index];
      const next = headers[index + 1];
      const bodyStart = header.index + header[0].length;
      files.push({
        name: (header[1] ?? "").trim() || "pasted_text.txt",
        lineCount: Number.parseInt(header[2] ?? "0", 10) || 0,
        sizeBytes: Number.parseInt(header[3] ?? "0", 10) || 0,
        content: stripWrapper(
          source.slice(bodyStart, next ? next.index : source.length),
          { nextBlock: Boolean(next) }
        )
      });
    }
    const prompt = dropFenceLine(
      stripWrapper(source.slice(0, headers[0].index), { nextBlock: true }),
      FENCE_AFTER_PROMPT
    ).trim();
    return {
      prompt: GENERIC_PROMPTS.has(prompt) ? "" : prompt,
      files
    };
  }
  function isBlockContainer(element) {
    if (BLOCK_TAGS.has(element.tagName)) return true;
    return element.classList.contains("query-text") || element.classList.contains("user-query-text");
  }
  function collectTokenContainers(turn) {
    const containers = [];
    const seen = /* @__PURE__ */ new Set();
    const walker = document.createTreeWalker(turn, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const value = node.nodeValue;
      if (value && value.includes(VF_TOKEN_START)) {
        let block = node.parentElement;
        while (block && block !== turn && !isBlockContainer(block)) {
          block = block.parentElement;
        }
        const container = block ?? turn;
        if (container instanceof HTMLElement && !seen.has(container)) {
          seen.add(container);
          containers.push(container);
        }
      }
      node = walker.nextNode();
    }
    return containers;
  }
  function turnShowsPrompt(turn, prompt, hidden) {
    if (!prompt) return false;
    const probe = prompt.slice(0, 60);
    const walker = document.createTreeWalker(turn, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const value = node.nodeValue;
      const parent = node.parentElement;
      if (value && parent && value.includes(probe)) {
        const insideHidden = hidden.some((node_) => node_.contains(parent));
        if (!insideHidden) return true;
      }
      node = walker.nextNode();
    }
    return false;
  }
  function createChatCapsuleUtils(deps) {
    const { el, withSelfMutation, state } = deps;
    let mounts = /* @__PURE__ */ new WeakMap();
    const trackedTurns = /* @__PURE__ */ new Set();
    function detachMount(turn) {
      const mount = mounts.get(turn);
      trackedTurns.delete(turn);
      mounts.delete(turn);
      if (!mount) return;
      withSelfMutation(() => {
        mount.row.remove();
        if (mount.prompt?.isConnected) mount.prompt.remove();
        for (const node of mount.hidden) {
          if (node.isConnected) restoreContainer(node);
        }
      });
    }
    function restoreContainer(container) {
      container.classList.remove("ai-turbo-chat-folded-target");
      container.style.removeProperty("display");
      container.style.removeProperty("contain");
    }
    function isMountHealthy(mount) {
      if (!mount.row.isConnected) return false;
      if (mount.expanded) {
        return mount.row.classList.contains("is-expanded") && mount.hidden.every(
          (node) => node.isConnected && node.classList.contains("ai-turbo-chat-folded-target") && node.style.getPropertyValue("display") !== "none"
        );
      }
      for (const node of mount.hidden) {
        if (!node.isConnected) return false;
        if (!node.classList.contains("ai-turbo-chat-folded-target")) {
          return false;
        }
        if (node.style.getPropertyValue("display") !== "none") return false;
      }
      return true;
    }
    function setExpanded(mount, expanded) {
      if (mount.expanded === expanded) return;
      withSelfMutation(() => {
        mount.expanded = expanded;
        mount.row.classList.toggle("is-expanded", expanded);
        mount.toggle.textContent = expanded ? "收起为文件" : "展开原文";
        mount.toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
        mount.toggle.title = expanded ? "把这段消息折叠回虚拟文件" : "显示这段消息的原始文本";
        for (const node of mount.hidden) {
          if (!node.isConnected) continue;
          if (expanded) {
            node.style.removeProperty("display");
            node.style.removeProperty("contain");
            continue;
          }
          node.style.setProperty("display", "none", "important");
          node.style.setProperty("contain", "strict", "important");
        }
        if (mount.prompt) {
          if (expanded) mount.prompt.style.setProperty("display", "none", "important");
          else mount.prompt.style.removeProperty("display");
        }
      });
    }
    function syncRowVisibility(turn, mount) {
      const collapsed = turn.classList.contains("ai-turbo-dehydrated");
      if (mount.collapsed === collapsed) return;
      withSelfMutation(() => {
        mount.collapsed = collapsed;
        if (collapsed) {
          mount.row.style.setProperty("display", "none", "important");
          return;
        }
        mount.row.style.removeProperty("display");
      });
    }
    function openPreview(turn, index, fallback) {
      const parsed = parseChatVirtualFileMessage(turn.textContent ?? "");
      const file = parsed?.files[index] ?? {
        name: fallback.name,
        lineCount: fallback.lineCount,
        sizeBytes: fallback.sizeBytes,
        content: ""
      };
      showTextPreview({
        el,
        name: file.name,
        meta: `${file.lineCount.toLocaleString("zh-CN")} 行 · ${(file.sizeBytes / 1024).toFixed(1)} KB`,
        content: file.content,
        note: file.content ? "来自你发送的消息" : "正文已不在页面中，重新打开这段对话后再试"
      });
    }
    function createCapsule(turn, file, index) {
      const metaInfo = `${file.lineCount.toLocaleString("zh-CN")} 行 · ${(file.sizeBytes / 1024).toFixed(1)} KB`;
      const capsule = el(
        "button",
        {
          type: "button",
          className: "ai-turbo-chat-capsule",
          title: `查看 ${file.name}`,
          "aria-label": `查看虚拟文件 ${file.name}，${metaInfo}`
        },
        [
          el("span", { className: "ai-turbo-chat-capsule-icon" }, [
            createUiIcon("file", 13)
          ]),
          el("span", { className: "ai-turbo-chat-capsule-name" }, [file.name]),
          el("span", { className: "ai-turbo-chat-capsule-meta" }, [metaInfo]),
          el("span", { className: "ai-turbo-chat-capsule-action" }, ["查看"])
        ]
      );
      capsule.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openPreview(turn, index, file);
      });
      return capsule;
    }
    function collapseInChatFileBlocks(turnElement) {
      if (!state.virtualFileEnabled) return;
      if (!(turnElement instanceof Element) || !turnElement.isConnected) return;
      const existing = mounts.get(turnElement);
      if (existing) {
        if (isMountHealthy(existing) && existing.fileCount > 0) {
          syncRowVisibility(turnElement, existing);
          return;
        }
        detachMount(turnElement);
      }
      const parsed = parseChatVirtualFileMessage(turnElement.textContent ?? "");
      if (!parsed) return;
      if (!parsed.files.some((file) => file.content.length > 0)) return;
      const containers = collectTokenContainers(turnElement);
      if (!containers.length) return;
      const mount = withSelfMutation(() => {
        for (const container of containers) {
          container.classList.add("ai-turbo-chat-folded-target");
          container.style.setProperty("display", "none", "important");
          container.style.setProperty("contain", "strict", "important");
        }
        const wholeTurnHidden = containers.includes(
          turnElement
        );
        const inlinePrompt = wholeTurnHidden || Boolean(parsed.prompt) && !turnShowsPrompt(turnElement, parsed.prompt, containers);
        let promptNode = null;
        if (inlinePrompt && !wholeTurnHidden) {
          promptNode = el("div", { className: "ai-turbo-chat-user-prompt" }, [
            parsed.prompt
          ]);
          containers[0].insertAdjacentElement("beforebegin", promptNode);
        }
        const row = el("div", {
          className: "ai-turbo-chat-file-row",
          role: "group",
          "aria-label": "虚拟文件"
        });
        const stack = el("div", { className: "ai-turbo-chat-file-stack" });
        if (inlinePrompt && wholeTurnHidden) {
          stack.appendChild(
            el("div", { className: "ai-turbo-chat-user-prompt" }, [
              parsed.prompt
            ])
          );
        }
        parsed.files.forEach((file, index) => {
          stack.appendChild(createCapsule(turnElement, file, index));
        });
        const toggle = el("button", {
          type: "button",
          className: "ai-turbo-chat-file-toggle",
          title: "显示这段消息的原始文本",
          "aria-expanded": "false"
        });
        toggle.textContent = "展开原文";
        stack.appendChild(toggle);
        toggle.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const mount2 = mounts.get(turnElement);
          if (mount2) setExpanded(mount2, !mount2.expanded);
        });
        row.appendChild(stack);
        turnElement.insertAdjacentElement("afterend", row);
        return {
          row,
          prompt: promptNode,
          hidden: containers,
          fileCount: parsed.files.length,
          collapsed: false,
          expanded: false,
          toggle
        };
      });
      mounts.set(turnElement, mount);
      trackedTurns.add(turnElement);
      syncRowVisibility(turnElement, mount);
    }
    function sweep(turns) {
      if (!trackedTurns.size) return;
      const live = new Set(turns);
      for (const turn of Array.from(trackedTurns)) {
        if (!state.virtualFileEnabled) {
          reset();
          return;
        }
        if (!turn.isConnected || !live.has(turn)) {
          detachMount(turn);
          continue;
        }
        const mount = mounts.get(turn);
        if (!mount) {
          trackedTurns.delete(turn);
          continue;
        }
        if (!isMountHealthy(mount)) {
          collapseInChatFileBlocks(turn);
          continue;
        }
        syncRowVisibility(turn, mount);
      }
    }
    function reset() {
      for (const turn of Array.from(trackedTurns)) {
        detachMount(turn);
      }
      trackedTurns.clear();
      mounts = /* @__PURE__ */ new WeakMap();
    }
    return { collapseInChatFileBlocks, sweep, reset };
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
        if (!tray || !tray.isConnected) {
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
      showTextPreview({
        el,
        name: fileItem.name,
        meta: `${fileItem.lineCount.toLocaleString("zh-CN")} 行 · ${(fileItem.size / 1024).toFixed(1)} KB`,
        content: fileItem.content,
        note: "发送时会提交完整文本"
      });
    }
    function readComposerText(inputElement) {
      if (!inputElement) return "";
      if (inputElement instanceof HTMLTextAreaElement) return inputElement.value;
      if (inputElement instanceof HTMLInputElement) return inputElement.value;
      return (inputElement.innerText || inputElement.textContent || "").replace(/\u00a0/g, " ");
    }
    function composerTextIsConvertible(inputElement) {
      return readComposerText(inputElement).trim().length >= VIRTUAL_FILE_THRESHOLD;
    }
    function handleComposerInput(target) {
      if (isEngineDormant2() || !state.virtualFileEnabled) return;
      if (!(target instanceof Node)) return;
      if (!isEditableTarget(target)) return;
      const input = composer.getChatInput();
      if (!input) return;
      if (!input.contains(target)) return;
      const wanted = activeVirtualFiles.length > 0 || composerTextIsConvertible(input);
      const present = document.getElementById("ai-turbo-vf-tray") !== null;
      if (wanted === present) return;
      trayIsDirty = true;
      renderVirtualFileTray();
    }
    function isEditableTarget(target) {
      if (target instanceof HTMLTextAreaElement) return true;
      if (target instanceof HTMLInputElement) return true;
      return target instanceof HTMLElement && target.isContentEditable;
    }
    function buildVirtualFile(text, prefix) {
      const size = new Blob([text]).size;
      const kbSize = (size / 1024).toFixed(1);
      return {
        id: `vf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: `${prefix}_${kbSize}kb.txt`,
        size,
        charCount: text.length,
        lineCount: fastCountLines(text),
        content: text,
        timestamp: Date.now()
      };
    }
    function moveComposerTextToFiles() {
      const input = composer.getChatInput();
      if (!input) return false;
      const text = readComposerText(input).trim();
      if (!text) return false;
      activeVirtualFiles.push(buildVirtualFile(text, "composer_text"));
      suspendObservers();
      withSelfMutation(() => {
        composer.insertTextAtomic(input, "");
      });
      updateHudDashboard();
      trayIsDirty = true;
      renderVirtualFileTray();
      return true;
    }
    function convertFileToText(fileItem) {
      const input = composer.getChatInput();
      if (!input) return;
      const current = readComposerText(input).trim();
      const next = current ? `${current}

${fileItem.content}` : fileItem.content;
      suspendObservers();
      withSelfMutation(() => {
        composer.insertTextAtomic(input, next);
      });
      removeVirtualFile(fileItem.id);
    }
    function renderVirtualFileTray() {
      let tray = document.getElementById("ai-turbo-vf-tray");
      resetVirtualFileTraySignature();
      const input = composer.getChatInput();
      const convertOnly = activeVirtualFiles.length === 0;
      if (convertOnly && (!state.virtualFileEnabled || isEngineDormant2() || !composerTextIsConvertible(input))) {
        const currentTray = tray;
        if (currentTray) {
          withSelfMutation(() => currentTray.remove());
        }
        stopVirtualFileTrayTracking();
        trayIsDirty = false;
        updateHudDashboard();
        return;
      }
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
        const headingChildren = [
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
          )
        ];
        if (activeVirtualFiles.length) {
          headingChildren.push(
            el(
              "span",
              {
                className: "ai-turbo-vf-heading-count"
              },
              [`${activeVirtualFiles.length}`]
            )
          );
        }
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
              headingChildren
            ),
            el(
              "div",
              {
                className: "ai-turbo-vf-header-actions"
              },
              [
                el(
                  "span",
                  {
                    className: "ai-turbo-vf-heading-hint"
                  },
                  [
                    activeVirtualFiles.length ? "发送时作为上下文附加" : "输入框里有长文本"
                  ]
                ),
                el(
                  "button",
                  {
                    type: "button",
                    className: "ai-turbo-vf-convert-composer",
                    title: "把输入框里的文本收进虚拟文件",
                    "aria-label": "把输入框里的文本转为虚拟文件"
                  },
                  ["文本转文件"]
                )
              ]
            )
          ]
        );
        const fileList = el("div", {
          className: "ai-turbo-vf-list"
        });
        tray.appendChild(header);
        tray.appendChild(fileList);
        header.querySelector(".ai-turbo-vf-convert-composer")?.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          moveComposerTextToFiles();
        });
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
          const btnConvert = el(
            "button",
            {
              type: "button",
              className: "ai-turbo-vf-action ai-turbo-vf-action-label ai-turbo-vf-action-convert",
              title: "把该文件放回输入框作为普通文本",
              "aria-label": `将 ${item.name} 转为普通文本`
            },
            ["转文本"]
          );
          btnConvert.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            convertFileToText(item);
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
                [btnPreview, btnConvert, btnDelete]
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
      handleComposerInput,
      fuseAndSubmit
    };
  }

  // scripts/ai-chat-turbo-engine/src/ui/styles.ts
  var GEMINI_NATIVE_RENDER_CSS = `
    model-response :is(.markdown, message-content, .message-content, .response-content, .md-content, .model-response-text) > * {
      content-visibility: auto !important;
      contain: layout style !important;
      contain-intrinsic-size: auto 3rem !important;
    }

    model-response :is(.markdown, message-content, .message-content, .response-content, .md-content, .model-response-text) > :is(pre, table, blockquote) {
      contain-intrinsic-size: auto 8rem !important;
    }

    model-response :is(.markdown, message-content, .message-content, .response-content, .md-content, .model-response-text) > :is(img, video, canvas, iframe) {
      contain-intrinsic-size: auto 12rem !important;
    }

    model-response code-block {
      content-visibility: auto !important;
      contain: layout style !important;
      contain-intrinsic-size: auto 10rem !important;
    }

    /* Frosted panels blur the page underneath on every repaint. Long answers
       repaint continuously, so the native glass costs more than it shows. */
    :is(top-bar, top-bar-actions, input-area, input-area-v2, side-navigation, chat-window, mat-toolbar, code-block, .top-bar, .input-area, .toolbar) {
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }

    /* Streaming markdown ships decorative transitions and animations that
       restart with every appended token. */
    model-response :is(.markdown, message-content, .message-content, .response-content, .md-content, .model-response-text),
    model-response :is(.markdown, message-content, .message-content, .response-content, .md-content, .model-response-text) * {
      animation: none !important;
      transition: none !important;
      will-change: auto !important;
    }

    /* The history sidebar animates its width, so every frame of that motion
       relayouts the chat column while the panel shadow and glass repaint. Keep
       the native width animation, shorten it, and drop the depth effects that
       only add paint. */
    bard-sidenav,
    bard-sidenav side-navigation,
    side-navigation,
    side-navigation-content,
    sidenav-with-history-container,
    conversations-list {
      box-shadow: none !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }

    bard-sidenav {
      transition-duration: 120ms !important;
      transition-timing-function: cubic-bezier(0.2, 0, 0, 1) !important;
    }

    /* Layout containment keeps an opening list from invalidating siblings
       outside the panel. Render skipping stays off here: an estimated
       contain-intrinsic-size would make the scroll height of the history list
       jump while rows mount. */
    side-navigation-content,
    sidenav-with-history-container,
    conversations-list,
    conversations-list > * {
      contain: layout style !important;
    }
`;
  var SIDEBAR_PEEK_CSS = `
    [data-ai-turbo-sidebar-peek] {
      width: var(--ai-turbo-sidebar-peek-width, 248px) !important;
      /* Sites that pin the rail with a min/max pair or a content box would
         keep the old geometry, so the peek speaks the same three properties. */
      min-width: var(--ai-turbo-sidebar-peek-width, 248px) !important;
      max-width: var(--ai-turbo-sidebar-peek-width, 248px) !important;
      box-sizing: border-box !important;
      /* Doubao and Qianwen paint a site header above the rail; a raised
         stacking level lets the peeked rail take the pointer there. */
      z-index: 120 !important;
      /* Only the shadow animates. Width has to stay instant: a width
         transition relayouts the whole chat column on every frame. */
      transition: box-shadow 120ms ease-out !important;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18) !important;
    }

    /* The shadow reads as "this panel is a temporary overlay", but users who
       asked for less motion get the plain instant rail. */
    @media (prefers-reduced-motion: reduce) {
      [data-ai-turbo-sidebar-peek] {
        transition: none !important;
      }
    }

    /* The rail's own width is pinned by the rules above, but sites animate
       nested wrappers (Z.ai's w-[238px] block, Poe's category list) while the
       panel collapses after a click. The peek silences the whole subtree for
       the restored layout, then hands the declarations back to the site, so
       the panel closes in one frame instead of crawling over the transcript. */
    [data-ai-turbo-sidebar-peek-hold],
    [data-ai-turbo-sidebar-peek-hold] * {
      transition: none !important;
    }

    [data-ai-turbo-sidebar-peek="left"] {
      margin-right: var(--ai-turbo-sidebar-peek-shift, 0px) !important;
    }

    [data-ai-turbo-sidebar-peek="right"] {
      margin-left: var(--ai-turbo-sidebar-peek-shift, 0px) !important;
    }

    /* DeepSeek disables the hidden rail as a whole, so re-enabling only the
       rail box would still leave every entry inert. A rail that peeks is
       meant to be used, so its controls accept presses for that moment. */
    [data-ai-turbo-sidebar-peek],
    [data-ai-turbo-sidebar-peek] * {
      pointer-events: auto !important;
    }

    /* ChatGPT keeps the expanded panel mounted at opacity 0 next to the rail.
       Its inner scroller is lifted by the peek module because that node holds
       an inline hidden-display rule, which a stylesheet cannot beat. */
    aside.app-shell-left-panel[data-ai-turbo-sidebar-peek] #app-shell-sidebar > div:nth-child(2) {
      opacity: 1 !important;
      pointer-events: auto !important;
      transition: none !important;
    }

    /* Qwen hides history rows through visibility on their wrapper levels, so
       every level between the rail and the title has to re-enter. */
    #sidebar.sidebar[data-ai-turbo-sidebar-peek] {
      max-width: var(--ai-turbo-sidebar-peek-width, 240px) !important;
    }

    #sidebar.sidebar[data-ai-turbo-sidebar-peek] :is(.session-list-wrapper, .sidebar-entry-list-content) {
      visibility: visible !important;
      opacity: 1 !important;
      transition: none !important;
    }

    #sidebar.sidebar[data-ai-turbo-sidebar-peek] :is(.sidebar-entry-list-text, .chat-item-title-text, .folder-name) {
      visibility: visible !important;
      opacity: 1 !important;
      transition: none !important;
    }

    /* ChatGLM shrinks every entry to its icon and removes the label box. */
    aside.el-aside.aside-container[data-ai-turbo-sidebar-peek] :is(.aside-subject, .aside-subjects) {
      width: auto !important;
    }

    aside.el-aside.aside-container[data-ai-turbo-sidebar-peek] .subject-text {
      display: flex !important;
      transition: none !important;
    }

    /* Z.ai pins its inner shell to the collapsed width and blurs labels. */
    #sidebar[data-ai-turbo-sidebar-peek] > [role="presentation"] {
      width: var(--ai-turbo-sidebar-peek-width, 238px) !important;
      transition: none !important;
    }

    #sidebar[data-ai-turbo-sidebar-peek] [data-slot="sidebar-label"] {
      max-width: none !important;
      opacity: 1 !important;
      filter: none !important;
      transition: none !important;
    }

    #sidebar[data-ai-turbo-sidebar-peek] [data-testid="sidebar-scroll-region"] {
      opacity: 1 !important;
      transition: none !important;
    }

    #sidebar[data-ai-turbo-sidebar-peek] [role="presentation"] :is(button.w-full, a.w-full) {
      width: 100% !important;
      transition: none !important;
    }

    /* Perplexity clips its nav at the collapsed width inside the spacing
       wrapper, so the wrapper rule alone keeps the labels cut off. */
    div.w-sideBarWidth[data-ai-turbo-sidebar-peek] nav {
      width: var(--ai-turbo-sidebar-peek-width, 240px) !important;
      transition: none !important;
    }

    /* Poe clips each row to its icon button while the rail is narrow, which
       removes the label box from layout. The rows only need their text back;
       the rail width and its negative margin come from the generic rules. */
    aside[class*="SidebarLayout_sidebar"][data-ai-turbo-sidebar-peek] [data-pdl-sidebar-menu-button] {
      gap: 8px !important;
    }

    aside[class*="SidebarLayout_sidebar"][data-ai-turbo-sidebar-peek] [data-pdl-sidebar-menu-button] > span {
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      white-space: nowrap !important;
      overflow: hidden !important;
    }

    /* Gemini renders its history only after the native open control runs; the
       peek presses it and caps the expansion, so the container is sized for
       both the collapsed and the opened state and the transition is off. */
    bard-sidenav[data-ai-turbo-sidebar-peek] .sidenav-with-history-container {
      width: var(--ai-turbo-sidebar-peek-width, 248px) !important;
      min-width: var(--ai-turbo-sidebar-peek-width, 248px) !important;
      max-width: var(--ai-turbo-sidebar-peek-width, 248px) !important;
      transition: none !important;
    }

    bard-sidenav[data-ai-turbo-sidebar-peek] .sidenav-with-history-container.collapsed :is(.label-and-badge, .title-text) {
      visibility: visible !important;
      opacity: 1 !important;
      transition: none !important;
    }

    /* Gemini hides the whole history scroller while collapsed, so restoring a
       single label is not enough; the list itself has to re-enter the flow. */
    bard-sidenav[data-ai-turbo-sidebar-peek] .sidenav-with-history-container.collapsed infinite-scroller,
    bard-sidenav[data-ai-turbo-sidebar-peek] .sidenav-with-history-container.collapsed infinite-scroller * {
      visibility: visible !important;
      opacity: 1 !important;
    }

    bard-sidenav[data-ai-turbo-sidebar-peek] .sidenav-with-history-container.collapsed mat-nav-list {
      display: flex !important;
      flex-direction: column !important;
      transition: none !important;
    }

    /* Copilot pins the rail width with !important inside its application
       cascade layer, which outranks every unlayered !important declaration.
       Only a layered !important can win, so these rules join the site's first
       layer: foundation already holds that position, so the site's own layer
       order stays exactly as declared whether this sheet is parsed before or
       after the site styles. The rail's own rail-width variable has to move
       as well, otherwise the drawer body keeps the collapsed geometry even
       when the outer box grows. */
    @layer foundation {
      div.fui-NavDrawer[data-ai-turbo-sidebar-peek] {
        --m365-nav-rail-width: var(--ai-turbo-sidebar-peek-width, 256px);
        width: var(--ai-turbo-sidebar-peek-width, 256px) !important;
        min-width: var(--ai-turbo-sidebar-peek-width, 256px) !important;
        max-width: var(--ai-turbo-sidebar-peek-width, 256px) !important;
      }

      div.fui-NavDrawer[data-ai-turbo-sidebar-peek] .fui-NavDrawerBody {
        width: auto !important;
        transition: none !important;
      }

      div.fui-NavDrawer[data-ai-turbo-sidebar-peek] a.fui-NavItem {
        min-width: 0 !important;
        max-width: none !important;
        transition: none !important;
      }
    }

    /* The collapsed drawer removes the label box from layout. */
    div.fui-NavDrawer[data-ai-turbo-sidebar-peek] a.fui-NavItem > span:last-child {
      display: block !important;
      opacity: 1 !important;
      transition: none !important;
    }
`;
  var BASE_ENGINE_CSS = `
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

    .ai-turbo-vf-header-actions {
      display: inline-flex !important;
      align-items: center !important;
      gap: 8px !important;
      min-width: 0 !important;
    }

    .ai-turbo-vf-convert-composer {
      appearance: none !important;
      -webkit-appearance: none !important;
      flex: 0 0 auto !important;
      padding: 3px 8px !important;
      border: 1px solid rgba(101, 210, 164, 0.28) !important;
      border-radius: 999px !important;
      background: rgba(101, 210, 164, 0.07) !important;
      color: #86d8b4 !important;
      font: 600 10px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      cursor: pointer !important;
    }

    .ai-turbo-vf-convert-composer:hover,
    .ai-turbo-vf-convert-composer:focus-visible {
      border-color: rgba(101, 210, 164, 0.55) !important;
      background: rgba(101, 210, 164, 0.14) !important;
      color: #d8f0e5 !important;
      outline: none !important;
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

    .ai-turbo-vf-action-label {
      width: auto !important;
      padding: 0 7px !important;
      font: 600 10px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      white-space: nowrap !important;
    }

    .ai-turbo-vf-action-convert:hover {
      color: #86d8b4 !important;
      background: rgba(101, 210, 164, 0.09) !important;
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
      appearance: none !important;
      -webkit-appearance: none !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 8px !important;
      min-width: 0 !important;
      padding: 6px 10px 6px 11px !important;
      margin: 0 !important;
      max-width: 100% !important;
      background: #111619 !important;
      border: 1px solid rgba(153, 166, 161, 0.18) !important;
      border-left: 2px solid rgba(101, 210, 164, 0.7) !important;
      border-radius: 10px !important;
      box-shadow: 0 5px 16px rgba(0, 0, 0, 0.16) !important;
      color: #e7eeea !important;
      font: inherit !important;
      text-align: left !important;
      cursor: pointer !important;
      user-select: none !important;
      transition:
        border-color 120ms ease,
        background 120ms ease !important;
    }

    .ai-turbo-chat-capsule-icon {
      flex: 0 0 auto !important;
      display: inline-flex !important;
      color: #72d6ab !important;
    }

    .ai-turbo-chat-capsule-name {
      min-width: 0 !important;
      max-width: 260px !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
      color: #f1f5f9 !important;
      font: 600 12px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace !important;
    }

    .ai-turbo-chat-capsule-meta {
      flex: 0 0 auto !important;
      padding: 2px 6px !important;
      border-radius: 4px !important;
      background: rgba(101, 210, 164, 0.12) !important;
      color: #72d6ab !important;
      font: 10px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace !important;
      white-space: nowrap !important;
    }

    .ai-turbo-chat-capsule-action {
      flex: 0 0 auto !important;
      padding-left: 8px !important;
      border-left: 1px solid rgba(153, 166, 161, 0.16) !important;
      color: #9fb3ab !important;
      font: 600 11px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      white-space: nowrap !important;
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

    .ai-turbo-chat-file-stack {
      display: flex !important;
      flex-direction: column !important;
      align-items: flex-end !important;
      gap: 6px !important;
      min-width: 0 !important;
      max-width: 100% !important;
    }

    .ai-turbo-chat-user-prompt {
      max-width: 100% !important;
      margin: 0 0 2px !important;
      color: inherit !important;
      font: inherit !important;
      line-height: 1.5 !important;
      white-space: pre-wrap !important;
      overflow-wrap: anywhere !important;
      text-align: left !important;
      user-select: text !important;
    }

    .ai-turbo-chat-file-row .ai-turbo-chat-capsule {
      flex: 0 1 auto !important;
      min-width: 0 !important;
      max-width: min(680px, 100%) !important;
    }

    .ai-turbo-chat-file-toggle {
      appearance: none !important;
      -webkit-appearance: none !important;
      align-self: flex-end !important;
      margin: 0 !important;
      padding: 3px 8px !important;
      background: transparent !important;
      border: 1px solid rgba(153, 166, 161, 0.2) !important;
      border-radius: 999px !important;
      color: #9fb3ab !important;
      font: 600 11px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      cursor: pointer !important;
      user-select: none !important;
    }

    .ai-turbo-chat-file-toggle:hover,
    .ai-turbo-chat-file-toggle:focus-visible {
      border-color: rgba(101, 210, 164, 0.45) !important;
      color: #d8e1dc !important;
      outline: none !important;
    }

    .ai-turbo-chat-file-toggle:focus-visible {
      box-shadow: 0 0 0 2px rgba(101, 210, 164, 0.4) !important;
    }

    .ai-turbo-chat-capsule:hover,
    .ai-turbo-chat-capsule:focus-visible {
      border-color: rgba(101, 210, 164, 0.42) !important;
      background: #161d21 !important;
      outline: none !important;
    }

    .ai-turbo-chat-capsule:focus-visible {
      box-shadow:
        0 0 0 2px rgba(101, 210, 164, 0.45),
        0 5px 16px rgba(0, 0, 0, 0.16) !important;
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

    .ai-turbo-text-preview-dialog {
      display: flex !important;
      flex-direction: column !important;
      width: 760px !important;
      max-width: 94vw !important;
      max-height: 86vh !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
      background: #0d121c !important;
      border: 1px solid rgba(101, 210, 164, 0.32) !important;
      border-radius: 14px !important;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.85) !important;
      color: #cbd5e1 !important;
      font: 12px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
    }

    .ai-turbo-text-preview-header {
      flex: 0 0 auto !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 12px !important;
      padding: 12px 14px 12px 18px !important;
      border-bottom: 1px solid rgba(153, 166, 161, 0.15) !important;
      background: rgba(18, 24, 38, 0.98) !important;
    }

    .ai-turbo-text-preview-heading {
      min-width: 0 !important;
      display: flex !important;
      align-items: baseline !important;
      gap: 10px !important;
    }

    .ai-turbo-text-preview-name {
      min-width: 0 !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
      color: #f8fafc !important;
      font: 600 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace !important;
    }

    .ai-turbo-text-preview-meta {
      flex: 0 0 auto !important;
      color: #72d6ab !important;
      font: 10.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace !important;
      white-space: nowrap !important;
    }

    .ai-turbo-text-preview-close {
      flex: 0 0 auto !important;
      appearance: none !important;
      -webkit-appearance: none !important;
      padding: 4px 7px !important;
      border: 0 !important;
      border-radius: 6px !important;
      background: transparent !important;
      color: #94a3b8 !important;
      font: 15px/1 sans-serif !important;
      cursor: pointer !important;
    }

    .ai-turbo-text-preview-close:hover {
      color: #e2e8f0 !important;
      background: rgba(255, 255, 255, 0.08) !important;
    }

    .ai-turbo-text-preview-body {
      flex: 1 1 auto !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 16px !important;
      overflow: auto !important;
      background: rgba(5, 8, 15, 0.7) !important;
      color: #cbd5e1 !important;
      font: 12px/1.65 ui-monospace, SFMono-Regular, Menlo, monospace !important;
      white-space: pre-wrap !important;
      overflow-wrap: anywhere !important;
      tab-size: 4 !important;
      user-select: text !important;
    }

    .ai-turbo-text-preview-footer {
      flex: 0 0 auto !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 12px !important;
      padding: 10px 14px 10px 18px !important;
      border-top: 1px solid rgba(153, 166, 161, 0.15) !important;
      background: rgba(18, 24, 38, 0.98) !important;
    }

    .ai-turbo-text-preview-info {
      min-width: 0 !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
      color: #64748b !important;
      font: 11px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
    }

    .ai-turbo-text-preview-actions {
      flex: 0 0 auto !important;
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
    }

    .ai-turbo-text-preview-action {
      appearance: none !important;
      -webkit-appearance: none !important;
      padding: 5px 12px !important;
      border: 1px solid rgba(153, 166, 161, 0.2) !important;
      border-radius: 7px !important;
      background: rgba(255, 255, 255, 0.06) !important;
      color: #e2e8f0 !important;
      font: 11px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      cursor: pointer !important;
      white-space: nowrap !important;
    }

    .ai-turbo-text-preview-action:hover {
      border-color: rgba(101, 210, 164, 0.36) !important;
      color: #72d6ab !important;
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
  function injectEngineStyles(options = {}) {
    const baseCss = `${BASE_ENGINE_CSS}
${SIDEBAR_PEEK_CSS}`;
    const css = options.geminiNativeRender ? `${baseCss}
${GEMINI_NATIVE_RENDER_CSS}` : baseCss;
    const existingStyle = document.getElementById(STYLE_ID);
    if (existingStyle?.isConnected) {
      if (existingStyle.textContent !== css) existingStyle.textContent = css;
      return;
    }
    existingStyle?.remove();
    const styleElement = document.createElement("style");
    styleElement.id = STYLE_ID;
    styleElement.textContent = css;
    (document.head || document.documentElement).appendChild(styleElement);
  }

  // scripts/ai-chat-turbo-engine/src/lifecycle.ts
  function initializeEngine() {
    const VERSION = readUserscriptInfo(globalThis)?.script.version ?? "0.0.0";
    const detectedPlatform = detectPlatform();
    if (!detectedPlatform) return;
    const currentPlatform = detectedPlatform;
    const injectStyles = () => injectEngineStyles({
      geminiNativeRender: currentPlatform.nativeTurnRoots === true
    });
    const {
      clearRenderedCache,
      extractTurnText,
      filterOutNested,
      getActiveTurnSelectors,
      getTurnRole,
      getTurns,
      invalidateActiveTurnSelectorGroup,
      invalidateTurnCache,
      isGeminiThoughtElement,
      isUserTurn
    } = createTurnUtils(currentPlatform);
    const state = createEngineState();
    const motionQuiet = createMotionQuiet({
      onQuietEnd: () => {
        if (isEngineDormant()) return;
        fullTurnSyncRequested = true;
        requestUpdate();
      }
    });
    const sidebarPeek = createSidebarPeek({
      sidebar: currentPlatform.sidebar ?? null,
      enabled: () => state.sidebarPeekEnabled
    });
    const turnTextIndex = createTurnTextIndex({ extract: extractTurnText });
    const navigationTracker = createNavigationTracker(window.location);
    const restoredTurns = /* @__PURE__ */ new Set();
    const dehydratedTurns = /* @__PURE__ */ new Set();
    let isSubmitting = false;
    let observer = null;
    let scheduleTimer = null;
    let textIndexTimer = null;
    let textIndexFrame = null;
    let codeScanTimer = null;
    let turnDiscoveryTimer = null;
    let lastUpdateTime = 0;
    let lastCodeScanTime = 0;
    let fullTurnSyncRequested = true;
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
      state
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
      },
      flushTextIndex
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
      markRestoredTurn: (turnElement) => restoredTurns.add(turnElement),
      flushTextIndex: () => flushTextIndex({ force: true }),
      activeFileCount: () => virtualFiles.activeFileCount(),
      clearFiles: () => virtualFiles.clearFiles(),
      syncSidebarPeek: () => sidebarPeek.syncEnabled(),
      injectStyles
    });
    function scheduleTrayPosition() {
      virtualFiles.schedulePosition();
    }
    const IGNORED_MUTATION_TARGET_SELECTOR = "#" + HUD_ID + ", .ai-turbo-code-bar, #ai-turbo-vf-tray, .ai-turbo-chat-capsule, #ai-turbo-vf-preview-modal";
    function isIgnoredMutationTarget(target) {
      return Boolean(target.closest(IGNORED_MUTATION_TARGET_SELECTOR));
    }
    function reconcileTurnIndex() {
      const turns = getTurns();
      const liveTurns = new Set(turns);
      for (const restoredTurn of restoredTurns) {
        if (!liveTurns.has(restoredTurn)) restoredTurns.delete(restoredTurn);
      }
      for (const dehydratedTurn of dehydratedTurns) {
        if (!liveTurns.has(dehydratedTurn)) dehydratedTurns.delete(dehydratedTurn);
      }
      const addedTurns = turns.filter((turn) => !turnTextIndex.hasTurn(turn));
      turnTextIndex.reconcile(turns);
      for (const turnElement of addedTurns) {
        chatCapsules.collapseInChatFileBlocks(turnElement);
      }
      chatCapsules.sweep(turns);
      state.totalTurns = turns.length;
      state.indexedTurns = turnTextIndex.getRecords();
      return turns;
    }
    function syncTurnIndex() {
      const turns = reconcileTurnIndex();
      const cutoff = state.pruneEnabled ? Math.max(0, turns.length - state.keepTurns) : 0;
      const toDehydrate = [];
      const toHydrate = [];
      turns.forEach((turnElement, index) => {
        const shouldDehydrate = state.pruneEnabled && index < cutoff && !restoredTurns.has(turnElement);
        const isDehydrated = turnElement.classList.contains(
          "ai-turbo-dehydrated"
        );
        if (shouldDehydrate && !isDehydrated) {
          if (turnElement instanceof HTMLElement) toDehydrate.push(turnElement);
          return;
        }
        const leftDehydration = !isDehydrated && dehydratedTurns.has(turnElement);
        if (!shouldDehydrate && isDehydrated || leftDehydration) {
          if (turnElement instanceof HTMLElement) toHydrate.push(turnElement);
        }
      });
      const heights = toDehydrate.map(
        (turnElement) => turnElement.offsetHeight || 120
      );
      withSelfMutation(() => {
        for (let index = 0; index < toDehydrate.length; index++) {
          toDehydrate[index].style.setProperty(
            "--turbo-cached-h",
            String(heights[index]) + "px"
          );
          toDehydrate[index].classList.add("ai-turbo-dehydrated");
        }
        for (const turnElement of toHydrate) {
          turnElement.classList.remove("ai-turbo-dehydrated");
          turnElement.style.removeProperty("--turbo-cached-h");
        }
      });
      for (const turnElement of toDehydrate) {
        dehydratedTurns.add(turnElement);
        codeBlocks.suspendTurnCodeBlocks(turnElement);
      }
      for (const turnElement of toHydrate) {
        dehydratedTurns.delete(turnElement);
        codeBlocks.requestCodeScanForTurn(turnElement);
      }
      state.hiddenCount = turns.reduce(
        (count, turnElement) => count + Number(turnElement.classList.contains("ai-turbo-dehydrated")),
        0
      );
      if (turnTextIndex.pendingCount() > 0) requestTextIndexSoon();
    }
    function findIndexedTurnAncestor(mutationNode) {
      let ancestor = mutationNode instanceof Element ? mutationNode : mutationNode.parentElement;
      while (ancestor) {
        if (turnTextIndex.hasTurn(ancestor)) return ancestor;
        ancestor = ancestor.parentElement;
      }
      return null;
    }
    function runTextIndexFrame() {
      if (isEngineDormant()) return;
      const remaining = turnTextIndex.flush({
        budgetMs: TEXT_INDEX_FRAME_BUDGET
      });
      if (remaining > 0) {
        textIndexFrame = window.requestAnimationFrame(() => {
          textIndexFrame = null;
          runTextIndexFrame();
        });
        return;
      }
      hud?.updateHudDashboard();
    }
    function requestTextIndexSoon() {
      if (textIndexTimer !== null || textIndexFrame !== null) return;
      textIndexTimer = window.setTimeout(() => {
        textIndexTimer = null;
        runTextIndexFrame();
      }, TEXT_INDEX_INTERVAL);
    }
    function flushTextIndex(options = {}) {
      if (isEngineDormant()) return 0;
      reconcileTurnIndex();
      if (options.force === true) {
        const remaining2 = turnTextIndex.flush();
        hud?.updateHudDashboard();
        return remaining2;
      }
      const remaining = turnTextIndex.flush({
        budgetMs: TEXT_INDEX_FRAME_BUDGET
      });
      if (remaining > 0 && textIndexTimer === null && textIndexFrame === null) {
        textIndexFrame = window.requestAnimationFrame(() => {
          textIndexFrame = null;
          runTextIndexFrame();
        });
      }
      hud?.updateHudDashboard();
      return remaining;
    }
    function scheduleCodeScan() {
      if (codeScanTimer !== null) return;
      const elapsed = performance.now() - lastCodeScanTime;
      codeScanTimer = window.setTimeout(() => {
        codeScanTimer = null;
        if (isEngineDormant()) return;
        lastCodeScanTime = performance.now();
        codeBlocks.flushCodeBlockScan();
        hud?.updateHudDashboard();
        if (codeBlocks.isCodeScanPending()) scheduleCodeScan();
      }, Math.max(0, CODE_SCAN_INTERVAL - elapsed));
    }
    function handleMutationRecords(records) {
      const classification = classifyMutations(records, {
        turnSelector: getActiveTurnSelectors().join(","),
        isIgnoredTarget: isIgnoredMutationTarget,
        findTurnAncestor: findIndexedTurnAncestor
      });
      if (classification.turnStructureChanged) {
        invalidateActiveTurnSelectorGroup();
        fullTurnSyncRequested = true;
      }
      if (classification.requestUpdate || classification.turnStructureChanged) {
        invalidateTurnCache();
      }
      if (classification.dirtyTurns.size > 0) {
        for (const turnElement of classification.dirtyTurns) {
          turnTextIndex.markDirty(turnElement);
        }
        requestTextIndexSoon();
      }
      if (classification.codeRoots.size > 0) {
        codeBlocks.markCodeSubtreesDirty(classification.codeRoots);
        scheduleCodeScan();
      }
      if (classification.requestUpdate) requestUpdate();
    }
    function syncTurnDiscoveryFallback() {
      if (state.totalTurns > 0) {
        if (turnDiscoveryTimer !== null) {
          window.clearInterval(turnDiscoveryTimer);
          turnDiscoveryTimer = null;
        }
        return;
      }
      if (turnDiscoveryTimer !== null) return;
      turnDiscoveryTimer = window.setInterval(() => {
        if (isEngineDormant()) return;
        if (state.totalTurns > 0) {
          if (turnDiscoveryTimer !== null) {
            window.clearInterval(turnDiscoveryTimer);
            turnDiscoveryTimer = null;
          }
          return;
        }
        invalidateActiveTurnSelectorGroup();
        requestUpdate();
      }, TURN_DISCOVERY_RETRY_INTERVAL);
    }
    function resetTurnIndexForNavigation() {
      invalidateActiveTurnSelectorGroup();
      turnTextIndex.clear();
      restoredTurns.clear();
      dehydratedTurns.clear();
      fullTurnSyncRequested = true;
    }
    function applyRouteNavigation() {
      if (!navigationTracker.observe(window.location)) return false;
      resetTurnIndexForNavigation();
      codeBlocks.requestCodeScan();
      requestUpdate();
      return true;
    }
    function runScheduledUpdate() {
      scheduleTimer = null;
      if (motionQuiet.isQuiet()) {
        fullTurnSyncRequested = true;
        return;
      }
      lastUpdateTime = performance.now();
      clearRenderedCache();
      if (isEngineDormant()) return;
      if (selfMutationDepth > 0) {
        requestUpdate();
        return;
      }
      const structuralSync = fullTurnSyncRequested;
      fullTurnSyncRequested = false;
      syncTurnIndex();
      if (structuralSync) syncTurnDiscoveryFallback();
      if (codeBlocks.isCodeScanPending()) scheduleCodeScan();
      toolMemory.maybeRestore();
      hud?.updateHudDashboard();
      hud?.ensureHUDMounted();
      if (virtualFiles.isTrayDirty()) virtualFiles.renderVirtualFileTray();
    }
    function requestUpdate() {
      if (motionQuiet.isQuiet()) {
        fullTurnSyncRequested = true;
        return;
      }
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
        if (motionQuiet.isQuiet()) {
          fullTurnSyncRequested = true;
          return;
        }
        handleMutationRecords(records);
      });
      observer.observe(observeRoot, {
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: Array.from(TURN_MARKER_ATTRIBUTES),
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
          if (!applyRouteNavigation()) return;
          reasoning.scheduleReasoningRestore();
          toolMemory.scheduleRestore();
        }, 0);
        return result;
      };
      history.replaceState = function(...args) {
        const result = originalReplaceState.apply(this, args);
        window.setTimeout(() => {
          if (syncEngineActivation()) return;
          applyRouteNavigation();
        }, 0);
        return result;
      };
      window.addEventListener("popstate", () => {
        if (syncEngineActivation()) return;
        if (!applyRouteNavigation()) return;
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
      motionQuiet.teardown();
      sidebarPeek.teardown();
      if (scheduleTimer) {
        window.cancelAnimationFrame(scheduleTimer);
        window.clearTimeout(scheduleTimer);
        scheduleTimer = null;
      }
      if (textIndexTimer !== null) {
        window.clearTimeout(textIndexTimer);
        textIndexTimer = null;
      }
      if (textIndexFrame !== null) {
        window.cancelAnimationFrame(textIndexFrame);
        textIndexFrame = null;
      }
      if (codeScanTimer !== null) {
        window.clearTimeout(codeScanTimer);
        codeScanTimer = null;
      }
      if (turnDiscoveryTimer !== null) {
        window.clearInterval(turnDiscoveryTimer);
        turnDiscoveryTimer = null;
      }
      turnTextIndex.clear();
      restoredTurns.clear();
      dehydratedTurns.clear();
      virtualFiles.stopSyncLoop();
      codeBlocks.unmountAllCodeControls();
      withSelfMutation(() => {
        document.querySelectorAll(
          ".ai-turbo-chat-file-row, .ai-turbo-chat-capsule, .ai-turbo-chat-user-prompt"
        ).forEach((node) => node.remove());
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
      chatCapsules.reset();
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
            if (closeTextPreview()) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            if (state.hudOpen) {
              event.preventDefault();
              event.stopPropagation();
              hud?.togglePanel(false);
              return;
            }
          }
          if (event.altKey && !event.ctrlKey && !event.metaKey && !event.repeat && (event.code === "KeyT" || event.key.toLowerCase() === "t" || event.key === "†")) {
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
        "input",
        (event) => virtualFiles.handleComposerInput(event.target),
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
      injectStyles();
      hud?.buildHUD();
      codeBlocks.observeCodeLayout();
      sidebarPeek.bind(document);
      if (currentPlatform.quietMotion) motionQuiet.bind(document);
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
      syncTurnDiscoveryFallback();
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
