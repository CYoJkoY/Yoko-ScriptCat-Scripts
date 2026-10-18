// ==Standalone Probe==
// Gemini 配额取证探针（独立版）：不依赖 userscript 版本，粘贴到 DevTools Console 即可。
//
// 用法：
//   1. 打开 https://gemini.google.com/app ，F12 -> Console，粘贴本文件全部内容并回车；
//   2. 执行 __gqp.watchAll()（记录之后所有请求的 URL，用来定位「打开限额弹窗」触发了哪个 RPC）；
//   3. 打开 Gemini 自己的限额 / 用量弹窗，再随便发一条消息；
//   4. 执行 __gqp.dump()，把打印出来的 JSON 整段回传。
//
// 采集范围：请求 URL（截断）+ 关键字（quota/limit/remaining/限额/剩余…）附近
// 前后各约 100/140 字符的片段，每个响应最多 3 条，总共最多 40 条。
// 不保存整段报文、不保存完整会话内容，也不会把任何数据发到外部。
(function () {
  "use strict";

  if (window.__gqp) {
    console.log("[probe] already installed; run __gqp.dump()");
    return;
  }

  const KEY = /(quota|rate.?limit|usage.?limit|remaining|percent|reset|GXU|限额|限額|额度|額度|用量|剩余|剩餘|已用|重置)/i;
  const WATCH_URL_RE =
    /(batchexecute|StreamGenerateContent|generateContent|assistant\.vertical\.chat|BardChatUi|usage|quota|limit|entitle|billing|tier|gxu)/i;
  const MAX_HITS = 40;
  const MAX_FRAGS_PER_BODY = 3;
  const RADIUS_BEFORE = 100;
  const RADIUS_AFTER = 140;

  const hits = [];
  const endpoints = [];
  let watchAll = false;

  function shorten(value, max) {
    const text = typeof value === "string" ? value : String(value == null ? "" : value);
    return text.length > max ? text.slice(0, max) + "…" : text;
  }

  function safeUrl(value, max) {
    try {
      const parsed = new URL(String(value || ""), location.href);
      const pathname = parsed.pathname || "";
      const rpcids = parsed.searchParams.get("rpcids");
      const safeQuery = rpcids ? `?rpcids=${encodeURIComponent(rpcids)}` : "";
      return shorten(`${parsed.origin}${pathname}${safeQuery}`, max);
    } catch (err) {
      return shorten(String(value || "").split(/[?#]/, 1)[0], max);
    }
  }

  function noteEndpoint(kind, url, len) {
    if (!watchAll && !WATCH_URL_RE.test(url)) return;
    endpoints.push({
      at: Math.round(performance.now()),
      kind: kind,
      url: safeUrl(url, 160),
      len: Number.isFinite(len) ? len : 0,
    });
    if (endpoints.length > 80) endpoints.splice(0, endpoints.length - 80);
  }

  function collect(kind, url, text) {
    if (typeof text !== "string" || text.length < 8) return;
    const re = new RegExp(KEY.source, "gi");
    let match;
    let taken = 0;
    while ((match = re.exec(text)) !== null && taken < MAX_FRAGS_PER_BODY) {
      const start = Math.max(0, match.index - RADIUS_BEFORE);
      const end = Math.min(text.length, match.index + RADIUS_AFTER);
      const frag = text.slice(start, end).replace(/\s+/g, " ").trim();
      if (!frag) continue;
      if (hits.some(function (item) { return item.text === frag; })) continue;
      hits.push({
        kind: kind,
        url: safeUrl(url, 120),
        size: text.length,
        text: frag,
      });
      taken += 1;
    }
    if (hits.length > MAX_HITS) hits.splice(0, hits.length - MAX_HITS);
  }

  const origFetch = window.fetch;
  window.fetch = function () {
    const args = arguments;
    const input = args[0];
    const url =
      typeof input === "string"
        ? input
        : input && typeof input.url === "string"
          ? input.url
          : "";
    const promise = origFetch.apply(this, args);
    try {
      promise.then(function (resp) {
        if (!WATCH_URL_RE.test(url)) return;
        resp
          .clone()
          .text()
          .then(function (text) {
            noteEndpoint("fetch", url, text.length);
            collect("fetch", url, text);
          })
          .catch(function () {
            noteEndpoint("fetch", url, 0);
          });
      });
    } catch (err) {
      // 探针失败不能影响页面
    }
    return promise;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__gqpUrl = typeof url === "string" ? url : String(url || "");
    return origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    const url = this.__gqpUrl || "";
    const xhr = this;
    try {
      xhr.addEventListener("load", function () {
        try {
          const text = typeof xhr.responseText === "string" ? xhr.responseText : "";
          noteEndpoint("xhr", url, text.length);
          if (WATCH_URL_RE.test(url)) collect("xhr", url, text);
        } catch (err) {
          // 忽略
        }
      });
    } catch (err) {
      // 忽略
    }
    return origSend.apply(this, arguments);
  };

  function domHints() {
    try {
      const text = document.body ? document.body.innerText || "" : "";
      const out = [];
      const seen = {};
      const lines = text.split(/\n+/);
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i].trim();
        if (!line || line.length > 160) continue;
        if (!KEY.test(line)) continue;
        if (seen[line]) continue;
        seen[line] = true;
        out.push(line);
        if (out.length >= 12) break;
      }
      return out;
    } catch (err) {
      return [];
    }
  }

  window.__gqp = {
    hits: hits,
    endpoints: endpoints,
    watchAll: function () {
      watchAll = true;
      console.log("[probe] watchAll on: 现在打开限额弹窗 / 发一条消息，再执行 __gqp.dump()");
      return true;
    },
    dom: domHints,
    dump: function () {
      const out = {
        at: new Date().toISOString(),
        href: shorten(location.href, 160),
        watchAll: watchAll,
        domHints: domHints(),
        endpoints: endpoints.slice(-30),
        hits: hits.slice(-25),
      };
      console.log(JSON.stringify(out, null, 2));
      return out;
    },
  };

  console.log("[probe] ready. 下一步: __gqp.watchAll()");
})();
