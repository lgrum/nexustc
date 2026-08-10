import { closeAccount } from "@repo/auth/account-closure";
import type { db as database } from "@repo/db";
import {
  eterisPosting,
  eterisTransaction,
  eterisWallet,
  eterisWalletBalance,
  eterisWalletReconciliation,
  userComicProgress,
  userProgression,
  xpEvent,
  xpIntegrityCase,
  xpLikeDisqualification,
  xpRewardBlock,
  xpRewardSubject,
  xpRiskSignal,
} from "@repo/db/schema/app";

import {
  adjustEteris,
  EterisError,
  getPublicWalletBalance,
  getUserWallet,
  listEterisHistory,
  postEterisTransaction,
  postEterisTransactionInTransaction,
  reconcileWallet,
  reverseEterisTransaction,
  setPublicWalletBalance,
} from "./eteris";

const flags = vi.hoisted(() => ({
  accrual: false,
  economy: false,
  spending: false,
}));
const notifications = vi.hoisted(
  () => [] as { metadata?: Record<string, unknown>; title: string }[]
);
const activation = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock("@repo/env", () => ({
  env: {
    get XP_ACCRUAL_ENABLED() {
      return flags.accrual;
    },
    get ETERIS_SPENDING_ENABLED() {
      return flags.spending;
    },
    get XP_ECONOMY_ENABLED() {
      return flags.economy;
    },
  },
}));
vi.mock("./notification", () => ({
  createUserNotification: vi.fn((_db: unknown, input: any) => {
    notifications.push(input);
    return Promise.resolve(`notification-${notifications.length}`);
  }),
}));
vi.mock("./progression-activation", () => ({
  ensureProgressionActivationInTransaction: vi.fn((executor: unknown) => {
    activation.calls.push(executor);
    return Promise.resolve(new Date("2026-01-01T00:00:00.000Z"));
  }),
}));

type Database = typeof database;
type Wallet = {
  anonymizedAt?: Date | null;
  id: string;
  kind: "user" | "mint" | "sink" | "fee" | "write_off";
  publicBalance: boolean;
  status: "active" | "frozen" | "closed";
  userId: string | null;
};

function sqlValues(value: unknown, seen = new WeakSet<object>()): unknown[] {
  if (!value || typeof value !== "object" || seen.has(value)) {
    return [];
  }
  seen.add(value);
  if (value.constructor.name === "Param" && "value" in value) {
    return [(value as { value: unknown }).value];
  }
  return Object.values(value).flatMap((entry) => sqlValues(entry, seen));
}

