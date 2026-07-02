export type BookmarkUrlValidationResult =
  | { ok: true; value: string }
  | { ok: false; message: string };

const UNSUPPORTED_BOOKMARK_PROTOCOLS = new Set(["javascript:", "data:", "vbscript:"]);

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

  if (UNSUPPORTED_BOOKMARK_PROTOCOLS.has(parsedUrl.protocol.toLowerCase())) {
    return {
      ok: false,
      message: "Bookmark URL uses an unsupported scheme."
    };
  }

  return {
    ok: true,
    value: trimmed
  };
}
