export type WebDavRemotePaths = {
  baseDirectory: string;
  latestBundle: string;
  latestMeta: string;
  historyBundle: string;
  deviceMeta: string;
};

export function buildRemotePaths(basePath: string, revision: string, deviceId: string): WebDavRemotePaths {
  const normalizedBasePath = `/${basePath}`.replace(/\/+/gu, "/").replace(/\/$/u, "");
  const safeRevision = revision.replaceAll(":", "-");

  return {
    baseDirectory: normalizedBasePath,
    latestBundle: `${normalizedBasePath}/latest.onesync`,
    latestMeta: `${normalizedBasePath}/latest.meta.json`,
    historyBundle: `${normalizedBasePath}/history/${safeRevision}.onesync`,
    deviceMeta: `${normalizedBasePath}/devices/${deviceId}.json`
  };
}
