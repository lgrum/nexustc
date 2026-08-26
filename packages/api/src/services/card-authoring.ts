/* oxlint-disable eslint/require-await -- Authoring commands expose a stable rejected-promise contract for validation failures. */
import { and, eq, sql } from "@repo/db";
import type { db as database } from "@repo/db";
import {
  cardCharacter,
  cardInstance,
  cardSeries,
  cardTemplate,
  cardTemplateAuditEvent,
  cardTemplateRenderedVariant,
  collectibleOwnershipEvent,
  media,
} from "@repo/db/schema/app";
import { generateId } from "@repo/db/utils";
import {
  assertCardTemplateFieldsMutable,
  assertCompleteCardRenderPlan,
  buildCardRenderPlan,
  cardCharacterDraftSchema,
  cardEffectConfigSchema,
  cardPresentationMetadataSchema,
  cardSeriesDraftSchema,
  cardTemplateDraftSchema,
  getCardCharacterIdentity,
  normalizeCardCharacterName,
  normalizeCardGameName,
} from "@repo/shared/collectibles";
import type {
  CardEffectConfig,
  CardPresentationMetadata,
  CardRenderedVariant,
  CardTemplateDraft,
} from "@repo/shared/collectibles";
import z from "zod";

import type { DeferredMediaSelectionInput } from "../utils/deferred-media";
import { withDeferredMediaSelection } from "../utils/deferred-media";
import { getManagedMediaAssetFromRecord } from "../utils/managed-media";
import { appendCollectibleAdminAction } from "./collectible-admin-action";

type Database = typeof database;
type CardAuthoringTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

export class CardAuthoringError extends Error {
  readonly code:
    | "CONFLICT"
    | "INVALID_DRAFT"
    | "INVALID_MEDIA"
    | "NOT_FOUND"
    | "INVALID_TRANSITION"
    | "IMMUTABLE_AFTER_MINT"
    | "REASON_REQUIRED";
  readonly fieldErrors: Record<string, string>;

  constructor(
    code: CardAuthoringError["code"],
    message: string,
    fieldErrors: Record<string, string> = {}
  ) {
    super(message);
    this.name = "CardAuthoringError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export const cardCharacterInputSchema = cardCharacterDraftSchema;
export const cardSeriesInputSchema = cardSeriesDraftSchema;
export const cardTemplateDeferredDraftInputSchema =
  cardTemplateDraftSchema.omit({ portraitMediaId: true });

export type CardAuthoringRenderInput = {
  effect: CardEffectConfig;
  gameName?: string;
  characterName?: string;
  portraitMediaId: string;
  presentation: CardPresentationMetadata;
  rarity?: "common" | "uncommon" | "rare" | "epic" | "legendary";
  templateId: string;
};

export function assertStaticCardPortraitUpload(input: { isAnimated: boolean }) {
  if (input.isAnimated) {
    throw new CardAuthoringError(
      "INVALID_MEDIA",
      "El retrato debe ser una imagen estática.",
      { portraitSelection: "Las imágenes animadas no están permitidas." }
    );
  }
}

export type CardRenderWorker = (
  input: CardAuthoringRenderInput
) => Promise<readonly CardRenderedVariant[]> | readonly CardRenderedVariant[];

function parseInput<T>(schema: z.ZodType<T>, input: unknown, label: string): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new CardAuthoringError(
      "INVALID_DRAFT",
      `El ${label} no es válido.`,
      Object.fromEntries(
        parsed.error.issues.map((issue) => [
          issue.path.join(".") || "form",
          issue.message,
        ])
      )
    );
  }
  return parsed.data;
}

function requireReason(reason: string) {
  const normalized = reason.trim();
  if (normalized.length < 3) {
    throw new CardAuthoringError(
      "REASON_REQUIRED",
      "Indica un motivo de al menos 3 caracteres."
    );
  }
  return normalized;
}

function mediaIsValid(asset: {
  id: string;
  isAnimated: boolean | null;
  objectKey: string;
}) {
  try {
    const { assetFormat, assetKey } = getManagedMediaAssetFromRecord({
      id: asset.id,
      objectKey: asset.objectKey,
    });
    return (
      asset.isAnimated === false &&
      assetKey.startsWith("media/") &&
      ["avif", "jpeg", "jpg", "png", "webp"].includes(assetFormat)
    );
  } catch {
    return false;
  }
}

