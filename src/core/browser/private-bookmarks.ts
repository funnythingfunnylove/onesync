import { browser } from "wxt/browser";
import { normalizeBundle, type BookmarkBundle } from "../format/schema";
import type { SyncConfig } from "../state/config";

const PRIVATE_MANAGER_BUNDLE_KEY = "onesync.privateManagerBundle";

function createEmptyPrivateManagerBundle(config: SyncConfig): BookmarkBundle {
  const generatedAt = new Date().toISOString();

  return normalizeBundle({
    kind: "onesync.bookmarks",
    schemaVersion: 1,
    revision: `${generatedAt}#${config.deviceId}#private`,
    deviceId: config.deviceId,
    generatedAt,
    roots: {
      toolbar: "onesync.synthetic.toolbar",
      menu: "onesync.synthetic.menu",
      mobile: "onesync.synthetic.mobile",
      unfiled: "onesync.synthetic.unfiled"
    },
    nodes: {
      "onesync.synthetic.toolbar": {
        id: "onesync.synthetic.toolbar",
        type: "folder",
        title: "Bookmarks Bar",
        children: [],
        addedAt: generatedAt,
        updatedAt: generatedAt
      },
      "onesync.synthetic.menu": {
        id: "onesync.synthetic.menu",
        type: "folder",
        title: "Bookmarks Menu",
        children: [],
        addedAt: generatedAt,
        updatedAt: generatedAt
      },
      "onesync.synthetic.mobile": {
        id: "onesync.synthetic.mobile",
        type: "folder",
        title: "Mobile Bookmarks",
        children: [],
        addedAt: generatedAt,
        updatedAt: generatedAt
      },
      "onesync.synthetic.unfiled": {
        id: "onesync.synthetic.unfiled",
        type: "folder",
        title: "Unfiled Bookmarks",
        children: [],
        addedAt: generatedAt,
        updatedAt: generatedAt
      }
    },
    tombstones: [],
    meta: {
      client: "onesync",
      clientVersion: "0.1.3"
    }
  });
}

export async function loadPrivateManagerBundle(config: SyncConfig): Promise<BookmarkBundle> {
  const result = await browser.storage.local.get(PRIVATE_MANAGER_BUNDLE_KEY);
  const bundle = result[PRIVATE_MANAGER_BUNDLE_KEY] as BookmarkBundle | undefined;

  if (bundle) {
    return normalizeBundle(bundle);
  }

  const emptyBundle = createEmptyPrivateManagerBundle(config);
  await browser.storage.local.set({ [PRIVATE_MANAGER_BUNDLE_KEY]: emptyBundle });
  return emptyBundle;
}

export async function savePrivateManagerBundle(bundle: BookmarkBundle): Promise<BookmarkBundle> {
  const normalized = normalizeBundle(bundle);
  await browser.storage.local.set({ [PRIVATE_MANAGER_BUNDLE_KEY]: normalized });
  return normalized;
}
