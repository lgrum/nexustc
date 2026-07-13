import {
  DeleteObjectsCommand,
  GetObjectCommand,
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
export const COMIC_UPLOAD_URL_TTL_SECONDS = 60 * 60;
const COMIC_UPLOAD_OBJECT_NAME_PATTERN = /^([1-9]\d*)\.webp$/;
const WEBP_HEADER_END_BYTE = 15;

export type ComicUploadObjectMetadata = {
  contentLength?: number;
  contentType?: string;
};

export function getComicUploadPrefix(comicId: string, sessionId: string) {
  return `media/comic/${comicId}/${sessionId}/`;
}

export function getComicUploadObjectKey(
  comicId: string,
  sessionId: string,
  objectIndex: number
) {
  return `${getComicUploadPrefix(comicId, sessionId)}${objectIndex}.webp`;
}

export function isIssuedComicUploadObjectKey(
  comicId: string,
  sessionId: string,
  objectKey: string,
  issuedObjectCount: number
) {
  const prefix = getComicUploadPrefix(comicId, sessionId);
  const match = objectKey.startsWith(prefix)
    ? COMIC_UPLOAD_OBJECT_NAME_PATTERN.exec(objectKey.slice(prefix.length))
    : null;
  const objectIndex = Number(match?.[1]);
  return Number.isSafeInteger(objectIndex) && objectIndex <= issuedObjectCount;
}

export function ownsComicUploadKeys(
  comicId: string,
  sessionId: string,
  objectKeys: string[]
) {
  const prefix = getComicUploadPrefix(comicId, sessionId);
  return objectKeys.every((objectKey) => objectKey.startsWith(prefix));
}

export function getUnreferencedComicUploadKeys(
  uploadedObjectKeys: string[],
  referencedObjectKeys: string[]
) {
  const referencedKeys = new Set(referencedObjectKeys);
  return uploadedObjectKeys.filter(
    (objectKey) => !referencedKeys.has(objectKey)
  );
}

export function isValidComicUploadObject(object: ComicUploadObjectMetadata) {
  return (
    object.contentType === "image/webp" &&
    typeof object.contentLength === "number" &&
    object.contentLength > 0 &&
    object.contentLength <= COMIC_UPLOAD_MAX_BYTES
  );
}

export function isWebpHeader(bytes: Uint8Array) {
  if (bytes.byteLength < WEBP_HEADER_END_BYTE + 1) {
    return false;
  }

  const isRiff =
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46;
  const isWebp =
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;
  const isSupportedChunk =
    bytes[12] === 0x56 &&
    bytes[13] === 0x50 &&
    bytes[14] === 0x38 &&
    (bytes[15] === 0x20 || bytes[15] === 0x4c || bytes[15] === 0x58);

  return isRiff && isWebp && isSupportedChunk;
}

export async function validateComicUploadObjects(objectKeys: string[]) {
  for (
    let start = 0;
    start < objectKeys.length;
    start += COMIC_UPLOAD_BATCH_SIZE
  ) {
    const objects = await Promise.all(
      objectKeys
        .slice(start, start + COMIC_UPLOAD_BATCH_SIZE)
        .map(async (objectKey) => {
          const [metadata, headerObject] = await Promise.all([
            getS3Client().send(
              new HeadObjectCommand({
                Bucket: env.R2_ASSETS_BUCKET_NAME,
                Key: objectKey,
              })
            ),
            getS3Client().send(
              new GetObjectCommand({
                Bucket: env.R2_ASSETS_BUCKET_NAME,
                Key: objectKey,
                Range: `bytes=0-${WEBP_HEADER_END_BYTE}`,
              })
            ),
          ]);
          const header = await headerObject.Body?.transformToByteArray();

          return { header, metadata };
        })
    );

    if (
      objects.some(
        (object) =>
          !isValidComicUploadObject({
            contentLength: object.metadata.ContentLength,
            contentType: object.metadata.ContentType,
          }) ||
          !object.header ||
          !isWebpHeader(object.header)
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