async function requireManagedPortrait(
  tx: Pick<Database, "query">,
  mediaId: string
) {
  const asset = await tx.query.media.findFirst({
    columns: { id: true, isAnimated: true, objectKey: true },
    where: eq(media.id, mediaId),
  });
  if (!asset || !mediaIsValid(asset)) {
    throw new CardAuthoringError(
      "INVALID_MEDIA",
      "El retrato debe ser una imagen administrada, validada y estática.",
      { portraitMediaId: "Elige una imagen estática de la biblioteca." }
    );
  }
  return asset;
}

async function requireAuthoringReferences(
  tx: Pick<Database, "query">,
  draft: CardTemplateDraft
) {
  const [character, series] = await Promise.all([
    tx.query.cardCharacter.findFirst({
      columns: { id: true, lifecycle: true },
      where: eq(cardCharacter.id, draft.characterId),
    }),
    tx.query.cardSeries.findFirst({
      columns: { id: true, lifecycle: true },
      where: eq(cardSeries.id, draft.seriesId),
    }),
  ]);
  if (!character || !series) {
    throw new CardAuthoringError(
      "NOT_FOUND",
      "El personaje o la Serie no existen."
    );
  }
  if (character.lifecycle === "retired" || series.lifecycle === "retired") {
    throw new CardAuthoringError(
      "INVALID_TRANSITION",
      "No puedes asociar un borrador a un personaje o Serie retirado."
    );
  }
  return { character, series };
}

export function normalizeCardCharacterDraft(input: unknown) {
  const draft = parseInput(cardCharacterDraftSchema, input, "personaje");
  const normalized = getCardCharacterIdentity(draft);
  return {
    ...draft,
    normalizedCharacterName: normalized.characterName,
    normalizedGameName: normalized.gameName,
  };
}

export async function createCardCharacter(
  db: Database,
  actorUserId: string,
  input: unknown
) {
  const draft = normalizeCardCharacterDraft(input);
  const updatedAt = new Date();
  try {
    const [created] = await db
      .insert(cardCharacter)
      .values({
        characterName: draft.characterName,
        createdByUserId: actorUserId,
        gameName: draft.gameName,
        id: draft.id ?? generateId(),
        normalizedCharacterName: draft.normalizedCharacterName,
        normalizedGameName: draft.normalizedGameName,
        updatedAt,
        updatedByUserId: actorUserId,
      })
      .returning();
    if (!created) {
      throw new CardAuthoringError(
        "CONFLICT",
        "No se pudo crear el personaje."
      );
    }
    return created;
  } catch (error) {
    if (isUniqueViolation(error, "card_character_normalized_identity_unique")) {
      throw new CardAuthoringError(
        "CONFLICT",
        "Ya existe un personaje con ese juego y nombre normalizados.",
        { characterName: "Usa el personaje existente para reutilizarlo." }
      );
    }
    throw error;
  }
}

export async function updateCardCharacter(
  db: Database,
  actorUserId: string,
  characterId: string,
  input: unknown,
  expectedVersion?: Date
) {
  const parsedInput = parseInput(cardCharacterDraftSchema, input, "personaje");
  const draft = normalizeCardCharacterDraft({
    ...parsedInput,
    id: characterId,
  });
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(cardCharacter)
      .where(eq(cardCharacter.id, characterId))
      .for("update");
    if (!current) {
      throw new CardAuthoringError("NOT_FOUND", "El personaje no existe.");
    }
    if (!expectedVersion) {
      throw new CardAuthoringError(
        "CONFLICT",
        "Confirma la versión actual antes de editar el personaje."
      );
    }
    if (current.updatedAt.getTime() !== expectedVersion.getTime()) {
      throw new CardAuthoringError(
        "CONFLICT",
        "El personaje cambió mientras lo editabas. Recarga antes de guardar."
      );
    }
    if (current.lifecycle === "retired") {
      throw new CardAuthoringError(
        "INVALID_TRANSITION",
        "Un personaje retirado no se puede editar."
      );
    }
    try {
      const [updated] = await tx
        .update(cardCharacter)
        .set({
          characterName: draft.characterName,
          gameName: draft.gameName,
          normalizedCharacterName: draft.normalizedCharacterName,
          normalizedGameName: draft.normalizedGameName,
          updatedByUserId: actorUserId,
        })
        .where(eq(cardCharacter.id, characterId))
        .returning();
      return updated;
    } catch (error) {
      if (
        isUniqueViolation(error, "card_character_normalized_identity_unique")
      ) {
        throw new CardAuthoringError(
          "CONFLICT",
          "Ya existe un personaje con ese juego y nombre normalizados."
        );
      }
      throw error;
    }
  });
}

