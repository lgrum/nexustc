import { getDailyEconomyReport } from "@repo/api/services/economy-report";
import { db } from "@repo/db";
import { env } from "@repo/env";

export async function GET(request: Request) {
  if (
    !env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const generatedAt = new Date();
  const completedUtcDay = new Date(generatedAt.getTime() - 86_400_000);
  return Response.json(
    await getDailyEconomyReport(db, completedUtcDay, generatedAt)
  );
}
