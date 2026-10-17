/**
 * gemini-quota-capsule 解析层回归测试
 *
 * 只覆盖「5 小时 / 每周用量算错」这条链路上的纯函数与解析入口：
 *  - 百分比方向与量纲归一（1% 不能被读成 100%）
 *  - AF_initDataCallback 括号配对提取
 *  - 标签识别（hourly / 5 小时 / 每周）
 *  - 已用百分比口径
 *
 * 运行：node --test tests/
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";

const SRC = readFileSync(
  new URL("../scripts/gemini-quota-capsule.js", import.meta.url),
  "utf8",
);

/** 在 vm 沙箱里加载用户脚本，返回其 __gqc._test 出口 */
function loadInternals() {
  const noop = () => {};
  const fakeEl = () => ({
    style: {},
    dataset: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    appendChild: noop,
    removeChild: noop,
    addEventListener: noop,
    setAttribute: noop,
    getAttribute: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  });
  const store = new Map();

  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    Promise,
    Number,
    String,
    Object,
    Array,
    Error,
    RegExp,
    Map,
    Set,
    isFinite,
    parseInt,
    parseFloat,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    navigator: { userAgent: "node", language: "zh-CN" },
    location: {
      href: "https://gemini.google.com/app",
      pathname: "/app",
      hostname: "gemini.google.com",
    },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    // body 为 null：让 bootstrap 走 DOMContentLoaded 分支，不真的建 DOM
    document: {
      body: null,
      documentElement: { innerHTML: "" },
      addEventListener: noop,
      createElement: fakeEl,
      createTextNode: () => ({}),
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    XMLHttpRequest: function XMLHttpRequest() {},
    MutationObserver: function MutationObserver() {
      return { observe: noop, disconnect: noop };
    },
    DOMParser: function DOMParser() {
      return {
        parseFromString: () => ({
          body: { innerText: "" },
          querySelectorAll: () => [],
        }),
      };
    },
    addEventListener: noop,
    fetch: async () => ({
      ok: false,
      status: 0,
      text: async () => "",
      clone() {
        return this;
      },
    }),
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: "gemini-quota-capsule.js" });
  assert.ok(sandbox.window.__gqc, "脚本应导出 __gqc");
  return sandbox.window.__gqc._test;
}

const t = loadInternals();
const NOW = Date.parse("2026-10-18T02:00:00Z");

test("normalizePctValue: 1 在百分数字段里是 1%，在比率字段里是 100%", () => {
  assert.equal(t.normalizePctValue(1, "percent"), 1);
  assert.equal(t.normalizePctValue(1, "fraction"), 100);
  assert.equal(t.normalizePctValue(0, "percent"), 0);
  assert.equal(t.normalizePctValue(34, "percent"), 34);
  assert.equal(t.normalizePctValue(0.34, "fraction"), 34);
  // 无字段名线索：小数按比率，整数按百分数
  assert.equal(t.normalizePctValue(0.34), 34);
  assert.equal(t.normalizePctValue(1), 1);
  assert.equal(t.normalizePctValue(-1, "percent"), null);
  assert.equal(t.normalizePctValue(NaN, "percent"), null);
});

test("pctHintFromKey: fraction/ratio 走比率，其余走百分数", () => {
  assert.equal(t.pctHintFromKey("remainingFraction"), "fraction");
  assert.equal(t.pctHintFromKey("remainingRatio"), "fraction");
  assert.equal(t.pctHintFromKey("percentageUsed"), "percent");
  assert.equal(t.pctHintFromKey("percentRemaining"), "percent");
});

test("readMetricFromRecord: remainingFraction=1 表示剩余 100%", () => {
  const metric = t.readMetricFromRecord(
    { quota: { remainingFraction: 1 } },
    NOW,
  );
  assert.ok(metric, "应解析出指标");
  assert.equal(metric.pct, 100);
  assert.equal(metric.usedPct, 0);
});

