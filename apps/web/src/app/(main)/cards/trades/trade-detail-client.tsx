"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState } from "react";

import { AssetPicker } from "@/components/collectibles/asset-picker";
import type { CollectibleAssetOption } from "@/components/collectibles/asset-picker";
import { Button } from "@/components/ui/button";
import { orpc } from "@/lib/orpc";

function createTradeIdempotencyKey() {
  return `trade-action-${crypto.randomUUID()}`;
}

export default function TradeDetailClient({ offerId }: { offerId: string }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [counterProposerAssets, setCounterProposerAssets] = useState<
    CollectibleAssetOption[]
  >([]);
  const [counterRecipientAssets, setCounterRecipientAssets] = useState<
    CollectibleAssetOption[]
  >([]);
  const actionKeys = useRef(new Map<string, string>());
  const getActionKey = (actionName: string) => {
    const key = `${offerId}:${actionName}`;
    const existing = actionKeys.current.get(key);
    if (existing) {
      return existing;
    }
    const next = createTradeIdempotencyKey();
    actionKeys.current.set(key, next);
    return next;
  };
  const detail = useQuery(
    orpc.trades.detail.queryOptions({ input: { offerId } })
  );
  const eligible = useQuery(orpc.trades.eligible.queryOptions());
  const counterpartyEligible = useQuery({
    ...orpc.trades.eligibleForParticipant.queryOptions({
      input: { userId: detail.data?.counterpartyUserId ?? "unselected" },
    }),
    enabled: Boolean(detail.data?.counterpartyUserId),
  });
  const action = useMutation(
    orpc.trades.accept.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async (result) => {
        setMessage(
          result.replayed
            ? "Recuperamos tu respuesta anterior."
            : `Oferta ${result.state}.`
        );
        await queryClient.invalidateQueries({ queryKey: ["trades"] });
      },
    })
  );
  const reject = useMutation(
    orpc.trades.reject.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: () => setMessage("Oferta rechazada."),
    })
  );
  const cancel = useMutation(
    orpc.trades.cancel.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: () => setMessage("Oferta cancelada."),
    })
  );
  const counter = useMutation(
    orpc.trades.counteroffer.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: () => setMessage("La contraoferta creó una nueva oferta."),
    })
  );
  const block = useMutation(
    orpc.trades.block.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async () => {
        setMessage(
          "La cuenta quedó bloqueada y sus ofertas pendientes se cerraron."
        );
        await queryClient.invalidateQueries({ queryKey: ["trades"] });
      },
    })
  );
  const { data } = detail;

  return (
    <main className="container max-w-3xl space-y-6 py-10">
      <Link className="text-primary text-sm underline" href="/cards/trades">
        ← Volver a intercambios
      </Link>
      <header className="space-y-2">
        <p className="font-semibold text-primary text-xs uppercase tracking-[0.24em]">
          Detalle privado
        </p>
        <h1 className="font-black text-4xl tracking-tight">
          Detalle del intercambio
        </h1>
        <p className="text-muted-foreground">
          Los términos se fijaron al enviar y no pueden editarse.
        </p>
      </header>
      {detail.isLoading ? <p aria-live="polite">Cargando detalle…</p> : null}
      {detail.error ? (
        <p className="text-destructive">No pudimos cargar esta oferta.</p>
      ) : null}
      {data ? (
        <>
          <section
            className="space-y-3 rounded-3xl border bg-card/70 p-6"
            aria-label="Activos del intercambio"
          >
            <div className="flex flex-wrap justify-between gap-2">
              <h2 className="font-bold text-2xl">Activos exactos</h2>
              <span className="rounded-full border px-3 py-1 font-semibold text-sm">
                {data.state}
              </span>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {data.assets.map((asset, index) => (
                <li
                  className="rounded-2xl border p-4"
                  key={`${asset.side}:${asset.kind}:${asset.assetId}`}
                >
                  <p className="font-semibold">
                    {asset.kind === "card" ? "Carta" : "Pack sin abrir"}{" "}
                    {index + 1}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {asset.side === "proposer" ? "Ofrecido" : "Solicitado"}
                  </p>
                </li>
              ))}
            </ul>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Vence</dt>
                <dd>{new Date(data.expiresAt).toLocaleString("es-AR")}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Versión</dt>
                <dd>{data.version}</dd>
              </div>
            </dl>
          </section>
          {data.state === "sent" ? (
            <section
              className="flex flex-wrap gap-3"
              aria-label="Acciones de oferta"
            >
              <Button
                disabled={action.isPending}
                loading={action.isPending}
                onClick={() =>
                  action.mutate({
                    idempotencyKey: getActionKey("accept"),
                    offerId,
                  })
                }
              >
                Aceptar intercambio
              </Button>
              <Button
                disabled={reject.isPending}
                variant="outline"
                onClick={() =>
                  reject.mutate({
                    idempotencyKey: getActionKey("reject"),
                    offerId,
                  })
                }
              >
                Rechazar
              </Button>
              <Button
                disabled={cancel.isPending}
                variant="outline"
                onClick={() =>
                  cancel.mutate({
                    idempotencyKey: getActionKey("cancel"),
                    offerId,
                  })
                }
              >
                Cancelar si la enviaste
              </Button>
            </section>
          ) : null}
          {data.state === "sent" ? (
            <form
              className="space-y-3 rounded-3xl border border-dashed p-5"
              onSubmit={(event) => {
                event.preventDefault();
                const [proposerAsset] = counterProposerAssets;
                const [recipientAsset] = counterRecipientAssets;
                if (!proposerAsset || !recipientAsset) {
                  setMessage(
                    "Selecciona una carta para cada lado de la contraoferta."
                  );
                  return;
                }
                counter.mutate({
                  idempotencyKey: getActionKey("counter"),
                  offerId,
                  proposerAsset: {
                    assetId: proposerAsset.assetId,
                    kind: proposerAsset.kind,
                  },
                  recipientAsset: {
                    assetId: recipientAsset.assetId,
                    kind: recipientAsset.kind,
                  },
                });
              }}
            >
              <h2 className="font-bold text-xl">Crear contraoferta</h2>
              <p className="text-muted-foreground text-sm">
                La contraoferta siempre es una nueva propuesta y libera la
                anterior.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <AssetPicker
                  label="Lo que ofreces"
                  loading={eligible.isLoading}
                  max={1}
                  onChange={setCounterProposerAssets}
                  options={(eligible.data ?? []) as CollectibleAssetOption[]}
                  selected={counterProposerAssets}
                />
                <AssetPicker
                  label="Lo que solicitas"
                  loading={counterpartyEligible.isLoading}
                  max={1}
                  onChange={setCounterRecipientAssets}
                  options={
                    (counterpartyEligible.data ??
                      []) as CollectibleAssetOption[]
                  }
                  selected={counterRecipientAssets}
                />
              </div>
              <Button disabled={counter.isPending} type="submit">
                Enviar contraoferta
              </Button>
            </form>
          ) : null}
          <section
            className="space-y-3 rounded-3xl border border-dashed p-5"
            aria-label="Controles de privacidad"
          >
            <h2 className="font-bold text-xl">Privacidad</h2>
            <p className="text-muted-foreground text-sm">
              Bloquear una cuenta evita nuevas ofertas y cierra de forma segura
              las que sigan pendientes entre ambas cuentas.
            </p>
            <Button
              disabled={block.isPending}
              onClick={() => block.mutate({ userId: data.counterpartyUserId })}
              type="button"
              variant="outline"
            >
              Bloquear a la otra cuenta
            </Button>
          </section>
        </>
      ) : null}
      {message ? (
        <p
          aria-live="polite"
          className="rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm"
        >
          {message}
        </p>
      ) : null}
    </main>
  );
}
