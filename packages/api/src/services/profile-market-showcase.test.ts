import { describe, expect, it, vi } from "vitest";

import { getPublicCollectibleProfileShowcases } from "./profile";

type MockedModule = Record<string, unknown>;

const env = vi.hoisted(() => ({ PROFILE_CUSTOMIZATION_ENABLED: true }));
const customization = vi.hoisted(() => ({
  loadProfileCustomizationEditorState: vi.fn(),
}));
const showcase = vi.hoisted(() => ({
  resolvePublicCollectibleShowcases: vi.fn(),
}));

vi.mock("@repo/env", () => ({ env }));
vi.mock("./profile-customization", async (importOriginal) => ({
  ...(await importOriginal<MockedModule>()),
  loadProfileCustomizationEditorState:
    customization.loadProfileCustomizationEditorState,
}));
vi.mock("./profile-collectible-showcases", async (importOriginal) => ({
  ...(await importOriginal<MockedModule>()),
  resolvePublicCollectibleShowcases: showcase.resolvePublicCollectibleShowcases,
}));

function createCustodyDb(rows: readonly object[]) {
  const query = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn().mockResolvedValue(rows),
  };
  query.from.mockReturnValue(query);
  query.leftJoin.mockReturnValue(query);
  return { select: vi.fn().mockReturnValue(query) };
}

describe("profile Black Market showcase wiring", () => {
  it("keeps active market custody public while trade and gift custody stay private", async () => {
    const configuration = { effectiveConfiguration: { showcases: [] } };
    customization.loadProfileCustomizationEditorState.mockResolvedValueOnce(
      configuration
    );
    showcase.resolvePublicCollectibleShowcases.mockImplementationOnce(
      async (_db, _userId, _configuration, options) => {
        const privateCustody = await options.resolveActiveCustody?.({
          assetIds: ["market-card", "trade-card", "gift-pack"],
          assetKind: "card",
          profileUserId: "profile-user",
        });
        return [{ privateCustody }];
      }
    );
    const db = createCustodyDb([
      {
        assetId: "market-card",
        blackMarketExpiresAt: new Date("2026-08-20T00:00:00.000Z"),
        blackMarketListingId: "listing-active",
        blackMarketState: "active",
      },
      {
        assetId: "trade-card",
        blackMarketExpiresAt: null,
        blackMarketListingId: null,
        blackMarketState: null,
      },
      {
        assetId: "gift-pack",
        blackMarketExpiresAt: null,
        blackMarketListingId: null,
        blackMarketState: null,
      },
    ]);

    await expect(
      getPublicCollectibleProfileShowcases(db as never, "profile-user")
    ).resolves.toEqual([
      { privateCustody: new Set(["trade-card", "gift-pack"]) },
    ]);
    expect(db.select).toHaveBeenCalledOnce();
  });

  it("hides terminal and expired market custody on the next profile read", async () => {
    const configuration = { effectiveConfiguration: { showcases: [] } };
    customization.loadProfileCustomizationEditorState.mockResolvedValue(
      configuration
    );
    showcase.resolvePublicCollectibleShowcases.mockImplementation(
      async (_db, _userId, _configuration, options) => ({
        privateCustody: await options.resolveActiveCustody?.({
          assetIds: ["cancelled-card", "expired-card"],
          assetKind: "card",
          profileUserId: "profile-user",
        }),
      })
    );
    const db = createCustodyDb([
      {
        assetId: "cancelled-card",
        blackMarketExpiresAt: new Date("2026-08-20T00:00:00.000Z"),
        blackMarketListingId: "listing-cancelled",
        blackMarketState: "cancelled",
      },
      {
        assetId: "expired-card",
        blackMarketExpiresAt: new Date("2026-08-16T00:00:00.000Z"),
        blackMarketListingId: "listing-expired",
        blackMarketState: "active",
      },
    ]);

    await expect(
      getPublicCollectibleProfileShowcases(db as never, "profile-user")
    ).resolves.toEqual({
      privateCustody: new Set(["cancelled-card", "expired-card"]),
    });
  });
});
