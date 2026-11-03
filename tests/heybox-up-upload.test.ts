// @vitest-environment jsdom
import { createHash, createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MAX_COMMENT_IMAGES,
  camSafeEncode,
  createCosAuthorization,
  encodeCosObjectPath,
  formatCosHost,
  hmacSha1Hex,
  readCosCredentials,
  readCosPreviewUrl,
  readCosUploadInfo,
  sha1Hex,
  sha1TextHex,
  uploadCommentImage,
} from "../scripts/heybox-up/src/core/upload";

const credentials = {
  secretId: "AKIDtmp",
  secretKey: "secretKey123",
  sessionToken: "session",
  startTime: 1700000000,
  expiredTime: 1700003600,
};

function nodeSha1(text: string): string {
  return createHash("sha1").update(text, "utf8").digest("hex");
}

function nodeHmac(key: string, message: string): string {
  return createHmac("sha1", key).update(message, "utf8").digest("hex");
}

describe("sha1 and hmac", () => {
  it("matches known SHA1 digests including multibyte text", () => {
    expect(sha1TextHex("")).toBe("da39a3ee5e6b4b0d3255bfef95601890afd80709");
    expect(sha1TextHex("abc")).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
    expect(sha1TextHex("小黑盒")).toBe(nodeSha1("小黑盒"));
    // A payload longer than one 64 byte block proves the padding loop.
    const long = "x".repeat(200) + "尾巴";
    expect(sha1TextHex(long)).toBe(nodeSha1(long));
    expect(sha1Hex([0x61, 0x62, 0x63])).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
  });

  it("matches node HMAC-SHA1 for short and long keys", () => {
    expect(hmacSha1Hex("key", "The quick brown fox jumps over the lazy dog"))
      .toBe("de7c9b85b8b78aa6bc8a7a36f70a90701c9db4d9");
    const longKey = "k".repeat(80);
    expect(hmacSha1Hex(longKey, "long key")).toBe(nodeHmac(longKey, "long key"));
    expect(hmacSha1Hex("密钥", "中文消息")).toBe(nodeHmac("密钥", "中文消息"));
  });
});

describe("cos signing", () => {
  it("encodes keys the way the SDK does", () => {
    expect(camSafeEncode("a/b c!.png")).toBe("a%2Fb%20c%21.png");
    expect(camSafeEncode("it's (new)*")).toBe("it%27s%20%28new%29%2A");
    expect(encodeCosObjectPath("bbs/2026/11/03/a b.webp")).toBe("bbs/2026/11/03/a%20b.webp");
  });

  it("defaults the host region and keeps an explicit one", () => {
    expect(formatCosHost("bbs-1", "")).toBe("bbs-1.cos.ap-shanghai.myqcloud.com");
    expect(formatCosHost("bbs-1", "ap-guangzhou")).toBe("bbs-1.cos.ap-guangzhou.myqcloud.com");
  });

  it("builds the v5 authorization string with host as the only signed header", () => {
    const authorization = createCosAuthorization({
      method: "PUT",
      key: "bbs/2026/11/03/abc.webp",
      bucket: "bbs-1250000000",
      region: "ap-shanghai",
      credentials: credentials,
    });
    expect(authorization).toBe([
      "q-sign-algorithm=sha1",
      "q-ak=AKIDtmp",
      "q-sign-time=1700000000;1700003600",
      "q-key-time=1700000000;1700003600",
      "q-header-list=host",
      "q-url-param-list=",
      "q-signature=8c7afc8ef4f99daac3a4806ed3e2c085c8c65d57",
    ].join("&"));
  });
});

describe("upload payload parsing", () => {
  it("reads the first object key and bucket", () => {
    expect(readCosUploadInfo({ keys: ["bbs/a.webp"], bucket: "bbs-1" }, "x"))
      .toEqual({ key: "bbs/a.webp", bucket: "bbs-1", region: "ap-shanghai" });
    expect(readCosUploadInfo({ keys: [" k "], bucket: "b", region: "ap-guangzhou" }, "x").region)
      .toBe("ap-guangzhou");
  });

  it("rejects an info payload without a key or bucket", () => {
    expect(() => readCosUploadInfo({ keys: [], bucket: "b" }, "获取 CDN 上传信息失败"))
      .toThrow("获取 CDN 上传信息失败");
    expect(() => readCosUploadInfo({ keys: ["k"], bucket: "" }, "获取 CDN 上传信息失败"))
      .toThrow("获取 CDN 上传信息失败");
  });

  it("reads temporary credentials and their lifetime", () => {
    expect(readCosCredentials({
      credentials: { tmpSecretId: "id", tmpSecretKey: "key", sessionToken: "token" },
      startTime: "1700000000",
      expiredTime: 1700003600,
    }, "x")).toEqual({
      secretId: "id",
      secretKey: "key",
      sessionToken: "token",
      startTime: 1700000000,
      expiredTime: 1700003600,
    });
    expect(() => readCosCredentials({ credentials: { tmpSecretId: "id" }, startTime: 1, expiredTime: 2 }, "凭证失败"))
      .toThrow("凭证失败");
  });

  it("reads the public preview url and its thumb", () => {
    expect(readCosPreviewUrl({ preview_urls: ["https://img/a.webp"], thumbs: ["https://img/t.webp"] }))
      .toEqual({ url: "https://img/a.webp", thumb: "https://img/t.webp" });
    expect(readCosPreviewUrl({ preview_urls: ["https://img/a.webp"] }).thumb).toBe("");
    expect(() => readCosPreviewUrl({ preview_urls: [] })).toThrow("确认 CDN 上传结果失败");
  });
});

