/* oxlint-disable eslint/require-await -- Closure steps retain the asynchronous dependency contract used by orchestration. */
import { and, asc, eq, or, sql } from "@repo/db";
import type { db as database } from "@repo/db";
import {
  blackMarketListing,
  giftOffer,
  profileSettings,
  profileShowcaseConfig,
  tradeOffer,
} from "@repo/db/schema/app";

import { administrativelyCancelBlackMarketListingInTransaction } from "./black-market";
import { closeSentGiftOfferInTransaction } from "./gift-offer";
import { closeSentTradeOfferInTransaction } from "./trade-offer";

type Database = typeof database;
export type CollectibleAccountClosureTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

export type CollectibleAccountClosureInput = {
  now: Date;
  userId: string;
  walletId: string;
};

type ClosureRecord = { id: string };
type ClosureCommandInput = CollectibleAccountClosureInput & {
  actorUserId: string;
  idempotencyKey: string;
};

export type CollectibleAccountClosureDependencies = {
  closeGift(
    tx: CollectibleAccountClosureTransaction,
    offer: ClosureRecord,
    input: ClosureCommandInput
  ): Promise<unknown>;
  closeListing(
    tx: CollectibleAccountClosureTransaction,
    listing: ClosureRecord,
    input: ClosureCommandInput & { reverseFee: boolean }
  ): Promise<unknown>;
  closeTrade(
    tx: CollectibleAccountClosureTransaction,
    offer: ClosureRecord,
    input: ClosureCommandInput
  ): Promise<unknown>;
  listActiveListings(
    tx: CollectibleAccountClosureTransaction,
    userId: string
  ): Promise<ClosureRecord[]>;
  listSentGifts(
    tx: CollectibleAccountClosureTransaction,
    userId: string
  ): Promise<ClosureRecord[]>;
  listSentTrades(
    tx: CollectibleAccountClosureTransaction,
    userId: string
  ): Promise<ClosureRecord[]>;
  pseudonymize(
    tx: CollectibleAccountClosureTransaction,
    input: CollectibleAccountClosureInput
  ): Promise<void>;
  suppressPublicProfile(
    tx: CollectibleAccountClosureTransaction,
    input: CollectibleAccountClosureInput
  ): Promise<void>;
};

const CLOSURE_REASON = "Cierre de cuenta solicitado por la persona titular.";

async function suppressPublicProfile(
  tx: CollectibleAccountClosureTransaction,
  input: CollectibleAccountClosureInput
) {
  await tx
    .update(profileSettings)
    .set({
      inboundGiftsEnabled: false,
      inboundTradesEnabled: false,
      updatedAt: input.now,
      visibilityConfig: sql`jsonb_set(${profileSettings.visibilityConfig}, '{publicCollection}', 'false'::jsonb, true)`,
    })
    .where(eq(profileSettings.userId, input.userId));
  await tx
    .update(profileShowcaseConfig)
    .set({ enabled: false, updatedAt: input.now })
    .where(eq(profileShowcaseConfig.userId, input.userId));
}

async function listSentTrades(
  tx: CollectibleAccountClosureTransaction,
  userId: string
) {
  return tx
    .select({ id: tradeOffer.id })
    .from(tradeOffer)
    .where(
      and(
        eq(tradeOffer.state, "sent"),
        or(
          eq(tradeOffer.proposerUserId, userId),
          eq(tradeOffer.recipientUserId, userId)
        )
      )
    )
    .orderBy(asc(tradeOffer.id))
    .for("update");
}

async function listSentGifts(
  tx: CollectibleAccountClosureTransaction,
  userId: string
) {
  return tx
    .select({ id: giftOffer.id })
    .from(giftOffer)
    .where(
      and(
        eq(giftOffer.state, "sent"),
        or(
          eq(giftOffer.senderUserId, userId),
          eq(giftOffer.recipientUserId, userId)
        )
      )
    )
    .orderBy(asc(giftOffer.id))
    .for("update");
}

async function listActiveListings(
  tx: CollectibleAccountClosureTransaction,
  userId: string
) {
  return tx
    .select({ id: blackMarketListing.id })
    .from(blackMarketListing)
    .where(
      and(
        eq(blackMarketListing.sellerUserId, userId),
        eq(blackMarketListing.state, "active")
      )
    )
    .orderBy(asc(blackMarketListing.id))
    .for("update");
}

async function closeTrade(
  tx: CollectibleAccountClosureTransaction,
  offer: ClosureRecord,
  input: ClosureCommandInput
) {
  const [row] = await tx
    .select()
    .from(tradeOffer)
    .where(eq(tradeOffer.id, offer.id))
    .for("update");
  if (!row) {
    return { replayed: true };
  }
  return closeSentTradeOfferInTransaction(
    tx,
    row,
    input.actorUserId,
    "administratively-cancelled",
    CLOSURE_REASON,
    input.idempotencyKey,
    input.now
  );
}

