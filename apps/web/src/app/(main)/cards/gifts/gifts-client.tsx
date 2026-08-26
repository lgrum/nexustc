"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState } from "react";

import { AssetPicker } from "@/components/collectibles/asset-picker";
import type { CollectibleAssetOption } from "@/components/collectibles/asset-picker";
import { ParticipantPicker } from "@/components/collectibles/participant-picker";
import type { CollectibleParticipant } from "@/components/collectibles/participant-picker";
import { Button } from "@/components/ui/button";
import { formatCollectibleDateTime } from "@/lib/format-date";
import { orpc } from "@/lib/orpc";

export default function GiftsClient() {
  const [recipient, setRecipient] = useState<CollectibleParticipant | null>(
    null
  );
  const [assets, setAssets] = useState<CollectibleAssetOption[]>([]);
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
        // oRPC keys start with the procedure path array, so a string like
        // ["gifts"] never matches. Invalidate via the domain's partial-match
        // key to refresh inbox/sent/eligible readers.
        await queryClient.invalidateQueries({ queryKey: orpc.gifts.key() });
      },
    })
  );

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (!recipient || assets.length === 0) {
      setMessage(
        "Selecciona una persona y al menos un coleccionable para regalar."
      );
      return;
    }
    sendKey.current ??= `gift-send-${crypto.randomUUID()}`;
    send.mutate({
      assets: assets.map(({ assetId, kind }) => ({ assetId, kind })),
      idempotencyKey: sendKey.current,
      recipientUserId: recipient.id,
    });
  }

  return (
    <main className="container space-y-10 py-10">
      <header className="max-w-3xl space-y-3">
        <p className="font-semibold text-primary text-xs uppercase tracking-[0.24em]">
          Regalos privados
        </p>
        <h1 className="font-black text-4xl tracking-tight">
          Regala desde tu inventario
        </h1>
        <p className="text-muted-foreground">
          Elige a la persona y hasta 50 coleccionables. La persona destinataria
          debe aceptar la transferencia.
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
            Solo aparecen cartas y packs sin abrir que pueden transferirse.
          </p>
        </div>
        <ParticipantPicker
          onChange={(participant) => {
            setRecipient(participant);
            sendKey.current = null;
          }}
          value={recipient}
        />
        <AssetPicker
          label="Coleccionables que regalas"
          loading={eligible.isLoading}
          onChange={(next) => {
            setAssets(next);
            sendKey.current = null;
          }}
          options={(eligible.data ?? []) as CollectibleAssetOption[]}
          selected={assets}
        />
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
  items: { assetCount: number; expiresAt: Date; id: string }[];
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
          No pudimos cargar los regalos.
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
                <span className="font-semibold">Regalo pendiente</span>
                <span className="block text-muted-foreground text-sm">
                  {item.assetCount} coleccionable
                  {item.assetCount === 1 ? "" : "s"} · vence{" "}
                  {formatCollectibleDateTime(item.expiresAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
