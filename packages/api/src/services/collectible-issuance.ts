import { createHash, randomInt } from "node:crypto";

import { and, asc, eq, inArray, or, sql } from "@repo/db";
import type { db as database } from "@repo/db";
import {
  cardInstance,
  cardTemplate,
  packDrawGroup,
  packDrawGroupCardWeight,
  packDrawGroupRarityWeight,
  packInstance,
  packRevision,
  packTemplate,
} from "@repo/db/schema/app";
import { generateId } from "@repo/db/utils";
import type {
  CollectibleBinding,
  CollectibleMetricSink,
  NormalizedPackRevisionDraft,
  PackCandidate,
  PackDrawGroup,
  PackGuarantee,
  PackOutcomeCard,
} from "@repo/shared/collectibles";
import {
  normalizePackRevisionDraft,
  PackSelectionError,
  recordCollectibleMetric,
  selectPackOutcome as selectSharedPackOutcome,
} from "@repo/shared/collectibles";

import { appendCollectibleOwnershipEvent } from "./collectible-ownership";
import {
  assertCollectiblesMutationAllowed,
  withCollectibleDeadlockRetry,
} from "./collectibles";

type Database = typeof database;
export type CollectibleTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

export type PackIssuanceInput = {
  actorUserId?: string | null;
  binding: CollectibleBinding;
  issueReference?: string;
  issueSource: string;
  metrics?: CollectibleMetricSink;
  ownerUserId: string;
  packTemplateId: string;
  random?: PackRandomSource;
  sourceReference?: string;
  now?: Date;
};

export type DirectCardIssuanceInput = {
  actorUserId?: string | null;
  binding: CollectibleBinding;
  issueReference?: string;
  issueSource: string;
  metrics?: CollectibleMetricSink;
  ownerUserId: string;
  random?: never;
  sourceReference?: string;
  templateId: string;
};

export type PackIssuanceResult = {
  binding: CollectibleBinding;
  cardInstanceIds: string[];
  issueReference: string;
  issueSource: string;
  mintNumbers: number[];
  packInstanceId: string;
  revisionId: string;
  templateId: string;
};

export type PublicPackIssuanceResult = Omit<
  PackIssuanceResult,
  "cardInstanceIds" | "mintNumbers"
>;

export function shapePublicPackIssuance(
  issued: PackIssuanceResult
): PublicPackIssuanceResult {
  const {
    cardInstanceIds: _hiddenCardIds,
    mintNumbers: _hiddenMints,
    ...safe
  } = issued;
  return safe;
}

export type DirectCardIssuanceResult = {
  binding: CollectibleBinding;
  cardInstanceId: string;
  mintNumber: number;
  templateId: string;
};

export type CollectibleIssuanceErrorCode =
  | "CONFLICT"
  | "EXHAUSTED_SUPPLY"
  | "IMPOSSIBLE_GUARANTEE"
  | "INVALID_BINDING"
  | "NOT_FOUND"
  | "PROJECTION_MISMATCH"
  | "UNAVAILABLE";

export class CollectibleIssuanceError extends Error {
  readonly code: CollectibleIssuanceErrorCode;
  readonly markRevisionExhausted: boolean;
  readonly revisionId?: string;
  readonly templateId?: string;

  constructor(
    code: CollectibleIssuanceErrorCode,
    message: string,
    options: {
      markRevisionExhausted?: boolean;
      revisionId?: string;
      templateId?: string;
    } = {}
  ) {
    super(message);
    this.name = "CollectibleIssuanceError";
    this.code = code;
    this.markRevisionExhausted = options.markRevisionExhausted ?? false;
    this.revisionId = options.revisionId;
    this.templateId = options.templateId;
  }
}

type PackRandomSource = (() => number) | { next: () => number };

type Candidate = PackCandidate & {
  cardTemplateId: string;
  mintedSupply: number;
  lifetimeSupplyCeiling?: number | null;
  rarity: PackDrawGroup["cardWeights"][number]["rarity"];
};

