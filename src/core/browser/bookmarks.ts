import { browser } from "wxt/browser";
import type { BookmarkBundle, BookmarkNode } from "../format/schema";
import { normalizeBundle } from "../format/schema";
import { normalizePrivateBookmarkTags, type PrivateBookmarkTag } from "../private-bookmarks/tags";
import { validatePrivateBookmarkUrl } from "../private-bookmarks/validation";
import type { SyncConfig } from "../state/config";
import { clearStoredBundle, loadStoredBundle, saveStoredBundle } from "./bundle-storage";

type NativeBookmarkTreeNode = {
  id: string;
  title?: string;
  url?: string;
  children?: NativeBookmarkTreeNode[];
  dateAdded?: number;
  dateGroupModified?: number;
};
type SemanticRoot = "toolbar" | "menu" | "mobile" | "unfiled";
const SEMANTIC_ROOT_ORDER: SemanticRoot[] = ["toolbar", "menu", "mobile", "unfiled"];
export type BookmarkStorageMode = "native" | "private" | "unavailable";
export type BookmarkItemProgress = {
  processed: number;
  total: number;
};

type BookmarkOperationOptions = {
  onProgress?: (progress: BookmarkItemProgress) => void | Promise<void>;
};

type ProgressTracker = {
  processed: number;
  total: number;
  onProgress?: (progress: BookmarkItemProgress) => void | Promise<void>;
};

export const BOOKMARKS_API_UNAVAILABLE_MESSAGE =
  "Bookmarks API is unavailable in this browser runtime. Safari on this version may not expose bookmark access to Web Extensions.";

const SYNTHETIC_ROOT_PREFIX = "onesync.synthetic";
const PRIVATE_BOOKMARKS_KEY = "onesync.privateBookmarks";
const PRIVATE_BOOKMARKS_NATIVE_FALLBACK_KEY = "onesync.privateBookmarksNativeFallback";
const NATIVE_BOOKMARK_TAGS_KEY = "onesync.nativeBookmarkTags";
const SYNTHETIC_ROOT_TITLES: Record<SemanticRoot, string> = {
  toolbar: "Bookmarks Bar",
  menu: "Bookmarks Menu",
  mobile: "Mobile Bookmarks",
  unfiled: "Unfiled Bookmarks"
};

const TOOLBAR_ROOT_PATTERNS = [/toolbar/iu, /bookmarks\s+bar/iu, /favorites(?:\s+bar)?$/iu];
const MENU_ROOT_PATTERNS = [/menu/iu, /bookmarks\s+menu/iu];
const MOBILE_ROOT_PATTERNS = [/mobile/iu];
const UNFILED_ROOT_PATTERNS = [/unfiled/iu, /other\s+bookmarks/iu, /other\s+favorites/iu];

type BookmarksApi = typeof browser.bookmarks;
type NativeBookmarkTagIndex = Record<string, PrivateBookmarkTag[]>;

function hasBookmarksApi(): boolean {
  const bookmarksApi = browser.bookmarks;

  return Boolean(
    bookmarksApi &&
      typeof bookmarksApi.getTree === "function" &&
      typeof bookmarksApi.create === "function" &&
      typeof bookmarksApi.remove === "function" &&
      typeof bookmarksApi.removeTree === "function"
  );
}

function requirePrivateBookmarkStorage() {
  const storageArea = browser.storage?.local;

  if (!storageArea || typeof storageArea.get !== "function" || typeof storageArea.set !== "function") {
    throw new Error(BOOKMARKS_API_UNAVAILABLE_MESSAGE);
  }

  return storageArea;
}

function requireBookmarksApi(): BookmarksApi {
  if (!hasBookmarksApi()) {
    throw new Error(BOOKMARKS_API_UNAVAILABLE_MESSAGE);
  }

  return browser.bookmarks;
}