describe("uploadCommentImage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks for a key, uploads the bytes and confirms the object", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn((url: unknown, init: RequestInit = {}) => {
      calls.push({ url: String(url), init: init });
      const text = String(url);
      if (text.includes("/upload/info/v2")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ status: "ok", result: { keys: ["bbs/a.webp"], bucket: "bbs-1" } }) });
      }
      if (text.includes("/upload/token/v2")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ status: "ok", result: { credentials: { tmpSecretId: "id", tmpSecretKey: "key", sessionToken: "token" }, startTime: 1700000000, expiredTime: 1700003600 } }) });
      }
      if (text.includes("/upload/callback/v2")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ status: "ok", result: { preview_urls: ["https://img/a.webp"], thumbs: ["https://img/t.webp"] } }) });
      }
      return Promise.resolve({ ok: true, status: 200 });
    }));

    const file = new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" });
    const uploaded = await uploadCommentImage(file, "42");
    expect(uploaded).toEqual({ url: "https://img/a.webp", thumb: "https://img/t.webp" });
    expect(calls).toHaveLength(4);
    expect(calls[0]?.url).toContain("api.xiaoheihe.cn/bbs/app/api/qcloud/cos/upload/info/v2?");
    expect(calls[0]?.url).toContain("heybox_id=42");
    expect(calls[0]?.url).toContain("target=heybox_app");
    const infoBody = new URLSearchParams(String(calls[0]?.init.body));
    expect(infoBody.get("scope")).toBe("bbs");
    expect(JSON.parse(infoBody.get("file_infos") ?? "[]")).toEqual([
      { name: "a.png", mimetype: "image/png", fsize: 3, width: 0, height: 0 },
    ]);

    // The token call describes the object it will store, so the bucket, key and
    // mimetype travel in the form body exactly like the site's own uploader.
    expect(calls[1]?.url).toContain("api.xiaoheihe.cn/bbs/app/api/qcloud/cos/upload/token/v2?");
    const tokenBody = new URLSearchParams(String(calls[1]?.init.body));
    expect(tokenBody.get("bucket")).toBe("bbs-1");
    expect(tokenBody.get("keys")).toBe(JSON.stringify(["bbs/a.webp"]));
    expect(tokenBody.get("mimetypes")).toBe(JSON.stringify(["image/png"]));
    expect(tokenBody.get("is_multipart_upload")).toBe("0");

    // info, token, the byte PUT, then the callback confirmation.
    const put = calls[2];
    expect(put?.url).toBe("https://bbs-1.cos.ap-shanghai.myqcloud.com/bbs/a.webp");
    expect(put?.init.method).toBe("PUT");
    expect(put?.init.body).toBe(file);
    const headers = put?.init.headers as Record<string, string>;
    expect(headers["x-cos-security-token"]).toBe("token");
    expect(headers["content-type"]).toBe("image/png");
    expect(headers["authorization"]).toContain("q-sign-algorithm=sha1");
    expect(headers["authorization"]).toContain("q-ak=id");
    expect(calls[3]?.url).toContain("is_finished=true");
    expect(new URLSearchParams(String(calls[3]?.init.body)).get("keys")).toBe(JSON.stringify(["bbs/a.webp"]));
  });

  it("rejects a non-image file before any request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(uploadCommentImage(new File(["x"], "a.txt", { type: "text/plain" }), "42"))
      .rejects.toThrow("仅支持选择图片文件");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces the site message when the info call is refused", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: "failed", result: { sbe: { user_message: "图片过大" } } }),
    })));
    await expect(uploadCommentImage(new File(["x"], "a.png", { type: "image/png" }), "42"))
      .rejects.toThrow("图片过大");
  });

  it("caps comment pictures at the picker limit", () => {
    expect(MAX_COMMENT_IMAGES).toBe(9);
  });
});
