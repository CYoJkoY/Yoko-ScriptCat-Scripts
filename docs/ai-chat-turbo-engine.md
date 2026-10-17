# AI Chat Turbo Engine

面向长对话与重度使用的跨平台 AI 聊天增强用户脚本。在受支持的 AI 对话页面上叠加一层轻量增强，解决四类实际痛点：长会话渲染变卡、超长代码块挤占阅读空间、大段文本撑爆输入框、上下文难以迁移到新会话。

当前版本：**0.13.7**
许可证：**MIT**
运行方式：单文件用户脚本，无外部依赖，无网络请求，不申请任何 GM 权限。

---

## 特性一览

- **常驻统计 HUD**：悬浮球实时显示消息 / 脱水 / 折叠 / 文件四项指标，附负载环
- **视口脱水**：对超过保留轮次的旧消息冻结渲染，降低长对话开销
- **长代码折叠**：超过阈值的助手代码块自动折叠，保留语言与行数
- **长文本伪文件**：粘贴超长文本时转为悬浮托盘中的"虚拟文件"，发送时合并附加
- **发送鲁棒性**：多级发送按钮查找 + pointer 序列模拟 + form 兜底提交
- **上下文交接**：生成结构化纯文本交接包，一键恢复到新对话
- **会话历史检索**：当前会话全文检索，命中后定位并高亮
- **原始上下文导出**：把整段对话提取为 Markdown 复制到剪贴板

---

## 支持的平台

脚本按主机名自动识别平台，并加载对应的选择器配置。

| 平台 | 域名 |
| --- | --- |
| ChatGPT | chatgpt.com、chat.openai.com |
| Google Gemini | gemini.google.com |
| Grok | grok.com、x.com/i/grok |
| Claude | claude.ai |
| DeepSeek | chat.deepseek.com |
| Microsoft Copilot | copilot.microsoft.com |
| Perplexity | perplexity.ai、www.perplexity.ai |
| Poe | poe.com |
| 豆包 | doubao.com、www.doubao.com |
| 腾讯元宝 | yuanbao.tencent.com |
| Qwen Chat | chat.qwen.ai |
| 千问 | qianwen.com、www.qianwen.com |
| ChatGLM / 智谱清言 | chatglm.cn |
| Z.ai (GLM) | chat.z.ai |

平台识别失败时脚本直接退出，不会在未适配站点产生任何副作用。

---

## 安装

前置条件：Chrome / Edge / Firefox / Safari + 任一用户脚本管理器（Tampermonkey、Violentmonkey、Greasemonkey）。

1. 安装用户脚本管理器。
2. 在管理器中新建脚本。
3. 粘贴脚本完整内容并保存。
4. 打开受支持的对话页面，右下角出现 `Turbo` 悬浮球即表示生效。

脚本以 `@run-at document-start` 注入，`@noframes`，`@grant none`。

---

## 功能详解

### 常驻统计 HUD

悬浮球默认位于右下角，可拖拽，位置保存在 `localStorage`。

- 左侧为负载环：显示 `当前消息数 / 60`，颜色随比例由绿转黄再转红。**仅为消息数量启发式，不代表模型真实上下文容量或回答质量。**
- 右侧四项指标：

| 指标 | 含义 |
| --- | --- |
| 消息 | 当前会话检测到的消息条数 |
| 脱水 | 已被冻结渲染的消息数 |
| 折叠 | 已被折叠的代码块数 |
| 文件 | 待随下一条消息发送的虚拟文件数 |

点击悬浮球（或按 `Alt + T`）打开主面板。

### 视口脱水（Adaptive Dehydration）

对超出保留轮次的旧消息追加 `.ai-turbo-dehydrated`，实现方式：

```css
content-visibility: hidden;
contain: layout paint style;
contain-intrinsic-size: auto var(--turbo-cached-h, 120px);
```

设计取舍：

- 相比 `display: none`，`content-visibility: hidden` 保留节点的 `textContent` 可读性，因此历史检索、上下文导出、交接包提取仍能覆盖全部消息。
- 冻结消息内的按钮与链接不可点击，这是有意的取舍。命中检索跳转时脚本会临时恢复该消息。
- `contain-intrinsic-size` 用折叠前缓存的高度占位，避免滚动条抖动。

保留轮次可在面板中调整，范围 **2 至 50**，默认 **8**。

### 长代码折叠

助手代码块高度超过 **300px** 时自动折叠为 **200px** 预览高度，并在上方插入一条工具栏：

- **语言标签**：从 `language-*` 类名、`data-language` / `lang` 属性，或原生头部装饰中识别
- **行数统计**：基于实时文本计算
- **展开 / 收起**按钮

