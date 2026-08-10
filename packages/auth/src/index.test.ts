import { expect, test, vi } from "vitest";

import { auth } from "./index";

const mocks = vi.hoisted(() => ({
  closeAccountAndDeleteUser: vi.fn(),
}));

vi.mock("@repo/db", () => ({ db: { marker: "db" } }));
vi.mock("@repo/env", () => ({
  env: {
    BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
    BETTER_AUTH_URL: "https://example.test",
    PATREON_CAMPAIGN_ID: "campaign",
    PATREON_CLIENT_ID: "client",
    PATREON_CLIENT_SECRET: "secret",
    RESEND_API_KEY: "re_test",
    TURNSTILE_SECRET_KEY: "turnstile",
  },
}));
vi.mock("better-auth", () => ({
  APIError: class extends Error {},
  betterAuth: vi.fn((options) => ({ options })),
}));
vi.mock("better-auth-harmony", () => ({
  emailHarmony: vi.fn(() => ({ id: "email-harmony" })),
}));
vi.mock("better-auth-harmony/email", () => ({ validateEmail: vi.fn() }));
vi.mock("better-auth/adapters/drizzle", () => ({
  drizzleAdapter: vi.fn(() => ({})),
}));
vi.mock("better-auth/api", () => ({
  createAuthMiddleware: vi.fn((handler) => handler),
}));
vi.mock("better-auth/next-js", () => ({
  nextCookies: vi.fn(() => ({ id: "next-cookies" })),
}));
vi.mock("better-auth/plugins/two-factor", () => ({
  twoFactor: vi.fn(() => ({ id: "two-factor" })),
}));
vi.mock("@repo/transactional/emails/confirm-email", () => ({
  ConfirmEmail: vi.fn(),
}));
vi.mock("@repo/transactional/emails/reset-password", () => ({
  ResetPassword: vi.fn(),
}));
vi.mock("@repo/transactional/emails/two-factor-code", () => ({
  TwoFactorCode: vi.fn(),
}));
vi.mock("./account-closure", () => ({
  closeAccountAndDeleteUser: mocks.closeAccountAndDeleteUser,
}));
vi.mock("./email", () => ({ resend: {} }));
vi.mock("./patreon-sync", () => ({
  deactivatePatreonMembershipAfterAccountDelete: vi.fn(),
  syncPatreonMembership: vi.fn(),
}));
vi.mock("./plugins/admin", () => ({ adminPlugin: vi.fn(() => ({})) }));
vi.mock("./plugins/patreon", () => ({ patreonPlugin: vi.fn(() => ({})) }));
vi.mock("./plugins/turnstile", () => ({
  turnstilePlugin: vi.fn(() => ({})),
}));
vi.mock("./two-factor-delivery", () => ({
  consumeTwoFactorOtpDeliveryFailure: vi.fn(),
  markTwoFactorOtpDeliveryFailed: vi.fn(),
}));

test("the database user-delete hook closes the account with identity deletion", async () => {
  const beforeDelete = (
    auth as unknown as {
      options: {
        databaseHooks: {
          user: { delete: { before: (user: { id: string }) => Promise<void> } };
        };
      };
    }
  ).options.databaseHooks.user.delete.before;

  await beforeDelete({ id: "user-1" });

  expect(mocks.closeAccountAndDeleteUser).toHaveBeenCalledWith(
    { marker: "db" },
    "user-1"
  );
});
