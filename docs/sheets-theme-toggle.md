# Google Sheets Theme Toggle
为 Google 表格在线编辑界面新增一个深浅色主题切换按钮的用户脚本（UserScript）。

- 版本：1.0.1
- 许可：MIT
- 运行环境：ScriptCat / Tampermonkey / Violentmonkey 等 UserScript 管理器
- 适用页面：`https://docs.google.com/spreadsheets/d/*`（含多账号的 `/spreadsheets/u/<n>/d/*`，仅顶层文档，`@noframes`）

## 安装
1. 安装用户脚本管理器（ScriptCat 推荐）。
2. 点击安装入口直接安装（推荐，可自动更新）：[Google Sheets Theme Toggle](https://ghfast.top/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/release/sheets-theme-toggle.user.js)。
3. 或在管理器中新建脚本、粘贴脚本完整内容后保存。
4. 打开 Google 表格的编辑页面；右侧工具栏会出现主题切换按钮。

## 核心特性
- 在编辑器右侧工具栏（`#docs-side-toolbar`）注入一个 28×28 的圆形图标按钮：浅色时显示月亮，深色时显示太阳，图标始终表示"点击后的下一个主题"。
- 深色主题只为标题栏、菜单栏、工具栏、公式栏和工作表标签显式设置背景与文字颜色；表格画布、图片、图表、单元格和颜色选择器色块保持 Google 原有颜色，不对页面或内容使用反色滤镜。
- 切换按钮在深浅主题下都使用明确的前景与背景色，图标始终清晰可辨。
- 从未手动选择过主题时跟随系统 `prefers-color-scheme`；点击按钮后所选模式写入 `GM_getValue` / `GM_setValue`（无授权时退回页面 `localStorage`），刷新后仍然生效。
- Google 重绘工具栏（视图切换、路由跳转）后 `MutationObserver` 会在 120ms 内把按钮重新插回工具栏；工具栏迟迟不渲染时按钮退化为固定在视口右下角的浮动按钮。
- `@run-at document-start`：主题属性和样式表在首帧渲染前注入，避免浅色闪烁。
- 只在文档路由（`/spreadsheets/d/<id>`、`/spreadsheets/u/<n>/d/<id>`）安装；同一 `/spreadsheets/` 树下的文件列表和模板库不会出现按钮。

## 主题原理
深色模式只针对 Google 表格的界面外壳应用 CSS 颜色，不处理绘制到画布上的表格内容。这样嵌入图片、图表、单元格底色和调色板色块都会保留文档作者设置的原貌；工作表正文区域也不会被整体变暗。

## 与 Google 的兼容
- 按钮是原生 `<button>`，保留键盘焦点、Enter、Space 和屏幕阅读器的语义。
- Google 的渲染器会整棵重绘 chrome 子树；观察器检测到按钮被移除后延迟 120ms 重新挂载，忙页不会因为节流而永远丢失按钮。
- 脚本只追加节点和样式，不改动 Google 自己的 DOM、类名或事件，卸载后一切还原。
