import type * as DbModule from "@repo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyStreakEvidenceInTransaction,
  completeStreakStepUpInTransaction,
  getStreakState,
  selectStreakChallengeInTransaction,
  setStreakTimezoneInTransaction,
} from "./streak";

const testEnv = vi.hoisted(() => ({
  DAILY_STREAK_ENABLED: false,
  XP_ACCRUAL_ENABLED: false,
  XP_ECONOMY_ENABLED: false,
}));
const activation = vi.hoisted(() => ({
  readProgressionActivationDate: vi.fn(),
}));
const progression = vi.hoisted(() => ({
  createPendingXpEventInTransaction: vi.fn().mockResolvedValue({
    eventId: "challenge-xp",
    pendingXp: 50,
    replayed: false,
  }),
  notifyXpSettlementInTransaction: vi.fn(),
  postXpEventInTransaction: vi.fn(),
}));
const integritySettlement = vi.hoisted(() => ({
  settleXpWithIntegrityInTransaction: vi.fn().mockResolvedValue({
    caseId: "case-1",
    eventId: "daily-xp",
    outcome: "pending",
    replayed: false,
  }),
}));
const notifications = vi.hoisted(() => ({
  createUserNotification: vi.fn(),
}));
const redis = vi.hoisted(() => ({
  client: {
    expire: vi.fn().mockResolvedValue(true),
    get: vi.fn().mockResolvedValue(null),
    incr: vi.fn().mockResolvedValue(1),
    set: vi.fn().mockResolvedValue("OK"),
  },
  getRedis: vi.fn(),
}));

vi.mock("@repo/env", () => ({ env: testEnv }));
vi.mock("@repo/db", async (importOriginal) => ({
  ...(await importOriginal<typeof DbModule>()),
  getRedis: redis.getRedis,
}));
vi.mock("./notification", () => notifications);
vi.mock("./progression-activation", () => activation);
vi.mock("./progression", () => progression);
vi.mock("./integrity-settlement", () => integritySettlement);

beforeEach(() => {
  redis.getRedis.mockResolvedValue(redis.client);
});

describe("streak challenge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testEnv.DAILY_STREAK_ENABLED = true;
    testEnv.XP_ACCRUAL_ENABLED = true;
    testEnv.XP_ECONOMY_ENABLED = true;
    activation.readProgressionActivationDate.mockResolvedValue(new Date(0));
    progression.postXpEventInTransaction.mockResolvedValue({
      eventId: "xp-1",
      replayed: false,
    });
    notifications.createUserNotification.mockResolvedValue("notification-1");
  });

  it("selects one higher target and keeps it immutable", async () => {
    const db = createStreakDb({
      currentStreak: 1,
      lastCompletedDayKey: "user-1:1:2026-08-08",
      lastCompletedLocalDate: "2026-08-08",
    });
    const now = new Date("2026-08-08T12:00:00.000Z");

    await expect(
      selectStreakChallengeInTransaction(db as never, "user-1", 10, now)
    ).resolves.toMatchObject({ target: 10 });
    await expect(db.query.userStreak.findFirst()).resolves.toMatchObject({
      challengeTarget: 10,
    });
    await expect(
      selectStreakChallengeInTransaction(db as never, "user-1", 20, now)
    ).rejects.toMatchObject({ code: "CHALLENGE_ALREADY_SELECTED" });
  });

  it("keeps targets unavailable until a new Day 1 after a break", async () => {
    const db = createStreakDb({
      currentStreak: 30,
      lastCompletedDayKey: "user-1:1:2026-08-01",
      lastCompletedLocalDate: "2026-08-01",
    });
    const now = new Date("2026-08-08T12:00:00.000Z");

    await expect(
      getStreakState(db as never, "user-1", now)
    ).resolves.toMatchObject({
      challenge: { availableTargets: [], offerAvailable: false },
      currentStreak: 0,
    });
    await expect(
      selectStreakChallengeInTransaction(db as never, "user-1", 10, now)
    ).rejects.toMatchObject({ code: "CHALLENGE_NOT_AVAILABLE" });
  });

  it("awards and notifies once in the transaction that reaches the target", async () => {
    const db = createStreakDb({
      challengeSelectedAt: new Date("2026-08-01T12:00:00.000Z"),
      challengeTarget: 10,
      currentStreak: 9,
      lastCompletedDayKey: "user-1:1:2026-08-07",
      lastCompletedLocalDate: "2026-08-07",
    });
    const now = new Date("2026-08-08T12:00:00.000Z");

    await expect(
      applyStreakEvidenceInTransaction(
        db as never,
        contributionEvidence("comment-10"),
        now
      )
    ).resolves.toMatchObject({
      challenge: { amount: 50, completed: true, target: 10 },
      currentStreak: 10,
    });
    expect(progression.postXpEventInTransaction).toHaveBeenNthCalledWith(
      2,
      db,
      expect.objectContaining({
        amount: 50,
        idempotencyKey: "streak-challenge:user-1:1:2026-08-08:10",
        kind: "streak_challenge",
        metadata: expect.objectContaining({
          completedDayKey: "user-1:1:2026-08-08",
          rewardConfigVersion: "daily-streak-v1",
          target: 10,
        }),
      }),
      now
    );
    expect(notifications.createUserNotification).toHaveBeenCalledOnce();

    await applyStreakEvidenceInTransaction(
      db as never,
      contributionEvidence("comment-replay"),
      now
    );
    expect(progression.postXpEventInTransaction).toHaveBeenCalledTimes(2);
    expect(notifications.createUserNotification).toHaveBeenCalledOnce();
  });

  it("uses a fresh challenge key after the same completion was reversed", async () => {
    const db = createStreakDb({
      challengeSelectedAt: new Date("2026-08-01T12:00:00.000Z"),
      challengeTarget: 10,
      currentStreak: 9,
      lastCompletedDayKey: "user-1:1:2026-08-07",
      lastCompletedLocalDate: "2026-08-07",
    });
    const now = new Date("2026-08-08T12:00:00.000Z");
    db.query.xpEvent.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "original-challenge", state: "posted" })
      .mockResolvedValueOnce({ id: "challenge-reversal", state: "posted" });

    await applyStreakEvidenceInTransaction(
      db as never,
      contributionEvidence("comment-after-challenge-reversal"),
      now
    );

    expect(progression.postXpEventInTransaction).toHaveBeenNthCalledWith(
      2,
      db,
      expect.objectContaining({
        idempotencyKey:
          "streak-challenge:user-1:1:2026-08-08:10:retry:1786190400000",
      }),
      now
    );
  });

  it("reports a challenge bonus as pending until its XP is reviewed", async () => {
    progression.postXpEventInTransaction
      .mockResolvedValueOnce({
        eventId: "daily-xp",
        pendingXp: false,
        replayed: false,
      })
      .mockResolvedValueOnce({
        eventId: "challenge-xp",
        pendingXp: true,
        replayed: false,
      });
    const db = createStreakDb({
      challengeSelectedAt: new Date("2026-08-01T12:00:00.000Z"),
      challengeTarget: 10,
      currentStreak: 9,
      lastCompletedDayKey: "user-1:1:2026-08-07",
      lastCompletedLocalDate: "2026-08-07",
    });

    await expect(
      applyStreakEvidenceInTransaction(
        db as never,
        contributionEvidence("comment-10"),
        new Date("2026-08-08T12:00:00.000Z")
      )
    ).resolves.toMatchObject({
      challenge: { amount: 50, outcome: "pending", target: 10 },
    });
    expect(notifications.createUserNotification).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        description: expect.stringContaining("pendientes de revisión"),
        metadata: expect.objectContaining({ outcome: "pending" }),
      })
    );
  });

  it("offers only higher targets after Day 1 and resets the offer after a break", async () => {
    const dayOne = createStreakDb({
      currentStreak: 1,
      lastCompletedDayKey: "user-1:1:2026-08-08",
      lastCompletedLocalDate: "2026-08-08",
    });
    dayOne.query.xpEvent.findFirst.mockResolvedValue({
      amount: 5,
      metadata: { path: "contribution" },
      state: "posted",
    });

    await expect(
      getStreakState(
        dayOne as never,
        "user-1",
        new Date("2026-08-08T12:00:00.000Z")
      )
    ).resolves.toMatchObject({
      challenge: {
        availableTargets: [
          { target: 10, xp: 50 },
          { target: 20, xp: 125 },
          { target: 30, xp: 250 },
        ],
        offerAvailable: true,
      },
    });

    const broken = createStreakDb({
      challengeSelectedAt: new Date("2026-08-01T12:00:00.000Z"),
      challengeTarget: 20,
      currentStreak: 12,
      lastCompletedDayKey: "user-1:1:2026-08-01",
      lastCompletedLocalDate: "2026-08-01",
    });
    await expect(
      getStreakState(
        broken as never,
        "user-1",
        new Date("2026-08-08T12:00:00.000Z")
      )
    ).resolves.toMatchObject({
      challenge: {
        completedDays: 0,
        offerAvailable: false,
        remainingDays: 20,
        target: 20,
      },
      currentStreak: 0,
    });
  });

  it("reports the completed ledger bonus without recalculating it", async () => {
    const db = createStreakDb({
      challengeCompletedAt: new Date("2026-08-01T12:00:00.000Z"),
      challengeCompletedDayKey: "user-1:1:2026-08-01",
      challengeSelectedAt: new Date("2026-07-20T12:00:00.000Z"),
      challengeTarget: 10,
      currentStreak: 10,
      lastCompletedDayKey: "user-1:1:2026-08-01",
      lastCompletedLocalDate: "2026-08-01",
    });
    db.query.xpEvent.findFirst.mockResolvedValue({
      amount: 40,
      metadata: {},
      state: "posted",
    });

    await expect(
      getStreakState(
        db as never,
        "user-1",
        new Date("2026-08-08T12:00:00.000Z")
      )
    ).resolves.toMatchObject({
      challenge: {
        completed: true,
        completionOutcome: "immediate",
        upcomingBonus: 40,
      },
    });
  });

  it("reports a cancelled challenge bonus instead of claiming it was paid", async () => {
    const db = createStreakDb({
      challengeCompletedAt: new Date("2026-08-01T12:00:00.000Z"),
      challengeCompletedDayKey: "user-1:1:2026-08-01",
      challengeSelectedAt: new Date("2026-07-20T12:00:00.000Z"),
      challengeTarget: 10,
      currentStreak: 10,
      lastCompletedDayKey: "user-1:1:2026-08-01",
      lastCompletedLocalDate: "2026-08-01",
    });
    db.query.xpEvent.findFirst
      .mockResolvedValueOnce({
        amount: 50,
        id: "pending-challenge",
        metadata: {},
        state: "cancelled",
      })
      .mockResolvedValueOnce(null);

    await expect(
      getStreakState(
        db as never,
        "user-1",
        new Date("2026-08-08T12:00:00.000Z")
      )
    ).resolves.toMatchObject({
      challenge: {
        completed: true,
        completionOutcome: "cancelled",
        upcomingBonus: 0,
      },
    });
  });

  it("resolves the posted release of a formerly pending challenge bonus", async () => {
    const db = createStreakDb({
      challengeCompletedAt: new Date("2026-08-01T12:00:00.000Z"),
      challengeCompletedDayKey: "user-1:1:2026-08-01",
      challengeSelectedAt: new Date("2026-07-20T12:00:00.000Z"),
      challengeTarget: 10,
      currentStreak: 10,
      lastCompletedDayKey: "user-1:1:2026-08-01",
      lastCompletedLocalDate: "2026-08-01",
    });
    db.query.xpEvent.findFirst
      .mockResolvedValueOnce({
        amount: 50,
        id: "pending-challenge",
        metadata: {},
        state: "cancelled",
      })
      .mockResolvedValueOnce({
        amount: 50,
        id: "released-challenge",
        metadata: { releasedPendingEventId: "pending-challenge" },
        state: "posted",
      });

    await expect(
      getStreakState(
        db as never,
        "user-1",
        new Date("2026-08-08T12:00:00.000Z")
      )
    ).resolves.toMatchObject({
      challenge: {
        completed: true,
        completionOutcome: "immediate",
        upcomingBonus: 50,
      },
    });
  });

  it("keeps a cancelled daily reward completed without reporting its XP", async () => {
    const db = createStreakDb({
      currentEvidence: { completedPath: "contribution" },
      currentEvidenceDayKey: "user-1:1:2026-08-08",
      currentStreak: 1,
      lastCompletedDayKey: "user-1:1:2026-08-08",
      lastCompletedLocalDate: "2026-08-08",
    });
    db.query.xpEvent.findFirst
      .mockResolvedValueOnce({
        amount: 5,
        id: "pending-daily",
        metadata: { path: "contribution" },
        state: "cancelled",
      })
      .mockResolvedValueOnce(null);

    await expect(
      getStreakState(
        db as never,
        "user-1",
        new Date("2026-08-08T12:00:00.000Z")
      )
    ).resolves.toMatchObject({
      contribution: { completed: true },
      currentStreak: 1,
      pendingXp: false,
      todayXp: 0,
    });
  });

  it("reports the latest retry settlement for the current local day", async () => {
    const db = createStreakDb({
      currentEvidence: { completedPath: "reading" },
      currentEvidenceDayKey: "user-1:1:2026-08-08",
      currentStreak: 1,
      lastCompletedDayKey: "user-1:1:2026-08-08",
      lastCompletedLocalDate: "2026-08-08",
    });
    db.query.xpEvent.findFirst.mockResolvedValueOnce({
      amount: 10,
      id: "retry-daily",
      metadata: { path: "reading" },
      state: "posted",
    });

    await expect(
      getStreakState(
        db as never,
        "user-1",
        new Date("2026-08-08T12:00:00.000Z")
      )
    ).resolves.toMatchObject({
      pendingXp: false,
      reading: { completed: true },
      todayXp: 10,
    });
    expect(db.query.xpEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: expect.any(Array) })
    );
  });

  it("reports a repriced replacement for the current local day", async () => {
    const db = createStreakDb({
      currentStreak: 1,
      lastCompletedDayKey: "user-1:1:2026-08-08",
      lastCompletedLocalDate: "2026-08-08",
    });
    db.query.xpEvent.findFirst
      .mockResolvedValueOnce({
        amount: 10,
        id: "original-daily",
        metadata: { path: "reading" },
        state: "posted",
      })
      .mockResolvedValueOnce({
        amount: 5,
        id: "repriced-daily",
        metadata: {
          path: "reading",
          repricedFromEventId: "original-daily",
        },
        state: "pending",
      });

    await expect(
      getStreakState(
        db as never,
        "user-1",
        new Date("2026-08-08T12:00:00.000Z")
      )
    ).resolves.toMatchObject({
      pendingXp: true,
      reading: { completed: true },
      todayXp: 5,
    });
  });

  it("completes a challenge without claiming XP at the Account cap", async () => {
    progression.postXpEventInTransaction.mockResolvedValue({
      eventId: null,
      replayed: false,
      settledXp: 0,
    });
    const db = createStreakDb({
      challengeSelectedAt: new Date("2026-08-01T12:00:00.000Z"),
      challengeTarget: 10,
      currentStreak: 9,
      lastCompletedDayKey: "user-1:1:2026-08-07",
      lastCompletedLocalDate: "2026-08-07",
    });
    const now = new Date("2026-08-08T12:00:00.000Z");

    await expect(
      applyStreakEvidenceInTransaction(
        db as never,
        contributionEvidence("comment-10"),
        now
      )
    ).resolves.toMatchObject({
      challenge: { amount: 0, completed: true, outcome: "capped", target: 10 },
      completed: true,
    });
    expect(notifications.createUserNotification).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        description: expect.stringContaining("máximo"),
        metadata: expect.objectContaining({ outcome: "capped", xp: 0 }),
      })
    );

    await expect(
      getStreakState(db as never, "user-1", now)
    ).resolves.toMatchObject({
      challenge: { completionOutcome: "capped", upcomingBonus: 0 },
      contribution: { completed: true },
      currentStreak: 10,
      todayXp: 0,
    });
  });

  it("reports only the clipped challenge XP credited at the Account cap", async () => {
    progression.postXpEventInTransaction
      .mockResolvedValueOnce({
        eventId: "daily-xp",
        replayed: false,
        settledXp: 15,
      })
      .mockResolvedValueOnce({
        eventId: "challenge-xp",
        replayed: false,
        settledXp: 10,
      });
    const db = createStreakDb({
      challengeSelectedAt: new Date("2026-08-01T12:00:00.000Z"),
      challengeTarget: 10,
      currentStreak: 9,
      lastCompletedDayKey: "user-1:1:2026-08-07",
      lastCompletedLocalDate: "2026-08-07",
    });

    await expect(
      applyStreakEvidenceInTransaction(
        db as never,
        contributionEvidence("comment-10"),
        new Date("2026-08-08T12:00:00.000Z")
      )
    ).resolves.toMatchObject({
      challenge: { amount: 10, outcome: "capped" },
    });
    expect(notifications.createUserNotification).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        description: expect.stringContaining("Se sumaron 10 XP"),
        metadata: expect.objectContaining({ outcome: "capped", xp: 10 }),
      })
    );
  });

  it("rolls challenge completion back when its notification cannot be created", async () => {
    notifications.createUserNotification.mockRejectedValueOnce(
      new Error("notification unavailable")
    );
    const db = createStreakDb({
      challengeSelectedAt: new Date("2026-08-01T12:00:00.000Z"),
      challengeTarget: 10,
      currentStreak: 9,
      lastCompletedDayKey: "user-1:1:2026-08-07",
      lastCompletedLocalDate: "2026-08-07",
    });

    await expect(
      applyStreakEvidenceInTransaction(
        db as never,
        contributionEvidence("comment-10"),
        new Date("2026-08-08T12:00:00.000Z")
      )
    ).rejects.toThrow("notification unavailable");
    const stored = await db.query.userStreak.findFirst();
    expect(stored).toMatchObject({ currentStreak: 9 });
    expect(stored).not.toHaveProperty("challengeCompletedAt");
  });
});

