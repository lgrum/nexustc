import { auth } from "@repo/auth";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import GiftListClient from "../gift-list-client";

export const metadata: Metadata = {
  description: "Regalos pendientes que recibiste.",
  title: "Regalos recibidos | NeXusTC",
};

export default async function GiftInboxPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/auth");
  }

  return <GiftListClient mode="inbox" />;
}
