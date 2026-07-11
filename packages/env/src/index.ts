import { createEnv } from "@t3-oss/env-nextjs";
import z from "zod";

const httpUrlSchema = z.url({ protocol: /^https?$/ });

export const env = createEnv({
  client: {
    NEXT_PUBLIC_ADBLOCK_DETECTION_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    NEXT_PUBLIC_ASSETS_BUCKET_URL: httpUrlSchema,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string(),
  },

  server: {
    BETTER_AUTH_SECRET: z.string(),
    BETTER_AUTH_URL: httpUrlSchema,
    CLOUDFLARE_ACCOUNT_ID: z.string(),
    DATABASE_URL: z.string(),
    EXE_TOKEN: z.string(),
    PATREON_CAMPAIGN_ID: z.string(),
    PATREON_CLIENT_ID: z.string(),
    PATREON_CLIENT_SECRET: z.string(),
    PATREON_WEBHOOK_SECRET: z.string(),
    R2_ACCESS_KEY_ID: z.string(),
    R2_ASSETS_BUCKET_NAME: z.string(),
    R2_SECRET_ACCESS_KEY: z.string(),
    REDIS_URL: z.string(),
    RESEND_API_KEY: z.string(),
    SHRINKEARN_TOKEN: z.string(),
    SHRINKME_TOKEN: z.string(),
    TURNSTILE_SECRET_KEY: z.string(),
  },
  runtimeEnv: {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
    DATABASE_URL: process.env.DATABASE_URL,
    EXE_TOKEN: process.env.EXE_TOKEN,
    NEXT_PUBLIC_ADBLOCK_DETECTION_ENABLED:
      process.env.NEXT_PUBLIC_ADBLOCK_DETECTION_ENABLED,
    NEXT_PUBLIC_ASSETS_BUCKET_URL: process.env.NEXT_PUBLIC_ASSETS_BUCKET_URL,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    PATREON_CAMPAIGN_ID: process.env.PATREON_CAMPAIGN_ID,
    PATREON_CLIENT_ID: process.env.PATREON_CLIENT_ID,
    PATREON_CLIENT_SECRET: process.env.PATREON_CLIENT_SECRET,
    PATREON_WEBHOOK_SECRET: process.env.PATREON_WEBHOOK_SECRET,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_ASSETS_BUCKET_NAME: process.env.R2_ASSETS_BUCKET_NAME,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    REDIS_URL: process.env.REDIS_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    SHRINKEARN_TOKEN: process.env.SHRINKEARN_TOKEN,
    SHRINKME_TOKEN: process.env.SHRINKME_TOKEN,
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
  },

  emptyStringAsUndefined: true,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
