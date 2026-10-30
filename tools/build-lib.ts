import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build, type BuildResult } from "esbuild";
import {
  parseUserscriptMeta,
  renderUserscriptHeader,
  type UserscriptMeta,
} from "../shared/userscript/meta";

export interface BuildArguments {
  readonly all: boolean;
  readonly watch: boolean;
  readonly targets: readonly string[];
}

export interface ScriptTarget {
  readonly name: string;
  readonly directory: string;
  readonly metaFile: string;
  readonly entryFile: string;
}

export interface BuiltScript {
  readonly target: ScriptTarget;
  readonly outputPath: string;
  readonly source: string;
}

const SCRIPT_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseBuildArguments(args: readonly string[]): BuildArguments {
  let all = false;
  let watch = false;
  const targets: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) continue;
    // `pnpm build -- --target=x` forwards the separator itself, so ignore it.
    if (argument === "--") continue;
    if (argument === "--all") {
      all = true;
      continue;
    }
    if (argument === "--watch") {
      watch = true;
      continue;
    }
    if (argument === "--target") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("--target requires a script name");
      }
      targets.push(value);
      index += 1;
      continue;
    }
    if (argument.startsWith("--target=")) {
      const value = argument.slice("--target=".length);
      if (value.length === 0) throw new Error("--target requires a script name");
      targets.push(value);
      continue;
    }
    throw new Error(`Unknown build argument: ${argument}`);
  }
  if (all && targets.length > 0) {
    throw new Error("Use either --all or --target=<script-name>, not both");
  }
  if (!all && targets.length === 0) all = true;
  const uniqueTargets = [...new Set(targets)];
  for (const target of uniqueTargets) {
    if (!SCRIPT_NAME_PATTERN.test(target)) {
      throw new Error(`Invalid script name: ${target}`);
    }
  }
  return { all, watch, targets: uniqueTargets };
}

export async function discoverScripts(rootDirectory: string): Promise<ScriptTarget[]> {
  const scriptsRoot = path.join(rootDirectory, "scripts");
  const entries = await readdir(scriptsRoot, { withFileTypes: true });
  const discovered: ScriptTarget[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!SCRIPT_NAME_PATTERN.test(entry.name)) continue;
    const directory = path.join(scriptsRoot, entry.name);
    const metaFile = path.join(directory, "meta.ts");
    const entryFile = path.join(directory, "src", "index.ts");
    try {
      await Promise.all([readFile(metaFile, "utf8"), readFile(entryFile, "utf8")]);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
      throw error;
    }
    discovered.push({ name: entry.name, directory, metaFile, entryFile });
  }
  discovered.sort((left, right) => left.name.localeCompare(right.name, "en"));
  if (discovered.length === 0) {
    throw new Error("No script workspaces were found under scripts/");
  }
  return discovered;
}

export function selectTargets(
  discovered: readonly ScriptTarget[],
  requested: readonly string[],
): ScriptTarget[] {
  if (requested.length === 0) return [...discovered];
  const byName = new Map(discovered.map((target) => [target.name, target]));
  return requested.map((name) => {
    const target = byName.get(name);
    if (target === undefined) {
      const available = discovered.map((entry) => entry.name).join(", ");
      throw new Error(`Unknown script target "${name}". Available targets: ${available}`);
    }
    return target;
  });
}

export async function loadScriptMeta(target: ScriptTarget, cacheVersion: number): Promise<UserscriptMeta> {
  const moduleUrl = `${pathToFileURL(target.metaFile).href}?build=${cacheVersion}`;
  const loaded: unknown = await import(moduleUrl);
  if (typeof loaded !== "object" || loaded === null || !("default" in loaded)) {
    throw new Error(`${target.metaFile} must default-export its metadata object`);
  }
  return parseUserscriptMeta(loaded.default);
}

export async function bundleScript(target: ScriptTarget): Promise<BuildResult> {
  return build({
    entryPoints: [target.entryFile],
    outfile: path.join(path.dirname(path.dirname(target.directory)), "dist", `${target.name}.user.js`),
    absWorkingDir: path.dirname(path.dirname(target.directory)),
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: ["es2020"],
    charset: "utf8",
    legalComments: "none",
    logLevel: "silent",
    metafile: true,
  });
}

function findJavaScriptOutput(result: BuildResult): { code: string; imports: number } {
  const files = result.outputFiles;
  if (files === undefined) {
    throw new Error("esbuild returned no output files");
  }
  const outputs = Object.entries(result.metafile?.outputs ?? {});
  for (const [fileName, output] of outputs) {
    if (!fileName.endsWith(".js")) continue;
    const expectedName = path.basename(fileName);
    const file = files.find((candidate) => path.basename(candidate.path) === expectedName);
    if (file === undefined) continue;
    return { code: file.text, imports: output.imports.length };
  }
  throw new Error("esbuild produced no JavaScript output");
}

export async function compileScript(target: ScriptTarget, meta: UserscriptMeta, header: string): Promise<BuiltScript> {
  const result = await bundleScript(target);
  const output = findJavaScriptOutput(result);
  if (output.imports > 0) {
    throw new Error(`${target.name} contains external imports; userscript output must be self-contained`);
  }
  const outputPath = path.join(path.dirname(path.dirname(target.directory)), "dist", `${target.name}.user.js`);
  const trailer = output.code.endsWith("\n") ? output.code : `${output.code}\n`;
  return { target, outputPath, source: `${header}\n${trailer}` };
}