function createDatabase() {
  let banned = false;
  let transactionSequence = 0n;
  const wallets = new Map<string, Wallet>();
  const balances = new Map<string, bigint>();
  const transactions = new Map<
    string,
    {
      createdAt: Date;
      id: string;
      idempotencyKey: string;
      kind: string;
      metadata: Record<string, unknown>;
      reason: string | null;
      reversesTransactionId: string | null;
      sourceModule: string;
      sourceRef: string;
      sequence: bigint;
    }
  >();
  const postings: {
    amount: bigint;
    balanceAfter: bigint;
    transactionId: string;
    walletId: string;
  }[] = [];
  const lockOrders: string[][] = [];
  const deletedTables = new Set<unknown>();
  const reconciliations: Record<string, unknown>[] = [];

  const executor = {
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((input: any) => {
        const values = Array.isArray(input) ? input : [input];
        if (table === eterisWallet) {
          return {
            onConflictDoNothing: vi.fn(() => {
              for (const value of values) {
                const existing = [...wallets.values()].find(
                  (wallet) =>
                    wallet.id === value.id ||
                    (value.userId && wallet.userId === value.userId)
                );
                if (!existing) {
                  wallets.set(value.id, {
                    id: value.id,
                    kind: value.kind,
                    publicBalance: value.publicBalance ?? false,
                    status: value.status ?? "active",
                    userId: value.userId ?? null,
                  });
                }
              }
              return Promise.resolve();
            }),
          };
        }
        if (table === eterisWalletBalance) {
          return {
            onConflictDoNothing: vi.fn(() => {
              for (const value of values) {
                if (!balances.has(value.walletId)) {
                  balances.set(value.walletId, value.balance ?? 0n);
                }
              }
              return Promise.resolve();
            }),
          };
        }
        if (table === eterisTransaction) {
          const [value] = values;
          transactionSequence += 1n;
          transactions.set(value.id, {
            createdAt: new Date(),
            id: value.id,
            idempotencyKey: value.idempotencyKey,
            kind: value.kind,
            metadata: value.metadata,
            reason: value.reason ?? null,
            reversesTransactionId: value.reversesTransactionId ?? null,
            sourceModule: value.sourceModule,
            sourceRef: value.sourceRef,
            sequence: transactionSequence,
          });
        }
        if (table === eterisPosting) {
          postings.push(...values);
        }
        if (table === eterisWalletReconciliation) {
          reconciliations.push(...values);
        }
        return Promise.resolve();
      }),
    })),
    query: {
      eterisTransaction: {
        findFirst: vi.fn(({ where }: { where: unknown }) => {
          const [key] = sqlValues(where);
          return Promise.resolve(
            [...transactions.values()].find(
              (transaction) =>
                transaction.idempotencyKey === key || transaction.id === key
            ) ?? null
          );
        }),
      },
      eterisWallet: {
        findFirst: vi.fn(({ where }: { where: unknown }) => {
          const [value] = sqlValues(where);
          return Promise.resolve(
            [...wallets.values()].find(
              (wallet) => wallet.id === value || wallet.userId === value
            ) ?? null
          );
        }),
      },
      eterisWalletBalance: {
        findFirst: vi.fn(({ where }: { where: unknown }) => {
          const [walletId] = sqlValues(where);
          const balance = balances.get(String(walletId));
          return Promise.resolve(
            balance === undefined ? null : { balance, walletId }
          );
        }),
      },
      user: {
        findFirst: vi.fn(() => Promise.resolve({ banned })),
      },
    },
    select: vi.fn((shape: Record<string, unknown>) => ({
      from: vi.fn((table: unknown) => {
        if (table === userProgression) {
          return {
            where: vi.fn(() => ({
              for: vi.fn(() => Promise.resolve([])),
            })),
          };
        }
        if (table === eterisWalletBalance) {
          if (Object.keys(shape).length === 1 && "balance" in shape) {
            return {
              where: vi.fn((condition: unknown) => ({
                for: vi.fn(() => {
                  const [walletId] = sqlValues(condition);
                  const balance = balances.get(String(walletId));
                  return Promise.resolve(
                    balance === undefined ? [] : [{ balance }]
                  );
                }),
              })),
            };
          }
          return {
            innerJoin: vi.fn(() => ({
              where: vi.fn((condition: unknown) => ({
                orderBy: vi.fn(() => ({
                  for: vi.fn(() => {
                    const ids = sqlValues(condition).map(String).toSorted();
                    lockOrders.push(ids);
                    return Promise.resolve(
                      ids.flatMap((walletId) => {
                        const wallet = wallets.get(walletId);
                        const balance = balances.get(walletId);
                        return wallet && balance !== undefined
                          ? [{ ...wallet, balance, walletId }]
                          : [];
                      })
                    );
                  }),
                })),
              })),
            })),
          };
        }
        if (
          table === eterisPosting &&
          "balanceAfter" in shape &&
          !("createdAt" in shape)
        ) {
          return {
            innerJoin: vi.fn(() => ({
              where: vi.fn((condition: unknown) => ({
                orderBy: vi.fn(() => ({
                  limit: vi.fn(() => {
                    const [walletId] = sqlValues(condition);
                    const latest = postings.findLast(
                      (posting) => posting.walletId === walletId
                    );
                    return Promise.resolve(
                      latest ? [{ balanceAfter: latest.balanceAfter }] : []
                    );
                  }),
                })),
              })),
            })),
          };
        }
        if (table === eterisPosting && "createdAt" in shape) {
          return {
            innerJoin: vi.fn(() => ({
              where: vi.fn((condition: unknown) => ({
                orderBy: vi.fn(() => ({
                  limit: vi.fn(() => {
                    const [walletId] = sqlValues(condition);
                    return Promise.resolve(
                      postings
                        .filter((posting) => posting.walletId === walletId)
                        .map((posting) => ({
                          ...posting,
                          ...transactions.get(posting.transactionId)!,
                        }))
                    );
                  }),
                })),
              })),
            })),
          };
        }
        if (table === eterisPosting && "balance" in shape) {
          return {
            where: vi.fn((condition: unknown) => {
              const [walletId] = sqlValues(condition);
              const balance = postings
                .filter((posting) => posting.walletId === walletId)
                .reduce((total, posting) => total + posting.amount, 0n);
              return Promise.resolve([{ balance: balance.toString() }]);
            }),
          };
        }
        return {
          where: vi.fn((condition: unknown) => ({
            orderBy: vi.fn(() => {
              const [transactionId] = sqlValues(condition);
              return Promise.resolve(
                postings
                  .filter((posting) => posting.transactionId === transactionId)
                  .map(({ amount, walletId }) => ({ amount, walletId }))
                  .toSorted((left, right) =>
                    left.walletId.localeCompare(right.walletId)
                  )
              );
            }),
          })),
        };
      }),
    })),
    delete: vi.fn((table: unknown) => ({
      where: vi.fn(() => {
        deletedTables.add(table);
        return Promise.resolve();
      }),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn((condition: unknown) => {
          const ids = sqlValues(condition).map(String);
          if (table === eterisWalletBalance) {
            balances.set(ids[0]!, values.balance as bigint);
          }
          if (table === eterisWallet) {
            for (const id of ids) {
              const wallet = wallets.get(id);
              if (wallet) {
                wallets.set(id, { ...wallet, ...values });
              }
            }
          }
          return Promise.resolve();
        }),
      })),
    })),
  };
  let transactionTail = Promise.resolve();
  const db = {
    ...executor,
    transaction: vi.fn(
      async <T>(callback: (tx: typeof executor) => Promise<T>) => {
        const previous = transactionTail;
        let release: (() => void) | undefined;
        transactionTail = new Promise<void>((resolve) => {
          release = resolve;
        });
        await previous;
        try {
          return await callback(executor);
        } finally {
          release?.();
        }
      }
    ),
  } as unknown as Database;

  return {
    balances,
    corruptBalance: (walletId: string, balance: bigint) =>
      balances.set(walletId, balance),
    db,
    deletedTables,
    lockOrders,
    postings,
    reconciliations,
    setBanned: (value: boolean) => {
      banned = value;
    },
    transactions,
    wallets,
  };
}

