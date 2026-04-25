import { createHmac } from "node:crypto";

import { env } from "@repo/env";
import {
  findPatreonMembershipForCampaign,
  formatPatreonIdentityError,
  PatreonIdentity,
} from "@repo/patreon";
import { getHighestPatronTierFromIds } from "@repo/shared/constants";
import type { PatronTier } from "@repo/shared/constants";

export type PatreonTokenResponse = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type PatreonMembership = {
  isActive: boolean;
  pledgeAmountCents: number;
  patronSince: string | null;
  entitledTierIds: string[];
};

/**
 * Refresh an expired Patreon access token using the refresh token.
 */
export async function refreshPatreonToken(
  refreshToken: string
): Promise<PatreonTokenResponse> {
  const response = await fetch("https://www.patreon.com/api/oauth2/token", {
    body: new URLSearchParams({
      client_id: env.PATREON_CLIENT_ID,
      client_secret: env.PATREON_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh Patreon token: ${error}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
    refreshToken: data.refresh_token,
  };
}

/**
 * Fetch membership data for a user from the Patreon API.
 * Returns null if the user has no membership.
 */
export async function fetchPatreonMembership(
  accessToken: string,
  campaignId: string
): Promise<PatreonMembership | null> {
  const patreonIdentity = new PatreonIdentity(accessToken);
  const [error, data, success] = await patreonIdentity.fetchIdentity();

  if (!success) {
    const message = formatPatreonIdentityError(error);
    console.error("Error fetching Patreon identity:", message);
    throw new Error(`Failed to fetch Patreon identity: ${message}`);
  }

  const membership = findPatreonMembershipForCampaign(data, campaignId);

  if (!membership) {
    return null;
  }

  const entitledTiers =
    membership.relationships?.currently_entitled_tiers?.data ?? [];
  const isEntitledToTiers = entitledTiers.length > 0;

  return {
    entitledTierIds: entitledTiers.map((t) => t.id),
    isActive:
      membership.attributes?.patron_status === "active_patron" ||
      isEntitledToTiers,
    patronSince: membership.attributes?.pledge_relationship_start ?? null,
    pledgeAmountCents:
      membership.attributes?.currently_entitled_amount_cents ?? 0,
  };
}

/**
 * Determine the highest tier from a list of Patreon tier IDs.
 * Uses the PATREON_TIER_MAPPING to map external tier IDs to our internal tiers.
 */
export function determineTierFromIds(tierIds: string[]): PatronTier {
  return getHighestPatronTierFromIds(tierIds);
}

/**
 * Verify a Patreon webhook signature.
 * Patreon uses HMAC-MD5 to sign webhook payloads.
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = createHmac("md5", secret).update(payload).digest("hex");
  return signature === expected;
}
