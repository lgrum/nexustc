import {
  userProgression,
  userStreak,
  xpEvent,
  xpIntegrityCase,
} from "@repo/db/schema/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { decideIntegrityCase } from "./integrity";

const reconciliation = vi.hoisted(() => ({ run: vi.fn() }));
const contribution = vi.hoisted(() => ({ runTransaction: vi.fn() }));
const progression = vi.hoisted(() => ({
  cancel: vi.fn(),
  lock: vi.fn(),
  notify: vi.fn(),
  notifyInTransaction: vi.fn(),
  post: vi.fn(),
}));

vi.mock("./streak", () => ({
  reconcileStreakAfterIntegrityDecisionInTransaction: reconciliation.run,
}));
vi.mock("./progression", () => ({
  cancelPendingXpEventsInTransaction: progression.cancel,
  lockUserProgressionInTransaction: progression.lock,
  notifyXpSettlement: progression.notify,
  notifyXpSettlementInTransaction: progression.notifyInTransaction,
  postXpEventInTransaction: progression.post,
}));
vi.mock("./notification", () => ({ createUserNotification: vi.fn() }));
vi.mock("./contribution-rewards", () => ({
  reverseUnsupportedContributionMilestonesInTransaction: vi.fn(),
  runContributionRewardTransaction: contribution.runTransaction,
}));

function createStore(
  postedEvents: Record<string, unknown>[] = [],
  pendingEvents: Record<string, unknown>[] = []
) {
  const tx = {
    cancelPending: vi.fn().mockResolvedValue(pendingEvents),
    query: {
      xpIntegrityCase: {
        findFirst: vi.fn().mockResolvedValue({ userId: "user-1" }),
      },
    },
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => {
        if (table === xpIntegrityCase) {
          return {
            where: vi.fn(() => ({
              for: vi
                .fn()
                .mockResolvedValue([{ status: "open", userId: "user-1" }]),
            })),
          };
        }
        if (table === userStreak) {
          return {
            where: vi.fn(() => ({
              for: vi.fn().mockResolvedValue([{ userId: "user-1" }]),
            })),
          };
        }
        if (table === xpEvent) {
          return {
            where: vi.fn(() => Promise.resolve(postedEvents)),
          };
        }
        throw new Error("unexpected table");
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockImplementation(() => Promise.resolve()),
      })),
    })),
  };
  const db = {
    transaction: vi.fn((callback: (transaction: typeof tx) => unknown) =>
      callback(tx)
    ),
  };
  return { db, tx };
}

function createTransactionalStore() {
  let committed = {
    caseStatus: "open",
    eventState: "pending",
    pendingXp: 5,
  };
  const db = {
    transaction: vi.fn(
      async (callback: (transaction: Record<string, unknown>) => unknown) => {
        const working = { ...committed };
        const tx = {
          cancelPending: vi.fn(() => {
            if (working.eventState !== "pending") {
              return Promise.resolve([]);
            }
            working.eventState = "cancelled";
            working.pendingXp = 0;
            return Promise.resolve([
              {
                amount: 5,
                id: "pending-streak-day",
                kind: "streak_day",
                userId: "user-1",
              },
            ]);
          }),
          query: {
            xpIntegrityCase: {
              findFirst: vi.fn().mockResolvedValue({ userId: "user-1" }),
            },
          },
          state: working,
          select: vi.fn(() => ({
            from: vi.fn((table: unknown) => {
              if (table === xpIntegrityCase) {
                return {
                  where: vi.fn(() => ({
                    for: vi
                      .fn()
                      .mockResolvedValue([
                        { status: working.caseStatus, userId: "user-1" },
                      ]),
                  })),
                };
              }
              if (table === userStreak) {
                return {
                  where: vi.fn(() => ({
                    for: vi.fn().mockResolvedValue([{ userId: "user-1" }]),
                  })),
                };
              }
              if (table === xpEvent) {
                return {
                  where: vi.fn(() => Promise.resolve([])),
                };
              }
              throw new Error("unexpected table");
            }),
          })),
          update: vi.fn((table: unknown) => ({
            set: vi.fn((values: Record<string, unknown>) => ({
              where: vi.fn().mockImplementation(() => {
                if (table === xpEvent && typeof values.state === "string") {
                  working.eventState = values.state;
                } else if (
                  table === userProgression &&
                  typeof values.pendingXp === "number"
                ) {
                  working.pendingXp = values.pendingXp;
                } else if (
                  table === xpIntegrityCase &&
                  typeof values.status === "string"
                ) {
                  working.caseStatus = values.status;
                }
                return Promise.resolve();
              }),
            })),
          })),
        };
        const result = await callback(tx);
        committed = working;
        return result;
      }
    ),
  };
  return { db, getState: () => committed };
}

