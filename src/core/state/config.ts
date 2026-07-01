import browser from "webextension-polyfill";
import type { SyncIntervalMinutes } from "../shared/types";
export {
  getSyncConfigReadyError,
  normalizeSyncConfig,
  validateSyncConfigForSync
} from "./config-validation";
import { normalizeSyncConfig } from "./config-validation";

export type SyncConfig = {
  deviceId: string;
  webdavUrl: string;
  username: string;
  password: string;
  basePath: string;
  intervalMinutes: SyncIntervalMinutes;
  scheduledSyncEnabled: boolean;
  allowInsecureHttp: boolean;
};

const CONFIG_KEY = "onesync.config";

function createDefaultConfig(): SyncConfig {
  return {
    deviceId: crypto.randomUUID(),
    webdavUrl: "",
    username: "",
    password: "",
    basePath: "/onesync",
    intervalMinutes: 15,
    scheduledSyncEnabled: false,
    allowInsecureHttp: false
  };
}

export async function getConfig(): Promise<SyncConfig> {
  const result = await browser.storage.local.get(CONFIG_KEY);
  const storedConfig = result[CONFIG_KEY] as Partial<SyncConfig> | undefined;

  if (!storedConfig) {
    const defaults = createDefaultConfig();
    await setConfig(defaults);
    return normalizeSyncConfig(defaults);
  }

  if (!storedConfig.deviceId) {
    const upgradedConfig = {
      ...createDefaultConfig(),
      ...storedConfig,
      deviceId: crypto.randomUUID()
    } satisfies SyncConfig;
    await setConfig(upgradedConfig);
    return normalizeSyncConfig(upgradedConfig);
  }

  return normalizeSyncConfig({
    ...createDefaultConfig(),
    ...storedConfig,
    deviceId: storedConfig.deviceId
  } satisfies SyncConfig);
}

export async function setConfig(config: SyncConfig): Promise<void> {
  await browser.storage.local.set({ [CONFIG_KEY]: normalizeSyncConfig(config) });
}
