import { createHmac } from "node:crypto";

import { beforeEach, expect, it, vi } from "vitest";

import { handleWebhook } from "@/lib/patreon-webhook";

const TEST_SECRET = "test-only-webhook-secret";
const MAX_BODY_BYTES = 1024 * 1024;

const databaseMocks = vi.hoisted(() => ({
  accountFindFirst: vi.fn(),
  insert: vi.fn(),
  insertReturning: vi.fn(),
  insertValues: vi.fn(),
  patronFindFirst: vi.fn(),
  update: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
}));
const stipendMocks = vi.hoisted(() => ({ grant: vi.fn() }));

vi.mock("@repo/db", () => ({
  db: {
    insert: databaseMocks.insert,
    query: {
      account: { findFirst: databaseMocks.accountFindFirst },
      patron: { findFirst: databaseMocks.patronFindFirst },
    },
    update: databaseMocks.update,
  },
  eq: vi.fn(),
}));

vi.mock("@repo/api/services/patreon-stipend", () => ({
  grantMonthlyPatreonStipend: stipendMocks.grant,
}));

vi.mock("@repo/env", () => ({
  env: {
    PATREON_CAMPAIGN_ID: "test-campaign",
    PATREON_WEBHOOK_SECRET: "test-only-webhook-secret",
  },
}));

const signatureFor = (body: string): string =>
  createHmac("md5", TEST_SECRET).update(body).digest("hex");

function createRequest(
  body: BodyInit | null,
  headers: Record<string, string> = {}
): Request {
  return new Request(
    "https://example.com/api/patreon/webhook?authorization=secret",
    {
      body,
      headers,
      method: "POST",
    }
  );
}

function createStreamingRequest(
  chunks: Uint8Array[],
  headers: Record<string, string>
): Request {
  return {
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    }),
    headers: new Headers(headers),
    method: "POST",
    url: "https://example.com/api/patreon/webhook?authorization=secret",
  } as Request;
}

function authenticatedHeaders(
  body: string,
  headers: Record<string, string> = {}
): Record<string, string> {
  return {
    "x-patreon-event": "unhandled:event",
    "x-patreon-signature": signatureFor(body),
    ...headers,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  databaseMocks.insert.mockReturnValue({ values: databaseMocks.insertValues });
  databaseMocks.insertValues.mockReturnValue({
    onConflictDoUpdate: vi.fn(() => Promise.resolve()),
    returning: databaseMocks.insertReturning,
  });
  databaseMocks.insertReturning.mockResolvedValue([{ id: "stored-request" }]);
  databaseMocks.update.mockReturnValue({ set: databaseMocks.updateSet });
  databaseMocks.updateSet.mockReturnValue({ where: databaseMocks.updateWhere });
  databaseMocks.updateWhere.mockResolvedValue();
  stipendMocks.grant.mockResolvedValue({ granted: "0" });
});

it("rejects missing authentication headers without inserting", async () => {
  const response = await handleWebhook(createRequest("{}"));

  expect(response.status).toBe(400);
  expect(databaseMocks.insert).not.toHaveBeenCalled();
});

it("rejects a declared oversized body without reading or inserting", async () => {
  const body = "{}";
  const response = await handleWebhook(
    createStreamingRequest([], {
      ...authenticatedHeaders(body),
      "content-length": String(MAX_BODY_BYTES + 1),
    })
  );

  expect(response.status).toBe(413);
  expect(databaseMocks.insert).not.toHaveBeenCalled();
});

it("rejects a streamed oversized body without inserting", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX_BODY_BYTES));
      controller.enqueue(new Uint8Array([1]));
      controller.close();
    },
  });
  const response = await handleWebhook(
    createRequest(stream, {
      "x-patreon-event": "unhandled:event",
      "x-patreon-signature": "unused",
    })
  );

  expect(response.status).toBe(413);
  expect(databaseMocks.insert).not.toHaveBeenCalled();
});

