# Google Sheets Theme Toggle
为 Google 表格在线编辑界面新增一个深浅色主题切换按钮的用户脚本（UserScript）。

- 版本：1.0.0
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
- 深色主题用 `filter: invert(1) hue-rotate(180deg)` 铺满整个编辑器，覆盖标题栏、菜单栏、工具栏、公式栏和 canvas 画布网格；`img` / `video` / `picture` 被二次反色，保持原本的颜色。
- 按钮自身同样二次反色，深浅两套配色独立写死，保证任何主题下图标和文字都可读。
- 从未手动选择过主题时跟随系统 `prefers-color-scheme`；点击按钮后所选模式写入 `GM_getValue` / `GM_setValue`（无授权时退回页面 `localStorage`），刷新后仍然生效。
- Google 重绘工具栏（视图切换、路由跳转）后 `MutationObserver` 会在 120ms 内把按钮重新插回工具栏；工具栏迟迟不渲染时按钮退化为固定在视口右下角的浮动按钮。
- `@run-at document-start`：主题属性和样式表在首帧渲染前注入，避免浅色闪烁。
- 只在文档路由（`/spreadsheets/d/<id>`、`/spreadsheets/u/<n>/d/<id>`）安装；同一 `/spreadsheets/` 树下的文件列表和模板库不会出现按钮。

## 主题原理
Google 表格的网格画在一个 `<canvas>` 上，任何纯 DOM 样式覆盖都够不到画出的像素。脚本因此把整页 `filter: invert(1) hue-rotate(180deg)`：白底黑字变黑底白字，蓝色系经过色相旋转仍保持蓝色观感；照片、视频和 `<picture>` 容器被同一滤镜再反一次，颜色回到原始值。切换按钮本身也被二次反色，它的颜色不随整页反转，两套深浅配色独立书写，不会出现不可读的图标。

## 与 Google 的兼容
- 按钮是原生 `<button>`，保留键盘焦点、Enter、Space 和屏幕阅读器的语义。
- Google 的渲染器会整棵重绘 chrome 子树；观察器检测到按钮被移除后延迟 120ms 重新挂载，忙页不会因为节流而永远丢失按钮。
- 脚本只追加节点和样式，不改动 Google 自己的 DOM、类名或事件，卸载后一切还原。
