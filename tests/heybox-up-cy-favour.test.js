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
