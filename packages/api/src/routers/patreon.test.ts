import { call } from "@orpc/server";
import { beforeEach, expect, test, vi } from "vitest";

import type { Context } from "../context";

const mocks = vi.hoisted(() => ({
  fetchMembership: vi.fn(),
  grantStipend: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("@repo/auth", () => ({
  auth: { api: { userHasPermission: vi.fn(() => ({ success: false })) } },
}));
vi.mock("@repo/db", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getRedis: vi.fn().mockResolvedValue({}),
}));
vi.mock("@repo/env", () => ({
  env: { PATREON_CAMPAIGN_ID: "campaign-1" },
}));
vi.mock("../utils/redis-operations", () => ({
  checkFixedWindowRateLimit: mocks.rateLimit,
  checkSlidingWindowRateLimit: vi.fn(),
}));
vi.mock("../utils/patreon", () => ({
  fetchPatreonMembership: mocks.fetchMembership,
  refreshPatreonToken: vi.fn(),
}));
vi.mock("../services/patreon-stipend", () => ({
  grantMonthlyPatreonStipend: mocks.grantStipend,
}));

const { default: patreonRouter } = await import("./patreon");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rateLimit.mockResolvedValue({ exceeded: false });
  mocks.fetchMembership.mockResolvedValue({
    entitledTierIds: [],
    isActive: false,
    patronSince: null,
    pledgeAmountCents: 0,
  });
});

test("keeps a successful membership sync when stipend settlement fails", async () => {
  mocks.grantStipend.mockRejectedValueOnce(new Error("wallet mismatch"));
  const onConflictDoUpdate = vi.fn().mockResolvedValue();
  const db = {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ onConflictDoUpdate })),
    })),
    query: {
      account: {
        findFirst: vi.fn().mockResolvedValue({
          accessToken: "access-token",
          accessTokenExpiresAt: null,
          accountId: "patreon-user-1",
          id: "account-1",
          refreshToken: "refresh-token",
        }),
      },
      patron: { findFirst: vi.fn().mockResolvedValue(null) },
    },
  };
  const context = {
    db,
    headers: new Headers(),
    session: { user: { id: "user-1", role: "user" } },
  } as unknown as Context;

  await expect(
    call(patreonRouter.syncMembership, undefined, { context })
  ).resolves.toMatchObject({ isActivePatron: false, tier: "none" });

  expect(onConflictDoUpdate).toHaveBeenCalledOnce();
  expect(mocks.grantStipend).toHaveBeenCalledWith(db, "user-1");
});
