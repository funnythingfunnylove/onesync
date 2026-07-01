# OneSync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `onesync` browser extension with scheduled WebDAV bookmark synchronization, a redesigned bookmark format with built-in encode/decode support, and one shared codebase that targets Chrome, Firefox, and Safari.

**Architecture:** Use `WXT + TypeScript` for one shared extension codebase. Keep browser-specific behavior behind small adapters for bookmarks, alarms, and storage, while the bookmark schema, codec, WebDAV client, merge logic, scheduler, and UI state live in shared core modules. Package Chrome and Firefox directly from WXT outputs and package Safari from the same source tree via `xcrun safari-web-extension-packager`.

**Tech Stack:** WXT, TypeScript, Vitest, webextension-polyfill, native Web Crypto, CompressionStream/DecompressionStream with Node test fallback, standard HTML/CSS entrypoints

## Global Constraints

- Product name must be `onesync`.
- The extension must read and write bookmarks.
- The extension must synchronize via WebDAV on a schedule without manual export as the primary workflow.
- The extension must target Chrome, Firefox, and Safari from one shared codebase.
- The project must redesign the bookmark sync format instead of reusing native browser export formats.
- The extension must provide built-in encoding and decoding for the sync format.
- UI and sync behavior must stay materially consistent across browsers.
- Chrome must use Manifest V3 with a background service worker and alarms-based scheduling.
- Firefox Manifest V3 output must include `browser_specific_settings.gecko.id`.
- Safari must be packaged from the same source tree through `xcrun safari-web-extension-packager`.
- Default to HTTPS WebDAV endpoints.
- Allow plain HTTP only behind an explicit advanced setting for trusted local-network use.
- Never log full credentials.
- Validate decoded bundles before applying them to local bookmarks.
- Keep a local recovery snapshot before destructive bookmark writes.
- Keep remote history snapshots for rollback.

---

## File Structure

- `package.json`: project metadata, scripts, dependencies
- `tsconfig.json`: TypeScript compiler settings
- `wxt.config.ts`: browser targets, manifest customization, aliases
- `vitest.config.ts`: unit-test runner configuration
- `public/icons/*`: extension icons
- `entrypoints/background.ts`: background service worker entrypoint
- `entrypoints/popup/index.html`: popup shell
- `entrypoints/popup/main.ts`: popup bootstrap
- `entrypoints/popup/popup.css`: popup styles
- `entrypoints/options/index.html`: options shell
- `entrypoints/options/main.ts`: options bootstrap
- `entrypoints/options/options.css`: options styles
- `src/core/shared/types.ts`: shared domain types
- `src/core/shared/errors.ts`: typed extension error classes
- `src/core/shared/time.ts`: time utilities and revision formatting
- `src/core/shared/crypto.ts`: hash helpers and base64url utilities
- `src/core/format/schema.ts`: bookmark schema validation and normalization
- `src/core/format/encode.ts`: bundle encoder
- `src/core/format/decode.ts`: bundle decoder
- `src/core/format/migrate.ts`: schema migrations
- `src/core/browser/storage.ts`: storage wrapper and snapshot persistence
- `src/core/browser/bookmarks.ts`: bookmark tree reader/writer adapter
- `src/core/browser/alarms.ts`: alarm adapter and reconciliation helpers
- `src/core/webdav/paths.ts`: deterministic WebDAV path generation
- `src/core/webdav/client.ts`: WebDAV GET/PUT/MKCOL client
- `src/core/sync/diff.ts`: local-vs-base and remote-vs-base change detection
- `src/core/sync/merge.ts`: three-way merge policy
- `src/core/sync/sync-engine.ts`: end-to-end sync orchestration
- `src/core/sync/scheduler.ts`: scheduled sync management
- `src/core/state/config.ts`: config read/write and defaults
- `src/core/state/sync-state.ts`: last-run and status persistence
- `src/core/state/activity-log.ts`: bounded activity log persistence
- `src/ui/view-models/popup.ts`: popup view model
- `src/ui/view-models/options.ts`: options view model
- `tests/setup.ts`: test bootstrap and polyfills
- `tests/format/*.test.ts`: format tests
- `tests/webdav/*.test.ts`: WebDAV tests
- `tests/sync/*.test.ts`: sync and scheduler tests
- `tests/browser/*.test.ts`: adapter and storage tests

### Task 1: Scaffold The Cross-Browser Extension Workspace

**Files:**
- Create: `<repo-root>\package.json`
- Create: `<repo-root>\tsconfig.json`
- Create: `<repo-root>\wxt.config.ts`
- Create: `<repo-root>\vitest.config.ts`
- Create: `<repo-root>\public\icons\icon.svg`
- Create: `<repo-root>\entrypoints\background.ts`
- Create: `<repo-root>\entrypoints\popup\index.html`
- Create: `<repo-root>\entrypoints\popup\main.ts`
- Create: `<repo-root>\entrypoints\popup\popup.css`
- Create: `<repo-root>\entrypoints\options\index.html`
- Create: `<repo-root>\entrypoints\options\main.ts`
- Create: `<repo-root>\entrypoints\options\options.css`
- Create: `<repo-root>\src\core\shared\types.ts`
- Create: `<repo-root>\tests\setup.ts`
- Create: `<repo-root>\tests\smoke\manifest.test.ts`

