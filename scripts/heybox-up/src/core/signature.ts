/**
 * The hkey request signature: an MD5 digest plus a custom alphabet mapping and
 * the rotating checksum the site expects. The algorithm inputs must match the
 * released script byte for byte or the API rejects every request.
 */

export const SIG_ALPHABET = "AB45STUVWZEFGJ6CH01D237IXYPQRKLMN89";

export const MD5_SHIFTS: readonly number[] = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

export const MD5_TABLE: readonly number[] = Array.from({ length: 64 }, (_, index) =>
  Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0,
);

export function toUtf8Bytes(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const point = char.codePointAt(0) ?? 0;
    if (point < 0x80) {
      bytes.push(point);
    } else if (point < 0x800) {
      bytes.push(0xc0 | (point >> 6), 0x80 | (point & 0x3f));
    } else if (point < 0x10000) {
      bytes.push(0xe0 | (point >> 12), 0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f));
    } else {
      bytes.push(
        0xf0 | (point >> 18),
        0x80 | ((point >> 12) & 0x3f),
        0x80 | ((point >> 6) & 0x3f),
        0x80 | (point & 0x3f),
      );
    }
  }
  return bytes;
}

export function rotateLeft(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

export function md5Hex(text: string): string {
  const bytes = toUtf8Bytes(text);
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const high = Math.floor(bitLength / 0x100000000) >>> 0;
  const low = bitLength >>> 0;
  for (const word of [low, high]) {
    bytes.push(word & 0xff, (word >>> 8) & 0xff, (word >>> 16) & 0xff, (word >>> 24) & 0xff);
  }

  let stateA = 0x67452301;
  let stateB = 0xefcdab89;
  let stateC = 0x98badcfe;
  let stateD = 0x10325476;

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words: number[] = [];
    for (let index = 0; index < 16; index += 1) {
      const base = offset + index * 4;
      words.push(
        ((bytes[base] ?? 0) |
          ((bytes[base + 1] ?? 0) << 8) |
          ((bytes[base + 2] ?? 0) << 16) |
          ((bytes[base + 3] ?? 0) << 24)) >>>
          0,
      );
    }

    let a = stateA;
    let b = stateB;
    let c = stateC;
    let d = stateD;

    for (let index = 0; index < 64; index += 1) {
      let mix: number;
      let slot: number;
      if (index < 16) {
        mix = (b & c) | (~b & d);
        slot = index;
      } else if (index < 32) {
        mix = (d & b) | (~d & c);
        slot = (5 * index + 1) % 16;
      } else if (index < 48) {
        mix = b ^ c ^ d;
        slot = (3 * index + 5) % 16;
      } else {
        mix = c ^ (b | ~d);
        slot = (7 * index) % 16;
      }
      const sum = (a + mix + (MD5_TABLE[index] ?? 0) + (words[slot] ?? 0)) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + rotateLeft(sum, MD5_SHIFTS[index] ?? 0)) >>> 0;
    }

    stateA = (stateA + a) >>> 0;
    stateB = (stateB + b) >>> 0;
    stateC = (stateC + c) >>> 0;
    stateD = (stateD + d) >>> 0;
  }

  let hex = "";
  for (const word of [stateA, stateB, stateC, stateD]) {
    for (let index = 0; index < 4; index += 1) {
      hex += ((word >>> (index * 8)) & 0xff).toString(16).padStart(2, "0");
    }
  }
  return hex;
}

// A negative end index selects the leading slice, which is what the release
// build sends for the timestamp and digest fragments.
export function mapByAlphabet(value: string, endIndex: number): string {
  const source = endIndex < 0 ? SIG_ALPHABET.slice(0, endIndex) : SIG_ALPHABET;
  let mapped = "";
  for (let index = 0; index < value.length; index += 1) {
    mapped += source[value.charCodeAt(index) % source.length] ?? "";
  }
  return mapped;
}

export function interleave(parts: readonly string[]): string {
  const longest = Math.max(...parts.map((part) => part.length));
  let merged = "";
  for (let index = 0; index < longest; index += 1) {
    for (const part of parts) {
      if (index < part.length) merged += part[index] ?? "";
    }
  }
  return merged;
}

export function xtime(value: number): number {
  // The left shift must stay untruncated: the server algorithm keeps the high
  // bits, and masking them changes the checksum.
  return value & 0x80 ? ((value << 1) ^ 0x1b) & 0xff : value << 1;
}

export function mixColumns(values: number[]): number[] {
  const quartic = (value: number): number => xtime(value) ^ value;
  const r = (value: number): number => quartic(xtime(value));
  const y = (value: number): number => r(quartic(xtime(value)));
  const g = (value: number): number => y(value) ^ r(value) ^ quartic(value);
  const v0 = values[0] ?? 0;
  const v1 = values[1] ?? 0;
  const v2 = values[2] ?? 0;
  const v3 = values[3] ?? 0;
  values[0] = g(v0) ^ y(v1) ^ r(v2) ^ quartic(v3);
  values[1] = quartic(v0) ^ g(v1) ^ y(v2) ^ r(v3);
  values[2] = r(v0) ^ quartic(v1) ^ g(v2) ^ y(v3);
  values[3] = y(v0) ^ r(v1) ^ quartic(v2) ^ g(v3);
  return values;
}

export function createSignature(path: string, time: number, nonce: string): string {
  const normalizedPath = "/" + path.split("/").filter(Boolean).join("/") + "/";
  const seed = interleave([
    mapByAlphabet(String(time + 1), -2),
    mapByAlphabet(normalizedPath, 0),
    mapByAlphabet(nonce, 0),
  ]).slice(0, 20);
  const digest = md5Hex(seed);
  const tail = digest
    .slice(-6)
    .split("")
    .map((char) => char.charCodeAt(0));
  const checksum = String(
    mixColumns(tail).reduce((total, value) => total + value, 0) % 100,
  ).padStart(2, "0");
  return mapByAlphabet(digest.slice(0, 5), -4) + checksum;
}
