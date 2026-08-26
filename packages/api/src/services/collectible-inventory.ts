import {
  and,
  asc,
  blackMarketListing,
  cardCharacter,
  cardInstance,
  cardSeries,
  cardTemplate,
  collectibleOwnershipEvent,
  collectibleCustody,
  desc,
  eq,
  ilike,
  isNull,
  media,
  or,
  packInstance,
  packOpening,
  packRevision,
  packTemplate,
  sql,
  user,
} from "@repo/db";
import type { db as database } from "@repo/db";
import {
  collectibleBindingSchema,
  COLLECTIBLE_COLLECTION_SORTS,
  formatCardMintNumber,
  packOpeningCardsSchema,
  publicCardInstanceSchema,
  publicPackInstanceSchema,
} from "@repo/shared/collectibles";
import type { PublicCollectibleSale } from "@repo/shared/collectibles";
import z from "zod";

import { userIsNotActivelyBanned } from "../utils/user-ban";
import { resolveActiveBlackMarketSales } from "./black-market";
import { shapePublicCardTemplate } from "./card-catalog";
import { getResolvedProfileVisibility } from "./profile";

type Database = typeof database;
type ReadDatabase = Pick<Database, "select">;

/**
 * Correlated rank (1 = in an active market sale) used for the `for-sale`
 * filter, sort, and cursor so filtering, ordering, and pagination all agree
 * on one SQL predicate. `statement_timestamp()` keeps every evaluation inside
 * a single statement consistent.
 */
function activeSaleRank(assetKind: "card" | "pack") {
  const assetId = assetKind === "card" ? cardInstance.id : packInstance.id;
  const custodyAssetId =
    assetKind === "card"
      ? collectibleCustody.cardInstanceId
      : collectibleCustody.packInstanceId;
  return sql<number>`CASE WHEN EXISTS (
    SELECT 1
    FROM ${collectibleCustody}
    INNER JOIN ${blackMarketListing}
      ON ${blackMarketListing.id} = ${collectibleCustody.blackMarketListingId}
    WHERE ${custodyAssetId} = ${assetId}
      AND ${collectibleCustody.releasedAt} IS NULL
      AND ${blackMarketListing.state} = 'active'
      AND ${blackMarketListing.expiresAt} > statement_timestamp()
  ) THEN 1 ELSE 0 END`;
}

const cardSaleRank = activeSaleRank("card");
const packSaleRank = activeSaleRank("pack");

function activeInventorySaleCondition(
  assetKind: "card" | "pack",
  forSale: boolean | undefined,
  now: Date
) {
  if (forSale === undefined) {
    return;
  }
  const assetId = assetKind === "card" ? cardInstance.id : packInstance.id;
  const custodyAssetId =
    assetKind === "card"
      ? collectibleCustody.cardInstanceId
      : collectibleCustody.packInstanceId;
  const activeSale = sql`EXISTS (
    SELECT 1
    FROM ${collectibleCustody}
    INNER JOIN ${blackMarketListing}
      ON ${blackMarketListing.id} = ${collectibleCustody.blackMarketListingId}
    WHERE ${custodyAssetId} = ${assetId}
      AND ${collectibleCustody.releasedAt} IS NULL
      AND ${blackMarketListing.state} = 'active'
      AND ${blackMarketListing.expiresAt} > ${now}
  )`;
  return forSale ? activeSale : sql`NOT (${activeSale})`;
}

async function resolveInventorySales(
  db: ReadDatabase,
  input: {
    assetIds: readonly string[];
    assetKind: "card" | "pack";
    profileUserId: string;
  }
) {
  if (input.assetIds.length === 0) {
    return new Map<string, PublicCollectibleSale>();
  }
  try {
    return await resolveActiveBlackMarketSales(db, input);
  } catch {
    // Inventory remains readable if a deployment is still migrating market
    // tables; the next read will project sale links automatically.
    return new Map<string, PublicCollectibleSale>();
  }
}

const cursorSchema = z.string().trim().max(500).optional();

export const inventorySortSchema = z.enum([
  ...COLLECTIBLE_COLLECTION_SORTS,
  "acquired",
  "forSale",
] as const);

export const privateCardInventoryQuerySchema = z
  .object({
    characterId: z.string().trim().min(1).max(200).optional(),
    character: z.string().trim().max(200).optional(),
    cursor: cursorSchema,
    acquiredAfter: z.coerce.date().optional(),
    acquiredBefore: z.coerce.date().optional(),
    edition: z.string().trim().max(200).optional(),
    forSale: z.boolean().optional(),
    gameName: z.string().trim().max(200).optional(),
    limited: z.boolean().optional(),
    limit: z.number().int().min(1).max(50).default(20),
    rarity: z
      .enum(["common", "uncommon", "rare", "epic", "legendary"])
      .optional(),
    search: z.string().trim().max(200).optional(),
    seriesId: z.string().trim().min(1).max(200).optional(),
    series: z.string().trim().max(200).optional(),
    sort: inventorySortSchema.default("newest"),
    transferability: collectibleBindingSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.acquiredAfter &&
      value.acquiredBefore &&
      value.acquiredAfter > value.acquiredBefore
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El inicio de adquisición debe ser anterior al final.",
        path: ["acquiredBefore"],
      });
    }
  });

export type PrivateCardInventoryQuery = z.input<
  typeof privateCardInventoryQuerySchema
>;

