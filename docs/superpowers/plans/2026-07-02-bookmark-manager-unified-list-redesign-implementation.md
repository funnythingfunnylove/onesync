# Bookmark Manager Unified List Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the options-page bookmark manager into a unified list workspace with a persistent folder rail, no `Folders` / `Tree` mode switch, inline editing, and direct URL opening.

**Architecture:** Simplify the bookmark-manager view model so it always resolves one active folder context and one visible child list, then rebuild the options-page bookmark section around that single mode. Keep all mutation and selection behavior inside the existing `options` page code path, and limit the redesign to view-model, rendering, and CSS changes so sync and storage logic stay untouched.

**Tech Stack:** TypeScript, WXT, Vitest, HTML template rendering in `entrypoints/options/main.ts`, plain CSS in `entrypoints/options/options.css`

## Global Constraints

- remove the `Folders` / `Tree` view toggle
- keep folder navigation available
- make search, open, edit, and delete feel faster and clearer
- reduce visual fragmentation
- preserve the existing mutation capabilities and sync semantics
- keep the left folder rail
- keep inline row editing
- keep URL as direct clickable text
- show delete only inside edit state
- keep search scoped to the current folder view
- do not change sync pipeline changes
- do not change bookmark mutation semantics
- do not change WebDAV behavior
- do not change private/native bookmark storage rules
- do not add drag-and-drop
- do not add multi-select
- do not add bulk actions

---

### Task 1: Collapse The View Model To A Single Folder-Scoped Mode

**Files:**
- Modify: `src/ui/view-models/options.ts`
- Modify: `src/core/shared/types.ts`
- Modify: `tests/ui/options-view-model.test.ts`

**Interfaces:**
- Consumes: `PrivateBookmarksViewState`, `PrivateBookmarkViewNode`, existing mutation action shape
- Produces:
  - `buildPrivateBookmarkManagerViewModel(state, options)` with signature:
    ```ts
    export function buildPrivateBookmarkManagerViewModel(
      state: PrivateBookmarksViewState,
      options: {
        selectedFolderId?: string;
        selectedNodeId?: string;
      }
    ): PrivateBookmarkManagerViewModel
    ```
  - `PrivateBookmarkManagerNode` extended with:
    ```ts
    type PrivateBookmarkManagerNode = {
      id: string;
      type: "folder" | "bookmark";
      title: string;
      url?: string;
      depth: number;
      isSelected: boolean;
      childCount: number;
    };
    ```
  - removal of `PrivateBookmarkTab`, `tabs`, `activeTab`, `isCollapsible`, and `isExpanded` from the bookmark-manager view model surface

- [ ] **Step 1: Write the failing tests for the new single-mode contract**

```ts
it("builds folder-scoped bookmark manager data without view tabs", () => {
  const viewModel = buildPrivateBookmarkManagerViewModel(samplePrivateState, {
    selectedNodeId: "bookmark-1"
  });

  expect("tabs" in viewModel).toBe(false);
  expect("activeTab" in viewModel).toBe(false);
  expect(viewModel.selectedFolder).toMatchObject({
    id: "root-toolbar",
    title: "Bookmarks Bar"
  });
  expect(viewModel.visibleNodes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "folder-a", type: "folder", childCount: 1 }),
      expect.objectContaining({ id: "bookmark-1", type: "bookmark", isSelected: true, childCount: 0 })
    ])
  );
});

it("uses the selected bookmark parent folder as the visible folder context", () => {
  const viewModel = buildPrivateBookmarkManagerViewModel(samplePrivateState, {
    selectedFolderId: "root-toolbar",
    selectedNodeId: "bookmark-2"
  });

  expect(viewModel.selectedFolder).toMatchObject({
    id: "folder-a",
    title: "Folder A"
  });
  expect(viewModel.visibleNodes).toEqual([
    expect.objectContaining({ id: "bookmark-2", type: "bookmark", isSelected: true })
  ]);
});
```

- [ ] **Step 2: Run the targeted view-model test file and verify it fails**

Run: `pnpm test -- --run tests/ui/options-view-model.test.ts`

Expected: FAIL because the tests still expect `tabs` / `activeTab` behavior and `childCount` is not yet present.

- [ ] **Step 3: Remove tab-specific types and flatten the view-model selection logic**

