import type { Metadata } from "next";
import Link from "next/link";

import { CollectibleFreezesClient } from "./freezes-client";

export const metadata: Metadata = {
  title: "Congelamientos de coleccionables | NeXusTC",
};

export default function CollectibleFreezesPage() {
  return (
    <main className="max-w-3xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="font-semibold text-3xl tracking-tight">
          Congelamientos y restauraciones
        </h1>
        <p className="text-muted-foreground">
          Congelar conserva la propiedad y el Mint Number. Cada acción exige una
          versión, un motivo y una decisión explícita sobre la custodia.
        </p>
      </header>
      <div className="rounded-lg border p-5 text-sm">
        <p>
          Selecciona el activo desde Cartas, Packs, Mercado, Tienda o Gachapon
          para ejecutar la acción autorizada. Las revisiones deshabilitadas
          bloquean emisión, apertura y transferencias sin volver a sortear.
        </p>
        <Link
          className="mt-4 inline-block underline"
          href="/admin/collectibles/audits"
        >
          Ver el historial de acciones
        </Link>
      </div>
      <CollectibleFreezesClient />
    </main>
  );
}
