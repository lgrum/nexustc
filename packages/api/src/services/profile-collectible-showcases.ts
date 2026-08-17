import {
  and,
  cardCharacter,
  cardInstance,
  cardSeries,
  cardTemplate,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  media,
  packInstance,
  packRevision,
  packTemplate,
  user,
} from "@repo/db";
import type { db as database } from "@repo/db";
import {
  COLLECTIBLE_RARITY_CATALOG,
  publicCardInstanceSchema,
  publicPackInstanceSchema,
} from "@repo/shared/collectibles";
import type {
  PublicCardInstance,
  PublicCollectibleSale,
  PublicPackInstance,
} from "@repo/shared/collectibles";
import type {
  EffectiveProfileShowcase,
  ProfileCollectibleShowcaseFilters,
  ProfileCustomizationDraft,
} from "@repo/shared/profile-customization";
import { PROFILE_COLLECTIBLE_SHOWCASE_CAPACITIES } from "@repo/shared/profile-customization";

import { userIsNotActivelyBanned } from "../utils/user-ban";
import { shapePublicCardTemplate } from "./card-catalog";
import {
  migrateCardShowcasePayload,
  migrateRareCardShowcasePayload,
  migrateUnopenedPackShowcasePayload,
} from "./profile-showcase-registry";

type Database = typeof database;

type CardRow = {
  availability: "active" | "frozen";
  binding: "transferable" | "account-bound";
  characterName: string;
  description: string;
  edition: string | null;
  gameName: string;
  id: string;
  issuedAt: Date;
  lifetimeSupplyCeiling: number | null;
  mintNumber: number;
  presentationMetadata: unknown;
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
  renderedVariants: unknown;
  seriesName: string;
  templateAvailability: "active" | "disabled";
  templateId: string;
};

type PackRow = {
  availability: "active" | "frozen";
  binding: "transferable" | "account-bound";
  id: string;
  issuedAt: Date;
  revision: number | null;
  revisionAvailability: "active" | "disabled" | "exhausted";
  templateAssetObjectKey: string;
  templateId: string;
  templateLifecycle: "draft" | "active" | "retired";
  templateName: string;
};

export type RareCardRankingInput = {
  id: string;
  issuedAt: Date | string;
  lifetimeSupplyCeiling: number | null;
  mintNumber: number;
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
};

export type ActiveCollectibleSale = PublicCollectibleSale;

export type CollectibleShowcaseSaleResolver = (input: {
  assetIds: readonly string[];
  assetKind: "card" | "pack";
  profileUserId: string;
}) =>
  | Promise<ReadonlyMap<string, ActiveCollectibleSale>>
  | ReadonlyMap<string, ActiveCollectibleSale>;

/**
 * The profile reader deliberately knows only about active Black Market sale
 * links. Future trade/gift custody is a separate private state and therefore
 * cannot accidentally become a public badge through this adapter.
 */
export type CollectibleShowcaseOptions = {
  resolveActiveSales?: CollectibleShowcaseSaleResolver;
  resolveActiveCustody?: (input: {
    assetIds: readonly string[];
    assetKind: "card" | "pack";
    profileUserId: string;
  }) => Promise<ReadonlySet<string>> | ReadonlySet<string>;
};

const RARITY_RANK = new Map(
  COLLECTIBLE_RARITY_CATALOG.map(({ code, order }) => [code, order])
);

export function compareRareCardRanking(
  left: RareCardRankingInput,
  right: RareCardRankingInput
) {
  const rarityDelta =
    (RARITY_RANK.get(right.rarity) ?? -1) -
    (RARITY_RANK.get(left.rarity) ?? -1);
  if (rarityDelta !== 0) {
    return rarityDelta;
  }

  const leftLimited = left.lifetimeSupplyCeiling !== null;
  const rightLimited = right.lifetimeSupplyCeiling !== null;
  if (leftLimited !== rightLimited) {
    return leftLimited ? -1 : 1;
  }

  const leftCeiling = left.lifetimeSupplyCeiling ?? Number.POSITIVE_INFINITY;
  const rightCeiling = right.lifetimeSupplyCeiling ?? Number.POSITIVE_INFINITY;
  if (leftCeiling !== rightCeiling) {
    return leftCeiling - rightCeiling;
  }
  if (left.mintNumber !== right.mintNumber) {
    return left.mintNumber - right.mintNumber;
  }

  const leftMintedAt = new Date(left.issuedAt).getTime();
  const rightMintedAt = new Date(right.issuedAt).getTime();
  if (leftMintedAt !== rightMintedAt) {
    return leftMintedAt - rightMintedAt;
  }
  return left.id.localeCompare(right.id);
}

