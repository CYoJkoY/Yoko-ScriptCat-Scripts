import type { UserscriptMeta } from "../../shared/userscript/meta";
import brandIcon from "./src/brand-icon";

const meta = {
  name: "Google Sheets Theme Toggle",
  namespace: "https://cyojkoy.github.io/Payment/",
  version: "1.0.14",
  description: "在 Google 表格（/spreadsheets/d/*）编辑界面右侧工具栏加一个深浅主题切换按钮；深色同时调整界面外壳与表格画布，提亮文字、压暗刺眼的浅色填充，切换工作表时即时着色、浅→深切换时折叠中性及浅色抗锯齿亮噪点（保留色相、不整体反色），并在网格 blit 之前接管与之同源的游离、离屏与暂存格子缓存（含挂在隐藏容器里的画布），按录制的文字色重建文字边缘抗锯齿、避免切换后表格内部残留浅色噪点且文字不发灰、无需手动刷新；同时通过压矮网格容器 1px、轻推滚动与补发 resize 触发 Google 立即整块重绘，保护 drawImage 图片像素（按 3/5/9 参数与变换解析目标矩形）、按角色曲线映射渐变与离屏上下文色标，并保护 save/restore 状态，偏好持久化并跟随系统。",
  author: "Yoko",
  // `dist/` never reaches `main`; CI publishes the built bundles at the root of
  // the `release` branch, so both update links must point there.
  updateURL: "https://cdn.jsdelivr.net/gh/CYoJkoY/Yoko-ScriptCat-Scripts@release/sheets-theme-toggle.user.js",
  downloadURL: "https://ghfast.top/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/release/sheets-theme-toggle.user.js",
  match: ["https://docs.google.com/spreadsheets/*"],
  runAt: "document-start",
  grant: ["GM_getValue", "GM_setValue", "unsafeWindow"],
  noframes: true,
  icon: brandIcon,
  license: "MIT",
} satisfies UserscriptMeta;

export default meta;
