import { beforeEach, describe, expect, it, vi } from "vitest";

const { browserMock, getTreeMock, createMock, removeMock, removeTreeMock } = vi.hoisted(() => {
  const getTreeMock = vi.fn();
  const createMock = vi.fn();
  const removeMock = vi.fn();
  const removeTreeMock = vi.fn();

  return {
    getTreeMock,
    createMock,
    removeMock,
    removeTreeMock,
    browserMock: {
      bookmarks: {
        getTree: getTreeMock,
        create: createMock,
        remove: removeMock,
        removeTree: removeTreeMock
      },
      storage: {
        local: {
          async get() {
            return {};
          },
          async set() {
            return;
          }
        }
      }
    }
  };
});

vi.mock("webextension-polyfill", () => ({ default: browserMock }));

import { applyBundleToBookmarks, listLocalBookmarks } from "../../src/core/browser/bookmarks";

beforeEach(() => {
  vi.useRealTimers();
  getTreeMock.mockReset();
  createMock.mockReset();
  removeMock.mockReset();
  removeTreeMock.mockReset();

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