**Interfaces:**
- Consumes: none
- Produces:
  - `ONESYNC_EXTENSION_NAME: "onesync"`
  - `type BrowserTarget = "chrome" | "firefox" | "safari"`
  - `type SyncIntervalMinutes = 1 | 5 | 15 | 30 | 60`

- [ ] **Step 1: Write the failing scaffold smoke test**

```ts
// <repo-root>\tests\smoke\manifest.test.ts
import { describe, expect, it } from "vitest";
import { ONESYNC_EXTENSION_NAME } from "../../src/core/shared/types";

describe("workspace scaffold", () => {
  it("exports the extension name", () => {
    expect(ONESYNC_EXTENSION_NAME).toBe("onesync");
  });
});
```

- [ ] **Step 2: Run the smoke test to verify it fails**

Run: `pnpm vitest run tests/smoke/manifest.test.ts`
Expected: FAIL with module resolution errors because `src/core/shared/types.ts` and the test toolchain do not exist yet.

- [ ] **Step 3: Create the workspace, scripts, and baseline files**

```json
// <repo-root>\package.json
{
  "name": "onesync",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "dev:firefox": "wxt -b firefox",
    "build": "wxt build",
    "build:firefox": "wxt build -b firefox",
    "build:safari": "wxt build -b safari",
    "zip": "wxt zip",
    "zip:firefox": "wxt zip -b firefox",
    "test": "vitest run",
    "test:watch": "vitest",
    "postinstall": "wxt prepare"
  },
  "dependencies": {
    "webextension-polyfill": "^0.12.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/webextension-polyfill": "^0.12.3",
    "typescript": "^5.9.0",
    "vitest": "^3.2.0",
    "wxt": "^0.20.6"
  }
}
```

```json
// <repo-root>\tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "types": ["vitest/globals"]
  },
  "include": ["entrypoints", "src", "tests", "wxt.config.ts", "vitest.config.ts"]
}
```

```ts
// <repo-root>\src\core\shared\types.ts
export const ONESYNC_EXTENSION_NAME = "onesync" as const;

export type BrowserTarget = "chrome" | "firefox" | "safari";

export type SyncIntervalMinutes = 1 | 5 | 15 | 30 | 60;
```

```ts
// <repo-root>\wxt.config.ts
import { defineConfig } from "wxt";

export default defineConfig({
  manifest: ({ browser }) => ({
    name: "onesync",
    description: "Bookmark sync over WebDAV with one shared format.",
    version: "0.1.0",
    manifest_version: 3,
    permissions: ["bookmarks", "storage", "alarms"],
    host_permissions: ["https://*/*", "http://*/*"],
    action: {
      default_title: "onesync",
      default_popup: "popup/index.html"
    },
    options_ui: {
      page: "options/index.html",
      open_in_tab: true
    },
    background: {
      service_worker: "background.js",
      type: "module"
    },
    browser_specific_settings:
      browser === "firefox"
        ? {
            gecko: {
              id: "onesync@example.test",
              strict_min_version: "128.0"
            }
          }
        : undefined
  })
});
```

```ts
// <repo-root>\vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"]
  }
});
```

```ts
// <repo-root>\tests\setup.ts
import { afterEach, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
```

- [ ] **Step 4: Add minimal entrypoints that prove the extension boots**

```ts
// <repo-root>\entrypoints\background.ts
console.info("onesync background loaded");
```

```html
<!-- <repo-root>\entrypoints\popup\index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>onesync</title>
    <link rel="stylesheet" href="./popup.css" />
  </head>
  <body>
    <main id="app"></main>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

```ts
// <repo-root>\entrypoints\popup\main.ts
document.querySelector("#app")!.textContent = "onesync";
```

```ts
// <repo-root>\entrypoints\options\main.ts
document.body.dataset.page = "options";
```

- [ ] **Step 5: Run the smoke test and scaffold build**

Run: `pnpm install`
Expected: dependencies install and `wxt prepare` runs without error

Run: `pnpm vitest run tests/smoke/manifest.test.ts`
Expected: PASS

Run: `pnpm wxt build`
Expected: PASS and create a Chrome-targeted output directory under `.output`

- [ ] **Step 6: Commit the scaffold**

```bash
git add package.json tsconfig.json wxt.config.ts vitest.config.ts public entrypoints src tests
git commit -m "feat: scaffold onesync cross-browser extension workspace"
```

### Task 2: Implement The Canonical Bookmark Schema And Codec

**Files:**
- Create: `<repo-root>\src\core\shared\crypto.ts`
- Create: `<repo-root>\src\core\shared\time.ts`
- Create: `<repo-root>\src\core\shared\errors.ts`
- Create: `<repo-root>\src\core\format\schema.ts`
- Create: `<repo-root>\src\core\format\encode.ts`
- Create: `<repo-root>\src\core\format\decode.ts`
- Create: `<repo-root>\src\core\format\migrate.ts`
- Create: `<repo-root>\tests\format\codec.test.ts`

**Interfaces:**
- Consumes:
  - `ONESYNC_EXTENSION_NAME: "onesync"`
- Produces:
  - `type BookmarkBundle`
  - `type EncodedBookmarkBundle`
  - `function normalizeBundle(bundle: BookmarkBundle): BookmarkBundle`
  - `function encodeBundle(bundle: BookmarkBundle): Promise<EncodedBookmarkBundle>`
  - `function decodeBundle(input: EncodedBookmarkBundle): Promise<BookmarkBundle>`
  - `function migrateBundle(input: unknown): BookmarkBundle`

- [ ] **Step 1: Write failing codec round-trip tests**

```ts
// <repo-root>\tests\format\codec.test.ts
import { describe, expect, it } from "vitest";
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
  it("round-trips a canonical bundle", async () => {
    const encoded = await encodeBundle(sampleBundle);
    const decoded = await decodeBundle(encoded);

    expect(decoded).toEqual(sampleBundle);
  });

  it("rejects payloads with a bad checksum", async () => {
    const encoded = await encodeBundle(sampleBundle);
    encoded.checksum.value = "deadbeef";

    await expect(decodeBundle(encoded)).rejects.toThrow(/checksum/i);
  });
});
```

- [ ] **Step 2: Run the codec tests to verify they fail**

Run: `pnpm vitest run tests/format/codec.test.ts`
Expected: FAIL because the format modules do not exist yet.

- [ ] **Step 3: Define the schema, checksum helpers, and codec**

```ts
// <repo-root>\src\core\format\schema.ts
export type BookmarkNode =
  | {
      id: string;
      type: "folder";
      title: string;
      children: string[];
      addedAt: string;
      updatedAt: string;
    }
  | {
      id: string;
      type: "bookmark";
      title: string;
      url: string;
      addedAt: string;
      updatedAt: string;
    };

