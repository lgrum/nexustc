import { describe, expect, it } from "vitest";

import {
  COLLECTIBLE_ASSET_KINDS,
  COLLECTIBLE_BINDINGS,
  COLLECTIBLE_ERROR_CODES,
  COLLECTIBLE_METRIC_NAMES,
  COLLECTIBLE_RARITY_CATALOG,
  COLLECTIBLE_RARITY_KEYS,
  COLLECTIBLE_RARITIES,
  COLLECTIBLE_COLLECTION_SORTS,
  assertCardTemplateFieldsMutable,
  assertCompleteCardRenderPlan,
  buildCardRenderPlan,
  cardEffectConfigSchema,
  blackMarketListingPublishInputSchema,
  blackMarketListingSearchInputSchema,
  blackMarketSaleHistoryInputSchema,
  calculateListingFee,
  collectibleAssetReferenceSchema,
  collectibleMutationInputSchema,
  collectibleReplayResultSchema,
  collectibleStateSchema,
  getCardCharacterIdentity,
  formatCardMintNumber,
  giftOfferActionInputSchema,
  giftOfferSendInputSchema,
  getDisabledCardPlaceholder,
  normalizeCardIdentity,
  normalizeCollectiblePayload,
  computePackConfigurationHash,
  createDeterministicCollectibleRandom,
  deterministicSeedFromId,
  normalizePackRevisionDraft,
  publicCardInstanceSchema,
  publicPackInstanceSchema,
  recordCollectibleMetric,
  selectPackOutcome,
  simulatePackRevision,
  tradeOfferCounterInputSchema,
  tradeOfferSendInputSchema,
  validatePackRevision,
} from "./collectibles";

describe("collectible rarity catalog", () => {
  it("keeps the five code-owned rarities in their stable order", () => {
    expect(COLLECTIBLE_RARITY_KEYS).toEqual([
      "common",
      "uncommon",
      "rare",
      "epic",
      "legendary",
    ]);
    expect(COLLECTIBLE_RARITIES).toEqual(COLLECTIBLE_RARITY_KEYS);
    expect(COLLECTIBLE_RARITY_CATALOG).toEqual([
      { code: "common", label: "Común", order: 0 },
      { code: "uncommon", label: "Poco común", order: 1 },
      { code: "rare", label: "Raro", order: 2 },
      { code: "epic", label: "Épico", order: 3 },
      { code: "legendary", label: "Legendario", order: 4 },
    ]);
  });
});

