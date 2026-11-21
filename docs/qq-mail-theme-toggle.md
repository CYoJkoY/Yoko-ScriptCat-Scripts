# QQ Mail Theme Toggle
为 QQ 邮箱网页版新增一个深浅色主题切换按钮的用户脚本（UserScript）。

- 版本：1.1.0
- 许可：MIT
- 运行环境：ScriptCat / Tampermonkey / Violentmonkey 等 UserScript 管理器
- 适用页面：`https://wx.mail.qq.com/home/*`（`@noframes`）

## 安装
1. 安装用户脚本管理器（ScriptCat 推荐）。
2. 点击安装入口直接安装（推荐，可自动更新）：[QQ Mail Theme Toggle](https://ghfast.top/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/release/qq-mail-theme-toggle.user.js)。
3. 或在管理器中新建脚本、粘贴脚本完整内容后保存。
4. 打开 QQ 邮箱网页版；左下角会出现一个 36×36 的圆形主题按钮。

## 核心特性
- 在页面左下角注入固定定位的圆形图标按钮：浅色时显示月亮，深色时显示太阳，图标表示“点击后的下一个主题”。
- 深色主题**不反色**。脚本只替换 QQ 邮箱界面使用的设计令牌（背景、文字、边框、阴影等 CSS 变量），并重新映射邮件列表、侧边栏、顶栏和弹层中的少量组件颜色。
- 邮件阅读区（`.mail-detail-content`）在深色模式下仍固定为原始浅色配色，因此邮件正文及其中的照片、图表、二维码和视频都保持作者原本的颜色，不会出现照片负片。
- 从未手动选择过主题时跟随系统 `prefers-color-scheme`；点击按钮后模式写入 `GM_getValue` / `GM_setValue`（无授权时退回页面 `localStorage`），刷新后仍然生效；系统主题变化只在用户未手动选择时生效。
- `MutationObserver` 会在 QQ 邮箱重绘 DOM 后把按钮重新挂载；按钮自身使用两套独立配色，深浅主题下都保持可读，并保留键盘焦点、Enter/Space 与 `aria-pressed` 语义。
- `@run-at document-start`：主题属性和样式表在首帧渲染前注入，避免整页浅色闪烁。

## 主题原理
QQ 邮箱的界面由 `<body class="page-color-theme">` 上的一组 `--base_white_*`、`--base_gray_*`、`--bg_*` 等设计令牌驱动。深色模式在 `<html data-yoko-qq-mail-theme="dark">` 下重新声明这些令牌：原本的“白色层”变成深色背景，原本的“灰色文字”变成浅色文字；同时对少量直接写死颜色的组件做定向覆盖。规则统一带 `body` 前缀，以稳定压过 QQ 邮箱自身的 `body.page-color-theme` 选择器。

邮件阅读区是唯一的“浅色孤岛”：脚本在深色模式下把它重新声明为 `color-scheme: light`，恢复完整的浅色令牌并强制白色背景。这样界面外壳变暗，但邮件内容仍是原始渲染结果，不依赖滤镜，也不会改变图片像素。

浅色模式只是移除根节点上的主题属性，所有深色规则立即失效，页面回到 QQ 邮箱原生配色。

## 与 QQ 邮箱的兼容
- 只追加一个 `<style>`、一个原生 `<button>` 和根节点属性，不改动 QQ 邮箱的 DOM 结构、类名或事件处理器；卸载后全部移除。
- 主题规则只作用于界面令牌和明确的组件选择器，不向邮件正文注入样式，也不对 `img`、`video`、`canvas` 应用 `filter` 或 `mix-blend-mode`。
- QQ 邮箱重绘或路由切换导致按钮被移除时，观察器会自动补回，不会重复插入。
- 若 QQ 邮箱后续调整令牌命名，深色模式可能局部回退为原生浅色，但不会破坏邮件内容或图片颜色。
