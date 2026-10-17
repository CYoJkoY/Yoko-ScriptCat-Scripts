# AI Chat Turbo Engine

跨平台 AI 对话增强用户脚本。面向长对话与重度使用场景，解决三件事：页面在消息累积后变卡、长代码块挤占阅读空间、上下文难以迁移到新会话。

当前版本：0.13.4
许可证：MIT
运行方式：单文件用户脚本，无外部依赖，无网络请求。

## 概述

脚本在受支持的 AI 聊天页面中注入一层轻量增强，不改写平台自身的消息结构，只在现有 DOM 上追加视觉与交互能力。所有数据保留在浏览器本地，不上传、不代理、不缓存到远端。

主要能力：

- 常驻悬浮统计，实时显示消息、脱水、折叠、虚拟文件四项指标
- 对旧消息做视口脱水，降低长对话的渲染开销
- 对超长代码块做折叠，保留语言与行数信息
- 将长文本粘贴转为伪文件胶囊，避免输入框被大量文本撑开
- 生成与恢复 YAML 格式的上下文交接包
- 在当前会话内全文检索并跳转定位

## 支持的平台

脚本按主机名自动识别平台，并加载对应选择器配置。

| 平台 | 域名 |
| --- | --- |
| ChatGPT | chatgpt.com、chat.openai.com |
| Google Gemini | gemini.google.com |
| Grok | grok.com、x.com/i/grok |
| Claude | claude.ai |
| DeepSeek | chat.deepseek.com |
| Microsoft Copilot | copilot.microsoft.com |
| Perplexity | perplexity.ai |
| Poe | poe.com |
| 豆包 | doubao.com |
| 腾讯元宝 | yuanbao.tencent.com |
| Qwen Chat | chat.qwen.ai |
| 千问 | qianwen.com |
| ChatGLM / 智谱清言 | chatglm.cn |
| Z.ai (GLM) | chat.z.ai |

平台识别失败时脚本会直接退出，不会在未适配的站点产生任何副作用。

## 安装

前置条件：

- Chrome、Edge、Firefox 或 Safari
- 任一用户脚本管理器：Tampermonkey、Violentmonkey、Greasemonkey

安装步骤：

1. 安装用户脚本管理器。
2. 在管理器中新建脚本。
3. 粘贴脚本完整内容并保存。
4. 打开受支持的对话页面，页面右下角出现 `Turbo` 悬浮球即表示已生效。

脚本的 `@run-at` 为 `document-start`，`@noframes` 为 true，不申请任何 GM 权限。

## 功能说明

### 常驻统计 HUD

悬浮球位于页面右下角，可拖拽，位置保存在 localStorage。

左侧为负载环，显示 `当前消息数 / 60`，颜色随比例由绿转黄再转红。右侧为四项指标：

| 指标 | 含义 |
| --- | --- |
| 消息 | 当前会话中检测到的消息条数 |
| 脱水 | 已被冻结渲染的消息数 |
| 折叠 | 已被折叠的代码块数 |
| 文件 | 待随下一条消息发送的虚拟文件数 |

负载环按消息数量估算，不代表模型真实上下文容量，也不用于推断回答质量。

### 视口脱水

对超过保留轮次的旧消息追加 `.ai-turbo-dehydrated`，具体样式为 `content-visibility: hidden` 配合 `contain: layout paint style`，并用 `contain-intrinsic-size` 保留占位高度，避免滚动条跳动。

设计取舍：

- 相比 `display: none`，`content-visibility: hidden` 保留节点的 `textContent` 可读性，因此历史检索、上下文导出、YAML 提取仍能覆盖全部消息。
- 被冻结消息内的按钮与链接不可点击，这是有意的取舍。通过搜索跳转命中时，脚本会即时恢复该消息并平滑滚动定位。

保留轮次可在面板中调整，范围 2 至 50，默认 8。

### 长代码折叠

高度超过 300px 的助手代码块会自动折叠至 200px 预览高度，并追加一条顶部工具栏：

- 语言标签：从 `language-*` 类名、`data-language` 属性或原生头部装饰中识别
- 行数统计：基于实时文本计算
- 展开与收起按钮

输出中的代码块显示流式状态提示，内容在 1500ms 内无变化后自动切换为静态行数。

ChatGPT 的代码卡片结构较特殊，脚本会向上查找最多 10 层祖先以定位真正包含原生代码卡片的容器，避免把整条助手消息当作折叠目标。若无法安全识别边界，则放弃折叠并恢复原样。

### 长文本伪文件胶囊

在输入框粘贴超过 1500 字符的纯文本时触发。

处理流程：

1. 拦截原生粘贴事件，文本不写入输入框。
2. 在输入框上方生成悬浮托盘，列出已捕获的虚拟文件。
3. 托盘随输入框高度变化平滑重排，始终贴合输入框的视觉上缘。
4. 发送时把虚拟文件与输入框内容合并为一条消息，用 token 标记包裹文件内容。

每个文件条目显示名称、行数、体积、类型徽标，并提供预览与删除操作。预览为独立弹层，最多展示前 8000 字符，发送时提交完整内容。

消息回显后，脚本检测到 token 即把大段文本折叠为胶囊，胶囊作为消息气泡的兄弟节点插入，不侵入平台自身结构。原始提问文本若位于胶囊内容之外，会单独保留并正常展示。

输入框变形的处理（0.13.4）：

平台原生支持文件上传时，附件预览区会插在文本输入框上方，导致输入框整体向上扩展。若仍以文本输入框顶部作为锚点，托盘会与原生附件区重叠，且可用高度被错误压缩。当前实现：