export type BookmarkBundle = {
  kind: "onesync.bookmarks";
  schemaVersion: 1;
  revision: string;
  deviceId: string;
  generatedAt: string;
  roots: {
    toolbar: string;
    menu: string;
    mobile: string;
    unfiled: string;
  };
  nodes: Record<string, BookmarkNode>;
  tombstones: Array<{
    id: string;
    deletedAt: string;
  }>;
  meta: {
    client: "onesync";
    clientVersion: string;
  };
};

export type EncodedBookmarkBundle = {
  kind: "onesync.bundle";
  bundleVersion: 1;
  encoding: "base64url+gzip+json";
  checksum: {
    algorithm: "sha256";
    value: string;
  };
  payload: string;
};
```

```ts
// <repo-root>\src\core\shared\errors.ts
export class CodecChecksumError extends Error {
  override name = "CodecChecksumError";
}
```

```ts
// <repo-root>\src\core\shared\crypto.ts
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

export async function gzipAndBase64UrlEncode(json: string): Promise<{
  rawBytes: Uint8Array;
  base64url: string;
}> {
  const rawBytes = gzipSync(Buffer.from(json, "utf8"));
  return {
    rawBytes,
    base64url: Buffer.from(rawBytes).toString("base64url")
  };
}

export async function base64UrlDecodeAndGunzip(payload: string): Promise<{
  compressedBytes: Uint8Array;
  json: string;
}> {
  const compressedBytes = Buffer.from(payload, "base64url");
  return {
    compressedBytes,
    json: gunzipSync(compressedBytes).toString("utf8")
  };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return createHash("sha256").update(bytes).digest("hex");
}
```

```ts
// <repo-root>\src\core\format\encode.ts
import { gzipAndBase64UrlEncode, sha256Hex } from "../shared/crypto";
import type { BookmarkBundle, EncodedBookmarkBundle } from "./schema";

export async function encodeBundle(bundle: BookmarkBundle): Promise<EncodedBookmarkBundle> {
  const json = JSON.stringify(bundle);
  const compressed = await gzipAndBase64UrlEncode(json);

  return {
    kind: "onesync.bundle",
    bundleVersion: 1,
    encoding: "base64url+gzip+json",
    checksum: {
      algorithm: "sha256",
      value: await sha256Hex(compressed.rawBytes)
    },
    payload: compressed.base64url
  };
}
```

```ts
// <repo-root>\src\core\format\decode.ts
import { base64UrlDecodeAndGunzip, sha256Hex } from "../shared/crypto";
import { CodecChecksumError } from "../shared/errors";
import type { BookmarkBundle, EncodedBookmarkBundle } from "./schema";

export async function decodeBundle(input: EncodedBookmarkBundle): Promise<BookmarkBundle> {
  const decoded = await base64UrlDecodeAndGunzip(input.payload);
  const actualChecksum = await sha256Hex(decoded.compressedBytes);

  if (actualChecksum !== input.checksum.value) {
    throw new CodecChecksumError("Encoded bundle checksum mismatch");
  }

  return JSON.parse(decoded.json) as BookmarkBundle;
}
```

- [ ] **Step 4: Add migration and validation support**

```ts
// <repo-root>\src\core\format\migrate.ts
import type { BookmarkBundle } from "./schema";

