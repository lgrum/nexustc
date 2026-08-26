"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { formatCollectibleDateTime } from "@/lib/format-date";
import { orpc } from "@/lib/orpc";

const PAGE_SIZE = 30;

export default function TradeListClient({ mode }: { mode: "inbox" | "sent" }) {
  const listInput = { limit: PAGE_SIZE, state: "sent" as const };
  const query = useInfiniteQuery(
    mode === "inbox"
      ? orpc.trades.inbox.infiniteOptions({
          // pageParam threads the server cursor back into the RPC input.
          input: (pageParam: string | undefined) => ({
            ...listInput,
            ...(pageParam ? { cursor: pageParam } : {}),
          }),
          getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
          initialPageParam: undefined as string | undefined,
        })
      : orpc.trades.sent.infiniteOptions({
          input: (pageParam: string | undefined) => ({
            ...listInput,
            ...(pageParam ? { cursor: pageParam } : {}),
          }),
          getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
          initialPageParam: undefined as string | undefined,
        })
  );
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const title = mode === "inbox" ? "Ofertas recibidas" : "Ofertas enviadas";
  return (
    <main className="container space-y-6 py-10">
      <header className="space-y-2">
        <Link className="text-primary text-sm underline" href="/cards/trades">
          ← Volver a intercambios
        </Link>
        <h1 className="font-black text-4xl tracking-tight">{title}</h1>
        <p className="text-muted-foreground">
          Las ofertas muestran solo un resumen. Abre el detalle para ver los dos
          activos privados.
        </p>
      </header>
      {query.isLoading ? <p aria-live="polite">Cargando ofertas…</p> : null}
      {query.error ? (
        <p className="text-destructive">No pudimos cargar esta bandeja.</p>
      ) : null}
      {items.length === 0 && !query.isLoading ? (
        <p className="rounded-2xl border border-dashed p-8 text-muted-foreground">
          No hay ofertas pendientes.
        </p>
      ) : null}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li className="rounded-3xl border bg-card/70 p-5" key={item.id}>
            <Link
              className="block space-y-2 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={`/cards/trades/${item.id}`}
            >
              <h2 className="font-bold">Intercambio pendiente</h2>
              <p className="text-muted-foreground text-sm">
                Vence {formatCollectibleDateTime(item.expiresAt)}
              </p>
              <span className="font-semibold text-primary text-sm">
                Ver detalle
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {query.hasNextPage ? (
        <Button
          disabled={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
          variant="outline"
        >
          {query.isFetchingNextPage ? "Cargando…" : "Ver más"}
        </Button>
      ) : null}
    </main>
  );
}
