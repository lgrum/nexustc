import {
  blackMarketAdminCancellationInputSchema,
  blackMarketListingActionInputSchema,
  blackMarketListingPublishInputSchema,
  blackMarketListingSearchInputSchema,
  blackMarketPurchaseInputSchema,
  blackMarketSaleHistoryInputSchema,
} from "@repo/shared/collectibles";
import z from "zod";

import {
  collectiblesMutationMiddleware,
  permissionProcedure,
  protectedProcedure,
  publicProcedure,
  slidingWindowRatelimitMiddleware,
} from "../index";
import {
  administrativelyCancelBlackMarketListing,
  BlackMarketError,
  cancelBlackMarketListing,
  correctBlackMarketListingFeeReversal,
  getBlackMarketListingDetail,
  getBlackMarketSaleHistory,
  listEligibleBlackMarketAssets,
  publishBlackMarketListing,
  purchaseBlackMarketListing,
  retryBlackMarketListingNotification,
  searchBlackMarketListings,
} from "../services/black-market";
import { CollectibleAdminActionError } from "../services/collectible-admin-action";
import { EterisError } from "../services/eteris";
import { translateDomainError } from "../utils/domain-errors";
import type { ProcedureErrors } from "../utils/domain-errors";

const read = publicProcedure.use(slidingWindowRatelimitMiddleware(60, 60));
const mutation = protectedProcedure
  .use(collectiblesMutationMiddleware)
  .use(slidingWindowRatelimitMiddleware(5, 60));
const moderation = permissionProcedure({ marketplace: ["moderate"] })
  .use(collectiblesMutationMiddleware)
  .use(slidingWindowRatelimitMiddleware(20, 60));
const adminCancellationInput = blackMarketAdminCancellationInputSchema.and(
  z.object({ expectedVersion: z.number().int().positive() }).strict()
);

function translateBlackMarketError(
  error: unknown,
  errors: ProcedureErrors
): never {
  // Ledger postings and the admin-audit append throw their own typed errors;
  // both must surface declared domain codes instead of undeclared 500s.
  if (error instanceof EterisError) {
    if (error.code === "IDEMPOTENCY_CONFLICT") {
      throw errors.CONFLICT({
        message: "La clave de compra ya fue usada para otra operación.",
      });
    }
    throw errors.BAD_REQUEST({
      message:
        error.code === "INSUFFICIENT_FUNDS"
          ? "No tienes Eteris suficientes para esta compra."
          : "Tu billetera no permite completar esta operación.",
    });
  }
  if (
    error instanceof CollectibleAdminActionError &&
    error.code === "IDEMPOTENCY_CONFLICT"
  ) {
    throw errors.CONFLICT({
      message: "La clave administrativa ya fue usada con datos diferentes.",
    });
  }
  return translateDomainError(error, errors, {
    badRequestIncludesCode: true,
    errorClass: BlackMarketError,
    forbiddenCodes: ["PERMISSION_DENIED"],
    notFoundCodes: ["LISTING_NOT_FOUND"],
  });
}

const search = read
  .input(blackMarketListingSearchInputSchema)
  .handler(({ context: { db }, input }) =>
    searchBlackMarketListings(db, input)
  );

const detail = read
  .input(blackMarketListingActionInputSchema.pick({ listingId: true }))
  .handler(({ context: { db }, input }) =>
    getBlackMarketListingDetail(db, input.listingId)
  );

const history = read
  .input(blackMarketSaleHistoryInputSchema)
  .handler(({ context: { db }, input }) =>
    getBlackMarketSaleHistory(db, input)
  );

const eligible = protectedProcedure
  .use(slidingWindowRatelimitMiddleware(30, 60))
  .handler(({ context: { db, session } }) =>
    listEligibleBlackMarketAssets(db, session.user.id)
  );

const publish = mutation
  .input(blackMarketListingPublishInputSchema)
  .handler(async ({ context: { db, session }, errors, input }) => {
    try {
      return await publishBlackMarketListing(db, session.user.id, input);
    } catch (error) {
      translateBlackMarketError(error, errors);
    }
  });

const purchase = mutation
  .input(blackMarketPurchaseInputSchema)
  .handler(async ({ context: { db, session }, errors, input }) => {
    try {
      return await purchaseBlackMarketListing(db, session.user.id, input);
    } catch (error) {
      translateBlackMarketError(error, errors);
    }
  });

const cancel = mutation
  .input(blackMarketListingActionInputSchema)
  .handler(async ({ context: { db, session }, errors, input }) => {
    try {
      return await cancelBlackMarketListing(db, session.user.id, input);
    } catch (error) {
      translateBlackMarketError(error, errors);
    }
  });

const adminCancel = moderation
  .input(adminCancellationInput)
  .handler(async ({ context: { db, session }, errors, input }) => {
    try {
      return await administrativelyCancelBlackMarketListing(
        db,
        session.user.id,
        input
      );
    } catch (error) {
      translateBlackMarketError(error, errors);
    }
  });

const correct = moderation
  .input(adminCancellationInput)
  .handler(async ({ context: { db, session }, errors, input }) => {
    try {
      return await correctBlackMarketListingFeeReversal(
        db,
        session.user.id,
        input
      );
    } catch (error) {
      translateBlackMarketError(error, errors);
    }
  });

const retryNotification = mutation
  .input(z.object({ listingId: z.string().trim().min(1).max(200) }).strict())
  .handler(async ({ context: { db, session }, errors, input }) => {
    try {
      return await retryBlackMarketListingNotification(
        db,
        session.user.id,
        input.listingId
      );
    } catch (error) {
      translateBlackMarketError(error, errors);
    }
  });

export default {
  adminCancel,
  cancel,
  correct,
  detail,
  eligible,
  history,
  publish,
  purchase,
  retryNotification,
  search,
};
