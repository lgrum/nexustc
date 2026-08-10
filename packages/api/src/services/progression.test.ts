import type { db as database } from "@repo/db";
import {
  progressionSystem,
  userProgression,
  xpEvent,
} from "@repo/db/schema/app";

import {
  adjustXp,
  cancelPendingXpEventsInTransaction,
  getPublicAccountLevel,
  getUserProgression,
  listUserXpHistory,
  postXpEventInTransaction,
  postXpEvent,
  releasePendingXpCaseInTransaction,
} from "./progression";
import type { ProgressionExecutor } from "./progression";

const flags = vi.hoisted(() => ({ accrual: false, economy: false }));
const ledger = vi.hoisted(() => ({
  balance: 0n,
  calls: [] as {
    idempotencyKey: string;
    kind: string;
    metadata?: Record<string, unknown>;
  }[],
  failAtCall: 0,
  mismatchAtCall: 0,
  notifications: [] as { metadata?: Record<string, unknown>; title: string }[],
  reversalDebtCreated: null as boolean | null,
  transactions: new Map<
    string,
    {
      amount: bigint;
      id: string;
      kind: string;
      metadata: Record<string, unknown>;
      reversesTransactionId: string | null;
      sourceModule: string;
    }
  >(),
}));
vi.mock("@repo/env", () => ({
  env: {
    get XP_ACCRUAL_ENABLED() {
      return flags.accrual;
    },
    get XP_ECONOMY_ENABLED() {
      return flags.economy;
    },
  },
}));
vi.mock("./eteris", () => ({
  getOrCreateUserWalletInTransaction: vi.fn(() =>
    Promise.resolve({ balance: ledger.balance, id: "user-wallet" })
  ),
  postEterisTransactionInTransaction: vi.fn((_tx: unknown, input: any) => {
    ledger.calls.push(input);
    if (ledger.failAtCall === ledger.calls.length) {
      throw new Error("ledger failure");
    }
    if (ledger.mismatchAtCall === ledger.calls.length) {
      return Promise.resolve({ mismatched: ["user-wallet"] });
    }
    const amount = input.postings.find(
      (posting: { walletId: string }) => posting.walletId === "user-wallet"
    ).amount as bigint;
    ledger.balance += amount;
    const id = `ledger-${ledger.transactions.size + 1}`;
    ledger.transactions.set(input.idempotencyKey, {
      amount,
      id,
      kind: input.kind,
      metadata: input.metadata ?? {},
      reversesTransactionId: null,
      sourceModule: input.sourceModule,
    });
    return Promise.resolve({ id, replayed: false });
  }),
  reverseEterisTransactionByIdempotencyKeyInTransaction: vi.fn(
    (_tx: unknown, input: any) => {
      ledger.calls.push({ ...input, kind: "reversal" });
      if (ledger.failAtCall === ledger.calls.length) {
        throw new Error("ledger failure");
      }
      const original = ledger.transactions.get(input.originalIdempotencyKey);
      if (!original) {
        throw new Error("missing original reward");
      }
      const balanceBefore = ledger.balance;
      ledger.balance -= original.amount;
      const id = `ledger-${ledger.transactions.size + 1}`;
      ledger.transactions.set(input.idempotencyKey, {
        amount: -original.amount,
        id,
        kind: "reversal",
        metadata: {},
        reversesTransactionId: original.id,
        sourceModule: "progression",
      });
      return Promise.resolve({
        debtCreated:
          ledger.reversalDebtCreated ??
          (balanceBefore >= 0n && ledger.balance < 0n),
        id,
        replayed: false,
      });
    }
  ),
}));
vi.mock("./notification", () => ({
  createUserNotification: vi.fn((_db: unknown, input: any) => {
    ledger.notifications.push(input);
    return Promise.resolve(`notification-${ledger.notifications.length}`);
  }),
}));

type Database = typeof database;

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

