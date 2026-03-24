import { db } from "@repo/db";
import { patron } from "@repo/db/schema/app";
import { PatreonIdentity } from "@repo/patreon";
import { PATREON_TIER_MAPPING, PATRON_TIERS } from "@repo/shared/constants";
import type { PatronTier } from "@repo/shared/constants";

function determineTierFromIds(tierIds: string[]): PatronTier {
  let highestTier: PatronTier = "none";
  let highestLevel = 0;

  for (const tierId of tierIds) {
    const mappedTier = PATREON_TIER_MAPPING[tierId];
    if (mappedTier) {
      const tierConfig = PATRON_TIERS[mappedTier];
      if (tierConfig.level > highestLevel) {
        highestLevel = tierConfig.level;
        highestTier = mappedTier;
      }
    }
  }

  return highestTier;
}

/**
 * Sync Patreon membership data for a user after they link their account.
 * This is called from the databaseHooks after a Patreon account is created.
 */
export async function syncPatreonMembership(
  userId: string,
  patreonAccountId: string,
  accessToken: string
): Promise<void> {
  try {
    const patreonIdentity = new PatreonIdentity(accessToken);
    const [error, data, success] = await patreonIdentity.fetchIdentity();

    if (!success) {
      console.error("Error fetching Patreon identity:", error);
      throw new Error("Failed to fetch Patreon identity");
    }

    // Find the first membership (user should only have one to our campaign)
    const membership = data.included?.find((item) => item.type === "member");

    const isActive = membership?.attributes?.patron_status === "active_patron";
    const patronSince =
      membership?.attributes?.pledge_relationship_start ?? null;
    const entitledTiers =
      membership?.relationships?.currently_entitled_tiers?.data ?? [];
    const pledgeAmountCents =
      membership?.attributes?.currently_entitled_amount_cents ?? 0;
    const tier = determineTierFromIds(entitledTiers.map((t) => t.id));

    // Upsert patron record
    await db
      .insert(patron)
      .values({
        isActivePatron: isActive,
        lastSyncAt: new Date(),
        patreonUserId: patreonAccountId,
        patronSince: patronSince ? new Date(patronSince) : null,
        pledgeAmountCents,
        tier,
        userId,
      })
      .onConflictDoUpdate({
        set: {
          isActivePatron: isActive,
          lastSyncAt: new Date(),
          patronSince: patronSince ? new Date(patronSince) : null,
          pledgeAmountCents: 0,
          tier,
        },
        target: patron.userId,
      });

    console.log(
      `Synced Patreon membership for user ${userId}: tier=${tier}, active=${isActive}`
    );
  } catch (error) {
    console.error(
      `Error syncing Patreon membership for user ${userId}:`,
      error
    );
    throw error;
  }
}
