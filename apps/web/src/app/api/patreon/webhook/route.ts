import { revalidateTag } from "next/cache";

import { handleWebhook } from "@/lib/patreon-webhook";

export async function POST(request: Request) {
  const response = await handleWebhook(request);
  if (response.ok) {
    revalidateTag("profiles", "max");
  }
  return response;
}
