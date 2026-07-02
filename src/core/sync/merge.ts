import { normalizeBundle, type BookmarkBundle, type BookmarkNode } from "../format/schema";

type BookmarkTombstone = BookmarkBundle["tombstones"][number];

function newestNode(left: BookmarkNode, right: BookmarkNode): BookmarkNode {
  return left.updatedAt >= right.updatedAt ? left : right;
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

function resolveParentFolderId(
  base: BookmarkBundle | null,
  local: BookmarkBundle,
  remote: BookmarkBundle,
  nodeId: string
): string | null {
  const localParentId = findParentFolderId(local, nodeId);
  const remoteParentId = findParentFolderId(remote, nodeId);
  const baseParentId = base ? findParentFolderId(base, nodeId) : null;
  const localNode = local.nodes[nodeId];
  const remoteNode = remote.nodes[nodeId];

  if (localParentId === remoteParentId) {
    return localParentId;
  }

  if (base && localParentId === baseParentId && remoteParentId !== baseParentId) {
    return remoteParentId;
  }

  if (base && remoteParentId === baseParentId && localParentId !== baseParentId) {
    return localParentId;
  }

  if (localParentId && !remoteParentId) {
    return localParentId;
  }

  if (remoteParentId && !localParentId) {
    return remoteParentId;
  }

  if (localParentId && remoteParentId && localNode && remoteNode) {
    return localNode.updatedAt >= remoteNode.updatedAt ? localParentId : remoteParentId;
  }

  return null;
}

function deriveDeletionTombstones(base: BookmarkBundle | null, current: BookmarkBundle): BookmarkTombstone[] {
  if (!base) {
    return [];
  }

  return Object.keys(base.nodes)
    .filter((nodeId) => !current.nodes[nodeId])
    .map((nodeId) => ({
      id: nodeId,
      deletedAt: current.generatedAt
    }));
}

export function mergeBundles(
  base: BookmarkBundle | null,
  local: BookmarkBundle,
  remote: BookmarkBundle | null
): BookmarkBundle {
  if (!remote) {
    return normalizeBundle(local);
  }

  const mergedNodes: Record<string, BookmarkNode> = {};
  const nodeIds = new Set([...Object.keys(local.nodes), ...Object.keys(remote.nodes)]);

  for (const nodeId of nodeIds) {
    const localNode = local.nodes[nodeId];
    const remoteNode = remote.nodes[nodeId];

    if (localNode && !remoteNode) {
      mergedNodes[nodeId] = localNode;
      continue;
    }

    if (remoteNode && !localNode) {
      mergedNodes[nodeId] = remoteNode;
      continue;
    }

    if (!localNode || !remoteNode) {
      continue;
    }

    const selectedNode = newestNode(localNode, remoteNode);

    if (localNode.type === "folder" && remoteNode.type === "folder") {
      mergedNodes[nodeId] = {
        id: selectedNode.id,
        type: "folder",
        title: selectedNode.title,
        children: [],
        addedAt: selectedNode.addedAt,
        updatedAt: selectedNode.updatedAt
      };
      continue;
    }

    mergedNodes[nodeId] = selectedNode;
  }

  const tombstonesById = new Map<string, BookmarkTombstone>();

  for (const tombstone of [
    ...local.tombstones,
    ...remote.tombstones,
    ...deriveDeletionTombstones(base, local),
    ...deriveDeletionTombstones(base, remote)
  ]) {
    const existing = tombstonesById.get(tombstone.id);
    if (!existing || existing.deletedAt < tombstone.deletedAt) {
      tombstonesById.set(tombstone.id, tombstone);
    }
  }

  for (const [nodeId, tombstone] of tombstonesById.entries()) {
    const node = mergedNodes[nodeId];

    if (node && node.updatedAt <= tombstone.deletedAt) {
      delete mergedNodes[nodeId];
    }
  }

  const deletedNodeIds = new Set(
    Array.from(tombstonesById.entries())
      .filter(([nodeId]) => !mergedNodes[nodeId])
      .map(([nodeId]) => nodeId)
  );

  for (const node of Object.values(mergedNodes)) {
    if (node.type !== "folder") {
      continue;
    }

    node.children = node.children.filter((childId) => !deletedNodeIds.has(childId));
  }

  const folderIds = Object.entries(mergedNodes)
    .filter(([, node]) => node.type === "folder")
    .map(([nodeId]) => nodeId);

  for (const folderId of folderIds) {
    const orderedChildren: string[] = [];
    const seen = new Set<string>();
    const localFolder = local.nodes[folderId];
    const remoteFolder = remote.nodes[folderId];

    for (const childId of [
      ...(localFolder?.type === "folder" ? localFolder.children : []),
      ...(remoteFolder?.type === "folder" ? remoteFolder.children : [])
    ]) {
      if (seen.has(childId) || !mergedNodes[childId]) {
        continue;
      }

      const resolvedParentId = resolveParentFolderId(base, local, remote, childId);

      if (resolvedParentId !== folderId || !mergedNodes[resolvedParentId]) {
        continue;
      }

      seen.add(childId);
      orderedChildren.push(childId);
    }

    const mergedFolder = mergedNodes[folderId];

    if (!mergedFolder || mergedFolder.type !== "folder") {
      continue;
    }

    mergedNodes[folderId] = {
      ...mergedFolder,
      children: orderedChildren
    };
  }

  return normalizeBundle({
    kind: "onesync.bookmarks",
    schemaVersion: 1,
    revision: local.revision,
    deviceId: local.deviceId,
    generatedAt: local.generatedAt,
    roots: {
      toolbar: local.roots.toolbar,
      menu: local.roots.menu,
      mobile: local.roots.mobile,
      unfiled: local.roots.unfiled
    },
    nodes: mergedNodes,
    tombstones: Array.from(tombstonesById.values()),
    meta: {
      client: "onesync",
      clientVersion: local.meta.clientVersion
    }
  });
}
