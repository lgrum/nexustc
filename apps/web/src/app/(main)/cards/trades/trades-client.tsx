"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState } from "react";
import type { FormEvent } from "react";

import { AssetPicker } from "@/components/collectibles/asset-picker";
import type { CollectibleAssetOption } from "@/components/collectibles/asset-picker";
import { ParticipantPicker } from "@/components/collectibles/participant-picker";
import type { CollectibleParticipant } from "@/components/collectibles/participant-picker";
import { Button } from "@/components/ui/button";
import { orpc } from "@/lib/orpc";

function references(assets: CollectibleAssetOption[]) {
  return assets.map(({ assetId, kind }) => ({ assetId, kind }));
}

export default function TradesClient() {
  const [recipient, setRecipient] = useState<CollectibleParticipant | null>(
    null
  );
  const [proposerAssets, setProposerAssets] = useState<
    CollectibleAssetOption[]
  >([]);
  const [recipientAssets, setRecipientAssets] = useState<
    CollectibleAssetOption[]
  >([]);
  const [message, setMessage] = useState<string | null>(null);
  const sendKey = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const eligible = useQuery(orpc.trades.eligible.queryOptions());
  const recipientEligible = useQuery({
    ...orpc.trades.eligibleForParticipant.queryOptions({
      input: { userId: recipient?.id ?? "unselected" },
    }),
    enabled: Boolean(recipient),
  });
  const inbox = useQuery(
    orpc.trades.inbox.queryOptions({ input: { limit: 8, state: "sent" } })
  );
  const sent = useQuery(
    orpc.trades.sent.queryOptions({ input: { limit: 8, state: "sent" } })
  );
  const send = useMutation(
    orpc.trades.send.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async (result) => {
        setMessage(
          result.replayed
            ? "La oferta ya estaba enviada; recuperamos el resultado."
            : "Oferta enviada. Todos tus activos quedaron en custodia privada."
        );
        // oRPC keys start with the procedure path array, so a string like
        // ["trades"] never matches. Invalidate via the domain's partial-match
        // key to refresh inbox/sent/eligible readers.
        await queryClient.invalidateQueries({ queryKey: orpc.trades.key() });
      },
    })
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (
      !recipient ||
      proposerAssets.length === 0 ||
      recipientAssets.length === 0
    ) {
      setMessage(
        "Selecciona una persona y al menos un coleccionable por cada lado."
      );
      return;
    }
    sendKey.current ??= `trade-send-${crypto.randomUUID()}`;
    send.mutate({
      idempotencyKey: sendKey.current,
      proposerAssets: references(proposerAssets),
      recipientAssets: references(recipientAssets),
      recipientUserId: recipient.id,
    });
  }

  return (
    <main className="container space-y-10 py-10">
      <header className="max-w-3xl space-y-3">
        <p className="font-semibold text-primary text-xs uppercase tracking-[0.24em]">
          Intercambios privados
        </p>
        <h1 className="font-black text-4xl tracking-tight">
          Arma una oferta desde los inventarios
        </h1>
        <p className="text-muted-foreground">
          Elige a la persona y los coleccionables de cada lado. Al enviar, los
          términos quedan fijados durante siete días.
        </p>
        <nav
          className="flex flex-wrap gap-2"
          aria-label="Secciones de intercambios"
        >
          <Link
            className="rounded-full border px-4 py-2 font-semibold text-sm"
            href="/cards/trades/inbox"
          >
            Bandeja de entrada
          </Link>
          <Link
            className="rounded-full border px-4 py-2 font-semibold text-sm"
            href="/cards/trades/sent"
          >
            Enviadas
          </Link>
        </nav>
      </header>
      <form
        className="grid gap-5 rounded-3xl border bg-card/70 p-6 lg:grid-cols-2"
        onSubmit={submit}
      >
        <div className="space-y-2 lg:col-span-2">
          <h2 className="font-bold text-2xl">Componer oferta</h2>
          <p className="text-muted-foreground text-sm">
            Puedes seleccionar entre 1 y 50 cartas o packs sin abrir por lado.
          </p>
        </div>
        <div className="lg:col-span-2">
          <ParticipantPicker
            onChange={(participant) => {
              setRecipient(participant);
              setRecipientAssets([]);
              sendKey.current = null;
            }}
            value={recipient}
          />
        </div>
        <AssetPicker
          label="Lo que ofreces"
          loading={eligible.isLoading}
          onChange={(assets) => {
            setProposerAssets(assets);
            sendKey.current = null;
          }}
          options={(eligible.data ?? []) as CollectibleAssetOption[]}
          selected={proposerAssets}
        />
        <AssetPicker
          emptyMessage={
            recipient
              ? "Esta cuenta no tiene coleccionables transferibles disponibles."
              : "Selecciona primero a la persona destinataria."
          }
          label="Lo que solicitas"
          loading={recipientEligible.isLoading}
          onChange={(assets) => {
            setRecipientAssets(assets);
            sendKey.current = null;
          }}
          options={(recipientEligible.data ?? []) as CollectibleAssetOption[]}
          selected={recipientAssets}
        />
        <div className="space-y-3 lg:col-span-2">
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
            Enviar oferta inmutable
          </Button>
        </div>
      </form>
      <section
        className="grid gap-6 lg:grid-cols-2"
        aria-label="Ofertas pendientes"
      >
        <OfferList
          error={inbox.error}
          items={inbox.data?.items ?? []}
          loading={inbox.isLoading}
          title="Recibidas"
        />
        <OfferList
          error={sent.error}
          items={sent.data?.items ?? []}
          loading={sent.isLoading}
          title="Enviadas"
        />
      </section>
    </main>
  );
}

function OfferList({
  error,
  items,
  loading,
  title,
}: {
  error: Error | null;
  items: {
    assetCount?: number;
    expiresAt: Date;
    id: string;
    proposerAssetCount?: number;
    recipientAssetCount?: number;
  }[];
  loading: boolean;
  title: string;
}) {
  return (
    <section className="space-y-3" aria-live="polite">
      <h2 className="font-bold text-2xl">{title}</h2>
      {loading ? (
        <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">
          Cargando ofertas…
        </p>
      ) : error ? (
        <p className="rounded-2xl border border-destructive/40 p-6 text-destructive">
          No pudimos cargar las ofertas.
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">
          No hay ofertas pendientes.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li className="rounded-2xl border bg-card/60 p-4" key={item.id}>
              <Link
                className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={`/cards/trades/${item.id}`}
              >
                <span className="font-semibold">Intercambio pendiente</span>
                <span className="block text-muted-foreground text-sm">
                  {item.proposerAssetCount ?? item.assetCount ?? 1} por{" "}
                  {item.recipientAssetCount ?? item.assetCount ?? 1}{" "}
                  coleccionables
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
