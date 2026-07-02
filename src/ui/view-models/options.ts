import { browser } from "wxt/browser";
import type { BookmarkStorageMode } from "../../core/browser/bookmarks";
import {
  validatePrivateBookmarkUrl,
  type BookmarkUrlValidationResult
} from "../../core/private-bookmarks/validation";
import {
  PRIVATE_BOOKMARK_TAGS,
  getPrivateBookmarkTagOption,
  normalizePrivateBookmarkTagTexts,
  normalizePrivateBookmarkTags,
  type PrivateBookmarkTag,
  type PrivateBookmarkTagOption
} from "../../core/private-bookmarks/tags";
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
  tags: PrivateBookmarkTag[];
  depth: number;
  isSelected: boolean;
  childCount: number;
  parentFolderId: string | null;
  parentFolderTitle: string | null;
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

export type PrivateBookmarkFilterMode = string;

export type PrivateBookmarkManagerViewModel = {
  mode: BookmarkStorageMode;
  modeHint: string;
  itemCount: number;
  selectedFolder: { id: string; title: string } | null;
  selectedNode: PrivateBookmarkManagerNode | null;
  folderEntries: PrivateBookmarkManagerFolderEntry[];
  visibleNodes: PrivateBookmarkManagerNode[];
  tagOptions: PrivateBookmarkTagOption[];
  actions: {
    createBookmark: PrivateBookmarkManagerActionState;
    rename: PrivateBookmarkManagerActionState;
    delete: PrivateBookmarkManagerActionState;
    dedupe: PrivateBookmarkManagerActionState;
  };
};

type TreeNodeLocation = {
  node: PrivateBookmarkViewNode;
  parentFolderId: string | null;
};

export type PrivateBookmarkEditDraft = {
  title: string;
  url?: string;
  tags?: PrivateBookmarkTag[];
};

function matchesPrivateBookmarkTagFilter(node: PrivateBookmarkManagerNode, tagId: PrivateBookmarkFilterMode): boolean {
  const tagTexts = normalizePrivateBookmarkTagTexts(node.tags);

  if (tagId === "all") {
    return true;
  }

  if (tagId === "untagged") {
    return tagTexts.length === 0;
  }

  return tagTexts.includes(tagId);
}

