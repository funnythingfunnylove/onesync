# OneSync Design

Status: Draft for review

Date: 2026-06-30

## Goal

Build a browser extension named `onesync` that synchronizes bookmarks over WebDAV on a schedule, ships for Chrome, Firefox, and Safari, redesigns the bookmark exchange format, includes built-in encode/decode support, and keeps the user experience consistent across browsers.

## Current Workspace State

- `<repo-root>` is currently empty.
- There is no existing extension scaffold to preserve.
- There is no git repository yet, so this draft cannot be committed at this stage.

## Requirements Derived From The Goal

1. The product is a browser extension named `onesync`.
2. It must read and write bookmarks.
3. It must synchronize via WebDAV on a schedule without the user manually exporting files.
4. It must target Chrome, Firefox, and Safari from one shared codebase.
5. It must redesign the bookmark sync format instead of reusing native browser export formats.
6. It must provide built-in encoding and decoding for that format.
7. It must keep the UI and sync behavior materially consistent across browsers.

## Verified Platform Constraints

These constraints were checked on 2026-06-30 against official documentation and will shape the architecture.

- Chrome extensions should use Manifest V3 with a background service worker. Service workers do not have DOM access, can terminate when idle, and long-lived timers should be replaced with `chrome.alarms`.
  Source: [Chrome service worker migration](https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers)
