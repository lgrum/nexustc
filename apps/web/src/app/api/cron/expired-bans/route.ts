import { restoreExpiredTemporaryBanRewards } from "@repo/api/services/user-administration";
import { db } from "@repo/db";
import { env } from "@repo/env";
import { revalidateTag } from "next/cache";

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await restoreExpiredTemporaryBanRewards(db);
  for (const userId of result.profileUserIds) {
    revalidateTag(`profile:${userId}`, "max");
  }
  return Response.json(result);
}
