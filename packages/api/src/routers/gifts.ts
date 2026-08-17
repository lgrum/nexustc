import {
  giftOfferActionInputSchema,
  giftOfferListInputSchema,
  giftOfferSendInputSchema,
} from "@repo/shared/collectibles";

import {
  collectiblesMutationMiddleware,
  protectedProcedure,
  slidingWindowRatelimitMiddleware,
} from "../index";
import {
  acceptGiftOffer,
  cancelGiftOffer,
  GiftOfferError,
  getGiftOffer,
  listEligibleGiftAssets,
  listGiftOffers,
  rejectGiftOffer,
  sendGiftOffer,
} from "../services/gift-offer";

const read = protectedProcedure.use(slidingWindowRatelimitMiddleware(60, 60));
const mutation = protectedProcedure
  .use(collectiblesMutationMiddleware)
  .use(slidingWindowRatelimitMiddleware(5, 60));
const acceptMutation = protectedProcedure
  .use(collectiblesMutationMiddleware)
  .use(slidingWindowRatelimitMiddleware(10, 60));

type ProcedureErrors = Parameters<
  Parameters<typeof mutation.handler>[0]
>[0]["errors"];

function translateGiftError(error: unknown, errors: ProcedureErrors): never {
  if (!(error instanceof GiftOfferError)) {
    throw error;
  }
  if (error.code === "OFFER_NOT_FOUND" || error.code === "ASSET_NOT_FOUND") {
    throw errors.NOT_FOUND({ message: error.message });
  }
  if (error.code === "PERMISSION_DENIED") {
    throw errors.FORBIDDEN({ message: error.message });
  }
  throw errors.BAD_REQUEST({ message: `${error.code}: ${error.message}` });
}

const list = read
  .input(giftOfferListInputSchema)
  .handler(({ context: { db, session }, input }) =>
    listGiftOffers(db, session.user.id, input)
  );

const inbox = read
  .input(giftOfferListInputSchema)
  .handler(({ context: { db, session }, input }) =>
    listGiftOffers(
      db,
      session.user.id,
      { ...input, state: input.state ?? "sent" },
      "inbox"
    )
  );

const sent = read
  .input(giftOfferListInputSchema)
  .handler(({ context: { db, session }, input }) =>
    listGiftOffers(
      db,
      session.user.id,
      { ...input, state: input.state ?? "sent" },
      "sent"
    )
  );

const detail = read
  .input(giftOfferActionInputSchema.pick({ giftId: true }))
  .handler(({ context: { db, session }, input }) =>
    getGiftOffer(db, session.user.id, input.giftId)
  );

const eligible = read.handler(({ context: { db, session } }) =>
  listEligibleGiftAssets(db, session.user.id)
);

const send = mutation
  .input(giftOfferSendInputSchema)
  .handler(async ({ context: { db, session }, errors, input }) => {
    try {
      return await sendGiftOffer(db, session.user.id, input);
    } catch (error) {
      translateGiftError(error, errors);
    }
  });

const accept = acceptMutation
  .input(giftOfferActionInputSchema)
  .handler(async ({ context: { db, session }, errors, input }) => {
    try {
      return await acceptGiftOffer(db, session.user.id, input);
    } catch (error) {
      translateGiftError(error, errors);
    }
  });

const reject = mutation
  .input(giftOfferActionInputSchema)
  .handler(async ({ context: { db, session }, errors, input }) => {
    try {
      return await rejectGiftOffer(db, session.user.id, input);
    } catch (error) {
      translateGiftError(error, errors);
    }
  });

const cancel = mutation
  .input(giftOfferActionInputSchema)
  .handler(async ({ context: { db, session }, errors, input }) => {
    try {
      return await cancelGiftOffer(db, session.user.id, input);
    } catch (error) {
      translateGiftError(error, errors);
    }
  });

export default {
  accept,
  cancel,
  detail,
  eligible,
  inbox,
  list,
  reject,
  send,
  sent,
};