- Chrome alarms are best-effort rather than exact. Chrome limits production alarms to no more than once every 30 seconds and may delay execution beyond the scheduled time.
  Source: [chrome.alarms API](https://developer.chrome.com/docs/extensions/reference/api/alarms)
- Chrome alarm persistence is not uniform across browsers, so important alarms should be recreated when the background worker starts.
  Source: [chrome.alarms API](https://developer.chrome.com/docs/extensions/reference/api/alarms)
- Firefox Manifest V3 builds require `browser_specific_settings.gecko.id` for signing and self-distribution.
  Source: [MDN browser_specific_settings](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings)
- Safari Web Extensions are packaged through Apple tooling. The current packaging flow uses `xcrun safari-web-extension-packager`, which creates an Xcode project and native wrapper app. Safari packaging is not just another ZIP target.
  Source: [Apple Safari web extension packaging](https://docs.developer.apple.com/tutorials/data/documentation/safariservices/packaging-a-web-extension-for-safari.md)
- WXT currently supports Chrome, Firefox, and Safari targets and documents Safari packaging via `pnpm wxt build -b safari` followed by `xcrun safari-web-extension-packager .output/safari-mv2`.
  Source: [WXT publishing guide](https://wxt.dev/guide/essentials/publishing) and [WXT browser targeting guide](https://wxt.dev/guide/essentials/target-different-browsers)

## Scope Decomposition

The goal contains four subsystems that should be designed together but implemented in a controlled order:

1. Shared extension runtime and browser packaging
2. Bookmark model, encode/decode, and migration
3. WebDAV client, scheduler, and sync orchestration
4. Consistent settings and sync-status UX

The codebase should be structured so that all browser-specific differences are pushed to the edges.

## Approaches Considered

### Approach A: One shared core with thin browser adapters

Use one TypeScript codebase for format, sync, and UI, with a narrow browser adapter layer for bookmarks, alarms, storage, and runtime differences.

Pros:

- Strongest path to consistent behavior across browsers
- Lowest long-term maintenance cost
- Makes codec and merge logic testable outside the extension shell
- Safari becomes a packaging concern, not a forked product

Cons:

- Requires clean boundaries up front
- Needs discipline around unsupported browser APIs

Recommendation: yes

### Approach B: Separate extension builds per browser with partial code sharing

Keep a common utility folder but allow Chrome, Firefox, and Safari to diverge more aggressively.

Pros:

- Faster to get one browser working with ad hoc fixes
- Easier to patch browser-specific quirks inline

Cons:

- High risk of sync behavior drift
- Harder to keep UX and data model identical
- Safari parity tends to slip because it becomes a separate product stream

Recommendation: no

### Approach C: Build a native app first and treat the extension as a thin client

Move sync orchestration and storage into a native host or companion app.

Pros:

- More control over credentials and long-running scheduling
- Easier to support richer local storage later

Cons:

- Over-scoped for this project
- Breaks the user's extension-first requirement
- Makes installation and cross-browser distribution much heavier

Recommendation: no

## Recommended Technical Baseline

Use `WXT + TypeScript` as the extension framework, keep the UI in standard HTML/CSS/TypeScript, and use `webextension-polyfill` for a single promise-based browser API surface.

Why this baseline:

- WXT gives one codebase with documented targets for Chrome, Firefox, and Safari.
- We need Safari packaging support from the beginning, even if the final App Store or notarization step remains manual.
- `webextension-polyfill` keeps the runtime API surface stable and avoids mixed callback and promise code.

## Proposed Repository Shape

```text
onesync/
  package.json
  tsconfig.json
  wxt.config.ts
  public/
    icons/
  entrypoints/
    background.ts
    popup/
      index.html
      main.ts
      popup.css
    options/
      index.html
      main.ts
      options.css
  src/
    core/
      format/
        schema.ts
        encode.ts
        decode.ts
        migrate.ts
      sync/
        scheduler.ts
        sync-engine.ts
        merge.ts
        diff.ts
      webdav/
        client.ts
        auth.ts
        paths.ts
      browser/
        bookmarks.ts
        alarms.ts
        storage.ts
      state/
        config.ts
        activity-log.ts
        sync-state.ts
      shared/
        types.ts
        time.ts
        crypto.ts
        errors.ts
    ui/
      view-models/
      components/
  tests/
    format/
    sync/
    webdav/
```

## Bookmark Format Redesign

The extension should not sync raw browser bookmark trees directly. Native browser formats differ too much and are poor merge targets.

The internal canonical format should be a normalized, versioned graph:

```json
{
  "kind": "onesync.bookmarks",
  "schemaVersion": 1,
  "revision": "2026-06-30T12:00:00.000Z#device-123#42",
  "deviceId": "device-123",
  "generatedAt": "2026-06-30T12:00:00.000Z",
  "roots": {
    "toolbar": "root-toolbar",
    "menu": "root-menu",
    "mobile": "root-mobile",
    "unfiled": "root-unfiled"
  },
  "nodes": {
    "root-toolbar": {
      "id": "root-toolbar",
      "type": "folder",
      "title": "Bookmarks Bar",
      "children": ["n-1"]
    },
    "n-1": {
      "id": "n-1",
      "type": "bookmark",
      "title": "Example",
      "url": "https://example.com/",
      "addedAt": "2026-06-30T11:59:00.000Z",
      "updatedAt": "2026-06-30T11:59:00.000Z"
    }
  },
  "tombstones": [],
  "meta": {
    "client": "onesync",
    "clientVersion": "0.1.0"
  }
}
```

Design choices:

- `schemaVersion` enables explicit migration.
- `revision` is monotonic per write and becomes the remote compare point.
- `roots` maps browser-specific root folders onto stable semantic buckets.
- `nodes` is normalized so merge and diff logic work on IDs rather than nested arrays.
- `tombstones` record deletions and prevent removed bookmarks from being resurrected by another device.

## Built-In Encode/Decode Format

The sync file stored over WebDAV should be a small wrapper around the canonical format:

```json
{
  "kind": "onesync.bundle",
  "bundleVersion": 1,
  "encoding": "base64url+gzip+json",
  "checksum": {
    "algorithm": "sha256",
    "value": "hex-digest"
  },
  "payload": "encoded-string"
}
```

Encode pipeline:

1. Normalize and sort the bookmark bundle for deterministic output.
2. Serialize to UTF-8 JSON.
3. Compress with gzip.
4. Base64url-encode the compressed bytes.
5. Hash the compressed bytes with SHA-256 and store the checksum.

Decode pipeline:

1. Validate wrapper shape and supported `bundleVersion`.
2. Base64url-decode `payload`.
3. Verify SHA-256 checksum.
4. Gunzip bytes into JSON.
5. Parse and validate the canonical schema.
6. Run migrations if `schemaVersion` is older than the current one.

This gives us:

- deterministic payloads for change detection
- corruption detection
- a clear place to add future format versions
- one transport format for all browsers

Important boundary:

- This codec is for transport and portability, not credential secrecy.
- WebDAV credentials must be treated separately from bookmark encoding.

## Browser Model Mapping

Each browser exposes slightly different bookmark roots. We will map them into four semantic roots:

- `toolbar`
- `menu`
- `mobile`
- `unfiled`

Per-browser adapters convert native trees into the canonical format and back:

- Chrome: map bookmark bar, other bookmarks, mobile bookmarks
- Firefox: map toolbar, menu, mobile, unfiled
- Safari: map Safari-exposed WebExtension bookmark roots into the same semantic buckets

If a browser lacks one root explicitly, keep the key in the canonical format and materialize it as an empty folder projection rather than dropping it.

## WebDAV Layout

The remote WebDAV directory should use stable paths:

```text
<base-path>/
  latest.onesync
  latest.meta.json
  history/
    2026-06-30T12-00-00.000Z-device-123.onesync
  devices/
    device-123.json
```

Files:

- `latest.onesync`: most recent encoded bookmark bundle
- `latest.meta.json`: ETag, revision, generator, and checksum metadata
- `history/*`: append-only history snapshots for manual recovery
- `devices/*`: last-known device metadata such as last sync time and client version

## Sync Strategy

Use optimistic concurrency with a three-way merge:

Inputs:

- local current bundle
- remote current bundle
- local last-applied base bundle

Process:

1. Load settings and ensure the scheduled sync is enabled.
2. Read local bookmarks and project them into the canonical format.
3. Download `latest.meta.json` and `latest.onesync` from WebDAV.
4. Decode and validate the remote bundle.
5. Compute local changes against the last-applied base.
6. Compute remote changes against the same base.
7. Merge the change sets into a new canonical bundle.
8. Upload the merged bundle and updated metadata with ETag-based conflict checks.
9. Write the merged result into local browser bookmarks.
10. Persist the merged bundle as the new local base snapshot.

Conflict policy for v1:

- same bookmark ID changed on one side only: accept the changed side
- same bookmark ID changed on both sides:
  - URL changes: remote wins if its `updatedAt` is newer
  - title changes: newest `updatedAt` wins
  - folder membership changes: newest `updatedAt` wins
- deletion beats stale updates if the deletion timestamp is newer
- duplicate bookmarks with same normalized URL under same parent should collapse to one node where possible

This is intentionally narrower than a full CRDT. It is sufficient for a first production-ready sync engine while keeping behavior inspectable.

## Scheduling Model

Scheduling must tolerate service worker suspension and browser restarts.

Rules:

- Use extension alarms rather than in-memory timers.
- Reconcile alarm state whenever the background worker starts.
- Store the intended schedule in extension storage, not in memory.
- Offer user-selectable intervals of `1`, `5`, `15`, `30`, and `60` minutes.
- Treat the schedule as best-effort. UI copy should not imply exact wall-clock execution.
- Support manual sync in addition to scheduled sync.

The scheduler should own exactly one named alarm, for example `onesync.periodic-sync`.

## Settings And UX

The extension should expose the same information architecture in all browsers:

- Popup
  - sync status
  - last sync time
  - manual sync button
  - recent error summary
- Options page
  - WebDAV endpoint, username, password, base path
  - sync interval and enable toggle
  - insecure HTTP allow toggle for trusted LAN setups
  - export current encoded bundle
  - import and decode bundle
  - format version and migration diagnostics
  - activity log

Consistency rule:

- same labels
- same field ordering
- same status states
- same icon set
- same error categories

Safari may have a different installation wrapper, but once the extension is running the UI contract should be identical.

## Security And Reliability Baseline

- Default to HTTPS WebDAV endpoints.
- Allow plain HTTP only behind an explicit advanced setting for local-network use.
- Never log full credentials.
- Mask passwords in UI and activity logs.
- Validate decoded bundles before applying them to local bookmarks.
- Keep a local recovery snapshot before any destructive bookmark write.
- Keep remote history snapshots for rollback.

## Build And Distribution Strategy

Primary development path:

- Chrome for the fastest local iteration
- Firefox as a second runtime target during development
- Safari as a packaging target from the same source tree

Expected commands after scaffolding:

```bash
pnpm wxt
pnpm wxt -b firefox
pnpm wxt build
pnpm wxt build -b firefox
pnpm wxt build -b safari
xcrun safari-web-extension-packager .output/safari-mv2
```

Firefox manifest requirements:

- add `browser_specific_settings.gecko.id`

Safari distribution requirement:

- package the Safari target into an Xcode project and wrapper app using Apple tooling

## Testing Strategy

Automated:

- codec round-trip tests
- schema migration tests
- diff and merge tests
- WebDAV path and request tests
- sync-engine tests for no-op, upload, download, and conflict cases

Manual runtime verification:

- Chrome unpacked build can sync to a test WebDAV server
- Firefox build can use the same remote directory without format drift
- Safari package can be generated from the same source tree

## Recommended Execution Order

1. Scaffold the WXT extension workspace and cross-browser manifests.
2. Implement the canonical bookmark schema and codec.
3. Implement browser bookmark adapters and local snapshot persistence.
4. Implement the WebDAV client and sync engine.
5. Add scheduler and background orchestration.
6. Build popup and options UI.
7. Verify Chrome, Firefox, and Safari packaging flows.

## Open Assumptions To Confirm

These assumptions were chosen to keep the project moving in the absence of more user input:

- Use one shared codebase, not three browser-specific repos.
- Use WXT instead of hand-maintained raw manifests.
- Use a versioned normalized JSON schema wrapped in `base64url+gzip+json`.
- Use optimistic concurrency plus three-way merge instead of a CRDT.
- Keep credentials in local extension storage for now, with careful masking and no custom native keychain integration.

## Immediate Next Step

If this design is accepted, the next move is to write the implementation plan and start scaffolding the WXT-based extension workspace around this architecture.
