import { auth } from "@repo/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { orpcClient } from "@/lib/orpc";

import { ClientPage } from "./client-page";

export default async function Page() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });

  if (session?.user.role !== "owner") {
    redirect("/admin");
  }

  const data = await orpcClient.siteConfig.getMarqueeForEdit();

  return <ClientPage items={data.items} />;
}
