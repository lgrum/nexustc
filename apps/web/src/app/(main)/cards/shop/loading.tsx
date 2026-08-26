export default function Loading() {
  return (
    <main className="container space-y-8 py-10" aria-busy="true">
      <header className="space-y-3">
        <p className="font-semibold text-primary text-xs uppercase tracking-[0.24em]">
          Adquisición oficial
        </p>
        <h1 className="font-black text-4xl tracking-tight">Tienda oficial</h1>
      </header>
      <p className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
        Cargando ofertas…
      </p>
    </main>
  );
}
