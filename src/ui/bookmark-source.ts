import type { BookmarkStorageMode } from "../core/browser/bookmarks";

export function getBookmarkSourceLabel(mode: BookmarkStorageMode): string {
  switch (mode) {
    case "native":
      return "Browser bookmarks";
    case "private":
      return "Private extension bookmarks";
    default:
      return "Bookmark access unavailable";
  }
}

export function getBookmarkSourceDescription(mode: BookmarkStorageMode): string {
  switch (mode) {
    case "native":
      return "OneSync is reading and writing the browser's native bookmark tree.";
    case "private":
      return "OneSync is syncing its own private bookmark store and is not changing Safari's native bookmarks.";
    default:
      return "OneSync cannot reach native bookmarks or its private bookmark store in this runtime.";
  }
}
