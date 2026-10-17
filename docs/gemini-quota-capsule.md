# Gemini Quota Capsule

面向 Google Gemini Web 端的用户脚本（UserScript）：在页面右下角以可拖拽胶囊展示当前账号的「5 小时窗口」与「7 天周窗口」真实用量，以及基于官方重置时刻实时递减的倒计时。

- 版本：0.6.0
- 许可：MIT
- 运行环境：ScriptCat / Tampermonkey / Violentmonkey 等 UserScript 管理器
- 适用页面：`https://gemini.google.com/*`、`https://bard.google.com/*`

## 一、设计目标

- 用量与重置时间全部来自官方响应，不在客户端做本地累计或线性外推。
- 5H 与 7D 必须严格分池：宁可暂时显示 `--%`，也绝不把周额度写进 5H 槽位。
- 倒计时只能由「官方重置时刻 − 当前时间」得出，每秒重算，不使用固定周期常量。
- 所有网络拦截只读，不修改请求与响应；数据仅存本地 `localStorage`。

## 二、数据来源（按优先级）

| 优先级 | 通道 | 说明 |
| --- | --- | --- |
| 1 | 捕获并重放 `batchexecute`（`wrb.fr` 帧） | document-start 包装 `fetch` / `XMLHttpRequest`，命中配额帧后保存请求模板，后续直接重放 |
| 2 | 同源 `GET /usage` | 解析服务端渲染 HTML 中的 `AF_initDataCallback` 数据块与 DOM 卡片文本 |
| 3 | 隐藏 iframe 探测 `/usage` | 需要真实渲染结果时以 1×1 iframe 加载页面，读取 `contentDocument` 并按 300ms 轮询 + `MutationObserver` 提取 |
| 4 | `window.WIZ_global_data` | 首屏预置数据的兜底扫描 |
| 5 | 本地缓存 | 仅用于首屏回显，恢复时 `updatedAt = 0`，会被任何新数据立即覆盖 |

自动同步间隔 3 分钟；聊天响应返回后 1.8 秒追加一次静默同步；窗口到期瞬间再补一次。

## 三、解析策略

### 3.1 第一层：结构化 pools（置信度 3）

官方 `getUsageInfo.pools` 的真实形态：

```jsonc
{
  "viewer": { "rpcs": { "getUsageInfo": { "pools": [
    { "poolId": "…", "poolType": "GXU_FIVE_HOURLY", "percentageUsed": 0.12,
      "gxu": { "windowRefreshesAt": "2026-10-18T09:30:00Z" } },
    { "poolId": "…", "poolType": "GXU_WEEKLY",      "percentageUsed": 0.45,
      "gxu": { "windowRefreshesAt": "2026-10-24T09:30:00Z" } }
  ] } } }
}
```

- `poolType` / `pool_id` / `bucket` 等键上出现 `GXU_FIVE_HOURLY`（或 `5H`、`18000`）→ 5H 池；出现 `GXU_WEEKLY`（或 `WEEK`、`7D`、`604800`）→ 7D 池。
- 百分比取 `percentageUsed` / `pct` / `ratio` / `utilization`；`0 < x ≤ 1` 视为比率，乘以 100。
- 重置时刻取 `windowRefreshesAt` / `refreshesAt` / `resetAt` / `expiresAt`，兼容 ISO 8601、10/13 位数字串、`[秒, 纳秒]` 元组、`{seconds, nanos}` 对象。

### 3.2 第二层：标签启发式（置信度 1）

结构化层与启发式层**各跑一遍、按窗口合并**：如果服务端只在 `pools` 里给出周额度，而 5H 仍以元组形式存在于其他字段，5H 依然能被补齐。启发式递归扫描响应数组，用标签和窗口秒数（18000 / 604800）给元组归类。两条关键规则：

1. **父容器不参与取值。** 同一个数组节点同时命中 5H 与 7D 标签时，只递归子节点；旧版本正是因为父容器先抢到「第一个数字」，才把周额度写进了 5H。
2. **无法归属就放弃。** 标签并排出现在同一层、没有子节点可下钻时不产出数据，避免猜错。

### 3.3 第三层：官方 `/usage` 页面（置信度 2）

按卡片文本解析百分比与重置提示，5H 卡片中出现的日期（如「重置于 7 日」）不会触发周窗口误判。

## 四、时间计算

1. `parseOfficialResetTextToTimestamp` 支持：
   - 绝对时间：`2026-10-18T09:30:00Z`、`2026-10-18 09:30`、`Resets at 5:30 PM`、`将于明天 14:00 重置`；
   - 相对倒计时：`Resets in 3 hr 12 min`、`1 week 2 days`、`5 小时后重置`、`6 天后重置`。
2. 相对文案一律**以抓取时刻为锚点**换算成绝对时间戳，所以界面上的数字每秒都会递减，不会停在「5小时后重置」。
3. 渲染时 `remaining = resetAt − Date.now()`，每秒重算：
   - 7D：`3d 05h` / `12h 30m`
   - 5H：`02:03:04`
4. 到期判定：`remaining ≤ 0` 时把该窗口置为 0% 并清空重置时间，同时触发一次同步。

## 五、防串窗校验

