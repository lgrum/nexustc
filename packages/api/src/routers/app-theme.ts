import { eq } from "@repo/db";
import { user } from "@repo/db/schema/app";
import { APP_THEME_CATALOG, appThemeIdSchema } from "@repo/shared/app-theme";
import type { Role } from "@repo/shared/permissions";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { resolveUserAppTheme } from "../services/app-theme";

export default {
  getMine: protectedProcedure.handler(({ context: { db, session } }) =>
    resolveUserAppTheme(db, session.user.id, session.user.role as Role)
  ),

  select: protectedProcedure
    .input(z.object({ themeId: appThemeIdSchema }))
    .handler(async ({ context: { db, session }, errors, input }) => {
      const role = session.user.role as Role;
      const current = await resolveUserAppTheme(db, session.user.id, role);
      const requested = APP_THEME_CATALOG.find(
        ({ id }) => id === input.themeId
      );

      if (requested?.premium && !current.premiumEligible) {
        throw errors.FORBIDDEN({ message: "No puedes usar este tema." });
      }

      await db
        .update(user)
        .set({ selectedTheme: input.themeId })
        .where(eq(user.id, session.user.id));

      return resolveUserAppTheme(db, session.user.id, role);
    }),
};
