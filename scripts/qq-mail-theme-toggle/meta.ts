import type { UserscriptMeta } from "../../shared/userscript/meta";

const meta = {
  name: "QQ Mail Theme Toggle",
  namespace: "https://cyojkoy.github.io/Payment/",
  version: "1.1.0",
  description:
    "在QQ邮箱网页版左下角添加深浅主题切换按钮；深色主题通过替换界面配色令牌生效，不做反色，邮件正文与其中的图片、视频始终保持原始配色，偏好持久化并可跟随系统主题。",
  author: "Yoko",
  // `dist/` never reaches `main`; CI publishes the built bundles at the root of
  // the `release` branch, so both update links must point there.
  updateURL: "https://cdn.jsdelivr.net/gh/CYoJkoY/Yoko-ScriptCat-Scripts@release/qq-mail-theme-toggle.user.js",
  downloadURL: "https://ghfast.top/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/release/qq-mail-theme-toggle.user.js",
  match: ["https://wx.mail.qq.com/home/*"],
  runAt: "document-start",
  grant: ["GM_getValue", "GM_setValue"],
  noframes: true,
  icon: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%20role%3D%22img%22%20aria-label%3D%22QQ%20Mail%20Theme%20Toggle%22%3E%20%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2214%22%20fill%3D%22%230f172a%22%2F%3E%20%3Cpath%20d%3D%22M14%2020h30v22H14z%22%20fill%3D%22none%22%20stroke%3D%22%2338bdf8%22%20stroke-width%3D%222.5%22%2F%3E%20%3Cpath%20d%3D%22M14%2022l15%2012%2015-12%22%20fill%3D%22none%22%20stroke%3D%22%2338bdf8%22%20stroke-width%3D%222.5%22%2F%3E%20%3Ccircle%20cx%3D%2246%22%20cy%3D%2244%22%20r%3D%229%22%20fill%3D%22%23fbbf24%22%2F%3E%20%3Cpath%20d%3D%22M42%2044a4%204%200%200%200%208%200%205%205%200%200%201-8%200z%22%20fill%3D%22%230f172a%22%2F%3E%20%3C%2Fsvg%3E",
  license: "MIT",
} satisfies UserscriptMeta;

export default meta;
