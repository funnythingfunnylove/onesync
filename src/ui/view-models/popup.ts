import browser from "webextension-polyfill";
import type { RuntimeMessage } from "../../core/shared/types";
import { requestSyncTrigger } from "./sync-trigger";

export type PopupViewModel = {
  statusLabel: string;
  lastSyncLabel: string;
  canSync: boolean;
  isRunning: boolean;
  errorLabel: string | null;
  progressLabel: string | null;
  progressPercent: number | null;
};

type PopupStateResponse = {
  statusLabel: string;
  lastSyncLabel: string;
  canSync: boolean;
  isRunning: boolean;
  errorLabel: string | null;
  progressLabel: string | null;
  progressPercent: number | null;
};

export async function loadPopupViewModel(): Promise<PopupViewModel> {
  const response = (await browser.runtime.sendMessage({
    type: "onesync:get-popup-state"
  } satisfies RuntimeMessage)) as PopupStateResponse;

  return {
    ...response
  };
}

export async function requestManualSync(): Promise<void> {
  await requestSyncTrigger();
}
