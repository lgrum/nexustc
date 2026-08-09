import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  accrualEnabled: true,
  active: true,
  economyEnabled: true,
  events: [] as string[],
  month: "2026-06",
  posted: [] as { amount: bigint; month: string }[],
  posts: [] as Record<string, unknown>[],
  tier: "level12",
}));

vi.mock("@repo/env", () => ({
  env: {
    get XP_ACCRUAL_ENABLED() {
      return state.accrualEnabled;
    },
    get XP_ECONOMY_ENABLED() {
      return state.economyEnabled;
    },
  },
}));

vi.mock("./progression-activation", () => ({
  ensureProgressionActivationInTransaction: vi.fn(() => {
    state.events.push("activation");
    return Promise.resolve(new Date("2026-01-01T00:00:00.000Z"));
  }),
}));

vi.mock("@repo/db", () => ({
  and: vi.fn(() => "and"),
  eq: vi.fn(() => "eq"),
  gte: vi.fn(() => "gte"),
  lt: vi.fn(() => "lt"),
}));

vi.mock("@repo/db/schema/app", () => ({
  eterisPosting: { amount: "posting.amount", walletId: "posting.walletId" },
  eterisTransaction: {
    createdAt: "transaction.createdAt",
    id: "transaction.id",
    kind: "transaction.kind",
    sourceModule: "transaction.sourceModule",
  },
  eterisWalletBalance: { walletId: "balance.walletId" },
  patron: { userId: "patron.userId" },
}));

vi.mock("./eteris", () => ({
  getOrCreateUserWalletInTransaction: vi.fn(() =>
    Promise.resolve({ id: "wallet-user-1" })
  ),
  lockEterisWalletsInTransaction: vi.fn(() => {
    state.events.push("lock");
    return Promise.resolve([
      { walletId: "eteris-system-mint" },
      { walletId: "wallet-user-1" },
    ]);
  }),
  postEterisTransactionInTransaction: vi.fn(
    (_tx: unknown, input: Record<string, unknown>) => {
      state.events.push("post");
      state.posts.push(input);
      const userPosting = (
        input.postings as { amount: bigint; walletId: string }[]
      ).find(({ walletId }) => walletId === "wallet-user-1")!;
      const month = String(input.sourceRef).split(":").at(-3)!;
      state.posted.push({ amount: userPosting.amount, month });
      return Promise.resolve({
        id: `transaction-${state.posts.length}`,
        replayed: false,
      });
    }
  ),
}));

const { grantMonthlyPatreonStipend, grantMonthlyPatreonStipends } =
  await import("./patreon-stipend");

function createDatabase() {
  let queue = Promise.resolve();
  const tx = {
    query: {
      patron: {
        findFirst: vi.fn(() =>
          Promise.resolve({
            isActivePatron: state.active,
            tier: state.tier,
          })
        ),
      },
    },
    select: vi.fn((_fields: Record<string, unknown>) => ({
      from: () => ({
        innerJoin: () => ({
          where: () => {
            state.events.push("sum");
            return Promise.resolve(
              state.posted
                .filter(({ month }) => month === state.month)
                .map(({ amount }) => ({ amount }))
            );
          },
        }),
      }),
    })),
  };

  return {
    query: {
      patron: {
        findMany: vi.fn().mockResolvedValue([{ userId: "user-1" }]),
      },
    },
    async transaction<T>(callback: (executor: typeof tx) => Promise<T>) {
      const previous = queue;
      let release: (() => void) | undefined;
      queue = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await callback(tx);
      } finally {
        release?.();
      }
    },
  };
}