- 锚点容器从候选集合中选取顶端最高者，从而把原生附件区纳入范围
- 视觉上缘取 `min(容器 top, 输入框 top)`，并对容器相对输入框上移超过 360px 的情况降级为输入框 top，防止误匹配整页 wrapper
- 托盘最大高度同步按视觉上缘计算
- ResizeObserver 同时观察容器、输入框与容器的父节点，覆盖外层 wrapper 被附件撑高的情形
- 位置更新经 requestAnimationFrame 合帧，配合 transform 与过渡，避免闪烁

### YAML 上下文交接

用于把当前对话的工作状态迁移到新会话或新模型，避免从零复述。

生成交接包：面板中点击「发送 YAML 交接指令」，脚本向当前对话发送一段带固定结构的提示词，要求模型输出符合以下顶层字段的 YAML：

```yaml
meta:        { version, generated_at, source_model, language }
task:        { objective, success_criteria, current_status }
decisions:   { confirmed, rejected, assumptions }
progress:    { done, in_progress, next_actions }
role:        { persona, tone, response_format, boundaries }
context:     { tools, tech_stack, files, data, constraints }
open_issues: { questions, risks, blockers }
key_entities:{ people, projects, terms }
handoff_notes: []
```

恢复到新对话：

1. 从最近一条助手消息中提取符合结构的 YAML 代码块。
2. 把 YAML 嵌入恢复指令模板，模板要求先校验语法、再输出摘要、随后直接进入角色执行 next_actions 首项。
3. 触发当前平台的新建对话入口。
4. 通过 sessionStorage 跨页暂存恢复指令，待新对话渲染后自动填入输入框。

若新对话输入框已有草稿，脚本不会覆盖，而是把恢复指令写入剪贴板并提示手动粘贴。若无法识别新建对话入口，同样回退为复制到剪贴板。

辅助操作：

- 仅复制 YAML 交接包
- 仅复制新对话恢复指令
- 复制原始上下文（回退方案，直接导出整段对话为 Markdown）

### 会话历史检索

面板中的检索框在输入后经 100ms 防抖执行全文匹配，最多返回 10 条结果，每条显示消息序号与 180 字符预览。

点击结果会关闭面板、必要时恢复脱水状态、平滑滚动至目标消息并高亮约 1.8 秒。

检索覆盖全部已索引消息，包括处于脱水状态的消息。

## 交互与快捷键

| 快捷键 | 行为 |
| --- | --- |
| Alt + T | 呼出或收起主面板 |
| Esc | 关闭当前弹层（文件预览或主面板） |
| Enter | 存在虚拟文件时触发合并并发送 |

面板内所有开关即时生效并写入配置，无需刷新页面。

## 配置

配置项存储在 localStorage 的 `ai_turbo_engine_config`。

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| keepTurns | number | 8 | 保留最近 N 轮不脱水，范围 2 至 50 |
| pruneEnabled | boolean | true | 是否启用视口脱水 |
| collapseCode | boolean | true | 是否启用长代码折叠 |
| virtualFileEnabled | boolean | true | 是否启用长文本伪文件 |

悬浮球位置存储在 `ai_turbo_pill_pos`。

## 设计与实现要点

### 更新调度

页面变更由 MutationObserver 捕获。为避免观察自身写入导致的自激循环，脚本在修改 DOM 时进入 `selfMutationDepth > 0` 状态，此时观察回调直接跳过。渲染更新统一经 requestAnimationFrame 调度，最短间隔 80ms。

### 读写分离

所有布局读取（`offsetHeight`、`getBoundingClientRect`）集中在写入之前完成，写入阶段不触发回流读取，避免 Layout Thrashing。

### 增量与全量同步

`turnIndex` 记录已索引消息。结构变化（消息增删、顺序改变、选择器组切换）触发全量同步，其余情况只处理 dirty 集合。选择器组按命中优先级依次尝试并缓存，SPA 路由变化时失效重选。

### 失败即回退

凡是涉及改写平台原生结构的操作（代码折叠、新建对话、发送按钮定位）都遵循同一原则：无法可靠识别目标时不做修改，保持原生行为，并把结果通过状态提示告知用户。

### 平台扩展

在 `PLATFORMS` 中新增条目并补充 `detectPlatform()` 的域名分支即可接入新平台。条目需要的字段：

| 字段 | 用途 |
| --- | --- |
| turnSelectors | 消息节点选择器（可配合 turnSelectorGroups 做多套方案） |
| userTurnSelectors | 识别用户消息 |
| userContentSelectors | 用户消息内容容器 |
| contentSelectors | 助手消息内容容器 |
| codeSelectors | 代码块选择器 |
| inputSelectors | 输入框选择器 |
| sendButtonSelectors | 发送按钮选择器 |

## 已知限制

- 平台前端改版会导致选择器失效，需等待脚本更新。
- 脚本不申请 GM 权限，剪贴板写入依赖浏览器授权。
- 负载环仅按消息数量估算，与模型实际上下文容量无关。
- 伪文件只覆盖文本粘贴路径，不接管平台原生的图片与文档上传流程。
- 脱水消息内的交互元素不可点击，命中搜索时会临时恢复。
- 代码折叠与新建对话的自动化在平台结构大改时可能降级为无操作，属于预期行为。

## 版本记录

### 0.13.4

修复原生附件存在时伪文件托盘定位错误。

- 输入框容器识别改为选取顶端最高的候选容器，覆盖原生附件预览区
- 托盘位置与最大高度改用容器与输入框顶端的较小值作为视觉上缘
- 容器相对输入框上移超过 360px 时降级为输入框顶端，规避整页 wrapper 误匹配
- ResizeObserver 增加对容器父节点的观察
- 托盘最大高度过渡由 120ms 调整为 100ms

### 0.13.x 及更早

完整消息提取、流式代码感知折叠、YAML 交接、多平台适配、会话检索、视口脱水。

## 许可证

MIT License
