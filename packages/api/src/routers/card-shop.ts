import { officialCardShopPurchaseInputSchema } from "@repo/shared/collectibles";
import z from "zod";

import {
  collectiblesMutationMiddleware,
  permissionProcedure,
  protectedProcedure,
  publicProcedure,
  slidingWindowRatelimitMiddleware,
} from "../index";
import { EterisError } from "../services/eteris";
import {
  getOfficialCardShopOfferImpact,
  getOfficialCardShopPurchase,
  listActiveOfficialCardShopOffers,
  listOfficialCardShopOffersForAdmin,
  OfficialCardShopError,
  purchaseOfficialCardShopOffer,
  retryOfficialCardShopPurchaseNotification,
  listOwnOfficialCardShopPurchases,
} from "../services/official-card-shop";
import { translateDomainError } from "../utils/domain-errors";
import type { ProcedureErrors } from "../utils/domain-errors";

const publicRead = publicProcedure.use(
  slidingWindowRatelimitMiddleware(60, 60)
);
const privateRead = protectedProcedure.use(
  slidingWindowRatelimitMiddleware(30, 60)
);
const mutation = protectedProcedure
  .use(collectiblesMutationMiddleware)
  .use(slidingWindowRatelimitMiddleware(5, 60));

function translatePurchaseError(
  error: unknown,
  errors: ProcedureErrors
): never {
  if (error instanceof EterisError) {
    if (error.code === "IDEMPOTENCY_CONFLICT") {
      throw errors.PROFILE_CUSTOMIZATION_CONFLICT({
        message: "La clave de compra ya fue usada para otra operación.",
      });
    }
    throw errors.BAD_REQUEST({
      message:
        error.code === "INSUFFICIENT_FUNDS"
          ? "No tienes Eteris suficientes para esta compra."
          : "Tu billetera no permite completar esta compra.",
    });
  }
  return translateDomainError(error, errors, {
    conflictCodes: ["STALE_PRICE", "STALE_VERSION", "IDEMPOTENCY_CONFLICT"],
    errorClass: OfficialCardShopError,
  });
}

const offerIdInput = z
  .object({ offerId: z.string().trim().min(1).max(200) })
  .strict();

export default {
  detail: publicRead
    .input(offerIdInput)
    .handler(async ({ context: { db }, input }) => {
      const offers = await listActiveOfficialCardShopOffers(db);
      return offers.find(({ id }) => id === input.offerId) ?? null;
    }),
  history: privateRead
    .input(
      z
        .object({ limit: z.number().int().min(1).max(100).default(50) })
        .optional()
    )
    .handler(({ context: { db, session }, input }) =>
      listOwnOfficialCardShopPurchases(db, session.user.id, input?.limit)
    ),
  impact: permissionProcedure({ cardShop: ["view"] })
    .use(slidingWindowRatelimitMiddleware(30, 60))
    .input(offerIdInput)
    .handler(({ context: { db }, input }) =>
      getOfficialCardShopOfferImpact(db, input.offerId)
    ),
  list: publicRead.handler(({ context: { db } }) =>
    listActiveOfficialCardShopOffers(db)
  ),
  offers: {
    list: publicRead.handler(({ context: { db } }) =>
      listActiveOfficialCardShopOffers(db)
    ),
  },
  purchase: mutation
    .input(officialCardShopPurchaseInputSchema)
    .handler(async ({ context: { db, session }, errors, input }) => {
      try {
        return await purchaseOfficialCardShopOffer(db, {
          ...input,
          impersonated: Boolean(session.session?.impersonatedBy),
          userId: session.user.id,
        });
      } catch (error) {
        translatePurchaseError(error, errors);
      }
    }),
  purchaseById: privateRead
    .input(z.object({ purchaseId: z.string().trim().min(1).max(200) }).strict())
    .handler(({ context: { db, session }, input }) =>
      getOfficialCardShopPurchase(db, {
        purchaseId: input.purchaseId,
        userId: session.user.id,
      })
    ),
  retryNotification: permissionProcedure({ cardShop: ["manage"] })
    .use(collectiblesMutationMiddleware)
    .use(slidingWindowRatelimitMiddleware(10, 60))
    .input(z.object({ purchaseId: z.string().trim().min(1).max(200) }).strict())
    .handler(async ({ context: { db }, errors, input }) => {
      try {
        return await retryOfficialCardShopPurchaseNotification(
          db,
          input.purchaseId
        );
      } catch (error) {
        translatePurchaseError(error, errors);
      }
    }),
  purchaseByIdempotencyKey: privateRead
    .input(
      z.object({ idempotencyKey: z.string().trim().min(10).max(200) }).strict()
    )
    .handler(({ context: { db, session }, input }) =>
      getOfficialCardShopPurchase(db, {
        idempotencyKey: input.idempotencyKey,
        userId: session.user.id,
      })
    ),
  adminPreview: permissionProcedure({ cardShop: ["view"] })
    .use(slidingWindowRatelimitMiddleware(30, 60))
    .input(
      z
        .object({ limit: z.number().int().min(1).max(100).default(100) })
        .optional()
    )
    .handler(({ context: { db }, input }) =>
      listOfficialCardShopOffersForAdmin(db, input?.limit)
    ),
};
