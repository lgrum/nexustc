import { randomInt } from "node:crypto";

import { and, asc, desc, eq, inArray, sql } from "@repo/db";
import type { db as database } from "@repo/db";
import {
  cardTemplate,
  gachaponActivation,
  gachaponMachine,
  gachaponMachineAuditEvent,
  gachaponMachinePackEntry,
  gachaponMachineUsage,
  packDrawGroup,
  packDrawGroupCardWeight,
  packRevision,
  packTemplate,
  user,
} from "@repo/db/schema/app";
import { generateId } from "@repo/db/utils";
import { env } from "@repo/env";
import {
  gachaponMachineDraftSchema,
  normalizeCollectiblePayload,
} from "@repo/shared/collectibles";
import type {
  CollectibleMetricSink,
  GachaponActivationResult,
  GachaponMachineDraft,
  GachaponMachineState,
  GachaponPublicEntry,
  GachaponPublicMachine,
} from "@repo/shared/collectibles";
import { ETERIS_MAX_AMOUNT, ETERIS_SYSTEM_WALLETS } from "@repo/shared/eteris";

import { isUserBanActive } from "../utils/user-ban";
import {
  appendCollectibleAdminAction,
  collectibleAdminActionFingerprint,
  getCollectibleAdminActionByIdempotencyKey,
} from "./collectible-admin-action";
import {
  CollectibleIssuanceError,
  issuePackInTransaction,
  runCollectibleIssuanceInTransaction,
} from "./collectible-issuance";
import {
  assertCollectiblesMutationAllowed,
  withCollectibleDeadlockRetry,
} from "./collectibles";
import {
  getOrCreateUserWalletInTransaction,
  lockEterisWalletsInTransaction,
  postEterisTransactionInTransaction,
} from "./eteris";
import { createUserNotification } from "./notification";
import { getPublishedPackTemplate } from "./pack-catalog";

type Database = typeof database;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const SINK_WALLET_ID = ETERIS_SYSTEM_WALLETS.find(
  ({ kind }) => kind === "sink"
)!.id;
const RANDOM_RANGE = 2 ** 32;

export type GachaponRandomSource = (() => number) | { next: () => number };

export type GachaponMachineCreateInput = Omit<GachaponMachineDraft, "cost"> & {
  actorUserId: string;
  cost: bigint | string;
  enabled?: boolean;
  reason: string;
};

export type GachaponMachineUpdateInput = Omit<GachaponMachineDraft, "cost"> & {
  actorUserId: string;
  cost: bigint | string;
  expectedVersion: number;
  machineId: string;
  reason: string;
};

export type GachaponMachineTransitionInput = {
  actorUserId: string;
  expectedVersion: number;
  idempotencyKey?: string;
  impersonated?: boolean;
  machineId: string;
  reason: string;
  state: Extract<GachaponMachineState, "active" | "paused" | "retired">;
};

export type GachaponActivationCommand = {
  actorUserId?: string;
  expectedCost: bigint | string;
  expectedMachineVersion?: number;
  expectedVersion?: number;
  idempotencyKey: string;
  impersonated?: boolean;
  metrics?: CollectibleMetricSink;
  now?: Date;
  random?: GachaponRandomSource;
  userId: string;
  machineId: string;
};

export type GachaponErrorCode =
  | "ACCOUNT_INELIGIBLE"
  | "ACTIVATION_NOT_FOUND"
  | "IDEMPOTENCY_CONFLICT"
  | "INSUFFICIENT_FUNDS"
  | "LIMIT_REACHED"
  | "MACHINE_EXPIRED"
  | "MACHINE_NOT_STARTED"
  | "MACHINE_UNAVAILABLE"
  | "QUOTA_EXHAUSTED"
  | "SPENDING_DISABLED"
  | "STALE_COST"
  | "STALE_VERSION"
  | "UNAVAILABLE"
  | "WALLET_BLOCKED";

export class GachaponError extends Error {
  readonly code: GachaponErrorCode;

  constructor(code: GachaponErrorCode, message: string) {
    super(message);
    this.name = "GachaponError";
    this.code = code;
  }
}

function secureRandomFraction() {
  // randomInt is backed by the platform CSPRNG.  The caller cannot provide
  // machine or pack outcomes through the RPC boundary.
  return randomInt(0, RANDOM_RANGE) / RANDOM_RANGE;
}

function nextRandom(source: GachaponRandomSource | undefined) {
  const value =
    typeof source === "function"
      ? source()
      : (source?.next() ?? secureRandomFraction());
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(0.999_999_999_999, value));
}

/**
 * Selects a Pack Template with an integer weighted boundary.  The random
 * source is injected only for deterministic service tests; production uses a
 * cryptographically secure source above.
 */
export function selectWeightedGachaponEntry<T extends { weight: number }>(
  entries: readonly T[],
  source?: GachaponRandomSource
): T | undefined {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (entries.length === 0 || total <= 0) {
    return undefined;
  }
  let cursor = nextRandom(source) * total;
  for (const entry of entries) {
    cursor -= entry.weight;
    if (cursor < 0) {
      return entry;
    }
  }
  return entries.at(-1);
}

