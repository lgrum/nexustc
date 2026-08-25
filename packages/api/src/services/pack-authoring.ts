/* oxlint-disable eslint/require-await -- Pack authoring commands keep validation failures on their Promise boundary. */
import { and, asc, desc, eq, inArray } from "@repo/db";
import type { db as database } from "@repo/db";
import {
  cardTemplate,
  collectibleGrantCampaign,
  media,
  packDrawGroup,
  packDrawGroupCardWeight,
  packDrawGroupRarityWeight,
  packRevision,
  packTemplate,
  officialCardShopOffer,
  gachaponMachine,
  gachaponMachinePackEntry,
} from "@repo/db/schema/app";
import { generateId } from "@repo/db/utils";
import {
  hashPackConfiguration,
  inspectPackProbabilities,
  normalizePackRevisionDraft,
  packRevisionDraftSchema,
  packTemplateDraftSchema,
  PackValidationError,
  simulatePackRevision,
  validatePackRevision,
} from "@repo/shared/collectibles";
import type {
  NormalizedPackRevisionDraft,
  PackCandidate,
  PackDrawGroup,
  PackTemplateDraft,
  PackValidationIssue,
} from "@repo/shared/collectibles";
import type z from "zod";

import type { DeferredMediaSelectionInput } from "../utils/deferred-media";
import { withDeferredMediaSelection } from "../utils/deferred-media";
import { getManagedMediaAssetFromRecord } from "../utils/managed-media";
import { appendCollectibleAdminAction } from "./collectible-admin-action";

type Database = typeof database;
type PackAuthoringTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

export class PackAuthoringError extends Error {
  readonly code:
    | "CONFLICT"
    | "INVALID_DRAFT"
    | "INVALID_MEDIA"
    | "NOT_FOUND"
    | "INVALID_TRANSITION"
    | "IMMUTABLE"
    | "IMPOSSIBLE_GUARANTEE";
  readonly fieldErrors: Record<string, string>;
  readonly issues: PackValidationIssue[];

  constructor(
    code: PackAuthoringError["code"],
    message: string,
    fieldErrors: Record<string, string> = {},
    issues: PackValidationIssue[] = []
  ) {
    super(message);
    this.name = "PackAuthoringError";
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.issues = issues;
  }
}

export const packTemplateInputSchema = packTemplateDraftSchema;
export const packTemplateDeferredDraftInputSchema =
  packTemplateDraftSchema.omit({ assetMediaId: true });
export const packRevisionInputSchema = packRevisionDraftSchema;

export function assertStaticPackAssetUpload(input: { isAnimated: boolean }) {
  if (input.isAnimated) {
    throw new PackAuthoringError(
      "INVALID_MEDIA",
      "La imagen del pack debe ser estática.",
      { assetSelection: "Las imágenes animadas no están permitidas." }
    );
  }
}

function parseInput<T>(schema: z.ZodType<T>, input: unknown, label: string): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new PackAuthoringError(
      "INVALID_DRAFT",
      `El ${label} no es válido.`,
      Object.fromEntries(
        parsed.error.issues.map((issue) => [
          issue.path.join(".") || "form",
          issue.message,
        ])
      ),
      parsed.error.issues.map((issue) => ({
        message: issue.message,
        path: issue.path.filter(
          (part): part is string | number =>
            typeof part === "string" || typeof part === "number"
        ),
      }))
    );
  }
  return parsed.data;
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

async function requireManagedPackAsset(
  tx: Pick<Database, "query">,
  mediaId: string
) {
  const asset = await tx.query.media.findFirst({
    columns: { id: true, isAnimated: true, objectKey: true },
    where: eq(media.id, mediaId),
  });
  if (!asset || !mediaIsValid(asset)) {
    throw new PackAuthoringError(
      "INVALID_MEDIA",
      "El pack necesita una imagen 2D estática de la biblioteca administrada.",
      { assetMediaId: "Elige una imagen administrada y estática." }
    );
  }
  return asset;
}

function insertDrawGroups(
  tx: Pick<Database, "insert">,
  revisionId: string,
  draft: NormalizedPackRevisionDraft
) {
  return (async () => {
    for (const group of draft.drawGroups) {
      const groupId = generateId();
      await tx.insert(packDrawGroup).values({
        drawCount: group.drawCount,
        guarantees: group.guarantees,
        id: groupId,
        order: group.order,
        revisionId,
      });
      if (group.rarityWeights.length > 0) {
        await tx.insert(packDrawGroupRarityWeight).values(
          group.rarityWeights.map((entry) => ({
            drawGroupId: groupId,
            rarity: entry.rarity,
            weight: entry.weight,
          }))
        );
      }
      if (group.cardWeights.length > 0) {
        await tx.insert(packDrawGroupCardWeight).values(
          group.cardWeights.map((entry) => ({
            cardTemplateId: entry.cardTemplateId,
            drawGroupId: groupId,
            rarity: entry.rarity,
            weight: entry.weight,
          }))
        );
      }
    }
  })();
}

