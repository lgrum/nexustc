"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { orpc } from "@/lib/orpc";

type AssetKind = "card" | "pack";
type DraftAsset = { assetId: string; kind: AssetKind };

function createGiftIdempotencyKey() {
  return `gift-send-${crypto.randomUUID()}`;
}

export default function GiftsClient() {
  const [recipientUserId, setRecipientUserId] = useState("");
  const [assets, setAssets] = useState<DraftAsset[]>([
    { assetId: "", kind: "card" },
  ]);
  const [message, setMessage] = useState<string | null>(null);
  const sendKey = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const eligible = useQuery(orpc.gifts.eligible.queryOptions());
  const inbox = useQuery(
    orpc.gifts.inbox.queryOptions({ input: { limit: 8, state: "sent" } })
  );
  const sent = useQuery(
    orpc.gifts.sent.queryOptions({ input: { limit: 8, state: "sent" } })
  );
  const send = useMutation(
    orpc.gifts.send.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async (result) => {
        setMessage(
          result.replayed
            ? "El regalo ya estaba enviado; recuperamos el resultado."
            : "Regalo enviado. Es gratuito y tus activos quedaron en custodia privada."
        );
        await queryClient.invalidateQueries({ queryKey: ["gifts"] });
      },
    })
  );
  const eligibleKeys = new Set(
    (eligible.data ?? []).map((asset) => `${asset.kind}:${asset.assetId}`)
  );

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const selected = assets.map((asset) => ({
      assetId: asset.assetId.trim(),
      kind: asset.kind,
    }));
    const ids = selected.map((asset) => asset.assetId);
    if (!recipientUserId.trim() || ids.some((id) => !id)) {
      setMessage("Completa la cuenta destinataria y todos los IDs exactos.");
      return;
    }
    if (new Set(ids).size !== ids.length) {
      setMessage("No puedes repetir un activo dentro del regalo.");
      return;
    }
    if (
      selected.some(
        (asset) => !eligibleKeys.has(`${asset.kind}:${asset.assetId}`)
      )
    ) {
      setMessage("Una carta o Pack ya no está disponible para regalarse.");
      return;
    }
    sendKey.current ??= createGiftIdempotencyKey();
    send.mutate({
      assets: selected,
      idempotencyKey: sendKey.current,
      recipientUserId: recipientUserId.trim(),
    });
  }

  return (
    <main className="container space-y-10 py-10">
      <header className="max-w-3xl space-y-3">
        <p className="font-semibold text-primary text-xs uppercase tracking-[0.24em]">
          Regalos privados
        </p>
        <h1 className="font-black text-4xl tracking-tight">
          Envía de 1 a 50 coleccionables gratis
        </h1>
        <p className="text-muted-foreground">
          Un regalo no es un intercambio ni una venta a precio cero. El borrador
          no reserva nada; al enviar, los términos quedan fijados durante siete
          días y la persona destinataria debe aceptar la transferencia.
        </p>
        <nav className="flex flex-wrap gap-2" aria-label="Secciones de regalos">
          <Link
            className="rounded-full border px-4 py-2 font-semibold text-sm"
            href="/cards/gifts/inbox"
          >
            Bandeja de entrada
          </Link>
          <Link
            className="rounded-full border px-4 py-2 font-semibold text-sm"
            href="/cards/gifts/sent"
          >
            Enviados
          </Link>
        </nav>
      </header>

      <form
        className="space-y-5 rounded-3xl border bg-card/70 p-6"
        onSubmit={submit}
      >
        <div className="space-y-2">
          <h2 className="font-bold text-2xl">Componer regalo</h2>
          <p className="text-muted-foreground text-sm">
            Solo se aceptan Cartas y Packs sin abrir transferibles que poseas.
            No hay precio, comisión, Eteris ni activos solicitados.
          </p>
        </div>
        <label
          className="block space-y-1 font-medium text-sm"
          htmlFor="gift-recipient-user-id"
        >
          ID de la cuenta destinataria
          <Input
            autoComplete="off"
            id="gift-recipient-user-id"
            onChange={(event) => setRecipientUserId(event.target.value)}
            placeholder="user_…"
            required
            value={recipientUserId}
          />
        </label>
        <fieldset className="space-y-3 rounded-2xl border p-4">
          <legend className="px-1 font-bold">Activos exactos</legend>
          <p className="text-muted-foreground text-sm">
            {assets.length}/50 activos seleccionados
          </p>
          {assets.map((asset, index) => {
            const id = `gift-asset-${index}`;
            return (
              <div
                className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[10rem_1fr_auto]"
                key={id}
              >
                <label className="space-y-1 text-sm">
                  Tipo
                  <select
                    className="h-10 w-full rounded-lg border border-input bg-background px-3"
                    onChange={(event) =>
                      setAssets((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, kind: event.target.value as AssetKind }
                            : item
                        )
                      )
                    }
                    value={asset.kind}
                  >
                    <option value="card">Carta</option>
                    <option value="pack">Pack sin abrir</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm" htmlFor={id}>
                  ID del activo
                  <Input
                    autoComplete="off"
                    id={id}
                    onChange={(event) =>
                      setAssets((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, assetId: event.target.value }
                            : item
                        )
                      )
                    }
                    placeholder="ID exacto del inventario"
                    required
                    value={asset.assetId}
                  />
                </label>
                <Button
                  aria-label={`Quitar activo ${index + 1}`}
                  disabled={assets.length <= 1}
                  onClick={() =>
                    setAssets((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index)
                    )
                  }
                  type="button"
                  variant="ghost"
                >
                  Quitar
                </Button>
              </div>
            );
          })}
          <Button
            disabled={assets.length >= 50}
            onClick={() =>
              setAssets((current) => [
                ...current,
                { assetId: "", kind: "card" },
              ])
            }
            type="button"
            variant="outline"
          >
            Añadir activo
          </Button>
        </fieldset>
        {message ? (
          <p
            aria-live="polite"
            className="rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm"
          >
            {message}
          </p>
        ) : null}
        <Button
          disabled={send.isPending}
          loading={send.isPending}
          type="submit"
        >
          Enviar regalo gratuito
        </Button>
        {send.isError ? (
          <p className="text-muted-foreground text-xs">
            Puedes corregir el problema y reintentar: conservaremos la misma
            clave para evitar un regalo duplicado.
          </p>
        ) : null}
      </form>

      <section
        className="grid gap-6 lg:grid-cols-2"
        aria-label="Regalos pendientes"
      >
        <GiftSummaryList
          error={inbox.error}
          items={inbox.data?.items ?? []}
          loading={inbox.isLoading}
          title="Recibidos"
        />
        <GiftSummaryList
          error={sent.error}
          items={sent.data?.items ?? []}
          loading={sent.isLoading}
          title="Enviados"
        />
      </section>
    </main>
  );
}

function GiftSummaryList({
  error,
  items,
  loading,
  title,
}: {
  error: Error | null;
  items: { assetCount: number; expiresAt: Date; id: string; state: string }[];
  loading: boolean;
  title: string;
}) {
  return (
    <section className="space-y-3" aria-live="polite">
      <h2 className="font-bold text-2xl">{title}</h2>
      {loading ? (
        <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">
          Cargando regalos…
        </p>
      ) : error ? (
        <p className="rounded-2xl border border-destructive/40 p-6 text-destructive">
          No pudimos cargar los regalos. Intenta nuevamente.
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">
          No hay regalos pendientes.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li className="rounded-2xl border bg-card/60 p-4" key={item.id}>
              <Link
                className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={`/cards/gifts/${item.id}`}
              >
                <span className="font-semibold">Regalo {item.id}</span>
                <span className="block text-muted-foreground text-sm">
                  {item.assetCount} activos · Estado: {item.state}
                </span>
                <span className="block text-muted-foreground text-sm">
                  Vence {new Date(item.expiresAt).toLocaleDateString("es-AR")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
