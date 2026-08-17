import { call } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import type * as CardCatalog from "../services/card-catalog";
import type * as CollectibleInventory from "../services/collectible-inventory";
import cardsRouter from "./cards";

const catalog = vi.hoisted(() => ({
  getPublishedCardTemplate: vi.fn(),
  listPublishedCardTemplates: vi.fn(),
}));
const inventory = vi.hoisted(() => ({
  listPrivateCardInventory: vi.fn(),
  listPrivateCollectibleProvenance: vi.fn(),
  listPublicCardCollection: vi.fn(),
}));

vi.mock("../services/card-catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof CardCatalog>()),
  getPublishedCardTemplate: catalog.getPublishedCardTemplate,
  listPublishedCardTemplates: catalog.listPublishedCardTemplates,
}));
vi.mock("../services/collectible-inventory", async (importOriginal) => ({
  ...(await importOriginal<typeof CollectibleInventory>()),
  listPrivateCardInventory: inventory.listPrivateCardInventory,
  listPrivateCollectibleProvenance: inventory.listPrivateCollectibleProvenance,
  listPublicCardCollection: inventory.listPublicCardCollection,
}));
vi.mock("@repo/auth", () => ({ auth: { api: {} } }));

const context = {
  db: {},
  headers: new Headers(),
  isSharedCacheContext: true,
  session: null,
} as unknown as Context;

const privateContext = {
  ...context,
  session: { user: { id: "user-1", role: "user" } },
} as unknown as Context;
const requestContext = {
  ...context,
  isSharedCacheContext: false,
} as unknown as Context;

describe("public cards router", () => {
  it("does not put ownership-derived cards in a shared cache context", async () => {
    const result = await call(
      cardsRouter.publicCollection,
      { limit: 24, userId: "owner-1" },
      { context }
    );

    expect(result).toEqual({ items: [], nextCursor: null, visible: false });
    expect(inventory.listPublicCardCollection).not.toHaveBeenCalled();
  });

  it("serves owner-controlled collection pages through a public request-bound procedure", async () => {
    vi.stubEnv("NODE_ENV", "development");
    inventory.listPublicCardCollection.mockResolvedValue({
      items: [
        {
          availability: "active",
          binding: "transferable",
          characterName: "Samus Aran",
          edition: null,
          forSale: false,
          gameName: "Metroid Prime",
          id: "card-instance-1",
          limited: false,
          lifetimeSupplyCeiling: null,
          mintDisplay: "#7",
          mintNumber: 7,
          rarity: "rare",
          seriesName: "Clásicos",
          template: {
            characterName: "Samus Aran",
            description: "Cazadora espacial",
            disabled: false,
            edition: null,
            gameName: "Metroid Prime",
            id: "card-template-1",
            lifetimeSupplyCeiling: null,
            presentation: {
              accentColor: "#7c3aed",
              frameKey: "default",
              watermarkText: "NeXusTC",
            },
            rarity: "rare",
            renderedVariants: [],
            seriesName: "Clásicos",
          },
          templateId: "card-template-1",
        },
      ],
      nextCursor: null,
      visible: true,
    });
    const result = (await call(
      cardsRouter.publicCollection,
      { limit: 24, userId: "owner-1" },
      { context: requestContext }
    )) as { items: unknown[] };
    expect(result).toMatchObject({ visible: true });
    expect(result.items[0]).not.toHaveProperty("ownerUserId");
    expect(result.items[0]).not.toHaveProperty("provenance");
    expect(inventory.listPublicCardCollection).toHaveBeenCalledWith(
      expect.anything(),
      { limit: 24, sort: "newest", userId: "owner-1" }
    );
    vi.unstubAllEnvs();
  });

  it("keeps published catalog reads available without a session", async () => {
    catalog.listPublishedCardTemplates.mockResolvedValue([
      {
        characterName: "Samus Aran",
        description: "Cazadora espacial",
        disabled: false,
        edition: null,
        gameName: "Metroid Prime",
        id: "template-1",
        lifetimeSupplyCeiling: 100,
        presentation: {
          accentColor: "#7c3aed",
          frameKey: "default",
          watermarkText: "NeXusTC",
        },
        rarity: "rare",
        renderedVariants: [],
        seriesName: "Clásicos",
      },
    ]);
    await expect(
      call(cardsRouter.list, { limit: 10 }, { context })
    ).resolves.toMatchObject([{ id: "template-1", rarity: "rare" }]);
    expect(catalog.listPublishedCardTemplates).toHaveBeenCalledWith(
      expect.anything(),
      { limit: 10 }
    );
  });

  it("returns only the public detail contract for a card", async () => {
    catalog.getPublishedCardTemplate.mockResolvedValue({
      characterName: "Samus Aran",
      description: "Cazadora espacial",
      disabled: true,
      edition: null,
      gameName: "NeXusTC",
      id: "template-1",
      lifetimeSupplyCeiling: null,
      presentation: {
        accentColor: "#52525b",
        frameKey: "disabled",
        watermarkText: "NeXusTC",
      },
      rarity: "rare",
      renderedVariants: [],
      seriesName: "Clásicos",
    });
    const result = await call(
      cardsRouter.get,
      { id: "template-1" },
      { context }
    );
    expect(result).toMatchObject({ disabled: true, id: "template-1" });
    expect(result).not.toHaveProperty("mintedSupply");
    expect(result).not.toHaveProperty("ownerUserId");
    expect(result).not.toHaveProperty("provenance");
  });
});

describe("private cards router", () => {
  it("scopes inventory to the authenticated account and exposes no owner lookup", async () => {
    inventory.listPrivateCardInventory.mockResolvedValue({
      items: [
        {
          binding: "transferable",
          characterName: "Samus Aran",
          id: "card-instance-1",
          mintNumber: 1,
          rarity: "rare",
        },
      ],
      nextCursor: null,
    });
    const result = await call(
      cardsRouter.inventory,
      { limit: 20, sort: "newest" },
      { context: privateContext }
    );
    expect(result.items[0]).not.toHaveProperty("ownerUserId");
    expect(inventory.listPrivateCardInventory).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      { limit: 20, sort: "newest" }
    );
  });
});
