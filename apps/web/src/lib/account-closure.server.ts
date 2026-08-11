import "server-only";
import {
  notifyBannedLikerRewardSettlementsInTransaction,
  reconcileClosedAuthorCommentRewardsInTransaction,
  reconcileClosedLikerRewardsInTransaction,
} from "@repo/api/services/contribution-rewards";
import {
  configureAccountClosureCommentReconciler,
  configureAccountClosureCompletionHandler,
  configureAccountClosureLikeReconciler,
} from "@repo/auth/account-closure";
import { revalidateTag } from "next/cache";

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
