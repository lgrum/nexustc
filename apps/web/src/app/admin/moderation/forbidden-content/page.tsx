import { orpcClient } from "@/lib/orpc";

import { ForbiddenContentClient } from "./forbidden-content-client";

export default async function ForbiddenContentPage() {
  const initialRules = await orpcClient.moderation.listForbiddenContentRules();

  return <ForbiddenContentClient initialRules={initialRules} />;
}