export async function createCardSeries(
  db: Database,
  actorUserId: string,
  input: unknown
) {
  const draft = parseInput(cardSeriesDraftSchema, input, "Serie");
  const updatedAt = new Date();
  const [created] = await db
    .insert(cardSeries)
    .values({
      createdByUserId: actorUserId,
      description: draft.description,
      id: draft.id ?? generateId(),
      name: draft.name,
      updatedAt,
      updatedByUserId: actorUserId,
    })
    .returning();
  if (!created) {
    throw new CardAuthoringError("CONFLICT", "No se pudo crear la Serie.");
  }
  return created;
}

export async function updateCardSeries(
  db: Database,
  actorUserId: string,
  seriesId: string,
  input: unknown,
  expectedVersion?: Date
) {
  const parsedInput = parseInput(cardSeriesDraftSchema, input, "Serie");
  const draft = parseInput(
    cardSeriesDraftSchema,
    { ...parsedInput, id: seriesId },
    "Serie"
  );
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(cardSeries)
      .where(eq(cardSeries.id, seriesId))
      .for("update");
    if (!current) {
      throw new CardAuthoringError("NOT_FOUND", "La Serie no existe.");
    }
    if (!expectedVersion) {
      throw new CardAuthoringError(
        "CONFLICT",
        "Confirma la versión actual antes de editar la Serie."
      );
    }
    if (current.updatedAt.getTime() !== expectedVersion.getTime()) {
      throw new CardAuthoringError(
        "CONFLICT",
        "La Serie cambió mientras la editabas. Recarga antes de guardar."
      );
    }
    if (current.lifecycle === "retired") {
      throw new CardAuthoringError(
        "INVALID_TRANSITION",
        "Una Serie retirada no se puede editar."
      );
    }
    const [updated] = await tx
      .update(cardSeries)
      .set({
        description: draft.description,
        name: draft.name,
        updatedByUserId: actorUserId,
      })
      .where(eq(cardSeries.id, seriesId))
      .returning();
    return updated;
  });
}

export async function retireCardCharacter(
  db: Database,
  actorUserId: string,
  characterId: string,
  input: { reason: string; expectedVersion?: Date }
) {
  const reason = requireReason(input.reason);
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(cardCharacter)
      .where(eq(cardCharacter.id, characterId))
      .for("update");
    if (!current) {
      throw new CardAuthoringError("NOT_FOUND", "El personaje no existe.");
    }
    if (!input.expectedVersion) {
      throw new CardAuthoringError(
        "CONFLICT",
        "Confirma la versión actual antes de retirar el personaje."
      );
    }
    if (current.updatedAt.getTime() !== input.expectedVersion.getTime()) {
      throw new CardAuthoringError(
        "CONFLICT",
        "El personaje está desactualizado."
      );
    }
    if (current.lifecycle === "retired") {
      throw new CardAuthoringError(
        "INVALID_TRANSITION",
        "El personaje ya está retirado."
      );
    }
    const [updated] = await tx
      .update(cardCharacter)
      .set({ lifecycle: "retired", updatedByUserId: actorUserId })
      .where(eq(cardCharacter.id, characterId))
      .returning();
    await appendCollectibleAdminAction(tx, {
      action: "retire",
      actorUserId,
      after: { lifecycle: "retired" },
      before: { lifecycle: current.lifecycle, updatedAt: current.updatedAt },
      idempotencyKey: `card-character-retire:${characterId}:${current.updatedAt.toISOString()}`,
      reason,
      targetId: characterId,
      targetKind: "card-character",
      version: 1,
    });
    return {
      id: updated?.id ?? characterId,
      lifecycle: "retired" as const,
      reason,
    };
  });
}

