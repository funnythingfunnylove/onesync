import browser from "webextension-polyfill";
import type { SyncConfig } from "../../src/core/state/config";
import {
  exportEncodedBundle,
  importEncodedBundle,
  loadOptionsViewModel,
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

async function renderOptionsPage() {
  if (!root) {
    return;
  }

  const viewModel = await loadOptionsViewModel();
  const syncStateLabel = formatSyncStatusLabel(viewModel.syncState);
  const progressLabel = formatSyncProgressLabel(viewModel.syncState);
  const progressPercent = getSyncProgressPercent(viewModel.syncState) ?? 0;
  const isRunning = viewModel.syncState.status === "running";

  root.innerHTML = `
    <main class="page">
      <section class="hero">
        <div>
          <p class="eyebrow">Cross-browser bookmark sync</p>
          <h1>onesync settings</h1>
          <p class="hero-copy">Configure one shared bookmark format, scheduled WebDAV sync, and import/export utilities.</p>
          <p class="hero-version">Version ${escapeHtml(extensionVersion)}</p>
          ${
            pageMessage
              ? `<p class="page-message page-message-${pageMessage.type}">${escapeHtml(pageMessage.text)}</p>`
              : ""
          }
        </div>
        <div class="hero-metrics">
          <div class="metric"><span>Status</span><strong>${escapeHtml(syncStateLabel)}</strong></div>
          <div class="metric"><span>Last success</span><strong>${escapeHtml(viewModel.syncState.lastSuccessfulSyncAt ? new Date(viewModel.syncState.lastSuccessfulSyncAt).toLocaleString() : "Never")}</strong></div>
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

      <section class="section-grid">
        <section class="section">
          <h2>WebDAV</h2>
          <form id="settings-form" class="form-grid">
            <label>
              <span>WebDAV URL</span>
              <input name="webdavUrl" value="${escapeHtml(viewModel.config.webdavUrl)}" placeholder="https://dav.example.com/" />
            </label>
            <label>
              <span>Username</span>
              <input name="username" value="${escapeHtml(viewModel.config.username)}" />
            </label>
            <label>
              <span>Password</span>
              <input name="password" type="password" value="${escapeHtml(viewModel.config.password)}" />
            </label>
            <label>
              <span>Base path</span>
              <input name="basePath" value="${escapeHtml(viewModel.config.basePath)}" />
            </label>
            <label>
              <span>Interval</span>
              <select name="intervalMinutes">
                ${[1, 5, 15, 30, 60]
                  .map(
                    (value) =>
                      `<option value="${value}" ${value === viewModel.config.intervalMinutes ? "selected" : ""}>${value} minute${value === 1 ? "" : "s"}</option>`
                  )
                  .join("")}
              </select>
            </label>
            <label class="checkbox-row">
              <input name="scheduledSyncEnabled" type="checkbox" ${viewModel.config.scheduledSyncEnabled ? "checked" : ""} />
              <span>Enable scheduled sync</span>
            </label>
            <label class="checkbox-row">
              <input name="allowInsecureHttp" type="checkbox" ${viewModel.config.allowInsecureHttp ? "checked" : ""} />
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
          <p class="helper">Export the current local bookmark snapshot as an encoded OneSync bundle, or import an encoded bundle and apply it locally.</p>
          <div class="tool-actions">
            <button id="export-bundle" class="secondary-button" type="button">Export bundle</button>
            <button id="import-bundle" class="secondary-button" type="button">Import bundle</button>
          </div>
          <textarea id="bundle-json" class="bundle-textarea" placeholder="Encoded bundle JSON appears here"></textarea>
        </section>
      </section>

      <section class="section">
        <h2>Activity log</h2>
        ${renderActivityLog(viewModel.activityLog)}
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

  settingsForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await saveOptionsConfig(readConfigFromForm(settingsForm, viewModel.config));
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
      const result = await requestOptionsConnectionCheck(readConfigFromForm(settingsForm!, viewModel.config));
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

    void saveAndSyncOptionsConfig(readConfigFromForm(settingsForm!, viewModel.config)).catch(async (error) => {
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
}

void renderOptionsPage();

export {};
