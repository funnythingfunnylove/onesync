import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeBundle } from "../../src/core/format/decode";
import { encodeBundle } from "../../src/core/format/encode";
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

describe("bundle codec", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips a canonical bundle", async () => {
    const encoded = await encodeBundle(sampleBundle);
    const decoded = await decodeBundle(encoded);

    expect(decoded).toEqual(sampleBundle);
  });

  it("round-trips without browser compression or FileReader APIs", async () => {
    vi.stubGlobal("CompressionStream", undefined);
    vi.stubGlobal("DecompressionStream", undefined);
    vi.stubGlobal("FileReader", undefined);

    const encoded = await encodeBundle(sampleBundle);
    const decoded = await decodeBundle(encoded);

    expect(decoded).toEqual(sampleBundle);
  });

  it("reports each encoding stage in order", async () => {
    const progressDetails: string[] = [];

    await encodeBundle(sampleBundle, {
      onProgress(progress) {
        progressDetails.push(progress.detail);
      }
    });

    expect(progressDetails).toEqual([
      "Normalizing bookmark snapshot",
      "Serializing bookmark snapshot",
      "Compressing bookmark snapshot",
      "Encoding WebDAV payload",
      "Calculating bundle checksum"
    ]);
  });

  it("rejects payloads with a bad checksum", async () => {
    const encoded = await encodeBundle(sampleBundle);

    await expect(
      decodeBundle({
        ...encoded,
        checksum: {
          ...encoded.checksum,
          value: "deadbeef"
        }
      })
    ).rejects.toThrow(/checksum/i);
  });

  it("rejects payloads with an unsupported bundle version", async () => {
    const encoded = await encodeBundle(sampleBundle);

    await expect(
      decodeBundle({
        ...encoded,
        bundleVersion: 999
      })
    ).rejects.toThrow(/bundle version/i);
  });
});