export const privatePackInventoryQuerySchema = z
  .object({
    acquiredAfter: z.coerce.date().optional(),
    acquiredBefore: z.coerce.date().optional(),
    cursor: cursorSchema,
    forSale: z.boolean().optional(),
    limit: z.number().int().min(1).max(50).default(20),
    search: z.string().trim().max(200).optional(),
    sort: z
      .enum([
        "newest",
        "acquired",
        "template",
        "transferability",
        "for-sale",
        "forSale",
      ])
      .default("newest"),
    transferability: collectibleBindingSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.acquiredAfter &&
      value.acquiredBefore &&
      value.acquiredAfter > value.acquiredBefore
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El inicio de adquisición debe ser anterior al final.",
        path: ["acquiredBefore"],
      });
    }
  });

export type PrivatePackInventoryQuery = z.input<
  typeof privatePackInventoryQuerySchema
>;

export const privateProvenanceQuerySchema = z
  .object({
    assetId: z.string().trim().min(1).max(200),
    assetKind: z.enum(["card", "pack"]),
    cursor: cursorSchema,
    limit: z.number().int().min(1).max(50).default(50),
  })
  .strict();

type Cursor = {
  id: string;
  sort: string;
  value: string;
};

function normalizeSort(sort: string) {
  return sort === "acquired"
    ? "newest"
    : sort === "forSale"
      ? "for-sale"
      : sort;
}

const cardRarityRank = sql<number>`CASE ${cardTemplate.rarity}
  WHEN 'common' THEN 0
  WHEN 'uncommon' THEN 1
  WHEN 'rare' THEN 2
  WHEN 'epic' THEN 3
  WHEN 'legendary' THEN 4
  ELSE 99
END`;
const cardLimitedRank = sql<number>`CASE WHEN ${cardTemplate.lifetimeSupplyCeiling} IS NULL THEN 0 ELSE 1 END`;
const cardEditionSort = sql<string>`COALESCE(${cardTemplate.edition}, '')`;

export function encodeInventoryCursor(cursor: Cursor) {
  return encodeURIComponent(JSON.stringify(cursor));
}

export function decodeInventoryCursor(
  value: string | undefined
): Cursor | null {
  if (!value) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(value));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as Cursor).id !== "string" ||
      typeof (parsed as Cursor).sort !== "string" ||
      typeof (parsed as Cursor).value !== "string"
    ) {
      return null;
    }
    return parsed as Cursor;
  } catch {
    return null;
  }
}

export function cardCursorCondition(cursor: Cursor | null, sort: string) {
  sort = normalizeSort(sort);
  if (!cursor || cursor.sort !== sort) {
    return;
  }
  if (sort === "newest") {
    const date = new Date(cursor.value);
    return or(
      sql`${cardInstance.issuedAt} < ${date}`,
      and(
        eq(cardInstance.issuedAt, date),
        sql`${cardInstance.id} < ${cursor.id}`
      )
    );
  }
  if (sort === "mint") {
    const mint = Number(cursor.value);
    return or(
      sql`${cardInstance.mintNumber} > ${mint}`,
      and(
        eq(cardInstance.mintNumber, mint),
        sql`${cardInstance.id} > ${cursor.id}`
      )
    );
  }
  if (sort === "rarity") {
    return or(
      sql`${cardRarityRank} > ${Number(cursor.value)}`,
      and(
        sql`${cardRarityRank} = ${Number(cursor.value)}`,
        sql`${cardInstance.id} > ${cursor.id}`
      )
    );
  }
  if (sort === "limited") {
    return or(
      sql`${cardLimitedRank} > ${Number(cursor.value)}`,
      and(
        sql`${cardLimitedRank} = ${Number(cursor.value)}`,
        sql`${cardInstance.id} > ${cursor.id}`
      )
    );
  }
  if (sort === "for-sale") {
    const rank = Number(cursor.value) === 1 ? 1 : 0;
    return or(
      sql`${cardSaleRank} < ${rank}`,
      and(
        sql`${cardSaleRank} = ${rank}`,
        sql`${cardInstance.id} > ${cursor.id}`
      )
    );
  }
  const sortColumn =
    sort === "game"
      ? cardCharacter.normalizedGameName
      : sort === "character"
        ? cardCharacter.characterName
        : sort === "series"
          ? cardSeries.name
          : sort === "edition"
            ? cardEditionSort
            : sort === "transferability"
              ? cardInstance.binding
              : sql<number>`0`;
  return or(
    sql`${sortColumn} > ${cursor.value}`,
    and(
      sql`${sortColumn} = ${cursor.value}`,
      sql`${cardInstance.id} > ${cursor.id}`
    )
  );
}

export function cardCursorValue(
  row: {
    issuedAt: Date;
    isForSale?: number | null;
    mintNumber: number;
    rarity: string;
    normalizedGameName: string;
    characterName: string;
    seriesName: string;
    edition: string | null;
    binding: string;
    lifetimeSupplyCeiling: number | null;
    id: string;
  },
  sort: string
) {
  sort = normalizeSort(sort);
  if (sort === "newest") {
    return row.issuedAt.toISOString();
  }
  if (sort === "mint") {
    return String(row.mintNumber);
  }
  if (sort === "rarity") {
    return String(
      ["common", "uncommon", "rare", "epic", "legendary"].indexOf(row.rarity)
    );
  }
  if (sort === "limited") {
    return row.lifetimeSupplyCeiling === null ? "0" : "1";
  }
  if (sort === "for-sale") {
    return Number(row.isForSale) === 1 ? "1" : "0";
  }
  if (sort === "game") {
    return row.normalizedGameName;
  }
  if (sort === "character") {
    return row.characterName;
  }
  if (sort === "series") {
    return row.seriesName;
  }
  if (sort === "edition") {
    return row.edition ?? "";
  }
  if (sort === "transferability") {
    return row.binding;
  }
  return "0";
}