function createDatabase(options?: { banned?: boolean }) {
  let banned = options?.banned ?? false;
  let activation: { activatedAt: Date; curveVersion: string } | null = null;
  let progression: {
    level: number;
    pendingXp: number;
    totalXp: number;
    userId: string;
  } | null = null;
  type StoredEvent = {
    amount: number;
    createdAt: Date;
    createdBy: string | null;
    id: string;
    idempotencyKey: string;
    kind: typeof xpEvent.$inferSelect.kind;
    metadata: Record<string, unknown>;
    reasonCode: string;
    reversesEventId: string | null;
    sourceRef: string;
    state: "posted";
    updatedAt: Date;
    userId: string;
  };
  const events: StoredEvent[] = [];
  const historyRows: {
    amount: number;
    createdAt: Date;
    id: string;
    kind: "admin_adjustment";
    metadata: Record<string, unknown>;
    state: "posted";
  }[] = [];
  const findLevelRewardTransactions = vi.fn((_options?: unknown) =>
    Promise.resolve(
      [...ledger.transactions.values()].map((transaction) => ({
        ...transaction,
        createdAt: new Date(),
        metadata: transaction.metadata,
        postings: [{ walletId: "user-wallet" }],
      }))
    )
  );

  const executor = {
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((values: Record<string, unknown>) => {
        if (table === progressionSystem && !activation) {
          activation = {
            activatedAt: values.activatedAt as Date,
            curveVersion: values.curveVersion as string,
          };
        }
        if (table === userProgression && !progression) {
          progression = {
            level: 1,
            pendingXp: 0,
            totalXp: 0,
            userId: values.userId as string,
          };
        }
        if (table === xpEvent) {
          events.push({
            amount: values.amount as number,
            createdAt: (values.createdAt as Date | undefined) ?? new Date(),
            createdBy: (values.createdBy as string | undefined) ?? null,
            id: values.id as string,
            idempotencyKey: values.idempotencyKey as string,
            kind: values.kind as typeof xpEvent.$inferSelect.kind,
            metadata: values.metadata as Record<string, unknown>,
            reasonCode: values.reasonCode as string,
            reversesEventId:
              (values.reversesEventId as string | undefined) ?? null,
            sourceRef: values.sourceRef as string,
            state: "posted",
            updatedAt: values.updatedAt as Date,
            userId: values.userId as string,
          });
        }
        return {
          onConflictDoNothing: vi.fn().mockResolvedValue(null),
        };
      }),
    })),
    query: {
      eterisWallet: {
        findFirst: vi.fn(() => Promise.resolve(null)),
      },
      eterisWalletBalance: {
        findFirst: vi.fn(() =>
          Promise.resolve({ balance: ledger.balance, walletId: "user-wallet" })
        ),
      },
      eterisTransaction: {
        findMany: findLevelRewardTransactions,
      },
      progressionSystem: {
        findFirst: vi.fn(() => Promise.resolve(activation)),
      },
      user: {
        findFirst: vi.fn(() => Promise.resolve({ banned, id: "user-1" })),
      },
      userProgression: {
        findFirst: vi.fn(() => Promise.resolve(progression)),
      },
      xpEvent: {
        findFirst: vi.fn(({ where }: { where: unknown }) => {
          const key = sqlValues(where).find(
            (value) => typeof value === "string"
          );
          return Promise.resolve(
            events.find(
              (event) => event.id === key || event.idempotencyKey === key
            ) ?? null
          );
        }),
      },
    },
    select: vi.fn((shape: Record<string, unknown>) => ({
      from: vi.fn((table: unknown) => {
        if (table === xpEvent) {
          if (Object.keys(shape).length === 2 && "id" in shape) {
            return {
              where: vi.fn(() => ({
                orderBy: vi.fn(() =>
                  Promise.resolve(
                    events
                      .toSorted(
                        (left, right) =>
                          left.createdAt.getTime() -
                            right.createdAt.getTime() ||
                          left.id.localeCompare(right.id)
                      )
                      .map(({ amount, id }) => ({ amount, id }))
                  )
                ),
              })),
            };
          }
          return {
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve(historyRows)),
              })),
            })),
          };
        }
        if (table === progressionSystem) {
          return {
            where: vi.fn(() => ({
              for: vi.fn(() => Promise.resolve(activation ? [activation] : [])),
            })),
          };
        }
        return {
          where: vi.fn(() => ({
            for: vi.fn(() => Promise.resolve(progression ? [progression] : [])),
          })),
        };
      }),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(() => {
          if (table === userProgression && progression) {
            progression = { ...progression, ...values } as typeof progression;
          }
          if (table === progressionSystem && activation) {
            activation = { ...activation, ...values } as typeof activation;
          }
          return Promise.resolve();
        }),
      })),
    })),
  };
  const db = {
    ...executor,
    transaction: vi.fn(async (callback: (tx: typeof executor) => unknown) => {
      const activationBefore = activation ? { ...activation } : null;
      const progressionBefore = progression ? { ...progression } : null;
      const eventsBefore = events.map((event) => ({ ...event }));
      const balanceBefore = ledger.balance;
      const transactionsBefore = new Map(ledger.transactions);
      try {
        return await callback(executor);
      } catch (error) {
        activation = activationBefore;
        progression = progressionBefore;
        events.splice(0, events.length, ...eventsBefore);
        ledger.balance = balanceBefore;
        ledger.transactions = transactionsBefore;
        throw error;
      }
    }),
  } as unknown as Database;

  return {
    addHistory: (...rows: typeof historyRows) => historyRows.push(...rows),
    db,
    getActivation: () => activation,
    getEvent: () => events.at(-1),
    getEvents: () => events,
    getLevelRewardQuery: () =>
      findLevelRewardTransactions.mock.calls.at(-1)?.[0],
    getProgression: () => progression,
    spend: (amount: bigint) => {
      ledger.balance -= amount;
    },
    setBanned: (value: boolean) => {
      banned = value;
    },
    setProgression: (value: {
      level: number;
      pendingXp: number;
      totalXp: number;
    }) => {
      progression = { ...value, userId: "user-1" };
    },
  };
}

