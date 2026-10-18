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

console.log("quota parser tests passed");
