import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BookmarkBundle } from "../../src/core/format/schema";
import type { RuntimeMessage } from "../../src/core/shared/types";
import type { SyncConfig } from "../../src/core/state/config";

const {
  getConfigMock,
  loadPrivateManagerBundleMock,
  savePrivateManagerBundleMock,
  applyPrivateBookmarkOperationMock,
  buildPrivateBookmarksViewStateMock,
  appendActivityLogMock,
  loadSharedBookmarkBundleMock,
  encodeBundleMock,
  decodeBundleMock,
  applyBundleToBookmarksMock,
  applySharedBundleLocallyMock,
  getBookmarkStorageModeMock,
  setRecoverySnapshotMock
} = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  loadPrivateManagerBundleMock: vi.fn(),
  savePrivateManagerBundleMock: vi.fn(),
  applyPrivateBookmarkOperationMock: vi.fn(),
  buildPrivateBookmarksViewStateMock: vi.fn(),
  appendActivityLogMock: vi.fn(),
  loadSharedBookmarkBundleMock: vi.fn(),
  encodeBundleMock: vi.fn(),
  decodeBundleMock: vi.fn(),
  applyBundleToBookmarksMock: vi.fn(),
  applySharedBundleLocallyMock: vi.fn(),
  getBookmarkStorageModeMock: vi.fn(() => "private"),
  setRecoverySnapshotMock: vi.fn()
}));

vi.mock("wxt/browser", () => ({
  browser: {
    runtime: {
      onInstalled: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
      onMessage: { addListener: vi.fn() }
    },
    alarms: {
      onAlarm: { addListener: vi.fn() }
    }
  }
}));

vi.mock("../../src/core/browser/bookmarks", () => ({
  applyBundleToBookmarks: applyBundleToBookmarksMock,
  applySharedBundleLocally: applySharedBundleLocallyMock,
  getBookmarkStorageMode: getBookmarkStorageModeMock,
  loadSharedBookmarkBundle: loadSharedBookmarkBundleMock
}));

vi.mock("../../src/core/browser/private-bookmarks", () => ({
  loadPrivateManagerBundle: loadPrivateManagerBundleMock,
  savePrivateManagerBundle: savePrivateManagerBundleMock
}));

vi.mock("../../src/core/browser/storage", () => ({
  setBaseSnapshot: vi.fn(),
  setRecoverySnapshot: setRecoverySnapshotMock
}));

vi.mock("../../src/core/state/activity-log", () => ({
  appendActivityLog: appendActivityLogMock,
  getActivityLog: vi.fn()
}));

vi.mock("../../src/core/private-bookmarks/mutators", () => ({
  applyPrivateBookmarkOperation: applyPrivateBookmarkOperationMock
}));

vi.mock("../../src/core/private-bookmarks/view-state", () => ({
  buildPrivateBookmarksViewState: buildPrivateBookmarksViewStateMock
}));

vi.mock("../../src/core/state/config", () => ({
  getConfig: getConfigMock,
  setConfig: vi.fn()
}));

vi.mock("../../src/core/state/config-validation", () => ({
  getSyncConfigReadyError: vi.fn(),
  validateSyncConfigForSync: vi.fn((config: SyncConfig) => config)
}));

vi.mock("../../src/core/state/sync-state", () => ({
  getSyncState: vi.fn(),
  setSyncState: vi.fn()
}));

vi.mock("../../src/core/format/decode", () => ({
  decodeBundle: decodeBundleMock
}));

vi.mock("../../src/core/format/encode", () => ({
  encodeBundle: encodeBundleMock
}));

vi.mock("../../src/core/sync/scheduler", () => ({
  PERIODIC_SYNC_ALARM: "onesync.periodic-sync",
  reconcileSyncAlarm: vi.fn(),
  runScheduledSync: vi.fn()
}));

vi.mock("../../src/core/sync/singleflight", () => ({
  runSyncSingleFlight: vi.fn()
}));

vi.mock("../../src/core/webdav/client", () => ({
  createWebDavClient: vi.fn()
}));

