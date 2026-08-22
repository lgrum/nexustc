import { and, desc, eq, inArray } from "@repo/db";
import type { db as database } from "@repo/db";
import {
  media,
  profileCatalogItem,
  profileCatalogItemRevision,
  profileCatalogSkinRevision,
} from "@repo/db/schema/app";
import { generateId } from "@repo/db/utils";
import { PATRON_TIER_KEYS } from "@repo/shared/constants";
import { ETERIS_MAX_AMOUNT } from "@repo/shared/eteris";
import {
  PROFILE_DEFAULT_SKIN_KEY,
  PROFILE_DEFAULT_SKIN_TOKENS,
  profileSkinTokensSchema,
} from "@repo/shared/profile-customization";
import type {
  ProfileSkinCatalogEntry,
  ProfileSkinTokens,
} from "@repo/shared/profile-customization";
import z from "zod";

import { publishProfileCatalogRevision } from "./profile-catalog-publication";

type Database = typeof database;
type ProfileSkinTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

const DEFAULT_SKIN_ITEM_ID = "profile-skin-default";
const MIN_TEXT_CONTRAST = 4.5;
const MIN_MUTED_CONTRAST = 3;
const MIN_FOCUS_CONTRAST = 3;

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

export const profileSkinDraftSchema = z
  .object({
    backgroundAssetId: z.string().min(1).nullable(),
    catalogOrder: z.number().int().min(0).max(10_000),
    description: z.string().trim().max(500),
    eterisPrice: z.bigint().nonnegative().max(ETERIS_MAX_AMOUNT).nullable(),
    isFree: z.boolean(),
    itemId: z.string().min(1).optional(),
    name: z.string().trim().min(1).max(80),
    requiredTier: z.enum(PATRON_TIER_KEYS).nullable(),
    stableKey: z
      .string()
      .trim()
      .min(2)
      .max(64)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    tokens: profileSkinTokensSchema,
  })
  .strict()
  .superRefine((draft, context) => {
    if (!(draft.itemId || draft.stableKey)) {
      context.addIssue({
        code: "custom",
        message: "El nuevo Skin necesita una clave estable.",
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
        message: "Un Skin gratuito no puede tener un precio de compra.",
        path: ["eterisPrice"],
      });
    }
    if (
      draft.backgroundAssetId &&
      (draft.tokens.shellOpacity < 1 || draft.tokens.showcaseOpacity < 1)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Los fondos de imagen necesitan superficies opacas para conservar el contraste.",
        path: ["tokens", "shellOpacity"],
      });
      context.addIssue({
        code: "custom",
        message:
          "Los fondos de imagen necesitan superficies opacas para conservar el contraste.",
        path: ["tokens", "showcaseOpacity"],
      });
    }
  });

export type ProfileSkinDraftInput = z.input<typeof profileSkinDraftSchema>;

export const profileSkinDeferredDraftSchema = profileSkinDraftSchema.omit({
  backgroundAssetId: true,
});

export class ProfileSkinCatalogError extends Error {
  readonly code:
    | "CONFLICT"
    | "INVALID_DRAFT"
    | "NOT_FOUND"
    | "PROTECTED_DEFAULT";
  readonly fieldErrors: Record<string, string>;

