import { UnsupportedBundleVersionError } from "../shared/errors";
import { type BookmarkBundle, parseBookmarkBundle } from "./schema";

export function migrateBundle(input: unknown): BookmarkBundle {
  if (
    typeof input === "object" &&
    input !== null &&
    "schemaVersion" in input &&
    (input as { schemaVersion?: unknown }).schemaVersion !== 1
  ) {
    throw new UnsupportedBundleVersionError("Unsupported bookmark bundle schema version");
  }

  return parseBookmarkBundle(input);
}