beforeEach(() => {
  flags.economy = false;
  flags.accrual = false;
  flags.spending = false;
  notifications.length = 0;
  activation.calls = [];
});

test("an owner Eteris adjustment notifies once and reports newly created debt", async () => {
  flags.accrual = true;
  const store = createDatabase();
  const command = {
    actorUserId: "owner-1",
    amount: -5n,
    idempotencyKey: "owner-adjustment-notification",
    reason: "Correcci\u00F3n aprobada por soporte",
    userId: "user-1",
  };

  await adjustEteris(store.db, command);
  await adjustEteris(store.db, command);

  expect(notifications.map(({ title }) => title)).toEqual([
    "Tu saldo Eteris fue ajustado",
    "Tu Billetera Eteris tiene deuda",
  ]);
  expect(notifications.every(({ metadata }) => !metadata?.reason)).toBe(true);
  expect(activation.calls).toHaveLength(2);
});

test("banning freezes Eteris spending without confiscating the balance", async () => {
  flags.economy = true;
  flags.spending = true;
  const store = createDatabase();
  await getUserWallet(store.db, "user-1");
  const wallet = [...store.wallets.values()].find(
    ({ userId }) => userId === "user-1"
  )!;
  store.setBanned(true);

  await expect(getUserWallet(store.db, "user-1")).resolves.toMatchObject({
    canSpend: false,
  });
  await expect(
    postEterisTransaction(store.db, {
      idempotencyKey: "banned-spend",
      kind: "purchase",
      postings: [
        { amount: -1n, walletId: wallet.id },
        { amount: 1n, walletId: "eteris-system-sink" },
      ],
      sourceModule: "commerce",
      sourceRef: "purchase:banned",
      spending: true,
    })
  ).rejects.toMatchObject({ code: "CLOSED_OR_FROZEN" });
  expect(store.balances.get(wallet.id)).toBe(0n);
});

