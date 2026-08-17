export default function BlackMarketLoading() {
  return (
    <main className="container space-y-6 py-10" aria-busy="true">
      <div className="h-10 w-2/3 animate-pulse rounded-xl bg-muted" />
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {["a", "b", "c"].map((key) => (
          <div className="h-44 animate-pulse rounded-2xl bg-muted" key={key} />
        ))}
      </div>
      <p className="text-muted-foreground text-sm">Cargando publicaciones…</p>
    </main>
  );
}
