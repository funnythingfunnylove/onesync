let activeSyncPromise: Promise<unknown> | null = null;

export function runSyncSingleFlight<T>(startSync: () => Promise<T>): Promise<T> {
  if (activeSyncPromise) {
    return activeSyncPromise as Promise<T>;
  }

  const syncPromise = startSync().finally(() => {
    if (activeSyncPromise === syncPromise) {
      activeSyncPromise = null;
    }
  });

  activeSyncPromise = syncPromise;
  return syncPromise;
}

export function resetSyncSingleFlightForTests(): void {
  activeSyncPromise = null;
}
