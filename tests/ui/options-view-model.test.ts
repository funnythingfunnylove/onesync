import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncConfig } from "../../src/core/state/config";
import type { PrivateBookmarksViewState } from "../../src/core/private-bookmarks/view-state";

const { sendMessageMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn()
}));

vi.mock("wxt/browser", () => ({
  browser: {
    runtime: {
      sendMessage: sendMessageMock
    }
  }
}));

import {
  buildPrivateBookmarkManagerViewModel,
  loadPrivateBookmarksViewState,
  mutatePrivateBookmarks,
  requestOptionsConnectionCheck,
  requestOptionsSync,
  saveAndSyncOptionsConfig,
  validatePrivateBookmarkUrl
} from "../../src/ui/view-models/options";

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

const samplePrivateState: PrivateBookmarksViewState = {
  mode: "private",
  selectedFolderId: "root-toolbar",
  itemCount: 6,
  modeHint: "This is your primary local bookmark workspace.",
  folders: [
    { id: "root-toolbar", title: "Bookmarks Bar", depth: 0 },
    { id: "folder-a", title: "Folder A", depth: 1 },
    { id: "folder-b", title: "Folder B", depth: 1 }
  ],
  currentFolder: {
    id: "root-toolbar",
    type: "folder",
    title: "Bookmarks Bar",
    depth: 0,
    children: [
      {
        id: "folder-a",
        type: "folder",
        title: "Folder A",
        depth: 1,
        children: []
      },
      {
        id: "bookmark-1",
        type: "bookmark",
        title: "Docs",
        url: "https://example.com/docs",
        depth: 1,
        children: []
      }
    ]
  },
  tree: [
    {
      id: "root-toolbar",
      type: "folder",
      title: "Bookmarks Bar",
      depth: 0,
      children: [
        {
          id: "folder-a",
          type: "folder",
          title: "Folder A",
          depth: 1,
          children: [
            {
              id: "bookmark-2",
              type: "bookmark",
              title: "Nested docs",
              url: "https://example.com/nested",
              depth: 2,
              children: []
            }
          ]
        },
        {
          id: "folder-b",
          type: "folder",
          title: "Folder B",
          depth: 1,
          children: []
        },
        {
          id: "bookmark-1",
          type: "bookmark",
          title: "Docs",
          url: "https://example.com/docs",
          depth: 1,
          children: []
        }
      ]
    }
  ]
};

beforeEach(() => {
  vi.clearAllMocks();
  sendMessageMock.mockResolvedValue(undefined);
});

