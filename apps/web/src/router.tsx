import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import { orpc, queryClient } from "@/lib/orpc";

import { LoadingSpinner } from "./components/loading-spinner";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const router = createRouter({
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
    context: { orpc, queryClient },
    defaultNotFoundComponent: () => <div>404 - Not Found</div>,
    defaultPendingComponent: () => <LoadingSpinner />,
    defaultPreload: "intent",
    routeTree,
    scrollRestoration: true,
  });

  setupRouterSsrQueryIntegration({
    queryClient,
    router,
  });

  return router;
};

declare module "@tanstack/react-router" {
  // oxlint-disable-next-line typescript/consistent-type-definitions: interface is needed for type extending
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
