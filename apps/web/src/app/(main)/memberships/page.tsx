import type { Metadata } from "next";

import { MembershipsClient } from "./memberships-client";

export const metadata: Metadata = {
  title: "NeXusTC - Membresias",
};

export default function Page() {
  return <MembershipsClient />;
}
