# Private Bookmark Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cross-browser private bookmark manager to `onesync` that exposes folder and tree views, supports basic bookmark management, and keeps edits in the same shared bookmark bundle used by sync.

**Architecture:** Keep the shared `BookmarkBundle` as the only synchronized data model. Add a small private-bundle store plus pure bundle mutators, then wire the options page to edit that shared bundle through background runtime messages. Safari persists edits into its private local carrier, while Chrome and Firefox save the shared bundle and immediately apply it back to native bookmarks.

**Tech Stack:** WXT, TypeScript, `wxt/browser`, Vitest, existing `BookmarkBundle` schema helpers, standard HTML/CSS entrypoints

## Global Constraints

- The options page must expose a private bookmark manager on all supported browsers.
- The manager must provide both a tree view and a folder-style view, with tabs to switch between them.
- The manager must support the following management actions: create folder, create bookmark, rename item, delete item, move item to another folder.
- Safari edits must persist to the extension-owned private bookmark storage and remain part of the same synchronized bundle used by other browsers.
- Chrome and Firefox edits made through the private manager must update the shared bundle and then immediately apply that updated bundle back into native bookmarks.
- The UI must make it clear whether the current browser is using native bookmarks or private bookmarks as its primary local carrier.
- This feature must preserve the current sync model: one shared remote bundle, not separate native and private remote datasets.
- Do not add drag-and-drop reordering, multi-select, search, undo/redo, popup management UI, or a separate bookmark route.
- Follow TDD: write the failing test first, run it red, implement minimally, run it green.

---

## File Structure

- `src/core/browser/bookmarks.ts`: existing bookmark adapter; extend it to expose shared/private bundle load-save and native re-apply helpers
- `src/core/browser/private-bookmarks.ts`: new storage-backed shared-bundle store for the private manager
- `src/core/private-bookmarks/mutators.ts`: new pure bundle mutation functions and operation types
- `src/core/private-bookmarks/view-state.ts`: new bundle-to-UI projection helpers for tree and folder views
- `src/core/shared/types.ts`: runtime message types for private-manager load and mutation requests
- `entrypoints/background.ts`: background handlers for reading and mutating private bookmark manager state
- `src/ui/view-models/options.ts`: options-page RPC helpers for loading private-manager state and dispatching operations
- `entrypoints/options/main.ts`: private-manager rendering, tabs, forms, action handlers
- `entrypoints/options/options.css`: private-manager layout and control styling
- `tests/browser/private-bookmarks.test.ts`: store and browser-apply behavior
- `tests/private-bookmarks/mutators.test.ts`: pure mutation tests
- `tests/private-bookmarks/view-state.test.ts`: folder/tree projection tests
- `tests/ui/options-view-model.test.ts`: options runtime message tests

### Task 1: Add The Private Manager Store And Runtime Message Types

**Files:**
- Create: `src/core/browser/private-bookmarks.ts`
- Modify: `src/core/shared/types.ts`
- Test: `tests/browser/private-bookmarks.test.ts`

**Interfaces:**
- Consumes:
  - `type BookmarkBundle` from `src/core/format/schema.ts`
  - `type SyncConfig` from `src/core/state/config.ts`
- Produces:
  - `loadPrivateManagerBundle(config: SyncConfig): Promise<BookmarkBundle>`
  - `savePrivateManagerBundle(bundle: BookmarkBundle): Promise<BookmarkBundle>`
  - `type PrivateBookmarkTab = "folders" | "tree"`
  - `type PrivateBookmarkOperation =
      | { type: "create-folder"; parentId: string; title: string }
      | { type: "create-bookmark"; parentId: string; title: string; url: string }
      | { type: "rename-node"; nodeId: string; title: string }
      | { type: "delete-node"; nodeId: string }
      | { type: "move-node"; nodeId: string; destinationFolderId: string }`
  - runtime messages:
    - `{ type: "onesync:get-private-bookmarks" }`
    - `{ type: "onesync:mutate-private-bookmarks"; payload: { operation: PrivateBookmarkOperation } }`

- [ ] **Step 1: Write the failing store and message-shape tests**

```ts
// tests/browser/private-bookmarks.test.ts
import { describe, expect, it } from "vitest";
import type { RuntimeMessage } from "../../src/core/shared/types";
import { loadPrivateManagerBundle } from "../../src/core/browser/private-bookmarks";

describe("private manager store", () => {
  it("loads a normalized bundle from extension storage", async () => {
    await expect(loadPrivateManagerBundle(sampleConfig)).resolves.toMatchObject({
      kind: "onesync.bookmarks"
    });
  });

  it("accepts the private bookmark runtime messages", () => {
    const message: RuntimeMessage = { type: "onesync:get-private-bookmarks" };
    expect(message.type).toBe("onesync:get-private-bookmarks");
  });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm test tests/browser/private-bookmarks.test.ts`
