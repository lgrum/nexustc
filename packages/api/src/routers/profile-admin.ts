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
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1).max(64),
  description: z.string().max(160).default(""),
  iconAssetId: z.string().nullable().optional(),
  overlayAssetId: z.string().nullable().optional(),
  priority: z.number().int().min(0).max(1000),
  isVisible: z.boolean(),
  isExclusive: z.boolean(),
  baseColor: colorSchema,
  accentColor: colorSchema.nullable(),
  textColor: colorSchema,
  glowColor: colorSchema.nullable(),
});
const emblemDefinitionSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1).max(64),
  tooltip: z.string().max(160).default(""),
  iconAssetId: z.string().nullable().optional(),
  priority: z.number().int().min(0).max(1000),
  isVisible: z.boolean(),
  glowColor: colorSchema.nullable(),
  backgroundColor: colorSchema.nullable(),
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
  media: {
    getUploadPolicy: ownerProcedure
      .input(
        z.object({
          slot: ownerSlotsSchema,
          contentType: uploadContentTypeSchema,
          contentLength: z.number().int().positive(),
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
            Key: objectKey,
            ContentLength: input.contentLength,
            ContentType: input.contentType,
          }),
          { expiresIn: 3600 }
        );

        return { objectKey, presignedUrl };
      }),

    finalizeUpload: ownerProcedure
      .input(
        z.object({
          slot: ownerSlotsSchema,
          objectKey: z.string().min(1),
          contentType: uploadContentTypeSchema,
          contentLength: z.number().int().positive(),
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
            slot: input.slot,
            contentType: input.contentType,
            validation,
            entitlements: {
              canUseAnimatedAvatar: true,
              canUseUploadedBanner: true,
              canUseAnimatedBanner: true,
              animatedAvatarRequiredTier: "level3",
              uploadedBannerRequiredTier: "level5",
              animatedBannerRequiredTier: "level8",
              overrideSource: "staff",
            },
          });
        } catch (error) {
          throw errors.BAD_REQUEST({
            message: error instanceof Error ? error.message : "Asset inválido.",
          });
        }

        const [asset] = await db
          .insert(profileMediaAsset)
          .values({
            ownerUserId: session.user.id,
            slot: input.slot,
            mimeType: input.contentType,
            objectKey: input.objectKey,
            fileSizeBytes: validation.fileSizeBytes,
            width: validation.width,
            height: validation.height,
            durationMs: validation.durationMs,
            isAnimated: validation.isAnimated,
            validationStatus: "ready",
          })
          .returning();

        return asset;
      }),
  },

  roles: {
    list: ownerProcedure.handler(async ({ context: { db } }) => {
      const rows = await db.query.profileRoleDefinition.findMany({
        orderBy: (table, { desc }) => [desc(table.priority)],
      });
      return enrichDefinitionsWithAssets(db, rows);
    }),

    create: ownerProcedure
      .input(roleDefinitionSchema)
      .handler(async ({ context: { db }, input }) => {
        const [created] = await db
          .insert(profileRoleDefinition)
          .values({
            slug: input.slug,
            name: input.name,
            description: input.description,
            iconAssetId: input.iconAssetId ?? null,
            overlayAssetId: input.overlayAssetId ?? null,
            priority: input.priority,
            isVisible: input.isVisible,
            isExclusive: input.isExclusive,
            visualConfig: {
              baseColor: input.baseColor,
              accentColor: input.accentColor,
              textColor: input.textColor,
              glowColor: input.glowColor,
            },
          })
          .returning();

        return created;
      }),

    update: ownerProcedure
      .input(roleDefinitionSchema.extend({ id: z.string() }))
      .handler(async ({ context: { db }, input }) => {
        const { id, ...rest } = input;
        const [updated] = await db
          .update(profileRoleDefinition)
          .set({
            slug: rest.slug,
            name: rest.name,
            description: rest.description,
            iconAssetId: rest.iconAssetId ?? null,
            overlayAssetId: rest.overlayAssetId ?? null,
            priority: rest.priority,
            isVisible: rest.isVisible,
            isExclusive: rest.isExclusive,
            visualConfig: {
              baseColor: rest.baseColor,
              accentColor: rest.accentColor,
              textColor: rest.textColor,
              glowColor: rest.glowColor,
            },
          })
          .where(eq(profileRoleDefinition.id, id))
          .returning();

        return updated;
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
  },

  emblems: {
    list: ownerProcedure.handler(async ({ context: { db } }) => {
      const rows = await db.query.profileEmblemDefinition.findMany({
        orderBy: (table, { desc }) => [desc(table.priority)],
      });
      return enrichDefinitionsWithAssets(db, rows);
    }),

    create: ownerProcedure
      .input(emblemDefinitionSchema)
      .handler(async ({ context: { db }, input }) => {
        const [created] = await db
          .insert(profileEmblemDefinition)
          .values({
            slug: input.slug,
            name: input.name,
            tooltip: input.tooltip,
            iconAssetId: input.iconAssetId ?? null,
            priority: input.priority,
            isVisible: input.isVisible,
            visualConfig: {
              glowColor: input.glowColor,
              backgroundColor: input.backgroundColor,
            },
          })
          .returning();

        return created;
      }),

    update: ownerProcedure
      .input(emblemDefinitionSchema.extend({ id: z.string() }))
      .handler(async ({ context: { db }, input }) => {
        const { id, ...rest } = input;
        const [updated] = await db
          .update(profileEmblemDefinition)
          .set({
            slug: rest.slug,
            name: rest.name,
            tooltip: rest.tooltip,
            iconAssetId: rest.iconAssetId ?? null,
            priority: rest.priority,
            isVisible: rest.isVisible,
            visualConfig: {
              glowColor: rest.glowColor,
              backgroundColor: rest.backgroundColor,
            },
          })
          .where(eq(profileEmblemDefinition.id, id))
          .returning();

        return updated;
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
  },

  assignments: {
    getUserAssignments: ownerProcedure
      .input(z.object({ userId: z.string() }))
      .handler(async ({ context: { db }, input }) => {
        const [roles, emblems] = await Promise.all([
          db.query.profileRoleAssignment.findMany({
            where: eq(profileRoleAssignment.userId, input.userId),
            columns: { roleDefinitionId: true },
          }),
          db.query.profileEmblemAssignment.findMany({
            where: eq(profileEmblemAssignment.userId, input.userId),
            columns: { emblemDefinitionId: true },
          }),
        ]);

        return {
          roleIds: roles.map((item) => item.roleDefinitionId),
          emblemIds: emblems.map((item) => item.emblemDefinitionId),
        };
      }),

    setUserAssignments: ownerProcedure
      .input(
        z.object({
          userId: z.string(),
          roleIds: z.array(z.string()).default([]),
          emblemIds: z.array(z.string()).default([]),
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
                userId: input.userId,
                roleDefinitionId: roleId,
                sourceType: "manual" as const,
              }))
            );
          }

          if (input.emblemIds.length > 0) {
            await tx.insert(profileEmblemAssignment).values(
              input.emblemIds.map((emblemId) => ({
                userId: input.userId,
                emblemDefinitionId: emblemId,
                sourceType: "manual" as const,
              }))
            );
          }
        });

        return { success: true };
      }),
  },

  systemConfig: {
    get: ownerProcedure.handler(({ context: { db } }) => {
      return getOrCreateProfileSystemConfig(db);
    }),

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