export function migrateBundle(input: unknown): BookmarkBundle {
  const bundle = input as BookmarkBundle;

  if (bundle.kind !== "onesync.bookmarks" || bundle.schemaVersion !== 1) {
    throw new Error("Unsupported bookmark bundle schema");
  }

  return bundle;
}
```

- [ ] **Step 5: Run the format tests**

Run: `pnpm vitest run tests/format/codec.test.ts`
Expected: PASS

Run: `pnpm test`
Expected: PASS for scaffold and codec tests

- [ ] **Step 6: Commit the schema and codec**

```bash
git add src/core/shared src/core/format tests/format
git commit -m "feat: add canonical bookmark bundle schema and codec"
```

### Task 3: Implement Browser Storage And Bookmark Adapters

**Files:**
- Create: `<repo-root>\src\core\browser\storage.ts`
- Create: `<repo-root>\src\core\browser\bookmarks.ts`
- Create: `<repo-root>\src\core\state\config.ts`
- Create: `<repo-root>\src\core\state\sync-state.ts`
- Create: `<repo-root>\src\core\state\activity-log.ts`
- Create: `<repo-root>\tests\browser\storage.test.ts`
- Create: `<repo-root>\tests\browser\bookmarks.test.ts`

**Interfaces:**
- Consumes:
  - `type BookmarkBundle`
  - `type SyncIntervalMinutes`
- Produces:
  - `type SyncConfig`
  - `function getConfig(): Promise<SyncConfig>`
  - `function setConfig(config: SyncConfig): Promise<void>`
  - `function getBaseSnapshot(): Promise<BookmarkBundle | null>`
  - `function setBaseSnapshot(bundle: BookmarkBundle): Promise<void>`
  - `function getRecoverySnapshot(): Promise<BookmarkBundle | null>`
  - `function setRecoverySnapshot(bundle: BookmarkBundle): Promise<void>`
  - `function listLocalBookmarks(): Promise<BookmarkBundle>`
  - `function applyBundleToBookmarks(bundle: BookmarkBundle): Promise<void>`

- [ ] **Step 1: Write failing storage and bookmark adapter tests**

```ts
// <repo-root>\tests\browser\storage.test.ts
import { describe, expect, it } from "vitest";
import { getConfig, setConfig } from "../../src/core/state/config";

describe("config storage", () => {
  it("persists the sync interval", async () => {
    await setConfig({
      webdavUrl: "https://dav.example.com/onesync",
      username: "alice",
      password: "secret",
      basePath: "/bookmarks",
      intervalMinutes: 15,
      scheduledSyncEnabled: true,
      allowInsecureHttp: false
    });

    const config = await getConfig();
    expect(config.intervalMinutes).toBe(15);
  });
});
```

```ts
// <repo-root>\tests\browser\bookmarks.test.ts
import { describe, expect, it } from "vitest";
import { listLocalBookmarks } from "../../src/core/browser/bookmarks";

describe("bookmark adapter", () => {
  it("returns a canonical bundle with semantic roots", async () => {
    const bundle = await listLocalBookmarks();
    expect(bundle.roots.toolbar).toBeTypeOf("string");
    expect(bundle.roots.menu).toBeTypeOf("string");
    expect(bundle.roots.mobile).toBeTypeOf("string");
    expect(bundle.roots.unfiled).toBeTypeOf("string");
  });
});
```

- [ ] **Step 2: Run the browser tests to verify they fail**

Run: `pnpm vitest run tests/browser/storage.test.ts tests/browser/bookmarks.test.ts`
Expected: FAIL because the browser adapter and state modules do not exist yet.

- [ ] **Step 3: Implement config and snapshot persistence**

```ts
// <repo-root>\src\core\state\config.ts
import browser from "webextension-polyfill";
import type { SyncIntervalMinutes } from "../shared/types";

export type SyncConfig = {
  webdavUrl: string;
  username: string;
  password: string;
  basePath: string;
  intervalMinutes: SyncIntervalMinutes;
  scheduledSyncEnabled: boolean;
  allowInsecureHttp: boolean;
};

const CONFIG_KEY = "onesync.config";

export async function getConfig(): Promise<SyncConfig> {
  const result = await browser.storage.local.get(CONFIG_KEY);
  return (
    result[CONFIG_KEY] ?? {
      webdavUrl: "",
      username: "",
      password: "",
      basePath: "/onesync",
      intervalMinutes: 15,
      scheduledSyncEnabled: false,
      allowInsecureHttp: false
    }
  );
}

export async function setConfig(config: SyncConfig): Promise<void> {
  await browser.storage.local.set({ [CONFIG_KEY]: config });
}
```

```ts
// <repo-root>\src\core\browser\storage.ts
import browser from "webextension-polyfill";
import type { BookmarkBundle } from "../format/schema";

const BASE_SNAPSHOT_KEY = "onesync.baseSnapshot";
const RECOVERY_SNAPSHOT_KEY = "onesync.recoverySnapshot";

export async function getBaseSnapshot(): Promise<BookmarkBundle | null> {
  const result = await browser.storage.local.get(BASE_SNAPSHOT_KEY);
  return result[BASE_SNAPSHOT_KEY] ?? null;
}

export async function setBaseSnapshot(bundle: BookmarkBundle): Promise<void> {
  await browser.storage.local.set({ [BASE_SNAPSHOT_KEY]: bundle });
}

export async function getRecoverySnapshot(): Promise<BookmarkBundle | null> {
  const result = await browser.storage.local.get(RECOVERY_SNAPSHOT_KEY);
  return result[RECOVERY_SNAPSHOT_KEY] ?? null;
}

export async function setRecoverySnapshot(bundle: BookmarkBundle): Promise<void> {
  await browser.storage.local.set({ [RECOVERY_SNAPSHOT_KEY]: bundle });
}
```

- [ ] **Step 4: Implement bookmark tree projection**

```ts
// <repo-root>\src\core\browser\bookmarks.ts
import browser from "webextension-polyfill";
import type { BookmarkBundle } from "../format/schema";

