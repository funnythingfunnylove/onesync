import type { BookmarkBundle, EncodedBookmarkBundle } from "../format/schema";
import { decodeBundle } from "../format/decode";
import { encodeBundleLocally } from "../format/encode-core";
import { normalizeBundle } from "../format/schema";

type BundleStorageArea = {
  get: (key?: string | string[]) => Promise<Record<string, unknown>>;
  set: (values: Record<string, unknown>) => Promise<void>;
  remove?: (key: string | string[]) => Promise<void>;
};

const BUNDLE_STORAGE_DB_NAME = "onesync.bundle-storage";
const BUNDLE_STORAGE_DB_VERSION = 1;
const BUNDLE_STORAGE_STORE_NAME = "bundles";

let bundleDatabasePromise: Promise<IDBDatabase> | null = null;

function hasIndexedDbSupport(): boolean {
  return typeof indexedDB !== "undefined" && typeof indexedDB.open === "function";
}

function parseStoredBundleValue(storedValue: unknown): Promise<BookmarkBundle> | BookmarkBundle {
  if (
    typeof storedValue === "object" &&
    storedValue !== null &&
    "kind" in storedValue &&
    storedValue.kind === "onesync.bundle"
  ) {
    return decodeBundle(storedValue as EncodedBookmarkBundle);
  }

  return normalizeBundle(storedValue as BookmarkBundle);
}

function openBundleDatabase(): Promise<IDBDatabase> {
  if (!hasIndexedDbSupport()) {
    throw new Error("IndexedDB is unavailable in this runtime.");
  }

  if (!bundleDatabasePromise) {
    bundleDatabasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(BUNDLE_STORAGE_DB_NAME, BUNDLE_STORAGE_DB_VERSION);

      request.onupgradeneeded = () => {
        const database = request.result;

        if (!database.objectStoreNames.contains(BUNDLE_STORAGE_STORE_NAME)) {
          database.createObjectStore(BUNDLE_STORAGE_STORE_NAME);
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        bundleDatabasePromise = null;
        reject(request.error ?? new Error("Failed to open OneSync bundle storage."));
      };
    });
  }

  return bundleDatabasePromise;
}

function readBundleRecord(database: IDBDatabase, key: string): Promise<unknown | undefined> {
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(BUNDLE_STORAGE_STORE_NAME, "readonly")
      .objectStore(BUNDLE_STORAGE_STORE_NAME)
      .get(key);

    request.onsuccess = () => {
      resolve(request.result as unknown | undefined);
    };

    request.onerror = () => {
      reject(request.error ?? new Error(`Failed to read bundle record "${key}".`));
    };
  });
}

function writeBundleRecord(database: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(BUNDLE_STORAGE_STORE_NAME, "readwrite")
      .objectStore(BUNDLE_STORAGE_STORE_NAME)
      .put(value, key);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(request.error ?? new Error(`Failed to write bundle record "${key}".`));
    };
  });
}

function deleteBundleRecord(database: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(BUNDLE_STORAGE_STORE_NAME, "readwrite")
      .objectStore(BUNDLE_STORAGE_STORE_NAME)
      .delete(key);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(request.error ?? new Error(`Failed to delete bundle record "${key}".`));
    };
  });
}

async function clearLocalBundle(storageArea: BundleStorageArea, key: string): Promise<void> {
  if (typeof storageArea.remove === "function") {
    await storageArea.remove(key);
    return;
  }

  await storageArea.set({ [key]: null });
}

async function loadFromIndexedDb(key: string): Promise<BookmarkBundle | null> {
  if (!hasIndexedDbSupport()) {
    return null;
  }

  const storedValue = await readBundleRecord(await openBundleDatabase(), key);

  if (storedValue == null) {
    return null;
  }

  return parseStoredBundleValue(storedValue);
}

export async function loadStoredBundle(
  storageArea: BundleStorageArea,
  key: string
): Promise<BookmarkBundle | null> {
  const indexedDbBundle = await loadFromIndexedDb(key);

  if (indexedDbBundle) {
    return indexedDbBundle;
  }

  const storedValue = (await storageArea.get(key))[key];

  if (!storedValue) {
    return null;
  }

  return parseStoredBundleValue(storedValue);
}

export async function saveStoredBundle(
  storageArea: BundleStorageArea,
  key: string,
  bundle: BookmarkBundle
): Promise<BookmarkBundle> {
  const normalizedBundle = normalizeBundle(bundle);
  const encodedBundle = await encodeBundleLocally(normalizedBundle);

  if (hasIndexedDbSupport()) {
    await writeBundleRecord(await openBundleDatabase(), key, encodedBundle);

    try {
      await clearLocalBundle(storageArea, key);
    } catch {
      // The indexedDB write is already durable. Local cleanup is best-effort migration.
    }

    return normalizedBundle;
  }

  await storageArea.set({ [key]: encodedBundle });
  return normalizedBundle;
}

export async function clearStoredBundle(storageArea: BundleStorageArea, key: string): Promise<void> {
  if (hasIndexedDbSupport()) {
    await deleteBundleRecord(await openBundleDatabase(), key);
  }

  await clearLocalBundle(storageArea, key);
}
