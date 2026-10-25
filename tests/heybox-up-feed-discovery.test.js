import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../scripts/heybox-up.js", import.meta.url), "utf8");

function readConstant(name) {
  const match = new RegExp('const ' + name + ' = "([^"]+)";').exec(source);
  assert.ok(match, "Missing constant: " + name);
  return match[1];
}

function loadFeedDiscoveryFactory() {
  const startMarker = "// ==feed-discovery:start==";
  const endMarker = "// ==feed-discovery:end==";
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  assert.ok(start >= 0 && end > start, "Missing feed discovery markers");
  const helperSource = source.slice(start + startMarker.length, end);
  return new Function(
    "FEED_DISCOVERY_API_PATH",
    "createApiParams",
    "getHeyboxId",
    "fetchWithTimeout",
    "isAbortError",
    '"use strict";\n'
      + helperSource
      + "\nreturn { normalizeFeedCandidate, mergeFeedCandidateMetadata, mergeFeedOrder, mergeRecentMetadata,"
      + " mergeFeedSeen, mergeFeedQueue, scoreFeedCandidate, rankFeedCandidates, selectNextFeedCandidate,"
      + " normalizeFeedDiscoveryLinks, buildFeedDiscoveryUrl, readFeedDiscoveryResponse, requestFeedDiscoveryPage,"
      + " hasDiscoverableNext };",
  );
}

function isAbortError(error) {
  return error instanceof DOMException && error.name === "AbortError";
}

function createHelpers(options = {}) {
  return loadFeedDiscoveryFactory()(
    readConstant("FEED_DISCOVERY_API_PATH"),
    options.createApiParams || (() => ({ hkey: "fixture-signature" })),
    options.getHeyboxId || (() => "fixture-user"),
    options.fetchWithTimeout || (async () => {
      throw new Error("Unexpected fetch");
    }),
    isAbortError,
  );
}

function link(id, extra = {}) {
  return {
    linkid: id,
    content_type: 1,
    title: "Fixture " + id,
    userid: "author-" + id,
    username: "Author " + id,
    ...extra,
  };
}

test("feed discovery excludes promoted entries and invalid ids", () => {
  const helpers = createHelpers();
  const candidate = helpers.normalizeFeedCandidate(link(1001));
  assert.deepEqual(candidate, {
    id: "1001",
    title: "Fixture 1001",
    authorId: "author-1001",
    author: "Author 1001",
    topicIds: [],
    topics: [],
  });
  assert.equal(helpers.normalizeFeedCandidate(link("1002", { content_type: 18 })), null);
  assert.equal(helpers.normalizeFeedCandidate(link("1002", { content_type: "18" })), null);
  assert.equal(helpers.normalizeFeedCandidate({ linkid: "0", title: "Invalid" }), null);
  assert.equal(helpers.normalizeFeedCandidate({ linkid: "not-an-id", title: "Invalid" }), null);
  assert.equal(helpers.normalizeFeedCandidate(null), null);
});

test("feed metadata normalizes nested topics and author fields", () => {
  const helpers = createHelpers();
  const candidate = helpers.normalizeFeedCandidate(link("2001", {
    userid: undefined,
    username: undefined,
    user: { userid: 77, nickname: "Nested Author" },
    topics: [{ topic_id: 11, name: "Guide" }, "12", "Console"],
    topicIds: [13, "11"],
    topicsText: ["Console", "Hardware"],
  }));
  assert.equal(candidate.authorId, "77");
  assert.equal(candidate.author, "Nested Author");
  assert.deepEqual(candidate.topicIds, ["11", "12", "13"]);
  assert.deepEqual(candidate.topics, ["Guide", "Console", "Hardware"]);
});

test("feed order merges legacy ids without reordering existing entries", () => {
  const helpers = createHelpers();
  const merged = helpers.mergeFeedOrder(
    ["1001", { id: "1002", title: "Second", authorId: "2" }],
    [{ id: "1001", title: "First", topicIds: ["9"] }, { id: "1002", title: "Second" }, { id: "1003", title: "Third" }],
  );
  assert.deepEqual(merged.map((item) => item.id), ["1001", "1002", "1003"]);
  assert.equal(merged[0].title, "First");
  assert.deepEqual(merged[0].topicIds, ["9"]);
  assert.equal(merged[1].authorId, "2");
});

test("feed queue filters current, visited and seen entries while merging metadata", () => {
  const helpers = createHelpers();
  const queue = helpers.mergeFeedQueue(
    [{ id: "1001", title: "One" }, { id: "1002", title: "Two" }],
    [{ id: "1002", topicIds: ["4"] }, { id: "1003" }, { id: "1004" }, { id: "1005" }],
    { currentId: "1003", visited: new Set(["1001"]), seen: new Set(["1004"]), max: 3 },
  );
  assert.deepEqual(queue.map((item) => item.id), ["1002", "1005"]);
  assert.deepEqual(queue[0].topicIds, ["4"]);
});

