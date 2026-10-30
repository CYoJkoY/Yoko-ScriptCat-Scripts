import { describe, expect, it } from "vitest";
import { inspectBundle } from "../tools/verify-bundles";

const header = [
  "// ==UserScript==",
  "// @name        Demo",
  "// @namespace   https://example.com/",
  "// @version     1.0.0",
  "// @match       https://example.com/*",
  "// @run-at      document-start",
  "// @grant       none",
  "// ==/UserScript==",
  "",
].join("\n");

describe("inspectBundle", () => {
  it("accepts a self-contained bundle with a closed header", () => {
    const report = inspectBundle("demo.user.js", header + "(function () {\n  console.log(1);\n})();\n");
    expect(report.problems).toEqual([]);
    expect(report.headerLines).toBe(8);
  });

  it("reports missing metadata fields", () => {
    const report = inspectBundle("demo.user.js", "// ==UserScript==\n// @name Demo\n// ==/UserScript==\n\nvoid 0;\n");
    expect(report.problems).toEqual([
      "header is missing @namespace",
      "header is missing @version",
      "header is missing @match",
      "header is missing @run-at",
      "header is missing @grant",
    ]);
  });

  it("rejects an unclosed header and module syntax", () => {
    const broken = [
      "// ==UserScript==",
      "// @name Demo",
      "const value = require(\"fs\");",
      "import { x } from \"./x\";",
    ].join("\n");
    const report = inspectBundle("demo.user.js", broken);
    expect(report.problems).toContain("has no closing header marker");
    expect(report.problems).toContain("contains a CommonJS require call");
    expect(report.problems).toContain("contains an ES import statement");
    expect(report.problems).toContain("does not end with a newline");
  });

  it("allows the words import and require inside strings or comments", () => {
    const body = header + "const text = \"import { x } from\\\"y\\\"\";\n// require( and import stay inside comments\n";
    const report = inspectBundle("demo.user.js", body);
    expect(report.problems).toEqual([]);
  });
});

