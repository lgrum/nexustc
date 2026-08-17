import {
  cardInstance,
  cardTemplate,
  collectibleCustody,
  collectibleOwnershipEvent,
  packInstance,
  packRevision,
  profileSettings,
  tradeOffer,
  tradeOfferHistory,
  user,
  userBlock,
  eterisWallet,
} from "@repo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  acceptTradeOffer as acceptTradeOfferCommand,
  cancelTradeOffer as cancelTradeOfferCommand,
  counterOfferTradeOffer,
  expireCollectibleTradeOffersBatch,
  listTradeOffers,
  rejectTradeOffer as rejectTradeOfferCommand,
  sendTradeOffer as sendTradeOfferCommand,
  blockTradeUser,
  updateInboundTradePreference,
  TRADE_OFFER_EXPIRY_MS,
  TradeOfferError,
} from "./trade-offer";

const notification = vi.hoisted(() => ({
  createUserNotification: vi.fn(
    (_db: unknown, _input: Record<string, unknown>) =>
      Promise.resolve({ id: "notice-1" })
  ),
}));

vi.mock("@repo/env", () => ({
  env: {
    COLLECTIBLES_ENABLED: true,
    DATABASE_URL: "postgres://trade-test.invalid/trade-test",
    REDIS_URL: "redis://trade-test.invalid",
  },
}));
vi.mock("./notification", () => notification);

type TradeDatabase = Parameters<typeof sendTradeOfferCommand>[0];

function sendTradeOffer(
  database: TradeDatabaseHarness,
  proposerUserId: string,
  commandInput: Parameters<typeof sendTradeOfferCommand>[2]
) {
  return sendTradeOfferCommand(
    database as unknown as TradeDatabase,
    proposerUserId,
    commandInput
  );
}

type TradeActionInput = Parameters<typeof acceptTradeOfferCommand>[2];

function acceptTradeOffer(
  database: TradeDatabaseHarness,
  actorUserId: string,
  commandInput: TradeActionInput
) {
  return acceptTradeOfferCommand(
    database as unknown as TradeDatabase,
    actorUserId,
    commandInput
  );
}

function cancelTradeOffer(
  database: TradeDatabaseHarness,
  actorUserId: string,
  commandInput: TradeActionInput
) {
  return cancelTradeOfferCommand(
    database as unknown as TradeDatabase,
    actorUserId,
    commandInput
  );
}

function rejectTradeOffer(
  database: TradeDatabaseHarness,
  actorUserId: string,
  commandInput: TradeActionInput
) {
  return rejectTradeOfferCommand(
    database as unknown as TradeDatabase,
    actorUserId,
    commandInput
  );
}

type CounterOfferInput = Parameters<typeof counterOfferTradeOffer>[2];

function counterOffer(
  database: TradeDatabaseHarness,
  actorUserId: string,
  commandInput: CounterOfferInput
) {
  return counterOfferTradeOffer(
    database as unknown as TradeDatabase,
    actorUserId,
    commandInput
  );
}

type TradeAsset = {
  assetId: string;
  kind: "card" | "pack";
};

type FakeState = {
  blocks: Record<string, unknown>[];
  cards: Record<string, unknown>[];
  custody: Record<string, unknown>[];
  events: Record<string, unknown>[];
  failOnHistoryInsert: boolean;
  histories: Record<string, unknown>[];
  offers: Record<string, unknown>[];
  packs: Record<string, unknown>[];
  profileSettings: Record<string, unknown>[];
  revisionAvailability: "active" | "disabled";
};

function tableName(table: unknown) {
  if (!table || typeof table !== "object") {
    return null;
  }
  const symbol = Object.getOwnPropertySymbols(table).find(
    (candidate) => String(candidate) === "Symbol(drizzle:Name)"
  );
  return symbol ? (table as Record<PropertyKey, unknown>)[symbol] : null;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function conditionParams(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value.flatMap(conditionParams);
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  if (
    (value as { constructor?: { name?: string } }).constructor?.name === "Param"
  ) {
    return [(value as { value: unknown }).value];
  }
  const chunks = (value as { queryChunks?: unknown[] }).queryChunks;
  return chunks ? chunks.flatMap(conditionParams) : [];
}

type ColumnParamPair = {
  column: string;
  value: unknown;
};

function queryChunks(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const chunks = (value as { queryChunks?: unknown[] }).queryChunks;
  return Array.isArray(chunks) ? chunks : null;
}

function isColumnChunk(value: unknown): value is { name: string } {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as { name?: unknown }).name === "string" &&
    "table" in value
  );
}

function isParamChunk(value: unknown): value is { value: unknown } {
  return Boolean(
    value &&
    typeof value === "object" &&
    (value as { constructor?: { name?: string } }).constructor?.name === "Param"
  );
}

function columnParamPairs(value: unknown): ColumnParamPair[] {
  if (Array.isArray(value)) {
    return value.flatMap(columnParamPairs);
  }
  const chunks = queryChunks(value);
  if (!chunks) {
    return [];
  }
  const column = chunks.find(isColumnChunk);
  const parameter = chunks.find(isParamChunk);
  const directPair =
    column && parameter
      ? [{ column: column.name, value: parameter.value }]
      : [];
  return [...directPair, ...chunks.flatMap(columnParamPairs)];
}

function orderSpec(value: unknown) {
  const chunks = queryChunks(value);
  if (!chunks) {
    return null;
  }
  const column = chunks.find(isColumnChunk);
  if (!column) {
    return null;
  }
  const direction = chunks
    .map((chunk) => {
      if (!chunk || typeof chunk !== "object") {
        return "";
      }
      const { value: chunkValue } = chunk as { value?: unknown };
      return Array.isArray(chunkValue)
        ? chunkValue
            .filter((part): part is string => typeof part === "string")
            .join("")
        : "";
    })
    .join("")
    .includes(" desc")
    ? "desc"
    : "asc";
  return { column: column.name, direction } as const;
}

type TradeOrderSpec = {
  column: string;
  direction: "asc" | "desc";
};

function compareTradeValues(left: unknown, right: unknown) {
  const leftValue = left instanceof Date ? left.getTime() : left;
  const rightValue = right instanceof Date ? right.getTime() : right;
  if (leftValue === rightValue) {
    return 0;
  }
  if (typeof leftValue === "number" && typeof rightValue === "number") {
    return leftValue < rightValue ? -1 : 1;
  }
  return String(leftValue).localeCompare(String(rightValue));
}

