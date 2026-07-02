import { browser } from "wxt/browser";
import { getBookmarkStorageMode } from "../../src/core/browser/bookmarks";
import type { PrivateBookmarkViewNode } from "../../src/core/private-bookmarks/view-state";
import type { SyncConfig } from "../../src/core/state/config";
import type { SyncState } from "../../src/core/state/sync-state";
import type { PrivateBookmarkOperation } from "../../src/core/shared/types";
import { getBookmarkSourceLabel } from "../../src/ui/bookmark-source";
import {
  buildPrivateBookmarkManagerViewModel,
  buildPrivateBookmarkEditDraft,
  exportEncodedBundle,
  getPrivateBookmarkLinkHref,
  importEncodedBundle,
  loadOptionsViewModel,
  loadPrivateBookmarksViewState,
  mutatePrivateBookmarks,
  requestOptionsConnectionCheck,
  requestOptionsSync,
  saveAndSyncOptionsConfig,
  saveOptionsConfig,
  validatePrivateBookmarkUrl
} from "../../src/ui/view-models/options";
import {
  formatSyncProgressLabel,
  formatSyncStatusLabel,
  getSyncProgressPercent
} from "../../src/ui/sync-progress";

const root = document.querySelector<HTMLDivElement>("#app");
const extensionVersion = browser.runtime.getManifest().version;
type OptionsWorkspacePage = "workspace" | "bookmarks" | "activity";
let pageMessage: { type: "error" | "info"; text: string } | null = null;
let refreshHandle: number | null = null;
let activeWorkspacePage: OptionsWorkspacePage = "workspace";
let selectedPrivateFolderId: string | null = null;
let selectedPrivateNodeId: string | null = null;
let privateSearchQuery = "";
let editingPrivateNodeId: string | null = null;
const privateEditDrafts = new Map<string, { title: string; url?: string }>();

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
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

