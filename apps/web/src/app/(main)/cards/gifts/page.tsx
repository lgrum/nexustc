import { auth } from "@repo/auth";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import GiftsClient from "./gifts-client";

export const metadata: Metadata = {
  description: "Envía y acepta regalos gratuitos de cartas y Packs.",
  title: "Regalos | NeXusTC",
};

export default async function GiftsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/auth");
  }

  return <GiftsClient />;
}
