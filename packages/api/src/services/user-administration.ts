import { and, eq, lte } from "@repo/db";
import type { db as database } from "@repo/db";
import { session, user } from "@repo/db/schema/app";

import {
  lockLikerRewardParticipantsInTransaction,
  notifyBannedLikerRewardSettlementsInTransaction,
  reconcileBannedLikerRewardsInTransaction,
  reconcileRestoredLikerRewardsInTransaction,
} from "./contribution-rewards";

type Database = typeof database;

type UserAdministrationErrorCode = "SELF_BAN" | "USER_NOT_FOUND";

export class UserAdministrationError extends Error {
  readonly code: UserAdministrationErrorCode;

  constructor(code: UserAdministrationErrorCode) {
    super(code);
    this.name = "UserAdministrationError";
    this.code = code;
  }
}

export async function banUserAndReconcileRewards(
  db: Database,
  input: {
    actorUserId: string;
    banExpiresIn?: number;
    banReason?: string;
    now?: Date;
    userId: string;
  }
) {
  if (input.userId === input.actorUserId) {
    throw new UserAdministrationError("SELF_BAN");
  }
  const now = input.now ?? new Date();
  const results = await db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, input.userId))
      .for("update");
    if (!target) {
      throw new UserAdministrationError("USER_NOT_FOUND");
    }
    await tx
      .update(user)
      .set({
        banExpires: input.banExpiresIn
          ? new Date(now.getTime() + input.banExpiresIn * 1000)
          : null,
        banReason: input.banReason || "No reason",
        banned: true,
        updatedAt: now,
      })
      .where(eq(user.id, input.userId));
    await tx.delete(session).where(eq(session.userId, input.userId));
    const settlements = await reconcileBannedLikerRewardsInTransaction(tx, {
      actorUserId: input.actorUserId,
      likerUserId: input.userId,
      now,
    });
    await notifyBannedLikerRewardSettlementsInTransaction(tx, settlements);
    return settlements;
  });
  return results;
}

export async function restoreExpiredTemporaryBanRewards(
  db: Database,
  now = new Date()
) {
  const candidates = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.banned, true), lte(user.banExpires, now)))
    .limit(1000);
  const profileUserIds = new Set<string>();
  let restored = 0;
  for (const candidate of candidates) {
    const results = await db.transaction(async (tx) => {
      await lockLikerRewardParticipantsInTransaction(tx, candidate.id);
      const [current] = await tx
        .select({
          banExpires: user.banExpires,
          banned: user.banned,
          id: user.id,
        })
        .from(user)
        .where(eq(user.id, candidate.id))
        .for("update");
      if (!current?.banned || !current.banExpires || current.banExpires > now) {
        return null;
      }
      await tx
        .update(user)
        .set({
          banExpires: null,
          banReason: null,
          banned: false,
          updatedAt: now,
        })
        .where(eq(user.id, candidate.id));
      const settlements = await reconcileRestoredLikerRewardsInTransaction(tx, {
        likerUserId: candidate.id,
        now,
      });
      await notifyBannedLikerRewardSettlementsInTransaction(tx, settlements);
      return settlements;
    });
    if (!results) {
      continue;
    }
    restored += 1;
    profileUserIds.add(candidate.id);
    for (const result of results) {
      if (result.settlements.length > 0) {
        profileUserIds.add(result.userId);
      }
    }
  }
  return {
    checked: candidates.length,
    profileUserIds: [...profileUserIds],
    restored,
  };
}

export async function unbanUserAndReconcileRewards(
  db: Database,
  input: { now?: Date; userId: string }
) {
  const now = input.now ?? new Date();
  const results = await db.transaction(async (tx) => {
    await lockLikerRewardParticipantsInTransaction(tx, input.userId);
    const [target] = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, input.userId))
      .for("update");
    if (!target) {
      throw new UserAdministrationError("USER_NOT_FOUND");
    }
    await tx
      .update(user)
      .set({
        banExpires: null,
        banReason: null,
        banned: false,
        updatedAt: now,
      })
      .where(eq(user.id, input.userId));
    const settlements = await reconcileRestoredLikerRewardsInTransaction(tx, {
      likerUserId: input.userId,
      now,
    });
    await notifyBannedLikerRewardSettlementsInTransaction(tx, settlements);
    return settlements;
  });
  return results;
}
