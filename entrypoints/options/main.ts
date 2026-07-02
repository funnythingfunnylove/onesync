import { browser } from "wxt/browser";
import {
  BookmarkPlus,
  CheckSquare,
  Filter,
  Merge,
  Search,
  Trash2,
  type IconNode
} from "lucide";
import { shouldLoadPrivateBookmarksState, type OptionsWorkspacePage } from "./page-state";
import { getBookmarkStorageMode } from "../../src/core/browser/bookmarks";
import type { PrivateBookmarkViewNode } from "../../src/core/private-bookmarks/view-state";
import type { SyncConfig } from "../../src/core/state/config";
import type { SyncState } from "../../src/core/state/sync-state";
import type { PrivateBookmarkOperation } from "../../src/core/shared/types";
import { getBookmarkSourceLabel } from "../../src/ui/bookmark-source";
import {
  buildPrivateBookmarkManagerViewModel,
  buildPrivateBookmarkEditDraft,
  dedupePrivateBookmarksAndSync,
  exportEncodedBundle,
  filterPrivateBookmarkManagerNodes,
  getPrivateBookmarkLinkHref,
  importEncodedBundle,
  loadOptionsViewModel,
  loadPrivateBookmarksViewState,
  mutatePrivateBookmarks,
  requestOptionsConnectionCheck,
  requestOptionsSync,
  saveAndSyncOptionsConfig,
  saveOptionsConfig,
  validatePrivateBookmarkUrl,
  type PrivateBookmarkFilterMode
} from "../../src/ui/view-models/options";
import {
  PRIVATE_BOOKMARK_TAGS,
  getPrivateBookmarkTagOption,
  normalizePrivateBookmarkTagTexts,
  normalizePrivateBookmarkTags,
  type PrivateBookmarkTag
} from "../../src/core/private-bookmarks/tags";
import {
  formatSyncProgressLabel,
  formatSyncStatusLabel,
  getSyncProgressPercent
} from "../../src/ui/sync-progress";

const root = document.querySelector<HTMLDivElement>("#app");
const extensionVersion = browser.runtime.getManifest().version;
let pageMessage: { type: "error" | "info"; text: string } | null = null;
let refreshHandle: number | null = null;
let activeWorkspacePage: OptionsWorkspacePage = "workspace";
let selectedPrivateFolderId: string | null = null;
let selectedPrivateFolderContextId: string | null = null;
let selectedPrivateNodeId: string | null = null;
let privateSearchQuery = "";
let privateFilterMode: PrivateBookmarkFilterMode = "all";
let editingPrivateNodeId: string | null = null;
const privateEditDrafts = new Map<string, { title: string; url?: string; tags?: PrivateBookmarkTag[] }>();
let selectedPrivateNodeIds = new Set<string>();

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

const commandIcons = {
  "bookmark-plus": BookmarkPlus,
  "check-square": CheckSquare,
  filter: Filter,
  merge: Merge,
  search: Search,
  trash: Trash2
} satisfies Record<string, IconNode>;

function renderIcon(name: keyof typeof commandIcons): string {
  const iconNode = commandIcons[name];
  const children = iconNode
    .map(([tag, attrs]) => {
      const attributes = Object.entries(attrs)
        .map(([attrName, attrValue]) => `${attrName}="${escapeHtml(String(attrValue))}"`)
        .join(" ");

      return `<${tag} ${attributes}></${tag}>`;
    })
    .join("");

  return `
    <svg
      class="command-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      ${children}
    </svg>
  `;
}

function renderTagStyle(color: string): string {
  return /^#[0-9a-f]{6}$/u.test(color)
    ? ` style="--tag-bg: ${escapeHtml(color)};"`
    : "";
}

function renderPrivateBookmarkTags(tags: ReadonlyArray<string | PrivateBookmarkTag>): string {
  if (tags.length === 0) {
    return "";
  }

  return `
    <span class="bookmark-tag-list" aria-label="Bookmark tags">
      ${tags
        .map((tagValue) => {
          const tagText = typeof tagValue === "string" ? tagValue : tagValue.text;
          const tag = getPrivateBookmarkTagOption(tagText);
          const tagColor = typeof tagValue === "string" ? tag.color : tagValue.color;

          return `<span class="bookmark-tag ${tag.colorClass}"${renderTagStyle(tagColor)}>${escapeHtml(tag.label)}</span>`;
        })
        .join("")}
    </span>
  `;
}

function renderPrivateBookmarkTagEditor(selectedTagIds: ReadonlyArray<string | PrivateBookmarkTag>): string {
  const selectedTagObjects = normalizePrivateBookmarkTags(selectedTagIds);
  const selectedTagTexts = normalizePrivateBookmarkTagTexts(selectedTagObjects);
  const selectedTags = new Set(selectedTagTexts);
  const selectedTagColors = new Map(selectedTagObjects.map((tag) => [tag.text, tag.color]));
  const presetTagIds: Set<string> = new Set(PRIVATE_BOOKMARK_TAGS.map((tag) => tag.id));
  const customSelectedTags = selectedTagTexts.filter((tagId) => !presetTagIds.has(tagId));
  const tagChoices = [
    ...PRIVATE_BOOKMARK_TAGS,
    ...customSelectedTags.map((tagId) => {
      const tagOption = getPrivateBookmarkTagOption(tagId);

      return {
        ...tagOption,
        color: selectedTagColors.get(tagId) ?? tagOption.color
      };
    })
  ];

  return `
    <fieldset class="bookmark-tag-picker">
      <legend>Tags</legend>
      <div class="bookmark-tag-picker-options">
        ${tagChoices
          .map(
            (tag) => `
              <label class="bookmark-tag-choice ${tag.colorClass}"${renderTagStyle(tag.color)}>
                <input
                  type="checkbox"
                  name="tags"
                  value="${escapeHtml(tag.id)}"
                  ${selectedTags.has(tag.id) ? "checked" : ""}
                />
                <input
                  type="hidden"
                  name="tagColor:${escapeHtml(tag.id)}"
                  value="${escapeHtml(tag.color)}"
                />
                <span>${escapeHtml(tag.label)}</span>
              </label>
            `
          )
          .join("")}
      </div>
      <label class="bookmark-custom-tag-field">
        <span>New tag</span>
        <span class="bookmark-custom-tag-inputs">
          <input
            name="customTag"
            type="text"
            maxlength="40"
            placeholder="Add custom tag"
          />
          <input
            class="bookmark-custom-tag-color"
            name="customTagColor"
            type="color"
            value="#e7eef2"
            aria-label="New tag color"
          />
        </span>
      </label>
    </fieldset>
  `;
}