function secureRandomFraction() {
  // randomInt is backed by the platform CSPRNG.  Tests inject `random` at the
  // service boundary; callers never receive or submit this value.
  return randomInt(0, 0x1_00_00_00_00) / 0x1_00_00_00_00;
}

function issuanceRandomSource(source: PackRandomSource | undefined) {
  return source ?? secureRandomFraction;
}

function packRevisionConfiguration(
  revision: typeof packRevision.$inferSelect,
  groups: {
    cardWeights: {
      cardTemplateId: string;
      rarity: Candidate["rarity"];
      weight: number;
    }[];
    drawCount: number;
    guarantees: PackGuarantee[];
    order: number;
    rarityWeights: { rarity: Candidate["rarity"]; weight: number }[];
  }[]
): NormalizedPackRevisionDraft {
  return normalizePackRevisionDraft({
    bindingPolicy: revision.bindingPolicy,
    cardCount: revision.cardCount,
    duplicatePolicy: revision.duplicatePolicy,
    drawGroups: groups,
    id: revision.id,
    templateId: revision.templateId,
  });
}

function resolvePackOutcomeSelection(
  configuration: NormalizedPackRevisionDraft,
  candidates: readonly Candidate[],
  source: PackRandomSource | undefined
): PackOutcomeCard[] {
  try {
    return selectSharedPackOutcome(
      configuration,
      candidates,
      issuanceRandomSource(source)
    );
  } catch (error) {
    if (error instanceof PackSelectionError) {
      throw new CollectibleIssuanceError(error.code, error.message);
    }
    throw error;
  }
}

/** Pure API-package alias retained for grant and opening callers. */
export const resolvePackOutcome = resolvePackOutcomeSelection;

async function loadPackConfiguration(
  tx: Pick<CollectibleTransaction, "select">,
  revision: typeof packRevision.$inferSelect
) {
  const groups = await tx
    .select()
    .from(packDrawGroup)
    .where(eq(packDrawGroup.revisionId, revision.id))
    .orderBy(asc(packDrawGroup.order));
  const normalizedGroups = [];
  for (const group of groups) {
    const [rarityWeights, cardWeights] = await Promise.all([
      tx
        .select({
          rarity: packDrawGroupRarityWeight.rarity,
          weight: packDrawGroupRarityWeight.weight,
        })
        .from(packDrawGroupRarityWeight)
        .where(eq(packDrawGroupRarityWeight.drawGroupId, group.id))
        .orderBy(asc(packDrawGroupRarityWeight.rarity)),
      tx
        .select({
          cardTemplateId: packDrawGroupCardWeight.cardTemplateId,
          rarity: packDrawGroupCardWeight.rarity,
          weight: packDrawGroupCardWeight.weight,
        })
        .from(packDrawGroupCardWeight)
        .where(eq(packDrawGroupCardWeight.drawGroupId, group.id))
        .orderBy(asc(packDrawGroupCardWeight.cardTemplateId)),
    ]);
    normalizedGroups.push({
      cardWeights,
      drawCount: group.drawCount,
      guarantees: group.guarantees,
      order: group.order,
      rarityWeights,
    });
  }
  return packRevisionConfiguration(revision, normalizedGroups);
}

