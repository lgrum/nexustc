import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getLogger } from "@orpc/experimental-pino";
import { eq, getRedis } from "@repo/db";
import { profileMediaAsset, profileSettings, user } from "@repo/db/schema/app";
import { generateId } from "@repo/db/utils";
import { env } from "@repo/env";
import { PATRON_TIERS } from "@repo/shared/constants";
import z from "zod";

import { protectedProcedure, publicProcedure } from "../index";
import {
  buildProfileSummaries,
  getObjectExtension,
  getOrCreateProfileSettings,
  getProfileEntitlements,
  getPublicProfile,
  inspectProfileMediaAsset,
  PROFILE_MEDIA_MAX_BYTES,
  resolveProfileVisibility,
  validateProfileMediaUpload,
} from "../services/profile";
import {
  consumeProfileMediaUploadIntent,
  createProfileMediaUploadIntent,
  deleteProfileMediaUploadIntent,
  getProfileMediaUploadCooldownKey,
  PROFILE_MEDIA_UPLOAD_COOLDOWN_SECONDS,
  reserveProfileMediaUploadCooldown,
} from "../utils/profile-media-cooldown";
import { getS3Client } from "../utils/s3";

const colorSchema = z.string().regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/);
const uploadContentTypeSchema = z.enum([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const visibilityUpdateSchema = z
  .object({
    favorites: z.boolean().optional(),
    reviews: z.boolean().optional(),
  })
  .refine(
    (visibility) =>
      visibility.favorites !== undefined || visibility.reviews !== undefined,
    { message: "Debes actualizar al menos una preferencia de privacidad." }
  );

function getUploadObjectKey(
  slot: "avatar" | "banner",
  userId: string,
  contentType: string
) {
  const extension = getObjectExtension(contentType);
  return `profiles/${slot}/${userId}/${generateId()}.${extension}`;
}

export default {
  finalizeUpload: protectedProcedure
    .input(
      z.object({
        contentLength: z.number().int().positive().max(PROFILE_MEDIA_MAX_BYTES),
        contentType: uploadContentTypeSchema,
        objectKey: z.string().min(1),
        slot: z.enum(["avatar", "banner"]),
      })
    )
    .handler(async ({ context: { db, session, ...ctx }, input, errors }) => {
      const logger = getLogger(ctx);
      logger?.info(
        `Finalizing ${input.slot} upload for user ${session.user.id}`
      );

      const expectedPrefix = `profiles/${input.slot}/${session.user.id}/`;
      if (!input.objectKey.startsWith(expectedPrefix)) {
        throw errors.FORBIDDEN({ message: "Asset inválido." });
      }

      const deleteRejectedUpload = async () => {
        try {
          await getS3Client().send(
            new DeleteObjectCommand({
              Bucket: env.R2_ASSETS_BUCKET_NAME,
              Key: input.objectKey,
            })
          );
        } catch (cleanupError) {
          logger?.warn(`Failed to delete rejected asset ${input.objectKey}`);
          logger?.warn(cleanupError);
        }
      };

      const cache = await getRedis();
      const intent = await consumeProfileMediaUploadIntent(
        cache,
        input.objectKey
      );
      if (!intent) {
        throw errors.BAD_REQUEST({ message: "Invalid upload intent." });
      }

      if (
        intent.issuedToUserId !== session.user.id ||
        intent.slot !== input.slot ||
        intent.objectKey !== input.objectKey ||
        intent.contentType !== input.contentType ||
        intent.contentLength !== input.contentLength
      ) {
        await deleteRejectedUpload();
        throw errors.BAD_REQUEST({ message: "Invalid upload intent." });
      }

      const entitlements = await getProfileEntitlements(
        db,
        session.user.id,
        session.user.role
      );
      let validation: Awaited<ReturnType<typeof inspectProfileMediaAsset>>;

      try {
        validation = await inspectProfileMediaAsset(input.objectKey, {
          contentLength: input.contentLength,
          contentType: input.contentType,
        });
        validateProfileMediaUpload({
          contentType: input.contentType,
          entitlements,
          slot: input.slot,
          validation,
        });
      } catch (error) {
        await deleteRejectedUpload();
        throw errors.BAD_REQUEST({
          message: error instanceof Error ? error.message : "Asset inválido.",
        });
      }

      let asset: typeof profileMediaAsset.$inferSelect | undefined;

      try {
        [asset] = await db
          .insert(profileMediaAsset)
          .values({
            durationMs: validation.durationMs,
            fileSizeBytes: validation.fileSizeBytes,
            height: validation.height,
            isAnimated: validation.isAnimated,
            mimeType: input.contentType,
            objectKey: input.objectKey,
            ownerUserId: session.user.id,
            slot: input.slot,
            validationStatus: "ready",
            width: validation.width,
          })
          .returning();
      } catch (error) {
        await deleteRejectedUpload();
        throw error;
      }

      if (input.slot === "avatar") {
        await db
          .update(user)
          .set({ image: input.objectKey })
          .where(eq(user.id, session.user.id));
      } else {
        await getOrCreateProfileSettings(db, session.user.id);
        await db
          .update(profileSettings)
          .set({ bannerAssetId: asset!.id, bannerMode: "image" })
          .where(eq(profileSettings.userId, session.user.id));
      }

      return {
        assetId: asset!.id,
        isAnimated: asset!.isAnimated,
        objectKey: asset!.objectKey,
      };
    }),

  getMySettings: protectedProcedure.handler(
    async ({ context: { db, session, ...ctx } }) => {
      const logger = getLogger(ctx);
      logger?.info(`Fetching profile settings for user ${session.user.id}`);
      const [summary] = await buildProfileSummaries(db, [session.user.id]);
      const settings = await getOrCreateProfileSettings(db, session.user.id);
      const entitlements = await getProfileEntitlements(
        db,
        session.user.id,
        session.user.role
      );
      const bannerAsset = settings.bannerAssetId
        ? await db.query.profileMediaAsset.findFirst({
            where: eq(profileMediaAsset.id, settings.bannerAssetId),
          })
        : null;

      return {
        entitlements,
        labels: {
          animatedAvatarRequiredTier:
            PATRON_TIERS[entitlements.animatedAvatarRequiredTier].badge ??
            entitlements.animatedAvatarRequiredTier,
          animatedBannerRequiredTier:
            PATRON_TIERS[entitlements.animatedBannerRequiredTier].badge ??
            entitlements.animatedBannerRequiredTier,
          uploadedBannerRequiredTier:
            PATRON_TIERS[entitlements.uploadedBannerRequiredTier].badge ??
            entitlements.uploadedBannerRequiredTier,
        },
        settings: {
          avatarFallbackColor: session.user.avatarFallbackColor,
          bannerAsset: bannerAsset
            ? {
                id: bannerAsset.id,
                isAnimated: bannerAsset.isAnimated,
                mimeType: bannerAsset.mimeType,
                objectKey: bannerAsset.objectKey,
              }
            : null,
          bannerColor: settings.bannerColor,
          bannerMode: settings.bannerMode,
          visibility: resolveProfileVisibility(settings.visibilityConfig),
        },
        summary: summary ?? null,
      };
    }
  ),

  getPublic: publicProcedure
    .input(z.object({ userId: z.string() }))
    .handler(({ context: { db, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info(`Fetching public profile for user ${input.userId}`);
      return getPublicProfile(db, input.userId);
    }),

  getSummary: publicProcedure
    .input(z.object({ userId: z.string() }))
    .handler(async ({ context: { db, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info(`Fetching profile summary for user ${input.userId}`);
      const [summary] = await buildProfileSummaries(db, [input.userId]);
      return summary ?? null;
    }),

  getUploadPolicy: protectedProcedure
    .input(
      z.object({
        contentLength: z.number().int().positive().max(PROFILE_MEDIA_MAX_BYTES),
        contentType: uploadContentTypeSchema,
        slot: z.enum(["avatar", "banner"]),
      })
    )
    .handler(async ({ context: { db, session, ...ctx }, input, errors }) => {
      const logger = getLogger(ctx);
      logger?.info(
        `Generating upload policy for ${input.slot} by user ${session.user.id}`
      );
      const entitlements = await getProfileEntitlements(
        db,
        session.user.id,
        session.user.role
      );

      if (input.slot === "banner" && !entitlements.canUseUploadedBanner) {
        throw errors.FORBIDDEN({ message: "No puedes subir banners." });
      }

      const cache = await getRedis();
      const cooldown = await reserveProfileMediaUploadCooldown(
        cache,
        getProfileMediaUploadCooldownKey(session.user.id, input.slot)
      );

      if (!cooldown.reserved) {
        throw errors.RATE_LIMITED({
          data: { retryAfter: cooldown.retryAfter },
        });
      }

      const objectKey = getUploadObjectKey(
        input.slot,
        session.user.id,
        input.contentType
      );
      const intentCreated = await createProfileMediaUploadIntent(cache, {
        contentLength: input.contentLength,
        contentType: input.contentType,
        issuedToUserId: session.user.id,
        objectKey,
        slot: input.slot,
      });
      if (!intentCreated) {
        throw errors.INTERNAL_SERVER_ERROR();
      }

      try {
        const presignedUrl = await getSignedUrl(
          getS3Client(),
          new PutObjectCommand({
            Bucket: env.R2_ASSETS_BUCKET_NAME,
            ContentLength: input.contentLength,
            ContentType: input.contentType,
            IfNoneMatch: "*",
            Key: objectKey,
          }),
          { expiresIn: PROFILE_MEDIA_UPLOAD_COOLDOWN_SECONDS }
        );

        return { objectKey, presignedUrl };
      } catch (error) {
        try {
          await deleteProfileMediaUploadIntent(cache, objectKey);
        } catch (cleanupError) {
          logger?.warn(`Failed to delete upload intent for ${objectKey}`);
          logger?.warn(cleanupError);
        }
        throw error;
      }
    }),

  removeAvatar: protectedProcedure.handler(
    async ({ context: { db, session, ...ctx } }) => {
      const logger = getLogger(ctx);
      logger?.info(`Removing avatar for user ${session.user.id}`);
      await db
        .update(user)
        .set({ image: null })
        .where(eq(user.id, session.user.id));
      return { success: true };
    }
  ),

  removeBanner: protectedProcedure.handler(
    async ({ context: { db, session, ...ctx } }) => {
      const logger = getLogger(ctx);
      logger?.info(`Removing banner for user ${session.user.id}`);
      await getOrCreateProfileSettings(db, session.user.id);
      await db
        .update(profileSettings)
        .set({ bannerAssetId: null, bannerMode: "color" })
        .where(eq(profileSettings.userId, session.user.id));
      return { success: true };
    }
  ),

  updateVisibility: protectedProcedure
    .input(visibilityUpdateSchema)
    .handler(async ({ context: { db, session, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info(`Updating visibility settings for user ${session.user.id}`);
      const settings = await getOrCreateProfileSettings(db, session.user.id);
      const visibility = {
        ...resolveProfileVisibility(settings.visibilityConfig),
        ...input,
      };

      await db
        .update(profileSettings)
        .set({ visibilityConfig: visibility })
        .where(eq(profileSettings.userId, session.user.id));

      return { visibility };
    }),

  updateAppearance: protectedProcedure
    .input(
      z.object({
        avatarFallbackColor: colorSchema,
        bannerAssetId: z.string().nullable().optional(),
        bannerColor: colorSchema,
        bannerMode: z.enum(["color", "image"]),
      })
    )
    .handler(async ({ context: { db, session, ...ctx }, input, errors }) => {
      const logger = getLogger(ctx);
      logger?.info(`Updating appearance settings for user ${session.user.id}`);

      const entitlements = await getProfileEntitlements(
        db,
        session.user.id,
        session.user.role
      );
      const currentSettings = await getOrCreateProfileSettings(
        db,
        session.user.id
      );

      if (input.bannerMode === "image") {
        if (!entitlements.canUseUploadedBanner) {
          throw errors.FORBIDDEN({
            message: "No puedes usar banners subidos.",
          });
        }

        if (!input.bannerAssetId) {
          throw errors.BAD_REQUEST({
            message: "Se requiere un banner subido.",
          });
        }

        const asset = await db.query.profileMediaAsset.findFirst({
          where: eq(profileMediaAsset.id, input.bannerAssetId),
        });

        if (
          !(
            asset &&
            asset.ownerUserId === session.user.id &&
            asset.slot === "banner"
          )
        ) {
          throw errors.FORBIDDEN({ message: "Banner inválido." });
        }
      }

      await Promise.all([
        db
          .update(user)
          .set({ avatarFallbackColor: input.avatarFallbackColor })
          .where(eq(user.id, session.user.id)),
        db
          .update(profileSettings)
          .set({
            bannerAssetId:
              input.bannerMode === "image"
                ? (input.bannerAssetId ?? currentSettings.bannerAssetId)
                : null,
            bannerColor: input.bannerColor,
            bannerMode: input.bannerMode,
          })
          .where(eq(profileSettings.userId, session.user.id)),
      ]);

      return { success: true };
    }),
};
