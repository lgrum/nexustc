import { getLogger } from "@orpc/experimental-pino";
import { eq, getRedis, sql } from "@repo/db";
import { profileMediaAsset, profileSettings, user } from "@repo/db/schema/app";
import { env } from "@repo/env";
import { PATRON_TIERS } from "@repo/shared/constants";
import { profileCustomizationDraftSchema } from "@repo/shared/profile-customization";
import z from "zod";

import {
  protectedProcedure,
  publicProcedure,
  slidingWindowRatelimitMiddleware,
} from "../index";
import { EterisError } from "../services/eteris";
import {
  buildProfileSummaries,
  getOrCreateProfileSettings,
  getProfileCustomizationScalarPreview,
  getProfileEntitlements,
  getPublicScalarProfileShowcases,
  getPublicCurrentStreakForUser,
  getPublicProfile,
  resolveProfileVisibility,
} from "../services/profile";
import {
  ProfileCatalogPurchaseError,
  purchaseProfileCatalogItem,
} from "../services/profile-catalog-purchase";
import {
  loadProfileCustomizationEditorState,
  ProfileCustomizationError,
  saveProfileCustomization,
} from "../services/profile-customization";
import {
  loadFavoriteGamesEditorState,
  searchPublicFavoriteGames,
} from "../services/profile-favorite-games";
import {
  finalizeProfileMediaUpload,
  issueProfileMediaUpload,
  ProfileMediaError,
  PROFILE_MEDIA_OWNER_SOURCE_MAX_BYTES,
  removeUserProfileMedia,
} from "../services/profile-media";
import { r2ProfileMediaStorage } from "../services/profile-media-storage";

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
    streak: z.boolean().optional(),
  })
  .refine(
    (visibility) =>
      visibility.favorites !== undefined ||
      visibility.reviews !== undefined ||
      visibility.streak !== undefined,
    { message: "Debes actualizar al menos una preferencia de privacidad." }
  );

function throwProfileMediaError(
  error: unknown,
  errors: Parameters<
    Parameters<typeof protectedProcedure.handler>[0]
  >[0]["errors"]
): never {
  if (!(error instanceof ProfileMediaError)) {
    throw error;
  }
  if (error.code === "RATE_LIMITED") {
    throw errors.RATE_LIMITED({
      data: { retryAfter: error.data?.retryAfter ?? 0 },
    });
  }
  if (error.code === "BANNER_NOT_ALLOWED") {
    throw errors.FORBIDDEN({ message: "No puedes subir banners." });
  }
  if (error.code === "INVALID_OBJECT_KEY") {
    throw errors.FORBIDDEN({ message: "Asset inválido." });
  }

  const message =
    error.code === "INVALID_INTENT"
      ? "Invalid upload intent."
      : error.code === "SOURCE_TOO_LARGE" || error.code === "OUTPUT_TOO_LARGE"
        ? "El archivo es demasiado grande."
        : error.code === "ANIMATION_NOT_ALLOWED"
          ? "No puedes usar este contenido animado."
          : "Asset inválido.";
  throw errors.BAD_REQUEST({ message });
}

