import { applyBundleToBookmarks, listLocalBookmarks } from "../browser/bookmarks";
import { getBaseSnapshot, setBaseSnapshot, setRecoverySnapshot } from "../browser/storage";
import { decodeBundle } from "../format/decode";
import { encodeBundle } from "../format/encode";
import { countBookmarkItems, type BookmarkBundle } from "../format/schema";
import { appendActivityLog } from "../state/activity-log";
import type { SyncConfig } from "../state/config";
import { validateSyncConfigForSync } from "../state/config-validation";
import { setSyncState, type SyncProgress, type SyncState } from "../state/sync-state";
import { createWebDavClient } from "../webdav/client";
import { diffBundles } from "./diff";
import { mergeBundles } from "./merge";

function createRevision(deviceId: string): string {
  return `${new Date().toISOString()}#${deviceId}#sync`;
}

function withRevision(bundle: BookmarkBundle, deviceId: string): BookmarkBundle {
  const generatedAt = new Date().toISOString();
  return {
    ...bundle,
    revision: createRevision(deviceId),
    deviceId,
    generatedAt
  };
}

function hasChanges(changeSet: {
  addedNodeIds: string[];
  updatedNodeIds: string[];
  deletedNodeIds: string[];
}): boolean {
  return (
    changeSet.addedNodeIds.length > 0 ||
    changeSet.updatedNodeIds.length > 0 ||
    changeSet.deletedNodeIds.length > 0
  );
}

function hasMeaningfulChangesWithoutBase(bundle: BookmarkBundle): boolean {
  return countBookmarkItems(bundle) > 0 || bundle.tombstones.length > 0;
}

function getProgressBucket(progress: SyncProgress): number {
  if (progress.total <= 0) {
    return progress.processed;
  }

  const bucketSize = Math.max(1, Math.ceil(progress.total / 10));
  return Math.floor(progress.processed / bucketSize);
}

function shouldPublishProgress(previous: SyncProgress | null, next: SyncProgress): boolean {
  if (!previous) {
    return true;
  }

  if (previous.phase !== next.phase || previous.total !== next.total || previous.detail !== next.detail) {
    return true;
  }

  if (next.processed === 0 || next.processed >= next.total) {
    return true;
  }

  if (next.processed - previous.processed >= 25) {
    return true;
  }

  return getProgressBucket(previous) !== getProgressBucket(next);
}

const RUNNING_SYNC_HEARTBEAT_MS = 10_000;

async function setRunningSyncState(progress: SyncProgress): Promise<void> {
  await setSyncState({
    lastSyncAt: new Date().toISOString(),
    lastSuccessfulSyncAt: null,
    lastRevision: null,
    status: "running",
    lastError: null,
    progress
  } satisfies SyncState);
}

function createProgressWriter() {
  let lastPublishedProgress: SyncProgress | null = null;
  let latestProgress: SyncProgress | null = null;
  const heartbeatHandle = setInterval(() => {
    if (!latestProgress) {
      return;
    }

    void setRunningSyncState(latestProgress);
  }, RUNNING_SYNC_HEARTBEAT_MS);

  return {
    stop() {
      clearInterval(heartbeatHandle);
    },
    async write(progress: SyncProgress): Promise<void> {
      latestProgress = progress;

      if (!shouldPublishProgress(lastPublishedProgress, progress)) {
        return;
      }

      lastPublishedProgress = progress;
      await setRunningSyncState(progress);
    }
  };
}

