import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import blackMarketRouter from "./black-market";

const flags = vi.hoisted(() => ({ enabled: true }));
const service = vi.hoisted(() => ({
  administrativelyCancelBlackMarketListing: vi.fn(),
  cancelBlackMarketListing: vi.fn(),
  correctBlackMarketListingFeeReversal: vi.fn(),
  getBlackMarketListingDetail: vi.fn(),
  getBlackMarketSaleHistory: vi.fn(),
  listEligibleBlackMarketAssets: vi.fn(),
  publishBlackMarketListing: vi.fn(),
  purchaseBlackMarketListing: vi.fn(),
  retryBlackMarketListingNotification: vi.fn(),
  searchBlackMarketListings: vi.fn(),
}));
// One factory, three distinct identities: the router's translation branches
// key on instanceof, so the mocked ledger/audit/domain errors must never
// share a class while keeping this file at one class declaration.
const errors = vi.hoisted(() => {
  // Scoped inside the hoisted block on purpose: one shared factory keeps this
  // file at a single class declaration while producing three distinct error
  // identities whose instanceof branches the router relies on.
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- fixture factory needs no closure; hoisting it out would defeat the single-class constraint.
  function makeErrorClass(name: string) {
    const Klass = class MockDomainError extends Error {
      readonly code: string;

      constructor(code: string, message?: string) {
        super(message ?? code);
        // Instances report the mocked domain error's name, not this shared
        // fixture class's name.
        // oxlint-disable-next-line unicorn/custom-error-definition
        this.name = name;
        this.code = code;
      }
    };
    Object.defineProperty(Klass, "name", { value: name });
    return Klass;
  }
  return {
    BlackMarketError: makeErrorClass("BlackMarketError"),
    CollectibleAdminActionError: makeErrorClass("CollectibleAdminActionError"),
    EterisError: makeErrorClass("EterisError"),
  };
});

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
vi.mock("../utils/redis-operations", () => ({
  checkSlidingWindowRateLimit: vi.fn().mockResolvedValue({ exceeded: false }),
}));
vi.mock("../services/eteris", () => ({ EterisError: errors.EterisError }));
vi.mock("../services/collectible-admin-action", () => ({
  CollectibleAdminActionError: errors.CollectibleAdminActionError,
}));
vi.mock("../services/black-market", () => ({
  BlackMarketError: errors.BlackMarketError,
  ...service,
}));

function createContext(role = "user", impersonatedBy?: string): Context {
  return {
    db: {},
    headers: new Headers(),
    isSharedCacheContext: true,
    session: {
      session: impersonatedBy ? { impersonatedBy } : {},
      user: { id: "user-1", role },
    },
  } as unknown as Context;
}

const publishInput = {
  askingPrice: "100",
  assets: [{ assetId: "card-1", kind: "card" as const }],
  idempotencyKey: "market-publish-key-1",
};
const purchaseInput = {
  expectedPrice: "100",
  expectedVersion: 1,
  idempotencyKey: "market-purchase-key-1",
  listingId: "listing-1",
};

beforeEach(() => {
  flags.enabled = true;
  vi.clearAllMocks();
  service.searchBlackMarketListings.mockResolvedValue({
    items: [],
    nextCursor: null,
  });
  service.listEligibleBlackMarketAssets.mockResolvedValue({
    cards: [],
    packs: [],
  });
  service.publishBlackMarketListing.mockResolvedValue({
    feeAmount: 5n,
    fingerprint: "fingerprint",
    listingId: "listing-1",
    replayed: false,
    version: 1,
  });
  service.purchaseBlackMarketListing.mockResolvedValue({
    assetIds: ["card-1"],
    listingId: "listing-1",
    replayed: false,
  });
});

