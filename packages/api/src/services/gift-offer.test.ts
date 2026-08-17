import {
  cardInstance,
  cardTemplate,
  collectibleCustody,
  giftOffer,
  giftOfferHistory,
  packInstance,
  packRevision,
  packTemplate,
  profileSettings,
  user,
  userBlock,
  eterisWallet,
} from "@repo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  acceptGiftOffer as acceptGiftOfferCommand,
  cancelGiftOffer as cancelGiftOfferCommand,
  expireCollectibleGiftOffersBatch,
  getGiftOffer,
  listGiftOffers,
  rejectGiftOffer as rejectGiftOfferCommand,
  sendGiftOffer as sendGiftOfferCommand,
  updateInboundGiftPreference,
  GIFT_OFFER_EXPIRY_MS,
} from "./gift-offer";
import { blockTradeUser } from "./trade-offer";

type GiftAsset = { assetId: string; kind: "card" | "pack" };
type Row = Record<string, unknown>;
type GiftState = {
  blocks: Row[];
  cards: Row[];
  custody: Row[];
  events: Row[];
  failOnHistoryInsert: boolean;
  failOnOwnershipEventAt?: number;
  histories: Row[];
  offers: Row[];
  packs: Row[];
  profileSettings: Row[];
  revisionAvailability: "active" | "disabled";
};

function stateFor(transaction: unknown) {
  return (transaction as { state: GiftState }).state;
}

const notifications = vi.hoisted(() => ({
  calls: [] as Row[],
}));

vi.mock("@repo/env", () => ({
  env: {
    COLLECTIBLES_ENABLED: true,
    DATABASE_URL: "postgres://gift-test.invalid/gift-test",
    REDIS_URL: "redis://gift-test.invalid",
  },
}));
vi.mock("./collectibles", () => ({
  assertCollectiblesMutationAllowed: vi.fn(),
  withCollectibleDeadlockRetry: <T>(operation: () => Promise<T>) => operation(),
}));
vi.mock("./notification", () => ({
  createUserNotification: vi.fn((_database: unknown, input: Row) => {
    notifications.calls.push(input);
    return Promise.resolve({
      id: `notification-${notifications.calls.length}`,
    });
  }),
}));

vi.mock("./collectible-ownership", () => ({
  appendCollectibleOwnershipEvent: vi.fn((transaction: unknown, input: Row) => {
    const state = stateFor(transaction);
    if (
      state.failOnOwnershipEventAt !== undefined &&
      state.events.length >= state.failOnOwnershipEventAt
    ) {
      throw new Error("ownership event failed");
    }
    state.events.push(input);
    return input;
  }),
}));

vi.mock("./collectible-custody", () => ({
  CollectibleCustodyError: class CollectibleCustodyError extends Error {
    constructor() {
      super();
      this.name = "CollectibleCustodyError";
    }
  },
  assertNoActiveCollectibleCustody: (
    transaction: unknown,
    assets: GiftAsset[]
  ) => {
    const state = stateFor(transaction);
    const active = state.custody.filter(
      (row) =>
        row.releasedAt === undefined &&
        assets.some(
          (asset) =>
            (asset.kind === "card"
              ? row.cardInstanceId
              : row.packInstanceId) === asset.assetId
        )
    );
    if (active.length > 0) {
      throw new Error("active custody");
    }
    return true;
  },
  createCollectibleCustody: (
    transaction: { insert: (table: unknown) => GiftInsert },
    input: {
      acquiredAt: Date;
      assets: { asset: GiftAsset; side: "proposer" | "recipient" }[];
      giftOfferId?: string;
    }
  ) =>
    transaction
      .insert(collectibleCustody)
      .values(
        input.assets.map(({ asset, side }, index) => ({
          acquiredAt: input.acquiredAt,
          cardInstanceId: asset.kind === "card" ? asset.assetId : undefined,
          giftOfferId: input.giftOfferId,
          id: `custody-${stateFor(transaction).custody.length + index}`,
          packInstanceId: asset.kind === "pack" ? asset.assetId : undefined,
          side,
        }))
      )
      .returning(),
  findActiveCollectibleCustody: (transaction: unknown, assets: GiftAsset[]) => {
    const state = stateFor(transaction);
    return state.custody.flatMap((row) => {
      if (row.releasedAt !== undefined) {
        return [];
      }
      const asset = assets.find(
        (candidate) =>
          (candidate.kind === "card"
            ? row.cardInstanceId
            : row.packInstanceId) === candidate.assetId
      );
      return asset ? [asset] : [];
    });
  },
  listGiftOfferCustody: (transaction: unknown, giftOfferId: string) =>
    stateFor(transaction).custody.filter(
      (row) => row.giftOfferId === giftOfferId
    ),
  lockActiveCollectibleCustody: () => [],
  releaseGiftCollectibleCustody: (
    transaction: unknown,
    giftOfferId: string,
    reason: string,
    releasedAt: Date
  ) => {
    const rows = stateFor(transaction).custody.filter(
      (row) => row.giftOfferId === giftOfferId && row.releasedAt === undefined
    );
    for (const row of rows) {
      row.releasedAt = releasedAt;
      row.releaseReason = reason;
    }
    return rows;
  },
  transferCollectibleAssetOwner: (
    transaction: unknown,
    asset: GiftAsset,
    fromUserId: string,
    toUserId: string
  ) => {
    const state = stateFor(transaction);
    const rows = asset.kind === "card" ? state.cards : state.packs;
    const row = rows.find(
      (candidate) =>
        candidate.id === asset.assetId && candidate.ownerUserId === fromUserId
    );
    if (!row) {
      throw new Error("owner changed");
    }
    row.ownerUserId = toUserId;
    return asset.assetId;
  },
}));

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
  const chunks = queryChunks(value);
  return chunks ? chunks.flatMap(conditionParams) : [];
}

