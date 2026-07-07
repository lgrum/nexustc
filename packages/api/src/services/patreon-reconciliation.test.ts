import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/env", () => ({
  env: {
    PATREON_CAMPAIGN_ID: "campaign-1",
  },
}));

vi.mock("@repo/db", () => ({
  db: {},
  eq: vi.fn((left, right) => ({ left, right })),
}));

vi.mock("@repo/db/schema/app", () => ({
  account: {
    id: "account.id",
  },
  patron: {
    id: "patron.id",
  },
}));

const { reconcilePatreonMemberships } =
  await import("./patreon-reconciliation");

function createUpdateMock() {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(),
    }),
  };
}

function createDatabase({
  accountRecord,
  patronRecords,
}: {
  accountRecord?: unknown;
  patronRecords: unknown[];
}) {
  return {
    query: {
      account: {
        findFirst: vi.fn().mockResolvedValue(accountRecord ?? null),
      },
      patron: {
        findMany: vi.fn().mockResolvedValue(patronRecords),
      },
    },
    update: vi.fn().mockReturnValue(createUpdateMock()),
  };
}

const activePatron = {
  id: "patron-1",
  isActivePatron: true,
  patreonUserId: "patreon-user-1",
  patronSince: new Date("2026-04-21T04:55:03.130Z"),
  pledgeAmountCents: 1200,
  tier: "level12",
  userId: "user-1",
};

const linkedAccount = {
  accessToken: "access-token",
  accessTokenExpiresAt: new Date("2026-06-30T00:00:00.000Z"),
  accountId: "patreon-user-1",
  id: "account-1",
  providerId: "patreon",
  refreshToken: "refresh-token",
};

describe(reconcilePatreonMemberships, () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deactivates expired non-permanent patrons and clears patronSince", async () => {
    const database = createDatabase({
      accountRecord: linkedAccount,
      patronRecords: [activePatron],
    });
    const summary = await reconcilePatreonMemberships({
      db: database as never,
      dependencies: {
        fetchMembership: vi.fn().mockResolvedValue({
          entitledTierIds: [],
          isActive: false,
          patronSince: null,
          pledgeAmountCents: 0,
        }),
        now: () => new Date("2026-05-29T12:00:00.000Z"),
      },
      dryRun: false,
    });

    expect(summary.deactivated).toBe(1);
    expect(summary.results[0]).toMatchObject({
      action: "deactivated",
      nextTier: "none",
      reason: "expired_or_missing_membership",
    });

    const patronUpdate = database.update.mock.results[0]?.value;
    expect(patronUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({
        isActivePatron: false,
        patronSince: null,
        pledgeAmountCents: 0,
        tier: "none",
      })
    );
  });

  it("reports dry-run deactivations without mutating patron records", async () => {
    const database = createDatabase({
      accountRecord: linkedAccount,
      patronRecords: [activePatron],
    });
    const summary = await reconcilePatreonMemberships({
      db: database as never,
      dependencies: {
        fetchMembership: vi.fn().mockResolvedValue(null),
      },
    });

    expect(summary.dryRun).toBe(true);
    expect(summary.deactivated).toBe(1);
    expect(database.update).not.toHaveBeenCalled();
  });

  it("deactivates non-permanent patrons when Patreon tokens are invalid", async () => {
    const database = createDatabase({
      accountRecord: {
        ...linkedAccount,
        accessTokenExpiresAt: new Date("2026-05-28T00:00:00.000Z"),
      },
      patronRecords: [activePatron],
    });
    const summary = await reconcilePatreonMemberships({
      db: database as never,
      dependencies: {
        now: () => new Date("2026-05-29T12:00:00.000Z"),
        refreshToken: vi.fn().mockRejectedValue(new Error("invalid_grant")),
      },
      dryRun: false,
    });

    expect(summary.deactivated).toBe(1);
    expect(summary.results[0]).toMatchObject({
      action: "deactivated",
      reason: "invalid_refresh_token",
    });
  });

  it("does not deactivate patrons on transient Patreon API failures", async () => {
    const database = createDatabase({
      accountRecord: linkedAccount,
      patronRecords: [activePatron],
    });
    const summary = await reconcilePatreonMemberships({
      db: database as never,
      dependencies: {
        fetchMembership: vi
          .fn()
          .mockRejectedValue(new Error("gateway timeout")),
        now: () => new Date("2026-05-29T12:00:00.000Z"),
      },
      dryRun: false,
    });

    expect(summary.failed).toBe(1);
    expect(summary.results[0]).toMatchObject({
      action: "failed",
      nextTier: "level12",
      reason: "patreon_api_error",
    });
    expect(database.update).not.toHaveBeenCalled();
  });

  it("does not reconcile permanent patron tiers", async () => {
    const database = createDatabase({
      patronRecords: [
        {
          ...activePatron,
          tier: "level100",
        },
      ],
    });
    const summary = await reconcilePatreonMemberships({
      db: database as never,
      dryRun: false,
    });

    expect(summary.skippedPermanent).toBe(1);
    expect(summary.results[0]).toMatchObject({
      action: "skipped_permanent",
      nextTier: "level100",
      reason: "permanent_tier",
    });
    expect(database.query.account.findFirst).not.toHaveBeenCalled();
    expect(database.update).not.toHaveBeenCalled();
  });
});
