import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HEADER_OPEN = "// ==UserScript==";
const HEADER_CLOSE = "// ==/UserScript==";

const FORBIDDEN_PATTERNS: readonly { readonly pattern: RegExp; readonly message: string }[] = [
  { pattern: /^\s*import\s+[\w*{]/mu, message: "contains an ES import statement" },
  { pattern: /^\s*export\s+/mu, message: "contains an ES export statement" },
  { pattern: /^\s*module\.exports\b/mu, message: "contains a CommonJS module export" },
  { pattern: /^\s*(?:const|let|var)\s+\w+\s*=\s*require\s*\(/mu, message: "contains a CommonJS require call" },
  { pattern: /sourceMappingURL=/u, message: "references an external source map" },
];

export interface BundleReport {
  readonly file: string;
  readonly problems: readonly string[];
  readonly headerLines: number;
}

/** Validate that a build artifact is a self-contained userscript with a closed header. */
export function inspectBundle(file: string, source: string): BundleReport {
  const problems: string[] = [];
  if (!source.startsWith(HEADER_OPEN + "\n")) {
    problems.push("does not start with a userscript header");
  }
  const closeIndex = source.indexOf(HEADER_CLOSE + "\n");
  if (closeIndex === -1) {
    problems.push("has no closing header marker");
  }
  const header = closeIndex === -1 ? "" : source.slice(0, closeIndex);
  const body = closeIndex === -1 ? source : source.slice(closeIndex);
  if (header.length > 0) {
    for (const required of ["@name", "@namespace", "@version", "@match", "@run-at", "@grant"]) {
      if (!header.includes("// " + required + " ")) problems.push("header is missing " + required);
    }
  }
  for (const rule of FORBIDDEN_PATTERNS) {
    if (rule.pattern.test(body)) problems.push(rule.message);
  }
  if (!source.endsWith("\n")) problems.push("does not end with a newline");
  return {
    file,
    problems,
    headerLines: header.length === 0 ? 0 : header.split("\n").length,
  };
}

async function main(): Promise<void> {
  const files = process.argv.slice(2);
  if (files.length === 0) throw new Error("Pass one or more built userscript paths");
  let failed = false;
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const report = inspectBundle(file, source);
    if (report.problems.length === 0) {
      process.stdout.write(report.file + ": ok (" + report.headerLines + " header lines, " + Buffer.byteLength(source, "utf8") + " bytes)\n");
      continue;
    }
    failed = true;
    process.stderr.write(report.file + ":\n");
    for (const problem of report.problems) process.stderr.write("  - " + problem + "\n");
  }
  if (failed) process.exitCode = 1;
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

