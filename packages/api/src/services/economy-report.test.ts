import type { db as database } from "@repo/db";

import { getDailyEconomyReport } from "./economy-report";

type Database = typeof database;

test("the current UTC report refreshes under the database lock and exposes only aggregate data", async () => {
  let snapshot: Record<string, unknown> | undefined;
  let metricQueries = 0;
  const executor = {
    execute: vi.fn((_query?: unknown) => {
      metricQueries += 1;
      if (metricQueries % 2 === 1) {
        return Promise.resolve({ rows: [] });
      }
      const issued = metricQueries === 2 ? "700" : "725";
      return Promise.resolve({
        rows: [
          {
            anomalous_earners: [{ total: "600", userId: "account-1" }],
            balance_percentiles: { p50: "50", p90: "500", p99: "590" },
            burned: "100",
            burned_by_reason: { purchase: "100" },
            frozen_wallet_count: 1,
            issued,
            issued_by_reason: {
              level_reward: metricQueries === 2 ? "100" : "125",
              vip_stipend: "600",
            },
            negative_wallet_count: 1,
            total_user_supply: "600",
          },
        ],
      });
    }),
    insert: vi.fn(() => ({
      values: vi.fn((value: Record<string, unknown>) => {
        snapshot = value;
        return {
          onConflictDoUpdate: vi.fn(() => Promise.resolve()),
        };
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
  const generatedAt = new Date("2026-08-08T00:01:00.000Z");

  const first = await getDailyEconomyReport(db, now, generatedAt);
  const repeated = await getDailyEconomyReport(db, now, generatedAt);

  expect(first).toEqual({
    anomalousEarners: [{ total: "600", userId: "account-1" }],
    balancePercentiles: { p50: "50", p90: "500", p99: "590" },
    burned: "100",
    burnedByReason: { purchase: "100" },
    createdAt: generatedAt.toISOString(),
    day: "2026-08-07",
    frozenWalletCount: 1,
    issued: "700",
    issuedByReason: { level_reward: "100", vip_stipend: "600" },
    negativeWalletCount: 1,
    sourceSinkRatio: "7.0000",
    totalUserSupply: "600",
  });
  expect(repeated).toMatchObject({ issued: "725" });
  expect(executor.insert).toHaveBeenCalledTimes(2);
  expect(executor.execute).toHaveBeenCalledTimes(4);
  const metricsQuery = JSON.stringify(executor.execute.mock.calls[1]?.[0]);
  expect(metricsQuery).toContain("source_cap_pressure");
  expect(metricsQuery).toContain("integrity_case_id");
  expect(metricsQuery).toContain("xpEventId");
  expect(metricsQuery).toContain("jsonb_array_elements");
  expect(metricsQuery).toContain("daily_transaction_flows");
  expect(metricsQuery).toContain("balance_after");
  expect(metricsQuery).toContain("eteris_wallet_status_event");
  expect(metricsQuery).toContain("wallets_at_cutoff");
  expect(metricsQuery).toContain("anonymized_at");
  expect(metricsQuery).toContain("anonymized_at >=");
  expect(metricsQuery).toContain("user_delta");
  expect(metricsQuery).toContain("status = 'frozen'");
  expect(metricsQuery).toContain("from eteris_wallet");
  expect(metricsQuery).not.toContain(
    "from user_wallets where status = 'frozen'"
  );
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
    execute: vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            anomalous_earners: snapshot.anomalousEarners,
            balance_percentiles: snapshot.balancePercentiles,
            burned: snapshot.burned.toString(),
            burned_by_reason: snapshot.burnedByReason,
            frozen_wallet_count: snapshot.frozenWalletCount,
            issued: snapshot.issued.toString(),
            issued_by_reason: snapshot.issuedByReason,
            negative_wallet_count: snapshot.negativeWalletCount,
            total_user_supply: snapshot.totalUserSupply.toString(),
          },
        ],
      }),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn(() => Promise.resolve()),
      })),
    })),
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