  constructor(
    code: ProfileSkinCatalogError["code"],
    message: string,
    fieldErrors: Record<string, string> = {}
  ) {
    super(message);
    this.name = "ProfileSkinCatalogError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function assertStaticProfileSkinUpload(input: { isAnimated: boolean }) {
  if (input.isAnimated) {
    throw new ProfileSkinCatalogError(
      "INVALID_DRAFT",
      "El fondo del Skin debe ser una imagen estática.",
      { backgroundSelection: "Las imágenes animadas no están permitidas." }
    );
  }
}

function parseHex(color: string) {
  return [1, 3, 5].map((start) =>
    Number.parseInt(color.slice(start, start + 2), 16)
  );
}

function luminance(color: string) {
  const channels = parseHex(color).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.040_45
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function interpolateHex(left: string, right: string, progress: number) {
  const leftChannels = parseHex(left);
  const rightChannels = parseHex(right);
  return `#${leftChannels
    .map((channel, index) =>
      Math.round(channel + (rightChannels[index]! - channel) * progress)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
}

function compositeHex(foreground: string, background: string, opacity: number) {
  const foregroundChannels = parseHex(foreground);
  const backgroundChannels = parseHex(background);
  return `#${foregroundChannels
    .map((channel, index) =>
      Math.round(channel * opacity + backgroundChannels[index]! * (1 - opacity))
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
}

export function getProfileSkinContrast(left: string, right: string) {
  const [bright, dark] = [luminance(left), luminance(right)].toSorted(
    (a, b) => b - a
  );
  return (bright! + 0.05) / (dark! + 0.05);
}

function representativeBackgrounds(tokens: ProfileSkinTokens) {
  if (tokens.background.kind === "solid") {
    return [tokens.background.color];
  }

  const { stops } = tokens.background;
  return stops.slice(0, -1).flatMap((stop, index) => {
    const nextStop = stops[index + 1]!;
    return Array.from({ length: 101 }, (_, sample) =>
      interpolateHex(stop.color, nextStop.color, sample / 100)
    );
  });
}

export function validateProfileSkinTokens(input: unknown): ProfileSkinTokens {
  const parsed = profileSkinTokensSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProfileSkinCatalogError(
      "INVALID_DRAFT",
      "Los tokens del Skin no son válidos.",
      Object.fromEntries(
        parsed.error.issues.map((issue) => [
          `tokens.${issue.path.join(".")}`,
          issue.message,
        ])
      )
    );
  }

  const backgrounds = representativeBackgrounds(parsed.data);
  const shellSurfaces = backgrounds.map((background) =>
    compositeHex(parsed.data.shellSurface, background, parsed.data.shellOpacity)
  );
  const showcaseSurfaces = backgrounds.map((background) =>
    compositeHex(
      parsed.data.showcaseSurface,
      background,
      parsed.data.showcaseOpacity
    )
  );
  const surfaces = [...backgrounds, ...shellSurfaces, ...showcaseSurfaces];
  if (
    surfaces.some(
      (surface) =>
        getProfileSkinContrast(parsed.data.foreground, surface) <
        MIN_TEXT_CONTRAST
    )
  ) {
    throw new ProfileSkinCatalogError(
      "INVALID_DRAFT",
      "El texto principal no conserva contraste suficiente.",
      { "tokens.foreground": "Necesita contraste 4.5:1 en todos los fondos." }
    );
  }
  if (
    surfaces.some(
      (surface) =>
        getProfileSkinContrast(parsed.data.mutedForeground, surface) <
        MIN_MUTED_CONTRAST
    )
  ) {
    throw new ProfileSkinCatalogError(
      "INVALID_DRAFT",
      "El texto secundario no conserva contraste suficiente.",
      {
        "tokens.mutedForeground": "Necesita contraste 3:1 en todos los fondos.",
      }
    );
  }
  if (
    [...shellSurfaces, ...showcaseSurfaces].some(
      (surface) =>
        getProfileSkinContrast(parsed.data.focus, surface) < MIN_FOCUS_CONTRAST
    )
  ) {
    throw new ProfileSkinCatalogError(
      "INVALID_DRAFT",
      "El indicador de foco no se distingue de las superficies.",
      { "tokens.focus": "Necesita contraste 3:1 para navegación por teclado." }
    );
  }
  return parsed.data;
}

function validateOpaqueSurfacesForBackgroundAsset(
  tokens: ProfileSkinTokens,
  hasBackgroundAsset: boolean
) {
  if (
    hasBackgroundAsset &&
    (tokens.shellOpacity < 1 || tokens.showcaseOpacity < 1)
  ) {
    throw new ProfileSkinCatalogError(
      "INVALID_DRAFT",
      "Los fondos de imagen necesitan superficies opacas para conservar el contraste.",
      {
        "tokens.shellOpacity":
          "Usa una opacidad de 1 cuando el Skin tiene una imagen de fondo.",
        "tokens.showcaseOpacity":
          "Usa una opacidad de 1 cuando el Skin tiene una imagen de fondo.",
      }
    );
  }
}

function parseDraft(input: unknown) {
  const parsed = profileSkinDraftSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProfileSkinCatalogError(
      "INVALID_DRAFT",
      "El borrador del Skin no es válido.",
      Object.fromEntries(
        parsed.error.issues.map((issue) => [
          issue.path.join("."),
          issue.message,
        ])
      )
    );
  }
  return {
    ...parsed.data,
    tokens: (() => {
      const tokens = validateProfileSkinTokens(parsed.data.tokens);
      validateOpaqueSurfacesForBackgroundAsset(
        tokens,
        Boolean(parsed.data.backgroundAssetId)
      );
      return tokens;
    })(),
  };
}

export async function listPublishedProfileSkins(
  db: Pick<Database, "select">
): Promise<ProfileSkinCatalogEntry[]> {
  const rows = await db
    .select({
      backgroundAssetKey: media.objectKey,
      description: profileCatalogItemRevision.description,
      eterisPrice: profileCatalogItemRevision.eterisPrice,
      isFree: profileCatalogItemRevision.isFree,
      itemId: profileCatalogItem.id,
      key: profileCatalogItem.stableKey,
      lifecycle: profileCatalogItem.lifecycle,
      name: profileCatalogItemRevision.name,
      revision: profileCatalogItemRevision.revision,
      requiredTier: profileCatalogItemRevision.requiredTier,
      tokens: profileCatalogSkinRevision.tokens,
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
      profileCatalogSkinRevision,
      eq(profileCatalogSkinRevision.revisionId, profileCatalogItemRevision.id)
    )
    .leftJoin(media, eq(media.id, profileCatalogSkinRevision.backgroundAssetId))
    .where(
      and(
        eq(profileCatalogItem.kind, "skin"),
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
          entitled: false as boolean,
          key: row.key.replace(/^skin\./, ""),
          permanentlyOwned: false,
          selectable: false as boolean,
          tokens: validateProfileSkinTokens(row.tokens),
        },
      ];
    } catch {
      return row.key === `skin.${PROFILE_DEFAULT_SKIN_KEY}`
        ? [
            {
              ...row,
              backgroundAssetKey: null,
              entitled: true as boolean,
              key: PROFILE_DEFAULT_SKIN_KEY,
              permanentlyOwned: false,
              selectable: true as boolean,
              tokens: PROFILE_DEFAULT_SKIN_TOKENS,
            },
          ]
        : [];
    }
  });
}

