// ==UserScript==
// @name         Port
// @namespace    https://github.com/CYoJkoY/Yoko-ScriptCat-Scripts
// @version      0.1.1
// @description  AI 中转站卡片管理、标签交集筛选与自定义 JS 签到。
// @author       Yoko
// @match        https://*/*
// @match        http://*/*
// @run-at       document-end
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_registerMenuCommand
// @grant        GM_openInTab
// @grant        unsafeWindow
// @updateURL    https://cdn.jsdelivr.net/gh/CYoJkoY/Yoko-ScriptCat-Scripts@main/scripts/port.js
// @downloadURL  https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/main/scripts/port.js
// @license      MIT
// ==/UserScript==

(() => {
  "use strict";

  // Feather Icons 4.29.2, MIT; bundled subset, no runtime CDN request.
  // See docs/port-feather-LICENSE.txt for copyright and license.
  const ICONS = {
    "server": "<rect x=\"2\" y=\"2\" width=\"20\" height=\"8\" rx=\"2\" ry=\"2\"></rect><rect x=\"2\" y=\"14\" width=\"20\" height=\"8\" rx=\"2\" ry=\"2\"></rect><line x1=\"6\" y1=\"6\" x2=\"6.01\" y2=\"6\"></line><line x1=\"6\" y1=\"18\" x2=\"6.01\" y2=\"18\"></line>",
    "cpu": "<rect x=\"4\" y=\"4\" width=\"16\" height=\"16\" rx=\"2\" ry=\"2\"></rect><rect x=\"9\" y=\"9\" width=\"6\" height=\"6\"></rect><line x1=\"9\" y1=\"1\" x2=\"9\" y2=\"4\"></line><line x1=\"15\" y1=\"1\" x2=\"15\" y2=\"4\"></line><line x1=\"9\" y1=\"20\" x2=\"9\" y2=\"23\"></line><line x1=\"15\" y1=\"20\" x2=\"15\" y2=\"23\"></line><line x1=\"20\" y1=\"9\" x2=\"23\" y2=\"9\"></line><line x1=\"20\" y1=\"14\" x2=\"23\" y2=\"14\"></line><line x1=\"1\" y1=\"9\" x2=\"4\" y2=\"9\"></line><line x1=\"1\" y1=\"14\" x2=\"4\" y2=\"14\"></line>",
    "cloud": "<path d=\"M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z\"></path>",
    "zap": "<polygon points=\"13 2 3 14 12 14 11 22 21 10 12 10 13 2\"></polygon>",
    "globe": "<circle cx=\"12\" cy=\"12\" r=\"10\"></circle><line x1=\"2\" y1=\"12\" x2=\"22\" y2=\"12\"></line><path d=\"M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z\"></path>",
    "box": "<path d=\"M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z\"></path><polyline points=\"3.27 6.96 12 12.01 20.73 6.96\"></polyline><line x1=\"12\" y1=\"22.08\" x2=\"12\" y2=\"12\"></line>",
    "hexagon": "<path d=\"M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z\"></path>",
    "layers": "<polygon points=\"12 2 2 7 12 12 22 7 12 2\"></polygon><polyline points=\"2 17 12 22 22 17\"></polyline><polyline points=\"2 12 12 17 22 12\"></polyline>",
    "terminal": "<polyline points=\"4 17 10 11 4 5\"></polyline><line x1=\"12\" y1=\"19\" x2=\"20\" y2=\"19\"></line>",
    "database": "<ellipse cx=\"12\" cy=\"5\" rx=\"9\" ry=\"3\"></ellipse><path d=\"M21 12c0 1.66-4 3-9 3s-9-1.34-9-3\"></path><path d=\"M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5\"></path>",
    "shield": "<path d=\"M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z\"></path>",
    "activity": "<polyline points=\"22 12 18 12 15 21 9 3 6 12 2 12\"></polyline>",
    "anchor": "<circle cx=\"12\" cy=\"5\" r=\"3\"></circle><line x1=\"12\" y1=\"22\" x2=\"12\" y2=\"8\"></line><path d=\"M5 12H2a10 10 0 0 0 20 0h-3\"></path>",
    "compass": "<circle cx=\"12\" cy=\"12\" r=\"10\"></circle><polygon points=\"16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76\"></polygon>",
    "code": "<polyline points=\"16 18 22 12 16 6\"></polyline><polyline points=\"8 6 2 12 8 18\"></polyline>",
    "star": "<polygon points=\"12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2\"></polygon>",
    "heart": "<path d=\"M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z\"></path>",
    "coffee": "<path d=\"M18 8h1a4 4 0 0 1 0 8h-1\"></path><path d=\"M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z\"></path><line x1=\"6\" y1=\"1\" x2=\"6\" y2=\"4\"></line><line x1=\"10\" y1=\"1\" x2=\"10\" y2=\"4\"></line><line x1=\"14\" y1=\"1\" x2=\"14\" y2=\"4\"></line>",
    "command": "<path d=\"M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z\"></path>",
    "send": "<line x1=\"22\" y1=\"2\" x2=\"11\" y2=\"13\"></line><polygon points=\"22 2 15 22 11 13 2 9 22 2\"></polygon>",
    "link": "<path d=\"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71\"></path><path d=\"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71\"></path>",
    "gift": "<polyline points=\"20 12 20 22 4 22 4 12\"></polyline><rect x=\"2\" y=\"7\" width=\"20\" height=\"5\"></rect><line x1=\"12\" y1=\"22\" x2=\"12\" y2=\"7\"></line><path d=\"M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z\"></path><path d=\"M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z\"></path>",
    "briefcase": "<rect x=\"2\" y=\"7\" width=\"20\" height=\"14\" rx=\"2\" ry=\"2\"></rect><path d=\"M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16\"></path>",
    "aperture": "<circle cx=\"12\" cy=\"12\" r=\"10\"></circle><line x1=\"14.31\" y1=\"8\" x2=\"20.05\" y2=\"17.94\"></line><line x1=\"9.69\" y1=\"8\" x2=\"21.17\" y2=\"8\"></line><line x1=\"7.38\" y1=\"12\" x2=\"13.12\" y2=\"2.06\"></line><line x1=\"9.69\" y1=\"16\" x2=\"3.95\" y2=\"6.06\"></line><line x1=\"14.31\" y1=\"16\" x2=\"2.83\" y2=\"16\"></line><line x1=\"16.62\" y1=\"12\" x2=\"10.88\" y2=\"21.94\"></line>"
};
  const CARD_PREFIX = "port:v1:card:";
  const JOB_PREFIX = "port:v1:job:";
  const RESULT_PREFIX = "port:v1:result:";
  const TASK_PARAM = "__port_task";
  const MAX_IMAGE = 350000;
  const JOB_TTL = 5 * 60 * 1000;
  const RUN_TIMEOUT = 30000;
  const JOB_EXPIRED = "已取消：任务已过期（5 分钟内有效）";

  // 用户脚本可在普通 HTTP 页面运行，此时 crypto.randomUUID 因非安全上下文而缺失；
  // getRandomValues 在非安全上下文仍可用，逐级回退保证任意页面都能生成唯一本地键。
  function newId() {
    const source = typeof crypto === "undefined" ? null : crypto;
    if (source !== null && typeof source.randomUUID === "function") return source.randomUUID();
    if (source !== null && typeof source.getRandomValues === "function") {
      const bytes = source.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
      return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
    }
    return `t${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }

  function record(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function webUrl(value) {
    if (typeof value !== "string") throw new Error("网址必须是文本");
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error("请填写完整的 http(s) 网址");
    }
    if (!["https:", "http:"].includes(url.protocol) || url.username !== "" || url.password !== "") {
      throw new Error("请填写不含账号密码的完整 http(s) 网址");
    }
    if (url.searchParams.has(TASK_PARAM)) throw new Error("网址包含 Port 保留参数");
    return url.href;
  }

  function tagsFrom(value) {
    const values = Array.isArray(value) ? value : String(value).split(/[,，\n]/);
    if (values.some((tag) => typeof tag !== "string")) throw new Error("标签必须是文本");
    const tags = [...new Set(values.map((tag) => tag.trim()).filter((tag) => tag !== ""))];
    if (tags.length > 30 || tags.some((tag) => tag.length > 40)) throw new Error("每张卡片最多 30 个标签，每个最多 40 字");
    return tags;
  }

  function normalizeCard(value, imported = false) {
    if (!record(value)) throw new Error("卡片格式错误");
    const name = typeof value.name === "string" ? value.name.trim() : "";
    if (name.length === 0 || name.length > 80) throw new Error("名称需为 1–80 字");
    const url = webUrl(value.url);
    const checkinUrl = webUrl(value.checkinUrl === "" || value.checkinUrl === undefined ? url : value.checkinUrl);
    if (new URL(checkinUrl).origin !== new URL(url).origin) throw new Error("签到网址必须与站点网址同源");
    const script = typeof value.script === "string" ? value.script : "";
    if (script.length > 50000) throw new Error("签到脚本最多 50000 字");
    const notes = typeof value.notes === "string" ? value.notes : "";
    if (notes.length > 2000) throw new Error("备注最多 2000 字");
    const icon = typeof value.icon === "string" ? value.icon : "server";
    if (!Object.hasOwn(ICONS, icon) && !(icon.length <= MAX_IMAGE && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(icon))) {
      throw new Error("请选择内置图标或上传 PNG / JPEG / WebP / GIF 图片");
    }
    return { name, url, checkinUrl, tags: tagsFrom(value.tags ?? []), icon, notes, script, enabled: imported ? false : value.enabled === true };
  }

  function listCards() {
    const cards = [];
    const brokenKeys = [];
    for (const key of GM_listValues().filter((entry) => entry.startsWith(CARD_PREFIX))) {
      try {
        cards.push({ ...normalizeCard(GM_getValue(key)), id: key.slice(CARD_PREFIX.length) });
      } catch (error) {
        console.error("[Port] 无法读取卡片", key, error);
        brokenKeys.push(key);
      }
    }
    if (brokenKeys.length > 0) {
      // 保守策略：宁可中断列表，也不静默丢弃用户数据；同时给出具体存储键便于手动修复。
      throw new Error(`存在 ${brokenKeys.length} 张损坏的卡片数据：${brokenKeys.slice(0, 3).join("、")}${brokenKeys.length > 3 ? " 等" : ""}；请在脚本管理器的存储中检查这些键`);
    }
    return cards.sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  }

  function matches(card, selected, query) {
    return selected.every((tag) => card.tags.includes(tag)) &&
      `${card.name} ${card.url} ${card.notes} ${card.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase().trim());
  }

  function errorText(error) {
    return error instanceof Error ? error.message : String(error);
  }

  function node(tag, attrs = {}, children = []) {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key.startsWith("on")) element.addEventListener(key.slice(2), value);
      else if (key === "class") element.className = value;
      else element.setAttribute(key, String(value));
    }
    for (const child of children) element.append(child);
    return element;
  }

  function iconNode(key) {
    const image = node("img", { alt: "", width: 28, height: 28 });
    image.src = key.startsWith("data:") ? key : `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#6ee7b7" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[key]}</svg>`)}`;
    return image;
  }

  function button(text, action, className = "") {
    return node("button", { type: "button", class: className, onclick: action }, [text]);
  }

  function saveResult(id, text) {
    GM_setValue(RESULT_PREFIX + id, { text: text.slice(0, 300), at: Date.now() });
  }

  // 过期任务可能晚于一次新的成功签到才被清扫，此时保留终态结果，避免覆盖成「已取消」。
  function saveExpiredIfPending(id) {
    const result = GM_getValue(RESULT_PREFIX + id, null);
    const text = record(result) && typeof result.text === "string" ? result.text : "";
    const pending = text === "" || text.startsWith("等待目标页执行") || text.startsWith("正在执行");
    if (pending) saveResult(id, JOB_EXPIRED);
  }

  function queueCheckin(card) {
    if (card.enabled !== true || card.script.trim() === "") throw new Error("请先编辑卡片，填写并启用签到脚本");
    // 先构造目标地址，非法网址不会留下无人消费的任务键。
    const target = new URL(card.checkinUrl);
    const token = newId();
    // 每个任务独立键，跨页面写入不会覆盖其他站点的任务。
    GM_setValue(JOB_PREFIX + token, { id: card.id, url: card.checkinUrl, createdAt: Date.now() });
    target.searchParams.set(TASK_PARAM, token);
    // 先写入等待状态，避免目标页抢先写回结果后被这里覆盖。
    saveResult(card.id, "等待目标页执行（5 分钟内有效）");
    try {
      GM_openInTab(target.href, { active: true, setParent: true });
    } catch (error) {
      GM_deleteValue(JOB_PREFIX + token);
      // 打开失败时写回失败结果，不让卡片停在旧的「等待执行」提示。
      saveResult(card.id, `打开签到页失败：${errorText(error)}`);
      throw error;
    }
  }

  // 仅清理本脚本令牌；未知参数可能属于站点自身，保持地址栏原样。
  function clearTaskParam(url) {
    const cleaned = new URL(url.href);
    cleaned.searchParams.delete(TASK_PARAM);
    try {
      history.replaceState(history.state, "", cleaned.href);
    } catch (error) {
      // 地址栏清理失败不应丢失任务结果；任务已消费，刷新后不会重复执行。
      console.error("[Port] 无法从地址栏清理任务参数", error);
    }
  }

  async function executeTask() {
    const current = new URL(location.href);
    const token = current.searchParams.get(TASK_PARAM);
    if (token === null) return;
    const job = GM_getValue(JOB_PREFIX + token, null);
    // 未知令牌不做任何清理，避免误删站点自身的同名参数。
    if (!record(job) || typeof job.url !== "string" || typeof job.id !== "string" || typeof job.createdAt !== "number") return;
    let target;
    try {
      target = new URL(job.url);
    } catch {
      GM_deleteValue(JOB_PREFIX + token);
      clearTaskParam(current);
      saveResult(job.id, "已取消：任务网址无效");
      return;
    }
    // 允许登录跳转到同源页面，但不会在另一站点消费任务或运行脚本。
    if (target.origin !== current.origin) return;
    GM_deleteValue(JOB_PREFIX + token);
    clearTaskParam(current);
    const elapsed = Date.now() - job.createdAt;
    if (elapsed > JOB_TTL || elapsed < 0) {
      saveExpiredIfPending(job.id);
      return;
    }
    const value = GM_getValue(CARD_PREFIX + job.id, null);
    if (value === null) {
      saveResult(job.id, "已取消：卡片已删除");
      return;
    }
    let card;
    try {
      card = normalizeCard(value);
    } catch (error) {
      // 卡片数据损坏时写回可见结果，避免只在外层弹 alert 而丢失任务反馈。
      saveResult(job.id, `执行失败：${errorText(error)}`);
      return;
    }
    if (card.enabled !== true || card.checkinUrl !== job.url) {
      saveResult(job.id, "已取消：卡片配置已变更或脚本已禁用");
      return;
    }
    const controller = new AbortController();
    let timeoutId;
    saveResult(job.id, "正在执行…");
    try {
      // 用户代码在用户脚本沙箱执行，显式传入站点 window/document/fetch。
      // 不向页面注入 script 标签，避免站点 CSP 的 inline-script 限制。
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      const run = new AsyncFunction("window", "document", "fetch", "signal", "waitFor", card.script);
      const pageFetch = (input, options = {}) => unsafeWindow.fetch(input, { ...options, signal: controller.signal });
      const waitFor = async (selector, ms = 10000) => {
        if (typeof selector !== "string") throw new Error("waitFor 需要 CSS 选择器文本");
        const requested = Number(ms);
        // 显式拒绝非有限数值：Math.max/min 遇 NaN 会让等待立即结束，掩盖脚本错误。
        if (!Number.isFinite(requested)) throw new Error("waitFor 的等待毫秒数必须是有限数值");
        const deadline = Date.now() + Math.min(20000, Math.max(0, requested));
        do {
          if (controller.signal.aborted) throw new Error("执行已超时");
          const found = document.querySelector(selector);
          if (found !== null) return found;
          await new Promise((resolve) => setTimeout(resolve, 150));
        } while (Date.now() < deadline);
        throw new Error(`未找到元素：${selector}`);
      };
      const timeout = new Promise((resolve, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          reject(new Error("30 秒超时，结果未知；请到站点核对。自建定时器需脚本自行清理"));
        }, RUN_TIMEOUT);
      });
      const result = await Promise.race([run(unsafeWindow, unsafeWindow.document, pageFetch, controller.signal, waitFor), timeout]);
      saveResult(job.id, result === undefined ? "脚本已执行完毕；签到是否成功请到站点核对" : `返回：${String(result)}`);
    } catch (error) {
      saveResult(job.id, `执行失败：${errorText(error)}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const CSS = `
    :host { all:initial; color-scheme:dark; font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif; color:#e5e9ed; }
    * { box-sizing:border-box; } button,input,textarea,select { font:inherit; }
    button,a,input,textarea,select { outline-offset:3px; } :focus-visible { outline:2px solid #6ee7b7; }
    button { cursor:pointer; border:1px solid #37424b; background:#222d35; color:#e5e9ed; padding:8px 12px; border-radius:7px; }
    button:hover { background:#304139; border-color:#6ee7b7; } button[aria-pressed="true"],.primary { background:#6ee7b7; color:#0d2019; border-color:#6ee7b7; }
    button:disabled { opacity:.5; cursor:default; } a { color:#9ef0cd; text-decoration:none; }
    dialog { padding:0; border:1px solid #37424b; border-radius:14px; background:#111a20; color:inherit; width:min(1160px,96vw); height:min(800px,92dvh); max-width:96vw; max-height:92dvh; margin:auto; }
    dialog::backdrop { background:#030a10b8; }
    .shell { display:flex; flex-direction:column; height:100%; }
    header { display:flex; align-items:center; gap:12px; padding:20px 24px; border-bottom:1px solid #29353d; flex-wrap:wrap; }
    h1 { font-size:25px; letter-spacing:-1px; margin:0; } .subtitle { color:#94a5b2; } .spacer { flex:1; }
    .body { display:flex; flex:1; min-height:0; } aside { width:200px; flex-shrink:0; padding:20px; border-right:1px solid #29353d; overflow:auto; }
    .label { color:#9eafbb; font-size:12px; letter-spacing:1px; margin:0 0 12px; } .tags { display:flex; gap:7px; flex-wrap:wrap; }
    aside .tags { flex-direction:column; align-items:stretch; } aside button { text-align:left; overflow-wrap:anywhere; }
    main { flex:1; min-width:0; padding:22px; overflow:auto; } .toolbar { display:flex; gap:8px; margin-bottom:18px; flex-wrap:wrap; }
    input,textarea,select { background:#0d151b; color:#e5e9ed; border:1px solid #3a4953; border-radius:7px; padding:9px 11px; min-width:0; width:100%; }
    .toolbar input { flex:1; min-width:150px; } .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(245px,100%),1fr)); gap:14px; }
    article { border:1px solid #34414b; background:#19242c; padding:18px; border-radius:10px; min-width:0; display:flex; flex-direction:column; gap:12px; }
    .card-head { display:flex; gap:12px; align-items:center; } .card-head img { object-fit:contain; flex-shrink:0; } h2 { font-size:16px; margin:0; overflow-wrap:anywhere; }
    .address,.notes,.status { font-size:12px; color:#9eafbb; overflow-wrap:anywhere; } .notes { white-space:pre-wrap; } .status { min-height:36px; margin-top:auto; }
    .tag { font-size:12px; padding:3px 8px; border-radius:4px; background:#25363a; color:#a6d8c2; overflow-wrap:anywhere; } .actions { display:flex; gap:7px; flex-wrap:wrap; }
    .empty { padding:50px 12px; text-align:center; color:#9eafbb; grid-column:1/-1; }
    footer { padding:10px 24px; border-top:1px solid #29353d; color:#a3b4c0; font-size:12px; }
    #editor { width:min(650px,94vw); height:auto; overflow:auto; padding:24px; } form { display:grid; gap:14px; } label { display:grid; gap:5px; }
    .row { display:flex; gap:12px; align-items:center; flex-wrap:wrap; } .row>label { flex:1; min-width:180px; }
    textarea { resize:vertical; } #code { font:12px/1.6 ui-monospace,Consolas,monospace; tab-size:2; }
    .hint { color:#9eafbb; font-size:12px; margin:0; } .check { display:flex; align-items:center; gap:8px; } .check input { width:auto; }
    .error { color:#ffb4ab; overflow-wrap:anywhere; } .danger { color:#ffb4ab; }
    @media(max-width:650px) { header { padding:14px; } .subtitle { display:none; } .body { flex-direction:column; } aside { width:100%; max-height:145px; border-right:0; border-bottom:1px solid #29353d; padding:12px; } aside .tags { flex-direction:row; } main { padding:14px; } .grid { grid-template-columns:1fr; } }
  `;

  function mountManager() {
    const host = node("div", { id: "port-manager" });
    // Shadow DOM isolates both host-page styles and Port styles. Native dialog supplies focus trapping.
    const shadow = host.attachShadow({ mode: "closed" });
    const style = node("style", {}, [CSS]);
    const dialog = node("dialog", { "aria-labelledby": "port-title" });
    const editor = node("dialog", { id: "editor", "aria-labelledby": "editor-title" });
    shadow.append(style, dialog, editor);
    document.documentElement.append(host);
    let selected = [];
    let query = "";
    let returnFocus = null;
    const status = node("footer", { role: "status", "aria-live": "polite" }, ["本地存储 · 多选标签取交集 · 签到由你触发"]);
    const tagList = node("div", { class: "tags", "aria-label": "按标签筛选" });
    const grid = node("div", { class: "grid" });
    const search = node("input", { type: "search", placeholder: "搜索名称、网址、备注或标签…", "aria-label": "搜索中转站", oninput: () => { query = search.value; refreshCards(); } });
    const importFile = node("input", { type: "file", accept: ".json,application/json", hidden: "" });
    const safeAction = (action) => {
      try { action(); } catch (error) { status.textContent = errorText(error); }
    };

    function renderResults() {
      for (const element of grid.querySelectorAll("[data-result]")) {
        const result = GM_getValue(RESULT_PREFIX + element.dataset.result, null);
        element.textContent = record(result) && typeof result.text === "string" && typeof result.at === "number"
          ? `${result.text} · ${new Date(result.at).toLocaleString()}` : "尚未执行签到";
      }
    }

    function renderCards(cards) {
      safeAction(() => {
        const visible = cards.filter((card) => matches(card, selected, query));
        grid.replaceChildren();
        for (const card of visible) {
          const article = node("article", {}, [
            node("div", { class: "card-head" }, [iconNode(card.icon), node("div", {}, [node("h2", {}, [card.name]), node("div", { class: "address" }, [new URL(card.url).host])])]),
            node("div", { class: "tags" }, card.tags.map((tag) => node("span", { class: "tag" }, [tag]))),
            node("div", { class: "notes" }, [card.notes]),
            node("div", { class: "status", "data-result": card.id }),
            node("div", { class: "actions" }, [
              node("a", { href: card.url, target: "_blank", rel: "noopener noreferrer" }, ["访问 ↗"]),
              button("签到", () => safeAction(() => { queueCheckin(card); renderResults(); })),
              button("编辑", (event) => openEditor(card, event.currentTarget)),
            ]),
          ]);
          grid.append(article);
        }
        if (visible.length === 0) grid.append(node("div", { class: "empty" }, [cards.length === 0 ? "你的中转站，从第一张卡片开始。点击「新增中转站」。" : "没有同时匹配这些标签和搜索词的站点。"]));
        status.textContent = `显示 ${visible.length} / ${cards.length} 个站点${selected.length > 0 ? ` · 同时包含：${selected.join(" + ")}` : " · 全部标签"}`;
        renderResults();
      });
    }

    function renderTags(cards) {
      const tags = [...new Set(cards.flatMap((card) => card.tags))].sort((left, right) => left.localeCompare(right, "zh-CN"));
      selected = selected.filter((tag) => tags.includes(tag));
      const allTags = button("全部站点", () => { selected = []; refresh(); });
      allTags.setAttribute("aria-pressed", String(selected.length === 0));
      tagList.replaceChildren(allTags);
      for (const tag of tags) {
        const control = button(tag, () => { selected = selected.includes(tag) ? selected.filter((item) => item !== tag) : [...selected, tag]; refresh(); });
        control.setAttribute("aria-pressed", String(selected.includes(tag)));
        tagList.append(control);
      }
    }

    // 刷新只读取一次卡片，标签与卡片列表使用同一份快照，避免两次读取结果不一致。
    function refresh() { safeAction(() => { const cards = listCards(); renderTags(cards); renderCards(cards); }); }

    function refreshCards() { safeAction(() => renderCards(listCards())); }

    async function readImage(file) {
      if (file === undefined) return null;
      if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type) || file.size > 250000) throw new Error("请上传 250KB 以内的 PNG / JPEG / WebP / GIF 图片");
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("图片读取失败"));
        reader.readAsDataURL(file);
      });
    }

    function openEditor(card, trigger) {
      returnFocus = trigger;
      const existing = card !== null;
      const original = card ?? { name: "", url: "", checkinUrl: "", tags: [], notes: "", script: "", enabled: false, icon: "server" };
      const field = (label, input) => node("label", {}, [label, input]);
      const name = node("input", { required: "", maxlength: 80, value: original.name });
      const url = node("input", { type: "url", required: "", placeholder: "https://relay.example", value: original.url });
      const checkinUrl = node("input", { type: "url", placeholder: "留空则使用站点网址", value: original.checkinUrl });
      const tags = node("input", { placeholder: "常用, Claude, 按量付费", value: original.tags.join(", ") });
      const notes = node("textarea", { rows: 2, maxlength: 2000 }, [original.notes]);
      const code = node("textarea", { id: "code", rows: 8, spellcheck: "false", maxlength: 50000, placeholder: `const btn = await waitFor("button.checkin");
btn.click();
return "已点击签到，请核对站点提示";` }, [original.script]);
      const enabled = node("input", { type: "checkbox" });
      enabled.checked = original.enabled;
      const icon = node("select", { "aria-label": "内置图标" });
      if (original.icon.startsWith("data:")) icon.append(node("option", { value: "uploaded" }, ["保留已上传图片"]));
      for (const key of Object.keys(ICONS)) icon.append(node("option", { value: key }, [key]));
      icon.value = original.icon.startsWith("data:") ? "uploaded" : original.icon;
      const upload = node("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif" });
      const preview = node("span", {}, [iconNode(original.icon)]);
      icon.addEventListener("change", () => { upload.value = ""; preview.replaceChildren(iconNode(icon.value === "uploaded" ? original.icon : icon.value)); });
      const error = node("p", { class: "error", role: "alert" });
      upload.addEventListener("change", () => {
        readImage(upload.files[0]).then((data) => { if (data !== null) preview.replaceChildren(iconNode(data)); }).catch((failure) => { error.textContent = errorText(failure); });
      });
      const save = node("button", { type: "submit", class: "primary" }, ["保存卡片"]);
      const form = node("form", {}, [
        node("h2", { id: "editor-title" }, [existing ? "编辑中转站" : "新增中转站"]),
        field("名称", name), field("站点网址", url), field("标签（逗号分隔）", tags),
        node("div", { class: "row" }, [field("内置 Feather 图标", icon), preview]),
        field("或上传图片（最大 250KB）", upload), field("备注", notes),
        field("签到页面（与站点同源）", checkinUrl), field("签到 JavaScript", code),
        node("p", { class: "hint" }, ["支持 await、window、document、fetch、signal、waitFor(selector)。脚本拥有当前站点登录态；只运行你信任的代码。返回文本记录结果。"]),
        node("label", { class: "check" }, [enabled, "启用此站点签到脚本（仅点击签到时执行）"]),
        error, node("div", { class: "actions" }, [save, button("取消", () => editor.close())]),
      ]);
      if (existing) form.append(button("删除此卡片", () => {
        if (!confirm(`删除「${card.name}」？`)) return;
        try { GM_deleteValue(CARD_PREFIX + card.id); GM_deleteValue(RESULT_PREFIX + card.id); editor.close(); refresh(); }
        catch (failure) { error.textContent = errorText(failure); }
      }, "danger"));
      form.addEventListener("submit", async (event) => {
        event.preventDefault(); save.disabled = true; error.textContent = "";
        try {
          const uploaded = await readImage(upload.files[0]);
          const value = normalizeCard({ name: name.value, url: url.value, checkinUrl: checkinUrl.value, tags: tags.value, notes: notes.value, script: code.value, enabled: enabled.checked, icon: uploaded ?? (icon.value === "uploaded" ? original.icon : icon.value) });
          GM_setValue(CARD_PREFIX + (existing ? card.id : newId()), value);
          editor.close(); refresh();
        } catch (failure) { error.textContent = errorText(failure); }
        finally { save.disabled = false; }
      });
      editor.replaceChildren(form); editor.showModal(); name.focus();
    }

    function exportCards() {
      const cards = listCards();
      const data = JSON.stringify({ format: "port", version: 1, cards }, null, 2);
      const blobUrl = URL.createObjectURL(new Blob([data], { type: "application/json" }));
      const link = node("a", { href: blobUrl, download: `port-${new Date().toISOString().slice(0, 10)}.json` });
      shadow.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    }

    importFile.addEventListener("change", async () => {
      try {
        const file = importFile.files[0];
        if (file === undefined) return;
        if (file.size > 10000000) throw new Error("导入文件不能超过 10MB");
        const data = JSON.parse(await file.text());
        if (!record(data) || data.format !== "port" || data.version !== 1 || !Array.isArray(data.cards) || data.cards.length > 500) throw new Error("需要 Port v1 导出文件，单次最多 500 张卡片");
        const cards = data.cards.map((card) => normalizeCard(card, true));
        if (!confirm(`追加导入 ${cards.length} 张卡片？所有导入的签到脚本默认禁用，不覆盖已有卡片。`)) return;
        const written = [];
        try {
          for (const card of cards) {
            const key = CARD_PREFIX + newId();
            GM_setValue(key, card); written.push(key);
          }
        } catch (failure) {
          // 回滚失败不能吞掉原始导入错误，逐项记录后继续抛出。
          for (const key of written) {
            try { GM_deleteValue(key); } catch (rollbackError) { console.error("[Port] 回滚导入失败", key, rollbackError); }
          }
          throw failure;
        }
        refresh(); status.textContent = `已导入 ${cards.length} 张卡片；签到脚本均已禁用，请逐项审阅后启用`;
      } catch (error) { status.textContent = `导入失败：${errorText(error)}`; }
      finally { importFile.value = ""; }
    });

    editor.addEventListener("close", () => { if (returnFocus !== null && returnFocus.isConnected) returnFocus.focus(); });
    dialog.append(node("div", { class: "shell" }, [
      node("header", {}, [node("h1", { id: "port-title" }, ["Port /"]), node("span", { class: "subtitle" }, ["你的 AI 中转站工作台"]), node("span", { class: "spacer" }), button("导入", () => importFile.click()), button("导出", () => safeAction(exportCards)), button("关闭", () => dialog.close())]),
      node("div", { class: "body" }, [node("aside", {}, [node("p", { class: "label" }, ["标签 / AND"]), tagList]), node("main", {}, [node("div", { class: "toolbar" }, [search, button("刷新", refresh), button("+ 新增中转站", (event) => openEditor(null, event.currentTarget), "primary")]), grid])]),
      status, importFile,
    ]));
    let pollId = null;
    dialog.addEventListener("close", () => { clearInterval(pollId); pollId = null; });
    return () => {
      if (dialog.open) return;
      refresh(); dialog.showModal(); search.focus();
      pollId = setInterval(() => safeAction(renderResults), 1500);
    };
  }

  // No floating UI or page scans on unrelated websites; open from the userscript menu.
  let openManager = null;
  GM_registerMenuCommand("Port · 打开中转站管理", () => {
    try {
      if (openManager === null) openManager = mountManager();
      openManager();
    } catch (error) { console.error("[Port] 打开失败", error); alert(`Port：${errorText(error)}`); }
  });
  // 先处理当前地址栏携带的任务，让过期任务也能清理参数并写回结果，再清扫其余过期任务。
  executeTask().catch((error) => { console.error("[Port] 任务启动失败", error); alert(`Port 签到失败：${errorText(error)}`); });
  for (const key of GM_listValues().filter((entry) => entry.startsWith(JOB_PREFIX))) {
    const job = GM_getValue(key, null);
    if (!record(job) || typeof job.createdAt !== "number") { GM_deleteValue(key); continue; }
    if (Date.now() - job.createdAt <= JOB_TTL) continue;
    GM_deleteValue(key);
    // 写回取消结果，避免卡片长期停留在「等待目标页执行」。
    if (typeof job.id === "string") saveExpiredIfPending(job.id);
  }
})();