function normalizeCost(value: bigint | string) {
  let cost: bigint;
  try {
    cost = typeof value === "bigint" ? value : BigInt(value);
  } catch {
    throw new GachaponError(
      "UNAVAILABLE",
      "El coste de la máquina no es válido."
    );
  }
  if (cost <= 0n || cost > ETERIS_MAX_AMOUNT) {
    throw new GachaponError(
      "UNAVAILABLE",
      "El coste de la máquina no es válido."
    );
  }
  return cost;
}

function normalizeDraft(
  input: Omit<GachaponMachineDraft, "cost"> & { cost: bigint | string }
) {
  const parsed = gachaponMachineDraftSchema.parse({
    ...input,
    cost: String(input.cost),
  });
  return parsed;
}

function requireReason(reason: string) {
  const normalized = reason.trim();
  if (normalized.length < 3) {
    throw new GachaponError(
      "UNAVAILABLE",
      "Indica un motivo de al menos 3 caracteres."
    );
  }
  return normalized;
}

function machineSnapshot(
  machine: typeof gachaponMachine.$inferSelect,
  entries: readonly { packTemplateId: string; weight: number }[] = []
) {
  return {
    binding: machine.binding,
    cost: machine.cost.toString(),
    description: machine.description,
    endsAt: machine.endsAt?.toISOString() ?? null,
    entries: entries.map(({ packTemplateId, weight }) => ({
      packTemplateId,
      weight,
    })),
    globalQuota: machine.globalQuota,
    name: machine.name,
    perAccountLimit: machine.perAccountLimit,
    startsAt: machine.startsAt?.toISOString() ?? null,
    state: machine.state,
    totalActivations: machine.totalActivations,
    version: machine.version,
  };
}

function serializeMachine(
  machine: typeof gachaponMachine.$inferSelect,
  entries: readonly { packTemplateId: string; weight: number }[]
) {
  return {
    ...machine,
    cost: machine.cost.toString(),
    endsAt: machine.endsAt?.toISOString() ?? null,
    entries: entries.map(({ packTemplateId, weight }) => ({
      packTemplateId,
      weight,
    })),
    startsAt: machine.startsAt?.toISOString() ?? null,
  };
}

function loadMachineEntries(
  tx: Pick<Transaction, "select">,
  machineId: string,
  lock = false
) {
  const query = tx
    .select({
      id: gachaponMachinePackEntry.id,
      machineId: gachaponMachinePackEntry.machineId,
      packTemplateId: gachaponMachinePackEntry.packTemplateId,
      weight: gachaponMachinePackEntry.weight,
    })
    .from(gachaponMachinePackEntry)
    .where(eq(gachaponMachinePackEntry.machineId, machineId))
    .orderBy(asc(gachaponMachinePackEntry.packTemplateId));
  return lock ? query.for("update") : query;
}

async function assertPackTemplatesExist(
  tx: Pick<Transaction, "query">,
  entries: readonly { packTemplateId: string }[]
) {
  const ids = [...new Set(entries.map(({ packTemplateId }) => packTemplateId))];
  const templates = await Promise.all(
    ids.map((id) =>
      tx.query.packTemplate.findFirst({
        columns: { id: true, lifecycle: true },
        where: eq(packTemplate.id, id),
      })
    )
  );
  if (
    templates.some((template) => !template || template.lifecycle === "retired")
  ) {
    throw new GachaponError(
      "UNAVAILABLE",
      "Una máquina no puede incluir un Pack Template retirado o inexistente."
    );
  }
}

async function recordMachineAudit(
  tx: Pick<Transaction, "insert">,
  input: {
    action: (typeof gachaponMachineAuditEvent.$inferInsert)["action"];
    actorUserId: string;
    after: Record<string, unknown> | null;
    before: Record<string, unknown> | null;
    machineId: string;
    reason: string;
    version: number;
  }
) {
  await tx.insert(gachaponMachineAuditEvent).values({
    action: input.action,
    actorUserId: input.actorUserId,
    after: input.after,
    before: input.before,
    machineId: input.machineId,
    reason: input.reason,
    version: input.version,
  });
}

export function createGachaponMachine(
  db: Database,
  input: GachaponMachineCreateInput
) {
  assertCollectiblesMutationAllowed();
  const reason = requireReason(input.reason);
  const parsed = normalizeDraft(input);
  return db.transaction(async (tx) => {
    await assertPackTemplatesExist(tx, parsed.entries);
    const now = new Date();
    const [created] = await tx
      .insert(gachaponMachine)
      .values({
        binding: parsed.binding,
        cost: parsed.cost,
        createdByUserId: input.actorUserId,
        description: parsed.description,
        endsAt: parsed.endsAt ?? null,
        globalQuota: parsed.globalQuota ?? null,
        name: parsed.name,
        perAccountLimit: parsed.perAccountLimit ?? null,
        startsAt: parsed.startsAt ?? null,
        state: "draft",
        updatedByUserId: input.actorUserId,
        updatedAt: now,
      })
      .returning();
    if (!created) {
      throw new Error("No se pudo crear la máquina.");
    }
    const entries = parsed.entries.map((entry) => ({
      machineId: created.id,
      packTemplateId: entry.packTemplateId,
      weight: entry.weight,
    }));
    await tx.insert(gachaponMachinePackEntry).values(entries);
    await recordMachineAudit(tx, {
      action: "create",
      actorUserId: input.actorUserId,
      after: machineSnapshot(created, entries),
      before: null,
      machineId: created.id,
      reason,
      version: created.version,
    });
    return serializeMachine(created, entries);
  });
}