describe(grantMonthlyPatreonStipend, () => {
  beforeEach(() => {
    state.accrualEnabled = true;
    state.active = true;
    state.economyEnabled = true;
    state.events = [];
    state.month = "2026-06";
    state.posted = [];
    state.posts = [];
    state.tier = "level12";
  });

  it("locks before summing and posts the safe monthly Mint to User grant", async () => {
    const result = await grantMonthlyPatreonStipend(
      createDatabase() as never,
      "user-1",
      new Date("2026-06-30T23:59:59.999Z")
    );

    expect(state.events).toEqual(["activation", "lock", "sum", "post"]);
    expect(result).toMatchObject({ granted: "600", month: "2026-06" });
    expect(state.posts).toEqual([
      expect.objectContaining({
        createdAt: new Date("2026-06-30T23:59:59.999Z"),
        idempotencyKey: "vip:wallet-user-1:2026-06:target:600",
        kind: "vip_stipend",
        metadata: { month: "2026-06", tier: "level12", version: "v1" },
        postings: [
          { amount: 600n, walletId: "wallet-user-1" },
          { amount: -600n, walletId: "eteris-system-mint" },
        ],
        sourceModule: "patreon",
      }),
    ]);
  });

  it("grants once under retries and concurrent calls", async () => {
    const database = createDatabase() as never;
    const now = new Date("2026-06-15T12:00:00.000Z");

    const results = await Promise.all([
      grantMonthlyPatreonStipend(database, "user-1", now),
      grantMonthlyPatreonStipend(database, "user-1", now),
      grantMonthlyPatreonStipend(database, "user-1", now),
    ]);

    expect(state.posts).toHaveLength(1);
    expect(results.map(({ granted }) => granted)).toEqual(["600", "0", "0"]);
  });

  it("pays only an upgrade delta and never claws back a downgrade or cancellation", async () => {
    const database = createDatabase() as never;
    const now = new Date("2026-06-15T12:00:00.000Z");
    state.tier = "level3";
    await grantMonthlyPatreonStipend(database, "user-1", now);
    state.tier = "level12";
    await grantMonthlyPatreonStipend(database, "user-1", now);
    state.tier = "level1";
    const downgraded = await grantMonthlyPatreonStipend(
      database,
      "user-1",
      now
    );
    state.active = false;
    const cancelled = await grantMonthlyPatreonStipend(database, "user-1", now);

    expect(state.posted.map(({ amount }) => amount)).toEqual([150n, 450n]);
    expect(downgraded.granted).toBe("0");
    expect(cancelled.granted).toBe("0");
  });

  it("starts a fresh grant at the UTC month boundary without backfilling disabled months", async () => {
    const database = createDatabase() as never;
    state.accrualEnabled = false;
    const disabled = await grantMonthlyPatreonStipend(
      database,
      "user-1",
      new Date("2026-06-30T23:59:59.999Z")
    );
    state.accrualEnabled = true;
    state.month = "2026-07";
    const enabled = await grantMonthlyPatreonStipend(
      database,
      "user-1",
      new Date("2026-07-01T00:00:00.000Z")
    );

    expect(disabled.granted).toBe("0");
    expect(enabled).toMatchObject({ granted: "600", month: "2026-07" });
    expect(state.posts).toHaveLength(1);
  });

  it("does not grant while economy reads are master-hidden", () => {
    state.economyEnabled = false;

    expect(
      grantMonthlyPatreonStipend(
        createDatabase() as never,
        "user-1",
        new Date("2026-06-15T12:00:00.000Z")
      )
    ).toEqual({ granted: "0", month: "2026-06" });
    expect(state.events).toEqual([]);
    expect(state.posts).toEqual([]);
  });
});

describe(grantMonthlyPatreonStipends, () => {
  beforeEach(() => {
    state.accrualEnabled = true;
    state.active = true;
    state.economyEnabled = true;
    state.events = [];
    state.month = "2026-06";
    state.posted = [];
    state.posts = [];
    state.tier = "level12";
  });

  it("checks active patrons through the recurring batch path", async () => {
    const result = await grantMonthlyPatreonStipends(
      createDatabase() as never,
      new Date("2026-06-15T12:00:00.000Z")
    );

    expect(result).toEqual({ checked: 1, granted: 1 });
    expect(state.posts).toHaveLength(1);
  });
});
