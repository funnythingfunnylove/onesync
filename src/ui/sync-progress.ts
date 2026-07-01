import type { SyncState } from "../core/state/sync-state";

function clampPercentage(processed: number, total: number): number | null {
  if (total <= 0) {
    return null;
  }

  const ratio = Math.max(0, Math.min(1, processed / total));
  return Math.round(ratio * 100);
}

function formatCountLabel(prefix: string, processed: number, total: number): string {
  if (total <= 0) {
    return `${prefix} 0 bookmark items`;
  }

  return `${prefix} ${processed} of ${total} bookmark items`;
}

export function formatSyncStatusLabel(syncState: SyncState): string {
  if (syncState.status !== "running") {
    return syncState.status === "idle" ? "Idle" : syncState.status;
  }

  return syncState.progress?.detail ?? "Syncing bookmarks";
}

export function formatSyncProgressLabel(syncState: SyncState): string | null {
  const progress = syncState.progress;

  if (!progress) {
    return null;
  }

  if (progress.phase === "applying-remote") {
    return formatCountLabel("Applied", progress.processed, progress.total);
  }

  return formatCountLabel("Backed up", progress.processed, progress.total);
}

export function getSyncProgressPercent(syncState: SyncState): number | null {
  const progress = syncState.progress;

  if (!progress) {
    return null;
  }

  return clampPercentage(progress.processed, progress.total);
}
