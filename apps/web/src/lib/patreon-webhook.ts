import { verifyWebhookSignature } from "@repo/api/utils/patreon";
import { db, eq } from "@repo/db";
import { patreonWebhookRequest, patron } from "@repo/db/schema/app";
import { env } from "@repo/env";
import {
  getHighestPatronTierFromIds,
  isActiveEntitledPatron,
  resolvePermanentPatronTierStatus,
} from "@repo/shared/constants";
import type { PatronTier } from "@repo/shared/constants";

type PatreonWebhookPayload = {
  data: {
    id: string;
    type: "member";
    attributes: {
      patron_status: string | null;
      pledge_amount_cents?: number;
      currently_entitled_amount_cents?: number;
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

const MAX_PATREON_WEBHOOK_BODY_BYTES = 1024 * 1024;
const STORED_REQUEST_HEADER_NAMES = [
  "content-length",
  "content-type",
  "user-agent",
] as const;

type BoundedBodyResult = { body: string; ok: true } | { ok: false };

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown webhook error";
}

function getRequestHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const name of STORED_REQUEST_HEADER_NAMES) {
    const value = request.headers.get(name);
    if (value !== null) {
      headers[name] = value;
    }
  }

  return headers;
}

async function readBoundedBody(request: Request): Promise<BoundedBodyResult> {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > MAX_PATREON_WEBHOOK_BODY_BYTES
  ) {
    return { ok: false };
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return { body: "", ok: true };
  }

  const decoder = new TextDecoder();
  let body = "";
  let byteCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    byteCount += value.byteLength;
    if (byteCount > MAX_PATREON_WEBHOOK_BODY_BYTES) {
      try {
        await reader.cancel();
      } catch {
        // Cancellation failure must not turn an oversized request into a 500.
      }
      return { ok: false };
    }

    body += decoder.decode(value, { stream: true });
  }

  body += decoder.decode();
  return { body, ok: true };
}

async function storePatreonWebhookRequest({
  event,
  payload,
  request,
  signature,
}: {
  event: string;
  payload: string;
  request: Request;
  signature: string;
}) {
  const [storedRequest] = await db
    .insert(patreonWebhookRequest)
    .values({
      body: payload,
      event,
      headers: getRequestHeaders(request),
      method: request.method,
      signature,
      url: new URL(request.url).pathname,
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
  const tier = getHighestPatronTierFromIds(entitledTierIds.map((t) => t.id));

  const pledgeAmountCents =
    data.data.attributes.currently_entitled_amount_cents ??
    data.data.attributes.pledge_amount_cents ??
    0;
  const isActive = isActiveEntitledPatron(
    data.data.attributes.patron_status,
    tier
  );
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
): Promise<"processed" | "ignored"> {
  const patreonUserId = data.data.relationships.user.data.id;
  const campaignId = data.data.relationships.campaign.data.id;

  if (campaignId !== env.PATREON_CAMPAIGN_ID) {
    console.log(`Ignoring webhook for different campaign: ${campaignId}`);
    return "ignored";
  }

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

  const updatedPatrons = await db
    .update(patron)
    .set({
      isActivePatron: patronStatus.isActivePatron,
      lastWebhookAt: new Date(),
      tier: patronStatus.tier,
    })
    .where(eq(patron.patreonUserId, patreonUserId))
    .returning({ id: patron.id });

  if (updatedPatrons.length === 0) {
    console.log(
      `Webhook: No patron record found for Patreon user ${patreonUserId}`
    );
    return "ignored";
  }

  console.log(
    `Webhook: Removed patron status for Patreon user ${patreonUserId}`
  );
  return "processed";
}

export async function handleWebhook(request: Request): Promise<Response> {
  const signature = request.headers.get("x-patreon-signature");
  const event = request.headers.get("x-patreon-event");

  if (!(signature && event)) {
    return new Response("Missing required headers", { status: 400 });
  }

  const bodyResult = await readBoundedBody(request);
  if (!bodyResult.ok) {
    return new Response("Payload too large", { status: 413 });
  }

  const payload = bodyResult.body;

  if (!verifyWebhookSignature(payload, signature, env.PATREON_WEBHOOK_SECRET)) {
    console.error("Invalid Patreon webhook signature");
    return new Response("Invalid signature", { status: 401 });
  }

  const storedWebhookRequestId = await storePatreonWebhookRequest({
    event,
    payload,
    request,
    signature,
  });

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
      case "members:delete": {
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