export function updateGachaponMachine(
  db: Database,
  input: GachaponMachineUpdateInput
) {
  assertCollectiblesMutationAllowed();
  const reason = requireReason(input.reason);
  const parsed = normalizeDraft(input);
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(gachaponMachine)
      .where(eq(gachaponMachine.id, input.machineId))
      .for("update");
    if (!current) {
      throw new GachaponError("MACHINE_UNAVAILABLE", "La máquina no existe.");
    }
    if (current.version !== input.expectedVersion) {
      throw new GachaponError(
        "STALE_VERSION",
        "La máquina cambió. Recarga antes de guardarla."
      );
    }
    const currentEntries = await loadMachineEntries(tx, current.id);
    const nextEntries = parsed.entries.map(({ packTemplateId, weight }) => ({
      packTemplateId,
      weight,
    }));
    const currentEntryPayload = currentEntries.map(
      ({ packTemplateId, weight }) => ({
        packTemplateId,
        weight,
      })
    );
    const entriesChanged =
      normalizeCollectiblePayload(currentEntryPayload) !==
      normalizeCollectiblePayload(nextEntries);
    if (current.state !== "draft" && entriesChanged) {
      throw new GachaponError(
        "UNAVAILABLE",
        "Los pesos y el pool son inmutables después de activar la máquina."
      );
    }
    await assertPackTemplatesExist(tx, parsed.entries);
    const now = new Date();
    const [updated] = await tx
      .update(gachaponMachine)
      .set({
        binding: parsed.binding,
        cost: parsed.cost,
        description: parsed.description,
        endsAt: parsed.endsAt ?? null,
        globalQuota: parsed.globalQuota ?? null,
        name: parsed.name,
        perAccountLimit: parsed.perAccountLimit ?? null,
        startsAt: parsed.startsAt ?? null,
        updatedAt: now,
        updatedByUserId: input.actorUserId,
        version: current.version + 1,
      })
      .where(
        and(
          eq(gachaponMachine.id, current.id),
          eq(gachaponMachine.version, input.expectedVersion)
        )
      )
      .returning();
    if (!updated) {
      throw new GachaponError(
        "STALE_VERSION",
        "La máquina cambió. Recarga antes de guardarla."
      );
    }
    if (current.state === "draft" && entriesChanged) {
      await tx
        .delete(gachaponMachinePackEntry)
        .where(eq(gachaponMachinePackEntry.machineId, current.id));
      await tx
        .insert(gachaponMachinePackEntry)
        .values(
          nextEntries.map((entry) => ({ ...entry, machineId: current.id }))
        );
    }
    await recordMachineAudit(tx, {
      action: "update",
      actorUserId: input.actorUserId,
      after: machineSnapshot(updated, nextEntries),
      before: machineSnapshot(current, currentEntries),
      machineId: current.id,
      reason,
      version: updated.version,
    });
    return serializeMachine(updated, nextEntries);
  });
}

export function transitionGachaponMachine(
  db: Database,
  input: GachaponMachineTransitionInput
) {
  assertCollectiblesMutationAllowed({ impersonated: input.impersonated });
  const reason = requireReason(input.reason);
  return db.transaction(async (tx) => {
    const adminAction =
      input.state === "paused"
        ? "freeze"
        : input.state === "active"
          ? "restore"
          : "retire";
    const [current] = await tx
      .select()
      .from(gachaponMachine)
      .where(eq(gachaponMachine.id, input.machineId))
      .for("update");
    if (!current) {
      throw new GachaponError("MACHINE_UNAVAILABLE", "La máquina no existe.");
    }
    if (input.idempotencyKey) {
      const existing = await getCollectibleAdminActionByIdempotencyKey(
        tx,
        input.idempotencyKey
      );
      if (existing) {
        const fingerprint = collectibleAdminActionFingerprint({
          action: adminAction,
          actorUserId: input.actorUserId,
          expectedVersion: input.expectedVersion,
          idempotencyKey: input.idempotencyKey,
          reason,
          targetId: current.id,
          targetKind: "gachapon-machine",
          version: input.expectedVersion + 1,
        });
        if (existing.fingerprint !== fingerprint) {
          throw new GachaponError(
            "IDEMPOTENCY_CONFLICT",
            "La clave de transición ya fue usada con otros términos."
          );
        }
        const after = existing.after as { state?: GachaponMachineState };
        return {
          ...serializeMachine(
            current,
            await loadMachineEntries(tx, current.id)
          ),
          state: after.state ?? current.state,
          version: existing.version,
        };
      }
    }
    if (current.version !== input.expectedVersion) {
      throw new GachaponError(
        "STALE_VERSION",
        "La máquina cambió. Recarga antes de continuar."
      );
    }
    const validTransition =
      (current.state === "draft" &&
        (input.state === "active" || input.state === "retired")) ||
      (current.state === "active" &&
        (input.state === "paused" || input.state === "retired")) ||
      (current.state === "paused" &&
        (input.state === "active" || input.state === "retired")) ||
      (current.state === "exhausted" && input.state === "retired");
    if (!validTransition) {
      throw new GachaponError(
        "UNAVAILABLE",
        "La transición de estado de la máquina no está permitida."
      );
    }
    if (input.state === "active") {
      const entries = await loadMachineEntries(tx, current.id);
      if (entries.length === 0) {
        throw new GachaponError(
          "UNAVAILABLE",
          "La máquina necesita al menos un Pack Template."
        );
      }
    }
    const action =
      input.state === "active"
        ? current.state === "paused"
          ? "resume"
          : "activate"
        : input.state === "paused"
          ? "pause"
          : "retire";
    const [updated] = await tx
      .update(gachaponMachine)
      .set({
        state: input.state,
        updatedAt: new Date(),
        updatedByUserId: input.actorUserId,
        version: current.version + 1,
      })
      .where(
        and(
          eq(gachaponMachine.id, current.id),
          eq(gachaponMachine.version, input.expectedVersion)
        )
      )
      .returning();
    if (!updated) {
      throw new GachaponError(
        "STALE_VERSION",
        "La máquina cambió. Recarga antes de continuar."
      );
    }
    const entries = await loadMachineEntries(tx, current.id);
    await recordMachineAudit(tx, {
      action,
      actorUserId: input.actorUserId,
      after: machineSnapshot(updated, entries),
      before: machineSnapshot(current, entries),
      machineId: current.id,
      reason,
      version: updated.version,
    });
    if (input.idempotencyKey) {
      await appendCollectibleAdminAction(tx, {
        action: adminAction,
        actorUserId: input.actorUserId,
        after: { state: updated.state },
        before: { state: current.state },
        expectedVersion: input.expectedVersion,
        idempotencyKey: input.idempotencyKey,
        reason,
        targetId: current.id,
        targetKind: "gachapon-machine",
        version: updated.version,
      });
    }
    return serializeMachine(updated, entries);
  });
}

