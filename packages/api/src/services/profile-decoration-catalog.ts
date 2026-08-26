import { and, desc, eq, inArray } from "@repo/db";
import type { db as database } from "@repo/db";
import {
  profileCatalogDecorationRevision,
  profileCatalogItem,
  profileCatalogItemRevision,
  media,
} from "@repo/db/schema/app";
import { generateId } from "@repo/db/utils";
import { PATRON_TIER_KEYS } from "@repo/shared/constants";
import { ETERIS_MAX_AMOUNT } from "@repo/shared/eteris";
import {
  PROFILE_DECORATION_EFFECT_KEYS,
  PROFILE_DECORATION_FONT_KEYS,
  PROFILE_DECORATION_SLOTS,
  profileDecorationReducedMotionSchema,
  profileDecorationVisualSchema,
} from "@repo/shared/profile-customization";
import type {
  ProfileDecorationCatalogEntry,
  ProfileDecorationVisual,
} from "@repo/shared/profile-customization";
import z from "zod";

import { getManagedMediaAssetFromRecord } from "../utils/managed-media";
import { publishProfileCatalogRevision } from "./profile-catalog-publication";

type Database = typeof database;
type ProfileDecorationTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

const animatedEffects = new Set(["soft-pulse", "orbit-sparkles"]);

function isCatalogStableKeyConflict(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const candidate = error as { code?: unknown; constraint?: unknown };
  return (
    candidate.code === "23505" &&
    candidate.constraint === "profile_catalog_item_stable_key_unique"
  );
}
export const profileDecorationDraftSchema = z
  .object({
    catalogOrder: z.number().int().min(0).max(10_000),
    description: z.string().trim().max(500),
    effectKey: z.enum(PROFILE_DECORATION_EFFECT_KEYS).nullable(),
    eterisPrice: z.bigint().nonnegative().max(ETERIS_MAX_AMOUNT).nullable(),
    fontKey: z.enum(PROFILE_DECORATION_FONT_KEYS).nullable(),
    isFree: z.boolean(),
    itemId: z.string().min(1).optional(),
    mediaAssetId: z.string().min(1).nullable(),
    name: z.string().trim().min(1).max(80),
    reducedMotion: profileDecorationReducedMotionSchema.nullable(),
    requiredTier: z.enum(PATRON_TIER_KEYS).nullable(),
    slot: z.enum(PROFILE_DECORATION_SLOTS),
    stableKey: z
      .string()
      .trim()
      .min(2)
      .max(64)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
  })
  .strict()
  .superRefine((draft, context) => {
    if (!(draft.itemId || draft.stableKey)) {
      context.addIssue({
        code: "custom",
        message: "La nueva Decoration necesita una clave estable.",
        path: ["stableKey"],
      });
    }
    if (!(draft.isFree || draft.requiredTier || draft.eterisPrice !== null)) {
      context.addIssue({
        code: "custom",
        message: "Define al menos una forma de acceso.",
        path: ["isFree"],
      });
    }
    if (draft.eterisPrice !== null && draft.eterisPrice <= 0n) {
      context.addIssue({
        code: "custom",
        message: "El precio en Eteris debe ser mayor que cero.",
        path: ["eterisPrice"],
      });
    }
    if (draft.isFree && draft.eterisPrice !== null) {
      context.addIssue({
        code: "custom",
        message: "Una Decoration gratuita no puede tener un precio de compra.",
        path: ["eterisPrice"],
      });
    }
  });

export const profileDecorationDeferredDraftSchema =
  profileDecorationDraftSchema.omit({ mediaAssetId: true });

export class ProfileDecorationCatalogError extends Error {
  readonly code: "CONFLICT" | "INVALID_DRAFT" | "NOT_FOUND";
  readonly fieldErrors: Record<string, string>;

  constructor(
    code: ProfileDecorationCatalogError["code"],
    message: string,
    fieldErrors: Record<string, string> = {}
  ) {
    super(message);
    this.name = "ProfileDecorationCatalogError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function validateProfileDecorationVisual(
  input: unknown
): ProfileDecorationVisual {
  const parsed = profileDecorationVisualSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProfileDecorationCatalogError(
      "INVALID_DRAFT",
      "La apariencia de la Decoration no es válida.",
      Object.fromEntries(
        parsed.error.issues.map((issue) => [
          issue.path.join("."),
          issue.message,
        ])
      )
    );
  }
  if (
    parsed.data.effectKey &&
    animatedEffects.has(parsed.data.effectKey) &&
    !parsed.data.reducedMotion
  ) {
    throw new ProfileDecorationCatalogError(
      "INVALID_DRAFT",
      "El efecto animado necesita un fallback de movimiento reducido.",
      { reducedMotion: "Elige una versión estática o la omisión del efecto." }
    );
  }
  return parsed.data;
}