export function getBookmarksApiAvailabilityError(): string | null {
  if (getBookmarkStorageMode() !== "unavailable") {
    return null;
  }

  try {
    requirePrivateBookmarkStorage();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function getBookmarkStorageMode(): BookmarkStorageMode {
  if (hasBookmarksApi()) {
    return "native";
  }

  try {
    requirePrivateBookmarkStorage();
    return "private";
  } catch {
    return "unavailable";
  }
}

function timestampFromNode(node: NativeBookmarkTreeNode, fallback: string): string {
  if (typeof node.dateAdded === "number") {
    return new Date(node.dateAdded).toISOString();
  }

  return fallback;
}

function countNativeDescendants(nodes: NativeBookmarkTreeNode[]): number {
  return nodes.reduce((total, node) => {
    return total + 1 + countNativeDescendants(node.children ?? []);
  }, 0);
}

function countBundleDescendants(bundle: BookmarkBundle, nodeIds: string[]): number {
  let total = 0;

  for (const nodeId of nodeIds) {
    const node = bundle.nodes[nodeId];

    if (!node) {
      continue;
    }

    total += 1;

    if (node.type === "folder") {
      total += countBundleDescendants(bundle, node.children);
    }
  }

  return total;
}

function assertBundleBookmarkUrlsAreSupported(bundle: BookmarkBundle): void {
  for (const node of Object.values(bundle.nodes)) {
    if (node.type !== "bookmark") {
      continue;
    }

    const validatedUrl = validatePrivateBookmarkUrl(node.url);

    if (!validatedUrl.ok) {
      throw new Error(`${validatedUrl.message} (bookmark "${node.title}" / ${node.id})`);
    }
  }
}

function normalizeBookmarkTagUrl(rawUrl: string): string {
  try {
    return new URL(rawUrl).href;
  } catch {
    return rawUrl.trim();
  }
}

function getNativeBookmarkTagKey(title: string, url: string): string {
  return `${title.trim()}\n${normalizeBookmarkTagUrl(url)}`;
}

function buildNativeBookmarkTagIndex(bundle: BookmarkBundle): NativeBookmarkTagIndex {
  const tagIndex: NativeBookmarkTagIndex = {};

  for (const node of Object.values(bundle.nodes)) {
    if (node.type !== "bookmark") {
      continue;
    }

    const tags = normalizePrivateBookmarkTags(node.tags);

    if (tags.length > 0) {
      tagIndex[getNativeBookmarkTagKey(node.title, node.url)] = tags;
    }
  }

  return tagIndex;
}

async function loadNativeBookmarkTagIndex(): Promise<NativeBookmarkTagIndex> {
  const storageArea = browser.storage?.local;

  if (!storageArea || typeof storageArea.get !== "function") {
    return {};
  }

  const storedValue = await storageArea.get(NATIVE_BOOKMARK_TAGS_KEY);
  const value = storedValue[NATIVE_BOOKMARK_TAGS_KEY];

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const tagIndex: NativeBookmarkTagIndex = {};

  for (const [key, rawTags] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(rawTags)) {
      continue;
    }

    const tags = normalizePrivateBookmarkTags(rawTags as Array<string | Partial<PrivateBookmarkTag>>);

    if (tags.length > 0) {
      tagIndex[key] = tags;
    }
  }

  return tagIndex;
}

async function saveNativeBookmarkTagIndex(bundle: BookmarkBundle): Promise<void> {
  const storageArea = browser.storage?.local;

  if (!storageArea || typeof storageArea.set !== "function") {
    return;
  }

  await storageArea.set({
    [NATIVE_BOOKMARK_TAGS_KEY]: buildNativeBookmarkTagIndex(bundle)
  });
}

function applyNativeBookmarkTagIndex(nodes: Record<string, BookmarkNode>, tagIndex: NativeBookmarkTagIndex): void {
  for (const [nodeId, node] of Object.entries(nodes)) {
    if (node.type !== "bookmark") {
      continue;
    }

    const tags = tagIndex[getNativeBookmarkTagKey(node.title, node.url)] ?? [];

    if (tags.length === 0) {
      continue;
    }

    nodes[nodeId] = {
      ...node,
      tags
    };
  }
}

async function emitProgress(tracker: ProgressTracker | null): Promise<void> {
  if (!tracker?.onProgress) {
    return;
  }

  await tracker.onProgress({
    processed: tracker.processed,
    total: tracker.total
  });
}

async function markProgress(tracker: ProgressTracker | null): Promise<void> {
  if (!tracker) {
    return;
  }

  tracker.processed += 1;
  await emitProgress(tracker);
}

function detectRootBucket(node: NativeBookmarkTreeNode, index: number): SemanticRoot | null {
  const label = [node.id, node.title ?? ""].filter(Boolean).join(" ");

  if (TOOLBAR_ROOT_PATTERNS.some((pattern) => pattern.test(label))) {
    return "toolbar";
  }

  if (MOBILE_ROOT_PATTERNS.some((pattern) => pattern.test(label))) {
    return "mobile";
  }

  if (UNFILED_ROOT_PATTERNS.some((pattern) => pattern.test(label))) {
    return "unfiled";
  }

  if (MENU_ROOT_PATTERNS.some((pattern) => pattern.test(label))) {
    return "menu";
  }

  if (index === 0) {
    return "toolbar";
  }

  if (index === 1) {
    return "menu";
  }

  if (index === 2) {
    return "mobile";
  }

  return null;
}

function projectNode(
  nativeNode: NativeBookmarkTreeNode,
  nodes: Record<string, BookmarkNode>,
  fallbackTimestamp: string,
  progressTracker: ProgressTracker | null,
  countTowardProgress: boolean
): Promise<string> {
  return projectNodeInternal(nativeNode, nodes, fallbackTimestamp, progressTracker, countTowardProgress);
}

async function projectNodeInternal(
  nativeNode: NativeBookmarkTreeNode,
  nodes: Record<string, BookmarkNode>,
  fallbackTimestamp: string,
  progressTracker: ProgressTracker | null,
  countTowardProgress: boolean
): Promise<string> {
  const addedAt = timestampFromNode(nativeNode, fallbackTimestamp);
  const updatedAt =
    typeof nativeNode.dateGroupModified === "number"
      ? new Date(nativeNode.dateGroupModified).toISOString()
      : addedAt;

  if (nativeNode.url) {
    nodes[nativeNode.id] = {
      id: nativeNode.id,
      type: "bookmark",
      title: nativeNode.title ?? "",
      url: nativeNode.url,
      addedAt,
      updatedAt
    };
    if (countTowardProgress) {
      await markProgress(progressTracker);
    }
    return nativeNode.id;
  }

  const childIds: string[] = [];

  for (const childNode of nativeNode.children ?? []) {
    childIds.push(await projectNodeInternal(childNode, nodes, fallbackTimestamp, progressTracker, true));
  }

  nodes[nativeNode.id] = {
    id: nativeNode.id,
    type: "folder",
    title: nativeNode.title ?? "",
    children: childIds,
    addedAt,
    updatedAt
  };

  if (countTowardProgress) {
    await markProgress(progressTracker);
  }

  return nativeNode.id;
}

async function removeBookmarkNode(id: string, isFolder: boolean): Promise<void> {
  const bookmarksApi = requireBookmarksApi();

  try {
    if (isFolder) {
      await bookmarksApi.removeTree(id);
      return;
    }

    await bookmarksApi.remove(id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (/node cannot be found/i.test(message) || /bookmark .* not found/i.test(message)) {
      return;
    }

    throw error;
  }
}

async function createChildrenFromBundle(
  nativeRootId: string,
  parentId: string,
  childIds: string[],
  bundle: BookmarkBundle,
  progressTracker: ProgressTracker | null
): Promise<void> {
  const bookmarksApi = requireBookmarksApi();

  for (const childId of childIds) {
    const node = bundle.nodes[childId];

    if (!node) {
      continue;
    }

    if (node.type === "bookmark") {
      try {
        await bookmarksApi.create({
          parentId,
          title: node.title,
          url: node.url
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Failed to create bookmark under native root ${nativeRootId} (parent ${parentId}, title "${node.title}"): ${message}`
        );
      }
      await markProgress(progressTracker);
      continue;
    }

    let createdFolder: NativeBookmarkTreeNode;
    try {
      createdFolder = await bookmarksApi.create({
        parentId,
        title: node.title
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to create folder under native root ${nativeRootId} (parent ${parentId}, title "${node.title}"): ${message}`
      );
    }

    await markProgress(progressTracker);
    await createChildrenFromBundle(nativeRootId, createdFolder.id, node.children, bundle, progressTracker);
  }
}

function getGroupedBundleRootIds(
  bundle: BookmarkBundle,
  rootNames: SemanticRoot[]
): string[] {
  const rootIds: string[] = [];
  const seenRootIds = new Set<string>();

  for (const rootName of rootNames) {
    const bundleRootId = bundle.roots[rootName];

    if (!bundleRootId || seenRootIds.has(bundleRootId)) {
      continue;
    }

    seenRootIds.add(bundleRootId);
    rootIds.push(bundleRootId);
  }

  return rootIds;
}

function buildNativeRootGroups(
  nativeRoots: Partial<Record<SemanticRoot, NativeBookmarkTreeNode>>
): Array<{ nativeRoot: NativeBookmarkTreeNode; rootNames: SemanticRoot[] }> {
  const groups = new Map<string, { nativeRoot: NativeBookmarkTreeNode; rootNames: SemanticRoot[] }>();

  for (const rootName of SEMANTIC_ROOT_ORDER) {
    const nativeRoot = nativeRoots[rootName];

    if (!nativeRoot) {
      continue;
    }

    const existing = groups.get(nativeRoot.id);

    if (existing) {
      existing.rootNames.push(rootName);
      continue;
    }

    groups.set(nativeRoot.id, {
      nativeRoot,
      rootNames: [rootName]
    });
  }

  return Array.from(groups.values());
}

async function resolveNativeRoots(): Promise<Partial<Record<SemanticRoot, NativeBookmarkTreeNode>>> {
  const bookmarksApi = requireBookmarksApi();

  try {
    const [treeRoot] = await bookmarksApi.getTree();
    const children = treeRoot.children ?? [];
    const matches = new Map<SemanticRoot, NativeBookmarkTreeNode>();

    children.forEach((node, index) => {
      const bucket = detectRootBucket(node, index);
      if (bucket && !matches.has(bucket)) {
        matches.set(bucket, node);
      }
    });

    return {
      toolbar: matches.get("toolbar") ?? children[0],
      menu: matches.get("menu") ?? children[1],
      mobile: matches.get("mobile") ?? children[2],
      unfiled: matches.get("unfiled")
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to enumerate local bookmark roots: ${message}`);
  }
}

function materializeSyntheticRoot(rootName: SemanticRoot, nodes: Record<string, BookmarkNode>, generatedAt: string): string {
  const rootId = `${SYNTHETIC_ROOT_PREFIX}.${rootName}`;
  nodes[rootId] = {
    id: rootId,
    type: "folder",
    title: SYNTHETIC_ROOT_TITLES[rootName],
    children: [],
    addedAt: generatedAt,
    updatedAt: generatedAt
  };
  return rootId;
}

function createEmptyPrivateBundle(config: SyncConfig): BookmarkBundle {
  const generatedAt = new Date().toISOString();
  const nodes: Record<string, BookmarkNode> = {};

  const toolbarId = materializeSyntheticRoot("toolbar", nodes, generatedAt);
  const menuId = materializeSyntheticRoot("menu", nodes, generatedAt);
  const mobileId = materializeSyntheticRoot("mobile", nodes, generatedAt);
  const unfiledId = materializeSyntheticRoot("unfiled", nodes, generatedAt);

  return normalizeBundle({
    kind: "onesync.bookmarks",
    schemaVersion: 1,
    revision: `${generatedAt}#${config.deviceId}#private`,
    deviceId: config.deviceId,
    generatedAt,
    roots: {
      toolbar: toolbarId,
      menu: menuId,
      mobile: mobileId,
      unfiled: unfiledId
    },
    nodes,
    tombstones: [],
    meta: {
      client: "onesync",
      clientVersion: "0.2.0"
    }
  });
}

async function loadPrivateBookmarkBundle(config: SyncConfig): Promise<BookmarkBundle> {
  const storageArea = requirePrivateBookmarkStorage();
  const storedBundle = await loadStoredBundle(storageArea, PRIVATE_BOOKMARKS_KEY);

  if (storedBundle) {
    const generatedAt = new Date().toISOString();

    return {
      ...storedBundle,
      revision: `${generatedAt}#${config.deviceId}#snapshot`,
      deviceId: config.deviceId,
      generatedAt
    };
  }

  const emptyBundle = createEmptyPrivateBundle(config);
  await saveStoredBundle(storageArea, PRIVATE_BOOKMARKS_KEY, emptyBundle);
  return emptyBundle;
}

async function savePrivateBookmarkBundle(bundle: BookmarkBundle): Promise<BookmarkBundle> {
  const storageArea = requirePrivateBookmarkStorage();
  return saveStoredBundle(storageArea, PRIVATE_BOOKMARKS_KEY, bundle);
}

async function saveNativeFallbackBundle(bundle: BookmarkBundle): Promise<BookmarkBundle> {
  const storageArea = requirePrivateBookmarkStorage();
  return saveStoredBundle(storageArea, PRIVATE_BOOKMARKS_NATIVE_FALLBACK_KEY, bundle);
}

function snapshotSharedBundle(bundle: BookmarkBundle, config: SyncConfig): BookmarkBundle {
  const generatedAt = new Date().toISOString();

  return {
    ...bundle,
    revision: `${generatedAt}#${config.deviceId}#snapshot`,
    deviceId: config.deviceId,
    generatedAt
  };
}

export async function loadSavedSharedBundleFallback(): Promise<BookmarkBundle | null> {
  const storageArea = requirePrivateBookmarkStorage();
  return loadStoredBundle(storageArea, PRIVATE_BOOKMARKS_NATIVE_FALLBACK_KEY);
}

export async function clearSavedSharedBundleFallback(): Promise<void> {
  const storageArea = requirePrivateBookmarkStorage();
  await clearStoredBundle(storageArea, PRIVATE_BOOKMARKS_NATIVE_FALLBACK_KEY);
}

export async function loadSharedBookmarkBundle(
  config: SyncConfig,
  options: BookmarkOperationOptions = {}
): Promise<BookmarkBundle> {
  if (hasBookmarksApi()) {
    let savedFallbackBundle: BookmarkBundle | null = null;

    try {
      savedFallbackBundle = await loadSavedSharedBundleFallback();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message !== BOOKMARKS_API_UNAVAILABLE_MESSAGE) {
        throw error;
      }

      savedFallbackBundle = null;
    }

    if (savedFallbackBundle) {
      const sharedBundle = snapshotSharedBundle(savedFallbackBundle, config);

      if (options.onProgress) {
        const total = countBundleDescendants(sharedBundle, Object.values(sharedBundle.roots));
        await options.onProgress({
          processed: total,
          total
        });
      }

      return sharedBundle;
    }
  }

  return listLocalBookmarks(config, options);
}

export async function listLocalBookmarks(
  config: SyncConfig,
  options: BookmarkOperationOptions = {}
): Promise<BookmarkBundle> {
  try {
    if (!hasBookmarksApi()) {
      const privateBundle = await loadPrivateBookmarkBundle(config);

      if (options.onProgress) {
        await options.onProgress({
          processed: 0,
          total: 0
        });
      }

      return privateBundle;
    }

    const nativeRoots = await resolveNativeRoots();
    const generatedAt = new Date().toISOString();
    const nodes: Record<string, BookmarkNode> = {};
    const countedRootIds = new Set<string>();
    const progressTracker: ProgressTracker | null = options.onProgress
      ? {
          processed: 0,
          total: Object.values(nativeRoots).reduce((total, rootNode) => {
            if (!rootNode || countedRootIds.has(rootNode.id)) {
              return total;
            }

            countedRootIds.add(rootNode.id);
            return total + countNativeDescendants(rootNode.children ?? []);
          }, 0),
          onProgress: options.onProgress
        }
      : null;
    const projectedRootIds = new Set<string>();

    async function projectSemanticRoot(rootName: SemanticRoot, rootNode: NativeBookmarkTreeNode | undefined) {
      if (!rootNode) {
        return materializeSyntheticRoot(rootName, nodes, generatedAt);
      }

      if (projectedRootIds.has(rootNode.id)) {
        return rootNode.id;
      }

      projectedRootIds.add(rootNode.id);
      return projectNode(rootNode, nodes, generatedAt, progressTracker, false);
    }

    const toolbarId = await projectSemanticRoot("toolbar", nativeRoots.toolbar);
    const menuId = await projectSemanticRoot("menu", nativeRoots.menu);
    const mobileId = await projectSemanticRoot("mobile", nativeRoots.mobile);
    const unfiledId = await projectSemanticRoot("unfiled", nativeRoots.unfiled);
    const nativeBookmarkTagIndex = await loadNativeBookmarkTagIndex();

    applyNativeBookmarkTagIndex(nodes, nativeBookmarkTagIndex);

    return normalizeBundle({
      kind: "onesync.bookmarks",
      schemaVersion: 1,
      revision: `${generatedAt}#${config.deviceId}#snapshot`,
      deviceId: config.deviceId,
      generatedAt,
      roots: {
        toolbar: toolbarId,
        menu: menuId,
        mobile: mobileId,
        unfiled: unfiledId
      },
      nodes,
      tombstones: [],
      meta: {
        client: "onesync",
        clientVersion: "0.2.0"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (/^Failed to enumerate local bookmark roots:/i.test(message)) {
      throw error;
    }

    throw new Error(`Failed to scan local bookmarks into OneSync format: ${message}`);
  }
}

export async function applyBundleToBookmarks(
  bundle: BookmarkBundle,
  options: BookmarkOperationOptions = {}
): Promise<void> {
  assertBundleBookmarkUrlsAreSupported(bundle);

  try {
    if (!hasBookmarksApi()) {
      const normalizedBundle = await savePrivateBookmarkBundle(bundle);

      if (options.onProgress) {
        const total = countBundleDescendants(normalizedBundle, Object.values(normalizedBundle.roots));
        await options.onProgress({
          processed: total,
          total
        });
      }

      return;
    }

    const nativeRoots = await resolveNativeRoots();
    const nativeRootGroups = buildNativeRootGroups(nativeRoots);
    const countedNativeRootIds = new Set<string>();
    const progressTracker: ProgressTracker | null = options.onProgress
      ? {
          processed: 0,
          total: nativeRootGroups.reduce((total, group) => {
            if (countedNativeRootIds.has(group.nativeRoot.id)) {
              return total;
            }

            countedNativeRootIds.add(group.nativeRoot.id);

            return (
              total +
              getGroupedBundleRootIds(bundle, group.rootNames).reduce((groupTotal, bundleRootId) => {
                const bundleRootNode = bundle.nodes[bundleRootId];

                if (!bundleRootNode || bundleRootNode.type !== "folder") {
                  return groupTotal;
                }

                return groupTotal + countBundleDescendants(bundle, bundleRootNode.children);
              }, 0)
            );
          }, 0),
          onProgress: options.onProgress
        }
      : null;
    for (const group of nativeRootGroups) {
      const { nativeRoot, rootNames } = group;

      for (const childNode of nativeRoot.children ?? []) {
        await removeBookmarkNode(childNode.id, !childNode.url);
      }

      for (const bundleRootId of getGroupedBundleRootIds(bundle, rootNames)) {
        const bundleRootNode = bundle.nodes[bundleRootId];

        if (!bundleRootNode || bundleRootNode.type !== "folder") {
          continue;
        }

        await createChildrenFromBundle(
          nativeRoot.id,
          nativeRoot.id,
          bundleRootNode.children,
          bundle,
          progressTracker
        );
      }
    }

    await saveNativeBookmarkTagIndex(bundle);
    await clearSavedSharedBundleFallback();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (/^Failed to enumerate local bookmark roots:/i.test(message)) {
      throw new Error(`Failed to enumerate local bookmark roots before apply: ${message}`);
    }

    throw new Error(`Failed to apply bookmark bundle locally: ${message}`);
  }
}

export async function applySharedBundleLocally(
  bundle: BookmarkBundle,
  mode: BookmarkStorageMode,
  options: BookmarkOperationOptions = {}
): Promise<void> {
  if (mode === "unavailable") {
    throw new Error(BOOKMARKS_API_UNAVAILABLE_MESSAGE);
  }

  assertBundleBookmarkUrlsAreSupported(bundle);

  if (mode === "private") {
    await applyBundleToBookmarks(bundle, options);
    await clearSavedSharedBundleFallback();
    return;
  }

  try {
    await applyBundleToBookmarks(bundle, options);
    await clearSavedSharedBundleFallback();
  } catch (error) {
    await saveNativeFallbackBundle(bundle);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Shared data saved, browser bookmarks not updated: ${message}`);
  }
}