function renderActivityLog(items: Array<{ createdAt: string; level: string; message: string }>): string {
  if (items.length === 0) {
    return `<p class="empty-state">No sync activity yet.</p>`;
  }

  return `
    <ul class="activity-list">
      ${items
        .map(
          (item) => {
            const level = item.level.toLowerCase();
            const activityLevel = level === "error" || level === "warning" || level === "success" ? level : "info";

            return `
            <li class="activity-item activity-item-${activityLevel}" data-activity-level="${escapeHtml(activityLevel)}">
              <div class="activity-item-meta">
                <strong class="activity-level activity-level-${activityLevel}">${escapeHtml(activityLevel.toUpperCase())}</strong>
                <time>${escapeHtml(new Date(item.createdAt).toLocaleString())}</time>
              </div>
              <span>${escapeHtml(item.message)}</span>
            </li>
          `;
          }
        )
        .join("")}
    </ul>
  `;
}

function renderWorkspaceTabs(activePage: OptionsWorkspacePage): string {
  const tabs: Array<{ id: OptionsWorkspacePage; label: string }> = [
    { id: "workspace", label: "Workspace" },
    { id: "bookmarks", label: "Bookmark manager" },
    { id: "activity", label: "Activity" }
  ];

  return `
    <nav class="workspace-links" aria-label="Settings pages">
      ${tabs
        .map(
          (tab) => `
            <button
              type="button"
              class="workspace-link ${tab.id === activePage ? "is-active" : ""}"
              data-workspace-page="${tab.id}"
              ${tab.id === activePage ? 'aria-current="page"' : ""}
            >
              ${escapeHtml(tab.label)}
            </button>
          `
        )
        .join("")}
    </nav>
  `;
}

function renderPrivateVisibleNodes(
  nodes: Array<{
    id: string;
    title: string;
    type: string;
    url?: string;
    depth: number;
    isSelected: boolean;
    childCount: number;
    parentFolderId: string | null;
    parentFolderTitle: string | null;
    tags: PrivateBookmarkTag[];
  }>,
  selectedNodeIds: Set<string>,
  editingNodeId: string | null,
  searchQuery: string
): string {
  if (nodes.length === 0) {
    return `<p class="empty-state">${searchQuery.trim() ? "No bookmarks match your search." : "No bookmarks yet."}</p>`;
  }

  return `
    <div class="private-node-list" role="list">
      ${nodes
        .map((node) => {
          const draft = editingNodeId === node.id ? privateEditDrafts.get(node.id) : undefined;
          const draftTitle = draft?.title ?? node.title;
          const draftUrl = draft?.url ?? node.url ?? "";
          const draftTags = draft?.tags ?? node.tags;
          const bookmarkLinkHref = getPrivateBookmarkLinkHref(node.url);
          const isChecked = selectedNodeIds.has(node.id);

          return `
            <div class="private-node-row private-node-row-${node.type} ${isChecked ? "is-checked" : ""}">
              <label class="private-node-select">
                <input
                  type="checkbox"
                  data-private-select-node-id="${escapeHtml(node.id)}"
                  ${isChecked ? "checked" : ""}
                  aria-label="Select ${escapeHtml(node.title)}"
                />
              </label>
              <div class="private-node-card ${node.isSelected ? "is-selected" : ""}">
                ${
                  editingNodeId === node.id
                    ? `
                      <form class="private-node-editor-form" data-private-edit-form-id="${escapeHtml(node.id)}">
                        <div class="private-node-editor-fields">
                          <input
                            class="private-node-inline-input"
                            name="title"
                            value="${escapeHtml(draftTitle)}"
                            required
                            placeholder="${node.type === "folder" ? "Folder title" : "Bookmark title"}"
                          />
                          ${
                            node.type === "bookmark"
                              ? `
                                <input
                                  class="private-node-inline-input private-node-inline-url"
                                  name="url"
                                  type="url"
                                  required
                                  value="${escapeHtml(draftUrl)}"
                                  placeholder="https://example.com/"
                                />
                                ${renderPrivateBookmarkTagEditor(draftTags)}
                              `
                              : ""
                          }
                        </div>
                        <div class="private-node-row-actions">
                          <button type="submit" class="secondary-button compact-button">Save</button>
                          <button type="button" class="secondary-button compact-button" data-private-cancel-edit="true">Cancel</button>
                          <button
                            type="button"
                            class="secondary-button danger-button compact-button"
                            data-private-delete-node-id="${escapeHtml(node.id)}"
                          >
                            Delete
                          </button>
                        </div>
                      </form>
                    `
                    : `
                      <div class="private-node-surface">
                        <button
                          type="button"
                          class="private-node-button ${node.isSelected ? "is-selected" : ""}"
                          data-private-node-id="${escapeHtml(node.id)}"
                        >
                          <span class="private-node-header">
                            <strong class="private-node-title">${escapeHtml(node.title)}</strong>
                          </span>
                          ${renderPrivateBookmarkTags(node.tags)}
                        </button>
                        ${
                          node.type === "bookmark" && bookmarkLinkHref
                            ? `
                              <a
                                class="private-node-link"
                                href="${escapeHtml(bookmarkLinkHref)}"
                                target="_blank"
                                rel="noreferrer noopener"
                                title="${escapeHtml(node.url ?? bookmarkLinkHref)}"
                              >
                                ${escapeHtml(node.url ?? bookmarkLinkHref)}
                              </a>
                            `
                            : ""
                        }
                        <div class="private-node-row-actions">
                          <button
                            type="button"
                            class="secondary-button compact-button"
                            data-private-edit-node-id="${escapeHtml(node.id)}"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    `
                }
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function findPrivateNodeById(
  nodes: PrivateBookmarkViewNode[],
  nodeId: string
): PrivateBookmarkViewNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }

    const childMatch = findPrivateNodeById(node.children, nodeId);

    if (childMatch) {
      return childMatch;
    }
  }

  return null;
}

