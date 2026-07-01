import { gunzipSync, gzipSync } from "fflate";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function bytesToBinaryString(bytes: Uint8Array): string {
  let binary = "";

  for (let index = 0; index < bytes.length; index += 0x8000) {
    const chunk = bytes.subarray(index, index + 0x8000);
    binary += String.fromCharCode(...chunk);
  }

  return binary;
}

function binaryStringToBytes(binary: string): Uint8Array {
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export function encodeBase64Url(bytes: Uint8Array): string {
  return btoa(bytesToBinaryString(bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

export function decodeBase64Url(value: string): Uint8Array {
  const padding = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/") + padding;

  return binaryStringToBytes(atob(normalized));
}

export async function gzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  return gzipSync(bytes, {
    level: 6
  });
}

export async function gunzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  return gunzipSync(bytes);
}

export async function gzipJsonToBase64Url(json: string): Promise<{
  compressedBytes: Uint8Array;
  payload: string;
}> {
  const compressedBytes = await gzipBytes(textEncoder.encode(json));
  return {
    compressedBytes,
    payload: encodeBase64Url(compressedBytes)
  };
}

export async function gunzipBase64UrlToJson(payload: string): Promise<{
  compressedBytes: Uint8Array;
  json: string;
}> {
  const compressedBytes = decodeBase64Url(payload);
  const decompressedBytes = await gunzipBytes(compressedBytes);
  return {
    compressedBytes,
    json: textDecoder.decode(decompressedBytes)
  };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}
