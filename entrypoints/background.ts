import { browser } from "wxt/browser";
import { applyBundleToBookmarks, getBookmarkStorageMode, listLocalBookmarks } from "../src/core/browser/bookmarks";
import { loadPrivateManagerBundle, savePrivateManagerBundle } from "../src/core/browser/private-bookmarks";
import { setBaseSnapshot, setRecoverySnapshot } from "../src/core/browser/storage";
import { appendActivityLog, getActivityLog } from "../src/core/state/activity-log";
import { applyPrivateBookmarkOperation } from "../src/core/private-bookmarks/mutators";
import { buildPrivateBookmarksViewState } from "../src/core/private-bookmarks/view-state";
import { getConfig, setConfig } from "../src/core/state/config";
import { getSyncConfigReadyError, validateSyncConfigForSync } from "../src/core/state/config-validation";
import { getSyncState, setSyncState } from "../src/core/state/sync-state";
import type { RuntimeMessage } from "../src/core/shared/types";
import { decodeBundle } from "../src/core/format/decode";
import { encodeBundle } from "../src/core/format/encode";
import { reconcileSyncAlarm, PERIODIC_SYNC_ALARM, runScheduledSync } from "../src/core/sync/scheduler";
import { runSyncSingleFlight } from "../src/core/sync/singleflight";
import { createWebDavClient } from "../src/core/webdav/client";
import { syncOnce } from "../src/core/sync/sync-engine";
import { formatSyncProgressLabel, formatSyncStatusLabel, getSyncProgressPercent } from "../src/ui/sync-progress";

function formatLastSyncLabel(lastSuccessfulSyncAt: string | null): string {
  return lastSuccessfulSyncAt ? new Date(lastSuccessfulSyncAt).toLocaleString() : "Never synced";
}

async function handleRuntimeMessage(message: RuntimeMessage): Promise<unknown> {
  switch (message.type) {
    case "onesync:get-popup-state": {
      const config = await getConfig();
      const syncState = await getSyncState();
      const configError = getSyncConfigReadyError(config);
      return {
        statusLabel: formatSyncStatusLabel(syncState),
        lastSyncLabel: formatLastSyncLabel(syncState.lastSuccessfulSyncAt),
        canSync: configError === null,
        isRunning: syncState.status === "running",
        errorLabel: syncState.lastError ?? configError,
        progressLabel: formatSyncProgressLabel(syncState),
        progressPercent: getSyncProgressPercent(syncState)
      };
    }
    case "onesync:sync-now": {
      const config = validateSyncConfigForSync(await getConfig());
      return runSyncSingleFlight(() => syncOnce(config));
    }
    case "onesync:get-options-state": {
      const [config, syncState, activityLog] = await Promise.all([
        getConfig(),
        getSyncState(),
        getActivityLog()
      ]);
      return { config, syncState, activityLog };
    }
    case "onesync:get-private-bookmarks": {
      const config = await getConfig();
      const bundle = await loadPrivateManagerBundle(config);
      return buildPrivateBookmarksViewState(bundle, getBookmarkStorageMode());
    }
    case "onesync:mutate-private-bookmarks": {
      const config = await getConfig();
      const mode = getBookmarkStorageMode();
      const current = await loadPrivateManagerBundle(config);
      const next = applyPrivateBookmarkOperation(current, message.payload.operation, config.deviceId);
      const saved = await savePrivateManagerBundle(config, next, mode);
      return buildPrivateBookmarksViewState(saved, mode);
    }
    case "onesync:save-config": {
      await setConfig(message.payload);
      await reconcileSyncAlarm();
      await appendActivityLog({
        level: "info",
        message: "Saved OneSync settings.",
        createdAt: new Date().toISOString()
      });
      return { ok: true };
    }
    case "onesync:test-webdav-connection": {
      const config = validateSyncConfigForSync(message.payload);

      try {
        const result = await createWebDavClient(config).checkConnection();
        await appendActivityLog({
          level: "info",
          message: `WebDAV connection check: ${result.message}`,
          createdAt: new Date().toISOString()
        });
        return result;
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        await appendActivityLog({
          level: "error",
          message: `WebDAV connection check failed: ${messageText}`,
          createdAt: new Date().toISOString()
        });
        throw error;
      }
    }
    case "onesync:export-bundle": {
      const config = await getConfig();
      const localBundle = await listLocalBookmarks(config);
      const encodedBundle = await encodeBundle(localBundle);
      return JSON.stringify(encodedBundle, null, 2);
    }
    case "onesync:import-bundle": {
      const config = await getConfig();
      const previousBundle = await listLocalBookmarks(config);
      await setRecoverySnapshot(previousBundle);

      const decodedBundle = await decodeBundle(JSON.parse(message.payload.encodedBundleJson));
      await applyBundleToBookmarks(decodedBundle);
      await setBaseSnapshot(decodedBundle);
      await setSyncState({
        lastSyncAt: new Date().toISOString(),
        lastSuccessfulSyncAt: new Date().toISOString(),
        lastRevision: decodedBundle.revision,
        status: "downloaded",
        lastError: null,
        progress: null
      });
      await appendActivityLog({
        level: "info",
        message: "Imported bookmark bundle into the local browser.",
        createdAt: new Date().toISOString()
      });
      return { ok: true };
    }
    default: {
      return null;
    }
  }
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void reconcileSyncAlarm();
  });

  browser.runtime.onStartup.addListener(() => {
    void reconcileSyncAlarm();
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === PERIODIC_SYNC_ALARM) {
      void runScheduledSync();
    }
  });

  browser.runtime.onMessage.addListener((message: unknown) => {
    return handleRuntimeMessage(message as RuntimeMessage);
  });
});
