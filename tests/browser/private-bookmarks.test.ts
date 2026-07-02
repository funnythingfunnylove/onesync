import { beforeEach, describe, expect, it, vi } from "vitest";

import { encodeBundleLocally } from "../../src/core/format/encode-core";
import type { RuntimeMessage } from "../../src/core/shared/types";
import type { SyncConfig } from "../../src/core/state/config";
import type { BookmarkBundle } from "../../src/core/format/schema";
import { installMockIndexedDb } from "../helpers/mock-indexeddb";

type NativeBookmarkTreeNode = {
  id: string;
  title?: string;
  url?: string;
  children?: NativeBookmarkTreeNode[];
};

const {
  browserMock,
  getTreeMock,
  createMock,
  removeMock,
  removeTreeMock,
  storageGetMock,
  storageSetMock,
  storageState,
  nativeTreeState
} = vi.hoisted(() => {
  const storageState: Record<string, unknown> = {};
  const nativeTreeState: NativeBookmarkTreeNode[] = [
    {
      id: "root",
      title: "",
      children: [
        {
          id: "toolbar-root",
          title: "Bookmarks Bar",
          children: [
            {
              id: "native-bookmark-1",
              title: "Native Example",
              url: "https://native.example.com/"
            }
          ]
        },
        {
          id: "menu-root",
          title: "Bookmarks Menu",
          children: []
        },
        {
          id: "mobile-root",
          title: "Mobile Bookmarks",
          children: []
        }
      ]
    }
  ];

  function cloneTree<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  function findNode(nodeId: string, nodes: NativeBookmarkTreeNode[] = nativeTreeState): NativeBookmarkTreeNode | null {
    for (const node of nodes) {
      if (node.id === nodeId) {
        return node;
      }

      const child = findNode(nodeId, node.children ?? []);

      if (child) {
        return child;
      }
    }

    return null;
  }

  function findParent(nodeId: string, nodes: NativeBookmarkTreeNode[] = nativeTreeState): NativeBookmarkTreeNode | null {
    for (const node of nodes) {
      for (const child of node.children ?? []) {
        if (child.id === nodeId) {
          return node;
        }
      }

      const nestedParent = findParent(nodeId, node.children ?? []);

      if (nestedParent) {
        return nestedParent;
      }
    }

    return null;
  }

  function removeNode(nodeId: string): boolean {
    const parent = findParent(nodeId);

    if (!parent?.children) {
      return false;
    }

    const nextChildren = parent.children.filter((child) => child.id !== nodeId);

    if (nextChildren.length === parent.children.length) {
      return false;
    }

    parent.children = nextChildren;
    return true;
  }

  const getTreeMock = vi.fn(async () => cloneTree(nativeTreeState));
  const createMock = vi.fn(async (payload: { parentId?: string; title?: string; url?: string }) => {
    const parent = payload.parentId ? findNode(payload.parentId) : null;

    if (!parent) {
      throw new Error(`Unknown parent: ${payload.parentId}`);
    }

    const nextId = `native-created-${createMock.mock.calls.length}`;
    const createdNode: NativeBookmarkTreeNode = payload.url
      ? {
          id: nextId,
          title: payload.title,
          url: payload.url
        }
      : {
          id: nextId,
          title: payload.title,
          children: []
        };

    parent.children = [...(parent.children ?? []), createdNode];
    return cloneTree(createdNode);
  });
  const removeMock = vi.fn(async (nodeId: string) => {
    if (!removeNode(nodeId)) {
      throw new Error(`Bookmark ${nodeId} not found`);
    }
  });
  const removeTreeMock = vi.fn(async (nodeId: string) => {
    if (!removeNode(nodeId)) {
      throw new Error(`Bookmark ${nodeId} not found`);
    }
  });
  const storageGetMock = vi.fn(async (key?: string | string[]) => {
    if (!key) {
      return { ...storageState };
    }

    if (Array.isArray(key)) {
      return Object.fromEntries(key.map((item) => [item, storageState[item]]));
    }

    return { [key]: storageState[key] };
  });
  const storageSetMock = vi.fn(async (values: Record<string, unknown>) => {
    Object.assign(storageState, values);
  });

  return {
    getTreeMock,
    createMock,
    removeMock,
    removeTreeMock,
    storageGetMock,
    storageSetMock,
    storageState,
    nativeTreeState,
    browserMock: {
      bookmarks: {
        getTree: getTreeMock,
        create: createMock,
        remove: removeMock,
        removeTree: removeTreeMock
      },
      storage: {
        local: {
          get: storageGetMock,
          set: storageSetMock
        }
      }
    }
  };
});

