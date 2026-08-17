import { env } from "@repo/env";
import {
  normalizeCollectiblePayload,
  recordCollectibleMetric,
} from "@repo/shared/collectibles";
import type {
  CollectibleErrorCode,
  CollectibleMetricSink,
} from "@repo/shared/collectibles";

export type CollectibleOperationKind =
  | "audit"
  | "mutation"
  | "preview"
  | "read";

export class CollectibleKernelError extends Error {
  readonly code: CollectibleErrorCode;

  constructor(code: CollectibleErrorCode, message: string = code) {
    super(message);
    this.name = "CollectibleKernelError";
    this.code = code;
  }
}

export type CollectibleGatePolicy = {
  enabled: boolean;
  mutationAllowed: boolean;
  readAllowed: true;
};

export function getCollectibleGatePolicy(): CollectibleGatePolicy {
  const enabled = Boolean(env.COLLECTIBLES_ENABLED);
  return {
    enabled,
    mutationAllowed: enabled,
    readAllowed: true,
  };
}

export const getCollectiblesGatePolicy = getCollectibleGatePolicy;

export function assertCollectiblesMutationAllowed(input?: {
  impersonated?: boolean;
}) {
  if (input?.impersonated) {
    throw new CollectibleKernelError(
      "POLICY_BLOCKED",
      "Las mutaciones de coleccionables no están disponibles durante una suplantación."
    );
  }
  if (!env.COLLECTIBLES_ENABLED) {
    throw new CollectibleKernelError(
      "GATE_DISABLED",
      "El ecosistema de coleccionables no está disponible."
    );
  }
}

export const assertCollectibleMutationAllowed =
  assertCollectiblesMutationAllowed;

/**
 * Reads stay request-bound and available while the global gate is off. A
 * preview or audit operation must still carry the caller's explicit
 * authorization; this keeps an administrative read from becoming an
 * accidental mutation bypass.
 */
export function assertCollectiblesAccess(input: {
  authorized?: boolean;
  impersonated?: boolean;
  kind: CollectibleOperationKind;
}) {
  if (input.kind === "mutation") {
    assertCollectiblesMutationAllowed({ impersonated: input.impersonated });
    return;
  }
  if (
    (input.kind === "preview" || input.kind === "audit") &&
    !input.authorized
  ) {
    throw new CollectibleKernelError(
      "POLICY_BLOCKED",
      "No tienes autorización para consultar esta operación de coleccionables."
    );
  }
}

export const COLLECTIBLE_LOCK_PHASES = [
  "wallet",
  "account",
  "card-template-supply",
  "gachapon-machine",
  "pack-instance",
  "card-instance",
  "offer",
  "listing",
  "quota-projection",
] as const;
export type CollectibleLockPhase = (typeof COLLECTIBLE_LOCK_PHASES)[number];

export type CollectibleLockInput = {
  accountIds?: readonly string[];
  cardInstanceIds?: readonly string[];
  cardTemplateSupplyIds?: readonly string[];
  gachaponMachineIds?: readonly string[];
  listingIds?: readonly string[];
  offerIds?: readonly string[];
  packInstanceIds?: readonly string[];
  quotaProjectionIds?: readonly string[];
  walletIds?: readonly string[];
};

export type CollectibleLock = {
  id: string;
  kind: CollectibleLockPhase;
};

function stableIds(ids: readonly string[] | undefined) {
  return [...new Set(ids ? [...ids] : [])].toSorted((left, right) =>
    left.localeCompare(right)
  );
}

/**
 * All collectible commands use this order. Wallet IDs follow the existing
 * Eteris ledger rule; every later phase is sorted by its stable identifier.
 * Keeping this helper central prevents endpoint-specific lock orders and the
 * deadlocks they create under competing bundle operations.
 */
export function orderCollectibleLocks(
  input: CollectibleLockInput
): CollectibleLock[] {
  const phases: [CollectibleLockPhase, readonly string[] | undefined][] = [
    ["wallet", input.walletIds],
    ["account", input.accountIds],
    ["card-template-supply", input.cardTemplateSupplyIds],
    ["gachapon-machine", input.gachaponMachineIds],
    ["pack-instance", input.packInstanceIds],
    ["card-instance", input.cardInstanceIds],
    ["offer", input.offerIds],
    ["listing", input.listingIds],
    ["quota-projection", input.quotaProjectionIds],
  ];

  return phases.flatMap(([kind, ids]) =>
    stableIds(ids).map((id) => ({ id, kind }))
  );
}

