const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("scripts/gemini-quota-capsule.js", "utf8");
const listeners = new Map();
const window = {
  location: { pathname: "/app", origin: "https://gemini.google.com", href: "https://gemini.google.com/app" },
  addEventListener(type, handler) { listeners.set(type, handler); },
  fetch: async () => { throw new Error("network disabled in parser test"); },
  XMLHttpRequest: function XMLHttpRequest() {},
};
window.XMLHttpRequest.prototype.open = function open() {};
window.XMLHttpRequest.prototype.send = function send() {};
const document = {
  body: null,
  documentElement: null,
  addEventListener(type, handler) { listeners.set(type, handler); },
  createElement() { throw new Error("DOM not expected in parser test"); },
};
const context = {
  window,
  document,
  XMLHttpRequest: window.XMLHttpRequest,
  Node: function Node() {},
  DOMParser: function DOMParser() {},
  localStorage: { getItem() { return null; }, setItem() {} },
  URLSearchParams,
  URL,
  Date,
  JSON,
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
};
vm.runInNewContext(source, context, { filename: "gemini-quota-capsule.js" });

const now = new Date("2026-10-18T12:00:00").getTime();
const parsed = window.__gqc.parseResetText("Resets Oct 23 at 5:30 PM", now);
assert.equal(parsed, new Date("2026-10-23T17:30:00").getTime());
assert.equal(window.__gqc.parseResetText("Resets at 5:30 PM", now), new Date("2026-10-18T17:30:00").getTime());
assert.equal(window.__gqc.parseResetText("Resets in 3 hr 12 min", now), now + (3 * 60 + 12) * 60 * 1000);

const usageText = window.__gqc._test.parseOfficialUsageText(
  [
    "Usage limits",
    "Current usage",
    "1% used",
    "Resets at 5:30 PM",
    "Weekly limit",
    "2% used",
    "Resets Oct 23 at 5:30 PM",
  ].join("\n"),
  now,
);
assert.equal(usageText.fiveHour.pct, 99);
assert.equal(usageText.fiveHour.usedPct, 1);
assert.equal(usageText.weekly.pct, 98);
assert.equal(usageText.weekly.usedPct, 2);
assert.equal(
  usageText.weekly.resetAt,
  new Date("2026-10-23T17:30:00").getTime(),
);
const usageUrls = window.__gqc._test.getOfficialUsageUrls();
assert.equal(
  JSON.stringify(usageUrls),
  JSON.stringify([
    "https://gemini.google.com/u/0/usage",
    "https://gemini.google.com/u/1/usage",
    "https://gemini.google.com/u/2/usage",
    "https://gemini.google.com/u/3/usage",
  ]),
);

// 后台用量页同步：地址只在 hash 上带 nonce，不污染服务端路由与查询参数
assert.equal(
  window.__gqc._test.buildUsageHelperUrl(
    "n1",
    "https://gemini.google.com/u/1/usage",
  ),
  "https://gemini.google.com/u/1/usage#gqc-usage-sync=n1",
);

window.location.hash = "#gqc-usage-sync=abc";
assert.equal(window.__gqc._test.readHelperSyncNonce(), "abc");
window.location.hash = "#app";
assert.equal(window.__gqc._test.readHelperSyncNonce(), null);

const bridgePayload = window.__gqc._test.readSyncBridgePayload(
  JSON.stringify({ nonce: "n1", ok: true, fiveHour: null, weekly: null }),
);
assert.equal(bridgePayload.nonce, "n1");
assert.equal(window.__gqc._test.readSyncBridgePayload("not-json"), null);
assert.equal(
  window.__gqc._test.readSyncBridgePayload(JSON.stringify({ ok: true })),
  null,
);

// 账号路径一致性：重定向到别的账号后，正文不能记在候选名下
const isSameUsagePath = window.__gqc._test.isSameUsagePath;
assert.equal(isSameUsagePath("/u/1/usage", "/u/1/usage"), true);
assert.equal(isSameUsagePath("/u/1/usage/", "/u/1/usage"), true);
assert.equal(isSameUsagePath("/u/0/usage", "/u/3/usage"), false);
assert.equal(isSameUsagePath("/app", "/u/3/usage"), false);
assert.equal(isSameUsagePath("/u/1/usage", ""), false);
assert.equal(isSameUsagePath(null, "/u/1/usage"), false);

// 无前缀页面从同源请求观察账号索引；有前缀时当前页优先
assert.equal(window.__gqc._test.getAccountPrefix(), "");
window.__gqc._test.noteAccountPrefix(
  "https://gemini.google.com/u/2/_/BardChatUi/data/batchexecute",
);
assert.equal(window.__gqc._test.getAccountPrefix(), "/u/2");
assert.equal(
  JSON.stringify(window.__gqc._test.getOfficialUsageUrls()),
  JSON.stringify(["https://gemini.google.com/u/2/usage"]),
);
window.__gqc._test.noteAccountPrefix("https://example.com/u/9/usage");
assert.equal(window.__gqc._test.getAccountPrefix(), "/u/2");
window.__gqc._test.noteAccountPrefix("https://gemini.google.com/app");
assert.equal(window.__gqc._test.getAccountPrefix(), "/u/2");

window.location.pathname = "/u/1/app";
assert.equal(window.__gqc._test.getAccountPrefix(), "/u/1");
window.location.pathname = "/app";

// iframe 空白判定留宽限期，不能沿用「空白即永久停用」的旧口径
assert.equal(
  Number.isInteger(window.__gqc._test.USAGE_FRAME_BLANK_GRACE_MS),
  true,
);
assert.equal(window.__gqc._test.USAGE_FRAME_BLANK_GRACE_MS > 0, true);

console.log("quota parser tests passed");
