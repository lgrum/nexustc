import { getDailyEconomyReport } from "@repo/api/services/economy-report";
import { db } from "@repo/db";
import { env } from "@repo/env";

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  return Response.json(await getDailyEconomyReport(db));
}
