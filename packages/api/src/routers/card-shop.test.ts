import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import cardShopRouter from "./card-shop";

const flags = vi.hoisted(() => ({ enabled: true }));
const services = vi.hoisted(() => ({
  listActiveOfficialCardShopOffers: vi.fn(),
  retryOfficialCardShopPurchaseNotification: vi.fn(),
}));

vi.mock("@repo/env", () => ({
  env: {
    get COLLECTIBLES_ENABLED() {
      return flags.enabled;
    },
  },
}));
vi.mock("@repo/auth", () => ({
  auth: {
    api: {
      userHasPermission: vi.fn(({ body }: { body: { role: string } }) => ({
        success: body.role === "owner",
      })),
    },
  },
}));
vi.mock("../services/official-card-shop", () => ({
  getOfficialCardShopOfferImpact: vi.fn(),
  getOfficialCardShopPurchase: vi.fn(),
  listActiveOfficialCardShopOffers: services.listActiveOfficialCardShopOffers,
  listOfficialCardShopOffersForAdmin: vi.fn(),
  listOwnOfficialCardShopPurchases: vi.fn(),
  OfficialCardShopError: class OfficialCardShopError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
      super(message);
      this.name = "OfficialCardShopError";
      this.code = code;
    }
  },
  purchaseOfficialCardShopOffer: vi.fn(),
  retryOfficialCardShopPurchaseNotification:
    services.retryOfficialCardShopPurchaseNotification,
}));
vi.mock("../utils/redis-operations", () => ({
  checkSlidingWindowRateLimit: vi.fn().mockResolvedValue({ exceeded: false }),
}));

function context(role?: string): Context {
  return {
    db: {},
    headers: new Headers(),
    isSharedCacheContext: !role,
    session: role ? { session: {}, user: { id: "user-1", role } } : null,
  } as unknown as Context;
}

beforeEach(() => {
  flags.enabled = true;
  vi.clearAllMocks();
  services.listActiveOfficialCardShopOffers.mockResolvedValue([]);
  services.retryOfficialCardShopPurchaseNotification.mockResolvedValue({
    id: "notification-1",
  });
});

describe("card shop gate boundaries", () => {
  it("keeps public reads available while the global mutation gate is off", async () => {
    flags.enabled = false;

    await expect(
      call(cardShopRouter.list, undefined, { context: context() })
    ).resolves.toEqual([]);
    expect(services.listActiveOfficialCardShopOffers).toHaveBeenCalled();
  });

  it("gates notification retries without invoking the delivery service", async () => {
    flags.enabled = false;
    await expect(
      call(
        cardShopRouter.retryNotification,
        { purchaseId: "purchase-1" },
        { context: context("owner") }
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(
      services.retryOfficialCardShopPurchaseNotification
    ).not.toHaveBeenCalled();

    flags.enabled = true;
    await expect(
      call(
        cardShopRouter.retryNotification,
        { purchaseId: "purchase-1" },
        { context: context("owner") }
      )
    ).resolves.toMatchObject({ id: "notification-1" });
  });
});
