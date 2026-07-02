import { browser } from "wxt/browser";
import type { BookmarkStorageMode } from "../../core/browser/bookmarks";
import {
  validatePrivateBookmarkUrl,
  type BookmarkUrlValidationResult
} from "../../core/private-bookmarks/validation";
import type { SyncConfig } from "../../core/state/config";
import { validateSyncConfigForSync } from "../../core/state/config-validation";
import type { PrivateBookmarkOperation, RuntimeMessage } from "../../core/shared/types";
import type { ActivityLogEntry } from "../../core/state/activity-log";
import type { SyncState } from "../../core/state/sync-state";
import type { PrivateBookmarksViewState, PrivateBookmarkViewNode } from "../../core/private-bookmarks/view-state";
import { requestSyncTrigger } from "./sync-trigger";

export { validatePrivateBookmarkUrl };
export type { BookmarkUrlValidationResult };

export type OptionsViewModel = {
  config: SyncConfig;
  syncState: SyncState;
  activityLog: ActivityLogEntry[];
};

export type WebDavConnectionCheckResult = {
  status: "ready" | "needs-initial-sync";
  message: string;
};

export type PrivateBookmarkManagerNode = {
  id: string;
  type: PrivateBookmarkViewNode["type"];
  title: string;
  url?: string;
  depth: number;
  isSelected: boolean;
  childCount: number;
};

export type PrivateBookmarkManagerFolderEntry = {
  id: string;
  title: string;
  depth: number;
  isSelected: boolean;
};

export type PrivateBookmarkManagerActionState = {
  label: string;
  disabled: boolean;
};

export type PrivateBookmarkManagerViewModel = {
  mode: BookmarkStorageMode;
  modeHint: string;
  itemCount: number;
  selectedFolder: { id: string; title: string } | null;
  selectedNode: PrivateBookmarkManagerNode | null;
  folderEntries: PrivateBookmarkManagerFolderEntry[];
  visibleNodes: PrivateBookmarkManagerNode[];
  moveDestinations: PrivateBookmarkManagerFolderEntry[];
  actions: {
    createFolder: PrivateBookmarkManagerActionState;
    createBookmark: PrivateBookmarkManagerActionState;
    rename: PrivateBookmarkManagerActionState;
    move: PrivateBookmarkManagerActionState;
    delete: PrivateBookmarkManagerActionState;
  };
};

type TreeNodeLocation = {
  node: PrivateBookmarkViewNode;
  parentFolderId: string | null;
};

export type PrivateBookmarkEditDraft = {
  title: string;
  url?: string;
};

function findTreeNodeLocation(
  nodes: PrivateBookmarkViewNode[],
  nodeId: string,
  parentFolderId: string | null = null
): TreeNodeLocation | null {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return {
        node,
        parentFolderId
      };
    }

    const nestedMatch = findTreeNodeLocation(
      node.children,
      nodeId,
      node.type === "folder" ? node.id : parentFolderId
    );

    if (nestedMatch) {
      return nestedMatch;
    }
  }

  return null;
}

function isRootFolder(state: PrivateBookmarksViewState, nodeId: string): boolean {
  return state.folders.some((folder) => folder.id === nodeId && folder.depth === 0);
}

function collectFolderDescendantIds(node: PrivateBookmarkViewNode, collected: Set<string> = new Set<string>()): Set<string> {
  for (const child of node.children) {
    if (child.type !== "folder") {
      continue;
    }

    collected.add(child.id);
    collectFolderDescendantIds(child, collected);
  }

  return collected;
}

function mapNode(
  node: PrivateBookmarkViewNode,
  selectedNodeId: string | null
): PrivateBookmarkManagerNode {
  return {
    id: node.id,
    type: node.type,
    title: node.title,
    url: node.url,
    depth: node.depth,
    isSelected: node.id === selectedNodeId,
    childCount: node.children.length
  };
}

export function getPrivateBookmarkLinkHref(rawUrl: string | undefined): string | null {
  if (!rawUrl) {
    return null;
  }

  const validatedUrl = validatePrivateBookmarkUrl(rawUrl);
  return validatedUrl.ok ? validatedUrl.value : null;
}

export function buildPrivateBookmarkEditDraft(
  nodeType: PrivateBookmarkViewNode["type"],
  formData: FormData
): PrivateBookmarkEditDraft {
  const title = String(formData.get("title") ?? "");
  const url = String(formData.get("url") ?? "");

  return {
    title,
    ...(nodeType === "bookmark" ? { url } : {})
  };
}

