import { expect, it, vi } from "vitest";

import { handleWebhook } from "@/lib/patreon-webhook";

import { POST } from "./route";

vi.mock("@/lib/patreon-webhook", () => ({
  handleWebhook: vi.fn(),
}));

it("returns webhook failures to Patreon", async () => {
  const handlerResponse = new Response("Invalid signature", { status: 401 });
  vi.mocked(handleWebhook).mockResolvedValue(handlerResponse);

  const response = await POST(new Request("https://example.com/webhook"));

  expect(response).toBe(handlerResponse);
  expect(response.status).toBe(401);
});
