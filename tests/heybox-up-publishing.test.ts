import { describe, expect, it } from "vitest";
import { renderUserscriptHeader } from "../shared/userscript/meta";
import meta from "../scripts/heybox-up/meta";

const publishedDownloadUrl =
  "https://ghfast.top/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/release/heybox-up.user.js";

describe("HeyBox Up publishing metadata", () => {
  it("points generated metadata to the versioned release artifact", () => {
    const header = renderUserscriptHeader(meta);

    expect(meta.version).toBe("0.12.20");
    expect(meta.updateURL).toBe(
      "https://cdn.jsdelivr.net/gh/CYoJkoY/Yoko-ScriptCat-Scripts@release/heybox-up.user.js",
    );
    expect(meta.downloadURL).toBe(publishedDownloadUrl);
    expect(header).toContain("// @version      0.12.20");
    expect(header).toContain(`// @downloadURL  ${publishedDownloadUrl}`);
  });
});
