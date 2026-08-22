import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import tradesRouter from "./trades";

const logger = vi.hoisted(() => ({
  info: vi.fn(),
}));

const service = vi.hoisted(() => ({
  acceptTradeOffer: vi.fn(),
  blockTradeUser: vi.fn(),
  cancelTradeOffer: vi.fn(),
  counterOfferTradeOffer: vi.fn(),
  getTradeOffer: vi.fn(),
  listEligibleTradeAssets: vi.fn(),
  listTradeOffers: vi.fn(),
  listTradeUserBlocks: vi.fn(),
  rejectTradeOffer: vi.fn(),
  sendTradeOffer: vi.fn(),
  unblockTradeUser: vi.fn(),
}));
const profile = vi.hoisted(() => ({
  getResolvedProfileVisibility: vi.fn(),
}));

vi.mock("@repo/env", () => ({
  env: {
    COLLECTIBLES_ENABLED: true,
  },
}));
vi.mock("@orpc/experimental-pino", () => ({
  getLogger: () => logger,
}));
vi.mock("@repo/auth", () => ({
  auth: {
    api: {
      userHasPermission: vi.fn().mockResolvedValue({ success: false }),
    },
  },
}));
vi.mock("../services/trade-offer", () => ({
  ...service,
  TradeOfferError: class TradeOfferError extends Error {
    readonly code = "ACCOUNT_BLOCKED";

    constructor(message: string) {
      super(message);
      this.name = "TradeOfferError";
    }
  },
}));
vi.mock("../services/profile", () => profile);

function createContext(): Context {
  return {
    db: { name: "database" },
    headers: new Headers(),
    isSharedCacheContext: true,
    session: {
      session: {},
      user: { id: "proposer", role: "user" },
    },
  } as unknown as Context;
}

beforeEach(() => {
  vi.clearAllMocks();
  service.sendTradeOffer.mockResolvedValue({
    expiresAt: new Date("2026-08-23T12:00:00.000Z"),
    offerId: "offer-1",
    replayed: false,
    state: "sent",
    termsHash: "hash",
    version: 1,
  });
  service.acceptTradeOffer.mockResolvedValue({
    expiresAt: new Date("2026-08-23T12:00:00.000Z"),
    offerId: "offer-1",
    replayed: false,
    state: "accepted",
    termsHash: "hash",
    version: 2,
  });
  service.listTradeOffers.mockResolvedValue({ items: [], nextCursor: null });
  service.listEligibleTradeAssets.mockResolvedValue([
    { assetId: "card-recipient", kind: "card" },
  ]);
  profile.getResolvedProfileVisibility.mockResolvedValue({
    publicCollection: true,
  });
});

describe("trade router boundaries", () => {
  it("passes exact bundle arrays to the authenticated send procedure", async () => {
    const input = {
      idempotencyKey: "trade-router-bundle-1",
      proposerAssets: [
        { assetId: "card-1", kind: "card" as const },
        { assetId: "pack-1", kind: "pack" as const },
      ],
      recipientAssets: [
        { assetId: "card-2", kind: "card" as const },
        { assetId: "pack-2", kind: "pack" as const },
      ],
      recipientUserId: "recipient",
    };
    await expect(
      call(tradesRouter.send, input, { context: createContext() })
    ).resolves.toMatchObject({ offerId: "offer-1", state: "sent" });
    expect(service.sendTradeOffer).toHaveBeenCalledWith(
      expect.anything(),
      "proposer",
      input
    );
  });

  it("keeps accept, block, and list procedures authenticated and delegated", async () => {
    await call(
      tradesRouter.accept,
      { idempotencyKey: "trade-router-accept-1", offerId: "offer-1" },
      { context: createContext() }
    );
    await call(
      tradesRouter.block,
      { userId: "blocked-user" },
      { context: createContext() }
    );
    await call(tradesRouter.blocks, undefined, { context: createContext() });

    expect(service.acceptTradeOffer).toHaveBeenCalledWith(
      expect.anything(),
      "proposer",
      expect.objectContaining({ offerId: "offer-1" })
    );
    expect(service.blockTradeUser).toHaveBeenCalledWith(
      expect.anything(),
      "proposer",
      "blocked-user"
    );
    expect(service.listTradeUserBlocks).toHaveBeenCalledWith(
      expect.anything(),
      "proposer"
    );
  });

  it("records a privacy-safe rate-limit decision for shared trade reads", async () => {
    await call(tradesRouter.list, { limit: 1 }, { context: createContext() });

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: "bypass",
        name: "rate_limit_decision",
        operation: "rate-limit.bypass",
        path: "",
        occurredAt: expect.any(Date),
      }),
      "Collectible rate-limit decision"
    );
    const [payload] = logger.info.mock.calls[0] ?? [];
    expect(payload).not.toEqual(
      expect.objectContaining({
        assetId: expect.anything(),
        participantUserId: expect.anything(),
        termsHash: expect.anything(),
        userId: expect.anything(),
      })
    );
    expect(JSON.stringify(payload)).not.toMatch(
      /proposer|recipient|card-|pack-|termsHash/
    );
  });

  it("only exposes a participant inventory when their collection is public", async () => {
    profile.getResolvedProfileVisibility.mockResolvedValueOnce({
      publicCollection: false,
    });
    await expect(
      call(
        tradesRouter.eligibleForParticipant,
        { userId: "recipient" },
        { context: createContext() }
      )
    ).resolves.toEqual([]);
    expect(service.listEligibleTradeAssets).not.toHaveBeenCalled();

    await expect(
      call(
        tradesRouter.eligibleForParticipant,
        { userId: "recipient" },
        { context: createContext() }
      )
    ).resolves.toEqual([{ assetId: "card-recipient", kind: "card" }]);
    expect(service.listEligibleTradeAssets).toHaveBeenCalledWith(
      expect.anything(),
      "recipient"
    );
  });
});
