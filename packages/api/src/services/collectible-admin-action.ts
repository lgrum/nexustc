import { and, desc, eq, lt, or } from "@repo/db";
import type { db as database } from "@repo/db";
import { collectibleAdminAction } from "@repo/db/schema/app";
import { generateId } from "@repo/db/utils";
import {
  normalizeCollectiblePayload,
  recordCollectibleMetric,
} from "@repo/shared/collectibles";
import type { CollectibleMetricSink } from "@repo/shared/collectibles";

type Database = typeof database;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const COLLECTIBLE_ADMIN_ACTIONS = [
  "freeze",
  "restore",
  "disable",
  "retire",
  "cancel",
  "release-custody",
  "retain-custody",
  "correct",
  "exceptional-grant",
  "exceptional-transfer",
  "reverse-eteris",
  "publish-impact",
] as const;
export type CollectibleAdminActionKind =
  (typeof COLLECTIBLE_ADMIN_ACTIONS)[number];

export const COLLECTIBLE_ADMIN_TARGETS = [
  "card-instance",
  "pack-instance",
  "card-template",
  "card-character",
  "card-series",
  "pack-template",
  "pack-revision",
  "shop-offer",
  "gachapon-machine",
  "grant-campaign",
  "market-listing",
  "trade-offer",
  "gift-offer",
  "eteris-transaction",
] as const;
export type CollectibleAdminTargetKind =
  (typeof COLLECTIBLE_ADMIN_TARGETS)[number];

export type CollectibleAdminActionErrorCode =
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_ACTION"
  | "REASON_REQUIRED";

export class CollectibleAdminActionError extends Error {
  readonly code: CollectibleAdminActionErrorCode;

  constructor(code: CollectibleAdminActionErrorCode, message: string) {
    super(message);
    this.name = "CollectibleAdminActionError";
    this.code = code;
  }
}

export type CollectibleAdminActionInput = {
  action: CollectibleAdminActionKind;
  actorUserId?: string | null;
  after?: Record<string, unknown>;
  before?: Record<string, unknown>;
  expectedVersion?: number;
  idempotencyKey: string;
  linkedActionId?: string;
  linkedEterisTransactionId?: string;
  metrics?: CollectibleMetricSink;
  reason: string;
  targetId: string;
  targetKind: CollectibleAdminTargetKind;
  version: number;
};

export type CollectibleAdminActionResult = {
  actionId: string;
  createdAt: Date;
  replayed: boolean;
  version: number;
};

/**
 * Admin snapshots are deliberately boring JSON. In particular, no audit
 * writer is allowed to persist an unopened result, random source, or reveal
 * payload just because a caller accidentally passed one in a diagnostic
 * object.
 */
export function sanitizeCollectibleAdminSnapshot(
  value: Record<string, unknown> | undefined
): Record<string, unknown> {
  const blocked =
    /(?:outcome|random|seed|nonce|reveal(?:order|result)?|resultassetids|cardinstanceids|packinstanceids|secret|token)/i;
  const visit = (input: unknown, depth: number): unknown => {
    if (depth > 4 || input === null) {
      return input;
    }
    if (Array.isArray(input)) {
      return input.slice(0, 100).map((item) => visit(item, depth + 1));
    }
    if (typeof input !== "object") {
      return input;
    }
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>)
        .filter(([key]) => !blocked.test(key))
        .slice(0, 100)
        .map(([key, item]) => [key, visit(item, depth + 1)])
    );
  };
  return (visit(value ?? {}, 0) ?? {}) as Record<string, unknown>;
}

function normalizeReason(reason: string) {
  const normalized = reason.trim();
  if (normalized.length < 3) {
    throw new CollectibleAdminActionError(
      "REASON_REQUIRED",
      "Indica un motivo de al menos 3 caracteres."
    );
  }
  return normalized;
}

