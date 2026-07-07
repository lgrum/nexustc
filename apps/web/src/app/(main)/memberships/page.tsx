import type { Metadata } from "next";

import { createPageMetadata } from "../../seo";
import { MembershipsClient } from "./memberships-client";

export const metadata: Metadata = createPageMetadata({
  description: "Beneficios, niveles y acceso premium de NeXusTC.",
  path: "/memberships",
  title: "Membresías",
});

export default function Page() {
  return <MembershipsClient />;
}
