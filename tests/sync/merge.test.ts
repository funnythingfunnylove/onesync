import { describe, expect, it } from "vitest";
import type { BookmarkBundle, BookmarkNode } from "../../src/core/format/schema";
import { mergeBundles } from "../../src/core/sync/merge";

function createBundle(overrides?: Partial<BookmarkBundle>): BookmarkBundle {
  return {
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
    },
    ...overrides
  };
}

function requireFolder(node: BookmarkNode): Extract<BookmarkNode, { type: "folder" }> {
  if (node.type !== "folder") {
    throw new Error("Expected a folder node");
  }

  return node;
}

function requireBookmark(node: BookmarkNode): Extract<BookmarkNode, { type: "bookmark" }> {
  if (node.type !== "bookmark") {
    throw new Error("Expected a bookmark node");
  }

  return node;
}

describe("mergeBundles", () => {
  it("prefers the newer updatedAt when both sides changed the same bookmark", () => {
    const base = createBundle();
    const local = createBundle({
      nodes: {
        ...base.nodes,
        "bookmark-1": {
          ...base.nodes["bookmark-1"],
          title: "Local Title",
          updatedAt: "2026-06-30T12:01:00.000Z"
        }
      }
    });

    const remote = createBundle({
      nodes: {
        ...base.nodes,
        "bookmark-1": {
          ...base.nodes["bookmark-1"],
          title: "Remote Title",
          updatedAt: "2026-06-30T12:02:00.000Z"
        }
      }
    });

    const merged = mergeBundles(base, local, remote);

    expect(merged.nodes["bookmark-1"]).toMatchObject({
      title: "Remote Title",
      updatedAt: "2026-06-30T12:02:00.000Z"
    });
  });

  it("preserves bookmark tag changes as part of the newer bookmark node", () => {
    const base = createBundle();
    const baseBookmark = requireBookmark(base.nodes["bookmark-1"]);
    const local = createBundle({
      nodes: {
        ...base.nodes,
        "bookmark-1": {
          ...baseBookmark,
          tags: ["work", "learning queue"],
          updatedAt: "2026-06-30T12:03:00.000Z"
        }
      }
    });
    const remote = createBundle({
      nodes: {
        ...base.nodes,
        "bookmark-1": {
          ...baseBookmark,
          title: "Example",
          updatedAt: "2026-06-30T12:01:00.000Z"
        }
      }
    });

    const merged = mergeBundles(base, local, remote);

    expect(merged.nodes["bookmark-1"]).toMatchObject({
      title: "Example",
      tags: [
        { text: "work", color: "#e8f1eb" },
        { text: "learning queue", color: expect.stringMatching(/^#[0-9a-f]{6}$/u) }
      ],
      updatedAt: "2026-06-30T12:03:00.000Z"
    });
  });

  it("propagates a local deletion when the remote side did not change the bookmark", () => {
    const base = createBundle();
    const toolbarRoot = requireFolder(base.nodes["toolbar-root"]);
    const local = createBundle({
      generatedAt: "2026-06-30T12:03:00.000Z",
      nodes: {
        "toolbar-root": {
          ...toolbarRoot,
          children: [],
          updatedAt: "2026-06-30T12:03:00.000Z"
        },
        "menu-root": base.nodes["menu-root"],
        "mobile-root": base.nodes["mobile-root"]
      }
    });
    const remote = createBundle();

    const merged = mergeBundles(base, local, remote);

    expect(merged.nodes["bookmark-1"]).toBeUndefined();
    expect(merged.nodes["toolbar-root"]).toMatchObject({
      children: []
    });
    expect(merged.tombstones).toEqual([
      {
        id: "bookmark-1",
        deletedAt: "2026-06-30T12:03:00.000Z"
      }
    ]);
  });

  it("keeps the remote bookmark when it was updated after the local deletion", () => {
    const base = createBundle();
    const toolbarRoot = requireFolder(base.nodes["toolbar-root"]);
    const local = createBundle({
      generatedAt: "2026-06-30T12:03:00.000Z",
      nodes: {
        "toolbar-root": {
          ...toolbarRoot,
          children: [],
          updatedAt: "2026-06-30T12:03:00.000Z"
        },
        "menu-root": base.nodes["menu-root"],
        "mobile-root": base.nodes["mobile-root"]
      }
    });
    const remote = createBundle({
      nodes: {
        ...base.nodes,
        "bookmark-1": {
          ...base.nodes["bookmark-1"],
          title: "Remote Updated",
          updatedAt: "2026-06-30T12:04:00.000Z"
        }
      }
    });

    const merged = mergeBundles(base, local, remote);

    expect(merged.nodes["bookmark-1"]).toMatchObject({
      title: "Remote Updated",
      updatedAt: "2026-06-30T12:04:00.000Z"
    });
  });

  it("keeps a moved node only in the destination folder after merging against an unchanged remote bundle", () => {
    const base = createBundle();
    const local = createBundle({
      generatedAt: "2026-06-30T12:03:00.000Z",
      nodes: {
        ...base.nodes,
        "toolbar-root": {
          ...requireFolder(base.nodes["toolbar-root"]),
          children: [],
          updatedAt: "2026-06-30T12:03:00.000Z"
        },
        "menu-root": {
          ...requireFolder(base.nodes["menu-root"]),
          children: ["bookmark-1"],
          updatedAt: "2026-06-30T12:03:00.000Z"
        },
        "bookmark-1": {
          ...base.nodes["bookmark-1"],
          updatedAt: "2026-06-30T12:03:00.000Z"
        }
      }
    });
    const remote = createBundle();

    const merged = mergeBundles(base, local, remote);
    const toolbarRoot = requireFolder(merged.nodes["toolbar-root"]);
    const menuRoot = requireFolder(merged.nodes["menu-root"]);

    expect(toolbarRoot.children).toEqual([]);
    expect(menuRoot.children).toEqual(["bookmark-1"]);
    expect(merged.nodes["bookmark-1"]).toMatchObject({
      title: "Example",
      updatedAt: "2026-06-30T12:03:00.000Z"
    });
  });

  it("preserves concurrent additions in the same folder while keeping a moved node out of its old folder", () => {
    const base = createBundle();

    const local = createBundle({
      generatedAt: "2026-06-30T12:03:00.000Z",
      nodes: {
        ...base.nodes,
        "toolbar-root": {
          ...requireFolder(base.nodes["toolbar-root"]),
          children: [],
          updatedAt: "2026-06-30T12:03:00.000Z"
        },
        "menu-root": {
          ...requireFolder(base.nodes["menu-root"]),
          children: ["bookmark-1", "bookmark-3"],
          updatedAt: "2026-06-30T12:03:00.000Z"
        },
        "bookmark-1": {
          ...base.nodes["bookmark-1"],
          updatedAt: "2026-06-30T12:03:00.000Z"
        },
        "bookmark-3": {
          id: "bookmark-3",
          type: "bookmark",
          title: "Local Add",
          url: "https://example.com/local-add",
          addedAt: "2026-06-30T12:03:00.000Z",
          updatedAt: "2026-06-30T12:03:00.000Z"
        }
      }
    });

    const remote = createBundle({
      generatedAt: "2026-06-30T12:04:00.000Z",
      nodes: {
        ...base.nodes,
        "toolbar-root": {
          ...requireFolder(base.nodes["toolbar-root"]),
          children: ["bookmark-1"],
          updatedAt: "2026-06-30T12:04:00.000Z"
        },
        "menu-root": {
          ...requireFolder(base.nodes["menu-root"]),
          children: ["bookmark-4"],
          updatedAt: "2026-06-30T12:04:00.000Z"
        },
        "bookmark-1": {
          ...base.nodes["bookmark-1"],
          updatedAt: "2026-06-30T12:04:00.000Z"
        },
        "bookmark-4": {
          id: "bookmark-4",
          type: "bookmark",
          title: "Remote Add",
          url: "https://example.com/remote-add",
          addedAt: "2026-06-30T12:04:00.000Z",
          updatedAt: "2026-06-30T12:04:00.000Z"
        }
      }
    });

    const merged = mergeBundles(base, local, remote);
    const toolbarRoot = requireFolder(merged.nodes["toolbar-root"]);
    const menuRoot = requireFolder(merged.nodes["menu-root"]);

    expect(toolbarRoot.children).toEqual([]);
    expect(menuRoot.children).toEqual(["bookmark-1", "bookmark-3", "bookmark-4"]);
  });

  it("folds the same bookmark URL from different devices into one bookmark during merge", () => {
    const base = createBundle({
      nodes: {
        ...createBundle().nodes,
        "toolbar-root": {
          ...requireFolder(createBundle().nodes["toolbar-root"]),
          children: []
        }
      }
    });
    const local = createBundle({
      generatedAt: "2026-06-30T12:03:00.000Z",
      nodes: {
        ...base.nodes,
        "toolbar-root": {
          ...requireFolder(base.nodes["toolbar-root"]),
          children: ["local-bookmark"],
          updatedAt: "2026-06-30T12:03:00.000Z"
        },
        "local-bookmark": {
          id: "local-bookmark",
          type: "bookmark",
          title: "Shared Docs",
          url: "https://example.com/docs",
          addedAt: "2026-06-30T12:03:00.000Z",
          updatedAt: "2026-06-30T12:03:00.000Z"
        }
      }
    });
    const remote = createBundle({
      generatedAt: "2026-06-30T12:04:00.000Z",
      nodes: {
        ...base.nodes,
        "toolbar-root": {
          ...requireFolder(base.nodes["toolbar-root"]),
          children: ["remote-bookmark"],
          updatedAt: "2026-06-30T12:04:00.000Z"
        },
        "remote-bookmark": {
          id: "remote-bookmark",
          type: "bookmark",
          title: "Shared Docs",
          url: "https://example.com/docs",
          tags: ["work"],
          addedAt: "2026-06-30T12:04:00.000Z",
          updatedAt: "2026-06-30T12:04:00.000Z"
        }
      }
    });

    const merged = mergeBundles(base, local, remote);
    const toolbarRoot = requireFolder(merged.nodes["toolbar-root"]);

    expect(toolbarRoot.children).toEqual(["local-bookmark"]);
    expect(merged.nodes["local-bookmark"]).toMatchObject({
      title: "Shared Docs",
      url: "https://example.com/docs"
    });
    expect(merged.nodes["remote-bookmark"]).toBeUndefined();
    expect(merged.tombstones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "remote-bookmark",
          deletedAt: "2026-06-30T12:04:00.000Z"
        })
      ])
    );
  });
});