async function deleteDraftChildren(
  tx: Pick<Database, "delete" | "select">,
  revisionId: string
) {
  const groups = await tx
    .select({ id: packDrawGroup.id })
    .from(packDrawGroup)
    .where(eq(packDrawGroup.revisionId, revisionId));
  const groupIds = groups.map(({ id }) => id);
  if (groupIds.length > 0) {
    await tx
      .delete(packDrawGroupCardWeight)
      .where(inArray(packDrawGroupCardWeight.drawGroupId, groupIds));
    await tx
      .delete(packDrawGroupRarityWeight)
      .where(inArray(packDrawGroupRarityWeight.drawGroupId, groupIds));
  }
  await tx
    .delete(packDrawGroup)
    .where(eq(packDrawGroup.revisionId, revisionId));
}

async function loadRevisionConfiguration(
  db: Pick<Database, "select">,
  revisionId: string
) {
  const [revision] = await db
    .select()
    .from(packRevision)
    .where(eq(packRevision.id, revisionId))
    .limit(1);
  if (!revision) {
    return null;
  }
  const groups = await db
    .select()
    .from(packDrawGroup)
    .where(eq(packDrawGroup.revisionId, revisionId))
    .orderBy(asc(packDrawGroup.order));
  const result: PackDrawGroup[] = [];
  for (const group of groups) {
    const [rarityWeights, cardWeights] = await Promise.all([
      db
        .select()
        .from(packDrawGroupRarityWeight)
        .where(eq(packDrawGroupRarityWeight.drawGroupId, group.id))
        .orderBy(asc(packDrawGroupRarityWeight.rarity)),
      db
        .select()
        .from(packDrawGroupCardWeight)
        .where(eq(packDrawGroupCardWeight.drawGroupId, group.id))
        .orderBy(asc(packDrawGroupCardWeight.cardTemplateId)),
    ]);
    result.push({
      cardWeights: cardWeights.map(({ cardTemplateId, rarity, weight }) => ({
        cardTemplateId,
        rarity,
        weight,
      })),
      drawCount: group.drawCount,
      guarantees: group.guarantees,
      order: group.order,
      rarityWeights: rarityWeights.map(({ rarity, weight }) => ({
        rarity,
        weight,
      })),
    });
  }
  return {
    bindingPolicy: revision.bindingPolicy,
    cardCount: revision.cardCount,
    duplicatePolicy: revision.duplicatePolicy,
    drawGroups: result,
    id: revision.id,
    templateId: revision.templateId,
  } satisfies NormalizedPackRevisionDraft;
}

async function loadEligibleCandidates(
  db: Pick<Database, "select">,
  configuration: NormalizedPackRevisionDraft
): Promise<PackCandidate[]> {
  const rows = await db
    .select({
      availability: cardTemplate.availability,
      id: cardTemplate.id,
      lifecycle: cardTemplate.lifecycle,
      rarity: cardTemplate.rarity,
    })
    .from(cardTemplate);
  const referencedIds = new Set(
    configuration.drawGroups.flatMap((group) =>
      group.cardWeights.map(({ cardTemplateId }) => cardTemplateId)
    )
  );
  const result = rows.map((row) => ({
    available: row.lifecycle === "active" && row.availability === "active",
    cardTemplateId: row.id,
    rarity: row.rarity,
    // Keep this field populated for deterministic simulations that use the
    // fallback rarity pool. Authoritative per-card weights still come from
    // the normalized revision rows.
    weight: referencedIds.has(row.id) ? undefined : 1,
  }));
  const knownIds = new Set(rows.map(({ id }) => id));
  for (const group of configuration.drawGroups) {
    for (const entry of group.cardWeights) {
      if (!knownIds.has(entry.cardTemplateId)) {
        result.push({
          available: false,
          cardTemplateId: entry.cardTemplateId,
          rarity: entry.rarity,
          weight: entry.weight,
        });
      }
    }
  }
  return result;
}

function configuredPackPoolTemplateIds(
  configuration: NormalizedPackRevisionDraft,
  candidates: readonly PackCandidate[]
) {
  const ids = new Set<string>();
  for (const group of configuration.drawGroups) {
    for (const rarity of group.rarityWeights.map((weight) => weight.rarity)) {
      const explicit = group.cardWeights.filter(
        (entry) => entry.rarity === rarity
      );
      if (explicit.length > 0) {
        for (const entry of explicit) {
          ids.add(entry.cardTemplateId);
        }
        continue;
      }
      for (const candidate of candidates) {
        if (candidate.rarity === rarity) {
          ids.add(candidate.cardTemplateId);
        }
      }
    }
  }
  return ids;
}