```ts
export type PrivateBookmarkManagerNode = {
  id: string;
  type: PrivateBookmarkViewNode["type"];
  title: string;
  url?: string;
  depth: number;
  isSelected: boolean;
  childCount: number;
};

export type PrivateBookmarkManagerViewModel = {
  mode: BookmarkStorageMode;
  modeHint: string;
  itemCount: number;
  selectedFolder: { id: string; title: string } | null;
  selectedNode: PrivateBookmarkManagerNode | null;
  folderEntries: PrivateBookmarkManagerFolderEntry[];
  visibleNodes: PrivateBookmarkManagerNode[];
  moveDestinations: PrivateBookmarkManagerFolderEntry[];
  actions: {
    createFolder: PrivateBookmarkManagerActionState;
    createBookmark: PrivateBookmarkManagerActionState;
    rename: PrivateBookmarkManagerActionState;
    move: PrivateBookmarkManagerActionState;
    delete: PrivateBookmarkManagerActionState;
  };
};

function mapNode(
  node: PrivateBookmarkViewNode,
  selectedNodeId: string | null
): PrivateBookmarkManagerNode {
  return {
    id: node.id,
    type: node.type,
    title: node.title,
    url: node.url,
    depth: node.depth,
    isSelected: node.id === selectedNodeId,
    childCount: node.children.length
  };
}

export function buildPrivateBookmarkManagerViewModel(
  state: PrivateBookmarksViewState,
  options: {
    selectedFolderId?: string;
    selectedNodeId?: string;
  }
): PrivateBookmarkManagerViewModel {
  const selectedTreeNodeLocation = options.selectedNodeId
    ? findTreeNodeLocation(state.tree, options.selectedNodeId)
    : null;
  const fallbackFolderId = state.folders.some((folder) => folder.id === options.selectedFolderId)
    ? (options.selectedFolderId ?? state.selectedFolderId)
    : state.selectedFolderId;
  const resolvedSelectedFolderId =
    selectedTreeNodeLocation?.node.type === "folder"
      ? selectedTreeNodeLocation.node.id
      : selectedTreeNodeLocation?.parentFolderId ?? fallbackFolderId;
  const selectedFolderNode = findTreeNodeLocation(state.tree, resolvedSelectedFolderId)?.node ?? null;
  const visibleSource = selectedFolderNode?.children ?? state.currentFolder?.children ?? [];
  const visibleNodeIds = new Set(visibleSource.map((node) => node.id));
  const resolvedSelectedNodeId = options.selectedNodeId && (selectedTreeNodeLocation || visibleNodeIds.has(options.selectedNodeId))
    ? options.selectedNodeId
    : resolvedSelectedFolderId;
  const selectedNode =
    resolvedSelectedNodeId ? findTreeNodeLocation(state.tree, resolvedSelectedNodeId)?.node ?? null : null;
  const selectedFolder = state.folders.find((folder) => folder.id === resolvedSelectedFolderId) ?? null;
}
```

- [ ] **Step 4: Update the existing tests to match the new contract and remove tree-mode cases**

```ts
expect(viewModel.folderEntries).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ id: "root-toolbar", isSelected: true }),
    expect.objectContaining({ id: "folder-a", depth: 1 })
  ])
);
expect(viewModel.visibleNodes).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ id: "folder-a", type: "folder", childCount: 1 }),
    expect.objectContaining({ id: "bookmark-1", type: "bookmark", childCount: 0 })
  ])
);
expect(viewModel.actions.move.disabled).toBe(false);
```

- [ ] **Step 5: Run the targeted tests again and verify they pass**

Run: `pnpm test -- --run tests/ui/options-view-model.test.ts`

Expected: PASS for the bookmark-manager view-model assertions with no references to `Folders` / `Tree`.

- [ ] **Step 6: Commit the view-model simplification**

```bash
git add src/ui/view-models/options.ts src/core/shared/types.ts tests/ui/options-view-model.test.ts
git commit -m "refactor: simplify bookmark manager view model"
```

### Task 2: Rebuild The Bookmark Manager Rendering Around One Unified Workspace

**Files:**
- Modify: `entrypoints/options/main.ts`

**Interfaces:**
- Consumes:
  - `buildPrivateBookmarkManagerViewModel(...)`
  - `PrivateBookmarkManagerNode.childCount`
  - existing `mutatePrivateBookmarks(...)` and `validatePrivateBookmarkUrl(...)`
- Produces:
  - `renderPrivateVisibleNodes(nodes, editingNodeId, searchQuery)` without tab arguments
  - bookmark-manager page markup with:
    - left folder rail
    - right header with search
    - unified list rows
    - no `data-private-tab`

- [ ] **Step 1: Write the failing UI text assertions first**

