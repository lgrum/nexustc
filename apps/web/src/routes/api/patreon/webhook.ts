import { verifyWebhookSignature } from "@repo/api/utils/patreon";
import { db, eq } from "@repo/db";
import { patreonWebhookRequest, patron } from "@repo/db/schema/app";
import { env } from "@repo/env";
import {
  getHighestPatronTierFromIds,
  resolvePermanentPatronTierStatus,
} from "@repo/shared/constants";
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

type PatreonWebhookProcessingStatus =
  | "processed"
  | "ignored"
  | "invalid"
  | "failed";

function determineTierFromIds(tierIds: string[]): PatronTier {
  return getHighestPatronTierFromIds(tierIds);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown webhook error";
}

function getRequestHeaders(request: Request): Record<string, string> {
  return Object.fromEntries(request.headers.entries());
}

async function storePatreonWebhookRequest({
  event,
  payload,
  request,
  signature,
}: {
  event: string | null;
  payload: string;
  request: Request;
  signature: string | null;
}) {
  const [storedRequest] = await db
    .insert(patreonWebhookRequest)
    .values({
      body: payload,
      event,
      headers: getRequestHeaders(request),
      method: request.method,
      signature,
      url: request.url,
    })
    .returning({ id: patreonWebhookRequest.id });

  if (!storedRequest) {
    throw new Error("Failed to store Patreon webhook request");
  }

  return storedRequest.id;
}

async function updatePatreonWebhookRequestStatus({
  error,
  id,
  responseStatus,
  status,
}: {
  error?: string;
  id: string;
  responseStatus: number;
  status: PatreonWebhookProcessingStatus;
}) {
  try {
    await db
      .update(patreonWebhookRequest)
      .set({
        processedAt: new Date(),
        processingError: error,
        processingStatus: status,
        responseStatus,
      })
      .where(eq(patreonWebhookRequest.id, id));
  } catch (statusUpdateError) {
    console.error(
      "Failed to update Patreon webhook request status:",
      statusUpdateError
    );
  }
}

async function handleMemberUpdate(
  data: PatreonWebhookPayload
): Promise<"processed" | "ignored"> {
  const patreonUserId = data.data.relationships.user.data.id;
  const campaignId = data.data.relationships.campaign.data.id;

  // Verify this is for our campaign
  if (campaignId !== env.PATREON_CAMPAIGN_ID) {
    console.log(`Ignoring webhook for different campaign: ${campaignId}`);
    return "ignored";
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
    return "ignored";
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
  const existingPatron = await db.query.patron.findFirst({
    columns: {
      patronSince: true,
      tier: true,
    },
    where: (table, { eq: equals }) =>
      equals(table.userId, patreonAccount.userId),
  });
  const patronStatus = resolvePermanentPatronTierStatus(existingPatron, {
    isActivePatron: isActive,
    patronSince: patronSince ? new Date(patronSince) : null,
    tier,
  });

  await db
    .insert(patron)
    .values({
      isActivePatron: patronStatus.isActivePatron,
      lastSyncAt: new Date(),
      lastWebhookAt: new Date(),
      patreonUserId,
      patronSince: patronStatus.patronSince,
      pledgeAmountCents,
      tier: patronStatus.tier,
      userId: patreonAccount.userId,
    })
    .onConflictDoUpdate({
      set: {
        isActivePatron: patronStatus.isActivePatron,
        lastWebhookAt: new Date(),
        pledgeAmountCents,
        tier: patronStatus.tier,
      },
      target: patron.userId,
    });

  console.log(
    `Webhook: Updated patron status for user ${patreonAccount.userId}, tier: ${patronStatus.tier}, active: ${patronStatus.isActivePatron}`
  );
  return "processed";
}

async function handleMemberDelete(
  data: PatreonWebhookPayload
): Promise<"processed"> {
  const patreonUserId = data.data.relationships.user.data.id;
  const existingPatron = await db.query.patron.findFirst({
    columns: {
      patronSince: true,
      tier: true,
    },
    where: (table, { eq: equals }) =>
      equals(table.patreonUserId, patreonUserId),
  });
  const patronStatus = resolvePermanentPatronTierStatus(existingPatron, {
    isActivePatron: false,
    tier: "none" as PatronTier,
  });

  await db
    .update(patron)
    .set({
      isActivePatron: patronStatus.isActivePatron,
      lastWebhookAt: new Date(),
      tier: patronStatus.tier,
    })
    .where(eq(patron.patreonUserId, patreonUserId));

  console.log(
    `Webhook: Removed patron status for Patreon user ${patreonUserId}`
  );
  return "processed";
}

async function handleWebhook(request: Request): Promise<Response> {
  const payload = await request.text();
  const signature = request.headers.get("x-patreon-signature");
  const event = request.headers.get("x-patreon-event");
  const storedWebhookRequestId = await storePatreonWebhookRequest({
    event,
    payload,
    request,
    signature,
  });

  if (!(signature && event)) {
    await updatePatreonWebhookRequestStatus({
      error: "Missing required headers",
      id: storedWebhookRequestId,
      responseStatus: 400,
      status: "invalid",
    });
    return new Response("Missing required headers", { status: 400 });
  }

  if (!verifyWebhookSignature(payload, signature, env.PATREON_WEBHOOK_SECRET)) {
    console.error("Invalid Patreon webhook signature");
    await updatePatreonWebhookRequestStatus({
      error: "Invalid signature",
      id: storedWebhookRequestId,
      responseStatus: 401,
      status: "invalid",
    });
    return new Response("Invalid signature", { status: 401 });
  }

  let data: PatreonWebhookPayload;
  try {
    data = JSON.parse(payload) as PatreonWebhookPayload;
  } catch (error) {
    await updatePatreonWebhookRequestStatus({
      error: getErrorMessage(error),
      id: storedWebhookRequestId,
      responseStatus: 400,
      status: "invalid",
    });
    return new Response("Invalid JSON payload", { status: 400 });
  }

  try {
    let processingStatus: "processed" | "ignored" = "ignored";

    switch (event) {
      case "members:pledge:create":
      case "members:pledge:update": {
        processingStatus = await handleMemberUpdate(data);
        break;
      }
      case "members:pledge:delete": {
        processingStatus = await handleMemberDelete(data);
        break;
      }
      default: {
        console.log(`Unhandled Patreon webhook event: ${event}`);
      }
    }

    await updatePatreonWebhookRequestStatus({
      id: storedWebhookRequestId,
      responseStatus: 200,
      status: processingStatus,
    });
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Webhook processing error:", error);
    await updatePatreonWebhookRequestStatus({
      error: getErrorMessage(error),
      id: storedWebhookRequestId,
      responseStatus: 500,
      status: "failed",
    });
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
