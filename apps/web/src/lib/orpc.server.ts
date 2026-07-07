import "server-only";
import type { RouterClient } from "@orpc/server";
import { createRouterClient } from "@orpc/server";
import { createContext, createPublicContext } from "@repo/api/context";
import { appRouter } from "@repo/api/routers/index";
import { headers } from "next/headers";

import type { ORPCClientContext } from "./orpc";

declare global {
  var $client: RouterClient<typeof appRouter, ORPCClientContext> | undefined;
}

globalThis.$client = createRouterClient(appRouter, {
  /**
   * Provide initial context if needed.
   *
   * Because this client instance is shared across all requests,
   * only include context that's safe to reuse globally.
   * For per-request context, use middleware context or pass a function as the initial context.
   */
  context: async ({ cache }) =>
    cache ? createPublicContext() : await createContext(await headers()),
});
