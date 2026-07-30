import { getLogger } from "@orpc/experimental-pino";
import { eq, getRedis, inArray } from "@repo/db";
import {
  media,
  profileEmblemAssignment,
  profileEmblemDefinition,
  profileMediaAsset,
  profileRoleAssignment,
  profileRoleDefinition,
  profileSystemConfig,
} from "@repo/db/schema/app";
import { MANAGED_PROFILE_MEDIA_SLOTS } from "@repo/shared/profile";
import z from "zod";

import { ownerProcedure } from "../index";
import { getOrCreateProfileSystemConfig } from "../services/profile";
import {
  changeManagedProfileMedia,
  finalizeProfileMediaUpload,
  issueProfileMediaUpload,
  ProfileMediaError,
  PROFILE_MEDIA_OWNER_SOURCE_MAX_BYTES,
} from "../services/profile-media";
import { r2ProfileMediaStorage } from "../services/profile-media-storage";
import { optionalSingleDeferredMediaSelectionInputSchema } from "../utils/deferred-media";

const colorSchema = z.string().regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/);
const uploadContentTypeSchema = z.enum([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const ownerSlotsSchema = z.enum(MANAGED_PROFILE_MEDIA_SLOTS);
const existingEmblemMediaSelectionSchema =
  optionalSingleDeferredMediaSelectionInputSchema
    .refine(
      (selection) => selection.length === 0,
      "Los iconos deben subirse como Profile Media."
    )
    .default([]);
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
  iconAssetId: z.string().nullable().optional(),
  mediaSelection: existingEmblemMediaSelectionSchema,
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

function throwProfileMediaError(
  error: unknown,
  errors: Parameters<Parameters<typeof ownerProcedure.handler>[0]>[0]["errors"]
): never {
  if (!(error instanceof ProfileMediaError)) {
    throw error;
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

async function enrichEmblemsWithAssets(
  db: Parameters<
    Parameters<typeof ownerProcedure.handler>[0]
  >[0]["context"]["db"],
  rows: Awaited<ReturnType<typeof db.query.profileEmblemDefinition.findMany>>
) {
  const assetIds = [
    ...new Set(
      rows
        .map((row) => row.iconAssetId)
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
  const objectKeys = [
    ...new Set(assets.map((asset) => asset.objectKey).filter(Boolean)),
  ];
  const mediaRows = objectKeys.length
    ? await db.query.media.findMany({
        columns: { id: true, objectKey: true },
        where: inArray(media.objectKey, objectKeys),
      })
    : [];
  const mediaIdByObjectKey = new Map(
    mediaRows.map((mediaRow) => [mediaRow.objectKey, mediaRow.id])
  );

  return rows.map((row) => {
    const iconAsset = row.iconAssetId
      ? (assetMap.get(row.iconAssetId) ?? null)
      : null;

    return {
      ...row,
      iconAsset,
      iconMediaId: iconAsset
        ? (mediaIdByObjectKey.get(iconAsset.objectKey) ?? null)
        : null,
    };
  });
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
    create: ownerProcedure.input(emblemDefinitionSchema).handler(
      async ({ context: { db }, input }) =>
        await changeManagedProfileMedia({
          db,
          mutate: async (tx) => {
            const [created] = await tx
              .insert(profileEmblemDefinition)
              .values({
                iconAssetId: input.iconAssetId ?? null,
                isVisible: input.isVisible,
                name: input.name,
                priority: input.priority,
                slug: input.slug,
                tooltip: input.tooltip,
              })
              .returning();
            return { retiredAssetIds: [], value: created };
          },
          storage: r2ProfileMediaStorage,
        })
    ),

    delete: ownerProcedure.input(z.object({ id: z.string() })).handler(
      async ({ context: { db }, input }) =>
        await changeManagedProfileMedia({
          db,
          mutate: async (tx) => {
            const [current] = await tx
              .select({ iconAssetId: profileEmblemDefinition.iconAssetId })
              .from(profileEmblemDefinition)
              .where(eq(profileEmblemDefinition.id, input.id))
              .for("update");
            await tx
              .delete(profileEmblemDefinition)
              .where(eq(profileEmblemDefinition.id, input.id));
            return {
              retiredAssetIds: current?.iconAssetId
                ? [current.iconAssetId]
                : [],
              value: { success: true },
            };
          },
          storage: r2ProfileMediaStorage,
        })
    ),

    list: ownerProcedure.handler(async ({ context: { db } }) => {
      const rows = await db.query.profileEmblemDefinition.findMany({
        orderBy: (table, { desc }) => [desc(table.priority)],
        where: (table, { eq: equals }) => equals(table.isActive, true),
      });
      return enrichEmblemsWithAssets(db, rows);
    }),

    update: ownerProcedure
      .input(emblemDefinitionSchema.extend({ id: z.string() }))
      .handler(
        async ({ context: { db }, input }) =>
          await changeManagedProfileMedia({
            db,
            mutate: async (tx) => {
              const [current] = await tx
                .select({ iconAssetId: profileEmblemDefinition.iconAssetId })
                .from(profileEmblemDefinition)
                .where(eq(profileEmblemDefinition.id, input.id))
                .for("update");
              const [updated] = await tx
                .update(profileEmblemDefinition)
                .set({
                  iconAssetId: input.iconAssetId ?? null,
                  isVisible: input.isVisible,
                  name: input.name,
                  priority: input.priority,
                  slug: input.slug,
                  tooltip: input.tooltip,
                })
                .where(eq(profileEmblemDefinition.id, input.id))
                .returning();
              return {
                retiredAssetIds: current?.iconAssetId
                  ? [current.iconAssetId]
                  : [],
                value: updated,
              };
            },
            storage: r2ProfileMediaStorage,
          })
      ),
  },

  media: {
    finalizeUpload: ownerProcedure
      .input(
        z.object({
          contentLength: z
            .number()
            .int()
            .positive()
            .max(PROFILE_MEDIA_OWNER_SOURCE_MAX_BYTES),
          contentType: uploadContentTypeSchema,
          objectKey: z.string().min(1),
          slot: ownerSlotsSchema,
        })
      )
      .handler(async ({ context: { db, session, ...ctx }, input, errors }) => {
        const logger = getLogger(ctx);
        logger?.info(`Finalizing owner asset ${input.objectKey}`);
        try {
          return await finalizeProfileMediaUpload({
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

    getUploadPolicy: ownerProcedure
      .input(
        z.object({
          contentLength: z
            .number()
            .int()
            .positive()
            .max(PROFILE_MEDIA_OWNER_SOURCE_MAX_BYTES),
          contentType: uploadContentTypeSchema,
          slot: ownerSlotsSchema,
        })
      )
      .handler(async ({ context: { db, session, ...ctx }, input, errors }) => {
        const logger = getLogger(ctx);
        logger?.info(`Generating owner upload policy for ${input.slot}`);
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
  },

  roles: {
    create: ownerProcedure.input(roleDefinitionSchema).handler(
      async ({ context: { db }, input }) =>
        await changeManagedProfileMedia({
          db,
          mutate: async (tx) => {
            const [created] = await tx
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

            return { retiredAssetIds: [], value: created };
          },
          storage: r2ProfileMediaStorage,
        })
    ),

    delete: ownerProcedure.input(z.object({ id: z.string() })).handler(
      async ({ context: { db }, input }) =>
        await changeManagedProfileMedia({
          db,
          mutate: async (tx) => {
            const [current] = await tx
              .select({
                iconAssetId: profileRoleDefinition.iconAssetId,
                overlayAssetId: profileRoleDefinition.overlayAssetId,
              })
              .from(profileRoleDefinition)
              .where(eq(profileRoleDefinition.id, input.id))
              .for("update");
            await tx
              .delete(profileRoleDefinition)
              .where(eq(profileRoleDefinition.id, input.id));
            return {
              retiredAssetIds: current
                ? [current.iconAssetId, current.overlayAssetId].filter(
                    (id): id is string => id !== null
                  )
                : [],
              value: { success: true },
            };
          },
          storage: r2ProfileMediaStorage,
        })
    ),

    list: ownerProcedure.handler(async ({ context: { db } }) => {
      const rows = await db.query.profileRoleDefinition.findMany({
        orderBy: (table, { desc }) => [desc(table.priority)],
        where: (table, { eq: equals }) => equals(table.isActive, true),
      });
      return enrichDefinitionsWithAssets(db, rows);
    }),

    update: ownerProcedure
      .input(roleDefinitionSchema.extend({ id: z.string() }))
      .handler(async ({ context: { db }, input }) => {
        const { id, ...rest } = input;
        return await changeManagedProfileMedia({
          db,
          mutate: async (tx) => {
            const [current] = await tx
              .select({
                iconAssetId: profileRoleDefinition.iconAssetId,
                overlayAssetId: profileRoleDefinition.overlayAssetId,
              })
              .from(profileRoleDefinition)
              .where(eq(profileRoleDefinition.id, id))
              .for("update");
            const [updated] = await tx
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

            return {
              retiredAssetIds: current
                ? [current.iconAssetId, current.overlayAssetId].filter(
                    (assetId): assetId is string => assetId !== null
                  )
                : [],
              value: updated,
            };
          },
          storage: r2ProfileMediaStorage,
        });
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
