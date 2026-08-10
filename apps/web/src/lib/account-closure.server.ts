import "server-only";
import {
  reconcileClosedAuthorCommentRewardsInTransaction,
  reconcileClosedLikerRewardsInTransaction,
} from "@repo/api/services/contribution-rewards";
import {
  configureAccountClosureCommentReconciler,
  configureAccountClosureLikeReconciler,
} from "@repo/auth/account-closure";

configureAccountClosureCommentReconciler(
  reconcileClosedAuthorCommentRewardsInTransaction
);
configureAccountClosureLikeReconciler(reconcileClosedLikerRewardsInTransaction);