export function rankRareCards<T extends RareCardRankingInput>(
  cards: readonly T[]
) {
  return cards.toSorted(compareRareCardRanking);
}

export const sortRareCards = rankRareCards;

export function sortUnopenedPacksByNewest<
  T extends { id: string; issuedAt: Date | string },
>(packs: readonly T[]) {
  return packs.toSorted((left, right) => {
    const dateDelta =
      new Date(right.issuedAt).getTime() - new Date(left.issuedAt).getTime();
    if (dateDelta === 0) {
      return right.id.localeCompare(left.id);
    }
    return dateDelta;
  });
}

const cardPublicColumns = {
  availability: cardInstance.availability,
  binding: cardInstance.binding,
  characterName: cardCharacter.characterName,
  description: cardTemplate.description,
  edition: cardTemplate.edition,
  gameName: cardCharacter.gameName,
  id: cardInstance.id,
  issuedAt: cardInstance.issuedAt,
  lifetimeSupplyCeiling: cardTemplate.lifetimeSupplyCeiling,
  mintNumber: cardInstance.mintNumber,
  presentationMetadata: cardTemplate.presentationMetadata,
  rarity: cardTemplate.rarity,
  renderedVariants: cardTemplate.renderedVariants,
  seriesName: cardSeries.name,
  templateAvailability: cardTemplate.availability,
  templateId: cardTemplate.id,
};

function cardFilters(filters: ProfileCollectibleShowcaseFilters) {
  return [
    filters.edition
      ? ilike(cardTemplate.edition, `%${filters.edition}%`)
      : undefined,
    filters.game
      ? ilike(
          cardCharacter.normalizedGameName,
          `%${filters.game.toLowerCase()}%`
        )
      : undefined,
    filters.seriesId ? eq(cardSeries.id, filters.seriesId) : undefined,
  ].filter((condition) => condition !== undefined);
}

function cardRowToPublic(
  row: CardRow,
  sale: ActiveCollectibleSale | undefined
): PublicCardInstance {
  const template = shapePublicCardTemplate({
    availability: row.templateAvailability,
    characterName: row.characterName,
    description: row.description,
    edition: row.edition,
    gameName: row.gameName,
    id: row.templateId,
    lifetimeSupplyCeiling: row.lifetimeSupplyCeiling,
    presentationMetadata: row.presentationMetadata,
    rarity: row.rarity,
    renderedVariants: row.renderedVariants,
    seriesName: row.seriesName,
  });
  return publicCardInstanceSchema.parse({
    availability: row.availability,
    binding: row.binding,
    characterName: template.characterName,
    edition: template.edition,
    ...(sale
      ? {
          forSale: true,
          listingIsBundle: sale.isBundle,
          listingId: sale.listingId,
          listingUrl: sale.listingUrl,
        }
      : { forSale: false }),
    gameName: template.gameName,
    id: row.id,
    limited: row.lifetimeSupplyCeiling !== null,
    lifetimeSupplyCeiling: row.lifetimeSupplyCeiling,
    mintDisplay:
      row.lifetimeSupplyCeiling === null
        ? `#${row.mintNumber}`
        : `#${row.mintNumber}/${row.lifetimeSupplyCeiling}`,
    mintNumber: row.mintNumber,
    rarity: row.rarity,
    seriesName: template.seriesName,
    template,
    templateId: row.templateId,
  });
}

function packRowToPublic(
  row: PackRow,
  sale: ActiveCollectibleSale | undefined
): PublicPackInstance {
  return publicPackInstanceSchema.parse({
    availability: row.availability,
    binding: row.binding,
    ...(row.revisionAvailability === "active" ? {} : { disabled: true }),
    ...(sale
      ? {
          forSale: true,
          listingIsBundle: sale.isBundle,
          listingId: sale.listingId,
          listingUrl: sale.listingUrl,
        }
      : { forSale: false }),
    issuedAt: row.issuedAt,
    revision: row.revision ?? 1,
    templateAssetObjectKey: row.templateAssetObjectKey,
    templateId: row.templateId,
    templateName:
      row.templateLifecycle === "retired"
        ? `${row.templateName} (retirado)`
        : row.templateName,
  });
}