Expected: FAIL because `src/core/browser/private-bookmarks.ts` and the new runtime message variants do not exist.

- [ ] **Step 3: Add the minimal store module and runtime message types**

```ts
// src/core/browser/private-bookmarks.ts
import { normalizeBundle, type BookmarkBundle } from "../format/schema";
import type { SyncConfig } from "../state/config";
import { browser } from "wxt/browser";

const PRIVATE_MANAGER_BUNDLE_KEY = "onesync.privateManagerBundle";

function createEmptyPrivateManagerBundle(config: SyncConfig): BookmarkBundle {
  const generatedAt = new Date().toISOString();
  return normalizeBundle({
    kind: "onesync.bookmarks",
    schemaVersion: 1,
    revision: `${generatedAt}#${config.deviceId}#private`,
    deviceId: config.deviceId,
    generatedAt,
    roots: {
      toolbar: "onesync.synthetic.toolbar",
      menu: "onesync.synthetic.menu",
      mobile: "onesync.synthetic.mobile",
      unfiled: "onesync.synthetic.unfiled"
    },
    nodes: {
      "onesync.synthetic.toolbar": {
        id: "onesync.synthetic.toolbar",
        type: "folder",
        title: "Bookmarks Bar",
        children: [],
        addedAt: generatedAt,
        updatedAt: generatedAt
      },
      "onesync.synthetic.menu": {
        id: "onesync.synthetic.menu",
        type: "folder",
        title: "Bookmarks Menu",
        children: [],
        addedAt: generatedAt,
        updatedAt: generatedAt
      },
      "onesync.synthetic.mobile": {
        id: "onesync.synthetic.mobile",
        type: "folder",
        title: "Mobile Bookmarks",
        children: [],
        addedAt: generatedAt,
        updatedAt: generatedAt
      },
      "onesync.synthetic.unfiled": {
        id: "onesync.synthetic.unfiled",
        type: "folder",
        title: "Unfiled Bookmarks",
        children: [],
        addedAt: generatedAt,
        updatedAt: generatedAt
      }
    },
    tombstones: [],
    meta: {
      client: "onesync",
      clientVersion: "0.1.3"
    }
  });
}

export async function loadPrivateManagerBundle(config: SyncConfig): Promise<BookmarkBundle> {
  const result = await browser.storage.local.get(PRIVATE_MANAGER_BUNDLE_KEY);
  const bundle = result[PRIVATE_MANAGER_BUNDLE_KEY] as BookmarkBundle | undefined;
  return bundle ? normalizeBundle(bundle) : createEmptyPrivateManagerBundle(config);
}

export async function savePrivateManagerBundle(bundle: BookmarkBundle): Promise<BookmarkBundle> {
  const normalized = normalizeBundle(bundle);
  await browser.storage.local.set({ [PRIVATE_MANAGER_BUNDLE_KEY]: normalized });
  return normalized;
}
```

```ts
// src/core/shared/types.ts
export type PrivateBookmarkOperation =
  | { type: "create-folder"; parentId: string; title: string }
  | { type: "create-bookmark"; parentId: string; title: string; url: string }
  | { type: "rename-node"; nodeId: string; title: string }
  | { type: "delete-node"; nodeId: string }
  | { type: "move-node"; nodeId: string; destinationFolderId: string };

export type RuntimeMessage =
  | { type: "onesync:get-private-bookmarks" }
  | { type: "onesync:mutate-private-bookmarks"; payload: { operation: PrivateBookmarkOperation } }
  // keep existing variants below
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm test tests/browser/private-bookmarks.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/browser/private-bookmarks.ts src/core/shared/types.ts tests/browser/private-bookmarks.test.ts
git commit -m "feat: add private bookmark manager store"
```

### Task 2: Implement Pure Bundle Mutators For Basic Bookmark Management

**Files:**
- Create: `src/core/private-bookmarks/mutators.ts`
- Test: `tests/private-bookmarks/mutators.test.ts`

**Interfaces:**
- Consumes:
  - `type BookmarkBundle`
  - `type PrivateBookmarkOperation`
- Produces:
  - `applyPrivateBookmarkOperation(bundle: BookmarkBundle, operation: PrivateBookmarkOperation, deviceId: string): BookmarkBundle`
  - `assertMovableNode(bundle: BookmarkBundle, nodeId: string, destinationFolderId: string): void`

- [ ] **Step 1: Write failing tests for every supported operation**

```ts
// tests/private-bookmarks/mutators.test.ts
it("creates a folder under the selected parent", () => {
  const next = applyPrivateBookmarkOperation(bundle, {
    type: "create-folder",
    parentId: bundle.roots.toolbar,
    title: "Work"
  }, "device-1");

  expect(Object.values(next.nodes).some((node) => node.type === "folder" && node.title === "Work")).toBe(true);
});

