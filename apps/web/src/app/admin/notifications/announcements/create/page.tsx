import type { Metadata } from "next";

import { ClientPage } from "./client-page";

export const metadata: Metadata = {
  title: "NeXusTC - Crear anuncio global",
};

export default function Page() {
  return <ClientPage />;
}