export function packCursorCondition(cursor: Cursor | null, sort: string) {
  sort = normalizeSort(sort);
  if (!cursor || cursor.sort !== sort) {
    return;
  }
  if (sort === "newest") {
    const issuedAt = new Date(cursor.value);
    return or(
      sql`${packInstance.issuedAt} < ${issuedAt}`,
      and(
        eq(packInstance.issuedAt, issuedAt),
        sql`${packInstance.id} < ${cursor.id}`
      )
    );
  }
  if (sort === "for-sale") {
    const rank = Number(cursor.value) === 1 ? 1 : 0;
    return or(
      sql`${packSaleRank} < ${rank}`,
      and(
        sql`${packSaleRank} = ${rank}`,
        sql`${packInstance.id} > ${cursor.id}`
      )
    );
  }
  if (sort === "template") {
    return or(
      sql`${packTemplate.name} > ${cursor.value}`,
      and(
        eq(packTemplate.name, cursor.value),
        sql`${packInstance.id} > ${cursor.id}`
      )
    );
  }
  if (sort === "transferability") {
    return or(
      sql`${packInstance.binding} > ${cursor.value}`,
      and(
        sql`${packInstance.binding} = ${cursor.value}`,
        sql`${packInstance.id} > ${cursor.id}`
      )
    );
  }
  return sql`${packInstance.id} > ${cursor.id}`;
}

export function packCursorValue(
  row: {
    id: string;
    isForSale?: number | null;
    issuedAt: Date;
    templateName: string;
    binding: string;
  },
  sort: string
) {
  sort = normalizeSort(sort);
  if (sort === "newest") {
    return row.issuedAt.toISOString();
  }
  if (sort === "for-sale") {
    return Number(row.isForSale) === 1 ? "1" : "0";
  }
  if (sort === "template") {
    return row.templateName;
  }
  if (sort === "transferability") {
    return row.binding;
  }
  return "0";
}

export function packOpeningHistoryCursorCondition(
  cursor: Cursor | null,
  sort: string
) {
  sort = normalizeSort(sort);
  if (!cursor || cursor.sort !== sort) {
    return;
  }
  if (sort === "newest") {
    const openedAt = new Date(cursor.value);
    return or(
      sql`${packInstance.openedAt} < ${openedAt}`,
      and(
        eq(packInstance.openedAt, openedAt),
        sql`${packInstance.id} < ${cursor.id}`
      )
    );
  }
  if (sort === "template") {
    return or(
      sql`${packTemplate.name} > ${cursor.value}`,
      and(
        eq(packTemplate.name, cursor.value),
        sql`${packInstance.id} > ${cursor.id}`
      )
    );
  }
  if (sort === "transferability") {
    return or(
      sql`${packInstance.binding} > ${cursor.value}`,
      and(
        sql`${packInstance.binding} = ${cursor.value}`,
        sql`${packInstance.id} > ${cursor.id}`
      )
    );
  }
  return sql`${packInstance.id} > ${cursor.id}`;
}

export function packOpeningHistoryCursorValue(
  row: {
    binding: string;
    id: string;
    openedAt: Date;
    templateName: string;
  },
  sort: string
) {
  sort = normalizeSort(sort);
  if (sort === "newest") {
    return row.openedAt.toISOString();
  }
  if (sort === "template") {
    return row.templateName;
  }
  if (sort === "transferability") {
    return row.binding;
  }
  return "0";
}

