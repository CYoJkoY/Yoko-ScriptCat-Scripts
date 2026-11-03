import { createApiParams } from "../ui/rail";
import { asRecord, asUnknownArray, readFiniteNumber, readStringField } from "./json";
import { fetchWithTimeout } from "./request";
import { toUtf8Bytes } from "./signature";

/**
 * Comment picture upload. The site accepts a file only after three API calls
 * around one direct PUT to Tencent COS, so the flow is reproduced here instead
 * of posting a raw multipart form: ask for an object key, ask for temporary
 * credentials, PUT the bytes, then confirm the key so the CDN returns the
 * public preview URL the comment body stores.
 */

export const UPLOAD_API_BASE = "https://api.xiaoheihe.cn";

export const UPLOAD_INFO_PATH = "/bbs/app/api/qcloud/cos/upload/info/v2";

export const UPLOAD_TOKEN_PATH = "/bbs/app/api/qcloud/cos/upload/token/v2";

export const UPLOAD_CALLBACK_PATH = "/bbs/app/api/qcloud/cos/upload/callback/v2";

/** The site caps a comment at this many pictures; the picker enforces it too. */
export const MAX_COMMENT_IMAGES = 9;

const COS_DEFAULT_REGION = "ap-shanghai";

/** A picture body can be far larger than a JSON call, so the PUT gets longer. */
export const UPLOAD_TIMEOUT_MS = 120000;

const IMAGE_SIZE_TIMEOUT_MS = 3000;

export interface UploadedImage {
  url: string;
  thumb: string;
}

export interface CosUploadInfo {
  key: string;
  bucket: string;
  region: string;
}

export interface CosCredentials {
  secretId: string;
  secretKey: string;
  sessionToken: string;
  startTime: number;
  expiredTime: number;
}

/* ------------------------------------------------------------------ *
 * SHA1 / HMAC-SHA1
 * The COS v5 signature is an HMAC chain over SHA1 digests, and the reader
 * runs before the page grants any async crypto, so both primitives are
 * implemented in plain TypeScript next to the existing MD5 helper.
 * ------------------------------------------------------------------ */

const SHA1_INITIAL: readonly number[] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];

function pushBytes(target: number[], source: readonly number[]): void {
  for (const byte of source) target.push(byte & 0xff);
}

function sha1Words(bytes: readonly number[]): number[] {
  const message: number[] = [];
  pushBytes(message, bytes);
  const bitLength = message.length * 8;
  message.push(0x80);
  while (message.length % 64 !== 56) message.push(0);
  const high = Math.floor(bitLength / 0x100000000) >>> 0;
  const low = bitLength >>> 0;
  // SHA1 stores the length big-endian, unlike the little-endian MD5 padding.
  for (const word of [high, low]) {
    message.push((word >>> 24) & 0xff, (word >>> 16) & 0xff, (word >>> 8) & 0xff, word & 0xff);
  }

  let h0 = SHA1_INITIAL[0] ?? 0;
  let h1 = SHA1_INITIAL[1] ?? 0;
  let h2 = SHA1_INITIAL[2] ?? 0;
  let h3 = SHA1_INITIAL[3] ?? 0;
  let h4 = SHA1_INITIAL[4] ?? 0;

  const schedule: number[] = new Array<number>(80).fill(0);
  for (let offset = 0; offset < message.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const base = offset + index * 4;
      schedule[index] = (
        ((message[base] ?? 0) << 24) |
        ((message[base + 1] ?? 0) << 16) |
        ((message[base + 2] ?? 0) << 8) |
        (message[base + 3] ?? 0)
      ) >>> 0;
    }
    for (let index = 16; index < 80; index += 1) {
      const value = (schedule[index - 3] ?? 0) ^ (schedule[index - 8] ?? 0) ^ (schedule[index - 14] ?? 0) ^ (schedule[index - 16] ?? 0);
      schedule[index] = ((value << 1) | (value >>> 31)) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let index = 0; index < 80; index += 1) {
      let mix: number;
      let constant: number;
      if (index < 20) {
        mix = (b & c) | (~b & d);
        constant = 0x5a827999;
      } else if (index < 40) {
        mix = b ^ c ^ d;
        constant = 0x6ed9eba1;
      } else if (index < 60) {
        mix = (b & c) | (b & d) | (c & d);
        constant = 0x8f1bbcdc;
      } else {
        mix = b ^ c ^ d;
        constant = 0xca62c1d6;
      }
      const sum = (((a << 5) | (a >>> 27)) + mix + e + constant + (schedule[index] ?? 0)) >>> 0;
      e = d;
      d = c;
      c = ((b << 30) | (b >>> 2)) >>> 0;
      b = a;
      a = sum;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4];
}