输出中的代码块会显示流式状态徽标；若 1500ms 内内容无变化，则自动切换为静态行数。

ChatGPT 的代码卡片结构较特殊，脚本会向上最多追溯 10 层祖先以定位真正的外层代码卡片容器，并以 `data-turn-key`、`article[data-turn]`、`li[data-message-role]` 等作为硬边界，避免把整条助手消息当作折叠目标。**无法安全识别边界时放弃折叠并恢复原样。**

### 长文本伪文件

在输入框粘贴 **>1500 字符**的纯文本时触发。

处理流程：

1. 拦截原生粘贴事件，文本不写入输入框。
2. 在输入框上方生成悬浮托盘，列出已捕获的虚拟文件；文件名为 `pasted_text_{KB}kb.txt`。
3. 发送时把虚拟文件与输入框内容合并为一条消息，用 `[[TURBO_VFILE_START:...|行数|字节数:TURBO_VFILE_END]]` token 包裹文件内容。
4. 消息回显后，脚本检测到 token 即把大段文本折叠为小胶囊，胶囊作为消息气泡的**兄弟节点**插入（不侵入平台自身 DOM 结构），原始提问文本若在胶囊外则单独保留。

每个虚拟文件条目提供：

- **预览**：独立弹层，最多展示前 8,000 字符（发送时提交完整全文）
- **删除**：从托盘移除

#### 输入框变形下的托盘定位

平台原生附件预览插在输入框上方时，会撑高 composer 并上移输入框。为了让伪文件托盘贴合包含原生附件在内的整体视觉上缘，脚本做了以下处理：

- **`getInputContainer`**：从候选容器中挑选"完整包裹输入框且面积最小"的那一个，避免把整页 wrapper 误判为 composer。
- **`getComposerVisualBounds`**：从 anchor 起向上最多追溯 5 层父节点，将紧贴上方（垂直间隙 ≤ 48px）、水平方向与当前区域重叠 ≥ 35% 的兄弟节点（原生附件预览、工具条、按钮行）并入视觉边界。
- **rAF 持续追踪循环**：以 90ms 间隔调用位置更新，捕捉 `ResizeObserver` 无法感知的纯平移。循环仅在存在虚拟文件时运行。
- **位置签名去重**：每帧计算 `left|bottom|width|maxHeight` 组合签名，未变化时不写样式，避免打断 CSS 过渡。
- **输入框引用缓存**：仅在失效时才走完整 `getChatInput()`，避免每帧全量查询。
- **`ResizeObserver` 扩展**：同时观察输入框、anchor、以及向上 5 层的祖先及其父节点，覆盖"祖先 wrapper 被附件撑高"的场景。

### 发送按钮查找与触发

0.13.7 引入了完整的"发送意图识别 → 按钮查找 → 事件模拟 → 兜底提交"链路，解决平台改版或按钮不在预期位置时消息发不出去的问题。

#### 多级查找 `findSendControl`

按以下顺序尝试，命中即返回：

1. **平台选择器**：当前平台 `sendButtonSelectors` 中任一选择器命中的可用按钮（且与输入框共享 composer 容器）。
2. **输入框所在 `form`**：先找 `button[type="submit"]` 与非 `type="button"` 的按钮，再在所有按钮中按 `isSendLikeButton` 过滤。
3. **composer 容器**：在 `[data-chatgpt-composer]`、`.input-area-container`、`[class*='composer']`、`[class*='input-area']`、`[class*='input-container']`、`[class*='query-bar']`、`rich-textarea`、`fieldset` 中按 `isSendLikeButton` 查找。
4. **向上 8 层**：从输入框向上遍历最多 8 层祖先，按 `isSendLikeButton` 查找。

`isSendLikeButton` 基于 `aria-label` / `title` / `data-testid` / `data-tooltip` 判断，命中 `send`、`submit`、`发送`、`提交`、`prompt`、`ask`；显式排除 `stop`、`停止`、`cancel`、`abort`、`中止`、`取消`，避免 AI 生成中误触停止按钮。

`isButtonUsable` 还会过滤掉隐藏、零尺寸、以及挂在脚本自身 UI 内的按钮。

#### 事件模拟 `triggerSendButton`

现代前端框架的发送按钮多绑定 `onPointerDown` / `onMouseDown`，直接 `btn.click()` 往往无效。`triggerSendButton` 依次派发：

```
pointerdown → mousedown → pointerup → mouseup → click
```

并携带 `bubbles: true, cancelable: true, view: window, button: 0, pointerId: 1, pointerType: "mouse", isPrimary: true`，确保 React 与 Pointer Events 监听都能识别为一次真实点击。

