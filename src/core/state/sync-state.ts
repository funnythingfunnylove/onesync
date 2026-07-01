import browser from "webextension-polyfill";

export type SyncStatus = "idle" | "running" | "uploaded" | "downloaded" | "merged" | "error";
export type SyncProgressPhase =
  | "scanning-local"
  | "fetching-remote"
  | "uploading-remote"
  | "applying-remote"
  | "merging";

export type SyncProgress = {
  phase: SyncProgressPhase;
  processed: number;
  total: number;
  detail: string;
};

export type SyncState = {
  lastSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastRevision: string | null;
  status: SyncStatus;
  lastError: string | null;
  progress: SyncProgress | null;
};

const SYNC_STATE_KEY = "onesync.syncState";
const STALE_RUNNING_SYNC_MS = 180_000;
const INTERRUPTED_SYNC_MESSAGE = "Previous sync did not finish. Try syncing again.";

const defaultSyncState: SyncState = {
  lastSyncAt: null,
  lastSuccessfulSyncAt: null,
  lastRevision: null,
  status: "idle",
  lastError: null,
  progress: null
};

function isStaleRunningSyncState(state: SyncState): boolean {
  if (state.status !== "running" || !state.lastSyncAt) {
    return state.status === "running";
  }

  const timestamp = Date.parse(state.lastSyncAt);

  if (Number.isNaN(timestamp)) {
    return true;
  }

  return Date.now() - timestamp > STALE_RUNNING_SYNC_MS;
}

function recoverInterruptedSyncState(state: SyncState): SyncState {
  if (!isStaleRunningSyncState(state)) {
    return state;
  }

  return {
    ...state,
    status: "error",
    lastError: INTERRUPTED_SYNC_MESSAGE,
    progress: null
  };
}

export async function getSyncState(): Promise<SyncState> {
  const result = await browser.storage.local.get(SYNC_STATE_KEY);
  const state = {
    ...defaultSyncState,
    ...(result[SYNC_STATE_KEY] as Partial<SyncState> | undefined)
  };
  const recoveredState = recoverInterruptedSyncState(state);

  if (recoveredState !== state) {
    await browser.storage.local.set({ [SYNC_STATE_KEY]: recoveredState });
  }

  return recoveredState;
}

export async function setSyncState(state: SyncState): Promise<void> {
  await browser.storage.local.set({ [SYNC_STATE_KEY]: state });
}
