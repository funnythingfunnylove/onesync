# onesync

OneSync is a cross-browser bookmark synchronization extension built from one shared codebase for Chrome, Firefox, and Safari. It synchronizes bookmarks over WebDAV on a schedule, uses a versioned canonical bookmark format, and includes built-in encode/decode utilities for import and export.

## Implemented capabilities

- Shared WXT + TypeScript extension workspace
- Chrome, Firefox, and Safari build targets from one source tree
- WebDAV client with stable remote layout:
  - `latest.onesync`
  - `latest.meta.json`
  - `history/*.onesync`
  - `devices/*.json`
- Canonical bookmark schema with deterministic normalization
- Built-in `gzip + base64url + sha256` bundle encoding and decoding
- Local snapshot persistence and recovery snapshot storage
- Best-effort periodic sync using extension alarms
- Popup status surface and options page for:
  - WebDAV settings
  - sync interval
  - scheduled sync toggle
  - insecure HTTP override for trusted local networks
  - export encoded bundle
  - import encoded bundle
  - activity log

## Development

Install dependencies:

```bash
pnpm install
```

Run tests:

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm verify
```

Build targets:

```bash
pnpm wxt build
pnpm wxt build -b firefox
pnpm wxt build -b safari
pnpm build:all
```

## Local loading

### Chrome

1. Open `chrome://extensions`
2. Enable Developer mode
3. Choose `Load unpacked`
4. Select `<repo-root>\.output\chrome-mv3`

### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Choose `Load Temporary Add-on`
3. Select `<repo-root>\.output\firefox-mv2\manifest.json`

### Safari

Safari Web Extensions require Apple tooling on macOS. From a Mac with Xcode installed:

```bash
pnpm wxt build -b safari
pnpm package:safari
```

This generates the Xcode wrapper project required to run the Safari extension.

## Notes

- Firefox output includes a `browser_specific_settings.gecko.id` and `data_collection_permissions.required=["none"]`.
- Safari packaging cannot be executed from Windows because `xcrun` is only available in Apple developer tooling on macOS.