async function closeGift(
  tx: CollectibleAccountClosureTransaction,
  offer: ClosureRecord,
  input: ClosureCommandInput
) {
  const [row] = await tx
    .select()
    .from(giftOffer)
    .where(eq(giftOffer.id, offer.id))
    .for("update");
  if (!row) {
    return { replayed: true };
  }
  return closeSentGiftOfferInTransaction(
    tx,
    row,
    input.actorUserId,
    "administratively-cancelled",
    CLOSURE_REASON,
    input.idempotencyKey,
    input.now
  );
}

async function closeListing(
  tx: CollectibleAccountClosureTransaction,
  listing: ClosureRecord,
  input: ClosureCommandInput & { reverseFee: true }
) {
  return administrativelyCancelBlackMarketListingInTransaction(
    tx,
    input.actorUserId,
    listing.id,
    CLOSURE_REASON,
    input.idempotencyKey,
    input.now,
    undefined,
    input.reverseFee
  );
}

/**
 * Replace public user identifiers with the already-retained opaque Eteris
 * wallet identity. These columns are deliberately absent from public DTOs.
 */
async function pseudonymizeCollectibleHistory(
  tx: CollectibleAccountClosureTransaction,
  input: CollectibleAccountClosureInput
) {
  const { now, userId, walletId } = input;

  await tx.execute(sql`
    UPDATE card_instance
    SET closed_owner_wallet_id = ${walletId}, owner_user_id = NULL,
        version = version + 1, updated_at = ${now}
    WHERE owner_user_id = ${userId}
  `);
  await tx.execute(sql`
    UPDATE pack_instance
    SET closed_owner_wallet_id = ${walletId}, owner_user_id = NULL,
        version = version + 1, updated_at = ${now}
    WHERE owner_user_id = ${userId}
  `);
  await tx.execute(sql`
    UPDATE collectible_ownership_event
    SET actor_wallet_id = CASE WHEN actor_user_id = ${userId} THEN ${walletId} ELSE actor_wallet_id END,
        actor_user_id = CASE WHEN actor_user_id = ${userId} THEN NULL ELSE actor_user_id END,
        from_wallet_id = CASE WHEN from_user_id = ${userId} THEN ${walletId} ELSE from_wallet_id END,
        from_user_id = CASE WHEN from_user_id = ${userId} THEN NULL ELSE from_user_id END,
        to_wallet_id = CASE WHEN to_user_id = ${userId} THEN ${walletId} ELSE to_wallet_id END,
        to_user_id = CASE WHEN to_user_id = ${userId} THEN NULL ELSE to_user_id END
    WHERE actor_user_id = ${userId} OR from_user_id = ${userId} OR to_user_id = ${userId}
  `);
  await tx.execute(sql`
    UPDATE collectible_grant_execution
    SET actor_wallet_id = CASE WHEN actor_user_id = ${userId} THEN ${walletId} ELSE actor_wallet_id END,
        actor_user_id = CASE WHEN actor_user_id = ${userId} THEN NULL ELSE actor_user_id END,
        recipient_wallet_id = CASE WHEN recipient_user_id = ${userId} THEN ${walletId} ELSE recipient_wallet_id END,
        recipient_user_id = CASE WHEN recipient_user_id = ${userId} THEN NULL ELSE recipient_user_id END
    WHERE actor_user_id = ${userId} OR recipient_user_id = ${userId}
  `);
  await tx.execute(sql`
    UPDATE trade_offer
    SET actor_wallet_id = CASE WHEN actor_user_id = ${userId} THEN ${walletId} ELSE actor_wallet_id END,
        actor_user_id = CASE WHEN actor_user_id = ${userId} THEN NULL ELSE actor_user_id END,
        proposer_wallet_id = CASE WHEN proposer_user_id = ${userId} THEN ${walletId} ELSE proposer_wallet_id END,
        proposer_user_id = CASE WHEN proposer_user_id = ${userId} THEN NULL ELSE proposer_user_id END,
        recipient_wallet_id = CASE WHEN recipient_user_id = ${userId} THEN ${walletId} ELSE recipient_wallet_id END,
        recipient_user_id = CASE WHEN recipient_user_id = ${userId} THEN NULL ELSE recipient_user_id END
    WHERE actor_user_id = ${userId} OR proposer_user_id = ${userId} OR recipient_user_id = ${userId}
  `);
  await tx.execute(sql`
    UPDATE trade_offer_history
    SET actor_wallet_id = ${walletId}, actor_user_id = NULL
    WHERE actor_user_id = ${userId}
  `);
  await tx.execute(sql`
    UPDATE gift_offer
    SET actor_wallet_id = CASE WHEN actor_user_id = ${userId} THEN ${walletId} ELSE actor_wallet_id END,
        actor_user_id = CASE WHEN actor_user_id = ${userId} THEN NULL ELSE actor_user_id END,
        sender_wallet_id = CASE WHEN sender_user_id = ${userId} THEN ${walletId} ELSE sender_wallet_id END,
        sender_user_id = CASE WHEN sender_user_id = ${userId} THEN NULL ELSE sender_user_id END,
        recipient_wallet_id = CASE WHEN recipient_user_id = ${userId} THEN ${walletId} ELSE recipient_wallet_id END,
        recipient_user_id = CASE WHEN recipient_user_id = ${userId} THEN NULL ELSE recipient_user_id END
    WHERE actor_user_id = ${userId} OR sender_user_id = ${userId} OR recipient_user_id = ${userId}
  `);
  await tx.execute(sql`
    UPDATE gift_offer_history
    SET actor_wallet_id = ${walletId}, actor_user_id = NULL
    WHERE actor_user_id = ${userId}
  `);
  await tx.execute(sql`
    UPDATE black_market_listing
    SET seller_wallet_id = ${walletId}, seller_user_id = NULL
    WHERE seller_user_id = ${userId}
  `);
  await tx.execute(sql`
    UPDATE black_market_listing_audit
    SET actor_wallet_id = ${walletId}, actor_user_id = NULL
    WHERE actor_user_id = ${userId}
  `);
  await tx.execute(sql`
    UPDATE black_market_sale
    SET buyer_wallet_id = CASE WHEN buyer_user_id = ${userId} THEN ${walletId} ELSE buyer_wallet_id END,
        buyer_user_id = CASE WHEN buyer_user_id = ${userId} THEN NULL ELSE buyer_user_id END,
        seller_wallet_id = CASE WHEN seller_user_id = ${userId} THEN ${walletId} ELSE seller_wallet_id END,
        seller_user_id = CASE WHEN seller_user_id = ${userId} THEN NULL ELSE seller_user_id END
    WHERE buyer_user_id = ${userId} OR seller_user_id = ${userId}
  `);
  await tx.execute(sql`
    UPDATE pack_opening
    SET owner_wallet_id = ${walletId}, owner_user_id = NULL
    WHERE owner_user_id = ${userId}
  `);
  await tx.execute(sql`
    UPDATE official_card_shop_purchase
    SET buyer_wallet_id = ${walletId}, buyer_user_id = NULL
    WHERE buyer_user_id = ${userId}
  `);
  await tx.execute(sql`
    UPDATE gachapon_activation
    SET user_wallet_id = ${walletId}, user_id = NULL
    WHERE user_id = ${userId}
  `);
  await tx.execute(sql`
    UPDATE collectible_admin_action
    SET actor_wallet_id = ${walletId}, actor_user_id = NULL
    WHERE actor_user_id = ${userId}
  `);
}

