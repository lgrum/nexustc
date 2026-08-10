import { restoreExpiredTemporaryBanRewards } from "@repo/api/services/user-administration";
import { db } from "@repo/db";
import { env } from "@repo/env";
import { revalidateTag } from "next/cache";

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  let result;
  try {
    result = await restoreExpiredTemporaryBanRewards(db);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "profileUserIds" in error &&
      Array.isArray(error.profileUserIds)
    ) {
      for (const userId of error.profileUserIds) {
        if (typeof userId === "string") {
          revalidateTag(`profile:${userId}`, "max");
        }
      }
    }
    throw error;
  }
  for (const userId of result.profileUserIds) {
    revalidateTag(`profile:${userId}`, "max");
  }
  return Response.json(result);
}
