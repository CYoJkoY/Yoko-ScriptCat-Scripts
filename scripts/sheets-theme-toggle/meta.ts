import type { UserscriptMeta } from "../../shared/userscript/meta";

const meta = {
  name: "Google Sheets Theme Toggle",
  namespace: "https://cyojkoy.github.io/Payment/",
  version: "1.0.2",
  description: "在 Google 表格（/spreadsheets/d/*）编辑界面右侧工具栏加一个深浅主题切换按钮；深色同时调整界面外壳与表格画布背景/默认文字颜色，保留作者自设的单元格底色与字体色，偏好持久化并跟随系统。",
  author: "Yoko",
  // `dist/` never reaches `main`; CI publishes the built bundles at the root of
  // the `release` branch, so both update links must point there.
  updateURL: "https://cdn.jsdelivr.net/gh/CYoJkoY/Yoko-ScriptCat-Scripts@release/sheets-theme-toggle.user.js",
  downloadURL: "https://ghfast.top/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/release/sheets-theme-toggle.user.js",
  match: ["https://docs.google.com/spreadsheets/*"],
  runAt: "document-start",
  grant: ["GM_getValue", "GM_setValue", "unsafeWindow"],
  noframes: true,
  icon: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%20role%3D%22img%22%20aria-label%3D%22Google%20Sheets%20Theme%20Toggle%22%3E%20%3Cdefs%3E%20%3ClinearGradient%20id%3D%22bg%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%220%22%20y2%3D%2264%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%20%3Cstop%20offset%3D%220%22%20stop-color%3D%22%230b3d2e%22%2F%3E%20%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23062018%22%2F%3E%20%3C%2FlinearGradient%3E%20%3C%2Fdefs%3E%20%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2214%22%20fill%3D%22url(%23bg)%22%2F%3E%20%3Crect%20x%3D%2214%22%20y%3D%2210%22%20width%3D%2228%22%20height%3D%2244%22%20rx%3D%224%22%20fill%3D%22none%22%20stroke%3D%22%2334a853%22%20stroke-width%3D%222.5%22%2F%3E%20%3Cpath%20d%3D%22M20%2020h16M20%2028h16M20%2036h16M20%2044h16%22%20stroke%3D%22%2334a853%22%20stroke-width%3D%221.6%22%2F%3E%20%3Ccircle%20cx%3D%2246%22%20cy%3D%2242%22%20r%3D%229%22%20fill%3D%22%23fbbc04%22%2F%3E%20%3Cpath%20d%3D%22M46%2036.5v-3M46%2050.5v-3M39.5%2042h-3M55.5%2042h-3M41.5%2037.5l-2-2M52.5%2048.5l-2-2M41.5%2046.5l-2%202M52.5%2035.5l-2%202%22%20stroke%3D%22%23f9ab00%22%20stroke-width%3D%221.6%22%20stroke-linecap%3D%22round%22%2F%3E%20%3C%2Fsvg%3E",
  license: "MIT",
} satisfies UserscriptMeta;

export default meta;
