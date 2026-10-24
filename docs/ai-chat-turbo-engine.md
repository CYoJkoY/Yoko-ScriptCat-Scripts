# AI Chat Turbo Engine

面向长对话与重度使用的跨平台 AI 聊天增强用户脚本。在受支持的 AI 对话页面上叠加一层轻量增强，解决四类实际痛点：长会话渲染变卡、超长代码块挤占阅读空间、大段文本撑爆输入框、上下文难以迁移到新会话。

当前版本：**0.14.0**
许可证：**MIT**
运行方式：单文件用户脚本，无外部依赖，无网络请求，不申请任何 GM 权限。

---

## 特性一览

- **常驻统计 HUD**：悬浮球实时显示消息 / 脱水 / 折叠 / 文件四项指标，附负载环
- **视口脱水**：对超过保留轮次的旧消息冻结渲染，降低长对话开销
- **长代码折叠**：超过阈值的助手代码块自动折叠，保留语言与行数
- **长文本伪文件**：粘贴超长文本时转为悬浮托盘中的"虚拟文件"，发送时合并附加
- **发送鲁棒性**：多级发送按钮查找 + pointer 序列模拟 + form 兜底提交
- **推理强度记忆**：自动记住每个平台上次使用的思考开关 / 推理强度，新对话与刷新后静默还原
- **一键交接**：单按钮完成"生成交接包 → 打开新对话 → 填入恢复指令"，任一步失败自动把进度复制到剪贴板
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

