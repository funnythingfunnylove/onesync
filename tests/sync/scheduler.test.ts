import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  alarmsCreate,
  alarmsClear,
  alarmsGet,
  getConfig,
  syncOnce,
  setSyncState,
  appendActivityLog
} = vi.hoisted(() => ({
  alarmsCreate: vi.fn(),
  alarmsClear: vi.fn(),
  alarmsGet: vi.fn(),
  getConfig: vi.fn(),
  syncOnce: vi.fn(),
  setSyncState: vi.fn(),
  appendActivityLog: vi.fn()
}));

vi.mock("wxt/browser", () => ({
  browser: {
    alarms: {
      create: alarmsCreate,
      clear: alarmsClear,
      get: alarmsGet
    }
  }
}));

vi.mock("../../src/core/state/config", () => ({
  getConfig
}));

vi.mock("../../src/core/sync/sync-engine", () => ({
  syncOnce
}));

vi.mock("../../src/core/state/sync-state", () => ({
  setSyncState
}));

vi.mock("../../src/core/state/activity-log", () => ({
  appendActivityLog
}));

import { PERIODIC_SYNC_ALARM, reconcileSyncAlarm, runScheduledSync } from "../../src/core/sync/scheduler";

beforeEach(() => {
  vi.clearAllMocks();
  syncOnce.mockResolvedValue({ status: "uploaded", revision: "rev-1" });
});

describe("scheduler", () => {
  it("uses a stable alarm name", () => {
    expect(PERIODIC_SYNC_ALARM).toBe("onesync.periodic-sync");
  });

  it("creates the periodic alarm when scheduled sync is enabled", async () => {
    getConfig.mockResolvedValue({
      deviceId: "device-1",
      webdavUrl: "https://dav.example.com",
      username: "alice",
      password: "secret",
      basePath: "/onesync",
      intervalMinutes: 15,
      scheduledSyncEnabled: true,
      allowInsecureHttp: false
    });
    alarmsGet.mockResolvedValue(undefined);

    await reconcileSyncAlarm();

    expect(alarmsCreate).toHaveBeenCalledWith(PERIODIC_SYNC_ALARM, {
      delayInMinutes: 15,
      periodInMinutes: 15
    });
  });

  it("clears the periodic alarm when scheduled sync is disabled", async () => {
    getConfig.mockResolvedValue({
      deviceId: "device-1",
      webdavUrl: "https://dav.example.com",
      username: "alice",
      password: "secret",
      basePath: "/onesync",
      intervalMinutes: 15,
      scheduledSyncEnabled: false,
      allowInsecureHttp: false
    });
    alarmsGet.mockResolvedValue({ name: PERIODIC_SYNC_ALARM });

    await reconcileSyncAlarm();

    expect(alarmsClear).toHaveBeenCalledWith(PERIODIC_SYNC_ALARM);
  });

  it("runs scheduled sync directly in the service worker", async () => {
    getConfig.mockResolvedValue({
      deviceId: "device-1",
      webdavUrl: "http://dav.example.test:5005",
      username: "admin",
      password: "secret",
      basePath: "/cache/onesync",
      intervalMinutes: 15,
      scheduledSyncEnabled: true,
      allowInsecureHttp: true
    });

    await runScheduledSync();

    expect(syncOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        webdavUrl: "http://dav.example.test:5005"
      })
    );
  });

  it("records an error when service-worker sync fails", async () => {
    getConfig.mockResolvedValue({
      deviceId: "device-1",
      webdavUrl: "http://dav.example.test:5005",
      username: "admin",
      password: "secret",
      basePath: "/cache/onesync",
      intervalMinutes: 15,
      scheduledSyncEnabled: true,
      allowInsecureHttp: true
    });
    syncOnce.mockRejectedValue(new Error("service worker sync failed"));

    await expect(runScheduledSync()).rejects.toThrow(/service worker sync failed/i);

    expect(setSyncState).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        lastError: "service worker sync failed"
      })
    );
    expect(appendActivityLog).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "error",
        message: "service worker sync failed"
      })
    );
  });
});
