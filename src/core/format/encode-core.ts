import { gzipJsonToBase64Url, sha256Hex } from "../shared/crypto";
import { normalizeBundle, type BookmarkBundle, type EncodedBookmarkBundle } from "./schema";

export type EncodeBundleProgress = {
  detail:
    | "Normalizing bookmark snapshot"
    | "Serializing bookmark snapshot"
    | "Compressing bookmark snapshot"
    | "Encoding WebDAV payload"
    | "Calculating bundle checksum";
};

export type EncodeBundleOptions = {
  onProgress?: (progress: EncodeBundleProgress) => void | Promise<void>;
};

export async function encodeBundleLocally(
  bundle: BookmarkBundle,
  options: EncodeBundleOptions = {}
): Promise<EncodedBookmarkBundle> {
  await options.onProgress?.({
    detail: "Normalizing bookmark snapshot"
  });
  const normalizedBundle = normalizeBundle(bundle);
  await options.onProgress?.({
    detail: "Serializing bookmark snapshot"
  });
  const json = JSON.stringify(normalizedBundle);
  await options.onProgress?.({
    detail: "Compressing bookmark snapshot"
  });
  const { compressedBytes, payload } = await gzipJsonToBase64Url(json);
  await options.onProgress?.({
    detail: "Encoding WebDAV payload"
  });
  await options.onProgress?.({
    detail: "Calculating bundle checksum"
  });

  return {
    kind: "onesync.bundle",
    bundleVersion: 1,
    encoding: "base64url+gzip+json",
    checksum: {
      algorithm: "sha256",
      value: await sha256Hex(compressedBytes)
    },
    payload
  };
}