it("rejects an invalid signature without inserting", async () => {
  const response = await handleWebhook(
    createRequest("{}", {
      "x-patreon-event": "unhandled:event",
      "x-patreon-signature": "invalid",
    })
  );

  expect(response.status).toBe(401);
  expect(databaseMocks.insert).not.toHaveBeenCalled();
});

it("stores and ignores a valid unhandled event", async () => {
  const body = "{}";
  const response = await handleWebhook(
    createRequest(body, authenticatedHeaders(body))
  );

  expect(response.status).toBe(200);
  expect(await response.text()).toBe("OK");
  expect(databaseMocks.insert).toHaveBeenCalledOnce();
  expect(databaseMocks.updateSet).toHaveBeenCalledWith(
    expect.objectContaining({
      processingStatus: "ignored",
      responseStatus: 200,
    })
  );
});

it("stores only allowlisted metadata and a path-only URL", async () => {
  const body = "{}";
  const signature = signatureFor(body);
  await handleWebhook(
    createStreamingRequest([new TextEncoder().encode(body)], {
      authorization: "secret",
      cookie: "session=secret",
      "content-length": "2",
      "content-type": "application/json",
      "user-agent": "plan-005-test",
      "x-patreon-event": "unhandled:event",
      "x-patreon-signature": signature,
    })
  );

  expect(databaseMocks.insertValues).toHaveBeenCalledWith({
    body,
    event: "unhandled:event",
    headers: {
      "content-length": "2",
      "content-type": "application/json",
      "user-agent": "plan-005-test",
    },
    method: "POST",
    signature,
    url: "/api/patreon/webhook",
  });
});

it("stores signed malformed JSON before marking it invalid", async () => {
  const body = "{";
  const response = await handleWebhook(
    createRequest(body, authenticatedHeaders(body))
  );

  expect(response.status).toBe(400);
  expect(databaseMocks.insert).toHaveBeenCalledOnce();
  expect(databaseMocks.updateSet).toHaveBeenCalledWith(
    expect.objectContaining({
      processingStatus: "invalid",
      responseStatus: 400,
    })
  );
});

it("verifies a UTF-8 body split across stream chunks", async () => {
  const body = '{"message":"hello 😀"}';
  const bytes = new TextEncoder().encode(body);
  const emojiStart = bytes.indexOf(0xf0);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.slice(0, emojiStart + 2));
      controller.enqueue(bytes.slice(emojiStart + 2));
      controller.close();
    },
  });
  const response = await handleWebhook(
    createRequest(stream, authenticatedHeaders(body))
  );

  expect(response.status).toBe(200);
  expect(databaseMocks.insertValues).toHaveBeenCalledWith(
    expect.objectContaining({ body })
  );
});

it("commits membership and succeeds when the retryable stipend settlement fails", async () => {
  databaseMocks.accountFindFirst.mockResolvedValue({ userId: "user-1" });
  databaseMocks.patronFindFirst.mockResolvedValue(null);
  stipendMocks.grant.mockRejectedValue(new Error("wallet mismatch"));
  const body = JSON.stringify({
    data: {
      attributes: {
        currently_entitled_amount_cents: 500,
        patron_status: "active_patron",
        pledge_relationship_start: "2026-08-01T00:00:00.000Z",
      },
      id: "member-1",
      relationships: {
        campaign: { data: { id: "test-campaign", type: "campaign" } },
        currently_entitled_tiers: { data: [] },
        user: { data: { id: "patreon-user-1", type: "user" } },
      },
      type: "member",
    },
  });

  const response = await handleWebhook(
    createRequest(
      body,
      authenticatedHeaders(body, {
        "x-patreon-event": "members:pledge:update",
      })
    )
  );

  expect(response.status).toBe(200);
  expect(stipendMocks.grant).toHaveBeenCalledWith(expect.anything(), "user-1");
  expect(databaseMocks.updateSet).toHaveBeenCalledWith(
    expect.objectContaining({
      processingStatus: "processed",
      responseStatus: 200,
    })
  );
});