describe("options view-model", () => {
  it("can still request a sync directly", async () => {
    await requestOptionsSync();

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "onesync:sync-now"
    });
  });

  it("loads the private bookmark manager state from the background runtime", async () => {
    sendMessageMock.mockResolvedValue({
      itemCount: 3,
      selectedFolderId: "toolbar-root"
    });

    await expect(loadPrivateBookmarksViewState()).resolves.toMatchObject({
      itemCount: 3
    });

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "onesync:get-private-bookmarks"
    });
  });

  it("sends private bookmark mutations through the service worker", async () => {
    await mutatePrivateBookmarks({
      type: "delete-node",
      nodeId: "bookmark-1"
    });

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "onesync:mutate-private-bookmarks",
      payload: {
        operation: {
          type: "delete-node",
          nodeId: "bookmark-1"
        }
      }
    });
  });

  it("builds folder-scoped bookmark manager data without view tabs", () => {
    const viewModel = buildPrivateBookmarkManagerViewModel(samplePrivateState, {
      selectedNodeId: "bookmark-1"
    });

    expect("tabs" in viewModel).toBe(false);
    expect("activeTab" in viewModel).toBe(false);
    expect(viewModel.selectedFolder).toMatchObject({
      id: "root-toolbar",
      title: "Bookmarks Bar"
    });
    expect(viewModel.folderEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "root-toolbar", isSelected: true }),
        expect.objectContaining({ id: "folder-a", depth: 1 })
      ])
    );
    expect(viewModel.visibleNodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "folder-a", type: "folder", childCount: 1 }),
        expect.objectContaining({ id: "bookmark-1", type: "bookmark", isSelected: true, childCount: 0 })
      ])
    );
    expect(viewModel.actions.rename.disabled).toBe(false);
    expect(viewModel.actions.delete.disabled).toBe(false);
    expect(viewModel.actions.move.disabled).toBe(false);
    expect(viewModel.moveDestinations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "root-toolbar", isSelected: true }),
        expect.objectContaining({ id: "folder-b", isSelected: false })
      ])
    );
  });

  it("uses a selected folder node as the folder and action context even when the previous folder differs", () => {
    const viewModel = buildPrivateBookmarkManagerViewModel(samplePrivateState, {
      selectedFolderId: "root-toolbar",
      selectedNodeId: "folder-a"
    });

    expect(viewModel.selectedFolder).toMatchObject({
      id: "folder-a",
      title: "Folder A"
    });
    expect(viewModel.selectedNode).toMatchObject({
      id: "folder-a",
      type: "folder",
      childCount: 1
    });
    expect(viewModel.folderEntries).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "folder-a", isSelected: true })])
    );
    expect(viewModel.visibleNodes).toEqual([
      expect.objectContaining({
        id: "bookmark-2",
        type: "bookmark"
      })
    ]);
    expect(viewModel.moveDestinations).toEqual([
      expect.objectContaining({ id: "root-toolbar", isSelected: false }),
      expect.objectContaining({ id: "folder-b", isSelected: false })
    ]);
  });

  it("uses the selected bookmark parent folder as the action context instead of a stale folder selection", () => {
    const viewModel = buildPrivateBookmarkManagerViewModel(samplePrivateState, {
      selectedFolderId: "root-toolbar",
      selectedNodeId: "bookmark-2"
    });

    expect(viewModel.selectedFolder).toMatchObject({
      id: "folder-a",
      title: "Folder A"
    });
    expect(viewModel.selectedNode).toMatchObject({
      id: "bookmark-2",
      type: "bookmark",
      isSelected: true,
      childCount: 0
    });
    expect(viewModel.folderEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "folder-a", isSelected: true }),
        expect.objectContaining({ id: "root-toolbar", isSelected: false })
      ])
    );
    expect(viewModel.visibleNodes).toEqual([
      expect.objectContaining({
        id: "bookmark-2",
        type: "bookmark",
        isSelected: true
      })
    ]);
    expect(viewModel.moveDestinations).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "folder-a", isSelected: true })])
    );
    expect(viewModel.actions.createFolder.disabled).toBe(false);
    expect(viewModel.actions.createBookmark.disabled).toBe(false);
  });

  it("filters invalid move destinations so folders cannot target themselves or descendants", () => {
    const viewModel = buildPrivateBookmarkManagerViewModel(
      {
        ...samplePrivateState,
        folders: [
          { id: "root-toolbar", title: "Bookmarks Bar", depth: 0 },
          { id: "folder-a", title: "Folder A", depth: 1 },
          { id: "folder-c", title: "Folder C", depth: 2 },
          { id: "folder-b", title: "Folder B", depth: 1 }
        ],
        tree: [
          {
            id: "root-toolbar",
            type: "folder",
            title: "Bookmarks Bar",
            depth: 0,
            children: [
              {
                id: "folder-a",
                type: "folder",
                title: "Folder A",
                depth: 1,
                children: [
                  {
                    id: "folder-c",
                    type: "folder",
                    title: "Folder C",
                    depth: 2,
                    children: []
                  }
                ]
              },
              {
                id: "folder-b",
                type: "folder",
                title: "Folder B",
                depth: 1,
                children: []
              }
            ]
          }
        ]
      },
      {
        selectedNodeId: "folder-a"
      }
    );

    expect(viewModel.moveDestinations.map((folder) => folder.id)).toEqual(["root-toolbar", "folder-b"]);
    expect(viewModel.actions.move.disabled).toBe(false);
  });

  it("protects root folders for unavailable runtimes in folder-scoped mode", () => {
    const viewModel = buildPrivateBookmarkManagerViewModel(
      {
        ...samplePrivateState,
        mode: "unavailable",
        modeHint: "Bookmark access is unavailable in this browser runtime."
      },
      {
        selectedNodeId: "root-toolbar"
      }
    );

    expect("tabs" in viewModel).toBe(false);
    expect(viewModel.selectedFolder).toMatchObject({
      id: "root-toolbar",
      title: "Bookmarks Bar"
    });
    expect(viewModel.visibleNodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "folder-a", type: "folder", childCount: 1 }),
        expect.objectContaining({ id: "bookmark-1", type: "bookmark", childCount: 0 })
      ])
    );
    expect(viewModel.actions.createFolder.disabled).toBe(true);
    expect(viewModel.actions.createBookmark.disabled).toBe(true);
    expect(viewModel.actions.rename.disabled).toBe(true);
    expect(viewModel.actions.move.disabled).toBe(true);
    expect(viewModel.actions.delete.disabled).toBe(true);
  });

  it("surfaces browser-specific mode hints without changing manager counts", () => {
    const viewModel = buildPrivateBookmarkManagerViewModel(
      {
        ...samplePrivateState,
        mode: "native",
        modeHint: "Changes here update shared data and are applied back to browser bookmarks."
      },
      {
        selectedNodeId: "bookmark-1"
      }
    );

    expect(viewModel.mode).toBe("native");
    expect(viewModel.modeHint).toMatch(/applied back to browser bookmarks/i);
    expect(viewModel.itemCount).toBe(samplePrivateState.itemCount);
  });

  it("saves the current config before requesting sync", async () => {
    await saveAndSyncOptionsConfig(sampleConfig);

    expect(sendMessageMock).toHaveBeenNthCalledWith(1, {
      type: "onesync:save-config",
      payload: sampleConfig
    });
    expect(sendMessageMock).toHaveBeenNthCalledWith(2, {
      type: "onesync:sync-now"
    });
  });

  it("saves the config and routes private HTTP sync through the service worker", async () => {
    const localConfig: SyncConfig = {
      ...sampleConfig,
      webdavUrl: "http://dav.example.test:5005",
      username: "admin",
      allowInsecureHttp: true
    };

    await saveAndSyncOptionsConfig(localConfig);

    expect(sendMessageMock).toHaveBeenNthCalledWith(1, {
      type: "onesync:save-config",
      payload: localConfig
    });
    expect(sendMessageMock).toHaveBeenNthCalledWith(2, {
      type: "onesync:sync-now"
    });
  });

  it("rejects invalid sync settings before sending runtime messages", async () => {
    await expect(
      saveAndSyncOptionsConfig({
        ...sampleConfig,
        webdavUrl: "   "
      })
    ).rejects.toThrow(/webdav url/i);

    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("sends the current config for a WebDAV connection check", async () => {
    sendMessageMock.mockResolvedValue({
      status: "ready",
      message: "WebDAV endpoint reachable. Credentials and base path look usable."
    });

    await expect(requestOptionsConnectionCheck(sampleConfig)).resolves.toEqual({
      status: "ready",
      message: "WebDAV endpoint reachable. Credentials and base path look usable."
    });

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "onesync:test-webdav-connection",
      payload: sampleConfig
    });
  });

  it("routes private HTTP connection checks through the service worker", async () => {
    sendMessageMock.mockResolvedValue({
      status: "ready",
      message: "WebDAV endpoint reachable. Credentials and base path look usable."
    });

    const localConfig: SyncConfig = {
      ...sampleConfig,
      webdavUrl: "http://dav.example.test:5005",
      username: "admin",
      allowInsecureHttp: true
    };

    await expect(requestOptionsConnectionCheck(localConfig)).resolves.toEqual({
      status: "ready",
      message: "WebDAV endpoint reachable. Credentials and base path look usable."
    });

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "onesync:test-webdav-connection",
      payload: localConfig
    });
  });

  it("treats Chrome's closed async response channel as a started sync when options state shows a running sync", async () => {
    sendMessageMock
      .mockRejectedValueOnce(
        new Error(
          "A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received"
        )
      )
      .mockResolvedValueOnce({
        statusLabel: "Syncing bookmarks",
        lastSyncLabel: "Never synced",
        canSync: true,
        isRunning: true,
        errorLabel: null,
        progressLabel: "Backed up 4 of 10 bookmark items",
        progressPercent: 40
      });

    await expect(requestOptionsSync()).resolves.toBeUndefined();

    expect(sendMessageMock).toHaveBeenNthCalledWith(1, {
      type: "onesync:sync-now"
    });
    expect(sendMessageMock).toHaveBeenNthCalledWith(2, {
      type: "onesync:get-popup-state"
    });
  });

  it("still rejects unexpected sync trigger failures", async () => {
    sendMessageMock.mockRejectedValueOnce(new Error("sync dispatch failed"));

    await expect(requestOptionsSync()).rejects.toThrow(/sync dispatch failed/i);
  });

  it("validates bookmark urls locally before the UI commits them", () => {
    expect(validatePrivateBookmarkUrl("https://example.com/docs")).toEqual({
      ok: true,
      value: "https://example.com/docs"
    });
    expect(validatePrivateBookmarkUrl("javascript:alert(1)")).toEqual({
      ok: false,
      message: "Bookmark URL must start with http:// or https://."
    });
    expect(validatePrivateBookmarkUrl("not a url")).toEqual({
      ok: false,
      message: "Bookmark URL must be a complete URL."
    });
  });
});
