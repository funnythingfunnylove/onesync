import { describe, expect, it } from "vitest";

import type { BookmarkBundle } from "../../src/core/format/schema";
import { buildPrivateBookmarksViewState } from "../../src/core/private-bookmarks/view-state";

function createBundle(): BookmarkBundle {
  return {
    kind: "onesync.bookmarks",
    schemaVersion: 1,
    revision: "2026-07-01T11:59:00.000Z#device-1#private",
    deviceId: "device-1",
    generatedAt: "2026-07-01T11:59:00.000Z",
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
        addedAt: "2026-07-01T11:59:00.000Z",
        updatedAt: "2026-07-01T11:59:00.000Z"
      },
      "root-menu": {
        id: "root-menu",
        type: "folder",
        title: "Bookmarks Menu",
        children: [],
        addedAt: "2026-07-01T11:59:00.000Z",
        updatedAt: "2026-07-01T11:59:00.000Z"
      },
      "root-mobile": {
        id: "root-mobile",
        type: "folder",
        title: "Mobile Bookmarks",
        children: [],
        addedAt: "2026-07-01T11:59:00.000Z",
        updatedAt: "2026-07-01T11:59:00.000Z"
      },
      "root-unfiled": {
        id: "root-unfiled",
        type: "folder",
        title: "Unfiled Bookmarks",
        children: [],
        addedAt: "2026-07-01T11:59:00.000Z",
        updatedAt: "2026-07-01T11:59:00.000Z"
      },
      "folder-a": {
        id: "folder-a",
        type: "folder",
        title: "Folder A",
        children: ["bookmark-2"],
        addedAt: "2026-07-01T11:59:00.000Z",
        updatedAt: "2026-07-01T11:59:00.000Z"
      },
      "bookmark-1": {
        id: "bookmark-1",
        type: "bookmark",
        title: "Example",
        url: "https://example.com/",
        addedAt: "2026-07-01T11:59:00.000Z",
        updatedAt: "2026-07-01T11:59:00.000Z"
      },
      "bookmark-2": {
        id: "bookmark-2",
        type: "bookmark",
        title: "Docs",
        url: "https://example.com/docs",
        addedAt: "2026-07-01T11:59:00.000Z",
        updatedAt: "2026-07-01T11:59:00.000Z"
      }
    },
    tombstones: [],
    meta: {
      client: "onesync",
      clientVersion: "0.1.3"
    }
  };
}

describe("private bookmark view-state", () => {
  it("builds a folder-pane view with the selected folder contents", () => {
    const bundle = createBundle();
    const state = buildPrivateBookmarksViewState(bundle, "private", bundle.roots.toolbar);

    expect(state.mode).toBe("private");
    expect(state.selectedFolderId).toBe(bundle.roots.toolbar);
    expect(state.itemCount).toBe(3);
    expect(state.modeHint).toBe("This is your primary local bookmark workspace.");
    expect(state.currentFolder?.children.length).toBeGreaterThan(0);
    expect(state.currentFolder?.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "folder-a",
          type: "folder",
          children: []
        }),
        expect.objectContaining({
          id: "bookmark-1",
          type: "bookmark",
          children: []
        })
      ])
    );
    expect(JSON.stringify(state.currentFolder)).not.toContain("bookmark-2");
    expect(state.folders[0]).toMatchObject({
      id: bundle.roots.toolbar,
      depth: 0,
      title: "Bookmarks Bar"
    });
  });

  it("builds a complete tree view for the bundle roots", () => {
    const bundle = createBundle();
    const state = buildPrivateBookmarksViewState(bundle, "native");

    expect(state.mode).toBe("native");
    expect(state.selectedFolderId).toBe(bundle.roots.toolbar);
    expect(state.tree.length).toBe(4);
    expect(state.modeHint).toBe(
      "Changes here update shared data and are applied back to browser bookmarks."
    );
    expect(state.tree[0]).toMatchObject({
      id: bundle.roots.toolbar,
      children: expect.arrayContaining([
        expect.objectContaining({ id: "folder-a", type: "folder" }),
        expect.objectContaining({ id: "bookmark-1", type: "bookmark" })
      ])
    });
  });

  it("reports an explicit hint when bookmark access is unavailable", () => {
    const bundle = createBundle();
    const state = buildPrivateBookmarksViewState(bundle, "unavailable");

    expect(state.mode).toBe("unavailable");
    expect(state.modeHint).toBe("Bookmark access is unavailable in this browser runtime.");
  });

  it("reports browser-sensitive mode hints for private and native carriers", () => {
    const bundle = createBundle();

    expect(buildPrivateBookmarksViewState(bundle, "private").modeHint).toMatch(/primary local bookmark workspace/i);
    expect(buildPrivateBookmarksViewState(bundle, "native").modeHint).toMatch(/applied back to browser bookmarks/i);
  });
});