test("a user wallet and all system wallets are created once at zero", async () => {
  const store = createDatabase();

  const first = await getUserWallet(store.db, "user-1");
  const second = await getUserWallet(store.db, "user-1");

  expect(first).toMatchObject({
    balance: "0",
    canSpend: false,
    debt: false,
    enabled: false,
    publicBalance: false,
    spendingEnabled: false,
    status: "active",
  });
  expect(second).toEqual(first);
  expect(store.wallets.size).toBe(5);
  expect(store.balances.size).toBe(5);
});

test("server gates reject spending and owner issuance while disabled", async () => {
  const store = createDatabase();

  await expect(
    postEterisTransaction(store.db, {
      idempotencyKey: "disabled-purchase",
      kind: "purchase",
      postings: [
        { amount: -1n, walletId: "user-wallet" },
        { amount: 1n, walletId: "eteris-system-sink" },
      ],
      sourceModule: "commerce",
      sourceRef: "disabled-purchase",
    })
  ).rejects.toMatchObject({ code: "SPENDING_DISABLED" });
  await expect(
    adjustEteris(store.db, {
      actorUserId: "owner-1",
      amount: 1n,
      idempotencyKey: "disabled-adjustment",
      reason: "No debe crear valor",
      userId: "user-1",
    })
  ).rejects.toMatchObject({ code: "ACCRUAL_DISABLED" });
  expect(store.wallets.size).toBe(0);
});

test("balanced postings settle once and replay without another value change", async () => {
  const store = createDatabase();
  await getUserWallet(store.db, "user-1");
  const userWallet = [...store.wallets.values()].find(
    (wallet) => wallet.userId === "user-1"
  )!;
  const command = {
    debtPolicy: "trusted-recovery" as const,
    idempotencyKey: "grant-100",
    kind: "admin_adjustment" as const,
    postings: [
      { amount: 100n, walletId: userWallet.id },
      { amount: -100n, walletId: "eteris-system-mint" },
    ],
    reason: "Correcci\u00F3n aprobada",
    sourceModule: "owner" as const,
    sourceRef: "ticket-100",
  };

  const first = await postEterisTransaction(store.db, command);
  const replay = await postEterisTransaction(store.db, command);

  expect(first.replayed).toBe(false);
  expect(replay).toEqual({ id: first.id, replayed: true });
  expect(store.postings).toHaveLength(2);
  expect(store.postings.reduce((sum, row) => sum + row.amount, 0n)).toBe(0n);
  expect(store.balances.get(userWallet.id)).toBe(100n);
  expect(store.lockOrders[0]).toEqual(
    [userWallet.id, "eteris-system-mint"].toSorted()
  );
});

test("concurrent ordinary debits serialize and only one can spend the funds", async () => {
  flags.spending = true;
  const store = createDatabase();
  await getUserWallet(store.db, "user-1");
  const userWallet = [...store.wallets.values()].find(
    (wallet) => wallet.userId === "user-1"
  )!;
  await postEterisTransaction(store.db, {
    debtPolicy: "trusted-recovery",
    idempotencyKey: "seed-100",
    kind: "admin_adjustment",
    postings: [
      { amount: 100n, walletId: userWallet.id },
      { amount: -100n, walletId: "eteris-system-mint" },
    ],
    reason: "Saldo inicial de prueba",
    sourceModule: "owner",
    sourceRef: "seed",
  });
  const spend = (idempotencyKey: string) =>
    postEterisTransaction(store.db, {
      idempotencyKey,
      kind: "purchase",
      postings: [
        { amount: -80n, walletId: userWallet.id },
        { amount: 80n, walletId: "eteris-system-sink" },
      ],
      sourceModule: "commerce",
      sourceRef: idempotencyKey,
      spending: true,
    });

  const results = await Promise.allSettled([spend("sale-1"), spend("sale-2")]);

  expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
    1
  );
  expect(results.find(({ status }) => status === "rejected")).toMatchObject({
    reason: expect.objectContaining({ code: "INSUFFICIENT_FUNDS" }),
  });
  expect(store.balances.get(userWallet.id)).toBe(20n);
});

