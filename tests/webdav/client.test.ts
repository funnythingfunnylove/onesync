import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EncodedBookmarkBundle } from "../../src/core/format/schema";
import { createWebDavClient } from "../../src/core/webdav/client";

const sampleEncodedBundle: EncodedBookmarkBundle = {
  kind: "onesync.bundle",
  bundleVersion: 1,
  encoding: "base64url+gzip+json",
  checksum: {
    algorithm: "sha256",
    value: "abc123"
  },
  payload: "payload"
};

const newerEncodedBundle: EncodedBookmarkBundle = {
  kind: "onesync.bundle",
  bundleVersion: 1,
  encoding: "base64url+gzip+json",
  checksum: {
    algorithm: "sha256",
    value: "def456"
  },
  payload: "newer-payload"
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("webdav client", () => {
  it("reads latest bundle metadata", async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.endsWith("latest.meta.json")) {
        return new Response("{}", {
          status: 200,
          headers: {
            ETag: "\"meta-etag\""
          }
        });
      }

      return new Response(JSON.stringify(sampleEncodedBundle), {
        status: 200,
        headers: {
          ETag: "\"bundle-etag\""
        }
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = createWebDavClient({
      deviceId: "device-1",
      webdavUrl: "https://dav.example.com",
      username: "alice",
      password: "secret",
      basePath: "/onesync",
      intervalMinutes: 15,
      scheduledSyncEnabled: true,
      allowInsecureHttp: false
    });

    const result = await client.fetchLatestBundle();

    expect(result.bundleEtag).toBe("\"bundle-etag\"");
    expect(result.metadataEtag).toBe("\"meta-etag\"");
    expect(result.bundle).toEqual(sampleEncodedBundle);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("falls back to the newest device revision from history when device metadata is newer than latest metadata", async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.endsWith("latest.meta.json")) {
        return new Response(JSON.stringify({
          revision: "2026-07-01T08:00:00.000Z#device-safari#sync",
          deviceId: "device-safari",
          updatedAt: "2026-07-01T08:00:00.000Z"
        }), {
          status: 200,
          headers: {
            ETag: "\"meta-etag-old\""
          }
        });
      }

      if (url.endsWith("latest.onesync")) {
        return new Response(JSON.stringify(sampleEncodedBundle), {
          status: 200,
          headers: {
            ETag: "\"bundle-etag-old\""
          }
        });
      }

      if (url.endsWith("/devices") && init?.method === "PROPFIND") {
        return new Response(
          `<?xml version="1.0"?>
          <d:multistatus xmlns:d="DAV:">
            <d:response><d:href>/onesync/devices/</d:href></d:response>
            <d:response><d:href>/onesync/devices/device-chrome.json</d:href></d:response>
            <d:response><d:href>/onesync/devices/device-safari.json</d:href></d:response>
          </d:multistatus>`,
          { status: 207 }
        );
      }

      if (url.endsWith("/devices/device-chrome.json")) {
        return new Response(JSON.stringify({
          deviceId: "device-chrome",
          lastRevision: "2026-07-01T09:00:00.000Z#device-chrome#sync",
          updatedAt: "2026-07-01T09:00:00.000Z"
        }), { status: 200 });
      }

      if (url.endsWith("/devices/device-safari.json")) {
        return new Response(JSON.stringify({
          deviceId: "device-safari",
          lastRevision: "2026-07-01T08:00:00.000Z#device-safari#sync",
          updatedAt: "2026-07-01T08:00:00.000Z"
        }), { status: 200 });
      }

      if (url.includes("/history/2026-07-01T09-00-00.000Z#device-chrome#sync.onesync")) {
        return new Response(JSON.stringify(newerEncodedBundle), { status: 200 });
      }

      return new Response("Not Found", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = createWebDavClient({
      deviceId: "device-safari",
      webdavUrl: "https://dav.example.com",
      username: "alice",
      password: "secret",
      basePath: "/onesync",
      intervalMinutes: 15,
      scheduledSyncEnabled: true,
      allowInsecureHttp: false
    });

    const result = await client.fetchLatestBundle();

    expect(result.bundle).toEqual(newerEncodedBundle);
    expect(result.bundleEtag).toBe("\"bundle-etag-old\"");
    expect(result.metadataEtag).toBe("\"meta-etag-old\"");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/onesync/devices"
      }),
      expect.objectContaining({
        method: "PROPFIND"
      })
    );
  });

  it("keeps successful latest-bundle reads when the device metadata listing is denied", async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.endsWith("latest.meta.json")) {
        return new Response(JSON.stringify({
          revision: "2026-07-01T08:00:00.000Z#device-safari#sync",
          deviceId: "device-safari",
          updatedAt: "2026-07-01T08:00:00.000Z"
        }), {
          status: 200,
          headers: {
            ETag: "\"meta-etag\""
          }
        });
      }

      if (url.endsWith("latest.onesync")) {
        return new Response(JSON.stringify(sampleEncodedBundle), {
          status: 200,
          headers: {
            ETag: "\"bundle-etag\""
          }
        });
      }

      if (url.endsWith("/devices") && init?.method === "PROPFIND") {
        return new Response("Forbidden", { status: 403 });
      }

      return new Response("Not Found", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = createWebDavClient({
      deviceId: "device-safari",
      webdavUrl: "https://dav.example.com",
      username: "alice",
      password: "secret",
      basePath: "/onesync",
      intervalMinutes: 15,
      scheduledSyncEnabled: true,
      allowInsecureHttp: false
    });

    await expect(client.fetchLatestBundle()).resolves.toEqual({
      bundleEtag: "\"bundle-etag\"",
      metadataEtag: "\"meta-etag\"",
      bundle: sampleEncodedBundle
    });
  });

  it("rejects insecure HTTP endpoints unless explicitly enabled", () => {
    expect(() =>
      createWebDavClient({
        deviceId: "device-1",
        webdavUrl: "http://dav.example.com",
        username: "alice",
        password: "secret",
        basePath: "/onesync",
        intervalMinutes: 15,
        scheduledSyncEnabled: true,
        allowInsecureHttp: false
      })
    ).toThrow(/insecure http/i);
  });

  it("creates nested WebDAV collections step by step before uploading the first bundle", async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (init?.method === "MKCOL") {
        return new Response(null, { status: 201 });
      }

      if (url.endsWith("latest.onesync") || url.endsWith("history/rev.onesync")) {
        return new Response("{}", { status: 201 });
      }

      return new Response("{}", { status: 201 });
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = createWebDavClient({
      deviceId: "device-1",
      webdavUrl: "https://dav.example.com/root",
      username: "alice",
      password: "secret",
      basePath: "/nested/onesync",
      intervalMinutes: 15,
      scheduledSyncEnabled: true,
      allowInsecureHttp: false
    });

    await client.putLatestBundle(sampleEncodedBundle, "rev", "device-1", null);

    const mkcolUrls = fetchMock.mock.calls
      .filter(([, init]) => init?.method === "MKCOL")
      .map(([input]) => (input instanceof URL ? input.pathname : String(input)));

    expect(mkcolUrls).toEqual([
      "/root/nested",
      "/root/nested/onesync",
      "/root/nested/onesync/history",
      "/root/nested/onesync/devices"
    ]);
  });

  it("uses resource-specific etags when updating the latest bundle and metadata", async () => {
    const fetchMock = vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => {
      if (init?.method === "MKCOL") {
        return new Response(null, { status: 201 });
      }

      return new Response("{}", { status: 200 });
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = createWebDavClient({
      deviceId: "device-1",
      webdavUrl: "https://dav.example.com",
      username: "alice",
      password: "secret",
      basePath: "/onesync",
      intervalMinutes: 15,
      scheduledSyncEnabled: true,
      allowInsecureHttp: false
    });

    await client.putLatestBundle(sampleEncodedBundle, "rev", "device-1", {
      bundle: "\"bundle-etag\"",
      metadata: "\"meta-etag\""
    });

    const latestBundlePut = fetchMock.mock.calls.find(([input, init]) => {
      const url = input instanceof URL ? input.pathname : String(input);
      return url.includes("/latest.onesync") && init?.method === "PUT";
    });
    const latestMetaPut = fetchMock.mock.calls.find(([input, init]) => {
      const url = input instanceof URL ? input.pathname : String(input);
      return url.includes("/latest.meta.json") && init?.method === "PUT";
    });

    expect((latestBundlePut?.[1]?.headers as Headers).get("If-Match")).toBe("\"bundle-etag\"");
    expect((latestMetaPut?.[1]?.headers as Headers).get("If-Match")).toBe("\"meta-etag\"");
  });

  it("wraps fetch transport failures with the failing WebDAV operation and url", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );

    const client = createWebDavClient({
      deviceId: "device-1",
      webdavUrl: "https://dav.example.com/root",
      username: "alice",
      password: "secret",
      basePath: "/onesync",
      intervalMinutes: 15,
      scheduledSyncEnabled: true,
      allowInsecureHttp: false
    });

    await expect(client.fetchLatestBundle()).rejects.toThrow(
      /Unable to reach WebDAV endpoint during fetch latest metadata: https:\/\/dav\.example\.com\/root\/onesync\/latest\.meta\.json/i
    );
  });

  it("times out stalled WebDAV requests instead of hanging indefinitely", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: URL | RequestInfo, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      })
    );

    const client = createWebDavClient({
      deviceId: "device-1",
      webdavUrl: "https://dav.example.com/root",
      username: "alice",
      password: "secret",
      basePath: "/onesync",
      intervalMinutes: 15,
      scheduledSyncEnabled: true,
      allowInsecureHttp: false
    });

    const pendingFetch = expect(client.fetchLatestBundle()).rejects.toThrow(/timed out/i);

    await vi.advanceTimersByTimeAsync(15_000);

    await pendingFetch;
    vi.useRealTimers();
  });

  it("reports a ready WebDAV connection when the endpoint and base path both respond to PROPFIND", async () => {
    const fetchMock = vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => {
      if (init?.method === "PROPFIND") {
        return new Response("<?xml version=\"1.0\"?><D:multistatus/>", { status: 207 });
      }

      return new Response(null, { status: 200 });
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = createWebDavClient({
      deviceId: "device-1",
      webdavUrl: "http://dav.example.com/root",
      username: "alice",
      password: "secret",
      basePath: "/cache/onesync",
      intervalMinutes: 15,
      scheduledSyncEnabled: true,
      allowInsecureHttp: true
    });

    await expect(client.checkConnection()).resolves.toEqual({
      status: "ready",
      message: "WebDAV endpoint reachable. Credentials and base path look usable."
    });
  });

  it("reports that the first sync will initialize the base path when the endpoint is reachable but the base path is missing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("<?xml version=\"1.0\"?><D:multistatus/>", { status: 207 }))
      .mockResolvedValueOnce(new Response("Not Found", { status: 404 }));

    vi.stubGlobal("fetch", fetchMock);

    const client = createWebDavClient({
      deviceId: "device-1",
      webdavUrl: "http://dav.example.com/root",
      username: "alice",
      password: "secret",
      basePath: "/cache/onesync",
      intervalMinutes: 15,
      scheduledSyncEnabled: true,
      allowInsecureHttp: true
    });

    await expect(client.checkConnection()).resolves.toEqual({
      status: "needs-initial-sync",
      message: "WebDAV endpoint reachable. The configured base path will be created during the first sync."
    });
  });

  it("includes the latest bundle URL and conflict hint when the conditional upload is rejected", async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = input instanceof URL ? input.pathname : String(input);

      if (init?.method === "MKCOL") {
        return new Response(null, { status: 405 });
      }

      if (url.includes("/latest.onesync") && init?.method === "PUT") {
        return new Response("Precondition Failed", { status: 412 });
      }

      return new Response("{}", { status: 200 });
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = createWebDavClient({
      deviceId: "device-1",
      webdavUrl: "https://dav.example.com",
      username: "alice",
      password: "secret",
      basePath: "/onesync",
      intervalMinutes: 15,
      scheduledSyncEnabled: true,
      allowInsecureHttp: false
    });

    await expect(
      client.putLatestBundle(sampleEncodedBundle, "rev", "device-1", {
        bundle: "\"bundle-etag\"",
        metadata: "\"meta-etag\""
      })
    ).rejects.toThrow(/latest\.onesync/i);
    await expect(
      client.putLatestBundle(sampleEncodedBundle, "rev", "device-1", {
        bundle: "\"bundle-etag\"",
        metadata: "\"meta-etag\""
      })
    ).rejects.toThrow(/changed on the server/i);
  });

  it("includes the metadata URL when the metadata upload fails", async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = input instanceof URL ? input.pathname : String(input);

      if (init?.method === "MKCOL") {
        return new Response(null, { status: 405 });
      }

      if (url.includes("/latest.meta.json") && init?.method === "PUT") {
        return new Response("Server Error", { status: 500 });
      }

      return new Response("{}", { status: 200 });
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = createWebDavClient({
      deviceId: "device-1",
      webdavUrl: "https://dav.example.com",
      username: "alice",
      password: "secret",
      basePath: "/onesync",
      intervalMinutes: 15,
      scheduledSyncEnabled: true,
      allowInsecureHttp: false
    });

    await expect(
      client.putLatestBundle(sampleEncodedBundle, "rev", "device-1", {
        bundle: "\"bundle-etag\"",
        metadata: "\"meta-etag\""
      })
    ).rejects.toThrow(/latest\.meta\.json/i);
  });
});
