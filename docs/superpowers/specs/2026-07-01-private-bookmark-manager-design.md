# Private Bookmark Manager Design

Status: Approved

Date: 2026-07-01

Approval: Approved in-thread by the user on 2026-07-01

## Goal

Add a private bookmark manager to `onesync` that works across browsers, shows the shared bookmark data in both a tree view and a folder view, supports basic bookmark management, and keeps the sync model coherent across Safari, Chrome, and Firefox.

## Current Workspace State

- The extension already has one shared bookmark bundle format and a WebDAV sync pipeline.
- Safari now falls back to extension-owned private bookmark storage when native bookmark APIs are unavailable.
- Chrome and Firefox still use native browser bookmark APIs as their primary local bookmark surface.
- The options and popup pages already expose sync status, WebDAV settings, bundle import/export, and bookmark-source messaging.
- There is not yet a UI for browsing or editing the private bookmark data model directly.

## Product Intent

The system should continue to have one remote truth source: the shared `BookmarkBundle`.

The new private bookmark manager is not a second sync universe. It is a cross-browser editor for the same shared bookmark data that `onesync` already synchronizes.

That means:

- Safari uses the private bookmark tree as its primary local carrier for the shared data.
- Chrome and Firefox continue to use native bookmarks as their primary local carrier.
- The private bookmark manager exists on all supported browsers.
- Edits made through the private bookmark manager change the shared bundle itself.
- On Chrome and Firefox, private-manager edits must also be applied back into native bookmarks immediately after save so the local browser view stays aligned.

## Requirements

1. The options page must expose a private bookmark manager on all supported browsers.
2. The manager must provide both a tree view and a folder-style view, with tabs to switch between them.
3. The manager must support the following management actions:
   - create folder
   - create bookmark
   - rename item
   - delete item
   - move item to another folder
4. Safari edits must persist to the extension-owned private bookmark storage and remain part of the same synchronized bundle used by other browsers.
5. Chrome and Firefox edits made through the private manager must update the shared bundle and then immediately apply that updated bundle back into native bookmarks.
6. The UI must make it clear whether the current browser is using native bookmarks or private bookmarks as its primary local carrier.
7. This feature must preserve the current sync model: one shared remote bundle, not separate native and private remote datasets.

## Non-Goals For This Iteration

- Drag-and-drop reordering
- Multi-select or bulk operations
- Search
- Undo/redo
- Dedicated bookmark editor page or route
- Popup-based management UI
- Browser-native/private side-by-side merge tooling

## Approaches Considered

### Approach A: Options-page private manager backed by the shared bundle

Add a private bookmark manager to the options page only. The UI edits a shared bundle abstraction, and browser-specific adapters handle local persistence and native re-application.

Pros:

- Fits the current product structure
- Keeps complex management UI out of the popup
- Preserves one remote data model
- Makes Safari support practical without forking the product
- Allows Chrome and Firefox to expose private editing without changing their primary bookmark mode

Cons:

- Requires new state and mutation layers
- Chrome/Firefox need careful native re-apply behavior to avoid confusing failures

Recommendation: yes

### Approach B: Safari-only private manager

Expose the manager only on Safari and leave Chrome/Firefox unchanged.

Pros:

- Smaller first implementation
- Matches the immediate Safari problem

Cons:

- Conflicts with the approved multi-browser product direction
- Creates UX drift between browsers
- Makes the private/shared data model harder to reason about

Recommendation: no

### Approach C: Separate private dataset and separate sync track

Treat private bookmarks as a second database with its own storage and remote sync behavior.

Pros:

- Cleaner local isolation
- Fewer interactions with native bookmarks

Cons:

- Breaks the approved product semantics
- Would force data duplication and migration rules
- Would make Safari data diverge from Chrome native sync behavior

Recommendation: no

## Recommended Architecture

Keep the existing canonical `BookmarkBundle` as the only shared data model and add two focused layers around it.