function parseDraft(input: unknown) {
  const parsed = profileDecorationDraftSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProfileDecorationCatalogError(
      "INVALID_DRAFT",
      "El borrador de la Decoration no es válido.",
      Object.fromEntries(
        parsed.error.issues.map((issue) => [
          issue.path.join("."),
          issue.message,
        ])
      )
    );
  }
  validateProfileDecorationVisual({
    effectKey: parsed.data.effectKey,
    fontKey: parsed.data.fontKey,
    mediaAssetKey: parsed.data.mediaAssetId ? "managed-media" : null,
    reducedMotion: parsed.data.reducedMotion,
    slot: parsed.data.slot,
  });
  return parsed.data;
}

export function validatePublishedDecorationSlot(
  publishedSlot: ProfileDecorationVisual["slot"] | null,
  draftSlot: ProfileDecorationVisual["slot"]
) {
  if (publishedSlot && publishedSlot !== draftSlot) {
    throw new ProfileDecorationCatalogError(
      "INVALID_DRAFT",
      "El slot de una Decoration publicada no puede cambiar.",
      { slot: "Conserva el slot de la revisión publicada." }
    );
  }
}

async function validateManagedMedia(
  db: Pick<Database, "query">,
  mediaAssetId: string | null,
  reducedMotion: z.infer<typeof profileDecorationReducedMotionSchema> | null
) {
  if (!mediaAssetId) {
    return;
  }
  const asset = await db.query.media.findFirst({
    columns: {
      isAnimated: true,
      objectKey: true,
    },
    where: eq(media.id, mediaAssetId),
  });
  let isManagedImage = false;
  if (asset) {
    try {
      const managed = getManagedMediaAssetFromRecord({
        id: mediaAssetId,
        objectKey: asset.objectKey,
      });
      isManagedImage =
        (managed.assetKey.startsWith("media/") ||
          managed.assetKey.startsWith("profiles/media/")) &&
        ["avif", "gif", "jpeg", "jpg", "png", "webp"].includes(
          managed.assetFormat
        );
    } catch {
      isManagedImage = false;
    }
  }
  if (
    !asset ||
    !isManagedImage ||
    (asset.isAnimated && reducedMotion?.behavior !== "omit")
  ) {
    throw new ProfileDecorationCatalogError(
      "INVALID_DRAFT",
      "El recurso debe ser una imagen administrada y validada.",
      {
        mediaSelection:
          "No se aceptan archivos de usuario, recursos externos ni animación sin omisión reducida.",
      }
    );
  }
}

export async function listPublishedProfileDecorations(
  db: Pick<Database, "select">
): Promise<ProfileDecorationCatalogEntry[]> {
  const rows = await db
    .select({
      description: profileCatalogItemRevision.description,
      effectKey: profileCatalogDecorationRevision.effectKey,
      eterisPrice: profileCatalogItemRevision.eterisPrice,
      fontKey: profileCatalogDecorationRevision.fontKey,
      isFree: profileCatalogItemRevision.isFree,
      itemId: profileCatalogItem.id,
      key: profileCatalogItem.stableKey,
      lifecycle: profileCatalogItem.lifecycle,
      mediaAssetKey: media.objectKey,
      name: profileCatalogItemRevision.name,
      revision: profileCatalogItemRevision.revision,
      reducedMotion: profileCatalogDecorationRevision.reducedMotion,
      requiredTier: profileCatalogItemRevision.requiredTier,
      slot: profileCatalogDecorationRevision.slot,
    })
    .from(profileCatalogItem)
    .innerJoin(
      profileCatalogItemRevision,
      eq(
        profileCatalogItem.currentPublishedRevisionId,
        profileCatalogItemRevision.id
      )
    )
    .innerJoin(
      profileCatalogDecorationRevision,
      eq(
        profileCatalogDecorationRevision.revisionId,
        profileCatalogItemRevision.id
      )
    )
    .leftJoin(
      media,
      eq(media.id, profileCatalogDecorationRevision.mediaAssetId)
    )
    .where(
      and(
        eq(profileCatalogItem.kind, "decoration"),
        inArray(profileCatalogItem.lifecycle, ["active", "archived"])
      )
    )
    .orderBy(
      profileCatalogItemRevision.catalogOrder,
      profileCatalogItem.stableKey
    );

  return rows.flatMap((row) => {
    try {
      return [
        {
          ...row,
          entitled: false,
          key: row.key.replace(/^decoration\./, ""),
          permanentlyOwned: false,
          selectable: false,
          ...validateProfileDecorationVisual(row),
        },
      ];
    } catch {
      return [];
    }
  });
}

