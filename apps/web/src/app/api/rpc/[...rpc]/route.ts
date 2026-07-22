import { LoggingHandlerPlugin } from "@orpc/experimental-pino";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { SimpleCsrfProtectionHandlerPlugin } from "@orpc/server/plugins";
import { createContext } from "@repo/api/context";
import { appRouter } from "@repo/api/routers/index";
import { revalidateTag } from "next/cache";

import {
  getCacheRevalidationProfile,
  getCacheTagsForProcedure,
} from "./cache-tags";

const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
  plugins: [
    new LoggingHandlerPlugin(),
    new SimpleCsrfProtectionHandlerPlugin(),
  ],
});

async function handle(request: Request) {
  const rpcResult = await rpcHandler.handle(request, {
    context: await createContext(request.headers),
    prefix: "/api/rpc",
  });
  if (rpcResult.response) {
    if (rpcResult.response.ok) {
      const procedurePath = new URL(request.url).pathname.replace(
        /^\/api\/rpc\//,
        ""
      );
      for (const tag of getCacheTagsForProcedure(procedurePath)) {
        revalidateTag(tag, getCacheRevalidationProfile(procedurePath));
      }
    }

    return rpcResult.response;
  }

  return new Response("Not found", { status: 404 });
}

export const POST = handle;
