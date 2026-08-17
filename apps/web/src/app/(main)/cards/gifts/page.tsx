import type { Metadata } from "next";

import GiftsClient from "./gifts-client";

export const metadata: Metadata = {
  description: "Envía y acepta regalos gratuitos de cartas y Packs.",
  title: "Regalos | NeXusTC",
};

export default function GiftsPage() {
  return <GiftsClient />;
}
