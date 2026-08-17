import type { Metadata } from "next";

import GiftListClient from "../gift-list-client";

export const metadata: Metadata = {
  description: "Regalos pendientes que recibiste.",
  title: "Regalos recibidos | NeXusTC",
};

export default function GiftInboxPage() {
  return <GiftListClient mode="inbox" />;
}
