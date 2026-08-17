import {
  gachaponActivationInputSchema,
  gachaponMachineDraftSchema,
} from "@repo/shared/collectibles";
import { describe, expect, it } from "vitest";

import { selectWeightedGachaponEntry } from "./gachapon";

describe("Gachapon weighted Pack Template selection", () => {
  const entries = [
    { packTemplateId: "pack-a", weight: 1 },
    { packTemplateId: "pack-b", weight: 3 },
  ];

  it("uses deterministic integer-weight boundaries", () => {
    expect(selectWeightedGachaponEntry(entries, () => 0)).toMatchObject({
      packTemplateId: "pack-a",
    });
    expect(selectWeightedGachaponEntry(entries, () => 0.249_999)).toMatchObject(
      {
        packTemplateId: "pack-a",
      }
    );
    expect(selectWeightedGachaponEntry(entries, () => 0.25)).toMatchObject({
      packTemplateId: "pack-b",
    });
    expect(selectWeightedGachaponEntry(entries, () => 0.999_999)).toMatchObject(
      {
        packTemplateId: "pack-b",
      }
    );
  });

  it("never selects an empty or non-positive pool", () => {
    expect(selectWeightedGachaponEntry([])).toBeUndefined();
    expect(
      selectWeightedGachaponEntry([{ packTemplateId: "pack-a", weight: 0 }])
    ).toBeUndefined();
  });
});

describe("Gachapon shared contracts", () => {
  const draft = {
    binding: "transferable" as const,
    cost: "25",
    description: "Evento de prueba",
    entries: [{ packTemplateId: "pack-a", weight: 10 }],
    name: "Máquina de prueba",
  };

  it("accepts integer costs and weights while rejecting duplicate entries", () => {
    expect(gachaponMachineDraftSchema.safeParse(draft).success).toBe(true);
    expect(
      gachaponMachineDraftSchema.safeParse({
        ...draft,
        entries: [
          { packTemplateId: "pack-a", weight: 10 },
          { packTemplateId: "pack-a", weight: 20 },
        ],
      }).success
    ).toBe(false);
    expect(
      gachaponMachineDraftSchema.safeParse({
        ...draft,
        entries: [{ packTemplateId: "pack-a", weight: 1.5 }],
      }).success
    ).toBe(false);
  });

  it("has no machine rarity, direct-card, or client-outcome fields", () => {
    expect(
      gachaponMachineDraftSchema.safeParse({
        ...draft,
        directCardId: "card-1",
        rarityModifier: 2,
        outcome: "legendary",
      }).success
    ).toBe(false);
    const activation = gachaponActivationInputSchema.safeParse({
      expectedCost: "25",
      expectedMachineVersion: 2,
      idempotencyKey: "gachapon-test-key-1",
      machineId: "machine-1",
    });
    expect(activation.success).toBe(true);
    if (activation.success) {
      expect(activation.data).not.toHaveProperty("outcome");
      expect(activation.data).not.toHaveProperty("selectedTemplateId");
    }
  });
});
