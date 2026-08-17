import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import giftsRouter from "./gifts";

const service = vi.hoisted(() => ({
  acceptGiftOffer: vi.fn(),
  cancelGiftOffer: vi.fn(),
  getGiftOffer: vi.fn(),
  listEligibleGiftAssets: vi.fn(),
  listGiftOffers: vi.fn(),
  rejectGiftOffer: vi.fn(),
  sendGiftOffer: vi.fn(),
}));

vi.mock("@repo/env", () => ({ env: { COLLECTIBLES_ENABLED: true } }));
vi.mock("@orpc/experimental-pino", () => ({ getLogger: () => ({}) }));
vi.mock("@repo/auth", () => ({
  auth: {
    api: { userHasPermission: vi.fn().mockResolvedValue({ success: false }) },
  },
}));
vi.mock("../services/gift-offer", () => ({
  ...service,
  GiftOfferError: class GiftOfferError extends Error {
    readonly code = "ACCOUNT_BLOCKED";

    constructor(message?: string) {
      super(message);
      this.name = "GiftOfferError";
    }
  },
}));

function createContext(): Context {
  return {
    db: { name: "database" },
    headers: new Headers(),
    isSharedCacheContext: true,
    session: { session: {}, user: { id: "sender", role: "user" } },
  } as unknown as Context;
}

beforeEach(() => {
  vi.clearAllMocks();
  service.sendGiftOffer.mockResolvedValue({
    expiresAt: new Date("2026-08-23T12:00:00.000Z"),
    giftId: "gift-1",
    replayed: false,
    state: "sent",
    termsHash: "hash",
    version: 1,
  });
  service.listGiftOffers.mockResolvedValue({ items: [], nextCursor: null });
});

describe("gift router boundaries", () => {
  it("passes only exact free assets to the authenticated send procedure", async () => {
    const input = {
      assets: [
        { assetId: "card-1", kind: "card" as const },
        { assetId: "pack-1", kind: "pack" as const },
      ],
      idempotencyKey: "gift-router-send-1",
      recipientUserId: "recipient",
    };
    await expect(
      call(giftsRouter.send, input, { context: createContext() })
    ).resolves.toMatchObject({ giftId: "gift-1", state: "sent" });
    expect(service.sendGiftOffer).toHaveBeenCalledWith(
      expect.anything(),
      "sender",
      input
    );
  });

  it("delegates explicit acceptance and private inbox reads", async () => {
    await call(
      giftsRouter.accept,
      { giftId: "gift-1", idempotencyKey: "gift-router-accept-1" },
      { context: createContext() }
    );
    await call(
      giftsRouter.inbox,
      { limit: 10, state: "sent" },
      { context: createContext() }
    );
    expect(service.acceptGiftOffer).toHaveBeenCalledWith(
      expect.anything(),
      "sender",
      expect.objectContaining({ giftId: "gift-1" })
    );
    expect(service.listGiftOffers).toHaveBeenCalledWith(
      expect.anything(),
      "sender",
      expect.objectContaining({ state: "sent" }),
      "inbox"
    );
  });
});
