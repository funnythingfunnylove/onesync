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
  buildPrivateBookmarkEditDraft,
  dedupePrivateBookmarksAndSync,
  filterPrivateBookmarkManagerNodes,
  getPrivateBookmarkTagOptions,
  getPrivateBookmarkLinkHref,
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
        tags: ["work"],
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
                tags: ["design"],
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
          tags: ["work"],
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

  it("builds flat bookmark manager data without view tabs", () => {
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
        expect.objectContaining({
          id: "bookmark-2",
          type: "bookmark",
          parentFolderId: "folder-a",
          parentFolderTitle: "Folder A",
          tags: [{ text: "design", color: "#eee9f3" }],
          childCount: 0
        }),
        expect.objectContaining({
          id: "bookmark-1",
          type: "bookmark",
          parentFolderId: "root-toolbar",
          parentFolderTitle: "Bookmarks Bar",
          tags: [{ text: "work", color: "#e8f1eb" }],
          isSelected: true,
          childCount: 0
        })
      ])
    );
    expect(viewModel.visibleNodes.every((node) => node.type === "bookmark")).toBe(true);
    expect(viewModel.actions.rename.disabled).toBe(false);
    expect(viewModel.actions.delete.disabled).toBe(false);
    expect("createFolder" in viewModel.actions).toBe(false);
    expect("move" in viewModel.actions).toBe(false);
    expect("moveDestinations" in viewModel).toBe(false);
  });

  it("builds a flat all-bookmarks list instead of folder-scoped rows", () => {
    const viewModel = buildPrivateBookmarkManagerViewModel(samplePrivateState, {
      selectedNodeId: "bookmark-2"
    });

    expect(viewModel.selectedFolder).toMatchObject({
      id: "folder-a",
      title: "Folder A"
    });
    expect(viewModel.visibleNodes).toEqual([
      expect.objectContaining({
        id: "bookmark-2",
        type: "bookmark",
        title: "Nested docs",
        parentFolderId: "folder-a",
        parentFolderTitle: "Folder A",
        isSelected: true
      }),
      expect.objectContaining({
        id: "bookmark-1",
        type: "bookmark",
        title: "Docs",
        parentFolderId: "root-toolbar",
        parentFolderTitle: "Bookmarks Bar",
        isSelected: false
      })
    ]);
    expect(viewModel.visibleNodes.every((node) => node.type === "bookmark")).toBe(true);
    expect(viewModel.actions.dedupe.disabled).toBe(false);
  });

  it("filters flat bookmark manager nodes by query without folder text", () => {
    const viewModel = buildPrivateBookmarkManagerViewModel(
      {
        ...samplePrivateState,
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
                title: "Hidden folder text",
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
                id: "bookmark-internal",
                type: "bookmark",
                title: "DNS tools",
                url: "chrome://net-internals/#dns",
                depth: 1,
                children: []
              }
            ]
          }
        ]
      },
      {}
    );

    expect(
      filterPrivateBookmarkManagerNodes(viewModel.visibleNodes, {
        query: "hidden",
        tagId: "all"
      })
    ).toEqual([]);
  });

  it("filters flat bookmark manager nodes by tag", () => {
    const viewModel = buildPrivateBookmarkManagerViewModel(samplePrivateState, {});

    expect(
      filterPrivateBookmarkManagerNodes(viewModel.visibleNodes, {
        query: "",
        tagId: "work"
      }).map((node) => node.id)
    ).toEqual(["bookmark-1"]);
    expect(
      filterPrivateBookmarkManagerNodes(viewModel.visibleNodes, {
        query: "",
        tagId: "design"
      }).map((node) => node.id)
    ).toEqual(["bookmark-2"]);
    const customTaggedViewModel = buildPrivateBookmarkManagerViewModel(
      {
        ...samplePrivateState,
        tree: [
          {
            ...samplePrivateState.tree[0],
            children: [
              {
                id: "bookmark-custom",
                type: "bookmark",
                title: "Custom tag docs",
                url: "https://example.com/custom",
                tags: ["learning queue"],
                depth: 1,
                children: []
              }
            ]
          }
        ]
      },
      {}
    );
    expect(
      filterPrivateBookmarkManagerNodes(customTaggedViewModel.visibleNodes, {
        query: "",
        tagId: "learning queue"
      }).map((node) => node.id)
    ).toEqual(["bookmark-custom"]);
    expect(
      filterPrivateBookmarkManagerNodes(viewModel.visibleNodes, {
        query: "docs",
        tagId: "untagged"
      })
    ).toEqual([]);
  });

  it("exposes used preset and custom tag filters with palette colors", () => {
    const viewModel = buildPrivateBookmarkManagerViewModel(
      {
        ...samplePrivateState,
        tree: [
          {
            ...samplePrivateState.tree[0],
            children: [
              ...samplePrivateState.tree[0].children,
              {
                id: "bookmark-custom",
                type: "bookmark",
                title: "Custom tag docs",
                url: "https://example.com/custom",
                tags: ["learning queue"],
                depth: 1,
                children: []
              }
            ]
          }
        ]
      },
      {}
    );

    expect(viewModel.tagOptions).toEqual([
      expect.objectContaining({ id: "all", label: "All tags" }),
      expect.objectContaining({ id: "work", label: "Work", colorClass: "tag-color-work" }),
      expect.objectContaining({ id: "design", label: "Design", colorClass: "tag-color-design" }),
      expect.objectContaining({ id: "learning queue", label: "learning queue", colorClass: expect.stringMatching(/^tag-color-custom-/) })
    ]);
    expect(getPrivateBookmarkTagOptions(["work", "Learning Queue"])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "work", colorClass: "tag-color-work" }),
        expect.objectContaining({ id: "learning queue", label: "learning queue" })
      ])
    );
  });

  it("deduplicates private bookmarks and then requests sync", async () => {
    sendMessageMock
      .mockResolvedValueOnce(samplePrivateState)
      .mockResolvedValueOnce(undefined);

    await expect(dedupePrivateBookmarksAndSync()).resolves.toBe(samplePrivateState);

    expect(sendMessageMock).toHaveBeenNthCalledWith(1, {
      type: "onesync:mutate-private-bookmarks",
      payload: {
        operation: {
          type: "dedupe-bookmarks"
        }
      }
    });
    expect(sendMessageMock).toHaveBeenNthCalledWith(2, {
      type: "onesync:sync-now"
    });
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
    expect(viewModel.visibleNodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "bookmark-2",
          type: "bookmark",
          isSelected: true
        }),
        expect.objectContaining({
          id: "bookmark-1",
          type: "bookmark",
          isSelected: false
        })
      ])
    );
    expect("createFolder" in viewModel.actions).toBe(false);
    expect(viewModel.actions.createBookmark.disabled).toBe(false);
  });

  it("disables bookmark mutations for unavailable runtimes in flat mode", () => {
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
        expect.objectContaining({ id: "bookmark-2", type: "bookmark", childCount: 0 }),
        expect.objectContaining({ id: "bookmark-1", type: "bookmark", childCount: 0 })
      ])
    );
    expect("createFolder" in viewModel.actions).toBe(false);
    expect(viewModel.actions.createBookmark.disabled).toBe(true);
    expect(viewModel.actions.rename.disabled).toBe(true);
    expect("move" in viewModel.actions).toBe(false);
    expect(viewModel.actions.delete.disabled).toBe(true);
    expect(viewModel.actions.dedupe.disabled).toBe(true);
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
    expect(validatePrivateBookmarkUrl("chrome://net-internals/#dns")).toEqual({
      ok: true,
      value: "chrome://net-internals/#dns"
    });
    expect(validatePrivateBookmarkUrl("javascript:alert(1)")).toEqual({
      ok: false,
      message: "Bookmark URL uses an unsupported scheme."
    });
    expect(validatePrivateBookmarkUrl("not a url")).toEqual({
      ok: false,
      message: "Bookmark URL must be a complete URL."
    });
  });

  it("uses the same URL scheme policy for direct bookmark links as create and edit validation", () => {
    expect(getPrivateBookmarkLinkHref("https://example.com/docs")).toBe("https://example.com/docs");
    expect(getPrivateBookmarkLinkHref("http://example.com/docs")).toBe("http://example.com/docs");
    expect(getPrivateBookmarkLinkHref("chrome://net-internals/#dns")).toBe("chrome://net-internals/#dns");
    expect(getPrivateBookmarkLinkHref("javascript:alert(1)")).toBeNull();
    expect(getPrivateBookmarkLinkHref("data:text/html,hello")).toBeNull();
    expect(getPrivateBookmarkLinkHref("not a url")).toBeNull();
  });

  it("builds inline edit drafts from active form values before refresh rerenders", () => {
    const formData = new FormData();
    formData.set("title", "Unsaved title");
    formData.set("url", "https://draft.example.com/");
    formData.set("tags", "work");
    formData.append("tags", "design");
    formData.set("customTag", "Learning Queue");
    formData.set("customTagColor", "#f1e7e7");

    expect(buildPrivateBookmarkEditDraft("bookmark", formData)).toEqual({
      title: "Unsaved title",
      url: "https://draft.example.com/",
      tags: [
        { text: "work", color: "#e8f1eb" },
        { text: "design", color: "#eee9f3" },
        { text: "learning queue", color: "#f1e7e7" }
      ]
    });
    expect(buildPrivateBookmarkEditDraft("folder", formData)).toEqual({
      title: "Unsaved title"
    });
  });

  it("keeps existing custom tag colors when an edited bookmark is saved", () => {
    const formData = new FormData();
    formData.set("title", "Colorful draft");
    formData.set("url", "https://draft.example.com/");
    formData.set("tags", "learning queue");
    formData.set("tagColor:learning queue", "#f1e7e7");

    expect(buildPrivateBookmarkEditDraft("bookmark", formData)).toEqual({
      title: "Colorful draft",
      url: "https://draft.example.com/",
      tags: [{ text: "learning queue", color: "#f1e7e7" }]
    });
  });
});
