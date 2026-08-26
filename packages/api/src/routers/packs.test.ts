import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import type * as CollectibleInventory from "../services/collectible-inventory";
import type * as PackCatalog from "../services/pack-catalog";
import type * as PackOpening from "../services/pack-opening";
import packsRouter from "./packs";

const catalog = vi.hoisted(() => ({
  getPublishedPackTemplate: vi.fn(),
  listPublishedPackTemplates: vi.fn(),
}));
const inventory = vi.hoisted(() => ({
  listPrivateCollectibleProvenance: vi.fn(),
  listPrivatePackInventory: vi.fn(),
  listPrivatePackOpeningHistory: vi.fn(),
  listPublicPackCollection: vi.fn(),
}));
const opening = vi.hoisted(() => ({
  getPrivatePackOpening: vi.fn(),
  openPack: vi.fn(),
  retryPackOpeningNotification: vi.fn(),
}));
const flags = vi.hoisted(() => ({ enabled: true }));

vi.mock("../services/pack-catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof PackCatalog>()),
  ...catalog,
}));
vi.mock("../services/collectible-inventory", async (importOriginal) => ({
  ...(await importOriginal<typeof CollectibleInventory>()),
  listPrivateCollectibleProvenance: inventory.listPrivateCollectibleProvenance,
  listPrivatePackInventory: inventory.listPrivatePackInventory,
  listPrivatePackOpeningHistory: inventory.listPrivatePackOpeningHistory,
  listPublicPackCollection: inventory.listPublicPackCollection,
}));
vi.mock("../services/pack-opening", async (importOriginal) => ({
  ...(await importOriginal<typeof PackOpening>()),
  getPrivatePackOpening: opening.getPrivatePackOpening,
  openPack: opening.openPack,
  retryPackOpeningNotification: opening.retryPackOpeningNotification,
}));
vi.mock("@repo/env", () => ({
  env: {
    get COLLECTIBLES_ENABLED() {
      return flags.enabled;
    },
  },
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

beforeEach(() => {
  flags.enabled = true;
  vi.clearAllMocks();
});

describe("public Packs router", () => {
  it("does not put ownership-derived packs in a shared cache context", async () => {
    const result = await call(
      packsRouter.publicCollection,
      { limit: 24, userId: "owner-1" },
      { context }
    );

    expect(result).toEqual({ items: [], nextCursor: null, visible: false });
    expect(inventory.listPublicPackCollection).not.toHaveBeenCalled();
  });

  it("returns bounded public unopened Pack summaries without internal identity", async () => {
    vi.stubEnv("NODE_ENV", "development");
    inventory.listPublicPackCollection.mockResolvedValue({
      items: [
        {
          availability: "active",
          binding: "account-bound",
          forSale: false,
          issuedAt: new Date("2026-08-16T12:00:00.000Z"),
          revision: 2,
          templateAssetObjectKey: "packs/rendered/pack-1.webp",
          templateId: "pack-template-1",
          templateName: "Pack Inicial",
        },
      ],
      nextCursor: null,
      visible: true,
    });
    const result = (await call(
      packsRouter.publicCollection,
      { limit: 24, userId: "owner-1" },
      { context: requestContext }
    )) as { items: unknown[] };
    expect(result).toMatchObject({ visible: true });
    expect(result.items[0]).not.toHaveProperty("id");
    expect(result.items[0]).not.toHaveProperty("cardInstanceIds");
    expect(inventory.listPublicPackCollection).toHaveBeenCalledWith(
      expect.anything(),
      { limit: 24, sort: "newest", userId: "owner-1" }
    );
    vi.unstubAllEnvs();
  });

  it("keeps public Pack detail available without a session and hides odds", async () => {
    catalog.getPublishedPackTemplate.mockResolvedValue({
      assetObjectKey: "media/packs/pack-1.webp",
      description: "Un pack de prueba",
      id: "pack-1",
      lifecycle: "active",
      name: "Pack Inicial",
      revision: {
        bindingPolicy: "either",
        cardCount: 2,
        duplicatePolicy: "allow",
        guarantees: [],
        possiblePool: [
          {
            characterName: "Link",
            disabled: false,
            gameName: "Zelda",
            id: "card-1",
            rarity: "rare",
            seriesName: "Clásicos",
          },
        ],
        publishedAt: "2026-08-16T00:00:00.000Z",
        revision: 1,
        unavailableCards: [],
      },
    });
    const result = await call(packsRouter.get, { id: "pack-1" }, { context });
    expect(result).toMatchObject({ id: "pack-1", revision: { cardCount: 2 } });
    expect(result).not.toHaveProperty("configurationHash");
    expect(result).not.toHaveProperty("revision.probabilities");
    expect(result).not.toHaveProperty("outcomes");
  });
});

describe("private Packs router", () => {
  it("returns unopened Pack summaries without selecting committed result IDs", async () => {
    inventory.listPrivatePackInventory.mockResolvedValue({
      items: [
        {
          binding: "account-bound",
          id: "pack-instance-1",
          revision: 1,
          state: "unopened",
          templateName: "Pack Inicial",
        },
      ],
      nextCursor: null,
    });
    const result = await call(
      packsRouter.inventory,
      { limit: 20, sort: "newest" },
      { context: privateContext }
    );
    expect(result.items[0]).not.toHaveProperty("cardInstanceIds");
    expect(inventory.listPrivatePackInventory).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      { limit: 20, sort: "newest" }
    );
  });

  it("exposes the protected open command with its caller idempotency key", async () => {
    opening.openPack.mockResolvedValue({
      cards: [],
      openedAt: new Date("2026-08-16T12:00:00.000Z"),
      openingId: "opening-1",
      packInstanceId: "pack-instance-1",
      replayed: false,
      revision: 1,
      revisionId: "revision-1",
      source: "grant",
      templateId: "template-1",
    });
    const result = await call(
      packsRouter.open,
      {
        idempotencyKey: "open-pack-key-1",
        packInstanceId: "pack-instance-1",
      },
      { context: privateContext }
    );
    expect(result).toMatchObject({
      openingId: "opening-1",
      replayed: false,
    });
    expect(opening.openPack).toHaveBeenCalledWith(expect.anything(), "user-1", {
      idempotencyKey: "open-pack-key-1",
      packInstanceId: "pack-instance-1",
    });
    await expect(
      call(
        packsRouter.open,
        {
          idempotencyKey: "open-pack-key-2",
          packInstanceId: "pack-instance-1",
        },
        { context }
      )
    ).rejects.toBeDefined();
  });

  it("retries a committed opening notice without exposing opening contents", async () => {
    opening.retryPackOpeningNotification.mockResolvedValue("notice-1");
    await expect(
      call(
        packsRouter.retryNotification,
        { openingId: "opening-1" },
        { context: privateContext }
      )
    ).resolves.toBe("notice-1");
    expect(opening.retryPackOpeningNotification).toHaveBeenCalledWith(
      expect.anything(),
      "opening-1",
      "user-1"
    );

    flags.enabled = false;
    await expect(
      call(
        packsRouter.retryNotification,
        { openingId: "opening-1" },
        { context: privateContext }
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(opening.retryPackOpeningNotification).toHaveBeenCalledTimes(1);
  });
});