function unavailablePackPoolTemplateIds(
  configuration: NormalizedPackRevisionDraft,
  candidates: readonly PackCandidate[]
) {
  const poolIds = configuredPackPoolTemplateIds(configuration, candidates);
  return candidates
    .filter(
      ({ available, cardTemplateId }) =>
        available === false && poolIds.has(cardTemplateId)
    )
    .map(({ cardTemplateId }) => cardTemplateId);
}

function invalidValidation(result: {
  issues: PackValidationIssue[];
  valid: false;
}) {
  const impossible = result.issues.some((issue) =>
    issue.message.toLocaleLowerCase("es").includes("garant")
  );
  return new PackAuthoringError(
    impossible ? "IMPOSSIBLE_GUARANTEE" : "INVALID_DRAFT",
    impossible
      ? "La configuración contiene una garantía imposible."
      : "La configuración del pack no es válida.",
    Object.fromEntries(
      result.issues.map((issue) => [
        issue.path.join(".") || "form",
        issue.message,
      ])
    ),
    result.issues
  );
}

export async function createPackTemplate(
  db: Database,
  actorUserId: string,
  input: unknown
) {
  const draft = parseInput(packTemplateDraftSchema, input, "pack");
  await requireManagedPackAsset(db, draft.assetMediaId);
  const [created] = await db
    .insert(packTemplate)
    .values({
      assetMediaId: draft.assetMediaId,
      createdByUserId: actorUserId,
      description: draft.description,
      id: draft.id ?? generateId(),
      name: draft.name,
      updatedAt: new Date(),
      updatedByUserId: actorUserId,
    })
    .returning();
  if (!created) {
    throw new PackAuthoringError(
      "CONFLICT",
      "No se pudo crear el Pack Template."
    );
  }
  return created;
}

async function savePackTemplateDraftInTransaction(
  tx: PackAuthoringTransaction,
  actorUserId: string,
  draft: PackTemplateDraft,
  templateId: string,
  expectedVersion?: number
) {
  await requireManagedPackAsset(tx, draft.assetMediaId);
  const [current] = draft.id
    ? await tx
        .select()
        .from(packTemplate)
        .where(eq(packTemplate.id, draft.id))
        .for("update")
    : [];
  if (draft.id && !current) {
    throw new PackAuthoringError("NOT_FOUND", "El pack no existe.");
  }
  if (!current) {
    const [created] = await tx
      .insert(packTemplate)
      .values({
        assetMediaId: draft.assetMediaId,
        createdByUserId: actorUserId,
        description: draft.description,
        id: templateId,
        name: draft.name,
        updatedAt: new Date(),
        updatedByUserId: actorUserId,
      })
      .returning();
    if (!created) {
      throw new PackAuthoringError(
        "CONFLICT",
        "No se pudo crear el Pack Template."
      );
    }
    return created;
  }
  if (expectedVersion === undefined || current.version !== expectedVersion) {
    throw new PackAuthoringError(
      "CONFLICT",
      "El pack cambió mientras lo editabas. Recarga antes de guardar."
    );
  }
  if (current.lifecycle === "retired") {
    throw new PackAuthoringError(
      "INVALID_TRANSITION",
      "Un Pack Template retirado no se puede editar."
    );
  }
  const [updated] = await tx
    .update(packTemplate)
    .set({
      assetMediaId: draft.assetMediaId,
      description: draft.description,
      name: draft.name,
      updatedAt: new Date(),
      updatedByUserId: actorUserId,
      version: current.version + 1,
    })
    .where(
      and(
        eq(packTemplate.id, current.id),
        eq(packTemplate.version, current.version)
      )
    )
    .returning();
  if (!updated) {
    throw new PackAuthoringError(
      "CONFLICT",
      "El pack cambió mientras guardabas."
    );
  }
  return updated;
}

export async function savePackTemplateDraftWithAsset(
  db: Database,
  actorUserId: string,
  input: unknown,
  assetSelection: DeferredMediaSelectionInput,
  expectedVersion?: number
) {
  const draft = parseInput(packTemplateDeferredDraftInputSchema, input, "pack");
  const templateId = draft.id ?? generateId();

  return await withDeferredMediaSelection({
    db,
    onComplete: async ({ orderedMedia, tx }) => {
      const [asset] = orderedMedia;
      if (!asset) {
        throw new PackAuthoringError(
          "INVALID_MEDIA",
          "Selecciona una imagen para el pack.",
          { assetSelection: "La imagen del pack es obligatoria." }
        );
      }
      return await savePackTemplateDraftInTransaction(
        tx,
        actorUserId,
        { ...draft, assetMediaId: asset.id },
        templateId,
        expectedVersion
      );
    },
    ownerKind: "Pack",
    resourceName: templateId,
    selection: assetSelection,
    validatePendingFile: assertStaticPackAssetUpload,
  });
}

