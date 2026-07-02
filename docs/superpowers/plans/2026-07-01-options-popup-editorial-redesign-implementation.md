# Options + Popup Editorial Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the `options` and `popup` pages so they share one calmer editorial utility visual system, reduce explanatory copy, and make the bookmark manager feel like the primary workspace without changing sync or bookmark logic.

**Architecture:** Keep the existing rendering and event wiring intact, but reshape the markup and CSS around a new document-style layout system. The work is limited to the four entrypoint files so behavior stays stable while hierarchy, spacing, copy density, and component styling are rebuilt around the approved spec.

**Tech Stack:** WXT, TypeScript, HTML template strings, plain CSS, Vitest, pnpm, Safari MV2 build

## Global Constraints

- Do not change sync logic.
- Do not change bookmark storage logic.
- Do not change private bookmark mutation behavior.
- Do not change WebDAV behavior.
- Do not change browser support semantics.
- Redesign only `entrypoints/options/main.ts`, `entrypoints/options/options.css`, `entrypoints/popup/main.ts`, and `entrypoints/popup/popup.css`.
- Use warm monochrome surfaces: canvas `#FBFBFA`, surface `#FFFFFF`, border `#EAEAEA`, text `#2F3437`, muted text `#787774`.
- Use state colors only for semantic feedback: blue `#E1F3FE/#1F6C9F`, green `#EDF3EC/#346538`, red `#FDEBEC/#9F2F2D`, yellow `#FBF3DB/#956400`.
- No gradients, no heavy shadows, no colorful hero treatments, no new feature copy that re-explains the product.
- Preserve keyboard navigation, visible focus states, contrast, and disabled-state clarity.

---

### Task 1: Reframe the options page into an editorial settings workspace

**Files:**
- Modify: `/Users/fl/proj/onesync/entrypoints/options/main.ts`
- Modify: `/Users/fl/proj/onesync/entrypoints/options/options.css`
- Test: `pnpm exec tsc --noEmit`

**Interfaces:**
- Consumes: `renderPrivateFolderList(...)`, `renderPrivateVisibleNodes(...)`, `buildPrivateBookmarkManagerViewModel(...)`, existing DOM event hooks already wired inside `renderOptionsPage()`
- Produces: the same `renderOptionsPage(privateBookmarksStateOverride?)` public behavior, but with updated section structure, reduced copy, and revised CSS class usage for layout and styling

- [ ] **Step 1: Write a failing structure check by capturing the intended chapter layout in the render template**

Add or revise the major `renderOptionsPage()` section wrappers so the output includes this chapter order and labels:

```ts
<nav class="workspace-links" aria-label="Settings sections">
  <a class="workspace-link" href="#overview">Overview</a>
  <a class="workspace-link" href="#private-bookmark-manager">Bookmark manager</a>
  <a class="workspace-link" href="#remote-sync">Remote sync</a>
  <a class="workspace-link" href="#bundle-tools">Bundle</a>
  <a class="workspace-link" href="#activity-log">Activity</a>
</nav>
```

And reshape the right side to this skeleton:

```ts
<div class="workspace-main">
  <section class="content-section overview-panel" id="overview">...</section>
  <section class="content-section bookmark-section" id="private-bookmark-manager">...</section>
  <section class="content-section settings-section" id="remote-sync">...</section>
  <section class="content-section activity-section" id="activity-log">...</section>
</div>
```

- [ ] **Step 2: Run TypeScript to verify the in-progress template still compiles**

Run: `pnpm exec tsc --noEmit`

Expected: either PASS or a small set of template/class-name issues in `entrypoints/options/main.ts` only. Fix those before continuing.

- [ ] **Step 3: Implement the final markup rewrite for the options page**

Update `/Users/fl/proj/onesync/entrypoints/options/main.ts` so it follows this content model:

```ts
// Shorten support copy to one-line chapter notes.
// Keep state, counts, labels, and errors; remove repeated product explanations.
const overviewHeadingCopy = "Status and source";
const bookmarkHeadingCopy = "Shared private library";
const remoteHeadingCopy = "Shared endpoint";
const bundleHeadingCopy = "Manual snapshot tools";
const activityHeadingCopy = "Recent events";

// Keep the three-part bookmark workspace, but make the central list/tree column dominant.
// Keep actions grouped by Create / Organize / Remove in the details rail.
```

Specific markup requirements:

- Left rail keeps title, status, progress, section links, version, device id
- Overview keeps three compact summary cells
- Bookmark manager keeps `Directory`, `List / Tree`, and `Details`, but the wording and wrappers must read like one chapter instead of equal dashboard panels
- Remote sync heading becomes `Connection`
- Import/export heading becomes `Bundle`
- Activity heading becomes `Activity`
- All helper copy must be shortened to labels or compact metadata

- [ ] **Step 4: Implement the matching CSS rewrite for the options page**

Rewrite `/Users/fl/proj/onesync/entrypoints/options/options.css` around these principles:

```css
:root {
  --page-bg: #fbfbfa;
  --surface: #ffffff;
  --surface-muted: #f7f6f3;
  --border: #eaeaea;
  --text: #2f3437;
  --muted: #787774;
}

.page {
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 24px;
  padding: 24px;
}

.workspace-nav {
  position: sticky;
  top: 20px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
}

.bookmark-workspace {
  grid-template-columns: 220px minmax(0, 1fr) 260px;
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}
```

CSS outcomes required:

- warm monochrome palette
- crisp `8px` to `12px` radii
- no gradients
- no strong shadows
- tighter list rows inside bookmark manager
- directory reads like an index rail
- details rail reads like a quieter annotation column
- section surfaces read as chapters, not card piles

- [ ] **Step 5: Run TypeScript again and verify the options page compiles cleanly**

Run: `pnpm exec tsc --noEmit`

Expected: PASS

- [ ] **Step 6: Commit the options page redesign**

```bash
git add /Users/fl/proj/onesync/entrypoints/options/main.ts /Users/fl/proj/onesync/entrypoints/options/options.css
git commit -m "feat: redesign options workspace"
```

### Task 2: Rebuild the popup as a compact companion sheet

**Files:**
- Modify: `/Users/fl/proj/onesync/entrypoints/popup/main.ts`
- Modify: `/Users/fl/proj/onesync/entrypoints/popup/popup.css`
- Test: `pnpm exec tsc --noEmit`

**Interfaces:**
- Consumes: `loadPopupViewModel()`, `requestManualSync()`, `getPopupStateSummary(...)`, current popup button event handling
- Produces: the same popup behavior and actions, with a smaller editorial layout, reduced copy, and consistent styling with the options page

- [ ] **Step 1: Update the popup template to match the companion-sheet structure**

Modify `/Users/fl/proj/onesync/entrypoints/popup/main.ts` so the render order is:

```ts
<section class="popup-panel">
  <header class="popup-header">...</header>
  <section class="popup-state ...">...</section>
  <div class="popup-progress-card">...</div> <!-- only when syncing -->
  <dl class="popup-facts">...</dl>
  <p class="popup-notice popup-notice-error">...</p> <!-- only on error -->
  <div class="popup-actions">...</div>
</section>
```

Content rules:

- keep only state, progress, facts, error, and actions
- remove normal-state explanatory copy
- primary action label stays `Sync`
- secondary action label stays `Settings`

- [ ] **Step 2: Run TypeScript to catch any popup template regressions**

Run: `pnpm exec tsc --noEmit`

Expected: PASS or popup-only template errors; resolve them before continuing.

- [ ] **Step 3: Rewrite popup CSS to match the options-page visual system**

Update `/Users/fl/proj/onesync/entrypoints/popup/popup.css` with the same shared palette and surface rules:

```css
:root {
  --page-bg: #fbfbfa;
  --surface: #ffffff;
  --surface-muted: #f7f6f3;
  --border: #eaeaea;
  --text: #2f3437;
  --muted: #787774;
}

.popup-panel {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
}

.popup-actions {
  grid-template-columns: minmax(0, 1fr) auto;
}
```