async function loadAvailableCandidates(
  tx: Pick<CollectibleTransaction, "select">,
  configuration: NormalizedPackRevisionDraft,
  metrics?: CollectibleMetricSink
) {
  const ids = [
    ...new Set(
      configuration.drawGroups.flatMap((group) =>
        group.cardWeights.map(({ cardTemplateId }) => cardTemplateId)
      )
    ),
  ];
  const rarities = [
    ...new Set(
      configuration.drawGroups.flatMap((group) =>
        group.rarityWeights.map(({ rarity }) => rarity)
      )
    ),
  ];
  const predicates = [
    ...(ids.length > 0 ? [inArray(cardTemplate.id, ids)] : []),
    ...(rarities.length > 0 ? [inArray(cardTemplate.rarity, rarities)] : []),
  ];
  const rows = await tx
    .select({
      availability: cardTemplate.availability,
      id: cardTemplate.id,
      lifecycle: cardTemplate.lifecycle,
      mintedSupply: cardTemplate.mintedSupply,
      rarity: cardTemplate.rarity,
      lifetimeSupplyCeiling: cardTemplate.lifetimeSupplyCeiling,
    })
    .from(cardTemplate)
    .where(
      predicates.length === 0
        ? undefined
        : predicates.length === 1
          ? predicates[0]
          : or(...predicates)
    )
    .orderBy(asc(cardTemplate.id))
    .for("update");

  const instanceCounts =
    rows.length === 0
      ? []
      : await tx
          .select({
            count: sql<number>`count(*)::integer`,
            templateId: cardInstance.templateId,
          })
          .from(cardInstance)
          .where(
            inArray(
              cardInstance.templateId,
              rows.map(({ id }) => id)
            )
          )
          .groupBy(cardInstance.templateId);
  const instanceCountsByTemplateId = new Map(
    instanceCounts.map((row) => [row.templateId, Number(row.count)])
  );
  for (const row of rows) {
    const instanceCount = instanceCountsByTemplateId.get(row.id) ?? 0;
    if (instanceCount !== row.mintedSupply) {
      recordCollectibleMetric(metrics, {
        name: "projection_mismatch",
        operation: "pack.issue",
        templateId: row.id,
      });
      throw new CollectibleIssuanceError(
        "PROJECTION_MISMATCH",
        "El suministro proyectado de una plantilla no coincide con sus instancias.",
        { templateId: row.id }
      );
    }
  }

  return rows
    .filter(
      (row) =>
        row.lifecycle === "active" &&
        row.availability === "active" &&
        (row.lifetimeSupplyCeiling === null ||
          row.mintedSupply < row.lifetimeSupplyCeiling)
    )
    .map((row) => ({
      cardTemplateId: row.id,
      lifetimeSupplyCeiling: row.lifetimeSupplyCeiling,
      mintedSupply: row.mintedSupply,
      rarity: row.rarity,
    }));
}

function outcomeDigest(input: {
  cardInstanceIds: readonly string[];
  issueReference: string;
  revisionId: string;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        cardInstanceIds: input.cardInstanceIds,
        issueReference: input.issueReference,
        revisionId: input.revisionId,
      })
    )
    .digest("hex");
}

async function recordOwnershipEvent(
  tx: Pick<CollectibleTransaction, "insert">,
  input: {
    actorUserId?: string | null;
    cardInstanceId?: string;
    fromUserId?: string | null;
    kind: "issuance" | "grant" | "opening" | "transfer" | "correction";
    metadata?: Record<string, unknown>;
    packInstanceId?: string;
    sourceReference: string;
    sourceType: string;
    toUserId?: string | null;
  }
) {
  await appendCollectibleOwnershipEvent(tx, {
    ...input,
    metadata: input.metadata ?? {},
  });
}

async function assertSupplyProjectionMatchesInstances(
  tx: Pick<CollectibleTransaction, "select">,
  template: { id: string; mintedSupply: number },
  metrics?: CollectibleMetricSink
) {
  const [countRow] = await tx
    .select({ count: sql<number>`count(*)::integer` })
    .from(cardInstance)
    .where(eq(cardInstance.templateId, template.id));
  if (Number(countRow?.count ?? 0) !== template.mintedSupply) {
    recordCollectibleMetric(metrics, {
      name: "projection_mismatch",
      operation: "card.issue",
      templateId: template.id,
    });
    throw new CollectibleIssuanceError(
      "PROJECTION_MISMATCH",
      "El suministro proyectado de una plantilla no coincide con sus instancias.",
      { templateId: template.id }
    );
  }
}

