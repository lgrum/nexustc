import { restoreExpiredTemporaryBanRewards } from "@repo/api/services/user-administration";
import { db } from "@repo/db";
import { env } from "@repo/env";
import { revalidateTag } from "next/cache";

function revalidateAffectedProfiles(userIds: unknown[]) {
  let hasAffectedProfile = false;
  for (const userId of userIds) {
    if (typeof userId === "string") {
      hasAffectedProfile = true;
      revalidateTag(`profile:${userId}`, "max");
    }
  }
  if (hasAffectedProfile) {
    revalidateTag("profiles", "max");
  }
}

export async function GET(request: Request) {
  if (
    !env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`
  ) {
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
      revalidateAffectedProfiles(error.profileUserIds);
    }
    throw error;
  }
  revalidateAffectedProfiles(result.profileUserIds);
  return Response.json(result);
}
