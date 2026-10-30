import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderUserscriptHeader } from "../shared/userscript/meta";
import {
  compileScript,
  discoverScripts,
  loadScriptMeta,
  parseBuildArguments,
  selectTargets,
  type BuildArguments,
  type ScriptTarget,
} from "./build-lib";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let cacheVersion = Date.now();

async function buildTargets(targets: readonly ScriptTarget[], announce: boolean): Promise<void> {
  for (const target of targets) {
    const meta = await loadScriptMeta(target, cacheVersion);
    const header = renderUserscriptHeader(meta);
    const built = await compileScript(target, meta, header);
    await mkdir(path.dirname(built.outputPath), { recursive: true });
    await writeFile(built.outputPath, built.source, "utf8");
    if (announce) {
      process.stdout.write(`${target.name} -> ${path.relative(rootDirectory, built.outputPath)}\n`);
    }
  }
}

async function resolveTargets(arguments_: BuildArguments): Promise<ScriptTarget[]> {
  const discovered = await discoverScripts(rootDirectory);
  return selectTargets(discovered, arguments_.all ? [] : arguments_.targets);
}

async function run(arguments_: BuildArguments): Promise<void> {
  const targets = await resolveTargets(arguments_);
  await buildTargets(targets, true);
  if (!arguments_.watch) return;

  process.stdout.write("Watching scripts/ and shared/ for changes. Press Ctrl+C to stop.\n");
  const watchedRoots = [path.join(rootDirectory, "scripts"), path.join(rootDirectory, "shared")];
  const { watch } = await import("node:fs");
  let timer: ReturnType<typeof setTimeout> | null = null;
  let building = false;
  let rebuildQueued = false;
  const rebuild = async (): Promise<void> => {
    if (building) {
      rebuildQueued = true;
      return;
    }
    building = true;
    cacheVersion += 1;
    try {
      const current = await resolveTargets(arguments_);
      await buildTargets(current, true);
      process.stdout.write(`Rebuilt at ${new Date().toISOString()}\n`);
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    } finally {
      building = false;
      if (rebuildQueued) {
        rebuildQueued = false;
        await rebuild();
      }
    }
  };
  for (const watchedRoot of watchedRoots) {
    watch(watchedRoot, { recursive: true }, () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void rebuild();
      }, 80);
    });
  }
}

async function main(): Promise<void> {
  try {
    await run(parseBuildArguments(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

void main();