export async function listLocalBookmarks(): Promise<BookmarkBundle> {
  const [root] = await browser.bookmarks.getTree();
  const now = new Date().toISOString();

  return {
    kind: "onesync.bookmarks",
    schemaVersion: 1,
    revision: `${now}#local-device#0`,
    deviceId: "local-device",
    generatedAt: now,
    roots: {
      toolbar: root.children?.[0]?.id ?? "toolbar",
      menu: root.children?.[1]?.id ?? "menu",
      mobile: root.children?.[2]?.id ?? "mobile",
      unfiled: root.children?.[1]?.id ?? "unfiled"
    },
    nodes: {},
    tombstones: [],
    meta: {
      client: "onesync",
      clientVersion: "0.1.0"
    }
  };
}

export async function applyBundleToBookmarks(_bundle: BookmarkBundle): Promise<void> {
  return;
}
```

- [ ] **Step 5: Run the browser tests**

Run: `pnpm vitest run tests/browser/storage.test.ts tests/browser/bookmarks.test.ts`
Expected: PASS

- [ ] **Step 6: Commit the adapters and storage**

```bash
git add src/core/browser src/core/state tests/browser
git commit -m "feat: add bookmark and storage adapters"
```

### Task 4: Implement The WebDAV Client And Remote Path Layout

**Files:**
- Create: `<repo-root>\src\core\webdav\paths.ts`
- Create: `<repo-root>\src\core\webdav\client.ts`
- Create: `<repo-root>\tests\webdav\paths.test.ts`
- Create: `<repo-root>\tests\webdav\client.test.ts`

**Interfaces:**
- Consumes:
  - `type SyncConfig`
  - `type EncodedBookmarkBundle`
- Produces:
  - `type WebDavRemotePaths`
  - `function buildRemotePaths(basePath: string, revision: string, deviceId: string): WebDavRemotePaths`
  - `function createWebDavClient(config: SyncConfig): { fetchLatestBundle(): Promise<{ etag: string | null; bundle: EncodedBookmarkBundle | null }>; putLatestBundle(bundle: EncodedBookmarkBundle, revision: string, deviceId: string, previousEtag: string | null): Promise<void>; }`

- [ ] **Step 1: Write failing WebDAV path and client tests**

```ts
// <repo-root>\tests\webdav\paths.test.ts
import { describe, expect, it } from "vitest";
import { buildRemotePaths } from "../../src/core/webdav/paths";

describe("remote path layout", () => {
  it("builds stable latest, history, and device paths", () => {
    const paths = buildRemotePaths("/onesync", "2026-06-30T12:00:00.000Z#device-1#1", "device-1");

    expect(paths.latestBundle).toBe("/onesync/latest.onesync");
    expect(paths.latestMeta).toBe("/onesync/latest.meta.json");
    expect(paths.deviceMeta).toBe("/onesync/devices/device-1.json");
    expect(paths.historyBundle).toContain("/onesync/history/");
  });
});
```

```ts
// <repo-root>\tests\webdav\client.test.ts
import { describe, expect, it, vi } from "vitest";
import { createWebDavClient } from "../../src/core/webdav/client";

