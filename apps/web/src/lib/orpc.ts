import { createORPCClient, createSafeClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createRouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { createContext } from "@repo/api/context";
import { appRouter } from "@repo/api/routers/index";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { toast } from "sonner";

const DEFAULT_QUERY_STALE_TIME_MS = 30_000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
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
      toast.error(`Error: ${error.message}`, {
        action: {
          label: "retry",
          onClick: query.invalidate,
        },
      });
    },
  }),
});

const getORPCClient = createIsomorphicFn()
  .server(() =>
    createRouterClient(appRouter, {
      context: () => createContext(getRequestHeaders()),
    })
  )
  .client((): RouterClient<typeof appRouter> => {
    const link = new RPCLink({
      fetch(_url, options) {
        return fetch(_url, {
          ...options,
          credentials: "include",
        });
      },
      url: `${window.location.origin}/api/rpc`,
    });

    return createORPCClient(link);
  });

export const orpcClient: RouterClient<typeof appRouter> = getORPCClient();
export const safeOrpcClient = createSafeClient(getORPCClient());

export const orpc = createTanstackQueryUtils(orpcClient);
export const safeOrpc = createTanstackQueryUtils(safeOrpcClient);
