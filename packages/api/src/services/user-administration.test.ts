import { session, user } from "@repo/db/schema/app";

import { banUserAndReconcileRewards } from "./user-administration";

const rewards = vi.hoisted(() => ({
  notify: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock("./contribution-rewards", () => ({
  notifyBannedLikerRewardSettlements: rewards.notify,
  reconcileBannedLikerRewardsInTransaction: rewards.reconcile,
}));

function createDatabase() {
  const forUpdate = vi.fn().mockResolvedValue([{ id: "liker-1" }]);
  const selectWhere = vi.fn().mockReturnValue({ for: forUpdate });
  const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
  const updateWhere = vi.fn().mockResolvedValue();
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
  const deleteWhere = vi.fn().mockResolvedValue();
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
  rewards.notify.mockResolvedValue();
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