export default {
  getFavoriteGamesEditorState: protectedProcedure.handler(
    ({ context: { db, session }, errors }) => {
      if (!env.PROFILE_CUSTOMIZATION_ENABLED) {
        throw errors.NOT_FOUND();
      }
      return loadFavoriteGamesEditorState(db, session.user.id);
    }
  ),

  searchFavoriteGames: protectedProcedure
    .input(z.object({ search: z.string().max(80).default("") }))
    .handler(({ context: { db }, errors, input }) => {
      if (!env.PROFILE_CUSTOMIZATION_ENABLED) {
        throw errors.NOT_FOUND();
      }
      return searchPublicFavoriteGames(db, input.search);
    }),

  getCustomizationEditorState: protectedProcedure.handler(
    ({ context: { db, session }, errors }) => {
      if (!env.PROFILE_CUSTOMIZATION_ENABLED) {
        throw errors.NOT_FOUND();
      }
      return loadProfileCustomizationEditorState(db, session.user.id);
    }
  ),

  getCustomizationScalarPreview: protectedProcedure.handler(
    ({ context: { db, session }, errors }) => {
      if (!env.PROFILE_CUSTOMIZATION_ENABLED) {
        throw errors.NOT_FOUND();
      }
      return getProfileCustomizationScalarPreview(db, session.user.id);
    }
  ),

  purchaseCatalogItem: protectedProcedure
    .use(slidingWindowRatelimitMiddleware(5, 60))
    .input(
      z.object({
        expectedPrice: z
          .string()
          .regex(/^[1-9]\d*$/)
          .transform((value) => BigInt(value)),
        expectedRevision: z.number().int().positive(),
        idempotencyKey: z.string().min(8).max(128),
        itemId: z.string().min(1).max(128),
      })
    )
    .handler(async ({ context: { db, session }, errors, input }) => {
      if (session.session?.impersonatedBy) {
        throw errors.FORBIDDEN({
          message: "No puedes comprar mientras estás suplantando una cuenta.",
        });
      }
      try {
        return await purchaseProfileCatalogItem(db, {
          ...input,
          userId: session.user.id,
        });
      } catch (error) {
        if (error instanceof ProfileCatalogPurchaseError) {
          throw errors.BAD_REQUEST({ message: error.message });
        }
        if (error instanceof EterisError) {
          const message =
            error.code === "INSUFFICIENT_FUNDS"
              ? "No tienes Eteris suficientes para esta compra."
              : error.code === "IDEMPOTENCY_CONFLICT"
                ? "La clave de compra ya fue usada para otra operación."
                : "Tu billetera no permite completar esta compra.";
          throw errors.BAD_REQUEST({ message });
        }
        throw error;
      }
    }),

  finalizeUpload: protectedProcedure
    .input(
      z.object({
        contentLength: z
          .number()
          .int()
          .positive()
          .max(PROFILE_MEDIA_OWNER_SOURCE_MAX_BYTES),
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

      try {
        const asset = await finalizeProfileMediaUpload({
          actor: session.user,
          cache: await getRedis(),
          db,
          input,
          onCleanupError: (cleanupError, objectKey) => {
            logger?.warn(`Failed to clean Profile Media ${objectKey}`);
            logger?.warn(cleanupError);
          },
          storage: r2ProfileMediaStorage,
        });
        return {
          assetId: asset.id,
          isAnimated: asset.isAnimated,
          objectKey: asset.objectKey,
        };
      } catch (error) {
        throwProfileMediaError(error, errors);
      }
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
        customizationEnabled: env.PROFILE_CUSTOMIZATION_ENABLED,
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
          notifications: {
            commentReplies: settings.replyNotificationsEnabled,
          },
          visibility: resolveProfileVisibility(settings.visibilityConfig),
        },
        summary: summary ?? null,
      };
    }
  ),

  getPublic: publicProcedure
    .input(
      z.object({
        includeCurrentStreak: z.boolean().optional(),
        userId: z.string(),
      })
    )
    .handler(({ context: { db, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info(`Fetching public profile for user ${input.userId}`);
      return getPublicProfile(db, input.userId, {
        includeCurrentStreak: input.includeCurrentStreak,
      });
    }),

  getPublicCurrentStreak: publicProcedure
    .input(z.object({ userId: z.string() }))
    .handler(({ context: { db }, input }) =>
      getPublicCurrentStreakForUser(db, input.userId)
    ),

  getPublicScalarShowcases: publicProcedure
    .use(slidingWindowRatelimitMiddleware(30, 60))
    .input(z.object({ userId: z.string().min(1) }))
    .handler(({ context: { db }, input }) =>
      env.PROFILE_CUSTOMIZATION_ENABLED
        ? getPublicScalarProfileShowcases(db, input.userId)
        : []
    ),

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
        contentLength: z
          .number()
          .int()
          .positive()
          .max(PROFILE_MEDIA_OWNER_SOURCE_MAX_BYTES),
        contentType: uploadContentTypeSchema,
        slot: z.enum(["avatar", "banner"]),
      })
    )
    .handler(async ({ context: { db, session, ...ctx }, input, errors }) => {
      const logger = getLogger(ctx);
      logger?.info(
        `Generating upload policy for ${input.slot} by user ${session.user.id}`
      );
      try {
        return await issueProfileMediaUpload({
          actor: session.user,
          cache: await getRedis(),
          db,
          input,
          onCleanupError: (cleanupError, objectKey) => {
            logger?.warn(`Failed to clean Profile Media ${objectKey}`);
            logger?.warn(cleanupError);
          },
          storage: r2ProfileMediaStorage,
        });
      } catch (error) {
        throwProfileMediaError(error, errors);
      }
    }),

  saveCustomization: protectedProcedure
    .use(slidingWindowRatelimitMiddleware(10, 60))
    .input(
      z.object({
        draft: profileCustomizationDraftSchema,
        expectedRevision: z.number().int().nonnegative(),
      })
    )
    .handler(async ({ context: { db, session }, errors, input }) => {
      if (!env.PROFILE_CUSTOMIZATION_ENABLED) {
        throw errors.NOT_FOUND();
      }
      try {
        return await saveProfileCustomization(db, {
          draft: input.draft,
          expectedRevision: input.expectedRevision,
          impersonated: Boolean(session.session?.impersonatedBy),
          role: session.user.role,
          userId: session.user.id,
        });
      } catch (error) {
        if (!(error instanceof ProfileCustomizationError)) {
          throw error;
        }
        if (error.code === "CONFLICT") {
          throw errors.PROFILE_CUSTOMIZATION_CONFLICT({
            message: error.message,
          });
        }
        if (error.code === "IMPERSONATION") {
          throw errors.FORBIDDEN({ message: error.message });
        }
        throw errors.PROFILE_CUSTOMIZATION_INVALID({
          data: { fieldErrors: error.fieldErrors ?? {} },
          message: error.message,
        });
      }
    }),

  removeAvatar: protectedProcedure.handler(
    async ({ context: { db, session, ...ctx } }) => {
      const logger = getLogger(ctx);
      logger?.info(`Removing avatar for user ${session.user.id}`);
      await removeUserProfileMedia({
        actor: session.user,
        db,
        slot: "avatar",
        storage: r2ProfileMediaStorage,
      });
      return { success: true };
    }
  ),

  removeBanner: protectedProcedure.handler(
    async ({ context: { db, session, ...ctx } }) => {
      const logger = getLogger(ctx);
      logger?.info(`Removing banner for user ${session.user.id}`);
      await removeUserProfileMedia({
        actor: session.user,
        db,
        slot: "banner",
        storage: r2ProfileMediaStorage,
      });
      return { success: true };
    }
  ),

  updateNotificationPreferences: protectedProcedure
    .input(z.object({ commentReplies: z.boolean() }))
    .handler(async ({ context: { db, session, ...ctx }, input, errors }) => {
      const logger = getLogger(ctx);
      logger?.info(
        `Updating notification preferences for user ${session.user.id}`
      );
      await getOrCreateProfileSettings(db, session.user.id);

      const [settings] = await db
        .update(profileSettings)
        .set({ replyNotificationsEnabled: input.commentReplies })
        .where(eq(profileSettings.userId, session.user.id))
        .returning({
          replyNotificationsEnabled: profileSettings.replyNotificationsEnabled,
        });

      if (!settings) {
        throw errors.INTERNAL_SERVER_ERROR();
      }

      return { commentReplies: settings.replyNotificationsEnabled };
    }),

  updateVisibility: protectedProcedure
    .input(visibilityUpdateSchema)
    .handler(async ({ context: { db, session, ...ctx }, input, errors }) => {
      if (session.session?.impersonatedBy) {
        throw errors.FORBIDDEN({
          message:
            "No puedes cambiar la visibilidad mientras est\u00E1s suplantando una cuenta.",
        });
      }
      const logger = getLogger(ctx);
      logger?.info(`Updating visibility settings for user ${session.user.id}`);
      await getOrCreateProfileSettings(db, session.user.id);

      let visibilityConfig = sql`CASE WHEN jsonb_typeof(${profileSettings.visibilityConfig}) = 'object' THEN ${profileSettings.visibilityConfig} ELSE '{}'::jsonb END`;
      if (input.favorites !== undefined) {
        visibilityConfig = sql`jsonb_set(${visibilityConfig}, '{favorites}', ${JSON.stringify(input.favorites)}::jsonb, true)`;
      }
      if (input.reviews !== undefined) {
        visibilityConfig = sql`jsonb_set(${visibilityConfig}, '{reviews}', ${JSON.stringify(input.reviews)}::jsonb, true)`;
      }
      if (input.streak !== undefined) {
        visibilityConfig = sql`jsonb_set(${visibilityConfig}, '{streak}', ${JSON.stringify(input.streak)}::jsonb, true)`;
      }

      const [settings] = await db
        .update(profileSettings)
        .set({ visibilityConfig })
        .where(eq(profileSettings.userId, session.user.id))
        .returning({ visibilityConfig: profileSettings.visibilityConfig });

      if (!settings) {
        throw errors.INTERNAL_SERVER_ERROR();
      }

      return {
        visibility: resolveProfileVisibility(settings.visibilityConfig),
      };
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

      if (input.bannerMode === "color") {
        await removeUserProfileMedia({
          actor: session.user,
          avatarFallbackColor: input.avatarFallbackColor,
          bannerColor: input.bannerColor,
          db,
          slot: "banner",
          storage: r2ProfileMediaStorage,
        });
        return { success: true };
      }

      await Promise.all([
        db
          .update(user)
          .set({ avatarFallbackColor: input.avatarFallbackColor })
          .where(eq(user.id, session.user.id)),
        db
          .update(profileSettings)
          .set({
            bannerAssetId: input.bannerAssetId ?? currentSettings.bannerAssetId,
            bannerColor: input.bannerColor,
            bannerMode: "image",
          })
          .where(eq(profileSettings.userId, session.user.id)),
      ]);

      return { success: true };
    }),
};
