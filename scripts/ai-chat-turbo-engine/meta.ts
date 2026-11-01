import type { UserscriptMeta } from "../../shared/userscript/meta";

const meta = {
  name: "AI Chat Turbo Engine",
  namespace: "https://cyojkoy.github.io/Payment/",
  version: "0.16.4",
  description: "跨平台 AI 对话加速：常驻统计 + 完整消息提取 + YAML 交接 + 多平台适配 + 长代码折叠 + 自适应脱水 + 推理强度记忆 + 元宝原子工具记忆",
  author: "Yoko",
  updateURL: "https://cdn.jsdelivr.net/gh/CYoJkoY/Yoko-ScriptCat-Scripts@main/dist/ai-chat-turbo-engine.user.js",
  downloadURL: "https://ghfast.top/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/main/dist/ai-chat-turbo-engine.user.js",
  match: ["https://chatgpt.com/*","https://chat.openai.com/*","https://gemini.google.com/*","https://grok.com/*","https://x.com/i/grok*","https://claude.ai/*","https://chat.deepseek.com/*","https://copilot.microsoft.com/*","https://perplexity.ai/*","https://www.perplexity.ai/*","https://poe.com/*","https://doubao.com/*","https://www.doubao.com/*","https://yuanbao.tencent.com/*","https://chat.qwen.ai/*","https://qianwen.com/*","https://www.qianwen.com/*","https://chatglm.cn/*","https://chat.z.ai/*"],
  runAt: "document-start",
  grant: ["none"],
  noframes: true,
  icon: "data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"64\" height=\"64\"><rect width=\"24\" height=\"24\" rx=\"6\" fill=\"%2309090b\"/><path d=\"M13 2L3 14h8l-1 8 11-12h-8l1-8z\" fill=\"%2310b981\"/></svg>",
  license: "MIT",
} satisfies UserscriptMeta;

export default meta;
