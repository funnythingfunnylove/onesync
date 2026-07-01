import { beforeEach, describe, expect, it, vi } from "vitest";

const { storageGetMock, storageSetMock } = vi.hoisted(() => ({
  storageGetMock: vi.fn(),
  storageSetMock: vi.fn()
}));

vi.mock("webextension-polyfill", () => ({
  default: {
    storage: {
      local: {
        get: storageGetMock,
        set: storageSetMock
      }
    }
  }
}));

import { getSyncState } from "../../src/core/state/sync-state";

describe("sync state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recovers stale running sync state into an error state", async () => {
    storageGetMock.mockResolvedValue({
      "onesync.syncState": {
        lastSyncAt: "2026-06-30T07:30:00.000Z",
        lastSuccessfulSyncAt: null,
        lastRevision: null,
        status: "running",
        lastError: null,
        progress: {
          phase: "uploading-remote",
          processed: 42,
          total: 42,
          detail: "Uploading merged bookmark snapshot to WebDAV"
        }
      }
    });

    const state = await getSyncState();

    expect(state).toEqual({
      lastSyncAt: "2026-06-30T07:30:00.000Z",
      lastSuccessfulSyncAt: null,
      lastRevision: null,
      status: "error",
      lastError: "Previous sync did not finish. Try syncing again.",
      progress: null
    });
    expect(storageSetMock).toHaveBeenCalledWith({
      "onesync.syncState": {
        lastSyncAt: "2026-06-30T07:30:00.000Z",
        lastSuccessfulSyncAt: null,
        lastRevision: null,
        status: "error",
        lastError: "Previous sync did not finish. Try syncing again.",
        progress: null
      }
    });
  });

  it("keeps recent running sync state intact", async () => {
    const now = Date.now();
    storageGetMock.mockResolvedValue({
      "onesync.syncState": {
        lastSyncAt: new Date(now - 15_000).toISOString(),
        lastSuccessfulSyncAt: null,
        lastRevision: null,
        status: "running",
        lastError: null,
        progress: {
          phase: "uploading-remote",
          processed: 42,
          total: 42,
          detail: "Uploading merged bookmark snapshot to WebDAV"
        }
      }
    });

    const state = await getSyncState();

    expect(state.status).toBe("running");
    expect(state.progress).toEqual({
      phase: "uploading-remote",
      processed: 42,
      total: 42,
      detail: "Uploading merged bookmark snapshot to WebDAV"
    });
    expect(storageSetMock).not.toHaveBeenCalled();
  });
});
