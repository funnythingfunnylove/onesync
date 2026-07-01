import type { BookmarkBundle, BookmarkNode } from "../format/schema";
import { countBookmarkItems } from "../format/schema";
import type { BookmarkStorageMode } from "../browser/bookmarks";

const ROOT_ORDER = ["toolbar", "menu", "mobile", "unfiled"] as const;

export type PrivateBookmarkViewNode = {
  id: string;
  type: BookmarkNode["type"];
  title: string;
  url?: string;
  depth: number;
  children: PrivateBookmarkViewNode[];
};

export type PrivateBookmarkFolderEntry = {
  id: string;
  title: string;
  depth: number;
};

export type PrivateBookmarksViewState = {
  mode: BookmarkStorageMode;
  selectedFolderId: string;
  itemCount: number;
  modeHint: string;
  folders: PrivateBookmarkFolderEntry[];
  tree: PrivateBookmarkViewNode[];
  currentFolder: PrivateBookmarkViewNode | null;
};

function getRootNodeIds(bundle: BookmarkBundle): string[] {
  return ROOT_ORDER.map((role) => bundle.roots[role]).filter((nodeId): nodeId is string => Boolean(nodeId));
}

function getFolderNode(bundle: BookmarkBundle, nodeId: string): Extract<BookmarkNode, { type: "folder" }> | null {
  const node = bundle.nodes[nodeId];

  if (!node || node.type !== "folder") {
    return null;
  }

  return node;
}

function projectNode(bundle: BookmarkBundle, nodeId: string, depth: number, visited: Set<string>): PrivateBookmarkViewNode | null {
  if (visited.has(nodeId)) {
    return null;
  }

  const node = bundle.nodes[nodeId];

  if (!node) {
    return null;
  }

  visited.add(nodeId);

  if (node.type === "bookmark") {
    return {
      id: node.id,
      type: node.type,
      title: node.title,
      url: node.url,
      depth,
      children: []
    };
  }

  const children: PrivateBookmarkViewNode[] = [];

  for (const childId of node.children) {
    const child = projectNode(bundle, childId, depth + 1, visited);

    if (child) {
      children.push(child);
    }
  }

  return {
    id: node.id,
    type: node.type,
    title: node.title,
    depth,
    children
  };
}

function projectFolderChild(
  bundle: BookmarkBundle,
  nodeId: string,
  depth: number,
  visited: Set<string>
): PrivateBookmarkViewNode | null {
  if (visited.has(nodeId)) {
    return null;
  }

  const node = bundle.nodes[nodeId];

  if (!node) {
    return null;
  }

  visited.add(nodeId);

  if (node.type === "bookmark") {
    return {
      id: node.id,
      type: node.type,
      title: node.title,
      url: node.url,
      depth,
      children: []
    };
  }

  return {
    id: node.id,
    type: node.type,
    title: node.title,
    depth,
    children: []
  };
}

function collectFolderEntries(
  bundle: BookmarkBundle,
  nodeId: string,
  depth: number,
  visited: Set<string>,
  entries: PrivateBookmarkFolderEntry[]
): void {
  if (visited.has(nodeId)) {
    return;
  }

  const node = bundle.nodes[nodeId];

  if (!node || node.type !== "folder") {
    return;
  }

  visited.add(nodeId);
  entries.push({
    id: node.id,
    title: node.title,
    depth
  });

  for (const childId of node.children) {
    collectFolderEntries(bundle, childId, depth + 1, visited, entries);
  }
}

function buildFolderList(bundle: BookmarkBundle): PrivateBookmarkFolderEntry[] {
  const entries: PrivateBookmarkFolderEntry[] = [];
  const visited = new Set<string>();

  for (const rootId of getRootNodeIds(bundle)) {
    collectFolderEntries(bundle, rootId, 0, visited, entries);
  }

  return entries;
}

function buildTree(bundle: BookmarkBundle): PrivateBookmarkViewNode[] {
  const visited = new Set<string>();
  const tree: PrivateBookmarkViewNode[] = [];

  for (const rootId of getRootNodeIds(bundle)) {
    const rootNode = projectNode(bundle, rootId, 0, visited);

    if (rootNode) {
      tree.push(rootNode);
    }
  }

  return tree;
}

function resolveSelectedFolderId(bundle: BookmarkBundle, selectedFolderId?: string): string {
  const toolbarRoot = bundle.roots.toolbar;
  const fallbackRoot = getFolderNode(bundle, toolbarRoot) ? toolbarRoot : getRootNodeIds(bundle)[0];

  if (!selectedFolderId) {
    return fallbackRoot ?? toolbarRoot;
  }

  const selectedNode = getFolderNode(bundle, selectedFolderId);

  if (selectedNode) {
    return selectedNode.id;
  }

  return fallbackRoot ?? selectedFolderId;
}

function buildCurrentFolder(bundle: BookmarkBundle, selectedFolderId: string): PrivateBookmarkViewNode | null {
  const folder = getFolderNode(bundle, selectedFolderId);

  if (!folder) {
    return null;
  }

  const children: PrivateBookmarkViewNode[] = [];
  const visited = new Set<string>([folder.id]);

  for (const childId of folder.children) {
    const child = projectFolderChild(bundle, childId, 1, visited);

    if (child) {
      children.push(child);
    }
  }

  return {
    id: folder.id,
    type: folder.type,
    title: folder.title,
    depth: 0,
    children
  };
}

export function buildPrivateBookmarksViewState(
  bundle: BookmarkBundle,
  mode: BookmarkStorageMode,
  selectedFolderId?: string
): PrivateBookmarksViewState {
  const resolvedSelectedFolderId = resolveSelectedFolderId(bundle, selectedFolderId);

  return {
    mode,
    selectedFolderId: resolvedSelectedFolderId,
    itemCount: countBookmarkItems(bundle),
    modeHint:
      mode === "private"
        ? "This is your primary local bookmark workspace."
        : mode === "native"
          ? "Changes here update shared data and are applied back to browser bookmarks."
          : "Bookmark access is unavailable in this browser runtime.",
    folders: buildFolderList(bundle),
    tree: buildTree(bundle),
    currentFolder: buildCurrentFolder(bundle, resolvedSelectedFolderId)
  };
}
