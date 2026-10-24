import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../scripts/heybox-up.js", import.meta.url), "utf8");

function readConstant(name) {
  const match = new RegExp('const ' + name + ' = "([^"]+)";').exec(source);
  assert.ok(match, "Missing constant: " + name);
  return match[1];
}

function loadCommentRnd() {
  const startMarker = "// ==comment-rnd:start==";
  const endMarker = "// ==comment-rnd:end==";
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  assert.ok(start >= 0 && end > start, "Missing comment RND markers");
  const helperSource = source.slice(start + startMarker.length, end);
  const factory = new Function(`
    "use strict";
    const COMMENT_CREATE_RND_VERSION = ${JSON.stringify(readConstant("COMMENT_CREATE_RND_VERSION"))};
    const COMMENT_CREATE_RND_SECRET = ${JSON.stringify(readConstant("COMMENT_CREATE_RND_SECRET"))};
    ${helperSource}
    return createCommentRnd;
  `);
  return factory();
}

test("comment-create RND matches the site HMAC vector", async () => {
  const createCommentRnd = loadCommentRnd();
  const actual = await createCommentRnd("0123456789ABCDEF0123456789ABCDEF", "1729728000");
  assert.equal(actual, "15:0b5ff148c4143dc8ec50bb56304ef17caf0dbeae61aa4a738048ac139b0c40a3");
});

test("reader adds RND only when creating a comment", () => {
  assert.equal(readConstant("COMMENT_CREATE_API_PATH"), "/bbs/app/comment/create");
  const assignments = source.match(/\._rnd\s*=/g) ?? [];
  assert.equal(assignments.length, 1);
  assert.match(
    source,
    /if \(path === COMMENT_CREATE_API_PATH\) \{\s*params\._rnd = await createCommentRnd\(params\.nonce, params\._time\);\s*\}/,
  );
});

test("reader keeps the existing comment-create form fields", () => {
  const start = source.indexOf("const submitCy = async");
  const end = source.indexOf("const openCyDialog", start);
  assert.ok(start >= 0 && end > start, "Missing submitCy block");
  const submitSource = source.slice(start, end);
  for (const field of ["is_cy: 1", 'link_id: targetId', 'reply_id: "-1"', 'root_id: "-1"', "text: text"]) {
    assert.ok(submitSource.includes(field), "Missing form field: " + field);
  }
});
