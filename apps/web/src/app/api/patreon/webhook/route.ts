import { handleWebhook } from "@/lib/patreon-webhook";

export async function POST(request: Request) {
  try {
    await handleWebhook(request);
  } catch (error) {
    console.error("Unexpected error handling Patreon webhook:", error);
  }
  return new Response("OK", { status: 200 });
}
