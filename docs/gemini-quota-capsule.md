# Gemini Quota Capsule

面向 Google Gemini Web 端的用户脚本（UserScript）：在页面右下角以可拖拽胶囊展示当前账号的「5 小时窗口」与「7 天周窗口」真实用量，以及基于官方重置时刻实时递减的倒计时。

- 版本：0.8.5
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
| 1 | 捕获并重放 `batchexecute`（`wrb.fr` 帧） | document-start 包装 `fetch` / `XMLHttpRequest`，命中配额帧后保存请求模板，后续直接重放。帧内只认结构化 `GXU_*` 池，不做标签猜测 |
| 2 | 同源 `GET /usage` | **登录态页面可访问，但当前取证未返回额度数据**：`status=200`、`finalUrl` 仍为 `/usage`，不能再按「页面不存在」处理；只有发生重定向离开 `/usage` 时才停用该通道 |
| 3 | 隐藏 iframe 探测 `/usage` | 同上：登录态允许 CSR 加载，但必须等到真实额度节点出现；加载 spinner 或无方向的进度条不得当作配额 |
| 4 | `window.WIZ_global_data` | 仅兜底，且禁用标签启发式：它是整页 bootstrap blob，与配额无关的 `session` / `week` / 样式文本极多 |
| 5 | 本地缓存 | 仅用于首屏回显，恢复时 `updatedAt = 0`，会被任何新数据立即覆盖 |

自动同步间隔 3 分钟；聊天响应返回后 1.8 秒追加一次静默同步；窗口到期瞬间再补一次。

## 三、解析策略

> **语义约定（全链路唯一口径）**：状态里的 `pct` 永远是**剩余**百分比，`usedPct` 是**已用**百分比。
> 官方接口给出的通常是「已用比例」（`percentageUsed`、`"34% used"`），
> 所有解析器都必须在这一层完成 `100 − 已用` 的换算，显示层不得再做方向假设。

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

- `poolType` / `pool_id` / `bucket` 等键上出现 `GXU_FIVE_HOURLY`（或 `5H`、`HOURLY`、`per_hour`、`18000`）→ 5 小时池；出现 `GXU_WEEKLY`（或 `WEEK`、`7D`、`604800`）→ 每周池。
- 数组元组必须自带 `GXU_*` 池枚举（`strictPoolKindFromLabel`）才被当作结构化数据；宽松标签（`session` / `week` / `18000` / `604800`）只用于置信度 1 的启发式，且不得在整页 blob 或聊天 RPC 帧上启用。
- 百分比分三类读取，优先级为 `剩余字段 > 已用字段 > 裸 percent`：
  - 剩余：`remainingPercent` / `percentRemaining` / `availablePct` / `leftRatio` / `remainingFraction` 等，直接使用；
  - 已用：`percentageUsed` / `usedPercent` / `usagePercent` / `usedFraction` 等，`pct = 100 − x`；
  - 裸 `percent` / `pct` / `ratio` / `utilization`：官方语义是「已用」，同样取反。
  - **量纲由字段名决定，不由数值大小决定**：键名含 `fraction` / `ratio` 的按 0~1 比率 ×100，其余按 0~100 百分数原样取用。
    旧实现用 `0 < x ≤ 1 → x × 100` 猜测量纲，把 `1` 同时当成 1% 和 100%（已用 1% 显示成 100%，剩余 100% 显示成 1%）。
- `used` / `limit` 只有在**同一个作用域**内成对出现且满足 `0 ≤ used ≤ limit` 时才换算，跨对象拼接视为无效。
- 重置时刻取 `windowRefreshesAt` / `refreshesAt` / `resetAt` / `expiresAt`，兼容 ISO 8601、10/13 位数字串、`[秒, 纳秒]` 元组、`{seconds, nanos}` 对象。

### 3.2 第二层：标签启发式（置信度 1）

结构化层与启发式层**各跑一遍、按窗口合并**：如果服务端只在 `pools` 里给出周额度，而 5H 仍以元组形式存在于其他字段，5H 依然能被补齐。启发式递归扫描响应数组，用标签和窗口秒数（18000 / 604800）给元组归类。四条关键规则：