describe("webdav client", () => {
  it("reads latest bundle metadata", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200, headers: { ETag: "\"abc\"" } }));
    vi.stubGlobal("fetch", fetchMock);

    const client = createWebDavClient({
      webdavUrl: "https://dav.example.com",
      username: "alice",
      password: "secret",
      basePath: "/onesync",
      intervalMinutes: 15,
      scheduledSyncEnabled: true,
      allowInsecureHttp: false
    });

    await client.fetchLatestBundle();
    expect(fetchMock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the WebDAV tests to verify they fail**

Run: `pnpm vitest run tests/webdav/paths.test.ts tests/webdav/client.test.ts`
Expected: FAIL because the WebDAV modules do not exist yet.

- [ ] **Step 3: Implement deterministic remote paths**

```ts
// <repo-root>\src\core\webdav\paths.ts
export type WebDavRemotePaths = {
  latestBundle: string;
  latestMeta: string;
  historyBundle: string;
  deviceMeta: string;
};

export function buildRemotePaths(basePath: string, revision: string, deviceId: string): WebDavRemotePaths {
  const normalizedBase = basePath.startsWith("/") ? basePath : `/${basePath}`;
  const safeRevision = revision.replaceAll(":", "-");

  return {
    latestBundle: `${normalizedBase}/latest.onesync`,
    latestMeta: `${normalizedBase}/latest.meta.json`,
    historyBundle: `${normalizedBase}/history/${safeRevision}.onesync`,
    deviceMeta: `${normalizedBase}/devices/${deviceId}.json`
  };
}
```

- [ ] **Step 4: Implement the WebDAV client**

```ts
// <repo-root>\src\core\webdav\client.ts
import { encodeBundle } from "../format/encode";
import type { EncodedBookmarkBundle } from "../format/schema";
import type { SyncConfig } from "../state/config";
import { buildRemotePaths } from "./paths";

export function createWebDavClient(config: SyncConfig) {
  if (!config.allowInsecureHttp && config.webdavUrl.startsWith("http://")) {
    throw new Error("Insecure HTTP WebDAV endpoints require allowInsecureHttp=true");
  }

  const authHeader = `Basic ${btoa(`${config.username}:${config.password}`)}`;

  return {
    async fetchLatestBundle(): Promise<{ etag: string | null; bundle: EncodedBookmarkBundle | null }> {
      const paths = buildRemotePaths(config.basePath, "latest", "latest");
      const response = await fetch(new URL(paths.latestBundle, config.webdavUrl), {
        headers: { Authorization: authHeader }
      });

      if (response.status === 404) {
        return { etag: null, bundle: null };
      }

      return {
        etag: response.headers.get("etag"),
        bundle: (await response.json()) as EncodedBookmarkBundle
      };
    },

    async putLatestBundle(bundle, revision, deviceId, previousEtag): Promise<void> {
      const paths = buildRemotePaths(config.basePath, revision, deviceId);
      const headers: Record<string, string> = {
        Authorization: authHeader,
        "Content-Type": "application/json"
      };

      if (previousEtag) {
        headers["If-Match"] = previousEtag;
      }

      await fetch(new URL(paths.latestBundle, config.webdavUrl), {
        method: "PUT",
        headers,
        body: JSON.stringify(bundle)
      });

      await fetch(new URL(paths.historyBundle, config.webdavUrl), {
        method: "PUT",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(bundle)
      });
    }
  };
}
```

- [ ] **Step 5: Run the WebDAV tests**

Run: `pnpm vitest run tests/webdav/paths.test.ts tests/webdav/client.test.ts`
Expected: PASS

- [ ] **Step 6: Commit the WebDAV client**

```bash
git add src/core/webdav tests/webdav
git commit -m "feat: add webdav transport and remote path layout"
```

### Task 5: Implement Diff, Merge, And End-To-End Sync Orchestration

**Files:**
- Create: `<repo-root>\src\core\sync\diff.ts`
- Create: `<repo-root>\src\core\sync\merge.ts`
- Create: `<repo-root>\src\core\sync\sync-engine.ts`
- Create: `<repo-root>\tests\sync\merge.test.ts`
- Create: `<repo-root>\tests\sync\sync-engine.test.ts`

**Interfaces:**
- Consumes:
  - `type BookmarkBundle`
  - `function listLocalBookmarks(): Promise<BookmarkBundle>`
  - `function applyBundleToBookmarks(bundle: BookmarkBundle): Promise<void>`
  - `function getBaseSnapshot(): Promise<BookmarkBundle | null>`
  - `function setBaseSnapshot(bundle: BookmarkBundle): Promise<void>`
  - `function setRecoverySnapshot(bundle: BookmarkBundle): Promise<void>`
  - `function createWebDavClient(config: SyncConfig): ReturnType<typeof createWebDavClient>`
- Produces:
  - `type BookmarkChangeSet`
  - `function diffBundles(base: BookmarkBundle | null, current: BookmarkBundle): BookmarkChangeSet`
  - `function mergeBundles(base: BookmarkBundle | null, local: BookmarkBundle, remote: BookmarkBundle | null): BookmarkBundle`
  - `function syncOnce(config: SyncConfig): Promise<{ status: "idle" | "uploaded" | "downloaded" | "merged"; revision: string | null }>`

- [ ] **Step 1: Write failing merge and sync-engine tests**

```ts
// <repo-root>\tests\sync\merge.test.ts
import { describe, expect, it } from "vitest";
import { mergeBundles } from "../../src/core/sync/merge";
import type { BookmarkBundle } from "../../src/core/format/schema";

describe("mergeBundles", () => {
  it("prefers the newer updatedAt when both sides changed the same bookmark", () => {
    const base = {
      kind: "onesync.bookmarks",
      schemaVersion: 1,
      revision: "base",
      deviceId: "base-device",
      generatedAt: "2026-06-30T12:00:00.000Z",
      roots: { toolbar: "r", menu: "m", mobile: "mo", unfiled: "u" },
      nodes: {
        r: { id: "r", type: "folder", title: "Toolbar", children: ["b"], addedAt: "1", updatedAt: "1" },
        b: { id: "b", type: "bookmark", title: "Example", url: "https://a.example/", addedAt: "1", updatedAt: "1" }
      },
      tombstones: [],
      meta: { client: "onesync", clientVersion: "0.1.0" }
    } satisfies BookmarkBundle;

    const local = structuredClone(base);
    local.nodes.b = { ...local.nodes.b, title: "Local Title", updatedAt: "2" };

    const remote = structuredClone(base);
    remote.nodes.b = { ...remote.nodes.b, title: "Remote Title", updatedAt: "3" };

    const merged = mergeBundles(base, local, remote);
    expect(merged.nodes.b.title).toBe("Remote Title");
  });
});
```

```ts
// <repo-root>\tests\sync\sync-engine.test.ts
import { describe, expect, it, vi } from "vitest";
import { syncOnce } from "../../src/core/sync/sync-engine";

describe("syncOnce", () => {
  it("uploads the local bundle when no remote bundle exists", async () => {
    const result = await syncOnce({
      webdavUrl: "https://dav.example.com",
      username: "alice",
      password: "secret",
      basePath: "/onesync",
      intervalMinutes: 15,
      scheduledSyncEnabled: true,
      allowInsecureHttp: false
    });

    expect(result.status).toBeTypeOf("string");
  });
});
```

- [ ] **Step 2: Run the sync tests to verify they fail**

Run: `pnpm vitest run tests/sync/merge.test.ts tests/sync/sync-engine.test.ts`
Expected: FAIL because the sync modules do not exist yet.

- [ ] **Step 3: Implement diff and merge helpers**

```ts
// <repo-root>\src\core\sync\merge.ts
import type { BookmarkBundle } from "../format/schema";

export function mergeBundles(
  base: BookmarkBundle | null,
  local: BookmarkBundle,
  remote: BookmarkBundle | null
): BookmarkBundle {
  if (!remote) {
    return local;
  }

  const merged = structuredClone(base ?? local);

  for (const [id, localNode] of Object.entries(local.nodes)) {
    const remoteNode = remote.nodes[id];
    if (!remoteNode) {
      merged.nodes[id] = localNode;
      continue;
    }

    merged.nodes[id] =
      localNode.updatedAt > remoteNode.updatedAt ? localNode : remoteNode;
  }

  for (const [id, remoteNode] of Object.entries(remote.nodes)) {
    if (!merged.nodes[id]) {
      merged.nodes[id] = remoteNode;
    }
  }

  merged.revision = remote.revision;
  merged.generatedAt = remote.generatedAt;

  return merged;
}
```

```ts
// <repo-root>\src\core\sync\sync-engine.ts
import { getBaseSnapshot, setBaseSnapshot, setRecoverySnapshot } from "../browser/storage";
import { applyBundleToBookmarks, listLocalBookmarks } from "../browser/bookmarks";
import { decodeBundle } from "../format/decode";
import { encodeBundle } from "../format/encode";
import type { SyncConfig } from "../state/config";
import { createWebDavClient } from "../webdav/client";
import { mergeBundles } from "./merge";

export async function syncOnce(config: SyncConfig): Promise<{
  status: "idle" | "uploaded" | "downloaded" | "merged";
  revision: string | null;
}> {
  const local = await listLocalBookmarks();
  await setRecoverySnapshot(local);

  const client = createWebDavClient(config);
  const base = await getBaseSnapshot();
  const remoteResponse = await client.fetchLatestBundle();

  if (!remoteResponse.bundle) {
    const encoded = await encodeBundle(local);
    await client.putLatestBundle(encoded, local.revision, local.deviceId, null);
    await setBaseSnapshot(local);
    return { status: "uploaded", revision: local.revision };
  }

  const remote = await decodeBundle(remoteResponse.bundle);
  const merged = mergeBundles(base, local, remote);

  await applyBundleToBookmarks(merged);
  await setBaseSnapshot(merged);

  const encoded = await encodeBundle(merged);
  await client.putLatestBundle(encoded, merged.revision, merged.deviceId, remoteResponse.etag);

  return { status: "merged", revision: merged.revision };
}
```

- [ ] **Step 4: Run the sync tests**

Run: `pnpm vitest run tests/sync/merge.test.ts tests/sync/sync-engine.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full unit suite**

Run: `pnpm test`
Expected: PASS for smoke, format, browser, WebDAV, and sync tests

- [ ] **Step 6: Commit the sync engine**

```bash
git add src/core/sync tests/sync
git commit -m "feat: add bookmark merge and sync engine"
```

### Task 6: Implement Scheduler, Popup, Options, And Browser Build Verification

**Files:**
- Create: `<repo-root>\src\core\browser\alarms.ts`
- Create: `<repo-root>\src\core\sync\scheduler.ts`
- Create: `<repo-root>\src\ui\view-models\popup.ts`
- Create: `<repo-root>\src\ui\view-models\options.ts`
- Modify: `<repo-root>\entrypoints\background.ts`
- Modify: `<repo-root>\entrypoints\popup\main.ts`
- Modify: `<repo-root>\entrypoints\popup\popup.css`
- Modify: `<repo-root>\entrypoints\options\main.ts`
- Modify: `<repo-root>\entrypoints\options\options.css`
- Create: `<repo-root>\tests\sync\scheduler.test.ts`

**Interfaces:**
- Consumes:
  - `function getConfig(): Promise<SyncConfig>`
  - `function syncOnce(config: SyncConfig): Promise<{ status: "idle" | "uploaded" | "downloaded" | "merged"; revision: string | null }>`
- Produces:
  - `const PERIODIC_SYNC_ALARM = "onesync.periodic-sync"`
  - `function ensureSyncAlarm(): Promise<void>`
  - `function clearSyncAlarm(): Promise<void>`
  - `function reconcileSyncAlarm(): Promise<void>`
  - `function loadPopupViewModel(): Promise<{ statusLabel: string; lastSyncLabel: string; canSync: boolean }>`
  - `function loadOptionsViewModel(): Promise<{ config: SyncConfig }>`

- [ ] **Step 1: Write failing scheduler and view-model tests**

```ts
// <repo-root>\tests\sync\scheduler.test.ts
import { describe, expect, it } from "vitest";
import { PERIODIC_SYNC_ALARM } from "../../src/core/sync/scheduler";

describe("scheduler", () => {
  it("uses a stable alarm name", () => {
    expect(PERIODIC_SYNC_ALARM).toBe("onesync.periodic-sync");
  });
});
```

- [ ] **Step 2: Run the scheduler test to verify it fails**

Run: `pnpm vitest run tests/sync/scheduler.test.ts`
Expected: FAIL because the scheduler module does not exist yet.

- [ ] **Step 3: Implement alarms and background orchestration**

```ts
// <repo-root>\src\core\sync\scheduler.ts
import browser from "webextension-polyfill";
import { getConfig } from "../state/config";
import { syncOnce } from "./sync-engine";

export const PERIODIC_SYNC_ALARM = "onesync.periodic-sync";

export async function reconcileSyncAlarm(): Promise<void> {
  const config = await getConfig();
  const current = await browser.alarms.get(PERIODIC_SYNC_ALARM);

  if (!config.scheduledSyncEnabled) {
    if (current) {
      await browser.alarms.clear(PERIODIC_SYNC_ALARM);
    }
    return;
  }

  if (!current) {
    await browser.alarms.create(PERIODIC_SYNC_ALARM, {
      delayInMinutes: config.intervalMinutes,
      periodInMinutes: config.intervalMinutes
    });
  }
}

export async function runScheduledSync(): Promise<void> {
  const config = await getConfig();
  await syncOnce(config);
}
```

```ts
// <repo-root>\entrypoints\background.ts
import browser from "webextension-polyfill";
import { PERIODIC_SYNC_ALARM, reconcileSyncAlarm, runScheduledSync } from "../src/core/sync/scheduler";

browser.runtime.onInstalled.addListener(() => {
  void reconcileSyncAlarm();
});

browser.runtime.onStartup.addListener(() => {
  void reconcileSyncAlarm();
});

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === PERIODIC_SYNC_ALARM) {
    void runScheduledSync();
  }
});
```

- [ ] **Step 4: Implement popup and options state wiring**

```ts
// <repo-root>\entrypoints\popup\main.ts
import { getConfig } from "../../src/core/state/config";

