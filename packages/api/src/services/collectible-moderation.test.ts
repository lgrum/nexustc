import { beforeEach, describe, expect, it, vi } from "vitest";

// The local Drizzle double intentionally implements several builder classes and
// a thenable query surface so the service tests exercise transaction boundaries.
// Keep production lint rules active for the behavior assertions below.
// oxlint-disable eslint/class-methods-use-this, eslint/curly, eslint/max-classes-per-file, eslint/no-shadow, eslint/require-await, typescript/parameter-properties, unicorn/no-thenable

type Column = { key: string; table: Table };
type Table = { columns: Record<string, Column>; name: string };
type Row = Record<string, unknown>;
type Condition =
  | { kind: "and"; values: Condition[] }
  | { kind: "eq"; column: Column; value: unknown }
  | { kind: "is-null"; column: Column };
type TableState = {
  cardInstance: Row[];
  cardTemplate: Row[];
  cardTemplateAuditEvent: Row[];
  collectibleAdminAction: Row[];
  collectibleCustody: Row[];
  gachaponMachine: Row[];
  giftOffer: Row[];
  marketListing: Row[];
  officialCardShopOffer: Row[];
  packInstance: Row[];
  packRevision: Row[];
  tradeOffer: Row[];
};

function createTable(name: string, keys: string[]): Table {
  const table = { columns: {}, name } as Table;
  table.columns = Object.fromEntries(keys.map((key) => [key, { key, table }]));
  Object.assign(table, table.columns);
  return table;
}

const tables = vi.hoisted(() => {
  const make = (name: string, keys: string[]) => createTable(name, keys);
  return {
    cardInstance: make("cardInstance", [
      "id",
      "availability",
      "ownerUserId",
      "version",
      "updatedAt",
    ]),
    cardTemplate: make("cardTemplate", [
      "id",
      "availability",
      "version",
      "disabledAt",
      "disabledByUserId",
      "updatedAt",
      "updatedByUserId",
      "mintedSupply",
    ]),
    cardTemplateAuditEvent: createTable("cardTemplateAuditEvent", []),
    collectibleAdminAction: createTable("collectibleAdminAction", []),
    collectibleCustody: make("collectibleCustody", [
      "id",
      "cardInstanceId",
      "packInstanceId",
      "tradeOfferId",
      "giftOfferId",
      "blackMarketListingId",
      "releasedAt",
      "releaseReason",
      "updatedAt",
      "createdAt",
    ]),
    gachaponMachine: make("gachaponMachine", [
      "id",
      "state",
      "version",
      "updatedAt",
      "updatedByUserId",
    ]),
    giftOffer: make("giftOffer", ["id", "state", "version"]),
    officialCardShopOffer: make("officialCardShopOffer", [
      "id",
      "enabled",
      "version",
      "updatedAt",
      "updatedByUserId",
    ]),
    packInstance: make("packInstance", [
      "id",
      "availability",
      "ownerUserId",
      "version",
      "updatedAt",
    ]),
    packRevision: make("packRevision", [
      "id",
      "availability",
      "version",
      "updatedAt",
      "updatedByUserId",
    ]),
    tradeOffer: make("tradeOffer", ["id", "state", "version"]),
  };
});

const state = vi.hoisted(() => ({
  actions: [] as Row[],
  failAssetUpdate: false,
  tables: {} as TableState,
}));