1. **父容器不参与取值。** 同一个数组节点同时命中 5H 与 7D 标签时，只递归子节点；旧版本正是因为父容器先抢到「第一个数字」，才把周额度写进了 5H。
2. **无法归属就放弃。** 标签并排出现在同一层、没有子节点可下钻时不产出数据，避免猜错。
3. **裸数字不算百分比。** 元组里的数字既可能是 `used`、`limit`、窗口秒数或计数，方向也无从判定；只有带 `%` 的文本才会被采信。
4. **裸百分比也不采信。** 元组里的 `"100%"` 没有方向词，无法区分「剩余 / 已用」；旧版按「已用」解释，于是任意 `width:100%` 之类的文本都会变成「已用 100%」。元组与 RPC 帧路径只接受带 `剩余 / 已用 / used / remaining` 方向词的百分比，`{…}`、`<>`、`width:` 等样式或模板片段直接丢弃。

### 3.3 第三层：官方 `/usage` 页面（置信度 2）

按卡片文本解析百分比与重置提示：

- 百分比必须结合上下文判定方向：`100% used` / `100% 已用` → 剩余 0%；`剩余 34%` / `66% remaining` 直接使用；没有任何方向词时按官方页面的默认口径「已用」处理——**该口径只对可见卡片文本生效**，全文切片与结构体一律不许裸百分比。
- 同一窗口会被多级容器同时命中，取文本最短（最贴近卡片本身）的节点解析，避免祖先节点夹带别的数字。
- 可见 DOM 的结果**优先于** HTML 内嵌 `AF_initDataCallback`；blob 只用于补齐 DOM 缺失的窗口。
- 明确出现「已达上限 / 已用尽 / limit reached」时剩余为 0%。
- 全文回退切片会在**下一个窗口标签**处截断，5H 切片不会吃掉紧随其后的 7D 卡片数字；「重置于 10 月 7 日」这类日期里的「7」不会被当成周窗口标签。

## 四、时间计算

1. `parseOfficialResetTextToTimestamp` 支持：
   - 绝对时间：`2026-10-18T09:30:00Z`、`2026-10-18 09:30`、`Resets at 5:30 PM`、`将于明天 14:00 重置`、`10 月 18 日 20:30`（中文日期，未写年份且已过期一天以上时按次年计算）；
   - 相对倒计时：`Resets in 3 hr 12 min`、`4 小时 53 分钟后重置`、`剩余 2 天 3 小时`、`あと 45 分`。
2. **相对时长必须与「重置 / 刷新 / 剩余 / until」等锚点短语邻接**才会被采信，且只取紧邻锚点的那一段：
   - `4 小时 53 分钟后重置` → 4h53m；
   - `5 小时限额将于 3 小时后重置` → 3h（前面的「5 小时」是窗口标签，不参与）；
   - 裸的 `5 小时限额` / `7 天` 不产生任何时间戳。
3. 相对文案一律**以抓取时刻为锚点**换算成绝对时间戳，所以界面上的数字每秒都会递减，不会停在「5小时后重置」。
4. 渲染时 `remaining = resetAt − Date.now()`，每秒重算：
   - 7D：`3d 05h` / `12h 30m`
   - 5H：`02:03:04`
5. 到期判定：`remaining ≤ 0` 时该窗口的百分比与倒计时**一并作废**（置为未知 `--%`），不会沿用旧窗口的数字、也不会伪造 100%，同时触发一次同步。

## 五、防串窗校验

