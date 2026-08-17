export default function BlackMarketDetailLoading() {
  return (
    <main className="container space-y-5 py-10" aria-busy="true">
      <div className="h-10 w-2/3 animate-pulse rounded-xl bg-muted" />
      <div className="h-64 animate-pulse rounded-3xl bg-muted" />
      <p className="text-muted-foreground text-sm">Cargando términos…</p>
    </main>
  );
}
