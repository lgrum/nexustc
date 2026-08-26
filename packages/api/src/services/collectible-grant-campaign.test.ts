import {
  collectibleGrantCampaign,
  collectibleGrantExecution,
  user as userTable,
} from "@repo/db/schema/app";
import { normalizeCollectiblePayload } from "@repo/shared/collectibles";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  collectibleGrantCampaignInputSchema,
  collectibleGrantExecutionInputSchema,
  deliverCollectibleGrantNotification,
  executeCollectibleGrantCampaign,
} from "./collectible-grant-campaign";

const flags = vi.hoisted(() => ({ collectibles: true }));
const issuance = vi.hoisted(() => ({
  issueCard: vi.fn(),
  issuePack: vi.fn(),
}));
const notification = vi.hoisted(() => ({
  createUserNotification: vi.fn(),
}));

vi.mock("@repo/env", () => ({
  env: {
    get COLLECTIBLES_ENABLED() {
      return flags.collectibles;
    },
  },
}));
vi.mock("./collectibles", () => ({
  assertCollectiblesMutationAllowed: vi.fn(() => {
    if (!flags.collectibles) {
      throw new Error("GATE_DISABLED");
    }
  }),
  withCollectibleDeadlockRetry: vi.fn((callback: () => unknown) => callback()),
}));
vi.mock("./collectible-issuance", () => ({
  CollectibleIssuanceError: class CollectibleIssuanceError extends Error {
    readonly code = "UNAVAILABLE";

    readonly markRevisionExhausted = false;

    constructor() {
      super("UNAVAILABLE");
      this.name = "CollectibleIssuanceError";
    }
  },
  issueCardInTransaction: issuance.issueCard,
  issuePackInTransaction: issuance.issuePack,
  runCollectibleIssuanceInTransaction: vi.fn(
    (_tx: unknown, callback: (tx: unknown) => unknown) => callback(_tx)
  ),
}));
vi.mock("./notification", () => notification);

describe("collectible grant campaign seam", () => {
  it("requires exactly one bounded card or Pack target", () => {
    expect(() =>
      collectibleGrantCampaignInputSchema.parse({
        auditReason: "Recompensa de lanzamiento",
        binding: "account-bound",
        cardTemplateId: "card-1",
        eligibilityExplanation: "Participantes elegibles",
        packTemplateId: "pack-1",
        perAccountQuantity: 1,
        quantityCeiling: 10,
      })
    ).toThrow("carta o a un Pack");
    expect(
      collectibleGrantCampaignInputSchema.parse({
        auditReason: "Recompensa de lanzamiento",
        binding: "account-bound",
        cardTemplateId: "card-1",
        eligibilityExplanation: "Participantes elegibles",
        perAccountQuantity: 1,
        quantityCeiling: 10,
      })
    ).toMatchObject({ cardTemplateId: "card-1", quantityCeiling: 10 });
    expect(() =>
      collectibleGrantCampaignInputSchema.parse({
        auditReason: "Recompensa de lanzamiento",
        binding: "account-bound",
        cardTemplateId: "card-1",
        eligibilityExplanation: "Participantes elegibles",
        perAccountQuantity: 11,
        quantityCeiling: 10,
      })
    ).toThrow("límite por cuenta");
  });

  it("delivers only involved-user metadata without hidden result IDs", async () => {
    notification.createUserNotification.mockResolvedValue("notification-1");
    await deliverCollectibleGrantNotification({} as never, {
      assetKind: "pack",
      campaignId: "campaign-1",
      executionId: "execution-1",
      quantity: 1,
      recipientUserId: "user-1",
    });
    expect(notification.createUserNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        dedupeKey: "collectible-grant:execution-1",
        targetUserId: "user-1",
      })
    );
    const input = notification.createUserNotification.mock.calls[0]?.[1] as {
      metadata: Record<string, unknown>;
    };
    expect(input.metadata).not.toHaveProperty("assetIds");
    expect(input.metadata).not.toHaveProperty("cardInstanceIds");
    expect(input.metadata.quantity).toBe(1);
  });

  it("rejects client-owned entropy, weights, candidates, and outcomes", () => {
    expect(() =>
      collectibleGrantExecutionInputSchema.parse({
        campaignId: "campaign-1",
        idempotencyKey: "grant-request-1",
        quantity: 1,
        random: 0.5,
        rarity: "legendary",
        recipientUserId: "user-1",
        result: ["card-1"],
        supply: 1,
        weight: 100,
      })
    ).toThrow();
  });
});

