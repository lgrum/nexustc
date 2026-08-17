import { and, eq, sql } from "@repo/db";
import type { db as database } from "@repo/db";
import {
  cardTemplate,
  collectibleGrantCampaign,
  collectibleGrantExecution,
  packTemplate,
  user,
} from "@repo/db/schema/app";
import { generateId } from "@repo/db/utils";
import {
  callerIdempotencyKeySchema,
  collectibleBindingSchema,
  normalizeCollectiblePayload,
  recordCollectibleMetric,
} from "@repo/shared/collectibles";
import type { CollectibleMetricSink } from "@repo/shared/collectibles";
import z from "zod";

import {
  CollectibleIssuanceError,
  issueCardInTransaction,
  issuePackInTransaction,
  runCollectibleIssuanceInTransaction,
} from "./collectible-issuance";
import type { CollectibleTransaction } from "./collectible-issuance";
import {
  assertCollectiblesMutationAllowed,
  withCollectibleDeadlockRetry,
} from "./collectibles";
import { createUserNotification } from "./notification";

type Database = typeof database;

export const collectibleGrantCampaignInputSchema = z
  .object({
    auditReason: z.string().trim().min(3).max(500),
    binding: collectibleBindingSchema,
    cardTemplateId: z.string().trim().min(1).max(200).optional(),
    eligibilityExplanation: z.string().trim().min(3).max(1000),
    endsAt: z.coerce.date().optional(),
    packTemplateId: z.string().trim().min(1).max(200).optional(),
    perAccountQuantity: z.number().int().positive().max(1000),
    quantityCeiling: z.number().int().positive().max(100_000),
    startsAt: z.coerce.date().optional(),
    state: z.enum(["draft", "active", "paused", "retired"]).default("draft"),
  })
  .strict()
  .superRefine((value, context) => {
    if (Boolean(value.cardTemplateId) === Boolean(value.packTemplateId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Una campaña debe apuntar a una carta o a un Pack, no a ambos.",
        path: ["cardTemplateId"],
      });
    }
    if (value.endsAt && value.startsAt && value.endsAt <= value.startsAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La fecha final debe ser posterior a la fecha inicial.",
        path: ["endsAt"],
      });
    }
    if (value.perAccountQuantity > value.quantityCeiling) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "El límite por cuenta no puede superar el techo de la campaña.",
        path: ["perAccountQuantity"],
      });
    }
  });

export type CollectibleGrantCampaignInput = z.input<
  typeof collectibleGrantCampaignInputSchema
>;

export const collectibleGrantExecutionInputSchema = z
  .object({
    campaignId: z.string().trim().min(1).max(200),
    idempotencyKey: callerIdempotencyKeySchema,
    quantity: z.number().int().positive().max(50).default(1),
    recipientUserId: z.string().trim().min(1).max(200),
  })
  .strict();

export type CollectibleGrantExecutionInput = z.infer<
  typeof collectibleGrantExecutionInputSchema
>;

type GrantResult = {
  assetIds: string[];
  assetKind: "card" | "pack";
  campaignId: string;
  executionId: string;
  quantity: number;
  recipientUserId: string;
};

export type CollectibleGrantResult = GrantResult & { replayed: boolean };

export type CollectibleGrantCampaignErrorCode =
  | "ACCOUNT_INELIGIBLE"
  | "CAMPAIGN_LIMIT"
  | "CAMPAIGN_NOT_FOUND"
  | "CAMPAIGN_NOT_OPEN"
  | "IDEMPOTENCY_CONFLICT"
  | "TARGET_UNAVAILABLE";

export class CollectibleGrantCampaignError extends Error {
  readonly code: CollectibleGrantCampaignErrorCode;

  constructor(code: CollectibleGrantCampaignErrorCode, message: string) {
    super(message);
    this.name = "CollectibleGrantCampaignError";
    this.code = code;
  }
}

function campaignTarget(input: CollectibleGrantCampaignInput) {
  return input.cardTemplateId
    ? { cardTemplateId: input.cardTemplateId, targetKind: "card" as const }
    : { packTemplateId: input.packTemplateId!, targetKind: "pack" as const };
}