function targetReference(
  targetKind: CollectibleAdminTargetKind,
  targetId: string
): Record<string, string> {
  switch (targetKind) {
    case "card-instance": {
      return { cardInstanceId: targetId };
    }
    case "pack-instance": {
      return { packInstanceId: targetId };
    }
    case "card-template": {
      return { cardTemplateId: targetId };
    }
    case "card-character": {
      return { cardCharacterId: targetId };
    }
    case "card-series": {
      return { cardSeriesId: targetId };
    }
    case "pack-template": {
      return { packTemplateId: targetId };
    }
    case "pack-revision": {
      return { packRevisionId: targetId };
    }
    case "shop-offer": {
      return { officialCardShopOfferId: targetId };
    }
    case "gachapon-machine": {
      return { gachaponMachineId: targetId };
    }
    case "grant-campaign": {
      return { collectibleGrantCampaignId: targetId };
    }
    case "market-listing": {
      return { marketListingId: targetId };
    }
    case "trade-offer": {
      return { tradeOfferId: targetId };
    }
    case "gift-offer": {
      return { giftOfferId: targetId };
    }
    case "eteris-transaction": {
      return {};
    }
    default: {
      const unreachable: never = targetKind;
      return unreachable;
    }
  }
}

export function collectibleAdminActionFingerprint(
  input: CollectibleAdminActionInput
) {
  return normalizeCollectiblePayload({
    action: input.action,
    actorUserId: input.actorUserId ?? null,
    expectedVersion: input.expectedVersion ?? null,
    linkedActionId: input.linkedActionId ?? null,
    linkedEterisTransactionId: input.linkedEterisTransactionId ?? null,
    reason: input.reason.trim(),
    targetId: input.targetId,
    targetKind: input.targetKind,
    version: input.version,
  });
}

export async function getCollectibleAdminActionByIdempotencyKey(
  db: Pick<Database, "select">,
  idempotencyKey: string
) {
  const [row] = await db
    .select()
    .from(collectibleAdminAction)
    .where(eq(collectibleAdminAction.idempotencyKey, idempotencyKey.trim()))
    .limit(1);
  return row;
}

function resultFromRow(
  row: typeof collectibleAdminAction.$inferSelect,
  replayed: boolean
): CollectibleAdminActionResult {
  return {
    actionId: row.id,
    createdAt: row.createdAt,
    replayed,
    version: row.version,
  };
}

/** Insert one immutable action or return its exact idempotent replay. */
export async function appendCollectibleAdminAction(
  tx: Pick<Transaction, "insert" | "select">,
  input: CollectibleAdminActionInput
): Promise<CollectibleAdminActionResult> {
  const reason = normalizeReason(input.reason);
  if (input.version < 1 || !Number.isInteger(input.version)) {
    throw new CollectibleAdminActionError(
      "INVALID_ACTION",
      "La versión de auditoría no es válida."
    );
  }
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey) {
    throw new CollectibleAdminActionError(
      "INVALID_ACTION",
      "La clave de idempotencia es obligatoria."
    );
  }
  const fingerprint = collectibleAdminActionFingerprint({ ...input, reason });
  const [existing] = await tx
    .select()
    .from(collectibleAdminAction)
    .where(eq(collectibleAdminAction.idempotencyKey, idempotencyKey))
    .limit(1);
  if (existing) {
    if (existing.fingerprint !== fingerprint) {
      recordCollectibleMetric(input.metrics, {
        name: "idempotency_conflict",
        operation: "collectibles.admin-action",
      });
      throw new CollectibleAdminActionError(
        "IDEMPOTENCY_CONFLICT",
        "La clave de auditoría ya fue usada con datos diferentes."
      );
    }
    return resultFromRow(existing, true);
  }

  const [created] = await tx
    .insert(collectibleAdminAction)
    .values({
      action: input.action,
      actorUserId: input.actorUserId ?? null,
      after: sanitizeCollectibleAdminSnapshot(input.after),
      before: sanitizeCollectibleAdminSnapshot(input.before),
      expectedVersion: input.expectedVersion ?? null,
      fingerprint,
      id: generateId(),
      idempotencyKey,
      linkedActionId: input.linkedActionId ?? null,
      linkedEterisTransactionId: input.linkedEterisTransactionId ?? null,
      reason,
      targetId: input.targetId,
      targetKind: input.targetKind,
      version: input.version,
      ...targetReference(input.targetKind, input.targetId),
    })
    .returning();
  if (!created) {
    throw new CollectibleAdminActionError(
      "INVALID_ACTION",
      "No se pudo guardar la auditoría administrativa."
    );
  }
  return resultFromRow(created, false);
}

