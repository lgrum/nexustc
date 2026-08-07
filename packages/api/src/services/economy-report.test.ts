import type { db as database } from "@repo/db";

import { getDailyEconomyReport } from "./economy-report";

type Database = typeof database;

test("the UTC report is generated once under the database lock and exposes only aggregate data", async () => {
  let snapshot: Record<string, unknown> | undefined;
  let metricQueries = 0;
  const executor = {
    execute: vi.fn(() => {
      metricQueries += 1;
      if (metricQueries % 2 === 1) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({
        rows: [
          {
            anomalous_earners: [{ total: "600", userId: "account-1" }],
            balance_percentiles: { p50: "50", p90: "500", p99: "590" },
            burned: "100",
            burned_by_reason: { purchase: "100" },
            frozen_wallet_count: 1,
            issued: "700",
            issued_by_reason: { level_reward: "100", vip_stipend: "600" },
            negative_wallet_count: 1,
            total_user_supply: "600",
          },
        ],
      });
    }),
    insert: vi.fn(() => ({
      values: vi.fn((value: Record<string, unknown>) => {
        snapshot = value;
        return { onConflictDoNothing: vi.fn(() => Promise.resolve()) };
      }),
    })),
    query: {
      eterisDailySnapshot: {
        findFirst: vi.fn(() => Promise.resolve(snapshot)),
      },
    },
  };
  const db = {
    transaction: vi.fn((callback: (tx: typeof executor) => unknown) =>
      callback(executor)
    ),
  } as unknown as Database;
  const now = new Date("2026-08-07T23:59:59.000Z");

  const first = await getDailyEconomyReport(db, now);
  const repeated = await getDailyEconomyReport(db, now);

  expect(first).toEqual({
    anomalousEarners: [{ total: "600", userId: "account-1" }],
    balancePercentiles: { p50: "50", p90: "500", p99: "590" },
    burned: "100",
    burnedByReason: { purchase: "100" },
    createdAt: expect.any(String),
    day: "2026-08-07",
    frozenWalletCount: 1,
    issued: "700",
    issuedByReason: { level_reward: "100", vip_stipend: "600" },
    negativeWalletCount: 1,
    sourceSinkRatio: "7.0000",
    totalUserSupply: "600",
  });
  expect(repeated).toEqual(first);
  expect(executor.insert).toHaveBeenCalledTimes(1);
  expect(executor.execute).toHaveBeenCalledTimes(3);
  expect(JSON.stringify(first)).not.toMatch(
    /"(?:email|deviceHash|ipPrefixHash|metadata)"/
  );
});

test("a report with issuance but no burns has no finite source/sink ratio", async () => {
  const snapshot = {
    anomalousEarners: [],
    balancePercentiles: { p50: "10", p90: "10", p99: "10" },
    burned: 0n,
    burnedByReason: {},
    createdAt: new Date("2026-08-07T00:00:00.000Z"),
    day: "2026-08-07",
    frozenWalletCount: 0,
    issued: 10n,
    issuedByReason: { level_reward: "10" },
    negativeWalletCount: 0,
    totalUserSupply: 10n,
  };
  const executor = {
    execute: vi.fn(() => Promise.resolve({ rows: [] })),
    query: {
      eterisDailySnapshot: {
        findFirst: vi.fn(() => Promise.resolve(snapshot)),
      },
    },
  };
  const db = {
    transaction: vi.fn((callback: (tx: typeof executor) => unknown) =>
      callback(executor)
    ),
  } as unknown as Database;

  await expect(
    getDailyEconomyReport(db, new Date("2026-08-07T12:00:00.000Z"))
  ).resolves.toMatchObject({ sourceSinkRatio: null });
});
