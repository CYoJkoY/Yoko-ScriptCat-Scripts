import { readFile } from "node:fs/promises";
import { appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverScripts } from "./build-lib";

export interface TargetPlan {
  readonly mode: "full" | "targeted" | "none";
  readonly targets: readonly string[];
  readonly reason: string;
}

const GLOBAL_DIRECTORIES: readonly string[] = ["shared/", "tools/", "tests/", ".github/"];

const GLOBAL_FILES: readonly string[] = [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "tsconfig.base.json",
  "vitest.config.ts",
  ".npmrc",
  ".gitignore",
];

const SCRIPT_PATH = /^scripts\/([^/]+)\//;
const DIST_PATH = /^dist\/([^/]+)\.user\.js$/;

/** Normalize a repository-relative path so Windows and POSIX diffs compare equally. */
export function normalizeChangedPath(rawPath: string): string {
  let normalized = rawPath.trim().replace(/\\/gu, "/");
  while (normalized.startsWith("./")) normalized = normalized.slice(2);
  return normalized;
}

export function parseChangedPaths(contents: string): string[] {
  const seen = new Set<string>();
  for (const line of contents.split(/\r\n|\n|\r/u)) {
    const normalized = normalizeChangedPath(line);
    if (normalized.length === 0) continue;
    seen.add(normalized);
  }
  return [...seen];
}

function isGlobalChange(changedPath: string): boolean {
  if (GLOBAL_FILES.includes(changedPath)) return true;
  return GLOBAL_DIRECTORIES.some((directory) => changedPath.startsWith(directory));
}

/** Map a changed path to the workspace that owns it, or null when it owns none. */
function ownerOfPath(changedPath: string): string | null {
  const scriptMatch = SCRIPT_PATH.exec(changedPath);
  if (scriptMatch !== null) return scriptMatch[1] ?? null;
  // A committed bundle can be edited by hand or left stale; verify the workspace
  // that produced it so the regeneration check always runs.
  const distMatch = DIST_PATH.exec(changedPath);
  if (distMatch !== null) return distMatch[1] ?? null;
  return null;
}

function sortNames(names: Iterable<string>): string[] {
  return [...names].sort((left, right) => left.localeCompare(right, "en"));
}

/**
 * Decide which script workspaces need verification for a change set.
 * Shared tooling, the workflow itself, and empty diffs force a full run
 * because their blast radius covers every script.
 */
export function planVerification(
  changedPaths: readonly string[],
  discoveredNames: readonly string[],
): TargetPlan {
  const known = new Set(discoveredNames);
  const affected = new Set<string>();
  let globalChange: string | null = null;

  for (const changedPath of changedPaths) {
    if (isGlobalChange(changedPath)) {
      globalChange ??= changedPath;
      continue;
    }
    const name = ownerOfPath(changedPath);
    if (name === null) continue;
    if (!known.has(name)) {
      throw new Error(
        "Changed path \"" + changedPath + "\" belongs to script \"" + name +
          "\", but neither scripts/" + name + " nor dist/" + name + ".user.js has a discoverable workspace",
      );
    }
    affected.add(name);
  }

  if (globalChange !== null) {
    return { mode: "full", targets: sortNames(discoveredNames), reason: "shared change detected: " + globalChange };
  }
  if (changedPaths.length === 0) {
    return { mode: "full", targets: sortNames(discoveredNames), reason: "no changed paths were detected" };
  }
  if (affected.size === 0) {
    return { mode: "none", targets: [], reason: "no script workspace is affected" };
  }
  return {
    mode: "targeted",
    targets: sortNames(affected),
    reason: "affected workspaces: " + sortNames(affected).join(", "),
  };
}

interface CliArguments {
  readonly changedFile: string | null;
  readonly all: boolean;
}

function parseArguments(args: readonly string[]): CliArguments {
  let changedFile: string | null = null;
  let all = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) continue;
    if (argument === "--all") {
      all = true;
      continue;
    }
    if (argument === "--changed-file") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("--changed-file requires a path");
      }
      changedFile = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("--changed-file=")) {
      changedFile = argument.slice("--changed-file=".length);
      if (changedFile.length === 0) throw new Error("--changed-file requires a path");
      continue;
    }
    throw new Error("Unknown argument: " + argument);
  }
  return { changedFile, all };
}

async function writeOutputs(plan: TargetPlan): Promise<void> {
  const serialized = JSON.stringify(plan);
  const outputFile = process.env["GITHUB_OUTPUT"];
  if (outputFile === undefined || outputFile.length === 0) {
    process.stdout.write(serialized + "\n");
    return;
  }
  const lines = [
    "mode=" + plan.mode,
    "targets=" + JSON.stringify(plan.targets),
    "target_list=" + plan.targets.join(" "),
    "has_targets=" + (plan.targets.length > 0 ? "true" : "false"),
    "reason=" + plan.reason.replace(/\r?\n/gu, " "),
  ];
  await appendFile(outputFile, lines.join("\n") + "\n", "utf8");
  process.stdout.write(serialized + "\n");
}

async function main(): Promise<void> {
  const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const arguments_ = parseArguments(process.argv.slice(2));
  const discovered = await discoverScripts(rootDirectory);
  const discoveredNames = discovered.map((target) => target.name);
  if (arguments_.all) {
    await writeOutputs({ mode: "full", targets: discoveredNames, reason: "forced full verification" });
    return;
  }
  if (arguments_.changedFile === null) {
    throw new Error("Pass --changed-file <path> or --all");
  }
  const changedContents = await readFile(arguments_.changedFile, "utf8");
  const changedPaths = parseChangedPaths(changedContents);
  // Deleting a whole workspace removes every path under scripts/<name>/. Those
  // entries have no code left to check, so drop them instead of reporting an
  // undiscoverable workspace; a broken workspace that still exists still fails.
  const livePaths = changedPaths.filter((changedPath) => {
    const name = ownerOfPath(changedPath);
    if (name === null || discoveredNames.includes(name)) return true;
    return existsSync(path.join(rootDirectory, "scripts", name));
  });
  const removed = changedPaths.length - livePaths.length;
  if (removed > 0) {
    process.stdout.write("Ignoring " + removed + " path(s) from removed workspaces\n");
  }
  for (const name of removedWorkspaceNames(changedPaths, discoveredNames)) {
    if (existsSync(path.join(rootDirectory, "dist", name + ".user.js"))) {
      throw new Error(
        "scripts/" + name + " was removed but dist/" + name + ".user.js still exists; delete the stale bundle",
      );
    }
  }
  await writeOutputs(planVerification(livePaths, discoveredNames));
}

function removedWorkspaceNames(
  changedPaths: readonly string[],
  discoveredNames: readonly string[],
): string[] {
  const names = new Set<string>();
  for (const changedPath of changedPaths) {
    const name = ownerOfPath(changedPath);
    if (name === null || discoveredNames.includes(name)) continue;
    names.add(name);
  }
  return [...names];
}

function isDirectInvocation(): boolean {
  const invoked = process.argv[1];
  if (invoked === undefined) return false;
  return path.resolve(invoked) === fileURLToPath(import.meta.url);
}

if (isDirectInvocation()) {
  main().catch((error: unknown) => {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
    process.exitCode = 1;
  });
}