it("rejects moving a folder into its own descendant", () => {
  expect(() =>
    applyPrivateBookmarkOperation(bundle, {
      type: "move-node",
      nodeId: "folder-a",
      destinationFolderId: "folder-b"
    }, "device-1")
  ).toThrow(/descendant/i);
});
```

- [ ] **Step 2: Run the mutator test file to verify it fails**

Run: `pnpm test tests/private-bookmarks/mutators.test.ts`
Expected: FAIL because `applyPrivateBookmarkOperation` does not exist.

- [ ] **Step 3: Implement the minimal pure mutator layer**

```ts
// src/core/private-bookmarks/mutators.ts
export function applyPrivateBookmarkOperation(
  bundle: BookmarkBundle,
  operation: PrivateBookmarkOperation,
  deviceId: string
): BookmarkBundle {
  switch (operation.type) {
    case "create-folder":
      return createFolder(bundle, operation.parentId, operation.title, deviceId);
    case "create-bookmark":
      return createBookmark(bundle, operation.parentId, operation.title, operation.url, deviceId);
    case "rename-node":
      return renameNode(bundle, operation.nodeId, operation.title, deviceId);
    case "delete-node":
      return deleteNode(bundle, operation.nodeId, deviceId);
    case "move-node":
      return moveNode(bundle, operation.nodeId, operation.destinationFolderId, deviceId);
  }
}
```

- [ ] **Step 4: Run the mutator tests to verify they pass**

Run: `pnpm test tests/private-bookmarks/mutators.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/private-bookmarks/mutators.ts tests/private-bookmarks/mutators.test.ts
git commit -m "feat: add private bookmark bundle mutators"
```

### Task 3: Project Shared Bundles Into Folder And Tree View State

**Files:**
- Create: `src/core/private-bookmarks/view-state.ts`
- Test: `tests/private-bookmarks/view-state.test.ts`

**Interfaces:**
- Consumes:
  - `type BookmarkBundle`
  - `type BookmarkStorageMode`
- Produces:
  - `type PrivateBookmarksViewState`
  - `buildPrivateBookmarksViewState(bundle: BookmarkBundle, mode: BookmarkStorageMode, selectedFolderId?: string): PrivateBookmarksViewState`

- [ ] **Step 1: Write failing view-state tests for tabs, folder contents, and tree projection**

```ts
// tests/private-bookmarks/view-state.test.ts
it("builds a folder-pane view with the selected folder contents", () => {
  const state = buildPrivateBookmarksViewState(bundle, "private", bundle.roots.toolbar);
  expect(state.selectedFolderId).toBe(bundle.roots.toolbar);
  expect(state.currentFolder?.children.length).toBeGreaterThan(0);
});

it("builds a complete tree view for the bundle roots", () => {
  const state = buildPrivateBookmarksViewState(bundle, "native");
  expect(state.tree.length).toBe(4);
});
```

- [ ] **Step 2: Run the view-state tests to verify they fail**

Run: `pnpm test tests/private-bookmarks/view-state.test.ts`
Expected: FAIL because `src/core/private-bookmarks/view-state.ts` does not exist.

- [ ] **Step 3: Implement the minimal bundle-to-view projection helpers**

```ts
// src/core/private-bookmarks/view-state.ts
export function buildPrivateBookmarksViewState(
  bundle: BookmarkBundle,
  mode: BookmarkStorageMode,
  selectedFolderId = bundle.roots.toolbar
): PrivateBookmarksViewState {
  return {
    mode,
    selectedFolderId,
    itemCount: countBookmarkItems(bundle),
    modeHint: mode === "private"
      ? "This is your primary local bookmark workspace."
      : "Changes here update shared data and are applied back to browser bookmarks.",
    folders: buildFolderList(bundle),
    tree: buildTree(bundle),
    currentFolder: buildFolderContents(bundle, selectedFolderId)
  };
}
```

- [ ] **Step 4: Run the view-state tests to verify they pass**

Run: `pnpm test tests/private-bookmarks/view-state.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/private-bookmarks/view-state.ts tests/private-bookmarks/view-state.test.ts
git commit -m "feat: add private bookmark view-state helpers"
```

### Task 4: Add Background Handlers That Save Shared Data And Re-Apply Locally

**Files:**
- Modify: `entrypoints/background.ts`
- Modify: `src/core/browser/bookmarks.ts`
- Modify: `src/core/browser/private-bookmarks.ts`
- Test: `tests/browser/bookmarks.test.ts`
- Test: `tests/ui/options-view-model.test.ts`

**Interfaces:**
- Consumes:
  - `loadPrivateManagerBundle`
  - `savePrivateManagerBundle`
  - `applyPrivateBookmarkOperation`
  - `buildPrivateBookmarksViewState`
- Produces:
  - background handlers for `onesync:get-private-bookmarks`
  - background handlers for `onesync:mutate-private-bookmarks`
  - `applySharedBundleLocally(bundle: BookmarkBundle, mode: BookmarkStorageMode): Promise<void>`

- [ ] **Step 1: Write failing tests for private-manager load and mutate RPCs**

```ts
// tests/ui/options-view-model.test.ts
it("loads the private bookmark manager state from the background runtime", async () => {
  sendMessageMock.mockResolvedValue({ itemCount: 3, selectedFolderId: "toolbar-root" });
  await expect(loadPrivateBookmarksViewState()).resolves.toMatchObject({ itemCount: 3 });
});