async function lockGachaponSupply(
  tx: Transaction,
  packTemplateIds: readonly string[]
) {
  const ids = [...new Set(packTemplateIds)].toSorted();
  if (ids.length === 0) {
    return new Map<string, typeof packTemplate.$inferSelect>();
  }
  const templates = await tx
    .select()
    .from(packTemplate)
    .where(inArray(packTemplate.id, ids))
    .orderBy(asc(packTemplate.id))
    .for("update");
  const revisions = templates
    .map(({ latestPublishedRevisionId }) => latestPublishedRevisionId)
    .filter((id): id is string => Boolean(id));
  if (revisions.length > 0) {
    await tx
      .select({ id: packRevision.id, templateId: packRevision.templateId })
      .from(packRevision)
      .where(inArray(packRevision.id, revisions))
      .orderBy(asc(packRevision.id))
      .for("update");
    const groups = await tx
      .select({ id: packDrawGroup.id })
      .from(packDrawGroup)
      .where(inArray(packDrawGroup.revisionId, revisions))
      .orderBy(asc(packDrawGroup.id))
      .for("update");
    const groupIds = groups.map(({ id }) => id);
    if (groupIds.length > 0) {
      const weights = await tx
        .select({ cardTemplateId: packDrawGroupCardWeight.cardTemplateId })
        .from(packDrawGroupCardWeight)
        .where(inArray(packDrawGroupCardWeight.drawGroupId, groupIds))
        .orderBy(asc(packDrawGroupCardWeight.cardTemplateId))
        .for("update");
      const cardIds = [
        ...new Set(weights.map(({ cardTemplateId }) => cardTemplateId)),
      ].toSorted();
      if (cardIds.length > 0) {
        await tx
          .select({ id: cardTemplate.id })
          .from(cardTemplate)
          .where(inArray(cardTemplate.id, cardIds))
          .orderBy(asc(cardTemplate.id))
          .for("update");
      }
    }
  }
  return new Map(templates.map((template) => [template.id, template]));
}

function assertActivationWindow(
  machine: typeof gachaponMachine.$inferSelect,
  now: Date
) {
  if (machine.state === "paused" || machine.state === "retired") {
    throw new GachaponError(
      "MACHINE_UNAVAILABLE",
      "La máquina está pausada o retirada."
    );
  }
  if (machine.state === "exhausted") {
    throw new GachaponError(
      "QUOTA_EXHAUSTED",
      "La máquina ya agotó sus activaciones."
    );
  }
  if (machine.state !== "active") {
    throw new GachaponError(
      "MACHINE_UNAVAILABLE",
      "La máquina todavía no está activa."
    );
  }
  if (machine.startsAt && machine.startsAt > now) {
    throw new GachaponError(
      "MACHINE_NOT_STARTED",
      "La máquina todavía no está disponible."
    );
  }
  if (machine.endsAt && machine.endsAt <= now) {
    throw new GachaponError(
      "MACHINE_EXPIRED",
      "El periodo de la máquina ya terminó."
    );
  }
  if (
    machine.globalQuota !== null &&
    machine.totalActivations >= machine.globalQuota
  ) {
    throw new GachaponError(
      "QUOTA_EXHAUSTED",
      "La máquina agotó su cupo global."
    );
  }
}

function activationFingerprint(input: {
  expectedCost: bigint;
  expectedMachineVersion: number;
  machineId: string;
  userId: string;
}) {
  return normalizeCollectiblePayload(input);
}

function activationResult(
  row: typeof gachaponActivation.$inferSelect,
  replayed: boolean
): GachaponActivationResult {
  return {
    activationId: row.id,
    chargedCost: row.chargedCost.toString(),
    machineId: row.machineId,
    packInstanceId: row.packInstanceId,
    replayed,
    revisionId: row.revisionId,
    templateId: row.packTemplateId,
    transactionId: row.eterisTransactionId,
  };
}

