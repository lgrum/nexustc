import { createHash } from "node:crypto";

import {
  blackMarketListing,
  blackMarketListingAudit,
  blackMarketRiskSignal,
  blackMarketSale,
  cardCharacter,
  cardInstance,
  cardSeries,
  cardTemplate,
  collectibleCustody,
  packInstance,
  packRevision,
  packTemplate,
  user,
} from "@repo/db";
import type { BlackMarketListingSearchInput } from "@repo/shared/collectibles";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as CollectiblesService from "./collectibles";

// The in-memory Drizzle adapter below intentionally mirrors promise/query
// interfaces and uses compact fake rows; keep its test-fixture lint exceptions
// scoped to the adapter rather than weakening the behavioral tests.
// oxlint-disable eslint/class-methods-use-this, eslint/curly, eslint/custom-error-definition, eslint/max-classes-per-file, eslint/prefer-destructuring, eslint/require-await, unicorn/no-thenable, unicorn/no-useless-undefined, unicorn/prefer-string-replace-all

const notifications = vi.hoisted(() => ({
  calls: [] as Record<string, unknown>[],
  fail: false,
}));
const economyGates = vi.hoisted(() => ({ economy: true, spending: true }));

vi.mock("@repo/env", () => ({
  env: {
    COLLECTIBLES_ENABLED: true,
    DATABASE_URL: "postgres://black-market-test.invalid/black-market-test",
    get ETERIS_SPENDING_ENABLED() {
      return economyGates.spending;
    },
    REDIS_URL: "redis://black-market-test.invalid",
    get XP_ECONOMY_ENABLED() {
      return economyGates.economy;
    },
  },
}));

vi.mock("../utils/user-ban", () => ({
  isUserBanActive: vi.fn(() => false),
}));

vi.mock("./collectibles", async (importOriginal) => {
  const actual = await importOriginal<typeof CollectiblesService>();
  return {
    ...actual,
    assertCollectiblesMutationAllowed: vi.fn(),
    withCollectibleDeadlockRetry: vi.fn(
      async <T>(operation: () => Promise<T>) => operation()
    ),
  };
});

vi.mock("./notification", () => ({
  createUserNotification: vi.fn(
    (_db: unknown, input: Record<string, unknown>) => {
      if (notifications.fail) {
        return Promise.reject(new Error("notification unavailable"));
      }
      notifications.calls.push(input);
      return Promise.resolve({
        id: `notification-${notifications.calls.length}`,
      });
    }
  ),
}));

vi.mock("./collectible-ownership", () => ({
  appendCollectibleOwnershipEvent: vi.fn(
    async (tx: unknown, input: Record<string, unknown>) => {
      marketFromTx(tx).ownershipEvents.push(input);
    }
  ),
}));

class TestCollectibleCustodyError extends Error {}

vi.mock("./collectible-custody", () => ({
  CollectibleCustodyError: TestCollectibleCustodyError,
  assertNoActiveCollectibleCustody: vi.fn(
    async (tx: unknown, assets: readonly { assetId: string }[]) => {
      const market = marketFromTx(tx);
      if (
        assets.some((asset) =>
          [...market.state.custody.values()].some(
            (row) =>
              row.releasedAt === null &&
              (row.cardInstanceId === asset.assetId ||
                row.packInstanceId === asset.assetId)
          )
        )
      ) {
        throw new TestCollectibleCustodyError("active custody");
      }
    }
  ),
  // Mirror the shared helper's canonical pack→card FOR UPDATE order so the
  // fake adapter keeps recording the deterministic lock sequence.
  lockCollectibleAssets: vi.fn(
    async (
      tx: {
        select: () => {
          from: (table: unknown) => {
            where: (condition: unknown) => {
              orderBy: () => {
                for: () => Promise<unknown>;
              };
            };
          };
        };
      },
      assets: readonly { assetId: string; kind: "card" | "pack" }[]
    ) => {
      const packIds = assets
        .filter(({ kind }) => kind === "pack")
        .map(({ assetId }) => assetId);
      const cardIds = assets
        .filter(({ kind }) => kind === "card")
        .map(({ assetId }) => assetId);
      if (packIds.length > 0) {
        await tx
          .select()
          .from(packInstance)
          .where({ idIn: packIds })
          .orderBy()
          .for();
      }
      if (cardIds.length > 0) {
        await tx
          .select()
          .from(cardInstance)
          .where({ idIn: cardIds })
          .orderBy()
          .for();
      }
    }
  ),
  createCollectibleCustody: vi.fn(
    async (
      tx: unknown,
      input: {
        acquiredAt: Date;
        assets: readonly {
          asset: { assetId: string; kind: "card" | "pack" };
        }[];
        blackMarketListingId: string;
      }
    ) => {
      const market = marketFromTx(tx);
      for (const entry of input.assets) {
        const row = {
          acquiredAt: input.acquiredAt,
          cardInstanceId:
            entry.asset.kind === "card" ? entry.asset.assetId : null,
          blackMarketListingId: input.blackMarketListingId,
          id: `custody-${input.blackMarketListingId}-${entry.asset.assetId}`,
          packInstanceId:
            entry.asset.kind === "pack" ? entry.asset.assetId : null,
          releasedAt: null,
          releaseKind: null,
        };
        market.state.custody.set(row.id, row);
      }
    }
  ),
  findActiveCollectibleCustody: vi.fn(
    async (tx: unknown, assets: readonly { assetId: string }[]) => {
      const market = marketFromTx(tx);
      return [...market.state.custody.values()].filter(
        (row) =>
          row.releasedAt === null &&
          assets.some(
            (asset) =>
              row.cardInstanceId === asset.assetId ||
              row.packInstanceId === asset.assetId
          )
      );
    }
  ),
  listBlackMarketListingCustody: vi.fn(
    async (tx: unknown, listingId: string) => {
      const market = marketFromTx(tx);
      return [...market.state.custody.values()].filter(
        (row) =>
          row.blackMarketListingId === listingId && row.releasedAt === null
      );
    }
  ),
  lockActiveCollectibleCustody: vi.fn(async () => undefined),
  releaseBlackMarketCollectibleCustody: vi.fn(
    async (tx: unknown, listingId: string, releaseKind: string, now: Date) => {
      const market = marketFromTx(tx);
      for (const row of market.state.custody.values()) {
        if (row.blackMarketListingId === listingId && row.releasedAt === null) {
          row.releasedAt = now;
          row.releaseKind = releaseKind;
        }
      }
    }
  ),
  transferCollectibleAssetOwner: vi.fn(
    async (
      tx: unknown,
      asset: { assetId: string; kind: "card" | "pack" },
      fromUserId: string,
      toUserId: string
    ) => {
      const market = marketFromTx(tx);
      if (market.failTransfer) {
        throw new Error("simulated ownership race");
      }
      const collection =
        asset.kind === "card" ? market.state.cards : market.state.packs;
      const row = collection.get(asset.assetId);
      if (!row || row.ownerUserId !== fromUserId) {
        throw new Error("ownership changed");
      }
      row.ownerUserId = toUserId;
    }
  ),
}));

vi.mock("./eteris", () => ({
  getOrCreateUserWalletInTransaction: vi.fn(
    async (tx: unknown, userId: string) => marketFromTx(tx).wallet(userId)
  ),
  postEterisTransactionInTransaction: vi.fn(
    async (
      tx: unknown,
      input: { idempotencyKey: string; postings: Posting[] }
    ) => marketFromTx(tx).postTransaction(input)
  ),
  reverseEterisTransactionInTransaction: vi.fn(
    async (
      tx: unknown,
      input: { idempotencyKey: string; transactionId: string }
    ) => marketFromTx(tx).reverseTransaction(input)
  ),
}));

type Row = Record<string, unknown>;
type Posting = { amount: bigint; walletId: string };
type Wallet = {
  balance: bigint;
  id: string;
  status: "active" | "frozen";
  userId: string;
};

type MarketState = {
  audits: Row[];
  cards: Map<string, Row>;
  characters: Map<string, Row>;
  custody: Map<string, Row>;
  listings: Map<string, Row>;
  packs: Map<string, Row>;
  revisions: Map<string, Row>;
  riskSignals: Row[];
  sales: Map<string, Row>;
  series: Map<string, Row>;
  templates: Map<string, Row>;
  transactions: Row[];
  users: Map<string, Row>;
  wallets: Map<string, Wallet>;
};

type Candidate = { parts: Map<unknown, Row> };

function snakeToCamel(value: string) {
  return value.replace(/_([a-z])/g, (_match, letter: string) =>
    letter.toUpperCase()
  );
}

function isSql(value: unknown): value is { queryChunks: unknown[] } {
  return Boolean(
    value &&
    typeof value === "object" &&
    "queryChunks" in value &&
    Array.isArray((value as { queryChunks?: unknown }).queryChunks)
  );
}

function isParam(value: unknown): value is { value: unknown } {
  return Boolean(
    value &&
    typeof value === "object" &&
    (value as { constructor?: { name?: string } }).constructor?.name ===
      "Param" &&
    "value" in value
  );
}

function isColumn(value: unknown): value is { name: string; table: unknown } {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as { name?: unknown }).name === "string" &&
    "table" in value
  );
}

function stringChunk(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    (value as { constructor?: { name?: string } }).constructor?.name !==
      "StringChunk"
  ) {
    return null;
  }
  const strings = (value as { value?: unknown }).value;
  return Array.isArray(strings) ? strings.join("") : null;
}

function columnValue(
  candidate: Candidate,
  column: { name: string; table: unknown }
) {
  return candidate.parts.get(column.table)?.[snakeToCamel(column.name)];
}

function compare(left: unknown, right: unknown) {
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() - right.getTime();
  }
  if (typeof left === "bigint" || typeof right === "bigint") {
    const leftValue = BigInt(left as bigint | number | string);
    const rightValue = BigInt(right as bigint | number | string);
    return leftValue > rightValue ? 1 : leftValue < rightValue ? -1 : 0;
  }
  if (left === right) return 0;
  return left !== undefined &&
    left !== null &&
    right !== undefined &&
    right !== null &&
    left > right
    ? 1
    : -1;
}