| 规则 | 行为 |
| --- | --- |
| 5H 的重置时刻距今 > 5.5 小时 | 物理上不可能 → **整条 5H 数据作废**，不写入状态 |
| 7D 的重置时刻距今 > 7 天 30 分 | 同上 |
| 记录里出现「超出本窗口长度」的重置候选，且没有相符候选 | 该记录属于另一个窗口 → 整条作废（`pickResetAt`） |
| 记录里有多个相符的重置候选 | 无法确定 → 只放弃倒计时，保留百分比，绝不猜 |
| 低置信度数据试图覆盖 10 分钟内的高置信度数据 | 拒绝写入（结构化 pools / 官方页面优先） |
| 低置信度数据声称「已用 100%」但拿不到任何官方重置时刻 | 判定为扫到了无关的 `100%` 文本 → **整条丢弃**，显示 `--%`，绝不伪造满载 |
| 缓存中 5H 的重置时刻超出 5.5 小时 | 历史脏缓存 → 启动时直接丢弃 5H |
| 缓存里的窗口已经翻篇 | 旧窗口百分比作废，显示 `--%` 并等待同步 |
| 两个窗口的剩余百分比 / 重置时刻恰好相同 | **允许**（都没用过就是合法情形）；串窗只由窗口长度校验拦截，不靠数值巧合 |

## 六、UI 与交互

- 胶囊展示 **5 小时** / **每周** 两组**已用**百分比与倒计时（徽章文案即「5小时」「每周」），悬停显示已用 / 剩余、官方重置时刻、剩余时长与频次用量。
  显示口径是「已用」：百分比越高表示用得越多，与状态里的 `pct`（剩余）相反，换算只发生在渲染层。
- 左侧徽章切换指示形态：横条 / 圆环 / 圆盘 / 崩坏（`bar` / `ring` / `disk` / `decay`）。填充量与配色同向，均按「已用」绘制（`<50%` 翡翠绿、`<75%` 琥珀金、`<90%` 炽烈橙、`≥90%` 崩坏猩红）。
- 已用达到 100% 时倒计时位置显示「已用尽」。
- 拖拽位置、形态写入 `localStorage`，刷新后恢复。

## 七、配置与存储

