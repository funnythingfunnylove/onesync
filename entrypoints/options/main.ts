import { browser } from "wxt/browser";
import { getBookmarkStorageMode } from "../../src/core/browser/bookmarks";
import type { SyncConfig } from "../../src/core/state/config";
import type { PrivateBookmarkOperation, PrivateBookmarkTab } from "../../src/core/shared/types";
import { getBookmarkSourceDescription, getBookmarkSourceLabel } from "../../src/ui/bookmark-source";
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
  saveOptionsConfig
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
          (item) => `
            <li class="activity-item">
              <strong>${escapeHtml(item.level.toUpperCase())}</strong>
              <span>${escapeHtml(item.message)}</span>
              <time>${escapeHtml(new Date(item.createdAt).toLocaleString())}</time>
            </li>
          `
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
              <span class="private-node-type">Folder</span>
              <strong>${escapeHtml(folder.title)}</strong>
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function renderPrivateVisibleNodes(
  nodes: Array<{ id: string; title: string; type: string; url?: string; depth: number; isSelected: boolean }>
): string {
  if (nodes.length === 0) {
    return `<p class="empty-state">Nothing is in this folder yet.</p>`;
  }

  return `
    <div class="private-node-list" role="list">
      ${nodes
        .map(
          (node) => `
            <button
              type="button"
              class="private-node-button ${node.isSelected ? "is-selected" : ""}"
              data-private-node-id="${escapeHtml(node.id)}"
              style="--private-depth:${node.depth};"
            >
              <span class="private-node-header">
                <span class="private-node-type">${node.type === "folder" ? "Folder" : "Bookmark"}</span>
                <strong>${escapeHtml(node.title)}</strong>
              </span>
              ${node.url ? `<span class="private-node-meta">${escapeHtml(node.url)}</span>` : ""}
            </button>
          `
        )
        .join("")}
    </div>
  `;
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
  const bookmarkSourceDescription = getBookmarkSourceDescription(bookmarkStorageMode);
  const privateBookmarkManager = buildPrivateBookmarkManagerViewModel(privateBookmarksState, {
    activeTab: privateTab,
    selectedFolderId: selectedPrivateFolderId ?? undefined,
    selectedNodeId: selectedPrivateNodeId ?? undefined
  });

  selectedPrivateFolderId = privateBookmarkManager.selectedFolder?.id ?? null;
  selectedPrivateNodeId = privateBookmarkManager.selectedNode?.id ?? selectedPrivateFolderId;

  root.innerHTML = `
    <main class="page">
      <section class="hero">
        <div>
          <p class="eyebrow">Cross-browser bookmark sync</p>
          <h1>onesync settings</h1>
          <p class="hero-copy">Configure one shared bookmark format, scheduled WebDAV sync, and import/export utilities.</p>
          <p class="helper">${escapeHtml(bookmarkSourceDescription)}</p>
          <p class="hero-version">Version ${escapeHtml(extensionVersion)}</p>
          ${
            pageMessage
              ? `<p class="page-message page-message-${pageMessage.type}">${escapeHtml(pageMessage.text)}</p>`
              : ""
          }
        </div>
        <div class="hero-metrics">
          <div class="metric"><span>Status</span><strong>${escapeHtml(syncStateLabel)}</strong></div>
          <div class="metric"><span>Bookmark source</span><strong>${escapeHtml(bookmarkSourceLabel)}</strong></div>
          <div class="metric"><span>Last success</span><strong>${escapeHtml(optionsViewModel.syncState.lastSuccessfulSyncAt ? new Date(optionsViewModel.syncState.lastSuccessfulSyncAt).toLocaleString() : "Never")}</strong></div>
          <div class="metric"><span>Progress</span><strong>${escapeHtml(progressLabel ?? "Waiting for sync")}</strong></div>
        </div>
      </section>

      ${
        progressLabel
          ? `
            <section class="section">
              <h2>Sync progress</h2>
              <div class="progress-panel">
                <div class="progress-panel-header">
                  <span>${escapeHtml(progressLabel)}</span>
                  <strong>${progressPercent}%</strong>
                </div>
                <div class="progress-track" aria-hidden="true">
                  <div class="progress-fill" style="width: ${progressPercent}%"></div>
                </div>
              </div>
            </section>
          `
          : ""
      }

      <section class="section private-manager-section" id="private-bookmark-manager">
        <div class="section-header">
          <div>
            <h2>Private bookmarks</h2>
            <p class="helper">${escapeHtml(privateBookmarkManager.modeHint)}</p>
          </div>
          <div class="section-badge">
            <span>${escapeHtml(String(privateBookmarkManager.itemCount))} items</span>
            <strong>${escapeHtml(bookmarkSourceLabel)}</strong>
          </div>
        </div>

        <div class="private-controls">
          <button type="button" class="secondary-button" data-private-action="create-folder" ${privateBookmarkManager.actions.createFolder.disabled ? "disabled" : ""}>
            ${escapeHtml(privateBookmarkManager.actions.createFolder.label)}
          </button>
          <button type="button" class="secondary-button" data-private-action="create-bookmark" ${privateBookmarkManager.actions.createBookmark.disabled ? "disabled" : ""}>
            ${escapeHtml(privateBookmarkManager.actions.createBookmark.label)}
          </button>
          <button type="button" class="secondary-button" data-private-action="rename" ${privateBookmarkManager.actions.rename.disabled ? "disabled" : ""}>
            ${escapeHtml(privateBookmarkManager.actions.rename.label)}
          </button>
          <label class="private-move-control">
            <span>Move to</span>
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
          <button type="button" class="secondary-button danger-button" data-private-action="delete" ${privateBookmarkManager.actions.delete.disabled ? "disabled" : ""}>
            ${escapeHtml(privateBookmarkManager.actions.delete.label)}
          </button>
        </div>

        <div class="private-layout">
          <aside class="private-pane private-folder-pane">
            <div class="pane-heading">
              <h3>Folders</h3>
              <p>${escapeHtml(privateBookmarkManager.selectedFolder?.title ?? "No folder selected")}</p>
            </div>
            ${renderPrivateFolderList(privateBookmarkManager.folderEntries)}
          </aside>

          <section class="private-pane private-content-pane">
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

            <div class="pane-heading">
              <h3>${privateBookmarkManager.activeTab === "folders" ? "Folder contents" : "Bookmark tree"}</h3>
              <p>${escapeHtml(privateBookmarkManager.selectedNode?.title ?? privateBookmarkManager.selectedFolder?.title ?? "Select a bookmark item to manage it.")}</p>
            </div>
            ${renderPrivateVisibleNodes(privateBookmarkManager.visibleNodes)}
          </section>
        </div>
      </section>

      <section class="section-grid">
        <section class="section">
          <h2>WebDAV</h2>
          <form id="settings-form" class="form-grid">
            <label>
              <span>WebDAV URL</span>
              <input name="webdavUrl" value="${escapeHtml(optionsViewModel.config.webdavUrl)}" placeholder="https://dav.example.com/" />
            </label>
            <label>
              <span>Username</span>
              <input name="username" value="${escapeHtml(optionsViewModel.config.username)}" />
            </label>
            <label>
              <span>Password</span>
              <input name="password" type="password" value="${escapeHtml(optionsViewModel.config.password)}" />
            </label>
            <label>
              <span>Base path</span>
              <input name="basePath" value="${escapeHtml(optionsViewModel.config.basePath)}" />
            </label>
            <label>
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
            <div class="actions">
              <button id="save-settings" class="primary-button" type="submit">Save settings</button>
              <button id="check-connection" class="secondary-button" type="button">Check connection</button>
              <button id="sync-now" class="secondary-button" type="button" ${isRunning ? "disabled" : ""}>${isRunning ? "Syncing..." : "Sync now"}</button>
            </div>
          </form>
        </section>

        <section class="section">
          <h2>Bundle tools</h2>
          <p class="helper">Export the current local bookmark snapshot as an encoded OneSync bundle, or import an encoded bundle and apply it to ${escapeHtml(bookmarkSourceLabel.toLowerCase())}.</p>
          <div class="tool-actions">
            <button id="export-bundle" class="secondary-button" type="button">Export bundle</button>
            <button id="import-bundle" class="secondary-button" type="button">Import bundle</button>
          </div>
          <textarea id="bundle-json" class="bundle-textarea" placeholder="Encoded bundle JSON appears here"></textarea>
        </section>
      </section>

      <section class="section">
        <h2>Activity log</h2>
        ${renderActivityLog(optionsViewModel.activityLog)}
      </section>
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
    const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-private-folder-id], [data-private-node-id], [data-private-tab], [data-private-action]") : null;

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

        await applyPrivateBookmarkOperation(
          {
            type: "create-bookmark",
            parentId: selectedFolder.id,
            title: title.trim(),
            url: url.trim()
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