describe("comment streak qualification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testEnv.DAILY_STREAK_ENABLED = false;
    testEnv.XP_ACCRUAL_ENABLED = false;
    testEnv.XP_ECONOMY_ENABLED = false;
  });

  it.each([
    [false, true, true],
    [true, false, true],
    [true, true, false],
  ])(
    "creates no state with gates streak=%s accrual=%s economy=%s",
    async (dailyStreak, accrual, economy) => {
      testEnv.DAILY_STREAK_ENABLED = dailyStreak;
      testEnv.XP_ACCRUAL_ENABLED = accrual;
      testEnv.XP_ECONOMY_ENABLED = economy;
      const tx = { query: {} };

      await expect(
        applyStreakEvidenceInTransaction(
          tx as never,
          {
            impersonated: false,
            kind: "contribution",
            source: { id: "comment-1", kind: "comment" },
            text: "Un comentario suficientemente largo para completar la racha.",
            timezone: "America/Argentina/Buenos_Aires",
            userId: "user-1",
          },
          new Date("2026-08-08T02:59:59.000Z")
        )
      ).resolves.toMatchObject({ available: false, completed: false });
      expect(activation.readProgressionActivationDate).not.toHaveBeenCalled();
    }
  );

  it("creates no state before persisted progression activation", async () => {
    testEnv.DAILY_STREAK_ENABLED = true;
    testEnv.XP_ACCRUAL_ENABLED = true;
    testEnv.XP_ECONOMY_ENABLED = true;
    activation.readProgressionActivationDate.mockResolvedValue(null);

    await expect(
      applyStreakEvidenceInTransaction(
        { select: vi.fn() } as never,
        {
          impersonated: false,
          kind: "contribution",
          source: { id: "comment-1", kind: "comment" },
          text: "x".repeat(40),
          timezone: "UTC",
          userId: "user-1",
        },
        new Date()
      )
    ).resolves.toEqual({ available: false, completed: false });
  });

  it("awards one server-assigned local day with bounded audit metadata", async () => {
    testEnv.DAILY_STREAK_ENABLED = true;
    testEnv.XP_ACCRUAL_ENABLED = true;
    testEnv.XP_ECONOMY_ENABLED = true;
    activation.readProgressionActivationDate.mockResolvedValue(
      new Date("2026-08-01T00:00:00.000Z")
    );
    progression.postXpEventInTransaction.mockResolvedValue({
      eventId: "xp-1",
      replayed: false,
    });
    const updated = vi.fn(async () => {});
    const tx = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn(async () => {}),
        })),
      })),
      query: {
        eterisWallet: { findFirst: vi.fn().mockResolvedValue(null) },
        streakProtectionWindow: { findMany: vi.fn().mockResolvedValue([]) },
        user: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ banned: false, emailVerified: true }),
        },
        userStreak: { findFirst: vi.fn().mockResolvedValue(null) },
        xpEvent: { findFirst: vi.fn().mockResolvedValue(null) },
        xpRiskSignal: { findMany: vi.fn().mockResolvedValue([]) },
      },
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            for: vi.fn().mockResolvedValue([
              {
                bestStreak: 0,
                currentStreak: 0,
                lastCompletedDayKey: null,
                lastCompletedLocalDate: null,
                timezone: "America/Argentina/Buenos_Aires",
                timezoneVersion: 1,
              },
            ]),
          })),
        })),
      })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: updated })) })),
    };
    const now = new Date("2026-08-08T02:59:59.000Z");

    await expect(
      applyStreakEvidenceInTransaction(
        tx as never,
        {
          impersonated: false,
          kind: "contribution",
          source: { id: "comment-1", kind: "comment" },
          text: "Un comentario suficientemente largo para completar la racha.",
          timezone: "America/Argentina/Buenos_Aires",
          userId: "user-1",
        },
        now
      )
    ).resolves.toMatchObject({ amount: 5, completed: true, currentStreak: 1 });
    expect(progression.postXpEventInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        amount: 5,
        idempotencyKey: "streak-day:user-1:1:2026-08-07",
        kind: "streak_day",
        metadata: {
          dayKey: "user-1:1:2026-08-07",
          localDate: "2026-08-07",
          path: "contribution",
          periodEndsAt: "2026-08-08T03:00:00.000Z",
          periodStartsAt: "2026-08-07T03:00:00.000Z",
          previousDayKey: null,
          rewardConfigVersion: "daily-streak-v1",
          source: { id: "comment-1", kind: "comment" },
          sourceTimestamp: now.toISOString(),
          timezone: "America/Argentina/Buenos_Aires",
          timezoneVersion: 1,
        },
        sourceCreatedAt: now,
      }),
      now
    );
    expect(updated).toHaveBeenCalledOnce();
  });

  it("keeps the source write successful when the initial timezone is invalid", async () => {
    testEnv.DAILY_STREAK_ENABLED = true;
    testEnv.XP_ACCRUAL_ENABLED = true;
    testEnv.XP_ECONOMY_ENABLED = true;
    activation.readProgressionActivationDate.mockResolvedValue(new Date(0));
    const tx = {
      insert: vi.fn(),
      query: {
        eterisWallet: { findFirst: vi.fn().mockResolvedValue(null) },
        streakProtectionWindow: { findMany: vi.fn().mockResolvedValue([]) },
        user: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ banned: false, emailVerified: true }),
        },
        userStreak: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    };

    await expect(
      applyStreakEvidenceInTransaction(
        tx as never,
        {
          impersonated: false,
          kind: "contribution",
          source: { id: "comment-1", kind: "comment" },
          text: "Un comentario suficientemente largo para completar la racha.",
          timezone: "Invalid/Timezone",
          userId: "user-1",
        },
        new Date()
      )
    ).resolves.toEqual({ available: true, completed: false });
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it.each([
    [{ banned: false, emailVerified: false }, null, false],
    [{ banned: true, emailVerified: true }, null, false],
    [{ banned: false, emailVerified: true }, { status: "frozen" }, false],
    [{ banned: false, emailVerified: true }, null, true],
  ])(
    "does not mutate state for an ineligible actor",
    async (account, wallet, impersonated) => {
      testEnv.DAILY_STREAK_ENABLED = true;
      testEnv.XP_ACCRUAL_ENABLED = true;
      testEnv.XP_ECONOMY_ENABLED = true;
      activation.readProgressionActivationDate.mockResolvedValue(new Date(0));
      const tx = {
        insert: vi.fn(),
        query: {
          eterisWallet: { findFirst: vi.fn().mockResolvedValue(wallet) },
          user: { findFirst: vi.fn().mockResolvedValue(account) },
        },
      };

      await expect(
        applyStreakEvidenceInTransaction(
          tx as never,
          {
            impersonated,
            kind: "contribution",
            source: { id: "comment-1", kind: "comment" },
            text: "x".repeat(40),
            timezone: "UTC",
            userId: "user-1",
          },
          new Date()
        )
      ).resolves.toEqual({ available: true, completed: false });
      expect(tx.insert).not.toHaveBeenCalled();
    }
  );

  it("requires 40 characters after contribution normalization", async () => {
    testEnv.DAILY_STREAK_ENABLED = true;
    testEnv.XP_ACCRUAL_ENABLED = true;
    testEnv.XP_ECONOMY_ENABLED = true;
    activation.readProgressionActivationDate.mockResolvedValue(new Date(0));
    const findStreak = vi.fn().mockResolvedValue(null);
    const tx = {
      insert: vi.fn(),
      query: {
        eterisWallet: { findFirst: vi.fn().mockResolvedValue(null) },
        streakProtectionWindow: { findMany: vi.fn().mockResolvedValue([]) },
        user: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ banned: false, emailVerified: true }),
        },
        userStreak: { findFirst: findStreak },
      },
    };
    const evidence = {
      impersonated: false,
      kind: "contribution" as const,
      source: { id: "comment-1", kind: "comment" as const },
      timezone: "Invalid/Timezone",
      userId: "user-1",
    };

    await applyStreakEvidenceInTransaction(
      tx as never,
      { ...evidence, text: ` ${"x".repeat(39)} ` },
      new Date()
    );
    expect(findStreak).not.toHaveBeenCalled();

    await applyStreakEvidenceInTransaction(
      tx as never,
      { ...evidence, text: ` ${"x".repeat(40)} ` },
      new Date()
    );
    expect(findStreak).toHaveBeenCalledOnce();
  });

  it.each([
    ["an empty review", ""],
    ["a 99-character review", "x".repeat(99)],
    ["a 2001-character review", "x".repeat(2001)],
    ["a review containing a URL", `${"x".repeat(100)} https://example.com`],
  ])("rejects %s as review Contribution evidence", async (_, text) => {
    testEnv.DAILY_STREAK_ENABLED = true;
    testEnv.XP_ACCRUAL_ENABLED = true;
    testEnv.XP_ECONOMY_ENABLED = true;
    activation.readProgressionActivationDate.mockResolvedValue(new Date(0));
    const findStreak = vi.fn().mockResolvedValue(null);
    const tx = {
      insert: vi.fn(),
      query: {
        eterisWallet: { findFirst: vi.fn().mockResolvedValue(null) },
        streakProtectionWindow: { findMany: vi.fn().mockResolvedValue([]) },
        user: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ banned: false, emailVerified: true }),
        },
        userStreak: { findFirst: findStreak },
      },
    };

    await applyStreakEvidenceInTransaction(
      tx as never,
      {
        impersonated: false,
        kind: "contribution",
        source: { id: "review-1", kind: "review" },
        text,
        timezone: "UTC",
        userId: "user-1",
      },
      new Date()
    );

    expect(findStreak).not.toHaveBeenCalled();
  });

  it.each([100, 2000])(
    "accepts a %i-character review at the canonical boundary",
    async (length) => {
      testEnv.DAILY_STREAK_ENABLED = true;
      testEnv.XP_ACCRUAL_ENABLED = true;
      testEnv.XP_ECONOMY_ENABLED = true;
      activation.readProgressionActivationDate.mockResolvedValue(new Date(0));
      const findStreak = vi.fn().mockResolvedValue(null);
      const tx = {
        insert: vi.fn(),
        query: {
          eterisWallet: { findFirst: vi.fn().mockResolvedValue(null) },
          user: {
            findFirst: vi
              .fn()
              .mockResolvedValue({ banned: false, emailVerified: true }),
          },
          userStreak: { findFirst: findStreak },
        },
      };

      await applyStreakEvidenceInTransaction(
        tx as never,
        {
          impersonated: false,
          kind: "contribution",
          source: { id: "review-1", kind: "review" },
          text: "x".repeat(length),
          timezone: "Invalid/Timezone",
          userId: "user-1",
        },
        new Date()
      );

      expect(findStreak).toHaveBeenCalledOnce();
    }
  );
});