vi.mock("../../src/core/sync/sync-engine", () => ({
  syncOnce: vi.fn()
}));

vi.mock("../../src/ui/sync-progress", () => ({
  formatSyncProgressLabel: vi.fn(),
  formatSyncStatusLabel: vi.fn(),
  getSyncProgressPercent: vi.fn()
}));

const sampleConfig: SyncConfig = {
  deviceId: "device-1",
  webdavUrl: "https://dav.example.com",
  username: "alice",
  password: "secret",
  basePath: "/onesync",
  intervalMinutes: 15,
  scheduledSyncEnabled: true,
  allowInsecureHttp: false
};

const currentBundle: BookmarkBundle = {
  kind: "onesync.bookmarks",
  schemaVersion: 1,
  revision: "2026-07-01T00:00:00.000Z#device-1#private",
  deviceId: "device-1",
  generatedAt: "2026-07-01T00:00:00.000Z",
  roots: {
    toolbar: "root-toolbar",
    menu: "root-menu",
    mobile: "root-mobile",
    unfiled: "root-unfiled"
  },
  nodes: {
    "root-toolbar": {
      id: "root-toolbar",
      type: "folder",
      title: "Bookmarks Bar",
      children: ["folder-a", "bookmark-1"],
      addedAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z"
    },
    "root-menu": {
      id: "root-menu",
      type: "folder",
      title: "Bookmarks Menu",
      children: [],
      addedAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z"
    },
    "root-mobile": {
      id: "root-mobile",
      type: "folder",
      title: "Mobile Bookmarks",
      children: [],
      addedAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z"
    },
    "root-unfiled": {
      id: "root-unfiled",
      type: "folder",
      title: "Unfiled Bookmarks",
      children: [],
      addedAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z"
    },
    "folder-a": {
      id: "folder-a",
      type: "folder",
      title: "Folder A",
      children: [],
      addedAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z"
    },
    "bookmark-1": {
      id: "bookmark-1",
      type: "bookmark",
      title: "Docs",
      url: "https://example.com/docs",
      addedAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z"
    }
  },
  tombstones: [],
  meta: {
    client: "onesync",
    clientVersion: "0.2.0"
  }
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  getConfigMock.mockResolvedValue(sampleConfig);
  loadPrivateManagerBundleMock.mockResolvedValue(currentBundle);
  savePrivateManagerBundleMock.mockResolvedValue(currentBundle);
  loadSharedBookmarkBundleMock.mockResolvedValue(currentBundle);
  encodeBundleMock.mockResolvedValue({ kind: "onesync.bundle", payload: "encoded" });
  decodeBundleMock.mockResolvedValue(currentBundle);
  getBookmarkStorageModeMock.mockReturnValue("private");
  buildPrivateBookmarksViewStateMock.mockReturnValue({
    mode: "private",
    selectedFolderId: "root-toolbar",
    itemCount: 2,
    modeHint: "This is your primary local bookmark workspace.",
    folders: [],
    tree: [],
    currentFolder: null
  });
});

