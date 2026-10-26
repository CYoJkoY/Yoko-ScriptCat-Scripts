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

function createFavourPage() {
  const domErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => domErrors.push(error));
  const dom = new JSDOM(FAVOUR_PAGE_HTML, {
    url: "https://www.xiaoheihe.cn/app/user/favour/content",
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

test("favour watcher mounts the CY section when the native list appears late", async () => {
  const { dom, window, domErrors } = createFavourPage();
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
