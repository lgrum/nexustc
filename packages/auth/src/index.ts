import { db } from "@repo/db";
import { env } from "@repo/env";
import { ConfirmEmail } from "@repo/transactional/emails/confirm-email";
import { ResetPassword } from "@repo/transactional/emails/reset-password";
import { betterAuth } from "better-auth";
import { emailHarmony } from "better-auth-harmony";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
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
