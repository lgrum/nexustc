import { eq } from "@repo/db";
import { patron, user } from "@repo/db/schema/app";
import {
  APP_THEME_REQUIRED_TIER,
  resolveAppTheme,
} from "@repo/shared/app-theme";
import type { PatronTier } from "@repo/shared/constants";
import type { Role } from "@repo/shared/permissions";

import type { Context } from "../context";

export async function resolveUserAppTheme(
  db: Context["db"],
  userId: string,
  role: Role
) {
  const [account, membership] = await Promise.all([
    db.query.user.findFirst({
      columns: { selectedTheme: true },
      where: eq(user.id, userId),
    }),
    db.query.patron.findFirst({
      columns: { isActivePatron: true, tier: true },
      where: eq(patron.userId, userId),
    }),
  ]);

  return resolveAppTheme({
    requiredTier: APP_THEME_REQUIRED_TIER,
    role,
    selectedTheme: account?.selectedTheme,
    tier: membership?.isActivePatron ? (membership.tier as PatronTier) : "none",
  });
}