export async function savePackTemplateDraft(
  db: Database,
  actorUserId: string,
  input: unknown,
  expectedVersion?: number
) {
  const draft = parseInput(packTemplateDraftSchema, input, "pack");
  await requireManagedPackAsset(db, draft.assetMediaId);
  if (!draft.id) {
    return createPackTemplate(db, actorUserId, draft);
  }
  const draftId = draft.id;
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(packTemplate)
      .where(eq(packTemplate.id, draftId))
      .for("update");
    if (!current) {
      throw new PackAuthoringError("NOT_FOUND", "El pack no existe.");
    }
    if (expectedVersion === undefined || current.version !== expectedVersion) {
      throw new PackAuthoringError(
        "CONFLICT",
        "El pack cambió mientras lo editabas. Recarga antes de guardar."
      );
    }
    if (current.lifecycle === "retired") {
      throw new PackAuthoringError(
        "INVALID_TRANSITION",
        "Un Pack Template retirado no se puede editar."
      );
    }
    const [updated] = await tx
      .update(packTemplate)
      .set({
        assetMediaId: draft.assetMediaId,
        description: draft.description,
        name: draft.name,
        updatedAt: new Date(),
        updatedByUserId: actorUserId,
        version: current.version + 1,
      })
      .where(
        and(
          eq(packTemplate.id, current.id),
          eq(packTemplate.version, current.version)
        )
      )
      .returning();
    if (!updated) {
      throw new PackAuthoringError(
        "CONFLICT",
        "El pack cambió mientras guardabas."
      );
    }
    return updated;
  });
}

export async function savePackRevisionDraft(
  db: Database,
  actorUserId: string,
  templateId: string,
  input: unknown,
  expectedVersion?: number
) {
  const parsed = parseInput(packRevisionDraftSchema, input, "la revisión");
  const normalized = normalizePackRevisionDraft({
    ...parsed,
    templateId,
  });
  const validation = validatePackRevision(normalized);
  if (!validation.valid) {
    throw invalidValidation(validation);
  }
  return db.transaction(async (tx) => {
    const [template] = await tx
      .select({ id: packTemplate.id, lifecycle: packTemplate.lifecycle })
      .from(packTemplate)
      .where(eq(packTemplate.id, templateId))
      .for("update");
    if (!template) {
      throw new PackAuthoringError("NOT_FOUND", "El Pack Template no existe.");
    }
    if (template.lifecycle === "retired") {
      throw new PackAuthoringError(
        "INVALID_TRANSITION",
        "Un pack retirado no se puede editar."
      );
    }

    const [current] = parsed.id
      ? await tx
          .select()
          .from(packRevision)
          .where(
            and(
              eq(packRevision.id, parsed.id),
              eq(packRevision.templateId, templateId)
            )
          )
          .for("update")
      : [];
    if (current && current.lifecycle !== "draft") {
      throw new PackAuthoringError(
        "IMMUTABLE",
        "Las revisiones publicadas son inmutables."
      );
    }
    if (
      current &&
      (expectedVersion === undefined || current.version !== expectedVersion)
    ) {
      throw new PackAuthoringError(
        "CONFLICT",
        "La revisión está desactualizada."
      );
    }
    const revisionId = current?.id ?? parsed.id ?? generateId();
    let revision;
    if (current) {
      [revision] = await tx
        .update(packRevision)
        .set({
          bindingPolicy: normalized.bindingPolicy,
          cardCount: normalized.cardCount,
          duplicatePolicy: normalized.duplicatePolicy,
          updatedAt: new Date(),
          updatedByUserId: actorUserId,
          version: current.version + 1,
        })
        .where(
          and(
            eq(packRevision.id, current.id),
            eq(packRevision.version, current.version)
          )
        )
        .returning();
      await deleteDraftChildren(tx, revisionId);
    } else {
      [revision] = await tx
        .insert(packRevision)
        .values({
          bindingPolicy: normalized.bindingPolicy,
          cardCount: normalized.cardCount,
          createdByUserId: actorUserId,
          duplicatePolicy: normalized.duplicatePolicy,
          id: revisionId,
          templateId,
          updatedAt: new Date(),
          updatedByUserId: actorUserId,
        })
        .returning();
    }
    if (!revision) {
      throw new PackAuthoringError(
        "CONFLICT",
        "No se pudo guardar la revisión."
      );
    }
    await insertDrawGroups(tx, revisionId, normalized);
    return revision;
  });
}

export async function getPackRevisionDraft(
  db: Pick<Database, "select">,
  revisionId: string
) {
  return loadRevisionConfiguration(db, revisionId);
}

