type StoredDatabase = {
  version: number;
  stores: Map<string, Map<string, unknown>>;
};

type MockIndexedDbController = {
  read(storeName: string, key: string): unknown;
  uninstall(): void;
};

function cloneValue<T>(value: T): T {
  if (value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function createRequest<T>() {
  return {
    result: undefined as T | undefined,
    error: null as Error | null,
    onsuccess: null as ((event: Event) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    onupgradeneeded: null as ((event: Event) => void) | null
  };
}

export function installMockIndexedDb(): MockIndexedDbController {
  const originalIndexedDb = (globalThis as { indexedDB?: unknown }).indexedDB;
  const databases = new Map<string, StoredDatabase>();

  const indexedDb = {
    open(name: string, version?: number) {
      const request = createRequest<IDBDatabase>();

      queueMicrotask(() => {
        let database = databases.get(name);
        const requestedVersion = version ?? 1;
        const needsUpgrade = !database || requestedVersion > database.version;

        if (!database) {
          database = {
            version: requestedVersion,
            stores: new Map()
          };
          databases.set(name, database);
        } else if (requestedVersion > database.version) {
          database.version = requestedVersion;
        }

        const databaseFacade = {
          createObjectStore(storeName: string) {
            if (!database!.stores.has(storeName)) {
              database!.stores.set(storeName, new Map());
            }

            return createObjectStoreFacade(database!, storeName);
          },
          transaction(storeName: string) {
            return {
              objectStore() {
                return createObjectStoreFacade(database!, storeName);
              }
            };
          },
          objectStoreNames: {
            contains(storeName: string) {
              return database!.stores.has(storeName);
            }
          }
        } as unknown as IDBDatabase;

        request.result = databaseFacade;

        if (needsUpgrade) {
          request.onupgradeneeded?.({ target: request } as unknown as Event);
        }

        request.onsuccess?.({ target: request } as unknown as Event);
      });

      return request as unknown as IDBOpenDBRequest;
    }
  };

  function createObjectStoreFacade(database: StoredDatabase, storeName: string) {
    if (!database.stores.has(storeName)) {
      database.stores.set(storeName, new Map());
    }

    const store = database.stores.get(storeName)!;

    return {
      get(key: string) {
        const request = createRequest<unknown>();

        queueMicrotask(() => {
          request.result = cloneValue(store.get(key));
          request.onsuccess?.({ target: request } as unknown as Event);
        });

        return request as unknown as IDBRequest;
      },
      put(value: unknown, key: string) {
        const request = createRequest<IDBValidKey>();

        queueMicrotask(() => {
          store.set(key, cloneValue(value));
          request.result = key;
          request.onsuccess?.({ target: request } as unknown as Event);
        });

        return request as unknown as IDBRequest;
      },
      delete(key: string) {
        const request = createRequest<undefined>();

        queueMicrotask(() => {
          store.delete(key);
          request.result = undefined;
          request.onsuccess?.({ target: request } as unknown as Event);
        });

        return request as unknown as IDBRequest;
      }
    } as unknown as IDBObjectStore;
  }

  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    writable: true,
    value: indexedDb
  });

  return {
    read(storeName: string, key: string) {
      return cloneValue(databases.get("onesync.bundle-storage")?.stores.get(storeName)?.get(key));
    },
    uninstall() {
      Object.defineProperty(globalThis, "indexedDB", {
        configurable: true,
        writable: true,
        value: originalIndexedDb
      });
    }
  };
}