export function filterPrivateBookmarkManagerNodes(
  nodes: PrivateBookmarkManagerNode[],
  options: {
    query: string;
    tagId: PrivateBookmarkFilterMode;
  }
): PrivateBookmarkManagerNode[] {
  const normalizedQuery = options.query.trim().toLowerCase();

  return nodes.filter((node) => {
    if (!matchesPrivateBookmarkTagFilter(node, options.tagId)) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return [node.title, node.url ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
}

export function getPrivateBookmarkTagOptions(usedTagIds: readonly string[]): PrivateBookmarkTagOption[] {
  const usedTags = normalizePrivateBookmarkTagTexts(usedTagIds);
  const usedTagSet = new Set(usedTags);
  const tagOptions: PrivateBookmarkTagOption[] = [
    { id: "all", label: "All tags", color: "#f1f0ec", colorClass: "tag-color-all" }
  ];

  for (const tag of PRIVATE_BOOKMARK_TAGS) {
    if (usedTagSet.has(tag.id)) {
      tagOptions.push(tag);
    }
  }

  const presetTagIds: Set<string> = new Set(PRIVATE_BOOKMARK_TAGS.map((tag) => tag.id));
  const customTagOptions = usedTags
    .filter((tagId) => !presetTagIds.has(tagId))
    .sort((left, right) => left.localeCompare(right))
    .map((tagId) => getPrivateBookmarkTagOption(tagId));

  tagOptions.push(...customTagOptions);

  if (usedTagIds.includes("untagged")) {
    tagOptions.push({ id: "untagged", label: "Untagged", color: "#f1f0ec", colorClass: "tag-color-untagged" });
  }

  return tagOptions;
}

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

function collectFlatBookmarkNodes(
  nodes: PrivateBookmarkViewNode[],
  selectedNodeId: string | null,
  parentFolder: { id: string; title: string } | null = null,
  collected: PrivateBookmarkManagerNode[] = []
): PrivateBookmarkManagerNode[] {
  for (const node of nodes) {
    if (node.type === "bookmark") {
      collected.push({
        id: node.id,
        type: node.type,
        title: node.title,
        url: node.url,
        tags: normalizePrivateBookmarkTags(node.tags),
        depth: 0,
        isSelected: node.id === selectedNodeId,
        childCount: 0,
        parentFolderId: parentFolder?.id ?? null,
        parentFolderTitle: parentFolder?.title ?? null
      });
      continue;
    }

    collectFlatBookmarkNodes(
      node.children,
      selectedNodeId,
      { id: node.id, title: node.title },
      collected
    );
  }

  return collected;
}

function mapNode(
  node: PrivateBookmarkViewNode,
  selectedNodeId: string | null,
  parentFolder: { id: string; title: string } | null = null
): PrivateBookmarkManagerNode {
  return {
    id: node.id,
    type: node.type,
    title: node.title,
    url: node.url,
    tags: normalizePrivateBookmarkTags(node.tags),
    depth: node.depth,
    isSelected: node.id === selectedNodeId,
    childCount: node.children.length,
    parentFolderId: parentFolder?.id ?? null,
    parentFolderTitle: parentFolder?.title ?? null
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
  const tags = [
    ...formData.getAll("tags").map((tag) => {
      const tagText = String(tag);
      const tagId = getPrivateBookmarkTagOption(tagText).id;

      return {
        text: tagText,
        color: String(formData.get(`tagColor:${tagId}`) ?? "")
      };
    }),
    {
      text: String(formData.get("customTag") ?? ""),
      color: String(formData.get("customTagColor") ?? "")
    }
  ];

  return {
    title,
    ...(nodeType === "bookmark" ? { url, tags: normalizePrivateBookmarkTags(tags) } : {})
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
  const visibleNodes = collectFlatBookmarkNodes(
    state.tree,
    selectedTreeNodeLocation?.node.type === "bookmark" ? options.selectedNodeId ?? null : null
  );
  const usedTagIds = visibleNodes.flatMap((node) => node.tags.map((tag) => tag.text));
  const hasUntaggedBookmarks = visibleNodes.some((node) => node.tags.length === 0);
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const resolvedSelectedNodeId =
    options.selectedNodeId && selectedTreeNodeLocation?.node.type === "bookmark" && visibleNodeIds.has(options.selectedNodeId)
      ? options.selectedNodeId
      : null;
  const selectedNode =
    (resolvedSelectedNodeId ? findTreeNodeLocation(state.tree, resolvedSelectedNodeId)?.node ?? null : null);
  const selectedFolder = state.folders.find((folder) => folder.id === resolvedSelectedFolderId) ?? null;
  const actionsDisabled = state.mode === "unavailable";
  const selectedNodeIsRoot = selectedNode ? isRootFolder(state, selectedNode.id) : false;
  const canMutateNode = !actionsDisabled && Boolean(selectedNode);
  const canMutateRoot = canMutateNode && !selectedNodeIsRoot;

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
    visibleNodes,
    tagOptions: getPrivateBookmarkTagOptions([
      ...usedTagIds,
      ...(hasUntaggedBookmarks ? ["untagged"] : [])
    ]),
    actions: {
      createBookmark: {
        label: "Create bookmark",
        disabled: actionsDisabled || !selectedFolder
      },
      rename: {
        label: "Rename",
        disabled: !canMutateNode || selectedNodeIsRoot
      },
      delete: {
        label: "Delete",
        disabled: !canMutateRoot
      },
      dedupe: {
        label: "Remove duplicates",
        disabled: actionsDisabled || state.itemCount === 0
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

export async function dedupePrivateBookmarksAndSync(): Promise<PrivateBookmarksViewState> {
  const state = await mutatePrivateBookmarks({ type: "dedupe-bookmarks" });
  await requestOptionsSync();
  return state;
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
