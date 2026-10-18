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
console.log("quota parser tests passed");
