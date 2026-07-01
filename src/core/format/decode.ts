import { gunzipBase64UrlToJson, sha256Hex } from "../shared/crypto";
import { CodecChecksumError, UnsupportedBundleVersionError } from "../shared/errors";
import { migrateBundle } from "./migrate";
import { parseEncodedBookmarkBundle, type BookmarkBundle, type EncodedBookmarkBundle } from "./schema";

export async function decodeBundle(input: EncodedBookmarkBundle): Promise<BookmarkBundle> {
  const encodedBundle = parseEncodedBookmarkBundle(input);

  if (encodedBundle.bundleVersion !== 1) {
    throw new UnsupportedBundleVersionError("Unsupported bundle version");
  }

  const { compressedBytes, json } = await gunzipBase64UrlToJson(encodedBundle.payload);
  const actualChecksum = await sha256Hex(compressedBytes);

  if (actualChecksum !== encodedBundle.checksum.value) {
    throw new CodecChecksumError("Encoded bundle checksum mismatch");
  }

  return migrateBundle(JSON.parse(json));
}
