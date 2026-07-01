import { browser } from "wxt/browser";

export type ActivityLogEntry = {
  id: string;
  level: "info" | "error";
  message: string;
  createdAt: string;
};

const ACTIVITY_LOG_KEY = "onesync.activityLog";
const MAX_ACTIVITY_LOG_ENTRIES = 100;

export async function getActivityLog(): Promise<ActivityLogEntry[]> {
  const result = await browser.storage.local.get(ACTIVITY_LOG_KEY);
  return (result[ACTIVITY_LOG_KEY] as ActivityLogEntry[] | undefined) ?? [];
}

export async function appendActivityLog(entry: Omit<ActivityLogEntry, "id">): Promise<void> {
  const currentLog = await getActivityLog();
  const nextLog = [
    {
      ...entry,
      id: crypto.randomUUID()
    },
    ...currentLog
  ].slice(0, MAX_ACTIVITY_LOG_ENTRIES);

  await browser.storage.local.set({ [ACTIVITY_LOG_KEY]: nextLog });
}
