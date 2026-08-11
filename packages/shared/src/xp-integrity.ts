import { z } from "zod";

export const XP_RISK_SIGNAL_KINDS = [
  "account_correlation",
  "idempotency_conflict",
  "like_correlation_observation",
  "like_toggle_velocity",
  "rejected_sequence",
  "source_cap_pressure",
  "wallet_credit_velocity",
  "xp_velocity",
] as const;

export const xpRiskSignalKindSchema = z.enum(XP_RISK_SIGNAL_KINDS);
export type XpRiskSignalKind = z.infer<typeof xpRiskSignalKindSchema>;