### 1. Shared private-bundle store

Add a small storage module dedicated to the private bookmark manager's persisted shared bundle state.

Responsibilities:

- load the private-manager bundle from extension storage
- initialize an empty normalized bundle if none exists
- save normalized bundle snapshots
- expose the storage key and access patterns in one place

This store is not responsible for rendering, mutation rules, or native-bookmark application.

### 2. Private bookmark mutators

Add a pure mutation layer that accepts an existing `BookmarkBundle` plus an operation payload and returns a new normalized bundle.

Operations:

- create folder
- create bookmark
- rename node
- delete node subtree or leaf
- move node to a destination folder

These mutators should be isolated from browser APIs so they are easy to unit test.

### 3. Browser-local application layer

Reuse and extend the current bookmark adapter so the system can apply a shared bundle to the active browser-local surface.

- Safari: save shared data into the private bookmark storage-backed tree
- Chrome/Firefox: apply the saved shared data back into native bookmarks immediately

This preserves the approved behavior that private-manager edits are shared edits, not a detached local scratchpad.

## Data Model

The feature continues to use the current canonical bundle:

```json
{
  "kind": "onesync.bookmarks",
  "schemaVersion": 1,
  "revision": "2026-07-01T12:00:00.000Z#device-1#sync",
  "deviceId": "device-1",
  "generatedAt": "2026-07-01T12:00:00.000Z",
  "roots": {
    "toolbar": "root-toolbar",
    "menu": "root-menu",
    "mobile": "root-mobile",
    "unfiled": "root-unfiled"
  },
  "nodes": {},
  "tombstones": [],
  "meta": {
    "client": "onesync",
    "clientVersion": "0.1.3"
  }
}
```

No second bundle type is introduced.

The private manager edits this same structure directly.

## UI Structure

Add a new `Private bookmarks` management section to the options page.

This section appears on all supported browsers.

### Mode messaging

The section should include one concise browser-sensitive hint:

- Safari: `This is your primary local bookmark workspace.`
- Chrome/Firefox: `Changes here update shared data and are applied back to browser bookmarks.`

This messaging complements the existing bookmark-source label rather than replacing it.

### Layout

The section contains:

1. header row with title, mode hint, and item count
2. tabs:
   - `Folders`
   - `Tree`
3. management toolbar with:
   - new folder
   - new bookmark
   - rename
   - move to
   - delete

The UI should stay quiet and utility-first, matching the rest of the extension instead of turning into a card-heavy app surface.

### Default view

Default to `Folders`.

Reasons:

- folder-style browsing is easier for repeated management work
- tree view remains available for structural inspection and folder moves
- it keeps the first-use experience calmer

### Folder view

The `Folders` tab behaves like a compact file manager.

Left pane:

- semantic root folders and nested folders
- active selection styling
- indentation for folder depth

Right pane:

- breadcrumb/path for the selected folder
- direct children of the selected folder
- bookmarks and folders listed separately only if the existing visual density requires it; otherwise one unified ordered list is acceptable
- per-row actions for rename, move, delete

### Tree view

The `Tree` tab shows the entire bundle hierarchy.

Behavior:

- folders are collapsible
- expanded state is UI-local and does not affect stored data
- each node row exposes the same basic actions as folder view
- bookmarks show title and URL

## Interaction Design

Use immediate actions instead of a batch "Save all changes" workflow.

### Create folder

- user chooses the current or selected folder as parent
- simple inline or small panel form with title only
- save immediately after validation

### Create bookmark

- user chooses the current or selected folder as parent
- form fields:
  - title
  - URL
- validate URL before commit

### Rename

- open inline edit or a small focused form
- preserve node type
- save immediately

### Delete

- require confirmation
- deleting a folder deletes its subtree from the shared bundle
- deletion should also create or preserve tombstones if needed by existing sync semantics

### Move to