function rememberActivePrivateEditDraft(privateBookmarksState: Awaited<ReturnType<typeof loadPrivateBookmarksViewState>>): void {
  if (!editingPrivateNodeId) {
    return;
  }

  const form = Array.from(document.querySelectorAll<HTMLFormElement>("[data-private-edit-form-id]"))
    .find((candidate) => candidate.dataset.privateEditFormId === editingPrivateNodeId);
  const node = findPrivateNodeById(privateBookmarksState.tree, editingPrivateNodeId);

  if (!form || !node) {
    return;
  }

  privateEditDrafts.set(editingPrivateNodeId, buildPrivateBookmarkEditDraft(node.type, new FormData(form)));
}

function readConfigFromForm(form: HTMLFormElement, previousConfig: SyncConfig): SyncConfig {
  const formData = new FormData(form);
  return {
    deviceId: previousConfig.deviceId,
    webdavUrl: String(formData.get("webdavUrl") ?? ""),
    username: String(formData.get("username") ?? ""),
    password: String(formData.get("password") ?? ""),
    basePath: String(formData.get("basePath") ?? "/onesync"),
    intervalMinutes: Number(formData.get("intervalMinutes") ?? 15) as SyncConfig["intervalMinutes"],
    scheduledSyncEnabled: formData.get("scheduledSyncEnabled") === "on",
    allowInsecureHttp: formData.get("allowInsecureHttp") === "on"
  };
}

function getSyncOverview(syncState: SyncState): {
  tone: "healthy" | "working" | "error" | "ready";
  badge: string;
  heading: string;
  note: string | null;
} {
  if (syncState.status === "error") {
    return {
      tone: "error",
      badge: "Review",
      heading: "Sync needs review",
      note: syncState.lastError ?? "Check remote settings"
    };
  }

  if (syncState.status === "running") {
    return {
      tone: "working",
      badge: "Syncing",
      heading: syncState.progress?.detail ?? "Processing bookmark changes",
      note: null
    };
  }

  if (!syncState.lastSuccessfulSyncAt) {
    return {
      tone: "ready",
      badge: "Pending",
      heading: "First sync pending",
      note: "Save settings and sync"
    };
  }

  return {
    tone: "healthy",
    badge: "Ready",
    heading: "Shared state is ready",
    note: null
  };
}

async function applyPrivateBookmarkOperation(
  operation: PrivateBookmarkOperation,
  successMessage: string
): Promise<void> {
  try {
    const nextState = await mutatePrivateBookmarks(operation);

    if (operation.type === "create-bookmark") {
      selectedPrivateFolderContextId = null;
      selectedPrivateFolderId = operation.parentId;
    }

    if (operation.type === "delete-node" && selectedPrivateNodeId === operation.nodeId) {
      selectedPrivateFolderContextId = null;
      selectedPrivateNodeId = selectedPrivateFolderId;
    }

    if (
      (operation.type === "delete-node" || operation.type === "update-bookmark" || operation.type === "rename-node")
      && editingPrivateNodeId === ("nodeId" in operation ? operation.nodeId : null)
    ) {
      privateEditDrafts.delete(operation.nodeId);
      editingPrivateNodeId = null;
    }

    pageMessage = { type: "info", text: successMessage };
    await renderOptionsPage(nextState);
  } catch (error) {
    pageMessage = {
      type: "error",
      text: error instanceof Error ? error.message : "Private bookmark update failed."
    };
    await renderOptionsPage();
  }
}

async function applyPrivateBookmarkOperations(
  operations: PrivateBookmarkOperation[],
  successMessage: string
): Promise<void> {
  if (operations.length === 0) {
    return;
  }

  try {
    let nextState: Awaited<ReturnType<typeof loadPrivateBookmarksViewState>> | null = null;

    for (const operation of operations) {
      nextState = await mutatePrivateBookmarks(operation);
    }

    for (const operation of operations) {
      if ("nodeId" in operation) {
        selectedPrivateNodeIds.delete(operation.nodeId);
        privateEditDrafts.delete(operation.nodeId);

        if (editingPrivateNodeId === operation.nodeId) {
          editingPrivateNodeId = null;
        }
      }

      if (operation.type === "delete-node" && selectedPrivateNodeId === operation.nodeId) {
        selectedPrivateNodeId = selectedPrivateFolderId;
      }

    }

    pageMessage = { type: "info", text: successMessage };
    await renderOptionsPage(nextState ?? undefined);
  } catch (error) {
    pageMessage = {
      type: "error",
      text: error instanceof Error ? error.message : "Private bookmark update failed."
    };
    await renderOptionsPage();
  }
}

