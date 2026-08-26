import { buildCardRenderPlan } from "@repo/shared/collectibles";
import { describe, expect, it, vi } from "vitest";

import type { withDeferredMediaSelection as WithDeferredMediaSelection } from "../utils/deferred-media";
import {
  assertCardTemplateLifecycleTransition,
  assertCardTemplateMintable,
  assertStaticCardPortraitUpload,
  normalizeCardCharacterDraft,
  saveCardTemplateDraftWithPortrait,
} from "./card-authoring";
import { shapePublicCardTemplate } from "./card-catalog";

vi.mock("../utils/deferred-media", () => ({
  withDeferredMediaSelection: vi.fn(
    (params: Parameters<typeof WithDeferredMediaSelection>[0]) =>
      params.db.transaction((tx) =>
        params.onComplete({
          orderedMedia: [
            {
              createdAt: new Date(0),
              folderId: null,
              id: "portrait-media-1",
              objectKey: "media/Carta/template-1/portrait.webp",
            },
          ],
          tx,
        })
      )
  ),
}));

describe("card authoring service seams", () => {
  it("creates a new template after materializing its portrait", async () => {
    const createdTemplate = {
      availability: "active",
      characterId: "character-1",
      description: "",
      edition: null,
      effectConfig: { effect: "none", intensity: "low" },
      id: "generated-template-1",
      lifetimeSupplyCeiling: null,
      lifecycle: "draft",
      mintedSupply: 0,
      portraitMediaId: "portrait-media-1",
      presentationMetadata: {
        accentColor: "#7c3aed",
        frameKey: "default",
        watermarkText: "NeXusTC",
      },
      rarity: "common",
      renderedVariants: [],
      seriesId: "series-1",
      version: 1,
    };
    const insert = vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([createdTemplate]),
      })),
    }));
    const select = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          for: vi.fn().mockResolvedValue([]),
        })),
      })),
    }));
    const tx = {
      insert,
      query: {
        cardCharacter: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ id: "character-1", lifecycle: "active" }),
        },
        cardSeries: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ id: "series-1", lifecycle: "active" }),
        },
        media: {
          findFirst: vi.fn().mockResolvedValue({
            id: "portrait-media-1",
            isAnimated: false,
            objectKey: "media/Carta/template-1/portrait.webp",
          }),
        },
      },
      select,
    };
    const db = {
      transaction: vi.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          await callback(tx)
      ),
    };

    await expect(
      saveCardTemplateDraftWithPortrait(
        db as unknown as Parameters<
          typeof saveCardTemplateDraftWithPortrait
        >[0],
        "actor-1",
        {
          characterId: "character-1",
          description: "",
          edition: null,
          effect: { effect: "none", intensity: "low" },
          lifetimeSupplyCeiling: null,
          presentation: {
            accentColor: "#7c3aed",
            frameKey: "default",
            watermarkText: "NeXusTC",
          },
          rarity: "common",
          seriesId: "series-1",
        },
        [{ kind: "existing", mediaId: "portrait-media-1" }]
      )
    ).resolves.toMatchObject({
      characterId: "character-1",
      portraitMediaId: "portrait-media-1",
      seriesId: "series-1",
    });
    expect(select).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it("rejects animated portrait uploads before storage", () => {
    expect(() => assertStaticCardPortraitUpload({ isAnimated: true })).toThrow(
      "estática"
    );
    expect(() =>
      assertStaticCardPortraitUpload({ isAnimated: false })
    ).not.toThrow();
  });

  it("archives draft templates instead of hard-deleting their audit history", () => {
    expect(() =>
      assertCardTemplateLifecycleTransition(
        { availability: "active", lifecycle: "draft" },
        "retire"
      )
    ).not.toThrow();
    expect(() =>
      assertCardTemplateLifecycleTransition(
        { availability: "active", lifecycle: "retired" },
        "retire"
      )
    ).toThrow("ya está retirada");
  });

  it("keeps display names curated while using normalized identity for uniqueness", () => {
    expect(
      normalizeCardCharacterDraft({
        characterName: "  Samus  Aran ",
        gameName: "Metroid\u00A0 Prime",
      })
    ).toMatchObject({
      characterName: "Samus  Aran",
      gameName: "Metroid\u00A0 Prime",
      normalizedCharacterName: "samus aran",
      normalizedGameName: "metroid prime",
    });
  });

  it("requires the complete static and reduced-motion render contract before minting", () => {
    const plan = buildCardRenderPlan({
      effect: { effect: "holographic-shimmer", intensity: "low" },
      presentation: {
        accentColor: "#7c3aed",
        frameKey: "cosmic",
        watermarkText: "NeXusTC",
      },
      portraitMediaId: "media-1",
      templateId: "template-1",
    });
    expect(() =>
      assertCardTemplateMintable({
        availability: "active",
        lifecycle: "active",
        lifetimeSupplyCeiling: 10,
        mintedSupply: 0,
        renderedVariants: plan.variants,
      })
    ).not.toThrow();
    expect(() =>
      assertCardTemplateMintable({
        availability: "active",
        lifecycle: "active",
        lifetimeSupplyCeiling: 10,
        mintedSupply: 10,
        renderedVariants: plan.variants,
      })
    ).toThrow("agotó");
    expect(() =>
      assertCardTemplateMintable({
        availability: "disabled",
        lifecycle: "active",
        lifetimeSupplyCeiling: null,
        mintedSupply: 0,
        renderedVariants: plan.variants,
      })
    ).toThrow("disponible");
  });

  it("does not leak minted supply, owners, provenance, or audit data in public shaping", () => {
    const plan = buildCardRenderPlan({
      effect: { effect: "none", intensity: "low" },
      presentation: {
        accentColor: "#7c3aed",
        frameKey: "cosmic",
        watermarkText: "NeXusTC",
      },
      portraitMediaId: "media-1",
      templateId: "template-1",
    });
    const publicTemplate = shapePublicCardTemplate({
      availability: "active",
      characterName: "Samus Aran",
      description: "Cazadora espacial",
      edition: null,
      gameName: "Metroid Prime",
      id: "template-1",
      lifetimeSupplyCeiling: 10,
      presentationMetadata: {
        accentColor: "#7c3aed",
        frameKey: "cosmic",
        watermarkText: "NeXusTC",
      },
      rarity: "rare",
      renderedVariants: plan.variants,
      seriesName: "Clásicos",
    });
    expect(publicTemplate).toEqual(
      expect.objectContaining({
        lifetimeSupplyCeiling: 10,
        rarity: "rare",
      })
    );
    expect(publicTemplate).not.toHaveProperty("mintedSupply");
    expect(publicTemplate).not.toHaveProperty("ownerUserId");
    expect(publicTemplate).not.toHaveProperty("auditEvents");
  });
});
