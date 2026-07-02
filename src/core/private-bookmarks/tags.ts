export type PrivateBookmarkTagOption = {
  id: string;
  label: string;
  color: string;
  colorClass: string;
};

export type PrivateBookmarkTag = {
  text: string;
  color: string;
};

export const PRIVATE_BOOKMARK_TAGS = [
  { id: "work", label: "Work", color: "#e8f1eb", colorClass: "tag-color-work" },
  { id: "read-later", label: "Read later", color: "#f3ecd9", colorClass: "tag-color-read-later" },
  { id: "design", label: "Design", color: "#eee9f3", colorClass: "tag-color-design" },
  { id: "dev", label: "Dev", color: "#e4eef4", colorClass: "tag-color-dev" },
  { id: "research", label: "Research", color: "#f0e7e1", colorClass: "tag-color-research" },
  { id: "tool", label: "Tool", color: "#e8ece2", colorClass: "tag-color-tool" }
] as const satisfies readonly PrivateBookmarkTagOption[];

const CUSTOM_TAG_COLOR_CLASSES = [
  { className: "tag-color-custom-0", color: "#eaf0ec" },
  { className: "tag-color-custom-1", color: "#f1eadf" },
  { className: "tag-color-custom-2", color: "#e7eef2" },
  { className: "tag-color-custom-3", color: "#f1e7e7" },
  { className: "tag-color-custom-4", color: "#eceaf2" },
  { className: "tag-color-custom-5", color: "#e8ece5" }
] as const;

type PrivateBookmarkTagInput = string | Partial<PrivateBookmarkTag>;

function normalizePrivateBookmarkTag(tag: string): string {
  return tag
    .trim()
    .replace(/^#+/u, "")
    .replace(/\s+/gu, " ")
    .toLowerCase()
    .slice(0, 40);
}

function getCustomTagPalette(tagId: string): (typeof CUSTOM_TAG_COLOR_CLASSES)[number] {
  let hash = 0;

  for (const character of tagId) {
    hash = (hash + character.charCodeAt(0)) % CUSTOM_TAG_COLOR_CLASSES.length;
  }

  return CUSTOM_TAG_COLOR_CLASSES[hash] ?? CUSTOM_TAG_COLOR_CLASSES[0];
}

function normalizeColor(color: string | undefined, fallback: string): string {
  const normalizedColor = color?.trim().toLowerCase();

  return normalizedColor && /^#[0-9a-f]{6}$/u.test(normalizedColor)
    ? normalizedColor
    : fallback;
}

export function getPrivateBookmarkTagOption(tagId: string): PrivateBookmarkTagOption {
  const normalizedTagId = normalizePrivateBookmarkTag(tagId);
  const presetTag = PRIVATE_BOOKMARK_TAGS.find((tag) => tag.id === normalizedTagId);

  if (presetTag) {
    return presetTag;
  }

  if (normalizedTagId === "all") {
    return { id: "all", label: "All tags", color: "#f1f0ec", colorClass: "tag-color-all" };
  }

  if (normalizedTagId === "untagged") {
    return { id: "untagged", label: "Untagged", color: "#f1f0ec", colorClass: "tag-color-untagged" };
  }

  const customPalette = getCustomTagPalette(normalizedTagId);

  return {
    id: normalizedTagId,
    label: normalizedTagId,
    color: customPalette.color,
    colorClass: customPalette.className
  };
}

export function normalizePrivateBookmarkTags(tags: readonly PrivateBookmarkTagInput[] | undefined): PrivateBookmarkTag[] {
  const normalizedTags: PrivateBookmarkTag[] = [];

  for (const tag of tags ?? []) {
    const tagText = typeof tag === "string" ? tag : tag.text ?? "";
    const normalizedTag = normalizePrivateBookmarkTag(tagText);

    if (
      !normalizedTag
      || normalizedTag === "all"
      || normalizedTag === "untagged"
      || normalizedTags.some((existingTag) => existingTag.text === normalizedTag)
    ) {
      continue;
    }

    const tagOption = getPrivateBookmarkTagOption(normalizedTag);

    normalizedTags.push({
      text: normalizedTag,
      color: normalizeColor(typeof tag === "string" ? undefined : tag.color, tagOption.color)
    });
  }

  return normalizedTags;
}

export function normalizePrivateBookmarkTagTexts(tags: readonly PrivateBookmarkTagInput[] | undefined): string[] {
  return normalizePrivateBookmarkTags(tags).map((tag) => tag.text);
}
