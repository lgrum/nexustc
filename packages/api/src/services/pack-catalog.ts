import { and, asc, eq, inArray, or } from "@repo/db";
import type { db as database } from "@repo/db";
import {
  cardCharacter,
  cardSeries,
  cardTemplate,
  media,
  packDrawGroup,
  packDrawGroupCardWeight,
  packDrawGroupRarityWeight,
  packRevision,
  packTemplate,
} from "@repo/db/schema/app";
import { packPublicTemplateSchema } from "@repo/shared/collectibles";
import type {
  PackPublicCard,
  PackPublicRevision,
  PackPublicTemplate,
} from "@repo/shared/collectibles";

type Database = typeof database;
type PackCatalogDb = Pick<Database, "select">;

const packCardColumns = {
  characterName: cardCharacter.characterName,
  gameName: cardCharacter.gameName,
  id: cardTemplate.id,
  lifecycle: cardTemplate.lifecycle,
  rarity: cardTemplate.rarity,
  seriesName: cardSeries.name,
  availability: cardTemplate.availability,
};

function publicCard(row: {
  availability: "active" | "disabled";
  characterName: string;
  gameName: string;
  id: string;
  lifecycle: "draft" | "active" | "retired";
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
  seriesName: string;
}): PackPublicCard {
  return {
    characterName:
      row.availability === "disabled" || row.lifecycle !== "active"
        ? "Contenido no disponible"
        : row.characterName,
    disabled: row.availability === "disabled" || row.lifecycle !== "active",
    gameName:
      row.availability === "disabled" || row.lifecycle !== "active"
        ? "NeXusTC"
        : row.gameName,
    id: row.id,
    rarity: row.rarity,
    seriesName: row.seriesName,
  };
}

async function getPublicPackDetail(
  db: PackCatalogDb,
  templateId: string
): Promise<PackPublicTemplate | null> {
  const [row] = await db
    .select({
      assetObjectKey: media.objectKey,
      description: packTemplate.description,
      id: packTemplate.id,
      lifecycle: packTemplate.lifecycle,
      name: packTemplate.name,
      revisionAvailability: packRevision.availability,
      revisionCardCount: packRevision.cardCount,
      revisionDuplicatePolicy: packRevision.duplicatePolicy,
      revisionBindingPolicy: packRevision.bindingPolicy,
      revisionId: packRevision.id,
      revisionNumber: packRevision.revision,
      revisionPublishedAt: packRevision.publishedAt,
    })
    .from(packTemplate)
    .innerJoin(media, eq(media.id, packTemplate.assetMediaId))
    .innerJoin(
      packRevision,
      eq(packRevision.id, packTemplate.latestPublishedRevisionId)
    )
    .where(
      and(
        eq(packTemplate.id, templateId),
        inArray(packTemplate.lifecycle, ["active", "retired"]),
        eq(packRevision.lifecycle, "published")
      )
    )
    .limit(1);
  if (!row || row.revisionNumber === null) {
    return null;
  }

  const groups = await db
    .select({ id: packDrawGroup.id, guarantees: packDrawGroup.guarantees })
    .from(packDrawGroup)
    .where(eq(packDrawGroup.revisionId, row.revisionId))
    .orderBy(asc(packDrawGroup.order));
  const groupIds = groups.map(({ id }) => id);
  const rarityWeightRows = groupIds.length
    ? await db
        .select({
          drawGroupId: packDrawGroupRarityWeight.drawGroupId,
          rarity: packDrawGroupRarityWeight.rarity,
        })
        .from(packDrawGroupRarityWeight)
        .where(inArray(packDrawGroupRarityWeight.drawGroupId, groupIds))
    : [];
  const cardWeightRows = groupIds.length
    ? await db
        .select({
          cardTemplateId: packDrawGroupCardWeight.cardTemplateId,
          drawGroupId: packDrawGroupCardWeight.drawGroupId,
          rarity: packDrawGroupCardWeight.rarity,
        })
        .from(packDrawGroupCardWeight)
        .where(inArray(packDrawGroupCardWeight.drawGroupId, groupIds))
    : [];
  const cardIds = [
    ...new Set(cardWeightRows.map(({ cardTemplateId }) => cardTemplateId)),
  ];
  const fallbackRarities = [
    ...new Set(
      rarityWeightRows
        .filter(
          ({ drawGroupId, rarity }) =>
            !cardWeightRows.some(
              (entry) =>
                entry.drawGroupId === drawGroupId && entry.rarity === rarity
            )
        )
        .map(({ rarity }) => rarity)
    ),
  ];
  const poolPredicates = [
    ...(cardIds.length ? [inArray(cardTemplate.id, cardIds)] : []),
    ...(fallbackRarities.length
      ? [inArray(cardTemplate.rarity, fallbackRarities)]
      : []),
  ];
  const poolRows = await db
    .select(packCardColumns)
    .from(cardTemplate)
    .innerJoin(cardCharacter, eq(cardCharacter.id, cardTemplate.characterId))
    .innerJoin(cardSeries, eq(cardSeries.id, cardTemplate.seriesId))
    .where(
      and(
        poolPredicates.length > 1 ? or(...poolPredicates) : poolPredicates[0],
        inArray(cardTemplate.lifecycle, ["active", "retired"])
      )
    );
  const pool = poolRows.map(publicCard);
  const knownPoolIds = new Set(pool.map(({ id }) => id));
  for (const cardWeight of cardWeightRows) {
    if (!knownPoolIds.has(cardWeight.cardTemplateId)) {
      pool.push({
        characterName: "Contenido no disponible",
        disabled: true,
        gameName: "NeXusTC",
        id: cardWeight.cardTemplateId,
        rarity: cardWeight.rarity,
        seriesName: "No disponible",
      });
    }
  }
  const unavailableCards = pool.filter(({ disabled }) => disabled);
  const possiblePool = pool.filter(({ disabled }) => !disabled);
  const guarantees = groups.flatMap((group) => group.guarantees);
  const revision: PackPublicRevision = {
    bindingPolicy: row.revisionBindingPolicy,
    cardCount: row.revisionCardCount,
    duplicatePolicy: row.revisionDuplicatePolicy,
    guarantees,
    possiblePool,
    publishedAt: row.revisionPublishedAt?.toISOString() ?? null,
    revision: row.revisionNumber,
    unavailableCards,
  };
  return packPublicTemplateSchema.parse({
    assetObjectKey: row.assetObjectKey,
    description: row.description,
    id: row.id,
    lifecycle: row.lifecycle,
    name: row.name,
    revision,
  });
}

export async function listPublishedPackTemplates(db: PackCatalogDb) {
  const rows = await db
    .select({ id: packTemplate.id })
    .from(packTemplate)
    .where(inArray(packTemplate.lifecycle, ["active", "retired"]));
  const result: PackPublicTemplate[] = [];
  for (const row of rows) {
    const pack = await getPublicPackDetail(db, row.id);
    if (pack) {
      result.push(pack);
    }
  }
  return result.toSorted((left, right) => left.name.localeCompare(right.name));
}

export function getPublishedPackTemplate(
  db: PackCatalogDb,
  templateId: string
) {
  return getPublicPackDetail(db, templateId);
}

export const listPublicPacks = listPublishedPackTemplates;
export const getPublicPack = getPublishedPackTemplate;
