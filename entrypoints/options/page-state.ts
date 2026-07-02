export type OptionsWorkspacePage = "workspace" | "bookmarks" | "activity";

export function shouldLoadPrivateBookmarksState(
  activePage: OptionsWorkspacePage,
  privateBookmarksStateOverride?: unknown
): boolean {
  return activePage === "bookmarks" || typeof privateBookmarksStateOverride !== "undefined";
}
