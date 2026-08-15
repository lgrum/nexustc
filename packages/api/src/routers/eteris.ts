import { getLogger } from "@orpc/experimental-pino";
import { eterisAmountSchema } from "@repo/shared/eteris";
import { z } from "zod";

import {
  fixedWindowRatelimitMiddleware,
  ownerProcedure,
  permissionProcedure,
  protectedProcedure,
  publicProcedure,
} from "../index";
import { getDailyEconomyReport } from "../services/economy-report";
import {
  adjustEteris,
  EterisError,
  getPublicWalletBalance,
  getUserWallet,
  inspectWallet,
  listEterisHistory,
  reconcileWallet,
  setPublicWalletBalance,
} from "../services/eteris";
import { grantMonthlyPatreonStipend } from "../services/patreon-stipend";

const historyInputSchema = z.object({
  cursor: z.object({ sequence: z.string().regex(/^\d+$/) }).optional(),
  limit: z.number().int().min(1).max(50).default(20),
});
const userInputSchema = z.object({ userId: z.string().min(1) });
const reconciliationInputSchema = z.union([
  z.object({ repair: z.boolean().default(false), userId: z.string().min(1) }),
  z.object({ repair: z.boolean().default(false), walletId: z.string().min(1) }),
]);

type RouterErrors = Parameters<
  Parameters<typeof protectedProcedure.handler>[0]
>[0]["errors"];

function rethrowEterisError(error: unknown, errors: RouterErrors): never {
  if (!(error instanceof EterisError)) {
    throw error;
  }
  switch (error.code) {
    case "ACCRUAL_DISABLED":
    case "SPENDING_DISABLED":
    case "VISIBILITY_DISABLED": {
      throw errors.FORBIDDEN({
        message: "La Billetera no est\u00E1 disponible.",
      });
    }
    case "WALLET_NOT_FOUND": {
      throw errors.NOT_FOUND({ message: "Billetera no encontrada." });
    }
    case "CLOSED_OR_FROZEN": {
      throw errors.BAD_REQUEST({
        message: "La Billetera no est\u00E1 activa.",
      });
    }
    case "IDEMPOTENCY_CONFLICT": {
      throw errors.BAD_REQUEST({
        message: "La solicitud ya fue procesada con datos diferentes.",
      });
    }
    case "INSUFFICIENT_FUNDS": {
      throw errors.BAD_REQUEST({ message: "Saldo insuficiente." });
    }
    case "INVALID_POSTINGS": {
      throw errors.BAD_REQUEST({
        message: "El movimiento de Eteris no es v\u00E1lido.",
      });
    }
    case "PROJECTION_MISMATCH": {
      throw errors.BAD_REQUEST({
        message:
          "La Billetera est\u00E1 bloqueada temporalmente para revisi\u00F3n.",
      });
    }
    default: {
      throw errors.BAD_REQUEST({
        message: "No se pudo procesar la operaci\u00F3n de Eteris.",
      });
    }
  }
}

export default {
  getMine: protectedProcedure
    .use(fixedWindowRatelimitMiddleware({ limit: 30, windowSeconds: 60 }))
    .handler(async ({ context: { db, session, ...context }, errors }) => {
      try {
        const wallet = await getUserWallet(db, session.user.id);
        if (wallet.status !== "active") {
          return {
            ...wallet,
            profileUserId: session.user.id,
            publicProfileChanged: false,
          };
        }
        try {
          const stipend = await grantMonthlyPatreonStipend(db, session.user.id);
          return {
            ...(stipend.granted === "0"
              ? wallet
              : await getUserWallet(db, session.user.id)),
            profileUserId: session.user.id,
            publicProfileChanged:
              stipend.granted !== "0" && wallet.publicBalance,
          };
        } catch (error) {
          getLogger(context)?.warn(
            { err: error },
            "Monthly Patreon stipend settlement did not block wallet read"
          );
          const refreshedWallet = await getUserWallet(db, session.user.id);
          return {
            ...refreshedWallet,
            profileUserId: session.user.id,
            publicProfileChanged:
              wallet.publicBalance &&
              (refreshedWallet.balance !== wallet.balance ||
                refreshedWallet.status !== wallet.status),
          };
        }
      } catch (error) {
        rethrowEterisError(error, errors);
      }
    }),

  getPublicBalance: publicProcedure
    .input(userInputSchema)
    .handler(({ context: { db }, input }) =>
      getPublicWalletBalance(db, input.userId)
    ),

  history: protectedProcedure
    .use(fixedWindowRatelimitMiddleware({ limit: 60, windowSeconds: 60 }))
    .input(historyInputSchema)
    .handler(async ({ context: { db, session }, errors, input }) => {
      try {
        return await listEterisHistory(db, {
          cursor: input.cursor
            ? { sequence: BigInt(input.cursor.sequence) }
            : undefined,
          limit: input.limit,
          userId: session.user.id,
        });
      } catch (error) {
        rethrowEterisError(error, errors);
      }
    }),

  setPublicBalance: protectedProcedure
    .use(fixedWindowRatelimitMiddleware({ limit: 10, windowSeconds: 60 }))
    .input(z.object({ publicBalance: z.boolean() }))
    .handler(async ({ context: { db, session }, errors, input }) => {
      try {
        return await setPublicWalletBalance(
          db,
          session.user.id,
          input.publicBalance
        );
      } catch (error) {
        rethrowEterisError(error, errors);
      }
    }),

  admin: {
    report: permissionProcedure({ economy: ["view"] })
      .use(fixedWindowRatelimitMiddleware({ limit: 30, windowSeconds: 60 }))
      .handler(({ context: { db } }) => getDailyEconomyReport(db)),

    inspectWallet: permissionProcedure({ economy: ["view"] })
      .use(fixedWindowRatelimitMiddleware({ limit: 60, windowSeconds: 60 }))
      .input(historyInputSchema.extend({ userId: z.string().min(1) }))
      .handler(async ({ context: { db }, errors, input }) => {
        try {
          const [wallet, history] = await Promise.all([
            inspectWallet(db, input.userId),
            listEterisHistory(db, {
              authorizedStaff: true,
              cursor: input.cursor
                ? { sequence: BigInt(input.cursor.sequence) }
                : undefined,
              limit: input.limit,
              userId: input.userId,
            }),
          ]);
          return { ...wallet, history };
        } catch (error) {
          rethrowEterisError(error, errors);
        }
      }),
  },

  owner: {
    adjust: ownerProcedure
      .use(fixedWindowRatelimitMiddleware({ limit: 10, windowSeconds: 60 }))
      .input(
        z.object({
          amount: eterisAmountSchema,
          idempotencyKey: z.string().trim().min(10).max(200),
          reason: z.string().trim().min(10).max(500),
          userId: z.string().min(1),
        })
      )
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await adjustEteris(db, {
            ...input,
            actorUserId: session.user.id,
          });
        } catch (error) {
          rethrowEterisError(error, errors);
        }
      }),

    reconcileWallet: ownerProcedure
      .use(fixedWindowRatelimitMiddleware({ limit: 10, windowSeconds: 60 }))
      .input(reconciliationInputSchema)
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await reconcileWallet(
            db,
            "walletId" in input
              ? { walletId: input.walletId }
              : { userId: input.userId },
            input.repair,
            session.user.id
          );
        } catch (error) {
          rethrowEterisError(error, errors);
        }
      }),
  },
};
