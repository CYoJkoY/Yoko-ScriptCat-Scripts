# HeyBox Up

面向小黑盒 Web 端的用户脚本（UserScript）：网页收藏列表不显示“插眼”（CY）条目，但主页收藏总数会把它们算进去。本脚本单独拉取插眼收藏，在页面右下角的浮层里列出，按帖子去重并支持搜索。

- 版本：0.1.0
- 许可：MIT
- 运行环境：ScriptCat / Tampermonkey / Violentmonkey 等 UserScript 管理器
- 适用页面：`https://www.xiaoheihe.cn/*`、`https://xiaoheihe.cn/*`

## 一、设计目标

- 只补网页端缺失的插眼列表，不伪造、不改写站点自己的收藏总数。
- 不复刻第三方插件的代码：签名算法在本脚本内独立实现，避免引入额外依赖或许可问题。
- 只读：脚本不提交收藏、不改动站点数据，拉取结果仅写入本地 `localStorage`。
- 一个帖子只出现一次：接口按评论维度返回，同一帖子的多条插眼按 `link.id` 去重。

## 二、数据来源

插眼收藏走评论列表接口，路径 `/bbs/app/profile/bbs/comment/list`，关键参数：

| 参数 | 值 | 说明 |
| --- | --- | --- |
| `only_cy` | `1` | 只要插眼记录 |
| `filter_type` | `0` | 不过滤类型 |
| `enable_new_style_collect` | `1` | 新版收藏结构 |
| `userid` / `heybox_id` | Cookie `heybox_id`（回退 `user_heybox_id`） | 当前登录用户 |
| `limit` / `offset` | 20 / 递增 | 分页 |
| `no_more` | `false` | 首页固定值 |

其余基础参数（`os_type=web`、`app=heybox`、`client_type=web`、`version=999.0.4`、`web_version=2.5`、`x_client_type=web`、`x_app=heybox_website`、`x_os_type=Windows`、`device_info=Chrome`）与站点网页端保持一致。

响应判定：`status === "ok"` 时读取 `result` 数组；`no_more === true` 或本页为空即停止翻页。单条记录取以下字段：

- `link.id`：帖子 ID，同时用于去重与跳转 `/app/bbs/link/<id>`。
- `link.title`：标题，空值回退“无标题帖子”。
- `link.thumbs[0]`：缩略图，可缺省。
- `text`：插眼时附带的评论内容。
- `create_at`：时间，按秒处理，兼容毫秒值。
- `comment_type`：`1` 记为“回复”，其余记为“评论”。

请求使用页面内 `fetch`，`credentials: include` 携带登录态。接口对 `https://www.xiaoheihe.cn` 返回 `Access-Control-Allow-Origin` 与 `Access-Control-Allow-Credentials`（实测），因此无需 `GM_xmlhttpRequest`，脚本保持 `@grant none`。

## 三、接口签名

接口要求 `hkey`、`_time`、`nonce` 三个签名参数。脚本内独立实现，全部为纯函数：

1. `time = floor(Date.now() / 1000)`。
2. `nonce = md5(time + Math.random()).toUpperCase()`，32 位十六进制。
3. 路径归一化为 `/a/b/c/`，与 35 字符字母表 `AB45STUVWZEFGJ6CH01D237IXYPQRKLMN89` 一起映射，生成 20 字符种子。
4. 种子取 MD5 后，前 5 位映射为 5 字符主体；末 6 位的字符码经列混合与求和后 `% 100` 得到 2 位校验，组合成 `hkey`。

两个容易写错的细节：

- `xtime` 左移结果不能对 255 取模，服务端算法保留高位；截断会算出不同的校验位。
- 列混合只改写前 4 个字节，但求和必须包含原数组全部 6 个字节，否则校验位偏移。

MD5 覆盖 UTF-8 字节，`md5Hex` 与 Node `crypto` 结果一致。签名只覆盖路径与时间，不覆盖查询参数。

## 四、UI 与交互

- 右下角“插眼收藏”按钮，点击展开或收起浮层；浮层使用 Shadow DOM，样式与页面隔离。
- 头部显示标题、“刷新”“收起”按钮；说明行固定提示：网页收藏列表不显示插眼，收藏总数却会计入。
- 搜索框按标题与插眼内容过滤，即时生效。
- 卡片显示缩略图、标题、插眼内容、类型与时间，点击在新标签页打开帖子。
- 加载中显示已拉取条数；失败显示错误原因与“重试”；空结果显示空状态。
- 未读到 `heybox_id` 时提示先登录小黑盒。

## 五、存储与刷新

- 缓存键 `heybox-up.cy.v1:<userid>`，值为 `{ savedAt, items }`。
- 有效期 10 分钟；命中缓存直接渲染，点“刷新”强制重新拉取。
- 单次最多 200 条（10 页），达到上限即停止，避免长列表拖慢页面。
- 缓存按用户隔离，切换账号不会读到他人数据；`localStorage` 不可用时仅本次会话生效。

## 六、回归验证

`helper/heybox-up/sign-check.cjs` 从脚本中提取 `==sign-core==` 标记之间的代码，断言：

- `md5Hex` 对空串、`abc`、中文与长串的结果与 Node `crypto` 一致。
- 真实被服务端接受的样本 `(time=1792587363, nonce=2B3C207C9CF9AF2779DEE63C509DA4E8, path=/bbs/app/profile/bbs/comment/list)` 得到 `hkey=VX2Y254`。

运行方式：

```powershell
node --check scripts/heybox-up.js
node helper/heybox-up/sign-check.cjs
```

实时验证：用同一实现生成当前时间的 URL 请求接口，返回 `{"status":"failed","msg":"该用户已注销"}`。这是用户级错误，说明签名与时间被接受；签名错误时返回 `系统时间不正确`。

## 七、已知限制

- 不改站点收藏总数；该数字由服务端 `bbs_info.favour_num` 计算，脚本只能解释差异，不能修正。
- 不把普通收藏与插眼合并为同一张表；本版只负责网页端缺失的插眼部分。
- 单用户上限 200 条；更多插眼需要分页按钮，当前未实现。
- 接口字段与签名规则由站点控制，改版后可能失效；失效时以“加载失败”提示，不会显示假数据。
- 脚本未在真实登录态页面内做过端到端点击验证；DOM 逻辑依赖 Shadow DOM 与 `fetch` 的常规行为。
- 站点 CSP 目前允许内联样式；若收紧到禁止 `style-src` 内联，浮层样式需要改为构造样式表。

## 八、版本历史

### v0.1.0

- 首个版本：插眼收藏浮层、自算接口签名、按帖子去重、搜索、10 分钟缓存、加载与错误状态。
- 新增签名回归测试与实时签名验证。

## 九、许可证

MIT License
