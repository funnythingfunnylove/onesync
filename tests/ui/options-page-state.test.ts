import { describe, expect, it } from "vitest";
import { shouldLoadPrivateBookmarksState } from "../../entrypoints/options/page-state";

describe("options page private bookmark loading", () => {
  it("skips private bookmark state when rendering non-bookmark pages without an explicit bookmark state need", () => {
    expect(shouldLoadPrivateBookmarksState("workspace")).toBe(false);
    expect(shouldLoadPrivateBookmarksState("activity")).toBe(false);
  });

  it("loads private bookmark state for bookmark manager renders and explicit bookmark rerenders", () => {
    expect(shouldLoadPrivateBookmarksState("bookmarks")).toBe(true);
    expect(shouldLoadPrivateBookmarksState("workspace", {})).toBe(true);
    expect(shouldLoadPrivateBookmarksState("activity", null)).toBe(true);
  });
});
