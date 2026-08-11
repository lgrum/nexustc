import { beforeEach, expect, it, vi } from "vitest";

import { verifyTurnstileToken } from "./turnstile";

const testEnv = vi.hoisted(() => ({
  BETTER_AUTH_URL: "https://nexustc.example",
  TURNSTILE_SECRET_KEY: "secret",
}));

vi.mock("@repo/env", () => ({ env: testEnv }));

beforeEach(() => {
  vi.restoreAllMocks();
});

it("accepts only the configured hostname and expected action", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      action: "streak_step_up",
      hostname: "nexustc.example",
      success: true,
    })
  );

  await expect(
    verifyTurnstileToken("token", {
      action: "streak_step_up",
      remoteIp: "203.0.113.1",
    })
  ).resolves.toBe("pass");
  expect(fetch).toHaveBeenCalledWith(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    expect.objectContaining({ method: "POST" })
  );
});

it.each([
  { action: "login", hostname: "nexustc.example", success: true },
  { action: "streak_step_up", hostname: "evil.example", success: true },
  { action: "streak_step_up", hostname: "nexustc.example", success: false },
])("rejects an invalid provider response", async (response) => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(response));
  await expect(
    verifyTurnstileToken("token", { action: "streak_step_up" })
  ).resolves.toBe("fail");
});

it("fails closed when the provider is unavailable", async () => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
  await expect(
    verifyTurnstileToken("token", { action: "streak_step_up" })
  ).resolves.toBe("error");
});

it("reports a provider HTTP outage separately from token rejection", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(null, { status: 503 })
  );
  await expect(
    verifyTurnstileToken("token", { action: "streak_step_up" })
  ).resolves.toBe("error");
});

it.each([{}, { success: "yes" }, { success: true }])(
  "reports a malformed provider object as an error",
  async (response) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(response));
    await expect(
      verifyTurnstileToken("token", { action: "streak_step_up" })
    ).resolves.toBe("error");
  }
);