/** Creates a bounded campaign; execution is the only ordinary mint path. */
export function createCollectibleGrantCampaign(
  db: Database,
  actorUserId: string,
  input: CollectibleGrantCampaignInput
) {
  assertCollectiblesMutationAllowed();
  const parsed = collectibleGrantCampaignInputSchema.parse(input);
  const target = campaignTarget(parsed);
  return db.transaction(async (tx) => {
    if (target.cardTemplateId) {
      const [template] = await tx
        .select({ id: cardTemplate.id })
        .from(cardTemplate)
        .where(eq(cardTemplate.id, target.cardTemplateId));
      if (!template) {
        throw new CollectibleGrantCampaignError(
          "TARGET_UNAVAILABLE",
          "La plantilla de carta no existe."
        );
      }
    } else {
      const [template] = await tx
        .select({ id: packTemplate.id })
        .from(packTemplate)
        .where(eq(packTemplate.id, target.packTemplateId!));
      if (!template) {
        throw new CollectibleGrantCampaignError(
          "TARGET_UNAVAILABLE",
          "El Pack no existe."
        );
      }
    }
    const [campaign] = await tx
      .insert(collectibleGrantCampaign)
      .values({
        auditReason: parsed.auditReason,
        binding: parsed.binding,
        cardTemplateId: target.cardTemplateId,
        createdByUserId: actorUserId,
        eligibilityExplanation: parsed.eligibilityExplanation,
        endsAt: parsed.endsAt,
        id: generateId(),
        packTemplateId: target.packTemplateId,
        perAccountQuantity: parsed.perAccountQuantity,
        quantityCeiling: parsed.quantityCeiling,
        startsAt: parsed.startsAt,
        state: parsed.state,
        targetKind: target.targetKind,
      })
      .returning();
    if (!campaign) {
      throw new CollectibleGrantCampaignError(
        "TARGET_UNAVAILABLE",
        "No se pudo crear la campaña."
      );
    }
    return campaign;
  });
}

function replayResult(
  execution: typeof collectibleGrantExecution.$inferSelect,
  fingerprint: string,
  input: CollectibleGrantExecutionInput
): CollectibleGrantResult {
  if (execution.fingerprint !== fingerprint) {
    throw new CollectibleGrantCampaignError(
      "IDEMPOTENCY_CONFLICT",
      "La clave de idempotencia ya fue usada con otra concesión."
    );
  }
  return {
    assetIds: execution.resultAssetIds,
    assetKind: execution.packInstanceId ? "pack" : "card",
    campaignId: input.campaignId,
    executionId: execution.id,
    quantity: execution.quantity,
    recipientUserId: execution.recipientUserId ?? "closed-account",
    replayed: true,
  };
}

async function countRecipientGrants(
  tx: Pick<CollectibleTransaction, "select">,
  campaignId: string,
  recipientUserId: string
) {
  const rows = await tx
    .select({ quantity: collectibleGrantExecution.quantity })
    .from(collectibleGrantExecution)
    .where(
      and(
        eq(collectibleGrantExecution.campaignId, campaignId),
        eq(collectibleGrantExecution.recipientUserId, recipientUserId)
      )
    );
  return rows.reduce((sum, row) => sum + row.quantity, 0);
}

/**
 * Executes one bounded campaign command.  The campaign lock, capacity,
 * issuance, history, and idempotency result all share the caller's
 * transaction; notification delivery is deliberately after commit.
 */
