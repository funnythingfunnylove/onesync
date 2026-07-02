# Bookmark Manager Unified List Redesign

Status: Drafted for review

Date: 2026-07-02

Approval: Direction approved in-thread by the user on 2026-07-02; written spec pending review

## Goal

Redesign the `Bookmark manager` page in `onesync` so it feels like a more mature management surface and a less mode-heavy browser.

The redesign should:

- remove the `Folders` / `Tree` view toggle
- keep folder navigation available
- make search, open, edit, and delete feel faster and clearer
- reduce visual fragmentation
- preserve the existing mutation capabilities and sync semantics

## Scope

This redesign is limited to the options-page bookmark-manager experience.

In scope:

1. `entrypoints/options/main.ts`
2. `entrypoints/options/options.css`
3. `src/ui/view-models/options.ts`

Out of scope:

- sync pipeline changes
- bookmark mutation semantics
- WebDAV behavior
- private/native bookmark storage rules
- popup redesign
- drag-and-drop
- multi-select
- bulk actions

## Current Problems

The current bookmark manager is functional, but it still behaves too much like a developer-facing internal tool.

The main issues are:

1. The `Folders` / `Tree` toggle asks the user to choose a browsing mode before they can do work.
2. The visual weight is split across too many competing surfaces.
3. The list rows feel card-like and fragmented instead of calm and scannable.
4. The most common actions are not visually centered around the real task loop:
   - choose a folder
   - search current contents
   - open a bookmark
   - edit title and URL
   - delete when needed

## Product Intent

`onesync` is a utility page, not a content app and not a generic admin dashboard.

The bookmark manager should therefore feel like:

- a compact desktop organizer
- a quiet workspace for repeated maintenance
- a list-first management tool

It should not feel like:

- a two-mode explorer
- a nested card board
- a visual demo of bookmark structure

## Approaches Considered

### Approach A: Unified list view with left folder rail

Keep the left folder rail, remove the `Folders` / `Tree` toggle, and treat the right side as one consistent management surface.

Pros:

- simplest mental model
- preserves familiar folder navigation
- keeps the UI dense without becoming confusing
- best fit for repeated management work

Cons:

- deep hierarchy inspection becomes less explicit than a dedicated tree mode

Recommendation: yes

### Approach B: Finder-style structural browser

Use a heavier two-pane file-browser metaphor with stronger emphasis on structure and path traversal.

Pros:

- hierarchy is very clear
- works well for deep folder nesting

Cons:

- adds more chrome than this page needs
- shifts the page toward browsing instead of editing

Recommendation: no

### Approach C: Table-first admin view

Flatten the page into a more database-like table with columns for title, URL, folder, and actions.

Pros:

- efficient for large datasets
- strong management feel

Cons:

- loses too much of the bookmark-library character
- makes folders feel secondary instead of foundational

Recommendation: no

## Chosen Direction

Use a unified list view with a persistent left folder rail.

The left side remains the place where the user chooses the current folder context.

The right side becomes one consistent workspace with:

1. page heading and compact metadata
2. search field at the top right
3. action row for creating folders and bookmarks
4. one unified content list

There is no alternate browsing mode.

## Information Architecture

### Left rail

The left rail remains, but its job is narrowed:

- show available folders
- show nesting through indentation
- indicate the current folder clearly
- allow fast folder switching

It is not a view switcher and it does not own editing actions.

### Right workspace

The right side becomes the only active management area.

It contains:

1. section header
2. current-folder summary
3. search field aligned to the upper right
4. creation and move actions
5. unified rows for folder and bookmark items

This makes the page feel more like one coherent tool surface and less like multiple panels competing for attention.

## Interaction Model

### Folder selection

- Clicking a folder in the left rail changes the active folder.
- The right workspace refreshes to show the direct contents of that folder.

### Search

- Search filters the currently visible content list.
- Search matches bookmark title, bookmark URL, and folder title.
- Search does not switch folder context automatically.

This keeps the query behavior local and predictable.

### Row behavior

Every visible row uses one stable interaction pattern.

#### Folder rows

- Show folder title as primary text.
- Show a compact secondary description, such as item count or folder role when available.
- Clicking the row enters that folder.
- `Edit` is available on the right.

#### Bookmark rows

- Show bookmark title as primary text.
- Show URL as secondary text and render it as a direct clickable link.
- `Edit` is available on the right.

### Edit mode

Editing stays inline.

When `Edit` is clicked:

- the row transforms into an inline editor
- title becomes editable
- bookmark rows also expose editable URL
- actions change to:
  - `Save`
  - `Cancel`
  - `Delete`

`Delete` appears only in edit mode so the default page state stays quieter and safer.

### Create and move actions

The top toolbar continues to support:

- create folder
- create bookmark
- move selection

These actions stay visible in the workspace header area so they remain easy to find.

## Visual Design Direction

The page should move further toward a quiet desktop-utility look.

### Design principles

- fewer heavy card boundaries
- more list rhythm and row alignment
- clearer separation between navigation and content
- stronger emphasis on scanability
- less visual novelty

### Specific visual changes

1. Replace the current mixed card rows with flatter list rows.
2. Remove the `Folders` / `Tree` tab strip entirely.
3. Tighten the content toolbar so the search field and actions feel part of one tool header.
4. Make URLs feel like secondary metadata, not standalone blocks.
5. Use restrained background contrast between:
   - left folder rail
   - right content area
   - active row
6. Preserve visible focus states and keyboard clarity.

## Accessibility Requirements

The redesign must preserve or improve the following:

- clear keyboard focus on folder rows, item rows, and action buttons
- sufficient text and border contrast
- explicit labeling for search and row actions
- `role="alert"` or equivalent behavior for error messages already exposed through page notices
- no reliance on color alone for active or destructive states

## Implementation Notes

The redesign should stay close to current code boundaries.

### View-model changes

The view model no longer needs to present a `tabs` array or an `activeTab`-driven content mode for the bookmark manager page.

Instead, it should always return:

- folder entries for the left rail
- the selected folder
- visible direct children of that folder
- existing action availability

Any remaining tree-specific expansion logic should be removed if it is no longer needed by the UI.

### Rendering changes

`entrypoints/options/main.ts` should:

- stop rendering the private-tab switcher
- stop deriving bookmark-manager copy from `folders` vs `tree` mode
- render one stable header + list structure
- continue to support inline editing and direct URL links

### Styling changes

`entrypoints/options/options.css` should:

- simplify bookmark workspace layout
- remove private-tab styling that is no longer used
- shift row styling from compact card blocks to cleaner list rows
- refine the header, search, and action spacing

## Non-Goals For This Iteration

- recursive expand/collapse browser
- breadcrumb-heavy navigation
- inspector side panel
- drag-and-drop ordering
- bulk edit workflow
- confirmation modal for delete

Delete remains intentionally gated behind inline edit mode for now.

## Testing Expectations

Verification should include:

1. `Bookmark manager` page renders with no `Folders` / `Tree` toggle
2. folder rail still changes the active folder
3. search filters visible rows correctly
4. bookmark URLs remain directly clickable
5. inline edit works for:
   - folder rename
   - bookmark title edit
   - bookmark URL edit
6. delete action appears only in edit mode
7. desktop and mobile-width layouts avoid overlap and clipping

## Open Decisions Resolved In This Spec

The following decisions are explicit and should not be re-litigated during implementation unless a blocking issue appears:

- keep the left folder rail
- remove the `Folders` / `Tree` mode switch entirely
- keep inline row editing
- keep URL as direct clickable text
- show delete only inside edit state
- keep search scoped to the current folder view
