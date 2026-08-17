import type { Metadata } from "next";

import GiftListClient from "../gift-list-client";

export const metadata: Metadata = {
  description: "Regalos que enviaste.",
  title: "Regalos enviados | NeXusTC",
};

export default function GiftSentPage() {
  return <GiftListClient mode="sent" />;
}