beforeEach(() => {
  flags.accrual = false;
  flags.economy = false;
  ledger.balance = 0n;
  ledger.calls = [];
  ledger.failAtCall = 0;
  ledger.mismatchAtCall = 0;
  ledger.notifications = [];
  ledger.reversalDebtCreated = null;
  ledger.transactions = new Map();
});

describe("progression service", () => {
  it("cancels Pending XP and decrements its projection in the same transaction", async () => {
    const updates: { table: unknown; values: Record<string, unknown> }[] = [];
    const pending = [
      {
        amount: 25,
        id: "pending-1",
        userId: "user-1",
      },
      {
        amount: 50,
        id: "pending-2",
        userId: "user-1",
      },
    ];
    const tx = {
      select: vi.fn(() => {
        const chain = {
          for: vi.fn().mockResolvedValue(pending),
          from: vi.fn(),
          where: vi.fn(),
        };
        chain.from.mockReturnValue(chain);
        chain.where.mockReturnValue(chain);
        return chain;
      }),
      update: vi.fn((table: unknown) => ({
        set: vi.fn((values: Record<string, unknown>) => {
          updates.push({ table, values });
          return { where: vi.fn(() => Promise.resolve()) };
        }),
      })),
    } as unknown as ProgressionExecutor;

    await expect(
      cancelPendingXpEventsInTransaction(tx, {
        now: new Date("2026-08-10T00:00:00.000Z"),
        subjectId: "subject-1",
      })
    ).resolves.toEqual(pending);
    expect(updates).toEqual([
      expect.objectContaining({
        table: xpEvent,
        values: expect.objectContaining({ state: "cancelled" }),
      }),
      expect.objectContaining({
        table: userProgression,
        values: expect.objectContaining({ pendingXp: expect.anything() }),
      }),
    ]);
  });

  it("dismisses an integrity case when source removal cancels its last Pending event", async () => {
    const updates: { table: unknown; values: Record<string, unknown> }[] = [];
    const pending = [
      {
        amount: 25,
        id: "pending-1",
        integrityCaseId: "case-1",
        userId: "user-1",
      },
    ];
    let selectCall = 0;
    const tx = {
      select: vi.fn(() => {
        selectCall += 1;
        if (selectCall === 1) {
          const chain = {
            for: vi.fn().mockResolvedValue(pending),
            from: vi.fn(),
            where: vi.fn(),
          };
          chain.from.mockReturnValue(chain);
          chain.where.mockReturnValue(chain);
          return chain;
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        };
      }),
      update: vi.fn((table: unknown) => ({
        set: vi.fn((values: Record<string, unknown>) => {
          updates.push({ table, values });
          return { where: vi.fn(() => Promise.resolve()) };
        }),
      })),
    } as unknown as ProgressionExecutor;

    await cancelPendingXpEventsInTransaction(tx, {
      closeEmptyCases: true,
      now: new Date("2026-08-10T00:00:00.000Z"),
      subjectId: "subject-1",
    });

    expect(updates).toContainEqual(
      expect.objectContaining({
        values: expect.objectContaining({ status: "dismissed" }),
      })
    );
  });

  it("keeps Pending XP open when its level reward finds a projection mismatch", async () => {
    flags.accrual = true;
    ledger.mismatchAtCall = 1;
    const now = new Date("2026-08-10T00:00:00.000Z");
    const activation = {
      activatedAt: new Date("2026-08-01T00:00:00.000Z"),
      curveVersion: "v1",
    };
    const progression = {
      level: 1,
      pendingXp: 67,
      totalXp: 0,
      userId: "user-1",
    };
    const pending = {
      amount: 67,
      createdAt: new Date("2026-08-09T00:00:00.000Z"),
      createdBy: null,
      id: "pending-1",
      idempotencyKey: "pending-source-1",
      integrityCaseId: "case-1",
      kind: "review_milestone" as const,
      metadata: {},
      milestone: 3,
      reasonCode: "eligible_likes_3",
      reversesEventId: null,
      sourceRef: "review:subject-1:milestone:3",
      state: "pending" as const,
      subjectId: "subject-1",
      updatedAt: now,
      userId: "user-1",
    };
    const updates: Record<string, unknown>[] = [];
    const tx = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn().mockResolvedValue(null),
        })),
      })),
      query: {
        eterisWallet: { findFirst: vi.fn().mockResolvedValue(null) },
        progressionSystem: { findFirst: vi.fn().mockResolvedValue(activation) },
        user: {
          findFirst: vi.fn().mockResolvedValue({ banned: false, id: "user-1" }),
        },
        userProgression: { findFirst: vi.fn().mockResolvedValue(progression) },
        xpEvent: { findFirst: vi.fn().mockResolvedValue(null) },
      },
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => ({
          where: vi.fn(() => ({
            for: vi
              .fn()
              .mockResolvedValue(
                table === xpEvent
                  ? [pending]
                  : table === progressionSystem
                    ? [activation]
                    : [progression]
              ),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((values: Record<string, unknown>) => {
          updates.push(values);
          return { where: vi.fn().mockResolvedValue(null) };
        }),
      })),
    } as unknown as ProgressionExecutor;

    await expect(
      releasePendingXpCaseInTransaction(tx, {
        caseId: "case-1",
        now,
      })
    ).resolves.toMatchObject({ completed: false, settlements: [] });
    expect(updates).not.toContainEqual(
      expect.objectContaining({ state: "cancelled" })
    );
  });

  it("clips reversals at the Account XP floor instead of rejecting the source action", async () => {
    flags.accrual = true;
    const store = createDatabase();
    store.setProgression({ level: 1, pendingXp: 0, totalXp: 10 });

    await expect(
      store.db.transaction((tx) =>
        postXpEventInTransaction(
          tx,
          {
            amount: -25,
            idempotencyKey: "content-removal-floor",
            kind: "reversal",
            reasonCode: "content_removed",
            sourceRef: "comment:removed",
            userId: "user-1",
          },
          new Date("2026-08-10T00:00:00.000Z")
        )
      )
    ).resolves.toMatchObject({ settledXp: -10, totalXp: 0 });
    expect(store.getProgression()).toMatchObject({ level: 1, totalXp: 0 });
  });

  it("keeps release creation on its source day and updates it on release day", async () => {
    flags.accrual = true;
    const store = createDatabase();
    const sourceDay = new Date("2026-08-07T23:59:59.000Z");
    const releaseDay = new Date("2026-08-08T00:00:01.000Z");
    await store.db.transaction((tx) =>
      postXpEventInTransaction(
        tx,
        {
          amount: 1,
          idempotencyKey: "activate-source-day",
          kind: "comic_reading",
          reasonCode: "verified_comic_reading",
          sourceRef: "comic:source-day",
          userId: "user-1",
        },
        sourceDay
      )
    );
    await store.db.transaction((tx) =>
      postXpEventInTransaction(
        tx,
        {
          amount: 1,
          idempotencyKey: "pending-release:event-1",
          kind: "comic_reading",
          reasonCode: "verified_comic_reading",
          sourceCreatedAt: sourceDay,
          sourceRef: "comic:source-day:release",
          userId: "user-1",
        },
        releaseDay
      )
    );

    expect(store.getEvent()?.createdAt).toEqual(sourceDay);
    expect(store.getEvent()?.updatedAt).toEqual(releaseDay);
  });
  it("keeps one coherent account dormant, active, paused, banned, and debt-safe", async () => {
    const store = createDatabase();

    await expect(getUserProgression(store.db, "user-1")).resolves.toMatchObject(
      { level: 1, pendingXp: 0, totalXp: 0 }
    );
    await expect(
      postXpEvent(store.db, {
        amount: 42,
        idempotencyKey: "coherent:disabled-reading",
        kind: "comic_reading",
        reasonCode: "verified_pages",
        sourceRef: "comic:disabled",
        userId: "user-1",
      })
    ).rejects.toMatchObject({ code: "ACCRUAL_DISABLED" });
    expect(store.getActivation()).toBeNull();

    flags.accrual = true;
    await postXpEvent(store.db, {
      amount: 42,
      idempotencyKey: "coherent:reading",
      kind: "comic_reading",
      reasonCode: "verified_pages",
      sourceRef: "comic:active",
      userId: "user-1",
    });
    await postXpEvent(store.db, {
      amount: 25,
      idempotencyKey: "coherent:review",
      kind: "review_milestone",
      reasonCode: "eligible_likes_3",
      sourceRef: "review:active",
      userId: "user-1",
    });
    await postXpEvent(store.db, {
      amount: 10,
      idempotencyKey: "coherent:comment",
      kind: "comment_milestone",
      reasonCode: "eligible_likes_2",
      sourceRef: "comment:active",
      userId: "user-1",
    });
    expect(store.getProgression()).toMatchObject({ level: 2, totalXp: 77 });
    expect(ledger.balance).toBe(10n);

    flags.accrual = false;
    await expect(
      postXpEvent(store.db, {
        amount: 1,
        idempotencyKey: "coherent:paused",
        kind: "comic_reading",
        reasonCode: "verified_pages",
        sourceRef: "comic:paused",
        userId: "user-1",
      })
    ).rejects.toMatchObject({ code: "ACCRUAL_DISABLED" });
    expect(store.getProgression()).toMatchObject({ totalXp: 77 });

    flags.accrual = true;
    store.setBanned(true);
    await expect(
      postXpEvent(store.db, {
        amount: 1,
        idempotencyKey: "coherent:banned",
        kind: "comic_reading",
        reasonCode: "verified_pages",
        sourceRef: "comic:banned",
        userId: "user-1",
      })
    ).rejects.toMatchObject({ code: "ACCOUNT_BANNED" });

    store.setBanned(false);
    store.spend(10n);
    await adjustXp(store.db, {
      actorUserId: "owner-1",
      amount: -11,
      idempotencyKey: "coherent:confirmed-reversal",
      reason: "Reversi\u00F3n humana confirmada por abuso",
      userId: "user-1",
    });
    expect(store.getProgression()).toMatchObject({ level: 1, totalXp: 66 });
    expect(ledger.balance).toBe(-10n);
  });

  it("lazily creates a dormant level-1 identity with authoritative flags", async () => {
    const store = createDatabase();

    await expect(getUserProgression(store.db, "user-1")).resolves.toEqual({
      accrualEnabled: false,
      automaticRewards: [
        { amount: 10, level: 2 },
        { amount: 10, level: 3 },
        { amount: 10, level: 4 },
        { amount: 10, level: 5 },
        { amount: 10, level: 6 },
      ],
      enabled: false,
      level: 1,
      nextLevelTotalXp: 67,
      pendingXp: 0,
      progress: 0,
      totalXp: 0,
      xpForNextLevel: 67,
    });
    expect(store.getProgression()).toMatchObject({ level: 1, totalXp: 0 });
    expect(store.getActivation()).toBeNull();
  });

  it("returns only public Account Level and keeps history metadata private", async () => {
    flags.economy = true;
    const store = createDatabase();
    store.addHistory({
      amount: 67,
      createdAt: new Date("2026-08-07T00:00:00.000Z"),
      id: "event-1",
      kind: "admin_adjustment",
      metadata: { reason: "private" },
      state: "posted",
    });

    await expect(getPublicAccountLevel(store.db, "user-1")).resolves.toEqual({
      level: 1,
    });
    const history = await listUserXpHistory(store.db, {
      limit: 20,
      userId: "user-1",
    });
    expect(history.items).toEqual([
      {
        amount: 67,
        createdAt: "2026-08-07T00:00:00.000Z",
        id: "event-1",
        kind: "admin_adjustment",
        label: "Corrección de Account XP",
        state: "posted",
      },
    ]);
  });

  it("omits public Account Level while the economy is disabled", async () => {
    flags.economy = false;
    const store = createDatabase();

    await expect(getPublicAccountLevel(store.db, "user-1")).resolves.toBeNull();
  });

  it("enforces the visibility gate on private history", async () => {
    const store = createDatabase();

    await expect(
      listUserXpHistory(store.db, { limit: 20, userId: "user-1" })
    ).rejects.toMatchObject({ code: "VISIBILITY_DISABLED" });
    await expect(
      listUserXpHistory(store.db, {
        authorizedStaff: true,
        limit: 20,
        userId: "user-1",
      })
    ).resolves.toEqual({ items: [], nextCursor: null });
  });

  it("activates once and replays an owner correction idempotently", async () => {
    flags.accrual = true;
    const store = createDatabase();
    const command = {
      actorUserId: "owner-1",
      amount: 67,
      idempotencyKey: "support-ticket-123456",
      reason: "Correccion aprobada por soporte",
      userId: "user-1",
    };

    const first = await adjustXp(store.db, command);
    const activatedAt = store.getActivation()?.activatedAt;
    const replay = await adjustXp(store.db, command);

    expect(replay).toEqual(first);
    expect(store.getActivation()?.activatedAt).toEqual(activatedAt);
    expect(store.getProgression()).toMatchObject({ level: 2, totalXp: 67 });
    expect(store.getEvent()).toMatchObject({ amount: 67, userId: "user-1" });
    expect(ledger.balance).toBe(10n);
    expect(ledger.calls).toHaveLength(1);
    expect(ledger.notifications.map(({ title }) => title)).toEqual([
      "Subiste al nivel 2",
      "Tu Account XP fue ajustado",
    ]);
  });

  it("settles every crossed level once with versioned ledger metadata", async () => {
    flags.accrual = true;
    const store = createDatabase();
    const command = {
      actorUserId: "owner-1",
      amount: 133,
      idempotencyKey: "multi-level-grant",
      reason: "Correccion aprobada por soporte",
      userId: "user-1",
    };

    await expect(adjustXp(store.db, command)).resolves.toMatchObject({
      level: 3,
      totalXp: 133,
    });
    await adjustXp(store.db, command);

    expect(ledger.balance).toBe(20n);
    expect(ledger.calls.map(({ metadata }) => metadata)).toEqual([
      expect.objectContaining({ level: 2, rewardConfigVersion: "v1" }),
      expect.objectContaining({ level: 3, rewardConfigVersion: "v1" }),
    ]);
    expect(store.getEvents()).toHaveLength(1);
  });

  it("applies automatic rewards through the shared posted-XP command", async () => {
    flags.accrual = true;
    const store = createDatabase();

    await postXpEvent(store.db, {
      amount: 67,
      idempotencyKey: "review-milestone-1",
      kind: "review_milestone",
      reasonCode: "eligible_likes_3",
      sourceRef: "review:review-1:likes:3",
      userId: "user-1",
    });

    expect(store.getProgression()).toMatchObject({ level: 2, totalXp: 67 });
    expect(ledger.balance).toBe(10n);
  });

  it("reverses lost rewards into debt and grants a regained level from the new crossing", async () => {
    flags.accrual = true;
    const store = createDatabase();
    await adjustXp(store.db, {
      actorUserId: "owner-1",
      amount: 133,
      idempotencyKey: "grant-level-three",
      reason: "Correccion aprobada por soporte",
      userId: "user-1",
    });
    store.spend(15n);

    await expect(
      adjustXp(store.db, {
        actorUserId: "owner-1",
        amount: -66,
        idempotencyKey: "lose-level-three",
        reason: "Reversion aprobada por soporte",
        userId: "user-1",
      })
    ).resolves.toMatchObject({ level: 2, totalXp: 67 });
    expect(ledger.balance).toBe(-5n);
    expect(store.getLevelRewardQuery()).toMatchObject({
      where: expect.anything(),
    });
    expect(store.getLevelRewardQuery()).not.toHaveProperty("with");
    expect(ledger.notifications.map(({ title }) => title)).toEqual([
      "Subiste al nivel 3",
      "Tu Account XP fue ajustado",
      "Tu Billetera Eteris tiene deuda",
      "Tu Account XP fue ajustado",
    ]);

    await adjustXp(store.db, {
      actorUserId: "owner-1",
      amount: 66,
      idempotencyKey: "regain-level-three",
      reason: "Correccion aprobada por soporte",
      userId: "user-1",
    });
    expect(ledger.balance).toBe(5n);
    expect(
      ledger.calls.filter(({ kind }) => kind === "level_reward")
    ).toHaveLength(3);
    expect(ledger.calls.at(-1)?.idempotencyKey).toMatch(/^level-reward:.+:3$/);
  });

  it("uses the locked level-reward reversal to detect newly created debt", async () => {
    flags.accrual = true;
    const store = createDatabase();
    await adjustXp(store.db, {
      actorUserId: "owner-1",
      amount: 67,
      idempotencyKey: "grant-level-two-before-concurrent-debt",
      reason: "Correccion aprobada por soporte",
      userId: "user-1",
    });
    store.spend(15n);
    ledger.notifications = [];
    ledger.reversalDebtCreated = true;

    await adjustXp(store.db, {
      actorUserId: "owner-1",
      amount: -1,
      idempotencyKey: "lose-level-two-after-concurrent-adjustment",
      reason: "Reversion aprobada por soporte",
      userId: "user-1",
    });

    expect(ledger.notifications.map(({ title }) => title)).toContain(
      "Tu Billetera Eteris tiene deuda"
    );
  });

  it("reverses the reward actually posted by a backdated Pending release", async () => {
    flags.accrual = true;
    const store = createDatabase();
    const firstPostedAt = new Date("2026-08-08T00:00:00.000Z");
    const pendingSourceAt = new Date("2026-08-07T00:00:00.000Z");
    const pendingReleasedAt = new Date("2026-08-09T00:00:00.000Z");

    await store.db.transaction((tx) =>
      postXpEventInTransaction(
        tx,
        {
          amount: 67,
          idempotencyKey: "first-level-crossing",
          kind: "review_milestone",
          reasonCode: "eligible_likes_3",
          sourceRef: "review:first",
          userId: "user-1",
        },
        firstPostedAt
      )
    );
    const firstEventId = store.getEvent()?.id;
    await store.db.transaction((tx) =>
      postXpEventInTransaction(
        tx,
        {
          amount: 66,
          idempotencyKey: "pending-release:backdated",
          kind: "review_milestone",
          reasonCode: "eligible_likes_10",
          sourceCreatedAt: pendingSourceAt,
          sourceRef: "review:backdated",
          userId: "user-1",
        },
        pendingReleasedAt
      )
    );
    const releasedEventId = store.getEvent()?.id;
    expect(releasedEventId).not.toBe(firstEventId);

    await expect(
      store.db.transaction((tx) =>
        postXpEventInTransaction(
          tx,
          {
            amount: -66,
            idempotencyKey: "reverse-backdated-release",
            kind: "reversal",
            reasonCode: "confirmed_integrity_abuse",
            sourceRef: "integrity:backdated",
            userId: "user-1",
          },
          new Date("2026-08-10T00:00:00.000Z")
        )
      )
    ).resolves.toMatchObject({ level: 2, totalXp: 67 });
    expect(ledger.calls.at(-1)).toMatchObject({
      originalIdempotencyKey: `level-reward:${releasedEventId}:3`,
    });
  });

  it("rolls back XP and every reward when one ledger posting fails", async () => {
    flags.accrual = true;
    ledger.failAtCall = 2;
    const store = createDatabase();

    await expect(
      adjustXp(store.db, {
        actorUserId: "owner-1",
        amount: 133,
        idempotencyKey: "atomic-failure",
        reason: "Correccion aprobada por soporte",
        userId: "user-1",
      })
    ).rejects.toThrow("ledger failure");
    expect(store.getActivation()).toBeNull();
    expect(store.getProgression()).toBeNull();
    expect(store.getEvents()).toHaveLength(0);
    expect(ledger.balance).toBe(0n);
    expect(ledger.transactions.size).toBe(0);
    expect(ledger.notifications).toHaveLength(0);
  });

  it("keeps the source action successful when a reward detects a frozen projection", async () => {
    flags.accrual = true;
    ledger.mismatchAtCall = 1;
    const store = createDatabase();

    await expect(
      postXpEvent(store.db, {
        amount: 67,
        idempotencyKey: "projection-mismatch-source",
        kind: "review_milestone",
        reasonCode: "eligible_likes_3",
        sourceRef: "review:projection-mismatch",
        userId: "user-1",
      })
    ).resolves.toMatchObject({
      eventId: null,
      settledXp: 0,
      totalXp: 0,
    });
    expect(store.getEvents()).toHaveLength(0);
    expect(store.getProgression()).toMatchObject({ level: 1, totalXp: 0 });
  });

  it("rejects an owner adjustment when its level reward detects a projection mismatch", async () => {
    flags.accrual = true;
    ledger.mismatchAtCall = 1;
    const store = createDatabase();

    await expect(
      adjustXp(store.db, {
        actorUserId: "owner-1",
        amount: 67,
        idempotencyKey: "projection-mismatch-adjustment",
        reason: "Correccion aprobada por soporte",
        userId: "user-1",
      })
    ).rejects.toMatchObject({ code: "PROJECTION_MISMATCH" });
    expect(store.getEvents()).toHaveLength(0);
    expect(ledger.notifications).toHaveLength(0);
  });

  it("rejects disabled and out-of-range corrections without changing totals", async () => {
    const store = createDatabase();
    await expect(
      adjustXp(store.db, {
        actorUserId: "owner-1",
        amount: 1,
        idempotencyKey: "support-ticket-disabled",
        reason: "Correccion aprobada por soporte",
        userId: "user-1",
      })
    ).rejects.toMatchObject({ code: "ACCRUAL_DISABLED" });
    expect(store.getActivation()).toBeNull();

    flags.accrual = true;
    await getUserProgression(store.db, "user-1");
    await expect(
      adjustXp(store.db, {
        actorUserId: "owner-1",
        amount: -1,
        idempotencyKey: "support-ticket-negative",
        reason: "Correccion aprobada por soporte",
        userId: "user-1",
      })
    ).rejects.toMatchObject({ code: "INVALID_TOTAL" });
    expect(store.getProgression()).toMatchObject({ totalXp: 0 });
  });

  it("freezes new XP while banned without confiscating settled XP", async () => {
    flags.accrual = true;
    const store = createDatabase();
    await adjustXp(store.db, {
      actorUserId: "owner-1",
      amount: 67,
      idempotencyKey: "pre-ban-xp",
      reason: "Credito legitimo anterior al baneo",
      userId: "user-1",
    });
    store.setBanned(true);

    await expect(
      adjustXp(store.db, {
        actorUserId: "owner-1",
        amount: 1,
        idempotencyKey: "banned-xp-attempt",
        reason: "Intento de credito durante un baneo",
        userId: "user-1",
      })
    ).rejects.toMatchObject({ code: "ACCOUNT_BANNED" });
    expect(store.getProgression()).toMatchObject({ level: 2, totalXp: 67 });
    expect(store.getEvents()).toHaveLength(1);
  });

  it("clips positive XP at the published cap without aborting the source action", async () => {
    flags.accrual = true;
    const store = createDatabase();
    store.setProgression({ level: 999, pendingXp: 0, totalXp: 364_995 });

    await expect(
      postXpEvent(store.db, {
        amount: 10,
        idempotencyKey: "cap-crossing",
        kind: "comic_reading",
        reasonCode: "verified_pages",
        sourceRef: "comic:cap-crossing",
        userId: "user-1",
      })
    ).resolves.toMatchObject({ settledXp: 5, totalXp: 365_000 });
    expect(store.getEvent()).toMatchObject({
      amount: 5,
      metadata: expect.objectContaining({ requestedAmount: 10 }),
    });

    await expect(
      postXpEvent(store.db, {
        amount: 1,
        idempotencyKey: "already-at-cap",
        kind: "comic_reading",
        reasonCode: "verified_pages",
        sourceRef: "comic:already-at-cap",
        userId: "user-1",
      })
    ).resolves.toMatchObject({ eventId: null, settledXp: 0 });
    expect(store.getEvents()).toHaveLength(1);
  });

  it("rejects a no-op owner adjustment at the XP cap", async () => {
    flags.accrual = true;
    const store = createDatabase();
    store.setProgression({ level: 1000, pendingXp: 0, totalXp: 365_000 });

    await expect(
      adjustXp(store.db, {
        actorUserId: "owner-1",
        amount: 1,
        idempotencyKey: "owner-adjustment-at-cap",
        reason: "Correccion aprobada por soporte",
        userId: "user-1",
      })
    ).rejects.toMatchObject({ code: "INVALID_TOTAL" });
    expect(store.getEvents()).toHaveLength(0);
    expect(ledger.notifications).toHaveLength(0);
  });
});
