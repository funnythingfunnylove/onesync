export type BookmarkUrlValidationResult =
  | { ok: true; value: string }
  | { ok: false; message: string };

export function validatePrivateBookmarkUrl(rawUrl: string): BookmarkUrlValidationResult {
  const trimmed = rawUrl.trim();

  if (!trimmed) {
    return {
      ok: false,
      message: "Bookmark URL is required."
    };
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(trimmed);
  } catch {
    return {
      ok: false,
      message: "Bookmark URL must be a complete URL."
    };
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return {
      ok: false,
      message: "Bookmark URL must start with http:// or https://."
    };
  }

  return {
    ok: true,
    value: trimmed
  };
}