function conditionResult(condition: unknown, candidate: Candidate): boolean {
  if (!isSql(condition)) return true;
  const chunks = condition.queryChunks;
  const nested = chunks.filter(isSql);
  const join = chunks
    .map(stringChunk)
    .find((value) => value === " and " || value === " or ");
  if (nested.length > 0 && join) {
    return join === " and "
      ? nested.every((entry) => conditionResult(entry, candidate))
      : nested.some((entry) => conditionResult(entry, candidate));
  }
  const column = chunks.find(isColumn);
  if (!column) return true;
  const value = columnValue(candidate, column);
  const operator = chunks
    .map(stringChunk)
    .find((entry) => entry && /(?:=|>=|<=|>|<| in | is null)/.test(entry));
  if (operator?.includes("is null"))
    return value === null || value === undefined;
  const params = chunks.flatMap((chunk) => {
    if (isParam(chunk)) return [chunk.value];
    if (Array.isArray(chunk))
      return chunk.filter(isParam).map((entry) => entry.value);
    return [];
  });
  if (operator?.includes(" in "))
    return params.some((entry) => entry === value);
  const expected = params[0];
  if (operator?.includes(">=")) return compare(value, expected) >= 0;
  if (operator?.includes("<=")) return compare(value, expected) <= 0;
  if (operator?.includes(">")) return compare(value, expected) > 0;
  if (operator?.includes("<")) return compare(value, expected) < 0;
  return value === expected;
}

function conditionParams(condition: unknown): unknown[] {
  if (isParam(condition)) return [condition.value];
  if (Array.isArray(condition)) return condition.flatMap(conditionParams);
  if (isSql(condition)) return condition.queryChunks.flatMap(conditionParams);
  return [];
}

function conditionText(condition: unknown): string[] {
  if (isSql(condition)) {
    return condition.queryChunks.flatMap((chunk) => {
      const text = stringChunk(chunk);
      return text === null ? conditionText(chunk) : [text];
    });
  }
  return [];
}

function baseRows(market: FakeMarket, table: unknown): Row[] {
  if (table === blackMarketListing) return [...market.state.listings.values()];
  if (table === blackMarketListingAudit) return market.state.audits;
  if (table === blackMarketSale) return [...market.state.sales.values()];
  if (table === blackMarketRiskSignal) return market.state.riskSignals;
  if (table === collectibleCustody) return [...market.state.custody.values()];
  if (table === cardInstance) return [...market.state.cards.values()];
  if (table === cardTemplate) return [...market.state.templates.values()];
  if (table === cardCharacter) return [...market.state.characters.values()];
  if (table === cardSeries) return [...market.state.series.values()];
  if (table === packInstance) return [...market.state.packs.values()];
  if (table === packTemplate) return [...market.state.templates.values()];
  if (table === packRevision) return [...market.state.revisions.values()];
  if (table === user) return [...market.state.users.values()];
  return [];
}

function joinCandidate(
  market: FakeMarket,
  candidate: Candidate,
  table: unknown
) {
  const parts = new Map(candidate.parts);
  const custody = parts.get(collectibleCustody);
  const listing = parts.get(blackMarketListing);
  const sale = parts.get(blackMarketSale);
  const card = parts.get(cardInstance);
  const pack = parts.get(packInstance);
  let rows: Row[] = [];
  if (table === blackMarketListing && custody?.blackMarketListingId) {
    const row = market.state.listings.get(String(custody.blackMarketListingId));
    if (row) rows = [row];
  } else if (table === collectibleCustody && sale?.listingId) {
    rows = [...market.state.custody.values()].filter(
      (row) => row.blackMarketListingId === sale.listingId
    );
  } else if (table === cardInstance && custody?.cardInstanceId) {
    const row = market.state.cards.get(String(custody.cardInstanceId));
    if (row) rows = [row];
  } else if (table === cardTemplate && card?.templateId) {
    const row = market.state.templates.get(String(card.templateId));
    if (row) rows = [row];
  } else if (table === cardCharacter && card?.templateId) {
    const template = market.state.templates.get(String(card.templateId));
    const row = template?.characterId
      ? market.state.characters.get(String(template.characterId))
      : undefined;
    if (row) rows = [row];
  } else if (table === cardSeries && card?.templateId) {
    const template = market.state.templates.get(String(card.templateId));
    const row = template?.seriesId
      ? market.state.series.get(String(template.seriesId))
      : undefined;
    if (row) rows = [row];
  } else if (table === packInstance && custody?.packInstanceId) {
    const row = market.state.packs.get(String(custody.packInstanceId));
    if (row) rows = [row];
  } else if (table === packTemplate && pack?.templateId) {
    const row = market.state.templates.get(String(pack.templateId));
    if (row) rows = [row];
  } else if (table === packRevision && pack?.revisionId) {
    const row = market.state.revisions.get(String(pack.revisionId));
    if (row) rows = [row];
  } else if (listing && table === collectibleCustody) {
    rows = [...market.state.custody.values()].filter(
      (row) => row.blackMarketListingId === listing.id
    );
  }
  return rows.map((row) => ({ parts: new Map([...parts, [table, row]]) }));
}

function project(
  shape: Record<string, unknown> | undefined,
  candidate: Candidate
) {
  if (!shape) {
    return Object.fromEntries(
      [...candidate.parts.values()].flatMap((row) => Object.entries(row))
    );
  }
  const result: Row = {};
  for (const [key, value] of Object.entries(shape)) {
    if (isColumn(value)) result[key] = columnValue(candidate, value);
    else if (key === "cursorKey") {
      const sale = candidate.parts.get(blackMarketSale);
      result[key] = createHash("md5")
        .update(String(sale?.id ?? ""))
        .digest("hex");
    } else if (key === "limited") {
      const template = candidate.parts.get(cardTemplate);
      result[key] =
        template?.lifetimeSupplyCeiling !== null &&
        template?.lifetimeSupplyCeiling !== undefined;
    } else result[key] = undefined;
  }
  return result;
}

type SearchAsset =
  | {
      characterName?: string;
      edition?: string | null;
      gameName?: string;
      kind: "card";
      limited: boolean;
      mintNumber?: number;
      normalizedGameName?: string;
      rarity?: string;
      seriesId?: string;
      seriesName?: string;
    }
  | { kind: "pack"; templateName?: string };

type FakeSearchRow = Row & {
  askingPrice: bigint;
  assetCount: number;
  hasCard: boolean;
  hasPack: boolean;
  id: string;
  publishedAt: Date;
  sortValue: Date | bigint | number;
};

function searchAssets(market: FakeMarket, listingId: string): SearchAsset[] {
  return [...market.state.custody.values()]
    .filter(
      (row) => row.blackMarketListingId === listingId && row.releasedAt === null
    )
    .flatMap((row): SearchAsset[] => {
      if (row.cardInstanceId) {
        const card = market.state.cards.get(String(row.cardInstanceId));
        const template = card?.templateId
          ? market.state.templates.get(String(card.templateId))
          : undefined;
        const character = template?.characterId
          ? market.state.characters.get(String(template.characterId))
          : undefined;
        const series = template?.seriesId
          ? market.state.series.get(String(template.seriesId))
          : undefined;
        return [
          {
            characterName: character?.characterName as string | undefined,
            edition: template?.edition as string | null | undefined,
            gameName: character?.gameName as string | undefined,
            kind: "card" as const,
            limited: template?.lifetimeSupplyCeiling !== null,
            mintNumber: card?.mintNumber as number | undefined,
            normalizedGameName: character?.normalizedGameName as
              | string
              | undefined,
            rarity: template?.rarity as string | undefined,
            seriesId: series?.id as string | undefined,
            seriesName: series?.name as string | undefined,
          } satisfies SearchAsset,
        ];
      }
      if (row.packInstanceId) {
        const pack = market.state.packs.get(String(row.packInstanceId));
        const template = pack?.templateId
          ? market.state.templates.get(String(pack.templateId))
          : undefined;
        return [
          {
            kind: "pack" as const,
            templateName: template?.name as string | undefined,
          } satisfies SearchAsset,
        ];
      }
      return [];
    });
}

function matchesSearchAsset(
  asset: SearchAsset,
  input: BlackMarketListingSearchInput
) {
  if (input.assetKind && asset.kind !== input.assetKind) {
    return false;
  }
  if (asset.kind === "pack") {
    if (
      input.character ||
      input.edition ||
      input.gameName ||
      input.limited !== undefined ||
      input.mintNumber !== undefined ||
      input.rarity ||
      input.series ||
      input.seriesId
    ) {
      return false;
    }
    return input.search
      ? (asset.templateName ?? "")
          .toLocaleLowerCase()
          .includes(input.search.toLocaleLowerCase())
      : true;
  }
  const search = input.search?.toLocaleLowerCase();
  return (
    (!input.character ||
      asset.characterName
        ?.toLocaleLowerCase()
        .includes(input.character.toLocaleLowerCase())) &&
    (!input.edition ||
      asset.edition
        ?.toLocaleLowerCase()
        .includes(input.edition.toLocaleLowerCase())) &&
    (!input.gameName ||
      asset.normalizedGameName
        ?.toLocaleLowerCase()
        .includes(input.gameName.toLocaleLowerCase())) &&
    (!input.rarity || asset.rarity === input.rarity) &&
    (input.limited === undefined || asset.limited === input.limited) &&
    (input.mintNumber === undefined || asset.mintNumber === input.mintNumber) &&
    (!input.series ||
      asset.seriesName
        ?.toLocaleLowerCase()
        .includes(input.series.toLocaleLowerCase())) &&
    (!input.seriesId || asset.seriesId === input.seriesId) &&
    (!search ||
      [
        asset.characterName,
        asset.gameName,
        asset.normalizedGameName,
        asset.edition,
        asset.seriesName,
      ]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(search)))
  );
}

