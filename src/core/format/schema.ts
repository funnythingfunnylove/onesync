import { z } from "zod";
import { BundleValidationError } from "../shared/errors";

const isoDateTimeSchema = z.iso.datetime({ offset: true });

const bookmarkLeafNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal("bookmark"),
  title: z.string(),
  url: z.url(),
  addedAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});

const folderNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal("folder"),
  title: z.string(),
  children: z.array(z.string().min(1)),
  addedAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});

const tombstoneSchema = z.object({
  id: z.string().min(1),
  deletedAt: isoDateTimeSchema
});

export const bookmarkNodeSchema = z.union([bookmarkLeafNodeSchema, folderNodeSchema]);

export const bookmarkBundleSchema = z.object({
  kind: z.literal("onesync.bookmarks"),
  schemaVersion: z.literal(1),
  revision: z.string().min(1),
  deviceId: z.string().min(1),
  generatedAt: isoDateTimeSchema,
  roots: z.object({
    toolbar: z.string().min(1),
    menu: z.string().min(1),
    mobile: z.string().min(1),
    unfiled: z.string().min(1)
  }),
  nodes: z.record(z.string().min(1), bookmarkNodeSchema),
  tombstones: z.array(tombstoneSchema),
  meta: z.object({
    client: z.literal("onesync"),
    clientVersion: z.string().min(1)
  })
});

export const encodedBookmarkBundleSchema = z.object({
  kind: z.literal("onesync.bundle"),
  bundleVersion: z.number().int().positive(),
  encoding: z.literal("base64url+gzip+json"),
  checksum: z.object({
    algorithm: z.literal("sha256"),
    value: z.string().regex(/^[0-9a-f]+$/u)
  }),
  payload: z.string().min(1)
});

export type BookmarkNode = z.infer<typeof bookmarkNodeSchema>;
export type BookmarkBundle = z.infer<typeof bookmarkBundleSchema>;
export type EncodedBookmarkBundle = z.infer<typeof encodedBookmarkBundleSchema>;

function countDescendantNodes(bundle: BookmarkBundle, nodeIds: string[], visited: Set<string>): number {
  let total = 0;

  for (const nodeId of nodeIds) {
    if (visited.has(nodeId)) {
      continue;
    }

    visited.add(nodeId);
    const node = bundle.nodes[nodeId];

    if (!node) {
      continue;
    }

    total += 1;

    if (node.type === "folder") {
      total += countDescendantNodes(bundle, node.children, visited);
    }
  }

  return total;
}

export function countBookmarkItems(bundle: BookmarkBundle): number {
  const visited = new Set<string>();
  let total = 0;

  for (const rootId of Object.values(bundle.roots)) {
    const rootNode = bundle.nodes[rootId];

    if (!rootNode || rootNode.type !== "folder") {
      continue;
    }

    total += countDescendantNodes(bundle, rootNode.children, visited);
  }

  return total;
}

export function normalizeBundle(bundle: BookmarkBundle): BookmarkBundle {
  const parsed = parseBookmarkBundle(bundle);
  const orderedNodes = Object.fromEntries(
    Object.entries(parsed.nodes)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([nodeId, node]) => {
        if (node.type === "folder") {
          return [
            nodeId,
            {
              id: node.id,
              type: "folder" as const,
              title: node.title,
              children: [...node.children],
              addedAt: node.addedAt,
              updatedAt: node.updatedAt
            }
          ];
        }

        return [
          nodeId,
          {
            id: node.id,
            type: "bookmark" as const,
            title: node.title,
            url: node.url,
            addedAt: node.addedAt,
            updatedAt: node.updatedAt
          }
        ];
      })
  );

  const tombstones = [...parsed.tombstones].sort((left, right) => {
    return left.id.localeCompare(right.id) || left.deletedAt.localeCompare(right.deletedAt);
  });

  return {
    kind: "onesync.bookmarks",
    schemaVersion: 1,
    revision: parsed.revision,
    deviceId: parsed.deviceId,
    generatedAt: parsed.generatedAt,
    roots: {
      toolbar: parsed.roots.toolbar,
      menu: parsed.roots.menu,
      mobile: parsed.roots.mobile,
      unfiled: parsed.roots.unfiled
    },
    nodes: orderedNodes,
    tombstones,
    meta: {
      client: "onesync",
      clientVersion: parsed.meta.clientVersion
    }
  };
}

export function parseBookmarkBundle(input: unknown): BookmarkBundle {
  const result = bookmarkBundleSchema.safeParse(input);

  if (!result.success) {
    throw new BundleValidationError(result.error.message);
  }

  return result.data;
}

export function parseEncodedBookmarkBundle(input: unknown): EncodedBookmarkBundle {
  const result = encodedBookmarkBundleSchema.safeParse(input);

  if (!result.success) {
    throw new BundleValidationError(result.error.message);
  }

  return result.data;
}
