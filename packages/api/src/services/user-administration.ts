import { eq } from "@repo/db";
import type { db as database } from "@repo/db";
import { session, user } from "@repo/db/schema/app";

import {
  notifyBannedLikerRewardSettlements,
  reconcileBannedLikerRewardsInTransaction,
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
    return reconcileBannedLikerRewardsInTransaction(tx, {
      actorUserId: input.actorUserId,
      likerUserId: input.userId,
      now,
    });
  });
  await notifyBannedLikerRewardSettlements(db, results);
  return results;
}