export async function executeCollectibleGrantCampaign(
  db: Database,
  actorUserId: string,
  input: CollectibleGrantExecutionInput & {
    impersonated?: boolean;
    now?: Date;
    metrics?: CollectibleMetricSink;
    random?: () => number;
  }
): Promise<CollectibleGrantResult> {
  assertCollectiblesMutationAllowed({ impersonated: input.impersonated });
  const parsed = collectibleGrantExecutionInputSchema.parse({
    campaignId: input.campaignId,
    idempotencyKey: input.idempotencyKey,
    quantity: input.quantity,
    recipientUserId: input.recipientUserId,
  });
  const fingerprint = normalizeCollectiblePayload({
    actorUserId,
    campaignId: parsed.campaignId,
    quantity: parsed.quantity,
    recipientUserId: parsed.recipientUserId,
  });
  let exhaustedFailure: Error | undefined;
  const result = await withCollectibleDeadlockRetry(
    () => {
      exhaustedFailure = undefined;
      return db.transaction(async (tx) => {
        // Serialize a caller key before the campaign lock so retries cannot race
        // across two campaigns and turn the unique index into an opaque error.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`collectible-grant:${parsed.idempotencyKey}`}, 0))`
        );
        try {
          return await runCollectibleIssuanceInTransaction(
            tx,
            async (workTx) => {
              const [campaign] = await workTx
                .select()
                .from(collectibleGrantCampaign)
                .where(eq(collectibleGrantCampaign.id, parsed.campaignId))
                .for("update");
              if (!campaign) {
                throw new CollectibleGrantCampaignError(
                  "CAMPAIGN_NOT_FOUND",
                  "La campaña no existe."
                );
              }

              const existing =
                await workTx.query.collectibleGrantExecution.findFirst({
                  where: eq(
                    collectibleGrantExecution.idempotencyKey,
                    parsed.idempotencyKey
                  ),
                });
              if (existing) {
                try {
                  return replayResult(existing, fingerprint, parsed);
                } catch (error) {
                  if (
                    error instanceof CollectibleGrantCampaignError &&
                    error.code === "IDEMPOTENCY_CONFLICT"
                  ) {
                    recordCollectibleMetric(input.metrics, {
                      name: "idempotency_conflict",
                      operation: "grant.execute",
                    });
                  }
                  throw error;
                }
              }

              const now = input.now ?? new Date();
              if (
                campaign.state !== "active" ||
                (campaign.startsAt && campaign.startsAt > now) ||
                (campaign.endsAt && campaign.endsAt <= now)
              ) {
                throw new CollectibleGrantCampaignError(
                  "CAMPAIGN_NOT_OPEN",
                  "La campaña no está abierta en este momento."
                );
              }
              const [recipient] = await workTx
                .select({
                  banned: user.banned,
                  emailVerified: user.emailVerified,
                  id: user.id,
                })
                .from(user)
                .where(eq(user.id, parsed.recipientUserId));
              if (!recipient || recipient.banned || !recipient.emailVerified) {
                throw new CollectibleGrantCampaignError(
                  "ACCOUNT_INELIGIBLE",
                  "La cuenta destinataria no puede recibir esta concesión."
                );
              }
              const recipientQuantity = await countRecipientGrants(
                workTx,
                campaign.id,
                recipient.id
              );
              if (
                campaign.quantityIssued + parsed.quantity >
                  campaign.quantityCeiling ||
                recipientQuantity + parsed.quantity >
                  campaign.perAccountQuantity
              ) {
                throw new CollectibleGrantCampaignError(
                  "CAMPAIGN_LIMIT",
                  "La concesión supera el límite de la campaña o de la cuenta."
                );
              }

              const assetIds: string[] = [];
              const assetKind = campaign.targetKind;
              for (let index = 0; index < parsed.quantity; index += 1) {
                const issueReference = `${parsed.idempotencyKey}:${index + 1}`;
                if (assetKind === "card" && campaign.cardTemplateId) {
                  const issued = await issueCardInTransaction(workTx, {
                    actorUserId,
                    binding: campaign.binding,
                    issueReference,
                    issueSource: "grant",
                    metrics: input.metrics,
                    ownerUserId: recipient.id,
                    templateId: campaign.cardTemplateId,
                  });
                  assetIds.push(issued.cardInstanceId);
                } else if (assetKind === "pack" && campaign.packTemplateId) {
                  const issued = await issuePackInTransaction(workTx, {
                    actorUserId,
                    binding: campaign.binding,
                    issueReference,
                    issueSource: "grant",
                    metrics: input.metrics,
                    ownerUserId: recipient.id,
                    packTemplateId: campaign.packTemplateId,
                    random: input.random,
                    now,
                  });
                  assetIds.push(issued.packInstanceId);
                } else {
                  throw new CollectibleGrantCampaignError(
                    "TARGET_UNAVAILABLE",
                    "El objetivo de la campaña ya no está disponible."
                  );
                }
              }

              const [updatedCampaign] = await workTx
                .update(collectibleGrantCampaign)
                .set({
                  quantityIssued: sql`${collectibleGrantCampaign.quantityIssued} + ${parsed.quantity}`,
                  updatedAt: now,
                })
                .where(
                  and(
                    eq(collectibleGrantCampaign.id, campaign.id),
                    eq(
                      collectibleGrantCampaign.quantityIssued,
                      campaign.quantityIssued
                    ),
                    sql`${collectibleGrantCampaign.quantityIssued} + ${parsed.quantity} <= ${collectibleGrantCampaign.quantityCeiling}`
                  )
                )
                .returning({ id: collectibleGrantCampaign.id });
              if (!updatedCampaign) {
                throw new CollectibleGrantCampaignError(
                  "CAMPAIGN_LIMIT",
                  "La campaña ya alcanzó su límite."
                );
              }

              const executionId = generateId();
              await workTx.insert(collectibleGrantExecution).values({
                actorUserId,
                campaignId: campaign.id,
                cardInstanceId: assetKind === "card" ? assetIds[0] : undefined,
                fingerprint,
                id: executionId,
                idempotencyKey: parsed.idempotencyKey,
                packInstanceId: assetKind === "pack" ? assetIds[0] : undefined,
                quantity: parsed.quantity,
                recipientUserId: recipient.id,
                resultAssetIds: assetIds,
              });
              return {
                assetIds,
                assetKind,
                campaignId: campaign.id,
                executionId,
                quantity: parsed.quantity,
                recipientUserId: recipient.id,
                replayed: false,
              } satisfies CollectibleGrantResult;
            }
          );
        } catch (error) {
          if (
            error instanceof CollectibleIssuanceError &&
            (error.markRevisionExhausted ||
              error.code === "PROJECTION_MISMATCH")
          ) {
            exhaustedFailure = error;
            return;
          }
          throw error;
        }
      });
    },
    { metrics: input.metrics, operation: "grant.execute" }
  );
  if (exhaustedFailure) {
    // oxlint-disable-next-line eslint/no-throw-literal -- The transaction catch narrows this value to Error.
    throw exhaustedFailure;
  }
  if (!result) {
    throw new Error("La concesión no produjo un resultado.");
  }

  // Delivery is intentionally outside the settlement transaction. The unique
  // dedupe key makes a retry harmless and no exact result/card ID is included.
  await deliverCollectibleGrantNotification(db, result).catch(() => null);
  return result;
}