test("only trusted recovery may create debt and debt blocks ordinary spending", async () => {
  flags.spending = true;
  const store = createDatabase();
  await getUserWallet(store.db, "user-1");
  const userWallet = [...store.wallets.values()].find(
    (wallet) => wallet.userId === "user-1"
  )!;
  await postEterisTransaction(store.db, {
    debtPolicy: "trusted-recovery",
    idempotencyKey: "debt-1",
    kind: "admin_adjustment",
    postings: [
      { amount: -10n, walletId: userWallet.id },
      { amount: 10n, walletId: "eteris-system-mint" },
    ],
    reason: "Recuperaci\u00F3n aprobada",
    sourceModule: "owner",
    sourceRef: "debt",
  });

  await expect(
    postEterisTransaction(store.db, {
      debtPolicy: "trusted-recovery",
      idempotencyKey: "untrusted-debt",
      kind: "purchase",
      postings: [
        { amount: -1n, walletId: userWallet.id },
        { amount: 1n, walletId: "eteris-system-sink" },
      ],
      sourceModule: "commerce",
      sourceRef: "untrusted-debt",
    })
  ).rejects.toMatchObject({ code: "INVALID_POSTINGS" });

  await expect(
    postEterisTransaction(store.db, {
      idempotencyKey: "sale-in-debt",
      kind: "purchase",
      postings: [
        { amount: -1n, walletId: userWallet.id },
        { amount: 1n, walletId: "eteris-system-sink" },
      ],
      sourceModule: "commerce",
      sourceRef: "sale-in-debt",
      spending: true,
    })
  ).rejects.toBeInstanceOf(EterisError);
  expect(store.balances.get(userWallet.id)).toBe(-10n);
});

test("a projection mismatch freezes the wallet and fails without postings", async () => {
  const store = createDatabase();
  await getUserWallet(store.db, "user-1");
  const userWallet = [...store.wallets.values()].find(
    (wallet) => wallet.userId === "user-1"
  )!;
  await postEterisTransaction(store.db, {
    debtPolicy: "trusted-recovery",
    idempotencyKey: "seed-mismatch",
    kind: "admin_adjustment",
    postings: [
      { amount: 10n, walletId: userWallet.id },
      { amount: -10n, walletId: "eteris-system-mint" },
    ],
    reason: "Saldo de prueba",
    sourceModule: "owner",
    sourceRef: "seed-mismatch",
  });
  store.corruptBalance(userWallet.id, 999n);

  await expect(
    postEterisTransaction(store.db, {
      debtPolicy: "trusted-recovery",
      idempotencyKey: "must-fail",
      kind: "admin_adjustment",
      postings: [
        { amount: 1n, walletId: userWallet.id },
        { amount: -1n, walletId: "eteris-system-mint" },
      ],
      reason: "No debe asentarse",
      sourceModule: "owner",
      sourceRef: "must-fail",
    })
  ).rejects.toMatchObject({ code: "PROJECTION_MISMATCH" });
  expect(store.transactions.size).toBe(1);
  expect(store.wallets.get(userWallet.id)?.status).toBe("frozen");
});

test("a nonzero projection without ledger postings freezes the wallet", async () => {
  const store = createDatabase();
  await getUserWallet(store.db, "user-1");
  const userWallet = [...store.wallets.values()].find(
    (wallet) => wallet.userId === "user-1"
  )!;
  store.corruptBalance(userWallet.id, 10n);

  await expect(
    postEterisTransaction(store.db, {
      debtPolicy: "trusted-recovery",
      idempotencyKey: "missing-ledger-postings",
      kind: "admin_adjustment",
      postings: [
        { amount: 1n, walletId: userWallet.id },
        { amount: -1n, walletId: "eteris-system-mint" },
      ],
      reason: "No debe asentarse",
      sourceModule: "owner",
      sourceRef: "missing-ledger-postings",
    })
  ).rejects.toMatchObject({ code: "PROJECTION_MISMATCH" });
  expect(store.transactions.size).toBe(0);
  expect(store.wallets.get(userWallet.id)?.status).toBe("frozen");
});