async function resolveSales(
  resolver: CollectibleShowcaseSaleResolver | undefined,
  assetIds: readonly string[],
  assetKind: "card" | "pack",
  profileUserId: string
) {
  if (!resolver || assetIds.length === 0) {
    return new Map<string, ActiveCollectibleSale>();
  }
  return new Map(await resolver({ assetIds, assetKind, profileUserId }));
}

async function resolveCustody(
  resolver: CollectibleShowcaseOptions["resolveActiveCustody"],
  assetIds: readonly string[],
  assetKind: "card" | "pack",
  profileUserId: string
) {
  if (!resolver || assetIds.length === 0) {
    return new Set<string>();
  }
  return new Set(await resolver({ assetIds, assetKind, profileUserId }));
}

async function loadCards(
  db: Database,
  profileUserId: string,
  filters: ProfileCollectibleShowcaseFilters,
  input: { ids?: readonly string[]; limit: number },
  options: CollectibleShowcaseOptions
) {
  if (input.ids && input.ids.length === 0) {
    return [];
  }
  const rows = (await db
    .select(cardPublicColumns)
    .from(cardInstance)
    .innerJoin(cardTemplate, eq(cardTemplate.id, cardInstance.templateId))
    .innerJoin(cardCharacter, eq(cardCharacter.id, cardTemplate.characterId))
    .innerJoin(cardSeries, eq(cardSeries.id, cardTemplate.seriesId))
    .where(
      and(
        eq(cardInstance.ownerUserId, profileUserId),
        isNull(cardInstance.packInstanceId),
        input.ids ? inArray(cardInstance.id, [...input.ids]) : undefined,
        ...cardFilters(filters)
      )
    )
    .limit(input.limit)) as CardRow[];
  const custody = await resolveCustody(
    options.resolveActiveCustody,
    rows.map(({ id }) => id),
    "card",
    profileUserId
  );
  const visibleRows = rows.filter(({ id }) => !custody.has(id));
  const sellableRows = visibleRows.filter(
    ({ availability, templateAvailability }) =>
      availability === "active" && templateAvailability === "active"
  );
  const sales = await resolveSales(
    options.resolveActiveSales,
    sellableRows.map(({ id }) => id),
    "card",
    profileUserId
  );
  const byId = new Map(visibleRows.map((row) => [row.id, row]));
  const orderedRows = input.ids
    ? input.ids.flatMap((id) => {
        const row = byId.get(id);
        return row ? [row] : [];
      })
    : visibleRows;
  return orderedRows.map((row) => cardRowToPublic(row, sales.get(row.id)));
}

async function loadRareCards(
  db: Database,
  profileUserId: string,
  filters: ProfileCollectibleShowcaseFilters,
  limit: number,
  options: CollectibleShowcaseOptions
) {
  const rows = (await db
    .select(cardPublicColumns)
    .from(cardInstance)
    .innerJoin(cardTemplate, eq(cardTemplate.id, cardInstance.templateId))
    .innerJoin(cardCharacter, eq(cardCharacter.id, cardTemplate.characterId))
    .innerJoin(cardSeries, eq(cardSeries.id, cardTemplate.seriesId))
    .where(
      and(
        eq(cardInstance.ownerUserId, profileUserId),
        isNull(cardInstance.packInstanceId),
        ...cardFilters(filters)
      )
    )) as CardRow[];
  const ranked = rankRareCards(rows).slice(0, limit);
  const custody = await resolveCustody(
    options.resolveActiveCustody,
    ranked.map(({ id }) => id),
    "card",
    profileUserId
  );
  const visibleRows = ranked.filter(({ id }) => !custody.has(id));
  const sellableRows = visibleRows.filter(
    ({ availability, templateAvailability }) =>
      availability === "active" && templateAvailability === "active"
  );
  const sales = await resolveSales(
    options.resolveActiveSales,
    sellableRows.map(({ id }) => id),
    "card",
    profileUserId
  );
  return visibleRows.map((row) => cardRowToPublic(row, sales.get(row.id)));
}

