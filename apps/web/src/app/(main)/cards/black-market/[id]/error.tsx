"use client";

import { Button } from "@/components/ui/button";

export default function BlackMarketDetailError({
  reset,
}: {
  reset: () => void;
}) {
  return (
    <main className="container space-y-4 py-10" role="alert">
      <h1 className="font-black text-3xl">
        No pudimos cargar esta publicación
      </h1>
      <p className="text-muted-foreground">
        Puede haber terminado, expirado o estar temporalmente no disponible.
      </p>
      <Button onClick={reset} type="button">
        Reintentar
      </Button>
    </main>
  );
}
