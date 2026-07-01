import { browser } from "wxt/browser";
import type { RuntimeMessage } from "../../core/shared/types";

type PopupStateProbe = {
  isRunning: boolean;
};

function isClosedAsyncResponseChannelError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    /message channel closed before a response was received/i.test(error.message) ||
    /message port closed before a response was received/i.test(error.message)
  );
}

async function didBackgroundSyncStart(): Promise<boolean> {
  try {
    const popupState = (await browser.runtime.sendMessage({
      type: "onesync:get-popup-state"
    } satisfies RuntimeMessage)) as PopupStateProbe;

    return popupState.isRunning === true;
  } catch {
    return false;
  }
}

export async function requestSyncTrigger(): Promise<void> {
  try {
    await browser.runtime.sendMessage({
      type: "onesync:sync-now"
    } satisfies RuntimeMessage);
  } catch (error) {
    if (!isClosedAsyncResponseChannelError(error)) {
      throw error;
    }

    if (await didBackgroundSyncStart()) {
      return;
    }

    throw new Error("The background service worker stopped before sync could continue. Try again.");
  }
}
