import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookmarkBundle, EncodedBookmarkBundle } from "../../src/core/format/schema";

const localBundle: BookmarkBundle = {
  kind: "onesync.bookmarks",
  schemaVersion: 1,
  revision: "2026-06-30T12:00:00.000Z#device-1#1",
  deviceId: "device-1",
  generatedAt: "2026-06-30T12:00:00.000Z",
  roots: {
    toolbar: "toolbar-root",
    menu: "menu-root",
    mobile: "mobile-root",
    unfiled: "menu-root"
  },
  nodes: {
    "toolbar-root": {
      id: "toolbar-root",
      type: "folder",
      title: "Bookmarks Bar",
      children: ["bookmark-1"],
      addedAt: "2026-06-30T11:59:00.000Z",
      updatedAt: "2026-06-30T11:59:00.000Z"
    },
    "menu-root": {
      id: "menu-root",
      type: "folder",
      title: "Other Bookmarks",
      children: [],
      addedAt: "2026-06-30T11:59:00.000Z",
      updatedAt: "2026-06-30T11:59:00.000Z"
    },
    "mobile-root": {
      id: "mobile-root",
      type: "folder",
      title: "Mobile Bookmarks",
      children: [],
      addedAt: "2026-06-30T11:59:00.000Z",
      updatedAt: "2026-06-30T11:59:00.000Z"
    },
    "bookmark-1": {
      id: "bookmark-1",
      type: "bookmark",
      title: "Example",
      url: "https://example.com/",
      addedAt: "2026-06-30T11:59:00.000Z",
      updatedAt: "2026-06-30T11:59:00.000Z"
    }
  },
  tombstones: [],
  meta: {
    client: "onesync",
    clientVersion: "0.1.0"
  }
};

const emptyPrivateLocalBundle: BookmarkBundle = {
  kind: "onesync.bookmarks",
  schemaVersion: 1,
  revision: "2026-07-01T08:00:00.000Z#device-safari#snapshot",
  deviceId: "device-safari",
  generatedAt: "2026-07-01T08:00:00.000Z",
  roots: {
    toolbar: "onesync.synthetic.toolbar",
    menu: "onesync.synthetic.menu",
    mobile: "onesync.synthetic.mobile",
    unfiled: "onesync.synthetic.unfiled"
  },
  nodes: {
    "onesync.synthetic.toolbar": {
      id: "onesync.synthetic.toolbar",
      type: "folder",
      title: "Bookmarks Bar",
      children: [],
      addedAt: "2026-07-01T08:00:00.000Z",
      updatedAt: "2026-07-01T08:00:00.000Z"
    },
    "onesync.synthetic.menu": {
      id: "onesync.synthetic.menu",
      type: "folder",
      title: "Bookmarks Menu",
      children: [],
      addedAt: "2026-07-01T08:00:00.000Z",
      updatedAt: "2026-07-01T08:00:00.000Z"
    },
    "onesync.synthetic.mobile": {
      id: "onesync.synthetic.mobile",
      type: "folder",
      title: "Mobile Bookmarks",
      children: [],
      addedAt: "2026-07-01T08:00:00.000Z",
      updatedAt: "2026-07-01T08:00:00.000Z"
    },
    "onesync.synthetic.unfiled": {
      id: "onesync.synthetic.unfiled",
      type: "folder",
      title: "Unfiled Bookmarks",
      children: [],
      addedAt: "2026-07-01T08:00:00.000Z",
      updatedAt: "2026-07-01T08:00:00.000Z"
    }
  },
  tombstones: [],
  meta: {
    client: "onesync",
    clientVersion: "0.1.0"
  }
};

const encodedBundle: EncodedBookmarkBundle = {
  kind: "onesync.bundle",
  bundleVersion: 1,
  encoding: "base64url+gzip+json",
  checksum: {
    algorithm: "sha256",
    value: "abc123"
  },
  payload: "payload"
};

