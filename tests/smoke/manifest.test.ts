import { describe, expect, it } from "vitest";
import { ONESYNC_EXTENSION_NAME } from "../../src/core/shared/types";

describe("workspace scaffold", () => {
  it("exports the extension name", () => {
    expect(ONESYNC_EXTENSION_NAME).toBe("onesync");
  });
});
