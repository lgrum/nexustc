import { createEnv } from "@t3-oss/env-core";
import z from "zod";

export const env = createEnv({
  emptyStringAsUndefined: true,

  runtimeEnv: process.env,

  server: {
    BETTER_AUTH_SECRET: z.string(),
    BETTER_AUTH_URL: z.url(),
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
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