it("sends private bookmark mutations through the service worker", async () => {
  await mutatePrivateBookmarks({ type: "delete-node", nodeId: "bookmark-1" });
  expect(sendMessageMock).toHaveBeenCalledWith({
    type: "onesync:mutate-private-bookmarks",
    payload: { operation: { type: "delete-node", nodeId: "bookmark-1" } }
  });
});
```

- [ ] **Step 2: Run the affected tests to verify they fail**

Run: `pnpm test tests/ui/options-view-model.test.ts tests/browser/bookmarks.test.ts`
Expected: FAIL because the new runtime handlers and RPC helpers do not exist.

- [ ] **Step 3: Implement background mutation flow and local apply behavior**

```ts
// entrypoints/background.ts
case "onesync:get-private-bookmarks": {
  const config = await getConfig();
  const bundle = await loadPrivateManagerBundle(config);
  return buildPrivateBookmarksViewState(bundle, getBookmarkStorageMode());
}

case "onesync:mutate-private-bookmarks": {
  const config = await getConfig();
  const current = await loadPrivateManagerBundle(config);
  const next = applyPrivateBookmarkOperation(current, message.payload.operation, config.deviceId);
  const saved = await savePrivateManagerBundle(next);
  await applyBundleToBookmarks(saved);
  return buildPrivateBookmarksViewState(saved, getBookmarkStorageMode());
}
```

- [ ] **Step 4: Run the affected tests to verify they pass**

Run: `pnpm test tests/ui/options-view-model.test.ts tests/browser/bookmarks.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add entrypoints/background.ts src/core/browser/bookmarks.ts src/core/browser/private-bookmarks.ts tests/browser/bookmarks.test.ts tests/ui/options-view-model.test.ts
git commit -m "feat: wire private bookmark manager through background handlers"
```

### Task 5: Render The Private Bookmark Manager In The Options Page

**Files:**
- Modify: `src/ui/view-models/options.ts`
- Modify: `entrypoints/options/main.ts`
- Modify: `entrypoints/options/options.css`
- Test: `tests/ui/options-view-model.test.ts`

**Interfaces:**
- Consumes:
  - `loadPrivateBookmarksViewState(): Promise<PrivateBookmarksViewState>`
  - `mutatePrivateBookmarks(operation: PrivateBookmarkOperation): Promise<PrivateBookmarksViewState>`
- Produces:
  - tabs for `Folders` and `Tree`
  - management controls for create, rename, move, delete
  - browser-sensitive mode messaging in the options UI

- [ ] **Step 1: Write failing UI/view-model tests for private bookmark manager loading and tabbed rendering hooks**

```ts
// tests/ui/options-view-model.test.ts
it("requests the private bookmark manager state", async () => {
  sendMessageMock.mockResolvedValue({ mode: "private", itemCount: 2, folders: [], tree: [] });
  await expect(loadPrivateBookmarksViewState()).resolves.toMatchObject({ mode: "private" });
});
```

- [ ] **Step 2: Run the options view-model tests to verify they fail**

Run: `pnpm test tests/ui/options-view-model.test.ts`
Expected: FAIL because the private manager load and mutate helpers do not exist.

- [ ] **Step 3: Implement the options-page RPC helpers and DOM rendering**

```ts
// src/ui/view-models/options.ts
export async function loadPrivateBookmarksViewState(): Promise<PrivateBookmarksViewState> {
  return (await browser.runtime.sendMessage({
    type: "onesync:get-private-bookmarks"
  } satisfies RuntimeMessage)) as PrivateBookmarksViewState;
}