| Key | 用途 |
| --- | --- |
| `__gemini_quota_capsule_cfg_v5__` | 形态、拖拽位置、调试开关 |
| `__gemini_quota_official_cache_v7__` | 最近一次官方配额快照（含 `pct` 剩余 / `usedPct` 已用 / `confidence` / `updatedAt`） |

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
__gqc.state            // 当前 5 小时 / 每周状态（含 confidence、updatedAt）
__gqc.dump()           // 状态 + 配置 + 最近 6 帧配额原始响应 + 端点发现环
copy(JSON.stringify(__gqc.dump(), null, 2))
__gqc.probeUsage()     // 直连 /usage：状态码、是否被重定向、initData 块数、命中块片段
__gqc.report()         // 一键取证：DOM 限额文本 + 端点 + 关键字附近片段
__gqc.sync()           // 立即同步一次
__gqc.setDebug(true)   // 打开调试日志
```

- `probeUsage()` 返回 Promise：`JSON.stringify(__gqc.probeUsage())` 只会得到 `{}`（旧版排查时踩过这个坑）。现在它会自动 `console.log` 结果并留档到 `__gqc.lastProbe`，直接调用即可。
- `report()` 是「官方把数字放在哪」的取证入口：先打开 Gemini 自己的限额/用量弹窗、再发一条消息，然后执行它。返回内容只含**关键字附近片段**（每帧 ≤2 条、每页 ≤8 行，单条 ≤200 字符），不落整段会话；同时记录 `/usage` 体检结果、`batchexecute` 的 `rpcId` 列表与端点环。
- 脚本未更新（或分支未合并）时，可用独立探针 `scripts/network-capture-probe.js`：整段粘贴进 Console → `__gqp.watchAll()` → 打开限额弹窗并发一条消息 → `__gqp.dump()`。它不依赖脚本版本，采集口径与 `report()` 一致。
- `__gqc.dump().frames` 只保留命中配额关键字的响应帧（每帧截断 24KB），用于确认服务端字段命名是否再次变化。
- `__gqc.dump().endpoints` 是端点发现环：最近 24 条 URL 命中 `batchexecute` / `usage` / `quota` / `limit` 等的请求（只记 URL、状态码与长度），用来确认配额到底由哪个接口返回。
- `__gqc.probeUsage()` 是排查「拿不到 5 小时 / 每周用量」的第一步：`blocks` 为 0 说明页面里没有 `AF_initDataCallback`（数据只走 XHR），`blocks > 0` 但 `initHit` 为 false 说明字段结构与解析器不匹配，此时看 `blockHits[].excerpt` 就能核对真实字段名。

`__gqc.dump().diagnostics` 是轻量观测计数（只记录数量与 `rpcId`，不保存正文），用于区分两类完全不同的故障：

| 字段 | 含义 |
| --- | --- |
| `batchExecSeen` | 拦到 `/batchexecute` 响应的次数，为 0 说明拦截本身没生效 |
| `batchFrames` | 解析出的 `wrb.fr` 帧数量 |
| `quotaHits` | 其中被判定为配额帧的数量，长期为 0 说明字段命名/结构变了 |
| `lastRpcIds` | 最近出现过的 `rpcId`，便于定位真正的配额 RPC |
| `rejected` | 解析拒绝计数：`cssLike`（样式/模板片段）、`barePercent`（无方向词裸百分比）、`unverifiedFull`（无重置时刻的 100% 已用） |

## 九、回归验证

仓库内 `tests/` 已移除（见 5579b8d）。当前验证方式：

1. 语法检查：`node --check scripts/gemini-quota-capsule.js`
2. 语义自测：在页面控制台用 `__gqc._test` 直接调用纯函数，例如

```js
const t = __gqc._test;
t.pctFromTextWithContext("width:100%;height:100%");        // null（样式文本不参与）
t.pctFromTextWithContext("100%");                          // null（结构体里裸百分比不可信）
t.pctFromTextWithContext("100%", { allowBare: true });     // { pct: 0, usedPct: 100 }（官方卡片口径）
t.pctFromTextWithContext("34% used");                      // { pct: 66, usedPct: 34 }
t.readMetricFromArrayTuple(["current session", "100%"], "fiveHour", Date.now()); // null
```

3. 线上核对：`__gqc.dump().diagnostics.rejected` 若持续增长，说明拒绝逻辑正在拦截脏数据；`blocks` / `initHit` 用于判断官方页面结构是否又变了。

## 十、已知限制

- **当前没有已验证的官方额度字段。** `GXU_*` / `getUsageInfo.pools` 尚未在真实响应中出现；本次登录态 `/usage` 仅确认 `200` 且未重定向，但页面取证没有额度节点（只有 `mat-progress-spinner` 加载提示），因此脚本不得把 spinner 的 `aria-valuenow` 当百分比。
- 服务端字段一旦改名（如 `percentageUsed` → 其他拼写），结构化层会失效并回退到置信度更低的启发式；此时请用 `__gqc.dump()` 回传一帧原始响应，并先看 `diagnostics` 判断是「没拦到」还是「拦到了但结构变了」。
- 百分比若是无方向词的裸数字（既非 `used` 也非 `remaining`），只能按官方页面默认口径「已用」解释；这类来源不会被当成高置信度数据。
- `/usage` 页面若改为纯前端渲染且不产生可捕获帧，只能依赖 iframe + DOM 文本解析。
- 窗口翻篇的瞬间会显示 `--%`，直到下一次同步（≤3 分钟，或点刷新按钮）拿回新窗口的真实数字。
- 多账号切换后最多等待一个同步周期（≤3 分钟）才会刷新；可点刷新按钮或调用 `__gqc.sync()`。
- `bard.google.com` 仅为兼容旧链接保留，实际会重定向到 `gemini.google.com`。

## 十一、版本历史

### v0.8.2

- **确认 `/usage` 页面不存在**：`GET https://gemini.google.com/usage` 会被 302 到 `/app`（未登录实测）。v0.8.1 之前「官方页面」这条通道从来没有产出过真数据，旧版显示的数字全部来自 `WIZ_global_data` 的标签启发式。现在同步会先做重定向体检，跳走就停用该通道，不再解析 app 的 blob。
- **`probeUsage()` 的 `{}` 是使用姿势问题**：它是 `async`，`JSON.stringify(promise)` 恒为 `{}`。现在结果自动 `console.log` 并留档 `__gqc.lastProbe`，且新增 `redirectedAway` / `note` 字段直接说明通道是否可用。
- **新增 `__gqc.report()` 取证入口**：采样聊天 `StreamGenerateContent` 响应（旧版在这里直接 `return`，把最可能的数据源排除在外）、`batchexecute` 帧、以及页面里含「限额/剩余/用量」的可见行，只保留关键字附近片段，用来定位官方真实的字段名与 `rpcId`。
- `__gqc.dump().diagnostics` 新增 `usagePage` 体检结果与 `quotaSnippets` 计数。

