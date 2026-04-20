import { db } from "@repo/db";
import { env } from "@repo/env";
import { betterAuth } from "better-auth";
import { emailHarmony } from "better-auth-harmony";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { resend } from "./email";
import { syncPatreonMembership } from "./patreon-sync";
import { adminPlugin } from "./plugins/admin";
import { patreonPlugin } from "./plugins/patreon";
import { turnstilePlugin } from "./plugins/turnstile";

export const auth = betterAuth({
  account: {
    accountLinking: {
      allowDifferentEmails: true,
      enabled: true,
    },
  },
  advanced: {
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "none",
      secure: true,
    },
  },

  baseURL: env.BETTER_AUTH_URL,

  database: drizzleAdapter(db, {
    provider: "pg",
  }),

  databaseHooks: {
    account: {
      create: {
        after: async (account) => {
          // Sync Patreon membership after account is linked
          if (account.providerId === "patreon" && account.accessToken) {
            await syncPatreonMembership(
              account.userId,
              account.accountId,
              account.accessToken
            );
          }
        },
      },
    },
  },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await resend.emails.send({
        from: "NeXusTC <noreply@accounts.nexustc18.com>",
        html: `<p>Haz click <a href="${url}">aquí</a> para restablecer tu contraseña</p>`,
        subject: "Restablece tu contraseña",
        to: user.email,
      });
    },
  },

  emailVerification: {
    autoSignInAfterVerification: true,
    sendOnSignIn: true,
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      await resend.emails.send({
        from: "NeXusTC <noreply@accounts.nexustc18.com>",
        template: { id: "confirm-email", variables: { VERIFICATION_URL: url } },
        to: user.email,
      });
    },
  },

  experimental: {
    joins: true,
  },

  plugins: [
    adminPlugin(),
    patreonPlugin(),
    turnstilePlugin(),
    emailHarmony(),
    tanstackStartCookies(), // this must be the last plugin in the array
  ],
  secret: env.BETTER_AUTH_SECRET,
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60,
    },
  },
  user: {
    additionalFields: {
      avatarFallbackColor: {
        defaultValue: "#f59e0b",
        input: false,
        required: false,
        type: "string",
      },
      role: {
        defaultValue: "user",
        input: false,
        required: true,
        type: "string",
      },
    },
  },
});