function resolveActivationReplay(
  row: typeof gachaponActivation.$inferSelect,
  input: {
    expectedCost: bigint;
    expectedMachineVersion: number;
    machineId: string;
    userId: string;
  },
  fingerprint: string
) {
  if (
    row.machineId !== input.machineId ||
    row.userId !== input.userId ||
    row.chargedCost !== input.expectedCost ||
    row.machineVersion !== input.expectedMachineVersion ||
    row.fingerprint !== fingerprint
  ) {
    throw new GachaponError(
      "IDEMPOTENCY_CONFLICT",
      "La clave de activación ya fue usada para otra operación."
    );
  }
  return activationResult(row, true);
}

function retryableIssuanceFailure(error: unknown) {
  return (
    error instanceof CollectibleIssuanceError &&
    [
      "EXHAUSTED_SUPPLY",
      "IMPOSSIBLE_GUARANTEE",
      "INVALID_BINDING",
      "UNAVAILABLE",
    ].includes(error.code)
  );
}

function throwGachaponIssuanceError(error: unknown): never {
  if (error instanceof CollectibleIssuanceError) {
    throw new GachaponError(
      "UNAVAILABLE",
      "El Pack seleccionado no puede emitirse en este momento."
    );
  }
  throw error;
}

async function markMachineExhausted(
  tx: Transaction,
  machine: typeof gachaponMachine.$inferSelect,
  actorUserId: string,
  reason: string
) {
  if (machine.state === "exhausted") {
    return;
  }
  const [updated] = await tx
    .update(gachaponMachine)
    .set({
      state: "exhausted",
      updatedAt: new Date(),
      updatedByUserId: actorUserId,
      version: sql`${gachaponMachine.version} + 1`,
    })
    .where(
      and(
        eq(gachaponMachine.id, machine.id),
        eq(gachaponMachine.state, machine.state)
      )
    )
    .returning();
  if (updated) {
    const entries = await loadMachineEntries(tx, machine.id);
    await recordMachineAudit(tx, {
      action: "exhaust",
      actorUserId,
      after: machineSnapshot(updated, entries),
      before: machineSnapshot(machine, entries),
      machineId: machine.id,
      reason,
      version: updated.version,
    });
  }
}

