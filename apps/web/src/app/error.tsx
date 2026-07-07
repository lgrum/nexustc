"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-[60vh] place-content-center gap-4 px-4 text-center">
      <h1 className="font-bold text-3xl">Algo salio mal</h1>
      <p className="text-muted-foreground">
        No pudimos cargar esta pagina. Intenta nuevamente.
      </p>
      <div className="flex justify-center gap-3">
        <Button onClick={reset}>Reintentar</Button>
        <Button
          nativeButton={false}
          render={<Link href="/" />}
          variant="outline"
        >
          Ir al inicio
        </Button>
      </div>
    </main>
  );
}