vi.mock("@repo/db/schema/app", () => tables);
vi.mock("@repo/db", () => ({
  and: (...values: (Condition | undefined)[]) => ({
    kind: "and",
    values: values.filter(Boolean),
  }),
  asc: (column: Column) => ({ direction: "asc", column }),
  eq: (column: Column, value: unknown) => ({ kind: "eq", column, value }),
  isNull: (column: Column) => ({ kind: "is-null", column }),
}));
vi.mock("./collectibles", () => ({
  assertCollectiblesMutationAllowed: ({
    impersonated,
  }: {
    impersonated?: boolean;
  }) => {
    if (impersonated) {
      throw Object.assign(new Error("impersonated"), {
        code: "POLICY_BLOCKED",
      });
    }
  },
  withCollectibleDeadlockRetry: <T>(operation: () => Promise<T>) => operation(),
}));
vi.mock("./black-market", () => ({
  administrativelyCancelBlackMarketListingInTransaction: vi.fn(
    async (
      _tx: unknown,
      _actorUserId: string,
      listingId: string,
      _reason: string,
      _idempotencyKey: string,
      _now: Date
    ) => {
      const listing = state.tables.marketListing?.find(
        (row) => row.id === listingId
      );
      if (listing) {
        listing.state = "cancelled";
        listing.version = Number(listing.version) + 1;
      }
      return { replayed: false, state: "cancelled", version: 2 };
    }
  ),
}));
vi.mock("./gift-offer", () => ({
  closeSentGiftOfferInTransaction: vi.fn(async (_tx: unknown, offer: Row) => {
    offer.state = "cancelled";
    offer.version = Number(offer.version) + 1;
    return { state: "cancelled", version: offer.version };
  }),
}));
vi.mock("./trade-offer", () => ({
  closeSentTradeOfferInTransaction: vi.fn(async (_tx: unknown, offer: Row) => {
    offer.state = "cancelled";
    offer.version = Number(offer.version) + 1;
    return { state: "cancelled", version: offer.version };
  }),
}));
vi.mock("./collectible-admin-action", () => ({
  collectibleAdminActionFingerprint: (input: Row) =>
    JSON.stringify({
      action: input.action,
      actorUserId: input.actorUserId ?? null,
      expectedVersion: input.expectedVersion ?? null,
      idempotencyKey: input.idempotencyKey,
      reason: String(input.reason).trim(),
      targetId: input.targetId,
      targetKind: input.targetKind,
      version: input.version,
    }),
  getCollectibleAdminActionByIdempotencyKey: async (
    _tx: unknown,
    idempotencyKey: string
  ) => state.actions.find((row) => row.idempotencyKey === idempotencyKey),
  appendCollectibleAdminAction: async (_tx: unknown, input: Row) => {
    const fingerprint = JSON.stringify({
      action: input.action,
      actorUserId: input.actorUserId ?? null,
      expectedVersion: input.expectedVersion ?? null,
      idempotencyKey: input.idempotencyKey,
      reason: String(input.reason).trim(),
      targetId: input.targetId,
      targetKind: input.targetKind,
      version: input.version,
    });
    const existing = state.actions.find(
      (row) => row.idempotencyKey === input.idempotencyKey
    );
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw Object.assign(new Error("conflict"), {
          code: "IDEMPOTENCY_CONFLICT",
        });
      }
      return {
        actionId: existing.id,
        createdAt: existing.createdAt,
        replayed: true,
        version: existing.version,
      };
    }
    const row = {
      action: input.action,
      after: input.after ?? {},
      before: input.before ?? {},
      fingerprint,
      id: `action-${state.actions.length + 1}`,
      idempotencyKey: input.idempotencyKey,
      version: input.version,
      createdAt: new Date("2026-08-17T00:00:00.000Z"),
    };
    state.actions.push(row);
    return {
      actionId: row.id,
      createdAt: row.createdAt,
      replayed: false,
      version: row.version,
    };
  },
}));

function readColumn(column: Column, row: Row) {
  return row[column.key];
}

function matches(condition: Condition | undefined, row: Row): boolean {
  if (!condition) return true;
  if (condition.kind === "and") {
    return condition.values.every((value) => matches(value, row));
  }
  if (condition.kind === "eq") {
    return readColumn(condition.column, row) === condition.value;
  }
  return (
    readColumn(condition.column, row) === null ||
    readColumn(condition.column, row) === undefined
  );
}

class SelectQuery {
  private condition: Condition | undefined;
  private limitValue: number | undefined;
  private projection: Record<string, Column> | undefined;
  private table: Table | undefined;

