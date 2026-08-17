// @vitest-environment node

import { beforeEach, expect, test, vi } from "vitest";

const expire = vi.hoisted(() => vi.fn());
const expireGift = vi.hoisted(() => vi.fn());
const expireMarket = vi.hoisted(() => vi.fn());

vi.mock("@repo/api/services/trade-offer", () => ({
  expireCollectibleGiftOffersBatch: expireGift,
  expireCollectibleTradeOffersBatch: expire,
}));
vi.mock("@repo/api/services/black-market", () => ({
  expireBlackMarketListingsBatch: expireMarket,
}));
vi.mock("@repo/db", () => ({ db: { name: "database" } }));
vi.mock("@repo/env", () => ({
  env: { CRON_SECRET: "test-cron-secret-value" },
}));

const { GET } = await import("./route");

beforeEach(() => {
  expire.mockReset().mockResolvedValue({
    checked: 2,
    expired: 2,
    offerIds: ["offer-a", "offer-b"],
    participantUserIds: ["user-a", "user-b"],
  });
  expireGift.mockReset().mockResolvedValue({
    checked: 1,
    expired: 1,
    giftIds: ["gift-a"],
    participantUserIds: ["user-a", "user-b"],
  });
  expireMarket.mockReset().mockResolvedValue({
    checked: 1,
    expired: 1,
    listingIds: ["market-listing-a"],
    participantUserIds: ["seller-a"],
  });
});

test("rejects requests without the cron secret", async () => {
  const response = await GET(
    new Request("http://localhost/api/cron/collectible-expiry")
  );

  expect(response.status).toBe(401);
  expect(expire).not.toHaveBeenCalled();
});

test("runs the idempotent collectible expiry batch with the cron secret", async () => {
  const response = await GET(
    new Request("http://localhost/api/cron/collectible-expiry", {
      headers: { authorization: "Bearer test-cron-secret-value" },
    })
  );

  await expect(response.json()).resolves.toEqual({
    blackMarket: {
      checked: 1,
      expired: 1,
    },
    gifts: {
      checked: 1,
      expired: 1,
    },
    trades: {
      checked: 2,
      expired: 2,
    },
  });
  expect(expire).toHaveBeenCalledWith({ name: "database" });
  expect(expireGift).toHaveBeenCalledWith({ name: "database" });
  expect(expireMarket).toHaveBeenCalledWith({ name: "database" });
});

test("surfaces a market sweep failure so cron monitoring can retry", async () => {
  expireMarket.mockRejectedValueOnce(new Error("market database unavailable"));

  await expect(
    GET(
      new Request("http://localhost/api/cron/collectible-expiry", {
        headers: { authorization: "Bearer test-cron-secret-value" },
      })
    )
  ).rejects.toThrow("market database unavailable");
  expect(expire).toHaveBeenCalledWith({ name: "database" });
  expect(expireGift).toHaveBeenCalledWith({ name: "database" });
});