test("feed caps keep the newest queue, seen and recent entries", () => {
  const helpers = createHelpers();
  assert.deepEqual(helpers.mergeFeedSeen(["1", "2", "3"], ["2", "4"], 3), ["2", "3", "4"]);
  assert.deepEqual(helpers.mergeFeedQueue([], ["1", "2", "3"], { max: 2 }).map((item) => item.id), ["1", "2"]);
  const recent = helpers.mergeRecentMetadata(
    [{ id: "1", title: "Old" }, { id: "2", title: "Older" }],
    { id: "3", title: "New" },
    2,
  );
  assert.deepEqual(recent.map((item) => item.id), ["3", "1"]);
});

test("recent metadata deduplicates and preserves richer fields", () => {
  const helpers = createHelpers();
  const recent = helpers.mergeRecentMetadata(
    [{ id: "1", title: "Title", authorId: "7", author: "Seven", topicIds: ["2"], topics: ["PC"] }],
    [{ id: "1", title: "Title" }],
    12,
  );
  assert.equal(recent.length, 1);
  assert.equal(recent[0].authorId, "7");
  assert.deepEqual(recent[0].topicIds, ["2"]);
});

test("ranking prefers a different author and topic with stable ties", () => {
  const helpers = createHelpers();
  const recent = [{ id: "1", authorId: "7", author: "Seven", topicIds: ["2"], topics: ["PC"] }];
  const ranked = helpers.rankFeedCandidates(
    [
      { id: "2", authorId: "7", author: "Seven", topicIds: [], topics: [] },
      { id: "3", authorId: "8", author: "Eight", topicIds: ["2"], topics: [] },
      { id: "4", authorId: "9", author: "Nine", topicIds: ["3"], topics: ["Console"] },
      { id: "5", authorId: "10", author: "Ten", topicIds: ["4"], topics: ["Mobile"] },
      { id: "4", authorId: "9", author: "Nine", topicIds: ["3"], topics: ["Console"] },
    ],
    recent,
  );
  assert.deepEqual(ranked.map((item) => item.id), ["4", "5", "3", "2"]);
});

test("next selection uses feed, then queue, then related", () => {
  const helpers = createHelpers();
  const feedOrder = [{ id: "1" }, { id: "2", authorId: "7" }, { id: "3", authorId: "8" }, { id: "4", authorId: "9" }];
  const feed = helpers.selectNextFeedCandidate({
    currentId: "1",
    recent: [{ id: "1", authorId: "7" }],
    feedOrder: feedOrder,
    queue: [{ id: "5" }],
    related: [{ id: "6" }],
    visited: new Set(["1"]),
    seen: new Set(["1"]),
  });
  assert.equal(feed.source, "feed");
  assert.equal(feed.candidate.id, "3");

  const queued = helpers.selectNextFeedCandidate({
    currentId: "1",
    recent: [],
    feedOrder: [{ id: "1" }],
    queue: [{ id: "5" }],
    related: [{ id: "6" }],
    visited: new Set(["1"]),
    seen: new Set(["1"]),
  });
  assert.equal(queued.source, "queue");
  assert.equal(queued.candidate.id, "5");

  const legacyFeed = helpers.selectNextFeedCandidate({
    currentId: "1",
    recent: [],
    feedOrder: ["1", "7", { id: "8" }],
    queue: [],
    related: [],
    visited: new Set(["1"]),
    seen: new Set(["1"]),
  });
  assert.equal(legacyFeed.source, "feed");
  assert.equal(legacyFeed.candidate.id, "7");

  const related = helpers.selectNextFeedCandidate({
    currentId: "1",
    recent: [],
    feedOrder: [{ id: "1" }],
    queue: [{ id: "5" }],
    related: [{ id: "6" }],
    visited: new Set(["1", "5"]),
    seen: new Set(["1", "5"]),
  });
  assert.equal(related.source, "related");
  assert.equal(related.candidate.id, "6");
  assert.equal(helpers.selectNextFeedCandidate({ currentId: "1", feedOrder: [{ id: "1" }] }), null);
});

test("discovery url carries the site feed query and skips empty extras", () => {
  const helpers = createHelpers();
  const url = new URL(helpers.buildFeedDiscoveryUrl(30, {
    hkey: "signature",
    heybox_id: "42",
    empty: "",
    missing: null,
    dw: 700,
  }));
  assert.equal(url.origin + url.pathname, "https://api.xiaoheihe.cn/bbs/app/feeds");
  assert.equal(url.searchParams.get("pull"), "0");
  assert.equal(url.searchParams.get("offset"), "30");
  assert.equal(url.searchParams.get("dw"), "700");
  assert.equal(url.searchParams.get("hkey"), "signature");
  assert.equal(url.searchParams.get("heybox_id"), "42");
  assert.equal(url.searchParams.has("empty"), false);
  assert.equal(url.searchParams.has("missing"), false);
  assert.equal(new URL(helpers.buildFeedDiscoveryUrl(-1, {})).searchParams.get("offset"), "0");
});

