import { eq } from "@repo/db";
import { media } from "@repo/db/schema/app";

import type { Context } from "../context";

type ManagedMediaDb = Pick<Context["db"], "query">;

export async function getManagedMediaAsset(
  db: ManagedMediaDb,
  mediaId: string
) {
  const mediaRecord = await db.query.media.findFirst({
    columns: {
      id: true,
      objectKey: true,
    },
    where: eq(media.id, mediaId),
  });

  if (!mediaRecord) {
    throw new Error(`Media not found: ${mediaId}`);
  }

  const extension = mediaRecord.objectKey.split(".").pop()?.toLowerCase();

  if (!extension) {
    throw new Error(
      `Could not determine asset format for media ${mediaRecord.id}`
    );
  }

  return {
    assetFormat: extension,
    assetKey: mediaRecord.objectKey,
    id: mediaRecord.id,
  };
}
