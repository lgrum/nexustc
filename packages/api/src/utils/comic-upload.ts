import {
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { env } from "@repo/env";
import {
  COMIC_UPLOAD_BATCH_SIZE,
  COMIC_UPLOAD_MAX_BYTES,
} from "@repo/shared/media";

import { getS3Client } from "./s3";

export const COMIC_UPLOAD_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export type ComicUploadObjectMetadata = {
  contentLength?: number;
  contentType?: string;
};

export function getComicUploadPrefix(comicId: string, sessionId: string) {
  return `media/comic/${comicId}/${sessionId}/`;
}

export function ownsComicUploadKeys(
  comicId: string,
  sessionId: string,
  objectKeys: string[]
) {
  const prefix = getComicUploadPrefix(comicId, sessionId);
  return objectKeys.every((objectKey) => objectKey.startsWith(prefix));
}

export function isValidComicUploadObject(object: ComicUploadObjectMetadata) {
  return (
    object.contentType === "image/webp" &&
    typeof object.contentLength === "number" &&
    object.contentLength > 0 &&
    object.contentLength <= COMIC_UPLOAD_MAX_BYTES
  );
}

export async function validateComicUploadObjects(objectKeys: string[]) {
  for (
    let start = 0;
    start < objectKeys.length;
    start += COMIC_UPLOAD_BATCH_SIZE
  ) {
    const objects = await Promise.all(
      objectKeys.slice(start, start + COMIC_UPLOAD_BATCH_SIZE).map(
        async (objectKey) =>
          await getS3Client().send(
            new HeadObjectCommand({
              Bucket: env.R2_ASSETS_BUCKET_NAME,
              Key: objectKey,
            })
          )
      )
    );

    if (
      objects.some(
        (object) =>
          !isValidComicUploadObject({
            contentLength: object.ContentLength,
            contentType: object.ContentType,
          })
      )
    ) {
      return false;
    }
  }

  return true;
}

export async function listComicUploadObjects(
  comicId: string,
  sessionId: string
) {
  const objectKeys: string[] = [];
  const prefix = getComicUploadPrefix(comicId, sessionId);
  let continuationToken: string | undefined;

  do {
    const page = await getS3Client().send(
      new ListObjectsV2Command({
        Bucket: env.R2_ASSETS_BUCKET_NAME,
        ContinuationToken: continuationToken,
        Prefix: prefix,
      })
    );
    objectKeys.push(
      ...(page.Contents ?? [])
        .map((object) => object.Key)
        .filter((key): key is string => Boolean(key))
    );
    continuationToken = page.IsTruncated
      ? page.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return objectKeys;
}

export async function deleteComicUploadObjects(objectKeys: string[]) {
  for (let start = 0; start < objectKeys.length; start += 1000) {
    await getS3Client().send(
      new DeleteObjectsCommand({
        Bucket: env.R2_ASSETS_BUCKET_NAME,
        Delete: {
          Objects: objectKeys
            .slice(start, start + 1000)
            .map((Key) => ({ Key })),
          Quiet: true,
        },
      })
    );
  }
}