#### 重试与兜底 `sendWithRetry`

以 50ms 间隔最多轮询 **40 次（约 2 秒）**：

1. **前 15 次（约 750ms）**：只接受**可用且未 disabled** 的发送按钮。
2. **第 16 次起（约 800ms）**：允许命中的按钮处于 `disabled` 或 `aria-disabled="true"`，此时脚本会先 `removeAttribute("disabled")` 并置 `aria-disabled="false"`，再调用 `triggerSendButton`。
3. **第 40 次兜底 `fallbackKeyboardSubmit`**：先尝试 `form.requestSubmit()`；若无 form 或该方法不可用，则派发带 `keyCode / which = 13` 的 `keydown` + `keyup` Enter 事件。

这套分级策略的目标：绝大多数正常场景在第 1~5 次轮询内命中；输入框受控状态暂未同步导致按钮 disabled 的场景，800ms 后强点成功；完全无法识别按钮的极端场景，通过 form 或键盘事件保底。

#### 发送拦截 `handleSendIntercept`

- **Enter 键**：存在虚拟文件且未处于提交中时，拦截 `Enter`（不含 `Shift`、非输入法组合状态），合并虚拟文件并触发 `sendWithRetry`。
- **点击**：判断用户是否点击了"发送按钮"时，**不再强制依赖 `isSendControlForInput`**，而是：
  1. 先用 `currentPlatform.sendButtonSelectors` 做 `closest()` 匹配；
  2. 未命中时向上最多 4 层，按 `isSendLikeButton` 兜底识别。

  命中即视为发送意图，`preventDefault + stopPropagation` 后合并虚拟文件并触发 `sendWithRetry`。这样即使平台把发送按钮移出了 `form[data-chatgpt-composer]`，或与输入的最近公共祖先超过 5 层，也不会因为 `isSendControlForInput` 返回 false 而"点了没反应"。

### 上下文交接

把当前对话的工作状态迁移到新会话或新模型，避免从零复述。

面板中的按钮：

| 按钮 | 行为 |
| --- | --- |
| 发送 YAML 交接指令 | 向当前对话发送一段要求模型输出结构化交接包的提示词 |
| 恢复到新对话 | 从最近一条助手回答提取交接包，构建恢复指令并触发新建对话 |
| 仅复制新对话恢复指令 | 只构建恢复指令并写入剪贴板 |
| 仅复制 YAML 交接包 | 只把交接包写入剪贴板 |
| 复制原始上下文（回退） | 直接把整段对话导出为 Markdown 到剪贴板 |

#### 交接包格式

新版的交接包实际是**纯文本结构化格式**（非严格 YAML），要求模型直接输出、不使用 Markdown 代码块，从 `[META]` 到 `[END]`、字段固定、每字段形如 `字段名: 内容`：

```
[META]            version / generated_at / source_model / language
[TASK]            objective / success_criteria / current_status
[DECISIONS]       confirmed / rejected / assumptions
[PROGRESS]        done / in_progress / next_actions
[ROLE]            persona / tone / response_format / boundaries
[CONTEXT]         tools / tech_stack / files / data / constraints
[OPEN_ISSUES]     questions / risks / blockers
[KEY_ENTITIES]    people / projects / terms
[HANDOFF_NOTES]   自由补充
[END]
```

提取逻辑优先兼容旧版 YAML 格式（`meta:` 等顶层键），因此按钮仍名为「YAML 交接」；两种格式都会按纯文本处理，不依赖严格 YAML 解析。

#### 恢复到新对话的流程

1. 从最近一条助手消息中提取符合结构的交接包（优先代码块，再按 fenced 代码块切，最后整体兜底）。
2. 把交接包嵌入恢复指令模板，模板要求模型先校验、再输出摘要、随后直接进入角色执行 `next_actions` 首项。
3. 通过 sessionStorage 跨页暂存恢复指令，并触发当前平台的"新建对话"入口。
4. 新对话渲染后自动填入输入框。

边界处理：

- 新对话输入框已有草稿时，**不覆盖**，改为复制到剪贴板并提示手动粘贴。
- 无法识别新建对话入口时，同样回退为复制到剪贴板。
- 生成指令插入输入框后，会做关键标记（`[META]`、`[TASK]`、`[PROGRESS]`、`[END]`）存活检查，防止平台过滤；被过滤时自动复制到剪贴板并给出提示。

### 会话历史检索

面板中的检索框在输入后经 100ms 防抖执行全文匹配，最多返回 10 条，每条显示消息序号与 180 字符预览。

