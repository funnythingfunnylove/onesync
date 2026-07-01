import type { BookmarkBundle } from "../format/schema";
import type { SyncConfig } from "../state/config";
import {
  applySharedBundleLocally,
  clearSavedSharedBundleFallback,
  getBookmarkStorageMode,
  loadSavedSharedBundleFallback,
  type BookmarkStorageMode,
  listLocalBookmarks
} from "./bookmarks";

function snapshotBundleForManager(bundle: BookmarkBundle, config: SyncConfig): BookmarkBundle {
  const generatedAt = new Date().toISOString();

  return {
    ...bundle,
    revision: `${generatedAt}#${config.deviceId}#snapshot`,
    deviceId: config.deviceId,
    generatedAt
  };
}

export async function loadPrivateManagerBundle(config: SyncConfig): Promise<BookmarkBundle> {
  if (getBookmarkStorageMode() === "native") {
    const savedFallbackBundle = await loadSavedSharedBundleFallback();

    if (savedFallbackBundle) {
      return snapshotBundleForManager(savedFallbackBundle, config);
    }
  }

  return listLocalBookmarks(config);
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
