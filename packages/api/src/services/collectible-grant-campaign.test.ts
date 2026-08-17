import { describe, expect, it, vi } from "vitest";

import {
  collectibleGrantCampaignInputSchema,
  collectibleGrantExecutionInputSchema,
  deliverCollectibleGrantNotification,
} from "./collectible-grant-campaign";

const notification = vi.hoisted(() => ({
  createUserNotification: vi.fn(),
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
