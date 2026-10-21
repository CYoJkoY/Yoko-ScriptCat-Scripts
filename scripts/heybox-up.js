// ==UserScript==
// @name         HeyBox Up
// @namespace    https://cyojkoy.github.io/Payment/
// @version      0.1.0
// @description  补全小黑盒网页收藏：网页收藏列表不显示“插眼”(CY)，本脚本单独拉取 CY 列表并在浮层中展示，按帖子去重，支持搜索与本地缓存。
// @author       Yoko
// @updateURL    https://cdn.jsdelivr.net/gh/CYoJkoY/Yoko-ScriptCat-Scripts@main/scripts/heybox-up.js
// @downloadURL  https://ghfast.top/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/main/scripts/heybox-up.js
// @match        https://www.xiaoheihe.cn/*
// @match        https://xiaoheihe.cn/*
// @run-at       document-start
// @grant        none
// @noframes
// @license      MIT
// ==/UserScript==

(function () {
  "use strict";

  const CY_API_PATH = "/bbs/app/profile/bbs/comment/list";
  const CY_PAGE_SIZE = 20;
  const CY_MAX_ITEMS = 200;
  const CACHE_TTL_MS = 10 * 60 * 1000;
  const CACHE_KEY_PREFIX = "heybox-up.cy.v1:";
  const ENTRY_ID = "heybox-up-entry";
  const LINK_HREF_PREFIX = "/app/bbs/link/";

  // ==sign-core:start==
  const SIG_ALPHABET = "AB45STUVWZEFGJ6CH01D237IXYPQRKLMN89";
  const MD5_SHIFTS = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const MD5_TABLE = Array.from({ length: 64 }, (_, index) =>
    Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0
  );

  function toUtf8Bytes(text) {
    const bytes = [];
    for (const char of text) {
      const point = char.codePointAt(0);
      if (point < 0x80) {
        bytes.push(point);
      } else if (point < 0x800) {
        bytes.push(0xc0 | (point >> 6), 0x80 | (point & 0x3f));
      } else if (point < 0x10000) {
        bytes.push(0xe0 | (point >> 12), 0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f));
      } else {
        bytes.push(
          0xf0 | (point >> 18),
          0x80 | ((point >> 12) & 0x3f),
          0x80 | ((point >> 6) & 0x3f),
          0x80 | (point & 0x3f)
        );
      }
    }
    return bytes;
  }

  function rotateLeft(value, shift) {
    return ((value << shift) | (value >>> (32 - shift))) >>> 0;
  }

  function md5Hex(text) {
    const bytes = toUtf8Bytes(text);
    const bitLength = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    const high = Math.floor(bitLength / 0x100000000) >>> 0;
    const low = bitLength >>> 0;
    for (const word of [low, high]) {
      bytes.push(word & 0xff, (word >>> 8) & 0xff, (word >>> 16) & 0xff, (word >>> 24) & 0xff);
    }

    let stateA = 0x67452301;
    let stateB = 0xefcdab89;
    let stateC = 0x98badcfe;
    let stateD = 0x10325476;

    for (let offset = 0; offset < bytes.length; offset += 64) {
      const words = [];
      for (let index = 0; index < 16; index += 1) {
        const base = offset + index * 4;
        words.push(
          (bytes[base] | (bytes[base + 1] << 8) | (bytes[base + 2] << 16) | (bytes[base + 3] << 24)) >>> 0
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
          mix = (b & c) | (~b & d);
          slot = index;
        } else if (index < 32) {
          mix = (d & b) | (~d & c);
          slot = (5 * index + 1) % 16;
        } else if (index < 48) {
          mix = b ^ c ^ d;
          slot = (3 * index + 5) % 16;
        } else {
          mix = c ^ (b | ~d);
          slot = (7 * index) % 16;
        }
        const sum = (a + mix + MD5_TABLE[index] + words[slot]) >>> 0;
        a = d;
        d = c;
        c = b;
        b = (b + rotateLeft(sum, MD5_SHIFTS[index])) >>> 0;
      }

      stateA = (stateA + a) >>> 0;
      stateB = (stateB + b) >>> 0;
      stateC = (stateC + c) >>> 0;
      stateD = (stateD + d) >>> 0;
    }

    let hex = "";
    for (const word of [stateA, stateB, stateC, stateD]) {
      for (let index = 0; index < 4; index += 1) {
        hex += ((word >>> (index * 8)) & 0xff).toString(16).padStart(2, "0");
      }
    }
    return hex;
  }

  // endIndex < 0 时取字母表末尾若干位，其余情况用整表。
  function mapByAlphabet(value, endIndex) {
    const source = endIndex < 0 ? SIG_ALPHABET.slice(0, endIndex) : SIG_ALPHABET;
    let mapped = "";
    for (let index = 0; index < value.length; index += 1) {
      mapped += source[value.charCodeAt(index) % source.length];
    }
    return mapped;
  }

  function interleave(parts) {
    const longest = Math.max(...parts.map((part) => part.length));
    let merged = "";
    for (let index = 0; index < longest; index += 1) {
      for (const part of parts) {
        if (index < part.length) merged += part[index];
      }
    }
    return merged;
  }

  function xtime(value) {
    // 不能对左移结果截断：服务端算法保留了高位，截断会算出不同校验位。
    return value & 0x80 ? ((value << 1) ^ 0x1b) & 0xff : value << 1;
  }

  // 就地改写前 4 字节并返回整个数组：服务端求和时把末尾 2 字节也算进去。
  function mixColumns(values) {
    const quartic = (value) => xtime(value) ^ value;
    const r = (value) => quartic(xtime(value));
    const y = (value) => r(quartic(xtime(value)));
    const g = (value) => y(value) ^ r(value) ^ quartic(value);
    const [v0, v1, v2, v3] = values;
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
      mapByAlphabet(nonce, 0),
    ]).slice(0, 20);
    const digest = md5Hex(seed);
    const tail = digest.slice(-6).split("").map((char) => char.charCodeAt(0));
    const checksum = String(mixColumns(tail).reduce((total, value) => total + value, 0) % 100).padStart(2, "0");
    return mapByAlphabet(digest.slice(0, 5), -4) + checksum;
  }
  // ==sign-core:end==

  function readCookie(name) {
    const prefix = name + "=";
    for (const part of document.cookie.split(";")) {
      const entry = part.trim();
      if (entry.startsWith(prefix)) return decodeURIComponent(entry.slice(prefix.length));
    }
    return "";
  }

  function getHeyboxId() {
    return readCookie("heybox_id") || readCookie("user_heybox_id");
  }

  function buildCyApiUrl(userId, offset) {
    const time = Math.floor(Date.now() / 1000);
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
      hkey: hkey,
      _time: String(time),
      nonce: nonce,
      userid: userId,
      only_cy: "1",
      filter_type: "0",
      enable_new_style_collect: "1",
      limit: String(CY_PAGE_SIZE),
      offset: String(offset),
      no_more: "false",
    });
    return "https://api.xiaoheihe.cn" + CY_API_PATH + "?" + query.toString();
  }

  async function fetchCyPage(userId, offset) {
    const response = await fetch(buildCyApiUrl(userId, offset), {
      credentials: "include",
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error("接口返回 HTTP " + response.status);
    const data = await response.json();
    if (data.status !== "ok") throw new Error(data.msg || "接口返回失败状态");
    const list = Array.isArray(data.result) ? data.result : [];
    return { list, noMore: data.no_more === true || list.length === 0 };
  }

  function normalizeCyItem(raw) {
    const link = raw && raw.link;
    if (!link || link.id === undefined || link.id === null) return null;
    const thumbs = Array.isArray(link.thumbs) ? link.thumbs : [];
    return {
      id: String(link.id),
      title: typeof link.title === "string" && link.title.trim() !== "" ? link.title.trim() : "无标题帖子",
      text: typeof raw.text === "string" ? raw.text.trim() : "",
      createAt: Number(raw.create_at) || 0,
      thumb: typeof thumbs[0] === "string" ? thumbs[0] : "",
      kind: raw.comment_type === 1 ? "回复" : "评论",
    };
  }

  async function loadCyFavorites(userId, onProgress) {
    const seen = new Set();
    const items = [];
    let offset = 0;
    for (;;) {
      const page = await fetchCyPage(userId, offset);
      for (const raw of page.list) {
        const item = normalizeCyItem(raw);
        if (item && !seen.has(item.id)) {
          seen.add(item.id);
          items.push(item);
        }
      }
      onProgress(items.length);
      if (page.noMore || items.length >= CY_MAX_ITEMS) break;
      offset += CY_PAGE_SIZE;
      if (offset >= CY_MAX_ITEMS + CY_PAGE_SIZE) break;
    }
    return items.slice(0, CY_MAX_ITEMS);
  }

  function readCache(userId) {
    try {
      const raw = localStorage.getItem(CACHE_KEY_PREFIX + userId);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.items)) return null;
      if (Date.now() - Number(parsed.savedAt) > CACHE_TTL_MS) return null;
      return parsed.items;
    } catch (error) {
      console.warn("[HeyBox Up] 读取缓存失败", error);
      return null;
    }
  }

  function writeCache(userId, items) {
    try {
      localStorage.setItem(CACHE_KEY_PREFIX + userId, JSON.stringify({ savedAt: Date.now(), items: items }));
    } catch (error) {
      console.warn("[HeyBox Up] 写入缓存失败", error);
    }
  }

  function formatTime(value) {
    if (!value) return "";
    const milliseconds = value > 1e12 ? value : value * 1000;
    const date = new Date(milliseconds);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("zh-CN", { hour12: false });
  }

  const PANEL_CSS = `
    :host { all: initial; }
    .entry {
      position: fixed; right: 24px; bottom: 88px; z-index: 2147483000;
      display: flex; align-items: center; gap: 6px;
      padding: 10px 14px; border-radius: 999px; border: 1px solid rgba(255,255,255,.14);
      background: linear-gradient(135deg, #ff5c5c, #ff8a3d); color: #fff;
      font: 600 13px/1 -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
      cursor: pointer; box-shadow: 0 10px 28px rgba(255, 92, 92, .35);
    }
    .entry:hover { filter: brightness(1.06); }
    .panel {
      position: fixed; right: 24px; bottom: 138px; z-index: 2147483001;
      width: 392px; max-height: 72vh; display: flex; flex-direction: column;
      border-radius: 16px; overflow: hidden; color: #e8ecf1;
      background: #16181d; border: 1px solid rgba(255,255,255,.1);
      box-shadow: 0 24px 60px rgba(0,0,0,.55);
      font: 13px/1.5 -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
    }
    .panel[hidden] { display: none; }
    .head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px 10px; }
    .title { font-size: 14px; font-weight: 700; letter-spacing: .2px; }
    .actions { display: flex; gap: 8px; }
    .icon-btn {
      border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.05); color: #cfd6df;
      border-radius: 8px; padding: 4px 8px; font-size: 12px; cursor: pointer;
    }
    .icon-btn:hover { background: rgba(255,255,255,.1); }
    .meta { padding: 0 16px 10px; color: #97a1ad; font-size: 12px; }
    .meta strong { color: #ffb27a; font-weight: 600; }
    .search { margin: 0 16px 10px; }
    .search input {
      width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 9px;
      border: 1px solid rgba(255,255,255,.12); background: #0f1115; color: #e8ecf1;
      font-size: 13px; line-height: 1.4; outline: none;
    }
    .search input:focus { border-color: rgba(255,138,61,.7); }
    .list { overflow-y: auto; padding: 0 10px 12px; }
    .card {
      display: flex; gap: 10px; padding: 10px; border-radius: 12px; text-decoration: none;
      color: inherit; border: 1px solid transparent;
    }
    .card:hover { background: rgba(255,255,255,.05); border-color: rgba(255,255,255,.08); }
    .thumb { width: 52px; height: 52px; border-radius: 9px; object-fit: cover; flex: none; background: #23262d; }
    .body { min-width: 0; flex: 1; }
    .card-title {
      font-weight: 600; font-size: 13px; margin-bottom: 3px;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .card-text { color: #9aa4b0; font-size: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .card-foot { margin-top: 5px; color: #6f7a87; font-size: 11px; display: flex; gap: 10px; }
    .state { padding: 34px 16px; text-align: center; color: #97a1ad; }
    .state.error { color: #ff8a8a; }
    .state button {
      margin-top: 10px; padding: 6px 14px; border-radius: 8px; cursor: pointer;
      border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.06); color: #e8ecf1;
    }
  `;

  function createUi() {
    const host = document.createElement("div");
    host.id = ENTRY_ID;
    const shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = PANEL_CSS;
    shadow.append(style);

    const entry = document.createElement("button");
    entry.type = "button";
    entry.className = "entry";
    entry.textContent = "插眼收藏";
    entry.title = "HeyBox Up：查看插眼收藏";

    const panel = document.createElement("section");
    panel.className = "panel";
    panel.setAttribute("aria-label", "插眼收藏");
    panel.hidden = true;

    const head = document.createElement("div");
    head.className = "head";
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = "插眼收藏 · HeyBox Up";
    const actions = document.createElement("div");
    actions.className = "actions";
    const refresh = document.createElement("button");
    refresh.type = "button";
    refresh.className = "icon-btn";
    refresh.textContent = "刷新";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "icon-btn";
    close.textContent = "收起";
    actions.append(refresh, close);
    head.append(title, actions);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = "小黑盒网页收藏列表不显示插眼，收藏总数却会计入。这里单独列出插眼条目。";

    const search = document.createElement("div");
    search.className = "search";
    const input = document.createElement("input");
    input.type = "search";
    input.placeholder = "搜索标题或插眼内容";
    search.append(input);

    const list = document.createElement("div");
    list.className = "list";

    panel.append(head, meta, search, list);
    shadow.append(entry, panel);
    (document.body || document.documentElement).append(host);

    return { entry, panel, refresh, close, input, list, meta };
  }

  function renderState(ui, message, isError, onRetry) {
    ui.list.replaceChildren();
    const box = document.createElement("div");
    box.className = isError ? "state error" : "state";
    box.textContent = message;
    if (onRetry) {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "重试";
      retry.addEventListener("click", onRetry);
      box.append(document.createElement("br"), retry);
    }
    ui.list.append(box);
  }

  function renderItems(ui, items) {
    const keyword = ui.input.value.trim().toLowerCase();
    const visible = keyword === ""
      ? items
      : items.filter((item) => (item.title + " " + item.text).toLowerCase().includes(keyword));

    ui.list.replaceChildren();
    if (visible.length === 0) {
      renderState(ui, keyword === "" ? "没有插眼收藏。" : "没有匹配的插眼收藏。", false, null);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const item of visible) {
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
      cardText.className = "card-text";
      cardText.textContent = item.text !== "" ? item.text : "（无文字内容）";
      const foot = document.createElement("div");
      foot.className = "card-foot";
      const kind = document.createElement("span");
      kind.textContent = "插眼" + item.kind;
      const time = document.createElement("span");
      time.textContent = formatTime(item.createAt);
      foot.append(kind, time);
      body.append(cardTitle, cardText, foot);
      card.append(body);
      fragment.append(card);
    }
    ui.list.append(fragment);
  }

  function boot() {
    if (document.getElementById(ENTRY_ID)) return;
    if (!document.documentElement) return;

    const ui = createUi();
    let items = [];
    let loading = false;

    const updateCount = () => {
      ui.meta.textContent = "小黑盒网页收藏列表不显示插眼，收藏总数却会计入。共 " + items.length + " 条插眼收藏。";
    };

    const load = async (force) => {
      if (loading) return;
      const userId = getHeyboxId();
      if (userId === "") {
        renderState(ui, "没有读到 heybox_id，请先登录小黑盒后再试。", true, () => load(true));
        return;
      }

      if (!force) {
        const cached = readCache(userId);
        if (cached) {
          items = cached;
          renderItems(ui, items);
          updateCount();
          return;
        }
      }

      loading = true;
      refresh.disabled = true;
      renderState(ui, "正在拉取插眼收藏…", false, null);
      try {
        items = await loadCyFavorites(userId, (count) => {
          renderState(ui, "正在拉取插眼收藏… " + count + " 条", false, null);
        });
        writeCache(userId, items);
        renderItems(ui, items);
        updateCount();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        renderState(ui, "加载失败：" + message, true, () => load(true));
      } finally {
        loading = false;
        refresh.disabled = false;
      }
    };

    const openPanel = () => {
      ui.panel.hidden = false;
      void load(false);
      ui.input.focus();
    };

    ui.entry.addEventListener("click", () => {
      if (ui.panel.hidden) {
        openPanel();
      } else {
        ui.panel.hidden = true;
      }
    });
    ui.close.addEventListener("click", () => {
      ui.panel.hidden = true;
    });
    ui.refresh.addEventListener("click", () => {
      void load(true);
    });
    ui.input.addEventListener("input", () => {
      renderItems(ui, items);
      updateCount();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
