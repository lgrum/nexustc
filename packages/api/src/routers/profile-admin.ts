import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getLogger } from "@orpc/experimental-pino";
import { eq, inArray } from "@repo/db";
import {
  profileEmblemAssignment,
  profileEmblemDefinition,
  profileMediaAsset,
  profileRoleAssignment,
  profileRoleDefinition,
  profileSystemConfig,
} from "@repo/db/schema/app";
import { generateId } from "@repo/db/utils";
import { env } from "@repo/env";
import z from "zod";

import { ownerProcedure } from "../index";
import {
  getObjectExtension,
  getOrCreateProfileSystemConfig,
  inspectProfileMediaAsset,
  validateProfileMediaUpload,
} from "../services/profile";
import { getS3Client } from "../utils/s3";

const colorSchema = z.string().regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/);
const uploadContentTypeSchema = z.enum([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const ownerSlotsSchema = z.enum(["role-icon", "role-overlay", "emblem-icon"]);
const roleDefinitionSchema = z.object({
  accentColor: colorSchema.nullable(),
  baseColor: colorSchema,
  description: z.string().max(160).default(""),
  glowColor: colorSchema.nullable(),
  iconAssetId: z.string().nullable().optional(),
  isExclusive: z.boolean(),
  isVisible: z.boolean(),
  name: z.string().min(1).max(64),
  overlayAssetId: z.string().nullable().optional(),
  priority: z.number().int().min(0).max(1000),
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  textColor: colorSchema,
});
const emblemDefinitionSchema = z.object({
  backgroundColor: colorSchema.nullable(),
  glowColor: colorSchema.nullable(),
  iconAssetId: z.string().nullable().optional(),
  isVisible: z.boolean(),
  name: z.string().min(1).max(64),
  priority: z.number().int().min(0).max(1000),
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  tooltip: z.string().max(160).default(""),
});

function getOwnerUploadObjectKey(
  slot: z.infer<typeof ownerSlotsSchema>,
  userId: string,
  contentType: string
) {
  return `profiles/${slot}/${userId}/${generateId()}.${getObjectExtension(contentType)}`;
}

async function enrichDefinitionsWithAssets<
  T extends { iconAssetId: string | null; overlayAssetId?: string | null },
>(
  db: Parameters<
    Parameters<typeof ownerProcedure.handler>[0]
  >[0]["context"]["db"],
  rows: T[]
) {
  const assetIds = [
    ...new Set(
      rows
        .flatMap((row) => [row.iconAssetId, row.overlayAssetId].filter(Boolean))
        // oxlint-disable-next-line unicorn/prefer-native-coercion-functions: type guard is necessary
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const assets = assetIds.length
    ? await db.query.profileMediaAsset.findMany({
        where: inArray(profileMediaAsset.id, assetIds),
      })
    : [];
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]));

  return rows.map((row) => ({
    ...row,
    iconAsset: row.iconAssetId ? (assetMap.get(row.iconAssetId) ?? null) : null,
    overlayAsset: row.overlayAssetId
      ? (assetMap.get(row.overlayAssetId) ?? null)
      : null,
  }));
}

export default {
  assignments: {
    getUserAssignments: ownerProcedure
      .input(z.object({ userId: z.string() }))
      .handler(async ({ context: { db }, input }) => {
        const [roles, emblems] = await Promise.all([
          db.query.profileRoleAssignment.findMany({
            columns: { roleDefinitionId: true },
            where: eq(profileRoleAssignment.userId, input.userId),
          }),
          db.query.profileEmblemAssignment.findMany({
            columns: { emblemDefinitionId: true },
            where: eq(profileEmblemAssignment.userId, input.userId),
          }),
        ]);

        return {
          emblemIds: emblems.map((item) => item.emblemDefinitionId),
          roleIds: roles.map((item) => item.roleDefinitionId),
        };
      }),

    setUserAssignments: ownerProcedure
      .input(
        z.object({
          emblemIds: z.array(z.string()).default([]),
          roleIds: z.array(z.string()).default([]),
          userId: z.string(),
        })
      )
      .handler(async ({ context: { db }, input }) => {
        await db.transaction(async (tx) => {
          await tx
            .delete(profileRoleAssignment)
            .where(eq(profileRoleAssignment.userId, input.userId));
          await tx
            .delete(profileEmblemAssignment)
            .where(eq(profileEmblemAssignment.userId, input.userId));

          if (input.roleIds.length > 0) {
            await tx.insert(profileRoleAssignment).values(
              input.roleIds.map((roleId) => ({
                roleDefinitionId: roleId,
                sourceType: "manual" as const,
                userId: input.userId,
              }))
            );
          }

          if (input.emblemIds.length > 0) {
            await tx.insert(profileEmblemAssignment).values(
              input.emblemIds.map((emblemId) => ({
                emblemDefinitionId: emblemId,
                sourceType: "manual" as const,
                userId: input.userId,
              }))
            );
          }
        });

        return { success: true };
      }),
  },

  emblems: {
    create: ownerProcedure
      .input(emblemDefinitionSchema)
      .handler(async ({ context: { db }, input }) => {
        const [created] = await db
          .insert(profileEmblemDefinition)
          .values({
            iconAssetId: input.iconAssetId ?? null,
            isVisible: input.isVisible,
            name: input.name,
            priority: input.priority,
            slug: input.slug,
            tooltip: input.tooltip,
            visualConfig: {
              backgroundColor: input.backgroundColor,
              glowColor: input.glowColor,
            },
          })
          .returning();

        return created;
      }),

    delete: ownerProcedure
      .input(z.object({ id: z.string() }))
      .handler(async ({ context: { db }, input }) => {
        await db
          .update(profileEmblemDefinition)
          .set({ isActive: false })
          .where(eq(profileEmblemDefinition.id, input.id));
        return { success: true };
      }),

    list: ownerProcedure.handler(async ({ context: { db } }) => {
      const rows = await db.query.profileEmblemDefinition.findMany({
        orderBy: (table, { desc }) => [desc(table.priority)],
      });
      return enrichDefinitionsWithAssets(db, rows);
    }),

    update: ownerProcedure
      .input(emblemDefinitionSchema.extend({ id: z.string() }))
      .handler(async ({ context: { db }, input }) => {
        const { id, ...rest } = input;
        const [updated] = await db
          .update(profileEmblemDefinition)
          .set({
            iconAssetId: rest.iconAssetId ?? null,
            isVisible: rest.isVisible,
            name: rest.name,
            priority: rest.priority,
            slug: rest.slug,
            tooltip: rest.tooltip,
            visualConfig: {
              backgroundColor: rest.backgroundColor,
              glowColor: rest.glowColor,
            },
          })
          .where(eq(profileEmblemDefinition.id, id))
          .returning();

        return updated;
      }),
  },

  media: {
    finalizeUpload: ownerProcedure
      .input(
        z.object({
          contentLength: z.number().int().positive(),
          contentType: uploadContentTypeSchema,
          objectKey: z.string().min(1),
          slot: ownerSlotsSchema,
        })
      )
      .handler(async ({ context: { db, session, ...ctx }, input, errors }) => {
        const logger = getLogger(ctx);
        logger?.info(`Finalizing owner asset ${input.objectKey}`);

        if (
          !input.objectKey.startsWith(
            `profiles/${input.slot}/${session.user.id}/`
          )
        ) {
          throw errors.FORBIDDEN({ message: "Asset inválido." });
        }

        const validation = await inspectProfileMediaAsset(input.objectKey);

        try {
          validateProfileMediaUpload({
            contentType: input.contentType,
            entitlements: {
              animatedAvatarRequiredTier: "level3",
              animatedBannerRequiredTier: "level8",
              canUseAnimatedAvatar: true,
              canUseAnimatedBanner: true,
              canUseUploadedBanner: true,
              overrideSource: "staff",
              uploadedBannerRequiredTier: "level5",
            },
            slot: input.slot,
            validation,
          });
        } catch (error) {
          throw errors.BAD_REQUEST({
            message: error instanceof Error ? error.message : "Asset inválido.",
          });
        }

        const [asset] = await db
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

        return asset;
      }),

    getUploadPolicy: ownerProcedure
      .input(
        z.object({
          contentLength: z.number().int().positive(),
          contentType: uploadContentTypeSchema,
          slot: ownerSlotsSchema,
        })
      )
      .handler(async ({ context: { session, ...ctx }, input }) => {
        const logger = getLogger(ctx);
        logger?.info(`Generating owner upload policy for ${input.slot}`);
        const objectKey = getOwnerUploadObjectKey(
          input.slot,
          session.user.id,
          input.contentType
        );
        const presignedUrl = await getSignedUrl(
          getS3Client(),
          new PutObjectCommand({
            Bucket: env.R2_ASSETS_BUCKET_NAME,
            ContentLength: input.contentLength,
            ContentType: input.contentType,
            Key: objectKey,
          }),
          { expiresIn: 3600 }
        );

        return { objectKey, presignedUrl };
      }),
  },

  roles: {
    create: ownerProcedure
      .input(roleDefinitionSchema)
      .handler(async ({ context: { db }, input }) => {
        const [created] = await db
          .insert(profileRoleDefinition)
          .values({
            description: input.description,
            iconAssetId: input.iconAssetId ?? null,
            isExclusive: input.isExclusive,
            isVisible: input.isVisible,
            name: input.name,
            overlayAssetId: input.overlayAssetId ?? null,
            priority: input.priority,
            slug: input.slug,
            visualConfig: {
              accentColor: input.accentColor,
              baseColor: input.baseColor,
              glowColor: input.glowColor,
              textColor: input.textColor,
            },
          })
          .returning();

        return created;
      }),

    delete: ownerProcedure
      .input(z.object({ id: z.string() }))
      .handler(async ({ context: { db }, input }) => {
        await db
          .update(profileRoleDefinition)
          .set({ isActive: false })
          .where(eq(profileRoleDefinition.id, input.id));
        return { success: true };
      }),

    list: ownerProcedure.handler(async ({ context: { db } }) => {
      const rows = await db.query.profileRoleDefinition.findMany({
        orderBy: (table, { desc }) => [desc(table.priority)],
      });
      return enrichDefinitionsWithAssets(db, rows);
    }),

    update: ownerProcedure
      .input(roleDefinitionSchema.extend({ id: z.string() }))
      .handler(async ({ context: { db }, input }) => {
        const { id, ...rest } = input;
        const [updated] = await db
          .update(profileRoleDefinition)
          .set({
            description: rest.description,
            iconAssetId: rest.iconAssetId ?? null,
            isExclusive: rest.isExclusive,
            isVisible: rest.isVisible,
            name: rest.name,
            overlayAssetId: rest.overlayAssetId ?? null,
            priority: rest.priority,
            slug: rest.slug,
            visualConfig: {
              accentColor: rest.accentColor,
              baseColor: rest.baseColor,
              glowColor: rest.glowColor,
              textColor: rest.textColor,
            },
          })
          .where(eq(profileRoleDefinition.id, id))
          .returning();

        return updated;
      }),
  },

  systemConfig: {
    get: ownerProcedure.handler(({ context: { db } }) =>
      getOrCreateProfileSystemConfig(db)
    ),

    update: ownerProcedure
      .input(
        z.object({
          maxVisibleEmblems: z.number().int().min(1).max(12),
        })
      )
      .handler(async ({ context: { db }, input }) => {
        await getOrCreateProfileSystemConfig(db);
        const [updated] = await db
          .update(profileSystemConfig)
          .set({ maxVisibleEmblems: input.maxVisibleEmblems })
          .where(eq(profileSystemConfig.id, "default"))
          .returning();
        return updated;
      }),
  },
};
