import { createORPCClient, createSafeClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { appRouter } from "@repo/api/routers/index";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { getClientErrorMessage } from "./client-error";

const DEFAULT_QUERY_STALE_TIME_MS = 30_000;
export type ORPCClientContext = {
  cache?: boolean;
};
type AppRouterClient = RouterClient<typeof appRouter, ORPCClientContext>;

export { getClientErrorMessage } from "./client-error";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        enabled: typeof window !== "undefined",
        refetchOnMount: true,
        refetchOnReconnect: false,
        refetchOnWindowFocus: false,
        staleTime: DEFAULT_QUERY_STALE_TIME_MS,
        retry: 1,
        retryDelay: 1000,
      },
    },
    queryCache: new QueryCache({
      onError: (error, query) => {
        toast.error(getClientErrorMessage(error), {
          action: {
            label: "retry",
            onClick: query.invalidate,
          },
        });
      },
    }),
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (typeof window === "undefined") {
    return createQueryClient();
  }

  browserQueryClient ??= createQueryClient();
  return browserQueryClient;
}

export const queryClient = getQueryClient();

function getORPCClient(): AppRouterClient {
  if (globalThis.$client) {
    return globalThis.$client;
  }

  /**
   * Fallback to client-side client if server-side client is not available.
   */

  const link = new RPCLink({
    fetch(_url, options) {
      return fetch(_url, {
        ...options,
        credentials: "include",
      });
    },
    url: () => {
      if (typeof window === "undefined") {
        throw new TypeError("RPCLink is not allowed on the server side.");
      }

      return `${process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/api/rpc`;
    },
  });

  return createORPCClient(link);
}

export const orpcClient = getORPCClient();
export const safeOrpcClient = createSafeClient(getORPCClient());

export const orpc = createTanstackQueryUtils(orpcClient);
export const safeOrpc = createTanstackQueryUtils(safeOrpcClient);
