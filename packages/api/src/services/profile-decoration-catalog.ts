import { and, desc, eq, inArray } from "@repo/db";
import type { db as database } from "@repo/db";
import {
  profileCatalogDecorationRevision,
  profileCatalogItem,
  profileCatalogItemRevision,
  profileMediaAsset,
} from "@repo/db/schema/app";
import { generateId } from "@repo/db/utils";
import { PATRON_TIER_KEYS } from "@repo/shared/constants";
import { MANAGED_PROFILE_MEDIA_SLOTS } from "@repo/shared/profile";
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

import { publishProfileCatalogRevision } from "./profile-catalog-publication";

type Database = typeof database;

const animatedEffects = new Set(["soft-pulse", "orbit-sparkles"]);
export const profileDecorationDraftSchema = z
  .object({
    catalogOrder: z.number().int().min(0).max(10_000),
    description: z.string().trim().max(500),
    effectKey: z.enum(PROFILE_DECORATION_EFFECT_KEYS).nullable(),
    eterisPrice: z.bigint().nonnegative().nullable(),
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
  });

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
    mediaAssetKey: null,
    reducedMotion: parsed.data.reducedMotion,
    slot: parsed.data.slot,
  });
  return parsed.data;
}

async function validateManagedMedia(
  db: Pick<Database, "query">,
  actorUserId: string,
  mediaAssetId: string | null,
  reducedMotion: z.infer<typeof profileDecorationReducedMotionSchema> | null
) {
  if (!mediaAssetId) {
    return;
  }
  const asset = await db.query.profileMediaAsset.findFirst({
    columns: {
      isAnimated: true,
      mimeType: true,
      ownerUserId: true,
      slot: true,
      validationStatus: true,
    },
    where: eq(profileMediaAsset.id, mediaAssetId),
  });
  if (
    !asset ||
    asset.ownerUserId !== actorUserId ||
    asset.validationStatus !== "ready" ||
    !asset.mimeType.startsWith("image/") ||
    !MANAGED_PROFILE_MEDIA_SLOTS.includes(
      asset.slot as (typeof MANAGED_PROFILE_MEDIA_SLOTS)[number]
    ) ||
    (asset.isAnimated && reducedMotion?.behavior !== "omit")
  ) {
    throw new ProfileDecorationCatalogError(
      "INVALID_DRAFT",
      "El recurso debe ser una imagen administrada y validada.",
      {
        mediaAssetId:
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
      mediaAssetKey: profileMediaAsset.objectKey,
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
      profileMediaAsset,
      eq(profileMediaAsset.id, profileCatalogDecorationRevision.mediaAssetId)
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
      mediaAssetKey: profileMediaAsset.objectKey,
      name: profileCatalogItemRevision.name,
      reducedMotion: profileCatalogDecorationRevision.reducedMotion,
      requiredTier: profileCatalogItemRevision.requiredTier,
      revision: profileCatalogItemRevision.revision,
      revisionId: profileCatalogItemRevision.id,
      slot: profileCatalogDecorationRevision.slot,
      stableKey: profileCatalogItem.stableKey,
      state: profileCatalogItemRevision.state,
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
      profileMediaAsset,
      eq(profileMediaAsset.id, profileCatalogDecorationRevision.mediaAssetId)
    )
    .where(eq(profileCatalogItem.kind, "decoration"))
    .orderBy(
      profileCatalogItem.stableKey,
      desc(profileCatalogItemRevision.revision)
    );
}

export async function saveProfileDecorationDraft(
  db: Database,
  actorUserId: string,
  input: unknown
) {
  const draft = parseDraft(input);
  await validateManagedMedia(
    db,
    actorUserId,
    draft.mediaAssetId,
    draft.reducedMotion
  );
  return db.transaction(async (tx) => {
    const item = draft.itemId
      ? await tx.query.profileCatalogItem.findFirst({
          where: and(
            eq(profileCatalogItem.id, draft.itemId),
            eq(profileCatalogItem.kind, "decoration")
          ),
        })
      : null;
    if (draft.itemId && !item) {
      throw new ProfileDecorationCatalogError(
        "NOT_FOUND",
        "La Decoration no existe."
      );
    }
    const itemId = item?.id ?? generateId();
    if (!item) {
      await tx.insert(profileCatalogItem).values({
        id: itemId,
        kind: "decoration",
        lifecycle: "draft",
        stableKey: `decoration.${draft.stableKey}`,
      });
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
      const updated = await tx
        .update(profileCatalogItemRevision)
        .set(metadata)
        .where(
          and(
            eq(profileCatalogItemRevision.id, revisionId),
            eq(profileCatalogItemRevision.state, "draft")
          )
        )
        .returning({ id: profileCatalogItemRevision.id });
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
    } else {
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
    }
    return { itemId, revisionId };
  });
}

export function publishProfileDecorationDraft(
  db: Database,
  actorUserId: string,
  itemId: string
) {
  return db.transaction(async (tx) => {
    const item = await tx.query.profileCatalogItem.findFirst({
      where: and(
        eq(profileCatalogItem.id, itemId),
        eq(profileCatalogItem.kind, "decoration")
      ),
    });
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
      actorUserId,
      detail.mediaAssetId,
      detail.reducedMotion
        ? profileDecorationReducedMotionSchema.parse(detail.reducedMotion)
        : null
    );
    validateProfileDecorationVisual({
      effectKey: detail.effectKey,
      fontKey: detail.fontKey,
      mediaAssetKey: null,
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
