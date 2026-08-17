"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { orpc } from "@/lib/orpc";

function createGiftActionKey(action: string, giftId: string) {
  return `gift-${action}-${giftId}-${crypto.randomUUID()}`;
}

export default function GiftDetailClient({ giftId }: { giftId: string }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const actionKeys = useRef(new Map<string, string>());
  const getActionKey = (action: string) => {
    const key = actionKeys.current.get(action);
    if (key) {
      return key;
    }
    const next = createGiftActionKey(action, giftId);
    actionKeys.current.set(action, next);
    return next;
  };
  const detail = useQuery(
    orpc.gifts.detail.queryOptions({ input: { giftId } })
  );
  const accept = useMutation(
    orpc.gifts.accept.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async (result) => {
        setMessage(
          result.replayed
            ? "Recuperamos tu respuesta anterior."
            : "Regalo aceptado: la transferencia es irreversible."
        );
        await queryClient.invalidateQueries({ queryKey: ["gifts"] });
      },
    })
  );
  const reject = useMutation(
    orpc.gifts.reject.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: () =>
        setMessage("Regalo rechazado; ningún activo cambió de dueño."),
    })
  );
  const cancel = useMutation(
    orpc.gifts.cancel.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: () =>
        setMessage("Regalo cancelado; ningún activo cambió de dueño."),
    })
  );
  const { data } = detail;

  return (
    <main className="container max-w-3xl space-y-6 py-10">
      <Link className="text-primary text-sm underline" href="/cards/gifts">
        ← Volver a regalos
      </Link>
      <header className="space-y-2">
        <p className="font-semibold text-primary text-xs uppercase tracking-[0.24em]">
          Detalle privado
        </p>
        <h1 className="font-black text-4xl tracking-tight">Regalo {giftId}</h1>
        <p className="text-muted-foreground">
          Es una transferencia gratuita, sin Eteris ni precio. Los términos
          enviados no pueden editarse.
        </p>
      </header>
      {detail.isLoading ? <p aria-live="polite">Cargando detalle…</p> : null}
      {detail.error ? (
        <p className="text-destructive">No pudimos cargar este regalo.</p>
      ) : null}
      {data ? (
        <>
          <section
            className="space-y-3 rounded-3xl border bg-card/70 p-6"
            aria-label="Activos del regalo"
          >
            <div className="flex flex-wrap justify-between gap-2">
              <h2 className="font-bold text-2xl">Activos exactos</h2>
              <span className="rounded-full border px-3 py-1 font-semibold text-sm">
                {data.state}
              </span>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {data.assets.map((asset) => (
                <li
                  className="rounded-2xl border p-4"
                  key={`${asset.kind}:${asset.assetId}`}
                >
                  <p className="font-semibold">
                    {asset.side === "sender" ? "Remitente" : "Destinatario"}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {asset.kind === "card" ? "Carta" : "Pack sin abrir"}
                  </p>
                  <code className="break-all text-xs">{asset.assetId}</code>
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
              className="space-y-4 rounded-3xl border border-primary/40 bg-primary/5 p-5"
              aria-label="Acciones del regalo"
            >
              <label
                className="flex items-start gap-3 text-sm"
                htmlFor="gift-accept-confirmation"
              >
                <input
                  checked={confirmed}
                  className="mt-1 size-4"
                  id="gift-accept-confirmation"
                  onChange={(event) => setConfirmed(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  Confirmo que aceptar este regalo es explícito e irreversible y
                  que los activos pasarán a mi cuenta.
                </span>
              </label>
              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={!confirmed || accept.isPending}
                  loading={accept.isPending}
                  onClick={() =>
                    accept.mutate({
                      giftId,
                      idempotencyKey: getActionKey("accept"),
                    })
                  }
                >
                  Aceptar regalo irreversible
                </Button>
                <Button
                  disabled={reject.isPending}
                  variant="outline"
                  onClick={() =>
                    reject.mutate({
                      giftId,
                      idempotencyKey: getActionKey("reject"),
                    })
                  }
                >
                  Rechazar sin transferir
                </Button>
                <Button
                  disabled={cancel.isPending}
                  variant="outline"
                  onClick={() =>
                    cancel.mutate({
                      giftId,
                      idempotencyKey: getActionKey("cancel"),
                    })
                  }
                >
                  Cancelar si lo enviaste
                </Button>
              </div>
            </section>
          ) : null}
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
