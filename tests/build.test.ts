import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  compileScript,
  discoverScripts,
  parseBuildArguments,
  selectTargets,
} from "../tools/build-lib";
import { renderUserscriptHeader, type UserscriptMeta } from "../shared/userscript/meta";

const temporaryRoots: string[] = [];

async function createFixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "yoko-build-"));
  temporaryRoots.push(root);
  const scriptRoot = path.join(root, "scripts", "demo");
  await mkdir(path.join(scriptRoot, "src"), { recursive: true });
  await writeFile(
    path.join(scriptRoot, "meta.ts"),
    `export default { name: "Demo", namespace: "https://example.com/", version: "1.0.0", description: "Demo", author: "Yoko", match: ["https://example.com/*"], grant: ["none"] } satisfies import("../../shared/userscript/meta").UserscriptMeta;\n`,
    "utf8",
  );
  await writeFile(path.join(scriptRoot, "src", "index.ts"), "const value: number = 1;\nconsole.log(value);\n", "utf8");
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("parseBuildArguments", () => {
  it("defaults to all targets", () => {
    expect(parseBuildArguments([])).toEqual({ all: true, watch: false, targets: [] });
  });

  it("accepts both target forms, deduplicates, and recognizes watch", () => {
    expect(parseBuildArguments(["--target=one", "--target", "two", "--target=one", "--watch"])).toEqual({
      all: false,
      watch: true,
      targets: ["one", "two"],
    });
  });

  it("rejects ambiguous or malformed arguments", () => {
    expect(() => parseBuildArguments(["--all", "--target=one"])).toThrow(/either/);
    expect(() => parseBuildArguments(["--target"])).toThrow(/requires/);
    expect(() => parseBuildArguments(["--target=Bad_Name"])).toThrow(/Invalid/);
    expect(() => parseBuildArguments(["--unknown"])).toThrow(/Unknown/);
  });
});

describe("script discovery and compilation", () => {
  it("finds only complete script workspaces", async () => {
    const root = await createFixture();
    await mkdir(path.join(root, "scripts", "incomplete", "src"), { recursive: true });
    await writeFile(path.join(root, "scripts", "incomplete", "meta.ts"), "export default {};\n", "utf8");
    const targets = await discoverScripts(root);
    expect(targets.map((target) => target.name)).toEqual(["demo"]);
  });

  it("produces a self-contained userscript with the rendered header", async () => {
    const root = await createFixture();
    const targets = await discoverScripts(root);
    const target = targets[0];
    if (target === undefined) throw new Error("fixture target missing");
    const meta: UserscriptMeta = {
      name: "Demo",
      namespace: "https://example.com/",
      version: "1.0.0",
      description: "Demo",
      author: "Yoko",
      match: ["https://example.com/*"],
      grant: ["none"],
    };
    const built = await compileScript(target, meta, renderUserscriptHeader(meta));
    expect(built.source).toContain("// @name         Demo");
    expect(built.source).toContain("console.log(value)");
    expect(built.source).not.toMatch(/^\s*import /m);
    expect(built.outputPath).toBe(path.join(root, "dist", "demo.user.js"));
  });

  it("rejects unknown targets instead of silently building everything", async () => {
    const root = await createFixture();
    const targets = await discoverScripts(root);
    expect(() => selectTargets(targets, ["missing"])).toThrow(/Unknown script target/);
  });
});
