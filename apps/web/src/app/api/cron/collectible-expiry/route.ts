import { expireBlackMarketListingsBatch } from "@repo/api/services/black-market";
import {
  expireCollectibleGiftOffersBatch,
  expireCollectibleTradeOffersBatch,
} from "@repo/api/services/trade-offer";
import { db } from "@repo/db";
import { env } from "@repo/env";

export async function GET(request: Request) {
  if (
    !env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const trades = await expireCollectibleTradeOffersBatch(db);
  const gifts = await expireCollectibleGiftOffersBatch(db);
  const blackMarket = await expireBlackMarketListingsBatch(db);
  return Response.json({
    ...(blackMarket
      ? {
          blackMarket: {
            checked: blackMarket.checked,
            expired: blackMarket.expired,
          },
        }
      : {}),
    gifts: { checked: gifts.checked, expired: gifts.expired },
    trades: { checked: trades.checked, expired: trades.expired },
  });
}