export function sha1Hex(bytes: readonly number[]): string {
  let hex = "";
  for (const word of sha1Words(bytes)) {
    for (let index = 3; index >= 0; index -= 1) {
      hex += ((word >>> (index * 8)) & 0xff).toString(16).padStart(2, "0");
    }
  }
  return hex;
}

export function sha1TextHex(text: string): string {
  return sha1Hex(toUtf8Bytes(text));
}

function sha1Bytes(bytes: readonly number[]): number[] {
  const result: number[] = [];
  for (const word of sha1Words(bytes)) {
    result.push((word >>> 24) & 0xff, (word >>> 16) & 0xff, (word >>> 8) & 0xff, word & 0xff);
  }
  return result;
}

const HMAC_BLOCK_SIZE = 64;

/** HMAC-SHA1 with a UTF-8 key, returning lowercase hex like the COS SDK. */
export function hmacSha1Hex(key: string, message: string): string {
  let keyBytes = toUtf8Bytes(key);
  if (keyBytes.length > HMAC_BLOCK_SIZE) keyBytes = sha1Bytes(keyBytes);
  const inner: number[] = [];
  const outer: number[] = [];
  for (let index = 0; index < HMAC_BLOCK_SIZE; index += 1) {
    const byte = keyBytes[index] ?? 0;
    inner.push(byte ^ 0x36);
    outer.push(byte ^ 0x5c);
  }
  pushBytes(inner, toUtf8Bytes(message));
  pushBytes(outer, sha1Bytes(inner));
  return sha1Hex(outer);
}

/* ------------------------------------------------------------------ *
 * COS v5 signing
 * ------------------------------------------------------------------ */

/** The SDK's escaping for keys and query values: URI encoding plus 4 extras. */
export function camSafeEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

/** `{bucket}.cos.{region}.myqcloud.com`, the host both the URL and the signature use. */
export function formatCosHost(bucket: string, region: string): string {
  return bucket + ".cos." + (region === "" ? COS_DEFAULT_REGION : region) + ".myqcloud.com";
}

/** Object keys keep their slashes so the COS path stays readable. */
export function encodeCosObjectPath(key: string): string {
  return camSafeEncode(key).replace(/%2F/g, "/");
}

export function createCosAuthorization(input: {
  method: string;
  key: string;
  bucket: string;
  region: string;
  credentials: CosCredentials;
}): string {
  const { credentials } = input;
  // The SDK drops `content-type`, `cache-control` and `expires` from the signed
  // set and then injects the bucket host, so `host` is the only signed header.
  const headerList = "host";
  const paramList = "";
  const keyTime = credentials.startTime + ";" + credentials.expiredTime;
  const signHost = formatCosHost(input.bucket, input.region);
  // The SDK signs `HmacSHA1(KeyTime, SecretKey)`; the helper takes key first.
  const signKey = hmacSha1Hex(credentials.secretKey, keyTime);
  const httpString = [
    input.method.toLowerCase(),
    "/" + input.key,
    "",
    "host=" + signHost,
    "",
  ].join("\n");
  const stringToSign = ["sha1", keyTime, sha1TextHex(httpString), ""].join("\n");
  const signature = hmacSha1Hex(signKey, stringToSign);
  return [
    "q-sign-algorithm=sha1",
    "q-ak=" + credentials.secretId,
    "q-sign-time=" + keyTime,
    "q-key-time=" + keyTime,
    "q-header-list=" + headerList,
    "q-url-param-list=" + paramList,
    "q-signature=" + signature,
  ].join("&");
}

