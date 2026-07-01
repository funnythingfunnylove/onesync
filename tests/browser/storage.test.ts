import { beforeEach, describe, expect, it, vi } from "vitest";

type StorageState = Record<string, unknown>;

const storageState: StorageState = {};

vi.mock("webextension-polyfill", () => {
  return {
    default: {
      storage: {
        local: {
          async get(key?: string | string[]) {
            if (!key) {
              return { ...storageState };
            }

            if (Array.isArray(key)) {
              return Object.fromEntries(key.map((item) => [item, storageState[item]]));
            }

            return { [key]: storageState[key] };
          },
          async set(values: Record<string, unknown>) {
            Object.assign(storageState, values);
          },
          async remove(key: string | string[]) {
            for (const item of Array.isArray(key) ? key : [key]) {
              delete storageState[item];
            }
          }
        }
      }
    }
  };
});

import { getBaseSnapshot, setBaseSnapshot } from "../../src/core/browser/storage";
import { getConfig, setConfig, validateSyncConfigForSync } from "../../src/core/state/config";
import type { BookmarkBundle } from "../../src/core/format/schema";

const sampleBundle: BookmarkBundle = {
  kind: "onesync.bookmarks",
  schemaVersion: 1,
  revision: "2026-06-30T12:00:00.000Z#device-1#1",
  deviceId: "device-1",
  generatedAt: "2026-06-30T12:00:00.000Z",
  roots: {
    toolbar: "root-toolbar",
    menu: "root-menu",
    mobile: "root-mobile",
    unfiled: "root-unfiled"
  },
  nodes: {
    "root-toolbar": {
      id: "root-toolbar",
      type: "folder",
      title: "Bookmarks Bar",
      children: [],
      addedAt: "2026-06-30T11:59:00.000Z",
      updatedAt: "2026-06-30T11:59:00.000Z"
    },
    "root-menu": {
      id: "root-menu",
      type: "folder",
      title: "Bookmarks Menu",
      children: [],
      addedAt: "2026-06-30T11:59:00.000Z",
      updatedAt: "2026-06-30T11:59:00.000Z"
    },
    "root-mobile": {
      id: "root-mobile",
      type: "folder",
      title: "Mobile Bookmarks",
      children: [],
      addedAt: "2026-06-30T11:59:00.000Z",
      updatedAt: "2026-06-30T11:59:00.000Z"
    },
    "root-unfiled": {
      id: "root-unfiled",
      type: "folder",
      title: "Other Bookmarks",
      children: [],
      addedAt: "2026-06-30T11:59:00.000Z",
      updatedAt: "2026-06-30T11:59:00.000Z"
    }
  },
  tombstones: [],
  meta: {
    client: "onesync",
    clientVersion: "0.1.0"
  }
};

beforeEach(() => {
  for (const key of Object.keys(storageState)) {
    delete storageState[key];
  }
});

describe("config storage", () => {
  it("persists the sync interval and device id", async () => {
    await setConfig({
      deviceId: "device-1",
      webdavUrl: " https://dav.example.com/onesync/ ",
      username: " alice ",
      password: " secret ",
      basePath: "bookmarks//nested/",
      intervalMinutes: 15,
      scheduledSyncEnabled: true,
      allowInsecureHttp: false
    });

    const config = await getConfig();
    expect(config.intervalMinutes).toBe(15);
    expect(config.deviceId).toBe("device-1");
    expect(config.webdavUrl).toBe("https://dav.example.com/onesync");
    expect(config.username).toBe("alice");
    expect(config.password).toBe("secret");
    expect(config.basePath).toBe("/bookmarks/nested");
  });

  it("rejects sync attempts when the required WebDAV settings are incomplete", () => {
    expect(() =>
      validateSyncConfigForSync({
        deviceId: "device-1",
        webdavUrl: "https://dav.example.com",
        username: "alice",
        password: "",
        basePath: "/onesync",
        intervalMinutes: 15,
        scheduledSyncEnabled: true,
        allowInsecureHttp: false
      })
    ).toThrow(/password/i);
  });

  it("stores and retrieves the base snapshot", async () => {
    await setBaseSnapshot(sampleBundle);

    expect(await getBaseSnapshot()).toEqual(sampleBundle);
  });
});