- no drag-and-drop in this iteration
- use a destination-folder picker
- prevent invalid moves such as:
  - moving a root node
  - moving a folder into itself
  - moving a folder into one of its descendants

## Data Flow

### Page load

1. read options state
2. load the private-manager bundle
3. derive folder/tree view models from the bundle
4. render current tab and selection state

### Edit flow

1. user triggers an operation
2. mutator produces a new normalized bundle in memory
3. bundle is saved to the private-manager shared storage
4. browser-local apply step runs:
   - Safari: persist to private local carrier
   - Chrome/Firefox: apply to native bookmarks
5. UI refreshes from the saved bundle state
6. activity log records the action or failure

### Sync flow interaction

The private manager should remain a first-class editor for the shared bundle, not a disconnected cache.

That means:

- exporting a bundle should reflect private-manager changes
- importing a bundle should refresh the private manager
- sync application from WebDAV should refresh the private manager
- Chrome/Firefox native apply after sync and after private-manager edit should both use the same bundle application path

## Failure Handling

### Validation failures

- block the action
- keep the user in context
- show short inline error copy near the form

### Shared bundle save failure

- do not update the rendered state as if the save succeeded
- show a page-level error message
- log the failure in activity log

### Native apply failure on Chrome/Firefox

- keep the saved shared bundle
- show a message that shared data was saved but browser bookmarks were not updated
- append a structured activity-log error
- allow the user to retry through sync or a future explicit re-apply action

### Safari local persistence failure

- treat as a failed save because Safari's private local carrier is its primary local surface
- show error and log it

## Testing Strategy

### Unit tests

Add tests for:

- private bundle initialization
- create folder
- create bookmark
- rename bookmark and folder
- delete bookmark and folder subtree
- move bookmark
- reject illegal moves
- folder and tree view-model derivation

### Adapter tests

Add browser adapter tests for:

- Safari private save/load path
- Chrome/Firefox private-manager save followed by native apply
- apply failure behavior preserving shared bundle state

### UI tests

Add focused tests for:

- mode messaging
- tab switching
- folder selection behavior
- action availability in each view

### Regression tests

Preserve and extend the current sync tests so that:

- Safari fallback continues to work
- private-manager edits continue to feed the same shared bundle used by sync
- Chrome/Firefox native bookmark application still works after the new manager path is added

## File-Level Plan

- `src/core/browser/bookmarks.ts`
  - expose current bookmark storage mode
  - expose shared/private bundle load-save helpers or delegate to a new store module
  - support applying private-manager edits back to native bookmarks when available
- `src/core/browser/storage.ts` or a new `src/core/browser/private-bookmarks.ts`
  - store the private-manager shared bundle state
- `src/core/format/schema.ts`
  - reuse existing normalization helpers
- `src/core/shared/types.ts`
  - add runtime message types for private-manager actions and reads
- `entrypoints/background.ts`
  - handle private-manager load and mutation messages
  - persist changes
  - trigger browser-local application
  - append activity-log entries
- `src/ui/view-models/options.ts`
  - load the private-manager view state
  - send create/rename/delete/move operations
- `entrypoints/options/main.ts`
  - render tabs, folder pane, tree pane, forms, and action handlers
- `tests/browser/*.test.ts`
  - cover new storage and apply behavior
- `tests/ui/*.test.ts`
  - cover view-model and helper logic

## Open Design Decisions Resolved In This Spec

- The manager is cross-browser, not Safari-only.
- It lives in the options page, not the popup.
- It exposes both tree and folder views via tabs.
- It supports only basic management in this iteration.
- It edits the same shared remote-sync data model.
- Chrome/Firefox private-manager edits apply back into native bookmarks immediately.

## Implementation Boundaries

The implementation should stay narrowly aligned with this spec.

Specifically, do not add:

- a separate bookmark route
- drag-and-drop sorting
- background live conflict-resolution UI
- search or filtering
- bulk editing
- manual bundle/version-selection tools beyond the existing import/export flow
