import type { UserscriptMeta } from "../../shared/userscript/meta";

const meta = {
  name: "Gemini Quota Capsule",
  namespace: "https://cyojkoy.github.io/Payment/",
  version: "1.0.3",
  description: "document-start 拦截 XHR/Fetch batchexecute (wrb.fr) 与官方用量页面，按窗口精确分流 5H / 7D 用量；装饰图标与两段进度独立配置，支持图片、SVG 与组件 CSS。",
  author: "Yoko",
  updateURL: "https://cdn.jsdelivr.net/gh/CYoJkoY/Yoko-ScriptCat-Scripts@main/dist/gemini-quota-capsule.user.js",
  downloadURL: "https://ghfast.top/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/main/dist/gemini-quota-capsule.user.js",
  match: ["https://gemini.google.com/*","https://bard.google.com/*"],
  runAt: "document-start",
  noframes: true,
  grant: ["none"],
  icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnIiB4MT0iMCIgeTE9IjAiIHgyPSIxIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjMTBiOTgxIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjMDY1ZjQ2Ii8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiByeD0iMTIiIGZpbGw9IiMwOTA5MGIiLz48ZyB0cmFuc2Zvcm09InJvdGF0ZSgtNDUgMjQgMjQpIj48cmVjdCB4PSIxNCIgeT0iOCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjMyIiByeD0iMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzMzNDE1NSIgc3Ryb2tlLXdpZHRoPSIyLjUiLz48cGF0aCBkPSJNMTQgMThDMTQgMTIuNSAxOC41IDggMjQgOHMxMCA0LjUgMTAgMTB2NkgxNHoiIGZpbGw9InVybCgjZykiLz48cGF0aCBkPSJNMTQgMjRoMjB2NkgxNHoiIGZpbGw9IiMxZTI5M2IiLz48bGluZSB4MT0iMTQiIHkxPSIyNCIgeDI9IjM0IiB5Mj0iMjQiIHN0cm9rZT0iI2Y4ZmFmYyIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1vcGFjaXR5PSIuNiIvPjwvZz48L3N2Zz4=",
  license: "MIT",
} satisfies UserscriptMeta;

export default meta;
