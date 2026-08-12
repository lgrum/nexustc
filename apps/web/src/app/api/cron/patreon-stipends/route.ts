import { grantMonthlyPatreonStipends } from "@repo/api/services/patreon-stipend";
import { db } from "@repo/db";
import { env } from "@repo/env";
import { revalidateTag } from "next/cache";

export async function GET(request: Request) {
  if (
    !env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  let result: Awaited<ReturnType<typeof grantMonthlyPatreonStipends>>;
  try {
    result = await grantMonthlyPatreonStipends(db);
  } catch (error) {
    if (
      error instanceof AggregateError &&
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
