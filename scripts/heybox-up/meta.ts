import type { UserscriptMeta } from "../../shared/userscript/meta";

const meta = {
  name: "HeyBox Up",
  namespace: "https://cyojkoy.github.io/Payment/",
  version: "0.4.52",
  description: "补全小黑盒网页收藏：网页收藏列表不显示“插眼”(CY)，本脚本单独拉取 CY 列表，在收藏页（/app/user/favour/content）把 CY 条目补进收藏列表末尾，按帖子去重，结果缓存 10 分钟。社区首页（/app/bbs/home）隐藏右栏热门社区等冗余模块；收藏页、文章管理页与文章详情页隐藏右侧二维码、推广与备案栏。帖子详情页（/app/bbs/link/*）默认进入全屏沉浸阅读：封面优先取站点头图，头图加载失败时回退正文最大图，没有可用图片时取消封面而不留空白占位；底部阅读进度条独占 46px 栏位，标题、正文、媒体与结尾文字都不被压住；正文连续滚动并支持懒加载图片，右侧竖排点赞/收藏/评论/CY 发布/分享/行距设置。评论区改用自建侧栏，原生评论区与回复框隐藏；侧栏顶部可发布文章主评论（is_cy: 0），楼层与楼中楼条目均提供回复入口，发送对应的 reply_id 与 root_id，支持表情选择、Ctrl/⌘+Enter 提交、字数统计、提交锁、失败重试与取消回复，并按 is_cy 标记屏蔽插眼评论，楼中楼全量展示，登录账号自己发布的楼层与楼中楼回复带“删除”入口，二次确认后调用站点删除接口，并从列表与评论数中同步减去。非沉浸模式下，原生评论区监听评论列自身的滚动，接近底部时触发站点加载更多，不再依赖整页滚动。纯视频帖生成独立视频阅读页，保留原生播放控件并在没有可用来源时给出提示；帖子尚未渲染时显示可重试的等待页。支持滚轮、方向键、触屏、图片大图与阅读位置记忆，关闭后回到原生双栏。评论预览侧栏同样提供 CY 开关，面板展开后鼠标在卡片上停留即可切换预览，点评论数字始终可用。顶部导航改为首页、社区、收藏、文章四个「SVG + 文本」入口，静态与动态两套 SVG 图标按齿轮设置菜单的“动态导航图标”开关切换，动态图标仅在开关开启时出现；帖子页左右两侧纵轴中心提供 SVG 上一篇/下一篇箭头（快捷键 [ 与 ]），切换走站内路由，不整页刷新；下一篇优先从已发现队列按作者与话题降低关联度选取，队列不足时连续拉取信息流补充，相关推荐仅作兜底。社区页（/app/topic/link/*）提供只在本社区内生效的帖子搜索，支持时间筛选与加载更多。宽屏社区页改为左频道、中信息流、右热度三栏工作台，中间栏居中且宽度可在齿轮设置菜单按屏幕百分比调节（预设或自定义数值），窄屏自动退回双栏或单栏。帖子正文内嵌的游戏、专辑、百科、比赛、模组等卡片，以及“我的文章”创作者页、频道页与用户主页补齐深色适配，用户主页隐藏右栏下载二维码等冗余信息，作者信息浮层同样套用主题；正文按主题校正字色对比，段落间距收窄，正文行距可在齿轮设置或阅读页右侧面板按倍数调节。另提供跟随系统、夜航、纯黑、浅色、纸页、雾青六套主题预设，在导航栏一键切换；沉浸阅读的顶栏、互动栏、收藏夹与行距菜单、进度条、提示条与遮罩按当前预设取色，纸页与雾青不再沿用深色阅读器外观，图片与视频仍用中性黑底衬托。需要登录小黑盒：脚本以浏览器内已有登录态请求小黑盒自己的插眼收藏接口（含本地计算的请求签名）；浏览与补全只读，点赞、收藏、文章评论、楼层回复、评论删除与 CY 发布仅在用户主动点击时调用站点写接口，不改动站点收藏总数。",
  author: "Yoko",
  homepageURL: "https://github.com/CYoJkoY/Yoko-ScriptCat-Scripts/blob/main/docs/heybox-up.md",
  supportURL: "https://github.com/CYoJkoY/Yoko-ScriptCat-Scripts/issues",
  updateURL: "https://cdn.jsdelivr.net/gh/CYoJkoY/Yoko-ScriptCat-Scripts@main/dist/heybox-up.user.js",
  downloadURL: "https://ghfast.top/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/main/dist/heybox-up.user.js",
  match: ["https://www.xiaoheihe.cn/*","https://xiaoheihe.cn/*"],
  runAt: "document-start",
  grant: ["none"],
  noframes: true,
  icon: "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2032%2032'%3E%3Crect%20width='32'%20height='32'%20rx='8'%20fill='%23232b36'/%3E%3Cpath%20d='M9%207.5h14a2.5%202.5%200%200%201%202.5%202.5v12a2.5%202.5%200%200%201-2.5%202.5H9A2.5%202.5%200%200%201%206.5%2022V10A2.5%202.5%200%200%201%209%207.5Z'%20fill='none'%20stroke='%238aa7c4'%20stroke-width='1.6'/%3E%3Cpath%20d='M10.5%2016c1.2-2.1%203.1-3.2%205.5-3.2s4.3%201.1%205.5%203.2c-1.2%202.1-3.1%203.2-5.5%203.2S11.7%2018.1%2010.5%2016Z'%20fill='%23a9c0d8'/%3E%3Ccircle%20cx='16'%20cy='16'%20r='1.7'%20fill='%23232b36'/%3E%3C/svg%3E",
  license: "MIT",
} satisfies UserscriptMeta;

export default meta;
