import { packRevision, packTemplate } from "@repo/db";
import { describe, expect, it } from "vitest";

import {
  issuePackInTransaction,
  resolvePackOutcome,
  shapePublicPackIssuance,
} from "./collectible-issuance";

const baseConfiguration = {
  bindingPolicy: "either" as const,
  cardCount: 2,
  duplicatePolicy: "no-duplicates" as const,
  drawGroups: [
    {
      cardWeights: [
        { cardTemplateId: "card-common", rarity: "common" as const, weight: 1 },
        { cardTemplateId: "card-rare", rarity: "rare" as const, weight: 1 },
      ],
      drawCount: 2,
      guarantees: [{ minimumCount: 1, rarity: "rare" as const }],
      order: 1,
      rarityWeights: [
        { rarity: "common" as const, weight: 1 },
        { rarity: "rare" as const, weight: 1 },
      ],
    },
  ],
};

describe("collectible issuance outcome seam", () => {
  it("blocks issuance before selecting any hidden outcome when the revision is disabled", async () => {
    const inserted: unknown[] = [];
    const tx = {
      insert: () => ({
        values: (value: unknown) => {
          inserted.push(value);
          return Promise.resolve([]);
        },
      }),
      select: () => {
        let table: unknown;
        const builder = {
          for: () => {
            if (table === packTemplate) {
              return Promise.resolve([
                {
                  id: "pack-template-1",
                  latestPublishedRevisionId: "revision-disabled",
                  lifecycle: "active",
                },
              ]);
            }
            if (table === packRevision) {
              return Promise.resolve([
                {
                  availability: "disabled",
                  id: "revision-disabled",
                  lifecycle: "published",
                  templateId: "pack-template-1",
                },
              ]);
            }
            return Promise.resolve([]);
          },
          from(nextTable: unknown) {
            table = nextTable;
            return builder;
          },
          where() {
            return builder;
          },
        };
        return builder;
      },
    };
    await expect(
      issuePackInTransaction(tx as never, {
        binding: "transferable",
        issueSource: "gachapon",
        ownerUserId: "user-1",
        packTemplateId: "pack-template-1",
      })
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(inserted).toHaveLength(0);
  });

  it("commits a guaranteed, ordered, no-duplicate result from server choices", () => {
    const outcome = resolvePackOutcome(
      baseConfiguration,
      [
        {
          cardTemplateId: "card-common",
          mintedSupply: 0,
          rarity: "common",
          weight: 1,
        },
        {
          cardTemplateId: "card-rare",
          mintedSupply: 0,
          rarity: "rare",
          weight: 1,
        },
      ],
      () => 0.999
    );

    expect(outcome).toHaveLength(2);
    expect(outcome[0]).toEqual({
      cardTemplateId: "card-rare",
      rarity: "rare",
    });
    expect(
      new Set(outcome.map(({ cardTemplateId }) => cardTemplateId)).size
    ).toBe(2);
  });

  it("fails before persistence when an advertised guarantee has no candidate", () => {
    expect(() =>
      resolvePackOutcome(
        baseConfiguration,
        [
          {
            cardTemplateId: "card-common",
            mintedSupply: 0,
            rarity: "common",
            weight: 1,
          },
        ],
        () => 0
      )
    ).toThrow("garantía");
  });

  it("keeps hidden result identifiers out of the public pack issuance contract", () => {
    const publicResult = shapePublicPackIssuance({
      binding: "transferable",
      cardInstanceIds: ["hidden-card-1"],
      issueReference: "grant-1",
      issueSource: "grant",
      mintNumbers: [42],
      packInstanceId: "pack-1",
      revisionId: "revision-1",
      templateId: "template-1",
    });
    expect(publicResult).toEqual({
      binding: "transferable",
      issueReference: "grant-1",
      issueSource: "grant",
      packInstanceId: "pack-1",
      revisionId: "revision-1",
      templateId: "template-1",
    });
    expect(publicResult).not.toHaveProperty("cardInstanceIds");
  });
});