describe("comic reading streak qualification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testEnv.DAILY_STREAK_ENABLED = true;
    testEnv.XP_ACCRUAL_ENABLED = true;
    testEnv.XP_ECONOMY_ENABLED = true;
    activation.readProgressionActivationDate.mockResolvedValue(new Date(0));
    progression.postXpEventInTransaction.mockResolvedValue({
      eventId: "xp-1",
      replayed: false,
    });
  });

  it("completes after three distinct pages and replays a competing contribution", async () => {
    let stored = {
      bestStreak: 0,
      currentEvidence: {},
      currentEvidenceDayKey: null as string | null,
      currentStreak: 0,
      lastCompletedDayKey: null as string | null,
      lastCompletedLocalDate: null as string | null,
      timezone: "UTC",
      timezoneVersion: 1,
    };
    const tx = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn().mockResolvedValue(null),
        })),
      })),
      query: {
        eterisWallet: { findFirst: vi.fn().mockResolvedValue(null) },
        streakProtectionWindow: { findMany: vi.fn().mockResolvedValue([]) },
        user: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ banned: false, emailVerified: true }),
        },
        userStreak: { findFirst: vi.fn(() => Promise.resolve(stored)) },
        xpEvent: { findFirst: vi.fn().mockResolvedValue(null) },
        xpRiskSignal: { findMany: vi.fn().mockResolvedValue([]) },
      },
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            for: vi.fn(() => Promise.resolve([stored])),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((values) => ({
          where: vi.fn(() => {
            stored = { ...stored, ...values };
          }),
        })),
      })),
    };
    const now = new Date("2026-08-08T12:00:00.000Z");
    const read = (comicId: string, page: number) =>
      applyStreakEvidenceInTransaction(
        tx as never,
        {
          comicId,
          impersonated: false,
          kind: "reading",
          page,
          userId: "user-1",
        },
        now
      );

    await expect(read("comic-1", 1)).resolves.toMatchObject({
      completed: false,
      reading: { progress: 1, required: 3 },
    });
    await expect(read("comic-1", 1)).resolves.toMatchObject({
      completed: false,
      reading: { progress: 1, required: 3 },
    });
    await expect(read("comic-2", 1)).resolves.toMatchObject({
      completed: false,
      reading: { progress: 2, required: 3 },
    });
    await expect(read("comic-1", 2)).resolves.toMatchObject({
      completed: true,
      currentStreak: 1,
    });
    await expect(
      applyStreakEvidenceInTransaction(
        tx as never,
        {
          impersonated: false,
          kind: "contribution",
          source: { id: "review-1", kind: "review" },
          text: "x".repeat(100),
          userId: "user-1",
        },
        now
      )
    ).resolves.toMatchObject({ completed: true, replayed: true });
    expect(progression.postXpEventInTransaction).toHaveBeenCalledOnce();
    expect(progression.postXpEventInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        metadata: expect.objectContaining({
          path: "reading",
          source: { pageKeys: ["comic-1:1", "comic-2:1", "comic-1:2"] },
        }),
      }),
      now
    );
  });

  it("allows the same page to count again on a later local day", async () => {
    const updated = vi.fn().mockResolvedValue(null);
    const tx = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn().mockResolvedValue(null),
        })),
      })),
      query: {
        eterisWallet: { findFirst: vi.fn().mockResolvedValue(null) },
        streakProtectionWindow: { findMany: vi.fn().mockResolvedValue([]) },
        user: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ banned: false, emailVerified: true }),
        },
        userStreak: {
          findFirst: vi.fn().mockResolvedValue({
            currentEvidence: { readingPageKeys: ["comic-1:1"] },
            currentEvidenceDayKey: "user-1:1:2026-08-07",
            timezone: "UTC",
          }),
        },
      },
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            for: vi.fn().mockResolvedValue([
              {
                bestStreak: 0,
                currentEvidence: { readingPageKeys: ["comic-1:1"] },
                currentEvidenceDayKey: "user-1:1:2026-08-07",
                currentStreak: 0,
                lastCompletedDayKey: null,
                lastCompletedLocalDate: null,
                timezone: "UTC",
                timezoneVersion: 1,
              },
            ]),
          })),
        })),
      })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: updated })) })),
    };

    await expect(
      applyStreakEvidenceInTransaction(
        tx as never,
        {
          comicId: "comic-1",
          impersonated: false,
          kind: "reading",
          page: 1,
          userId: "user-1",
        },
        new Date("2026-08-08T12:00:00.000Z")
      )
    ).resolves.toMatchObject({
      completed: false,
      reading: { progress: 1, required: 3 },
    });
    expect(updated).toHaveBeenCalledOnce();
  });

  it("serializes a concurrent third checkpoint and contribution into one reward", async () => {
    let stored = {
      bestStreak: 0,
      currentEvidence: { readingPageKeys: ["comic-1:1", "comic-1:2"] },
      currentEvidenceDayKey: "user-1:1:2026-08-08",
      currentStreak: 0,
      lastCompletedDayKey: null as string | null,
      lastCompletedLocalDate: null as string | null,
      timezone: "UTC",
      timezoneVersion: 1,
    };
    let locked = false;
    let releaseWaiter: ((rows: [typeof stored]) => void) | undefined;
    const tx = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn().mockResolvedValue(null),
        })),
      })),
      query: {
        eterisWallet: { findFirst: vi.fn().mockResolvedValue(null) },
        streakProtectionWindow: { findMany: vi.fn().mockResolvedValue([]) },
        user: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ banned: false, emailVerified: true }),
        },
        userStreak: { findFirst: vi.fn(() => Promise.resolve(stored)) },
        xpEvent: { findFirst: vi.fn().mockResolvedValue(null) },
        xpRiskSignal: { findMany: vi.fn().mockResolvedValue([]) },
      },
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            for: vi.fn(() => {
              if (!locked) {
                locked = true;
                return Promise.resolve([stored]);
              }
              return new Promise<[typeof stored]>((resolve) => {
                releaseWaiter = resolve;
              });
            }),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((values) => ({
          where: vi.fn(() => {
            stored = { ...stored, ...values };
            releaseWaiter?.([stored]);
          }),
        })),
      })),
    };
    const now = new Date("2026-08-08T12:00:00.000Z");
    const checkpoint = () =>
      applyStreakEvidenceInTransaction(
        tx as never,
        {
          comicId: "comic-1",
          impersonated: false,
          kind: "reading",
          page: 3,
          userId: "user-1",
        },
        now
      );
    const contribution = () =>
      applyStreakEvidenceInTransaction(
        tx as never,
        {
          impersonated: false,
          kind: "contribution",
          source: { id: "review-1", kind: "review" },
          text: "x".repeat(100),
          userId: "user-1",
        },
        now
      );

    const results = await Promise.all([checkpoint(), contribution()]);

    expect(results).toEqual([
      expect.objectContaining({ completed: true, replayed: false }),
      expect.objectContaining({ completed: true, replayed: true }),
    ]);
    expect(progression.postXpEventInTransaction).toHaveBeenCalledOnce();
    expect(stored.currentStreak).toBe(1);
  });

  it("reports only the path that completed the day", async () => {
    const db = {
      query: {
        userStreak: {
          findFirst: vi.fn().mockResolvedValue({
            bestStreak: 4,
            currentEvidence: {},
            currentEvidenceDayKey: null,
            currentStreak: 4,
            lastCompletedDayKey: "user-1:1:2026-08-08",
            lastCompletedLocalDate: "2026-08-08",
            timezone: "UTC",
            timezoneVersion: 1,
          }),
        },
        xpEvent: {
          findFirst: vi.fn().mockResolvedValue({
            amount: 10,
            metadata: { path: "reading" },
            state: "posted",
          }),
        },
      },
      select: vi.fn(),
    };

    await expect(
      getStreakState(
        db as never,
        "user-1",
        new Date("2026-08-08T12:00:00.000Z")
      )
    ).resolves.toMatchObject({
      contribution: { completed: false, progress: 0, required: 1 },
      reading: { completed: true, progress: 3, required: 3 },
    });
  });
});