async function mintCardInTransaction(
  tx: CollectibleTransaction,
  input: {
    actorUserId?: string | null;
    binding: CollectibleBinding;
    issueReference: string;
    issueSource: string;
    ownerUserId?: string | null;
    packInstanceId?: string;
    revealOrder?: number;
    metrics?: CollectibleMetricSink;
    templateId: string;
  }
) {
  const [template] = await tx
    .select()
    .from(cardTemplate)
    .where(eq(cardTemplate.id, input.templateId))
    .for("update");
  if (!template) {
    throw new CollectibleIssuanceError(
      "NOT_FOUND",
      "La plantilla de carta no existe."
    );
  }
  await assertSupplyProjectionMatchesInstances(tx, template, input.metrics);
  if (template.lifecycle !== "active" || template.availability !== "active") {
    throw new CollectibleIssuanceError(
      "UNAVAILABLE",
      "La plantilla de carta no está disponible."
    );
  }
  if (
    template.lifetimeSupplyCeiling !== null &&
    template.mintedSupply >= template.lifetimeSupplyCeiling
  ) {
    recordCollectibleMetric(input.metrics, {
      name: "supply_exhaustion",
      operation: input.packInstanceId ? "pack.issue" : "card.issue",
      templateId: template.id,
    });
    throw new CollectibleIssuanceError(
      "EXHAUSTED_SUPPLY",
      "Se agotó el suministro de la plantilla de carta."
    );
  }
  if ((input.ownerUserId ? 1 : 0) + (input.packInstanceId ? 1 : 0) !== 1) {
    throw new CollectibleIssuanceError(
      "CONFLICT",
      "Una carta debe tener exactamente una ubicación."
    );
  }

  const mintNumber = template.mintedSupply + 1;
  const issuedAt = new Date();
  const [updatedTemplate] = await tx
    .update(cardTemplate)
    .set({
      firstMintedAt: template.firstMintedAt ?? issuedAt,
      mintedSupply: sql`${cardTemplate.mintedSupply} + 1`,
      version: sql`${cardTemplate.version} + 1`,
    })
    .where(
      and(
        eq(cardTemplate.id, template.id),
        eq(cardTemplate.mintedSupply, template.mintedSupply),
        sql`(${cardTemplate.lifetimeSupplyCeiling} IS NULL OR ${cardTemplate.mintedSupply} < ${cardTemplate.lifetimeSupplyCeiling})`
      )
    )
    .returning({ id: cardTemplate.id });
  if (!updatedTemplate) {
    throw new CollectibleIssuanceError(
      "CONFLICT",
      "El suministro cambió mientras se emitía la carta."
    );
  }

  const cardId = generateId();
  await tx.insert(cardInstance).values({
    binding: input.binding,
    id: cardId,
    issueReference: input.issueReference,
    issuanceSource: input.issueSource,
    issuedAt,
    mintNumber,
    ownerUserId: input.ownerUserId,
    packInstanceId: input.packInstanceId,
    revealOrder: input.revealOrder,
    templateId: input.templateId,
  });
  await recordOwnershipEvent(tx, {
    actorUserId: input.actorUserId,
    cardInstanceId: cardId,
    kind: input.packInstanceId ? "issuance" : "grant",
    metadata: input.packInstanceId
      ? { hidden: true, revealOrder: input.revealOrder }
      : undefined,
    sourceReference: input.issueReference,
    sourceType: input.issueSource,
    toUserId: input.ownerUserId,
  });
  return { cardInstanceId: cardId, mintNumber };
}

/** Direct Card Template issuance used by a bounded card grant. */
export async function issueCardInTransaction(
  tx: CollectibleTransaction,
  input: DirectCardIssuanceInput
): Promise<DirectCardIssuanceResult> {
  const result = await mintCardInTransaction(tx, {
    ...input,
    issueReference:
      input.issueReference ?? input.sourceReference ?? generateId(),
  });
  return {
    binding: input.binding,
    cardInstanceId: result.cardInstanceId,
    mintNumber: result.mintNumber,
    templateId: input.templateId,
  };
}

/**
 * Issues a Pack and all hidden cards using one caller-owned transaction.  The
 * returned card IDs are for the grant/opening services only; routers must
 * shape an unopened pack without these IDs.
 */
