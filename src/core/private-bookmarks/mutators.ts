import { normalizeBundle, type BookmarkBundle, type BookmarkNode } from "../format/schema";
import type { PrivateBookmarkOperation } from "../shared/types";

type BookmarkTombstone = BookmarkBundle["tombstones"][number];

function cloneNode(node: BookmarkNode): BookmarkNode {
  if (node.type === "folder") {
    return {
      ...node,
      children: [...node.children]
    };
  }

  return { ...node };
}

function cloneBundle(bundle: BookmarkBundle): BookmarkBundle {
  return {
    ...bundle,
    roots: { ...bundle.roots },
    nodes: Object.fromEntries(Object.entries(bundle.nodes).map(([nodeId, node]) => [nodeId, cloneNode(node)])),
    tombstones: bundle.tombstones.map((tombstone) => ({ ...tombstone })),
    meta: { ...bundle.meta }
  };
}

function stampBundle(bundle: BookmarkBundle, deviceId: string, generatedAt: string): BookmarkBundle {
  return {
    ...bundle,
    deviceId,
    generatedAt,
    revision: `${generatedAt}#${deviceId}#private`
  };
}

function getNode(bundle: BookmarkBundle, nodeId: string): BookmarkNode {
  const node = bundle.nodes[nodeId];

  if (!node) {
    throw new Error(`Unknown bookmark node: ${nodeId}`);
  }

  return node;
}

function getFolderNode(bundle: BookmarkBundle, nodeId: string, role: string): Extract<BookmarkNode, { type: "folder" }> {
  const node = getNode(bundle, nodeId);

  if (node.type !== "folder") {
    throw new Error(`${role} must be a folder`);
  }

  return node;
}

function rootIds(bundle: BookmarkBundle): string[] {
  return Object.values(bundle.roots);
}

function isRootNode(bundle: BookmarkBundle, nodeId: string): boolean {
  return rootIds(bundle).includes(nodeId);
}

function findParentFolderId(bundle: BookmarkBundle, nodeId: string): string | null {
  for (const [candidateId, candidate] of Object.entries(bundle.nodes)) {
    if (candidate.type !== "folder") {
      continue;
    }

    if (candidate.children.includes(nodeId)) {
      return candidateId;
    }
  }

  return null;
}

function collectDescendantIds(bundle: BookmarkBundle, nodeId: string, collected: Set<string> = new Set<string>()): string[] {
  if (collected.has(nodeId)) {
    return [];
  }

  collected.add(nodeId);
  const node = bundle.nodes[nodeId];

  if (!node) {
    return [];
  }

  const descendants = [nodeId];

  if (node.type === "folder") {
    for (const childId of node.children) {
      descendants.push(...collectDescendantIds(bundle, childId, collected));
    }
  }

  return descendants;
}

function isDescendantOf(bundle: BookmarkBundle, nodeId: string, potentialAncestorId: string): boolean {
  const ancestor = bundle.nodes[potentialAncestorId];

  if (!ancestor || ancestor.type !== "folder") {
    return false;
  }

  for (const childId of ancestor.children) {
    if (childId === nodeId) {
      return true;
    }

    if (isDescendantOf(bundle, nodeId, childId)) {
      return true;
    }
  }

  return false;
}

function generateNodeId(bundle: BookmarkBundle, deviceId: string, kind: "folder" | "bookmark"): string {
  const timestamp = Date.now().toString(36);
  const randomSuffix = Math.random().toString(36).slice(2, 10);
  let candidate = `onesync.private.${kind}.${deviceId}.${timestamp}.${randomSuffix}`;

  while (bundle.nodes[candidate]) {
    candidate = `onesync.private.${kind}.${deviceId}.${timestamp}.${Math.random().toString(36).slice(2, 10)}`;
  }

  return candidate;
}

function touchNode(bundle: BookmarkBundle, nodeId: string, updatedAt: string): void {
  const node = bundle.nodes[nodeId];

  if (!node) {
    return;
  }

  bundle.nodes[nodeId] = {
    ...node,
    ...(node.type === "folder" ? { children: [...node.children] } : {}),
    updatedAt
  };
}

function insertChild(bundle: BookmarkBundle, parentId: string, childId: string, updatedAt: string): void {
  const parent = getFolderNode(bundle, parentId, "Parent");

  if (!parent.children.includes(childId)) {
    parent.children.push(childId);
  }

  parent.updatedAt = updatedAt;
}

function removeChild(bundle: BookmarkBundle, parentId: string, childId: string, updatedAt: string): void {
  const parent = getFolderNode(bundle, parentId, "Parent");
  parent.children = parent.children.filter((candidateId) => candidateId !== childId);
  parent.updatedAt = updatedAt;
}

function upsertTombstones(existing: BookmarkTombstone[], deletedIds: string[], deletedAt: string): BookmarkTombstone[] {
  const tombstonesById = new Map<string, BookmarkTombstone>();

  for (const tombstone of existing) {
    tombstonesById.set(tombstone.id, tombstone);
  }

  for (const nodeId of deletedIds) {
    const previous = tombstonesById.get(nodeId);

    if (!previous || previous.deletedAt < deletedAt) {
      tombstonesById.set(nodeId, { id: nodeId, deletedAt });
    }
  }

  return Array.from(tombstonesById.values());
}

