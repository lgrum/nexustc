import { getLogger } from "@orpc/experimental-pino";
import { z } from "zod";

import {
  fixedWindowRatelimitMiddleware,
  ownerProcedure,
  permissionProcedure,
  protectedProcedure,
  publicProcedure,
} from "../index";
import {
  decideIntegrityCase,
  getIntegrityCase,
  listIntegrityCases,
  releaseMaturedPendingXp,
} from "../services/integrity";
import { grantMonthlyPatreonStipend } from "../services/patreon-stipend";
import {
  adjustXp,
  getPublicAccountLevel,
  getUserProgression,
  listUserXpHistory,
  ProgressionError,
} from "../services/progression";

const historyInputSchema = z.object({
  cursor: z
    .object({ createdAt: z.iso.datetime(), id: z.string().min(1) })
    .optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

const adjustXpInputSchema = z.object({
  amount: z.number().int().min(-365_000).max(365_000).refine(Boolean),
  idempotencyKey: z.string().trim().min(10).max(200),
  reason: z.string().trim().min(10).max(500),
  userId: z.string().min(1),
});

export default {
  getMine: protectedProcedure.handler(
    async ({ context: { db, session, ...context } }) => {
      let progression = await getUserProgression(db, session.user.id);
      const settlements = progression.accrualEnabled
        ? await releaseMaturedPendingXp(db, session.user.id)
        : [];
      if (settlements.length > 0) {
        progression = await getUserProgression(db, session.user.id);
      }
      let publicProfileChanged = settlements.some(
        (settlement) =>
          !settlement.replayed && settlement.level !== settlement.previousLevel
      );
      try {
        const stipend = await grantMonthlyPatreonStipend(db, session.user.id);
        publicProfileChanged ||=
          "publicProfileChanged" in stipend &&
          stipend.publicProfileChanged === true;
      } catch (error) {
        getLogger(context)?.warn(
          { err: error },
          "Monthly Patreon stipend settlement did not block progression read"
        );
      }
      return {
        ...progression,
        profileUserId: session.user.id,
        publicProfileChanged,
      };
    }
  ),

  getPublic: publicProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .handler(({ context: { db }, input }) =>
      getPublicAccountLevel(db, input.userId)
    ),

  history: protectedProcedure
    .input(historyInputSchema)
    .handler(async ({ context: { db, session }, errors, input }) => {
      try {
        return await listUserXpHistory(db, {
          cursor: input.cursor
            ? {
                createdAt: new Date(input.cursor.createdAt),
                id: input.cursor.id,
              }
            : undefined,
          limit: input.limit,
          userId: session.user.id,
        });
      } catch (error) {
        if (
          error instanceof ProgressionError &&
          error.code === "VISIBILITY_DISABLED"
        ) {
          throw errors.FORBIDDEN({
            message: "El sistema de Account XP está desactivado.",
          });
        }
        throw error;
      }
    }),

  admin: {
    inspectUser: permissionProcedure({ economy: ["view"] })
      .use(fixedWindowRatelimitMiddleware({ limit: 60, windowSeconds: 60 }))
      .input(historyInputSchema.extend({ userId: z.string().min(1) }))
      .handler(async ({ context: { db }, input }) => {
        const [progression, history] = await Promise.all([
          getUserProgression(db, input.userId),
          listUserXpHistory(db, {
            authorizedStaff: true,
            cursor: input.cursor
              ? {
                  createdAt: new Date(input.cursor.createdAt),
                  id: input.cursor.id,
                }
              : undefined,
            limit: input.limit,
            userId: input.userId,
          }),
        ]);
        return { ...progression, history };
      }),

    decideCase: permissionProcedure({ progressionIntegrity: ["decide"] })
      .use(fixedWindowRatelimitMiddleware({ limit: 20, windowSeconds: 60 }))
      .input(
        z.discriminatedUnion("action", [
          z.object({
            action: z.enum(["block", "dismiss", "release", "reverse"]),
            caseId: z.string().min(1),
            reason: z.string().trim().min(10).max(500),
          }),
          z.object({
            action: z.literal("disqualify_likes"),
            caseId: z.string().min(1),
            likerUserIds: z.array(z.string().min(1)).min(1).max(100),
            reason: z.string().trim().min(10).max(500),
            subjectId: z.string().min(1),
          }),
        ])
      )
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await decideIntegrityCase(db, {
            ...input,
            actorUserId: session.user.id,
          });
        } catch (error) {
          if (
            error instanceof Error &&
            [
              "INTEGRITY_CASE_NOT_FOUND",
              "INTEGRITY_CASE_HAS_NO_EVENT",
              "INTEGRITY_SCOPE_NOT_FOUND",
              "INTEGRITY_SUBJECT_MISMATCH",
              "REWARD_SUBJECT_NOT_FOUND",
            ].includes(error.message)
          ) {
            throw errors.BAD_REQUEST({
              message: "No se pudo aplicar esa decision al caso.",
            });
          }
          throw error;
        }
      }),

    getCase: permissionProcedure({ progressionIntegrity: ["view"] })
      .use(fixedWindowRatelimitMiddleware({ limit: 60, windowSeconds: 60 }))
      .input(z.object({ caseId: z.string().min(1) }))
      .handler(async ({ context: { db }, errors, input }) => {
        const integrityCase = await getIntegrityCase(db, input.caseId);
        if (!integrityCase) {
          throw errors.NOT_FOUND({ message: "Caso no encontrado." });
        }
        return integrityCase;
      }),

    listCases: permissionProcedure({ progressionIntegrity: ["view"] })
      .use(fixedWindowRatelimitMiddleware({ limit: 60, windowSeconds: 60 }))
      .input(
        z.object({
          cursor: z
            .object({ createdAt: z.iso.datetime(), id: z.string().min(1) })
            .optional(),
          limit: z.number().int().min(1).max(100).default(50),
          status: z
            .enum(["open", "released", "reversed", "dismissed"])
            .optional(),
        })
      )
      .handler(({ context: { db }, input }) =>
        listIntegrityCases(db, {
          ...input,
          cursor: input.cursor
            ? {
                createdAt: new Date(input.cursor.createdAt),
                id: input.cursor.id,
              }
            : undefined,
        })
      ),
  },

  owner: {
    adjustXp: ownerProcedure
      .use(fixedWindowRatelimitMiddleware({ limit: 10, windowSeconds: 60 }))
      .input(adjustXpInputSchema)
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await adjustXp(db, {
            ...input,
            actorUserId: session.user.id,
          });
        } catch (error) {
          if (!(error instanceof ProgressionError)) {
            throw error;
          }
          if (error.code === "ACCRUAL_DISABLED") {
            throw errors.FORBIDDEN({
              message: "La acumulación de Account XP está desactivada.",
            });
          }
          throw errors.BAD_REQUEST({ message: error.message });
        }
      }),
  },
};