export async function retireCardSeries(
  db: Database,
  actorUserId: string,
  seriesId: string,
  input: { reason: string; expectedVersion?: Date }
) {
  const reason = requireReason(input.reason);
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(cardSeries)
      .where(eq(cardSeries.id, seriesId))
      .for("update");
    if (!current) {
      throw new CardAuthoringError("NOT_FOUND", "La Serie no existe.");
    }
    if (!input.expectedVersion) {
      throw new CardAuthoringError(
        "CONFLICT",
        "Confirma la versión actual antes de retirar la Serie."
      );
    }
    if (current.updatedAt.getTime() !== input.expectedVersion.getTime()) {
      throw new CardAuthoringError("CONFLICT", "La Serie está desactualizada.");
    }
    if (current.lifecycle === "retired") {
      throw new CardAuthoringError(
        "INVALID_TRANSITION",
        "La Serie ya está retirada."
      );
    }
    const [updated] = await tx
      .update(cardSeries)
      .set({ lifecycle: "retired", updatedByUserId: actorUserId })
      .where(eq(cardSeries.id, seriesId))
      .returning();
    await appendCollectibleAdminAction(tx, {
      action: "retire",
      actorUserId,
      after: { lifecycle: "retired" },
      before: { lifecycle: current.lifecycle, updatedAt: current.updatedAt },
      idempotencyKey: `card-series-retire:${seriesId}:${current.updatedAt.toISOString()}`,
      reason,
      targetId: seriesId,
      targetKind: "card-series",
      version: 1,
    });
    return {
      id: updated?.id ?? seriesId,
      lifecycle: "retired" as const,
      reason,
    };
  });
}

function isUniqueViolation(error: unknown, constraint: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505" &&
    "constraint" in error &&
    error.constraint === constraint
  );
}

function cardAuditSnapshot(row: {
  characterId: string;
  description: string;
  edition: string | null;
  effectConfig: CardEffectConfig;
  lifetimeSupplyCeiling: number | null;
  portraitMediaId: string;
  presentationMetadata: CardPresentationMetadata;
  rarity: string;
  renderedVariants: CardRenderedVariant[];
  seriesId: string;
}) {
  return {
    characterId: row.characterId,
    description: row.description,
    edition: row.edition,
    effectConfig: row.effectConfig,
    lifetimeSupplyCeiling: row.lifetimeSupplyCeiling,
    portraitMediaId: row.portraitMediaId,
    presentationMetadata: row.presentationMetadata,
    rarity: row.rarity,
    renderedVariants: row.renderedVariants,
    seriesId: row.seriesId,
  };
}

async function persistRenderVariants(
  tx: CardAuthoringTransaction,
  templateId: string,
  variants: readonly CardRenderedVariant[]
) {
  await tx
    .delete(cardTemplateRenderedVariant)
    .where(eq(cardTemplateRenderedVariant.templateId, templateId));
  if (variants.length > 0) {
    await tx.insert(cardTemplateRenderedVariant).values(
      variants.map((variant) => ({
        contentHash: variant.contentHash,
        height: variant.height,
        objectKey: variant.objectKey,
        templateId,
        variant: variant.variant,
        width: variant.width,
      }))
    );
  }
}

async function saveCardTemplateDraftInTransaction(
  tx: CardAuthoringTransaction,
  actorUserId: string,
  draft: CardTemplateDraft,
  templateId: string,
  expectedVersion?: number
) {
  const [current] = draft.id
    ? await tx
        .select()
        .from(cardTemplate)
        .where(eq(cardTemplate.id, draft.id))
        .for("update")
    : [];
  if (draft.id && !current) {
    throw new CardAuthoringError("NOT_FOUND", "La plantilla no existe.");
  }
  if (current && expectedVersion === undefined) {
    throw new CardAuthoringError(
      "CONFLICT",
      "Confirma la versión actual antes de guardar cambios."
    );
  }
  if (current?.lifecycle === "retired") {
    throw new CardAuthoringError(
      "INVALID_TRANSITION",
      "Una plantilla retirada no se puede editar."
    );
  }
  if (
    current &&
    expectedVersion !== undefined &&
    current.version !== expectedVersion
  ) {
    throw new CardAuthoringError(
      "CONFLICT",
      "La plantilla cambió mientras la editabas. Recarga antes de guardar."
    );
  }
  await requireAuthoringReferences(tx, draft);
  await requireManagedPortrait(tx, draft.portraitMediaId);
  const effect = cardEffectConfigSchema.parse(draft.effect);
  const presentation = cardPresentationMetadataSchema.parse(draft.presentation);
  if (current) {
    try {
      assertCardTemplateFieldsMutable({
        changes: {
          characterId: draft.characterId,
          edition: draft.edition,
          lifetimeSupplyCeiling: draft.lifetimeSupplyCeiling,
          rarity: draft.rarity,
          seriesId: draft.seriesId,
        },
        mintedSupply: current.mintedSupply,
      });
    } catch (error) {
      throw new CardAuthoringError(
        "IMMUTABLE_AFTER_MINT",
        error instanceof Error ? error.message : "La plantilla es inmutable."
      );
    }
    const [updated] = await tx
      .update(cardTemplate)
      .set({
        description: draft.description,
        edition: draft.edition,
        effectConfig: effect,
        lifecycle: current.mintedSupply > 0 ? current.lifecycle : "draft",
        lifetimeSupplyCeiling: draft.lifetimeSupplyCeiling,
        portraitMediaId: draft.portraitMediaId,
        presentationMetadata: presentation,
        publishedAt: current.mintedSupply > 0 ? current.publishedAt : null,
        publishedByUserId:
          current.mintedSupply > 0 ? current.publishedByUserId : null,
        renderedVariants: [],
        renderIdentity: null,
        seriesId: draft.seriesId,
        updatedByUserId: actorUserId,
        version: current.version + 1,
      })
      .where(
        and(
          eq(cardTemplate.id, current.id),
          eq(cardTemplate.version, current.version)
        )
      )
      .returning();
    if (!updated) {
      throw new CardAuthoringError(
        "CONFLICT",
        "La plantilla cambió mientras la editabas."
      );
    }
    await persistRenderVariants(tx, current.id, []);
    return updated;
  }
  const updatedAt = new Date();
  const [created] = await tx
    .insert(cardTemplate)
    .values({
      characterId: draft.characterId,
      createdByUserId: actorUserId,
      description: draft.description,
      edition: draft.edition,
      effectConfig: effect,
      id: templateId,
      lifetimeSupplyCeiling: draft.lifetimeSupplyCeiling,
      portraitMediaId: draft.portraitMediaId,
      presentationMetadata: presentation,
      rarity: draft.rarity,
      seriesId: draft.seriesId,
      updatedAt,
      updatedByUserId: actorUserId,
    })
    .returning();
  if (!created) {
    throw new CardAuthoringError("CONFLICT", "No se pudo crear la plantilla.");
  }
  await tx.insert(cardTemplateAuditEvent).values({
    action: "create",
    actorUserId,
    after: cardAuditSnapshot({
      ...created,
      effectConfig: effect,
      presentationMetadata: presentation,
      renderedVariants: [],
    }),
    reason: "Creación del borrador",
    templateId,
  });
  return created;
}