export async function issuePackInTransaction(
  tx: CollectibleTransaction,
  input: PackIssuanceInput
): Promise<PackIssuanceResult> {
  const issueReference =
    input.issueReference ?? input.sourceReference ?? generateId();
  const [template] = await tx
    .select()
    .from(packTemplate)
    .where(eq(packTemplate.id, input.packTemplateId))
    .for("update");
  if (!template) {
    throw new CollectibleIssuanceError("NOT_FOUND", "El Pack no existe.");
  }
  if (template.lifecycle !== "active" || !template.latestPublishedRevisionId) {
    throw new CollectibleIssuanceError(
      "UNAVAILABLE",
      "El Pack no está disponible para nuevas emisiones."
    );
  }

  const [revision] = await tx
    .select()
    .from(packRevision)
    .where(
      and(
        eq(packRevision.id, template.latestPublishedRevisionId),
        eq(packRevision.templateId, template.id)
      )
    )
    .for("update");
  if (!revision || revision.lifecycle !== "published") {
    throw new CollectibleIssuanceError(
      "UNAVAILABLE",
      "El Pack no tiene una revisión publicada disponible."
    );
  }
  if (revision.availability !== "active") {
    if (revision.availability === "exhausted") {
      recordCollectibleMetric(input.metrics, {
        name: "supply_exhaustion",
        operation: "pack.issue",
        revisionId: revision.id,
        templateId: template.id,
      });
    }
    throw new CollectibleIssuanceError(
      revision.availability === "exhausted"
        ? "EXHAUSTED_SUPPLY"
        : "UNAVAILABLE",
      "La revisión del Pack no está disponible para emisión."
    );
  }
  if (
    revision.bindingPolicy !== "either" &&
    revision.bindingPolicy !== input.binding
  ) {
    throw new CollectibleIssuanceError(
      "INVALID_BINDING",
      "La revisión del Pack no permite este tipo de binding."
    );
  }

  const configuration = await loadPackConfiguration(tx, revision);
  const candidates = await loadAvailableCandidates(
    tx,
    configuration,
    input.metrics
  );
  let outcome: PackOutcomeCard[];
  try {
    outcome = resolvePackOutcomeSelection(
      configuration,
      candidates,
      input.random
    );
  } catch (error) {
    if (error instanceof CollectibleIssuanceError) {
      const metricName =
        error.code === "IMPOSSIBLE_GUARANTEE"
          ? "impossible_guarantee"
          : "supply_exhaustion";
      recordCollectibleMetric(input.metrics, {
        name: metricName,
        operation: "pack.issue",
        revisionId: revision.id,
        templateId: template.id,
      });
      if (
        error.code === "EXHAUSTED_SUPPLY" ||
        error.code === "IMPOSSIBLE_GUARANTEE" ||
        error.code === "UNAVAILABLE"
      ) {
        throw new CollectibleIssuanceError(error.code, error.message, {
          markRevisionExhausted: true,
          revisionId: revision.id,
        });
      }
    }
    throw error;
  }
  const issuedAt = input.now ?? new Date();
  const packId = generateId();

  await tx.insert(packInstance).values({
    binding: input.binding,
    id: packId,
    issueReference,
    issueSource: input.issueSource,
    issuedAt,
    outcomeDigest: "pending",
    ownerUserId: input.ownerUserId,
    revisionId: revision.id,
    state: "unopened",
    templateId: template.id,
  });
  await recordOwnershipEvent(tx, {
    actorUserId: input.actorUserId,
    kind: "issuance",
    metadata: { hiddenOutcome: true, revisionId: revision.id },
    packInstanceId: packId,
    sourceReference: issueReference,
    sourceType: input.issueSource,
    toUserId: input.ownerUserId,
  });

  const cards: { cardInstanceId: string; mintNumber: number }[] = [];
  for (const [index, selected] of outcome.entries()) {
    cards.push(
      await mintCardInTransaction(tx, {
        actorUserId: input.actorUserId,
        binding: input.binding,
        issueReference: `${issueReference}:card:${index + 1}`,
        issueSource: "pack",
        packInstanceId: packId,
        revealOrder: index + 1,
        metrics: input.metrics,
        templateId: selected.cardTemplateId,
      })
    );
  }
  const digest = outcomeDigest({
    cardInstanceIds: cards.map(({ cardInstanceId }) => cardInstanceId),
    issueReference,
    revisionId: revision.id,
  });
  await tx
    .update(packInstance)
    .set({ outcomeDigest: digest, updatedAt: issuedAt })
    .where(eq(packInstance.id, packId));

  return {
    binding: input.binding,
    cardInstanceIds: cards.map(({ cardInstanceId }) => cardInstanceId),
    issueReference,
    issueSource: input.issueSource,
    mintNumbers: cards.map(({ mintNumber }) => mintNumber),
    packInstanceId: packId,
    revisionId: revision.id,
    templateId: template.id,
  };
}