CSS outcomes required:

- popup clearly looks like the same product family as the options page
- reduced visual noise
- facts grid is compact and readable
- primary button is dark, secondary button is light
- no heavy shadow, no gradient, no excess copy space

- [ ] **Step 4: Run TypeScript again to verify popup changes compile cleanly**

Run: `pnpm exec tsc --noEmit`

Expected: PASS

- [ ] **Step 5: Commit the popup redesign**

```bash
git add /Users/fl/proj/onesync/entrypoints/popup/main.ts /Users/fl/proj/onesync/entrypoints/popup/popup.css
git commit -m "feat: redesign popup companion sheet"
```

### Task 3: Validate the redesign end to end and adjust polish regressions

**Files:**
- Modify: `/Users/fl/proj/onesync/entrypoints/options/main.ts`
- Modify: `/Users/fl/proj/onesync/entrypoints/options/options.css`
- Modify: `/Users/fl/proj/onesync/entrypoints/popup/main.ts`
- Modify: `/Users/fl/proj/onesync/entrypoints/popup/popup.css`
- Test: `pnpm exec tsc --noEmit`
- Test: `pnpm test`
- Test: `pnpm build:safari`

**Interfaces:**
- Consumes: completed options and popup redesign from Tasks 1 and 2
- Produces: final polished editorial redesign that still builds, tests, and packages for Safari

- [ ] **Step 1: Run full static and behavior verification**

Run:

```bash
pnpm exec tsc --noEmit
pnpm test
pnpm build:safari
```

Expected:

- `pnpm exec tsc --noEmit` passes
- `pnpm test` passes all tests
- `pnpm build:safari` produces `.output/safari-mv2/*` successfully

- [ ] **Step 2: Fix any polish regressions revealed during verification**

Focus only on issues introduced by the redesign, such as:

```text
- text overflow in the bookmark manager rails
- broken responsive stacking at <=1260px and <=640px
- insufficient contrast on muted labels
- popup fact grid wrapping badly at narrow widths
- focus state loss on links, buttons, tabs, or disclosure controls
```

Do not add new features or change data behavior while fixing polish regressions.

- [ ] **Step 3: Re-run the full verification suite**

Run:

```bash
pnpm exec tsc --noEmit
pnpm test
pnpm build:safari
```

Expected: all three commands PASS cleanly.

- [ ] **Step 4: Commit the final editorial redesign pass**

```bash
git add /Users/fl/proj/onesync/entrypoints/options/main.ts /Users/fl/proj/onesync/entrypoints/options/options.css /Users/fl/proj/onesync/entrypoints/popup/main.ts /Users/fl/proj/onesync/entrypoints/popup/popup.css
git commit -m "feat: apply editorial redesign to options and popup"
```

## Spec Coverage Self-Review

- Goal coverage: Tasks 1 and 2 redesign `options` and `popup` into one shared system; Task 3 validates the result.
- Scope coverage: only the four entrypoint files are modified.
- Bookmark manager emphasis: Task 1 explicitly makes the bookmark manager the primary chapter and rebalances `Directory / List / Details`.
- Text reduction: Tasks 1 and 2 both require removing repetitive explanatory copy.
- Shared visual system: Tasks 1 and 2 both use the same palette, borders, and button hierarchy.
- No logic changes: captured in Global Constraints and repeated in Task 3 regression guardrails.

## Placeholder Self-Review

- No `TODO`, `TBD`, or deferred implementation markers remain.
- Each task includes exact file paths, concrete commands, and concrete expected outcomes.
- CSS and markup snippets are included for each implementation task.

## Type Consistency Self-Review

- `renderOptionsPage(...)` remains the entrypoint in Task 1.
- `loadPopupViewModel()` and `requestManualSync()` remain the popup data/action interfaces in Task 2.
- Verification commands are consistent across all tasks: `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build:safari`.
