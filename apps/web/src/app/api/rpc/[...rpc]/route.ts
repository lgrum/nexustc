import { LoggingHandlerPlugin } from "@orpc/experimental-pino";
import { onError } from "@orpc/server";
import { BodyLimitPlugin, RPCHandler } from "@orpc/server/fetch";
import { SimpleCsrfProtectionHandlerPlugin } from "@orpc/server/plugins";
import { createContext } from "@repo/api/context";
import { appRouter } from "@repo/api/routers/index";
import { ensureIntegrityDeviceCookie } from "@repo/api/utils/integrity-evidence";
import { ADMIN_RPC_BODY_MAX_BYTES } from "@repo/shared/media";
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
    new BodyLimitPlugin({ maxBodySize: ADMIN_RPC_BODY_MAX_BYTES }),
  ],
});

async function handle(request: Request) {
  const { deviceId, setCookie } = ensureIntegrityDeviceCookie(request.headers);
  const headers = new Headers(request.headers);
  if (setCookie) {
    const cookie = headers.get("cookie");
    headers.set(
      "cookie",
      `${cookie ? `${cookie}; ` : ""}ntc_device=${deviceId}`
    );
  }
  const context = await createContext(headers);
  const rpcResult = await rpcHandler.handle(new Request(request, { headers }), {
    context,
    prefix: "/api/rpc",
  });
  if (rpcResult.response) {
    if (rpcResult.response.ok) {
      const procedurePath = new URL(request.url).pathname.replace(
        /^\/api\/rpc\//,
        ""
      );
      const responseBody = [
        "comicProgress/update",
        "post/toggleCommentLike",
        "rating/toggleReviewLike",
      ].includes(procedurePath)
        ? await rpcResult.response.clone().json()
        : undefined;
      for (const tag of getCacheTagsForProcedure(procedurePath, {
        responseBody,
        userId: context.session?.user.id,
      })) {
        revalidateTag(tag, getCacheRevalidationProfile(procedurePath));
      }
    }

    if (!setCookie) {
      return rpcResult.response;
    }
    const response = new Response(rpcResult.response.body, rpcResult.response);
    response.headers.append("set-cookie", setCookie);
    return response;
  }

  return new Response("Not found", { status: 404 });
}

export const POST = handle;
