import { z } from "zod";

import type { PatronTier } from "./constants";

export const ETERIS_PATREON_STIPEND_VERSION = "v1";
// Approved launch schedule; production accrual still requires the first sink's price review.
export const ETERIS_MONTHLY_PATREON_STIPENDS = {
  level1: 50n,
  level3: 150n,
  level5: 250n,
  level8: 400n,
  level12: 600n,
  level69: 1500n,
  level100: 2500n,
  none: 0n,
} as const satisfies Readonly<Record<PatronTier, bigint>>;

export const ETERIS_WALLET_KINDS = [
  "user",
  "mint",
  "sink",
  "fee",
  "write_off",
] as const;
export const ETERIS_WALLET_STATUSES = ["active", "frozen", "closed"] as const;
export const ETERIS_TRANSACTION_KINDS = [
  "level_reward",
  "vip_stipend",
  "admin_adjustment",
  "reversal",
  "account_closure",
  "purchase",
  "trade",
  "auction",
  "gacha",
  "refund",
] as const;
export const ETERIS_SOURCE_MODULES = [
  "progression",
  "patreon",
  "owner",
  "account",
  "commerce",
] as const;

export const ETERIS_SYSTEM_WALLETS = [
  { code: "mint", id: "eteris-system-mint", kind: "mint" },
  { code: "sink", id: "eteris-system-sink", kind: "sink" },
  { code: "fee", id: "eteris-system-fee", kind: "fee" },
  { code: "write-off", id: "eteris-system-write-off", kind: "write_off" },
] as const;

export const ETERIS_MIN_AMOUNT = BigInt("-9223372036854775808");
export const ETERIS_MAX_AMOUNT = 9_223_372_036_854_775_807n;

export const eterisAmountSchema = z
  .string()
  .regex(/^-?[1-9]\d*$/)
  .transform((value) => BigInt(value))
  .refine(
    (value) => value >= ETERIS_MIN_AMOUNT && value <= ETERIS_MAX_AMOUNT,
    "La cantidad de Eteris excede el rango permitido."
  );

export type EterisSourceModule = (typeof ETERIS_SOURCE_MODULES)[number];
export type EterisTransactionKind = (typeof ETERIS_TRANSACTION_KINDS)[number];