export function deliverCollectibleGrantNotification(
  db: Database,
  result: Pick<
    GrantResult,
    "assetKind" | "campaignId" | "executionId" | "recipientUserId"
  > & {
    quantity?: number;
  }
) {
  return createUserNotification(db, {
    dedupeKey: `collectible-grant:${result.executionId}`,
    description:
      result.assetKind === "pack"
        ? "Recibiste un Pack coleccionable."
        : "Recibiste una carta coleccionable.",
    metadata: {
      assetKind: result.assetKind,
      category: "collectible_acquisition",
      campaignId: result.campaignId,
      executionId: result.executionId,
      quantity: result.quantity ?? 1,
    },
    targetUserId: result.recipientUserId,
    title:
      result.assetKind === "pack"
        ? "Nuevo Pack en tu inventario"
        : "Nueva carta en tu inventario",
  });
}

/** Retry hook for a delivery worker or request-triggered retry. */
export async function retryCollectibleGrantNotification(
  db: Database,
  executionId: string
) {
  assertCollectiblesMutationAllowed();
  const execution = await db.query.collectibleGrantExecution.findFirst({
    where: eq(collectibleGrantExecution.id, executionId),
  });
  if (!execution) {
    throw new CollectibleGrantCampaignError(
      "CAMPAIGN_NOT_FOUND",
      "La ejecución de concesión no existe."
    );
  }
  if (!execution.recipientUserId) {
    return null;
  }
  return deliverCollectibleGrantNotification(db, {
    assetKind: execution.packInstanceId ? "pack" : "card",
    campaignId: execution.campaignId,
    executionId: execution.id,
    quantity: execution.quantity,
    recipientUserId: execution.recipientUserId,
  });
}

export const createGrantCampaign = createCollectibleGrantCampaign;
export const executeGrantCampaign = executeCollectibleGrantCampaign;
export const runCollectibleGrantCampaign = executeCollectibleGrantCampaign;
export const retryGrantNotification = retryCollectibleGrantNotification;
