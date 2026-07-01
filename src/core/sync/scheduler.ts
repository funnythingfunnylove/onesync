import { clearAlarm, createPeriodicAlarm, getAlarm } from "../browser/alarms";
import { appendActivityLog } from "../state/activity-log";
import { getConfig } from "../state/config";
import { setSyncState } from "../state/sync-state";
import { runSyncSingleFlight } from "./singleflight";
import { syncOnce } from "./sync-engine";

export const PERIODIC_SYNC_ALARM = "onesync.periodic-sync";

export async function ensureSyncAlarm(): Promise<void> {
  const config = await getConfig();
  const existingAlarm = await getAlarm(PERIODIC_SYNC_ALARM);

  if (!config.scheduledSyncEnabled) {
    return;
  }

  if (!existingAlarm || existingAlarm.periodInMinutes !== config.intervalMinutes) {
    await createPeriodicAlarm(PERIODIC_SYNC_ALARM, config.intervalMinutes);
  }
}

export async function clearSyncAlarm(): Promise<void> {
  await clearAlarm(PERIODIC_SYNC_ALARM);
}

export async function reconcileSyncAlarm(): Promise<void> {
  const config = await getConfig();
  const existingAlarm = await getAlarm(PERIODIC_SYNC_ALARM);

  if (!config.scheduledSyncEnabled) {
    if (existingAlarm) {
      await clearSyncAlarm();
    }
    return;
  }

  if (!existingAlarm || existingAlarm.periodInMinutes !== config.intervalMinutes) {
    await ensureSyncAlarm();
  }
}

export async function runScheduledSync(): Promise<void> {
  const config = await getConfig();

  try {
    await runSyncSingleFlight(() => syncOnce(config));
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
  }
}