1. 安装用户脚本管理器（ScriptCat 推荐）。
2. 点击安装入口直接安装（推荐，可自动更新）：[AI Chat Turbo Engine](https://ghfast.top/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/main/scripts/ai-chat-turbo-engine.js)。
3. 或在管理器中新建脚本、粘贴脚本完整内容后保存。
4. 打开受支持的对话页面，右下角出现 `Turbo` 悬浮球即表示生效。

脚本以 `@run-at document-start` 注入，`@noframes`，`@grant none`。头部声明了 `@updateURL`（jsDelivr）与 `@downloadURL`（ghfast 代理），不依赖在部分网络下会超时的 `raw.githubusercontent.com`；从没有这两个字段的旧版本升级需重装一次，详见仓库 README。

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
- **视觉边界过滤（0.13.8）**：在把兄弟节点并入边界之前，先剔除以下类型，避免误把悬浮控件或过度外扩的容器当作 composer 的一部分：
  - `position: fixed / sticky` 的元素（如"跳回输入框"等悬浮按钮）
  - 不含输入类子节点的单独 `button` / `[role="button"]`
  - 顶部已滚出视口上方（`rect.top < 8`）的节点，命中后立即终止向上扩展
  - 高度超过 `max(baseRect.height * 3, 320px)` 的巨型容器（通常代表整段对话容器）
- **rAF 持续追踪循环**：以 90ms 间隔调用位置更新，捕捉 `ResizeObserver` 无法感知的纯平移。循环仅在存在虚拟文件时运行。
- **位置签名去重**：每帧计算 `left|bottom|width|maxHeight` 组合签名，未变化时不写样式，避免打断 CSS 过渡。
- **输入框引用缓存**：仅在失效时才走完整 `getChatInput()`，避免每帧全量查询。
- **`ResizeObserver` 扩展**：同时观察输入框、anchor、以及向上 5 层的祖先及其父节点，覆盖"祖先 wrapper 被附件撑高"的场景。
- **`visualTop` 钳制（0.13.8）**：在 `positionVirtualFileTray` 中，对最终计算出的 `visualTop` 做上下限夹取：
  - 上界：`min(visualTop, inputRect.top)`，绝不高于输入框顶部
  - 下界：`max(viewportPadding + verticalGap + 60, …)`，确保托盘不会因视觉边界异常而跑出视口

  这一层钳制用于兜底，即使 `getComposerVisualBounds` 因为某些未知结构算出了异常值，托盘位置仍保持在视口内。

### 发送按钮查找与触发

完整的"发送意图识别 → 按钮查找 → 事件模拟 → 兜底提交"链路，解决平台改版或按钮不在预期位置时消息发不出去的问题。

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

#### 发送拦截 `handleSendIntercept`

- **Enter 键**：存在虚拟文件且未处于提交中时，拦截 `Enter`（不含 `Shift`、非输入法组合状态），合并虚拟文件并触发 `sendWithRetry`。
- **点击**：判断用户是否点击了"发送按钮"时，**不再强制依赖 `isSendControlForInput`**，而是：
  1. 先用 `currentPlatform.sendButtonSelectors` 做 `closest()` 匹配；
  2. 未命中时向上最多 4 层，按 `isSendLikeButton` 兜底识别。

  命中即视为发送意图，`preventDefault + stopPropagation` 后合并虚拟文件并触发 `sendWithRetry`。

### 一键交接

把当前对话的工作状态迁移到新会话或新模型，避免从零复述。

#### 面板按钮

0.13.8 起，交接区从原来的四个按钮（发送指令 / 恢复到新对话 / 仅复制 YAML / 仅复制恢复指令）合并为**一个**：

| 按钮 | 行为 |
| --- | --- |
| 一键交接（生成并恢复） | 见下节流程 |
| 复制原始上下文（回退） | 直接把整段对话导出为 Markdown 到剪贴板 |

#### 一键交接流程

`startOneClickHandoff` 内部按优先级处理：

1. **最新助手回答中已存在完整交接包** → 直接进入 `proceedOneClickHandoff`：构建恢复指令 → 通过 `sessionStorage` 跨页暂存 → 点击新对话入口 → `resumePendingHandoffPrompt` 在新页面填入。
2. **尚无交接包** → 构建生成指令并写入输入框：
   - 输入框不存在 → 把生成指令复制到剪贴板并提示。
   - 输入框已有草稿 → **不覆盖**，把生成指令复制到剪贴板并提示。
   - 写入后 → `sendWithRetry` 发送：
     - 发送未确认 → 把生成指令复制到剪贴板并提示。
     - 发送成功 → 进入 `waitForHandoffPackage` 轮询。

#### 等待交接包

`waitForHandoffPackage` 以 600ms 间隔轮询，超时阈值 **3 分钟**：

- 轮询尚未出现助手消息（`turns.length <= baselineTurns`）时不误判；
- 一旦 `extractLatestHandoffText` 命中 → 关闭轮询并进入 `proceedOneClickHandoff`；
- 超时仍未命中 → 把生成指令复制到剪贴板并提示。

#### 失败即回退

以上所有异常分支都统一走 `copyHandoffFallback(text, statusMessage, alertMessage)`：

- 优先调用 `navigator.clipboard.writeText` 写入进度文本；
- 状态栏同步显示失败原因（`handoff-status`）；
- 剪贴板不可用时在状态栏追加提示并弹窗要求手动复制。

**"当前进度"** 的含义：

- 发送阶段失败 → 复制的是**生成指令**（`buildHandoffGenerationPrompt`）；
- 恢复阶段失败 → 复制的是**恢复指令**（`buildHandoffRestorePrompt`，即"交接包 + 前置要求" 完整模板）。

这样即使自动化全程中断，用户仍能从剪贴板直接粘贴接续。

#### 交接包格式

交接包实际是**纯文本结构化格式**（非严格 YAML），要求模型直接输出、不使用 Markdown 代码块，从 `[META]` 到 `[END]`、字段固定、每字段形如 `字段名: 内容`：

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

提取逻辑优先兼容旧版 YAML 格式（`meta:` 等顶层键），两种格式都会按纯文本处理，不依赖严格 YAML 解析。

#### 恢复指令模板

`buildHandoffRestorePrompt` 要求模型：

1. 直接读取全部字段（按纯文本处理，不必解析为代码）；
2. 输出简短摘要（目标 / 状态 / 决策 / 排除方案 / 下一步 / 角色）；
3. 直接进入角色执行 `next_actions` 首项；
4. 若 `questions` 非空，先按优先级列出并询问；
5. 字段值为「无」或空时跳过。

#### 边界处理

- 新对话输入框已有草稿时，**不覆盖**，改为复制到剪贴板并提示手动粘贴。
- 无法识别新建对话入口或无法暂存 `sessionStorage` 时，同样回退为复制到剪贴板。
- `sessionStorage` 暂存超过 5 分钟自动失效；新对话页面识别不到输入框时也会回退为复制。

### 推理强度记忆

各平台的"深度思考 / 推理强度"是会话级状态，刷新或新建对话后常常回到默认值。脚本把它变成跨会话记忆：

1. **录制**：用户点击推理控件（`深度思考`、`Thinking`、`推理强度` 等）或弹出菜单里的强度选项（`低 / 中 / 高`）后，把 `{ label, on }` 或 `{ level }` 写入 `localStorage` 的 `ai_turbo_reasoning_memory`，按 `location.hostname` 分区。
2. **还原**：页面加载与 SPA 路由变化后，以 500ms 间隔最多轮询 40 次（约 20 秒）等待控件渲染完成，然后：
   - 开关型：状态与记录不一致时用 pointer 序列点击一次；
   - 强度型：先点击推理控件展开菜单，450ms 后在可见菜单项里找同名强度并点击；找不到就派发 `Escape` 收起菜单，不留弹层。
3. **去抖**：还原过程中的点击被 `applyingReasoning` 标记屏蔽，不会被当成用户操作而覆盖记录。
4. **边界**：平台未暴露开 / 关状态（没有 `aria-pressed`、`aria-checked`、`data-state` 或 active 类名）时只记录不还原，避免把用户的开关反向切掉。

面板开关「记住推理强度」控制整个功能，关闭后立即写入配置并停止轮询。

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
| `rememberReasoning` | boolean | true | 是否记住并在新对话中还原推理强度 |

悬浮球位置存储在 `ai_turbo_pill_pos`；推理强度记忆按主机名存放在 `ai_turbo_reasoning_memory`；跨页交接暂存使用 `sessionStorage` 的 `ai_turbo_handoff_restore`。

---

## 设计与实现要点

### 更新调度

页面变更由 `MutationObserver` 捕获。为避免观察自身写入导致的自激循环，脚本在修改 DOM 时进入 `selfMutationDepth > 0` 状态，观察回调直接跳过。渲染更新统一经 `requestAnimationFrame` 调度，最短间隔 **80ms**。

### 读写分离

所有布局读取（`offsetHeight`、`getBoundingClientRect`）集中在写入之前完成，写入阶段不触发回流读取，避免 Layout Thrashing。伪文件托盘的位置计算同样读写分离：一次性读取 anchor、input 与相邻兄弟节点的几何信息，算出最终位置后统一写入。

### 增量与全量同步

`turnIndex` 记录已索引消息。结构变化（消息增删、顺序改变、选择器组切换）触发全量同步，其余情况只处理 dirty 集合。选择器组按命中优先级依次尝试并缓存，SPA 路由变化时失效重选。

### 三重位置感知

伪文件托盘的位置更新由三套机制协同：

- `ResizeObserver`：捕捉尺寸变化（原生附件插入、输入框变高、composer 撑开）
- rAF 追踪循环：以 90ms 间隔捕捉纯位置变化（`ResizeObserver` 无法感知的平移）
- 视觉边界过滤 + `visualTop` 钳制（0.13.8）：前者剔除悬浮控件和过大的兄弟容器，后者兜底把 `visualTop` 钳制在合理区间，防止托盘因异常几何值消失或跳到视口外

三者都通过 requestAnimationFrame 合并到同一入口 `positionVirtualFileTray`，配合位置签名去重，避免重复写入与抖动。

### 输入框写入 `insertTextAtomic`

- **`textarea` / `input`**：使用 `Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype | HTMLInputElement.prototype, "value").set` 调用原生 setter 写入，保证 React 受控组件能感知变化，然后派发 `input` + `change` 事件。
- **`contenteditable`（ProseMirror 等）**：优先用 `document.createRange()` + `Selection` 选中编辑器全部内容，再 `document.execCommand("insertHTML", ...)` 插入，最后补派一次 `InputEvent`。`execCommand` 失败时回退为 `textContent = text`。

### 失败即回退

凡是涉及改写平台原生结构的操作（代码折叠、交接流程、发送按钮定位、消息回显胶囊）都遵循同一原则：**无法可靠识别目标时不做修改，保持原生行为，并通过状态提示告知用户**。交接流程额外保证：任何一步失败都把当前进度写入剪贴板，允许手动接续。

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
- 脚本不申请 GM 权限，剪贴板写入依赖浏览器授权；无法写入时仅在状态栏与弹窗提示，不会抛错。
- 负载环仅按消息数量估算，与模型实际上下文容量无关。
- 伪文件只覆盖文本粘贴路径，不接管平台原生的图片与文档上传流程。
- 脱水消息内的交互元素不可点击，命中检索时会临时恢复。
- 代码折叠与交接自动化在平台结构大改时可能降级为无操作或复制到剪贴板，属于预期行为。
- 伪文件托盘的 rAF 追踪仅在存在虚拟文件时运行；页面极度繁忙（大量流式输出 + 频繁重排）时，托盘跟随可能出现一帧延迟，属于权衡选择。
- AI 生成中若平台将发送按钮替换为"停止生成"按钮，脚本会通过 `isSendLikeButton` 的排除规则跳过；请等生成结束后再发送。
- 一键交接的等待交接包上限为 **3 分钟**；模型回答极其冗长时可能触发超时，此时生成指令会被复制到剪贴板供手动重试。
- 推理强度记忆依赖平台把开 / 关状态暴露在无障碍属性上；纯 class 切换的控件能识别 `active / selected / checked / is-on` 形式的类名，其余情况只记录不还原。

---

## 版本记录

### 0.14.0

**新增推理强度记忆：AI 会记住你上次用的思考强度，新对话自动还原。**

- 新增 `handleReasoningClick`：捕获阶段监听 `click`，识别 `REASONING_CONTROL_PATTERN`（深度思考 / 思考 / 推理 / thinking / reasoning / effort 等）命中的控件，以及推理菜单里的强度选项，写入 `localStorage` 的 `ai_turbo_reasoning_memory`（按 `location.hostname` 分区）
- 新增 `controlOnState`：依次读 `input.checked`、`aria-pressed`、`aria-checked`、`data-state`、`active / selected / checked / is-on` 类名，读不到就返回 `null` 表示不可还原
- 新增 `applyReasoningMemory` / `scheduleReasoningRestore`：加载后 500ms 间隔最多轮询 40 次，等待控件渲染；开关型直接点击修正，强度型先展开菜单再点同名选项，失败则派发 `Escape` 收起
- 新增 `applyingReasoning` 守卫，还原期间的点击不会覆盖记忆
- `patchHistoryForSpaNavigation` 的 `pushState` / `popstate` 与 `boot` 均接入 `scheduleReasoningRestore`，切换会话或新对话后重新还原
- 面板新增「记住推理强度」开关，配置项 `rememberReasoning` 默认开启

### 0.13.9

**修复更新链路：补全 `@updateURL` / `@downloadURL`，ScriptCat 恢复自动检测更新。**

- 头部新增 `@updateURL`（`cdn.jsdelivr.net/gh/...@main/...`，检查更新）与 `@downloadURL`（`ghfast.top` 代理 raw，下载新版本）。此前两者缺失，管理器退回安装地址 `raw.githubusercontent.com`，该域名在部分网络下超时，表现为「永远检测不到更新」。
- 新增 `.github/workflows/purge-jsdelivr.yml`：推送 `main` 后 purge CDN 缓存并校验 CDN 上的 `@version` 与仓库一致，消除 `@main` 分支最长 12 小时的缓存窗口。
- 旧版本（无这两个字段）需重装一次才能切换通道，详见仓库 README。

### 0.13.8

**修复伪文件托盘在 DeepSeek 等页面上的定位异常，交接改为单一「一键交接」按钮，并把失败进度自动复制到剪贴板。**

#### 虚拟文件托盘定位

- **`getComposerVisualBounds` 新增四类过滤**：
  - 跳过 `position: fixed / sticky` 的兄弟节点（如"跳回输入框"悬浮按钮），避免视觉边界被错误地扩展到屏幕中部甚至上方
  - 跳过不含输入类子节点的单独 `button` / `[role="button"]`
  - 兄弟节点 `rect.top < 8`（已滚出视口上方）时立即终止向上扩展
  - 兄弟节点高度超过 `max(baseRect.height * 3, 320px)` 时终止扩展，避免把整段对话容器并入边界
- **`positionVirtualFileTray` 新增 `visualTop` 钳制**：
  - 上界：`Math.min(visualTop, inputRect.top)`
  - 下界：`Math.max(viewportPadding + verticalGap + 60, …)`
  - 兜底保证即使视觉边界异常，托盘也始终留在视口内
- 修复表现：
  - DeepSeek 长对话滚动到底部（一键跳回按钮完全出现）时，托盘不再消失或跳到按钮上方
  - 略微向上滚动（按钮未出现）时，托盘仍正确贴在输入框上方

#### 一键交接

- **面板按钮合并为单一入口**：`一键交接（生成并恢复）`
  - 移除了「发送 YAML 交接指令」「恢复到新对话」「仅复制 YAML 交接包」「仅复制新对话恢复指令」四个按钮
  - 保留「复制原始上下文（回退）」作为独立的完整上下文导出
- **新增 `startOneClickHandoff`**：
  - 已有交接包 → 直接恢复
  - 无交接包 → 自动写入生成指令并 `sendWithRetry`，发送成功后进入 `waitForHandoffPackage`
- **新增 `waitForHandoffPackage`**：
  - 600ms 间隔轮询，最多 3 分钟
  - 用 `baselineTurns` 避免在助手消息尚未出现时误判
- **新增 `proceedOneClickHandoff`**：
  - 构建恢复指令 → `sessionStorage` 暂存 → 点击新对话 → `resumePendingHandoffPrompt`
- **新增 `copyHandoffFallback`**：
  - 统一封装"状态栏提示 + 剪贴板写入 + 弹窗"三件套
  - 剪贴板不可用时会额外提示用户手动复制
- **失败分支覆盖**：输入框不存在、输入框有草稿、发送未确认、等待超时、未找到新对话入口、`sessionStorage` 不可用 —— 均把当前进度（生成指令或恢复指令）复制到剪贴板

### 0.13.7

修复"点击发送按钮后消息发不出去"的问题。根因是 `handleSendIntercept` 的 click 分支过度依赖 `isSendControlForInput`，以及 `sendWithRetry` 的发送按钮查找缺少兜底。

- **`sendButtonSelectors`（ChatGPT）扩展**：新增 `composer-send-button`、`button[data-testid*="send" i]`、`button[aria-label*="Send prompt" i]`、`button[title*="Send" i]` 等，覆盖新旧结构
- **新增 `isSendLikeButton`**：基于 `aria-label` / `title` / `data-testid` / `data-tooltip` 识别发送意图，显式排除 `stop` / `取消` 等停止按钮
- **新增 `isButtonUsable` / `isButtonDisabled`**：统一过滤隐藏、零尺寸、脚本自身 UI 内的按钮，并集中判断 disabled 状态
- **新增 `findSendControl`**：四级查找（平台选择器 → form → composer 容器 → 向上 8 层）
- **新增 `triggerSendButton`**：模拟完整的 `pointerdown → mousedown → pointerup → mouseup → click` 序列
- **新增 `fallbackKeyboardSubmit`**：优先 `form.requestSubmit()`，再派发带 `keyCode / which = 13` 的 `keydown` + `keyup`
- **重写 `sendWithRetry`**：40 次轮询，前 15 次只接受可用按钮，第 16 次起允许 disabled 并先清除 disabled 属性再点击，第 40 次走键盘兜底
- **重写 `handleSendIntercept` 的 click 分支**：选择器未命中时向上 4 层按 `isSendLikeButton` 识别
- **改进 `insertTextAtomic`**：`textarea` / `input` 使用原生 setter 写值以兼容 React 受控组件；`contenteditable` 用 `Range` + `Selection` 选中全部内容，再 `execCommand("insertHTML")`
- **`cleanupAndResume` 后置重置 `isSubmitting`**

### 0.13.5

修复原生附件存在时伪文件托盘定位错误与输入框变形问题。

- `getInputContainer` 由"取 rect.top 最小"改为"完整包裹输入框且面积最小"
- 新增 `getComposerVisualBounds`：向上追溯最多 5 层，将紧贴上方、水平重叠 ≥ 35%、垂直间隙 ≤ 48px 的兄弟节点并入视觉顶部
- 新增 rAF 持续追踪循环（90ms 间隔）
- 新增位置签名去重
- 新增输入框引用缓存
- `ResizeObserver` 观察范围扩展到输入框、anchor 及向上 5 层祖先及其父节点
- CSS 过渡对齐：`bottom / left` 120ms `cubic-bezier(0.22, 1, 0.36, 1)`，`max-height` 90ms，新增 `will-change: bottom, left, max-height`

### 0.13.x 及更早

完整消息提取、流式代码感知折叠、纯文本交接包（兼容旧版 YAML）、多平台适配、会话检索、视口脱水。

---

## 许可证

MIT License

Copyright (c) Yoko