export async function saveCardTemplateDraftWithPortrait(
  db: Database,
  actorUserId: string,
  input: unknown,
  portraitSelection: DeferredMediaSelectionInput,
  expectedVersion?: number
) {
  const draft = parseInput(
    cardTemplateDeferredDraftInputSchema,
    input,
    "la carta"
  );
  const templateId = draft.id ?? generateId();

  return await withDeferredMediaSelection({
    db,
    onComplete: async ({ orderedMedia, tx }) => {
      const [portrait] = orderedMedia;
      if (!portrait) {
        throw new CardAuthoringError(
          "INVALID_MEDIA",
          "Selecciona una imagen para el retrato de la carta.",
          { portraitSelection: "La imagen de retrato es obligatoria." }
        );
      }
      return await saveCardTemplateDraftInTransaction(
        tx,
        actorUserId,
        { ...draft, portraitMediaId: portrait.id },
        templateId,
        expectedVersion
      );
    },
    ownerKind: "Carta",
    resourceName: templateId,
    selection: portraitSelection,
    validatePendingFile: assertStaticCardPortraitUpload,
  });
}

async function getTemplateForUpdate(db: Database, templateId: string) {
  return db.transaction(async (tx) => {
    const [template] = await tx
      .select()
      .from(cardTemplate)
      .where(eq(cardTemplate.id, templateId))
      .for("update");
    return template;
  });
}

async function getCardCharacterLabels(
  db: Pick<Database, "query">,
  characterId: string
) {
  const character = await db.query.cardCharacter.findFirst({
    columns: { characterName: true, gameName: true },
    where: eq(cardCharacter.id, characterId),
  });
  if (!character) {
    throw new CardAuthoringError(
      "NOT_FOUND",
      "El personaje de la plantilla no existe."
    );
  }
  return character;
}

function defaultRenderWorker(input: CardAuthoringRenderInput) {
  return buildCardRenderPlan(input).variants;
}

export async function renderCardTemplateVariants(
  db: Pick<Database, "query">,
  input: CardAuthoringRenderInput,
  worker: CardRenderWorker = defaultRenderWorker
) {
  await requireManagedPortrait(db, input.portraitMediaId);
  const variants = await worker(input);
  try {
    const completeVariants = assertCompleteCardRenderPlan(variants);
    const expectedPrefix = `cards/rendered/${input.templateId}/`;
    for (const variant of completeVariants) {
      if (
        !variant.objectKey.startsWith(
          `${expectedPrefix}${variant.contentHash}/`
        ) ||
        !variant.objectKey.endsWith(`/${variant.variant}.webp`)
      ) {
        throw new Error(
          "Las variantes deben usar claves content-addressed administradas."
        );
      }
    }
    return completeVariants;
  } catch (error) {
    throw new CardAuthoringError(
      "INVALID_DRAFT",
      error instanceof Error
        ? error.message
        : "La publicación necesita todas las variantes renderizadas."
    );
  }
}