### v0.8.1

修掉「5 小时与每周都显示已用 100%」的假数据链路，根因是**把无关文本当成了配额**：

1. **整页 blob 被当成配额源**：`window.WIZ_global_data`（bootstrap 数据 + 聊天 `batchexecute` 帧）里充斥着 `session` / `week` / 样式文本，宽松标签一旦命中，`width:100%` 这类字符串就被读成「已用 100%」，两个窗口于是同时满载。现在 blob 只作最后兜底，且 RPC 帧与 blob 一律禁用标签启发式。
2. **结构化层滥用了宽松标签**：`collectStructuredPools` 原先用 `session` / `week` / `18000` 判池，并把结果标成最高置信度，导致假数据压过官方页面。现在元组必须自带 `GXU_*` 池枚举才算结构化。
3. **裸百分比默认按「已用」**：无方向词的 `N%` 在结构体里无法区分剩余与已用。现在只有 `/usage` 的可见卡片文本保留该默认口径，元组、RPC、全文切片一律拒绝裸百分比；`{…}`、`<>`、`width:` 等样式/模板片段整段丢弃。
4. **取值顺序反了**：同步原先先看 `WIZ_global_data` 并 `return true`，官方 `/usage` 页面永远跑不到；`parseUsageDocument` 也让 `AF_initDataCallback` 挡住可见 DOM。现在顺序为「捕获 RPC → `/usage` SSR → iframe → WIZ 兜底」，DOM 优先于内嵌 blob。
5. **多了两道防线**：低置信度「已用 100%」若无任何官方重置时刻则整条丢弃（显示 `--%` 而不是假满载）；`__gqc.dump().diagnostics.rejected` 记录被拒绝的原因（`cssLike` / `barePercent` / `unverifiedFull`）。
6. 缓存键升级到 v7，作废旧版写入的假 100% 快照。

### v0.7.0

- **彻底修正 5H / 7D 的额度与刷新时长**，共四处根因：
  1. **百分比方向错了**：`percentageUsed`（以及 `"100% used"` 文案、`used/limit` 比率）被当成「剩余」直接显示，100% 已用会显示成「剩余 100%」。现在所有解析器统一换算成剩余，状态里同时保留 `usedPct`。
  2. **窗口标签被当成倒计时**：旧解析只要文本里出现「5 小时」就拼出 `now + 5h`，于是 5H 倒计时恒为满窗口、7D 倒计时抓到「5 天」之类的标签数字。现在相对时长必须紧邻「重置 / 剩余 / until」锚点，且只取锚点前那一段。
  3. **裸数字被猜成百分比**：元组里 `find(Number.isInteger)` 会把上限、窗口秒数、请求计数当成用量。现在只有带 `%` 的文本或具名字段才能产出百分比。
  4. **重置时刻取第一个命中值**：父容器先遍历到周额度就会把 7D 时间写进 5H。现在收集全部候选，按窗口长度筛选；多候选时放弃倒计时而不是猜。
- 窗口翻篇时不再把剩余置成 0%（旧语义遗留）或伪造 100%，而是置为未知并立即同步。
- 删除「两个窗口数值相同就丢弃 5H」的启发式：都没用过时数值相同是合法状态。
- 缓存键升级到 v6（旧缓存的百分比方向不可信），缓存恢复不再伪装成「刚刚更新」，也不再清除错误状态。
- `__gqc.dump()` 新增 `diagnostics`，用于区分「拦截未生效」与「拦到了但结构变了」。
- 新增 `tests/gemini-quota-capsule.test.mjs`（15 例，`node --test`，含一处端到端提交链路校验）。

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
