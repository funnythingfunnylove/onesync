import { browser } from "wxt/browser";

type NativeAlarm = {
  name: string;
  scheduledTime?: number;
  periodInMinutes?: number;
};

export async function getAlarm(name: string): Promise<NativeAlarm | undefined> {
  return (await browser.alarms.get(name)) as NativeAlarm | undefined;
}

export async function createPeriodicAlarm(name: string, periodInMinutes: number): Promise<void> {
  await browser.alarms.create(name, {
    delayInMinutes: periodInMinutes,
    periodInMinutes
  });
}

export async function clearAlarm(name: string): Promise<void> {
  await browser.alarms.clear(name);
}
