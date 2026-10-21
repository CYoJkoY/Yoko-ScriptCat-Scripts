// Signing regression check: fixture taken from a live accepted request.
// Run: node helper/heybox-up/sign-check.cjs
const assert = require("node:assert");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const scriptPath = path.join(__dirname, "..", "..", "scripts", "heybox-up.js");
const source = fs.readFileSync(scriptPath, "utf8");
const start = source.indexOf("// ==sign-core:start==");
const end = source.indexOf("// ==sign-core:end==");
assert.ok(start >= 0 && end > start, "sign core markers missing");

const core = source.slice(start, end);
const build = new Function(core + "\nreturn { createSignature, md5Hex };");
const { createSignature, md5Hex } = build();

assert.strictEqual(md5Hex(""), "d41d8cd98f00b204e9800998ecf8427e");
assert.strictEqual(md5Hex("abc"), "900150983cd24fb0d6963f7d28e17f72");
for (const sample of ["小黑盒", "插眼收藏", "a".repeat(200)]) {
  assert.strictEqual(md5Hex(sample), crypto.createHash("md5").update(sample, "utf8").digest("hex"));
}

const hkey = createSignature("/bbs/app/profile/bbs/comment/list", 1792587363, "2B3C207C9CF9AF2779DEE63C509DA4E8");
assert.strictEqual(hkey, "VX2Y254");

console.log("sign-check ok:", hkey);