/* ------------------------------------------------------------------ *
 * Response parsing
 * ------------------------------------------------------------------ */

function readErrorMessage(data: Record<string, unknown>, fallback: string): string {
  const sbe = asRecord(asRecord(data["result"])?.["sbe"]);
  const userMessage = sbe === null ? "" : readStringField(sbe, "user_message");
  if (userMessage !== "") return userMessage;
  const msg = readStringField(data, "msg");
  return msg === "" ? fallback : msg;
}

export function readCosUploadInfo(value: unknown, fallback: string): CosUploadInfo {
  const result = asRecord(value);
  const keys = result === null ? [] : asUnknownArray(result["keys"]).map((entry) => String(entry ?? "").trim());
  const key = keys[0] ?? "";
  const bucket = result === null ? "" : readStringField(result, "bucket");
  if (key === "" || bucket === "") throw new Error(fallback);
  const region = result === null ? "" : readStringField(result, "region");
  return { key: key, bucket: bucket, region: region === "" ? COS_DEFAULT_REGION : region };
}

export function readCosCredentials(value: unknown, fallback: string): CosCredentials {
  const result = asRecord(value);
  const credentials = result === null ? null : asRecord(result["credentials"]);
  const secretId = credentials === null ? "" : readStringField(credentials, "tmpSecretId");
  const secretKey = credentials === null ? "" : readStringField(credentials, "tmpSecretKey");
  const sessionToken = credentials === null ? "" : readStringField(credentials, "sessionToken");
  const startTime = result === null ? null : readFiniteNumber(result["startTime"]);
  const expiredTime = result === null ? null : readFiniteNumber(result["expiredTime"]);
  if (secretId === "" || secretKey === "" || sessionToken === "" || startTime === null || expiredTime === null) {
    throw new Error(fallback);
  }
  return { secretId, secretKey, sessionToken, startTime, expiredTime };
}

/** Reads the public preview URL the CDN assigned to the uploaded object. */
export function readCosPreviewUrl(value: unknown): UploadedImage {
  const result = asRecord(value);
  const previews = result === null ? [] : asUnknownArray(result["preview_urls"]);
  const thumbs = result === null ? [] : asUnknownArray(result["thumbs"]);
  const url = String(previews[0] ?? "").trim();
  if (url === "") throw new Error("确认 CDN 上传结果失败");
  return { url: url, thumb: String(thumbs[0] ?? "").trim() };
}

/* ------------------------------------------------------------------ *
 * Upload flow
 * ------------------------------------------------------------------ */

function formBody(values: Record<string, string>): string {
  return new URLSearchParams(values).toString();
}

async function postUploadApi(
  path: string,
  body: Record<string, string>,
  accountId: string,
  query: Record<string, string>,
  fallback: string,
  signal?: AbortSignal,
): Promise<unknown> {
  if (accountId === "") throw new Error("请先登录小黑盒");
  const params = new URLSearchParams({
    ...createApiParams(path),
    ...query,
    heybox_id: accountId,
    target: "heybox_app",
  });
  const response = await fetchWithTimeout(UPLOAD_API_BASE + path + "?" + params.toString(), {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: formBody(body),
    ...(signal === undefined ? {} : { signal: signal }),
  });
  if (!response.ok) throw new Error("接口返回 HTTP " + response.status);
  const payload: unknown = await response.json();
  const data = asRecord(payload) ?? {};
  if (data["status"] === "login") throw new Error("请先登录小黑盒");
  if (data["status"] !== "ok") throw new Error(readErrorMessage(data, fallback));
  return data["result"];
}

