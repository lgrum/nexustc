import { auth } from "@repo/auth";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import GiftListClient from "../gift-list-client";

export const metadata: Metadata = {
  description: "Regalos que enviaste.",
  title: "Regalos enviados | NeXusTC",
};

export default async function GiftSentPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/auth");
  }

  return <GiftListClient mode="sent" />;
}
