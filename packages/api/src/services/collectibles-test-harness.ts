import { CollectibleKernelError, orderCollectibleLocks } from "./collectibles";
import type {
  CollectibleIdempotencyRecord,
  CollectibleLock,
  CollectibleLockInput,
  CollectibleTransaction,
  CollectibleTransactionRunner,
} from "./collectibles";

export type CollectiblePosting = {
  amount: bigint;
  walletId: string;
};

export type CollectibleUniqueConstraintError = Error & {
  code: "UNIQUE_CONSTRAINT";
  key: string;
  namespace: string;
};

function uniqueConstraintError(
  namespace: string,
  key: string
): CollectibleUniqueConstraintError {
  const error = new Error(
    `Unique value already exists for ${namespace}:${key}.`
  );
  error.name = "CollectibleUniqueConstraintError";
  return Object.assign(error, {
    code: "UNIQUE_CONSTRAINT" as const,
    key,
    namespace,
  });
}

type StoredIdempotencyRecord = CollectibleIdempotencyRecord<
  Record<string, unknown>
>;

export type CollectibleTransactionHarnessOptions = {
  balances?: Readonly<Record<string, bigint | number | string>>;
};

type HarnessSnapshot = {
  balances: Map<string, bigint>;
  custody: Set<string>;
  idempotency: Map<string, StoredIdempotencyRecord>;
  postings: CollectiblePosting[];
  unique: Map<string, unknown>;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function uniqueKey(namespace: string, key: string) {
  return `${namespace}:${key}`;
}

/**
 * A small stateful transaction model for application-service tests. It keeps
 * the authority in one state object and serializes transaction boundaries so
 * concurrent commands observe row-lock contention and rollback without a live
 * PostgreSQL, Redis, or R2 dependency.
 */
export class CollectibleTransactionHarness implements CollectibleTransactionRunner {
  readonly lockOrders: CollectibleLock[][] = [];
  readonly postings: CollectiblePosting[] = [];

  private readonly balances = new Map<string, bigint>();
  private readonly custody = new Set<string>();
  private readonly idempotency = new Map<string, StoredIdempotencyRecord>();
  private readonly unique = new Map<string, unknown>();
  private transactionTail = Promise.resolve();

  constructor(options: CollectibleTransactionHarnessOptions = {}) {
    for (const [walletId, balance] of Object.entries(options.balances ?? {})) {
      this.balances.set(walletId, BigInt(balance));
    }
  }

  getBalance(walletId: string) {
    return this.balances.get(walletId) ?? 0n;
  }

  hasCustody(assetId: string) {
    return this.custody.has(assetId);
  }

  getUnique(namespace: string, key: string) {
    return this.unique.get(uniqueKey(namespace, key));
  }

  private snapshot(): HarnessSnapshot {
    return {
      balances: new Map(this.balances),
      custody: new Set(this.custody),
      idempotency: new Map(
        [...this.idempotency].map(([key, record]) => [key, clone(record)])
      ),
      postings: this.postings.map((posting) => ({ ...posting })),
      unique: new Map(
        [...this.unique].map(([key, value]) => [key, clone(value)])
      ),
    };
  }

  private restore(snapshot: HarnessSnapshot) {
    this.balances.clear();
    for (const [key, value] of snapshot.balances) {
      this.balances.set(key, value);
    }
    this.custody.clear();
    for (const value of snapshot.custody) {
      this.custody.add(value);
    }
    this.idempotency.clear();
    for (const [key, value] of snapshot.idempotency) {
      this.idempotency.set(key, value);
    }
    this.unique.clear();
    for (const [key, value] of snapshot.unique) {
      this.unique.set(key, value);
    }
    this.postings.splice(0, this.postings.length, ...snapshot.postings);
  }

  async transaction<T>(
    callback: (tx: CollectibleTransaction) => Promise<T>
  ): Promise<T> {
    const previous = this.transactionTail;
    let release!: () => void;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    const snapshot = this.snapshot();
    const tx: CollectibleTransaction = {
      transaction: async <NestedResult>(
        nestedCallback: (
          nestedTx: CollectibleTransaction
        ) => Promise<NestedResult>
      ) => {
        const savepoint = this.snapshot();
        try {
          return await nestedCallback(tx);
        } catch (error) {
          this.restore(savepoint);
          throw error;
        }
      },
      getIdempotencyRecord: <R extends object = Record<string, unknown>>(
        scope: string,
        idempotencyKey: string
      ) => {
        const record = this.idempotency.get(
          uniqueKey(`idempotency:${scope}`, idempotencyKey)
        );
        return record
          ? (clone(record) as CollectibleIdempotencyRecord<R>)
          : undefined;
      },
      insertUnique: (namespace, key, value) => {
        const index = uniqueKey(namespace, key);
        if (this.unique.has(index)) {
          throw uniqueConstraintError(namespace, key);
        }
        this.unique.set(index, clone(value));
      },
      lockRows: (input: CollectibleLockInput) => {
        const plan = orderCollectibleLocks(input);
        this.lockOrders.push(plan);
        return Promise.resolve(plan);
      },
      reserveAsset: (assetId) => {
        if (this.custody.has(assetId)) {
          throw new CollectibleKernelError(
            "ACTIVE_CUSTODY",
            "El coleccionable ya está reservado por otra operación."
          );
        }
        this.custody.add(assetId);
        const index = uniqueKey("custody", assetId);
        if (this.unique.has(index)) {
          this.custody.delete(assetId);
          throw uniqueConstraintError("custody", assetId);
        }
        this.unique.set(index, assetId);
      },
      saveIdempotencyRecord: <R extends object>(
        scope: string,
        idempotencyKey: string,
        record: CollectibleIdempotencyRecord<R>
      ) => {
        const index = uniqueKey(`idempotency:${scope}`, idempotencyKey);
        if (this.idempotency.has(index)) {
          throw uniqueConstraintError(`idempotency:${scope}`, idempotencyKey);
        }
        this.idempotency.set(index, clone(record) as StoredIdempotencyRecord);
      },
      transfer: (fromWalletId, toWalletId, amount) => {
        if (amount <= 0n) {
          throw new RangeError("La transferencia debe ser positiva.");
        }
        const fromBalance = this.getBalance(fromWalletId);
        if (fromBalance < amount) {
          throw new CollectibleKernelError(
            "INSUFFICIENT_FUNDS",
            "Saldo insuficiente para el comando de coleccionables."
          );
        }
        this.balances.set(fromWalletId, fromBalance - amount);
        this.balances.set(toWalletId, this.getBalance(toWalletId) + amount);
        this.postings.push(
          { amount: -amount, walletId: fromWalletId },
          { amount, walletId: toWalletId }
        );
      },
    };

    try {
      return await callback(tx);
    } catch (error) {
      this.restore(snapshot);
      throw error;
    } finally {
      release();
    }
  }
}

export function createCollectibleTransactionHarness(
  options: CollectibleTransactionHarnessOptions = {}
) {
  return new CollectibleTransactionHarness(options);
}

export const CollectibleTransactionFake = CollectibleTransactionHarness;
export const createCollectibleTransactionFake =
  createCollectibleTransactionHarness;