const {
  putLatestBundle,
  fetchLatestBundle,
  setBaseSnapshot,
  setRecoverySnapshot,
  applyBundleToBookmarks,
  setSyncState,
  appendActivityLog,
  encodeBundle,
  decodeBundle,
  listLocalBookmarks,
  getBaseSnapshot
} = vi.hoisted(() => ({
  putLatestBundle: vi.fn(),
  fetchLatestBundle: vi.fn(),
  setBaseSnapshot: vi.fn(),
  setRecoverySnapshot: vi.fn(),
  applyBundleToBookmarks: vi.fn(),
  setSyncState: vi.fn(),
  appendActivityLog: vi.fn(),
  encodeBundle: vi.fn(),
  decodeBundle: vi.fn(),
  listLocalBookmarks: vi.fn(),
  getBaseSnapshot: vi.fn()
}));

vi.mock("../../src/core/browser/bookmarks", () => ({
  applyBundleToBookmarks,
  listLocalBookmarks
}));

vi.mock("../../src/core/browser/storage", () => ({
  getBaseSnapshot,
  setBaseSnapshot,
  setRecoverySnapshot
}));

vi.mock("../../src/core/format/encode", () => ({
  encodeBundle
}));

vi.mock("../../src/core/format/decode", () => ({
  decodeBundle
}));

vi.mock("../../src/core/webdav/client", () => ({
  createWebDavClient: () => ({
    fetchLatestBundle,
    putLatestBundle
  })
}));

vi.mock("../../src/core/state/sync-state", () => ({
  setSyncState
}));

vi.mock("../../src/core/state/activity-log", () => ({
  appendActivityLog
}));

import { syncOnce } from "../../src/core/sync/sync-engine";

beforeEach(() => {
  vi.clearAllMocks();
  fetchLatestBundle.mockReset();
  putLatestBundle.mockReset();
  encodeBundle.mockImplementation(async (_bundle, options) => {
    await options?.onProgress?.({
      detail: "Normalizing bookmark snapshot"
    });
    await options?.onProgress?.({
      detail: "Serializing bookmark snapshot"
    });
    await options?.onProgress?.({
      detail: "Compressing bookmark snapshot"
    });
    await options?.onProgress?.({
      detail: "Encoding WebDAV payload"
    });
    await options?.onProgress?.({
      detail: "Calculating bundle checksum"
    });

    return encodedBundle;
  });
  decodeBundle.mockResolvedValue(localBundle);
  listLocalBookmarks.mockResolvedValue(localBundle);
  getBaseSnapshot.mockResolvedValue(null);
  fetchLatestBundle.mockResolvedValue({ bundleEtag: null, metadataEtag: null, bundle: null });
});

