import type { Metadata } from "next";

import { ClientPage } from "./client-page";

export const metadata: Metadata = {
  title: "NeXusTC - Articulos manuales",
};

export default function Page() {
  return <ClientPage />;
}