function createFolder(bundle: BookmarkBundle, parentId: string, title: string, deviceId: string): BookmarkBundle {
  const next = cloneBundle(bundle);
  const parent = getFolderNode(next, parentId, "Parent");
  const generatedAt = new Date().toISOString();
  const nodeId = generateNodeId(next, deviceId, "folder");

  next.nodes[nodeId] = {
    id: nodeId,
    type: "folder",
    title,
    children: [],
    addedAt: generatedAt,
    updatedAt: generatedAt
  };
  parent.children.push(nodeId);
  parent.updatedAt = generatedAt;

  return normalizeBundle(stampBundle(next, deviceId, generatedAt));
}

function createBookmark(
  bundle: BookmarkBundle,
  parentId: string,
  title: string,
  url: string,
  deviceId: string
): BookmarkBundle {
  const next = cloneBundle(bundle);
  const parent = getFolderNode(next, parentId, "Parent");
  const generatedAt = new Date().toISOString();
  const nodeId = generateNodeId(next, deviceId, "bookmark");

  next.nodes[nodeId] = {
    id: nodeId,
    type: "bookmark",
    title,
    url,
    addedAt: generatedAt,
    updatedAt: generatedAt
  };
  parent.children.push(nodeId);
  parent.updatedAt = generatedAt;

  return normalizeBundle(stampBundle(next, deviceId, generatedAt));
}

function renameNode(bundle: BookmarkBundle, nodeId: string, title: string, deviceId: string): BookmarkBundle {
  const next = cloneBundle(bundle);
  const generatedAt = new Date().toISOString();
  const node = getNode(next, nodeId);

  next.nodes[nodeId] = {
    ...node,
    ...(node.type === "folder" ? { children: [...node.children] } : {}),
    title,
    updatedAt: generatedAt
  };

  return normalizeBundle(stampBundle(next, deviceId, generatedAt));
}

function updateBookmark(
  bundle: BookmarkBundle,
  nodeId: string,
  title: string,
  url: string,
  deviceId: string
): BookmarkBundle {
  const next = cloneBundle(bundle);
  const generatedAt = new Date().toISOString();
  const node = getNode(next, nodeId);

  if (node.type !== "bookmark") {
    throw new Error("Only bookmark items can update a URL");
  }

  next.nodes[nodeId] = {
    ...node,
    title,
    url,
    updatedAt: generatedAt
  };

  return normalizeBundle(stampBundle(next, deviceId, generatedAt));
}

function deleteNode(bundle: BookmarkBundle, nodeId: string, deviceId: string): BookmarkBundle {
  const next = cloneBundle(bundle);
  const generatedAt = new Date().toISOString();
  const deletedIds = collectDescendantIds(next, nodeId);

  if (deletedIds.length === 0) {
    throw new Error(`Unknown bookmark node: ${nodeId}`);
  }

  if (isRootNode(next, nodeId)) {
    throw new Error("Root bookmark nodes cannot be deleted");
  }

  const parentId = findParentFolderId(next, nodeId);

  if (!parentId) {
    throw new Error(`Bookmark node ${nodeId} is not attached to a folder`);
  }

  removeChild(next, parentId, nodeId, generatedAt);

  for (const deletedId of deletedIds) {
    delete next.nodes[deletedId];
  }

  next.tombstones = upsertTombstones(next.tombstones, deletedIds, generatedAt);

  return normalizeBundle(stampBundle(next, deviceId, generatedAt));
}

export function assertMovableNode(bundle: BookmarkBundle, nodeId: string, destinationFolderId: string): void {
  const node = getNode(bundle, nodeId);
  getFolderNode(bundle, destinationFolderId, "Destination");

  if (isRootNode(bundle, nodeId)) {
    throw new Error("Root bookmark nodes cannot be moved");
  }

  if (nodeId === destinationFolderId) {
    throw new Error("A node cannot be moved into itself");
  }

  if (node.type === "folder" && isDescendantOf(bundle, destinationFolderId, nodeId)) {
    throw new Error("A folder cannot be moved into one of its descendants");
  }
}

function moveNode(bundle: BookmarkBundle, nodeId: string, destinationFolderId: string, deviceId: string): BookmarkBundle {
  const next = cloneBundle(bundle);
  const generatedAt = new Date().toISOString();

  assertMovableNode(next, nodeId, destinationFolderId);

  const sourceParentId = findParentFolderId(next, nodeId);

  if (!sourceParentId) {
    throw new Error(`Bookmark node ${nodeId} is not attached to a folder`);
  }

  if (sourceParentId === destinationFolderId) {
    return normalizeBundle(stampBundle(next, deviceId, generatedAt));
  }

  removeChild(next, sourceParentId, nodeId, generatedAt);
  insertChild(next, destinationFolderId, nodeId, generatedAt);
  touchNode(next, nodeId, generatedAt);

  return normalizeBundle(stampBundle(next, deviceId, generatedAt));
}

export function applyPrivateBookmarkOperation(
  bundle: BookmarkBundle,
  operation: PrivateBookmarkOperation,
  deviceId: string
): BookmarkBundle {
  switch (operation.type) {
    case "create-folder":
      return createFolder(bundle, operation.parentId, operation.title, deviceId);
    case "create-bookmark":
      return createBookmark(bundle, operation.parentId, operation.title, operation.url, deviceId);
    case "update-bookmark":
      return updateBookmark(bundle, operation.nodeId, operation.title, operation.url, deviceId);
    case "rename-node":
      return renameNode(bundle, operation.nodeId, operation.title, deviceId);
    case "delete-node":
      return deleteNode(bundle, operation.nodeId, deviceId);
    case "move-node":
      return moveNode(bundle, operation.nodeId, operation.destinationFolderId, deviceId);
  }
}