async function loadUnopenedPacks(
  db: Database,
  profileUserId: string,
  packTemplateId: string | null,
  limit: number,
  options: CollectibleShowcaseOptions
) {
  const rows = (await db
    .select({
      availability: packInstance.availability,
      binding: packInstance.binding,
      id: packInstance.id,
      issuedAt: packInstance.issuedAt,
      revision: packRevision.revision,
      revisionAvailability: packRevision.availability,
      templateAssetObjectKey: media.objectKey,
      templateId: packTemplate.id,
      templateLifecycle: packTemplate.lifecycle,
      templateName: packTemplate.name,
    })
    .from(packInstance)
    .innerJoin(packTemplate, eq(packTemplate.id, packInstance.templateId))
    .innerJoin(media, eq(media.id, packTemplate.assetMediaId))
    .innerJoin(packRevision, eq(packRevision.id, packInstance.revisionId))
    .where(
      and(
        eq(packInstance.ownerUserId, profileUserId),
        eq(packInstance.state, "unopened"),
        packTemplateId ? eq(packInstance.templateId, packTemplateId) : undefined
      )
    )
    .orderBy(desc(packInstance.issuedAt), desc(packInstance.id))
    .limit(limit)) as PackRow[];
  const orderedRows = sortUnopenedPacksByNewest(rows).slice(0, limit);
  const custody = await resolveCustody(
    options.resolveActiveCustody,
    orderedRows.map(({ id }) => id),
    "pack",
    profileUserId
  );
  const visibleRows = orderedRows.filter(({ id }) => !custody.has(id));
  const sellableRows = visibleRows.filter(
    ({ availability, revisionAvailability }) =>
      availability === "active" && revisionAvailability === "active"
  );
  const sales = await resolveSales(
    options.resolveActiveSales,
    sellableRows.map(({ id }) => id),
    "pack",
    profileUserId
  );
  return visibleRows.map((row) => packRowToPublic(row, sales.get(row.id)));
}

function isCollectibleShowcaseType(
  type: ProfileCustomizationDraft["showcases"][number]["type"]
): type is "card" | "rare-card" | "unopened-pack" {
  return type === "card" || type === "rare-card" || type === "unopened-pack";
}

export async function resolvePublicCollectibleShowcases(
  db: Database,
  profileUserId: string,
  configuration: ProfileCustomizationDraft,
  options: CollectibleShowcaseOptions = {}
): Promise<EffectiveProfileShowcase[]> {
  const account = await db.query.user.findFirst({
    columns: { id: true },
    where: and(eq(user.id, profileUserId), userIsNotActivelyBanned()),
  });
  if (!account) {
    return [];
  }

  const results = await Promise.all(
    configuration.showcases
      .filter(({ enabled, type }) => enabled && isCollectibleShowcaseType(type))
      .map(async (showcase) => {
        if (showcase.type === "card") {
          let payload;
          try {
            payload = migrateCardShowcasePayload(
              showcase.payloadSchemaVersion,
              showcase.payload
            );
          } catch {
            return null;
          }
          const cards = await loadCards(
            db,
            profileUserId,
            payload.filters,
            {
              ids: payload.cardInstanceIds,
              limit: PROFILE_COLLECTIBLE_SHOWCASE_CAPACITIES.card,
            },
            options
          );
          return cards.length
            ? ({
                cards,
                order: showcase.order,
                rendererKey: "card",
                type: "card",
                variant: showcase.variant,
              } satisfies EffectiveProfileShowcase)
            : null;
        }
        if (showcase.type === "rare-card") {
          let payload;
          try {
            payload = migrateRareCardShowcasePayload(
              showcase.payloadSchemaVersion,
              showcase.payload
            );
          } catch {
            return null;
          }
          const cards = await loadRareCards(
            db,
            profileUserId,
            payload.filters,
            PROFILE_COLLECTIBLE_SHOWCASE_CAPACITIES["rare-card"],
            options
          );
          return cards.length
            ? ({
                cards,
                order: showcase.order,
                rendererKey: "rare-card",
                type: "rare-card",
                variant: showcase.variant,
              } satisfies EffectiveProfileShowcase)
            : null;
        }
        let payload;
        try {
          payload = migrateUnopenedPackShowcasePayload(
            showcase.payloadSchemaVersion,
            showcase.payload
          );
        } catch {
          return null;
        }
        const packs = await loadUnopenedPacks(
          db,
          profileUserId,
          payload.packTemplateId,
          PROFILE_COLLECTIBLE_SHOWCASE_CAPACITIES["unopened-pack"],
          options
        );
        return packs.length
          ? ({
              order: showcase.order,
              packs,
              rendererKey: "unopened-pack",
              type: "unopened-pack",
              variant: showcase.variant,
            } satisfies EffectiveProfileShowcase)
          : null;
      })
  );
  const visibleResults: EffectiveProfileShowcase[] = [];
  for (const result of results) {
    if (result) {
      visibleResults.push(result);
    }
  }
  return visibleResults.toSorted((left, right) => left.order - right.order);
}

export const getPublicCollectibleShowcases = resolvePublicCollectibleShowcases;
