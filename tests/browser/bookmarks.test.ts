import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  browserMock,
  getTreeMock,
  createMock,
  removeMock,
  removeTreeMock,
  storageGetMock,
  storageSetMock
} = vi.hoisted(() => {
  const getTreeMock = vi.fn();
  const createMock = vi.fn();
  const removeMock = vi.fn();
  const removeTreeMock = vi.fn();
  const storageGetMock = vi.fn();
  const storageSetMock = vi.fn();

  return {
    getTreeMock,
    createMock,
    removeMock,
    removeTreeMock,
    storageGetMock,
    storageSetMock,
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

vi.mock("wxt/browser", () => ({ browser: browserMock }));

import {
  applySharedBundleLocally,
  applyBundleToBookmarks,
  getBookmarkStorageMode,
  listLocalBookmarks
} from "../../src/core/browser/bookmarks";

beforeEach(() => {
  vi.useRealTimers();
  browserMock.bookmarks = {
    getTree: getTreeMock,
    create: createMock,
    remove: removeMock,
    removeTree: removeTreeMock
  };
  getTreeMock.mockReset();
  createMock.mockReset();
  removeMock.mockReset();
  removeTreeMock.mockReset();
  storageGetMock.mockReset();
  storageSetMock.mockReset();
  browserMock.storage = {
    local: {
      get: storageGetMock,
      set: storageSetMock
    }
  };

  getTreeMock.mockResolvedValue([
    {
      id: "root",
      title: "",
      children: [
        {
          id: "toolbar-root",
          title: "Bookmarks Bar",
          children: [
            {
              id: "bookmark-1",
              title: "Example",
              url: "https://example.com/"
            }
          ]
        },
        {
          id: "menu-root",
          title: "Other Bookmarks",
          children: []
        },
        {
          id: "mobile-root",
          title: "Mobile Bookmarks",
          children: []
        }
      ]
    }
  ]);
  storageGetMock.mockResolvedValue({});
  storageSetMock.mockResolvedValue(undefined);

  let createdIndex = 0;
  createMock.mockImplementation(async (payload: { parentId?: string; title?: string; url?: string }) => {
    createdIndex += 1;
    return {
      id: `created-${createdIndex}`,
      ...payload
    };
  });
});

describe("bookmark adapter", () => {
  it("reports native bookmark mode when the runtime exposes the bookmarks api", () => {
    expect(getBookmarkStorageMode()).toBe("native");
  });

  it("reports private bookmark mode when the runtime falls back to extension storage", () => {
    (browserMock as { bookmarks?: unknown }).bookmarks = undefined;

    expect(getBookmarkStorageMode()).toBe("private");
  });

  it("returns a canonical bundle with semantic roots and bookmark nodes", async () => {
    const progressUpdates: Array<{ processed: number; total: number }> = [];

    const bundle = await listLocalBookmarks({
      deviceId: "device-1",
      webdavUrl: "",
      username: "",
      password: "",
      basePath: "/onesync",
      intervalMinutes: 15,
      scheduledSyncEnabled: false,
      allowInsecureHttp: false
    }, {
      onProgress(progress) {
        progressUpdates.push(progress);
      }
    });

    expect(bundle.roots.toolbar).toBe("toolbar-root");
    expect(bundle.roots.menu).toBe("menu-root");
    expect(bundle.roots.mobile).toBe("mobile-root");
    expect(bundle.roots.unfiled).toBe("menu-root");
    expect(bundle.nodes["bookmark-1"]).toMatchObject({
      id: "bookmark-1",
      type: "bookmark",
      title: "Example",
      url: "https://example.com/"
    });
    expect(progressUpdates.at(-1)).toEqual({
      processed: 1,
      total: 1
    });
  });

  it("materializes a synthetic unfiled root when the browser does not expose one", async () => {
    getTreeMock.mockResolvedValueOnce([
      {
        id: "root",
        title: "",
        children: [
          {
            id: "toolbar-root",
            title: "Bookmarks Bar",
            children: []
          },
          {
            id: "menu-root",
            title: "Bookmarks Menu",
            children: []
          }
        ]
      }
    ]);

    const bundle = await listLocalBookmarks({
      deviceId: "device-1",
      webdavUrl: "",
      username: "",
      password: "",
      basePath: "/onesync",
      intervalMinutes: 15,
      scheduledSyncEnabled: false,
      allowInsecureHttp: false
    });

    expect(bundle.roots.unfiled).toBe("onesync.synthetic.unfiled");
    expect(bundle.nodes["onesync.synthetic.unfiled"]).toMatchObject({
      id: "onesync.synthetic.unfiled",
      type: "folder",
      title: "Unfiled Bookmarks",
      children: []
    });
  });

  it("maps Safari-style favorites and bookmarks menu roots even when order differs", async () => {
    getTreeMock.mockResolvedValueOnce([
      {
        id: "root",
        title: "",
        children: [
          {
            id: "menu-root",
            title: "Bookmarks Menu",
            children: []
          },
          {
            id: "favorites-root",
            title: "Favorites",
            children: []
          }
        ]
      }
    ]);

    const bundle = await listLocalBookmarks({
      deviceId: "device-1",
      webdavUrl: "",
      username: "",
      password: "",
      basePath: "/onesync",
      intervalMinutes: 15,
      scheduledSyncEnabled: false,
      allowInsecureHttp: false
    });

    expect(bundle.roots.toolbar).toBe("favorites-root");
    expect(bundle.roots.menu).toBe("menu-root");
    expect(bundle.roots.mobile).toBe("onesync.synthetic.mobile");
    expect(bundle.roots.unfiled).toBe("onesync.synthetic.unfiled");
  });

  it("adds context when reading local bookmark roots fails", async () => {
    getTreeMock.mockRejectedValueOnce(new Error("Node cannot be found in the current page."));

    await expect(
      listLocalBookmarks({
        deviceId: "device-1",
        webdavUrl: "",
        username: "",
        password: "",
        basePath: "/onesync",
        intervalMinutes: 15,
        scheduledSyncEnabled: false,
        allowInsecureHttp: false
      })
    ).rejects.toThrow(/failed to enumerate local bookmark roots/i);
  });

  it("reads the private bookmark bundle from extension storage when the runtime does not expose bookmarks", async () => {
    storageGetMock.mockResolvedValueOnce({
      "onesync.privateBookmarks": {
        kind: "onesync.bookmarks",
        schemaVersion: 1,
        revision: "2026-07-01T00:00:00.000Z#remote-device#private",
        deviceId: "remote-device",
        generatedAt: "2026-07-01T00:00:00.000Z",
        roots: {
          toolbar: "private-toolbar",
          menu: "private-menu",
          mobile: "private-mobile",
          unfiled: "private-unfiled"
        },
        nodes: {
          "private-toolbar": {
            id: "private-toolbar",
            type: "folder",
            title: "Bookmarks Bar",
            children: ["private-bookmark"],
            addedAt: "2026-07-01T00:00:00.000Z",
            updatedAt: "2026-07-01T00:00:00.000Z"
          },
          "private-menu": {
            id: "private-menu",
            type: "folder",
            title: "Bookmarks Menu",
            children: [],
            addedAt: "2026-07-01T00:00:00.000Z",
            updatedAt: "2026-07-01T00:00:00.000Z"
          },
          "private-mobile": {
            id: "private-mobile",
            type: "folder",
            title: "Mobile Bookmarks",
            children: [],
            addedAt: "2026-07-01T00:00:00.000Z",
            updatedAt: "2026-07-01T00:00:00.000Z"
          },
          "private-unfiled": {
            id: "private-unfiled",
            type: "folder",
            title: "Unfiled Bookmarks",
            children: [],
            addedAt: "2026-07-01T00:00:00.000Z",
            updatedAt: "2026-07-01T00:00:00.000Z"
          },
          "private-bookmark": {
            id: "private-bookmark",
            type: "bookmark",
            title: "Private Bookmark",
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
      }
    });
    (browserMock as { bookmarks?: unknown }).bookmarks = undefined;

    const bundle = await listLocalBookmarks({
      deviceId: "device-1",
      webdavUrl: "",
      username: "",
      password: "",
      basePath: "/onesync",
      intervalMinutes: 15,
      scheduledSyncEnabled: false,
      allowInsecureHttp: false
    });

    expect(bundle.nodes["private-bookmark"]).toMatchObject({
      id: "private-bookmark",
      title: "Private Bookmark",
      url: "https://private.example.com/"
    });
    expect(bundle.deviceId).toBe("device-1");
    expect(bundle.revision).toMatch(/#device-1#snapshot$/);
    expect(storageGetMock).toHaveBeenCalledWith("onesync.privateBookmarks");
  });

  it("writes the private bookmark bundle to extension storage when the runtime does not expose bookmarks", async () => {
    (browserMock as { bookmarks?: unknown }).bookmarks = undefined;

    await expect(
      applyBundleToBookmarks({
        kind: "onesync.bookmarks",
        schemaVersion: 1,
        revision: "2026-07-01T00:00:00.000Z#device-1#private",
        deviceId: "device-1",
        generatedAt: "2026-07-01T00:00:00.000Z",
        roots: {
          toolbar: "private-toolbar",
          menu: "private-menu",
          mobile: "private-mobile",
          unfiled: "private-unfiled"
        },
        nodes: {
          "private-toolbar": {
            id: "private-toolbar",
            type: "folder",
            title: "Bookmarks Bar",
            children: ["private-bookmark"],
            addedAt: "2026-07-01T00:00:00.000Z",
            updatedAt: "2026-07-01T00:00:00.000Z"
          },
          "private-menu": {
            id: "private-menu",
            type: "folder",
            title: "Bookmarks Menu",
            children: [],
            addedAt: "2026-07-01T00:00:00.000Z",
            updatedAt: "2026-07-01T00:00:00.000Z"
          },
          "private-mobile": {
            id: "private-mobile",
            type: "folder",
            title: "Mobile Bookmarks",
            children: [],
            addedAt: "2026-07-01T00:00:00.000Z",
            updatedAt: "2026-07-01T00:00:00.000Z"
          },
          "private-unfiled": {
            id: "private-unfiled",
            type: "folder",
            title: "Unfiled Bookmarks",
            children: [],
            addedAt: "2026-07-01T00:00:00.000Z",
            updatedAt: "2026-07-01T00:00:00.000Z"
          },
          "private-bookmark": {
            id: "private-bookmark",
            type: "bookmark",
            title: "Private Bookmark",
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
      })
    ).resolves.toBeUndefined();

    expect(storageSetMock).toHaveBeenCalledWith({
      "onesync.privateBookmarks": expect.objectContaining({
        roots: {
          toolbar: "private-toolbar",
          menu: "private-menu",
          mobile: "private-mobile",
          unfiled: "private-unfiled"
        }
      })
    });
    expect(createMock).not.toHaveBeenCalled();
    expect(removeMock).not.toHaveBeenCalled();
    expect(removeTreeMock).not.toHaveBeenCalled();
  });

  it("re-applies shared bundles through the existing private bookmark fallback", async () => {
    (browserMock as { bookmarks?: unknown }).bookmarks = undefined;

    await expect(
      applySharedBundleLocally(
        {
          kind: "onesync.bookmarks",
          schemaVersion: 1,
          revision: "2026-07-01T00:00:00.000Z#device-1#private",
          deviceId: "device-1",
          generatedAt: "2026-07-01T00:00:00.000Z",
          roots: {
            toolbar: "private-toolbar",
            menu: "private-menu",
            mobile: "private-mobile",
            unfiled: "private-unfiled"
          },
          nodes: {
            "private-toolbar": {
              id: "private-toolbar",
              type: "folder",
              title: "Bookmarks Bar",
              children: ["private-bookmark"],
              addedAt: "2026-07-01T00:00:00.000Z",
              updatedAt: "2026-07-01T00:00:00.000Z"
            },
            "private-menu": {
              id: "private-menu",
              type: "folder",
              title: "Bookmarks Menu",
              children: [],
              addedAt: "2026-07-01T00:00:00.000Z",
              updatedAt: "2026-07-01T00:00:00.000Z"
            },
            "private-mobile": {
              id: "private-mobile",
              type: "folder",
              title: "Mobile Bookmarks",
              children: [],
              addedAt: "2026-07-01T00:00:00.000Z",
              updatedAt: "2026-07-01T00:00:00.000Z"
            },
            "private-unfiled": {
              id: "private-unfiled",
              type: "folder",
              title: "Unfiled Bookmarks",
              children: [],
              addedAt: "2026-07-01T00:00:00.000Z",
              updatedAt: "2026-07-01T00:00:00.000Z"
            },
            "private-bookmark": {
              id: "private-bookmark",
              type: "bookmark",
              title: "Private Bookmark",
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
        },
        "private"
      )
    ).resolves.toBeUndefined();

    expect(storageSetMock).toHaveBeenCalledWith({
      "onesync.privateBookmarks": expect.objectContaining({
        roots: {
          toolbar: "private-toolbar",
          menu: "private-menu",
          mobile: "private-mobile",
          unfiled: "private-unfiled"
        }
      })
    });
  });

  it("preserves the saved shared bundle when native apply fails on Chrome or Firefox", async () => {
    removeMock.mockRejectedValueOnce(new Error("Native bookmarks write blocked"));

    await expect(
      applySharedBundleLocally(
        {
          kind: "onesync.bookmarks",
          schemaVersion: 1,
          revision: "2026-07-01T00:00:00.000Z#device-1#private",
          deviceId: "device-1",
          generatedAt: "2026-07-01T00:00:00.000Z",
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
              children: ["bookmark-2"],
              addedAt: "2026-07-01T00:00:00.000Z",
              updatedAt: "2026-07-01T00:00:00.000Z"
            },
            "menu-root": {
              id: "menu-root",
              type: "folder",
              title: "Bookmarks Menu",
              children: [],
              addedAt: "2026-07-01T00:00:00.000Z",
              updatedAt: "2026-07-01T00:00:00.000Z"
            },
            "mobile-root": {
              id: "mobile-root",
              type: "folder",
              title: "Mobile Bookmarks",
              children: [],
              addedAt: "2026-07-01T00:00:00.000Z",
              updatedAt: "2026-07-01T00:00:00.000Z"
            },
            "bookmark-2": {
              id: "bookmark-2",
              type: "bookmark",
              title: "Recovered Bookmark",
              url: "https://recovered.example.com/",
              addedAt: "2026-07-01T00:00:00.000Z",
              updatedAt: "2026-07-01T00:00:00.000Z"
            }
          },
          tombstones: [],
          meta: {
            client: "onesync",
            clientVersion: "0.1.3"
          }
        },
        "native"
      )
    ).rejects.toThrow(/not updated/i);

    expect(storageSetMock).toHaveBeenCalledWith({
      "onesync.privateBookmarksNativeFallback": expect.objectContaining({
        roots: {
          toolbar: "toolbar-root",
          menu: "menu-root",
          mobile: "mobile-root",
          unfiled: "menu-root"
        }
      })
    });
  });

  it("clears native fallback state after a later successful native applyBundleToBookmarks run", async () => {
    removeMock.mockRejectedValueOnce(new Error("Native bookmarks write blocked"));

    await expect(
      applySharedBundleLocally(
        {
          kind: "onesync.bookmarks",
          schemaVersion: 1,
          revision: "2026-07-01T00:00:00.000Z#device-1#private",
          deviceId: "device-1",
          generatedAt: "2026-07-01T00:00:00.000Z",
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
              children: ["bookmark-2"],
              addedAt: "2026-07-01T00:00:00.000Z",
              updatedAt: "2026-07-01T00:00:00.000Z"
            },
            "menu-root": {
              id: "menu-root",
              type: "folder",
              title: "Bookmarks Menu",
              children: [],
              addedAt: "2026-07-01T00:00:00.000Z",
              updatedAt: "2026-07-01T00:00:00.000Z"
            },
            "mobile-root": {
              id: "mobile-root",
              type: "folder",
              title: "Mobile Bookmarks",
              children: [],
              addedAt: "2026-07-01T00:00:00.000Z",
              updatedAt: "2026-07-01T00:00:00.000Z"
            },
            "bookmark-2": {
              id: "bookmark-2",
              type: "bookmark",
              title: "Recovered Bookmark",
              url: "https://recovered.example.com/",
              addedAt: "2026-07-01T00:00:00.000Z",
              updatedAt: "2026-07-01T00:00:00.000Z"
            }
          },
          tombstones: [],
          meta: {
            client: "onesync",
            clientVersion: "0.1.3"
          }
        },
        "native"
      )
    ).rejects.toThrow(/not updated/i);

    storageSetMock.mockClear();

    await applyBundleToBookmarks({
      kind: "onesync.bookmarks",
      schemaVersion: 1,
      revision: "2026-07-01T02:00:00.000Z#device-1#remote",
      deviceId: "device-1",
      generatedAt: "2026-07-01T02:00:00.000Z",
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
          children: ["bookmark-3"],
          addedAt: "2026-07-01T02:00:00.000Z",
          updatedAt: "2026-07-01T02:00:00.000Z"
        },
        "menu-root": {
          id: "menu-root",
          type: "folder",
          title: "Bookmarks Menu",
          children: [],
          addedAt: "2026-07-01T02:00:00.000Z",
          updatedAt: "2026-07-01T02:00:00.000Z"
        },
        "mobile-root": {
          id: "mobile-root",
          type: "folder",
          title: "Mobile Bookmarks",
          children: [],
          addedAt: "2026-07-01T02:00:00.000Z",
          updatedAt: "2026-07-01T02:00:00.000Z"
        },
        "bookmark-3": {
          id: "bookmark-3",
          type: "bookmark",
          title: "Applied After Sync",
          url: "https://applied-after-sync.example.com/",
          addedAt: "2026-07-01T02:00:00.000Z",
          updatedAt: "2026-07-01T02:00:00.000Z"
        }
      },
      tombstones: [],
      meta: {
        client: "onesync",
        clientVersion: "0.1.3"
      }
    });

    expect(storageSetMock).toHaveBeenCalledWith({
      "onesync.privateBookmarksNativeFallback": null
    });
  });

  it("creates an empty private bookmark bundle when storage has no Safari fallback data yet", async () => {
    storageGetMock.mockResolvedValueOnce({});
    (browserMock as { bookmarks?: unknown }).bookmarks = undefined;

    const bundle = await listLocalBookmarks({
      deviceId: "device-1",
      webdavUrl: "",
      username: "",
      password: "",
      basePath: "/onesync",
      intervalMinutes: 15,
      scheduledSyncEnabled: false,
      allowInsecureHttp: false
    });

    expect(bundle.roots.toolbar).toBe("onesync.synthetic.toolbar");
    expect(bundle.roots.menu).toBe("onesync.synthetic.menu");
    expect(bundle.roots.mobile).toBe("onesync.synthetic.mobile");
    expect(bundle.roots.unfiled).toBe("onesync.synthetic.unfiled");
    expect(bundle.nodes["onesync.synthetic.toolbar"]).toMatchObject({
      title: "Bookmarks Bar",
      children: []
    });
    expect(storageSetMock).toHaveBeenCalledWith({
      "onesync.privateBookmarks": expect.objectContaining({
        roots: {
          toolbar: "onesync.synthetic.toolbar",
          menu: "onesync.synthetic.menu",
          mobile: "onesync.synthetic.mobile",
          unfiled: "onesync.synthetic.unfiled"
        }
      })
    });
  });

  it("still fails clearly when neither bookmarks nor storage are available", async () => {
    (browserMock as { bookmarks?: unknown }).bookmarks = undefined;
    browserMock.storage = undefined as unknown as typeof browserMock.storage;

    await expect(
      listLocalBookmarks({
        deviceId: "device-1",
        webdavUrl: "",
        username: "",
        password: "",
        basePath: "/onesync",
        intervalMinutes: 15,
        scheduledSyncEnabled: false,
        allowInsecureHttp: false
      })
    ).rejects.toThrow(/bookmarks api is unavailable/i);
  });

  it("clears existing native children and recreates bundle children under the matching browser roots", async () => {
    getTreeMock.mockResolvedValueOnce([
      {
        id: "root",
        title: "",
        children: [
          {
            id: "toolbar-root",
            title: "Bookmarks Bar",
            children: [
              { id: "old-bookmark", title: "Old Bookmark", url: "https://old.example.com/" },
              { id: "old-folder", title: "Old Folder", children: [] }
            ]
          },
          {
            id: "menu-root",
            title: "Bookmarks Menu",
            children: []
          }
        ]
      }
    ]);

    const progressUpdates: Array<{ processed: number; total: number }> = [];

    await applyBundleToBookmarks({
      kind: "onesync.bookmarks",
      schemaVersion: 1,
      revision: "2026-06-30T12:00:00.000Z#device-1#1",
      deviceId: "device-1",
      generatedAt: "2026-06-30T12:00:00.000Z",
      roots: {
        toolbar: "toolbar-root",
        menu: "menu-root",
        mobile: "onesync.synthetic.mobile",
        unfiled: "onesync.synthetic.unfiled"
      },
      nodes: {
        "toolbar-root": {
          id: "toolbar-root",
          type: "folder",
          title: "Bookmarks Bar",
          children: ["folder-a", "bookmark-a"],
          addedAt: "2026-06-30T11:59:00.000Z",
          updatedAt: "2026-06-30T11:59:00.000Z"
        },
        "menu-root": {
          id: "menu-root",
          type: "folder",
          title: "Bookmarks Menu",
          children: [],
          addedAt: "2026-06-30T11:59:00.000Z",
          updatedAt: "2026-06-30T11:59:00.000Z"
        },
        "onesync.synthetic.mobile": {
          id: "onesync.synthetic.mobile",
          type: "folder",
          title: "Mobile Bookmarks",
          children: [],
          addedAt: "2026-06-30T11:59:00.000Z",
          updatedAt: "2026-06-30T11:59:00.000Z"
        },
        "onesync.synthetic.unfiled": {
          id: "onesync.synthetic.unfiled",
          type: "folder",
          title: "Unfiled Bookmarks",
          children: ["bookmark-b"],
          addedAt: "2026-06-30T11:59:00.000Z",
          updatedAt: "2026-06-30T11:59:00.000Z"
        },
        "folder-a": {
          id: "folder-a",
          type: "folder",
          title: "Imported Folder",
          children: ["bookmark-c"],
          addedAt: "2026-06-30T11:59:00.000Z",
          updatedAt: "2026-06-30T11:59:00.000Z"
        },
        "bookmark-a": {
          id: "bookmark-a",
          type: "bookmark",
          title: "Toolbar Bookmark",
          url: "https://toolbar.example.com/",
          addedAt: "2026-06-30T11:59:00.000Z",
          updatedAt: "2026-06-30T11:59:00.000Z"
        },
        "bookmark-b": {
          id: "bookmark-b",
          type: "bookmark",
          title: "Unfiled Bookmark",
          url: "https://unfiled.example.com/",
          addedAt: "2026-06-30T11:59:00.000Z",
          updatedAt: "2026-06-30T11:59:00.000Z"
        },
        "bookmark-c": {
          id: "bookmark-c",
          type: "bookmark",
          title: "Nested Bookmark",
          url: "https://nested.example.com/",
          addedAt: "2026-06-30T11:59:00.000Z",
          updatedAt: "2026-06-30T11:59:00.000Z"
        }
      },
      tombstones: [],
      meta: {
        client: "onesync",
        clientVersion: "0.1.0"
      }
    }, {
      onProgress(progress) {
        progressUpdates.push(progress);
      }
    });

    expect(removeMock).toHaveBeenCalledWith("old-bookmark");
    expect(removeTreeMock).toHaveBeenCalledWith("old-folder");
    expect(createMock).toHaveBeenCalledWith({
      parentId: "toolbar-root",
      title: "Imported Folder"
    });
    expect(createMock).toHaveBeenCalledWith({
      parentId: "toolbar-root",
      title: "Toolbar Bookmark",
      url: "https://toolbar.example.com/"
    });
    expect(createMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Unfiled Bookmark"
      })
    );
    expect(progressUpdates.at(-1)).toEqual({
      processed: 3,
      total: 3
    });
  });

  it("does not clear the same native root twice when menu and unfiled map to the same browser node", async () => {
    getTreeMock.mockResolvedValueOnce([
      {
        id: "root",
        title: "",
        children: [
          {
            id: "toolbar-root",
            title: "Bookmarks Bar",
            children: []
          },
          {
            id: "other-root",
            title: "Other Bookmarks",
            children: [{ id: "old-bookmark", title: "Old Bookmark", url: "https://old.example.com/" }]
          },
          {
            id: "mobile-root",
            title: "Mobile Bookmarks",
            children: []
          }
        ]
      }
    ]);

    let removedOldBookmark = false;
    removeMock.mockImplementationOnce(async (id: string) => {
      expect(id).toBe("old-bookmark");
      removedOldBookmark = true;
    });
    removeMock.mockImplementation(async () => {
      throw new Error("Node cannot be found in the current page.");
    });

    await expect(
      applyBundleToBookmarks({
        kind: "onesync.bookmarks",
        schemaVersion: 1,
        revision: "2026-06-30T12:00:00.000Z#device-1#1",
        deviceId: "device-1",
        generatedAt: "2026-06-30T12:00:00.000Z",
        roots: {
          toolbar: "toolbar-root",
          menu: "onesync.synthetic.menu",
          mobile: "mobile-root",
          unfiled: "other-root"
        },
        nodes: {
          "toolbar-root": {
            id: "toolbar-root",
            type: "folder",
            title: "Bookmarks Bar",
            children: [],
            addedAt: "2026-06-30T11:59:00.000Z",
            updatedAt: "2026-06-30T11:59:00.000Z"
          },
          "onesync.synthetic.menu": {
            id: "onesync.synthetic.menu",
            type: "folder",
            title: "Bookmarks Menu",
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
          "other-root": {
            id: "other-root",
            type: "folder",
            title: "Other Bookmarks",
            children: [],
            addedAt: "2026-06-30T11:59:00.000Z",
            updatedAt: "2026-06-30T11:59:00.000Z"
          }
        },
        tombstones: [],
        meta: {
          client: "onesync",
          clientVersion: "0.1.0"
        }
      })
    ).resolves.toBeUndefined();

    expect(removedOldBookmark).toBe(true);
    expect(removeMock).toHaveBeenCalledTimes(1);
  });

  it("treats already-missing native bookmark nodes as removed during cleanup", async () => {
    getTreeMock.mockResolvedValueOnce([
      {
        id: "root",
        title: "",
        children: [
          {
            id: "toolbar-root",
            title: "Bookmarks Bar",
            children: [
              { id: "old-bookmark", title: "Old Bookmark", url: "https://old.example.com/" },
              { id: "old-folder", title: "Old Folder", children: [] }
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
    ]);

    removeMock.mockRejectedValueOnce(new Error("Node cannot be found in the current page."));
    removeTreeMock.mockRejectedValueOnce(new Error("Node cannot be found in the current page."));

    await expect(
      applyBundleToBookmarks({
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
            children: ["bookmark-a"],
            addedAt: "2026-06-30T11:59:00.000Z",
            updatedAt: "2026-06-30T11:59:00.000Z"
          },
          "menu-root": {
            id: "menu-root",
            type: "folder",
            title: "Bookmarks Menu",
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
          "bookmark-a": {
            id: "bookmark-a",
            type: "bookmark",
            title: "Toolbar Bookmark",
            url: "https://toolbar.example.com/",
            addedAt: "2026-06-30T11:59:00.000Z",
            updatedAt: "2026-06-30T11:59:00.000Z"
          }
        },
        tombstones: [],
        meta: {
          client: "onesync",
          clientVersion: "0.1.0"
        }
      })
    ).resolves.toBeUndefined();

    expect(createMock).toHaveBeenCalledWith({
      parentId: "toolbar-root",
      title: "Toolbar Bookmark",
      url: "https://toolbar.example.com/"
    });
  });

  it("adds context when creating a replacement bookmark fails", async () => {
    createMock.mockRejectedValueOnce(new Error("Node cannot be found in the current page."));

    await expect(
      applyBundleToBookmarks({
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
            children: ["bookmark-a"],
            addedAt: "2026-06-30T11:59:00.000Z",
            updatedAt: "2026-06-30T11:59:00.000Z"
          },
          "menu-root": {
            id: "menu-root",
            type: "folder",
            title: "Bookmarks Menu",
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
          "bookmark-a": {
            id: "bookmark-a",
            type: "bookmark",
            title: "Toolbar Bookmark",
            url: "https://toolbar.example.com/",
            addedAt: "2026-06-30T11:59:00.000Z",
            updatedAt: "2026-06-30T11:59:00.000Z"
          }
        },
        tombstones: [],
        meta: {
          client: "onesync",
          clientVersion: "0.1.0"
        }
      })
    ).rejects.toThrow(/failed to create bookmark under native root toolbar-root/i);
  });

  it("adds context when resolving browser roots before apply fails", async () => {
    getTreeMock.mockRejectedValueOnce(new Error("Node cannot be found in the current page."));

    await expect(
      applyBundleToBookmarks({
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
            children: [],
            addedAt: "2026-06-30T11:59:00.000Z",
            updatedAt: "2026-06-30T11:59:00.000Z"
          },
          "menu-root": {
            id: "menu-root",
            type: "folder",
            title: "Bookmarks Menu",
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
          }
        },
        tombstones: [],
        meta: {
          client: "onesync",
          clientVersion: "0.1.0"
        }
      })
    ).rejects.toThrow(/failed to enumerate local bookmark roots before apply/i);
  });
});