test("feed response normalization distinguishes success, login and empty pages", () => {
  const helpers = createHelpers();
  const success = helpers.readFeedDiscoveryResponse({
    status: "ok",
    result: { links: [link("1001"), link("1002", { content_type: 18 }), link("1003")] },
  });
  assert.equal(success.ok, true);
  assert.deepEqual(success.links.map((item) => item.id), ["1001", "1003"]);

  const login = helpers.readFeedDiscoveryResponse({ status: "login" });
  assert.equal(login.ok, false);
  assert.match(login.message, /登录/);

  const failure = helpers.readFeedDiscoveryResponse({ status: "error", msg: "denied" });
  assert.equal(failure.ok, false);
  assert.equal(failure.message, "denied");

  const empty = helpers.readFeedDiscoveryResponse({ status: "ok", result: { links: [] } });
  assert.equal(empty.ok, false);
  assert.match(empty.message, /没有发现更多文章/);

  const malformed = helpers.readFeedDiscoveryResponse({ status: "ok", result: { links: null } });
  assert.equal(malformed.ok, false);
});

test("discovery requests the signed url and falls back to the public query", async () => {
  const requests = [];
  const helpers = createHelpers({
    fetchWithTimeout: async (url, options) => {
      requests.push({ url: url, options: options });
      if (requests.length === 1) return { ok: false, status: 403, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ status: "ok", result: { links: [link("1001")] } }) };
    },
  });
  const page = await helpers.requestFeedDiscoveryPage(60, new AbortController().signal);
  assert.equal(page.ok, true);
  assert.equal(page.links[0].id, "1001");
  assert.equal(requests.length, 2);
  assert.equal(new URL(requests[0].url).searchParams.get("hkey"), "fixture-signature");
  assert.equal(new URL(requests[1].url).searchParams.has("hkey"), false);
  assert.equal(new URL(requests[1].url).searchParams.get("offset"), "60");
  assert.equal(new URL(requests[1].url).searchParams.get("heybox_id"), "fixture-user");
});

test("discovery skips the signed attempt when signing fails and reports transport errors", async () => {
  const requests = [];
  const helpers = createHelpers({
    createApiParams: () => {
      throw new Error("signing unavailable");
    },
    fetchWithTimeout: async (url) => {
      requests.push(url);
      throw new Error("offline");
    },
  });
  const page = await helpers.requestFeedDiscoveryPage(0, new AbortController().signal);
  assert.equal(page.ok, false);
  assert.match(page.message, /网络异常/);
  assert.equal(requests.length, 1);
  assert.equal(new URL(requests[0]).searchParams.has("hkey"), false);
});

test("discovery retries the public query when the signed response is not ok", async () => {
  const requests = [];
  const helpers = createHelpers({
    fetchWithTimeout: async (url) => {
      requests.push(url);
      if (requests.length === 1) return { ok: true, status: 200, json: async () => ({ status: "error", msg: "denied" }) };
      return { ok: true, status: 200, json: async () => ({ status: "ok", result: { links: [link("1001")] } }) };
    },
  });
  const page = await helpers.requestFeedDiscoveryPage(0, new AbortController().signal);
  assert.equal(page.ok, true);
  assert.equal(page.links[0].id, "1001");
  assert.equal(requests.length, 2);
  assert.equal(new URL(requests[0]).searchParams.has("hkey"), true);
  assert.equal(new URL(requests[1]).searchParams.has("hkey"), false);
});

test("discovery treats a signed login failure as terminal", async () => {
  const requests = [];
  const helpers = createHelpers({
    fetchWithTimeout: async (url) => {
      requests.push(url);
      return { ok: true, status: 200, json: async () => ({ status: "login" }) };
    },
  });
  const page = await helpers.requestFeedDiscoveryPage(0, new AbortController().signal);
  assert.equal(page.ok, false);
  assert.match(page.message, /登录/);
  assert.equal(requests.length, 1);
});

test("discovery stops only when the next candidate comes from feed or queue", () => {
  const helpers = createHelpers();
  assert.equal(helpers.hasDiscoverableNext({ next: { id: "2", source: "related" } }), false);
  assert.equal(helpers.hasDiscoverableNext({ next: { id: "2", source: "feed" } }), true);
  assert.equal(helpers.hasDiscoverableNext({ next: { id: "2", source: "queue" } }), true);
  assert.equal(helpers.hasDiscoverableNext({ next: null }), false);
  assert.equal(helpers.hasDiscoverableNext(null), false);
});

test("discovery rethrows abort errors instead of treating them as failures", async () => {
  const helpers = createHelpers({
    fetchWithTimeout: async () => {
      throw new DOMException("cancelled", "AbortError");
    },
  });
  await assert.rejects(
    helpers.requestFeedDiscoveryPage(0, new AbortController().signal),
    (error) => isAbortError(error),
  );
});