export function listOwnerProfileSkins(db: Database) {
  return db
    .select({
      backgroundAssetKey: media.objectKey,
      backgroundAssetId: profileCatalogSkinRevision.backgroundAssetId,
      catalogOrder: profileCatalogItemRevision.catalogOrder,
      description: profileCatalogItemRevision.description,
      eterisPrice: profileCatalogItemRevision.eterisPrice,
      isFree: profileCatalogItemRevision.isFree,
      itemId: profileCatalogItem.id,
      currentPublishedRevisionId: profileCatalogItem.currentPublishedRevisionId,
      isProtectedDefault: profileCatalogItem.isProtectedDefault,
      lifecycle: profileCatalogItem.lifecycle,
      name: profileCatalogItemRevision.name,
      requiredTier: profileCatalogItemRevision.requiredTier,
      revision: profileCatalogItemRevision.revision,
      revisionId: profileCatalogItemRevision.id,
      stableKey: profileCatalogItem.stableKey,
      state: profileCatalogItemRevision.state,
      updatedAt: profileCatalogItemRevision.updatedAt,
      tokens: profileCatalogSkinRevision.tokens,
    })
    .from(profileCatalogItem)
    .innerJoin(
      profileCatalogItemRevision,
      eq(profileCatalogItemRevision.itemId, profileCatalogItem.id)
    )
    .innerJoin(
      profileCatalogSkinRevision,
      eq(profileCatalogSkinRevision.revisionId, profileCatalogItemRevision.id)
    )
    .leftJoin(media, eq(media.id, profileCatalogSkinRevision.backgroundAssetId))
    .where(eq(profileCatalogItem.kind, "skin"))
    .orderBy(
      profileCatalogItem.stableKey,
      desc(profileCatalogItemRevision.revision)
    );
}