function searchRows(market: FakeMarket) {
  const input = {
    limit: 20,
    sort: "newest" as const,
    ...market.searchInput,
  } as BlackMarketListingSearchInput;
  const minPrice =
    input.minPrice === undefined ? undefined : BigInt(String(input.minPrice));
  const maxPrice =
    input.maxPrice === undefined ? undefined : BigInt(String(input.maxPrice));
  const rarityRank: Record<string, number> = {
    common: 0,
    uncommon: 1,
    rare: 2,
    epic: 3,
    legendary: 4,
  };
  const rows: FakeSearchRow[] = [...market.state.listings.values()].flatMap(
    (listing): FakeSearchRow[] => {
      if (
        listing.state !== "active" ||
        !(listing.expiresAt instanceof Date) ||
        listing.expiresAt <= market.now
      ) {
        return [];
      }
      const assets = searchAssets(market, String(listing.id));
      if (
        assets.length < 1 ||
        assets.length > 50 ||
        (input.bundleStatus === "bundle" && assets.length < 2) ||
        (input.bundleStatus === "single" && assets.length !== 1) ||
        (minPrice !== undefined &&
          BigInt(String(listing.askingPrice)) < minPrice) ||
        (maxPrice !== undefined &&
          BigInt(String(listing.askingPrice)) > maxPrice)
      ) {
        return [];
      }
      const matches =
        !input.assetKind &&
        !input.character &&
        !input.edition &&
        !input.gameName &&
        input.limited === undefined &&
        input.mintNumber === undefined &&
        !input.rarity &&
        !input.search &&
        !input.series &&
        !input.seriesId
          ? true
          : assets.some((asset) => matchesSearchAsset(asset, input));
      if (!matches) {
        return [];
      }
      const value: Date | bigint | number =
        input.sort === "newest"
          ? (listing.publishedAt as Date)
          : input.sort === "price"
            ? BigInt(String(listing.askingPrice))
            : input.sort === "rarity"
              ? Math.min(
                  ...assets.map((asset) =>
                    asset.kind === "card"
                      ? (rarityRank[String(asset.rarity)] ?? 99)
                      : 99
                  )
                )
              : Math.min(
                  ...assets.map((asset) =>
                    asset.kind === "card"
                      ? (asset.mintNumber ?? 2_147_483_647)
                      : 2_147_483_647
                  )
                );
      return [
        {
          ...listing,
          askingPrice: BigInt(String(listing.askingPrice)),
          assetCount: assets.length,
          hasCard: assets.some((asset) => asset.kind === "card"),
          hasPack: assets.some((asset) => asset.kind === "pack"),
          id: String(listing.id),
          publishedAt: listing.publishedAt as Date,
          sortValue: value,
        },
      ];
    }
  );
  rows.sort((left, right) => {
    const leftValue = left.sortValue;
    const rightValue = right.sortValue;
    const valueOrder =
      leftValue instanceof Date && rightValue instanceof Date
        ? leftValue.getTime() - rightValue.getTime()
        : typeof leftValue === "bigint" && typeof rightValue === "bigint"
          ? leftValue < rightValue
            ? -1
            : leftValue > rightValue
              ? 1
              : 0
          : Number(leftValue) - Number(rightValue);
    const direction = input.sort === "newest" ? -1 : 1;
    return (
      direction * valueOrder ||
      direction * String(left.id).localeCompare(String(right.id))
    );
  });
  if (input.cursor) {
    try {
      const cursor = JSON.parse(decodeURIComponent(input.cursor)) as {
        id?: string;
        sort?: string;
        value?: string;
      };
      if (cursor.sort === input.sort && cursor.id && cursor.value) {
        const cursorValue =
          input.sort === "newest"
            ? Number(cursor.value)
            : input.sort === "price"
              ? BigInt(cursor.value)
              : Number(cursor.value);
        const index = rows.findIndex((row) => {
          const current =
            row.sortValue instanceof Date
              ? row.sortValue.getTime()
              : row.sortValue;
          const valueOrder =
            typeof current === "bigint" && typeof cursorValue === "bigint"
              ? current < cursorValue
                ? -1
                : current > cursorValue
                  ? 1
                  : 0
              : Number(current) - Number(cursorValue);
          const direction = input.sort === "newest" ? -1 : 1;
          return (
            direction * valueOrder > 0 ||
            (valueOrder === 0 &&
              direction * String(row.id).localeCompare(cursor.id!) > 0)
          );
        });
        return index === -1 ? [] : rows.slice(index);
      }
    } catch {
      // Invalid cursors are treated as the first page by the real query.
    }
  }
  return rows;
}

function createQueryDatabase(market: FakeMarket) {
  let transactionTail = Promise.resolve();
  const select = vi.fn((shape?: Record<string, unknown>) => {
    let table: unknown;
    let condition: unknown;
    const joins: unknown[] = [];
    function execute(limit?: number) {
      const isSearchPage =
        table === blackMarketListing &&
        shape &&
        "assetCount" in shape &&
        "sortValue" in shape;
      if (
        market.searchInput &&
        [collectibleCustody, cardInstance, packInstance].some(
          (searchTable) => searchTable === table
        )
      ) {
        market.searchAssetQueryCount += 1;
      }
      if (isSearchPage) {
        market.searchQueryCount += 1;
        market.searchQueryLimits.push(limit ?? 0);
        market.searchQueryConditions.push(conditionText(condition));
        return searchRows(market).slice(0, limit);
      }
      let candidates = baseRows(market, table).map((row) => ({
        parts: new Map([[table, row]]),
      }));
      for (const join of joins) {
        candidates = candidates.flatMap((candidate) =>
          joinCandidate(market, candidate, join)
        );
      }
      const params = conditionParams(condition);
      const directAssetIds = params.filter(
        (value): value is string =>
          typeof value === "string" &&
          (market.state.cards.has(value) || market.state.packs.has(value))
      );
      const directListingIds = params.filter(
        (value): value is string =>
          typeof value === "string" && market.state.listings.has(value)
      );
      const eligibleAssetQuery =
        (table === cardInstance &&
          shape &&
          "binding" in shape &&
          "seriesName" in shape) ||
        (table === packInstance &&
          shape &&
          "binding" in shape &&
          "templateName" in shape);
      const activeListingQuery =
        table === blackMarketListing && params.includes("active");
      const directCustodyQuery =
        table === collectibleCustody &&
        (joins.length === 0
          ? directAssetIds.length > 0 || directListingIds.length > 0
          : joins.includes(blackMarketListing) && directAssetIds.length > 0);
      candidates = candidates.filter((candidate) => {
        const row = [...candidate.parts.values()][0];
        if (eligibleAssetQuery || activeListingQuery || directCustodyQuery)
          return true;
        if (directAssetIds.length > 0)
          return directAssetIds.includes(String(row?.id));
        return conditionResult(condition, candidate);
      });
      if (table === blackMarketListing && params.includes("active")) {
        candidates = candidates.filter(
          (candidate) => [...candidate.parts.values()][0]?.state === "active"
        );
      }
      if (table === blackMarketListing) {
        const date = params.find(
          (value): value is Date => value instanceof Date
        );
        const text = conditionText(condition);
        const priceParams = params.filter(
          (value): value is bigint => typeof value === "bigint"
        );
        if (
          date &&
          priceParams.length === 0 &&
          text.some((value) => value.includes(" <= "))
        ) {
          candidates = candidates.filter((candidate) => {
            const expiresAt = [...candidate.parts.values()][0]?.expiresAt;
            return (
              expiresAt instanceof Date && expiresAt.getTime() <= date.getTime()
            );
          });
        } else if (date && text.some((value) => value.includes(" > "))) {
          candidates = candidates.filter((candidate) => {
            const expiresAt = [...candidate.parts.values()][0]?.expiresAt;
            return (
              expiresAt instanceof Date && expiresAt.getTime() > date.getTime()
            );
          });
        }
        if (priceParams.length > 0) {
          const minPrice = text.some((value) => value.includes(">="))
            ? priceParams[0]
            : undefined;
          const maxPrice = text.some((value) => value.includes("<="))
            ? priceParams[minPrice === undefined ? 0 : 1]
            : undefined;
          candidates = candidates.filter((candidate) => {
            const askingPrice = [...candidate.parts.values()][0]?.askingPrice;
            return (
              typeof askingPrice === "bigint" &&
              (minPrice === undefined || askingPrice >= minPrice) &&
              (maxPrice === undefined || askingPrice <= maxPrice)
            );
          });
        }
      }
      if (table === collectibleCustody && joins.length === 0) {
        const listingIds = directListingIds;
        const assetIds = directAssetIds;
        if (listingIds.length > 0) {
          candidates = candidates.filter(
            (candidate) =>
              [...candidate.parts.values()][0]?.releasedAt === null &&
              listingIds.includes(
                String([...candidate.parts.values()][0]?.blackMarketListingId)
              )
          );
        } else if (assetIds.length > 0) {
          candidates = candidates.filter((candidate) => {
            const row = [...candidate.parts.values()][0];
            return (
              row?.releasedAt === null &&
              assetIds.includes(
                String(row?.cardInstanceId ?? row?.packInstanceId)
              )
            );
          });
        }
      }
      if (table === collectibleCustody && joins.includes(blackMarketListing)) {
        candidates = candidates.filter((candidate) => {
          const custody = candidate.parts.get(collectibleCustody);
          const row = candidate.parts.get(blackMarketListing);
          const date = params.find(
            (value): value is Date => value instanceof Date
          );
          return (
            custody?.releasedAt === null &&
            (directAssetIds.length === 0 ||
              directAssetIds.includes(
                String(custody.cardInstanceId ?? custody.packInstanceId)
              )) &&
            row?.state === "active" &&
            (!date || (row.expiresAt instanceof Date && row.expiresAt > date))
          );
        });
      }
      if (table === cardInstance && shape && "seriesName" in shape) {
        candidates = candidates.filter((candidate) => {
          const row = candidate.parts.get(cardInstance);
          const template = candidate.parts.get(cardTemplate);
          return (
            row?.ownerUserId === "seller-1" &&
            row?.packInstanceId === null &&
            row?.availability === "active" &&
            row?.binding === "transferable" &&
            template?.availability === "active" &&
            template?.lifecycle === "active"
          );
        });
      }
      if (
        table === packInstance &&
        shape &&
        "binding" in shape &&
        "templateName" in shape
      ) {
        candidates = candidates.filter((candidate) => {
          const row = candidate.parts.get(packInstance);
          const template = candidate.parts.get(packTemplate);
          const revision = candidate.parts.get(packRevision);
          return (
            row?.ownerUserId === "seller-1" &&
            row?.state === "unopened" &&
            row?.availability === "active" &&
            row?.binding === "transferable" &&
            template?.lifecycle === "active" &&
            revision?.lifecycle === "published" &&
            revision?.availability === "active"
          );
        });
      }
      if (typeof limit === "number") candidates = candidates.slice(0, limit);
      return candidates.map((candidate) => project(shape, candidate));
    }
    const query = {
      from(value: unknown) {
        table = value;
        return query;
      },
      innerJoin(value: unknown) {
        joins.push(value);
        return query;
      },
      where(value: unknown) {
        condition = value;
        return query;
      },
      orderBy() {
        return query;
      },
      limit(value: number) {
        return execute(value);
      },
      for() {
        if (table === packInstance) market.lockOrder.push("pack-instance");
        if (table === cardInstance) market.lockOrder.push("card-instance");
        return execute();
      },
      then(
        resolve: (value: Row[]) => unknown,
        reject?: (error: unknown) => unknown
      ) {
        return Promise.resolve(execute()).then(resolve, reject);
      },
    };
    return query;
  });
  const db: { __market: FakeMarket; [key: string]: unknown } = {
    __market: market,
    delete: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
    execute: vi.fn(async () => ({ rows: [] })),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn(async (input: Row) => {
        const row = { ...input };
        if (table === blackMarketListing) {
          row.createdAt ??= market.now;
          row.updatedAt ??= market.now;
          row.feeReversalTransactionId ??= null;
          row.terminalAt ??= null;
          row.terminalReason ??= null;
          market.state.listings.set(String(row.id), row);
        } else if (table === blackMarketListingAudit) {
          market.state.audits.push(row);
        } else if (table === blackMarketSale) {
          row.createdAt ??= market.now;
          market.state.sales.set(String(row.id), row);
        } else if (table === blackMarketRiskSignal) {
          market.state.riskSignals.push(row);
        }
      }),
    })),
    query: {
      user: {
        findFirst: vi.fn(async ({ where: condition }: { where: unknown }) => {
          const candidate = [...market.state.users.values()].find((row) =>
            conditionResult(condition, { parts: new Map([[user, row]]) })
          );
          return candidate ?? null;
        }),
      },
    },
    select,
    selectDistinct: select,
    transaction: async <T>(callback: (tx: unknown) => Promise<T>) => {
      const previous = transactionTail;
      let release: (() => void) | undefined;
      transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      const snapshot = market.snapshot();
      try {
        return await callback(db);
      } catch (error) {
        market.restore(snapshot);
        throw error;
      } finally {
        release?.();
      }
    },
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: Row) => ({
        where: vi.fn(async (condition: unknown) => {
          const params = conditionParams(condition);
          const listingIds = params.filter(
            (value): value is string =>
              typeof value === "string" && market.state.listings.has(value)
          );
          const listingStates = params.filter(
            (value): value is string =>
              typeof value === "string" &&
              [
                "active",
                "cancelled",
                "expired",
                "sold",
                "administratively-cancelled",
              ].includes(value)
          );
          const candidates = baseRows(market, table)
            .map((row) => ({ parts: new Map([[table, row]]) }))
            .filter((candidate) => {
              const row = candidate.parts.get(table);
              if (table === blackMarketListing && listingIds.length > 0) {
                return (
                  listingIds.includes(String(row?.id)) &&
                  (listingStates.length === 0 ||
                    listingStates.includes(String(row?.state)))
                );
              }
              return conditionResult(condition, candidate);
            });
          for (const candidate of candidates) {
            const row = candidate.parts.get(table);
            if (row) {
              for (const [key, value] of Object.entries(values)) {
                if (value !== undefined) row[key] = value;
              }
            }
          }
        }),
      })),
    })),
  };
  return db;
}

