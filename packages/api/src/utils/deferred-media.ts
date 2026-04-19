import { DeleteObjectsCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { and, isNull } from "@repo/db";
import { media, mediaFolder } from "@repo/db/schema/app";
import { generateId } from "@repo/db/utils";
import { env } from "@repo/env";
import { MEDIA_IMAGE_MIME_TYPES } from "@repo/shared/media";
import type { MediaOwnerKind } from "@repo/shared/media";
import {
  comicCreateSchema,
  comicEditSchema,
  globalAnnouncementSchema,
  newsArticleCreateSchema,
  postCreateSchema,
  postEditSchema,
  thumbnailImageCountSchema,
} from "@repo/shared/schemas";
import z from "zod";

import type { Context } from "../context";
import { optimizeFile } from "./images";
import { getOrderedMediaRecords } from "./post-media";
import { getS3Client } from "./s3";

const FALLBACK_FOLDER_NAME = "Sin nombre";
const FALLBACK_STORAGE_SEGMENT = "sin-nombre";

const deferredExistingMediaItemSchema = z.object({
  kind: z.literal("existing"),
  mediaId: z.string().min(1),
});

const deferredPendingMediaItemSchema = z.object({
  file: z.file().mime([...MEDIA_IMAGE_MIME_TYPES]),
  kind: z.literal("pending"),
});

export const deferredMediaItemInputSchema = z.discriminatedUnion("kind", [
  deferredExistingMediaItemSchema,
  deferredPendingMediaItemSchema,
]);

export const deferredMediaSelectionInputSchema = z
  .array(deferredMediaItemInputSchema)
  .max(100);

export const requiredSingleDeferredMediaSelectionInputSchema =
  deferredMediaSelectionInputSchema.min(1).max(1);

export const optionalSingleDeferredMediaSelectionInputSchema =
  deferredMediaSelectionInputSchema.max(1);

export const postCreateInputSchema = postCreateSchema
  .omit({ coverMediaIds: true, mediaIds: true })
  .extend({
    coverImageSelection:
      optionalSingleDeferredMediaSelectionInputSchema.default([]),
    mediaSelection: deferredMediaSelectionInputSchema,
    thumbnailImageCount: thumbnailImageCountSchema.default(4),
  });

export const postEditInputSchema = postEditSchema
  .omit({ coverMediaIds: true, mediaIds: true })
  .extend({
    coverImageSelection:
      optionalSingleDeferredMediaSelectionInputSchema.default([]),
    mediaSelection: deferredMediaSelectionInputSchema,
    thumbnailImageCount: thumbnailImageCountSchema.default(4),
  });

export const comicCreateInputSchema = comicCreateSchema
  .omit({ coverMediaIds: true, mediaIds: true })
  .extend({
    coverImageSelection:
      optionalSingleDeferredMediaSelectionInputSchema.default([]),
    mediaSelection: deferredMediaSelectionInputSchema,
    thumbnailImageCount: thumbnailImageCountSchema.default(1),
  });

export const comicEditInputSchema = comicEditSchema
  .omit({ coverMediaIds: true, mediaIds: true })
  .extend({
    coverImageSelection:
      optionalSingleDeferredMediaSelectionInputSchema.default([]),
    mediaSelection: deferredMediaSelectionInputSchema,
    thumbnailImageCount: thumbnailImageCountSchema.default(1),
  });

export const contentCreateInputSchema = z.discriminatedUnion("type", [
  postCreateInputSchema,
  comicCreateInputSchema,
]);

export const contentEditInputSchema = z.discriminatedUnion("type", [
  postEditInputSchema,
  comicEditInputSchema,
]);

export const globalAnnouncementCreateInputSchema = globalAnnouncementSchema
  .omit({ imageObjectKey: true })
  .extend({
    imageSelection: optionalSingleDeferredMediaSelectionInputSchema,
  });

export const newsArticleCreateInputSchema = newsArticleCreateSchema
  .omit({ bannerImageObjectKey: true })
  .extend({
    bannerImageSelection: optionalSingleDeferredMediaSelectionInputSchema,
  });

export type ContentCreateInput = z.infer<typeof contentCreateInputSchema>;
export type ContentEditInput = z.infer<typeof contentEditInputSchema>;
export type DeferredMediaSelectionInput = z.infer<
  typeof deferredMediaSelectionInputSchema
>;

export type PersistedMediaRecord = {
  createdAt: Date;
  folderId?: string | null;
  id: string;
  objectKey: string;
};

type FolderLookupDb = Pick<Context["db"], "insert" | "query">;
type DeferredMediaTx = Parameters<
  Parameters<Context["db"]["transaction"]>[0]
>[0];

function normalizeFolderName(name: string) {
  const normalized = name
    .normalize("NFKC")
    .replaceAll(/[\\/]+/g, " - ")
    .replaceAll(/\s+/g, " ")
    .trim();

  return normalized || FALLBACK_FOLDER_NAME;
}

function normalizeStorageSegment(name: string) {
  const normalized = name
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036F]/g, "")
    .replaceAll(/[^a-zA-Z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .toLowerCase();

  return normalized || FALLBACK_STORAGE_SEGMENT;
}

function getFolderNames(ownerKind: MediaOwnerKind, resourceName: string) {
  if (ownerKind === "Creador") {
    return [ownerKind];
  }

  const normalizedResourceName = normalizeFolderName(resourceName);
  return [ownerKind, normalizedResourceName];
}

async function findFolderByName(
  db: FolderLookupDb,
  name: string,
  parentId: string | null
) {
  return await db.query.mediaFolder.findFirst({
    columns: {
      id: true,
      name: true,
      parentId: true,
    },
    where: (table, operators) =>
      parentId
        ? and(
            operators.eq(table.name, name),
            operators.eq(table.parentId, parentId)
          )
        : and(operators.eq(table.name, name), isNull(table.parentId)),
  });
}

async function ensureFolderPath(
  db: FolderLookupDb,
  folderNames: string[]
): Promise<string | null> {
  let parentId: string | null = null;

  for (const folderName of folderNames) {
    const existingFolder = await findFolderByName(db, folderName, parentId);

    if (existingFolder) {
      parentId = existingFolder.id;
      continue;
    }

    const [createdFolder]: { id: string }[] = await db
      .insert(mediaFolder)
      .values({
        name: folderName,
        parentId,
      })
      .returning({
        id: mediaFolder.id,
      });

    if (!createdFolder) {
      throw new Error(`Failed to create media folder "${folderName}"`);
    }

    parentId = createdFolder.id;
  }

  return parentId;
}

async function cleanupUploadedObjects(objectKeys: string[]) {
  if (objectKeys.length === 0) {
    return;
  }

  await getS3Client().send(
    new DeleteObjectsCommand({
      Bucket: env.R2_ASSETS_BUCKET_NAME,
      Delete: {
        Objects: objectKeys.map((objectKey) => ({
          Key: objectKey,
        })),
        Quiet: false,
      },
    })
  );
}

function buildObjectKey(folderNames: string[], extension = "webp") {
  const storageSegments = folderNames.map((folderName) =>
    normalizeStorageSegment(folderName)
  );

  return ["media", ...storageSegments, `${generateId()}.${extension}`].join(
    "/"
  );
}

export async function persistDeferredMediaSelection(params: {
  db: Context["db"];
  ownerKind: MediaOwnerKind;
  resourceName: string;
  selection: DeferredMediaSelectionInput;
}) {
  return await withDeferredMediaSelection({
    ...params,
    onComplete: ({ orderedMedia }) => Promise.resolve(orderedMedia),
  });
}

async function materializeDeferredMediaSelection(params: {
  ownerKind: MediaOwnerKind;
  pendingObjectKeys: string[];
  resourceName: string;
  selection: DeferredMediaSelectionInput;
  tx: DeferredMediaTx;
}) {
  const { ownerKind, pendingObjectKeys, resourceName, selection, tx } = params;

  if (selection.length === 0) {
    return [] satisfies PersistedMediaRecord[];
  }

  const folderNames = getFolderNames(ownerKind, resourceName);
  const existingMediaIds = selection
    .filter(
      (item): item is z.infer<typeof deferredExistingMediaItemSchema> =>
        item.kind === "existing"
    )
    .map((item) => item.mediaId);
  const existingMediaQueue = await getOrderedMediaRecords(tx, existingMediaIds);
  const pendingMediaQueue: PersistedMediaRecord[] = [];
  const folderId =
    pendingObjectKeys.length > 0
      ? await ensureFolderPath(tx, folderNames)
      : null;

  for (const objectKey of pendingObjectKeys) {
    const [createdMedia] = await tx
      .insert(media)
      .values({
        folderId,
        objectKey,
      })
      .returning({
        createdAt: media.createdAt,
        folderId: media.folderId,
        id: media.id,
        objectKey: media.objectKey,
      });

    if (!createdMedia) {
      throw new Error(`Failed to create media row for ${objectKey}`);
    }

    pendingMediaQueue.push(createdMedia);
  }

  return selection.map((item) => {
    const nextMedia =
      item.kind === "existing"
        ? existingMediaQueue.shift()
        : pendingMediaQueue.shift();

    if (!nextMedia) {
      throw new Error("Failed to resolve deferred media selection order");
    }

    return nextMedia;
  });
}

export async function withDeferredMediaSelection<T>(params: {
  db: Context["db"];
  onComplete: (params: {
    orderedMedia: PersistedMediaRecord[];
    tx: DeferredMediaTx;
  }) => Promise<T>;
  ownerKind: MediaOwnerKind;
  resourceName: string;
  selection: DeferredMediaSelectionInput;
}) {
  return await withDeferredMediaSelections({
    db: params.db,
    onComplete: async ({ orderedSelections, tx }) =>
      await params.onComplete({
        orderedMedia: orderedSelections[0] ?? [],
        tx,
      }),
    ownerKind: params.ownerKind,
    resourceName: params.resourceName,
    selections: [params.selection],
  });
}

export async function withDeferredMediaSelections<T>(params: {
  db: Context["db"];
  onComplete: (params: {
    orderedSelections: PersistedMediaRecord[][];
    tx: DeferredMediaTx;
  }) => Promise<T>;
  ownerKind: MediaOwnerKind;
  resourceName: string;
  selections: DeferredMediaSelectionInput[];
}) {
  const { db, ownerKind, resourceName, selections } = params;

  const folderNames = getFolderNames(ownerKind, resourceName);
  const pendingItemsBySelection = selections.map((selection) =>
    selection.filter(
      (item): item is z.infer<typeof deferredPendingMediaItemSchema> =>
        item.kind === "pending"
    )
  );
  const uploadedObjectKeys: string[] = [];
  const pendingUploadQueues = selections.map(() => [] as string[]);

  if (selections.every((selection) => selection.length === 0)) {
    return await db.transaction(
      async (tx) =>
        await params.onComplete({
          orderedSelections: selections.map(() => []),
          tx,
        })
    );
  }

  try {
    for (const [
      selectionIndex,
      pendingItems,
    ] of pendingItemsBySelection.entries()) {
      for (const pendingItem of pendingItems) {
        const { buffer, extension, mimeType } = await optimizeFile(
          pendingItem.file
        );
        const objectKey = buildObjectKey(folderNames, extension);

        await getS3Client().send(
          new PutObjectCommand({
            Body: buffer,
            Bucket: env.R2_ASSETS_BUCKET_NAME,
            ContentLength: buffer.byteLength,
            ContentType: mimeType,
            Key: objectKey,
          })
        );

        uploadedObjectKeys.push(objectKey);
        pendingUploadQueues[selectionIndex]?.push(objectKey);
      }
    }

    return await db.transaction(async (tx) => {
      const orderedSelections: PersistedMediaRecord[][] = [];

      for (const [selectionIndex, selection] of selections.entries()) {
        const orderedMedia = await materializeDeferredMediaSelection({
          ownerKind,
          pendingObjectKeys: pendingUploadQueues[selectionIndex] ?? [],
          resourceName,
          selection,
          tx,
        });

        orderedSelections.push(orderedMedia);
      }

      return await params.onComplete({
        orderedSelections,
        tx,
      });
    });
  } catch (error) {
    try {
      await cleanupUploadedObjects(uploadedObjectKeys);
    } catch {
      // Best-effort cleanup. The original error remains the primary failure.
    }

    throw error;
  }
}

export async function persistSingleDeferredMediaSelection(params: {
  db: Context["db"];
  ownerKind: MediaOwnerKind;
  resourceName: string;
  selection: DeferredMediaSelectionInput;
}) {
  const [mediaRecord] = await persistDeferredMediaSelection(params);
  return mediaRecord ?? null;
}
