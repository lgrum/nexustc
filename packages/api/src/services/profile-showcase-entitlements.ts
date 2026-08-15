import { and, eq } from "@repo/db";
import type { db as database } from "@repo/db";
import {
  patron,
  profileCustomization,
  profileShowcaseConfig,
  profileShowcaseType,
  user,
} from "@repo/db/schema/app";
import type { ProfileShowcaseTypeKey } from "@repo/shared/profile-customization";

import { userIsNotActivelyBanned } from "../utils/user-ban";
import { satisfiesProfileVipRequirement } from "./profile-entitlements";

type Database = typeof database;
type ReadDatabase = Pick<Database, "query" | "select">;

export async function canRenderPublicProfileShowcase(
  db: ReadDatabase,
  userId: string,
  type: ProfileShowcaseTypeKey
) {
  const [root, row, requirement, account, membership] = await Promise.all([
    db.query.profileCustomization.findFirst({
      columns: { userId: true },
      where: eq(profileCustomization.userId, userId),
    }),
    db.query.profileShowcaseConfig.findFirst({
      columns: { enabled: true },
      where: and(
        eq(profileShowcaseConfig.userId, userId),
        eq(profileShowcaseConfig.typeKey, type)
      ),
    }),
    db.query.profileShowcaseType.findFirst({
      columns: { isActive: true, requiredTier: true },
      where: eq(profileShowcaseType.key, type),
    }),
    db.query.user.findFirst({
      columns: { role: true },
      where: and(eq(user.id, userId), userIsNotActivelyBanned()),
    }),
    db.query.patron.findFirst({
      columns: { isActivePatron: true, tier: true },
      where: eq(patron.userId, userId),
    }),
  ]);

  if (!account || (root && !row?.enabled) || requirement?.isActive === false) {
    return false;
  }

  return satisfiesProfileVipRequirement(requirement?.requiredTier ?? "none", {
    isActivePatron: membership?.isActivePatron ?? false,
    role: account.role,
    tier: membership?.tier ?? "none",
  });
}