describe("mixed discovery streak qualification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testEnv.DAILY_STREAK_ENABLED = true;
    testEnv.XP_ACCRUAL_ENABLED = true;
    testEnv.XP_ECONOMY_ENABLED = true;
    activation.readProgressionActivationDate.mockResolvedValue(new Date(0));
    progression.postXpEventInTransaction.mockResolvedValue({
      eventId: "xp-1",
      replayed: false,
    });
  });

  it.each([
    ["bookmark", "bookmark"],
    ["bookmark", "follow"],
    ["bookmark", "rating"],
    ["follow", "follow"],
    ["follow", "rating"],
    ["rating", "rating"],
  ] as const)(
    "completes with reading plus distinct %s and %s inserts",
    async (firstKind, secondKind) => {
      const { receiptRows, tx } = createMixedDiscoveryDb();
      const now = new Date("2026-08-08T12:00:00.000Z");

      await applyStreakEvidenceInTransaction(
        tx as never,
        readingEvidence(1),
        now
      );
      await expect(
        applyStreakEvidenceInTransaction(
          tx as never,
          discoveryEvidence(firstKind, "post:post-1"),
          now
        )
      ).resolves.toMatchObject({
        completed: false,
        mixedDiscovery: {
          discovery: { progress: 1, required: 2 },
          reading: { progress: 1, required: 1 },
        },
      });
      await expect(
        applyStreakEvidenceInTransaction(
          tx as never,
          discoveryEvidence(secondKind, "comic:comic-2"),
          now
        )
      ).resolves.toMatchObject({ completed: true, currentStreak: 1 });

      expect(receiptRows).toEqual([
        {
          actionKind: firstKind,
          contentKey: "post:post-1",
          dayKey: "user-1:1:2026-08-08",
          usedAt: now,
          userId: "user-1",
        },
        {
          actionKind: secondKind,
          contentKey: "comic:comic-2",
          dayKey: "user-1:1:2026-08-08",
          usedAt: now,
          userId: "user-1",
        },
      ]);
      expect(progression.postXpEventInTransaction).toHaveBeenCalledOnce();
      expect(progression.postXpEventInTransaction).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          metadata: expect.objectContaining({ path: "mixed_discovery" }),
        }),
        now
      );
    }
  );

  it("keeps candidates unconsumed until two distinct content items qualify", async () => {
    const { receiptRows, tx } = createMixedDiscoveryDb();
    const now = new Date("2026-08-08T12:00:00.000Z");

    await applyStreakEvidenceInTransaction(
      tx as never,
      readingEvidence(1),
      now
    );
    await applyStreakEvidenceInTransaction(
      tx as never,
      discoveryEvidence("bookmark", "post:post-1"),
      now
    );
    await expect(
      applyStreakEvidenceInTransaction(
        tx as never,
        discoveryEvidence("follow", "post:post-1"),
        now
      )
    ).resolves.toMatchObject({
      completed: false,
      mixedDiscovery: {
        discovery: { progress: 1, required: 2 },
      },
    });

    expect(receiptRows).toEqual([]);
    expect(progression.postXpEventInTransaction).not.toHaveBeenCalled();
  });

  it("ignores a lifetime-consumed tuple after removal and recreation", async () => {
    const { tx } = createMixedDiscoveryDb([{ dayKey: "old-day" }, null]);
    const now = new Date("2026-08-08T12:00:00.000Z");

    await applyStreakEvidenceInTransaction(
      tx as never,
      readingEvidence(1),
      now
    );
    await expect(
      applyStreakEvidenceInTransaction(
        tx as never,
        discoveryEvidence("bookmark", "post:post-1"),
        now
      )
    ).resolves.toMatchObject({
      completed: false,
      mixedDiscovery: { discovery: { progress: 0, required: 2 } },
    });
    await expect(
      applyStreakEvidenceInTransaction(
        tx as never,
        discoveryEvidence("rating", "comic:comic-2"),
        now
      )
    ).resolves.toMatchObject({
      completed: false,
      mixedDiscovery: { discovery: { progress: 1, required: 2 } },
    });
  });

  it("completes when the reading checkpoint arrives after both candidates", async () => {
    const { receiptRows, tx } = createMixedDiscoveryDb();
    const now = new Date("2026-08-08T12:00:00.000Z");

    await applyStreakEvidenceInTransaction(
      tx as never,
      discoveryEvidence("bookmark", "post:post-1"),
      now
    );
    await expect(
      applyStreakEvidenceInTransaction(
        tx as never,
        discoveryEvidence("follow", "comic:comic-2"),
        now
      )
    ).resolves.toMatchObject({
      completed: false,
      mixedDiscovery: {
        discovery: { progress: 2, required: 2 },
        reading: { progress: 0, required: 1 },
      },
    });
    await expect(
      applyStreakEvidenceInTransaction(tx as never, readingEvidence(1), now)
    ).resolves.toMatchObject({ completed: true, currentStreak: 1 });

    expect(receiptRows).toHaveLength(2);
  });

  it("serializes competing completion actions into one daily event", async () => {
    let stored = {
      bestStreak: 0,
      currentEvidence: {
        discoveryCandidates: [
          { actionKind: "bookmark" as const, contentKey: "post:post-1" },
        ],
        readingPageKeys: ["comic-1:1"],
      },
      currentEvidenceDayKey: "user-1:1:2026-08-08",
      currentStreak: 0,
      lastCompletedDayKey: null as string | null,
      lastCompletedLocalDate: null as string | null,
      pendingTimezone: null,
      timezone: "UTC",
      timezoneChangeAvailableAt: null,
      timezoneChangeEffectiveAt: null,
      timezoneVersion: 1,
      userId: "user-1",
    };
    let locked = false;
    let releaseWaiter: ((rows: [typeof stored]) => void) | undefined;
    const tx = {
      insert: vi.fn(() => ({
        values: vi.fn((values: unknown) =>
          Array.isArray(values)
            ? Promise.resolve()
            : { onConflictDoNothing: vi.fn().mockResolvedValue(null) }
        ),
      })),
      query: {
        eterisWallet: { findFirst: vi.fn().mockResolvedValue(null) },
        streakDiscoveryReceipt: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
        streakProtectionWindow: { findMany: vi.fn().mockResolvedValue([]) },
        user: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ banned: false, emailVerified: true }),
        },
        userStreak: { findFirst: vi.fn(() => Promise.resolve(stored)) },
        xpEvent: { findFirst: vi.fn().mockResolvedValue(null) },
        xpRiskSignal: { findMany: vi.fn().mockResolvedValue([]) },
      },
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            for: vi.fn(() => {
              if (!locked) {
                locked = true;
                return Promise.resolve([stored]);
              }
              return new Promise<[typeof stored]>((resolve) => {
                releaseWaiter = resolve;
              });
            }),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((values) => ({
          where: vi.fn(() => {
            stored = { ...stored, ...values };
            releaseWaiter?.([stored]);
          }),
        })),
      })),
    };
    const now = new Date("2026-08-08T12:00:00.000Z");

    const results = await Promise.all([
      applyStreakEvidenceInTransaction(
        tx as never,
        discoveryEvidence("follow", "comic:comic-2"),
        now
      ),
      applyStreakEvidenceInTransaction(
        tx as never,
        discoveryEvidence("rating", "post:post-3"),
        now
      ),
    ]);

    expect(results).toEqual([
      expect.objectContaining({ completed: true, replayed: false }),
      expect.objectContaining({ completed: true, replayed: true }),
    ]);
    expect(progression.postXpEventInTransaction).toHaveBeenCalledOnce();
  });

  it("returns aggregate Mixed progress without content keys", async () => {
    const db = createStreakDb({
      currentEvidence: {
        discoveryCandidates: [
          { actionKind: "bookmark", contentKey: "post:private-1" },
        ],
        readingPageKeys: ["comic-private:1"],
      },
      currentEvidenceDayKey: "user-1:1:2026-08-08",
    });

    const state = await getStreakState(
      db as never,
      "user-1",
      new Date("2026-08-08T12:00:00.000Z")
    );

    expect(state).toMatchObject({
      mixedDiscovery: {
        completed: false,
        discovery: { progress: 1, required: 2 },
        reading: { progress: 1, required: 1 },
      },
    });
    expect(JSON.stringify(state)).not.toContain("private-1");
  });

  it("clears private Mixed candidates after their local day rolls over", async () => {
    const db = createStreakDb({
      currentEvidence: {
        discoveryCandidates: [
          { actionKind: "bookmark", contentKey: "post:private-1" },
        ],
        readingPageKeys: ["comic-private:1"],
      },
      currentEvidenceDayKey: "user-1:1:2026-08-07",
    });

    await expect(
      getStreakState(
        db as never,
        "user-1",
        new Date("2026-08-08T12:00:00.000Z")
      )
    ).resolves.toMatchObject({
      mixedDiscovery: {
        discovery: { progress: 0 },
        reading: { progress: 0 },
      },
    });
    await expect(db.query.userStreak.findFirst()).resolves.toMatchObject({
      currentEvidence: {},
      currentEvidenceDayKey: null,
    });
  });

  it("retains prior-day reading evidence during the checkpoint retry window", async () => {
    const db = createStreakDb({
      currentEvidence: {
        readingPageKeys: ["comic-private:1", "comic-private:2"],
      },
      currentEvidenceDayKey: "user-1:1:2026-08-07",
      updatedAt: new Date("2026-08-08T00:30:00.000Z"),
    });

    await getStreakState(
      db as never,
      "user-1",
      new Date("2026-08-08T02:00:00.000Z")
    );

    await expect(db.query.userStreak.findFirst()).resolves.toMatchObject({
      currentEvidence: {
        readingPageKeys: ["comic-private:1", "comic-private:2"],
      },
      currentEvidenceDayKey: "user-1:1:2026-08-07",
    });
  });
});

