import type { Metadata } from "next";

import { CollectibleOfferClosureClient } from "../offers/offer-closure-client";

export const metadata: Metadata = {
  title: "Regalos de coleccionables | NeXusTC",
};

export default function CollectibleGiftsPage() {
  return (
    <main className="max-w-3xl space-y-6 p-6">
      <h1 className="font-semibold text-3xl tracking-tight">Regalos</h1>
      <p className="text-muted-foreground">
        Revisión administrativa de regalos pendientes y su custodia. Un cierre
        no acepta ni transfiere el regalo; solo libera la reserva de forma
        idempotente.
      </p>
      <CollectibleOfferClosureClient />
    </main>
  );
}