describe("syncOnce", () => {
  it("rejects incomplete sync settings before touching bookmarks or WebDAV", async () => {
    await expect(
      syncOnce({
        deviceId: "device-1",
        webdavUrl: "https://dav.example.com",
        username: "alice",
        password: "",
        basePath: "/onesync",
        intervalMinutes: 15,
        scheduledSyncEnabled: true,
        allowInsecureHttp: false
      })
    ).rejects.toThrow(/password/i);

    expect(listLocalBookmarks).not.toHaveBeenCalled();
    expect(fetchLatestBundle).not.toHaveBeenCalled();
    expect(putLatestBundle).not.toHaveBeenCalled();
  });

  it("uploads the local bundle when no remote bundle exists", async () => {
    listLocalBookmarks.mockImplementationOnce(async (_config, options) => {
      await options?.onProgress?.({
        processed: 1,
        total: 1
      });
      return localBundle;
    });

    const result = await syncOnce({
      deviceId: "device-1",
      webdavUrl: "https://dav.example.com",
      username: "alice",
      password: "secret",
      basePath: "/onesync",
      intervalMinutes: 15,
      scheduledSyncEnabled: true,
      allowInsecureHttp: false
    });

    expect(result.status).toBe("uploaded");
    expect(result.revision).toBe(localBundle.revision);
    expect(putLatestBundle).toHaveBeenCalledWith(
      encodedBundle,
      localBundle.revision,
      localBundle.deviceId,
      null,
      expect.objectContaining({
        onProgress: expect.any(Function)
      })
    );
    expect(setBaseSnapshot).toHaveBeenCalledWith(localBundle);
    expect(setSyncState).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "running",
        progress: expect.objectContaining({
          phase: "scanning-local",
          processed: 1,
          total: 1
        })
      })
    );
    expect(setSyncState).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "running",
        progress: expect.objectContaining({
          phase: "uploading-remote",
          processed: 0,
          total: 1,
          detail: "Calculating bundle checksum"
        })
      })
    );
    expect(setSyncState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "uploaded",
        progress: null
      })
    );
  });

  it("throttles progress state writes during large local scans while keeping the final count accurate", async () => {
    listLocalBookmarks.mockImplementationOnce(async (_config, options) => {
      for (let processed = 1; processed <= 250; processed += 1) {
        await options?.onProgress?.({
          processed,
          total: 250
        });
      }

      return localBundle;
    });

    await syncOnce({
      deviceId: "device-1",
      webdavUrl: "https://dav.example.com",
      username: "alice",
      password: "secret",
      basePath: "/onesync",
      intervalMinutes: 15,
      scheduledSyncEnabled: true,
      allowInsecureHttp: false
    });

    const runningProgressCalls = setSyncState.mock.calls.filter(([state]) => state.status === "running");

    expect(runningProgressCalls.length).toBeLessThan(40);
    expect(setSyncState).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "running",
        progress: expect.objectContaining({
          phase: "scanning-local",
          processed: 250,
          total: 250
        })
      })
    );
  });

  it("surfaces granular WebDAV upload detail during merged uploads", async () => {
    const remoteBundle = {
      ...localBundle,
      nodes: {
        ...localBundle.nodes,
        "bookmark-1": {
          ...localBundle.nodes["bookmark-1"],
          title: "Remote Title",
          updatedAt: "2026-06-30T12:01:00.000Z"
        }
      }
    } satisfies BookmarkBundle;

    fetchLatestBundle.mockResolvedValue({
      bundleEtag: "\"bundle-etag-1\"",
      metadataEtag: "\"meta-etag-1\"",
      bundle: encodedBundle
    });
    decodeBundle.mockResolvedValueOnce(remoteBundle);
    putLatestBundle.mockImplementationOnce(async (_bundle, _revision, _deviceId, _etags, options) => {
      await options?.onProgress?.({
        completedSteps: 0,
        totalSteps: 5,
        detail: "Preparing WebDAV collections"
      });
      await options?.onProgress?.({
        completedSteps: 1,
        totalSteps: 5,
        detail: "Uploading latest bundle to WebDAV"
      });
      await options?.onProgress?.({
        completedSteps: 2,
        totalSteps: 5,
        detail: "Uploading latest metadata to WebDAV"
      });
      await options?.onProgress?.({
        completedSteps: 3,
        totalSteps: 5,
        detail: "Writing history snapshot to WebDAV"
      });
      await options?.onProgress?.({
        completedSteps: 4,
        totalSteps: 5,
        detail: "Updating device state on WebDAV"
      });
    });

    await syncOnce({
      deviceId: "device-1",
      webdavUrl: "https://dav.example.com",
      username: "alice",
      password: "secret",
      basePath: "/onesync",
      intervalMinutes: 15,
      scheduledSyncEnabled: true,
      allowInsecureHttp: false
    });

    expect(setSyncState).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "running",
        progress: expect.objectContaining({
          phase: "uploading-remote",
          detail: "Preparing WebDAV collections"
        })
      })
    );
    expect(setSyncState).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "running",
        progress: expect.objectContaining({
          phase: "uploading-remote",
          detail: "Writing history snapshot to WebDAV"
        })
      })
    );
    expect(setSyncState).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "running",
        progress: expect.objectContaining({
          phase: "uploading-remote",
          detail: "Updating device state on WebDAV"
        })
      })
    );
  });

  it("reports encoding before WebDAV upload starts on the initial upload path", async () => {
    await syncOnce({
      deviceId: "device-1",
      webdavUrl: "https://dav.example.com",
      username: "alice",
      password: "secret",
      basePath: "/onesync",
      intervalMinutes: 15,
      scheduledSyncEnabled: true,
      allowInsecureHttp: false
    });

    expect(setSyncState).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "running",
        progress: expect.objectContaining({
          phase: "uploading-remote",
          detail: "Compressing bookmark snapshot"
        })
      })
    );
  });

  it("refreshes the running sync heartbeat during a long encoding step", async () => {
    vi.useFakeTimers();

    let resolveEncoding!: (bundle: EncodedBookmarkBundle) => void;
    encodeBundle.mockImplementationOnce(async (_bundle, options) => {
      await options?.onProgress?.({
        detail: "Compressing bookmark snapshot"
      });

      return await new Promise<EncodedBookmarkBundle>((resolve) => {
        resolveEncoding = resolve;
      });
    });

    const pendingSync = syncOnce({
      deviceId: "device-1",
      webdavUrl: "https://dav.example.com",
      username: "alice",
      password: "secret",
      basePath: "/onesync",
      intervalMinutes: 15,
      scheduledSyncEnabled: true,
      allowInsecureHttp: false
    });

    await vi.advanceTimersByTimeAsync(20_000);

    const compressingWrites = setSyncState.mock.calls.filter(
      ([state]) =>
        state.status === "running" &&
        state.progress?.phase === "uploading-remote" &&
        state.progress.detail === "Compressing bookmark snapshot"
    );

    expect(compressingWrites.length).toBeGreaterThan(1);

    resolveEncoding(encodedBundle);
    await pendingSync;
    vi.useRealTimers();
  });

  it("merges and applies the remote bundle when one already exists", async () => {
    const remoteBundle = {
      ...localBundle,
      nodes: {
        ...localBundle.nodes,
        "bookmark-1": {
          ...localBundle.nodes["bookmark-1"],
          title: "Remote Title",
          updatedAt: "2026-06-30T12:01:00.000Z"
        }
      }
    } satisfies BookmarkBundle;

    fetchLatestBundle.mockResolvedValue({
      bundleEtag: "\"bundle-etag-1\"",
      metadataEtag: "\"meta-etag-1\"",
      bundle: encodedBundle
    });
    decodeBundle.mockResolvedValueOnce(remoteBundle);

    const result = await syncOnce({
      deviceId: "device-1",
      webdavUrl: "https://dav.example.com",
      username: "alice",
      password: "secret",
      basePath: "/onesync",
      intervalMinutes: 15,
      scheduledSyncEnabled: true,
      allowInsecureHttp: false
    });

    expect(result.status).toBe("merged");
    expect(applyBundleToBookmarks).toHaveBeenCalledTimes(1);
    expect(setBaseSnapshot).toHaveBeenCalledTimes(1);
    expect(putLatestBundle).toHaveBeenCalledTimes(1);
    expect(putLatestBundle).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      expect.any(String),
      {
        bundle: "\"bundle-etag-1\"",
        metadata: "\"meta-etag-1\""
      },
      expect.objectContaining({
        onProgress: expect.any(Function)
      })
    );
    expect(appendActivityLog).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "info",
        message: "Applying merged bookmark bundle locally."
      })
    );
    expect(appendActivityLog).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "info",
        message: "Applied merged bookmark bundle locally."
      })
    );
  });

  it("downloads and applies the remote bundle without re-uploading when only the remote side changed", async () => {
    const baseBundle = structuredClone(localBundle);
    const remoteBundle = {
      ...structuredClone(localBundle),
      revision: "2026-06-30T12:02:00.000Z#device-2#1",
      deviceId: "device-2",
      nodes: {
        ...localBundle.nodes,
        "bookmark-1": {
          ...localBundle.nodes["bookmark-1"],
          title: "Remote Only Title",
          updatedAt: "2026-06-30T12:02:00.000Z"
        }
      }
    } satisfies BookmarkBundle;

    getBaseSnapshot.mockResolvedValue(baseBundle);
    fetchLatestBundle.mockResolvedValue({
      bundleEtag: "\"bundle-etag-2\"",
      metadataEtag: "\"meta-etag-2\"",
      bundle: encodedBundle
    });
    decodeBundle.mockResolvedValueOnce(remoteBundle);
    applyBundleToBookmarks.mockImplementationOnce(async (_bundle, options) => {
      await options?.onProgress?.({
        processed: 1,
        total: 1
      });
    });

    const result = await syncOnce({
      deviceId: "device-1",
      webdavUrl: "https://dav.example.com",
      username: "alice",
      password: "secret",
      basePath: "/onesync",
      intervalMinutes: 15,
      scheduledSyncEnabled: true,
      allowInsecureHttp: false
    });

    expect(result.status).toBe("downloaded");
    expect(result.revision).toBe(remoteBundle.revision);
    expect(applyBundleToBookmarks).toHaveBeenCalledWith(remoteBundle, expect.any(Object));
    expect(setBaseSnapshot).toHaveBeenCalledWith(remoteBundle);
    expect(putLatestBundle).not.toHaveBeenCalled();
    expect(setSyncState).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "running",
        progress: expect.objectContaining({
          phase: "applying-remote",
          processed: 1,
          total: 1
        })
      })
    );
    expect(appendActivityLog).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "info",
        message: "Applying remote bookmark bundle locally."
      })
    );
    expect(appendActivityLog).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "info",
        message: "Applied remote bookmark bundle locally."
      })
    );
  });

  it("downloads the remote bundle when Safari starts from an empty private local carrier and no base snapshot exists", async () => {
    const remoteBundle = structuredClone(localBundle);

    listLocalBookmarks.mockResolvedValueOnce(emptyPrivateLocalBundle);
    fetchLatestBundle.mockResolvedValue({
      bundleEtag: "\"bundle-etag-remote\"",
      metadataEtag: "\"meta-etag-remote\"",
      bundle: encodedBundle
    });
    decodeBundle.mockResolvedValueOnce(remoteBundle);
    applyBundleToBookmarks.mockImplementationOnce(async (_bundle, options) => {
      await options?.onProgress?.({
        processed: 1,
        total: 1
      });
    });

    const result = await syncOnce({
      deviceId: "device-safari",
      webdavUrl: "https://dav.example.com",
      username: "alice",
      password: "secret",
      basePath: "/onesync",
      intervalMinutes: 15,
      scheduledSyncEnabled: true,
      allowInsecureHttp: false
    });

    expect(result.status).toBe("downloaded");
    expect(applyBundleToBookmarks).toHaveBeenCalledWith(remoteBundle, expect.any(Object));
    expect(setBaseSnapshot).toHaveBeenCalledWith(remoteBundle);
    expect(putLatestBundle).not.toHaveBeenCalled();
  });

  it("returns idle and skips writeback when neither side changed from the base snapshot", async () => {
    const baseBundle = structuredClone(localBundle);

    getBaseSnapshot.mockResolvedValue(baseBundle);
    fetchLatestBundle.mockResolvedValue({
      bundleEtag: "\"bundle-etag-3\"",
      metadataEtag: "\"meta-etag-3\"",
      bundle: encodedBundle
    });
    decodeBundle.mockResolvedValueOnce(baseBundle);

    const result = await syncOnce({
      deviceId: "device-1",
      webdavUrl: "https://dav.example.com",
      username: "alice",
      password: "secret",
      basePath: "/onesync",
      intervalMinutes: 15,
      scheduledSyncEnabled: true,
      allowInsecureHttp: false
    });

    expect(result.status).toBe("idle");
    expect(result.revision).toBe(baseBundle.revision);
    expect(applyBundleToBookmarks).not.toHaveBeenCalled();
    expect(putLatestBundle).not.toHaveBeenCalled();
  });
});
