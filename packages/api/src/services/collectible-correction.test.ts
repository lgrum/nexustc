import { beforeEach, describe, expect, it, vi } from "vitest";

// The local Drizzle double intentionally implements several builder classes and
// a thenable query surface so the service tests exercise transaction boundaries.
// Keep production lint rules active for the behavior assertions below.
// oxlint-disable eslint/class-methods-use-this, eslint/curly, eslint/max-classes-per-file, eslint/require-await, typescript/parameter-properties, unicorn/no-thenable

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
  collectibleAdminAction: Row[];
  collectibleCustody: Row[];
  collectibleOwnershipEvent: Row[];
  eterisTransaction: Row[];
  packInstance: Row[];
};

function makeTable(name: string, keys: string[]) {
  const table = { columns: {}, name } as Table;
  table.columns = Object.fromEntries(keys.map((key) => [key, { key, table }]));
  Object.assign(table, table.columns);
  return table;
}

const tables = vi.hoisted(() => ({
  cardInstance: makeTable("cardInstance", [
    "id",
    "ownerUserId",
    "version",
    "updatedAt",
  ]),
  cardTemplate: makeTable("cardTemplate", [
    "id",
    "version",
    "mintedSupply",
    "lifetimeSupplyCeiling",
  ]),
  collectibleAdminAction: makeTable("collectibleAdminAction", []),
  collectibleCustody: makeTable("collectibleCustody", [
    "id",
    "cardInstanceId",
    "packInstanceId",
    "releasedAt",
  ]),
  collectibleOwnershipEvent: makeTable("collectibleOwnershipEvent", []),
  eterisTransaction: makeTable("eterisTransaction", [
    "id",
    "kind",
    "sourceModule",
    "sequence",
    "reversesTransactionId",
  ]),
  packInstance: makeTable("packInstance", [
    "id",
    "ownerUserId",
    "version",
    "updatedAt",
  ]),
}));

const state = vi.hoisted(() => ({
  actions: [] as Row[],
  cards: [] as Row[],
  failEvent: false,
  issued: 0,
  tables: {} as TableState,
}));