vi.mock("wxt/browser", () => ({
  browser: browserMock
}));

import {
  applyBundleToBookmarks,
  applySharedBundleLocally,
  loadSharedBookmarkBundle
} from "../../src/core/browser/bookmarks";
import { loadPrivateManagerBundle, savePrivateManagerBundle } from "../../src/core/browser/private-bookmarks";

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

const privateCarrierBundle: BookmarkBundle = {
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
      children: ["private-bookmark"],
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
    "private-bookmark": {
      id: "private-bookmark",
      type: "bookmark",
      title: "Private Carrier Bookmark",
      url: "https://private.example.com/",
      addedAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z"
    }
  },
  tombstones: [],
  meta: {
    client: "onesync",
    clientVersion: "0.1.3"
  }
};

const updatedNativeBundle: BookmarkBundle = {
  kind: "onesync.bookmarks",
  schemaVersion: 1,
  revision: "2026-07-01T01:00:00.000Z#device-1#private",
  deviceId: "device-1",
  generatedAt: "2026-07-01T01:00:00.000Z",
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
      children: ["native-folder-1"],
      addedAt: "2026-07-01T01:00:00.000Z",
      updatedAt: "2026-07-01T01:00:00.000Z"
    },
    "menu-root": {
      id: "menu-root",
      type: "folder",
      title: "Bookmarks Menu",
      children: [],
      addedAt: "2026-07-01T01:00:00.000Z",
      updatedAt: "2026-07-01T01:00:00.000Z"
    },
    "mobile-root": {
      id: "mobile-root",
      type: "folder",
      title: "Mobile Bookmarks",
      children: [],
      addedAt: "2026-07-01T01:00:00.000Z",
      updatedAt: "2026-07-01T01:00:00.000Z"
    },
    "native-folder-1": {
      id: "native-folder-1",
      type: "folder",
      title: "Imported Folder",
      children: ["native-bookmark-2"],
      addedAt: "2026-07-01T01:00:00.000Z",
      updatedAt: "2026-07-01T01:00:00.000Z"
    },
    "native-bookmark-2": {
      id: "native-bookmark-2",
      type: "bookmark",
      title: "Imported Bookmark",
      url: "https://imported.example.com/",
      addedAt: "2026-07-01T01:00:00.000Z",
      updatedAt: "2026-07-01T01:00:00.000Z"
    }
  },
  tombstones: [],
  meta: {
    client: "onesync",
    clientVersion: "0.1.3"
  }
};

const syncedNativeBundle: BookmarkBundle = {
  ...updatedNativeBundle,
  revision: "2026-07-01T02:00:00.000Z#device-1#remote",
  generatedAt: "2026-07-01T02:00:00.000Z",
  nodes: {
    ...updatedNativeBundle.nodes,
    "native-folder-1": {
      ...updatedNativeBundle.nodes["native-folder-1"],
      updatedAt: "2026-07-01T02:00:00.000Z"
    },
    "native-bookmark-2": {
      id: "native-bookmark-2",
      type: "bookmark",
      title: "Synced Bookmark",
      url: "https://synced.example.com/",
      addedAt: "2026-07-01T01:00:00.000Z",
      updatedAt: "2026-07-01T02:00:00.000Z"
    }
  }
};

beforeEach(() => {
  browserMock.bookmarks = {
    getTree: getTreeMock,
    create: createMock,
    remove: removeMock,
    removeTree: removeTreeMock
  };
  browserMock.storage = {
    local: {
      get: storageGetMock,
      set: storageSetMock
    }
  };
  getTreeMock.mockClear();
  createMock.mockClear();
  removeMock.mockClear();
  removeTreeMock.mockClear();
  storageGetMock.mockClear();
  storageSetMock.mockClear();

  for (const key of Object.keys(storageState)) {
    delete storageState[key];
  }

  nativeTreeState.splice(0, nativeTreeState.length, {
    id: "root",
    title: "",
    children: [
      {
        id: "toolbar-root",
        title: "Bookmarks Bar",
        children: [
          {
            id: "native-bookmark-1",
            title: "Native Example",
            url: "https://native.example.com/"
          }
        ]
      },
      {
        id: "menu-root",
        title: "Bookmarks Menu",
        children: []
      },
      {
        id: "mobile-root",
        title: "Mobile Bookmarks",
        children: []
      }
    ]
  });
});

