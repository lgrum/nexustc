import type { Metadata } from "next";

import { ClientPage } from "./client-page";

export const metadata: Metadata = {
  title: "NeXusTC - Anuncios globales",
};

export default function Page() {
  return <ClientPage />;
}