export function buildPrivateBookmarkManagerViewModel(
  state: PrivateBookmarksViewState,
  options: {
    selectedFolderId?: string;
    selectedFolderContextId?: string;
    selectedNodeId?: string;
    editingNodeId?: string;
  }
): PrivateBookmarkManagerViewModel {
  const selectedTreeNodeLocation = options.selectedNodeId
    ? findTreeNodeLocation(state.tree, options.selectedNodeId)
    : null;
  const editingTreeNodeLocation = options.editingNodeId
    ? findTreeNodeLocation(state.tree, options.editingNodeId)
    : null;
  const fallbackFolderId = state.folders.some((folder) => folder.id === options.selectedFolderId)
    ? (options.selectedFolderId ?? state.selectedFolderId)
    : state.selectedFolderId;
  const selectedFolderContextId = state.folders.some((folder) => folder.id === options.selectedFolderContextId)
    ? options.selectedFolderContextId ?? null
    : null;
  const editingFolderContextId =
    editingTreeNodeLocation?.node.type === "folder"
      ? editingTreeNodeLocation.parentFolderId
      : null;
  const resolvedSelectedFolderId =
    editingFolderContextId && options.editingNodeId === options.selectedNodeId
      ? editingFolderContextId
      : selectedFolderContextId && selectedTreeNodeLocation?.node.type === "folder"
        ? selectedFolderContextId
      : selectedTreeNodeLocation?.node.type === "folder"
        ? selectedTreeNodeLocation.node.id
        : selectedTreeNodeLocation?.parentFolderId ?? fallbackFolderId;
  const selectedFolderNode = findTreeNodeLocation(state.tree, resolvedSelectedFolderId)?.node ?? null;
  const visibleSource = selectedFolderNode?.children ?? state.currentFolder?.children ?? [];
  const visibleNodeIds = new Set(visibleSource.map((node) => node.id));
  const resolvedSelectedNodeId = options.selectedNodeId && (selectedTreeNodeLocation || visibleNodeIds.has(options.selectedNodeId))
    ? options.selectedNodeId
    : resolvedSelectedFolderId;
  const selectedNode =
    (resolvedSelectedNodeId ? findTreeNodeLocation(state.tree, resolvedSelectedNodeId)?.node ?? null : null);
  const selectedFolder = state.folders.find((folder) => folder.id === resolvedSelectedFolderId) ?? null;
  const actionsDisabled = state.mode === "unavailable";
  const selectedNodeIsRoot = selectedNode ? isRootFolder(state, selectedNode.id) : false;
  const canMutateNode = !actionsDisabled && Boolean(selectedNode);
  const canMutateRoot = canMutateNode && !selectedNodeIsRoot;
  const invalidMoveDestinationIds =
    selectedNode?.type === "folder"
      ? new Set<string>([selectedNode.id, ...collectFolderDescendantIds(selectedNode)])
      : new Set<string>();
  const moveDestinations = state.folders
    .filter((folder) => !invalidMoveDestinationIds.has(folder.id))
    .map((folder) => ({
      ...folder,
      isSelected: folder.id === resolvedSelectedFolderId
    }));

  return {
    mode: state.mode,
    modeHint: state.modeHint,
    itemCount: state.itemCount,
    selectedFolder: selectedFolder ? { id: selectedFolder.id, title: selectedFolder.title } : null,
    selectedNode: selectedNode ? mapNode(selectedNode, resolvedSelectedNodeId) : null,
    folderEntries: state.folders.map((folder) => ({
      ...folder,
      isSelected: folder.id === resolvedSelectedFolderId
    })),
    visibleNodes: visibleSource.map((node) => mapNode(node, resolvedSelectedNodeId)),
    moveDestinations,
    actions: {
      createFolder: {
        label: "Create folder",
        disabled: actionsDisabled || !selectedFolder
      },
      createBookmark: {
        label: "Create bookmark",
        disabled: actionsDisabled || !selectedFolder
      },
      rename: {
        label: "Rename",
        disabled: !canMutateNode || selectedNodeIsRoot
      },
      move: {
        label: "Move",
        disabled: !canMutateRoot || moveDestinations.length === 0
      },
      delete: {
        label: "Delete",
        disabled: !canMutateRoot
      }
    }
  };
}

export async function loadOptionsViewModel(): Promise<OptionsViewModel> {
  return (await browser.runtime.sendMessage({
    type: "onesync:get-options-state"
  } satisfies RuntimeMessage)) as OptionsViewModel;
}

export async function loadPrivateBookmarksViewState(): Promise<PrivateBookmarksViewState> {
  return (await browser.runtime.sendMessage({
    type: "onesync:get-private-bookmarks"
  } satisfies RuntimeMessage)) as PrivateBookmarksViewState;
}

export async function mutatePrivateBookmarks(operation: PrivateBookmarkOperation): Promise<PrivateBookmarksViewState> {
  return (await browser.runtime.sendMessage({
    type: "onesync:mutate-private-bookmarks",
    payload: { operation }
  } satisfies RuntimeMessage)) as PrivateBookmarksViewState;
}

export async function saveOptionsConfig(config: SyncConfig): Promise<void> {
  await browser.runtime.sendMessage({
    type: "onesync:save-config",
    payload: config
  } satisfies RuntimeMessage);
}

export async function saveAndSyncOptionsConfig(config: SyncConfig): Promise<void> {
  const validatedConfig = validateSyncConfigForSync(config);
  await saveOptionsConfig(validatedConfig);
  await requestOptionsSync();
}

export async function requestOptionsConnectionCheck(
  config: SyncConfig
): Promise<WebDavConnectionCheckResult> {
  const validatedConfig = validateSyncConfigForSync(config);
  return (await browser.runtime.sendMessage({
    type: "onesync:test-webdav-connection",
    payload: validatedConfig
  } satisfies RuntimeMessage)) as WebDavConnectionCheckResult;
}

export async function exportEncodedBundle(): Promise<string> {
  return (await browser.runtime.sendMessage({
    type: "onesync:export-bundle"
  } satisfies RuntimeMessage)) as string;
}

export async function importEncodedBundle(encodedBundleJson: string): Promise<void> {
  await browser.runtime.sendMessage({
    type: "onesync:import-bundle",
    payload: { encodedBundleJson }
  } satisfies RuntimeMessage);
}

export async function requestOptionsSync(): Promise<void> {
  await requestSyncTrigger();
}