export function listOwnerProfileDecorations(db: Database) {
  return db
    .select({
      catalogOrder: profileCatalogItemRevision.catalogOrder,
      description: profileCatalogItemRevision.description,
      effectKey: profileCatalogDecorationRevision.effectKey,
      eterisPrice: profileCatalogItemRevision.eterisPrice,
      fontKey: profileCatalogDecorationRevision.fontKey,
      isFree: profileCatalogItemRevision.isFree,
      itemId: profileCatalogItem.id,
      currentPublishedRevisionId: profileCatalogItem.currentPublishedRevisionId,
      isProtectedDefault: profileCatalogItem.isProtectedDefault,
      lifecycle: profileCatalogItem.lifecycle,
      mediaAssetId: profileCatalogDecorationRevision.mediaAssetId,
      mediaAssetKey: media.objectKey,
      name: profileCatalogItemRevision.name,
      reducedMotion: profileCatalogDecorationRevision.reducedMotion,
      requiredTier: profileCatalogItemRevision.requiredTier,
      revision: profileCatalogItemRevision.revision,
      revisionId: profileCatalogItemRevision.id,
      slot: profileCatalogDecorationRevision.slot,
      stableKey: profileCatalogItem.stableKey,
      state: profileCatalogItemRevision.state,
      updatedAt: profileCatalogItemRevision.updatedAt,
    })
    .from(profileCatalogItem)
    .innerJoin(
      profileCatalogItemRevision,
      eq(profileCatalogItemRevision.itemId, profileCatalogItem.id)
    )
    .innerJoin(
      profileCatalogDecorationRevision,
      eq(
        profileCatalogDecorationRevision.revisionId,
        profileCatalogItemRevision.id
      )
    )
    .leftJoin(
      media,
      eq(media.id, profileCatalogDecorationRevision.mediaAssetId)
    )
    .where(eq(profileCatalogItem.kind, "decoration"))
    .orderBy(
      profileCatalogItem.stableKey,
      desc(profileCatalogItemRevision.revision)
    );
}

