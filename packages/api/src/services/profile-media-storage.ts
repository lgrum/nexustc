import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@repo/env";

import { getS3Client } from "../utils/s3";

export type ProfileMediaObject = {
  body: Buffer;
  contentLength: number;
  contentType: string;
};

export type ProfileMediaStorage = {
  deleteObject(objectKey: string): Promise<void>;
  issueUpload(input: {
    contentLength: number;
    contentType: string;
    expiresIn: number;
    objectKey: string;
  }): Promise<{ presignedUrl: string }>;
  putObject(
    objectKey: string,
    body: Buffer,
    contentType: string
  ): Promise<void>;
  readObject(objectKey: string): Promise<ProfileMediaObject>;
};

export const r2ProfileMediaStorage: ProfileMediaStorage = {
  async deleteObject(objectKey) {
    await getS3Client().send(
      new DeleteObjectCommand({
        Bucket: env.R2_ASSETS_BUCKET_NAME,
        Key: objectKey,
      })
    );
  },

  async issueUpload(input) {
    const presignedUrl = await getSignedUrl(
      getS3Client(),
      new PutObjectCommand({
        Bucket: env.R2_ASSETS_BUCKET_NAME,
        ContentLength: input.contentLength,
        ContentType: input.contentType,
        IfNoneMatch: "*",
        Key: input.objectKey,
      }),
      { expiresIn: input.expiresIn }
    );

    return { presignedUrl };
  },

  async putObject(objectKey, body, contentType) {
    await getS3Client().send(
      new PutObjectCommand({
        Body: body,
        Bucket: env.R2_ASSETS_BUCKET_NAME,
        ContentLength: body.byteLength,
        ContentType: contentType,
        IfNoneMatch: "*",
        Key: objectKey,
      })
    );
  },

  async readObject(objectKey) {
    const object = await getS3Client().send(
      new GetObjectCommand({
        Bucket: env.R2_ASSETS_BUCKET_NAME,
        Key: objectKey,
      })
    );
    if (!object.Body || !object.ContentLength || !object.ContentType) {
      throw new Error("Profile Media source metadata is incomplete");
    }

    return {
      body: Buffer.from(await object.Body.transformToByteArray()),
      contentLength: object.ContentLength,
      contentType: object.ContentType,
    };
  },
};