/** Private current Card Instance inventory; hidden pack contents cannot match. */
export async function listPrivateCardInventory(
  db: ReadDatabase,
  userId: string,
  input: PrivateCardInventoryQuery = {}
) {
  const parsed = privateCardInventoryQuerySchema.parse(input);
  const sort = normalizeSort(parsed.sort);
  const cursor = decodeInventoryCursor(parsed.cursor);
  const filters = [
    eq(cardInstance.ownerUserId, userId),
    isNull(cardInstance.packInstanceId),
    parsed.acquiredAfter
      ? sql`${cardInstance.issuedAt} >= ${parsed.acquiredAfter}`
      : undefined,
    parsed.acquiredBefore
      ? sql`${cardInstance.issuedAt} < ${parsed.acquiredBefore}`
      : undefined,
    parsed.characterId ? eq(cardCharacter.id, parsed.characterId) : undefined,
    parsed.character
      ? ilike(cardCharacter.characterName, `%${parsed.character}%`)
      : undefined,
    parsed.gameName
      ? ilike(
          cardCharacter.normalizedGameName,
          `%${parsed.gameName.toLowerCase()}%`
        )
      : undefined,
    parsed.seriesId ? eq(cardSeries.id, parsed.seriesId) : undefined,
    parsed.series ? ilike(cardSeries.name, `%${parsed.series}%`) : undefined,
    parsed.edition
      ? ilike(cardTemplate.edition, `%${parsed.edition}%`)
      : undefined,
    parsed.rarity ? eq(cardTemplate.rarity, parsed.rarity) : undefined,
    parsed.limited === undefined
      ? undefined
      : parsed.limited
        ? sql`${cardTemplate.lifetimeSupplyCeiling} IS NOT NULL`
        : isNull(cardTemplate.lifetimeSupplyCeiling),
    parsed.search
      ? or(
          ilike(cardCharacter.characterName, `%${parsed.search}%`),
          ilike(cardCharacter.gameName, `%${parsed.search}%`),
          ilike(cardSeries.name, `%${parsed.search}%`),
          ilike(cardTemplate.edition, `%${parsed.search}%`)
        )
      : undefined,
    parsed.transferability
      ? eq(cardInstance.binding, parsed.transferability)
      : undefined,
    activeInventorySaleCondition("card", parsed.forSale, new Date()),
    cardCursorCondition(cursor, sort),
  ];
  const conditions = filters.filter((condition) => condition !== undefined);

  const order =
    sort === "newest"
      ? [desc(cardInstance.issuedAt), desc(cardInstance.id)]
      : sort === "mint"
        ? [asc(cardInstance.mintNumber), asc(cardInstance.id)]
        : sort === "rarity"
          ? [asc(cardRarityRank), asc(cardInstance.id)]
          : sort === "limited"
            ? [asc(cardLimitedRank), asc(cardInstance.id)]
            : sort === "game"
              ? [asc(cardCharacter.normalizedGameName), asc(cardInstance.id)]
              : sort === "character"
                ? [asc(cardCharacter.characterName), asc(cardInstance.id)]
                : sort === "series"
                  ? [asc(cardSeries.name), asc(cardInstance.id)]
                  : sort === "edition"
                    ? [asc(cardEditionSort), asc(cardInstance.id)]
                    : sort === "transferability"
                      ? [asc(cardInstance.binding), asc(cardInstance.id)]
                      : sort === "for-sale"
                        ? [desc(cardSaleRank), asc(cardInstance.id)]
                        : [asc(cardInstance.id)];

  const rows = await db
    .select({
      availability: cardInstance.availability,
      binding: cardInstance.binding,
      characterId: cardCharacter.id,
      characterName: cardCharacter.characterName,
      edition: cardTemplate.edition,
      gameName: cardCharacter.gameName,
      id: cardInstance.id,
      isForSale: cardSaleRank,
      issuedAt: cardInstance.issuedAt,
      lifetimeSupplyCeiling: cardTemplate.lifetimeSupplyCeiling,
      mintNumber: cardInstance.mintNumber,
      normalizedGameName: cardCharacter.normalizedGameName,
      rarity: cardTemplate.rarity,
      seriesId: cardSeries.id,
      seriesName: cardSeries.name,
      templateId: cardTemplate.id,
    })
    .from(cardInstance)
    .innerJoin(cardTemplate, eq(cardTemplate.id, cardInstance.templateId))
    .innerJoin(cardCharacter, eq(cardCharacter.id, cardTemplate.characterId))
    .innerJoin(cardSeries, eq(cardSeries.id, cardTemplate.seriesId))
    .where(and(...conditions))
    .orderBy(...order)
    .limit(parsed.limit + 1);

  // Filtering and pagination are fully SQL-side, so a sale-resolver failure
  // can only degrade the listing-link enrichment, never collapse or skew a
  // page.
  const sales = await resolveInventorySales(db, {
    assetIds: rows.slice(0, parsed.limit).map(({ id }) => id),
    assetKind: "card",
    profileUserId: userId,
  });
  const hasMore = rows.length > parsed.limit;
  const items = (hasMore ? rows.slice(0, parsed.limit) : rows).map((row) => {
    const sale = sales.get(row.id);
    return {
      availability: row.availability,
      binding: row.binding,
      characterId: row.characterId,
      characterName: row.characterName,
      edition: row.edition,
      ...(sale
        ? {
            forSale: true,
            listingId: sale.listingId,
            listingIsBundle: sale.isBundle,
            listingUrl: sale.listingUrl,
          }
        : { forSale: false }),
      gameName: row.gameName,
      id: row.id,
      issuedAt: row.issuedAt,
      lifetimeSupplyCeiling: row.lifetimeSupplyCeiling,
      limited: row.lifetimeSupplyCeiling !== null,
      mintNumber: row.mintNumber,
      mintDisplay: formatCardMintNumber(
        row.mintNumber,
        row.lifetimeSupplyCeiling
      ),
      rarity: row.rarity,
      seriesId: row.seriesId,
      seriesName: row.seriesName,
      templateId: row.templateId,
    };
  });
  const last = rows[parsed.limit - 1];
  return {
    items,
    nextCursor:
      hasMore && last
        ? encodeInventoryCursor({
            id: last.id,
            sort,
            value: cardCursorValue(last, sort),
          })
        : null,
  };
}

