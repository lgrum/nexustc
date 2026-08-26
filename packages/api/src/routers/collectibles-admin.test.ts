import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import collectiblesAdminRouter from "./collectibles-admin";

// Vitest's importOriginal helper needs the runtime module shape while these
// tests replace only the side-effectful service functions.
// oxlint-disable eslint/require-await, typescript/consistent-type-imports

const flags = vi.hoisted(() => ({ enabled: true }));
const services = vi.hoisted(() => ({
  administrativelyCancelGiftOffer: vi.fn(),
  administrativelyCancelTradeOffer: vi.fn(),
  changeCardTemplateAvailability: vi.fn(),
  changeGachaponMachineAvailability: vi.fn(),
  changePackRevisionAvailability: vi.fn(),
  changeShopOfferAvailability: vi.fn(),
  createCardCharacter: vi.fn(),
  createCardSeries: vi.fn(),
  saveCardTemplateDraftWithPortrait: vi.fn(),
  savePackTemplateDraftWithAsset: vi.fn(),
  freezeCardInstance: vi.fn(),
  freezePackInstance: vi.fn(),
  getCollectibleOperationalMetrics: vi.fn(),
  inspectPackRevisionProbabilities: vi.fn(),
  listCollectibleAdminActions: vi.fn(),
  publishPackRevision: vi.fn(),
  restoreCardInstance: vi.fn(),
  restorePackInstance: vi.fn(),
  grantExceptionalCard: vi.fn(),
  reverseExceptionalEteris: vi.fn(),
  retryCollectibleGrantNotification: vi.fn(),
  transferExceptionalCollectible: vi.fn(),
}));

const capabilityGrants = vi.hoisted(() => ({}) as Record<string, string[]>);

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
      userHasPermission: vi.fn(
        async ({
          body,
        }: {
          body: { permissions?: Record<string, string[]>; role: string };
        }) => ({
          success:
            body.role === "owner" ||
            Object.entries(body.permissions ?? {}).some(([domain, actions]) =>
              actions.some((action) =>
                capabilityGrants[body.role]?.includes(`${domain}:${action}`)
              )
            ),
        })
      ),
    },
  },
}));
vi.mock("../services/card-authoring", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/card-authoring")>()),
  createCardCharacter: services.createCardCharacter,
  createCardSeries: services.createCardSeries,
  saveCardTemplateDraftWithPortrait: services.saveCardTemplateDraftWithPortrait,
}));
vi.mock("../services/pack-authoring", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/pack-authoring")>()),
  savePackTemplateDraftWithAsset: services.savePackTemplateDraftWithAsset,
  inspectPackRevisionProbabilities: services.inspectPackRevisionProbabilities,
  publishPackRevision: services.publishPackRevision,
}));
vi.mock("../services/collectible-moderation", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../services/collectible-moderation")
  >()),
  changeCardTemplateAvailability: services.changeCardTemplateAvailability,
  changeGachaponMachineAvailability: services.changeGachaponMachineAvailability,
  changePackRevisionAvailability: services.changePackRevisionAvailability,
  changeShopOfferAvailability: services.changeShopOfferAvailability,
  freezeCardInstance: services.freezeCardInstance,
  freezePackInstance: services.freezePackInstance,
  restoreCardInstance: services.restoreCardInstance,
  restorePackInstance: services.restorePackInstance,
}));
vi.mock("../services/collectible-correction", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../services/collectible-correction")
  >()),
  grantExceptionalCard: services.grantExceptionalCard,
  reverseExceptionalEteris: services.reverseExceptionalEteris,
  transferExceptionalCollectible: services.transferExceptionalCollectible,
}));
vi.mock("../services/collectible-grant-campaign", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../services/collectible-grant-campaign")
  >()),
  retryCollectibleGrantNotification: services.retryCollectibleGrantNotification,
}));
vi.mock("../services/gift-offer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/gift-offer")>()),
  administrativelyCancelGiftOffer: services.administrativelyCancelGiftOffer,
}));
vi.mock("../services/trade-offer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/trade-offer")>()),
  administrativelyCancelTradeOffer: services.administrativelyCancelTradeOffer,
}));
vi.mock("../services/collectible-admin-action", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../services/collectible-admin-action")
  >()),
  listCollectibleAdminActions: services.listCollectibleAdminActions,
}));
vi.mock("../services/economy-report", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/economy-report")>()),
  getCollectibleOperationalMetrics: services.getCollectibleOperationalMetrics,
}));