const campaign = {
  auditReason: "Recompensa de lanzamiento",
  binding: "account-bound" as const,
  cardTemplateId: null,
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  createdByUserId: "admin-1",
  eligibilityExplanation: "Participantes elegibles",
  endsAt: null as Date | null,
  id: "campaign-1",
  packTemplateId: "pack-1",
  perAccountQuantity: 2,
  quantityCeiling: 10,
  quantityIssued: 6,
  startsAt: null as Date | null,
  state: "active" as const,
  targetKind: "pack" as const,
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  version: 1,
};
const recipient = {
  banned: false,
  emailVerified: true,
  id: "user-1",
};

function createGrantStore(
  options: {
    campaign?: Partial<typeof campaign>;
    existingExecution?: Record<string, unknown> | null;
    grantCountRows?: { quantity: number }[];
    recipientRows?: Record<string, unknown>[] | null;
    updateReturns?: boolean;
  } = {}
) {
  const current = { ...campaign, ...options.campaign };
  const inserted: Record<string, unknown>[] = [];
  const tx = {
    execute: vi.fn(() => Promise.resolve()),
    insert: vi.fn((_table: unknown) => ({
      values: (value: Record<string, unknown>) => {
        inserted.push(value);
        return Promise.resolve(value);
      },
    })),
    query: {
      collectibleGrantExecution: {
        findFirst: vi.fn(() =>
          Promise.resolve(options.existingExecution ?? null)
        ),
      },
    },
    select: vi.fn(() => {
      let table: unknown;
      const builder = {
        for: () =>
          Promise.resolve(table === collectibleGrantCampaign ? [current] : []),
        from(nextTable: unknown) {
          table = nextTable;
          return builder;
        },
        // oxlint-disable-next-line unicorn/no-thenable -- mirrors a Drizzle select builder.
        then(resolve: (value: unknown[]) => unknown) {
          if (table === userTable) {
            return Promise.resolve(
              resolve(options.recipientRows ?? [recipient])
            );
          }
          if (table === collectibleGrantCampaign) {
            return Promise.resolve(resolve([current]));
          }
          if (table === collectibleGrantExecution) {
            return Promise.resolve(resolve(options.grantCountRows ?? []));
          }
          return Promise.resolve(resolve([]));
        },
        where() {
          return builder;
        },
      };
      return builder;
    }),
    update: vi.fn(() => ({
      set: () => ({
        where: () => ({
          returning: () =>
            Promise.resolve(
              options.updateReturns === false
                ? []
                : [{ ...current, quantityIssued: current.quantityIssued + 2 }]
            ),
        }),
      }),
    })),
  };
  return {
    db: {
      transaction: (callback: (value: typeof tx) => unknown) => callback(tx),
    },
    inserted,
    tx,
  };
}

function grantInput(overrides: Record<string, unknown> = {}) {
  return {
    campaignId: campaign.id,
    idempotencyKey: "grant-request-1",
    quantity: 2,
    recipientUserId: recipient.id,
    ...overrides,
  };
}

