export default function GiftsLoading() {
  return (
    <main className="container space-y-4 py-10" aria-busy="true">
      <div className="h-10 w-64 animate-pulse rounded-xl bg-muted" />
      <div className="h-48 animate-pulse rounded-3xl bg-muted" />
    </main>
  );
}