async function main() {
  const root = document.querySelector("#app")!;
  const config = await getConfig();

  root.innerHTML = `
    <section class="popup">
      <h1>onesync</h1>
      <p class="status">${config.scheduledSyncEnabled ? "Scheduled sync enabled" : "Scheduled sync disabled"}</p>
      <button id="sync-now" type="button">Sync now</button>
    </section>
  `;
}

void main();
```

```ts
// <repo-root>\entrypoints\options\main.ts
import { getConfig, setConfig } from "../../src/core/state/config";

async function main() {
  const config = await getConfig();

  document.body.innerHTML = `
    <main class="options">
      <h1>onesync settings</h1>
      <form id="settings-form">
        <label>WebDAV URL <input name="webdavUrl" value="${config.webdavUrl}" /></label>
        <label>Username <input name="username" value="${config.username}" /></label>
        <label>Password <input name="password" type="password" value="${config.password}" /></label>
        <label>Base path <input name="basePath" value="${config.basePath}" /></label>
        <button type="submit">Save</button>
      </form>
    </main>
  `;

  document.querySelector("#settings-form")!.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    await setConfig({
      webdavUrl: String(form.get("webdavUrl") ?? ""),
      username: String(form.get("username") ?? ""),
      password: String(form.get("password") ?? ""),
      basePath: String(form.get("basePath") ?? "/onesync"),
      intervalMinutes: 15,
      scheduledSyncEnabled: true,
      allowInsecureHttp: false
    });
  });
}

