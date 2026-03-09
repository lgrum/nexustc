import { db } from "@repo/db";
import { env } from "@repo/env";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { resend } from "./email";
import { syncPatreonMembership } from "./patreon-sync";
import { adminPlugin } from "./plugins/admin";
import { patreonPlugin } from "./plugins/patreon";
import { turnstilePlugin } from "./plugins/turnstile";

export const auth = betterAuth({
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
        to: user.email,
        subject: "Restablece tu contraseña",
        html: `<p>Haz click <a href="${url}">aquí</a> para restablecer tu contraseña</p>`,
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
        to: user.email,
        template: { id: "confirm-email", variables: { VERIFICATION_URL: url } },
      });
    },
  },

  account: {
    accountLinking: {
      enabled: true,
      allowDifferentEmails: true,
    },
  },

  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60,
    },
  },

  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "user",
        input: false,
      },
      avatarFallbackColor: {
        type: "string",
        required: false,
        defaultValue: "#f59e0b",
        input: false,
      },
    },
  },

  plugins: [
    adminPlugin(),
    patreonPlugin(),
    turnstilePlugin(),
    tanstackStartCookies(), // this must be the last plugin in the array
  ],

  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  advanced: {
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
      httpOnly: true,
    },
  },
  experimental: {
    joins: true,
  },
});
