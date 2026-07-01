import type { EncodedBookmarkBundle } from "../format/schema";
import type { SyncConfig } from "../state/config";
import { buildRemotePaths } from "./paths";

type LatestBundleResponse = {
  bundleEtag: string | null;
  metadataEtag: string | null;
  bundle: EncodedBookmarkBundle | null;
};

type LatestBundleMetadata = {
  revision?: string;
  deviceId?: string;
  updatedAt?: string;
};

type DeviceStateMetadata = {
  deviceId?: string;
  lastRevision?: string;
  updatedAt?: string;
};

type WebDavConnectionCheckResult = {
  status: "ready" | "needs-initial-sync";
  message: string;
};

type LatestResourceEtags = {
  bundle: string | null;
  metadata: string | null;
};

const WEBDAV_REQUEST_TIMEOUT_MS = 15_000;

export type WebDavUploadProgress = {
  completedSteps: number;
  totalSteps: number;
  detail: string;
};

type PutLatestBundleOptions = {
  onProgress?: (progress: WebDavUploadProgress) => void | Promise<void>;
};

function encodeBasicAuth(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = "";

  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }

  return btoa(binary);
}

function toUrl(pathname: string, baseUrl: string): URL {
  return new URL(pathname.replace(/^\//u, ""), `${baseUrl.replace(/\/+$/u, "")}/`);
}

function parseWebDavHrefList(xml: string, baseUrl: URL): URL[] {
  const hrefMatches = xml.matchAll(/<[^>]*href[^>]*>(.*?)<\/[^>]*href>/giu);
  const urls: URL[] = [];

  for (const match of hrefMatches) {
    const href = match[1]?.trim();

    if (!href) {
      continue;
    }

    urls.push(new URL(href, baseUrl));
  }

  return urls;
}

function parseIsoTimestamp(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function isNewerRevisionThanLatest(
  latestMeta: LatestBundleMetadata | null,
  deviceState: DeviceStateMetadata
): boolean {
  if (!deviceState.lastRevision) {
    return false;
  }

  if (!latestMeta?.revision) {
    return true;
  }

  const deviceUpdatedAt = parseIsoTimestamp(deviceState.updatedAt);
  const latestUpdatedAt = parseIsoTimestamp(latestMeta.updatedAt);

  if (deviceUpdatedAt === null) {
    return false;
  }

  if (latestUpdatedAt === null) {
    return deviceState.lastRevision !== latestMeta.revision;
  }

  return deviceUpdatedAt > latestUpdatedAt && deviceState.lastRevision !== latestMeta.revision;
}

async function fetchWebDav(url: URL, init: RequestInit | undefined, operation: string): Promise<Response> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), WEBDAV_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        `Unable to reach WebDAV endpoint during ${operation}: ${url.toString()} (timed out after ${WEBDAV_REQUEST_TIMEOUT_MS}ms)`
      );
    }

    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to reach WebDAV endpoint during ${operation}: ${url.toString()} (${reason})`);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function isSuccessfulProbeStatus(status: number): boolean {
  return (status >= 200 && status < 400) || status === 405;
}

async function probeCollection(url: URL, headers: HeadersInit, operation: string): Promise<Response> {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Depth", "0");

  return fetchWebDav(
    url,
    {
      method: "PROPFIND",
      headers: requestHeaders
    },
    operation
  );
}

async function ensureCollection(url: URL, headers: HeadersInit): Promise<void> {
  const response = await fetchWebDav(
    url,
    {
      method: "MKCOL",
      headers
    },
    `prepare collection ${url.pathname}`
  );

  if (![201, 405].includes(response.status)) {
    throw new Error(`Unable to prepare WebDAV collection: ${url.pathname}`);
  }
}

function createConditionalHeaders(authorization: string, etag: string | null): Headers {
  const headers = new Headers({
    Authorization: authorization,
    "Content-Type": "application/json"
  });

  if (etag) {
    headers.set("If-Match", etag);
  } else {
    headers.set("If-None-Match", "*");
  }

  return headers;
}

async function putJsonDocument(
  url: URL,
  authorization: string,
  body: unknown,
  etag: string | null,
  operation: string
): Promise<void> {
  const response = await fetchWebDav(
    url,
    {
      method: "PUT",
      headers: createConditionalHeaders(authorization, etag),
      body: JSON.stringify(body)
    },
    operation
  );

  if (!response.ok) {
    if (response.status === 412) {
      throw new Error(
        `${operation}: ${response.status} at ${url.toString()}. The remote bookmark bundle changed on the server since the last sync.`
      );
    }

    throw new Error(`${operation}: ${response.status} at ${url.toString()}`);
  }
}

async function putJsonHistoryDocument(
  url: URL,
  authorization: string,
  body: unknown,
  operation: string
): Promise<void> {
  const response = await fetchWebDav(
    url,
    {
      method: "PUT",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    },
    operation
  );

  if (!response.ok) {
    throw new Error(`${operation}: ${response.status} at ${url.toString()}`);
  }
}

async function ensureCollectionTree(url: URL, headers: HeadersInit, existingPrefixPathname: string): Promise<void> {
  const segments = url.pathname.split("/").filter(Boolean);
  const existingPrefixSegments = existingPrefixPathname.split("/").filter(Boolean);
  const baseUrl = new URL(url.origin);

  for (let index = existingPrefixSegments.length; index < segments.length; index += 1) {
    baseUrl.pathname = `/${segments.slice(0, index + 1).join("/")}`;
    await ensureCollection(new URL(baseUrl.toString()), headers);
  }
}

export function createWebDavClient(config: SyncConfig) {
  if (!config.allowInsecureHttp && config.webdavUrl.startsWith("http://")) {
    throw new Error("Insecure HTTP WebDAV endpoints require allowInsecureHttp=true");
  }

  const authorization = `Basic ${encodeBasicAuth(config.username, config.password)}`;
  const baseHeaders: HeadersInit = {
    Authorization: authorization
  };

  return {
    async checkConnection(): Promise<WebDavConnectionCheckResult> {
      const rootUrl = new URL(`${config.webdavUrl.replace(/\/+$/u, "")}/`);
      const baseDirectoryUrl = toUrl(
        buildRemotePaths(config.basePath, "latest", config.deviceId).baseDirectory,
        config.webdavUrl
      );
      const rootResponse = await probeCollection(rootUrl, baseHeaders, "check WebDAV root");

      if (rootResponse.status === 401) {
        throw new Error("WebDAV credentials were rejected while checking the endpoint: 401");
      }

      if (rootResponse.status === 403) {
        throw new Error("WebDAV access was denied while checking the endpoint: 403");
      }

      if (rootResponse.status === 404) {
        throw new Error(`WebDAV URL was not found while checking the endpoint: ${rootUrl.toString()}`);
      }

      if (!isSuccessfulProbeStatus(rootResponse.status)) {
        throw new Error(`WebDAV endpoint check failed: ${rootResponse.status}`);
      }

      const baseResponse = await probeCollection(baseDirectoryUrl, baseHeaders, "check WebDAV base path");

      if (baseResponse.status === 404) {
        return {
          status: "needs-initial-sync",
          message: "WebDAV endpoint reachable. The configured base path will be created during the first sync."
        };
      }

      if (baseResponse.status === 401) {
        throw new Error("WebDAV credentials were rejected while checking the base path: 401");
      }

      if (baseResponse.status === 403) {
        throw new Error("WebDAV access was denied while checking the base path: 403");
      }

      if (!isSuccessfulProbeStatus(baseResponse.status)) {
        throw new Error(`WebDAV base path check failed: ${baseResponse.status}`);
      }

      return {
        status: "ready",
        message: "WebDAV endpoint reachable. Credentials and base path look usable."
      };
    },

    async fetchLatestBundle(): Promise<LatestBundleResponse> {
      const paths = buildRemotePaths(config.basePath, "latest", config.deviceId);
      const latestMetaUrl = toUrl(paths.latestMeta, config.webdavUrl);
      const latestBundleUrl = toUrl(paths.latestBundle, config.webdavUrl);
      const metaResponse = await fetchWebDav(latestMetaUrl, { headers: baseHeaders }, "fetch latest metadata");
      let latestMetadata: LatestBundleMetadata | null = null;
      let latestMetadataEtag: string | null = null;
      let latestBundle: EncodedBookmarkBundle | null = null;
      let latestBundleEtag: string | null = null;

      if (metaResponse.status !== 404) {
        if (!metaResponse.ok) {
          throw new Error(`Failed to fetch WebDAV metadata: ${metaResponse.status}`);
        }

        latestMetadata = (await metaResponse.json()) as LatestBundleMetadata;
        latestMetadataEtag = metaResponse.headers.get("etag");

        const bundleResponse = await fetchWebDav(latestBundleUrl, { headers: baseHeaders }, "fetch latest bundle");

        if (bundleResponse.status !== 404) {
          if (!bundleResponse.ok) {
            throw new Error(`Failed to fetch WebDAV bundle: ${bundleResponse.status}`);
          }

          latestBundleEtag = bundleResponse.headers.get("etag");
          latestBundle = (await bundleResponse.json()) as EncodedBookmarkBundle;
        }
      }

      const devicesDirectoryUrl = toUrl(`${paths.baseDirectory}/devices`, config.webdavUrl);
      const devicesResponse = await fetchWebDav(
        devicesDirectoryUrl,
        {
          method: "PROPFIND",
          headers: {
            ...baseHeaders,
            Depth: "1"
          }
        },
        "fetch device metadata listing"
      );

      if (devicesResponse.status !== 404 && !isSuccessfulProbeStatus(devicesResponse.status)) {
        throw new Error(`Failed to fetch WebDAV device listing: ${devicesResponse.status}`);
      }

      if (devicesResponse.ok) {
        const deviceUrls = parseWebDavHrefList(await devicesResponse.text(), devicesDirectoryUrl)
          .filter((url) => url.pathname !== devicesDirectoryUrl.pathname)
          .filter((url) => url.pathname.endsWith(".json"));

        let newestDeviceState: DeviceStateMetadata | null = null;
        let newestDeviceTimestamp: number | null = null;

        for (const deviceUrl of deviceUrls) {
          const deviceResponse = await fetchWebDav(deviceUrl, { headers: baseHeaders }, "fetch device metadata");

          if (!deviceResponse.ok) {
            continue;
          }

          const deviceState = (await deviceResponse.json()) as DeviceStateMetadata;
          const deviceTimestamp = parseIsoTimestamp(deviceState.updatedAt);

          if (deviceTimestamp === null) {
            continue;
          }

          if (newestDeviceTimestamp === null || deviceTimestamp > newestDeviceTimestamp) {
            newestDeviceTimestamp = deviceTimestamp;
            newestDeviceState = deviceState;
          }
        }

        if (newestDeviceState && isNewerRevisionThanLatest(latestMetadata, newestDeviceState)) {
          const historyBundlePath = buildRemotePaths(
            config.basePath,
            newestDeviceState.lastRevision!,
            config.deviceId
          ).historyBundle;
          const historyBundleUrl = toUrl(historyBundlePath, config.webdavUrl);
          const historyBundleResponse = await fetchWebDav(
            historyBundleUrl,
            { headers: baseHeaders },
            "fetch history bundle"
          );

          if (historyBundleResponse.ok) {
            latestBundle = (await historyBundleResponse.json()) as EncodedBookmarkBundle;
          }
        }
      }

      return {
        bundleEtag: latestBundleEtag,
        metadataEtag: latestMetadataEtag,
        bundle: latestBundle
      };
    },

    async putLatestBundle(
      bundle: EncodedBookmarkBundle,
      revision: string,
      deviceId: string,
      previousEtags: LatestResourceEtags | null,
      options: PutLatestBundleOptions = {}
    ): Promise<void> {
      const paths = buildRemotePaths(config.basePath, revision, deviceId);
      const configuredBaseUrl = new URL(config.webdavUrl);
      const publishProgress = async (completedSteps: number, detail: string) => {
        await options.onProgress?.({
          completedSteps,
          totalSteps: 5,
          detail
        });
      };

      await publishProgress(0, "Preparing WebDAV collections");
      await ensureCollectionTree(
        toUrl(paths.baseDirectory, config.webdavUrl),
        baseHeaders,
        configuredBaseUrl.pathname
      );
      await ensureCollection(toUrl(`${paths.baseDirectory}/history`, config.webdavUrl), baseHeaders);
      await ensureCollection(toUrl(`${paths.baseDirectory}/devices`, config.webdavUrl), baseHeaders);

      const metadataBody = {
        revision,
        deviceId,
        checksum: bundle.checksum,
        updatedAt: new Date().toISOString()
      };

      await publishProgress(1, "Uploading latest bundle to WebDAV");
      await putJsonDocument(
        toUrl(paths.latestBundle, config.webdavUrl),
        authorization,
        bundle,
        previousEtags?.bundle ?? null,
        "Failed to upload latest bundle"
      );

      await publishProgress(2, "Uploading latest metadata to WebDAV");
      await putJsonDocument(
        toUrl(paths.latestMeta, config.webdavUrl),
        authorization,
        metadataBody,
        previousEtags?.metadata ?? null,
        "Failed to upload latest metadata"
      );

      await publishProgress(3, "Writing history snapshot to WebDAV");
      await putJsonHistoryDocument(
        toUrl(paths.historyBundle, config.webdavUrl),
        authorization,
        bundle,
        "Failed to upload history bundle"
      );

      await publishProgress(4, "Updating device state on WebDAV");
      await putJsonHistoryDocument(
        toUrl(paths.deviceMeta, config.webdavUrl),
        authorization,
        {
          deviceId,
          lastRevision: revision,
          updatedAt: new Date().toISOString()
        },
        "Failed to upload device metadata"
      );
    }
  };
}