export async function syncOnce(config: SyncConfig): Promise<{
  status: "idle" | "uploaded" | "downloaded" | "merged";
  revision: string | null;
}> {
  const validatedConfig = validateSyncConfigForSync(config);
  const progressWriter = createProgressWriter();
  const writeProgress = progressWriter.write;

  await writeProgress({
    phase: "scanning-local",
    processed: 0,
    total: 0,
    detail: "Scanning local bookmarks"
  });

  try {
    let localBookmarkProgress = {
      processed: 0,
      total: 0
    };
    const localBundle = await listLocalBookmarks(validatedConfig, {
      onProgress: async (progress) => {
        localBookmarkProgress = progress;
        await writeProgress({
          phase: "scanning-local",
          processed: progress.processed,
          total: progress.total,
          detail: "Scanning local bookmarks"
        });
      }
    });
    const localBookmarkTotal =
      localBookmarkProgress.total > 0 ? localBookmarkProgress.total : countBookmarkItems(localBundle);

    await setRecoverySnapshot(localBundle);
    await writeProgress({
      phase: "fetching-remote",
      processed: localBookmarkProgress.processed,
      total: localBookmarkTotal,
      detail: "Checking remote WebDAV state"
    });

    const client = createWebDavClient(validatedConfig);
    const baseSnapshot = await getBaseSnapshot();
    const remoteResponse = await client.fetchLatestBundle();

    if (!remoteResponse.bundle) {
      const encodedLocalBundle = await encodeBundle(localBundle, {
        onProgress: async (progress) => {
          await writeProgress({
            phase: "uploading-remote",
            processed: 0,
            total: localBookmarkTotal,
            detail: progress.detail
          });
        }
      });
      await client.putLatestBundle(
        encodedLocalBundle,
        localBundle.revision,
        localBundle.deviceId,
        null,
        {
          onProgress: async (progress) => {
            await writeProgress({
              phase: "uploading-remote",
              processed: localBookmarkTotal,
              total: localBookmarkTotal,
              detail: progress.detail
            });
          }
        }
      );
      await setBaseSnapshot(localBundle);
      await setSyncState({
        lastSyncAt: new Date().toISOString(),
        lastSuccessfulSyncAt: new Date().toISOString(),
        lastRevision: localBundle.revision,
        status: "uploaded",
        lastError: null,
        progress: null
      });
      await appendActivityLog({
        level: "info",
        message: "Uploaded initial bookmark bundle to WebDAV.",
        createdAt: new Date().toISOString()
      });
      return {
        status: "uploaded",
        revision: localBundle.revision
      };
    }

    const remoteBundle = await decodeBundle(remoteResponse.bundle);
    const mergedBundle = withRevision(
      mergeBundles(baseSnapshot, localBundle, remoteBundle),
      validatedConfig.deviceId
    );
    const localChanges = diffBundles(baseSnapshot, localBundle);
    const remoteChanges = diffBundles(baseSnapshot, remoteBundle);
    const hasLocalChanges = baseSnapshot
      ? hasChanges(localChanges)
      : hasMeaningfulChangesWithoutBase(localBundle);
    const hasRemoteChanges = baseSnapshot
      ? hasChanges(remoteChanges)
      : hasMeaningfulChangesWithoutBase(remoteBundle);

    if (!hasLocalChanges && !hasRemoteChanges) {
      await setBaseSnapshot(remoteBundle);
      await setSyncState({
        lastSyncAt: new Date().toISOString(),
        lastSuccessfulSyncAt: new Date().toISOString(),
        lastRevision: remoteBundle.revision,
        status: "idle",
        lastError: null,
        progress: null
      });
      await appendActivityLog({
        level: "info",
        message: "No bookmark changes detected during sync.",
        createdAt: new Date().toISOString()
      });
      return {
        status: "idle",
        revision: remoteBundle.revision
      };
    }

    if (!hasLocalChanges && hasRemoteChanges) {
      const remoteBookmarkTotal = countBookmarkItems(remoteBundle);
      await writeProgress({
        phase: "applying-remote",
        processed: 0,
        total: remoteBookmarkTotal,
        detail: "Applying remote bookmarks locally"
      });
      await appendActivityLog({
        level: "info",
        message: "Applying remote bookmark bundle locally.",
        createdAt: new Date().toISOString()
      });
      await applyBundleToBookmarks(remoteBundle, {
        onProgress: async (progress) => {
          await writeProgress({
            phase: "applying-remote",
            processed: progress.processed,
            total: progress.total,
            detail: "Applying remote bookmarks locally"
          });
        }
      });
      await appendActivityLog({
        level: "info",
        message: "Applied remote bookmark bundle locally.",
        createdAt: new Date().toISOString()
      });
      await setBaseSnapshot(remoteBundle);
      await setSyncState({
        lastSyncAt: new Date().toISOString(),
        lastSuccessfulSyncAt: new Date().toISOString(),
        lastRevision: remoteBundle.revision,
        status: "downloaded",
        lastError: null,
        progress: null
      });
      await appendActivityLog({
        level: "info",
        message: "Downloaded remote bookmark changes from WebDAV.",
        createdAt: new Date().toISOString()
      });
      return {
        status: "downloaded",
        revision: remoteBundle.revision
      };
    }

    await writeProgress({
      phase: "merging",
      processed: localBookmarkProgress.processed,
      total: localBookmarkTotal,
      detail: "Reconciling local and remote bookmark changes"
    });
    await appendActivityLog({
      level: "info",
      message: "Applying merged bookmark bundle locally.",
      createdAt: new Date().toISOString()
    });
    await applyBundleToBookmarks(mergedBundle, {
      onProgress: async (progress) => {
        await writeProgress({
          phase: "applying-remote",
          processed: progress.processed,
          total: progress.total,
          detail: "Applying merged bookmarks locally"
        });
      }
    });
    await appendActivityLog({
      level: "info",
      message: "Applied merged bookmark bundle locally.",
      createdAt: new Date().toISOString()
    });
    await setBaseSnapshot(mergedBundle);

    const mergedBookmarkTotal = countBookmarkItems(mergedBundle);
    const encodedMergedBundle = await encodeBundle(mergedBundle, {
      onProgress: async (progress) => {
        await writeProgress({
          phase: "uploading-remote",
          processed: 0,
          total: mergedBookmarkTotal,
          detail: progress.detail
        });
      }
    });
    await client.putLatestBundle(
      encodedMergedBundle,
      mergedBundle.revision,
      mergedBundle.deviceId,
      {
        bundle: remoteResponse.bundleEtag,
        metadata: remoteResponse.metadataEtag
      },
      {
        onProgress: async (progress) => {
          await writeProgress({
            phase: "uploading-remote",
            processed: mergedBookmarkTotal,
            total: mergedBookmarkTotal,
            detail: progress.detail
          });
        }
      }
    );

    await setSyncState({
      lastSyncAt: new Date().toISOString(),
      lastSuccessfulSyncAt: new Date().toISOString(),
      lastRevision: mergedBundle.revision,
      status: "merged",
      lastError: null,
      progress: null
    });
    await appendActivityLog({
      level: "info",
      message: "Merged local and remote bookmark changes.",
      createdAt: new Date().toISOString()
    });

    return {
      status: "merged",
      revision: mergedBundle.revision
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await setSyncState({
      lastSyncAt: new Date().toISOString(),
      lastSuccessfulSyncAt: null,
      lastRevision: null,
      status: "error",
      lastError: message,
      progress: null
    });
    await appendActivityLog({
      level: "error",
      message,
      createdAt: new Date().toISOString()
    });
    throw error;
  } finally {
    progressWriter.stop();
  }
}