function isRevisionExhaustionError(
  error: unknown
): error is CollectibleIssuanceError {
  return (
    error instanceof CollectibleIssuanceError &&
    error.markRevisionExhausted &&
    Boolean(error.revisionId)
  );
}

function isProjectionMismatchError(
  error: unknown
): error is CollectibleIssuanceError {
  return (
    error instanceof CollectibleIssuanceError &&
    error.code === "PROJECTION_MISMATCH" &&
    Boolean(error.templateId)
  );
}

/**
 * Runs issuance work in a savepoint. If the final candidate set is
 * impossible, all pack/card/campaign writes roll back while the outer
 * transaction commits the revision's exhausted marker. A projection mismatch
 * similarly rolls back issuance and commits a fail-closed template freeze.
 * Callers must catch the returned error inside their outer transaction
 * callback; safety markers are intentionally not committed when the outer
 * transaction itself fails.
 */
export async function runCollectibleIssuanceInTransaction<T>(
  tx: CollectibleTransaction,
  callback: (nestedTx: CollectibleTransaction) => Promise<T>
): Promise<T> {
  try {
    return await tx.transaction(callback);
  } catch (error) {
    if (isRevisionExhaustionError(error)) {
      await tx
        .update(packRevision)
        .set({
          availability: "exhausted",
          updatedAt: new Date(),
          version: sql`${packRevision.version} + 1`,
        })
        .where(
          and(
            eq(packRevision.id, error.revisionId!),
            eq(packRevision.availability, "active")
          )
        );
    } else if (isProjectionMismatchError(error)) {
      // Instance history is authoritative. Freeze the suspect projection in
      // the caller's transaction after the issuance savepoint rolls back.
      await tx
        .update(cardTemplate)
        .set({
          availability: "disabled",
          disabledAt: new Date(),
          version: sql`${cardTemplate.version} + 1`,
        })
        .where(
          and(
            eq(cardTemplate.id, error.templateId!),
            eq(cardTemplate.availability, "active")
          )
        );
    }
    throw error;
  }
}

/** Public transaction boundary for non-campaign callers such as later shop/gacha services. */
export async function issuePack(
  db: Database,
  input: PackIssuanceInput & { impersonated?: boolean }
): Promise<PublicPackIssuanceResult> {
  assertCollectiblesMutationAllowed({ impersonated: input.impersonated });
  let exhaustedFailure: CollectibleIssuanceError | undefined;
  let projectionMismatchFailure: CollectibleIssuanceError | undefined;
  const result = await withCollectibleDeadlockRetry(
    () => {
      exhaustedFailure = undefined;
      projectionMismatchFailure = undefined;
      return db.transaction(async (tx) => {
        try {
          const issued = await runCollectibleIssuanceInTransaction(
            tx,
            (nestedTx) => issuePackInTransaction(nestedTx, input)
          );
          return shapePublicPackIssuance(issued);
        } catch (error) {
          if (isRevisionExhaustionError(error)) {
            exhaustedFailure = error;
            return;
          }
          if (isProjectionMismatchError(error)) {
            projectionMismatchFailure = error;
            return;
          }
          throw error;
        }
      });
    },
    { metrics: input.metrics, operation: "pack.issue" }
  );
  if (exhaustedFailure) {
    // oxlint-disable-next-line eslint/no-throw-literal -- The transaction catch narrows this value to CollectibleIssuanceError.
    throw exhaustedFailure;
  }
  if (projectionMismatchFailure) {
    // oxlint-disable-next-line eslint/no-throw-literal -- The transaction catch narrows this value to CollectibleIssuanceError.
    throw projectionMismatchFailure;
  }
  return result!;
}