test("an outer transaction can commit a projection freeze before its caller reports failure", async () => {
  const store = createDatabase();
  await getUserWallet(store.db, "user-1");
  const userWallet = [...store.wallets.values()].find(
    (wallet) => wallet.userId === "user-1"
  )!;
  await postEterisTransaction(store.db, {
    debtPolicy: "trusted-recovery",
    idempotencyKey: "seed-nested-mismatch",
    kind: "admin_adjustment",
    postings: [
      { amount: 10n, walletId: userWallet.id },
      { amount: -10n, walletId: "eteris-system-mint" },
    ],
    reason: "Saldo de prueba",
    sourceModule: "owner",
    sourceRef: "seed-nested-mismatch",
  });
  store.corruptBalance(userWallet.id, 999n);

  const result = await store.db.transaction((tx) =>
    postEterisTransactionInTransaction(tx, {
      debtPolicy: "trusted-recovery",
      idempotencyKey: "nested-mismatch",
      kind: "admin_adjustment",
      postings: [
        { amount: 1n, walletId: userWallet.id },
        { amount: -1n, walletId: "eteris-system-mint" },
      ],
      reason: "No debe asentarse",
      sourceModule: "owner",
      sourceRef: "nested-mismatch",
    })
  );

  expect(result).toEqual({ mismatched: [userWallet.id] });
  expect(store.transactions.size).toBe(1);
  expect(store.wallets.get(userWallet.id)?.status).toBe("frozen");
});

test("public balance is opt-in and exposes no wallet internals", async () => {
  flags.economy = true;
  const store = createDatabase();
  await getUserWallet(store.db, "user-1");

  await expect(getPublicWalletBalance(store.db, "user-1")).resolves.toBeNull();
  await setPublicWalletBalance(store.db, "user-1", true);
  await expect(getPublicWalletBalance(store.db, "user-1")).resolves.toEqual({
    balance: "0",
  });
  const userWallet = [...store.wallets.values()].find(
    (wallet) => wallet.userId === "user-1"
  )!;
  store.corruptBalance(userWallet.id, -1n);
  await expect(getPublicWalletBalance(store.db, "user-1")).resolves.toBeNull();
});

test("VIP stipends use the safe Spanish wallet history label", async () => {
  flags.economy = true;
  const store = createDatabase();
  await getUserWallet(store.db, "user-1");
  const userWallet = [...store.wallets.values()].find(
    (wallet) => wallet.userId === "user-1"
  )!;
  await postEterisTransaction(store.db, {
    idempotencyKey: "vip:user-1:2026-08:target:600",
    kind: "vip_stipend",
    metadata: { month: "2026-08", tier: "level12", version: "v1" },
    postings: [
      { amount: 600n, walletId: userWallet.id },
      { amount: -600n, walletId: "eteris-system-mint" },
    ],
    sourceModule: "patreon",
    sourceRef: "vip:user-1:2026-08:target:600",
  });

  const history = await listEterisHistory(store.db, {
    limit: 20,
    userId: "user-1",
  });

  expect(history.items).toEqual([
    expect.objectContaining({
      amount: "600",
      kind: "vip_stipend",
      label: "Beneficio VIP mensual",
    }),
  ]);
  expect(history.items[0]).not.toHaveProperty("metadata");
});

test("reconciliation freezes a mismatch and repairs under the balance lock", async () => {
  const store = createDatabase();
  await getUserWallet(store.db, "user-1");
  const userWallet = [...store.wallets.values()].find(
    (wallet) => wallet.userId === "user-1"
  )!;
  await postEterisTransaction(store.db, {
    debtPolicy: "trusted-recovery",
    idempotencyKey: "seed-reconciliation",
    kind: "admin_adjustment",
    postings: [
      { amount: 10n, walletId: userWallet.id },
      { amount: -10n, walletId: "eteris-system-mint" },
    ],
    reason: "Saldo de reconciliaci\u00F3n",
    sourceModule: "owner",
    sourceRef: "seed-reconciliation",
  });
  store.corruptBalance(userWallet.id, 7n);

  await expect(reconcileWallet(store.db, "user-1")).resolves.toMatchObject({
    ledgerBalance: "10",
    matches: false,
    projectionBalance: "7",
    repaired: false,
  });
  expect(store.wallets.get(userWallet.id)?.status).toBe("frozen");

  await expect(
    reconcileWallet(store.db, "user-1", true, "owner-1")
  ).resolves.toMatchObject({
    ledgerBalance: "10",
    matches: false,
    repaired: true,
  });
  expect(store.balances.get(userWallet.id)).toBe(10n);
  expect(store.wallets.get(userWallet.id)?.status).toBe("active");
  expect(store.reconciliations).toEqual([
    expect.objectContaining({
      actorUserId: undefined,
      ledgerBalance: 10n,
      projectionBalance: 7n,
      repaired: false,
      walletId: userWallet.id,
    }),
    expect.objectContaining({
      actorUserId: "owner-1",
      ledgerBalance: 10n,
      projectionBalance: 7n,
      repaired: true,
      walletId: userWallet.id,
    }),
  ]);
});

