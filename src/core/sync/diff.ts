import type { BookmarkBundle } from "../format/schema";

export type BookmarkChangeSet = {
  addedNodeIds: string[];
  updatedNodeIds: string[];
  deletedNodeIds: string[];
};

export function diffBundles(base: BookmarkBundle | null, current: BookmarkBundle): BookmarkChangeSet {
  if (!base) {
    return {
      addedNodeIds: Object.keys(current.nodes),
      updatedNodeIds: [],
      deletedNodeIds: []
    };
  }

  const addedNodeIds: string[] = [];
  const updatedNodeIds: string[] = [];
  const deletedNodeIds: string[] = [];

  for (const [nodeId, currentNode] of Object.entries(current.nodes)) {
    const baseNode = base.nodes[nodeId];

    if (!baseNode) {
      addedNodeIds.push(nodeId);
      continue;
    }

    if (JSON.stringify(baseNode) !== JSON.stringify(currentNode)) {
      updatedNodeIds.push(nodeId);
    }
  }

  for (const nodeId of Object.keys(base.nodes)) {
    if (!current.nodes[nodeId]) {
      deletedNodeIds.push(nodeId);
    }
  }

  return {
    addedNodeIds,
    updatedNodeIds,
    deletedNodeIds
  };
}