describe("executeCollectibleGrantCampaign", () => {
  beforeEach(() => {
    flags.collectibles = true;
    vi.clearAllMocks();
    issuance.issuePack.mockImplementation(
      (
        _tx: unknown,
        input: {
          issueReference: string;
          ownerUserId: string;
          packTemplateId: string;
        }
      ) =>
        Promise.resolve({
          packInstanceId: `pack-instance-${input.issueReference}`,
        })
    );
    issuance.issueCard.mockResolvedValue({ cardInstanceId: "card-instance-1" });
    notification.createUserNotification.mockResolvedValue("notification-1");
  });

  it("issues the requested quantity, records one execution, and notifies after commit", async () => {
    const store = createGrantStore();
    const result = await executeCollectibleGrantCampaign(
      store.db as never,
      "admin-1",
      grantInput()
    );
    expect(result).toMatchObject({
      assetKind: "pack",
      campaignId: campaign.id,
      quantity: 2,
      recipientUserId: recipient.id,
      replayed: false,
    });
    expect(result.assetIds).toHaveLength(2);
    expect(issuance.issuePack).toHaveBeenCalledTimes(2);
    expect(issuance.issuePack.mock.calls[0]?.[1]).toMatchObject({
      binding: "account-bound",
      issueSource: "grant",
      ownerUserId: recipient.id,
      packTemplateId: "pack-1",
    });
    expect(store.inserted).toHaveLength(1);
    expect(store.inserted[0]).toMatchObject({
      quantity: 2,
      recipientUserId: recipient.id,
    });
    expect(notification.createUserNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        dedupeKey: `collectible-grant:${result.executionId}`,
      })
    );
  });

  it("replays a stored execution without issuing or mutating the campaign again", async () => {
    const store = createGrantStore({
      existingExecution: {
        actorUserId: "admin-1",
        campaignId: campaign.id,
        cardInstanceId: null,
        fingerprint: storedFingerprint(),
        id: "execution-1",
        idempotencyKey: "grant-request-1",
        packInstanceId: "pack-instance-a",
        quantity: 2,
        recipientUserId: recipient.id,
        resultAssetIds: ["pack-instance-a", "pack-instance-b"],
        resultAt: new Date(),
      },
    });
    const result = await executeCollectibleGrantCampaign(
      store.db as never,
      "admin-1",
      grantInput()
    );
    expect(result.replayed).toBe(true);
    expect(result.executionId).toBe("execution-1");
    expect(issuance.issuePack).not.toHaveBeenCalled();
    expect(store.tx.update).not.toHaveBeenCalled();
    expect(store.inserted).toHaveLength(0);
  });

  it("rejects replaying the same key with different command data", async () => {
    const store = createGrantStore({
      existingExecution: {
        actorUserId: "admin-1",
        campaignId: campaign.id,
        fingerprint: "a-fingerprint-that-differs",
        id: "execution-1",
        idempotencyKey: "grant-request-1",
        packInstanceId: "pack-instance-a",
        quantity: 2,
        recipientUserId: recipient.id,
        resultAssetIds: [],
        resultAt: new Date(),
      },
    });
    await expect(
      executeCollectibleGrantCampaign(
        store.db as never,
        "admin-1",
        grantInput()
      )
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(issuance.issuePack).not.toHaveBeenCalled();
  });

  it("enforces the campaign window before any issuance", async () => {
    const store = createGrantStore({
      campaign: {
        endsAt: new Date("2026-08-02T00:00:00.000Z"),
      },
    });
    await expect(
      executeCollectibleGrantCampaign(
        store.db as never,
        "admin-1",
        grantInput()
      )
    ).rejects.toMatchObject({ code: "CAMPAIGN_NOT_OPEN" });
    expect(issuance.issuePack).not.toHaveBeenCalled();
    expect(store.inserted).toHaveLength(0);
  });

  it("stops grants once the campaign ceiling is exhausted", async () => {
    const store = createGrantStore({
      campaign: { quantityIssued: 9 },
    });
    await expect(
      executeCollectibleGrantCampaign(
        store.db as never,
        "admin-1",
        grantInput()
      )
    ).rejects.toMatchObject({ code: "CAMPAIGN_LIMIT" });
    expect(issuance.issuePack).not.toHaveBeenCalled();
    expect(store.inserted).toHaveLength(0);
  });

  it("enforces per-account accumulation across prior executions", async () => {
    // Two units were already granted to this account; two more would exceed
    // perAccountQuantity = 2 even though the campaign has room left.
    const store = createGrantStore({ grantCountRows: [{ quantity: 2 }] });
    await expect(
      executeCollectibleGrantCampaign(
        store.db as never,
        "admin-1",
        grantInput()
      )
    ).rejects.toMatchObject({ code: "CAMPAIGN_LIMIT" });
    expect(issuance.issuePack).not.toHaveBeenCalled();
    expect(store.inserted).toHaveLength(0);
  });

  it("fails closed when the guarded ceiling update no longer matches", async () => {
    const store = createGrantStore({ updateReturns: false });
    await expect(
      executeCollectibleGrantCampaign(
        store.db as never,
        "admin-1",
        grantInput()
      )
    ).rejects.toMatchObject({ code: "CAMPAIGN_LIMIT" });
    expect(store.inserted).toHaveLength(0);
    expect(notification.createUserNotification).not.toHaveBeenCalled();
  });
});

function storedFingerprint() {
  // Mirrors the exact payload the service fingerprints (no key, no target IDs).
  return normalizeCollectiblePayload({
    actorUserId: "admin-1",
    campaignId: campaign.id,
    quantity: 2,
    recipientUserId: recipient.id,
  });
}