export async function mutatePrivateBookmarks(operation: PrivateBookmarkOperation): Promise<PrivateBookmarksViewState> {
  return (await browser.runtime.sendMessage({
    type: "onesync:mutate-private-bookmarks",
    payload: { operation }
  } satisfies RuntimeMessage)) as PrivateBookmarksViewState;
}
```

```ts
// entrypoints/options/main.ts
const privateState = await loadPrivateBookmarksViewState();
// render a new "Private bookmarks" section with:
// - folders/tree tabs
// - folder pane
// - tree pane
// - create, rename, move, delete controls
```

- [ ] **Step 4: Run the options view-model tests to verify they pass**

Run: `pnpm test tests/ui/options-view-model.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/view-models/options.ts entrypoints/options/main.ts entrypoints/options/options.css tests/ui/options-view-model.test.ts
git commit -m "feat: add private bookmark manager UI"
```

### Task 6: Add Focused Regression Coverage And Full Verification

**Files:**
- Modify: `tests/browser/private-bookmarks.test.ts`
- Modify: `tests/private-bookmarks/mutators.test.ts`
- Modify: `tests/private-bookmarks/view-state.test.ts`
- Modify: `tests/browser/bookmarks.test.ts`
- Modify: `tests/ui/options-view-model.test.ts`

**Interfaces:**
- Consumes: all task outputs above
- Produces:
  - regression coverage for Safari private mode and Chrome/Firefox native re-apply
  - final verification evidence

- [ ] **Step 1: Add the remaining failing regression tests**

```ts
// tests/browser/private-bookmarks.test.ts
it("preserves the saved shared bundle when native apply fails on Chrome or Firefox", async () => {
  await expect(mutateAndApply(...)).rejects.toThrow(/not updated/i);
});
```

```ts
// tests/private-bookmarks/view-state.test.ts
it("reports browser-sensitive mode hints for private and native carriers", () => {
  expect(buildPrivateBookmarksViewState(bundle, "private").modeHint).toMatch(/primary local bookmark workspace/i);
  expect(buildPrivateBookmarksViewState(bundle, "native").modeHint).toMatch(/applied back to browser bookmarks/i);
});
```

- [ ] **Step 2: Run the full targeted suite to verify it fails where coverage is missing**

Run: `pnpm test tests/browser/private-bookmarks.test.ts tests/private-bookmarks/mutators.test.ts tests/private-bookmarks/view-state.test.ts tests/browser/bookmarks.test.ts tests/ui/options-view-model.test.ts`
Expected: FAIL until the missing regression coverage and behavior are complete.

- [ ] **Step 3: Fill the remaining gaps and keep the implementation minimal**

```ts
// likely touch points:
// - src/core/browser/bookmarks.ts: preserve shared bundle on native apply failure and report a precise message
// - src/core/browser/private-bookmarks.ts: keep saved bundle reads normalized after failed apply attempts
// - entrypoints/background.ts: append activity-log entries for "shared data saved, browser bookmarks not updated"
// - src/core/private-bookmarks/view-state.ts: keep modeHint and item counts stable after mutation refresh
```

- [ ] **Step 4: Run the final verification commands**

Run: `pnpm exec tsc --noEmit`
Expected: PASS

Run: `pnpm test`
Expected: PASS

Run: `pnpm build:safari`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/browser/private-bookmarks.test.ts tests/private-bookmarks/mutators.test.ts tests/private-bookmarks/view-state.test.ts tests/browser/bookmarks.test.ts tests/ui/options-view-model.test.ts
git commit -m "test: finish private bookmark manager regression coverage"
```

## Self-Review Notes

- Spec coverage:
  - cross-browser options-page manager: Tasks 4-5
  - tree and folder tabs: Tasks 3 and 5
  - basic management actions: Tasks 2 and 5
  - Safari persistence: Tasks 1 and 4
  - Chrome/Firefox immediate native apply: Task 4
  - mode messaging: Tasks 3 and 5
  - one shared bundle model: Tasks 1-4
- Placeholder scan:
  - No `TODO`/`TBD` markers remain.
  - Task 6 Step 3 now names the exact files and behaviors expected to close the regression gaps.
- Type consistency:
  - `PrivateBookmarkOperation` is introduced first in Task 1 and reused consistently in Tasks 2, 4, and 5.
  - `PrivateBookmarksViewState` is introduced in Task 3 before it is consumed by background and UI tasks.
