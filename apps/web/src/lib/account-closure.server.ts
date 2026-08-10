import "server-only";
import { reconcileClosedLikerRewardsInTransaction } from "@repo/api/services/contribution-rewards";
import { configureAccountClosureLikeReconciler } from "@repo/auth/account-closure";

configureAccountClosureLikeReconciler(reconcileClosedLikerRewardsInTransaction);