export async function activateGachapon(
  db: Database,
  rawInput: GachaponActivationCommand
): Promise<GachaponActivationResult> {
  assertCollectiblesMutationAllowed({ impersonated: rawInput.impersonated });
  if (!(env.XP_ECONOMY_ENABLED && env.ETERIS_SPENDING_ENABLED)) {
    throw new GachaponError(
      "SPENDING_DISABLED",
      "Las activaciones de Gachapon con Eteris no están disponibles."
    );
  }
  const expectedCost = normalizeCost(rawInput.expectedCost);
  const expectedMachineVersion =
    rawInput.expectedMachineVersion ?? rawInput.expectedVersion;
  if (!expectedMachineVersion || expectedMachineVersion < 1) {
    throw new GachaponError(
      "STALE_VERSION",
      "Confirma la versión actual de la máquina antes de activar."
    );
  }
  const fingerprint = activationFingerprint({
    expectedCost,
    expectedMachineVersion,
    machineId: rawInput.machineId,
    userId: rawInput.userId,
  });
  let exhaustedFailure = false;
  const result = await withCollectibleDeadlockRetry(
    () =>
      db.transaction(async (tx) => {
        const replay = await tx.query.gachaponActivation.findFirst({
          where: eq(gachaponActivation.idempotencyKey, rawInput.idempotencyKey),
        });
        if (replay) {
          return resolveActivationReplay(
            replay,
            {
              expectedCost,
              expectedMachineVersion,
              machineId: rawInput.machineId,
              userId: rawInput.userId,
            },
            fingerprint
          );
        }
        const now = rawInput.now ?? new Date();
        const [account] = await tx
          .select({
            banExpires: user.banExpires,
            banned: user.banned,
            emailVerified: user.emailVerified,
            id: user.id,
          })
          .from(user)
          .where(eq(user.id, rawInput.userId))
          .for("update");
        if (
          !account ||
          !account.emailVerified ||
          account.banned ||
          isUserBanActive(account, now)
        ) {
          throw new GachaponError(
            "ACCOUNT_INELIGIBLE",
            "Tu cuenta no puede activar máquinas de coleccionables."
          );
        }

        // Global collectible lock order: wallet, all candidate supply rows,
        // machine, then account quota projection. Issuance and settlement stay
        // inside this same transaction and roll back together on any failure.
        const wallet = await getOrCreateUserWalletInTransaction(
          tx,
          rawInput.userId,
          now
        );
        const lockedWallets = await lockEterisWalletsInTransaction(tx, [
          SINK_WALLET_ID,
          wallet.id,
        ]);
        const lockedWallet = lockedWallets.find(
          ({ walletId }) => walletId === wallet.id
        );
        if (
          !lockedWallet ||
          lockedWallet.status !== "active" ||
          lockedWallet.balance < 0n
        ) {
          throw new GachaponError(
            "WALLET_BLOCKED",
            "Tu billetera no permite activar esta máquina."
          );
        }

        const candidateEntries = await loadMachineEntries(
          tx,
          rawInput.machineId
        );
        const supply = await lockGachaponSupply(
          tx,
          candidateEntries.map(({ packTemplateId }) => packTemplateId)
        );
        const [machine] = await tx
          .select()
          .from(gachaponMachine)
          .where(eq(gachaponMachine.id, rawInput.machineId))
          .for("update");
        if (!machine) {
          throw new GachaponError(
            "MACHINE_UNAVAILABLE",
            "La máquina no existe."
          );
        }
        const lockedReplay = await tx.query.gachaponActivation.findFirst({
          where: eq(gachaponActivation.idempotencyKey, rawInput.idempotencyKey),
        });
        if (lockedReplay) {
          return resolveActivationReplay(
            lockedReplay,
            {
              expectedCost,
              expectedMachineVersion,
              machineId: rawInput.machineId,
              userId: rawInput.userId,
            },
            fingerprint
          );
        }
        if (machine.version !== expectedMachineVersion) {
          throw new GachaponError(
            "STALE_VERSION",
            "La máquina cambió. Confirma nuevamente antes de activar."
          );
        }
        if (machine.cost !== expectedCost) {
          throw new GachaponError(
            "STALE_COST",
            "El coste cambió. Confirma nuevamente antes de activar."
          );
        }
        assertActivationWindow(machine, now);

        const entries = await loadMachineEntries(tx, machine.id, true);
        const usage = await tx
          .select()
          .from(gachaponMachineUsage)
          .where(
            and(
              eq(gachaponMachineUsage.machineId, machine.id),
              eq(gachaponMachineUsage.userId, rawInput.userId)
            )
          )
          .for("update");
        const accountActivations = usage[0]?.activationCount ?? 0;
        if (
          machine.perAccountLimit !== null &&
          accountActivations >= machine.perAccountLimit
        ) {
          throw new GachaponError(
            "LIMIT_REACHED",
            "Tu cuenta alcanzó el límite de activaciones de esta máquina."
          );
        }

        const latestRevisionIds = [
          ...new Set(
            entries
              .map(
                (entry) =>
                  supply.get(entry.packTemplateId)?.latestPublishedRevisionId
              )
              .filter((id): id is string => Boolean(id))
          ),
        ];
        const latestRevisions =
          latestRevisionIds.length === 0
            ? []
            : await tx
                .select({
                  availability: packRevision.availability,
                  id: packRevision.id,
                  lifecycle: packRevision.lifecycle,
                  templateId: packRevision.templateId,
                })
                .from(packRevision)
                .where(inArray(packRevision.id, latestRevisionIds))
                .orderBy(asc(packRevision.id))
                .for("update");
        const revisionById = new Map(
          latestRevisions.map((revision) => [revision.id, revision])
        );
        const availableEntries = entries.filter((entry) => {
          const template = supply.get(entry.packTemplateId);
          const revision = template?.latestPublishedRevisionId
            ? revisionById.get(template.latestPublishedRevisionId)
            : undefined;
          return Boolean(
            template &&
            template.lifecycle === "active" &&
            revision &&
            revision.templateId === template.id &&
            revision.lifecycle === "published" &&
            revision.availability === "active"
          );
        });
        if (availableEntries.length === 0) {
          await markMachineExhausted(
            tx,
            machine,
            rawInput.actorUserId ?? rawInput.userId,
            "Ningún Pack Template ponderado puede emitir un Pack."
          );
          exhaustedFailure = true;
          return;
        }

        let issued:
          | Awaited<ReturnType<typeof issuePackInTransaction>>
          | undefined;
        let remainingEntries = [...availableEntries];
        while (remainingEntries.length > 0 && !issued) {
          const selected = selectWeightedGachaponEntry(
            remainingEntries,
            rawInput.random
          );
          if (!selected) {
            break;
          }
          remainingEntries = remainingEntries.filter(
            ({ packTemplateId }) => packTemplateId !== selected.packTemplateId
          );
          try {
            issued = await runCollectibleIssuanceInTransaction(tx, (nestedTx) =>
              issuePackInTransaction(nestedTx, {
                actorUserId: rawInput.actorUserId ?? rawInput.userId,
                binding: machine.binding,
                issueReference: `gachapon:${rawInput.idempotencyKey}`,
                issueSource: "gachapon",
                metrics: rawInput.metrics,
                now,
                ownerUserId: rawInput.userId,
                packTemplateId: selected.packTemplateId,
                random: rawInput.random,
              })
            );
          } catch (error) {
            if (!retryableIssuanceFailure(error)) {
              throwGachaponIssuanceError(error);
            }
          }
        }
        if (!issued) {
          await markMachineExhausted(
            tx,
            machine,
            rawInput.actorUserId ?? rawInput.userId,
            "Ningún Pack Template ponderado puede emitir un Pack."
          );
          exhaustedFailure = true;
          return;
        }

        const settlement = await postEterisTransactionInTransaction(tx, {
          actorUserId: rawInput.actorUserId ?? rawInput.userId,
          createdAt: now,
          idempotencyKey: `gacha:${rawInput.idempotencyKey}`,
          kind: "gacha",
          metadata: {
            chargedCost: machine.cost.toString(),
            gachaponMachineId: machine.id,
            packTemplateId: issued.templateId,
          },
          postings: [
            { amount: -machine.cost, walletId: wallet.id },
            { amount: machine.cost, walletId: SINK_WALLET_ID },
          ],
          sourceModule: "commerce",
          sourceRef: `gachapon:${machine.id}`,
          spending: true,
        });
        if ("mismatched" in settlement || settlement.replayed) {
          throw new GachaponError(
            "IDEMPOTENCY_CONFLICT",
            "La clave de activación ya fue usada para otra operación."
          );
        }

        const activationId = generateId();
        await tx.insert(gachaponActivation).values({
          chargedCost: machine.cost,
          createdAt: now,
          eterisTransactionId: settlement.id,
          fingerprint,
          id: activationId,
          idempotencyKey: rawInput.idempotencyKey,
          machineId: machine.id,
          machineVersion: machine.version,
          packInstanceId: issued.packInstanceId,
          packTemplateId: issued.templateId,
          revisionId: issued.revisionId,
          userId: rawInput.userId,
        });
        await (usage[0]
          ? tx
              .update(gachaponMachineUsage)
              .set({
                activationCount: accountActivations + 1,
                updatedAt: now,
              })
              .where(
                and(
                  eq(gachaponMachineUsage.machineId, machine.id),
                  eq(gachaponMachineUsage.userId, rawInput.userId)
                )
              )
          : tx.insert(gachaponMachineUsage).values({
              activationCount: 1,
              machineId: machine.id,
              updatedAt: now,
              userId: rawInput.userId,
            }));
        const reachesGlobalQuota =
          machine.globalQuota !== null &&
          machine.totalActivations + 1 >= machine.globalQuota;
        const [updatedMachine] = await tx
          .update(gachaponMachine)
          .set({
            state: reachesGlobalQuota ? "exhausted" : "active",
            totalActivations: machine.totalActivations + 1,
            updatedAt: now,
            version: machine.version + 1,
          })
          .where(
            and(
              eq(gachaponMachine.id, machine.id),
              eq(gachaponMachine.version, machine.version)
            )
          )
          .returning();
        if (!updatedMachine) {
          throw new GachaponError(
            "STALE_VERSION",
            "La máquina cambió mientras se completaba la activación."
          );
        }
        if (reachesGlobalQuota) {
          await recordMachineAudit(tx, {
            action: "exhaust",
            actorUserId: rawInput.actorUserId ?? rawInput.userId,
            after: machineSnapshot(updatedMachine, entries),
            before: machineSnapshot(machine, entries),
            machineId: machine.id,
            reason: "El cupo global de activaciones se agotó.",
            version: updatedMachine.version,
          });
        }
        return activationResult(
          {
            ...machine,
            chargedCost: machine.cost,
            eterisTransactionId: settlement.id,
            fingerprint,
            id: activationId,
            idempotencyKey: rawInput.idempotencyKey,
            machineId: machine.id,
            machineVersion: machine.version,
            packInstanceId: issued.packInstanceId,
            packTemplateId: issued.templateId,
            revisionId: issued.revisionId,
            userId: rawInput.userId,
            userWalletId: null,
          } as typeof gachaponActivation.$inferSelect,
          false
        );
      }),
    { metrics: rawInput.metrics, operation: "gacha.activate" }
  );
  if (exhaustedFailure || !result) {
    throw new GachaponError(
      "QUOTA_EXHAUSTED",
      "La máquina no tiene ningún Pack disponible para emitir."
    );
  }
  if (!result.replayed) {
    await deliverGachaponActivationNotification(db, {
      activationId: result.activationId,
      machineId: result.machineId,
      transactionId: result.transactionId,
      userId: rawInput.userId,
    }).catch(() => null);
  }
  return result;
}

