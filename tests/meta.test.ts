import { describe, expect, it } from "vitest";
import { parseUserscriptMeta, renderUserscriptHeader, type UserscriptMeta } from "../shared/userscript/meta";

const baseMeta: UserscriptMeta = {
  name: "Example",
  namespace: "https://example.com/",
  version: "1.2.3",
  description: "Example script",
  author: "Yoko",
  match: ["https://example.com/*"],
  grant: ["none"],
  runAt: "document-start",
  noframes: true,
  license: "MIT",
};

describe("renderUserscriptHeader", () => {
  it("renders fields in a stable order with one trailing newline", () => {
    const header = renderUserscriptHeader(baseMeta);
    expect(header.startsWith("// ==UserScript==\n")).toBe(true);
    expect(header.endsWith("// ==/UserScript==\n")).toBe(true);
    expect(header.indexOf("@name")).toBeLessThan(header.indexOf("@namespace"));
    expect(header.indexOf("@updateURL")).toBeLessThan(header.indexOf("@match"));
    expect(header.indexOf("@match")).toBeLessThan(header.indexOf("@run-at"));
    expect(header.indexOf("@grant")).toBeLessThan(header.indexOf("@noframes"));
    expect(header).toContain("// @grant        none\n");
  });

  it("rejects malformed or unsafe metadata", () => {
    expect(() => renderUserscriptHeader({ ...baseMeta, version: "1.2" })).toThrow(/semantic version/);
    expect(() => renderUserscriptHeader({ ...baseMeta, name: "a\nb" })).toThrow(/one line/);
    expect(() => renderUserscriptHeader({ ...baseMeta, match: [] })).toThrow(/at least one/);
    expect(() => parseUserscriptMeta({ ...baseMeta, grant: ["GM_getValue\nGM_setValue"] })).toThrow(/grant/);
  });
});

describe("parseUserscriptMeta", () => {
  it("accepts a complete metadata object", () => {
    expect(parseUserscriptMeta(baseMeta)).toEqual(baseMeta);
  });

  it("rejects unknown shapes and invalid optional values", () => {
    expect(() => parseUserscriptMeta(null)).toThrow(/object/);
    expect(() => parseUserscriptMeta({ ...baseMeta, match: "https://example.com/*" })).toThrow(/match/);
    expect(() => parseUserscriptMeta({ ...baseMeta, noframes: "yes" })).toThrow(/noframes/);
    expect(() => parseUserscriptMeta({ ...baseMeta, runAt: "document-ready" })).toThrow(/runAt/);
  });
});
