import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../scripts/heybox-up.js", import.meta.url), "utf8");

function readBlock(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, "Missing block: " + startMarker);
  return source.slice(start, end);
}

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
  const commentCreatePath = readConstant("COMMENT_CREATE_API_PATH");
  assert.equal(commentCreatePath, "/bbs/app/comment/create");
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
  assert.ok(
    submitSource.includes("postReaderApi(COMMENT_CREATE_API_PATH, {"),
    "submitCy must use COMMENT_CREATE_API_PATH",
  );
});

test("reader CY badge renders the count and a zero fallback", () => {
  const block = readBlock("const syncActionStates = () => {", "const clickNative");
  assert.ok(block.includes("hbu-reader-cy-count"), "the rail CY action must render a count span");
  assert.ok(
    block.includes("const cyTotal = linkState === null ? cyPublishedCount :"),
    "the badge must show the article publish count before link state loads",
  );
  assert.ok(block.includes("formatActionCount(cyTotal)"), "the badge must format the CY total");
  assert.ok(block.includes("cyNode.title"), "the rail CY action must expose the count in its tooltip");
});

test("reader CY badge starts at zero in the initial rail markup", () => {
  const start = source.indexOf("const createRail = (data) => {");
  const end = source.indexOf("const cy = document.createElement", start);
  assert.ok(start >= 0 && end > start, "Missing createRail block");
  const cyMarkup = source.slice(end, source.indexOf("cy.addEventListener", end));
  assert.ok(cyMarkup.includes('hbu-reader-cy-count">0<'), "the rail CY button must start at 0");
  assert.ok(cyMarkup.includes('"CY 0"'), "the rail CY button must label the count for assistive tech");
});

test("publishing a CY increments the reader CY badge", () => {
  const start = source.indexOf("const submitCy = async");
  const end = source.indexOf("const openCyDialog", start);
  const submitSource = source.slice(start, end);
  const countedAt = submitSource.indexOf("cyPublishedCount += 1;");
  const branchAt = submitSource.indexOf("if (linkState !== null)");
  assert.ok(countedAt >= 0, "submitCy must record every successful publish");
  assert.ok(branchAt > countedAt, "submitCy must count the publish before checking for a loaded link state");
  assert.ok(submitSource.includes("addPublishedCy(linkState, 1);"), "submitCy must increment a loaded CY count");
  assert.ok(submitSource.includes("void loadLinkState();"), "submitCy must resolve link state after an early publish");
});

test("a publish is folded into link state that resolves after it", () => {
  const start = source.indexOf("const addPublishedCy = (link, published) => {");
  const end = source.indexOf("const loadLinkState = async", start);
  assert.ok(start >= 0 && end > start, "Missing addPublishedCy block");
  const addPublishedCy = new Function(
    '"use strict";\n' + source.slice(start, end) + "\nreturn addPublishedCy;",
  )();
  const link = { commentCount: 5, cyCount: 2 };
  assert.equal(addPublishedCy(link, 0), link, "a zero delta must keep the loaded link state");
  assert.equal(addPublishedCy(link, 2), link, "the helper must update the loaded link state in place");
  assert.equal(link.commentCount, 7);
  assert.equal(link.cyCount, 4);
});

test("link state loaded after a publish adds the publish delta", () => {
  const block = readBlock("const loadLinkState = async () => {", "const toggleLike = async");
  assert.ok(block.includes("const publishedAtStart = cyPublishedCount;"), "the request must snapshot the publish count");
  assert.ok(
    block.includes("const publishedDuringRequest = cyPublishedCount - publishedAtStart;"),
    "the response must add publishes that happened after the request started",
  );
  assert.ok(
    block.includes("linkState = addPublishedCy(page.link, publishedDuringRequest);"),
    "the resolved link state must include the publish delta",
  );
  assert.ok(
    block.includes("if (publishedDuringRequest > 0) clearRailPageCache(targetId);"),
    "a raced response must drop its stale cache entry",
  );
  assert.ok(block.includes("syncActionStates();"), "the badge must refresh after the delta is applied");
});

function isCyComment(comment) {
  return Boolean(comment) && (comment.is_cy === 1 || comment.is_cy === true || comment.is_cy === "1");
}

test("countCyInGroups counts nested CY comments", () => {
  const countStart = source.indexOf("function countCyInGroups(");
  const countEnd = source.indexOf("async function fetchRailPage(", countStart);
  assert.ok(countStart >= 0 && countEnd > countStart, "Missing CY counting block");
  const factory = new Function(
    "isCyComment",
    "\"use strict\";\n"
      + source.slice(countStart, countEnd)
      + "\nreturn { countCyInGroups, readCyCount };",
  );
  const { countCyInGroups, readCyCount } = factory(isCyComment);
  const groups = [
    { comment: [{ is_cy: 1, id: "a" }, { is_cy: "1", id: "b" }] },
    { comment: [{ is_cy: 0, id: "c" }, { is_cy: true, id: "d" }] },
  ];
  assert.equal(countCyInGroups(groups), 3);
  assert.equal(countCyInGroups([]), 0);
  assert.equal(countCyInGroups(undefined), 0);
  assert.equal(readCyCount({}, groups), 3);
  assert.equal(readCyCount({ cy_num: 12 }, groups), 12);
  assert.equal(readCyCount({ cy_count: "0" }, groups), 0);
});