export async function publishCardTemplate(
  db: Database,
  actorUserId: string,
  templateId: string,
  input: { expectedVersion: number; reason?: string },
  worker?: CardRenderWorker
) {
  const reason = input.reason?.trim() || "Publicación de la plantilla";
  // Render before the transaction: object-storage/rendering work must never
  // hold economy or supply locks. The database write below is only metadata.
  const current = await getTemplateForUpdate(db, templateId);
  if (!current) {
    throw new CardAuthoringError("NOT_FOUND", "La plantilla no existe.");
  }
  if (current.version !== input.expectedVersion) {
    throw new CardAuthoringError(
      "CONFLICT",
      "La plantilla está desactualizada."
    );
  }
  if (current.lifecycle === "retired") {
    throw new CardAuthoringError(
      "INVALID_TRANSITION",
      "Una plantilla retirada no se puede publicar."
    );
  }
  if (current.lifecycle !== "draft") {
    throw new CardAuthoringError(
      "INVALID_TRANSITION",
      "Solo un borrador puede publicarse."
    );
  }
  const character = await getCardCharacterLabels(db, current.characterId);
  const variants = await renderCardTemplateVariants(
    db,
    {
      characterName: character.characterName,
      effect: current.effectConfig,
      gameName: character.gameName,
      portraitMediaId: current.portraitMediaId,
      presentation: current.presentationMetadata,
      rarity: current.rarity,
      templateId,
    },
    worker
  );
  const publishedAt = new Date();
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(cardTemplate)
      .where(eq(cardTemplate.id, templateId))
      .for("update");
    if (!locked || locked.version !== input.expectedVersion) {
      throw new CardAuthoringError(
        "CONFLICT",
        "La plantilla cambió mientras se renderizaba."
      );
    }
    const before = cardAuditSnapshot(locked);
    const [published] = await tx
      .update(cardTemplate)
      .set({
        lifecycle: "active",
        publishedAt,
        publishedByUserId: actorUserId,
        renderIdentity: variants[0]?.contentHash ?? null,
        renderedVariants: variants,
        updatedByUserId: actorUserId,
        version: locked.version + 1,
      })
      .where(
        and(
          eq(cardTemplate.id, templateId),
          eq(cardTemplate.version, locked.version)
        )
      )
      .returning();
    if (!published) {
      throw new CardAuthoringError(
        "CONFLICT",
        "La plantilla cambió mientras se publicaba."
      );
    }
    await persistRenderVariants(tx, templateId, variants);
    await tx.insert(cardTemplateAuditEvent).values({
      action: "publish",
      actorUserId,
      after: cardAuditSnapshot({
        ...published,
        renderedVariants: variants,
      }),
      before,
      reason,
      templateId,
    });
    return { publishedAt, templateId, version: published.version };
  });
}

export async function changeCardTemplateLifecycle(
  db: Database,
  actorUserId: string,
  templateId: string,
  action: "retire" | "disable" | "restore",
  input: { expectedVersion: number; reason: string }
) {
  const reason = requireReason(input.reason);
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(cardTemplate)
      .where(eq(cardTemplate.id, templateId))
      .for("update");
    if (!current) {
      throw new CardAuthoringError("NOT_FOUND", "La plantilla no existe.");
    }
    if (current.version !== input.expectedVersion) {
      throw new CardAuthoringError(
        "CONFLICT",
        "La plantilla está desactualizada."
      );
    }
    assertCardTemplateLifecycleTransition(current, action);
    const before = cardAuditSnapshot(current);
    const [updated] = await tx
      .update(cardTemplate)
      .set({
        availability:
          action === "disable"
            ? "disabled"
            : action === "restore"
              ? "active"
              : current.availability,
        disabledAt: action === "disable" ? new Date() : null,
        disabledByUserId: action === "disable" ? actorUserId : null,
        lifecycle: action === "retire" ? "retired" : current.lifecycle,
        updatedByUserId: actorUserId,
        version: current.version + 1,
      })
      .where(
        and(
          eq(cardTemplate.id, templateId),
          eq(cardTemplate.version, current.version)
        )
      )
      .returning();
    if (!updated) {
      throw new CardAuthoringError(
        "CONFLICT",
        "La plantilla cambió mientras se actualizaba."
      );
    }
    await tx.insert(cardTemplateAuditEvent).values({
      action,
      actorUserId,
      after: cardAuditSnapshot(updated),
      before,
      reason,
      templateId,
    });
    return {
      availability: updated.availability,
      lifecycle: updated.lifecycle,
      templateId,
      version: updated.version,
    };
  });
}