test("a journal transaction can be reversed exactly once", async () => {
  const store = createDatabase();
  await getUserWallet(store.db, "user-1");
  const userWallet = [...store.wallets.values()].find(
    (wallet) => wallet.userId === "user-1"
  )!;
  const original = await postEterisTransaction(store.db, {
    debtPolicy: "trusted-recovery",
    idempotencyKey: "grant-to-reverse",
    kind: "admin_adjustment",
    postings: [
      { amount: 25n, walletId: userWallet.id },
      { amount: -25n, walletId: "eteris-system-mint" },
    ],
    reason: "Correcci\u00F3n original",
    sourceModule: "owner",
    sourceRef: "grant-to-reverse",
  });

  await reverseEterisTransaction(store.db, {
    actorUserId: "owner-1",
    idempotencyKey: "reverse-grant",
    reason: "Correcci\u00F3n revertida",
    transactionId: original.id,
  });

  expect(store.balances.get(userWallet.id)).toBe(0n);
  expect(
    store.postings
      .slice(-2)
      .map(({ amount }) => amount)
      .toSorted()
  ).toEqual([-25n, 25n]);
});

test.each([
  { balance: 0n, systemWalletId: null },
  { balance: 100n, systemWalletId: "eteris-system-sink" },
  { balance: -25n, systemWalletId: "eteris-system-write-off" },
])(
  "account closure settles a $balance balance and closes the wallet",
  async ({ balance, systemWalletId }) => {
    const store = createDatabase();
    await getUserWallet(store.db, "user-1");
    const userWalletId = [...store.wallets.values()].find(
      (wallet) => wallet.userId === "user-1"
    )!.id;
    if (balance !== 0n) {
      await postEterisTransaction(store.db, {
        debtPolicy: "trusted-recovery",
        idempotencyKey: `seed-${balance}`,
        kind: "account_closure",
        postings: [
          { amount: balance, walletId: userWalletId },
          {
            amount: -balance,
            walletId:
              balance > 0n ? "eteris-system-mint" : "eteris-system-write-off",
          },
        ],
        sourceModule: "account",
        sourceRef: `seed-${balance}`,
      });
    }

    const result = await closeAccount(store.db, "user-1");
    const wallet = store.wallets.get(result.walletId)!;

    expect(store.balances.get(result.walletId)).toBe(0n);
    expect(wallet).toMatchObject({
      publicBalance: false,
      status: "closed",
      userId: "user-1",
    });
    expect(wallet.anonymizedAt).toBeInstanceOf(Date);
    expect(store.lockOrders.at(-1)).toEqual(
      [userWalletId, ...(systemWalletId ? [systemWalletId] : [])].toSorted()
    );
    if (systemWalletId) {
      const closurePosting = store.postings.findLast(
        (posting) =>
          posting.walletId === systemWalletId &&
          store.transactions.get(posting.transactionId)?.kind ===
            "account_closure"
      );
      expect(closurePosting?.amount).toBe(balance);
    }
  }
);

test("account closure is idempotent and blocks concurrent wallet writes", async () => {
  const store = createDatabase();
  flags.economy = true;
  await getUserWallet(store.db, "user-1");
  const userWalletId = [...store.wallets.values()].find(
    (wallet) => wallet.userId === "user-1"
  )!.id;
  await postEterisTransaction(store.db, {
    idempotencyKey: "seed-close-race",
    kind: "vip_stipend",
    postings: [
      { amount: 100n, walletId: userWalletId },
      { amount: -100n, walletId: "eteris-system-mint" },
    ],
    sourceModule: "patreon",
    sourceRef: "seed-close-race",
  });

  const [first, repeated] = await Promise.all([
    closeAccount(store.db, "user-1"),
    closeAccount(store.db, "user-1"),
  ]);

  expect(repeated.walletId).toBe(first.walletId);
  expect(store.balances.get(first.walletId)).toBe(0n);
  expect(
    [...store.transactions.values()].filter(
      (transaction) => transaction.kind === "account_closure"
    )
  ).toHaveLength(1);
  await expect(
    postEterisTransaction(store.db, {
      idempotencyKey: "late-stipend",
      kind: "vip_stipend",
      postings: [
        { amount: 50n, walletId: first.walletId },
        { amount: -50n, walletId: "eteris-system-mint" },
      ],
      sourceModule: "patreon",
      sourceRef: "late-stipend",
    })
  ).rejects.toMatchObject({ code: "CLOSED_OR_FROZEN" });
  await expect(
    setPublicWalletBalance(store.db, "user-1", true)
  ).rejects.toMatchObject({ code: "CLOSED_OR_FROZEN" });
  expect(store.wallets.get(first.walletId)?.publicBalance).toBe(false);
});

