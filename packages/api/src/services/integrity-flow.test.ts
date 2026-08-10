import type { db as database } from "@repo/db";
import { xpIntegrityCase, xpRiskSignal } from "@repo/db/schema/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  decideIntegrityCase,
  settleXpWithIntegrityInTransaction,
} from "./integrity";

const progression = vi.hoisted(() => ({
  cancelPending: vi.fn(),
  matured: vi.fn(),
  notify: vi.fn(),
  notifyInTransaction: vi.fn(),
  pending: vi.fn(),
  posted: vi.fn(),
  releaseCase: vi.fn(),
}));
const contribution = vi.hoisted(() => ({ reverseUnsupported: vi.fn() }));
const notification = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("./progression", () => ({
  cancelPendingXpEventsInTransaction: progression.cancelPending,
  releaseMaturedPendingXpInTransaction: progression.matured,
  createPendingXpEventInTransaction: progression.pending,
  lockUserProgressionInTransaction: vi.fn(),
  notifyXpSettlement: progression.notify,
  notifyXpSettlementInTransaction: progression.notifyInTransaction,
  postXpEventInTransaction: progression.posted,
  releasePendingXpCaseInTransaction: progression.releaseCase,
}));
vi.mock("./notification", () => ({
  createUserNotification: notification.create,
}));
vi.mock("./contribution-rewards", () => ({
  reverseUnsupportedContributionMilestonesInTransaction:
    contribution.reverseUnsupported,
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
  progression.cancelPending.mockReset().mockResolvedValue([]);
  progression.matured.mockReset().mockResolvedValue([]);
  progression.notify.mockReset().mockResolvedValue();
  progression.notifyInTransaction.mockReset().mockResolvedValue();
  progression.pending.mockReset().mockResolvedValue({
    eventId: "event-1",
    pendingXp: 25,
    replayed: false,
  });
  progression.posted.mockReset().mockResolvedValue({ eventId: "event-1" });
  progression.releaseCase.mockReset().mockResolvedValue({
    completed: false,
    settlements: [],
    userId: "user-1",
  });
  contribution.reverseUnsupported.mockReset().mockResolvedValue({
    settlements: [],
    userId: "user-1",
  });
  notification.create.mockReset().mockResolvedValue("notification-1");
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

  it("keeps a like-disqualification case open while supported XP remains pending", async () => {
    let shapedSelectCall = 0;
    const update = vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(null) })),
    }));
    const tx = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn().mockResolvedValue(null),
        })),
      })),
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
        shapedSelectCall += 1;
        const chain = {
          from: vi.fn(),
          limit: vi.fn().mockResolvedValue([
            {
              id: shapedSelectCall === 1 ? "case-event" : "pending-event",
            },
          ]),
          where: vi.fn(),
        };
        chain.from.mockReturnValue(chain);
        chain.where.mockReturnValue(chain);
        return chain;
      }),
      update,
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
        reason: "Se descartaron solo los likes coordinados",
        subjectId: "subject-1",
      })
    ).resolves.toMatchObject({ status: "open" });

    expect(update).not.toHaveBeenCalled();
  });

  it("persists reversal notifications in the integrity decision transaction", async () => {
    contribution.reverseUnsupported.mockResolvedValue({
      settlements: [{ eventId: "reversal-1" }],
      userId: "user-1",
    });
    notification.create.mockRejectedValue(new Error("notification failure"));
    let shapedSelectCall = 0;
    const tx = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn().mockResolvedValue(null),
        })),
      })),
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
        shapedSelectCall += 1;
        const chain = {
          from: vi.fn(),
          limit: vi
            .fn()
            .mockResolvedValue(
              shapedSelectCall === 1 ? [{ id: "case-event" }] : []
            ),
          where: vi.fn(),
        };
        chain.from.mockReturnValue(chain);
        chain.where.mockReturnValue(chain);
        return chain;
      }),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(null) })),
      })),
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
        reason: "Likes coordinados confirmados",
        subjectId: "subject-1",
      })
    ).rejects.toThrow("notification failure");

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(progression.notifyInTransaction).toHaveBeenCalledWith(tx, "user-1", {
      eventId: "reversal-1",
    });
    expect(notification.create).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ targetUserId: "user-1" })
    );
  });

  it("keeps a manually released case open after a projection mismatch", async () => {
    const update = vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(null) })),
    }));
    const tx = {
      select: vi.fn(() => {
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
      }),
      update,
    };
    const db = {
      transaction: vi.fn((callback) => callback(tx)),
    } as unknown as Database;

    await expect(
      decideIntegrityCase(db, {
        action: "release",
        actorUserId: "owner-1",
        caseId: "case-1",
        reason: "Liberacion manual revisada",
      })
    ).resolves.toMatchObject({ status: "open" });
    expect(progression.releaseCase).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
  });

  it("keeps a released case retryable when its reversal finds a projection mismatch", async () => {
    progression.posted.mockResolvedValue({
      eventId: null,
      projectionMismatch: true,
      replayed: false,
      settledXp: 0,
    });
    let selectCall = 0;
    const update = vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(null) })),
    }));
    const tx = {
      query: { xpEvent: { findFirst: vi.fn() } },
      select: vi.fn(() => {
        selectCall += 1;
        const chain = {
          for: vi.fn(),
          from: vi.fn(),
          where: vi.fn(),
        };
        chain.from.mockReturnValue(chain);
        if (selectCall === 1) {
          chain.where.mockReturnValue(chain);
          chain.for.mockResolvedValue([
            { id: "case-1", status: "released", userId: "user-1" },
          ]);
        } else {
          chain.where.mockResolvedValue([
            {
              amount: 67,
              id: "event-1",
              reversesEventId: null,
              userId: "user-1",
            },
          ]);
        }
        return chain;
      }),
      update,
    };
    const db = {
      transaction: vi.fn((callback) => callback(tx)),
    } as unknown as Database;

    await expect(
      decideIntegrityCase(db, {
        action: "reverse",
        actorUserId: "moderator-1",
        caseId: "case-1",
        reason: "Reversion confirmada",
      })
    ).resolves.toMatchObject({ status: "open" });
    expect(update).not.toHaveBeenCalled();
  });

  it("cancels every pending milestone covered by a contribution block", async () => {
    const update = vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(null) })),
    }));
    const tx = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn().mockResolvedValue(null),
        })),
      })),
      query: {
        xpEvent: {
          findFirst: vi.fn().mockResolvedValue({
            kind: "review_milestone",
            subjectId: "subject-1",
            userId: "user-1",
          }),
        },
        xpRewardSubject: {
          findFirst: vi.fn().mockResolvedValue({
            entityId: "review-1",
            id: "subject-1",
            kind: "review",
            parentPostId: "post-1",
          }),
        },
      },
      select: vi.fn(() => {
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
      }),
      update,
    };
    const db = {
      transaction: vi.fn((callback) => callback(tx)),
    } as unknown as Database;

    await decideIntegrityCase(db, {
      action: "block",
      actorUserId: "moderator-1",
      caseId: "case-1",
      reason: "Contenido coordinado confirmado",
    });

    expect(progression.cancelPending).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        closeEmptyCases: true,
        subjectId: "subject-1",
      })
    );
    expect(progression.cancelPending).not.toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ caseId: "case-1" })
    );
  });

  it("cancels every pending reading award covered by a comic block", async () => {
    const tx = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn().mockResolvedValue(null),
        })),
      })),
      query: {
        xpEvent: {
          findFirst: vi.fn().mockResolvedValue({
            kind: "comic_reading",
            sourceRef: "comic:comic-1:pages:1",
            subjectId: null,
            userId: "user-1",
          }),
        },
        xpRewardSubject: { findFirst: vi.fn() },
      },
      select: vi.fn(() => {
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
      }),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(null) })),
      })),
    };
    const db = {
      transaction: vi.fn((callback) => callback(tx)),
    } as unknown as Database;

    await decideIntegrityCase(db, {
      action: "block",
      actorUserId: "moderator-1",
      caseId: "case-1",
      reason: "Lectura coordinada confirmada",
    });

    expect(progression.cancelPending).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        closeEmptyCases: true,
        sourceRefPrefix: "comic:comic-1:",
        userId: "user-1",
      })
    );
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
