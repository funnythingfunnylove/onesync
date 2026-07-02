import { describe, expect, it } from "vitest";
import { getBookmarkSourceDescription, getBookmarkSourceLabel } from "../../src/ui/bookmark-source";

describe("bookmark source copy", () => {
  it("describes native bookmark mode", () => {
    expect(getBookmarkSourceLabel("native")).toBe("Browser bookmarks");
    expect(getBookmarkSourceDescription("native")).toMatch(/native bookmark tree/i);
  });

  it("describes private Safari fallback mode", () => {
    expect(getBookmarkSourceLabel("private")).toBe("Private extension bookmarks");
    expect(getBookmarkSourceDescription("private")).toMatch(/not changing safari's native bookmarks/i);
  });

  it("describes unavailable bookmark access", () => {
    expect(getBookmarkSourceLabel("unavailable")).toBe("Bookmark access unavailable");
    expect(getBookmarkSourceDescription("unavailable")).toMatch(/cannot reach/i);
  });
});
