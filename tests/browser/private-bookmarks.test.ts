import { describe, expect, it, vi } from "vitest";

import type { RuntimeMessage } from "../../src/core/shared/types";
import type { SyncConfig } from "../../src/core/state/config";

const storageState: Record<string, unknown> = {};

vi.mock("wxt/browser", () => {
  return {
    browser: {
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
          }
        }
      }
    }
  };
});

import type { BookmarkBundle } from "../../src/core/format/schema";
import { loadPrivateManagerBundle, savePrivateManagerBundle } from "../../src/core/browser/private-bookmarks";

const sampleConfig: SyncConfig = {
  deviceId: "device-1",
  webdavUrl: "https://dav.example.com",
  username: "alice",
  password: "secret",
  basePath: "/onesync",
  intervalMinutes: 15,
  scheduledSyncEnabled: true,
  allowInsecureHttp: false
};

const sampleBundle: BookmarkBundle = {
  kind: "onesync.bookmarks",
  schemaVersion: 1,
  revision: "2026-07-01T00:00:00.000Z#device-1#private",
  deviceId: "device-1",
  generatedAt: "2026-07-01T00:00:00.000Z",
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
      addedAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z"
    },
    "root-menu": {
      id: "root-menu",
      type: "folder",
      title: "Bookmarks Menu",
      children: [],
      addedAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z"
    },
    "root-mobile": {
      id: "root-mobile",
      type: "folder",
      title: "Mobile Bookmarks",
      children: [],
      addedAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z"
    },
    "root-unfiled": {
      id: "root-unfiled",
      type: "folder",
      title: "Unfiled Bookmarks",
      children: [],
      addedAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z"
    }
  },
  tombstones: [],
  meta: {
    client: "onesync",
    clientVersion: "0.1.3"
  }
};

describe("private manager store", () => {
  it("loads a normalized bundle from extension storage", async () => {
    storageState["onesync.privateManagerBundle"] = sampleBundle;

    await expect(loadPrivateManagerBundle(sampleConfig)).resolves.toMatchObject({
      kind: "onesync.bookmarks"
    });
  });

  it("accepts the private bookmark runtime messages", () => {
    const message: RuntimeMessage = { type: "onesync:get-private-bookmarks" };
    expect(message.type).toBe("onesync:get-private-bookmarks");
  });

  it("accepts private bookmark mutation messages", () => {
    const message: RuntimeMessage = {
      type: "onesync:mutate-private-bookmarks",
      payload: {
        operation: {
          type: "move-node",
          nodeId: "node-1",
          destinationFolderId: "folder-1"
        }
      }
    };

    expect(message.payload.operation.type).toBe("move-node");
  });

  it("stores a normalized private bookmark bundle", async () => {
    const saved = await savePrivateManagerBundle(sampleBundle);

    expect(saved).toMatchObject({
      kind: "onesync.bookmarks",
      revision: sampleBundle.revision
    });
    expect(storageState["onesync.privateManagerBundle"]).toMatchObject({
      kind: "onesync.bookmarks",
      revision: sampleBundle.revision
    });
  });
});