export function assertCardTemplateLifecycleTransition(
  current: {
    availability: "active" | "disabled";
    lifecycle: "active" | "draft" | "retired";
  },
  action: "retire" | "disable" | "restore"
) {
  if (action === "retire" && current.lifecycle === "retired") {
    throw new CardAuthoringError(
      "INVALID_TRANSITION",
      "La plantilla ya está retirada."
    );
  }
  if (action === "disable" && current.availability === "disabled") {
    throw new CardAuthoringError(
      "INVALID_TRANSITION",
      "La plantilla ya está deshabilitada."
    );
  }
  if (action === "restore" && current.availability !== "disabled") {
    throw new CardAuthoringError(
      "INVALID_TRANSITION",
      "Solo una plantilla deshabilitada puede restaurarse."
    );
  }
}

export async function correctCardTemplatePresentation(
  db: Database,
  actorUserId: string,
  templateId: string,
  input: {
    description: string;
    effect: CardEffectConfig;
    expectedVersion: number;
    portraitMediaId: string;
    presentation: CardPresentationMetadata;
    reason: string;
  },
  worker?: CardRenderWorker
) {
  const reason = requireReason(input.reason);
  const effect = cardEffectConfigSchema.parse(input.effect);
  const presentation = cardPresentationMetadataSchema.parse(input.presentation);
  const description = z.string().trim().max(2000).parse(input.description);
  const current = await getTemplateForUpdate(db, templateId);
  if (!current) {
    throw new CardAuthoringError("NOT_FOUND", "La plantilla no existe.");
  }
  if (current.version !== input.expectedVersion) {
    throw new CardAuthoringError(
      "CONFLICT",
      "La plantilla está desactualizada."
    );
  }
  if (current.mintedSupply < 1) {
    throw new CardAuthoringError(
      "INVALID_TRANSITION",
      "Usa el borrador mientras la plantilla todavía no tiene instancias."
    );
  }
  const character = await getCardCharacterLabels(db, current.characterId);
  const variants = await renderCardTemplateVariants(
    db,
    {
      characterName: character.characterName,
      effect,
      gameName: character.gameName,
      portraitMediaId: input.portraitMediaId,
      presentation,
      rarity: current.rarity,
      templateId,
    },
    worker
  );
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(cardTemplate)
      .where(eq(cardTemplate.id, templateId))
      .for("update");
    if (!locked || locked.version !== input.expectedVersion) {
      throw new CardAuthoringError(
        "CONFLICT",
        "La plantilla cambió mientras se corregía."
      );
    }
    const before = cardAuditSnapshot(locked);
    const [updated] = await tx
      .update(cardTemplate)
      .set({
        description,
        effectConfig: effect,
        portraitMediaId: input.portraitMediaId,
        presentationMetadata: presentation,
        renderedVariants: variants,
        renderIdentity: variants[0]?.contentHash ?? null,
        updatedByUserId: actorUserId,
        version: locked.version + 1,
      })
      .where(
        and(
          eq(cardTemplate.id, templateId),
          eq(cardTemplate.version, locked.version)
        )
      )
      .returning();
    if (!updated) {
      throw new CardAuthoringError(
        "CONFLICT",
        "La plantilla cambió mientras se corregía."
      );
    }
    await persistRenderVariants(tx, templateId, variants);
    await tx.insert(cardTemplateAuditEvent).values({
      action: "correction",
      actorUserId,
      after: cardAuditSnapshot({ ...updated, renderedVariants: variants }),
      before,
      reason,
      templateId,
    });
    return { templateId, version: updated.version };
  });
}

