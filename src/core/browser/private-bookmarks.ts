import type { BookmarkBundle } from "../format/schema";
import type { SyncConfig } from "../state/config";
import {
  applySharedBundleLocally,
  clearSavedSharedBundleFallback,
  getBookmarkStorageMode,
  loadSharedBookmarkBundle,
  type BookmarkStorageMode,
  listLocalBookmarks
} from "./bookmarks";

export async function loadPrivateManagerBundle(config: SyncConfig): Promise<BookmarkBundle> {
  return loadSharedBookmarkBundle(config);
}

export async function savePrivateManagerBundle(
  config: SyncConfig,
  bundle: BookmarkBundle,
  mode: BookmarkStorageMode
): Promise<BookmarkBundle> {
  await applySharedBundleLocally(bundle, mode);
  await clearSavedSharedBundleFallback();
  return listLocalBookmarks(config);
}