class FakeMarket {
  readonly now = new Date("2026-08-01T00:00:00.000Z");
  readonly ownershipEvents: Row[] = [];
  lockOrder: string[] = [];
  searchInput: BlackMarketListingSearchInput | undefined;
  searchAssetQueryCount = 0;
  searchQueryConditions: string[][] = [];
  searchQueryCount = 0;
  searchQueryLimits: number[] = [];
  failTransfer = false;
  state: MarketState = this.emptyState();
  db = createQueryDatabase(this);

  private emptyState(): MarketState {
    return {
      audits: [],
      cards: new Map(),
      characters: new Map(),
      custody: new Map(),
      listings: new Map(),
      packs: new Map(),
      revisions: new Map(),
      riskSignals: [],
      sales: new Map(),
      series: new Map(),
      templates: new Map(),
      transactions: [],
      users: new Map([
        [
          "seller-1",
          {
            banExpires: null,
            banned: false,
            emailVerified: true,
            id: "seller-1",
          },
        ],
        [
          "buyer-1",
          {
            banExpires: null,
            banned: false,
            emailVerified: true,
            id: "buyer-1",
          },
        ],
        [
          "buyer-2",
          {
            banExpires: null,
            banned: false,
            emailVerified: true,
            id: "buyer-2",
          },
        ],
        [
          "admin-1",
          {
            banExpires: null,
            banned: false,
            emailVerified: true,
            id: "admin-1",
          },
        ],
      ]),
      wallets: new Map([
        [
          "seller-1",
          {
            balance: 0n,
            id: "wallet-seller-1",
            status: "active",
            userId: "seller-1",
          },
        ],
        [
          "buyer-1",
          {
            balance: 1000n,
            id: "wallet-buyer-1",
            status: "active",
            userId: "buyer-1",
          },
        ],
        [
          "buyer-2",
          {
            balance: 1000n,
            id: "wallet-buyer-2",
            status: "active",
            userId: "buyer-2",
          },
        ],
        [
          "admin-1",
          {
            balance: 0n,
            id: "wallet-admin-1",
            status: "active",
            userId: "admin-1",
          },
        ],
      ]),
    };
  }

  snapshot() {
    return structuredClone({
      state: this.state,
      ownershipEvents: this.ownershipEvents,
    });
  }

  restore(snapshot: ReturnType<FakeMarket["snapshot"]>) {
    this.state = snapshot.state;
    this.ownershipEvents.splice(
      0,
      this.ownershipEvents.length,
      ...snapshot.ownershipEvents
    );
  }

  wallet(userId: string) {
    const wallet = this.state.wallets.get(userId);
    if (!wallet) throw new Error(`missing wallet ${userId}`);
    return { ...wallet };
  }

  postTransaction(input: { idempotencyKey: string; postings: Posting[] }) {
    const replay = this.state.transactions.find(
      (row) => row.idempotencyKey === input.idempotencyKey
    );
    if (replay) return { id: String(replay.id), replayed: true as const };
    for (const posting of input.postings) {
      if (posting.amount < 0n) {
        const wallet = [...this.state.wallets.values()].find(
          (entry) => entry.id === posting.walletId
        );
        if (
          wallet &&
          (wallet.status !== "active" || wallet.balance + posting.amount < 0n)
        ) {
          const error = new Error("Saldo insuficiente");
          Object.assign(error, { code: "INSUFFICIENT_FUNDS" });
          throw error;
        }
      }
    }
    for (const posting of input.postings) {
      const wallet = [...this.state.wallets.values()].find(
        (entry) => entry.id === posting.walletId
      );
      if (wallet) wallet.balance += posting.amount;
    }
    const id = `eteris-${this.state.transactions.length + 1}`;
    this.state.transactions.push({
      id,
      idempotencyKey: input.idempotencyKey,
      postings: structuredClone(input.postings),
    });
    return { id, replayed: false as const };
  }

  reverseTransaction(input: { idempotencyKey: string; transactionId: string }) {
    const replay = this.state.transactions.find(
      (row) => row.idempotencyKey === input.idempotencyKey
    );
    if (replay) return { id: String(replay.id), replayed: true as const };
    const original = this.state.transactions.find(
      (row) => row.id === input.transactionId
    );
    if (!original) throw new Error("missing transaction");
    return this.postTransaction({
      idempotencyKey: input.idempotencyKey,
      postings: (original.postings as Posting[]).map((posting) => ({
        amount: -posting.amount,
        walletId: posting.walletId,
      })),
    });
  }

  addCard(
    id: string,
    options: { character?: string; mintNumber?: number; rarity?: string } = {}
  ) {
    const templateId = `template-${id}`;
    const characterId = `character-${id}`;
    const seriesId = `series-${id}`;
    this.state.characters.set(characterId, {
      gameName: "Metroid",
      id: characterId,
      characterName: options.character ?? "Samus",
      normalizedGameName: "metroid",
    });
    this.state.series.set(seriesId, { id: seriesId, name: "Prime" });
    this.state.templates.set(templateId, {
      availability: "active",
      characterId,
      edition: "First",
      id: templateId,
      lifecycle: "active",
      lifetimeSupplyCeiling: 100,
      rarity: options.rarity ?? "rare",
      seriesId,
    });
    this.state.cards.set(id, {
      availability: "active",
      binding: "transferable",
      id,
      mintNumber: options.mintNumber ?? 1,
      ownerUserId: "seller-1",
      packInstanceId: null,
      templateId,
    });
    return id;
  }

  addPack(id: string, name = "Prime Pack") {
    const templateId = `pack-template-${id}`;
    const revisionId = `revision-${id}`;
    this.state.templates.set(templateId, {
      id: templateId,
      lifecycle: "active",
      name,
    });
    this.state.revisions.set(revisionId, {
      availability: "active",
      id: revisionId,
      lifecycle: "published",
    });
    this.state.packs.set(id, {
      availability: "active",
      binding: "transferable",
      id,
      ownerUserId: "seller-1",
      revisionId,
      state: "unopened",
      templateId,
    });
    return id;
  }

  seedListing(input: {
    id: string;
    assets: readonly { assetId: string; kind: "card" | "pack" }[];
    askingPrice: bigint;
    publishedAt?: Date;
    state?: string;
  }) {
    const publishedAt = input.publishedAt ?? this.now;
    this.state.listings.set(input.id, {
      askingPrice: input.askingPrice,
      createdAt: publishedAt,
      expiresAt: new Date(publishedAt.getTime() + 30 * 24 * 60 * 60 * 1000),
      feeReversalTransactionId: null,
      feeTransactionId: `fee-${input.id}`,
      fingerprint: `fingerprint-${input.id}`,
      id: input.id,
      idempotencyKey: `publish-${input.id}`,
      listingFee: 1n,
      publishedAt,
      sellerUserId: "seller-1",
      state: input.state ?? "active",
      terminalAt: null,
      terminalReason: null,
      termsHash: `terms-${input.id}`,
      updatedAt: publishedAt,
      version: 1,
    });
    for (const asset of input.assets) {
      this.state.custody.set(`custody-${input.id}-${asset.assetId}`, {
        acquiredAt: publishedAt,
        cardInstanceId: asset.kind === "card" ? asset.assetId : null,
        blackMarketListingId: input.id,
        id: `custody-${input.id}-${asset.assetId}`,
        packInstanceId: asset.kind === "pack" ? asset.assetId : null,
        releasedAt: null,
        releaseKind: null,
      });
    }
  }
}

function marketFromTx(tx: unknown) {
  return (tx as { __market: FakeMarket }).__market;
}

