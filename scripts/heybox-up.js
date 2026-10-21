// ==UserScript==
// @name         HeyBox Up
// @namespace    https://cyojkoy.github.io/Payment/
// @version      0.1.4
// @description  补全小黑盒网页收藏：网页收藏列表不显示“插眼”(CY)，本脚本单独拉取 CY 列表，在收藏页（/app/user/favour/content）把 CY 条目补进收藏列表末尾，按帖子去重，结果缓存 10 分钟。需要登录小黑盒：脚本会以浏览器内已有登录态请求小黑盒自己的评论区接口（含本地计算的请求签名），只读取当前登录账号的插眼数据；数据仅写入本机 localStorage，不上传、不修改账号数据、不改动站点收藏总数。
// @author       Yoko
// @homepageURL  https://github.com/CYoJkoY/Yoko-ScriptCat-Scripts/blob/main/docs/heybox-up.md
// @supportURL   https://github.com/CYoJkoY/Yoko-ScriptCat-Scripts/issues
// @icon         data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23ff5c5c'/%3E%3Ctext x='16' y='22' font-size='17' font-family='sans-serif' font-weight='bold' fill='%23fff' text-anchor='middle'%3E%E6%88%AA%3C/text%3E%3C/svg%3E
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
      iconPath.setAttribute("d", "M8 3C4.5 3 1.8 5.5 1 8c.8 2.5 3.5 5 7 5s6.2-2.5 7-5c-.8-2.5-3.5-5-7-5Zm0 8.2A3.2 3.2 0 1 1 8 4.8a3.2 3.2 0 0 1 0 6.4Zm0-1.7a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z");
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

  const FAVOUR_PATH = "/app/user/favour/content";
  const FAVOUR_HOST_ID = "heybox-up-favour";
  // shortcut: 依赖站点类名 .user-favour__list 及其父级 .list，站点改版时需升级。
  const FAVOUR_LIST_SELECTOR = ".user-favour__list";

  const FAVOUR_CSS = `
    :host { display: block; font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; }
    .section { padding: 14px 8px 4px; }
    .heading { font-size: 14px; font-weight: 700; margin-bottom: 2px; }
    .note { font-size: 12px; opacity: .62; margin-bottom: 10px; }
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
    .card-text-icon { width: 15px; height: 15px; flex: none; margin-top: 2px; color: rgba(255,92,92,.85); }
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
    const heading = document.createElement("div");
    heading.className = "heading";
    heading.textContent = "插眼收藏";
    const note = document.createElement("div");
    note.className = "note";
    note.textContent = "正在读取插眼收藏…";
    const list = document.createElement("div");
    list.className = "list";
    section.append(heading, note, list);
    shadow.append(section);

    let items = [];
    let started = false;

    const readPageIds = () => {
      const ids = new Set();
      for (const node of document.querySelectorAll(FAVOUR_LIST_SELECTOR + ' a[href*="/bbs/link/"]')) {
        const match = /\/bbs\/link\/(\d+)/.exec(node.getAttribute("href") || "");
        if (match) ids.add(match[1]);
      }
      return ids;
    };

    let renderedPageIds = -1;

    const render = () => {
      const pageIds = readPageIds();
      renderedPageIds = pageIds.size;
      const visible = items.filter((item) => !pageIds.has(item.id));
      list.replaceChildren();
      if (visible.length === 0) {
        note.textContent = items.length === 0 ? "没有插眼收藏。" : "插眼条目已全部出现在列表中。";
        return;
      }
      note.textContent = "共 " + visible.length + " 条插眼收藏，网页收藏列表默认不显示。";
      const fragment = document.createDocumentFragment();
      for (const item of visible) fragment.append(createCard(item));
      list.append(fragment);
    };

    const place = () => {
      const listNode = document.querySelector(FAVOUR_LIST_SELECTOR);
      const parent = listNode ? listNode.parentElement : null;
      if (!listNode || !parent) return;
      if (host.parentNode !== parent || host.previousElementSibling !== listNode) {
        parent.insertBefore(host, listNode.nextSibling);
      }
      if (readPageIds().size !== renderedPageIds) render();
    };

    const load = async () => {
      if (started) return;
      started = true;
      const userId = getHeyboxId();
      if (userId === "") {
        note.textContent = "未登录小黑盒，无法读取插眼收藏。";
        return;
      }
      const cached = readCache(userId);
      if (cached) {
        items = cached;
        render();
        place();
        return;
      }
      try {
        items = await loadCyFavorites(userId, () => {});
        writeCache(userId, items);
      } catch (error) {
        note.textContent = "插眼收藏读取失败：" + (error instanceof Error ? error.message : String(error));
        return;
      }
      render();
      place();
    };

    place();
    void load();
    return { host, place };
  }

  function watchFavourPage() {
    if (!document.body) return;
    let section = null;
    let scheduled = false;

    const sync = () => {
      if (location.pathname !== FAVOUR_PATH || getHeyboxId() === "") {
        if (section) {
          section.host.remove();
          section = null;
        }
        return;
      }
      if (!section) section = createFavourSection();
      section.place();
    };

    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        sync();
      });
    };

    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    sync();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", watchFavourPage, { once: true });
  } else {
    watchFavourPage();
  }
})();