点击结果会关闭面板、临时恢复脱水状态、平滑滚动定位并高亮约 1.8 秒。检索覆盖全部已索引消息，包括处于脱水状态的消息。

### 原始上下文导出

`复制原始上下文（回退）` 按钮会把全部消息按 `### 用户 / 助手 · Message N` 分段，输出为 Markdown 写入剪贴板。用于脱离脚本、把完整上下文粘贴到任意位置。

---

## 交互与快捷键

| 快捷键 / 操作 | 行为 |
| --- | --- |
| `Alt + T` | 呼出 / 收起主面板 |
| `Esc` | 关闭当前弹层（文件预览或主面板） |
| `Enter` | 存在虚拟文件时触发合并发送（已输入内容 + 全部虚拟文件） |
| 拖拽悬浮球 | 移动位置，松手即保存 |

面板内所有开关即时生效并写入配置，无需刷新页面。

---

## 配置

配置项存储在 `localStorage` 的 `ai_turbo_engine_config`。

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `keepTurns` | number | 8 | 保留最近 N 轮不脱水，范围 2 至 50 |
| `pruneEnabled` | boolean | true | 是否启用视口脱水 |
| `collapseCode` | boolean | true | 是否启用长代码折叠 |
| `virtualFileEnabled` | boolean | true | 是否启用长文本伪文件 |

悬浮球位置存储在 `ai_turbo_pill_pos`；跨页交接暂存使用 `sessionStorage` 的 `ai_turbo_handoff_restore`。

---

## 设计与实现要点

### 更新调度

页面变更由 `MutationObserver` 捕获。为避免观察自身写入导致的自激循环，脚本在修改 DOM 时进入 `selfMutationDepth > 0` 状态，观察回调直接跳过。渲染更新统一经 `requestAnimationFrame` 调度，最短间隔 **80ms**。

### 读写分离

所有布局读取（`offsetHeight`、`getBoundingClientRect`）集中在写入之前完成，写入阶段不触发回流读取，避免 Layout Thrashing。伪文件托盘的位置计算同样读写分离：一次性读取 anchor、input 与相邻兄弟节点的几何信息，算出最终位置后统一写入。

### 增量与全量同步

`turnIndex` 记录已索引消息。结构变化（消息增删、顺序改变、选择器组切换）触发全量同步，其余情况只处理 dirty 集合。选择器组按命中优先级依次尝试并缓存，SPA 路由变化时失效重选。

### 双重位置感知

伪文件托盘的位置更新由两套机制协同：

- `ResizeObserver`：捕捉尺寸变化（原生附件插入、输入框变高、composer 撑开）
- rAF 追踪循环：以 90ms 间隔捕捉纯位置变化（`ResizeObserver` 无法感知的平移）

两者都通过 requestAnimationFrame 合并到同一入口 `positionVirtualFileTray`，配合位置签名去重，避免重复写入与抖动。

### 输入框写入 `insertTextAtomic`

- **`textarea` / `input`**：使用 `Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype | HTMLInputElement.prototype, "value").set` 调用原生 setter 写入，保证 React 受控组件能感知变化，然后派发 `input` + `change` 事件。
- **`contenteditable`（ProseMirror 等）**：优先用 `document.createRange()` + `Selection` 选中编辑器全部内容，再 `document.execCommand("insertHTML", ...)` 插入，最后补派一次 `InputEvent`。`execCommand` 失败时回退为 `textContent = text`。相比仅用 `selectAll`，Range 选中在焦点不在编辑器内时更可靠。

### 失败即回退

凡是涉及改写平台原生结构的操作（代码折叠、新建对话、发送按钮定位、消息回显胶囊）都遵循同一原则：**无法可靠识别目标时不做修改，保持原生行为，并通过状态提示告知用户**。

### 平台扩展

在 `PLATFORMS` 中新增条目，并在 `detectPlatform()` 中补充域名分支即可接入新平台。条目需要提供的字段：

| 字段 | 用途 |
| --- | --- |
| `turnSelectorGroups` | 多套消息节点选择器，按命中优先级尝试 |
| `turnSelectors` | 兜底消息选择器 |
| `userTurnSelectors` | 识别用户消息 |
| `userContentSelectors` | 用户消息内容容器 |
| `contentSelectors` | 助手消息内容容器 |
| `codeSelectors` | 代码块选择器 |
| `inputSelectors` | 输入框选择器 |
| `sendButtonSelectors` | 发送按钮选择器（会被 `findSendControl` 优先使用，未命中则走通用兜底） |

`findSendControl` 的通用兜底对所有平台生效，因此新平台未提供精确的 `sendButtonSelectors` 也可能通过 `form` / composer 容器 / 向上 8 层的 `isSendLikeButton` 命中。