const service = await import("./black-market");
const {
  administrativelyCancelBlackMarketListingInTransaction,
  administrativelyCancelBlackMarketListing,
  BLACK_MARKET_MAX_PRICE,
  cancelBlackMarketListing,
  detectBlackMarketSaleRiskSignals,
  expireBlackMarketListingsBatch,
  getBlackMarketListingDetail,
  getBlackMarketSaleHistory,
  listEligibleBlackMarketAssets,
  notifyBlackMarketParticipants,
  publishBlackMarketListing: publishBlackMarketListingService,
  purchaseBlackMarketListing: purchaseBlackMarketListingService,
  recordBlackMarketRiskSignals,
  resolveActiveBlackMarketSales,
  retryBlackMarketListingNotification,
  searchBlackMarketListings,
} = service;

// The RPC boundary passes string prices; the service receives the already
// parsed BigInt contract. These wrappers intentionally exercise that boundary
// with raw payloads while keeping the production signature strict.
const publishBlackMarketListing = (
  db: Parameters<typeof publishBlackMarketListingService>[0],
  sellerUserId: string,
  input: unknown
) => publishBlackMarketListingService(db, sellerUserId, input as never);
const purchaseBlackMarketListing = (
  db: Parameters<typeof purchaseBlackMarketListingService>[0],
  buyerUserId: string,
  input: unknown
) => purchaseBlackMarketListingService(db, buyerUserId, input as never);
const searchListingsWithInput = (market: FakeMarket, input: unknown) => {
  market.searchInput = input as BlackMarketListingSearchInput;
  return searchBlackMarketListings(market.db as never, input);
};

function publishInput(
  assets: readonly { assetId: string; kind: "card" | "pack" }[],
  askingPrice = 100n,
  idempotencyKey = `publish-${assets.map((asset) => asset.assetId).join("-")}`
) {
  return { askingPrice: askingPrice.toString(), assets, idempotencyKey };
}

// oxlint-enable eslint/class-methods-use-this, eslint/curly, eslint/custom-error-definition, eslint/max-classes-per-file, eslint/prefer-destructuring, eslint/require-await, unicorn/no-thenable, unicorn/no-useless-undefined, unicorn/prefer-string-replace-all

beforeEach(() => {
  economyGates.economy = true;
  economyGates.spending = true;
  notifications.calls = [];
  notifications.fail = false;
});