/** Private Unopened Pack inventory. No result/card IDs are selected here. */
export async function listPrivatePackInventory(
  db: ReadDatabase,
  userId: string,
  input: PrivatePackInventoryQuery = {}
) {
  const parsed = privatePackInventoryQuerySchema.parse(input);
  const sort = normalizeSort(parsed.sort);
  const cursor = decodeInventoryCursor(parsed.cursor);
  const filters = [
    eq(packInstance.ownerUserId, userId),
    eq(packInstance.state, "unopened"),
    parsed.acquiredAfter
      ? sql`${packInstance.issuedAt} >= ${parsed.acquiredAfter}`
      : undefined,
    parsed.acquiredBefore
      ? sql`${packInstance.issuedAt} < ${parsed.acquiredBefore}`
      : undefined,
    parsed.transferability
      ? eq(packInstance.binding, parsed.transferability)
      : undefined,
    parsed.search ? ilike(packTemplate.name, `%${parsed.search}%`) : undefined,
    activeInventorySaleCondition("pack", parsed.forSale, new Date()),
    packCursorCondition(cursor, sort),
  ];
  const conditions = filters.filter((condition) => condition !== undefined);
  const order =
    sort === "newest"
      ? [desc(packInstance.issuedAt), desc(packInstance.id)]
      : sort === "for-sale"
        ? [desc(packSaleRank), asc(packInstance.id)]
        : sort === "template"
          ? [asc(packTemplate.name), asc(packInstance.id)]
          : sort === "transferability"
            ? [asc(packInstance.binding), asc(packInstance.id)]
            : [asc(packInstance.id)];
  const rows = await db
    .select({
      availability: packInstance.availability,
      binding: packInstance.binding,
      id: packInstance.id,
      isForSale: packSaleRank,
      issuedAt: packInstance.issuedAt,
      issueSource: packInstance.issueSource,
      revision: packRevision.revision,
      revisionId: packInstance.revisionId,
      state: packInstance.state,
      templateId: packTemplate.id,
      templateName: packTemplate.name,
      templateAssetObjectKey: media.objectKey,
    })
    .from(packInstance)
    .innerJoin(packTemplate, eq(packTemplate.id, packInstance.templateId))
    .innerJoin(media, eq(media.id, packTemplate.assetMediaId))
    .innerJoin(packRevision, eq(packRevision.id, packInstance.revisionId))
    .where(and(...conditions))
    .orderBy(...order)
    .limit(parsed.limit + 1);
  // Filtering and pagination are fully SQL-side, so a sale-resolver failure
  // can only degrade the listing-link enrichment, never collapse or skew a
  // page.
  const sales = await resolveInventorySales(db, {
    assetIds: rows.slice(0, parsed.limit).map(({ id }) => id),
    assetKind: "pack",
    profileUserId: userId,
  });
  const hasMore = rows.length > parsed.limit;
  const items = (hasMore ? rows.slice(0, parsed.limit) : rows).map((row) => {
    const { isForSale: _isForSale, ...rest } = row;
    const sale = sales.get(row.id);
    return {
      ...rest,
      ...(sale
        ? {
            forSale: true,
            listingId: sale.listingId,
            listingIsBundle: sale.isBundle,
            listingUrl: sale.listingUrl,
          }
        : { forSale: false }),
    };
  });
  const last = rows[parsed.limit - 1];
  return {
    items,
    nextCursor:
      hasMore && last
        ? encodeInventoryCursor({
            id: last.id,
            sort,
            value: packCursorValue(last, sort),
          })
        : null,
  };
}

/**
 * Provenance is scoped to an asset currently owned by the caller. It never
 * provides a global instance-owner lookup and strips participant identities.
 */
export async function listPrivateCollectibleProvenance(
  db: Database,
  userId: string,
  input: z.input<typeof privateProvenanceQuerySchema>
) {
  const parsed = privateProvenanceQuerySchema.parse(input);
  const owned =
    parsed.assetKind === "card"
      ? await db.query.cardInstance.findFirst({
          columns: { id: true },
          where: and(
            eq(cardInstance.id, parsed.assetId),
            eq(cardInstance.ownerUserId, userId),
            isNull(cardInstance.packInstanceId)
          ),
        })
      : await db.query.packInstance.findFirst({
          columns: { id: true },
          where: and(
            eq(packInstance.id, parsed.assetId),
            eq(packInstance.ownerUserId, userId)
          ),
        });
  if (!owned) {
    return { items: [], nextCursor: null };
  }
  const cursor = decodeInventoryCursor(parsed.cursor);
  const rows = await db
    .select({
      createdAt: collectibleOwnershipEvent.createdAt,
      id: collectibleOwnershipEvent.id,
      kind: collectibleOwnershipEvent.kind,
      metadata: collectibleOwnershipEvent.metadata,
      occurredAt: collectibleOwnershipEvent.occurredAt,
      sourceType: collectibleOwnershipEvent.sourceType,
    })
    .from(collectibleOwnershipEvent)
    .where(
      and(
        parsed.assetKind === "card"
          ? eq(collectibleOwnershipEvent.cardInstanceId, parsed.assetId)
          : eq(collectibleOwnershipEvent.packInstanceId, parsed.assetId),
        cursor
          ? or(
              sql`${collectibleOwnershipEvent.occurredAt} < ${new Date(cursor.value)}`,
              and(
                eq(
                  collectibleOwnershipEvent.occurredAt,
                  new Date(cursor.value)
                ),
                sql`${collectibleOwnershipEvent.id} < ${cursor.id}`
              )
            )
          : undefined
      )
    )
    .orderBy(
      desc(collectibleOwnershipEvent.occurredAt),
      desc(collectibleOwnershipEvent.id)
    )
    .limit(parsed.limit + 1);
  const hasMore = rows.length > parsed.limit;
  const items = (hasMore ? rows.slice(0, parsed.limit) : rows).map((row) => ({
    createdAt: row.createdAt,
    id: row.id,
    kind: row.kind,
    metadata: row.metadata,
    occurredAt: row.occurredAt,
    sourceType: row.sourceType,
  }));
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      hasMore && last
        ? encodeInventoryCursor({
            id: last.id,
            sort: "provenance",
            value: last.occurredAt.toISOString(),
          })
        : null,
  };
}