function columnParamPairs(
  value: unknown
): { column: string; value: unknown }[] {
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

function compare(left: unknown, right: unknown) {
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

function sortRows(rows: Row[], orderBy: unknown[]) {
  const specs = orderBy.flatMap((value) => {
    const spec = orderSpec(value);
    return spec ? [spec] : [];
  });
  return rows.toSorted((left, right) => {
    for (const spec of specs) {
      const camelColumn = spec.column.replaceAll(/_([a-z])/g, (_, letter) =>
        letter.toUpperCase()
      );
      const result = compare(left[camelColumn], right[camelColumn]);
      if (result !== 0) {
        return spec.direction === "desc" ? -result : result;
      }
    }
    return 0;
  });
}

function rowMatchesPairs(
  row: Row,
  pairs: { column: string; value: unknown }[]
) {
  return pairs.every(({ column, value }) => {
    const key = column.replaceAll(/_([a-z])/g, (_, letter) =>
      letter.toUpperCase()
    );
    return row[key] === value;
  });
}

// oxlint-disable-next-line eslint/max-classes-per-file -- the fake query, insert, and update builders model distinct Drizzle interfaces.
class GiftQuery<T extends Row = Row> {
  private readonly database: GiftDatabaseHarness;
  private readonly projection: Record<string, unknown> | undefined;
  private table: unknown;
  private whereValue: unknown;
  private limitValue: number | undefined;
  private orderValue: unknown[] = [];

  constructor(
    database: GiftDatabaseHarness,
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
  ): PromiseLike<TResult1 | TResult2> {
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

// oxlint-disable-next-line eslint/max-classes-per-file -- the fake query, insert, and update builders model distinct Drizzle interfaces.
class GiftInsert {
  private applied: Row[] = [];
  private readonly database: GiftDatabaseHarness;
  private readonly table: unknown;

  constructor(database: GiftDatabaseHarness, table: unknown) {
    this.database = database;
    this.table = table;
  }

  values(value: Row | Row[]) {
    this.applied = this.database.insertRows(
      this.table,
      Array.isArray(value) ? value : [value]
    );
    return this;
  }

  returning() {
    return Promise.resolve(this.applied);
  }
}

class GiftUpdate {
  private valuesValue: Row = {};
  private applied: Row[] = [];
  private readonly database: GiftDatabaseHarness;
  private readonly table: unknown;

  constructor(database: GiftDatabaseHarness, table: unknown) {
    this.database = database;
    this.table = table;
  }

  set(value: Row) {
    this.valuesValue = value;
    return this;
  }

  where(value: unknown) {
    this.applied = this.database.updateRows(
      this.table,
      this.valuesValue,
      value
    );
    return this;
  }

  returning(projection?: Record<string, unknown>) {
    if (!projection) {
      return Promise.resolve(this.applied);
    }
    return Promise.resolve(
      this.applied.map((row) =>
        Object.fromEntries(
          Object.keys(projection).map((key) => [key, row[key]])
        )
      )
    );
  }
}

function initialState(): GiftState {
  return {
    blocks: [],
    cards: [
      {
        availability: "active",
        binding: "transferable",
        id: "card-sender",
        lifecycle: "active",
        ownerUserId: "sender",
        packInstanceId: null,
        templateAvailability: "active",
      },
      {
        availability: "active",
        binding: "transferable",
        id: "card-recipient",
        lifecycle: "active",
        ownerUserId: "recipient",
        packInstanceId: null,
        templateAvailability: "active",
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
        id: "pack-sender",
        ownerUserId: "sender",
        revisionId: "revision-pack",
        state: "unopened",
        templateLifecycle: "active",
      },
    ],
    profileSettings: [
      { inboundGiftsEnabled: true, userId: "sender" },
      { inboundGiftsEnabled: true, userId: "recipient" },
    ],
    revisionAvailability: "active",
  };
}

class GiftDatabaseHarness {
  state = initialState();
  private transactionTail = Promise.resolve();

  select(projection?: Record<string, unknown>) {
    return new GiftQuery(this, projection);
  }

  insert(table: unknown) {
    return new GiftInsert(this, table);
  }

  update(table: unknown) {
    return new GiftUpdate(this, table);
  }

  async transaction<T>(callback: (transaction: this) => Promise<T>) {
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
      this.state = snapshot;
      throw error;
    } finally {
      release();
    }
  }

  // oxlint-disable-next-line eslint/class-methods-use-this -- mirrors the transaction API used by advisory-lock calls.
  execute() {
    return Promise.resolve();
  }

  selectRows<T extends Row>(
    table: unknown,
    projection: Record<string, unknown> | undefined,
    condition: unknown,
    orderBy: unknown[]
  ) {
    const name = tableName(table);
    const params = conditionParams(condition);
    const pairs = columnParamPairs(condition);
    let rows: Row[];
    if (name === tableName(eterisWallet)) {
      const ids = GiftDatabaseHarness.participantIds(params);
      rows = ids.map((userId) => ({ status: "active", userId }));
    } else if (name === tableName(user)) {
      const ids = GiftDatabaseHarness.participantIds(params);
      rows = ids.map((id) => ({
        banExpires: null,
        banned: false,
        emailVerified: true,
        id,
      }));
    } else if (name === tableName(userBlock)) {
      rows = this.state.blocks.filter((row) => {
        const values = params.filter(
          (value): value is string => typeof value === "string"
        );
        return values.every((value) => Object.values(row).includes(value));
      });
    } else if (name === tableName(profileSettings)) {
      rows = this.state.profileSettings.filter((row) =>
        pairs.length > 0
          ? row.userId ===
            pairs.find(({ column }) => column === "user_id")?.value
          : true
      );
    } else if (name === tableName(cardInstance)) {
      rows = this.state.cards.filter((row) =>
        GiftDatabaseHarness.assetRowsMatch(row, pairs, params)
      );
      rows = rows.map((row) => ({
        ...row,
        id: row.id,
        assetId: row.id,
      }));
    } else if (name === tableName(packInstance)) {
      rows = this.state.packs.filter((row) =>
        GiftDatabaseHarness.assetRowsMatch(row, pairs, params)
      );
      rows = rows.map((row) => ({ ...row, assetId: row.id }));
    } else if (name === tableName(cardTemplate)) {
      rows = [{ availability: "active", lifecycle: "active" }];
    } else if (name === tableName(packTemplate)) {
      rows = [{ lifecycle: "active" }];
    } else if (name === tableName(packRevision)) {
      rows = [
        {
          availability: stateFor(this).revisionAvailability,
          lifecycle: "published",
        },
      ];
    } else if (name === tableName(collectibleCustody)) {
      rows = this.state.custody;
      if (projection && "count" in projection) {
        const giftIds = params.filter(
          (value): value is string => typeof value === "string"
        );
        const grouped = new Map<string, Row>();
        for (const row of rows) {
          if (
            giftIds.length > 0 &&
            !giftIds.includes(String(row.giftOfferId))
          ) {
            continue;
          }
          const giftId = String(row.giftOfferId);
          const current = grouped.get(giftId) ?? { count: 0, giftId };
          current.count = Number(current.count) + 1;
          grouped.set(giftId, current);
        }
        rows = [...grouped.values()];
      } else if (projection) {
        const [selected] = Object.values(projection);
        const column = isColumnChunk(selected) ? selected.name : "";
        rows = rows
          .filter((row) =>
            column === "card_instance_id"
              ? row.cardInstanceId !== undefined
              : column === "pack_instance_id"
                ? row.packInstanceId !== undefined
                : true
          )
          .map((row) => ({
            assetId: row.cardInstanceId ?? row.packInstanceId,
          }));
      }
    } else if (name === tableName(giftOffer)) {
      rows = this.state.offers.filter((row) =>
        GiftDatabaseHarness.giftRowMatches(row, pairs, params)
      );
      rows = sortRows(rows, orderBy);
    } else if (name === tableName(giftOfferHistory)) {
      rows = this.state.histories.filter((row) => {
        const id = pairs.find(({ column }) => column === "id")?.value;
        const giftId = pairs.find(
          ({ column }) => column === "gift_offer_id"
        )?.value;
        const idempotencyKey = pairs.find(
          ({ column }) => column === "idempotency_key"
        )?.value;
        return (
          (typeof id === "string" && row.id === id) ||
          (typeof giftId === "string" && row.giftOfferId === giftId) ||
          (typeof idempotencyKey === "string" &&
            row.idempotencyKey === idempotencyKey) ||
          (pairs.length === 0 && params.length === 0)
        );
      });
      rows = sortRows(rows, orderBy);
    } else {
      rows = [];
    }
    if (projection && name !== tableName(collectibleCustody)) {
      rows = rows.map((row) =>
        Object.fromEntries(
          Object.keys(projection).map((key) => [
            key,
            key === "assetId" ? row.id : row[key],
          ])
        )
      );
    }
    return clone(rows) as T[];
  }

  insertRows(table: unknown, values: Row[]) {
    const name = tableName(table);
    if (name === tableName(giftOffer)) {
      this.state.offers.push(...clone(values));
      return clone(values);
    }
    if (name === tableName(giftOfferHistory)) {
      if (this.state.failOnHistoryInsert) {
        throw new Error("history failed");
      }
      this.state.histories.push(...clone(values));
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
    if (name === tableName(profileSettings)) {
      const applied = values.map((row) => ({
        inboundGiftsEnabled: true,
        ...row,
      }));
      this.state.profileSettings.push(...clone(applied));
      return clone(applied);
    }
    if (name === tableName(userBlock)) {
      this.state.blocks.push(...clone(values));
      return clone(values);
    }
    return clone(values);
  }

  updateRows(table: unknown, values: Row, condition: unknown) {
    const name = tableName(table);
    const params = conditionParams(condition);
    const pairs = columnParamPairs(condition);
    if (name === tableName(cardInstance) || name === tableName(packInstance)) {
      const target =
        name === tableName(cardInstance) ? this.state.cards : this.state.packs;
      const rows = target.filter((row) =>
        GiftDatabaseHarness.assetRowsMatch(row, pairs, params)
      );
      for (const row of rows) {
        Object.assign(row, values);
      }
      return clone(rows);
    }
    if (name === tableName(collectibleCustody)) {
      const rows = this.state.custody.filter(
        (row) =>
          row.releasedAt === undefined &&
          pairs.some(
            ({ column, value }) =>
              column === "gift_offer_id" && row.giftOfferId === value
          )
      );
      for (const row of rows) {
        Object.assign(row, values);
      }
      return clone(rows);
    }
    if (name === tableName(giftOffer)) {
      const rows = this.state.offers.filter((row) =>
        rowMatchesPairs(row, pairs)
      );
      for (const row of rows) {
        Object.assign(row, values);
      }
      return clone(rows);
    }
    if (name === tableName(profileSettings)) {
      const rows = this.state.profileSettings.filter((row) =>
        rowMatchesPairs(row, pairs)
      );
      for (const row of rows) {
        Object.assign(row, values);
      }
      return clone(rows);
    }
    return [];
  }

  private static participantIds(params: unknown[]) {
    const known = new Set(["sender", "recipient", "outsider"]);
    return [
      ...new Set(
        params.filter(
          (value): value is string =>
            typeof value === "string" && known.has(value)
        )
      ),
    ];
  }

  private static assetRowsMatch(
    row: Row,
    pairs: { column: string; value: unknown }[],
    params: unknown[]
  ) {
    const id = pairs.find(({ column }) => column === "id")?.value;
    if (typeof id === "string" && row.id !== id) {
      return false;
    }
    const owner = pairs.find(({ column }) => column === "owner_user_id")?.value;
    if (typeof owner === "string" && row.ownerUserId !== owner) {
      return false;
    }
    return typeof id !== "string" && params.length > 0
      ? params.includes(row.id)
      : true;
  }

  private static giftRowMatches(
    row: Row,
    pairs: { column: string; value: unknown }[],
    params: unknown[]
  ) {
    const cursorSentAt = pairs.find(
      ({ column, value }) => column === "sent_at" && value instanceof Date
    )?.value;
    const cursorId = pairs.find(({ column }) => column === "id")?.value;
    const hasCursor =
      cursorSentAt instanceof Date && typeof cursorId === "string";
    const id = hasCursor
      ? undefined
      : pairs.find(({ column }) => column === "id")?.value;
    if (typeof id === "string" && row.id !== id) {
      return false;
    }
    const idempotencyKey = pairs.find(
      ({ column }) => column === "idempotency_key"
    )?.value;
    if (typeof idempotencyKey === "string") {
      return row.idempotencyKey === idempotencyKey;
    }
    const sender = pairs.find(
      ({ column }) => column === "sender_user_id"
    )?.value;
    const recipient = pairs.find(
      ({ column }) => column === "recipient_user_id"
    )?.value;
    if (typeof sender === "string" && typeof recipient === "string") {
      if (sender === recipient) {
        if (row.senderUserId !== sender && row.recipientUserId !== recipient) {
          return false;
        }
      } else if (
        !(
          (row.senderUserId === sender && row.recipientUserId === recipient) ||
          (row.senderUserId === recipient && row.recipientUserId === sender)
        )
      ) {
        return false;
      }
    } else if (typeof sender === "string" && row.senderUserId !== sender) {
      return false;
    } else if (
      typeof recipient === "string" &&
      row.recipientUserId !== recipient
    ) {
      return false;
    }
    const state = pairs.find(({ column }) => column === "state")?.value;
    if (typeof state === "string" && row.state !== state) {
      return false;
    }
    if (
      hasCursor &&
      row.sentAt instanceof Date &&
      cursorSentAt instanceof Date &&
      typeof cursorId === "string"
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
    const date = pairs.find(
      ({ column, value }) => column === "expires_at" && value instanceof Date
    )?.value;
    if (
      date instanceof Date &&
      row.expiresAt instanceof Date &&
      row.expiresAt > date
    ) {
      return false;
    }
    if (pairs.length === 0 && params.length === 0) {
      return true;
    }
    return true;
  }
}

type GiftDatabase = Parameters<typeof sendGiftOfferCommand>[0];

function sendGift(
  database: GiftDatabaseHarness,
  senderUserId: string,
  input: Parameters<typeof sendGiftOfferCommand>[2]
) {
  return sendGiftOfferCommand(
    database as unknown as GiftDatabase,
    senderUserId,
    input
  );
}

type GiftAction = Parameters<typeof acceptGiftOfferCommand>[2];

function acceptGift(
  database: GiftDatabaseHarness,
  actorUserId: string,
  input: GiftAction
) {
  return acceptGiftOfferCommand(
    database as unknown as GiftDatabase,
    actorUserId,
    input
  );
}

function rejectGift(
  database: GiftDatabaseHarness,
  actorUserId: string,
  input: GiftAction
) {
  return rejectGiftOfferCommand(
    database as unknown as GiftDatabase,
    actorUserId,
    input
  );
}

function cancelGift(
  database: GiftDatabaseHarness,
  actorUserId: string,
  input: GiftAction
) {
  return cancelGiftOfferCommand(
    database as unknown as GiftDatabase,
    actorUserId,
    input
  );
}

const baseInput = (
  idempotencyKey = "gift-send-1",
  assets: GiftAsset[] = [
    { assetId: "card-sender", kind: "card" },
    { assetId: "pack-sender", kind: "pack" },
  ]
) => ({
  assets,
  idempotencyKey,
  recipientUserId: "recipient",
});

function seedGiftOffer(
  database: GiftDatabaseHarness,
  input: {
    id: string;
    recipientUserId: string;
    senderUserId: string;
    sentAt: Date;
    state?: string;
    assetCount?: number;
  }
) {
  const state = input.state ?? "sent";
  const assetCount = input.assetCount ?? 1;
  database.state.offers.push({
    actorUserId: input.senderUserId,
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    fingerprint: `fingerprint-${input.id}`,
    id: input.id,
    idempotencyKey: `idempotency-${input.id}`,
    recipientUserId: input.recipientUserId,
    senderConfirmedAt: input.sentAt,
    senderUserId: input.senderUserId,
    sentAt: input.sentAt,
    source: "gifts.send",
    state,
    termsHash: `terms-${input.id}`,
    version: state === "sent" ? 1 : 2,
  });
  for (let index = 0; index < assetCount; index += 1) {
    database.state.custody.push({
      acquiredAt: input.sentAt,
      cardInstanceId: `${input.id}-asset-${index}`,
      giftOfferId: input.id,
      id: `${input.id}-custody-${index}`,
      side: "proposer",
    });
  }
}

beforeEach(() => {
  notifications.calls.length = 0;
});

describe("gift offer authoritative state machine", () => {
  it("blocks an unopened Pack from gifts when its historical revision is disabled", async () => {
    const database = new GiftDatabaseHarness();
    database.state.revisionAvailability = "disabled";

    await expect(
      sendGift(
        database,
        "sender",
        baseInput("gift-disabled-revision", [
          { assetId: "pack-sender", kind: "pack" },
        ])
      )
    ).rejects.toMatchObject({ code: "ASSET_UNAVAILABLE" });
    expect(database.state.offers).toHaveLength(0);
    expect(database.state.custody).toHaveLength(0);
  });

  it("sends an exact single-asset gift and a 50-item mixed bundle without a ledger posting", async () => {
    const database = new GiftDatabaseHarness();
    const singleInput = baseInput("gift-send-single", [
      { assetId: "card-sender", kind: "card" },
    ]);
    const first = await sendGift(database, "sender", singleInput);

    expect(first).toMatchObject({ replayed: false, state: "sent", version: 1 });
    expect(database.state.offers).toHaveLength(1);
    expect(database.state.custody).toHaveLength(1);
    expect(database.state.custody[0]).toMatchObject({
      cardInstanceId: "card-sender",
      giftOfferId: first.giftId,
    });
    expect(database.state.events).toHaveLength(0);
    expect(notifications.calls).toHaveLength(1);
    expect(notifications.calls[0]?.targetUserId).toBe("recipient");

    const replay = await sendGift(database, "sender", singleInput);
    expect(replay).toMatchObject({
      giftId: first.giftId,
      replayed: true,
      state: "sent",
    });
    await expect(
      sendGift(database, "sender", {
        ...singleInput,
        assets: [{ assetId: "card-recipient", kind: "card" }],
      })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(database.state.offers).toHaveLength(1);
    expect(database.state.custody).toHaveLength(1);
    expect(notifications.calls).toHaveLength(1);

    const bundleDatabase = new GiftDatabaseHarness();
    const fiftyCards = Array.from({ length: 25 }, (_, index) => ({
      availability: "active",
      binding: "transferable",
      id: `card-${index}`,
      lifecycle: "active",
      ownerUserId: "sender",
      packInstanceId: null,
      templateAvailability: "active",
    }));
    const fiftyPacks = Array.from({ length: 25 }, (_, index) => ({
      availability: "active",
      binding: "transferable",
      id: `pack-${index}`,
      ownerUserId: "sender",
      revisionId: "revision-pack",
      state: "unopened",
      templateLifecycle: "active",
    }));
    bundleDatabase.state.cards.push(...fiftyCards);
    bundleDatabase.state.packs.push(...fiftyPacks);
    const assets = [
      ...fiftyCards.map(({ id }) => ({
        assetId: id as string,
        kind: "card" as const,
      })),
      ...fiftyPacks.map(({ id }) => ({
        assetId: id as string,
        kind: "pack" as const,
      })),
    ];
    const fifty = await sendGift(
      bundleDatabase,
      "sender",
      baseInput("gift-send-50", assets)
    );
    expect(fifty.state).toBe("sent");
    expect(
      bundleDatabase.state.custody.filter(
        (row) => row.giftOfferId === fifty.giftId
      )
    ).toHaveLength(50);
  });

  it("requires the recipient to explicitly accept and transfers all assets atomically", async () => {
    const database = new GiftDatabaseHarness();
    const sent = await sendGift(database, "sender", baseInput());

    await expect(
      acceptGift(database, "sender", {
        giftId: sent.giftId,
        idempotencyKey: "accept-by-sender",
      })
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(database.state.cards[0]?.ownerUserId).toBe("sender");

    const accepted = await acceptGift(database, "recipient", {
      giftId: sent.giftId,
      idempotencyKey: "accept-one",
    });
    expect(accepted).toMatchObject({ replayed: false, state: "accepted" });
    expect(
      database.state.cards.find((row) => row.id === "card-sender")?.ownerUserId
    ).toBe("recipient");
    expect(
      database.state.packs.find((row) => row.id === "pack-sender")?.ownerUserId
    ).toBe("recipient");
    expect(
      database.state.custody.every((row) => row.releasedAt instanceof Date)
    ).toBe(true);
    expect(database.state.events).toHaveLength(2);
    expect(database.state.events.every((event) => event.kind === "gift")).toBe(
      true
    );
    expect(
      database.state.events.every((event) => event.sourceType === "gift.accept")
    ).toBe(true);
    expect(notifications.calls.map((call) => call.targetUserId)).toEqual([
      "recipient",
      "sender",
    ]);
  });

  it("rejects preference, block, binding, and duplicate violations before creating custody", async () => {
    const preferenceDatabase = new GiftDatabaseHarness();
    preferenceDatabase.state.profileSettings[1]!.inboundGiftsEnabled = false;
    await expect(
      sendGift(preferenceDatabase, "sender", baseInput())
    ).rejects.toMatchObject({
      code: "PREFERENCE_DISABLED",
    });
    expect(preferenceDatabase.state.offers).toHaveLength(0);

    const blockedDatabase = new GiftDatabaseHarness();
    blockedDatabase.state.blocks.push({
      blockedUserId: "recipient",
      blockerUserId: "sender",
    });
    await expect(
      sendGift(blockedDatabase, "sender", baseInput())
    ).rejects.toMatchObject({
      code: "ACCOUNT_BLOCKED",
    });

    const boundDatabase = new GiftDatabaseHarness();
    boundDatabase.state.cards[0]!.binding = "account-bound";
    await expect(
      sendGift(boundDatabase, "sender", baseInput())
    ).rejects.toMatchObject({
      code: "BINDING_NOT_TRANSFERABLE",
    });

    const duplicateDatabase = new GiftDatabaseHarness();
    await expect(
      sendGift(duplicateDatabase, "sender", {
        ...baseInput("gift-duplicate"),
        assets: [
          { assetId: "card-sender", kind: "card" },
          { assetId: "card-sender", kind: "pack" },
        ],
      })
    ).rejects.toThrow("Un regalo no puede repetir");
  });

  it("supports cancellation, rejection, expiry, preference shutdown, replay, and conflict without transfer", async () => {
    const cancelledDatabase = new GiftDatabaseHarness();
    const cancelled = await sendGift(cancelledDatabase, "sender", baseInput());
    const cancelledResult = await cancelGift(cancelledDatabase, "sender", {
      giftId: cancelled.giftId,
      idempotencyKey: "cancel-one",
    });
    expect(cancelledResult.state).toBe("cancelled");
    expect(cancelledDatabase.state.cards[0]?.ownerUserId).toBe("sender");
    expect(
      cancelledDatabase.state.custody.every(
        (row) => row.releasedAt instanceof Date
      )
    ).toBe(true);
    await expect(
      cancelGift(cancelledDatabase, "sender", {
        giftId: cancelled.giftId,
        idempotencyKey: "cancel-one",
      })
    ).resolves.toMatchObject({ replayed: true, state: "cancelled" });
    await expect(
      cancelGift(cancelledDatabase, "sender", {
        giftId: cancelled.giftId,
        idempotencyKey: "cancel-one",
      })
    ).resolves.toMatchObject({ replayed: true });

    await expect(
      rejectGift(cancelledDatabase, "recipient", {
        giftId: cancelled.giftId,
        idempotencyKey: "cancel-one",
      })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });

    const rejectedDatabase = new GiftDatabaseHarness();
    const rejected = await sendGift(rejectedDatabase, "sender", baseInput());
    await expect(
      rejectGift(rejectedDatabase, "recipient", {
        giftId: rejected.giftId,
        idempotencyKey: "reject-one",
      })
    ).resolves.toMatchObject({ state: "rejected" });

    const expiredDatabase = new GiftDatabaseHarness();
    const expired = await sendGift(expiredDatabase, "sender", baseInput());
    const expiredAt = new Date(expired.expiresAt.getTime() + 1);
    await expect(
      acceptGift(expiredDatabase, "recipient", {
        giftId: expired.giftId,
        idempotencyKey: "accept-expired",
        now: expiredAt,
      })
    ).resolves.toMatchObject({ state: "expired" });
    expect(expiredDatabase.state.offers[0]?.state).toBe("expired");

    const preferenceDatabase = new GiftDatabaseHarness();
    await sendGift(preferenceDatabase, "sender", baseInput());
    await expect(
      updateInboundGiftPreference(
        preferenceDatabase as unknown as GiftDatabase,
        "recipient",
        false,
        { now: new Date("2026-08-17T00:00:00.000Z") }
      )
    ).resolves.toMatchObject({ inboundGiftsEnabled: false });
    expect(preferenceDatabase.state.offers[0]?.state).toBe("cancelled");
    expect(
      preferenceDatabase.state.custody.every(
        (row) => row.releasedAt instanceof Date
      )
    ).toBe(true);
  });

  it("rolls back gift, custody, and history when the transaction fails", async () => {
    const database = new GiftDatabaseHarness();
    database.state.failOnHistoryInsert = true;
    await expect(sendGift(database, "sender", baseInput())).rejects.toThrow(
      "history failed"
    );
    expect(database.state.offers).toHaveLength(0);
    expect(database.state.custody).toHaveLength(0);
    expect(database.state.histories).toHaveLength(0);
  });

  it("rolls back every transfer-side effect when a later ownership event fails", async () => {
    const database = new GiftDatabaseHarness();
    const sent = await sendGift(database, "sender", baseInput());
    const before = {
      cards: clone(database.state.cards),
      custody: clone(database.state.custody),
      events: clone(database.state.events),
      histories: clone(database.state.histories),
      offers: clone(database.state.offers),
      packs: clone(database.state.packs),
    };
    database.state.failOnOwnershipEventAt = 1;

    await expect(
      acceptGift(database, "recipient", {
        giftId: sent.giftId,
        idempotencyKey: "accept-rollback-after-transfer",
      })
    ).rejects.toThrow("ownership event failed");

    expect(database.state.cards).toEqual(before.cards);
    expect(database.state.packs).toEqual(before.packs);
    expect(database.state.custody).toEqual(before.custody);
    expect(database.state.offers).toEqual(before.offers);
    expect(database.state.histories).toEqual(before.histories);
    expect(database.state.events).toEqual(before.events);
  });

  it("serializes competing terminal commands and keeps reads private and paginated", async () => {
    const database = new GiftDatabaseHarness();
    const sent = await sendGift(database, "sender", baseInput());
    const [first, second] = await Promise.allSettled([
      acceptGift(database, "recipient", {
        giftId: sent.giftId,
        idempotencyKey: "concurrent-accept",
      }),
      rejectGift(database, "recipient", {
        giftId: sent.giftId,
        idempotencyKey: "concurrent-reject",
      }),
    ]);
    expect([first.status, second.status].toSorted()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(database.state.offers[0]?.state).toMatch(/accepted|rejected/);
    expect(database.state.events.length).toBe(
      database.state.offers[0]?.state === "accepted" ? 2 : 0
    );

    const privateDatabase = new GiftDatabaseHarness();
    const privateGift = await sendGift(privateDatabase, "sender", baseInput());
    await expect(
      getGiftOffer(
        privateDatabase as unknown as GiftDatabase,
        "outsider",
        privateGift.giftId
      )
    ).resolves.toBeNull();
    await expect(
      listGiftOffers(privateDatabase as unknown as GiftDatabase, "sender", {
        limit: 1,
      })
    ).resolves.toMatchObject({
      items: [{ id: privateGift.giftId, assetCount: 2 }],
    });
  });

  it("paginates private gift summaries with a stable timestamp/id cursor and bounded counts", async () => {
    const database = new GiftDatabaseHarness();
    const tieTimestamp = new Date("2026-08-16T12:00:00.000Z");
    seedGiftOffer(database, {
      assetCount: 2,
      id: "gift-c",
      recipientUserId: "recipient",
      senderUserId: "sender",
      sentAt: tieTimestamp,
    });
    seedGiftOffer(database, {
      assetCount: 1,
      id: "gift-b",
      recipientUserId: "recipient",
      senderUserId: "sender",
      sentAt: tieTimestamp,
    });
    seedGiftOffer(database, {
      assetCount: 3,
      id: "gift-a",
      recipientUserId: "recipient",
      senderUserId: "sender",
      sentAt: tieTimestamp,
    });
    seedGiftOffer(database, {
      assetCount: 4,
      id: "gift-accepted",
      recipientUserId: "recipient",
      senderUserId: "sender",
      sentAt: new Date("2026-08-15T12:00:00.000Z"),
      state: "accepted",
    });
    seedGiftOffer(database, {
      assetCount: 5,
      id: "gift-foreign",
      recipientUserId: "recipient",
      senderUserId: "outsider",
      sentAt: new Date("2026-08-15T12:00:00.000Z"),
    });

    const firstPage = await listGiftOffers(
      database as unknown as GiftDatabase,
      "sender",
      { limit: 2, state: "sent" }
    );
    expect(firstPage.items.map(({ id }) => id)).toEqual(["gift-c", "gift-b"]);
    expect(firstPage.nextCursor).toBe(`${tieTimestamp.toISOString()}|gift-b`);
    expect(firstPage.items.map(({ assetCount }) => assetCount)).toEqual([2, 1]);
    expect(firstPage.items[0]).not.toHaveProperty("termsHash");
    expect(firstPage.items[0]).not.toHaveProperty("assets");
    expect(Object.keys(firstPage.items[0] ?? {}).toSorted()).toEqual([
      "assetCount",
      "expiresAt",
      "id",
      "recipientUserId",
      "senderUserId",
      "sentAt",
      "state",
      "version",
    ]);

    const secondPage = await listGiftOffers(
      database as unknown as GiftDatabase,
      "sender",
      { cursor: firstPage.nextCursor ?? undefined, limit: 2, state: "sent" }
    );
    expect(secondPage.items.map(({ id }) => id)).toEqual(["gift-a"]);
    expect(secondPage.nextCursor).toBeNull();

    const accepted = await listGiftOffers(
      database as unknown as GiftDatabase,
      "sender",
      { limit: 10, state: "accepted" }
    );
    expect(accepted.items.map(({ id }) => id)).toEqual(["gift-accepted"]);

    const sent = await listGiftOffers(
      database as unknown as GiftDatabase,
      "sender",
      { limit: 10, state: "sent" },
      "sent"
    );
    expect(sent.items.map(({ id }) => id)).toEqual([
      "gift-c",
      "gift-b",
      "gift-a",
    ]);
    const inbox = await listGiftOffers(
      database as unknown as GiftDatabase,
      "recipient",
      { limit: 10, state: "sent" },
      "inbox"
    );
    expect(inbox.items.map(({ id }) => id)).toEqual([
      "gift-c",
      "gift-b",
      "gift-a",
      "gift-foreign",
    ]);
  });

  it("closes Sent gifts in both directions through canonical blocking and releases custody once", async () => {
    const database = new GiftDatabaseHarness();
    seedGiftOffer(database, {
      assetCount: 2,
      id: "gift-sender-to-recipient",
      recipientUserId: "recipient",
      senderUserId: "sender",
      sentAt: new Date("2026-08-16T12:00:00.000Z"),
    });
    seedGiftOffer(database, {
      assetCount: 1,
      id: "gift-recipient-to-sender",
      recipientUserId: "sender",
      senderUserId: "recipient",
      sentAt: new Date("2026-08-16T12:01:00.000Z"),
    });
    const ownersBefore = {
      cards: clone(database.state.cards),
      packs: clone(database.state.packs),
    };

    const first = await blockTradeUser(
      database as unknown as Parameters<typeof blockTradeUser>[0],
      "recipient",
      "sender",
      { now: new Date("2026-08-16T12:02:00.000Z") }
    );
    const releaseTimes = database.state.custody.map((row) => row.releasedAt);
    const historyCount = database.state.histories.length;
    const replay = await blockTradeUser(
      database as unknown as Parameters<typeof blockTradeUser>[0],
      "recipient",
      "sender",
      { now: new Date("2026-08-16T12:03:00.000Z") }
    );

    expect(first).toEqual({ blocked: true, closedOfferIds: [] });
    expect(replay).toEqual({ blocked: true, closedOfferIds: [] });
    expect(database.state.blocks).toHaveLength(1);
    expect(database.state.offers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "gift-sender-to-recipient",
          state: "administratively-cancelled",
        }),
        expect.objectContaining({
          id: "gift-recipient-to-sender",
          state: "administratively-cancelled",
        }),
      ])
    );
    expect(
      database.state.custody.every((row) => row.releasedAt instanceof Date)
    ).toBe(true);
    expect(database.state.custody.map((row) => row.releasedAt)).toEqual(
      releaseTimes
    );
    expect(database.state.histories).toHaveLength(historyCount);
    expect(database.state.cards).toEqual(ownersBefore.cards);
    expect(database.state.packs).toEqual(ownersBefore.packs);
    expect(notifications.calls).toHaveLength(2);
    expect(
      notifications.calls.every((call) => call.targetUserId === "sender")
    ).toBe(true);
  });

  it("uses the same bounded scheduled expiry transition as lazy expiry", async () => {
    const database = new GiftDatabaseHarness();
    const sent = await sendGift(database, "sender", baseInput());
    const now = new Date(sent.expiresAt.getTime() + 1);
    const result = await expireCollectibleGiftOffersBatch(
      database as unknown as GiftDatabase,
      { now, limit: 1 }
    );
    expect(result).toMatchObject({
      checked: 1,
      expired: 1,
      giftIds: [sent.giftId],
    });
    expect(database.state.offers[0]?.state).toBe("expired");
    expect(
      database.state.custody.every((row) => row.releasedAt instanceof Date)
    ).toBe(true);
    expect(GIFT_OFFER_EXPIRY_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
