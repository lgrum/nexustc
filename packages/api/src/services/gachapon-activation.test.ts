import {
  gachaponMachine,
  gachaponMachinePackEntry,
  gachaponMachineUsage,
  packDrawGroup,
  packRevision,
  packTemplate,
  user,
} from "@repo/db";
import { normalizeCollectiblePayload } from "@repo/shared/collectibles";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GachaponError, activateGachapon } from "./gachapon";

const flags = vi.hoisted(() => ({
  collectibles: true,
  economy: true,
  spending: true,
}));
const ledger = vi.hoisted(() => ({
  issue: vi.fn(),
  lockWallets: vi.fn(),
  post: vi.fn(),
  wallet: vi.fn(),
}));
const notification = vi.hoisted(() => ({
  create: vi.fn(),
}));
const issuance = vi.hoisted(() => ({
  ErrorClass: class CollectibleIssuanceError extends Error {
    readonly code: string;
    readonly markRevisionExhausted = false;

    constructor(code: string, message = code) {
      super(message);
      this.name = "CollectibleIssuanceError";
      this.code = code;
    }
  },
}));

vi.mock("@repo/env", () => ({
  env: {
    get COLLECTIBLES_ENABLED() {
      return flags.collectibles;
    },
    get ETERIS_SPENDING_ENABLED() {
      return flags.spending;
    },
    get XP_ECONOMY_ENABLED() {
      return flags.economy;
    },
  },
}));
vi.mock("./collectibles", () => ({
  assertCollectiblesMutationAllowed: vi.fn(() => {
    if (!flags.collectibles) {
      throw new Error("GATE_DISABLED");
    }
  }),
  withCollectibleDeadlockRetry: vi.fn((callback: () => unknown) => callback()),
}));
vi.mock("./collectible-issuance", () => ({
  CollectibleIssuanceError: issuance.ErrorClass,
  issuePackInTransaction: ledger.issue,
  runCollectibleIssuanceInTransaction: vi.fn(
    (_tx: unknown, callback: (tx: unknown) => unknown) => callback(_tx)
  ),
}));
vi.mock("./eteris", () => ({
  getOrCreateUserWalletInTransaction: ledger.wallet,
  lockEterisWalletsInTransaction: ledger.lockWallets,
  postEterisTransactionInTransaction: ledger.post,
}));
vi.mock("./pack-catalog", () => ({ getPublishedPackTemplate: vi.fn() }));
vi.mock("./notification", () => ({
  createUserNotification: notification.create,
}));

const machine = {
  binding: "transferable" as const,
  cost: 25n,
  createdAt: new Date("2026-08-16T00:00:00.000Z"),
  createdByUserId: "admin-1",
  description: "Evento",
  endsAt: null,
  globalQuota: null,
  id: "machine-1",
  name: "Máquina",
  perAccountLimit: null,
  startsAt: null,
  state: "active" as const,
  totalActivations: 0,
  updatedAt: new Date("2026-08-16T00:00:00.000Z"),
  updatedByUserId: "admin-1",
  version: 1,
};
const entry = {
  id: "entry-1",
  machineId: machine.id,
  packTemplateId: "pack-1",
  weight: 1,
};
const template = {
  id: "pack-1",
  latestPublishedRevisionId: "revision-1",
  lifecycle: "active" as const,
};
const revision = {
  availability: "active" as "active" | "disabled",
  id: "revision-1",
  lifecycle: "published" as const,
  templateId: template.id,
};
const account = {
  banExpires: null,
  banned: false,
  emailVerified: true,
  id: "user-1",
};

type MachineOverrides = {
  endsAt?: Date | null;
  globalQuota?: number | null;
  perAccountLimit?: number | null;
  startsAt?: Date | null;
  state?: "active" | "draft" | "exhausted" | "paused" | "retired";
  totalActivations?: number;
};

