import {
  tradeOfferActionInputSchema,
  tradeOfferCounterInputSchema,
  tradeOfferListInputSchema,
  tradeOfferSendInputSchema,
} from "@repo/shared/collectibles";
import z from "zod";

import {
  collectiblesMutationMiddleware,
  protectedProcedure,
  slidingWindowRatelimitMiddleware,
} from "../index";
import { getResolvedProfileVisibility } from "../services/profile";
import {
  acceptTradeOffer,
  cancelTradeOffer,
  counterOfferTradeOffer,
  getTradeOffer,
  listEligibleTradeAssets,
  listTradeOffers,
  rejectTradeOffer,
  sendTradeOffer,
  TradeOfferError,
  blockTradeUser,
  listTradeUserBlocks,
  unblockTradeUser,
} from "../services/trade-offer";
import { translateDomainError } from "../utils/domain-errors";
import type { ProcedureErrors } from "../utils/domain-errors";

const read = protectedProcedure.use(slidingWindowRatelimitMiddleware(60, 60));
const mutation = protectedProcedure
  .use(collectiblesMutationMiddleware)
  .use(slidingWindowRatelimitMiddleware(5, 60));
const acceptMutation = protectedProcedure
  .use(collectiblesMutationMiddleware)
  .use(slidingWindowRatelimitMiddleware(10, 60));

function translateTradeError(error: unknown, errors: ProcedureErrors): never {
  return translateDomainError(error, errors, {
    badRequestIncludesCode: true,
    errorClass: TradeOfferError,
    forbiddenCodes: ["PERMISSION_DENIED"],
    notFoundCodes: ["OFFER_NOT_FOUND", "ASSET_NOT_FOUND"],
  });
}

const list = read
  .input(tradeOfferListInputSchema)
  .handler(({ context: { db, session }, input }) =>
    listTradeOffers(db, session.user.id, input)
  );

const inbox = read
  .input(tradeOfferListInputSchema)
  .handler(({ context: { db, session }, input }) =>
    listTradeOffers(
      db,
      session.user.id,
      { ...input, state: input.state ?? "sent" },
      "inbox"
    )
  );

const sent = read
  .input(tradeOfferListInputSchema)
  .handler(({ context: { db, session }, input }) =>
    listTradeOffers(
      db,
      session.user.id,
      { ...input, state: input.state ?? "sent" },
      "sent"
    )
  );

const detail = read
  .input(tradeOfferActionInputSchema.pick({ offerId: true }))
  .handler(({ context: { db, session }, input }) =>
    getTradeOffer(db, session.user.id, input.offerId)
  );

const eligible = read.handler(({ context: { db, session } }) =>
  listEligibleTradeAssets(db, session.user.id)
);

const eligibleForParticipant = read
  .input(z.object({ userId: z.string().trim().min(1).max(200) }).strict())
  .handler(async ({ context: { db }, input }) => {
    const visibility = await getResolvedProfileVisibility(db, input.userId);
    return visibility.publicCollection
      ? listEligibleTradeAssets(db, input.userId)
      : [];
  });

const send = mutation
  .input(tradeOfferSendInputSchema)
  .handler(async ({ context: { db, session }, errors, input }) => {
    try {
      return await sendTradeOffer(db, session.user.id, input);
    } catch (error) {
      translateTradeError(error, errors);
    }
  });

const accept = acceptMutation
  .input(tradeOfferActionInputSchema)
  .handler(async ({ context: { db, session }, errors, input }) => {
    try {
      return await acceptTradeOffer(db, session.user.id, input);
    } catch (error) {
      translateTradeError(error, errors);
    }
  });

const reject = mutation
  .input(tradeOfferActionInputSchema)
  .handler(async ({ context: { db, session }, errors, input }) => {
    try {
      return await rejectTradeOffer(db, session.user.id, input);
    } catch (error) {
      translateTradeError(error, errors);
    }
  });

const cancel = mutation
  .input(tradeOfferActionInputSchema)
  .handler(async ({ context: { db, session }, errors, input }) => {
    try {
      return await cancelTradeOffer(db, session.user.id, input);
    } catch (error) {
      translateTradeError(error, errors);
    }
  });

const counteroffer = mutation
  .input(tradeOfferCounterInputSchema)
  .handler(async ({ context: { db, session }, errors, input }) => {
    try {
      return await counterOfferTradeOffer(db, session.user.id, input);
    } catch (error) {
      translateTradeError(error, errors);
    }
  });

const block = protectedProcedure
  .use(slidingWindowRatelimitMiddleware(10, 60))
  .input(z.object({ userId: z.string().trim().min(1).max(200) }).strict())
  .handler(async ({ context: { db, session }, errors, input }) => {
    try {
      return await blockTradeUser(db, session.user.id, input.userId);
    } catch (error) {
      translateTradeError(error, errors);
    }
  });

const unblock = protectedProcedure
  .use(slidingWindowRatelimitMiddleware(10, 60))
  .input(z.object({ userId: z.string().trim().min(1).max(200) }).strict())
  .handler(({ context: { db, session }, input }) =>
    unblockTradeUser(db, session.user.id, input.userId)
  );

const blocks = protectedProcedure
  .use(slidingWindowRatelimitMiddleware(30, 60))
  .handler(({ context: { db, session } }) =>
    listTradeUserBlocks(db, session.user.id)
  );

export default {
  accept,
  block,
  blocks,
  cancel,
  counteroffer,
  detail,
  eligible,
  eligibleForParticipant,
  inbox,
  list,
  reject,
  send,
  sent,
  unblock,
};