describe("Black Market publication authority", () => {
  it("blocks an unopened Pack from listing when its historical revision is disabled", async () => {
    const market = new FakeMarket();
    market.state.wallets.get("seller-1")!.balance = 100n;
    const packId = market.addPack("disabled-revision-pack");
    const pack = market.state.packs.get(packId);
    if (!pack) {
      throw new Error("pack seed missing");
    }
    const revision = market.state.revisions.get(String(pack.revisionId));
    if (!revision) {
      throw new Error("revision seed missing");
    }
    revision.availability = "disabled";

    await expect(
      publishBlackMarketListing(
        market.db as never,
        "seller-1",
        publishInput([{ assetId: packId, kind: "pack" }])
      )
    ).rejects.toMatchObject({ code: "ASSET_UNAVAILABLE" });
    expect(market.state.listings).toHaveLength(0);
    expect(market.state.custody).toHaveLength(0);
  });

  it("publishes one asset with the exact ceil-five-percent fee and retained custody", async () => {
    const market = new FakeMarket();
    market.state.wallets.get("seller-1")!.balance = 6n;
    market.addCard("card-1");

    const result = await publishBlackMarketListing(
      market.db as never,
      "seller-1",
      publishInput([{ assetId: "card-1", kind: "card" }], 101n)
    );

    expect(result.listingFee).toBe("6");
    expect(market.state.listings.size).toBe(1);
    expect(market.state.custody.size).toBe(1);
    expect(market.state.wallets.get("seller-1")?.balance).toBe(0n);
    expect(market.state.transactions).toHaveLength(1);
    expect(market.state.transactions[0]?.postings).toEqual([
      { amount: -6n, walletId: "wallet-seller-1" },
      { amount: 6n, walletId: "eteris-system-sink" },
    ]);
    expect(result).not.toHaveProperty("description");
  });

  it("honors the expected wallet balance before charging the listing fee", async () => {
    const market = new FakeMarket();
    market.state.wallets.get("seller-1")!.balance = 10n;
    market.addCard("wallet-guard-card");
    const published = await publishBlackMarketListing(
      market.db as never,
      "seller-1",
      {
        ...publishInput(
          [{ assetId: "wallet-guard-card", kind: "card" }],
          101n,
          "wallet-guard"
        ),
        expectedWalletBalance: "10",
      }
    );
    expect(published.listingFee).toBe("6");

    market.addCard("stale-wallet-card");
    await expect(
      publishBlackMarketListing(market.db as never, "seller-1", {
        ...publishInput(
          [{ assetId: "stale-wallet-card", kind: "card" }],
          101n,
          "wallet-guard-stale"
        ),
        expectedWalletBalance: "10",
      })
    ).rejects.toMatchObject({ code: "STALE_VERSION" });
    expect(market.state.listings.size).toBe(1);
    expect(market.state.transactions).toHaveLength(1);
  });

  it("applies the minimum one-Eteris fee to the smallest valid price", async () => {
    const market = new FakeMarket();
    market.state.wallets.get("seller-1")!.balance = 1n;
    market.addCard("minimum-fee-card");
    const result = await publishBlackMarketListing(
      market.db as never,
      "seller-1",
      publishInput(
        [{ assetId: "minimum-fee-card", kind: "card" }],
        1n,
        "minimum-fee"
      )
    );
    expect(result.listingFee).toBe("1");
    expect(market.state.wallets.get("seller-1")?.balance).toBe(0n);
  });

  it("accepts a fresh mixed bundle of exactly fifty assets and retains every asset", async () => {
    const market = new FakeMarket();
    market.state.wallets.get("seller-1")!.balance = 50n;
    const assets: { assetId: string; kind: "card" | "pack" }[] = Array.from(
      { length: 25 },
      (_, index) => {
        const cardId = `card-${index}`;
        market.addCard(cardId, { mintNumber: index + 1 });
        return { assetId: cardId, kind: "card" };
      }
    );
    assets.push(
      ...Array.from({ length: 25 }, (_, index) => {
        const packId = `pack-${index}`;
        market.addPack(packId);
        return { assetId: packId, kind: "pack" as const };
      })
    );

    const result = await publishBlackMarketListing(
      market.db as never,
      "seller-1",
      publishInput(assets, 999n, "publish-fifty")
    );

    expect(result.listingFee).toBe("50");
    expect(market.state.custody.size).toBe(50);
    const detail = await getBlackMarketListingDetail(
      market.db as never,
      result.listingId
    );
    expect(detail?.assetCount).toBe(50);
    expect(detail?.assetKinds).toEqual(["card", "pack"]);
    expect(detail).not.toHaveProperty("sellerUserId");
  });

  it("blocks active custody and rolls back fee and listing when the fee cannot settle", async () => {
    const market = new FakeMarket();
    market.state.wallets.get("seller-1")!.balance = 10n;
    market.addCard("card-1");
    market.state.custody.set("other-custody", {
      cardInstanceId: "card-1",
      blackMarketListingId: null,
      id: "other-custody",
      packInstanceId: null,
      releasedAt: null,
    });
    await expect(
      publishBlackMarketListing(
        market.db as never,
        "seller-1",
        publishInput(
          [{ assetId: "card-1", kind: "card" }],
          100n,
          "custody-conflict"
        )
      )
    ).rejects.toMatchObject({ code: "ACTIVE_CUSTODY" });
    expect(market.state.listings.size).toBe(0);
    expect(market.state.transactions).toHaveLength(0);

    market.state.custody.clear();
    market.state.wallets.get("seller-1")!.balance = 4n;
    await expect(
      publishBlackMarketListing(
        market.db as never,
        "seller-1",
        publishInput(
          [{ assetId: "card-1", kind: "card" }],
          101n,
          "fee-rollback"
        )
      )
    ).rejects.toMatchObject({ code: "FEE_INSUFFICIENT_FUNDS" });
    expect(market.state.listings.size).toBe(0);
    expect(market.state.transactions).toHaveLength(0);
    expect(market.state.wallets.get("seller-1")?.balance).toBe(4n);
  });

  it("replays immutable terms and refuses a changed idempotency payload", async () => {
    const market = new FakeMarket();
    market.state.wallets.get("seller-1")!.balance = 10n;
    market.addCard("card-1");
    const input = publishInput(
      [{ assetId: "card-1", kind: "card" }],
      101n,
      "immutable-terms"
    );
    const first = await publishBlackMarketListing(
      market.db as never,
      "seller-1",
      input
    );
    const replay = await publishBlackMarketListing(
      market.db as never,
      "seller-1",
      input
    );
    expect(replay).toMatchObject({
      listingId: first.listingId,
      replayed: true,
      termsHash: first.termsHash,
    });
    await expect(
      publishBlackMarketListing(market.db as never, "seller-1", {
        ...input,
        askingPrice: "102",
      })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(market.state.transactions).toHaveLength(1);
  });
});

describe("Black Market terminal states", () => {
  it("cancels without refund, expires in the shared batch, and releases custody", async () => {
    const market = new FakeMarket();
    market.state.wallets.get("seller-1")!.balance = 10n;
    market.addCard("card-cancel");
    const cancelled = await publishBlackMarketListing(
      market.db as never,
      "seller-1",
      publishInput(
        [{ assetId: "card-cancel", kind: "card" }],
        100n,
        "cancel-publish"
      )
    );
    await cancelBlackMarketListing(market.db as never, "seller-1", {
      idempotencyKey: "cancel-action",
      listingId: cancelled.listingId,
      now: market.now,
    });
    expect(market.state.listings.get(cancelled.listingId)?.state).toBe(
      "cancelled"
    );
    expect(market.state.wallets.get("seller-1")?.balance).toBe(5n);
    expect([...market.state.custody.values()][0]?.releaseKind).toBe(
      "cancelled"
    );

    market.addCard("card-expired");
    const publishedAt = new Date(
      market.now.getTime() - 31 * 24 * 60 * 60 * 1000
    );
    market.seedListing({
      askingPrice: 10n,
      assets: [{ assetId: "card-expired", kind: "card" }],
      id: "expired-listing",
      publishedAt,
    });
    const batch = await expireBlackMarketListingsBatch(market.db as never, {
      now: market.now,
      limit: 10,
    });
    expect(batch).toMatchObject({
      checked: 1,
      expired: 1,
      listingIds: ["expired-listing"],
    });
    expect(market.state.listings.get("expired-listing")?.state).toBe("expired");
    expect(
      [...market.state.custody.values()].find(
        (row) => row.blackMarketListingId === "expired-listing"
      )?.releaseKind
    ).toBe("expired");
  });

  it("reverses a compliant admin cancellation once and never reverses policy cancellation", async () => {
    const market = new FakeMarket();
    market.state.wallets.get("seller-1")!.balance = 10n;
    market.addCard("card-compliant");
    const compliant = await publishBlackMarketListing(
      market.db as never,
      "seller-1",
      publishInput(
        [{ assetId: "card-compliant", kind: "card" }],
        100n,
        "admin-publish"
      )
    );
    const first = await administrativelyCancelBlackMarketListing(
      market.db as never,
      "admin-1",
      {
        compliant: true,
        idempotencyKey: "admin-compliant",
        listingId: compliant.listingId,
        reason: "Corrección conforme",
      }
    );
    const second = await administrativelyCancelBlackMarketListing(
      market.db as never,
      "admin-1",
      {
        compliant: true,
        idempotencyKey: "admin-compliant",
        listingId: compliant.listingId,
        reason: "Corrección conforme",
      }
    );
    expect(first.version).toBe(2);
    expect(second.replayed).toBe(true);
    expect(market.state.wallets.get("seller-1")?.balance).toBe(10n);
    expect(
      market.state.transactions.filter((row) =>
        String(row.idempotencyKey).includes("fee-reversal")
      )
    ).toHaveLength(1);

    market.addCard("card-policy");
    const policy = await publishBlackMarketListing(
      market.db as never,
      "seller-1",
      publishInput(
        [{ assetId: "card-policy", kind: "card" }],
        100n,
        "policy-publish"
      )
    );
    await administrativelyCancelBlackMarketListing(
      market.db as never,
      "admin-1",
      {
        idempotencyKey: "admin-policy",
        listingId: policy.listingId,
        policyViolation: true,
        reason: "Infracción",
      }
    );
    expect(
      market.state.listings.get(policy.listingId)?.feeReversalTransactionId
    ).toBeNull();
  });

  it("reverses a compliant platform cancellation fee exactly once without selling the asset", async () => {
    const market = new FakeMarket();
    market.state.wallets.get("seller-1")!.balance = 10n;
    market.addCard("card-closure");
    const listing = await publishBlackMarketListing(
      market.db as never,
      "seller-1",
      publishInput(
        [{ assetId: "card-closure", kind: "card" }],
        100n,
        "closure-publish"
      )
    );

    const first = await administrativelyCancelBlackMarketListingInTransaction(
      market.db as never,
      "admin-1",
      listing.listingId,
      "Congelación conforme del activo",
      `freeze-release:listing:${listing.listingId}`,
      market.now,
      undefined,
      true
    );
    const second = await administrativelyCancelBlackMarketListingInTransaction(
      market.db as never,
      "admin-1",
      listing.listingId,
      "Congelación conforme del activo",
      `freeze-release:listing:${listing.listingId}`,
      market.now,
      undefined,
      true
    );

    expect(first.state).toBe("administratively-cancelled");
    expect(second.replayed).toBe(true);
    expect(market.state.sales.size).toBe(0);
    expect(market.state.cards.get("card-closure")?.ownerUserId).toBe(
      "seller-1"
    );
    expect(
      market.state.transactions.filter((row) =>
        String(row.idempotencyKey).includes("fee-reversal")
      )
    ).toHaveLength(1);
  });
});

describe("Black Market purchase authority", () => {
  async function publishedSale(
    market: FakeMarket,
    id = "sale-listing",
    price = 100n
  ) {
    market.state.wallets.get("seller-1")!.balance = 10n;
    const cardId = `${id}-card`;
    market.addCard(cardId);
    const result = await publishBlackMarketListing(
      market.db as never,
      "seller-1",
      publishInput([{ assetId: cardId, kind: "card" }], price, `${id}-publish`)
    );
    return { cardId, result };
  }

  it.each([
    ["economy", { economy: false, spending: true }],
    ["spending", { economy: true, spending: false }],
  ] as const)(
    "rejects purchases while the %s gate is disabled without changing settlement state",
    async (_gate, disabledGates) => {
      const market = new FakeMarket();
      const { cardId, result } = await publishedSale(
        market,
        `disabled-${_gate}`,
        100n
      );
      const buyerBalance = market.state.wallets.get("buyer-1")!.balance;
      const sellerBalance = market.state.wallets.get("seller-1")!.balance;
      const transactionCount = market.state.transactions.length;
      Object.assign(economyGates, disabledGates);

      await expect(
        purchaseBlackMarketListing(market.db as never, "buyer-1", {
          expectedPrice: "100",
          expectedVersion: result.version,
          idempotencyKey: `disabled-${_gate}-purchase`,
          listingId: result.listingId,
        })
      ).rejects.toMatchObject({ code: "POLICY_BLOCKED" });

      expect(market.state.wallets.get("buyer-1")?.balance).toBe(buyerBalance);
      expect(market.state.wallets.get("seller-1")?.balance).toBe(sellerBalance);
      expect(market.state.transactions).toHaveLength(transactionCount);
      expect(market.state.listings.get(result.listingId)?.state).toBe("active");
      expect(market.state.sales.size).toBe(0);
      expect(market.state.cards.get(cardId)?.ownerUserId).toBe("seller-1");
    }
  );

  it("settles an atomic mixed bundle at the expected price with full proceeds and no commission", async () => {
    const market = new FakeMarket();
    const cardId = market.addCard("bundle-card");
    const packId = market.addPack("bundle-pack");
    market.state.wallets.get("seller-1")!.balance = 20n;
    const listing = await publishBlackMarketListing(
      market.db as never,
      "seller-1",
      publishInput(
        [
          { assetId: cardId, kind: "card" },
          { assetId: packId, kind: "pack" },
        ],
        200n,
        "bundle-publish"
      )
    );
    const buyerBefore = market.state.wallets.get("buyer-1")!.balance;
    market.lockOrder = [];
    const purchase = await purchaseBlackMarketListing(
      market.db as never,
      "buyer-1",
      {
        expectedPrice: "200",
        expectedVersion: listing.version,
        idempotencyKey: "bundle-buy",
        listingId: listing.listingId,
      }
    );
    expect(market.lockOrder).toEqual(["pack-instance", "card-instance"]);
    expect(purchase.transferredAssetIds).toHaveLength(2);
    expect(market.state.wallets.get("buyer-1")?.balance).toBe(
      buyerBefore - 200n
    );
    expect(market.state.wallets.get("seller-1")?.balance).toBe(10n + 200n);
    expect(
      market.state.transactions.find(
        (row) => row.idempotencyKey === "market-sale:bundle-buy"
      )?.postings
    ).toEqual([
      { amount: -200n, walletId: "wallet-buyer-1" },
      { amount: 200n, walletId: "wallet-seller-1" },
    ]);
    expect(
      market.state.transactions.some((row) =>
        String(row.idempotencyKey).includes("commission")
      )
    ).toBe(false);
    expect(market.state.listings.get(listing.listingId)?.state).toBe("sold");
    expect(market.state.sales.size).toBe(1);
    expect(market.ownershipEvents).toHaveLength(2);
    const sale = [...market.state.sales.values()][0]!;
    expect(sale).toMatchObject({
      askingPrice: 200n,
      buyerUserId: "buyer-1",
      eterisTransactionId: "eteris-2",
      listingId: listing.listingId,
      sellerUserId: "seller-1",
    });
    expect(
      market.ownershipEvents.every(
        (event) =>
          event.sourceType === "black-market.sale" &&
          event.sourceReference === sale.id
      )
    ).toBe(true);
    expect(
      [...market.state.custody.values()].every(
        (row) => row.releaseKind === "sold"
      )
    ).toBe(true);
  });

  it("rejects self, stale version/price, and insufficient funds without state changes", async () => {
    const market = new FakeMarket();
    const { result } = await publishedSale(market, "guards", 100n);
    await expect(
      purchaseBlackMarketListing(market.db as never, "seller-1", {
        expectedPrice: "100",
        expectedVersion: 1,
        idempotencyKey: "self-buy-01",
        listingId: result.listingId,
      })
    ).rejects.toMatchObject({ code: "SELF_PURCHASE" });
    await expect(
      purchaseBlackMarketListing(market.db as never, "buyer-1", {
        expectedPrice: "100",
        expectedVersion: 2,
        idempotencyKey: "stale-version",
        listingId: result.listingId,
      })
    ).rejects.toMatchObject({ code: "STALE_VERSION" });
    await expect(
      purchaseBlackMarketListing(market.db as never, "buyer-1", {
        expectedPrice: "101",
        expectedVersion: result.version,
        idempotencyKey: "stale-price",
        listingId: result.listingId,
      })
    ).rejects.toMatchObject({ code: "STALE_PRICE" });
    market.state.wallets.get("buyer-1")!.balance = 1n;
    await expect(
      purchaseBlackMarketListing(market.db as never, "buyer-1", {
        expectedPrice: "100",
        expectedVersion: result.version,
        idempotencyKey: "insufficient",
        listingId: result.listingId,
      })
    ).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
    expect(market.state.listings.get(result.listingId)?.state).toBe("active");
    expect(market.state.sales.size).toBe(0);

    const staleCustody = new FakeMarket();
    const stale = await publishedSale(staleCustody, "stale-custody", 100n);
    const staleCustodyRow = [...staleCustody.state.custody.values()][0]!;
    staleCustodyRow.releasedAt = staleCustody.now;
    const staleBuyerBalance =
      staleCustody.state.wallets.get("buyer-1")!.balance;
    await expect(
      purchaseBlackMarketListing(staleCustody.db as never, "buyer-1", {
        expectedPrice: "100",
        expectedVersion: stale.result.version,
        idempotencyKey: "stale-custody-buy",
        listingId: stale.result.listingId,
      })
    ).rejects.toMatchObject({ code: "LISTING_CHANGED" });
    expect(staleCustody.state.sales.size).toBe(0);
    expect(staleCustody.state.wallets.get("buyer-1")?.balance).toBe(
      staleBuyerBalance
    );

    const ineligible = new FakeMarket();
    const ineligibleSale = await publishedSale(ineligible, "ineligible", 100n);
    ineligible.state.users.get("seller-1")!.emailVerified = false;
    await expect(
      purchaseBlackMarketListing(ineligible.db as never, "buyer-1", {
        expectedPrice: "100",
        expectedVersion: ineligibleSale.result.version,
        idempotencyKey: "ineligible-buy",
        listingId: ineligibleSale.result.listingId,
      })
    ).rejects.toMatchObject({ code: "ACCOUNT_INELIGIBLE" });
    expect(ineligible.state.sales.size).toBe(0);
  });

  it("rolls back wallets, sale, ownership, and custody when transfer fails", async () => {
    const market = new FakeMarket();
    const { cardId, result } = await publishedSale(market, "rollback", 100n);
    const buyerBalance = market.state.wallets.get("buyer-1")!.balance;
    market.failTransfer = true;
    await expect(
      purchaseBlackMarketListing(market.db as never, "buyer-1", {
        expectedPrice: "100",
        expectedVersion: result.version,
        idempotencyKey: "rollback-buy",
        listingId: result.listingId,
      })
    ).rejects.toMatchObject({ code: "OWNERSHIP_CHANGED" });
    expect(market.state.wallets.get("buyer-1")?.balance).toBe(buyerBalance);
    expect(market.state.sales.size).toBe(0);
    expect(market.state.listings.get(result.listingId)?.state).toBe("active");
    expect(market.state.cards.get(cardId)?.ownerUserId).toBe("seller-1");
    expect(
      [...market.state.custody.values()].every((row) => row.releasedAt === null)
    ).toBe(true);
  });

  it("replays matching purchases and allows only one concurrent buyer to win", async () => {
    const market = new FakeMarket();
    const { result } = await publishedSale(market, "replay", 100n);
    const input = {
      expectedPrice: "100",
      expectedVersion: result.version,
      idempotencyKey: "same-buy-01",
      listingId: result.listingId,
    } as const;
    const first = await purchaseBlackMarketListing(
      market.db as never,
      "buyer-1",
      input
    );
    const replay = await purchaseBlackMarketListing(
      market.db as never,
      "buyer-1",
      input
    );
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    // The ledger key is domain-scoped so one caller key cannot collide with
    // other globally-unique idempotency domains.
    expect(
      market.state.transactions.filter(
        (row) => row.idempotencyKey === `market-sale:${input.idempotencyKey}`
      )
    ).toHaveLength(1);
    expect(market.state.sales.size).toBe(1);
    await expect(
      purchaseBlackMarketListing(market.db as never, "buyer-1", {
        ...input,
        expectedPrice: "101",
      })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });

    const concurrent = new FakeMarket();
    const seeded = await publishedSale(concurrent, "parallel", 100n);
    const outcomes = await Promise.allSettled([
      purchaseBlackMarketListing(concurrent.db as never, "buyer-1", {
        ...input,
        idempotencyKey: "parallel-one",
        listingId: seeded.result.listingId,
      }),
      purchaseBlackMarketListing(concurrent.db as never, "buyer-2", {
        ...input,
        idempotencyKey: "parallel-two",
        listingId: seeded.result.listingId,
      }),
    ]);
    expect(
      outcomes.filter((entry) => entry.status === "fulfilled")
    ).toHaveLength(1);
    expect(
      outcomes.filter((entry) => entry.status === "rejected")
    ).toHaveLength(1);
    expect(concurrent.state.sales.size).toBe(1);
  });
});

