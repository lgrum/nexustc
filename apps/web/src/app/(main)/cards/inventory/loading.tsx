export default function Loading() {
  return (
    <main className="container space-y-6 py-10" aria-busy="true">
      <div className="h-10 w-56 animate-pulse rounded-lg bg-muted" />
      <p className="text-muted-foreground">Cargando tu inventario…</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            className="aspect-[4/5] animate-pulse rounded-3xl border bg-muted/60"
            key={index}
          />
        ))}
      </div>
    </main>
  );
}
