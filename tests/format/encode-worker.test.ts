import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BookmarkBundle, EncodedBookmarkBundle } from "../../src/core/format/schema";

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
      children: ["bookmark-1"],
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
    },
    "bookmark-1": {
      id: "bookmark-1",
      type: "bookmark",
      title: "Example",
      url: "https://example.com/",
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

const encodedResult: EncodedBookmarkBundle = {
  kind: "onesync.bundle",
  bundleVersion: 1,
  encoding: "base64url+gzip+json",
  checksum: {
    algorithm: "sha256",
    value: "abc123"
  },
  payload: "payload"
};

describe("bundle encoding worker path", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("document", {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses a worker in document contexts and forwards progress messages", async () => {
    const progressDetails: string[] = [];

    class MockWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;

      postMessage(_message: unknown) {
        queueMicrotask(() => {
          this.onmessage?.({
            data: {
              type: "progress",
              detail: "Compressing bookmark snapshot"
            }
          } as MessageEvent);
          this.onmessage?.({
            data: {
              type: "result",
              encodedBundle: encodedResult
            }
          } as MessageEvent);
        });
      }

      terminate() {
        return;
      }
    }

    vi.stubGlobal("Worker", MockWorker);

    const { encodeBundle } = await import("../../src/core/format/encode");

    await expect(
      encodeBundle(sampleBundle, {
        onProgress(progress) {
          progressDetails.push(progress.detail);
        }
      })
    ).resolves.toEqual(encodedResult);

    expect(progressDetails).toContain("Compressing bookmark snapshot");
  });
});
