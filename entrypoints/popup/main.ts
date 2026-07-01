import { browser } from "wxt/browser";
import { getBookmarkStorageMode } from "../../src/core/browser/bookmarks";
import { getBookmarkSourceLabel } from "../../src/ui/bookmark-source";
import { loadPopupViewModel, requestManualSync } from "../../src/ui/view-models/popup";

const root = document.querySelector<HTMLDivElement>("#app");
const extensionVersion = browser.runtime.getManifest().version;
let popupMessage: string | null = null;
let refreshHandle: number | null = null;

function getPopupStateSummary(viewModel: Awaited<ReturnType<typeof loadPopupViewModel>>) {
  if (viewModel.errorLabel) {
    return {
      tone: "warning",
      badge: "Review",
      heading: "Sync needs review"
    };
  }

  if (viewModel.isRunning) {
    return {
      tone: "working",
      badge: "Syncing",
      heading: viewModel.statusLabel
    };
  }

  if (viewModel.lastSyncLabel === "Never") {
    return {
      tone: "ready",
      badge: "Ready",
      heading: "First sync pending"
    };
  }

  return {
    tone: "healthy",
    badge: "Ready",
    heading: "Standing by"
  };
}

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
  const bookmarkStorageMode = getBookmarkStorageMode();
  const bookmarkSourceLabel = getBookmarkSourceLabel(bookmarkStorageMode);
  const stateSummary = getPopupStateSummary(viewModel);

  root.innerHTML = `
    <section class="popup-panel">
      <header class="popup-header">
        <h1>onesync</h1>
        <span class="popup-version">v${escapeHtml(extensionVersion)}</span>
      </header>
      <section class="popup-state popup-state-${stateSummary.tone}">
        <span class="popup-badge popup-badge-${stateSummary.tone}">${escapeHtml(stateSummary.badge)}</span>
        <h2>${escapeHtml(stateSummary.heading)}</h2>
      </section>
      ${
        viewModel.progressLabel
          ? `
            <div class="popup-progress-card">
              <div class="popup-progress-header">
                <span>${escapeHtml(viewModel.progressLabel)}</span>
                <strong>${progressPercent}%</strong>
              </div>
              <div class="popup-progress-track" aria-hidden="true">
                <div class="popup-progress-fill" style="width: ${progressPercent}%"></div>
              </div>
            </div>
          `
          : ""
      }
      <dl class="popup-facts">
        <div class="popup-fact-row">
          <dt>Last sync</dt>
          <dd>${escapeHtml(viewModel.lastSyncLabel)}</dd>
        </div>
        <div class="popup-fact-row">
          <dt>Status</dt>
          <dd>${escapeHtml(viewModel.statusLabel)}</dd>
        </div>
        <div class="popup-fact-row">
          <dt>Bookmark source</dt>
          <dd>${escapeHtml(bookmarkSourceLabel)}</dd>
        </div>
        <div class="popup-fact-row">
          <dt>Version</dt>
          <dd>${escapeHtml(extensionVersion)}</dd>
        </div>
      </dl>
      ${
        bannerMessage
          ? `<p class="popup-notice popup-notice-error">${escapeHtml(bannerMessage)}</p>`
          : ""
      }
      <div class="popup-actions">
        <button id="sync-now" class="popup-primary-button" type="button" ${
          viewModel.canSync && !viewModel.isRunning ? "" : "disabled"
        }>
          ${viewModel.isRunning ? "Syncing..." : "Sync"}
        </button>
        <a class="popup-secondary-button" href="/options.html" target="_blank" rel="noreferrer">Settings</a>
      </div>
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
