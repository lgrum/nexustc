import { session, user } from "@repo/db/schema/app";

import {
  banUserAndReconcileRewards,
  restoreExpiredTemporaryBanRewards,
} from "./user-administration";

const rewards = vi.hoisted(() => ({
  notify: vi.fn(),
  reconcile: vi.fn(),
  restore: vi.fn(),
}));

vi.mock("./contribution-rewards", () => ({
  notifyBannedLikerRewardSettlements: rewards.notify,
  reconcileBannedLikerRewardsInTransaction: rewards.reconcile,
  reconcileRestoredLikerRewardsInTransaction: rewards.restore,
}));

function createDatabase() {
  const forUpdate = vi.fn().mockResolvedValue([{ id: "liker-1" }]);
  const selectWhere = vi.fn().mockReturnValue({ for: forUpdate });
  const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
  const updateWhere = vi.fn().mockImplementation(() => Promise.resolve());
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
  const deleteWhere = vi.fn().mockImplementation(() => Promise.resolve());
  const tx = {
    delete: vi.fn().mockReturnValue({ where: deleteWhere }),
    select: vi.fn().mockReturnValue({ from: selectFrom }),
    update: vi.fn().mockReturnValue({ set: updateSet }),
  };
  const db = {
    transaction: vi.fn((callback: (executor: typeof tx) => unknown) =>
      callback(tx)
    ),
  };
  return { db, deleteWhere, forUpdate, tx, updateSet, updateWhere };
}

beforeEach(() => {
  vi.clearAllMocks();
  rewards.reconcile.mockResolvedValue([]);
  rewards.restore.mockResolvedValue([]);
  rewards.notify.mockImplementation(() => Promise.resolve());
});

it("restores rewards when a temporary ban expires", async () => {
  const now = new Date("2026-08-10T02:00:00.000Z");
  const expiredAt = new Date("2026-08-10T01:00:00.000Z");
  const candidateQuery = {
    from: vi.fn(),
    limit: vi.fn().mockResolvedValue([{ id: "liker-1" }]),
    where: vi.fn(),
  };
  candidateQuery.from.mockReturnValue(candidateQuery);
  candidateQuery.where.mockReturnValue(candidateQuery);
  const lockedQuery = {
    for: vi
      .fn()
      .mockResolvedValue([
        { banExpires: expiredAt, banned: true, id: "liker-1" },
      ]),
    from: vi.fn(),
    where: vi.fn(),
  };
  lockedQuery.from.mockReturnValue(lockedQuery);
  lockedQuery.where.mockReturnValue(lockedQuery);
  const updateWhere = vi.fn().mockImplementation(() => Promise.resolve());
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
  const tx = {
    select: vi.fn().mockReturnValue(lockedQuery),
    update: vi.fn().mockReturnValue({ set: updateSet }),
  };
  const db = {
    select: vi.fn().mockReturnValue(candidateQuery),
    transaction: vi.fn((callback: (executor: typeof tx) => unknown) =>
      callback(tx)
    ),
  };
  rewards.restore.mockResolvedValueOnce([
    {
      settlements: [{ level: 2, previousLevel: 1 }],
      userId: "author-1",
    },
  ]);

  await expect(
    restoreExpiredTemporaryBanRewards(db as never, now)
  ).resolves.toEqual({
    checked: 1,
    profileUserIds: ["author-1"],
    restored: 1,
  });
  expect(updateSet).toHaveBeenCalledWith({
    banExpires: null,
    banned: false,
    updatedAt: now,
  });
  expect(rewards.restore).toHaveBeenCalledWith(tx, {
    likerUserId: "liker-1",
    now,
  });
  expect(rewards.notify).toHaveBeenCalledWith(db, expect.any(Array));
});

it("does not clear a temporary ban extended after the expiry scan", async () => {
  const now = new Date("2026-08-10T02:00:00.000Z");
  const candidateQuery = {
    from: vi.fn(),
    limit: vi.fn().mockResolvedValue([{ id: "liker-1" }]),
    where: vi.fn(),
  };
  candidateQuery.from.mockReturnValue(candidateQuery);
  candidateQuery.where.mockReturnValue(candidateQuery);
  const lockedQuery = {
    for: vi.fn().mockResolvedValue([
      {
        banExpires: new Date("2026-08-10T03:00:00.000Z"),
        banned: true,
        id: "liker-1",
      },
    ]),
    from: vi.fn(),
    where: vi.fn(),
  };
  lockedQuery.from.mockReturnValue(lockedQuery);
  lockedQuery.where.mockReturnValue(lockedQuery);
  const tx = { select: vi.fn().mockReturnValue(lockedQuery), update: vi.fn() };
  const db = {
    select: vi.fn().mockReturnValue(candidateQuery),
    transaction: vi.fn((callback: (executor: typeof tx) => unknown) =>
      callback(tx)
    ),
  };

  await expect(
    restoreExpiredTemporaryBanRewards(db as never, now)
  ).resolves.toEqual({ checked: 1, profileUserIds: [], restored: 0 });
  expect(tx.update).not.toHaveBeenCalled();
  expect(rewards.restore).not.toHaveBeenCalled();
});

it("bans, revokes sessions, and reconciles liker rewards in one transaction", async () => {
  const { db, tx, updateSet } = createDatabase();
  const now = new Date("2026-08-10T00:00:00.000Z");

  await banUserAndReconcileRewards(db as never, {
    actorUserId: "owner-1",
    banExpiresIn: 3600,
    banReason: "Abuso coordinado",
    now,
    userId: "liker-1",
  });

  expect(tx.update).toHaveBeenCalledWith(user);
  expect(updateSet).toHaveBeenCalledWith({
    banExpires: new Date("2026-08-10T01:00:00.000Z"),
    banReason: "Abuso coordinado",
    banned: true,
    updatedAt: now,
  });
  expect(tx.delete).toHaveBeenCalledWith(session);
  expect(rewards.reconcile).toHaveBeenCalledWith(tx, {
    actorUserId: "owner-1",
    likerUserId: "liker-1",
    now,
  });
  expect(rewards.notify).toHaveBeenCalledWith(db, []);
});

it("does not report success when reward reconciliation aborts the ban transaction", async () => {
  const { db, tx } = createDatabase();
  rewards.reconcile.mockRejectedValueOnce(new Error("XP_PROJECTION_MISMATCH"));

  await expect(
    banUserAndReconcileRewards(db as never, {
      actorUserId: "owner-1",
      now: new Date("2026-08-10T00:00:00.000Z"),
      userId: "liker-1",
    })
  ).rejects.toThrow("XP_PROJECTION_MISMATCH");

  expect(db.transaction).toHaveBeenCalledOnce();
  expect(rewards.reconcile).toHaveBeenCalledWith(tx, expect.anything());
  expect(rewards.notify).not.toHaveBeenCalled();
});
