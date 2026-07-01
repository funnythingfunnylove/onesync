import { browser } from "wxt/browser";
import { getBookmarkStorageMode } from "../../src/core/browser/bookmarks";
import type { PrivateBookmarkViewNode } from "../../src/core/private-bookmarks/view-state";
import type { SyncConfig } from "../../src/core/state/config";
import type { SyncState } from "../../src/core/state/sync-state";
import type { PrivateBookmarkOperation, PrivateBookmarkTab } from "../../src/core/shared/types";
import { getBookmarkSourceLabel } from "../../src/ui/bookmark-source";
import {
  buildPrivateBookmarkManagerViewModel,
  exportEncodedBundle,
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
let pageMessage: { type: "error" | "info"; text: string } | null = null;
let refreshHandle: number | null = null;
let privateTab: PrivateBookmarkTab = "folders";
let selectedPrivateFolderId: string | null = null;
let selectedPrivateNodeId: string | null = null;
const collapsedPrivateFolderIds = new Set<string>();

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
    isCollapsible: boolean;
    isExpanded: boolean;
  }>,
  activeTab: PrivateBookmarkTab
): string {
  if (nodes.length === 0) {
    return `<p class="empty-state">Nothing is in this folder yet.</p>`;
  }

  const treeMode = activeTab === "tree";

  return `
    <div class="private-node-list" role="list">
      ${nodes
        .map(
          (node) => `
            <div
              class="private-node-row ${treeMode ? "is-tree-row" : ""}"
              style="--private-depth:${node.depth};"
            >
              ${
                treeMode
                  ? node.isCollapsible
                    ? `
                      <button
                        type="button"
                        class="private-disclosure-button"
                        data-private-toggle-folder-id="${escapeHtml(node.id)}"
                        aria-label="${node.isExpanded ? "Collapse" : "Expand"} ${escapeHtml(node.title)}"
                        aria-expanded="${node.isExpanded ? "true" : "false"}"
                      >
                        ${node.isExpanded ? "▾" : "▸"}
                      </button>
                    `
                    : `<span class="private-disclosure-spacer" aria-hidden="true"></span>`
                  : ""
              }
              <button
                type="button"
                class="private-node-button ${node.isSelected ? "is-selected" : ""}"
                data-private-node-id="${escapeHtml(node.id)}"
              >
                <span class="private-node-header">
                  <span class="private-node-type">${node.type === "folder" ? "Folder" : "Bookmark"}</span>
                  <strong class="private-node-title">${escapeHtml(node.title)}</strong>
                </span>
                ${node.url ? `<span class="private-node-meta">${escapeHtml(node.url)}</span>` : ""}
              </button>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function treeContainsNode(
  nodes: PrivateBookmarkViewNode[],
  nodeId: string
): boolean {
  return nodes.some((node) => {
    if (node.id === nodeId) {
      return true;
    }

    return treeContainsNode(node.children, nodeId);
  });
}

function folderContainsSelectedNode(
  nodes: PrivateBookmarkViewNode[],
  folderId: string,
  nodeId: string
): boolean {
  const folder = nodes.find((node) => node.id === folderId);

  if (folder) {
    return treeContainsNode(folder.children, nodeId);
  }

  return nodes.some((node) => folderContainsSelectedNode(node.children, folderId, nodeId));
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
  tone: "healthy" | "working" | "warning" | "ready";
  badge: string;
  heading: string;
  note: string | null;
} {
  if (syncState.status === "error") {
    return {
      tone: "warning",
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
      badge: "Ready",
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

async function renderOptionsPage(privateBookmarksStateOverride?: Awaited<ReturnType<typeof loadPrivateBookmarksViewState>>) {
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
    activeTab: privateTab,
    selectedFolderId: selectedPrivateFolderId ?? undefined,
    selectedNodeId: selectedPrivateNodeId ?? undefined,
    collapsedFolderIds: collapsedPrivateFolderIds
  });

  selectedPrivateFolderId = privateBookmarkManager.selectedFolder?.id ?? null;
  selectedPrivateNodeId = privateBookmarkManager.selectedNode?.id ?? selectedPrivateFolderId;

  const lastSuccessLabel = optionsViewModel.syncState.lastSuccessfulSyncAt
    ? new Date(optionsViewModel.syncState.lastSuccessfulSyncAt).toLocaleString()
    : "Never";
  const scheduleLabel = optionsViewModel.config.scheduledSyncEnabled
    ? `Every ${optionsViewModel.config.intervalMinutes} minute${optionsViewModel.config.intervalMinutes === 1 ? "" : "s"}`
    : "Manual only";
  const selectionLabel = privateBookmarkManager.selectedNode?.title
    ?? privateBookmarkManager.selectedFolder?.title
    ?? "Nothing selected";
  const selectionMeta = privateBookmarkManager.selectedNode
    ? privateBookmarkManager.selectedNode.type === "folder"
      ? "Folder selected"
      : "Bookmark selected"
    : privateBookmarkManager.selectedFolder
      ? "Folder selected"
      : "Choose an item";
  const selectedNodeTypeLabel = privateBookmarkManager.selectedNode
    ? privateBookmarkManager.selectedNode.type === "folder"
      ? "Folder"
      : "Bookmark"
    : "Selection";
  const selectedNodeUrl = privateBookmarkManager.selectedNode?.url ?? null;
  const contentHeading = privateBookmarkManager.activeTab === "folders" ? "Folder contents" : "Bookmark tree";
  const contentDescription = privateBookmarkManager.activeTab === "folders"
    ? (privateBookmarkManager.selectedFolder?.title ?? "Select a folder")
    : "Full hierarchy";
  const activeFolderLabel = privateBookmarkManager.selectedFolder?.title ?? "Library";
  const folderCount = privateBookmarkManager.folderEntries.length;
  const treeViewLabel = privateBookmarkManager.activeTab === "folders" ? "Focused view" : "Hierarchy view";
  const selectionDescription = "Shared private dataset";
  const bookmarkModeMeta = privateBookmarkManager.mode === "native"
    ? "Native carrier"
    : privateBookmarkManager.mode === "private"
      ? "Private store"
      : "Unavailable";
  const cadenceMeta = optionsViewModel.config.scheduledSyncEnabled ? "Automatic" : "Manual";
  const revisionMeta = optionsViewModel.syncState.lastRevision ? `Rev ${optionsViewModel.syncState.lastRevision}` : "No revision";
  const overviewHeadingCopy = "Status and source";
  const bookmarkHeadingCopy = "Shared private library";
  const remoteHeadingCopy = "Shared endpoint";
  const bundleHeadingCopy = "Manual snapshot tools";
  const activityHeadingCopy = "Recent events";

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
        <nav class="workspace-links" aria-label="Settings sections">
          <a class="workspace-link" href="#overview">Overview</a>
          <a class="workspace-link" href="#private-bookmark-manager">Bookmark manager</a>
          <a class="workspace-link" href="#remote-sync">Remote sync</a>
          <a class="workspace-link" href="#bundle-tools">Bundle</a>
          <a class="workspace-link" href="#activity-log">Activity</a>
        </nav>
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
            ? `<p class="notice notice-${pageMessage.type}">${escapeHtml(pageMessage.text)}</p>`
            : ""
        }

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

        <section class="content-section bookmark-section" id="private-bookmark-manager">
          <div class="section-header">
            <div class="section-intro">
              <h2>Bookmark manager</h2>
              <p class="section-copy">${bookmarkHeadingCopy}</p>
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
                    <span class="bookmark-pane-kicker">${escapeHtml(treeViewLabel)}</span>
                    <h3>${escapeHtml(contentHeading)}</h3>
                    <p class="bookmark-pane-copy">${escapeHtml(contentDescription)}</p>
                  </div>
                  <div class="bookmark-context-chip">
                    <span>Current folder</span>
                    <strong>${escapeHtml(activeFolderLabel)}</strong>
                  </div>
                </div>
                <div class="private-tabs" role="tablist" aria-label="Private bookmark views">
                  ${privateBookmarkManager.tabs
                    .map(
                      (tab) => `
                        <button
                          type="button"
                          role="tab"
                          aria-selected="${tab.isActive ? "true" : "false"}"
                          class="private-tab ${tab.isActive ? "is-active" : ""}"
                          data-private-tab="${tab.id}"
                        >
                          ${escapeHtml(tab.label)}
                        </button>
                      `
                    )
                    .join("")}
                </div>
              </div>
              <div class="bookmark-pane-body bookmark-pane-body-main">
                ${renderPrivateVisibleNodes(privateBookmarkManager.visibleNodes, privateBookmarkManager.activeTab)}
              </div>
            </section>

            <aside class="bookmark-pane bookmark-inspector-pane">
              <div class="bookmark-pane-header bookmark-pane-header-rail">
                <div>
                  <h3>Details</h3>
                  <p class="bookmark-pane-copy">${escapeHtml(selectionMeta)}</p>
                </div>
              </div>
              <div class="bookmark-pane-body bookmark-pane-body-inspector">
                <section class="inspector-section inspector-selection">
                  <span>${escapeHtml(selectedNodeTypeLabel)}</span>
                  <strong>${escapeHtml(selectionLabel)}</strong>
                  <p class="inspector-url">${escapeHtml(selectedNodeUrl ?? selectionDescription)}</p>
                </section>

                <section class="inspector-section inspector-actions-section">
                  <div class="inspector-action-group">
                    <span>Create</span>
                    <div class="inspector-button-grid inspector-button-grid-split">
                      <button type="button" class="secondary-button" data-private-action="create-folder" ${privateBookmarkManager.actions.createFolder.disabled ? "disabled" : ""}>
                        ${escapeHtml(privateBookmarkManager.actions.createFolder.label)}
                      </button>
                      <button type="button" class="secondary-button" data-private-action="create-bookmark" ${privateBookmarkManager.actions.createBookmark.disabled ? "disabled" : ""}>
                        ${escapeHtml(privateBookmarkManager.actions.createBookmark.label)}
                      </button>
                    </div>
                  </div>

                  <div class="inspector-action-group">
                    <span>Organize</span>
                    <button type="button" class="secondary-button" data-private-action="rename" ${privateBookmarkManager.actions.rename.disabled ? "disabled" : ""}>
                      ${escapeHtml(privateBookmarkManager.actions.rename.label)}
                    </button>
                    <label class="field-group field-group-inline">
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
                    <button type="button" class="secondary-button" data-private-action="move" ${privateBookmarkManager.actions.move.disabled ? "disabled" : ""}>
                      ${escapeHtml(privateBookmarkManager.actions.move.label)}
                    </button>
                  </div>

                  <div class="inspector-action-group inspector-action-group-danger">
                    <span>Remove</span>
                    <button type="button" class="secondary-button danger-button" data-private-action="delete" ${privateBookmarkManager.actions.delete.disabled ? "disabled" : ""}>
                      ${escapeHtml(privateBookmarkManager.actions.delete.label)}
                    </button>
                  </div>
                </section>
              </div>
            </aside>
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

        <section class="content-section activity-section" id="activity-log">
          <div class="section-intro">
            <h2>Activity</h2>
            <p class="section-copy">${activityHeadingCopy}</p>
          </div>
          <section class="content-card">
            ${renderActivityLog(optionsViewModel.activityLog)}
          </section>
        </section>
      </div>
    </main>
  `;

  if (isRunning) {
    if (refreshHandle !== null) {
      window.clearTimeout(refreshHandle);
    }

    refreshHandle = window.setTimeout(() => {
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

  privateManagerRoot?.addEventListener("click", async (event) => {
    const target = event.target instanceof HTMLElement
      ? event.target.closest<HTMLElement>("[data-private-toggle-folder-id], [data-private-folder-id], [data-private-node-id], [data-private-tab], [data-private-action]")
      : null;

    if (!target) {
      return;
    }

    const toggledFolderId = target.dataset.privateToggleFolderId;

    if (toggledFolderId) {
      const willCollapse = !collapsedPrivateFolderIds.has(toggledFolderId);

      if (willCollapse) {
        collapsedPrivateFolderIds.add(toggledFolderId);

        if (
          selectedPrivateNodeId &&
          selectedPrivateNodeId !== toggledFolderId &&
          folderContainsSelectedNode(privateBookmarksState.tree, toggledFolderId, selectedPrivateNodeId)
        ) {
          selectedPrivateFolderId = toggledFolderId;
          selectedPrivateNodeId = toggledFolderId;
        }
      } else {
        collapsedPrivateFolderIds.delete(toggledFolderId);
      }

      await renderOptionsPage(privateBookmarksState);
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
      selectedPrivateNodeId = nodeId;
      await renderOptionsPage(privateBookmarksState);
      return;
    }

    const tabId = target.dataset.privateTab as PrivateBookmarkTab | undefined;

    if (tabId) {
      privateTab = tabId;
      await renderOptionsPage(privateBookmarksState);
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
      case "rename": {
        if (!selectedNode) {
          return;
        }

        const title = window.prompt("New name", selectedNode.title);

        if (!title || !title.trim()) {
          return;
        }

        await applyPrivateBookmarkOperation(
          {
            type: "rename-node",
            nodeId: selectedNode.id,
            title: title.trim()
          },
          "Bookmark updated."
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
      case "delete": {
        if (!selectedNode) {
          return;
        }

        const confirmed = window.confirm(`Delete "${selectedNode.title}"?`);

        if (!confirmed) {
          return;
        }

        await applyPrivateBookmarkOperation(
          {
            type: "delete-node",
            nodeId: selectedNode.id
          },
          "Bookmark deleted."
        );
      }
    }
  });
}

void renderOptionsPage();

export {};