function createContext(role = "owner", impersonatedBy?: string): Context {
  return {
    db: {},
    headers: new Headers(),
    isSharedCacheContext: true,
    session: {
      session: impersonatedBy ? { impersonatedBy } : {},
      user: { id: "owner-1", role },
    },
  } as unknown as Context;
}

const characterDraft = {
  characterName: "Link",
  gameName: "The Legend of Zelda",
};

describe("collectiblesAdmin card boundaries", () => {
  beforeEach(() => {
    flags.enabled = true;
    capabilityGrants.admin = [];
    capabilityGrants.moderator = [];
    vi.clearAllMocks();
    services.createCardCharacter.mockResolvedValue({ id: "character-1" });
    services.createCardSeries.mockResolvedValue({ id: "series-1" });
    services.saveCardTemplateDraftWithPortrait.mockResolvedValue({
      id: "template-1",
    });
    services.savePackTemplateDraftWithAsset.mockResolvedValue({ id: "pack-1" });
    services.inspectPackRevisionProbabilities.mockResolvedValue({
      groups: [{ order: 1, rarityWeights: [], totalWeight: 1 }],
    });
    services.publishPackRevision.mockResolvedValue({
      revisionId: "revision-1",
      templateId: "pack-1",
    });
  });

  it("keeps every operational mutation capability-gated and rejects impersonation", async () => {
    const mutationCases = [
      {
        input: {
          assetId: "card-1",
          custody: "retain",
          expectedVersion: 1,
          idempotencyKey: "card-freeze-1",
          reason: "Revisión confirmada",
        },
        procedure: collectiblesAdminRouter.freezes.cardInstances.freeze,
        service: services.freezeCardInstance,
      },
      {
        input: {
          assetId: "pack-1",
          custody: "release",
          expectedVersion: 1,
          idempotencyKey: "pack-freeze-1",
          reason: "Custodia comprometida",
        },
        procedure: collectiblesAdminRouter.freezes.packInstances.freeze,
        service: services.freezePackInstance,
      },
      {
        input: {
          expectedVersion: 1,
          idempotencyKey: "revision-disable-1",
          reason: "Revisión retirada",
          revisionId: "revision-1",
        },
        procedure: collectiblesAdminRouter.freezes.revisions.disable,
        service: services.changePackRevisionAvailability,
      },
      {
        input: {
          expectedVersion: 1,
          idempotencyKey: "template-disable-1",
          reason: "Presentación insegura",
          templateId: "template-1",
        },
        procedure: collectiblesAdminRouter.freezes.templates.disable,
        service: services.changeCardTemplateAvailability,
      },
      {
        input: {
          expectedVersion: 1,
          idempotencyKey: "offer-disable-1",
          offerId: "offer-1",
          reason: "Pausa operativa",
        },
        procedure: collectiblesAdminRouter.freezes.shopOffers.disable,
        service: services.changeShopOfferAvailability,
      },
      {
        input: {
          expectedVersion: 1,
          idempotencyKey: "machine-pause-1",
          machineId: "machine-1",
          reason: "Mantenimiento programado",
        },
        procedure: collectiblesAdminRouter.freezes.gachapon.pause,
        service: services.changeGachaponMachineAvailability,
      },
      {
        input: {
          expectedVersion: 1,
          idempotencyKey: "trade-cancel-1",
          offerId: "trade-1",
          reason: "Cierre administrativo",
        },
        procedure: collectiblesAdminRouter.offers.trades.cancel,
        service: services.administrativelyCancelTradeOffer,
      },
      {
        input: {
          expectedVersion: 1,
          giftId: "gift-1",
          idempotencyKey: "gift-cancel-1",
          reason: "Cierre administrativo",
        },
        procedure: collectiblesAdminRouter.offers.gifts.cancel,
        service: services.administrativelyCancelGiftOffer,
      },
      {
        input: {
          binding: "transferable",
          expectedVersion: 1,
          idempotencyKey: "grant-correct-1",
          reason: "Recompensa autorizada",
          targetUserId: "user-1",
          templateId: "template-1",
        },
        procedure: collectiblesAdminRouter.corrections.exceptionalGrant,
        service: services.grantExceptionalCard,
      },
      {
        input: {
          assetId: "card-1",
          expectedVersion: 1,
          fromUserId: "from-user",
          idempotencyKey: "transfer-correct-1",
          kind: "card",
          reason: "Propiedad documentada",
          toUserId: "to-user",
        },
        procedure: collectiblesAdminRouter.corrections.exceptionalTransfer,
        service: services.transferExceptionalCollectible,
      },
      {
        input: {
          expectedSequence: "7",
          failureCode: "settlement-failure",
          idempotencyKey: "eteris-correct-1",
          reason: "Falla verificada",
          transactionId: "eteris-1",
          verifiedFailure: true,
        },
        procedure: collectiblesAdminRouter.corrections.reverseEteris,
        service: services.reverseExceptionalEteris,
      },
    ] as const;

    for (const item of mutationCases) {
      item.service.mockResolvedValue({ actionId: "action-1" });
      await expect(
        call(item.procedure as never, item.input as never, {
          context: createContext("admin"),
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        call(item.procedure as never, item.input as never, {
          context: createContext("owner", "staff-1"),
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        call(item.procedure as never, item.input as never, {
          context: createContext(),
        })
      ).resolves.toMatchObject({ actionId: "action-1" });
      expect(item.service).toHaveBeenCalled();
    }
  });

  it("permits only an explicit later role grant and keeps audit/metrics read-only", async () => {
    const input = {
      assetId: "card-1",
      custody: "retain" as const,
      expectedVersion: 1,
      idempotencyKey: "explicit-freeze-1",
      reason: "Revisión autorizada",
    };
    services.freezeCardInstance.mockResolvedValue({ actionId: "action-2" });
    await expect(
      call(collectiblesAdminRouter.freezes.cardInstances.freeze, input, {
        context: createContext("moderator"),
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    capabilityGrants.moderator = ["cards:freeze"];
    await expect(
      call(collectiblesAdminRouter.freezes.cardInstances.freeze, input, {
        context: createContext("moderator"),
      })
    ).resolves.toMatchObject({ actionId: "action-2" });

    services.listCollectibleAdminActions.mockResolvedValue({
      items: [
        {
          action: "freeze",
          actionId: "action-2",
          after: { availability: "frozen" },
          before: { availability: "active" },
          createdAt: "2026-08-17T00:00:00.000Z",
          reason: "Revisión autorizada",
          targetId: "card-1",
          targetKind: "card-instance",
          version: 2,
        },
      ],
      nextCursor: null,
    });
    capabilityGrants.moderator.push("collectibles:audit");
    await expect(
      call(
        collectiblesAdminRouter.audit.list,
        { action: "freeze", limit: 1, targetKind: "card-instance" },
        { context: createContext("moderator") }
      )
    ).resolves.toMatchObject({ items: [{ action: "freeze" }] });
    expect(services.listCollectibleAdminActions).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "freeze", targetKind: "card-instance" })
    );

    services.getCollectibleOperationalMetrics.mockResolvedValue({
      correction: 0,
      freeze: 1,
      notificationBacklog: 0,
    });
    await expect(
      call(collectiblesAdminRouter.operations.metrics, undefined, {
        context: createContext("moderator"),
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    capabilityGrants.moderator.push("economy:view");
    await expect(
      call(collectiblesAdminRouter.operations.metrics, undefined, {
        context: createContext("moderator"),
      })
    ).resolves.toMatchObject({ freeze: 1 });
  });

  it("keeps grant notification retries behind the single mutation gate", async () => {
    services.retryCollectibleGrantNotification.mockResolvedValue({
      id: "notification-1",
    });
    flags.enabled = false;
    await expect(
      call(
        collectiblesAdminRouter.grants.retryNotification,
        { executionId: "execution-1" },
        { context: createContext() }
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(services.retryCollectibleGrantNotification).not.toHaveBeenCalled();

    flags.enabled = true;
    await expect(
      call(
        collectiblesAdminRouter.grants.retryNotification,
        { executionId: "execution-1" },
        { context: createContext() }
      )
    ).resolves.toMatchObject({ id: "notification-1" });
  });

  it("validates reason, expected version, and idempotency before invoking a mutation service", async () => {
    await expect(
      call(
        collectiblesAdminRouter.freezes.cardInstances.freeze,
        {
          assetId: "card-1",
          custody: "retain",
          expectedVersion: 0,
          idempotencyKey: "short",
          reason: " ",
        },
        { context: createContext() }
      )
    ).rejects.toThrow("Input validation failed");
    expect(services.freezeCardInstance).not.toHaveBeenCalled();
  });

  it("allows an explicitly capable, non-impersonated owner to author", async () => {
    await expect(
      call(collectiblesAdminRouter.characters.create, characterDraft, {
        context: createContext(),
      })
    ).resolves.toMatchObject({ id: "character-1" });
    expect(services.createCardCharacter).toHaveBeenCalledWith(
      expect.anything(),
      "owner-1",
      characterDraft
    );
  });

  it("accepts a deferred portrait upload when saving a card draft", async () => {
    const portrait = new File(["portrait"], "samus.png", {
      type: "image/png",
    });
    const draft = {
      characterId: "character-1",
      description: "Cazadora espacial",
      edition: null,
      effect: { effect: "none" as const, intensity: "low" as const },
      lifetimeSupplyCeiling: null,
      presentation: {
        accentColor: "#7c3aed",
        frameKey: "cosmic" as const,
        watermarkText: "NeXusTC" as const,
      },
      rarity: "rare" as const,
      seriesId: "series-1",
    };

    await expect(
      call(
        collectiblesAdminRouter.templates.saveDraft,
        {
          draft,
          portraitSelection: [{ file: portrait, kind: "pending" }],
        },
        { context: createContext() }
      )
    ).resolves.toMatchObject({ id: "template-1" });
    expect(services.saveCardTemplateDraftWithPortrait).toHaveBeenCalledWith(
      expect.anything(),
      "owner-1",
      draft,
      [{ file: portrait, kind: "pending" }],
      undefined
    );
  });

  it("enforces capability, gate, and impersonation at the server boundary", async () => {
    await expect(
      call(collectiblesAdminRouter.characters.create, characterDraft, {
        context: createContext("admin"),
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      call(collectiblesAdminRouter.characters.create, characterDraft, {
        context: createContext("owner", "staff-1"),
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    flags.enabled = false;
    await expect(
      call(collectiblesAdminRouter.characters.create, characterDraft, {
        context: createContext(),
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(services.createCardCharacter).not.toHaveBeenCalled();
  });

  it("rejects malformed authoring input before invoking the service", async () => {
    await expect(
      call(
        collectiblesAdminRouter.characters.create,
        { characterName: "", gameName: "" },
        { context: createContext() }
      )
    ).rejects.toThrow("Input validation failed");
    expect(services.createCardCharacter).not.toHaveBeenCalled();
  });

  it("uses the packs capability and one explicit publication confirmation", async () => {
    await expect(
      call(
        collectiblesAdminRouter.packs.templates.create,
        {
          assetSelection: [{ kind: "existing", mediaId: "media-1" }],
          draft: { description: "Pack", name: "Inicial" },
        },
        { context: createContext() }
      )
    ).resolves.toMatchObject({ id: "pack-1" });
    expect(services.savePackTemplateDraftWithAsset).toHaveBeenCalledWith(
      expect.anything(),
      "owner-1",
      expect.objectContaining({ name: "Inicial" }),
      [{ kind: "existing", mediaId: "media-1" }]
    );
    await expect(
      call(
        collectiblesAdminRouter.packs.revisions.probabilities,
        { revisionId: "revision-1" },
        { context: createContext() }
      )
    ).resolves.toMatchObject({ groups: [{ order: 1 }] });
    expect(services.inspectPackRevisionProbabilities).toHaveBeenCalledWith(
      expect.anything(),
      "revision-1"
    );
    await expect(
      call(
        collectiblesAdminRouter.packs.revisions.publish,
        {
          confirm: true,
          expectedRevisionVersion: 1,
          expectedTemplateVersion: 1,
          revisionId: "revision-1",
          templateId: "pack-1",
        },
        { context: createContext() }
      )
    ).resolves.toMatchObject({ revisionId: "revision-1" });
    // The router delegates confirmation to the service (asserted unmocked in
    // pack-authoring.test.ts), so an unconfirmed call still reaches it here
    // and the service owns the INVALID_TRANSITION refusal.
    await expect(
      call(
        collectiblesAdminRouter.packs.revisions.publish,
        {
          confirm: false,
          expectedRevisionVersion: 1,
          expectedTemplateVersion: 1,
          revisionId: "revision-1",
          templateId: "pack-1",
        },
        { context: createContext() }
      )
    ).resolves.toMatchObject({ revisionId: "revision-1" });
    expect(services.publishPackRevision).toHaveBeenCalledWith(
      expect.anything(),
      "owner-1",
      "pack-1",
      expect.objectContaining({ confirm: false, revisionId: "revision-1" })
    );
    await expect(
      call(
        collectiblesAdminRouter.packs.templates.create,
        {
          assetSelection: [{ kind: "existing", mediaId: "media-1" }],
          draft: { description: "Pack", name: "Admin" },
        },
        { context: createContext("admin") }
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      call(
        collectiblesAdminRouter.packs.templates.create,
        {
          assetSelection: [{ kind: "existing", mediaId: "media-1" }],
          draft: { description: "Pack", name: "Impersonado" },
        },
        { context: createContext("owner", "staff-1") }
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
