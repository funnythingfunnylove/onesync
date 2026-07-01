# Task 3 Report: Project Shared Bundles Into Folder And Tree View State

Status: done

Summary:
- Added `src/core/private-bookmarks/view-state.ts` as a pure projection layer for private bookmark UI state.
- Added `tests/private-bookmarks/view-state.test.ts` covering folder-pane projection, tree projection, mode hints, and item counts.
- Kept the module browser-API free and reused `BookmarkStorageMode` plus `countBookmarkItems` from the existing codebase.

Verification:
- `pnpm test tests/private-bookmarks/view-state.test.ts`
- `pnpm test`

Concern:
- `pnpm exec tsc --noEmit` currently fails in `src/core/sync/merge.ts` with an unrelated existing type error about assigning `children` on a merged bookmark node. I did not change that file as part of this task.

Fix round notes:
- Red/green evidence: the focused `tests/private-bookmarks/view-state.test.ts` suite passed after splitting the folder-pane projection from the recursive tree projection and adding the explicit `unavailable` mode hint.
- Folder-pane projection now keeps only direct children in `currentFolder.children`; nested descendants remain in the tree projection only.