const defaultDependencies: CollectibleAccountClosureDependencies = {
  closeGift,
  closeListing,
  closeTrade,
  listActiveListings,
  listSentGifts,
  listSentTrades,
  pseudonymize: pseudonymizeCollectibleHistory,
  suppressPublicProfile,
};

export async function reconcileCollectiblesForAccountClosureInTransaction(
  tx: CollectibleAccountClosureTransaction,
  input: CollectibleAccountClosureInput,
  dependencies: CollectibleAccountClosureDependencies = defaultDependencies
) {
  await dependencies.suppressPublicProfile(tx, input);
  const trades = await dependencies.listSentTrades(tx, input.userId);
  const gifts = await dependencies.listSentGifts(tx, input.userId);
  const listings = await dependencies.listActiveListings(tx, input.userId);

  for (const offer of trades) {
    await dependencies.closeTrade(tx, offer, {
      ...input,
      actorUserId: input.userId,
      idempotencyKey: `account-closure:trade:${offer.id}`,
    });
  }
  for (const offer of gifts) {
    await dependencies.closeGift(tx, offer, {
      ...input,
      actorUserId: input.userId,
      idempotencyKey: `account-closure:gift:${offer.id}`,
    });
  }
  for (const listing of listings) {
    await dependencies.closeListing(tx, listing, {
      ...input,
      actorUserId: input.userId,
      idempotencyKey: `account-closure:listing:${listing.id}`,
      // Fee policy (stories 79/80): closure is a voluntary cancellation, so
      // the listing fee is not refunded. Only platform-initiated
      // cancellations through no fault of the seller reverse the fee.
      reverseFee: false,
    });
  }
  await dependencies.pseudonymize(tx, input);

  return {
    closedGiftIds: gifts.map(({ id }) => id),
    closedListingIds: listings.map(({ id }) => id),
    closedTradeIds: trades.map(({ id }) => id),
  };
}