test("readMetricFromRecord: 已用 1% 不会被放大成 100%", () => {
  const metric = t.readMetricFromRecord(
    { quota: { percentageUsed: 1 } },
    NOW,
  );
  assert.ok(metric, "应解析出指标");
  assert.equal(metric.usedPct, 1);
  assert.equal(metric.pct, 99);
});

test("scanBalancedArray / extractInitDataBlocks: 跳过字符串内的括号", () => {
  const html = [
    '<script>AF_initDataCallback({key:\'ds:1\', hash:\'2\', data:function(){return [["GXU_FIVE_HOURLY",[1,2,[3]]],"文字 ] 不应截断",{"a":[4,5]}]}, sideChannel:{}});</script>',
    '<script>AF_initDataCallback({key:\'ds:2\', data:function(){return [[1,2],[3,4]]}});</script>',
  ].join("\n");

  const blocks = t.extractInitDataBlocks(html);
  assert.equal(blocks.length, 2, "两个回调都应被提取");
  const first = JSON.parse(blocks[0]);
  assert.equal(first[1], "文字 ] 不应截断");
  assert.deepEqual(first[2], { a: [4, 5] });
  assert.deepEqual(JSON.parse(blocks[1]), [[1, 2], [3, 4]]);
});

test("extractInitDataBlocks: 跳过 data:null 回调且不误切后续块", () => {
  const html = [
    '<script>AF_initDataCallback({key:\'ds:1\', data:null, sideChannel:{}});</script>',
    '<script>AF_initDataCallback({key:\'ds:2\', data:function(){return [[7,8]]}, sideChannel:{}});</script>',
  ].join("\n");

  const blocks = t.extractInitDataBlocks(html);
  assert.equal(blocks.length, 1, "只应提取到真正的数组块");
  assert.deepEqual(JSON.parse(blocks[0]), [[7, 8]]);
});

test("poolKindFromLabel: hourly 归到 5 小时窗口", () => {
  assert.equal(t.poolKindFromLabel("hourly"), "fiveHour");
  assert.equal(t.poolKindFromLabel("FIVE_HOURLY"), "fiveHour");
  assert.equal(t.poolKindFromLabel("per_hour"), "fiveHour");
  assert.equal(t.poolKindFromLabel("weekly"), "weekly");
  assert.equal(t.poolKindFromLabel("604800"), "weekly");
});

test("parseUsageDocument: 页面文案用「已用」口径且标签是 hourly/每周", () => {
  const fakeDoc = {
    querySelectorAll: () => [],
    body: {
      innerText: [
        "5 小时限制",
        "已用 34%",
        "重置于 3 小时 12 分",
        "每周限制",
        "已用 12%",
        "重置于 4 天",
      ].join("\n"),
    },
  };

  const result = t.parseUsageDocument(fakeDoc, "");
  assert.ok(result, "应解析出配额");
  assert.ok(result.fiveHour, "应解析出 5 小时窗口");
  assert.equal(result.fiveHour.usedPct, 34);
  assert.equal(result.fiveHour.pct, 66);
  assert.ok(result.weekly, "应解析出每周窗口");
  assert.equal(result.weekly.usedPct, 12);
  assert.equal(result.weekly.pct, 88);
});

test("parseUsageDocument: 英文 hourly 标签同样命中 5 小时窗口", () => {
  const fakeDoc = {
    querySelectorAll: () => [],
    body: {
      innerText: [
        "Hourly limit",
        "45% used",
        "Resets in 2 hours",
        "Weekly limit",
        "8% used",
        "Resets in 5 days",
      ].join("\n"),
    },
  };

  const result = t.parseUsageDocument(fakeDoc, "");
  assert.ok(result && result.fiveHour, "hourly 标签应命中 5 小时窗口");
  assert.equal(result.fiveHour.usedPct, 45);
  assert.ok(result.weekly, "应解析出每周窗口");
  assert.equal(result.weekly.usedPct, 8);
});