/**
 * Deliver activation feedback only after the issuance, ledger settlement, and
 * activation record have committed. The notification deliberately contains
 * no Pack/Card identity or outcome, so it cannot disclose unopened contents.
 */
export function deliverGachaponActivationNotification(
  db: Database,
  result: Pick<
    GachaponActivationResult,
    "activationId" | "machineId" | "transactionId"
  > & { userId?: string }
) {
  const recipient = result.userId
    ? Promise.resolve({ userId: result.userId })
    : db.query.gachaponActivation.findFirst({
        columns: { userId: true },
        where: eq(gachaponActivation.id, result.activationId),
      });
  return recipient.then((activation) => {
    if (!activation?.userId) {
      return null;
    }
    return createUserNotification(db, {
      dedupeKey: `gachapon-activation:${result.activationId}`,
      description:
        "La activación quedó registrada y tu Pack está en tu inventario.",
      metadata: {
        activationId: result.activationId,
        category: "collectible_acquisition",
        machineId: result.machineId,
        quantity: 1,
        transactionId: result.transactionId,
      },
      targetUserId: activation.userId,
      title: "Activación de Gachapon confirmada",
    });
  });
}

/** Retry hook for an operator/worker after a transient notification failure. */
export async function retryGachaponActivationNotification(
  db: Database,
  activationId: string
) {
  assertCollectiblesMutationAllowed();
  const activation = await db.query.gachaponActivation.findFirst({
    where: eq(gachaponActivation.id, activationId),
  });
  if (!activation) {
    throw new GachaponError(
      "ACTIVATION_NOT_FOUND",
      "La activación de Gachapon no existe."
    );
  }
  return deliverGachaponActivationNotification(db, {
    activationId: activation.id,
    machineId: activation.machineId,
    transactionId: activation.eterisTransactionId,
    userId: activation.userId ?? undefined,
  });
}

