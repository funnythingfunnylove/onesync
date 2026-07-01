import { describe, expect, it } from "vitest";
import { buildRemotePaths } from "../../src/core/webdav/paths";

describe("remote path layout", () => {
  it("builds stable latest, history, device, and metadata paths", () => {
    const paths = buildRemotePaths("/onesync", "2026-06-30T12:00:00.000Z#device-1#1", "device-1");

    expect(paths.baseDirectory).toBe("/onesync");
    expect(paths.latestBundle).toBe("/onesync/latest.onesync");
    expect(paths.latestMeta).toBe("/onesync/latest.meta.json");
    expect(paths.deviceMeta).toBe("/onesync/devices/device-1.json");
    expect(paths.historyBundle).toBe("/onesync/history/2026-06-30T12-00-00.000Z#device-1#1.onesync");
  });
});
