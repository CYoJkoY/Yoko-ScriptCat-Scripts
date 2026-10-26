import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";

const source = readFileSync(new URL("../scripts/heybox-up.js", import.meta.url), "utf8");

function readBlock(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, "Missing block: " + startMarker);
  return source.slice(start, end);
}

test("favour mutation region tracks the real page root", () => {
  const regionBlock = readBlock("const PAGE_MUTATION_REGION_SELECTORS = {", "};").trim();
  const favourLine = regionBlock.split("\n").find((line) => line.trimStart().startsWith("favour:"));
  assert.ok(favourLine, "Missing favour mutation region");
  assert.ok(favourLine.includes("#page-user-favour"), "favour region must track #page-user-favour");
  assert.ok(favourLine.includes(".user-favour"), "favour region must retain the .user-favour fallback");
});

test("favour watcher uses the shared optional-trailing-slash route rule", () => {
  const watchBlock = readBlock("function watchFavourPage()", "const RAIL_ID");
  assert.ok(
    watchBlock.includes("readPageRoute() !== PAGE_ROUTE.FAVOUR"),
    "watchFavourPage must use readPageRoute",
  );
  assert.equal(watchBlock.includes("FAVOUR_PATH"), false, "watchFavourPage must not use the exact path constant");
  assert.equal(source.includes("const FAVOUR_PATH"), false, "FAVOUR_PATH must be removed once unused");
});

test("favour route rule accepts a trailing slash", () => {
  const routeBlock = readBlock("const PAGE_ROUTE_RULES = [", "];");
  assert.ok(
    routeBlock.includes("/^\\/app\\/user\\/favour\\/content(?:\\/|$)/"),
    "favour route rule must keep its optional trailing slash",
  );
});

const FAVOUR_PAGE_HTML = [
  '<!doctype html><html><head></head><body>',
  '<div id="page-user-favour"><div class="content"><div class="list"></div></div></div>',
  '</body></html>',
].join("");

const MOUNT_TIMEOUT_MS = 4000;

// Both URL forms the shared route rule accepts: the canonical path and its trailing slash variant.
const FAVOUR_PATHS = ["/app/user/favour/content", "/app/user/favour/content/"];

function createFavourPage(pathname) {
  const domErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => domErrors.push(error));
  const dom = new JSDOM(FAVOUR_PAGE_HTML, {
    url: "https://www.xiaoheihe.cn" + pathname,
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: virtualConsole,
  });
  const { window } = dom;
  window.matchMedia = () => ({
    matches: false,
    media: "",
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
  window.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ status: "ok", result: [], no_more: true }),
  });
  window.document.cookie = "heybox_id=42; path=/";
  return { dom, window, domErrors };
}

async function waitFor(predicate) {
  const deadline = Date.now() + MOUNT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return predicate();
}

for (const pathname of FAVOUR_PATHS) {
  test(`favour watcher mounts the CY section when the native list appears late (${pathname})`, async () => {
    const { dom, window, domErrors } = createFavourPage(pathname);
    try {
      const { document } = window;
      // The userscript boots on DOMContentLoaded because it runs at document-start.
      window.eval(source);
      const booted = await waitFor(() => document.readyState === "complete");
      assert.equal(booted, true, "the userscript never finished booting");
      assert.deepEqual(
        domErrors.map((error) => error.message),
        [],
        "the favourites page raised DOM errors while the userscript booted",
      );

      // The initial sync runs before the native list exists, so nothing may mount yet.
      assert.equal(document.getElementById("heybox-up-favour"), null);

      const list = document.createElement("div");
      list.className = "user-favour__list";
      document.querySelector("#page-user-favour .content .list").append(list);

      // Mounting must come from the observed mutation, not from the insertion call itself.
      assert.equal(document.getElementById("heybox-up-favour"), null);

      const host = await waitFor(() => document.getElementById("heybox-up-favour"));
      assert.ok(host, "asynchronously inserted favourites list never triggered a mount");
      assert.equal(host.parentElement, list.parentElement);
      assert.equal(host.previousElementSibling, list, "CY section must follow the native list");
      assert.equal(host.shadowRoot.querySelector(".heading").textContent, "插眼收藏");
    } finally {
      dom.window.close();
    }
  });
}

function readCyCards(host) {
  return Array.from(host.shadowRoot.querySelectorAll(".list .card"));
}

function findCyCard(host, id) {
  return readCyCards(host).find((card) => card.getAttribute("href") === "/app/bbs/link/" + id) || null;
}

function createCyRecord(id, text) {
  return {
    comment_type: 0,
    create_at: 1761552000,
    text,
    link: { id: String(id), title: "Fixture post " + id, thumbs: [] },
  };
}

function stubCyRecords(window, records) {
  window.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ status: "ok", result: records, no_more: true }),
  });
}

async function mountFavourSection(window, document) {
  const list = document.createElement("div");
  list.className = "user-favour__list";
  document.querySelector("#page-user-favour .content .list").append(list);
  const host = await waitFor(() => document.getElementById("heybox-up-favour"));
  assert.ok(host, "the CY section never mounted");
  return { host, list };
}

test("CY records render even when the native list already shows the same post", async () => {
  const { dom, window, domErrors } = createFavourPage(FAVOUR_PATHS[0]);
  stubCyRecords(window, [createCyRecord("777", "fixture cy text")]);
  try {
    const { document } = window;
    window.eval(source);
    const booted = await waitFor(() => document.readyState === "complete");
    assert.equal(booted, true, "the userscript never finished booting");

    // The native favourites list holds an entry for the same post that carries the CY record.
    const nativeList = document.createElement("div");
    nativeList.className = "user-favour__list";
    const nativeCard = document.createElement("a");
    nativeCard.setAttribute("href", "/app/bbs/link/777");
    nativeList.append(nativeCard);
    document.querySelector("#page-user-favour .content .list").append(nativeList);

    const host = await waitFor(() => document.getElementById("heybox-up-favour"));
    assert.ok(host, "the CY section never mounted");
    const card = await waitFor(() => findCyCard(host, "777"));
    assert.ok(card, "a CY record must render even when the native list holds the same post id");
    assert.ok(card.textContent.includes("fixture cy text"), "the CY card must keep its own excerpt");
    assert.deepEqual(domErrors.map((error) => error.message), []);
  } finally {
    dom.window.close();
  }
});

test("duplicate CY records for one post render a single card", async () => {
  const { dom, window, domErrors } = createFavourPage(FAVOUR_PATHS[0]);
  stubCyRecords(window, [createCyRecord("888", "first"), createCyRecord("888", "second"), createCyRecord("999", "third")]);
  try {
    const { document } = window;
    window.eval(source);
    await waitFor(() => document.readyState === "complete");
    const { host } = await mountFavourSection(window, document);
    const cards = await waitFor(() => {
      const rendered = readCyCards(host);
      return rendered.length >= 2 ? rendered : null;
    });
    assert.ok(cards, "the CY cards never rendered");
    assert.equal(cards.length, 2, "each post must render one CY card");
    assert.ok(findCyCard(host, "888"), "post 888 must render");
    assert.ok(findCyCard(host, "999"), "post 999 must render");
    assert.deepEqual(domErrors.map((error) => error.message), []);
  } finally {
    dom.window.close();
  }
});
