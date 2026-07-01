import { afterEach, describe, expect, it } from "vitest";
import { resetSyncSingleFlightForTests, runSyncSingleFlight } from "../../src/core/sync/singleflight";

afterEach(() => {
  resetSyncSingleFlightForTests();
});

describe("sync singleflight", () => {
  it("reuses the same in-flight sync promise", async () => {
    let resolveSync!: (value: string) => void;
    let callCount = 0;

    const createSync = () =>
      runSyncSingleFlight(async () => {
        callCount += 1;
        return await new Promise<string>((resolve) => {
          resolveSync = resolve;
        });
      });

    const first = createSync();
    const second = createSync();

    expect(callCount).toBe(1);
    expect(second).toBe(first);

    resolveSync("done");

    await expect(first).resolves.toBe("done");
    await expect(second).resolves.toBe("done");
  });

  it("allows a new sync after the previous one fails", async () => {
    let callCount = 0;

    await expect(
      runSyncSingleFlight(async () => {
        callCount += 1;
        throw new Error("sync failed");
      })
    ).rejects.toThrow(/sync failed/i);

    await expect(
      runSyncSingleFlight(async () => {
        callCount += 1;
        return "retry ok";
      })
    ).resolves.toBe("retry ok");

    expect(callCount).toBe(2);
  });
});
