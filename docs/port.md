# Port

独立用户脚本，版本 0.1.0。原生 JavaScript / CSS / HTML，无框架，无远程运行时依赖。

## 安装与打开

安装 [scripts/port.js](../scripts/port.js) 到 Tampermonkey / ScriptCat。在任意普通 HTTP(S) 网页，通过脚本管理器菜单选择 **Port · 打开中转站管理**。浏览器内置页、扩展商店等禁止用户脚本的页面不支持。

Port 不常驻浮动按钮，不扫描无关网页。菜单打开后才创建隔离的 Shadow DOM 工作台。首次使用为空列表，不预填真实中转站。

## 卡片与标签

- 点击「新增中转站」，填写名称、完整网址、备注和任意标签。标签用英文逗号、中文逗号或换行分隔；自动去空格、去重。
- 内置 24 个 Feather Icons 4.29.2 图标，可直接选择；支持上传 PNG / JPEG / WebP / GIF，最大 250KB，图片以 data URL 保存，不调用第三方图标服务。内置 SVG 仅来自固定图标表，不接受上传 SVG。许可证见 [port-feather-LICENSE.txt](port-feather-LICENSE.txt)。
- 左侧可同时选择多个 tag，采用 **AND 交集**：选中「常用」与「Claude」后，只显示同时包含这两个标签的卡片。标签文字区分大小写。点击「全部站点」清空标签筛选。
- 搜索会继续缩小结果，匹配名称、网址、备注和标签，不区分大小写。
- 「访问」打开站点；「编辑」修改或删除卡片。删除会确认，并删除该卡片签到结果。
- 标签由卡片自由定义，可用编辑卡片的方式调整集合；本版没有独立的空标签目录或批量签到。

## 自定义签到

每张卡片可配置一个 **同源** 签到页面和 JS 脚本。签到网址留空时使用站点网址。勾选「启用此站点签到脚本」后，卡片上的「签到」按钮才会调度代码；未启用时会提示原因。

执行过程：点击签到 → 保存随机令牌任务 → 打开目标页面 → 校验目标 origin → 消费任务 → 执行 JS → 写回结果。任务 5 分钟有效，刷新不能重复运行；普通浏览站点不会触发代码。任务参数使用 `__port_task`，与原有 URL hash 路由互不覆盖；消费后从地址栏清除该参数。同源登录跳转只要保留参数即可继续处理；若登录流程丢弃参数，登录完成后返回 Port 再点一次签到。

脚本支持顶层 `await`，可用参数如下：

| 参数 | 用法 |
| --- | --- |
| `window` / `document` | 当前站点页面对象，拥有该页面登录态 |
| `fetch` | 页面 fetch 包装，附带 Port 的超时取消信号；同源 Cookie 遵循浏览器默认行为 |
| `signal` | 30 秒执行超时信号，可用于自建异步操作 |
| `waitFor(selector, ms=10000)` | 轮询 DOM 元素，等待上限 20 秒；找不到则抛错 |

例如，**先按实际页面修改选择器**：

```js
const button = await waitFor("button.checkin");
button.click();
const message = await waitFor(".checkin-result");
if (!message.textContent.includes("签到成功")) {
  throw new Error(message.textContent || "站点未返回成功信息");
}
return message.textContent.trim();
```

Port 保存返回文本；没有 return 时只显示「脚本已执行完毕」，不推断签到成功。失败、返回值和时间会显示在卡片中；打开的管理面板每 1.5 秒更新结果，关闭后停止轮询。跨标签页编辑卡片后，点击「刷新」更新卡片列表。

代码执行在用户脚本沙箱，以显式参数访问页面。它不是隔离恶意代码的安全沙箱，只运行自己编写或已审阅的代码。脚本可能访问页面数据和用户脚本权限。30 秒超时会取消提供的 fetch / waitFor，并记录结果未知；不能强制停止同步死循环、自建定时器或绕过提供 fetch 的操作，需代码自行清理。Port 不绕过验证码，也不内置任何站点的私有 API。

## 数据与备份

数据位于脚本管理器 GM 存储，跨网站共享，不上传服务器。不同浏览器、不同脚本管理器或浏览器配置不会自动同步。卡片按独立 UUID 键存储，新增卡片不会覆盖另一站点卡片。

- 卡片：`port:v1:card:<uuid>`
- 一次性任务：`port:v1:job:<uuid>`
- 最近签到结果：`port:v1:result:<uuid>`

「导出」生成 Port v1 JSON，包含卡片、图片、脚本和启用状态，不包含 Cookie、任务和签到结果；如果自己在代码里写了密钥，导出文件也会包含它。

「导入」先验证全部卡片，再确认追加，不覆盖已有数据。所有导入脚本默认禁用；需编辑卡片逐项审阅后开启。单次最多 500 张卡片、10MB 文件。单张卡片名称最多 80 字、标签最多 30 个（每个 40 字）、备注最多 2000 字、代码最多 50000 字。存储失败会显示错误；导入中途失败会尝试撤回本次已追加项。

## 设计与验证

工作台采用石墨深色背景与薄荷绿操作色；左侧标签、顶部搜索、右侧卡片。窄屏标签移到顶部，卡片单列。原生 dialog 提供模态焦点管理，控件具备标签、键盘焦点环、标签选中状态和错误提示。Host 页与工作台 CSS 通过 Shadow DOM 隔离。

```powershell
node --check scripts/port.js
node --check tests/port.test.cjs
$env:PORT_PLAYWRIGHT_MODULE = '<本机 playwright 模块目录>'
node tests/port.test.cjs
```

测试需要 Playwright 和已安装的 Edge，依赖缺失会失败，不会静默跳过。测试在本地模拟的 HTTP(S) 页面运行，以 GM 测试适配器验证 CRUD、交集标签、搜索、上传图片、跨 origin 持久化、错误 origin 拒绝执行、任务消费与重放防护、导入脚本禁用、无效导入、导出及 390px 布局。测试把 closed Shadow DOM 改为 open，仅用于访问控件。

待确认：真实 Tampermonkey / ScriptCat 沙箱中页面 fetch 对象兼容性、站点 CSP、登录跳转以及实际签到脚本的成功判定。没有拿真实账号执行签到。仓库暂无 CI 工作流；本地模拟验证不等于真实管理器端到端验证。

## 来源与许可

- [Tampermonkey 官方文档](https://www.tampermonkey.net/documentation.php?locale=en)：GM 存储、菜单、开页和 unsafeWindow API。使用 Exa 与 Firecrawl 检索并读取官方说明；独立 Web Search 通道未完成交叉验证，管理器实际兼容性仍标待确认。
- [Feather Icons v4.29.2](https://github.com/feathericons/feather/tree/v4.29.2)：MIT 图标，固定版本子集已随脚本内置。
- Port 脚本：MIT。