export async function validatePackRevisionDraft(
  db: Pick<Database, "select">,
  revisionId: string
) {
  const configuration = await loadRevisionConfiguration(db, revisionId);
  if (!configuration) {
    throw new PackAuthoringError("NOT_FOUND", "La revisión no existe.");
  }
  const candidates = await loadEligibleCandidates(db, configuration);
  const validation = validatePackRevision(configuration, { candidates });
  if (!validation.valid) {
    throw invalidValidation(validation);
  }
  return {
    candidates,
    configuration: validation.normalized,
    valid: true as const,
  };
}

export async function simulatePackRevisionDraft(
  db: Pick<Database, "select">,
  revisionId: string,
  options: {
    iterations?: number;
    random?: () => number;
  } = {}
) {
  const checked = await validatePackRevisionDraft(db, revisionId);
  return simulatePackRevision(checked.configuration, {
    candidates: checked.candidates,
    iterations: options.iterations,
    random: options.random,
  });
}

/**
 * Returns the configured rarity percentages for authorized internal review.
 * This deliberately reads the immutable contract rather than a simulated
 * outcome, and the public pack catalog never calls this helper.
 */
export async function inspectPackRevisionProbabilities(
  db: Pick<Database, "select">,
  revisionId: string
) {
  const configuration = await loadRevisionConfiguration(db, revisionId);
  if (!configuration) {
    throw new PackAuthoringError("NOT_FOUND", "La revisión no existe.");
  }
  try {
    return inspectPackProbabilities(configuration);
  } catch (error) {
    if (error instanceof PackValidationError) {
      throw invalidValidation({ issues: error.issues, valid: false });
    }
    throw error;
  }
}

export type PackPublicationShopOfferSummary = {
  enabled: boolean;
  id: string;
  packTemplateId: string;
  price: string;
  version: number;
  warning: string;
};

export type PackPublicationMachineSummary = {
  binding: string;
  cost: string;
  id: string;
  name: string;
  packTemplateId: string;
  state: string;
  version: number;
  warning: string;
};

export type PackPublicationGrantCampaignSummary = {
  endsAt: Date | null;
  id: string;
  packTemplateId: string | null;
  quantityCeiling: number | null;
  quantityIssued: number;
  startsAt: Date | null;
  state: string;
  version: number;
  warning: string;
};

export type PackPublicationImpact = {
  activeGachaponMachines: PackPublicationMachineSummary[];
  activeGrantCampaigns: PackPublicationGrantCampaignSummary[];
  activeShopOffers: PackPublicationShopOfferSummary[];
  cardPoolChanges: {
    addedCardTemplateIds: string[];
    removedCardTemplateIds: string[];
  };
  guaranteeChanges: {
    changed: boolean;
    from: unknown[];
    to: unknown[];
  };
  unavailableTemplateIds: string[];
  // Stable aliases make the preview self-describing for later acquisition
  // channels without changing the original fields. Audited grant campaigns
  // are the only promotion-style channel in the ecosystem today.
  gachaponMachines: PackPublicationMachineSummary[];
  grantCampaigns: PackPublicationGrantCampaignSummary[];
  shopOffers: PackPublicationShopOfferSummary[];
  affectedGachaponMachines: PackPublicationMachineSummary[];
  affectedGrantCampaigns: PackPublicationGrantCampaignSummary[];
  affectedShopOffers: PackPublicationShopOfferSummary[];
  poolChanges: {
    addedCardTemplateIds: string[];
    removedCardTemplateIds: string[];
  };
};

export type PackPublicationImpactSources = {
  gachaponMachines?: readonly PackPublicationMachineSummary[];
  grantCampaigns?: readonly PackPublicationGrantCampaignSummary[];
  shopOffers?: readonly PackPublicationShopOfferSummary[];
};

type PackPublicationImpactCandidateSets = {
  next?: readonly PackCandidate[];
  previous?: readonly PackCandidate[];
};

