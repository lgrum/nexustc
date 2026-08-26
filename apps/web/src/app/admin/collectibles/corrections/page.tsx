import type { Metadata } from "next";

import { CollectibleCorrectionsClient } from "./corrections-client";

export const metadata: Metadata = {
  title: "Correcciones excepcionales | NeXusTC",
};

export default function CollectibleCorrectionsPage() {
  return (
    <main className="max-w-3xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="font-semibold text-3xl tracking-tight">
          Correcciones excepcionales
        </h1>
        <p className="text-muted-foreground">
          Las transferencias de propiedad y las reversiones Eteris son comandos
          separados. Ambos requieren autorización de corrección, motivo, versión
          o secuencia esperada e idempotencia.
        </p>
      </header>
      <div className="rounded-lg border p-5 text-sm">
        <p>
          La emisión excepcional sigue respetando el techo de suministro. Una
          reversión solo acepta fallas de plataforma verificadas y nunca cambia
          silenciosamente la propiedad de una carta o Pack.
        </p>
      </div>
      <CollectibleCorrectionsClient />
    </main>
  );
}
