import { verifyWebhookSignature } from "@repo/api/utils/patreon";
import { db, eq } from "@repo/db";
import { patron } from "@repo/db/schema/app";
import { env } from "@repo/env";
import { PATREON_TIER_MAPPING, PATRON_TIERS } from "@repo/shared/constants";
import type { PatronTier } from "@repo/shared/constants";
import { createFileRoute } from "@tanstack/react-router";

type PatreonWebhookPayload = {
  data: {
    id: string;
    type: "member";
    attributes: {
      patron_status: string | null;
      pledge_amount_cents: number;
      pledge_relationship_start: string | null;
    };
    relationships: {
      user: { data: { id: string; type: "user" } };
      campaign: { data: { id: string; type: "campaign" } };
      currently_entitled_tiers?: { data: { id: string; type: "tier" }[] };
    };
  };
};

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

async function handleMemberUpdate(data: PatreonWebhookPayload) {
  const patreonUserId = data.data.relationships.user.data.id;
  const campaignId = data.data.relationships.campaign.data.id;

  // Verify this is for our campaign
  if (campaignId !== env.PATREON_CAMPAIGN_ID) {
    console.log(`Ignoring webhook for different campaign: ${campaignId}`);
    return;
  }

  // Find user by Patreon account ID
  const patreonAccount = await db.query.account.findFirst({
    where: (a, { and: allOf, eq: equals }) =>
      allOf(
        equals(a.providerId, "patreon"),
        equals(a.accountId, patreonUserId)
      ),
  });

  if (!patreonAccount) {
    console.log(`No linked account for Patreon user: ${patreonUserId}`);
    return;
  }

  // Determine tier from entitled tiers in webhook
  const entitledTierIds =
    data.data.relationships.currently_entitled_tiers?.data ?? [];
  const tier = determineTierFromIds(entitledTierIds.map((t) => t.id));

  const pledgeAmountCents = data.data.attributes.pledge_amount_cents ?? 0;
  const isActive = data.data.attributes.patron_status === "active_patron";
  const patronSince = isActive
    ? data.data.attributes.pledge_relationship_start
    : null;

  await db
    .insert(patron)
    .values({
      isActivePatron: isActive,
      lastSyncAt: new Date(),
      lastWebhookAt: new Date(),
      patreonUserId,
      patronSince: patronSince ? new Date(patronSince) : null,
      pledgeAmountCents,
      tier,
      userId: patreonAccount.userId,
    })
    .onConflictDoUpdate({
      set: {
        isActivePatron: isActive,
        lastWebhookAt: new Date(),
        pledgeAmountCents,
        tier,
      },
      target: patron.userId,
    });

  console.log(
    `Webhook: Updated patron status for user ${patreonAccount.userId}, tier: ${tier}, active: ${isActive}`
  );
}

async function handleMemberDelete(data: PatreonWebhookPayload) {
  const patreonUserId = data.data.relationships.user.data.id;

  await db
    .update(patron)
    .set({
      isActivePatron: false,
      lastWebhookAt: new Date(),
      tier: "none",
    })
    .where(eq(patron.patreonUserId, patreonUserId));

  console.log(
    `Webhook: Removed patron status for Patreon user ${patreonUserId}`
  );
}

async function handleWebhook(request: Request): Promise<Response> {
  const signature = request.headers.get("x-patreon-signature");
  const event = request.headers.get("x-patreon-event");

  if (!(signature && event)) {
    return new Response("Missing required headers", { status: 400 });
  }

  const payload = await request.text();

  if (!verifyWebhookSignature(payload, signature, env.PATREON_WEBHOOK_SECRET)) {
    console.error("Invalid Patreon webhook signature");
    return new Response("Invalid signature", { status: 401 });
  }

  let data: PatreonWebhookPayload;
  try {
    data = JSON.parse(payload) as PatreonWebhookPayload;
  } catch {
    return new Response("Invalid JSON payload", { status: 400 });
  }

  try {
    switch (event) {
      case "members:pledge:create":
      case "members:pledge:update": {
        await handleMemberUpdate(data);
        break;
      }
      case "members:pledge:delete": {
        await handleMemberDelete(data);
        break;
      }
      default: {
        console.log(`Unhandled Patreon webhook event: ${event}`);
      }
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return new Response("Internal error", { status: 500 });
  }
}

export const Route = createFileRoute("/api/patreon/webhook")({
  server: {
    handlers: {
      POST: ({ request }) => handleWebhook(request),
    },
  },
});