async function renderOptionsPage(
  privateBookmarksStateOverride?: Awaited<ReturnType<typeof loadPrivateBookmarksViewState>>,
  options?: {
    focusSearch?: boolean;
    searchSelectionStart?: number | null;
    searchSelectionEnd?: number | null;
  }
) {
  if (!root) {
    return;
  }

  const shouldLoadPrivateState = shouldLoadPrivateBookmarksState(
    activeWorkspacePage,
    privateBookmarksStateOverride
  );
  const optionsViewModelPromise = loadOptionsViewModel();
  const privateBookmarksState = shouldLoadPrivateState
    ? privateBookmarksStateOverride
      ? await Promise.resolve(privateBookmarksStateOverride)
      : await loadPrivateBookmarksViewState()
    : null;
  const optionsViewModel = await optionsViewModelPromise;
  const syncStateLabel = formatSyncStatusLabel(optionsViewModel.syncState);
  const progressLabel = formatSyncProgressLabel(optionsViewModel.syncState);
  const progressPercent = getSyncProgressPercent(optionsViewModel.syncState) ?? 0;
  const isRunning = optionsViewModel.syncState.status === "running";
  const bookmarkStorageMode = getBookmarkStorageMode();
  const bookmarkSourceLabel = getBookmarkSourceLabel(bookmarkStorageMode);
  const syncOverview = getSyncOverview(optionsViewModel.syncState);
  const lastSuccessLabel = optionsViewModel.syncState.lastSuccessfulSyncAt
    ? new Date(optionsViewModel.syncState.lastSuccessfulSyncAt).toLocaleString()
    : "Never";
  const scheduleLabel = optionsViewModel.config.scheduledSyncEnabled
    ? `Every ${optionsViewModel.config.intervalMinutes} minute${optionsViewModel.config.intervalMinutes === 1 ? "" : "s"}`
    : "Manual only";
  const bookmarkModeMeta = bookmarkStorageMode === "native"
    ? "Native carrier"
    : bookmarkStorageMode === "private"
      ? "Private store"
      : "Unavailable";
  const cadenceMeta = optionsViewModel.config.scheduledSyncEnabled ? "Automatic" : "Manual";
  const revisionMeta = optionsViewModel.syncState.lastRevision ? `Rev ${optionsViewModel.syncState.lastRevision}` : "No revision";
  const overviewHeadingCopy = "Status and source";
  const remoteHeadingCopy = "Shared endpoint";
  const bundleHeadingCopy = "Manual snapshot tools";
  const activityHeadingCopy = "Recent events";
  const workspacePageContent = `
    <section class="content-section overview-panel" id="overview">
      <div class="section-intro">
        <h2>Overview</h2>
        <p class="section-copy">${overviewHeadingCopy}</p>
      </div>
      <div class="summary-strip">
        <article class="summary-item">
          <span>Bookmark source</span>
          <strong>${escapeHtml(bookmarkSourceLabel)}</strong>
          <p>${escapeHtml(bookmarkModeMeta)}</p>
        </article>
        <article class="summary-item">
          <span>Last successful sync</span>
          <strong>${escapeHtml(lastSuccessLabel)}</strong>
          <p>${escapeHtml(revisionMeta)}</p>
        </article>
        <article class="summary-item">
          <span>Sync cadence</span>
          <strong>${escapeHtml(scheduleLabel)}</strong>
          <p>${escapeHtml(cadenceMeta)}</p>
        </article>
      </div>
    </section>

    <section class="content-section settings-section" id="remote-sync">
      <div class="section-intro">
        <h2>Connection</h2>
        <p class="section-copy">${remoteHeadingCopy}</p>
      </div>
      <section class="settings-chapter">
        <form id="settings-form" class="form-grid">
          <div class="chapter-grid">
            <div class="field-cluster">
              <div class="cluster-heading">
                <h3>Endpoint</h3>
                <p class="section-copy">Remote path and credentials.</p>
              </div>
          <label class="field-group">
            <span>WebDAV URL</span>
            <input name="webdavUrl" value="${escapeHtml(optionsViewModel.config.webdavUrl)}" placeholder="https://dav.example.com/" />
          </label>
          <label class="field-group">
            <span>Username</span>
            <input name="username" value="${escapeHtml(optionsViewModel.config.username)}" />
          </label>
          <label class="field-group">
            <span>Password</span>
            <input name="password" type="password" value="${escapeHtml(optionsViewModel.config.password)}" />
          </label>
          <label class="field-group">
            <span>Base path</span>
            <input name="basePath" value="${escapeHtml(optionsViewModel.config.basePath)}" />
          </label>
            </div>
            <div class="field-cluster">
              <div class="cluster-heading">
                <h3>Schedule</h3>
                <p class="section-copy">Cadence and transport rules.</p>
              </div>
          <label class="field-group">
            <span>Interval</span>
            <select name="intervalMinutes">
              ${[1, 5, 15, 30, 60]
                .map(
                  (value) =>
                    `<option value="${value}" ${value === optionsViewModel.config.intervalMinutes ? "selected" : ""}>${value} minute${value === 1 ? "" : "s"}</option>`
                )
                .join("")}
            </select>
          </label>
          <label class="checkbox-row">
            <input name="scheduledSyncEnabled" type="checkbox" ${optionsViewModel.config.scheduledSyncEnabled ? "checked" : ""} />
            <span>Enable scheduled sync</span>
          </label>
          <label class="checkbox-row">
            <input name="allowInsecureHttp" type="checkbox" ${optionsViewModel.config.allowInsecureHttp ? "checked" : ""} />
            <span>Allow plain HTTP for trusted local networks</span>
          </label>
            </div>
          </div>
          <div class="actions">
            <button id="save-settings" class="primary-button" type="submit">Save settings</button>
            <button id="check-connection" class="secondary-button" type="button">Check connection</button>
            <button id="sync-now" class="secondary-button" type="button" ${isRunning ? "disabled" : ""}>${isRunning ? "Syncing..." : "Sync now"}</button>
          </div>
        </form>
      </section>
    </section>

    <section class="content-section bundle-section" id="bundle-tools">
      <div class="section-intro">
        <h2>Bundle</h2>
        <p class="section-copy">${bundleHeadingCopy}</p>
      </div>
      <section class="content-card bundle-card">
        <div class="tool-actions">
          <button id="export-bundle" class="secondary-button" type="button">Export bundle</button>
          <button id="import-bundle" class="secondary-button" type="button">Import bundle</button>
        </div>
        <textarea id="bundle-json" class="bundle-textarea" placeholder="Encoded bundle JSON appears here"></textarea>
      </section>
    </section>
  `;
  let privateBookmarkManager: ReturnType<typeof buildPrivateBookmarkManagerViewModel> | null = null;
  let bookmarkPageContent = "";

  if (privateBookmarksState) {
    privateBookmarkManager = buildPrivateBookmarkManagerViewModel(privateBookmarksState, {
      selectedFolderId: selectedPrivateFolderId ?? undefined,
      selectedFolderContextId: selectedPrivateFolderContextId ?? undefined,
      selectedNodeId: selectedPrivateNodeId ?? undefined,
      editingNodeId: editingPrivateNodeId ?? undefined
    });

    selectedPrivateFolderId = privateBookmarkManager.selectedFolder?.id ?? null;
    selectedPrivateNodeId = privateBookmarkManager.selectedNode?.id ?? selectedPrivateFolderId;
    const visibleNodeIds = new Set(privateBookmarkManager.visibleNodes.map((node) => node.id));
    selectedPrivateNodeIds = new Set(
      Array.from(selectedPrivateNodeIds).filter((nodeId) => visibleNodeIds.has(nodeId))
    );

    if (editingPrivateNodeId && !visibleNodeIds.has(editingPrivateNodeId)) {
      editingPrivateNodeId = null;
    }

    if (!privateBookmarkManager.tagOptions.some((tag) => tag.id === privateFilterMode)) {
      privateFilterMode = "all";
    }
    const filteredVisibleNodes = filterPrivateBookmarkManagerNodes(privateBookmarkManager.visibleNodes, {
      query: privateSearchQuery,
      tagId: privateFilterMode
    });
    const selectedVisibleCount = filteredVisibleNodes.filter((node) => selectedPrivateNodeIds.has(node.id)).length;
    const selectedTotalCount = selectedPrivateNodeIds.size;
    const allVisibleSelected = filteredVisibleNodes.length > 0 && selectedVisibleCount === filteredVisibleNodes.length;
    const contentHeading = "All bookmarks";
    const searchMatchLabel = privateSearchQuery.trim()
      ? `${filteredVisibleNodes.length} match${filteredVisibleNodes.length === 1 ? "" : "es"}`
      : `${privateBookmarkManager.visibleNodes.length} bookmark${privateBookmarkManager.visibleNodes.length === 1 ? "" : "s"}`;
    const contentDescription = searchMatchLabel;

    bookmarkPageContent = `
      <section class="content-section bookmark-section" id="private-bookmark-manager">
        <div class="bookmark-workspace bookmark-workspace-flat">
          <section class="bookmark-pane bookmark-content-pane">
            <nav class="bookmark-command-bar" aria-label="Bookmark manager actions">
              <div class="bookmark-command-top">
                <div class="bookmark-command-summary">
                  <h3>${escapeHtml(contentHeading)}</h3>
                  <p class="bookmark-pane-copy">${escapeHtml(contentDescription)}</p>
                </div>
                <div class="bookmark-command-controls">
                  <label class="bookmark-search-field">
                    <span class="bookmark-field-label">${renderIcon("search")}Search</span>
                    <input
                      id="private-search"
                      type="search"
                      value="${escapeHtml(privateSearchQuery)}"
                      placeholder="Title or URL"
                    />
                  </label>
                  <label class="bookmark-filter-field">
                    <span class="bookmark-field-label">${renderIcon("filter")}Filter</span>
                    <select id="private-filter">
                      ${privateBookmarkManager.tagOptions
                        .map(
                          (tag) => `
                            <option value="${escapeHtml(tag.id)}" ${privateFilterMode === tag.id ? "selected" : ""}>
                              ${escapeHtml(tag.label)}
                            </option>
                          `
                        )
                        .join("")}
                    </select>
                  </label>
                </div>
              </div>
              <div class="bookmark-command-bottom">
                <div class="bookmark-command-group bookmark-command-group-selection">
                  <label class="bookmark-select-all">
                    <input
                      id="private-select-visible"
                      type="checkbox"
                      ${allVisibleSelected ? "checked" : ""}
                      ${filteredVisibleNodes.length === 0 ? "disabled" : ""}
                    />
                    ${renderIcon("check-square")}
                    <span>Select visible</span>
                  </label>
                  <span class="bookmark-selection-count">${selectedTotalCount} selected</span>
                  <button type="button" class="secondary-button danger-button compact-button icon-button" data-private-action="delete-selected" ${selectedTotalCount === 0 ? "disabled" : ""}>
                    ${renderIcon("trash")}
                    <span>Delete selected</span>
                  </button>
                </div>
                <div class="bookmark-command-group bookmark-command-group-create">
                  <button type="button" class="secondary-button compact-button icon-button" data-private-action="create-bookmark" ${privateBookmarkManager.actions.createBookmark.disabled ? "disabled" : ""}>
                    ${renderIcon("bookmark-plus")}
                    <span>${escapeHtml(privateBookmarkManager.actions.createBookmark.label)}</span>
                  </button>
                  <button type="button" class="secondary-button compact-button icon-button" data-private-action="dedupe" ${privateBookmarkManager.actions.dedupe.disabled ? "disabled" : ""}>
                    ${renderIcon("merge")}
                    <span>${escapeHtml(privateBookmarkManager.actions.dedupe.label)}</span>
                  </button>
                </div>
              </div>
            </nav>
            <div class="bookmark-pane-body bookmark-pane-body-main">
              ${renderPrivateVisibleNodes(
                filteredVisibleNodes,
                selectedPrivateNodeIds,
                editingPrivateNodeId,
                privateSearchQuery
              )}
            </div>
          </section>
        </div>
      </section>
    `;
  }
  const activityPageContent = `
    <section class="content-section activity-section" id="activity-log">
      <div class="section-intro">
        <h2>Activity</h2>
        <p class="section-copy">${activityHeadingCopy}</p>
      </div>
      <section class="content-card">
        ${renderActivityLog(optionsViewModel.activityLog)}
      </section>
    </section>
  `;
  const activePageContent = activeWorkspacePage === "workspace"
    ? workspacePageContent
    : activeWorkspacePage === "bookmarks"
      ? bookmarkPageContent
      : activityPageContent;

  root.innerHTML = `
    <main class="page">
      <aside class="workspace-nav">
        <div class="nav-brand">
          <span class="nav-label">onesync workspace</span>
          <h1>onesync</h1>
        </div>
        <section class="nav-status-card nav-status-card-${syncOverview.tone}">
          <span class="status-pill status-pill-${syncOverview.tone}">${escapeHtml(syncOverview.badge)}</span>
          <p class="nav-status-line">
            <span>Status</span>
            <strong>${escapeHtml(syncStateLabel)}</strong>
          </p>
          <h2>${escapeHtml(syncOverview.heading)}</h2>
          ${syncOverview.note ? `<p class="nav-status-copy">${escapeHtml(syncOverview.note)}</p>` : ""}
          ${
            progressLabel
              ? `
                <div class="nav-progress-card">
                  <div class="nav-progress-copy">
                    <strong>${escapeHtml(progressLabel)}</strong>
                    <span>${progressPercent}%</span>
                  </div>
                  <div class="progress-track" aria-hidden="true">
                    <div class="progress-fill" style="width: ${progressPercent}%"></div>
                  </div>
                </div>
              `
            : ""
          }
        </section>
        ${renderWorkspaceTabs(activeWorkspacePage)}
        <div class="nav-meta-list">
          <div class="nav-meta-item">
            <span>Version</span>
            <strong>${escapeHtml(extensionVersion)}</strong>
          </div>
          <div class="nav-meta-item">
            <span>Device</span>
            <strong>${escapeHtml(optionsViewModel.config.deviceId)}</strong>
          </div>
        </div>
      </aside>

      <div class="workspace-main">
        ${
          pageMessage
            ? `<p class="notice notice-${pageMessage.type}" role="${pageMessage.type === "error" ? "alert" : "status"}" aria-live="${pageMessage.type === "error" ? "assertive" : "polite"}" aria-atomic="true">${escapeHtml(pageMessage.text)}</p>`
            : ""
        }
        ${activePageContent}
      </div>
    </main>
  `;

  if (isRunning) {
    if (refreshHandle !== null) {
      window.clearTimeout(refreshHandle);
    }

    refreshHandle = window.setTimeout(() => {
      if (privateBookmarksState) {
        rememberActivePrivateEditDraft(privateBookmarksState);
      }
      void renderOptionsPage();
    }, 700);
  } else if (refreshHandle !== null) {
    window.clearTimeout(refreshHandle);
    refreshHandle = null;
  }

  const settingsForm = document.querySelector<HTMLFormElement>("#settings-form");
  const checkConnectionButton = document.querySelector<HTMLButtonElement>("#check-connection");
  const syncNowButton = document.querySelector<HTMLButtonElement>("#sync-now");
  const exportButton = document.querySelector<HTMLButtonElement>("#export-bundle");
  const importButton = document.querySelector<HTMLButtonElement>("#import-bundle");
  const bundleTextarea = document.querySelector<HTMLTextAreaElement>("#bundle-json");
  const privateManagerRoot = document.querySelector<HTMLElement>("#private-bookmark-manager");
  const privateSearchInput = document.querySelector<HTMLInputElement>("#private-search");
  const privateFilterSelect = document.querySelector<HTMLSelectElement>("#private-filter");
  const privateSelectVisible = document.querySelector<HTMLInputElement>("#private-select-visible");
  const workspaceLinks = document.querySelector<HTMLElement>(".workspace-links");

  workspaceLinks?.addEventListener("click", async (event) => {
    const target = event.target instanceof HTMLElement
      ? event.target.closest<HTMLElement>("[data-workspace-page]")
      : null;

    if (!target) {
      return;
    }

    const requestedPage = target.dataset.workspacePage as OptionsWorkspacePage | undefined;

    if (!requestedPage || requestedPage === activeWorkspacePage) {
      return;
    }

    activeWorkspacePage = requestedPage;
    await renderOptionsPage();
  });

  if (options?.focusSearch && privateSearchInput) {
    window.requestAnimationFrame(() => {
      privateSearchInput.focus();

      if (typeof options.searchSelectionStart === "number" && typeof options.searchSelectionEnd === "number") {
        privateSearchInput.setSelectionRange(options.searchSelectionStart, options.searchSelectionEnd);
      }
    });
  }

  settingsForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await saveOptionsConfig(readConfigFromForm(settingsForm, optionsViewModel.config));
      pageMessage = { type: "info", text: "Settings saved." };
    } catch (error) {
      pageMessage = {
        type: "error",
        text: error instanceof Error ? error.message : "Failed to save settings."
      };
    }
    await renderOptionsPage();
  });

  checkConnectionButton?.addEventListener("click", async () => {
    checkConnectionButton.disabled = true;
    checkConnectionButton.textContent = "Checking...";
    try {
      const result = await requestOptionsConnectionCheck(readConfigFromForm(settingsForm!, optionsViewModel.config));
      pageMessage = { type: "info", text: result.message };
    } catch (error) {
      pageMessage = {
        type: "error",
        text: error instanceof Error ? error.message : "Connection check failed."
      };
    } finally {
      await renderOptionsPage();
    }
  });

  syncNowButton?.addEventListener("click", async () => {
    syncNowButton.disabled = true;
    syncNowButton.textContent = "Starting...";
    pageMessage = { type: "info", text: "Sync requested. Progress will update here." };

    void saveAndSyncOptionsConfig(readConfigFromForm(settingsForm!, optionsViewModel.config)).catch(async (error) => {
      pageMessage = {
        type: "error",
        text: error instanceof Error ? error.message : "Sync failed."
      };
      await renderOptionsPage();
    });

    window.setTimeout(() => {
      void renderOptionsPage();
    }, 80);
  });

  exportButton?.addEventListener("click", async () => {
    if (!bundleTextarea) {
      return;
    }

    exportButton.disabled = true;
    exportButton.textContent = "Exporting...";
    try {
      bundleTextarea.value = await exportEncodedBundle();
      pageMessage = { type: "info", text: "Bundle exported." };
    } catch (error) {
      pageMessage = {
        type: "error",
        text: error instanceof Error ? error.message : "Failed to export bundle."
      };
    } finally {
      exportButton.disabled = false;
      exportButton.textContent = "Export bundle";
    }
  });

  importButton?.addEventListener("click", async () => {
    if (!bundleTextarea) {
      return;
    }

    importButton.disabled = true;
    importButton.textContent = "Importing...";
    try {
      await importEncodedBundle(bundleTextarea.value);
      pageMessage = { type: "info", text: "Bundle imported." };
    } catch (error) {
      pageMessage = {
        type: "error",
        text: error instanceof Error ? error.message : "Failed to import bundle."
      };
    } finally {
      await renderOptionsPage();
    }
  });

  if (privateBookmarksState && privateBookmarkManager) {
    privateSearchInput?.addEventListener("input", async () => {
      privateSearchQuery = privateSearchInput.value;
      await renderOptionsPage(privateBookmarksState, {
        focusSearch: true,
        searchSelectionStart: privateSearchInput.selectionStart,
        searchSelectionEnd: privateSearchInput.selectionEnd
      });
    });

    privateFilterSelect?.addEventListener("change", async () => {
      privateFilterMode = privateFilterSelect.value as PrivateBookmarkFilterMode;
      await renderOptionsPage(privateBookmarksState);
    });

    privateSelectVisible?.addEventListener("change", async () => {
      const visibleCheckboxes = Array.from(
        document.querySelectorAll<HTMLInputElement>("[data-private-select-node-id]")
      );

      if (privateSelectVisible.checked) {
        for (const checkbox of visibleCheckboxes) {
          const nodeId = checkbox.dataset.privateSelectNodeId;

          if (!nodeId) {
            continue;
          }

          selectedPrivateNodeIds.add(nodeId);
        }
      } else {
        for (const checkbox of visibleCheckboxes) {
          const nodeId = checkbox.dataset.privateSelectNodeId;

          if (!nodeId) {
            continue;
          }

          selectedPrivateNodeIds.delete(nodeId);
        }
      }

      await renderOptionsPage(privateBookmarksState);
    });

    privateManagerRoot?.addEventListener("change", async (event) => {
      const checkbox = event.target instanceof HTMLInputElement
        ? event.target.closest<HTMLInputElement>("[data-private-select-node-id]")
        : null;

      if (!checkbox) {
        return;
      }

      const nodeId = checkbox.dataset.privateSelectNodeId;

      if (!nodeId) {
        return;
      }

      if (checkbox.checked) {
        selectedPrivateNodeIds.add(nodeId);
      } else {
        selectedPrivateNodeIds.delete(nodeId);
      }

      await renderOptionsPage(privateBookmarksState);
    });

    privateManagerRoot?.addEventListener("submit", async (event) => {
      const form = event.target instanceof HTMLFormElement
        ? event.target.closest<HTMLFormElement>("[data-private-edit-form-id]")
        : null;

      if (!form) {
        return;
      }

      event.preventDefault();

      const editingNodeId = form.dataset.privateEditFormId;

      if (!editingNodeId) {
        return;
      }

      const node = findPrivateNodeById(privateBookmarksState.tree, editingNodeId);

      if (!node) {
        pageMessage = { type: "error", text: "Bookmark item could not be found." };
        await renderOptionsPage(privateBookmarksState);
        return;
      }

      const formData = new FormData(form);
      const title = String(formData.get("title") ?? "").trim();
      const draftUrl = String(formData.get("url") ?? "");

      privateEditDrafts.set(editingNodeId, buildPrivateBookmarkEditDraft(node.type, formData));

      if (!title) {
        pageMessage = { type: "error", text: "Title is required." };
        await renderOptionsPage(privateBookmarksState);
        return;
      }

      if (node.type === "bookmark") {
        const validatedUrl = validatePrivateBookmarkUrl(draftUrl);

        if (!validatedUrl.ok) {
          pageMessage = { type: "error", text: validatedUrl.message };
          await renderOptionsPage(privateBookmarksState);
          return;
        }

        await applyPrivateBookmarkOperation(
          {
            type: "update-bookmark",
            nodeId: node.id,
            title,
            url: validatedUrl.value,
            tags: privateEditDrafts.get(editingNodeId)?.tags ?? []
          },
          "Bookmark updated."
        );
        return;
      }

      selectedPrivateFolderContextId = selectedPrivateFolderId;
      await applyPrivateBookmarkOperation(
        {
          type: "rename-node",
          nodeId: node.id,
          title
        },
        "Folder updated."
      );
    });

    privateManagerRoot?.addEventListener("click", async (event) => {
      const target = event.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>("[data-private-node-id], [data-private-action], [data-private-edit-node-id], [data-private-cancel-edit], [data-private-delete-node-id]")
        : null;

      if (!target) {
        return;
      }

      const nodeId = target.dataset.privateNodeId;

      if (nodeId) {
        const node = findPrivateNodeById(privateBookmarksState.tree, nodeId);
        selectedPrivateFolderContextId = null;
        selectedPrivateNodeId = nodeId;
        if (node?.type === "folder") {
          selectedPrivateFolderId = nodeId;
        }
        await renderOptionsPage(privateBookmarksState);
        return;
      }

      const editNodeId = target.dataset.privateEditNodeId;

      if (editNodeId) {
        selectedPrivateFolderContextId = null;
        selectedPrivateNodeId = editNodeId;
        editingPrivateNodeId = editNodeId;
        await renderOptionsPage(privateBookmarksState);
        return;
      }

      if (target.dataset.privateCancelEdit) {
        if (editingPrivateNodeId) {
          privateEditDrafts.delete(editingPrivateNodeId);
        }
        selectedPrivateFolderContextId = null;
        editingPrivateNodeId = null;
        await renderOptionsPage(privateBookmarksState);
        return;
      }

      const deleteNodeId = target.dataset.privateDeleteNodeId;

      if (deleteNodeId) {
        const node = findPrivateNodeById(privateBookmarksState.tree, deleteNodeId);

        if (!node) {
          pageMessage = { type: "error", text: "Bookmark item could not be found." };
          await renderOptionsPage(privateBookmarksState);
          return;
        }

        const confirmed = window.confirm(`Delete "${node.title}"?`);

        if (!confirmed) {
          return;
        }

        await applyPrivateBookmarkOperation(
          {
            type: "delete-node",
            nodeId: deleteNodeId
          },
          node.type === "folder" ? "Folder deleted." : "Bookmark deleted."
        );
        return;
      }

      const action = target.dataset.privateAction;
      const selectedFolder = privateBookmarkManager.selectedFolder;

      switch (action) {
        case "create-bookmark": {
          if (!selectedFolder) {
            return;
          }

          const title = window.prompt("Bookmark name", "");

          if (!title || !title.trim()) {
            return;
          }

          const url = window.prompt("Bookmark URL", "https://");

          if (!url || !url.trim()) {
            return;
          }

          const validatedUrl = validatePrivateBookmarkUrl(url);

          if (!validatedUrl.ok) {
            window.alert(validatedUrl.message);
            return;
          }

          await applyPrivateBookmarkOperation(
            {
              type: "create-bookmark",
              parentId: selectedFolder.id,
              title: title.trim(),
              url: validatedUrl.value
            },
            "Bookmark created."
          );
          return;
        }
        case "delete-selected": {
          if (selectedPrivateNodeIds.size === 0) {
            return;
          }

          const selectedCount = selectedPrivateNodeIds.size;
          const confirmed = window.confirm(
            `Delete ${selectedCount} selected bookmark${selectedCount === 1 ? "" : "s"}?`
          );

          if (!confirmed) {
            return;
          }

          const operations = Array.from(selectedPrivateNodeIds).map((nodeId) => ({
            type: "delete-node" as const,
            nodeId
          }));

          await applyPrivateBookmarkOperations(
            operations,
            `${operations.length} bookmark${operations.length === 1 ? "" : "s"} deleted.`
          );
          selectedPrivateNodeIds = new Set<string>();
          return;
        }
        case "dedupe": {
          pageMessage = { type: "info", text: "Removing duplicate bookmarks and starting sync..." };
          await renderOptionsPage(privateBookmarksState);

          try {
            const nextState = await dedupePrivateBookmarksAndSync();
            editingPrivateNodeId = null;
            privateEditDrafts.clear();
            pageMessage = { type: "info", text: "Duplicate bookmarks removed. Sync has started." };
            await renderOptionsPage(nextState);
          } catch (error) {
            pageMessage = {
              type: "error",
              text: error instanceof Error ? error.message : "Failed to remove duplicate bookmarks."
            };
            await renderOptionsPage(privateBookmarksState);
          }
          return;
        }
      }
    });
  }
}

void renderOptionsPage();

export {};
