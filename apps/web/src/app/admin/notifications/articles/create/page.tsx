import type { Metadata } from "next";

import { ClientPage } from "./client-page";

export const metadata: Metadata = {
  title: "NeXusTC - Crear articulo manual",
};

export default function Page() {
  return <ClientPage />;
}