export function buildPackPublicationImpact(
  previous: NormalizedPackRevisionDraft | null,
  next: NormalizedPackRevisionDraft,
  unavailableTemplateIds: readonly string[] = [],
  sources: PackPublicationImpactSources = {},
  candidateSets: PackPublicationImpactCandidateSets = {}
): PackPublicationImpact {
  const cardIds = (
    configuration: NormalizedPackRevisionDraft | null,
    candidates: readonly PackCandidate[] | undefined
  ) =>
    configuration
      ? candidates
        ? configuredPackPoolTemplateIds(configuration, candidates)
        : new Set(
            configuration.drawGroups.flatMap((group) =>
              group.cardWeights.map(({ cardTemplateId }) => cardTemplateId)
            )
          )
      : new Set<string>();
  const previousCards = cardIds(previous, candidateSets.previous);
  const nextCards = cardIds(next, candidateSets.next);
  const previousGuarantees =
    previous?.drawGroups.flatMap((group) => group.guarantees) ?? [];
  const nextGuarantees = next.drawGroups.flatMap((group) => group.guarantees);
  const activeShopOffers = [...(sources.shopOffers ?? [])];
  const activeGachaponMachines = [...(sources.gachaponMachines ?? [])];
  const activeGrantCampaigns = [...(sources.grantCampaigns ?? [])];
  return {
    activeGachaponMachines,
    activeGrantCampaigns,
    activeShopOffers,
    cardPoolChanges: {
      addedCardTemplateIds: [...nextCards].filter(
        (id) => !previousCards.has(id)
      ),
      removedCardTemplateIds: [...previousCards].filter(
        (id) => !nextCards.has(id)
      ),
    },
    guaranteeChanges: {
      changed:
        JSON.stringify(previousGuarantees) !== JSON.stringify(nextGuarantees),
      from: previousGuarantees,
      to: nextGuarantees,
    },
    unavailableTemplateIds: [...new Set(unavailableTemplateIds)],
    gachaponMachines: activeGachaponMachines,
    grantCampaigns: activeGrantCampaigns,
    shopOffers: activeShopOffers,
    affectedGachaponMachines: activeGachaponMachines,
    affectedGrantCampaigns: activeGrantCampaigns,
    affectedShopOffers: activeShopOffers,
    poolChanges: {
      addedCardTemplateIds: [...nextCards].filter(
        (id) => !previousCards.has(id)
      ),
      removedCardTemplateIds: [...previousCards].filter(
        (id) => !nextCards.has(id)
      ),
    },
  };
}

export async function previewPackRevisionPublicationImpact(
  db: Pick<Database, "select">,
  templateId: string,
  revisionId: string
) {
  const [template] = await db
    .select({
      latestPublishedRevisionId: packTemplate.latestPublishedRevisionId,
    })
    .from(packTemplate)
    .where(eq(packTemplate.id, templateId))
    .limit(1);
  if (!template) {
    throw new PackAuthoringError("NOT_FOUND", "El Pack Template no existe.");
  }
  const next = await loadRevisionConfiguration(db, revisionId);
  if (!next || next.templateId !== templateId) {
    throw new PackAuthoringError("NOT_FOUND", "La revisión no existe.");
  }
  const previous = template.latestPublishedRevisionId
    ? await loadRevisionConfiguration(db, template.latestPublishedRevisionId)
    : null;
  const previousCandidates = previous
    ? await loadEligibleCandidates(db, previous)
    : undefined;
  const candidates = await loadEligibleCandidates(db, next);
  const unavailable = unavailablePackPoolTemplateIds(next, candidates);
  const shopOffers = await listPackTemplateShopOffers(db, templateId);
  const gachaponMachines = await listPackTemplateGachaponMachines(
    db,
    templateId
  );
  const grantCampaigns = await listPackTemplateGrantCampaigns(db, templateId);
  return buildPackPublicationImpact(
    previous,
    next,
    unavailable,
    { gachaponMachines, grantCampaigns, shopOffers },
    {
      next: candidates,
      previous: previousCandidates,
    }
  );
}

async function listPackTemplateShopOffers(
  db: Pick<Database, "select">,
  templateId: string
) {
  const rows = await db
    .select({
      enabled: officialCardShopOffer.enabled,
      id: officialCardShopOffer.id,
      packTemplateId: officialCardShopOffer.packTemplateId,
      price: officialCardShopOffer.price,
      version: officialCardShopOffer.version,
    })
    .from(officialCardShopOffer)
    .where(
      and(
        eq(officialCardShopOffer.enabled, true),
        eq(officialCardShopOffer.packTemplateId, templateId)
      )
    );
  return rows.map((offer) => ({
    ...offer,
    price: offer.price.toString(),
    warning:
      "Publicar esta Pack Revision cambiará la revisión usada por las compras futuras de esta oferta.",
  }));
}

async function listPackTemplateGachaponMachines(
  db: Pick<Database, "select">,
  templateId: string
) {
  const rows = await db
    .select({
      binding: gachaponMachine.binding,
      cost: gachaponMachine.cost,
      id: gachaponMachine.id,
      name: gachaponMachine.name,
      packTemplateId: gachaponMachinePackEntry.packTemplateId,
      state: gachaponMachine.state,
      version: gachaponMachine.version,
    })
    .from(gachaponMachinePackEntry)
    .innerJoin(
      gachaponMachine,
      eq(gachaponMachine.id, gachaponMachinePackEntry.machineId)
    )
    .where(
      and(
        eq(gachaponMachinePackEntry.packTemplateId, templateId),
        inArray(gachaponMachine.state, ["active", "paused"])
      )
    )
    .orderBy(asc(gachaponMachine.name), asc(gachaponMachine.id));
  return rows.map((machine) => ({
    ...machine,
    cost: machine.cost.toString(),
    warning:
      "Publicar esta Pack Revision cambiará la revisión usada por las activaciones futuras de esta máquina.",
  }));
}