vi.mock("@repo/db/schema/app", () => tables);
vi.mock("@repo/db", () => ({
  and: (...values: (Condition | undefined)[]) => ({
    kind: "and",
    values: values.filter(Boolean),
  }),
  cardInstance: tables.cardInstance,
  cardTemplate: tables.cardTemplate,
  collectibleCustody: tables.collectibleCustody,
  collectibleOwnershipEvent: tables.collectibleOwnershipEvent,
  eq: (column: Column, value: unknown) => ({ kind: "eq", column, value }),
  eterisTransaction: tables.eterisTransaction,
  isNull: (column: Column) => ({ kind: "is-null", column }),
  packInstance: tables.packInstance,
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
vi.mock("./collectible-issuance", () => ({
  issueCardInTransaction: vi.fn(async (_tx: unknown, input: Row) => {
    const template = state.tables.cardTemplate.find(
      (row) => row.id === input.templateId
    );
    if (
      template?.lifetimeSupplyCeiling !== null &&
      template?.lifetimeSupplyCeiling !== undefined &&
      Number(template.mintedSupply) >= Number(template.lifetimeSupplyCeiling)
    ) {
      throw Object.assign(new Error("supply exhausted"), {
        code: "EXHAUSTED_SUPPLY",
      });
    }
    state.issued += 1;
    if (template) {
      template.mintedSupply = Number(template.mintedSupply) + 1;
      template.version = Number(template.version) + 1;
    }
    const cardInstanceId = `card-issued-${state.issued}`;
    state.cards.push({
      binding: input.binding,
      id: cardInstanceId,
      ownerUserId: input.ownerUserId,
      templateId: input.templateId,
    });
    return {
      binding: input.binding,
      cardInstanceId,
      mintNumber: state.issued,
      templateId: input.templateId,
    };
  }),
}));
vi.mock("./collectible-ownership", () => ({
  appendCollectibleOwnershipEvent: vi.fn((_tx: unknown, input: Row) => {
    if (state.failEvent) throw new Error("ownership event failed");
    state.tables.collectibleOwnershipEvent.push(input);
    return input;
  }),
}));
vi.mock("./eteris", () => ({
  reverseEterisTransactionInTransaction: vi.fn(
    async (_tx: unknown, input: Row) => {
      const original = state.tables.eterisTransaction.find(
        (row) => row.id === input.transactionId
      );
      const id = `eteris-reversal-${state.tables.eterisTransaction.length}`;
      state.tables.eterisTransaction.push({
        id,
        reversesTransactionId: original?.id,
      });
      return { id };
    }
  ),
}));
vi.mock("./collectible-admin-action", () => ({
  collectibleAdminActionFingerprint: (input: Row) =>
    JSON.stringify({
      action: input.action,
      actorUserId: input.actorUserId ?? null,
      expectedVersion: input.expectedVersion ?? null,
      idempotencyKey: input.idempotencyKey,
      linkedEterisTransactionId: input.linkedEterisTransactionId ?? null,
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
      linkedEterisTransactionId: input.linkedEterisTransactionId ?? null,
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
      linkedEterisTransactionId: input.linkedEterisTransactionId,
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

function matches(condition: Condition | undefined, row: Row): boolean {
  if (!condition) return true;
  if (condition.kind === "and") {
    return condition.values.every((value) => matches(value, row));
  }
  if (condition.kind === "eq")
    return row[condition.column.key] === condition.value;
  return (
    row[condition.column.key] === null ||
    row[condition.column.key] === undefined
  );
}

class SelectQuery {
  private condition: Condition | undefined;
  private limitValue: number | undefined;
  private table: Table | undefined;

  constructor(
    private readonly database: FakeDatabase,
    private readonly projection?: Record<string, Column>
  ) {}

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
              row[column.key],
            ])
          )
        )
      : limited;
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

class UpdateQuery {
  private applied: Row[] = [];
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
    const rows = this.database.rows(this.table) ?? [];
    this.applied = rows.filter((row) => matches(condition, row));
    for (const row of this.applied) Object.assign(row, this.values);
    return this;
  }

  returning(projection?: Record<string, Column>) {
    if (!projection) return Promise.resolve(this.applied);
    return Promise.resolve(
      this.applied.map((row) =>
        Object.fromEntries(
          Object.entries(projection).map(([key, column]) => [
            key,
            row[column.key],
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
    return new SelectQuery(this, projection);
  }

  update(table: Table) {
    return new UpdateQuery(this, table);
  }

  insert(table: Table) {
    return new InsertQuery(this, table);
  }

  async transaction<T>(callback: (tx: FakeDatabase) => Promise<T>) {
    const snapshot = structuredClone(state.tables);
    const cardSnapshot = structuredClone(state.cards);
    const actionSnapshot = [...state.actions];
    const issuedSnapshot = state.issued;
    try {
      return await callback(this);
    } catch (error) {
      state.tables = snapshot;
      state.cards = cardSnapshot;
      state.actions = actionSnapshot;
      state.issued = issuedSnapshot;
      throw error;
    }
  }
}

const database = new FakeDatabase();

function resetState() {
  state.actions = [];
  state.cards = [];
  state.failEvent = false;
  state.issued = 0;
  state.tables = {
    cardInstance: [],
    cardTemplate: [],
    collectibleAdminAction: [],
    collectibleCustody: [],
    collectibleOwnershipEvent: [],
    eterisTransaction: [],
    packInstance: [],
  };
}

// oxlint-enable eslint/class-methods-use-this, eslint/curly, eslint/max-classes-per-file, eslint/require-await, typescript/parameter-properties, unicorn/no-thenable

describe("collectible correction authority", () => {
  beforeEach(resetState);

  it("enforces template version and supply ceilings before an exceptional grant", async () => {
    state.tables.cardTemplate.push({
      id: "template-1",
      lifetimeSupplyCeiling: 1,
      mintedSupply: 1,
      version: 1,
    });
    const { grantExceptionalCard } = await import("./collectible-correction");
    const input = {
      actorUserId: "owner-1",
      binding: "transferable" as const,
      expectedVersion: 1,
      idempotencyKey: "grant-ceiling-1",
      reason: "Recompensa verificada",
      targetUserId: "user-1",
      templateId: "template-1",
    };
    await expect(
      grantExceptionalCard(database as never, input)
    ).rejects.toMatchObject({
      code: "EXHAUSTED_SUPPLY",
    });
    expect(state.tables.cardTemplate[0]).toMatchObject({
      mintedSupply: 1,
      version: 1,
    });
    state.tables.cardTemplate[0]!.lifetimeSupplyCeiling = 2;
    const granted = await grantExceptionalCard(database as never, input);
    expect(granted).toMatchObject({
      cardInstanceId: "card-issued-1",
      templateId: "template-1",
      version: 2,
    });
    expect(state.cards[0]?.ownerUserId).toBe("user-1");
    const replay = await grantExceptionalCard(database as never, input);
    expect(replay.replayed).toBe(true);
    expect(state.cards).toHaveLength(1);
    await expect(
      grantExceptionalCard(database as never, {
        ...input,
        reason: "Otro motivo",
      })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(
      grantExceptionalCard(database as never, {
        ...input,
        idempotencyKey: "grant-impersonated",
        impersonated: true,
      })
    ).rejects.toMatchObject({ code: "POLICY_BLOCKED" });
  });

  it("transfers only the authoritative owner, blocks active custody, and rolls back event plus audit together", async () => {
    state.tables.cardInstance.push({
      id: "card-1",
      ownerUserId: "from-user",
      version: 1,
    });
    const { transferExceptionalCollectible } =
      await import("./collectible-correction");
    const input = {
      actorUserId: "owner-1",
      assetId: "card-1",
      expectedVersion: 1,
      fromUserId: "from-user",
      idempotencyKey: "transfer-1",
      kind: "card" as const,
      reason: "Propiedad corregida",
      toUserId: "to-user",
    };
    const first = await transferExceptionalCollectible(
      database as never,
      input
    );
    expect(first).toMatchObject({ ownerUserId: "to-user", version: 2 });
    expect(state.tables.collectibleOwnershipEvent).toHaveLength(1);
    const replay = await transferExceptionalCollectible(
      database as never,
      input
    );
    expect(replay.replayed).toBe(true);
    expect(state.tables.collectibleOwnershipEvent).toHaveLength(1);
    state.tables.cardInstance[0]!.ownerUserId = "from-user";
    state.tables.cardInstance[0]!.version = 1;
    state.tables.collectibleCustody.push({
      cardInstanceId: "card-1",
      id: "custody-1",
      releasedAt: null,
    });
    await expect(
      transferExceptionalCollectible(database as never, {
        ...input,
        idempotencyKey: "transfer-custody",
      })
    ).rejects.toMatchObject({ code: "ACTIVE_CUSTODY" });
    state.tables.collectibleCustody = [];
    state.failEvent = true;
    await expect(
      transferExceptionalCollectible(database as never, {
        ...input,
        idempotencyKey: "transfer-rollback",
      })
    ).rejects.toThrow("ownership event failed");
    expect(state.tables.cardInstance[0]).toMatchObject({
      ownerUserId: "from-user",
      version: 1,
    });
    expect(state.actions).toHaveLength(1);
  });

  it("reverses only verified commerce Eteris failures, links a separate audit, and leaves ownership untouched", async () => {
    state.tables.cardInstance.push({
      id: "card-1",
      ownerUserId: "owner-1",
      version: 3,
    });
    state.tables.eterisTransaction.push({
      id: "eteris-1",
      kind: "market_sale",
      sequence: 7n,
      sourceModule: "commerce",
    });
    const { reverseExceptionalEteris } =
      await import("./collectible-correction");
    const input = {
      actorUserId: "owner-1",
      expectedSequence: "7",
      failureCode: "settlement-failure" as const,
      idempotencyKey: "eteris-reversal-1",
      reason: "Falla de liquidación verificada",
      transactionId: "eteris-1",
      verifiedFailure: true as const,
    };
    const first = await reverseExceptionalEteris(database as never, input);
    expect(first).toMatchObject({
      originalTransactionId: "eteris-1",
      reversalTransactionId: "eteris-reversal-1",
    });
    expect(state.tables.eterisTransaction).toHaveLength(2);
    expect(state.tables.cardInstance[0]).toMatchObject({
      ownerUserId: "owner-1",
      version: 3,
    });
    expect(state.actions[0]).toMatchObject({
      action: "reverse-eteris",
      linkedEterisTransactionId: "eteris-1",
    });
    const replay = await reverseExceptionalEteris(database as never, input);
    expect(replay.replayed).toBe(true);
    expect(state.tables.eterisTransaction).toHaveLength(2);
    await expect(
      reverseExceptionalEteris(database as never, {
        ...input,
        idempotencyKey: "unverified-reversal",
        verifiedFailure: false,
      })
    ).rejects.toMatchObject({ code: "INVALID_FAILURE" });
    state.tables.eterisTransaction[0]!.kind = "grant";
    await expect(
      reverseExceptionalEteris(database as never, {
        ...input,
        idempotencyKey: "wrong-kind-reversal",
      })
    ).rejects.toMatchObject({ code: "INVALID_FAILURE" });
  });
});