describe("public collection contracts", () => {
  it("keeps collection ordering bounded and cursor-friendly", () => {
    expect(COLLECTIBLE_COLLECTION_SORTS).toEqual([
      "newest",
      "rarity",
      "game",
      "character",
      "series",
      "edition",
      "limited",
      "transferability",
      "mint",
      "for-sale",
    ]);
  });

  it("rejects private ownership and provenance fields at the public card boundary", () => {
    const card = {
      availability: "active",
      binding: "transferable",
      characterName: "Samus Aran",
      edition: "Primera",
      forSale: false,
      gameName: "Metroid",
      id: "card-instance-1",
      limited: true,
      lifetimeSupplyCeiling: 100,
      mintDisplay: "#7/100",
      mintNumber: 7,
      rarity: "rare",
      seriesName: "Clásicos",
      template: {
        characterName: "Samus Aran",
        description: "Cazadora espacial",
        disabled: false,
        edition: "Primera",
        gameName: "Metroid",
        id: "card-template-1",
        lifetimeSupplyCeiling: 100,
        placeholder: false,
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
    } as const;

    expect(publicCardInstanceSchema.parse(card)).toEqual(card);
    expect(() =>
      publicCardInstanceSchema.parse({
        ...card,
        ownerUserId: "owner-1",
        provenance: [],
        mintedSupply: 8,
      })
    ).toThrow();
  });

  it("does not allow internal pack identity or hidden outcomes in public summaries", () => {
    const pack = {
      availability: "active",
      binding: "account-bound",
      forSale: false,
      issuedAt: new Date("2026-08-16T12:00:00.000Z"),
      revision: 2,
      templateAssetObjectKey: "packs/rendered/pack-1.webp",
      templateId: "pack-template-1",
      templateName: "Pack Inicial",
    } as const;

    expect(publicPackInstanceSchema.parse(pack)).toEqual(pack);
    expect(() =>
      publicPackInstanceSchema.parse({
        ...pack,
        id: "pack-instance-1",
        cardInstanceIds: ["card-instance-1"],
        issueReference: "private-issue-1",
      })
    ).toThrow();
  });
});

describe("pack issuance selection and mint presentation", () => {
  it("formats unlimited and limited mint numbers without exposing a counter", () => {
    expect(formatCardMintNumber(7, null)).toBe("#7");
    expect(formatCardMintNumber(7, 100)).toBe("#7/100");
    expect(() => formatCardMintNumber(0, null)).toThrow();
  });

  it("requires an injected random source instead of degrading to Math.random", () => {
    const configuration = normalizePackRevisionDraft({
      cardCount: 1,
      duplicatePolicy: "allow",
      drawGroups: [
        {
          order: 1,
          drawCount: 1,
          rarityWeights: [{ rarity: "rare", weight: 1 }],
          cardWeights: [
            { cardTemplateId: "card-1", rarity: "rare", weight: 1 },
          ],
          guarantees: [],
        },
      ],
    });
    const candidates = [{ cardTemplateId: "card-1", rarity: "rare" as const }];
    expect(() => selectPackOutcome(configuration, candidates)).toThrow(
      "fuente de aleatoriedad"
    );
    expect(() =>
      simulatePackRevision(
        {
          cardCount: 1,
          duplicatePolicy: "allow",
          drawGroups: [
            {
              order: 1,
              drawCount: 1,
              rarityWeights: [{ rarity: "rare", weight: 1 }],
              cardWeights: [
                { cardTemplateId: "card-1", rarity: "rare", weight: 1 },
              ],
              guarantees: [],
            },
          ],
        },
        { iterations: 3 }
      )
    ).toThrow("fuente de aleatoriedad");
  });

  it("removes unavailable cards before weighted selection and renormalizes", () => {
    const configuration = normalizePackRevisionDraft({
      cardCount: 1,
      duplicatePolicy: "allow",
      drawGroups: [
        {
          order: 1,
          drawCount: 1,
          rarityWeights: [{ rarity: "rare", weight: 1 }],
          cardWeights: [
            { cardTemplateId: "retired", rarity: "rare", weight: 100 },
            { cardTemplateId: "active", rarity: "rare", weight: 1 },
          ],
          guarantees: [],
        },
      ],
    });
    expect(
      selectPackOutcome(
        configuration,
        [
          { available: false, cardTemplateId: "retired", rarity: "rare" },
          { available: true, cardTemplateId: "active", rarity: "rare" },
        ],
        () => 0.999
      )
    ).toEqual([{ cardTemplateId: "active", rarity: "rare" }]);
  });

  it("uses ordered groups and weighted half-open boundaries", () => {
    const configuration = normalizePackRevisionDraft({
      cardCount: 2,
      duplicatePolicy: "allow",
      drawGroups: [
        {
          order: 2,
          drawCount: 1,
          rarityWeights: [{ rarity: "common", weight: 1 }],
          cardWeights: [
            { cardTemplateId: "group-two", rarity: "common", weight: 1 },
          ],
          guarantees: [],
        },
        {
          order: 1,
          drawCount: 1,
          rarityWeights: [
            { rarity: "common", weight: 1 },
            { rarity: "rare", weight: 1 },
          ],
          cardWeights: [
            { cardTemplateId: "group-one-common", rarity: "common", weight: 1 },
            { cardTemplateId: "group-one-rare", rarity: "rare", weight: 1 },
          ],
          guarantees: [],
        },
      ],
    });
    const randomValues = [0.5, 0, 0.9, 0];
    const outcome = selectPackOutcome(
      configuration,
      [
        { cardTemplateId: "group-one-common", rarity: "common" },
        { cardTemplateId: "group-one-rare", rarity: "rare" },
        { cardTemplateId: "group-two", rarity: "common" },
      ],
      () => randomValues.shift() ?? 0
    );
    expect(outcome).toEqual([
      { cardTemplateId: "group-one-rare", rarity: "rare" },
      { cardTemplateId: "group-two", rarity: "common" },
    ]);
  });

  it("keeps revision-wide no-duplicate guarantees feasible across groups", () => {
    const configuration = normalizePackRevisionDraft({
      cardCount: 2,
      duplicatePolicy: "no-duplicates",
      drawGroups: [
        {
          order: 1,
          drawCount: 1,
          rarityWeights: [{ rarity: "rare", weight: 1 }],
          cardWeights: [
            { cardTemplateId: "rare-1", rarity: "rare", weight: 1 },
            { cardTemplateId: "rare-2", rarity: "rare", weight: 1 },
          ],
          guarantees: [{ minimumCount: 1, rarity: "rare" }],
        },
        {
          order: 2,
          drawCount: 1,
          rarityWeights: [{ rarity: "rare", weight: 1 }],
          cardWeights: [
            { cardTemplateId: "rare-1", rarity: "rare", weight: 1 },
            { cardTemplateId: "rare-2", rarity: "rare", weight: 1 },
          ],
          guarantees: [{ minimumCount: 1, rarity: "rare" }],
        },
      ],
    });
    const outcome = selectPackOutcome(
      configuration,
      [
        { cardTemplateId: "rare-1", rarity: "rare" },
        { cardTemplateId: "rare-2", rarity: "rare" },
      ],
      () => 0.999
    );
    expect(
      new Set(outcome.map(({ cardTemplateId }) => cardTemplateId)).size
    ).toBe(2);
  });

  it("does not reuse a limited template after its remaining capacity is spent", () => {
    const configuration = normalizePackRevisionDraft({
      cardCount: 2,
      duplicatePolicy: "allow",
      drawGroups: [
        {
          order: 1,
          drawCount: 2,
          rarityWeights: [{ rarity: "rare", weight: 1 }],
          cardWeights: [
            { cardTemplateId: "limited", rarity: "rare", weight: 1 },
          ],
          guarantees: [],
        },
      ],
    });
    expect(() =>
      selectPackOutcome(
        configuration,
        [
          {
            cardTemplateId: "limited",
            lifetimeSupplyCeiling: 1,
            mintedSupply: 0,
            rarity: "rare",
          },
        ],
        () => 0
      )
    ).toThrow("candidatas");
  });

  it("resamples after an exhausted candidate is removed", () => {
    const configuration = normalizePackRevisionDraft({
      cardCount: 1,
      duplicatePolicy: "allow",
      drawGroups: [
        {
          order: 1,
          drawCount: 1,
          rarityWeights: [{ rarity: "rare", weight: 1 }],
          cardWeights: [
            { cardTemplateId: "exhausted", rarity: "rare", weight: 100 },
            { cardTemplateId: "remaining", rarity: "rare", weight: 1 },
          ],
          guarantees: [],
        },
      ],
    });
    expect(
      selectPackOutcome(
        configuration,
        [
          {
            cardTemplateId: "exhausted",
            lifetimeSupplyCeiling: 1,
            mintedSupply: 1,
            rarity: "rare",
          },
          { cardTemplateId: "remaining", rarity: "rare" },
        ],
        () => 0
      )
    ).toEqual([{ cardTemplateId: "remaining", rarity: "rare" }]);
  });
});

describe("collectible boundary contracts", () => {
  it("parses asset references and command concurrency inputs", () => {
    expect(
      collectibleAssetReferenceSchema.parse({
        assetId: "card-1",
        kind: "card",
      })
    ).toEqual({ assetId: "card-1", kind: "card" });
    expect(
      collectibleMutationInputSchema.parse({
        expectedVersion: 3,
        idempotencyKey: "open-pack:request-123",
      })
    ).toEqual({
      expectedVersion: 3,
      idempotencyKey: "open-pack:request-123",
    });
    expect(collectibleReplayResultSchema.parse({ replayed: true })).toEqual({
      replayed: true,
    });
    expect(
      collectibleStateSchema.parse({
        availability: "active",
        binding: "transferable",
        lifecycle: "active",
      })
    ).toEqual({
      availability: "active",
      binding: "transferable",
      lifecycle: "active",
    });
    expect(COLLECTIBLE_BINDINGS).toEqual(["transferable", "account-bound"]);
    expect(COLLECTIBLE_ASSET_KINDS).toEqual(["card", "pack"]);
  });

  it("rejects malformed keys and unknown state values", () => {
    expect(
      collectibleMutationInputSchema.safeParse({
        expectedVersion: 0,
        idempotencyKey: "short",
      }).success
    ).toBe(false);
    expect(
      collectibleStateSchema.safeParse({
        availability: "active",
        binding: "account-bound",
        lifecycle: "published",
      }).success
    ).toBe(false);
  });

  it("exposes the stable domain error contract", () => {
    expect(COLLECTIBLE_ERROR_CODES).toEqual([
      "GATE_DISABLED",
      "SPENDING_DISABLED",
      "ACCOUNT_INELIGIBLE",
      "WALLET_BLOCKED",
      "INSUFFICIENT_FUNDS",
      "STALE_VERSION",
      "UNAVAILABLE",
      "EXHAUSTED_SUPPLY",
      "IMPOSSIBLE_GUARANTEE",
      "ALREADY_OPENED",
      "ACTIVE_CUSTODY",
      "OWNERSHIP_CHANGED",
      "OFFER_EXPIRED",
      "LISTING_CHANGED",
      "POLICY_BLOCKED",
      "IDEMPOTENCY_CONFLICT",
      "CORRECTIVE_AUTHORITY_REQUIRED",
      "DUPLICATE_ASSET",
      "OFFER_NOT_FOUND",
      "OFFER_TERMINAL",
      "SELF_TRADE",
      "ACCOUNT_BLOCKED",
    ]);
  });

  it("keeps issuance metrics structured without outcome payload fields", () => {
    expect(COLLECTIBLE_METRIC_NAMES).toEqual([
      "custody_conflict",
      "stale_ownership",
      "supply_exhaustion",
      "impossible_guarantee",
      "projection_mismatch",
      "idempotency_conflict",
      "deadlock_retry",
      "expiry_backlog",
      "repeated_cancellation",
      "rate_limit_decision",
      "freeze",
      "restore",
      "correction",
      "exceptional_grant",
      "exceptional_transfer",
      "fee_reversal",
      "revision_disabled",
      "revision_exhaustion",
      "quota_drift",
      "custody_age",
      "failed_settlement",
      "render_failure",
      "notification_backlog",
    ]);
  });

  it("bounds both trade sides at 50 exact assets and rejects duplicate IDs", () => {
    const side = Array.from({ length: 50 }, (_, index) => ({
      assetId: `asset-${index}`,
      kind: index % 2 === 0 ? ("card" as const) : ("pack" as const),
    }));
    expect(
      tradeOfferSendInputSchema.parse({
        idempotencyKey: "trade:bundle-contract",
        proposerAssets: side,
        recipientAssets: side.map((asset, index) => ({
          ...asset,
          assetId: `recipient-${index}`,
        })),
        recipientUserId: "user-recipient",
      }).proposerAssets
    ).toHaveLength(50);
    expect(
      tradeOfferSendInputSchema.safeParse({
        idempotencyKey: "trade:too-many",
        proposerAssets: [...side, { assetId: "asset-50", kind: "card" }],
        recipientAssets: [{ assetId: "recipient-1", kind: "card" }],
        recipientUserId: "user-recipient",
      }).success
    ).toBe(false);
    expect(
      tradeOfferSendInputSchema.safeParse({
        idempotencyKey: "trade:duplicate",
        proposerAssets: [{ assetId: "same", kind: "card" }],
        recipientAssets: [{ assetId: "same", kind: "pack" }],
        recipientUserId: "user-recipient",
      }).success
    ).toBe(false);
  });

  it("keeps gifts distinct from trades and bounds mixed exact assets", () => {
    const assets = Array.from({ length: 50 }, (_, index) => ({
      assetId: `gift-asset-${index}`,
      kind: index % 2 === 0 ? ("card" as const) : ("pack" as const),
    }));
    expect(
      giftOfferSendInputSchema.parse({
        assets,
        idempotencyKey: "gift:bundle-contract",
        recipientUserId: "user-recipient",
      })
    ).toMatchObject({ assets, recipientUserId: "user-recipient" });
    expect(
      giftOfferSendInputSchema.safeParse({
        assets: [...assets, { assetId: "gift-asset-50", kind: "card" }],
        idempotencyKey: "gift:too-many",
        recipientUserId: "user-recipient",
      }).success
    ).toBe(false);
    expect(
      giftOfferSendInputSchema.safeParse({
        assets: [assets[0], assets[0]],
        idempotencyKey: "gift:duplicate",
        recipientUserId: "user-recipient",
      }).success
    ).toBe(false);
    expect(
      giftOfferSendInputSchema.safeParse({
        assets: [{ assetId: "gift-asset-1", kind: "card" }],
        description: "sin descripción",
        idempotencyKey: "gift:extra-field",
        price: "0",
        recipientUserId: "user-recipient",
      }).success
    ).toBe(false);
    expect(
      giftOfferActionInputSchema.parse({
        giftId: "gift-1",
        idempotencyKey: "gift:accept-action",
      })
    ).toEqual({ giftId: "gift-1", idempotencyKey: "gift:accept-action" });
  });

  it("keeps the Ticket 11 singular payload as an exact one-per-side subset", () => {
    expect(
      tradeOfferSendInputSchema.parse({
        idempotencyKey: "trade:legacy-send",
        proposerAsset: { assetId: "card-1", kind: "card" },
        recipientAsset: { assetId: "pack-1", kind: "pack" },
        recipientUserId: "user-recipient",
      })
    ).toMatchObject({
      proposerAsset: { assetId: "card-1", kind: "card" },
      recipientAsset: { assetId: "pack-1", kind: "pack" },
    });
    expect(
      tradeOfferCounterInputSchema.parse({
        idempotencyKey: "trade:legacy-counter",
        offerId: "offer-1",
        proposerAsset: { assetId: "card-2", kind: "card" },
        recipientAsset: { assetId: "pack-2", kind: "pack" },
      })
    ).toHaveProperty("offerId", "offer-1");
  });

  it("strips accidental hidden outcome fields at the metrics boundary", () => {
    const events: unknown[] = [];
    recordCollectibleMetric(
      (event) => {
        events.push(event);
      },
      {
        name: "supply_exhaustion",
        operation: "pack.issue",
        randomBytes: "secret",
        outcome: ["hidden-card"],
      } as never
    );
    expect(events[0]).toMatchObject({
      name: "supply_exhaustion",
      operation: "pack.issue",
    });
    expect(events[0]).not.toHaveProperty("randomBytes");
    expect(events[0]).not.toHaveProperty("outcome");
  });
});

describe("Listing Fee", () => {
  it.each([
    [0n, 1n],
    [1n, 1n],
    [19n, 1n],
    [20n, 1n],
    [21n, 2n],
    [100n, 5n],
    [101n, 6n],
  ])("charges the five-percent ceiling for %s Eteris", (asking, fee) => {
    expect(calculateListingFee(asking)).toBe(fee);
  });
});

describe("Black Market contracts", () => {
  it("accepts one exact asset and a mixed bundle of fifty", () => {
    const one = blackMarketListingPublishInputSchema.parse({
      askingPrice: "1",
      assets: [{ assetId: "card-1", kind: "card" }],
      idempotencyKey: "listing-one",
    });
    const fifty = blackMarketListingPublishInputSchema.parse({
      askingPrice: "100",
      assets: Array.from({ length: 50 }, (_, index) => ({
        assetId: `asset-${index}`,
        kind: index % 2 === 0 ? "card" : "pack",
      })),
      idempotencyKey: "listing-fifty",
    });
    expect(one.assets).toHaveLength(1);
    expect(fifty.assets).toHaveLength(50);
    expect(new Set(fifty.assets.map(({ kind }) => kind))).toEqual(
      new Set(["card", "pack"])
    );
  });

  it("rejects duplicate assets and prices outside the integer contract", () => {
    expect(() =>
      blackMarketListingPublishInputSchema.parse({
        askingPrice: "1",
        assets: [
          { assetId: "same", kind: "card" },
          { assetId: "same", kind: "pack" },
        ],
        idempotencyKey: "listing-duplicate",
      })
    ).toThrow();
    expect(() =>
      blackMarketListingPublishInputSchema.parse({
        askingPrice: "0",
        assets: [{ assetId: "card-1", kind: "card" }],
        idempotencyKey: "listing-zero",
      })
    ).toThrow();
    expect(() =>
      blackMarketListingPublishInputSchema.parse({
        askingPrice: "1.5",
        assets: [{ assetId: "card-1", kind: "card" }],
        idempotencyKey: "listing-decimal",
      })
    ).toThrow();
  });

  it("keeps search filters and sale terms bounded", () => {
    const input = blackMarketListingSearchInputSchema.parse({
      assetKind: "card",
      bundleStatus: "bundle",
      character: "Samus",
      edition: "First",
      gameName: "metroid",
      limited: true,
      maxPrice: "900",
      minPrice: "100",
      mintNumber: 4,
      rarity: "rare",
      search: "zero",
      series: "Prime",
      seriesId: "series-1",
      sort: "mint",
    });
    expect(input.limit).toBe(20);
    expect(input.maxPrice).toBe(900n);
    expect(input.minPrice).toBe(100n);
    expect(
      blackMarketSaleHistoryInputSchema.parse({ cardTemplateId: "template-1" })
    ).toEqual({
      cardTemplateId: "template-1",
      limit: 20,
    });
  });
});

describe("idempotency payload normalization", () => {
  it("ignores object key order while preserving array order", () => {
    expect(
      normalizeCollectiblePayload({
        z: 1,
        nested: { b: 2, a: 1 },
        items: ["card-2", "card-1"],
      })
    ).toBe('{"items":["card-2","card-1"],"nested":{"a":1,"b":2},"z":1}');
  });
});

describe("card authoring contracts", () => {
  const presentation = {
    accentColor: "#7c3aed",
    frameKey: "cosmic",
    watermarkText: "NeXusTC",
  } as const;

  it("normalizes character identity without changing curated display spelling", () => {
    expect(normalizeCardIdentity("  Link\u00A0  OF  Hyrule ")).toBe(
      "link of hyrule"
    );
    expect(
      getCardCharacterIdentity({
        characterName: "Link",
        gameName: "The Legend of Zelda",
      })
    ).toEqual({
      characterName: "link",
      gameName: "the legend of zelda",
    });
  });

  it("accepts only registered effects and builds every immutable presentation variant", () => {
    expect(
      cardEffectConfigSchema.safeParse({
        effect: "starlight-drift",
        intensity: "medium",
        css: "body { display: none }",
      }).success
    ).toBe(false);

    const plan = buildCardRenderPlan({
      effect: { effect: "starlight-drift", intensity: "medium" },
      presentation,
      portraitMediaId: "media-1",
      templateId: "template-1",
    });
    expect(plan.includes).toEqual([
      "frame",
      "labels",
      "rarity",
      "watermark",
      "effect",
    ]);
    expect(plan.labels).toMatchObject({
      rarity: "Común",
      watermark: "NeXusTC",
    });
    expect(plan.variants.map(({ variant }) => variant)).toEqual([
      "standard",
      "thumbnail",
      "static",
      "reduced-motion",
    ]);
    expect(assertCompleteCardRenderPlan(plan)).toHaveLength(4);
    expect(
      buildCardRenderPlan({
        effect: { effect: "starlight-drift", intensity: "medium" },
        presentation,
        portraitMediaId: "media-1",
        templateId: "template-1",
      })
    ).toEqual(plan);
  });

  it("rejects user-authored frames and non-domain watermarks", () => {
    expect(
      cardEffectConfigSchema.safeParse({
        effect: "none",
        intensity: "low",
      }).success
    ).toBe(true);
    expect(() =>
      buildCardRenderPlan({
        effect: { effect: "none", intensity: "low" },
        presentation: {
          accentColor: "#7c3aed",
          frameKey: "user-css" as never,
          watermarkText: "example.com" as never,
        },
        portraitMediaId: "media-1",
        templateId: "template-1",
      })
    ).toThrow();
  });

  it("freezes identity and economic fields after first mint", () => {
    expect(() =>
      assertCardTemplateFieldsMutable({
        changes: { rarity: "legendary" },
        mintedSupply: 1,
      })
    ).toThrow("primer mint");
    expect(() =>
      assertCardTemplateFieldsMutable({
        changes: { description: "texto corregido" },
        mintedSupply: 1,
      })
    ).not.toThrow();
  });

  it("exposes a safe disabled placeholder without private supply data", () => {
    const placeholder = getDisabledCardPlaceholder({
      id: "template-1",
      rarity: "rare",
      seriesName: "Cosmos",
    });
    expect(placeholder).toMatchObject({
      disabled: true,
      placeholder: true,
      characterName: "Contenido no disponible",
      renderedVariants: [],
    });
    expect(placeholder).not.toHaveProperty("mintedSupply");
  });
});

describe("pack revision contracts", () => {
  const draft = {
    cardCount: 2,
    duplicatePolicy: "no-duplicates" as const,
    drawGroups: [
      {
        order: 2,
        drawCount: 1,
        rarityWeights: [{ rarity: "common" as const, weight: 10 }],
        cardWeights: [
          { cardTemplateId: "card-2", rarity: "common" as const, weight: 1 },
        ],
        guarantees: [],
      },
      {
        order: 1,
        drawCount: 1,
        rarityWeights: [{ rarity: "rare" as const, weight: 1 }],
        cardWeights: [
          { cardTemplateId: "card-1", rarity: "rare" as const, weight: 1 },
        ],
        guarantees: [{ rarity: "rare" as const, minimumCount: 1 }],
      },
    ],
  };

  it("normalizes group order and keeps bounded integer weights", () => {
    const normalized = normalizePackRevisionDraft(draft);
    expect(normalized.drawGroups.map(({ order }) => order)).toEqual([1, 2]);
    expect(validatePackRevision(normalized)).toMatchObject({ valid: true });
    expect(computePackConfigurationHash(draft)).toMatch(/^[a-f0-9]{8}$/);
    expect(computePackConfigurationHash(draft)).toBe(
      computePackConfigurationHash(normalized)
    );
  });

  it("rejects impossible cross-group no-duplicate contracts", () => {
    const invalid = {
      ...draft,
      drawGroups: draft.drawGroups.map((group) => ({
        ...group,
        cardWeights: [
          {
            cardTemplateId: "card-1",
            rarity: group.rarityWeights[0]!.rarity,
            weight: 1,
          },
        ],
      })),
    };
    const result = validatePackRevision(invalid);
    expect(result.valid).toBe(false);
    expect(
      result.issues.some(({ message }) => message.includes("entre grupos"))
    ).toBe(true);
  });

  it("does not replace an explicit unavailable pool with same-rarity cards", () => {
    const result = validatePackRevision(
      {
        cardCount: 1,
        duplicatePolicy: "allow",
        drawGroups: [
          {
            order: 1,
            drawCount: 1,
            rarityWeights: [{ rarity: "rare", weight: 1 }],
            cardWeights: [
              { cardTemplateId: "card-1", rarity: "rare", weight: 1 },
            ],
            guarantees: [],
          },
        ],
      },
      {
        candidates: [
          {
            available: false,
            cardTemplateId: "card-1",
            rarity: "rare",
          },
          { available: true, cardTemplateId: "card-2", rarity: "rare" },
        ],
      }
    );
    expect(result.valid).toBe(false);
  });

  it("rejects guarantees whose combined minimum exceeds a group", () => {
    const result = validatePackRevision({
      cardCount: 1,
      duplicatePolicy: "allow",
      drawGroups: [
        {
          order: 1,
          drawCount: 1,
          rarityWeights: [
            { rarity: "common", weight: 1 },
            { rarity: "rare", weight: 1 },
          ],
          cardWeights: [],
          guarantees: [
            { minimumCount: 1, rarity: "common" },
            { minimumCount: 1, rarity: "rare" },
          ],
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(
      result.issues.some(({ message }) => message.includes("suma de garantías"))
    ).toBe(true);
  });

  it("keeps partial explicit pools draft-valid until candidate availability is checked", () => {
    const result = validatePackRevision({
      cardCount: 1,
      duplicatePolicy: "allow",
      drawGroups: [
        {
          order: 1,
          drawCount: 1,
          rarityWeights: [
            { rarity: "common", weight: 1 },
            { rarity: "rare", weight: 1 },
          ],
          cardWeights: [
            { cardTemplateId: "card-1", rarity: "rare", weight: 1 },
          ],
          guarantees: [],
        },
      ],
    });
    expect(result.valid).toBe(true);
  });

  it("proves no-duplicate guarantees across groups with candidate matching", () => {
    const result = validatePackRevision(
      {
        cardCount: 3,
        duplicatePolicy: "no-duplicates",
        drawGroups: [
          {
            order: 1,
            drawCount: 2,
            rarityWeights: [
              { rarity: "common", weight: 1 },
              { rarity: "rare", weight: 1 },
            ],
            cardWeights: [
              { cardTemplateId: "card-1", rarity: "rare", weight: 1 },
              { cardTemplateId: "card-2", rarity: "common", weight: 1 },
              { cardTemplateId: "card-3", rarity: "common", weight: 1 },
            ],
            guarantees: [{ minimumCount: 1, rarity: "rare" }],
          },
          {
            order: 2,
            drawCount: 1,
            rarityWeights: [{ rarity: "rare", weight: 1 }],
            cardWeights: [
              { cardTemplateId: "card-1", rarity: "rare", weight: 1 },
            ],
            guarantees: [{ minimumCount: 1, rarity: "rare" }],
          },
        ],
      },
      {
        candidates: [
          { cardTemplateId: "card-1", rarity: "rare", available: true },
          { cardTemplateId: "card-2", rarity: "common", available: true },
          { cardTemplateId: "card-3", rarity: "common", available: true },
        ],
      }
    );
    expect(result.valid).toBe(false);
    expect(
      result.issues.some(({ message }) => message.includes("asignación"))
    ).toBe(true);
  });

  it("produces reproducible aggregate simulation without exposing a result order", () => {
    const candidates = [
      {
        cardTemplateId: "card-1",
        rarity: "rare" as const,
        available: true,
        weight: 1,
      },
      {
        cardTemplateId: "card-2",
        rarity: "common" as const,
        available: true,
        weight: 1,
      },
    ];
    const left = simulatePackRevision(draft, {
      candidates,
      iterations: 12,
      random: () => 0,
    });
    const right = simulatePackRevision(draft, {
      candidates,
      iterations: 12,
      random: () => 0,
    });
    expect(left).toEqual(right);
    expect(left.draws).toBe(24);
    expect(left).not.toHaveProperty("outcomes");
    expect(left.guaranteeFailures).toBe(0);
  });

  it("produces identical aggregates from a seed or an id-derived deterministic seed", () => {
    const candidates = [
      {
        cardTemplateId: "card-1",
        rarity: "rare" as const,
        available: true,
        weight: 3,
      },
      {
        cardTemplateId: "card-2",
        rarity: "common" as const,
        available: true,
        weight: 1,
      },
    ];
    const seeded = simulatePackRevision(draft, {
      candidates,
      iterations: 500,
      random: createDeterministicCollectibleRandom(1234),
    });
    const replayed = simulatePackRevision(draft, {
      candidates,
      iterations: 500,
      random: createDeterministicCollectibleRandom(1234),
    });
    expect(seeded).toEqual(replayed);

    const derivedSeed = deterministicSeedFromId("revision-sim-1");
    expect(
      simulatePackRevision(draft, {
        candidates,
        iterations: 500,
        random: createDeterministicCollectibleRandom(derivedSeed),
      })
    ).toEqual(
      simulatePackRevision(draft, {
        candidates,
        iterations: 500,
        random: createDeterministicCollectibleRandom(
          deterministicSeedFromId("revision-sim-1")
        ),
      })
    );
    // Different ids derive different seeds, so distinct revisions do not
    // accidentally share a random stream.
    expect(deterministicSeedFromId("revision-sim-1")).not.toBe(
      deterministicSeedFromId("revision-sim-2")
    );
  });
});
