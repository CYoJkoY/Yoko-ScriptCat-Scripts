// Reader wiring check: guards the reversible defaults, theme tokens and native bridges.
// Run: node helper/heybox-up/reader-check.cjs
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "..", "scripts", "heybox-up.js"), "utf8");

assert.match(source, /const READER_KEY = "heybox-up\.reader\.v1";/);
assert.match(source, /localStorage\.getItem\(READER_KEY\) !== "0"/, "reader must default on");
assert.match(source, /classList\.remove\(READER_CLASS, READER_COMMENT_CLASS\)/, "teardown must clear both classes");
assert.match(source, /watchReader\(\);/, "reader watcher must boot");
assert.match(source, /createReaderToggle\(\)/, "settings toggle must mount");
assert.match(source, /#page-bbs-link \.link-comment/, "comments must stay native");
assert.match(source, /\.hb-bbs-link__reply-target/, "reply editor must stay native");
assert.match(source, /host\.inert = true/, "comment sheet must trap background focus");
assert.match(source, /host\.inert = false/, "closing the sheet must restore focus");
assert.match(source, /sessionStorage\.setItem\(READER_SCROLL_KEY/, "scroll restore must persist");

assert.match(source, /const nativeLike = \(\) => articleActionBox\(\)/, "article like must resolve from the non-comment action box");
assert.match(source, /hbu-reader-favour-menu/, "favour folder menu must exist");
assert.match(source, /cy\.dataset\.action = "cy"/, "rail must expose a CY toggle");
assert.match(source, /z-index: 4010 !important/, "open drawer must lift the native layer");
assert.match(source, /z-index: 4009/, "backdrop must sit between stage and drawer");
assert.match(source, /calc\(var\(--hbu-reader-stage\) \+ 80px\)/, "stage must reserve rail space");

assert.ok(source.includes('data-heybox-up-dark="true"'), "missing reader tokens for dark");
for (const theme of ["oled", "paper", "mist"]) {
  assert.ok(source.includes(`data-heybox-up-theme="${theme}"`), `missing reader tokens for ${theme}`);
}

const ids = ["heybox-up-reader", "heybox-up-reader-style", "heybox-up-reader-backdrop"];
for (const id of ids) assert.ok(source.includes(`"${id}"`), `missing ${id}`);

assert.match(source, /scroll-snap-stop: always/, "pages must lock at snap points");
assert.match(source, /prefers-reduced-motion: reduce/, "reduced motion must be honored");
assert.match(source, /height: 100dvh/, "reader must use dynamic viewport height");

console.log("reader-check ok");
