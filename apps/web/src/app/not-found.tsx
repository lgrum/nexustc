import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-[60vh] place-content-center gap-4 px-4 text-center">
      <p className="font-semibold text-primary text-sm">404</p>
      <h1 className="font-bold text-3xl">Pagina no encontrada</h1>
      <p className="text-muted-foreground">
        El contenido que buscas no existe o ya no esta disponible.
      </p>
      <Button
        className="mx-auto"
        nativeButton={false}
        render={<Link href="/" />}
      >
        Volver al inicio
      </Button>
    </main>
  );
}
