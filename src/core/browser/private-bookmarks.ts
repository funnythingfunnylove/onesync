import type { BookmarkBundle } from "../format/schema";
import type { SyncConfig } from "../state/config";
import { applySharedBundleLocally, type BookmarkStorageMode, listLocalBookmarks } from "./bookmarks";

export async function loadPrivateManagerBundle(config: SyncConfig): Promise<BookmarkBundle> {
  return listLocalBookmarks(config);
}

export async function savePrivateManagerBundle(
  config: SyncConfig,
  bundle: BookmarkBundle,
  mode: BookmarkStorageMode
): Promise<BookmarkBundle> {
  await applySharedBundleLocally(bundle, mode);
  return listLocalBookmarks(config);
}