export async function saveProfileDecorationDraft(
  db: Database | ProfileDecorationTransaction,
  actorUserId: string,
  input: unknown,
  expectedUpdatedAt?: Date
) {
  const draft = parseDraft(input);
  await validateManagedMedia(db, draft.mediaAssetId, draft.reducedMotion);
  return db.transaction(async (tx) => {
    const [item] = draft.itemId
      ? await tx
          .select()
          .from(profileCatalogItem)
          .where(
            and(
              eq(profileCatalogItem.id, draft.itemId),
              eq(profileCatalogItem.kind, "decoration")
            )
          )
          .for("update")
      : [];
    if (draft.itemId && !item) {
      throw new ProfileDecorationCatalogError(
        "NOT_FOUND",
        "La Decoration no existe."
      );
    }
    if (item?.currentPublishedRevisionId) {
      const publishedVisual =
        await tx.query.profileCatalogDecorationRevision.findFirst({
          columns: { slot: true },
          where: eq(
            profileCatalogDecorationRevision.revisionId,
            item.currentPublishedRevisionId
          ),
        });
      validatePublishedDecorationSlot(
        publishedVisual?.slot ?? null,
        draft.slot
      );
    }
    const itemId = item?.id ?? generateId();
    if (!item) {
      try {
        await tx.insert(profileCatalogItem).values({
          id: itemId,
          kind: "decoration",
          lifecycle: "draft",
          stableKey: `decoration.${draft.stableKey}`,
        });
      } catch (error) {
        if (isCatalogStableKeyConflict(error)) {
          throw new ProfileDecorationCatalogError(
            "CONFLICT",
            "La clave estable de la Decoration ya está en uso.",
            { stableKey: "Elige una clave estable diferente." }
          );
        }
        throw error;
      }
    }
    const currentDraft = await tx.query.profileCatalogItemRevision.findFirst({
      orderBy: desc(profileCatalogItemRevision.revision),
      where: and(
        eq(profileCatalogItemRevision.itemId, itemId),
        eq(profileCatalogItemRevision.state, "draft")
      ),
    });
    const latest = await tx.query.profileCatalogItemRevision.findFirst({
      orderBy: desc(profileCatalogItemRevision.revision),
      where: eq(profileCatalogItemRevision.itemId, itemId),
    });
    const revisionId = currentDraft?.id ?? generateId();
    const metadata = {
      catalogOrder: draft.catalogOrder,
      description: draft.description,
      eterisPrice: draft.eterisPrice,
      isFree: draft.isFree,
      name: draft.name,
      requiredTier: draft.requiredTier,
    };
    const visual = {
      effectKey: draft.effectKey,
      fontKey: draft.fontKey,
      mediaAssetId: draft.mediaAssetId,
      reducedMotion: draft.reducedMotion,
      slot: draft.slot,
    };
    if (currentDraft) {
      if (
        !expectedUpdatedAt ||
        currentDraft.updatedAt.getTime() !== expectedUpdatedAt.getTime()
      ) {
        throw new ProfileDecorationCatalogError(
          "CONFLICT",
          "La Decoration cambió mientras intentabas guardar el borrador. Recarga antes de volver a guardar."
        );
      }
      const updatedAt = new Date();
      const updated = await tx
        .update(profileCatalogItemRevision)
        .set({ ...metadata, updatedAt })
        .where(
          and(
            eq(profileCatalogItemRevision.id, revisionId),
            eq(profileCatalogItemRevision.state, "draft"),
            eq(profileCatalogItemRevision.updatedAt, currentDraft.updatedAt)
          )
        )
        .returning({
          id: profileCatalogItemRevision.id,
          updatedAt: profileCatalogItemRevision.updatedAt,
        });
      if (updated.length !== 1) {
        throw new ProfileDecorationCatalogError(
          "CONFLICT",
          "La Decoration cambió mientras intentabas guardar el borrador. Recarga antes de volver a guardar."
        );
      }
      await tx
        .update(profileCatalogDecorationRevision)
        .set(visual)
        .where(eq(profileCatalogDecorationRevision.revisionId, revisionId));
      return { itemId, revisionId, updatedAt: updated[0]?.updatedAt };
    }
    await tx.insert(profileCatalogItemRevision).values({
      ...metadata,
      createdByUserId: actorUserId,
      id: revisionId,
      itemId,
      revision: (latest?.revision ?? 0) + 1,
      state: "draft",
    });
    await tx
      .insert(profileCatalogDecorationRevision)
      .values({ revisionId, ...visual });
    const [createdRevision] = await tx
      .select({ updatedAt: profileCatalogItemRevision.updatedAt })
      .from(profileCatalogItemRevision)
      .where(eq(profileCatalogItemRevision.id, revisionId));
    return { itemId, revisionId, updatedAt: createdRevision?.updatedAt };
  });
}

export function publishProfileDecorationDraft(
  db: Database,
  actorUserId: string,
  itemId: string,
  revisionId: string
) {
  return db.transaction(async (tx) => {
    const [item] = await tx
      .select()
      .from(profileCatalogItem)
      .where(
        and(
          eq(profileCatalogItem.id, itemId),
          eq(profileCatalogItem.kind, "decoration")
        )
      )
      .for("update");
    const draft = await tx.query.profileCatalogItemRevision.findFirst({
      orderBy: desc(profileCatalogItemRevision.revision),
      where: and(
        eq(profileCatalogItemRevision.itemId, itemId),
        eq(profileCatalogItemRevision.state, "draft")
      ),
    });
    if (!(item && draft)) {
      throw new ProfileDecorationCatalogError(
        "NOT_FOUND",
        "No hay un borrador para publicar."
      );
    }
    if (draft.id !== revisionId) {
      throw new ProfileDecorationCatalogError(
        "CONFLICT",
        "El borrador seleccionado ya no es el que se va a publicar. Recarga antes de continuar."
      );
    }
    const detail = await tx.query.profileCatalogDecorationRevision.findFirst({
      where: eq(profileCatalogDecorationRevision.revisionId, draft.id),
    });
    if (!detail) {
      throw new ProfileDecorationCatalogError(
        "INVALID_DRAFT",
        "El borrador no tiene apariencia."
      );
    }
    await validateManagedMedia(
      tx,
      detail.mediaAssetId,
      detail.reducedMotion
        ? profileDecorationReducedMotionSchema.parse(detail.reducedMotion)
        : null
    );
    validateProfileDecorationVisual({
      effectKey: detail.effectKey,
      fontKey: detail.fontKey,
      mediaAssetKey: detail.mediaAssetId ? "managed-media" : null,
      reducedMotion: detail.reducedMotion,
      slot: detail.slot,
    });
    return publishProfileCatalogRevision(tx, {
      actorUserId,
      currentPublishedRevisionId: item.currentPublishedRevisionId,
      draftRevisionId: draft.id,
      itemId,
      previousLifecycle: item.lifecycle,
      revision: draft.revision,
      targetKind: "decoration",
    });
  });
}
