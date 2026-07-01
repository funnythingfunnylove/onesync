import browser from "webextension-polyfill";

export async function getAlarm(name: string): Promise<browser.Alarms.Alarm | undefined> {
  return browser.alarms.get(name);
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
