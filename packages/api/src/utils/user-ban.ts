import { lte, or, sql } from "@repo/db";
import { user } from "@repo/db/schema/app";

type UserBanState = {
  banExpires: Date | null;
  banned: boolean | null;
};

export function isUserBanActive(account: UserBanState, now = new Date()) {
  return Boolean(
    account.banned &&
    (!account.banExpires || account.banExpires.getTime() > now.getTime())
  );
}

export function userIsNotActivelyBanned(now = new Date()) {
  return or(
    sql`${user.banned} is distinct from true`,
    lte(user.banExpires, now)
  );
}