/** Opened packs stay in private history, not active inventory. */
export async function listPrivatePackOpeningHistory(
  db: ReadDatabase,
  userId: string,
  input: PrivatePackInventoryQuery = {}
) {
  const parsed = privatePackInventoryQuerySchema.parse(input);
  const sort = normalizeSort(parsed.sort);
  const cursor = decodeInventoryCursor(parsed.cursor);
  const filters = [
    eq(packInstance.ownerUserId, userId),
    eq(packInstance.state, "opened"),
    parsed.acquiredAfter
      ? sql`${packInstance.issuedAt} >= ${parsed.acquiredAfter}`
      : undefined,
    parsed.acquiredBefore
      ? sql`${packInstance.issuedAt} < ${parsed.acquiredBefore}`
      : undefined,
    parsed.transferability
      ? eq(packInstance.binding, parsed.transferability)
      : undefined,
    parsed.search ? ilike(packTemplate.name, `%${parsed.search}%`) : undefined,
    parsed.forSale === true ? sql`FALSE` : undefined,
    packOpeningHistoryCursorCondition(cursor, sort),
  ];
  const conditions = filters.filter((condition) => condition !== undefined);
  const order =
    sort === "newest"
      ? [desc(packInstance.openedAt), desc(packInstance.id)]
      : sort === "template"
        ? [asc(packTemplate.name), asc(packInstance.id)]
        : sort === "transferability"
          ? [asc(packInstance.binding), asc(packInstance.id)]
          : [asc(packInstance.id)];
  const rows = await db
    .select({
      binding: packInstance.binding,
      id: packInstance.id,
      issuedAt: packInstance.issuedAt,
      issueSource: packInstance.issueSource,
      openedAt: packInstance.openedAt,
      revision: packRevision.revision,
      revisionId: packInstance.revisionId,
      state: packInstance.state,
      templateId: packTemplate.id,
      templateName: packTemplate.name,
    })
    .from(packInstance)
    .innerJoin(packTemplate, eq(packTemplate.id, packInstance.templateId))
    .innerJoin(packRevision, eq(packRevision.id, packInstance.revisionId))
    .where(and(...conditions))
    .orderBy(...order)
    .limit(parsed.limit + 1);
  const hasMore = rows.length > parsed.limit;
  const pageRows = hasMore ? rows.slice(0, parsed.limit) : rows;
  const items = [];
  for (const row of pageRows) {
    const [opening] = await db
      .select({
        cards: packOpening.cards,
        openingId: packOpening.id,
      })
      .from(packOpening)
      .where(eq(packOpening.packInstanceId, row.id))
      .limit(1);
    const openingCards = packOpeningCardsSchema.safeParse(opening?.cards);
    items.push({
      ...row,
      openingId: opening?.openingId ?? null,
      result: openingCards.success ? openingCards.data : [],
    });
  }
  const last = pageRows.at(-1);
  return {
    items,
    nextCursor:
      hasMore && last && last.openedAt
        ? encodeInventoryCursor({
            id: last.id,
            sort,
            value: packOpeningHistoryCursorValue(
              {
                binding: last.binding,
                id: last.id,
                openedAt: last.openedAt,
                templateName: last.templateName,
              },
              sort
            ),
          })
        : null,
  };
}

export const getPrivateCardInventory = listPrivateCardInventory;
export const getPrivatePackInventory = listPrivatePackInventory;
export const getPrivateCollectibleProvenance = listPrivateCollectibleProvenance;
export const getPrivatePackOpeningHistory = listPrivatePackOpeningHistory;

const publicCollectionIdentitySchema = z.object({
  userId: z.string().trim().min(1).max(200),
});

export const publicCardCollectionQuerySchema = z
  .object({
    character: z.string().trim().max(200).optional(),
    characterId: z.string().trim().min(1).max(200).optional(),
    cursor: cursorSchema,
    edition: z.string().trim().max(200).optional(),
    forSale: z.boolean().optional(),
    gameName: z.string().trim().max(200).optional(),
    limited: z.boolean().optional(),
    limit: z.number().int().min(1).max(50).default(24),
    rarity: z
      .enum(["common", "uncommon", "rare", "epic", "legendary"])
      .optional(),
    search: z.string().trim().max(200).optional(),
    series: z.string().trim().max(200).optional(),
    seriesId: z.string().trim().min(1).max(200).optional(),
    sort: inventorySortSchema.default("newest"),
    transferability: collectibleBindingSchema.optional(),
    userId: publicCollectionIdentitySchema.shape.userId,
  })
  .strict();

export type PublicCardCollectionQuery = z.input<
  typeof publicCardCollectionQuerySchema
>;

export const publicPackCollectionQuerySchema = z
  .object({
    acquiredAfter: z.coerce.date().optional(),
    acquiredBefore: z.coerce.date().optional(),
    cursor: cursorSchema,
    forSale: z.boolean().optional(),
    limit: z.number().int().min(1).max(50).default(24),
    search: z.string().trim().max(200).optional(),
    sort: z
      .enum([
        "newest",
        "acquired",
        "template",
        "transferability",
        "for-sale",
        "forSale",
      ])
      .default("newest"),
    transferability: collectibleBindingSchema.optional(),
    userId: publicCollectionIdentitySchema.shape.userId,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.acquiredAfter &&
      value.acquiredBefore &&
      value.acquiredAfter > value.acquiredBefore
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El inicio de adquisición debe ser anterior al final.",
        path: ["acquiredBefore"],
      });
    }
  });

