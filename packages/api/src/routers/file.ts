import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getLogger } from "@orpc/experimental-pino";
import { env } from "@repo/env";
import z from "zod";

import { protectedProcedure } from "../index";
import { getS3Client } from "../utils/s3";

const AVATAR_MAX_SIZE_BYTES = 1024 * 512; // 512KB

export default {
  getAvatarUploadUrl: protectedProcedure
    .input(
      z.object({
        contentLength: z.number().max(AVATAR_MAX_SIZE_BYTES),
        contentType: z.enum(["image/webp", "image/gif"]),
      })
    )
    .handler(async ({ context: { session, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info(
        `Generating presigned URL for avatar upload for user: ${session.user.id}`
      );

      const key = `avatar/${session.user.id}.webp`;
      const url = await getSignedUrl(
        getS3Client(),
        new PutObjectCommand({
          Bucket: env.R2_ASSETS_BUCKET_NAME,
          ContentLength: input.contentLength,
          ContentType: "image/webp",
          Key: key,
        }),
        { expiresIn: 3600 }
      );

      logger?.debug(
        `Avatar presigned URL generated for user ${session.user.id}`
      );
      return url;
    }),
};
