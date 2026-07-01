# Task 6 Report: Focused Regression Coverage And Full Verification

## Scope Closed

- Added explicit regression coverage for native carrier apply failures so the shared bundle is preserved and the error message clearly states that browser bookmarks were not updated.
- Added explicit carrier-coherence coverage so the private manager reloads the saved shared bundle after a native apply failure instead of drifting back to stale native bookmark state.
- Tightened move regression coverage so moved nodes also refresh their own timestamp, preserving merge-sensitive move semantics.
- Added browser-sensitive mode-hint coverage in both view-state and options view-model tests.
- Added background handling that records an activity-log error when shared data is saved but native browser bookmark re-apply fails.

## Files Changed

- `src/core/browser/bookmarks.ts`
- `src/core/browser/private-bookmarks.ts`
- `entrypoints/background.ts`
- `tests/browser/private-bookmarks.test.ts`
- `tests/private-bookmarks/mutators.test.ts`
- `tests/private-bookmarks/view-state.test.ts`
- `tests/browser/bookmarks.test.ts`
- `tests/ui/options-view-model.test.ts`

## Red-Green Verification

### Targeted regression suite before the fix

Command:

```bash
pnpm test tests/browser/private-bookmarks.test.ts tests/private-bookmarks/mutators.test.ts tests/private-bookmarks/view-state.test.ts tests/browser/bookmarks.test.ts tests/ui/options-view-model.test.ts
```

Result:

```text
FAIL tests/browser/bookmarks.test.ts > bookmark adapter > preserves the saved shared bundle when native apply fails on Chrome or Firefox
  expected error matching /not updated/i
  received: Failed to apply bookmark bundle locally: Native bookmarks write blocked

FAIL tests/browser/private-bookmarks.test.ts > private manager carrier integration > preserves the saved shared bundle when native apply fails on Chrome or Firefox
  expected error matching /not updated/i
  received: Failed to apply bookmark bundle locally: Native bookmarks write blocked

Test Files  2 failed | 3 passed (5)
Tests       2 failed | 49 passed (51)
```

### Targeted regression suite after the fix

Command:

```bash
pnpm test tests/browser/private-bookmarks.test.ts tests/private-bookmarks/mutators.test.ts tests/private-bookmarks/view-state.test.ts tests/browser/bookmarks.test.ts tests/ui/options-view-model.test.ts
```

Result:

```text
Test Files  5 passed (5)
Tests       51 passed (51)
Duration    385ms
```

## Full Verification

### TypeScript

Command:

```bash
pnpm exec tsc --noEmit
```

Result:

```text
PASS (exit code 0, no output)
```

### Full test suite

Command:

```bash
pnpm test
```

Result:

```text
Test Files  19 passed (19)
Tests       106 passed (106)
Duration    970ms
```

### Safari production build

Command:

```bash
pnpm build:safari
```

Result:

```text
WXT 0.20.27
Built safari-mv2 for production successfully
background.js 115.31 kB
Total size 299.8 kB
Finished in 506 ms
```

## Notes

- The focused suite already passed before adding the new Task 6 regression cases, so the red step here came from the newly added native-apply failure coverage rather than from an existing unchecked failure in older tests.
- No placeholder `TODO` or `TBD` markers were introduced.