async function publicMachineEntry(
  db: Pick<Database, "select">,
  entry: { packTemplateId: string }
): Promise<GachaponPublicEntry> {
  const pack = await getPublishedPackTemplate(db, entry.packTemplateId);
  return {
    available: pack?.lifecycle === "active",
    description: pack?.description ?? "",
    latestRevision: pack?.revision ?? null,
    name: pack?.name ?? "Pack no disponible",
    packTemplateId: entry.packTemplateId,
  };
}

function publicAvailability(
  machine: typeof gachaponMachine.$inferSelect,
  entries: readonly GachaponPublicEntry[],
  now: Date
): GachaponPublicMachine["availability"] {
  if (machine.state === "paused") {
    return "paused";
  }
  if (machine.state === "exhausted") {
    return "exhausted";
  }
  if (machine.startsAt && machine.startsAt > now) {
    return "scheduled";
  }
  if (machine.endsAt && machine.endsAt <= now) {
    return "exhausted";
  }
  if (
    machine.globalQuota !== null &&
    machine.totalActivations >= machine.globalQuota
  ) {
    return "exhausted";
  }
  return entries.some(({ available }) => available)
    ? "available"
    : "unavailable";
}

export async function listActiveGachaponMachines(
  db: Pick<Database, "select">,
  now = new Date()
): Promise<GachaponPublicMachine[]> {
  const rows = await db
    .select()
    .from(gachaponMachine)
    .where(inArray(gachaponMachine.state, ["active", "paused", "exhausted"]))
    .orderBy(asc(gachaponMachine.name), asc(gachaponMachine.id));
  const result: GachaponPublicMachine[] = [];
  for (const machine of rows) {
    if (machine.state === "draft") {
      continue;
    }
    const configuredEntries = await db
      .select({ packTemplateId: gachaponMachinePackEntry.packTemplateId })
      .from(gachaponMachinePackEntry)
      .where(eq(gachaponMachinePackEntry.machineId, machine.id))
      .orderBy(asc(gachaponMachinePackEntry.packTemplateId));
    const entries = await Promise.all(
      configuredEntries.map((entry) => publicMachineEntry(db, entry))
    );
    result.push({
      availability: publicAvailability(machine, entries, now),
      binding: machine.binding,
      cost: machine.cost.toString(),
      description: machine.description,
      endsAt: machine.endsAt?.toISOString() ?? null,
      entries,
      globalQuota: machine.globalQuota,
      id: machine.id,
      name: machine.name,
      perAccountLimit: machine.perAccountLimit,
      remainingGlobalActivations:
        machine.globalQuota === null
          ? null
          : Math.max(0, machine.globalQuota - machine.totalActivations),
      startsAt: machine.startsAt?.toISOString() ?? null,
      state: machine.state,
      version: machine.version,
    });
  }
  return result;
}

export async function getActiveGachaponMachine(
  db: Pick<Database, "select">,
  machineId: string,
  now = new Date()
) {
  const machines = await listActiveGachaponMachines(db, now);
  return machines.find((machine) => machine.id === machineId) ?? null;
}

export async function listGachaponMachinesForAdmin(
  db: Pick<Database, "select">,
  limit = 100
) {
  const rows = await db
    .select()
    .from(gachaponMachine)
    .orderBy(desc(gachaponMachine.updatedAt), desc(gachaponMachine.id))
    .limit(Math.max(1, Math.min(100, limit)));
  const result = [];
  for (const machine of rows) {
    const entries = await loadMachineEntries(db, machine.id);
    result.push(serializeMachine(machine, entries));
  }
  return result;
}

export async function listOwnGachaponActivations(
  db: Pick<Database, "select">,
  userId: string,
  limit = 50
) {
  const rows = await db
    .select({
      activationId: gachaponActivation.id,
      chargedCost: gachaponActivation.chargedCost,
      createdAt: gachaponActivation.createdAt,
      machineId: gachaponActivation.machineId,
      packInstanceId: gachaponActivation.packInstanceId,
      packTemplateId: gachaponActivation.packTemplateId,
      revisionId: gachaponActivation.revisionId,
      transactionId: gachaponActivation.eterisTransactionId,
    })
    .from(gachaponActivation)
    .where(eq(gachaponActivation.userId, userId))
    .orderBy(desc(gachaponActivation.createdAt), desc(gachaponActivation.id))
    .limit(Math.max(1, Math.min(100, limit)));
  return rows.map((row) => ({
    ...row,
    chargedCost: row.chargedCost.toString(),
  }));
}

export async function getGachaponActivation(
  db: Pick<Database, "query">,
  input: { activationId?: string; idempotencyKey?: string; userId: string }
) {
  const row = await db.query.gachaponActivation.findFirst({
    where: input.activationId
      ? and(
          eq(gachaponActivation.id, input.activationId),
          eq(gachaponActivation.userId, input.userId)
        )
      : input.idempotencyKey
        ? and(
            eq(gachaponActivation.idempotencyKey, input.idempotencyKey),
            eq(gachaponActivation.userId, input.userId)
          )
        : undefined,
  });
  return row ? activationResult(row, false) : null;
}
