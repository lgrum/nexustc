import { buildCardRenderPlan } from "@repo/shared/collectibles";
import { describe, expect, it } from "vitest";

import {
  assertCardTemplateLifecycleTransition,
  assertCardTemplateMintable,
  assertStaticCardPortraitUpload,
  normalizeCardCharacterDraft,
} from "./card-authoring";
import { shapePublicCardTemplate } from "./card-catalog";

describe("card authoring service seams", () => {
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
