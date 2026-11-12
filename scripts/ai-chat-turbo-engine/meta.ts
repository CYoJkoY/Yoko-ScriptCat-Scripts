import type { UserscriptMeta } from "../../shared/userscript/meta";
import { PLATFORM_MATCH_PATTERNS } from "./src/config";

const meta = {
  name: "AI Chat Turbo Engine",
  namespace: "https://cyojkoy.github.io/Payment/",
  version: "0.20.7",
  description: "跨平台 AI 对话加速：常驻统计 + 完整消息提取 + YAML 交接 + 多平台适配 + 长代码折叠 + 自适应脱水 + 推理强度记忆 + 元宝原子工具记忆",
  author: "Yoko",
  updateURL: "https://cdn.jsdelivr.net/gh/CYoJkoY/Yoko-ScriptCat-Scripts@main/dist/ai-chat-turbo-engine.user.js",
  downloadURL: "https://ghfast.top/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/main/dist/ai-chat-turbo-engine.user.js",
  // Derived from the platform registry so the header lands on exactly the
  // hosts that runtime detection accepts.
  match: [...PLATFORM_MATCH_PATTERNS],
  runAt: "document-start",
  grant: ["none"],
  noframes: true,
  icon: "data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"64\" height=\"64\"><rect width=\"24\" height=\"24\" rx=\"6\" fill=\"%2309090b\"/><path d=\"M13 2L3 14h8l-1 8 11-12h-8l1-8z\" fill=\"%2310b981\"/></svg>",
  license: "MIT",
} satisfies UserscriptMeta;

export default meta;
