import { userStreak, xpEvent } from "@repo/db/schema/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { reconcileStreakAfterIntegrityDecisionInTransaction } from "./streak";

const progression = vi.hoisted(() => ({
  lock: vi.fn(),
  pending: vi.fn(),
  post: vi.fn(),
}));

vi.mock("./progression", () => ({
  createPendingXpEventInTransaction: progression.pending,
  lockUserProgressionInTransaction: progression.lock,
  postXpEventInTransaction: progression.post,
}));

type LedgerEvent = Pick<
  typeof xpEvent.$inferSelect,
  | "amount"
  | "createdAt"
  | "id"
  | "kind"
  | "metadata"
  | "reversesEventId"
  | "state"
> &
  Partial<
    Pick<
      typeof xpEvent.$inferSelect,
      "availableAt" | "integrityCaseId" | "reasonCode" | "sourceRef"
    >
  >;

function createTransaction(events: LedgerEvent[]) {
  const updates: { table: unknown; values: unknown }[] = [];
  const tx = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn().mockResolvedValue(events) })),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: unknown) => {
        updates.push({ table, values });
        return {
          where: vi.fn().mockImplementation(() => Promise.resolve()),
        };
      }),
    })),
  };
  return { tx, updates };
}

function streakDay(
  day: number,
  previousDay: number | null,
  overrides: Partial<LedgerEvent> = {}
): LedgerEvent {
  const localDate = `2026-08-${String(day).padStart(2, "0")}`;
  return {
    amount: 5,
    createdAt: new Date(`${localDate}T12:00:00.000Z`),
    id: `day-${day}`,
    kind: "streak_day",
    metadata: {
      dayKey: `user-1:1:${localDate}`,
      localDate,
      previousDayKey:
        previousDay === null
          ? null
          : `user-1:1:2026-08-${String(previousDay).padStart(2, "0")}`,
    },
    reversesEventId: null,
    state: "posted",
    ...overrides,
  };
}