export const recordCollectibleAdminAction = appendCollectibleAdminAction;

export type CollectibleAdminAuditCursor = {
  createdAt: Date;
  id: string;
};

export function encodeCollectibleAdminAuditCursor(
  cursor: CollectibleAdminAuditCursor
) {
  return Buffer.from(`${cursor.createdAt.toISOString()}|${cursor.id}`).toString(
    "base64url"
  );
}

export function decodeCollectibleAdminAuditCursor(
  value: string | undefined
): CollectibleAdminAuditCursor | null {
  if (!value) {
    return null;
  }
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf-8");
    const separator = decoded.lastIndexOf("|");
    if (separator <= 0) {
      return null;
    }
    const createdAt = new Date(decoded.slice(0, separator));
    const id = decoded.slice(separator + 1);
    if (Number.isNaN(createdAt.getTime()) || !id) {
      return null;
    }
    return { createdAt, id };
  } catch {
    return null;
  }
}

export type CollectibleAdminAuditListInput = {
  action?: CollectibleAdminActionKind;
  cursor?: string;
  limit?: number;
  targetId?: string;
  targetKind?: CollectibleAdminTargetKind;
};

export type CollectibleAdminAuditItem = {
  action: CollectibleAdminActionKind;
  actionId: string;
  actorUserId: string | null;
  after: Record<string, unknown>;
  before: Record<string, unknown>;
  createdAt: string;
  expectedVersion: number | null;
  linkedActionId: string | null;
  linkedEterisTransactionId: string | null;
  reason: string;
  targetId: string;
  targetKind: CollectibleAdminTargetKind;
  version: number;
};

export async function listCollectibleAdminActions(
  db: Pick<Database, "select">,
  input: CollectibleAdminAuditListInput = {}
) {
  const limit = Math.max(1, Math.min(100, input.limit ?? 50));
  const cursor = decodeCollectibleAdminAuditCursor(input.cursor);
  const rows = await db
    .select()
    .from(collectibleAdminAction)
    .where(
      and(
        input.action
          ? eq(collectibleAdminAction.action, input.action)
          : undefined,
        input.targetId
          ? eq(collectibleAdminAction.targetId, input.targetId)
          : undefined,
        input.targetKind
          ? eq(collectibleAdminAction.targetKind, input.targetKind)
          : undefined,
        cursor
          ? or(
              lt(collectibleAdminAction.createdAt, cursor.createdAt),
              and(
                eq(collectibleAdminAction.createdAt, cursor.createdAt),
                lt(collectibleAdminAction.id, cursor.id)
              )
            )
          : undefined
      )
    )
    .orderBy(
      desc(collectibleAdminAction.createdAt),
      desc(collectibleAdminAction.id)
    )
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const items: CollectibleAdminAuditItem[] = page.map((row) => ({
    action: row.action as CollectibleAdminActionKind,
    actionId: row.id,
    actorUserId: row.actorUserId,
    after: sanitizeCollectibleAdminSnapshot(row.after),
    before: sanitizeCollectibleAdminSnapshot(row.before),
    createdAt: row.createdAt.toISOString(),
    expectedVersion: row.expectedVersion,
    linkedActionId: row.linkedActionId,
    linkedEterisTransactionId: row.linkedEterisTransactionId,
    reason: row.reason,
    targetId: row.targetId,
    targetKind: row.targetKind as CollectibleAdminTargetKind,
    version: row.version,
  }));
  const last = page.at(-1);
  return {
    items,
    nextCursor:
      rows.length > limit && last
        ? encodeCollectibleAdminAuditCursor({
            createdAt: last.createdAt,
            id: last.id,
          })
        : null,
  };
}

export const listCollectibleAdminAudit = listCollectibleAdminActions;
