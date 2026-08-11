import { verifyTurnstileToken } from "@repo/auth";
import {
  streakProtectionKindEnum,
  streakProtectionWindow,
} from "@repo/db/schema/app";
import { ianaTimezoneSchema } from "@repo/shared/schemas";
import { streakChallengeTargetSchema } from "@repo/shared/streak";
import { z } from "zod";

import {
  fixedWindowRatelimitMiddleware,
  ownerProcedure,
  protectedProcedure,
} from "../index";
import {
  completeStreakStepUpInTransaction,
  getStreakState,
  isStreakAvailable,
  selectStreakChallengeInTransaction,
  setStreakTimezoneInTransaction,
  StreakError,
} from "../services/streak";
import { buildIntegrityCorrelationEvidence } from "../utils/integrity-evidence";

const protectionWindowSchema = z
  .object({
    endsAt: z.iso.datetime(),
    kind: z.enum(streakProtectionKindEnum.enumValues),
    reason: z.string().trim().min(10).max(500),
    startsAt: z.iso.datetime(),
  })
  .refine(({ endsAt, startsAt }) => Date.parse(endsAt) > Date.parse(startsAt), {
    message: "El fin debe ser posterior al inicio.",
    path: ["endsAt"],
  });

const streakErrorMessages = {
  CHALLENGE_ALREADY_SELECTED: "Ya elegiste un desaf\u00EDo de Racha.",
  CHALLENGE_NOT_AVAILABLE:
    "Completa el primer d\u00EDa de una nueva Racha antes de elegir.",
  CHALLENGE_TARGET_REACHED: "Elige un objetivo mayor que tu Racha actual.",
  INVALID_CHALLENGE_TARGET: "El objetivo de Racha no es v\u00E1lido.",
  INVALID_TIMEZONE: "La zona horaria no es v\u00E1lida.",
  TIMEZONE_CHANGE_PENDING: "Ya hay un cambio de zona horaria pendiente.",
  TIMEZONE_COOLDOWN:
    "Podr\u00E1s volver a cambiar tu zona horaria cuando termine el plazo de 30 d\u00EDas.",
} as const;

export default {
  completeStepUp: protectedProcedure
    .use(fixedWindowRatelimitMiddleware({ limit: 5, windowSeconds: 5 * 60 }))
    .input(z.object({ token: z.string().trim().min(1).max(4096) }))
    .handler(async ({ context: { db, headers, session }, errors, input }) => {
      const remoteIp = headers.get("cf-connecting-ip")?.trim() || undefined;
      const verification = await verifyTurnstileToken(input.token, {
        action: "streak_step_up",
        remoteIp,
      });
      if (verification === "fail") {
        throw errors.BAD_REQUEST({
          message:
            "No pudimos verificar el desaf\u00EDo. Int\u00E9ntalo nuevamente.",
        });
      }
      if (verification === "error") {
        throw errors.INTERNAL_SERVER_ERROR({
          message:
            "La verificación está temporalmente indisponible. Tu progreso sigue guardado.",
        });
      }

      const correlation = buildIntegrityCorrelationEvidence(headers);
      try {
        return await db.transaction((tx) =>
          completeStreakStepUpInTransaction(
            tx,
            session.user.id,
            correlation,
            new Date()
          )
        );
      } catch {
        throw errors.INTERNAL_SERVER_ERROR({
          message:
            "La verificaci\u00F3n est\u00E1 temporalmente indisponible. Tu progreso sigue guardado.",
        });
      }
    }),

  declareProtectionWindow: ownerProcedure
    .input(protectionWindowSchema)
    .handler(async ({ context: { db, session }, input }) => {
      if (!(await isStreakAvailable(db))) {
        return { available: false } as const;
      }
      const [window] = await db
        .insert(streakProtectionWindow)
        .values({
          createdBy: session.user.id,
          endsAt: new Date(input.endsAt),
          kind: input.kind,
          reason: input.reason,
          startsAt: new Date(input.startsAt),
        })
        .returning({ id: streakProtectionWindow.id });
      if (!window) {
        throw new Error("No se pudo declarar el intervalo protegido.");
      }
      return window;
    }),

  getMine: protectedProcedure.handler(({ context: { db, session } }) =>
    getStreakState(db, session.user.id, new Date())
  ),

  selectChallenge: protectedProcedure
    .input(z.object({ target: streakChallengeTargetSchema }))
    .handler(async ({ context: { db, session }, errors, input }) => {
      try {
        return await db.transaction((tx) =>
          selectStreakChallengeInTransaction(
            tx,
            session.user.id,
            input.target,
            new Date()
          )
        );
      } catch (error) {
        if (error instanceof StreakError) {
          throw errors.BAD_REQUEST({
            message: streakErrorMessages[error.code],
          });
        }
        throw error;
      }
    }),

  setTimezone: protectedProcedure
    .input(z.object({ timezone: ianaTimezoneSchema }))
    .handler(async ({ context: { db, session }, errors, input }) => {
      const now = new Date();
      try {
        return await db.transaction((tx) =>
          setStreakTimezoneInTransaction(
            tx,
            session.user.id,
            input.timezone,
            now
          )
        );
      } catch (error) {
        if (error instanceof StreakError) {
          throw errors.BAD_REQUEST({
            message: streakErrorMessages[error.code],
          });
        }
        throw error;
      }
    }),
};
