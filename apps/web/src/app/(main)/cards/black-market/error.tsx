"use client";

import { Button } from "@/components/ui/button";

export default function BlackMarketError({ reset }: { reset: () => void }) {
  return (
    <main className="container space-y-4 py-10" role="alert">
      <h1 className="font-black text-3xl">
        No pudimos cargar el Mercado Negro
      </h1>
      <p className="text-muted-foreground">
        Intenta nuevamente. Tus publicaciones, pagos y activos no cambian por
        volver a cargar esta pantalla.
      </p>
      <Button onClick={reset} type="button">
        Reintentar
      </Button>
    </main>
  );
}
