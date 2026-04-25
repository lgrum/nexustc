import { db } from "@repo/db";
import { patron } from "@repo/db/schema/app";
import {
  findPatreonMembershipForCampaign,
  formatPatreonIdentityError,
  PatreonIdentity,
} from "@repo/patreon";
import {
  getHighestPatronTierFromIds,
  resolvePermanentPatronTierStatus,
} from "@repo/shared/constants";
import type { PatronTier } from "@repo/shared/constants";

function determineTierFromIds(tierIds: string[]): PatronTier {
  return getHighestPatronTierFromIds(tierIds);
}

/**
 * Sync Patreon membership data for a user after they link their account.
 * This is called from the databaseHooks after a Patreon account is created.
 */
export async function syncPatreonMembership(
  userId: string,
  patreonAccountId: string,
  accessToken: string,
  campaignId: string
): Promise<void> {
  try {
    const patreonIdentity = new PatreonIdentity(accessToken);
    const [error, data, success] = await patreonIdentity.fetchIdentity();

    if (!success) {
      const message = formatPatreonIdentityError(error);
      console.error("Error fetching Patreon identity:", message);
      throw new Error(`Failed to fetch Patreon identity: ${message}`);
    }

    const membership = findPatreonMembershipForCampaign(data, campaignId);

    const entitledTiers =
      membership?.relationships?.currently_entitled_tiers?.data ?? [];
    const isActive =
      membership?.attributes?.patron_status === "active_patron" ||
      entitledTiers.length > 0;
    const patronSince =
      membership?.attributes?.pledge_relationship_start ?? null;
    const pledgeAmountCents =
      membership?.attributes?.currently_entitled_amount_cents ?? 0;
    const tier = determineTierFromIds(entitledTiers.map((t) => t.id));
    const existingPatron = await db.query.patron.findFirst({
      columns: {
        patronSince: true,
        tier: true,
      },
      where: (table, { eq }) => eq(table.userId, userId),
    });
    const patronStatus = resolvePermanentPatronTierStatus(existingPatron, {
      isActivePatron: isActive,
      patronSince: patronSince ? new Date(patronSince) : null,
      tier,
    });

    // Upsert patron record
    await db
      .insert(patron)
      .values({
        isActivePatron: patronStatus.isActivePatron,
        lastSyncAt: new Date(),
        patreonUserId: patreonAccountId,
        patronSince: patronStatus.patronSince,
        pledgeAmountCents,
        tier: patronStatus.tier,
        userId,
      })
      .onConflictDoUpdate({
        set: {
          isActivePatron: patronStatus.isActivePatron,
          lastSyncAt: new Date(),
          patronSince: patronStatus.patronSince,
          pledgeAmountCents,
          tier: patronStatus.tier,
        },
        target: patron.userId,
      });

    console.log(
      `Synced Patreon membership for user ${userId}: tier=${patronStatus.tier}, active=${patronStatus.isActivePatron}`
    );
  } catch (error) {
    console.error(
      `Error syncing Patreon membership for user ${userId}:`,
      error
    );
    throw error;
  }
}