---

## 已知限制

- 平台前端改版会导致选择器失效，需等待脚本更新；`findSendControl` 的多级兜底可覆盖部分小规模改版，但无法覆盖彻底重构的 DOM 结构。
- 脚本不申请 GM 权限，剪贴板写入依赖浏览器授权。
- 负载环仅按消息数量估算，与模型实际上下文容量无关。
- 伪文件只覆盖文本粘贴路径，不接管平台原生的图片与文档上传流程。
- 脱水消息内的交互元素不可点击，命中检索时会临时恢复。
- 代码折叠与新建对话的自动化在平台结构大改时可能降级为无操作，属于预期行为。
- 伪文件托盘的 rAF 追踪仅在存在虚拟文件时运行；页面极度繁忙（大量流式输出 + 频繁重排）时，托盘跟随可能出现一帧延迟，属于权衡选择。
- AI 生成中若平台将发送按钮替换为"停止生成"按钮，脚本会通过 `isSendLikeButton` 的排除规则跳过；请等生成结束后再发送。

---

## 版本记录

### 0.13.7

修复 0.13.6 中"点击发送按钮后消息发不出去"的问题。根因是 `handleSendIntercept` 的 click 分支过度依赖 `isSendControlForInput`，以及 `sendWithRetry` 的发送按钮查找缺少兜底。

- **`sendButtonSelectors`（ChatGPT）扩展**：新增 `composer-send-button`、`button[data-testid*="send" i]`、`button[aria-label*="Send prompt" i]`、`button[title*="Send" i]` 等，覆盖新旧结构
- **新增 `isSendLikeButton`**：基于 `aria-label` / `title` / `data-testid` / `data-tooltip` 识别发送意图，显式排除 `stop` / `取消` 等停止按钮
- **新增 `isButtonUsable` / `isButtonDisabled`**：统一过滤隐藏、零尺寸、脚本自身 UI 内的按钮，并集中判断 disabled 状态
- **新增 `findSendControl`**：四级查找（平台选择器 → form → composer 容器 → 向上 8 层），可指定 `allowDisabled` 用于强制点击
- **新增 `triggerSendButton`**：模拟完整的 `pointerdown → mousedown → pointerup → mouseup → click` 序列，兼容 React `onPointerDown` 与 Pointer Events
- **新增 `fallbackKeyboardSubmit`**：优先 `form.requestSubmit()`，再派发带 `keyCode / which = 13` 的 `keydown` + `keyup`
- **重写 `sendWithRetry`**：40 次轮询（约 2 秒），前 15 次只接受可用按钮，第 16 次起允许 disabled 并先清除 disabled 属性再点击，第 40 次走键盘兜底
- **重写 `handleSendIntercept` 的 click 分支**：选择器未命中时向上 4 层按 `isSendLikeButton` 识别；命中即视为发送意图，不再强制 `isSendControlForInput` 通过
- **改进 `insertTextAtomic`**：`textarea` / `input` 使用原生 setter 写值以兼容 React 受控组件；`contenteditable` 用 `Range` + `Selection` 选中全部内容，再 `execCommand("insertHTML")`，补派 `InputEvent`
- **`cleanupAndResume` 后置重置 `isSubmitting`**：避免 `sendWithRetry` 异常导致后续发送永久被锁

### 0.13.5

修复原生附件存在时伪文件托盘定位错误与输入框变形问题。

- `getInputContainer` 由"取 rect.top 最小"改为"完整包裹输入框且面积最小"，更精确地定位 composer
- 新增 `getComposerVisualBounds`：向上追溯最多 5 层，将紧贴上方、水平重叠 ≥ 35%、垂直间隙 ≤ 48px 的兄弟节点（原生附件预览、工具条）并入视觉顶部
- 新增 rAF 持续追踪循环（90ms 间隔），覆盖 `ResizeObserver` 感知不到的纯平移
- 新增位置签名去重，位置未变时不写样式，避免打断 CSS 过渡
- 新增输入框引用缓存，避免每帧全量 `querySelectorAll`
- `ResizeObserver` 观察范围扩展到输入框、anchor 及向上 5 层祖先及其父节点
- CSS 过渡对齐：`bottom / left` 120ms `cubic-bezier(0.22, 1, 0.36, 1)`，`max-height` 90ms，新增 `will-change: bottom, left, max-height`

### 0.13.x 及更早

完整消息提取、流式代码感知折叠、纯文本交接包（兼容旧版 YAML）、多平台适配、会话检索、视口脱水。

---

## 许可证

MIT License

Copyright (c) Yoko