describe("Black Market search, history, and projections", () => {
  // Lazy expiry and active-listing projections compare against wall-clock
  // time; pin it to the harness clock so seeded listings never age out as
  // real time advances past their fixture expiry dates.
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-08-01T00:00:00.000Z") });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function searchSeed() {
    const market = new FakeMarket();
    market.addCard("samus-card", {
      character: "Samus",
      mintNumber: 1,
      rarity: "rare",
    });
    market.addCard("link-card", {
      character: "Link",
      mintNumber: 2,
      rarity: "common",
    });
    market.addPack("prime-pack", "Prime Pack");
    market.seedListing({
      askingPrice: 10n,
      assets: [{ assetId: "samus-card", kind: "card" }],
      id: "single-samus",
      publishedAt: new Date("2026-07-20T00:00:00.000Z"),
    });
    market.seedListing({
      askingPrice: 20n,
      assets: [
        { assetId: "samus-card", kind: "card" },
        { assetId: "prime-pack", kind: "pack" },
      ],
      id: "bundle-samus",
      publishedAt: new Date("2026-07-21T00:00:00.000Z"),
    });
    market.seedListing({
      askingPrice: 30n,
      assets: [{ assetId: "link-card", kind: "card" }],
      id: "single-link",
      publishedAt: new Date("2026-07-22T00:00:00.000Z"),
    });
    return market;
  }

  it("matches every listed filter and any item in a mixed bundle", async () => {
    const market = searchSeed();
    const cases = [
      [{ assetKind: "pack" as const }, ["bundle-samus"]],
      [{ bundleStatus: "bundle" as const }, ["bundle-samus"]],
      [{ bundleStatus: "single" as const }, ["single-link", "single-samus"]],
      [{ character: "Samus" }, ["bundle-samus", "single-samus"]],
      [{ edition: "First" }, ["bundle-samus", "single-link", "single-samus"]],
      [
        { gameName: "metroid" },
        ["bundle-samus", "single-link", "single-samus"],
      ],
      [{ limited: true }, ["bundle-samus", "single-link", "single-samus"]],
      [{ maxPrice: "20" }, ["bundle-samus", "single-samus"]],
      [{ minPrice: "20" }, ["bundle-samus", "single-link"]],
      [{ mintNumber: 1 }, ["bundle-samus", "single-samus"]],
      [{ rarity: "common" }, ["single-link"]],
      [{ search: "pack" }, ["bundle-samus"]],
      [{ series: "Prime" }, ["bundle-samus", "single-link", "single-samus"]],
      [{ seriesId: "series-link-card" }, ["single-link"]],
    ] as const;
    for (const [filter, expected] of cases) {
      const result = await searchListingsWithInput(market, filter);
      expect(result.items.map((item) => item.id).toSorted()).toEqual(
        [...expected].toSorted()
      );
    }
    expect(market.searchQueryCount).toBe(cases.length);
    expect(market.searchQueryLimits).toEqual(
      Array.from({ length: cases.length }, () => 21)
    );
    expect(market.searchAssetQueryCount).toBe(0);
  });

  it("sorts newest, price, rarity, and mint with a stable cursor and private bounded output", async () => {
    const market = searchSeed();
    for (const sort of ["newest", "price", "rarity", "mint"] as const) {
      const first = await searchListingsWithInput(market, {
        limit: 1,
        sort,
      });
      const second = await searchListingsWithInput(market, {
        cursor: first.nextCursor ?? undefined,
        limit: 10,
        sort,
      });
      expect(first.items).toHaveLength(1);
      expect(second.items.map((item) => item.id)).not.toContain(
        first.items[0]?.id
      );
      expect(first.items[0]).not.toHaveProperty("sellerUserId");
      expect(first.items[0]).not.toHaveProperty("walletId");
      expect(first.items[0]).not.toHaveProperty("description");
    }
    const rarityFirst = await searchListingsWithInput(market, {
      limit: 2,
      sort: "rarity",
    });
    const raritySecond = await searchListingsWithInput(market, {
      cursor: rarityFirst.nextCursor ?? undefined,
      limit: 2,
      sort: "rarity",
    });
    expect(rarityFirst.items.map(({ id }) => id)).toEqual([
      "single-link",
      "bundle-samus",
    ]);
    expect(raritySecond.items.map(({ id }) => id)).toEqual(["single-samus"]);

    const mintFirst = await searchListingsWithInput(market, {
      limit: 2,
      sort: "mint",
    });
    const mintSecond = await searchListingsWithInput(market, {
      cursor: mintFirst.nextCursor ?? undefined,
      limit: 2,
      sort: "mint",
    });
    expect(mintFirst.items.map(({ id }) => id)).toEqual([
      "bundle-samus",
      "single-samus",
    ]);
    expect(mintSecond.items.map(({ id }) => id)).toEqual(["single-link"]);
    const detail = await getBlackMarketListingDetail(
      market.db as never,
      "bundle-samus"
    );
    expect(detail).toMatchObject({ termsImmutable: true, assetCount: 2 });
    expect(detail).not.toHaveProperty("sellerUserId");
    expect(detail).not.toHaveProperty("description");
  });

  it("uses one bounded keyset page query for every sort and carries its tie-break predicate", async () => {
    const market = searchSeed();
    for (const sort of ["newest", "price", "rarity", "mint"] as const) {
      const first = await searchListingsWithInput(market, {
        limit: 1,
        sort,
      });
      await searchListingsWithInput(market, {
        cursor: first.nextCursor ?? undefined,
        limit: 1,
        sort,
      });
    }

    expect(market.searchQueryCount).toBe(8);
    expect(market.searchQueryLimits).toEqual(
      Array.from({ length: 8 }, () => 2)
    );
    for (const condition of market.searchQueryConditions.filter(
      (_value, index) => index % 2 === 1
    )) {
      expect(condition.join(" ")).toMatch(/[<>]/);
      expect(condition.join(" ")).toContain("or");
    }
  });

  it("keeps filtered pages bounded and applies any-item bundle matching before pagination", async () => {
    const market = searchSeed();
    const first = await searchListingsWithInput(market, {
      assetKind: "card",
      limit: 1,
      sort: "price",
    });
    const second = await searchListingsWithInput(market, {
      assetKind: "card",
      cursor: first.nextCursor ?? undefined,
      limit: 1,
      sort: "price",
    });

    expect(first.items.map(({ id }) => id)).toEqual(["single-samus"]);
    expect(second.items.map(({ id }) => id)).toEqual(["bundle-samus"]);
    expect(market.searchQueryLimits.slice(-2)).toEqual([2, 2]);
    expect(market.searchQueryCount).toBe(2);
    expect(market.searchAssetQueryCount).toBe(0);
  });

  it("returns anonymized bounded template history and eligible unsold assets", async () => {
    const market = searchSeed();
    market.state.sales.set("sale-history", {
      askingPrice: 42n,
      buyerUserId: "buyer-1",
      createdAt: new Date("2026-07-25T00:00:00.000Z"),
      eterisTransactionId: "tx-history",
      id: "sale-history",
      listingId: "single-samus",
      sellerUserId: "seller-1",
    });
    market.state.sales.set("sale-history-2", {
      askingPrice: 40n,
      buyerUserId: "buyer-2",
      createdAt: new Date("2026-07-24T00:00:00.000Z"),
      eterisTransactionId: "tx-history-2",
      id: "sale-history-2",
      listingId: "single-samus",
      sellerUserId: "seller-1",
    });
    const history = await getBlackMarketSaleHistory(market.db as never, {
      cardTemplateId: "template-samus-card",
      limit: 1,
    });
    expect(history.items).toEqual([
      { price: "42", soldAt: new Date("2026-07-25T00:00:00.000Z") },
    ]);
    expect(history.items[0]).not.toHaveProperty("buyerUserId");
    expect(history.nextCursor).not.toContain("sale-history");
    market.state.listings.get("single-link")!.state = "cancelled";
    const releasedLinkCustody = market.state.custody.get(
      "custody-single-link-link-card"
    );
    releasedLinkCustody!.releasedAt = market.now;
    releasedLinkCustody!.releaseKind = "cancelled";
    const eligible = await listEligibleBlackMarketAssets(
      market.db as never,
      "seller-1"
    );
    expect(eligible.cards.map((card) => card.id)).toEqual(["link-card"]);
    expect(eligible.packs).toEqual([]);
  });

  it("excludes stale listings from public search results without running the bulk sweep on read", async () => {
    const market = searchSeed();
    const stale = market.state.listings.get("single-link")!;
    stale.expiresAt = new Date("2026-07-23T00:00:00.000Z");
    const result = await searchListingsWithInput(market, {
      limit: 50,
    });
    expect(result.items.map(({ id }) => id)).toEqual([
      "bundle-samus",
      "single-samus",
    ]);
    // Reads no longer expire globally; only the cron or the record being read
    // transitions it.
    expect(market.state.listings.get("single-link")?.state).toBe("active");
    const batch = await expireBlackMarketListingsBatch(market.db as never);
    expect(batch.listingIds).toEqual(["single-link"]);
    expect(market.state.listings.get("single-link")?.state).toBe("expired");
  });

  it("projects active En venta links for mixed bundles and removes them after cancellation", async () => {
    const market = searchSeed();
    const active = await resolveActiveBlackMarketSales(market.db as never, {
      assetIds: ["samus-card"],
      assetKind: "card",
    });
    expect(active.get("samus-card")).toEqual({
      isBundle: true,
      listingId: "bundle-samus",
      listingUrl: "/cards/black-market/bundle-samus",
    });
    const packActive = await resolveActiveBlackMarketSales(market.db as never, {
      assetIds: ["prime-pack"],
      assetKind: "pack",
    });
    expect(packActive.get("prime-pack")?.isBundle).toBe(true);
    await cancelBlackMarketListing(market.db as never, "seller-1", {
      idempotencyKey: "projection-cancel",
      listingId: "bundle-samus",
    });
    expect(market.state.listings.get("single-samus")?.state).toBe("active");
    const remainingPack = await resolveActiveBlackMarketSales(
      market.db as never,
      {
        assetIds: ["prime-pack"],
        assetKind: "pack",
      }
    );
    expect(remainingPack.has("prime-pack")).toBe(false);
    const remainingCard = await resolveActiveBlackMarketSales(
      market.db as never,
      {
        assetIds: ["samus-card"],
        assetKind: "card",
      }
    );
    expect(remainingCard.get("samus-card")?.listingId).toBe("single-samus");
  });
});

