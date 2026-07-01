import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendMessageMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn()
}));

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: {
      sendMessage: sendMessageMock
    }
  }
}));

import { loadPopupViewModel, requestManualSync } from "../../src/ui/view-models/popup";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("popup view-model", () => {
  it("preserves the sync readiness returned by the background runtime", async () => {
    sendMessageMock.mockResolvedValue({
      statusLabel: "Idle",
      lastSyncLabel: "Never synced",
      canSync: false,
      isRunning: false,
      errorLabel: "Complete the WebDAV settings before syncing.",
      progressLabel: "Backed up 12 of 42 bookmark items",
      progressPercent: 29
    });

    await expect(loadPopupViewModel()).resolves.toEqual({
      statusLabel: "Idle",
      lastSyncLabel: "Never synced",
      canSync: false,
      isRunning: false,
      errorLabel: "Complete the WebDAV settings before syncing.",
      progressLabel: "Backed up 12 of 42 bookmark items",
      progressPercent: 29
    });
  });

  it("routes popup sync through the service worker", async () => {
    await requestManualSync();

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "onesync:sync-now"
    });
  });

  it("treats Chrome's closed async response channel as a started sync when the background is already running", async () => {
    sendMessageMock
      .mockRejectedValueOnce(
        new Error(
          "A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received"
        )
      )
      .mockResolvedValueOnce({
        statusLabel: "Syncing bookmarks",
        lastSyncLabel: "Never synced",
        canSync: true,
        isRunning: true,
        errorLabel: null,
        progressLabel: "Backed up 8 of 42 bookmark items",
        progressPercent: 19
      });

    await expect(requestManualSync()).resolves.toBeUndefined();

    expect(sendMessageMock).toHaveBeenNthCalledWith(1, {
      type: "onesync:sync-now"
    });
    expect(sendMessageMock).toHaveBeenNthCalledWith(2, {
      type: "onesync:get-popup-state"
    });
  });

  it("still rejects unexpected sync trigger errors", async () => {
    sendMessageMock.mockRejectedValueOnce(new Error("background crashed"));

    await expect(requestManualSync()).rejects.toThrow(/background crashed/i);
  });
});
