import { browser } from "wxt/browser";
import type { BookmarkBundle } from "../format/schema";
import { loadStoredBundle, saveStoredBundle } from "./bundle-storage";

const BASE_SNAPSHOT_KEY = "onesync.baseSnapshot";
const RECOVERY_SNAPSHOT_KEY = "onesync.recoverySnapshot";

export async function getBaseSnapshot(): Promise<BookmarkBundle | null> {
  return loadStoredBundle(browser.storage.local, BASE_SNAPSHOT_KEY);
}

export async function setBaseSnapshot(bundle: BookmarkBundle): Promise<void> {
  await saveStoredBundle(browser.storage.local, BASE_SNAPSHOT_KEY, bundle);
}

export async function getRecoverySnapshot(): Promise<BookmarkBundle | null> {
  return loadStoredBundle(browser.storage.local, RECOVERY_SNAPSHOT_KEY);
}

export async function setRecoverySnapshot(bundle: BookmarkBundle): Promise<void> {
  await saveStoredBundle(browser.storage.local, RECOVERY_SNAPSHOT_KEY, bundle);
}