function createObjectUrl(file: File): string {
  if (typeof URL.createObjectURL !== "function") return "";
  try {
    return URL.createObjectURL(file);
  } catch (error) {
    // Some embedded webviews expose the function but refuse blob URLs; a zero
    // size is accepted by the info call, so the upload continues without it.
    return "";
  }
}

function revokeObjectUrl(url: string): void {
  if (url === "" || typeof URL.revokeObjectURL !== "function") return;
  URL.revokeObjectURL(url);
}

/** Measures a picture so the upload record matches the site's own payload. */
async function readImageSize(file: File, signal?: AbortSignal): Promise<{ width: number; height: number }> {
  const source = createObjectUrl(file);
  if (source === "") return { width: 0, height: 0 };
  try {
    return await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      let settled = false;
      let timer = 0;
      const finish = (size: { width: number; height: number } | null, error: unknown): void => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        revokeObjectUrl(source);
        if (error !== null) reject(error);
        else resolve(size ?? { width: 0, height: 0 });
      };
      const onAbort = (): void => finish(null, signal?.reason ?? new DOMException("请求已取消", "AbortError"));
      timer = window.setTimeout(() => finish({ width: 0, height: 0 }, null), IMAGE_SIZE_TIMEOUT_MS);
      signal?.addEventListener("abort", onAbort, { once: true });
      image.onload = () => finish({ width: image.naturalWidth, height: image.naturalHeight }, null);
      image.onerror = () => finish(null, new Error("图片无法读取"));
      image.src = source;
    });
  } finally {
    // The object URL is released by `finish`; a synchronous throw still needs
    // the fallback so a broken picture cannot leak a blob reference.
    revokeObjectUrl(source);
  }
}

/**
 * Uploads one comment picture and returns the CDN preview URL. Every failure
 * carries a Chinese message because the composer shows it to the reader.
 */
export async function uploadCommentImage(file: File, accountId: string, signal?: AbortSignal): Promise<UploadedImage> {
  const mimetype = file.type;
  if (!mimetype.startsWith("image/")) throw new Error("仅支持选择图片文件");
  const size = await readImageSize(file, signal);
  const info = readCosUploadInfo(await postUploadApi(UPLOAD_INFO_PATH, {
    file_infos: JSON.stringify([{
      name: file.name,
      mimetype: mimetype,
      fsize: file.size,
      width: size.width,
      height: size.height,
    }]),
    scope: "bbs",
    need_cache: "0",
  }, accountId, {}, "获取 CDN 上传信息失败", signal), "获取 CDN 上传信息失败");

  const credentials = readCosCredentials(
    // The site hands this call the object record its uploader keeps per key, so
    // the bucket, key and mimetype travel in the form body while the query
    // carries only the signed common parameters.
    await postUploadApi(UPLOAD_TOKEN_PATH, {
      bucket: info.bucket,
      keys: JSON.stringify([info.key]),
      mimetypes: JSON.stringify([mimetype]),
      is_multipart_upload: "0",
    }, accountId, {}, "获取 CDN 上传凭证失败", signal),
    "获取 CDN 上传凭证失败",
  );

  const authorization = createCosAuthorization({
    method: "PUT",
    key: info.key,
    bucket: info.bucket,
    region: info.region,
    credentials: credentials,
  });
  const target = "https://" + formatCosHost(info.bucket, info.region) + "/" + encodeCosObjectPath(info.key);
  const stored = await fetchWithTimeout(target, {
    method: "PUT",
    mode: "cors",
    cache: "no-store",
    headers: {
      authorization: authorization,
      "x-cos-security-token": credentials.sessionToken,
      "content-type": mimetype,
    },
    body: file,
    ...(signal === undefined ? {} : { signal: signal }),
  }, UPLOAD_TIMEOUT_MS);
  if (!stored.ok) throw new Error("图片上传失败（HTTP " + stored.status + "）");

  return readCosPreviewUrl(await postUploadApi(
    UPLOAD_CALLBACK_PATH,
    { keys: JSON.stringify([info.key]) },
    accountId,
    { is_finished: "true" },
    "确认 CDN 上传结果失败",
    signal,
  ));
}