export async function listPackTemplateGrantCampaigns(
  db: Pick<Database, "select">,
  templateId: string
) {
  const rows = await db
    .select({
      endsAt: collectibleGrantCampaign.endsAt,
      id: collectibleGrantCampaign.id,
      packTemplateId: collectibleGrantCampaign.packTemplateId,
      quantityCeiling: collectibleGrantCampaign.quantityCeiling,
      quantityIssued: collectibleGrantCampaign.quantityIssued,
      startsAt: collectibleGrantCampaign.startsAt,
      state: collectibleGrantCampaign.state,
      version: collectibleGrantCampaign.version,
    })
    .from(collectibleGrantCampaign)
    .where(
      and(
        eq(collectibleGrantCampaign.packTemplateId, templateId),
        eq(collectibleGrantCampaign.state, "active")
      )
    )
    .orderBy(
      asc(collectibleGrantCampaign.startsAt),
      asc(collectibleGrantCampaign.id)
    );
  return rows.map((campaign) => ({
    ...campaign,
    warning:
      "Publicar esta Pack Revision cambiará la revisión usada por las concesiones futuras de esta campaña.",
  }));
}

export async function publishPackRevision(
  db: Database,
  actorUserId: string,
  templateId: string,
  input: {
    confirm?: boolean;
    confirmation?: boolean;
    expectedRevisionVersion?: number;
    expectedTemplateVersion?: number;
    expectedVersion?: number;
    reason?: string;
    revisionId: string;
  }
) {
  if (input.confirm !== true && input.confirmation !== true) {
    throw new PackAuthoringError(
      "INVALID_TRANSITION",
      "Confirma explícitamente la publicación de esta revisión."
    );
  }
  return db.transaction(async (tx) => {
    const expectedTemplateVersion =
      input.expectedTemplateVersion ?? input.expectedVersion;
    const expectedRevisionVersion =
      input.expectedRevisionVersion ?? input.expectedVersion;
    const [template] = await tx
      .select()
      .from(packTemplate)
      .where(eq(packTemplate.id, templateId))
      .for("update");
    const [revision] = await tx
      .select()
      .from(packRevision)
      .where(
        and(
          eq(packRevision.id, input.revisionId),
          eq(packRevision.templateId, templateId)
        )
      )
      .for("update");
    if (!template) {
      throw new PackAuthoringError("NOT_FOUND", "El Pack Template no existe.");
    }
    if (template.lifecycle === "retired") {
      throw new PackAuthoringError(
        "INVALID_TRANSITION",
        "Un pack retirado no se puede publicar."
      );
    }
    if (!revision) {
      throw new PackAuthoringError("NOT_FOUND", "La revisión no existe.");
    }
    if (
      expectedTemplateVersion === undefined ||
      expectedRevisionVersion === undefined ||
      template.version !== expectedTemplateVersion ||
      revision.version !== expectedRevisionVersion
    ) {
      throw new PackAuthoringError(
        "CONFLICT",
        "El pack cambió mientras confirmabas la publicación."
      );
    }
    if (revision.lifecycle !== "draft") {
      throw new PackAuthoringError(
        "IMMUTABLE",
        "Las revisiones publicadas son inmutables."
      );
    }
    await requireManagedPackAsset(tx, template.assetMediaId);
    const configuration = await loadRevisionConfiguration(tx, revision.id);
    if (!configuration) {
      throw new PackAuthoringError("NOT_FOUND", "La revisión no existe.");
    }
    const candidates = await loadEligibleCandidates(tx, configuration);
    const validation = validatePackRevision(configuration, { candidates });
    if (!validation.valid) {
      throw invalidValidation(validation);
    }
    const { normalized } = validation;
    const previous = template.latestPublishedRevisionId
      ? await loadRevisionConfiguration(tx, template.latestPublishedRevisionId)
      : null;
    const previousCandidates = previous
      ? await loadEligibleCandidates(tx, previous)
      : undefined;
    const [latest] = await tx
      .select({ revision: packRevision.revision })
      .from(packRevision)
      .where(
        and(
          eq(packRevision.templateId, templateId),
          eq(packRevision.lifecycle, "published")
        )
      )
      .orderBy(desc(packRevision.revision))
      .limit(1);
    const nextRevision = (latest?.revision ?? 0) + 1;
    const configurationHash = hashPackConfiguration(normalized);
    const publishedAt = new Date();
    const [published] = await tx
      .update(packRevision)
      .set({
        availability: "active",
        configurationHash,
        lifecycle: "published",
        publishedAt,
        publishedByUserId: actorUserId,
        revision: nextRevision,
        updatedAt: publishedAt,
        updatedByUserId: actorUserId,
        version: revision.version + 1,
      })
      .where(
        and(
          eq(packRevision.id, revision.id),
          eq(packRevision.version, revision.version)
        )
      )
      .returning();
    if (!published) {
      throw new PackAuthoringError(
        "CONFLICT",
        "La revisión cambió mientras se publicaba."
      );
    }
    const [updatedTemplate] = await tx
      .update(packTemplate)
      .set({
        latestPublishedRevisionId: revision.id,
        lifecycle: "active",
        updatedAt: publishedAt,
        updatedByUserId: actorUserId,
        version: template.version + 1,
      })
      .where(
        and(
          eq(packTemplate.id, template.id),
          eq(packTemplate.version, template.version)
        )
      )
      .returning({ version: packTemplate.version });
    if (!updatedTemplate) {
      throw new PackAuthoringError(
        "CONFLICT",
        "El pack cambió mientras se publicaba."
      );
    }
    await appendCollectibleAdminAction(tx, {
      action: "publish-impact",
      actorUserId,
      after: {
        availability: published.availability,
        configurationHash,
        revision: nextRevision,
        templateLifecycle: "active",
        version: published.version,
      },
      before: {
        availability: revision.availability,
        latestPublishedRevisionId: template.latestPublishedRevisionId,
        lifecycle: revision.lifecycle,
        version: revision.version,
      },
      idempotencyKey: `pack-publish:${revision.id}:${revision.version}`,
      reason: input.reason?.trim() || "Publicación de la revisión del pack.",
      targetId: revision.id,
      targetKind: "pack-revision",
      version: published.version,
    });
    const shopOffers = await listPackTemplateShopOffers(tx, templateId);
    const gachaponMachines = await listPackTemplateGachaponMachines(
      tx,
      templateId
    );
    const grantCampaigns = await listPackTemplateGrantCampaigns(tx, templateId);
    return {
      configurationHash,
      impact: buildPackPublicationImpact(
        previous,
        normalized,
        unavailablePackPoolTemplateIds(normalized, candidates),
        { gachaponMachines, grantCampaigns, shopOffers },
        { next: candidates, previous: previousCandidates }
      ),
      publishedAt,
      revision: nextRevision,
      revisionId: revision.id,
      templateId,
      templateVersion: updatedTemplate.version,
      version: published.version,
    };
  });
}