```ts
it("renders bookmark manager without folders or tree view copy", async () => {
  const html = renderBookmarkManagerForTest({
    selectedFolderTitle: "Bookmarks Bar",
    modeHint: "Changes here update shared data and are applied back to browser bookmarks."
  });

  expect(html).not.toContain("Folders");
  expect(html).not.toContain("Tree");
  expect(html).toContain("Search");
  expect(html).toContain("Create folder");
  expect(html).toContain("Create bookmark");
});
```

Add this assertion in the existing `/tmp/onesync-options-qa/check-options-ui.cjs` harness rather than introducing a new renderer-only test file.

- [ ] **Step 2: Remove tab state and tree-collapse state from the options page module**

```ts
let selectedPrivateFolderId: string | null = null;
let selectedPrivateNodeId: string | null = null;
let privateSearchQuery = "";
let editingPrivateNodeId: string | null = null;
```

Delete:

```ts
let privateTab: PrivateBookmarkTab = "folders";
const collapsedPrivateFolderIds = new Set<string>();
```

Also remove:

```ts
function treeContainsNode(nodes: PrivateBookmarkViewNode[], nodeId: string): boolean
function folderContainsSelectedNode(nodes: PrivateBookmarkViewNode[], folderId: string, nodeId: string): boolean
```

if they are no longer referenced after the click-handler cleanup.

- [ ] **Step 3: Rewrite the row renderer so folder and bookmark rows share one stable layout**

