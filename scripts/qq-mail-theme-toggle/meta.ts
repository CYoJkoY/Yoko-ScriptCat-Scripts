import type { UserscriptMeta } from "../../shared/userscript/meta";
import brandIcon from "./src/brand-icon";

const meta = {
  name: "QQ Mail Theme Toggle",
  namespace: "https://cyojkoy.github.io/Payment/",
  version: "1.2.1",
  description:
    "在QQ邮箱网页版左下角添加深浅主题切换按钮；深色主题替换界面配色令牌，并逐个元素重映射邮件正文里写死的内联颜色，不使用滤镜或反色，邮件中的图片、视频保持原始像素，偏好持久化并可跟随系统主题。",
  author: "Yoko",
  // `dist/` never reaches `main`; CI publishes the built bundles at the root of
  // the `release` branch, so both update links must point there.
  updateURL: "https://cdn.jsdelivr.net/gh/CYoJkoY/Yoko-ScriptCat-Scripts@release/qq-mail-theme-toggle.user.js",
  downloadURL: "https://ghfast.top/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/release/qq-mail-theme-toggle.user.js",
  match: ["https://wx.mail.qq.com/home/*"],
  runAt: "document-start",
  grant: ["GM_getValue", "GM_setValue"],
  noframes: true,
  icon: brandIcon,
  license: "MIT",
} satisfies UserscriptMeta;

export default meta;