function sortTradeRows(rows: Record<string, unknown>[], orderBy: unknown[]) {
  const specs = orderBy
    .map(orderSpec)
    .filter((value): value is TradeOrderSpec => value !== null);
  return rows.toSorted((left, right) => {
    for (const spec of specs) {
      const camelColumn =
        spec.column === "expires_at"
          ? "expiresAt"
          : spec.column === "sent_at"
            ? "sentAt"
            : spec.column;
      const comparison = compareTradeValues(
        left[camelColumn],
        right[camelColumn]
      );
      if (comparison !== 0) {
        return spec.direction === "desc" ? -comparison : comparison;
      }
    }
    return 0;
  });
}

class FakeQuery<
  T extends Record<string, unknown> = Record<string, unknown>,
> implements PromiseLike<T[]> {
  private readonly database: TradeDatabaseHarness;
  private readonly projection: Record<string, unknown> | undefined;
  private table: unknown;
  private whereValue: unknown;
  private limitValue: number | undefined;
  private orderValue: unknown[] = [];

  constructor(
    database: TradeDatabaseHarness,
    projection: Record<string, unknown> | undefined
  ) {
    this.database = database;
    this.projection = projection;
  }

  from(table: unknown) {
    this.table = table;
    return this;
  }

  innerJoin() {
    return this;
  }

  where(value: unknown) {
    this.whereValue = value;
    return this;
  }

  orderBy(...values: unknown[]) {
    this.orderValue = values;
    return this;
  }

  groupBy(..._values: unknown[]) {
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  for() {
    return this;
  }

  // oxlint-disable-next-line unicorn/no-thenable
  then<TResult1 = T[], TResult2 = never>(
    onfulfilled?: ((value: T[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    const rows = this.database.selectRows<T>(
      this.table,
      this.projection,
      this.whereValue,
      this.orderValue
    );
    const limited =
      this.limitValue === undefined ? rows : rows.slice(0, this.limitValue);
    return Promise.resolve(limited).then(onfulfilled, onrejected);
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
class FakeInsert {
  private readonly database: TradeDatabaseHarness;
  private readonly table: unknown;
  private applied: Record<string, unknown>[] | undefined;

  constructor(database: TradeDatabaseHarness, table: unknown) {
    this.database = database;
    this.table = table;
  }

  values(value: Record<string, unknown> | Record<string, unknown>[]) {
    const values = Array.isArray(value) ? value : [value];
    this.applied = this.database.insertRows(this.table, values);
    return this;
  }

  returning() {
    return Promise.resolve(this.applied ?? []);
  }
}

class FakeUpdate {
  private readonly database: TradeDatabaseHarness;
  private readonly table: unknown;
  private whereValue: unknown;
  private valuesValue: Record<string, unknown> | undefined;
  private applied: Record<string, unknown>[] | undefined;

  constructor(database: TradeDatabaseHarness, table: unknown) {
    this.database = database;
    this.table = table;
  }

  set(values: Record<string, unknown>) {
    this.valuesValue = values;
    return this;
  }

  where(value: unknown) {
    this.whereValue = value;
    this.applied = this.database.updateRows(
      this.table,
      this.valuesValue ?? {},
      this.whereValue
    );
    return this;
  }

  returning(projection?: Record<string, unknown>) {
    if (!this.applied) {
      this.applied = this.database.updateRows(
        this.table,
        this.valuesValue ?? {},
        this.whereValue
      );
    }
    this.applied = this.database.updateRows(
      this.table,
      this.valuesValue ?? {},
      this.whereValue
    );
    const rows = this.applied ?? [];
    if (!projection) {
      return Promise.resolve(rows);
    }
    return Promise.resolve(
      rows.map((row) =>
        Object.fromEntries(
          Object.keys(projection).map((key) => [key, row[key]])
        )
      )
    );
  }
}

class FakeDelete {
  private readonly database: TradeDatabaseHarness;
  private readonly table: unknown;
  private whereValue: unknown;

  constructor(database: TradeDatabaseHarness, table: unknown) {
    this.database = database;
    this.table = table;
  }

  where(value: unknown) {
    this.whereValue = value;
    this.database.deleteRows(this.table, this.whereValue);
    return this;
  }
}

class TradeDatabaseHarness {
  readonly postings: unknown[] = [];

  readonly state: FakeState = {
    blocks: [],
    cards: [
      {
        availability: "active",
        binding: "transferable",
        id: "card-proposer",
        lifecycle: "active",
        ownerUserId: "proposer",
        packInstanceId: null,
        templateAvailability: "active",
        templateId: "template-card",
      },
      {
        availability: "active",
        binding: "transferable",
        id: "card-recipient",
        lifecycle: "active",
        ownerUserId: "recipient",
        packInstanceId: null,
        templateAvailability: "active",
        templateId: "template-card",
      },
    ],
    custody: [],
    events: [],
    failOnHistoryInsert: false,
    histories: [],
    offers: [],
    packs: [
      {
        availability: "active",
        binding: "transferable",
        id: "pack-recipient",
        ownerUserId: "recipient",
        revisionId: "revision-pack",
        state: "unopened",
        templateId: "template-pack",
        templateLifecycle: "active",
      },
      {
        availability: "active",
        binding: "transferable",
        id: "pack-proposer",
        ownerUserId: "proposer",
        revisionId: "revision-pack",
        state: "unopened",
        templateId: "template-pack",
        templateLifecycle: "active",
      },
    ],
    profileSettings: [
      { inboundTradesEnabled: true, userId: "proposer" },
      { inboundTradesEnabled: true, userId: "recipient" },
    ],
    revisionAvailability: "active",
  };

  private transactionTail = Promise.resolve();

  select(projection?: Record<string, unknown>) {
    return new FakeQuery(this, projection);
  }

  insert(table: unknown) {
    return new FakeInsert(this, table);
  }

  update(table: unknown) {
    return new FakeUpdate(this, table);
  }

  delete(table: unknown) {
    return new FakeDelete(this, table);
  }

  async transaction<T>(callback: (tx: this) => Promise<T>) {
    const previous = this.transactionTail;
    let release!: () => void;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const snapshot = clone(this.state);
    try {
      return await callback(this);
    } catch (error) {
      this.state.cards = snapshot.cards;
      this.state.blocks = snapshot.blocks;
      this.state.custody = snapshot.custody;
      this.state.events = snapshot.events;
      this.state.histories = snapshot.histories;
      this.state.offers = snapshot.offers;
      this.state.packs = snapshot.packs;
      this.state.profileSettings = snapshot.profileSettings;
      this.state.revisionAvailability = snapshot.revisionAvailability;
      throw error;
    } finally {
      release();
    }
  }

  // oxlint-disable-next-line eslint/class-methods-use-this
  execute() {
    return Promise.resolve();
  }

  selectRows<T extends Record<string, unknown>>(
    table: unknown,
    projection: Record<string, unknown> | undefined,
    condition: unknown,
    orderBy: unknown[]
  ) {
    const name = tableName(table);
    const params = conditionParams(condition);
    let rows: Record<string, unknown>[];
    if (name === tableName(eterisWallet)) {
      rows = [
        { status: "active", userId: "proposer" },
        { status: "active", userId: "recipient" },
      ];
    } else if (name === tableName(user)) {
      rows = [
        {
          banExpires: null,
          banned: false,
          emailVerified: true,
          id: "proposer",
        },
        {
          banExpires: null,
          banned: false,
          emailVerified: true,
          id: "recipient",
        },
      ];
    } else if (name === tableName(userBlock)) {
      rows = this.state.blocks.filter(
        (row) =>
          params.length === 0 ||
          params.includes(row.blockerUserId) ||
          params.includes(row.blockedUserId)
      );
    } else if (name === tableName(profileSettings)) {
      rows = this.state.profileSettings.filter(
        (row) => params.length === 0 || params.includes(row.userId)
      );
    } else if (name === tableName(cardInstance)) {
      rows = this.state.cards.filter(
        (row) => params.length === 0 || params.includes(row.id)
      );
    } else if (name === tableName(packInstance)) {
      rows = this.state.packs.filter(
        (row) => params.length === 0 || params.includes(row.id)
      );
    } else if (name === tableName(cardTemplate)) {
      rows = [
        {
          availability: "active",
          lifecycle: "active",
        },
      ];
    } else if (name === tableName(packRevision)) {
      rows = [
        {
          availability: this.state.revisionAvailability,
          lifecycle: "published",
        },
      ];
    } else if (name === tableName(collectibleCustody)) {
      const active = this.state.custody.filter(
        (row) => row.releasedAt === undefined
      );
      if (projection && "count" in projection) {
        const offerIds = conditionParams(condition).filter(
          (value): value is string => typeof value === "string"
        );
        const grouped = new Map<
          string,
          { count: number; offerId: string; side: string }
        >();
        for (const row of active) {
          if (
            offerIds.length > 0 &&
            !offerIds.includes(String(row.tradeOfferId))
          ) {
            continue;
          }
          const offerId = String(row.tradeOfferId);
          const side = String(row.side);
          const key = `${offerId}:${side}`;
          const current = grouped.get(key) ?? { count: 0, offerId, side };
          current.count += 1;
          grouped.set(key, current);
        }
        rows = [...grouped.values()];
      } else if (projection) {
        const selectedColumn = Object.values(projection)[0] as
          | { name?: string }
          | undefined;
        const selected = selectedColumn?.name;
        rows = active
          .filter((row) =>
            selected === "card_instance_id"
              ? row.cardInstanceId !== undefined
              : selected === "pack_instance_id"
                ? row.packInstanceId !== undefined
                : true
          )
          .map((row) => ({
            assetId: row.cardInstanceId ?? row.packInstanceId,
          }));
      } else {
        const source =
          orderBy[0] &&
          (orderBy[0] as { name?: string }).name === "trade_offer_id"
            ? active
            : this.state.custody;
        rows = source.filter(
          (row) => params.length === 0 || params.includes(row.tradeOfferId)
        );
      }
    } else if (name === tableName(tradeOffer)) {
      rows = this.state.offers.filter((row) => {
        if (projection && "version" in projection) {
          const pairs = columnParamPairs(condition);
          const proposerUserId = pairs.find(
            ({ column }) => column === "proposer_user_id"
          )?.value;
          const recipientUserId = pairs.find(
            ({ column }) => column === "recipient_user_id"
          )?.value;
          if (
            typeof proposerUserId === "string" &&
            typeof recipientUserId === "string" &&
            proposerUserId === recipientUserId
          ) {
            if (
              row.proposerUserId !== proposerUserId &&
              row.recipientUserId !== recipientUserId
            ) {
              return false;
            }
          } else {
            if (
              typeof proposerUserId === "string" &&
              row.proposerUserId !== proposerUserId
            ) {
              return false;
            }
            if (
              typeof recipientUserId === "string" &&
              row.recipientUserId !== recipientUserId
            ) {
              return false;
            }
          }
          const state = pairs.find(({ column }) => column === "state")?.value;
          if (typeof state === "string" && row.state !== state) {
            return false;
          }
          const cursorSentAt = pairs.find(
            ({ column, value }) => column === "sent_at" && value instanceof Date
          )?.value;
          const cursorId = pairs.find(({ column }) => column === "id")?.value;
          if (
            cursorSentAt instanceof Date &&
            typeof cursorId === "string" &&
            row.sentAt instanceof Date
          ) {
            const timestamp = row.sentAt.getTime();
            const cursorTimestamp = cursorSentAt.getTime();
            if (
              timestamp > cursorTimestamp ||
              (timestamp === cursorTimestamp && String(row.id) >= cursorId)
            ) {
              return false;
            }
          }
          return true;
        }
        if (
          projection &&
          "expiresAt" in projection &&
          !("version" in projection)
        ) {
          const pairs = columnParamPairs(condition);
          const state = pairs.find(({ column }) => column === "state")?.value;
          const expiresAt = pairs.find(
            ({ column, value }) =>
              column === "expires_at" && value instanceof Date
          )?.value;
          return (
            (typeof state !== "string" || row.state === state) &&
            (!(expiresAt instanceof Date) ||
              !(row.expiresAt instanceof Date) ||
              row.expiresAt <= expiresAt)
          );
        }
        if (params.length === 0) {
          return true;
        }
        if (params.includes(row.id) || params.includes(row.idempotencyKey)) {
          return true;
        }
        const stateFilter = params.find((value) =>
          [
            "sent",
            "accepted",
            "rejected",
            "cancelled",
            "expired",
            "administratively-cancelled",
          ].includes(value as string)
        );
        if (stateFilter && row.state !== stateFilter) {
          return false;
        }
        const cutoff = params.find((value) => value instanceof Date);
        if (
          cutoff instanceof Date &&
          (!(row.expiresAt instanceof Date) || row.expiresAt > cutoff)
        ) {
          return false;
        }
        return Boolean(
          params.includes(row.proposerUserId) ||
          params.includes(row.recipientUserId) ||
          stateFilter ||
          cutoff
        );
      });
      if (
        projection &&
        ("version" in projection || "expiresAt" in projection)
      ) {
        rows = sortTradeRows(rows, orderBy);
      }
      if (projection) {
        rows = rows.map((row) =>
          Object.fromEntries(
            Object.keys(projection).map((key) => [key, row[key]])
          )
        );
      }
    } else if (name === tableName(tradeOfferHistory)) {
      const historyParams = conditionParams(condition);
      rows = this.state.histories.filter(
        (row) =>
          historyParams.length === 0 ||
          historyParams.includes(row.idempotencyKey) ||
          historyParams.includes(row.offerId)
      );
    } else if (name === tableName(collectibleOwnershipEvent)) {
      rows = this.state.events;
    } else {
      rows = [];
    }
    return clone(rows) as T[];
  }

  insertRows(table: unknown, values: Record<string, unknown>[]) {
    const name = tableName(table);
    if (name === tableName(tradeOffer)) {
      this.state.offers.push(...clone(values));
      return clone(values);
    }
    if (name === tableName(collectibleCustody)) {
      const existing = new Set(
        this.state.custody
          .filter((row) => row.releasedAt === undefined)
          .map((row) => row.cardInstanceId ?? row.packInstanceId)
      );
      for (const row of values) {
        const assetId = row.cardInstanceId ?? row.packInstanceId;
        if (typeof assetId === "string" && existing.has(assetId)) {
          throw new Error("active custody unique constraint");
        }
        if (typeof assetId === "string") {
          existing.add(assetId);
        }
      }
      this.state.custody.push(...clone(values));
      return clone(values);
    }
    if (name === tableName(tradeOfferHistory)) {
      if (this.state.failOnHistoryInsert) {
        throw new Error("history failed");
      }
      this.state.histories.push(...clone(values));
      return clone(values);
    }
    if (name === tableName(profileSettings)) {
      const applied = values.map((value) => ({
        inboundTradesEnabled: true,
        ...value,
      }));
      this.state.profileSettings.push(...clone(applied));
      return clone(applied);
    }
    if (name === tableName(userBlock)) {
      this.state.blocks.push(...clone(values));
      return clone(values);
    }
    if (name === tableName(collectibleOwnershipEvent)) {
      this.state.events.push(...clone(values));
      return clone(values);
    }
    return clone(values);
  }

  updateRows(
    table: unknown,
    values: Record<string, unknown>,
    condition?: unknown
  ) {
    const name = tableName(table);
    const params = conditionParams(condition);
    if (name === tableName(cardInstance)) {
      const rows = this.state.cards.filter(
        (row) => params.length === 0 || params.includes(row.id)
      );
      for (const row of rows) {
        Object.assign(row, values);
      }
      return clone(rows);
    }
    if (name === tableName(packInstance)) {
      const rows = this.state.packs.filter(
        (row) => params.length === 0 || params.includes(row.id)
      );
      for (const row of rows) {
        Object.assign(row, values);
      }
      return clone(rows);
    }
    if (name === tableName(collectibleCustody)) {
      const active = this.state.custody.filter(
        (row) => row.releasedAt === undefined
      );
      const rows = active.filter(
        (row) =>
          params.length === 0 ||
          params.includes(row.tradeOfferId) ||
          params.includes(row.cardInstanceId) ||
          params.includes(row.packInstanceId)
      );
      for (const row of rows) {
        Object.assign(row, values);
      }
      return clone(rows);
    }
    if (name === tableName(tradeOffer)) {
      const rows = this.state.offers.filter(
        (row) =>
          params.length === 0 ||
          params.includes(row.id) ||
          params.includes(row.idempotencyKey)
      );
      for (const row of rows) {
        Object.assign(row, values);
      }
      return clone(rows);
    }
    if (name === tableName(profileSettings)) {
      const rows = this.state.profileSettings.filter(
        (row) => params.length === 0 || params.includes(row.userId)
      );
      for (const row of rows) {
        Object.assign(row, values);
      }
      return clone(rows);
    }
    return [];
  }

  deleteRows(table: unknown, condition?: unknown) {
    if (tableName(table) !== tableName(userBlock)) {
      return [];
    }
    const params = conditionParams(condition);
    const removed = this.state.blocks.filter(
      (row) =>
        params.length === 0 ||
        params.includes(row.blockerUserId) ||
        params.includes(row.blockedUserId)
    );
    this.state.blocks = this.state.blocks.filter(
      (row) => !removed.includes(row)
    );
    return clone(removed);
  }
}

function tradeInput(
  idempotencyKey: string,
  proposerAsset: TradeAsset,
  recipientAsset: TradeAsset
) {
  return {
    idempotencyKey,
    proposerAsset,
    recipientAsset,
    recipientUserId: "recipient",
  };
}

function seedListOffer(
  database: TradeDatabaseHarness,
  input: {
    id: string;
    proposerUserId: string;
    recipientUserId: string;
    sentAt: Date;
    state?: string;
    proposerAssetCount: number;
    recipientAssetCount: number;
  }
) {
  const state = input.state ?? "sent";
  database.state.offers.push({
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    fingerprint: `fingerprint-${input.id}`,
    id: input.id,
    idempotencyKey: `idempotency-${input.id}`,
    proposerUserId: input.proposerUserId,
    recipientUserId: input.recipientUserId,
    sentAt: input.sentAt,
    state,
    termsHash: `terms-${input.id}`,
    version: state === "sent" ? 1 : 2,
  });
  for (const side of [
    ["proposer", input.proposerAssetCount],
    ["recipient", input.recipientAssetCount],
  ] as const) {
    for (let index = 0; index < side[1]; index += 1) {
      database.state.custody.push({
        acquiredAt: input.sentAt,
        cardInstanceId: `${input.id}-${side[0]}-asset-${index}`,
        side: side[0],
        tradeOfferId: input.id,
      });
    }
  }
}

describe("single-asset trade offer service", () => {
  beforeEach(() => {
    notification.createUserNotification.mockClear();
  });

  it("blocks an unopened Pack from trade when its historical revision is disabled", async () => {
    const database = new TradeDatabaseHarness();
    database.state.revisionAvailability = "disabled";

    await expect(
      sendTradeOffer(database, "proposer", {
        ...tradeInput(
          "trade-disabled-revision",
          { assetId: "pack-proposer", kind: "pack" },
          { assetId: "card-recipient", kind: "card" }
        ),
      })
    ).rejects.toMatchObject({ code: "ASSET_UNAVAILABLE" });
    expect(database.state.offers).toHaveLength(0);
    expect(database.state.custody).toHaveLength(0);
  });

  it("sends a mixed card/pack offer with seven-day immutable terms and private notification", async () => {
    const database = new TradeDatabaseHarness();
    const sentAt = new Date("2026-08-16T12:00:00.000Z");

    const result = await sendTradeOffer(database, "proposer", {
      ...tradeInput(
        "trade-mixed-1",
        { assetId: "card-proposer", kind: "card" },
        { assetId: "pack-recipient", kind: "pack" }
      ),
      now: sentAt,
    });

    expect(result).toMatchObject({
      replayed: false,
      state: "sent",
      version: 1,
    });
    expect(result.expiresAt.getTime() - sentAt.getTime()).toBe(
      TRADE_OFFER_EXPIRY_MS
    );
    expect(database.state.offers).toHaveLength(1);
    expect(database.state.custody).toHaveLength(2);
    expect(database.state.histories).toHaveLength(1);
    expect(database.postings).toHaveLength(0);
    expect(notification.createUserNotification).toHaveBeenCalledTimes(1);
    expect(notification.createUserNotification).toHaveBeenCalledWith(
      database,
      expect.objectContaining({ targetUserId: "recipient" })
    );
    expect(notification.createUserNotification.mock.calls[0]?.[1]).not.toEqual(
      expect.objectContaining({ targetUserId: "proposer" })
    );
  });

  it("settles a deterministic multi-asset bundle atomically and releases every custody row", async () => {
    const database = new TradeDatabaseHarness();
    const sent = await sendTradeOffer(database, "proposer", {
      idempotencyKey: "trade-bundle-accept-1",
      proposerAssets: [
        { assetId: "card-proposer", kind: "card" },
        { assetId: "pack-proposer", kind: "pack" },
      ],
      recipientAssets: [
        { assetId: "card-recipient", kind: "card" },
        { assetId: "pack-recipient", kind: "pack" },
      ],
      recipientUserId: "recipient",
    });
    expect(
      database.state.custody.map(
        (row) => row.cardInstanceId ?? row.packInstanceId
      )
    ).toEqual([
      "card-proposer",
      "pack-proposer",
      "card-recipient",
      "pack-recipient",
    ]);

    const accepted = await acceptTradeOffer(database, "recipient", {
      idempotencyKey: "trade-bundle-accept-action-1",
      offerId: sent.offerId,
    });

    expect(accepted).toMatchObject({
      state: "accepted",
      transferredAssetIds: [
        "card-proposer",
        "pack-proposer",
        "card-recipient",
        "pack-recipient",
      ],
    });
    expect(database.state.custody).toHaveLength(4);
    expect(
      database.state.custody.every((row) => row.releasedAt instanceof Date)
    ).toBe(true);
    expect(database.state.cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "card-proposer",
          ownerUserId: "recipient",
        }),
        expect.objectContaining({
          id: "card-recipient",
          ownerUserId: "proposer",
        }),
      ])
    );
    expect(database.state.packs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "pack-proposer",
          ownerUserId: "recipient",
        }),
        expect.objectContaining({
          id: "pack-recipient",
          ownerUserId: "proposer",
        }),
      ])
    );
    expect(database.state.events).toHaveLength(4);
  });

  it("paginates trade summaries with a stable cursor, participant/state filters, and bounded counts", async () => {
    const database = new TradeDatabaseHarness();
    const tieTimestamp = new Date("2026-08-16T12:00:00.000Z");
    seedListOffer(database, {
      id: "offer-2",
      proposerUserId: "proposer",
      proposerAssetCount: 2,
      recipientUserId: "counterparty-a",
      recipientAssetCount: 1,
      sentAt: tieTimestamp,
    });
    seedListOffer(database, {
      id: "offer-1",
      proposerUserId: "counterparty-b",
      proposerAssetCount: 1,
      recipientUserId: "proposer",
      recipientAssetCount: 2,
      sentAt: tieTimestamp,
    });
    seedListOffer(database, {
      id: "offer-0",
      proposerUserId: "proposer",
      proposerAssetCount: 1,
      recipientUserId: "counterparty-c",
      recipientAssetCount: 1,
      sentAt: new Date("2026-08-15T12:00:00.000Z"),
    });
    seedListOffer(database, {
      id: "offer-accepted",
      proposerUserId: "proposer",
      proposerAssetCount: 1,
      recipientUserId: "counterparty-d",
      recipientAssetCount: 1,
      sentAt: new Date("2026-08-14T12:00:00.000Z"),
      state: "accepted",
    });
    seedListOffer(database, {
      id: "offer-foreign",
      proposerUserId: "foreign-user",
      proposerAssetCount: 4,
      recipientUserId: "other-user",
      recipientAssetCount: 4,
      sentAt: new Date("2026-08-17T12:00:00.000Z"),
    });

    const firstPage = await listTradeOffers(
      database as unknown as TradeDatabase,
      "proposer",
      { limit: 2 }
    );
    expect(firstPage.items.map(({ id }) => id)).toEqual(["offer-2", "offer-1"]);
    expect(firstPage.nextCursor).toBe(`${tieTimestamp.toISOString()}|offer-1`);
    expect(firstPage.items[0]).toMatchObject({
      assetCount: 3,
      proposerAssetCount: 2,
      recipientAssetCount: 1,
    });
    expect(firstPage.items[0]).not.toHaveProperty("termsHash");
    expect(firstPage.items[0]).not.toHaveProperty("assets");

    const secondPage = await listTradeOffers(
      database as unknown as TradeDatabase,
      "proposer",
      { cursor: firstPage.nextCursor ?? undefined, limit: 2 }
    );
    expect(secondPage.items.map(({ id }) => id)).toEqual([
      "offer-0",
      "offer-accepted",
    ]);
    expect(secondPage.nextCursor).toBeNull();

    const accepted = await listTradeOffers(
      database as unknown as TradeDatabase,
      "proposer",
      { limit: 2, state: "accepted" }
    );
    expect(accepted.items.map(({ id }) => id)).toEqual(["offer-accepted"]);

    const sent = await listTradeOffers(
      database as unknown as TradeDatabase,
      "proposer",
      { limit: 10, state: "sent" },
      "sent"
    );
    expect(sent.items.map(({ id }) => id)).toEqual(["offer-2", "offer-0"]);
    const inbox = await listTradeOffers(
      database as unknown as TradeDatabase,
      "proposer",
      { limit: 10 },
      "inbox"
    );
    expect(inbox.items.map(({ id }) => id)).toEqual(["offer-1"]);
  });

  it("replays the original sent result, rejects changed terms, and serializes competing custody", async () => {
    const database = new TradeDatabaseHarness();
    const firstInput = tradeInput(
      "trade-replay-1",
      { assetId: "card-proposer", kind: "card" },
      { assetId: "pack-recipient", kind: "pack" }
    );
    const first = await sendTradeOffer(database, "proposer", firstInput);
    const replay = await sendTradeOffer(database, "proposer", firstInput);

    expect(replay).toMatchObject({
      offerId: first.offerId,
      replayed: true,
      state: "sent",
    });
    expect(database.state.offers).toHaveLength(1);
    expect(database.state.custody).toHaveLength(2);

    const metrics: unknown[] = [];
    await expect(
      sendTradeOffer(database, "proposer", {
        ...tradeInput(
          "trade-replay-1",
          { assetId: "card-proposer", kind: "card" },
          { assetId: "card-recipient", kind: "card" }
        ),
        metrics: (event) => {
          metrics.push(event);
        },
      })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(metrics).toContainEqual(
      expect.objectContaining({
        name: "idempotency_conflict",
        operation: "trade.send",
        occurredAt: expect.any(Date),
      })
    );
    expect(JSON.stringify(metrics)).not.toMatch(
      /proposer|recipient|card-|pack-|termsHash/
    );

    const competingDatabase = new TradeDatabaseHarness();
    const competing = await Promise.allSettled([
      sendTradeOffer(
        competingDatabase,
        "proposer",
        tradeInput(
          "trade-competing-1",
          { assetId: "card-proposer", kind: "card" },
          { assetId: "pack-recipient", kind: "pack" }
        )
      ),
      sendTradeOffer(
        competingDatabase,
        "proposer",
        tradeInput(
          "trade-competing-2",
          { assetId: "card-proposer", kind: "card" },
          { assetId: "card-recipient", kind: "card" }
        )
      ),
    ]);
    expect(
      competing.filter(({ status }) => status === "fulfilled")
    ).toHaveLength(1);
    expect(
      competing.filter(({ status }) => status === "rejected")
    ).toHaveLength(1);
    expect(competingDatabase.state.offers).toHaveLength(1);
    expect(competingDatabase.state.custody).toHaveLength(2);
  });

  it("uses the same seven-day transition for scheduled expiry and releases custody once", async () => {
    const database = new TradeDatabaseHarness();
    const sentAt = new Date("2026-08-16T12:00:00.000Z");
    const sent = await sendTradeOffer(database, "proposer", {
      ...tradeInput(
        "trade-expiry-batch-1",
        { assetId: "card-proposer", kind: "card" },
        { assetId: "pack-recipient", kind: "pack" }
      ),
      now: sentAt,
    });
    const now = new Date(sentAt.getTime() + TRADE_OFFER_EXPIRY_MS + 1);
    const metrics: unknown[] = [];
    const first = await expireCollectibleTradeOffersBatch(
      database as unknown as TradeDatabase,
      {
        limit: 1,
        metrics: (event) => {
          metrics.push(event);
        },
        now,
      }
    );
    const second = await expireCollectibleTradeOffersBatch(
      database as unknown as TradeDatabase,
      {
        metrics: (event) => {
          metrics.push(event);
        },
        now,
      }
    );

    expect(first).toMatchObject({ expired: 1, offerIds: [sent.offerId] });
    expect(second).toMatchObject({ expired: 0 });
    expect(database.state.offers[0]).toMatchObject({ state: "expired" });
    expect(database.state.histories).toHaveLength(2);
    expect(database.state.custody).toHaveLength(2);
    expect(
      database.state.custody.every((row) => row.releasedAt instanceof Date)
    ).toBe(true);
    expect(metrics).toContainEqual(
      expect.objectContaining({
        name: "expiry_backlog",
        operation: "trade.expiry.batch",
        occurredAt: expect.any(Date),
      })
    );
    for (const event of metrics) {
      expect(event).not.toEqual(
        expect.objectContaining({
          assetId: expect.anything(),
          participantUserId: expect.anything(),
          termsHash: expect.anything(),
          userId: expect.anything(),
        })
      );
      expect(JSON.stringify(event)).not.toMatch(
        /proposer|recipient|card-|pack-|termsHash/
      );
    }
    expect(metrics).not.toContainEqual(
      expect.objectContaining({ name: "custody_conflict" })
    );
  });

  it("idempotently disables inbound offers, closes Sent custody, and blocks new sends", async () => {
    const database = new TradeDatabaseHarness();
    const sent = await sendTradeOffer(
      database,
      "proposer",
      tradeInput(
        "trade-preference-disable-1",
        { assetId: "card-proposer", kind: "card" },
        { assetId: "pack-recipient", kind: "pack" }
      )
    );
    const first = await updateInboundTradePreference(
      database as unknown as TradeDatabase,
      "recipient",
      false,
      { now: new Date("2026-08-16T12:00:00.000Z") }
    );
    const replay = await updateInboundTradePreference(
      database as unknown as TradeDatabase,
      "recipient",
      false,
      { now: new Date("2026-08-16T12:00:00.000Z") }
    );

    expect(first).toEqual({
      closedOfferIds: [sent.offerId],
      inboundTradesEnabled: false,
    });
    expect(replay).toEqual({ closedOfferIds: [], inboundTradesEnabled: false });
    expect(database.state.profileSettings).toContainEqual(
      expect.objectContaining({
        inboundTradesEnabled: false,
        userId: "recipient",
      })
    );
    expect(database.state.offers[0]).toMatchObject({ state: "cancelled" });
    expect(
      database.state.custody.every((row) => row.releasedAt instanceof Date)
    ).toBe(true);
    await expect(
      sendTradeOffer(
        database,
        "proposer",
        tradeInput(
          "trade-preference-disabled-send-1",
          { assetId: "card-proposer", kind: "card" },
          { assetId: "pack-recipient", kind: "pack" }
        )
      )
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("blocks both directions, closes existing Sent offers, and remains idempotent", async () => {
    const database = new TradeDatabaseHarness();
    const sent = await sendTradeOffer(
      database,
      "proposer",
      tradeInput(
        "trade-block-close-1",
        { assetId: "card-proposer", kind: "card" },
        { assetId: "pack-recipient", kind: "pack" }
      )
    );
    const first = await blockTradeUser(
      database as unknown as TradeDatabase,
      "recipient",
      "proposer",
      { now: new Date("2026-08-16T12:00:00.000Z") }
    );
    const replay = await blockTradeUser(
      database as unknown as TradeDatabase,
      "recipient",
      "proposer",
      { now: new Date("2026-08-16T12:00:00.000Z") }
    );

    expect(first).toEqual({ blocked: true, closedOfferIds: [sent.offerId] });
    expect(replay).toEqual({ blocked: true, closedOfferIds: [] });
    expect(database.state.blocks).toHaveLength(1);
    expect(database.state.offers[0]).toMatchObject({
      state: "administratively-cancelled",
    });
    expect(
      database.state.custody.every((row) => row.releasedAt instanceof Date)
    ).toBe(true);
    await expect(
      sendTradeOffer(
        database,
        "proposer",
        tradeInput(
          "trade-blocked-send-1",
          { assetId: "card-proposer", kind: "card" },
          { assetId: "pack-recipient", kind: "pack" }
        )
      )
    ).rejects.toMatchObject({ code: "ACCOUNT_BLOCKED" });
  });

  it("fails a stale-ownership accept without partially transferring the bundle", async () => {
    const database = new TradeDatabaseHarness();
    const sent = await sendTradeOffer(
      database,
      "proposer",
      tradeInput(
        "trade-stale-ownership-1",
        { assetId: "card-proposer", kind: "card" },
        { assetId: "pack-recipient", kind: "pack" }
      )
    );
    const metrics: unknown[] = [];
    const recipientPack = database.state.packs.find(
      (pack) => pack.id === "pack-recipient"
    );
    if (recipientPack) {
      recipientPack.ownerUserId = "unexpected-owner";
    }

    await expect(
      acceptTradeOffer(database, "recipient", {
        idempotencyKey: "trade-stale-ownership-action-1",
        metrics: (event) => {
          metrics.push(event);
        },
        offerId: sent.offerId,
      })
    ).rejects.toMatchObject({ code: "OWNERSHIP_CHANGED" });
    expect(database.state.offers[0]).toMatchObject({ state: "sent" });
    expect(
      database.state.custody.every((row) => row.releasedAt === undefined)
    ).toBe(true);
    expect(database.state.events).toHaveLength(0);
    expect(metrics).toContainEqual(
      expect.objectContaining({ name: "stale_ownership" })
    );
  });

  it("rolls back offer and custody together and never posts to Eteris", async () => {
    const database = new TradeDatabaseHarness();
    database.state.failOnHistoryInsert = true;

    await expect(
      sendTradeOffer(
        database,
        "proposer",
        tradeInput(
          "trade-rollback-1",
          { assetId: "card-proposer", kind: "card" },
          { assetId: "pack-recipient", kind: "pack" }
        )
      )
    ).rejects.toThrow("history failed");
    expect(database.state.offers).toHaveLength(0);
    expect(database.state.custody).toHaveLength(0);
    expect(database.state.histories).toHaveLength(0);
    expect(notification.createUserNotification).not.toHaveBeenCalled();
  });

  it("accepts once, swaps both owners, retains released custody, and replays the terminal result", async () => {
    const database = new TradeDatabaseHarness();
    const sent = await sendTradeOffer(
      database,
      "proposer",
      tradeInput(
        "trade-accept-send-1",
        { assetId: "card-proposer", kind: "card" },
        { assetId: "pack-recipient", kind: "pack" }
      )
    );
    notification.createUserNotification.mockClear();

    const accepted = await acceptTradeOffer(database, "recipient", {
      idempotencyKey: "trade-accept-action-1",
      offerId: sent.offerId,
    });
    const replay = await acceptTradeOffer(database, "recipient", {
      idempotencyKey: "trade-accept-action-1",
      offerId: sent.offerId,
    });

    expect(accepted).toMatchObject({
      offerId: sent.offerId,
      replayed: false,
      state: "accepted",
      transferredAssetIds: ["card-proposer", "pack-recipient"],
      version: 2,
    });
    expect(replay).toMatchObject({
      offerId: sent.offerId,
      replayed: true,
      state: "accepted",
    });
    expect(database.state.offers[0]).toMatchObject({ state: "accepted" });
    expect(database.state.cards[0]).toMatchObject({ ownerUserId: "recipient" });
    expect(database.state.packs[0]).toMatchObject({ ownerUserId: "proposer" });
    expect(database.state.custody).toHaveLength(2);
    expect(
      database.state.custody.every((row) => row.releasedAt instanceof Date)
    ).toBe(true);
    expect(database.state.events).toHaveLength(2);
    expect(database.state.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromUserId: "proposer",
          kind: "trade",
          toUserId: "recipient",
        }),
        expect.objectContaining({
          fromUserId: "recipient",
          kind: "trade",
          toUserId: "proposer",
        }),
      ])
    );
    expect(notification.createUserNotification).toHaveBeenCalledTimes(1);
  });

  it("wins one terminal race and keeps the losing command from mutating ownership", async () => {
    const database = new TradeDatabaseHarness();
    const sent = await sendTradeOffer(
      database,
      "proposer",
      tradeInput(
        "trade-race-send-1",
        { assetId: "card-proposer", kind: "card" },
        { assetId: "pack-recipient", kind: "pack" }
      )
    );
    notification.createUserNotification.mockClear();

    const results = await Promise.allSettled([
      acceptTradeOffer(database, "recipient", {
        idempotencyKey: "trade-race-accept-1",
        offerId: sent.offerId,
      }),
      cancelTradeOffer(database, "proposer", {
        idempotencyKey: "trade-race-cancel-1",
        offerId: sent.offerId,
      }),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1
    );
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(
      1
    );
    expect(results.find(({ status }) => status === "rejected")).toMatchObject({
      reason: expect.objectContaining({ code: "OFFER_TERMINAL" }),
    });
    expect(database.state.offers[0]?.state).toMatch(/accepted|cancelled/);
    expect(database.state.custody).toHaveLength(2);
    expect(
      database.state.custody.every((row) => row.releasedAt instanceof Date)
    ).toBe(true);
  });

  it("rejects without transfer and releases both retained custody rows", async () => {
    const database = new TradeDatabaseHarness();
    const sent = await sendTradeOffer(
      database,
      "proposer",
      tradeInput(
        "trade-reject-send-1",
        { assetId: "card-proposer", kind: "card" },
        { assetId: "pack-recipient", kind: "pack" }
      )
    );

    const rejected = await rejectTradeOffer(database, "recipient", {
      idempotencyKey: "trade-reject-action-1",
      offerId: sent.offerId,
    });

    expect(rejected).toMatchObject({ replayed: false, state: "rejected" });
    expect(database.state.offers[0]).toMatchObject({ state: "rejected" });
    expect(database.state.cards[0]).toMatchObject({ ownerUserId: "proposer" });
    expect(database.state.packs[0]).toMatchObject({ ownerUserId: "recipient" });
    expect(database.state.events).toHaveLength(0);
    expect(
      database.state.custody.every((row) => row.releasedAt instanceof Date)
    ).toBe(true);
  });

  it("makes a counteroffer a fresh offer after closing the original", async () => {
    const database = new TradeDatabaseHarness();
    const sent = await sendTradeOffer(
      database,
      "proposer",
      tradeInput(
        "trade-counter-send-1",
        { assetId: "card-proposer", kind: "card" },
        { assetId: "pack-recipient", kind: "pack" }
      )
    );

    const counter = await counterOffer(database, "recipient", {
      idempotencyKey: "trade-counter-new-1",
      offerId: sent.offerId,
      proposerAsset: { assetId: "pack-recipient", kind: "pack" },
      recipientAsset: { assetId: "card-proposer", kind: "card" },
    });

    expect(counter).toMatchObject({
      previousOfferId: sent.offerId,
      replayed: false,
      state: "sent",
    });
    expect(counter.offerId).not.toBe(sent.offerId);
    expect(database.state.offers).toHaveLength(2);
    expect(database.state.offers[0]?.state).toBe("rejected");
    expect(database.state.custody).toHaveLength(4);
    expect(
      database.state.custody.filter((row) => row.releasedAt === undefined)
    ).toHaveLength(2);
  });

  it("replays a counteroffer exactly and rejects changed terms before closing again", async () => {
    const database = new TradeDatabaseHarness();
    const sent = await sendTradeOffer(
      database,
      "proposer",
      tradeInput(
        "trade-counter-replay-send-1",
        { assetId: "card-proposer", kind: "card" },
        { assetId: "pack-recipient", kind: "pack" }
      )
    );
    const counterInput = {
      idempotencyKey: "trade-counter-replay-1",
      offerId: sent.offerId,
      proposerAsset: { assetId: "pack-recipient", kind: "pack" as const },
      recipientAsset: { assetId: "card-proposer", kind: "card" as const },
    };
    const first = await counterOffer(database, "recipient", counterInput);
    const replay = await counterOffer(database, "recipient", counterInput);

    expect(first).toMatchObject({ replayed: false, state: "sent" });
    expect(replay).toMatchObject({
      offerId: first.offerId,
      replayed: true,
      state: "sent",
    });
    await expect(
      counterOffer(database, "recipient", {
        ...counterInput,
        recipientAsset: { assetId: "pack-proposer", kind: "pack" },
      })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(database.state.offers).toHaveLength(2);
    expect(database.state.offers[0]?.state).toBe("rejected");
  });

  it("rolls back the original offer when a counteroffer cannot append history", async () => {
    const database = new TradeDatabaseHarness();
    const sent = await sendTradeOffer(
      database,
      "proposer",
      tradeInput(
        "trade-counter-rollback-send-1",
        { assetId: "card-proposer", kind: "card" },
        { assetId: "pack-recipient", kind: "pack" }
      )
    );
    database.state.failOnHistoryInsert = true;

    await expect(
      counterOffer(database, "recipient", {
        idempotencyKey: "trade-counter-rollback-1",
        offerId: sent.offerId,
        proposerAsset: { assetId: "pack-recipient", kind: "pack" },
        recipientAsset: { assetId: "card-proposer", kind: "card" },
      })
    ).rejects.toThrow("history failed");
    expect(database.state.offers[0]).toMatchObject({ state: "sent" });
    expect(
      database.state.custody.every((row) => row.releasedAt === undefined)
    ).toBe(true);
  });

  it("rejects self-trades, duplicate assets, and user-authored terms at the boundary", async () => {
    const database = new TradeDatabaseHarness();
    await expect(
      sendTradeOffer(database, "proposer", {
        ...tradeInput(
          "trade-self-1",
          { assetId: "card-proposer", kind: "card" },
          { assetId: "pack-recipient", kind: "pack" }
        ),
        recipientUserId: "proposer",
      })
    ).rejects.toMatchObject({ code: "SELF_TRADE" });

    await expect(
      sendTradeOffer(database, "proposer", {
        ...tradeInput(
          "trade-duplicate-1",
          { assetId: "card-proposer", kind: "card" },
          { assetId: "card-proposer", kind: "card" }
        ),
      })
    ).rejects.toThrow();

    await expect(
      sendTradeOffer(database, "proposer", {
        ...tradeInput(
          "trade-description-1",
          { assetId: "card-proposer", kind: "card" },
          { assetId: "pack-recipient", kind: "pack" }
        ),
        description: "texto no permitido",
      } as never)
    ).rejects.toThrow();
  });

  it("retains the typed domain error for an active custody conflict", () => {
    const error = new TradeOfferError(
      "ACTIVE_CUSTODY",
      "El coleccionable ya está reservado."
    );
    expect(error).toMatchObject({
      code: "ACTIVE_CUSTODY",
      name: "TradeOfferError",
    });
  });
});
