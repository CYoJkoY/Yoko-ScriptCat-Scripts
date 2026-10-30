import { describe, expect, it } from "vitest";
import { normalizeChangedPath, parseChangedPaths, planVerification } from "../tools/ci-targets";

const discovered = ["ai-chat-turbo-engine", "gemini-quota-capsule", "heybox-up"];

describe("normalizeChangedPath", () => {
  it("converts Windows separators and strips leading ./", () => {
    expect(normalizeChangedPath("scripts\\heybox-up\\src\\index.ts")).toBe("scripts/heybox-up/src/index.ts");
    expect(normalizeChangedPath("  ./shared/dom/observeDom.ts  ")).toBe("shared/dom/observeDom.ts");
  });
});

describe("parseChangedPaths", () => {
  it("splits on any newline style and drops blanks and duplicates", () => {
    const parsed = parseChangedPaths("a\r\nb\nc\r\n\n a \n");
    expect(parsed).toEqual(["a", "b", "c"]);
  });
});

describe("planVerification", () => {
  it("selects only the workspaces touched by the diff", () => {
    const plan = planVerification([
      "scripts/heybox-up/src/index.ts",
      "scripts/heybox-up/meta.ts",
      "docs/heybox-up.md",
    ], discovered);
    expect(plan.mode).toBe("targeted");
    expect(plan.targets).toEqual(["heybox-up"]);
  });

  it("sorts and de-duplicates multiple affected workspaces", () => {
    const plan = planVerification([
      "scripts/heybox-up/src/config.ts",
      "scripts/ai-chat-turbo-engine/src/index.ts",
      "scripts/heybox-up/src/state.ts",
    ], discovered);
    expect(plan.targets).toEqual(["ai-chat-turbo-engine", "heybox-up"]);
  });

  it.each(["shared/utils/debounce.ts", "tools/build.ts", "package.json", "tsconfig.base.json", ".github/workflows/ci-build.yml", "tests/build.test.ts"])(
    "falls back to a full run when %s changes",
    (changedPath) => {
      const plan = planVerification([changedPath, "scripts/heybox-up/src/index.ts"], discovered);
      expect(plan.mode).toBe("full");
      expect(plan.targets).toEqual(["ai-chat-turbo-engine", "gemini-quota-capsule", "heybox-up"]);
    },
  );

  it("verifies everything when the diff is empty", () => {
    expect(planVerification([], discovered).mode).toBe("full");
  });

  it("skips script work for documentation-only diffs", () => {
    const plan = planVerification(["README.md", "docs/heybox-up.md"], discovered);
    expect(plan.mode).toBe("none");
    expect(plan.targets).toEqual([]);
  });

  it("verifies a workspace whose committed bundle changed on its own", () => {
    const plan = planVerification(["dist/heybox-up.user.js"], discovered);
    expect(plan.mode).toBe("targeted");
    expect(plan.targets).toEqual(["heybox-up"]);
  });

  it("rejects a bundle that has no matching workspace", () => {
    expect(() => planVerification(["dist/orphan.user.js"], discovered)).toThrow(
      /dist\/orphan\.user\.js has a discoverable workspace/,
    );
  });

  it("fails loudly when a script directory disappears or is misnamed", () => {
    expect(() => planVerification(["scripts/removed-script/src/index.ts"], discovered)).toThrow(
      /scripts\/removed-script nor dist\/removed-script\.user\.js has a discoverable workspace/,
    );
  });
});

