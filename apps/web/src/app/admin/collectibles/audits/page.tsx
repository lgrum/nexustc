import type { Metadata } from "next";

import { orpcClient } from "@/lib/orpc";

import { CollectibleAuditClient } from "./audit-client";

export const metadata: Metadata = {
  title: "Auditoría de coleccionables | NeXusTC",
};

export default async function CollectibleAuditPage() {
  const initialAudit = await orpcClient.collectiblesAdmin.audit.list({
    limit: 25,
  });
  return (
    <main className="space-y-6 p-6">
      <header className="space-y-2">
        <p className="text-muted-foreground text-sm">
          Solo personal autorizado
        </p>
        <h1 className="font-semibold text-3xl tracking-tight">
          Auditoría administrativa
        </h1>
        <p className="text-muted-foreground">
          Historial append-only con cursor estable. La respuesta omite
          resultados de Packs no abiertos y otros secretos operativos.
        </p>
      </header>
      <CollectibleAuditClient initialAudit={initialAudit} />
    </main>
  );
}
