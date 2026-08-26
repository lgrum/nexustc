import { auth } from "@repo/auth";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import OpeningClient from "./opening-client";

export const metadata: Metadata = {
  description:
    "Abre tu Pack de forma segura y recupera siempre el resultado confirmado.",
  title: "Abrir Pack | NeXusTC",
};

export default async function PackOpeningPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/auth");
  }

  const { id } = await params;
  return <OpeningClient packInstanceId={id} />;
}
