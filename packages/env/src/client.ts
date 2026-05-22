import { createEnv } from "@t3-oss/env-core";
import z from "zod";

const httpUrlSchema = z.url({ protocol: /^https?$/ });

export const env = createEnv({
  client: {
    VITE_ASSETS_BUCKET_URL: httpUrlSchema,
    VITE_TURNSTILE_SITE_KEY: z.string(),
  },

  clientPrefix: "VITE_",

  // oxlint-disable-next-line typescript/no-explicit-any: import.meta has no env property on this package
  runtimeEnv: (import.meta as any).env,

  emptyStringAsUndefined: true,
});