| 规则 | 行为 |
| --- | --- |
| 5H 的重置时刻距今 > 5.5 小时 | 物理上不可能 → **整条 5H 数据作废**，不写入状态 |
| 7D 的重置时刻距今 > 7 天 30 分 | 同上 |
| 5H 与 7D 的百分比和重置时刻完全一致（启发式来源） | 判定为同一窗口被写进两个槽位 → 丢弃 5H |
| 低置信度数据试图覆盖 10 分钟内的高置信度数据 | 拒绝写入（结构化 pools / 官方页面优先） |
| 缓存中 5H 的重置时刻超出 5.5 小时 | 历史脏缓存 → 启动时直接丢弃 5H |

## 六、UI 与交互

- 胶囊展示 `5H` / `7D` 两组百分比与倒计时，悬停显示官方重置时刻、剩余时长与频次用量。
- 左侧徽章切换指示形态：横条 / 圆环 / 圆盘 / 崩坏（`bar` / `ring` / `disk` / `decay`）。
- 进度配色：`<50%` 翡翠绿、`<75%` 琥珀金、`<90%` 炽烈橙、`≥90%` 崩坏猩红。
- 拖拽位置、形态写入 `localStorage`，刷新后恢复。

## 七、配置与存储

| Key | 用途 |
| --- | --- |
| `__gemini_quota_capsule_cfg_v5__` | 形态、拖拽位置、调试开关 |
| `__gemini_quota_official_cache_v5__` | 最近一次官方配额快照（含 `confidence` / `updatedAt`） |

源码顶部常量：

| 常量 | 默认值 | 说明 |
| --- | --- | --- |
| `AUTO_SYNC_INTERVAL_MS` | 3 分钟 | 自动同步间隔 |
| `FIVE_HOUR_MS` / `WEEK_MS` | 5h / 7d | 窗口长度，用于重置时间校验 |
| `RESET_SLACK_MS` | 30 分钟 | 允许的服务端/本地时钟抖动 |
| `FRESH_MS` | 10 分钟 | 置信度保护的有效期 |

## 八、调试

控制台提供只读出口，便于核对窗口归属：

```js
__gqc.state            // 当前 5H / 7D 状态（含 confidence、updatedAt）
__gqc.dump()           // 状态 + 配置 + 最近 6 帧配额原始响应
copy(JSON.stringify(__gqc.dump(), null, 2))
__gqc.sync()           // 立即同步一次
__gqc.setDebug(true)   // 打开调试日志
```

`__gqc.dump().frames` 只保留命中配额关键字的响应帧（每帧截断 24KB），用于确认服务端字段命名是否再次变化。

## 九、测试

```bash
node --test tests/*.test.js
```

覆盖：结构化 pools 分流、父容器防串窗、混合形态补全、ISO/元组/秒级时间戳解析、相对文案基准换算、窗口长度校验、倒计时格式、`/usage` 双卡片解析、置信度保护、渲染冒烟（胶囊倒计时文本）、脏缓存自愈。当前 13 例全部通过。

## 十、已知限制

- 服务端字段一旦改名（如 `percentageUsed` → 其他拼写），结构化层会失效并回退到置信度更低的启发式；此时请用 `__gqc.dump()` 回传一帧原始响应。
- `/usage` 页面若改为纯前端渲染且不产生可捕获帧，只能依赖 iframe + DOM 文本解析。
- 多账号切换后最多等待一个同步周期（≤3 分钟）才会刷新；可点刷新按钮或调用 `__gqc.sync()`。
- `bard.google.com` 仅为兼容旧链接保留，实际会重定向到 `gemini.google.com`。

## 十一、版本历史

### v0.6.1

- 修复更新链路：头部新增 `@updateURL`（jsDelivr `@main`）与 `@downloadURL`（ghfast 代理 raw），此前缺失两者，ScriptCat 只能退回安装地址 `raw.githubusercontent.com`，该域名在部分网络下超时，导致永远检测不到更新。
- 新增 `purge-jsdelivr.yml`：推送 `main` 后主动 purge CDN 缓存并校验 CDN 上的 `@version`，消除分支最长 12 小时的缓存延迟。
- 从旧版本升级需手动重装一次（旧记录里的更新地址无法被远端改写），详见仓库 README。

### v0.6.0

- 新增结构化 `pools` 解析：按 `poolType` 精确区分 5H / 7D，作为最高优先级数据源。
- 修复 5H 串窗根因：父容器数组不再抢占标签，5H 不会再取到周额度。
- 重写重置时间解析：支持 ISO 8601、10/13 位数字串、`[秒, 纳秒]` 元组、`{seconds, nanos}` 与含周单位的相对文案。
- 倒计时统一由 `resetAt − now` 每秒重算；相对文案以抓取时刻为锚点，不再显示静态字符串。
- 新增窗口长度校验、置信度保护、脏缓存自愈与 `__gqc` 调试出口。
- 新增 `node --test` 回归测试（13 例）与 CI 校验工作流。

### v0.5.x

- 拦截 `batchexecute` 帧 + `/usage` 页面双通道同步，四形态指示器。

### v0.2.0

- 移除本地计数，改为官方用量自动获取。

### v0.1.0

- 初始版本，基于 prompt 提交事件的本地计数。

## 十二、许可证

MIT License
