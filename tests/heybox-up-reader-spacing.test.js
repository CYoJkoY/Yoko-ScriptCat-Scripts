import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const source = readFileSync(new URL("../scripts/heybox-up.js", import.meta.url), "utf8");

function readSlice(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, "Missing block: " + startMarker);
  return source.slice(start, end);
}

function loadLineHeightHelpers() {
  const block = readSlice("function isStepAligned", "function parseFeedWidthInput");
  const lineHeight = readSlice("// Body line height: applies to article body text only", "function readReaderLineHeight()");
  const factory = new Function(
    '"use strict";\n'
      + block
      + lineHeight
      + "\nreturn { READER_LINE_HEIGHT_DEFAULT, READER_LINE_HEIGHT_MIN, READER_LINE_HEIGHT_MAX, READER_LINE_HEIGHT_STEP,"
      + " normalizeReaderLineHeight, parseReaderLineHeightInput };",
  );
  return factory();
}

test("body line height floor allows the single spacing a reader expects", () => {
  const helpers = loadLineHeightHelpers();
  assert.equal(helpers.READER_LINE_HEIGHT_MIN, 1, "the floor must allow 1.0x");
  assert.equal(helpers.READER_LINE_HEIGHT_DEFAULT, 1.7, "the default must stay 1.7x");
  assert.equal(helpers.READER_LINE_HEIGHT_MAX, 2.2, "the ceiling must stay 2.2x");
  assert.equal(helpers.READER_LINE_HEIGHT_STEP, 0.05, "the step must stay 0.05");
  assert.equal(helpers.parseReaderLineHeightInput("1"), 1);
  assert.equal(helpers.parseReaderLineHeightInput("1.4"), 1.4);
  assert.equal(helpers.parseReaderLineHeightInput("1.3"), 1.3);
  assert.equal(helpers.parseReaderLineHeightInput("0.95"), 1, "values below the floor clamp to it");
  assert.equal(helpers.normalizeReaderLineHeight("1.02"), 1.02);
  assert.equal(helpers.normalizeReaderLineHeight(0.8), 1);
});

function loadReaderCss() {
  return readSlice("const READER_CSS = `", "\n  `;");
}

test("text pages keep one paragraph rhythm instead of stacking page padding", () => {
  const css = loadReaderCss();
  assert.ok(
    /\.hbu-reader-page\[data-kind="text"\] \{ padding: 0 60px; \}/.test(css),
    "desktop text pages must not add vertical page padding",
  );
  assert.equal(
    /\.hbu-reader-page\[data-kind="text"\] \{ padding: 24px 60px 40px; \}/.test(css),
    false,
    "the old desktop text padding must be gone",
  );
  assert.ok(
    /\.hbu-reader-page\[data-kind="text"\] \.hbu-reader-copy p \{ margin: 0 0 \.72em; \}/.test(css),
    "text paragraphs must use the documented .72em gap",
  );
  assert.ok(
    /\.hbu-reader-page\[data-kind="text"\] \.hbu-reader-copy \{ white-space: normal; \}/.test(css),
    "text paragraphs must not inherit pre-wrap blank lines",
  );
  assert.ok(
    /\.hbu-reader-page\[data-kind="heading"\] \.hbu-reader-copy \{ white-space: pre-wrap; \}/.test(css),
    "heading pages must keep their existing whitespace handling",
  );
  assert.ok(
    css.includes(':is(p, .text) { margin: 0 0 .72em; }'),
    "rich text pages must keep the same .72em paragraph gap",
  );
  assert.ok(/\.hbu-reader-page\[data-kind="text"\] \{ padding: 0 64px 0 24px; \}/.test(css), "mobile text pages must drop vertical padding");
});

function loadAddTextPages(document) {
  const block = readSlice("    const addTextPages = (target, lines) => {", "    const addMediaPage = ");
  return new Function("document", '"use strict";\n' + block + "\nreturn addTextPages;")(document);
}

test("text lines become paragraphs instead of blank-line separated text", () => {
  const dom = new JSDOM("<!doctype html><body><div id=\"target\"></div></body>");
  const { document } = dom.window;
  const target = document.getElementById("target");
  const addTextPages = loadAddTextPages(document);

  addTextPages(target, ["first paragraph", " ", "second paragraph"]);

  const pages = Array.from(target.querySelectorAll(".hbu-reader-page"));
  assert.equal(pages.length, 1, "short text stays on one page");
  assert.equal(pages[0].dataset.kind, "text");
  const paragraphs = Array.from(pages[0].querySelectorAll(".hbu-reader-copy p")).map((node) => node.textContent);
  assert.deepEqual(paragraphs, ["first paragraph", "second paragraph"]);
  assert.equal(pages[0].textContent.includes("\n\n"), false, "paragraphs must not carry literal blank lines");
  dom.window.close();
});