describe("Black Market review and notification boundaries", () => {
  it("keeps a committed sale when participant notifications are unavailable", async () => {
    const market = new FakeMarket();
    market.state.wallets.get("seller-1")!.balance = 10n;
    market.addCard("notification-failure-card");
    const listing = await publishBlackMarketListing(
      market.db as never,
      "seller-1",
      publishInput(
        [{ assetId: "notification-failure-card", kind: "card" }],
        100n,
        "notification-failure-publish"
      )
    );
    notifications.fail = true;
    const sale = await purchaseBlackMarketListing(
      market.db as never,
      "buyer-1",
      {
        expectedPrice: "100",
        expectedVersion: listing.version,
        idempotencyKey: "notification-failure-buy",
        listingId: listing.listingId,
      }
    );
    expect(sale.state).toBe("sold");
    expect(market.state.sales.size).toBe(1);
    expect(market.state.transactions).toHaveLength(2);
    expect(notifications.calls).toHaveLength(0);
  });

  it("notifies both sale participants and excludes outsiders", async () => {
    const market = new FakeMarket();
    market.seedListing({
      askingPrice: 10n,
      assets: [],
      id: "notification-listing",
    });
    market.state.sales.set("sale-1", {
      buyerUserId: "buyer-1",
      id: "sale-1",
      listingId: "notification-listing",
    });
    await notifyBlackMarketParticipants(market.db as never, {
      actorUserId: "buyer-1",
      kind: "sold",
      listingId: "notification-listing",
      saleId: "sale-1",
      state: "sold",
    });
    // A completed purchase reaches buyer AND seller; the actor is not
    // excluded from a sale they took part in. Outsiders get nothing.
    expect(notifications.calls).toHaveLength(2);
    const targets = notifications.calls.map(
      (call: { targetUserId?: string }) => call.targetUserId
    );
    expect(targets).toContain("buyer-1");
    expect(targets).toContain("seller-1");
    expect(targets).not.toContain("outsider-1");
  });

  it("notifies the seller when a listing expires under a system actor", async () => {
    const market = new FakeMarket();
    market.seedListing({
      askingPrice: 10n,
      assets: [],
      id: "expiry-notification-listing",
    });
    await notifyBlackMarketParticipants(market.db as never, {
      actorUserId: null,
      kind: "expired",
      listingId: "expiry-notification-listing",
      state: "expired",
    });
    expect(notifications.calls).toHaveLength(1);
    expect(notifications.calls[0]?.targetUserId).toBe("seller-1");
  });

  it("stores structured risk signals without performing a reversal", async () => {
    const market = new FakeMarket();
    const ids = await recordBlackMarketRiskSignals(market.db as never, {
      listingId: "listing-1",
      saleId: "sale-1",
      signals: [
        {
          metadata: { observedTransfers: 3 },
          severity: "medium",
          signal: "repeated-transfers",
        },
      ],
      subjectUserId: "seller-1",
    });
    expect(ids).toHaveLength(1);
    expect(market.state.riskSignals[0]).toMatchObject({
      listingId: "listing-1",
      saleId: "sale-1",
      severity: "medium",
      signal: "repeated-transfers",
      subjectUserId: "seller-1",
    });
    expect(market.state.listings.get("listing-1")).toBeUndefined();
  });

  describe("risk signal detection", () => {
    // Query results are consumed in detector call order:
    // reciprocal, repeated-transfers (per kind), rapid-relisting (per kind).
    function detectorDb(queue: unknown[][]) {
      const make = () => {
        const chain: Record<string, unknown> = {};
        const resolveNext = () => Promise.resolve(queue.shift() ?? []);
        for (const step of ["from", "innerJoin", "where", "groupBy"]) {
          chain[step] = vi.fn(() => chain);
        }
        chain.limit = vi.fn(resolveNext);
        chain.having = vi.fn(resolveNext);
        return chain;
      };
      return { select: vi.fn(() => make()) };
    }

    const base = {
      buyerUserId: "buyer-1",
      publishedAt: new Date("2026-08-01T00:00:00.000Z"),
      sellerUserId: "seller-1",
      transferredAssets: [{ assetId: "card-1", kind: "card" as const }],
    };

    it("flags an extreme price relative to the configured ceiling", async () => {
      const db = detectorDb([[], [], [], [], []]);
      const high = await detectBlackMarketSaleRiskSignals(db as never, {
        ...base,
        askingPrice: BLACK_MARKET_MAX_PRICE,
        transferredAssets: [],
      });
      expect(high).toEqual([{ severity: "high", signal: "extreme-price" }]);
    });

    it("detects reciprocal activity, repeated transfers, and rapid relisting", async () => {
      const db = detectorDb([
        [{ id: "prior-sale" }], // reciprocal prior reverse-direction sale
        [{ assetId: "card-1" }], // repeated transfers (cards)
        [], // repeated transfers (packs) — none
        [], // rapid relisting (cards)
        [], // rapid relisting (packs)
      ]);
      const signals = await detectBlackMarketSaleRiskSignals(db as never, {
        ...base,
        askingPrice: 100n,
      });
      expect(signals.map(({ signal }) => signal)).toEqual([
        "reciprocal-activity",
        "repeated-transfers",
      ]);
    });

    it("returns no signals for an ordinary sale", async () => {
      const db = detectorDb([[], [], [], [], []]);
      const signals = await detectBlackMarketSaleRiskSignals(db as never, {
        ...base,
        askingPrice: 100n,
      });
      expect(signals).toEqual([]);
    });
  });

  describe("retryBlackMarketListingNotification", () => {
    function listingDb(queuedRows: unknown[][]) {
      const make = () => {
        const chain: Record<string, unknown> = {};
        const resolveNext = () => Promise.resolve(queuedRows.shift() ?? []);
        for (const step of ["from", "where"]) {
          chain[step] = vi.fn(() => chain);
        }
        chain.limit = vi.fn(resolveNext);
        return chain;
      };
      return { select: vi.fn(() => make()) };
    }

    it("redelivers a sold notification to both participants without an actor", async () => {
      notifications.calls = [];
      const db = listingDb([
        [{ id: "listing-1", sellerUserId: "seller-1", state: "sold" }],
        [{ buyerUserId: "buyer-1", id: "sale-1" }],
        // notifyBlackMarketParticipants re-reads the listing and the sale.
        [{ sellerUserId: "seller-1" }],
        [{ buyerUserId: "buyer-1" }],
      ]);
      const delivered = await retryBlackMarketListingNotification(
        db as never,
        "buyer-1",
        "listing-1"
      );
      expect(delivered.toSorted()).toEqual(["buyer-1", "seller-1"]);
      expect(notifications.calls).toHaveLength(2);
    });

    it("rejects outsiders with LISTING_NOT_FOUND semantics", async () => {
      notifications.calls = [];
      const db = listingDb([
        [{ id: "listing-1", sellerUserId: "seller-1", state: "active" }],
        [],
      ]);
      await expect(
        retryBlackMarketListingNotification(
          db as never,
          "outsider-1",
          "listing-1"
        )
      ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
      expect(notifications.calls).toHaveLength(0);
    });

    it("reports a missing listing as LISTING_NOT_FOUND", async () => {
      const db = listingDb([[]]);
      await expect(
        retryBlackMarketListingNotification(db as never, "buyer-1", "missing")
      ).rejects.toMatchObject({ code: "LISTING_NOT_FOUND" });
    });
  });
});
