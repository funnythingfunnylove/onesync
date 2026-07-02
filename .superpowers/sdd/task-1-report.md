# Task 1 Report

## Status

DONE

## Scope

- `/Users/fl/proj/onesync/src/ui/view-models/options.ts`
- `/Users/fl/proj/onesync/src/core/shared/types.ts`
- `/Users/fl/proj/onesync/tests/ui/options-view-model.test.ts`

## What Changed

1. Collapsed the private bookmark manager view model from tabbed `folders/tree` behavior to a single folder-scoped mode.
2. Removed `PrivateBookmarkTab`, `tabs`, `activeTab`, `isCollapsible`, and `isExpanded` from the view-model surface.
3. Added `childCount` to `PrivateBookmarkManagerNode`.
4. Updated the folder-selection logic so a selected bookmark resolves its parent folder as the visible folder context.
5. Reworked the focused tests to assert the new single-mode contract and removed tree-tab-specific cases.

## TDD Notes

1. Updated `tests/ui/options-view-model.test.ts` first.
2. Verified the focused test run failed before production changes:
   - `pnpm test -- --run tests/ui/options-view-model.test.ts`
3. Implemented the view-model and shared-type changes.
4. Re-ran the focused test file and then the full suite.

## Verification

- Focused: `pnpm test -- --run tests/ui/options-view-model.test.ts`
- Full suite: `pnpm test`

Both commands passed after the implementation.

## Self-Review

- Kept the change scoped to the task-owned files and the requested report file.
- Removed the now-dead tree flattening and expansion-state mapping from the view model.
- Preserved the existing move-destination and root-protection behavior in the new single-folder mode.
- Staged only the `PrivateBookmarkTab` removal in `src/core/shared/types.ts`, leaving an unrelated pre-existing `update-bookmark` edit out of this task commit.

## Concerns

None.
