import "server-only";
import {
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
configureAccountClosureLikeReconciler(reconcileClosedLikerRewardsInTransaction);
configureAccountClosureCompletionHandler((userId) => {
  revalidateTag(`profile:${userId}`, "max");
  revalidateTag("profiles", "max");
});