function renderPrivateFolderList(
  folders: Array<{ id: string; title: string; depth: number; isSelected: boolean }>
): string {
  if (folders.length === 0) {
    return `<p class="empty-state">No folders available.</p>`;
  }

  return `
    <div class="private-folder-list" role="list">
      ${folders
        .map(
          (folder) => `
            <button
              type="button"
              class="private-folder-button ${folder.isSelected ? "is-selected" : ""}"
              data-private-folder-id="${escapeHtml(folder.id)}"
              style="--private-depth:${folder.depth};"
            >
              <span class="private-folder-row">
                <span class="private-folder-glyph" aria-hidden="true"></span>
                <strong class="private-folder-title">${escapeHtml(folder.title)}</strong>
              </span>
            </button>
          `
        )
        .join("")}
    </div>
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
  }>,
  editingNodeId: string | null,
  searchQuery: string
): string {
  if (nodes.length === 0) {
    return `<p class="empty-state">${searchQuery.trim() ? "No items match your search." : "Nothing is in this folder yet."}</p>`;
  }

  return `
    <div class="private-node-list" role="list">
      ${nodes
        .map((node) => {
          const draft = editingNodeId === node.id ? privateEditDrafts.get(node.id) : undefined;
          const draftTitle = draft?.title ?? node.title;
          const draftUrl = draft?.url ?? node.url ?? "";
          const bookmarkLinkHref = getPrivateBookmarkLinkHref(node.url);

          return `
            <div class="private-node-row private-node-row-${node.type}">
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
                            <span class="private-node-meta">
                              ${
                                node.type === "folder"
                                  ? `${node.childCount} item${node.childCount === 1 ? "" : "s"}`
                                  : escapeHtml(node.url ?? "")
                              }
                            </span>
                          </span>
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

function filterPrivateVisibleNodes<T extends { title: string; url?: string }>(
  nodes: T[],
  query: string
): T[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return nodes;
  }

  return nodes.filter((node) => {
    const haystack = [node.title, node.url ?? ""]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
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

    if (operation.type === "create-folder" || operation.type === "create-bookmark") {
      selectedPrivateFolderId = operation.parentId;
    }

    if (operation.type === "delete-node" && selectedPrivateNodeId === operation.nodeId) {
      selectedPrivateNodeId = selectedPrivateFolderId;
    }

    if (operation.type === "move-node" && selectedPrivateNodeId === operation.nodeId) {
      selectedPrivateFolderId = operation.destinationFolderId;
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

  const [optionsViewModel, privateBookmarksState] = await Promise.all([
    loadOptionsViewModel(),
    privateBookmarksStateOverride
      ? Promise.resolve(privateBookmarksStateOverride)
      : loadPrivateBookmarksViewState()
  ]);
  const syncStateLabel = formatSyncStatusLabel(optionsViewModel.syncState);
  const progressLabel = formatSyncProgressLabel(optionsViewModel.syncState);
  const progressPercent = getSyncProgressPercent(optionsViewModel.syncState) ?? 0;
  const isRunning = optionsViewModel.syncState.status === "running";
  const bookmarkStorageMode = getBookmarkStorageMode();
  const bookmarkSourceLabel = getBookmarkSourceLabel(bookmarkStorageMode);
  const syncOverview = getSyncOverview(optionsViewModel.syncState);
  const privateBookmarkManager = buildPrivateBookmarkManagerViewModel(privateBookmarksState, {
    selectedFolderId: selectedPrivateFolderId ?? undefined,
    selectedNodeId: selectedPrivateNodeId ?? undefined
  });

  selectedPrivateFolderId = privateBookmarkManager.selectedFolder?.id ?? null;
  selectedPrivateNodeId = privateBookmarkManager.selectedNode?.id ?? selectedPrivateFolderId;
  const visibleNodeIds = new Set(privateBookmarkManager.visibleNodes.map((node) => node.id));

  if (editingPrivateNodeId && !visibleNodeIds.has(editingPrivateNodeId)) {
    editingPrivateNodeId = null;
  }

  const filteredVisibleNodes = filterPrivateVisibleNodes(privateBookmarkManager.visibleNodes, privateSearchQuery);
  const contentHeading = "Current folder";
  const activeFolderLabel = privateBookmarkManager.selectedFolder?.title ?? "Library";
  const searchMatchLabel = privateSearchQuery.trim()
    ? `${filteredVisibleNodes.length} match${filteredVisibleNodes.length === 1 ? "" : "es"}`
    : `${privateBookmarkManager.visibleNodes.length} items`;
  const contentDescription = `${activeFolderLabel} • ${searchMatchLabel}`;

  const lastSuccessLabel = optionsViewModel.syncState.lastSuccessfulSyncAt
    ? new Date(optionsViewModel.syncState.lastSuccessfulSyncAt).toLocaleString()
    : "Never";
  const scheduleLabel = optionsViewModel.config.scheduledSyncEnabled
    ? `Every ${optionsViewModel.config.intervalMinutes} minute${optionsViewModel.config.intervalMinutes === 1 ? "" : "s"}`
    : "Manual only";
  const folderCount = privateBookmarkManager.folderEntries.length;
  const bookmarkModeMeta = privateBookmarkManager.mode === "native"
    ? "Native carrier"
    : privateBookmarkManager.mode === "private"
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
              <h3>Directory</h3>
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
                <input
                  id="private-search"
                  type="search"
                  value="${escapeHtml(privateSearchQuery)}"
                  placeholder="Search title or URL"
                />
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
            ${renderPrivateVisibleNodes(
              filteredVisibleNodes,
              editingPrivateNodeId,
              privateSearchQuery
            )}
          </div>
        </section>
      </div>
    </section>
  `;
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
      rememberActivePrivateEditDraft(privateBookmarksState);
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
  const privateMoveDestination = document.querySelector<HTMLSelectElement>("#private-move-destination");
  const privateSearchInput = document.querySelector<HTMLInputElement>("#private-search");
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
    await renderOptionsPage(privateBookmarksState);
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

  privateSearchInput?.addEventListener("input", async () => {
    privateSearchQuery = privateSearchInput.value;
    await renderOptionsPage(privateBookmarksState, {
      focusSearch: true,
      searchSelectionStart: privateSearchInput.selectionStart,
      searchSelectionEnd: privateSearchInput.selectionEnd
    });
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
          url: validatedUrl.value
        },
        "Bookmark updated."
      );
      return;
    }

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
      ? event.target.closest<HTMLElement>("[data-private-folder-id], [data-private-node-id], [data-private-action], [data-private-edit-node-id], [data-private-cancel-edit], [data-private-delete-node-id]")
      : null;

    if (!target) {
      return;
    }

    const folderId = target.dataset.privateFolderId;

    if (folderId) {
      selectedPrivateFolderId = folderId;
      selectedPrivateNodeId = folderId;
      await renderOptionsPage(privateBookmarksState);
      return;
    }

    const nodeId = target.dataset.privateNodeId;

    if (nodeId) {
      const node = findPrivateNodeById(privateBookmarksState.tree, nodeId);
      selectedPrivateNodeId = nodeId;
      if (node?.type === "folder") {
        selectedPrivateFolderId = nodeId;
      }
      await renderOptionsPage(privateBookmarksState);
      return;
    }

    const editNodeId = target.dataset.privateEditNodeId;

    if (editNodeId) {
      selectedPrivateNodeId = editNodeId;
      editingPrivateNodeId = editNodeId;
      await renderOptionsPage(privateBookmarksState);
      return;
    }

    if (target.dataset.privateCancelEdit) {
      if (editingPrivateNodeId) {
        privateEditDrafts.delete(editingPrivateNodeId);
      }
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
    const selectedNode = privateBookmarkManager.selectedNode;
    const selectedFolder = privateBookmarkManager.selectedFolder;

    switch (action) {
      case "create-folder": {
        if (!selectedFolder) {
          return;
        }

        const title = window.prompt("Folder name", "");

        if (!title || !title.trim()) {
          return;
        }

        await applyPrivateBookmarkOperation(
          {
            type: "create-folder",
            parentId: selectedFolder.id,
            title: title.trim()
          },
          "Folder created."
        );
        return;
      }
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
      case "move": {
        if (!selectedNode || !privateMoveDestination?.value) {
          return;
        }

        await applyPrivateBookmarkOperation(
          {
            type: "move-node",
            nodeId: selectedNode.id,
            destinationFolderId: privateMoveDestination.value
          },
          "Bookmark moved."
        );
        return;
      }
    }
  });
}

void renderOptionsPage();

export {};
