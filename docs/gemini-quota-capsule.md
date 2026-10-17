# Gemini Quota Capsule

一个面向 Google Gemini Web 端的用户脚本（UserScript），在页面右下角以可拖拽胶囊形式展示当前账号的用量配额。数据来源为 Gemini 官方 `getUsageInfo` GraphQL 接口，通过捕获页面请求中的 `query_signature` 后直接轮询获取，无需手动计数。

- 版本：0.2.0
- 许可：MIT
- 运行环境：Tampermonkey / Violentmonkey / 同类 UserScript 管理器
- 适用页面：`https://gemini.google.com/*`、`https://bard.google.com/*`

## 一、设计目标

- 用量数据必须与 Gemini 官方接口保持一致，不在客户端本地估算或累计。
- 不侵入页面交互，所有 HTTP 拦截仅做只读观察，不修改请求与响应。
- 展示层保持最小信息密度：百分比、重置倒计时、形态切换。
- 所有持久化数据仅保存在本地 `localStorage`，不进行任何外发。

## 二、功能概述

### 2.1 用量自动同步

脚本通过两个通道获取真实用量：

1. **主通道：GraphQL 轮询。** 捕获一次 `/_/BardChatUi/graphql/schemas/GEMINI_WEB_GRAPHQL/executeQuery?query_signature=...` 请求，保存完整 URL 作为模板，之后每 60 秒以 `credentials: "include"` 重放该请求，解析响应中的 `viewer.rpcs.getUsageInfo.pools` 字段。
2. **备用通道：隐藏 iframe。** 当本地尚无有效 signature 时，脚本会在页面中以 1×1 不可见 iframe 加载 `https://gemini.google.com/usage`，并 hook 该 iframe 内的 `window.fetch` 与 `XMLHttpRequest`，从真实请求中捕获 signature 与响应体。

若 GraphQL 通道连续 3 次未能获得有效数据，脚本会自动重载 iframe 以获取新的 signature。

### 2.2 配额池与刷新时间

从接口响应的 `pools` 数组中读取两类配额池：

| poolType | 含义 | 说明 |
| --- | --- | --- |
| `GXU_FIVE_HOURLY` | 5 小时窗口 | 滚动窗口配额 |
| `GXU_WEEKLY` | 每周窗口 | 7 天周期配额 |

每个池包含 `percentageUsed`（0–1 小数）与 `gxu.windowRefreshesAt`（ISO 8601 时间戳）。脚本兼容 `percentageUsed` 为 0–1 小数与 0–100 整数两种形态，并在 UI 中以整数百分比展示。

倒计时基于 `windowRefreshesAt` 计算剩余毫秒数，每秒刷新一次，不做额外估算。

### 2.3 温控配色

进度条/指示器按当前百分比区间着色：

| 区间 | 颜色 | 语义 |
| --- | --- | --- |
| 0% – 50% | 翡翠绿 `#10b981` | 充裕 |
| 50% – 75% | 琥珀金 `#f59e0b` | 平稳 |
| 75% – 90% | 炽烈橙 `#f97316` | 接近上限 |
| 90% – 100%+ | 崩坏猩红 `#f43f5e` | 临界 |

### 2.4 四种指示形态

可通过右上角按钮或设置抽屉切换：

| 形态 | 标识 | 表现形式 |
| --- | --- | --- |
| `bar` | 横条式 | 传统水平进度条 |
| `ring` | 圆环式 | SVG 环形进度 |
| `disk` | 圆盘式 | `conic-gradient` 圆盘 |
| `decay` | 崩坏式 | 六片多边形晶体，随用量增大逐步碎裂分离；比例 ≥ 88% 时进入高频震颤状态 |

`decay` 形态为默认形态，其碎裂偏移量、旋转角、外发光半径均由当前比例线性推导，不使用随机数，保证同一比例下的渲染结果一致。

### 2.5 交互与持久化

- 胶囊整体可拖拽，拖拽结束后将 `right`/`bottom` 值写回 `localStorage`。
- 点击左侧徽章在 `5H` 与 `7D` 之间切换。
- 点击齿轮按钮打开设置抽屉，关闭通过页面空白处点击或再次点击齿轮按钮实现。
- 页面刷新后自动恢复上次拖拽位置、当前视图、指示形态。

## 三、安装

1. 安装 Tampermonkey（或兼容的 UserScript 管理器）。
2. 新建脚本，将源码粘贴保存。
3. 打开 `https://gemini.google.com/`，等待胶囊出现。

首次运行时，若本地无缓存的 `query_signature`，胶囊会计数区域显示 `--%`，同步状态提示「正在捕获接口 signature…」。等待 5–15 秒后完成首次同步。若长时间无法获取，可手动打开 `https://gemini.google.com/usage` 页面触发一次请求，脚本会自动捕获 signature。

## 四、工作原理

### 4.1 网络层

