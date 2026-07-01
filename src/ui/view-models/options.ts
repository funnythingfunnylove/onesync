import { browser } from "wxt/browser";
import type { BookmarkStorageMode } from "../../core/browser/bookmarks";
import type { SyncConfig } from "../../core/state/config";
import { validateSyncConfigForSync } from "../../core/state/config-validation";
import type { PrivateBookmarkOperation, PrivateBookmarkTab, RuntimeMessage } from "../../core/shared/types";
import type { ActivityLogEntry } from "../../core/state/activity-log";
import type { SyncState } from "../../core/state/sync-state";
import type { PrivateBookmarksViewState, PrivateBookmarkViewNode } from "../../core/private-bookmarks/view-state";
import { requestSyncTrigger } from "./sync-trigger";

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
};

export type PrivateBookmarkManagerFolderEntry = {
  id: string;
  title: string;
  depth: number;
  isSelected: boolean;
};

export type PrivateBookmarkManagerTabState = {
  id: PrivateBookmarkTab;
  label: "Folders" | "Tree";
  isActive: boolean;
};

export type PrivateBookmarkManagerActionState = {
  label: string;
  disabled: boolean;
};

export type PrivateBookmarkManagerViewModel = {
  mode: BookmarkStorageMode;
  modeHint: string;
  itemCount: number;
  activeTab: PrivateBookmarkTab;
  tabs: PrivateBookmarkManagerTabState[];
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

function flattenTree(nodes: PrivateBookmarkViewNode[]): PrivateBookmarkViewNode[] {
  const flattened: PrivateBookmarkViewNode[] = [];

  for (const node of nodes) {
    flattened.push(node);
    flattened.push(...flattenTree(node.children));
  }

  return flattened;
}

function findTreeNode(nodes: PrivateBookmarkViewNode[], nodeId: string): PrivateBookmarkViewNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }

    const nestedMatch = findTreeNode(node.children, nodeId);

    if (nestedMatch) {
      return nestedMatch;
    }
  }

  return null;
}

function isRootFolder(state: PrivateBookmarksViewState, nodeId: string): boolean {
  return state.folders.some((folder) => folder.id === nodeId && folder.depth === 0);
}

function mapNode(node: PrivateBookmarkViewNode, selectedNodeId: string | null): PrivateBookmarkManagerNode {
  return {
    id: node.id,
    type: node.type,
    title: node.title,
    url: node.url,
    depth: node.depth,
    isSelected: node.id === selectedNodeId
  };
}

export function buildPrivateBookmarkManagerViewModel(
  state: PrivateBookmarksViewState,
  options: {
    activeTab: PrivateBookmarkTab;
    selectedFolderId?: string;
    selectedNodeId?: string;
  }
): PrivateBookmarkManagerViewModel {
  const resolvedSelectedFolderId = state.folders.some((folder) => folder.id === options.selectedFolderId)
    ? (options.selectedFolderId ?? state.selectedFolderId)
    : state.selectedFolderId;
  const selectedFolderNode = findTreeNode(state.tree, resolvedSelectedFolderId);
  const visibleSource =
    options.activeTab === "tree" ? flattenTree(state.tree) : (selectedFolderNode?.children ?? state.currentFolder?.children ?? []);
  const visibleNodeIds = new Set(visibleSource.map((node) => node.id));
  const resolvedSelectedNodeId = visibleNodeIds.has(options.selectedNodeId ?? "")
    ? (options.selectedNodeId ?? null)
    : resolvedSelectedFolderId;
  const selectedNode =
    visibleSource.find((node) => node.id === resolvedSelectedNodeId) ??
    flattenTree(state.tree).find((node) => node.id === resolvedSelectedNodeId) ??
    null;
  const selectedFolder = state.folders.find((folder) => folder.id === resolvedSelectedFolderId) ?? null;
  const actionsDisabled = state.mode === "unavailable";
  const selectedNodeIsRoot = selectedNode ? isRootFolder(state, selectedNode.id) : false;
  const canMutateNode = !actionsDisabled && Boolean(selectedNode);
  const canMutateRoot = canMutateNode && !selectedNodeIsRoot;

  return {
    mode: state.mode,
    modeHint: state.modeHint,
    itemCount: state.itemCount,
    activeTab: options.activeTab,
    tabs: [
      { id: "folders", label: "Folders", isActive: options.activeTab === "folders" },
      { id: "tree", label: "Tree", isActive: options.activeTab === "tree" }
    ],
    selectedFolder: selectedFolder ? { id: selectedFolder.id, title: selectedFolder.title } : null,
    selectedNode: selectedNode ? mapNode(selectedNode, resolvedSelectedNodeId) : null,
    folderEntries: state.folders.map((folder) => ({
      ...folder,
      isSelected: folder.id === resolvedSelectedFolderId
    })),
    visibleNodes: visibleSource.map((node) => mapNode(node, resolvedSelectedNodeId)),
    moveDestinations: state.folders.map((folder) => ({
      ...folder,
      isSelected: folder.id === resolvedSelectedFolderId
    })),
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
        disabled: !canMutateRoot
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
