import browser from "webextension-polyfill";
import type { BookmarkBundle } from "../format/schema";

const BASE_SNAPSHOT_KEY = "onesync.baseSnapshot";
const RECOVERY_SNAPSHOT_KEY = "onesync.recoverySnapshot";

export async function getBaseSnapshot(): Promise<BookmarkBundle | null> {
  const result = await browser.storage.local.get(BASE_SNAPSHOT_KEY);
  return (result[BASE_SNAPSHOT_KEY] as BookmarkBundle | undefined) ?? null;
}

export async function setBaseSnapshot(bundle: BookmarkBundle): Promise<void> {
  await browser.storage.local.set({ [BASE_SNAPSHOT_KEY]: bundle });
}

export async function getRecoverySnapshot(): Promise<BookmarkBundle | null> {
  const result = await browser.storage.local.get(RECOVERY_SNAPSHOT_KEY);
  return (result[RECOVERY_SNAPSHOT_KEY] as BookmarkBundle | undefined) ?? null;
}

export async function setRecoverySnapshot(bundle: BookmarkBundle): Promise<void> {
  await browser.storage.local.set({ [RECOVERY_SNAPSHOT_KEY]: bundle });
}