```ts
function renderPrivateVisibleNodes(
  nodes: Array<{
    id: string;
    title: string;
    type: string;
    url?: string;
    depth: number;
    isSelected: boolean;
    childCount: number;
  }>,
  editingNodeId: string | null,
  searchQuery: string
): string {
  if (nodes.length === 0) {
    return `<p class="empty-state">${searchQuery.trim() ? "No items match your search." : "Nothing is in this folder yet."}</p>`;
  }

  return `
    <div class="private-node-list" role="list">
      ${nodes.map((node) => `
        <div class="private-node-row private-node-row-${node.type}">
          <div class="private-node-card ${node.isSelected ? "is-selected" : ""}">
            ${editingNodeId === node.id ? `
              <form class="private-node-editor-form" data-private-edit-form-id="${escapeHtml(node.id)}">
                <div class="private-node-editor-fields">
                  <input
                    class="private-node-inline-input"
                    name="title"
                    value="${escapeHtml(node.title)}"
                    required
                    placeholder="${node.type === "folder" ? "Folder title" : "Bookmark title"}"
                  />
                  ${node.type === "bookmark" ? `
                    <input
                      class="private-node-inline-input private-node-inline-url"
                      name="url"
                      type="url"
                      required
                      value="${escapeHtml(node.url ?? "")}"
                      placeholder="https://example.com/"
                    />
                  ` : ""}
                </div>
                <div class="private-node-row-actions">
                  <button type="submit" class="secondary-button compact-button">Save</button>
                  <button type="button" class="secondary-button compact-button" data-private-cancel-edit="true">Cancel</button>
                  <button type="button" class="secondary-button danger-button compact-button" data-private-delete-node-id="${escapeHtml(node.id)}">Delete</button>
                </div>
              </form>
            ` : `
              <div class="private-node-surface">
                <button type="button" class="private-node-button ${node.isSelected ? "is-selected" : ""}" data-private-node-id="${escapeHtml(node.id)}">
                  <span class="private-node-header">
                    <strong class="private-node-title">${escapeHtml(node.title)}</strong>
                    <span class="private-node-meta">
                      ${node.type === "folder"
                        ? `${node.childCount} item${node.childCount === 1 ? "" : "s"}`
                        : escapeHtml(node.url ?? "")}
                    </span>
                  </span>
                </button>
                ${node.type === "bookmark" && node.url ? `
                  <a class="private-node-link" href="${escapeHtml(node.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(node.url)}</a>
                ` : ""}
                <div class="private-node-row-actions">
                  <button type="button" class="secondary-button compact-button" data-private-edit-node-id="${escapeHtml(node.id)}">Edit</button>
                </div>
              </div>
            `}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}
```

- [ ] **Step 4: Recompose the bookmark-manager page header and remove the tab strip**

```ts
const contentHeading = "Current folder";
const activeFolderLabel = privateBookmarkManager.selectedFolder?.title ?? "Library";
const searchMatchLabel = privateSearchQuery.trim()
  ? `${filteredVisibleNodes.length} match${filteredVisibleNodes.length === 1 ? "" : "es"}`
  : `${privateBookmarkManager.visibleNodes.length} items`;
const contentDescription = `${activeFolderLabel} • ${searchMatchLabel}`;

const bookmarkPageContent = `
  <section class="content-section bookmark-section" id="private-bookmark-manager">
    <div class="section-header">
      <div class="section-intro">
        <h2>Bookmark manager</h2>
        <p class="section-copy">${escapeHtml(privateBookmarkManager.modeHint)}</p>
      </div>
      <div class="section-summary">
        <span>${escapeHtml(String(privateBookmarkManager.itemCount))} items</span>
        <strong>${escapeHtml(activeFolderLabel)}</strong>
        <p>${escapeHtml(bookmarkModeMeta)}</p>
      </div>
    </div>
    <div class="bookmark-workspace">
      <aside class="bookmark-pane bookmark-directory-pane">
        <div class="bookmark-pane-header bookmark-pane-header-rail">
          <div>
            <h3>Folders</h3>
            <p class="bookmark-pane-copy">${folderCount} folders indexed</p>
          </div>
        </div>
        <div class="bookmark-pane-body bookmark-pane-body-rail">
          ${renderPrivateFolderList(privateBookmarkManager.folderEntries)}
        </div>
      </aside>
      <section class="bookmark-pane bookmark-content-pane">
        <div class="bookmark-pane-toolbar bookmark-pane-toolbar-main">
          <div class="bookmark-pane-header bookmark-pane-header-main">
            <div>
              <h3>${escapeHtml(contentHeading)}</h3>
              <p class="bookmark-pane-copy">${escapeHtml(contentDescription)}</p>
            </div>
            <label class="bookmark-search-field">
              <span>Search</span>
              <input id="private-search" type="search" value="${escapeHtml(privateSearchQuery)}" placeholder="Search title or URL" />
            </label>
          </div>
          <div class="bookmark-toolbar-row">
            <div class="bookmark-toolbar-actions">
              <button type="button" class="secondary-button compact-button" data-private-action="create-folder" ${privateBookmarkManager.actions.createFolder.disabled ? "disabled" : ""}>
                ${escapeHtml(privateBookmarkManager.actions.createFolder.label)}
              </button>
              <button type="button" class="secondary-button compact-button" data-private-action="create-bookmark" ${privateBookmarkManager.actions.createBookmark.disabled ? "disabled" : ""}>
                ${escapeHtml(privateBookmarkManager.actions.createBookmark.label)}
              </button>
              <label class="field-group field-group-inline bookmark-move-field">
                <span>Move selection</span>
                <select id="private-move-destination" ${privateBookmarkManager.actions.move.disabled ? "disabled" : ""}>
                  ${privateBookmarkManager.moveDestinations
                    .map(
                      (folder) => `
                        <option value="${escapeHtml(folder.id)}" ${folder.isSelected ? "selected" : ""}>
                          ${"&nbsp;&nbsp;".repeat(folder.depth)}${escapeHtml(folder.title)}
                        </option>
                      `
                    )
                    .join("")}
                </select>
              </label>
              <button type="button" class="secondary-button compact-button" data-private-action="move" ${privateBookmarkManager.actions.move.disabled ? "disabled" : ""}>
                ${escapeHtml(privateBookmarkManager.actions.move.label)}
              </button>
            </div>
          </div>
        </div>
        <div class="bookmark-pane-body bookmark-pane-body-main">
          ${renderPrivateVisibleNodes(filteredVisibleNodes, editingPrivateNodeId, privateSearchQuery)}
        </div>
      </section>
    </div>
  </section>
`;
```

- [ ] **Step 5: Simplify the bookmark-manager click handler to only support folder select, row select, edit, delete, and action buttons**

```ts
const target = event.target instanceof HTMLElement
  ? event.target.closest<HTMLElement>("[data-private-folder-id], [data-private-node-id], [data-private-action], [data-private-edit-node-id], [data-private-cancel-edit], [data-private-delete-node-id]")
  : null;

if (folderId) {
  selectedPrivateFolderId = folderId;
  selectedPrivateNodeId = folderId;
  await renderOptionsPage(privateBookmarksState);
  return;
}

if (nodeId) {
  const node = findPrivateNodeById(privateBookmarksState.tree, nodeId);
  selectedPrivateNodeId = nodeId;
  if (node?.type === "folder") {
    selectedPrivateFolderId = nodeId;
  }
  await renderOptionsPage(privateBookmarksState);
  return;
}
```

Delete the whole `tabId` branch:

```ts
const tabId = target.dataset.privateTab as PrivateBookmarkTab | undefined;
if (tabId) {
  privateTab = tabId;
  await renderOptionsPage(privateBookmarksState);
  return;
}
```

- [ ] **Step 6: Run the focused unit tests and typecheck after the markup rewrite**

Run:

```bash
pnpm test -- --run tests/ui/options-view-model.test.ts
pnpm exec tsc --noEmit
```

Expected:

- `options-view-model.test.ts` passes
- TypeScript completes with exit code `0`

- [ ] **Step 7: Commit the unified bookmark-manager rendering**

```bash
git add entrypoints/options/main.ts
git commit -m "feat: redesign bookmark manager workspace"
```

### Task 3: Restyle The Bookmark Workspace And Verify The Rendered Experience

**Files:**
- Modify: `entrypoints/options/options.css`
- Optional temporary validation only: `/tmp/onesync-options-qa/*`

**Interfaces:**
- Consumes: updated bookmark-manager HTML structure from `entrypoints/options/main.ts`
- Produces:
  - flatter row styling
  - no `.private-tabs` / `.private-tab` rules in active use
  - responsive layout that preserves the folder rail and unified list readability

- [ ] **Step 1: Replace the tab-strip and tree-row styles with list-first workspace styles**

```css
.bookmark-workspace {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  min-height: min(72vh, 860px);
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}

.bookmark-directory-pane {
  border-right: 1px solid var(--border);
  background: var(--surface-muted);
}

.private-node-list {
  display: grid;
  gap: 8px;
}

.private-node-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}

.private-node-surface {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
}
```

- [ ] **Step 2: Add calmer metadata and action styling for the unified list rows**

```css
.private-node-header {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.private-node-title {
  font-size: 13px;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.private-node-meta {
  font-size: 11px;
  line-height: 1.45;
  color: var(--muted);
  overflow-wrap: anywhere;
}

.private-node-link {
  min-width: 0;
  color: var(--blue-text);
  text-decoration: none;
  font-family: "SF Mono", "Geist Mono", "JetBrains Mono", monospace;
  font-size: 11px;
  line-height: 1.45;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

- [ ] **Step 3: Remove dead tab-specific selectors and tree-only hover/focus branches**

Delete or stop using:

```css
.private-tabs
.private-tab
.private-tab.is-active
.private-node-row.is-tree-row
.private-disclosure-button
.private-disclosure-spacer
```

Also remove `.private-tab` from the focus and active selector groups once the markup no longer renders those buttons.

- [ ] **Step 4: Tighten responsive behavior for the new workspace**

```css
@media (max-width: 920px) {
  .bookmark-pane-header-main,
  .bookmark-toolbar-row {
    display: grid;
    gap: 12px;
  }

  .bookmark-toolbar-actions {
    justify-content: stretch;
  }

  .private-node-surface {
    grid-template-columns: 1fr;
    align-items: start;
  }
}

@media (max-width: 640px) {
  .bookmark-workspace {
    min-height: auto;
  }

  .bookmark-directory-pane,
  .bookmark-content-pane {
    border-bottom: 1px solid var(--border);
  }

  .private-node-row-actions {
    justify-content: flex-start;
  }
}
```

- [ ] **Step 5: Run the full verification commands**

Run:

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm build
```

Expected:

- `Test Files` all pass
- `Tests` all pass
- TypeScript exits `0`
- WXT build succeeds and updates `.output/chrome-mv3/*`

- [ ] **Step 6: Run rendered QA against the local built options page**

Use the existing temporary harness approach:

```bash
python3 -m http.server 4321 -d /tmp/onesync-options-qa
```

Then verify in browser:

- workspace page still excludes bookmark-manager content
- bookmark-manager page has no `Folders` / `Tree` controls
- folder rail still switches active folder
- search field remains visible in the top right
- bookmark row URLs still open directly
- edit mode still exposes `Save`, `Cancel`, and `Delete`

- [ ] **Step 7: Commit the final styles and verification-ready surface**

```bash
git add entrypoints/options/options.css
git commit -m "style: polish unified bookmark manager layout"
```

## Self-Review

### Spec coverage

- Remove `Folders` / `Tree` toggle: covered by Task 1 and Task 2
- Keep folder rail: covered by Task 2 and Task 3
- Keep inline editing and direct URL opening: covered by Task 2
- Delete only in edit state: covered by Task 2 row renderer
- Search scoped to current folder view: covered by Task 1 and Task 2
- Quiet desktop-utility visual direction: covered by Task 3

No spec gaps remain.

### Placeholder scan

- No `TODO`, `TBD`, or deferred implementation markers remain in task steps.
- Every task includes concrete file paths, commands, and code snippets.

### Type consistency

- `buildPrivateBookmarkManagerViewModel(...)` uses one new options shape consistently.
- `PrivateBookmarkManagerNode.childCount` is introduced in Task 1 and consumed consistently in Task 2.
- No later task refers to removed `tabs`, `activeTab`, `isCollapsible`, or `isExpanded` state.
