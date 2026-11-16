import type { UserscriptMeta } from "../../shared/userscript/meta";

const meta = {
  name: "Web Fullscreen Button",
  namespace: "https://cyojkoy.github.io/Payment/",
  version: "1.0.0",
  description: "给只有全屏按钮的视频播放器补一个网页全屏按钮，并把它动态插在全屏按钮前面；网页全屏只铺满浏览器视口，不进入系统全屏。",
  author: "Yoko",
  updateURL: "https://cdn.jsdelivr.net/gh/CYoJkoY/Yoko-ScriptCat-Scripts@main/dist/web-fullscreen.user.js",
  downloadURL: "https://ghfast.top/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/main/dist/web-fullscreen.user.js",
  match: ["http://*/*", "https://*/*"],
  runAt: "document-idle",
  grant: ["none"],
  license: "MIT",
} satisfies UserscriptMeta;

export default meta;
