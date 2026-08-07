import { orpcClient } from "@/lib/orpc";

import { ProgressionIntegrityClient } from "./progression-integrity-client";

export default async function ProgressionIntegrityPage() {
  const initialCases = await orpcClient.progression.admin.listCases({
    limit: 50,
    status: "open",
  });
  return <ProgressionIntegrityClient initialCases={initialCases} />;
}