function createStore(
  options: {
    account?: Partial<typeof account>;
    entries?: (typeof entry)[];
    machine?: MachineOverrides;
    replay?: Record<string, unknown> | null;
    revision?: Partial<typeof revision>;
    template?: Partial<typeof template>;
    usage?: (typeof gachaponMachineUsage.$inferSelect)[];
  } = {}
) {
  const currentAccount = { ...account, ...options.account };
  const currentMachine = { ...machine, ...options.machine };
  const currentEntry = { ...entry, machineId: currentMachine.id };
  const currentEntries = options.entries ?? [currentEntry];
  const currentTemplate = { ...template, ...options.template };
  const currentRevision = { ...revision, ...options.revision };
  const inserted: { table: unknown; value: unknown }[] = [];
  const updatedMachines = [
    {
      ...currentMachine,
      state: "exhausted" as const,
      version: currentMachine.version + 1,
    },
    {
      ...currentMachine,
      totalActivations: currentMachine.totalActivations + 1,
      updatedAt: new Date(),
      version: currentMachine.version + 1,
    },
  ];
  let replayReads = 0;
  const tx = {
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((value: unknown) => {
        inserted.push({ table, value });
        return Promise.resolve([]);
      }),
    })),
    query: {
      gachaponActivation: {
        findFirst: vi.fn(() => {
          replayReads += 1;
          return Promise.resolve(options.replay ?? null);
        }),
      },
    },
    select: vi.fn(() => {
      let table: unknown;
      const rowsFor = () => {
        if (table === user) {
          return [currentAccount];
        }
        if (table === gachaponMachine) {
          return [currentMachine];
        }
        if (table === packTemplate) {
          return [currentTemplate];
        }
        if (table === packRevision) {
          return [currentRevision];
        }
        if (table === gachaponMachineUsage || table === packDrawGroup) {
          return table === gachaponMachineUsage ? (options.usage ?? []) : [];
        }
        if (table === gachaponMachinePackEntry) {
          return currentEntries;
        }
        return [];
      };
      const builder = {
        for: vi.fn(() => Promise.resolve(rowsFor())),
        from(nextTable: unknown) {
          table = nextTable;
          return builder;
        },
        orderBy() {
          return builder;
        },
        // oxlint-disable-next-line unicorn/no-thenable
        then(resolve: (value: unknown[]) => unknown) {
          return Promise.resolve(resolve(rowsFor()));
        },
        where() {
          return builder;
        },
      };
      return builder;
    }),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => {
            const updated = updatedMachines.shift();
            return Promise.resolve(updated ? [updated] : []);
          }),
        })),
      })),
    })),
  };
  return {
    db: {
      transaction: vi.fn((callback: (value: typeof tx) => unknown) =>
        callback(tx)
      ),
    },
    inserted,
    replayReads: () => replayReads,
    tx,
  };
}

const baseInput = {
  expectedCost: 25n,
  expectedMachineVersion: 1,
  idempotencyKey: "gachapon-activation-key-1",
  machineId: machine.id,
  now: new Date("2026-08-16T12:00:00.000Z"),
  random: () => 0,
  userId: account.id,
};

