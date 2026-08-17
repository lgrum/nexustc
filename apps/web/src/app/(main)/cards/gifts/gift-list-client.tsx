"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { orpc } from "@/lib/orpc";

export default function GiftListClient({ mode }: { mode: "inbox" | "sent" }) {
  const query = useQuery(
    mode === "inbox"
      ? orpc.gifts.inbox.queryOptions({ input: { limit: 30, state: "sent" } })
      : orpc.gifts.sent.queryOptions({ input: { limit: 30, state: "sent" } })
  );
  const title = mode === "inbox" ? "Regalos recibidos" : "Regalos enviados";
  return (
    <main className="container space-y-6 py-10">
      <header className="space-y-2">
        <Link className="text-primary text-sm underline" href="/cards/gifts">
          ← Volver a regalos
        </Link>
        <h1 className="font-black text-4xl tracking-tight">{title}</h1>
        <p className="text-muted-foreground">
          Los regalos son transferencias gratuitas. Solo se transfieren al
          aceptar explícitamente y vencen a los siete días.
        </p>
      </header>
      {query.isLoading ? <p aria-live="polite">Cargando regalos…</p> : null}
      {query.error ? (
        <p className="text-destructive">No pudimos cargar esta bandeja.</p>
      ) : null}
      {query.data?.items.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-8 text-muted-foreground">
          No hay regalos pendientes.
        </p>
      ) : null}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {query.data?.items.map((item) => (
          <li className="rounded-3xl border bg-card/70 p-5" key={item.id}>
            <Link
              className="block space-y-2 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={`/cards/gifts/${item.id}`}
            >
              <h2 className="font-bold">Regalo {item.id}</h2>
              <p className="text-muted-foreground text-sm">
                {item.assetCount} activos · Vence{" "}
                {new Date(item.expiresAt).toLocaleDateString("es-AR")}
              </p>
              <span className="font-semibold text-primary text-sm">
                Ver detalle
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
