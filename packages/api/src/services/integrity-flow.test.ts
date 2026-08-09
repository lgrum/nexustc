import type { db as database } from "@repo/db";
import { xpIntegrityCase, xpRiskSignal } from "@repo/db/schema/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  decideIntegrityCase,
  settleXpWithIntegrityInTransaction,
} from "./integrity";

const progression = vi.hoisted(() => ({
  matured: vi.fn(),
  pending: vi.fn(),
  posted: vi.fn(),
}));

vi.mock("./progression", () => ({
  releaseMaturedPendingXpInTransaction: progression.matured,
  createPendingXpEventInTransaction: progression.pending,
  lockUserProgressionInTransaction: vi.fn(),
  notifyXpSettlement: vi.fn(),
  postXpEventInTransaction: progression.posted,
}));
vi.mock("./notification", () => ({ createUserNotification: vi.fn() }));
vi.mock("./contribution-rewards", () => ({
  reverseUnsupportedContributionMilestonesInTransaction: vi.fn(),
}));

type Database = typeof database;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const command = {
  amount: 25,
  idempotencyKey: "review-milestone:subject-1:3",
  kind: "review_milestone" as const,
  reasonCode: "eligible_likes_3",
  sourceRef: "review:subject-1:milestone:3",
  subjectId: "subject-1",
  userId: "user-1",
};

function createTransaction() {
  const inserts: { table: unknown; values: unknown }[] = [];
  const tx = {
    delete: vi.fn(() => ({ where: vi.fn() })),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((values: unknown) => {
        inserts.push({ table, values });
        return Promise.resolve();
      }),
    })),
    query: {
      xpEvent: { findFirst: vi.fn().mockResolvedValue(null) },
    },
  } as unknown as Transaction;
  return { inserts, tx };
}

beforeEach(() => {
  progression.matured.mockReset().mockResolvedValue([]);
  progression.pending.mockReset().mockResolvedValue({
    eventId: "event-1",
    pendingXp: 25,
    replayed: false,
  });
  progression.posted.mockReset().mockResolvedValue({ eventId: "event-1" });
});

describe("integrity settlement", () => {
  it("rejects invalid proof without recording or penalizing the account", async () => {
    const store = createTransaction();
    await expect(
      settleXpWithIntegrityInTransaction(store.tx, command, {
        disposition: "invalid",
      })
    ).resolves.toEqual({ outcome: "rejected", replayed: false });
    expect(store.inserts).toHaveLength(0);
    expect(progression.pending).not.toHaveBeenCalled();
    expect(progression.posted).not.toHaveBeenCalled();
  });

  it("posts low risk immediately", async () => {
    await settleXpWithIntegrityInTransaction(createTransaction().tx, command, {
      disposition: "low",
    });
    expect(progression.posted).toHaveBeenCalledOnce();
    expect(progression.pending).not.toHaveBeenCalled();
    expect(progression.matured).toHaveBeenCalledWith(
      expect.anything(),
      command.userId,
      expect.any(Date)
    );
  });

  it("rejects like disqualification for a subject unrelated to the case", async () => {
    const insert = vi.fn();
    const tx = {
      insert,
      select: vi.fn((shape?: Record<string, unknown>) => {
        if (!shape) {
          const chain = {
            for: vi
              .fn()
              .mockResolvedValue([
                { id: "case-1", status: "open", userId: "user-1" },
              ]),
            from: vi.fn(),
            where: vi.fn(),
          };
          chain.from.mockReturnValue(chain);
          chain.where.mockReturnValue(chain);
          return chain;
        }
        const chain = {
          from: vi.fn(),
          limit: vi.fn().mockResolvedValue([]),
          where: vi.fn(),
        };
        chain.from.mockReturnValue(chain);
        chain.where.mockReturnValue(chain);
        return chain;
      }),
    };
    const db = {
      transaction: vi.fn((callback) => callback(tx)),
    } as unknown as Database;

    await expect(
      decideIntegrityCase(db, {
        action: "disqualify_likes",
        actorUserId: "moderator-1",
        caseId: "case-1",
        likerUserIds: ["liker-1"],
        reason: "El sujeto no pertenece al caso investigado",
        subjectId: "unrelated-subject",
      })
    ).rejects.toThrow("INTEGRITY_SUBJECT_MISMATCH");
    expect(insert).not.toHaveBeenCalled();
  });

  it("holds medium risk for 24 hours and persists only its anomaly", async () => {
    const now = new Date("2026-08-07T00:00:00.000Z");
    const store = createTransaction();
    await settleXpWithIntegrityInTransaction(
      store.tx,
      command,
      {
        correlation: { deviceHash: "device-hash", ipPrefixHash: "ip-hash" },
        disposition: "medium",
        signals: [{ count: 3, kind: "like_toggle_velocity" }],
        summary: "Actividad de likes correlacionada",
      },
      now
    );

    expect(
      store.inserts.find(({ table }) => table === xpIntegrityCase)?.values
    ).toMatchObject({
      autoReleaseAt: new Date("2026-08-08T00:00:00.000Z"),
      riskLevel: "medium",
    });
    expect(
      store.inserts.find(({ table }) => table === xpRiskSignal)?.values
    ).toEqual([
      expect.objectContaining({
        deviceHash: "device-hash",
        expiresAt: new Date("2026-09-06T00:00:00.000Z"),
        ipPrefixHash: "ip-hash",
        kind: "like_toggle_velocity",
      }),
    ]);
    expect(progression.pending).toHaveBeenCalledWith(
      store.tx,
      expect.objectContaining({
        availableAt: new Date("2026-08-08T00:00:00.000Z"),
      }),
      now
    );
  });

  it("holds high risk without an automatic release time", async () => {
    const store = createTransaction();
    await settleXpWithIntegrityInTransaction(store.tx, command, {
      correlation: { deviceHash: null, ipPrefixHash: null },
      disposition: "high",
      signals: [{ count: 1, kind: "account_correlation" }],
      summary: "Correlacion entre cuentas",
    });
    expect(progression.pending).toHaveBeenCalledWith(
      store.tx,
      expect.not.objectContaining({ availableAt: expect.anything() }),
      expect.any(Date)
    );
  });
});