```
主页面
  ├── window.fetch 包装：仅观察 URL，命中 executeQuery 时调用 captureSignature()
  └── XMLHttpRequest.prototype.open 包装：同上

隐藏 iframe（/usage）
  ├── contentWindow.fetch 包装：捕获 URL 并 clone 响应读取响应体
  └── contentWindow.XMLHttpRequest 包装：open 记录 URL，send 监听 load 读取响应体
```

所有包装函数均返回原始调用的返回值，不修改入参与出参。若 hook 过程中抛出异常，均以 `try/catch` 吞掉，不影响页面自身行为。

### 4.2 数据流

```
captureSignature(url)
  ├── 提取 query_signature 并存入 usageState
  ├── 写入 localStorage（sig / url / ts，TTL 24h）
  └── 触发一次 fetchUsageViaGraphQL()

fetchUsageViaGraphQL()
  ├── 使用缓存 URL 重放请求
  ├── parseUsageResponse() 去掉 XSSI 前缀 )]}'
  ├── extractUsage() 读取 pools
  └── updateUI()
```

`extractUsage` 优先走已知路径 `data.viewer.rpcs.getUsageInfo.pools`；若路径失配，`findPoolsRecursive` 在响应对象中递归查找形如 `[{poolType, percentageUsed, ...}]` 的数组作为兜底。递归深度上限 6 层，避免在异常响应中失控。

### 4.3 UI 更新节奏

- `updateUI()`：由数据变更事件驱动，响应态更新。
- `setInterval(updateUI, 1000)`：仅用于刷新倒计时文本，避免整秒整点同步带来的抖动。
- `setInterval(fetchUsageViaGraphQL, 60000)`：用量轮询。

三者的职责分离，避免单次请求失败时导致 UI 冻结。

## 五、配置

持久化键名与用途：

| Key | 用途 | 类型 |
| --- | --- | --- |
| `__gemini_quota_capsule_cfg_v2__` | UI 配置（视图、形态、拖拽位置） | JSON |
| `__gemini_usage_signature__` | 缓存的 `query_signature` | string |
| `__gemini_usage_url__` | 缓存的完整请求 URL 模板 | string |
| `__gemini_usage_ts__` | 缓存写入时间戳（毫秒） | string |

可调参数（源码顶部常量）：

| 常量 | 默认值 | 说明 |
| --- | --- | --- |
| `SIG_TTL_MS` | 24h | signature 缓存有效期 |
| `POLL_INTERVAL_MS` | 60s | 用量轮询间隔 |
| `IFRAME_WAIT_MS` | 15s | iframe DOM 兜底解析触发等待 |

## 六、权限与隐私

- `@grant none`：不申请任何 GM API 权限。
- 所有请求均为 `credentials: "include"` 的**同源请求**，复用当前会话 Cookie，不额外读取、存储或外发。
- 不引入任何第三方请求或统计。
- 所有状态存储于当前站点 `localStorage`，清空对应键即可完全重置。

## 七、已知限制

- **接口稳定性依赖 Gemini 服务端未变更。** 若 Google 调整 `getUsageInfo` 的字段名或响应结构，需更新 `extractUsage` 中的解析逻辑。`findPoolsRecursive` 提供了一层兜底，但不保证覆盖所有变更情形。
- **signature 可能随版本变化。** 当 signature 失效时，脚本会通过 iframe 重新捕获，但捕获过程依赖 `/usage` 页面自身发出符合条件的请求；若该页面在未来版本中改为一次性拉取或更换协议，捕获可能失败。
- **首次加载存在冷启动延迟。** 无缓存情形下，需要等待隐藏 iframe 完成页面加载并触发请求，通常 3–10 秒。
- **DOM 兜底解析精度有限。** `tryParseUsageDOM` 基于正则匹配百分比文案，仅在 GraphQL 通道完全不可用时作为最后手段，可能读到脏数据（例如页面上的其他百分比），请以 `--%` 持续显示为触发信号手工排查。
- **多账号切换场景。** 切换 Google 账号后，`query_signature` 一般仍有效，但用量数据需要等待下一次轮询（≤60 秒）。如需立即刷新，可打开 `/usage` 页面。
- **Bard 旧域名。** `@match` 保留 `bard.google.com` 兼容旧链接，但该域名已重定向至 `gemini.google.com`，实际行为以后者为准。

## 八、版本历史

### v0.2.0

- 移除本地计数逻辑（`recordUsage` / `decrementUsage` / `clearUsage`）。
- 新增用量自动获取：GraphQL 轮询 + 隐藏 iframe 捕获双通道。
- 新增 `windowRefreshesAt` 驱动的精确倒计时。
- `@namespace` 调整为带尾斜杠的目录 URL。
- 移除设置抽屉中的额度输入框与调试按钮。

### v0.1.0

- 初始版本，通过拦截 prompt 提交事件进行本地计数。

## 九、许可证

MIT License