describe("streak continuity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testEnv.DAILY_STREAK_ENABLED = true;
    testEnv.XP_ACCRUAL_ENABLED = true;
    testEnv.XP_ECONOMY_ENABLED = true;
    activation.readProgressionActivationDate.mockResolvedValue(new Date(0));
    progression.postXpEventInTransaction.mockResolvedValue({
      eventId: "xp-1",
      replayed: false,
    });
  });

  it("enforces the rolling timezone cooldown until its exact boundary", async () => {
    const db = createStreakDb({
      timezone: "UTC",
      timezoneChangeAvailableAt: new Date("2026-09-07T12:00:00.000Z"),
    });

    await expect(
      setStreakTimezoneInTransaction(
        db as never,
        "user-1",
        "America/Los_Angeles",
        new Date("2026-09-07T11:59:59.999Z")
      )
    ).rejects.toMatchObject({ code: "TIMEZONE_COOLDOWN" });

    await expect(
      setStreakTimezoneInTransaction(
        db as never,
        "user-1",
        "America/Los_Angeles",
        new Date("2026-09-07T12:00:00.000Z")
      )
    ).resolves.toMatchObject({
      pendingTimezone: "America/Los_Angeles",
      timezone: "UTC",
    });
  });

  it("canonicalizes equivalent zones without starting a cooldown", async () => {
    const db = createStreakDb({ timezone: "US/Eastern" });

    await expect(
      setStreakTimezoneInTransaction(
        db as never,
        "user-1",
        "america/new_york",
        new Date("2026-08-08T12:00:00.000Z")
      )
    ).resolves.toMatchObject({
      timezone: "America/New_York",
    });
    await expect(db.query.userStreak.findFirst()).resolves.toMatchObject({
      pendingTimezone: null,
      timezone: "America/New_York",
      timezoneChangeAvailableAt: null,
    });
  });

  it("skips the partial destination day then activates a versioned full day", async () => {
    const db = createStreakDb({
      bestStreak: 3,
      currentStreak: 3,
      lastCompletedDayKey: "user-1:1:2026-08-08",
      lastCompletedLocalDate: "2026-08-08",
      pendingTimezone: "America/Los_Angeles",
      timezone: "UTC",
      timezoneChangeAvailableAt: new Date("2026-09-07T12:00:00.000Z"),
      timezoneChangeEffectiveAt: new Date("2026-08-09T07:00:00.000Z"),
    });

    await expect(
      applyStreakEvidenceInTransaction(
        db as never,
        contributionEvidence("partial"),
        new Date("2026-08-09T02:00:00.000Z")
      )
    ).resolves.toMatchObject({ completed: false, partialTimezoneDay: true });
    expect(progression.postXpEventInTransaction).not.toHaveBeenCalled();

    const now = new Date("2026-08-09T07:00:00.000Z");
    await expect(
      applyStreakEvidenceInTransaction(
        db as never,
        contributionEvidence("full-day"),
        now
      )
    ).resolves.toMatchObject({ completed: true, currentStreak: 4 });
    expect(progression.postXpEventInTransaction).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        idempotencyKey: "streak-day:user-1:2:2026-08-09",
        metadata: expect.objectContaining({
          previousDayKey: "user-1:1:2026-08-08",
          timezone: "America/Los_Angeles",
          timezoneVersion: 2,
        }),
      }),
      now
    );
  });

  it("earns the final old-zone day before the partial and versioned destination days", async () => {
    const db = createStreakDb({
      bestStreak: 2,
      currentStreak: 2,
      lastCompletedDayKey: "user-1:1:2026-08-07",
      lastCompletedLocalDate: "2026-08-07",
      timezone: "UTC",
    });

    await setStreakTimezoneInTransaction(
      db as never,
      "user-1",
      "America/Los_Angeles",
      new Date("2026-08-08T12:00:00.000Z")
    );

    const oldDay = new Date("2026-08-08T20:00:00.000Z");
    await expect(
      applyStreakEvidenceInTransaction(
        db as never,
        contributionEvidence("old-zone"),
        oldDay
      )
    ).resolves.toMatchObject({ completed: true, currentStreak: 3 });
    expect(progression.postXpEventInTransaction).toHaveBeenLastCalledWith(
      db,
      expect.objectContaining({
        idempotencyKey: "streak-day:user-1:1:2026-08-08",
        metadata: expect.objectContaining({ timezone: "UTC" }),
      }),
      oldDay
    );

    await expect(
      getStreakState(
        db as never,
        "user-1",
        new Date("2026-08-09T02:00:00.000Z")
      )
    ).resolves.toMatchObject({ partialTimezoneDay: true, todayXp: 0 });
    await expect(
      applyStreakEvidenceInTransaction(
        db as never,
        contributionEvidence("partial-zone"),
        new Date("2026-08-09T02:00:00.000Z")
      )
    ).resolves.toMatchObject({ completed: false, partialTimezoneDay: true });

    const destinationDay = new Date("2026-08-09T07:00:00.000Z");
    await expect(
      applyStreakEvidenceInTransaction(
        db as never,
        contributionEvidence("destination-zone"),
        destinationDay
      )
    ).resolves.toMatchObject({ completed: true, currentStreak: 4 });
    expect(progression.postXpEventInTransaction).toHaveBeenLastCalledWith(
      db,
      expect.objectContaining({
        idempotencyKey: "streak-day:user-1:2:2026-08-09",
        metadata: expect.objectContaining({
          timezone: "America/Los_Angeles",
          timezoneVersion: 2,
        }),
      }),
      destinationDay
    );
  });

  it("blocks reading and review evidence during protected days", async () => {
    for (const evidence of [readingEvidence(1), reviewEvidence("protected")]) {
      const db = createStreakDb(
        {
          currentStreak: 1,
          lastCompletedDayKey: "user-1:1:2026-08-07",
          lastCompletedLocalDate: "2026-08-07",
        },
        [
          {
            endsAt: new Date("2026-08-10T00:00:00.000Z"),
            startsAt: new Date("2026-08-09T00:00:00.000Z"),
          },
        ]
      );

      await expect(
        applyStreakEvidenceInTransaction(
          db as never,
          evidence,
          new Date("2026-08-08T12:00:00.000Z")
        )
      ).resolves.toMatchObject({ completed: false, protectedDay: true });
    }
    expect(progression.postXpEventInTransaction).not.toHaveBeenCalled();
  });

  it("blocks reading and review evidence during partial timezone days", async () => {
    for (const evidence of [readingEvidence(1), reviewEvidence("partial")]) {
      const db = createStreakDb({
        pendingTimezone: "America/Los_Angeles",
        timezone: "UTC",
        timezoneChangeAvailableAt: new Date("2026-09-07T12:00:00.000Z"),
        timezoneChangeEffectiveAt: new Date("2026-08-09T07:00:00.000Z"),
      });

      await expect(
        applyStreakEvidenceInTransaction(
          db as never,
          evidence,
          new Date("2026-08-09T02:00:00.000Z")
        )
      ).resolves.toMatchObject({
        completed: false,
        partialTimezoneDay: true,
      });
    }
    expect(progression.postXpEventInTransaction).not.toHaveBeenCalled();
  });

  it("resumes after a declared flag pause on the next full local day", async () => {
    const db = createStreakDb(
      {
        bestStreak: 3,
        currentStreak: 3,
        lastCompletedDayKey: "user-1:1:2026-08-07",
        lastCompletedLocalDate: "2026-08-07",
      },
      [
        {
          endsAt: new Date("2026-08-09T00:00:01.000Z"),
          startsAt: new Date("2026-08-08T00:00:00.000Z"),
        },
      ]
    );

    testEnv.DAILY_STREAK_ENABLED = false;
    await expect(
      applyStreakEvidenceInTransaction(
        db as never,
        reviewEvidence("disabled"),
        new Date("2026-08-08T10:00:00.000Z")
      )
    ).resolves.toEqual({ available: false, completed: false });

    testEnv.DAILY_STREAK_ENABLED = true;
    await expect(
      getStreakState(
        db as never,
        "user-1",
        new Date("2026-08-08T12:00:00.000Z")
      )
    ).resolves.toMatchObject({ protectedDay: true, todayXp: 0 });
    await expect(
      applyStreakEvidenceInTransaction(
        db as never,
        reviewEvidence("partial-resume"),
        new Date("2026-08-08T12:00:00.000Z")
      )
    ).resolves.toMatchObject({ completed: false, protectedDay: true });
    expect(progression.postXpEventInTransaction).not.toHaveBeenCalled();

    await expect(
      applyStreakEvidenceInTransaction(
        db as never,
        reviewEvidence("full-resume"),
        new Date("2026-08-09T12:00:00.000Z")
      )
    ).resolves.toMatchObject({ completed: true, currentStreak: 4 });
  });

  it.each([
    [
      "protects a deadline at the interval start",
      "2026-08-09T00:00:00.000Z",
      "2026-08-10T00:00:00.000Z",
      true,
    ],
    [
      "does not protect a deadline at the interval end",
      "2026-08-08T00:00:00.000Z",
      "2026-08-09T00:00:00.000Z",
      false,
    ],
  ])("%s", async (_, startsAt, endsAt, protectedDay) => {
    const db = createStreakDb(
      {
        bestStreak: 1,
        currentStreak: 1,
        lastCompletedDayKey: "user-1:1:2026-08-07",
        lastCompletedLocalDate: "2026-08-07",
      },
      [{ endsAt: new Date(endsAt), startsAt: new Date(startsAt) }]
    );

    const result = await applyStreakEvidenceInTransaction(
      db as never,
      contributionEvidence("edge"),
      new Date("2026-08-08T12:00:00.000Z")
    );

    expect(result).toMatchObject(
      protectedDay
        ? { completed: false, protectedDay: true }
        : { completed: true, currentStreak: 2 }
    );
  });

  it("preserves continuity across several protected misses", async () => {
    const db = createStreakDb(
      {
        bestStreak: 3,
        currentStreak: 3,
        lastCompletedDayKey: "user-1:1:2026-08-05",
        lastCompletedLocalDate: "2026-08-05",
      },
      [
        {
          endsAt: new Date("2026-08-10T00:00:00.000Z"),
          startsAt: new Date("2026-08-07T00:00:00.000Z"),
        },
      ]
    );

    await expect(
      applyStreakEvidenceInTransaction(
        db as never,
        contributionEvidence("protected-misses"),
        new Date("2026-08-09T12:00:00.000Z")
      )
    ).resolves.toMatchObject({ completed: true, currentStreak: 4 });
  });

  it("resets only the current chain after an unprotected miss", async () => {
    const db = createStreakDb(
      {
        bestStreak: 8,
        currentStreak: 3,
        lastCompletedDayKey: "user-1:1:2026-08-05",
        lastCompletedLocalDate: "2026-08-05",
      },
      [
        {
          endsAt: new Date("2026-08-08T00:00:00.000Z"),
          startsAt: new Date("2026-08-07T00:00:00.000Z"),
        },
      ]
    );

    await expect(
      applyStreakEvidenceInTransaction(
        db as never,
        contributionEvidence("miss"),
        new Date("2026-08-09T12:00:00.000Z")
      )
    ).resolves.toMatchObject({ completed: true, currentStreak: 1 });
  });

  it("reports protected continuity lazily without awarding progress", async () => {
    const db = createStreakDb(
      {
        bestStreak: 8,
        currentStreak: 3,
        lastCompletedDayKey: "user-1:1:2026-08-05",
        lastCompletedLocalDate: "2026-08-05",
      },
      [
        {
          endsAt: new Date("2026-08-11T00:00:00.000Z"),
          startsAt: new Date("2026-08-07T00:00:00.000Z"),
        },
      ]
    );

    await expect(
      getStreakState(
        db as never,
        "user-1",
        new Date("2026-08-09T12:00:00.000Z")
      )
    ).resolves.toMatchObject({
      atRisk: false,
      currentStreak: 3,
      protectedDay: true,
      reading: { progress: 0, required: 3 },
    });
    expect(progression.postXpEventInTransaction).not.toHaveBeenCalled();
  });

  it("bounds protection checks for a long-inactive public streak", async () => {
    const db = createStreakDb(
      {
        bestStreak: 3,
        currentStreak: 3,
        lastCompletedDayKey: "user-1:1:2000-01-01",
        lastCompletedLocalDate: "2000-01-01",
      },
      [
        {
          endsAt: new Date("2026-08-10T00:00:00.000Z"),
          startsAt: new Date("2000-01-03T00:00:00.000Z"),
        },
      ]
    );

    await expect(
      getStreakState(
        db as never,
        "user-1",
        new Date("2026-08-09T12:00:00.000Z")
      )
    ).resolves.toMatchObject({ currentStreak: 3 });
    expect(db.query.streakProtectionWindow.findMany).toHaveBeenCalledOnce();
  });

  it("resolves a due timezone on reads without an unlocked projection write", async () => {
    const db = createStreakDb({
      currentStreak: 1,
      lastCompletedDayKey: "user-1:1:2026-08-08",
      lastCompletedLocalDate: "2026-08-08",
      pendingTimezone: "America/Los_Angeles",
      timezoneChangeAvailableAt: new Date("2026-09-07T12:00:00.000Z"),
      timezoneChangeEffectiveAt: new Date("2026-08-09T07:00:00.000Z"),
    });

    await expect(
      getStreakState(
        db as never,
        "user-1",
        new Date("2026-08-09T12:00:00.000Z")
      )
    ).resolves.toMatchObject({
      currentStreak: 1,
      pendingTimezone: null,
      timezone: "America/Los_Angeles",
    });
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe("adaptive streak integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testEnv.DAILY_STREAK_ENABLED = true;
    testEnv.XP_ACCRUAL_ENABLED = true;
    testEnv.XP_ECONOMY_ENABLED = true;
    activation.readProgressionActivationDate.mockResolvedValue(new Date(0));
    progression.postXpEventInTransaction.mockResolvedValue({
      eventId: "xp-1",
      replayed: false,
    });
  });

  it("returns one low-cardinality completion payload for client analytics", async () => {
    const db = createStreakDb({});
    const now = new Date("2026-08-08T12:00:00.000Z");

    await expect(
      applyStreakEvidenceInTransaction(
        db as never,
        contributionEvidence("comment-1"),
        now
      )
    ).resolves.toMatchObject({
      dayCompletion: {
        outcome: "immediate",
        path: "contribution",
        tier: 5,
      },
    });
    await expect(
      applyStreakEvidenceInTransaction(
        db as never,
        contributionEvidence("comment-2"),
        now
      )
    ).resolves.not.toHaveProperty("dayCompletion");
  });

  it("notifies standard progression changes for an immediate daily reward", async () => {
    const db = createStreakDb({});
    const now = new Date("2026-08-08T12:00:00.000Z");
    const settlement = {
      eventId: "xp-1",
      level: 2,
      previousLevel: 1,
      replayed: false,
    };
    progression.postXpEventInTransaction.mockResolvedValue(settlement);

    await applyStreakEvidenceInTransaction(
      db as never,
      contributionEvidence("comment-level-up"),
      now
    );

    expect(progression.notifyXpSettlementInTransaction).toHaveBeenCalledWith(
      db,
      "user-1",
      settlement
    );
  });

  it("notifies progression changes released before a pending daily reward", async () => {
    const db = createStreakDb({});
    const releasedSettlement = {
      eventId: "released-xp",
      level: 3,
      previousLevel: 2,
      replayed: false,
    };
    db.query.xpRiskSignal.findMany.mockResolvedValue([
      { kind: "source_cap_pressure" },
    ]);
    integritySettlement.settleXpWithIntegrityInTransaction.mockResolvedValue({
      caseId: "case-1",
      eventId: "daily-xp",
      outcome: "pending",
      releasedSettlements: [releasedSettlement],
      replayed: false,
    });

    await applyStreakEvidenceInTransaction(
      db as never,
      {
        ...contributionEvidence("comment-release"),
        integrity: {
          correlation: { deviceHash: "device-a", ipPrefixHash: null },
          stepUpCleared: true,
        },
      },
      new Date("2026-08-08T12:00:00.000Z")
    );

    expect(progression.notifyXpSettlementInTransaction).toHaveBeenCalledWith(
      db,
      "user-1",
      releasedSettlement
    );
  });

  it("uses a fresh settlement key after the same local day was reversed", async () => {
    const db = createStreakDb({});
    db.query.xpEvent.findFirst
      .mockResolvedValueOnce({ id: "original-day", state: "posted" })
      .mockResolvedValueOnce({ id: "day-reversal", state: "posted" });

    await applyStreakEvidenceInTransaction(
      db as never,
      contributionEvidence("comment-after-reversal"),
      new Date("2026-08-08T12:00:00.000Z")
    );

    expect(progression.postXpEventInTransaction).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        idempotencyKey: "streak-day:user-1:1:2026-08-08:retry:1786190400000",
      }),
      expect.any(Date)
    );
  });

  it("accepts streak evidence after a temporary ban has expired", async () => {
    const db = createStreakDb({});
    db.query.user.findFirst.mockResolvedValue({
      banExpires: new Date("2026-08-07T12:00:00.000Z"),
      banned: true,
      emailVerified: true,
    });

    await expect(
      applyStreakEvidenceInTransaction(
        db as never,
        contributionEvidence("comment-after-ban"),
        new Date("2026-08-08T12:00:00.000Z")
      )
    ).resolves.toMatchObject({ completed: true });
  });

  it("ignores evidence older than the latest completed local day", async () => {
    const db = createStreakDb({
      currentStreak: 2,
      lastCompletedDayKey: "user-1:1:2026-08-09",
      lastCompletedLocalDate: "2026-08-09",
    });

    await expect(
      applyStreakEvidenceInTransaction(
        db as never,
        contributionEvidence("delayed-comment"),
        new Date("2026-08-08T12:00:00.000Z")
      )
    ).resolves.toMatchObject({ completed: false });
    await expect(db.query.userStreak.findFirst()).resolves.toMatchObject({
      currentStreak: 2,
      lastCompletedLocalDate: "2026-08-09",
    });
    expect(progression.postXpEventInTransaction).not.toHaveBeenCalled();
  });

  it("retains medium automation evidence without completing the day", async () => {
    const db = createStreakDb({});
    db.query.xpRiskSignal.findMany.mockResolvedValue([
      { kind: "rejected_sequence" },
    ]);

    await expect(
      applyStreakEvidenceInTransaction(
        db as never,
        {
          ...contributionEvidence("comment-1"),
          integrity: {
            correlation: {
              deviceHash: "device-a",
              ipPrefixHash: null,
            },
            stepUpCleared: false,
          },
        },
        new Date("2026-08-08T12:00:00.000Z")
      )
    ).resolves.toMatchObject({ completed: false, stepUpRequired: true });
    await expect(db.query.userStreak.findFirst()).resolves.toMatchObject({
      currentEvidence: {
        pendingCompletion: {
          path: "contribution",
          receivedAt: "2026-08-08T12:00:00.000Z",
        },
      },
      currentEvidenceDayKey: "user-1:1:2026-08-08",
    });
    expect(progression.postXpEventInTransaction).not.toHaveBeenCalled();
  });

  it("retains a would-complete day when Redis cannot assess velocity", async () => {
    const { tx } = createMixedDiscoveryDb();
    const integrity = {
      correlation: { deviceHash: "device-a", ipPrefixHash: null },
      stepUpCleared: false,
    };
    const now = new Date("2026-08-08T12:00:00.000Z");
    redis.getRedis.mockRejectedValue(new Error("offline"));

    await applyStreakEvidenceInTransaction(
      tx as never,
      { ...readingEvidence(1), integrity },
      now
    );
    await applyStreakEvidenceInTransaction(
      tx as never,
      { ...discoveryEvidence("bookmark", "post:1"), integrity },
      now
    );

    await expect(
      applyStreakEvidenceInTransaction(
        tx as never,
        { ...discoveryEvidence("follow", "comic:2"), integrity },
        now
      )
    ).resolves.toMatchObject({ completed: false, stepUpRequired: true });
    expect(progression.postXpEventInTransaction).not.toHaveBeenCalled();
  });

  it("re-evaluates retained evidence after a passing Step-Up", async () => {
    const db = createStreakDb({});
    db.query.xpRiskSignal.findMany.mockResolvedValue([
      { kind: "rejected_sequence" },
    ]);
    const correlation = { deviceHash: "device-a", ipPrefixHash: null };
    await applyStreakEvidenceInTransaction(
      db as never,
      {
        ...contributionEvidence("comment-1"),
        integrity: { correlation, stepUpCleared: false },
      },
      new Date("2026-08-08T12:00:00.000Z")
    );

    await expect(
      completeStreakStepUpInTransaction(
        db as never,
        "user-1",
        correlation,
        new Date("2026-08-08T12:05:00.000Z")
      )
    ).resolves.toMatchObject({ completed: true, currentStreak: 1 });
    expect(progression.postXpEventInTransaction).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        idempotencyKey: "streak-day:user-1:1:2026-08-08",
        sourceCreatedAt: new Date("2026-08-08T12:00:00.000Z"),
      }),
      expect.any(Date)
    );
    expect(redis.client.set).toHaveBeenCalledWith(
      "streak:step-up:user-1:device-a",
      "1",
      { EX: 30 * 60 }
    );
  });

  it("rejects retained evidence when the account is banned before Step-Up", async () => {
    const db = createStreakDb({});
    db.query.xpRiskSignal.findMany.mockResolvedValue([
      { kind: "rejected_sequence" },
    ]);
    const correlation = { deviceHash: "device-a", ipPrefixHash: null };
    await applyStreakEvidenceInTransaction(
      db as never,
      {
        ...contributionEvidence("comment-1"),
        integrity: { correlation, stepUpCleared: false },
      },
      new Date("2026-08-08T12:00:00.000Z")
    );
    db.query.user.findFirst.mockResolvedValue({
      banned: true,
      banExpires: new Date("2026-08-09T12:00:00.000Z"),
      emailVerified: true,
    });
    redis.client.set.mockClear();

    await expect(
      completeStreakStepUpInTransaction(
        db as never,
        "user-1",
        correlation,
        new Date("2026-08-08T12:05:00.000Z")
      )
    ).resolves.toEqual({ available: true, completed: false });
    expect(progression.postXpEventInTransaction).not.toHaveBeenCalled();
    expect(redis.client.set).not.toHaveBeenCalled();
  });

  it("preserves review qualification when Step-Up replays collapsed whitespace", async () => {
    const db = createStreakDb({});
    db.query.xpRiskSignal.findMany.mockResolvedValue([
      { kind: "rejected_sequence" },
    ]);
    const correlation = { deviceHash: "device-a", ipPrefixHash: null };
    const reviewWithCollapsibleWhitespace = `x${" ".repeat(98)}x`;

    await expect(
      applyStreakEvidenceInTransaction(
        db as never,
        {
          impersonated: false,
          integrity: { correlation, stepUpCleared: false },
          kind: "contribution",
          source: { id: "review-1", kind: "review" },
          text: reviewWithCollapsibleWhitespace,
          userId: "user-1",
        },
        new Date("2026-08-08T12:00:00.000Z")
      )
    ).resolves.toMatchObject({ completed: false, stepUpRequired: true });

    await expect(
      completeStreakStepUpInTransaction(
        db as never,
        "user-1",
        correlation,
        new Date("2026-08-08T12:05:00.000Z")
      )
    ).resolves.toMatchObject({ completed: true, currentStreak: 1 });
  });

  it("does not grant clearance without retained Step-Up evidence", async () => {
    const db = createStreakDb({});

    await expect(
      completeStreakStepUpInTransaction(
        db as never,
        "user-1",
        { deviceHash: "device-a", ipPrefixHash: null },
        new Date("2026-08-08T12:05:00.000Z")
      )
    ).resolves.toMatchObject({ completed: false });
    expect(redis.client.set).not.toHaveBeenCalled();
  });

  it("does not read retained evidence when Streaks become unavailable", async () => {
    const db = createStreakDb({});
    db.query.xpRiskSignal.findMany.mockResolvedValue([
      { kind: "rejected_sequence" },
    ]);
    const correlation = { deviceHash: "device-a", ipPrefixHash: null };
    await applyStreakEvidenceInTransaction(
      db as never,
      {
        ...contributionEvidence("comment-1"),
        integrity: { correlation, stepUpCleared: false },
      },
      new Date("2026-08-08T12:00:00.000Z")
    );
    redis.client.set.mockClear();
    db.query.userStreak.findFirst.mockClear();
    db.update.mockClear();
    testEnv.DAILY_STREAK_ENABLED = false;

    await expect(
      completeStreakStepUpInTransaction(
        db as never,
        "user-1",
        correlation,
        new Date("2026-08-08T12:05:00.000Z")
      )
    ).resolves.toEqual({ available: false, completed: false });
    expect(db.query.userStreak.findFirst).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
    expect(redis.client.set).not.toHaveBeenCalled();
  });

  it("returns unavailable without retained evidence while disabled", async () => {
    const db = createStreakDb({});
    testEnv.DAILY_STREAK_ENABLED = false;

    await expect(
      completeStreakStepUpInTransaction(
        db as never,
        "user-1",
        { deviceHash: "device-a", ipPrefixHash: null },
        new Date("2026-08-08T12:05:00.000Z")
      )
    ).resolves.toEqual({ available: false, completed: false });
    expect(db.query.userStreak.findFirst).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
    expect(redis.client.set).not.toHaveBeenCalled();
  });

  it("does not clear expired retained evidence while disabled", async () => {
    const db = createStreakDb({});
    db.query.xpRiskSignal.findMany.mockResolvedValue([
      { kind: "rejected_sequence" },
    ]);
    const correlation = { deviceHash: "device-a", ipPrefixHash: null };
    await applyStreakEvidenceInTransaction(
      db as never,
      {
        ...contributionEvidence("comment-1"),
        integrity: { correlation, stepUpCleared: false },
      },
      new Date("2026-08-08T12:00:00.000Z")
    );
    redis.client.set.mockClear();
    db.query.userStreak.findFirst.mockClear();
    db.update.mockClear();
    testEnv.DAILY_STREAK_ENABLED = false;

    await expect(
      completeStreakStepUpInTransaction(
        db as never,
        "user-1",
        correlation,
        new Date("2026-08-09T12:05:00.000Z")
      )
    ).resolves.toEqual({ available: false, completed: false });
    expect(db.query.userStreak.findFirst).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
    expect(redis.client.set).not.toHaveBeenCalled();
  });

  it("keeps non-automation risk Pending after a passing Step-Up", async () => {
    const db = createStreakDb({});
    db.query.xpRiskSignal.findMany.mockResolvedValue([
      { kind: "rejected_sequence" },
      { kind: "source_cap_pressure" },
    ]);
    const correlation = { deviceHash: "device-a", ipPrefixHash: null };
    await applyStreakEvidenceInTransaction(
      db as never,
      {
        ...contributionEvidence("comment-1"),
        integrity: { correlation, stepUpCleared: false },
      },
      new Date("2026-08-08T12:00:00.000Z")
    );

    await expect(
      completeStreakStepUpInTransaction(
        db as never,
        "user-1",
        correlation,
        new Date("2026-08-08T12:05:00.000Z")
      )
    ).resolves.toMatchObject({ completed: true, pendingXp: true });
    expect(
      integritySettlement.settleXpWithIntegrityInTransaction
    ).toHaveBeenCalledWith(
      db,
      expect.any(Object),
      expect.objectContaining({ disposition: "medium" }),
      expect.any(Date)
    );
  });

  it("does not consume Mixed receipts until retained evidence passes", async () => {
    const { receiptRows, tx } = createMixedDiscoveryDb();
    tx.query.xpRiskSignal.findMany.mockResolvedValue([
      { kind: "idempotency_conflict" },
    ]);
    const correlation = { deviceHash: "device-a", ipPrefixHash: null };
    const integrity = { correlation, stepUpCleared: false };
    const now = new Date("2026-08-08T12:00:00.000Z");

    await applyStreakEvidenceInTransaction(
      tx as never,
      { ...readingEvidence(1), integrity },
      now
    );
    await applyStreakEvidenceInTransaction(
      tx as never,
      { ...discoveryEvidence("bookmark", "post:1"), integrity },
      now
    );
    await expect(
      applyStreakEvidenceInTransaction(
        tx as never,
        { ...discoveryEvidence("follow", "comic:2"), integrity },
        now
      )
    ).resolves.toMatchObject({ stepUpRequired: true });
    expect(receiptRows).toHaveLength(0);

    await completeStreakStepUpInTransaction(
      tx as never,
      "user-1",
      correlation,
      new Date("2026-08-08T12:05:00.000Z")
    );
    expect(receiptRows).toHaveLength(2);
  });

  it.each([
    ["source_cap_pressure", "medium"],
    ["account_correlation", "high"],
  ])("completes %s risk as Pending XP", async (kind, disposition) => {
    const db = createStreakDb({
      challengeSelectedAt: new Date("2026-08-01T12:00:00.000Z"),
      challengeTarget: 10,
      currentStreak: 9,
      lastCompletedDayKey: "user-1:1:2026-08-07",
      lastCompletedLocalDate: "2026-08-07",
    });
    db.query.xpRiskSignal.findMany.mockResolvedValue([{ kind }]);

    await expect(
      applyStreakEvidenceInTransaction(
        db as never,
        {
          ...contributionEvidence("comment-10"),
          integrity: {
            correlation: {
              deviceHash: "device-a",
              ipPrefixHash: null,
            },
            stepUpCleared: true,
          },
        },
        new Date("2026-08-08T12:00:00.000Z")
      )
    ).resolves.toMatchObject({
      challenge: { outcome: "pending", target: 10 },
      pendingXp: true,
    });
    expect(
      integritySettlement.settleXpWithIntegrityInTransaction
    ).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ kind: "streak_day" }),
      expect.objectContaining({ disposition, recordSignals: [] }),
      expect.any(Date)
    );
    expect(progression.createPendingXpEventInTransaction).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ integrityCaseId: "case-1" }),
      expect.any(Date)
    );
  });
});

