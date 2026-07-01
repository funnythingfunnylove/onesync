import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BookmarkBundle } from "../../src/core/format/schema";
import { assertMovableNode, applyPrivateBookmarkOperation } from "../../src/core/private-bookmarks/mutators";

const baseTime = new Date("2026-07-01T12:00:00.000Z");

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
        children: ["folder-a", "folder-b"],
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
        children: ["folder-c", "bookmark-1"],
        addedAt: "2026-07-01T11:59:00.000Z",
        updatedAt: "2026-07-01T11:59:00.000Z"
      },
      "folder-b": {
        id: "folder-b",
        type: "folder",
        title: "Folder B",
        children: [],
        addedAt: "2026-07-01T11:59:00.000Z",
        updatedAt: "2026-07-01T11:59:00.000Z"
      },
      "folder-c": {
        id: "folder-c",
        type: "folder",
        title: "Folder C",
        children: [],
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
      }
    },
    tombstones: [],
    meta: {
      client: "onesync",
      clientVersion: "0.1.3"
    }
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(baseTime);
});

describe("private bookmark mutators", () => {
  it("creates a folder under the selected parent", () => {
    const bundle = createBundle();

    const next = applyPrivateBookmarkOperation(
      bundle,
      {
        type: "create-folder",
        parentId: bundle.roots.toolbar,
        title: "Work"
      },
      "device-1"
    );

    expect(Object.values(next.nodes).some((node) => node.type === "folder" && node.title === "Work")).toBe(true);
    expect(next.nodes[bundle.roots.toolbar]).toMatchObject({
      children: expect.arrayContaining([expect.any(String)]),
      updatedAt: "2026-07-01T12:00:00.000Z"
    });
  });

  it("creates a bookmark under the selected parent", () => {
    const bundle = createBundle();

    const next = applyPrivateBookmarkOperation(
      bundle,
      {
        type: "create-bookmark",
        parentId: "folder-b",
        title: "Docs",
        url: "https://example.com/docs"
      },
      "device-1"
    );

    expect(Object.values(next.nodes).some((node) => node.type === "bookmark" && node.title === "Docs")).toBe(true);
    expect(next.nodes["folder-b"]).toMatchObject({
      children: expect.arrayContaining([expect.any(String)]),
      updatedAt: "2026-07-01T12:00:00.000Z"
    });
  });

  it("renames a node in place", () => {
    const bundle = createBundle();

    const next = applyPrivateBookmarkOperation(
      bundle,
      {
        type: "rename-node",
        nodeId: "bookmark-1",
        title: "Docs"
      },
      "device-1"
    );

    expect(next.nodes["bookmark-1"]).toMatchObject({
      title: "Docs",
      updatedAt: "2026-07-01T12:00:00.000Z"
    });
  });

  it("deletes a node subtree and records tombstones", () => {
    const bundle = createBundle();

    const next = applyPrivateBookmarkOperation(
      bundle,
      {
        type: "delete-node",
        nodeId: "folder-a"
      },
      "device-1"
    );

    expect(next.nodes["folder-a"]).toBeUndefined();
    expect(next.nodes["folder-c"]).toBeUndefined();
    expect(next.nodes["bookmark-1"]).toBeUndefined();
    expect(next.nodes["root-toolbar"]).toMatchObject({
      children: ["folder-b"],
      updatedAt: "2026-07-01T12:00:00.000Z"
    });
    expect(next.tombstones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "folder-a", deletedAt: "2026-07-01T12:00:00.000Z" }),
        expect.objectContaining({ id: "folder-c", deletedAt: "2026-07-01T12:00:00.000Z" }),
        expect.objectContaining({ id: "bookmark-1", deletedAt: "2026-07-01T12:00:00.000Z" })
      ])
    );
  });

  it("moves a node to another folder", () => {
    const bundle = createBundle();

    const next = applyPrivateBookmarkOperation(
      bundle,
      {
        type: "move-node",
        nodeId: "bookmark-1",
        destinationFolderId: "folder-b"
      },
      "device-1"
    );

    expect(next.nodes["folder-a"]).toMatchObject({
      children: ["folder-c"],
      updatedAt: "2026-07-01T12:00:00.000Z"
    });
    expect(next.nodes["folder-b"]).toMatchObject({
      children: ["bookmark-1"],
      updatedAt: "2026-07-01T12:00:00.000Z"
    });
  });

  it("rejects moving a folder into its own descendant", () => {
    const bundle = createBundle();

    expect(() =>
      applyPrivateBookmarkOperation(
        bundle,
        {
          type: "move-node",
          nodeId: "folder-a",
          destinationFolderId: "folder-c"
        },
        "device-1"
      )
    ).toThrow(/descendant/i);
  });

  it("rejects moving a root node", () => {
    const bundle = createBundle();

    expect(() => assertMovableNode(bundle, bundle.roots.toolbar, "folder-b")).toThrow(/root/i);
  });
});
