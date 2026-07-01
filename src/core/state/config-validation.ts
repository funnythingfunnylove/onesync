import { ConfigValidationError } from "../shared/errors";
import type { SyncConfig } from "./config";

function normalizeWebDavUrl(value: string): string {
  return value.trim().replace(/\/+$/u, "");
}

function normalizeBasePath(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "/onesync";
  }

  return `/${trimmed}`.replace(/\/+/gu, "/").replace(/\/$/u, "");
}

export function normalizeSyncConfig(config: SyncConfig): SyncConfig {
  return {
    ...config,
    webdavUrl: normalizeWebDavUrl(config.webdavUrl),
    username: config.username.trim(),
    password: config.password.trim(),
    basePath: normalizeBasePath(config.basePath)
  };
}

export function getSyncConfigReadyError(config: SyncConfig): string | null {
  const normalized = normalizeSyncConfig(config);

  if (!normalized.webdavUrl) {
    return "WebDAV URL is required before syncing.";
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(normalized.webdavUrl);
  } catch {
    return "WebDAV URL must be a valid http or https address.";
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return "WebDAV URL must use http or https.";
  }

  if (parsedUrl.protocol === "http:" && !normalized.allowInsecureHttp) {
    return "Enable plain HTTP explicitly before syncing to an insecure WebDAV endpoint.";
  }

  if (!normalized.username) {
    return "Username is required before syncing.";
  }

  if (!normalized.password) {
    return "Password is required before syncing.";
  }

  return null;
}

export function validateSyncConfigForSync(config: SyncConfig): SyncConfig {
  const normalized = normalizeSyncConfig(config);
  const error = getSyncConfigReadyError(normalized);

  if (error) {
    throw new ConfigValidationError(error);
  }

  return normalized;
}