describe("private manager carrier integration", () => {
  it("loads from the current native carrier bundle instead of a detached manager store", async () => {
    storageState["onesync.privateManagerBundle"] = privateCarrierBundle;

    const bundle = await loadPrivateManagerBundle(sampleConfig);

    expect(bundle.roots.toolbar).toBe("toolbar-root");
    expect(bundle.nodes["native-bookmark-1"]).toMatchObject({
      title: "Native Example",
      url: "https://native.example.com/"
    });
    expect(bundle.nodes["private-bookmark"]).toBeUndefined();
    expect(storageGetMock).not.toHaveBeenCalledWith("onesync.privateManagerBundle");
  });

  it("loads from the Safari private carrier bundle when native bookmarks are unavailable", async () => {
    (browserMock as { bookmarks?: unknown }).bookmarks = undefined;
    storageState["onesync.privateBookmarks"] = privateCarrierBundle;

    const bundle = await loadPrivateManagerBundle(sampleConfig);

    expect(bundle.nodes["private-bookmark"]).toMatchObject({
      title: "Private Carrier Bookmark",
      url: "https://private.example.com/"
    });
    expect(storageGetMock).toHaveBeenCalledWith("onesync.privateBookmarks");
  });

  it("loads an encoded Safari private carrier bundle when native bookmarks are unavailable", async () => {
    (browserMock as { bookmarks?: unknown }).bookmarks = undefined;
    storageState["onesync.privateBookmarks"] = await encodeBundleLocally(privateCarrierBundle);

    const bundle = await loadPrivateManagerBundle(sampleConfig);

    expect(bundle.nodes["private-bookmark"]).toMatchObject({
      title: "Private Carrier Bookmark",
      url: "https://private.example.com/"
    });
    expect(storageGetMock).toHaveBeenCalledWith("onesync.privateBookmarks");
  });

  it("reads back native carrier updates after a local shared-bundle apply", async () => {
    await applySharedBundleLocally(updatedNativeBundle, "native");

    const bundle = await loadPrivateManagerBundle(sampleConfig);
    const importedBookmark = Object.values(bundle.nodes).find(
      (node) => node.type === "bookmark" && node.title === "Imported Bookmark"
    );

    expect(importedBookmark).toMatchObject({
      title: "Imported Bookmark",
      url: "https://imported.example.com/"
    });
    expect(bundle.nodes["native-bookmark-1"]).toBeUndefined();
  });

  it("reads back private carrier updates after a local shared-bundle apply", async () => {
    (browserMock as { bookmarks?: unknown }).bookmarks = undefined;

    await applySharedBundleLocally(privateCarrierBundle, "private");

    const bundle = await loadPrivateManagerBundle(sampleConfig);

    expect(bundle.nodes["private-bookmark"]).toMatchObject({
      title: "Private Carrier Bookmark",
      url: "https://private.example.com/"
    });
    expect(storageState["onesync.privateManagerBundle"]).toBeUndefined();
  });

  it("saves mutations back through the active carrier instead of a detached manager store", async () => {
    (browserMock as { bookmarks?: unknown }).bookmarks = undefined;

    const saved = await savePrivateManagerBundle(sampleConfig, privateCarrierBundle, "private");

    expect(saved.nodes["private-bookmark"]).toMatchObject({
      title: "Private Carrier Bookmark"
    });
    expect(storageState["onesync.privateBookmarks"]).toMatchObject({
      kind: "onesync.bundle",
      bundleVersion: 1,
      encoding: "base64url+gzip+json"
    });
    expect(storageState["onesync.privateManagerBundle"]).toBeUndefined();
  });

  it("still saves Safari private-carrier mutations when storage.local quota is exceeded but indexedDB is available", async () => {
    (browserMock as { bookmarks?: unknown }).bookmarks = undefined;
    const mockIndexedDb = installMockIndexedDb();

    storageSetMock.mockRejectedValueOnce(new Error("Invalid call to browser.storage.local.set(). Exceeded storage quota."));

    try {
      const saved = await savePrivateManagerBundle(sampleConfig, privateCarrierBundle, "private");

      expect(saved.nodes["private-bookmark"]).toMatchObject({
        title: "Private Carrier Bookmark"
      });
      expect(storageState["onesync.privateBookmarks"]).toBeUndefined();
      expect(mockIndexedDb.read("bundles", "onesync.privateBookmarks")).toMatchObject({
        kind: "onesync.bundle",
        bundleVersion: 1,
        encoding: "base64url+gzip+json"
      });
      await expect(loadPrivateManagerBundle(sampleConfig)).resolves.toMatchObject({
        nodes: expect.objectContaining({
          "private-bookmark": expect.objectContaining({
            title: "Private Carrier Bookmark"
          })
        })
      });
    } finally {
      mockIndexedDb.uninstall();
    }
  });

  it("preserves the saved shared bundle when native apply fails on Chrome or Firefox", async () => {
    removeMock.mockRejectedValueOnce(new Error("Native bookmarks write blocked"));

    await expect(savePrivateManagerBundle(sampleConfig, updatedNativeBundle, "native")).rejects.toThrow(/not updated/i);
    expect(storageState["onesync.privateBookmarksNativeFallback"]).toMatchObject({
      kind: "onesync.bundle",
      bundleVersion: 1,
      encoding: "base64url+gzip+json"
    });

    const bundle = await loadPrivateManagerBundle(sampleConfig);
    const importedBookmark = Object.values(bundle.nodes).find(
      (node) => node.type === "bookmark" && node.title === "Imported Bookmark"
    );

    expect(importedBookmark).toMatchObject({
      title: "Imported Bookmark",
      url: "https://imported.example.com/"
    });
    expect(bundle.deviceId).toBe(sampleConfig.deviceId);
    expect(bundle.revision).toMatch(/#device-1#snapshot$/);
  });

  it("serves the native fallback bundle to shared sync and export loaders after native apply fails", async () => {
    removeMock.mockRejectedValueOnce(new Error("Native bookmarks write blocked"));

    await expect(savePrivateManagerBundle(sampleConfig, updatedNativeBundle, "native")).rejects.toThrow(/not updated/i);

    const bundle = await loadSharedBookmarkBundle(sampleConfig);
    const importedBookmark = Object.values(bundle.nodes).find(
      (node) => node.type === "bookmark" && node.title === "Imported Bookmark"
    );

    expect(importedBookmark).toMatchObject({
      title: "Imported Bookmark",
      url: "https://imported.example.com/"
    });
    expect(bundle.nodes["native-bookmark-1"]).toBeUndefined();
    expect(bundle.deviceId).toBe(sampleConfig.deviceId);
    expect(bundle.revision).toMatch(/#device-1#snapshot$/);
  });

  it("stops preferring stale fallback data after a later successful native sync-style apply", async () => {
    removeMock.mockRejectedValueOnce(new Error("Native bookmarks write blocked"));

    await expect(savePrivateManagerBundle(sampleConfig, updatedNativeBundle, "native")).rejects.toThrow(/not updated/i);
    expect(storageState["onesync.privateBookmarksNativeFallback"]).toMatchObject({
      kind: "onesync.bundle",
      bundleVersion: 1,
      encoding: "base64url+gzip+json"
    });

    await applyBundleToBookmarks(syncedNativeBundle);

    const bundle = await loadPrivateManagerBundle(sampleConfig);
    const syncedBookmark = Object.values(bundle.nodes).find(
      (node) => node.type === "bookmark" && node.title === "Synced Bookmark"
    );

    expect(syncedBookmark).toMatchObject({
      title: "Synced Bookmark",
      url: "https://synced.example.com/"
    });
    expect(bundle.nodes["native-bookmark-1"]).toBeUndefined();
    expect(storageState["onesync.privateBookmarksNativeFallback"]).toBeNull();
  });

  it("accepts the private bookmark runtime messages", () => {
    const message: RuntimeMessage = { type: "onesync:get-private-bookmarks" };
    expect(message.type).toBe("onesync:get-private-bookmarks");
  });

  it("accepts private bookmark mutation messages", () => {
    const message: RuntimeMessage = {
      type: "onesync:mutate-private-bookmarks",
      payload: {
        operation: {
          type: "move-node",
          nodeId: "node-1",
          destinationFolderId: "folder-1"
        }
      }
    };

    expect(message.payload.operation.type).toBe("move-node");
  });
});