beforeEach(() => {
  contribution.runTransaction
    .mockReset()
    .mockImplementation((db, callback) => db.transaction(callback));
  reconciliation.run.mockReset().mockResolvedValue([]);
  progression.cancel
    .mockReset()
    .mockImplementation((tx: { cancelPending: () => unknown }) =>
      tx.cancelPending()
    );
  progression.lock.mockReset().mockResolvedValue({
    pendingXp: 5,
    userId: "user-1",
  });
  progression.notify.mockReset();
  progression.notifyInTransaction
    .mockReset()
    .mockImplementation(() => Promise.resolve());
  progression.post.mockReset().mockResolvedValue({ eventId: "reversal-1" });
});

describe("streak integrity decision", () => {
  it("reconciles only an actor-attributed reverse inside the decision transaction", async () => {
    const { db, tx } = createStore([
      {
        amount: 5,
        id: "streak-day-1",
        kind: "streak_day",
        reversesEventId: null,
        subjectId: null,
        userId: "user-1",
      },
    ]);

    await decideIntegrityCase(
      db as never,
      {
        action: "reverse",
        actorUserId: "staff-1",
        caseId: "case-1",
        reason: "Abuso confirmado por revision humana",
      },
      new Date("2026-08-11T12:00:00.000Z")
    );

    expect(reconciliation.run).toHaveBeenCalledWith(tx, {
      actorUserId: "staff-1",
      caseId: "case-1",
      now: new Date("2026-08-11T12:00:00.000Z"),
      userId: "user-1",
    });
  });

  it("reverses and reconciles a capped zero-XP Streak Day", async () => {
    const { db, tx } = createStore([
      {
        amount: 0,
        id: "capped-streak-day-1",
        kind: "streak_day",
        reversesEventId: null,
        subjectId: null,
        userId: "user-1",
      },
    ]);

    await decideIntegrityCase(db as never, {
      action: "reverse",
      actorUserId: "staff-1",
      caseId: "case-1",
      reason: "Abuso confirmado por revision humana",
    });

    expect(progression.post).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        amount: -0,
        reversesEventId: "capped-streak-day-1",
      }),
      expect.any(Date)
    );
    expect(reconciliation.run).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ userId: "user-1" })
    );
  });

  it("does not rewrite streak history for a non-reversal decision", async () => {
    const { db } = createStore();
    await decideIntegrityCase(db as never, {
      action: "dismiss",
      actorUserId: "staff-1",
      caseId: "case-1",
      reason: "La evidencia resumida no confirma abuso",
    });
    expect(reconciliation.run).not.toHaveBeenCalled();
  });

  it("does not reconcile a reversal that contains no Streak Day", async () => {
    const { db } = createStore([
      {
        amount: 1,
        id: "comic-event-1",
        kind: "comic_reading",
        reversesEventId: null,
        subjectId: null,
        userId: "user-1",
      },
    ]);
    await decideIntegrityCase(db as never, {
      action: "reverse",
      actorUserId: "staff-1",
      caseId: "case-1",
      reason: "Abuso confirmado fuera del sistema de Racha",
    });
    expect(reconciliation.run).not.toHaveBeenCalled();
  });

  it("audits a cancelled Pending Streak Day as reversed", async () => {
    const pendingDay = {
      amount: 5,
      id: "pending-streak-day",
      kind: "streak_day",
      userId: "user-1",
    };
    const { db } = createStore([], [pendingDay]);

    await expect(
      decideIntegrityCase(db as never, {
        action: "reverse",
        actorUserId: "staff-1",
        caseId: "case-1",
        reason: "Abuso confirmado por revision humana",
      })
    ).resolves.toMatchObject({ status: "reversed" });
    expect(reconciliation.run).toHaveBeenCalledOnce();
  });

  it("treats a repeated reversal decision as an idempotent replay", async () => {
    const store = createTransactionalStore();
    progression.lock.mockImplementation((tx) => ({
      pendingXp: tx.state.pendingXp,
      userId: "user-1",
    }));
    const input = {
      action: "reverse" as const,
      actorUserId: "staff-1",
      caseId: "case-1",
      reason: "Abuso confirmado por revision humana",
    };

    await expect(
      decideIntegrityCase(store.db as never, input)
    ).resolves.toMatchObject({
      replayed: false,
      status: "reversed",
    });
    await expect(
      decideIntegrityCase(store.db as never, input)
    ).resolves.toMatchObject({
      replayed: true,
    });
    expect(reconciliation.run).toHaveBeenCalledOnce();
    expect(store.getState()).toMatchObject({
      caseStatus: "reversed",
      eventState: "cancelled",
      pendingXp: 0,
    });
  });

  it("rolls back an earlier Pending cancellation when reconciliation fails", async () => {
    const store = createTransactionalStore();
    progression.lock.mockImplementation((tx) => ({
      pendingXp: tx.state.pendingXp,
      userId: "user-1",
    }));
    reconciliation.run.mockRejectedValueOnce(new Error("projection failed"));

    await expect(
      decideIntegrityCase(store.db as never, {
        action: "reverse",
        actorUserId: "staff-1",
        caseId: "case-1",
        reason: "Abuso confirmado por revision humana",
      })
    ).rejects.toThrow("projection failed");
    expect(store.getState()).toEqual({
      caseStatus: "open",
      eventState: "pending",
      pendingXp: 5,
    });
  });
});