export async function retirePackTemplate(
  db: Database,
  actorUserId: string,
  templateId: string,
  input: { expectedVersion: number; reason: string }
) {
  if (input.reason.trim().length < 3) {
    throw new PackAuthoringError(
      "INVALID_DRAFT",
      "Indica un motivo para retirar el pack."
    );
  }
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(packTemplate)
      .where(eq(packTemplate.id, templateId))
      .for("update");
    if (!current) {
      throw new PackAuthoringError("NOT_FOUND", "El Pack Template no existe.");
    }
    if (current.version !== input.expectedVersion) {
      throw new PackAuthoringError("CONFLICT", "El pack está desactualizado.");
    }
    if (current.lifecycle === "retired") {
      throw new PackAuthoringError(
        "INVALID_TRANSITION",
        "El pack ya está retirado."
      );
    }
    const [updated] = await tx
      .update(packTemplate)
      .set({
        lifecycle: "retired",
        retiredAt: new Date(),
        retiredByUserId: actorUserId,
        updatedAt: new Date(),
        updatedByUserId: actorUserId,
        version: current.version + 1,
      })
      .where(
        and(
          eq(packTemplate.id, templateId),
          eq(packTemplate.version, current.version)
        )
      )
      .returning();
    if (!updated) {
      throw new PackAuthoringError(
        "CONFLICT",
        "El pack cambió mientras se retiraba."
      );
    }
    await appendCollectibleAdminAction(tx, {
      action: "retire",
      actorUserId,
      after: {
        latestPublishedRevisionId: updated.latestPublishedRevisionId,
        lifecycle: updated.lifecycle,
        version: updated.version,
      },
      before: {
        latestPublishedRevisionId: current.latestPublishedRevisionId,
        lifecycle: current.lifecycle,
        version: current.version,
      },
      expectedVersion: input.expectedVersion,
      idempotencyKey: `pack-retire:${templateId}:${current.version}`,
      reason: input.reason.trim(),
      targetId: templateId,
      targetKind: "pack-template",
      version: updated.version,
    });
    return updated;
  });
}

export async function listPackTemplates(db: Pick<Database, "select">) {
  return db.select().from(packTemplate).orderBy(desc(packTemplate.updatedAt));
}

export async function listPackRevisions(
  db: Pick<Database, "select">,
  templateId: string
) {
  return db
    .select()
    .from(packRevision)
    .where(eq(packRevision.templateId, templateId))
    .orderBy(desc(packRevision.createdAt));
}

export const createPack = createPackTemplate;
export const savePackDraft = savePackTemplateDraft;
export const savePackRevision = savePackRevisionDraft;
export const publishPack = publishPackRevision;
export const previewPackImpact = previewPackRevisionPublicationImpact;
export const inspectPackProbabilitiesDraft = inspectPackRevisionProbabilities;