export const getCollectibleLockOrder = orderCollectibleLocks;

export type CollectibleIdempotencyRecord<
  T extends object = Record<string, unknown>,
> = {
  fingerprint: string;
  result: T;
};

export type CollectibleTransaction = {
  transaction<T>(
    callback: (tx: CollectibleTransaction) => Promise<T>
  ): Promise<T>;
  getIdempotencyRecord<T extends object = Record<string, unknown>>(
    scope: string,
    idempotencyKey: string
  ): CollectibleIdempotencyRecord<T> | undefined;
  insertUnique(namespace: string, key: string, value: unknown): void;
  lockRows(input: CollectibleLockInput): Promise<CollectibleLock[]>;
  reserveAsset(assetId: string): void;
  saveIdempotencyRecord<T extends object>(
    scope: string,
    idempotencyKey: string,
    record: CollectibleIdempotencyRecord<T>
  ): void;
  transfer(fromWalletId: string, toWalletId: string, amount: bigint): void;
};

export type CollectibleTransactionRunner = {
  transaction<T>(
    callback: (tx: CollectibleTransaction) => Promise<T>
  ): Promise<T>;
};

export type CollectibleCommand<T extends object> = {
  idempotencyKey: string;
  impersonated?: boolean;
  locks?: CollectibleLockInput;
  metrics?: CollectibleMetricSink;
  payload: unknown;
  run: (tx: CollectibleTransaction) => Promise<T> | T;
  scope: string;
};

function isDeadlockError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as { code?: unknown; sqlState?: unknown };
  return candidate.code === "40P01" || candidate.sqlState === "40P01";
}

export type CollectibleRetryOptions = {
  maxRetries?: number;
  metrics?: CollectibleMetricSink;
  operation?: string;
};

let deadlockRetryCount = 0;

/** Process-local counter used alongside durable aggregate dashboard metrics. */
export function getCollectibleRuntimeMetrics() {
  return { deadlockRetryCount };
}

/**
 * Retries only PostgreSQL deadlocks, with a bounded attempt count.  Callers
 * keep the command idempotency key stable across attempts; no outcome data is
 * included in the metric event.
 */
export async function withCollectibleDeadlockRetry<T>(
  operation: () => Promise<T>,
  options: CollectibleRetryOptions = {}
) {
  const maxRetries = Math.max(0, Math.min(5, options.maxRetries ?? 2));
  for (let retry = 0; ; retry += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isDeadlockError(error) || retry >= maxRetries) {
        throw error;
      }
      deadlockRetryCount += 1;
      recordCollectibleMetric(options.metrics, {
        name: "deadlock_retry",
        operation: options.operation,
        retry: retry + 1,
      });
    }
  }
}

/**
 * Shared application-service seam for future cards, packs, market, trade,
 * and gift commands. The router owns validation/authorization; this seam owns
 * transactional replay handling and gives every command one place to enforce
 * the gate before it changes authoritative state.
 */
export function executeCollectibleCommand<T extends object>(
  runner: CollectibleTransactionRunner,
  input: CollectibleCommand<T>
): Promise<T & { replayed: boolean }> {
  const idempotencyKey = input.idempotencyKey.trim();
  const fingerprint = normalizeCollectiblePayload(input.payload);
  return runner.transaction(async (tx) => {
    await tx.lockRows(input.locks ?? {});
    const replay = tx.getIdempotencyRecord<T>(input.scope, idempotencyKey);
    if (replay) {
      if (replay.fingerprint !== fingerprint) {
        recordCollectibleMetric(input.metrics, {
          name: "idempotency_conflict",
          operation: input.scope,
        });
        throw new CollectibleKernelError(
          "IDEMPOTENCY_CONFLICT",
          "La clave de idempotencia ya fue usada con datos diferentes."
        );
      }
      return { ...replay.result, replayed: true };
    }

    assertCollectiblesMutationAllowed({ impersonated: input.impersonated });
    const result = await input.run(tx);
    const committed = { ...result, replayed: false };
    tx.saveIdempotencyRecord(input.scope, idempotencyKey, {
      fingerprint,
      result: committed,
    });
    return committed;
  });
}

export function createCollectibleApplicationService(
  runner: CollectibleTransactionRunner
) {
  return {
    execute<T extends object>(input: CollectibleCommand<T>) {
      return executeCollectibleCommand(runner, input);
    },
  };
}