describe("background private bookmark activity logging", () => {
  it("records an info activity entry after a bookmark edit", async () => {
    vi.stubGlobal("defineBackground", (factory: () => unknown) => factory);

    const nextBundle: BookmarkBundle = {
      ...currentBundle,
      nodes: {
        ...currentBundle.nodes,
        "bookmark-1": {
          ...currentBundle.nodes["bookmark-1"],
          type: "bookmark",
          title: "Docs hub",
          url: "https://example.com/hub"
        }
      }
    };

    applyPrivateBookmarkOperationMock.mockReturnValue(nextBundle);
    savePrivateManagerBundleMock.mockResolvedValue(nextBundle);
    const { handleRuntimeMessage } = await import("../../entrypoints/background");

    await handleRuntimeMessage({
      type: "onesync:mutate-private-bookmarks",
      payload: {
        operation: {
          type: "update-bookmark",
          nodeId: "bookmark-1",
          title: "Docs hub",
          url: "https://example.com/hub"
        }
      }
    } satisfies RuntimeMessage);

    expect(appendActivityLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "info",
        message: 'Private bookmarks: updated "Docs" to "Docs hub".'
      })
    );
  });

  it("records an info activity entry after a successful move", async () => {
    vi.stubGlobal("defineBackground", (factory: () => unknown) => factory);

    const nextBundle: BookmarkBundle = {
      ...currentBundle,
      nodes: {
        ...currentBundle.nodes,
        "root-toolbar": {
          ...currentBundle.nodes["root-toolbar"],
          type: "folder",
          title: "Bookmarks Bar",
          children: ["folder-a"]
        },
        "root-menu": {
          ...currentBundle.nodes["root-menu"],
          type: "folder",
          title: "Bookmarks Menu",
          children: ["bookmark-1"]
        }
      }
    };

    applyPrivateBookmarkOperationMock.mockReturnValue(nextBundle);
    savePrivateManagerBundleMock.mockResolvedValue(nextBundle);
    const { handleRuntimeMessage } = await import("../../entrypoints/background");

    const response = await handleRuntimeMessage({
      type: "onesync:mutate-private-bookmarks",
      payload: {
        operation: {
          type: "move-node",
          nodeId: "bookmark-1",
          destinationFolderId: "root-menu"
        }
      }
    } satisfies RuntimeMessage);

    expect(response).toEqual(buildPrivateBookmarksViewStateMock.mock.results[0]?.value);
    expect(appendActivityLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "info",
        message: 'Private bookmarks: moved "Docs" to "Bookmarks Menu".'
      })
    );
  });

  it("exports through the shared bundle loader so native fallback edits are included", async () => {
    vi.stubGlobal("defineBackground", (factory: () => unknown) => factory);
    const { handleRuntimeMessage } = await import("../../entrypoints/background");

    await handleRuntimeMessage({
      type: "onesync:export-bundle"
    } satisfies RuntimeMessage);

    expect(loadSharedBookmarkBundleMock).toHaveBeenCalledWith(sampleConfig);
    expect(encodeBundleMock).toHaveBeenCalledWith(currentBundle);
  });

  it("stores import recovery snapshots from the shared bundle loader", async () => {
    vi.stubGlobal("defineBackground", (factory: () => unknown) => factory);
    const { handleRuntimeMessage } = await import("../../entrypoints/background");

    await handleRuntimeMessage({
      type: "onesync:import-bundle",
      payload: {
        encodedBundleJson: JSON.stringify({ kind: "onesync.bundle", payload: "encoded" })
      }
    } satisfies RuntimeMessage);

    expect(loadSharedBookmarkBundleMock).toHaveBeenCalledWith(sampleConfig);
    expect(setRecoverySnapshotMock).toHaveBeenCalledWith(currentBundle);
    expect(applySharedBundleLocallyMock).toHaveBeenCalledWith(currentBundle, "private");
  });

  it("surfaces shared-bundle apply failures during import with the active carrier mode", async () => {
    vi.stubGlobal("defineBackground", (factory: () => unknown) => factory);
    const applyFailure = new Error(
      "Shared data saved, browser bookmarks not updated: Failed to apply bookmark bundle locally: Native bookmarks write blocked"
    );
    getBookmarkStorageModeMock.mockReturnValue("native");
    applySharedBundleLocallyMock.mockRejectedValueOnce(applyFailure);
    const { handleRuntimeMessage } = await import("../../entrypoints/background");

    await expect(
      handleRuntimeMessage({
        type: "onesync:import-bundle",
        payload: {
          encodedBundleJson: JSON.stringify({ kind: "onesync.bundle", payload: "encoded" })
        }
      } satisfies RuntimeMessage)
    ).rejects.toThrow(applyFailure.message);

    expect(loadSharedBookmarkBundleMock).toHaveBeenCalledWith(sampleConfig);
    expect(setRecoverySnapshotMock).toHaveBeenCalledWith(currentBundle);
    expect(applySharedBundleLocallyMock).toHaveBeenCalledWith(currentBundle, "native");
  });
});
