import { describe, expect, it } from "vitest";
import {
  PLATFORMS,
  PLATFORM_ENTRIES,
  PLATFORM_MATCH_PATTERNS,
  findPlatformForLocation,
  hostnameMatches,
} from "../scripts/ai-chat-turbo-engine/src/config";
import meta from "../scripts/ai-chat-turbo-engine/meta";

describe("platform registry", () => {
  it("declares a complete contract for every platform", () => {
    for (const [key, platform] of PLATFORM_ENTRIES) {
      expect(platform.name.length, key).toBeGreaterThan(0);
      expect(platform.hosts.length, key).toBeGreaterThan(0);
      for (const field of [
        "turnSelectors",
        "contentSelectors",
        "inputSelectors",
        "sendButtonSelectors",
        "codeSelectors",
      ] as const) {
        expect(platform[field].length, `${key}.${field}`).toBeGreaterThan(0);
      }
      for (const host of platform.hosts) {
        expect(hostnameMatches(host, platform.hosts), `${key}/${host}`).toBe(
          true,
        );
      }
    }
  });

  it("resolves every declared host to its own platform", () => {
    for (const [key, platform] of PLATFORM_ENTRIES) {
      for (const host of platform.hosts) {
        const paths = Object.entries(platform.hostPaths ?? {})
          .filter(([suffix]) => suffix === host)
          .map(([, prefix]) => `${prefix}/thread`);
        for (const pathname of paths.length > 0 ? paths : ["/"]) {
          const resolved = findPlatformForLocation(host, pathname);
          expect(resolved, `${key}/${host}${pathname}`).toBe(platform);
        }
      }
    }
  });

  it("resolves the declared origins and ignores host case", () => {
    expect(findPlatformForLocation("CHATGPT.COM", "/c/1")?.name).toBe(
      "ChatGPT",
    );
    expect(findPlatformForLocation("www.perplexity.ai", "/")?.name).toBe(
      "Perplexity",
    );
    expect(findPlatformForLocation("chat.deepseek.com", "/")).toBe(
      PLATFORMS.deepseek,
    );
  });

  it("refuses hosts the header does not cover", () => {
    expect(findPlatformForLocation("chat.chatgpt.com", "/c/1")).toBeNull();
    expect(findPlatformForLocation("deepseek.com", "/")).toBeNull();
    expect(findPlatformForLocation("www.grok.com", "/chat")).toBeNull();
  });

  it("keeps the domain suffix helper for host trees", () => {
    expect(hostnameMatches("chat.yuanbao.tencent.com", ["yuanbao.tencent.com"]))
      .toBe(true);
    expect(hostnameMatches("notyuanbao.com", ["yuanbao.tencent.com"])).toBe(
      false,
    );
  });

  it("separates x.com chat routes from the rest of the site", () => {
    expect(findPlatformForLocation("x.com", "/i/grok")).toBe(PLATFORMS.grok);
    expect(findPlatformForLocation("x.com", "/i/grok/chat/1")).toBe(
      PLATFORMS.grok,
    );
    expect(findPlatformForLocation("x.com", "/i/other")).toBeNull();
    expect(findPlatformForLocation("x.com", "/home")).toBeNull();
    expect(findPlatformForLocation("grok.com", "/chat")).toBe(PLATFORMS.grok);
  });

  it("returns null for unknown hosts", () => {
    expect(findPlatformForLocation("example.com", "/")).toBeNull();
    expect(findPlatformForLocation("notchatgpt.com", "/")).toBeNull();
  });
});

describe("userscript header", () => {
  it("covers exactly the registered origins", () => {
    const declared = PLATFORM_ENTRIES.flatMap(([, platform]) => [
      ...platform.hosts,
      ...Object.keys(platform.hostPaths ?? {}),
    ]);
    const headers = meta.match.map((pattern) => {
      const withoutScheme = pattern.replace(/^https:\/\//, "");
      return withoutScheme.slice(0, withoutScheme.indexOf("/"));
    });
    expect(new Set(headers)).toEqual(new Set(declared));
  });

  it("matches exactly the registered hosts", () => {
    expect(meta.match).toEqual([...PLATFORM_MATCH_PATTERNS]);

    for (const pattern of meta.match) {
      const withoutScheme = pattern.replace(/^https:\/\//, "");
      const slashIndex = withoutScheme.indexOf("/");
      const host = withoutScheme.slice(0, slashIndex);
      const pathPrefix = withoutScheme
        .slice(slashIndex + 1)
        .replace(/\*$/, "");
      const resolved = findPlatformForLocation(host, `/${pathPrefix}`);
      expect(resolved, pattern).not.toBeNull();
      expect(
        resolved?.hosts.includes(host) ||
          Object.keys(resolved?.hostPaths ?? {}).includes(host),
        pattern,
      ).toBe(true);
    }
  });

  it("does not duplicate patterns", () => {
    expect(new Set(meta.match).size).toBe(meta.match.length);
  });
});