describe("black market router boundaries", () => {
  it("serves public reads without a session and validates inputs first", async () => {
    await expect(
      call(
        blackMarketRouter.search,
        { limit: 24, sort: "price" },
        { context: createContext() }
      )
    ).resolves.toEqual({ items: [], nextCursor: null });
    expect(service.searchBlackMarketListings).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 24, sort: "price" })
    );
    await expect(
      call(blackMarketRouter.search, { limit: 0 }, { context: createContext() })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(service.searchBlackMarketListings).toHaveBeenCalledTimes(1);
  });

  it("delegates authenticated purchases and eligible reads", async () => {
    await expect(
      call(blackMarketRouter.purchase, purchaseInput, {
        context: createContext(),
      })
    ).resolves.toMatchObject({ listingId: "listing-1" });
    expect(service.purchaseBlackMarketListing).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      expect.objectContaining({ expectedPrice: 100n, listingId: "listing-1" })
    );
    await call(blackMarketRouter.eligible, undefined, {
      context: createContext(),
    });
    expect(service.listEligibleBlackMarketAssets).toHaveBeenCalledWith(
      expect.anything(),
      "user-1"
    );
  });

  it("stops every mutation while the gate is off or the session is impersonated", async () => {
    flags.enabled = false;
    await expect(
      call(blackMarketRouter.publish, publishInput, {
        context: createContext(),
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      call(blackMarketRouter.purchase, purchaseInput, {
        context: createContext(),
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      call(
        blackMarketRouter.retryNotification,
        { listingId: "listing-1" },
        { context: createContext() }
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const impersonated = createContext("user", "staff-1");
    await expect(
      call(blackMarketRouter.publish, publishInput, { context: impersonated })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      call(blackMarketRouter.purchase, purchaseInput, {
        context: impersonated,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(service.publishBlackMarketListing).toHaveBeenCalledTimes(0);
    expect(service.purchaseBlackMarketListing).toHaveBeenCalledTimes(0);
    expect(service.retryBlackMarketListingNotification).toHaveBeenCalledTimes(
      0
    );
  });

  it("maps domain codes to declared NOT_FOUND, FORBIDDEN, and BAD_REQUEST errors", async () => {
    service.purchaseBlackMarketListing.mockRejectedValue(
      new errors.BlackMarketError(
        "LISTING_NOT_FOUND",
        "La publicación no existe."
      )
    );
    await expect(
      call(blackMarketRouter.purchase, purchaseInput, {
        context: createContext(),
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    service.purchaseBlackMarketListing.mockRejectedValue(
      new errors.BlackMarketError("PERMISSION_DENIED", "Sin permiso.")
    );
    await expect(
      call(blackMarketRouter.purchase, purchaseInput, {
        context: createContext(),
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    service.purchaseBlackMarketListing.mockRejectedValue(
      new errors.BlackMarketError("STALE_PRICE", "El precio cambió.")
    );
    await expect(
      call(blackMarketRouter.purchase, purchaseInput, {
        context: createContext(),
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("STALE_PRICE"),
    });
  });

  it("declares ledger failures instead of leaking undeclared 500s", async () => {
    service.purchaseBlackMarketListing.mockRejectedValue(
      new errors.EterisError("INSUFFICIENT_FUNDS")
    );
    await expect(
      call(blackMarketRouter.purchase, purchaseInput, {
        context: createContext(),
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("No tienes Eteris suficientes"),
    });

    service.purchaseBlackMarketListing.mockRejectedValue(
      new errors.EterisError("IDEMPOTENCY_CONFLICT")
    );
    await expect(
      call(blackMarketRouter.purchase, purchaseInput, {
        context: createContext(),
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });

    service.publishBlackMarketListing.mockRejectedValue(
      new errors.EterisError("CLOSED_OR_FROZEN")
    );
    await expect(
      call(blackMarketRouter.publish, publishInput, {
        context: createContext(),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("requires marketplace capability for moderation surfaces", async () => {
    service.administrativelyCancelBlackMarketListing.mockResolvedValue({
      listingId: "listing-1",
      releasedCustody: true,
      replayed: false,
      refundedFeeAmount: null,
      version: 2,
    });
    await expect(
      call(
        blackMarketRouter.adminCancel,
        {
          compliant: true,
          expectedVersion: 1,
          idempotencyKey: "market-cancel-key-1",
          listingId: "listing-1",
          reason: "Publicación fuera de política",
        },
        { context: createContext("moderator") }
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      call(
        blackMarketRouter.adminCancel,
        {
          compliant: true,
          expectedVersion: 1,
          idempotencyKey: "market-cancel-key-2",
          listingId: "listing-1",
          reason: "Publicación fuera de política",
        },
        { context: createContext("owner") }
      )
    ).resolves.toMatchObject({ listingId: "listing-1" });
  });
});
