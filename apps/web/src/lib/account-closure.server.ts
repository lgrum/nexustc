import "server-only";
import { reconcileCollectiblesForAccountClosureInTransaction } from "@repo/api/services/collectible-account-closure";
import {
  notifyBannedLikerRewardSettlementsInTransaction,
  reconcileClosedAuthorCommentRewardsInTransaction,
  reconcileClosedLikerRewardsInTransaction,
} from "@repo/api/services/contribution-rewards";
import {
  configureAccountClosureCollectibleReconciler,
  configureAccountClosureCommentReconciler,
  configureAccountClosureCompletionHandler,
  configureAccountClosureLikeReconciler,
} from "@repo/auth/account-closure";
import { revalidateTag } from "next/cache";

configureAccountClosureCollectibleReconciler(
  reconcileCollectiblesForAccountClosureInTransaction
);
configureAccountClosureCommentReconciler(
  reconcileClosedAuthorCommentRewardsInTransaction
);
configureAccountClosureLikeReconciler(async (tx, input) => {
  const settlements = await reconcileClosedLikerRewardsInTransaction(tx, input);
  await notifyBannedLikerRewardSettlementsInTransaction(tx, settlements);
  return settlements;
});
configureAccountClosureCompletionHandler((userId) => {
  revalidateTag(`profile:${userId}`, "max");
  revalidateTag("profiles", "max");
});