test("a frozen wallet can turn off public balance and is never exposed publicly", async () => {
  flags.economy = true;
  const store = createDatabase();
  await getUserWallet(store.db, "user-1");
  const wallet = [...store.wallets.values()].find(
    (candidate) => candidate.userId === "user-1"
  )!;
  wallet.publicBalance = true;
  wallet.status = "frozen";

  await expect(
    setPublicWalletBalance(store.db, "user-1", false)
  ).resolves.toEqual({ publicBalance: false });
  expect(store.wallets.get(wallet.id)?.publicBalance).toBe(false);

  wallet.publicBalance = true;
  await expect(getPublicWalletBalance(store.db, "user-1")).resolves.toBeNull();
  await expect(
    setPublicWalletBalance(store.db, "user-1", true)
  ).rejects.toMatchObject({ code: "CLOSED_OR_FROZEN" });
});

test("account closure removes private progression and retains only anonymous ledger data", async () => {
  const store = createDatabase();
  await getUserWallet(store.db, "user-1");
  const userWalletId = [...store.wallets.values()].find(
    (wallet) => wallet.userId === "user-1"
  )!.id;
  await postEterisTransaction(store.db, {
    idempotencyKey: "private-seed",
    kind: "vip_stipend",
    metadata: { month: "2026-08", tier: "level1", version: "v1" },
    postings: [
      { amount: 50n, walletId: userWalletId },
      { amount: -50n, walletId: "eteris-system-mint" },
    ],
    sourceModule: "patreon",
    sourceRef: "private-seed",
  });

  await closeAccount(store.db, "user-1");

  expect(store.deletedTables).toEqual(
    new Set([
      xpEvent,
      xpLikeDisqualification,
      xpRewardSubject,
      xpRewardBlock,
      xpRiskSignal,
      xpIntegrityCase,
      userProgression,
      userComicProgress,
    ])
  );
  const closure = [...store.transactions.values()].find(
    (transaction) => transaction.kind === "account_closure"
  )!;
  expect(closure.metadata).toEqual({});
  expect(closure.sourceRef).toBe(`wallet:${userWalletId}`);
  expect(closure.sourceRef).not.toContain("user-1");

  store.wallets.set(userWalletId, {
    ...store.wallets.get(userWalletId)!,
    userId: null,
  });
  await getUserWallet(store.db, "user-2");
  expect(
    [...store.wallets.values()].find((wallet) => wallet.userId === "user-2")?.id
  ).not.toBe(userWalletId);
  expect(
    store.postings.some((posting) => posting.walletId === userWalletId)
  ).toBe(true);
});

test("account closure fails closed on a projection mismatch", async () => {
  const store = createDatabase();
  await getUserWallet(store.db, "user-1");
  const userWallet = [...store.wallets.values()].find(
    (wallet) => wallet.userId === "user-1"
  )!;
  await postEterisTransaction(store.db, {
    idempotencyKey: "mismatch-seed",
    kind: "vip_stipend",
    postings: [
      { amount: 50n, walletId: userWallet.id },
      { amount: -50n, walletId: "eteris-system-mint" },
    ],
    sourceModule: "patreon",
    sourceRef: "mismatch-seed",
  });
  store.corruptBalance(userWallet.id, 49n);

  await expect(closeAccount(store.db, "user-1")).rejects.toThrow(
    "La proyeccion Eteris no coincide con el libro mayor."
  );
  expect(store.wallets.get(userWallet.id)?.status).toBe("active");
  expect(store.deletedTables.size).toBe(0);
});
