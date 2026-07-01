export const ONESYNC_EXTENSION_NAME = "onesync" as const;

export type BrowserTarget = "chrome" | "firefox" | "safari";

export type SyncIntervalMinutes = 1 | 5 | 15 | 30 | 60;

export type RuntimeMessage =
  | { type: "onesync:get-popup-state" }
  | { type: "onesync:sync-now" }
  | { type: "onesync:get-options-state" }
  | {
      type: "onesync:save-config";
      payload: {
        deviceId: string;
        webdavUrl: string;
        username: string;
        password: string;
        basePath: string;
        intervalMinutes: SyncIntervalMinutes;
        scheduledSyncEnabled: boolean;
        allowInsecureHttp: boolean;
      };
    }
  | {
      type: "onesync:test-webdav-connection";
      payload: {
        deviceId: string;
        webdavUrl: string;
        username: string;
        password: string;
        basePath: string;
        intervalMinutes: SyncIntervalMinutes;
        scheduledSyncEnabled: boolean;
        allowInsecureHttp: boolean;
      };
    }
  | { type: "onesync:export-bundle" }
  | { type: "onesync:import-bundle"; payload: { encodedBundleJson: string } };
