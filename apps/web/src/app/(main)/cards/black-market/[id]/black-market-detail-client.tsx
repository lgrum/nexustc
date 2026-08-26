"use client";

import { collectibleRarityLabel } from "@repo/shared/collectibles";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCollectibleDateTime } from "@/lib/format-date";
import { orpc } from "@/lib/orpc";

import { isStaleListingError, stableAttemptKey } from "../black-market-client";

export default function BlackMarketDetailClient({
  listingId,
}: {
  listingId: string;
}) {
  const queryClient = useQueryClient();
  const purchaseAttempt = useRef<{
    fingerprint: string;
    key: string;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const detailQuery = orpc.blackMarket.detail.queryOptions({
    input: { listingId },
  });
  const detail = useQuery(detailQuery);
  const purchase = useMutation(
    orpc.blackMarket.purchase.mutationOptions({
      onError: (error) => {
        setConfirming(false);
        if (isStaleListingError(error)) {
          purchaseAttempt.current = null;
          setMessage(
            "La publicación cambió. Actualizamos el precio; confirma nuevamente antes de pagar."
          );
          void queryClient.invalidateQueries({
            queryKey: detailQuery.queryKey,
          });
          void detail.refetch();
          return;
        }
        setMessage(
          `${error.message} Confirma nuevamente el precio vigente si deseas reintentar.`
        );
      },
      onSuccess: async (result) => {
        purchaseAttempt.current = null;
        setConfirming(false);
        setMessage(
          result.replayed
            ? "La compra ya estaba confirmada."
            : "Compra completada y lote transferido."
        );
        await queryClient.invalidateQueries({ queryKey: detailQuery.queryKey });
      },
    })
  );
  const listing = detail.data;

  if (detail.isLoading) {
    return (
      <main className="container py-10 text-muted-foreground">
        Cargando términos…
      </main>
    );
  }
  if (detail.isError || !listing) {
    return (
      <main className="container space-y-4 py-10">
        <h1 className="font-black text-3xl">Publicación no disponible</h1>
        <p className="text-muted-foreground">
          La publicación pudo venderse, cancelarse o expirar. Los activos ya no
          se muestran.
        </p>
        <Link
          className="font-semibold text-primary underline"
          href="/cards/black-market"
        >
          Volver al Mercado Negro
        </Link>
      </main>
    );
  }

  return (
    <main className="container space-y-8 py-10">
      <Link
        className="font-semibold text-primary underline"
        href="/cards/black-market"
      >
        ← Volver al Mercado Negro
      </Link>
      <header className="space-y-3">
        <p className="font-semibold text-primary text-xs uppercase tracking-[0.24em]">
          Términos inmutables
        </p>
        <h1 className="font-black text-4xl">
          {listing.isBundle ? "Lote completo" : "Activo en venta"}
        </h1>
        <p className="text-muted-foreground">
          {listing.assetCount} activo{listing.assetCount === 1 ? "" : "s"} ·
          vence {formatCollectibleDateTime(listing.expiresAt)}. Comprar libera
          la custodia y transfiere todo en una sola operación.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>
            Precio:{" "}
            <span className="text-primary">{listing.askingPrice} Eteris</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul
            aria-label="Composición del lote"
            className="grid gap-2 sm:grid-cols-2"
          >
            {listing.assets.map((asset) => (
              <li
                className="rounded-xl border p-3 text-sm"
                key={`${asset.kind}:${asset.assetId}`}
              >
                <strong>{asset.kind === "card" ? "Carta" : "Pack"}</strong>
                {asset.characterName ? ` · ${asset.characterName}` : ""}
                {asset.rarity
                  ? ` · ${collectibleRarityLabel(asset.rarity)}`
                  : ""}
                {asset.mintNumber ? ` · Mint #${asset.mintNumber}` : ""}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-sm">
            No se muestra identidad, billetera ni texto del vendedor. El precio
            completo se acredita a la persona vendedora; no hay comisión.
          </p>
          <Button
            disabled={purchase.isPending}
            loading={purchase.isPending}
            onClick={() => setConfirming(true)}
            type="button"
          >
            Comprar lote completo
          </Button>
        </CardContent>
      </Card>
      {confirming ? (
        <div
          aria-labelledby="detail-confirmation"
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm"
          role="dialog"
        >
          <div className="w-full max-w-md space-y-5 rounded-2xl border bg-card p-6 shadow-xl">
            <h2 className="font-bold text-2xl" id="detail-confirmation">
              ¿Confirmar compra?
            </h2>
            <p className="text-muted-foreground text-sm">
              Confirma que pagarás {listing.askingPrice} Eteris por los{" "}
              {listing.assetCount} activos completos.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => setConfirming(false)}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              <Button
                disabled={purchase.isPending}
                loading={purchase.isPending}
                onClick={() =>
                  purchase.mutate({
                    expectedPrice: listing.askingPrice,
                    expectedVersion: listing.version,
                    idempotencyKey: stableAttemptKey(
                      "black-market-purchase",
                      `${listingId}:${listing.askingPrice}:${listing.version}`,
                      purchaseAttempt
                    ),
                    listingId,
                  })
                }
                type="button"
              >
                Confirmar y pagar
              </Button>
            </div>
          </div>
        </div>
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