describe("Gachapon activation transaction", () => {
  beforeEach(() => {
    flags.collectibles = true;
    flags.economy = true;
    flags.spending = true;
    vi.clearAllMocks();
    ledger.wallet.mockResolvedValue({ id: "wallet-user-1" });
    ledger.lockWallets.mockResolvedValue([
      { balance: 1000n, status: "active", walletId: "wallet-user-1" },
    ]);
    ledger.issue.mockResolvedValue({
      binding: "transferable",
      cardInstanceIds: ["hidden-card-1"],
      issueReference: `gachapon:${baseInput.idempotencyKey}`,
      issueSource: "gachapon",
      mintNumbers: [1],
      packInstanceId: "pack-instance-1",
      revisionId: "revision-1",
      templateId: "pack-1",
    });
    ledger.post.mockResolvedValue({ id: "transaction-1", replayed: false });
    notification.create.mockResolvedValue("notification-1");
  });

  it("issues one unopened Pack and settles only after issuance succeeds", async () => {
    const store = createStore();
    const result = await activateGachapon(store.db as never, baseInput);

    expect(result).toMatchObject({
      chargedCost: "25",
      packInstanceId: "pack-instance-1",
      revisionId: "revision-1",
      templateId: "pack-1",
      transactionId: "transaction-1",
    });
    expect(result).not.toHaveProperty("cardInstanceIds");
    expect(result).not.toHaveProperty("mintNumbers");
    expect(ledger.issue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        binding: "transferable",
        issueSource: "gachapon",
        packTemplateId: "pack-1",
      })
    );
    expect(ledger.post.mock.invocationCallOrder[0]).toBeGreaterThan(
      ledger.issue.mock.invocationCallOrder[0]!
    );
    const activation = store.inserted.find(
      ({ value }) =>
        value !== null && typeof value === "object" && "idempotencyKey" in value
    );
    expect(activation?.value).toBeTruthy();
    expect(activation?.value).not.toHaveProperty("cardInstanceIds");
    expect(activation?.value).not.toHaveProperty("outcome");
    expect(notification.create).toHaveBeenCalledWith(
      store.db,
      expect.objectContaining({
        dedupeKey: expect.stringContaining("gachapon-activation:"),
        targetUserId: account.id,
      })
    );
    const notificationInput = notification.create.mock.calls[0]?.[1] as {
      metadata?: Record<string, unknown>;
    };
    expect(notificationInput.metadata).not.toHaveProperty("packInstanceId");
    expect(notificationInput.metadata).not.toHaveProperty("cardInstanceIds");
    expect(notificationInput.metadata).not.toHaveProperty("outcome");
  });

  it("can retry a failed post-commit notification without replaying settlement", async () => {
    const store = createStore();
    const result = await activateGachapon(store.db as never, baseInput);
    notification.create.mockClear();
    const retryDb = {
      ...store.db,
      query: {
        gachaponActivation: {
          findFirst: vi.fn().mockResolvedValue({
            eterisTransactionId: result.transactionId,
            id: result.activationId,
            machineId: result.machineId,
            userId: account.id,
          }),
        },
      },
    };

    const { retryGachaponActivationNotification } = await import("./gachapon");
    await retryGachaponActivationNotification(
      retryDb as never,
      result.activationId
    );

    expect(notification.create).toHaveBeenCalledOnce();
    expect(ledger.issue).toHaveBeenCalledOnce();
    expect(ledger.post).toHaveBeenCalledOnce();
    expect(notification.create.mock.calls[0]?.[1]).toMatchObject({
      dedupeKey: `gachapon-activation:${result.activationId}`,
      targetUserId: account.id,
    });
  });

  it("rolls back settlement when every weighted template cannot issue", async () => {
    ledger.issue.mockRejectedValueOnce(
      new issuance.ErrorClass("EXHAUSTED_SUPPLY")
    );
    const store = createStore();
    await expect(
      activateGachapon(store.db as never, baseInput)
    ).rejects.toMatchObject({ code: "QUOTA_EXHAUSTED" });
    expect(ledger.post).not.toHaveBeenCalled();
    expect(
      store.inserted.some(({ table }) =>
        String(table).includes("gachapon_activation")
      )
    ).toBe(false);
  });

  it("does not deliver a private Gachapon Pack from a disabled revision", async () => {
    const store = createStore({ revision: { availability: "disabled" } });
    await expect(
      activateGachapon(store.db as never, {
        ...baseInput,
        idempotencyKey: "gachapon-disabled-revision",
      })
    ).rejects.toMatchObject({ code: "QUOTA_EXHAUSTED" });
    expect(ledger.issue).not.toHaveBeenCalled();
    expect(ledger.post).not.toHaveBeenCalled();
    expect(
      store.inserted.some(({ table }) =>
        String(table).includes("gachapon_activation")
      )
    ).toBe(false);
  });

  it("returns a matching replay and rejects conflicting reuse", async () => {
    const fingerprint = normalizeCollectiblePayload({
      expectedCost: baseInput.expectedCost,
      expectedMachineVersion: baseInput.expectedMachineVersion,
      machineId: baseInput.machineId,
      userId: baseInput.userId,
    });
    const replay = {
      chargedCost: 25n,
      fingerprint,
      id: "activation-replay",
      machineId: machine.id,
      machineVersion: 1,
      packInstanceId: "pack-replay",
      packTemplateId: "pack-1",
      revisionId: "revision-1",
      userId: account.id,
      eterisTransactionId: "transaction-replay",
    };
    const store = createStore({ replay });
    await expect(
      activateGachapon(store.db as never, baseInput)
    ).resolves.toMatchObject({
      activationId: "activation-replay",
      packInstanceId: "pack-replay",
      replayed: true,
    });
    expect(ledger.issue).not.toHaveBeenCalled();
    expect(ledger.post).not.toHaveBeenCalled();
    expect(store.replayReads()).toBe(1);

    const conflict = createStore({ replay: { ...replay, chargedCost: 26n } });
    await expect(
      activateGachapon(conflict.db as never, baseInput)
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("stops before mutation when the gate or expected version is stale", async () => {
    flags.collectibles = false;
    await expect(
      activateGachapon(createStore().db as never, baseInput)
    ).rejects.toThrow();
    flags.collectibles = true;
    const stale = createStore();
    const staleInput = { ...baseInput, expectedMachineVersion: 2 };
    await expect(
      activateGachapon(stale.db as never, staleInput)
    ).rejects.toThrow(GachaponError);
    expect(ledger.issue).not.toHaveBeenCalled();
    expect(ledger.post).not.toHaveBeenCalled();
  });

  it("enforces schedule, pause, global quota, and per-account limits", async () => {
    const scheduled = createStore({
      machine: { startsAt: new Date("2026-08-17T00:00:00.000Z") },
    });
    await expect(
      activateGachapon(scheduled.db as never, baseInput)
    ).rejects.toMatchObject({ code: "MACHINE_NOT_STARTED" });

    const paused = createStore({ machine: { state: "paused" } });
    await expect(
      activateGachapon(paused.db as never, baseInput)
    ).rejects.toMatchObject({ code: "MACHINE_UNAVAILABLE" });

    const globalQuota = createStore({
      machine: { globalQuota: 1, totalActivations: 1 },
    });
    await expect(
      activateGachapon(globalQuota.db as never, baseInput)
    ).rejects.toMatchObject({ code: "QUOTA_EXHAUSTED" });

    const accountLimit = createStore({
      machine: { perAccountLimit: 1 },
      usage: [
        {
          activationCount: 1,
          machineId: machine.id,
          updatedAt: new Date(),
          userId: account.id,
        },
      ],
    });
    await expect(
      activateGachapon(accountLimit.db as never, baseInput)
    ).rejects.toMatchObject({ code: "LIMIT_REACHED" });
    expect(ledger.issue).not.toHaveBeenCalled();
    expect(ledger.post).not.toHaveBeenCalled();
  });

  it("resolves the selected template's latest published revision at execution", async () => {
    const latestRevision = { ...revision, id: "revision-latest" };
    ledger.issue.mockResolvedValueOnce({
      binding: "transferable",
      cardInstanceIds: ["hidden-card-latest"],
      issueReference: `gachapon:${baseInput.idempotencyKey}`,
      issueSource: "gachapon",
      mintNumbers: [1],
      packInstanceId: "pack-instance-latest",
      revisionId: latestRevision.id,
      templateId: template.id,
    });
    const store = createStore({
      revision: latestRevision,
      template: { latestPublishedRevisionId: latestRevision.id },
    });

    const result = await activateGachapon(store.db as never, baseInput);

    expect(result.revisionId).toBe(latestRevision.id);
    expect(ledger.issue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ packTemplateId: template.id })
    );
  });
});
