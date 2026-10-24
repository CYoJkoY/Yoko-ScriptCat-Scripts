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

function loadPostReaderApi() {
  const start = source.indexOf("const postReaderApi = async");
  const end = source.indexOf("const fetchFavourFolders = async", start);
  assert.ok(start >= 0 && end > start, "Missing postReaderApi block");
  return new Function(
    "createApiParams",
    "createCommentRnd",
    "getHeyboxId",
    "fetchWithTimeout",
    "COMMENT_CREATE_API_PATH",
    "\"use strict\";\n"
      + source.slice(start, end)
      + "\nreturn postReaderApi;",
  );
}

test("reader sends RND only in the serialized comment-create request", async () => {
  const nonce = "0123456789ABCDEF0123456789ABCDEF";
  const timestamp = "1729728000";
  const commentCreatePath = "/bbs/app/comment/create";
  const expectedRnd = "15:0b5ff148c4143dc8ec50bb56304ef17caf0dbeae61aa4a738048ac139b0c40a3";
  const requests = [];
  const requestedPaths = [];
  const postReaderApi = loadPostReaderApi()(
    (path) => {
      requestedPaths.push(path);
      return { nonce, _time: timestamp, hkey: "fixture-hkey" };
    },
    loadCommentRnd(),
    () => "fixture-user",
    async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ status: "ok", result: {} }) };
    },
    commentCreatePath,
  );

  await postReaderApi(commentCreatePath, {
    is_cy: 1,
    link_id: "fixture-link",
    reply_id: "-1",
    root_id: "-1",
    text: "fixture text",
  });
  await postReaderApi("/bbs/app/link/favour", { favour_type: 1, link_id: "fixture-link" });

  assert.deepEqual(requestedPaths, [commentCreatePath, "/bbs/app/link/favour"]);
  assert.equal(requests.length, 2);
  const commentUrl = new URL(requests[0].url);
  assert.equal(commentUrl.searchParams.get("_rnd"), expectedRnd);
  assert.equal(commentUrl.searchParams.get("nonce"), nonce);
  assert.equal(commentUrl.searchParams.get("_time"), timestamp);
  assert.equal(commentUrl.searchParams.get("target"), "heybox_app");
  assert.deepEqual(Object.fromEntries(new URLSearchParams(requests[0].options.body)), {
    is_cy: "1",
    link_id: "fixture-link",
    reply_id: "-1",
    root_id: "-1",
    text: "fixture text",
  });
  assert.equal(new URL(requests[1].url).searchParams.has("_rnd"), false);
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
