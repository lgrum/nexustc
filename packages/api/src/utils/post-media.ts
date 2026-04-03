import { eq, inArray, sql } from "@repo/db";
import { media, postMedia } from "@repo/db/schema/app";

import type { Context } from "../context";

type MediaRow = {
  id: string;
  objectKey: string;
  createdAt: Date;
};

type Database = Pick<Context["db"], "insert" | "select">;

type PostWithMediaRelations = {
  imageObjectKeys?: string[] | null;
  mediaRelations?: {
    sortOrder: number;
    media: MediaRow;
  }[];
};

export type OrderedMediaItem = MediaRow & {
  sortOrder: number;
};

export function createPostImageKeysAggregate(
  db: Pick<Context["db"], "select">
) {
  return db
    .select({
      imageObjectKeys: sql<string[]>`
        COALESCE(
          json_agg(${media.objectKey} ORDER BY ${postMedia.sortOrder})
          FILTER (WHERE ${media.objectKey} IS NOT NULL),
          '[]'::json
        )
      `.as("image_object_keys"),
      postId: postMedia.postId,
    })
    .from(postMedia)
    .innerJoin(media, eq(media.id, postMedia.mediaId))
    .groupBy(postMedia.postId)
    .as("post_image_keys");
}

export function mapPostWithMedia<T extends PostWithMediaRelations>(row: T) {
  const orderedMedia: OrderedMediaItem[] = [...(row.mediaRelations ?? [])]
    .toSorted((left, right) => left.sortOrder - right.sortOrder)
    .map(({ media: mediaRow, sortOrder }) => ({
      ...mediaRow,
      sortOrder,
    }));

  return {
    ...row,
    imageObjectKeys: orderedMedia.map((item) => item.objectKey),
    media: orderedMedia,
  };
}

export async function findOrCreateMediaRecords(
  db: Database,
  objectKeys: string[]
) {
  const uniqueKeys = [...new Set(objectKeys)];
  if (uniqueKeys.length === 0) {
    return [] satisfies MediaRow[];
  }

  const existingRows = await db
    .select({
      createdAt: media.createdAt,
      id: media.id,
      objectKey: media.objectKey,
    })
    .from(media)
    .where(inArray(media.objectKey, uniqueKeys));

  const mediaByKey = new Map(existingRows.map((row) => [row.objectKey, row]));
  const missingKeys = uniqueKeys.filter(
    (objectKey) => !mediaByKey.has(objectKey)
  );

  if (missingKeys.length > 0) {
    await db
      .insert(media)
      .values(missingKeys.map((objectKey) => ({ objectKey })))
      .onConflictDoNothing();

    const insertedRows = await db
      .select({
        createdAt: media.createdAt,
        id: media.id,
        objectKey: media.objectKey,
      })
      .from(media)
      .where(inArray(media.objectKey, missingKeys));

    for (const row of insertedRows) {
      mediaByKey.set(row.objectKey, row);
    }
  }

  return objectKeys.map((objectKey) => {
    const mediaRow = mediaByKey.get(objectKey);
    if (!mediaRow) {
      throw new Error(`Missing media row for object key: ${objectKey}`);
    }
    return mediaRow;
  });
}

export async function getOrderedMediaRecords(
  db: Pick<Context["db"], "select">,
  mediaIds: string[]
) {
  if (mediaIds.length === 0) {
    return [] satisfies MediaRow[];
  }

  const rows = await db
    .select({
      createdAt: media.createdAt,
      id: media.id,
      objectKey: media.objectKey,
    })
    .from(media)
    .where(inArray(media.id, mediaIds));

  const mediaById = new Map(rows.map((row) => [row.id, row]));

  return mediaIds.map((mediaId) => {
    const mediaRow = mediaById.get(mediaId);
    if (!mediaRow) {
      throw new Error(`Missing media row for id: ${mediaId}`);
    }
    return mediaRow;
  });
}