export type PublicPackCollectionQuery = z.input<
  typeof publicPackCollectionQuerySchema
>;

export type PublicCollectionSaleResolver = (input: {
  assetIds: readonly string[];
  assetKind: "card" | "pack";
  profileUserId: string;
}) =>
  | Promise<ReadonlyMap<string, PublicCollectibleSale>>
  | ReadonlyMap<string, PublicCollectibleSale>;

export type PublicCollectionReadOptions = {
  resolveActiveSales?: PublicCollectionSaleResolver;
};

async function canReadPublicCollection(db: Database, userId: string) {
  const [account, visibility] = await Promise.all([
    db.query.user.findFirst({
      columns: { id: true },
      where: and(eq(user.id, userId), userIsNotActivelyBanned()),
    }),
    getResolvedProfileVisibility(db, userId),
  ]);
  return Boolean(account && visibility.publicCollection);
}

/**
 * Public collection reads intentionally recheck preference and ownership in
 * the same request. They never accept an owner derived from a card/pack ID.
 */
export async function listPublicCardCollection(
  db: Database,
  input: PublicCardCollectionQuery,
  options: PublicCollectionReadOptions = {}
) {
  const parsed = publicCardCollectionQuerySchema.parse(input);
  if (!(await canReadPublicCollection(db, parsed.userId))) {
    return { items: [], nextCursor: null, visible: false } as const;
  }

  const sort = normalizeSort(parsed.sort);
  const cursor = decodeInventoryCursor(parsed.cursor);
  const conditions = [
    eq(cardInstance.ownerUserId, parsed.userId),
    isNull(cardInstance.packInstanceId),
    parsed.characterId ? eq(cardCharacter.id, parsed.characterId) : undefined,
    parsed.character
      ? ilike(cardCharacter.characterName, `%${parsed.character}%`)
      : undefined,
    parsed.gameName
      ? ilike(
          cardCharacter.normalizedGameName,
          `%${parsed.gameName.toLowerCase()}%`
        )
      : undefined,
    parsed.seriesId ? eq(cardSeries.id, parsed.seriesId) : undefined,
    parsed.series ? ilike(cardSeries.name, `%${parsed.series}%`) : undefined,
    parsed.edition
      ? ilike(cardTemplate.edition, `%${parsed.edition}%`)
      : undefined,
    parsed.rarity ? eq(cardTemplate.rarity, parsed.rarity) : undefined,
    parsed.limited === undefined
      ? undefined
      : parsed.limited
        ? sql`${cardTemplate.lifetimeSupplyCeiling} IS NOT NULL`
        : isNull(cardTemplate.lifetimeSupplyCeiling),
    parsed.search
      ? or(
          ilike(cardCharacter.characterName, `%${parsed.search}%`),
          ilike(cardCharacter.gameName, `%${parsed.search}%`),
          ilike(cardSeries.name, `%${parsed.search}%`),
          ilike(cardTemplate.edition, `%${parsed.search}%`)
        )
      : undefined,
    parsed.transferability
      ? eq(cardInstance.binding, parsed.transferability)
      : undefined,
    activeInventorySaleCondition("card", parsed.forSale, new Date()),
    cardCursorCondition(cursor, sort),
  ].filter((condition) => condition !== undefined);
  const order =
    sort === "newest"
      ? [desc(cardInstance.issuedAt), desc(cardInstance.id)]
      : sort === "mint"
        ? [asc(cardInstance.mintNumber), asc(cardInstance.id)]
        : sort === "rarity"
          ? [asc(cardRarityRank), asc(cardInstance.id)]
          : sort === "limited"
            ? [asc(cardLimitedRank), asc(cardInstance.id)]
            : sort === "game"
              ? [asc(cardCharacter.normalizedGameName), asc(cardInstance.id)]
              : sort === "character"
                ? [asc(cardCharacter.characterName), asc(cardInstance.id)]
                : sort === "series"
                  ? [asc(cardSeries.name), asc(cardInstance.id)]
                  : sort === "edition"
                    ? [asc(cardEditionSort), asc(cardInstance.id)]
                    : sort === "transferability"
                      ? [asc(cardInstance.binding), asc(cardInstance.id)]
                      : sort === "for-sale"
                        ? [desc(cardSaleRank), asc(cardInstance.id)]
                        : [asc(cardInstance.id)];
  const rows = await db
    .select({
      availability: cardTemplate.availability,
      instanceAvailability: cardInstance.availability,
      binding: cardInstance.binding,
      characterName: cardCharacter.characterName,
      description: cardTemplate.description,
      edition: cardTemplate.edition,
      gameName: cardCharacter.gameName,
      id: cardInstance.id,
      isForSale: cardSaleRank,
      issuedAt: cardInstance.issuedAt,
      lifetimeSupplyCeiling: cardTemplate.lifetimeSupplyCeiling,
      mintNumber: cardInstance.mintNumber,
      normalizedGameName: cardCharacter.normalizedGameName,
      presentationMetadata: cardTemplate.presentationMetadata,
      rarity: cardTemplate.rarity,
      renderedVariants: cardTemplate.renderedVariants,
      seriesName: cardSeries.name,
      templateId: cardTemplate.id,
    })
    .from(cardInstance)
    .innerJoin(cardTemplate, eq(cardTemplate.id, cardInstance.templateId))
    .innerJoin(cardCharacter, eq(cardCharacter.id, cardTemplate.characterId))
    .innerJoin(cardSeries, eq(cardSeries.id, cardTemplate.seriesId))
    .where(and(...conditions))
    .orderBy(...order)
    .limit(parsed.limit + 1);
  const sales = new Map(
    await (options.resolveActiveSales
      ? options.resolveActiveSales({
          assetIds: rows.slice(0, parsed.limit).map(({ id }) => id),
          assetKind: "card",
          profileUserId: parsed.userId,
        })
      : resolveInventorySales(db, {
          assetIds: rows.slice(0, parsed.limit).map(({ id }) => id),
          assetKind: "card",
          profileUserId: parsed.userId,
        }))
  );
  const hasMore = rows.length > parsed.limit;
  const items = (hasMore ? rows.slice(0, parsed.limit) : rows).map((row) => {
    const template = shapePublicCardTemplate({
      ...row,
      availability: row.availability,
      id: row.templateId,
    });
    const sale = sales.get(row.id);
    return publicCardInstanceSchema.parse({
      availability: row.instanceAvailability,
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
      mintDisplay: formatCardMintNumber(
        row.mintNumber,
        row.lifetimeSupplyCeiling
      ),
      mintNumber: row.mintNumber,
      rarity: row.rarity,
      seriesName: template.seriesName,
      template,
      templateId: row.templateId,
    });
  });
  const last = rows[parsed.limit - 1];
  return {
    items,
    nextCursor:
      hasMore && last
        ? encodeInventoryCursor({
            id: last.id,
            sort,
            value: cardCursorValue(
              {
                ...last,
                characterName: last.characterName,
                seriesName: last.seriesName,
                edition: last.edition,
                binding: last.binding,
                lifetimeSupplyCeiling: last.lifetimeSupplyCeiling,
              },
              sort
            ),
          })
        : null,
    visible: true as const,
  };
}