export function saveProfileSkinDraft(
  db: Database | ProfileSkinTransaction,
  actorUserId: string,
  input: unknown,
  expectedUpdatedAt?: Date
) {
  const draft = parseDraft(input);
  return db.transaction(async (tx) => {
    const [existingItem] = draft.itemId
      ? await tx
          .select()
          .from(profileCatalogItem)
          .where(
            and(
              eq(profileCatalogItem.id, draft.itemId),
              eq(profileCatalogItem.kind, "skin")
            )
          )
          .for("update")
      : [];
    if (draft.itemId && !existingItem) {
      throw new ProfileSkinCatalogError("NOT_FOUND", "El Skin no existe.");
    }

    const itemId = existingItem?.id ?? generateId();
    const isProtectedDefault = itemId === DEFAULT_SKIN_ITEM_ID;
    if (
      isProtectedDefault &&
      (!draft.isFree ||
        draft.requiredTier !== null ||
        draft.eterisPrice !== null)
    ) {
      throw new ProfileSkinCatalogError(
        "PROTECTED_DEFAULT",
        "El Skin predeterminado siempre debe permanecer activo y gratuito."
      );
    }

    if (draft.backgroundAssetId) {
      const asset = await tx.query.media.findFirst({
        columns: { id: true, isAnimated: true, objectKey: true },
        where: eq(media.id, draft.backgroundAssetId),
      });
      if (
        !asset ||
        asset.isAnimated !== false ||
        !asset.objectKey.endsWith(".webp")
      ) {
        throw new ProfileSkinCatalogError(
          "INVALID_DRAFT",
          "El fondo debe ser una imagen administrada, estática y validada.",
          {
            backgroundAssetId:
              "Elige una imagen WebP estática de la biblioteca.",
          }
        );
      }
    }

    if (!existingItem) {
      try {
        await tx.insert(profileCatalogItem).values({
          id: itemId,
          kind: "skin",
          lifecycle: "draft",
          stableKey: `skin.${draft.stableKey}`,
        });
      } catch (error) {
        if (isCatalogStableKeyConflict(error)) {
          throw new ProfileSkinCatalogError(
            "CONFLICT",
            "La clave estable del Skin ya está en uso.",
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
      isFree: isProtectedDefault ? true : draft.isFree,
      name: draft.name,
      requiredTier: isProtectedDefault ? null : draft.requiredTier,
    };
    if (currentDraft) {
      if (
        !expectedUpdatedAt ||
        currentDraft.updatedAt.getTime() !== expectedUpdatedAt.getTime()
      ) {
        throw new ProfileSkinCatalogError(
          "CONFLICT",
          "El Skin cambió mientras intentabas guardar el borrador. Recarga antes de volver a guardar."
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
        throw new ProfileSkinCatalogError(
          "CONFLICT",
          "El Skin cambió mientras intentabas guardar el borrador. Recarga antes de volver a guardar."
        );
      }
      await tx
        .update(profileCatalogSkinRevision)
        .set({
          backgroundAssetId: draft.backgroundAssetId,
          tokens: draft.tokens,
        })
        .where(eq(profileCatalogSkinRevision.revisionId, revisionId));
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
    await tx.insert(profileCatalogSkinRevision).values({
      backgroundAssetId: draft.backgroundAssetId,
      revisionId,
      tokens: draft.tokens,
    });
    const [createdRevision] = await tx
      .select({ updatedAt: profileCatalogItemRevision.updatedAt })
      .from(profileCatalogItemRevision)
      .where(eq(profileCatalogItemRevision.id, revisionId));
    return { itemId, revisionId, updatedAt: createdRevision?.updatedAt };
  });
}

export function publishProfileSkinDraft(
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
          eq(profileCatalogItem.kind, "skin")
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
      throw new ProfileSkinCatalogError(
        "NOT_FOUND",
        "No hay un borrador para publicar."
      );
    }
    if (draft.id !== revisionId) {
      throw new ProfileSkinCatalogError(
        "CONFLICT",
        "El borrador seleccionado ya no es el que se va a publicar. Recarga antes de continuar."
      );
    }
    const detail = await tx.query.profileCatalogSkinRevision.findFirst({
      where: eq(profileCatalogSkinRevision.revisionId, draft.id),
    });
    if (!detail) {
      throw new ProfileSkinCatalogError(
        "INVALID_DRAFT",
        "El borrador no tiene tokens visuales."
      );
    }
    const tokens = validateProfileSkinTokens(detail.tokens);
    validateOpaqueSurfacesForBackgroundAsset(
      tokens,
      Boolean(detail.backgroundAssetId)
    );
    if (detail.backgroundAssetId) {
      const asset = await tx.query.media.findFirst({
        columns: { isAnimated: true },
        where: eq(media.id, detail.backgroundAssetId),
      });
      if (asset?.isAnimated !== false) {
        throw new ProfileSkinCatalogError(
          "INVALID_DRAFT",
          "El fondo animado o no validado no puede publicarse."
        );
      }
    }
    if (
      item.isProtectedDefault &&
      (!draft.isFree ||
        draft.requiredTier !== null ||
        draft.eterisPrice !== null)
    ) {
      throw new ProfileSkinCatalogError(
        "PROTECTED_DEFAULT",
        "El Skin predeterminado siempre debe ser gratuito."
      );
    }

    return publishProfileCatalogRevision(tx, {
      actorUserId,
      currentPublishedRevisionId: item.currentPublishedRevisionId,
      draftRevisionId: draft.id,
      itemId,
      previousLifecycle: item.lifecycle,
      revision: draft.revision,
      targetKind: "skin",
    });
  });
}
