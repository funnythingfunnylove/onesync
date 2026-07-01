import browser from "webextension-polyfill";
import { loadPopupViewModel, requestManualSync } from "../../src/ui/view-models/popup";

const root = document.querySelector<HTMLDivElement>("#app");
const extensionVersion = browser.runtime.getManifest().version;
let popupMessage: string | null = null;
let refreshHandle: number | null = null;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function scheduleRefresh(delayMs = 700): void {
  if (refreshHandle !== null) {
    window.clearTimeout(refreshHandle);
  }

  refreshHandle = window.setTimeout(() => {
    void renderPopup();
  }, delayMs);
}

async function renderPopup() {
  if (!root) {
    return;
  }

  const viewModel = await loadPopupViewModel();
  const bannerMessage = popupMessage ?? viewModel.errorLabel;
  const progressPercent = viewModel.progressPercent ?? 0;

  root.innerHTML = `
    <section class="panel">
      <header class="panel-header">
        <div>
          <p class="eyebrow">Bookmark Sync</p>
          <h1>onesync</h1>
        </div>
        <a class="settings-link" href="/options.html" target="_blank" rel="noreferrer">Settings</a>
      </header>
      <div class="status-grid">
        <div class="status-item">
          <span class="label">Status</span>
          <strong>${escapeHtml(viewModel.statusLabel)}</strong>
        </div>
        <div class="status-item">
          <span class="label">Last sync</span>
          <strong>${escapeHtml(viewModel.lastSyncLabel)}</strong>
        </div>
      </div>
      ${
        viewModel.progressLabel
          ? `
            <div class="progress-card">
              <div class="progress-header">
                <span>${escapeHtml(viewModel.progressLabel)}</span>
                <strong>${progressPercent}%</strong>
              </div>
              <div class="progress-track" aria-hidden="true">
                <div class="progress-fill" style="width: ${progressPercent}%"></div>
              </div>
            </div>
          `
          : ""
      }
      ${
        bannerMessage
          ? `<p class="error-banner">${escapeHtml(bannerMessage)}</p>`
          : `<p class="helper">Scheduled sync and manual sync use the same bookmark format.</p>`
      }
      <p class="app-version">Version ${escapeHtml(extensionVersion)}</p>
      <button id="sync-now" class="primary-button" type="button" ${
        viewModel.canSync && !viewModel.isRunning ? "" : "disabled"
      }>
        ${viewModel.isRunning ? "Syncing..." : "Sync now"}
      </button>
    </section>
  `;

  if (viewModel.isRunning) {
    scheduleRefresh();
  } else if (refreshHandle !== null) {
    window.clearTimeout(refreshHandle);
    refreshHandle = null;
  }

  const syncNowButton = document.querySelector<HTMLButtonElement>("#sync-now");
  syncNowButton?.addEventListener("click", async () => {
    syncNowButton.disabled = true;
    syncNowButton.textContent = "Starting...";
    popupMessage = null;

    void requestManualSync().catch(async (error) => {
        popupMessage = error instanceof Error ? error.message : "Sync failed";
        await renderPopup();
      });

    scheduleRefresh(80);
  });
}

void renderPopup();

export {};
