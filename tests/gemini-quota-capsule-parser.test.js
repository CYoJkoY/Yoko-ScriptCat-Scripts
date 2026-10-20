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
// 未知账号前缀时不猜测 /u/0 ~ /u/3，只请求裸 /usage。
assert.equal(
  window.__gqc._test.getOfficialUsageUrl(),
  "https://gemini.google.com/usage",
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
// 裸 /usage 只在明确允许（当前页无账号前缀）时才接受账号解析后的地址；
// 已知前缀的候选即便允许也不能落到别的 /u/<n>。
assert.equal(isSameUsagePath("/u/2/usage", "/usage"), false);
assert.equal(isSameUsagePath("/u/2/usage", "/usage", true), true);
assert.equal(isSameUsagePath("/u/2/usage", "/u/1/usage", true), false);

// 无前缀页面从同源请求观察账号索引；有前缀时当前页优先
assert.equal(window.__gqc._test.getAccountPrefix(), "");
window.__gqc._test.noteAccountPrefix(
  "https://gemini.google.com/u/2/_/BardChatUi/data/batchexecute",
);
assert.equal(window.__gqc._test.getAccountPrefix(), "/u/2");
assert.equal(
  window.__gqc._test.getOfficialUsageUrl(),
  "https://gemini.google.com/u/2/usage",
);
// 同一文档只认首次可信观察，冲突索引不得覆盖已记录的前缀。
window.__gqc._test.noteAccountPrefix(
  "https://gemini.google.com/u/3/_/BardChatUi/data/batchexecute",
);
assert.equal(window.__gqc._test.getAccountPrefix(), "/u/2");
window.__gqc._test.noteAccountPrefix("https://example.com/u/9/usage");
assert.equal(window.__gqc._test.getAccountPrefix(), "/u/2");
window.__gqc._test.noteAccountPrefix("https://gemini.google.com/app");
assert.equal(window.__gqc._test.getAccountPrefix(), "/u/2");

window.location.pathname = "/u/1/app";
assert.equal(window.__gqc._test.getAccountPrefix(), "/u/1");
window.location.pathname = "/app";

console.log("quota parser tests passed");

// Official Usage RPC: enum selects the window, unknown buckets are ignored.
const api = window.__gqc._test;
const reset5 = Math.floor(now / 1000) + 7200;
const reset7 = Math.floor(now / 1000) + 259200;
const payload = [2, [[2400, 0.123, 1, [[reset5, 500000000]]], [48106, 0.68, 2, [[reset7, 0]]], [100, 0.8, 4, [[reset5, 0]]]], false];
const rpc = api.parseUsageRpcPayload(payload, now);
assert.equal(rpc.fiveHour.usedPct, 12);
assert.equal(rpc.fiveHour.pct, 88);
assert.equal(rpc.fiveHour.resetAt, reset5 * 1000 + 500);
assert.equal(rpc.weekly.usedPct, 68);
assert.equal(rpc.weekly.resetAt, reset7 * 1000);
assert.equal(api.parseUsageRpcPayload(null, now), null);
for (const fraction of [-0.01, NaN, Infinity, '0.2']) {
  assert.equal(api.parseUsageRpcPayload([2, [[100, fraction, 1, [[reset5, 0]]]]], now), null);
}

// 超用比例只做上限钳制，不能整行丢弃：否则耗尽后反而拿不到用量。
const overage = api.parseUsageRpcPayload([2, [[0, 2.2, 1, [[reset5, 0]]]], false], now);
assert.equal(overage.fiveHour.usedPct, 100);
assert.equal(overage.fiveHour.pct, 0);

// row[0] 是剩余额度：耗尽时为 0；fraction 超额时钳制到 100% 已用。
const exhausted = api.parseUsageRpcPayload(
  [2, [[0, 1.2, 1, [[reset5, 0]]], [0, 1.5, 2, [[reset7, 0]]]], false],
  now,
);
assert.equal(exhausted.fiveHour.usedPct, 100);
assert.equal(exhausted.fiveHour.pct, 0);
assert.equal(exhausted.weekly.usedPct, 100);
assert.equal(exhausted.weekly.pct, 0);

// 同窗口重复行取第一条有效值，兄弟行异常不影响另一窗口。
const duplicated = api.parseUsageRpcPayload(
  [2, [[100, 0.2, 1, [[reset5, 0]]], [100, 0.7, 1, [[reset5, 0]]], [0, 'bad', 2, [[reset7, 0]]]], false],
  now,
);
assert.equal(duplicated.fiveHour.usedPct, 20);
assert.equal(duplicated.weekly, null);

assert.equal(api.buildOfficialUsageRequest(), null);
window.WIZ_global_data = {SNlM0e: 'token&+', cfb2h: 'build', FdrFJe: 'session'};
window.location.pathname = '/u/1/app';
const request = api.buildOfficialUsageRequest();
const rpcUrl = new URL(request.url);
assert.equal(rpcUrl.pathname, '/u/1/_/BardChatUi/data/batchexecute');
assert.equal(rpcUrl.searchParams.get('rpcids'), 'jSf9Qc');
assert.equal(rpcUrl.searchParams.get('source-path'), '/u/1/usage');
assert.equal(rpcUrl.searchParams.get('bl'), 'build');
assert.equal(rpcUrl.searchParams.get('f.sid'), 'session');
const body = new URLSearchParams(request.body);
assert.equal(body.get('at'), 'token&+');
assert.deepEqual(JSON.parse(body.get('f.req')), [[['jSf9Qc', '[]', null, 'generic']]]);
assert.equal(api.officialCacheKey().endsWith(':/u/1'), true);
window.location.pathname = '/u/2/app';
assert.equal(api.officialCacheKey().endsWith(':/u/2'), true);
const raw = JSON.stringify([['wrb.fr', 'jSf9Qc', JSON.stringify(payload)]]);
assert.equal(api.parseUsageRpcPayload(api.parseBatchExecuteResponse(raw)[0].payload, now).weekly.pct, 32);
console.log('official usage RPC tests passed');