function contributionEvidence(id: string) {
  return {
    impersonated: false,
    kind: "contribution" as const,
    source: { id, kind: "comment" as const },
    text: "x".repeat(40),
    userId: "user-1",
  };
}

function readingEvidence(page: number) {
  return {
    comicId: "comic-1",
    impersonated: false,
    kind: "reading" as const,
    page,
    userId: "user-1",
  };
}

function reviewEvidence(id: string) {
  return {
    impersonated: false,
    kind: "contribution" as const,
    source: { id, kind: "review" as const },
    text: "x".repeat(100),
    userId: "user-1",
  };
}

function discoveryEvidence(
  actionKind: "bookmark" | "follow" | "rating",
  contentKey: string
) {
  return {
    actionKind,
    contentKey,
    impersonated: false,
    kind: "discovery" as const,
    userId: "user-1",
  };
}

function createMixedDiscoveryDb(consumed: ({ dayKey: string } | null)[] = []) {
  let stored = {
    bestStreak: 0,
    currentEvidence: {},
    currentEvidenceDayKey: null as string | null,
    currentStreak: 0,
    lastCompletedDayKey: null as string | null,
    lastCompletedLocalDate: null as string | null,
    pendingTimezone: null,
    timezone: "UTC",
    timezoneChangeAvailableAt: null,
    timezoneChangeEffectiveAt: null,
    timezoneVersion: 1,
    userId: "user-1",
  };
  const receiptRows: unknown[] = [];
  const tx = {
    insert: vi.fn(() => ({
      values: vi.fn((values: unknown) => {
        if (Array.isArray(values)) {
          receiptRows.push(...values);
          return Promise.resolve();
        }
        return {
          onConflictDoNothing: vi.fn().mockResolvedValue(null),
        };
      }),
    })),
    query: {
      eterisWallet: { findFirst: vi.fn().mockResolvedValue(null) },
      streakDiscoveryReceipt: {
        findFirst: vi.fn(() => Promise.resolve(consumed.shift() ?? null)),
      },
      streakProtectionWindow: { findMany: vi.fn().mockResolvedValue([]) },
      user: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ banned: false, emailVerified: true }),
      },
      userStreak: { findFirst: vi.fn(() => Promise.resolve(stored)) },
      xpEvent: { findFirst: vi.fn().mockResolvedValue(null) },
      xpRiskSignal: { findMany: vi.fn().mockResolvedValue([]) },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          for: vi.fn(() => Promise.resolve([stored])),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values) => ({
        where: vi.fn(() => {
          stored = { ...stored, ...values };
        }),
      })),
    })),
  };
  return { receiptRows, tx };
}

