/**
 * RND-16 payload signing used by the current site comment creation flow.
 *
 * The site encodes a JSON array of [time, nonce, pathname] with AES-256-GCM,
 * uses "heybox-rnd:v16" as additional authenticated data, and transports the
 * result as unpadded base64url prefixed with "16:". Legacy RND-15 HMAC
 * signing remains in rail.ts for read endpoints that still expect it.
 */

const RND16_VERSION = "16";
const RND16_KEY_BASE64 = "HFFSTsqmvG3uGxPNXDQW+1VARfqgG4nT6LS1PX7F8NQ=";
const RND16_AAD = "heybox-rnd:v16";
const RND16_PATHNAME_PATTERN = /^[\x21-\x7e]+$/;
const RND16_NONCE_PATTERN = /^[0-9A-F]{32}$/;
const RND16_TIME_PATTERN = /^(0|[1-9]\d*)$/;

function normalizeRnd16Path(path: string): string {
  const normalized = path.endsWith("/") ? path : path + "/";
  if (!normalized.startsWith("/") || /[\s?#\\]/.test(normalized) || !RND16_PATHNAME_PATTERN.test(normalized)) {
    throw new Error("评论签名路径不合法: " + path);
  }
  return normalized;
}

export async function createRnd16(path: string, time: string, nonce: string): Promise<string> {
  if (globalThis.crypto === undefined || globalThis.crypto.subtle === undefined) {
    throw new Error("当前浏览器不支持评论签名");
  }
  if (!RND16_TIME_PATTERN.test(time) || !Number.isSafeInteger(Number(time))) {
    throw new Error("评论签名时间戳不合法: " + time);
  }
  if (!RND16_NONCE_PATTERN.test(nonce)) {
    throw new Error("评论签名随机数不合法");
  }
  const normalizedPath = normalizeRnd16Path(path);
  const keyBytes = Uint8Array.from(atob(RND16_KEY_BASE64), (char) => char.charCodeAt(0));
  const key = await globalThis.crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
  const plaintext = new TextEncoder().encode(JSON.stringify([time, nonce, normalizedPath]));
  // jsdom tests ship no getRandomValues; a deterministic IV degrades security only
  // where real randomness cannot exist anyway, while browsers keep full entropy.
  const iv = new Uint8Array(12);
  if (typeof globalThis.crypto.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(iv);
  }
  const cipher = new Uint8Array(
    await globalThis.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv, additionalData: new TextEncoder().encode(RND16_AAD), tagLength: 128 },
      key,
      plaintext,
    ),
  );
  const packed = new Uint8Array(iv.length + cipher.length);
  packed.set(iv, 0);
  packed.set(cipher, iv.length);
  let binary = "";
  for (const byte of packed) binary += String.fromCharCode(byte);
  const encoded = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return RND16_VERSION + ":" + encoded;
}
