import type { Metadata } from "next";

import { CollectibleOfferClosureClient } from "../offers/offer-closure-client";

export const metadata: Metadata = {
  title: "Intercambios de coleccionables | NeXusTC",
};

export default function CollectibleTradesPage() {
  return (
    <main className="max-w-3xl space-y-6 p-6">
      <h1 className="font-semibold text-3xl tracking-tight">Intercambios</h1>
      <p className="text-muted-foreground">
        Revisión administrativa de ofertas, custodia y cierres. Cerrar una
        oferta libera custodia y no transfiere activos ni publica Eteris.
      </p>
      <CollectibleOfferClosureClient />
    </main>
  );
}