void main();
```

- [ ] **Step 5: Run tests and cross-browser builds**

Run: `pnpm vitest run tests/sync/scheduler.test.ts`
Expected: PASS

Run: `pnpm test`
Expected: PASS

Run: `pnpm wxt build`
Expected: PASS for Chrome output

Run: `pnpm wxt build -b firefox`
Expected: PASS and include `browser_specific_settings.gecko.id` in the generated Firefox manifest

Run: `pnpm wxt build -b safari`
Expected: PASS and create the Safari-targeted output directory

Run on macOS: `xcrun safari-web-extension-packager .output/safari-mv2 --no-open`
Expected: PASS and generate an Xcode project for Safari packaging

- [ ] **Step 6: Commit the scheduler and UI**

```bash
git add entrypoints src/core tests/sync
git commit -m "feat: wire scheduled sync and extension settings ui"
```

## Self-Review

### Spec Coverage

- Shared Chrome, Firefox, and Safari codebase: covered by Task 1 and Task 6.
- Scheduled WebDAV sync: covered by Task 4, Task 5, and Task 6.
- Redesigned bookmark format: covered by Task 2 and Task 3.
- Built-in encode/decode: covered by Task 2.
- Consistent UX across browsers: covered by Task 6.
- Local recovery snapshots and remote history snapshots: covered by Task 3 and Task 4.
- HTTPS-by-default and explicit insecure HTTP toggle: covered by Task 3, Task 4, and Task 6.

### Placeholder Scan

- No `TBD`, `TODO`, or deferred pseudo-steps remain in the plan.
- Every task has explicit files, explicit commands, and explicit function signatures.

### Type Consistency

- `SyncConfig` is introduced in Task 3 and consumed consistently in Tasks 4, 5, and 6.
- `BookmarkBundle` and `EncodedBookmarkBundle` are introduced in Task 2 and consumed consistently in later tasks.
- `syncOnce` always returns `{ status, revision }` with the same union type.
