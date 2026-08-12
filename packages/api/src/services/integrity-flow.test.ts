import type { db as database } from "@repo/db";
import {
  user,
  userStreak,
  xpIntegrityCase,
  xpRiskSignal,
} from "@repo/db/schema/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  decideIntegrityCase,
  releaseMaturedPendingXp,
  releaseMaturedPendingXpBatch,
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
const contribution = vi.hoisted(() => ({
  reverseUnsupported: vi.fn(),
  runTransaction: vi.fn(),
}));
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
  ContributionProjectionMismatchError: class extends Error {
    profileUserIds: string[] = [];
    readonly walletIds: string[];

    constructor(walletIds: string[]) {
      super("XP_PROJECTION_MISMATCH");
      this.name = "ContributionProjectionMismatchError";
      this.walletIds = walletIds;
    }
  },
  reverseUnsupportedContributionMilestonesInTransaction:
    contribution.reverseUnsupported,
  runContributionRewardTransaction: contribution.runTransaction,
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
  contribution.runTransaction
    .mockReset()
    .mockImplementation((db, callback) => db.transaction(callback));
  progression.cancelPending.mockReset().mockResolvedValue([]);
  progression.matured.mockReset().mockResolvedValue({
    completed: true,
    settlements: [],
  });
  progression.notify.mockReset().mockImplementation(() => Promise.resolve());
  progression.notifyInTransaction
    .mockReset()
    .mockImplementation(() => Promise.resolve());
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
  it("keeps matured release notifications in the release transaction", async () => {
    const settlement = {
      debtCreated: false,
      eventId: "released-event-1",
      level: 2,
      previousLevel: 1,
      replayed: false,
    };
    progression.matured.mockResolvedValueOnce({
      completed: true,
      settlements: [settlement],
    });
    progression.notifyInTransaction.mockRejectedValueOnce(
      new Error("notification failure")
    );
    let committed = false;
    const tx = {} as Transaction;
    const db = {
      transaction: vi.fn(async (callback) => {
        const result = await callback(tx);
        committed = true;
        return result;
      }),
    } as unknown as Database;

    await expect(releaseMaturedPendingXp(db, "user-1")).rejects.toThrow(
      "notification failure"
    );

    expect(committed).toBe(false);
    expect(progression.notifyInTransaction).toHaveBeenCalledWith(
      tx,
      "user-1",
      settlement
    );
    expect(progression.notify).not.toHaveBeenCalled();
  });

  it("preserves an incomplete matured release for cache invalidation", async () => {
    progression.matured.mockResolvedValueOnce({
      completed: false,
      settlements: [],
    });
    const db = {
      transaction: vi.fn((callback) => callback({} as Transaction)),
    } as unknown as Database;

    await expect(releaseMaturedPendingXp(db, "user-1")).resolves.toEqual({
      completed: false,
      settlements: [],
    });
  });

  it("releases matured Pending XP in independent scheduled transactions", async () => {
    const settlement = { eventId: "released-event-1" };
    progression.matured
      .mockResolvedValueOnce({ completed: true, settlements: [settlement] })
      .mockResolvedValueOnce({ completed: false, settlements: [] });
    const candidates = {
      from: vi.fn(),
      groupBy: vi.fn(),
      limit: vi
        .fn()
        .mockResolvedValue([{ userId: "user-1" }, { userId: "user-2" }]),
      orderBy: vi.fn(),
      where: vi.fn(),
    };
    candidates.from.mockReturnValue(candidates);
    candidates.where.mockReturnValue(candidates);
    candidates.groupBy.mockReturnValue(candidates);
    candidates.orderBy.mockReturnValue(candidates);
    const tx = {} as Transaction;
    const db = {
      select: vi.fn().mockReturnValue(candidates),
      transaction: vi.fn((callback) => callback(tx)),
    } as unknown as Database;

    await expect(
      releaseMaturedPendingXpBatch(db, new Date("2026-08-10T12:00:00.000Z"))
    ).resolves.toEqual({
      checked: 2,
      profileUserIds: ["user-1", "user-2"],
      released: 1,
    });
    expect(progression.notifyInTransaction).toHaveBeenCalledWith(
      tx,
      "user-1",
      settlement
    );
  });

  it("continues releasing other users when a matured account is banned", async () => {
    const settlement = { eventId: "released-event-ready" };
    progression.matured
      .mockRejectedValueOnce(
        Object.assign(new Error("ACCOUNT_BANNED"), { code: "ACCOUNT_BANNED" })
      )
      .mockResolvedValueOnce({ completed: true, settlements: [settlement] });
    const candidates = {
      from: vi.fn(),
      groupBy: vi.fn(),
      limit: vi
        .fn()
        .mockResolvedValue([
          { userId: "banned-user" },
          { userId: "ready-user" },
        ]),
      orderBy: vi.fn(),
      where: vi.fn(),
    };
    candidates.from.mockReturnValue(candidates);
    candidates.where.mockReturnValue(candidates);
    candidates.groupBy.mockReturnValue(candidates);
    candidates.orderBy.mockReturnValue(candidates);
    const db = {
      select: vi.fn().mockReturnValue(candidates),
      transaction: vi.fn((callback) => callback({} as Transaction)),
    } as unknown as Database;

    await expect(releaseMaturedPendingXpBatch(db)).resolves.toEqual({
      checked: 2,
      profileUserIds: ["ready-user"],
      released: 1,
    });
    expect(progression.matured).toHaveBeenCalledTimes(2);
    expect(progression.notifyInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      "ready-user",
      settlement
    );
  });

  it("reports committed profile invalidations when a later release fails", async () => {
    progression.matured
      .mockResolvedValueOnce({
        completed: true,
        settlements: [{ eventId: "released-before-failure" }],
      })
      .mockRejectedValueOnce(new Error("notification failure"));
    const candidates = {
      from: vi.fn(),
      groupBy: vi.fn(),
      limit: vi
        .fn()
        .mockResolvedValue([
          { userId: "released-user" },
          { userId: "failed-user" },
        ]),
      orderBy: vi.fn(),
      where: vi.fn(),
    };
    candidates.from.mockReturnValue(candidates);
    candidates.where.mockReturnValue(candidates);
    candidates.groupBy.mockReturnValue(candidates);
    candidates.orderBy.mockReturnValue(candidates);
    const db = {
      select: vi.fn().mockReturnValue(candidates),
      transaction: vi.fn((callback) => callback({} as Transaction)),
    } as unknown as Database;

    await expect(releaseMaturedPendingXpBatch(db)).rejects.toMatchObject({
      profileUserIds: ["released-user"],
    });
  });

  it("paginates past unreleasable Pending XP users", async () => {
    const blockedCandidates = Array.from({ length: 100 }, (_, index) => ({
      userId: `blocked-${index.toString().padStart(3, "0")}`,
    }));
    progression.matured.mockImplementation((_tx, userId: string) =>
      Promise.resolve(
        userId === "ready-101"
          ? { completed: true, settlements: [{ eventId: "released-101" }] }
          : { completed: true, settlements: [] }
      )
    );
    const candidates = {
      from: vi.fn(),
      groupBy: vi.fn(),
      limit: vi
        .fn()
        .mockResolvedValueOnce(blockedCandidates)
        .mockResolvedValueOnce([{ userId: "ready-101" }]),
      orderBy: vi.fn(),
      where: vi.fn(),
    };
    candidates.from.mockReturnValue(candidates);
    candidates.where.mockReturnValue(candidates);
    candidates.groupBy.mockReturnValue(candidates);
    candidates.orderBy.mockReturnValue(candidates);
    const tx = {} as Transaction;
    const db = {
      select: vi.fn().mockReturnValue(candidates),
      transaction: vi.fn((callback) => callback(tx)),
    } as unknown as Database;

    await expect(releaseMaturedPendingXpBatch(db)).resolves.toEqual({
      checked: 101,
      profileUserIds: ["ready-101"],
      released: 1,
    });
    expect(candidates.limit).toHaveBeenCalledTimes(2);
  });

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

  it("defers the current award when automatic release freezes the wallet", async () => {
    progression.matured.mockResolvedValueOnce({
      completed: false,
      settlements: [],
    });

    await expect(
      settleXpWithIntegrityInTransaction(createTransaction().tx, command, {
        disposition: "low",
      })
    ).resolves.toEqual({
      outcome: "deferred",
      releasedSettlements: [],
      replayed: false,
    });
    expect(progression.posted).not.toHaveBeenCalled();
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

  it.each(["comment", "review"] as const)(
    "rejects like disqualification for a user who did not like the %s subject",
    async (kind) => {
      const insert = vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn().mockResolvedValue(null),
        })),
      }));
      let shapedSelectCall = 0;
      const tx = {
        insert,
        query: {
          xpRewardSubject: {
            findFirst: vi
              .fn()
              .mockResolvedValue({ entityId: `${kind}-1`, kind }),
          },
        },
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
      };
      const db = {
        transaction: vi.fn((callback) => callback(tx)),
      } as unknown as Database;

      await expect(
        decideIntegrityCase(db, {
          action: "disqualify_likes",
          actorUserId: "moderator-1",
          caseId: "case-1",
          likerUserIds: ["non-liker-1"],
          reason: "El usuario no tiene un like vigente",
          subjectId: "subject-1",
        })
      ).rejects.toThrow("INTEGRITY_LIKER_MISMATCH");
      expect(insert).not.toHaveBeenCalled();
    }
  );

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
      query: {
        xpRewardSubject: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ entityId: "review-1", kind: "review" }),
        },
      },
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
              shapedSelectCall === 1
                ? [{ id: "case-event" }]
                : shapedSelectCall === 2
                  ? [{ userId: "liker-1" }]
                  : [{ id: "pending-event" }]
            ),
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
      query: {
        xpRewardSubject: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ entityId: "review-1", kind: "review" }),
        },
      },
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
              shapedSelectCall === 1
                ? [{ id: "case-event" }]
                : shapedSelectCall === 2
                  ? [{ userId: "liker-1" }]
                  : []
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

  it("aborts all reversals when a later event finds a projection mismatch", async () => {
    progression.posted
      .mockResolvedValueOnce({
        eventId: "reversal-1",
        replayed: false,
        settledXp: 0,
      })
      .mockResolvedValueOnce({
        eventId: null,
        projectionMismatch: true,
        projectionMismatchWalletIds: ["wallet-user-1"],
        replayed: false,
        settledXp: 0,
      });
    let selectCall = 0;
    const update = vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(null) })),
    }));
    const tx = {
      query: {
        xpEvent: { findFirst: vi.fn() },
        xpIntegrityCase: {
          findFirst: vi.fn().mockResolvedValue({ userId: "user-1" }),
        },
      },
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
          chain.for.mockResolvedValue([{ id: "user-1" }]);
        } else if (selectCall === 2) {
          chain.where.mockReturnValue(chain);
          chain.for.mockResolvedValue([]);
        } else if (selectCall === 3) {
          chain.where.mockReturnValue(chain);
          chain.for.mockResolvedValue([
            { id: "case-1", status: "released", userId: "user-1" },
          ]);
        } else if (selectCall === 4) {
          chain.where.mockResolvedValue([
            {
              amount: 67,
              id: "event-1",
              kind: "review_milestone",
              reversesEventId: null,
              userId: "user-1",
            },
            {
              amount: 33,
              id: "event-2",
              kind: "review_milestone",
              reversesEventId: null,
              userId: "user-1",
            },
          ]);
        } else {
          chain.where.mockResolvedValue([]);
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
    ).rejects.toMatchObject({
      name: "ContributionProjectionMismatchError",
      walletIds: ["wallet-user-1"],
    });
    expect(progression.posted).toHaveBeenCalledTimes(2);
    expect(update).not.toHaveBeenCalled();
  });

  it("locks the user and streak before its integrity case during a reversal", async () => {
    const lockOrder: string[] = [];
    let selectCall = 0;
    const tx = {
      query: {
        xpEvent: { findFirst: vi.fn() },
        xpIntegrityCase: {
          findFirst: vi.fn().mockResolvedValue({ userId: "user-1" }),
        },
      },
      select: vi.fn(() => {
        selectCall += 1;
        if (selectCall > 3) {
          throw new Error("stop after lock audit");
        }
        let table: unknown;
        const chain = {
          for: vi.fn(),
          from: vi.fn((selectedTable: unknown) => {
            table = selectedTable;
            return chain;
          }),
          where: vi.fn(),
        };
        chain.where.mockReturnValue(chain);
        chain.for.mockImplementation(() => {
          const lock =
            table === user ? "user" : table === userStreak ? "streak" : "case";
          lockOrder.push(lock);
          return Promise.resolve(
            table === xpIntegrityCase
              ? [{ id: "case-1", status: "open", userId: "user-1" }]
              : table === user
                ? [{ id: "user-1" }]
                : [{ userId: "user-1" }]
          );
        });
        return chain;
      }),
    };
    const db = {
      transaction: vi.fn((callback) => callback(tx)),
    } as unknown as Database;
    progression.cancelPending.mockResolvedValue([]);

    await expect(
      decideIntegrityCase(db, {
        action: "reverse",
        actorUserId: "moderator-1",
        caseId: "case-1",
        reason: "Reversion con orden de locks estable",
      })
    ).rejects.toThrow("stop after lock audit");
    expect(lockOrder.slice(0, 3)).toEqual(["user", "streak", "case"]);
  });

  it("does not reverse a case event twice after an unrelated workflow reversed it", async () => {
    let selectCall = 0;
    const update = vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(null) })),
    }));
    const tx = {
      query: {
        xpEvent: { findFirst: vi.fn() },
        xpIntegrityCase: {
          findFirst: vi.fn().mockResolvedValue({ userId: "user-1" }),
        },
      },
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
          chain.for.mockResolvedValue([{ id: "user-1" }]);
        } else if (selectCall === 2) {
          chain.where.mockReturnValue(chain);
          chain.for.mockResolvedValue([]);
        } else if (selectCall === 3) {
          chain.where.mockReturnValue(chain);
          chain.for.mockResolvedValue([
            { id: "case-1", status: "released", userId: "user-1" },
          ]);
        } else if (selectCall === 4) {
          chain.where.mockResolvedValue([
            {
              amount: 25,
              id: "original-event",
              reversesEventId: null,
              userId: "user-1",
            },
          ]);
        } else {
          chain.where.mockResolvedValue([
            { reversesEventId: "original-event" },
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
        reason: "Reversion ya aplicada por otra correccion",
      })
    ).resolves.toMatchObject({ status: "dismissed" });
    expect(progression.posted).not.toHaveBeenCalled();
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

  it("records only newly observed signals while retaining aggregate case evidence", async () => {
    const store = createTransaction();
    await settleXpWithIntegrityInTransaction(store.tx, command, {
      correlation: { deviceHash: "device-hash", ipPrefixHash: null },
      disposition: "medium",
      recordSignals: [{ count: 1, kind: "like_toggle_velocity" }],
      signals: [
        { count: 4, kind: "like_toggle_velocity" },
        { count: 2, kind: "source_cap_pressure" },
      ],
      summary: "Actividad acumulada",
    });

    expect(
      store.inserts.find(({ table }) => table === xpIntegrityCase)?.values
    ).toMatchObject({
      evidence: {
        signals: [
          { count: 4, kind: "like_toggle_velocity" },
          { count: 2, kind: "source_cap_pressure" },
        ],
      },
    });
    expect(
      store.inserts.find(({ table }) => table === xpRiskSignal)?.values
    ).toEqual([expect.objectContaining({ kind: "like_toggle_velocity" })]);
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
