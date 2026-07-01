import { browser } from "wxt/browser";
import type { SyncConfig } from "../../core/state/config";
import { validateSyncConfigForSync } from "../../core/state/config-validation";
import type { PrivateBookmarkOperation, RuntimeMessage } from "../../core/shared/types";
import type { ActivityLogEntry } from "../../core/state/activity-log";
import type { SyncState } from "../../core/state/sync-state";
import type { PrivateBookmarksViewState } from "../../core/private-bookmarks/view-state";
import { requestSyncTrigger } from "./sync-trigger";

export type OptionsViewModel = {
  config: SyncConfig;
  syncState: SyncState;
  activityLog: ActivityLogEntry[];
};

export type WebDavConnectionCheckResult = {
  status: "ready" | "needs-initial-sync";
  message: string;
};

export async function loadOptionsViewModel(): Promise<OptionsViewModel> {
  return (await browser.runtime.sendMessage({
    type: "onesync:get-options-state"
  } satisfies RuntimeMessage)) as OptionsViewModel;
}

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

export async function saveOptionsConfig(config: SyncConfig): Promise<void> {
  await browser.runtime.sendMessage({
    type: "onesync:save-config",
    payload: config
  } satisfies RuntimeMessage);
}

export async function saveAndSyncOptionsConfig(config: SyncConfig): Promise<void> {
  const validatedConfig = validateSyncConfigForSync(config);
  await saveOptionsConfig(validatedConfig);
  await requestOptionsSync();
}

export async function requestOptionsConnectionCheck(
  config: SyncConfig
): Promise<WebDavConnectionCheckResult> {
  const validatedConfig = validateSyncConfigForSync(config);
  return (await browser.runtime.sendMessage({
    type: "onesync:test-webdav-connection",
    payload: validatedConfig
  } satisfies RuntimeMessage)) as WebDavConnectionCheckResult;
}

export async function exportEncodedBundle(): Promise<string> {
  return (await browser.runtime.sendMessage({
    type: "onesync:export-bundle"
  } satisfies RuntimeMessage)) as string;
}

export async function importEncodedBundle(encodedBundleJson: string): Promise<void> {
  await browser.runtime.sendMessage({
    type: "onesync:import-bundle",
    payload: { encodedBundleJson }
  } satisfies RuntimeMessage);
}

export async function requestOptionsSync(): Promise<void> {
  await requestSyncTrigger();
}