export function assertCardTemplateMintable(template: {
  availability: "active" | "disabled";
  lifecycle: "draft" | "active" | "retired";
  lifetimeSupplyCeiling: number | null;
  mintedSupply: number;
  renderedVariants: CardRenderedVariant[];
}) {
  if (template.lifecycle !== "active" || template.availability !== "active") {
    throw new CardAuthoringError(
      "INVALID_TRANSITION",
      "La plantilla no está disponible para crear instancias."
    );
  }
  if (
    template.lifetimeSupplyCeiling !== null &&
    template.mintedSupply >= template.lifetimeSupplyCeiling
  ) {
    throw new CardAuthoringError(
      "INVALID_TRANSITION",
      "Se agotó el suministro de la plantilla."
    );
  }
  try {
    assertCompleteCardRenderPlan(template.renderedVariants);
  } catch {
    throw new CardAuthoringError(
      "INVALID_TRANSITION",
      "La plantilla publicada no tiene todas sus variantes renderizadas."
    );
  }
}

export function assertCardTemplateTransferable(template: {
  availability: "active" | "disabled";
}) {
  if (template.availability !== "active") {
    throw new CardAuthoringError(
      "INVALID_TRANSITION",
      "La plantilla está deshabilitada y no permite listar ni transferir instancias."
    );
  }
}

export const assertCardTransferable = assertCardTemplateTransferable;

export async function mintCardInstance(
  db: Database,
  input: {
    binding: "transferable" | "account-bound";
    issuanceSource: string;
    ownerUserId?: string;
    packInstanceId?: string;
    templateId: string;
  }
) {
  if ((input.ownerUserId ? 1 : 0) + (input.packInstanceId ? 1 : 0) !== 1) {
    throw new CardAuthoringError(
      "INVALID_DRAFT",
      "Una instancia debe tener exactamente una ubicación."
    );
  }
  return db.transaction(async (tx) => {
    const [template] = await tx
      .select()
      .from(cardTemplate)
      .where(eq(cardTemplate.id, input.templateId))
      .for("update");
    if (!template) {
      throw new CardAuthoringError("NOT_FOUND", "La plantilla no existe.");
    }
    assertCardTemplateMintable(template);
    const mintNumber = template.mintedSupply + 1;
    const [updatedTemplate] = await tx
      .update(cardTemplate)
      .set({
        firstMintedAt: template.firstMintedAt ?? new Date(),
        mintedSupply: sql`${cardTemplate.mintedSupply} + 1`,
        version: sql`${cardTemplate.version} + 1`,
      })
      .where(
        and(
          eq(cardTemplate.id, input.templateId),
          eq(cardTemplate.version, template.version),
          sql`(${cardTemplate.lifetimeSupplyCeiling} IS NULL OR ${cardTemplate.mintedSupply} < ${cardTemplate.lifetimeSupplyCeiling})`
        )
      )
      .returning();
    if (!updatedTemplate) {
      throw new CardAuthoringError(
        "CONFLICT",
        "El suministro cambió mientras se acuñaba."
      );
    }
    const [instance] = await tx
      .insert(cardInstance)
      .values({
        binding: input.binding,
        issueReference: `manual:${generateId()}`,
        issuanceSource: input.issuanceSource,
        issuedAt: new Date(),
        mintNumber,
        ownerUserId: input.ownerUserId,
        packInstanceId: input.packInstanceId,
        templateId: input.templateId,
      })
      .returning();
    if (!instance) {
      throw new CardAuthoringError(
        "CONFLICT",
        "No se pudo crear la instancia."
      );
    }
    await tx.insert(collectibleOwnershipEvent).values({
      cardInstanceId: instance.id,
      kind: input.packInstanceId ? "issuance" : "grant",
      metadata: input.packInstanceId ? { hidden: true } : {},
      sourceReference: instance.issueReference,
      sourceType: input.issuanceSource,
      toUserId: input.ownerUserId,
    });
    return instance;
  });
}

export function isCardTemplatePubliclyListable(template: {
  availability: "active" | "disabled";
  lifecycle: "draft" | "active" | "retired";
}) {
  return template.availability === "active" && template.lifecycle === "active";
}

export const normalizeCharacterName = normalizeCardCharacterName;
export const normalizeGameName = normalizeCardGameName;
export const publishCard = publishCardTemplate;
export const retireCardTemplate = (
  db: Database,
  actorUserId: string,
  templateId: string,
  input: { expectedVersion: number; reason: string }
) => changeCardTemplateLifecycle(db, actorUserId, templateId, "retire", input);
export const disableCardTemplate = (
  db: Database,
  actorUserId: string,
  templateId: string,
  input: { expectedVersion: number; reason: string }
) => changeCardTemplateLifecycle(db, actorUserId, templateId, "disable", input);
export const restoreCardTemplate = (
  db: Database,
  actorUserId: string,
  templateId: string,
  input: { expectedVersion: number; reason: string }
) => changeCardTemplateLifecycle(db, actorUserId, templateId, "restore", input);
