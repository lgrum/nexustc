import { LoggingHandlerPlugin } from "@orpc/experimental-pino";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { createContext } from "@repo/api/context";
import { appRouter } from "@repo/api/routers/index";
import { revalidateTag } from "next/cache";

const cacheTagsByMutation = new Map<string, readonly string[]>([
  ["comic/admin/create", ["catalog:comics", "content", "home", "vip-feed"]],
  ["comic/admin/delete", ["catalog:comics", "content", "home", "vip-feed"]],
  ["comic/admin/edit", ["catalog:comics", "content", "home", "vip-feed"]],
  ["chronos/update", ["chronos"]],
  ["engagementQuestion/create", ["content"]],
  ["engagementQuestion/delete", ["content"]],
  ["engagementQuestion/edit", ["content"]],
  ["extras/createTutorial", ["tutorials"]],
  ["extras/deleteTutorial", ["tutorials"]],
  ["notification/admin/archive", ["news"]],
  ["notification/admin/createNewsArticle", ["news"]],
  ["post/admin/create", ["catalog:games", "content", "home", "vip-feed"]],
  ["post/admin/delete", ["catalog:games", "content", "home", "vip-feed"]],
  ["post/admin/edit", ["catalog:games", "content", "home", "vip-feed"]],
  ["post/admin/uploadFeaturedPosts", ["home"]],
  ["post/admin/uploadWeeklyPosts", ["home"]],
  ["profile/finalizeUpload", ["profiles"]],
  ["profile/removeAvatar", ["profiles"]],
  ["profile/removeBanner", ["profiles"]],
  ["profile/updateAppearance", ["profiles"]],
  ["profileAdmin/assignments/setUserAssignments", ["profiles"]],
  ["profileAdmin/emblems/create", ["profiles"]],
  ["profileAdmin/emblems/delete", ["profiles"]],
  ["profileAdmin/emblems/update", ["profiles"]],
  ["profileAdmin/roles/create", ["profiles"]],
  ["profileAdmin/roles/delete", ["profiles"]],
  ["profileAdmin/roles/update", ["profiles"]],
  ["siteConfig/updateMarquee", ["site-config"]],
  ["staticPage/update", ["static-pages"]],
  ["term/create", ["catalog:comics", "catalog:games", "content", "home"]],
  ["term/delete", ["catalog:comics", "catalog:games", "content", "home"]],
  ["term/edit", ["catalog:comics", "catalog:games", "content", "home"]],
]);

const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
  plugins: [new LoggingHandlerPlugin()],
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
      for (const tag of cacheTagsByMutation.get(procedurePath) ?? []) {
        revalidateTag(tag, "max");
      }
    }

    return rpcResult.response;
  }

  return new Response("Not found", { status: 404 });
}

export const DELETE = handle;
export const GET = handle;
export const HEAD = handle;
export const PATCH = handle;
export const POST = handle;
export const PUT = handle;
