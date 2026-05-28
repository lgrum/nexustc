import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const webhookSecret = "test-webhook-secret";

const dbMocks = vi.hoisted(() => ({
  insert: vi.fn(),
  patronFindFirst: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@repo/env", () => ({
  env: {
    PATREON_CAMPAIGN_ID: "campaign-1",
    PATREON_WEBHOOK_SECRET: webhookSecret,
  },
}));

vi.mock("@repo/db/schema/app", () => ({
  patron: {
    id: "patron.id",
    patreonUserId: "patron.patreonUserId",
  },
  patreonWebhookRequest: {
    id: "patreonWebhookRequest.id",
  },
}));

vi.mock("@repo/db", () => ({
  db: {
    insert: dbMocks.insert,
    query: {
      patron: {
        findFirst: dbMocks.patronFindFirst,
      },
    },
    update: dbMocks.update,
  },
  eq: vi.fn((left, right) => ({ left, right })),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (routeConfig: unknown) => routeConfig,
}));

const { handleWebhook } = await import("./webhook");

function signPayload(payload: string): string {
  return createHmac("md5", webhookSecret).update(payload).digest("hex");
}

function createMemberDeletePayload() {
  return {
    data: {
      attributes: {
        patron_status: "active_patron",
        pledge_relationship_start: "2026-04-21T04:55:03.130+00:00",
      },
      id: "member-1",
      relationships: {
        campaign: {
          data: {
            id: "campaign-1",
            type: "campaign",
          },
        },
        currently_entitled_tiers: {
          data: [],
        },
        user: {
          data: {
            id: "patreon-user-1",
            type: "user",
          },
        },
      },
      type: "member",
    },
  };
}

describe("Patreon webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    dbMocks.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "webhook-request-1" }]),
      }),
    });

    dbMocks.patronFindFirst.mockResolvedValue({
      patronSince: new Date("2026-04-21T04:55:03.130Z"),
      tier: "level12",
    });

    const patronUpdate = {
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "patron-1" }]),
        }),
      }),
    };
    const webhookStatusUpdate = {
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(),
      }),
    };

    dbMocks.update
      .mockReturnValueOnce(patronUpdate)
      .mockReturnValueOnce(webhookStatusUpdate);
  });

  it("processes members:delete events and revokes the local patron record", async () => {
    const payload = JSON.stringify(createMemberDeletePayload());
    const response = await handleWebhook(
      new Request("https://example.com/api/patreon/webhook", {
        body: payload,
        headers: {
          "x-patreon-event": "members:delete",
          "x-patreon-signature": signPayload(payload),
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(200);
    expect(dbMocks.patronFindFirst).toHaveBeenCalledTimes(1);
    expect(dbMocks.update).toHaveBeenCalledTimes(2);

    const patronUpdate = dbMocks.update.mock.results[0]?.value;
    expect(patronUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({
        isActivePatron: false,
        tier: "none",
      })
    );
  });
});