describe("streak ledger reconciliation", () => {
  beforeEach(() => {
    progression.lock.mockReset().mockResolvedValue({
      pendingXp: 50,
      userId: "user-1",
    });
    progression.post.mockReset().mockResolvedValue({ eventId: "reversal-1" });
    progression.pending.mockReset().mockResolvedValue({
      eventId: "pending-reprice-1",
    });
  });

  it("groups a Pending release by day key and repairs a broken middle chain", async () => {
    const pendingDay3 = streakDay(3, 2, {
      id: "pending-day-3",
      state: "cancelled",
    });
    const releasedDay3 = streakDay(3, 2, {
      id: "released-day-3",
      metadata: {
        ...pendingDay3.metadata,
        releasedPendingEventId: pendingDay3.id,
      },
    });
    const { tx, updates } = createTransaction([
      streakDay(1, null),
      streakDay(2, 1),
      {
        ...streakDay(2, 1),
        id: "reverse-day-2",
        kind: "reversal",
        metadata: {},
        reversesEventId: "day-2",
      },
      pendingDay3,
      releasedDay3,
      streakDay(4, 3),
    ]);
    await reconcileStreakAfterIntegrityDecisionInTransaction(tx as never, {
      actorUserId: "staff-1",
      caseId: "case-1",
      now: new Date("2026-08-05T12:00:00.000Z"),
      userId: "user-1",
    });

    expect(
      updates.find(({ table }) => table === userStreak)?.values
    ).toMatchObject({
      bestStreak: 2,
      currentStreak: 2,
      lastCompletedDayKey: "user-1:1:2026-08-04",
      lastCompletedLocalDate: "2026-08-04",
    });
  });

  it("preserves capped zero-XP days while rebuilding after a later reversal", async () => {
    const cappedDay = streakDay(2, 1, { amount: 0 });
    const reversedDay = streakDay(3, 2);
    const { tx, updates } = createTransaction([
      streakDay(1, null),
      cappedDay,
      reversedDay,
      {
        ...reversedDay,
        id: "reverse-day-3",
        kind: "reversal",
        metadata: {},
        reversesEventId: reversedDay.id,
      },
    ]);

    await reconcileStreakAfterIntegrityDecisionInTransaction(tx as never, {
      actorUserId: "staff-1",
      caseId: "case-1",
      now: new Date("2026-08-04T12:00:00.000Z"),
      userId: "user-1",
    });

    expect(
      updates.find(({ table }) => table === userStreak)?.values
    ).toMatchObject({
      bestStreak: 2,
      currentStreak: 2,
      lastCompletedDayKey: "user-1:1:2026-08-02",
    });
  });

  it("reprices posted descendants after a broken middle chain", async () => {
    const days = Array.from({ length: 8 }, (_, index) => {
      const day = index + 1;
      return streakDay(day, index === 0 ? null : index, {
        amount: day >= 8 ? 15 : day >= 4 ? 10 : 5,
      });
    });
    const { tx, updates } = createTransaction([
      ...days,
      {
        ...streakDay(4, 3),
        id: "reverse-day-4",
        kind: "reversal",
        metadata: {},
        reversesEventId: "day-4",
      },
    ]);

    await reconcileStreakAfterIntegrityDecisionInTransaction(tx as never, {
      actorUserId: "staff-1",
      caseId: "case-1",
      now: new Date("2026-08-09T12:00:00.000Z"),
      userId: "user-1",
    });

    expect(progression.post).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        amount: -10,
        idempotencyKey: "integrity-reprice-reversal:case-1:day-5",
        reversesEventId: "day-5",
      }),
      expect.any(Date)
    );
    expect(progression.post).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        amount: 5,
        idempotencyKey: "integrity-reprice:case-1:day-5",
        kind: "streak_day",
      }),
      expect.any(Date)
    );
    expect(
      updates.find(({ table }) => table === userStreak)?.values
    ).toMatchObject({ currentStreak: 4 });
  });

  it("reprices Pending descendants without releasing their XP", async () => {
    const pendingDay5 = streakDay(5, 4, {
      amount: 10,
      availableAt: new Date("2026-08-12T12:00:00.000Z"),
      integrityCaseId: "case-day-5",
      reasonCode: "streak_day_completed",
      sourceRef: "comment:day-5",
      state: "pending",
    });
    const { tx } = createTransaction([
      streakDay(1, null),
      streakDay(2, 1),
      streakDay(3, 2),
      streakDay(4, 3, { amount: 10 }),
      pendingDay5,
      {
        ...streakDay(4, 3),
        id: "reverse-day-4",
        kind: "reversal",
        metadata: {},
        reversesEventId: "day-4",
      },
    ]);

    await reconcileStreakAfterIntegrityDecisionInTransaction(tx as never, {
      actorUserId: "staff-1",
      caseId: "case-1",
      now: new Date("2026-08-09T12:00:00.000Z"),
      userId: "user-1",
    });

    expect(progression.pending).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        amount: 5,
        availableAt: new Date("2026-08-12T12:00:00.000Z"),
        idempotencyKey: "integrity-reprice:case-1:day-5",
        integrityCaseId: "case-day-5",
        sourceCreatedAt: pendingDay5.createdAt,
      }),
      expect.any(Date)
    );
    expect(progression.post).not.toHaveBeenCalled();
  });

  it("reopens an unsupported challenge and accepts a later day-keyed achievement", async () => {
    const days = Array.from({ length: 15 }, (_, index) =>
      streakDay(index + 1, index === 0 ? null : index)
    );
    const reversedDay5 = {
      ...streakDay(5, 4),
      id: "reverse-day-5",
      kind: "reversal",
      metadata: {},
      reversesEventId: "day-5",
    } satisfies LedgerEvent;
    const firstAchievement = {
      amount: 50,
      createdAt: new Date("2026-08-10T12:00:01.000Z"),
      id: "challenge-day-10",
      kind: "streak_challenge",
      metadata: {
        completedDayKey: "user-1:1:2026-08-10",
        target: 10,
      },
      reversesEventId: null,
      state: "posted",
    } satisfies LedgerEvent;

    const reopened = createTransaction([
      ...days.slice(0, 10),
      reversedDay5,
      firstAchievement,
    ]);
    await reconcileStreakAfterIntegrityDecisionInTransaction(
      reopened.tx as never,
      {
        actorUserId: "staff-1",
        caseId: "case-1",
        now: new Date("2026-08-11T12:00:00.000Z"),
        userId: "user-1",
      }
    );
    expect(progression.post).toHaveBeenCalledWith(
      reopened.tx,
      expect.objectContaining({ reversesEventId: firstAchievement.id }),
      expect.any(Date)
    );
    expect(
      reopened.updates.find(({ table }) => table === userStreak)?.values
    ).toMatchObject({
      challengeCompletedAt: null,
      challengeCompletedDayKey: null,
    });

    const reachievement = {
      ...firstAchievement,
      createdAt: new Date("2026-08-15T12:00:01.000Z"),
      id: "challenge-day-15",
      metadata: {
        completedDayKey: "user-1:1:2026-08-15",
        target: 10,
      },
    } satisfies LedgerEvent;
    progression.post.mockClear();
    const repaired = createTransaction([
      ...days,
      reversedDay5,
      firstAchievement,
      {
        ...firstAchievement,
        id: "reverse-challenge-day-10",
        kind: "reversal",
        metadata: {},
        reversesEventId: firstAchievement.id,
      },
      reachievement,
    ]);
    await reconcileStreakAfterIntegrityDecisionInTransaction(
      repaired.tx as never,
      {
        actorUserId: "staff-1",
        caseId: "case-2",
        now: new Date("2026-08-16T12:00:00.000Z"),
        userId: "user-1",
      }
    );
    expect(progression.post).not.toHaveBeenCalled();
    expect(
      repaired.updates.find(({ table }) => table === userStreak)?.values
    ).toMatchObject({
      challengeCompletedDayKey: "user-1:1:2026-08-15",
      currentStreak: 10,
    });
  });

  it("cancels Pending challenge XP and persists the rebuilt projection", async () => {
    const pendingChallenge = {
      amount: 50,
      createdAt: new Date("2026-08-10T12:00:01.000Z"),
      id: "pending-challenge",
      kind: "streak_challenge",
      metadata: {
        completedDayKey: "user-1:1:2026-08-10",
        target: 10,
      },
      reversesEventId: null,
      state: "pending",
    } satisfies LedgerEvent;
    const updates: { table: unknown; values: unknown }[] = [];
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([
            ...Array.from({ length: 10 }, (_, index) =>
              streakDay(index + 1, index === 0 ? null : index)
            ),
            {
              ...streakDay(5, 4),
              id: "reverse-day-5",
              kind: "reversal",
              metadata: {},
              reversesEventId: "day-5",
            },
            pendingChallenge,
          ]),
        })),
      })),
      update: vi.fn((table: unknown) => ({
        set: vi.fn((values: unknown) => {
          updates.push({ table, values });
          return {
            where: vi.fn().mockImplementation(() => Promise.resolve()),
          };
        }),
      })),
    };

    await reconcileStreakAfterIntegrityDecisionInTransaction(tx as never, {
      actorUserId: "staff-1",
      caseId: "case-1",
      now: new Date("2026-08-11T12:00:00.000Z"),
      userId: "user-1",
    });

    expect(
      updates.find(({ table }) => table === xpEvent)?.values
    ).toMatchObject({ decidedBy: "staff-1", state: "cancelled" });
    expect(
      updates.find(({ table }) => table === userStreak)?.values
    ).toMatchObject({
      bestStreak: 5,
      challengeCompletedAt: null,
      currentStreak: 5,
    });
    expect(progression.lock).toHaveBeenCalledOnce();
    expect(progression.post).not.toHaveBeenCalled();
  });

  it("appends a challenge reversal and propagates failure for transaction rollback", async () => {
    const challenge = {
      amount: 50,
      createdAt: new Date("2026-08-10T12:00:01.000Z"),
      id: "posted-challenge",
      kind: "streak_challenge",
      metadata: {
        completedDayKey: "user-1:1:2026-08-10",
        target: 10,
      },
      reversesEventId: null,
      state: "posted",
    } satisfies LedgerEvent;
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([streakDay(10, 9), challenge]),
        })),
      })),
      update: vi.fn(),
    };
    progression.post.mockRejectedValueOnce(new Error("database failed"));

    await expect(
      reconcileStreakAfterIntegrityDecisionInTransaction(tx as never, {
        actorUserId: "staff-1",
        caseId: "case-1",
        now: new Date("2026-08-11T12:00:00.000Z"),
        userId: "user-1",
      })
    ).rejects.toThrow("database failed");
    expect(progression.post).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        amount: expect.any(Number),
        idempotencyKey: "integrity-reversal:case-1:posted-challenge",
        reversesEventId: "posted-challenge",
      }),
      new Date("2026-08-11T12:00:00.000Z")
    );
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("aborts before projection updates when a challenge reversal mismatches", async () => {
    const challenge = {
      amount: 50,
      createdAt: new Date("2026-08-10T12:00:01.000Z"),
      id: "posted-challenge",
      kind: "streak_challenge",
      metadata: {
        completedDayKey: "user-1:1:2026-08-10",
        target: 10,
      },
      reversesEventId: null,
      state: "posted",
    } satisfies LedgerEvent;
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([streakDay(10, 9), challenge]),
        })),
      })),
      update: vi.fn(),
    };
    progression.post.mockResolvedValueOnce({
      projectionMismatch: true,
      projectionMismatchWalletIds: ["wallet-1"],
    });

    await expect(
      reconcileStreakAfterIntegrityDecisionInTransaction(tx as never, {
        actorUserId: "staff-1",
        caseId: "case-1",
        now: new Date("2026-08-11T12:00:00.000Z"),
        userId: "user-1",
      })
    ).rejects.toThrow("XP_PROJECTION_MISMATCH");
    expect(tx.update).not.toHaveBeenCalled();
  });
});
