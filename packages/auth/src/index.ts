import { db } from "@repo/db";
import { env } from "@repo/env";
import { ALLOWED_EMAIL_DOMAINS } from "@repo/shared/constants";
import { ConfirmEmail } from "@repo/transactional/emails/confirm-email";
import { ResetPassword } from "@repo/transactional/emails/reset-password";
import { APIError, betterAuth } from "better-auth";
import { emailHarmony } from "better-auth-harmony";
import { validateEmail } from "better-auth-harmony/email";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { resend } from "./email";
import { syncPatreonMembership } from "./patreon-sync";
import { adminPlugin } from "./plugins/admin";
import { patreonPlugin } from "./plugins/patreon";
import { turnstilePlugin } from "./plugins/turnstile";

type NewsletterOptInUser = {
  email: string;
  id: string;
  name?: string | null;
  newsletterOptIn?: boolean | null;
};

const subscribeVerifiedNewsletterContact = async (
  user: NewsletterOptInUser
) => {
  if (!user.newsletterOptIn) {
    return;
  }

  const contact = {
    email: user.email,
    firstName: user.name ?? undefined,
    properties: {
      source: "registration",
      userId: user.id,
    },
    unsubscribed: false,
  };

  const { error } = await resend.contacts.create(contact);

  if (!error) {
    return;
  }

  if (error.name === "validation_error") {
    const { error: updateError } = await resend.contacts.update({
      ...contact,
      email: user.email,
    });

    if (!updateError) {
      return;
    }

    console.error("Failed to update Resend newsletter contact", updateError);
    return;
  }

  console.error("Failed to create Resend newsletter contact", error);
};

export const auth = betterAuth({
  account: {
    accountLinking: {
      allowDifferentEmails: true,
      enabled: true,
      trustedProviders: ["email-password", "patreon"],
    },
  },
  advanced: {
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "none",
      secure: true,
    },
  },

  baseURL: {
    allowedHosts: ["nexustc18.com", "*.nexustc18.com"],
    protocol: "https",
    fallback: env.BETTER_AUTH_URL,
  },

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
        subject: "Reestablece tu contraseña",
        react: ResetPassword({ resetUrl: url }),
      });
    },
  },

  emailVerification: {
    afterEmailVerification: subscribeVerifiedNewsletterContact,
    autoSignInAfterVerification: true,
    sendOnSignIn: true,
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      await resend.emails.send({
        from: "NeXusTC <noreply@accounts.nexustc18.com>",
        to: user.email,
        subject: "Confirma tu correo electrónico",
        react: ConfirmEmail({ verificationUrl: url }),
      });
    },
  },

  experimental: {
    joins: true,
  },

  hooks: {
    // oxlint-disable-next-line require-await
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") {
        return;
      }

      const len = ctx.body?.name.length;

      if (len < 3) {
        throw new APIError("BAD_REQUEST", {
          message: "Name must be at least 3 characters long",
        });
      }

      if (len > 16) {
        throw new APIError("BAD_REQUEST", {
          message: "Name must be at most 16 characters long",
        });
      }
    }),
  },

  plugins: [
    adminPlugin(),
    // username({
    //   displayUsernameValidator: (displayUsername) =>
    //     displayUsername.length >= 5 &&
    //     displayUsername.length <= 16 &&
    //     /^[a-zA-Z0-9_-]+$/.test(displayUsername),
    //   minUsernameLength: 5,
    //   maxUsernameLength: 16,
    //   usernameValidator: (name) => /^[a-z]+$/.test(name),
    // }),
    patreonPlugin(),
    turnstilePlugin(),
    emailHarmony({
      validator: (email) => {
        if (!validateEmail(email)) {
          return false;
        }

        const domain = email.split("@")[1] ?? "";

        if (!domain) {
          return false;
        }

        if (!ALLOWED_EMAIL_DOMAINS.has(domain)) {
          return false;
        }

        return true;
      },
    }),
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
      newsletterOptIn: {
        defaultValue: false,
        input: true,
        required: false,
        returned: false,
        type: "boolean",
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
