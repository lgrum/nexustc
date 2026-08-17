import type { Metadata } from "next";

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
  const { id } = await params;
  return <OpeningClient packInstanceId={id} />;
}
