import { handleWebhook } from "@/lib/patreon-webhook";

export async function POST(request: Request) {
  return await handleWebhook(request);
}
