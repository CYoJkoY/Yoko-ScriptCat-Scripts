// ==UserScript==
// @name         HeyBox Up
// @namespace    https://cyojkoy.github.io/Payment/
// @version      0.12.12
// @description  补全小黑盒网页收藏：网页收藏列表不显示“插眼”(CY)，本脚本单独拉取 CY 列表，在收藏页（/app/user/favour/content）把 CY 条目补进收藏列表末尾，按帖子去重，首批最多 200 条，接口确认还有更多时提供「加载更多」继续分批读取，结果缓存 10 分钟。社区首页（/app/bbs/home）隐藏右栏热门社区等冗余模块；收藏页、文章管理页与文章详情页隐藏右侧二维码、推广与备案栏。帖子详情页（/app/bbs/link/*）默认进入全屏沉浸阅读：封面优先取站点头图，头图加载失败时回退正文最大图，没有可用图片时取消封面而不留空白占位；多图封面的分页条独占图片下方 32px 的空白条带，不覆盖画面；底部阅读进度条独占 46px 栏位，标题、正文、媒体与结尾文字都不被压住；正文图片移除黑色衬底与阴影，桌面上下留白 2rem、移动端 1.5rem，顶部操作栏独占一行，图片不再被渐变遮挡；正文连续滚动并支持懒加载图片，右侧竖排点赞/收藏/评论/CY 发布/分享/行距设置；收藏按钮打开收藏夹对话框，可多选加入、取消勾选移除，并能在面板里直接新建收藏夹后保存，无法核对归属的收藏夹标记「待核对」且不会因未勾选而被移除。评论区改用自建侧栏，原生评论区与回复框隐藏；侧栏顶部可发布文章主评论（is_cy: 0），楼层与楼中楼条目均提供回复入口，发送对应的 reply_id 与 root_id，表情目录从站点静态资源在线同步（12 小时本机缓存，失败回退内置目录），评论输入框里的已知 cube 与 heygirl 令牌即时渲染为精灵图，提交仍发送原令牌文本，评论里的 cube、heygirl 以及旧版图标字体与 img 标记形态的表情都能按精灵图渲染、Ctrl/⌘+Enter 提交、字数统计、提交锁、失败重试与取消回复；评论正文里的图片与接口 imgs 字段的配图都以块级图片独占一行渲染，并与正文内联图片去重；评论输入框可一次选最多 9 张图片，选后逐张上传到站点自己的对象存储，上传完成的地址随评论以 imgs 字段提交，纯图片评论也能发布；评论图片可点开大图，查看器盖在评论侧栏之上，左键逐级放大、右键逐级缩小、双击复位，长图按约半屏宽度展开，并按 is_cy 标记屏蔽插眼评论，楼中楼按回复关系递归成树，用分支竖线逐层缩进展示，缩进到第 4 层后改为同列显示，任意一层都能连整棵子树一起收起，收起处保留短缩进、虚线分支与“N 条回复已收起”提示，嵌套再深也不会把侧栏撑宽，子回复带头像并标注“回复 @昵称”，头像与昵称可点击进入对方主页，登录账号自己发布的楼层与楼中楼回复带“删除”入口，二次确认后调用站点删除接口，并从列表与评论数中同步减去。评论侧栏每次重新打开都回源读取第一页，退出帖子再进入也能看到自己刚发的评论；侧栏顶部另有“刷新评论”按钮，回复提交后先插入一行本地待同步行，再重读目标楼层所在页并合并进已加载列表，同 ID 楼层原位替换、新楼层排到顶部、其他页楼层保持原位置，随后按接口返回的 id、同账号同文本或该楼层新出现的评论 id 轮询该页直到站点回显，确认窗口内未回显的本地行改标“已提交”并在后台稀疏复查；刷新评论与删除也按同一页合并，不再用第一页整页替换列表；写操作后的 10 秒内既不读取也不写入该帖缓存，第一页缓存的新鲜期收窄到 15 秒，重开超过一分钟的旧面板也会自动刷新。非沉浸模式下，原生评论区监听评论列自身的滚动，接近底部时触发站点加载更多，不再依赖整页滚动。纯视频帖生成独立视频阅读页，保留原生播放控件并在没有可用来源时给出提示；帖子尚未渲染时显示可重试的等待页。支持滚轮、方向键、触屏、图片大图与阅读位置记忆，阅读位置除当前标签页外还写入本机记录（30 天过期、最多 200 篇），关闭标签页或在另一个窗口回到同一帖时仍能续读，关闭阅读器后回到原生双栏。评论“作者优先”排序按用户 ID 比对帖子作者，同名账号不再一并置顶。评论预览侧栏同样提供 CY 开关，面板展开后鼠标在卡片上停留即可切换预览，点评论数字始终可用。顶部导航改为社区、收藏、文章三个「SVG + 文本」入口（官方根首页 `/` 不挂载脚本），静态与动态两套 SVG 图标按齿轮设置菜单的“动态导航图标”开关切换：开启后三个入口全部换成常驻描边流转加轻微呼吸的 CSS 动态 SVG，关闭开关时退回完全静止的静态 SVG，系统减少动效时默认静止，但手动开启的开关优先；帖子页左右两侧纵轴中心提供 SVG 上一篇/下一篇箭头（快捷键 [ 与 ]），切换走站内路由，不整页刷新，上一篇沿本次会话的访问顺序逐篇回退；沉浸阅读右侧栏常驻完整“阅读时间轴”，大于 900px 时距视口右缘 16px 常驻显示，900px 及以下通过按钮打开抽屉；正文及相邻原生投票完整展示，选择与提交交给网站原生组件，状态局部同步；按访问顺序倒序列出本次会话读过的帖子并高亮当前篇，点任意一行直接跳回，右侧另有可拖动的时间轴滑轨，滑块显示 x/n 并支持拖动预览后松手跳转，每行右侧标出该篇上次读到的百分比或“读完”，行底细条同步显示进度，方向键可在记录间移动焦点；时间轴只按帖子 ID 与标题节点化保存，保留条数可在齿轮设置中调整（默认 40，0 表示不限，条数过多会提示占用内存），也可单独关闭（默认开启）；下一篇优先从已发现队列按作者与话题降低关联度选取，队列不足时连续拉取信息流补充，相关推荐仅作兜底。社区页（/app/topic/link/*）提供只在本社区内生效的帖子搜索，支持时间筛选与加载更多。宽屏社区页改为左频道、中信息流、右热度三栏工作台，中间栏居中且宽度可在齿轮设置菜单按屏幕百分比调节（预设或自定义数值），窄屏自动退回双栏或单栏。帖子正文内嵌的游戏、专辑、百科、比赛、模组等卡片，以及“我的文章”创作者页、频道页与用户主页补齐深色适配，用户主页隐藏右栏下载二维码等冗余信息，作者信息浮层同样套用主题；正文按主题校正字色对比，段落间距收窄，正文行距可在齿轮设置或阅读页右侧面板按倍数调节。另提供跟随系统、夜航、纯黑、浅色、纸页、雾青六套主题预设，在导航栏一键切换；沉浸阅读的顶栏、互动栏、收藏夹与行距菜单、进度条、提示条与遮罩按当前预设取色，纸页与雾青不再沿用深色阅读器外观，正文图片跟随主题背景，封面与视频保留中性黑底。需要登录小黑盒：脚本以浏览器内已有登录态请求小黑盒自己的插眼收藏接口（含本地计算的请求签名）；浏览与补全只读，点赞、收藏、文章评论、楼层回复、评论删除与 CY 发布仅在用户主动点击时调用站点写接口，不改动站点收藏总数。
// @author       Yoko
// @homepageURL  https://github.com/CYoJkoY/Yoko-ScriptCat-Scripts/blob/main/docs/heybox-up.md
// @supportURL   https://github.com/CYoJkoY/Yoko-ScriptCat-Scripts/issues
// @updateURL    https://cdn.jsdelivr.net/gh/CYoJkoY/Yoko-ScriptCat-Scripts@main/dist/heybox-up.user.js
// @downloadURL  https://ghfast.top/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/main/dist/heybox-up.user.js
// @match        https://www.xiaoheihe.cn/*
// @match        https://xiaoheihe.cn/*
// @run-at       document-start
// @grant        none
// @noframes
// @icon         data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%20role%3D%22img%22%20aria-label%3D%22HeyBox%20Up%2C%20using%20the%20Xiaoheihe%20logo%20mark%22%3E%0A%20%20%3C%21--%20Official%20artwork%3A%20https%3A%2F%2Fapi.xiaoheihe.cn%2Fstatic%2Futils%2Fapp_download%2Flogo.png%20--%3E%0A%20%20%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2216%22%20fill%3D%22%2317191f%22%2F%3E%0A%20%20%3Cimage%20href%3D%22data%3Aimage%2Fpng%3Bbase64%2CiVBORw0KGgoAAAANSUhEUgAAAHkAAACWCAYAAAD66CceAAAGwElEQVR42u2dW4hWVRiGn2%2FXhOGAEUVSUWBGYRhhkUJGotgBgoTSIsO8SKmLiA6QhXWhXeRFQREU2YVGRgcbCgoqSZKsNNAiy%2BxgpFBIRRgNIXZ4u9jrr3Ea%2F9GZ%2FR%2F2mvcBL7zZDOv5%2F%2F9de61vrQ9qjqQFknZKelrSREx%2BSNqs%2F%2FhN0nJJ4zwyeUneof%2FznaQFHp28JTfYLGmaRylvyQ3WOK%2Fzlzwwr3s9avlKbvCjpFskHePRy1dyg48lzfYI5i25wSuSJnkk85YsSQclPey8zlty1nld%2BGNyCCcDq4GPJM205LyZBrwn6YUc8tqSm3M98LmkFXXOa0sennHAA8CXkhZZct6cCqyVtK1ueW3Jo8vrMyw5%2F7z%2Bsg55bcnV5fVCS84%2Fr5%2BTtEXSdEvOm%2BnAFknruimvLbk13Jjer7ui3sySW0cvsBLY3em8tuQxkNeW3P68bnu9mSW3n5uBr9uZ15bc2bze1Y768KJFG%2FnHSZpbl2W%2FDnIm8GKr68OLFgi%2BDvgKeBv40FWRR8QlwLZW5XVRodxpkt4FXk6f0MbM8jQ7POq8vrfKvC4qkDtR0tPANuAye6okrx9OeX1dRyWn3L0X%2BBpYYjctyeuXJb072rwuRpG7O9MnzmWsreWylNcjPn9djCJ3z%2FL4t5UlA%2FL6uMolSzrJudtVeb1T0jWVSB6Qu984d7uKs4BXJb0jaeqIJadPSiN3J3hcu5LZwKcpr086YsmSpkp6B3jVuVurvP5G0l1D5XUxKHefTLnrI531YwLwyFB5XSTBM9NP861Aj8cri7xe0%2FhWF2kT4XXKw16GrJZIVzS%2Byfd5YpUtd0maWABXeSyGZTfwRw3%2F7h5gTkG5U2QOz%2BMRMRk4g%2FLsct043ZUhw7MBICL2RcRS4HxgEz7wlhW%2FD%2FxPROyIiFnA%2FPQzbsm5EhHrgSnAMqDfkvMVfTAiVgFnA2stOW%2FZ%2ByJiMXAh8L4l5y17e0TMpDy7vMeS85b9EnAu5dnlfkvOV%2FSBiHioG%2FLaktuX1zOArZact%2BytETEDuAn4wZLzlr2OcjtwrSXnn9eLgT5Lzp87acPuliV39hu9F%2FjIkvNnjyUbSwZ%2BbfHz91ty5%2BlrcdnPZ3UfoGMzkPwYcAKwCDilomf%2BCXwA3BERBy258zPUv4AH0z%2FjiZclG0s2lmws2ViysWRjycaSLdlYsrFkY8nGko0lG0s2lmws2ZKNJRtLNpZscEkuI21hBJxY0eMORMR%2BS%2B4eueOApyi7j%2FdU%2BNzdwOKI2Oyf685zP%2BXdzj0tuBy8T1KvJdMVzTZaxcnABZbceca3%2BPnHW%2FIYmtxZcvNsM5lLXtzi5%2F9tjZ2XfKOkuR7q%2FCdefZIWerjzltwLPFdFw2fT%2Fa9Qo274bOrznrwE2DWShs%2BmXoshExhBw2dTzxWvo2r4bOq9rDk75fWTzRo%2BD8Ef1livteseyva%2Bh234bPLZoDhsw2eT3y5UI6%2Ffcl7nv9V4eZO8Hm%2BN%2BewnD87r3rR6do41Np%2BYFsDemv3Rjbz%2BBdjWgrKf3NhbAOtr%2Bsdb7vD0A28WlKtOezweWbI8IvqLVF98JfCFxySfHAYeiIjH%2Fp14RcQuyqrErm%2F4bIblbeDC1Cfy0Nl1XRo%2BG5q1UpgXEVdExI6mr1Dd3vDZMFSjlbuBKRHx2lG9J3drw2dzSO6uBiZHxKPNemUUdWv4bADYmHJ3aUT8TBUrXt3U8Nm5y7yImDM4dytb1hzU8Nl53d7cXdYsdytfu04Nn2fSgYbPY5DVwLkRsWqkPaqKiho%2Br3ReV86mAbm7j07uQqW8fhA4D3jebkY0Sx6cu%2FMjYlZEbKebthojYm9ELEx5vdXujpgNQ%2BTu%2Brpc87BI0veqP3PbMFaT0rUY1KpoICKepdzQXwkc8Be26Vh9GxEHalkZEhH9Ka%2FPAV60TvIt%2F0l5fQNwKbDdw55xjVe6LuliyrNQfr%2FOtZAvIv6KiGfST%2Fgq53XG1Zopr5el9%2Bs%2Bq8i4JDfNLK8F5gCfWEnGddcRsRG4KOX1T1aTaXH9gLyeRFlb7ROLuZ6gSHl9D2WxwhvWlPExmZTXV1OehfrMujI%2BCxURGyhLhm%2BnXMg3OR54S3n9BDCZ8n5r53Wut%2BRGxM8RcRtlyfBGK8z4KuSI2BERc4B5lBvtJtf7rlNh2xTKDXfnda7dZAYc8ZlMWfhmcm0ZlPJ6acrrTdabcV%2BodMRnFjDfeZ15869UEDcFH%2FEZG0iaKGlNNxbymeplT5O02ZLHhuwFkr6z5PxFj5O0XNJvljw28nqdJY8N2dMlbRkkebpHJk%2FZC9Pk7JUcrmP%2BB284MXkYxmamAAAAAElFTkSuQmCC%22%20x%3D%229%22%20y%3D%225%22%20width%3D%2246%22%20height%3D%2254%22%20preserveAspectRatio%3D%22xMidYMid%20meet%22%2F%3E%0A%20%20%3Crect%20x%3D%2239%22%20y%3D%2242%22%20width%3D%2221%22%20height%3D%2215%22%20rx%3D%227.5%22%20fill%3D%22%23168cff%22%20stroke%3D%22%2317191f%22%20stroke-width%3D%222%22%2F%3E%0A%20%20%3Ctext%20x%3D%2249.5%22%20y%3D%2252.6%22%20text-anchor%3D%22middle%22%20fill%3D%22%23fff%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%228%22%20font-weight%3D%22700%22%3EUP%3C%2Ftext%3E%0A%3C%2Fsvg%3E%0A
// @license      MIT
// ==/UserScript==

"use strict";
(() => {
  // scripts/heybox-up/src/config.ts
  var STORAGE_KEYS = Object.freeze({
    hideCy: "heybox-up.hideCy.v1",
    commentPreview: "heybox-up.commentPreview.v1",
    navMotion: "heybox-up.navMotion.v1",
    reader: "heybox-up.reader.v1",
    readerTimeline: "heybox-up.readerTimeline.v1",
    readerHistoryLimit: "heybox-up.readerHistoryLimit.v1",
    feedWidth: "heybox-up.feedWidth.v1",
    readerLineHeight: "heybox-up.readerLineHeight.v1",
    theme: "heybox-up.theme.v1",
    readerPositions: "heybox-up.readerPositions.v1",
    communitySearch: "heybox-up.communitySearch.v1",
    desktopHotRanking: "heybox-up.desktopHotRanking.v1",
    desktopShortcuts: "heybox-up.desktopShortcuts.v1"
  });
  var PREFERENCE_DEFAULTS = Object.freeze({
    hideCy: false,
    commentPreview: true,
    navMotion: true,
    reader: true,
    readerTimeline: true,
    readerHistoryLimit: 40,
    feedWidth: 56,
    readerLineHeight: 1.7,
    desktopHotRanking: true,
    desktopShortcuts: true
  });
  var FEED_WIDTH_MIN = 40;
  var FEED_WIDTH_MAX = 76;
  var FEED_WIDTH_STEP = 1;
  var READER_LINE_HEIGHT_MIN = 1;
  var READER_LINE_HEIGHT_MAX = 2.2;
  var READER_LINE_HEIGHT_STEP = 0.05;
  var READER_LINE_HEIGHT_DEFAULT = 1.7;
  var READER_HISTORY_LIMIT_UNLIMITED = 0;
  var READER_HISTORY_LIMIT_WARN = 500;
  var REQUEST_TIMEOUT_MS = 15e3;
  var PAGE_SYNC_INTERVAL_MS = 120;
  var PAGE_ROUTE = Object.freeze({
    ARTICLE: "article",
    FAVOUR: "favour",
    FEED: "feed",
    TOPIC: "topic",
    CREATOR: "creator",
    OTHER: "other",
    OFFICIAL_HOME: "official-home"
  });
  var PAGE_ROUTE_RULES = Object.freeze([
    { id: PAGE_ROUTE.OFFICIAL_HOME, pattern: /^\/$/ },
    { id: PAGE_ROUTE.ARTICLE, pattern: /^\/app\/bbs\/link\/\d+(?:\/|$)/ },
    { id: PAGE_ROUTE.FAVOUR, pattern: /^\/app\/user\/favour\/content(?:\/|$)/ },
    { id: PAGE_ROUTE.FEED, pattern: /^\/app\/bbs\/home(?:\/|$)/ },
    { id: PAGE_ROUTE.TOPIC, pattern: /^\/app\/topic\/link\/\d+(?:\/|$)/ },
    { id: PAGE_ROUTE.CREATOR, pattern: /^\/creator(?:\/|$)/ }
  ]);
  var ADAPTED_ROUTES = Object.freeze([
    PAGE_ROUTE.ARTICLE,
    PAGE_ROUTE.FAVOUR,
    PAGE_ROUTE.FEED,
    PAGE_ROUTE.TOPIC,
    PAGE_ROUTE.CREATOR,
    PAGE_ROUTE.OTHER
  ]);
  function isOfficialHomePath(pathname) {
    return pathname === "/";
  }
  var PAGE_MUTATION_REGION_SELECTORS = Object.freeze({
    feed: "#page-bbs-community, #heybox-up-comment-rail",
    article: "#page-bbs-link, #heybox-up-reader",
    topic: "#page-topic-link, #heybox-up-community-search",
    favour: "#page-user-favour, .user-favour, #heybox-up-favour",
    creator: "#page-creator-content-management, #page-creator-content-management-detail",
    chrome: ".nav, .nav-actions, #heybox-up-nav, #heybox-up-theme-entry"
  });

  // scripts/heybox-up/src/core/page-sync.ts
  var pageSyncTasks = /* @__PURE__ */ new Map();
  var pageMutationRevisions = {
    feed: 0,
    article: 0,
    topic: 0,
    favour: 0,
    creator: 0,
    chrome: 0
  };
  var PAGE_MUTATION_REGION_ENTRIES = [
    ["feed", PAGE_MUTATION_REGION_SELECTORS.feed],
    ["article", PAGE_MUTATION_REGION_SELECTORS.article],
    ["topic", PAGE_MUTATION_REGION_SELECTORS.topic],
    ["favour", PAGE_MUTATION_REGION_SELECTORS.favour],
    ["creator", PAGE_MUTATION_REGION_SELECTORS.creator],
    ["chrome", PAGE_MUTATION_REGION_SELECTORS.chrome]
  ];
  var PAGE_MUTATION_REGION_COMBINED = PAGE_MUTATION_REGION_ENTRIES.map((entry) => entry[1]).join(", ");
  var PAGE_MUTATION_IGNORE_SELECTOR = '[id^="heybox-up-"], input, textarea, select, [contenteditable]:not([contenteditable="false"])';
  var EMBEDDED_MEDIA_SELECTOR = "iframe, video, audio, embed, object";
  var EMBEDDED_MEDIA_WRAPPER_SELECTOR = "div.iframe";
  var EMBEDDED_MEDIA_OBSERVED_SELECTOR = EMBEDDED_MEDIA_SELECTOR + ", " + EMBEDDED_MEDIA_WRAPPER_SELECTOR;
  var EMBEDDED_MEDIA_SOURCE_ATTRIBUTES = ["src", "srcdoc", "data"];
  var EMBEDDED_MEDIA_ATTRIBUTES = [
    ...EMBEDDED_MEDIA_SOURCE_ATTRIBUTES,
    "width",
    "height",
    "hidden",
    "style"
  ];
  var ARTICLE_LAYOUT_OBSERVED_SELECTOR = "#page-bbs-link";
  var PAGE_SYNC_ATTRIBUTE_FILTER = [
    ...EMBEDDED_MEDIA_ATTRIBUTES,
    "class",
    "data-src",
    "data-original",
    "poster"
  ];
  var pageSyncTimer = 0;
  var pageSyncLastRun = 0;
  var pageSyncRoute = readPageRoute();
  var pageSyncForceAll = false;
  function readPageRoute(pathname = location.pathname) {
    for (const rule of PAGE_ROUTE_RULES) {
      if (rule.pattern.test(pathname)) return rule.id;
    }
    return PAGE_ROUTE.OTHER;
  }
  function registerPageSync(task, intervalMs = 0, routes = ADAPTED_ROUTES, region = null) {
    pageSyncTasks.set(task, {
      intervalMs: Math.max(0, Number(intervalMs) || 0),
      lastRun: 0,
      lastRegionRevision: -1,
      pending: false,
      routes: new Set(routes),
      region
    });
  }
  function runPageSyncTasks() {
    pageSyncTimer = 0;
    const now = performance.now();
    const route = readPageRoute();
    const routeChanged = route !== pageSyncRoute;
    const forceAll = routeChanged || pageSyncForceAll;
    pageSyncForceAll = false;
    pageSyncLastRun = now;
    pageSyncRoute = route;
    for (const [task, entry] of pageSyncTasks) {
      const routeMatches = entry.routes.has(route);
      if (!routeMatches && !forceAll) {
        entry.pending = false;
        continue;
      }
      const regionRevision = entry.region === null ? -1 : pageMutationRevisions[entry.region];
      if (!forceAll && entry.region !== null && regionRevision === entry.lastRegionRevision) continue;
      if (!forceAll && now - entry.lastRun < entry.intervalMs) {
        entry.pending = true;
        continue;
      }
      entry.lastRun = now;
      entry.lastRegionRevision = regionRevision;
      entry.pending = false;
      try {
        task();
      } catch (error) {
        console.error("[HeyBox Up] DOM sync failed", error);
      }
    }
    let nextDelay = Infinity;
    for (const [, entry] of pageSyncTasks) {
      if (!entry.pending) continue;
      nextDelay = Math.min(nextDelay, Math.max(0, entry.lastRun + entry.intervalMs - now));
    }
    if (nextDelay !== Infinity) {
      pageSyncTimer = window.setTimeout(runPageSyncTasks, nextDelay);
    }
  }
  function schedulePageSync() {
    if (pageSyncTimer !== 0) return;
    const elapsed = performance.now() - pageSyncLastRun;
    pageSyncTimer = window.setTimeout(runPageSyncTasks, Math.max(0, PAGE_SYNC_INTERVAL_MS - elapsed));
  }
  function scheduleForcedPageSync() {
    pageSyncForceAll = true;
    schedulePageSync();
  }
  function bumpRegionsForRoot(root) {
    for (const [region, selector] of PAGE_MUTATION_REGION_ENTRIES) {
      if (root.matches(selector)) pageMutationRevisions[region] += 1;
    }
  }
  function notePageMutationRegions(record) {
    const targetNode = record.target;
    const target = targetNode.nodeType === Node.ELEMENT_NODE ? targetNode : targetNode.parentElement;
    if (target === null || !(target instanceof Element)) return false;
    const closestTracked = target.closest(
      PAGE_MUTATION_REGION_COMBINED + ", " + PAGE_MUTATION_IGNORE_SELECTOR
    );
    if (closestTracked !== null && closestTracked.matches(PAGE_MUTATION_IGNORE_SELECTOR)) return false;
    let touched = false;
    if (closestTracked !== null) {
      bumpRegionsForRoot(closestTracked);
      touched = true;
    }
    const changedNodes = [];
    if (record.type === "childList") {
      for (const node of record.addedNodes) changedNodes.push(node);
      for (const node of record.removedNodes) changedNodes.push(node);
    }
    let removedScriptUi = false;
    if (record.type === "childList") {
      for (const node of record.removedNodes) {
        if (node instanceof Element && (node.id.startsWith("heybox-up-") || node.querySelector('[id^="heybox-up-"]') !== null)) {
          removedScriptUi = true;
          break;
        }
      }
    }
    if (removedScriptUi) {
      for (const region of Object.keys(pageMutationRevisions)) {
        pageMutationRevisions[region] += 1;
      }
      return true;
    }
    for (const node of changedNodes) {
      if (!(node instanceof Element)) continue;
      if (node.matches(PAGE_MUTATION_REGION_COMBINED)) {
        bumpRegionsForRoot(node);
        touched = true;
      }
      for (const root of node.querySelectorAll(PAGE_MUTATION_REGION_COMBINED)) {
        bumpRegionsForRoot(root);
        touched = true;
      }
    }
    return touched;
  }
  function isObservedAttributeTarget(node) {
    if (!(node instanceof Element)) return false;
    if (node.matches(EMBEDDED_MEDIA_OBSERVED_SELECTOR)) return true;
    return node.closest(ARTICLE_LAYOUT_OBSERVED_SELECTOR) !== null;
  }
  function startPageSyncObserver() {
    if (!document.body || !document.body.isConnected) return;
    new MutationObserver((records) => {
      if (notePageSyncedRecords(records)) schedulePageSync();
    }).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...PAGE_SYNC_ATTRIBUTE_FILTER]
    });
    window.addEventListener("popstate", scheduleForcedPageSync);
    window.addEventListener("hashchange", scheduleForcedPageSync);
  }
  function notePageSyncedRecords(records) {
    let relevant = false;
    for (const record of records) {
      if (record.type === "attributes" && !isObservedAttributeTarget(record.target)) continue;
      relevant = notePageMutationRegions(record) || relevant;
    }
    return relevant;
  }
  var trackedStyleContent = /* @__PURE__ */ new WeakMap();
  var constructedStylesById = /* @__PURE__ */ new Map();
  var CAN_USE_CONSTRUCTED_STYLES = false;
  try {
    const testSheet = typeof CSSStyleSheet === "function" && typeof CSSStyleSheet.prototype.replaceSync === "function" ? new CSSStyleSheet() : null;
    if (testSheet !== null && "adoptedStyleSheets" in document) {
      testSheet.replaceSync(":root{}");
      CAN_USE_CONSTRUCTED_STYLES = true;
    }
  } catch {
    CAN_USE_CONSTRUCTED_STYLES = false;
  }
  function ensureStyleElement(id, css, appendToEnd = false) {
    if (CAN_USE_CONSTRUCTED_STYLES) {
      try {
        let entry = constructedStylesById.get(id);
        if (entry === void 0) {
          const sheet = new CSSStyleSheet();
          sheet.replaceSync(css);
          entry = { sheet, css };
          constructedStylesById.set(id, entry);
        } else if (entry.css !== css) {
          entry.sheet.replaceSync(css);
          entry.css = css;
        }
        const adopted = document.adoptedStyleSheets;
        if (!adopted.includes(entry.sheet)) {
          document.adoptedStyleSheets = [...adopted, entry.sheet];
        }
        return;
      } catch {
        CAN_USE_CONSTRUCTED_STYLES = false;
      }
    }
    let style = document.getElementById(id);
    if (style === null) {
      style = document.createElement("style");
      style.id = id;
      style.textContent = css;
      trackedStyleContent.set(style, css);
    } else if (trackedStyleContent.get(style) !== css) {
      style.textContent = css;
      trackedStyleContent.set(style, css);
    }
    const parent = document.head ?? document.documentElement;
    if (parent === null) return;
    if (style.parentNode !== parent || appendToEnd && parent === document.head && parent.lastElementChild !== style) {
      parent.append(style);
    }
  }
  function removeStyleElement(id) {
    const entry = constructedStylesById.get(id);
    if (entry !== void 0) {
      constructedStylesById.delete(id);
      const adopted = document.adoptedStyleSheets;
      if (adopted.includes(entry.sheet)) {
        document.adoptedStyleSheets = adopted.filter((sheet) => sheet !== entry.sheet);
      }
    }
    document.getElementById(id)?.remove();
  }

  // shared/storage/keyValue.ts
  var DEFAULT_MESSAGES = {
    read: "[shared/storage] read failed",
    write: "[shared/storage] write failed",
    remove: "[shared/storage] remove failed",
    parse: "[shared/storage] invalid JSON"
  };
  function reportFailure(options, operation, error) {
    if (options.onError !== void 0) {
      options.onError({ operation, error });
      return;
    }
    console.error(DEFAULT_MESSAGES[operation], error);
  }
  function createStringStorage(storage, options = {}) {
    const memory = /* @__PURE__ */ new Map();
    const useCache = options.cache !== false;
    const read = (key) => {
      if (useCache) {
        const cached = memory.get(key);
        if (cached !== void 0) return cached;
      }
      try {
        const value = storage.getItem(key);
        if (useCache && value !== null) memory.set(key, value);
        return value;
      } catch (error) {
        reportFailure(options, "read", error);
        return null;
      }
    };
    const write = (key, value) => {
      if (useCache) memory.set(key, value);
      try {
        storage.setItem(key, value);
        return true;
      } catch (error) {
        reportFailure(options, "write", error);
        return false;
      }
    };
    const remove = (key) => {
      if (useCache) memory.delete(key);
      try {
        storage.removeItem(key);
        return true;
      } catch (error) {
        reportFailure(options, "remove", error);
        return false;
      }
    };
    return {
      read,
      write,
      readJson: (key, fallback) => {
        const raw = read(key);
        if (raw === null) return fallback;
        try {
          return JSON.parse(raw);
        } catch (error) {
          reportFailure(options, "parse", error);
          return fallback;
        }
      },
      writeJson: (key, value) => {
        let serialized;
        try {
          serialized = JSON.stringify(value);
        } catch (error) {
          reportFailure(options, "write", error);
          return false;
        }
        return write(key, serialized);
      },
      remove
    };
  }
  function isStorageArea(value) {
    if (typeof value !== "object" || value === null) return false;
    return "getItem" in value && "setItem" in value && "removeItem" in value;
  }
  function resolveArea(kind) {
    const area = kind === "localStorage" ? window.localStorage : window.sessionStorage;
    if (!isStorageArea(area)) {
      throw new Error(kind + " is unavailable in this frame");
    }
    return area;
  }
  function getBrowserStorage(kind, options = {}) {
    return createStringStorage(
      {
        getItem: (key) => resolveArea(kind).getItem(key),
        setItem: (key, value) => resolveArea(kind).setItem(key, value),
        removeItem: (key) => resolveArea(kind).removeItem(key)
      },
      options
    );
  }

  // scripts/heybox-up/src/state.ts
  var silent = { onError: () => void 0 };
  var localStore = getBrowserStorage("localStorage", silent);
  var sessionStore = getBrowserStorage("sessionStorage", silent);
  var HIDE_CY_EVENT = "heybox-up:hide-cy";
  var COMMENT_PREVIEW_EVENT = "heybox-up:comment-preview";
  var NAV_MOTION_EVENT = "heybox-up:nav-motion";
  var READER_EVENT = "heybox-up:reader";
  var READER_TIMELINE_EVENT = "heybox-up:reader-timeline";
  var READER_HISTORY_LIMIT_EVENT = "heybox-up:reader-history-limit";
  var DESKTOP_RAIL_PREFERENCE_EVENT = "heybox-up:desktop-rail-preference";
  var HIDE_CY_STYLE_ID = "heybox-up-cy-style";
  var HIDE_CY_CLASS = "heybox-up-hide-cy";
  function readHideCyPreference() {
    return localStore.read(STORAGE_KEYS.hideCy) === "1";
  }
  function ensureHideCyStyle() {
    if (document.getElementById(HIDE_CY_STYLE_ID) !== null) return;
    const style = document.createElement("style");
    style.id = HIDE_CY_STYLE_ID;
    style.textContent = "body." + HIDE_CY_CLASS + ' [data-heybox-up-cy="1"] { display: none !important; }';
    (document.head ?? document.documentElement).append(style);
  }
  function applyHideCyPreference(value) {
    applyHideCyClass(value);
    document.dispatchEvent(new CustomEvent(HIDE_CY_EVENT, { detail: value }));
  }
  function applyHideCyClass(value) {
    ensureHideCyStyle();
    if (document.body !== null) document.body.classList.toggle(HIDE_CY_CLASS, value);
  }
  function setHideCyPreference(value) {
    localStore.write(STORAGE_KEYS.hideCy, value ? "1" : "0");
    applyHideCyPreference(value);
  }
  function releaseHideCy() {
    document.body?.classList.remove(HIDE_CY_CLASS);
    document.getElementById(HIDE_CY_STYLE_ID)?.remove();
  }
  function syncHideCyPreference() {
    const value = readHideCyPreference();
    if ((document.body?.classList.contains(HIDE_CY_CLASS) ?? false) === value) return;
    applyHideCyClass(value);
  }
  function readCommentPreviewPreference() {
    return localStore.read(STORAGE_KEYS.commentPreview) !== "0";
  }
  function setCommentPreviewPreference(value) {
    localStore.write(STORAGE_KEYS.commentPreview, value ? "1" : "0");
    document.dispatchEvent(new CustomEvent(COMMENT_PREVIEW_EVENT, { detail: value }));
  }
  function readNavMotionPreference() {
    return localStore.read(STORAGE_KEYS.navMotion) !== "0";
  }
  function setNavMotionPreference(value) {
    localStore.write(STORAGE_KEYS.navMotion, value ? "1" : "0");
    document.dispatchEvent(new CustomEvent(NAV_MOTION_EVENT, { detail: value }));
  }
  function readReaderPreference() {
    return localStore.read(STORAGE_KEYS.reader) !== "0";
  }
  function setReaderPreference(value) {
    localStore.write(STORAGE_KEYS.reader, value ? "1" : "0");
    document.dispatchEvent(new CustomEvent(READER_EVENT, { detail: value }));
  }
  function readReaderTimelinePreference() {
    return localStore.read(STORAGE_KEYS.readerTimeline) !== "0";
  }
  function setReaderTimelinePreference(value) {
    localStore.write(STORAGE_KEYS.readerTimeline, value ? "1" : "0");
    document.dispatchEvent(new CustomEvent(READER_TIMELINE_EVENT, { detail: value }));
  }
  function readDesktopRailPreference(module) {
    const key = module === "hotRanking" ? STORAGE_KEYS.desktopHotRanking : STORAGE_KEYS.desktopShortcuts;
    return localStore.read(key) !== "0";
  }
  function setDesktopRailPreference(module, value) {
    const key = module === "hotRanking" ? STORAGE_KEYS.desktopHotRanking : STORAGE_KEYS.desktopShortcuts;
    localStore.write(key, value ? "1" : "0");
    document.dispatchEvent(new CustomEvent(DESKTOP_RAIL_PREFERENCE_EVENT, { detail: { module, value } }));
  }
  function normalizeReaderHistoryLimit(value) {
    if (value === null || value === void 0 || value === "") return PREFERENCE_DEFAULTS.readerHistoryLimit;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < READER_HISTORY_LIMIT_UNLIMITED) {
      return PREFERENCE_DEFAULTS.readerHistoryLimit;
    }
    return parsed;
  }
  function parseReaderHistoryLimitInput(value) {
    if (value === null || value === void 0) return null;
    const text = String(value).trim();
    if (text === "") return null;
    const parsed = Number(text);
    if (!Number.isSafeInteger(parsed) || parsed < READER_HISTORY_LIMIT_UNLIMITED) return null;
    return parsed;
  }
  function readReaderHistoryLimit() {
    return normalizeReaderHistoryLimit(localStore.read(STORAGE_KEYS.readerHistoryLimit));
  }
  function setReaderHistoryLimitPreference(value) {
    const limit = normalizeReaderHistoryLimit(value);
    localStore.write(STORAGE_KEYS.readerHistoryLimit, String(limit));
    document.dispatchEvent(new CustomEvent(READER_HISTORY_LIMIT_EVENT, { detail: limit }));
    return limit;
  }
  function normalizeFeedWidth(value) {
    if (value === null || value === void 0 || value === "") return PREFERENCE_DEFAULTS.feedWidth;
    const parsed = Math.round(Number(value));
    if (!Number.isFinite(parsed)) return PREFERENCE_DEFAULTS.feedWidth;
    return Math.min(FEED_WIDTH_MAX, Math.max(FEED_WIDTH_MIN, parsed));
  }
  function readFeedWidth() {
    return normalizeFeedWidth(localStore.read(STORAGE_KEYS.feedWidth));
  }
  function applyFeedWidth(value) {
    const width = normalizeFeedWidth(value);
    document.documentElement.style.setProperty("--heybox-up-feed-pct", String(width));
    return width;
  }
  function setFeedWidthPreference(value) {
    const width = applyFeedWidth(value);
    localStore.write(STORAGE_KEYS.feedWidth, String(width));
    return width;
  }
  function isStepAligned(value, base, step) {
    const steps = (value - base) / step;
    return Math.abs(steps - Math.round(steps)) < 1e-6;
  }
  function parseFeedWidthInput(value) {
    if (value === null || value === void 0) return null;
    const text = String(value).trim();
    if (text === "") return null;
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) return null;
    if (!isStepAligned(parsed, FEED_WIDTH_MIN, FEED_WIDTH_STEP)) return null;
    return Math.min(FEED_WIDTH_MAX, Math.max(FEED_WIDTH_MIN, Math.round(parsed)));
  }
  function normalizeReaderLineHeight(value) {
    if (value === null || value === void 0 || value === "") return PREFERENCE_DEFAULTS.readerLineHeight;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return PREFERENCE_DEFAULTS.readerLineHeight;
    return Math.min(
      READER_LINE_HEIGHT_MAX,
      Math.max(READER_LINE_HEIGHT_MIN, Math.round(parsed * 100) / 100)
    );
  }
  function parseReaderLineHeightInput(value) {
    if (value === null || value === void 0) return null;
    const text = String(value).trim();
    if (text === "") return null;
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) return null;
    if (!isStepAligned(parsed, READER_LINE_HEIGHT_MIN, READER_LINE_HEIGHT_STEP)) return null;
    return Math.min(
      READER_LINE_HEIGHT_MAX,
      Math.max(READER_LINE_HEIGHT_MIN, Math.round(parsed * 100) / 100)
    );
  }
  function readReaderLineHeight() {
    return normalizeReaderLineHeight(localStore.read(STORAGE_KEYS.readerLineHeight));
  }
  function applyReaderLineHeight(value) {
    const lineHeight = normalizeReaderLineHeight(value);
    document.documentElement.style.setProperty("--heybox-up-reading-line-height", String(lineHeight));
    return lineHeight;
  }
  function setReaderLineHeightPreference(value) {
    const lineHeight = applyReaderLineHeight(value);
    localStore.write(STORAGE_KEYS.readerLineHeight, String(lineHeight));
    return lineHeight;
  }
  function isCyComment(comment) {
    if (comment === null || typeof comment !== "object") return false;
    const record = comment;
    return record["is_cy"] === 1 || record["is_cy"] === true || record["is_cy"] === "1";
  }

  // scripts/heybox-up/src/core/request.ts
  function isAbortError(error) {
    return error instanceof DOMException && error.name === "AbortError";
  }
  function waitForDelay(ms, signal) {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      if (signal?.aborted === true) {
        reject(signal.reason ?? new DOMException("请求已取消", "AbortError"));
        return;
      }
      const onAbort = () => {
        window.clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        reject(signal?.reason ?? new DOMException("请求已取消", "AbortError"));
      };
      const timer = window.setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
  async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const externalSignal = options.signal;
    const abortFromExternal = () => controller.abort(externalSignal?.reason);
    if (externalSignal?.aborted === true) controller.abort(externalSignal.reason);
    else externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
    const timer = window.setTimeout(() => {
      controller.abort(new DOMException("请求超时", "TimeoutError"));
    }, timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      window.clearTimeout(timer);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    }
  }

  // scripts/heybox-up/src/core/json.ts
  function isRecord(value) {
    return typeof value === "object" && value !== null;
  }
  function asRecord(value) {
    return isRecord(value) ? value : null;
  }
  function asUnknownArray(value) {
    return Array.isArray(value) ? value : [];
  }
  function readStringField(record, key) {
    const value = record[key];
    return typeof value === "string" ? value : "";
  }
  function readFiniteNumber(value) {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  // scripts/heybox-up/src/core/signature.ts
  var SIG_ALPHABET = "AB45STUVWZEFGJ6CH01D237IXYPQRKLMN89";
  var MD5_SHIFTS = [
    7,
    12,
    17,
    22,
    7,
    12,
    17,
    22,
    7,
    12,
    17,
    22,
    7,
    12,
    17,
    22,
    5,
    9,
    14,
    20,
    5,
    9,
    14,
    20,
    5,
    9,
    14,
    20,
    5,
    9,
    14,
    20,
    4,
    11,
    16,
    23,
    4,
    11,
    16,
    23,
    4,
    11,
    16,
    23,
    4,
    11,
    16,
    23,
    6,
    10,
    15,
    21,
    6,
    10,
    15,
    21,
    6,
    10,
    15,
    21,
    6,
    10,
    15,
    21
  ];
  var MD5_TABLE = Array.from(
    { length: 64 },
    (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 4294967296) >>> 0
  );
  function toUtf8Bytes(text) {
    const bytes = [];
    for (const char of text) {
      const point = char.codePointAt(0) ?? 0;
      if (point < 128) {
        bytes.push(point);
      } else if (point < 2048) {
        bytes.push(192 | point >> 6, 128 | point & 63);
      } else if (point < 65536) {
        bytes.push(224 | point >> 12, 128 | point >> 6 & 63, 128 | point & 63);
      } else {
        bytes.push(
          240 | point >> 18,
          128 | point >> 12 & 63,
          128 | point >> 6 & 63,
          128 | point & 63
        );
      }
    }
    return bytes;
  }
  function rotateLeft(value, shift) {
    return (value << shift | value >>> 32 - shift) >>> 0;
  }
  function md5Hex(text) {
    const bytes = toUtf8Bytes(text);
    const bitLength = bytes.length * 8;
    bytes.push(128);
    while (bytes.length % 64 !== 56) bytes.push(0);
    const high = Math.floor(bitLength / 4294967296) >>> 0;
    const low = bitLength >>> 0;
    for (const word of [low, high]) {
      bytes.push(word & 255, word >>> 8 & 255, word >>> 16 & 255, word >>> 24 & 255);
    }
    let stateA = 1732584193;
    let stateB = 4023233417;
    let stateC = 2562383102;
    let stateD = 271733878;
    for (let offset = 0; offset < bytes.length; offset += 64) {
      const words = [];
      for (let index = 0; index < 16; index += 1) {
        const base = offset + index * 4;
        words.push(
          ((bytes[base] ?? 0) | (bytes[base + 1] ?? 0) << 8 | (bytes[base + 2] ?? 0) << 16 | (bytes[base + 3] ?? 0) << 24) >>> 0
        );
      }
      let a = stateA;
      let b = stateB;
      let c = stateC;
      let d = stateD;
      for (let index = 0; index < 64; index += 1) {
        let mix;
        let slot;
        if (index < 16) {
          mix = b & c | ~b & d;
          slot = index;
        } else if (index < 32) {
          mix = d & b | ~d & c;
          slot = (5 * index + 1) % 16;
        } else if (index < 48) {
          mix = b ^ c ^ d;
          slot = (3 * index + 5) % 16;
        } else {
          mix = c ^ (b | ~d);
          slot = 7 * index % 16;
        }
        const sum = a + mix + (MD5_TABLE[index] ?? 0) + (words[slot] ?? 0) >>> 0;
        a = d;
        d = c;
        c = b;
        b = b + rotateLeft(sum, MD5_SHIFTS[index] ?? 0) >>> 0;
      }
      stateA = stateA + a >>> 0;
      stateB = stateB + b >>> 0;
      stateC = stateC + c >>> 0;
      stateD = stateD + d >>> 0;
    }
    let hex = "";
    for (const word of [stateA, stateB, stateC, stateD]) {
      for (let index = 0; index < 4; index += 1) {
        hex += (word >>> index * 8 & 255).toString(16).padStart(2, "0");
      }
    }
    return hex;
  }
  function mapByAlphabet(value, endIndex) {
    const source = endIndex < 0 ? SIG_ALPHABET.slice(0, endIndex) : SIG_ALPHABET;
    let mapped = "";
    for (let index = 0; index < value.length; index += 1) {
      mapped += source[value.charCodeAt(index) % source.length] ?? "";
    }
    return mapped;
  }
  function interleave(parts) {
    const longest = Math.max(...parts.map((part) => part.length));
    let merged = "";
    for (let index = 0; index < longest; index += 1) {
      for (const part of parts) {
        if (index < part.length) merged += part[index] ?? "";
      }
    }
    return merged;
  }
  function xtime(value) {
    return value & 128 ? (value << 1 ^ 27) & 255 : value << 1;
  }
  function mixColumns(values) {
    const quartic = (value) => xtime(value) ^ value;
    const r = (value) => quartic(xtime(value));
    const y = (value) => r(quartic(xtime(value)));
    const g = (value) => y(value) ^ r(value) ^ quartic(value);
    const v0 = values[0] ?? 0;
    const v1 = values[1] ?? 0;
    const v2 = values[2] ?? 0;
    const v3 = values[3] ?? 0;
    values[0] = g(v0) ^ y(v1) ^ r(v2) ^ quartic(v3);
    values[1] = quartic(v0) ^ g(v1) ^ y(v2) ^ r(v3);
    values[2] = r(v0) ^ quartic(v1) ^ g(v2) ^ y(v3);
    values[3] = y(v0) ^ r(v1) ^ quartic(v2) ^ g(v3);
    return values;
  }
  function createSignature(path, time, nonce) {
    const normalizedPath = "/" + path.split("/").filter(Boolean).join("/") + "/";
    const seed = interleave([
      mapByAlphabet(String(time + 1), -2),
      mapByAlphabet(normalizedPath, 0),
      mapByAlphabet(nonce, 0)
    ]).slice(0, 20);
    const digest = md5Hex(seed);
    const tail = digest.slice(-6).split("").map((char) => char.charCodeAt(0));
    const checksum = String(
      mixColumns(tail).reduce((total, value) => total + value, 0) % 100
    ).padStart(2, "0");
    return mapByAlphabet(digest.slice(0, 5), -4) + checksum;
  }

  // scripts/heybox-up/src/core/cy.ts
  var CY_API_PATH = "/bbs/app/profile/bbs/comment/list";
  var CY_PAGE_SIZE = 20;
  var CY_MAX_ITEMS = 200;
  var CACHE_TTL_MS = 10 * 60 * 1e3;
  var CACHE_KEY_PREFIX = "heybox-up.cy.v2:";
  var LINK_HREF_PREFIX = "/app/bbs/link/";
  function buildCyApiUrl(userId, offset) {
    const time = Math.floor(Date.now() / 1e3);
    const nonce = md5Hex(String(time) + String(Math.random())).toUpperCase();
    const hkey = createSignature(CY_API_PATH, time, nonce);
    const query = new URLSearchParams({
      os_type: "web",
      app: "heybox",
      client_type: "web",
      version: "999.0.4",
      web_version: "2.5",
      x_client_type: "web",
      x_app: "heybox_website",
      heybox_id: userId,
      x_os_type: "Windows",
      device_info: "Chrome",
      hkey,
      _time: String(time),
      nonce,
      userid: userId,
      only_cy: "1",
      filter_type: "0",
      enable_new_style_collect: "1",
      limit: String(CY_PAGE_SIZE),
      offset: String(offset),
      no_more: "false"
    });
    return "https://api.xiaoheihe.cn" + CY_API_PATH + "?" + query.toString();
  }
  function readCyPageRecords(result) {
    if (Array.isArray(result)) return result;
    const record = asRecord(result);
    if (record === null) return [];
    for (const key of ["links", "list", "comment_list"]) {
      const value = record[key];
      if (Array.isArray(value)) return value;
    }
    return [];
  }
  function readCyPageFinished(data, list) {
    const nested = asRecord(data["result"]);
    const hasNext = data["has_next"] ?? (nested === null ? void 0 : nested["has_next"]);
    if (hasNext === "0" || hasNext === 0 || hasNext === false) return true;
    if (hasNext === "1" || hasNext === 1 || hasNext === true) return false;
    if (data["no_more"] === true) return true;
    return list.length === 0;
  }
  function readCyLinkId(link) {
    const raw = link["linkid"] ?? link["id"];
    if (raw === null || raw === void 0) return "";
    const text = String(raw).trim();
    return text === "" ? "" : text;
  }
  async function fetchCyPage(userId, offset, signal) {
    const response = await fetchWithTimeout(buildCyApiUrl(userId, offset), {
      credentials: "include",
      headers: { accept: "application/json" },
      ...signal === void 0 || signal === null ? {} : { signal }
    });
    if (!response.ok) throw new Error("接口返回 HTTP " + response.status);
    const raw = await response.json();
    const data = asRecord(raw) ?? {};
    if (data["status"] !== "ok") throw new Error(describeCyApiFailure(data));
    const list = readCyPageRecords(data["result"]);
    return { list, noMore: readCyPageFinished(data, list) };
  }
  function describeCyApiFailure(data) {
    const record = asRecord(data);
    const rawMessage = record === null ? void 0 : record["msg"];
    const message = typeof rawMessage === "string" ? rawMessage.trim() : "";
    if (message === "hkey 不能为空" || message.includes("注销") || message.includes("登录")) {
      return "登录状态已失效，请重新登录小黑盒后点击刷新。";
    }
    return message !== "" ? message : "接口返回失败状态";
  }
  function normalizeCyItem(raw) {
    const record = asRecord(raw);
    if (record === null) return null;
    const link = asRecord(record["link"]);
    if (link === null) return null;
    const linkId = readCyLinkId(link);
    if (linkId === "") return null;
    const rawThumbs = link["thumbs"];
    const thumbs = Array.isArray(rawThumbs) ? rawThumbs : [];
    const rawTitle = link["title"];
    const rawText = record["text"];
    const firstThumb = thumbs[0];
    return {
      id: linkId,
      title: typeof rawTitle === "string" && rawTitle.trim() !== "" ? rawTitle.trim() : "无标题帖子",
      text: typeof rawText === "string" ? rawText.trim() : "",
      createAt: Number(record["create_at"]) || 0,
      thumb: typeof firstThumb === "string" ? firstThumb : "",
      kind: record["comment_type"] === 1 ? "回复" : "评论"
    };
  }
  async function loadCyFavoritesBatch(userId, options = {}, signal) {
    const seen = new Set(options.seenIds ?? []);
    const items = [];
    const requestedOffset = options.offset;
    const startOffset = typeof requestedOffset === "number" && Number.isInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;
    const maxOffset = startOffset + CY_MAX_ITEMS;
    let offset = startOffset;
    let hasMore = false;
    let nextOffset = startOffset;
    for (; ; ) {
      const page = await fetchCyPage(userId, offset, signal);
      for (const raw of page.list) {
        const item = normalizeCyItem(raw);
        if (item !== null && !seen.has(item.id)) {
          seen.add(item.id);
          items.push(item);
        }
      }
      hasMore = !page.noMore;
      nextOffset = offset + CY_PAGE_SIZE;
      options.onProgress?.(items.length);
      if (page.noMore || items.length >= CY_MAX_ITEMS) break;
      if (offset >= maxOffset) break;
      offset = nextOffset;
    }
    return { items, hasNext: hasMore, nextOffset };
  }
  function mergeCyFavorites(existing, incoming) {
    const seen = /* @__PURE__ */ new Set();
    const merged = [];
    for (const item of existing) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        merged.push(item);
      }
    }
    for (const item of incoming) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        merged.push(item);
      }
    }
    return merged;
  }
  function asCachedItem(value) {
    const record = asRecord(value);
    if (record === null) return null;
    const id = record["id"];
    const title = record["title"];
    const text = record["text"];
    const createAt = record["createAt"];
    const thumb = record["thumb"];
    const kind = record["kind"];
    if (typeof id !== "string" || id === "") return null;
    return {
      id,
      title: typeof title === "string" ? title : "",
      text: typeof text === "string" ? text : "",
      createAt: typeof createAt === "number" && Number.isFinite(createAt) ? createAt : 0,
      thumb: typeof thumb === "string" ? thumb : "",
      kind: typeof kind === "string" ? kind : ""
    };
  }
  function readCache(userId) {
    const parsed = localStore.readJson(CACHE_KEY_PREFIX + userId, null);
    const record = asRecord(parsed);
    if (record === null) return null;
    const rawItems = record["items"];
    if (!Array.isArray(rawItems)) return null;
    if (Date.now() - Number(record["savedAt"]) > CACHE_TTL_MS) return null;
    const hasNext = record["hasNext"];
    if (typeof hasNext !== "boolean") return null;
    const nextOffset = Number(record["nextOffset"]);
    if (!Number.isInteger(nextOffset) || nextOffset < 0) return null;
    const items = [];
    for (const raw of rawItems) {
      const item = asCachedItem(raw);
      if (item !== null) items.push(item);
    }
    return { items, hasNext, nextOffset };
  }
  function writeCache(userId, favorites) {
    localStore.writeJson(CACHE_KEY_PREFIX + userId, {
      savedAt: Date.now(),
      items: favorites.items,
      hasNext: favorites.hasNext,
      nextOffset: favorites.nextOffset
    });
  }
  function formatTime(value) {
    if (!value) return "";
    const milliseconds = value > 1e12 ? value : value * 1e3;
    const date = new Date(milliseconds);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("zh-CN", { hour12: false });
  }
  function createCard(item) {
    const card = document.createElement("a");
    card.className = "card";
    card.href = LINK_HREF_PREFIX + item.id;
    card.target = "_blank";
    card.rel = "noopener noreferrer";
    if (item.thumb !== "") {
      const thumb = document.createElement("img");
      thumb.className = "thumb";
      thumb.src = item.thumb;
      thumb.alt = "";
      thumb.loading = "lazy";
      thumb.referrerPolicy = "no-referrer";
      card.append(thumb);
    }
    const body = document.createElement("div");
    body.className = "body";
    const cardTitle = document.createElement("div");
    cardTitle.className = "card-title";
    cardTitle.textContent = item.title;
    const cardText = document.createElement("div");
    cardText.className = item.text !== "" ? "card-text" : "card-text is-empty";
    if (item.text === "") {
      cardText.textContent = "（无文字内容）";
    } else {
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("class", "card-text-icon");
      icon.setAttribute("viewBox", "0 0 16 16");
      icon.setAttribute("aria-hidden", "true");
      const iconPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      iconPath.setAttribute("fill", "currentColor");
      iconPath.setAttribute(
        "d",
        "M8 3C4.5 3 1.8 5.5 1 8c.8 2.5 3.5 5 7 5s6.2-2.5 7-5c-.8-2.5-3.5-5-7-5Zm0 8.2A3.2 3.2 0 1 1 8 4.8a3.2 3.2 0 0 1 0 6.4Zm0-1.7a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"
      );
      icon.append(iconPath);
      const content = document.createElement("span");
      content.className = "card-text-body";
      content.textContent = item.text;
      cardText.append(icon, content);
      cardText.title = item.text;
    }
    const foot = document.createElement("div");
    foot.className = "card-foot";
    const kind = document.createElement("span");
    kind.textContent = "插眼" + item.kind;
    const time = document.createElement("span");
    time.textContent = formatTime(item.createAt);
    foot.append(kind, time);
    body.append(cardTitle, cardText, foot);
    card.append(body);
    return card;
  }

  // scripts/heybox-up/src/core/account.ts
  function readCookie(name) {
    const prefix = name + "=";
    for (const part of document.cookie.split(";")) {
      const entry = part.trim();
      if (entry.startsWith(prefix)) {
        try {
          return decodeURIComponent(entry.slice(prefix.length));
        } catch {
          return entry.slice(prefix.length);
        }
      }
    }
    return "";
  }
  var HEYBOX_ID_PLACEHOLDERS = /* @__PURE__ */ new Set([
    "",
    "None",
    "none",
    "NONE",
    "null",
    "NULL",
    "undefined"
  ]);
  function normalizeHeyboxIdValue(value) {
    if (typeof value !== "string") return "";
    const text = value.trim();
    return HEYBOX_ID_PLACEHOLDERS.has(text) ? "" : text;
  }
  function getHeyboxId() {
    const primary = normalizeHeyboxIdValue(readCookie("heybox_id"));
    if (primary !== "") return primary;
    return normalizeHeyboxIdValue(readCookie("user_heybox_id"));
  }
  var ACCOUNT_ID_RESTORE_PATH = "/account/restore_login";
  var ACCOUNT_ID_CACHE_TTL_MS = 60 * 1e3;
  var ACCOUNT_ID_STORAGE_KEYS = [
    "heybox_id",
    "user_heybox_id",
    "account.heybox_id"
  ];
  var accountIdCache = { value: "", at: 0 };
  function readAccountIdField(record) {
    const fields = asRecord(record);
    if (fields === null) return "";
    for (const key of ["heybox_id", "heyboxId", "userid", "user_id"]) {
      const raw = fields[key];
      if (raw === null || raw === void 0) continue;
      const value = normalizeHeyboxIdValue(String(raw));
      if (value !== "") return value;
    }
    return "";
  }
  function readAccountIdFromRaw(raw) {
    if (typeof raw !== "string") return "";
    const text = raw.trim();
    if (/^\d+$/.test(text)) return text;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return "";
    }
    return readAccountIdField(parsed);
  }
  function readAccountIdFromStorage() {
    for (const key of ACCOUNT_ID_STORAGE_KEYS) {
      const local = readAccountIdFromRaw(localStore.read(key));
      if (local !== "") return local;
      const session = readAccountIdFromRaw(sessionStore.read(key));
      if (session !== "") return session;
    }
    return "";
  }
  async function readAccountIdFromStore() {
    const host = Reflect.get(window, "storeV2API");
    const store = asRecord(host);
    if (store === null || typeof store["read"] !== "function") return "";
    let pending;
    try {
      pending = store["read"](["account.heybox_id"]);
    } catch {
      return "";
    }
    if (pending === null || typeof pending !== "object") return "";
    if (typeof Reflect.get(pending, "then") !== "function") return "";
    let snapshot;
    try {
      snapshot = await pending;
    } catch {
      return "";
    }
    const result = asRecord(snapshot);
    if (result === null) return "";
    const data = asRecord(result["data"]);
    if (data === null) return "";
    const snapshots = data["snapshots"];
    if (!Array.isArray(snapshots) || snapshots.length === 0) return "";
    const first = asRecord(snapshots[0]);
    if (first === null) return "";
    const entry = asRecord(first["entry"]);
    if (entry === null || entry["exists"] !== true) return "";
    const value = entry["value"];
    if (value === null || value === void 0) return "";
    return normalizeHeyboxIdValue(String(value));
  }
  async function readAccountIdFromRestore(signal) {
    const query = new URLSearchParams(createApiParams(ACCOUNT_ID_RESTORE_PATH));
    const url = "https://api.xiaoheihe.cn" + ACCOUNT_ID_RESTORE_PATH + "?" + query.toString();
    const response = await fetchWithTimeout(url, {
      credentials: "include",
      cache: "no-store",
      headers: { accept: "application/json" },
      ...signal === void 0 || signal === null ? {} : { signal }
    });
    if (!response.ok) return "";
    const raw = await response.json();
    const data = asRecord(raw);
    if (data === null || data["status"] !== "ok") return "";
    const result = asRecord(data["result"]);
    if (result === null) return "";
    const detail = readAccountIdField(result["account_detail"]);
    if (detail !== "") return detail;
    const profile = readAccountIdField(result["profile"]);
    if (profile !== "") return profile;
    return readAccountIdField(result);
  }
  function rememberAccountId(value) {
    if (value === "") return "";
    accountIdCache.value = value;
    accountIdCache.at = Date.now();
    return value;
  }
  async function resolveHeyboxId(signal) {
    const cookieId = getHeyboxId();
    if (cookieId !== "") return rememberAccountId(cookieId);
    if (accountIdCache.value !== "" && Date.now() - accountIdCache.at < ACCOUNT_ID_CACHE_TTL_MS) {
      return accountIdCache.value;
    }
    const storeId = await readAccountIdFromStore();
    if (storeId !== "") return rememberAccountId(storeId);
    const storageId = readAccountIdFromStorage();
    if (storageId !== "") return rememberAccountId(storageId);
    const restored = await readAccountIdFromRestore(signal);
    if (restored !== "") return rememberAccountId(restored);
    return "";
  }

  // scripts/heybox-up/src/core/rnd16.ts
  var RND16_VERSION = "16";
  var RND16_KEY_BASE64 = "HFFSTsqmvG3uGxPNXDQW+1VARfqgG4nT6LS1PX7F8NQ=";
  var RND16_AAD = "heybox-rnd:v16";
  var RND16_PATHNAME_PATTERN = /^[\x21-\x7e]+$/;
  var RND16_NONCE_PATTERN = /^[0-9A-F]{32}$/;
  var RND16_TIME_PATTERN = /^(0|[1-9]\d*)$/;
  function normalizeRnd16Path(path) {
    const normalized = path.endsWith("/") ? path : path + "/";
    if (!normalized.startsWith("/") || /[\s?#\\]/.test(normalized) || !RND16_PATHNAME_PATTERN.test(normalized)) {
      throw new Error("评论签名路径不合法: " + path);
    }
    return normalized;
  }
  async function createRnd16(path, time, nonce) {
    if (globalThis.crypto === void 0 || globalThis.crypto.subtle === void 0) {
      throw new Error("当前浏览器不支持评论签名");
    }
    if (!RND16_TIME_PATTERN.test(time) || !Number.isSafeInteger(Number(time))) {
      throw new Error("评论签名时间戳不合法: " + time);
    }
    if (!RND16_NONCE_PATTERN.test(nonce)) {
      throw new Error("评论签名随机数不合法");
    }
    const normalizedPath = normalizeRnd16Path(path);
    const keyBytes = Uint8Array.from(atob(RND16_KEY_BASE64), (char) => char.charCodeAt(0));
    const key = await globalThis.crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
    const plaintext = new TextEncoder().encode(JSON.stringify([time, nonce, normalizedPath]));
    const iv = new Uint8Array(12);
    if (typeof globalThis.crypto.getRandomValues === "function") {
      globalThis.crypto.getRandomValues(iv);
    }
    const cipher = new Uint8Array(
      await globalThis.crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(RND16_AAD), tagLength: 128 },
        key,
        plaintext
      )
    );
    const packed = new Uint8Array(iv.length + cipher.length);
    packed.set(iv, 0);
    packed.set(cipher, iv.length);
    let binary = "";
    for (const byte of packed) binary += String.fromCharCode(byte);
    const encoded = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return RND16_VERSION + ":" + encoded;
  }

  // scripts/heybox-up/src/ui/rail.ts
  var RAIL_ID = "heybox-up-comment-rail";
  var COMMENT_TREE_API_PATH = "/bbs/app/link/tree";
  var COMMENT_CREATE_API_PATH = "/bbs/app/comment/create";
  var DELETE_COMMENT_API_PATH = "/bbs/app/comment/delete";
  var RAIL_PAGE_SIZE = 20;
  var RAIL_TRIGGER_SELECTOR = ".bbs-new-style-bottom__comment, .content-list__comment";
  var RAIL_HOVER_CARD_SELECTOR = [
    "#page-bbs-community .bbs-home__content-item",
    "#page-topic-link .content-list__item",
    "#page-topic-link .bbs-home__content-item",
    "#page-creator-content-management .content-list__item",
    "#page-creator-content-management .bbs-home__content-item",
    ".bbs-home__content-list .bbs-home__content-item",
    ".content-list .content-list__item"
  ].join(", ");
  var RAIL_TEXT_INPUT_SELECTOR = [
    "input",
    "textarea",
    "select",
    "[contenteditable]:not([contenteditable='false'])",
    "button",
    "a[href]",
    "audio[controls]",
    "video[controls]",
    "iframe",
    "embed",
    "object"
  ].join(", ");
  var RAIL_PREVIEW_ROUTES = /* @__PURE__ */ new Set([PAGE_ROUTE.FEED, PAGE_ROUTE.TOPIC, PAGE_ROUTE.CREATOR]);
  function readRailLinkId(href) {
    const match = /link\/(\d+)/.exec(href || "");
    return match ? match[1] : "";
  }
  function readRailCardLinkId(element) {
    if (element === null) return "";
    const anchor = element.closest('a[href*="/app/bbs/link/"]');
    if (anchor !== null) return readRailLinkId(anchor.getAttribute("href"));
    const card = element.closest(RAIL_HOVER_CARD_SELECTOR + ", li");
    if (card === null) return "";
    const inner = card.querySelector('a[href*="/app/bbs/link/"]');
    return inner === null ? "" : readRailLinkId(inner.getAttribute("href"));
  }
  function readRailCardLinkIds(root) {
    const ids = [];
    for (const card of root.querySelectorAll(RAIL_HOVER_CARD_SELECTOR)) {
      const linkId = readRailCardLinkId(card);
      if (linkId !== "" && !ids.includes(linkId)) ids.push(linkId);
    }
    return ids;
  }
  function stepRailCardLinkId(ids, current, step) {
    if (ids.length === 0) return "";
    const index = ids.indexOf(current);
    const forward = step >= 0;
    if (index < 0) return forward ? ids[0] : ids[ids.length - 1];
    const next = index + (forward ? 1 : -1);
    if (next < 0 || next >= ids.length) return "";
    return ids[next];
  }
  function revealRailCardByLinkId(root, linkId) {
    for (const card of root.querySelectorAll(RAIL_HOVER_CARD_SELECTOR)) {
      if (readRailCardLinkId(card) !== linkId) continue;
      if (typeof card.scrollIntoView !== "function") return false;
      const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      card.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
      return true;
    }
    return false;
  }
  var RAIL_ICONS = {
    comment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-3-.4L4 21l1.4-4.4A8.3 8.3 0 0 1 3.6 11.5 8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4Z"/></svg>',
    external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-8.5 8.5"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    collapse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>'
  };
  var RAIL_CSS = `
  [hidden] { display: none !important; }
  :host {
    --rail-bg: var(--heybox-up-surface, #fff);
    --rail-text: var(--heybox-up-text, #14191e);
    --rail-text-2: var(--heybox-up-text-2, #3c4249);
    --rail-muted: var(--heybox-up-muted, #6b7280);
    --rail-subtle: var(--heybox-up-subtle, rgba(20, 25, 30, .06));
    --rail-line: var(--heybox-up-border, rgba(20, 25, 30, .1));
    --rail-accent: var(--heybox-up-accent, #6f8db3);
    --rail-radius: var(--heybox-up-radius-card, 14px);
    position: fixed;
    top: 80px;
    right: 20px;
    width: var(--heybox-up-rail-w, 340px);
    display: block;
    /* Below the site navigation (5000) and full-screen loading (2002), above body and editor controls. */
    z-index: 1500;
    font: 13px/1.6 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
    color: var(--rail-text);
  }
  :host([data-state="hidden"]) { display: none; }
  @media (max-width: 1199px) { :host { display: none; } }
  .panel {
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 168px);
    background: var(--rail-bg);
    border: 1px solid var(--rail-line);
    border-radius: var(--rail-radius);
    box-shadow: var(--heybox-up-shadow-2, 0 18px 44px rgba(8, 12, 16, .24));
    overflow: hidden;
  }
  :host([data-state="collapsed"]) { top: 50%; right: 0; width: auto; transform: translateY(-50%); }
  :host([data-state="collapsed"]) .panel { border-radius: var(--rail-radius) 0 0 var(--rail-radius); }
  :host([data-state="collapsed"]) .dock { display: none; }
  :host([data-state="open"]) .tab { display: none; }
  .tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    padding: 12px 7px;
    border: 0;
    background: transparent;
    color: var(--rail-muted);
    font: inherit;
    writing-mode: vertical-rl;
    cursor: pointer;
  }
  .tab:hover { background: var(--rail-subtle); color: var(--rail-text); }
  .tab:focus-visible { outline: 2px solid var(--rail-accent); outline-offset: -2px; }
  .tab svg { width: 15px; height: 15px; }
  .dock { display: flex; flex-direction: column; min-height: 0; }
  .head { display: flex; gap: 8px; padding: 12px 14px 10px; border-bottom: 1px solid var(--rail-line); }
  .head-text { flex: 1 1 auto; min-width: 0; }
  .kicker { font-size: 10px; letter-spacing: .12em; color: var(--rail-muted); }
  .title {
    margin-top: 3px;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.45;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
  }
  .tools { display: flex; flex: none; gap: 2px; }
  .icon {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--rail-muted);
    text-decoration: none;
    cursor: pointer;
  }
  .icon:hover { background: var(--rail-subtle); color: var(--rail-text); }
  .icon:focus-visible { outline: 2px solid var(--rail-accent); outline-offset: 1px; }
  .icon svg { width: 16px; height: 16px; }
  .icon.cy {
    width: auto;
    min-width: 26px;
    padding: 0 5px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: .04em;
  }
  .icon.cy[aria-pressed="true"] { background: var(--rail-subtle); color: var(--rail-accent); }
  .meta { padding: 8px 14px 0; font-size: 11px; color: var(--rail-muted); }
  .list { margin: 0; padding: 8px 0 0; list-style: none; overflow-y: auto; overscroll-behavior: contain; min-height: 0; }
  .item { display: flex; gap: 10px; padding: 11px 14px; border-top: 1px solid var(--rail-subtle); }
  .item:first-child { border-top: 0; }
  .avatar { width: 26px; height: 26px; border-radius: 50%; object-fit: cover; flex: none; background: var(--rail-subtle); }
  .body { flex: 1 1 auto; min-width: 0; }
  .who { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; }
  .name { font-size: 12px; font-weight: 600; color: var(--rail-text); }
  .time, .likes, .replies { font-size: 11px; color: var(--rail-muted); }
  .text { margin: 3px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--rail-text); }
  .text .emoji, .quote .emoji {
    display: inline-block;
    width: 17px;
    height: 17px;
    margin: 0 1px;
    vertical-align: -3px;
    background-repeat: no-repeat;
    background-size: 102px 323px;
  }
  .text .pic, .quote .pic {
    display: block;
    max-width: 100%;
    max-height: 160px;
    margin-top: 6px;
    border-radius: 6px;
    object-fit: contain;
    vertical-align: top;
  }
  .foot { display: flex; gap: 10px; margin-top: 4px; }
  .sub { display: grid; gap: 4px; margin-top: 7px; padding-left: 9px; border-left: 2px solid var(--rail-subtle); }
  .quote {
    font-size: 12px;
    color: var(--rail-text-2);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
  }
  .quote .quote-name { color: var(--rail-muted); }
  .status { padding: 26px 18px; text-align: center; color: var(--rail-muted); }
  .status a { color: var(--rail-accent); text-decoration: underline; text-underline-offset: 3px; }
  .retry-button {
    margin-left: 8px;
    padding: 3px 12px;
    border: 1px solid var(--rail-line);
    border-radius: 8px;
    background: transparent;
    color: var(--rail-text);
    font: inherit;
    cursor: pointer;
  }
  .retry-button:hover { background: var(--rail-subtle); }
  .retry-button:focus-visible { outline: 2px solid var(--rail-accent); outline-offset: 1px; }
  .retry-button[disabled] { opacity: .6; cursor: default; }
  .foot-bar { display: flex; gap: 8px; padding: 11px 12px; border-top: 1px solid var(--rail-line); }
  .action {
    flex: 1 1 auto;
    height: 30px;
    border: 1px solid var(--rail-line);
    border-radius: 8px;
    background: transparent;
    color: var(--rail-text);
    font: inherit;
    cursor: pointer;
  }
  .action:hover { background: var(--rail-subtle); }
  .action:focus-visible { outline: 2px solid var(--rail-accent); outline-offset: 1px; }
  .action.primary { border-color: transparent; background: var(--rail-accent); color: var(--heybox-up-on-accent, #fff); }
`;
  async function createCommentCreateQuery(path) {
    const time = Math.floor(Date.now() / 1e3);
    const nonce = md5Hex(String(time) + String(Math.random())).toUpperCase();
    return {
      os_type: "web",
      app: "heybox",
      x_client_type: "web",
      x_os_type: "Windows",
      x_app: "heybox_website",
      x_client_version: "",
      client_type: "web",
      web_version: "3.0",
      version: "999.0.4",
      hkey: createSignature(path, time, nonce),
      _time: String(time),
      nonce,
      _rnd: await createRnd16(path, String(time), nonce)
    };
  }
  function createApiParams(path) {
    const time = Math.floor(Date.now() / 1e3);
    const nonce = md5Hex(String(time) + String(Math.random())).toUpperCase();
    return {
      os_type: "web",
      app: "heybox",
      client_type: "web",
      version: "999.0.4",
      web_version: "2.5",
      x_client_type: "web",
      x_app: "heybox_website",
      x_os_type: "Windows",
      device_info: "Chrome",
      hkey: createSignature(path, time, nonce),
      _time: String(time),
      nonce
    };
  }
  function buildLinkCommentUrl(linkId, page, signed, accountId = getHeyboxId()) {
    const base = signed === false ? { heybox_id: accountId, os_type: "web", app: "heybox", client_type: "web", version: "999.0.4", web_version: "2.5", x_client_type: "web", x_app: "heybox_website", x_os_type: "Windows", device_info: "Chrome" } : createApiParams(COMMENT_TREE_API_PATH);
    const query = new URLSearchParams({
      ...base,
      heybox_id: accountId,
      link_id: String(linkId),
      is_first: page === 1 ? "1" : "0",
      page: String(page),
      index: "1",
      limit: String(RAIL_PAGE_SIZE),
      owner_only: "0"
    });
    return "https://api.xiaoheihe.cn" + COMMENT_TREE_API_PATH + "?" + query.toString().replace("&link_id=", "&h_src&link_id=");
  }
  function normalizeRailText(value) {
    return String(value === void 0 || value === null ? "" : value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400);
  }
  var RAIL_BODY_MAX = 4e3;
  var RAIL_SEGMENT_MAX = 80;
  var railEmojiPacks = {
    // v34 keeps the first 18 rows of v33 and adds row 19 for 抱拳 (191).
    cube: { sprite: "https://static.max-c.com/heybox_web/emoji/cube/cube_emoji_v34.png", columns: 6, rows: 19 },
    heygirl: { sprite: "https://cdn.max-c.com/heybox_web/emoji/cube2/cube2_emoji.png", columns: 6, rows: 4 }
  };
  var RAIL_EMOJI_PACKS = railEmojiPacks;
  var RAIL_EMOJI_CELL = 17;
  var RAIL_EMOJI_TOKEN = /\[([a-z0-9]{1,16})_([^\]]{1,64})\]/i;
  var RAIL_EMOJI_NAMES = [
    "哭泣",
    "酷",
    "doge",
    "喜欢",
    "黑人问号",
    "惊讶",
    "开心",
    "捂脸哭",
    "晕",
    "感动",
    "委屈",
    "并不简单",
    "乖",
    "笑cry",
    "怒",
    "滑稽",
    "沧桑",
    "凄凉",
    "赞",
    "学习",
    "叹气",
    "加油",
    "摊手",
    "喷水",
    "打脸",
    "H币",
    "生气",
    "困",
    "闭嘴",
    "吐",
    "咕咕",
    "微笑",
    "哇",
    "汗",
    "吓",
    "睡觉",
    "2023",
    "圣诞树",
    "庆祝",
    "庆祝-圣诞",
    "你懂我",
    "我懂你",
    "阳",
    "比心",
    "wota",
    "鹅",
    "握草",
    "这是什么鸟",
    "上学-乐",
    "上学-丧",
    "打咩",
    "超人",
    "僵尸",
    "小鸡",
    "窝囊",
    "摸摸头",
    "电牛",
    "摘墨镜",
    "悟空",
    "2024",
    "良民",
    "嬉水女王",
    "2025",
    "浪人砍一刀",
    "吃鸡啦",
    "鸡毙你",
    "机智",
    "石化",
    "吹口哨",
    "思考",
    "太酷啦",
    "蛋糕",
    "毁灭战士",
    "P的谎言",
    "剑星伊芙",
    "欧润吉",
    "剑星渡鸦",
    "猛男微笑",
    "时间旅者",
    "来财",
    "我方了",
    "喜+1",
    "2026",
    "害羞",
    "吃瓜",
    "菜doge",
    "柠檬",
    "比耶",
    "爱心",
    "玫瑰",
    "+1",
    "-1",
    "点赞",
    "盒十",
    "耶",
    "鼓掌",
    "碰拳",
    "马年吉祥",
    "红包",
    "炒菜",
    "山姆无奈",
    "洛的点赞",
    "灵光一闪",
    "露莉亚",
    "傲娇助手",
    "认真记录",
    "鳄鱼",
    "星乐蒂",
    "抱拳"
  ];
  var RAIL_HEYGIRL_NAMES = [
    "诶嘿",
    "哭",
    "白嫖怪",
    "疑问",
    "痴",
    "喜欢",
    "捏脸",
    "害羞",
    "苦酒入喉",
    "秃",
    "rua!",
    "吃瓜",
    "茄化",
    "无语",
    "这…",
    "敲开心",
    "开可乐",
    "哈哈",
    "滑稽",
    "偷看",
    "喝奶茶",
    "惊",
    "记下来",
    "挨刀"
  ];
  var railCubeFontNames = {
    e012: "哭泣",
    e037: "酷",
    e003: "doge",
    e013: "喜欢",
    e03b: "黑人问号",
    e020: "惊讶",
    e01d: "开心",
    e025: "捂脸哭",
    e029: "晕",
    e021: "感动",
    e017: "委屈",
    e01a: "并不简单",
    e007: "乖",
    e032: "笑cry",
    e01f: "怒",
    e02d: "滑稽",
    e02c: "沧桑",
    e00a: "凄凉",
    e033: "赞",
    e018: "学习",
    e00d: "叹气",
    e00b: "加油",
    e027: "摊手",
    e014: "喷水",
    e024: "打脸",
    e002: "H币",
    e02e: "生气",
    e015: "困",
    e038: "闭嘴",
    e00e: "吐",
    e010: "咕咕",
    e01e: "微笑",
    e011: "哇",
    e02b: "汗",
    e00f: "吓",
    e030: "睡觉",
    e001: "2023",
    e016: "圣诞树",
    e01c: "庆祝",
    e01b: "庆祝-圣诞",
    e008: "你懂我",
    e022: "我懂你",
    e039: "阳",
    e02a: "比心",
    e004: "wota",
    e03a: "鹅",
    e026: "握草",
    e035: "这是什么鸟",
    e006: "上学-乐",
    e005: "上学-丧",
    e023: "打咩",
    e034: "超人",
    e009: "僵尸",
    e019: "小鸡",
    e031: "窝囊",
    e028: "摸摸头",
    e02f: "电牛"
  };
  var railHeygirlFontNames = {
    e019: "诶嘿",
    e006: "哭",
    e014: "白嫖怪",
    e012: "疑问",
    e013: "痴",
    e007: "喜欢",
    e00e: "捏脸",
    e00a: "害羞",
    e016: "苦酒入喉",
    e015: "秃",
    e001: "rua!",
    e004: "吃瓜",
    e017: "茄化",
    e010: "无语",
    e01a: "这…",
    e00f: "敲开心",
    e00b: "开可乐",
    e005: "哈哈",
    e011: "滑稽",
    e003: "偷看",
    e008: "喝奶茶",
    e00c: "惊",
    e018: "记下来",
    e00d: "挨刀"
  };
  var RAIL_CUBE_FONT_NAMES = railCubeFontNames;
  var RAIL_HEYGIRL_FONT_NAMES = railHeygirlFontNames;
  var RAIL_EMOJI_NAME_IDS = new Map(
    RAIL_EMOJI_NAMES.map((name, index) => [name, String((Math.floor(index / 6) + 1) * 10 + index % 6 + 1)])
  );
  var RAIL_HEYGIRL_NAME_IDS = new Map(
    RAIL_HEYGIRL_NAMES.map((name, index) => [name, String((Math.floor(index / 6) + 1) * 10 + index % 6 + 1)])
  );
  var RAIL_EMOJI_IDS_BY_PACK = {
    cube: RAIL_EMOJI_NAME_IDS,
    heygirl: RAIL_HEYGIRL_NAME_IDS
  };
  var deriveRailEmojiCatalogId = (index) => String((Math.floor(index / 6) + 1) * 10 + index % 6 + 1);
  var railEmojiCatalogEntries = {
    cube: RAIL_EMOJI_NAMES.map((name, index) => ({ name, id: deriveRailEmojiCatalogId(index) })),
    heygirl: RAIL_HEYGIRL_NAMES.map((name, index) => ({ name, id: deriveRailEmojiCatalogId(index) }))
  };
  var isValidRailEmojiCatalogPack = (value) => {
    if (typeof value !== "object" || value === null) return false;
    const pack = value;
    return typeof pack.sprite === "string" && /^https?:\/\/[^\s]+$/i.test(pack.sprite) && typeof pack.columns === "number" && Number.isInteger(pack.columns) && pack.columns > 0 && pack.columns < 100 && typeof pack.rows === "number" && Number.isInteger(pack.rows) && pack.rows > 0 && pack.rows < 100 && Array.isArray(pack.entries) && pack.entries.length > 0;
  };
  function applyRailEmojiCatalog(catalog) {
    let changed = false;
    for (const pack of ["cube", "heygirl"]) {
      const next = catalog[pack];
      if (!isValidRailEmojiCatalogPack(next)) continue;
      const seenIds = /* @__PURE__ */ new Set();
      const entries = [];
      for (const entry of next.entries) {
        if (typeof entry !== "object" || entry === null) return false;
        const { name, id, unicode } = entry;
        if (typeof name !== "string" || name.trim() === "" || name.length > 64) return false;
        const numeric = typeof id === "string" ? Number(id) : Number.NaN;
        const unit = numeric % 10;
        const row = Math.floor(numeric / 10);
        if (!Number.isInteger(numeric) || numeric < 11 || unit < 1 || unit > next.columns || row < 1 || row > next.rows || seenIds.has(id)) {
          return false;
        }
        const normalizedId = String(numeric);
        seenIds.add(normalizedId);
        entries.push(unicode === void 0 ? { name, id: normalizedId } : { name, id: normalizedId, unicode });
      }
      railEmojiPacks[pack] = { sprite: next.sprite, columns: next.columns, rows: next.rows };
      railEmojiCatalogEntries[pack] = entries;
      const idMap = pack === "cube" ? RAIL_EMOJI_NAME_IDS : RAIL_HEYGIRL_NAME_IDS;
      const fontMap = pack === "cube" ? railCubeFontNames : railHeygirlFontNames;
      idMap.clear();
      for (const key of Object.keys(fontMap)) delete fontMap[key];
      for (const entry of entries) {
        idMap.set(entry.name, entry.id);
        if (typeof entry.unicode === "string" && entry.unicode !== "" && fontMap[entry.unicode] === void 0) {
          fontMap[entry.unicode] = entry.name;
        }
      }
      changed = true;
    }
    return changed;
  }
  function readRailEmojiCatalogEntries(pack) {
    return railEmojiCatalogEntries[pack];
  }
  function isRailEmojiPack(value) {
    return value === "cube" || value === "heygirl";
  }
  function isRailEmojiId(value, pack = "cube") {
    const config = RAIL_EMOJI_PACKS[pack];
    const id = Number(value);
    if (!Number.isInteger(id) || id < 11) return false;
    const unit = id % 10;
    const row = Math.floor(id / 10);
    return unit >= 1 && unit <= config.columns && row >= 1 && row <= config.rows;
  }
  function resolveRailEmojiId(value, pack = "cube") {
    const raw = String(value === void 0 || value === null ? "" : value).trim();
    const prefix = pack + "_";
    const candidate = raw.toLowerCase().startsWith(prefix) ? raw.slice(prefix.length) : raw;
    if (isRailEmojiId(candidate, pack)) return String(Number(candidate));
    return RAIL_EMOJI_IDS_BY_PACK[pack].get(candidate) || "";
  }
  function resolveRailEmoji(pack, value) {
    const id = resolveRailEmojiId(value, pack);
    return id === "" ? null : { type: "emoji", pack, id };
  }
  function resolveRailEmojiRef(value) {
    const raw = String(value === void 0 || value === null ? "" : value).trim();
    if (raw === "") return null;
    const match = /^([a-z0-9]{1,16})_(.+)$/i.exec(raw);
    if (match === null) return resolveRailEmoji("cube", raw);
    const pack = match[1].toLowerCase();
    if (!isRailEmojiPack(pack)) return null;
    return resolveRailEmoji(pack, match[2]);
  }
  function railEmojiSheetSize(pack, cell = RAIL_EMOJI_CELL) {
    const config = RAIL_EMOJI_PACKS[pack];
    const unit = cell > 0 ? cell : RAIL_EMOJI_CELL;
    return { width: config.columns * unit, height: config.rows * unit };
  }
  function railEmojiOffset(id, cell = RAIL_EMOJI_CELL) {
    const numeric = Number(id);
    return { x: (numeric % 10 - 1) * cell, y: (Math.floor(numeric / 10) - 1) * cell };
  }
  function applyRailEmojiStyle(node, emoji, cell = RAIL_EMOJI_CELL) {
    const config = RAIL_EMOJI_PACKS[emoji.pack];
    const size = railEmojiSheetSize(emoji.pack, cell);
    const offset = railEmojiOffset(emoji.id, cell);
    node.style.backgroundImage = 'url("' + config.sprite + '")';
    node.style.backgroundSize = size.width + "px " + size.height + "px";
    node.style.backgroundPosition = "-" + offset.x + "px -" + offset.y + "px";
  }
  function createRailEmojiElement(emoji, className, cell = RAIL_EMOJI_CELL) {
    const node = document.createElement("span");
    node.className = className;
    node.setAttribute("role", "img");
    node.setAttribute("aria-label", "表情");
    applyRailEmojiStyle(node, emoji, cell);
    return node;
  }
  function normalizeRailImageUrl(value) {
    const raw = String(value === void 0 || value === null ? "" : value).trim();
    if (raw === "" || /\s/.test(raw)) return "";
    const candidate = raw.startsWith("//") ? "https:" + raw : raw;
    return /^https?:\/\/[^\s]+$/i.test(candidate) ? candidate : "";
  }
  function readRailEmojiSpriteUrl(src) {
    return /\/(?:cube_emoji(?:_v\d+)?|cube2_emoji)\.png(?:[?#]|$)/i.test(src);
  }
  function pushRailTextSegment(segments, value) {
    const collapsed = String(value).replace(/\s+/g, " ");
    if (collapsed.trim() === "") return;
    segments.push({ type: "text", text: collapsed });
  }
  function pushRailTextSegments(segments, value) {
    const source = String(value);
    const pattern = new RegExp(RAIL_EMOJI_TOKEN.source, "gi");
    let cursor = 0;
    for (let match = pattern.exec(source); match !== null; match = pattern.exec(source)) {
      pushRailTextSegment(segments, source.slice(cursor, match.index));
      const emoji = resolveRailEmojiRef(match[1] + "_" + match[2]);
      if (emoji === null) pushRailTextSegment(segments, match[0]);
      else segments.push(emoji);
      cursor = match.index + match[0].length;
    }
    pushRailTextSegment(segments, source.slice(cursor));
  }
  function parseRailTextBody(value) {
    const source = String(value === void 0 || value === null ? "" : value).slice(0, RAIL_BODY_MAX);
    const segments = [];
    pushRailTextSegments(segments, source);
    return segments.slice(0, RAIL_SEGMENT_MAX);
  }
  function resolveRailEmojiFontLabel(className) {
    const raw = String(className === void 0 || className === null ? "" : className);
    const match = /(^|\s)([a-z0-9]{1,16})\s+\2-([a-z0-9]{1,8})(?=\s|$)/i.exec(raw);
    if (match === null) return null;
    const pack = match[2].toLowerCase();
    if (!isRailEmojiPack(pack)) return null;
    const code = "e" + match[3].toLowerCase().replace(/^e/, "").padStart(3, "0").slice(-3);
    const table = pack === "cube" ? RAIL_CUBE_FONT_NAMES : RAIL_HEYGIRL_FONT_NAMES;
    const name = table[code];
    if (name === void 0) return null;
    return resolveRailEmoji(pack, name);
  }
  function parseRailBody(value) {
    const source = String(value === void 0 || value === null ? "" : value).slice(0, RAIL_BODY_MAX);
    if (source === "") return [];
    const template = document.createElement("template");
    template.innerHTML = source;
    const segments = [];
    const pushText = (value2) => pushRailTextSegments(segments, String(value2 === void 0 || value2 === null ? "" : value2));
    const readEmojiElement = (element) => {
      const match = /hb-emoji-([a-z0-9]{1,16})_([^\s"]{1,64})/i.exec(String(element.className || ""));
      if (match !== null) {
        const fromClass = resolveRailEmojiRef(match[1] + "_" + match[2]);
        if (fromClass !== null) return fromClass;
      }
      const dataEmoji = element.getAttribute("data-emoji");
      if (dataEmoji !== null && dataEmoji.trim() !== "") {
        const fromData = resolveRailEmojiRef(dataEmoji);
        if (fromData !== null) return fromData;
      }
      const fromFont = resolveRailEmojiFontLabel(element.className);
      if (fromFont !== null) return fromFont;
      for (const attribute of ["alt", "title"]) {
        const marker = element.getAttribute(attribute);
        if (marker === null || marker.trim() === "") continue;
        const fromAttribute = resolveRailEmojiRef(marker.replace(/^\[|\]$/g, ""));
        if (fromAttribute !== null) return fromAttribute;
      }
      return null;
    };
    const readEmojiMarker = (element) => {
      const dataEmoji = element.getAttribute("data-emoji");
      return dataEmoji === null ? "" : dataEmoji.trim();
    };
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          pushText(child.nodeValue);
          continue;
        }
        if (child.nodeType !== Node.ELEMENT_NODE || !(child instanceof Element)) continue;
        const element = child;
        if (element.tagName === "IMG") {
          const asEmoji = readEmojiElement(element);
          if (asEmoji !== null) {
            segments.push(asEmoji);
            continue;
          }
          const raw = element.getAttribute("src") ?? "";
          if (!readRailEmojiSpriteUrl(raw)) {
            const src = normalizeRailImageUrl(raw);
            if (src !== "") segments.push({ type: "image", src });
          }
          continue;
        }
        if (element.tagName === "BR") {
          pushText(" ");
          continue;
        }
        const emoji = readEmojiElement(element);
        if (emoji !== null) {
          segments.push(emoji);
          continue;
        }
        const marker = readEmojiMarker(element);
        if (marker !== "") {
          pushText("[" + marker + "]");
          continue;
        }
        walk(element);
      }
    };
    walk(template.content);
    if (segments.length > 0) {
      const first = segments[0];
      if (first.type === "text") first.text = first.text.replace(/^\s+/, "");
      const last = segments[segments.length - 1];
      if (last.type === "text") last.text = last.text.replace(/\s+$/, "");
    }
    return segments.filter((segment) => segment.type !== "text" || segment.text !== "").slice(0, RAIL_SEGMENT_MAX);
  }
  function mergeRailImages(body, value) {
    const segments = body.slice();
    const seen = /* @__PURE__ */ new Set();
    for (const segment of segments) {
      if (segment.type === "image") seen.add(segment.src);
    }
    const images = [];
    for (const entry of readRailImageEntries(value)) {
      if (images.length >= RAIL_SEGMENT_MAX) break;
      const src = normalizeRailImageUrl(entry);
      if (src === "" || seen.has(src)) continue;
      seen.add(src);
      images.push({ type: "image", src });
    }
    if (images.length === 0) return segments;
    const room = Math.max(0, RAIL_SEGMENT_MAX - images.length);
    return segments.slice(0, room).concat(images);
  }
  function readRailImageEntries(value) {
    if (typeof value === "string") return value === "" ? [] : value.split(";");
    if (!Array.isArray(value)) return [];
    const entries = [];
    for (const item of value) {
      if (typeof item === "string") {
        entries.push(item);
        continue;
      }
      const record = asRecord(item);
      if (record === null) continue;
      for (const key of ["url", "thumb", "src"]) {
        const candidate = record[key];
        if (typeof candidate === "string" && candidate.trim() !== "") {
          entries.push(candidate);
          break;
        }
      }
    }
    return entries;
  }
  function railBodyText(segments) {
    return segments.filter((segment) => segment.type === "text").map((segment) => segment.text).join(" ").trim();
  }
  function normalizeRailComment(comment) {
    const raw = asRecord(comment) ?? {};
    const user = asRecord(raw["user"]) ?? {};
    const avatar = user["avatar"] || user["avartar"] || "";
    const body = mergeRailImages(parseRailBody(raw["text"]), raw["imgs"]);
    const id = String(raw["comment_id"] || raw["commentid"] || raw["id"] || "");
    const rawRootId = readRailRelationId(raw, ["root_id", "root_comment_id", "reply_root_id"]);
    return {
      id,
      userId: readRailCommentUserId(user),
      name: String(user["username"] || user["nickname"] || "匿名用户").trim(),
      replyName: readRailReplyName(raw),
      avatar: typeof avatar === "string" ? avatar : "",
      text: railBodyText(body),
      body,
      createAt: Number(raw["create_at"]) || 0,
      likes: Number(raw["support_num"] || raw["support_count"]) || 0,
      replies: Number(raw["reply_count"] || raw["sub_comment_num"]) || 0,
      // A root that points at itself is not a usable parent; the group builder
      // falls back to the floor id instead.
      rootId: rawRootId === id ? "" : rawRootId,
      parentId: readRailRelationId(raw, ["parent_id", "replyid", "reply_id", "reply_to_comment_id", "reply_comment_id", "reply_to", "to_comment_id"]),
      isCy: isCyComment(raw)
    };
  }
  function readRailReplyName(raw) {
    const replyUser = asRecord(raw["replyuser"]) ?? asRecord(raw["reply_user"]) ?? {};
    return String(replyUser["username"] || replyUser["nickname"] || "").trim();
  }
  function readRailCommentUserId(user) {
    for (const key of ["userid", "user_id", "heybox_id", "id"]) {
      const value = user[key];
      if (value === void 0 || value === null) continue;
      const text = String(value).trim();
      if (text === "" || text === "-1" || text === "0" || text === "undefined" || text === "null") continue;
      return text;
    }
    return "";
  }
  function isOwnRailComment(comment, accountId) {
    const owner = typeof accountId === "string" ? accountId.trim() : "";
    if (owner === "" || comment.userId === "") return false;
    return comment.userId === owner;
  }
  function readRailRelationId(raw, keys) {
    for (const key of keys) {
      const value = raw[key];
      if (value === void 0 || value === null) continue;
      const text = String(value).trim();
      if (text === "" || text === "-1" || text === "0") continue;
      return text;
    }
    return "";
  }
  function normalizeRailGroup(group) {
    const source = asRecord(group)?.["comment"];
    const list = Array.isArray(source) ? source : [];
    const root = list[0];
    if (root === void 0) return null;
    const item = normalizeRailComment(root);
    if (item.id === "" && item.body.length === 0 && item.name === "匿名用户") return null;
    const seen = /* @__PURE__ */ new Set();
    const subComments = list.slice(1).map(normalizeRailComment).filter((quote) => quote.body.length > 0).filter((quote) => {
      if (quote.id === "") return true;
      if (seen.has(quote.id)) return false;
      seen.add(quote.id);
      return true;
    }).map((quote) => ({
      ...quote,
      rootId: quote.rootId !== "" ? quote.rootId : item.id,
      parentId: quote.parentId !== "" ? quote.parentId : item.id
    }));
    return {
      ...item,
      rootId: item.id,
      parentId: item.id,
      subComments,
      quotes: subComments
    };
  }
  function buildRailCommentTree(entry) {
    const source = Array.isArray(entry.subComments) ? entry.subComments : [];
    const nodes = [];
    const byId = /* @__PURE__ */ new Map();
    for (const comment of source) {
      if (comment.id !== "" && byId.has(comment.id)) continue;
      const node = { ...comment, children: [] };
      nodes.push(node);
      if (comment.id !== "") byId.set(comment.id, node);
    }
    const parentOf = /* @__PURE__ */ new Map();
    for (const node of nodes) {
      if (node.id === "" || node.parentId === "" || node.parentId === entry.id || node.parentId === node.id) continue;
      const parent = byId.get(node.parentId);
      if (parent === void 0 || parent === node) continue;
      parentOf.set(node, parent);
    }
    const detached = /* @__PURE__ */ new Set();
    for (const node of nodes) {
      const seen = /* @__PURE__ */ new Set();
      let cursor = node;
      while (cursor !== void 0 && !seen.has(cursor)) {
        seen.add(cursor);
        cursor = parentOf.get(cursor);
      }
      if (cursor !== void 0) {
        for (const member of seen) detached.add(member);
      }
    }
    const roots = [];
    for (const node of nodes) {
      if (detached.has(node)) {
        roots.push(node);
        continue;
      }
      const parent = parentOf.get(node);
      if (parent === void 0 || detached.has(parent)) {
        roots.push(node);
        continue;
      }
      parent.children.push(node);
    }
    return roots;
  }
  function readRailFloorTotal(result) {
    const value = Number(asRecord(result)?.["total_floor_num"]);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }
  function resolveCommentPageProgress(input) {
    const loadedGroups = input.previouslyLoadedGroups + input.rawGroupCount;
    if (input.rawGroupCount <= 0) return { hasMore: false, loadedGroups };
    if (input.freshGroupCount <= 0) return { hasMore: false, loadedGroups };
    if (input.floorTotal > 0 && loadedGroups >= input.floorTotal) {
      return { hasMore: false, loadedGroups };
    }
    if (input.floorTotal <= 0 && input.rawGroupCount < RAIL_PAGE_SIZE) {
      return { hasMore: false, loadedGroups };
    }
    return { hasMore: true, loadedGroups };
  }
  function resolveMergedCommentProgress(input) {
    if (input.floorTotal > 0) {
      return { hasMore: input.loadedGroups < input.floorTotal, loadedGroups: input.loadedGroups };
    }
    return { hasMore: input.rawGroupCount >= RAIL_PAGE_SIZE, loadedGroups: input.loadedGroups };
  }
  function buildArticleCommentBody(linkId, text, target, imageUrls = []) {
    const body = {
      is_cy: "0",
      link_id: linkId,
      reply_id: target === null ? "-1" : target.id,
      root_id: target === null ? "-1" : target.rootId,
      text
    };
    const images = imageUrls.map((url) => normalizeRailImageUrl(url)).filter((url) => url !== "");
    if (images.length > 0) body["imgs"] = images.join(";");
    return body;
  }
  function buildDeleteCommentBody(commentId) {
    return { comment_id: commentId };
  }
  function readCreatedCommentId(result) {
    const record = asRecord(result);
    if (record === null) return "";
    const nested = asRecord(record["comment"]);
    const candidates = [record["comment_id"], record["commentid"], record["id"]];
    if (nested !== null) candidates.push(nested["comment_id"], nested["commentid"], nested["id"]);
    for (const candidate of candidates) {
      if (candidate === void 0 || candidate === null) continue;
      const text = String(candidate).trim();
      if (text === "" || text === "0" || text === "-1" || text === "undefined" || text === "null") continue;
      return text;
    }
    return "";
  }
  function railItemsHaveComment(items, commentId) {
    if (commentId === "") return false;
    for (const entry of items) {
      if (entry.id === commentId) return true;
      if (railThreadHasComment(buildRailCommentTree(entry), commentId)) return true;
    }
    return false;
  }
  function railThreadHasComment(nodes, commentId) {
    for (const node of nodes) {
      if (node.id === commentId) return true;
      if (railThreadHasComment(node.children, commentId)) return true;
    }
    return false;
  }
  function findRailFloorIdForComment(items, commentId) {
    if (commentId === "") return "";
    for (const entry of items) {
      if (entry.id === commentId) return entry.id;
      if (railThreadHasComment(buildRailCommentTree(entry), commentId)) return entry.id;
    }
    return "";
  }
  function mergeRailPageItems(existing, incoming) {
    const byId = /* @__PURE__ */ new Map();
    for (const entry of incoming) {
      if (entry.id === "") continue;
      byId.set(entry.id, entry);
    }
    const known = new Set(existing.map((entry) => entry.id));
    const merged = [];
    for (const entry of existing) {
      const replacement = byId.get(entry.id);
      merged.push(replacement === void 0 ? entry : replacement);
    }
    const fresh = [];
    for (const entry of incoming) {
      if (entry.id === "" || known.has(entry.id)) continue;
      known.add(entry.id);
      fresh.push(entry);
    }
    return fresh.concat(merged);
  }
  function countRailThreadNodes(nodes) {
    let total = 0;
    for (const node of nodes) {
      total += 1 + countRailThreadNodes(node.children);
    }
    return total;
  }
  var RAIL_PENDING_ID_PREFIX = "pending-";
  function createRailPendingReply(input) {
    const text = input.text.trim();
    const id = typeof input.commentId === "string" && input.commentId !== "" ? input.commentId : RAIL_PENDING_ID_PREFIX + input.sequence;
    const images = input.imageUrls ?? [];
    return {
      id,
      userId: input.userId,
      name: "我",
      replyName: "",
      avatar: "",
      text,
      // The composer inserts emoji tokens and can attach pictures, so the local
      // echo must show both before the site echoes the comment back.
      body: mergeRailImages(parseRailTextBody(text), images),
      createAt: input.createAt,
      likes: 0,
      replies: 0,
      rootId: input.rootId,
      parentId: input.parentId,
      isCy: false
    };
  }
  function attachRailPendingReplies(entry, pending) {
    if (pending.length === 0) return entry;
    const subComments = entry.subComments.concat(pending);
    return { ...entry, subComments, quotes: subComments };
  }
  var RAIL_ECHO_MENTION = /^(?:回复\s*)?@[^\s@:：,，]{1,32}[\s:：,，]+/;
  function stripRailEchoMentions(value) {
    let text = value;
    for (let guard = 0; guard < 4; guard += 1) {
      const next = text.replace(RAIL_ECHO_MENTION, "");
      if (next === text) return text;
      text = next;
    }
    return text;
  }
  function flattenRailMatchText(value) {
    return value.replace(/\[cube_[^\]]{1,64}\]/g, " ").replace(/\[[^\]]{1,64}\]/g, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
  function railEchoTextMatches(pendingText, echoText) {
    const wanted = flattenRailMatchText(pendingText);
    if (wanted === "") return false;
    return stripRailEchoMentions(flattenRailMatchText(echoText)) === wanted;
  }
  function railItemsHaveOwnFloorComment(items, userId, text, createAt, imageUrls) {
    if (userId === "") return false;
    const wanted = flattenRailMatchText(text);
    const wantedImages = imageUrls.map((url) => normalizeRailImageUrl(url)).filter((url) => url !== "");
    for (const entry of items) {
      if (entry.userId !== userId) continue;
      if (wanted !== "" && railEchoTextMatches(text, entry.text)) return true;
      if (wantedImages.length > 0) {
        const entryImages = entry.body.filter((segment) => segment.type === "image").map((segment) => segment.src);
        if (wantedImages.every((url) => entryImages.includes(url))) return true;
      }
      if (wanted === "" && wantedImages.length === 0 && createAt > 0 && entry.createAt > 0 && Math.abs(entry.createAt - createAt) <= 300) return true;
    }
    return false;
  }
  function collectRailCommentIds(items) {
    const ids = /* @__PURE__ */ new Set();
    for (const entry of items) {
      if (entry.id !== "") ids.add(entry.id);
      for (const node of collectRailEchoedNodes(entry)) ids.add(node.id);
    }
    return ids;
  }
  function collectRailEchoedNodes(entry) {
    const nodes = [];
    const collect = (branch) => {
      for (const node of branch) {
        if (node.id !== "" && !node.id.startsWith(RAIL_PENDING_ID_PREFIX)) nodes.push(node);
        collect(node.children);
      }
    };
    collect(buildRailCommentTree(entry));
    return nodes;
  }
  function findRailPendingEcho(nodes, pending, claimedIds, freshIds) {
    const free = nodes.filter((node) => !claimedIds.has(node.id));
    const sameAuthor = (node) => pending.userId === "" || node.userId === "" || node.userId === pending.userId;
    if (pending.id !== "" && !pending.id.startsWith(RAIL_PENDING_ID_PREFIX)) {
      const byId = free.find((node) => node.id === pending.id);
      if (byId !== void 0) return byId;
    }
    if (flattenRailMatchText(pending.text) === "") return null;
    const byText = free.find((node) => sameAuthor(node) && railEchoTextMatches(pending.text, node.text));
    if (byText !== void 0) return byText;
    if (freshIds === void 0) return null;
    if (pending.userId === "") return null;
    const fresh = free.filter((node) => node.userId === pending.userId && freshIds.has(node.id));
    if (fresh.length === 1) return fresh[0];
    const freshWithText = fresh.filter((node) => railEchoTextMatches(pending.text, node.text));
    return freshWithText.length === 1 ? freshWithText[0] : null;
  }
  function readRailFreshIds(items, entry, pending, knownIds) {
    const rootLoaded = pending.rootId !== "" && items.some((item) => item.id === pending.rootId);
    const owns = rootLoaded ? entry.id === pending.rootId : findRailFloorIdForComment(items, pending.parentId) === entry.id;
    if (!owns) return void 0;
    return new Set(collectRailEchoedNodes(entry).map((node) => node.id).filter((id) => !knownIds.has(id)));
  }
  function railThreadHasPendingReply(entry, pending, knownIds) {
    const freshIds = knownIds === void 0 ? void 0 : readRailFreshIds([entry], entry, pending, knownIds);
    return findRailPendingEcho(collectRailEchoedNodes(entry), pending, /* @__PURE__ */ new Set(), freshIds) !== null;
  }
  function railItemsHavePendingReply(items, pending, knownIds) {
    return items.some((entry) => railThreadHasPendingReply(entry, pending, knownIds));
  }
  function pruneRailPendingReplies(items, pending, baselineFor) {
    if (pending.length === 0) return [];
    const claimedIds = /* @__PURE__ */ new Set();
    const kept = [];
    for (const row of pending) {
      const baseline = baselineFor?.(row);
      let match = null;
      for (const entry of items) {
        const freshIds = baseline === void 0 ? void 0 : readRailFreshIds(items, entry, row, baseline);
        match = findRailPendingEcho(collectRailEchoedNodes(entry), row, claimedIds, freshIds);
        if (match !== null) break;
      }
      if (match === null) {
        kept.push(row);
        continue;
      }
      claimedIds.add(match.id);
    }
    return kept;
  }
  var lastRailRequestAt = 0;
  var RAIL_PAGE_CACHE_TTL_MS = 2 * 60 * 1e3;
  var RAIL_PAGE_CACHE_FRESH_MS = 15 * 1e3;
  var RAIL_PAGE_CACHE_HOLDOFF_MS = 10 * 1e3;
  var RAIL_PAGE_CACHE_MAX = 24;
  var railPageCache = /* @__PURE__ */ new Map();
  var railPageCacheHoldoff = /* @__PURE__ */ new Map();
  function holdRailPageCache(linkId, holdoffMs = RAIL_PAGE_CACHE_HOLDOFF_MS) {
    clearRailPageCache(linkId);
    if (linkId === "") return;
    railPageCacheHoldoff.set(linkId, Date.now() + Math.max(0, holdoffMs));
  }
  function isRailPageCacheHeld(linkId) {
    const until = railPageCacheHoldoff.get(linkId);
    if (until === void 0) return false;
    if (Date.now() < until) return true;
    railPageCacheHoldoff.delete(linkId);
    return false;
  }
  function readRailPageCache(linkId, page, accountId = "", maxAgeMs = RAIL_PAGE_CACHE_TTL_MS) {
    if (isRailPageCacheHeld(linkId)) return null;
    const key = linkId + ":" + accountId + ":" + page;
    const cached = railPageCache.get(key);
    if (cached === void 0) return null;
    const limitMs = Number.isFinite(maxAgeMs) ? Math.min(Math.max(0, maxAgeMs), RAIL_PAGE_CACHE_TTL_MS) : RAIL_PAGE_CACHE_TTL_MS;
    if (Date.now() - cached.savedAt > limitMs) {
      railPageCache.delete(key);
      return null;
    }
    railPageCache.delete(key);
    railPageCache.set(key, cached);
    return {
      items: cached.data.items,
      total: cached.data.total,
      floorTotal: cached.data.floorTotal,
      title: cached.data.title,
      link: { ...cached.data.link },
      groups: cached.data.groups
    };
  }
  function writeRailPageCache(linkId, page, accountId, data) {
    if (isRailPageCacheHeld(linkId)) return;
    const key = linkId + ":" + accountId + ":" + page;
    railPageCache.delete(key);
    railPageCache.set(key, { savedAt: Date.now(), data });
    while (railPageCache.size > RAIL_PAGE_CACHE_MAX) {
      const oldest = railPageCache.keys().next().value;
      if (oldest === void 0) break;
      railPageCache.delete(oldest);
    }
  }
  function clearRailPageCache(linkId) {
    const prefix = linkId + ":";
    for (const key of railPageCache.keys()) {
      if (key.startsWith(prefix)) railPageCache.delete(key);
    }
  }
  function describeRequestError(error, fallback) {
    return error instanceof Error && error.message !== "" ? error.message : fallback;
  }
  function readRailErrorMessage(record) {
    const msg = record["msg"];
    if (typeof msg === "string" && msg !== "") return msg;
    return "接口返回 " + String(record["status"]);
  }
  function countCyInGroups(groups) {
    let total = 0;
    const visit = (node) => {
      if (Array.isArray(node)) {
        for (const child of node) visit(child);
        return;
      }
      if (!node || typeof node !== "object") return;
      if (isCyComment(node)) total += 1;
      for (const value of Object.values(node)) {
        if (value && typeof value === "object") visit(value);
      }
    };
    visit(groups);
    return total;
  }
  function readCyCount(link, groups) {
    const candidates = [link["cy_num"], link["cy_count"], link["cy_total"]];
    for (const candidate of candidates) {
      if (candidate === void 0 || candidate === null || candidate === "") continue;
      const value = Number(candidate);
      if (Number.isFinite(value) && value >= 0) return Math.floor(value);
    }
    return countCyInGroups(groups);
  }
  async function fetchRailPage(linkId, page, options = {}) {
    const accountId = typeof options.accountId === "string" ? options.accountId : getHeyboxId();
    const maxAgeMs = typeof options.maxAgeMs === "number" ? options.maxAgeMs : RAIL_PAGE_CACHE_TTL_MS;
    const cached = options.bypassCache === true ? null : readRailPageCache(linkId, page, accountId, maxAgeMs);
    if (cached !== null) return cached;
    const signal = options.signal;
    const wait = Math.max(0, 700 - (Date.now() - lastRailRequestAt));
    await waitForDelay(wait, signal);
    lastRailRequestAt = Date.now();
    const request = async (signed) => {
      const init = {
        credentials: "include",
        cache: "no-store",
        headers: { accept: "application/json" }
      };
      if (signal !== void 0 && signal !== null) init.signal = signal;
      const response = await fetchWithTimeout(buildLinkCommentUrl(linkId, page, signed, accountId), init);
      if (!response.ok) throw new Error("接口返回 HTTP " + response.status);
      const payload = await response.json();
      const record = asRecord(payload);
      if (record === null) throw new Error("接口返回 undefined");
      if (record["status"] !== "ok") throw new Error(readRailErrorMessage(record));
      return record;
    };
    let data;
    try {
      data = await request(true);
    } catch (primaryError) {
      if (isAbortError(primaryError)) throw primaryError;
      try {
        data = await request(false);
      } catch (fallbackError) {
        if (isAbortError(fallbackError)) throw fallbackError;
        throw new Error(describeRequestError(primaryError, "签名请求失败") + " / 匿名请求：" + describeRequestError(fallbackError, "失败"));
      }
    }
    const result = asRecord(data["result"]) ?? {};
    const rawGroups = result["comments"];
    const rawComment = result["comment"];
    const groups = Array.isArray(rawGroups) ? rawGroups : Array.isArray(rawComment) ? rawComment : [];
    const link = asRecord(result["link"]) ?? {};
    const normalized = {
      items: groups.map(normalizeRailGroup).filter((item) => item !== null),
      total: Number(link["comment_num"] || result["total_floor_num"]) || 0,
      floorTotal: readRailFloorTotal(result),
      title: typeof link["title"] === "string" ? link["title"].trim() : "",
      link: {
        isAward: Number(link["is_award_link"]) === 1,
        isFavour: Number(link["is_favour"]) === 1,
        awardCount: Number(link["link_award_num"]) || 0,
        favourCount: Number(link["favour_count"]) || 0,
        commentCount: Number(link["comment_num"] || result["total_floor_num"]) || 0,
        cyCount: readCyCount(link, groups)
      },
      groups
    };
    writeRailPageCache(linkId, page, accountId, normalized);
    return { ...normalized, link: { ...normalized.link } };
  }
  function formatRailAge(value) {
    const seconds = Math.floor(Date.now() / 1e3) - Number(value || 0);
    if (!Number.isFinite(seconds) || seconds < 60) return "刚刚";
    if (seconds < 3600) return Math.floor(seconds / 60) + " 分钟前";
    if (seconds < 86400) return Math.floor(seconds / 3600) + " 小时前";
    if (seconds < 86400 * 30) return Math.floor(seconds / 86400) + " 天前";
    return formatTime(value).slice(0, 10);
  }
  function createCommentRail() {
    return createCommentRailAt(document.body);
  }
  function createCommentRailAt(page) {
    const host = document.createElement("div");
    host.id = RAIL_ID;
    host.dataset["state"] = "hidden";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = RAIL_CSS;
    const panel = document.createElement("div");
    panel.className = "panel";
    let loadController = null;
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "tab";
    tab.setAttribute("aria-label", "展开评论预览");
    tab.setAttribute("aria-expanded", "false");
    tab.innerHTML = RAIL_ICONS.comment + "<span>评论预览</span>";
    const dock = document.createElement("div");
    dock.className = "dock";
    const head = document.createElement("div");
    head.className = "head";
    const headText = document.createElement("div");
    headText.className = "head-text";
    const kicker = document.createElement("div");
    kicker.className = "kicker";
    kicker.textContent = "评论预览";
    const titleNode = document.createElement("div");
    titleNode.className = "title";
    titleNode.textContent = "评论";
    headText.append(kicker, titleNode);
    const tools = document.createElement("div");
    tools.className = "tools";
    const cyButton = document.createElement("button");
    cyButton.type = "button";
    cyButton.className = "icon cy";
    cyButton.textContent = "CY";
    const openLinkNode = document.createElement("a");
    openLinkNode.className = "icon";
    openLinkNode.target = "_blank";
    openLinkNode.rel = "noopener noreferrer";
    openLinkNode.title = "打开帖子";
    openLinkNode.setAttribute("aria-label", "打开帖子");
    openLinkNode.innerHTML = RAIL_ICONS.external;
    const collapseButton = document.createElement("button");
    collapseButton.type = "button";
    collapseButton.className = "icon";
    collapseButton.title = "收起";
    collapseButton.setAttribute("aria-label", "收起评论预览");
    collapseButton.innerHTML = RAIL_ICONS.collapse;
    tools.append(cyButton, openLinkNode, collapseButton);
    head.append(headText, tools);
    const meta = document.createElement("div");
    meta.className = "meta";
    const list = document.createElement("ol");
    list.className = "list";
    const status = document.createElement("div");
    status.className = "status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const footBar = document.createElement("div");
    footBar.className = "foot-bar";
    const moreButton = document.createElement("button");
    moreButton.type = "button";
    moreButton.className = "action";
    moreButton.textContent = "加载更多";
    footBar.append(moreButton);
    const statusText = document.createElement("span");
    const errorLink = document.createElement("a");
    errorLink.textContent = "打开帖子";
    errorLink.addEventListener("click", (event) => event.stopPropagation());
    const retryButton = document.createElement("button");
    retryButton.type = "button";
    retryButton.className = "retry-button";
    retryButton.textContent = "重试";
    retryButton.setAttribute("aria-label", "重试加载评论");
    status.append(statusText, errorLink, retryButton);
    dock.append(head, meta, list, status, footBar);
    panel.append(tab, dock);
    shadow.append(style, panel);
    const state = {
      mode: "hidden",
      linkId: "",
      title: "",
      total: 0,
      page: 0,
      items: [],
      loading: false,
      error: "",
      hasMore: false,
      loadedGroups: 0,
      seq: 0
    };
    let hideCy = readHideCyPreference();
    const updateCyButton = () => {
      cyButton.setAttribute("aria-pressed", String(hideCy));
      cyButton.title = hideCy ? "显示 CY 评论" : "屏蔽 CY 评论";
      cyButton.setAttribute("aria-label", cyButton.title);
    };
    cyButton.addEventListener("click", () => {
      hideCy = !hideCy;
      setHideCyPreference(hideCy);
      updateCyButton();
      render();
    });
    document.addEventListener(HIDE_CY_EVENT, () => {
      const next = readHideCyPreference();
      if (next === hideCy) return;
      hideCy = next;
      updateCyButton();
      render();
    });
    const applyMode = () => {
      host.dataset["state"] = state.mode;
      tab.setAttribute("aria-expanded", String(state.mode === "open"));
      const owner = page instanceof Document ? page.body : page;
      if (owner) owner.classList.toggle("heybox-up-rail-open", state.mode === "open");
    };
    const createEmoji = (segment) => createRailEmojiElement(segment, "emoji");
    const createImage = (src) => {
      const node = document.createElement("img");
      node.className = "pic";
      node.alt = "";
      node.loading = "lazy";
      node.referrerPolicy = "no-referrer";
      node.src = src;
      return node;
    };
    const fillBody = (node, segments) => {
      if (segments.length === 0) {
        node.textContent = "（图片或表情评论）";
        return;
      }
      for (const segment of segments) {
        if (segment.type === "text") node.append(document.createTextNode(segment.text));
        else if (segment.type === "emoji") node.append(createEmoji(segment));
        else node.append(createImage(segment.src));
      }
    };
    const createQuote = (quote) => {
      const node = document.createElement("div");
      node.className = "quote";
      const name = document.createElement("span");
      name.className = "quote-name";
      name.textContent = quote.name + "：";
      node.append(name);
      fillBody(node, quote.body);
      return node;
    };
    const createItem = (comment) => {
      const item = document.createElement("li");
      item.className = "item";
      item.setAttribute("role", "listitem");
      const avatar = document.createElement("img");
      avatar.className = "avatar";
      avatar.alt = "";
      avatar.loading = "lazy";
      avatar.referrerPolicy = "no-referrer";
      if (comment.avatar !== "") avatar.src = comment.avatar;
      const body = document.createElement("div");
      body.className = "body";
      const who = document.createElement("div");
      who.className = "who";
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = comment.name;
      who.append(name);
      if (comment.createAt > 0) {
        const time = document.createElement("span");
        time.className = "time";
        time.textContent = formatRailAge(comment.createAt);
        who.append(time);
      }
      const text = document.createElement("p");
      text.className = "text";
      fillBody(text, comment.body);
      const foot = document.createElement("div");
      foot.className = "foot";
      if (comment.likes > 0) {
        const likes = document.createElement("span");
        likes.className = "likes";
        likes.textContent = "赞 " + comment.likes;
        foot.append(likes);
      }
      if (comment.replies > 0) {
        const replies = document.createElement("span");
        replies.className = "replies";
        replies.textContent = comment.replies + " 条回复";
        foot.append(replies);
      }
      body.append(who, text);
      if (foot.childElementCount > 0) body.append(foot);
      const quotes = hideCy ? comment.quotes.filter((quote) => quote.isCy !== true) : comment.quotes;
      if (quotes.length > 0) {
        const sub = document.createElement("div");
        sub.className = "sub";
        sub.append(...quotes.map(createQuote));
        body.append(sub);
      }
      item.append(avatar, body);
      return item;
    };
    const render = () => {
      const visible = hideCy ? state.items.filter((item) => item.isCy !== true) : state.items;
      const hiddenCy = state.items.length - visible.length;
      titleNode.textContent = state.title !== "" ? state.title : "评论";
      openLinkNode.href = state.linkId !== "" ? LINK_HREF_PREFIX + state.linkId : "#";
      openLinkNode.hidden = state.linkId === "";
      const loadedText = visible.length > 0 ? " · 已加载 " + visible.length + " 条" : "";
      const cyText = hiddenCy > 0 ? " · 已屏蔽 " + hiddenCy + " 条 CY" : "";
      if (state.error !== "") {
        meta.textContent = "加载失败";
      } else if (state.total > 0) {
        meta.textContent = "共 " + state.total + " 条评论" + loadedText + cyText;
      } else {
        meta.textContent = (visible.length > 0 ? "已加载 " + visible.length + " 条" : "") + cyText;
      }
      list.replaceChildren(...visible.map(createItem));
      list.hidden = visible.length === 0;
      if (state.error !== "") {
        statusText.textContent = state.error + " ";
        errorLink.href = LINK_HREF_PREFIX + state.linkId;
        errorLink.hidden = false;
        retryButton.hidden = false;
        retryButton.disabled = state.loading;
        status.hidden = false;
      } else {
        errorLink.hidden = true;
        retryButton.hidden = true;
        if (state.loading && state.items.length === 0) {
          statusText.textContent = "正在加载评论…";
          status.hidden = false;
        } else if (state.linkId === "") {
          statusText.textContent = "这里会直接显示信息流首条帖子的评论；点其他帖子的评论数字可切换。";
          status.hidden = false;
        } else if (visible.length === 0) {
          statusText.textContent = hiddenCy > 0 ? "已屏蔽全部 " + hiddenCy + " 条 CY 评论" : "这条帖子还没有评论";
          status.hidden = false;
        } else {
          status.hidden = true;
        }
      }
      moreButton.hidden = state.linkId === "" || !state.hasMore;
      moreButton.textContent = state.loading ? "加载中…" : "加载更多";
      footBar.hidden = moreButton.hidden;
    };
    const load = async (page2) => {
      const seq = ++state.seq;
      state.loading = true;
      state.error = "";
      render();
      loadController?.abort();
      loadController = new AbortController();
      try {
        const data = await fetchRailPage(state.linkId, page2, { signal: loadController.signal });
        if (seq !== state.seq) return;
        const seen = new Set(state.items.map((item) => item.id));
        const fresh = data.items.filter((item) => item.id === "" || !seen.has(item.id));
        state.items = page2 === 1 ? fresh : state.items.concat(fresh);
        state.page = page2;
        const progress = resolveCommentPageProgress({
          rawGroupCount: data.items.length,
          freshGroupCount: fresh.length,
          previouslyLoadedGroups: page2 === 1 ? 0 : state.loadedGroups,
          floorTotal: data.floorTotal
        });
        state.loadedGroups = progress.loadedGroups;
        state.hasMore = progress.hasMore;
        if (data.total > 0) state.total = data.total;
        if (data.title !== "" && state.title === "") state.title = data.title;
      } catch (error) {
        if (isAbortError(error)) return;
        if (seq !== state.seq) return;
        const message = error instanceof Error && error.message ? error.message : "未知错误";
        state.error = /show_captcha|captcha/i.test(message) ? "评论需要验证，请稍后重试，或打开帖子查看。" : "评论加载失败：" + message + "，可打开帖子查看。";
        state.hasMore = false;
      } finally {
        if (seq === state.seq) {
          state.loading = false;
          loadController = null;
          render();
        }
      }
    };
    const open = (linkId) => {
      const next = String(linkId === void 0 || linkId === null ? "" : linkId);
      if (next === "") return false;
      state.mode = "open";
      applyMode();
      if (next === state.linkId) return true;
      loadController?.abort();
      loadController = null;
      state.seq += 1;
      state.loading = false;
      state.linkId = next;
      state.title = "";
      state.total = 0;
      state.page = 0;
      state.items = [];
      state.hasMore = false;
      state.loadedGroups = 0;
      state.error = "";
      render();
      void load(1);
      return true;
    };
    const collapse = () => {
      state.mode = state.linkId === "" ? "hidden" : "collapsed";
      applyMode();
    };
    const reset = () => {
      loadController?.abort();
      loadController = null;
      state.seq += 1;
      state.mode = "hidden";
      state.linkId = "";
      state.title = "";
      state.total = 0;
      state.page = 0;
      state.items = [];
      state.loading = false;
      state.error = "";
      state.hasMore = false;
      state.loadedGroups = 0;
      applyMode();
      render();
    };
    const setActive = (active) => {
      if (!active) {
        if (state.mode === "hidden" && !state.loading && loadController === null) return;
        loadController?.abort();
        loadController = null;
        state.seq += 1;
        state.loading = false;
        state.mode = "hidden";
        applyMode();
        return;
      }
      if (state.mode !== "hidden") return;
      state.mode = "collapsed";
      applyMode();
    };
    tab.addEventListener("click", () => {
      state.mode = "open";
      applyMode();
      if (state.linkId === "") {
        open(readRailCardLinkIds(document)[0] ?? "");
      }
      render();
    });
    collapseButton.addEventListener("click", collapse);
    retryButton.addEventListener("click", () => {
      if (state.error === "" || state.loading) return;
      void load(1);
    });
    moreButton.addEventListener("click", () => {
      if (state.loading || state.linkId === "") return;
      void load(state.page + 1);
    });
    updateCyButton();
    applyMode();
    render();
    return {
      host,
      open,
      collapse,
      reset,
      setActive,
      isOpen: () => state.mode === "open",
      getLinkId: () => state.linkId
    };
  }
  function syncCommentRailOpenClass(owner, open) {
    if (owner !== null) owner.classList.toggle("heybox-up-rail-open", open);
  }
  function bindCommentRail(rail, page, isEnabled, readRoute = readPageRoute) {
    let autoOpened = false;
    let lastRoute = readRoute();
    const isFeedPage = () => RAIL_PREVIEW_ROUTES.has(readRoute());
    const readFirstFeedLinkId = () => {
      if (readRoute() !== PAGE_ROUTE.FEED) return "";
      return readRailCardLinkIds(page)[0] ?? "";
    };
    const sync = () => {
      const route = readRoute();
      const routeChanged = route !== lastRoute;
      if (routeChanged) {
        lastRoute = route;
        autoOpened = false;
        rail.reset();
      }
      if (!isEnabled()) {
        autoOpened = false;
        rail.setActive(false);
        rail.host.remove();
        syncCommentRailOpenClass(page instanceof Document ? page.body : page, false);
        return;
      }
      const active = isFeedPage();
      rail.setActive(active);
      if (!active) {
        autoOpened = false;
        rail.host.remove();
        return;
      }
      const owner = page instanceof Document ? page.body : page;
      if (owner && rail.host.parentNode !== owner) owner.append(rail.host);
      if (!autoOpened && !rail.isOpen()) {
        const linkId = readFirstFeedLinkId();
        if (linkId !== "") {
          autoOpened = true;
          rail.open(linkId);
          syncCommentRailOpenClass(page instanceof Document ? page.body : page, true);
        }
      }
    };
    return { rail, isFeedPage, readFirstFeedLinkId, sync };
  }
  function watchCommentRail() {
    if (!document.body) return () => void 0;
    const page = document;
    const route = bindCommentRail(createCommentRail(), page, () => readCommentPreviewPreference());
    document.body.append(route.rail.host);
    const controller = new AbortController();
    const listen = (type, listener, capture = false) => document.addEventListener(type, listener, { capture, signal: controller.signal });
    const on = (type, listener, capture = false) => listen(type, listener, capture);
    const readCardLinkId = readRailCardLinkId;
    listen("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const trigger = target.closest(RAIL_TRIGGER_SELECTOR);
      if (!trigger) return;
      const linkId = readCardLinkId(trigger);
      if (linkId === "") return;
      if (!readCommentPreviewPreference()) return;
      if (!page.querySelector(RAIL_HOVER_CARD_SELECTOR)) return;
      if (window.matchMedia("(max-width: 1199px)").matches) return;
      event.preventDefault();
      event.stopPropagation();
      route.rail.open(linkId);
    }, true);
    let hoverTimer = 0;
    let hoverId = "";
    const cancelHover = () => {
      if (hoverTimer !== 0) window.clearTimeout(hoverTimer);
      hoverTimer = 0;
      hoverId = "";
    };
    on("pointerover", (event) => {
      if (!readCommentPreviewPreference() || !route.rail.isOpen()) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const card = target.closest(RAIL_HOVER_CARD_SELECTOR);
      if (!card) return;
      const linkId = readCardLinkId(card);
      if (linkId === "" || linkId === hoverId) return;
      cancelHover();
      hoverId = linkId;
      hoverTimer = window.setTimeout(() => {
        hoverTimer = 0;
        if (!route.rail.isOpen() || route.rail.getLinkId() === linkId) return;
        route.rail.open(linkId);
      }, 600);
    }, true);
    on("pointerout", (event) => {
      if (hoverTimer === 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const card = target.closest(RAIL_HOVER_CARD_SELECTOR);
      if (!card) return;
      const related = event.relatedTarget;
      if (related instanceof Node && card.contains(related)) return;
      cancelHover();
    }, true);
    on("pointerdown", cancelHover, true);
    on("scroll", cancelHover, true);
    on("keydown", (event) => {
      if (!route.rail.isOpen()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        route.rail.collapse();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof Element && target.closest(RAIL_TEXT_INPUT_SELECTOR) !== null) return;
      const ids = readRailCardLinkIds(page);
      const next = stepRailCardLinkId(ids, route.rail.getLinkId(), event.key === "ArrowDown" ? 1 : -1);
      if (next === "" || !route.rail.open(next)) return;
      event.preventDefault();
      cancelHover();
      revealRailCardByLinkId(page, next);
    });
    listen(COMMENT_PREVIEW_EVENT, () => route.sync());
    const syncTask = () => route.sync();
    registerPageSync(syncTask, 200, ADAPTED_ROUTES, "feed");
    route.sync();
    return () => {
      controller.abort();
      cancelHover();
      pageSyncTasks.delete(syncTask);
      route.rail.host.remove();
      syncCommentRailOpenClass(document.body, false);
    };
  }

  // scripts/heybox-up/src/ui/comment-sort.ts
  var COMMENT_SORTS = [
    { id: "default", label: "默认" },
    { id: "time", label: "时间" },
    { id: "likes", label: "点赞" },
    { id: "author", label: "作者" }
  ];
  var COMMENT_SORT_HOST_ID = "heybox-up-comment-sort";
  var COMMENT_AGE_UNITS = {
    秒: 1,
    分钟: 60,
    小时: 3600,
    天: 86400
  };
  var COMMENT_SORT_CSS = `
  :host {
    display: block;
    margin: 0 !important;
    padding: 9px 12px !important;
    border-bottom: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1)) !important;
    background: var(--heybox-up-surface, #fff) !important;
    font: 12px/1.4 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif !important;
  }
  .bar { display: flex; align-items: center; gap: 8px; }
  .group {
    display: inline-flex; gap: 2px; padding: 2px; border-radius: 999px;
    background: var(--heybox-up-subtle, rgba(20, 25, 30, .06));
  }
  .spacer { flex: 1 1 auto; }
  button {
    padding: 4px 10px; border: 0; border-radius: 999px;
    background: transparent; color: var(--heybox-up-muted, #6b7280);
    font: inherit; cursor: pointer;
    transition: color .12s ease, background-color .12s ease;
  }
  button:hover { color: var(--heybox-up-text, #14191e); }
  button:focus-visible { outline: 2px solid var(--heybox-up-accent, #6f8db3); outline-offset: 1px; }
  .group button[aria-pressed="true"] {
    background: var(--heybox-up-surface, #fff);
    color: var(--heybox-up-text, #14191e);
    font-weight: 600;
    box-shadow: 0 1px 2px rgba(16, 24, 40, .14);
  }
  .cy {
    padding: 4px 9px;
    border: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1));
  }
  .cy[aria-pressed="true"] {
    border-color: transparent;
    background: var(--heybox-up-subtle, rgba(20, 25, 30, .06));
    color: var(--heybox-up-accent, #6f8db3);
    font-weight: 600;
  }
`;
  function parseCommentAge(text) {
    const value = text.trim();
    if (value === "" || value === "刚刚") return value === "刚刚" ? 0 : Number.POSITIVE_INFINITY;
    if (value === "昨天") return 86400;
    const relative = /^(\d+)\s*(秒|分钟|小时|天)前$/.exec(value);
    if (relative) {
      const unit = COMMENT_AGE_UNITS[relative[2]];
      return Number(relative[1]) * (unit ?? 0);
    }
    const parsed = Date.parse(value.replace(/-/g, "/"));
    return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : (Date.now() - parsed) / 1e3;
  }
  function readCommentUserId(scope, selectors) {
    const links = Array.from(scope.querySelectorAll("a[href*='/app/user/profile/'], a[href*='userid=']"));
    if (selectors !== "") {
      const named = scope.querySelector(selectors);
      if (named !== null) {
        if (named instanceof HTMLAnchorElement) links.unshift(named);
        else links.unshift(...Array.from(named.querySelectorAll("a[href]")));
      }
    }
    for (const link of links) {
      const href = link.getAttribute("href") || "";
      const match = /\/app\/user\/profile\/(\d+)/.exec(href) || /[?&]userid=(\d+)/.exec(href);
      if (match) return match[1];
    }
    return "";
  }
  function isCommentAuthor(item, authorId, authorName) {
    const id = readCommentUserId(item, ".info-box, .info-box__username, .comment-item__username");
    if (authorId !== "") return id !== "" && id === authorId;
    const name = (item.querySelector(".info-box__username")?.textContent || "").trim();
    return authorName !== "" && name === authorName;
  }
  function applyCommentSort(tree, mode) {
    const list = tree.querySelector(".link-comment__list");
    if (!list) return;
    const items = [];
    for (const node of Array.from(list.children)) {
      if (node instanceof HTMLElement && node.classList.contains("link-comment__comment-item")) items.push(node);
    }
    if (mode === "default") {
      for (const item of items) item.style.order = "";
      return;
    }
    const articleHeader = document.querySelector("#page-bbs-link .link-user, #page-bbs-link .page-header, #page-bbs-link #page-bbs-link");
    const authorId = articleHeader === null ? "" : readCommentUserId(articleHeader, ".link-user__user-wrapper, .page-header__user-wrapper");
    const authorName = (document.querySelector("#page-bbs-link .link-user__username, #page-bbs-link .page-header__username")?.textContent || "").trim();
    const keyed = items.map((item, index) => {
      const likes = Number((item.querySelector(".like-box__cnt")?.textContent || "0").trim()) || 0;
      const age = parseCommentAge(item.querySelector(".info-box__create-time")?.textContent || "");
      return { item, index, likes, age, isAuthor: isCommentAuthor(item, authorId, authorName) };
    });
    keyed.sort((a, b) => {
      if (mode === "likes") return b.likes - a.likes || a.index - b.index;
      if (mode === "time") return a.age - b.age || a.index - b.index;
      if (mode === "author") return Number(b.isAuthor) - Number(a.isAuthor) || a.index - b.index;
      return a.index - b.index;
    });
    keyed.forEach((entry, index) => {
      entry.item.style.order = String(index);
    });
  }
  function createCommentSort(tree, mode = "default", isHideCy = () => false, onToggleCy = () => {
  }) {
    const host = document.createElement("div");
    host.id = COMMENT_SORT_HOST_ID;
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = COMMENT_SORT_CSS;
    const bar = document.createElement("div");
    bar.className = "bar";
    const group = document.createElement("div");
    group.className = "group";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "评论排序");
    bar.append(group);
    let current = mode;
    const buttons = COMMENT_SORTS.map((sort) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = sort.label;
      button.dataset["sort"] = sort.id;
      button.setAttribute("aria-pressed", String(sort.id === current));
      button.addEventListener("click", () => {
        current = sort.id;
        for (const node of buttons) node.setAttribute("aria-pressed", String(node.dataset["sort"] === current));
        applyCommentSort(tree, current);
      });
      group.append(button);
      return button;
    });
    const spacer = document.createElement("span");
    spacer.className = "spacer";
    const cyButton = document.createElement("button");
    cyButton.type = "button";
    cyButton.className = "cy";
    cyButton.textContent = "屏蔽 CY";
    cyButton.setAttribute("aria-pressed", String(isHideCy()));
    cyButton.title = isHideCy() ? "显示 CY 评论" : "屏蔽 CY 评论";
    cyButton.addEventListener("click", () => onToggleCy());
    bar.append(spacer, cyButton);
    shadow.append(style, bar);
    tree.prepend(host);
    return host;
  }
  function watchCommentSort() {
    if (!document.body) return;
    let host = null;
    let mode = "default";
    let cyLinkId = "";
    let cyPage = 0;
    let cyDone = false;
    let cyLoading = false;
    let cyIds = /* @__PURE__ */ new Set();
    let cyScanned = /* @__PURE__ */ new Set();
    const getLinkId = () => {
      const match = /link\/(\d+)/.exec(location.pathname);
      return match ? match[1] : "";
    };
    const toggleCy = () => {
      setHideCyPreference(!readHideCyPreference());
    };
    const updateCyButton = () => {
      const button = host?.shadowRoot?.querySelector("button.cy");
      if (!(button instanceof HTMLButtonElement)) return;
      const hideCy = readHideCyPreference();
      button.setAttribute("aria-pressed", String(hideCy));
      button.title = hideCy ? "显示 CY 评论" : "屏蔽 CY 评论";
    };
    const markCy = () => {
      const tree = document.querySelector("#page-bbs-link .link-comment");
      if (!tree) return;
      let count = 0;
      const counted = /* @__PURE__ */ new Set();
      for (const node of tree.querySelectorAll("[data-comment-id]")) {
        const id = node.getAttribute("data-comment-id") || "";
        if (cyIds.has(id)) {
          if (node.getAttribute("data-heybox-up-cy") !== "1") node.setAttribute("data-heybox-up-cy", "1");
          if (!counted.has(id)) {
            counted.add(id);
            count += 1;
          }
        } else if (node.hasAttribute("data-heybox-up-cy")) {
          node.removeAttribute("data-heybox-up-cy");
        }
      }
      const button = host?.shadowRoot?.querySelector("button.cy");
      if (!(button instanceof HTMLButtonElement)) return;
      const hidden = readHideCyPreference() ? count : 0;
      button.textContent = hidden > 0 ? "屏蔽 CY (" + hidden + ")" : "屏蔽 CY";
    };
    const pullCyIds = async () => {
      if (cyLoading || cyDone) return;
      const linkId = getLinkId();
      const tree = document.querySelector("#page-bbs-link .link-comment");
      if (linkId === "" || !tree) return;
      const hasUnknown = () => Array.from(tree.querySelectorAll("[data-comment-id]")).some((node) => {
        const id = node.getAttribute("data-comment-id") || "";
        return id !== "" && !cyScanned.has(id);
      });
      if (!hasUnknown()) return;
      cyLoading = true;
      try {
        while (!cyDone && cyPage < 10 && getLinkId() === linkId) {
          const data = await fetchRailPage(linkId, cyPage + 1);
          cyPage += 1;
          let added = 0;
          for (const group of data.groups) {
            const groupRecord = asRecord(group);
            const rawList = groupRecord === null ? void 0 : groupRecord["comment"];
            const list = Array.isArray(rawList) ? rawList : [];
            for (const raw of list) {
              const record = asRecord(raw);
              const id = String((record === null ? "" : record["commentid"] || record["comment_id"]) || "");
              if (id !== "" && !cyScanned.has(id)) {
                cyScanned.add(id);
                added += 1;
              }
              if (id !== "" && isCyComment(raw)) cyIds.add(id);
            }
          }
          if (added === 0) cyDone = true;
          if (!hasUnknown()) break;
        }
        if (cyPage >= 10) cyDone = true;
      } catch {
        cyDone = true;
      } finally {
        cyLoading = false;
        markCy();
      }
    };
    const sync = () => {
      if (!location.pathname.startsWith(LINK_HREF_PREFIX)) {
        host = null;
        mode = "default";
        return;
      }
      syncHideCyPreference();
      const tree = document.querySelector("#page-bbs-link .link-comment");
      if (!tree) return;
      const linkId = getLinkId();
      if (linkId !== cyLinkId) {
        cyLinkId = linkId;
        cyPage = 0;
        cyDone = false;
        cyIds = /* @__PURE__ */ new Set();
        cyScanned = /* @__PURE__ */ new Set();
      }
      const active = host?.shadowRoot?.querySelector('button[data-sort][aria-pressed="true"]');
      if (active instanceof HTMLElement) mode = active.dataset["sort"] || "default";
      if (!host || !host.isConnected || host.parentElement !== tree) {
        host = createCommentSort(tree, mode, readHideCyPreference, toggleCy);
      }
      applyCommentSort(tree, mode);
      updateCyButton();
      markCy();
      void pullCyIds();
    };
    registerPageSync(sync, 250, [PAGE_ROUTE.ARTICLE], "article");
    document.addEventListener(HIDE_CY_EVENT, () => {
      updateCyButton();
      markCy();
    });
    sync();
  }

  // scripts/heybox-up/src/ui/navigation.ts
  var NAV_ID = "heybox-up-nav";
  var NAV_STYLE_ID = "heybox-up-nav-style";
  var NAV_STATIC_CLASS = "heybox-up-nav-static";
  var NAV_ANIM_CLASS = "heybox-up-nav-anim";
  var CY_HASH = "#heybox-up-cy";
  var NAV_ITEMS = [
    { id: "community", label: "社区", href: "/app/bbs/home" },
    { id: "favour", label: "收藏", href: "/app/user/favour/content" },
    { id: "article", label: "文章", href: "/creator/content_management/home?article_type=all" }
  ];
  var NAV_GLYPHS = {
    community: {
      paths: ["M20.5 11.6a7.9 7.9 0 0 1-8.4 7.9 9 9 0 0 1-2.8-.4L4.5 20.5l1.3-4.1a7.8 7.8 0 0 1-1.3-4.8A7.9 7.9 0 0 1 12.4 3.7a7.9 7.9 0 0 1 8.1 7.9Z"],
      circles: [
        'cx="8.8" cy="12" r=".9" fill="currentColor" stroke="none"',
        'cx="12.4" cy="12" r=".9" fill="currentColor" stroke="none"',
        'cx="16" cy="12" r=".9" fill="currentColor" stroke="none"'
      ]
    },
    favour: {
      paths: ["M6.5 4h11a1 1 0 0 1 1 1v15l-6.5-4.2L5.5 20V5a1 1 0 0 1 1-1Z"]
    },
    article: {
      paths: ["M6 3h8l4 4v14H6z", "M14 3v5h5", "M9 13h6", "M9 16.5h6"]
    }
  };
  var NAV_SVG_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">';
  function navIconMarkup(id, animated) {
    const glyph = NAV_GLYPHS[id];
    if (glyph === void 0) return "";
    const paths = glyph.paths.map((d) => {
      if (!animated) return '<path d="' + d + '"/>';
      return '<path d="' + d + '" class="hbu-ico-base"/><path d="' + d + '" pathLength="1" class="hbu-ico-flow"/>';
    }).join("");
    const circles = (glyph.circles ?? []).map((attrs) => "<circle " + attrs + "/>").join("");
    const variant = animated ? " hbu-ico-anim" : "";
    return '<span class="hbu-nav-icon' + variant + " hbu-ico-" + id + '" aria-hidden="true">' + NAV_SVG_OPEN + paths + circles + "</svg></span>";
  }
  function buildNavIconMap(animated) {
    const map = {};
    for (const id of Object.keys(NAV_GLYPHS)) map[id] = navIconMarkup(id, animated);
    return map;
  }
  var NAV_STATIC_ICONS = buildNavIconMap(false);
  var NAV_DYNAMIC_ICONS = buildNavIconMap(true);
  function hasNavGlyph(id) {
    return Object.prototype.hasOwnProperty.call(NAV_GLYPHS, id);
  }
  function navIconMarkupFor(id) {
    return navIconMarkup(id, !document.documentElement.classList.contains(NAV_STATIC_CLASS));
  }
  var NAV_CSS = `
  .nav-links > .nav-link { display: none !important; }
  #${NAV_ID} {
    display: flex;
    align-items: stretch;
    height: 64px;
    gap: 2px;
    margin-left: 2px;
    font: 14px/1.5 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
  }
  .hbu-nav-link {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 100%;
    padding: 0 12px;
    border-radius: 8px;
    color: var(--nav-link-color, var(--heybox-up-muted, #8c9198));
    text-decoration: none;
    white-space: nowrap;
    transition: color .18s ease;
  }
  .hbu-nav-link::after {
    content: "";
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: 11px;
    height: 2px;
    border-radius: 2px;
    background: var(--heybox-up-accent, #6f8db3);
    transform: scaleX(0);
    transform-origin: 50% 50%;
    transition: transform .2s ease;
  }
  .hbu-nav-link:hover { color: var(--nav-link-active-color, var(--heybox-up-text, #14191e)); }
  .hbu-nav-link:hover::after, .hbu-nav-link.is-active::after { transform: scaleX(1); }
  .hbu-nav-link.is-active {
    color: var(--nav-link-active-color, var(--heybox-up-text, #14191e));
    font-weight: 600;
  }
  .hbu-nav-link:focus-visible {
    outline: 2px solid var(--heybox-up-accent, #6f8db3);
    outline-offset: -2px;
  }
  .hbu-nav-icon {
    display: inline-flex;
    width: 18px;
    height: 18px;
    flex: none;
    align-items: center;
    justify-content: center;
    transform-origin: 50% 60%;
    transition:
      transform .18s cubic-bezier(.22, .8, .3, 1),
      color .18s ease;
  }
  .hbu-nav-icon svg { display: block; width: 100%; height: 100%; flex: none; }
  .hbu-nav-link:focus-visible .hbu-nav-icon.hbu-ico-anim {
    color: var(--nav-link-active-color, var(--heybox-up-text, #14191e));
    transform: translateY(-2px) scale(1.14);
  }
  .hbu-nav-link[data-nav="article"]:focus-visible .hbu-nav-icon.hbu-ico-anim {
    transform: rotate(-7deg) translateY(-2px) scale(1.1);
  }
  /* Dynamic glyphs run on their own: the base copy keeps the outline solid and
     the flow copy sweeps a short accent dash along the same geometry, forever,
     with no pointer or focus needed. */
  .hbu-ico-anim path.hbu-ico-base {
    stroke-dasharray: none;
    stroke-dashoffset: 0;
  }
  .hbu-ico-anim path.hbu-ico-flow {
    stroke: var(--heybox-up-accent, #6f8db3);
    stroke-dasharray: .3 .7;
    stroke-dashoffset: 0;
    opacity: 0;
    animation: hbu-nav-ico-flow 3.2s ease-in-out infinite;
  }
  @keyframes hbu-nav-ico-flow {
    0% { stroke-dashoffset: 0; opacity: 0; }
    10% { stroke-dashoffset: -.1; opacity: .95; }
    55% { stroke-dashoffset: -1; opacity: .95; }
    70%, 100% { stroke-dashoffset: -1; opacity: 0; }
  }
  /* A very small breath keeps every mounted dynamic icon alive at rest without
     touching the 18x18 layout box or the hover transform on the wrapper. */
  .hbu-nav-icon.hbu-ico-anim svg {
    transform-origin: 50% 55%;
    animation: hbu-nav-ico-breathe 3.8s ease-in-out infinite;
  }
  @keyframes hbu-nav-ico-breathe {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.04); }
  }
  /* Per-entry durations and negative delays keep the four icons out of lockstep. */
  .hbu-nav-icon.hbu-ico-anim.hbu-ico-community path.hbu-ico-flow { animation-duration: 3.6s; animation-delay: -.7s; }
  .hbu-nav-icon.hbu-ico-anim.hbu-ico-favour path.hbu-ico-flow { animation-duration: 3s; animation-delay: -1.4s; }
  .hbu-nav-icon.hbu-ico-anim.hbu-ico-article path.hbu-ico-flow { animation-duration: 3.9s; animation-delay: -2.1s; }
  .hbu-nav-icon.hbu-ico-anim.hbu-ico-community svg { animation-duration: 4.2s; animation-delay: -.9s; }
  .hbu-nav-icon.hbu-ico-anim.hbu-ico-favour svg { animation-duration: 3.6s; animation-delay: -1.7s; }
  .hbu-nav-icon.hbu-ico-anim.hbu-ico-article svg { animation-duration: 4.6s; animation-delay: -2.6s; }
  .hbu-nav-link:focus-visible .hbu-nav-icon.hbu-ico-anim path.hbu-ico-flow {
    animation-duration: 1.3s;
  }
  .hbu-nav-link:active .hbu-nav-icon.hbu-ico-anim path.hbu-ico-flow {
    animation-duration: .9s;
  }
  /* Touch browsers keep :hover on the tapped link, which would leave the icon enlarged.
     Gate hover-only motion to devices that can hover with a precise pointer. */
  @media (hover: hover) and (pointer: fine) {
    .hbu-nav-link:hover .hbu-nav-icon.hbu-ico-anim {
      color: var(--nav-link-active-color, var(--heybox-up-text, #14191e));
      transform: translateY(-2px) scale(1.14);
    }
    .hbu-nav-link[data-nav="article"]:hover .hbu-nav-icon.hbu-ico-anim {
      transform: rotate(-7deg) translateY(-2px) scale(1.1);
    }
    .hbu-nav-link:hover .hbu-nav-icon.hbu-ico-anim path.hbu-ico-flow { animation-duration: 1.3s; }
  }
  .hbu-nav-link:active .hbu-nav-icon.hbu-ico-anim { transform: translateY(0) scale(.9); transition-duration: .08s; }
  .hbu-nav-link[data-nav="article"]:active .hbu-nav-icon.hbu-ico-anim { transform: translateY(0) rotate(0) scale(.9); }
  :root.${NAV_STATIC_CLASS} .hbu-nav-icon {
    animation: none !important;
    transform: none !important;
    transition: none !important;
  }
  :root.${NAV_STATIC_CLASS} .hbu-nav-icon svg {
    animation: none !important;
    transform: none !important;
  }
  :root.${NAV_STATIC_CLASS} .hbu-nav-icon path.hbu-ico-flow {
    display: none !important;
  }
  :root.${NAV_STATIC_CLASS} .hbu-nav-icon path {
    stroke-dasharray: none !important;
    stroke-dashoffset: 0 !important;
    opacity: 1 !important;
  }
  @media (prefers-reduced-motion: reduce) {
    :root:not(.${NAV_ANIM_CLASS}) .hbu-nav-icon,
    :root:not(.${NAV_ANIM_CLASS}) .hbu-nav-icon svg,
    :root:not(.${NAV_ANIM_CLASS}) .hbu-nav-icon path {
      animation: none !important;
      transform: none !important;
      transition: none !important;
    }
    :root:not(.${NAV_ANIM_CLASS}) .hbu-nav-icon path {
      stroke-dasharray: none !important;
      stroke-dashoffset: 0 !important;
      opacity: 1 !important;
    }
    :root:not(.${NAV_ANIM_CLASS}) .hbu-nav-icon path.hbu-ico-flow {
      display: none !important;
    }
    .hbu-nav-link::after { transition: none; }
  }
  @media (max-width: 1180px) {
    .hbu-nav-link { padding: 0 9px; gap: 5px; font-size: 13px; }
    .hbu-nav-link::after { left: 9px; right: 9px; }
  }
  @media (max-width: 940px) {
    .hbu-nav-link > span:not(.hbu-nav-icon) { display: none; }
    .hbu-nav-link { padding: 0 10px; }
  }
`;
  function applyNavMotionPreference(value) {
    const animated = value === true;
    const root = document.documentElement;
    root.classList.toggle(NAV_STATIC_CLASS, animated === false);
    root.classList.toggle(NAV_ANIM_CLASS, animated);
    syncNavIconVariant(animated);
  }
  function syncNavIconVariant(animated) {
    for (const link of Array.from(document.querySelectorAll("a[data-nav], a[data-route]"))) {
      const id = link.dataset["nav"] || link.dataset["route"] || "";
      if (!hasNavGlyph(id)) continue;
      const icon = link.querySelector(".hbu-nav-icon");
      if (icon === null) continue;
      if (icon.classList.contains("hbu-ico-anim") === animated) continue;
      const markup = navIconMarkup(id, animated);
      if (markup === "") continue;
      const template = document.createElement("template");
      template.innerHTML = markup;
      const next = template.content.firstElementChild;
      if (!(next instanceof HTMLElement)) continue;
      const heldFocus = icon.contains(document.activeElement);
      icon.replaceWith(next);
      if (heldFocus) link.focus({ preventScroll: true });
    }
  }
  function ensureNavStyle() {
    ensureStyleElement(NAV_STYLE_ID, NAV_CSS);
  }
  function releaseNav() {
    document.getElementById(NAV_ID)?.remove();
    removeStyleElement(NAV_STYLE_ID);
    document.documentElement.classList.remove(NAV_STATIC_CLASS);
    document.documentElement.classList.remove(NAV_ANIM_CLASS);
    navActiveHost = null;
    navActiveId = "";
  }
  function readNavActiveId() {
    const path = location.pathname;
    if (path === "/app/user/favour/content") return "favour";
    if (path.startsWith("/creator/")) return "article";
    if (path.startsWith("/app/bbs/")) return "community";
    return "";
  }
  var navActiveHost = null;
  var navActiveId = "";
  function syncNavActive() {
    const host = document.getElementById(NAV_ID);
    if (!host) {
      navActiveHost = null;
      navActiveId = "";
      return;
    }
    const activeId = readNavActiveId();
    if (host === navActiveHost && activeId === navActiveId) return;
    for (const node of Array.from(host.querySelectorAll(".hbu-nav-link"))) {
      const active = node.dataset["nav"] === activeId;
      node.classList.toggle("is-active", active);
      if (active) node.setAttribute("aria-current", "page");
      else node.removeAttribute("aria-current");
    }
    navActiveHost = host;
    navActiveId = activeId;
  }
  function scrollToCySection() {
    const host = document.getElementById("heybox-up-favour");
    if (!host) return false;
    host.scrollIntoView({ behavior: "smooth", block: "start" });
    return true;
  }
  function readSiteRouter() {
    const root = document.querySelector("#app");
    const app = asRecord(root === null ? null : Reflect.get(root, "__vue_app__"));
    const config = app === null ? null : asRecord(app["config"]);
    const properties = config === null ? null : asRecord(config["globalProperties"]);
    const router = properties === null ? null : asRecord(properties["$router"]);
    if (router === null) return null;
    const push = router["push"];
    if (typeof push !== "function") return null;
    return { push: (path) => Reflect.apply(push, router, [path]) };
  }
  function readThenable(value) {
    if (value === null || value === void 0) return null;
    if (typeof value !== "object" && typeof value !== "function") return null;
    const then = Reflect.get(value, "then");
    if (typeof then !== "function") return null;
    return value;
  }
  function navigateToPath(path) {
    const router = readSiteRouter();
    if (router) {
      try {
        const pending = router.push(path);
        const thenable = readThenable(pending);
        if (thenable !== null) {
          return Promise.resolve(thenable).then(
            (result) => !(result !== null && typeof result === "object" && typeof Reflect.get(result, "type") === "number"),
            () => false
          );
        }
        return Promise.resolve(true);
      } catch {
      }
    }
    const anchor = document.createElement("a");
    anchor.href = path;
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    return Promise.resolve(true);
  }
  function handleNavClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest("a.hbu-nav-link");
    if (!link) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const id = link.getAttribute("data-nav");
    if (id === "favour" && location.pathname === "/app/user/favour/content" && location.hash !== "") {
      event.preventDefault();
      history.pushState(null, "", "/app/user/favour/content");
      window.scrollTo({ top: 0, behavior: "smooth" });
      syncNavActive();
      return;
    }
    event.preventDefault();
    const href = link.getAttribute("href");
    if (href !== null && href !== "") navigateToPath(href);
  }
  function mountTopNav() {
    if (!document.body) return;
    const current = document.getElementById(NAV_ID);
    if (current?.parentElement?.classList.contains("nav-links") && current.parentElement.firstElementChild === current) {
      syncNavIconVariant(!document.documentElement.classList.contains(NAV_STATIC_CLASS));
      syncNavActive();
      return;
    }
    const links = document.querySelector(".nav .nav-links") || document.querySelector(".nav-links");
    if (!links) return;
    ensureNavStyle();
    let host = current;
    if (!host) {
      host = document.createElement("div");
      host.id = NAV_ID;
      host.setAttribute("role", "navigation");
      host.setAttribute("aria-label", "站内导航");
      const animated = !document.documentElement.classList.contains(NAV_STATIC_CLASS);
      host.innerHTML = NAV_ITEMS.map(
        (item) => '<a class="hbu-nav-link" data-nav="' + item.id + '" href="' + item.href + '" aria-label="' + item.label + '" title="' + item.label + '">' + navIconMarkup(item.id, animated) + "<span>" + item.label + "</span></a>"
      ).join("");
      host.addEventListener("click", handleNavClick);
    }
    if (host.parentNode !== links || links.firstElementChild !== host) links.prepend(host);
    syncNavIconVariant(!document.documentElement.classList.contains(NAV_STATIC_CLASS));
    syncNavActive();
  }
  function watchTopNav() {
    if (!document.body) return;
    const sync = () => {
      if (isOfficialHomePath(location.pathname)) {
        releaseNav();
        return;
      }
      mountTopNav();
      syncNavActive();
    };
    window.addEventListener("hashchange", syncNavActive);
    window.addEventListener("popstate", syncNavActive);
    registerPageSync(sync, 300, ADAPTED_ROUTES, "chrome");
    sync();
  }

  // scripts/heybox-up/src/ui/community-search.ts
  var COMMUNITY_SEARCH_API_PATH = "/bbs/app/api/general/search/v1";
  var COMMUNITY_SEARCH_ID = "heybox-up-community-search";
  var COMMUNITY_SEARCH_STYLE_ID = "heybox-up-community-search-style";
  var COMMUNITY_SEARCH_ACTIVE_CLASS = "heybox-up-cs-active";
  var COMMUNITY_SEARCH_PAGE_SIZE = 30;
  var COMMUNITY_SEARCH_STATE_VERSION = 1;
  var COMMUNITY_SEARCH_KEYWORD_MAX = 120;
  var COMMUNITY_SEARCH_RANGE_MAX = 32;
  var COMMUNITY_SEARCH_DUPLICATE_PAGE_LIMIT = 3;
  var COMMUNITY_SEARCH_RESULT_CACHE_MAX = 60;
  var COMMUNITY_SEARCH_SESSION_MAX_CHARS = 96e3;
  function communitySearchStorageKey(topicId) {
    return STORAGE_KEYS.communitySearch + ":" + topicId;
  }
  var COMMUNITY_SEARCH_ICONS = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.4"/><path d="m16.1 16.1 4.4 4.4"/></svg>'
  };
  var COMMUNITY_SEARCH_CSS = `
  #heybox-up-community-search {
    display: block;
    margin: 14px 0 12px;
    font: 13px/1.55 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
    color: var(--heybox-up-text, #14191e);
    -webkit-font-smoothing: antialiased;
  }
  #heybox-up-community-search *,
  #heybox-up-community-search *::before,
  #heybox-up-community-search *::after { box-sizing: border-box; }
  #heybox-up-community-search .bar {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 42px;
    margin: 0;
    padding: 0 6px 0 13px;
    border: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1));
    border-radius: var(--heybox-up-radius-card, 14px);
    background: var(--heybox-up-surface, #fff);
    box-shadow: var(--heybox-up-shadow-1, none);
    transition: border-color .16s ease, box-shadow .16s ease;
  }
  #heybox-up-community-search .bar:focus-within {
    border-color: var(--heybox-up-accent, #6f8db3);
    box-shadow: 0 0 0 3px rgba(111, 141, 179, .16);
  }
  #heybox-up-community-search .icon { display: inline-flex; flex: none; color: var(--heybox-up-muted, #6b7280); }
  #heybox-up-community-search .icon svg { width: 16px; height: 16px; }
  #heybox-up-community-search .scope {
    flex: none;
    max-width: 34%;
    height: 22px;
    padding: 0 9px;
    border-radius: 999px;
    background: var(--heybox-up-subtle, rgba(20, 25, 30, .06));
    color: var(--heybox-up-muted, #6b7280);
    font-size: 12px;
    line-height: 22px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  #heybox-up-community-search input.q {
    flex: 1 1 auto;
    min-width: 0;
    height: 30px;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 14px;
    line-height: 30px;
    outline: none;
    box-shadow: none;
    appearance: none;
  }
  #heybox-up-community-search input.q::placeholder { color: var(--heybox-up-muted, #6b7280); }
  #heybox-up-community-search button.go {
    flex: none;
    height: 30px;
    margin: 0;
    padding: 0 15px;
    border: 0;
    border-radius: 999px;
    background: var(--heybox-up-accent, #6f8db3);
    color: var(--heybox-up-on-accent, #fff);
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: filter .16s ease;
  }
  #heybox-up-community-search button.go:hover { filter: brightness(1.06); }
  #heybox-up-community-search button.reset {
    position: relative;
    flex: none;
    width: 26px;
    height: 26px;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--heybox-up-muted, #6b7280);
    font: inherit;
    cursor: pointer;
    transition: background .16s ease, color .16s ease;
  }
  #heybox-up-community-search button.reset::after {
    content: "";
    display: inline-block;
    font-size: 0;
    line-height: 0;
    width: 8px;
    height: 8px;
    border: 1.5px solid currentColor;
    border-radius: 2px;
    transform: rotate(45deg);
  }
  #heybox-up-community-search button.reset::before {
    content: "清空";
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  #heybox-up-community-search button.reset[hidden] { display: none !important; }
  #heybox-up-community-search button.reset:hover {
    background: var(--heybox-up-subtle, rgba(20, 25, 30, .06));
    color: var(--heybox-up-text, #14191e);
  }
  #heybox-up-community-search button.go:focus-visible,
  #heybox-up-community-search button.reset:focus-visible,
  #heybox-up-community-search .chip:focus-visible,
  #heybox-up-community-search .more:focus-visible,
  #heybox-up-community-search .close:focus-visible {
    outline: 2px solid var(--heybox-up-accent, #6f8db3);
    outline-offset: 2px;
  }
  #heybox-up-community-search .panel {
    margin-top: 10px;
    border: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1));
    border-radius: var(--heybox-up-radius-card, 14px);
    background: var(--heybox-up-surface, #fff);
    box-shadow: var(--heybox-up-shadow-1, none);
    overflow: hidden;
  }
  #heybox-up-community-search .panel[hidden] { display: none !important; }
  #heybox-up-community-search .head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 13px 16px;
    border-bottom: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1));
  }
  #heybox-up-community-search .head-text { flex: 1 1 auto; min-width: 0; }
  #heybox-up-community-search .head-title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.5;
    color: var(--heybox-up-text, #14191e);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  #heybox-up-community-search .head-meta {
    margin: 2px 0 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--heybox-up-muted, #6b7280);
  }
  #heybox-up-community-search .head-actions { flex: none; display: flex; align-items: center; gap: 6px; }
  #heybox-up-community-search .ghost,
  #heybox-up-community-search .close {
    height: 28px;
    padding: 0 11px;
    border: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1));
    border-radius: 999px;
    background: transparent;
    color: var(--heybox-up-text-2, #3c4249);
    font: inherit;
    font-size: 12px;
    line-height: 26px;
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;
    transition: background .16s ease, border-color .16s ease, color .16s ease;
  }
  #heybox-up-community-search .ghost:hover,
  #heybox-up-community-search .close:hover {
    border-color: var(--heybox-up-accent, #6f8db3);
    background: var(--heybox-up-subtle, rgba(20, 25, 30, .06));
    color: var(--heybox-up-text, #14191e);
  }
  #heybox-up-community-search .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1));
  }
  #heybox-up-community-search .filters[hidden] { display: none !important; }
  #heybox-up-community-search .filter-label {
    display: inline-flex;
    align-items: center;
    padding: 0 3px;
    color: var(--heybox-up-text-2, #3c4249);
    font-size: 12px;
    font-weight: 600;
  }
  #heybox-up-community-search .chip {
    height: 26px;
    margin: 0;
    padding: 0 11px;
    border: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1));
    border-radius: 999px;
    background: transparent;
    color: var(--heybox-up-text-2, #3c4249);
    font: inherit;
    font-size: 12px;
    line-height: 24px;
    cursor: pointer;
    transition: color .16s ease, border-color .16s ease, background .16s ease;
  }
  #heybox-up-community-search .chip:hover { border-color: var(--heybox-up-accent, #6f8db3); }
  #heybox-up-community-search .chip[aria-pressed="true"] {
    border-color: var(--heybox-up-accent, #6f8db3);
    background: rgba(111, 141, 179, .14);
    color: var(--heybox-up-accent, #6f8db3);
    font-weight: 600;
  }
  #heybox-up-community-search .item {
    display: block;
    padding: 15px 16px;
    border-bottom: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1));
    color: inherit;
    text-decoration: none;
    cursor: pointer;
    transition: background .14s ease;
  }
  #heybox-up-community-search .item:last-child { border-bottom: 0; }
  #heybox-up-community-search .item:hover { background: var(--heybox-up-subtle, rgba(20, 25, 30, .06)); }
  #heybox-up-community-search .item-thumb {
    float: right;
    width: 88px;
    height: 66px;
    margin: 2px 0 6px 14px;
    border-radius: 8px;
    object-fit: cover;
    background: var(--heybox-up-subtle, rgba(20, 25, 30, .06));
  }
  #heybox-up-community-search .item-title {
    margin: 0 0 4px;
    font-size: 15px;
    font-weight: 600;
    line-height: 1.45;
    color: var(--heybox-up-text, #14191e);
  }
  #heybox-up-community-search .item-desc {
    margin: 0 0 8px;
    font-size: 13px;
    line-height: 1.62;
    color: var(--heybox-up-text-2, #3c4249);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
  }
  #heybox-up-community-search .item-meta {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--heybox-up-muted, #6b7280);
  }
  #heybox-up-community-search .empty {
    margin: 0;
    padding: 30px 18px;
    text-align: center;
    font-size: 13px;
    line-height: 1.7;
    color: var(--heybox-up-muted, #6b7280);
  }
  #heybox-up-community-search .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 16px;
    border-top: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1));
  }
  #heybox-up-community-search .foot[hidden] { display: none !important; }
  #heybox-up-community-search .more {
    flex: none;
    height: 30px;
    margin: 0;
    padding: 0 14px;
    border: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1));
    border-radius: 999px;
    background: transparent;
    color: var(--heybox-up-text-2, #3c4249);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  #heybox-up-community-search .more[hidden] { display: none !important; }
  #heybox-up-community-search .more:hover:not(:disabled) {
    border-color: var(--heybox-up-accent, #6f8db3);
    color: var(--heybox-up-text, #14191e);
  }
  #heybox-up-community-search .more:disabled { opacity: .45; cursor: default; }
  #heybox-up-community-search .status {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--heybox-up-muted, #6b7280);
    text-align: right;
  }
  /* While the result panel is open the site filter row and feed hide, so two lists never stack. */
  #page-topic-link.heybox-up-cs-active .topic-link__filter-row,
  #page-topic-link.heybox-up-cs-active .topic-link__list { display: none !important; }
  @media (max-width: 720px) {
    #heybox-up-community-search { margin: 10px 0; }
    #heybox-up-community-search .scope { display: none; }
    #heybox-up-community-search .head { flex-wrap: wrap; }
    #heybox-up-community-search .item-thumb { width: 72px; height: 54px; }
  }
`;
  function ensureCommunitySearchStyle() {
    ensureStyleElement(COMMUNITY_SEARCH_STYLE_ID, COMMUNITY_SEARCH_CSS);
  }
  function readTopicContext() {
    const match = /^\/app\/topic\/link\/(\d+)/.exec(location.pathname);
    if (match === null) return null;
    const topicId = match[1];
    if (topicId === void 0) return null;
    const indicator = document.querySelector("#page-topic-link .topic-aside__topic-indicator .hot-topic-item__name");
    if (indicator !== null) {
      const indicatorName = normalizeRailText(indicator.textContent).slice(0, 24);
      if (indicatorName !== "") return { topicId, name: indicatorName };
    }
    const header = document.querySelector("#page-topic-link .topic-link__header");
    let name = "";
    if (header !== null) {
      const heading = header.querySelector("h1, h2, [class*='name'], [class*='title']");
      if (heading !== null) name = normalizeRailText(heading.textContent).slice(0, 24);
    }
    if (name === "") name = normalizeRailText((document.title || "").replace(/[-_|].*$/, "")).slice(0, 24);
    return { topicId, name: name === "" ? "本社区" : name };
  }
  function buildCommunitySearchUrl(topicId, keyword, offset, timeRange, filterTag, signed) {
    const query = new URLSearchParams({
      os_type: "web",
      app: "heybox",
      client_type: "web",
      version: "999.0.4",
      web_version: "2.5",
      x_client_type: "web",
      x_app: "heybox_website",
      x_os_type: "Windows",
      device_info: "Chrome",
      q: keyword,
      search_type: "link",
      is_pull_down: "0",
      offset: String(offset),
      limit: String(COMMUNITY_SEARCH_PAGE_SIZE),
      dw: "660",
      topic_id: String(topicId)
    });
    if (timeRange !== "") query.set("time_range", timeRange);
    if (filterTag !== "") query.set("filter_tag", filterTag);
    if (signed === true) {
      const time = Math.floor(Date.now() / 1e3);
      const nonce = md5Hex(String(time) + String(Math.random())).toUpperCase();
      query.set("hkey", createSignature(COMMUNITY_SEARCH_API_PATH, time, nonce));
      query.set("_time", String(time));
      query.set("nonce", nonce);
    }
    return "https://api.xiaoheihe.cn" + COMMUNITY_SEARCH_API_PATH + "?" + query.toString();
  }
  async function fetchCommunitySearchPage(url, signal) {
    let response;
    try {
      response = await fetchWithTimeout(url, { credentials: "include", headers: { accept: "application/json" }, signal });
    } catch (error) {
      if (isAbortError(error)) return { ok: false, message: "搜索已取消", aborted: true };
      return { ok: false, message: error instanceof Error && error.message !== "" ? error.message : "网络请求失败，请稍后重试" };
    }
    if (response.ok !== true) return { ok: false, message: "接口返回 HTTP " + response.status };
    let raw;
    try {
      raw = await response.json();
    } catch {
      return { ok: false, message: "接口返回非 JSON 内容，可能触发站点风控" };
    }
    const data = asRecord(raw);
    if (data === null || data["status"] !== "ok") {
      const status = data !== null && typeof data["status"] === "string" ? data["status"] : "";
      const rawMessage = data === null ? "" : data["msg"];
      const message = typeof rawMessage === "string" && rawMessage !== "" ? rawMessage : status;
      return { ok: false, message: message === "" ? "接口返回失败状态" : message };
    }
    const result = asRecord(data["result"]) ?? {};
    const items = [];
    for (const entry of Array.isArray(result["items"]) ? result["items"] : []) {
      if (normalizeSearchResult(entry) !== null) items.push(entry);
    }
    const linkCount = items.length;
    const rawRanges = Array.isArray(result["time_range_list"]) ? result["time_range_list"] : [];
    const timeRanges = rawRanges.map((entry) => asRecord(entry)).filter((entry) => entry !== null).filter((entry) => typeof entry["value"] === "string" && typeof entry["name"] === "string").map((entry) => ({ value: String(entry["value"]), name: String(entry["name"]) }));
    const rawFilterItem = (Array.isArray(result["items"]) ? result["items"] : []).map((entry) => asRecord(entry)).find((entry) => entry !== null && entry["type"] === "filter_tag");
    const rawFilterTags = rawFilterItem !== void 0 && rawFilterItem !== null && Array.isArray(rawFilterItem["filter_tags"]) ? rawFilterItem["filter_tags"] : [];
    const filterTags = rawFilterTags.map((entry) => asRecord(entry)).filter((entry) => entry !== null).filter((entry) => isSearchFilterTagValue(entry["tag"]) && typeof entry["name"] === "string").map((entry) => ({ tag: String(entry["tag"]), name: String(entry["name"]).slice(0, 24) })).slice(0, 12);
    const rawScopedTip = data["search_not_result_tips"];
    const scopedTip = typeof rawScopedTip === "string" ? rawScopedTip.trim() : "";
    const rawResultTip = result["search_not_result_tips"];
    const resultTip = typeof rawResultTip === "string" ? rawResultTip.trim() : "";
    return { ok: true, items, linkCount, timeRanges, filterTags, tip: scopedTip !== "" ? scopedTip : resultTip };
  }
  async function requestCommunitySearch(topicId, keyword, offset, timeRange, filterTag, signal) {
    const signed = await fetchCommunitySearchPage(buildCommunitySearchUrl(topicId, keyword, offset, timeRange, filterTag, true), signal);
    if (signed.aborted === true) return signed;
    if (signed.ok === true) return signed;
    const plain = await fetchCommunitySearchPage(buildCommunitySearchUrl(topicId, keyword, offset, timeRange, filterTag, false), signal);
    return plain.ok === true ? plain : signed;
  }
  function pickSearchText(values) {
    for (const value of values) {
      if (typeof value === "string" && value.trim() !== "") return value.trim();
      if (typeof value === "number" && Number.isFinite(value)) return String(value);
    }
    return "";
  }
  function pickSearchNumber(values) {
    for (const value of values) {
      const parsed = readFiniteNumber(value);
      if (parsed !== null && parsed > 0) return parsed;
    }
    return 0;
  }
  function isSearchTopicId(value) {
    return typeof value === "string" && /^\d{1,20}$/.test(value);
  }
  function isSearchTimeRange(value) {
    return typeof value === "string" && value.length <= COMMUNITY_SEARCH_RANGE_MAX && /^[A-Za-z0-9_-]*$/.test(value);
  }
  function isSearchFilterTagValue(value) {
    return typeof value === "string" && value.length <= 64 && /^[A-Za-z0-9_-]+$/.test(value);
  }
  function normalizeSearchKeyword(value) {
    if (typeof value !== "string") return "";
    return value.replace(/\s+/g, " ").trim().slice(0, COMMUNITY_SEARCH_KEYWORD_MAX);
  }
  function parseCommunitySearchSavedState(raw) {
    const record = asRecord(raw);
    if (record === null) return null;
    if (record["version"] !== COMMUNITY_SEARCH_STATE_VERSION) return null;
    const body = asRecord(record["state"]);
    if (body === null) return null;
    const topicId = body["topicId"];
    if (!isSearchTopicId(topicId)) return null;
    const rawKeyword = body["keyword"];
    if (typeof rawKeyword !== "string") return null;
    const keyword = normalizeSearchKeyword(rawKeyword);
    if (keyword === "" || rawKeyword.length > COMMUNITY_SEARCH_KEYWORD_MAX * 2) return null;
    const timeRange = body["timeRange"];
    if (!isSearchTimeRange(timeRange)) return null;
    const rawFilterTag = body["filterTag"];
    const filterTag = rawFilterTag === void 0 ? "" : rawFilterTag;
    if (typeof filterTag !== "string" || filterTag !== "" && !isSearchFilterTagValue(filterTag)) return null;
    const open = body["open"];
    if (typeof open !== "boolean") return null;
    const results = body["results"];
    if (results !== void 0 && typeof results !== "boolean") return null;
    return {
      topicId,
      keyword,
      timeRange,
      filterTag,
      open,
      results: open === true && results === true
    };
  }
  function isCommunitySearchItem(value) {
    const record = asRecord(value);
    if (record === null) return false;
    return isSearchTopicId(record["id"]) && typeof record["title"] === "string" && typeof record["desc"] === "string" && typeof record["author"] === "string" && typeof record["thumb"] === "string" && isFiniteCount(record["createAt"]) && isFiniteCount(record["like"]) && isFiniteCount(record["comment"]);
  }
  function isFiniteCount(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
  }
  function isSearchRange(value) {
    const record = asRecord(value);
    return record !== null && isSearchTimeRange(record["value"]) && typeof record["name"] === "string" && record["name"].length <= 24;
  }
  function isSearchFilterTag(value) {
    const record = asRecord(value);
    return record !== null && isSearchFilterTagValue(record["tag"]) && typeof record["name"] === "string" && record["name"].length <= 24;
  }
  function parseCommunitySearchSession(raw, topicId) {
    if (!isSearchTopicId(topicId)) return null;
    try {
      if (JSON.stringify(raw).length > COMMUNITY_SEARCH_SESSION_MAX_CHARS) return null;
    } catch {
      return null;
    }
    const record = asRecord(raw);
    if (record === null) return null;
    const saved = parseCommunitySearchSavedState(raw);
    if (saved === null || saved.topicId !== topicId) return null;
    const rawItems = record["items"];
    if (!Array.isArray(rawItems) || rawItems.length > COMMUNITY_SEARCH_RESULT_CACHE_MAX) return null;
    const items = [];
    const ids = /* @__PURE__ */ new Set();
    for (const entry of rawItems) {
      if (!isCommunitySearchItem(entry) || ids.has(entry.id)) return null;
      ids.add(entry.id);
      items.push({
        id: entry.id,
        title: entry.title.slice(0, 200),
        desc: entry.desc.slice(0, 240),
        author: entry.author.slice(0, 40),
        thumb: /^https?:\/\//i.test(entry.thumb) ? entry.thumb : "",
        createAt: Number.isFinite(entry.createAt) && entry.createAt > 0 ? entry.createAt : 0,
        like: Number.isFinite(entry.like) && entry.like > 0 ? entry.like : 0,
        comment: Number.isFinite(entry.comment) && entry.comment > 0 ? entry.comment : 0
      });
    }
    const offset = record["offset"];
    const noMore = record["noMore"];
    if (!Number.isSafeInteger(offset) || Number(offset) < 0 || typeof noMore !== "boolean") return null;
    const rawRanges = record["timeRanges"];
    if (!Array.isArray(rawRanges) || rawRanges.length > 12) return null;
    const timeRanges = [];
    for (const entry of rawRanges) {
      if (!isSearchRange(entry)) return null;
      timeRanges.push({ value: entry.value, name: entry.name.slice(0, 24) });
    }
    const rawFilterTags = record["filterTags"];
    const filterTags = [];
    if (rawFilterTags !== void 0) {
      if (!Array.isArray(rawFilterTags) || rawFilterTags.length > 12) return null;
      for (const entry of rawFilterTags) {
        if (!isSearchFilterTag(entry)) return null;
        filterTags.push({ tag: entry.tag, name: entry.name.slice(0, 24) });
      }
    }
    return {
      version: 1,
      topicId: saved.topicId,
      keyword: saved.keyword,
      timeRange: resolveCommunitySearchRange(timeRanges, saved.timeRange),
      filterTag: filterTags.some((entry) => entry.tag === saved.filterTag) ? saved.filterTag : "",
      open: saved.open,
      results: saved.results,
      items,
      offset: Number(offset),
      noMore,
      timeRanges,
      filterTags
    };
  }
  function readCommunitySearchSession(topicId) {
    if (!isSearchTopicId(topicId)) return null;
    return parseCommunitySearchSession(sessionStore.readJson(communitySearchStorageKey(topicId), null), topicId);
  }
  function writeCommunitySearchSession(state) {
    if (!isSearchTopicId(state.topicId)) return;
    if (parseCommunitySearchSavedState({ version: 1, state }) === null) return;
    if (!state.items.every(isCommunitySearchItem)) return;
    const record = {
      version: COMMUNITY_SEARCH_STATE_VERSION,
      state: {
        topicId: state.topicId,
        keyword: normalizeSearchKeyword(state.keyword),
        timeRange: state.timeRange,
        filterTag: state.filterTag,
        open: state.open === true,
        results: state.results === true
      },
      items: state.items.slice(0, COMMUNITY_SEARCH_RESULT_CACHE_MAX).map((item) => ({
        id: item.id,
        title: item.title.slice(0, 200),
        desc: item.desc.slice(0, 240),
        author: item.author.slice(0, 40),
        thumb: item.thumb,
        createAt: item.createAt,
        like: item.like,
        comment: item.comment
      })),
      offset: state.offset,
      noMore: state.noMore === true,
      timeRanges: state.timeRanges.slice(0, 12).map((range) => ({ value: range.value, name: range.name.slice(0, 24) })),
      filterTags: state.filterTags.slice(0, 12).map((tag) => ({ tag: tag.tag, name: tag.name.slice(0, 24) }))
    };
    if (parseCommunitySearchSession(record, state.topicId) === null) return;
    sessionStore.writeJson(communitySearchStorageKey(state.topicId), record);
  }
  function clearCommunitySearchSavedState(topicId) {
    if (!isSearchTopicId(topicId)) return;
    sessionStore.remove(communitySearchStorageKey(topicId));
  }
  function resolveCommunitySearchRange(ranges, savedValue) {
    if (savedValue === "") return "";
    return ranges.some((entry) => entry.value === savedValue) ? savedValue : "";
  }
  function normalizeSearchResult(entry) {
    const record = asRecord(entry);
    if (record === null) return null;
    const type = record["type"];
    if (typeof type === "string" && type !== "" && type !== "link") return null;
    const info = asRecord(record["info"]) ?? record;
    const id = pickSearchText([info["linkid"], info["link_id"], info["id"]]);
    if (id === "") return null;
    const user = asRecord(info["user"]) ?? {};
    const thumbs = Array.isArray(info["thumbs"]) ? info["thumbs"] : [];
    return {
      id,
      title: pickSearchText([info["title"], info["name"]]) || "无标题帖子",
      desc: normalizeRailText(pickSearchText([info["description"], info["desc"], info["text"], info["content"], info["summary"]])).slice(0, 160),
      author: pickSearchText([user["username"], user["name"], user["nickname"]]),
      thumb: pickSearchText([thumbs[0], info["thumb"], info["cover"], info["image"]]),
      createAt: pickSearchNumber([info["create_at"], info["create_time"], info["timestamp"]]),
      like: pickSearchNumber([info["like_num"], info["like_count"], info["up"], info["likes"]]),
      comment: pickSearchNumber([info["comment_num"], info["link_comment_num"], info["comment_count"], info["comments"]])
    };
  }
  function collectCommunitySearchPage(collector, response, reset) {
    const known = new Set(collector.items.map((item) => item.id));
    const incoming = [];
    let linkCount = 0;
    for (const entry of response.items) {
      const item = normalizeSearchResult(entry);
      if (item !== null) linkCount += 1;
      if (item === null || known.has(item.id)) continue;
      known.add(item.id);
      incoming.push(item);
    }
    collector.items = reset === true ? incoming : collector.items.concat(incoming);
    const reported = Number(response.linkCount) || 0;
    const step = reported > 0 || linkCount > 0 ? Math.max(reported, linkCount) : 0;
    collector.offset += step;
    const exhausted = linkCount === 0;
    return { added: incoming.length, duplicateOnly: exhausted !== true && incoming.length === 0, exhausted };
  }
  function createCommunitySearchItem(item) {
    const node = document.createElement("a");
    node.className = "item";
    node.href = LINK_HREF_PREFIX + item.id;
    node.addEventListener("click", (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigateToPath(LINK_HREF_PREFIX + item.id);
    });
    if (item.thumb !== "") {
      const thumb = document.createElement("img");
      thumb.className = "item-thumb";
      thumb.src = item.thumb;
      thumb.alt = "";
      thumb.loading = "lazy";
      thumb.referrerPolicy = "no-referrer";
      node.append(thumb);
    }
    const title = document.createElement("h3");
    title.className = "item-title";
    title.textContent = item.title;
    node.append(title);
    if (item.desc !== "") {
      const desc = document.createElement("p");
      desc.className = "item-desc";
      desc.textContent = item.desc;
      node.append(desc);
    }
    const parts = [];
    if (item.author !== "") parts.push(item.author);
    if (item.createAt > 0) parts.push(formatRailAge(item.createAt));
    if (item.like > 0) parts.push("赞 " + item.like);
    if (item.comment > 0) parts.push("评论 " + item.comment);
    if (parts.length > 0) {
      const meta = document.createElement("p");
      meta.className = "item-meta";
      meta.textContent = parts.join(" · ");
      node.append(meta);
    }
    return node;
  }
  function createCommunitySearchPanel() {
    const root = document.createElement("section");
    root.id = COMMUNITY_SEARCH_ID;
    root.setAttribute("aria-label", "社区内搜索");
    const bar = document.createElement("form");
    bar.className = "bar";
    bar.setAttribute("role", "search");
    const icon = document.createElement("span");
    icon.className = "icon";
    icon.innerHTML = COMMUNITY_SEARCH_ICONS.search;
    const scope = document.createElement("span");
    scope.className = "scope";
    const input = document.createElement("input");
    input.className = "q";
    input.type = "text";
    input.name = "q";
    input.autocomplete = "off";
    input.placeholder = "搜索本社区的帖子";
    input.setAttribute("aria-label", "搜索本社区的帖子");
    const go = document.createElement("button");
    go.type = "submit";
    go.className = "go";
    go.textContent = "搜索";
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "reset";
    reset.textContent = "清空";
    reset.hidden = true;
    bar.append(icon, scope, input, reset, go);
    const panel = document.createElement("div");
    panel.className = "panel";
    panel.hidden = true;
    const head = document.createElement("div");
    head.className = "head";
    const headText = document.createElement("div");
    headText.className = "head-text";
    const headTitle = document.createElement("p");
    headTitle.className = "head-title";
    const headMeta = document.createElement("p");
    headMeta.className = "head-meta";
    headMeta.setAttribute("role", "status");
    headMeta.setAttribute("aria-live", "polite");
    headText.append(headTitle, headMeta);
    const headActions = document.createElement("div");
    headActions.className = "head-actions";
    const globalLink = document.createElement("a");
    globalLink.className = "ghost";
    globalLink.href = "/app/search/list";
    globalLink.textContent = "全站搜索";
    globalLink.addEventListener("click", (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigateToPath(globalLink.getAttribute("href") || "/app/search/list");
    });
    const close = document.createElement("button");
    close.type = "button";
    close.className = "close";
    close.textContent = "返回社区";
    headActions.append(globalLink, close);
    head.append(headText, headActions);
    const filters = document.createElement("div");
    filters.className = "filters";
    filters.hidden = true;
    const list = document.createElement("div");
    list.className = "list";
    const foot = document.createElement("div");
    foot.className = "foot";
    foot.hidden = true;
    const more = document.createElement("button");
    more.type = "button";
    more.className = "more";
    more.textContent = "加载更多";
    const status = document.createElement("p");
    status.className = "status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    foot.append(more, status);
    panel.append(head, filters, list, foot);
    root.append(bar, panel);
    return { root, bar, input, reset, scope, panel, headTitle, headMeta, globalLink, filters, list, foot, more, status, close };
  }
  function watchCommunitySearch() {
    if (!document.body) return () => void 0;
    const ui = createCommunitySearchPanel();
    let state = null;
    let searchController = null;
    let restoredTopicId = "";
    const pageNode = () => document.querySelector("#page-topic-link");
    const mainNode = () => document.querySelector("#page-topic-link .topic-link__main");
    const setActive = (active) => {
      const page = pageNode();
      if (page !== null) page.classList.toggle(COMMUNITY_SEARCH_ACTIVE_CLASS, active === true);
      ui.panel.hidden = active !== true;
    };
    const renderChips = () => {
      ui.filters.textContent = "";
      const ranges = state === null ? [] : state.timeRanges;
      const filterTags = state === null ? [] : state.filterTags;
      if (ranges.length === 0 && filterTags.length === 0) {
        ui.filters.hidden = true;
        return;
      }
      ui.filters.hidden = false;
      const build = (label, value) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip";
        chip.textContent = label;
        chip.setAttribute("aria-pressed", String(state !== null && state.timeRange === value));
        chip.addEventListener("click", () => {
          const current = state;
          if (current === null || current.loading === true || current.timeRange === value) return;
          current.timeRange = value;
          current.offset = 0;
          current.items = [];
          current.noMore = false;
          current.duplicatePages = 0;
          persist();
          void run(true);
        });
        ui.filters.append(chip);
      };
      build("不限时间", "");
      for (const range of ranges) build(range.name, range.value);
      if (filterTags.length > 0) {
        const divider = document.createElement("span");
        divider.className = "filter-label";
        divider.textContent = "分类";
        ui.filters.append(divider);
        const buildTag = (label, value) => {
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className = "chip";
          chip.textContent = label;
          chip.setAttribute("aria-pressed", String(state !== null && state.filterTag === value));
          chip.addEventListener("click", () => {
            const current = state;
            if (current === null || current.loading === true || current.filterTag === value) return;
            current.filterTag = value;
            current.offset = 0;
            current.items = [];
            current.noMore = false;
            current.duplicatePages = 0;
            persist();
            void run(true);
          });
          ui.filters.append(chip);
        };
        buildTag("全部分类", "");
        for (const tag of filterTags) buildTag(tag.name, tag.tag);
      }
    };
    const renderItems = () => {
      ui.list.textContent = "";
      const items = state === null ? [] : state.items;
      if (items.length > 0) {
        for (const item of items) ui.list.append(createCommunitySearchItem(item));
        return;
      }
      const empty = document.createElement("p");
      empty.className = "empty";
      if (state === null) empty.textContent = "";
      else if (state.loading === true) empty.textContent = "正在搜索…";
      else if (state.error !== "") empty.textContent = state.error;
      else if (state.tip !== "") empty.textContent = state.tip;
      else empty.textContent = "这个社区里没有匹配的帖子，换个关键词试试。";
      ui.list.append(empty);
    };
    const syncResetVisibility = () => {
      const hidden = ui.input.value === "";
      if (ui.reset.hidden !== hidden) ui.reset.hidden = hidden;
    };
    const render = () => {
      if (state === null) return;
      ui.headTitle.textContent = "在「" + state.topicName + "」中搜索 “" + state.keyword + "”";
      const loaded = state.items.length;
      if (state.loading === true) {
        ui.headMeta.textContent = loaded === 0 ? "搜索中…" : "已加载 " + loaded + " 条，正在继续加载…";
      } else if (loaded === 0) {
        ui.headMeta.textContent = state.error === "" ? "" : "共 0 条";
      } else {
        ui.headMeta.textContent = "本社区已加载 " + loaded + " 条" + (state.noMore === true ? "" : "（还有更多）");
      }
      ui.globalLink.setAttribute("href", "/app/search/list?q=" + encodeURIComponent(state.keyword));
      renderChips();
      renderItems();
      if (ui.input.value !== state.keyword) ui.input.value = state.keyword;
      syncResetVisibility();
      const moreHadFocus = document.activeElement === ui.more;
      ui.foot.hidden = loaded > 0 || state.loading === true ? false : true;
      ui.more.hidden = state.noMore === true;
      ui.more.disabled = state.loading === true;
      if ((ui.more.hidden === true || ui.more.disabled === true) && moreHadFocus) ui.input.focus();
      if (state.status !== "") ui.status.textContent = state.status;
      else if (state.noMore === true && loaded > 0) ui.status.textContent = "已到最后一页";
      else ui.status.textContent = "";
    };
    const run = async (reset) => {
      const current = state;
      if (current === null || current.loading === true) return false;
      current.loading = true;
      current.error = "";
      current.status = reset === true ? "" : "加载中…";
      render();
      const offset = reset === true ? 0 : current.offset;
      if (reset === true) current.offset = 0;
      searchController?.abort();
      const controller2 = new AbortController();
      searchController = controller2;
      const response = await requestCommunitySearch(current.topicId, current.keyword, offset, current.timeRange, current.filterTag, controller2.signal);
      if (state !== current || searchController !== controller2) return false;
      searchController = null;
      current.loading = false;
      current.status = "";
      if (response.aborted === true) {
        current.status = "搜索已取消";
        render();
        return false;
      }
      if (response.ok !== true) {
        if (reset === true) {
          current.items = [];
          current.error = "搜索失败：" + response.message;
        } else {
          current.status = "加载失败：" + response.message;
        }
        render();
        return false;
      }
      const collection = collectCommunitySearchPage(current, response, reset);
      current.noMore = collection.exhausted;
      current.tip = response.tip;
      if (current.timeRanges.length === 0 && response.timeRanges.length > 0) current.timeRanges = response.timeRanges;
      if (current.filterTags.length === 0 && response.filterTags.length > 0) current.filterTags = response.filterTags;
      if (reset !== true && collection.duplicateOnly === true) {
        const duplicates = Math.min(current.duplicatePages + 1, COMMUNITY_SEARCH_DUPLICATE_PAGE_LIMIT);
        current.duplicatePages = duplicates;
        if (duplicates < COMMUNITY_SEARCH_DUPLICATE_PAGE_LIMIT) {
          return await run(false);
        }
        current.status = "已连续 " + duplicates + " 页没有新帖子，已暂停自动翻页";
      } else if (collection.added > 0 || reset === true) {
        current.duplicatePages = 0;
      }
      render();
      return true;
    };
    const clearPanel = () => {
      ui.list.textContent = "";
      ui.filters.textContent = "";
      ui.filters.hidden = true;
      ui.foot.hidden = true;
      ui.headMeta.textContent = "";
    };
    const close = (restoreFocus) => {
      searchController?.abort();
      searchController = null;
      state = null;
      clearPanel();
      setActive(false);
      if (restoreFocus === true) {
        ui.input.setSelectionRange(ui.input.value.length, ui.input.value.length);
      }
      persist();
      if (restoreFocus === true) ui.input.focus();
    };
    const submit = () => {
      const context = readTopicContext();
      if (context === null) return;
      const keyword = ui.input.value.trim();
      if (keyword === "") {
        ui.input.focus();
        return;
      }
      searchController?.abort();
      searchController = null;
      state = {
        topicId: context.topicId,
        topicName: context.name,
        keyword,
        timeRange: "",
        filterTag: "",
        items: [],
        offset: 0,
        noMore: false,
        timeRanges: [],
        filterTags: [],
        tip: "",
        error: "",
        status: "",
        loading: false,
        duplicatePages: 0
      };
      setActive(true);
      render();
      persist();
      void run(true).then(persist, () => void 0);
    };
    ui.bar.addEventListener("submit", (event) => {
      event.preventDefault();
      submit();
    });
    ui.input.addEventListener("input", syncResetVisibility);
    ui.reset.addEventListener("click", () => {
      searchController?.abort();
      searchController = null;
      state = null;
      clearPanel();
      setActive(false);
      ui.input.value = "";
      const context = readTopicContext();
      if (context !== null) clearCommunitySearchSavedState(context.topicId);
      syncResetVisibility();
      ui.input.focus();
    });
    ui.input.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || ui.input.value === "") return;
      event.preventDefault();
      ui.input.value = "";
      syncResetVisibility();
    });
    ui.input.addEventListener("change", persist);
    const onKeyDown = (event) => {
      if (event.key !== "Escape" || state === null || event.defaultPrevented === true) return;
      const target = event.target;
      if (target instanceof Element) {
        if (target !== ui.input && target.closest("input, textarea, select, [contenteditable]") !== null) return;
        const onPage = target === document.body || target === document.documentElement;
        if (onPage !== true && ui.root.contains(target) !== true) return;
        if (onPage === true) {
          const overlayOpen = Array.from(document.querySelectorAll("[aria-modal='true'], .el-overlay-dialog")).some((node) => node.getClientRects().length > 0);
          if (overlayOpen === true) return;
        }
      }
      event.preventDefault();
      close(true);
    };
    document.addEventListener("keydown", onKeyDown);
    ui.close.addEventListener("click", () => close(true));
    ui.more.addEventListener("click", () => {
      void run(false).then(persist, () => void 0);
    });
    const sync = () => {
      ensureCommunitySearchStyle();
      const context = readTopicContext();
      const main = mainNode();
      if (context === null || main === null) {
        searchController?.abort();
        searchController = null;
        if (ui.root.parentNode !== null) ui.root.remove();
        restoredTopicId = "";
        ui.input.value = "";
        syncResetVisibility();
        if (state !== null) {
          state = null;
          clearPanel();
        }
        setActive(false);
        return;
      }
      const anchor = main.querySelector(".topic-link__filter-row");
      const mount = anchor === null ? main : anchor.parentNode;
      if (mount === null) return;
      const misplaced = ui.root.parentNode !== mount || anchor !== null && ui.root.nextElementSibling !== anchor;
      if (misplaced === true) {
        if (anchor !== null) mount.insertBefore(ui.root, anchor);
        else mount.append(ui.root);
      }
      if (ui.scope.textContent !== context.name) ui.scope.textContent = context.name;
      const placeholder = "在「" + context.name + "」中搜索帖子";
      if (ui.input.placeholder !== placeholder) ui.input.placeholder = placeholder;
      if (ui.input.getAttribute("aria-label") !== placeholder) ui.input.setAttribute("aria-label", placeholder);
      if (state !== null && state.topicId !== context.topicId) {
        searchController?.abort();
        searchController = null;
        state = null;
        clearPanel();
      }
      restore(context);
      setActive(state !== null);
    };
    function persist() {
      const context = readTopicContext();
      if (context === null) return;
      const current = state !== null && state.topicId === context.topicId ? state : null;
      const keyword = current !== null ? current.keyword : normalizeSearchKeyword(ui.input.value);
      if (keyword === "") {
        clearCommunitySearchSavedState(context.topicId);
        return;
      }
      const ranges = current !== null ? current.timeRanges : [];
      writeCommunitySearchSession({
        version: 1,
        topicId: context.topicId,
        keyword,
        timeRange: current !== null ? resolveCommunitySearchRange(ranges, current.timeRange) : "",
        filterTag: current !== null ? current.filterTag : "",
        open: current !== null || ui.input.value.trim() !== "",
        results: current !== null,
        items: current !== null ? current.items : [],
        offset: current !== null ? current.offset : 0,
        noMore: current !== null ? current.noMore : false,
        timeRanges: ranges,
        filterTags: current !== null ? current.filterTags : []
      });
    }
    const restore = (context) => {
      if (restoredTopicId === context.topicId) return;
      if (restoredTopicId !== "") {
        ui.input.value = "";
        syncResetVisibility();
      }
      restoredTopicId = context.topicId;
      const saved = readCommunitySearchSession(context.topicId);
      if (saved === null) return;
      ui.input.value = saved.keyword;
      syncResetVisibility();
      if (saved.open !== true) return;
      state = {
        topicId: context.topicId,
        topicName: context.name,
        keyword: saved.keyword,
        timeRange: saved.timeRange,
        filterTag: saved.filterTag,
        items: saved.results === true ? saved.items : [],
        offset: saved.offset,
        noMore: saved.noMore,
        timeRanges: saved.timeRanges,
        filterTags: saved.filterTags,
        tip: "",
        error: "",
        status: "",
        loading: false,
        duplicatePages: 0
      };
      setActive(true);
      render();
      if (saved.results !== true) void run(true).then(persist, () => void 0);
    };
    registerPageSync(sync, 250, [PAGE_ROUTE.TOPIC], "topic");
    const controller = new AbortController();
    window.addEventListener("popstate", () => {
      if (state !== null) close(false);
    }, { signal: controller.signal });
    sync();
    return () => {
      controller.abort();
      searchController?.abort();
      searchController = null;
      pageSyncTasks.delete(sync);
      ui.root.remove();
      document.removeEventListener("keydown", onKeyDown);
      setActive(false);
    };
  }

  // scripts/heybox-up/src/ui/desktop.ts
  var DESKTOP_STYLE_ID = "heybox-up-desktop-style";
  var DESKTOP_LEFT_ID = "heybox-up-left-rail";
  var DESKTOP_RIGHT_ID = "heybox-up-right-rail";
  var DESKTOP_PAGE_CLASS = "heybox-up-desktop";
  var DESKTOP_HOT_TARGET_CLASS = "heybox-up-hot-target";
  var DESKTOP_HOT_LIMIT = 6;
  var COMMUNITY_CARD_ACTION_SELECTOR = "#page-bbs-community .list-cotent__operation-btn";
  function labelCommunityCardActions(root = document) {
    for (const button of root.querySelectorAll(COMMUNITY_CARD_ACTION_SELECTOR)) {
      if (button.getAttribute("aria-label") === null && button.textContent?.trim() === "") {
        button.setAttribute("aria-label", "更多帖子操作");
      }
      if (button.title === "" && button.getAttribute("aria-label") !== null) {
        button.title = button.getAttribute("aria-label") || "";
      }
    }
  }
  var DESKTOP_CSS = `
  #heybox-up-left-rail, #heybox-up-right-rail { display: none; }
  #heybox-up-left-rail,
  #heybox-up-right-rail {
    position: sticky;
    /* 桌面隐藏站点顶部搜索条后，侧栏直接停在导航下方。 */
    top: 80px;
    max-height: calc(100vh - 100px);
    overflow: auto;
    font: 13px/1.55 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
    color: var(--heybox-up-text-2, #3c4249);
    scrollbar-width: thin;
  }
  #heybox-up-left-rail .rail-block,
  #heybox-up-right-rail .rail-block {
    padding: 13px 10px;
    border: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .1));
    border-radius: var(--heybox-up-radius-card, 14px);
    background: var(--heybox-up-surface, #fff);
    box-shadow: var(--heybox-up-shadow-1, none);
  }
  #heybox-up-left-rail .rail-block + .rail-block,
  #heybox-up-right-rail .rail-block + .rail-block { margin-top: 12px; }
  #heybox-up-right-rail .rail-block[hidden] { display: none !important; }
  #heybox-up-right-rail .rail-block[hidden] + .rail-block { margin-top: 0; }
  #heybox-up-right-rail[hidden] { display: none !important; }
  #heybox-up-left-rail .rail-title,
  #heybox-up-right-rail .rail-title {
    margin: 0 0 7px;
    padding: 0 8px;
    color: var(--heybox-up-muted, #6b7280);
    font-size: 11px;
    font-weight: 600;
    line-height: 1.5;
    letter-spacing: .08em;
  }
  #heybox-up-left-rail .rail-link,
  #heybox-up-left-rail .rail-channel,
  #heybox-up-right-rail .rail-link {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    height: 34px;
    margin: 0;
    padding: 0 8px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--heybox-up-text-2, #3c4249);
    font: inherit;
    font-size: 13px;
    line-height: 34px;
    text-align: left;
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;
    transition: background .14s ease, color .14s ease;
  }
  #heybox-up-left-rail .rail-link:hover,
  #heybox-up-left-rail .rail-channel:hover,
  #heybox-up-right-rail .rail-link:hover {
    background: var(--heybox-up-subtle, rgba(20, 25, 30, .06));
    color: var(--heybox-up-text, #14191e);
  }
  #heybox-up-left-rail .rail-link.is-active {
    background: rgba(111, 141, 179, .13);
    color: var(--heybox-up-accent, #6f8db3);
    font-weight: 600;
  }
  #heybox-up-left-rail .rail-link svg,
  #heybox-up-right-rail .rail-link svg { width: 17px; height: 17px; flex: none; }
  #heybox-up-left-rail .rail-channel img {
    width: 22px;
    height: 22px;
    flex: none;
    border-radius: 6px;
    object-fit: cover;
    background: var(--heybox-up-subtle, rgba(20, 25, 30, .06));
  }
  #heybox-up-left-rail .rail-channel .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  #heybox-up-left-rail .channels { max-height: 288px; overflow: auto; scrollbar-width: thin; }
  #heybox-up-left-rail .rail-link:focus-visible,
  #heybox-up-left-rail .rail-channel:focus-visible,
  #heybox-up-right-rail .rail-link:focus-visible,
  #heybox-up-right-rail .hot-item:focus-visible {
    outline: 2px solid var(--heybox-up-accent, #6f8db3);
    outline-offset: -2px;
  }
  #heybox-up-right-rail .hot-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  #heybox-up-right-rail .hot-item {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    column-gap: 7px;
    width: 100%;
    margin: 0;
    padding: 8px 6px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background .14s ease;
  }
  #heybox-up-right-rail .hot-item:hover { background: var(--heybox-up-subtle, rgba(20, 25, 30, .06)); }
  #heybox-up-right-rail .hot-rank {
    color: var(--heybox-up-muted, #6b7280);
    font-size: 12px;
    font-weight: 700;
    line-height: 1.5;
    font-variant-numeric: tabular-nums;
  }
  #heybox-up-right-rail .hot-item:nth-child(-n+3) .hot-rank { color: var(--heybox-up-accent, #6f8db3); }
  #heybox-up-right-rail .hot-title {
    display: -webkit-box;
    overflow: hidden;
    color: var(--heybox-up-text-2, #3c4249);
    font-size: 13px;
    line-height: 1.45;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
  #heybox-up-right-rail .hot-item:hover .hot-title { color: var(--heybox-up-text, #14191e); }
  #heybox-up-right-rail .hot-meta {
    grid-column: 2;
    margin-top: 2px;
    color: var(--heybox-up-muted, #6b7280);
    font-size: 11px;
    line-height: 1.5;
  }
  #heybox-up-right-rail .rail-empty {
    margin: 0;
    padding: 10px 8px;
    color: var(--heybox-up-muted, #6b7280);
    font-size: 12px;
    line-height: 1.6;
  }
  #page-bbs-community .heybox-up-hot-target {
    border-color: var(--heybox-up-accent, #6f8db3) !important;
    box-shadow: 0 0 0 3px rgba(111, 141, 179, .18) !important;
  }
  @media (min-width: 1200px) {
    /* 顶部搜索条会横跨信息流、压住左栏上沿；桌面把搜索入口收进左栏“浏览”。
       站点还用固定 ::before 给搜索条铺 146px 高的遮罩；搜索条隐藏后把遮罩压到
       导航高度，既保留导航下方 16px 的顶部留白，也避免滚动时正文从留白处露出。 */
    #page-bbs-community.heybox-up-desktop .bbs-community__search-module {
      display: none !important;
    }
    #page-bbs-community.heybox-up-desktop::before {
      bottom: auto !important;
      height: 80px !important;
    }
    /* 站点还让 main.list 的 8px sticky 伪元素停在原搜索条下沿；搜索条隐藏后
       它会在 138px 处横切信息流并截获点击。保留其占位，取消吸顶与绘制。 */
    #page-bbs-community.heybox-up-desktop main.list::before {
      position: static !important;
      background: transparent !important;
      pointer-events: none !important;
    }
    #page-bbs-community.heybox-up-desktop .content {
      display: grid !important;
      width: 100% !important;
      /* 左右两列等宽，中间栏永远落在视口正中；两侧栏贴近中间栏而不是贴屏幕边。 */
      grid-template-columns:
        minmax(0, 1fr)
        /* 中栏再宽也要给两侧栏留出 208px + 288px + 间距，否则侧栏会压到正文上。 */
        minmax(320px, min(var(--heybox-up-feed-w), calc(100vw - 560px)))
        minmax(0, 1fr);
      column-gap: 24px;
      align-items: start;
      max-width: none !important;
      margin: 0 auto !important;
      justify-content: stretch !important;
    }
    #page-bbs-community.heybox-up-desktop .content > #heybox-up-left-rail {
      display: block;
      grid-column: 1;
      grid-row: 1;
      justify-self: end;
      width: 208px;
      align-self: start;
    }
    #page-bbs-community.heybox-up-desktop .content > main.list {
      grid-column: 2;
      grid-row: 1;
      width: auto !important;
      max-width: none !important;
      min-width: 0;
      margin: 0 !important;
      flex: none !important;
    }
    body:not(.heybox-up-rail-open) #page-bbs-community.heybox-up-desktop.heybox-up-no-right-modules .content {
      grid-template-columns: minmax(208px, 1fr) minmax(320px, min(var(--heybox-up-feed-w), calc(100vw - 256px))) !important;
      justify-content: center;
    }
    body:not(.heybox-up-rail-open) #page-bbs-community.heybox-up-desktop.heybox-up-no-right-modules .content > main.list { grid-column: 2; }
    body:not(.heybox-up-rail-open) #page-bbs-community.heybox-up-desktop.heybox-up-no-right-modules .content > #heybox-up-left-rail { grid-column: 1; }
    #page-bbs-community.heybox-up-desktop.heybox-up-no-right-modules .content > #heybox-up-right-rail { display: none !important; }
    /* 评论预览只占右侧一列的真实宽度。旧实现再叠一层“侧栏 + 48px”右内边距，
       会在面板与信息流之间留下近乎双倍于面板的空白，并把中栏挤向左侧。 */
    body.heybox-up-rail-open #app > main { max-width: none !important; }
    body.heybox-up-rail-open #page-bbs-community.heybox-up-desktop .content {
      grid-template-columns:
        minmax(var(--heybox-up-rail-w), 1fr)
        minmax(320px, min(var(--heybox-up-feed-w), calc(100% - var(--heybox-up-rail-w) - var(--heybox-up-rail-w) - 48px)))
        minmax(var(--heybox-up-rail-w), 1fr);
      column-gap: 24px;
    }
    /* 左栏已有频道列表，原生横向频道条不再重复出现。 */
    #page-bbs-community.heybox-up-desktop .bbs-home__topic-list-wrapper {
      display: none !important;
    }
  }
  @media (min-width: 1500px) {
    body.heybox-up-desktop-on #app > main {
      max-width: none !important;
    }
    body.heybox-up-desktop-on #page-bbs-community {
      max-width: none !important;
      width: auto !important;
    }
    #page-bbs-community.heybox-up-desktop .content > #heybox-up-right-rail {
      display: block;
      grid-column: 3;
      grid-row: 1;
      justify-self: start;
      width: 288px;
      align-self: start;
    }
  }
  @media (min-width: 1500px) {
    body.heybox-up-rail-open #page-bbs-community.heybox-up-desktop #heybox-up-right-rail {
      display: none;
    }
  }
`;
  function ensureDesktopStyle() {
    ensureStyleElement(DESKTOP_STYLE_ID, DESKTOP_CSS);
  }
  function parseCompactCount(value) {
    const match = /([0-9]+(?:\.[0-9]+)?)\s*(亿|万)?/.exec(value || "");
    if (match === null) return 0;
    const base = Number(match[1]);
    if (!Number.isFinite(base)) return 0;
    const unit = match[2] === "亿" ? 1e8 : match[2] === "万" ? 1e4 : 1;
    return Math.round(base * unit);
  }
  function createDesktopRailLink(item, active) {
    const link = document.createElement("a");
    link.className = "rail-link" + (active === true ? " is-active" : "");
    link.href = item.href;
    link.dataset["route"] = item.id;
    link.innerHTML = item.icon;
    const label = document.createElement("span");
    label.textContent = item.label;
    link.append(label);
    link.addEventListener("click", (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigateToPath(item.href);
    });
    return link;
  }
  function createDesktopLeftRail() {
    const root = document.createElement("aside");
    root.id = DESKTOP_LEFT_ID;
    root.setAttribute("aria-label", "浏览与频道");
    const browse = document.createElement("section");
    browse.className = "rail-block";
    const browseTitle = document.createElement("p");
    browseTitle.className = "rail-title";
    browseTitle.textContent = "浏览";
    browse.append(browseTitle);
    const links = [
      { id: "community", label: "社区首页", href: "/app/bbs/home", icon: navIconMarkupFor("community") },
      { id: "favour", label: "我的收藏", href: "/app/user/favour/content", icon: navIconMarkupFor("favour") },
      { id: "article", label: "我的文章", href: "/creator/content_management/home?article_type=all", icon: navIconMarkupFor("article") },
      { id: "search", label: "全站搜索", href: "/app/search/list", icon: COMMUNITY_SEARCH_ICONS.search }
    ];
    for (const item of links) browse.append(createDesktopRailLink(item, item.id === "community"));
    const channelBlock = document.createElement("section");
    channelBlock.className = "rail-block";
    const channelTitle = document.createElement("p");
    channelTitle.className = "rail-title";
    channelTitle.textContent = "频道";
    const channels = document.createElement("div");
    channels.className = "channels";
    channelBlock.append(channelTitle, channels);
    root.append(browse, channelBlock);
    return { root, channels };
  }
  function createDesktopRightRail() {
    const root = document.createElement("aside");
    root.id = DESKTOP_RIGHT_ID;
    root.setAttribute("aria-label", "热门与快捷入口");
    const hotBlock = document.createElement("section");
    hotBlock.className = "rail-block";
    const hotTitle = document.createElement("p");
    hotTitle.className = "rail-title";
    hotTitle.textContent = "热门排行";
    const hotHint = document.createElement("p");
    hotHint.className = "rail-hint";
    hotHint.textContent = "仅统计当前已加载的信息流";
    const hot = document.createElement("ol");
    hot.className = "hot-list";
    hotBlock.append(hotTitle, hotHint, hot);
    const toolsBlock = document.createElement("section");
    toolsBlock.className = "rail-block";
    const toolsTitle = document.createElement("p");
    toolsTitle.className = "rail-title";
    toolsTitle.textContent = "快捷入口";
    toolsBlock.append(toolsTitle);
    const tools = [
      { id: "favour", label: "我的收藏", href: "/app/user/favour/content", icon: navIconMarkupFor("favour") },
      { id: "article", label: "我的文章", href: "/creator/content_management/home?article_type=all", icon: navIconMarkupFor("article") }
    ];
    for (const item of tools) toolsBlock.append(createDesktopRailLink(item, false));
    root.append(hotBlock, toolsBlock);
    return { root, hot, hotBlock, shortcutsBlock: toolsBlock };
  }
  function readDesktopChannels() {
    return Array.from(document.querySelectorAll("#page-bbs-community .bbs-home__topic-item")).map((button) => {
      const nameNode = button.querySelector(".bbs-home__topic-name");
      const imageNode = button.querySelector("img.bbs-home__topic-item-icon");
      const name = normalizeRailText(nameNode instanceof Element ? nameNode.textContent : button.textContent).slice(0, 24);
      return { name, icon: imageNode === null ? "" : imageNode.getAttribute("src") || "" };
    }).filter((entry) => entry.name !== "");
  }
  function syncDesktopChannels(ui, cache) {
    const channels = readDesktopChannels();
    const signature = channels.map((entry) => entry.name + "" + entry.icon).join("");
    if (signature === cache.channels) return;
    cache.channels = signature;
    ui.channels.textContent = "";
    if (channels.length === 0) {
      const empty = document.createElement("p");
      empty.className = "rail-empty";
      empty.textContent = "频道列表还没渲染好";
      ui.channels.append(empty);
      return;
    }
    for (const channel of channels) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "rail-channel";
      if (channel.icon !== "") {
        const icon = document.createElement("img");
        icon.src = channel.icon;
        icon.alt = "";
        icon.loading = "lazy";
        icon.referrerPolicy = "no-referrer";
        button.append(icon);
      }
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = channel.name;
      button.append(name);
      button.addEventListener("click", () => {
        const native = Array.from(document.querySelectorAll("#page-bbs-community .bbs-home__topic-item")).find((node) => {
          const label = node.querySelector(".bbs-home__topic-name");
          return normalizeRailText(label === null ? node.textContent : label.textContent) === channel.name;
        });
        if (!native) return;
        for (const node of ui.channels.querySelectorAll(".rail-channel")) node.classList.remove("is-active");
        button.classList.add("is-active");
        if (native instanceof HTMLElement) native.click();
      });
      ui.channels.append(button);
    }
  }
  function readDesktopHotItems() {
    return Array.from(document.querySelectorAll("#page-bbs-community .bbs-home__content-item")).map((card, index) => {
      const link = card.querySelector("a[href*='/app/bbs/link/']");
      const href = link === null ? "" : link.getAttribute("href") || "";
      const idMatch = /\/app\/bbs\/link\/(\d+)/.exec(href);
      const titleNode = card.querySelector(".bbs-content__title");
      const title = normalizeRailText(titleNode instanceof Element ? titleNode.textContent : card.textContent).slice(0, 80);
      const commentNode = card.querySelector(".bbs-new-style-bottom__comment, .content-list__comment");
      const likeNode = card.querySelector(".bbs-new-style-bottom__like, .content-list__like");
      const comment = parseCompactCount(commentNode === null ? "" : commentNode.textContent);
      const like = parseCompactCount(likeNode === null ? "" : likeNode.textContent);
      return { card, index, id: idMatch === null ? "i" + index : idMatch[1], title, comment, like, score: comment * 2 + like };
    }).filter((entry) => entry.title !== "").sort((left, right) => right.score - left.score).slice(0, DESKTOP_HOT_LIMIT);
  }
  function syncDesktopHot(ui, cache) {
    ui.hotBlock.hidden = !readDesktopRailPreference("hotRanking");
    ui.shortcutsBlock.hidden = !readDesktopRailPreference("shortcuts");
    ui.root.hidden = ui.hotBlock.hidden && ui.shortcutsBlock.hidden;
    const items = readDesktopHotItems();
    const signature = items.map((item) => item.id + ":" + item.score + ":" + item.title).join("|");
    if (signature === cache.hot) return;
    cache.hot = signature;
    ui.hot.textContent = "";
    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "rail-empty";
      empty.textContent = "信息流还没有可排序的热度数据";
      ui.hot.append(empty);
      return;
    }
    items.forEach((item, index) => {
      const row = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "hot-item";
      const rank = document.createElement("span");
      rank.className = "hot-rank";
      rank.textContent = String(index + 1);
      const title = document.createElement("span");
      title.className = "hot-title";
      title.textContent = item.title;
      const meta = document.createElement("span");
      meta.className = "hot-meta";
      const parts = [];
      if (item.comment > 0) parts.push(item.comment + " 评论");
      if (item.like > 0) parts.push(item.like + " 赞");
      meta.textContent = parts.length === 0 ? "当前信息流" : parts.join(" · ");
      button.append(rank, title, meta);
      button.addEventListener("click", () => {
        item.card.scrollIntoView({ behavior: "smooth", block: "center" });
        item.card.classList.add(DESKTOP_HOT_TARGET_CLASS);
        window.setTimeout(() => item.card.classList.remove(DESKTOP_HOT_TARGET_CLASS), 1400);
      });
      row.append(button);
      ui.hot.append(row);
    });
  }
  function watchDesktopShell() {
    if (!document.body) return;
    const desktopViewport = window.matchMedia("(min-width: 1200px)");
    const left = createDesktopLeftRail();
    const right = createDesktopRightRail();
    const cache = { channels: "", hot: "" };
    let lastDesktopSyncAt = 0;
    let lastDesktopPath = location.pathname;
    const teardown = () => {
      document.body.classList.remove("heybox-up-desktop-on");
      const page = document.querySelector("#page-bbs-community");
      if (page !== null) page.classList.remove(DESKTOP_PAGE_CLASS);
      if (left.root.parentNode !== null) left.root.remove();
      if (right.root.parentNode !== null) right.root.remove();
    };
    const sync = (force = false) => {
      const now = performance.now();
      if (location.pathname !== lastDesktopPath) {
        lastDesktopPath = location.pathname;
        force = true;
      }
      if (!force && now - lastDesktopSyncAt < 500) return;
      lastDesktopSyncAt = now;
      labelCommunityCardActions();
      if (!desktopViewport.matches) {
        teardown();
        return;
      }
      const page = document.querySelector("#page-bbs-community");
      const content = page === null ? null : page.querySelector(".content");
      if (page === null || content === null || page.querySelector("main.list") === null) {
        teardown();
        return;
      }
      ensureDesktopStyle();
      page.classList.add(DESKTOP_PAGE_CLASS);
      page.classList.toggle("heybox-up-no-right-modules", !readDesktopRailPreference("hotRanking") && !readDesktopRailPreference("shortcuts"));
      document.body.classList.add("heybox-up-desktop-on");
      if (left.root.parentNode !== content) content.prepend(left.root);
      if (right.root.parentNode !== content) content.append(right.root);
      syncDesktopChannels(left, cache);
      syncDesktopHot(right, cache);
    };
    registerPageSync(sync, 400, [PAGE_ROUTE.FEED], "feed");
    document.addEventListener("heybox-up:desktop-rail-preference", () => sync(true));
    window.addEventListener("popstate", () => requestAnimationFrame(() => sync(true)));
    desktopViewport.addEventListener("change", () => sync(true));
    sync(true);
  }

  // scripts/heybox-up/src/ui/favour.ts
  var FAVOUR_HOST_ID = "heybox-up-favour";
  var LOGIN_RETRY_DELAY_MS = 1500;
  var LOGIN_RETRY_MAX = 3;
  var FAVOUR_LIST_SELECTOR = ".user-favour__list";
  function formatFavourCountNote(total, matched, query, hasNext) {
    const filtered = query.trim() !== "" ? "，匹配 " + matched + " 条" : "";
    const prefix = total >= CY_MAX_ITEMS && hasNext ? "已加载" : "共";
    const count = prefix + " " + total + " 条插眼收藏" + filtered + "，网页收藏列表默认不显示。";
    if (total < CY_MAX_ITEMS) return count;
    return hasNext ? count + " 已达到单批读取上限，可点击「加载更多」继续读取。" : count + " 接口已确认没有更多记录。";
  }
  var FAVOUR_CSS = `
  :host { display: block; scroll-margin-top: 80px; font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; }
  .section { padding: 14px 8px 4px; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
  .heading { font-size: 14px; font-weight: 700; }
  .refresh, .retry {
    font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 8px;
    border: 1px solid rgba(127,127,127,.32); background: transparent; color: inherit; cursor: pointer;
  }
  .refresh:hover:not(:disabled), .retry:hover { border-color: rgba(127,127,127,.55); }
  .refresh:disabled { opacity: .5; cursor: default; }
  .retry { margin: -2px 0 10px; }
  .load-more {
    display: block; margin: 2px auto 12px; font: inherit; font-size: 12px; padding: 5px 14px;
    border-radius: 8px; border: 1px solid rgba(127,127,127,.32); background: transparent; color: inherit; cursor: pointer;
  }
  .load-more:hover:not(:disabled) { border-color: rgba(127,127,127,.55); }
  .load-more:disabled { opacity: .5; cursor: default; }
  .note { font-size: 12px; opacity: .62; margin-bottom: 10px; }
  .search {
    width: 100%; box-sizing: border-box; margin-bottom: 10px; padding: 7px 10px;
    border-radius: 8px; border: 1px solid rgba(127,127,127,.28);
    background: rgba(127,127,127,.08); color: inherit; font: inherit; font-size: 13px;
  }
  .search:focus { outline: none; border-color: #6f8db3; }
  .card {
    display: flex; gap: 10px; padding: 10px; margin-bottom: 8px;
    border-radius: 12px; text-decoration: none; color: inherit;
    border: 1px solid rgba(127,127,127,.22);
  }
  .card:hover { border-color: rgba(127,127,127,.45); }
  .thumb { width: 52px; height: 52px; border-radius: 9px; object-fit: cover; flex: none; background: rgba(127,127,127,.16); }
  .body { min-width: 0; flex: 1; }
  .card-title {
    font-weight: 600; font-size: 13px; margin-bottom: 3px;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .card-text {
    display: flex; gap: 6px; align-items: flex-start; margin-bottom: 6px;
    font-size: 14px; line-height: 1.5; color: inherit;
  }
  .card-text-icon { width: 15px; height: 15px; flex: none; margin-top: 2px; color: #6f8db3; }
  .card-text-body { min-width: 0; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .card-text.is-empty { font-size: 12px; opacity: .55; }
  .card-foot { margin-top: 5px; font-size: 11px; opacity: .6; display: flex; gap: 10px; }
`;
  function createFavourSection() {
    const host = document.createElement("div");
    host.id = FAVOUR_HOST_ID;
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = FAVOUR_CSS;
    shadow.append(style);
    const section = document.createElement("section");
    section.className = "section";
    const head = document.createElement("div");
    head.className = "head";
    const heading = document.createElement("div");
    heading.className = "heading";
    heading.textContent = "插眼收藏";
    const refresh = document.createElement("button");
    refresh.type = "button";
    refresh.className = "refresh";
    refresh.textContent = "刷新";
    refresh.setAttribute("aria-label", "刷新插眼收藏");
    head.append(heading, refresh);
    const note = document.createElement("div");
    note.className = "note";
    note.setAttribute("role", "status");
    note.setAttribute("aria-live", "polite");
    note.textContent = "正在读取插眼收藏…";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "retry";
    retry.textContent = "重试";
    retry.hidden = true;
    const search = document.createElement("input");
    search.type = "search";
    search.className = "search";
    search.placeholder = "搜索标题或插眼内容";
    search.setAttribute("aria-label", "搜索插眼收藏");
    search.hidden = true;
    const list = document.createElement("div");
    list.className = "list";
    const moreButton = document.createElement("button");
    moreButton.type = "button";
    moreButton.className = "load-more";
    moreButton.textContent = "加载更多";
    moreButton.hidden = true;
    moreButton.setAttribute("aria-label", "加载更多插眼收藏");
    section.append(head, note, retry, search, list, moreButton);
    shadow.append(section);
    const state = {
      items: [],
      loading: false,
      loadingMore: false,
      error: "",
      notice: "",
      progress: 0,
      query: "",
      hasNext: false,
      nextOffset: 0
    };
    let loadController = null;
    let moreController = null;
    let loginRetryTimer = 0;
    let loginRetryLeft = 0;
    let disposed = false;
    const render = () => {
      const query = state.query.trim();
      const needle = query.toLowerCase();
      const matched = needle === "" ? state.items : state.items.filter((item) => item.title.toLowerCase().includes(needle) || item.text.toLowerCase().includes(needle));
      list.replaceChildren();
      refresh.disabled = state.loading || state.loadingMore;
      refresh.textContent = state.loading ? "读取中…" : "刷新";
      retry.hidden = state.error === "" || state.items.length > 0 && state.hasNext;
      search.hidden = state.items.length === 0;
      moreButton.hidden = state.loading || state.items.length === 0 || !state.hasNext;
      moreButton.disabled = state.loadingMore;
      moreButton.textContent = state.loadingMore ? "加载中…" : "加载更多";
      if (state.error !== "") {
        note.textContent = "读取失败：" + state.error + (state.items.length > 0 ? "（显示上次结果）" : "");
      } else if (state.notice !== "") {
        note.textContent = state.notice;
      } else if (state.loading) {
        note.textContent = "正在读取插眼收藏…" + (state.progress > 0 ? " 已获取 " + state.progress + " 条" : "");
      } else if (state.loadingMore) {
        note.textContent = "正在加载更多插眼收藏…" + (state.progress > 0 ? " 已获取 " + state.progress + " 条" : "");
      } else if (state.items.length === 0) {
        note.textContent = "没有插眼收藏。";
      } else if (matched.length === 0) {
        note.textContent = "没有匹配“" + query + "”的插眼条目。";
      } else {
        note.textContent = formatFavourCountNote(state.items.length, matched.length, query, state.hasNext);
      }
      if (matched.length === 0) return;
      const fragment = document.createDocumentFragment();
      for (const item of matched) fragment.append(createCard(item));
      list.append(fragment);
    };
    const readFavourContainer = () => {
      const page = document.querySelector("#page-user-favour");
      if (!page) return null;
      return page.querySelector(".content") ?? page;
    };
    const place = () => {
      const listNode = document.querySelector(FAVOUR_LIST_SELECTOR);
      if (listNode && listNode.parentElement) {
        const container2 = listNode.parentElement;
        if (host.parentNode !== container2 || host.previousElementSibling !== listNode) {
          container2.insertBefore(host, listNode.nextSibling);
        }
        return;
      }
      const container = readFavourContainer();
      if (container === null) return;
      if (host.parentNode !== container || host.nextSibling !== null) container.append(host);
    };
    const load = async (force) => {
      if (disposed || state.loading) return;
      window.clearTimeout(loginRetryTimer);
      loginRetryTimer = 0;
      state.loading = true;
      state.error = "";
      state.notice = "";
      state.progress = 0;
      render();
      loadController?.abort();
      moreController?.abort();
      loadController = new AbortController();
      let loginMissing = false;
      try {
        const userId = await resolveHeyboxId(loadController.signal);
        if (userId === "") {
          loginMissing = true;
          state.notice = "未登录小黑盒，无法读取插眼收藏。";
          return;
        }
        loginRetryLeft = 0;
        const cached = force ? null : readCache(userId);
        if (cached) {
          state.items = cached.items;
          state.hasNext = cached.hasNext;
          state.nextOffset = cached.nextOffset;
          return;
        }
        const batch = await loadCyFavoritesBatch(userId, {
          onProgress: (count) => {
            state.progress = count;
            note.textContent = "正在读取插眼收藏… 已获取 " + count + " 条";
          }
        }, loadController.signal);
        state.items = batch.items;
        state.hasNext = batch.hasNext;
        state.nextOffset = batch.nextOffset;
        writeCache(userId, { items: state.items, hasNext: state.hasNext, nextOffset: state.nextOffset });
      } catch (error) {
        if (isAbortError(error)) return;
        state.error = error instanceof Error ? error.message : String(error);
      } finally {
        state.loading = false;
        loadController = null;
        render();
        if (loginMissing && loginRetryLeft < LOGIN_RETRY_MAX) {
          loginRetryLeft += 1;
          loginRetryTimer = window.setTimeout(() => void load(false), LOGIN_RETRY_DELAY_MS);
        }
      }
    };
    const loadMore = async () => {
      if (disposed || state.loading || state.loadingMore || !state.hasNext) return;
      window.clearTimeout(loginRetryTimer);
      loginRetryTimer = 0;
      state.loadingMore = true;
      state.error = "";
      state.notice = "";
      state.progress = 0;
      render();
      moreController?.abort();
      moreController = new AbortController();
      try {
        const userId = await resolveHeyboxId(moreController.signal);
        if (userId === "") {
          state.error = "登录状态已失效，无法读取更多插眼收藏。";
          return;
        }
        const batch = await loadCyFavoritesBatch(userId, {
          offset: state.nextOffset,
          seenIds: state.items.map((item) => item.id),
          onProgress: (count) => {
            state.progress = count;
            note.textContent = "正在加载更多插眼收藏… 已获取 " + count + " 条";
          }
        }, moreController.signal);
        state.items = mergeCyFavorites(state.items, batch.items);
        state.hasNext = batch.hasNext;
        state.nextOffset = batch.nextOffset;
        writeCache(userId, { items: state.items, hasNext: state.hasNext, nextOffset: state.nextOffset });
      } catch (error) {
        if (isAbortError(error)) return;
        state.error = error instanceof Error ? error.message : String(error);
      } finally {
        state.loadingMore = false;
        moreController = null;
        render();
      }
    };
    refresh.addEventListener("click", () => void load(true));
    retry.addEventListener("click", () => void load(true));
    moreButton.addEventListener("click", () => void loadMore());
    search.addEventListener("input", () => {
      state.query = search.value;
      render();
    });
    place();
    void load(false);
    return {
      host,
      place,
      dispose: () => {
        disposed = true;
        window.clearTimeout(loginRetryTimer);
        loginRetryTimer = 0;
        loginRetryLeft = LOGIN_RETRY_MAX;
        loadController?.abort();
        loadController = null;
        moreController?.abort();
        moreController = null;
        state.loading = false;
        state.loadingMore = false;
      }
    };
  }
  function watchFavourPage() {
    if (!document.body) return;
    let section = null;
    let cyJumpDone = false;
    const sync = () => {
      if (readPageRoute() !== PAGE_ROUTE.FAVOUR) {
        cyJumpDone = false;
        if (section) {
          section.dispose();
          section.host.remove();
          section = null;
        }
        return;
      }
      if (!section) section = createFavourSection();
      section.place();
      if (!cyJumpDone && location.hash === CY_HASH) {
        requestAnimationFrame(() => {
          if (!scrollToCySection()) return;
          cyJumpDone = true;
        });
      }
    };
    registerPageSync(sync, 300, [PAGE_ROUTE.FAVOUR], "favour");
    sync();
  }
  function readFavourId(value) {
    if (value === void 0 || value === null) return "";
    const text = String(value).trim();
    if (text === "" || text === "0" || text === "-1" || text === "undefined" || text === "null") return "";
    return text;
  }
  function normalizeFavourFolders(records) {
    const folders = [];
    const seen = /* @__PURE__ */ new Set();
    for (const entry of records) {
      const record = asRecord(entry);
      if (record === null) continue;
      const id = readFavourId(record["id"] ?? record["folder_id"]);
      if (id === "" || seen.has(id)) continue;
      seen.add(id);
      const rawName = String(record["name"] ?? record["folder_name"] ?? "").trim();
      folders.push({ id, name: rawName === "" ? "未命名收藏夹" : rawName });
    }
    return folders;
  }
  function readFavourFolderId(result) {
    const record = asRecord(result);
    if (record === null) return "";
    const folder = asRecord(record["folder"]);
    return readFavourId(folder?.["id"] ?? folder?.["folder_id"] ?? record["folder_id"]);
  }
  function readFavourLinkId(entry) {
    const record = asRecord(entry);
    if (record === null) return "";
    const link = asRecord(record["link"]);
    return readFavourId(
      link?.["linkid"] ?? link?.["link_id"] ?? link?.["id"] ?? record["link_id"] ?? record["linkid"]
    );
  }
  function readFavourFolderPage(result) {
    const record = asRecord(result);
    if (record === null) return { linkIds: [], hasNext: false };
    const rawLinks = Array.isArray(record["links"]) ? record["links"] : [];
    const linkIds = [];
    for (const entry of rawLinks) {
      const id = readFavourLinkId(entry);
      if (id !== "") linkIds.push(id);
    }
    const next = record["has_next"] ?? record["has_more"];
    return {
      linkIds,
      hasNext: next === true || next === 1 || next === "1"
    };
  }
  function planFavourChanges(input) {
    const folderIds = new Set(input.folderIds);
    const checked = new Set(input.checkedIds.filter((id) => folderIds.has(id)));
    const unknown = input.unknownIds.filter((id) => folderIds.has(id));
    const unknownSet = new Set(unknown);
    const members = new Set(input.memberIds.filter((id) => folderIds.has(id) && !unknownSet.has(id)));
    const addIds = Array.from(checked).filter((id) => !members.has(id));
    const removeIds = Array.from(members).filter((id) => !checked.has(id));
    return {
      addIds,
      removeIds,
      // An empty folder list means the request failed or the account has no
      // folders yet; neither is proof that clearing every checkbox should
      // unfavourite the link globally.
      removeAll: folderIds.size > 0 && input.favourited && checked.size === 0 && unknown.length === 0,
      unknownIds: unknown
    };
  }
  function planHasFavourChange(plan) {
    return plan.removeAll || plan.addIds.length > 0 || plan.removeIds.length > 0;
  }
  function resolveFavourOutcome(favourited, memberIds, plan) {
    if (plan.removeAll) return false;
    const removed = new Set(plan.removeIds);
    const remaining = /* @__PURE__ */ new Set();
    for (const id of memberIds) {
      if (!removed.has(id)) remaining.add(id);
    }
    for (const id of plan.addIds) remaining.add(id);
    if (remaining.size > 0) return true;
    return favourited && plan.unknownIds.length > 0;
  }

  // scripts/heybox-up/src/core/feed.ts
  var PAGER_ID = "heybox-up-post-pager";
  var FEED_ORDER_KEY = "heybox-up.feedOrder.v1";
  var POST_TRAIL_KEY = "heybox-up.postTrail.v1";
  var POST_HISTORY_CURSOR_KEY = "heybox-up.postHistoryCursor.v1";
  var POST_HISTORY_TITLES_KEY = "heybox-up.postHistoryTitles.v1";
  var FEED_ORDER_MAX = 600;
  var FEED_QUEUE_KEY = "heybox-up.feedQueue.v1";
  var FEED_CURSOR_KEY = "heybox-up.feedCursor.v1";
  var FEED_SEEN_KEY = "heybox-up.feedSeen.v1";
  var FEED_RECENT_KEY = "heybox-up.feedRecent.v1";
  var FEED_DISCOVERY_API_PATH = "/bbs/app/feeds";
  var FEED_DISCOVERY_PAGE_SIZE = 30;
  var FEED_DISCOVERY_PASS_PAGES = 3;
  var FEED_QUEUE_MAX = 80;
  var FEED_SEEN_MAX = 600;
  var FEED_RECENT_MAX = 12;
  var FEED_TITLE_MAX = 80;
  var FEED_DISCOVERY_BODY_TIMEOUT_MS = 15e3;
  function buildFeedStateKey(baseKey, accountId) {
    const account = normalizeFeedText(accountId, 80);
    return baseKey + ":" + (account === "" ? "anonymous" : account);
  }
  function computeFeedDiscoveryOffset(feedOrder, pageSize) {
    const loaded = Array.isArray(feedOrder) ? feedOrder.length : 0;
    const size = Number.isSafeInteger(pageSize) && Number(pageSize) > 0 ? Number(pageSize) : 30;
    if (loaded <= 0) return 0;
    return Math.ceil(loaded / size) * size;
  }
  function normalizeFeedId(value) {
    if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    return /^[1-9]\d*$/.test(trimmed) ? trimmed : "";
  }
  function normalizeFeedText(value, maxLength = FEED_TITLE_MAX) {
    if (typeof value !== "string" && typeof value !== "number") return "";
    return String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
  }
  function readFeedContentType(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
    if (typeof value !== "string") return NaN;
    const trimmed = value.trim();
    return /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
  }
  function isFeedFallbackTitle(title, id) {
    return title === "" || title === "帖子 " + id;
  }
  function normalizeFeedCandidate(raw) {
    const record = asRecord(raw);
    if (record === null) return null;
    if (readFeedContentType(record["content_type"]) === 18) return null;
    const id = normalizeFeedId(record["linkid"] ?? record["link_id"] ?? record["id"]);
    if (id === "") return null;
    const user = asRecord(record["user"]);
    const authorId = normalizeFeedText(
      record["userid"] ?? record["user_id"] ?? user?.["userid"] ?? user?.["id"] ?? record["authorId"],
      80
    );
    const author = normalizeFeedText(
      record["username"] ?? user?.["username"] ?? user?.["nickname"] ?? record["author"],
      80
    );
    const topicIds = [];
    const topics = [];
    const rawTopics = record["topics"];
    for (const topic of Array.isArray(rawTopics) ? rawTopics : []) {
      if (typeof topic === "string" || typeof topic === "number") {
        const topicId2 = normalizeFeedId(topic);
        if (topicId2 !== "") {
          if (!topicIds.includes(topicId2)) topicIds.push(topicId2);
          continue;
        }
        const topicName2 = normalizeFeedText(topic, 80);
        if (topicName2 !== "" && !topics.includes(topicName2)) topics.push(topicName2);
        continue;
      }
      const topicObject = asRecord(topic);
      const topicId = normalizeFeedId(
        topicObject?.["topic_id"] ?? topicObject?.["topicId"] ?? topicObject?.["id"] ?? topic
      );
      const topicName = normalizeFeedText(
        topicObject?.["name"] ?? topicObject?.["topic_name"] ?? topicObject?.["topicName"],
        80
      );
      if (topicId !== "" && !topicIds.includes(topicId)) topicIds.push(topicId);
      if (topicName !== "" && !topics.includes(topicName)) topics.push(topicName);
    }
    const rawTopicIds = record["topicIds"];
    for (const topicId of Array.isArray(rawTopicIds) ? rawTopicIds : []) {
      const normalized = normalizeFeedId(topicId);
      if (normalized !== "" && !topicIds.includes(normalized)) topicIds.push(normalized);
    }
    const rawTopicsText = record["topicsText"];
    for (const topicName of Array.isArray(rawTopicsText) ? rawTopicsText : []) {
      const normalized = normalizeFeedText(topicName, 80);
      if (normalized !== "" && !topics.includes(normalized)) topics.push(normalized);
    }
    const title = normalizeFeedText(record["title"]) || normalizeFeedText(record["description"]) || "帖子 " + id;
    return { id, title, authorId, author, topicIds, topics };
  }
  function mergeFeedCandidateMetadata(existing, incoming) {
    if (existing === null) return incoming;
    if (incoming === null) return existing;
    const existingTitleFallback = isFeedFallbackTitle(existing.title, existing.id);
    const incomingTitleFallback = isFeedFallbackTitle(incoming.title, incoming.id);
    const title = existingTitleFallback && !incomingTitleFallback ? incoming.title : existing.title || incoming.title;
    const topicIds = [...existing.topicIds];
    const topics = [...existing.topics];
    for (const topicId of incoming.topicIds) {
      if (!topicIds.includes(topicId)) topicIds.push(topicId);
    }
    for (const topic of incoming.topics) {
      if (!topics.includes(topic)) topics.push(topic);
    }
    return {
      id: existing.id,
      title,
      authorId: existing.authorId || incoming.authorId,
      author: existing.author || incoming.author,
      topicIds,
      topics
    };
  }
  function mergeFeedOrder(existing, incoming) {
    const order = [];
    const positions = /* @__PURE__ */ new Map();
    const rows = [...Array.isArray(existing) ? existing : [], ...Array.isArray(incoming) ? incoming : []];
    for (const raw of rows) {
      const candidate = normalizeFeedLegacyCandidate(raw);
      if (candidate === null) continue;
      const position = positions.get(candidate.id);
      if (position === void 0) {
        positions.set(candidate.id, order.length);
        order.push(candidate);
      } else {
        const merged = mergeFeedCandidateMetadata(order[position] ?? null, candidate);
        if (merged !== null) order[position] = merged;
      }
    }
    return order;
  }
  function normalizeFeedLegacyCandidate(raw) {
    if (typeof raw === "string" || typeof raw === "number" && Number.isSafeInteger(raw)) {
      const id = normalizeFeedId(raw);
      return id === "" ? null : { id, title: "帖子 " + id, authorId: "", author: "", topicIds: [], topics: [] };
    }
    return normalizeFeedCandidate(raw);
  }
  function mergeRecentMetadata(existing, current, max = FEED_RECENT_MAX) {
    const merged = [];
    const positions = /* @__PURE__ */ new Map();
    const rows = [current, ...Array.isArray(existing) ? existing : []];
    for (const raw of rows) {
      const candidate = normalizeFeedCandidate(raw);
      if (candidate === null) continue;
      const position = positions.get(candidate.id);
      if (position === void 0) {
        positions.set(candidate.id, merged.length);
        merged.push(candidate);
      } else {
        const next = mergeFeedCandidateMetadata(merged[position] ?? null, candidate);
        if (next !== null) merged[position] = next;
      }
    }
    return merged.slice(0, Math.max(0, max));
  }
  function mergeFeedSeen(existing, ids, max = FEED_SEEN_MAX) {
    const seen = [];
    const known = /* @__PURE__ */ new Set();
    const rows = [...Array.isArray(existing) ? existing : [], ...Array.isArray(ids) ? ids : []];
    for (const raw of rows) {
      const id = normalizeFeedId(raw);
      if (id === "" || known.has(id)) continue;
      known.add(id);
      seen.push(id);
    }
    const limit = Math.max(0, max);
    return seen.slice(Math.max(0, seen.length - limit));
  }
  function mergeFeedQueue(queue, incoming, options = {}) {
    const currentId = normalizeFeedId(options.currentId);
    const visited = options.visited instanceof Set ? options.visited : /* @__PURE__ */ new Set();
    const seen = options.seen instanceof Set ? options.seen : /* @__PURE__ */ new Set();
    const max = typeof options.max === "number" && Number.isInteger(options.max) ? Math.max(0, options.max) : FEED_QUEUE_MAX;
    const merged = [];
    const positions = /* @__PURE__ */ new Map();
    const add = (raw) => {
      const candidate = normalizeFeedLegacyCandidate(raw);
      if (candidate === null) return;
      if (candidate.id === currentId || visited.has(candidate.id) || seen.has(candidate.id)) return;
      const existingPosition = positions.get(candidate.id);
      if (existingPosition !== void 0) {
        const next = mergeFeedCandidateMetadata(merged[existingPosition] ?? null, candidate);
        if (next !== null) merged[existingPosition] = next;
        return;
      }
      positions.set(candidate.id, merged.length);
      merged.push(candidate);
    };
    for (const raw of Array.isArray(queue) ? queue : []) add(raw);
    for (const raw of Array.isArray(incoming) ? incoming : []) add(raw);
    return merged.slice(0, max);
  }
  function scoreFeedCandidate(candidate, recent) {
    let score = 0;
    const authorId = candidate.authorId;
    const author = candidate.author;
    for (let index = 0; index < recent.length; index += 1) {
      const item = recent[index];
      if (item === void 0) continue;
      const sameAuthor = authorId !== "" && item.authorId === authorId || author !== "" && item.author === author;
      if (sameAuthor) score += index === 0 ? 100 : Math.max(10, 40 - index * 3);
      let overlap = 0;
      for (const topicId of candidate.topicIds) {
        if (item.topicIds.includes(topicId)) overlap += 1;
      }
      for (const topic of candidate.topics) {
        if (item.topics.includes(topic)) overlap += 1;
      }
      if (overlap > 0) score += overlap * Math.max(4, 18 - index * 2);
    }
    return score;
  }
  function rankFeedCandidates(candidates, recent) {
    const normalizedRecent = [];
    for (const item of Array.isArray(recent) ? recent : []) {
      const candidate = normalizeFeedCandidate(item);
      if (candidate !== null) normalizedRecent.push(candidate);
    }
    const unique = [];
    const known = /* @__PURE__ */ new Set();
    for (const raw of Array.isArray(candidates) ? candidates : []) {
      const candidate = normalizeFeedLegacyCandidate(raw);
      if (candidate === null || known.has(candidate.id)) continue;
      known.add(candidate.id);
      unique.push(candidate);
    }
    return unique.map((candidate, index) => ({
      candidate,
      index,
      score: scoreFeedCandidate(candidate, normalizedRecent)
    })).sort((left, right) => left.score - right.score || left.index - right.index).map((entry) => entry.candidate);
  }
  function selectNextFeedCandidate(options = {}) {
    const currentId = normalizeFeedId(options.currentId);
    const visited = options.visited instanceof Set ? options.visited : /* @__PURE__ */ new Set();
    const seen = options.seen instanceof Set ? options.seen : /* @__PURE__ */ new Set();
    const recent = Array.isArray(options.recent) ? options.recent : [];
    const isBlocked = (raw) => {
      const candidate = normalizeFeedLegacyCandidate(raw);
      if (candidate === null) return true;
      return candidate.id === currentId || visited.has(candidate.id) || seen.has(candidate.id);
    };
    const feedOrder = Array.isArray(options.feedOrder) ? options.feedOrder : [];
    const currentIndex = feedOrder.findIndex(
      (item) => normalizeFeedLegacyCandidate(item)?.id === currentId
    );
    const feedPositions = /* @__PURE__ */ new Map();
    for (let index = 0; index < feedOrder.length; index += 1) {
      const id = normalizeFeedLegacyCandidate(feedOrder[index])?.id;
      if (id !== void 0 && !feedPositions.has(id)) feedPositions.set(id, index);
    }
    const isBehindCurrent = (raw) => {
      if (currentIndex === -1) return false;
      const id = normalizeFeedLegacyCandidate(raw)?.id;
      if (id === void 0) return false;
      const position = feedPositions.get(id);
      return position !== void 0 && position <= currentIndex;
    };
    const queueRows = Array.isArray(options.queue) ? options.queue : [];
    const relatedRows = Array.isArray(options.related) ? options.related : [];
    const sources = [
      {
        source: "feed",
        candidates: currentIndex === -1 ? [] : feedOrder.slice(currentIndex + 1).filter((item) => !isBlocked(item))
      },
      {
        source: "queue",
        candidates: queueRows.filter((item) => !isBlocked(item) && !isBehindCurrent(item))
      },
      { source: "related", candidates: relatedRows.filter((item) => !isBlocked(item)) }
    ];
    for (const entry of sources) {
      if (entry.candidates.length === 0) continue;
      const ranked = rankFeedCandidates(entry.candidates, recent);
      const first = ranked[0];
      if (first !== void 0) return { source: entry.source, candidate: first };
    }
    return null;
  }
  function normalizeFeedDiscoveryLinks(links) {
    if (!Array.isArray(links)) return null;
    const candidates = [];
    const seen = /* @__PURE__ */ new Set();
    for (const raw of links) {
      const candidate = normalizeFeedCandidate(raw);
      if (candidate === null || seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      candidates.push(candidate);
    }
    return candidates;
  }
  function buildFeedDiscoveryUrl(offset, params) {
    const safeOffset = Number.isSafeInteger(offset) && offset > 0 ? offset : 0;
    const query = new URLSearchParams({ pull: "0", offset: String(safeOffset), dw: "660" });
    const extra = asRecord(params) ?? {};
    for (const [key, value] of Object.entries(extra)) {
      if (value === void 0 || value === null || value === "") continue;
      query.set(key, String(value));
    }
    return "https://api.xiaoheihe.cn" + FEED_DISCOVERY_API_PATH + "?" + query.toString();
  }
  function readFeedDiscoveryResponse(data) {
    const record = asRecord(data);
    if (record === null) {
      return { ok: false, links: [], message: "信息流返回内容无法解析" };
    }
    if (record["status"] === "login") {
      return { ok: false, links: [], message: "登录状态已失效，请先登录小黑盒" };
    }
    if (record["status"] !== "ok") {
      const message = normalizeFeedText(record["msg"] ?? record["message"], 60) || "信息流接口返回失败";
      return { ok: false, links: [], message };
    }
    const result = asRecord(record["result"]);
    const rawLinks = result === null ? void 0 : result["links"];
    const links = normalizeFeedDiscoveryLinks(rawLinks);
    if (links === null) {
      return { ok: false, links: [], message: "信息流返回内容无法解析" };
    }
    return {
      ok: true,
      links,
      rawEmpty: Array.isArray(rawLinks) ? rawLinks.length === 0 : false,
      message: ""
    };
  }
  function hasDiscoverableNext(status) {
    const record = asRecord(status);
    if (record === null) return false;
    const next = asRecord(record["next"]);
    if (next === null) return false;
    return next["source"] !== "related";
  }
  function readFeedBodyJson(response, signal, timeoutMs) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (callback, value) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        callback(value);
      };
      const onAbort = () => {
        settle(reject, signal?.reason || new DOMException("请求已取消", "AbortError"));
      };
      const timer = globalThis.setTimeout(() => {
        settle(reject, new DOMException("请求超时", "TimeoutError"));
      }, timeoutMs);
      if (signal?.aborted === true) {
        onAbort();
        return;
      }
      signal?.addEventListener("abort", onAbort, { once: true });
      Promise.resolve().then(() => response.json()).then((value) => settle(resolve, value), (error) => settle(reject, error));
    });
  }
  async function requestFeedDiscoveryPage(offset, signal, bodyTimeoutMs = FEED_DISCOVERY_BODY_TIMEOUT_MS) {
    const attempts = [];
    try {
      attempts.push(
        buildFeedDiscoveryUrl(offset, { ...createApiParams(FEED_DISCOVERY_API_PATH), heybox_id: getHeyboxId() })
      );
    } catch {
    }
    attempts.push(buildFeedDiscoveryUrl(offset, { heybox_id: getHeyboxId() }));
    let message = "信息流请求失败";
    const requestOptions = {
      credentials: "include",
      cache: "no-store",
      headers: { accept: "application/json" },
      ...signal === void 0 || signal === null ? {} : { signal }
    };
    for (const url of attempts) {
      try {
        const response = await fetchWithTimeout(url, requestOptions);
        if (!response.ok) {
          message = "信息流请求失败（HTTP " + response.status + "）";
          continue;
        }
        let rawData;
        try {
          rawData = await readFeedBodyJson(response, signal, bodyTimeoutMs);
        } catch (error) {
          if (isAbortError(error)) throw error;
          message = error instanceof DOMException && error.name === "TimeoutError" ? "信息流响应超时，请稍后重试" : "信息流返回内容无法解析";
          continue;
        }
        const result = readFeedDiscoveryResponse(rawData);
        if (result.ok) return result;
        message = result.message;
        const record = asRecord(rawData);
        if (record !== null && record["status"] === "login") return result;
      } catch (error) {
        if (isAbortError(error)) throw error;
        message = "网络异常，请稍后重试";
      }
    }
    return { ok: false, links: [], message };
  }
  var PAGER_CSS = `
  :host { position: fixed; inset: 0; display: block; pointer-events: none; z-index: 2147482990; font: 12px/1.5 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; color: var(--heybox-up-text, #14191e); }
  :host([hidden]) { display: none; }
  .pager { position: absolute; inset: 0; pointer-events: none; }
  .btn {
    position: absolute;
    top: 50%;
    display: grid;
    place-items: center;
    width: 42px;
    height: 64px;
    padding: 0;
    border: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .12));
    border-radius: 999px;
    background: var(--heybox-up-surface, #fff);
    box-shadow: var(--heybox-up-shadow-2, 0 10px 28px rgba(8, 12, 16, .18));
    color: var(--heybox-up-muted, #6b7280);
    font: inherit;
    cursor: pointer;
    opacity: .78;
    transform: translateY(-50%);
    pointer-events: auto;
    transition: opacity .16s ease, color .16s ease, background-color .16s ease, border-color .16s ease;
  }
  .btn--prev { left: max(10px, calc((100vw - var(--heybox-up-page-w, 1360px)) / 2 - 54px)); }
  .btn--next { right: max(10px, calc((100vw - var(--heybox-up-page-w, 1360px)) / 2 - 54px)); }
  .btn:hover:not(:disabled) { opacity: 1; border-color: var(--heybox-up-accent, #6f8db3); background: var(--heybox-up-subtle, rgba(20, 25, 30, .06)); color: var(--heybox-up-text, #14191e); }
  .btn:active:not(:disabled) { background: var(--heybox-up-raised, #d7dce3); }
  .btn:disabled { opacity: .3; cursor: default; }
  .btn:focus-visible { outline: 2px solid var(--heybox-up-accent, #6f8db3); outline-offset: 2px; }
  .btn svg { width: 20px; height: 20px; flex: none; transition: transform .16s ease; }
  .btn--prev:hover:not(:disabled) svg { transform: translateX(-1px); }
  .btn--next:hover:not(:disabled) svg { transform: translateX(1px); }
  .pager-status {
    position: absolute;
    top: calc(50% + 46px);
    right: max(10px, calc((100vw - var(--heybox-up-page-w, 1360px)) / 2 - 84px));
    max-width: 180px;
    margin: 0;
    padding: 6px 10px;
    border: 1px solid var(--heybox-up-border, rgba(20, 25, 30, .12));
    border-radius: 8px;
    background: var(--heybox-up-surface, #fff);
    box-shadow: var(--heybox-up-shadow-2, 0 10px 28px rgba(8, 12, 16, .18));
    color: var(--heybox-up-muted, #6b7280);
    font: inherit;
    text-align: center;
    pointer-events: none;
  }
  .pager-status[hidden] { display: none; }
  @media (max-width: 1199px) { .btn { width: 38px; height: 56px; opacity: .64; } .btn--prev { left: 8px; } .btn--next { right: 8px; } }
  @media (max-width: 1199px) { .pager-status { top: calc(50% + 42px); right: 8px; max-width: 136px; } }
  @media (max-width: 1080px) { :host { display: none; } }
  @media (prefers-reduced-motion: reduce) { .btn, .btn svg { transition: none; } }
`;

  // scripts/heybox-up/src/core/upload.ts
  var UPLOAD_API_BASE = "https://api.xiaoheihe.cn";
  var UPLOAD_INFO_PATH = "/bbs/app/api/qcloud/cos/upload/info/v2";
  var UPLOAD_TOKEN_PATH = "/bbs/app/api/qcloud/cos/upload/token/v2";
  var UPLOAD_CALLBACK_PATH = "/bbs/app/api/qcloud/cos/upload/callback/v2";
  var MAX_COMMENT_IMAGES = 9;
  var COS_DEFAULT_REGION = "ap-shanghai";
  var UPLOAD_TIMEOUT_MS = 12e4;
  var IMAGE_SIZE_TIMEOUT_MS = 3e3;
  var SHA1_INITIAL = [1732584193, 4023233417, 2562383102, 271733878, 3285377520];
  function pushBytes(target, source) {
    for (const byte of source) target.push(byte & 255);
  }
  function sha1Words(bytes) {
    const message = [];
    pushBytes(message, bytes);
    const bitLength = message.length * 8;
    message.push(128);
    while (message.length % 64 !== 56) message.push(0);
    const high = Math.floor(bitLength / 4294967296) >>> 0;
    const low = bitLength >>> 0;
    for (const word of [high, low]) {
      message.push(word >>> 24 & 255, word >>> 16 & 255, word >>> 8 & 255, word & 255);
    }
    let h0 = SHA1_INITIAL[0] ?? 0;
    let h1 = SHA1_INITIAL[1] ?? 0;
    let h2 = SHA1_INITIAL[2] ?? 0;
    let h3 = SHA1_INITIAL[3] ?? 0;
    let h4 = SHA1_INITIAL[4] ?? 0;
    const schedule = new Array(80).fill(0);
    for (let offset = 0; offset < message.length; offset += 64) {
      for (let index = 0; index < 16; index += 1) {
        const base = offset + index * 4;
        schedule[index] = ((message[base] ?? 0) << 24 | (message[base + 1] ?? 0) << 16 | (message[base + 2] ?? 0) << 8 | (message[base + 3] ?? 0)) >>> 0;
      }
      for (let index = 16; index < 80; index += 1) {
        const value = (schedule[index - 3] ?? 0) ^ (schedule[index - 8] ?? 0) ^ (schedule[index - 14] ?? 0) ^ (schedule[index - 16] ?? 0);
        schedule[index] = (value << 1 | value >>> 31) >>> 0;
      }
      let a = h0;
      let b = h1;
      let c = h2;
      let d = h3;
      let e = h4;
      for (let index = 0; index < 80; index += 1) {
        let mix;
        let constant;
        if (index < 20) {
          mix = b & c | ~b & d;
          constant = 1518500249;
        } else if (index < 40) {
          mix = b ^ c ^ d;
          constant = 1859775393;
        } else if (index < 60) {
          mix = b & c | b & d | c & d;
          constant = 2400959708;
        } else {
          mix = b ^ c ^ d;
          constant = 3395469782;
        }
        const sum = (a << 5 | a >>> 27) + mix + e + constant + (schedule[index] ?? 0) >>> 0;
        e = d;
        d = c;
        c = (b << 30 | b >>> 2) >>> 0;
        b = a;
        a = sum;
      }
      h0 = h0 + a >>> 0;
      h1 = h1 + b >>> 0;
      h2 = h2 + c >>> 0;
      h3 = h3 + d >>> 0;
      h4 = h4 + e >>> 0;
    }
    return [h0, h1, h2, h3, h4];
  }
  function sha1Hex(bytes) {
    let hex = "";
    for (const word of sha1Words(bytes)) {
      for (let index = 3; index >= 0; index -= 1) {
        hex += (word >>> index * 8 & 255).toString(16).padStart(2, "0");
      }
    }
    return hex;
  }
  function sha1TextHex(text) {
    return sha1Hex(toUtf8Bytes(text));
  }
  function sha1Bytes(bytes) {
    const result = [];
    for (const word of sha1Words(bytes)) {
      result.push(word >>> 24 & 255, word >>> 16 & 255, word >>> 8 & 255, word & 255);
    }
    return result;
  }
  var HMAC_BLOCK_SIZE = 64;
  function hmacSha1Hex(key, message) {
    let keyBytes = toUtf8Bytes(key);
    if (keyBytes.length > HMAC_BLOCK_SIZE) keyBytes = sha1Bytes(keyBytes);
    const inner = [];
    const outer = [];
    for (let index = 0; index < HMAC_BLOCK_SIZE; index += 1) {
      const byte = keyBytes[index] ?? 0;
      inner.push(byte ^ 54);
      outer.push(byte ^ 92);
    }
    pushBytes(inner, toUtf8Bytes(message));
    pushBytes(outer, sha1Bytes(inner));
    return sha1Hex(outer);
  }
  function camSafeEncode(value) {
    return encodeURIComponent(value).replace(/!/g, "%21").replace(/'/g, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/\*/g, "%2A");
  }
  function formatCosHost(bucket, region) {
    return bucket + ".cos." + (region === "" ? COS_DEFAULT_REGION : region) + ".myqcloud.com";
  }
  function encodeCosObjectPath(key) {
    return camSafeEncode(key).replace(/%2F/g, "/");
  }
  function createCosAuthorization(input) {
    const { credentials } = input;
    const headerList = "host";
    const paramList = "";
    const keyTime = credentials.startTime + ";" + credentials.expiredTime;
    const signHost = formatCosHost(input.bucket, input.region);
    const signKey = hmacSha1Hex(credentials.secretKey, keyTime);
    const httpString = [
      input.method.toLowerCase(),
      "/" + input.key,
      "",
      "host=" + signHost,
      ""
    ].join("\n");
    const stringToSign = ["sha1", keyTime, sha1TextHex(httpString), ""].join("\n");
    const signature = hmacSha1Hex(signKey, stringToSign);
    return [
      "q-sign-algorithm=sha1",
      "q-ak=" + credentials.secretId,
      "q-sign-time=" + keyTime,
      "q-key-time=" + keyTime,
      "q-header-list=" + headerList,
      "q-url-param-list=" + paramList,
      "q-signature=" + signature
    ].join("&");
  }
  function readErrorMessage(data, fallback) {
    const sbe = asRecord(asRecord(data["result"])?.["sbe"]);
    const userMessage = sbe === null ? "" : readStringField(sbe, "user_message");
    if (userMessage !== "") return userMessage;
    const msg = readStringField(data, "msg");
    return msg === "" ? fallback : msg;
  }
  function readCosUploadInfo(value, fallback) {
    const result = asRecord(value);
    const keys = result === null ? [] : asUnknownArray(result["keys"]).map((entry) => String(entry ?? "").trim());
    const key = keys[0] ?? "";
    const bucket = result === null ? "" : readStringField(result, "bucket");
    if (key === "" || bucket === "") throw new Error(fallback);
    const region = result === null ? "" : readStringField(result, "region");
    return { key, bucket, region: region === "" ? COS_DEFAULT_REGION : region };
  }
  function readCosCredentials(value, fallback) {
    const result = asRecord(value);
    const credentials = result === null ? null : asRecord(result["credentials"]);
    const secretId = credentials === null ? "" : readStringField(credentials, "tmpSecretId");
    const secretKey = credentials === null ? "" : readStringField(credentials, "tmpSecretKey");
    const sessionToken = credentials === null ? "" : readStringField(credentials, "sessionToken");
    const startTime = result === null ? null : readFiniteNumber(result["startTime"]);
    const expiredTime = result === null ? null : readFiniteNumber(result["expiredTime"]);
    if (secretId === "" || secretKey === "" || sessionToken === "" || startTime === null || expiredTime === null) {
      throw new Error(fallback);
    }
    return { secretId, secretKey, sessionToken, startTime, expiredTime };
  }
  function readCosPreviewUrl(value) {
    const result = asRecord(value);
    const previews = result === null ? [] : asUnknownArray(result["preview_urls"]);
    const thumbs = result === null ? [] : asUnknownArray(result["thumbs"]);
    const url = String(previews[0] ?? "").trim();
    if (url === "") throw new Error("确认 CDN 上传结果失败");
    return { url, thumb: String(thumbs[0] ?? "").trim() };
  }
  function formBody(values) {
    return new URLSearchParams(values).toString();
  }
  async function postUploadApi(path, body, accountId, query, fallback, signal) {
    if (accountId === "") throw new Error("请先登录小黑盒");
    const params = new URLSearchParams({
      ...createApiParams(path),
      ...query,
      heybox_id: accountId,
      target: "heybox_app"
    });
    const response = await fetchWithTimeout(UPLOAD_API_BASE + path + "?" + params.toString(), {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: formBody(body),
      ...signal === void 0 ? {} : { signal }
    });
    if (!response.ok) throw new Error("接口返回 HTTP " + response.status);
    const payload = await response.json();
    const data = asRecord(payload) ?? {};
    if (data["status"] === "login") throw new Error("请先登录小黑盒");
    if (data["status"] !== "ok") throw new Error(readErrorMessage(data, fallback));
    return data["result"];
  }
  function createObjectUrl(file) {
    if (typeof URL.createObjectURL !== "function") return "";
    try {
      return URL.createObjectURL(file);
    } catch (error) {
      return "";
    }
  }
  function revokeObjectUrl(url) {
    if (url === "" || typeof URL.revokeObjectURL !== "function") return;
    URL.revokeObjectURL(url);
  }
  async function readImageSize(file, signal) {
    const source = createObjectUrl(file);
    if (source === "") return { width: 0, height: 0 };
    try {
      return await new Promise((resolve, reject) => {
        const image = new Image();
        let settled = false;
        let timer = 0;
        const finish = (size, error) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
          revokeObjectUrl(source);
          if (error !== null) reject(error);
          else resolve(size ?? { width: 0, height: 0 });
        };
        const onAbort = () => finish(null, signal?.reason ?? new DOMException("请求已取消", "AbortError"));
        timer = window.setTimeout(() => finish({ width: 0, height: 0 }, null), IMAGE_SIZE_TIMEOUT_MS);
        signal?.addEventListener("abort", onAbort, { once: true });
        image.onload = () => finish({ width: image.naturalWidth, height: image.naturalHeight }, null);
        image.onerror = () => finish(null, new Error("图片无法读取"));
        image.src = source;
      });
    } finally {
      revokeObjectUrl(source);
    }
  }
  async function uploadCommentImage(file, accountId, signal) {
    const mimetype = file.type;
    if (!mimetype.startsWith("image/")) throw new Error("仅支持选择图片文件");
    const size = await readImageSize(file, signal);
    const info = readCosUploadInfo(await postUploadApi(UPLOAD_INFO_PATH, {
      file_infos: JSON.stringify([{
        name: file.name,
        mimetype,
        fsize: file.size,
        width: size.width,
        height: size.height
      }]),
      scope: "bbs",
      need_cache: "0"
    }, accountId, {}, "获取 CDN 上传信息失败", signal), "获取 CDN 上传信息失败");
    const credentials = readCosCredentials(
      // The site hands this call the object record its uploader keeps per key, so
      // the bucket, key and mimetype travel in the form body while the query
      // carries only the signed common parameters.
      await postUploadApi(UPLOAD_TOKEN_PATH, {
        bucket: info.bucket,
        keys: JSON.stringify([info.key]),
        mimetypes: JSON.stringify([mimetype]),
        is_multipart_upload: "0"
      }, accountId, {}, "获取 CDN 上传凭证失败", signal),
      "获取 CDN 上传凭证失败"
    );
    const authorization = createCosAuthorization({
      method: "PUT",
      key: info.key,
      bucket: info.bucket,
      region: info.region,
      credentials
    });
    const target = "https://" + formatCosHost(info.bucket, info.region) + "/" + encodeCosObjectPath(info.key);
    const stored = await fetchWithTimeout(target, {
      method: "PUT",
      mode: "cors",
      cache: "no-store",
      headers: {
        authorization,
        "x-cos-security-token": credentials.sessionToken,
        "content-type": mimetype
      },
      body: file,
      ...signal === void 0 ? {} : { signal }
    }, UPLOAD_TIMEOUT_MS);
    if (!stored.ok) throw new Error("图片上传失败（HTTP " + stored.status + "）");
    return readCosPreviewUrl(await postUploadApi(
      UPLOAD_CALLBACK_PATH,
      { keys: JSON.stringify([info.key]) },
      accountId,
      { is_finished: "true" },
      "确认 CDN 上传结果失败",
      signal
    ));
  }

  // scripts/heybox-up/src/ui/emoji-catalog.ts
  var CATALOG_CACHE_KEY = "heybox-up.rail-emoji-catalog.v1";
  var CATALOG_CACHE_TTL_MS = 12 * 60 * 60 * 1e3;
  var CATALOG_FAILURE_RETRY_MS = 30 * 1e3;
  var CATALOG_ASSET_TIMEOUT_MS = 15 * 1e3;
  var SCRIPT_SOURCE_PATTERN = /\/static\/heybox\/webapp\/@heybox-spa\/website\/app\/index-[^/?#]+\.js(?:[?#]|$)/i;
  var CSS_SOURCE_PATTERN = /\/static\/heybox\/webapp\/@heybox-spa\/website\/app\/index-[^/?#]+\.css(?:[?#]|$)/i;
  var catalogPromise = null;
  var lastCatalogFailureAt = 0;
  function absoluteAssetUrl(value) {
    const raw = value.trim();
    if (raw === "") return "";
    try {
      const url = new URL(raw, document.baseURI);
      return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
    } catch {
      return "";
    }
  }
  function discoverRailEmojiAssetSources(root = document) {
    let scriptUrl = "";
    let cssUrl = "";
    for (const element of Array.from(root.querySelectorAll("script[src], link[href]"))) {
      if (element instanceof HTMLScriptElement) {
        const candidate = absoluteAssetUrl(element.src);
        if (scriptUrl === "" && SCRIPT_SOURCE_PATTERN.test(candidate)) scriptUrl = candidate;
      } else if (element instanceof HTMLLinkElement) {
        const candidate = absoluteAssetUrl(element.href);
        if (cssUrl === "" && CSS_SOURCE_PATTERN.test(candidate)) cssUrl = candidate;
      }
    }
    return scriptUrl === "" || cssUrl === "" ? null : { scriptUrl, cssUrl };
  }
  function decodeJsText(value) {
    try {
      return JSON.parse('"' + value + '"');
    } catch {
      return value;
    }
  }
  function readBundleList(source, pack) {
    const marker = 'type:"' + pack + '",list:';
    let cursor = source.indexOf(marker);
    while (cursor !== -1) {
      const reference = /^([A-Za-z_$][\w$]*)/.exec(source.slice(cursor + marker.length));
      if (reference !== null) {
        const declaration = new RegExp(
          "(?:const|let|var)\\s+" + reference[1].replace(/[$]/g, "\\$") + "\\s*=\\s*\\["
        );
        const match = declaration.exec(source);
        if (match !== null) {
          const arrayStart = source.indexOf("[", match.index);
          const arrayEnd = source.indexOf("];", arrayStart);
          if (arrayStart !== -1 && arrayEnd !== -1) {
            return source.slice(arrayStart + 1, arrayEnd);
          }
        }
      }
      cursor = source.indexOf(marker, cursor + marker.length);
    }
    return null;
  }
  function readBundleEntries(list) {
    if (list === null) return [];
    const entries = [];
    const seen = /* @__PURE__ */ new Set();
    const pattern = /\{\s*name\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*id\s*:\s*"?([0-9]+)"?\s*(?:,\s*unicode\s*:\s*"((?:\\.|[^"\\])*)"\s*)?\s*\}/g;
    for (let match = pattern.exec(list); match !== null; match = pattern.exec(list)) {
      const id = String(Number(match[2]));
      if (id === "0" || seen.has(id)) continue;
      const unicode = match[3] === void 0 ? void 0 : decodeJsText(match[3]).toLowerCase();
      if (unicode !== void 0 && !/^[a-f0-9]+$/.test(unicode)) continue;
      seen.add(id);
      entries.push({
        name: decodeJsText(match[1]),
        id,
        ...unicode === void 0 ? {} : { unicode }
      });
    }
    return entries;
  }
  function readCssPack(css, pack) {
    const rule = css.match(new RegExp("\\.hb-emoji-" + pack + "\\s*\\{([^}]*)\\}", "i"));
    if (rule === null) return null;
    const body = rule[1];
    const image = body.match(/background-image\s*:\s*url\(\s*(['"]?)([^)'"]+)\1\s*\)/i);
    if (image === null) return null;
    const sprite = absoluteAssetUrl(image[2]).replace(/^http:\/\//i, "https://");
    if (sprite === "") return null;
    const size = body.match(/background-size\s*:\s*([0-9.]+)px\s+([0-9.]+)px/i);
    if (size === null) return null;
    const cell = css.match(new RegExp("--" + pack + "-length\\s*:\\s*([0-9.]+)px", "i"));
    const unit = cell === null ? 20 : Number(cell[1]);
    const columns = Number(size[1]) / unit;
    const rows = Number(size[2]) / unit;
    return Number.isInteger(columns) && columns > 0 && Number.isInteger(rows) && rows > 0 ? { sprite, columns, rows } : null;
  }
  function parseRailEmojiCatalogFromSources(script, css) {
    const writableCatalog = {};
    for (const pack of ["cube", "heygirl"]) {
      const entries = readBundleEntries(readBundleList(script, pack));
      const sprite = readCssPack(css, pack);
      if (entries.length > 0 && sprite !== null) {
        writableCatalog[pack] = { ...sprite, entries };
      }
    }
    return writableCatalog["cube"] !== void 0 || writableCatalog["heygirl"] !== void 0 ? writableCatalog : null;
  }
  function readCache2() {
    try {
      const raw = localStorage.getItem(CATALOG_CACHE_KEY);
      if (raw === null) return null;
      const parsed = JSON.parse(raw);
      if (typeof parsed.savedAt !== "number" || !Number.isFinite(parsed.savedAt) || typeof parsed.catalog !== "object" || parsed.catalog === null) return null;
      return { savedAt: parsed.savedAt, catalog: parsed.catalog };
    } catch {
      return null;
    }
  }
  function writeCache2(catalog) {
    try {
      localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({ version: 1, savedAt: Date.now(), catalog }));
    } catch {
    }
  }
  async function fetchAsset(url) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), CATALOG_ASSET_TIMEOUT_MS);
    try {
      const response = await fetch(url, { credentials: "omit", signal: controller.signal });
      if (!response.ok) throw new Error(String(response.status));
      return await response.text();
    } finally {
      window.clearTimeout(timeout);
    }
  }
  async function loadCatalog(sources) {
    const [script, css] = await Promise.all([fetchAsset(sources.scriptUrl), fetchAsset(sources.cssUrl)]);
    const catalog = parseRailEmojiCatalogFromSources(script, css);
    if (catalog === null || !applyRailEmojiCatalog(catalog)) return null;
    writeCache2(catalog);
    return catalog;
  }
  async function loadRailEmojiCatalog(sources) {
    const cache = readCache2();
    if (cache !== null && Date.now() - cache.savedAt < CATALOG_CACHE_TTL_MS && applyRailEmojiCatalog(cache.catalog)) {
      return cache.catalog;
    }
    if (catalogPromise !== null) return catalogPromise;
    if (Date.now() - lastCatalogFailureAt < CATALOG_FAILURE_RETRY_MS) return null;
    const discovered = sources ?? discoverRailEmojiAssetSources();
    if (discovered === null) {
      lastCatalogFailureAt = Date.now();
      return null;
    }
    catalogPromise = loadCatalog(discovered).catch(() => {
      lastCatalogFailureAt = Date.now();
      return null;
    }).finally(() => {
      catalogPromise = null;
    });
    return catalogPromise;
  }

  // scripts/heybox-up/src/ui/comment-marks.ts
  var READER_COMMENT_MARKS_KEY = "heybox-up.readerCommentMarks.v1";
  var READER_COMMENT_MARK_LIMIT = 4;
  var READER_COMMENT_MARK_TTL_MS = 30 * 60 * 1e3;
  function readRecordText(record, key) {
    const value = record[key];
    return typeof value === "string" ? value.trim() : "";
  }
  function readRecordNumber(record, key) {
    const value = Number(record[key]);
    return Number.isFinite(value) ? value : 0;
  }
  function readImageUrls(value) {
    if (!Array.isArray(value)) return [];
    const urls = [];
    for (const item of value) {
      if (typeof item !== "string") continue;
      const url = item.trim();
      if (url !== "") urls.push(url);
    }
    return urls;
  }
  function normalizeMark(value, now) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const record = value;
    const token = readRecordText(record, "token");
    const linkId = readRecordText(record, "linkId");
    const userId = readRecordText(record, "userId");
    const savedAt = readRecordNumber(record, "savedAt");
    if (token === "" || linkId === "" || userId === "" || savedAt <= 0) return null;
    if (now - savedAt > READER_COMMENT_MARK_TTL_MS) return null;
    const text = typeof record["text"] === "string" ? record["text"] : "";
    const imageUrls = readImageUrls(record["imageUrls"]);
    if (text.trim() === "" && imageUrls.length === 0) return null;
    const verifyPage = Math.floor(readRecordNumber(record, "verifyPage"));
    return {
      token,
      linkId,
      commentId: readRecordText(record, "commentId"),
      text,
      userId,
      rootId: readRecordText(record, "rootId"),
      parentId: readRecordText(record, "parentId"),
      createAt: Math.floor(readRecordNumber(record, "createAt")),
      verifyPage: verifyPage > 0 ? verifyPage : 1,
      imageUrls,
      savedAt
    };
  }
  function readAllMarks(now = Date.now()) {
    const stored = localStore.readJson(READER_COMMENT_MARKS_KEY, []);
    const values = Array.isArray(stored) ? stored : [];
    const marks = [];
    for (const value of values) {
      const mark = normalizeMark(value, now);
      if (mark !== null) marks.push(mark);
    }
    marks.sort((left, right) => left.savedAt - right.savedAt);
    const keep = marks.slice(-READER_COMMENT_MARK_LIMIT);
    if (keep.length !== values.length) localStore.writeJson(READER_COMMENT_MARKS_KEY, keep);
    return keep;
  }
  function createMarkToken() {
    const uuid = typeof crypto === "undefined" || typeof crypto.randomUUID !== "function" ? "" : crypto.randomUUID().replace(/-/g, "");
    const random = Math.random().toString(36).slice(2);
    return (uuid + Date.now().toString(36) + random).slice(0, 32);
  }
  function saveReaderCommentMark(input) {
    const linkId = input.linkId.trim();
    const userId = input.userId.trim();
    const text = input.text;
    const imageUrls = readImageUrls(input.imageUrls);
    if (linkId === "" || userId === "" || text.trim() === "" && imageUrls.length === 0) return null;
    const mark = {
      token: createMarkToken(),
      linkId,
      commentId: input.commentId.trim(),
      text,
      userId,
      rootId: input.rootId.trim(),
      parentId: input.parentId.trim(),
      createAt: Math.floor(input.createAt),
      verifyPage: Math.max(1, Math.floor(input.verifyPage)),
      imageUrls,
      savedAt: Date.now()
    };
    const previous = readAllMarks(mark.savedAt);
    const withoutDuplicate = previous.filter((item) => !(item.linkId === mark.linkId && (mark.commentId !== "" && item.commentId === mark.commentId || mark.commentId === "" && item.commentId === "" && item.text === mark.text)));
    const next = withoutDuplicate.concat(mark).slice(-READER_COMMENT_MARK_LIMIT);
    localStore.writeJson(READER_COMMENT_MARKS_KEY, next);
    return mark;
  }
  function readReaderCommentMarks(linkId) {
    const id = linkId.trim();
    if (id === "") return [];
    return readAllMarks().filter((mark) => mark.linkId === id);
  }
  function removeReaderCommentMark(linkId, commentId) {
    const id = linkId.trim();
    const comment = commentId.trim();
    if (id === "" || comment === "") return;
    const marks = readAllMarks();
    const remaining = marks.filter((mark) => !(mark.linkId === id && mark.commentId === comment));
    if (remaining.length === marks.length) return;
    if (remaining.length === 0) localStore.remove(READER_COMMENT_MARKS_KEY);
    else localStore.writeJson(READER_COMMENT_MARKS_KEY, remaining);
  }

  // scripts/heybox-up/src/ui/theme.ts
  var THEME_CLASS = "heybox-up-theme";
  var THEME_ATTR = "data-heybox-up-theme";
  var THEME_STORAGE_KEY = "heybox-up.theme.v1";
  var THEME_ENTRY_ID = "heybox-up-theme-entry";
  var THEME_STYLE_ID = "heybox-up-theme-style";
  var THEME_MEDIA = window.matchMedia("(prefers-color-scheme: dark)");
  var THEME_PRESETS = [
    { id: "system", label: "跟随系统", hint: "随系统深浅切换", dark: null, icon: "system", swatch: ["#f5f7f9", "#1b2430"] },
    { id: "dark", label: "夜航", hint: "冷灰深色，细边框", dark: true, icon: "dark", swatch: ["#0f1419", "#8fb0cf"] },
    { id: "oled", label: "纯黑", hint: "纯黑底，低圆角", dark: true, icon: "oled", swatch: ["#000000", "#a8c0d8"] },
    { id: "light", label: "浅色", hint: "站点原色", dark: false, icon: "light", swatch: ["#ffffff", "#eef1f4"] },
    { id: "paper", label: "纸页", hint: "暖纸底，衬线标题", dark: false, icon: "paper", swatch: ["#f4efe4", "#8a6f4e"] },
    { id: "mist", label: "雾青", hint: "冷雾底，大圆角", dark: false, icon: "mist", swatch: ["#eef3f5", "#4f7f8a"] }
  ];
  var THEME_IDS = THEME_PRESETS.map((preset) => preset.id);
  function getThemePreset(id) {
    const found = THEME_PRESETS.find((preset) => preset.id === id);
    if (found !== void 0) return found;
    const fallback = THEME_PRESETS[0];
    if (fallback === void 0) throw new Error("THEME_PRESETS is empty");
    return fallback;
  }
  function normalizeThemeMode(value) {
    return typeof value === "string" && THEME_IDS.includes(value) ? value : "system";
  }
  function resolveTheme(mode, systemDark) {
    return mode === "system" ? systemDark ? "dark" : "light" : getThemePreset(mode).id;
  }
  var currentThemeMode = "system";
  var themeEntry = null;
  var previewToggle = null;
  var navMotionToggle = null;
  var readerToggle = null;
  var readerTimelineToggle = null;
  var desktopHotRankingToggle = null;
  var desktopShortcutsToggle = null;
  var feedWidthChips = [];
  var feedWidthInput = null;
  var readerLineHeightInput = null;
  var readerHistoryLimitInput = null;
  var readerHistoryLimitHint = null;
  function readThemeMode() {
    return normalizeThemeMode(localStore.read(THEME_STORAGE_KEY));
  }
  function writeThemeMode(mode) {
    localStore.write(THEME_STORAGE_KEY, mode);
  }
  var THEME_CSS = `
  :root.heybox-up-theme {
    --heybox-up-bg: #fff;
    --heybox-up-surface: #fff;
    --heybox-up-subtle: rgba(20, 25, 30, .06);
    --heybox-up-raised: #d7dce3;
    --heybox-up-border: rgba(20, 25, 30, .1);
    --heybox-up-text: #14191e;
    --heybox-up-text-2: #3c4249;
    --heybox-up-muted: #6b7280;
    --heybox-up-on-accent: #fff;
    --heybox-up-icon: #62676e;
    --heybox-up-icon-hover: #14191e;
    --heybox-up-icon-hover-bg: rgba(20, 25, 30, .06);
    --heybox-up-accent: #6f8db3;
    --hbu-menu-bg: #fff;
    --hbu-menu-text: #14191e;
    --hbu-menu-muted: #6b7280;
    --hbu-menu-border: rgba(20, 25, 30, .12);
    --hbu-menu-hover: rgba(20, 25, 30, .06);
    color-scheme: light;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) {
    background-color: var(--heybox-up-bg) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] {
    color-scheme: dark;
    --heybox-up-bg: #0f1419;
    --heybox-up-surface: #171d24;
    --heybox-up-subtle: #1e2630;
    --heybox-up-raised: #26303b;
    --heybox-up-border: #2d3845;
    --heybox-up-text: #dce5ef;
    --heybox-up-text-2: #b4c0ce;
    --heybox-up-muted: #8593a3;
    --heybox-up-accent: #8fb0cf;
    --heybox-up-on-accent: #10161c;
    --heybox-up-icon: #b4c0ce;
    --heybox-up-icon-hover: #dce5ef;
    --heybox-up-icon-hover-bg: rgba(220, 229, 239, .09);
    --hbu-menu-bg: #171d24;
    --hbu-menu-text: #dce5ef;
    --hbu-menu-muted: #8593a3;
    --hbu-menu-border: #2d3845;
    --hbu-menu-hover: rgba(220, 229, 239, .09);
    --hbu-success: #7fc3a2;
    --hbu-danger: #e0858d;
    --hbu-warning: #d8b77a;
    --hb-general-color-bg-0: #0f1419;
    --hb-general-color-bg-1: #171d24;
    --hb-general-color-bg-2: #1e2630;
    --hb-general-color-bg-3: #1e2630;
    --hb-general-color-bg-4: #171d24;
    --hb-general-color-bg-5: rgba(23, 29, 36, .9);
    --hb-general-color-bg-6: rgba(220, 229, 239, .1);
    --hb-general-color-text-1: #dce5ef;
    --hb-general-color-text-2: #b4c0ce;
    --hb-general-color-text-3: #8593a3;
    --hb-general-color-text-4: #6d7a88;
    --hb-general-color-text-5: #9dc0e2;
    --hb-general-color-text-6: #10161c;
    --hb-general-color-stroke-0: #2d3845;
    --hb-general-color-stroke-1: #2d3845;
    --hb-general-color-stroke-2: #26303b;
    --hb-general-color-stroke-3: #1e2630;
    --hb-general-color-primary: #8fb0cf;
    --hb-general-color-success: #7fc3a2;
    --hb-general-color-danger: #e0858d;
    --hb-primary: #dce5ef;
    --hb-primary--value: 220, 229, 239;
    --hb-primary-dynamic: #dce5ef;
    --hb-primary-dynamic--value: 220, 229, 239;
    --hb-neutral-100: #1e2630;
    --hb-neutral-100--value: 30, 38, 48;
    --hb-neutral-200: #1e2630;
    --hb-neutral-200--value: 30, 38, 48;
    --hb-neutral-300: #171d24;
    --hb-neutral-300--value: 23, 29, 36;
    --hb-neutral-400: #26303b;
    --hb-neutral-400--value: 38, 48, 59;
    --hb-neutral-500: #2d3845;
    --hb-neutral-500--value: 45, 56, 69;
    --hb-neutral-600: #6d7a88;
    --hb-neutral-600--value: 109, 122, 136;
    --hb-neutral-700: #8593a3;
    --hb-neutral-700--value: 133, 147, 163;
    --hb-neutral-800: #b4c0ce;
    --hb-neutral-800--value: 180, 192, 206;
    --el-color-primary: #8fb0cf;
    --el-color-primary-light-9: #1b2735;
    --el-color-success: #7fc3a2;
    --el-color-danger: #e0858d;
    --el-color-warning: #d8b77a;
    --el-bg-color: #171d24;
    --el-bg-color-page: #0f1419;
    --el-bg-color-overlay: #171d24;
    --el-fill-color-blank: #171d24;
    --el-fill-color: #1e2630;
    --el-fill-color-light: #1e2630;
    --el-fill-color-lighter: #1e2630;
    --el-fill-color-extra-light: #1e2630;
    --el-text-color-primary: #dce5ef;
    --el-text-color-regular: #b4c0ce;
    --el-text-color-secondary: #8593a3;
    --el-text-color-placeholder: #8593a3;
    --el-text-color-disabled: #6d7a88;
    --el-border-color: #2d3845;
    --el-border-color-light: #2d3845;
    --el-border-color-lighter: #2d3845;
    --el-border-color-extra-light: #26303b;
    --el-border-color-dark: #3b4653;
    --el-border-color-darker: #46515f;
    --el-disabled-bg-color: #1e2630;
    --el-disabled-text-color: #8593a3;
    --el-mask-color: rgba(15, 20, 25, .8);
    --el-overlay-color-lighter: rgba(0, 0, 0, .6);
    --el-table-bg-color: #171d24;
    --el-table-tr-bg-color: #171d24;
    --el-table-header-bg-color: #1e2630;
    --el-table-row-hover-bg-color: #1e2630;
    --el-table-border-color: #2d3845;
    --el-table-text-color: #dce5ef;
    --el-table-header-text-color: #b4c0ce;
    --el-box-shadow: 0 12px 32px rgba(0, 0, 0, .3);
    --el-box-shadow-light: 0 0 12px rgba(0, 0, 0, .28);
    --el-box-shadow-lighter: 0 0 6px rgba(0, 0, 0, .24);
    scrollbar-color: #3b4653 #0f1419;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] body {
    background-color: var(--heybox-up-bg) !important;
    color: var(--heybox-up-text);
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#app, .hb-website__app, .hb-page__app, .hb-layout__main, .hb-layout-main__container, .hb-layout__content) {
    background-color: var(--heybox-up-bg) !important;
    color: var(--heybox-up-text);
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.nav, .nav-user .nav-user-popover, .el-popper, .el-dropdown-menu, .el-dialog, .el-drawer, .el-message-box, .el-card, .el-table, .el-pagination, .el-select-dropdown, .el-autocomplete-suggestion, .hb-cpt__selector .selector__pull-list, .page-header__container-bg, .page-header__back-btn, .tab-list--wrapper, .link-tab-list, .hb-cpt-page-header, .hb-cpt__pagination, .hb-cpt__slide-tab, .user-profile-wrapper, .bbs-info, .message-center__main, .message-center__aside-title, .message-center__search-box, .message-home__tabs, .message-content-preview, .message-content-preview__post, .search-result__tab-header, .search-result__tool, .hb-search-result, .hot-search, .price-box, .result-mini-app__item, .result-filter-tag__tag, .hb-bbs-link__header, .hb-bbs-link__content, .link-comment, .link-reply, .comment__comment-header, .topic-link__header, .post__container, .image-text__container, .header-image__item, .bbs-link__related-recommend, .hb-cpt__empty, .qr-section, .app-link-item) {
    background-color: var(--heybox-up-surface) !important;
    border-color: var(--heybox-up-border) !important;
    color: var(--heybox-up-text);
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#page-bbs-community, #page-bbs-link, #page-bbs-list, .page-bbs-community, .page-bbs-link) {
    background-color: var(--heybox-up-bg) !important;
    color: var(--heybox-up-text);
  }
  /* Search page: page and list paint fixed white bands above and below the results. */
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-bbs-list::before,
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-bbs-list::after {
    background-color: var(--heybox-up-bg) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-bbs-list .list::before,
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-bbs-list .list::after {
    background-color: var(--heybox-up-bg) !important;
  }
  /* Result rows are separated by inline 4px light strips. */
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-bbs-list .search-result__space {
    background-color: transparent !important;
  }
  /* The User tab paints a fixed light notice bar above the result list. */
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-bbs-list .search-result__middle.user {
    background-color: var(--heybox-up-surface) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-bbs-list .search-result__middle.user::after {
    color: var(--heybox-up-muted) !important;
  }
  /* Horizontal result scroller fades to hard-coded white on the right edge. */
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-bbs-list .hb-cpt__pagination--right {
    background-image: linear-gradient(to left, var(--heybox-up-surface), var(--heybox-up-surface), transparent) !important;
  }
  /* 我的文章（创作者中心）：站点整页写死 #fff，深色下逐块补齐，避免只剩外框变黑。 */
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#page-creator-content-management, #page-creator-content-management-detail) {
    background-color: var(--heybox-up-bg) !important;
    color: var(--heybox-up-text);
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#page-creator-content-management .creator-content-management__header, #page-creator-content-management .creator-content-management__tabs, #page-creator-content-management-detail .content-detail__content-wrapper, #page-creator-content-management-detail .content-detail__section, .com-chart, #creator-preview__frame, .creator-preview-normal, .creator-draft) {
    background-color: var(--heybox-up-surface) !important;
    border-color: var(--heybox-up-border) !important;
    color: var(--heybox-up-text);
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#page-creator-content-management .creator-content-management__tabs::after, #page-creator-content-management .content-management-home__content + .content-management-home__content::after) {
    background-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#page-creator-content-management .content-management-home__content:hover, #page-creator-content-management .creator-content-management__tabs .sorter:hover, .creator-content-item__operation-item:hover) {
    background-color: var(--heybox-up-subtle) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .creator__data-indicator {
    background-color: var(--heybox-up-subtle) !important;
    box-shadow: 0 0 0 .5px var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .creator__data-indicator.active {
    background-color: var(--heybox-up-surface) !important;
    box-shadow: inset 0 0 0 1px var(--heybox-up-accent) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#page-creator-content-management .creator-content-management__header, #page-creator-content-management-detail .content-detail__title, #page-creator-content-management-detail .content-detail__section-header, .data-indicator__data, .com-chart .nav, .com-chart .selection .text, .aside-miniprogram__header, .aside-miniprogram__item--name) {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.data-indicator__title, #page-creator-content-management .creator-content-management__tabs .sorter, #page-topic-link .topic-link__sorter) {
    color: var(--heybox-up-text-2) !important;
  }
  /* 频道页：整页浅灰底 + 三块白卡，连同上下固定色条一起换底。 */
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-topic-link {
    background-color: var(--heybox-up-bg) !important;
    color: var(--heybox-up-text);
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-topic-link::before,
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-topic-link::after {
    background-color: var(--heybox-up-bg) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#page-topic-link .topic-link__panel, #page-topic-link .topic-link__header, #page-topic-link .topic-link__filter-row, #page-topic-link .topic-link__game-detail, .topic-aside__topic-indicator, .topic__aside-miniprogram) {
    background-color: var(--heybox-up-surface) !important;
    border-color: var(--heybox-up-border) !important;
    color: var(--heybox-up-text);
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-topic-link .topic-link__main::after {
    background-color: var(--heybox-up-surface) !important;
    border-color: var(--heybox-up-border) !important;
    color: var(--heybox-up-text);
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .topic__aside-miniprogram .aside-miniprogram__item,
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-topic-link .topic-link__splitline::after {
    background-color: var(--heybox-up-subtle) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .topic__aside-miniprogram .aside-miniprogram__item:hover {
    background-color: var(--heybox-up-surface) !important;
  }
  /* 兜底扫描挂上的类：只改底色、描边与文字色，不动布局。 */
  :root.heybox-up-theme[data-heybox-up-dark="true"] .heybox-up-dark-flat {
    background-color: var(--heybox-up-surface) !important;
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .heybox-up-dark-flat-subtle {
    background-color: var(--heybox-up-subtle) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .heybox-up-dark-edge {
    border-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .heybox-up-dark-ink {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.hb-bbs-home, .bbs-home__content-list, .bbs-home__content-item, .bbs-home__topic-item, .bbs-community-hot-topic, .bbs-community__search-module, .right-side-default, .hb-cpt__scroll-list, #page-bbs-link .list, .link-tags__tag-item, .hb-cpt__popover-menu, .hb-cpt__report, .route-to-app__qrcode, .scroll-list__top-btn, .hb-cpt__loading.circle, .search-history, .search__pull-list) {
    background-color: var(--heybox-up-surface) !important;
    border-color: var(--heybox-up-border) !important;
    color: var(--heybox-up-text);
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.hb-cpt__image--default, .hb-cpt__image--placeholder, .link-reply__input-wrapper) {
    background-color: var(--heybox-up-subtle) !important;
    border-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .bbs-new-style-bottom__rich-stack {
    background-color: var(--heybox-up-subtle) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .bbs-new-style-bottom__rich-node {
    color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-user-favour > .content > .list {
    background-color: var(--heybox-up-surface) !important;
    border-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-user-favour .user-favour__list,
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-user-favour .user-favour__list > * {
    background-color: transparent !important;
    border-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.user-favour__item, .favour-item, .favour-card, .list-content, .bbs-list-content, .bbs-link, .link-item, .hot-topic-item, .creator-content-item, .comment-message-item, .message-list-item.active) {
    background-color: var(--heybox-up-subtle) !important;
    border-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.bbs-content__title, .bbs-content__content, .post__title, .post__content, .image-text__title, .image-text__content, .comment-item__content, .children-item__comment-content, .list-content__username, .comment-item__username, .hot-topic-item__name, .nav-item, .view-header__nav-item, .user-profile-wrapper .name, .bbs-info-item .value, .back-btn__text, .page-header__username, .link-user__username, .section-title__content, .content-tag-text, .slide-tab__tab-label, .slide-tab__tab-cnt, .info-box__username, .hb-editor, .message-list-item__title, .comment-message-item__username, .comment-message-item__text, .message-content-preview__reply-text, .message-content-preview__text, .creator-content-item__title, .editor__more-info-title, .creator-editor__form-label, .frame-top-title, .bbs-link-section-title-text, .user-favour__title, .game-name, .result-mini-app__item--name, .result-tool__content--name) {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.list-content__time, .bbs-list-content__time, .post__time, .image-text__time, .comment-item__time, .creator-content-item__create_at, .creator-content-item__type, .creator-content-item__data-item, .message-list-item__time, .user-favour__empty, .scroll-list__no-more-desc, .page-header__meta, .list-content__meta) {
    color: var(--heybox-up-muted) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.bbs-home__topic-name, .hot-topic__header, .related-recommend__container--header, .link-item__title, .qr-section .title, .qr-section span, .app-link-item span, .search-pull__found-item, .search-pull__history-item, .hb-cpt__popover-menu-item.plain) {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.link-item__desc, .bbs-new-style-bottom__comment, .search-pull__section-title, .search-history__item) {
    color: var(--heybox-up-muted) !important;
  }
  /* Search suggestions: site fills history chips light and hot rank labels dark; retheme both. */
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.search-pull__history-item, .search-history__item) {
    background-color: var(--heybox-up-subtle) !important;
    border-color: var(--heybox-up-border) !important;
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.search-pull__history-item:hover, .search-history__item:hover) {
    background-color: var(--heybox-up-surface) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .search-history__item::before {
    background-color: var(--heybox-up-subtle) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .search-pull__section-title {
    color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .search__hot-rank .hot-rank__tab-item {
    color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .search__hot-rank .hot-rank__tab-item.active {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .search__hot-rank .hot-rank__list-item .hot-rank__list-item-game-name {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .search__hot-rank .hot-rank__list-item:hover {
    background-color: var(--heybox-up-subtle) !important;
  }
  /* Search results: the site paints matched terms in a fixed #004b96, unreadable on the themed surface. */
  :root.heybox-up-theme[data-heybox-up-dark="true"] #page-bbs-list em {
    color: var(--heybox-up-accent) !important;
  }
  /* Search autocomplete opens in a body-level Element Plus popper; theme the popper
     itself and every inner wrapper so suggestions never fall back to black on white. */
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.search-input-popper, .el-autocomplete__popper) {
    border: 1px solid var(--heybox-up-border) !important;
    background: var(--heybox-up-surface) !important;
    color: var(--heybox-up-text) !important;
    box-shadow: 0 18px 48px rgba(0, 0, 0, .48) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.search-input-popper, .el-autocomplete__popper) :is(.el-autocomplete-suggestion, .el-autocomplete-suggestion__wrap, .el-autocomplete-suggestion__list) {
    background: transparent !important;
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.search-input-popper, .el-autocomplete__popper) .el-autocomplete-suggestion__list li {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.search-input-popper, .el-autocomplete__popper) .el-autocomplete-suggestion__list li:hover,
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.search-input-popper, .el-autocomplete__popper) .el-autocomplete-suggestion__list li.highlighted,
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.search-input-popper, .el-autocomplete__popper) .el-autocomplete-suggestion__list li[aria-selected="true"] {
    background: var(--heybox-up-subtle) !important;
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.search-input-popper, .el-autocomplete__popper) .el-autocomplete-suggestion__list .item-text {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.search-input-popper, .el-autocomplete__popper) .el-autocomplete-suggestion__list :is(em, b, strong) {
    color: var(--heybox-up-accent) !important;
    font-style: normal;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.search-input-popper, .el-autocomplete__popper) :is(.el-popper__arrow, .popper__arrow)::before {
    border-color: var(--heybox-up-border) !important;
    background: var(--heybox-up-surface) !important;
  }
  /* The 2026 search box renders its own suggestion list instead of the Element Plus popper.
     Names are hard-coded to #14191e while the panel inherits the themed surface, so every
     row, wrapper, and matched fragment needs an explicit readable color. */
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.search__pull-list .search__suggestion, .search__pull-list .suggestion__item) {
    background-color: transparent !important;
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .search__pull-list :is(.suggestion__item-content, .suggestion__item-name) {
    background-color: transparent !important;
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .search__pull-list .suggestion__item-desc {
    color: var(--heybox-up-muted) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .search__pull-list .suggestion__item-icon {
    color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .search__pull-list :is(.suggestion__item:hover, .suggestion__item:focus-visible, .suggestion__item.active, .suggestion__item.is-active, .suggestion__item.selected, .suggestion__item.highlighted) {
    background-color: var(--heybox-up-subtle) !important;
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .search__pull-list .suggestion__item:focus-visible {
    outline: 2px solid var(--heybox-up-accent) !important;
    outline-offset: -2px;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .search__pull-list .suggestion__item[aria-selected="true"] {
    background-color: var(--heybox-up-subtle) !important;
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .search__pull-list .suggestion__item :is(em, b, strong, mark) {
    background-color: transparent !important;
    color: var(--heybox-up-accent) !important;
    font-style: normal;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.post__content, .image-text__content) :where(p, span, b, strong, em, i, li, h1, h2, h3, h4, h5, h6, blockquote, .text) {
    color: inherit !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.post__content, .image-text__content) a {
    color: var(--heybox-up-accent) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(input:not([type="checkbox"]):not([type="radio"]), textarea, select) {
    background-color: var(--heybox-up-subtle) !important;
    border-color: var(--heybox-up-border) !important;
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(input, textarea)::placeholder {
    color: var(--heybox-up-muted) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] option {
    background-color: var(--heybox-up-surface);
    color: var(--heybox-up-text);
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.el-input__wrapper, .el-textarea__inner, .el-select__wrapper, [contenteditable="true"]) {
    background-color: var(--heybox-up-subtle) !important;
    color: var(--heybox-up-text) !important;
    box-shadow: 0 0 0 1px var(--heybox-up-border) inset !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.tab-item.active, .slide-tab__tab-item.active, .slide-tab__tab-item.active .slide-tab__tab-label, .nav-link.nav-link--active, .nav-link--active) {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .result-filter-tag__tag.active {
    background-color: var(--heybox-up-accent) !important;
    border-color: var(--heybox-up-accent) !important;
    color: var(--heybox-up-on-accent) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.page-header__back-btn, .hb-cpt__pagination, .hb-cpt__slide-tab) {
    border-color: var(--heybox-up-border) !important;
    color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.el-table th.el-table__cell, .el-table tr) {
    background-color: transparent !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.el-table, .el-table__inner-wrapper, .el-table__body-wrapper, .el-table__header-wrapper) {
    background-color: var(--heybox-up-surface) !important;
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.tab-active-block, .slide-tab-tab__bar) {
    background-color: var(--heybox-up-accent) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.hb-cpt__button.primary, .hb-cpt__button--primary, .editor-publish__btn.main-btn) {
    background-color: var(--heybox-up-accent) !important;
    background-image: none !important;
    border-color: var(--heybox-up-accent) !important;
    color: var(--heybox-up-on-accent) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.nav-user-popover-item:hover, .message-list-item:hover, .link-comment__comment-item:hover, .creator-content-item__operation-item:hover) {
    background-color: var(--heybox-up-subtle) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.bbs-info-item, .message-center__aside, .message-center__content, .comment-message-item, .link-comment__comment-item, .creator-content-item, .editor-tabs, .cpt-qa__row, .cpt-qa__tabs, .hb-cpt__editor-title, .editor-image-text__main-content, .editor-image-wrapper__box, .creator-editor__form-item) {
    border-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] [data-mask$="-bg"] {
    background-color: var(--heybox-up-bg) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] [data-mask$="-edge"] {
    background-color: var(--heybox-up-surface) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .nav {
    --nav-background: rgba(15, 20, 25, .94);
    --nav-shadow: 0 6px 16px rgba(0, 0, 0, .28);
    --nav-link-color: #8593a3;
    --nav-link-hover-color: #dce5ef;
    --nav-link-active-color: #dce5ef;
    --nav-link-hover-bg: transparent;
    --nav-link-active-bg: transparent;
    --publish-color: #10161c;
    --publish-bg: linear-gradient(46deg, #9db9d3, #8fb0cf);
    --publish-hover-shadow: 0 8px 18px rgba(0, 0, 0, .3);
    --nav-user-bg: rgba(220, 229, 239, .08);
    --nav-user-bg-hover: rgba(220, 229, 239, .14);
    --nav-user-divider-color: rgba(220, 229, 239, .12);
    --nav-user-name-color: #dce5ef;
    --nav-user-arrow-color: rgba(220, 229, 239, .72);
    --nav-logo-color: #dce5ef;
    --nav-language-color: #8593a3;
    --nav-language-border-color: rgba(133, 147, 163, .5);
    background: var(--nav-background) !important;
    box-shadow: var(--nav-shadow) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .nav :is(.nav-link, .nav-icon) {
    color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .nav button.nav-link.nav-link--active {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .nav-content-left-logo :is(path, polygon, rect) {
    fill: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.nav-user-popover-name, .nav-user-popover-item-text) {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.nav-user-popover-id, .nav-user-popover-item-icon) {
    color: var(--heybox-up-muted) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .nav-user-popover-divider {
    background-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(button, a, input, textarea, select, summary, [tabindex], [role="button"], [contenteditable="true"]):focus-visible {
    outline: 2px solid var(--heybox-up-accent) !important;
    outline-offset: 2px !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.comment-item__tag-line, .comment-item__writer-like, .children-item__reply-to, .children-item__create-time, .children-item__ip, .info-box__create-time, .info-box__ip, .like-box, .load-all__text, .link-reply__placeholder, .link-reply__operation-desc) {
    color: var(--heybox-up-muted) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.comment-children__load-all, .link-reply__editor, .link-reply__operation-item, .hb-toast, .el-message) {
    background-color: var(--heybox-up-subtle) !important;
    border-color: var(--heybox-up-border) !important;
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .hb-loading-spinner {
    background-color: var(--heybox-up-surface) !important;
    border-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.el-message, .el-message__content) {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .el-image-viewer__wrapper {
    background-color: rgba(0, 0, 0, .88) !important;
  }
  /* 登录表单保持官方浅色，避免第三方登录控件在深色下失去可读性。 */
  :root.heybox-up-theme[data-heybox-up-dark="true"] .website-login {
    color-scheme: light;
    background-color: #fff !important;
    color: #14191e !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .website-login :is(input, textarea, select) {
    background-color: transparent !important;
    border-color: #e8eaed !important;
    color: #14191e !important;
  }
  /* 文章编辑器：站点把底色写在多层容器里，深色、纸页与雾青预设需要整块覆盖。 */
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor > .content > .list,
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.editor-tabs, .editor-article__main-content, .editor-image-text__main-content, .editor-video__main-content, .hb-cpt__editor-title, .editor__menu, .editor__more-info, .creator-editor__form-wrapper, .cpt-editor__publish, .cpt-qa),
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame {
    background-color: var(--heybox-up-surface) !important;
    border-color: var(--heybox-up-border) !important;
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor-article__main-content {
    box-shadow: 0 0 0 1px var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor__menu {
    box-shadow: inset 0 0 0 1px var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor-article__main-content :is(.hb-editor, .ProseMirror) {
    background-color: var(--heybox-up-subtle) !important;
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme:is([data-heybox-up-theme="paper"], [data-heybox-up-theme="mist"]) #page-creator-editor .editor-article__main-content :is(.hb-editor, .ProseMirror) {
    background-color: var(--heybox-up-surface) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.hb-editor, .ProseMirror) :where(p, span, b, strong, em, i, u, s, li, h1, h2, h3, h4, h5, h6, blockquote, td, th) {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.hb-editor, .ProseMirror) :is(a, .prose-link) {
    color: var(--heybox-up-accent) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor-title__cnt-indicator {
    color: var(--heybox-up-muted) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor-publish__btn.main-btn {
    background-color: var(--heybox-up-accent) !important;
    background-image: none !important;
    border-color: var(--heybox-up-accent) !important;
    color: var(--heybox-up-on-accent) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) :is(.hb-cpt__button.primary, .hb-cpt__button--primary) {
    background-color: var(--heybox-up-accent) !important;
    background-image: none !important;
    border-color: var(--heybox-up-accent) !important;
    color: var(--heybox-up-on-accent) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.editor__topic-item, .editor__hashtag-item, .editor__add-btn, .selector__box, .editor-publish__btn.sub-btn, .cpt-qa__tab, .cpt-qa__key) {
    background-color: var(--heybox-up-subtle) !important;
    border-color: var(--heybox-up-border) !important;
    color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.selector__pull-list, .editor-menu-more__list) {
    background-color: var(--heybox-up-surface) !important;
    border-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .selector__pull-list-item {
    color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.selector__pull-list-item:hover, .selector__pull-list-item.active) {
    background-color: var(--heybox-up-raised) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .selector__box {
    box-shadow: 0 0 0 1px var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .switch__button {
    background-color: var(--heybox-up-raised) !important;
    border-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .switch__button.active {
    background-color: var(--heybox-up-accent) !important;
    border-color: var(--heybox-up-accent) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .switch__button-indicator {
    background-color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .switch__button.active .switch__button-indicator {
    background-color: var(--heybox-up-on-accent) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.editor-form__more-info-title, .creator-editor__form-header, .selector__active, .cpt-qa__head-title, .cpt-qa__row-name) {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.topic-item__text, .hashtag-item__text, .editor-form__more-info-desc, .editor__more-info-desc, .cpt-qa__head-sub) {
    color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.switch__true-label, .switch__false-label) {
    color: var(--heybox-up-muted) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.switch__true-label.active, .switch__false-label.active) {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .cpt-form-split-line {
    background-color: var(--heybox-up-border) !important;
  }
  /* Editor dividers and toolbar icons: site paints light 4px / 1px strips and dims icon fills. */
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .creator-editor__form-wrapper::before {
    background-color: var(--heybox-up-bg) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .cpt-editor__publish::after,
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .hb-cpt__editor-title::after,
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor-menu__item-splitline {
    background-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor__menu .hb-icon {
    color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor__menu .editor-menu__item--content-inactive .hb-icon svg {
    opacity: .8 !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor__menu .editor-menu__item.forbid {
    opacity: .8 !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor__menu .editor-menu-more__list-item {
    color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor__menu .editor-menu-more__list-item .hb-icon {
    color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor__menu .editor-menu-more__list-item svg {
    opacity: .9 !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor .editor__menu .editor-menu-more__list-item:hover {
    background-color: var(--heybox-up-subtle) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) [data-mask$="-bg"] {
    background-color: var(--heybox-up-bg) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) [data-mask$="-edge"] {
    background-color: var(--heybox-up-surface) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.hb-cpt__image--default, .hb-cpt__image--placeholder) {
    background-color: var(--heybox-up-subtle) !important;
    border-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.editor-image-wrapper__box, .video-uploader__unload) {
    background-color: var(--heybox-up-surface) !important;
    background-image: none !important;
    border-color: var(--heybox-up-border) !important;
    box-shadow: 0 0 0 .5px var(--heybox-up-border) !important;
    color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #page-creator-editor :is(.editor-image-text__main-content, .editor-video__main-content) {
    box-shadow: 0 0 0 1px var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame :is(.creator-preview-normal, .bbs-link) {
    background-color: var(--heybox-up-surface) !important;
    border-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame :is(.bbs-link-section-author, .bbs-link-section-tags) {
    background-color: transparent !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame .bbs-link-section-author-name {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame .bbs-link-section-author-time {
    color: var(--heybox-up-muted) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame .bbs-link-section-author-follow {
    background-color: var(--heybox-up-accent) !important;
    background-image: none !important;
    border-color: var(--heybox-up-accent) !important;
    color: var(--heybox-up-on-accent) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame .bbs-link-section-author-follow :is(i, span, svg, use) {
    color: var(--heybox-up-on-accent) !important;
    fill: var(--heybox-up-on-accent) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame :is(.bbs-link-article-content, .hb-article) {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame :is(.bbs-link-article-content, .hb-article) :where(p, span, b, strong, em, i, li, h1, h2, h3, h4, h5, h6, blockquote, .text, .main-title) {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame :is(.bbs-link-article-content, .hb-article) :is(a, .prose-link) {
    color: var(--heybox-up-accent) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame .img-desc {
    color: var(--heybox-up-muted) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame .bbs-link-section-tags-item {
    background-color: var(--heybox-up-subtle) !important;
    border-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame .bbs-link-section-tags-item-text {
    color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) #creator-preview__frame :is(.bbs-link-section-bottom-info, .bbs-link-section-bottom-info-source) {
    color: var(--heybox-up-muted) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) .cpt-right-side :is(.footer-info, .footer-row, .report-text, .copyright-text) {
    color: var(--heybox-up-muted) !important;
  }
  :root.heybox-up-theme:not([data-heybox-up-theme="light"]) .cpt-right-side .footer-link {
    color: var(--heybox-up-text-2) !important;
  }
  /* 纯黑预设：黑底、低圆角、无阴影，仍复用全部深色覆盖规则。 */
  :root.heybox-up-theme[data-heybox-up-theme="oled"] {
    --heybox-up-bg: #000;
    --heybox-up-surface: #08090b;
    --heybox-up-subtle: #101216;
    --heybox-up-raised: #161a20;
    --heybox-up-border: #1d2026;
    --heybox-up-text: #e6ebf2;
    --heybox-up-text-2: #b8c2cf;
    --heybox-up-muted: #9aa4b2;
    --heybox-up-accent: #a8c0d8;
    --heybox-up-on-accent: #05070a;
    --hbu-menu-bg: #08090b;
    --hbu-menu-text: #e6ebf2;
    --hbu-menu-muted: #9aa4b2;
    --hbu-menu-border: #1d2026;
    --hbu-menu-hover: rgba(230, 235, 242, .07);
    --hb-general-color-bg-0: #000;
    --hb-general-color-bg-1: #08090b;
    --hb-general-color-bg-2: #101216;
    --hb-general-color-bg-3: #101216;
    --hb-general-color-bg-4: #08090b;
    --hb-general-color-text-1: #e6ebf2;
    --hb-general-color-text-2: #b8c2cf;
    --hb-general-color-text-3: #9aa4b2;
    --hb-general-color-stroke-0: #1d2026;
    --hb-general-color-stroke-1: #1d2026;
    --hb-general-color-stroke-2: #161a20;
    --hb-general-color-primary: #a8c0d8;
    --el-color-primary: #a8c0d8;
    --el-color-primary-light-9: #141a22;
    --el-bg-color: #08090b;
    --el-bg-color-page: #000;
    --el-bg-color-overlay: #08090b;
    --el-fill-color-blank: #08090b;
    --el-fill-color: #101216;
    --el-fill-color-light: #101216;
    --el-fill-color-lighter: #101216;
    --el-fill-color-extra-light: #101216;
    --el-border-color: #1d2026;
    --el-border-color-light: #1d2026;
    --el-border-color-lighter: #1d2026;
    --el-table-bg-color: #08090b;
    --el-table-tr-bg-color: #08090b;
    --el-table-header-bg-color: #101216;
    --el-table-row-hover-bg-color: #101216;
    --el-table-border-color: #1d2026;
    --el-mask-color: rgba(0, 0, 0, .86);
    --el-box-shadow: none;
    --el-box-shadow-light: none;
    scrollbar-color: #2a2e35 #000;
  }
  :root.heybox-up-theme[data-heybox-up-theme="oled"] .nav {
    --nav-background: #000;
    --nav-shadow: none;
    --publish-color: #05070a;
    --publish-bg: #a8c0d8;
    --nav-user-bg: rgba(230, 235, 242, .07);
    --nav-user-bg-hover: rgba(230, 235, 242, .13);
  }
  :root.heybox-up-theme[data-heybox-up-theme="oled"] :is(.bbs-home__content-item, .bbs-home__topic-item, .list-content, .user-favour__item, .post__container, .image-text__container, .link-comment, .hot-search, .right-side-default, .hb-bbs-link__header, .hb-bbs-link__content, .search-result__tool, .result-mini-app__item, .price-box, .el-card, .el-dialog, .el-drawer, .el-message-box, .el-popper, .el-dropdown-menu) {
    border-radius: 4px !important;
    box-shadow: none !important;
  }
  /* 纸页预设：暖纸底、衬线标题、细边扁平卡片。 */
  :root.heybox-up-theme[data-heybox-up-theme="paper"] {
    --heybox-up-bg: #f4efe4;
    --heybox-up-surface: #fffdf7;
    --heybox-up-subtle: #efe8d9;
    --heybox-up-raised: #e7ddc9;
    --heybox-up-border: #ddd2bd;
    --heybox-up-text: #2f2a22;
    --heybox-up-text-2: #4a4237;
    --heybox-up-muted: #7c7160;
    --heybox-up-accent: #8a6f4e;
    --heybox-up-icon: #7c7160;
    --heybox-up-icon-hover: #2f2a22;
    --heybox-up-icon-hover-bg: rgba(47, 42, 34, .07);
    --hbu-menu-bg: #fffdf7;
    --hbu-menu-text: #2f2a22;
    --hbu-menu-muted: #7c7160;
    --hbu-menu-border: #ddd2bd;
    --hbu-menu-hover: rgba(47, 42, 34, .06);
    --hb-general-color-bg-0: #f4efe4;
    --hb-general-color-bg-1: #fffdf7;
    --hb-general-color-bg-2: #efe8d9;
    --hb-general-color-bg-4: #fffdf7;
    --hb-general-color-text-1: #2f2a22;
    --hb-general-color-text-2: #4a4237;
    --hb-general-color-text-3: #7c7160;
    --hb-general-color-stroke-0: #ddd2bd;
    --hb-general-color-stroke-1: #ddd2bd;
    --hb-general-color-primary: #8a6f4e;
    --el-color-primary: #8a6f4e;
    --el-bg-color: #fffdf7;
    --el-bg-color-page: #f4efe4;
    --el-bg-color-overlay: #fffdf7;
    --el-fill-color-blank: #fffdf7;
    --el-fill-color-light: #efe8d9;
    --el-text-color-primary: #2f2a22;
    --el-text-color-regular: #4a4237;
    --el-text-color-secondary: #7c7160;
    --el-border-color: #ddd2bd;
    --el-border-color-light: #ddd2bd;
    scrollbar-color: #cfc2aa #f4efe4;
  }
  /* 雾青预设：冷雾底、大圆角、柔和浮层。 */
  :root.heybox-up-theme[data-heybox-up-theme="mist"] {
    --heybox-up-bg: #eef3f5;
    --heybox-up-surface: #fbfdfe;
    --heybox-up-subtle: #e4ecef;
    --heybox-up-raised: #dbe7eb;
    --heybox-up-border: #d3e0e5;
    --heybox-up-text: #1f2c33;
    --heybox-up-text-2: #3e5560;
    --heybox-up-muted: #6f8792;
    --heybox-up-accent: #4f7f8a;
    --heybox-up-icon: #6f8792;
    --heybox-up-icon-hover: #1f2c33;
    --heybox-up-icon-hover-bg: rgba(31, 44, 51, .07);
    --hbu-menu-bg: #fbfdfe;
    --hbu-menu-text: #1f2c33;
    --hbu-menu-muted: #6f8792;
    --hbu-menu-border: #d3e0e5;
    --hbu-menu-hover: rgba(31, 44, 51, .06);
    --hb-general-color-bg-0: #eef3f5;
    --hb-general-color-bg-1: #fbfdfe;
    --hb-general-color-bg-2: #e4ecef;
    --hb-general-color-bg-4: #fbfdfe;
    --hb-general-color-text-1: #1f2c33;
    --hb-general-color-text-2: #3e5560;
    --hb-general-color-text-3: #6f8792;
    --hb-general-color-stroke-0: #d3e0e5;
    --hb-general-color-stroke-1: #d3e0e5;
    --hb-general-color-primary: #4f7f8a;
    --el-color-primary: #4f7f8a;
    --el-bg-color: #fbfdfe;
    --el-bg-color-page: #eef3f5;
    --el-bg-color-overlay: #fbfdfe;
    --el-fill-color-blank: #fbfdfe;
    --el-fill-color-light: #e4ecef;
    --el-text-color-primary: #1f2c33;
    --el-text-color-regular: #3e5560;
    --el-text-color-secondary: #6f8792;
    --el-border-color: #d3e0e5;
    --el-border-color-light: #d3e0e5;
    scrollbar-color: #b9ccd3 #eef3f5;
  }
  :root.heybox-up-theme:is([data-heybox-up-theme="paper"], [data-heybox-up-theme="mist"]) body {
    background-color: var(--heybox-up-bg) !important;
    color: var(--heybox-up-text);
  }
  :root.heybox-up-theme:is([data-heybox-up-theme="paper"], [data-heybox-up-theme="mist"]) :is(#app, main, .hb-website__app, .hb-page__app, .hb-layout__main, .hb-layout-main__container, .hb-layout__content) {
    background-color: var(--heybox-up-bg) !important;
    color: var(--heybox-up-text);
  }
  :root.heybox-up-theme:is([data-heybox-up-theme="paper"], [data-heybox-up-theme="mist"]) :is(.nav, .nav-user .nav-user-popover, .el-popper, .el-dropdown-menu, .el-dialog, .el-drawer, .el-message-box, .hb-cpt__selector .selector__pull-list, .page-header__container-bg, .tab-list--wrapper, .link-tab-list, .hb-cpt-page-header, .user-profile-wrapper, .bbs-info, .message-center__main, .message-center__aside-title, .message-center__search-box, .message-home__tabs, .message-content-preview, .message-content-preview__post, .search-result__tab-header, .hb-search-result, .hb-bbs-link__header, .hb-bbs-link__content, .link-comment, .link-reply, .comment__comment-header, .topic-link__header, .post__container, .image-text__container, .bbs-link__related-recommend, .hb-cpt__empty, .qr-section, .app-link-item, .bbs-home__content-item, .bbs-home__topic-item, .list-content, .user-favour__item, #page-bbs-link .list, .hot-search, .right-side-default, .search-result__tool, .result-mini-app__item, .price-box, .result-filter-tag__tag) {
    background-color: var(--heybox-up-surface) !important;
    border-color: var(--heybox-up-border) !important;
    color: var(--heybox-up-text);
  }
  :root.heybox-up-theme:is([data-heybox-up-theme="paper"], [data-heybox-up-theme="mist"]) .nav {
    --nav-link-color: var(--heybox-up-muted);
    --nav-link-hover-color: var(--heybox-up-text);
    --nav-link-active-color: var(--heybox-up-text);
    --nav-link-hover-bg: transparent;
    --nav-link-active-bg: transparent;
    --publish-color: #fff;
    --publish-bg: var(--heybox-up-accent);
    --nav-user-bg: var(--heybox-up-subtle);
    --nav-user-bg-hover: var(--heybox-up-raised);
    --nav-user-name-color: var(--heybox-up-text);
    --nav-user-divider-color: var(--heybox-up-border);
    --nav-logo-color: var(--heybox-up-text);
  }
  :root.heybox-up-theme[data-heybox-up-theme="paper"] .nav {
    --nav-background: rgba(244, 239, 228, .95);
    --nav-shadow: 0 1px 0 #ddd2bd;
  }
  :root.heybox-up-theme[data-heybox-up-theme="mist"] .nav {
    --nav-background: rgba(251, 253, 254, .84);
    --nav-shadow: 0 8px 24px rgba(47, 74, 84, .08);
    backdrop-filter: blur(14px) saturate(1.1);
  }
  :root.heybox-up-theme[data-heybox-up-theme="paper"] :is(.bbs-home__content-item, .bbs-home__topic-item, .list-content, .user-favour__item, .post__container, .image-text__container, .link-comment, .hot-search, .right-side-default, .hb-bbs-link__header, .hb-bbs-link__content, .search-result__tool, .result-mini-app__item, .price-box, .el-card, .el-dialog, .el-drawer, .el-message-box, .el-popper, .el-dropdown-menu) {
    border-radius: 3px !important;
    box-shadow: none !important;
  }
  :root.heybox-up-theme[data-heybox-up-theme="mist"] :is(.bbs-home__content-item, .bbs-home__topic-item, .list-content, .user-favour__item, .post__container, .image-text__container, .link-comment, .hot-search, .right-side-default, .hb-bbs-link__header, .hb-bbs-link__content, .search-result__tool, .result-mini-app__item, .price-box, .el-card, .el-dialog, .el-drawer, .el-message-box, .el-popper, .el-dropdown-menu) {
    border-radius: 16px !important;
    box-shadow: 0 6px 20px rgba(47, 74, 84, .08) !important;
  }
  :root.heybox-up-theme[data-heybox-up-theme="paper"] :is(.post__title, .image-text__title, .bbs-content__title, .bbs-link-section-title-text, .section-title__content, .user-favour__title, .related-recommend__container--header) {
    font-family: Georgia, "Songti SC", "Noto Serif CJK SC", serif;
    letter-spacing: .01em;
  }
  :root.heybox-up-theme[data-heybox-up-theme="paper"] :is(.post__content, .image-text__content) a {
    color: var(--heybox-up-accent);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  /* 版式：定宽阅读栏 + 卡片化信息流。站点通栏列表每行超过 90 字，长读易疲劳。 */
  @media (max-width: 799px) {
    /* 站点给 #app 写死 800px 下限；实际手机宽度会被裁切，这里恢复单列收缩。 */
    #app { min-width: 0 !important; width: 100% !important; }
  }
  :root {
    --heybox-up-page-w: 1360px;
    /* 中间栏占视口百分比，可在齿轮设置菜单里调；上限避免超宽屏上正文行过长。 */
    --heybox-up-feed-pct: 56;
    /* Body line height multiplier, adjustable in the settings menu or the reader rail panel. */
    --heybox-up-reading-line-height: 1.7;
    --heybox-up-feed-w: min(calc(var(--heybox-up-feed-pct) * 1vw), 1180px);
    --heybox-up-radius-card: 14px;
    --heybox-up-gap: 12px;
    --heybox-up-card-pad: 20px;
    --heybox-up-shadow-1: 0 1px 2px rgba(16, 24, 40, .05);
    --heybox-up-shadow-2: 0 14px 34px rgba(16, 24, 40, .14);
  }
  :root.heybox-up-theme[data-heybox-up-theme="paper"] {
    --heybox-up-radius-card: 4px;
    --heybox-up-shadow-1: none;
    --heybox-up-shadow-2: 0 10px 24px rgba(47, 42, 34, .12);
  }
  :root.heybox-up-theme[data-heybox-up-theme="mist"] {
    --heybox-up-radius-card: 18px;
    --heybox-up-shadow-1: 0 4px 14px rgba(47, 74, 84, .07);
    --heybox-up-shadow-2: 0 16px 36px rgba(47, 74, 84, .14);
  }
  :root.heybox-up-theme[data-heybox-up-theme="oled"] {
    --heybox-up-radius-card: 8px;
    --heybox-up-shadow-1: none;
    --heybox-up-shadow-2: 0 14px 34px rgba(0, 0, 0, .72);
  }
  @media (min-width: 1200px) {
    #app > main {
      max-width: var(--heybox-up-page-w) !important;
      padding-left: 24px !important;
      padding-right: 24px !important;
    }
    #app > main > section,
    #app > main > .layout-normal {
      max-width: 100% !important;
    }
  }
  /* 社区首页：移除热门社区/二维码右栏，信息流量成一条阅读栏，宽度够放两张图也不拉长正文行。 */
  #page-bbs-community .cpt-right-side.right {
    display: none !important;
  }
  #page-bbs-community .content {
    width: auto !important;
    max-width: var(--heybox-up-page-w) !important;
    margin: 0 auto !important;
    justify-content: center !important;
  }
  #page-bbs-community main.list {
    width: auto !important;
    max-width: var(--heybox-up-feed-w) !important;
    flex: 0 1 var(--heybox-up-feed-w) !important;
    min-width: 0;
  }
  /* 搜索栏跟随阅读栏宽度居中，避免页头比信息流每侧多出 176px。 */
  #page-bbs-community .bbs-community__search-module {
    width: min(var(--heybox-up-feed-w), 100%) !important;
    max-width: 100% !important;
    margin-left: auto !important;
    margin-right: auto !important;
  }
  /* 搜索建议加载期间的空壳会留下 26px 浮层，截获首张帖子卡片的点击；无内容时直接收起。 */
  #page-bbs-community .search__pull-list:has(> .search__suggestion:empty) {
    display: none !important;
  }
  @media (min-width: 1200px) {
    body.heybox-up-rail-open #page-bbs-community .content {
      justify-content: flex-start !important;
    }
    body.heybox-up-rail-open #page-bbs-community main.list {
      margin-left: 0 !important;
      margin-right: auto !important;
    }
  }
  #page-bbs-community .hb-bbs-home,
  #page-bbs-community .bbs-home__content-list {
    width: auto !important;
    max-width: none !important;
    flex: 1 1 auto !important;
    min-width: 0;
  }
  /* 卡片化：帖子之间留间隙与细边，滚动时条目边界一眼可辨。 */
  #page-bbs-community .bbs-home__content-list {
    display: flex !important;
    flex-direction: column;
    gap: var(--heybox-up-gap);
    padding: 4px 0 28px !important;
  }
  #page-bbs-community .bbs-home__content-item {
    margin: 0 !important;
    padding: 0 !important;
    border: 1px solid var(--heybox-up-border) !important;
    border-radius: var(--heybox-up-radius-card) !important;
    background-color: var(--heybox-up-surface) !important;
    box-shadow: var(--heybox-up-shadow-1);
    overflow: hidden;
    transition: border-color .16s ease, box-shadow .16s ease;
  }
  #page-bbs-community .bbs-home__content-item:hover {
    border-color: var(--heybox-up-raised) !important;
    box-shadow: var(--heybox-up-shadow-2);
  }
  #page-bbs-community .bbs-home__content-item > a.hb-cpt__bbs-list-content {
    display: block;
    padding: var(--heybox-up-card-pad) !important;
    background: transparent !important;
  }
  #page-bbs-community :is(.hb-bbs-home__feed-splitline, .hb-bbs-home__splitline)::before,
  #page-bbs-community :is(.hb-bbs-home__feed-splitline, .hb-bbs-home__splitline)::after {
    background: transparent !important;
  }
  #page-bbs-community .bbs-home__topic-list-wrapper {
    margin: 0 0 var(--heybox-up-gap) !important;
    padding: 10px 14px !important;
    border: 1px solid var(--heybox-up-border) !important;
    border-radius: var(--heybox-up-radius-card) !important;
    background-color: var(--heybox-up-surface) !important;
    overflow: hidden;
  }
  /* 卡片内排版：标题 17/1.5，正文 15/1.72，元信息压到 13px，层级靠字号与颜色拉开。 */
  #page-bbs-community .bbs-content__title {
    margin: 10px 0 6px !important;
    font-size: 17px !important;
    line-height: 1.5 !important;
    font-weight: 600;
    letter-spacing: .005em;
  }
  #page-bbs-community .bbs-content__content {
    font-size: 15px !important;
    line-height: 1.72 !important;
    color: var(--heybox-up-text-2) !important;
  }
  #page-bbs-community .bbs-list-content__header {
    gap: 8px;
  }
  #page-bbs-community .list-content__username {
    font-size: 13px !important;
    font-weight: 500;
  }
  #page-bbs-community .bbs-content__imgs-wrapper {
    margin-top: 10px !important;
  }
  #page-bbs-community .bbs-content__image {
    border-radius: 10px !important;
  }
  /* 作者行、更多按钮与图片计数是卡片里最小的可点区域，统一抬到 24px 与 11px。 */
  :root.heybox-up-theme :is(#page-bbs-community .header__user, #page-topic-link .header__user) {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
  }
  :root.heybox-up-theme .list-cotent__operation-btn {
    display: inline-grid;
    place-items: center;
    width: 24px !important;
    height: 24px !important;
  }
  :root.heybox-up-theme #page-topic-link .topic-link__sorter {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
  }
  :root.heybox-up-theme .bbs-content__image-cnt { font-size: 11px !important; }
  #page-bbs-community .bbs-new-style-bottom {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--heybox-up-border);
  }
  /* 窄屏：卡片化会吃掉内边距，收回固定宽度与内边距，信息流改用整幅。 */
  @media (max-width: 1100px) {
    :root {
      --heybox-up-feed-w: min(960px, 100%);
      --heybox-up-card-pad: 16px;
    }
  }
  /* 评论预览侧栏：展开时由桌面栅格为预览保留真实宽度，侧栏本身在 Shadow DOM 内自绘。 */
  :root { --heybox-up-rail-w: 320px; }
  @media (max-width: 1399px) {
    :root { --heybox-up-rail-w: 288px; }
  }
  #page-bbs-community :is(.bbs-new-style-bottom__comment, .content-list__comment) {
    cursor: pointer;
  }
  /* 评论排序只改 order，不动 DOM，避免打断站点自身的列表更新。 */
  #page-bbs-link .link-comment__list {
    display: flex !important;
    flex-direction: column;
  }
  /* 帖子详情：正文纸张 + 原生评论侧栏，两块各自成卡片，中间留 24px 空隙。 */
  @media (min-width: 1200px) {
    #page-bbs-link .content {
      width: auto !important;
      max-width: var(--heybox-up-page-w) !important;
      margin: 0 auto !important;
      gap: 24px;
      align-items: flex-start;
      justify-content: center;
    }
    #page-bbs-link .list {
      max-width: none !important;
      flex: 1 1 auto !important;
      min-width: 0;
    }
    #page-bbs-link .cpt-right-side.right {
      display: none !important;
    }
    #page-bbs-link .hb-cpt__scroll-list.hb-bbs-link__container {
      width: auto !important;
      max-width: none !important;
    }
    #page-bbs-link .hb-bbs-link__content {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) 424px;
      gap: 24px;
      align-items: start;
      width: auto !important;
      max-width: none !important;
    }
    #page-bbs-link .hb-bbs-image-text {
      grid-column: 1;
      min-width: 0;
      padding: 28px 32px !important;
      border: 1px solid var(--heybox-up-border) !important;
      border-radius: var(--heybox-up-radius-card) !important;
      background-color: var(--heybox-up-surface) !important;
      box-shadow: var(--heybox-up-shadow-1);
      /* 正文与评论各自滚动：正文列吸顶并限高，滚到底不带走整页。 */
      position: sticky;
      top: 88px;
      max-height: calc(100vh - 112px);
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
      scrollbar-gutter: stable;
    }
    #page-bbs-link .link-comment {
      grid-column: 2;
      position: sticky;
      top: 88px;
      height: calc(100vh - 112px);
      max-height: calc(100vh - 112px);
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
      width: 100% !important;
      margin: 0 !important;
      border: 1px solid var(--heybox-up-border) !important;
      border-radius: var(--heybox-up-radius-card) !important;
      background-color: var(--heybox-up-surface) !important;
      box-shadow: var(--heybox-up-shadow-1);
    }
    #page-bbs-link .link-comment .comment__comment-header {
      top: 0 !important;
      background-color: var(--heybox-up-surface) !important;
    }
  }
  /* Body: line height comes from the user preference; paragraphs stay under 46em. */
  #page-bbs-link :is(.post__title, .image-text__title, .section-title__content) {
    font-size: 25px !important;
    line-height: 1.42 !important;
    font-weight: 700;
    letter-spacing: -.01em;
  }
  #page-bbs-link :is(.post__content, .image-text__content) {
    font-size: 16px !important;
    line-height: var(--heybox-up-reading-line-height) !important;
  }
  /* The site hard-codes a 25px line height on nested paragraphs; cover body text
     only so cards and blockquotes keep their own styles. */
  #page-bbs-link :is(.post__content, .image-text__content) :is(p, li, ul, ol, .line, .order-line, .text):not([class*="com-"], [class*="com-"] *):not(blockquote, blockquote *) {
    line-height: var(--heybox-up-reading-line-height) !important;
  }
  #page-bbs-link :is(.post__content, .image-text__content) :is(p, blockquote, h1, h2, h3, h4) {
    max-width: 46em;
  }
  #page-bbs-link :is(.post__content, .image-text__content) p {
    margin: 0 0 .72em !important;
  }
  #page-bbs-link :is(.post__content, .image-text__content) h2 {
    margin: 1.4em 0 .6em !important;
    font-size: 20px !important;
    line-height: 1.5 !important;
  }
  #page-bbs-link :is(.post__content, .image-text__content) h3 {
    margin: 1.2em 0 .5em !important;
    font-size: 17px !important;
    line-height: 1.55 !important;
  }
  #page-bbs-link :is(.post__content, .image-text__content) blockquote {
    margin: 1em 0 !important;
    padding: 2px 0 2px 14px !important;
    border-left: 3px solid var(--heybox-up-accent) !important;
    color: var(--heybox-up-muted) !important;
    line-height: 1.8 !important;
  }
  #page-bbs-link :is(.post__content, .image-text__content) blockquote :is(p, .text) {
    line-height: 1.8 !important;
  }
  /* The native article styles hard-code dark text on nested paragraphs and ordered-list lines.
     Cards and blockquotes keep their own colors, matching the line-height exclusion above. */
  #page-bbs-link :is(.post__content, .image-text__content) :is(p, li, ol, ul, .line, .order-line, .text):not([class*="com-"], [class*="com-"] *):not(blockquote, blockquote *) {
    color: var(--heybox-up-text) !important;
  }
  #page-bbs-link :is(.post__content, .image-text__content) blockquote,
  #page-bbs-link :is(.post__content, .image-text__content) blockquote :is(p, .text) {
    color: var(--heybox-up-muted) !important;
  }
  #page-bbs-link :is(.post__content, .image-text__content) :is(img, .hb-cpt__image) {
    border-radius: 10px !important;
  }
  /* 评论区：14px 正文，楼层用细线分隔，嵌套回复保留站点结构只改圆角与间距。 */
  #page-bbs-link .link-comment__comment-item {
    padding: 14px 16px !important;
    border-top: 1px solid var(--heybox-up-border) !important;
  }
  #page-bbs-link :is(.comment-item__content, .children-item__comment-content) {
    font-size: 14px !important;
    line-height: 1.7 !important;
  }
  #page-bbs-link .link-comment__comment-children {
    margin-top: 8px !important;
    border-radius: 10px !important;
  }
  @media (max-width: 1199px) {
    #page-bbs-link .content {
      flex-direction: column;
    }
    #page-bbs-link .list {
      width: 100% !important;
      max-width: none !important;
    }
    #page-bbs-link .cpt-right-side.right {
      display: none !important;
    }
    #page-bbs-link .hb-cpt__scroll-list.hb-bbs-link__container,
    #page-bbs-link .hb-bbs-link__content {
      width: auto !important;
      max-width: none !important;
    }
    #page-bbs-link .hb-bbs-link__content {
      display: flex;
      flex-direction: column;
    }
    #page-bbs-link .link-comment {
      width: 100% !important;
      margin: 16px 0 0 !important;
    }
  }
  /* 站点未覆盖的容器补齐主题底色：嵌套回复块、个人主页列表。 */
  :root.heybox-up-theme .link-comment__comment-children {
    background-color: var(--heybox-up-subtle) !important;
    border-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme #page-user-profile > .content > .list {
    background-color: var(--heybox-up-surface) !important;
    border-color: var(--heybox-up-border) !important;
    color: var(--heybox-up-text);
  }
  /* Profile submissions use a near-white 4px divider and dark text colors from the original skin. */
  :root.heybox-up-theme #page-user-profile .user-profile-article-item::after {
    background-color: transparent !important;
    background-image: none !important;
  }
  :root.heybox-up-theme #page-user-profile .article-title .title {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme #page-user-profile .bottom-line :is(.time, .comment, .comment span) {
    color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme #page-user-profile .tab-item {
    color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme #page-user-profile .tab-item.active {
    color: var(--heybox-up-text) !important;
  }
  /* The profile right rail only carries the app QR code, promotions and ICP text. */
  #page-user-profile .cpt-right-side.right {
    display: none !important;
  }
  #page-user-profile .content > .list {
    flex: 1 1 auto !important;
    width: auto !important;
    min-width: 0 !important;
    max-width: none !important;
  }
  /* Theme the author hover card without changing its 315x146 box or z-index. */
  :root.heybox-up-theme #page-user-profile .name-box .detail-info {
    background-color: var(--heybox-up-surface) !important;
    color: var(--heybox-up-text) !important;
    box-shadow: 0 0 0 1px var(--heybox-up-border), 0 18px 46px rgba(0, 0, 0, .32) !important;
  }
  :root.heybox-up-theme #page-user-profile .name-box .detail-info::after {
    background-color: var(--heybox-up-surface) !important;
  }
  :root.heybox-up-theme #page-user-profile .name-box .detail-info .main-info {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme #page-user-profile .name-box .detail-info .sub-info {
    color: var(--heybox-up-text-2) !important;
  }
  /* 站点用伪元素画页面底色与帖子分隔条，颜色不随变量走，需单独覆盖。 */
  :root.heybox-up-theme[data-heybox-up-dark="true"] {
    background-color: var(--heybox-up-bg) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#app > main > section, #page-bbs-community .hb-bbs-home__feed-splitline, #page-bbs-community .hb-bbs-home__splitline)::before,
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#app > main > section, #page-bbs-community .hb-bbs-home__feed-splitline, #page-bbs-community .hb-bbs-home__splitline)::after {
    background-color: var(--heybox-up-bg) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#page-bbs-community main.list, #page-bbs-link main.list)::before,
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(#page-bbs-community main.list, #page-bbs-link main.list)::after {
    background-color: var(--heybox-up-surface) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .hb-cpt__moment-list-content::after {
    background-color: var(--heybox-up-subtle) !important;
  }
  /* 站点用伪元素画卡片底部 4px 色带，取色固定为近白，任何主题下都会形成白条。 */
  :root.heybox-up-theme .hb-bbs-image-text::after,
  :root.heybox-up-theme .hb-bbs-post::after,
  :root.heybox-up-theme .hb-bbs__video::after {
    background-color: transparent !important;
    background-image: none !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .link-reply::before,
  :root.heybox-up-theme[data-heybox-up-dark="true"] .link-comment__comment-item + .link-comment__comment-item:not(:hover)::before,
  :root.heybox-up-theme[data-heybox-up-dark="true"] .link-comment__comment-children .comment-children__load-all::before,
  :root.heybox-up-theme[data-heybox-up-dark="true"] .hb-cpt__slide-tab.underline::after,
  :root.heybox-up-theme[data-heybox-up-dark="true"] .hb-cpt__slide-tab.line::after,
  :root.heybox-up-theme[data-heybox-up-dark="true"] .related-recommend__link-item--content::before,
  :root.heybox-up-theme[data-heybox-up-dark="true"] .related-recommend__link-item--topic::before {
    background-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .link-comment__comment-children .comment-children-item:hover::after {
    background-color: var(--heybox-up-subtle) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .link-reply .link-reply__main-box .link-reply__input-wrapper::after {
    border-color: var(--heybox-up-border) !important;
  }
  /* 正文内嵌的 com-* 卡片族（游戏/专辑/百科/比赛/模组/角标/等）底色写死为浅色，
     深色下会整块发白。统一按容器、描边、主次文字、药丸底、占位块五组覆盖。 */
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.com-game-card, .com-album-card, .com-award-table-card, .com-chatroom-card, .com-league-card, .com-match-card, .com-mod-card, .com-sku-card, .com-wiki-card) {
    background-color: var(--heybox-up-subtle) !important;
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.com-game-card, .com-album-card, .com-award-table-card, .com-chatroom-card, .com-league-card, .com-match-card, .com-mod-card, .com-sku-card, .com-wiki-card).is-editor-mode,
  :root.heybox-up-theme[data-heybox-up-dark="true"] .com-card-placeholder {
    background-color: var(--heybox-up-surface) !important;
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .com-card-placeholder svg path {
    fill: var(--heybox-up-muted) !important;
  }
  /* 卡片描边用 1px 边框乘 0.5 缩放绘制，颜色写死，深色下成亮边。 */
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.com-game-card, .com-album-card, .com-award-table-card, .com-chatroom-card, .com-league-card, .com-match-card, .com-mod-card, .com-sku-card, .com-wiki-card)::after {
    border-color: var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.com-award-table-card .award-table-row, .com-award-table-card .award-table-row.title, .com-award-table-card .award-table-row:last-of-type) {
    border-color: var(--heybox-up-border) !important;
  }
  /* 主文字：写死 #14191e。 */
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(
    .com-game-card .game-info .line-1,
    .com-game-card .game-info .line-2 .price-box .price-content-box,
    .com-game-card .game-info .line-2 .price-box .price-content-box .coupon-tip,
    .com-game-card .game-info .line-2 .follow-box .follow-num,
    .com-album-card .album-info .line-1 .album-name,
    .com-award-table-card .award-table-row,
    .com-chatroom-card .info-section .chatroom-title,
    .com-league-card .league-info-box .line-1 .league-title,
    .com-match-card .team-1 .team-name,
    .com-match-card .team-2 .team-name,
    .com-match-card .match-info-wrapper .line-2 .aftermatch .team-score.weight,
    .com-match-card .match-info-wrapper .line-2 .watched,
    .com-match-card .match-info-wrapper .line-2 .commingsoon,
    .com-mod-card .mod-card-info .mod-card-title,
    .com-sku-card .sku-info-box .line-1,
    .com-sku-card .sku-info-box .line-2 .price-box .price-content-box,
    .com-wiki-card .info-section .info-line .words-num
  ) {
    color: var(--heybox-up-text) !important;
  }
  /* 次要文字：写死 #8c9196 与 #64696e。 */
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(
    .com-game-card .game-info .line-2 .price-box .price-content-box .release-desc,
    .com-game-card .game-info .line-2 .price-box .price-content-box .release-time,
    .com-game-card .game-info .line-2 .price-box .price-content-box .original-price,
    .com-game-card .game-info .line-2 .follow-box .had-tag,
    .com-game-card .game-info .line-2 .follow-box i,
    .com-album-card .delete-desc,
    .com-album-card .album-info .line-2 .game-num,
    .com-award-table-card .award-table-row.unfold,
    .com-chatroom-card .info-section .line-2 .default-desc,
    .com-chatroom-card .info-section .line-2 .online-count,
    .com-chatroom-card .info-section .line-2 .room-count,
    .com-league-card .league-info-box .line-2 .league-date,
    .com-match-card .match-info-wrapper .line-1,
    .com-match-card .match-info-wrapper .line-2,
    .com-match-card .match-info-wrapper .line-3,
    .com-match-card .match-info-wrapper .line-2 .aftermatch .colon,
    .com-mod-card .mod-card-info .mod-card-summary,
    .com-sku-card .sku-info-box .line-2 .price-box .price-content-box .original-price,
    .com-wiki-card .info-section .info-line .words-num-desc,
    .com-wiki-card .info-section .info-line .enter-wiki,
    .com-wiki-card .info-section .info-line i
  ) {
    color: var(--heybox-up-muted) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .com-game-card .game-info .line-2 .price-box .price-content-box .original-price::after {
    background-color: var(--heybox-up-muted) !important;
  }
  /* 药丸/标签底：写死 #f3f4f5，配深色文字，深色下变成亮块加暗字。 */
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(
    .com-game-card .game-info .line-2 .price-box,
    .com-game-card .game-info .line-2 .follow-box,
    .com-album-card .delete-album,
    .com-album-card .album-info .line-2 .favour-btn.favoured,
    .com-award-table-card .award-table-row.title,
    .com-award-table-card .award-table-row.unfold,
    .com-league-card .league-info-box .line-2 .league-date,
    .com-league-card .league-info-box .line-2 .price-pool,
    .com-match-card .match-info-wrapper .line-2 .aftermatch .team-score,
    .com-match-card .match-info-wrapper .line-2 .watched,
    .com-match-card .match-info-wrapper .line-2 .commingsoon,
    .com-match-card .match-info-wrapper .line-2 .aftermatch .colon,
    .com-sku-card .sku-info-box .line-2 .price-box
  ) {
    background-color: var(--heybox-up-raised) !important;
  }
  /* 深色实心按钮：写死 #14191e 或同色渐变，深色下与卡片底几乎融为一体。 */
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(
    .com-game-card .game-info .line-2 .follow-btn,
    .com-game-card .game-info .line-2 .wishlist-box,
    .com-game-card .game-info .line-2 .follow-box i,
    .com-game-card .game-info .line-2 .follow-box .follow-unit,
    .com-game-card .game-info .line-2 .wishlist-box i,
    .com-game-card .game-info .line-2 .wishlist-box .add-wishlist-text,
    .com-album-card .album-info .line-1 .album-label,
    .com-album-card .album-info .line-2 .favour-btn,
    .com-match-card .match-info-wrapper .line-2 .unwatched,
    .com-mod-card .mod-card-download,
    .com-mod-card .mod-card-download .mod-card-download-text,
    .com-sku-card .sku-info-box .line-2 .follow-btn
  ) {
    background-color: var(--heybox-up-raised) !important;
    background-image: none !important;
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .com-album-card .album-info .line-2 .favour-btn.favoured {
    color: var(--heybox-up-text-2) !important;
  }
  /* 图片占位底与未加载图片的灰块。 */
  :root.heybox-up-theme[data-heybox-up-dark="true"] :is(.com-album-card .game-img-album, .com-mod-card .mod-card-image-box) {
    background-color: var(--heybox-up-raised) !important;
  }
  /* 评论区与列表底部的写死浅色小件。 */
  :root.heybox-up-theme[data-heybox-up-dark="true"] .comment-item__writer-like span {
    background-color: var(--heybox-up-raised) !important;
    color: var(--heybox-up-text-2) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .children-item__comment-creator {
    color: var(--heybox-up-accent) !important;
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] .scroll-list__no-more-desc::before {
    background-color: var(--heybox-up-border) !important;
  }
  /* 文章管理页：列表末尾的“暂无更多内容”会打断卡片流，直接隐藏。 */
  #page-creator-content-management .scroll-list__no-more-desc {
    display: none !important;
  }
  /* Topic, editor, favourites, and article pages have only promotional right rails. */
  :is(#page-user-favour, #page-creator-content-management, #page-creator-content-management-detail, #page-topic-link, #page-creator-editor)
    .cpt-right-side.right {
    display: none !important;
  }
  #page-topic-link .topic__aside-miniprogram {
    display: none !important;
  }
  :is(#page-user-favour, #page-creator-content-management, #page-creator-content-management-detail, #page-topic-link, #page-creator-editor)
    .content > .list {
    flex: 1 1 auto !important;
    width: auto !important;
    max-width: none !important;
  }
  #page-topic-link .topic-link__main,
  #page-creator-editor > .content > .list {
    flex: 1 1 auto !important;
    min-width: 0 !important;
    width: auto !important;
    max-width: none !important;
  }
  /* Preserve the native engagement glyphs beside article statistics. */
  #page-creator-content-management .creator-content-item__data-item .hb-icon,
  #page-creator-content-management .creator-content-item__data-item svg {
    display: inline-flex !important;
    visibility: visible !important;
    flex: none !important;
  }
  /* Keep route content on the selected theme while the SPA swaps page nodes. */
  :root.heybox-up-theme #page-creator-content-management,
  :root.heybox-up-theme #page-creator-content-management-detail {
    background-color: var(--heybox-up-bg) !important;
    transition: none !important;
  }
  :root.heybox-up-theme #page-creator-content-management > .content,
  :root.heybox-up-theme #page-creator-content-management-detail > .content {
    background-color: var(--heybox-up-bg) !important;
  }
  /* Global search page: right rail holds only hot searches, a QR code, app links and ICP text. */
  #page-bbs-list .cpt-right-side.right {
    display: none !important;
  }
  #page-bbs-list .content > .list {
    flex: 1 1 0 !important;
    width: auto !important;
    min-width: 0 !important;
    max-width: none !important;
  }
  /* The native control anchors to the content box, so it drifts under rails and off the viewport. */
  .scroll-list__button-group {
    right: 20px !important;
    bottom: 24px !important;
    left: auto !important;
  }
  #page-bbs-community .scroll-list__button-group,
  #page-topic-link .scroll-list__button-group,
  #page-bbs-link .scroll-list__button-group {
    display: none !important;
  }
  /* Site confirm dialogs mount on body with fixed light surfaces behind the reader layer. */
  :root.heybox-up-theme .alert-container-wrapper .hb-cpt__alert {
    background-color: var(--heybox-up-surface) !important;
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme .alert-container-wrapper .hb-cpt__alert-title {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme .alert-container-wrapper .hb-cpt__alert-desc {
    color: var(--heybox-up-muted) !important;
  }
  :root.heybox-up-theme .alert-container-wrapper .hb-cpt__alert-input-wrapper {
    background-color: var(--heybox-up-subtle) !important;
    box-shadow: inset 0 0 0 1px var(--heybox-up-border) !important;
  }
  :root.heybox-up-theme .alert-container-wrapper .hb-cpt__alert-input {
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme .alert-container-wrapper .hb-cpt__alert-input::placeholder {
    color: var(--heybox-up-muted) !important;
  }
  :root.heybox-up-theme .alert-container-wrapper .alert-btn-box__btn.cancel {
    background-color: var(--heybox-up-subtle) !important;
    color: var(--heybox-up-text) !important;
  }
  :root.heybox-up-theme .alert-container-wrapper .alert-btn-box__btn.confirm {
    background: var(--heybox-up-accent) !important;
    color: var(--heybox-up-on-accent) !important;
  }
`;
  var THEME_ENTRY_CSS = `
  :host { display: inline-flex; flex: none; position: relative; gap: 2px; }
  .button {
    display: grid; place-items: center; width: 32px; height: 32px; padding: 0;
    border: 0; border-radius: 8px; background: transparent;
    color: var(--heybox-up-icon, #62676e); cursor: pointer;
  }
  .button:hover {
    background: var(--heybox-up-icon-hover-bg, rgba(20, 25, 30, .06));
    color: var(--heybox-up-icon-hover, #14191e);
  }
  .button:focus-visible {
    outline: 2px solid var(--heybox-up-accent, #6f8db3);
    outline-offset: 2px;
  }
  svg { display: block; width: 18px; height: 18px; }
  .menu {
    position: absolute; top: 38px; right: 0; z-index: 1000; width: 236px; padding: 6px;
    border: 1px solid var(--hbu-menu-border, rgba(20, 25, 30, .12)); border-radius: 12px;
    background: var(--hbu-menu-bg, #fff); color: var(--hbu-menu-text, #14191e);
    box-shadow: 0 14px 34px rgba(0, 0, 0, .18);
  }
  .theme-menu { right: 34px; }
  .settings-menu { max-height: min(70vh, 560px); overflow-y: auto; overscroll-behavior: contain; }
  .menu[hidden] { display: none; }
  .menu-title {
    padding: 6px 10px 4px; font-size: 11px; letter-spacing: .08em;
    color: var(--hbu-menu-muted, #6b7280);
  }
  .item {
    display: flex; align-items: center; gap: 10px; width: 100%; padding: 7px 8px;
    border: 0; border-radius: 8px; background: transparent; color: inherit;
    font: inherit; text-align: left; cursor: pointer;
  }
  .item:hover, .item:focus-visible { background: var(--hbu-menu-hover, rgba(20, 25, 30, .06)); outline: none; }
  .item[aria-checked="true"] { background: var(--hbu-menu-hover, rgba(20, 25, 30, .06)); }
  .swatch {
    flex: none; width: 28px; height: 28px; border-radius: 7px;
    border: 1px solid var(--hbu-menu-border, rgba(20, 25, 30, .12));
    background: linear-gradient(135deg, var(--a) 0 55%, var(--b) 55%);
  }
  .copy { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .name { font-size: 13px; line-height: 1.3; }
  .hint { font-size: 11px; line-height: 1.3; color: var(--hbu-menu-muted, #6b7280); }
  .check { margin-left: auto; font-size: 12px; color: var(--heybox-up-accent, #6f8db3); opacity: 0; }
  .item[aria-checked="true"] .check { opacity: 1; }
  .sep { height: 1px; margin: 6px 4px; background: var(--hbu-menu-border, rgba(20, 25, 30, .12)); }
  .field { padding: 2px 8px 6px; }
  .field + .field { padding-top: 0; }
  .field-label { padding: 0 2px 6px; font-size: 11px; letter-spacing: .08em; color: var(--hbu-menu-muted, #6b7280); }
  .field-row { display: flex; gap: 6px; align-items: center; }
  .number {
    width: 76px; height: 28px; padding: 0 8px; border: 1px solid var(--hbu-menu-border, rgba(20, 25, 30, .12));
    border-radius: 7px; outline: none; background: transparent; color: inherit;
    font: inherit; font-size: 12px; font-variant-numeric: tabular-nums;
  }
  .number:focus { border-color: var(--heybox-up-accent, #6f8db3); }
  .unit { font-size: 11px; color: var(--hbu-menu-muted, #6b7280); }
  .field-hint { display: block; margin-top: 5px; color: var(--hbu-menu-muted, #6b7280); font-size: 10.5px; line-height: 1.45; }
  .field-hint[data-warn="true"] { color: #b4762a; }
  .chips { display: flex; gap: 4px; }
  .chip {
    flex: 1 1 0; min-width: 0; padding: 5px 0; border: 1px solid var(--hbu-menu-border, rgba(20, 25, 30, .12));
    border-radius: 7px; background: transparent; color: inherit; font: inherit; font-size: 12px;
    font-variant-numeric: tabular-nums; text-align: center; cursor: pointer;
    transition: color .14s ease, border-color .14s ease, background .14s ease;
  }
  .chip:hover { background: var(--hbu-menu-hover, rgba(20, 25, 30, .06)); }
  .chip:focus-visible { outline: 2px solid var(--heybox-up-accent, #6f8db3); outline-offset: 1px; }
  .chip[aria-checked="true"] {
    border-color: var(--heybox-up-accent, #6f8db3);
    color: var(--heybox-up-accent, #6f8db3);
    background: var(--hbu-menu-hover, rgba(20, 25, 30, .06));
  }
  .item.toggle[aria-checked="true"] { background: transparent; }
  .switch {
    position: relative; flex: none; margin-left: auto; width: 30px; height: 16px; border-radius: 999px;
    border: 1px solid var(--hbu-menu-border, rgba(20, 25, 30, .12));
    background: var(--hbu-menu-hover, rgba(20, 25, 30, .06));
    transition: border-color .15s ease;
  }
  .switch::after {
    content: ""; position: absolute; top: 1px; left: 2px; width: 12px; height: 12px; border-radius: 50%;
    background: var(--hbu-menu-muted, #6b7280);
    transition: transform .15s ease, background .15s ease;
  }
  .item[aria-checked="true"] .switch { border-color: var(--heybox-up-accent, #6f8db3); }
  .item[aria-checked="true"] .switch::after { transform: translateX(13px); background: var(--heybox-up-accent, #6f8db3); }
`;
  var THEME_ICONS = {
    system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
    dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/></svg>',
    oled: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 1.5"/></svg>',
    light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    paper: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>',
    mist: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h16M4 13h12M4 17h8"/><path d="M17.5 12.5c1.2 1.4 1.8 2.4 1.8 3.2a1.8 1.8 0 0 1-3.6 0c0-.8.6-1.8 1.8-3.2Z"/></svg>'
  };
  var SETTINGS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3.1"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 8.9 4.6h.08A1.7 1.7 0 0 0 10 3.04V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 8.9v.08A1.7 1.7 0 0 0 20.96 10H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z"/></svg>';
  function ensureThemeStyle() {
    ensureStyleElement(THEME_STYLE_ID, THEME_CSS, true);
  }
  function updateThemeEntry() {
    if (!themeEntry) return;
    const preset = getThemePreset(currentThemeMode);
    themeEntry.button.innerHTML = THEME_ICONS[currentThemeMode];
    themeEntry.button.title = "主题：" + preset.label + "（点击选择）";
    themeEntry.button.setAttribute("aria-label", "主题：" + preset.label + "，点击选择");
    themeEntry.button.setAttribute("aria-expanded", String(!themeEntry.menu.hidden));
    themeEntry.settingsButton.setAttribute("aria-expanded", String(!themeEntry.settingsMenu.hidden));
    for (const item of themeEntry.items) {
      item.node.setAttribute("aria-checked", String(item.id === currentThemeMode));
    }
    if (previewToggle) previewToggle.setAttribute("aria-checked", String(readCommentPreviewPreference()));
    if (navMotionToggle) navMotionToggle.setAttribute("aria-checked", String(readNavMotionPreference()));
    if (readerToggle) readerToggle.setAttribute("aria-checked", String(readReaderPreference()));
    if (readerTimelineToggle) readerTimelineToggle.setAttribute("aria-checked", String(readReaderTimelinePreference()));
    if (desktopHotRankingToggle) desktopHotRankingToggle.setAttribute("aria-checked", String(readDesktopRailPreference("hotRanking")));
    if (desktopShortcutsToggle) desktopShortcutsToggle.setAttribute("aria-checked", String(readDesktopRailPreference("shortcuts")));
    syncFeedWidthControls(readFeedWidth());
    syncNumberInput(readerLineHeightInput, readReaderLineHeight());
    syncReaderHistoryLimitControl(readReaderHistoryLimit());
  }
  function applyTheme(mode, persist) {
    if (isOfficialHomePath(location.pathname)) {
      releaseTheme();
      return;
    }
    currentThemeMode = normalizeThemeMode(mode);
    const effective = resolveTheme(currentThemeMode, THEME_MEDIA.matches);
    const preset = getThemePreset(effective);
    const root = document.documentElement;
    root.classList.add(THEME_CLASS);
    root.setAttribute(THEME_ATTR, effective);
    root.setAttribute("data-heybox-up-dark", String(preset.dark === true));
    root.style.colorScheme = preset.dark === true ? "dark" : "light";
    ensureThemeStyle();
    if (persist) writeThemeMode(currentThemeMode);
    updateThemeEntry();
    if (preset.dark === true) scheduleDarkSweep(true);
    else clearDarkSweep();
  }
  function releaseTheme() {
    clearDarkSweep();
    const root = document.documentElement;
    root.classList.remove(THEME_CLASS);
    root.removeAttribute(THEME_ATTR);
    root.removeAttribute("data-heybox-up-dark");
    root.style.removeProperty("color-scheme");
    themeEntry?.host.remove();
    themeEntry = null;
    removeStyleElement(THEME_STYLE_ID);
  }
  function createThemeEntry() {
    const host = document.createElement("span");
    host.id = THEME_ENTRY_ID;
    host.className = "heybox-up-theme-entry";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = THEME_ENTRY_CSS;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button";
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", "false");
    const settingsButton = document.createElement("button");
    settingsButton.type = "button";
    settingsButton.className = "button";
    settingsButton.setAttribute("aria-haspopup", "menu");
    settingsButton.setAttribute("aria-expanded", "false");
    settingsButton.setAttribute("aria-label", "打开设置");
    settingsButton.title = "设置";
    settingsButton.innerHTML = SETTINGS_ICON;
    const menu = document.createElement("div");
    menu.className = "menu theme-menu";
    menu.hidden = true;
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "主题预设");
    menu.append(createThemeMenuTitle());
    const settingsMenu = document.createElement("div");
    settingsMenu.className = "menu settings-menu";
    settingsMenu.hidden = true;
    settingsMenu.setAttribute("role", "menu");
    settingsMenu.setAttribute("aria-label", "设置");
    settingsMenu.append(createSettingsMenuTitle());
    const items = THEME_PRESETS.map((preset) => {
      const node = document.createElement("button");
      node.type = "button";
      node.className = "item";
      node.dataset["theme"] = preset.id;
      node.setAttribute("role", "menuitemradio");
      node.setAttribute("aria-checked", "false");
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.setProperty("--a", preset.swatch[0]);
      swatch.style.setProperty("--b", preset.swatch[1]);
      const copy = document.createElement("span");
      copy.className = "copy";
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = preset.label;
      const hint = document.createElement("span");
      hint.className = "hint";
      hint.textContent = preset.hint;
      copy.append(name, hint);
      const check = document.createElement("span");
      check.className = "check";
      check.textContent = "✓";
      node.append(swatch, copy, check);
      node.addEventListener("click", () => {
        applyTheme(preset.id, true);
        closeThemeMenu();
        button.focus();
      });
      return { id: preset.id, node };
    });
    menu.append(...items.map((item) => item.node));
    settingsMenu.append(
      createCommentPreviewToggle(),
      createNavMotionToggle(),
      createReaderToggle(),
      createReaderTimelineToggle(),
      createDesktopRailToggle("hotRanking", "热门排行", "显示基于当前已加载信息流的排序"),
      createDesktopRailToggle("shortcuts", "快捷入口", "显示收藏与文章入口"),
      createReaderHistoryLimitControl(),
      createReaderLineHeightControl(),
      createThemeMenuSeparator(),
      createFeedWidthControl()
    );
    const getMenuItems = (owner) => Array.from(
      owner.querySelectorAll('[role^="menuitem"]')
    ).filter((node) => !node.hidden && !node.closest("[hidden]"));
    const getTabStops = (owner) => Array.from(
      owner.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')
    ).filter((node) => {
      if (node.hidden || node.closest("[hidden]") !== null || node.getAttribute("aria-hidden") === "true") return false;
      if (node instanceof HTMLButtonElement || node instanceof HTMLInputElement || node instanceof HTMLSelectElement || node instanceof HTMLTextAreaElement) return !node.disabled;
      return true;
    });
    const focusMenuItem = (owner, index) => {
      const items2 = getMenuItems(owner);
      if (items2.length === 0) return;
      const nextIndex = (index + items2.length) % items2.length;
      items2[nextIndex]?.focus();
    };
    const focusInitialMenuItem = (owner, selectedId) => {
      const items2 = getMenuItems(owner);
      if (items2.length === 0) return;
      const selected = selectedId === void 0 ? void 0 : items2.find((item) => item.dataset["theme"] === selectedId || item.getAttribute("aria-checked") === "true");
      (selected ?? items2[0])?.focus();
    };
    const navigateMenu = (owner, key, shiftKey) => {
      const items2 = getMenuItems(owner);
      if (items2.length === 0) return false;
      const root = owner.getRootNode();
      const active = root instanceof ShadowRoot ? root.activeElement : document.activeElement;
      const currentIndex = active instanceof HTMLElement ? items2.indexOf(active) : -1;
      if (key === "ArrowDown") {
        if (currentIndex < 0) return false;
        focusMenuItem(owner, currentIndex + 1);
        return true;
      }
      if (key === "ArrowUp") {
        if (currentIndex < 0) return false;
        focusMenuItem(owner, currentIndex - 1);
        return true;
      }
      if (key === "Home") {
        if (currentIndex < 0) return false;
        focusMenuItem(owner, 0);
        return true;
      }
      if (key === "End") {
        if (currentIndex < 0) return false;
        focusMenuItem(owner, items2.length - 1);
        return true;
      }
      if (key === "Tab") {
        const tabStops = getTabStops(owner);
        const tabIndex = active instanceof HTMLElement ? tabStops.indexOf(active) : -1;
        if (tabIndex < 0 || tabStops.length === 0) return false;
        const nextIndex = (tabIndex + (shiftKey ? -1 : 1) + tabStops.length) % tabStops.length;
        tabStops[nextIndex]?.focus();
        return true;
      }
      return false;
    };
    const closeThemeMenu = () => {
      if (menu.hidden) return;
      menu.hidden = true;
      button.setAttribute("aria-expanded", "false");
      updateThemeEntry();
    };
    const closeSettingsMenu = () => {
      if (settingsMenu.hidden) return;
      settingsMenu.hidden = true;
      settingsButton.setAttribute("aria-expanded", "false");
      updateThemeEntry();
    };
    button.addEventListener("click", () => {
      closeSettingsMenu();
      menu.hidden = !menu.hidden;
      button.setAttribute("aria-expanded", String(!menu.hidden));
      updateThemeEntry();
      if (!menu.hidden) focusInitialMenuItem(menu, currentThemeMode);
    });
    settingsButton.addEventListener("click", () => {
      closeThemeMenu();
      settingsMenu.hidden = !settingsMenu.hidden;
      settingsButton.setAttribute("aria-expanded", String(!settingsMenu.hidden));
      updateThemeEntry();
      if (!settingsMenu.hidden) focusInitialMenuItem(settingsMenu);
    });
    document.addEventListener("click", (event) => {
      if (menu.hidden && settingsMenu.hidden || event.composedPath().includes(host)) return;
      closeThemeMenu();
      closeSettingsMenu();
    }, true);
    document.addEventListener("keydown", (event) => {
      const path = event.composedPath();
      const activeMenu = !menu.hidden && path.includes(menu) ? menu : !settingsMenu.hidden && path.includes(settingsMenu) ? settingsMenu : null;
      if (activeMenu && navigateMenu(activeMenu, event.key, event.shiftKey)) {
        event.preventDefault();
        return;
      }
      if (event.key !== "Escape" || menu.hidden && settingsMenu.hidden) return;
      event.preventDefault();
      const returnTarget = settingsMenu.hidden ? button : settingsButton;
      closeThemeMenu();
      closeSettingsMenu();
      returnTarget.focus();
    });
    shadow.append(style, button, settingsButton, menu, settingsMenu);
    themeEntry = { host, button, menu, items, settingsButton, settingsMenu };
    updateThemeEntry();
  }
  function createThemeMenuTitle() {
    const title = document.createElement("div");
    title.className = "menu-title";
    title.textContent = "主题预设";
    return title;
  }
  function createSettingsMenuTitle() {
    const title = document.createElement("div");
    title.className = "menu-title";
    title.textContent = "设置";
    return title;
  }
  function createThemeMenuSeparator() {
    const line = document.createElement("div");
    line.className = "sep";
    line.setAttribute("role", "separator");
    return line;
  }
  function createCommentPreviewToggle() {
    const node = document.createElement("button");
    node.type = "button";
    node.className = "item toggle";
    node.setAttribute("role", "menuitemcheckbox");
    node.setAttribute("aria-checked", String(readCommentPreviewPreference()));
    const copy = document.createElement("span");
    copy.className = "copy";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = "首页评论预览";
    const hint = document.createElement("span");
    hint.className = "hint";
    hint.textContent = "信息流右侧直接看评论";
    copy.append(name, hint);
    const toggle = document.createElement("span");
    toggle.className = "switch";
    node.append(copy, toggle);
    node.addEventListener("click", () => {
      const next = !(node.getAttribute("aria-checked") === "true");
      node.setAttribute("aria-checked", String(next));
      setCommentPreviewPreference(next);
    });
    previewToggle = node;
    return node;
  }
  function createNavMotionToggle() {
    const node = document.createElement("button");
    node.type = "button";
    node.className = "item toggle";
    node.setAttribute("role", "menuitemcheckbox");
    node.setAttribute("aria-checked", String(readNavMotionPreference()));
    const copy = document.createElement("span");
    copy.className = "copy";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = "动态导航图标";
    const hint = document.createElement("span");
    hint.className = "hint";
    hint.textContent = "图标持续描边流转，悬停时加快";
    copy.append(name, hint);
    const toggle = document.createElement("span");
    toggle.className = "switch";
    node.append(copy, toggle);
    node.addEventListener("click", () => {
      const next = !(node.getAttribute("aria-checked") === "true");
      node.setAttribute("aria-checked", String(next));
      setNavMotionPreference(next);
    });
    navMotionToggle = node;
    return node;
  }
  function createReaderToggle() {
    const node = document.createElement("button");
    node.type = "button";
    node.className = "item toggle";
    node.setAttribute("role", "menuitemcheckbox");
    node.setAttribute("aria-checked", String(readReaderPreference()));
    const copy = document.createElement("span");
    copy.className = "copy";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = "沉浸阅读";
    const hint = document.createElement("span");
    hint.className = "hint";
    hint.textContent = "帖子页全屏沉浸阅读，评论收进侧栏";
    copy.append(name, hint);
    const toggle = document.createElement("span");
    toggle.className = "switch";
    node.append(copy, toggle);
    node.addEventListener("click", () => {
      const next = !(node.getAttribute("aria-checked") === "true");
      node.setAttribute("aria-checked", String(next));
      setReaderPreference(next);
    });
    readerToggle = node;
    return node;
  }
  function createReaderTimelineToggle() {
    const node = document.createElement("button");
    node.type = "button";
    node.className = "item toggle";
    node.setAttribute("role", "menuitemcheckbox");
    node.setAttribute("aria-checked", String(readReaderTimelinePreference()));
    const copy = document.createElement("span");
    copy.className = "copy";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = "阅读时间轴";
    const hint = document.createElement("span");
    hint.className = "hint";
    hint.textContent = "沉浸阅读右侧保留访问历史，可一键跳回";
    copy.append(name, hint);
    const toggle = document.createElement("span");
    toggle.className = "switch";
    node.append(copy, toggle);
    node.addEventListener("click", () => {
      const next = !(node.getAttribute("aria-checked") === "true");
      node.setAttribute("aria-checked", String(next));
      setReaderTimelinePreference(next);
    });
    readerTimelineToggle = node;
    return node;
  }
  function createDesktopRailToggle(module, label, hintText) {
    const node = document.createElement("button");
    node.type = "button";
    node.className = "item toggle";
    node.setAttribute("role", "menuitemcheckbox");
    node.setAttribute("aria-checked", String(readDesktopRailPreference(module)));
    const copy = document.createElement("span");
    copy.className = "copy";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = label;
    const hint = document.createElement("span");
    hint.className = "hint";
    hint.textContent = hintText;
    copy.append(name, hint);
    const toggle = document.createElement("span");
    toggle.className = "switch";
    node.append(copy, toggle);
    node.addEventListener("click", () => {
      const next = node.getAttribute("aria-checked") !== "true";
      node.setAttribute("aria-checked", String(next));
      setDesktopRailPreference(module, next);
    });
    if (module === "hotRanking") desktopHotRankingToggle = node;
    else desktopShortcutsToggle = node;
    return node;
  }
  var FEED_WIDTH_STEPS = [40, 48, 56, 64, 72];
  function inputRootActiveElement(input) {
    const root = input.getRootNode();
    return root instanceof ShadowRoot ? root.activeElement : document.activeElement;
  }
  function syncNumberInput(input, value) {
    if (input === null) return;
    if (inputRootActiveElement(input) === input) return;
    input.value = String(value);
  }
  function bindNumberInput(input, commit) {
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      commit();
      input.blur();
    });
    input.addEventListener("change", commit);
    input.addEventListener("blur", commit);
  }
  function syncReaderHistoryLimitControl(value) {
    const limit = Number.isSafeInteger(value) && value >= READER_HISTORY_LIMIT_UNLIMITED ? value : 0;
    syncNumberInput(readerHistoryLimitInput, limit);
    if (readerHistoryLimitHint === null) return;
    readerHistoryLimitHint.dataset["warn"] = String(limit === READER_HISTORY_LIMIT_UNLIMITED || limit > READER_HISTORY_LIMIT_WARN);
    readerHistoryLimitHint.textContent = limit === READER_HISTORY_LIMIT_UNLIMITED ? "0 表示不限条数，长时间阅读会占用更多内存与浏览器存储" : limit > READER_HISTORY_LIMIT_WARN ? "记录较多，会占用更多内存与浏览器存储" : "只保留最近 " + limit + " 篇，超出后自动丢弃最旧的记录";
  }
  function createReaderHistoryLimitControl() {
    const wrap = document.createElement("div");
    wrap.className = "field";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "阅读时间轴条数上限");
    const label = document.createElement("div");
    label.className = "field-label";
    label.textContent = "时间轴最多保留条数";
    const row = document.createElement("div");
    row.className = "field-row";
    const input = document.createElement("input");
    input.type = "number";
    input.className = "number";
    input.min = "0";
    input.step = "1";
    input.inputMode = "numeric";
    input.value = String(readReaderHistoryLimit());
    input.setAttribute("aria-label", "阅读时间轴最多保留的帖子数量");
    input.title = "0 表示不限；条数越多占用越高";
    const unit = document.createElement("span");
    unit.className = "unit";
    unit.textContent = "篇";
    const hint = document.createElement("span");
    hint.className = "field-hint";
    row.append(input, unit);
    wrap.append(label, row, hint);
    bindNumberInput(input, () => {
      const next = parseReaderHistoryLimitInput(input.value);
      const value = next === null ? readReaderHistoryLimit() : setReaderHistoryLimitPreference(next);
      input.value = String(value);
      syncReaderHistoryLimitControl(value);
      updateThemeEntry();
    });
    readerHistoryLimitInput = input;
    readerHistoryLimitHint = hint;
    syncReaderHistoryLimitControl(readReaderHistoryLimit());
    return wrap;
  }
  function createReaderLineHeightControl() {
    const wrap = document.createElement("div");
    wrap.className = "field";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "正文行距");
    const label = document.createElement("div");
    label.className = "field-label";
    label.textContent = "正文行距";
    const row = document.createElement("div");
    row.className = "field-row";
    const input = document.createElement("input");
    input.type = "number";
    input.className = "number";
    input.min = String(READER_LINE_HEIGHT_MIN);
    input.max = String(READER_LINE_HEIGHT_MAX);
    input.step = String(READER_LINE_HEIGHT_STEP);
    input.inputMode = "decimal";
    input.value = String(readReaderLineHeight());
    input.setAttribute("aria-label", "正文行距倍数");
    input.title = "正文行距 " + READER_LINE_HEIGHT_MIN + " - " + READER_LINE_HEIGHT_MAX + " 倍";
    const unit = document.createElement("span");
    unit.className = "unit";
    unit.textContent = "倍";
    row.append(input, unit);
    wrap.append(label, row);
    bindNumberInput(input, () => {
      const next = parseReaderLineHeightInput(input.value);
      const value = next === null ? readReaderLineHeight() : setReaderLineHeightPreference(next);
      input.value = String(value);
      updateThemeEntry();
    });
    readerLineHeightInput = input;
    return wrap;
  }
  function syncFeedWidthChips(value) {
    for (const chip of feedWidthChips) {
      if (!(chip instanceof HTMLElement)) continue;
      chip.setAttribute("aria-checked", String(Number(chip.dataset["width"]) === value));
    }
  }
  function syncFeedWidthControls(value) {
    syncFeedWidthChips(value);
    syncNumberInput(feedWidthInput, value);
  }
  function createFeedWidthControl() {
    const wrap = document.createElement("div");
    wrap.className = "field";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "中栏宽度");
    const label = document.createElement("div");
    label.className = "field-label";
    label.textContent = "中栏宽度（占屏幕宽度）";
    const chips = document.createElement("div");
    chips.className = "chips";
    for (const step of FEED_WIDTH_STEPS) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.dataset["width"] = String(step);
      chip.textContent = step + "%";
      chip.title = "中栏占屏幕宽度 " + step + "%";
      chip.setAttribute("role", "menuitemradio");
      chip.setAttribute("aria-checked", "false");
      chip.addEventListener("click", () => {
        const width = setFeedWidthPreference(step);
        syncFeedWidthControls(width);
      });
      chips.append(chip);
    }
    const row = document.createElement("div");
    row.className = "field-row";
    const input = document.createElement("input");
    input.type = "number";
    input.className = "number";
    input.min = String(FEED_WIDTH_MIN);
    input.max = String(FEED_WIDTH_MAX);
    input.step = String(FEED_WIDTH_STEP);
    input.inputMode = "numeric";
    input.value = String(readFeedWidth());
    input.setAttribute("aria-label", "自定义中栏宽度百分比");
    input.title = "自定义中栏宽度 " + FEED_WIDTH_MIN + " - " + FEED_WIDTH_MAX + "%";
    const unit = document.createElement("span");
    unit.className = "unit";
    unit.textContent = "%";
    row.append(input, unit);
    bindNumberInput(input, () => {
      const next = parseFeedWidthInput(input.value);
      const value = next === null ? readFeedWidth() : setFeedWidthPreference(next);
      input.value = String(value);
      syncFeedWidthChips(value);
      updateThemeEntry();
    });
    feedWidthInput = input;
    wrap.append(label, chips, row);
    feedWidthChips = Array.from(chips.children);
    syncFeedWidthControls(readFeedWidth());
    return wrap;
  }
  function mountThemeEntry() {
    if (!document.body) return;
    if (themeEntry?.host.isConnected && themeEntry.host.parentElement?.classList.contains("nav-actions")) return;
    const actions = document.querySelector(".nav-actions");
    if (!actions) return;
    if (!themeEntry) createThemeEntry();
    const entry = themeEntry;
    if (entry === null) return;
    if (entry.host.parentNode !== actions) {
      const anchor = actions.querySelector(".publish-btn, .login-btn");
      actions.insertBefore(entry.host, anchor);
    }
  }
  function watchTheme() {
    if (!document.body) return;
    const sync = () => {
      if (isOfficialHomePath(location.pathname)) {
        releaseTheme();
        return;
      }
      if (document.documentElement.getAttribute(THEME_ATTR) === null) applyTheme(readThemeMode(), false);
      ensureThemeStyle();
      mountThemeEntry();
      scheduleDarkSweep();
    };
    registerPageSync(sync, 400, ADAPTED_ROUTES, "chrome");
    registerPageSync(() => scheduleDarkSweep(), 600, [PAGE_ROUTE.CREATOR, PAGE_ROUTE.TOPIC]);
    sync();
  }
  var DARK_SWEEP_ROOT_SELECTOR = "#page-creator-content-management, #page-creator-content-management-detail, #page-topic-link";
  var DARK_FLAT_CLASS = "heybox-up-dark-flat";
  var DARK_FLAT_SUBTLE_CLASS = "heybox-up-dark-flat-subtle";
  var DARK_EDGE_CLASS = "heybox-up-dark-edge";
  var DARK_INK_CLASS = "heybox-up-dark-ink";
  var DARK_SWEEP_LIMIT = 3e3;
  var DARK_SWEEP_SKIP = /* @__PURE__ */ new Set([
    "IMG",
    "VIDEO",
    "CANVAS",
    "SVG",
    "PATH",
    "USE",
    "IFRAME",
    "INPUT",
    "TEXTAREA",
    "SELECT",
    "OPTION",
    "SCRIPT",
    "STYLE",
    "LINK"
  ]);
  var RGB_COLOR = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/;
  var darkSweepTimer = 0;
  var darkSweepIdleHandle = 0;
  var darkSweepLastRun = 0;
  function parseRgbColor(value) {
    const match = RGB_COLOR.exec(value || "");
    if (match === null) return null;
    return {
      r: Number(match[1] ?? 0),
      g: Number(match[2] ?? 0),
      b: Number(match[3] ?? 0),
      a: match[4] === void 0 ? 1 : Number(match[4])
    };
  }
  function isNearWhite(color, min) {
    return color !== null && color.a >= 0.6 && (color.r + color.g + color.b) / 3 >= min;
  }
  function hasOwnText(node) {
    for (const child of node.childNodes) {
      const text = child.nodeValue;
      if (child.nodeType === 3 && text !== null && text.trim() !== "") return true;
    }
    return false;
  }
  function clearDarkSweep() {
    if (darkSweepTimer !== 0) {
      window.clearTimeout(darkSweepTimer);
      darkSweepTimer = 0;
    }
    if (darkSweepIdleHandle !== 0 && typeof window.cancelIdleCallback === "function") {
      window.cancelIdleCallback(darkSweepIdleHandle);
      darkSweepIdleHandle = 0;
    }
    const selector = "." + DARK_FLAT_CLASS + ", ." + DARK_FLAT_SUBTLE_CLASS + ", ." + DARK_EDGE_CLASS + ", ." + DARK_INK_CLASS;
    for (const node of document.querySelectorAll(selector)) {
      node.classList.remove(DARK_FLAT_CLASS, DARK_FLAT_SUBTLE_CLASS, DARK_EDGE_CLASS, DARK_INK_CLASS);
    }
  }
  function sweepDarkSurfaces() {
    if (document.documentElement.getAttribute("data-heybox-up-dark") !== "true") {
      clearDarkSweep();
      return;
    }
    const roots = document.querySelectorAll(DARK_SWEEP_ROOT_SELECTOR);
    if (roots.length === 0) return;
    const styleCache = /* @__PURE__ */ new WeakMap();
    const flatCache = /* @__PURE__ */ new WeakMap();
    const readStyle = (node) => {
      let style = styleCache.get(node);
      if (style === void 0) {
        style = getComputedStyle(node);
        styleCache.set(node, style);
      }
      return style;
    };
    const hasFlatBackground = (node) => {
      const path = [];
      let element = node;
      while (element !== null) {
        if (element.classList.contains(DARK_FLAT_CLASS) || element.classList.contains(DARK_FLAT_SUBTLE_CLASS)) {
          for (const item of path) flatCache.set(item, true);
          return true;
        }
        const known = flatCache.get(element);
        if (known !== void 0) {
          for (const item of path) flatCache.set(item, known);
          return known;
        }
        path.push(element);
        const color = parseRgbColor(readStyle(element).backgroundColor);
        if (color !== null && color.a >= 0.6) {
          for (const item of path) flatCache.set(item, false);
          return false;
        }
        element = element.parentElement;
      }
      for (const item of path) flatCache.set(item, false);
      return false;
    };
    for (const root of roots) {
      const nodes = root.querySelectorAll("*");
      const total = Math.min(nodes.length, DARK_SWEEP_LIMIT);
      for (let index = 0; index < total; index += 1) {
        const node = nodes[index];
        if (!(node instanceof HTMLElement)) continue;
        if (DARK_SWEEP_SKIP.has(node.tagName) || node.id.startsWith("heybox-up")) continue;
        const style = readStyle(node);
        if (!node.classList.contains(DARK_FLAT_CLASS) && !node.classList.contains(DARK_FLAT_SUBTLE_CLASS)) {
          if (style.backgroundImage === "none") {
            const bg = parseRgbColor(style.backgroundColor);
            if (isNearWhite(bg, 240)) {
              node.classList.add(isNearWhite(bg, 250) ? DARK_FLAT_CLASS : DARK_FLAT_SUBTLE_CLASS);
              flatCache.set(node, true);
            }
          }
        }
        if (!node.classList.contains(DARK_EDGE_CLASS) && styleHasBrightEdge(style)) {
          node.classList.add(DARK_EDGE_CLASS);
        }
        if (!node.classList.contains(DARK_INK_CLASS) && hasOwnText(node)) {
          const ink = parseRgbColor(style.color);
          if (ink !== null && (ink.r + ink.g + ink.b) / 3 < 120 && hasFlatBackground(node)) {
            node.classList.add(DARK_INK_CLASS);
          }
        }
      }
    }
  }
  function styleHasBrightEdge(style) {
    if (style.borderStyle === "none" || style.borderStyle === "") return false;
    if (style.borderTopWidth === "0px" && style.borderRightWidth === "0px" && style.borderBottomWidth === "0px" && style.borderLeftWidth === "0px") return false;
    return isNearWhite(parseRgbColor(style.borderTopColor), 240) || isNearWhite(parseRgbColor(style.borderRightColor), 240) || isNearWhite(parseRgbColor(style.borderBottomColor), 240) || isNearWhite(parseRgbColor(style.borderLeftColor), 240);
  }
  function scheduleDarkSweep(force = false) {
    if (document.documentElement.getAttribute("data-heybox-up-dark") !== "true") return;
    if (document.querySelector(DARK_SWEEP_ROOT_SELECTOR) === null) return;
    if (darkSweepTimer !== 0 || darkSweepIdleHandle !== 0) {
      if (!force) return;
      window.clearTimeout(darkSweepTimer);
      darkSweepTimer = 0;
      if (darkSweepIdleHandle !== 0 && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(darkSweepIdleHandle);
        darkSweepIdleHandle = 0;
      }
    }
    const elapsed = performance.now() - darkSweepLastRun;
    const delay = force ? 350 : Math.max(350, 1200 - elapsed);
    darkSweepTimer = window.setTimeout(() => {
      darkSweepTimer = 0;
      darkSweepLastRun = performance.now();
      if (typeof window.requestIdleCallback === "function") {
        darkSweepIdleHandle = window.requestIdleCallback(() => {
          darkSweepIdleHandle = 0;
          sweepDarkSurfaces();
        }, { timeout: 1e3 });
      } else {
        sweepDarkSurfaces();
      }
    }, delay);
  }

  // scripts/heybox-up/src/ui/reader-interactions.ts
  var READER_VOTE_SELECTOR = ".image-text__vote, .article-vote, .vote-container";
  var CONTROL_SELECTOR = "button, input, select, textarea, label, a[href], [role=button], [class*=vote-item], [class*=vote-submit]";
  var componentSequence = 0;
  function bindReaderInteraction(clone, source, includeNode = () => true) {
    let native = source;
    const parent = source.parentElement;
    const slot = parent === null ? -1 : Array.from(parent.children).indexOf(source);
    let mapping = /* @__PURE__ */ new WeakMap();
    let disposed = false;
    const radioGroupPrefix = "hbu-reader-" + ++componentSequence + "-";
    const mirror = (copy, original) => {
      mapping.set(copy, original);
      if (original instanceof Element && original.matches("iframe, video, audio, embed, object")) return;
      if (copy instanceof Element && original instanceof Element) {
        for (const attribute of Array.from(copy.attributes)) {
          if (!original.hasAttribute(attribute.name)) copy.removeAttribute(attribute.name);
        }
        for (const attribute of Array.from(original.attributes)) {
          const value = attribute.name === "name" && original instanceof HTMLInputElement && original.type === "radio" ? radioGroupPrefix + attribute.value : attribute.value;
          if (copy.getAttribute(attribute.name) !== value) copy.setAttribute(attribute.name, value);
        }
        if (copy instanceof HTMLInputElement && original instanceof HTMLInputElement) {
          copy.checked = original.checked;
          if (copy.value !== original.value) copy.value = original.value;
          copy.indeterminate = original.indeterminate;
        }
        if (copy instanceof HTMLTextAreaElement && original instanceof HTMLTextAreaElement && copy.value !== original.value) copy.value = original.value;
        if (copy instanceof HTMLOptionElement && original instanceof HTMLOptionElement) copy.selected = original.selected;
      } else if (copy.nodeValue !== original.nodeValue) copy.nodeValue = original.nodeValue;
      const originals = Array.from(original.childNodes).filter(includeNode);
      for (const [index, child] of originals.entries()) {
        let copied = copy.childNodes[index];
        if (copied === void 0 || copied.nodeType !== child.nodeType || copied.nodeName !== child.nodeName) {
          const replacement = child.cloneNode(true);
          if (copied === void 0) copy.appendChild(replacement);
          else copy.replaceChild(replacement, copied);
          copied = replacement;
        }
        mirror(copied, child);
      }
      while (copy.childNodes.length > originals.length) copy.removeChild(copy.lastChild);
    };
    const refresh = () => {
      if (disposed) return;
      if (!native.isConnected && parent !== null) {
        const replacement = parent.children[slot];
        if (replacement === void 0 || replacement.tagName !== source.tagName || source.matches(READER_VOTE_SELECTOR) && !replacement.matches(READER_VOTE_SELECTOR)) {
          mapping = /* @__PURE__ */ new WeakMap();
          return;
        }
        native = replacement;
      }
      mapping = /* @__PURE__ */ new WeakMap();
      mirror(clone, native);
    };
    const forward = (event) => {
      if (!(event.target instanceof Element)) return;
      if (event.type === "submit") {
        event.preventDefault();
        event.stopImmediatePropagation();
        const form = mapping.get(event.target);
        if (form instanceof HTMLFormElement) {
          const submitter = event instanceof SubmitEvent && event.submitter !== null ? mapping.get(event.submitter) : void 0;
          form.requestSubmit(submitter instanceof HTMLElement ? submitter : void 0);
        }
        return;
      }
      const control = event.target.closest(CONTROL_SELECTOR);
      if (control === null || !clone.contains(control)) return;
      const target = mapping.get(event.target);
      if (!(target instanceof Element)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.type === "click") {
        if (target instanceof HTMLElement) target.click();
        else target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      } else {
        const proxy = event.target;
        if (proxy instanceof HTMLInputElement && target instanceof HTMLInputElement) {
          target.value = proxy.value;
          target.checked = proxy.checked;
        } else if (proxy instanceof HTMLTextAreaElement && target instanceof HTMLTextAreaElement) target.value = proxy.value;
        else if (proxy instanceof HTMLSelectElement && target instanceof HTMLSelectElement) {
          for (const [index, option] of Array.from(proxy.options).entries()) target.options[index].selected = option.selected;
        }
        target.dispatchEvent(new Event(event.type, { bubbles: true }));
      }
      queueMicrotask(refresh);
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(parent || native, { subtree: true, childList: true, attributes: true, characterData: true });
    for (const type of ["click", "input", "change", "submit"]) clone.addEventListener(type, forward, true);
    parent?.addEventListener("input", refresh);
    parent?.addEventListener("change", refresh);
    return { refresh, dispose: () => {
      disposed = true;
      observer.disconnect();
      mapping = /* @__PURE__ */ new WeakMap();
      for (const type of ["click", "input", "change", "submit"]) clone.removeEventListener(type, forward, true);
      parent?.removeEventListener("input", refresh);
      parent?.removeEventListener("change", refresh);
    } };
  }

  // scripts/heybox-up/src/ui/reader.ts
  var READER_ID = "heybox-up-reader";
  var READER_STYLE_ID = "heybox-up-reader-style";
  var READER_CLASS = "heybox-up-reader";
  var READER_SOURCE_ROOT_SELECTOR = ":is(.hb-bbs-image-text, .hb-bbs-post, .hb-bbs__video)";
  var READER_SOURCE_BODY_SELECTOR = ".image-text__content, .post__content, .bbs-video__content-wrapper";
  var READER_SOURCE_TITLE_SELECTOR = ".section-title__content, .post__title, .image-text__title";
  var READER_SOURCE_HEADER_SELECTOR = ".image-text__header-image img, .post__header-image img";
  var READER_SOURCE_VIDEO_SELECTOR = ".bbs-video__video-container video, video.bbs-video__video-box, .hb-bbs__video video";
  var READER_MEDIA_EXCLUDE_SELECTOR = ".comment, .link-comment, .com-award-table, .com-game-card, .bbs-link__related-recommend, .bbs-video__user, .bbs-video__tags, .link-user, [class*='avatar'], [class*='icon'], [class*='emoji']";
  var READER_SCROLL_KEY = "heybox-up.readerScroll.v1:";
  var READER_RATIO_KEY = "heybox-up.readerRatio.v1:";
  var READER_POSITIONS_VERSION = 1;
  var READER_POSITIONS_TTL_MS = 30 * 24 * 60 * 60 * 1e3;
  var READER_POSITIONS_MAX = 200;
  var POST_ID_PATTERN = /^\d+$/;
  var COMMENT_CONTROL_ATTRIBUTES = { reply: "replyId", remove: "deleteId", collapse: "threadId", expand: "threadId" };
  var COMMENT_CONTROL_CLASSES = {
    reply: "hbu-reader-comments-reply",
    remove: "hbu-reader-comments-delete",
    collapse: "hbu-reader-comments-collapse",
    expand: "hbu-reader-comments-expand"
  };
  var READER_PENDING_NOTICE_MS = 9e3;
  var LIGHTBOX_LONG_IMAGE_RATIO = 1.6;
  var LIGHTBOX_LONG_IMAGE_WIDTH_RATIO = 0.5;
  var LIGHTBOX_ZOOM_MAX = 2;
  function computeLightboxBaseWidth(naturalWidth, naturalHeight, viewportWidth, viewportHeight = 0) {
    const width = Number.isFinite(naturalWidth) && naturalWidth > 0 ? naturalWidth : 0;
    const height = Number.isFinite(naturalHeight) && naturalHeight > 0 ? naturalHeight : 0;
    const screenWidth = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 0;
    if (width === 0 || screenWidth === 0) return 0;
    const ratio = height === 0 ? 1 : height / width;
    if (ratio > LIGHTBOX_LONG_IMAGE_RATIO) {
      const target = Math.round(screenWidth * LIGHTBOX_LONG_IMAGE_WIDTH_RATIO);
      return Math.max(1, Math.min(width, target));
    }
    const byWidth = screenWidth * 0.92;
    const byHeight = height > 0 && Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight * 0.84 * (width / height) : byWidth;
    return Math.max(1, Math.round(Math.min(width, byWidth, byHeight)));
  }
  function computeLightboxZoomWidth(baseWidth, naturalWidth, step) {
    const base = Number.isFinite(baseWidth) && baseWidth > 0 ? baseWidth : 0;
    if (base === 0) return 0;
    const natural = Number.isFinite(naturalWidth) && naturalWidth > 0 ? naturalWidth : 0;
    const cap = Math.max(natural, base * 2.4);
    const scale = Math.pow(1.55, Math.max(0, Math.min(LIGHTBOX_ZOOM_MAX, Number.isFinite(step) ? step : 0)));
    return Math.round(Math.min(cap, base * scale));
  }
  var COMMENT_VERIFY_DELAYS_MS = [400, 600, 900, 1200, 1500];
  var COMMENT_VERIFY_ATTEMPTS = COMMENT_VERIFY_DELAYS_MS.length;
  var COMMENT_VERIFY_GRACE_DELAYS_MS = [6e3, 12e3, 2e4];
  var COMMENT_VERIFY_WAIT_COUNT = COMMENT_VERIFY_DELAYS_MS.length + COMMENT_VERIFY_GRACE_DELAYS_MS.length;
  var COMMENT_VERIFY_MAX_ATTEMPTS = COMMENT_VERIFY_WAIT_COUNT + 1;
  var readCommentVerifyDelay = (attempt) => {
    const index = Math.max(0, attempt - 1);
    if (index < COMMENT_VERIFY_DELAYS_MS.length) return COMMENT_VERIFY_DELAYS_MS[index];
    const graceIndex = Math.min(index - COMMENT_VERIFY_DELAYS_MS.length, COMMENT_VERIFY_GRACE_DELAYS_MS.length - 1);
    return COMMENT_VERIFY_GRACE_DELAYS_MS[graceIndex];
  };
  var RAIL_MAX_INDENT_DEPTH = 4;
  var READER_ICONS = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4.5 10.5 7.5-6 7.5 6"/><path d="M6.5 9.5V20h11V9.5"/><path d="M10 20v-5h4v5"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    like: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10.5v9H4.5a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z"/><path d="M7 11 10.6 4a2 2 0 0 1 3.8.9V9h4.1a2 2 0 0 1 2 2.4l-1.1 6.2a2.3 2.3 0 0 1-2.3 1.9H7"/></svg>',
    likeOn: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10.5v9H4.5a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z"/><path d="M7 11 10.6 4a2 2 0 0 1 3.8.9V9h4.1a2 2 0 0 1 2 2.4l-1.1 6.2a2.3 2.3 0 0 1-2.3 1.9H7"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8Z"/></svg>',
    starOn: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" aria-hidden="true"><path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8Z"/></svg>',
    comment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.3a7.4 7.4 0 0 1-7.5 7.3 8.4 8.4 0 0 1-2.8-.5L5 20l1.2-3.6A7 7 0 0 1 4.8 11a7.5 7.5 0 0 1 7.7-7.2A7.4 7.4 0 0 1 20 11.3Z"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="12" r="2.2"/><circle cx="17.5" cy="6" r="2.2"/><circle cx="17.5" cy="18" r="2.2"/><path d="m8.1 11 7.4-3.9M8.1 13l7.4 3.9"/></svg>',
    previous: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>',
    history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.2"/><path d="M12 7.6V12l3.1 1.9"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4.5V10h-5.4"/></svg>'
  };
  var READER_CSS = `
  :root {
    --heybox-up-reading-line-height: 1.7;
    --hbu-reader-stage: 732px;
    /* Viewport-pinned history column on desktop. */
    --hbu-reader-history-width: clamp(240px, 22vw, 300px);
    /* Light preset. It is also the fallback set every other preset overrides. */
    --hbu-reader-bg: #e9eef3;
    --hbu-reader-page: #fff;
    --hbu-reader-subtle: #f1f4f7;
    --hbu-reader-ink: #14191e;
    --hbu-reader-ink-2: #3c444c;
    --hbu-reader-muted: #5f6b77;
    --hbu-reader-border: rgba(20, 25, 30, .12);
    --hbu-reader-glow: transparent;
    --hbu-reader-accent: #6f8db3;
    --hbu-reader-on-accent: #10161c;
    --hbu-reader-link: #4a678d;
    --hbu-reader-glass: #fff;
    --hbu-reader-glass-ink: #14191e;
    --hbu-reader-glass-border: rgba(20, 25, 30, .12);
    --hbu-reader-head: var(--hbu-reader-page);
    --hbu-reader-float: rgba(255, 255, 255, .98);
    --hbu-reader-float-ink: #14191e;
    --hbu-reader-float-border: rgba(20, 25, 30, .14);
    --hbu-reader-float-hover: rgba(20, 25, 30, .06);
    --hbu-reader-float-muted: #5a6572;
    --hbu-reader-active-like: #c0364e;
    --hbu-reader-active-favour: #8a6512;
    --hbu-reader-active-cy: #2f7a52;
    --hbu-reader-danger: #c0364e;
    --hbu-reader-scrim: rgba(20, 25, 30, .42);
    --hbu-reader-shadow: 0 8px 24px rgba(16, 24, 40, .12);
  }
  :root.heybox-up-theme[data-heybox-up-dark="true"] {
    --hbu-reader-bg: #080b0f;
    --hbu-reader-page: #12181f;
    --hbu-reader-subtle: #1b232c;
    --hbu-reader-ink: #e6edf5;
    --hbu-reader-ink-2: #b7c2ce;
    --hbu-reader-muted: #8b99a8;
    --hbu-reader-border: #2b3642;
    --hbu-reader-glow: transparent;
    --hbu-reader-accent: #8fb0cf;
    --hbu-reader-on-accent: #10161c;
    --hbu-reader-link: #8fb0cf;
    --hbu-reader-glass: #151c24;
    --hbu-reader-glass-ink: #e6edf5;
    --hbu-reader-glass-border: rgba(230, 237, 245, .14);
    --hbu-reader-head: var(--hbu-reader-page);
    --hbu-reader-float: rgba(21, 28, 36, .97);
    --hbu-reader-float-ink: #e6edf5;
    --hbu-reader-float-border: #2b3642;
    --hbu-reader-float-hover: rgba(230, 237, 245, .1);
    --hbu-reader-float-muted: #9dabb9;
    --hbu-reader-active-like: #ff8e9a;
    --hbu-reader-active-favour: #f0c56a;
    --hbu-reader-active-cy: #8fd0a8;
    --hbu-reader-danger: #ff8e9a;
    --hbu-reader-scrim: rgba(2, 4, 7, .62);
    --hbu-reader-shadow: 0 8px 24px rgba(0, 0, 0, .28);
  }
  :root.heybox-up-theme[data-heybox-up-theme="oled"] {
    --hbu-reader-bg: #000;
    --hbu-reader-page: #090909;
    --hbu-reader-subtle: #141414;
    --hbu-reader-border: #242424;
    --hbu-reader-glow: transparent;
    --hbu-reader-accent: #a8c0d8;
    --hbu-reader-on-accent: #05070a;
    --hbu-reader-link: #a8c0d8;
    --hbu-reader-glass: #101010;
    --hbu-reader-glass-border: rgba(230, 237, 245, .14);
    --hbu-reader-head: var(--hbu-reader-page);
    --hbu-reader-float: rgba(12, 12, 12, .97);
    --hbu-reader-float-ink: #e6edf5;
    --hbu-reader-float-border: #242424;
    --hbu-reader-float-hover: rgba(230, 237, 245, .1);
    --hbu-reader-float-muted: #9dabb9;
    --hbu-reader-active-like: #ff8e9a;
    --hbu-reader-active-favour: #f0c56a;
    --hbu-reader-active-cy: #8fd0a8;
    --hbu-reader-danger: #ff8e9a;
    --hbu-reader-scrim: rgba(0, 0, 0, .74);
    --hbu-reader-shadow: 0 8px 24px rgba(0, 0, 0, .55);
  }
  :root.heybox-up-theme[data-heybox-up-theme="paper"] {
    --hbu-reader-bg: #e7dfd0;
    --hbu-reader-page: #faf5ea;
    --hbu-reader-subtle: #f2eadb;
    --hbu-reader-ink: #332b21;
    --hbu-reader-ink-2: #5b5042;
    --hbu-reader-muted: #726451;
    --hbu-reader-border: #ddd0bc;
    --hbu-reader-glow: transparent;
    --hbu-reader-accent: #7b6244;
    --hbu-reader-on-accent: #fffdf7;
    --hbu-reader-link: #7b6244;
    --hbu-reader-glass: #faf5ea;
    --hbu-reader-glass-ink: #332b21;
    --hbu-reader-glass-border: rgba(51, 43, 33, .16);
    --hbu-reader-head: var(--hbu-reader-page);
    --hbu-reader-float: rgba(255, 253, 247, .98);
    --hbu-reader-float-ink: #332b21;
    --hbu-reader-float-border: #ddd0bc;
    --hbu-reader-float-hover: rgba(51, 43, 33, .07);
    --hbu-reader-float-muted: #6a5d4b;
    --hbu-reader-active-like: #b23a4c;
    --hbu-reader-active-favour: #7d5a16;
    --hbu-reader-active-cy: #2e6d4c;
    --hbu-reader-danger: #b23a4c;
    --hbu-reader-scrim: rgba(51, 43, 33, .46);
    --hbu-reader-shadow: 0 6px 18px rgba(51, 43, 33, .12);
  }
  :root.heybox-up-theme[data-heybox-up-theme="mist"] {
    --hbu-reader-bg: #dde8ea;
    --hbu-reader-page: #f7fbfb;
    --hbu-reader-subtle: #eaf2f3;
    --hbu-reader-ink: #1d3338;
    --hbu-reader-ink-2: #405a60;
    --hbu-reader-muted: #567076;
    --hbu-reader-border: #cbdcdf;
    --hbu-reader-glow: transparent;
    --hbu-reader-accent: #40646d;
    --hbu-reader-on-accent: #fff;
    --hbu-reader-link: #40646d;
    --hbu-reader-glass: #fbfdfd;
    --hbu-reader-glass-ink: #1d3338;
    --hbu-reader-glass-border: rgba(29, 51, 56, .16);
    --hbu-reader-head: var(--hbu-reader-page);
    --hbu-reader-float: rgba(252, 254, 254, .98);
    --hbu-reader-float-ink: #1d3338;
    --hbu-reader-float-border: #cbdcdf;
    --hbu-reader-float-hover: rgba(29, 51, 56, .07);
    --hbu-reader-float-muted: #4f686e;
    --hbu-reader-active-like: #b83c50;
    --hbu-reader-active-favour: #83601a;
    --hbu-reader-active-cy: #2b6f55;
    --hbu-reader-danger: #b83c50;
    --hbu-reader-scrim: rgba(29, 51, 56, .44);
    --hbu-reader-shadow: 0 6px 18px rgba(47, 74, 84, .12);
  }
  body.heybox-up-reader {
    overflow: hidden !important;
    background: var(--hbu-reader-bg) !important;
  }
  body.heybox-up-reader .nav,
  body.heybox-up-reader .hb-bbs-link__header {
    display: none !important;
  }
  /* The custom panel is the only comment surface in the reader; the native drawer
     and its reply box stay in the DOM but never paint. */
  body.heybox-up-reader #page-bbs-link .link-comment,
  body.heybox-up-reader .hb-bbs-link__reply-target { display: none !important; }
  body.heybox-up-reader #page-bbs-link {
    position: fixed !important;
    inset: 0 !important;
    z-index: 4000;
    display: flex !important;
    justify-content: center;
    width: 100% !important;
    height: 100% !important;
    background: var(--hbu-reader-bg) !important;
  }
  body.heybox-up-reader #page-bbs-link .content,
  body.heybox-up-reader #page-bbs-link .list,
  body.heybox-up-reader #page-bbs-link .hb-bbs-link,
  body.heybox-up-reader #page-bbs-link .hb-bbs-link__container,
  body.heybox-up-reader #page-bbs-link .hb-bbs-link__content {
    display: block !important;
    width: 100% !important;
    max-width: none !important;
    height: 100% !important;
    min-width: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }
  body.heybox-up-reader .hb-bbs-image-text,
  body.heybox-up-reader .hb-bbs-post,
  body.heybox-up-reader .hb-bbs__video { display: none !important; }
  body.heybox-up-reader .cpt-right-side.right { display: none !important; }
  /* The reader sits at 4001, so lift the site confirmation dialog above it. */
  body.heybox-up-reader .alert-container-wrapper .hb-cpt__alert-wrapper { z-index: 4100 !important; }
  #${READER_ID} {
    position: fixed;
    top: 0;
    left: 50%;
    z-index: 4001;
    width: min(calc(var(--hbu-reader-stage) + 80px), 100%);
    height: 100%;
    height: 100dvh;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) 46px;
    transform: translateX(-50%);
    background: var(--hbu-reader-page);
    color: var(--hbu-reader-ink);
    box-shadow: var(--hbu-reader-shadow);
    font: 16px/1.6 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
    -webkit-font-smoothing: antialiased;
    isolation: isolate;
  }
  #${READER_ID} *, #${READER_ID} *::before, #${READER_ID} *::after { box-sizing: border-box; }
  #${READER_ID} :is(button, a, [role="button"]) { -webkit-tap-highlight-color: transparent; }
  #${READER_ID} :is(button, a, [role="button"]):focus-visible {
    outline: 2px solid var(--hbu-reader-accent);
    outline-offset: 2px;
  }
  .hbu-reader-scroll {
    position: relative;
    grid-row: 2;
    width: calc(100% - 80px);
    /* The toolbar and progress bar own separate rows outside the scrollport. */
    height: 100%;
    min-height: 0;
    container-type: size;
    overflow-x: hidden;
    overflow-y: auto;
    margin-inline: auto;
    overscroll-behavior: contain;
    scrollbar-width: none;
    scroll-behavior: smooth;
  }
  .hbu-reader-scroll::-webkit-scrollbar { display: none; }
  .hbu-reader-page {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 0;
    padding: 44px 60px 72px;
    background: var(--hbu-reader-page);
  }
  /* 文本页不再用页内边距撑开段距：上下内边距归零，由段落自身的下间距形成
     统一的 .72em 节奏，跨页处也只保留一次段间距，避免 64px 的叠加空隙。 */
  .hbu-reader-page[data-kind="text"] { padding: 0 60px; }
  .hbu-reader-page[data-kind="heading"] { padding: 56px 60px 28px; }
  .hbu-reader-page[data-kind="hero"] { min-height: 100cqh; padding: 0; }
  .hbu-reader-page[data-kind="end"] { min-height: 100cqh; }
  .hbu-reader-page[data-kind="text"] .hbu-reader-copy,
  .hbu-reader-page[data-kind="heading"] .hbu-reader-copy {
    width: min(34em, 100%);
    font-size: 18px;
    line-height: var(--heybox-up-reading-line-height);
    color: var(--hbu-reader-ink);
    overflow-wrap: anywhere;
  }
  .hbu-reader-page[data-kind="text"] .hbu-reader-copy { white-space: normal; }
  .hbu-reader-page[data-kind="heading"] .hbu-reader-copy { white-space: pre-wrap; }
  .hbu-reader-page[data-kind="text"] .hbu-reader-copy p { margin: 0 0 .72em; }
  .hbu-reader-page[data-kind="heading"] { justify-content: center; }
  .hbu-reader-page[data-kind="heading"] .hbu-reader-copy {
    font-size: 27px;
    line-height: 1.42;
    font-weight: 700;
    letter-spacing: -.015em;
  }
  .hbu-reader-page[data-kind="rich"] {
    align-items: stretch;
    justify-content: flex-start;
    padding-top: 40px;
  }
  .hbu-reader-rich {
    width: 100%;
    min-width: 0;
    font-size: 18px;
    line-height: var(--heybox-up-reading-line-height);
    color: var(--hbu-reader-ink);
    white-space: normal !important;
    overflow-wrap: anywhere;
    word-break: normal;
  }
  .hbu-reader-rich img[class*="emoji"], .hbu-reader-rich [class*="emoji"] img { display: inline-block !important; width: 1.2em !important; height: 1.2em !important; max-width: 1.2em !important; max-height: 1.2em !important; object-fit: contain; vertical-align: -0.2em; }
  /* The cloned markup keeps a hard-coded 25px line height; cover body text only so
     cards and blockquotes keep their own styles. */
  .hbu-reader-rich :is(p, li, ul, ol, .line, .order-line, .text):not([class*="com-"], [class*="com-"] *):not(blockquote, blockquote *) {
    line-height: var(--heybox-up-reading-line-height) !important;
  }
  .hbu-reader-rich :is(h1, h2, h3, h4, h5, h6) { margin: 0 0 .7em; font-size: 22px; line-height: 1.45; }
  .hbu-reader-rich :is(p, .text) { margin: 0 0 .72em; }
  .hbu-reader-rich :is(ul, ol, pre, blockquote, table) { margin: 0 0 1em; }
  .hbu-reader-rich figure { margin: 2rem 0; }
  .hbu-reader-rich figure > img { display: block; height: auto; margin-inline: auto; }
  .hbu-reader-rich figcaption { margin: .5rem 0 0; color: var(--hbu-reader-muted); font-size: .875em; }
  .hbu-reader-rich :is(ul, ol) { padding-left: 1.35em; }
  .hbu-reader-rich li + li { margin-top: .45em; }
  .hbu-reader-rich blockquote {
    padding: 2px 0 2px 15px;
    border-left: 3px solid var(--hbu-reader-accent);
    color: var(--hbu-reader-ink-2);
    line-height: 1.8;
  }
  .hbu-reader-rich blockquote :is(p, .text) { line-height: 1.8 !important; }
  .hbu-reader-rich pre {
    padding: 14px 16px;
    border: 1px solid var(--hbu-reader-border);
    border-radius: 12px;
    background: var(--hbu-reader-subtle);
    overflow-x: auto;
    font: 13px/1.6 ui-monospace, SFMono-Regular, Consolas, monospace;
  }
  .hbu-reader-rich :is(img, video, .hb-cpt__image, .com-game-card, .com-album-card, .com-award-table-card, .com-chatroom-card, .com-league-card, .com-match-card, .com-mod-card, .com-sku-card, .com-wiki-card) { max-width: 100%; border-radius: 14px; }
  .hbu-reader-rich :is(.com-game-card, .com-album-card, .com-award-table-card, .com-chatroom-card, .com-league-card, .com-match-card, .com-mod-card, .com-sku-card, .com-wiki-card) {
    background: var(--hbu-reader-subtle) !important;
    border-color: var(--hbu-reader-border) !important;
    color: var(--hbu-reader-ink) !important;
  }
  .hbu-reader-rich :is(a, .prose-link) { color: var(--hbu-reader-link); }
  /* Cloned article nodes keep their original dark text colors on nested paragraphs and list lines.
     Cards and blockquotes keep their own colors, matching the line-height exclusion above. */
  .hbu-reader-rich :is(p, li, ol, ul, .line, .order-line, .text):not([class*="com-"], [class*="com-"] *):not(blockquote, blockquote *) {
    color: var(--hbu-reader-ink) !important;
  }
  .hbu-reader-rich blockquote,
  .hbu-reader-rich blockquote :is(p, .text) {
    color: var(--hbu-reader-ink-2) !important;
  }
  /* Body images share the article surface and use whitespace instead of a letterbox. */
  .hbu-reader-page[data-kind="media"] { justify-content: flex-start; padding: 2rem 20px; background: var(--hbu-reader-page); }
  .hbu-reader-page[data-kind="media"] + .hbu-reader-page[data-kind="media"] { padding-top: 0; }
  .hbu-reader-page[data-kind="text"]:has(+ .hbu-reader-page[data-kind="media"]) .hbu-reader-copy > :last-child { margin-bottom: 0; }
  .hbu-reader-page[data-kind="embed"] { justify-content: flex-start; padding: 2rem 20px; background: #05070a; }
  .hbu-reader-page[data-kind="video"] { justify-content: flex-start; padding: 2rem 20px; background: #05070a; }
  .hbu-reader-page[data-kind="notice"] { justify-content: center; padding: 32px 24px 72px; background: var(--hbu-reader-page); }
  .hbu-reader-notice {
    width: min(520px, 100%);
    padding: 22px;
    border: 1px solid var(--hbu-reader-border);
    border-radius: 16px;
    background: var(--hbu-reader-subtle);
    color: var(--hbu-reader-ink);
    text-align: center;
  }
  .hbu-reader-notice h2 { margin: 0 0 8px; font-size: 17px; line-height: 1.4; }
  .hbu-reader-notice p { margin: 0; color: var(--hbu-reader-muted); font-size: 13px; line-height: 1.6; }
  .hbu-reader-notice a {
    display: inline-flex;
    align-items: center;
    min-height: 36px;
    margin-top: 14px;
    padding: 0 14px;
    border-radius: 9px;
    background: var(--hbu-reader-accent);
    color: var(--hbu-reader-on-accent);
    font-size: 12px;
    font-weight: 650;
    text-decoration: none;
  }
  .hbu-reader-embed {
    width: min(100%, 960px);
    margin: auto;
    overflow: hidden;
    background: #05070a;
    border-radius: 12px;
  }
  .hbu-reader-embed > * { width: 100% !important; height: 100% !important; margin: 0 !important; border: 0 !important; border-radius: 0 !important; }
  .hbu-reader-embed :is(iframe, video, embed, object) { display: block !important; width: 100% !important; height: 100% !important; border: 0 !important; }
  .hbu-reader-embed audio { display: block !important; width: 100% !important; height: auto !important; min-height: 54px !important; border: 0 !important; }
  .hbu-reader-media {
    display: block;
    max-width: 100%;
    max-height: none;
    width: auto;
    height: auto;
    object-fit: contain;
    margin: 0 auto;
    border-radius: 12px;
    cursor: zoom-in;
  }
  .hbu-reader-video {
    display: block;
    width: min(100%, 1120px);
    max-height: calc(100cqh - 4rem);
    margin: auto;
    aspect-ratio: 16 / 9;
    border-radius: 12px;
    background: #000;
    object-fit: contain;
    box-shadow: 0 18px 50px rgba(0, 0, 0, .35);
  }
  .hbu-reader-page[data-kind="hero"] {
    padding: 0;
    justify-content: flex-start;
    align-items: stretch;
    min-height: 100cqh;
    background: var(--hbu-reader-page);
    color: var(--hbu-reader-ink);
  }
  /* The cover is a stage plus a pager band: the band always owns its own row under the photo. */
  .hbu-reader-cover {
    position: relative;
    inset: auto;
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 240px;
    overflow: hidden;
    background: #05070a;
  }
  .hbu-reader-cover-stage { position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden; }
  .hbu-reader-cover-glow { position: absolute; inset: -48px; background-position: center; background-size: cover; filter: blur(42px) brightness(.5); transform: scale(1.1); }
  .hbu-reader-cover img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    opacity: 0;
    transition: opacity .32s ease;
    pointer-events: none;
  }
  .hbu-reader-cover img[data-active="true"] { opacity: 1; pointer-events: auto; }
  .hbu-reader-page[data-kind="hero"][data-cover="none"] { justify-content: center; }
  .hbu-reader-cover-nav {
    position: absolute;
    top: 50%;
    z-index: 2;
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    margin-top: -20px;
    border: 1px solid rgba(255, 255, 255, .22);
    border-radius: 50%;
    background: rgba(8, 11, 15, .46);
    color: #fff;
    cursor: pointer;
  }
  .hbu-reader-cover-nav svg { width: 19px; height: 19px; }
  .hbu-reader-cover-nav[data-side="prev"] { left: 16px; }
  .hbu-reader-cover-nav[data-side="next"] { right: 16px; }
  .hbu-reader-cover-nav[hidden] { display: none; }
  /* A blank strip below the photo holds the pager, so a dot never covers the picture. */
  .hbu-reader-cover-progress {
    position: relative;
    z-index: 2;
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    height: 32px;
    background: #05070a;
  }
  .hbu-reader-cover-progress[hidden] { display: none; }
  .hbu-reader-cover-dots {
    display: flex;
    gap: 0;
    align-items: center;
    max-width: 100%;
    height: 100%;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .hbu-reader-cover-dots::-webkit-scrollbar { display: none; }
  .hbu-reader-cover-dots button { position: relative; width: 36px; height: 32px; padding: 0; border: 0; background: transparent; cursor: pointer; }
  .hbu-reader-cover-dots button::after { content: ""; position: absolute; top: 50%; right: 8px; left: 8px; height: 3px; margin-top: -1.5px; border-radius: 99px; background: rgba(255, 255, 255, .38); }
  .hbu-reader-cover-dots button[aria-current="true"]::after { background: #fff; }
  .hbu-reader-caption {
    position: relative;
    z-index: 2;
    flex: none;
    width: 100%;
    margin: 0;
    padding: 22px 60px 64px;
    border: 0;
    border-radius: 0;
    background: var(--hbu-reader-page);
    color: var(--hbu-reader-ink);
  }
  .hbu-reader-kicker { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; margin-bottom: 13px; color: var(--hbu-reader-muted); font-size: 12px; line-height: 1.4; }
  .hbu-reader-kicker span { padding: 3px 9px; border: 1px solid var(--hbu-reader-border); border-radius: 99px; background: var(--hbu-reader-subtle); }
  .hbu-reader-title { display: -webkit-box; margin: 0 0 12px; overflow: hidden; color: var(--hbu-reader-ink); font-size: 31px; line-height: 1.28; font-weight: 750; letter-spacing: -.02em; text-wrap: balance; -webkit-box-orient: vertical; -webkit-line-clamp: 4; }
  .hbu-reader-byline { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; color: var(--hbu-reader-muted); font-size: 13px; }
  .hbu-reader-byline b { color: var(--hbu-reader-ink); font-weight: 600; }
  .hbu-reader-page[data-kind="end"] { justify-content: center; gap: 22px; background: var(--hbu-reader-page); }
  .hbu-reader-end-card { width: min(440px, 100%); padding: 24px; border: 1px solid var(--hbu-reader-border); border-radius: 20px; background: var(--hbu-reader-subtle); }
  .hbu-reader-end-head { display: flex; gap: 12px; align-items: center; }
  .hbu-reader-end-head img { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; background: var(--hbu-reader-page); }
  .hbu-reader-end-name { min-width: 0; flex: 1 1 auto; }
  .hbu-reader-end-name b { display: block; font-size: 15px; }
  .hbu-reader-end-name span { color: var(--hbu-reader-muted); font-size: 12px; }
  .hbu-reader-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 20px 0 18px; }
  .hbu-reader-stats div { padding: 10px 6px; border-radius: 12px; background: var(--hbu-reader-page); text-align: center; }
  .hbu-reader-stats b { display: block; font-size: 17px; }
  .hbu-reader-stats span { color: var(--hbu-reader-muted); font-size: 11px; }
  .hbu-reader-tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .hbu-reader-tag { min-height: 36px; padding: 7px 12px; border: 1px solid var(--hbu-reader-border); border-radius: 99px; background: transparent; color: var(--hbu-reader-ink-2); font: inherit; font-size: 12px; cursor: pointer; }
  .hbu-reader-related { width: min(440px, 100%); }
  .hbu-reader-related h2 { margin: 0 0 8px; color: var(--hbu-reader-muted); font-size: 11px; font-weight: 600; letter-spacing: .08em; }
  .hbu-reader-related a { display: flex; gap: 10px; min-width: 0; min-height: 44px; padding: 11px 13px; overflow-wrap: anywhere; word-break: break-word; border: 1px solid var(--hbu-reader-border); border-radius: 12px; color: var(--hbu-reader-ink); font-size: 13px; line-height: 1.5; text-decoration: none; }
  .hbu-reader-related a + a { margin-top: 6px; }
  .hbu-reader-related a:hover { background: var(--hbu-reader-subtle); }
  .hbu-reader-end-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
  .hbu-reader-end-actions button { display: inline-flex; align-items: center; gap: 6px; min-height: 38px; padding: 8px 14px; border: 1px solid var(--hbu-reader-border); border-radius: 99px; background: transparent; color: var(--hbu-reader-ink); font: inherit; font-size: 13px; cursor: pointer; }
  .hbu-reader-end-actions button[data-home] { border-color: transparent; background: var(--hbu-reader-ink); color: var(--hbu-reader-page); font-weight: 650; }
  .hbu-reader-end-actions button:disabled { opacity: .42; cursor: default; }
  .hbu-reader-end-actions button svg { width: 15px; height: 15px; }
  .hbu-reader-end-status { margin: 0; color: var(--hbu-reader-muted); font-size: 12px; line-height: 1.5; text-align: center; }
  .hbu-reader-end-status[hidden] { display: none; }
  @media (max-height: 820px) {
    .hbu-reader-page[data-kind="end"] { gap: 12px; padding-top: 64px; padding-bottom: 64px; }
    .hbu-reader-page[data-kind="end"] .hbu-reader-related { display: none; }
    .hbu-reader-end-card { padding: 18px; }
    .hbu-reader-stats { margin: 14px 0 12px; }
  }
  @media (max-height: 520px) {
    .hbu-reader-page[data-kind="end"] { padding-top: 48px; padding-bottom: 40px; }
    .hbu-reader-page[data-kind="end"] .hbu-reader-stats { display: none; }
    .hbu-reader-end-head img { width: 40px; height: 40px; }
  }
  .hbu-reader-head { position: relative; grid-row: 1; width: calc(100% - 80px); margin-inline: auto; z-index: 12; display: flex; gap: 9px; align-items: center; padding: 14px 16px; padding-top: max(14px, env(safe-area-inset-top)); background: var(--hbu-reader-head); color: var(--hbu-reader-glass-ink); pointer-events: none; }
  .hbu-reader-head > * { pointer-events: auto; }
  .hbu-reader-round { display: grid; place-items: center; width: 40px; height: 40px; flex: none; padding: 0; border: 1px solid var(--hbu-reader-glass-border); border-radius: 50%; background: var(--hbu-reader-glass); color: var(--hbu-reader-glass-ink); cursor: pointer; }
  .hbu-reader-round svg { width: 19px; height: 19px; }
  .hbu-reader-home { display: inline-flex; align-items: center; gap: 6px; height: 40px; flex: none; padding: 0 13px 0 10px; border: 1px solid var(--hbu-reader-glass-border); border-radius: 99px; background: var(--hbu-reader-glass); color: var(--hbu-reader-glass-ink); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
  .hbu-reader-home svg { width: 17px; height: 17px; flex: none; }
  .hbu-reader-head-author { display: flex; gap: 7px; align-items: center; min-width: 0; max-width: 42%; padding: 4px 10px 4px 4px; border: 1px solid var(--hbu-reader-glass-border); border-radius: 99px; background: var(--hbu-reader-glass); color: var(--hbu-reader-glass-ink); text-decoration: none; }
  .hbu-reader-head-author img { width: 30px; height: 30px; flex: none; border-radius: 50%; object-fit: cover; background: var(--hbu-reader-subtle); }
  .hbu-reader-head-author span { min-width: 0; overflow: hidden; font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
  .hbu-reader-follow { min-width: 56px; height: 36px; padding: 0 13px; border: 0; border-radius: 99px; background: var(--hbu-reader-accent); color: var(--hbu-reader-on-accent); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
  .hbu-reader-follow[aria-pressed="true"] { background: var(--hbu-reader-float-hover); color: var(--hbu-reader-glass-ink); }
  .hbu-reader-head-spacer { flex: 1 1 auto; }
  .hbu-reader-rail { position: absolute; right: -32px; bottom: 118px; z-index: 11; display: flex; flex-direction: column; gap: 13px; align-items: center; }
  .hbu-reader-action { display: grid; place-items: center; width: 48px; min-height: 48px; padding: 4px 0; border: 1px solid var(--hbu-reader-glass-border); border-radius: 50%; background: var(--hbu-reader-glass); color: var(--hbu-reader-glass-ink); cursor: pointer; }
  .hbu-reader-action:hover { background: var(--hbu-reader-float-hover); }
  .hbu-reader-action svg { width: 21px; height: 21px; }
  .hbu-reader-action[aria-pressed="true"] { color: var(--hbu-reader-active-like); }
  .hbu-reader-action[data-action="favour"][aria-pressed="true"] { color: var(--hbu-reader-active-favour); }
  .hbu-reader-action[data-action="cy"][aria-pressed="true"] { color: var(--hbu-reader-active-cy); }
  .hbu-reader-action--cy { display: flex; flex-direction: column; gap: 1px; align-items: center; justify-content: center; }
  .hbu-reader-cy-label { font-size: 11px; font-weight: 700; line-height: 1; letter-spacing: .02em; }
  .hbu-reader-cy-count { font-size: 11px; font-weight: 700; line-height: 1; letter-spacing: .01em; opacity: .72; font-variant-numeric: tabular-nums; }
  .hbu-reader-rail-avatar { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
  .hbu-reader-favour-menu {
    position: absolute;
    right: calc(100% + 10px);
    bottom: 92px;
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 248px;
    max-width: calc(100vw - 84px);
    max-height: min(420px, 64dvh);
    padding: 10px;
    border: 1px solid var(--hbu-reader-float-border);
    border-radius: 14px;
    background: var(--hbu-reader-float);
    color: var(--hbu-reader-float-ink);
    box-shadow: var(--hbu-reader-shadow);
  }
  .hbu-reader-favour-menu[hidden] { display: none; }
  .hbu-reader-favour-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .hbu-reader-favour-head > span { font-size: 13px; font-weight: 600; }
  .hbu-reader-favour-close {
    width: 24px; height: 24px; padding: 0; border: 0; border-radius: 7px;
    background: transparent; color: inherit; font: inherit; font-size: 16px; line-height: 1; cursor: pointer;
  }
  .hbu-reader-favour-close:hover { background: var(--hbu-reader-float-hover); }
  .hbu-reader-favour-status { min-height: 16px; font-size: 12px; line-height: 1.5; color: var(--hbu-reader-float-muted); }
  .hbu-reader-favour-status[data-tone="error"] { color: var(--hbu-reader-danger); }
  .hbu-reader-favour-list { display: flex; flex-direction: column; gap: 2px; min-height: 0; overflow-y: auto; }
  .hbu-reader-favour-option { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; cursor: pointer; }
  .hbu-reader-favour-option:hover { background: var(--hbu-reader-float-hover); }
  .hbu-reader-favour-option input { flex: none; width: 14px; height: 14px; margin: 0; accent-color: var(--hbu-reader-accent); cursor: pointer; }
  .hbu-reader-favour-name { min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
  .hbu-reader-favour-tag {
    flex: none; padding: 1px 5px; border-radius: 5px;
    background: var(--hbu-reader-float-hover); color: var(--hbu-reader-float-muted); font-size: 10px;
  }
  .hbu-reader-favour-empty { padding: 8px; color: var(--hbu-reader-float-muted); font-size: 12px; line-height: 1.5; }
  .hbu-reader-favour-create { display: flex; gap: 6px; }
  .hbu-reader-favour-create-input {
    min-width: 0; flex: 1 1 auto; height: 30px; padding: 0 8px;
    border: 1px solid var(--hbu-reader-float-border); border-radius: 8px; outline: none;
    background: var(--hbu-reader-float-hover); color: inherit; font: inherit; font-size: 12px;
  }
  .hbu-reader-favour-create-input:focus { border-color: var(--hbu-reader-accent); }
  .hbu-reader-favour-create-btn, .hbu-reader-favour-save {
    height: 30px; padding: 0 12px; border: 1px solid var(--hbu-reader-float-border); border-radius: 8px;
    background: var(--hbu-reader-float-hover); color: inherit; font: inherit; font-size: 12px; cursor: pointer;
  }
  .hbu-reader-favour-create-btn:hover:not(:disabled) { border-color: var(--hbu-reader-accent); }
  .hbu-reader-favour-actions { display: flex; justify-content: flex-end; }
  .hbu-reader-favour-save { min-width: 64px; border-color: var(--hbu-reader-accent); background: var(--hbu-reader-accent); color: #fff; font-weight: 600; }
  .hbu-reader-favour-save:hover:not(:disabled) { filter: brightness(1.08); }
  .hbu-reader-favour-menu :is(button, input):disabled { cursor: default; opacity: .5; }
  .hbu-reader-spacing-menu { position: absolute; right: calc(100% + 10px); bottom: 0; z-index: 2; width: 248px; max-width: calc(100vw - 84px); padding: 10px; border: 1px solid var(--hbu-reader-float-border); border-radius: 14px; background: var(--hbu-reader-float); color: var(--hbu-reader-float-ink); box-shadow: var(--hbu-reader-shadow); backdrop-filter: blur(12px); }
  .hbu-reader-spacing-menu[hidden] { display: none; }
  .hbu-reader-spacing-label { margin-bottom: 8px; font-size: 12px; font-weight: 600; color: var(--hbu-reader-float-ink); }
  .hbu-reader-spacing-row { display: flex; gap: 7px; align-items: center; }
  .hbu-reader-spacing-row input { width: 70px; height: 32px; padding: 0 8px; border: 1px solid var(--hbu-reader-float-border); border-radius: 8px; outline: none; background: var(--hbu-reader-float-hover); color: inherit; font: inherit; font-size: 13px; font-variant-numeric: tabular-nums; }
  .hbu-reader-spacing-row input:focus { border-color: var(--hbu-reader-accent); }
  .hbu-reader-spacing-unit { font-size: 12px; color: var(--hbu-reader-float-muted); }
  .hbu-reader-spacing-reset { height: 32px; margin-left: auto; padding: 0 9px; border: 1px solid var(--hbu-reader-float-border); border-radius: 8px; background: transparent; color: inherit; font: inherit; font-size: 12px; cursor: pointer; }
  .hbu-reader-spacing-reset:hover { background: var(--hbu-reader-float-hover); }
  .hbu-reader-setting-section + .hbu-reader-setting-section { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--hbu-reader-float-border); }
  .hbu-reader-setting-line { display: flex; gap: 8px; align-items: center; min-height: 32px; color: var(--hbu-reader-float-muted); font-size: 12px; }
  .hbu-reader-setting-line input[type="number"] { width: 76px; height: 30px; margin-left: auto; padding: 0 7px; border: 1px solid var(--hbu-reader-float-border); border-radius: 8px; outline: none; background: var(--hbu-reader-float-hover); color: var(--hbu-reader-float-ink); font: inherit; font-variant-numeric: tabular-nums; }
  .hbu-reader-setting-line input[type="number"]:focus { border-color: var(--hbu-reader-accent); }
  .hbu-reader-setting-switch { display: flex; gap: 8px; align-items: center; width: 100%; min-height: 32px; padding: 0; border: 0; background: transparent; color: var(--hbu-reader-float-ink); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
  .hbu-reader-setting-switch::after { content: ""; width: 28px; height: 16px; margin-left: auto; border: 1px solid var(--hbu-reader-float-border); border-radius: 99px; background: var(--hbu-reader-float-hover); }
  .hbu-reader-setting-switch[aria-checked="true"]::after { border-color: var(--hbu-reader-accent); background: var(--hbu-reader-accent); }
  /* The timeline is a docked sidecar outside the centered article stage. */
  .hbu-reader-history-menu { position: absolute; top: 0; right: calc(-1 * var(--hbu-reader-history-width)); bottom: 0; z-index: 13; display: flex; flex-direction: column; gap: 10px; width: var(--hbu-reader-history-width); padding: 18px 16px 20px; overflow: hidden; border-left: 1px solid var(--hbu-reader-border); background: var(--hbu-reader-page); color: var(--hbu-reader-ink); }
  .hbu-reader-history-head { display: flex; flex: none; gap: 8px; align-items: flex-start; justify-content: space-between; }
  .hbu-reader-history-head-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .hbu-reader-history-close { display: none; place-items: center; width: 30px; height: 30px; flex: none; padding: 0; border: 1px solid var(--hbu-reader-border); border-radius: 50%; background: transparent; color: var(--hbu-reader-muted); cursor: pointer; }
  .hbu-reader-history-close:hover { border-color: var(--hbu-reader-accent); color: var(--hbu-reader-ink); }
  .hbu-reader-history-close svg { width: 15px; height: 15px; }
  .hbu-reader-history-label { font-size: 14px; font-weight: 700; color: var(--hbu-reader-ink); }
  .hbu-reader-history-meta { color: var(--hbu-reader-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  /* The feed-style rail on the right of the menu: a fixed-height track with one
     draggable thumb that prints the current position as x/n. */
  .hbu-reader-history-body { display: flex; flex: 1 1 auto; gap: 8px; align-items: stretch; min-height: 0; }
  .hbu-reader-history-rail { position: relative; flex: none; width: 52px; touch-action: none; user-select: none; }
  .hbu-reader-history-track { position: absolute; top: 8px; bottom: 8px; left: 50%; width: 2px; margin-left: -1px; border-radius: 99px; background: var(--hbu-reader-border); cursor: pointer; }
  .hbu-reader-history-tick { position: absolute; left: calc(50% - 2px); width: 4px; height: 4px; margin-top: -2px; border-radius: 50%; background: var(--hbu-reader-border); }
  .hbu-reader-history-thumb { position: absolute; top: 0; left: 50%; display: grid; place-items: center; min-width: 42px; height: 22px; padding: 0 6px; translate: -50% -50%; border: 1px solid var(--hbu-reader-accent); border-radius: 99px; background: var(--hbu-reader-page); color: var(--hbu-reader-accent); font: inherit; font-size: 11px; font-weight: 650; font-variant-numeric: tabular-nums; line-height: 1; cursor: grab; box-shadow: 0 6px 16px rgba(0, 0, 0, .18); touch-action: none; }
  .hbu-reader-history-thumb[data-dragging="true"] { cursor: grabbing; }
  .hbu-reader-history-thumb:focus-visible { outline: 2px solid var(--hbu-reader-accent); outline-offset: 2px; }
  .hbu-reader-history-thumb[data-preview="true"] { border-color: var(--hbu-reader-ink); color: var(--hbu-reader-ink); }
  .hbu-reader-history-peek { flex: none; min-height: 15px; overflow: hidden; color: var(--hbu-reader-muted); font-size: 11px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
  .hbu-reader-history-list { display: flex; flex: 1 1 auto; flex-direction: column; gap: 1px; min-height: 0; margin: 0; padding: 0 0 0 2px; overflow-y: auto; list-style: none; }
  .hbu-reader-history-item { position: relative; display: flex; padding-left: 13px; }
  /* A single continuous rule carries the visit order between rows. */
  .hbu-reader-history-item::before { content: ""; position: absolute; top: 0; bottom: 0; left: 3px; width: 1px; background: var(--hbu-reader-border); }
  .hbu-reader-history-item:first-child::before { top: 50%; }
  .hbu-reader-history-item:last-child::before { bottom: 50%; }
  .hbu-reader-history-dot { position: absolute; top: 50%; left: -13px; width: 7px; height: 7px; margin-top: -3.5px; margin-left: 3px; translate: -3px 0; border-radius: 50%; background: var(--hbu-reader-border); }
  .hbu-reader-history-row { position: relative; display: flex; gap: 6px; align-items: center; width: 100%; min-height: 36px; padding: 6px 8px; border: 0; border-radius: 8px; background: transparent; color: inherit; font: inherit; font-size: 12px; line-height: 1.5; text-align: left; cursor: pointer; }
  .hbu-reader-history-row:hover { background: var(--hbu-reader-subtle); }
  .hbu-reader-history-title { display: -webkit-box; min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: normal; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
  .hbu-reader-history-progress { flex: none; min-width: 30px; color: var(--hbu-reader-muted); font-size: 10px; font-variant-numeric: tabular-nums; text-align: right; }
  /* A hairline under each row turns the list into a visual reading record. */
  .hbu-reader-history-bar { position: absolute; right: 8px; bottom: 3px; left: 8px; height: 2px; overflow: hidden; border-radius: 2px; background: var(--hbu-reader-border); opacity: .55; }
  .hbu-reader-history-bar > i { display: block; height: 100%; border-radius: inherit; background: var(--hbu-reader-accent); }
  .hbu-reader-history-row[aria-current="true"] { background: var(--hbu-reader-subtle); color: var(--hbu-reader-accent); font-weight: 650; }
  .hbu-reader-history-row[data-preview="true"] { outline: 1px solid var(--hbu-reader-ink); outline-offset: -1px; background: var(--hbu-reader-subtle); }
  .hbu-reader-history-current { flex: none; padding: 2px 5px; border-radius: 5px; background: var(--hbu-reader-glow); color: var(--hbu-reader-accent); font-size: 10px; font-weight: 650; }
  .hbu-reader-history-item[data-current="true"] .hbu-reader-history-dot { background: var(--hbu-reader-accent); }
  .hbu-reader-history-empty { padding: 6px 8px; color: var(--hbu-reader-muted); font-size: 12px; line-height: 1.5; }
  .hbu-reader-cy-dialog { position: absolute; inset: 0; z-index: 60; display: grid; place-items: center; padding: 24px; background: var(--hbu-reader-scrim); backdrop-filter: blur(4px); }
  .hbu-reader-cy-dialog[hidden] { display: none; }
  .hbu-reader-cy-card { width: min(520px, 100%); padding: 20px; border: 1px solid var(--hbu-reader-border); border-radius: 20px; background: var(--hbu-reader-page); color: var(--hbu-reader-ink); box-shadow: var(--hbu-reader-shadow); }
  .hbu-reader-cy-head { display: flex; gap: 12px; align-items: center; justify-content: space-between; margin-bottom: 12px; font-size: 15px; font-weight: 700; }
  .hbu-reader-cy-close { display: grid; place-items: center; width: 36px; height: 36px; padding: 0; border: 1px solid var(--hbu-reader-border); border-radius: 50%; background: transparent; color: inherit; cursor: pointer; }
  .hbu-reader-cy-close svg { width: 16px; height: 16px; }
  .hbu-reader-cy-text { width: 100%; min-height: 132px; padding: 12px; resize: vertical; border: 1px solid var(--hbu-reader-border); border-radius: 12px; outline: none; background: var(--hbu-reader-subtle); color: inherit; font: inherit; line-height: 1.6; }
  .hbu-reader-cy-text:focus { border-color: var(--hbu-reader-accent); }
  .hbu-reader-cy-status { min-height: 18px; margin-top: 8px; color: var(--hbu-reader-muted); font-size: 12px; }
  .hbu-reader-cy-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
  .hbu-reader-cy-actions button { min-height: 36px; padding: 0 16px; border: 1px solid var(--hbu-reader-border); border-radius: 10px; background: transparent; color: inherit; font: inherit; font-size: 13px; cursor: pointer; }
  .hbu-reader-cy-actions button[data-primary] { border-color: transparent; background: var(--hbu-reader-accent); color: var(--hbu-reader-on-accent); font-weight: 650; }
  .hbu-reader-cy-actions button:disabled { opacity: .55; cursor: default; }
  .hbu-reader-action-count { display: block; margin-top: 2px; font-size: 10px; font-variant-numeric: tabular-nums; line-height: 1.2; }
  .hbu-reader-progress { position: relative; grid-row: 3; width: calc(100% - 80px); margin-inline: auto; z-index: 10; display: flex; gap: 10px; align-items: center; height: 46px; padding: 0 18px; background: linear-gradient(0deg, var(--hbu-reader-glass), transparent); color: var(--hbu-reader-glass-ink); font-size: 11px; font-variant-numeric: tabular-nums; pointer-events: none; }
  .hbu-reader-progress-bar { flex: 1 1 auto; height: 2px; overflow: hidden; border-radius: 99px; background: var(--hbu-reader-glass-border); }
  .hbu-reader-progress-bar i { display: block; width: 0; height: 100%; background: var(--hbu-reader-accent); transition: width .2s linear; }
  .hbu-reader-hint { color: var(--hbu-reader-float-muted); white-space: nowrap; }
  body.${READER_CLASS} #${PAGER_ID} { display: none !important; }
  .hbu-reader-comments-panel { position: fixed; inset: 0; z-index: 4065; display: flex; justify-content: flex-end; }
  .hbu-reader-comments-panel[hidden] { display: none; }
  .hbu-reader-comments-scrim { position: absolute; inset: 0; background: var(--hbu-reader-scrim); }
  .hbu-reader-comments-sheet { position: relative; z-index: 1; display: flex; flex-direction: column; width: min(440px, 100vw); height: 100%; height: 100dvh; border-left: 1px solid var(--hbu-reader-border); background: var(--hbu-reader-page); color: var(--hbu-reader-ink); font: 16px/1.6 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; box-shadow: var(--hbu-reader-shadow); }
  .hbu-reader-comments-panel :is(button, a):focus-visible { outline: 2px solid var(--hbu-reader-accent); outline-offset: 2px; }
  .hbu-reader-comments-head { display: flex; gap: 12px; align-items: center; padding: 18px 16px 13px; border-bottom: 1px solid var(--hbu-reader-border); }
  .hbu-reader-comments-heading { min-width: 0; flex: 1 1 auto; }
  .hbu-reader-comments-heading b { display: block; font-size: 15px; }
  .hbu-reader-comments-heading span { color: var(--hbu-reader-muted); font-size: 11px; }
  .hbu-reader-comments-close { display: grid; place-items: center; width: 36px; height: 36px; flex: none; padding: 0; border: 1px solid var(--hbu-reader-border); border-radius: 50%; background: transparent; color: inherit; cursor: pointer; }
  .hbu-reader-comments-close svg { width: 16px; height: 16px; }
  .hbu-reader-comments-refresh { display: grid; place-items: center; width: 36px; height: 36px; flex: none; padding: 0; border: 1px solid var(--hbu-reader-border); border-radius: 50%; background: transparent; color: var(--hbu-reader-muted); cursor: pointer; }
  .hbu-reader-comments-refresh:hover { color: inherit; border-color: var(--hbu-reader-accent); }
  .hbu-reader-comments-refresh:disabled { opacity: .55; cursor: default; }
  .hbu-reader-comments-refresh svg { width: 16px; height: 16px; }
  .hbu-reader-comments-refresh[data-busy="true"] svg { animation: hbu-reader-spin .9s linear infinite; }
  @keyframes hbu-reader-spin { to { transform: rotate(360deg); } }
  .hbu-reader-comments-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 4px 16px 18px; }
  .hbu-reader-comments-list { margin: 0; padding: 0; list-style: none; }
  .hbu-reader-comments-item { display: flex; gap: 10px; padding: 14px 0; border-bottom: 1px solid var(--hbu-reader-border); }
  .hbu-reader-comments-item:last-child { border-bottom: 0; }
  .hbu-reader-comments-avatar-link { display: block; width: 34px; height: 34px; flex: none; border-radius: 50%; }
  .hbu-reader-comments-avatar-link--child { width: 24px; height: 24px; }
  .hbu-reader-comments-avatar { display: block; width: 100%; height: 100%; border-radius: 50%; object-fit: cover; background: var(--hbu-reader-subtle); }
  .hbu-reader-comments-main { min-width: 0; flex: 1 1 auto; }
  .hbu-reader-comments-who { display: flex; flex-wrap: wrap; gap: 7px; align-items: baseline; }
  .hbu-reader-comments-name { font-size: 13px; font-weight: 650; }
  .hbu-reader-comments-name-link { color: inherit; text-decoration: none; }
  .hbu-reader-comments-name-link:hover .hbu-reader-comments-name { color: var(--hbu-reader-link); text-decoration: underline; }
  .hbu-reader-comments-time { color: var(--hbu-reader-muted); font-size: 11px; }
  .hbu-reader-comments-text { margin: 4px 0 0; font-size: 14px; line-height: 1.68; white-space: pre-wrap; overflow-wrap: anywhere; }
  .hbu-reader-comments-meta { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 5px; color: var(--hbu-reader-muted); font-size: 11px; }
  .hbu-reader-comments-reply { flex: none; padding: 0; border: 0; background: transparent; color: var(--hbu-reader-muted); font: inherit; font-size: 11px; cursor: pointer; }
  .hbu-reader-comments-reply:hover { color: var(--hbu-reader-link); }
  .hbu-reader-comments-delete { flex: none; padding: 0; border: 0; background: transparent; color: var(--hbu-reader-muted); font: inherit; font-size: 11px; cursor: pointer; }
  .hbu-reader-comments-delete:hover { color: var(--hbu-reader-danger); }
  .hbu-reader-comments-delete:disabled { opacity: .55; cursor: default; }
  .hbu-reader-comments-children { margin: 8px 0 0; padding: 0 0 0 13px; border-left: 1px solid var(--hbu-reader-border); list-style: none; }
  .hbu-reader-comments-child { position: relative; padding: 7px 0 0; }
  .hbu-reader-comments-child::before { content: ""; position: absolute; top: 19px; left: -13px; width: 11px; height: 1px; background: var(--hbu-reader-border); }
  .hbu-reader-comments-child:first-child { padding-top: 0; }
  .hbu-reader-comments-child:first-child::before { top: 12px; }
  .hbu-reader-comments-child-row { display: flex; gap: 8px; align-items: flex-start; }
  .hbu-reader-comments-child-main { min-width: 0; flex: 1 1 auto; }
  .hbu-reader-comments-reply-to { color: var(--hbu-reader-muted); font-size: 11px; }
  .hbu-reader-comments-child .hbu-reader-comments-text { margin-top: 2px; font-size: 13px; }
  .hbu-reader-comments-child .hbu-reader-comments-meta { margin-top: 3px; }
  .hbu-reader-comments-collapse { flex: none; padding: 0; border: 0; background: transparent; color: var(--hbu-reader-muted); font: inherit; font-size: 11px; cursor: pointer; }
  .hbu-reader-comments-collapse:hover { color: var(--hbu-reader-link); }
  /* A folded branch keeps a short indent and a dashed rule, so the row still
     shows that replies are stored underneath it. */
  .hbu-reader-comments-children--collapsed { padding-left: 6px; border-left-style: dashed; }
  .hbu-reader-comments-child--collapsed { padding-top: 0; }
  .hbu-reader-comments-child--collapsed::before { display: none; }
  .hbu-reader-comments-expand { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; padding: 2px 9px; border: 1px dashed var(--hbu-reader-border); border-radius: 999px; background: transparent; color: var(--hbu-reader-muted); font: inherit; font-size: 11px; cursor: pointer; }
  .hbu-reader-comments-expand::before { content: "+"; font-weight: 700; }
  .hbu-reader-comments-expand:hover { border-color: var(--hbu-reader-link); color: var(--hbu-reader-link); }
  .hbu-reader-comments-syncing { flex: none; color: var(--hbu-reader-muted); font-size: 11px; opacity: .85; }
  .hbu-reader-comments-syncing--settled { opacity: .7; }
  /* Past the depth cap the branch stops indenting, so a long reply chain can
     never push the sheet wider than its own column. */
  .hbu-reader-comments-children--deep { margin-top: 6px; padding-left: 0; border-left: 0; }
  .hbu-reader-comments-children--deep > .hbu-reader-comments-child::before { display: none; }
  .hbu-reader-comments-text .hbu-reader-comments-emoji { display: inline-block; width: 17px; height: 17px; margin: 0 1px; vertical-align: -3px; background-repeat: no-repeat; }
  .hbu-reader-comments-text img, .hbu-reader-comments-text .hbu-reader-comments-image { display: block; max-width: 100%; max-height: 180px; margin-top: 6px; border-radius: 8px; object-fit: contain; vertical-align: top; }
  /* Comment pictures open the shared viewer on click, matching article photos. */
  .hbu-reader-comments-text .hbu-reader-comments-image { cursor: zoom-in; }
  .hbu-reader-comments-status { display: grid; justify-items: center; gap: 10px; padding: 32px 12px; color: var(--hbu-reader-muted); font-size: 13px; text-align: center; }
  .hbu-reader-comments-status-retry { display: inline-flex; align-items: center; justify-content: center; min-height: 36px; padding: 0 16px; border: 1px solid var(--hbu-reader-border); border-radius: 9px; background: transparent; color: inherit; font: inherit; font-size: 12px; cursor: pointer; }
  .hbu-reader-comments-status-retry:hover { border-color: var(--hbu-reader-accent); }
  .hbu-reader-comments-foot { display: flex; gap: 8px; align-items: center; padding: 12px 16px; border-top: 1px solid var(--hbu-reader-border); }
  .hbu-reader-comments-foot button, .hbu-reader-comments-foot a { display: inline-flex; align-items: center; justify-content: center; min-height: 36px; padding: 0 14px; border: 1px solid var(--hbu-reader-border); border-radius: 9px; background: transparent; color: inherit; font: inherit; font-size: 12px; text-decoration: none; cursor: pointer; }
  .hbu-reader-comments-foot a { margin-left: auto; border-color: transparent; background: var(--hbu-reader-accent); color: var(--hbu-reader-on-accent); font-weight: 650; }
  .hbu-reader-comments-foot button:disabled { opacity: .55; cursor: default; }
  .hbu-reader-comments-list[hidden], .hbu-reader-comments-status[hidden], .hbu-reader-comments-status [hidden], .hbu-reader-comments-foot button[hidden] { display: none; }
  .hbu-reader-composer {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: 7px;
    padding: 10px 16px 12px;
    border-bottom: 1px solid var(--hbu-reader-border);
    background: var(--hbu-reader-page);
  }
  .hbu-reader-composer-input {
    box-sizing: border-box;
    width: 100%;
    min-height: 58px;
    max-height: 132px;
    padding: 8px 11px;
    overflow-y: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    border: 1px solid var(--hbu-reader-border);
    border-radius: 10px;
    outline: none;
    background: var(--hbu-reader-subtle);
    color: var(--hbu-reader-ink);
    font: 13px/1.6 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
  }
  .hbu-reader-composer-input[data-empty="true"]::before { content: attr(data-placeholder); color: var(--hbu-reader-muted); pointer-events: none; }
  .hbu-reader-composer-input:focus { border-color: var(--hbu-reader-accent); }
  .hbu-reader-composer-reply { display: flex; gap: 8px; align-items: center; min-width: 0; padding: 5px 9px; border-radius: 8px; background: var(--hbu-reader-subtle); color: var(--hbu-reader-ink-2); font-size: 11px; }
  .hbu-reader-composer-reply[hidden] { display: none; }
  .hbu-reader-composer-reply-name { min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hbu-reader-composer-reply-cancel { flex: none; padding: 0; border: 0; background: transparent; color: var(--hbu-reader-link); font: inherit; cursor: pointer; }
  .hbu-reader-composer-bar { display: flex; gap: 8px; align-items: center; }
  .hbu-reader-composer-emoji-toggle, .hbu-reader-composer-image-toggle { flex: none; min-height: 30px; padding: 0 10px; border: 1px solid var(--hbu-reader-border); border-radius: 8px; background: transparent; color: var(--hbu-reader-ink-2); font: inherit; font-size: 12px; cursor: pointer; }
  .hbu-reader-composer-emoji-toggle[aria-expanded="true"] { border-color: var(--hbu-reader-accent); color: var(--hbu-reader-ink); }
  .hbu-reader-composer-emoji-toggle:disabled, .hbu-reader-composer-image-toggle:disabled { opacity: .55; cursor: default; }
  /* Picked pictures keep a square thumbnail so a nine picture row wraps instead
     of pushing the panel wider than its column. */
  .hbu-reader-composer-images { display: flex; flex-wrap: wrap; gap: 9px; }
  .hbu-reader-composer-images[hidden] { display: none; }
  .hbu-reader-composer-image { position: relative; width: 62px; height: 62px; margin: 0; }
  .hbu-reader-composer-image-frame { position: relative; display: grid; place-items: center; width: 100%; height: 100%; overflow: hidden; border: 1px solid var(--hbu-reader-border); border-radius: 9px; background: var(--hbu-reader-subtle); }
  .hbu-reader-composer-image-frame img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .hbu-reader-composer-image-placeholder { color: var(--hbu-reader-muted); font-size: 11px; }
  .hbu-reader-composer-image-state { position: absolute; right: 0; bottom: 0; left: 0; padding: 1px 0; background: var(--hbu-reader-float); color: var(--hbu-reader-float-ink); font-size: 10px; text-align: center; }
  .hbu-reader-composer-image-retry { position: absolute; right: 2px; bottom: 2px; left: 2px; min-height: 18px; padding: 0 3px; border: 1px solid var(--hbu-reader-border); border-radius: 5px; background: var(--hbu-reader-float); color: var(--hbu-reader-float-ink); font: inherit; font-size: 10px; line-height: 16px; cursor: pointer; }
  .hbu-reader-composer-image[data-status="failed"] .hbu-reader-composer-image-frame { border-color: var(--hbu-reader-danger); }
  .hbu-reader-composer-image-remove { position: absolute; top: -6px; right: -6px; display: grid; place-items: center; width: 20px; height: 20px; padding: 0; border: 1px solid var(--hbu-reader-border); border-radius: 50%; background: var(--hbu-reader-float); color: var(--hbu-reader-float-ink); font: inherit; font-size: 13px; line-height: 1; cursor: pointer; }
  .hbu-reader-composer-file { display: none; }
  .hbu-reader-composer-emoji { max-height: 196px; padding: 8px; overflow-y: auto; overscroll-behavior: contain; border: 1px solid var(--hbu-reader-border); border-radius: 10px; background: var(--hbu-reader-subtle); }
  .hbu-reader-composer-emoji[hidden] { display: none; }
  .hbu-reader-composer-emoji-groups { display: flex; flex-direction: column; gap: 10px; }
  .hbu-reader-composer-emoji-label { margin: 0 0 5px 2px; color: var(--hbu-reader-muted); font-size: 11px; font-weight: 600; letter-spacing: .02em; }
  .hbu-reader-composer-emoji-grid { display: grid; grid-template-columns: repeat(6, 26px); gap: 6px; justify-content: center; }
  .hbu-reader-composer-emoji-grid button { display: grid; place-items: center; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 6px; background: transparent; cursor: pointer; }
  .hbu-reader-composer-emoji-grid button:hover, .hbu-reader-composer-emoji-grid button:focus-visible { background: var(--hbu-reader-page); }
  /* The inline sprite style owns the sheet size, so only the repeat policy is
     set here; a contain fit would shift every cell offset. */
  .hbu-reader-composer-emoji-grid span { display: block; width: 22px; height: 22px; background-repeat: no-repeat; }
  .hbu-reader-composer-emoji-glyph { display: inline-block; width: 17px; height: 17px; vertical-align: -3px; background-repeat: no-repeat; }
  .hbu-reader-composer-status { min-width: 0; flex: 1 1 auto; color: var(--hbu-reader-muted); font-size: 11px; line-height: 1.4; overflow-wrap: anywhere; }
  .hbu-reader-composer-count { flex: none; color: var(--hbu-reader-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  .hbu-reader-composer-submit { flex: none; min-height: 30px; padding: 0 13px; border: 1px solid transparent; border-radius: 8px; background: var(--hbu-reader-accent); color: var(--hbu-reader-on-accent); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
  .hbu-reader-composer-submit:disabled { opacity: .55; cursor: default; }
  /* The lightbox is a scrollable stage: a very long picture keeps its reading
     width and grows downward instead of being squeezed into the viewport. The
     width itself is measured in JS so zoom steps stay exact. The viewer opens
     from inside the comment sheet as well as from the article, so it paints
     above every reader overlay: the panel sits at 4065 and the toast at 4060,
     while the site alert stays at 4100. */
  .hbu-reader-lightbox { position: fixed; inset: 0; z-index: 4070; display: flex; flex-direction: column; align-items: center; padding: 52px 12px 20px; overflow: auto; border: 0; background: rgba(2, 4, 7, .95); color: #e9eef5; font: inherit; }
  .hbu-reader-lightbox-stage { display: flex; flex: 0 0 auto; align-items: flex-start; justify-content: center; width: 100%; }
  .hbu-reader-lightbox img { display: block; max-width: none; height: auto; margin: 0 auto; border-radius: 10px; box-shadow: 0 20px 60px rgba(0, 0, 0, .55); cursor: zoom-in; transition: width .16s ease; }
  .hbu-reader-lightbox img[data-zoom="0"] { cursor: zoom-in; }
  .hbu-reader-lightbox img:not([data-zoom="0"]) { cursor: zoom-out; }
  .hbu-reader-lightbox-bar { position: fixed; top: 0; right: 0; left: 0; display: flex; gap: 10px; align-items: center; padding: 8px 12px; background: linear-gradient(180deg, rgba(2, 4, 7, .92), transparent); }
  .hbu-reader-lightbox-hint { flex: 1 1 auto; min-width: 0; overflow: hidden; color: rgba(233, 238, 245, .72); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
  .hbu-reader-lightbox-close { display: grid; place-items: center; width: 36px; height: 36px; flex: none; padding: 0; border: 1px solid rgba(255, 255, 255, .22); border-radius: 50%; background: rgba(12, 16, 22, .6); color: inherit; cursor: pointer; }
  .hbu-reader-lightbox-close svg { width: 17px; height: 17px; }
.hbu-reader-lightbox :is(img, button):focus-visible { outline: 2px solid var(--hbu-reader-accent); outline-offset: 2px; }
  .hbu-reader-toast { position: absolute; bottom: 58px; left: 50%; z-index: 20; padding: 7px 13px; border: 1px solid var(--hbu-reader-float-border); border-radius: 99px; background: var(--hbu-reader-float); color: var(--hbu-reader-float-ink); font-size: 12px; box-shadow: 0 10px 26px rgba(0, 0, 0, .18); opacity: 0; pointer-events: none; transform: translate(-50%, 8px); transition: opacity .18s ease, transform .18s ease; }
  .hbu-reader-toast[data-show="true"] { opacity: 1; transform: translate(-50%, 0); }
  .hbu-reader-toast--fixed { position: fixed; bottom: 58px; z-index: 4060; }
  .hbu-reader-pending { display: grid; height: 100%; place-items: center; padding: 24px; color: var(--hbu-reader-muted); font-size: 13px; letter-spacing: .04em; }
  .hbu-reader-pending-card { display: flex; flex-direction: column; gap: 12px; align-items: center; text-align: center; }
  .hbu-reader-pending-text { margin: 0; }
  .hbu-reader-pending-actions { display: flex; gap: 8px; align-items: center; }
  .hbu-reader-pending-actions[hidden] { display: none; }
  .hbu-reader-pending-actions button {
    min-height: 34px;
    padding: 0 14px;
    border: 1px solid var(--hbu-reader-border);
    border-radius: 9px;
    background: var(--hbu-reader-page);
    color: var(--hbu-reader-ink);
    font: inherit;
    letter-spacing: 0;
    cursor: pointer;
  }
  .hbu-reader-pending-actions button[data-retry] {
    border-color: transparent;
    background: var(--hbu-reader-accent);
    color: var(--hbu-reader-on-accent);
    font-weight: 650;
  }
  @media (max-width: 900px) {
    #${READER_ID} { width: 100%; }
    .hbu-reader-scroll, .hbu-reader-head, .hbu-reader-progress { width: 100%; }
    .hbu-reader-rail { right: 14px; bottom: 96px; }
    .hbu-reader-page { padding-right: 86px; }
    .hbu-reader-caption { padding-right: 86px; }
  }
  @media (max-width: 760px) {
    :root { --hbu-reader-stage: 100%; }
    .hbu-reader-rail-avatar-link { display: none; }
    .hbu-reader-page { padding: 22px 64px 48px 24px; }
    .hbu-reader-page[data-kind="hero"] { padding: 0; }
    .hbu-reader-page[data-kind="text"] { padding: 0 64px 0 24px; }
    .hbu-reader-page[data-kind="heading"] { padding: 44px 64px 24px 24px; }
    .hbu-reader-page[data-kind="media"] { padding: 1.5rem 16px; }
    .hbu-reader-rich figure { margin-block: 1.5rem; }
    .hbu-reader-page[data-kind="embed"] { padding: 1.5rem 16px; }
    .hbu-reader-page[data-kind="video"] { padding: 1.5rem 16px; }
    .hbu-reader-video { max-height: calc(100cqh - 3rem); }
    .hbu-reader-page[data-kind="text"] .hbu-reader-copy,
    .hbu-reader-page[data-kind="heading"] .hbu-reader-copy,
    .hbu-reader-rich { font-size: 17px; }
    .hbu-reader-page[data-kind="heading"] .hbu-reader-copy { font-size: 24px; }
    .hbu-reader-caption { padding: 18px 64px 56px 24px; }
    .hbu-reader-title { font-size: 26px; }
    .hbu-reader-cy-text { font-size: 16px; }
    .hbu-reader-rail { gap: 9px; bottom: 88px; right: 10px; }
    .hbu-reader-action { width: 42px; min-height: 42px; }
    .hbu-reader-action svg { width: 19px; height: 19px; }
    .hbu-reader-head { padding: 10px 12px; padding-top: max(10px, env(safe-area-inset-top)); }
    .hbu-reader-head-author { max-width: 38%; }
    .hbu-reader-progress { padding: 0 12px; }
    .hbu-reader-round { width: 38px; height: 38px; }
    .hbu-reader-home { height: 38px; padding: 0 11px 0 9px; }
  }
  @media (max-width: 520px) {
    .hbu-reader-head-author span { display: none; }
    .hbu-reader-head-author { padding-right: 4px; }
    .hbu-reader-follow { min-width: 48px; padding: 0 10px; }
    .hbu-reader-home { width: 38px; justify-content: center; padding: 0; border-radius: 50%; }
    .hbu-reader-home span { display: none; }
    .hbu-reader-page { padding-right: 64px; }
    .hbu-reader-page[data-kind="media"] { padding-right: 16px; padding-left: 16px; }
    .hbu-reader-page[data-kind="embed"] { padding-right: 16px; padding-left: 16px; }
    .hbu-reader-caption { padding-right: 64px; }
    .hbu-reader-hint { display: none; }
    .hbu-reader-related { display: none; }
  }
  @media (max-height: 620px) {
    .hbu-reader-page { padding-top: 72px; padding-bottom: 76px; }
    .hbu-reader-page:is([data-kind="media"], [data-kind="embed"], [data-kind="video"]) { padding-top: 1.5rem; padding-bottom: 1.5rem; }
    .hbu-reader-video { max-height: calc(100cqh - 3rem); }
    .hbu-reader-page[data-kind="hero"] { padding: 0; }
    .hbu-reader-page[data-kind="text"] { padding-top: 0; padding-bottom: 0; }
    .hbu-reader-caption { padding: 14px 64px 58px 24px; }
    .hbu-reader-rail { bottom: 70px; gap: 7px; }
    .hbu-reader-action { width: 38px; min-height: 38px; }
    .hbu-reader-action-count { display: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .hbu-reader-scroll { scroll-behavior: auto; }
    #${READER_ID} *, #${READER_ID} *::before, #${READER_ID} *::after { transition: none !important; }
  }
  /* Keep the history column docked at the viewport edge while sharing the
     available row with the article stage and action rail. */
  @media (min-width: 901px) {
    #${READER_ID}.hbu-reader-has-timeline { left: 0; width: calc(100% - var(--hbu-reader-history-width) - 40px); transform: none; }
    #${READER_ID}.hbu-reader-has-timeline .hbu-reader-scroll { width: min(var(--hbu-reader-stage), calc(100% - 80px)); margin-left: auto; margin-right: 80px; }
    #${READER_ID}.hbu-reader-has-timeline .hbu-reader-rail { right: 0; width: 56px; transform: none; }
    #${READER_ID}.hbu-reader-has-timeline .hbu-reader-head { width: calc(100% - 80px); }
    #${READER_ID}.hbu-reader-has-timeline .hbu-reader-progress { margin-left: auto; margin-right: 80px; width: min(var(--hbu-reader-stage), calc(100% - 80px)); }
    #${READER_ID}.hbu-reader-has-timeline .hbu-reader-history-menu { position: fixed; left: auto; right: 16px; width: var(--hbu-reader-history-width); }
    #${READER_ID}.hbu-reader-has-timeline [data-action="history"] { display: none; }
  }
  .hbu-reader-history-scrim { position: absolute; inset: 0; z-index: 44; padding: 0; border: 0; background: var(--hbu-reader-scrim); }
  .hbu-reader-history-scrim[hidden] { display: none; }
  /* Keep the timeline in a drawer only on narrow viewports. */
  @media (max-width: 900px) {
    #${READER_ID}.hbu-reader-has-timeline { width: 100%; }
    #${READER_ID}.hbu-reader-has-timeline .hbu-reader-scroll { width: 100%; margin-left: 0; margin-right: 0; }
    #${READER_ID}.hbu-reader-has-timeline .hbu-reader-rail { right: 14px; transform: none; }
    .hbu-reader-history-menu { right: 0; width: min(320px, 88vw); z-index: 45; visibility: hidden; box-shadow: var(--hbu-reader-shadow); transform: translateX(100%); transition: transform .22s ease, visibility .22s; }
    #${READER_ID}[data-timeline-open="true"] .hbu-reader-history-menu { visibility: visible; transform: none; }
    .hbu-reader-history-close { display: grid; }
  }
  @media (max-width: 760px) {
    #${READER_ID}.hbu-reader-has-timeline .hbu-reader-rail { right: 10px; transform: none; }
    .hbu-reader-history-menu { padding: 14px 12px 16px; }
  }
  /* The progress bar is now a sibling band, not an overlay on a page. */
`;
  var PAGER_ICONS = {
    prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>'
  };
  function readPostLinkId() {
    const match = /^\/app\/bbs\/link\/(\d+)/.exec(location.pathname);
    return match ? match[1] : "";
  }
  function readSessionArray(key) {
    const value = sessionStore.readJson(key, []);
    return Array.isArray(value) ? value : [];
  }
  function readSessionRecord(key) {
    const value = sessionStore.readJson(key, {});
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    return value;
  }
  function writeSessionValue(key, value) {
    return sessionStore.writeJson(key, value);
  }
  function readFeedOrder(accountId = getHeyboxId()) {
    return mergeFeedOrder(readSessionArray(buildFeedStateKey(FEED_ORDER_KEY, accountId)), []);
  }
  function recordFeedOrder() {
    if (readPostLinkId() !== "") return;
    if (!document.querySelector("#page-bbs-community .bbs-home__content-list")) return;
    const seen = /* @__PURE__ */ new Set();
    const list = [];
    for (const anchor of document.querySelectorAll("#page-bbs-community .bbs-home__content-list a[href*='/app/bbs/link/']")) {
      const matched = /link\/(\d+)/.exec(anchor.getAttribute("href") || "");
      if (!matched) continue;
      const matchId = matched[1];
      if (seen.has(matchId)) continue;
      seen.add(matchId);
      const titleNode = anchor.querySelector(".bbs-home__content-title, .link-item__title, .bbs-home__topic-name");
      const title = (titleNode ? titleNode.textContent : anchor.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80);
      const card = anchor.closest(".bbs-home__content-item, .content-list__item, li");
      const meta = readPostMeta(card === null ? anchor : card, title);
      if (meta === null) continue;
      list.push({
        id: matchId,
        title: meta.title || title,
        authorId: meta.authorId,
        author: meta.author,
        topicIds: meta.topicIds,
        topics: meta.topics
      });
    }
    if (list.length === 0) return;
    const accountId = getHeyboxId();
    const orderKey = buildFeedStateKey(FEED_ORDER_KEY, accountId);
    const merged = mergeFeedOrder(readSessionArray(orderKey), list).slice(-FEED_ORDER_MAX);
    if (merged.length > 0) writeSessionValue(orderKey, merged);
  }
  function readRelatedPostLinks() {
    const seen = /* @__PURE__ */ new Set();
    const list = [];
    const nodes = document.querySelectorAll(".bbs-link__related-recommend a[href*='/app/bbs/link/'], .related-recommend__container a[href*='/app/bbs/link/']");
    for (const anchor of nodes) {
      const matched = /link\/(\d+)/.exec(anchor.getAttribute("href") || "");
      if (!matched) continue;
      const matchId = matched[1];
      if (seen.has(matchId)) continue;
      seen.add(matchId);
      const title = (anchor.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80);
      list.push({ id: matchId, title });
    }
    return list;
  }
  function readUserIdFromHref(href) {
    const value = typeof href === "string" ? href : "";
    if (value === "") return "";
    const match = /\/app\/user\/profile\/(\d+)/.exec(value) || /[?&]userid=(\d+)/.exec(value);
    return match ? normalizeFeedId(match[1]) : "";
  }
  function readPostMeta(root, title) {
    if (!(root instanceof Element)) return null;
    const scope = root;
    const authorNode = scope.querySelector(".list-content__username, .link-user__username, .page-header__username");
    const authorLink = scope.querySelector(".header__user, .link-user__user-wrapper, .page-header__user-wrapper, a[href*='/app/user/profile/']");
    const authorHref = authorLink?.getAttribute("href") || authorLink?.querySelector("a[href*='/app/user/profile/']")?.getAttribute("href") || "";
    const author = normalizeFeedText(authorNode?.textContent ?? "", 80);
    const authorId = readUserIdFromHref(authorHref);
    const topicIds = [];
    const topics = [];
    for (const node of Array.from(scope.querySelectorAll(".link-tags__tag-item"))) {
      const name = normalizeFeedText(node.textContent, 80);
      if (name !== "" && !topics.includes(name)) topics.push(name);
    }
    for (const anchor of Array.from(scope.querySelectorAll("a[href*='/app/topic/link/']"))) {
      const matched = /topic\/link\/(\d+)/.exec(anchor.getAttribute("href") || "");
      if (matched) {
        const topicId = normalizeFeedId(matched[1]);
        if (topicId !== "" && !topicIds.includes(topicId)) topicIds.push(topicId);
      }
      const name = normalizeFeedText(anchor.textContent, 80);
      if (name !== "" && !topics.includes(name)) topics.push(name);
    }
    const heading = normalizeFeedText(title, FEED_TITLE_MAX) || normalizeFeedText(scope.querySelector(READER_SOURCE_TITLE_SELECTOR)?.textContent ?? "", FEED_TITLE_MAX);
    return { title: heading, authorId, author, topicIds, topics };
  }
  function readPostTrail() {
    return readSessionArray(POST_TRAIL_KEY).filter((id) => typeof id === "string" && /^\d+$/.test(id));
  }
  function readPostHistoryCursor() {
    const raw = sessionStore.read(POST_HISTORY_CURSOR_KEY);
    if (raw === null || raw === "") return -1;
    const value = Number(raw);
    return Number.isSafeInteger(value) && value >= 0 ? value : -1;
  }
  function writePostHistoryCursor(index) {
    if (!Number.isSafeInteger(index) || index < 0) return;
    sessionStore.write(POST_HISTORY_CURSOR_KEY, String(index));
  }
  function readVisitedPostIds(currentId) {
    const visited = new Set(readPostTrail());
    if (currentId !== "") visited.add(currentId);
    return visited;
  }
  function visitPostTrail(id) {
    const trail = readPostTrail();
    if (id === "") return trail;
    const existing = trail.lastIndexOf(id);
    if (existing !== -1) {
      writePostHistoryCursor(existing);
      return trail;
    }
    const cursor = readPostHistoryCursor();
    if (cursor >= 0 && cursor < trail.length - 1) trail.splice(cursor + 1);
    trail.push(id);
    const dropped = trimPostTrail(trail, readReaderHistoryLimit());
    writeSessionValue(POST_TRAIL_KEY, trail);
    writePostHistoryCursor(trail.length - 1);
    prunePostHistoryExtras(dropped);
    return trail;
  }
  function trimPostTrail(trail, limit) {
    const dropped = [];
    if (!Number.isSafeInteger(limit) || limit <= 0) return dropped;
    while (trail.length > limit) {
      const removed = trail.shift();
      if (removed !== void 0) dropped.push(removed);
    }
    return dropped;
  }
  function prunePostHistoryExtras(dropped) {
    if (dropped.length === 0) return;
    const stored = readSessionRecord(POST_HISTORY_TITLES_KEY);
    let changed = false;
    for (const id of dropped) {
      if (Object.prototype.hasOwnProperty.call(stored, id)) {
        delete stored[id];
        changed = true;
      }
      sessionStore.remove(READER_SCROLL_KEY + id);
      sessionStore.remove(READER_RATIO_KEY + id);
      removeStoredReaderPosition(id);
    }
    if (changed) writeSessionValue(POST_HISTORY_TITLES_KEY, stored);
  }
  function applyPostHistoryLimit(limit) {
    const trail = readPostTrail();
    const cursor = readPostHistoryCursor();
    const dropped = trimPostTrail(trail, limit);
    if (dropped.length === 0) return trail;
    writeSessionValue(POST_TRAIL_KEY, trail);
    const nextCursor = cursor < 0 ? cursor : Math.max(0, cursor - dropped.length);
    writePostHistoryCursor(nextCursor);
    prunePostHistoryExtras(dropped);
    return trail;
  }
  function readPostHistoryEntryTitle(id) {
    const recent = readFeedRecent();
    const found = recent.find((item) => item.id === id);
    if (found !== void 0 && found.title !== "") return found.title;
    const stored = readSessionRecord(POST_HISTORY_TITLES_KEY);
    const value = stored[id];
    return typeof value === "string" ? value : "";
  }
  function writePostHistoryTitle(id, title) {
    if (id === "" || title === "") return;
    const stored = readSessionRecord(POST_HISTORY_TITLES_KEY);
    if (stored[id] === title) return;
    stored[id] = title;
    const trail = readPostTrail();
    const kept = {};
    for (const trailId of trail) {
      const value = stored[trailId];
      if (typeof value === "string") kept[trailId] = value;
    }
    writeSessionValue(POST_HISTORY_TITLES_KEY, kept);
  }
  function readFeedQueue(accountId = getHeyboxId()) {
    return mergeFeedQueue(readSessionArray(buildFeedStateKey(FEED_QUEUE_KEY, accountId)), []);
  }
  function writeFeedQueue(items, accountId = getHeyboxId()) {
    return writeSessionValue(buildFeedStateKey(FEED_QUEUE_KEY, accountId), mergeFeedQueue(items, [], { max: FEED_QUEUE_MAX }));
  }
  function readFeedCursorState(accountId = getHeyboxId()) {
    const raw = sessionStore.read(buildFeedStateKey(FEED_CURSOR_KEY, accountId));
    if (raw === null || raw === "") return { present: false, offset: 0 };
    const value = Number(raw);
    return { present: true, offset: Number.isSafeInteger(value) && value >= 0 ? value : 0 };
  }
  function writeFeedCursor(offset, accountId = getHeyboxId()) {
    if (!Number.isSafeInteger(offset) || offset < 0) return false;
    return sessionStore.write(buildFeedStateKey(FEED_CURSOR_KEY, accountId), String(offset));
  }
  function readFeedSeen(accountId = getHeyboxId()) {
    return mergeFeedSeen(readSessionArray(buildFeedStateKey(FEED_SEEN_KEY, accountId)), []);
  }
  function writeFeedSeen(ids, accountId = getHeyboxId()) {
    const list = mergeFeedSeen(ids instanceof Set ? Array.from(ids) : ids, []);
    writeSessionValue(buildFeedStateKey(FEED_SEEN_KEY, accountId), list);
    return list;
  }
  function readFeedRecent(accountId = getHeyboxId()) {
    return mergeRecentMetadata(readSessionArray(buildFeedStateKey(FEED_RECENT_KEY, accountId)), null);
  }
  function writeFeedRecent(recent, accountId = getHeyboxId()) {
    writeSessionValue(buildFeedStateKey(FEED_RECENT_KEY, accountId), mergeRecentMetadata(recent, null));
  }
  function readFeedRecentSignature(recent) {
    return recent.map((item) => [item.id, item.title, item.authorId, item.author, item.topicIds.join(","), item.topics.join(",")].join("~")).join("|");
  }
  function createPostNavigationController() {
    let currentId = "";
    let related = [];
    let accountId = getHeyboxId();
    let queue = [];
    let cursor = 0;
    let cursorStored = false;
    let seen = /* @__PURE__ */ new Set();
    let recent = [];
    let recentKey = "";
    let discovering = false;
    let discoveryError = "";
    let exhausted = false;
    let generation = 0;
    let revision = 0;
    const listeners = /* @__PURE__ */ new Set();
    let statusKey = "";
    const loadAccountState = () => {
      queue = readFeedQueue(accountId);
      const storedCursor = readFeedCursorState(accountId);
      cursor = storedCursor.present ? storedCursor.offset : computeFeedDiscoveryOffset(readFeedOrder(), FEED_DISCOVERY_PAGE_SIZE);
      cursorStored = storedCursor.present;
      seen = new Set(readFeedSeen(accountId));
      recent = readFeedRecent(accountId);
      recentKey = readFeedRecentSignature(recent);
    };
    const syncAccount = () => {
      const nextAccountId = getHeyboxId();
      if (nextAccountId === accountId) return false;
      accountId = nextAccountId;
      generation += 1;
      discovering = false;
      discoveryError = "";
      exhausted = false;
      loadAccountState();
      return true;
    };
    loadAccountState();
    const readStatus = () => {
      const trail = readPostTrail();
      let prev = null;
      const cursor2 = readPostHistoryCursor();
      const at = currentId === "" ? -1 : trail.lastIndexOf(currentId);
      const position = at === -1 ? -1 : cursor2 >= 0 && trail[cursor2] === currentId ? cursor2 : at;
      if (position > 0) {
        const prevId = trail[position - 1];
        if (prevId !== void 0 && prevId !== currentId) {
          prev = { id: prevId, title: readPostHistoryEntryTitle(prevId) };
        }
      }
      const history2 = trail.map((id, index) => ({
        id,
        title: readPostHistoryEntryTitle(id),
        current: index === position
      }));
      let next = null;
      if (currentId !== "") {
        const picked = selectNextFeedCandidate({
          currentId,
          visited: readVisitedPostIds(currentId),
          seen,
          recent,
          feedOrder: readFeedOrder(),
          queue,
          related
        });
        if (picked !== null) next = { id: picked.candidate.id, title: picked.candidate.title, source: picked.source };
      }
      return {
        currentId,
        revision,
        prev,
        next,
        history: history2,
        discovering,
        error: discoveryError,
        exhausted
      };
    };
    const publish = (force) => {
      const status = readStatus();
      const key = [
        status.currentId,
        String(status.revision),
        status.prev === null ? "" : status.prev.id,
        status.next === null ? "" : status.next.id,
        status.history.map((entry) => (entry.current ? "*" : "") + entry.id).join(","),
        status.discovering ? "1" : "0",
        status.error,
        status.exhausted ? "1" : "0"
      ].join("|");
      if (force !== true && key === statusKey) return;
      statusKey = key;
      for (const listener of Array.from(listeners)) {
        try {
          listener(status);
        } catch {
        }
      }
    };
    const sync = (id, meta, links) => {
      syncAccount();
      const nextId = normalizeFeedId(id);
      const nextRelated = normalizeFeedDiscoveryLinks(links);
      related = nextRelated === null ? [] : nextRelated;
      if (nextId === "") {
        if (currentId !== "") {
          currentId = "";
          revision += 1;
          discoveryError = "";
          exhausted = false;
          publish(true);
        }
        return;
      }
      const changed = nextId !== currentId;
      currentId = nextId;
      if (changed) {
        revision += 1;
        visitPostTrail(nextId);
        discoveryError = "";
        exhausted = false;
        if (queue.some((item) => item.id === nextId)) {
          queue = queue.filter((item) => item.id !== nextId);
          writeFeedQueue(queue, accountId);
        }
      }
      if (!seen.has(nextId)) {
        const nextSeen = new Set(seen);
        nextSeen.add(nextId);
        seen = new Set(writeFeedSeen(nextSeen, accountId));
      }
      const incoming = normalizeFeedCandidate(meta !== null && typeof meta === "object" ? { ...meta, id: nextId } : { id: nextId });
      if (incoming !== null) {
        writePostHistoryTitle(nextId, incoming.title);
        const merged = mergeRecentMetadata(recent, incoming);
        const key = readFeedRecentSignature(merged);
        if (key !== recentKey) {
          recent = merged;
          recentKey = key;
          writeFeedRecent(recent, accountId);
        }
      }
      publish(changed);
    };
    const takeNext = () => {
      const status = readStatus();
      if (status.next === null) return null;
      return { id: status.next.id, title: status.next.title };
    };
    const discover = async () => {
      syncAccount();
      if (discovering || currentId === "") return;
      if (!cursorStored) {
        cursor = computeFeedDiscoveryOffset(readFeedOrder(), FEED_DISCOVERY_PAGE_SIZE);
        cursorStored = writeFeedCursor(cursor, accountId);
      }
      discovering = true;
      discoveryError = "";
      exhausted = false;
      generation += 1;
      const runGeneration = generation;
      const controller = new AbortController();
      publish(true);
      try {
        for (let pass = 0; pass < FEED_DISCOVERY_PASS_PAGES; pass += 1) {
          const page = await requestFeedDiscoveryPage(cursor, controller.signal);
          if (runGeneration !== generation) return;
          if (!page.ok) {
            discoveryError = page.message;
            break;
          }
          const nextQueue = mergeFeedQueue(queue, page.links, {
            currentId,
            visited: readVisitedPostIds(currentId),
            seen,
            max: FEED_QUEUE_MAX
          });
          if (!writeFeedQueue(nextQueue, accountId)) {
            if (runGeneration !== generation) return;
            discoveryError = "无法保存连读进度；点击“下一篇”重试";
            break;
          }
          queue = nextQueue;
          const nextCursor = cursor + FEED_DISCOVERY_PAGE_SIZE;
          if (writeFeedCursor(nextCursor, accountId)) {
            cursor = nextCursor;
            cursorStored = true;
          }
          if (page.rawEmpty === true) break;
          if (hasDiscoverableNext(readStatus())) break;
        }
      } catch (error) {
        if (runGeneration !== generation) return;
        if (!isAbortError(error)) discoveryError = "信息流请求失败，请稍后重试";
      } finally {
        if (runGeneration === generation) {
          discovering = false;
          if (discoveryError === "") exhausted = readStatus().next === null;
          publish(true);
        }
      }
    };
    const subscribe = (listener) => {
      if (typeof listener !== "function") return () => {
      };
      const callback = listener;
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    };
    return {
      sync,
      readStatus,
      takeNext,
      discover,
      subscribe
    };
  }
  function isTypingTarget(target) {
    if (!(target instanceof Element)) return false;
    if (target instanceof HTMLElement && target.isContentEditable) return true;
    return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
  }
  function isSiteAlertOpen() {
    return document.querySelector(".alert-container-wrapper .hb-cpt__alert-wrapper") !== null;
  }
  function eventHitsTypingTarget(event) {
    for (const node of event.composedPath()) {
      if (isTypingTarget(node)) return true;
    }
    return isTypingTarget(event.target);
  }
  function isFollowedAuthor(button) {
    if (!(button instanceof Element)) return false;
    if (button.classList.contains("followed")) return true;
    if (button.getAttribute("aria-pressed") === "true") return true;
    return /^(已关注|互相关注)$/.test((button.textContent || "").trim());
  }
  function watchPostPager(navigation) {
    if (!document.body) return;
    const host = document.createElement("div");
    host.id = PAGER_ID;
    host.hidden = true;
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = PAGER_CSS;
    const pager = document.createElement("nav");
    pager.className = "pager";
    pager.setAttribute("aria-label", "文章连读");
    const prevButton = document.createElement("button");
    prevButton.type = "button";
    prevButton.className = "btn btn--prev";
    prevButton.setAttribute("aria-label", "上一篇");
    prevButton.title = "上一篇";
    prevButton.innerHTML = PAGER_ICONS.prev;
    const nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.className = "btn btn--next";
    nextButton.setAttribute("aria-label", "下一篇");
    nextButton.title = "下一篇";
    nextButton.innerHTML = PAGER_ICONS.next;
    const statusNode = document.createElement("p");
    statusNode.className = "pager-status";
    statusNode.setAttribute("role", "status");
    statusNode.setAttribute("aria-live", "polite");
    statusNode.hidden = true;
    pager.append(prevButton, nextButton, statusNode);
    shadow.append(style, pager);
    let currentId = "";
    let prevId = "";
    let navigating = false;
    let pendingAdvanceSourceId = "";
    let pendingAdvanceRevision = -1;
    const clearPendingAdvance = () => {
      pendingAdvanceSourceId = "";
      pendingAdvanceRevision = -1;
    };
    const go = (id) => {
      if (id === "" || navigating) return;
      navigating = true;
      void navigateToPath(LINK_HREF_PREFIX + id).then((accepted) => {
        if (accepted !== true) navigating = false;
      }, () => {
        navigating = false;
      });
      const toTop = () => window.scrollTo({ top: 0, behavior: "auto" });
      requestAnimationFrame(toTop);
      window.setTimeout(toTop, 120);
    };
    const advance = () => {
      if (navigating) return;
      const status = navigation.readStatus();
      if (status.next !== null && status.next.source !== "related") {
        const taken = navigation.takeNext();
        if (taken !== null) {
          clearPendingAdvance();
          go(taken.id);
          return;
        }
      }
      pendingAdvanceSourceId = status.currentId;
      pendingAdvanceRevision = status.revision;
      void navigation.discover();
    };
    const renderStatus = (status) => {
      prevId = status.prev === null ? "" : status.prev.id;
      prevButton.disabled = prevId === "";
      prevButton.title = status.prev === null ? "没有上一篇" : "上一篇（[）";
      prevButton.setAttribute("aria-label", prevButton.title);
      nextButton.disabled = status.discovering;
      if (status.discovering) {
        nextButton.title = "正在寻找下一篇…";
      } else if (status.next !== null) {
        nextButton.title = status.next.title === "" ? "下一篇（]）" : "下一篇（]）：" + status.next.title;
      } else if (status.error !== "") {
        nextButton.title = "没有找到下一篇：" + status.error + "（点击重试）";
      } else if (status.exhausted) {
        nextButton.title = "已到信息流末尾（点击重试）";
      } else {
        nextButton.title = "点击寻找下一篇（]）";
      }
      nextButton.setAttribute("aria-label", nextButton.title);
      statusNode.textContent = status.discovering ? "正在寻找下一篇…" : "";
      statusNode.hidden = !status.discovering;
    };
    prevButton.addEventListener("click", () => go(prevId));
    nextButton.addEventListener("click", advance);
    navigation.subscribe((status) => {
      if (host.hidden) return;
      renderStatus(status);
      if (pendingAdvanceSourceId === "") return;
      if (status.currentId !== pendingAdvanceSourceId || status.revision !== pendingAdvanceRevision) {
        clearPendingAdvance();
        return;
      }
      if (status.discovering) return;
      const taken = navigation.takeNext();
      clearPendingAdvance();
      if (taken !== null) go(taken.id);
    });
    document.addEventListener("keydown", (event) => {
      if (host.hidden || document.body.classList.contains(READER_CLASS) || event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isSiteAlertOpen() || eventHitsTypingTarget(event)) return;
      if (event.key === "[") {
        const prev = navigation.readStatus().prev;
        if (prev === null) return;
        event.preventDefault();
        go(prev.id);
      } else if (event.key === "]") {
        event.preventDefault();
        advance();
      }
    });
    const sync = () => {
      const id = readPostLinkId();
      if (id === "") {
        host.hidden = true;
        host.remove();
        currentId = "";
        navigating = false;
        clearPendingAdvance();
        navigation.sync("", null, []);
        return;
      }
      if (host.parentNode !== document.body) document.body.append(host);
      if (id !== currentId) {
        currentId = id;
        navigating = false;
        host.hidden = false;
      }
      const pageRoot = document.querySelector("#page-bbs-link");
      navigation.sync(id, pageRoot === null ? null : readPostMeta(pageRoot, ""), readRelatedPostLinks());
      renderStatus(navigation.readStatus());
    };
    registerPageSync(sync, 200, [PAGE_ROUTE.ARTICLE], "article");
    registerPageSync(recordFeedOrder, 1e3, [PAGE_ROUTE.FEED], "feed");
    sync();
    recordFeedOrder();
  }
  function readReaderScroll(id) {
    if (id === "") return 0;
    const value = Number(sessionStore.read(READER_SCROLL_KEY + id));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }
  function writeReaderScroll(id, index) {
    if (id === "") return;
    sessionStore.write(READER_SCROLL_KEY + id, String(index));
  }
  function readStoredReaderPositions() {
    const raw = localStore.readJson(STORAGE_KEYS.readerPositions, null);
    const container = asRecord(raw);
    if (container === null || container["version"] !== READER_POSITIONS_VERSION) {
      return { changed: raw !== null, positions: {} };
    }
    const stored = asRecord(container["positions"]);
    if (stored === null) return { changed: true, positions: {} };
    const cutoff = Date.now() - READER_POSITIONS_TTL_MS;
    const positions = {};
    let changed = false;
    for (const [id, value] of Object.entries(stored)) {
      const entry = asRecord(value);
      const ratio = entry === null ? Number.NaN : Number(entry["ratio"]);
      const updatedAt = entry === null ? Number.NaN : Number(entry["updatedAt"]);
      if (!POST_ID_PATTERN.test(id) || !Number.isFinite(ratio) || ratio < 0 || ratio > 1 || !Number.isFinite(updatedAt) || updatedAt <= cutoff) {
        changed = true;
        continue;
      }
      positions[id] = { ratio, updatedAt };
    }
    const ids = Object.keys(positions);
    if (ids.length > READER_POSITIONS_MAX) {
      changed = true;
      for (const id of ids.sort((a, b) => positions[a].updatedAt - positions[b].updatedAt).slice(0, ids.length - READER_POSITIONS_MAX)) {
        delete positions[id];
      }
    }
    return { changed, positions };
  }
  function writeStoredReaderPositions(positions) {
    localStore.writeJson(STORAGE_KEYS.readerPositions, {
      version: READER_POSITIONS_VERSION,
      positions
    });
  }
  function removeStoredReaderPosition(id) {
    if (id === "" || !POST_ID_PATTERN.test(id)) return;
    const { positions } = readStoredReaderPositions();
    if (!Object.prototype.hasOwnProperty.call(positions, id)) return;
    delete positions[id];
    writeStoredReaderPositions(positions);
  }
  function persistReaderRatio(id, ratio) {
    if (id === "" || !POST_ID_PATTERN.test(id) || !Number.isFinite(ratio) || ratio < 0 || ratio > 1) return;
    const { positions } = readStoredReaderPositions();
    positions[id] = { ratio, updatedAt: Date.now() };
    writeStoredReaderPositions(positions);
  }
  function readReaderRatio(id) {
    if (id === "") return -1;
    const stored = sessionStore.read(READER_RATIO_KEY + id);
    if (stored !== null) {
      const value = Number(stored);
      if (Number.isFinite(value) && value >= 0 && value <= 1) return value;
    }
    const { changed, positions } = readStoredReaderPositions();
    if (changed) writeStoredReaderPositions(positions);
    const saved = positions[id];
    return saved === void 0 ? -1 : saved.ratio;
  }
  function writeReaderRatio(id, ratio) {
    if (id === "") return;
    sessionStore.write(READER_RATIO_KEY + id, ratio.toFixed(4));
  }
  function ensureReaderStyle() {
    ensureStyleElement(READER_STYLE_ID, READER_CSS);
  }
  function watchReader(navigation) {
    if (!document.body) return;
    let host = null;
    let lightbox = null;
    let lightboxImage = null;
    let lightboxZoom = 0;
    let lightboxBaseWidth = 0;
    let lightboxNatural = { width: 0, height: 0 };
    let lightboxReturnFocus = null;
    let favourPanel = null;
    let favourButton = null;
    let spacingPanel = null;
    let spacingButton = null;
    let spacingInput = null;
    let historyPanel = null;
    let historyButton = null;
    let historyMeta = null;
    let historyList = null;
    let historyRail = null;
    let historyThumb = null;
    let historyPeek = null;
    let historyScrim = null;
    const historyNarrow = window.matchMedia("(max-width: 900px)");
    let historyPreviewX = 0;
    let articleId = "";
    let dismissedArticleId = "";
    let signature = "";
    let activeIndex = 0;
    let pageCount = 0;
    let toastTimer = 0;
    let coverIndex = 0;
    let coverTotal = 0;
    let observer = null;
    let scrollRaf = 0;
    let restoring = false;
    let lastActionSyncAt = 0;
    let progressScroll = null;
    let progressCurrent = null;
    let progressFill = null;
    let lastProgressPercent = -1;
    let ratioSaveTimer = 0;
    let durableRatioTimer = 0;
    let pendingRatio = null;
    let sourceCache = null;
    const suspendedEmbeds = /* @__PURE__ */ new Map();
    let nativeActionArticle = null;
    let nativeActionBox = null;
    let nativeFavourButton = null;
    let linkStateController = null;
    let commentLoadController = null;
    let favourLoadController = null;
    let readerGeneration = 0;
    let linkState = null;
    let linkStatePromise = null;
    let cyPublishedCount = 0;
    let articleCommentPublishedCount = 0;
    let actionBusy = false;
    let favourMenuBusy = false;
    let favourSaveBusy = false;
    let favourCreateBusy = false;
    let favourCreateController = null;
    let favourSaveController = null;
    let favourPanelFolders = [];
    let favourPanelChecked = /* @__PURE__ */ new Set();
    let favourPanelMembers = /* @__PURE__ */ new Set();
    let favourPanelUnknown = /* @__PURE__ */ new Set();
    let favourPanelFavourited = false;
    let favourPanelStatus = null;
    let favourPanelList = null;
    let favourPanelSave = null;
    let favourPanelCreateInput = null;
    let favourPanelCreateButton = null;
    let favourPanelClose = null;
    let cyDialog = null;
    let cyTextarea = null;
    let cySubmit = null;
    let cyStatus = null;
    let cyBusy = false;
    let articleCommentBusy = false;
    let pendingReplySeq = 0;
    const ARTICLE_COMMENT_MAX_LENGTH = 1e3;
    const liveCatalogBootstrap = () => {
      void loadRailEmojiCatalog().then((catalog) => {
        if (catalog !== null) {
          rebuildComposerEmojiPickers();
          if (commentPanel !== null && !commentPanel.hidden) renderReaderComments();
        }
      }).catch(() => void 0);
    };
    const articleComposerEmojiClosers = /* @__PURE__ */ new WeakMap();
    let articleComposerSelectionCleanup = null;
    const articleComposerImages = /* @__PURE__ */ new WeakMap();
    let articleComposerImageSeq = 0;
    let commentPanel = null;
    let commentPanelList = null;
    let lastCommentControlFocus = null;
    let commentPanelStatus = null;
    let commentPanelStatusText = null;
    let commentPanelRetry = null;
    let commentPanelMeta = null;
    let commentPanelMore = null;
    let commentPanelClose = null;
    let commentPanelRefresh = null;
    let articleReplyTarget = null;
    let commentState = createCommentState();
    const COMMENT_PANEL_STALE_MS = 60 * 1e3;
    let readerAccountId = "";
    const commentDeleteBusy = /* @__PURE__ */ new Set();
    const collapsedCommentThreads = /* @__PURE__ */ new Set();
    let readerPendingAdvanceSourceId = "";
    let readerPendingAdvanceRevision = -1;
    let readerAdvanceLocked = false;
    let readerAdvanceLockToken = 0;
    let readerPendingCard = null;
    let readerPendingTimer = 0;
    let readerPendingArticleId = "";
    let readerPendingGeneration = -1;
    function createCommentState() {
      return {
        items: [],
        page: 0,
        total: 0,
        loading: false,
        error: "",
        hasMore: false,
        loadedGroups: 0,
        loaded: false,
        loadedAt: 0,
        seq: 0,
        floorPages: /* @__PURE__ */ new Map(),
        pendingReplies: [],
        pendingBaselines: /* @__PURE__ */ new Map(),
        settledReplies: /* @__PURE__ */ new Set(),
        localFloors: [],
        localFloorMarks: /* @__PURE__ */ new Map()
      };
    }
    const showToast = (message) => {
      let toast = host?.querySelector(".hbu-reader-toast") ?? null;
      if (toast === null) {
        const created = document.createElement("div");
        created.className = "hbu-reader-toast hbu-reader-toast--fixed";
        created.setAttribute("aria-live", "polite");
        document.body.append(created);
        toast = created;
      }
      const toastNode = toast;
      toastNode.textContent = message;
      toastNode.dataset["show"] = "true";
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => {
        toastNode.dataset["show"] = "false";
        if (toastNode.parentElement === document.body) window.setTimeout(() => toastNode.remove(), 220);
      }, 1400);
    };
    const copyText = async (text) => {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      try {
        if (navigator.clipboard !== void 0 && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch (error) {
      }
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.top = "0";
      area.style.left = "0";
      area.style.width = "1px";
      area.style.height = "1px";
      area.style.padding = "0";
      area.style.border = "0";
      area.style.opacity = "0";
      area.style.pointerEvents = "none";
      document.body.append(area);
      area.select();
      area.setSelectionRange(0, area.value.length);
      let copied = false;
      try {
        copied = document.execCommand("copy");
      } catch (error) {
        copied = false;
      }
      area.remove();
      active?.focus({ preventScroll: true });
      return copied;
    };
    const shareArticle = async (data) => {
      const url = "https://www.xiaoheihe.cn/app/bbs/link/" + articleId;
      const title = data.title || document.title || "小黑盒帖子";
      if (typeof navigator.share === "function") {
        const payload = { title, text: title, url };
        const shareable = typeof navigator.canShare !== "function" || navigator.canShare(payload);
        if (shareable) {
          try {
            await navigator.share(payload);
            return;
          } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") return;
          }
        }
      }
      const copied = await copyText(url);
      showToast(copied ? "链接已复制" : "复制失败，请手动复制链接");
    };
    const articleActionBox = () => {
      if (nativeActionBox !== null && nativeActionBox.isConnected) return nativeActionBox;
      const article = sourceCache?.article?.isConnected === true ? sourceCache.article : document.querySelector("#page-bbs-link " + READER_SOURCE_ROOT_SELECTOR);
      if (article !== nativeActionArticle) {
        nativeActionArticle = article;
        nativeActionBox = null;
        nativeFavourButton = null;
      }
      const actionScope = article?.closest("#page-bbs-link") || document.querySelector("#page-bbs-link");
      nativeActionBox = Array.from(actionScope?.querySelectorAll(".link-reply__operation-box") || []).find((box) => box.closest("[data-comment-id]") === null) || null;
      return nativeActionBox;
    };
    const nativeLike = () => articleActionBox()?.querySelector("button:first-child") || null;
    const nativeFavour = () => {
      if (nativeFavourButton !== null && nativeFavourButton.isConnected) return nativeFavourButton;
      const scoped = articleActionBox()?.querySelector(".hb-cpt__favour-btn") || null;
      nativeFavourButton = scoped instanceof HTMLButtonElement ? scoped : Array.from(document.querySelectorAll("#page-bbs-link .hb-cpt__favour-btn")).find((node) => node.closest("[data-comment-id]") === null) || null;
      return nativeFavourButton;
    };
    const readCounts = () => {
      const values = Array.from(articleActionBox()?.querySelectorAll(".link-reply__operation-desc") || []).map((node) => (node.textContent || "").trim());
      return { like: values[0] || "0", favour: values[1] || "0", comment: values[2] || "0" };
    };
    const formatActionCount = (value) => {
      const count = Math.max(0, Number(value) || 0);
      if (count >= 1e8) return (count / 1e8).toFixed(1).replace(/\.0$/, "") + "亿";
      if (count >= 1e4) return (count / 1e4).toFixed(1).replace(/\.0$/, "") + "万";
      return String(count);
    };
    const postReaderApi = async (path, body, accountId, signal) => {
      if (typeof accountId !== "string" || accountId === "") throw new Error("请先登录小黑盒");
      const params = path === COMMENT_CREATE_API_PATH ? await createCommentCreateQuery(path) : { ...createApiParams(path), heybox_id: accountId, target: "heybox_app" };
      const query = new URLSearchParams(params);
      const response = await fetchWithTimeout("https://api.xiaoheihe.cn" + path + "?" + query.toString(), {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams(body).toString(),
        ...signal !== void 0 ? { signal } : {}
      });
      if (!response.ok) throw new Error("接口返回 HTTP " + response.status);
      const payload = await response.json();
      const data = asRecord(payload) ?? {};
      if (data["status"] === "login") throw new Error("请先登录小黑盒");
      if (data["status"] !== "ok") throw new Error(String(data["msg"] || "操作失败"));
      return data["result"];
    };
    const fetchFavourFolders = async (signal, accountId) => {
      if (typeof accountId !== "string" || accountId === "") throw new Error("请先登录小黑盒");
      const path = "/bbs/app/profile/fav/folders";
      const query = new URLSearchParams({ ...createApiParams(path), heybox_id: accountId, target: "heybox_app" });
      const response = await fetchWithTimeout("https://api.xiaoheihe.cn" + path + "?" + query.toString(), {
        credentials: "include",
        cache: "no-store",
        headers: { accept: "application/json" },
        signal
      });
      if (!response.ok) throw new Error("接口返回 HTTP " + response.status);
      const payload = await response.json();
      const data = asRecord(payload) ?? {};
      if (data["status"] === "login") throw new Error("请先登录小黑盒");
      if (data["status"] !== "ok") throw new Error(String(data["msg"] || "获取收藏夹失败"));
      const result = asRecord(data["result"]);
      const folders = result !== null && Array.isArray(result["folders"]) ? result["folders"] : [];
      return normalizeFavourFolders(folders);
    };
    const FAVOUR_SCAN_PAGE_SIZE = 30;
    const FAVOUR_SCAN_MAX_PAGES = 10;
    const FAVOUR_SCAN_MAX_REQUESTS = 48;
    const fetchFavourFolderLinks = async (folderId, offset, accountId, signal) => {
      const path = "/bbs/app/profile/fav/folder/v2/links";
      const query = new URLSearchParams({
        ...createApiParams(path),
        heybox_id: accountId,
        target: "heybox_app",
        enable_new_style_collect: "1",
        folder_id: folderId,
        offset: String(offset),
        limit: String(FAVOUR_SCAN_PAGE_SIZE),
        dw: "660"
      });
      const response = await fetchWithTimeout("https://api.xiaoheihe.cn" + path + "?" + query.toString(), {
        credentials: "include",
        cache: "no-store",
        headers: { accept: "application/json" },
        signal
      });
      if (!response.ok) throw new Error("接口返回 HTTP " + response.status);
      const payload = await response.json();
      const data = asRecord(payload) ?? {};
      if (data["status"] === "login") throw new Error("请先登录小黑盒");
      if (data["status"] !== "ok") throw new Error(String(data["msg"] || "读取收藏夹失败"));
      return readFavourFolderPage(data["result"]);
    };
    const scanFavourFolder = async (folderId, accountId, signal, budget) => {
      const ids = /* @__PURE__ */ new Set();
      let offset = 0;
      for (let page = 0; page < FAVOUR_SCAN_MAX_PAGES; page += 1) {
        if (budget.left <= 0) return { ids, complete: false };
        budget.left -= 1;
        const result = await fetchFavourFolderLinks(folderId, offset, accountId, signal);
        for (const id of result.linkIds) ids.add(id);
        if (result.linkIds.length < FAVOUR_SCAN_PAGE_SIZE) return { ids, complete: true };
        offset += FAVOUR_SCAN_PAGE_SIZE;
      }
      return { ids, complete: false };
    };
    const scanFavourMemberships = async (folders, accountId, signal) => {
      const scans = /* @__PURE__ */ new Map();
      const budget = { left: FAVOUR_SCAN_MAX_REQUESTS };
      for (const folder of folders) {
        try {
          scans.set(folder.id, await scanFavourFolder(folder.id, accountId, signal, budget));
        } catch (error) {
          if (isAbortError(error)) throw error;
          scans.set(folder.id, { ids: /* @__PURE__ */ new Set(), complete: false });
        }
      }
      const signatures = /* @__PURE__ */ new Set();
      let completeScans = 0;
      for (const folder of folders) {
        const scan = scans.get(folder.id);
        if (scan === void 0 || !scan.complete) continue;
        completeScans += 1;
        signatures.add(Array.from(scan.ids).sort().join(","));
      }
      const filterSuspicious = folders.length >= 2 && completeScans >= 2 && signatures.size === 1;
      for (const folder of folders) {
        const scan = scans.get(folder.id);
        if (scan === void 0 || !scan.complete || filterSuspicious) {
          favourPanelUnknown.add(folder.id);
          continue;
        }
        if (scan.ids.has(articleId)) favourPanelMembers.add(folder.id);
      }
    };
    const addPublishedActions = (link, publishedCy, publishedComments) => {
      if (publishedCy > 0) {
        link.commentCount = (Number(link.commentCount) || 0) + publishedCy;
        link.cyCount = Math.max(0, Number(link.cyCount) || 0) + publishedCy;
      }
      if (publishedComments > 0) {
        link.commentCount = (Number(link.commentCount) || 0) + publishedComments;
      }
      return link;
    };
    const loadLinkState = async (accountId = "") => {
      if (articleId === "") return null;
      if (linkStatePromise !== null) return linkStatePromise;
      const targetId = articleId;
      const resolved = typeof accountId === "string" ? accountId : "";
      const controller = new AbortController();
      linkStateController = controller;
      const publishedAtStart = cyPublishedCount;
      const commentsAtStart = articleCommentPublishedCount;
      linkStatePromise = (async () => {
        try {
          const page = await fetchRailPage(targetId, 1, { signal: controller.signal, accountId: resolved });
          if (articleId !== targetId || linkStateController !== controller) return null;
          const publishedDuringRequest = cyPublishedCount - publishedAtStart;
          const commentsDuringRequest = articleCommentPublishedCount - commentsAtStart;
          linkState = addPublishedActions(page.link, publishedDuringRequest, commentsDuringRequest);
          if (publishedDuringRequest > 0 || commentsDuringRequest > 0) clearRailPageCache(targetId);
          syncActionStates();
          return linkState;
        } catch (error) {
          return null;
        } finally {
          if (linkStateController === controller) {
            linkStateController = null;
            linkStatePromise = null;
          }
        }
      })();
      return linkStatePromise;
    };
    const toggleLike = async () => {
      if (actionBusy || articleId === "") return;
      actionBusy = true;
      const targetId = articleId;
      const generation = readerGeneration;
      try {
        const accountId = await resolveHeyboxId();
        if (articleId !== targetId || readerGeneration !== generation) return;
        if (accountId === "") throw new Error("请先登录小黑盒");
        const counts = readCounts();
        const current = linkState === null ? await loadLinkState(accountId) : linkState;
        if (articleId !== targetId || readerGeneration !== generation) return;
        const on = current !== null && current.isAward;
        const base = current === null ? parseCompactCount(counts.like) : current.awardCount;
        await postReaderApi("/bbs/app/profile/award/link", {
          link_id: targetId,
          award_type: on ? "0" : "1"
        }, accountId);
        if (articleId !== targetId || readerGeneration !== generation) return;
        linkState = {
          ...current || {
            isAward: false,
            isFavour: false,
            awardCount: base,
            favourCount: parseCompactCount(counts.favour),
            commentCount: parseCompactCount(counts.comment),
            cyCount: cyPublishedCount
          },
          isAward: !on,
          awardCount: Math.max(0, base + (on ? -1 : 1))
        };
        syncActionStates();
        showToast(on ? "已取消点赞" : "已点赞");
      } catch (error) {
        if (articleId === targetId && readerGeneration === generation) {
          showToast(error instanceof Error ? error.message : "点赞失败");
        }
      } finally {
        if (articleId === targetId && readerGeneration === generation) {
          actionBusy = false;
        }
      }
    };
    const currentFavourPlan = () => planFavourChanges({
      favourited: favourPanelFavourited,
      folderIds: favourPanelFolders.map((folder) => folder.id),
      checkedIds: Array.from(favourPanelChecked),
      memberIds: Array.from(favourPanelMembers),
      unknownIds: Array.from(favourPanelUnknown)
    });
    const applyFavourState = (next) => {
      if (linkState === null || linkState.isFavour === next) return;
      linkState = {
        ...linkState,
        isFavour: next,
        favourCount: Math.max(0, linkState.favourCount + (next ? 1 : -1))
      };
      syncActionStates();
    };
    const setFavourStatus = (message, error = false) => {
      if (favourPanelStatus === null) return;
      favourPanelStatus.textContent = message;
      if (error) favourPanelStatus.dataset["tone"] = "error";
      else delete favourPanelStatus.dataset["tone"];
    };
    const refreshFavourControls = () => {
      if (favourPanel === null) return;
      const busy = favourLoadController !== null || favourSaveBusy || favourCreateBusy;
      for (const control of favourPanel.querySelectorAll("input, button")) {
        control.disabled = busy;
      }
      if (favourPanelSave !== null) {
        const plan = currentFavourPlan();
        favourPanelSave.disabled = busy || !planHasFavourChange(plan);
      }
      if (favourPanelClose !== null) favourPanelClose.disabled = favourSaveBusy;
    };
    const syncActionStates = () => {
      if (host === null) return;
      const like = nativeLike();
      const favour = nativeFavour();
      const counts = linkState === null ? readCounts() : {
        like: formatActionCount(linkState.awardCount),
        favour: formatActionCount(linkState.favourCount),
        comment: formatActionCount(linkState.commentCount)
      };
      const likeNode = host.querySelector('[data-action="like"]');
      const favourNode = host.querySelector('[data-action="favour"]');
      const commentNode = host.querySelector('[data-action="comment"]');
      if (likeNode !== null) {
        const on2 = linkState === null ? like !== null && (like.getAttribute("aria-pressed") === "true" || like.classList.contains("active")) : linkState.isAward;
        likeNode.setAttribute("aria-pressed", String(on2));
        const markup = (on2 ? READER_ICONS.likeOn : READER_ICONS.like) + '<span class="hbu-reader-action-count">' + counts.like + "</span>";
        if (likeNode.innerHTML !== markup) likeNode.innerHTML = markup;
      }
      if (favourNode !== null) {
        const on2 = linkState === null ? favour !== null && (favour.getAttribute("aria-pressed") === "true" || favour.classList.contains("active")) : linkState.isFavour;
        favourNode.setAttribute("aria-pressed", String(on2));
        const markup = (on2 ? READER_ICONS.starOn : READER_ICONS.star) + '<span class="hbu-reader-action-count">' + counts.favour + "</span>";
        if (favourNode.innerHTML !== markup) favourNode.innerHTML = markup;
      }
      if (commentNode !== null) {
        const markup = READER_ICONS.comment + '<span class="hbu-reader-action-count">' + counts.comment + "</span>";
        if (commentNode.innerHTML !== markup) commentNode.innerHTML = markup;
      }
      const cyNode = host.querySelector('[data-action="cy"]');
      if (cyNode !== null) {
        const cyTotal = linkState === null ? cyPublishedCount : Math.max(0, Number(linkState.cyCount) || 0);
        const label = "CY " + formatActionCount(cyTotal);
        const markup = '<span class="hbu-reader-cy-label">CY</span><span class="hbu-reader-cy-count">' + formatActionCount(cyTotal) + "</span>";
        if (cyNode.innerHTML !== markup) cyNode.innerHTML = markup;
        if (cyNode.title !== label) cyNode.title = label;
        if (cyNode.getAttribute("aria-label") !== label) cyNode.setAttribute("aria-label", label);
      }
      for (const stat of host.querySelectorAll("[data-stat]")) {
        const valueNode = stat.querySelector("b");
        const key = stat.dataset["stat"];
        if (key !== "like" && key !== "favour" && key !== "comment") continue;
        if (valueNode !== null && valueNode.textContent !== counts[key]) {
          valueNode.textContent = counts[key];
        }
      }
      const nativeFollowButton = document.querySelector("#page-bbs-link .link-user__follow-btn");
      const on = isFollowedAuthor(nativeFollowButton);
      for (const followNode of host.querySelectorAll(".hbu-reader-follow")) {
        followNode.setAttribute("aria-pressed", String(on));
        if (followNode.textContent !== (on ? "已关注" : "关注")) followNode.textContent = on ? "已关注" : "关注";
      }
    };
    const clickNative = (selector) => {
      const node = document.querySelector("#page-bbs-link " + selector);
      if (node instanceof HTMLElement) node.click();
    };
    const toggleFollowAuthor = () => {
      clickNative(".link-user__follow-btn");
      window.setTimeout(syncActionStates, 400);
      window.setTimeout(syncActionStates, 1200);
    };
    const closeFavourMenu = (focusButton = false, force = false) => {
      if ((favourSaveBusy || favourCreateBusy) && !force) return;
      const wasOpen = favourPanel !== null && !favourPanel.hidden;
      favourLoadController?.abort();
      favourLoadController = null;
      if (favourPanel !== null) {
        favourPanel.hidden = true;
        favourButton?.setAttribute("aria-expanded", "false");
      }
      favourPanelFolders = [];
      favourPanelChecked = /* @__PURE__ */ new Set();
      favourPanelMembers = /* @__PURE__ */ new Set();
      favourPanelUnknown = /* @__PURE__ */ new Set();
      favourPanelFavourited = false;
      if (focusButton && wasOpen) favourButton?.focus({ preventScroll: true });
    };
    const resetFavourPanel = () => {
      favourLoadController?.abort();
      favourLoadController = null;
      favourSaveController?.abort();
      favourSaveController = null;
      favourCreateController?.abort();
      favourCreateController = null;
      favourMenuBusy = false;
      favourSaveBusy = false;
      favourCreateBusy = false;
      favourPanelFolders = [];
      favourPanelChecked = /* @__PURE__ */ new Set();
      favourPanelMembers = /* @__PURE__ */ new Set();
      favourPanelUnknown = /* @__PURE__ */ new Set();
      favourPanelFavourited = false;
      favourPanel = null;
      favourPanelStatus = null;
      favourPanelList = null;
      favourPanelSave = null;
      favourPanelCreateInput = null;
      favourPanelCreateButton = null;
      favourPanelClose = null;
      favourButton = null;
    };
    document.addEventListener("pointerdown", (event) => {
      if (favourPanel === null || favourPanel.hidden) return;
      const target = event.target instanceof Node ? event.target : null;
      if (favourPanel.contains(target) || favourButton?.contains(target)) return;
      closeFavourMenu();
    }, true);
    const closeSpacingMenu = () => {
      if (spacingPanel === null) return;
      spacingPanel.hidden = true;
      spacingButton?.setAttribute("aria-expanded", "false");
    };
    document.addEventListener("pointerdown", (event) => {
      if (spacingPanel === null || spacingPanel.hidden) return;
      const target = event.target instanceof Node ? event.target : null;
      if (spacingPanel.contains(target) || spacingButton?.contains(target)) return;
      closeSpacingMenu();
    }, true);
    const commitSpacingInput = () => {
      if (spacingInput === null) return;
      const next = parseReaderLineHeightInput(spacingInput.value);
      const value = next === null ? readReaderLineHeight() : setReaderLineHeightPreference(next);
      spacingInput.value = String(value);
      syncNumberInput(readerLineHeightInput, value);
    };
    const isHistoryDrawerOpen = () => historyNarrow.matches && host?.dataset["timelineOpen"] === "true";
    const syncHistoryPanelMode = () => {
      if (historyPanel === null) return;
      if (historyNarrow.matches) {
        const open = isHistoryDrawerOpen();
        if (open) historyPanel.removeAttribute("inert");
        else historyPanel.setAttribute("inert", "");
        historyPanel.setAttribute("aria-hidden", String(!open));
        if (historyScrim !== null) historyScrim.hidden = !open;
        historyButton?.setAttribute("aria-expanded", String(open));
        return;
      }
      if (host !== null) delete host.dataset["timelineOpen"];
      historyPanel.removeAttribute("inert");
      historyPanel.removeAttribute("aria-hidden");
      if (historyScrim !== null) historyScrim.hidden = true;
      historyButton?.setAttribute("aria-expanded", "false");
    };
    const openHistoryDrawer = () => {
      if (host === null || historyPanel === null || historyButton === null) return;
      closeFavourMenu();
      closeSpacingMenu();
      host.dataset["timelineOpen"] = "true";
      syncHistoryPanelMode();
      const currentRow = historyPanel.querySelector(".hbu-reader-history-row[aria-current='true']");
      currentRow?.scrollIntoView?.({ block: "nearest" });
      currentRow?.focus({ preventScroll: true });
    };
    const closeHistoryDrawer = (returnFocus = false) => {
      if (host === null) return;
      if (!isHistoryDrawerOpen()) {
        syncHistoryPanelMode();
        return;
      }
      delete host.dataset["timelineOpen"];
      if (returnFocus) {
        historyButton?.focus({ preventScroll: true });
      }
      syncHistoryPanelMode();
    };
    document.addEventListener("pointerdown", (event) => {
      if (!isHistoryDrawerOpen() || historyPanel === null) return;
      const target = event.target instanceof Node ? event.target : null;
      if (historyPanel.contains(target) || historyButton?.contains(target)) return;
      closeHistoryDrawer();
    }, true);
    historyNarrow.addEventListener("change", syncHistoryPanelMode);
    const historyProgressLabel = (id) => {
      const ratio = readReaderRatio(id);
      if (ratio < 0) return "";
      return ratio >= 0.98 ? "读完" : Math.round(ratio * 100) + "%";
    };
    const renderHistoryPanel = () => {
      if (historyList === null || historyRail === null || historyThumb === null) return;
      const status = navigation.readStatus();
      const total = status.history.length;
      const currentIndex = status.history.findIndex((entry) => entry.current);
      if (historyMeta !== null) {
        historyMeta.textContent = total === 0 ? "还没有访问记录" : "共 " + total + " 篇 · 正在阅读第 " + (currentIndex + 1) + " 篇";
      }
      historyList.textContent = "";
      const ordered = status.history.slice().reverse();
      for (const [orderIndex, entry] of ordered.entries()) {
        const item = document.createElement("li");
        item.className = "hbu-reader-history-item";
        if (entry.current) item.dataset["current"] = "true";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "hbu-reader-history-row";
        button.dataset["id"] = entry.id;
        if (entry.current) button.setAttribute("aria-current", "true");
        const marker = document.createElement("span");
        marker.className = "hbu-reader-history-dot";
        const label = document.createElement("span");
        label.className = "hbu-reader-history-title";
        const rowTitle = entry.title === "" ? "帖子 " + entry.id : entry.title;
        label.textContent = rowTitle;
        const visitNumber = total - orderIndex;
        const ratio = readReaderRatio(entry.id);
        const progressText = historyProgressLabel(entry.id);
        button.setAttribute("aria-label", "第 " + visitNumber + " 篇，共 " + total + " 篇：" + rowTitle + (progressText === "" ? "" : ratio >= 0.98 ? "，已读完" : "，已读 " + progressText) + (entry.current ? "，正在阅读" : ""));
        button.append(marker, label);
        if (ratio >= 0) {
          const bar = document.createElement("span");
          bar.className = "hbu-reader-history-bar";
          bar.setAttribute("aria-hidden", "true");
          const fill = document.createElement("i");
          fill.style.width = Math.max(3, Math.round(ratio * 100)) + "%";
          bar.append(fill);
          button.append(bar);
        }
        if (progressText !== "") {
          const progress = document.createElement("span");
          progress.className = "hbu-reader-history-progress";
          progress.textContent = progressText;
          progress.title = ratio >= 0.98 ? "上次读到末尾" : "上次读到 " + progressText;
          button.append(progress);
        }
        if (entry.current) {
          const current = document.createElement("span");
          current.className = "hbu-reader-history-current";
          current.textContent = "正在阅读";
          button.append(current);
        }
        button.addEventListener("click", () => {
          if (entry.current) {
            closeHistoryDrawer(true);
            return;
          }
          closeHistoryDrawer();
          openReaderArticle(entry.id);
        });
        button.addEventListener("keydown", (event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          const rows = Array.from(historyList?.querySelectorAll(".hbu-reader-history-row") ?? []);
          const at = rows.indexOf(button);
          const next = rows[at + (event.key === "ArrowDown" ? 1 : -1)];
          if (next === void 0) return;
          event.preventDefault();
          next.focus({ preventScroll: false });
        });
        item.append(button);
        historyList.append(item);
      }
      if (ordered.length === 0) {
        const empty = document.createElement("li");
        empty.className = "hbu-reader-history-empty";
        empty.textContent = "读完几篇后，这里会留下访问顺序。";
        historyList.append(empty);
      }
      const previewIndex = Math.max(0, currentIndex);
      historyPreviewX = previewIndex;
      renderHistoryRail(previewIndex, total);
      historyThumb.setAttribute("data-preview", "false");
    };
    const renderHistoryRail = (index, total) => {
      if (historyRail === null || historyThumb === null) return;
      const track = historyRail.querySelector(".hbu-reader-history-track");
      if (track === null) return;
      for (const tick of Array.from(track.querySelectorAll(".hbu-reader-history-tick"))) tick.remove();
      const tickCount = total > 1 && total <= 30 ? total : 0;
      for (let i = 0; i < tickCount; i += 1) {
        const tick = document.createElement("span");
        tick.className = "hbu-reader-history-tick";
        tick.style.top = historyRailOffset(i, total) * 100 + "%";
        track.append(tick);
      }
      historyThumb.style.top = historyRailOffset(index, total) * 100 + "%";
      historyThumb.textContent = total === 0 ? "0/0" : index + 1 + "/" + total;
      historyThumb.setAttribute("aria-valuemin", total === 0 ? "0" : "1");
      historyThumb.setAttribute("aria-valuemax", String(total));
      historyThumb.setAttribute("aria-valuenow", String(total === 0 ? 0 : index + 1));
      historyThumb.setAttribute("aria-valuetext", total === 0 ? "暂无记录" : "第 " + (index + 1) + " 篇，共 " + total + " 篇");
      historyThumb.disabled = total === 0;
      historyRail.hidden = total === 0;
      if (historyPeek !== null) {
        const entry = navigation.readStatus().history[index];
        if (entry === void 0 || entry.title === "") historyPeek.textContent = "";
        else {
          const progress = historyProgressLabel(entry.id);
          historyPeek.textContent = entry.title + (progress === "" ? "" : " · " + progress);
        }
        historyPeek.hidden = historyPeek.textContent === "";
      }
    };
    const historyRailOffset = (index, total) => {
      if (total <= 1) return 0;
      return (total - 1 - index) / (total - 1);
    };
    const historyIndexFromRatio = (ratio, total) => {
      if (total <= 0) return 0;
      const clamped = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
      return total - 1 - Math.round(clamped * (total - 1));
    };
    const previewHistoryIndex = (index) => {
      const total = navigation.readStatus().history.length;
      const next = Math.min(Math.max(0, index), Math.max(0, total - 1));
      historyPreviewX = next;
      renderHistoryRail(next, total);
      historyThumb?.setAttribute("data-preview", "true");
      if (historyList !== null) {
        const rows = Array.from(historyList.querySelectorAll(".hbu-reader-history-row"));
        const previewRow = rows[total - 1 - next];
        for (const row of rows) row.removeAttribute("data-preview");
        previewRow?.setAttribute("data-preview", "true");
        previewRow?.scrollIntoView?.({ block: "nearest" });
      }
      return next;
    };
    const commitHistoryIndex = (index) => {
      const entry = navigation.readStatus().history[index];
      if (entry === void 0 || entry.current) {
        renderHistoryPanel();
        return;
      }
      closeHistoryDrawer();
      openReaderArticle(entry.id);
    };
    const bindHistoryRail = (railBody, track, thumb) => {
      let dragging = false;
      const ratioAt = (clientY) => {
        const rect = railBody.getBoundingClientRect();
        if (rect.height <= 0) return 0;
        return (clientY - rect.top) / rect.height;
      };
      const moveTo = (clientY) => {
        const total = navigation.readStatus().history.length;
        return previewHistoryIndex(historyIndexFromRatio(ratioAt(clientY), total));
      };
      const endDrag = (event) => {
        if (!dragging) return;
        dragging = false;
        thumb.dataset["dragging"] = "false";
        if (thumb.hasPointerCapture(event.pointerId)) thumb.releasePointerCapture(event.pointerId);
        commitHistoryIndex(historyPreviewX);
      };
      thumb.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        dragging = true;
        thumb.dataset["dragging"] = "true";
        thumb.setPointerCapture(event.pointerId);
        moveTo(event.clientY);
      });
      thumb.addEventListener("pointermove", (event) => {
        if (!dragging) return;
        moveTo(event.clientY);
      });
      thumb.addEventListener("pointerup", endDrag);
      thumb.addEventListener("pointercancel", (event) => {
        if (!dragging) return;
        dragging = false;
        thumb.dataset["dragging"] = "false";
        if (thumb.hasPointerCapture(event.pointerId)) thumb.releasePointerCapture(event.pointerId);
        renderHistoryPanel();
      });
      track.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        commitHistoryIndex(moveTo(event.clientY));
      });
      thumb.addEventListener("keydown", (event) => {
        const total = navigation.readStatus().history.length;
        if (total === 0) return;
        let next = historyPreviewX;
        if (event.key === "ArrowUp" || event.key === "ArrowRight") next += 1;
        else if (event.key === "ArrowDown" || event.key === "ArrowLeft") next -= 1;
        else if (event.key === "Home") next = total - 1;
        else if (event.key === "End") next = 0;
        else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          commitHistoryIndex(historyPreviewX);
          return;
        } else return;
        event.preventDefault();
        previewHistoryIndex(next);
      });
    };
    const mountHistoryTimeline = () => {
      if (host === null || historyPanel !== null) return;
      const panel = document.createElement("div");
      panel.className = "hbu-reader-history-menu";
      panel.setAttribute("role", "group");
      panel.setAttribute("aria-label", "阅读时间轴");
      panel.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || !isHistoryDrawerOpen()) return;
        event.preventDefault();
        event.stopPropagation();
        closeHistoryDrawer(true);
      });
      const heading = document.createElement("div");
      heading.className = "hbu-reader-history-head";
      const headText = document.createElement("div");
      headText.className = "hbu-reader-history-head-text";
      const label = document.createElement("div");
      label.className = "hbu-reader-history-label";
      label.textContent = "阅读时间轴";
      const meta = document.createElement("div");
      meta.className = "hbu-reader-history-meta";
      meta.setAttribute("aria-live", "polite");
      headText.append(label, meta);
      const close = document.createElement("button");
      close.type = "button";
      close.className = "hbu-reader-history-close";
      close.setAttribute("aria-label", "关闭阅读时间轴");
      close.innerHTML = READER_ICONS.close;
      close.addEventListener("click", () => closeHistoryDrawer(true));
      heading.append(headText, close);
      const body = document.createElement("div");
      body.className = "hbu-reader-history-body";
      const list = document.createElement("ol");
      list.className = "hbu-reader-history-list";
      const railTrack = document.createElement("div");
      railTrack.className = "hbu-reader-history-track";
      const thumb = document.createElement("button");
      thumb.type = "button";
      thumb.className = "hbu-reader-history-thumb";
      thumb.setAttribute("role", "slider");
      thumb.setAttribute("aria-label", "阅读时间轴位置");
      thumb.setAttribute("aria-orientation", "vertical");
      thumb.setAttribute("aria-valuemin", "0");
      thumb.setAttribute("aria-valuemax", "0");
      thumb.setAttribute("aria-valuenow", "0");
      thumb.title = "拖动快速跳转，点击跳回当前篇";
      const railBody = document.createElement("div");
      railBody.className = "hbu-reader-history-rail";
      railBody.append(railTrack, thumb);
      const peek = document.createElement("div");
      peek.className = "hbu-reader-history-peek";
      peek.hidden = true;
      peek.setAttribute("role", "status");
      peek.setAttribute("aria-live", "polite");
      peek.setAttribute("aria-atomic", "true");
      body.append(list, railBody);
      panel.append(heading, body, peek);
      const scrim = document.createElement("div");
      scrim.className = "hbu-reader-history-scrim";
      scrim.hidden = true;
      scrim.addEventListener("pointerdown", () => closeHistoryDrawer(true));
      historyPanel = panel;
      historyMeta = meta;
      historyList = list;
      historyRail = railBody;
      historyThumb = thumb;
      historyPeek = peek;
      historyScrim = scrim;
      bindHistoryRail(railBody, railTrack, thumb);
      host.append(scrim, panel);
      renderHistoryPanel();
      syncHistoryPanelMode();
      const currentRow = panel.querySelector(".hbu-reader-history-row[aria-current='true']");
      currentRow?.scrollIntoView?.({ block: "nearest" });
    };
    const createHistoryAction = () => {
      const history2 = document.createElement("button");
      history2.type = "button";
      history2.className = "hbu-reader-action";
      history2.dataset["action"] = "history";
      history2.setAttribute("aria-label", "阅读时间轴");
      history2.setAttribute("aria-haspopup", "true");
      history2.setAttribute("aria-expanded", "false");
      history2.title = "阅读时间轴";
      history2.innerHTML = READER_ICONS.history;
      history2.addEventListener("click", () => {
        if (isHistoryDrawerOpen()) closeHistoryDrawer(true);
        else openHistoryDrawer();
      });
      return history2;
    };
    const syncHistoryTimeline = () => {
      if (host === null) return;
      const rail = host.querySelector(".hbu-reader-rail");
      if (rail === null) return;
      const existing = rail.querySelector('[data-action="history"]');
      if (!readReaderTimelinePreference()) {
        delete host.dataset["timelineOpen"];
        host.classList.remove("hbu-reader-has-timeline");
        existing?.remove();
        historyPanel?.remove();
        historyScrim?.remove();
        historyPanel = null;
        historyMeta = null;
        historyList = null;
        historyRail = null;
        historyThumb = null;
        historyPeek = null;
        historyScrim = null;
        historyButton = null;
        historyPreviewX = 0;
        return;
      }
      host.classList.add("hbu-reader-has-timeline");
      historyButton = existing;
      if (historyButton === null) {
        const spacing = rail.querySelector('[data-action="spacing"]');
        const history2 = createHistoryAction();
        historyButton = history2;
        if (spacing === null) rail.append(history2);
        else rail.insertBefore(history2, spacing);
      }
      if (historyPanel === null) mountHistoryTimeline();
      else renderHistoryPanel();
      syncHistoryPanelMode();
    };
    const openSpacingMenu = (rail, button) => {
      if (spacingPanel !== null && !spacingPanel.hidden) {
        closeSpacingMenu();
        button.focus({ preventScroll: true });
        return;
      }
      closeFavourMenu();
      closeHistoryDrawer();
      if (spacingPanel === null) {
        const panel = document.createElement("div");
        panel.className = "hbu-reader-spacing-menu";
        panel.hidden = true;
        panel.setAttribute("role", "group");
        panel.setAttribute("aria-label", "沉浸阅读设置");
        const label = document.createElement("div");
        label.className = "hbu-reader-spacing-label";
        label.textContent = "正文行距";
        const row = document.createElement("div");
        row.className = "hbu-reader-spacing-row";
        const input = document.createElement("input");
        input.type = "number";
        input.min = String(READER_LINE_HEIGHT_MIN);
        input.max = String(READER_LINE_HEIGHT_MAX);
        input.step = String(READER_LINE_HEIGHT_STEP);
        input.inputMode = "decimal";
        input.setAttribute("aria-label", "正文行距倍数");
        input.title = "正文行距 " + READER_LINE_HEIGHT_MIN + " - " + READER_LINE_HEIGHT_MAX + " 倍";
        const unit = document.createElement("span");
        unit.className = "hbu-reader-spacing-unit";
        unit.textContent = "倍";
        const reset = document.createElement("button");
        reset.type = "button";
        reset.className = "hbu-reader-spacing-reset";
        reset.textContent = "默认";
        reset.title = "恢复默认行距 " + READER_LINE_HEIGHT_DEFAULT + " 倍";
        reset.addEventListener("click", () => {
          const value = setReaderLineHeightPreference(READER_LINE_HEIGHT_DEFAULT);
          if (spacingInput !== null) spacingInput.value = String(value);
          syncNumberInput(readerLineHeightInput, value);
        });
        row.append(input, unit, reset);
        const spacingSection = document.createElement("div");
        spacingSection.className = "hbu-reader-setting-section";
        spacingSection.append(label, row);
        const historySection = document.createElement("div");
        historySection.className = "hbu-reader-setting-section";
        const timelineToggle2 = document.createElement("button");
        timelineToggle2.type = "button";
        timelineToggle2.className = "hbu-reader-setting-switch";
        timelineToggle2.setAttribute("role", "switch");
        timelineToggle2.setAttribute("aria-label", "启用阅读时间轴");
        timelineToggle2.textContent = "显示阅读时间轴";
        timelineToggle2.setAttribute("aria-checked", String(readReaderTimelinePreference()));
        timelineToggle2.addEventListener("click", () => {
          const enabled = timelineToggle2.getAttribute("aria-checked") !== "true";
          timelineToggle2.setAttribute("aria-checked", String(enabled));
          setReaderTimelinePreference(enabled);
        });
        const historyLine = document.createElement("label");
        historyLine.className = "hbu-reader-setting-line";
        historyLine.textContent = "时间轴保留条数";
        const historyInput2 = document.createElement("input");
        historyInput2.type = "number";
        historyInput2.min = "0";
        historyInput2.step = "1";
        historyInput2.inputMode = "numeric";
        historyInput2.setAttribute("aria-label", "时间轴保留条数，0 表示不限");
        historyInput2.title = "设置为 0 表示不限条数";
        historyInput2.value = String(readReaderHistoryLimit());
        historyInput2.addEventListener("change", () => {
          const parsed = parseReaderHistoryLimitInput(historyInput2.value);
          const value = parsed === null ? readReaderHistoryLimit() : setReaderHistoryLimitPreference(parsed);
          historyInput2.value = String(value);
        });
        historyLine.append(historyInput2);
        historySection.append(timelineToggle2, historyLine);
        panel.append(spacingSection, historySection);
        bindNumberInput(input, commitSpacingInput);
        spacingPanel = panel;
        spacingInput = input;
      }
      spacingButton = button;
      if (spacingPanel.parentNode !== rail) rail.append(spacingPanel);
      if (spacingInput === null) return;
      spacingInput.value = String(readReaderLineHeight());
      const timelineToggle = spacingPanel.querySelector(".hbu-reader-setting-switch");
      timelineToggle?.setAttribute("aria-checked", String(readReaderTimelinePreference()));
      const historyInput = spacingPanel.querySelector(".hbu-reader-setting-line input");
      if (historyInput !== null) historyInput.value = String(readReaderHistoryLimit());
      spacingPanel.hidden = false;
      button.setAttribute("aria-expanded", "true");
      spacingInput.focus({ preventScroll: true });
    };
    const ensureFavourPanel = (rail) => {
      if (favourPanel === null) {
        const panel = document.createElement("div");
        panel.className = "hbu-reader-favour-menu";
        panel.hidden = true;
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-label", "收藏到收藏夹");
        const head = document.createElement("div");
        head.className = "hbu-reader-favour-head";
        const title = document.createElement("span");
        title.textContent = "收藏到收藏夹";
        const close = document.createElement("button");
        close.type = "button";
        close.className = "hbu-reader-favour-close";
        close.setAttribute("aria-label", "关闭收藏夹面板");
        close.textContent = "×";
        close.addEventListener("click", () => closeFavourMenu(true));
        head.append(title, close);
        const status = document.createElement("div");
        status.className = "hbu-reader-favour-status";
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        const list = document.createElement("div");
        list.className = "hbu-reader-favour-list";
        list.setAttribute("role", "group");
        list.setAttribute("aria-label", "收藏夹");
        const create = document.createElement("div");
        create.className = "hbu-reader-favour-create";
        const input = document.createElement("input");
        input.type = "text";
        input.className = "hbu-reader-favour-create-input";
        input.maxLength = 30;
        input.placeholder = "新建收藏夹";
        input.setAttribute("aria-label", "新收藏夹名称");
        const createButton = document.createElement("button");
        createButton.type = "button";
        createButton.className = "hbu-reader-favour-create-btn";
        createButton.textContent = "创建";
        createButton.addEventListener("click", () => void createFavourFolder());
        input.addEventListener("keydown", (event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          void createFavourFolder();
        });
        create.append(input, createButton);
        const actions = document.createElement("div");
        actions.className = "hbu-reader-favour-actions";
        const save = document.createElement("button");
        save.type = "button";
        save.className = "hbu-reader-favour-save";
        save.textContent = "保存";
        save.addEventListener("click", () => void saveFavourChanges());
        actions.append(save);
        panel.append(head, status, list, create, actions);
        rail.append(panel);
        favourPanel = panel;
        favourPanelStatus = status;
        favourPanelList = list;
        favourPanelSave = save;
        favourPanelCreateInput = input;
        favourPanelCreateButton = createButton;
        favourPanelClose = close;
      }
      if (favourPanel.parentNode !== rail) rail.append(favourPanel);
      return favourPanel;
    };
    const renderFavourFolderList = () => {
      if (favourPanelList === null) return;
      const list = favourPanelList;
      if (favourPanelFolders.length === 0) {
        const empty = document.createElement("div");
        empty.className = "hbu-reader-favour-empty";
        empty.textContent = "还没有收藏夹，可在下方新建";
        list.replaceChildren(empty);
        refreshFavourControls();
        return;
      }
      const rows = [];
      for (const folder of favourPanelFolders) {
        const option = document.createElement("label");
        option.className = "hbu-reader-favour-option";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = folder.id;
        input.checked = favourPanelChecked.has(folder.id);
        input.addEventListener("change", () => {
          if (input.checked) favourPanelChecked.add(folder.id);
          else favourPanelChecked.delete(folder.id);
          refreshFavourControls();
        });
        const name = document.createElement("span");
        name.className = "hbu-reader-favour-name";
        name.textContent = folder.name;
        name.title = folder.name;
        option.append(input, name);
        if (favourPanelUnknown.has(folder.id)) {
          const tag = document.createElement("span");
          tag.className = "hbu-reader-favour-tag";
          tag.textContent = "待核对";
          tag.title = "未能读取该收藏夹的收藏状态，取消勾选不会移除";
          option.append(tag);
        }
        rows.push(option);
      }
      list.replaceChildren(...rows);
      refreshFavourControls();
    };
    const createFavourFolder = async () => {
      if (favourPanelCreateInput === null || favourPanel === null) return;
      if (favourCreateBusy || favourSaveBusy || favourLoadController !== null || articleId === "") return;
      const name = favourPanelCreateInput.value.trim();
      if (name === "") {
        setFavourStatus("请输入收藏夹名称", true);
        favourPanelCreateInput.focus({ preventScroll: true });
        return;
      }
      const targetId = articleId;
      const generation = readerGeneration;
      const previousIds = new Set(favourPanelFolders.map((folder) => folder.id));
      favourCreateBusy = true;
      const controller = new AbortController();
      favourCreateController = controller;
      refreshFavourControls();
      setFavourStatus("正在创建收藏夹…");
      let message = "";
      let created = null;
      try {
        const accountId = await resolveHeyboxId();
        if (accountId === "") throw new Error("请先登录小黑盒");
        const result = await postReaderApi("/bbs/app/profile/fav/folder/add", { name }, accountId, controller.signal);
        if (articleId !== targetId || readerGeneration !== generation || favourCreateController !== controller) return;
        const createdId = readFavourFolderId(result);
        const loadController = new AbortController();
        favourLoadController = loadController;
        let folders;
        try {
          folders = await fetchFavourFolders(loadController.signal, accountId);
        } catch (error) {
          if (isAbortError(error)) throw error;
          folders = favourPanelFolders.slice();
        } finally {
          if (favourLoadController === loadController) favourLoadController = null;
        }
        if (articleId !== targetId || readerGeneration !== generation || favourCreateController !== controller) return;
        let id = createdId;
        if (id === "") {
          const fresh = folders.find((folder) => !previousIds.has(folder.id) && folder.name === name);
          if (fresh !== void 0) id = fresh.id;
        }
        favourPanelFolders = folders;
        if (id !== "") {
          created = { id, name };
          if (!favourPanelFolders.some((folder) => folder.id === id)) {
            favourPanelFolders = favourPanelFolders.concat([created]);
          }
          favourPanelChecked.add(id);
          favourPanelMembers.delete(id);
          favourPanelUnknown.delete(id);
          message = "已创建收藏夹「" + name + "」，勾选后保存";
        } else {
          message = "已创建收藏夹，请重新打开面板后勾选";
        }
        if (favourPanelCreateInput !== null) favourPanelCreateInput.value = "";
      } catch (error) {
        if (isAbortError(error)) return;
        setFavourStatus("创建收藏夹失败：" + (error instanceof Error ? error.message : "请稍后重试"), true);
      } finally {
        if (favourCreateController === controller) {
          favourCreateController = null;
          favourCreateBusy = false;
          refreshFavourControls();
        }
      }
      if (articleId !== targetId || readerGeneration !== generation) return;
      renderFavourFolderList();
      if (message !== "") setFavourStatus(message);
    };
    const saveFavourChanges = async () => {
      if (favourSaveBusy || favourCreateBusy || favourMenuBusy || articleId === "") return;
      if (favourPanel === null || favourLoadController !== null) return;
      const plan = currentFavourPlan();
      if (!favourPanelFavourited && favourPanelChecked.size === 0) {
        setFavourStatus("请至少选择一个收藏夹", true);
        return;
      }
      if (!planHasFavourChange(plan)) {
        setFavourStatus(favourPanelUnknown.size > 0 ? "没有可保存的变更，部分收藏夹未核对" : "没有需要保存的变更");
        return;
      }
      const targetId = articleId;
      const generation = readerGeneration;
      favourSaveBusy = true;
      const controller = new AbortController();
      favourSaveController = controller;
      refreshFavourControls();
      setFavourStatus("正在保存…");
      const appliedAdd = [];
      const appliedRemove = [];
      let removeAll = false;
      let failure = "";
      try {
        const userId = await resolveHeyboxId();
        if (userId === "") throw new Error("请先登录小黑盒");
        for (const id of plan.addIds) {
          await postReaderApi("/bbs/app/link/favour", {
            favour_type: "1",
            link_id: targetId,
            userid: userId,
            folder_id: id
          }, userId, controller.signal);
          appliedAdd.push(id);
        }
        if (plan.removeAll) {
          await postReaderApi("/bbs/app/link/favour", {
            favour_type: "2",
            link_id: targetId,
            userid: userId,
            folder_id: ""
          }, userId, controller.signal);
          removeAll = true;
        } else {
          for (const id of plan.removeIds) {
            await postReaderApi("/bbs/app/link/favour", {
              favour_type: "2",
              link_id: targetId,
              userid: userId,
              folder_id: id
            }, userId, controller.signal);
            appliedRemove.push(id);
          }
        }
      } catch (error) {
        failure = error instanceof Error ? error.message : "收藏保存失败";
      } finally {
        if (favourSaveController === controller) {
          favourSaveController = null;
          favourSaveBusy = false;
        }
      }
      if (articleId !== targetId || readerGeneration !== generation) return;
      const appliedPlan = {
        addIds: appliedAdd,
        removeIds: appliedRemove,
        removeAll,
        unknownIds: plan.unknownIds
      };
      const nextFavourited = resolveFavourOutcome(favourPanelFavourited, Array.from(favourPanelMembers), appliedPlan);
      const wasFavourited = favourPanelFavourited;
      if (nextFavourited !== wasFavourited) applyFavourState(nextFavourited);
      if (failure !== "") {
        for (const id of appliedAdd) {
          favourPanelChecked.add(id);
          favourPanelMembers.add(id);
          favourPanelUnknown.delete(id);
        }
        for (const id of appliedRemove) {
          favourPanelChecked.delete(id);
          favourPanelMembers.delete(id);
        }
        favourPanelFavourited = nextFavourited;
        renderFavourFolderList();
        setFavourStatus("保存失败：" + failure + "。已完成的修改已保留，可再次保存。", true);
        return;
      }
      closeFavourMenu(true);
      showToast(wasFavourited ? "已更新收藏夹" : "已收藏");
    };
    const showFavourPanel = async (rail, button, accountId) => {
      ensureFavourPanel(rail);
      if (favourPanel === null) return;
      favourButton = button;
      favourPanel.hidden = false;
      button.setAttribute("aria-expanded", "true");
      favourPanelFolders = [];
      favourPanelChecked = /* @__PURE__ */ new Set();
      favourPanelMembers = /* @__PURE__ */ new Set();
      favourPanelUnknown = /* @__PURE__ */ new Set();
      favourPanelFavourited = linkState !== null && linkState.isFavour;
      renderFavourFolderList();
      setFavourStatus("正在读取收藏夹…");
      favourLoadController?.abort();
      const controller = new AbortController();
      favourLoadController = controller;
      refreshFavourControls();
      favourPanelClose?.focus({ preventScroll: true });
      let folders;
      try {
        folders = await fetchFavourFolders(controller.signal, accountId);
      } catch (error) {
        if (isAbortError(error) || favourPanel === null || favourLoadController !== controller) return;
        favourLoadController = null;
        refreshFavourControls();
        setFavourStatus(error instanceof Error ? error.message : "获取收藏夹失败", true);
        return;
      }
      if (favourPanel === null || favourLoadController !== controller) return;
      favourPanelFolders = folders;
      renderFavourFolderList();
      if (folders.length === 0) {
        favourLoadController = null;
        refreshFavourControls();
        setFavourStatus("还没有收藏夹，可在下方新建");
        return;
      }
      if (!favourPanelFavourited) {
        favourLoadController = null;
        refreshFavourControls();
        setFavourStatus("勾选要收藏到的收藏夹，然后保存");
        return;
      }
      setFavourStatus("正在核对收藏夹…");
      try {
        await scanFavourMemberships(folders, accountId, controller.signal);
      } catch (error) {
        if (!isAbortError(error)) {
          for (const folder of folders) favourPanelUnknown.add(folder.id);
        }
      }
      if (favourPanel === null || favourLoadController !== controller) return;
      favourLoadController = null;
      renderFavourFolderList();
      setFavourStatus(favourPanelUnknown.size > 0 ? "部分收藏夹未能核对，未勾选的不会移除" : "勾选加入，取消勾选移除，然后保存");
    };
    const openFavourMenu = async (rail, button) => {
      if (favourMenuBusy || favourSaveBusy) return;
      if (favourPanel !== null && !favourPanel.hidden) {
        closeFavourMenu(true);
        return;
      }
      closeSpacingMenu();
      closeHistoryDrawer();
      const targetId = articleId;
      const generation = readerGeneration;
      favourMenuBusy = true;
      try {
        const accountId = await resolveHeyboxId();
        if (articleId !== targetId || readerGeneration !== generation || !rail.isConnected || host === null) return;
        if (accountId === "") {
          showToast("请先登录小黑盒");
          return;
        }
        if (linkState === null) await loadLinkState(accountId);
        if (articleId !== targetId || readerGeneration !== generation || !rail.isConnected || host === null) return;
        await showFavourPanel(rail, button, accountId);
      } finally {
        favourMenuBusy = false;
      }
    };
    const closeCyDialog = () => {
      if (cyDialog === null) return;
      cyDialog.remove();
      cyDialog = null;
      cyTextarea = null;
      cySubmit = null;
      cyStatus = null;
      if (host !== null && !isCommentPanelOpen()) {
        host.querySelector('[data-action="cy"]')?.focus({ preventScroll: true });
      }
    };
    const submitCy = async () => {
      if (cyBusy || cyTextarea === null || cySubmit === null || cyStatus === null) return;
      const text = cyTextarea.value.trim();
      if (text === "") {
        cyStatus.textContent = "请输入 CY 内容";
        cyTextarea.focus();
        return;
      }
      cyBusy = true;
      cySubmit.disabled = true;
      cySubmit.textContent = "发布中…";
      cyStatus.textContent = "";
      const targetId = articleId;
      const generation = readerGeneration;
      try {
        const accountId = await resolveHeyboxId();
        if (articleId !== targetId || readerGeneration !== generation) return;
        if (accountId === "") throw new Error("请先登录小黑盒");
        await postReaderApi(COMMENT_CREATE_API_PATH, {
          is_cy: "1",
          link_id: targetId,
          reply_id: "-1",
          root_id: "-1",
          text
        }, accountId);
        if (articleId !== targetId || readerGeneration !== generation) return;
        cyPublishedCount += 1;
        holdRailPageCache(targetId);
        if (linkState !== null) {
          addPublishedActions(linkState, 1, 0);
        } else {
          void loadLinkState(accountId);
        }
        showToast("CY 已发布");
        closeCyDialog();
        syncActionStates();
      } catch (error) {
        if (articleId === targetId && readerGeneration === generation && cyStatus !== null) {
          cyStatus.textContent = error instanceof Error ? error.message : "CY 发布失败";
        }
      } finally {
        if (articleId === targetId && readerGeneration === generation) {
          cyBusy = false;
          if (cySubmit !== null) {
            cySubmit.disabled = false;
            cySubmit.textContent = "发布";
          }
        }
      }
    };
    const openCyDialog = () => {
      if (host === null) return;
      closeFavourMenu();
      if (cyDialog !== null) {
        cyDialog.hidden = false;
        cyTextarea?.focus({ preventScroll: true });
        return;
      }
      const dialog = document.createElement("div");
      dialog.className = "hbu-reader-cy-dialog";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-label", "发布 CY");
      const card = document.createElement("div");
      card.className = "hbu-reader-cy-card";
      const head = document.createElement("div");
      head.className = "hbu-reader-cy-head";
      const title = document.createElement("span");
      title.textContent = "发布 CY";
      const close = document.createElement("button");
      close.type = "button";
      close.className = "hbu-reader-cy-close";
      close.setAttribute("aria-label", "关闭 CY 输入框");
      close.innerHTML = READER_ICONS.close;
      close.addEventListener("click", closeCyDialog);
      head.append(title, close);
      const textarea = document.createElement("textarea");
      textarea.className = "hbu-reader-cy-text";
      textarea.maxLength = 1e3;
      textarea.placeholder = "写下这次插眼的内容…";
      textarea.setAttribute("aria-label", "CY 内容");
      const status = document.createElement("div");
      status.className = "hbu-reader-cy-status";
      status.setAttribute("role", "status");
      const actions = document.createElement("div");
      actions.className = "hbu-reader-cy-actions";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "取消";
      cancel.addEventListener("click", closeCyDialog);
      const submit = document.createElement("button");
      submit.type = "button";
      submit.dataset["primary"] = "true";
      submit.textContent = "发布";
      if (cyBusy) {
        submit.disabled = true;
        submit.textContent = "发布中…";
      }
      submit.addEventListener("click", () => void submitCy());
      actions.append(cancel, submit);
      card.append(head, textarea, status, actions);
      dialog.append(card);
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) closeCyDialog();
      });
      dialog.addEventListener("keydown", (event) => {
        if (event.key !== "Tab") return;
        const items = Array.from(dialog.querySelectorAll("button, textarea")).filter((node) => node.getBoundingClientRect().width > 0);
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (first === void 0 || last === void 0) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus({ preventScroll: true });
        }
      });
      cyDialog = dialog;
      cyTextarea = textarea;
      cySubmit = submit;
      cyStatus = status;
      host.append(dialog);
      textarea.focus({ preventScroll: true });
    };
    const fillReaderCommentBody = (node, segments) => {
      if (segments.length === 0) {
        node.textContent = "（图片或表情评论）";
        return;
      }
      for (const segment of segments) {
        if (segment.type === "text") {
          node.append(document.createTextNode(segment.text));
          continue;
        }
        if (segment.type === "emoji") {
          const emoji = document.createElement("span");
          emoji.className = "hbu-reader-comments-emoji";
          emoji.setAttribute("role", "img");
          emoji.setAttribute("aria-label", "表情");
          applyRailEmojiStyle(emoji, segment);
          node.append(emoji);
          continue;
        }
        const image = document.createElement("img");
        image.className = "hbu-reader-comments-image";
        image.alt = "";
        image.loading = "lazy";
        image.referrerPolicy = "no-referrer";
        image.src = segment.src;
        image.alt = "评论图片";
        bindLightboxTrigger(image, () => segment.src);
        node.append(image);
      }
    };
    const createReaderCommentDeleteButton = (comment) => {
      if (comment.id === "" || isPendingReplyRow(comment.id)) return null;
      if (!isOwnRailComment(comment, readerAccountId)) return null;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "hbu-reader-comments-delete";
      remove.textContent = commentDeleteBusy.has(comment.id) ? "删除中…" : "删除";
      remove.setAttribute("aria-label", "删除这条评论");
      remove.dataset["deleteId"] = comment.id;
      remove.disabled = commentDeleteBusy.has(comment.id);
      return remove;
    };
    const readerCommentProfileHref = (userId) => "/app/user/profile/" + encodeURIComponent(userId);
    const createReaderCommentAvatar = (comment, small) => {
      const avatar = document.createElement("img");
      avatar.className = "hbu-reader-comments-avatar";
      avatar.alt = "";
      avatar.loading = "lazy";
      avatar.referrerPolicy = "no-referrer";
      if (comment.avatar !== "") avatar.src = comment.avatar;
      const wrapperClass = "hbu-reader-comments-avatar-link" + (small ? " hbu-reader-comments-avatar-link--child" : "");
      if (comment.userId === "") {
        const span = document.createElement("span");
        span.className = wrapperClass;
        span.append(avatar);
        return span;
      }
      const link = document.createElement("a");
      link.className = wrapperClass;
      link.href = readerCommentProfileHref(comment.userId);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.setAttribute("aria-label", "查看 " + comment.name + " 的主页");
      link.title = "查看 " + comment.name + " 的主页";
      link.append(avatar);
      return link;
    };
    const createReaderCommentName = (comment) => {
      const name = document.createElement("span");
      name.className = "hbu-reader-comments-name";
      name.textContent = comment.name;
      if (comment.userId === "") return name;
      const link = document.createElement("a");
      link.className = "hbu-reader-comments-name-link";
      link.href = readerCommentProfileHref(comment.userId);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.setAttribute("aria-label", "查看 " + comment.name + " 的主页");
      link.title = comment.name + " 的主页";
      link.append(name);
      return link;
    };
    const filterReaderCommentThread = (nodes, hideCy) => nodes.filter((node) => !hideCy || node.isCy !== true).map((node) => ({ ...node, children: filterReaderCommentThread(node.children, hideCy) }));
    const resolvePendingFloorId = (items, pending) => {
      if (pending.rootId !== "" && items.some((item) => item.id === pending.rootId)) return pending.rootId;
      return findRailFloorIdForComment(items, pending.parentId);
    };
    const readPendingRepliesFor = (floorId) => commentState.pendingReplies.filter((pending) => resolvePendingFloorId(commentState.items, pending) === floorId);
    const withPendingReplies = (entry) => attachRailPendingReplies(entry, readPendingRepliesFor(entry.id));
    const isPendingReplyRow = (commentId) => commentId.startsWith(RAIL_PENDING_ID_PREFIX) || commentState.pendingReplies.some((row) => row.id === commentId);
    const readPendingBaseline = (row) => commentState.pendingBaselines.get(row.id);
    const createThreadCollapseButton = (threadId, hiddenCount) => {
      const collapse = document.createElement("button");
      collapse.type = "button";
      collapse.className = "hbu-reader-comments-collapse";
      collapse.dataset["threadId"] = threadId;
      collapse.textContent = "收起回复";
      collapse.setAttribute("aria-expanded", "true");
      collapse.setAttribute("aria-label", "收起这条评论下的 " + hiddenCount + " 条回复");
      return collapse;
    };
    const createCollapsedThreadRow = (threadId, hiddenCount) => {
      const holder = document.createElement("ul");
      holder.className = "hbu-reader-comments-children hbu-reader-comments-children--collapsed";
      const hiddenRow = document.createElement("li");
      hiddenRow.className = "hbu-reader-comments-child hbu-reader-comments-child--collapsed";
      const expand = document.createElement("button");
      expand.type = "button";
      expand.className = "hbu-reader-comments-expand";
      expand.dataset["threadId"] = threadId;
      expand.textContent = hiddenCount + " 条回复已收起";
      expand.setAttribute("aria-expanded", "false");
      hiddenRow.append(expand);
      holder.append(hiddenRow);
      return holder;
    };
    const describeCommentControl = (control) => {
      for (const [action, attribute] of Object.entries(COMMENT_CONTROL_ATTRIBUTES)) {
        const id = control.dataset[attribute];
        if (id !== void 0 && control.classList.contains(COMMENT_CONTROL_CLASSES[action])) return { id, action };
      }
      return null;
    };
    const restoreCommentControlFocus = (target) => {
      if (target === null || commentPanelList === null) return;
      const attribute = COMMENT_CONTROL_ATTRIBUTES[target.action];
      const selector = "." + COMMENT_CONTROL_CLASSES[target.action];
      for (const control of commentPanelList.querySelectorAll(selector)) {
        if (control.dataset[attribute] !== target.id) continue;
        control.focus({ preventScroll: true });
        return;
      }
    };
    const createReaderCommentItem = (raw) => {
      const comment = withPendingReplies(raw);
      const item = document.createElement("li");
      item.className = "hbu-reader-comments-item";
      item.setAttribute("role", "listitem");
      const avatar = createReaderCommentAvatar(comment, false);
      const main = document.createElement("div");
      main.className = "hbu-reader-comments-main";
      const who = document.createElement("div");
      who.className = "hbu-reader-comments-who";
      who.append(createReaderCommentName(comment));
      if (comment.createAt > 0) {
        const time = document.createElement("span");
        time.className = "hbu-reader-comments-time";
        time.textContent = formatRailAge(comment.createAt);
        who.append(time);
      }
      const text = document.createElement("p");
      text.className = "hbu-reader-comments-text";
      fillReaderCommentBody(text, comment.body);
      main.append(who, text);
      const meta = document.createElement("div");
      meta.className = "hbu-reader-comments-meta";
      if (comment.likes > 0) {
        const likes = document.createElement("span");
        likes.textContent = "赞 " + comment.likes;
        meta.append(likes);
      }
      if (comment.replies > 0) {
        const replies = document.createElement("span");
        replies.textContent = comment.replies + " 条回复";
        meta.append(replies);
      }
      if (isPendingReplyRow(comment.id)) {
        const syncing = document.createElement("span");
        const settled = commentState.settledReplies.has(comment.id);
        syncing.className = "hbu-reader-comments-syncing" + (settled ? " hbu-reader-comments-syncing--settled" : "");
        syncing.textContent = settled ? "已提交" : "同步中…";
        meta.append(syncing);
      } else {
        meta.append(createReaderReplyButton({
          id: comment.id,
          rootId: comment.rootId !== "" ? comment.rootId : comment.id,
          name: comment.name
        }));
        const deleteButton = createReaderCommentDeleteButton(comment);
        if (deleteButton !== null) meta.append(deleteButton);
      }
      const visibleChildren = filterReaderCommentThread(buildRailCommentTree(comment), readHideCyPreference());
      const hiddenCount = countRailThreadNodes(visibleChildren);
      const collapsible = comment.id !== "" && visibleChildren.length > 0;
      const collapsed = collapsible && collapsedCommentThreads.has(comment.id);
      if (collapsible && !collapsed) meta.append(createThreadCollapseButton(comment.id, hiddenCount));
      main.append(meta);
      if (visibleChildren.length > 0) {
        if (collapsed) {
          main.append(createCollapsedThreadRow(comment.id, hiddenCount));
        } else {
          const children = document.createElement("ul");
          children.className = "hbu-reader-comments-children";
          for (const child of visibleChildren) children.append(createReaderCommentChild(child, comment, 1));
          main.append(children);
        }
      }
      item.append(avatar, main);
      return item;
    };
    const createReaderCommentChild = (child, parent, depth) => {
      const item = document.createElement("li");
      item.className = "hbu-reader-comments-child";
      item.setAttribute("role", "listitem");
      const avatar = createReaderCommentAvatar(child, true);
      const main = document.createElement("div");
      main.className = "hbu-reader-comments-child-main";
      const who = document.createElement("div");
      who.className = "hbu-reader-comments-who";
      who.append(createReaderCommentName(child));
      const replyTo = child.replyName !== "" ? child.replyName : parent.name;
      if (replyTo !== "") {
        const hint = document.createElement("span");
        hint.className = "hbu-reader-comments-reply-to";
        hint.textContent = "回复 @" + replyTo;
        who.append(hint);
      }
      if (child.createAt > 0) {
        const time = document.createElement("span");
        time.className = "hbu-reader-comments-time";
        time.textContent = formatRailAge(child.createAt);
        who.append(time);
      }
      const text = document.createElement("p");
      text.className = "hbu-reader-comments-text";
      fillReaderCommentBody(text, child.body);
      const actions = document.createElement("div");
      actions.className = "hbu-reader-comments-meta";
      if (child.likes > 0) {
        const likes = document.createElement("span");
        likes.textContent = "赞 " + child.likes;
        actions.append(likes);
      }
      if (child.replies > 0) {
        const replies = document.createElement("span");
        replies.textContent = child.replies + " 条回复";
        actions.append(replies);
      }
      const pendingRow = isPendingReplyRow(child.id);
      if (pendingRow) {
        const syncing = document.createElement("span");
        const settled = commentState.settledReplies.has(child.id);
        syncing.className = "hbu-reader-comments-syncing" + (settled ? " hbu-reader-comments-syncing--settled" : "");
        syncing.textContent = settled ? "已提交" : "同步中…";
        actions.append(syncing);
      } else {
        actions.append(createReaderReplyButton({
          id: child.id !== "" ? child.id : parent.id,
          rootId: child.rootId !== "" ? child.rootId : parent.rootId !== "" ? parent.rootId : parent.id,
          name: child.name
        }));
        const deleteButton = createReaderCommentDeleteButton(child);
        if (deleteButton !== null) actions.append(deleteButton);
      }
      const visibleChildren = filterReaderCommentThread(child.children, readHideCyPreference());
      const collapsible = child.id !== "" && visibleChildren.length > 0;
      const hiddenCount = collapsible ? countRailThreadNodes(visibleChildren) : 0;
      const collapsed = collapsible && collapsedCommentThreads.has(child.id);
      if (collapsible && !collapsed) actions.append(createThreadCollapseButton(child.id, hiddenCount));
      main.append(who, text, actions);
      if (visibleChildren.length > 0) {
        if (collapsed) {
          main.append(createCollapsedThreadRow(child.id, hiddenCount));
        } else {
          const children = document.createElement("ul");
          children.className = "hbu-reader-comments-children" + (depth >= RAIL_MAX_INDENT_DEPTH ? " hbu-reader-comments-children--deep" : "");
          for (const nested of visibleChildren) children.append(createReaderCommentChild(nested, child, depth + 1));
          main.append(children);
        }
      }
      const row = document.createElement("div");
      row.className = "hbu-reader-comments-child-row";
      row.append(avatar, main);
      item.append(row);
      return item;
    };
    const createReaderReplyButton = (target) => {
      const reply = document.createElement("button");
      reply.type = "button";
      reply.className = "hbu-reader-comments-reply";
      reply.textContent = "回复";
      reply.setAttribute("aria-label", "回复 " + target.name);
      reply.dataset["replyId"] = target.id;
      reply.dataset["replyRoot"] = target.rootId;
      reply.dataset["replyName"] = target.name;
      return reply;
    };
    const renderReaderComments = () => {
      if (commentPanel === null) return;
      const active = document.activeElement;
      const focusedControl = active instanceof HTMLElement && commentPanelList?.contains(active) === true ? describeCommentControl(active) : active === commentPanelRefresh ? lastCommentControlFocus : null;
      const hideCy = readHideCyPreference();
      const loadedVisible = commentState.items.filter((item) => !hideCy || item.isCy !== true);
      const hiddenCy = commentState.items.length - loadedVisible.length;
      const visible = commentState.localFloors.concat(loadedVisible);
      const meta = [];
      if (commentState.total > 0) meta.push("共 " + commentState.total + " 条");
      if (loadedVisible.length > 0) meta.push("已加载 " + loadedVisible.length + " 条");
      if (hiddenCy > 0) meta.push("已屏蔽 " + hiddenCy + " 条 CY");
      if (commentPanelMeta !== null) commentPanelMeta.textContent = meta.join(" · ");
      if (commentPanelList !== null) {
        commentPanelList.replaceChildren(...visible.map(createReaderCommentItem));
        commentPanelList.hidden = visible.length === 0;
      }
      if (focusedControl !== null) restoreCommentControlFocus(focusedControl);
      if (commentPanelStatus !== null) {
        if (commentState.error !== "") {
          commentPanelStatus.hidden = false;
          if (commentPanelStatusText !== null) commentPanelStatusText.textContent = commentState.error;
          if (commentPanelRetry !== null) {
            commentPanelRetry.hidden = false;
            commentPanelRetry.disabled = commentState.loading;
          }
        } else if (commentState.loading && visible.length === 0) {
          commentPanelStatus.hidden = false;
          if (commentPanelStatusText !== null) commentPanelStatusText.textContent = "正在加载评论…";
          if (commentPanelRetry !== null) commentPanelRetry.hidden = true;
        } else if (!commentState.loaded) {
          commentPanelStatus.hidden = false;
          if (commentPanelStatusText !== null) commentPanelStatusText.textContent = "正在准备评论…";
          if (commentPanelRetry !== null) commentPanelRetry.hidden = true;
        } else if (visible.length === 0) {
          commentPanelStatus.hidden = false;
          if (commentPanelStatusText !== null) {
            commentPanelStatusText.textContent = hiddenCy > 0 ? "已屏蔽全部 " + hiddenCy + " 条 CY 评论" : "这条帖子还没有评论";
          }
          if (commentPanelRetry !== null) commentPanelRetry.hidden = true;
        } else {
          commentPanelStatus.hidden = true;
          if (commentPanelRetry !== null) commentPanelRetry.hidden = true;
        }
      }
      if (commentPanelMore !== null) {
        commentPanelMore.hidden = !commentState.hasMore;
        commentPanelMore.disabled = commentState.loading;
        commentPanelMore.textContent = commentState.loading ? "加载中…" : "加载更多";
      }
      if (commentPanelRefresh !== null) {
        commentPanelRefresh.disabled = commentState.loading;
        commentPanelRefresh.dataset["busy"] = commentState.loading ? "true" : "false";
      }
    };
    const pendingFromMark = (mark) => createRailPendingReply({
      parentId: mark.parentId,
      rootId: mark.rootId !== "" ? mark.rootId : mark.parentId,
      text: mark.text,
      userId: mark.userId,
      createAt: mark.createAt,
      sequence: 0,
      ...mark.commentId === "" ? {} : { commentId: mark.commentId },
      imageUrls: mark.imageUrls
    });
    const commentMarkIsVisible = (mark, loaded) => {
      if (mark.parentId === "") {
        if (mark.commentId !== "") return railItemsHaveComment(loaded, mark.commentId);
        return railItemsHaveOwnFloorComment(loaded, mark.userId, mark.text, mark.createAt, mark.imageUrls);
      }
      return railItemsHavePendingReply(loaded, pendingFromMark(mark));
    };
    const localFloorIdForMark = (mark) => RAIL_PENDING_ID_PREFIX + "mark-" + mark.token;
    const restoreReaderCommentMarks = () => {
      const marks = readReaderCommentMarks(articleId);
      if (marks.length === 0) return;
      for (const mark of marks) {
        const visibleAlready = commentState.loaded && commentMarkIsVisible(mark, commentState.items);
        if (visibleAlready) continue;
        if (mark.parentId === "") {
          const floorId = localFloorIdForMark(mark);
          if (commentState.localFloors.some((row) => row.id === floorId)) continue;
          const pending2 = createRailPendingReply({
            parentId: "",
            rootId: "",
            text: mark.text,
            userId: mark.userId,
            createAt: mark.createAt,
            sequence: 0,
            imageUrls: mark.imageUrls
          });
          commentState.localFloors.unshift({ ...pending2, id: floorId, subComments: [], quotes: [] });
          commentState.localFloorMarks.set(floorId, mark);
          continue;
        }
        const pendingId = mark.commentId !== "" ? mark.commentId : localFloorIdForMark(mark);
        if (commentState.pendingReplies.some((row) => row.id === pendingId)) continue;
        const pending = pendingFromMark(mark);
        commentState.pendingReplies.push({ ...pending, id: pendingId });
      }
    };
    const syncLocalCommentFloors = () => {
      if (commentState.localFloors.length === 0) return;
      commentState.localFloors = commentState.localFloors.filter((row) => {
        const mark = commentState.localFloorMarks.get(row.id);
        if (mark === void 0) return true;
        if (!commentMarkIsVisible(mark, commentState.items)) return true;
        commentState.localFloorMarks.delete(row.id);
        return false;
      });
    };
    const matchesCommentExpectation = (options, loaded) => {
      const wantPresent = options.expectPresentId ?? "";
      const wantAbsent = options.expectAbsentId ?? "";
      if (wantPresent !== "" && !railItemsHaveComment(loaded, wantPresent)) return false;
      if (wantAbsent !== "" && railItemsHaveComment(loaded, wantAbsent)) return false;
      const pending = options.expectPending;
      if (pending !== void 0) {
        if (!railItemsHavePendingReply(loaded, pending, readPendingBaseline(pending))) return false;
      }
      for (const mark of options.expectations ?? []) {
        if (!commentMarkIsVisible(mark, loaded)) return false;
      }
      return true;
    };
    const collectReaderCommentSubtree = (nodes, commentId, removed) => {
      for (const node of nodes) {
        if (node.id === commentId) {
          const collectAll = (branch) => {
            for (const member of branch) {
              if (member.id !== "") removed.add(member.id);
              collectAll(member.children);
            }
          };
          collectAll([node]);
          return true;
        }
        if (collectReaderCommentSubtree(node.children, commentId, removed)) return true;
      }
      return false;
    };
    const withoutCommentId = (items, commentId) => {
      if (commentId === "") return items.slice();
      const next = [];
      for (const entry of items) {
        if (entry.id === commentId) continue;
        const removed = /* @__PURE__ */ new Set();
        collectReaderCommentSubtree(buildRailCommentTree(entry), commentId, removed);
        const children = entry.subComments.filter((child) => !removed.has(child.id));
        if (children.length === entry.subComments.length) {
          next.push(entry);
          continue;
        }
        next.push({ ...entry, subComments: children, quotes: children });
      }
      return next;
    };
    const recordFloorPages = (items, page) => {
      for (const entry of items) {
        if (entry.id === "") continue;
        commentState.floorPages.set(entry.id, page);
      }
    };
    const loadReaderComments = async (page, options = {}) => {
      if (commentState.loading && options.force !== true) return;
      const seq = ++commentState.seq;
      const targetId = articleId;
      const generationAtLoad = readerGeneration;
      commentLoadController?.abort();
      const controller = new AbortController();
      commentLoadController = controller;
      commentState.loading = true;
      commentState.error = "";
      const merge = options.merge === true;
      const writeRefresh = options.fresh === true || options.expectPresentId !== void 0 || options.expectAbsentId !== void 0 || options.expectPending !== void 0 || (options.expectations?.length ?? 0) > 0;
      const keepItems = merge || page === 1 && writeRefresh;
      if (page === 1 && !keepItems) {
        commentState.items = [];
        commentState.page = 0;
        commentState.total = 0;
        commentState.hasMore = false;
        commentState.loadedGroups = 0;
        commentState.loaded = false;
        commentState.floorPages.clear();
      }
      renderReaderComments();
      let stale = false;
      try {
        const accountId = await resolveHeyboxId(controller.signal);
        if (seq !== commentState.seq || commentLoadController !== controller) return;
        if (accountId !== readerAccountId) readerAccountId = accountId;
        const fresh = merge || page === 1 && writeRefresh;
        const data = await fetchRailPage(targetId, page, {
          signal: controller.signal,
          accountId,
          bypassCache: fresh,
          ...page === 1 ? { maxAgeMs: RAIL_PAGE_CACHE_FRESH_MS } : {}
        });
        if (seq !== commentState.seq || commentLoadController !== controller) return;
        const incoming = withoutCommentId(data.items, options.expectAbsentId ?? "");
        const seen = new Set(commentState.items.map((item) => item.id));
        const added = incoming.filter((item) => item.id === "" || !seen.has(item.id));
        if (merge) {
          const base = withoutCommentId(commentState.items, options.expectAbsentId ?? "");
          commentState.items = mergeRailPageItems(base, incoming);
          commentState.page = Math.max(commentState.page, page);
        } else if (page === 1) {
          commentState.items = incoming;
          commentState.page = 1;
        } else {
          commentState.items = commentState.items.concat(added);
          commentState.page = page;
        }
        recordFloorPages(incoming, page);
        const absentId = options.expectAbsentId ?? "";
        const echoingDeleted = absentId !== "" && railItemsHaveComment(incoming, absentId);
        commentState.total = echoingDeleted ? commentState.total : data.total > 0 ? data.total : Math.max(commentState.total, commentState.items.length);
        const beforePrune = commentState.pendingReplies;
        commentState.pendingReplies = pruneRailPendingReplies(commentState.items, beforePrune, readPendingBaseline);
        for (const row of beforePrune) {
          if (commentState.pendingReplies.includes(row)) continue;
          commentState.pendingBaselines.delete(row.id);
          commentState.settledReplies.delete(row.id);
        }
        syncLocalCommentFloors();
        const progress = merge ? resolveMergedCommentProgress({
          loadedGroups: commentState.items.length,
          floorTotal: data.floorTotal,
          rawGroupCount: incoming.length
        }) : resolveCommentPageProgress({
          rawGroupCount: data.items.length,
          freshGroupCount: page === 1 ? data.items.length : added.length,
          previouslyLoadedGroups: page === 1 ? 0 : commentState.loadedGroups,
          floorTotal: data.floorTotal
        });
        commentState.loadedGroups = progress.loadedGroups;
        commentState.hasMore = progress.hasMore;
        commentState.loaded = true;
        if (page === 1 || merge) commentState.loadedAt = Date.now();
        if (linkState !== null && !echoingDeleted && Number.isFinite(data.total) && data.total > 0) {
          const current = Number(linkState.commentCount);
          linkState.commentCount = Math.max(Number.isFinite(current) ? current : 0, data.total);
        }
        syncActionStates();
        stale = !matchesCommentExpectation(options, commentState.items);
      } catch (error) {
        if (isAbortError(error)) return;
        if (seq !== commentState.seq || commentLoadController !== controller) return;
        const message = error instanceof Error ? error.message : "评论加载失败";
        commentState.error = /captcha|show_captcha/i.test(message) ? "评论需要验证，请稍后重试" : "评论加载失败：" + message;
        commentState.hasMore = false;
      } finally {
        if (seq === commentState.seq && commentLoadController === controller) {
          commentState.loading = false;
          commentLoadController = null;
          renderReaderComments();
        }
      }
      if (!stale) return;
      if (articleId !== targetId || readerGeneration !== generationAtLoad) return;
      if (seq !== commentState.seq) return;
      const attempt = (options.attempt ?? 0) + 1;
      const pending = options.expectPending;
      const expectations = options.expectations ?? [];
      const maxAttempts = pending === void 0 && expectations.length === 0 ? COMMENT_VERIFY_ATTEMPTS : COMMENT_VERIFY_MAX_ATTEMPTS;
      if (attempt >= maxAttempts) {
        if (pending !== void 0) {
          commentState.settledReplies.add(pending.id);
          renderReaderComments();
        }
        if (expectations.length > 0) {
          for (const mark of expectations) {
            const floorId = localFloorIdForMark(mark);
            if (commentState.localFloors.some((row) => row.id === floorId)) {
              commentState.settledReplies.add(floorId);
            }
          }
          renderReaderComments();
        }
        if (options.expectAbsentId !== void 0) showToast("评论已删除，列表仍待站点同步");
        else if ((options.expectPresentId ?? "") !== "" || expectations.length > 0) showToast("评论已提交，列表仍待站点同步");
        return;
      }
      if (pending !== void 0 && attempt === COMMENT_VERIFY_ATTEMPTS) {
        commentState.settledReplies.add(pending.id);
        renderReaderComments();
      }
      const ownedPage = options.verifyPage ?? page;
      const nextPage = attempt % 3 === 2 && page !== 1 ? 1 : ownedPage;
      void waitForDelay(readCommentVerifyDelay(attempt), controller.signal).then(() => {
        if (articleId !== targetId || readerGeneration !== generationAtLoad) return;
        if (seq !== commentState.seq) return;
        void loadReaderComments(nextPage, { ...options, fresh: true, force: true, merge: true, attempt });
      }).catch(() => void 0);
    };
    const readArticleComposers = () => Array.from(document.querySelectorAll("[data-hbu-article-composer]"));
    const readComposerImages = (root) => articleComposerImages.get(root) ?? [];
    const createComposerPreviewUrl = (file) => {
      if (typeof URL.createObjectURL !== "function") return "";
      try {
        return URL.createObjectURL(file);
      } catch {
        return "";
      }
    };
    const revokeComposerPreviewUrl = (url) => {
      if (url === "" || typeof URL.revokeObjectURL !== "function") return;
      URL.revokeObjectURL(url);
    };
    const readComposerStatus = (root) => {
      const status = root.querySelector(".hbu-reader-composer-status");
      return status instanceof HTMLElement ? status : null;
    };
    const renderComposerImages = (root) => {
      const strip = root.querySelector(".hbu-reader-composer-images");
      if (!(strip instanceof HTMLElement)) return;
      const images = readComposerImages(root);
      strip.textContent = "";
      strip.hidden = images.length === 0;
      for (const image of images) {
        const item = document.createElement("figure");
        item.className = "hbu-reader-composer-image";
        item.dataset["status"] = image.status;
        item.dataset["imageId"] = String(image.id);
        const frame = document.createElement("div");
        frame.className = "hbu-reader-composer-image-frame";
        if (image.previewUrl !== "") {
          const preview = document.createElement("img");
          preview.alt = image.name;
          preview.decoding = "async";
          preview.src = image.previewUrl;
          frame.append(preview);
        } else {
          const placeholder = document.createElement("span");
          placeholder.className = "hbu-reader-composer-image-placeholder";
          placeholder.textContent = "图片";
          frame.append(placeholder);
        }
        if (image.status !== "ready") {
          const state = document.createElement("span");
          state.className = "hbu-reader-composer-image-state";
          state.textContent = image.status === "pending" ? "上传中…" : "上传失败";
          frame.append(state);
        }
        if (image.status === "failed") {
          const retry = document.createElement("button");
          retry.type = "button";
          retry.className = "hbu-reader-composer-image-retry";
          retry.textContent = "重试上传";
          retry.setAttribute("aria-label", "重试上传图片 " + image.name);
          retry.addEventListener("click", () => retryComposerImage(root, image.id));
          item.append(retry);
        }
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "hbu-reader-composer-image-remove";
        remove.textContent = "×";
        remove.title = "移除图片";
        remove.setAttribute("aria-label", "移除图片 " + image.name);
        remove.addEventListener("click", () => removeComposerImage(root, image.id));
        item.append(frame, remove);
        strip.append(item);
      }
    };
    const uploadComposerImage = (root, image) => {
      void (async () => {
        try {
          const accountId = await resolveHeyboxId(image.controller.signal);
          if (image.removed) return;
          if (accountId === "") throw new Error("请先登录小黑盒");
          const uploaded = await uploadCommentImage(image.file, accountId, image.controller.signal);
          if (image.removed) return;
          image.status = "ready";
          image.url = uploaded.url;
        } catch (error) {
          if (image.removed || isAbortError(error)) return;
          image.status = "failed";
          image.error = error instanceof Error ? error.message : "图片上传失败";
        }
        if (image.removed) return;
        renderComposerImages(root);
        if (image.status === "failed") {
          const status = readComposerStatus(root);
          if (status !== null) status.textContent = image.name + " 上传失败" + (image.error === "" ? "" : "：" + image.error);
        }
        syncArticleComposers();
      })();
    };
    function removeComposerImage(root, id) {
      const kept = [];
      for (const image of readComposerImages(root)) {
        if (image.id !== id) {
          kept.push(image);
          continue;
        }
        image.removed = true;
        image.controller.abort();
        revokeComposerPreviewUrl(image.previewUrl);
        image.previewUrl = "";
      }
      articleComposerImages.set(root, kept);
      const status = readComposerStatus(root);
      if (status !== null) status.textContent = "";
      renderComposerImages(root);
      syncArticleComposers();
    }
    function retryComposerImage(root, id) {
      const image = readComposerImages(root).find((candidate) => candidate.id === id);
      if (image === void 0 || image.removed || image.status !== "failed") return;
      image.controller = new AbortController();
      image.status = "pending";
      image.error = "";
      image.url = "";
      const status = readComposerStatus(root);
      if (status !== null) status.textContent = "";
      renderComposerImages(root);
      syncArticleComposers();
      uploadComposerImage(root, image);
    }
    function clearComposerImages(root) {
      for (const image of readComposerImages(root)) {
        image.removed = true;
        image.controller.abort();
        revokeComposerPreviewUrl(image.previewUrl);
        image.previewUrl = "";
      }
      articleComposerImages.delete(root);
      renderComposerImages(root);
    }
    const COMPOSER_EMOJI_TOKEN = /\[((?:cube|heygirl)_[^\[\]\n]{1,64})\]/gi;
    const composerSelections = /* @__PURE__ */ new WeakMap();
    const serializeComposerNode = (node) => {
      if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? "";
      if (!(node instanceof Element)) {
        return Array.from(node.childNodes).map(serializeComposerNode).join("");
      }
      if (node instanceof HTMLBRElement) return "\n";
      const emojiName = node instanceof HTMLElement ? node.dataset["emoji"] ?? "" : "";
      if (emojiName !== "") return "[" + emojiName + "]";
      return Array.from(node.childNodes).map(serializeComposerNode).join("");
    };
    const serializeComposerText = (input) => serializeComposerNode(input);
    const saveComposerSelection = (input) => {
      const selection = document.getSelection();
      if (selection === null || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      if (input.contains(range.commonAncestorContainer)) composerSelections.set(input, range.cloneRange());
    };
    const focusComposerAt = (input, savedRange) => {
      input.focus({ preventScroll: true });
      const selection = document.getSelection();
      if (selection === null) return;
      let range = savedRange ?? composerSelections.get(input) ?? null;
      if (range === null || !input.isConnected || !input.contains(range.commonAncestorContainer)) {
        range = document.createRange();
        range.selectNodeContents(input);
        range.collapse(false);
      } else {
        range = range.cloneRange();
      }
      selection.removeAllRanges();
      selection.addRange(range);
      saveComposerSelection(input);
    };
    const updateComposerTextState = (input) => {
      const root = input.closest("[data-hbu-article-composer]");
      const count = root?.querySelector(".hbu-reader-composer-count");
      const text = serializeComposerText(input);
      input.dataset["empty"] = text.trim() === "" ? "true" : "false";
      if (count instanceof HTMLElement) count.textContent = text.length + "/" + ARTICLE_COMMENT_MAX_LENGTH;
    };
    const renderComposerEmojiTokens = (input) => {
      const walker = document.createTreeWalker(input, NodeFilter.SHOW_TEXT);
      const textNodes = [];
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        if (node instanceof Text) textNodes.push(node);
      }
      let rendered = false;
      for (const node of textNodes) {
        const value = node.nodeValue ?? "";
        COMPOSER_EMOJI_TOKEN.lastIndex = 0;
        if (!COMPOSER_EMOJI_TOKEN.test(value)) continue;
        COMPOSER_EMOJI_TOKEN.lastIndex = 0;
        const fragment = document.createDocumentFragment();
        let cursor = 0;
        let lastGlyph = null;
        let nodeRendered = false;
        for (let match = COMPOSER_EMOJI_TOKEN.exec(value); match !== null; match = COMPOSER_EMOJI_TOKEN.exec(value)) {
          const emoji = resolveRailEmojiRef(match[1]);
          if (emoji === null) continue;
          if (match.index > cursor) fragment.append(document.createTextNode(value.slice(cursor, match.index)));
          const glyph = createRailEmojiElement(emoji, "hbu-reader-composer-emoji-glyph");
          glyph.dataset["emoji"] = match[1];
          glyph.contentEditable = "false";
          fragment.append(glyph);
          lastGlyph = glyph;
          cursor = match.index + match[0].length;
          nodeRendered = true;
        }
        rendered = true;
        if (!nodeRendered) continue;
        if (cursor < value.length) fragment.append(document.createTextNode(value.slice(cursor)));
        node.replaceWith(fragment);
        if (lastGlyph !== null) {
          const range = document.createRange();
          range.setStartAfter(lastGlyph);
          range.collapse(true);
          composerSelections.set(input, range);
          const selection = document.getSelection();
          if (selection !== null && input.isConnected) {
            selection.removeAllRanges();
            selection.addRange(range.cloneRange());
          }
        }
      }
      return rendered;
    };
    const rejectComposerOverflow = (input, event) => {
      if (event.inputType !== "insertText" || typeof event.data !== "string") return;
      const selection = document.getSelection();
      const range = selection !== null && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      const selected = range !== null && input.contains(range.commonAncestorContainer) ? serializeComposerNode(range.cloneContents()) : "";
      if (serializeComposerText(input).length - selected.length + event.data.length > ARTICLE_COMMENT_MAX_LENGTH) {
        event.preventDefault();
        const root = input.closest("[data-hbu-article-composer]");
        const status = root?.querySelector(".hbu-reader-composer-status");
        if (status instanceof HTMLElement) status.textContent = "评论最多 " + ARTICLE_COMMENT_MAX_LENGTH + " 字";
      }
    };
    const insertComposerText = (input, text) => {
      if (text === "") return false;
      const current = serializeComposerText(input);
      const selection = document.getSelection();
      const selectedRange = selection !== null && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      const selectedText = selectedRange !== null && input.contains(selectedRange.commonAncestorContainer) ? serializeComposerNode(selectedRange.cloneContents()) : "";
      if (current.length - selectedText.length + text.length > ARTICLE_COMMENT_MAX_LENGTH) return false;
      focusComposerAt(input);
      const activeSelection = document.getSelection();
      if (activeSelection === null || activeSelection.rangeCount === 0) return false;
      const range = activeSelection.getRangeAt(0);
      range.deleteContents();
      const node = document.createTextNode(text);
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      activeSelection.removeAllRanges();
      activeSelection.addRange(range);
      composerSelections.set(input, range.cloneRange());
      input.normalize();
      renderComposerEmojiTokens(input);
      updateComposerTextState(input);
      return true;
    };
    const insertComposerLineBreak = (input) => {
      focusComposerAt(input);
      const selection = document.getSelection();
      if (selection === null || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const lineBreak = document.createElement("br");
      range.insertNode(lineBreak);
      range.setStartAfter(lineBreak);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      composerSelections.set(input, range.cloneRange());
      updateComposerTextState(input);
    };
    const setComposerText = (input, text) => {
      input.replaceChildren(text === "" ? document.createDocumentFragment() : document.createTextNode(text));
      renderComposerEmojiTokens(input);
      const range = document.createRange();
      range.selectNodeContents(input);
      range.collapse(false);
      composerSelections.set(input, range);
      updateComposerTextState(input);
    };
    const addComposerImages = (root, files) => {
      const status = readComposerStatus(root);
      const images = readComposerImages(root);
      const room = MAX_COMMENT_IMAGES - images.length;
      if (room <= 0) {
        if (status !== null) status.textContent = "最多选择 " + MAX_COMMENT_IMAGES + " 张图片";
        return;
      }
      const picked = files.filter((file) => file.type.startsWith("image/"));
      if (picked.length === 0) {
        if (status !== null) status.textContent = "仅支持选择图片文件";
        return;
      }
      const chosen = picked.slice(0, room);
      if (status !== null) status.textContent = picked.length > room ? "最多选择 " + MAX_COMMENT_IMAGES + " 张图片" : "";
      const next = images.slice();
      const added = [];
      for (const file of chosen) {
        articleComposerImageSeq += 1;
        const image = {
          id: articleComposerImageSeq,
          name: file.name,
          file,
          previewUrl: createComposerPreviewUrl(file),
          status: "pending",
          url: "",
          error: "",
          removed: false,
          controller: new AbortController()
        };
        next.push(image);
        added.push(image);
      }
      articleComposerImages.set(root, next);
      renderComposerImages(root);
      syncArticleComposers();
      for (const image of added) uploadComposerImage(root, image);
    };
    const clearArticleReplyTarget = (restoreFocus) => {
      if (articleReplyTarget === null) return;
      articleReplyTarget = null;
      syncArticleComposers();
      if (restoreFocus) readArticleComposers()[0]?.querySelector(".hbu-reader-composer-input")?.focus({ preventScroll: true });
    };
    const beginArticleReply = (target) => {
      for (const root of readArticleComposers()) {
        if (readComposerImages(root).length === 0) continue;
        clearComposerImages(root);
        const status = readComposerStatus(root);
        if (status !== null) status.textContent = "回复暂不支持图片，已移除所选图片";
      }
      articleReplyTarget = target;
      syncArticleComposers();
      readArticleComposers()[0]?.querySelector(".hbu-reader-composer-input")?.focus({ preventScroll: true });
    };
    const syncArticleComposers = () => {
      const reply = articleReplyTarget;
      for (const root of readArticleComposers()) {
        const input = root.querySelector(".hbu-reader-composer-input");
        const submit = root.querySelector(".hbu-reader-composer-submit");
        if (!(input instanceof HTMLElement) || input.getAttribute("contenteditable") !== "true" || !(submit instanceof HTMLButtonElement)) continue;
        const images = readComposerImages(root);
        const uploading = images.some((image) => image.status === "pending");
        const ready = images.filter((image) => image.status === "ready").length;
        const text = serializeComposerText(input);
        submit.disabled = articleCommentBusy || uploading || text.trim() === "" && ready === 0;
        submit.textContent = articleCommentBusy ? "发布中…" : "发布";
        const imageToggle = root.querySelector(".hbu-reader-composer-image-toggle");
        if (imageToggle instanceof HTMLButtonElement) {
          imageToggle.disabled = articleCommentBusy || reply !== null || images.length >= MAX_COMMENT_IMAGES;
          imageToggle.title = reply === null ? "添加图片" : "回复暂不支持图片";
        }
        const replyBar = root.querySelector(".hbu-reader-composer-reply");
        const replyName = root.querySelector(".hbu-reader-composer-reply-name");
        if (replyBar instanceof HTMLElement) replyBar.hidden = reply === null;
        if (replyName !== null) replyName.textContent = reply === null ? "" : "回复 @" + reply.name;
        input.dataset["placeholder"] = reply === null ? "评论这篇文章…" : "回复 @" + reply.name + "…";
        input.setAttribute("aria-label", reply === null ? "评论内容" : "回复 " + reply.name);
      }
    };
    const clearArticleComposers = () => {
      for (const root of readArticleComposers()) {
        articleComposerEmojiClosers.get(root)?.close(false);
        const input = root.querySelector(".hbu-reader-composer-input");
        const status = root.querySelector(".hbu-reader-composer-status");
        const count = root.querySelector(".hbu-reader-composer-count");
        const file = root.querySelector(".hbu-reader-composer-file");
        if (input instanceof HTMLElement && input.getAttribute("contenteditable") === "true") setComposerText(input, "");
        if (file instanceof HTMLInputElement) file.value = "";
        if (status !== null) status.textContent = "";
        if (count !== null) count.textContent = "0/" + ARTICLE_COMMENT_MAX_LENGTH;
        clearComposerImages(root);
      }
      articleReplyTarget = null;
      syncArticleComposers();
    };
    const submitArticleComment = async (input, status) => {
      if (articleCommentBusy) return;
      const root = input.closest("[data-hbu-article-composer]");
      const images = root === null ? [] : readComposerImages(root);
      if (images.some((image) => image.status === "pending")) {
        status.textContent = "图片上传中，请稍候";
        return;
      }
      const imageUrls = images.filter((image) => image.status === "ready" && image.url !== "").map((image) => image.url);
      const text = serializeComposerText(input).trim();
      if (text === "" && imageUrls.length === 0) {
        status.textContent = "请输入评论内容";
        input.focus({ preventScroll: true });
        return;
      }
      const targetId = articleId;
      const generation = readerGeneration;
      const reply = articleReplyTarget;
      articleCommentBusy = true;
      syncArticleComposers();
      status.textContent = "";
      try {
        const accountId = await resolveHeyboxId();
        if (articleId !== targetId || readerGeneration !== generation) return;
        if (accountId === "") throw new Error("请先登录小黑盒");
        const created = await postReaderApi(COMMENT_CREATE_API_PATH, buildArticleCommentBody(targetId, text, reply, imageUrls), accountId);
        if (articleId !== targetId || readerGeneration !== generation) return;
        const createdId = readCreatedCommentId(created);
        const wroteAt = Math.floor(Date.now() / 1e3);
        const replyRootId = reply === null ? "" : reply.rootId !== "" ? reply.rootId : reply.id;
        const replyFloorId = reply === null ? "" : findRailFloorIdForComment(commentState.items, reply.id) || findRailFloorIdForComment(commentState.items, replyRootId);
        const replyVerifyPage = replyFloorId === "" ? 1 : commentState.floorPages.get(replyFloorId) ?? 1;
        saveReaderCommentMark({
          linkId: targetId,
          commentId: createdId,
          text,
          userId: accountId,
          rootId: replyRootId,
          parentId: reply === null ? "" : reply.id,
          createAt: wroteAt,
          verifyPage: replyVerifyPage,
          imageUrls
        });
        clearArticleComposers();
        showToast("评论已发布");
        articleCommentPublishedCount += 1;
        holdRailPageCache(targetId);
        if (linkState !== null) {
          linkState.commentCount = Math.max(0, Number(linkState.commentCount) || 0) + 1;
        } else {
          void loadLinkState(accountId);
        }
        syncActionStates();
        if (commentPanel !== null && !commentPanel.hidden) {
          const pending = reply === null ? null : createRailPendingReply({
            parentId: reply.id,
            rootId: reply.rootId !== "" ? reply.rootId : reply.id,
            text,
            userId: accountId,
            createAt: wroteAt,
            sequence: ++pendingReplySeq,
            imageUrls,
            ...createdId === "" ? {} : { commentId: createdId }
          });
          if (pending !== null) {
            const pendingFloorId = resolvePendingFloorId(commentState.items, pending);
            if (pendingFloorId !== "") collapsedCommentThreads.delete(pendingFloorId);
            commentState.pendingBaselines.set(pending.id, collectRailCommentIds(commentState.items));
            commentState.pendingReplies.push(pending);
            renderReaderComments();
          }
          const floorId = pending === null ? "" : resolvePendingFloorId(commentState.items, pending);
          const page = floorId === "" ? 1 : commentState.floorPages.get(floorId) ?? 1;
          void loadReaderComments(page, {
            fresh: true,
            force: true,
            merge: true,
            verifyPage: page,
            ...pending !== null ? { expectPending: pending } : createdId === "" ? {} : { expectPresentId: createdId }
          });
        }
      } catch (error) {
        if (articleId === targetId && readerGeneration === generation && status.isConnected) {
          status.textContent = error instanceof Error ? error.message : "评论发布失败";
        }
      } finally {
        if (articleId === targetId && readerGeneration === generation) {
          articleCommentBusy = false;
          syncArticleComposers();
        }
      }
    };
    const findReaderCommentNode = (nodes, commentId) => {
      for (const node of nodes) {
        if (node.id === commentId) return node;
        const nested = findReaderCommentNode(node.children, commentId);
        if (nested !== null) return nested;
      }
      return null;
    };
    const readReaderCommentById = (commentId) => {
      for (const entry of commentState.items) {
        if (entry.id === commentId) return entry;
        const nested = findReaderCommentNode(buildRailCommentTree(entry), commentId);
        if (nested !== null) return nested;
      }
      return null;
    };
    const collectReaderThreadIds = (nodes, commentId) => {
      for (const node of nodes) {
        if (node.id === commentId) {
          const ids = /* @__PURE__ */ new Set();
          const collect = (list) => {
            for (const member of list) {
              if (member.id !== "") ids.add(member.id);
              collect(member.children);
            }
          };
          collect([node]);
          return ids;
        }
        const nested = collectReaderThreadIds(node.children, commentId);
        if (nested !== null) return nested;
      }
      return null;
    };
    const removeDeletedComment = (commentId) => {
      let removed = 0;
      const nextItems = [];
      for (const entry of commentState.items) {
        if (entry.id === commentId) {
          removed += 1 + (Array.isArray(entry.subComments) ? entry.subComments.length : 0);
          continue;
        }
        const visibleChildren = Array.isArray(entry.subComments) ? entry.subComments : [];
        const subtree = collectReaderThreadIds(buildRailCommentTree(entry), commentId);
        if (subtree === null) {
          nextItems.push(entry);
          continue;
        }
        const keptChildren = visibleChildren.filter((child) => !subtree.has(child.id));
        removed += visibleChildren.length - keptChildren.length;
        nextItems.push({ ...entry, subComments: keptChildren, quotes: keptChildren });
      }
      if (removed === 0) return 0;
      commentState.items = nextItems;
      return removed;
    };
    const deleteReaderComment = async (commentId) => {
      if (commentId === "" || commentDeleteBusy.has(commentId)) return;
      const owned = readReaderCommentById(commentId);
      if (owned === null || !isOwnRailComment(owned, readerAccountId)) return;
      const targetId = articleId;
      const generation = readerGeneration;
      if (typeof window.confirm === "function" && !window.confirm("删除这条评论？")) return;
      commentDeleteBusy.add(commentId);
      renderReaderComments();
      try {
        const accountId = await resolveHeyboxId();
        if (accountId === "") throw new Error("请先登录小黑盒");
        await postReaderApi(DELETE_COMMENT_API_PATH, buildDeleteCommentBody(commentId), accountId);
        if (articleId !== targetId || readerGeneration !== generation) return;
        removeReaderCommentMark(targetId, commentId);
        if (articleReplyTarget !== null && articleReplyTarget.id === commentId) clearArticleReplyTarget(false);
        const removedCount = removeDeletedComment(commentId);
        commentState.total = Math.max(0, commentState.total - removedCount);
        for (const row of commentState.pendingReplies) {
          if (row.id !== commentId) continue;
          commentState.pendingBaselines.delete(row.id);
          commentState.settledReplies.delete(row.id);
        }
        commentState.pendingReplies = commentState.pendingReplies.filter((row) => row.id !== commentId);
        if (linkState !== null) linkState.commentCount = Math.max(0, (Number(linkState.commentCount) || 0) - removedCount);
        holdRailPageCache(targetId);
        syncActionStates();
        showToast("评论已删除");
        if (commentPanel !== null && !commentPanel.hidden) {
          const floorId = owned.rootId !== "" ? owned.rootId : commentId;
          const page = commentState.floorPages.get(floorId) ?? 1;
          void loadReaderComments(page, { fresh: true, force: true, merge: true, expectAbsentId: commentId });
        }
      } catch (error) {
        if (articleId === targetId && readerGeneration === generation) {
          showToast(error instanceof Error ? error.message : "评论删除失败");
        }
      } finally {
        commentDeleteBusy.delete(commentId);
        if (articleId === targetId && readerGeneration === generation) renderReaderComments();
      }
    };
    const createComposerEmojiPicker = (input, status, toggle, panel) => {
      const grid = document.createElement("div");
      grid.className = "hbu-reader-composer-emoji-groups";
      let isOpen = false;
      let outsideBound = false;
      const detachOutside = () => {
        if (!outsideBound) return;
        document.removeEventListener("pointerdown", onOutsidePointer, true);
        outsideBound = false;
      };
      const close = (restoreFocus) => {
        if (!isOpen) return;
        isOpen = false;
        panel.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
        detachOutside();
        if (restoreFocus === true && toggle.isConnected) toggle.focus({ preventScroll: true });
      };
      const onOutsidePointer = (event) => {
        const target = event.target;
        if (target instanceof Node && (panel.contains(target) || toggle.contains(target))) return;
        close(false);
      };
      const focusAt = (index) => {
        if (buttons.length === 0) return;
        buttons[Math.min(buttons.length - 1, Math.max(0, index))].focus({ preventScroll: true });
      };
      const insert = (pack, name) => {
        const token = "[" + pack + "_" + name + "]";
        if (!insertComposerText(input, token)) {
          status.textContent = "评论最多 " + ARTICLE_COMMENT_MAX_LENGTH + " 字，无法插入表情";
          return;
        }
        status.textContent = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.focus({ preventScroll: true });
      };
      const open = () => {
        if (isOpen) return;
        isOpen = true;
        panel.hidden = false;
        toggle.setAttribute("aria-expanded", "true");
        document.addEventListener("pointerdown", onOutsidePointer, true);
        outsideBound = true;
        focusAt(0);
      };
      let buttons = [];
      const build = () => {
        grid.replaceChildren();
        buttons = [];
        for (const pack of ["cube", "heygirl"]) {
          const group = document.createElement("div");
          group.className = "hbu-reader-composer-emoji-group";
          group.dataset["pack"] = pack;
          const label = document.createElement("div");
          label.className = "hbu-reader-composer-emoji-label";
          label.textContent = pack === "cube" ? "盒表情" : "黑盒娘";
          const sectionGrid = document.createElement("div");
          sectionGrid.className = "hbu-reader-composer-emoji-grid";
          for (const entry of readRailEmojiCatalogEntries(pack)) {
            const name = entry.name;
            const button = document.createElement("button");
            button.type = "button";
            button.dataset["pack"] = pack;
            button.dataset["name"] = name;
            button.setAttribute("aria-label", (pack === "cube" ? "盒表情 " : "黑盒娘 ") + name);
            button.title = name;
            const glyph = document.createElement("span");
            const emoji = resolveRailEmoji(pack, name);
            if (emoji !== null) applyRailEmojiStyle(glyph, emoji, 22);
            button.append(glyph);
            button.addEventListener("click", () => insert(pack, name));
            sectionGrid.append(button);
            buttons.push(button);
          }
          group.append(label, sectionGrid);
          grid.append(group);
        }
      };
      build();
      panel.append(grid);
      panel.addEventListener("keydown", (event) => {
        const active = document.activeElement;
        const index = active instanceof HTMLButtonElement ? buttons.indexOf(active) : -1;
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close(true);
          return;
        }
        if (event.key === "Home") {
          event.preventDefault();
          focusAt(0);
          return;
        }
        if (event.key === "End") {
          event.preventDefault();
          focusAt(buttons.length - 1);
          return;
        }
        const delta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" ? -6 : event.key === "ArrowDown" ? 6 : 0;
        if (delta === 0) return;
        event.preventDefault();
        focusAt((index < 0 ? 0 : index) + delta);
      });
      toggle.addEventListener("click", () => {
        if (isOpen) close(true);
        else open();
      });
      return { close, refresh: build };
    };
    const rebuildComposerEmojiPickers = () => {
      for (const root of readArticleComposers()) articleComposerEmojiClosers.get(root)?.refresh();
    };
    const createArticleComposer = () => {
      const root = document.createElement("div");
      root.className = "hbu-reader-composer";
      root.dataset["hbuArticleComposer"] = "";
      const replyBar = document.createElement("div");
      replyBar.className = "hbu-reader-composer-reply";
      replyBar.hidden = true;
      const replyText = document.createElement("span");
      replyText.className = "hbu-reader-composer-reply-name";
      const replyCancel = document.createElement("button");
      replyCancel.type = "button";
      replyCancel.className = "hbu-reader-composer-reply-cancel";
      replyCancel.textContent = "取消回复";
      replyCancel.addEventListener("click", () => clearArticleReplyTarget(true));
      replyBar.append(replyText, replyCancel);
      const input = document.createElement("div");
      input.className = "hbu-reader-composer-input";
      input.setAttribute("contenteditable", "true");
      input.setAttribute("role", "textbox");
      input.setAttribute("aria-multiline", "true");
      input.dataset["placeholder"] = "评论这篇文章…";
      input.dataset["empty"] = "true";
      input.setAttribute("spellcheck", "false");
      input.setAttribute("aria-label", "评论内容");
      const bar = document.createElement("div");
      bar.className = "hbu-reader-composer-bar";
      const status = document.createElement("div");
      status.className = "hbu-reader-composer-status";
      status.setAttribute("role", "status");
      const count = document.createElement("span");
      count.className = "hbu-reader-composer-count";
      count.textContent = "0/" + ARTICLE_COMMENT_MAX_LENGTH;
      const submit = document.createElement("button");
      submit.type = "button";
      submit.className = "hbu-reader-composer-submit";
      submit.textContent = "发布";
      submit.disabled = true;
      const emojiToggle = document.createElement("button");
      emojiToggle.type = "button";
      emojiToggle.className = "hbu-reader-composer-emoji-toggle";
      emojiToggle.textContent = "表情";
      emojiToggle.setAttribute("aria-label", "插入表情");
      emojiToggle.setAttribute("aria-expanded", "false");
      const emojiPanel = document.createElement("div");
      emojiPanel.className = "hbu-reader-composer-emoji";
      emojiPanel.hidden = true;
      emojiPanel.setAttribute("role", "group");
      emojiPanel.setAttribute("aria-label", "表情列表");
      const emojiPicker = createComposerEmojiPicker(input, status, emojiToggle, emojiPanel);
      const imageToggle = document.createElement("button");
      imageToggle.type = "button";
      imageToggle.className = "hbu-reader-composer-image-toggle";
      imageToggle.textContent = "图片";
      imageToggle.title = "添加图片";
      imageToggle.setAttribute("aria-label", "添加图片");
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.className = "hbu-reader-composer-file";
      fileInput.accept = "image/*";
      fileInput.multiple = true;
      fileInput.tabIndex = -1;
      fileInput.setAttribute("aria-hidden", "true");
      const strip = document.createElement("div");
      strip.className = "hbu-reader-composer-images";
      strip.hidden = true;
      strip.setAttribute("role", "group");
      strip.setAttribute("aria-label", "已选图片");
      imageToggle.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", () => {
        const files = fileInput.files === null ? [] : Array.from(fileInput.files);
        fileInput.value = "";
        addComposerImages(root, files);
      });
      root.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || emojiPanel.hidden) return;
        event.preventDefault();
        event.stopPropagation();
        emojiPicker.close(true);
      }, true);
      let composing = false;
      const syncComposerText = () => {
        if (!composing) renderComposerEmojiTokens(input);
        updateComposerTextState(input);
        syncArticleComposers();
      };
      input.addEventListener("compositionstart", () => {
        composing = true;
      });
      input.addEventListener("compositionend", () => {
        composing = false;
        syncComposerText();
      });
      input.addEventListener("beforeinput", (event) => {
        if (event instanceof InputEvent) rejectComposerOverflow(input, event);
      });
      input.addEventListener("input", syncComposerText);
      input.addEventListener("keyup", () => saveComposerSelection(input));
      input.addEventListener("pointerup", () => saveComposerSelection(input));
      articleComposerSelectionCleanup?.();
      const saveSelection = () => saveComposerSelection(input);
      document.addEventListener("selectionchange", saveSelection);
      articleComposerSelectionCleanup = () => {
        document.removeEventListener("selectionchange", saveSelection);
        articleComposerSelectionCleanup = null;
      };
      input.addEventListener("paste", (event) => {
        event.preventDefault();
        const text = event.clipboardData?.getData("text/plain") ?? "";
        if (insertComposerText(input, text)) syncArticleComposers();
      });
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || event.isComposing) return;
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          if (!submit.disabled) void submitArticleComment(input, status);
          return;
        }
        event.preventDefault();
        insertComposerLineBreak(input);
        syncArticleComposers();
      });
      submit.addEventListener("click", () => void submitArticleComment(input, status));
      bar.append(emojiToggle, imageToggle, status, count, submit);
      root.append(replyBar, input, emojiPanel, strip, fileInput, bar);
      articleComposerEmojiClosers.set(root, emojiPicker);
      return root;
    };
    liveCatalogBootstrap();
    const trapCommentPanelTab = (event) => {
      if (event.key !== "Tab" || commentPanel === null) return;
      const items = Array.from(commentPanel.querySelectorAll("button, a[href], [contenteditable='true'], input, [tabindex]:not([tabindex='-1'])")).filter((node) => node.getBoundingClientRect().width > 0 && !node.hasAttribute("disabled"));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (first === void 0 || last === void 0) return;
      if (event.shiftKey && (document.activeElement === first || !commentPanel.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const ensureCommentPanel = () => {
      if (commentPanel !== null) {
        if (commentPanel.isConnected) return commentPanel;
        commentPanel = null;
        commentPanelList = null;
        lastCommentControlFocus = null;
        commentPanelStatus = null;
        commentPanelStatusText = null;
        commentPanelRetry = null;
        commentPanelMeta = null;
        commentPanelMore = null;
        commentPanelClose = null;
        commentPanelRefresh = null;
      }
      const panel = document.createElement("section");
      panel.className = "hbu-reader-comments-panel";
      panel.hidden = true;
      const scrim = document.createElement("div");
      scrim.className = "hbu-reader-comments-scrim";
      const sheet = document.createElement("div");
      sheet.className = "hbu-reader-comments-sheet";
      sheet.setAttribute("role", "dialog");
      sheet.setAttribute("aria-modal", "true");
      sheet.setAttribute("aria-label", "评论");
      const head = document.createElement("div");
      head.className = "hbu-reader-comments-head";
      const heading = document.createElement("div");
      heading.className = "hbu-reader-comments-heading";
      const title = document.createElement("b");
      title.textContent = "评论";
      const meta = document.createElement("span");
      meta.textContent = "";
      heading.append(title, meta);
      const refresh = document.createElement("button");
      refresh.type = "button";
      refresh.className = "hbu-reader-comments-refresh";
      refresh.setAttribute("aria-label", "刷新评论");
      refresh.title = "刷新评论";
      refresh.innerHTML = READER_ICONS.refresh;
      const close = document.createElement("button");
      close.type = "button";
      close.className = "hbu-reader-comments-close";
      close.setAttribute("aria-label", "关闭评论");
      close.innerHTML = READER_ICONS.close;
      head.append(heading, refresh, close);
      const composer = createArticleComposer();
      const body = document.createElement("div");
      body.className = "hbu-reader-comments-body";
      const list = document.createElement("ol");
      list.className = "hbu-reader-comments-list";
      const status = document.createElement("div");
      status.className = "hbu-reader-comments-status";
      status.setAttribute("role", "group");
      status.setAttribute("aria-label", "评论加载状态");
      const statusText = document.createElement("div");
      statusText.setAttribute("role", "status");
      statusText.setAttribute("aria-live", "polite");
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "hbu-reader-comments-status-retry";
      retry.textContent = "重试";
      retry.hidden = true;
      status.append(statusText, retry);
      body.append(list, status);
      const foot = document.createElement("div");
      foot.className = "hbu-reader-comments-foot";
      const more = document.createElement("button");
      more.type = "button";
      more.textContent = "加载更多";
      const openLink = document.createElement("a");
      openLink.textContent = "打开帖子";
      openLink.href = LINK_HREF_PREFIX + articleId;
      openLink.target = "_blank";
      openLink.rel = "noopener noreferrer";
      foot.append(more, openLink);
      sheet.append(head, composer, body, foot);
      panel.append(scrim, sheet);
      commentPanel = panel;
      commentPanelList = list;
      commentPanelStatus = status;
      commentPanelStatusText = statusText;
      commentPanelRetry = retry;
      commentPanelMeta = meta;
      commentPanelMore = more;
      commentPanelClose = close;
      commentPanelRefresh = refresh;
      list.addEventListener("focusin", (event) => {
        const target = event.target;
        if (target instanceof HTMLElement) {
          const described = describeCommentControl(target);
          if (described !== null) lastCommentControlFocus = described;
        }
      });
      close.addEventListener("click", closeComments);
      scrim.addEventListener("click", closeComments);
      refresh.addEventListener("click", () => {
        if (commentState.loading) return;
        void loadReaderComments(1, { fresh: true, force: true, merge: commentState.page > 1 });
      });
      more.addEventListener("click", () => {
        if (!commentState.loading) void loadReaderComments(commentState.page + 1);
      });
      retry.addEventListener("click", () => {
        if (commentState.loading) return;
        commentPanelClose?.focus({ preventScroll: true });
        void loadReaderComments(commentState.page > 0 ? commentState.page + 1 : 1);
      });
      list.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const collapse = target.closest(".hbu-reader-comments-collapse");
        if (collapse instanceof HTMLElement) {
          const threadId = collapse.dataset["threadId"] || "";
          if (threadId === "") return;
          event.preventDefault();
          const redrawFrom = { id: threadId, action: "expand" };
          collapsedCommentThreads.add(threadId);
          renderReaderComments();
          restoreCommentControlFocus(redrawFrom);
          return;
        }
        const expand = target.closest(".hbu-reader-comments-expand");
        if (expand instanceof HTMLElement) {
          const threadId = expand.dataset["threadId"] || "";
          if (threadId === "") return;
          event.preventDefault();
          const redrawFrom = { id: threadId, action: "collapse" };
          collapsedCommentThreads.delete(threadId);
          renderReaderComments();
          restoreCommentControlFocus(redrawFrom);
          return;
        }
        const remove = target.closest(".hbu-reader-comments-delete");
        if (remove instanceof HTMLElement) {
          const deleteId = remove.dataset["deleteId"] || "";
          if (deleteId === "") return;
          event.preventDefault();
          void deleteReaderComment(deleteId);
          return;
        }
        const reply = target.closest(".hbu-reader-comments-reply");
        if (!(reply instanceof HTMLElement)) return;
        const id = reply.dataset["replyId"] || "";
        const rootId = reply.dataset["replyRoot"] || id;
        const name = reply.dataset["replyName"] || "";
        if (id === "") return;
        event.preventDefault();
        beginArticleReply({ id, rootId, name });
      });
      sheet.addEventListener("keydown", trapCommentPanelTab);
      document.body.append(panel);
      return panel;
    };
    const isCommentPanelOpen = () => commentPanel !== null && !commentPanel.hidden;
    const openComments = () => {
      if (host === null) return;
      closeFavourMenu();
      closeCyDialog();
      if (isCommentPanelOpen()) {
        closeComments();
        return;
      }
      const panel = ensureCommentPanel();
      panel.hidden = false;
      host.inert = true;
      renderReaderComments();
      commentPanelClose?.focus({ preventScroll: true });
      syncArticleComposers();
      if (commentState.loading) return;
      const marks = readReaderCommentMarks(articleId);
      restoreReaderCommentMarks();
      const markVerifyPage = marks.reduce((page, mark) => Math.max(page, mark.verifyPage), 1);
      const expectationOptions = marks.length === 0 ? {} : { expectations: marks, verifyPage: markVerifyPage };
      renderReaderComments();
      const stalePanel = commentState.loaded && Date.now() - commentState.loadedAt > COMMENT_PANEL_STALE_MS;
      if (!commentState.loaded) {
        void loadReaderComments(1, { fresh: true, force: true, ...expectationOptions });
      } else if (stalePanel) {
        void loadReaderComments(1, { fresh: true, force: true, merge: commentState.page > 1, ...expectationOptions });
      }
    };
    const resetReaderComments = () => {
      commentLoadController?.abort();
      commentLoadController = null;
      articleCommentBusy = false;
      commentDeleteBusy.clear();
      collapsedCommentThreads.clear();
      clearArticleComposers();
      if (host !== null) host.inert = false;
      if (commentPanel !== null) {
        commentPanel.hidden = true;
        const link = commentPanel.querySelector(".hbu-reader-comments-foot a");
        if (link !== null) link.href = LINK_HREF_PREFIX + articleId;
      }
      commentState = createCommentState();
    };
    document.addEventListener(HIDE_CY_EVENT, () => {
      if (commentPanel !== null && !commentPanel.hidden) renderReaderComments();
    });
    const closeComments = () => {
      if (commentPanel === null || commentPanel.hidden) return;
      commentPanel.hidden = true;
      lastCommentControlFocus = null;
      if (host !== null) host.inert = false;
      host?.querySelector('[data-action="comment"]')?.focus({ preventScroll: true });
    };
    const closeLightbox = () => {
      const active = document.activeElement;
      const restoreFocus = lightbox !== null && active instanceof HTMLElement && lightbox.contains(active);
      lightbox?.remove();
      lightbox = null;
      lightboxImage = null;
      lightboxZoom = 0;
      lightboxBaseWidth = 0;
      lightboxNatural = { width: 0, height: 0 };
      if (restoreFocus && lightboxReturnFocus !== null && lightboxReturnFocus.isConnected) {
        lightboxReturnFocus.focus({ preventScroll: true });
      }
      lightboxReturnFocus = null;
    };
    const applyLightboxZoom = () => {
      if (lightboxImage === null) return;
      const width = computeLightboxZoomWidth(lightboxBaseWidth, lightboxNatural.width, lightboxZoom);
      if (width <= 0) return;
      lightboxImage.style.width = width + "px";
      lightboxImage.dataset["zoom"] = String(lightboxZoom);
      const hint = lightbox?.querySelector(".hbu-reader-lightbox-hint");
      if (hint !== null && hint !== void 0) {
        hint.textContent = lightboxZoom === 0 ? "左键或 Enter 放大 · 右键或 Shift+Enter 缩小 · 0 复位 · 滚轮查看长图" : "左键放大 · 右键缩小 · 已放大 " + Math.round(width / Math.max(1, lightboxBaseWidth) * 100) + "%";
      }
    };
    const stepLightboxZoom = (delta) => {
      if (lightboxImage === null) return;
      lightboxZoom = Math.max(0, Math.min(LIGHTBOX_ZOOM_MAX, lightboxZoom + delta));
      applyLightboxZoom();
    };
    const resetLightboxZoom = () => {
      if (lightboxImage === null) return;
      lightboxZoom = 0;
      applyLightboxZoom();
    };
    const cycleLightboxFocus = (backwards) => {
      if (lightbox === null) return;
      const focusables = Array.from(lightbox.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])'));
      if (focusables.length === 0) return;
      const index = focusables.findIndex((node) => node === document.activeElement);
      const next = backwards ? index <= 0 ? focusables.length - 1 : index - 1 : index === -1 || index === focusables.length - 1 ? 0 : index + 1;
      focusables[next].focus({ preventScroll: true });
    };
    const bindLightboxTrigger = (image, source) => {
      image.tabIndex = 0;
      image.setAttribute("role", "button");
      image.setAttribute("aria-label", "查看大图");
      image.title = "查看大图";
      image.addEventListener("click", () => openLightbox(source()));
      image.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openLightbox(source());
      });
    };
    const openLightbox = (source) => {
      if (source === "") return;
      if (lightbox === null) {
        const overlay = document.createElement("div");
        overlay.className = "hbu-reader-lightbox";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-label", "查看大图");
        overlay.tabIndex = -1;
        const bar = document.createElement("div");
        bar.className = "hbu-reader-lightbox-bar";
        const hint = document.createElement("div");
        hint.className = "hbu-reader-lightbox-hint";
        hint.textContent = "左键或 Enter 放大 · 右键或 Shift+Enter 缩小 · 0 复位 · 滚轮查看长图";
        const close = document.createElement("button");
        close.type = "button";
        close.className = "hbu-reader-lightbox-close";
        close.setAttribute("aria-label", "关闭大图");
        close.title = "关闭大图";
        close.innerHTML = READER_ICONS.close;
        close.addEventListener("click", closeLightbox);
        bar.append(hint, close);
        const stage = document.createElement("div");
        stage.className = "hbu-reader-lightbox-stage";
        const img2 = document.createElement("img");
        img2.alt = "";
        img2.decoding = "async";
        img2.referrerPolicy = "no-referrer";
        img2.dataset["zoom"] = "0";
        img2.addEventListener("click", (event) => {
          event.stopPropagation();
          stepLightboxZoom(1);
        });
        img2.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          stepLightboxZoom(-1);
        });
        img2.addEventListener("dblclick", (event) => {
          event.preventDefault();
          resetLightboxZoom();
        });
        img2.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          stepLightboxZoom(event.shiftKey ? -1 : 1);
        });
        img2.tabIndex = 0;
        img2.setAttribute("role", "button");
        img2.setAttribute("aria-label", "放大图片");
        img2.addEventListener("load", () => {
          lightboxNatural = { width: img2.naturalWidth, height: img2.naturalHeight };
          lightboxBaseWidth = computeLightboxBaseWidth(img2.naturalWidth, img2.naturalHeight, window.innerWidth, window.innerHeight);
          applyLightboxZoom();
        });
        stage.append(img2);
        overlay.addEventListener("click", closeLightbox);
        overlay.append(bar, stage);
        document.body.append(overlay);
        lightbox = overlay;
        lightboxImage = img2;
        lightboxReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }
      const img = lightboxImage;
      if (img === null) return;
      lightboxZoom = 0;
      lightboxBaseWidth = 0;
      lightboxNatural = { width: 0, height: 0 };
      img.dataset["zoom"] = "0";
      img.style.width = "";
      img.src = source;
      if (img.complete && img.naturalWidth > 0) {
        lightboxNatural = { width: img.naturalWidth, height: img.naturalHeight };
        lightboxBaseWidth = computeLightboxBaseWidth(img.naturalWidth, img.naturalHeight, window.innerWidth, window.innerHeight);
        applyLightboxZoom();
      }
      lightbox.focus({ preventScroll: true });
    };
    const scrollToPage = (index) => {
      if (host === null) return;
      const pages = Array.from(host.querySelectorAll(".hbu-reader-page"));
      if (pages.length === 0) return;
      const next = Math.min(pages.length - 1, Math.max(0, index));
      const target = pages[next];
      if (target === void 0) return;
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      target.scrollIntoView({ block: "start", behavior });
    };
    const scrollViewport = (direction) => {
      const scroll = host?.querySelector(".hbu-reader-scroll");
      if (!scroll) return;
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      scroll.scrollBy({ top: Math.round(scroll.clientHeight * 0.82) * direction, behavior });
    };
    const coverInView = () => {
      const scroll = host?.querySelector(".hbu-reader-scroll");
      const hero = host?.querySelector('.hbu-reader-page[data-kind="hero"]');
      if (!scroll || !hero) return false;
      return hero.getBoundingClientRect().bottom - scroll.getBoundingClientRect().top > scroll.clientHeight * 0.45;
    };
    const bindSwipe = (scroll) => {
      let startX = 0;
      let startY = 0;
      scroll.addEventListener("touchstart", (event) => {
        if (event.touches.length !== 1) return;
        startX = event.touches[0].clientX;
        startY = event.touches[0].clientY;
      }, { passive: true });
      scroll.addEventListener("touchend", (event) => {
        if (event.changedTouches.length !== 1) return;
        const deltaX = event.changedTouches[0].clientX - startX;
        const deltaY = event.changedTouches[0].clientY - startY;
        if (Math.abs(deltaX) < 52 || Math.abs(deltaX) < Math.abs(deltaY) * 1.3) return;
        if (coverInView() && coverTotal > 1) {
          if (deltaX < 0 && coverIndex === coverTotal - 1) scrollToPage(1);
          else if (deltaX > 0 && coverIndex === 0) scrollToPage(0);
          else setCover(coverIndex + (deltaX < 0 ? 1 : -1));
          return;
        }
        const page = host?.querySelectorAll(".hbu-reader-page")[activeIndex];
        if (page !== void 0 && page.scrollWidth > page.clientWidth + 8) return;
        scrollViewport(deltaX < 0 ? 1 : -1);
      }, { passive: true });
    };
    const setCover = (value) => {
      if (host === null || coverTotal === 0) return;
      coverIndex = (value + coverTotal) % coverTotal;
      const sources = Array.from(host.querySelectorAll(".hbu-reader-cover img"));
      const glow = host.querySelector(".hbu-reader-cover-glow");
      if (glow !== null && sources[coverIndex] !== void 0) {
        glow.style.backgroundImage = 'url("' + readImageSource(sources[coverIndex]).replace(/"/g, '\\"') + '")';
      }
      for (const [index, node] of sources.entries()) {
        node.dataset["active"] = String(index === coverIndex);
      }
      for (const [index, node] of Array.from(host.querySelectorAll(".hbu-reader-cover-dots button")).entries()) {
        node.setAttribute("aria-current", String(index === coverIndex));
      }
    };
    const bindTag = (node, text) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        const native = Array.from(document.querySelectorAll("#page-bbs-link .link-tags__tag-item")).find((candidate) => (candidate.textContent || "").trim() === text);
        if (native instanceof HTMLElement) native.click();
      });
    };
    const interactionBindings = /* @__PURE__ */ new Set();
    const bindRichProxy = (clone, native) => {
      if (native.matches(READER_VOTE_SELECTOR + ", button, input, select, textarea, [role=button]") || native.querySelector("button, input, select, textarea, [role=button]") !== null) {
        interactionBindings.add(bindReaderInteraction(clone, native, (node) => !(node instanceof Element) || !isHiddenEmbedNode(node)));
      }
      for (const link of Array.from(clone.querySelectorAll("a[href]"))) {
        if ((link.getAttribute("href") || "").startsWith("#")) link.addEventListener("click", (event) => event.preventDefault());
      }
      for (const image of Array.from(clone.querySelectorAll("img"))) {
        const source = readImageSource(image);
        if (source !== "") image.src = source;
        image.loading = "lazy";
        image.decoding = "async";
        bindLightboxTrigger(image, () => readImageSource(image));
      }
    };
    const EMBED_TAGS = /* @__PURE__ */ new Set(["iframe", "video", "audio", "embed", "object"]);
    const EMBED_SELECTOR = EMBEDDED_MEDIA_SELECTOR;
    const isInlineHidden = (node) => node instanceof HTMLElement && (node.hasAttribute("hidden") || node.style.display === "none" || node.style.visibility === "hidden");
    const isEmbedElement = (node) => node instanceof Element && EMBED_TAGS.has(node.tagName.toLowerCase());
    const isEmbedWrapper = (node) => node instanceof Element && node.tagName.toLowerCase() === "div" && node.classList.contains("iframe");
    const hasHiddenInlineAncestor = (node) => {
      let current = node.parentElement;
      while (current !== null) {
        if (isInlineHidden(current)) return true;
        current = current.parentElement;
      }
      return false;
    };
    const isComputedHidden = (node) => {
      if (!(node instanceof Element) || !node.isConnected) return false;
      const visibility = window.getComputedStyle(node).visibility;
      if (visibility === "hidden" || visibility === "collapse") return true;
      return hasHiddenDisplayAncestor(node);
    };
    const hasHiddenDisplayAncestor = (node) => {
      let current = node;
      while (current !== null && !current.matches(READER_SOURCE_ROOT_SELECTOR)) {
        if (window.getComputedStyle(current).display === "none") return true;
        current = current.parentElement;
      }
      return false;
    };
    const isUnavailableEmbed = (node) => isInlineHidden(node) || hasHiddenInlineAncestor(node) || isComputedHidden(node);
    const isHiddenEmbedNode = (node) => (isEmbedElement(node) || isEmbedWrapper(node)) && isUnavailableEmbed(node);
    const readVisibleEmbeds = (node) => Array.from(node.querySelectorAll(EMBED_SELECTOR)).filter((embed) => !isUnavailableEmbed(embed));
    const isTextFreeContainer = (node) => {
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      return text === "" && node.querySelector("img, picture") === null;
    };
    const readSingleSourceGroup = (source, embeds) => embeds.length === 1 ? { source, embeds } : null;
    const readContainerEmbedGroup = (node, embeds) => {
      if (embeds.length === 0) return null;
      if (isEmbedWrapper(node)) return readSingleSourceGroup(node, embeds);
      return isTextFreeContainer(node) ? readSingleSourceGroup(embeds[0], embeds) : null;
    };
    const readEmbedGroup = (node) => {
      if (!(node instanceof Element) || isUnavailableEmbed(node)) return null;
      if (EMBED_TAGS.has(node.tagName.toLowerCase())) return { source: node, embeds: [node] };
      return readContainerEmbedGroup(node, readVisibleEmbeds(node));
    };
    const readEmbedGroups = (root) => {
      if (!(root instanceof Element)) return [];
      const groups = [];
      const collect = (node) => {
        if (!node.matches(EMBED_SELECTOR) && node.querySelector(EMBED_SELECTOR) === null) return;
        const group = readEmbedGroup(node);
        if (group !== null) {
          groups.push(group);
          return;
        }
        for (const child of Array.from(node.children)) collect(child);
      };
      collect(root);
      return groups;
    };
    const containsEmbedOrWrapper = (node) => node.matches(EMBED_SELECTOR) || isEmbedWrapper(node) || node.querySelector(EMBED_SELECTOR) !== null;
    const readMediaSequenceItem = (node) => {
      if (node instanceof HTMLImageElement) return { kind: "image", node };
      if (!containsEmbedOrWrapper(node)) return null;
      const group = readEmbedGroup(node);
      return group === null ? null : { kind: "embed", group };
    };
    const readMediaSequence = (root) => {
      if (!(root instanceof Element)) return [];
      const items = [];
      const collect = (node) => {
        const item = readMediaSequenceItem(node);
        if (item !== null) {
          items.push(item);
          return;
        }
        for (const child of Array.from(node.children)) collect(child);
      };
      collect(root);
      return items;
    };
    const readImageSource = (node) => {
      if (!(node instanceof HTMLImageElement)) return "";
      for (const name of ["data-src", "data-original"]) {
        const value = (node.getAttribute(name) || "").trim();
        if (value !== "" && !/^(?:data|blob):/i.test(value)) return value;
      }
      for (const value of [node.currentSrc, node.getAttribute("src") || ""]) {
        const source = value.trim();
        if (source !== "" && !/^(?:data|blob):/i.test(source)) return source;
      }
      return "";
    };
    const readVideoSource = (node) => {
      if (!(node instanceof HTMLVideoElement)) return "";
      const values = [
        ...Array.from(node.querySelectorAll("source")).map((source) => source.getAttribute("src") || ""),
        node.getAttribute("src") || "",
        node.currentSrc
      ];
      for (const raw of values) {
        const source = raw.trim();
        if (source === "" || /^(?:javascript|data):/i.test(source)) continue;
        return source;
      }
      return "";
    };
    const readPosterSource = (node) => {
      if (!(node instanceof HTMLVideoElement)) return "";
      const poster = (node.getAttribute("poster") || "").trim();
      return poster !== "" && !/^(?:data|blob):/i.test(poster) ? poster : "";
    };
    const readHeaderImages = (pageRoot) => {
      const seen = /* @__PURE__ */ new Set();
      const sources = [];
      if (!(pageRoot instanceof Element)) return sources;
      for (const node of Array.from(pageRoot.querySelectorAll(READER_SOURCE_HEADER_SELECTOR))) {
        const source = readImageSource(node);
        if (source === "" || seen.has(source)) continue;
        seen.add(source);
        sources.push(source);
      }
      return sources;
    };
    const readOrderedImageSources = (scope) => {
      if (!(scope instanceof Element)) return [];
      const seen = /* @__PURE__ */ new Set();
      const sources = [];
      for (const node of Array.from(scope.querySelectorAll("img"))) {
        if (node.closest(READER_MEDIA_EXCLUDE_SELECTOR) !== null) continue;
        const source = readImageSource(node);
        if (source === "" || seen.has(source)) continue;
        seen.add(source);
        sources.push(source);
      }
      return sources;
    };
    const readBodyImages = (article, body) => {
      const scope = body || article;
      if (!(scope instanceof Element)) return [];
      const seen = /* @__PURE__ */ new Set();
      const candidates = [];
      for (const [index, node] of Array.from(scope.querySelectorAll("img")).entries()) {
        if (node.closest(READER_MEDIA_EXCLUDE_SELECTOR) !== null) continue;
        const source = readImageSource(node);
        if (source === "" || seen.has(source)) continue;
        seen.add(source);
        const naturalWidth = node.naturalWidth;
        const naturalHeight = node.naturalHeight;
        const rect = node.getBoundingClientRect();
        const declaredWidth = Number(node.getAttribute("width")) || 0;
        const declaredHeight = Number(node.getAttribute("height")) || 0;
        const width = naturalWidth > 0 ? naturalWidth : rect.width > 0 ? rect.width : declaredWidth;
        const height = naturalHeight > 0 ? naturalHeight : rect.height > 0 ? rect.height : declaredHeight;
        if (width > 0 && width < 120) continue;
        candidates.push({ source, area: width * height, loaded: naturalWidth > 0, index });
      }
      candidates.sort((left, right) => Number(right.loaded) - Number(left.loaded) || right.area - left.area || left.index - right.index);
      return candidates.map((item) => item.source);
    };
    const readPositiveDimension = (raw, pattern) => {
      if (!pattern.test(raw)) return 0;
      const value = Number.parseFloat(raw);
      return Number.isFinite(value) && value > 0 ? value : 0;
    };
    const readEmbedDimension = (node, name) => {
      const inlineValue = node instanceof HTMLElement ? node.style[name].trim() : "";
      if (/^\d+(\.\d+)?px$/.test(inlineValue)) return readPositiveDimension(inlineValue, /^\d+(\.\d+)?px$/);
      const attributeValue = (node.getAttribute(name) || "").trim();
      return readPositiveDimension(attributeValue, /^\d+(\.\d+)?$/);
    };
    const readEmbedHeight = (node) => readEmbedDimension(node, "height");
    const readEmbedWidth = (node) => readEmbedDimension(node, "width");
    const isAudioOnlyGroup = (embeds) => embeds.length > 0 && embeds.every((embed) => embed.tagName.toLowerCase() === "audio");
    const SUSPENDED_SOURCE_MARKER = "heybox-up-suspended";
    const readSuspendedSourceValue = (name) => name === "srcdoc" ? '<!doctype html><meta name="heybox-up-suspended" content="">' : `about:blank#${SUSPENDED_SOURCE_MARKER}`;
    const reconcileSuspendedSourceMutations = (embed, state, records) => {
      if (suspendedEmbeds.get(embed) !== state) return;
      for (const record of records) {
        const name = record.attributeName;
        if (name === null) continue;
        delete state.attributes[name];
      }
    };
    const suspendMediaEmbed = (embed) => {
      suspendedEmbeds.set(embed, {
        kind: "media",
        muted: embed.muted,
        currentTime: Number.isFinite(embed.currentTime) ? embed.currentTime : 0
      });
      embed.muted = true;
      embed.pause();
    };
    const suspendMarkupEmbed = (embed) => {
      const attributes = {};
      for (const name of EMBEDDED_MEDIA_SOURCE_ATTRIBUTES) {
        const value = embed.getAttribute(name);
        if (value !== null) attributes[name] = value;
      }
      const state = { kind: "markup", attributes, sourceObserver: null };
      const sourceObserver = new MutationObserver((records) => reconcileSuspendedSourceMutations(embed, state, records));
      state.sourceObserver = sourceObserver;
      sourceObserver.observe(embed, { attributes: true, attributeFilter: Array.from(EMBEDDED_MEDIA_SOURCE_ATTRIBUTES) });
      suspendedEmbeds.set(embed, state);
      for (const name of Object.keys(attributes)) embed.setAttribute(name, readSuspendedSourceValue(name));
      sourceObserver.takeRecords();
    };
    const suspendNativeEmbed = (embed) => {
      if (suspendedEmbeds.has(embed)) return;
      if (embed instanceof HTMLMediaElement) {
        suspendMediaEmbed(embed);
        return;
      }
      suspendMarkupEmbed(embed);
    };
    const restoreSuspendedMedia = (embed, state) => {
      embed.muted = state.muted;
      if (state.currentTime <= 0 || embed.readyState <= 0) return;
      try {
        embed.currentTime = state.currentTime;
      } catch (error) {
        console.debug("[HeyBox Up] Failed to restore embedded media position", error);
      }
    };
    const restoreSuspendedMarkup = (embed, state) => {
      if (state.sourceObserver !== null) {
        reconcileSuspendedSourceMutations(embed, state, state.sourceObserver.takeRecords());
        state.sourceObserver.disconnect();
      }
      for (const [name, value] of Object.entries(state.attributes)) embed.setAttribute(name, value);
    };
    const restoreSuspendedEmbed = (embed, state) => {
      if (state.kind === "markup") {
        restoreSuspendedMarkup(embed, state);
        return;
      }
      if (embed instanceof HTMLMediaElement) restoreSuspendedMedia(embed, state);
    };
    const restoreSuspendedEmbeds = () => {
      for (const [embed, state] of suspendedEmbeds) restoreSuspendedEmbed(embed, state);
      suspendedEmbeds.clear();
    };
    const removeUnavailableEmbedClones = (clone, source) => {
      const nativeEmbeds = Array.from(source.querySelectorAll(EMBED_SELECTOR));
      const clonedEmbeds = Array.from(clone.querySelectorAll(EMBED_SELECTOR));
      nativeEmbeds.forEach((embed, index) => {
        const cloned = clonedEmbeds[index];
        if (cloned instanceof Element && isUnavailableEmbed(embed)) cloned.remove();
      });
    };
    const readGroupDimension = (group, reader) => {
      const ownValue = reader(group.source);
      if (!isEmbedWrapper(group.source) || ownValue > 0) return ownValue;
      const declared = group.embeds.find((embed) => reader(embed) > 0);
      return declared === void 0 ? 0 : reader(declared);
    };
    const applyDefaultEmbedRatio = (frame, group) => {
      if (isAudioOnlyGroup(group.embeds)) return;
      frame.style.aspectRatio = "16 / 9";
    };
    const applyEmbedFrameAspect = (frame, group, width, height) => {
      if (width > 0 && height > 0) {
        frame.style.aspectRatio = `${width} / ${height}`;
        return;
      }
      if (height > 0) {
        frame.style.height = `${height}px`;
        return;
      }
      applyDefaultEmbedRatio(frame, group);
    };
    const applyEmbedFrameSize = (frame, group) => {
      const width = readGroupDimension(group, readEmbedWidth);
      const height = readGroupDimension(group, readEmbedHeight);
      if (width > 0) frame.style.width = `min(100%, ${width}px)`;
      applyEmbedFrameAspect(frame, group, width, height);
    };
    const addEmbedPage = (target, group) => {
      const clone = group.source.cloneNode(true);
      removeUnavailableEmbedClones(clone, group.source);
      const frame = document.createElement("div");
      frame.className = "hbu-reader-embed";
      frame.append(clone);
      applyEmbedFrameSize(frame, group);
      const page = document.createElement("section");
      page.className = "hbu-reader-page";
      page.dataset["kind"] = "embed";
      page.append(frame);
      target.append(page);
      for (const embed of group.embeds) suspendNativeEmbed(embed);
    };
    const addTextPages = (target, lines) => {
      let buffer = [];
      let bufferChars = 0;
      const flush = () => {
        const paragraphs = buffer;
        buffer = [];
        bufferChars = 0;
        if (paragraphs.length === 0) return;
        const page = document.createElement("section");
        page.className = "hbu-reader-page";
        page.dataset["kind"] = "text";
        const copy = document.createElement("div");
        copy.className = "hbu-reader-copy";
        for (const paragraph of paragraphs) {
          const node = document.createElement("p");
          node.textContent = paragraph;
          copy.append(node);
        }
        page.append(copy);
        target.append(page);
      };
      for (const raw of lines) {
        const line = raw.replace(/\s+/g, " ").trim();
        if (line === "") continue;
        buffer.push(line);
        bufferChars += line.length;
        if (buffer.length >= 4 || bufferChars >= 420) flush();
      }
      flush();
    };
    const addMediaPage = (target, source, caption) => {
      if (source === "") return;
      const page = document.createElement("section");
      page.className = "hbu-reader-page";
      page.dataset["kind"] = "media";
      const img = document.createElement("img");
      img.className = "hbu-reader-media";
      img.src = source;
      img.alt = caption || "正文图片";
      img.loading = "lazy";
      img.decoding = "async";
      bindLightboxTrigger(img, () => img.currentSrc || img.src);
      page.append(img);
      target.append(page);
    };
    const addNoticePage = (target, heading, message) => {
      const page = document.createElement("section");
      page.className = "hbu-reader-page";
      page.dataset["kind"] = "notice";
      const card = document.createElement("div");
      card.className = "hbu-reader-notice";
      const title = document.createElement("h2");
      title.textContent = heading;
      const copy = document.createElement("p");
      copy.textContent = message;
      const action = document.createElement("a");
      action.href = LINK_HREF_PREFIX + articleId;
      action.textContent = "查看原帖";
      const capturedArticleId = articleId;
      action.addEventListener("click", (event) => {
        event.preventDefault();
        if (articleId !== capturedArticleId) return;
        dismissedArticleId = capturedArticleId;
        teardown();
        showToast("已退出沉浸阅读，可在设置中重新开启");
      });
      card.append(title, copy, action);
      page.append(card);
      target.append(page);
    };
    const addVideoPage = (target, item) => {
      const page = document.createElement("section");
      page.className = "hbu-reader-page";
      page.dataset["kind"] = "video";
      const video = document.createElement("video");
      video.className = "hbu-reader-video";
      video.controls = true;
      video.autoplay = false;
      video.playsInline = true;
      video.preload = "metadata";
      video.setAttribute("aria-label", "原帖视频");
      if (item.poster !== "") video.poster = item.poster;
      video.src = item.source;
      page.append(video);
      target.append(page);
      suspendNativeEmbed(item.node);
    };
    const addVideoPostPages = (target, data) => {
      if (!data.isVideoPost) return;
      const usable = data.videos.filter((item) => item.source !== "");
      if (usable.length === 0) {
        addNoticePage(target, "视频暂时无法加载", "原帖还没有给出可播放的视频地址，可以刷新页面重试，或回到原帖播放。");
        return;
      }
      for (const item of usable) addVideoPage(target, item);
    };
    const addHeadingPage = (target, text) => {
      const value = text.replace(/\s+/g, " ").trim();
      if (value === "") return;
      const page = document.createElement("section");
      page.className = "hbu-reader-page";
      page.dataset["kind"] = "heading";
      const copy = document.createElement("div");
      copy.className = "hbu-reader-copy";
      copy.textContent = value;
      page.append(copy);
      target.append(page);
    };
    const addRichPage = (target, native) => {
      const clone = native.cloneNode(true);
      removeUnavailableEmbedClones(clone, native);
      bindRichProxy(clone, native);
      for (const group of readEmbedGroups(native)) {
        for (const embed of group.embeds) suspendNativeEmbed(embed);
      }
      const page = document.createElement("section");
      page.className = "hbu-reader-page";
      page.dataset["kind"] = "rich";
      const rich = document.createElement("div");
      rich.className = "hbu-reader-rich";
      rich.append(clone);
      page.append(rich);
      target.append(page);
    };
    const buildPages = (target, body) => {
      if (!(target instanceof DocumentFragment) || !(body instanceof Element)) return;
      const lines = [];
      const flush = () => {
        if (lines.length === 0) return;
        addTextPages(target, lines.splice(0, lines.length));
      };
      const visit = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          for (const line of (node.textContent || "").split(/\n+/)) lines.push(line);
          return;
        }
        if (!(node instanceof Element)) return;
        const tag = node.tagName.toLowerCase();
        if (tag === "br") {
          flush();
          return;
        }
        if (tag === "script" || tag === "style") return;
        if (isHiddenEmbedNode(node)) return;
        if (node.matches(READER_VOTE_SELECTOR)) {
          flush();
          addRichPage(target, node);
          return;
        }
        if (tag === "img") {
          flush();
          addMediaPage(target, node.getAttribute("data-src") || node.getAttribute("src") || "", node.getAttribute("alt") || "");
          return;
        }
        if (/^h[1-4]$/.test(tag)) {
          flush();
          addHeadingPage(target, node.textContent || "");
          return;
        }
        const embedGroup = readEmbedGroup(node);
        if (embedGroup !== null) {
          flush();
          addEmbedPage(target, embedGroup);
          return;
        }
        const images = Array.from(node.querySelectorAll("img"));
        const text = (node.textContent || "").replace(/\s+/g, " ").trim();
        const mediaOnly = text === "" && (images.length === 1 || readVisibleEmbeds(node).length > 0);
        if (mediaOnly) {
          flush();
          for (const item of readMediaSequence(node)) {
            if (item.kind === "image") {
              addMediaPage(target, item.node.getAttribute("data-src") || item.node.getAttribute("src") || item.node.currentSrc || "", item.node.getAttribute("alt") || "");
              continue;
            }
            addEmbedPage(target, item.group);
          }
          return;
        }
        const className = typeof node.className === "string" ? node.className : "";
        const isCard = /(^|\s)(com-|hb-cpt__image|card)/.test(className);
        const isMixedLeaf = text !== "" && !isCard && readVisibleEmbeds(node).length > 0 && node.querySelector("p, div, section, article, ul, ol, table, blockquote, pre, h1, h2, h3, h4, h5, h6") === null;
        if (["div", "section", "article"].includes(tag) && isMixedLeaf) {
          flush();
          addRichPage(target, node);
          return;
        }
        if (["div", "section", "article"].includes(tag) && !isCard && node.children.length > 0) {
          for (const child of Array.from(node.childNodes)) visit(child);
          return;
        }
        const isSimple = (tag === "p" || tag === "div" && node.children.length === 0) && node.querySelector(EMBED_SELECTOR) === null;
        if (isSimple && text !== "" && images.length === 0) {
          lines.push(text);
          return;
        }
        flush();
        if (text !== "" || images.length > 0) addRichPage(target, node);
      };
      const article = body.closest(READER_SOURCE_ROOT_SELECTOR);
      const scope = article?.parentElement || body.parentElement || body;
      const votes = Array.from(scope.querySelectorAll(READER_VOTE_SELECTOR)).filter((vote) => !body.contains(vote) && vote.parentElement?.closest(READER_VOTE_SELECTOR) === null);
      const before = votes.filter((vote) => (vote.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
      for (const vote of before) addRichPage(target, vote);
      for (const child of Array.from(body.childNodes)) visit(child);
      flush();
      for (const vote of votes) if (!before.includes(vote)) addRichPage(target, vote);
    };
    const readEmbedSourceSrcs = (node) => JSON.stringify(
      Array.from(node.querySelectorAll("source")).map((child) => child.getAttribute("src") || "")
    );
    const readEmbedStyleValue = (node, name) => node instanceof HTMLElement ? node.style[name] || "" : "";
    const readEmbedSignature = (root) => {
      if (!(root instanceof Element)) return "";
      return Array.from(root.querySelectorAll(".iframe, iframe, video, audio, embed, object")).map((node) => [
        node.tagName.toLowerCase(),
        node.classList.contains("iframe") ? "wrapper" : "",
        readEmbedStyleValue(node, "width"),
        readEmbedStyleValue(node, "height"),
        readEmbedStyleValue(node, "visibility"),
        readEmbedStyleValue(node, "display"),
        node.getAttribute("width") || "",
        node.getAttribute("height") || "",
        node.getAttribute("src") || "",
        node instanceof HTMLMediaElement ? node.currentSrc : "",
        node.getAttribute("poster") || "",
        node.getAttribute("srcdoc") || "",
        node.getAttribute("data") || "",
        readEmbedSourceSrcs(node),
        node.hasAttribute("hidden") ? "hidden" : "",
        isUnavailableEmbed(node) ? "hidden" : "visible"
      ].join("~")).join("|");
    };
    const flushReaderRatio = () => {
      if (ratioSaveTimer !== 0) {
        window.clearTimeout(ratioSaveTimer);
        ratioSaveTimer = 0;
      }
      if (durableRatioTimer !== 0) {
        window.clearTimeout(durableRatioTimer);
        durableRatioTimer = 0;
      }
      if (pendingRatio === null) return;
      writeReaderRatio(pendingRatio.id, pendingRatio.ratio);
      persistReaderRatio(pendingRatio.id, pendingRatio.ratio);
      pendingRatio = null;
    };
    const scheduleReaderRatio = (id, ratio) => {
      if (id === "") return;
      pendingRatio = { id, ratio };
      if (ratioSaveTimer === 0) {
        ratioSaveTimer = window.setTimeout(() => {
          ratioSaveTimer = 0;
          if (pendingRatio !== null) writeReaderRatio(pendingRatio.id, pendingRatio.ratio);
        }, 400);
      }
      if (durableRatioTimer === 0) {
        durableRatioTimer = window.setTimeout(() => {
          durableRatioTimer = 0;
          if (pendingRatio !== null) persistReaderRatio(pendingRatio.id, pendingRatio.ratio);
        }, 2e3);
      }
    };
    const updateProgress = () => {
      const scroll = progressScroll;
      if (scroll === null || !scroll.isConnected) return;
      const max = scroll.scrollHeight - scroll.clientHeight;
      const ratio = max <= 0 ? 1 : Math.min(1, Math.max(0, scroll.scrollTop / max));
      const percent = Math.round(ratio * 100);
      if (progressCurrent !== null && progressCurrent.textContent !== percent + "%") {
        progressCurrent.textContent = percent + "%";
      }
      if (progressFill !== null && lastProgressPercent !== percent) {
        progressFill.style.width = Math.max(2, ratio * 100) + "%";
        lastProgressPercent = percent;
      }
      if (!restoring) scheduleReaderRatio(articleId, ratio);
    };
    const setActive = (index) => {
      activeIndex = Math.min(pageCount - 1, Math.max(0, index));
      updateProgress();
      writeReaderScroll(articleId, activeIndex);
    };
    const observePages = (scroll) => {
      observer?.disconnect();
      if (host === null) return;
      const pages = Array.from(host.querySelectorAll(".hbu-reader-page"));
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = entry.target instanceof HTMLElement ? pages.indexOf(entry.target) : -1;
          if (index !== -1) setActive(index);
        }
      }, { root: scroll, threshold: 0.55 });
      for (const page of pages) observer.observe(page);
    };
    const closeCurrentReader = () => {
      dismissedArticleId = articleId;
      teardown();
      showToast("已退出当前文章的沉浸阅读");
    };
    const syncReaderEndActions = () => {
      if (host === null) return;
      const status = navigation.readStatus();
      const prevButton = host.querySelector(".hbu-reader-end-actions [data-prev]");
      const nextButton = host.querySelector(".hbu-reader-end-actions [data-next]");
      const statusNode = host.querySelector(".hbu-reader-end-status");
      if (prevButton instanceof HTMLButtonElement) prevButton.disabled = status.prev === null;
      if (nextButton instanceof HTMLButtonElement) {
        nextButton.disabled = status.discovering;
        nextButton.innerHTML = status.discovering ? "正在寻找下一篇…" : "下一篇 " + READER_ICONS.next;
      }
      if (statusNode instanceof HTMLElement) {
        const text = status.discovering ? "正在从信息流寻找下一篇…" : status.error !== "" ? status.error + "，点击“下一篇”重试" : status.exhausted ? "已经读到本次信息流的末尾" : "";
        statusNode.textContent = text;
        statusNode.hidden = text === "";
      }
    };
    const lockReaderAdvance = () => {
      readerAdvanceLockToken += 1;
      readerAdvanceLocked = true;
      return readerAdvanceLockToken;
    };
    const unlockReaderAdvance = (token = 0) => {
      if (token !== 0 && token !== readerAdvanceLockToken) return;
      readerAdvanceLocked = false;
    };
    const clearPendingReaderAdvance = () => {
      readerPendingAdvanceSourceId = "";
      readerPendingAdvanceRevision = -1;
    };
    const openReaderArticle = (id) => {
      if (id === "") return;
      const token = lockReaderAdvance();
      void navigateToPath(LINK_HREF_PREFIX + id).then((accepted) => {
        if (accepted !== true) unlockReaderAdvance(token);
      }, () => {
        unlockReaderAdvance(token);
      });
    };
    const advanceFromReader = () => {
      if (host === null || readerAdvanceLocked) return;
      const status = navigation.readStatus();
      if (status.next !== null && status.next.source !== "related") {
        const taken = navigation.takeNext();
        if (taken !== null) {
          clearPendingReaderAdvance();
          openReaderArticle(taken.id);
          return;
        }
      }
      readerPendingAdvanceSourceId = status.currentId;
      readerPendingAdvanceRevision = status.revision;
      void navigation.discover();
    };
    const createHead = (data) => {
      const head = document.createElement("div");
      head.className = "hbu-reader-head";
      const back = document.createElement("button");
      back.type = "button";
      back.className = "hbu-reader-round";
      back.setAttribute("aria-label", "返回");
      back.title = "返回";
      back.innerHTML = READER_ICONS.back;
      back.addEventListener("click", () => history.back());
      const home = document.createElement("button");
      home.type = "button";
      home.className = "hbu-reader-home";
      home.setAttribute("aria-label", "返回社区首页");
      home.title = "返回社区首页（H）";
      home.innerHTML = READER_ICONS.home + "<span>社区首页</span>";
      home.addEventListener("click", () => navigateToPath("/app/bbs/home"));
      const author = document.createElement("a");
      author.className = "hbu-reader-head-author";
      author.href = data.authorHref;
      author.title = data.author;
      if (data.avatar !== "") {
        const avatar = document.createElement("img");
        avatar.src = data.avatar;
        avatar.alt = "";
        author.append(avatar);
      }
      const name = document.createElement("span");
      name.textContent = data.author;
      author.append(name);
      const follow = document.createElement("button");
      follow.type = "button";
      follow.className = "hbu-reader-follow";
      follow.textContent = "关注";
      follow.addEventListener("click", toggleFollowAuthor);
      const spacer = document.createElement("span");
      spacer.className = "hbu-reader-head-spacer";
      const share = document.createElement("button");
      share.type = "button";
      share.className = "hbu-reader-round";
      share.setAttribute("aria-label", "分享");
      share.title = "分享";
      share.innerHTML = READER_ICONS.share;
      share.addEventListener("click", () => void shareArticle(data));
      const exit = document.createElement("button");
      exit.type = "button";
      exit.className = "hbu-reader-round";
      exit.setAttribute("aria-label", "关闭当前文章的沉浸阅读");
      exit.title = "关闭当前文章的沉浸阅读（R）";
      exit.innerHTML = READER_ICONS.close;
      exit.addEventListener("click", closeCurrentReader);
      head.append(back, home, author, follow, spacer, share, exit);
      return head;
    };
    const createRail = (data) => {
      const rail = document.createElement("aside");
      rail.className = "hbu-reader-rail";
      rail.setAttribute("aria-label", "文章互动");
      const avatar = document.createElement("a");
      avatar.className = "hbu-reader-action hbu-reader-rail-avatar-link";
      avatar.href = data.authorHref;
      avatar.title = "查看作者 " + data.author;
      avatar.setAttribute("aria-label", "查看作者 " + data.author);
      if (data.avatar !== "") {
        const img = document.createElement("img");
        img.src = data.avatar;
        img.alt = "";
        img.className = "hbu-reader-rail-avatar";
        avatar.append(img);
      }
      const like = document.createElement("button");
      like.type = "button";
      like.className = "hbu-reader-action";
      like.dataset["action"] = "like";
      like.setAttribute("aria-label", "点赞");
      like.title = "点赞";
      like.innerHTML = READER_ICONS.like;
      like.addEventListener("click", () => void toggleLike());
      const favour = document.createElement("button");
      favour.type = "button";
      favour.className = "hbu-reader-action";
      favour.dataset["action"] = "favour";
      favour.setAttribute("aria-label", "收藏");
      favour.setAttribute("aria-haspopup", "dialog");
      favour.setAttribute("aria-expanded", "false");
      favour.title = "收藏到收藏夹";
      favour.innerHTML = READER_ICONS.star;
      favour.addEventListener("click", () => openFavourMenu(rail, favour));
      const cy = document.createElement("button");
      cy.type = "button";
      cy.className = "hbu-reader-action hbu-reader-action--cy";
      cy.dataset["action"] = "cy";
      cy.setAttribute("aria-label", "CY 0");
      cy.title = "CY 0";
      cy.innerHTML = '<span class="hbu-reader-cy-label">CY</span><span class="hbu-reader-cy-count">0</span>';
      cy.addEventListener("click", openCyDialog);
      const comment = document.createElement("button");
      comment.type = "button";
      comment.className = "hbu-reader-action";
      comment.dataset["action"] = "comment";
      comment.setAttribute("aria-label", "查看评论");
      comment.title = "查看评论（C）";
      comment.addEventListener("click", () => void openComments());
      const share = document.createElement("button");
      share.type = "button";
      share.className = "hbu-reader-action";
      share.setAttribute("aria-label", "分享");
      share.title = "分享";
      share.innerHTML = READER_ICONS.share;
      share.addEventListener("click", () => void shareArticle(data));
      const spacing = document.createElement("button");
      spacing.type = "button";
      spacing.className = "hbu-reader-action";
      spacing.dataset["action"] = "spacing";
      spacing.setAttribute("aria-label", "阅读设置");
      spacing.setAttribute("aria-haspopup", "true");
      spacing.setAttribute("aria-expanded", "false");
      spacing.title = "阅读设置";
      spacing.innerHTML = SETTINGS_ICON;
      spacing.addEventListener("click", () => openSpacingMenu(rail, spacing));
      rail.append(avatar, like, favour, cy, comment, share, spacing);
      return rail;
    };
    const createHeroCover = (page, data, sources, kind) => {
      const cover = document.createElement("div");
      cover.className = "hbu-reader-cover";
      const stage = document.createElement("div");
      stage.className = "hbu-reader-cover-stage";
      const progress = document.createElement("div");
      progress.className = "hbu-reader-cover-progress";
      progress.hidden = true;
      const glow = document.createElement("div");
      glow.className = "hbu-reader-cover-glow";
      const capturedArticleId = articleId;
      const capturedGeneration = readerGeneration;
      const images = [];
      const renderCoverPager = () => {
        const nav = stage.querySelectorAll(".hbu-reader-cover-nav");
        for (const node of nav) node.hidden = coverTotal < 2;
        progress.textContent = "";
        progress.hidden = coverTotal < 2;
        if (coverTotal < 2) return;
        const row = document.createElement("div");
        row.className = "hbu-reader-cover-dots";
        images.forEach((image, dotIndex) => {
          const dot = document.createElement("button");
          dot.type = "button";
          dot.setAttribute("aria-label", "封面 " + (dotIndex + 1));
          dot.setAttribute("aria-current", String(dotIndex === coverIndex));
          dot.addEventListener("click", () => setCover(dotIndex));
          row.append(dot);
        });
        progress.append(row);
      };
      const dropFailedCover = (failed) => {
        if (host === null || !host.isConnected) return;
        if (articleId !== capturedArticleId || readerGeneration !== capturedGeneration) return;
        const index = images.indexOf(failed);
        if (index === -1) return;
        images.splice(index, 1);
        failed.remove();
        if (index < coverIndex) coverIndex -= 1;
        coverTotal = images.length;
        coverIndex = Math.min(Math.max(0, coverIndex), Math.max(0, coverTotal - 1));
        if (coverTotal === 0) {
          cover.remove();
          if (kind === "header" && data.heroImage !== "") {
            createHeroCover(page, data, [data.heroImage], "body");
            return;
          }
          page.dataset["cover"] = "none";
          coverIndex = 0;
          return;
        }
        page.dataset["cover"] = kind;
        renderCoverPager();
        setCover(coverIndex);
      };
      stage.append(glow);
      sources.forEach((source, index) => {
        const img = document.createElement("img");
        img.alt = index === 0 ? data.title : "封面 " + (index + 1);
        img.dataset["active"] = String(index === 0);
        if (index > 1) img.loading = "lazy";
        img.addEventListener("error", () => dropFailedCover(img), { once: true });
        img.addEventListener("load", () => {
          if (img.naturalWidth > 0 && img.naturalHeight > 0) return;
          dropFailedCover(img);
        }, { once: true });
        bindLightboxTrigger(img, () => readImageSource(img));
        stage.append(img);
        images.push(img);
        img.src = source;
      });
      page.dataset["cover"] = kind;
      coverTotal = images.length;
      coverIndex = 0;
      if (images.length > 0) glow.style.backgroundImage = 'url("' + sources[0].replace(/"/g, '\\"') + '")';
      if (images.length > 1) {
        const prev = document.createElement("button");
        prev.type = "button";
        prev.className = "hbu-reader-cover-nav";
        prev.dataset["side"] = "prev";
        prev.setAttribute("aria-label", "上一张封面");
        prev.innerHTML = READER_ICONS.previous;
        prev.addEventListener("click", () => setCover(coverIndex - 1));
        const next = document.createElement("button");
        next.type = "button";
        next.className = "hbu-reader-cover-nav";
        next.dataset["side"] = "next";
        next.setAttribute("aria-label", "下一张封面");
        next.innerHTML = READER_ICONS.next;
        next.addEventListener("click", () => setCover(coverIndex + 1));
        stage.append(prev, next);
      }
      renderCoverPager();
      cover.append(stage, progress);
      page.prepend(cover);
    };
    const createHero = (data) => {
      const page = document.createElement("section");
      page.className = "hbu-reader-page";
      page.dataset["kind"] = "hero";
      const heroes = data.covers.length > 0 ? data.covers : data.heroImage !== "" ? [data.heroImage] : [];
      const kind = data.covers.length > 0 ? "header" : "body";
      if (heroes.length > 0) createHeroCover(page, data, heroes, kind);
      else page.dataset["cover"] = "none";
      const caption = document.createElement("div");
      caption.className = "hbu-reader-caption";
      if (data.tags.length > 0 || data.time !== "") {
        const kicker = document.createElement("div");
        kicker.className = "hbu-reader-kicker";
        for (const tag of data.tags.slice(0, 3)) {
          const chip = document.createElement("span");
          chip.textContent = tag;
          kicker.append(chip);
        }
        if (data.time !== "") {
          const chip = document.createElement("span");
          chip.textContent = data.time + (data.ip !== "" ? " · " + data.ip : "");
          kicker.append(chip);
        }
        caption.append(kicker);
      }
      const title = document.createElement("h1");
      title.className = "hbu-reader-title";
      title.textContent = data.title || "无标题";
      const byline = document.createElement("div");
      byline.className = "hbu-reader-byline";
      const author = document.createElement("b");
      author.textContent = data.author;
      const hint = document.createElement("span");
      hint.textContent = "向下滑动阅读";
      byline.append(author, hint);
      caption.append(title, byline);
      page.append(caption);
      return page;
    };
    const createEndPage = (data) => {
      const page = document.createElement("section");
      page.className = "hbu-reader-page";
      page.dataset["kind"] = "end";
      const card = document.createElement("div");
      card.className = "hbu-reader-end-card";
      const head = document.createElement("div");
      head.className = "hbu-reader-end-head";
      if (data.avatar !== "") {
        const avatar = document.createElement("img");
        avatar.src = data.avatar;
        avatar.alt = "";
        head.append(avatar);
      }
      const name = document.createElement("div");
      name.className = "hbu-reader-end-name";
      const label = document.createElement("b");
      label.textContent = data.author;
      const meta = document.createElement("span");
      meta.textContent = (data.level !== "" ? "Lv." + data.level : "") + (data.time !== "" ? (data.level !== "" ? " · " : "") + data.time : "");
      name.append(label, meta);
      const follow = document.createElement("button");
      follow.type = "button";
      follow.className = "hbu-reader-follow";
      follow.textContent = "关注";
      follow.addEventListener("click", toggleFollowAuthor);
      head.append(name, follow);
      const stats = document.createElement("div");
      stats.className = "hbu-reader-stats";
      for (const item of [
        { value: data.counts.like, label: "点赞" },
        { value: data.counts.favour, label: "收藏" },
        { value: data.counts.comment, label: "评论" }
      ]) {
        const box = document.createElement("div");
        box.dataset["stat"] = item.label === "点赞" ? "like" : item.label === "收藏" ? "favour" : "comment";
        const value = document.createElement("b");
        value.textContent = item.value;
        const text = document.createElement("span");
        text.textContent = item.label;
        box.append(value, text);
        stats.append(box);
      }
      card.append(head, stats);
      if (data.tags.length > 0) {
        const tags = document.createElement("div");
        tags.className = "hbu-reader-tags";
        for (const tag of data.tags) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "hbu-reader-tag";
          button.textContent = tag;
          bindTag(button, tag);
          tags.append(button);
        }
        card.append(tags);
      }
      page.append(card);
      const visitedPostIds = readVisitedPostIds(articleId);
      const visibleRelated = data.related.filter((item) => !visitedPostIds.has(item.id));
      if (visibleRelated.length > 0) {
        const related = document.createElement("div");
        related.className = "hbu-reader-related";
        const heading = document.createElement("h2");
        heading.textContent = "继续阅读";
        related.append(heading);
        for (const item of visibleRelated.slice(0, 4)) {
          const link = document.createElement("a");
          link.href = LINK_HREF_PREFIX + item.id;
          link.textContent = item.title || "帖子 " + item.id;
          related.append(link);
        }
        page.append(related);
      }
      const actions = document.createElement("div");
      actions.className = "hbu-reader-end-actions";
      const homeButton = document.createElement("button");
      homeButton.type = "button";
      homeButton.dataset["home"] = "";
      homeButton.innerHTML = READER_ICONS.home + " 社区首页";
      homeButton.addEventListener("click", () => navigateToPath("/app/bbs/home"));
      const prevButton = document.createElement("button");
      prevButton.type = "button";
      prevButton.dataset["prev"] = "";
      prevButton.innerHTML = READER_ICONS.previous + " 上一篇";
      prevButton.addEventListener("click", () => {
        const prev = navigation.readStatus().prev;
        if (prev !== null) navigateToPath(LINK_HREF_PREFIX + prev.id);
      });
      const nextButton = document.createElement("button");
      nextButton.type = "button";
      nextButton.dataset["next"] = "";
      nextButton.innerHTML = "下一篇 " + READER_ICONS.next;
      nextButton.addEventListener("click", advanceFromReader);
      const topButton = document.createElement("button");
      topButton.type = "button";
      topButton.textContent = "回到封面";
      topButton.addEventListener("click", () => scrollToPage(0));
      actions.append(homeButton, prevButton, topButton, nextButton);
      page.append(actions);
      const status = document.createElement("p");
      status.className = "hbu-reader-end-status";
      status.hidden = true;
      page.append(status);
      return page;
    };
    const readSource = () => {
      let pageRoot;
      let article;
      const cached = sourceCache;
      if (cached !== null && cached.articleId === articleId && cached.pageRoot.isConnected && cached.article.isConnected) {
        pageRoot = cached.pageRoot;
        article = cached.article;
      } else {
        const queriedRoot = document.querySelector("#page-bbs-link");
        const queriedArticle = queriedRoot?.querySelector(READER_SOURCE_ROOT_SELECTOR) || null;
        if (!(queriedRoot instanceof Element) || !(queriedArticle instanceof Element)) {
          sourceCache = null;
          return null;
        }
        pageRoot = queriedRoot;
        article = queriedArticle;
        sourceCache = { articleId, pageRoot, article };
      }
      const body = article.querySelector(READER_SOURCE_BODY_SELECTOR) || null;
      const titleNode = article.querySelector(READER_SOURCE_TITLE_SELECTOR) || null;
      const covers = readHeaderImages(pageRoot);
      const bodyImages = readOrderedImageSources(body || article);
      const isVideoPost = article.classList.contains("hb-bbs__video");
      const videoNodes = isVideoPost ? Array.from(article.querySelectorAll(READER_SOURCE_VIDEO_SELECTOR)) : [];
      const videos = videoNodes.map((node) => ({
        node,
        source: readVideoSource(node),
        poster: readPosterSource(node)
      }));
      const videoMissing = isVideoPost && videos.every((item) => item.source === "");
      const tags = pageRoot.querySelectorAll(".link-tags__tag-item");
      const related = pageRoot.querySelectorAll(".bbs-link__related-recommend a[href*='/app/bbs/link/'], .related-recommend__container a[href*='/app/bbs/link/']");
      const stableTextLength = (node) => {
        if (node instanceof Element && (node.matches(READER_VOTE_SELECTOR) || /(^|\s)(com-|hb-cpt__image|card)/.test(node.className))) return 0;
        if (node.nodeType === Node.TEXT_NODE) return (node.textContent || "").length;
        return Array.from(node.childNodes).reduce((length, child) => length + stableTextLength(child), 0);
      };
      return {
        pageRoot,
        article,
        body,
        titleNode,
        covers,
        bodyImages,
        videos,
        videoMissing,
        isVideoPost,
        signature: [
          articleId,
          isVideoPost ? "video" : "post",
          titleNode?.textContent?.length || 0,
          body?.childNodes.length || 0,
          body === null ? 0 : stableTextLength(body),
          (article.parentElement || article).querySelectorAll(READER_VOTE_SELECTOR).length,
          covers.join(","),
          bodyImages.join(","),
          videos.map((item) => item.source + "~" + item.poster).join(","),
          tags.length,
          related.length,
          readEmbedSignature(pageRoot)
        ].join(":")
      };
    };
    const readHeroImage = (body) => {
      if (!(body instanceof Element)) return "";
      const candidates = [];
      for (const [index, node] of Array.from(body.querySelectorAll("img")).entries()) {
        if (node.closest(READER_MEDIA_EXCLUDE_SELECTOR) !== null) continue;
        const source = readImageSource(node);
        if (source === "") continue;
        const naturalWidth = node.naturalWidth;
        const naturalHeight = node.naturalHeight;
        const rect = node.getBoundingClientRect();
        const declaredWidth = Number(node.getAttribute("width")) || 0;
        const declaredHeight = Number(node.getAttribute("height")) || 0;
        const width = naturalWidth > 0 ? naturalWidth : rect.width > 0 ? rect.width : declaredWidth;
        const height = naturalHeight > 0 ? naturalHeight : rect.height > 0 ? rect.height : declaredHeight;
        if (width > 0 && width < 120) continue;
        candidates.push({ source, area: width * height, loaded: naturalWidth > 0, index });
      }
      if (candidates.length === 0) return "";
      candidates.sort((left, right) => Number(right.loaded) - Number(left.loaded) || right.area - left.area || left.index - right.index);
      const best = candidates[0];
      return best === void 0 ? "" : best.source;
    };
    const readData = (source) => {
      if (source === null) return null;
      const { pageRoot, article, body, titleNode, covers, videos, videoMissing, isVideoPost } = source;
      const authorNode = pageRoot.querySelector(".link-user__username, .page-header__username");
      const authorLink = pageRoot.querySelector(".link-user__user-wrapper, .page-header__user-wrapper");
      const avatarNode = authorLink?.querySelector("img") || pageRoot.querySelector(".page-header__user-wrapper img");
      const tags = Array.from(pageRoot.querySelectorAll(".link-tags__tag-item")).map((node) => (node.textContent || "").trim()).filter((value) => value !== "");
      const time = (pageRoot.querySelector(".link-data__time")?.textContent || "").trim();
      const ip = (pageRoot.querySelector(".link-data__ip")?.textContent || "").trim().replace(/^·/, "");
      const level = (pageRoot.querySelector(".link-user__level-tag")?.className.match(/hb-level-(\d+)/) || [])[1] || "";
      const related = Array.from(pageRoot.querySelectorAll(".bbs-link__related-recommend a[href*='/app/bbs/link/'], .related-recommend__container a[href*='/app/bbs/link/']")).map((anchor) => {
        const match = /link\/(\d+)/.exec(anchor.getAttribute("href") || "");
        const id = match === null ? void 0 : match[1];
        if (id === void 0) return null;
        return { id, title: (anchor.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80) };
      }).filter((item) => item !== null).filter((item, index, list) => list.findIndex((other) => other.id === item.id) === index);
      const title = (titleNode?.textContent || "").trim();
      const meta = readPostMeta(pageRoot, title);
      if (meta === null) return null;
      return {
        article,
        body,
        title,
        author: (authorNode?.textContent || "").trim() || "作者",
        authorId: meta.authorId,
        authorHref: authorLink?.getAttribute("href") || "/app/user/profile/",
        avatar: avatarNode?.getAttribute("src") || "",
        topicIds: meta.topicIds,
        topics: meta.topics,
        meta,
        covers,
        // Keep a body fallback even when header images exist, so a header image that
        // fails to load can hand the hero over to the largest body image.
        heroImage: readHeroImage(body),
        videos,
        videoMissing,
        isVideoPost,
        tags,
        time,
        ip,
        level,
        related,
        counts: readCounts(),
        signature: source.signature
      };
    };
    const refreshReaderSignature = () => {
      const refreshedSource = readSource();
      if (refreshedSource !== null) signature = refreshedSource.signature;
    };
    const openLinkedComments = () => {
      if (/comment/i.test(location.hash)) {
        requestAnimationFrame(() => openComments());
      }
    };
    const settleRatioRestore = (node, ratio) => {
      const apply = () => {
        node.scrollTop = (node.scrollHeight - node.clientHeight) * ratio;
      };
      apply();
      let cancelled = false;
      const stop = () => {
        cancelled = true;
        restoring = false;
      };
      for (const type of ["wheel", "touchstart", "pointerdown", "keydown"]) node.addEventListener(type, stop, { once: true, passive: true });
      const images = Array.from(node.querySelectorAll("img"));
      const settle = Promise.race([
        // decode() is missing in some embedded webviews; a rejected or absent
        // decode must not leave the restore flag stuck and block later restores.
        Promise.allSettled(images.map((image) => typeof image.decode === "function" ? image.decode() : Promise.resolve())),
        new Promise((resolve) => window.setTimeout(resolve, 1200))
      ]);
      settle.then(() => {
        if (cancelled) return;
        apply();
        restoring = false;
        updateProgress();
      });
    };
    const restoreReaderPosition = (ratio, restore) => {
      if (ratio >= 0) {
        requestAnimationFrame(() => {
          const node = host?.querySelector(".hbu-reader-scroll");
          if (node === null || node === void 0) return;
          settleRatioRestore(node, ratio);
        });
        return;
      }
      if (restore <= 0) return;
      requestAnimationFrame(() => {
        const pages = host?.querySelectorAll(".hbu-reader-page");
        pages?.[restore]?.scrollIntoView({ block: "start", behavior: "auto" });
        setActive(restore);
      });
    };
    const render = (data) => {
      if (host === null) return;
      restoreSuspendedEmbeds();
      for (const binding of interactionBindings) binding.dispose();
      interactionBindings.clear();
      readerGeneration += 1;
      observer?.disconnect();
      window.cancelAnimationFrame(scrollRaf);
      scrollRaf = 0;
      flushReaderRatio();
      resetReaderComments();
      clearPendingReader();
      host.textContent = "";
      progressScroll = null;
      progressCurrent = null;
      progressFill = null;
      lastProgressPercent = -1;
      linkStateController?.abort();
      linkStateController = null;
      commentLoadController?.abort();
      commentLoadController = null;
      resetFavourPanel();
      linkState = null;
      linkStatePromise = null;
      cyPublishedCount = 0;
      articleCommentPublishedCount = 0;
      actionBusy = false;
      cyBusy = false;
      articleCommentBusy = false;
      clearArticleComposers();
      cyDialog = null;
      cyTextarea = null;
      cySubmit = null;
      cyStatus = null;
      spacingPanel = null;
      spacingButton = null;
      spacingInput = null;
      historyPanel = null;
      historyButton = null;
      historyList = null;
      historyMeta = null;
      historyRail = null;
      historyThumb = null;
      historyPeek = null;
      historyScrim = null;
      historyPreviewX = 0;
      coverIndex = 0;
      coverTotal = 0;
      activeIndex = 0;
      host.append(createHead(data));
      const scroll = document.createElement("div");
      scroll.className = "hbu-reader-scroll";
      scroll.tabIndex = 0;
      scroll.setAttribute("aria-label", "文章内容");
      bindSwipe(scroll);
      scroll.append(createHero(data));
      const pages = document.createDocumentFragment();
      addVideoPostPages(pages, data);
      if (data.body instanceof Element) buildPages(pages, data.body);
      refreshReaderSignature();
      scroll.append(pages);
      scroll.append(createEndPage(data));
      const rail = createRail(data);
      host.append(scroll, rail);
      syncHistoryTimeline();
      const progress = document.createElement("div");
      progress.className = "hbu-reader-progress";
      const current = document.createElement("span");
      current.dataset["current"] = "";
      current.textContent = "1";
      const bar = document.createElement("span");
      bar.className = "hbu-reader-progress-bar";
      const fill = document.createElement("i");
      bar.append(fill);
      const total = document.createElement("span");
      total.dataset["total"] = "";
      total.textContent = "";
      const hint = document.createElement("span");
      hint.className = "hbu-reader-hint";
      hint.textContent = "滚轮 / ↑↓ 滚动";
      progress.append(current, bar, total, hint);
      const toast = document.createElement("div");
      toast.className = "hbu-reader-toast";
      toast.setAttribute("aria-live", "polite");
      host.append(progress, toast);
      progressScroll = scroll;
      progressCurrent = current;
      progressFill = fill;
      pageCount = host.querySelectorAll(".hbu-reader-page").length;
      observePages(scroll);
      scroll.addEventListener("scroll", () => {
        if (scrollRaf !== 0) return;
        scrollRaf = window.requestAnimationFrame(() => {
          scrollRaf = 0;
          updateProgress();
        });
      }, { passive: true });
      syncActionStates();
      lastActionSyncAt = performance.now();
      void loadLinkState();
      const ratio = readReaderRatio(articleId);
      const restore = ratio < 0 ? Math.min(pageCount - 1, readReaderScroll(articleId)) : 0;
      restoring = ratio >= 0;
      updateProgress();
      if (ratio >= 0) writeReaderRatio(articleId, ratio);
      openLinkedComments();
      restoreReaderPosition(ratio, restore);
      navigation.sync(articleId, { ...data.meta, id: articleId }, data.related);
      syncReaderEndActions();
    };
    const clearPendingTimer = () => {
      if (readerPendingTimer !== 0) {
        window.clearTimeout(readerPendingTimer);
        readerPendingTimer = 0;
      }
    };
    const clearPendingReader = () => {
      clearPendingTimer();
      readerPendingCard?.remove();
      readerPendingCard = null;
      readerPendingArticleId = "";
      readerPendingGeneration = -1;
    };
    const showPending = () => {
      ensureShell();
      if (host === null) return;
      signature = "";
      if (readerPendingCard !== null) {
        if (readerPendingArticleId === articleId && readerPendingGeneration === readerGeneration) return;
        clearPendingReader();
      }
      for (const binding of interactionBindings) binding.dispose();
      interactionBindings.clear();
      host.textContent = "";
      const pending = document.createElement("div");
      pending.className = "hbu-reader-pending";
      const card = document.createElement("div");
      card.className = "hbu-reader-pending-card";
      const message = document.createElement("p");
      message.className = "hbu-reader-pending-text";
      message.textContent = "正在加载文章…";
      const actions = document.createElement("div");
      actions.className = "hbu-reader-pending-actions";
      actions.hidden = true;
      const retry = document.createElement("button");
      retry.type = "button";
      retry.dataset["retry"] = "";
      retry.textContent = "重试";
      const original = document.createElement("button");
      original.type = "button";
      original.dataset["original"] = "";
      original.textContent = "查看原帖";
      actions.append(retry, original);
      card.append(message, actions);
      pending.append(card);
      host.append(pending);
      readerPendingCard = pending;
      readerPendingArticleId = articleId;
      readerPendingGeneration = readerGeneration;
      const capturedArticleId = articleId;
      const capturedGeneration = readerGeneration;
      retry.addEventListener("click", () => {
        if (host === null || !host.isConnected) return;
        if (articleId !== capturedArticleId || readerGeneration !== capturedGeneration) return;
        clearPendingReader();
        sourceCache = null;
        signature = "";
        sync();
      });
      original.addEventListener("click", () => {
        if (host === null || !host.isConnected) return;
        if (articleId !== capturedArticleId || readerGeneration !== capturedGeneration) return;
        clearPendingReader();
        dismissedArticleId = capturedArticleId;
        teardown();
        showToast("已退出沉浸阅读，可在设置中重新开启");
      });
      readerPendingTimer = window.setTimeout(() => {
        readerPendingTimer = 0;
        if (host === null || !host.isConnected) return;
        if (articleId !== capturedArticleId || readerGeneration !== capturedGeneration) return;
        if (!pending.isConnected) return;
        message.textContent = "这篇帖子加载得有点慢，可能是网络中断或站点校验未通过。";
        actions.hidden = false;
      }, READER_PENDING_NOTICE_MS);
    };
    const teardown = () => {
      restoreSuspendedEmbeds();
      for (const binding of interactionBindings) binding.dispose();
      interactionBindings.clear();
      readerGeneration += 1;
      clearPendingReader();
      clearPendingReaderAdvance();
      readerAdvanceLocked = false;
      readerAdvanceLockToken += 1;
      observer?.disconnect();
      observer = null;
      flushReaderRatio();
      restoring = false;
      progressScroll = null;
      progressCurrent = null;
      progressFill = null;
      lastProgressPercent = -1;
      sourceCache = null;
      nativeActionArticle = null;
      nativeActionBox = null;
      nativeFavourButton = null;
      linkStateController?.abort();
      linkStateController = null;
      commentLoadController?.abort();
      commentLoadController = null;
      resetFavourPanel();
      linkState = null;
      linkStatePromise = null;
      cyPublishedCount = 0;
      articleCommentPublishedCount = 0;
      actionBusy = false;
      cyBusy = false;
      cyDialog = null;
      cyTextarea = null;
      cySubmit = null;
      cyStatus = null;
      articleCommentBusy = false;
      clearArticleComposers();
      articleComposerSelectionCleanup?.();
      document.body.classList.remove(READER_CLASS);
      if (host !== null) host.inert = false;
      commentPanel?.remove();
      commentPanel = null;
      commentPanelList = null;
      commentPanelStatus = null;
      commentPanelStatusText = null;
      commentPanelRetry = null;
      commentPanelMeta = null;
      commentPanelMore = null;
      commentPanelClose = null;
      commentPanelRefresh = null;
      commentState = createCommentState();
      spacingPanel = null;
      spacingButton = null;
      spacingInput = null;
      historyPanel = null;
      historyButton = null;
      historyList = null;
      historyRail = null;
      historyThumb = null;
      historyPeek = null;
      historyScrim = null;
      historyPreviewX = 0;
      host?.remove();
      host = null;
      closeLightbox();
      signature = "";
      pageCount = 0;
      activeIndex = 0;
    };
    const ensureShell = () => {
      ensureReaderStyle();
      if (!document.body.classList.contains(READER_CLASS)) document.body.classList.add(READER_CLASS);
      if (host === null) {
        host = document.createElement("div");
        host.id = READER_ID;
        host.setAttribute("role", "region");
        host.setAttribute("aria-label", "沉浸阅读");
        document.body.append(host);
      }
    };
    const sync = () => {
      const match = /^\/app\/bbs\/link\/(\d+)/.exec(location.pathname);
      if (match === null) {
        dismissedArticleId = "";
        if (host !== null || document.body.classList.contains(READER_CLASS)) teardown();
        signature = "";
        return;
      }
      if (!readReaderPreference()) {
        if (host !== null || document.body.classList.contains(READER_CLASS)) teardown();
        signature = "";
        return;
      }
      const nextArticleId = match[1];
      if (dismissedArticleId === nextArticleId) {
        if (host !== null || document.body.classList.contains(READER_CLASS)) teardown();
        signature = "";
        return;
      }
      if (articleId !== nextArticleId) {
        dismissedArticleId = "";
        unlockReaderAdvance();
        flushReaderRatio();
        sourceCache = null;
        nativeActionArticle = null;
        nativeActionBox = null;
        nativeFavourButton = null;
      }
      articleId = nextArticleId;
      const source = readSource();
      if (source === null) {
        showPending();
        return;
      }
      ensureShell();
      if (signature === source.signature) {
        for (const binding of interactionBindings) binding.refresh();
        const now = performance.now();
        if (now - lastActionSyncAt >= 1e3) {
          lastActionSyncAt = now;
          syncActionStates();
        }
        return;
      }
      signature = source.signature;
      const data = readData(source);
      if (data === null) return;
      render(data);
    };
    navigation.subscribe((status) => {
      if (host === null) {
        clearPendingReaderAdvance();
        return;
      }
      syncReaderEndActions();
      if (historyPanel !== null) renderHistoryPanel();
      if (readerPendingAdvanceSourceId === "") return;
      if (status.currentId !== readerPendingAdvanceSourceId || status.revision !== readerPendingAdvanceRevision) {
        clearPendingReaderAdvance();
        return;
      }
      if (status.discovering) return;
      const taken = navigation.takeNext();
      clearPendingReaderAdvance();
      if (taken !== null) {
        openReaderArticle(taken.id);
      }
    });
    document.addEventListener(READER_EVENT, (event) => {
      const detail = event instanceof CustomEvent ? event.detail : void 0;
      if (readerToggle !== null) readerToggle.setAttribute("aria-checked", String(detail === true));
      if (detail !== true) {
        teardown();
        showToast("已退出沉浸阅读，可在设置中重新开启");
        return;
      }
      dismissedArticleId = "";
      signature = "";
      sync();
    });
    document.addEventListener(READER_TIMELINE_EVENT, () => {
      syncHistoryTimeline();
    });
    document.addEventListener(READER_HISTORY_LIMIT_EVENT, (event) => {
      const detail = event instanceof CustomEvent ? event.detail : void 0;
      const limit = typeof detail === "number" && Number.isSafeInteger(detail) && detail >= 0 ? detail : readReaderHistoryLimit();
      applyPostHistoryLimit(limit);
      if (historyPanel !== null) renderHistoryPanel();
      if (host !== null) syncReaderEndActions();
    });
    document.addEventListener("keydown", (event) => {
      if (host === null || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "Escape") {
        if (lightbox !== null) {
          event.preventDefault();
          closeLightbox();
        } else if (cyDialog !== null) {
          event.preventDefault();
          closeCyDialog();
        } else if (spacingPanel !== null && !spacingPanel.hidden) {
          event.preventDefault();
          closeSpacingMenu();
          spacingButton?.focus({ preventScroll: true });
        } else if (isHistoryDrawerOpen()) {
          event.preventDefault();
          closeHistoryDrawer(true);
        } else if (favourPanel !== null && !favourPanel.hidden) {
          event.preventDefault();
          closeFavourMenu(true);
        } else if (isCommentPanelOpen() && articleReplyTarget !== null) {
          event.preventDefault();
          clearArticleReplyTarget(true);
        } else if (isCommentPanelOpen()) {
          event.preventDefault();
          closeComments();
        } else if (isSiteAlertOpen()) {
          return;
        } else {
          event.preventDefault();
          closeCurrentReader();
        }
        return;
      }
      if (lightbox !== null) {
        if (!lightbox.isConnected) {
          closeLightbox();
          return;
        }
        if (event.key === "+" || event.key === "=") {
          event.preventDefault();
          stepLightboxZoom(1);
          return;
        }
        if (event.key === "-" || event.key === "_") {
          event.preventDefault();
          stepLightboxZoom(-1);
          return;
        }
        if (event.key === "0") {
          event.preventDefault();
          resetLightboxZoom();
          return;
        }
        if (event.key === "Tab") {
          event.preventDefault();
          cycleLightboxFocus(event.shiftKey);
          return;
        }
        return;
      }
      if (isSiteAlertOpen() || eventHitsTypingTarget(event)) return;
      if (isCommentPanelOpen() && commentPanel !== null && commentPanel.contains(event.target instanceof Node ? event.target : null)) return;
      if (event.key === "[") {
        event.preventDefault();
        const prev = navigation.readStatus().prev;
        if (prev !== null) navigateToPath(LINK_HREF_PREFIX + prev.id);
        return;
      }
      if (event.key === "]") {
        event.preventDefault();
        advanceFromReader();
        return;
      }
      if (event.target instanceof Element && event.target.closest(".hbu-reader-history-menu") !== null) return;
      if (event.key === "h" || event.key === "H") {
        event.preventDefault();
        navigateToPath("/app/bbs/home");
        return;
      }
      if (event.key === "ArrowRight" && coverInView() && coverTotal > 1) {
        event.preventDefault();
        setCover(coverIndex + 1);
        return;
      }
      if (event.key === "ArrowLeft" && coverInView() && coverTotal > 1) {
        event.preventDefault();
        setCover(coverIndex - 1);
        return;
      }
      if (["ArrowDown", "PageDown", "j", "J", " "].includes(event.key)) {
        event.preventDefault();
        scrollViewport(1);
      } else if (["ArrowUp", "PageUp", "k", "K"].includes(event.key)) {
        event.preventDefault();
        scrollViewport(-1);
      } else if (event.key === "Home") {
        event.preventDefault();
        scrollToPage(0);
      } else if (event.key === "End") {
        event.preventDefault();
        scrollToPage(pageCount - 1);
      } else if (event.key === "c" || event.key === "C") {
        event.preventDefault();
        if (isCommentPanelOpen()) closeComments();
        else openComments();
      } else if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        closeCurrentReader();
      }
    });
    registerPageSync(sync, 200, [PAGE_ROUTE.ARTICLE], "article");
    window.addEventListener("popstate", () => {
      signature = "";
      sync();
    });
    window.addEventListener("pagehide", flushReaderRatio);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushReaderRatio();
    });
    sync();
  }

  // scripts/heybox-up/src/ui/native-comments.ts
  var NATIVE_COMMENT_CONTAINER_SELECTOR = "#page-bbs-link .link-comment";
  var NATIVE_COMMENT_LOAD_THRESHOLD = 240;
  var NATIVE_COMMENT_LOAD_COOLDOWN_MS = 1200;
  var LOAD_MORE_TEXT = /^(?:加载更多|查看更多|点击加载|更多评论)(?:\s*[(（].*[)）])?$/;
  var LOAD_MORE_EXCLUDED_SELECTOR = [
    ".comment-children__load-all",
    ".link-comment__comment-children",
    "textarea",
    "input",
    "[contenteditable]:not([contenteditable='false'])",
    ".link-comment__reply"
  ].join(", ");
  function isNearCommentScrollEnd(metrics, threshold = NATIVE_COMMENT_LOAD_THRESHOLD) {
    if (!Number.isFinite(metrics.scrollHeight) || !Number.isFinite(metrics.scrollTop) || !Number.isFinite(metrics.clientHeight)) {
      return false;
    }
    return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= threshold;
  }
  function shouldTriggerNativeCommentLoad(gate, metrics, now) {
    if (!isNearCommentScrollEnd(metrics)) return false;
    if (gate.lastTriggerAt > 0 && now - gate.lastTriggerAt < NATIVE_COMMENT_LOAD_COOLDOWN_MS) return false;
    return gate.lastTriggerHeight === 0 || metrics.scrollHeight > gate.lastTriggerHeight;
  }
  function isHiddenControl(node) {
    if (node.hasAttribute("hidden")) return true;
    if (node.getAttribute("aria-hidden") === "true") return true;
    if (node instanceof HTMLElement && node.style.display === "none") return true;
    return false;
  }
  function isDisabledControl(node) {
    if (node.hasAttribute("disabled")) return true;
    if (node.getAttribute("aria-disabled") === "true") return true;
    return false;
  }
  function readNativeLoadMoreButton(container) {
    for (const node of Array.from(container.querySelectorAll('button, a, [role="button"]'))) {
      if (node.closest(LOAD_MORE_EXCLUDED_SELECTOR) !== null) continue;
      if (isHiddenControl(node) || isDisabledControl(node)) continue;
      const label = (node.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!LOAD_MORE_TEXT.test(label)) continue;
      return node;
    }
    return null;
  }
  function requestNativeCommentLoad(container) {
    const button = readNativeLoadMoreButton(container);
    if (button !== null) {
      button.click();
      return "button";
    }
    window.dispatchEvent(new Event("scroll"));
    document.dispatchEvent(new Event("scroll"));
    return "scroll";
  }
  function watchNativeComments() {
    if (!document.body) return;
    let bound = null;
    let boundScrollTop = 0;
    let frame = 0;
    const gate = { lastTriggerAt: 0, lastTriggerHeight: 0 };
    const readContainer = () => {
      const node = document.querySelector(NATIVE_COMMENT_CONTAINER_SELECTOR);
      return node instanceof HTMLElement ? node : null;
    };
    const unbind = () => {
      if (bound !== null) bound.removeEventListener("scroll", onScroll);
      bound = null;
      boundScrollTop = 0;
      if (frame !== 0) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };
    const run = () => {
      frame = 0;
      const container = bound;
      if (container === null || !container.isConnected) return;
      if (document.body.classList.contains(READER_CLASS)) return;
      boundScrollTop = container.scrollTop;
      const metrics = {
        scrollTop: container.scrollTop,
        clientHeight: container.clientHeight,
        scrollHeight: container.scrollHeight
      };
      if (!shouldTriggerNativeCommentLoad(gate, metrics, performance.now())) return;
      const action = requestNativeCommentLoad(container);
      if (action === "none") return;
      gate.lastTriggerAt = performance.now();
      gate.lastTriggerHeight = metrics.scrollHeight;
    };
    function onScroll() {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(run);
    }
    const sync = () => {
      const container = readContainer();
      const unavailable = container === null || !location.pathname.startsWith("/app/bbs/link/") || document.body.classList.contains(READER_CLASS) || container.clientHeight <= 0 || container.scrollHeight <= container.clientHeight;
      if (unavailable) {
        unbind();
        return;
      }
      if (container === bound) {
        if (container.scrollTop < boundScrollTop - NATIVE_COMMENT_LOAD_THRESHOLD) {
          gate.lastTriggerAt = 0;
          gate.lastTriggerHeight = 0;
        }
        boundScrollTop = container.scrollTop;
        return;
      }
      unbind();
      bound = container;
      boundScrollTop = container.scrollTop;
      gate.lastTriggerAt = 0;
      gate.lastTriggerHeight = 0;
      container.addEventListener("scroll", onScroll, { passive: true });
    };
    registerPageSync(sync, 400, [PAGE_ROUTE.ARTICLE], "article");
    sync();
  }

  // scripts/heybox-up/src/index.ts
  if (isOfficialHomePath(location.pathname)) {
    releaseTheme();
  } else {
    THEME_MEDIA.addEventListener("change", () => {
      if (currentThemeMode === "system") applyTheme("system", false);
    });
    applyTheme(readThemeMode(), false);
    applyFeedWidth(readFeedWidth());
    applyReaderLineHeight(readReaderLineHeight());
  }
  document.addEventListener(NAV_MOTION_EVENT, (event) => {
    const detail = event instanceof CustomEvent ? event.detail : void 0;
    applyNavMotionPreference(detail === true);
  });
  if (!isOfficialHomePath(location.pathname)) applyNavMotionPreference(readNavMotionPreference());
  function releaseOfficialHome() {
    if (!isOfficialHomePath(location.pathname)) return;
    releaseTheme();
    releaseNav();
    releaseHideCy();
  }
  function boot() {
    if (isOfficialHomePath(location.pathname)) {
      releaseOfficialHome();
    } else {
      applyHideCyPreference(readHideCyPreference());
    }
    registerPageSync(releaseOfficialHome, 0, [PAGE_ROUTE.OFFICIAL_HOME]);
    const navigation = createPostNavigationController();
    watchTheme();
    watchTopNav();
    watchCommentSort();
    watchFavourPage();
    watchCommentRail();
    watchPostPager(navigation);
    watchReader(navigation);
    watchNativeComments();
    watchCommunitySearch();
    watchDesktopShell();
    startPageSyncObserver();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
