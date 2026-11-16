import type { UserscriptMeta } from "../../shared/userscript/meta";

const meta = {
  name: "Web Fullscreen Button",
  namespace: "https://cyojkoy.github.io/Payment/",
  version: "1.0.3",
  description: "给只有全屏按钮的视频播放器补一个网页全屏按钮，并把它动态插在全屏按钮前面；网页全屏只铺满浏览器视口，不进入系统全屏。",
  author: "Yoko",
  updateURL: "https://cdn.jsdelivr.net/gh/CYoJkoY/Yoko-ScriptCat-Scripts@main/dist/web-fullscreen.user.js",
  downloadURL: "https://ghfast.top/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/main/dist/web-fullscreen.user.js",
  match: ["http://*/*", "https://*/*"],
  runAt: "document-idle",
  grant: ["none"],
  icon: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%20role%3D%22img%22%20aria-label%3D%22Web%20Fullscreen%20Button%22%3E%20%3Cdefs%3E%20%3ClinearGradient%20id%3D%22bg%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%220%22%20y2%3D%2264%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%20%3Cstop%20offset%3D%220%22%20stop-color%3D%22%2316233d%22%2F%3E%20%3Cstop%20offset%3D%221%22%20stop-color%3D%22%230a1020%22%2F%3E%20%3C%2FlinearGradient%3E%20%3C%2Fdefs%3E%20%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2214%22%20fill%3D%22url(%23bg)%22%2F%3E%20%3Crect%20x%3D%220.75%22%20y%3D%220.75%22%20width%3D%2262.5%22%20height%3D%2262.5%22%20rx%3D%2213.25%22%20fill%3D%22none%22%20stroke%3D%22%232b3d63%22%20stroke-width%3D%221.5%22%2F%3E%20%3Crect%20x%3D%228%22%20y%3D%2213%22%20width%3D%2248%22%20height%3D%2238%22%20rx%3D%226%22%20fill%3D%22none%22%20stroke%3D%22%2338bdf8%22%20stroke-width%3D%222.5%22%2F%3E%20%3Cpath%20d%3D%22M8%2022H56%22%20stroke%3D%22%2338bdf8%22%20stroke-width%3D%222.5%22%2F%3E%20%3Ccircle%20cx%3D%2213.5%22%20cy%3D%2217.5%22%20r%3D%221.5%22%20fill%3D%22%237dd3fc%22%2F%3E%20%3Ccircle%20cx%3D%2218.5%22%20cy%3D%2217.5%22%20r%3D%221.5%22%20fill%3D%22%237dd3fc%22%2F%3E%20%3Ccircle%20cx%3D%2223.5%22%20cy%3D%2217.5%22%20r%3D%221.5%22%20fill%3D%22%237dd3fc%22%2F%3E%20%3Cpath%20d%3D%22M19%2028H16v3M45%2028h3v3M19%2045h-3v-3M45%2045h3v-3%22%20fill%3D%22none%22%20stroke%3D%22%23f8fafc%22%20stroke-width%3D%222.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%20%3Cpath%20d%3D%22M29%2029.5l9%206.5-9%206.5z%22%20fill%3D%22%2338bdf8%22%2F%3E%20%3C%2Fsvg%3E",
  license: "MIT",
} satisfies UserscriptMeta;

export default meta;