export async function listPublicPackCollection(
  db: Database,
  input: PublicPackCollectionQuery,
  options: PublicCollectionReadOptions = {}
) {
  const parsed = publicPackCollectionQuerySchema.parse(input);
  if (!(await canReadPublicCollection(db, parsed.userId))) {
    return { items: [], nextCursor: null, visible: false } as const;
  }

  const sort = normalizeSort(parsed.sort);
  const cursor = decodeInventoryCursor(parsed.cursor);
  const conditions = [
    eq(packInstance.ownerUserId, parsed.userId),
    eq(packInstance.state, "unopened"),
    parsed.acquiredAfter
      ? sql`${packInstance.issuedAt} >= ${parsed.acquiredAfter}`
      : undefined,
    parsed.acquiredBefore
      ? sql`${packInstance.issuedAt} < ${parsed.acquiredBefore}`
      : undefined,
    parsed.transferability
      ? eq(packInstance.binding, parsed.transferability)
      : undefined,
    parsed.search ? ilike(packTemplate.name, `%${parsed.search}%`) : undefined,
    activeInventorySaleCondition("pack", parsed.forSale, new Date()),
    packCursorCondition(cursor, sort),
  ].filter((condition) => condition !== undefined);
  const order =
    sort === "newest"
      ? [desc(packInstance.issuedAt), desc(packInstance.id)]
      : sort === "for-sale"
        ? [desc(packSaleRank), asc(packInstance.id)]
        : sort === "template"
          ? [asc(packTemplate.name), asc(packInstance.id)]
          : sort === "transferability"
            ? [asc(packInstance.binding), asc(packInstance.id)]
            : [asc(packInstance.id)];
  const rows = await db
    .select({
      availability: packInstance.availability,
      binding: packInstance.binding,
      id: packInstance.id,
      isForSale: packSaleRank,
      issuedAt: packInstance.issuedAt,
      revision: packRevision.revision,
      templateAssetObjectKey: media.objectKey,
      templateId: packTemplate.id,
      templateName: packTemplate.name,
    })
    .from(packInstance)
    .innerJoin(packTemplate, eq(packTemplate.id, packInstance.templateId))
    .innerJoin(media, eq(media.id, packTemplate.assetMediaId))
    .innerJoin(packRevision, eq(packRevision.id, packInstance.revisionId))
    .where(and(...conditions))
    .orderBy(...order)
    .limit(parsed.limit + 1);
  const sales = new Map(
    await (options.resolveActiveSales
      ? options.resolveActiveSales({
          assetIds: rows.slice(0, parsed.limit).map(({ id }) => id),
          assetKind: "pack",
          profileUserId: parsed.userId,
        })
      : resolveInventorySales(db, {
          assetIds: rows.slice(0, parsed.limit).map(({ id }) => id),
          assetKind: "pack",
          profileUserId: parsed.userId,
        }))
  );
  const hasMore = rows.length > parsed.limit;
  const items = (hasMore ? rows.slice(0, parsed.limit) : rows).map(
    ({ id, isForSale: _isForSale, ...row }) => {
      const sale = sales.get(id);
      return publicPackInstanceSchema.parse({
        ...row,
        ...(sale
          ? {
              forSale: true,
              listingIsBundle: sale.isBundle,
              listingId: sale.listingId,
              listingUrl: sale.listingUrl,
            }
          : { forSale: false }),
      });
    }
  );
  const last = rows[parsed.limit - 1];
  return {
    items,
    nextCursor:
      hasMore && last
        ? encodeInventoryCursor({
            id: last.id,
            sort,
            value: packCursorValue(last, sort),
          })
        : null,
    visible: true as const,
  };
}

export const getPublicCardCollection = listPublicCardCollection;
export const getPublicPackCollection = listPublicPackCollection;