  constructor(private readonly database: FakeDatabase) {}

  from(table: Table) {
    this.table = table;
    return this;
  }

  where(condition: Condition) {
    this.condition = condition;
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  orderBy() {
    return this;
  }

  for() {
    return this;
  }

  then<TResult1 = Row[], TResult2 = never>(
    onfulfilled?: ((value: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    const rows = (this.database.rows(this.table) ?? []).filter((row) =>
      matches(this.condition, row)
    );
    const limited = this.limitValue ? rows.slice(0, this.limitValue) : rows;
    const result = this.projection
      ? limited.map((row) =>
          Object.fromEntries(
            Object.entries(this.projection!).map(([key, column]) => [
              key,
              readColumn(column, row),
            ])
          )
        )
      : limited;
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

class UpdateQuery {
  private applied: Row[] = [];
  private condition: Condition | undefined;
  private values: Row = {};

  constructor(
    private readonly database: FakeDatabase,
    private readonly table: Table
  ) {}

  set(values: Row) {
    this.values = values;
    return this;
  }

  where(condition: Condition) {
    this.condition = condition;
    this.applied = this.apply();
    return this;
  }

  private apply() {
    if (this.table.name === "cardInstance" && state.failAssetUpdate) {
      return [];
    }
    const rows = this.database.rows(this.table) ?? [];
    const updated = rows.filter((row) => matches(this.condition, row));
    for (const row of updated) Object.assign(row, this.values);
    return updated;
  }

  returning(projection?: Record<string, Column>) {
    if (!projection) return Promise.resolve(this.applied);
    return Promise.resolve(
      this.applied.map((row) =>
        Object.fromEntries(
          Object.entries(projection).map(([key, column]) => [
            key,
            readColumn(column, row),
          ])
        )
      )
    );
  }
}

class InsertQuery {
  private valuesValue: Row[] = [];

  constructor(
    private readonly database: FakeDatabase,
    private readonly table: Table
  ) {}

  values(values: Row | Row[]) {
    this.valuesValue = Array.isArray(values) ? values : [values];
    this.database.rows(this.table)?.push(...this.valuesValue);
    return this;
  }

  returning() {
    return Promise.resolve(this.valuesValue);
  }
}

class FakeDatabase {
  rows(table: Table | undefined) {
    return table ? state.tables[table.name as keyof TableState] : undefined;
  }

  select(projection?: Record<string, Column>) {
    const query = new SelectQuery(this);
    query["projection"] = projection;
    return query;
  }

  update(table: Table) {
    return new UpdateQuery(this, table);
  }

  insert(table: Table) {
    return new InsertQuery(this, table);
  }

  async transaction<T>(callback: (tx: FakeDatabase) => Promise<T>) {
    const snapshot = structuredClone(state.tables);
    const actionSnapshot = [...state.actions];
    try {
      return await callback(this);
    } catch (error) {
      state.tables = snapshot;
      state.actions = actionSnapshot;
      throw error;
    }
  }
}

const database = new FakeDatabase();

function row(values: Row) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, value])
  );
}

function resetState() {
  state.actions = [];
  state.failAssetUpdate = false;
  state.tables = {
    cardInstance: [],
    cardTemplate: [],
    cardTemplateAuditEvent: [],
    collectibleAdminAction: [],
    collectibleCustody: [],
    gachaponMachine: [],
    giftOffer: [],
    marketListing: [],
    officialCardShopOffer: [],
    packInstance: [],
    packRevision: [],
    tradeOffer: [],
  };
}

function moderationInput(overrides: Row = {}) {
  return {
    actorUserId: "owner-1",
    assetId: "card-1",
    custody: "retain" as const,
    expectedVersion: 1,
    idempotencyKey: "freeze-card-1",
    reason: "Incidente confirmado",
    ...overrides,
  };
}

// oxlint-enable eslint/class-methods-use-this, eslint/curly, eslint/max-classes-per-file, eslint/no-shadow, eslint/require-await, typescript/parameter-properties, unicorn/no-thenable

describe("collectible moderation authority", () => {
  beforeEach(resetState);

  it("freezes/restores cards without changing owner or mint semantics and replays safely", async () => {
    state.tables.cardInstance.push(
      row({
        availability: "active",
        id: "card-1",
        mintNumber: 42,
        ownerUserId: "owner-1",
        version: 1,
      })
    );
    const { freezeCardInstance, restoreCardInstance } =
      await import("./collectible-moderation");
    const first = await freezeCardInstance(
      database as never,
      moderationInput()
    );
    expect(first).toMatchObject({ availability: "frozen", version: 2 });
    expect(state.tables.cardInstance[0]).toMatchObject({
      availability: "frozen",
      mintNumber: 42,
      ownerUserId: "owner-1",
      version: 2,
    });
    const replay = await freezeCardInstance(
      database as never,
      moderationInput()
    );
    expect(replay.replayed).toBe(true);
    expect(state.tables.cardInstance[0]?.version).toBe(2);
    await expect(
      freezeCardInstance(
        database as never,
        moderationInput({ reason: "Otra decisión" })
      )
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(
      restoreCardInstance(
        database as never,
        moderationInput({
          expectedVersion: 2,
          idempotencyKey: "restore-card-1",
        })
      )
    ).resolves.toMatchObject({ availability: "active", version: 3 });
    await expect(
      freezeCardInstance(
        database as never,
        moderationInput({ impersonated: true })
      )
    ).rejects.toMatchObject({ code: "POLICY_BLOCKED" });
  });

  it("retains custody by default and releases custody parents atomically when requested", async () => {
    state.tables.packInstance.push(
      row({
        availability: "active",
        id: "pack-1",
        mintNumber: 7,
        ownerUserId: "owner-1",
        version: 1,
      })
    );
    state.tables.tradeOffer.push({ id: "trade-1", state: "sent", version: 1 });
    state.tables.giftOffer.push({ id: "gift-1", state: "sent", version: 1 });
    state.tables.marketListing.push({
      id: "listing-1",
      state: "active",
      version: 1,
    });
    state.tables.collectibleCustody.push(
      {
        id: "custody-trade",
        packInstanceId: "pack-1",
        releasedAt: null,
        tradeOfferId: "trade-1",
      },
      {
        giftOfferId: "gift-1",
        id: "custody-gift",
        packInstanceId: "pack-1",
        releasedAt: null,
      },
      {
        blackMarketListingId: "listing-1",
        id: "custody-listing",
        packInstanceId: "pack-1",
        releasedAt: null,
      }
    );
    const { freezePackInstance } = await import("./collectible-moderation");
    const result = await freezePackInstance(
      database as never,
      moderationInput({
        assetId: "pack-1",
        custody: "release",
        idempotencyKey: "freeze-pack-release",
      })
    );
    expect(result).toMatchObject({ custodyReleased: 3, version: 2 });
    expect(state.tables.packInstance[0]).toMatchObject({
      availability: "frozen",
      mintNumber: 7,
      ownerUserId: "owner-1",
    });
    expect(state.tables.tradeOffer[0]?.state).toBe("cancelled");
    expect(state.tables.giftOffer[0]?.state).toBe("cancelled");
    expect(state.tables.marketListing[0]?.state).toBe("cancelled");
    expect(
      state.tables.collectibleCustody.every((custody) => custody.releasedAt)
    ).toBe(true);
    const retained = state.tables.collectibleCustody.map((custody) => ({
      ...custody,
      releasedAt: null,
      releaseReason: undefined,
    }));
    state.tables.collectibleCustody = retained;
    state.tables.packInstance[0]!.availability = "active";
    state.tables.packInstance[0]!.version = 1;
    state.tables.tradeOffer[0] = { id: "trade-2", state: "sent", version: 1 };
    const retainedResult = await freezePackInstance(
      database as never,
      moderationInput({
        assetId: "pack-1",
        custody: "retain",
        idempotencyKey: "freeze-pack-retain",
      })
    );
    expect(retainedResult.custodyRetained).toBe(3);
    expect(
      state.tables.collectibleCustody.every((custody) => !custody.releasedAt)
    ).toBe(true);
  });

  it("rolls back a custody release when the versioned asset update cannot commit", async () => {
    state.tables.cardInstance.push(
      row({
        availability: "active",
        id: "card-1",
        ownerUserId: "owner-1",
        version: 1,
      })
    );
    state.tables.tradeOffer.push({ id: "trade-1", state: "sent", version: 1 });
    state.tables.collectibleCustody.push({
      id: "custody-1",
      cardInstanceId: "card-1",
      releasedAt: null,
      tradeOfferId: "trade-1",
    });
    state.failAssetUpdate = true;
    const { freezeCardInstance } = await import("./collectible-moderation");
    await expect(
      freezeCardInstance(
        database as never,
        moderationInput({ custody: "release", idempotencyKey: "rollback-1" })
      )
    ).rejects.toMatchObject({ code: "STALE_VERSION" });
    expect(state.tables.cardInstance[0]).toMatchObject({
      availability: "active",
      version: 1,
    });
    expect(state.tables.tradeOffer[0]).toMatchObject({
      state: "sent",
      version: 1,
    });
    expect(state.tables.collectibleCustody[0]?.releasedAt).toBeNull();
  });

  it("disables/restores presentation and owned shop/machine records without touching issued assets", async () => {
    state.tables.cardTemplate.push(
      row({
        availability: "active",
        id: "template-1",
        version: 1,
      })
    );
    state.tables.cardInstance.push({
      availability: "active",
      id: "card-1",
      mintNumber: 99,
      ownerUserId: "owner-1",
      version: 1,
    });
    state.tables.officialCardShopOffer.push({
      enabled: true,
      id: "offer-1",
      price: "10",
      version: 1,
    });
    state.tables.gachaponMachine.push({
      id: "machine-1",
      state: "active",
      version: 1,
    });
    const {
      changeCardTemplateAvailability,
      changeGachaponMachineAvailability,
      changeShopOfferAvailability,
    } = await import("./collectible-moderation");
    await changeCardTemplateAvailability(
      database as never,
      {
        actorUserId: "owner-1",
        expectedVersion: 1,
        idempotencyKey: "disable-template-1",
        reason: "Arte defectuoso",
        templateId: "template-1",
      },
      "disable"
    );
    expect(state.tables.cardTemplate[0]).toMatchObject({
      availability: "disabled",
      version: 2,
    });
    expect(state.tables.cardInstance[0]).toMatchObject({
      mintNumber: 99,
      ownerUserId: "owner-1",
    });
    await changeCardTemplateAvailability(
      database as never,
      {
        actorUserId: "owner-1",
        expectedVersion: 2,
        idempotencyKey: "restore-template-1",
        reason: "Arte corregido",
        templateId: "template-1",
      },
      "restore"
    );
    await changeShopOfferAvailability(
      database as never,
      {
        actorUserId: "owner-1",
        expectedVersion: 1,
        idempotencyKey: "disable-offer-1",
        offerId: "offer-1",
        reason: "Pausa comercial",
      },
      "disable"
    );
    await changeGachaponMachineAvailability(
      database as never,
      {
        actorUserId: "owner-1",
        expectedVersion: 1,
        idempotencyKey: "pause-machine-1",
        machineId: "machine-1",
        reason: "Revisión de máquina",
      },
      "pause"
    );
    expect(state.tables.officialCardShopOffer[0]).toMatchObject({
      enabled: false,
      price: "10",
      version: 2,
    });
    expect(state.tables.gachaponMachine[0]).toMatchObject({
      state: "paused",
      version: 2,
    });
  });
});