function createStreakDb(
  overrides: Record<string, unknown>,
  windows: { endsAt: Date; startsAt: Date }[] = []
) {
  let stored = {
    bestStreak: 0,
    currentEvidence: {},
    currentEvidenceDayKey: null,
    currentStreak: 0,
    lastCompletedDayKey: null,
    lastCompletedLocalDate: null,
    pendingTimezone: null,
    timezone: "UTC",
    timezoneChangeAvailableAt: null,
    timezoneChangeEffectiveAt: null,
    timezoneVersion: 1,
    updatedAt: new Date(0),
    userId: "user-1",
    ...overrides,
  };
  return {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn().mockResolvedValue(null),
      })),
    })),
    query: {
      eterisWallet: { findFirst: vi.fn().mockResolvedValue(null) },
      streakProtectionWindow: { findMany: vi.fn().mockResolvedValue(windows) },
      user: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ banned: false, emailVerified: true }),
      },
      userStreak: { findFirst: vi.fn(() => Promise.resolve(stored)) },
      xpRiskSignal: { findMany: vi.fn().mockResolvedValue([]) },
      xpEvent: { findFirst: vi.fn().mockResolvedValue(null) },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          for: vi.fn(() => Promise.resolve([stored])),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values) => ({
        where: vi.fn(() => {
          stored = { ...stored, ...values };
        }),
      })),
    })),
  };
}
